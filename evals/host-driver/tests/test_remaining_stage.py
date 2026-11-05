"""Model-free remaining-stage cohort regressions using the original bounded fixture helpers."""
from __future__ import annotations

import io
import itertools
import json
from pathlib import (
    Path,
)
import signal
from unittest import (
    mock,
)
from test_first_stage import (
    OriginalSealFixture,
    SUITES,
    digest,
    independent_remainder,
)
import unittest

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
        self.assertEqual(len(final_checks), 1)
        self.assertTrue(summary['stageCompleted'], summary)
        self.assertTrue(summary['coverageComplete'])
        self.assertTrue(summary['accountingComplete'])
        self.assertEqual((summary['chargedRoots'], summary['reservedRoots'], summary['started']), (155, 155, 155))
        self.assertEqual(state['maximum'], 6)
        self.assertEqual(len(state['batches']), 25)
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
        self.assertEqual(len(state['calls']), 6)
        self.assertEqual(len(state['batches']), 1)
        self.assertTrue(summary['blocked'])
        self.assertFalse(summary['stageCompleted'])
        self.assertFalse(summary['coverageComplete'])
        self.assertFalse(summary['accountingComplete'])
        self.assertEqual(summary['chargedRoots'], 11)
        self.assertEqual(summary['reservationUnknownRoots'], 1)
        self.assertEqual(sum(row['chargedRoots'] for row in summary['originalResults']), 5)
        self.assertTrue(all(row['chargedRoots'] == 0 and row['state'] == 'not-submitted'
                            for row in summary['results'][6:]))

    def test_findings_native_errors_exceptions_and_interrupts_stop_after_current_batch(self):
        first_fixture, first_context = self.f, self.context
        for index, failure in enumerate(('finding', 'native-error', 'exception', 'interrupt')):
            with self.subTest(failure=failure):
                self.f = first_fixture if index == 0 else OriginalSealFixture(first_fixture.root / ('batch-' + failure))
                self.context = first_context if index == 0 else self.f.prerequisites()
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
                self.assertEqual((len(state['calls']), len(state['batches'])), (6, 1))
                self.assertFalse(summary['stageCompleted'])
                self.assertTrue(summary['blocked'])
                self.assertEqual(summary['chargedRoots'], 11)
                self.assertTrue(all(row['chargedRoots'] == 0 for row in summary['results'][6:]))
                driver.close()
        self.f, self.context = first_fixture, first_context


if __name__ == '__main__':
    unittest.main(verbosity=2)
