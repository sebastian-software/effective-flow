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

from composed_remaining_support import (
    CHILD_BARRIER_BACKSTOP_SECONDS, COMPOSED_INNER_TIMEOUT_SECONDS, COMPOSED_WAIT_BACKSTOP_SECONDS,
    COORDINATOR_TIMEOUT_SECONDS, NATIVE, OPERATOR, OPERATOR_BACKSTOP_SECONDS,
    QUALIFICATION_TIMEOUT_SECONDS, READY_PROGRESS_WINDOW_SECONDS, REFUSAL_BARRIER, WrapperProcesses,
    batch_two_gone, closures_gone, complete_ready_batch, describe_exits, describe_wrappers,
    inject_constants, ready_batch_gone, recovery_claims_gone, wait_for_ready_batch, wrapper_ordinal,
)
from liveness_wait import TEARDOWN_MARGIN_SECONDS
from test_first_stage import LOCAL_RUN, TEST_TEMP_ROOT
import test_remaining_stage_composed as composed

WINDOW = READY_PROGRESS_WINDOW_SECONDS
HOST_DRIVER = Path(__file__).resolve().parent.parent


class FakeProcess:
    """Process double: `poll()` returns the configured exit code, or None while running."""

    def __init__(self, code=None, on_poll=None):
        self.code, self.on_poll = code, on_poll

    def poll(self):
        if self.on_poll is not None:
            self.on_poll()
        return self.code


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
                            self.assertLess(clock, record['readyNs']
                                            + CHILD_BARRIER_BACKSTOP_SECONDS * 1_000_000_000,
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

    def wait(self, **options):
        self.stderr = io.StringIO()
        return wait_for_ready_batch(self.control, lambda: self.stopped,
                                   clock=lambda: self.now, sleep=self.advance, stream=self.stderr,
                                   **options)

    def assert_timeout(self, expected, pattern='six real fixture workers running', **options):
        with self.assertRaisesRegex(AssertionError, pattern) as raised:
            self.wait(**options)
        self.assertEqual(self.now, expected)
        # The failure is flushed to stderr before raising, so a later kill cannot hide it.
        self.assertEqual(self.stderr.getvalue(), str(raised.exception) + '\n')

    def test_distinct_shuffled_progress_allows_more_than_one_window_total(self):
        order = (6, 2, 4, 1, 5, 3)
        step = WINDOW // 4
        instants = [5 + index * step for index in range(6)]
        self.assertLess(step, WINDOW)
        self.assertGreater(instants[-1], WINDOW)
        for instant, ordinal in zip(instants, order):
            self.events[instant] = [lambda ordinal=ordinal: self.record(ordinal)]
        ready = self.wait()
        self.assertEqual(set(ready), set(range(1, 7)))
        self.assertEqual([ready[ordinal]['ordinal'] for ordinal in order], list(order))
        self.assertEqual(self.now, instants[-1])

    def test_no_initial_progress_expires_after_one_window(self):
        self.assert_timeout(WINDOW)

    def test_intermediate_stall_expires_one_window_after_last_new_ordinal(self):
        self.events = {4: [lambda: self.record(1)], 12: [lambda: self.record(2)]}
        self.assert_timeout(12 + WINDOW)

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
        self.assertLess(max(self.events), 1 + WINDOW)
        self.assert_timeout(1 + WINDOW)

    def test_historical_six_cannot_substitute_for_a_missing_current_worker(self):
        self.record(1)
        self.events[1] = [lambda: (self.control / 'ready-1').unlink()]
        for ordinal in range(2, 7):
            self.events[ordinal] = [lambda ordinal=ordinal: self.record(ordinal)]
        self.assert_timeout(6 + WINDOW)

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
            for arrival in (WINDOW, WINDOW + 1):
                with self.subTest(final=final, arrival=arrival):
                    self.now = 0
                    for path in self.control.iterdir():
                        path.unlink()
                    if final:
                        for ordinal in range(1, 6):
                            self.record(ordinal)
                    self.events = {arrival: [lambda: self.record(6 if final else 1)]}
                    self.assert_timeout(WINDOW)

    def test_completion_just_before_expiry_is_accepted(self):
        for ordinal in range(1, 6):
            self.record(ordinal)
        self.events = {WINDOW - 1: [lambda: self.record(6)]}
        self.assertEqual(set(self.wait()), set(range(1, 7)))
        self.assertEqual(self.now, WINDOW - 1)

    def test_deadline_cap_expires_despite_ongoing_progress(self):
        cap = 7
        self.assertLess(cap, WINDOW)
        self.events = {instant: [lambda ordinal=ordinal: self.record(ordinal)]
                       for ordinal, instant in enumerate((2, 4, 6, 8, 10), 1)}
        self.assert_timeout(cap, 'six real fixture workers running: deadline cap reached', deadline=cap)

    def test_gone_wrapper_fails_within_one_poll(self):
        self.record(1)
        reports = []

        def gone():
            report = 'wrapper 2 exited with code 1' if self.now >= 3 else ''
            reports.append(report)
            return report
        self.assert_timeout(3, 'producer gone: wrapper 2 exited with code 1', gone=gone,
                            liveness=lambda: '1:running 2:exit 1')
        self.assertIn('producers: 1:running 2:exit 1', self.stderr.getvalue())
        self.assertEqual(reports[-2:], ['wrapper 2 exited with code 1'] * 2)

    def test_ready_record_written_as_its_wrapper_exits_wins(self):
        for ordinal in range(1, 6):
            self.record(ordinal)

        def gone():
            # The last record lands in the very poll that observes its producer's exit.
            if self.now == 2 and not (self.control / 'ready-6').exists():
                self.record(6)
                return 'wrapper 6 exited with code 0'
            return ''
        ready = self.wait(gone=gone)
        self.assertEqual(set(ready), set(range(1, 7)))
        self.assertEqual(self.now, 2)
        self.assertEqual(self.stderr.getvalue(), '')

    def test_coordinator_failure_returns_to_existing_refusal_assertions(self):
        self.events = {3: [lambda: setattr(self, 'stopped', True)]}
        self.assertIsNone(self.wait(gone=lambda: 'wrapper 1 exited with code 1'
                                    if self.now >= 3 else ''))
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
        self.assertEqual(COMPOSED_INNER_TIMEOUT_SECONDS, max(120, 180))
        # The child deadline derives from the very same inner timeouts, right before LOCAL_RUN.
        deadline, = [node for node in ast.walk(method) if isinstance(node, ast.Assign)
                     and any(isinstance(target, ast.Name) and target.id == 'deadline'
                             for target in node.targets)]
        self.assertEqual(ast.unparse(deadline.value), 'time.monotonic() + (120 if unknown else 180)')
        self.assertLess(deadline.lineno, calls[0].lineno)

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
        self.assertEqual([ast.unparse(item) for item in command.elts[-2:]],
                         ['str(int(unknown))', 'repr(deadline)'])
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
                         "case._run_composed_batch(Path(sys.argv[2]), unknown=sys.argv[3] == '1', "
                         "deadline=float(sys.argv[4]))")
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


