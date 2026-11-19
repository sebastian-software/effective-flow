"""Local command fixtures for the real remaining-stage wrapper/worker regression.

Only qualification, native output, and seal input are synthetic. Driver startup,
namespace authentication, D2 reservations, cleanup and the suite evaluators are real.
"""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import threading
import time

from liveness_wait import POLL_SECONDS, report_failure
from test_first_stage import (
    OriginalSealFixture, canonical_digest, digest, ref, write_json,
)


# Largest composed inner subprocess timeout (run_composed_batch: `120 if unknown else 180`).
COMPOSED_INNER_TIMEOUT_SECONDS = 180
# >= COMPOSED_INNER_TIMEOUT_SECONDS + 20 s margin: the NATIVE release and REFUSAL_BARRIER waits are
# backstops that never fire first; parent-side liveness waits and the inner timeout bind instead.
CHILD_BARRIER_BACKSTOP_SECONDS = 200
# Worker qualification timeout (eval_host_worker.py, `timeout=120`), unchanged production value.
QUALIFICATION_TIMEOUT_SECONDS = 120
# <= QUALIFICATION_TIMEOUT_SECONDS - 30 s qualifier startup margin, so an expired OPERATOR backstop
# becomes an ordinary qualification refusal recorded in qualification.stderr.log.
OPERATOR_BACKSTOP_SECONDS = 90
# > CHILD_BARRIER_BACKSTOP_SECONDS: the model watchdog (modelTimeoutSeconds, armed before ready-N)
# and the pre-model watchdog (+125) outlast NATIVE; the wrapper timeout (+140) exceeds the inner timeout.
COORDINATOR_TIMEOUT_SECONDS = 210
# Reset-on-progress window of wait_for_ready_batch; only a backstop behind wrapper liveness, and
# always capped by the child deadline minus TEARDOWN_MARGIN_SECONDS.
READY_PROGRESS_WINDOW_SECONDS = 60
# Generic backstop of each parent-side composed wait, <= COMPOSED_INNER_TIMEOUT_SECONDS -
# TEARDOWN_MARGIN_SECONDS; each wait is additionally capped by the child deadline minus that margin.
COMPOSED_WAIT_BACKSTOP_SECONDS = 120
# Bytes of a worker log quoted in a gone-wrapper or missing-signal failure message.
LOG_TAIL_BYTES = 2000


def inject_constants(source, **values):
    """Substitute `@NAME@` tokens, so fixture scripts in other interpreters share one constant."""
    for name, value in values.items():
        token = '@' + name + '@'
        if token not in source:
            raise ValueError('fixture script has no token ' + token)
        source = source.replace(token, repr(value))
    if re.search(r'@[A-Z_]+@', source):
        raise ValueError('fixture script keeps an unresolved token')
    return source


NATIVE = r'''#!PYTHON
import json, pathlib, sys, time
args = sys.argv[1:]
directory = pathlib.Path(args[args.index('--output-last-message') + 1]).parent
job = json.loads((directory / 'worker-job.json').read_text())
control = pathlib.Path(json.loads(pathlib.Path(job['configFile']).read_text())['fixtureControls'])
ordinal = job['remainingStage']['ordinal']
ready = control / ('ready-' + str(ordinal))
pending = ready.with_suffix('.tmp')
pending.write_text(json.dumps({'ordinal': ordinal, 'readyNs': time.monotonic_ns()}) + '\n')
pending.replace(ready)
deadline = time.monotonic() + @CHILD_BARRIER_BACKSTOP_SECONDS@
while not (control / ('release-' + str(ordinal))).exists():
    if time.monotonic() >= deadline: raise RuntimeError('fixture release barrier timed out')
    time.sleep(.01)
if (control / 'unknown').exists() and ordinal == int((control / 'unknown').read_text()):
    # Actual reservation remains charged; an unbound start is deliberately unknown.
    (directory / 'process-start.json').write_text('{}\n')
(directory / 'last-message.txt').write_text('offline native fixture\n')
print(json.dumps({'type': 'turn.completed'}), flush=True)
'''
NATIVE = inject_constants(NATIVE, CHILD_BARRIER_BACKSTOP_SECONDS=CHILD_BARRIER_BACKSTOP_SECONDS)

