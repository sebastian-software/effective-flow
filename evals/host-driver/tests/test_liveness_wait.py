"""Liveness-aware waits replayed on an injected clock, without real time or subprocesses."""
from __future__ import annotations

import io
from pathlib import Path
import re
import unittest

from liveness_wait import (
    CASE_TIMEOUT_SECONDS, MINIMUM_WAIT_SECONDS, POLL_SECONDS, TEARDOWN_MARGIN_SECONDS,
    remaining_seconds, report_failure, wait_until,
)

REPOSITORY = Path(__file__).resolve().parents[3]


class LivenessWaitContracts(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.events = {}
        self.stream = io.StringIO()

    def advance(self, delay):
        self.assertEqual(delay, POLL_SECONDS)
        self.now += 1
        for action in self.events.get(self.now, ()):
            action()

    def wait(self, predicate, **options):
        options.setdefault('backstop', 50)
        return wait_until(predicate, 'awaited signal', clock=lambda: self.now, sleep=self.advance,
                          stream=self.stream, **options)

    def assert_failure(self, expected_now, pattern, predicate=lambda: False, **options):
        with self.assertRaisesRegex(AssertionError, pattern) as raised:
            self.wait(predicate, **options)
        self.assertEqual(self.now, expected_now)
        # The message is flushed to stderr before the raise, so a later kill cannot hide it.
        self.assertEqual(self.stream.getvalue(), str(raised.exception) + '\n')
        return str(raised.exception)

    def test_returns_once_the_predicate_holds(self):
        signal = []
        self.events = {7: [lambda: signal.append(True)]}
        self.assertTrue(self.wait(lambda: bool(signal), gone=lambda: '', stopped=lambda: False))
        self.assertEqual(self.now, 7)
        self.assertEqual(self.stream.getvalue(), '')

    def test_stop_returns_without_raising(self):
        stopped = []
        self.events = {4: [lambda: stopped.append(True)]}
        self.assertFalse(self.wait(lambda: False, stopped=lambda: bool(stopped),
                                   gone=lambda: 'wrapper 1 exited with code 1' if self.now >= 4 else ''))
        self.assertEqual(self.now, 4)
        self.assertEqual(self.stream.getvalue(), '')

    def test_gone_producer_raises_within_one_poll(self):
        message = self.assert_failure(
            3, 'producer gone: wrapper 2 exited with code 1',
            gone=lambda: 'wrapper 2 exited with code 1' if self.now >= 3 else '',
            liveness=lambda: '1:running 2:exit 1')
        self.assertIn('awaited signal', message)
        self.assertIn('after 3.00 s', message)
        self.assertIn('producers: 1:running 2:exit 1', message)

    def test_backstop_expiry_names_signal_elapsed_and_liveness(self):
        message = self.assert_failure(50, 'backstop expired', liveness=lambda: '1:running')
        self.assertIn('fixture wait failed: awaited signal', message)
        self.assertIn('after 50.00 s', message)
        self.assertIn('producers: 1:running', message)
        self.assertNotIn('deadline cap', message)

    def test_deadline_cap_ends_the_backstop_early(self):
        self.now = 100
        message = self.assert_failure(112, 'deadline cap', deadline=112)
        self.assertIn('after 12.00 s', message)
        self.assertIn('producers: not tracked', message)

    def test_signal_in_the_poll_its_producer_exits_wins(self):
        signal = []

        def gone():
            if self.now == 5:
                signal.append(True)
                return 'wrapper 6 exited with code 0'
            return ''
        self.assertTrue(self.wait(lambda: bool(signal), gone=gone))
        self.assertEqual(self.now, 5)
        self.assertEqual(self.stream.getvalue(), '')

    def test_report_failure_flushes_before_returning_the_error(self):
        class Recorder(io.StringIO):
            flushed = None

            def flush(self):
                self.flushed = self.getvalue()
                super().flush()
        stream = Recorder()
        error = report_failure('fixture wait failed: x', stream=stream)
        self.assertIsInstance(error, AssertionError)
        self.assertEqual(str(error), 'fixture wait failed: x')
        self.assertEqual(stream.flushed, 'fixture wait failed: x\n')

    def test_remaining_seconds_is_capped_and_never_below_the_floor(self):
        self.assertEqual(remaining_seconds(130, clock=lambda: 30), 100)
        self.assertEqual(remaining_seconds(130, clock=lambda: 129), MINIMUM_WAIT_SECONDS)
        self.assertEqual(remaining_seconds(130, clock=lambda: 200), MINIMUM_WAIT_SECONDS)


class CaseBudgetContracts(unittest.TestCase):
    def test_case_timeout_mirrors_the_runner_default_python_budget(self):
        source = (REPOSITORY / 'scripts/host-driver-tests.mjs').read_text()
        match, = re.findall(r'^const DEFAULT_PYTHON_TIMEOUT = ([0-9_]+);$', source, re.MULTILINE)
        self.assertEqual(int(match.replace('_', '')), CASE_TIMEOUT_SECONDS * 1000)
        self.assertGreater(CASE_TIMEOUT_SECONDS - TEARDOWN_MARGIN_SECONDS, MINIMUM_WAIT_SECONDS)


if __name__ == '__main__':
    unittest.main(verbosity=2)
