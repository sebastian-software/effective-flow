#!/usr/bin/env python3
"""Run qualified cohorts through the repository host runner."""

from __future__ import annotations

import argparse
import concurrent.futures
import itertools
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import stat
import sys
import threading
import uuid

# CLI execution must leave the source checkout untouched.
sys.dont_write_bytecode = True

from eval_driver_runtime import (execute_wrapper, save, sha, stop_wrappers, verify_cleanup,
                                 capture_accounting_paths, inspect_consumption, read_bound_json, accounting_exists)
from eval_host_worker import cancel_launches, open_cancellation

HERE = Path(__file__).resolve().parent
SOURCE_REPOSITORY = HERE.parents[1]
SUITES = ('merge-gate', 'iterate', 'next-steps')
_NO_FIRST_STAGE = object()


def runner_pins():
    files = [HERE.parent / 'host-run.mjs']
    files.extend(HERE.parent / '_scaffold' / ('host-profile-' + name + '.mjs')
                 for name in ('storage', 'cleanup', 'process', 'child'))
    return {str(path): sha(path) for path in files}


def canonical(path):
    path = Path(path)
    if not path.is_absolute() or path.resolve() != path:
        raise ValueError('expected canonical absolute path: ' + str(path))
    return path


def overlaps(left, right):
    return left == right or left in right.parents or right in left.parents


def source_roots():
    # Also protect the primary repository when this driver lives in a worktree.
    common = subprocess.check_output(
        ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'],
        cwd=SOURCE_REPOSITORY, text=True, timeout=10).strip()
    return (SOURCE_REPOSITORY, canonical(common).parent)


def writable_future(path, protected=()):
    path = canonical(path)
    if any(overlaps(path, root) for root in (*source_roots(), *protected)):
        raise ValueError('runtime writes must be disjoint from protected source paths')
    return path