OPERATOR = r'''
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [configPath, operation, name, input] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configPath));
const directory = dirname(input);
if (operation === 'qualify') {
  const job = JSON.parse(readFileSync(join(directory, 'worker-job.json')));
  if (job.remainingStage.ordinal > 6) {
    // The real scheduler must close every first-batch slot before admitting batch two.
    for (const task of config.fixtureFirstBatch) {
      const result = JSON.parse(readFileSync(join(task.artifactDir, 'operator-result.json')));
      if (result.state !== 'sealed') throw new Error('batch two before all six closures');
    }
    // Let all six authentic workers finish initial admission before any refusal
    // revokes the shared gate; otherwise fixture teardown could race their startup.
    writeFileSync(join(config.fixtureControls, `qualifier-ready-${job.remainingStage.ordinal}`), 'ready\n');
    const deadline = Date.now() + @OPERATOR_BACKSTOP_MILLISECONDS@;
    while (!Array.from({length: 6}, (_, i) => i + 7).every((ordinal) =>
      existsSync(join(config.fixtureControls, `qualifier-ready-${ordinal}`)))) {
      if (Date.now() >= deadline) throw new Error('second-batch qualification barrier timed out');
      await delay(10);
    }
    writeFileSync(join(config.fixtureControls, 'batch-two-reached'), 'all six sealed\n');
    process.exitCode = 9; // Bound the regression to six native fixture jobs.
  } else console.log(JSON.stringify({qualificationDigest: config.qualificationDigest,
    profile: config.profiles[name], expiresAt: '2099-01-01T00:00:00.000Z'}));
} else if (operation === 'seal') {
  const task = JSON.parse(readFileSync(input));
  const prepared = JSON.parse(readFileSync(join(config.outputRoot, `prepared-${name}.json`)));
  const request = join(directory, 'fixture-seal-request.json');
  const output = join(directory, 'fixture-seal-response.json');
  writeFileSync(request, JSON.stringify({operation: 'seal', output,
    suites: [{name, manifest: prepared.manifestPath, base: prepared.base, tasks: [task]}]}));
  process.argv = [process.execPath, config.fixtureBridge, config.frozenRoot, request];
  await import(pathToFileURL(config.fixtureBridge));
  const result = JSON.parse(readFileSync(output)).originalComputations[0];
  console.log(JSON.stringify({evaluation: {validityProblems: result.validityProblems,
    findings: result.findings}}));
} else throw new Error('fixture operator accepts only qualify/seal');
'''
OPERATOR = inject_constants(OPERATOR, OPERATOR_BACKSTOP_MILLISECONDS=OPERATOR_BACKSTOP_SECONDS * 1000)


REFUSAL_BARRIER = r'''
import os, sys, time
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, sys.argv.pop(1))
import eval_host_worker as worker
from eval_driver_runtime import inspect_consumption, sha
original_save_refusal = worker.save_refusal

def wait_for(condition):
    deadline = time.monotonic() + @CHILD_BARRIER_BACKSTOP_SECONDS@
    while not condition():
        if time.monotonic() >= deadline:
            raise RuntimeError('second-batch refusal persistence barrier timed out')
        time.sleep(.01)

def synchronized_refusal(job, job_digest, state):
    ordinal = job['remainingStage']['ordinal']
    if not 7 <= ordinal <= 12:
        return original_save_refusal(job, job_digest, state)
    directory = Path(job['artifactDir'])
    controls = Path(worker.read_bound_json(job['configFile'])[0]['fixtureControls'])
    if ordinal == 12:
        (controls / 'refusal-writer-held').touch()
        wait_for(lambda: (controls / 'release-refusal-writer').exists())
    original_save_refusal(job, job_digest, state)
    observed = inspect_consumption(job, directory / 'worker-job.json', job_digest,
                                   fixture_only=job['fixtureTools'])
    if observed != {'consumptionState': 'not-reserved', 'chargedRoots': 0,
                    'actualModelStarted': False}:
        raise RuntimeError('original refusal did not authenticate')
    refusal = directory / 'launch-refusal.json'
    for path in (refusal, directory):
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    marker = controls / ('refusal-persisted-' + str(ordinal))
    pending_marker = marker.with_suffix('.tmp')
    pending_marker.write_text(sha(refusal))
    pending_marker.replace(marker)
    wait_for(lambda: all((controls / ('refusal-persisted-' + str(peer_ordinal))).exists()
                         for peer_ordinal in range(7, 13)))

worker.save_refusal = synchronized_refusal
raise SystemExit(worker.main())
'''
REFUSAL_BARRIER = inject_constants(REFUSAL_BARRIER,
                                   CHILD_BARRIER_BACKSTOP_SECONDS=CHILD_BARRIER_BACKSTOP_SECONDS)


