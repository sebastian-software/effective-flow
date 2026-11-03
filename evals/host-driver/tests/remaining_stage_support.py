"""Shared remaining-stage fixtures; this mixin is not a discoverable TestCase."""
from __future__ import annotations

from contextlib import (
    ExitStack,
)
import json
from pathlib import (
    Path,
)
import sys
import tempfile
import threading
from unittest import (
    mock,
)
from test_first_stage import (
    OriginalSealFixture,
    TEST_TEMP_ROOT,
    digest,
    independent_remainder,
    inert_boundaries,
)


class RemainingStageFixtureMixin:
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
