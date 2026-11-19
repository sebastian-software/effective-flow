"""Model-free composed remaining-stage regressions using real bounded worker wrappers."""
from __future__ import annotations

import concurrent.futures
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import unittest
from unittest import mock

from test_first_stage import TEST_TEMP_ROOT, LOCAL_POPEN, LOCAL_RUN, digest
from remaining_stage_support import RemainingStageFixtureMixin
from composed_remaining_support import (
    COMPOSED_WAIT_BACKSTOP_SECONDS, ComposedRemainingFixture, WrapperProcesses, batch_two_gone,
    closures_gone, complete_ready_batch, copy_fixture_executable, describe_exits, describe_wrappers,
    log_tail, ready_batch_gone, recovery_claims_gone, wait_for_ready_batch, wrapper_ordinal,
)
from liveness_wait import TEARDOWN_MARGIN_SECONDS, report_failure, wait_until


# Child stderr lines with this prefix carry per-phase elapsed times and the remaining headroom.
PHASE_TIMING_PREFIX = 'composed-phase-timing: '


def coordinator_outcome(future):
    """Describe the coordinator future without blocking on a pending one."""
    if not future.done():
        return 'coordinator pending'
    return 'coordinator done, exception ' + repr(future.exception(timeout=0))


class ComposedRemainingStageContracts(unittest.TestCase):
    """Real wrapper recovery and worker admission; six harmless native commands only."""

    def assert_original_closure(self, original, artifacts):
        changed = [path for path in original if digest(path) != original[path]]
        if changed:
            errors = '\n'.join((root / 'runner.stderr.log').read_text()
                for root in artifacts if (root / 'runner.stderr.log').exists())
            self.fail('retained closure changed: ' + repr(changed) + '\n' + errors)

    def test_composed_runtime_pins_copy_shared_executable_inputs(self):
        old_path = list(sys.path)
        self.addCleanup(lambda: sys.path.__setitem__(slice(None), old_path))
        with tempfile.TemporaryDirectory(prefix='remaining-runtime-inputs-', dir=str(TEST_TEMP_ROOT)) as name:
            root = Path(name)
            shared_node = root / 'shared-node'
            shutil.copyfile(shutil.which('node'), shared_node)
            shutil.copymode(shutil.which('node'), shared_node)
            os.link(shared_node, root / 'shared-node-alias')
            with mock.patch.object(shutil, 'which', return_value=str(shared_node)):
                fixture = ComposedRemainingFixture(root / 'fixture')
            with self.assertRaisesRegex(ValueError, 'owned single-link regular file'):
                fixture.stage.file_digest(shared_node)
            # Validation must accept the fixture's own runtime copies without relaxing
            # the very same reader that rejects the shared source above.
            fixture.validate()
            for executable in (fixture.node, fixture.python):
                self.assertEqual(executable.parent, fixture.root)
                self.assertEqual(executable.stat().st_uid, os.getuid())
                self.assertEqual(executable.stat().st_nlink, 1)
            # The node runtime is a tiny owned wrapper, so its pin never reads node's bytes.
            self.assertEqual(fixture.node.stat().st_mode & 0o777, 0o700)
            self.assertEqual(fixture.stage.file_digest(fixture.node),
                             fixture.corpus['toolchain']['node']['sha256'])
            self.assertLess(fixture.node.stat().st_size, 4096)
            source = Path(sys.executable).resolve()
            self.assertEqual(fixture.python.stat().st_mode & 0o777, source.stat().st_mode & 0o777)
            self.assertEqual(fixture.stage.file_digest(fixture.python), digest(source))
            # The pinned wrapper must execute the very node bytes the former copy carried.
            target = LOCAL_RUN([str(fixture.node), '-p', 'process.execPath'],
                               capture_output=True, text=True, timeout=10)
            self.assertEqual(target.returncode, 0, target.stderr)
            self.assertEqual(target.stdout.strip(), str(shared_node.resolve()))
            node = LOCAL_RUN([str(fixture.node), '--version'], capture_output=True, text=True, timeout=10)
            python = LOCAL_RUN([str(fixture.python), '-B', '-c', 'import sys; print(sys.executable)'],
                               capture_output=True, text=True, timeout=10)
            self.assertEqual(node.returncode, 0, node.stderr)
            self.assertEqual(python.returncode, 0, python.stderr)
            self.assertEqual(python.stdout.strip(), str(fixture.python))

    def test_real_six_worker_recovery_preserves_original_closures_and_next_batch_gate(self):
        self.run_composed_batch(unknown=False)

    def test_real_unknown_start_blocks_next_batch_without_refunding_admission(self):
        self.run_composed_batch(unknown=True)

    def run_composed_batch(self, *, unknown):
        with tempfile.TemporaryDirectory(prefix='remaining-composed-', dir=str(TEST_TEMP_ROOT)) as name:
            root = Path(name)
            python = copy_fixture_executable(sys.executable, root / 'python-runtime')
            # Run the actual coordinator in the pinned interpreter, so its unchanged
            # sys.executable launch check describes the real process and child command.
            script = (
                "from pathlib import Path\nimport sys\n"
                "sys.path.insert(0, sys.argv[1])\n"
                "from test_remaining_stage_composed import ComposedRemainingStageContracts\n"
                "case = ComposedRemainingStageContracts()\n"
                "try:\n"
                "    case._run_composed_batch(Path(sys.argv[2]), unknown=sys.argv[3] == '1',\n"
                "                             deadline=float(sys.argv[4]))\n"
                "finally:\n"
                "    case.doCleanups()\n"
            )
            # The child receives the absolute deadline of the very inner timeout passed below;
            # time.monotonic() is system-wide on Linux, so the child can use it as given.
            deadline = time.monotonic() + (120 if unknown else 180)
            try:
                result = LOCAL_RUN([str(python), '-B', '-c', script, str(Path(__file__).resolve().parent),
                                    str(root), str(int(unknown)), repr(deadline)], capture_output=True,
                                   text=True, timeout=120 if unknown else 180)
            except subprocess.TimeoutExpired as error:
                for output, stream in ((error.stdout, sys.stdout), (error.stderr, sys.stderr)):
                    if isinstance(output, bytes):
                        stream.buffer.write(output)
                        stream.buffer.flush()
                    elif output:
                        stream.write(output)
                        stream.flush()
                raise
            for line in result.stderr.splitlines():
                if line.startswith(PHASE_TIMING_PREFIX):
                    sys.stderr.write(line + '\n')
                    sys.stderr.flush()
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def _run_composed_batch(self, root, *, unknown, deadline):
        started = time.monotonic()
        phases = {}

        def phase(name):
            phases[name] = round(time.monotonic() - started, 3)

        # Every parent-side wait leaves the teardown margin before the inner subprocess timeout.
        wait_limit = deadline - TEARDOWN_MARGIN_SECONDS
        old_path = list(sys.path)
        self.addCleanup(lambda: sys.path.__setitem__(slice(None), old_path))
        self.f = ComposedRemainingFixture(root)
        context = self.f.prerequisites()
        original = RemainingStageFixtureMixin.original_digests(self)
        inventory_bytes = self.f.closures_path.read_bytes()
        cleanup_paths = [Path(item['path']) for row in json.loads(inventory_bytes)['closures']
                         for item in row['files'] if item['path'].endswith('/host-profile-cleanup.json')]
        cleanup_pins = {path: (path.read_bytes(), path.stat().st_mtime_ns) for path in cleanup_paths}
        self.assertEqual(len(cleanup_pins), 5)
        admitted = self.f.stage.admit_remaining_stage(context)
        admission_path = Path(admitted['admission']['path'])
        admission_bytes = admission_path.read_bytes()
        driver = self.f.real_coordinator(admitted)
        ordered = self.f.remaining_grant['orderedTasks']
        first = [Path(ordered[i]['artifactDir']) for i in range(6)]
        starts, lock = [], threading.Lock()
        wrappers = WrapperProcesses()
        # Hold real startup recovery at its existing bakery claims. Claims are
        # test-owned and never part of any receipt or stored closure inventory.
        claims = []
        for receipt in cleanup_paths:
            claim = receipt.parent / ('host-profile-cleaner-' + str(os.getpid()) + '-' + str(uuid.uuid4()) + '.json')
            claim.write_text(json.dumps({'pid': os.getpid(), 'ticket': None}) + '\n')
            claims.append(claim)

        def real_local_popen(command, *args, **kwargs):
            # Observe actual wrapper launches without replacing
            # run_slot, execute_wrapper, the worker, recovery or context authentication.
            wrapper = len(command) > 2 and command[1] == str(self.f.driver.parent / 'host-run.mjs')
            if wrapper:
                # The job file is written before launch, so its ordinal is known here.
                ordinal = wrapper_ordinal(command)
                with lock:
                    starts.append(command)
            process = LOCAL_POPEN(command, *args, **kwargs)
            if wrapper:
                wrappers.record(ordinal, process)
            return process

        def artifact_dir(ordinal):
            return Path(ordered[ordinal - 1]['artifactDir'])

        def liveness():
            return describe_wrappers(wrappers.snapshot()) + '; ' + coordinator_outcome(future)

        def wait_for(condition, description, gone, logs=('runner.stderr.log',)):
            # The coordinator future is the stop callback; only a gone wrapper makes this raise.
            wait_until(condition, description, stopped=future.done,
                       gone=lambda: describe_exits(gone(wrappers.snapshot()), artifact_dir, logs),
                       liveness=liveness, backstop=COMPOSED_WAIT_BACKSTOP_SECONDS, deadline=wait_limit)

        phase('setup')
        with mock.patch.dict(sys.modules, {'eval_first_stage': self.f.stage}), \
             mock.patch.object(subprocess, 'Popen', real_local_popen), \
             concurrent.futures.ThreadPoolExecutor(max_workers=1) as coordinator:
            future = coordinator.submit(self.f.stage.run_remaining_stage, driver.remaining_stage, driver)
            try:
                wait_for(lambda: len(starts) == 6, 'six wrapper starts', recovery_claims_gone)
                self.assertEqual(len(starts), 6, coordinator_outcome(future))
                phase('starts')
                wait_for(lambda: sum(len(list(path.parent.glob('host-profile-cleaner-*.json')))
                    for path in cleanup_paths) >= len(claims) + 2,
                    'overlapping real startup recovery claims', recovery_claims_gone)
                self.assertFalse(future.done(), 'startup failed before the recovery barrier: '
                                 + coordinator_outcome(future))
                phase('recovery')
                for claim in claims:
                    claim.unlink()
                try:
                    ready = wait_for_ready_batch(self.f.controls, future.done,
                        gone=lambda: describe_exits(ready_batch_gone(wrappers.snapshot(), self.f.controls),
                                                    artifact_dir),
                        liveness=liveness, deadline=wait_limit)
                except AssertionError:
                    # A refused worker exits early; keep the receipt regression assertion first.
                    self.assert_original_closure(original, first)
                    raise
                if future.done():
                    self.assert_original_closure(original, first)
                self.assertFalse(future.done(), 'real worker startup refused before native fixtures: '
                                 + coordinator_outcome(future))
                self.assertEqual([ready[i]['ordinal'] for i in ready], list(range(1, 7)))
                phase('ready')

                def check_context():
                    # This is the receipt regression assertion, also on pre-fix worker refusal.
                    self.assert_original_closure(original, first)
                    self.assertFalse(any(Path(row['artifactDir']).exists()
                                         for row in self.f.remaining_grant['orderedTasks'][6:]))
                    self.f.stage.remaining_context_data(driver.remaining_stage, batch=1)
                    # Reject actual foreign/future children while accepting every current
                    # suite/scenario/slot/job/runner and cancellation path created above.
                    foreign = driver.outroot / 'foreign-child'
                    foreign.write_text('not granted\n')
                    with self.assertRaisesRegex(ValueError, 'unexplained cohort child'):
                        self.f.stage.remaining_context_data(driver.remaining_stage, batch=1)
                    foreign.unlink()
                    future_root = Path(self.f.remaining_grant['orderedTasks'][6]['artifactDir'])
                    future_root.mkdir(parents=True)
                    with self.assertRaisesRegex(ValueError, 'future remainder artifact exists'):
                        self.f.stage.remaining_context_data(driver.remaining_stage, batch=1)
                    future_root.rmdir()
                    phase('context')

                # Hold the unknown job (or the last clean job) until five real seals close.
                def check_closures(held):
                    wait_for(lambda: all((root / 'operator-result.json').exists()
                        for ordinal, root in enumerate(first, 1) if ordinal != held), 'five real closures',
                        lambda processes: closures_gone(processes, first, held))
                    # A slot that raised writes no operator-result.json: assert the retained
                    # closure and the coordinator state before reading any result.
                    self.assert_original_closure(original, first)
                    self.assertFalse(future.done(), 'coordinator finished before five real closures: '
                                     + coordinator_outcome(future))
                    self.assertTrue(all(json.loads((root / 'operator-result.json').read_text())['state'] == 'sealed'
                        for ordinal, root in enumerate(first, 1) if ordinal != held))
                    self.assertFalse((self.f.controls / 'batch-two-reached').exists())
                    self.assertFalse(any(Path(row['artifactDir']).exists()
                                         for row in self.f.remaining_grant['orderedTasks'][6:]))
                    for path, pin in cleanup_pins.items():
                        self.assertEqual((path.read_bytes(), path.stat().st_mtime_ns), pin)
                    phase('closures')

                held = complete_ready_batch(ready, unknown=unknown,
                    set_unknown=lambda ordinal: (self.f.controls / 'unknown').write_text(str(ordinal) + '\n'),
                    release=lambda ordinal: (self.f.controls / ('release-' + str(ordinal))).touch(),
                    check_context=check_context, check_closures=check_closures)
                if not unknown:
                    # Hold the last refusal writer until five refusals are durably persisted, so
                    # block() after the first refusal cannot turn an in-flight refusal into
                    # reservation-unknown accounting.
                    wait_for(lambda: (self.f.controls / 'refusal-writer-held').exists()
                        and all((self.f.controls / ('refusal-persisted-' + str(i))).exists()
                            for i in range(7, 12)), 'five authenticated original refusals',
                        lambda processes: batch_two_gone(processes, self.f.controls),
                        ('runner.stderr.log', 'qualification.stderr.log'))
                    self.assertFalse(future.done(), 'coordinator finished before five original refusals: '
                                     + coordinator_outcome(future))
                    # An expired OPERATOR backstop is an ordinary qualification refusal, visible
                    # only in the batch-two qualification logs.
                    self.assertTrue((self.f.controls / 'batch-two-reached').exists(),
                        'batch two never reached the qualifier barrier:\n' + '\n'.join(
                            '--- qualification.stderr.log tail of ordinal ' + str(ordinal) + ':\n'
                            + log_tail(artifact_dir(ordinal) / 'qualification.stderr.log')
                            for ordinal in range(7, 13)))
                    remaining = self.f.remaining_grant['orderedTasks'][6:12]
                    self.assertFalse((Path(remaining[-1]['artifactDir']) / 'launch-refusal.json').exists())
                    for ordinal, task in enumerate(remaining[:5], 7):
                        artifact = Path(task['artifactDir'])
                        self.assertEqual((self.f.controls / ('refusal-persisted-' + str(ordinal))).read_text(),
                                         digest(artifact / 'launch-refusal.json'))
                        self.assertFalse((artifact / 'worker-result.json').exists())
                        self.assertEqual(driver.accounting_projection(task, artifact), {'consumptionState': 'not-reserved',
                            'chargedRoots': 0, 'actualModelStarted': False})
                    (self.f.controls / 'release-refusal-writer').touch()
                    phase('batchTwo')
                pending = ('final batch-two refusal and stage summary' if not unknown
                           else 'held unknown job close and stage summary')
                try:
                    summary = future.result(timeout=max(0, min(COMPOSED_WAIT_BACKSTOP_SECONDS,
                                                               wait_limit - time.monotonic())))
                except concurrent.futures.TimeoutError:
                    raise report_failure('coordinator did not finish: pending phase ' + pending
                                         + '; ' + liveness()) from None
                phase('summary')
            finally:
                # Release every owned claim/harmless command even if an assertion failed.
                for claim in claims:
                    claim.unlink(missing_ok=True)
                for ordinal in range(1, 7):
                    (self.f.controls / ('release-' + str(ordinal))).touch()
                (self.f.controls / 'release-refusal-writer').touch()
                try:
                    if not future.done():
                        driver.block()
                        future.result(timeout=TEARDOWN_MARGIN_SECONDS)
                    driver.close()
                finally:
                    phase('teardown')
                    sys.stderr.write(PHASE_TIMING_PREFIX + json.dumps({
                        'unknown': unknown, 'elapsedSeconds': phases,
                        'headroomSeconds': round(deadline - time.monotonic(), 3)}) + '\n')
                    sys.stderr.flush()
        self.assertEqual(self.f.closures_path.read_bytes(), inventory_bytes)
        self.assert_original_closure(original, first)
        for path, pin in cleanup_pins.items():
            self.assertEqual((path.read_bytes(), path.stat().st_mtime_ns), pin)
        self.assertTrue(all(not os.path.lexists(path.parent / cache)
            for path in cleanup_paths for cache in __import__('eval_driver_runtime').CACHE_PATHS))
        self.assertEqual(admission_path.read_bytes(), admission_bytes)
        self.assertEqual({path.name for path in self.f.controls.glob('ready-*')},
                         {'ready-' + str(i) for i in range(1, 7)})
        self.assertEqual(summary['chargedRoots'], 11)
        self.assertTrue(summary['blocked'])
        self.assertFalse(summary['stageCompleted'])
        self.assertFalse(summary['fullCorpusAccepted'])
        self.assertTrue(summary['fixtureOnly'])
        self.assertTrue(all(row['chargedRoots'] == 1 for row in summary['originalResults']))
        self.assertTrue(all(row['state'] == 'sealed' for ordinal, row in enumerate(summary['results'][:6], 1)
                            if not unknown or ordinal != held))
        self.assertEqual((self.f.controls / 'batch-two-reached').exists(), not unknown)
        if unknown:
            self.assertEqual(len(starts), 6)
            self.assertEqual(summary['reservationUnknownRoots'], 1)
            self.assertEqual(summary['results'][held - 1]['consumptionState'], 'reservation-unknown')
            self.assertEqual(summary['results'][held - 1]['chargedRoots'], 1)
            self.assertFalse(summary['accountingComplete'])
            self.assertTrue(all(row['state'] == 'not-submitted' for row in summary['results'][6:]))
        else:
            self.assertEqual(len(starts), 12)
            self.assertEqual(summary['reservationUnknownRoots'], 0)
            self.assertTrue(summary['accountingComplete'])
            self.assertTrue(all(row['state'] == 'not-submitted' for row in summary['results'][12:]))
        with self.assertRaises((ValueError, OSError)):
            self.f.stage.admit_remaining_stage(context)


if __name__ == '__main__':
    unittest.main(verbosity=2)
