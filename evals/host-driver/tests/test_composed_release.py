"""Replay measured native release budgets without wall-clock waits."""
from __future__ import annotations

import ast
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from composed_remaining_support import NATIVE, complete_ready_batch, wait_for_ready_batch
from test_first_stage import LOCAL_RUN, TEST_TEMP_ROOT
import test_remaining_stage_composed as composed


class ComposedReleaseContracts(unittest.TestCase):
    def test_native_ready_record_and_unknown_injection_use_selected_ordinal(self):
        with tempfile.TemporaryDirectory(dir=str(TEST_TEMP_ROOT)) as name:
            root = Path(name)
            control = root / 'control'
            control.mkdir()
            (control / 'unknown').write_text('5\n')
            config = root / 'config.json'
            config.write_text(json.dumps({'fixtureControls': str(control)}))
            for ordinal in (1, 5):
                directory = root / str(ordinal)
                directory.mkdir()
                (directory / 'worker-job.json').write_text(json.dumps({
                    'configFile': str(config), 'remainingStage': {'ordinal': ordinal}}))
                (directory / 'process-start.json').write_text('{"bound": true}\n')
                (control / ('release-' + str(ordinal))).touch()
                result = LOCAL_RUN([sys.executable, '-B', '-c', NATIVE,
                    '--output-last-message', str(directory / 'last-message.txt')],
                    capture_output=True, text=True, timeout=5)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                record = json.loads((control / ('ready-' + str(ordinal))).read_text())
                self.assertEqual(record['ordinal'], ordinal)
                self.assertIs(type(record['readyNs']), int)
                self.assertGreater(record['readyNs'], 0)
                self.assertFalse((control / ('ready-' + str(ordinal) + '.tmp')).exists())
                self.assertEqual(json.loads((directory / 'process-start.json').read_text()),
                                 {} if ordinal == 5 else {'bound': True})

    def test_measured_readiness_releases_five_before_checks_and_holds_latest(self):
        cases = (
            (False, [0, 6.319, 11.982, 17.837, 23.078, 28.487],
             [2.432393, 2.541357, 2.980709], 6),
            (True, [0, 6.950, 12.812, 24.537, 29.564, 19.068],
             [2.443699, 2.707961, 3.024753], 5),
        )
        for unknown, times, costs, expected_held in cases:
            with self.subTest(unknown=unknown):
                ready = {i: {'ordinal': i, 'readyNs': int(t * 1e9)}
                         for i, t in enumerate(times, 1)}
                clock = max(row['readyNs'] for row in ready.values()) + 10_000_000
                released, sealed, events, injected = set(), set(), [], []

                def assert_live():
                    for ordinal, record in ready.items():
                        if ordinal not in released:
                            self.assertLess(clock, record['readyNs'] + 35_000_000_000,
                                            'native release deadline expired: ' + str(ordinal))

                def set_unknown(ordinal):
                    injected.append(ordinal)
                    events.append(('unknown', ordinal))

                def release(ordinal):
                    assert_live()
                    self.assertNotIn(ordinal, released)
                    if ordinal == expected_held:
                        self.assertEqual(sealed, set(ready) - {expected_held})
                        self.assertEqual(events[-1], ('five-seals-and-pins', expected_held))
                    released.add(ordinal)
                    events.append(('release', ordinal))
                    if ordinal not in injected:
                        sealed.add(ordinal)

                def check_context():
                    nonlocal clock
                    for name, cost in zip(('context', 'foreign-child', 'future-artifact'), costs):
                        clock += int(cost * 1e9)
                        assert_live()
                        events.append((name, expected_held))
                    self.assertEqual(released, set(ready) - {expected_held})

                def check_closures(held):
                    self.assertEqual(held, expected_held)
                    self.assertEqual(released, set(ready) - {held})
                    self.assertEqual(sealed, released)
                    self.assertEqual([name for name, _ in events if name != 'unknown'][-3:],
                                     ['context', 'foreign-child', 'future-artifact'])
                    assert_live()
                    events.append(('five-seals-and-pins', held))

                held = complete_ready_batch(ready, unknown=unknown, set_unknown=set_unknown,
                    release=release, check_context=check_context, check_closures=check_closures)
                self.assertEqual(held, expected_held)
                self.assertEqual(injected, [held] if unknown else [])
                self.assertEqual(released, set(ready))
                self.assertEqual(sealed, set(ready) - set(injected))
                self.assertEqual([event for event in events if event[0] == 'release'],
                                 [('release', i) for i in ready if i != held] + [('release', held)])


