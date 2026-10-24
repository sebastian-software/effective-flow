"""Small shared lifecycle primitives for the repository qualified eval driver."""

from __future__ import annotations

import hashlib
import json
import os
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
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                or info.st_nlink != 1 or info.st_size > 16384):
            raise ValueError('unsafe runner metadata')
        with os.fdopen(fd, encoding='utf-8') as stream:
            fd = None
            return json.load(stream)
    finally:
        if fd is not None:
            os.close(fd)


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
    if (record.get('schema') != 1 or record.get('kind') != 'effective-flow-host-profile'
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
