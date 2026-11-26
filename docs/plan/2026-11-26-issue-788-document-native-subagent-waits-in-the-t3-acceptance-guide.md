# Document native subagent waits in the T3 acceptance guide

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Documentation (`effective-flow docs`)
**Doc category:** developer-guide
**Target path:** docs/developer-guide/t3-acceptance-runs.md
**Issue:** #788

## Requirement

The T3 acceptance-run guide (`docs/developer-guide/t3-acceptance-runs.md`) tells a thread how to
wait for a launched T3 thread (`## Waiting and timing`, lines 59–67), but it says nothing about
waiting for tests, builds and other work that a thread or its native Claude sub-agents start
during a run. During a manual run several Claude sub-agents polled completion markers with
`read -t 10 < <(tail -f /dev/null)`. Each timeout left a `tail` process running, and these
processes piled up although a `Monitor` was already running for the same test run.

Goal: the guide states one wait rule for work started inside a run. The rule belongs in every
native sub-agent's brief. It sends a bounded command whose result is needed in the same turn to a
direct foreground call. A managed background command goes to Claude Bash `run_in_background`, and
`Monitor` is used only for a stream of events. The owning T3 thread registers the task with
`t3_background_wait` and resumes on the task's completion notification. A sub-agent that cannot
receive that wake hands the wait back to the owning thread. Shell polling loops and detached helper
processes are explicitly ruled out, and an unavailable native wait is reported as a blocker.
`t3_thread_wait` stays the wait for launched T3 threads, and the existing top-level PR-watch rules
stay unchanged. One bounded background test verifies the guidance.

Workflow rationale: the change touches only developer documentation under
`docs/developer-guide/`, with no product, prompt or code behaviour, so it is `Documentation`. The
target is the existing guide named by the issue; this plan extends it and creates no new document.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #788.
**Original outcome:** the T3 acceptance-run guide contains a verified wait rule for work started during a run, without changing shipped `src/` behaviour, the launched-thread wait or the PR-watch rules.
**Last evaluated attempt:** none; this is the first plan for the outcome.
**No-progress count:** 0
**Cumulative approach:** one developer-guide edit (`t3-acceptance-runs.md` plus its index entry) and one bounded background test recorded in this plan.
**Continuation decision:** none.

## Architecture decisions

- **Guide-only change; shipped prompts stay unchanged.** The archived plan that created the guide
  (`docs/plan/archive/2026-11-25-t3-acceptance-run-guide.md`, lines 33–40 and 125) keeps it a
  developer-guide page with no `src/` change. AGENTS.md says a contract is stated once, in its
  owner. The wait rule here is maintainer procedure for manual T3 runs, so the guide owns it.
  Shipped fragments also may not name Claude-only parameters such as `run_in_background`: the
  build's harness leak guard rejects them for the Codex and portable targets
  (`docs/developer-guide/architecture.md:139-147`).
- **Placement: one new `###` subsection at the end of `## Waiting and timing`.** The issue links to
  the `#waiting-and-timing` anchor. A subsection keeps that anchor and the guide's seven `##`
  headings, which the archived plan's acceptance checks with `grep '^## '`. Both existing
  paragraphs stay above it unchanged: the `t3_thread_wait` paragraph for launched threads and the
  host-timestamp duration rule, which also covers in-run waits.
- **PR waits stay with their owners.** PR waits keep the rules in `## When a run needs its own
  thread` (lines 11–29) and the shipped host contract (`src/shared/host-pr-watch.md:21`, which
  forbids `sleep`, polling and `Monitor` for PR waits). The new subsection is limited to tests,
  builds and other work started during a run. It says once that `Monitor` and background waits are
  not PR waits, and it does not restate the PR contract.
- **`t3_background_wait` semantics follow the host tool description.** The planning session's
  loaded schema has the required `taskIds` (1–20 strings) and an optional `waiting`. Its
  description says the tool keeps the thread in Working while background work runs, takes the task
  ID once the work has started, is not for work left running (dev server, watcher), is cleared by
  `waiting=false`, and does not stop tasks. The guide follows that: only work that ends on its own
  is registered, the wake is Claude Code's task completion notification, and an abandoned wait is
  cleared.
