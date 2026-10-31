"""Small shared lifecycle primitives for the repository qualified eval driver."""

from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
import signal
import stat
import subprocess
import time

CACHE_PATHS = (
    'home/.codex/cache', 'home/.codex/plugins/cache',
    'codex-home/cache', 'codex-home/plugins/cache',
)


def sha(path):
    return 'sha256:' + hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, value):
    with Path(path).open('x', encoding='utf-8') as stream:
        os.chmod(path, 0o600)
        json.dump(value, stream, indent=2)
        stream.write('\n')


def read_json(path):
    return read_bound_json(path)[0]


def process_gone(pid):
    try:
        os.kill(pid, 0)
        return False
    except ProcessLookupError:
        return True
    except PermissionError:
        return False


def _identity(path, expected):
    info = path.lstat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid()
            or {'dev': info.st_dev, 'ino': info.st_ino} != expected):
        raise ValueError('runner directory identity changed')


def registered_profile(profile_path, profiles_root, *, own_group=False):
    profile, root = Path(profile_path), Path(profiles_root)
    if (profile.parent != root or profile.resolve() != profile
            or root.resolve() != root or not profile.name.startswith('profile-')):
        raise ValueError('noncanonical runner profile')
    record = read_json(profile / 'host-profile.json')
    if (type(record.get('schema')) is not int or record.get('schema') != 1 or record.get('kind') != 'effective-flow-host-profile'
            or record.get('id') != profile.name[8:] or record.get('phase') != 'armed'
            or type(record.get('childPgid')) is not int or record['childPgid'] <= 1
            or type(record.get('ownerPid')) is not int or record['ownerPid'] <= 1):
        raise ValueError('unrecognized armed runner profile')
    _identity(root, record['root'])
    _identity(profile, record['directory'])
    if own_group and record['childPgid'] != os.getpgrp():
        raise ValueError('bridge is outside registered process group')
    return record


def verify_cleanup(profile_path, profiles_root):
    """Read-only proof: never signal a PID taken from retained metadata."""
    profile = Path(profile_path)
    record = registered_profile(profile, profiles_root)
    gone = process_gone(-record['childPgid'])
    clean = False
    receipt = None
    try:
        receipt = read_json(profile / 'host-profile-cleanup.json')
        caches = receipt.get('caches', [])
        clean = (receipt.get('schema') == 1 and receipt.get('profileId') == record['id']
                 and len(caches) == 4
                 and {x.get('path') for x in caches} == set(CACHE_PATHS)
                 and all(x.get('status') == 'removed' for x in caches)
                 and all(not os.path.lexists(profile / path) for path in CACHE_PATHS))
    except FileNotFoundError:
        pass
    return {'profilePath': str(profile), 'childPgid': record['childPgid'],
            'groupGone': gone, 'cleanupComplete': gone and clean, 'receipt': receipt}


def execute_wrapper(command, artifact_dir, *, stop, launch_lock, active, active_lock,
                    timeout_seconds):
    """Launch only the runner wrapper; its PID is never treated as its child PGID."""
    directory = Path(artifact_dir)
    with (directory / 'runner.stdout.log').open('xb') as out, (directory / 'runner.stderr.log').open('xb') as err:
        with launch_lock:
            if stop.is_set():
                return None
            process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=out, stderr=err)
            with active_lock:
                active[process.pid] = process
        try:
            try:
                code = process.wait(timeout=timeout_seconds)
            except subprocess.TimeoutExpired:
                process.terminate()
                # Do not SIGKILL the wrapper: it still owns group shutdown and cache cleanup.
                code = process.wait(timeout=15)
            return code
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=15)
            with active_lock:
                active.pop(process.pid, None)


def stop_wrappers(processes):
    for process in processes:
        if process.poll() is None:
            try:
                process.send_signal(signal.SIGTERM)
            except ProcessLookupError:
                pass
    deadline = time.monotonic() + 15
    for process in processes:
        process.wait(timeout=max(0.1, deadline - time.monotonic()))


# D2 metadata is bounded and read through no-follow, nonblocking descriptors.
# Jobs include the cohort-wide input pins and therefore have a separate limit.
JOB_LIMIT = 1024 * 1024
RECEIPT_LIMIT = 16384


def _unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('duplicate JSON key')
        value[key] = item
    return value


def _file_info(fd, *, maximum):
    info = os.fstat(fd)
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
            or info.st_nlink != 1 or not 0 <= info.st_size <= maximum):
        raise ValueError('unsafe accounting metadata')
    return info


def _same_file(left, right):
    return (left.st_dev, left.st_ino, left.st_size) == (right.st_dev, right.st_ino, right.st_size)


