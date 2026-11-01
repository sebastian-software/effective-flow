#!/usr/bin/env python3
"""Authenticate one fixed five-root stage; default to read-only static validation."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import signal
import stat
import sys

sys.dont_write_bytecode = True

from eval_driver_runtime import read_bound_json, save, inspect_consumption, RECEIPT_LIMIT

HERE = Path(__file__).resolve().parent
SUITES = ('merge-gate', 'iterate', 'next-steps')
STAGE_ID = 'iterate-duplicated-control-line-aborts-slots-1-5-v1'
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

def authenticate(corpus_ref, grant_ref, *, initial, closed):
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
            is_closed = name == 'iterate' and scenario == SCENARIO and slot in closed
            evidence = [paths['attemptRoot'] / f for f in ('host-receipt.json', 'seal.json')]
            if name == 'iterate':
                evidence.append(paths['attemptRoot'] / 'trace/git-state.json')
            runtime_allowed = (not initial and name == 'iterate' and scenario == SCENARIO
                               and slot <= min(5, len(closed) + 1))
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
            if is_closed:
                closed_proof(task, paths, Path(namespace['cohortsRoot']) / name / scenario / f'slot-{slot}',
                             corpus_ref, grant_ref, driver_files)
            else:
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
    if 'firstStage' not in job:
        return
    stage = job['firstStage']
    keys(stage, ('schemaVersion', 'corpus', 'grant', 'ordinal'), 'worker firstStage')
    context = {key: stage[key] for key in ('schemaVersion', 'corpus', 'grant')}
    for ref in (stage['corpus'], stage['grant']):
        reference(ref)
        require(job['pins'].get(ref['path']) == ref['sha256'], 'stage job external pin changed')
    helper = str(HERE / 'eval_first_stage.py')
    require(job['pins'].get(helper) == sha_bytes(read_bytes(helper)), 'stage helper actual bytes are not job-pinned')
    data = validate_stage_task(context, job['task'], job['artifactDir'], ordinal=stage['ordinal'])
    corpus, config = data['corpusData'], data['config']
    require(job['configFile'] == corpus['config']['path'] and job['pins'].get(job['configFile']) == corpus['config']['sha256']
            and job['source'] == corpus['source']['root'] and job['profilesRoot'] == config['profilesRoot']
            and job['qualificationDigest'] == config['qualificationDigest'] and job['node'] == config['node']
            and job['authFile'] == config['authFile']
            and job['binary'] == config['toolchain']['binary']['path'] and job['operator'] == corpus['operator']['path']
            and job['operatorSha256'] == corpus['operator']['sha256'], 'stage job actual launch binding changed')
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


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus', type=Path, required=True)
    parser.add_argument('--corpus-sha256', required=True)
    parser.add_argument('--grant', type=Path, required=True)
    parser.add_argument('--grant-sha256', required=True)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--auth-file', type=Path)
    args = parser.parse_args(argv)
    context = validate_first_stage(args.corpus, args.corpus_sha256, args.grant, args.grant_sha256)
    data = context_data(context, initial=True)
    if not args.execute:
        print(json.dumps({'mode': 'static-dry-run', 'stageId': STAGE_ID,
                          'selected': data['grantData']['orderedTasks'], 'fullPreparedTasks': 155,
                          'liveSourceChecked': False, 'liveQualificationChecked': False,
                          'fullCorpusAccepted': False, 'continuationAuthorized': False}))
        return 0
    require(args.auth_file is not None, 'execute requires an explicit auth reference')
    spec = importlib.util.spec_from_file_location('first_stage_coordinator', HERE / 'run-cohorts.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    corpus, config = data['corpusData'], data['config']
    driver = module.Driver(corpus['config']['path'], config['profilesRoot'], operator=corpus['operator']['path'],
                           operator_sha256=corpus['operator']['sha256'], binary=config['toolchain']['binary']['path'],
                           auth_file=args.auth_file, node=config['node'], first_stage=context)
    previous = {sig: signal.signal(sig, driver.interrupt) for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)}
    try:
        summary = run_first_stage(context, driver)
        return 128 + driver.interrupted_signal if driver.interrupted_signal else int(not summary['stageCompleted'])
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)
        driver.close()


if __name__ == '__main__':
    raise SystemExit(main())
