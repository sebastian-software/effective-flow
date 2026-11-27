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

### Waits for work started during a run

This section covers tests, builds and other work that the thread or its native sub-agents start
during a run. Launched T3 threads keep `t3_thread_wait`, and PR waits keep the rules in "When a run
needs its own thread"; `Monitor` and background waits are not PR waits.

A native sub-agent brief that the maintainer or the owning thread writes by hand carries the rule
below. Shipped worker briefs follow their `src/` contracts; a gap there goes to a separate `src/`
issue, never into an edit of the build under test during a run. The rule covers sub-agent briefs,
not the launch prompt.

The rule has three cases. The first applies to sub-agents and the owning thread alike. The second
and third apply to the owning thread only; a sub-agent's own `Monitor` or background command counts
as a wait it may not start:

- a bounded command whose result is needed in the same turn runs directly in the foreground, and
  the tool returns its result. Bounded means expected to finish within the foreground tool timeout.
  Claude Bash defaults to 120000 ms, so a longer bounded command passes an explicit `timeout`, at
  most 600000 ms. Longer work goes to the owning thread's background wait or is handed back;
- a managed background command runs through Claude Bash `run_in_background`, and `Monitor` is only
  for a run that has to react to a stream of events, not for one completion;
- the T3 thread that owns the task and can resume from it loads `t3_background_wait` with
  `ToolSearch` by that unqualified name, whatever prefix the host adds to it, passes the returned
  task ID in `taskIds`, ends its turn and resumes on the task's completion notification. Only work
  that ends on its own is registered, never a dev server or a watcher. A wait that is no longer
  needed is cleared by passing the same `taskIds` with `waiting: false`; the call does not stop the
  task, which is stopped separately.

A native sub-agent is not reliably woken by background work it started, so it starts no background
work it would have to wait for. It runs bounded work in the foreground, or hands back to the owning
thread a command it has not started, together with what to check. The owning thread starts that
command, registers it and waits, so it is the only waiter and a sub-agent never waits next to it.

Shell polling loops and detached helper processes are no substitute for a wait: no repeated `sleep`,
`read -t` or status checks, and no `&`, `nohup` or `tail -f` keep-alive. In one manual run several
sub-agents polled completion markers with `read -t 10 < <(tail -f /dev/null)`; each timeout left a
`tail` process running, and these piled up although a `Monitor` already ran for the same test run.
When the native wait is unavailable, report the blocker instead of improvising one.

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
