#!/usr/bin/env python3
"""Trusted per-slot bridge, executed inside the repository host runner group."""

from __future__ import annotations

import argparse
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import select
import signal
import subprocess
import sys
import time

# CLI execution must leave the source checkout untouched.
sys.dont_write_bytecode = True

from eval_driver_runtime import registered_profile, process_gone, save, sha


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def assert_pins(job):
    expected = job.get('operatorSha256')
    if not isinstance(expected, str) or not re.fullmatch(r'sha256:[0-9a-f]{64}', expected):
        raise ValueError('job requires an explicit trusted operator pin')
    if sha(job['operator']) != expected or job['pins'].get(job['operator']) != expected:
        raise ValueError('qualification operator pin changed')
    for filename, digest in job['pins'].items():
        if sha(filename) != digest:
            raise ValueError('pinned input changed: ' + filename)


def watchdog(profile, root, owner_pid, bridge_pid, timeout, model_timeout, read_fd, directory):
    """Only an actual member may stop its own registered group after owner loss."""
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    deadline = time.monotonic() + timeout
    reason = None
    messages = b''
    while reason is None:
        ready, _, _ = select.select([read_fd], [], [], 0.05)
        if ready:
            message = os.read(read_fd, 64)
            messages += message
            while b'\n' in messages:
                line, messages = messages.split(b'\n', 1)
                if line == b'done':
                    return
                if line == b'model':
                    deadline = time.monotonic() + model_timeout
            if not message:
                reason = 'bridge-disconnected'
        if process_gone(owner_pid):
            reason = 'runner-disconnected'
        if os.getppid() != bridge_pid:
            reason = 'bridge-disconnected'
        if time.monotonic() >= deadline:
            reason = 'timeout'
    # No arbitrary retained receipt authorizes a signal. Re-prove current membership
    # and both owned directory identities immediately before signalling our group.
    record = registered_profile(profile, root, own_group=True)
    save(directory / 'watchdog-stop.json', {'reason': reason, 'at': now(),
                                          'childPgid': record['childPgid']})
    os.killpg(os.getpgrp(), signal.SIGTERM)
    time.sleep(1)
    registered_profile(profile, root, own_group=True)
    os.killpg(os.getpgrp(), signal.SIGKILL)


def launch_record(job, home, codehome):
    task = job['task']
    directory = Path(job['artifactDir'])
    profile = task['profile']
    tmpdir = Path(task['attemptRoot']) / 'tmp'
    cli_tmpdir = Path(task['attemptRoot']).with_name(Path(task['attemptRoot']).name + '-cli-tmp')
    tmpdir.mkdir(mode=0o700, exist_ok=False)
    cli_tmpdir.mkdir(mode=0o700, exist_ok=False)
    cap = 2 if task['suite'] == 'merge-gate' and task['scenario'] == 'nested-spawn-abort-runs-inline' else 100
    argv = [job['binary'], '--strict-config', '-a', 'never', '-s', 'workspace-write',
            '-C', task['projectRoot'], '-c', 'sandbox_workspace_write.network_access=false',
            '-c', 'sandbox_workspace_write.writable_roots=' + json.dumps([task['attemptRoot']]),
            '-c', 'sandbox_workspace_write.exclude_tmpdir_env_var=true',
            '-c', 'sandbox_workspace_write.exclude_slash_tmp=true',
            '-c', 'shell_environment_policy.set.TMPDIR=' + json.dumps(str(tmpdir)),
            '-c', 'shell_environment_policy.set.TMPPREFIX=' + json.dumps(str(tmpdir / 'zsh')),
            '-c', 'model_reasoning_effort=' + json.dumps(profile['reasoningEffort']),
            '-c', f'features.multi_agent_v2.max_concurrent_threads_per_session={cap}',
            'exec', '--ignore-user-config', '--ignore-rules', '--json', '-m', profile['model'],
            '--output-last-message', str(directory / 'last-message.txt')]
    if task['suite'] == 'next-steps':
        argv.append('--ephemeral')
    argv.append('-')
    return {'suite': task['suite'], 'scenario': task['scenario'], 'profile': profile,
            'argv': argv, 'cwd': task['projectRoot'], 'attemptRoot': task['attemptRoot'],
            'home': str(home), 'codexHome': str(codehome),
            'lastMessagePath': str(directory / 'last-message.txt'), 'stdinPath': task['prompt'],
            'tmpdir': str(tmpdir), 'cliTmpdir': str(cli_tmpdir),
            'env': {'HOME': str(home), 'CODEX_HOME': str(codehome),
                    'PWD': task['projectRoot'], 'TMPDIR': str(cli_tmpdir)}}


def block_launches(job):
    with open(job['launchGatePath'], 'rb') as gate:
        fcntl.flock(gate, fcntl.LOCK_EX)
        Path(job['blockerPath']).touch(mode=0o600, exist_ok=True)