class ComposedTimingConstants(unittest.TestCase):
    """Every composed backstop fits inside its enclosing timeout and reaches its fixture script."""

    def test_backstops_nest_inside_enclosing_timeouts(self):
        self.assertGreaterEqual(CHILD_BARRIER_BACKSTOP_SECONDS, COMPOSED_INNER_TIMEOUT_SECONDS + 20)
        self.assertLessEqual(OPERATOR_BACKSTOP_SECONDS, QUALIFICATION_TIMEOUT_SECONDS - 30)
        self.assertGreater(COORDINATOR_TIMEOUT_SECONDS, CHILD_BARRIER_BACKSTOP_SECONDS)
        self.assertGreater(COORDINATOR_TIMEOUT_SECONDS + 125, CHILD_BARRIER_BACKSTOP_SECONDS)
        self.assertGreater(COORDINATOR_TIMEOUT_SECONDS + 140, COMPOSED_INNER_TIMEOUT_SECONDS)
        self.assertLessEqual(COORDINATOR_TIMEOUT_SECONDS, 1800)
        self.assertLessEqual(COMPOSED_WAIT_BACKSTOP_SECONDS,
                             COMPOSED_INNER_TIMEOUT_SECONDS - TEARDOWN_MARGIN_SECONDS)
        self.assertLess(WINDOW, COMPOSED_INNER_TIMEOUT_SECONDS - TEARDOWN_MARGIN_SECONDS)
        # The margin covers at least the 15 s wrapper-stop grace plus a loaded seal.
        self.assertGreater(TEARDOWN_MARGIN_SECONDS, 15)

    def test_qualification_timeout_mirrors_the_unchanged_worker(self):
        tree = ast.parse((HOST_DRIVER / 'eval_host_worker.py').read_text())
        timeouts = [ast.literal_eval(keyword.value) for node in ast.walk(tree)
                    if isinstance(node, ast.Call) and ast.unparse(node.func) == 'subprocess.run'
                    and isinstance(node.args[0], ast.List)
                    and any(isinstance(item, ast.Constant) and item.value == 'qualify'
                            for item in node.args[0].elts)
                    for keyword in node.keywords if keyword.arg == 'timeout']
        self.assertEqual(timeouts, [QUALIFICATION_TIMEOUT_SECONDS])

    def test_fixture_scripts_carry_the_named_backstops(self):
        for script in (NATIVE, REFUSAL_BARRIER):
            self.assertIn('time.monotonic() + ' + repr(CHILD_BARRIER_BACKSTOP_SECONDS), script)
            self.assertNotIn('time.monotonic() + 35', script)
        self.assertIn('Date.now() + ' + repr(OPERATOR_BACKSTOP_SECONDS * 1000), OPERATOR)
        self.assertNotIn('Date.now() + 30000', OPERATOR)
        for script in (NATIVE, OPERATOR, REFUSAL_BARRIER):
            self.assertNotRegex(script, '@[A-Z_]+@')
        self.assertEqual(inject_constants('a @X@ b', X=3), 'a 3 b')
        with self.assertRaisesRegex(ValueError, 'no token'):
            inject_constants('a b', X=3)
        with self.assertRaisesRegex(ValueError, 'unresolved token'):
            inject_constants('@X@ @Y@', X=3)