- **The verification runs in the implementing thread and is recorded in this plan** (decided by
  score, see "Decided by score"). The implementing `docs` run makes one bounded background test in
  the thread that owns the task. It records the real task ID, the completion notification and the
  result in this plan's Test results section, which ships archived with the delivery PR. If the
  run is a delegated sub-agent that cannot receive the wake, it reports a blocker. It never
  replaces the wait with a poll.

## Affected files

| File                                         | Description                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `docs/developer-guide/t3-acceptance-runs.md` | Add one `###` subsection at the end of `## Waiting and timing` with the in-run wait rule; existing lines stay unchanged. |
| `docs/developer-guide/README.md`             | Extend the guide's index entry (lines 82–84) so its content list also names waits for work started during a run.         |

## Implementation details

### Approach

1. In `docs/developer-guide/t3-acceptance-runs.md`, after line 67 and before
   `## Recording evidence`, add one subsection with a short descriptive heading, for example
   `### Waits for work started during a run`. Keep the guide's style: short sentences, prose
   paragraphs with at most one `;`-terminated list, inline backticks for tool and field names, no
   body links, lines wrapped at about 100 columns.
2. Open the subsection with its scope: tests, builds and other work that the thread or its native
   sub-agents start during a run. Launched T3 threads keep `t3_thread_wait`, and PR waits keep the
   rules in `## When a run needs its own thread`.
3. State the brief rule: a native sub-agent brief that the maintainer or the owning thread writes
   by hand carries the wait rule below. Shipped worker briefs follow their `src/` contracts; a gap
   there goes to a separate `src/` issue, never into an edit of the build under test during a run.
   The rule covers sub-agent briefs, not the launch prompt of `## Launch prompt`.
4. State the three cases. The first applies to sub-agents and the owning thread alike. The second
   and third apply to the owning thread only; a sub-agent's own `Monitor` or background command
   counts as a wait it may not start (step 5):
   - a bounded command whose result the sub-agent or thread needs in the same turn runs directly
     in the foreground, and the tool returns its result. Bounded means expected to finish within
     the foreground tool timeout. Claude Bash defaults to 120000 ms, so a longer bounded command
     passes an explicit `timeout`, at most 600000 ms. Longer work goes to the owning thread's
     background wait or is handed back;
   - a managed background command runs through Claude Bash `run_in_background`, and `Monitor` is
     only for a run that has to react to a stream of events, not for one completion;
   - the T3 thread that owns the task and can resume from it loads `t3_background_wait` with
     `ToolSearch` by that unqualified name, whatever prefix the host adds to it, passes the
     returned task ID in `taskIds`, ends its turn and resumes on the task's completion
     notification. Only work that ends on its own is registered. A wait that is no longer needed
     is cleared by passing the same `taskIds` with `waiting: false`.
5. State the hand-back (decided by score): a native sub-agent is not reliably woken by background
   work it started, so it starts no background work it would have to wait for. It runs bounded
   work in the foreground, or hands back to the owning thread a command it has not started,
   together with what to check. The owning thread starts that command, registers it and waits.
   The guide names no hand-back of a task ID a sub-agent already started, since nothing shows the
   owning thread can register or be woken by such a task.
6. State the prohibition and cite the incident from the Requirement once: shell polling loops
   (repeated `sleep`, `read -t` or status checks) and detached helper processes (`&`, `nohup`, a
   `tail -f` keep-alive) are no substitute for a wait. When the native wait is unavailable, the
   thread reports the blocker instead of improvising one.
7. In `docs/developer-guide/README.md`, extend the index entry's content list (lines 82–84) by
   one phrase such as "waits for work started during a run". The entry's other wording stays
   unchanged.
8. Format the two changed docs with the project formatter and run `pnpm agent:check` through the
   T3 project runner (`t3-project`, per the host instructions). Do not run oxfmt on the host
   directly.
