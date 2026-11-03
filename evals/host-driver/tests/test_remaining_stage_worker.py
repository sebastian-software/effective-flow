"""Model-free remaining-stage worker regressions using the original bounded fixture helpers."""
from __future__ import annotations

import concurrent.futures
import json
import os
from pathlib import (
    Path,
)
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from unittest import (
    mock,
)
from test_first_stage import (
    OriginalSealFixture,
    TEST_TEMP_ROOT,
    LOCAL_POPEN,
    LOCAL_RUN,
    digest,
    independent_remainder,
)
import unittest

from remaining_stage_support import RemainingStageFixtureMixin
from composed_remaining_support import ComposedRemainingFixture, copy_fixture_executable


class RemainingStageWorkerContracts(RemainingStageFixtureMixin, unittest.TestCase):
    def test_changed_prior_seal_or_future_batch_artifact_stops_next_batch(self):
        first_fixture, first_context = self.f, self.context
        for index, mutation in enumerate(('prior-seal', 'future-evidence')):
            with self.subTest(mutation=mutation):
                self.f = first_fixture if index == 0 else OriginalSealFixture(first_fixture.root / 'future-evidence')
                self.context = first_context if index == 0 else self.f.prerequisites()
                driver = self.start()
                order = independent_remainder([r['task'] for r in self.f.records])
                def fault(task, outcome, result):
                    if task == order[0]:
                        if mutation == 'prior-seal':
                            seal = Path(self.f.selected()[0]['attemptRoot']) / 'seal.json'
                            seal.write_bytes(seal.read_bytes() + b' ')
                        else:
                            future = Path(self.f.remaining_grant['orderedTasks'][6]['artifactDir'])
                            future.mkdir(parents=True)
                    return outcome
                state = self.install_batch_fixture(driver, fault)
                summary = self.f.stage.run_remaining_stage(driver.remaining_stage, driver)
                self.assertEqual((len(state['calls']), len(state['batches'])), (6, 1))
                self.assertTrue(summary['blocked'])
                self.assertFalse(summary['stageCompleted'])
                self.assertEqual(summary['chargedRoots'], 11)
                driver.close()
        self.f, self.context = first_fixture, first_context

    def test_changed_stage_fifo_identity_is_rejected_and_close_preserves_foreign_path(self):
        driver = self.start()
        fifo = self.f.profiles / 'remaining-stage-cancellation.fifo'
        old = fifo.with_name('retained-original.fifo')
        fifo.rename(old)
        os.mkfifo(fifo, 0o600)
        try:
            with self.assertRaises((ValueError, OSError)):
                self.f.stage.remaining_context_data(driver.remaining_stage)
            with self.assertRaises((ValueError, OSError)):
                driver.close()
            self.assertTrue(fifo.exists())
        finally:
            fifo.unlink()
            old.unlink()

    def test_fifo_path_swapped_after_open_is_rejected_before_dispatch_without_foreign_unlink(self):
        admitted = self.f.stage.admit_remaining_stage(self.context)
        fifo = self.f.profiles / 'remaining-stage-cancellation.fifo'
        retained = fifo.with_name('retained-owned-cancellation.fifo')
        opened, drivers = [], []
        def hook(module):
            original_open = module.open_cancellation
            def swap_after_open(job):
                descriptors = original_open(job)
                opened.extend(descriptors)
                fifo.rename(retained)
                os.mkfifo(fifo, 0o600)
                return descriptors
            module.open_cancellation = swap_after_open
        try:
            with self.assertRaises((ValueError, OSError)):
                drivers.append(self.f.coordinator(admitted, module_hook=hook))
            self.assertTrue(fifo.exists(), 'setup failure must preserve the foreign replacement')
            self.assertTrue(Path(admitted['admission']['path']).is_file())
            with self.assertRaises((ValueError, OSError)):
                self.f.stage.admit_remaining_stage(self.context)
        finally:
            # Close only this fixture's captured descriptors; never invoke path-based cleanup on
            # a constructor that incorrectly accepted the foreign replacement.
            for driver in drivers:
                driver.cancellation = None
            for fd in opened:
                try:
                    if retained.exists() and os.fstat(fd).st_ino == retained.stat().st_ino:
                        os.close(fd)
                except OSError:
                    pass
            if retained.exists():
                retained.unlink()

    def test_replaced_fifo_survives_failed_setup_without_refund_or_retry(self):
        admitted = self.f.stage.admit_remaining_stage(self.context)
        fifo = self.f.profiles / 'remaining-stage-cancellation.fifo'
        original_durable = self.f.stage.durable_remaining_record
        def replace_then_fail(path, value):
            if Path(path).name == 'remaining-stage-cancellation.json':
                fifo.unlink()
                fifo.write_text('foreign replacement must survive setup cleanup\n')
                raise OSError('synthetic cancellation-record setup failure')
            return original_durable(path, value)
        with mock.patch.object(self.f.stage, 'durable_remaining_record', replace_then_fail):
            with self.assertRaisesRegex(OSError, 'cancellation-record setup failure'):
                self.f.coordinator(admitted)
        self.assertTrue(fifo.is_file(), 'cleanup must not unlink a replacement it did not create')
        self.assertEqual(fifo.read_text(), 'foreign replacement must survive setup cleanup\n')
        self.assertTrue(Path(admitted['admission']['path']).is_file())
        with self.assertRaises((ValueError, OSError)):
            self.f.stage.admit_remaining_stage(self.context)

    def test_ungranted_or_preexisting_cancellation_and_revoked_gate_are_never_repaired(self):
        fifo = self.f.profiles / 'remaining-stage-cancellation.fifo'
        fifo.write_text('foreign existing file')
        with self.assertRaises((ValueError, OSError)):
            self.f.validate_remaining()
        self.assertEqual(fifo.read_text(), 'foreign existing file')
        fifo.unlink()
        self.f.remaining_grant['cancellation']['path'] = str(self.f.output / 'cohorts/cancellation')
        self.f.publish_remaining()
        with self.assertRaises((ValueError, OSError)):
            self.f.validate_remaining()
        self.f.remaining_grant['cancellation']['path'] = str(fifo)
        self.f.publish_remaining()
        gate = self.f.output / 'cohorts/launch-gate'
        gate.chmod(0o400)
        with self.assertRaises((ValueError, OSError)):
            self.f.validate_remaining()
        self.assertEqual(gate.stat().st_mode & 0o777, 0o400)

    def test_worker_mutations_at_all_three_boundaries_never_reach_model(self):
        for index, boundary in enumerate(('before-qualification', 'during-qualification', 'after-reservation')):
            with self.subTest(boundary=boundary):
                fixture = self.f if index == 0 else OriginalSealFixture(self.f.root / ('worker-' + str(index)))
                context = self.context if index == 0 else fixture.prerequisites()
                admitted = fixture.stage.admit_remaining_stage(context)
                driver = fixture.coordinator(admitted)
                try:
                    task = independent_remainder([r['task'] for r in fixture.records])[0]
                    original = fixture.operator.read_bytes()
                    def mutate(*args):
                        fixture.operator.write_bytes(original + b' changed')
                    def qualify(*args, **kwargs):
                        mutate()
                        return subprocess.CompletedProcess([], 0, json.dumps({
                            'qualificationDigest': fixture.config['qualificationDigest'], 'profile': task['profile'],
                            'expiresAt': '2099-01-01T00:00:00.000Z'}), '')
                    result = fixture.run_worker(task, driver.remaining_stage,
                        prepare_job=mutate if index == 0 else None,
                        qualify=qualify if index == 1 else None,
                        after_reserve=mutate if index == 2 else None)
                    self.assertIsNotNone(result['error'])
                    self.assertEqual(result['modelCalls'], [])
                    self.assertNotIn(b'model\n', result['heartbeats'])
                    consumed = Path(result['job']['artifactDir']) / 'launch-consumption.json'
                    self.assertEqual(consumed.exists(), index == 2)
                    if index == 2:
                        projection = __import__('eval_driver_runtime').inspect_consumption(
                            result['job'], result['jobPath'], digest(result['jobPath']), fixture_only=True)
                        self.assertEqual(projection['chargedRoots'], 1)
                        self.assertEqual(projection['consumptionState'], 'reservation-unknown')
                finally:
                    driver.close()

    def test_worker_rejects_both_null_replayed_or_wrong_stage_bindings(self):
        for job in ({'remainingStage': None}, {'firstStage': None, 'remainingStage': None}):
            with self.assertRaises((ValueError, OSError, KeyError, TypeError)):
                self.f.stage.validate_worker_stage(job)
        driver = self.start()
        task = independent_remainder([r['task'] for r in self.f.records])[0]
        directory = Path(self.f.remaining_grant['orderedTasks'][0]['artifactDir'])
        for candidate, ordinal, batch in ((task, 2, 1), (task, 1, 2), (task, True, 1),
                                         (self.f.selected()[0], 1, 1), ({**task, 'scenario': 'foreign'}, 1, 1)):
            with self.assertRaises((ValueError, OSError)):
                self.f.stage.validate_remaining_task(driver.remaining_stage, candidate, directory, ordinal=ordinal, batch=batch)
        result = self.f.run_worker(task, driver.remaining_stage, prepare_job=lambda job: job.update(firstStage={}))
        self.assertIsNotNone(result['error'])
        self.assertEqual(result['modelCalls'], [])
        self.assertNotIn(b'model\n', result['heartbeats'])

    def test_remaining_original_ttl_crossed_during_reservation_never_launches_or_refunds(self):
        driver = self.start()
        task = independent_remainder([r['task'] for r in self.f.records])[0]
        clock = {'now': '2026-10-31T00:00:00.000Z'}
        def qualify(*args, **kwargs):
            return subprocess.CompletedProcess([], 0, json.dumps({
                'qualificationDigest': self.f.config['qualificationDigest'], 'profile': task['profile'],
                'expiresAt': '2026-10-31T12:00:00.000Z'}), '')
        result = self.f.run_worker(task, driver.remaining_stage, qualify=qualify,
            after_reserve=lambda job: clock.update(now='2026-10-31T12:00:00.000Z'), clock=lambda: clock['now'])
        self.assertIsNotNone(result['error'])
        self.assertIn('expir', str(result['error']))
        self.assertEqual(result['modelCalls'], [])
        self.assertNotIn(b'model\n', result['heartbeats'])
        projection = __import__('eval_driver_runtime').inspect_consumption(
            result['job'], result['jobPath'], digest(result['jobPath']), fixture_only=True)
        self.assertEqual(projection, {'consumptionState': 'reservation-unknown', 'chargedRoots': 1,
                                      'actualModelStarted': None})


