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
import sys
import threading

# CLI execution must leave the source checkout untouched.
sys.dont_write_bytecode = True

from eval_driver_runtime import execute_wrapper, save, sha, stop_wrappers, verify_cleanup

HERE = Path(__file__).resolve().parent
SOURCE_REPOSITORY = HERE.parents[1]
SUITES = ('merge-gate', 'iterate', 'next-steps')


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
                 auth_file, node='node', timeout_seconds=1800, fixture_tools=False):
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
        self.check_source()
        self.outroot = self.root / 'cohorts'
        self.outroot.mkdir(mode=0o700, exist_ok=False)
        self.journal = self.outroot / 'host-events.jsonl'
        self.journal.touch(mode=0o600, exist_ok=False)
        self.blocker = self.outroot / 'launch-blocked'
        self.gate = self.outroot / 'launch-gate'
        self.gate.touch(mode=0o600, exist_ok=False)
        self.stop = threading.Event()
        self.lock, self.launch_lock, self.active_lock = (threading.Lock() for _ in range(3))
        self.active = {}
        self.interrupted_signal = None

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
        with self.launch_lock:
            self.stop.set()
            with self.gate.open('rb') as gate:
                fcntl.flock(gate, fcntl.LOCK_EX)
                # Revoke the existing gate's shared launch permission before
                # best-effort marker publication can fail or delay cleanup.
                os.fchmod(gate.fileno(), 0o400)
                try:
                    self.blocker.touch(mode=0o600, exist_ok=True)
                except OSError:
                    pass

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
        if self.stop.is_set() or self.blocker.exists():
            return {**{k: task[k] for k in ('suite', 'scenario', 'slot')},
                    'state': 'not-launched-after-blocker', 'actualModelStarted': False,
                    'fixtureOnly': self.fixture_tools, 'qualifiedHost': not self.fixture_tools}
        self.check_pins()
        self.check_source()
        writable_future(self.root, (self.source,))
        writable_future(self.profiles_root, (self.source, self.root))
        self.validate_task(task)
        directory = self.outroot / task['suite'] / task['scenario'] / f"slot-{task['slot']}"
        directory.mkdir(parents=True, mode=0o700, exist_ok=False)
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
               'timeoutSeconds': self.timeout_seconds + 125, 'modelTimeoutSeconds': self.timeout_seconds,
               'blockerPath': str(self.blocker), 'launchGatePath': str(self.gate)}
        save(directory / 'worker-job.json', job)
        command = [self.node, str(HERE.parent / 'host-run.mjs'),
                   '--profiles-root', str(self.profiles_root), '--', sys.executable,
                   str(HERE / 'eval_host_worker.py'), '--job', str(directory / 'worker-job.json'),
                   '--digest', sha(directory / 'worker-job.json')]
        runner_code = execute_wrapper(command, directory, stop=self.stop, launch_lock=self.launch_lock,
                                      active=self.active, active_lock=self.active_lock,
                                      timeout_seconds=self.timeout_seconds + 140)
        outcome = self.finish_slot(task, directory, runner_code)
        save(directory / 'operator-result.json', outcome)
        self.event(outcome)
        return outcome

    def finish_slot(self, task, directory, runner_code):
        identity = {k: task[k] for k in ('suite', 'scenario', 'slot')}
        worker_path = directory / 'worker-result.json'
        worker = json.loads(worker_path.read_text()) if worker_path.is_file() else {}
        outcome = {**identity, **worker, 'raw': str(directory), 'runnerExitCode': runner_code,
                   'fixtureOnly': self.fixture_tools, 'qualifiedHost': not self.fixture_tools,
                   'actualModelStarted': (directory / 'process-start.json').is_file()}
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
                     and outcome['actualModelStarted'] and cleanup['cleanupComplete']
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
        if [len(p['tasks']) for p in prepared] != [40, 35, 75]:
            raise ValueError('qualified cohorts require exactly [40, 35, 75] slots')
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
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            pending = {pool.submit(self.run_slot, task) for task in tasks}
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
                        result = {'state': 'operator-error', 'error': str(error)}
                        results.append(result)
                        self.event(result)
        summary = {'sourceHead': self.config['expectedFrozenHead'], 'preparedTasks': len(tasks),
                   'started': len(list(self.outroot.glob('*/*/slot-*/process-start.json'))),
                   'sealed': sum(x.get('state') == 'sealed' for x in results),
                   'notLaunched': sum(x.get('actualModelStarted') is False for x in results),
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


if __name__ == '__main__':
    raise SystemExit(main())
