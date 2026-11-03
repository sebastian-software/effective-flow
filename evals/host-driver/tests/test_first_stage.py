"""Model-free first-stage contract tests; self-contained after source integration.

Synthetic fixtures are not original/native qualification or execution grants.
Corpus authentication and fixed-task policy are exercised with synthetic pinned bytes.
Acceptance fixtures compute original build identities, seals and three suite verdicts.
"""
from __future__ import annotations

from contextlib import ExitStack
import ast
import concurrent.futures
import copy
import io
import hashlib
import importlib.util
import itertools
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get('D3_SOURCE_ROOT', str(HERE.parents[1])))
SUITES = ('merge-gate', 'iterate', 'next-steps')
POLICY = ('workspace-write;approval-never;network-disabled;isolated-home;'
          'attempt-root-writable;ignore-user-config;ignore-rules')
STAGE_ID = 'iterate-duplicated-control-line-aborts-slots-1-5-v1'
REMAINING_STAGE_ID = 'remaining-150-v1'
LOCAL_RUN, LOCAL_POPEN = subprocess.run, subprocess.Popen
LOCAL_WAITPID, LOCAL_KILL = os.waitpid, os.kill
TEST_TEMP_ROOT = (Path('/private/tmp') if Path('/private/tmp').is_dir()
                  else Path(tempfile.gettempdir())).resolve()


def forbidden(*args, **kwargs):
    raise AssertionError('in-process test process/signal boundary forbidden')


class ForbiddenPopen:
    def __init__(self, *args, **kwargs):
        forbidden()

    send_signal = terminate = kill = forbidden


def inert_boundaries(stack):
    for name in ('kill', 'killpg', 'fork', 'forkpty', 'wait', 'waitpid', 'wait3', 'wait4',
                 'system', 'posix_spawn', 'posix_spawnp', 'spawnl', 'spawnle', 'spawnlp',
                 'spawnlpe', 'spawnv', 'spawnve', 'spawnvp', 'spawnvpe', 'execl', 'execle',
                 'execlp', 'execlpe', 'execv', 'execve', 'execvp', 'execvpe', '_exit'):
        if hasattr(os, name):
            stack.enter_context(mock.patch.object(os, name, forbidden))
    stack.enter_context(mock.patch.object(subprocess, 'Popen', ForbiddenPopen))
    for name in ('run', 'call', 'check_call', 'check_output'):
        stack.enter_context(mock.patch.object(subprocess, name, forbidden))
    for name in ('signal', 'raise_signal', 'pthread_kill'):
        if hasattr(signal, name):
            stack.enter_context(mock.patch.object(signal, name, forbidden))


def digest(path):
    return 'sha256:' + hashlib.sha256(Path(path).read_bytes()).hexdigest()


def ref(path):
    return {'path': str(path), 'sha256': digest(path)}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, separators=(',', ':')) + '\n')
    return ref(path)


def identity(path):
    info = path.stat()
    return {'dev': info.st_dev, 'ino': info.st_ino}


def canonical_digest(value):
    return 'sha256:' + hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def stable_ast_dump(node):
    try:
        return ast.dump(node, include_attributes=False, show_empty=False)
    except TypeError:
        normalized = copy.deepcopy(node)
        for current in ast.walk(normalized):
            if hasattr(current, '_fields'):
                current._fields = tuple(field for field in current._fields
                                        if not (isinstance(getattr(current, field, None), list)
                                                and not getattr(current, field)))
        return ast.dump(normalized, include_attributes=False)