class ComposedRemainingStageContracts(unittest.TestCase):
    """Real wrapper recovery and worker admission; six harmless native commands only."""

    def wait_for(self, condition, description):
        deadline = time.monotonic() + 35
        while not condition():
            if time.monotonic() >= deadline:
                self.fail('fixture barrier timed out: ' + description)
            time.sleep(.01)

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
            for executable, source in ((fixture.node, shared_node),
                                       (fixture.python, Path(sys.executable).resolve())):
                self.assertEqual(executable.parent, fixture.root)
                self.assertEqual(executable.stat().st_uid, os.getuid())
                self.assertEqual(executable.stat().st_nlink, 1)
                self.assertEqual(executable.stat().st_mode & 0o777, source.stat().st_mode & 0o777)
                self.assertEqual(fixture.stage.file_digest(executable), digest(source))
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
                "from test_remaining_stage_worker import ComposedRemainingStageContracts\n"
                "case = ComposedRemainingStageContracts()\n"
                "try:\n"
                "    case._run_composed_batch(Path(sys.argv[2]), unknown=sys.argv[3] == '1')\n"
                "finally:\n"
                "    case.doCleanups()\n"
            )
            result = LOCAL_RUN([str(python), '-B', '-c', script, str(Path(__file__).resolve().parent),
                                str(root), str(int(unknown))], capture_output=True, text=True, timeout=120)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def _run_composed_batch(self, root, *, unknown):
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
        if unknown:
            (self.f.controls / 'unknown').touch()
        admitted = self.f.stage.admit_remaining_stage(context)
        admission_path = Path(admitted['admission']['path'])
        admission_bytes = admission_path.read_bytes()
        driver = self.f.real_coordinator(admitted)
        first = [Path(self.f.remaining_grant['orderedTasks'][i]['artifactDir']) for i in range(6)]
        starts, lock = [], threading.Lock()
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
            if (len(command) > 2 and command[1] == str(self.f.driver.parent / 'host-run.mjs')):
                with lock:
                    starts.append(command)
            return LOCAL_POPEN(command, *args, **kwargs)

        with mock.patch.dict(sys.modules, {'eval_first_stage': self.f.stage}), \
             mock.patch.object(subprocess, 'Popen', real_local_popen), \
             concurrent.futures.ThreadPoolExecutor(max_workers=1) as coordinator:
            future = coordinator.submit(self.f.stage.run_remaining_stage, driver.remaining_stage, driver)
            try:
                self.wait_for(lambda: len(starts) == 6 or future.done(), 'six wrapper starts')
                self.assertEqual(len(starts), 6)
                self.wait_for(lambda: sum(len(list(path.parent.glob('host-profile-cleaner-*.json')))
                    for path in cleanup_paths) >= len(claims) + 2 or future.done(),
                    'overlapping real startup recovery claims')
                self.assertFalse(future.done(), 'startup failed before the recovery barrier')
                for claim in claims:
                    claim.unlink()
                self.wait_for(lambda: all((self.f.controls / ('ready-' + str(i))).exists()
                    for i in range(1, 7)) or future.done(), 'six real fixture workers running')
                # This is the receipt regression assertion, also on pre-fix worker refusal.
                self.assert_original_closure(original, first)
                self.assertFalse(future.done(), 'real worker startup refused before native fixtures')
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
                # Hold the unknown job (or the last clean job) until five real seals close.
                held = 1 if unknown else 6
                for ordinal in range(1, 7):
                    if ordinal != held:
                        (self.f.controls / ('release-' + str(ordinal))).touch()
                self.wait_for(lambda: all((root / 'operator-result.json').exists()
                    for ordinal, root in enumerate(first, 1) if ordinal != held), 'five real closures')
                self.assertTrue(all(json.loads((root / 'operator-result.json').read_text())['state'] == 'sealed'
                    for ordinal, root in enumerate(first, 1) if ordinal != held))
                self.assertFalse((self.f.controls / 'batch-two-reached').exists())
                self.assertFalse(any(Path(row['artifactDir']).exists()
                                     for row in self.f.remaining_grant['orderedTasks'][6:]))
                self.assert_original_closure(original, first)
                for path, pin in cleanup_pins.items():
                    self.assertEqual((path.read_bytes(), path.stat().st_mtime_ns), pin)
                (self.f.controls / ('release-' + str(held))).touch()
                summary = future.result(timeout=35)
            finally:
                # Release every owned claim/harmless command even if an assertion failed.
                for claim in claims:
                    claim.unlink(missing_ok=True)
                for ordinal in range(1, 7):
                    (self.f.controls / ('release-' + str(ordinal))).touch()
                if not future.done():
                    driver.block()
                    future.result(timeout=35)
                driver.close()
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
                            if not unknown or ordinal != 1))
        self.assertEqual((self.f.controls / 'batch-two-reached').exists(), not unknown)
        if unknown:
            self.assertEqual(len(starts), 6)
            self.assertEqual(summary['reservationUnknownRoots'], 1)
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
