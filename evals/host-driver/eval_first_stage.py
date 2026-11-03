#!/usr/bin/env python3
"""Authenticate fixed first-five or remaining150 mode; default to read-only validation."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import importlib.util
import itertools
import json
import math
import os
from pathlib import Path
import re
import signal
import stat
import sys

sys.dont_write_bytecode = True

from eval_driver_runtime import read_bound_json, save, inspect_consumption, RECEIPT_LIMIT, capture_accounting_paths, verify_cleanup

HERE = Path(__file__).resolve().parent
SUITES = ('merge-gate', 'iterate', 'next-steps')
STAGE_ID = 'iterate-duplicated-control-line-aborts-slots-1-5-v1'
REMAINING_STAGE_ID = 'remaining-150-v1'
# Separate bounded shapes: 150 task references and five retained closure inventories.
REMAINING_GRANT_LIMIT = 128 * 1024
CLOSURE_INVENTORY_LIMIT = 512 * 1024
SCENARIO = 'duplicated-control-line-aborts'
CORPUS_LIMIT = 4 * 1024 * 1024
GRANT_LIMIT = 16 * 1024
REFERENCE_LIMIT = 16384
DIGEST = re.compile(r'sha256:[0-9a-f]{64}')
NAME = re.compile(r'[a-z0-9][a-z0-9-]*')
PREPARED_KEYS = {'fixture', 'projectAgents', 'projectConfig', 'prompt', 'runMetadata',
                 'trackerStub', 'buildIdentity'}
TASK_KEYS = {'suite', 'scenario', 'slot', 'projectRoot', 'attemptRoot', 'prompt',
             'runMetadata', 'profile'}
POLICY = ('workspace-write;approval-never;network-disabled;isolated-home;attempt-root-writable;'
          'ignore-user-config;ignore-rules')
DRIVER_FILES = ('evals/host-driver/run-cohorts.py', 'evals/host-driver/eval_host_worker.py',
                'evals/host-driver/eval_driver_runtime.py', 'evals/host-driver/eval_first_stage.py',
                'evals/host-run.mjs', *(f'evals/_scaffold/host-profile-{name}.mjs'
                for name in ('storage', 'cleanup', 'process', 'child')))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def keys(value, expected, label):
    require(isinstance(value, dict) and set(value) == set(expected), label + ' fields changed')


def digest(value):
    require(isinstance(value, str) and DIGEST.fullmatch(value), 'invalid trusted digest')
    return value


def canonical(value):
    require(isinstance(value, str), 'path must be a string')
    path = Path(value)
    require(path.is_absolute() and str(path) == value and path.resolve() == path,
            'expected canonical absolute path: ' + value)
    return path


def identity(path, expected):
    keys(expected, ('dev', 'ino'), 'directory identity')
    require(all(type(expected[k]) is int and expected[k] >= 0 for k in expected),
            'invalid directory identity')
    info = canonical(path).lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
            and {'dev': info.st_dev, 'ino': info.st_ino} == expected,
            'namespace directory identity changed')


def read_bytes(path, *, maximum=None):
    """Read a stable regular file without following links or blocking on special files."""
    path = canonical(str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1,
                'immutable input must be an owned single-link regular file')
        require(maximum is None or before.st_size <= maximum, 'oversize immutable input')
        data = bytearray()
        while True:
            part = os.read(fd, 65536)
            if not part:
                break
            data.extend(part)
            require(maximum is None or len(data) <= maximum, 'oversize immutable input')
        after = os.fstat(fd)
        entry = path.lstat()
        signature = lambda item: (item.st_dev, item.st_ino, item.st_size, item.st_mtime_ns,
                                  item.st_ctime_ns)
        require(signature(before) == signature(after) == signature(entry)
                and len(data) == after.st_size, 'immutable input changed while reading')
        return bytes(data)
    finally:
        os.close(fd)


def sha_bytes(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()



def file_digest(path):
    # Toolchain archives may be large; pin their bytes without retaining them in memory.
    path = canonical(str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1,
                'immutable input must be an owned single-link regular file')
        hashed, size = hashlib.sha256(), 0
        while True:
            part = os.read(fd, 65536)
            if not part:
                break
            size += len(part)
            hashed.update(part)
        signature = lambda item: (item.st_dev, item.st_ino, item.st_size, item.st_mtime_ns, item.st_ctime_ns)
        require(signature(before) == signature(os.fstat(fd)) == signature(path.lstat())
                and size == before.st_size, 'immutable input changed while hashing')
        return 'sha256:' + hashed.hexdigest()
    finally:
        os.close(fd)

def reference(ref):
    keys(ref, ('path', 'sha256'), 'file reference')
    canonical(ref['path'])
    digest(ref['sha256'])
    return ref


def pinned(ref, *, json_value=False, maximum=RECEIPT_LIMIT):
    reference(ref)
    if json_value:
        value = read_bound_json(ref['path'], expected_digest=ref['sha256'], maximum=maximum)[0]
        pending = [value]
        while pending:
            item = pending.pop()
            if isinstance(item, dict):
                pending.extend(item.values())
            elif isinstance(item, list):
                pending.extend(item)
            elif isinstance(item, float):
                require(math.isfinite(item), 'nonfinite number is not strict JSON')
        return value
    require(file_digest(ref['path']) == ref['sha256'], 'immutable file digest changed: ' + ref['path'])
    return ref


def references(refs):
    require(isinstance(refs, list) and len(refs) <= REFERENCE_LIMIT, 'invalid immutable reference count')
    result = {}
    for ref in refs:
        pinned(ref)
        require(ref['path'] not in result, 'duplicate immutable reference')
        result[ref['path']] = ref['sha256']
    return result


def registry_names(ref):
    pinned(ref)
    text = read_bytes(ref['path'], maximum=1024 * 1024).decode('utf-8')
    # These source registries intentionally contain no code except this names-only export.
    text = re.sub(r'/\*[\s\S]*?\*/|//[^\n]*', ' ', text)
    match = re.fullmatch(r'\s*export\s+const\s+SCENARIOS\s*=\s*Object\.freeze\(\s*\[([\s\S]*)\]\s*\)\s*;\s*', text)
    require(match is not None, 'registry is not a names-only SCENARIOS export')
    body = match.group(1)
    token = re.compile(r'''\s*(['"])([a-z0-9][a-z0-9-]*)\1\s*(,|$)''')
    names, offset = [], 0
    while body[offset:].strip():
        item = token.match(body, offset)
        require(item is not None, 'registry contains nonliteral names')
        names.append(item.group(2))
        offset = item.end()
    require(names and len(names) == len(set(names)), 'empty or duplicate registry names')
    return sorted(names)


def expected_profile(suite):
    return {'harness': 'codex-cli', 'model': 'gpt-6.1-sol' if suite == 'next-steps' else 'gpt-6-sol',
            'reasoningEffort': 'high' if suite == 'next-steps' else 'medium', 'reportedVersion': '0.163.0',
            'toolPolicy': POLICY + (';nesting-by-scenario' if suite == 'merge-gate' else
                                    ';ephemeral' if suite == 'next-steps' else '')}


def task_paths(round_root, scenario, slot):
    slot_root = round_root / 'slots' / scenario / f'slot-{slot}'
    attempt = slot_root / 'attempt-1'
    return {'slotRoot': slot_root, 'state': slot_root / 'state.json', 'attemptRoot': attempt,
            'projectRoot': attempt / 'project', 'skillRoot': attempt / 'skill',
            'prompt': attempt / 'prompt.txt', 'runMetadata': attempt / 'run-metadata.json',
            'fixture': attempt / 'fixture.json', 'buildIdentity': attempt / 'trace/build-identity.json',
            'projectAgents': attempt / 'project/AGENTS.md',
            'projectConfig': attempt / 'project/docs/adr/effective-flow-project-setup.md',
            'trackerStub': attempt / 'skill/scripts/remote-tracker.mjs'}


def add_expected(mapping, path, value):
    path = str(canonical(str(path)))
    digest(value)
    require(path not in mapping or mapping[path] == value, 'conflicting immutable identity map')
    mapping[path] = value


def map_identity(mapping, build, source_root, skill_root):
    keys(build, ('scenario', 'digest', 'skill', 'instrument', 'scenario_inputs'), 'build identity')
    digest(build['digest'])
    for part in ('skill', 'instrument', 'scenario_inputs'):
        shape = ('digest', 'versionNeutralDigest', 'files') if part == 'skill' else ('digest', 'files')
        keys(build[part], shape, 'build identity ' + part)
        digest(build[part]['digest'])
        if part == 'skill':
            digest(build[part]['versionNeutralDigest'])
        files = build[part]['files']
        require(isinstance(files, dict) and 0 < len(files) <= REFERENCE_LIMIT, 'invalid identity file map')
        base = skill_root if part == 'skill' else source_root
        for name, value in files.items():
            require(isinstance(name, str) and not Path(name).is_absolute()
                    and str(Path(name)) == name and '..' not in Path(name).parts,
                    'unsafe identity relative path')
            add_expected(mapping, base / name, value)


def selected_tasks(namespace):
    return [{'suite': 'iterate', 'scenario': SCENARIO, 'slot': slot,
             'artifactDir': str(Path(namespace['cohortsRoot']) / 'iterate' / SCENARIO / f'slot-{slot}')}
            for slot in range(1, 6)]


def validate_namespace(namespace):
    keys(namespace, ('outputRoot', 'outputIdentity', 'profilesRoot', 'profilesIdentity', 'cohortsRoot'), 'namespace')
    identity(namespace['outputRoot'], namespace['outputIdentity'])
    identity(namespace['profilesRoot'], namespace['profilesIdentity'])
    output, profiles, cohorts = (canonical(namespace[k]) for k in ('outputRoot', 'profilesRoot', 'cohortsRoot'))
    require(cohorts == output / 'cohorts' and output != profiles and output not in profiles.parents
            and profiles not in output.parents, 'stage namespace changed')



def pristine_files(root):
    """Cover the original pristine tree by reference; do not derive an overlay/load set."""
    result = set()
    def refuse_walk(error):
        raise error
    for directory, directories, filenames in os.walk(root, followlinks=False, onerror=refuse_walk):
        for entry in (Path(directory), *(Path(directory) / name for name in directories)):
            info = entry.lstat()
            require(entry.resolve() == entry and stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid(),
                    'unsafe pristine build directory')
        for name in filenames:
            path = Path(directory) / name
            info = path.lstat()
            require(path.resolve() == path and stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid()
                    and info.st_nlink == 1, 'unsafe pristine build file')
            result.add(str(path))
            require(len(result) <= REFERENCE_LIMIT, 'too many pristine build inputs')
    require(result, 'empty original pristine build tree')
    return result

def closed_proof(task, paths, artifact, corpus_ref, grant_ref, driver_files):
    """Accept only the retained original D2/operator closure of an earlier selected slot."""
    result = read_bound_json(artifact / 'operator-result.json')[0]
    require(all(result.get(k) == task[k] for k in ('suite', 'scenario', 'slot')) and clean_outcome(result),
            'previous selected slot lacks a clean operator closure')
    job_path = artifact / 'worker-job.json'
    job, job_digest = read_bound_json(job_path, maximum=1024 * 1024)
    require(job['task'] == task and job['artifactDir'] == str(artifact)
            and job.get('firstStage') == {'schemaVersion': 1, 'corpus': corpus_ref, 'grant': grant_ref, 'ordinal': task['slot']}
            and all(job['pins'].get(path) == value for path, value in driver_files.items())
            and all(job['pins'].get(ref['path']) == ref['sha256'] for ref in (corpus_ref, grant_ref)),
            'closed job stage identity or pins changed')
    projection = inspect_consumption(job, job_path, job_digest, fixture_only=job['fixtureTools'],
                                     wrapper_attempted=True, wrapper_refused=False)
    require(projection == {'consumptionState': 'reserved', 'chargedRoots': 1, 'actualModelStarted': True},
            'previous selected slot accounting changed')
    receipt = read_bound_json(paths['attemptRoot'] / 'host-receipt.json')[0]
    require(receipt == {'schemaVersion': 1, 'nonForked': True, 'initialWorkingRoot': task['projectRoot'],
                       'taskInput': 'rendered-prompt-only', 'completed': True, 'profile': task['profile']},
            'previous original host receipt changed')
    seal = read_bound_json(paths['attemptRoot'] / 'seal.json')[0]
    require(seal.get('schemaVersion') == 1 and seal.get('scenario') == task['scenario']
            and type(seal.get('slot')) is int and seal['slot'] == task['slot'] and seal.get('attempt') == 1,
            'previous original seal identity changed')
    seal_paths = {**{k: paths[k] for k in PREPARED_KEYS}, 'log': paths['attemptRoot'] / 'trace/tracker-calls.jsonl',
                  'hostReceipt': paths['attemptRoot'] / 'host-receipt.json',
                  'gitState': paths['attemptRoot'] / 'trace/git-state.json',
                  'reportChannel': paths['attemptRoot'] / 'trace/report-channel.jsonl'}
    keys(seal.get('digests'), seal_paths, 'original seal digests')
    for name, path in seal_paths.items():
        require(sha_bytes(read_bytes(path)) == digest(seal['digests'][name]), 'previous sealed evidence changed')
    build = read_bound_json(paths['buildIdentity'])[0]
    require(seal.get('buildDigest') == build['digest'], 'original seal build identity changed')



def pending_evidence(paths):
    """Empty provisioned auxiliary files are legal; run evidence and locks are not."""
    trace = paths['attemptRoot'] / 'trace'
    for name in ('tracker-calls.jsonl', 'report-channel.jsonl', 'iterate-calls.jsonl'):
        path = trace / name
        require(not os.path.lexists(str(path) + '.lock'), 'pending trace has a live lock')
        if os.path.lexists(path):
            require(read_bytes(path, maximum=0) == b'', 'pending task already left run evidence')
    require(not os.path.lexists(paths['slotRoot'] / '.mutation.lock'), 'pending slot has a mutation lock')
    require(not os.path.lexists(trace / 'git-state.json')
            and not os.path.lexists(trace / 'recommendation-state.jsonl'), 'pending task has sealed state evidence')


def reference_count(value):
    pending, count = [value], 0
    while pending:
        item = pending.pop()
        if isinstance(item, dict):
            if set(item) == {'path', 'sha256'}:
                count += 1
            else:
                pending.extend(item.values())
        elif isinstance(item, list):
            pending.extend(item)
    return count

def authenticate(corpus_ref, grant_ref, *, initial, closed, _remaining=None):
    corpus = pinned(corpus_ref, json_value=True, maximum=CORPUS_LIMIT)
    grant = pinned(grant_ref, json_value=True, maximum=GRANT_LIMIT)
    keys(corpus, ('schemaVersion', 'kind', 'source', 'namespace', 'config', 'operator', 'toolchain',
                  'qualification', 'driverFiles', 'suites'), 'corpus')
    require(reference_count(corpus) <= REFERENCE_LIMIT, 'too many corpus immutable references')
    require(type(corpus['schemaVersion']) is int and corpus['schemaVersion'] == 1
            and corpus['kind'] == 'effective-flow-host-first-stage-corpus', 'unsupported corpus')
    keys(grant, ('schemaVersion', 'kind', 'stageId', 'corpus', 'config', 'namespace', 'orderedTasks',
                 'maximumChargedRoots', 'concurrency', 'allowRetry', 'allowResume', 'allowContinuation',
                 'fullCorpusAcceptance'), 'grant')
    require(type(grant['schemaVersion']) is int and grant['schemaVersion'] == 1
            and grant['kind'] == 'effective-flow-host-first-stage-grant' and grant['stageId'] == STAGE_ID,
            'unsupported stage grant')
    namespace = corpus['namespace']
    validate_namespace(namespace)
    require(grant['corpus'] == corpus_ref and grant['config'] == corpus['config']
            and grant['namespace'] == namespace, 'grant binding changed')
    ordered = selected_tasks(namespace)
    require(grant['orderedTasks'] == ordered and all(type(x['slot']) is int for x in grant['orderedTasks']),
            'only fixed ordered first five tasks are authorized')
    require(type(grant['maximumChargedRoots']) is int and grant['maximumChargedRoots'] == 5
            and type(grant['concurrency']) is int and grant['concurrency'] == 1
            and all(grant[k] is False for k in ('allowRetry', 'allowResume', 'allowContinuation', 'fullCorpusAcceptance')),
            'stage budget or continuation policy changed')
    source = corpus['source']
    keys(source, ('root', 'head', 'tree'), 'source')
    root = canonical(source['root'])
    require(all(isinstance(source[k], str) and re.fullmatch(r'[0-9a-f]{40}', source[k]) for k in ('head', 'tree')),
            'invalid source identity')
    config = pinned(corpus['config'], json_value=True)
    require(type(config.get('schemaVersion')) is int and config['schemaVersion'] == 1
            and config['frozenRoot'] == str(root) and config['expectedFrozenHead'] == source['head']
            and config['expectedFrozenTree'] == source['tree']
            and all(config[k] == namespace[k] for k in ('outputRoot', 'profilesRoot')),
            'actual config source or namespace changed')
    require(all(root != canonical(namespace[k]) and root not in canonical(namespace[k]).parents
                and canonical(namespace[k]) not in root.parents for k in ('outputRoot', 'profilesRoot')),
            'stage namespace overlaps frozen source')
    # Static validation checks only the auth reference's syntax, never its filesystem entry.
    auth = config['authFile']
    require(isinstance(auth, str) and Path(auth).is_absolute() and os.path.normpath(auth) == auth,
            'auth reference must be an absolute normalized path')
    profiles = {name: expected_profile(name) for name in SUITES}
    require(config['profiles'] == profiles, 'actual suite execution profiles changed')
    pinned(corpus['operator'])
    keys(corpus['toolchain'], ('node', 'python', 'artifacts'), 'toolchain')
    for name in ('node', 'python'):
        pinned(corpus['toolchain'][name])
        require(corpus['toolchain'][name]['path'] == config[name], 'executor reference changed')
    artifacts = corpus['toolchain']['artifacts']
    keys(artifacts, ('binary', 'companion', 'binaryArchive', 'companionArchive', 'binaryReceipt', 'companionReceipt'), 'toolchain artifacts')
    require(artifacts == config['toolchain'], 'actual toolchain references changed')
    for ref in artifacts.values():
        pinned(ref)
    keys(corpus['qualification'], ('bundle', 'policy'), 'qualification')
    qualification = corpus['qualification']
    bundle = pinned(qualification['bundle'], json_value=True, maximum=CORPUS_LIMIT)
    pinned(qualification['policy'])
    require(qualification['bundle'] == {'path': config['probeBundle'], 'sha256': config['qualificationDigest']}
            and qualification['policy']['path'] == str(root / 'evals/_scaffold/host-qualification.mjs')
            and bundle['toolchain'] == artifacts, 'actual qualification binding changed')
    driver_files = references(corpus['driverFiles'])
    driver_root = canonical(config['driverRoot'])
    require(set(driver_files) == {str(driver_root / name) for name in DRIVER_FILES}, 'driver reference set changed')
    require(driver_files[str(driver_root / 'evals/host-driver/eval_first_stage.py')] == sha_bytes(read_bytes(__file__)),
            'executing first-stage helper differs from corpus')
    for name in DRIVER_FILES:
        require(sha_bytes(read_bytes(root / name)) == driver_files[str(driver_root / name)],
                'driver differs from frozen source')
    require(isinstance(corpus['suites'], list) and [s.get('name') for s in corpus['suites']] == list(SUITES),
            'complete ordered suite set required')
    all_tasks, selected = [], []
    fixed_config = {k: v for k, v in config.items() if k != 'qualificationDigest'}
    static_digest = sha_bytes(json.dumps(fixed_config, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())
    closed = tuple(closed)
    require(len(closed) <= 5 and closed == tuple(range(1, len(closed) + 1)), 'closed selected slots must be a prefix')
    if initial:
        require(not closed and not os.path.lexists(namespace['cohortsRoot']), 'cohort namespace already consumed')
    for suite in corpus['suites']:
        keys(suite, ('name', 'registry', 'suiteConfig', 'prepared', 'roundManifest', 'profile', 'tasks', 'immutableInputs'), 'suite')
        name = suite['name']
        require(suite['registry']['path'] == str(root / 'evals' / name / 'scenario-registry.mjs')
                and suite['suiteConfig']['path'] == str(root / 'evals' / name / 'suite.config.mjs'), 'source suite references changed')
        names = registry_names(suite['registry'])
        pinned(suite['suiteConfig'])
        require(len(names) == {'merge-gate': 9, 'iterate': 7, 'next-steps': 15}[name], 'authoritative registry size changed')
        require(suite['profile'] == profiles[name], 'corpus suite profile changed')
        prepared = pinned(suite['prepared'], json_value=True, maximum=CORPUS_LIMIT)
        keys(prepared, ('schemaVersion', 'sourceHead', 'sourceTree', 'base', 'roundRoot', 'manifestPath',
                        'staticConfigDigest', 'tasks'), 'original prepared manifest')
        require(type(prepared['schemaVersion']) is int and prepared['schemaVersion'] == 1,
                'unsupported prepared manifest schema')
        manifest = pinned(suite['roundManifest'], json_value=True, maximum=CORPUS_LIMIT)
        keys(manifest, ('schemaVersion', 'roundId', 'createdAt', 'creatorCheckout', 'sourceRevision',
                        'requiredRuns', 'scenarios', 'profile', 'builtSkillRoot', 'identities', 'slots'),
             'original round manifest')
        base, round_root = canonical(prepared['base']), canonical(prepared['roundRoot'])
        require(round_root.parent == base and suite['prepared']['path'] == str(Path(namespace['outputRoot']) / f'prepared-{name}.json')
                and suite['roundManifest']['path'] == str(round_root / 'manifest.json')
                and prepared['manifestPath'] == suite['roundManifest']['path']
                and prepared['sourceHead'] == source['head'] and prepared['sourceTree'] == source['tree']
                and prepared['staticConfigDigest'] == static_digest, 'prepared identity changed')
        require(type(manifest.get('schemaVersion')) is int and manifest['schemaVersion'] == 1
                and isinstance(manifest['createdAt'], str)
                and re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z', manifest['createdAt'])
                and isinstance(manifest['roundId'], str) and NAME.fullmatch(manifest['roundId'])
                and manifest['sourceRevision'] == source['head'] and manifest['creatorCheckout'] == str(root)
                and manifest['roundId'] == round_root.name and type(manifest['requiredRuns']) is int
                and manifest['requiredRuns'] == 5 and manifest['scenarios'] == names
                and manifest['profile'] == profiles[name] and set(manifest['identities']) == set(names),
                'original round identity changed')
        built_root = canonical(manifest['builtSkillRoot'])
        require(built_root == round_root / 'build/dist/portable/effective-flow', 'original built root changed')
        expected_members = [(scenario, slot) for scenario in names for slot in range(1, 6)]
        require(isinstance(suite['tasks'], list) and len(suite['tasks']) == len(expected_members)
                and len(prepared['tasks']) == len(expected_members) and len(manifest['slots']) == len(expected_members),
                'full authoritative task count required')
        immutable = references(suite['immutableInputs'])
        pristine = pristine_files(built_root)
        require(pristine <= set(immutable), 'original pristine build coverage incomplete')
        expected_inputs = {}
        for record, prepared_task, original_slot, member in zip(suite['tasks'], prepared['tasks'], manifest['slots'], expected_members):
            keys(record, ('task', 'prompt', 'runMetadata', 'state', 'buildIdentity'), 'task record')
            task = record['task']
            keys(task, TASK_KEYS, 'task')
            scenario, slot = member
            require(type(task['slot']) is int and task == prepared_task and task['suite'] == name
                    and (task['scenario'], task['slot']) == member and task['profile'] == profiles[name],
                    'full task differs from authoritative registry/prepared identity')
            paths = task_paths(round_root, scenario, slot)
            require(all(task[k] == str(paths[k]) for k in ('projectRoot', 'attemptRoot', 'prompt', 'runMetadata')),
                    'original sandbox task paths changed')
            keys(original_slot, ('scenario', 'slot', 'slotRoot', 'promptDigest', 'expectedDigests'), 'original round slot')
            require(original_slot['scenario'] == scenario and type(original_slot['slot']) is int
                    and original_slot['slot'] == slot and original_slot['slotRoot'] == str(paths['slotRoot']),
                    'original round slot changed')
            expected = original_slot['expectedDigests']
            keys(expected, PREPARED_KEYS, 'prepared digests')
            for key in PREPARED_KEYS:
                add_expected(expected_inputs, paths[key], expected[key])
            for key in ('prompt', 'runMetadata', 'state', 'buildIdentity'):
                require(record[key]['path'] == str(paths[key]), 'prepared record reference path changed')
                pinned(record[key], json_value=key != 'prompt')
                if key != 'state':
                    require(record[key]['sha256'] == expected[key], 'prepared record digest changed')
            add_expected(expected_inputs, paths['state'], record['state']['sha256'])
            state = pinned(record['state'], json_value=True)
            keys(state, ('schemaVersion', 'currentAttempt', 'discardedAttempts', 'expectedDigests'), 'state')
            require(type(state['schemaVersion']) is int and state['schemaVersion'] == 1
                    and type(state['currentAttempt']) is int and state['currentAttempt'] == 1
                    and type(state['discardedAttempts']) is int and state['discardedAttempts'] == 0
                    and state['expectedDigests'] == expected, 'attempt is not original pending attempt1')
            metadata = pinned(record['runMetadata'], json_value=True)
            keys(metadata, ('schemaVersion', 'scenario', 'slot', 'attempt', 'projectRoot', 'skillRoot', 'promptDigest', 'fixtureDigest', 'profile'), 'metadata')
            require(type(metadata['schemaVersion']) is int and metadata['schemaVersion'] == 1
                    and metadata['scenario'] == scenario and type(metadata['slot']) is int and metadata['slot'] == slot
                    and type(metadata['attempt']) is int and metadata['attempt'] == 1
                    and metadata['projectRoot'] == task['projectRoot'] and metadata['skillRoot'] == str(paths['skillRoot'])
                    and metadata['profile'] == profiles[name] and metadata['promptDigest'] == expected['prompt']
                    and original_slot['promptDigest'] == expected['prompt'] and metadata['fixtureDigest'] == expected['fixture'],
                    'original metadata identity changed')
            build = pinned(record['buildIdentity'], json_value=True)
            require(build == manifest['identities'][scenario] and build['scenario'] == scenario, 'original build identity changed')
            map_identity(expected_inputs, build, root, paths['skillRoot'])
            member_id = (name, scenario, slot)
            is_closed = name == 'iterate' and scenario == SCENARIO and slot in closed
            if _remaining is not None:
                is_closed = member_id in _remaining['closed']
            evidence = [paths['attemptRoot'] / f for f in ('host-receipt.json', 'seal.json')]
            if name == 'iterate':
                evidence.append(paths['attemptRoot'] / 'trace/git-state.json')
            runtime_allowed = (not initial and name == 'iterate' and scenario == SCENARIO
                               and slot <= min(5, len(closed) + 1))
            if _remaining is not None:
                runtime_allowed = member_id in _remaining['active'] or is_closed
            allowed_attempt_names = {'attempt-1'}
            if runtime_allowed:
                allowed_attempt_names.add('attempt-1-cli-tmp')
            require(not os.path.lexists(paths['slotRoot'] / 'retry-transition.json')
                    and not os.path.lexists(paths['slotRoot'] / 'quarantine')
                    and not any(p.name.startswith('attempt-') and p.name not in allowed_attempt_names
                                for p in paths['slotRoot'].iterdir()), 'prior attempt or retry evidence exists')
            cli_tmp = paths['slotRoot'] / 'attempt-1-cli-tmp'
            if os.path.lexists(cli_tmp):
                info = cli_tmp.lstat()
                require(runtime_allowed and cli_tmp.resolve() == cli_tmp and stat.S_ISDIR(info.st_mode)
                        and info.st_uid == os.getuid(), 'unexpected CLI temporary directory')
            if is_closed and _remaining is not None:
                remaining_closed_proof(task, paths, Path(namespace['cohortsRoot']) / name / scenario / f'slot-{slot}',
                                       corpus_ref, grant_ref, driver_files, _remaining)
            elif is_closed:
                closed_proof(task, paths, Path(namespace['cohortsRoot']) / name / scenario / f'slot-{slot}',
                             corpus_ref, grant_ref, driver_files)
            else:
                if _remaining is None or member_id not in _remaining['active']:
                    require(all(not os.path.lexists(p) for p in evidence), 'nonclosed task already has final evidence')
                    pending_evidence(paths)
            all_tasks.append(task)
            if name == 'iterate' and scenario == SCENARIO:
                selected.append(task)
        # Pristine overlay originals have their own complete byte references; do not compare
        # them to the overlaid slot's identity or invent another build/overlay algorithm.
        require(all(immutable.get(path) == value for path, value in expected_inputs.items()), 'immutable identity coverage incomplete')
        require(all(path in expected_inputs or path in pristine for path in immutable),
                'foreign immutable input reference')
    require(len(all_tasks) == 155 and len(selected) == 5, 'full155 corpus or fixed selection incomplete')
    return {'corpusData': corpus, 'grantData': grant, 'config': config, 'selectedTasks': selected,
            'allTasks': all_tasks, 'corpus': corpus_ref, 'grant': grant_ref}



def task_identity(task):
    return tuple(task[k] for k in ('suite', 'scenario', 'slot'))


def remainder_tasks(all_tasks):
    """Use the legacy full interleave before removing the five original identities."""
    arrays = [[t for t in all_tasks if t['suite'] == suite] for suite in SUITES]
    ordered = [t for row in itertools.zip_longest(*arrays) for t in row if t is not None]
    original = {('iterate', SCENARIO, slot) for slot in range(1, 6)}
    return [t for t in ordered if task_identity(t) not in original]


def remaining_batches(all_tasks):
    tasks = remainder_tasks(all_tasks)
    require(len(tasks) == 150, 'fixed remainder must contain 150 tasks')
    return [tasks[n:n + 6] for n in range(0, 150, 6)]


def remaining_closed_proof(task, paths, artifact, corpus_ref, first_grant_ref, driver_files, state):
    """Verify retained closures without signalling historical process identities."""
    original = task_identity(task) in state['originalJobs']
    if original:
        job_ref = state['originalJobs'][task_identity(task)]
        job = pinned(job_ref, json_value=True, maximum=1024 * 1024)
        require(job_ref['path'] == str(artifact / 'worker-job.json'), 'original job path changed')
        closed_proof(task, paths, artifact, corpus_ref, first_grant_ref, driver_files)
    else:
        job, job_digest = read_bound_json(artifact / 'worker-job.json', maximum=1024 * 1024)
        stage = job.get('remainingStage')
        ordinal = state['order'].index(task_identity(task)) + 1
        require(stage == {**state['context'], 'ordinal': ordinal, 'batch': (ordinal - 1) // 6 + 1}
                and 'firstStage' not in job and job['task'] == task
                and job['artifactDir'] == str(artifact), 'closed remainder job changed')
        require(all(job['pins'].get(path) == value for path, value in driver_files.items()),
                'closed remainder driver pins changed')
        projection = inspect_consumption(job, artifact / 'worker-job.json', job_digest,
                                         fixture_only=job['fixtureTools'], wrapper_attempted=True)
        require(projection == {'consumptionState': 'reserved', 'chargedRoots': 1, 'actualModelStarted': True},
                'closed remainder consumption uncertain')
        result = read_bound_json(artifact / 'operator-result.json')[0]
        require(all(result.get(k) == task[k] for k in ('suite', 'scenario', 'slot')) and clean_outcome(result),
                'remainder closure is not clean')
        seal = read_bound_json(paths['attemptRoot'] / 'seal.json')[0]
        require(type(seal.get('schemaVersion')) is int and seal['schemaVersion'] == 1
                and seal.get('scenario') == task['scenario'] and type(seal.get('slot')) is int
                and seal['slot'] == task['slot'] and type(seal.get('attempt')) is int and seal['attempt'] == 1,
                'remainder seal identity changed')
        seal_paths = {**{k: paths[k] for k in PREPARED_KEYS},
                      'log': paths['attemptRoot'] / 'trace/tracker-calls.jsonl',
                      'hostReceipt': paths['attemptRoot'] / 'host-receipt.json'}
        extra = {'iterate': {'reportChannel': 'report-channel.jsonl', 'gitState': 'git-state.json'},
                 'next-steps': {'reportChannel': 'report-channel.jsonl', 'recommendationState': 'recommendation-state.jsonl'},
                 'merge-gate': {'iterateLog': 'iterate-calls.jsonl'}}[task['suite']]
        required_extra = {'iterate': {'gitState', 'reportChannel'}, 'next-steps': {'reportChannel', 'recommendationState'},
                          'merge-gate': set()}[task['suite']]
        require(required_extra <= set(seal.get('digests', {})), 'remainder sealed evidence missing')
        for key, filename in extra.items():
            if key in seal.get('digests', {}):
                seal_paths[key] = paths['attemptRoot'] / 'trace' / filename
        keys(seal.get('digests'), seal_paths, 'remainder seal digests')
        for key, path in seal_paths.items():
            require(file_digest(path) == digest(seal['digests'][key]), 'remainder sealed evidence changed')
        require(seal.get('buildDigest') == read_bound_json(paths['buildIdentity'])[0]['digest'],
                'remainder seal build changed')
        receipt = read_bound_json(paths['attemptRoot'] / 'host-receipt.json')[0]
        require(receipt == {'schemaVersion': 1, 'nonForked': True, 'initialWorkingRoot': task['projectRoot'],
                           'taskInput': 'rendered-prompt-only', 'completed': True, 'profile': task['profile']},
                'remainder original host receipt changed')
    require(type(job.get('fixtureTools')) is bool, 'invalid closure fixture label')
    result = read_bound_json(artifact / 'operator-result.json')[0]
    require(result.get('fixtureOnly') is job['fixtureTools']
            and result.get('qualifiedHost') is (not job['fixtureTools']), 'closure fixture labels changed')
    runner = read_bound_json(artifact / 'runner-profile.json')[0]
    cleanup = verify_cleanup(runner['profilePath'], job['profilesRoot'])
    require(cleanup['groupGone'] is True and cleanup['cleanupComplete'] is True,
            'retained runner cleanup is incomplete')
    termination = read_bound_json(artifact / 'process-termination.json')[0]
    require(termination.get('groupGone') is True and termination.get('cleanupComplete') is True,
            'retained termination is incomplete')
    require(not os.path.lexists(artifact / 'watchdog-stop.json'), 'retained watchdog stop exists')


def remaining_admission_value(context, grant):
    return {'schemaVersion': 1, 'kind': 'effective-flow-host-remaining-stage-admission',
            'stageId': REMAINING_STAGE_ID, 'corpus': context['corpus'], 'grant': context['grant'],
            'closures': grant['closures'], 'attach': grant['attach']}


def durable_remaining_record(path, value):
    """Exclusive, nonrefundable record; any uncertain write/close leaves it consumed."""
    raw = (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        offset = 0
        while offset < len(raw):
            count = os.write(fd, raw[offset:])
            require(count > 0, 'short remaining admission write')
            offset += count
        os.fsync(fd)
    finally:
        os.close(fd)
    # Synchronize all existing ancestors, then recheck the exact bytes/entry.
    for parent in (path.parent, *path.parent.parents):
        handle = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(handle)
        finally:
            os.close(handle)
    ref = {'path': str(path), 'sha256': sha_bytes(raw)}
    require(pinned(ref, json_value=True) == value, 'remaining record changed after sync')
    return ref


def remaining_context_data(context, *, initial=False, batch=0, active=True):
    expected = {'schemaVersion', 'corpus', 'grant'}
    if 'admission' in context:
        expected.add('admission')
    if 'cancellation' in context:
        expected.add('cancellation')
    keys(context, expected, 'remaining context')
    require(type(context['schemaVersion']) is int and context['schemaVersion'] == 1
            and type(batch) is int and 0 <= batch <= 26, 'invalid remaining context or batch')
    require('cancellation' not in context or 'admission' in context, 'cancellation requires admission')
    grant = pinned(context['grant'], json_value=True, maximum=REMAINING_GRANT_LIMIT)
    keys(grant, ('schemaVersion', 'kind', 'stageId', 'corpus', 'firstStageGrant', 'firstStageSummary',
                 'closures', 'config', 'namespace', 'attach', 'orderedTasks', 'maximumChargedRoots',
                 'maximumCombinedChargedRoots', 'concurrency', 'batches', 'allowRetry', 'allowResume',
                 'allowContinuation', 'fullCorpusAcceptance', 'publication', 'cancellation'), 'remaining grant')
    require(type(grant['schemaVersion']) is int and grant['schemaVersion'] == 1
            and grant['kind'] == 'effective-flow-host-remaining-stage-grant'
            and grant['stageId'] == REMAINING_STAGE_ID and grant['corpus'] == context['corpus'],
            'unsupported remaining grant')
    for key, value in (('maximumChargedRoots', 150), ('maximumCombinedChargedRoots', 155),
                       ('concurrency', 6), ('batches', 25)):
        require(type(grant[key]) is int and grant[key] == value, 'remaining fixed budget changed')
    require(all(grant[k] is False for k in ('allowRetry', 'allowResume', 'allowContinuation',
                                           'fullCorpusAcceptance', 'publication')), 'remaining authority broadened')
    corpus = pinned(context['corpus'], json_value=True, maximum=CORPUS_LIMIT)
    require(grant['namespace'] == corpus['namespace'] and grant['config'] == corpus['config'],
            'remaining corpus binding changed')
    namespace = corpus['namespace']
    validate_namespace(namespace)
    cohort = canonical(namespace['cohortsRoot'])
    attach = capture_accounting_paths(cohort, Path(namespace['outputRoot']), cohort / 'launch-gate')
    require(attach == grant['attach'] and not os.path.lexists(cohort / 'launch-blocked'),
            'remaining cohort or gate replaced/revoked/blocked')
    cancel = grant['cancellation']
    keys(cancel, ('path', 'exclusive', 'closeUnlink'), 'remaining cancellation')
    require(cancel['path'] == str(Path(namespace['profilesRoot']) / 'remaining-stage-cancellation.fifo')
            and cancel['exclusive'] is True and cancel['closeUnlink'] is True,
            'remaining cancellation authority changed')
    tasks = [r['task'] for suite in corpus['suites'] for r in suite['tasks']]
    remaining = remainder_tasks(tasks)
    ordered = [{**{k: t[k] for k in ('suite', 'scenario', 'slot')},
                'artifactDir': str(cohort / t['suite'] / t['scenario'] / f"slot-{t['slot']}")} for t in remaining]
    require(len(remaining) == 150 and grant['orderedTasks'] == ordered
            and all(type(t['slot']) is int for t in grant['orderedTasks']), 'remaining selection/order changed')
    inventory = pinned(grant['closures'], json_value=True, maximum=CLOSURE_INVENTORY_LIMIT)
    keys(inventory, ('schemaVersion', 'kind', 'closures'), 'closure inventory')
    require(type(inventory['schemaVersion']) is int and inventory['schemaVersion'] == 1
            and inventory['kind'] == 'effective-flow-host-first-stage-closures'
            and isinstance(inventory['closures'], list) and len(inventory['closures']) == 5,
            'invalid original closure inventory')
    original_jobs, projections, fixture_modes = {}, [], []
    allowed_cohort_files = {'launch-gate', 'host-events.jsonl', 'first-stage-summary.json',
                            'remaining-stage-admission.json', 'remaining-stage-cancellation.json',
                            'remaining-stage-events.jsonl', 'remaining-stage-summary.json'}
    allowed_paths = {str(cohort / name) for name in allowed_cohort_files}
    for entry, selected in zip(inventory['closures'], selected_tasks(namespace)):
        keys(entry, ('task', 'job', 'files'), 'closure entry')
        require(entry['task'] == {k: selected[k] for k in ('suite', 'scenario', 'slot')}
                and type(entry['task']['slot']) is int, 'original closure membership changed')
        job = pinned(entry['job'], json_value=True, maximum=1024 * 1024)
        artifact = Path(selected['artifactDir'])
        require(entry['job']['path'] == str(artifact / 'worker-job.json')
                and job['artifactDir'] == str(artifact) and job['accounting']['gate'] == attach['gate']
                and all(row in job['accounting']['directories'] for row in attach['directories']),
                'original cohort/gate jobs disagree')
        require(type(job.get('fixtureTools')) is bool, 'original fixture mode is invalid')
        fixture_modes.append(job['fixtureTools'])
        files = references(entry['files'])
        attempt = canonical(job['task']['attemptRoot'])
        runner_ref = read_bound_json(artifact / 'runner-profile.json')[0]
        profile = canonical(runner_ref['profilePath'])
        require(profile.parent == Path(namespace['profilesRoot']), 'original runner outside profiles')
        required_files = {str(p) for root in (artifact, attempt) for p in root.rglob('*') if p.is_file()}
        required_files.update(str(profile / name) for name in ('host-profile.json', 'host-profile-cleanup.json'))
        require(set(files) == required_files and files.get(entry['job']['path']) == entry['job']['sha256'],
                'original closure inventory file coverage changed')
        allowed_paths.update(str(p) for p in (artifact, *artifact.parents) if cohort == p or cohort in p.parents)
        original_jobs[task_identity(entry['task'])] = entry['job']
        projection = inspect_consumption(job, Path(entry['job']['path']), entry['job']['sha256'],
                                         fixture_only=job['fixtureTools'], wrapper_attempted=True)
        require(projection == {'consumptionState': 'reserved', 'chargedRoots': 1, 'actualModelStarted': True},
                'original consumption is not proven')
        projections.append({**entry['task'], **projection})
    require(len(set(fixture_modes)) == 1, 'original fixture modes disagree')
    summary = pinned(grant['firstStageSummary'], json_value=True)
    require(grant['firstStageSummary']['path'] == str(cohort / 'first-stage-summary.json')
            and summary.get('stageId') == STAGE_ID and summary.get('stageCompleted') is True
            and summary.get('corpusSha256') == context['corpus']['sha256']
            and summary.get('grantSha256') == grant['firstStageGrant']['sha256']
            and summary.get('fixtureOnly') is fixture_modes[0]
            and summary.get('qualifiedHost') is (not fixture_modes[0]), 'original summary not completed/bound')
    order = [task_identity(t) for t in remaining]
    closed_count = 150 if batch == 26 else max(0, batch - 1) * 6
    state = {'originalJobs': original_jobs, 'order': order, 'context': context,
             'closed': set(original_jobs) | set(order[:closed_count]),
             'active': set(order[closed_count:closed_count + 6]) if batch and active else set()}
    data = authenticate(context['corpus'], grant['firstStageGrant'], initial=False, closed=range(1, 6), _remaining=state)
    admission_path = cohort / 'remaining-stage-admission.json'
    if 'admission' in context:
        require(context['admission']['path'] == str(admission_path)
                and pinned(context['admission'], json_value=True) == remaining_admission_value(context, grant),
                'remaining admission changed')
    else:
        require(not os.path.lexists(admission_path), 'remaining one-shot admission already consumed')
    if 'cancellation' in context:
        ref = context['cancellation']
        require(ref['path'] == str(cohort / 'remaining-stage-cancellation.json'), 'cancellation record path changed')
        record = pinned(ref, json_value=True)
        keys(record, ('schemaVersion', 'admission', 'path', 'dev', 'ino'), 'cancellation record')
        info = canonical(cancel['path']).lstat()
        require(type(record['schemaVersion']) is int and record['schemaVersion'] == 1
                and record['admission'] == context['admission'] and record['path'] == cancel['path']
                and all(type(record[k]) is int for k in ('dev', 'ino'))
                and stat.S_ISFIFO(info.st_mode) and info.st_uid == os.getuid()
                and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600
                and (info.st_dev, info.st_ino) == (record['dev'], record['ino']), 'remaining cancellation replaced')
    else:
        require(not os.path.lexists(cancel['path']) and not os.path.lexists(cohort / 'remaining-stage-cancellation.json'),
                'remaining cancellation path already consumed')
    # Original artifact subtrees and current/closed remainder slots are the only task children.
    for index, task in enumerate(remaining):
        directory = cohort / task['suite'] / task['scenario'] / f"slot-{task['slot']}"
        if index < closed_count or task_identity(task) in state['active']:
            allowed_paths.update(str(p) for p in (directory, *directory.parents) if cohort == p or cohort in p.parents)
        else:
            require(not os.path.lexists(directory), 'future remainder artifact exists')
    original_roots = [Path(x['job']['path']).parent for x in inventory['closures']]
    active_roots = [cohort / t['suite'] / t['scenario'] / f"slot-{t['slot']}" for t in remaining[:closed_count + (6 if batch and batch < 26 and active else 0)]]
    for child in cohort.rglob('*'):
        if any(root == child or root in child.parents for root in (*original_roots, *active_roots)):
            continue
        require(str(child) in allowed_paths, 'unexplained cohort child')
    if initial:
        require(set(context) == {'schemaVersion', 'corpus', 'grant'}, 'initial attach cannot resume')
        require(not os.path.lexists(cohort / 'remaining-stage-events.jsonl')
                and not os.path.lexists(cohort / 'remaining-stage-summary.json'), 'prior remaining evidence exists')
    return {**data, 'remainingGrantData': grant, 'selectedTasks': remaining,
            'originalProjections': projections, 'originalEntries': inventory['closures'],
            'fixtureOnly': fixture_modes[0], 'attach': attach}


def validate_remaining_stage(corpus_path, corpus_sha256, grant_path, grant_sha256):
    context = {'schemaVersion': 1, 'corpus': {'path': str(corpus_path), 'sha256': corpus_sha256},
               'grant': {'path': str(grant_path), 'sha256': grant_sha256}}
    remaining_context_data(context, initial=True)
    return context


def admit_remaining_stage(context):
    data = remaining_context_data(context, initial=True)
    path = Path(data['corpusData']['namespace']['cohortsRoot']) / 'remaining-stage-admission.json'
    ref = durable_remaining_record(path, remaining_admission_value(context, data['remainingGrantData']))
    admitted = {**context, 'admission': ref}
    remaining_context_data(admitted)
    return admitted


def validate_remaining_task(context, task, artifact_dir, *, ordinal, batch):
    require('admission' in context and 'cancellation' in context, 'remaining launch lacks startup bindings')
    require(type(ordinal) is int and 1 <= ordinal <= 150 and type(batch) is int
            and batch == (ordinal - 1) // 6 + 1, 'remaining ordinal/batch changed')
    data = remaining_context_data(context, batch=batch)
    require(task == data['selectedTasks'][ordinal - 1] and type(task.get('slot')) is int
            and str(artifact_dir) == data['remainingGrantData']['orderedTasks'][ordinal - 1]['artifactDir'],
            'task is outside fixed remainder')
    return data

def validate_first_stage(corpus_path, corpus_sha256, grant_path, grant_sha256, *, initial=True, closed=()):
    context = {'schemaVersion': 1, 'corpus': {'path': str(corpus_path), 'sha256': corpus_sha256},
               'grant': {'path': str(grant_path), 'sha256': grant_sha256}}
    authenticate(context['corpus'], context['grant'], initial=initial, closed=closed)
    return context


def context_data(context, *, initial=False, closed=()):
    keys(context, ('schemaVersion', 'corpus', 'grant'), 'first-stage context')
    require(type(context['schemaVersion']) is int and context['schemaVersion'] == 1, 'invalid stage context')
    return authenticate(context['corpus'], context['grant'], initial=initial, closed=closed)


def validate_stage_task(context, task, artifact_dir, *, ordinal=None):
    require(type(task.get('slot')) is int and task.get('suite') == 'iterate'
            and task.get('scenario') == SCENARIO and 1 <= task['slot'] <= 5, 'task is outside first stage')
    ordinal = task['slot'] if ordinal is None else ordinal
    require(type(ordinal) is int and ordinal == task['slot'], 'first-stage ordinal changed')
    data = context_data(context, closed=range(1, ordinal))
    require(task == data['selectedTasks'][ordinal - 1]
            and str(artifact_dir) == data['grantData']['orderedTasks'][ordinal - 1]['artifactDir'],
            'full stage task or artifact path changed')
    return data


def validate_worker_stage(job):
    require(not ('firstStage' in job and 'remainingStage' in job), 'simultaneous stage contexts')
    if 'firstStage' not in job and 'remainingStage' not in job:
        return
    remaining = 'remainingStage' in job
    stage = job['remainingStage' if remaining else 'firstStage']
    fields = ('schemaVersion', 'corpus', 'grant', 'admission', 'cancellation', 'ordinal', 'batch') if remaining else (
        'schemaVersion', 'corpus', 'grant', 'ordinal')
    keys(stage, fields, 'worker stage')
    context = {key: stage[key] for key in fields if key not in ('ordinal', 'batch')}
    for ref in (stage[key] for key in ('corpus', 'grant', 'admission', 'cancellation') if key in stage):
        reference(ref)
        require(job['pins'].get(ref['path']) == ref['sha256'], 'stage job external pin changed')
    helper = str(HERE / 'eval_first_stage.py')
    require(job['pins'].get(helper) == sha_bytes(read_bytes(helper)), 'stage helper actual bytes are not job-pinned')
    data = (validate_remaining_task(context, job['task'], job['artifactDir'], ordinal=stage['ordinal'], batch=stage['batch'])
            if remaining else validate_stage_task(context, job['task'], job['artifactDir'], ordinal=stage['ordinal']))
    corpus, config = data['corpusData'], data['config']
    require(job['configFile'] == corpus['config']['path'] and job['pins'].get(job['configFile']) == corpus['config']['sha256']
            and job['source'] == corpus['source']['root'] and job['profilesRoot'] == config['profilesRoot']
            and job['qualificationDigest'] == config['qualificationDigest'] and job['node'] == config['node']
            and job['authFile'] == config['authFile']
            and job['binary'] == config['toolchain']['binary']['path'] and job['operator'] == corpus['operator']['path']
            and job['operatorSha256'] == corpus['operator']['sha256'], 'stage job actual launch binding changed')
    if remaining:
        require(type(job.get('fixtureTools')) is bool
                and all(read_bound_json(Path(x['job']['path']))[0]['fixtureTools'] is job['fixtureTools']
                        for x in pinned(data['remainingGrantData']['closures'], json_value=True,
                                        maximum=CLOSURE_INVENTORY_LIMIT)['closures']), 'remaining fixture mode changed')
        require(job['cancellationPath'] == data['remainingGrantData']['cancellation']['path']
                and job['launchGatePath'] == data['attach']['gate']['path']
                and job['accounting']['gate'] == data['attach']['gate']
                and all(row in job['accounting']['directories'] for row in data['attach']['directories']),
                'remaining launch cancellation or ancestry changed')
    for ref in corpus['driverFiles']:
        require(job['pins'].get(ref['path']) == ref['sha256'], 'stage driver job pin changed')


def clean_outcome(result):
    return (result.get('state') == 'sealed' and result.get('completed') is True
            and result.get('consumptionState') == 'reserved' and result.get('chargedRoots') == 1
            and result.get('actualModelStarted') is True and result.get('cleanupComplete') is True
            and result.get('groupGone') is True and result.get('validityProblems') == []
            and result.get('findings') == [] and result.get('nativeErrors') == []
            and result.get('timedOut') is False and result.get('malformedStream') is False
            and result.get('watchdogStopReason') is None)


def run_first_stage(context, driver):
    data = context_data(context)
    tasks = data['selectedTasks']
    require(getattr(driver, 'first_stage', None) == context, 'driver lacks authenticated stage context')
    for task in tasks:
        driver.admissions[tuple(task[k] for k in ('suite', 'scenario', 'slot'))] = {'attempted': False, 'refused': False}
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        for ordinal, task in enumerate(tasks, 1):
            if driver.stop.is_set() or driver.interrupted_signal is not None:
                driver.block()
                break
            directory = driver.outroot / task['suite'] / task['scenario'] / f"slot-{task['slot']}"
            try:
                validate_stage_task(context, task, directory, ordinal=ordinal)
                driver.check_pins()
                driver.check_source()
                future = pool.submit(driver.run_slot, task)
                while not future.done():
                    if driver.interrupted_signal is not None or driver.stop.is_set():
                        driver.block()
                    concurrent.futures.wait((future,), timeout=0.1)
                result = future.result()
                result.update(driver.accounting_projection(task, directory))
                results[ordinal] = result
                if not clean_outcome(result) or driver.stop.is_set() or driver.interrupted_signal is not None:
                    driver.block()
                    break
                context_data(context, closed=range(1, ordinal + 1))
            except Exception as error:
                driver.block()
                results[ordinal] = {**{k: task[k] for k in ('suite', 'scenario', 'slot')},
                                    'state': 'operator-error', 'error': str(error), 'raw': str(directory),
                                    **driver.accounting_projection(task, directory)}
                break
    outcomes = []
    for ordinal, task in enumerate(tasks, 1):
        directory = driver.outroot / task['suite'] / task['scenario'] / f"slot-{task['slot']}"
        outcomes.append({**{k: task[k] for k in ('suite', 'scenario', 'slot')},
                         **results.get(ordinal, {'state': 'not-submitted'}),
                         **driver.accounting_projection(task, directory)})
    complete = all(x['consumptionState'] != 'reservation-unknown' for x in outcomes)
    if not complete:
        driver.block()
    summary = {'schemaVersion': 1, 'kind': 'effective-flow-host-first-stage-partial', 'stageId': STAGE_ID,
               'corpusSha256': context['corpus']['sha256'], 'grantSha256': context['grant']['sha256'],
               'configSha256': data['corpusData']['config']['sha256'], 'orderedTasks': data['grantData']['orderedTasks'],
               'fullPreparedTasks': 155, 'authorizedTasks': 5, 'remainingTasks': 150, 'concurrency': 1,
               'maximumChargedRoots': 5, 'fullCorpusAccepted': False, 'continuationAuthorized': False,
               'chargedRoots': sum(x['chargedRoots'] for x in outcomes),
               'reservedRoots': sum(x['consumptionState'] == 'reserved' for x in outcomes),
               'reservationUnknownRoots': sum(x['consumptionState'] == 'reservation-unknown' for x in outcomes),
               'started': sum(x['actualModelStarted'] is True for x in outcomes), 'accountingComplete': complete,
               'fixtureOnly': driver.fixture_tools, 'qualifiedHost': not driver.fixture_tools,
               'blocked': driver.stop.is_set(), 'signal': driver.interrupted_signal, 'results': outcomes,
               'stageCompleted': complete and all(clean_outcome(x) for x in outcomes)
                                 and not driver.stop.is_set() and driver.interrupted_signal is None}
    require(summary['chargedRoots'] <= 5, 'stage accounting exceeds fixed five authorized identities')
    save(driver.outroot / 'first-stage-summary.json', summary)
    driver.event({k: v for k, v in summary.items() if k != 'results'})
    return summary



def run_remaining_stage(context, driver):
    require(getattr(driver, 'remaining_stage', None) == context
            and getattr(driver, 'first_stage', None) is None, 'driver lacks exclusive remaining context')
    data = remaining_context_data(context)
    tasks = data['selectedTasks']
    for task in tasks:
        driver.admissions[task_identity(task)] = {'attempted': False, 'refused': False}
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for batch_number, batch_tasks in enumerate(remaining_batches(data['allTasks']), 1):
            if driver.stop.is_set() or driver.interrupted_signal is not None:
                driver.block()
                break
            futures = {}
            try:
                remaining_context_data(context, batch=batch_number, active=False)
                driver.check_pins()
                driver.check_source()
                for offset, task in enumerate(batch_tasks):
                    ordinal = (batch_number - 1) * 6 + offset + 1
                    directory = driver.outroot / task['suite'] / task['scenario'] / f"slot-{task['slot']}"
                    validate_remaining_task(context, task, directory, ordinal=ordinal, batch=batch_number)
                    if driver.stop.is_set() or driver.interrupted_signal is not None:
                        driver.block()
                        break
                    futures[pool.submit(driver.run_slot, task)] = (ordinal, task, directory)
                pending = set(futures)
                while pending:
                    done, pending = concurrent.futures.wait(pending, timeout=0.1,
                                                           return_when=concurrent.futures.FIRST_COMPLETED)
                    if driver.stop.is_set() or driver.interrupted_signal is not None:
                        driver.block()
                    for future in done:
                        ordinal, task, directory = futures[future]
                        try:
                            result = future.result()
                            result.update(driver.accounting_projection(task, directory))
                        except Exception as error:
                            result = {'state': 'operator-error', 'error': str(error),
                                      **driver.accounting_projection(task, directory)}
                        results[ordinal] = result
                        if not clean_outcome(result):
                            driver.block()
                if driver.stop.is_set() or driver.interrupted_signal is not None:
                    driver.block()
                    break
                remaining_context_data(context, batch=batch_number + 1, active=False)
            except Exception as error:
                driver.block()
                for future, (ordinal, task, directory) in futures.items():
                    try:
                        future.result()
                    except Exception:
                        pass
                    results.setdefault(ordinal, {'state': 'operator-error', 'error': str(error)})
                break
    outcomes = []
    for ordinal, task in enumerate(tasks, 1):
        directory = driver.outroot / task['suite'] / task['scenario'] / f"slot-{task['slot']}"
        outcomes.append({**{k: task[k] for k in ('suite', 'scenario', 'slot')},
                         **results.get(ordinal, {'state': 'not-submitted'}),
                         **driver.accounting_projection(task, directory)})
    # These five projections come exclusively from externally pinned original jobs, never admissions.
    original = []
    for entry in data['originalEntries']:
        projection = {'consumptionState': 'reservation-unknown', 'chargedRoots': 1, 'actualModelStarted': None}
        try:
            job = pinned(entry['job'], json_value=True, maximum=1024 * 1024)
            projection = inspect_consumption(job, Path(entry['job']['path']), entry['job']['sha256'],
                                             fixture_only=job['fixtureTools'], wrapper_attempted=True)
        except Exception:
            driver.block()
        original.append({**entry['task'], **projection})
    complete = all(x['consumptionState'] != 'reservation-unknown' for x in (*original, *outcomes))
    closures = False
    if not driver.stop.is_set() and driver.interrupted_signal is None and all(clean_outcome(x) for x in outcomes):
        try:
            final = remaining_context_data(context, batch=26)
            original = final['originalProjections']
            closures = True
        except Exception:
            driver.block()
    if not complete:
        driver.block()
    union = [*original, *outcomes]
    summary = {'schemaVersion': 1, 'kind': 'effective-flow-host-remaining-stage-summary',
               'stageId': REMAINING_STAGE_ID, 'corpusSha256': context['corpus']['sha256'],
               'grantSha256': context['grant']['sha256'], 'fullPreparedTasks': 155,
               'authorizedTasks': 150, 'concurrency': 6, 'batches': 25, 'maximumChargedRoots': 150,
               'maximumCombinedChargedRoots': 155, 'fullCorpusAccepted': False,
               'publicationAuthorized': False, 'continuationAuthorized': False,
               'chargedRoots': sum(x['chargedRoots'] for x in union),
               'reservedRoots': sum(x['consumptionState'] == 'reserved' for x in union),
               'reservationUnknownRoots': sum(x['consumptionState'] == 'reservation-unknown' for x in union),
               'started': sum(x['actualModelStarted'] is True for x in union), 'accountingComplete': complete,
               'fixtureOnly': driver.fixture_tools, 'qualifiedHost': not driver.fixture_tools,
               'blocked': driver.stop.is_set(), 'signal': driver.interrupted_signal,
               'originalResults': original, 'results': outcomes, 'coverageComplete': closures,
               'stageCompleted': closures and complete and not driver.stop.is_set()
                                 and driver.interrupted_signal is None}
    require(len(union) == 155 and len({task_identity(x) for x in union}) == 155
            and summary['chargedRoots'] <= 155, 'combined accounting identity/budget changed')
    save(driver.outroot / 'remaining-stage-summary.json', summary)
    driver.event({k: v for k, v in summary.items() if k not in ('results', 'originalResults')})
    return summary

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus', type=Path, required=True)
    parser.add_argument('--corpus-sha256', required=True)
    parser.add_argument('--grant', type=Path, required=True)
    parser.add_argument('--grant-sha256', required=True)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--remaining-150', action='store_true')
    parser.add_argument('--auth-file', type=Path)
    args = parser.parse_args(argv)
    validator = validate_remaining_stage if args.remaining_150 else validate_first_stage
    context = validator(args.corpus, args.corpus_sha256, args.grant, args.grant_sha256)
    data = remaining_context_data(context, initial=True) if args.remaining_150 else context_data(context, initial=True)
    if not args.execute:
        print(json.dumps({'mode': 'static-dry-run', 'stageId': REMAINING_STAGE_ID if args.remaining_150 else STAGE_ID,
                          'selected': data['remainingGrantData' if args.remaining_150 else 'grantData']['orderedTasks'], 'fullPreparedTasks': 155,
                          'liveSourceChecked': False, 'liveQualificationChecked': False,
                          'fullCorpusAccepted': False, 'continuationAuthorized': False}))
        return 0
    require(args.auth_file is not None, 'execute requires an explicit auth reference')
    spec = importlib.util.spec_from_file_location('first_stage_coordinator', HERE / 'run-cohorts.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    corpus, config = data['corpusData'], data['config']
    if args.remaining_150:
        context = admit_remaining_stage(context)
    driver = module.Driver(corpus['config']['path'], config['profilesRoot'], operator=corpus['operator']['path'],
                           operator_sha256=corpus['operator']['sha256'], binary=config['toolchain']['binary']['path'],
                           auth_file=args.auth_file, node=config['node'],
                           **({'remaining_stage': context} if args.remaining_150 else {'first_stage': context}))
    previous = {sig: signal.signal(sig, driver.interrupt) for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)}
    try:
        summary = (run_remaining_stage(driver.remaining_stage, driver) if args.remaining_150
                   else run_first_stage(context, driver))
        return 128 + driver.interrupted_signal if driver.interrupted_signal else int(not summary['stageCompleted'])
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)
        driver.close()


if __name__ == '__main__':
    raise SystemExit(main())
