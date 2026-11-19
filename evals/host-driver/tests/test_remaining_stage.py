"""Model-free remaining-stage cohort regressions using the original bounded fixture helpers."""
from __future__ import annotations

import io
import itertools
import json
from pathlib import (
    Path,
)
import signal
import threading
import time
from unittest import (
    mock,
)
from test_first_stage import (
    SUITES,
    digest,
    independent_remainder,
)
import unittest

from liveness_wait import (
    POLL_SECONDS,
    remaining_seconds,
    report_failure,
)
from remaining_stage_support import RemainingStageFixtureMixin


class RemainingStageCohortContracts(RemainingStageFixtureMixin, unittest.TestCase):
    def test_genuine_original_five_bind_remainder_order_and_static_cli_without_effects(self):
        self.assertEqual(len(self.f.computations), 5)
        self.assertTrue(all(not row['validityProblems'] and not row['findings'] for row in self.f.computations))
        tasks = [r['task'] for r in self.f.records]
        expected = independent_remainder(tasks)
        actual = self.f.stage.remainder_tasks(tasks)
        self.assertEqual(actual, expected)
        self.assertEqual([len([t for t in actual if t['suite'] == suite]) for suite in SUITES], [45, 30, 75])
        arrays = [[t for t in tasks if t['suite'] == suite and t not in self.f.selected()] for suite in SUITES]
        wrong = [t for row in itertools.zip_longest(*arrays) for t in row if t]
        self.assertNotEqual(actual, wrong, 'filtering before interleaving changes the fixed batch order')
        self.assertEqual(self.f.stage.remaining_batches(tasks), [expected[i:i + 6] for i in range(0, 150, 6)])
        before = self.original_digests()
        output = io.StringIO()
        with mock.patch('sys.stdout', output):
            code = self.f.stage.main(['--remaining-150', '--corpus', str(self.f.corpus_path),
                '--corpus-sha256', digest(self.f.corpus_path), '--grant', str(self.f.remaining_grant_path),
                '--grant-sha256', digest(self.f.remaining_grant_path)])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(output.getvalue())['selected'], self.f.remaining_grant['orderedTasks'])
        self.assertEqual(before, self.original_digests())
        self.assertFalse((self.f.output / 'cohorts/cancellation').exists())
        self.assertFalse((self.f.profiles / 'remaining-stage-cancellation.fifo').exists())
        self.assertFalse((self.f.output / 'cohorts/remaining-stage-admission.json').exists())
        self.assertGreater(self.f.remaining_grant_path.stat().st_size, self.f.stage.GRANT_LIMIT)
        self.assertLess(self.f.remaining_grant_path.stat().st_size, self.f.stage.REMAINING_GRANT_LIMIT)
        self.assertLess(self.f.closures_path.stat().st_size, self.f.stage.CLOSURE_INVENTORY_LIMIT)

    def test_scheduler_batches_and_genuine_155_seals_have_real_final_reconciliation(self):
        before = self.original_digests()
        driver = self.start()
        self.assertEqual(driver.admissions, {})
        data = self.f.stage.remaining_context_data(driver.remaining_stage)
        self.assertEqual(sum(row['chargedRoots'] for row in data['originalProjections']), 5)
        state = self.install_batch_fixture(driver)
        real_context_data = self.f.stage.remaining_context_data
        final_checks = []
        def scheduler_snapshot(context, *, initial=False, batch=0, active=True):
            self.assertEqual(context, driver.remaining_stage)
            self.assertFalse(initial)
            # Only the positive scheduler observation uses snapshots. Every negative test keeps
            # real fresh validation. All155 original seals/evaluators and D2 receipts stay real;
            # the final full155 reconciliation executes the original verifier once.
            if batch == 26:
                if not final_checks:
                    final_checks.append(real_context_data(context, batch=26, active=active))
                return final_checks[0]
            return data
        with mock.patch.object(self.f.stage, 'remaining_context_data', scheduler_snapshot):
            summary = self.f.stage.run_remaining_stage(driver.remaining_stage, driver)
        self.assert_sealed_batches(state, 25)
        self.assertEqual(len(final_checks), 1)
        self.assertTrue(summary['stageCompleted'], summary)
        self.assertTrue(summary['coverageComplete'])
        self.assertTrue(summary['accountingComplete'])
        self.assertEqual((summary['chargedRoots'], summary['reservedRoots'], summary['started']), (155, 155, 155))
        self.assertEqual(state['maximum'], 6)
        self.assertTrue(all(len(batch) == 6 for batch in state['batches']))
        expected = independent_remainder([r['task'] for r in self.f.records])
        self.assertEqual([t for batch in state['batches'] for t in batch],
                         [tuple(t[k] for k in ('suite', 'scenario', 'slot')) for t in expected])
        union = [*summary['originalResults'], *summary['results']]
        self.assertEqual(len({tuple(t[k] for k in ('suite', 'scenario', 'slot')) for t in union}), 155)
        self.assertEqual(len(self.f.computations), 155)
        self.assertTrue(all(not row['validityProblems'] and not row['findings'] for row in self.f.computations))
        for key in ('fullCorpusAccepted', 'publicationAuthorized', 'continuationAuthorized', 'qualifiedHost'):
            self.assertFalse(summary[key])
        self.assertTrue(summary['fixtureOnly'])
        self.assertEqual(before, self.original_digests())
        driver.close()
        self.assertFalse((self.f.profiles / 'remaining-stage-cancellation.fifo').exists())
        self.assertFalse((self.f.output / 'cohorts/cancellation').exists())
        with self.assertRaises((ValueError, OSError)):
            self.f.validate_remaining()

    def test_current_batch_failure_blocks_every_future_batch_and_preserves_original_charges(self):
        driver = self.start()
        def fault(task, outcome, result):
            if task == independent_remainder([r['task'] for r in self.f.records])[0]:
                (Path(result['job']['artifactDir']) / 'process-start.json').unlink()
                outcome['cleanupComplete'] = False
            return outcome
        state = self.install_batch_fixture(driver, fault)
        summary = self.f.stage.run_remaining_stage(driver.remaining_stage, driver)
        self.assert_sealed_batches(state, 1)
        self.assertEqual(len(state['calls']), 6)
        self.assertTrue(summary['blocked'])
        self.assertFalse(summary['stageCompleted'])
        self.assertFalse(summary['coverageComplete'])
        self.assertFalse(summary['accountingComplete'])
        self.assertEqual(summary['chargedRoots'], 11)
        self.assertEqual(summary['reservationUnknownRoots'], 1)
        self.assertEqual(sum(row['chargedRoots'] for row in summary['originalResults']), 5)
        self.assertTrue(all(row['chargedRoots'] == 0 and row['state'] == 'not-submitted'
                            for row in summary['results'][6:]))

    def test_findings_stop_after_current_batch(self):
        self.assert_failure_stops_after_current_batch('finding')

    def test_native_errors_stop_after_current_batch(self):
        self.assert_failure_stops_after_current_batch('native-error')

    def test_exceptions_stop_after_current_batch(self):
        self.assert_failure_stops_after_current_batch('exception')

    def test_interrupts_stop_after_current_batch(self):
        self.assert_failure_stops_after_current_batch('interrupt')

    def assert_failure_stops_after_current_batch(self, failure):
        driver = self.start()
        first = independent_remainder([r['task'] for r in self.f.records])[0]
        def fault(task, outcome, result):
            if task != first:
                return outcome
            if failure == 'finding':
                outcome['findings'] = ['synthetic behavioural finding']
            elif failure == 'native-error':
                outcome['nativeErrors'] = [{'type': 'error', 'message': 'synthetic native error'}]
            elif failure == 'exception':
                raise RuntimeError('synthetic current-batch future exception')
            else:
                driver.interrupted_signal = signal.SIGINT
            return outcome
        state = self.install_batch_fixture(driver, fault)
        summary = self.f.stage.run_remaining_stage(driver.remaining_stage, driver)
        self.assert_sealed_batches(state, 1)
        self.assertEqual(len(state['calls']), 6)
        self.assertFalse(summary['stageCompleted'])
        self.assertTrue(summary['blocked'])
        self.assertEqual(summary['chargedRoots'], 11)
        self.assertTrue(all(row['chargedRoots'] == 0 for row in summary['results'][6:]))
        driver.close()