9. Run the bounded background test as decided (see Validation plan) after `docs` Phase 3
   validation and before Phase 4 writes `## Test results`, switches the status, archives and
   commits the plan (`src/tools/docs.md:312-328`). The `docs` orchestrator runs it inline in its
   own T3 thread and says so in one visible line: the step is bound to the run because native
   workers cannot receive the wake. It is never part of the brief of the doc agent (spawn site
   `docs/implementation`) or of `code-validator` (`docs/validation`). When the orchestrator ends
   its turn to wait, that turn's last message is a non-final status naming the task ID and saying
   the run continues on the notification.
   - A run in its own top-level or launched T3 thread attempts it (decided by score).
   - A `docs` run started as a native `Agent` sub-agent or as a `delegate_task` child does not
     attempt the test and records the blocker straight away.

   Record the evidence under `## Test results` of this plan, or record the blocker. On a blocker
   (decided by score): under the Automation caller's scored decision mode the run records the
   blocker, the PR stays a draft by construction (`Draft: requested`), and the blocker pushes no
   implementation work. A manual run without scored mode that cannot receive the wake stops before
   the Phase 4 delivery handback and reports the blocker, so the plan stays Not implemented and no
   PR is made ready.

### Component structure

Not relevant: documentation-only change.

### State management

Not relevant: no runtime or configuration state changes.

### API integration

Not relevant: the guide names host tools (`t3_background_wait`, `Monitor`, `ToolSearch`), but no
integration code changes.

### Styling approach

Not relevant: Markdown only, formatted by the project formatter.

### Accessibility

Not relevant: no user interface.

### Edge cases

- **No native wait available** (no `t3_background_wait`, no completion notification, a non-T3 or
  non-Claude host): the guide says to report the blocker; neither the guide nor the verification
  falls back to polling.
- **Work left running** (dev server, unbounded watcher, `Monitor` without a known end): it is not
  registered with `t3_background_wait`, as the host tool description says.
- **Abandoned or superseded wait**: it is cleared by passing the same `taskIds` with
  `waiting: false`. `t3_background_wait` does
  not stop tasks, so a task that is no longer needed is stopped separately.
- **Duplicate waiters**: the incident had sub-agents polling while a `Monitor` already ran for the
  same test run. The rule makes the owning thread the only waiter, so a sub-agent never waits next
  to it.
- **PR waits**: unchanged. `Monitor`, `run_in_background` and `t3_background_wait` are not used
  for a PR wait.
- **Existing overlong line 63**: unrelated to this change and left as it is.

## Acceptance criteria

- [ ] `grep '^## ' docs/developer-guide/t3-acceptance-runs.md` prints the same seven headings in
      the same order as on the base, and exactly one new `### ` heading lies between
      `## Waiting and timing` and `## Recording evidence`.
- [ ] `git diff -- docs/developer-guide/t3-acceptance-runs.md` contains no removed lines; the
      existing text, including both existing `## Waiting and timing` paragraphs and
      `## When a run needs its own thread`, is unchanged.
- [ ] The new subsection contains each of these, checkable by reading or grepping it: the rule
      that a hand-written native sub-agent brief carries the wait rule, with shipped worker briefs
      left to their `src/` contracts; the definition of a bounded command by the foreground tool
      timeout, with an explicit `timeout` above the 120000 ms default; foreground execution of a
      bounded command whose result is needed in the same turn; `run_in_background` and `Monitor`
      (limited to event streams) as owning-thread tools only; `ToolSearch`, `t3_background_wait`, `taskIds` and the completion
      notification; the hand-back to the owning thread; the explicit exclusion of shell polling
      loops and detached helper processes; reporting a blocker when the native wait is
      unavailable; `t3_thread_wait` kept for launched T3 threads; PR waits left to the existing
      rules.
- [ ] The `docs/developer-guide/README.md` index entry for the guide names waits for work started
      during a run, and its other wording is unchanged.
- [ ] `git diff --name-only` against the base lists only the two affected docs plus this plan
      file (or its archived copy); nothing under `src/`, `test/`, `evals/` or `AGENTS.md` changes.
