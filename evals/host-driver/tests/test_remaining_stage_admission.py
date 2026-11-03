"""Model-free remaining-stage admission regressions using the original bounded fixture helpers."""
from __future__ import annotations

import concurrent.futures
import copy
import json
import os
from pathlib import (
    Path,
)
import shutil
import threading
from types import (
    SimpleNamespace,
)
from unittest import (
    mock,
)
from test_first_stage import (
    OriginalSealFixture,
    REMAINING_STAGE_ID,
    digest,
    ref,
    write_json,
)
import unittest

from remaining_stage_support import RemainingStageFixtureMixin


class RemainingStageAdmissionContracts(RemainingStageFixtureMixin, unittest.TestCase):
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

    def test_original_jobs_account_even_with_forged_summary_counters_and_empty_admissions(self):
        driver = self.start()
        self.assertEqual(driver.admissions, {})
        projections = self.f.stage.remaining_context_data(driver.remaining_stage)['originalProjections']
        self.assertEqual(len(projections), 5)
        self.assertEqual(sum(row['chargedRoots'] for row in projections), 5)
        self.assertTrue(all(row['actualModelStarted'] is True for row in projections))
        self.assertNotEqual(json.loads(self.f.original_summary.read_text())['chargedRoots'], 5)

    def test_original_missing_start_is_charged_unknown_and_cannot_be_relabelled(self):
        row = self.f.original_jobs[0]
        (Path(row['job']['artifactDir']) / 'process-start.json').unlink()
        projection = __import__('eval_driver_runtime').inspect_consumption(row['job'], row['jobPath'],
            digest(row['jobPath']), fixture_only=True, wrapper_attempted=True)
        self.assertEqual(projection, {'consumptionState': 'reservation-unknown', 'chargedRoots': 1,
                                      'actualModelStarted': None})
        with self.assertRaises((ValueError, OSError)):
            self.f.validate_remaining()

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

    def test_sync_failure_consumes_admission_and_never_constructs_driver(self):
        path = self.f.output / 'cohorts/remaining-stage-admission.json'
        with mock.patch.object(os, 'fsync', side_effect=OSError('synthetic admission sync failure')):
            with self.assertRaisesRegex(OSError, 'sync failure'):
                self.f.stage.admit_remaining_stage(self.context)
        self.assertTrue(path.is_file())
        with self.assertRaises((ValueError, OSError)):
            self.f.stage.admit_remaining_stage(self.context)
        self.assertFalse((self.f.profiles / 'remaining-stage-cancellation.fifo').exists())

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


if __name__ == '__main__':
    unittest.main(verbosity=2)