class BatchFixtureFailFastContracts(RemainingStageFixtureMixin, unittest.TestCase):
    """The batch fixture must fail fast and name the first error instead of reporting `0 != 1`."""
    BUDGET_SECONDS = 5.0
    # Lets a fixture-side failure that also hits the case deadline report itself first.
    FAULT_WAIT_GRACE_SECONDS = 1.0

    def first_batch_slots(self, driver):
        tasks = independent_remainder([r['task'] for r in self.f.records])[:6]
        self.assertEqual(len(tasks), 6)
        for task in tasks:
            driver.admissions.setdefault(tuple(task[key] for key in ('suite', 'scenario', 'slot')), {})
        return tasks

    def fault_record(self):
        """Shared record of the injected fault; the fail-fast budget runs from its `at` time."""
        return {'recorded': threading.Event(), 'at': None, 'failure': None}

    def record_fault(self, fault, failure=None):
        """Stamp the fault time (or a fixture failure message) and release `run_first_batch`."""
        fault['failure'] = failure
        fault['at'] = time.monotonic()
        fault['recorded'].set()

    def run_first_batch(self, driver, tasks, fault, state):
        """Run one batch on six daemon threads; return the threads still alive BUDGET_SECONDS after the fault.

        The budget runs from the recorded fault, not from thread start, so the real reservation work
        before the fault, which six threads share on a loaded host, is not charged against it.
        """
        errors = []
        def target(task):
            try:
                driver.run_slot(task)
            except BaseException as error:  # the barrier failure each thread may see is not under test
                errors.append(error)
        threads = [threading.Thread(target=target, args=(task,), daemon=True) for task in tasks]
        for thread in threads:
            thread.start()
        # Reaching the fault is bounded by the case deadline only; stop early if every thread ended.
        wait_deadline = time.monotonic() + remaining_seconds(self.case_deadline) + self.FAULT_WAIT_GRACE_SECONDS
        while not fault['recorded'].wait(POLL_SECONDS):
            if time.monotonic() >= wait_deadline or not any(thread.is_alive() for thread in threads):
                break
        if fault['failure'] is not None:
            raise report_failure(fault['failure'])
        if not fault['recorded'].is_set():
            raise report_failure('batch fixture never reached the injected fault; first batch fixture error: '
                                 + repr(state['sealError']))
        deadline = fault['at'] + self.BUDGET_SECONDS
        for thread in threads:
            thread.join(max(0.0, deadline - time.monotonic()))
        return [thread for thread in threads if thread.is_alive()]

    def assert_failure_names(self, state, *fragments):
        with self.assertRaises(AssertionError) as caught:
            self.assert_sealed_batches(state, 1)
        for fragment in fragments:
            self.assertIn(fragment, str(caught.exception))

    def test_reservation_error_aborts_barrier_and_is_recorded_once(self):
        driver = self.start()
        tasks = self.first_batch_slots(driver)
        state = self.install_batch_fixture(driver)
        raised = RuntimeError('reservation fixture fault')
        fault = self.fault_record()
        reserve = self.reserve_fixture_task
        lock = threading.Lock()
        peers = {'expected': len(tasks) - 1, 'completed': 0, 'done': threading.Event()}
        def faulty_reserve(target_driver, task):
            if task is tasks[2]:
                # Fault only after the real peer reservations, so the budget measures the abort.
                if not peers['done'].wait(remaining_seconds(self.case_deadline)):
                    message = ('reservation fault waited past the case deadline for the peer reservations: '
                               f"{peers['completed']} of {peers['expected']} completed")
                    self.record_fault(fault, message)
                    raise AssertionError(message)
                self.record_fault(fault)
                raise raised
            try:
                return reserve(target_driver, task)
            finally:
                # Count a peer that raised too; its own error then fails the sealError assertion.
                with lock:
                    peers['completed'] += 1
                    if peers['completed'] == peers['expected']:
                        peers['done'].set()
        patch = mock.patch.object(self, 'reserve_fixture_task', faulty_reserve)
        patch.start()
        self.addCleanup(patch.stop)
        alive = self.run_first_batch(driver, tasks, fault, state)
        self.assertEqual(alive, [], 'every run thread returns within the budget from the reservation fault '
                                    'once the barrier is aborted')
        self.assertIs(state['sealError'], raised)
        self.assert_failure_names(state, 'RuntimeError', 'reservation fixture fault')

    def test_seal_error_is_recorded_first_and_not_replaced_by_broken_barrier(self):
        driver = self.start()
        tasks = self.first_batch_slots(driver)
        state = self.install_batch_fixture(driver)
        raised = AssertionError('original seal fixture failed: injected')
        fault = self.fault_record()
        compute = self.f.compute
        def faulty_compute(operation, batch, **options):
            if operation == 'seal':
                # All six reservations are done once the barrier action runs.
                self.record_fault(fault)
                raise raised
            return compute(operation, batch, **options)
        patch = mock.patch.object(self.f, 'compute', faulty_compute)
        patch.start()
        self.addCleanup(patch.stop)
        alive = self.run_first_batch(driver, tasks, fault, state)
        self.assertEqual(alive, [], 'every run thread returns within the budget from the seal fault '
                                    'once the seal action failed')
        self.assertIs(state['sealError'], raised)
        self.assertNotIsInstance(state['sealError'], threading.BrokenBarrierError)
        self.assert_failure_names(state, 'AssertionError', 'original seal fixture failed: injected')


if __name__ == '__main__':
    unittest.main(verbosity=2)