def execute_job(job, *, fixture=False):
    try:
        directory, root = Path(job['artifactDir']), Path(job['profilesRoot'])
        home, codehome = Path(os.environ['HOME']), Path(os.environ['CODEX_HOME'])
        profile_path = home.parent
        record = registered_profile(profile_path, root, own_group=True)
        if home != profile_path / 'home' or codehome != profile_path / 'codex-home':
            raise ValueError('runner did not supply its recorded homes')
        save(directory / 'runner-profile.json', {'profilePath': str(profile_path),
             'childPgid': record['childPgid'], 'ownerPid': record['ownerPid'], 'bridgePid': os.getpid()})
        if not fixture:
            assert_pins(job)
        fixture_only = fixture or bool(job.get('fixtureTools'))
        if job.get('authFile'):
            # The strict verifier allows this link only, not HOME/.codex/auth.json.
            (codehome / 'auth.json').symlink_to(job['authFile'])
        read_fd, write_fd = os.pipe()
        watcher = os.fork()
        if watcher == 0:
            os.close(write_fd)
            try:
                watchdog(profile_path, root, record['ownerPid'], os.getppid(),
                         float(job['timeoutSeconds']), float(job.get('modelTimeoutSeconds', job['timeoutSeconds'])),
                         read_fd, directory)
            finally:
                os._exit(0)
        os.close(read_fd)
        started = now()
        begin = time.monotonic()
    except Exception:
        if not fixture:
            block_launches(job)
        raise
    try:
        if fixture:
            launch = {'argv': job['command'], 'cwd': job['cwd'], 'home': str(home),
                      'codexHome': str(codehome), 'stdinPath': job.get('stdinPath'),
                      'env': {'HOME': str(home), 'CODEX_HOME': str(codehome), 'PWD': job['cwd']}}
            save(directory / 'launch.json', launch)
        else:
            launch = launch_record(job, home, codehome)
            save(directory / 'launch.json', launch)
            q = subprocess.run([job['node'], job['operator'], job['configFile'], 'qualify',
                                job['task']['suite'], str(directory / 'launch.json')],
                               cwd=job['source'], capture_output=True, text=True, timeout=120)
            (directory / 'qualification.stdout.json').write_text(q.stdout)
            (directory / 'qualification.stderr.log').write_text(q.stderr)
            if q.returncode:
                block_launches(job)
                save(directory / 'worker-result.json', {'state': 'qualification-refused-before-launch',
                     'actualModelStarted': False, 'qualificationExit': q.returncode,
                     'fixtureOnly': fixture_only, 'qualifiedHost': not fixture_only})
                return q.returncode or 1
            qualification = json.loads(q.stdout)
            if (qualification['qualificationDigest'] != job['qualificationDigest']
                    or qualification['profile'] != job['task']['profile']):
                raise ValueError('qualification does not match pinned task')
            assert_pins(job)
            save(directory / 'launch-audit.json', {'at': started,
                 'configDigest': job['pins'][job['configFile']], 'qualification': qualification,
                 'launch': launch, 'stdinSha256': sha(launch['stdinPath']), 'nonForked': True,
                 'taskInput': 'rendered-prompt-only', 'operatorSha256': job['pins'][job['operator']],
                 'driverSha256': job['driverDigest'], 'pins': job['pins'],
                 'fixtureOnly': fixture_only, 'qualifiedHost': not fixture_only})
        stdin = open(launch['stdinPath'], 'rb') if launch.get('stdinPath') else subprocess.DEVNULL
        try:
            with (directory / 'stdout.jsonl').open('xb') as out, (directory / 'stderr.log').open('xb') as err:
                # No session/group creation: bridge, watchdog and model inherit the
                # supervisor group published by the original runner before launch.
                gate = open(job['launchGatePath'], 'rb') if not fixture else None
                try:
                    if gate:
                        fcntl.flock(gate, fcntl.LOCK_EX)
                        if Path(job['blockerPath']).exists():
                            save(directory / 'worker-result.json', {'state': 'not-launched-after-blocker',
                                 'actualModelStarted': False,
                                 'fixtureOnly': fixture_only, 'qualifiedHost': not fixture_only})
                            return 1
                    os.write(write_fd, b'model\n')
                    process = subprocess.Popen(launch['argv'], stdin=stdin, stdout=out, stderr=err,
                                               cwd=launch['cwd'], env=dict(os.environ, **launch['env']))
                finally:
                    if gate:
                        gate.close()
                save(directory / 'process-start.json', {'pid': process.pid, 'startedAt': started,
                     'actualModelStarted': True, 'childPgid': os.getpgrp(), 'fixtureOnly': fixture_only, 'qualifiedHost': not fixture_only})
                code = process.wait()
        finally:
            if stdin != subprocess.DEVNULL:
                stdin.close()
        save(directory / 'worker-result.json', {'state': 'model-exited', 'exitCode': code,
             'actualModelStarted': True, 'startedAt': started, 'finishedAt': now(),
             'elapsedSeconds': time.monotonic() - begin,
             'fixtureOnly': fixture_only, 'qualifiedHost': not fixture_only})
        return code if code >= 0 else 128 - code
    except Exception:
        # Close the launch gate before watchdog/wrapper cleanup can delay failure.
        if not fixture:
            block_launches(job)
        raise
    finally:
        try:
            os.write(write_fd, b'done\n')
        except BrokenPipeError:
            pass
        os.close(write_fd)
        os.waitpid(watcher, 0)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--job', type=Path, required=True)
    parser.add_argument('--digest', required=True)
    args = parser.parse_args(argv)
    if sha(args.job) != args.digest:
        parser.error('production job requires its exact --digest')
    return execute_job(json.loads(args.job.read_text()))


if __name__ == '__main__':
    raise SystemExit(main())
