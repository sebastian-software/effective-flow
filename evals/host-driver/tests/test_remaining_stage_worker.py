"""Model-free remaining-stage worker regressions using the original bounded fixture helpers."""
from __future__ import annotations

import json
import os
from pathlib import (
    Path,
)
import subprocess
from unittest import (
    mock,
)
from test_first_stage import (
    OriginalSealFixture,
    digest,
    independent_remainder,
)
import unittest

from remaining_stage_support import RemainingStageFixtureMixin


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


if __name__ == '__main__':
    unittest.main(verbosity=2)