class ComposedReadinessContracts(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(dir=str(TEST_TEMP_ROOT))
        self.addCleanup(temporary.cleanup)
        self.control = Path(temporary.name)
        self.now = 0
        self.events = {}
        self.stopped = False

    def record(self, ordinal, **fields):
        data = {'ordinal': ordinal, 'readyNs': (self.now + 1) * 1_000_000_000}
        data.update(fields)
        (self.control / ('ready-' + str(ordinal))).write_text(json.dumps(data))

    def advance(self, delay):
        self.assertEqual(delay, .01)
        self.now += 1
        for action in self.events.get(self.now, ()):
            action()

    def wait(self):
        return wait_for_ready_batch(self.control, lambda: self.stopped,
                                   clock=lambda: self.now, sleep=self.advance)

    def assert_timeout(self, expected):
        with self.assertRaisesRegex(AssertionError, 'six real fixture workers running'):
            self.wait()
        self.assertEqual(self.now, expected)

    def test_distinct_shuffled_progress_allows_more_than_35_seconds_total(self):
        order = (6, 2, 4, 1, 5, 3)
        for instant, ordinal in zip((5, 13, 21, 29, 37, 45), order):
            self.events[instant] = [lambda ordinal=ordinal: self.record(ordinal)]
        ready = self.wait()
        self.assertEqual(set(ready), set(range(1, 7)))
        self.assertEqual([ready[ordinal]['ordinal'] for ordinal in order], list(order))
        self.assertEqual(self.now, 45)

    def test_no_initial_progress_expires_at_35(self):
        self.assert_timeout(35)

    def test_intermediate_stall_expires_35_after_last_new_ordinal(self):
        self.events = {4: [lambda: self.record(1)], 12: [lambda: self.record(2)]}
        self.assert_timeout(47)

    def test_rewrites_reappearance_and_unrelated_files_never_extend_wait(self):
        self.events = {
            1: [lambda: self.record(1)],
            10: [lambda: self.record(1)],
            20: [lambda: (self.control / 'ready-1').unlink()],
            25: [lambda: self.record(1)],
            30: [lambda: (self.control / 'ready-2.tmp').write_text('{"ordinal": 2}')],
            31: [lambda: self.record(7)],
            34: [lambda: (self.control / 'coordinator.log').write_text('progress')],
        }
        self.assert_timeout(36)

    def test_historical_six_cannot_substitute_for_a_missing_current_worker(self):
        self.record(1)
        self.events[1] = [lambda: (self.control / 'ready-1').unlink()]
        for ordinal in range(2, 7):
            self.events[ordinal] = [lambda ordinal=ordinal: self.record(ordinal)]
        self.assert_timeout(41)

    def test_invalid_expected_records_fail_closed_without_bool_as_int(self):
        records = (
            '{', '[]',
            {'ordinal': 2, 'readyNs': 1},
            {'ordinal': True, 'readyNs': 1},
            {'ordinal': 1.0, 'readyNs': 1},
            {'ordinal': 1, 'readyNs': True},
            {'ordinal': 1, 'readyNs': 1.5},
            {'ordinal': 1, 'readyNs': 0},
            {'ordinal': 1, 'readyNs': -1},
            {'ordinal': 1},
        )
        for record in records:
            with self.subTest(record=record):
                (self.control / 'ready-1').write_text(
                    record if isinstance(record, str) else json.dumps(record))
                with self.assertRaisesRegex(ValueError, 'invalid native ready record'):
                    self.wait()
                self.assertEqual(self.now, 0)

    def test_partial_and_final_progress_at_or_after_expiry_cannot_revive_wait(self):
        for final in (False, True):
            for arrival in (35, 36):
                with self.subTest(final=final, arrival=arrival):
                    self.now = 0
                    for path in self.control.iterdir():
                        path.unlink()
                    if final:
                        for ordinal in range(1, 6):
                            self.record(ordinal)
                    self.events = {arrival: [lambda: self.record(6 if final else 1)]}
                    self.assert_timeout(35)

    def test_completion_just_before_expiry_is_accepted(self):
        for ordinal in range(1, 6):
            self.record(ordinal)
        self.events = {34: [lambda: self.record(6)]}
        self.assertEqual(set(self.wait()), set(range(1, 7)))
        self.assertEqual(self.now, 34)

    def test_coordinator_failure_returns_to_existing_refusal_assertions(self):
        self.events = {3: [lambda: setattr(self, 'stopped', True)]}
        self.assertIsNone(self.wait())
        self.assertEqual(self.now, 3)

    def test_recovery_and_unknown_start_keep_distinct_pinned_interpreter_budgets(self):
        source = Path(__file__).with_name('test_remaining_stage_composed.py').read_text()
        tree = ast.parse(source)
        for name, unknown in (
            ('test_real_six_worker_recovery_preserves_original_closures_and_next_batch_gate', False),
            ('test_real_unknown_start_blocks_next_batch_without_refunding_admission', True),
        ):
            entry = next(node for node in ast.walk(tree)
                         if isinstance(node, ast.FunctionDef) and node.name == name)
            call, = [node for node in ast.walk(entry) if isinstance(node, ast.Call)]
            self.assertEqual(ast.unparse(call.func), 'self.run_composed_batch')
            self.assertEqual([(keyword.arg, ast.literal_eval(keyword.value))
                              for keyword in call.keywords], [('unknown', unknown)])
        method = next(node for node in ast.walk(tree)
                      if isinstance(node, ast.FunctionDef) and node.name == 'run_composed_batch')
        calls = [node for node in ast.walk(method) if isinstance(node, ast.Call)
                 and isinstance(node.func, ast.Name) and node.func.id == 'LOCAL_RUN']
        self.assertEqual(len(calls), 1)
        timeout = next(keyword.value for keyword in calls[0].keywords if keyword.arg == 'timeout')
        self.assertIsInstance(timeout, ast.IfExp)
        self.assertEqual(ast.unparse(timeout.test), 'unknown')
        self.assertEqual(ast.literal_eval(timeout.body), 120)
        self.assertEqual(ast.literal_eval(timeout.orelse), 180)

    def test_one_pinned_interpreter_still_owns_the_entire_coordinator_and_cleanup(self):
        source = Path(__file__).with_name('test_remaining_stage_composed.py').read_text()
        tree = ast.parse(source)
        method = next(node for node in ast.walk(tree)
                      if isinstance(node, ast.FunctionDef) and node.name == 'run_composed_batch')
        call, = [node for node in ast.walk(method) if isinstance(node, ast.Call)
                 and isinstance(node.func, ast.Name) and node.func.id == 'LOCAL_RUN']
        command = call.args[0]
        self.assertEqual(ast.unparse(command.elts[0]), 'str(python)')
        self.assertEqual([ast.literal_eval(item) for item in command.elts[1:3]], ['-B', '-c'])
        self.assertEqual(ast.unparse(command.elts[3]), 'script')
        self.assertEqual(ast.unparse(command.elts[-1]), 'str(int(unknown))')
        pinned = next(node for node in ast.walk(method) if isinstance(node, ast.Assign)
                      and any(isinstance(target, ast.Name) and target.id == 'python'
                              for target in node.targets))
        self.assertEqual(ast.unparse(pinned.value.func), 'copy_fixture_executable')
        self.assertEqual(ast.unparse(pinned.value.args[0]), 'sys.executable')
        script = next(ast.literal_eval(node.value) for node in ast.walk(method)
                      if isinstance(node, ast.Assign)
                      and any(isinstance(target, ast.Name) and target.id == 'script'
                              for target in node.targets))
        child = ast.parse(script)
        boundary, = [node for node in child.body if isinstance(node, ast.Try)]
        coordinator, = [node for node in ast.walk(child) if isinstance(node, ast.Call)
                        and isinstance(node.func, ast.Attribute)
                        and node.func.attr == '_run_composed_batch']
        self.assertIn(coordinator, list(ast.walk(boundary.body[0])))
        self.assertEqual(ast.unparse(coordinator),
                         "case._run_composed_batch(Path(sys.argv[2]), unknown=sys.argv[3] == '1')")
        self.assertEqual([ast.unparse(node) for node in boundary.finalbody], ['case.doCleanups()'])
        self.assertFalse(any(isinstance(node, ast.Attribute)
                             and node.attr in ('_run_composed_batch', 'run_remaining_stage',
                                               'ThreadPoolExecutor')
                             for node in ast.walk(method)))

    def test_interpreter_timeout_surfaces_captured_streams_and_reraises_original(self):
        command = [sys.executable, '-B', '-c',
                   "import os, time; os.write(1, b'synthetic stdout \\xff\\n'); "
                   "os.write(2, b'synthetic stderr \\xfe\\n'); time.sleep(5)"]
        for text in (False, True):
            with self.subTest(text=text):
                original = []

                def expire(*args, **kwargs):
                    try:
                        return LOCAL_RUN(command, capture_output=True, text=True, timeout=.5)
                    except subprocess.TimeoutExpired as error:
                        original.append(error)
                        if text:
                            error.stdout = error.stdout.decode('utf-8', errors='replace')
                            error.stderr = error.stderr.decode('utf-8', errors='replace')
                        raise

                stdout = io.TextIOWrapper(io.BytesIO(), encoding='utf-8')
                stderr = io.TextIOWrapper(io.BytesIO(), encoding='utf-8')
                with stdout, stderr, redirect_stdout(stdout), redirect_stderr(stderr), \
                     mock.patch.object(composed, 'LOCAL_RUN', side_effect=expire), \
                     mock.patch.object(composed, 'copy_fixture_executable',
                                       return_value=Path(sys.executable)):
                    with self.assertRaises(subprocess.TimeoutExpired) as raised:
                        composed.ComposedRemainingStageContracts().run_composed_batch(unknown=False)
                    error, = original
                    self.assertIs(raised.exception, error)
                    self.assertEqual(error.timeout, .5)
                    self.assertEqual(error.cmd, command)
                    for stream, output in ((stdout, error.stdout), (stderr, error.stderr)):
                        expected = output.encode('utf-8') if text else output
                        self.assertTrue(expected)
                        self.assertEqual(stream.buffer.getvalue(), expected)


if __name__ == '__main__':
    unittest.main(verbosity=2)
