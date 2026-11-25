# T3 acceptance runs

This guide is for maintainers who run manual Effective Flow acceptance runs on T3 Code, such as the
three `merge-gate` PR-watch runs that issue #635 required: an interactive run with running checks,
a run with a pending configured bot, and a non-interactive run whose wake arrives after the turn
ended. It records how to set such a run up, so the executing thread is intended, announced and
linked, and so reported durations are true. A later follow-up run (run 3 on
sebastian-software/sf-test-repo#14) ran in a separate top-level thread that was launched without
announcement and not linked from the parent thread; only its title was set.

## When a run needs its own thread

A run needs its own top-level thread when its acceptance requires the executing thread to call
`watch_pull_request`, end its turn and be woken later (a non-interactive `merge-gate` run, or an
inline run that watches), or when it must start without the parent thread's watch or approval
state.

Two other mechanisms cannot do this:

- `delegate_task` children never watch, even if the brief says to babysit.
- A native sub-agent (Claude `Agent`) cannot end its turn and be woken later by a PR watch.

`t3_thread_launch` is the way to get such a thread. It always creates an unlinked top-level thread;
the tool has no parent or origin field. Every other acceptance step stays in the current thread or
in a delegated child.

The host rule allows `t3_thread_launch` only when the user asks for a new thread. A maintainer's
request for an acceptance run that this guide marks as needing its own thread counts as that
request, even without the words "new thread".

## Before launching

Print one visible line in the parent thread before launching. It names the run, why it needs a
top-level thread, and the thread title. This line is required even when the maintainer did not ask
for a new thread.

The title follows `<tool> run <n> (<mode>) <owner/repo>#<pr>`, for example
`merge-gate run 3 (non-interactive) sebastian-software/sf-test-repo#14`.

## Launch prompt

The launch prompt contains:

- the parent thread's `link`, verbatim;
- the skill build under test, as version and commit;
- the run state and any no-answers instruction (for a non-interactive run);
- the test PR;
- where the evidence goes (the issue or PR);
- the request that the launched thread report its own `link` and its result.

The launched thread must not launch further threads for the same run.

## Linking both ways

Right after the launch, the parent thread prints the launched thread's `link` verbatim; a thread is
named by its `link` in replies, never by title or id alone. The launched thread's prompt carries the
parent's `link`, so each thread names the other. The recorded evidence names both threads.

## Waiting and timing

Wait with `t3_thread_wait`. A return with `timedOut: true` states no elapsed time: in the
sf-test-repo#14 session two waits that requested 600000 ms each returned `timedOut: true` after
about 45 seconds, and the agent reported "ten minutes" and "over 20 minutes" although about 1.5 minutes had passed.

Report every duration from host timestamps only: thread `createdAt` and `updatedAt`, run
`startedAt` and `completedAt`, PR check completion times and wake times. Never derive a duration
from a requested timeout or an estimate.

## Recording evidence

Record the evidence on the issue or PR, as #635 did. For each run:

- the thread link or links;
- the PR;
- the run state (`interactive` or `non-interactive`) and the scenario under test;
- the skill build (version and commit);
- UTC timestamps of suspend, turn end, wake and result;
- deviations from the intended setup.

## Known host gap

`t3_thread_launch` has no origin field, so the link lines in the prompt and in the parent thread are
the only relationship between the threads. A T3 thread type that is linked to its parent yet may
watch, or an origin field on `t3_thread_launch`, would be a host feature request and is out of scope
here.