- [ ] `pnpm agent:check` exits 0.
- [ ] This plan's `## Test results` records one bounded background test run by the T3 thread
      that owns the task (top-level or launched): the real task ID; the host timestamps of the
      suspended turn's end and of the wake, read from the host and not from a shell clock, with
      the wake later than the turn end; the command result; and the marker-filtered process counts
      (at least 1 while running, back to the baseline after completion). If the run cannot
      receive the wake, it instead records the blocker, handled as Approach step 9 describes. Under
      scored mode the PR then stays a draft until a maintainer reruns the same test in a top-level
      T3 thread and records the evidence on the PR (decided by score).

## Validation plan

- Run `pnpm agent:check` through `t3-project`.
- Check headings with `grep -n '^##' docs/developer-guide/t3-acceptance-runs.md`, and check for
  removed lines with `git diff --stat` and `git diff -- docs/developer-guide/t3-acceptance-runs.md`.
- Grep the new subsection for `t3_background_wait`, `taskIds`, `ToolSearch`,
  `run_in_background`, `Monitor` and `t3_thread_wait`. Then read it against acceptance criterion 3.
- Run `git diff --name-only <base>...HEAD` to confirm the file scope.
- Bounded background test, run by the T3 thread that owns the task, top-level or launched
  (Approach step 9):
  1. Load `t3_background_wait` with `ToolSearch` before starting anything, so that registering
     the task later is a single call.
  2. Choose a unique marker for this test (for example `bg-788-<nonce>`). Record the baseline
     count with a pattern that does not match its own shell, for example
     `pgrep -fc '[b]g-788-<nonce>'`. Claude Code has no persistent session shell, and `read -t` is
     a shell builtin with no process of its own, so the check counts by marker and never diffs a
     host-wide process list.
  3. Start one command that ends on its own, carries the marker and runs well beyond one turn's
     latency (for example `sleep 60; echo bg-788-<nonce>`) with Claude Bash `run_in_background`,
     and note the returned task ID. Count the marker once while it runs: at least 1 shows the
     check can see the task. This is a visibility check, not a wait.
  4. Pass the task ID to `t3_background_wait` in `taskIds`, make no other waiting call, and end the
     turn with the non-final status from Approach step 9.
  5. Resume on the completion notification. Read both timestamps from the host, for example with
     `t3_thread_read` on the own thread: the suspended turn's run `completedAt` as the turn end,
     and the woken run's `startedAt` or the notification's own timestamp as the wake. A wake that
     is not later than the turn end makes the attempt void; repeat it and never count it as a
     pass. Record the command result. Confirm that the thread left Working, or clear it by
     passing the same `taskIds` with `waiting: false` and say so; whether it clears on its own is
     not verified.
  6. Count the marker again. The check passes when the count is back to the baseline. Report the
     host-wide `pgrep -c -f 'tail -f /dev/null'` count only as a noisy secondary signal, never as
     the pass condition, since other sessions on a shared host change it. Record only these
     counts, never raw `ps` or `pgrep -a` output, because the plan ships in a public PR and a
     host-wide listing can expose other sessions' command lines.
  7. If the run cannot receive the wake (it runs as a native `Agent` sub-agent or a
     `delegate_task` child, or the tool or the notification is missing), record the blocker and do
     not poll; Approach step 9 says how the run then ends. A maintainer reruns steps 1–6 in a
     top-level T3 thread, records the evidence on the PR as the guide's `## Recording evidence`
     section describes, and only then marks it ready.
- No distribution source changes, so the CI order from AGENTS.md (`pnpm test`, `node build.mjs`,
  `pnpm test:distribution`) is not required locally; CI runs it on the PR.

## Assumptions and open points

- `t3_background_wait` behaviour was checked only against the host tool description and schema
  loaded in the planning session; the T3 version is unknown, and the issue cites T3 Code 0.1.11.
  The implementing run checks the tool schema it loads before writing the guide text and reports
  any difference.
- Scope is Claude Code on T3, as the issue describes. Codex and portable hosts have no such
  guidance in this change.
- The target is an existing document the issue names. This is an explicit extension, not a
  doc-target slug collision, and it overwrites no content.
- Editing these two docs creates no behavioural-eval evidence debt: a grep shows that no
  `evals/*/suite.config.mjs` loads `docs/developer-guide/t3-acceptance-runs.md` or its README
  (assumption, based on that grep).