def copy_fixture_executable(source, destination):
    """Pin private executable bytes, even when the installed runtime is shared/root-owned."""
    source = Path(source).resolve()
    if source != destination:
        shutil.copyfile(source, destination)
        shutil.copymode(source, destination)
    return destination


def write_node_wrapper(source, destination):
    """Pin a tiny owned wrapper that execs the real node, instead of its large bytes."""
    # exec keeps node's PID, process group and signal delivery identical to a copy.
    source = Path(source).resolve()
    if not os.path.isfile('/bin/sh'):
        raise RuntimeError('fixture node wrapper requires /bin/sh')
    content = ('#!/bin/sh\nexec ' + shlex.quote(str(source)) + ' "$@"\n').encode()
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o700)
    try:
        os.fchmod(descriptor, 0o700)
        view = memoryview(content)
        while view:
            view = view[os.write(descriptor, view):]
    finally:
        os.close(descriptor)
    return destination


def read_ready_batch(control):
    """Return the validated `ready-N` records of the first batch that currently exist."""
    ready = {}
    for ordinal in range(1, 7):
        path = control / ('ready-' + str(ordinal))
        try:
            content = path.read_text()
        except FileNotFoundError:
            continue
        try:
            record = json.loads(content)
        except ValueError as error:
            raise ValueError('invalid native ready record: ' + str(path)) from error
        if (type(record) is not dict or type(record.get('ordinal')) is not int
                or record['ordinal'] != ordinal or type(record.get('readyNs')) is not int
                or record['readyNs'] <= 0):
            raise ValueError('invalid native ready record: ' + str(path))
        ready[ordinal] = record
    return ready


def wait_for_ready_batch(control, stopped, *, gone=None, liveness=None, deadline=None,
                         window=READY_PROGRESS_WINDOW_SECONDS, clock=time.monotonic, sleep=time.sleep,
                         stream=None):
    """Wait for all six `ready-N` records; each new ordinal renews the progress window.

    Returns None once `stopped()` is true. `gone()` reports first-batch wrappers that exited
    before their ready record (falsy while all live); a final read then wins, otherwise this
    fails within one poll. The window never extends past the absolute `deadline` cap.
    """
    started = clock()
    expiry = started + window
    seen = set()

    def fail(reason):
        state = liveness() if liveness is not None else 'not tracked'
        return report_failure('fixture barrier timed out: six real fixture workers running: ' + reason
                              + ' after ' + format(clock() - started, '.2f') + ' s; producers: '
                              + str(state), stream=stream)

    def limit():
        return expiry if deadline is None else min(expiry, deadline)

    while True:
        if stopped():
            return None
        if clock() >= limit():
            raise fail('progress window expired' if deadline is None or expiry <= deadline
                       else 'deadline cap reached')
        ready = read_ready_batch(control)
        observed = clock()
        if observed >= limit():
            raise fail('progress window expired' if deadline is None or expiry <= deadline
                       else 'deadline cap reached')
        if len(ready) == 6:
            return ready
        if gone is not None:
            report = gone()
            if report:
                # A ready record written just before its wrapper exited still counts.
                ready = read_ready_batch(control)
                if len(ready) == 6:
                    return ready
                report = gone()
                if report:
                    raise fail('producer gone: ' + str(report))
        if ready.keys() - seen:
            seen.update(ready)
            expiry = observed + window
        sleep(POLL_SECONDS)


class WrapperProcesses:
    """Thread-safe record of the real wrapper processes per remaining-stage ordinal."""

    def __init__(self):
        self._lock = threading.Lock()
        self._processes = {}

    def record(self, ordinal, process):
        with self._lock:
            self._processes[ordinal] = process

    def snapshot(self):
        with self._lock:
            return dict(self._processes)


def wrapper_ordinal(command):
    """Derive the remaining-stage ordinal from the wrapper's `--job` path (written before launch)."""
    job = Path(command[command.index('--job') + 1])
    return json.loads(job.read_text())['remainingStage']['ordinal']


def exited_wrappers(processes, ordinals, *, signalled=None, failing=lambda code: True):
    """Return sorted (ordinal, exit code) of recorded wrappers that exited before their signal.

    Exit is observed before the signal is checked, so a signal written just before exit wins.
    `failing(code)` selects which exit codes count; unrecorded ordinals never count.
    """
    gone = []
    for ordinal in sorted(ordinals):
        process = processes.get(ordinal)
        if process is None:
            continue
        code = process.poll()
        if code is None or not failing(code):
            continue
        if signalled is not None and signalled(ordinal):
            continue
        gone.append((ordinal, code))
    return gone