class StageFixture:
    """Complete synthetic 155-slot authorization fixture, confined to a fresh root."""
    def __init__(self, root):
        self.root = root
        self.source = root / 'frozen'
        self.output = root / 'output'
        self.profiles = root / 'profiles'
        self.driver = self.source / 'evals/host-driver'
        for path in (self.source, self.output, self.profiles, self.driver):
            path.mkdir(parents=True, exist_ok=True)
        for name in ('run-cohorts.py', 'eval_host_worker.py', 'eval_driver_runtime.py', 'eval_first_stage.py'):
            shutil.copyfile(HERE / name, self.driver / name)
        for name in ('host-run.mjs', '_scaffold/host-profile-storage.mjs',
                     '_scaffold/host-profile-cleanup.mjs', '_scaffold/host-profile-process.mjs',
                     '_scaffold/host-profile-child.mjs', '_scaffold/host-qualification.mjs'):
            destination = self.source / 'evals' / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SOURCE / 'evals' / name, destination)
        self.node = root / 'node-fixture'
        self.python = root / 'python-fixture'
        self.operator = root / 'operator.mjs'
        self.bundle = root / 'qualification.json'
        self.auth = root / 'fixture-auth.json'
        self.auth.write_text('{}\n')
        for path in (self.node, self.python, self.operator, self.bundle):
            path.write_text('synthetic pinned bytes; never executed\n')
        artifacts = {}
        for name in ('binary', 'companion', 'binaryArchive', 'companionArchive', 'binaryReceipt', 'companionReceipt'):
            path = root / ('toolchain-' + name)
            path.write_text(name + ': synthetic never executed\n')
            artifacts[name] = ref(path)
        write_json(self.bundle, {'toolchain': artifacts})
        self.namespace = {'outputRoot': str(self.output), 'outputIdentity': identity(self.output),
                          'profilesRoot': str(self.profiles), 'profilesIdentity': identity(self.profiles),
                          'cohortsRoot': str(self.output / 'cohorts')}
        self.config = {'schemaVersion': 1, 'frozenRoot': str(self.source),
                       'expectedFrozenHead': 'a' * 40, 'expectedFrozenTree': 'b' * 40,
                       'outputRoot': str(self.output), 'profilesRoot': str(self.profiles),
                       'driverRoot': str(self.source), 'node': str(self.node), 'python': str(self.python),
                       'authFile': str(self.auth),
                       'toolchain': artifacts, 'qualificationDigest': digest(self.bundle),
                       'probeBundle': str(self.bundle), 'profiles': {}}
        for suite in SUITES:
            self.config['profiles'][suite] = {
                'harness': 'codex-cli', 'model': 'gpt-6.1-sol' if suite == 'next-steps' else 'gpt-6-sol',
                'reasoningEffort': 'high' if suite == 'next-steps' else 'medium',
                'reportedVersion': '0.163.0', 'toolPolicy': POLICY +
                (';nesting-by-scenario' if suite == 'merge-gate' else ';ephemeral' if suite == 'next-steps' else '')}
        self.config_path = root / 'config.json'
        write_json(self.config_path, self.config)
        static = canonical_digest({key: value for key, value in self.config.items() if key != 'qualificationDigest'})
        self.records, suites = [], []
        for suite in SUITES:
            suite_root = self.source / 'evals' / suite
            suite_root.mkdir()
            for name in ('scenario-registry.mjs', 'suite.config.mjs'):
                shutil.copyfile(SOURCE / 'evals' / suite / name, suite_root / name)
            registry_text = (suite_root / 'scenario-registry.mjs').read_text()
            # Original discoverSuite/selectScenarios orders names canonically, not by registry export.
            names = sorted(re.findall(r"'([a-z0-9-]+)'", registry_text.split('Object.freeze([', 1)[1]))
            assert len(names) == {'merge-gate': 9, 'iterate': 7, 'next-steps': 15}[suite]
            base = self.output / suite
            round_root = base / 'round-model-free'
            build = round_root / 'build/dist/portable/effective-flow'
            build.mkdir(parents=True)
            (build / 'SKILL.md').write_text('Synthetic immutable skill; no model invocation\n')
            profile = self.config['profiles'][suite]
            tasks, records, slots, identities, immutable = [], [], [], {}, {}
            for scenario in names:
                fixture = suite_root / 'fixtures' / (scenario + '.json')
                scenario_md = suite_root / 'scenarios' / (scenario + '.md')
                write_json(fixture, {'synthetic': scenario})
                scenario_md.parent.mkdir(exist_ok=True)
                scenario_md.write_text('Synthetic source scenario ' + scenario + '\n')
                # Synthetic declared identity: exact object agreement and actual files matter;
                # the separate original-API seal fixture proves the genuine identity algorithm.
                build_id = {'scenario': scenario, 'digest': 'sha256:' + 'c' * 64,
                            'skill': {'digest': 'sha256:' + 'd' * 64, 'versionNeutralDigest': 'sha256:' + 'e' * 64,
                                      'files': {'SKILL.md': digest(build / 'SKILL.md')}},
                            'instrument': {'digest': 'sha256:' + 'f' * 64,
                                           'files': {'evals/' + suite + '/suite.config.mjs': digest(suite_root / 'suite.config.mjs')}},
                            'scenario_inputs': {'digest': 'sha256:' + '1' * 64,
                                                'files': {str(path.relative_to(self.source)): digest(path)
                                                          for path in (fixture, scenario_md)}}}
                identities[scenario] = build_id
                for slot in range(1, 6):
                    slot_root = round_root / 'slots' / scenario / ('slot-' + str(slot))
                    attempt = slot_root / 'attempt-1'
                    project, skill, trace = attempt / 'project', attempt / 'skill', attempt / 'trace'
                    project.mkdir(parents=True)
                    skill.mkdir()
                    trace.mkdir()
                    project_config = project / 'docs/adr/effective-flow-project-setup.md'
                    project_config.parent.mkdir(parents=True)
                    project_config.write_text('Synthetic setup\n')
                    (project / 'AGENTS.md').write_text('Synthetic project\n')
                    shutil.copyfile(build / 'SKILL.md', skill / 'SKILL.md')
                    (skill / 'scripts').mkdir()
                    (skill / 'scripts/remote-tracker.mjs').write_text('// inert synthetic tracker\n')
                    shutil.copyfile(fixture, attempt / 'fixture.json')
                    prompt = attempt / 'prompt.txt'
                    prompt.write_text('Synthetic task ' + suite + '/' + scenario + '/' + str(slot) + '\n')
                    build_path, metadata = trace / 'build-identity.json', attempt / 'run-metadata.json'
                    write_json(build_path, build_id)
                    write_json(metadata, {'schemaVersion': 1, 'scenario': scenario, 'slot': slot, 'attempt': 1,
                                          'projectRoot': str(project), 'skillRoot': str(skill),
                                          'promptDigest': digest(prompt), 'fixtureDigest': digest(attempt / 'fixture.json'),
                                          'profile': profile})
                    expected_paths = {'buildIdentity': build_path, 'fixture': attempt / 'fixture.json',
                                      'projectAgents': project / 'AGENTS.md', 'projectConfig': project_config,
                                      'prompt': prompt, 'runMetadata': metadata,
                                      'trackerStub': skill / 'scripts/remote-tracker.mjs'}
                    expected = {key: digest(path) for key, path in expected_paths.items()}
                    state = slot_root / 'state.json'
                    write_json(state, {'schemaVersion': 1, 'currentAttempt': 1, 'discardedAttempts': 0,
                                       'expectedDigests': expected})
                    task = {'suite': suite, 'scenario': scenario, 'slot': slot, 'projectRoot': str(project),
                            'attemptRoot': str(attempt), 'prompt': str(prompt), 'runMetadata': str(metadata),
                            'profile': profile}
                    record = {'task': task, 'prompt': ref(prompt), 'runMetadata': ref(metadata),
                              'state': ref(state), 'buildIdentity': ref(build_path)}
                    tasks.append(task)
                    records.append(record)
                    self.records.append(record)
                    slots.append({'scenario': scenario, 'slot': slot, 'slotRoot': str(slot_root),
                                  'promptDigest': digest(prompt), 'expectedDigests': expected})
                    for path in (*expected_paths.values(), state, skill / 'SKILL.md', build / 'SKILL.md',
                                 suite_root / 'suite.config.mjs', fixture, scenario_md):
                        immutable[str(path)] = ref(path)
            manifest = round_root / 'manifest.json'
            write_json(manifest, {'schemaVersion': 1, 'roundId': 'round-model-free',
                                 'createdAt': '2026-10-31T00:00:00.000Z', 'creatorCheckout': str(self.source),
                                 'sourceRevision': 'a' * 40, 'requiredRuns': 5, 'scenarios': names,
                                 'profile': profile, 'builtSkillRoot': str(build),
                                 'identities': identities, 'slots': slots})
            prepared = self.output / ('prepared-' + suite + '.json')
            write_json(prepared, {'schemaVersion': 1, 'base': str(base), 'roundRoot': str(round_root),
                                 'manifestPath': str(manifest),
                                 'sourceHead': 'a' * 40, 'sourceTree': 'b' * 40,
                                 'staticConfigDigest': static, 'tasks': tasks})
            suites.append({'name': suite, 'registry': ref(suite_root / 'scenario-registry.mjs'),
                           'suiteConfig': ref(suite_root / 'suite.config.mjs'), 'prepared': ref(prepared),
                           'roundManifest': ref(manifest), 'profile': profile, 'tasks': records,
                           'immutableInputs': sorted(immutable.values(), key=lambda item: item['path'])})
        driver_paths = [self.driver / name for name in ('run-cohorts.py', 'eval_host_worker.py',
                        'eval_driver_runtime.py', 'eval_first_stage.py')]
        driver_paths += [self.source / 'evals' / name for name in ('host-run.mjs',
                        '_scaffold/host-profile-storage.mjs', '_scaffold/host-profile-cleanup.mjs',
                        '_scaffold/host-profile-process.mjs', '_scaffold/host-profile-child.mjs')]
        self.corpus = {'schemaVersion': 1, 'kind': 'effective-flow-host-first-stage-corpus',
                       'source': {'root': str(self.source), 'head': 'a' * 40, 'tree': 'b' * 40},
                       'namespace': self.namespace, 'config': ref(self.config_path),
                       'operator': ref(self.operator),
                       'toolchain': {'node': ref(self.node), 'python': ref(self.python), 'artifacts': artifacts},
                       'qualification': {'bundle': ref(self.bundle),
                                         'policy': ref(self.source / 'evals/_scaffold/host-qualification.mjs')},
                       'driverFiles': [ref(path) for path in driver_paths], 'suites': suites}
        self.corpus_path = root / 'corpus.json'
        write_json(self.corpus_path, self.corpus)
        self.grant = {'schemaVersion': 1, 'kind': 'effective-flow-host-first-stage-grant',
                      'stageId': STAGE_ID, 'corpus': ref(self.corpus_path), 'config': ref(self.config_path),
                      'namespace': self.namespace, 'orderedTasks': [
                          {'suite': 'iterate', 'scenario': 'duplicated-control-line-aborts', 'slot': slot,
                           'artifactDir': str(self.output / 'cohorts/iterate/duplicated-control-line-aborts' / ('slot-' + str(slot)))}
                          for slot in range(1, 6)], 'maximumChargedRoots': 5, 'concurrency': 1,
                      'allowRetry': False, 'allowResume': False, 'allowContinuation': False,
                      'fullCorpusAcceptance': False}
        self.grant_path = root / 'grant.json'
        write_json(self.grant_path, self.grant)
        self.reload_stage()

    def reload_stage(self):
        sys.path.insert(0, str(self.driver))
        spec = importlib.util.spec_from_file_location('first_stage_independent_fixture', self.driver / 'eval_first_stage.py')
        self.stage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.stage)

    def publish_synthetic_pins(self):
        # Explicit synthetic authority for mutation tests; never a real execution packet.
        write_json(self.corpus_path, self.corpus)
        self.grant['corpus'] = ref(self.corpus_path)
        write_json(self.grant_path, self.grant)

    def validate(self, **kwargs):
        return self.stage.validate_first_stage(self.corpus_path, digest(self.corpus_path),
                                              self.grant_path, digest(self.grant_path), **kwargs)

    def selected(self):
        return [record['task'] for record in self.records if record['task']['suite'] == 'iterate'
                and record['task']['scenario'] == 'duplicated-control-line-aborts']

    def job(self, task, context):
        runtime = __import__('eval_driver_runtime')
        artifact = self.output / 'cohorts' / task['suite'] / task['scenario'] / ('slot-' + str(task['slot']))
        artifact.mkdir(parents=True, exist_ok=False)
        gate = self.output / 'cohorts/launch-gate'
        if not gate.exists():
            gate.write_bytes(b'')
            gate.chmod(0o600)
        remaining = 'admission' in context
        fifo = (self.profiles / 'remaining-stage-cancellation.fifo' if remaining
                else self.output / 'cohorts/cancellation')
        if not fifo.exists():
            os.mkfifo(fifo, 0o600)
        profile_id = '-'.join(str(task[key]) for key in ('suite', 'scenario', 'slot'))
        profile = self.profiles / ('profile-' + profile_id)
        home, codehome = profile / 'home', profile / 'codex-home'
        home.mkdir(parents=True)
        codehome.mkdir()
        write_json(profile / 'host-profile.json', {
            'schema': 1, 'kind': 'effective-flow-host-profile', 'id': profile_id,
            'phase': 'armed', 'ownerPid': os.getpid(), 'childPgid': os.getpgrp(),
            'root': identity(self.profiles), 'directory': identity(profile)})
        pins = {item['path']: item['sha256'] for item in self.corpus['driverFiles']}
        pins.update({str(path): digest(path) for path in
                     (self.corpus_path, self.grant_path, self.config_path, self.operator,
                      Path(self.config['toolchain']['binary']['path']), Path(task['prompt']), Path(task['runMetadata']))})
        job = {'artifactDir': str(artifact), 'profilesRoot': str(self.profiles), 'task': task,
               'binary': self.config['toolchain']['binary']['path'], 'node': str(self.node),
               'operator': str(self.operator), 'operatorSha256': digest(self.operator),
               'authFile': str(self.auth),
               'configFile': str(self.config_path), 'source': str(self.source),
               'qualificationDigest': self.config['qualificationDigest'], 'timeoutSeconds': 125,
               'modelTimeoutSeconds': 3, 'coordinatorPid': os.getpid(), 'cancellationPath': str(fifo),
               'blockerPath': str(self.output / 'cohorts/launch-blocked'), 'launchGatePath': str(gate),
               'fixtureTools': True, 'pins': pins, 'driverDigest': digest(self.driver / 'run-cohorts.py'),
               'firstStage': {**context, 'ordinal': task['slot']}}
        job['accounting'] = runtime.capture_accounting_paths(artifact, self.output, gate)
        if remaining:
            order = self.stage.remainder_tasks([r['task'] for r in self.records])
            ordinal = order.index(task) + 1
            job.pop('firstStage')
            job['remainingStage'] = {**context, 'ordinal': ordinal, 'batch': (ordinal - 1) // 6 + 1}
            for item in context.values():
                if isinstance(item, dict) and set(item) == {'path', 'sha256'}:
                    pins[item['path']] = item['sha256']
        write_json(artifact / 'task.json', task)
        job_path = artifact / 'worker-job.json'
        write_json(job_path, job)
        return job, job_path, home, codehome

    def run_worker(self, task, context, *, qualify=None, after_reserve=None, prepare_job=None, clock=None):
        job, job_path, home, codehome = self.job(task, context)
        if prepare_job:
            prepare_job(job)
            write_json(job_path, job)
        spec = importlib.util.spec_from_file_location('d3_inert_worker', self.driver / 'eval_host_worker.py')
        worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(worker)
        model_calls, heartbeats = [], []
        actual_write = os.write
        actual_reserve = worker.reserve_launch

        def write(fd, data):
            if data in (b'model\n', b'done\n'):
                heartbeats.append(data)
                return len(data)
            return actual_write(fd, data)

        def model(*args, **kwargs):
            assert (Path(job['artifactDir']) / 'launch-consumption.json').is_file()
            model_calls.append((args, kwargs))
            return mock.Mock(pid=os.getpid(), wait=mock.Mock(return_value=0),
                             send_signal=mock.Mock(), terminate=mock.Mock(), kill=mock.Mock())

        def reserve(*args, **kwargs):
            result = actual_reserve(*args, **kwargs)
            if after_reserve:
                after_reserve(job)
            return result

        q = subprocess.CompletedProcess([], 0, json.dumps({
            'qualificationDigest': job['qualificationDigest'], 'profile': task['profile'],
            'expiresAt': '2099-01-01T00:00:00.000Z'}), '')
        with ExitStack() as stack:
            stack.enter_context(mock.patch.dict(sys.modules, {'eval_first_stage': self.stage}))
            stack.enter_context(mock.patch.dict(os.environ, {'HOME': str(home), 'CODEX_HOME': str(codehome)}))
            stack.enter_context(mock.patch.object(os, 'fork', return_value=424242))
            stack.enter_context(mock.patch.object(os, 'waitpid', return_value=(424242, 0)))
            stack.enter_context(mock.patch.object(os, 'write', write))
            stack.enter_context(mock.patch.object(subprocess, 'run', side_effect=qualify or (lambda *a, **k: q)))
            stack.enter_context(mock.patch.object(subprocess, 'Popen', model))
            stack.enter_context(mock.patch.object(worker, 'reserve_launch', reserve))
            if clock:
                stack.enter_context(mock.patch.object(worker, 'now', clock))
            try:
                code = worker.main(['--job', str(job_path), '--digest', digest(job_path)])
                error = None
            except Exception as caught:
                code, error = None, caught
        return {'code': code, 'error': error, 'job': job, 'jobPath': job_path,
                'modelCalls': model_calls, 'heartbeats': heartbeats}

    def synthetic_seal(self, task, worker_result):
        """Fixture operator's completed output; original API is a separate fixture."""
        attempt = Path(task['attemptRoot'])
        profile = task['profile']
        write_json(attempt / 'host-receipt.json', {'schemaVersion': 1, 'nonForked': True,
                   'initialWorkingRoot': task['projectRoot'], 'taskInput': 'rendered-prompt-only',
                   'completed': True, 'profile': profile})
        (attempt / 'trace/tracker-calls.jsonl').write_bytes(b'')
        (attempt / 'trace/report-channel.jsonl').write_text('synthetic model-free report\n')
        (attempt / 'trace/git-state.json').write_text('synthetic immutable output\n')
        state = json.loads((attempt.parent / 'state.json').read_text())
        digests = {**state['expectedDigests'], 'log': digest(attempt / 'trace/tracker-calls.jsonl'),
                   'hostReceipt': digest(attempt / 'host-receipt.json'),
                   'reportChannel': digest(attempt / 'trace/report-channel.jsonl'),
                   'gitState': digest(attempt / 'trace/git-state.json')}
        build = json.loads((attempt / 'trace/build-identity.json').read_text())
        write_json(attempt / 'seal.json', {'schemaVersion': 1, 'scenario': task['scenario'], 'slot': task['slot'],
                   'attempt': 1, 'sealedAt': '2026-10-31T00:00:00.000Z', 'buildDigest': build['digest'], 'digests': digests})
        result = {**{key: task[key] for key in ('suite', 'scenario', 'slot')}, 'state': 'sealed',
                  'completed': True, 'consumptionState': 'reserved', 'chargedRoots': 1,
                  'actualModelStarted': True, 'cleanupComplete': True, 'groupGone': True,
                  'validityProblems': [], 'findings': [], 'nativeErrors': [], 'timedOut': False,
                  'malformedStream': False, 'watchdogStopReason': None}
        write_json(Path(worker_result['job']['artifactDir']) / 'operator-result.json', result)
        return result


ORIGINAL_SEAL_BRIDGE = r'''
// Offline computation only. Install process/network denial before importing the original APIs.
import childProcess from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const deny = () => { throw new Error('offline seal fixture forbids external/process access'); };
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) childProcess[name] = deny;
for (const module of [net, http, https]) for (const name of ['connect', 'createConnection', 'request', 'get', 'createServer']) if (name in module) module[name] = deny;
globalThis.fetch = deny;
process.kill = deny;
syncBuiltinESMExports();
const [source, requestPath] = process.argv.slice(2);
const load = (file) => import(pathToFileURL(resolve(source, file)));
const { scenarioBuildIdentity, digestFile } = await load('evals/_scaffold/build-identity.mjs');
const { sealAttempt } = await load('evals/_scaffold/round-core.mjs');
const { evaluateEvidence } = await load('evals/_scaffold/evaluate.mjs');
const { reportRecord } = await load('evals/iterate/_scaffold/report-channel.mjs');
const { untouchedGitState } = await load('evals/iterate/_scaffold/git-state.mjs');
const { STATE_SCHEMA } = await load('evals/next-steps/_scaffold/state.mjs');
const request = JSON.parse(readFileSync(requestPath));
const json = (path) => JSON.parse(readFileSync(path));
const save = (path, value) => writeFileSync(path, JSON.stringify(value) + '\n');
const answers = [];
for (const row of request.suites) {
  const original = (await load(`evals/${row.name}/suite.config.mjs`)).default;
  // Small synthetic subject/instrument; unchanged original scenario evaluator and seal algorithm.
  const suite = { ...original, loadSetSeeds: ['SKILL.md'], instrumentFiles: [resolve(original.root, 'suite.config.mjs')],
    overlay: { applies: () => false, extraSeeds: () => [] } };
  if (row.name === 'iterate') suite.sealedEvidence = { ...original.sealedEvidence,
    capture: ({ paths }) => JSON.stringify(untouchedGitState(json(paths.fixture))) + '\n' };
  if (row.name === 'next-steps') suite.sealedEvidence = { ...original.sealedEvidence,
    capture: () => JSON.stringify({schema: STATE_SCHEMA, before: {}, after: {}, errors: []}) + '\n' };
  const manifest = json(row.manifest);
  if (request.operation === 'initialize') {
    manifest.creatorCheckout = realpathSync(source);
    for (const task of row.tasks) {
      const attempt = task.attemptRoot;
      const build = scenarioBuildIdentity(suite, task.scenario, resolve(attempt, 'skill'));
      manifest.identities[task.scenario] = build;
      save(resolve(attempt, 'trace/build-identity.json'), build);
      const metadataPath = task.runMetadata, metadata = json(metadataPath);
      metadata.fixtureDigest = digestFile(resolve(attempt, 'fixture.json'));
      save(metadataPath, metadata);
      const statePath = resolve(attempt, '../state.json'), state = json(statePath);
      state.expectedDigests.buildIdentity = digestFile(resolve(attempt, 'trace/build-identity.json'));
      state.expectedDigests.fixture = digestFile(resolve(attempt, 'fixture.json'));
      state.expectedDigests.runMetadata = digestFile(metadataPath);
      save(statePath, state);
      const slot = manifest.slots.find((x) => x.scenario === task.scenario && x.slot === task.slot);
      slot.expectedDigests = state.expectedDigests;
    }
    save(row.manifest, manifest);
    continue;
  }
  for (const task of row.tasks) {
    const attempt = task.attemptRoot, trace = resolve(attempt, 'trace');
    const fixture = json(resolve(attempt, 'fixture.json'));
    const records = [], at = '2026-10-31T00:00:00.000Z';
    const call = (operation, apply = false) => {
      const seq = records.length + 1;
      if (suite.evaluator.usesLifecycleSchema(task.scenario)) {
        records.push({seq, operation, apply, cwd: task.projectRoot, at, event: 'start', callId: `fixture-${seq}`});
        records.push({seq: seq + 1, at, event: 'complete', callId: `fixture-${seq}`});
      } else records.push({seq, operation, apply, cwd: task.projectRoot, at});
    };
    let auxiliary = null;
    if (row.name === 'iterate') {
      const oracle = suite.evaluator.FORGE_READING[task.scenario];
      if (oracle) for (const operation of suite.evaluator.PHASE_ONE_READS) call(operation);
      const text = suite.evaluator.PHASE_ZERO_REFUSALS[task.scenario] ??
        (oracle.refusal ? `${oracle.names.join(', ')}\n${oracle.refusal}` : 'DONE');
      auxiliary = JSON.stringify({seq: 1, ...reportRecord(text)}) + '\n';
      writeFileSync(resolve(trace, 'report-channel.jsonl'), auxiliary);
    } else if (row.name === 'next-steps') {
      const expected = suite.evaluator.EXPECTATIONS[task.scenario];
      const text = expected.first === null ? `No invocation. ${expected.reportIdentity ?? ''}` :
        `${(expected.reportTokens ?? []).join(' ')}\nNext steps\n/effective-flow ${expected.first} — ${(expected.optionTokens ?? []).join(' ')} Review the next step.`;
      auxiliary = JSON.stringify({seq: 1, ...reportRecord(text)}) + '\n';
      writeFileSync(resolve(trace, 'report-channel.jsonl'), auxiliary);
    } else {
      const scenario = task.scenario;
      const dispatch = ['non-interactive-dispatch-reports', 'nested-spawn-abort-runs-inline'].includes(scenario);
      if (dispatch) { call('probe'); call('probe'); }
      if (scenario === 'unreported-checks-at-phase-four') { call('pr-status-read'); call('pr-status-read'); call('pr-status-read'); }
      for (let n = 0; n < 2; n++) for (const operation of ['review-threads-read', 'pr-comments-read', 'pr-reviews-read']) call(operation);
      if (scenario === 'unreported-checks-block-merge') call('pr-status-read');
      if (scenario === 'linked-issue-open-points') call('issue-comments-read');
      if (['merge-proceeds', 'bot-login-excluded', 'nested-spawn-abort-runs-inline'].includes(scenario)) call('pr-merge', true);
      if (scenario === 'configured-reviewer-set-aside-blocks') {
        const review = fixture.operations['pr-reviews-read'].envelope.data.result[0];
        const { sha256 } = await load('evals/iterate/_scaffold/report-channel.mjs');
        const items = [{kind: 'thread', identifier: 'fixture-thread', threadId: 'PRRT_kwDOconfiguredReviewer'},
          {kind: 'review-body', identifier: 'fixture-review', reviewId: String(review.id), author: review.author.login}];
        auxiliary = JSON.stringify({schema: 'effective-flow/merge-gate-iterate-echo/v1', seq: 1, cwd: task.projectRoot,
          pullRequest: 42, itemFilter: 'threads=PRRT_kwDOconfiguredReviewer',
          controls: {summaryComment: 'suppressed', nextSteps: 'suppressed', reviewGuard: 'established'},
          body: {spans: 1, bytes: Buffer.byteLength(review.body), digest: sha256(review.body)}, items,
          outcomes: items.map(({identifier}) => ({identifier, outcome: 'deferred'}))}) + '\n';
        writeFileSync(resolve(trace, 'iterate-calls.jsonl'), auxiliary);
      }
    }
    const logText = records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : '');
    writeFileSync(resolve(trace, 'tracker-calls.jsonl'), logText);
    const receipt = {schemaVersion: 1, nonForked: true, initialWorkingRoot: task.projectRoot,
      taskInput: 'rendered-prompt-only', completed: true, profile: task.profile};
    const seal = sealAttempt(suite, {handle: row.manifest, scenario: task.scenario, slot: task.slot,
      hostReceipt: receipt, base: row.base});
    const sealedEvidenceText = suite.sealedEvidence ? readFileSync(resolve(trace, suite.sealedEvidence.fileName), 'utf8') : null;
    const evidence = {scenario: task.scenario, logText, fixture, projectRoot: task.projectRoot,
      buildIdentity: json(resolve(trace, 'build-identity.json')), expectedBuildIdentity: manifest.identities[task.scenario],
      answerableOperations: new Set(Object.keys(fixture.operations ?? {})), auxiliaryText: auxiliary, sealedEvidenceText};
    const result = evaluateEvidence(suite, evidence);
    if (result.validityProblems.length || result.findings.length) throw new Error(JSON.stringify({task, result}));
    const negative = evaluateEvidence(suite, {...evidence, logText: '', auxiliaryText: auxiliary === null ? null : ''});
    if (!negative.validityProblems.length && !negative.findings.length) throw new Error('original evaluator accepted missing synthetic outcome');
    answers.push({suite: row.name, scenario: task.scenario, slot: task.slot, seal, validityProblems: result.validityProblems, findings: result.findings});
  }
}
save(request.output, {fixtureOnly: true, qualifiedHost: false, originalComputations: answers});
'''


class OriginalSealFixture(StageFixture):
    """Original seal/evaluator computations, with synthetic host observations only."""
    def __init__(self, root):
        super().__init__(root)
        shutil.copytree(SOURCE / 'evals/_scaffold', self.source / 'evals/_scaffold', dirs_exist_ok=True)
        shutil.copytree(SOURCE / 'src/scripts', self.source / 'src/scripts')
        for suite in SUITES:
            shutil.copytree(SOURCE / 'evals' / suite / '_scaffold', self.source / 'evals' / suite / '_scaffold')
            for record in (r for r in self.records if r['task']['suite'] == suite):
                task = record['task']
                original = SOURCE / 'evals' / suite / 'fixtures' / (task['scenario'] + '.json')
                shutil.copyfile(original, self.source / 'evals' / suite / 'fixtures' / original.name)
                shutil.copyfile(original, Path(task['attemptRoot']) / 'fixture.json')
        for path in self.output.rglob('SKILL.md'):
            path.write_text('Synthetic offline subject.\n`effective-flow <tool>` (version 0.0.0 (fixture)).\n')
        self.bridge = root / 'original-seal-bridge.mjs'
        self.bridge.write_text(ORIGINAL_SEAL_BRIDGE)
        self.computations = []
        self.compute('initialize', [r['task'] for r in self.records])
        for suite in self.corpus['suites']:
            for record in suite['tasks']:
                for key in ('state', 'buildIdentity', 'runMetadata'):
                    record[key] = ref(record[key]['path'])
            suite['roundManifest'] = ref(suite['roundManifest']['path'])
            suite['immutableInputs'] = [ref(item['path']) for item in suite['immutableInputs']]
        self.publish_synthetic_pins()
        self.reload_stage()

    def compute(self, operation, tasks):
        request = self.root / 'seal-request.json'
        output = self.root / 'seal-response.json'
        rows = [{'name': suite['name'], 'manifest': suite['roundManifest']['path'],
                 'base': str(self.output / suite['name']),
                 'tasks': [task for task in tasks if task['suite'] == suite['name']]}
                for suite in self.corpus['suites']]
        write_json(request, {'operation': operation, 'suites': rows, 'output': str(output)})
        command = [shutil.which('node'), str(self.bridge), str(self.source), str(request)]
        owned = set()
        def local_only(args, *rest, **kwargs):
            if args != command or rest or kwargs.get('cwd') != str(self.root):
                forbidden()
            process = LOCAL_POPEN(args, **kwargs)
            owned.add(process.pid)
            return process
        def owned_wait(pid, options):
            if pid not in owned:
                forbidden()
            return LOCAL_WAITPID(pid, options)
        def owned_kill(pid, sig):
            if pid not in owned:
                forbidden()
            return LOCAL_KILL(pid, sig)
        environment = {'PATH': os.defpath, 'HOME': str(self.root), 'TMPDIR': str(self.root)}
        with mock.patch.object(subprocess, 'Popen', local_only), \
             mock.patch.object(os, 'waitpid', owned_wait), mock.patch.object(os, 'kill', owned_kill):
            result = LOCAL_RUN(command, cwd=str(self.root), env=environment, text=True,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        if result.returncode:
            raise AssertionError('original seal fixture failed: ' + result.stderr)
        result = json.loads(output.read_text())
        assert result['fixtureOnly'] is True and result['qualifiedHost'] is False
        self.computations.extend(result['originalComputations'])
        return result['originalComputations']

    def close_task(self, task, worker_result, *, compute=True):
        if compute:
            self.compute('seal', [task])
        artifact = Path(worker_result['job']['artifactDir'])
        runner = json.loads((artifact / 'runner-profile.json').read_text())
        profile = Path(runner['profilePath'])
        record = json.loads((profile / 'host-profile.json').read_text())
        runtime = __import__('eval_driver_runtime')
        write_json(profile / 'host-profile-cleanup.json', {
            'schema': 1, 'profileId': record['id'],
            'caches': [{'path': name, 'status': 'removed'} for name in runtime.CACHE_PATHS]})
        write_json(artifact / 'process-termination.json', {'groupGone': True, 'cleanupComplete': True})
        result = {**{key: task[key] for key in ('suite', 'scenario', 'slot')}, 'state': 'sealed',
                  'completed': True, 'consumptionState': 'reserved', 'chargedRoots': 1,
                  'actualModelStarted': True, 'cleanupComplete': True, 'groupGone': True,
                  'validityProblems': [], 'findings': [], 'nativeErrors': [], 'timedOut': False,
                  'malformedStream': False, 'watchdogStopReason': None,
                  'fixtureOnly': True, 'qualifiedHost': False}
        write_json(artifact / 'operator-result.json', result)
        return result

    def prerequisites(self):
        context = self.validate()
        # These host observations are synthetic. Original worker boundaries are exercised by
        # the worker regressions; prerequisite authority comes from real D2 and original seals.
        self.original_jobs = [self.reserve_fixture_task(context, task) for task in self.selected()]
        self.compute('seal', self.selected())
        for task, result in zip(self.selected(), self.original_jobs):
            self.close_task(task, result, compute=False)
        # D3 normally unlinks its own cancellation pipe; attach must not recreate it.
        (self.output / 'cohorts/cancellation').unlink()
        self.original_summary = self.output / 'cohorts/first-stage-summary.json'
        write_json(self.original_summary, {'stageId': STAGE_ID, 'stageCompleted': True,
            'corpusSha256': digest(self.corpus_path), 'grantSha256': digest(self.grant_path),
            'chargedRoots': 999, 'started': -500, 'fixtureOnly': True, 'qualifiedHost': False})
        closures = []
        for result in self.original_jobs:
            job, job_path = result['job'], result['jobPath']
            artifact, attempt = Path(job['artifactDir']), Path(job['task']['attemptRoot'])
            runner = json.loads((artifact / 'runner-profile.json').read_text())
            profile = Path(runner['profilePath'])
            files = {path for root in (artifact, attempt) for path in root.rglob('*') if path.is_file()}
            files.update(profile / name for name in ('host-profile.json', 'host-profile-cleanup.json'))
            closures.append({'task': {key: job['task'][key] for key in ('suite', 'scenario', 'slot')},
                             'job': ref(job_path), 'files': [ref(path) for path in sorted(files)]})
        self.closures_path = self.root / 'original-closures.json'
        write_json(self.closures_path, {'schemaVersion': 1,
            'kind': 'effective-flow-host-first-stage-closures', 'closures': closures})
        tasks = independent_remainder([r['task'] for r in self.records])
        cohort = self.output / 'cohorts'
        self.remaining_grant = {'schemaVersion': 1, 'kind': 'effective-flow-host-remaining-stage-grant',
            'stageId': REMAINING_STAGE_ID, 'corpus': ref(self.corpus_path),
            'firstStageGrant': ref(self.grant_path), 'firstStageSummary': ref(self.original_summary),
            'closures': ref(self.closures_path), 'config': self.corpus['config'], 'namespace': self.namespace,
            'attach': __import__('eval_driver_runtime').capture_accounting_paths(cohort, self.output, cohort / 'launch-gate'),
            'orderedTasks': [{**{key: task[key] for key in ('suite', 'scenario', 'slot')},
                'artifactDir': str(cohort / task['suite'] / task['scenario'] / ('slot-' + str(task['slot'])))} for task in tasks],
            'maximumChargedRoots': 150, 'maximumCombinedChargedRoots': 155, 'concurrency': 6, 'batches': 25,
            'allowRetry': False, 'allowResume': False, 'allowContinuation': False,
            'fullCorpusAcceptance': False, 'publication': False,
            'cancellation': {'path': str(self.profiles / 'remaining-stage-cancellation.fifo'),
                             'exclusive': True, 'closeUnlink': True}}
        self.remaining_grant_path = self.root / 'remaining-grant.json'
        self.publish_remaining()
        return self.validate_remaining()

    def publish_remaining(self):
        write_json(self.remaining_grant_path, self.remaining_grant)

    def reserve_fixture_task(self, context, task):
        """Original D2 reservation and synthetic start observation; never launch a process."""
        job, job_path, home, codehome = self.job(task, context)
        runtime = __import__('eval_driver_runtime')
        artifact, profile = Path(job['artifactDir']), home.parent
        record = runtime.registered_profile(profile, self.profiles)
        write_json(artifact / 'runner-profile.json', {'profilePath': str(profile), 'childPgid': record['childPgid']})
        launch = {'argv': ['synthetic-never-executed'], 'cwd': task['projectRoot'],
                  'stdinPath': task['prompt'], 'home': str(home), 'codexHome': str(codehome)}
        write_json(artifact / 'launch.json', launch)
        write_json(artifact / 'launch-audit.json', {'launch': launch,
            'stdinSha256': job['pins'][task['prompt']], 'nonForked': True,
            'taskInput': 'rendered-prompt-only', 'configDigest': job['pins'][job['configFile']],
            'qualification': {'qualificationDigest': job['qualificationDigest'], 'profile': task['profile']},
            'pins': job['pins'], 'operatorSha256': job['operatorSha256'], 'driverSha256': job['driverDigest'],
            'fixtureOnly': True, 'qualifiedHost': False})
        consumed = runtime.reserve_launch(job, job_path, digest(job_path), launch, profile, record, fixture_only=True)
        write_json(artifact / 'process-start.json', {'pid': 424242, 'childPgid': record['childPgid'],
            'consumptionSha256': consumed, 'actualModelStarted': True, 'fixtureOnly': True, 'qualifiedHost': False})
        return {'job': job, 'jobPath': job_path}

    def validate_remaining(self):
        return self.stage.validate_remaining_stage(self.corpus_path, digest(self.corpus_path),
            self.remaining_grant_path, digest(self.remaining_grant_path))

    def coordinator(self, context, *, module_hook=None, **kwargs):
        spec = importlib.util.spec_from_file_location('remaining_fixture_coordinator', self.driver / 'run-cohorts.py')
        coordinator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(coordinator)
        if module_hook:
            module_hook(coordinator)
        with mock.patch.dict(sys.modules, {'eval_first_stage': self.stage}), \
             mock.patch.object(sys, 'executable', str(self.python)), \
             mock.patch.object(coordinator, 'source_roots', return_value=(self.source,)), \
             mock.patch.object(coordinator.Driver, 'check_source'):
            return coordinator.Driver(self.config_path, self.profiles, operator=self.operator,
                operator_sha256=digest(self.operator), binary=self.config['toolchain']['binary']['path'],
                auth_file=self.auth, node=str(self.node), fixture_tools=True, remaining_stage=context, **kwargs)


def independent_remainder(tasks):
    arrays = {suite: [task for task in tasks if task['suite'] == suite] for suite in SUITES}
    # Deliberately independent index-wise oracle rather than the implementation's zip_longest.
    full = [arrays[suite][index] for index in range(max(map(len, arrays.values())))
            for suite in SUITES if index < len(arrays[suite])]
    return [task for task in full if (task['suite'], task['scenario']) !=
            ('iterate', 'duplicated-control-line-aborts')]


class InertStageDriver:
    def __init__(self, fixture, context, fault=None):
        self.f, self.first_stage, self.fault = fixture, context, fault
        self.outroot = fixture.output / 'cohorts'
        self.outroot.mkdir(exist_ok=False)
        self.stop = threading.Event()
        self.interrupted_signal = None
        self.admissions, self.results, self.calls, self.events = {}, {}, [], []
        self.active, self.active_lock = {}, threading.Lock()
        self.fixture_tools = True

    def check_pins(self):
        pass

    def check_source(self):
        pass

    def event(self, row):
        self.events.append(row)

    def block(self):
        self.stop.set()

    def run_slot(self, task):
        self.calls.append(task.copy())
        if self.fault:
            return self.fault(self, task)
        result = self.f.run_worker(task, self.first_stage)
        self.results[task['slot']] = result
        if result['error']:
            raise result['error']
        assert result['code'] == 0
        return self.f.synthetic_seal(task, result)

    def accounting_projection(self, task, directory):
        runtime = __import__('eval_driver_runtime')
        result = self.results.get(task['slot'])
        if not result:
            return {'consumptionState': 'not-reserved', 'chargedRoots': 0, 'actualModelStarted': False}
        return runtime.inspect_consumption(result['job'], result['jobPath'], digest(result['jobPath']),
                                           fixture_only=True, wrapper_attempted=True)


class FirstStageAuthentication(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.guards = ExitStack()
        inert_boundaries(cls.guards)

    @classmethod
    def tearDownClass(cls):
        cls.guards.close()

    def setUp(self):
        old_path = list(sys.path)
        self.addCleanup(lambda: sys.path.__setitem__(slice(None), old_path))
        self.temp = tempfile.TemporaryDirectory(prefix='d3-stage-unit-', dir=str(TEST_TEMP_ROOT))
        self.addCleanup(self.temp.cleanup)
        self.fixture = StageFixture(Path(self.temp.name))
        self.f = self.fixture

    def test_full_authoritative_155_authenticates_without_process_or_writes(self):
        before = {str(path): digest(path) for path in self.f.root.rglob('*') if path.is_file()}
        context = self.f.validate()
        self.assertEqual(context['schemaVersion'], 1)
        self.assertEqual(len(self.f.records), 155)
        self.assertFalse((self.f.output / 'cohorts').exists())
        self.assertEqual(before, {str(path): digest(path) for path in self.f.root.rglob('*') if path.is_file()})

    def test_registry_export_order_matches_original_canonical_five_slot_membership(self):
        registry = self.f.root / 'unordered-registry.mjs'
        registry.write_text("export const SCENARIOS = Object.freeze(['z-last', 'a-first', 'm-middle']);\n")
        names = self.f.stage.registry_names(ref(registry))
        expected = [(name, slot) for name in ('a-first', 'm-middle', 'z-last') for slot in range(1, 6)]
        actual = [(name, slot) for name in names for slot in range(1, 6)]
        self.assertEqual(actual, expected)
        self.assertEqual(len(actual), len(set(actual)))

    def test_registry_canonicalization_preserves_duplicate_and_nonliteral_refusal(self):
        registry = self.f.root / 'invalid-registry.mjs'
        for body in ("['z-last', 'a-first', 'z-last']", "['z-last', foreignName]", '[]'):
            with self.subTest(body=body):
                registry.write_text('export const SCENARIOS = Object.freeze(' + body + ');\n')
                with self.assertRaises(ValueError):
                    self.f.stage.registry_names(ref(registry))

    def test_full_membership_rejects_missing_required_tuple(self):
        self.f.corpus['suites'][0]['tasks'].pop()
        self.f.publish_synthetic_pins()
        with self.assertRaisesRegex(ValueError, 'full authoritative task count required'):
            self.f.validate()

    def test_external_digests_cannot_self_authenticate(self):
        bad = 'sha256:' + '0' * 64
        for corpus_pin, grant_pin in ((bad, digest(self.f.grant_path)), (digest(self.f.corpus_path), bad)):
            with self.subTest(corpus=corpus_pin, grant=grant_pin), self.assertRaises((ValueError, OSError)):
                self.f.stage.validate_first_stage(self.f.corpus_path, corpus_pin, self.f.grant_path, grant_pin)

    def test_fixed_grant_rejects_broadened_budget_order_or_retry(self):
        original = copy.deepcopy(self.f.grant)
        mutations = [('maximumChargedRoots', 6), ('concurrency', 2), ('stageId', STAGE_ID + '-new'),
                     ('allowRetry', True), ('allowResume', True), ('allowContinuation', True),
                     ('fullCorpusAcceptance', True), ('unknownOverride', 1)]
        for key, value in mutations:
            with self.subTest(key=key):
                self.f.grant = {**copy.deepcopy(original), key: value}
                self.f.publish_synthetic_pins()
                with self.assertRaises((ValueError, OSError)):
                    self.f.validate()
        for tasks in (list(reversed(original['orderedTasks'])),
                      [original['orderedTasks'][0]] * 5,
                      original['orderedTasks'] + [{**original['orderedTasks'][-1], 'slot': 6}]):
            self.f.grant = {**copy.deepcopy(original), 'orderedTasks': tasks}
            self.f.publish_synthetic_pins()
            with self.assertRaises((ValueError, OSError)):
                self.f.validate()

    def test_changed_unselected_prompt_refuses_before_cohorts(self):
        record = self.f.records[-1]
        Path(record['prompt']['path']).write_text('mutated unselected prompt\n')
        with self.assertRaises((ValueError, OSError)):
            self.f.validate()
        self.assertFalse((self.f.output / 'cohorts').exists())

    def test_existing_namespace_never_resets_budget(self):
        (self.f.output / 'cohorts').mkdir()
        with self.assertRaises((ValueError, OSError)):
            self.f.validate()

    def test_present_null_worker_context_does_not_become_legacy(self):
        with self.assertRaises((ValueError, OSError, KeyError)):
            self.f.stage.validate_worker_stage({'firstStage': None})

    def test_default_entry_authenticates_155_and_reports_only_five(self):
        output = io.StringIO()
        with mock.patch('sys.stdout', output):
            code = self.f.stage.main(['--corpus', str(self.f.corpus_path), '--corpus-sha256', digest(self.f.corpus_path),
                                      '--grant', str(self.f.grant_path), '--grant-sha256', digest(self.f.grant_path)])
        result = json.loads(output.getvalue())
        self.assertEqual(code, 0)
        self.assertEqual(result['mode'], 'static-dry-run')
        self.assertEqual(result['fullPreparedTasks'], 155)
        self.assertEqual(result['selected'], self.f.grant['orderedTasks'])
        self.assertFalse(result['liveQualificationChecked'])
        self.assertFalse((self.f.output / 'cohorts').exists())

    def test_full_membership_rejects_same_count_foreign(self):
        suite = self.f.corpus['suites'][1]
        prepared_path = Path(suite['prepared']['path'])
        prepared = json.loads(prepared_path.read_text())
        suite['tasks'][-1]['task']['scenario'] = 'foreign-same-count-member'
        prepared['tasks'][-1]['scenario'] = 'foreign-same-count-member'
        write_json(prepared_path, prepared)
        suite['prepared'] = ref(prepared_path)
        self.f.publish_synthetic_pins()
        with self.assertRaises((ValueError, OSError)):
            self.f.validate()

    def test_full_membership_rejects_duplicate_replacing_a_required_tuple(self):
        suite = self.f.corpus['suites'][1]
        prepared_path = Path(suite['prepared']['path'])
        prepared = json.loads(prepared_path.read_text())
        suite['tasks'][-1] = copy.deepcopy(suite['tasks'][0])
        prepared['tasks'][-1] = copy.deepcopy(prepared['tasks'][0])
        write_json(prepared_path, prepared)
        suite['prepared'] = ref(prepared_path)
        self.f.publish_synthetic_pins()
        with self.assertRaises((ValueError, OSError)):
            self.f.validate()

    def test_missing_instrument_reference_cannot_borrow_old_identity(self):
        suite = self.f.corpus['suites'][0]
        missing = suite['suiteConfig']['path']
        suite['immutableInputs'] = [item for item in suite['immutableInputs'] if item['path'] != missing]
        self.f.publish_synthetic_pins()
        with self.assertRaises((ValueError, OSError)):
            self.f.validate()

    def test_dangling_prior_receipt_link_is_not_fresh(self):
        task = self.f.records[-1]['task']
        (Path(task['attemptRoot']) / 'host-receipt.json').symlink_to(self.f.root / 'absent-receipt-target')
        with self.assertRaises((ValueError, OSError)):
            self.f.validate()

    def test_oversize_corpus_and_grant_are_refused(self):
        original = self.f.corpus_path.read_bytes()
        self.f.corpus_path.write_bytes(b' ' * (4 * 1024 * 1024 + 1))
        with self.assertRaises((ValueError, OSError)):
            self.f.validate()
        self.f.corpus_path.write_bytes(original)
        self.f.grant_path.write_bytes(b' ' * (16 * 1024 + 1))
        with self.assertRaises((ValueError, OSError)):
            self.f.validate()

    def test_registry_executable_syntax_is_not_evaluated(self):
        suite = self.f.corpus['suites'][1]
        path = Path(suite['registry']['path'])
        path.write_text(path.read_text() + '\nthrow new Error("never execute");\n')
        suite['registry'] = ref(path)
        self.f.publish_synthetic_pins()
        with self.assertRaises((ValueError, OSError)):
            self.f.validate()

    def test_registry_comments_are_whitespace_and_never_merge_split_keywords(self):
        suite = self.f.corpus['suites'][1]
        path = Path(suite['registry']['path'])
        original = path.read_text()
        for replacement in ('ex/* split */port const SCENARIOS', 'export const SCENA/* split */RIOS'):
            with self.subTest(replacement=replacement):
                path.write_text(original.replace('export const SCENARIOS', replacement))
                suite['registry'] = ref(path)
                self.f.publish_synthetic_pins()
                with self.assertRaises((ValueError, OSError)):
                    self.f.validate()
        path.write_text(original.replace('export const SCENARIOS', 'export /* ordinary comment */ const SCENARIOS'))
        suite['registry'] = ref(path)
        self.f.publish_synthetic_pins()
        self.assertEqual(self.f.validate()['schemaVersion'], 1)

    def test_immutable_source_and_profile_instrument_bytes_are_rechecked(self):
        suite = self.f.corpus['suites'][2]
        paths = [Path(suite['suiteConfig']['path']), self.f.node,
                 Path(self.f.corpus['qualification']['policy']['path']),
                 self.f.operator, self.f.driver / 'eval_first_stage.py',
                 Path(suite['tasks'][-1]['buildIdentity']['path'])]
        for path in paths:
            with self.subTest(path=str(path)):
                original = path.read_bytes()
                path.write_bytes(original + b'changed\n')
                with self.assertRaises((ValueError, OSError)):
                    self.f.validate()
                path.write_bytes(original)

    def test_duplicate_json_key_and_bool_slot_are_rejected(self):
        original = self.f.corpus_path.read_bytes()
        self.f.corpus_path.write_bytes(b'{"schemaVersion":1,"schemaVersion":1}\n')
        self.f.grant['corpus'] = ref(self.f.corpus_path)
        write_json(self.f.grant_path, self.f.grant)
        with self.assertRaises((ValueError, OSError)):
            self.f.validate()
        self.f.corpus_path.write_bytes(original)
        self.f.grant['corpus'] = ref(self.f.corpus_path)
        self.f.grant['orderedTasks'][0]['slot'] = True
        write_json(self.f.grant_path, self.f.grant)
        with self.assertRaises((ValueError, OSError)):
            self.f.validate()

    def test_replaced_output_inode_and_changed_root_refuse(self):
        original = self.f.output
        moved = original.with_name('moved-original-output')
        original.rename(moved)
        original.mkdir()
        with self.assertRaises((ValueError, OSError)):
            self.f.validate()

    def test_alias_grant_cannot_create_a_second_namespace_admission(self):
        alias = self.f.root / 'identical-grant-copy.json'
        shutil.copyfile(self.f.grant_path, alias)
        context = self.f.stage.validate_first_stage(self.f.corpus_path, digest(self.f.corpus_path),
                                                   alias, digest(alias))
        self.assertEqual(context['grant']['path'], str(alias))
        (self.f.output / 'cohorts').mkdir(exist_ok=False)
        with self.assertRaises((ValueError, OSError)):
            self.f.stage.validate_first_stage(self.f.corpus_path, digest(self.f.corpus_path), alias, digest(alias))

    def test_foreign_sixth_mutated_or_wrong_ordinal_task_refuses(self):
        context = self.f.validate()
        task = self.f.selected()[0]
        directory = self.f.grant['orderedTasks'][0]['artifactDir']
        for changed, ordinal in (({**task, 'slot': 6}, 6), ({**task, 'suite': 'merge-gate'}, 1),
                                  ({**task, 'scenario': 'foreign'}, 1), ({**task, 'slot': True}, 1),
                                  ({**task, 'prompt': str(self.f.root / 'forged-prompt')}, 1), (task, 2)):
            with self.subTest(task=changed, ordinal=ordinal), self.assertRaises((ValueError, OSError)):
                self.f.stage.validate_stage_task(context, changed, directory, ordinal=ordinal)

    def test_valid_worker_uses_real_d2_reservation_before_inert_model(self):
        context = self.f.validate()
        result = self.f.run_worker(self.f.selected()[0], context)
        self.assertIsNone(result['error'])
        self.assertEqual(result['code'], 0)
        self.assertEqual(len(result['modelCalls']), 1)
        self.assertIn(b'model\n', result['heartbeats'])
        projection = __import__('eval_driver_runtime').inspect_consumption(
            result['job'], result['jobPath'], digest(result['jobPath']), fixture_only=True, wrapper_attempted=True)
        self.assertEqual(projection, {'consumptionState': 'reserved', 'chargedRoots': 1, 'actualModelStarted': True})

    def test_absent_stage_preserves_original_d2_worker_protocol(self):
        context = self.f.validate()
        result = self.f.run_worker(self.f.selected()[0], context,
                                   prepare_job=lambda job: job.pop('firstStage'))
        self.assertIsNone(result['error'])
        self.assertEqual(result['code'], 0)
        self.assertEqual(len(result['modelCalls']), 1)
        self.assertNotIn('firstStage', result['job'])

    def test_post_reservation_grant_mutation_stops_model_without_refund(self):
        context = self.f.validate()
        result = self.f.run_worker(self.f.selected()[0], context,
            after_reserve=lambda job: self.f.grant_path.write_bytes(self.f.grant_path.read_bytes() + b' '))
        self.assertIsNotNone(result['error'])
        self.assertEqual(result['modelCalls'], [])
        self.assertNotIn(b'model\n', result['heartbeats'])
        receipt = Path(result['job']['artifactDir']) / 'launch-consumption.json'
        self.assertTrue(receipt.is_file())
        before = receipt.read_bytes()
        projection = __import__('eval_driver_runtime').inspect_consumption(
            result['job'], result['jobPath'], digest(result['jobPath']), fixture_only=True, wrapper_attempted=True)
        self.assertEqual(projection['chargedRoots'], 1)
        self.assertEqual(projection['consumptionState'], 'reservation-unknown')
        self.assertIsNone(projection['actualModelStarted'])
        self.assertEqual(receipt.read_bytes(), before)

    def test_qualification_mutation_stops_before_reservation(self):
        context = self.f.validate()
        def qualify(*args, **kwargs):
            self.f.corpus_path.write_bytes(self.f.corpus_path.read_bytes() + b' ')
            return subprocess.CompletedProcess([], 0, json.dumps({
                'qualificationDigest': self.f.config['qualificationDigest'],
                'profile': self.f.selected()[0]['profile']}), '')
        result = self.f.run_worker(self.f.selected()[0], context, qualify=qualify)
        self.assertIsNotNone(result['error'])
        self.assertEqual(result['modelCalls'], [])
        self.assertFalse((Path(result['job']['artifactDir']) / 'launch-consumption.json').exists())

    def test_stage_five_clean_synthetic_seals_stop_with_partial_acceptance_only(self):
        context = self.f.validate()
        driver = InertStageDriver(self.f, context)
        unselected = [record for record in self.f.records if record['task'] not in self.f.selected()]
        before = {item['path']: digest(item['path']) for suite in self.f.corpus['suites']
                  for item in suite['immutableInputs']}
        real_pool = concurrent.futures.ThreadPoolExecutor
        widths, outstanding = [], []
        class RecordingPool:
            def __init__(self, *, max_workers):
                widths.append(max_workers)
                self.pool = real_pool(max_workers=max_workers)
            def __enter__(self):
                self.pool.__enter__()
                return self
            def __exit__(self, *args):
                return self.pool.__exit__(*args)
            def submit(self, function, task):
                assert all(future.done() for future in outstanding), 'a later future was presubmitted'
                future = self.pool.submit(function, task)
                outstanding.append(future)
                return future
        with mock.patch.object(self.f.stage.concurrent.futures, 'ThreadPoolExecutor', RecordingPool):
            summary = self.f.stage.run_first_stage(context, driver)
        self.assertEqual([task['slot'] for task in driver.calls], [1, 2, 3, 4, 5])
        self.assertEqual(summary['authorizedTasks'], 5)
        self.assertEqual(summary['remainingTasks'], 150)
        self.assertEqual(summary['concurrency'], 1)
        self.assertEqual(widths, [1])
        self.assertEqual(len(outstanding), 5)
        self.assertEqual(summary['chargedRoots'], 5)
        self.assertTrue(summary['stageCompleted'])
        self.assertFalse(summary['fullCorpusAccepted'])
        self.assertFalse(summary['continuationAuthorized'])
        self.assertTrue(summary['fixtureOnly'])
        self.assertEqual(before, {path: digest(path) for path in before})
        self.assertEqual(len(unselected), 150)
        for record in unselected:
            for name in ('host-receipt.json', 'seal.json'):
                self.assertFalse(os.path.lexists(Path(record['task']['attemptRoot']) / name))

    def test_failed_future_retains_identity_blocks_and_never_retries(self):
        context = self.f.validate()
        def fail(driver, task):
            result = self.f.run_worker(task, context, after_reserve=lambda job:
                self.f.grant_path.write_bytes(self.f.grant_path.read_bytes() + b' '))
            driver.results[task['slot']] = result
            raise RuntimeError('synthetic failed future after durable reservation')
        driver = InertStageDriver(self.f, context, fault=fail)
        summary = self.f.stage.run_first_stage(context, driver)
        self.assertEqual([task['slot'] for task in driver.calls], [1])
        self.assertTrue(driver.stop.is_set())
        self.assertEqual(summary['chargedRoots'], 1)
        self.assertEqual(summary['reservationUnknownRoots'], 1)
        self.assertFalse(summary['accountingComplete'])
        self.assertEqual(summary['results'][0]['slot'], 1)
        self.assertEqual(summary['results'][0]['state'], 'operator-error')
        self.assertFalse(summary['stageCompleted'])

    def test_main_thread_interrupt_blocks_one_waiting_future_without_next_submit(self):
        context = self.f.validate()
        driver = InertStageDriver(self.f, context)
        pending = concurrent.futures.Future()
        submissions, blockers = [], []
        main_id = threading.get_ident()
        class WaitingPool:
            def __init__(self, *, max_workers):
                assert max_workers == 1
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def submit(self, function, task):
                submissions.append(task)
                driver.interrupted_signal = signal.SIGINT
                return pending
        def block():
            blockers.append(threading.get_ident())
            driver.stop.set()
            if not pending.done():
                pending.set_result({'state': 'not-launched-after-blocker'})
        driver.block = block
        with mock.patch.object(self.f.stage.concurrent.futures, 'ThreadPoolExecutor', WaitingPool):
            summary = self.f.stage.run_first_stage(context, driver)
        self.assertEqual(len(submissions), 1)
        self.assertTrue(blockers)
        self.assertEqual(set(blockers), {main_id})
        self.assertEqual(summary['signal'], signal.SIGINT)
        self.assertFalse(summary['stageCompleted'])

    def test_original_coordinator_exclusive_namespace_allows_only_one_winner(self):
        context = self.f.validate()
        spec = importlib.util.spec_from_file_location('d3_namespace_coordinator', self.f.driver / 'run-cohorts.py')
        coordinator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(coordinator)
        barrier = threading.Barrier(2)
        winners, refusals = [], []
        def attempt():
            barrier.wait(timeout=5)
            try:
                value = coordinator.Driver(self.f.config_path, self.f.profiles,
                    operator=self.f.operator, operator_sha256=digest(self.f.operator),
                    binary=self.f.config['toolchain']['binary']['path'], auth_file=self.f.auth,
                    node=str(self.f.node), fixture_tools=True, first_stage=context)
                winners.append(value)
            except (ValueError, OSError) as error:
                refusals.append(error)
        with mock.patch.dict(sys.modules, {'eval_first_stage': self.f.stage}), \
             mock.patch.object(sys, 'executable', str(self.f.python)), \
             mock.patch.object(coordinator, 'source_roots', return_value=(self.f.source,)), \
             mock.patch.object(coordinator.Driver, 'check_source'):
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                futures = [pool.submit(attempt) for _ in range(2)]
                for future in futures:
                    future.result(timeout=10)
        try:
            self.assertEqual(len(winners), 1)
            self.assertEqual(len(refusals), 1)
            self.assertTrue((self.f.output / 'cohorts').is_dir())
            with self.assertRaises((ValueError, OSError)):
                self.f.validate()
        finally:
            for driver in winners:
                driver.close()

    def test_d1_block_source_and_d2_runtime_are_exactly_preserved(self):
        self.assertEqual(digest(HERE / 'eval_driver_runtime.py'),
                         'sha256:51704302d8696ec898a03a52aaf259dcae283eea377d6ebbc55fd596d4e4eb93')
        source = (HERE / 'run-cohorts.py').read_text()
        parsed = ast.parse(source)
        driver = next(node for node in parsed.body if isinstance(node, ast.ClassDef) and node.name == 'Driver')
        block = next(node for node in driver.body if isinstance(node, ast.FunctionDef) and node.name == 'block')
        self.assertEqual(hashlib.sha256(ast.get_source_segment(source, block).encode()).hexdigest(),
                         'e54f64bc0b002647a8158d491f215e6ff672dbb06f53050c36282215ea74cf0a')
        self.assertEqual(hashlib.sha256(stable_ast_dump(block).encode()).hexdigest(),
                         '5e73007bee1cd2412395c024a73417d368e8146f9b61fb226ec76d1caa50d8c4')

    def test_original_qualifier_expiry_crossed_during_reserve_stops_before_model(self):
        context = self.f.validate()
        clock = {'now': '2026-10-31T00:00:00.000Z'}
        def qualify(*args, **kwargs):
            return subprocess.CompletedProcess([], 0, json.dumps({
                'qualificationDigest': self.f.config['qualificationDigest'],
                'profile': self.f.selected()[0]['profile'],
                'expiresAt': '2026-10-31T12:00:00.000Z'}), '')
        def expire(job):
            clock['now'] = '2026-10-31T12:00:00.000Z'
        captured = {}
        def slot(driver, task):
            result = self.f.run_worker(task, context, qualify=qualify,
                                       after_reserve=expire, clock=lambda: clock['now'])
            captured.update(result)
            driver.results[task['slot']] = result
            if result['error']:
                raise result['error']
            return self.f.synthetic_seal(task, result)
        driver = InertStageDriver(self.f, context, fault=slot)
        summary = self.f.stage.run_first_stage(context, driver)
        result = captured
        self.assertIsNotNone(result['error'])
        self.assertIn('expir', str(result['error']))
        self.assertEqual(result['modelCalls'], [])
        self.assertNotIn(b'model\n', result['heartbeats'])
        projection = __import__('eval_driver_runtime').inspect_consumption(
            result['job'], result['jobPath'], digest(result['jobPath']), fixture_only=True, wrapper_attempted=True)
        self.assertEqual(projection, {'consumptionState': 'reservation-unknown', 'chargedRoots': 1,
                                      'actualModelStarted': None})
        self.assertEqual([task['slot'] for task in driver.calls], [1])
        self.assertEqual(summary['chargedRoots'], 1)
        self.assertEqual(summary['reservationUnknownRoots'], 1)
        self.assertFalse(summary['accountingComplete'])
        self.assertFalse(summary['stageCompleted'])

    def test_missing_or_malformed_qualifier_expiry_never_launches_or_refunds(self):
        for index, expires in enumerate((None, 'not-an-original-ISO-expiry')):
            with self.subTest(expires=expires):
                fixture = StageFixture(Path(self.temp.name) / ('expiry-invalid-' + str(index)))
                context = fixture.validate()
                def qualify(*args, **kwargs):
                    value = {'qualificationDigest': fixture.config['qualificationDigest'],
                             'profile': fixture.selected()[0]['profile']}
                    if expires is not None:
                        value['expiresAt'] = expires
                    return subprocess.CompletedProcess([], 0, json.dumps(value), '')
                result = fixture.run_worker(fixture.selected()[0], context, qualify=qualify)
                self.assertIsNotNone(result['error'])
                self.assertEqual(result['modelCalls'], [])
                self.assertNotIn(b'model\n', result['heartbeats'])
                projection = __import__('eval_driver_runtime').inspect_consumption(
                    result['job'], result['jobPath'], digest(result['jobPath']), fixture_only=True, wrapper_attempted=True)
                self.assertEqual(projection['chargedRoots'], 1)
                self.assertEqual(projection['consumptionState'], 'reservation-unknown')
                self.assertIsNone(projection['actualModelStarted'])

    def test_qualifier_refusal_between_slots_stops_without_refresh_or_retry(self):
        context = self.f.validate()
        def slot(driver, task):
            qualify = None if task['slot'] == 1 else lambda *a, **k: subprocess.CompletedProcess(
                [], 9, '', 'original qualifier reports expired immutable bundle')
            result = self.f.run_worker(task, context, qualify=qualify)
            driver.results[task['slot']] = result
            if task['slot'] == 1:
                self.assertIsNone(result['error'])
                return self.f.synthetic_seal(task, result)
            self.assertEqual(result['modelCalls'], [])
            self.assertEqual(result['code'], 9)
            return {**{key: task[key] for key in ('suite', 'scenario', 'slot')},
                    'state': 'qualification-refused-before-launch'}
        driver = InertStageDriver(self.f, context, fault=slot)
        summary = self.f.stage.run_first_stage(context, driver)
        self.assertEqual([task['slot'] for task in driver.calls], [1, 2])
        self.assertEqual(summary['chargedRoots'], 1)
        self.assertTrue(summary['blocked'])
        self.assertFalse(summary['stageCompleted'])

    def test_cancellation_between_slots_never_submits_later_roots(self):
        context = self.f.validate()
        def slot(driver, task):
            result = self.f.run_worker(task, context)
            driver.results[task['slot']] = result
            self.assertIsNone(result['error'])
            outcome = self.f.synthetic_seal(task, result)
            driver.stop.set()
            return outcome
        driver = InertStageDriver(self.f, context, fault=slot)
        summary = self.f.stage.run_first_stage(context, driver)
        self.assertEqual([task['slot'] for task in driver.calls], [1])
        self.assertEqual(summary['chargedRoots'], 1)
        self.assertFalse(summary['stageCompleted'])

    def test_seal_native_findings_and_unknown_cleanup_block_the_next_submit(self):
        cases = [('state', 'seal-refused'), ('findings', ['synthetic finding']),
                 ('nativeErrors', [{'type': 'error'}]), ('cleanupComplete', False),
                 ('groupGone', False), ('malformedStream', True)]
        for index, (field, value) in enumerate(cases):
            with self.subTest(field=field):
                fixture = StageFixture(Path(self.temp.name) / ('fault-' + str(index)))
                context = fixture.validate()
                def slot(driver, task):
                    result = fixture.run_worker(task, context)
                    driver.results[task['slot']] = result
                    self.assertIsNone(result['error'])
                    outcome = fixture.synthetic_seal(task, result)
                    outcome[field] = value
                    return outcome
                driver = InertStageDriver(fixture, context, fault=slot)
                summary = fixture.stage.run_first_stage(context, driver)
                self.assertEqual([task['slot'] for task in driver.calls], [1])
                self.assertEqual(summary['chargedRoots'], 1)
                self.assertTrue(summary['blocked'])
                self.assertFalse(summary['stageCompleted'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