- `AGENTS.md:39` stays one sentence and unchanged, as the archived guide plan requires.
- Shipped worker briefs under `src/` are out of scope. The guide change covers briefs that a
  maintainer or an owning thread writes by hand. Shipped workers already forbid polling loops for
  progress (`src/shared/subagent-progress.md:109`) and for PR waits
  (`src/shared/host-pr-watch.md:21`). If the incident came from a shipped worker contract, that
  needs a separate `src/` issue.
- The guide's intro (lines 3–9) and `AGENTS.md:39` keep describing the guide as being for runs that
  must watch a PR and be woken. The new subsection opens with its own scope sentence, so the
  intro stays unchanged on purpose.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->
```json
[{"site": "S-CLR", "question": "How is the issue's bounded background verification performed, and where is its evidence recorded?", "options": ["Run in implementing thread, record in plan", "Run in implementing thread, comment on issue", "Separate manual maintainer acceptance", "Embed as worked example in guide", "Decide later"], "escape": ["Decide later"], "scores": [{"label": "Run in implementing thread, record in plan", "score": 8, "reason": "Keeps the verification inside the delivery: evidence ships in the draft PR plan Test results, matching the guide's issue-or-PR rule and the autopilot flow; a delegated run without the wake stops with a blocker instead of polling."}, {"label": "Run in implementing thread, comment on issue", "score": 4, "reason": "Same execution as option 1, but no authority for an unattended autopilot run to post issue comments is established, and the evidence would sit outside the reviewed PR."}, {"label": "Separate manual maintainer acceptance", "score": 6, "reason": "Robust because a top-level T3 thread can actually receive the wake, but it moves the requested verification out of the delivery and leaves the PR without acceptance evidence."}, {"label": "Embed as worked example in guide", "score": 3, "reason": "Puts run-specific task IDs into the guide as history, which the repository's prompt-text rules discourage, while the guide already places evidence on the issue or PR."}]}, {"site": "S-BAT", "question": "Who completes the verification when the bounded background test records a blocker instead of evidence?", "options": ["Maintainer reruns test before ready", "Follow-up verification issue", "Draft without named owner", "Decide later"], "escape": ["Decide later"], "scores": [{"label": "Maintainer reruns test before ready", "score": 8, "reason": "Keeps the verification #788 requires as the condition for marking the PR ready, consistent with the draft-on-blocker rule and the guide's issue-or-PR evidence rule, in a top-level thread that can receive the wake."}, {"label": "Follow-up verification issue", "score": 4, "reason": "Refs keeps #788 open, but the PR could become ready without the required task ID, notification and result, contradicting the draft criterion and splitting verification into a separate tracker item."}, {"label": "Draft without named owner", "score": 2, "reason": "Honors the draft rule but leaves the verification unowned, so the PR can stall indefinitely with nothing closing the evidence gap."}]}, {"site": "S-BAT", "question": "What may a native sub-agent hand back to the owning thread?", "options": ["Only an unstarted command", "Also a started task ID, test extended", "Both, task ID labelled unverified", "Decide later"], "escape": ["Decide later"], "scores": [{"label": "Only an unstarted command", "score": 9, "reason": "The only variant the bounded test covers without an unproven host capability: the owning thread starts, registers and is notified for its own task; its edge over the next option is that it claims nothing about adopting a sub-agent's task."}, {"label": "Also a started task ID, test extended", "score": 4, "reason": "Rests on a capability nothing documents and widens the single bounded test into host investigation, so a failed extension stalls the delivery."}, {"label": "Both, task ID labelled unverified", "score": 3, "reason": "Puts an unverified hand-back path into a maintainer guide, inviting sub-agents to start tasks that may wake no one."}]}, {"site": "S-DEC", "question": "Which threads may run the bounded background test?", "options": ["Top-level or launched T3 thread only", "Keep step 9, evidence names thread kind", "Top-level thread only", "Decide later"], "escape": ["Decide later"], "scores": [{"label": "Top-level or launched T3 thread only", "score": 9, "reason": "Removes the contradiction and matches the evidence: a launched thread is top-level and can receive the wake, while delegate_task children never watch and native Agent sub-agents are not reliably woken; its edge over top-level only is not excluding launched threads."}, {"label": "Keep step 9, evidence names thread kind", "score": 3, "reason": "Lets a delegate_task child attempt the test although nothing shows it receives Claude task-completion wakes, keeping an unproven path."}, {"label": "Top-level thread only", "score": 7, "reason": "Safe and consistent with criterion 7, but excludes a launched thread that is top-level by construction and can receive the same wake."}]}, {"site": "S-DEC", "question": "What keeps the PR from becoming ready, and the plan from shipping as Implemented, when the test records a blocker?", "options": ["Stop before delivery on blocker", "Draft by scored mode, manual stops", "Deliver with blocker recorded", "Decide later"], "escape": ["Decide later"], "scores": [{"label": "Stop before delivery on blocker", "score": 6, "reason": "Simple and covers both run modes, but gives up the decided draft-until-rerun path and adds a new stop that scored mode already provides."}, {"label": "Draft by scored mode, manual stops", "score": 8, "reason": "Scored mode already keeps the PR a draft by construction, so the decided flow needs no new mechanism; its edge over option 1 is that the manual stop applies only where no such guarantee exists."}, {"label": "Deliver with blocker recorded", "score": 2, "reason": "The plan would ship archived as Implemented with an unverified rule and could be made ready, guarded only by a manual move back to draft."}]}]
```
<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         3 |    4 |
| Testability     |        0 |         4 |    0 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    1 |