def read_bound_json(path, *, expected_digest=None, maximum=RECEIPT_LIMIT, directory_fd=None,
                    sync=False, expected_mode=None):
    if directory_fd is None:
        absolute = Path(path)
        if not absolute.is_absolute() or absolute.resolve() != absolute:
            raise ValueError('noncanonical accounting metadata path')
    if expected_digest is not None and (not isinstance(expected_digest, str)
            or not re.fullmatch(r'sha256:[0-9a-f]{64}', expected_digest)):
        raise ValueError('invalid expected accounting digest')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory_fd)
    try:
        before = _file_info(fd, maximum=maximum)
        if expected_mode is not None and stat.S_IMODE(before.st_mode) != expected_mode:
            raise ValueError('unsafe accounting metadata permissions')
        data = bytearray()
        while True:
            part = os.read(fd, min(65536, maximum + 1 - len(data)))
            if not part:
                break
            data.extend(part)
            if len(data) > maximum:
                raise ValueError('oversize accounting metadata')
        after = _file_info(fd, maximum=maximum)
        entry = os.stat(path, dir_fd=directory_fd, follow_symlinks=False)
        if not _same_file(before, after) or not _same_file(after, entry) or len(data) != after.st_size:
            raise ValueError('accounting metadata identity changed')
        digest = 'sha256:' + hashlib.sha256(data).hexdigest()
        if expected_digest is not None and digest != expected_digest:
            raise ValueError('accounting metadata digest changed')
        value = json.loads(data, object_pairs_hook=_unique_object)
        if sync:
            os.fsync(fd)
        return value, digest
    finally:
        os.close(fd)


def _dir_identity(info):
    return {'dev': info.st_dev, 'ino': info.st_ino}


def capture_accounting_paths(slot, output_root, gate):
    slot, output_root, gate = map(Path, (slot, output_root, gate))
    if (not slot.is_absolute() or slot.resolve() != slot or output_root.resolve() != output_root
            or output_root not in slot.parents or gate.resolve() != gate):
        raise ValueError('noncanonical accounting paths')
    chain = []
    for path in (slot, *slot.parents):
        info = path.lstat()
        owned = path == output_root or output_root in path.parents
        if not stat.S_ISDIR(info.st_mode) or (owned and info.st_uid != os.getuid()):
            raise ValueError('unsafe accounting directory')
        chain.append({'path': str(path), **_dir_identity(info), 'owned': owned})
    info = gate.lstat()
    if (gate.parent not in (slot, *slot.parents) or not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid() or info.st_nlink != 1
            or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size != 0):
        raise ValueError('unsafe accounting gate')
    return {'directories': chain, 'outputRoot': str(output_root),
            'gate': {'path': str(gate), **_dir_identity(info)}}


def _open_accounting_chain(job):
    accounting = job['accounting']
    slot, root = Path(job['artifactDir']), Path(accounting['outputRoot'])
    expected_paths = [slot, *slot.parents]
    entries = accounting['directories']
    if (not slot.is_absolute() or slot.resolve() != slot or root not in slot.parents
            or len(entries) != len(expected_paths)):
        raise ValueError('invalid accounting ancestry')
    handles = []
    try:
        for path, entry in zip(expected_paths, entries):
            owned = path == root or root in path.parents
            if (set(entry) != {'path', 'dev', 'ino', 'owned'} or entry['path'] != str(path)
                    or entry['owned'] is not owned
                    or type(entry['dev']) is not int or type(entry['ino']) is not int):
                raise ValueError('invalid accounting directory binding')
            fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            handles.append(fd)
        _check_accounting_chain(job, handles)
        return handles
    except BaseException:
        _close_fds(handles)
        raise


def _close_fds(handles):
    error = None
    for fd in reversed(handles):
        try:
            os.close(fd)
        except OSError as caught:
            error = caught
    if error is not None:
        raise error


def _check_accounting_chain(job, handles):
    entries = job['accounting']['directories']
    for index, (entry, fd) in enumerate(zip(entries, handles)):
        info = os.fstat(fd)
        path_info = os.lstat(entry['path'])
        if (not stat.S_ISDIR(info.st_mode) or _dir_identity(info) != {k: entry[k] for k in ('dev', 'ino')}
                or _dir_identity(path_info) != _dir_identity(info)
                or not stat.S_ISDIR(path_info.st_mode)
                or (entry['owned'] and info.st_uid != os.getuid())):
            raise ValueError('accounting directory identity changed')
        if index + 1 < len(handles):
            child = os.stat(Path(entry['path']).name, dir_fd=handles[index + 1], follow_symlinks=False)
            if not stat.S_ISDIR(child.st_mode) or _dir_identity(child) != _dir_identity(info):
                raise ValueError('accounting parent entry changed')


