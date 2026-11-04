"""Opt-in, bounded observations of the composed offline fixture, never verdicts."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import threading
import time
from unittest import mock


ENVIRONMENT = 'EF_HOST_DRIVER_DIAGNOSTICS'
FILES = ('task.json', 'worker-job.json', 'launch-refusal.json', 'launch-consumption.json',
         'process-start.json', 'worker-result.json', 'operator-result.json',
         'runner-profile.json', 'process-termination.json', 'runner.stderr.log',
         'runner.stdout.log')
MAX_FILE_BYTES = 128 * 1024
MAX_TOTAL_BYTES = 8 * 1024 * 1024
MAX_EVENTS = 4096


def directory_fd(path):
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts:
        raise ValueError('diagnostic path must be absolute without traversal')
    descriptor = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.parts[1:]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                            dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def write_file(directory, name, data, *, append=False):
    descriptor = directory_fd(directory)
    try:
        flags = os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK
        output = os.open(name, flags | (os.O_APPEND if append else os.O_EXCL),
                         0o600, dir_fd=descriptor)
        try:
            info = os.fstat(output)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid():
                raise ValueError('unsafe diagnostic output')
            os.write(output, data)
        finally:
            os.close(output)
    finally:
        os.close(descriptor)


def create_session(fixture_root, label):
    target = os.environ.get(ENVIRONMENT)
    if not target:
        return None
    target = Path(target)
    fixture_root = Path(fixture_root)
    if target == fixture_root or fixture_root in target.parents or target in fixture_root.parents:
        raise ValueError('diagnostics must be outside fixture namespace')
    parent = directory_fd(target.parent)
    try:
        try:
            os.mkdir(target.name, 0o700, dir_fd=parent)
        except FileExistsError:
            pass
        descriptor = directory_fd(target)
        try:
            if os.fstat(descriptor).st_uid != os.getuid():
                raise ValueError('diagnostic directory must be owned')
        finally:
            os.close(descriptor)
    finally:
        os.close(parent)
    return Path(tempfile.mkdtemp(prefix=label + '-', dir=target))


class Observer:
    def __init__(self, directory):
        self.directory = Path(directory) if directory else None
        self.count = 0
        self.lock = threading.Lock()

    def emit(self, event, **fields):
        if self.directory is None:
            return
        with self.lock:
            if self.count >= MAX_EVENTS:
                return
            self.count += 1
            row = dict(event=event, pid=os.getpid(), monotonic_ns=time.monotonic_ns(), **fields)
            try:
                write_file(self.directory, f'events-{os.getpid()}.jsonl',
                           (json.dumps(row, sort_keys=True) + '\n').encode(), append=True)
            except (OSError, ValueError, TypeError):
                pass

    def wrap(self, original, event, describe=lambda *args, **kwargs: {}):
        def observed(*args, **kwargs):
            try:
                fields = describe(*args, **kwargs)
            except Exception as error:
                fields = {'description_error_type': type(error).__name__}
            self.emit(event + '-entry', **fields)
            try:
                result = original(*args, **kwargs)
            except BaseException as error:
                self.emit(event + '-raised', error_type=type(error).__name__, **fields)
                raise
            projection = result if event == 'accounting' else None
            self.emit(event + '-return', **fields, **({'projection': projection}
                      if projection is not None else {}))
            return result
        return observed

    def attach(self, module, stack):
        if self.directory is None:
            return
        original = module.execute_wrapper
        def execute(command, directory, **kwargs):
            worker_index = command.index(str(module.HERE / 'eval_host_worker.py'))
            bootstrap = ('import sys; sys.path.insert(0, sys.argv.pop(1)); '
                         'from composed_diagnostics import worker_main; worker_main()')
            observed = (command[:worker_index] + ['-B', '-c', bootstrap,
                        str(Path(__file__).parent), str(self.directory)] + command[worker_index:])
            return original(observed, directory, **kwargs)
        stack.enter_context(mock.patch.object(module, 'execute_wrapper', execute))
        stack.enter_context(mock.patch.object(module, 'inspect_consumption', self.wrap(
            module.inspect_consumption, 'accounting', lambda job, *args, **kwargs:
            {'ordinal': job['remainingStage']['ordinal']})))
        runtime = __import__('eval_driver_runtime')
        original_read = runtime.read_bound_json
        def read(path, **kwargs):
            if Path(path).name in ('launch-refusal.json', 'launch-consumption.json',
                                   'process-start.json'):
                return self.wrap(original_read, 'bound-read', lambda *args, **kwargs:
                    {'file': '/'.join(Path(path).parts[-4:])})(path, **kwargs)
            return original_read(path, **kwargs)
        stack.enter_context(mock.patch.object(runtime, 'read_bound_json', read))
        original_kill = os.kill
        observed_kill = self.wrap(original_kill, 'coordinator-signal',
            lambda target, signum: {'target_pid': target, 'signal': int(signum)})
        def kill(target, signum):
            if signum:
                return observed_kill(target, signum)
            return original_kill(target, signum)
        stack.enter_context(mock.patch.object(os, 'kill', kill))
        stack.enter_context(mock.patch.object(module, 'cancel_launches', self.wrap(
            module.cancel_launches, 'coordinator-cancellation')))
        self.emit('coordinator-observer-installed')


def worker_main():
    observer = Observer(sys.argv.pop(1))
    sys.argv = sys.argv[1:]
    filename = Path(sys.argv[0])
    sys.path.insert(0, str(filename.parent))
    spec = importlib.util.spec_from_file_location('observed_original_worker', filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.execute_job = observer.wrap(module.execute_job, 'authenticated-job',
        lambda job, **kwargs: {'ordinal': job['remainingStage']['ordinal']})
    module.save_refusal = observer.wrap(module.save_refusal, 'refusal-writer',
        lambda job, job_digest, state: {'ordinal': job['remainingStage']['ordinal'], 'state': state})
    module.os.killpg = observer.wrap(module.os.killpg, 'worker-group-signal',
        lambda target, signum: {'target_pgid': target, 'signal': int(signum)})
    module.cancel_launches = observer.wrap(module.cancel_launches, 'worker-cancellation')
    observer.emit('worker-observer-installed')
    raise SystemExit(module.main())


def retain(directory, root):
    if directory is None:
        return
    root, directory = Path(root), Path(directory)
    observer = Observer(directory)
    observer.emit('capture-entry')
    rows, total = [], 0
    candidates = [Path('output/cohorts/remaining-stage-summary.json'),
                  Path('output/cohorts/remaining-stage-events.jsonl')]
    cohorts = root / 'output/cohorts'
    for suite in ('merge-gate', 'iterate', 'next-steps'):
        try:
            suite_fd = directory_fd(cohorts / suite)
            try:
                for scenario in sorted(os.listdir(suite_fd))[:64]:
                    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,100}', scenario):
                        continue
                    for slot in range(1, 6):
                        for name in FILES:
                            candidates.append(Path('output/cohorts') / suite / scenario / f'slot-{slot}' / name)
            finally:
                os.close(suite_fd)
        except OSError as error:
            rows.append({'path': str(Path('output/cohorts') / suite),
                         'status': 'suite-unobserved-' + type(error).__name__})
    for relative in candidates[:4096]:
        status = 'unobserved'
        try:
            source_dir = directory_fd((root / relative).parent)
            try:
                source = os.open(relative.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                                 dir_fd=source_dir)
            finally:
                os.close(source_dir)
            try:
                info = os.fstat(source)
                if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid():
                    status = 'unsafe-file'
                elif info.st_size > MAX_FILE_BYTES or total + info.st_size > MAX_TOTAL_BYTES:
                    status = 'size-limit'
                else:
                    data = os.read(source, MAX_FILE_BYTES + 1)
                    if len(data) > MAX_FILE_BYTES or total + len(data) > MAX_TOTAL_BYTES:
                        status = 'size-limit'
                    else:
                        target = directory / f'raw-{len(rows):04d}'
                        write_file(directory, target.name, data)
                        total += len(data)
                        status = 'captured'
            finally:
                os.close(source)
        except FileNotFoundError:
            status = 'absent-at-capture'
        except (OSError, ValueError) as error:
            status = 'unreadable-' + type(error).__name__
        rows.append({'path': str(relative), 'status': status,
                     **({'raw': target.name, 'bytes': len(data)} if status == 'captured' else {})})
    manifest = {'pid': os.getpid(), 'monotonic_ns': time.monotonic_ns(), 'bytes': total,
                'files': rows, 'note': 'Absence of an event is unobserved, not proof of absence. '
                'Captured bytes may be partial; only original accounting decides authentication.'}
    write_file(directory, 'capture.json', json.dumps(manifest, indent=2).encode())
    observer.emit('capture-return')