### Findings

- Scope, Important: the brief rule read as if it applied to shipped worker briefs, which a
  maintainer cannot change during a run. Incorporated: Approach step 3 and acceptance criterion 3
  limit it to hand-written briefs and send gaps in shipped contracts to a separate `src/` issue.
- Testability, Important: the process check relied on a persistent session shell and a host-wide
  process diff, which Claude Code does not provide and a shared host makes noisy. Incorporated:
  the validation plan filters by a unique marker in the test command and by the
  `tail -f /dev/null` count.
- Error cases, Important: the inline test lacked a phase position, the visible inline line the
  delegation mandate requires, and a non-final turn-end status. Incorporated in Approach step 9.
- Error cases, Note: "bounded" was undefined. Incorporated: bounded means expected to finish
  within the foreground tool timeout; longer work goes to the owning thread's background wait or
  is handed back.
- Data protection, Note: raw process listings could expose other sessions' command lines in a
  public PR. Incorporated: only the marker-filtered results are recorded.
- Maintainability, Note: "delegated sub-agent" was ambiguous between a native `Agent` and a
  `delegate_task` child. Incorporated: Approach step 9 separates the cases.
- Deep review, Testability, Important: a 7-second test command could finish before the turn
  ended, so the wake would never resume a suspended turn. Incorporated: `t3_background_wait` is
  loaded first, the command runs for about 60 seconds, and a wake not later than the turn end
  voids the attempt.
- Deep review, Testability, Important: the marker check matched its own shell and never showed it
  could see the task; the host-wide `tail` count was noisy. Incorporated: a self-excluding
  pattern, a visibility count while running, baseline comparison, and the `tail` count reported
  only as a secondary signal.
- Deep review, Testability, Important: the source of the turn-end timestamp was unnamed.
  Incorporated: both timestamps are read from the host after the wake (run `completedAt` and
  `startedAt` or the notification time), never from a shell clock.
- Deep review, Error cases, Important: criterion 7 said top-level only while Approach step 9 also
  admitted launched threads and `delegate_task` children. Decided by score: a top-level or
  launched T3 thread runs the test; a native `Agent` sub-agent or `delegate_task` child records
  the blocker.
- Deep review, Error cases, Important: nothing enforced the draft state on the blocker path.
  Decided by score: under scored mode the PR is a draft by construction and the blocker pushes no
  implementation work; a manual run stops before the Phase 4 delivery handback.
- Deep review, Error cases, Note (three items): clearing a wait needs the same `taskIds`; the
  120000 ms Bash default needs an explicit `timeout` for longer bounded commands; the background
  cases apply to the owning thread only. Incorporated in Approach step 4 and the edge cases.

## Open points

- No open points.