def validate_launch_gate(job, fd):
    expected = job['accounting']['gate']
    info = os.fstat(fd)
    path = Path(job['launchGatePath'])
    entry = path.lstat()
    if (set(expected) != {'path', 'dev', 'ino'} or expected['path'] != str(path)
            or path.resolve() != path or not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_size != 0
            or stat.S_IMODE(info.st_mode) not in (0o600, 0o400)
            or _dir_identity(info) != {k: expected[k] for k in ('dev', 'ino')}
            or not _same_file(info, entry)):
        raise ValueError('launch gate identity changed')


def _task_identity(task):
    value = {key: task[key] for key in ('suite', 'scenario', 'slot')}
    if (not isinstance(value['suite'], str) or not isinstance(value['scenario'], str)
            or type(value['slot']) is not int or value['slot'] <= 0):
        raise ValueError('invalid consumption task')
    return value


def consumption_fact(job, job_path, job_digest, launch, profile_path, record, *, fixture_only,
                     directory_fd=None, sync=False):
    saved_job, exact_digest = read_bound_json('worker-job.json', expected_digest=job_digest,
                                            maximum=JOB_LIMIT, directory_fd=directory_fd, sync=sync)
    if json.dumps(saved_job, sort_keys=True) != json.dumps(job, sort_keys=True):
        raise ValueError('authenticated job object changed')
    if Path(job_path) != Path(job['artifactDir']) / 'worker-job.json':
        raise ValueError('job path is outside its slot')
    task, task_digest = read_bound_json('task.json', directory_fd=directory_fd, sync=sync)
    saved_launch, launch_digest = read_bound_json('launch.json', directory_fd=directory_fd,
                                                 maximum=JOB_LIMIT, sync=sync)
    audit, audit_digest = read_bound_json('launch-audit.json', directory_fd=directory_fd,
                                         maximum=JOB_LIMIT, sync=sync)
    config, config_digest = read_bound_json(job['configFile'], maximum=JOB_LIMIT,
                                          expected_digest=job['pins'][job['configFile']])
    if (task != job['task'] or saved_launch != launch or audit['launch'] != launch
            or audit['stdinSha256'] != job['pins'][launch['stdinPath']]
            or audit['nonForked'] is not True or audit['taskInput'] != 'rendered-prompt-only'
            or audit['configDigest'] != config_digest
            or audit['qualification']['qualificationDigest'] != job['qualificationDigest']
            or audit['qualification']['profile'] != task['profile']
            or audit['pins'] != job['pins'] or audit['operatorSha256'] != job['operatorSha256']
            or audit['driverSha256'] != job['driverDigest']
            or audit['fixtureOnly'] is not fixture_only or audit['qualifiedHost'] is not (not fixture_only)):
        raise ValueError('launch accounting binding changed')
    profile = {'id': record['id'], 'path': str(profile_path), 'root': record['root'],
               'directory': record['directory'], 'childPgid': record['childPgid']}
    if (not isinstance(profile['id'], str) or type(profile['childPgid']) is not int
            or profile['childPgid'] <= 1 or Path(profile['path']).resolve() != Path(profile['path'])
            or any(set(profile[key]) != {'dev', 'ino'}
                   or any(type(profile[key][part]) is not int for part in ('dev', 'ino'))
                   for key in ('root', 'directory'))):
        raise ValueError('invalid accounting runner profile')
    head = config['expectedFrozenHead']
    if not isinstance(head, str) or len(head) != 40 or any(c not in '0123456789abcdef' for c in head):
        raise ValueError('invalid accounting source identity')
    return {'schemaVersion': 1, 'kind': 'effective-flow-host-launch-consumption', 'state': 'reserved',
            'chargedRoots': 1, 'task': _task_identity(task), 'taskSha256': task_digest,
            'jobSha256': exact_digest, 'launchSha256': launch_digest, 'launchAuditSha256': audit_digest,
            'configSha256': config_digest, 'qualificationDigest': job['qualificationDigest'],
            'sourceHead': head, 'runnerProfile': profile, 'fixtureOnly': fixture_only,
            'qualifiedHost': not fixture_only}


