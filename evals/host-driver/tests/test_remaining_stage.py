"""Model-free remaining-stage regressions using the original bounded fixture helpers."""
from __future__ import annotations

from contextlib import ExitStack
import concurrent.futures
import copy
import io
import itertools
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest import mock

from test_first_stage import (
    OriginalSealFixture,
    REMAINING_STAGE_ID,
    SUITES,
    TEST_TEMP_ROOT,
    digest,
    independent_remainder,
    inert_boundaries,
    ref,
    write_json,
)


class RemainingStageContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.guards = ExitStack()
        inert_boundaries(cls.guards)

    @classmethod
    def tearDownClass(cls):
        cls.guards.close()

    def setUp(self):
        old_path = list(sys.path)
        self.addCleanup(lambda: sys.path.__setitem__(slice(None), old_path))
        self.temp = tempfile.TemporaryDirectory(prefix='remaining-stage-unit-', dir=str(TEST_TEMP_ROOT))
        self.addCleanup(self.temp.cleanup)
        self.f = OriginalSealFixture(Path(self.temp.name))
        # Explicit observation double: no historical PID supplies signalling authority.
        patch = mock.patch.object(__import__('eval_driver_runtime'), 'process_gone', return_value=True)
        patch.start()
        self.addCleanup(patch.stop)
        self.context = self.f.prerequisites()

    def start(self):
        admitted = self.f.stage.admit_remaining_stage(self.context)
        driver = self.f.coordinator(admitted)
        self.addCleanup(driver.close)
        driver.check_source = lambda: None
        return driver

    def original_digests(self):
        inventory = json.loads(self.f.closures_path.read_text())
        paths = {item['path'] for row in inventory['closures'] for item in row['files']}
        paths.add(str(self.f.original_summary))
        return {path: digest(path) for path in paths}

    def reserve_fixture_task(self, driver, task):
        result = self.f.reserve_fixture_task(driver.remaining_stage, task)
        job, job_path = result['job'], result['jobPath']
        driver.admissions[tuple(task[key] for key in ('suite', 'scenario', 'slot'))].update(
            {'attempted': True, 'refused': False, 'job': job, 'jobPath': job_path, 'jobDigest': digest(job_path)})
        return result

    def install_batch_fixture(self, driver, fault=None):
        order = independent_remainder([r['task'] for r in self.f.records])
        lock = threading.Lock()
        state = {'active': 0, 'maximum': 0, 'calls': [], 'batches': []}
        def seal_batch():
            batch = len(state['batches'])
            tasks = order[batch * 6:(batch + 1) * 6]
            self.f.compute('seal', tasks)
            state['batches'].append([tuple(task[key] for key in ('suite', 'scenario', 'slot')) for task in tasks])
        barrier = threading.Barrier(6, action=seal_batch, timeout=30)
        def run(task):
            with lock:
                state['calls'].append(task)
                state['active'] += 1
                state['maximum'] = max(state['maximum'], state['active'])
            try:
                result = self.reserve_fixture_task(driver, task)
                barrier.wait()
                outcome = self.f.close_task(task, result, compute=False)
                return fault(task, outcome, result) if fault else outcome
            finally:
                with lock:
                    state['active'] -= 1
        driver.run_slot = run
        return state

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

    def test_exact_grant_rejects_broadening_foreign_members_and_unsafe_json(self):
        original = copy.deepcopy(self.f.remaining_grant)
        changes = [('maximumChargedRoots', 151), ('maximumCombinedChargedRoots', 156), ('concurrency', 7),
            ('batches', 26), ('schemaVersion', True), ('stageId', 'arbitrary-stage'), ('allowRetry', True),
            ('allowResume', True), ('allowContinuation', True), ('publication', True),
            ('fullCorpusAcceptance', True), ('unknownField', False), ('concurrency', True)]
        for key, value in changes:
            with self.subTest(field=key, value=value):
                self.f.remaining_grant = {**copy.deepcopy(original), key: value}
                self.f.publish_remaining()
                with self.assertRaises((ValueError, OSError)):
                    self.f.validate_remaining()
        tasks = original['orderedTasks']
        for selection in (tasks[:-1], [tasks[0]] + tasks[:-1], list(reversed(tasks)),
                          [{**tasks[0], 'scenario': 'foreign'}] + tasks[1:],
                          [{**tasks[0], 'slot': True}] + tasks[1:],
                          [self.f.grant['orderedTasks'][0]] + tasks[1:]):
            with self.subTest(selection=selection[0]):
                self.f.remaining_grant = {**copy.deepcopy(original), 'orderedTasks': selection}
                self.f.publish_remaining()
                with self.assertRaises((ValueError, OSError)):
                    self.f.validate_remaining()
        self.f.remaining_grant_path.write_text('{"schemaVersion":1,"schemaVersion":1}\n')
        with self.assertRaises((ValueError, OSError)):
            self.f.validate_remaining()

    def test_wrong_external_pins_and_separate_size_bounds_refuse_without_admission(self):
        bad = 'sha256:' + '0' * 64
        for corpus_pin, grant_pin in ((bad, digest(self.f.remaining_grant_path)),
                                     (digest(self.f.corpus_path), bad)):
            with self.assertRaises((ValueError, OSError)):
                self.f.stage.validate_remaining_stage(self.f.corpus_path, corpus_pin,
                    self.f.remaining_grant_path, grant_pin)
        self.f.remaining_grant_path.write_bytes(b' ' * (self.f.stage.REMAINING_GRANT_LIMIT + 1))
        with self.assertRaises((ValueError, OSError)):
            self.f.validate_remaining()
        self.f.publish_remaining()
        self.f.closures_path.write_bytes(b' ' * (self.f.stage.CLOSURE_INVENTORY_LIMIT + 1))
        self.f.remaining_grant['closures'] = ref(self.f.closures_path)
        self.f.publish_remaining()
        with self.assertRaises((ValueError, OSError)):
            self.f.validate_remaining()
        self.assertFalse((self.f.output / 'cohorts/remaining-stage-admission.json').exists())

    def test_original_jobs_account_even_with_forged_summary_counters_and_empty_admissions(self):
        driver = self.start()
        self.assertEqual(driver.admissions, {})
        projections = self.f.stage.remaining_context_data(driver.remaining_stage)['originalProjections']
        self.assertEqual(len(projections), 5)
        self.assertEqual(sum(row['chargedRoots'] for row in projections), 5)
        self.assertTrue(all(row['actualModelStarted'] is True for row in projections))
        self.assertNotEqual(json.loads(self.f.original_summary.read_text())['chargedRoots'], 5)

    def test_missing_or_tampered_original_closure_refuses_before_dispatch(self):
        first = self.f.original_jobs[0]
        files = [first['jobPath'], Path(first['job']['artifactDir']) / 'process-start.json',
                 Path(first['job']['task']['attemptRoot']) / 'seal.json',
                 Path(first['job']['task']['attemptRoot']) / 'host-receipt.json',
                 Path(first['job']['artifactDir']) / 'process-termination.json']
        for path in files:
            original = path.read_bytes()
            with self.subTest(path=path.name):
                path.write_bytes(original + b' ')
                with self.assertRaises((ValueError, OSError)):
                    self.f.validate_remaining()
                path.unlink()
                with self.assertRaises((ValueError, OSError)):
                    self.f.validate_remaining()
                path.write_bytes(original)
        self.assertFalse((self.f.output / 'cohorts/remaining-stage-admission.json').exists())

    def test_original_missing_start_is_charged_unknown_and_cannot_be_relabelled(self):
        row = self.f.original_jobs[0]
        (Path(row['job']['artifactDir']) / 'process-start.json').unlink()
        projection = __import__('eval_driver_runtime').inspect_consumption(row['job'], row['jobPath'],
            digest(row['jobPath']), fixture_only=True, wrapper_attempted=True)
        self.assertEqual(projection, {'consumptionState': 'reservation-unknown', 'chargedRoots': 1,
                                      'actualModelStarted': None})
        with self.assertRaises((ValueError, OSError)):
            self.f.validate_remaining()

    def test_admission_is_exclusive_against_competitor_and_relocated_grant(self):
        copied = self.f.root / 'copied-remaining-grant.json'
        shutil.copyfile(self.f.remaining_grant_path, copied)
        alternate = self.f.stage.validate_remaining_stage(self.f.corpus_path, digest(self.f.corpus_path), copied, digest(copied))
        barrier = threading.Barrier(2)
        won, refused = [], []
        def admit(context):
            barrier.wait(timeout=10)
            try:
                won.append(self.f.stage.admit_remaining_stage(context))
            except (ValueError, OSError) as error:
                refused.append(error)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(admit, context) for context in (self.context, alternate)]
            for future in futures:
                future.result(timeout=20)
        self.assertEqual((len(won), len(refused)), (1, 1))
        self.assertTrue((self.f.output / 'cohorts/remaining-stage-admission.json').is_file())
        self.assertFalse((self.f.profiles / 'remaining-stage-cancellation.fifo').exists())

    def test_durable_admission_sync_close_precede_driver_fifo_and_survive_setup_failure(self):
        events = []
        actual_sync, actual_close = os.fsync, os.close
        def sync(fd):
            events.append(('sync', fd))
            return actual_sync(fd)
        def close(fd):
            events.append(('close', fd))
            return actual_close(fd)
        with mock.patch.object(os, 'fsync', sync), mock.patch.object(os, 'close', close):
            admitted = self.f.stage.admit_remaining_stage(self.context)
        self.assertTrue(events)
        self.assertGreaterEqual(sum(row[0] == 'sync' for row in events), 2)
        self.assertEqual(events[-1][0], 'close')
        admission = Path(admitted['admission']['path'])
        before = admission.read_bytes()
        def fifo(*args, **kwargs):
            self.assertEqual(admission.read_bytes(), before)
            self.assertEqual(self.f.stage.pinned(admitted['admission'], json_value=True)['stageId'], REMAINING_STAGE_ID)
            raise OSError('synthetic FIFO setup failure after synchronized admission')
        with mock.patch.object(os, 'mkfifo', fifo), self.assertRaisesRegex(OSError, 'FIFO setup'):
            self.f.coordinator(admitted)
        self.assertEqual(admission.read_bytes(), before)
        with self.assertRaises((ValueError, OSError)):
            self.f.stage.admit_remaining_stage(self.context)
        with self.assertRaises((ValueError, OSError)):
            self.f.coordinator(admitted)

    def test_execute_entry_cannot_construct_driver_before_admission_sync_and_close(self):
        events = []
        admission = self.f.output / 'cohorts/remaining-stage-admission.json'
        actual_sync, actual_close = os.fsync, os.close
        def observe(operation, fd):
            if admission.exists():
                info = os.fstat(fd)
                target = admission.stat()
                label = 'admission' if (info.st_dev, info.st_ino) == (target.st_dev, target.st_ino) else 'ancestor'
                events.append((operation, label))
        def sync(fd):
            observe('sync', fd)
            return actual_sync(fd)
        def close(fd):
            observe('close', fd)
            return actual_close(fd)
        def construct(*args, **kwargs):
            self.assertTrue(admission.is_file())
            self.assertIn(('sync', 'admission'), events)
            self.assertIn(('close', 'admission'), events)
            self.assertIn(('sync', 'ancestor'), events)
            self.assertIn(('close', 'ancestor'), events)
            self.assertIn('admission', kwargs['remaining_stage'])
            self.assertFalse((self.f.profiles / 'remaining-stage-cancellation.fifo').exists())
            raise OSError('synthetic Driver construction ends this consumed operation')
        fake = SimpleNamespace(Driver=construct)
        spec = SimpleNamespace(loader=SimpleNamespace(exec_module=lambda module: None))
        with mock.patch.object(self.f.stage.importlib.util, 'spec_from_file_location', return_value=spec), \
             mock.patch.object(self.f.stage.importlib.util, 'module_from_spec', return_value=fake), \
             mock.patch.object(os, 'fsync', sync), mock.patch.object(os, 'close', close):
            with self.assertRaisesRegex(OSError, 'Driver construction'):
                self.f.stage.main(['--remaining-150', '--execute', '--corpus', str(self.f.corpus_path),
                    '--corpus-sha256', digest(self.f.corpus_path), '--grant', str(self.f.remaining_grant_path),
                    '--grant-sha256', digest(self.f.remaining_grant_path), '--auth-file', str(self.f.auth)])
        with self.assertRaises((ValueError, OSError)):
            self.f.stage.admit_remaining_stage(self.context)

    def test_sync_failure_consumes_admission_and_never_constructs_driver(self):
        path = self.f.output / 'cohorts/remaining-stage-admission.json'
        with mock.patch.object(os, 'fsync', side_effect=OSError('synthetic admission sync failure')):
            with self.assertRaisesRegex(OSError, 'sync failure'):
                self.f.stage.admit_remaining_stage(self.context)
        self.assertTrue(path.is_file())
        with self.assertRaises((ValueError, OSError)):
            self.f.stage.admit_remaining_stage(self.context)
        self.assertFalse((self.f.profiles / 'remaining-stage-cancellation.fifo').exists())

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

    def test_cancellation_authority_requires_literal_true_not_numeric_equality(self):
        original = copy.deepcopy(self.f.remaining_grant)
        for field in ('exclusive', 'closeUnlink'):
            for value in (1, 1.0):
                with self.subTest(field=field, value=value):
                    self.f.remaining_grant = copy.deepcopy(original)
                    self.f.remaining_grant['cancellation'][field] = value
                    self.f.publish_remaining()
                    with self.assertRaises((ValueError, OSError)):
                        self.f.validate_remaining()

    def test_admission_short_write_and_close_failures_are_consumed(self):
        # Use separate fresh namespaces: the first failure permanently consumes its own admission.
        for failure in ('write', 'close'):
            with self.subTest(failure=failure):
                fixture = self.f if failure == 'write' else OriginalSealFixture(self.f.root / 'close-failure')
                context = self.context if failure == 'write' else fixture.prerequisites()
                path = fixture.output / 'cohorts/remaining-stage-admission.json'
                original_close = os.close
                def close(fd):
                    target, admission_info = None, None
                    try:
                        target = os.fstat(fd)
                        admission_info = path.stat()
                    except OSError:
                        pass
                    original_close(fd)
                    if target and admission_info and (target.st_dev, target.st_ino) == (admission_info.st_dev, admission_info.st_ino):
                        raise OSError('synthetic admission close failure')
                patch = (mock.patch.object(os, 'write', return_value=0) if failure == 'write'
                         else mock.patch.object(os, 'close', close))
                with patch, self.assertRaises((ValueError, OSError)):
                    fixture.stage.admit_remaining_stage(context)
                self.assertTrue(path.is_file())
                with self.assertRaises((ValueError, OSError)):
                    fixture.stage.admit_remaining_stage(context)
                self.assertFalse((fixture.profiles / 'remaining-stage-cancellation.fifo').exists())

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

    def test_replaced_namespace_ancestry_gate_blocker_and_unexplained_child_refuse(self):
        cohort = self.f.output / 'cohorts'
        original = self.f.original_jobs[0]
        ancestors = [cohort, cohort / 'iterate', Path(original['job']['artifactDir']).parent]
        for path in ancestors:
            backup = path.with_name(path.name + '-original')
            path.rename(backup)
            path.mkdir()
            try:
                with self.subTest(path=path), self.assertRaises((ValueError, OSError)):
                    self.f.validate_remaining()
            finally:
                path.rmdir()
                backup.rename(path)
        gate = cohort / 'launch-gate'
        backup = cohort / 'retained-launch-gate'
        gate.rename(backup)
        gate.write_bytes(b'')
        gate.chmod(0o600)
        try:
            with self.assertRaises((ValueError, OSError)):
                self.f.validate_remaining()
        finally:
            gate.unlink()
            backup.rename(gate)
        for path in (cohort / 'launch-blocked', cohort / 'unexplained-child'):
            path.write_text('retained marker\n')
            with self.subTest(path=path), self.assertRaises((ValueError, OSError)):
                self.f.validate_remaining()
            self.assertTrue(path.exists())
            path.unlink()

    def test_inventory_label_profile_cleanup_and_external_job_binding_cannot_be_forged(self):
        inventory = json.loads(self.f.closures_path.read_text())
        first = self.f.original_jobs[0]
        artifact = Path(first['job']['artifactDir'])
        result_path = artifact / 'operator-result.json'
        original_bytes = result_path.read_bytes()
        result = json.loads(original_bytes)
        result.update(fixtureOnly=False, qualifiedHost=True)
        write_json(result_path, result)
        # Repinning synthetic inventory cannot turn fixture closures into qualified evidence.
        for row in inventory['closures']:
            row['files'] = [ref(item['path']) for item in row['files']]
        write_json(self.f.closures_path, inventory)
        self.f.remaining_grant['closures'] = ref(self.f.closures_path)
        self.f.publish_remaining()
        with self.assertRaises((ValueError, OSError)):
            self.f.validate_remaining()
        result_path.write_bytes(original_bytes)
        row = inventory['closures'][0]
        row['job']['sha256'] = 'sha256:' + '0' * 64
        write_json(self.f.closures_path, inventory)
        self.f.remaining_grant['closures'] = ref(self.f.closures_path)
        self.f.publish_remaining()
        with self.assertRaises((ValueError, OSError)):
            self.f.validate_remaining()

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

    def test_changed_immutable_source_namespace_and_premature_future_evidence_refuse(self):
        paths = [self.f.operator, self.f.node, self.f.driver / 'eval_first_stage.py',
            Path(self.f.corpus['suites'][0]['suiteConfig']['path']),
            Path(self.f.records[-1]['prompt']['path']), self.f.config_path]
        for path in paths:
            original = path.read_bytes()
            with self.subTest(path=path):
                path.write_bytes(original + b' ')
                with self.assertRaises((ValueError, OSError)):
                    self.f.validate_remaining()
                path.write_bytes(original)
        future = Path(self.f.remaining_grant['orderedTasks'][6]['artifactDir'])
        future.mkdir(parents=True)
        with self.assertRaises((ValueError, OSError)):
            self.f.validate_remaining()
        self.assertFalse((self.f.output / 'cohorts/remaining-stage-admission.json').exists())

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