def recovery_claims_gone(processes):
    """Recovery claims block every first-batch worker, so any exit of wrappers 1-6 fails."""
    return exited_wrappers(processes, range(1, 7))


def ready_batch_gone(processes, control):
    """Wrappers 1-6 count only until their own `ready-N` record exists."""
    return exited_wrappers(processes, range(1, 7),
                           signalled=lambda ordinal: (control / ('ready-' + str(ordinal))).exists())


def closures_gone(processes, first, held):
    """Only a nonzero exit of a non-held first-batch wrapper fails; code 0 precedes the seal."""
    return exited_wrappers(processes, [ordinal for ordinal in range(1, 7) if ordinal != held],
                           signalled=lambda ordinal: (Path(first[ordinal - 1]) / 'operator-result.json').exists(),
                           failing=lambda code: code != 0)


def batch_two_gone(processes, control):
    """Any exit of a batch-two wrapper (ordinals 7-12) before its `refusal-persisted-N` fails."""
    return exited_wrappers(processes, range(7, 13),
                           signalled=lambda ordinal: (control / ('refusal-persisted-' + str(ordinal))).exists())


def log_tail(path, limit=LOG_TAIL_BYTES):
    try:
        content = Path(path).read_bytes()
    except OSError as error:
        return '<' + type(error).__name__ + '>'
    return content[-limit:].decode('utf-8', errors='replace')


def describe_exits(exits, artifact_dir, logs=('runner.stderr.log',)):
    """Name each gone wrapper with its ordinal, exit code and worker log tails; '' when none."""
    lines = []
    for ordinal, code in exits:
        lines.append('wrapper ' + str(ordinal) + ' exited with code ' + str(code))
        for name in logs:
            lines.append('--- ' + name + ' tail of ordinal ' + str(ordinal) + ':\n'
                         + log_tail(Path(artifact_dir(ordinal)) / name))
    return '\n'.join(lines)


def describe_wrappers(processes):
    """Compact liveness state of every recorded wrapper, e.g. `1:running 2:exit 0`."""
    states = []
    for ordinal, process in sorted(processes.items()):
        code = process.poll()
        states.append(str(ordinal) + ':' + ('running' if code is None else 'exit ' + str(code)))
    return ' '.join(states) or 'no wrapper recorded'


def complete_ready_batch(ready, *, unknown, set_unknown, release, check_context, check_closures):
    held = max(ready, key=lambda ordinal: ready[ordinal]['readyNs'])
    if unknown:
        set_unknown(held)
    for ordinal in ready:
        if ordinal != held:
            release(ordinal)
    check_context()
    check_closures(held)
    release(held)
    return held


