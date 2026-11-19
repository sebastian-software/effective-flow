"""Wait on progress or producer liveness instead of a fixed wall-clock budget.

A fixed short deadline turns slow-but-live progress on a loaded host into a test
failure. These waits succeed as soon as the awaited signal appears, fail fast
when a producer is provably gone, and keep only a generous backstop that stays
inside the per-case runner budget. This is the Python counterpart of
`test/support/marker-wait.mjs`.
"""
from __future__ import annotations

import sys
import time


# Mirrors DEFAULT_PYTHON_TIMEOUT (150_000 ms) in scripts/host-driver-tests.mjs; a test pins equality.
CASE_TIMEOUT_SECONDS = 150
# >= one loaded seal compute plus the 15 s wrapper-stop grace (eval_driver_runtime.py), so
# teardown after a wait that hit its cap still finishes before the enclosing timeout.
TEARDOWN_MARGIN_SECONDS = 30
# > 0, so a timeout derived from an already expired deadline stays a short, valid timeout.
MINIMUM_WAIT_SECONDS = 5
# Matches the former fixed waits' polling, far below every backstop.
POLL_SECONDS = .01


def remaining_seconds(deadline, *, clock=time.monotonic):
    """Seconds left before an absolute monotonic deadline, never below MINIMUM_WAIT_SECONDS."""
    return max(MINIMUM_WAIT_SECONDS, deadline - clock())


def report_failure(message, *, stream=None):
    """Write a wait failure to stderr before raising, so a later kill cannot hide it."""
    stream = sys.stderr if stream is None else stream
    stream.write(message + '\n')
    stream.flush()
    return AssertionError(message)


def wait_until(predicate, description, *, backstop, stopped=None, gone=None, liveness=None,
               deadline=None, poll=POLL_SECONDS, clock=time.monotonic, sleep=time.sleep, stream=None):
    """Wait until `predicate()` holds; return True then.

    Return False without raising once `stopped()` is true, which hands control back to the
    caller's own post-wait assertions. When `gone()` reports a producer gone (a non-empty
    description; falsy while every producer lives), the predicate is checked once more and
    wins; otherwise this raises within one poll. Without either, this raises only after
    `backstop` seconds, or earlier at the absolute monotonic `deadline` if that comes first.
    Every failure message names the awaited signal, the elapsed time and, through
    `liveness()`, the producers' state, and is flushed to stderr before raising.
    """
    started = clock()
    limit = started + backstop if deadline is None else min(started + backstop, deadline)

    def fail(reason):
        state = liveness() if liveness is not None else 'not tracked'
        elapsed = clock() - started
        return report_failure('fixture wait failed: ' + description + ': ' + reason
                              + ' after ' + format(elapsed, '.2f') + ' s; producers: ' + str(state),
                              stream=stream)

    while True:
        if predicate():
            return True
        if stopped is not None and stopped():
            return False
        if gone is not None:
            report = gone()
            if report:
                # The signal may have appeared just before its producer exited.
                if predicate():
                    return True
                raise fail('producer gone: ' + str(report))
        if clock() >= limit:
            capped = deadline is not None and deadline < started + backstop
            raise fail(('deadline cap reached' if capped else 'backstop expired')
                       + ' (backstop ' + format(backstop, 'g') + ' s)')
        sleep(poll)