def reserve_launch(job, job_path, job_digest, launch, profile_path, record, *, fixture_only):
    handles = _open_accounting_chain(job)
    try:
        fact = consumption_fact(job, job_path, job_digest, launch, profile_path, record,
                                fixture_only=fixture_only, directory_fd=handles[0], sync=True)
        data = (json.dumps(fact, sort_keys=True, separators=(',', ':')) + '\n').encode()
        if len(data) > RECEIPT_LIMIT:
            raise ValueError('oversize launch consumption')
        fd = os.open('launch-consumption.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=handles[0])
        try:
            offset = 0
            while offset < len(data):
                written = os.write(fd, data[offset:])
                if written <= 0:
                    raise OSError('short launch consumption write')
                offset += written
            os.fsync(fd)
            info = _file_info(fd, maximum=RECEIPT_LIMIT)
            entry = os.stat('launch-consumption.json', dir_fd=handles[0], follow_symlinks=False)
            if not _same_file(info, entry) or info.st_size != len(data):
                raise ValueError('launch consumption identity changed')
            _check_accounting_chain(job, handles)
            for directory_fd in handles:
                os.fsync(directory_fd)
            _check_accounting_chain(job, handles)
            observed, digest = read_bound_json('launch-consumption.json', directory_fd=handles[0], expected_mode=0o600)
            if observed != fact:
                raise ValueError('launch consumption changed')
        finally:
            os.close(fd)
        return digest
    finally:
        _close_fds(handles)


def inspect_consumption(job, job_path, job_digest, *, fixture_only, wrapper_attempted=True,
                        wrapper_refused=False):
    """Project immutable charge separately from fallible process observation."""
    directory = Path(job['artifactDir'])
    unknown = {'consumptionState': 'reservation-unknown', 'chargedRoots': 1,
               'actualModelStarted': None}
    receipt_path = directory / 'launch-consumption.json'
    start_path = directory / 'process-start.json'
    try:
        exists = accounting_exists(receipt_path)
        if not exists:
            if accounting_exists(start_path):
                return unknown
            if wrapper_refused or not wrapper_attempted:
                return {'consumptionState': 'not-reserved', 'chargedRoots': 0,
                        'actualModelStarted': False}
            try:
                refusal, _ = read_bound_json(directory / 'launch-refusal.json')
                _, exact = read_bound_json(job_path, expected_digest=job_digest, maximum=JOB_LIMIT)
                task, task_digest = read_bound_json(directory / 'task.json')
                expected = {'kind': 'effective-flow-host-launch-refusal', 'jobSha256': exact,
                            'taskSha256': task_digest, 'task': _task_identity(task),
                            'state': refusal['state']}
                if (task == job['task'] and refusal == expected
                        and refusal['state'] in ('qualification-refused-before-launch',
                                                 'not-launched-after-blocker')):
                    return {'consumptionState': 'not-reserved', 'chargedRoots': 0,
                            'actualModelStarted': False}
            except (OSError, ValueError, KeyError, TypeError):
                pass
            return unknown
        receipt, digest = read_bound_json(receipt_path, expected_mode=0o600)
        profile = receipt['runnerProfile']
        record = registered_profile(profile['path'], job['profilesRoot'])
        launch, _ = read_bound_json(directory / 'launch.json', maximum=JOB_LIMIT)
        handles = _open_accounting_chain(job)
        try:
            expected = consumption_fact(job, job_path, job_digest, launch, profile['path'], record,
                                        fixture_only=fixture_only, directory_fd=handles[0])
        finally:
            _close_fds(handles)
        if json.dumps(receipt, sort_keys=True) != json.dumps(expected, sort_keys=True):
            raise ValueError('invalid consumption receipt')
        # Readable receipt bytes do not prove that fsync/close completed. Only
        # this receipt-bound observation proves the trusted worker advanced beyond
        # that boundary; otherwise retain conservative charge and uncertainty.
        if not accounting_exists(start_path):
            return unknown
        marker, _ = read_bound_json(start_path)
        if (type(marker.get('pid')) is not int or marker['pid'] <= 1
                    or type(marker.get('childPgid')) is not int
                    or marker['childPgid'] != record['childPgid']
                    or marker.get('actualModelStarted') is not True
                    or marker.get('consumptionSha256') != digest
                    or marker.get('fixtureOnly') is not fixture_only
                    or marker.get('qualifiedHost') is not (not fixture_only)):
            raise ValueError('invalid process start observation')
        return {'consumptionState': 'reserved', 'chargedRoots': 1, 'actualModelStarted': True}
    except (OSError, ValueError, KeyError, TypeError):
        return unknown


def accounting_exists(path):
    try:
        os.lstat(path)
        return True
    except FileNotFoundError:
        return False


def recheck_reservation(job, digest):
    handles = _open_accounting_chain(job)
    try:
        read_bound_json('launch-consumption.json', expected_digest=digest, directory_fd=handles[0],
                        expected_mode=0o600)
        _check_accounting_chain(job, handles)
    finally:
        _close_fds(handles)