class ComposedRemainingFixture(OriginalSealFixture):
    def __init__(self, root):
        super().__init__(root)
        self.controls = root / 'control'
        self.controls.mkdir()
        self.node = write_node_wrapper(shutil.which('node'), root / 'node-runtime')
        self.python = copy_fixture_executable(sys.executable, root / 'python-runtime')
        self.operator.write_text(OPERATOR)
        binary = root / 'local-native-fixture'
        binary.write_text(NATIVE.replace('#!PYTHON', '#!' + str(self.python)))
        binary.chmod(0o700)
        artifacts = self.config['toolchain']
        artifacts['binary'] = ref(binary)
        write_json(self.bundle, {'toolchain': artifacts})
        driver_root = root / 'driver-source'
        for item in self.corpus['driverFiles']:
            relative = Path(item['path']).relative_to(self.source)
            destination = driver_root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(item['path'], destination)
        self.driver = driver_root / 'evals/host-driver'
        for repository in (self.source, driver_root):
            self.git(repository, 'init', '-q')
            self.git(repository, 'add', '.')
            self.git(repository, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid',
                     '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null',
                     'commit', '-qm', 'offline fixture')
        head = self.git(self.source, 'rev-parse', 'HEAD')
        tree = self.git(self.source, 'rev-parse', 'HEAD^{tree}')
        order = self.stage.remainder_tasks([r['task'] for r in self.records])
        self.config.update(node=str(self.node), python=str(self.python), driverRoot=str(driver_root),
            expectedFrozenHead=head, expectedFrozenTree=tree, qualificationDigest=digest(self.bundle),
            fixtureBridge=str(self.bridge), fixtureControls=str(self.controls),
            fixtureFirstBatch=[{'artifactDir': str(self.output / 'cohorts' / task['suite'] /
                task['scenario'] / ('slot-' + str(task['slot'])))} for task in order[:6]])
        write_json(self.config_path, self.config)
        self.corpus.update(source={'root': str(self.source), 'head': head, 'tree': tree},
            config=ref(self.config_path), operator=ref(self.operator),
            toolchain={'node': ref(self.node), 'python': ref(self.python), 'artifacts': artifacts},
            driverFiles=[ref(driver_root / Path(item['path']).relative_to(self.source))
                         for item in self.corpus['driverFiles']])
        self.corpus['qualification']['bundle'] = ref(self.bundle)
        static = canonical_digest({k: v for k, v in self.config.items() if k != 'qualificationDigest'})
        for suite in self.corpus['suites']:
            prepared_path = Path(suite['prepared']['path'])
            prepared = json.loads(prepared_path.read_text())
            prepared.update(sourceHead=head, sourceTree=tree, staticConfigDigest=static)
            write_json(prepared_path, prepared)
            suite['prepared'] = ref(prepared_path)
            manifest_path = Path(suite['roundManifest']['path'])
            manifest = json.loads(manifest_path.read_text())
            manifest['sourceRevision'] = head
            write_json(manifest_path, manifest)
            suite['roundManifest'] = ref(manifest_path)
        self.grant['config'] = self.corpus['config']
        self.publish_synthetic_pins()
        self.reload_stage()

    def git(self, root, *args):
        return subprocess.check_output(['git', *args], cwd=root, text=True).strip()

    def job(self, task, context):
        job, job_path, home, codehome = super().job(task, context)
        # Replace only this fresh synthetic profile with a genuinely completed local wrapper.
        shutil.rmtree(home.parent)
        marker = Path(job['artifactDir']) / 'fixture-original-profile.json'
        script = "require('fs').writeFileSync(process.argv[1], JSON.stringify({home:process.env.HOME}))"
        subprocess.run([str(self.node), str(self.source / 'evals/host-run.mjs'),
            '--profiles-root', str(self.profiles), '--', str(self.node), '-e', script, str(marker)],
            check=True, capture_output=True, text=True, timeout=15)
        home = Path(json.loads(marker.read_text())['home'])
        return job, job_path, home, home.parent / 'codex-home'

    def close_task(self, task, worker_result, *, compute=True):
        if compute:
            self.compute('seal', [task])
        artifact = Path(worker_result['job']['artifactDir'])
        profile = Path(json.loads((artifact / 'runner-profile.json').read_text())['profilePath'])
        cleanup = __import__('eval_driver_runtime').verify_cleanup(profile, self.profiles)
        assert cleanup['groupGone'] and cleanup['cleanupComplete']
        write_json(artifact / 'process-termination.json', cleanup)
        outcome = {**{key: task[key] for key in ('suite', 'scenario', 'slot')},
            'state': 'sealed', 'completed': True, 'consumptionState': 'reserved',
            'chargedRoots': 1, 'actualModelStarted': True, 'cleanupComplete': True, 'groupGone': True,
            'validityProblems': [], 'findings': [], 'nativeErrors': [], 'timedOut': False,
            'malformedStream': False, 'watchdogStopReason': None,
            'fixtureOnly': True, 'qualifiedHost': False}
        write_json(artifact / 'operator-result.json', outcome)
        return outcome

    def real_coordinator(self, context):
        # Both Git roots are real and distinct; retain actual source/pin checks.
        spec = importlib.util.spec_from_file_location('composed_remaining_driver', self.driver / 'run-cohorts.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        original_execute_wrapper = module.execute_wrapper

        def synchronized_wrapper(command, *args, **kwargs):
            position = command.index('--') + 2
            if command[position] != str(self.driver / 'eval_host_worker.py'):
                raise ValueError('unexpected composed fixture worker entrypoint')
            command = [*command[:position], '-c', REFUSAL_BARRIER, str(self.driver),
                       *command[position + 1:]]
            return original_execute_wrapper(command, *args, **kwargs)

        module.execute_wrapper = synchronized_wrapper
        from unittest import mock
        with mock.patch.dict(sys.modules, {'eval_first_stage': self.stage}):
            driver = module.Driver(self.config_path, self.profiles, operator=self.operator,
                operator_sha256=digest(self.operator), binary=self.config['toolchain']['binary']['path'],
                auth_file=self.auth, node=str(self.node), timeout_seconds=COORDINATOR_TIMEOUT_SECONDS,
                fixture_tools=True, remaining_stage=context)
        return driver