class ComposedLivenessPredicates(unittest.TestCase):
    """Per-wait wrapper liveness, scoped to the producers of signals still missing."""

    def setUp(self):
        temporary = tempfile.TemporaryDirectory(dir=str(TEST_TEMP_ROOT))
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.control = self.root / 'control'
        self.control.mkdir()
        self.first = []
        for ordinal in range(1, 13):
            directory = self.root / ('slot-' + str(ordinal))
            directory.mkdir()
            if ordinal <= 6:
                self.first.append(directory)

    def test_recovery_claims_fail_on_any_first_batch_exit(self):
        processes = {1: FakeProcess(), 2: FakeProcess(0), 3: FakeProcess(1), 4: FakeProcess(None),
                     7: FakeProcess(1)}
        self.assertEqual(recovery_claims_gone(processes), [(2, 0), (3, 1)])
        self.assertEqual(recovery_claims_gone({1: FakeProcess(), 6: FakeProcess()}), [])

    def test_ready_batch_counts_wrappers_only_until_their_ready_record(self):
        (self.control / 'ready-1').write_text('{}')
        processes = {1: FakeProcess(0), 2: FakeProcess(0), 3: FakeProcess()}
        self.assertEqual(ready_batch_gone(processes, self.control), [(2, 0)])

    def test_closures_ignore_clean_exit_and_fail_on_nonzero_exit_of_non_held_wrapper(self):
        (self.first[2] / 'operator-result.json').write_text('{}')
        processes = {1: FakeProcess(0), 2: FakeProcess(3), 3: FakeProcess(1), 4: FakeProcess(),
                     6: FakeProcess(1), 7: FakeProcess(1)}
        self.assertEqual(closures_gone(processes, self.first, 6), [(2, 3)])
        self.assertEqual(closures_gone({1: FakeProcess(0)}, self.first, 6), [])

    def test_batch_two_fails_on_any_exit_before_its_refusal_marker(self):
        (self.control / 'refusal-persisted-8').write_text('digest')
        processes = {3: FakeProcess(1), 7: FakeProcess(0), 8: FakeProcess(9), 9: FakeProcess(),
                     12: FakeProcess(9)}
        self.assertEqual(batch_two_gone(processes, self.control), [(7, 0), (12, 9)])

    def test_signal_written_just_before_exit_never_counts(self):
        marker = self.control / 'refusal-persisted-7'
        ready = self.control / 'ready-1'
        result = self.first[0] / 'operator-result.json'
        processes = {1: FakeProcess(0, on_poll=lambda: ready.write_text('{}')),
                     7: FakeProcess(0, on_poll=lambda: marker.write_text('digest'))}
        self.assertEqual(ready_batch_gone(processes, self.control), [])
        self.assertEqual(batch_two_gone(processes, self.control), [])
        failing = {1: FakeProcess(1, on_poll=lambda: result.write_text('{}'))}
        self.assertEqual(closures_gone(failing, self.first, 6), [])

    def test_gone_report_names_ordinal_exit_code_and_log_tail(self):
        (self.first[1] / 'runner.stderr.log').write_text('x' * 5000 + 'wrapper refused startup\n')
        report = describe_exits([(2, 1)], lambda ordinal: self.root / ('slot-' + str(ordinal)))
        self.assertIn('wrapper 2 exited with code 1', report)
        self.assertIn('runner.stderr.log tail of ordinal 2', report)
        self.assertIn('wrapper refused startup', report)
        self.assertLess(len(report), 3000)
        self.assertEqual(describe_exits([], lambda ordinal: self.root), '')
        missing = describe_exits([(3, 2)], lambda ordinal: self.root / ('slot-' + str(ordinal)),
                                 ('qualification.stderr.log',))
        self.assertIn('<FileNotFoundError>', missing)
        self.assertEqual(describe_wrappers({2: FakeProcess(1), 1: FakeProcess()}), '1:running 2:exit 1')

    def test_wrapper_ordinal_comes_from_the_job_path_and_records_are_thread_safe(self):
        job = self.first[3] / 'worker-job.json'
        job.write_text(json.dumps({'remainingStage': {'ordinal': 4}}))
        command = ['node', 'host-run.mjs', '--profiles-root', 'root', '--', 'python', '-c', 'script',
                   'driver', '--job', str(job), '--digest', 'd']
        self.assertEqual(wrapper_ordinal(command), 4)
        wrappers = WrapperProcesses()
        process = FakeProcess()
        wrappers.record(4, process)
        snapshot = wrappers.snapshot()
        wrappers.record(5, FakeProcess())
        self.assertEqual(snapshot, {4: process})


if __name__ == '__main__':
    unittest.main(verbosity=2)