class Driver:
    def __init__(self, config_file, profiles_root, *, operator, operator_sha256, binary,
                 auth_file, node='node', timeout_seconds=1800, fixture_tools=False,
                 first_stage=_NO_FIRST_STAGE, remaining_stage=_NO_FIRST_STAGE):
        self.first_stage = None
        self.remaining_stage = None
        if first_stage is not _NO_FIRST_STAGE and remaining_stage is not _NO_FIRST_STAGE:
            raise ValueError('simultaneous stage contexts')
        if remaining_stage is not _NO_FIRST_STAGE:
            from eval_first_stage import remaining_context_data
            staged = remaining_context_data(remaining_stage)
            if set(remaining_stage) != {'schemaVersion', 'corpus', 'grant', 'admission'}:
                raise ValueError('remaining coordinator requires a fresh consumed admission')
            expected = staged['config']
            if type(fixture_tools) is not bool or fixture_tools is not staged['fixtureOnly']:
                raise ValueError('remaining actual fixture mode changed')
            if (str(config_file) != staged['corpusData']['config']['path']
                    or str(profiles_root) != expected['profilesRoot']
                    or str(operator) != staged['corpusData']['operator']['path']
                    or operator_sha256 != staged['corpusData']['operator']['sha256']
                    or str(binary) != expected['toolchain']['binary']['path']
                    or str(node) != expected['node'] or str(auth_file) != expected['authFile']
                    or str(HERE.parents[1]) != expected['driverRoot']
                    or str(Path(sys.executable).resolve()) != expected['python']):
                raise ValueError('remaining actual coordinator launch inputs changed')
            self.remaining_stage = remaining_stage
            # Consumed admission also consumes setup: no second constructor after an early failure.
            self.journal = Path(expected['outputRoot']) / 'cohorts/remaining-stage-events.jsonl'
            self.journal.touch(mode=0o600, exist_ok=False)
        if first_stage is not _NO_FIRST_STAGE:
            from eval_first_stage import context_data
            staged = context_data(first_stage, initial=True)
            expected = staged['config']
            if (str(config_file) != staged['corpusData']['config']['path']
                    or str(profiles_root) != expected['profilesRoot']
                    or str(operator) != staged['corpusData']['operator']['path']
                    or operator_sha256 != staged['corpusData']['operator']['sha256']
                    or str(binary) != expected['toolchain']['binary']['path']
                    or str(node) != expected['node']
                    or str(auth_file) != expected['authFile']
                    or str(HERE.parents[1]) != expected['driverRoot']
                    or str(Path(sys.executable).resolve()) != expected['python']):
                raise ValueError('first-stage actual coordinator launch inputs changed')
            self.first_stage = first_stage
        self.config_file = canonical(config_file)
        self.config = json.loads(self.config_file.read_text())
        self.source = canonical(self.config['frozenRoot'])
        self.root = writable_future(self.config['outputRoot'], (self.source,))
        self.profiles_root = writable_future(profiles_root, (self.source, self.root))
        self.operator, self.binary, self.auth = map(canonical, (operator, binary, auth_file))
        if any(overlaps(self.profiles_root, path) for path in
               (self.config_file, self.operator, self.binary, self.auth)):
            raise ValueError('profiles root overlaps a pinned input or auth reference')
        if not isinstance(operator_sha256, str) or not re.fullmatch(r'sha256:[0-9a-f]{64}', operator_sha256):
            raise ValueError('operator_sha256 requires an explicit trusted sha256 digest')
        self.operator_sha256 = operator_sha256
        if sha(self.operator) != operator_sha256:
            raise ValueError('qualification operator pin changed')
        if not self.auth.is_file():
            raise ValueError('explicit auth reference does not exist')
        if not 0 < timeout_seconds <= 1800:
            raise ValueError('slot timeout must be in (0, 1800] seconds')
        self.node, self.timeout_seconds = node, timeout_seconds
        self.fixture_tools = fixture_tools
        self.pins = runner_pins()
        for path in (self.config_file, self.operator, self.binary, Path(__file__).resolve(),
                     HERE / 'eval_driver_runtime.py', HERE / 'eval_host_worker.py'):
            self.pins[str(path)] = sha(path)
        if self.first_stage is not None:
            for ref in (*staged['corpusData']['driverFiles'], first_stage['corpus'], first_stage['grant']):
                self.pins[ref['path']] = ref['sha256']
        if self.remaining_stage is not None:
            for ref in (*staged['corpusData']['driverFiles'], remaining_stage['corpus'],
                        remaining_stage['grant'], remaining_stage['admission']):
                self.pins[ref['path']] = ref['sha256']
        self.check_source()
        self.outroot = self.root / 'cohorts'
        if self.remaining_stage is None:
            self.outroot.mkdir(mode=0o700, exist_ok=False)
        else:
            from eval_first_stage import remaining_context_data
            remaining_context_data(self.remaining_stage)
        self.journal = self.outroot / ('remaining-stage-events.jsonl' if self.remaining_stage is not None
                                      else 'host-events.jsonl')
        if self.remaining_stage is None:
            self.journal.touch(mode=0o600, exist_ok=False)
        self.blocker = self.outroot / 'launch-blocked'
        self.gate = self.outroot / 'launch-gate'
        if self.remaining_stage is None:
            self.gate.touch(mode=0o600, exist_ok=False)
        self.base_accounting = capture_accounting_paths(self.outroot, self.root, self.gate)
        self.stop = threading.Event()
        self.lock, self.launch_lock, self.active_lock = (threading.Lock() for _ in range(3))
        self.active = {}
        self.admissions = {}
        self.parent_identities = {}
        if self.remaining_stage is not None:
            for directory in self.outroot.iterdir():
                if directory.is_dir():
                    for parent in (directory, *(p for p in directory.iterdir() if p.is_dir())):
                        info = parent.lstat()
                        self.parent_identities[parent] = (info.st_dev, info.st_ino)
        self.interrupted_signal = None
        self.profiles_root.mkdir(mode=0o700, exist_ok=True)
        info = self.profiles_root.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid():
            raise ValueError('profiles root must be an owned directory')
        self.cancellation_path = (Path(staged['remainingGrantData']['cancellation']['path'])
                                  if self.remaining_stage is not None else
                                  self.profiles_root / ('launch-cancellation-' + str(uuid.uuid4()) + '.fifo'))
        os.mkfifo(self.cancellation_path, 0o600)
        created_fifo = None

        def owned_created_fifo(info):
            return (stat.S_ISFIFO(info.st_mode) and info.st_uid == os.getuid()
                    and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600
                    and (info.st_dev, info.st_ino) == created_fifo)

        try:
            if self.remaining_stage is not None:
                # Retain the creation identity before opening either coordinator descriptor.
                info = self.cancellation_path.lstat()
                created_fifo = (info.st_dev, info.st_ino)
                if not owned_created_fifo(info):
                    raise ValueError('created remaining cancellation is unsafe')
            self.cancellation = open_cancellation({'cancellationPath': str(self.cancellation_path)})
            if self.remaining_stage is not None:
                from eval_first_stage import durable_remaining_record, remaining_context_data
                for info in (*(os.fstat(fd) for fd in self.cancellation), self.cancellation_path.lstat()):
                    if not owned_created_fifo(info):
                        raise ValueError('opened remaining cancellation differs from created FIFO')
                ref = durable_remaining_record(self.outroot / 'remaining-stage-cancellation.json',
                    {'schemaVersion': 1, 'admission': self.remaining_stage['admission'],
                     'path': str(self.cancellation_path), 'dev': created_fifo[0], 'ino': created_fifo[1]})
                self.remaining_stage = {**self.remaining_stage, 'cancellation': ref}
                self.pins[ref['path']] = ref['sha256']
                remaining_context_data(self.remaining_stage)
        except BaseException:
            if self.remaining_stage is None:
                if getattr(self, 'cancellation', None) is not None:
                    for fd in self.cancellation:
                        os.close(fd)
                    self.cancellation = None
                self.cancellation_path.unlink()
            else:
                # Cleanup must neither unlink a replacement nor obscure the setup refusal.
                for fd in getattr(self, 'cancellation', ()) or ():
                    try:
                        os.close(fd)
                    except OSError:
                        pass
                self.cancellation = None
                try:
                    if created_fifo is not None and owned_created_fifo(self.cancellation_path.lstat()):
                        self.cancellation_path.unlink()
                except OSError:
                    pass
            raise

    def close(self):
        if self.cancellation is not None:
            for fd in self.cancellation:
                os.close(fd)
            self.cancellation = None
            if getattr(self, 'remaining_stage', None) is not None:
                from eval_first_stage import pinned
                record = pinned(self.remaining_stage['cancellation'], json_value=True)
                info = self.cancellation_path.lstat()
                if (info.st_dev, info.st_ino) != (record['dev'], record['ino']) or not stat.S_ISFIFO(info.st_mode):
                    raise ValueError('remaining cancellation changed before close')
            self.cancellation_path.unlink()

    def check_source(self):
        def git(*args):
            return subprocess.check_output(['git', *args], cwd=self.source, text=True, timeout=10).strip()
        isolation_error = 'frozen source requires its own Git common directory'
        if git('rev-parse', '--is-bare-repository') != 'false':
            raise ValueError(isolation_error)
        expected_common = self.source / '.git'
        try:
            common = canonical(git('rev-parse', '--path-format=absolute', '--git-common-dir'))
            git_directory = canonical(git('rev-parse', '--absolute-git-dir'))
        except ValueError as error:
            raise ValueError(isolation_error) from error
        if common != expected_common or git_directory != expected_common:
            raise ValueError(isolation_error)
        host_common = Path(subprocess.check_output(
            ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'],
            cwd=SOURCE_REPOSITORY, text=True, timeout=10).strip())
        if common.samefile(host_common):
            raise ValueError(isolation_error)
        if canonical(git('rev-parse', '--show-toplevel')) != self.source:
            raise ValueError('frozen source must be a Git working root')
        if self.config.get('frozenBranch') is not None and git('branch', '--show-current') != self.config['frozenBranch']:
            raise ValueError('frozen source branch changed')
        if git('rev-parse', 'HEAD') != self.config['expectedFrozenHead']:
            raise ValueError('frozen source HEAD changed')
        if getattr(self, 'first_stage', None) is not None or getattr(self, 'remaining_stage', None) is not None:
            if git('rev-parse', 'HEAD^{tree}') != self.config['expectedFrozenTree']:
                raise ValueError('first-stage frozen source tree changed')
        for args in (('diff', '--name-only', 'HEAD'), ('diff', '--cached', '--name-only'),
                     ('ls-files', '--others', '--exclude-standard')):
            if git(*args):
                raise ValueError('frozen source is dirty')

    def check_pins(self):
        for filename, digest in self.pins.items():
            if sha(filename) != digest:
                raise ValueError('pinned input changed: ' + filename)

    def block(self):
        import fcntl
        try:
            with self.launch_lock:
                self.stop.set()
                try:
                    cancel_launches(self.cancellation)
                finally:
                    gate = None
                    try:
                        gate = self.gate.open('rb')
                        fcntl.flock(gate, fcntl.LOCK_EX)
                        # Revoke the existing gate's shared launch permission before
                        # best-effort marker publication can fail or delay cleanup.
                        os.fchmod(gate.fileno(), 0o400)
                        try:
                            self.blocker.touch(mode=0o600, exist_ok=True)
                        except OSError:
                            pass
                    except OSError:
                        pass
                    finally:
                        if gate is not None:
                            gate.close()
        finally:
            # These live Popen objects belong to this coordinator. Wrapper
            # shutdown kills its bridge group without acquiring the gate.
            with self.active_lock:
                processes = list(self.active.values())
            stop_wrappers(processes)

    def event(self, value):
        with self.lock:
            with self.journal.open('a') as stream:
                stream.write(json.dumps(value) + '\n')
            print(json.dumps(value), flush=True)

    def interrupt(self, signum, _frame):
        # The handler marks cancellation only. The main thread performs blocking
        # shutdown outside a Python signal handler and outside launch locks.
        self.interrupted_signal = signum
        self.stop.set()

    def validate_task(self, task):
        for key in ('projectRoot', 'attemptRoot', 'prompt', 'runMetadata'):
            canonical(task[key])
        cli_tmp = Path(task['attemptRoot']).with_name(Path(task['attemptRoot']).name + '-cli-tmp')
        for target in (task['attemptRoot'], task['projectRoot'], cli_tmp):
            path = writable_future(target, (self.source, self.profiles_root, self.outroot))
            if path == self.root or path in self.root.parents:
                raise ValueError('task root must not contain cohort output')
        if sha(task['prompt']) != json.loads(Path(task['runMetadata']).read_text())['promptDigest']:
            raise ValueError('rendered prompt digest changed')
        if task['suite'] not in SUITES or task['profile'] != self.config['profiles'][task['suite']]:
            raise ValueError('task profile is not the approved suite profile')
        if (type(task['slot']) is not int or task['slot'] < 1
                or task['scenario'] in ('', '.', '..') or Path(task['scenario']).name != task['scenario']):
            raise ValueError('unsafe slot identity')

    def run_slot(self, task):
        try:
            return self._run_slot(task)
        except Exception:
            # A failed future may not be collected by run_all immediately.
            self.block()
            raise

    def _run_slot(self, task):
        if getattr(self, 'remaining_stage', None) is not None:
            from eval_first_stage import pinned, remainder_tasks, validate_remaining_task, CORPUS_LIMIT
            corpus = pinned(self.remaining_stage['corpus'], json_value=True, maximum=CORPUS_LIMIT)
            tasks = remainder_tasks([r['task'] for suite in corpus['suites'] for r in suite['tasks']])
            ordinal = tasks.index(task) + 1
            validate_remaining_task(self.remaining_stage, task, self.outroot / task['suite'] /
                                    task['scenario'] / f"slot-{task['slot']}",
                                    ordinal=ordinal, batch=(ordinal - 1) // 6 + 1)
        if getattr(self, 'first_stage', None) is not None:
            from eval_first_stage import validate_stage_task
            validate_stage_task(self.first_stage, task, self.outroot / task['suite'] /
                                task['scenario'] / f"slot-{task['slot']}")
        identity = tuple(task[k] for k in ('suite', 'scenario', 'slot'))
        admission = {'attempted': False, 'refused': False}
        self.admissions[identity] = admission
        directory = self.outroot / task['suite'] / task['scenario'] / f"slot-{task['slot']}"
        if self.stop.is_set() or self.blocker.exists():
            return {**{k: task[k] for k in ('suite', 'scenario', 'slot')},
                    'state': 'not-launched-after-blocker', 'actualModelStarted': False,
                    **self.accounting_projection(task, directory),
                    'fixtureOnly': self.fixture_tools, 'qualifiedHost': not self.fixture_tools}
        self.check_pins()
        self.check_source()
        writable_future(self.root, (self.source,))
        writable_future(self.profiles_root, (self.source, self.root))
        self.validate_task(task)
        directory = self.outroot / task['suite'] / task['scenario'] / f"slot-{task['slot']}"
        # Only suite/scenario parents may be shared; their identities are retained.
        with self.lock:
            for parent in (directory.parent.parent, directory.parent):
                if parent not in self.parent_identities:
                    parent.mkdir(mode=0o700, exist_ok=False)
                    info = parent.lstat()
                    self.parent_identities[parent] = (info.st_dev, info.st_ino)
                info = parent.lstat()
                if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid()
                        or (info.st_dev, info.st_ino) != self.parent_identities[parent]):
                    raise ValueError('shared artifact parent identity changed')
            directory.mkdir(mode=0o700, exist_ok=False)
        save(directory / 'task.json', task)
        job = {'artifactDir': str(directory), 'profilesRoot': str(self.profiles_root),
               'task': task, 'binary': str(self.binary), 'operator': str(self.operator),
               'operatorSha256': self.operator_sha256,
               'node': self.node, 'authFile': str(self.auth), 'source': str(self.source),
               'configFile': str(self.config_file), 'qualificationDigest': self.config['qualificationDigest'],
               'pins': {**self.pins, task['prompt']: sha(task['prompt']),
                        task['runMetadata']: sha(task['runMetadata'])},
               'driverDigest': self.pins[str(Path(__file__).resolve())],
               'fixtureTools': self.fixture_tools, 'coordinatorPid': os.getpid(),
               'cancellationPath': str(self.cancellation_path),
               'timeoutSeconds': self.timeout_seconds + 125, 'modelTimeoutSeconds': self.timeout_seconds,
               'blockerPath': str(self.blocker), 'launchGatePath': str(self.gate)}
        if getattr(self, 'first_stage', None) is not None:
            job['firstStage'] = {**self.first_stage, 'ordinal': task['slot']}
        if getattr(self, 'remaining_stage', None) is not None:
            job['remainingStage'] = {**self.remaining_stage, 'ordinal': ordinal, 'batch': (ordinal - 1) // 6 + 1}
        job['accounting'] = capture_accounting_paths(directory, self.root, self.gate)
        current = {entry['path']: entry for entry in job['accounting']['directories']}
        if (job['accounting']['gate'] != self.base_accounting['gate']
                or any(current[entry['path']] != entry for entry in self.base_accounting['directories'])):
            raise ValueError('coordinator accounting ancestry or gate changed')
        save(directory / 'worker-job.json', job)
        job_digest = sha(directory / 'worker-job.json')
        admission.update(job=job, jobPath=directory / 'worker-job.json', jobDigest=job_digest)
        command = [self.node, str(HERE.parent / 'host-run.mjs'),
                   '--profiles-root', str(self.profiles_root), '--', sys.executable,
                   str(HERE / 'eval_host_worker.py'), '--job', str(directory / 'worker-job.json'),
                   '--digest', job_digest]
        admission['attempted'] = True
        runner_code = execute_wrapper(command, directory, stop=self.stop, launch_lock=self.launch_lock,
                                      active=self.active, active_lock=self.active_lock,
                                      timeout_seconds=self.timeout_seconds + 140)
        admission['refused'] = runner_code is None
        outcome = self.finish_slot(task, directory, runner_code)
        save(directory / 'operator-result.json', outcome)
        self.event(outcome)
        return outcome

    def accounting_projection(self, task, directory):
        identity = tuple(task[k] for k in ('suite', 'scenario', 'slot'))
        admission = getattr(self, 'admissions', {}).get(identity)
        unknown = {'consumptionState': 'reservation-unknown', 'chargedRoots': 1,
                   'actualModelStarted': None}
        if admission is None:
            return unknown
        if 'job' not in admission:
            try:
                absent = (not accounting_exists(directory / 'launch-consumption.json')
                          and not accounting_exists(directory / 'process-start.json'))
            except OSError:
                return unknown
            if not admission['attempted'] and absent:
                return {'consumptionState': 'not-reserved', 'chargedRoots': 0,
                        'actualModelStarted': False}
            return unknown
        return inspect_consumption(admission['job'], admission['jobPath'], admission['jobDigest'],
                                   fixture_only=self.fixture_tools,
                                   wrapper_attempted=admission['attempted'],
                                   wrapper_refused=admission['refused'])

    def finish_slot(self, task, directory, runner_code):
        identity = {k: task[k] for k in ('suite', 'scenario', 'slot')}
        worker_path = directory / 'worker-result.json'
        accounting = self.accounting_projection(task, directory)
        worker = read_bound_json(worker_path)[0] if worker_path.is_file() else {}
        outcome = {**identity, **worker, 'raw': str(directory), 'runnerExitCode': runner_code,
                   'fixtureOnly': self.fixture_tools, 'qualifiedHost': not self.fixture_tools,
                   **accounting}
        reference = directory / 'runner-profile.json'
        cleanup = {'groupGone': False, 'cleanupComplete': False}
        if reference.is_file():
            profile = json.loads(reference.read_text())['profilePath']
            cleanup = verify_cleanup(profile, self.profiles_root)
        save(directory / 'process-termination.json', cleanup)
        rows, malformed = [], False
        stdout = directory / 'stdout.jsonl'
        if stdout.is_file():
            for line in stdout.read_text().splitlines():
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    malformed = True
        objects = all(isinstance(row, dict) for row in rows)
        native_errors = [row for row in rows if isinstance(row, dict) and
                         (row.get('type') == 'error' or isinstance(row.get('item'), dict)
                          and row['item'].get('type') == 'error')]
        watchdog_file = directory / 'watchdog-stop.json'
        watchdog_reason = json.loads(watchdog_file.read_text())['reason'] if watchdog_file.is_file() else None
        timed_out = watchdog_reason == 'timeout'
        completed = (runner_code == 0 and worker.get('exitCode') == 0
                     and outcome['consumptionState'] == 'reserved' and outcome['chargedRoots'] == 1
                     and outcome['actualModelStarted'] is True and cleanup['cleanupComplete']
                     and watchdog_reason is None and not malformed and objects
                     and any(row.get('type') == 'turn.completed' for row in rows)
                     and not any(row.get('type') == 'turn.failed' for row in rows)
                     and (directory / 'last-message.txt').is_file())
        outcome.update(completed=completed, groupGone=cleanup['groupGone'],
                       cleanupComplete=cleanup['cleanupComplete'], timedOut=timed_out,
                       watchdogStopReason=watchdog_reason,
                       malformedStream=malformed, nativeErrors=native_errors)
        outcome['state'] = ('host-completed' if completed else
                            worker.get('state') if worker.get('state') in
                            ('qualification-refused-before-launch', 'not-launched-after-blocker')
                            else 'not-launched-after-blocker' if runner_code is None else 'host-not-completed')
        save(directory / 'host-outcome.json', outcome)
        if not completed:
            self.block()
            return outcome
        self.check_pins()
        self.check_source()
        launch = json.loads((directory / 'launch.json').read_text())
        receipt = {'schemaVersion': 1, 'nonForked': True, 'initialWorkingRoot': launch['cwd'],
                   'taskInput': 'rendered-prompt-only', 'completed': True, 'profile': task['profile'],
                   'fixtureOnly': self.fixture_tools, 'qualifiedHost': not self.fixture_tools}
        save(directory / 'host-receipt.json', receipt)
        seal = subprocess.run([self.node, str(self.operator), str(self.config_file), 'seal', task['suite'],
                               str(directory / 'task.json'), str(directory / 'host-receipt.json')],
                              cwd=self.source, capture_output=True, text=True, timeout=180)
        (directory / 'seal.stdout.json').write_text(seal.stdout)
        (directory / 'seal.stderr.log').write_text(seal.stderr)
        if seal.returncode:
            outcome.update(state='seal-refused', sealExit=seal.returncode)
            self.block()
        else:
            result = json.loads(seal.stdout)
            problems, findings = result['evaluation']['validityProblems'], result['evaluation']['findings']
            outcome.update(state='sealed', validityProblems=problems, findings=findings)
            if problems or findings or native_errors:
                self.block()
        return outcome

    def run_all(self):
        prepared = [json.loads((self.root / f'prepared-{suite}.json').read_text()) for suite in SUITES]
        if [len(p['tasks']) for p in prepared] != [45, 35, 75]:
            raise ValueError('qualified cohorts require exactly [45, 35, 75] slots')
        for suite, manifest in zip(SUITES, prepared):
            if (manifest['sourceHead'] != self.config['expectedFrozenHead']
                    or str(canonical(manifest['base'])) != manifest['base']):
                raise ValueError('prepared source or base changed')
            for task in manifest['tasks']:
                if task['suite'] != suite:
                    raise ValueError('prepared task suite changed')
                self.validate_task(task)
                for key in ('prompt', 'runMetadata'):
                    self.pins[task[key]] = sha(task[key])
        identities = [(task['suite'], task['scenario'], task['slot'])
                      for manifest in prepared for task in manifest['tasks']]
        if len(set(identities)) != len(identities):
            raise ValueError('duplicate prepared task identity')
        for suite in SUITES:
            path = self.root / f'prepared-{suite}.json'
            self.pins[str(path)] = sha(path)
        tasks = [task for group in itertools.zip_longest(*(p['tasks'] for p in prepared))
                 for task in group if task is not None]
        self.event({'state': 'starting', 'tasks': len(tasks), 'sourceHead': self.config['expectedFrozenHead'],
                    'concurrency': 6, 'qualificationDigest': self.config['qualificationDigest']})
        results = []
        for task in tasks:
            self.admissions[tuple(task[k] for k in ('suite', 'scenario', 'slot'))] = {
                'attempted': False, 'refused': False}
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            futures = {pool.submit(self.run_slot, task): task for task in tasks}
            pending = set(futures)
            while pending:
                if self.interrupted_signal is not None:
                    self.block()
                    with self.active_lock:
                        processes = list(self.active.values())
                    stop_wrappers(processes)
                done, pending = concurrent.futures.wait(pending, timeout=0.1,
                                                       return_when=concurrent.futures.FIRST_COMPLETED)
                for future in done:
                    try:
                        results.append(future.result())
                    except Exception as error:
                        self.block()
                        task = futures[future]
                        directory = self.outroot / task['suite'] / task['scenario'] / f"slot-{task['slot']}"
                        result = {**{k: task[k] for k in ('suite', 'scenario', 'slot')},
                                  'state': 'operator-error', 'error': str(error), 'raw': str(directory),
                                  **self.accounting_projection(task, directory)}
                        results.append(result)
                        self.event(result)
        # Reconcile the complete prepared identity set, including failed futures.
        accounting = [self.accounting_projection(task, self.outroot / task['suite'] /
                      task['scenario'] / f"slot-{task['slot']}") for task in tasks]
        accounting_complete = all(x['consumptionState'] != 'reservation-unknown' for x in accounting)
        if not accounting_complete:
            self.block()
        summary = {'sourceHead': self.config['expectedFrozenHead'], 'preparedTasks': len(tasks),
                   'chargedRoots': sum(x['chargedRoots'] for x in accounting),
                   'reservedRoots': sum(x['consumptionState'] == 'reserved' for x in accounting),
                   'reservationUnknownRoots': sum(x['consumptionState'] == 'reservation-unknown' for x in accounting),
                   'accountingComplete': accounting_complete,
                   'started': sum(x['actualModelStarted'] is True for x in accounting),
                   'sealed': sum(x.get('state') == 'sealed' for x in results),
                   'notLaunched': sum(x['consumptionState'] == 'not-reserved' for x in accounting),
                   'operatorErrors': sum(x.get('state') == 'operator-error' for x in results),
                   'fixtureOnly': self.fixture_tools, 'qualifiedHost': not self.fixture_tools,
                   'blocked': self.stop.is_set(), 'signal': self.interrupted_signal, 'results': results}
        save(self.outroot / 'summary.json', summary)
        self.event({k: v for k, v in summary.items() if k != 'results'})
        return 128 + self.interrupted_signal if self.interrupted_signal else int(self.stop.is_set())


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config', type=Path, nargs='?')
    parser.add_argument('--profiles-root', type=Path, required=True)
    parser.add_argument('--recover', action='store_true', help='runner recovery only; never kills live groups')
    parser.add_argument('--operator', type=Path)
    parser.add_argument('--operator-sha256', help='trusted expected operator pin: sha256:<64 lowercase hex>')
    parser.add_argument('--binary', type=Path)
    parser.add_argument('--auth-file', type=Path, help='reference only; contents are never read')
    parser.add_argument('--timeout-seconds', type=float, default=1800)
    args = parser.parse_args(argv)
    if args.recover:
        if args.config is not None or any((args.operator, args.operator_sha256, args.binary, args.auth_file)):
            parser.error('--recover accepts no config or launch inputs')
        runner_pins()
        return subprocess.call(['node', str(HERE.parent / 'host-run.mjs'),
                                '--profiles-root', str(writable_future(args.profiles_root)), '--recover'])
    if args.config is None:
        parser.error('config is required unless --recover is selected')
    if not all((args.operator, args.operator_sha256, args.binary, args.auth_file)):
        parser.error('a round requires --operator, --operator-sha256, --binary, and --auth-file')
    driver = Driver(args.config, args.profiles_root, operator=args.operator, operator_sha256=args.operator_sha256, binary=args.binary,
                    auth_file=args.auth_file, timeout_seconds=args.timeout_seconds)
    previous = {sig: signal.signal(sig, driver.interrupt) for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)}
    try:
        return driver.run_all()
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)
        driver.close()


if __name__ == '__main__':
    raise SystemExit(main())
