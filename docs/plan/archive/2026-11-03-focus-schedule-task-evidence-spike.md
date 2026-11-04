# focus schedule_task evidence spike: T3 Code with the Codex harness

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Documentation (`effective-flow docs`)
**Doc category:** developer-guide
**Target path:** docs/developer-guide/focus-schedule-evidence.md

## Requirement

This plan implements WP0 of issue #613. The approved planning comment there makes WP0 a precondition: the opt-in follow-up mode of `focus` (WP1) may only be built after this spike records `**Decision: go**`. The follow-up design rests on T3 Code `schedule_task` behaviour that this repository has never observed. The spike replaces those assumptions with point-in-time evidence, and its decision gates WP1.

Roles:

- **Observer (O):** a top-level T3 Code thread on the Codex harness that creates a `schedule_task` bound to itself, as a follow-up `focus` run would.
- **Target (T):** a throwaway top-level thread that O reads.
- **Spike orchestrator:** the `effective-flow docs` session that runs this plan. It is neither observer nor target, and reads both only through `t3_thread_read`.

The spike answers twelve questions:

- **S1 Prior context.** Does a scheduled run bound to O see the prior thread context, including the previous run's checkpoint line?
- **S2 Handle.** Does the `scheduledTaskId` returned by `schedule_task` reach O's conversation?
- **S3 Prompt rewrite.** Can O rewrite the task's own prompt by that ID, and does the next run use the rewritten prompt?
- **S4 Self-deletion.** Does `delete_scheduled_task`, called from inside a scheduled run with its own handle, stop the task? Does the run continue after the call?
- **S5 Skill load.** In a timer-fired run, does a scheduled prompt starting with `version` (no prefix) load the installed skill? Does `$effective-flow version` load it?
- **S6 Observer identity.** Does a scheduled run receive O's own thread ID from `orchestrator_capabilities`? This is needed for focus's self and ancestor refusal.
- **S7 Paging across runs.** Does a `nextPosition` returned by `t3_thread_read` in one scheduled run stay usable as `afterPosition` in a later run?
- **S8 Harness identity.** How does a T3 session identify its harness (Codex or Claude) from host-provided data, without relying on the build target or the model's description of itself?
- **S9 Turn marking and provenance.** How do scheduled turns appear in O's `activity` and `messages` views compared with interactive turns: item type, `creationSource`, `createdBy`, `sourceThreadId`? Does the scheduled prompt appear as a user turn?
- **S10 Busy thread.** What happens when the schedule is due while O has an active turn?
- **S11 Mode, tools, and approvals.** Which runtime mode and tool set does a scheduled run receive, and which of its permitted calls require approval?
- **S12 Context growth.** How much does one proxy tick add to O's transcript?

The questions and their no-go rules come from the #613 planning comment. The spike ends with one decision line, the measured values, and the WP1 wordings each observation changes. Workflow: Documentation, because the deliverable is a developer-guide evidence page with no product or code change.

## Outcome checkpoint

**Primary source:** sebastian-software/effective-flow#613 (WP0)
**Original outcome:** Recorded T3/Codex `schedule_task` evidence with an explicit go/no-go that gates the WP1 build of the `focus` follow-up mode.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** an operator-assisted spike with throwaway top-level Codex threads and a dated evidence page
**Continuation decision:** none

## Architecture decisions

- **Top-level throwaway threads, created by the operator, in `approval-required`.**
  - The operator opens two new top-level T3 Code threads on the Codex harness: O and T. Both are named with the `<run-id>` prefix, run in `approval-required`, and hold no real work.
  - `run_scheduled_task_now` is not used, because it needs a full-access or default caller.
  - The spike orchestrator's own thread, and every other operator thread, is never read from, scheduled into, or sent to.
- **Target register.**
  - The operator gives the orchestrator O's and T's links. The orchestrator registers each one only after a metadata read confirms the `<run-id>` name prefix and the Codex `providerInstanceId`. It never lists threads.
  - The register also holds every scheduled task the spike creates (pseudonyms `H1`, `H2`, with real IDs kept only in the register), and every pause, resume, rewrite, and deletion.
  - Before every read, schedule action, and pasted prompt, the orchestrator checks that the thread or task is in the register. After step 3, the operator scripts carry H1's registered real ID explicitly.
- **Operator executes, orchestrator reads.**
  - The orchestrator fills the templates under "Operator scripts" with registered values and stores them as numbered scripts in the evidence root. The operator pastes each script into O or T.
  - The orchestrator collects evidence through `t3_thread_read` on registered threads, waits between reads with `t3_thread_wait` on registered threads only, and receives the operator's UI notes.
  - It never calls `schedule_task`, `delete_scheduled_task`, or `list_scheduled_tasks`, so every schedule belongs to O. The listing tool could also return tasks outside the spike.
- **Approvals.** The operator approves only these permitted calls and denies everything else. Each approval needed for a permitted call is recorded as an S11 fact:
  - O's reads of registered O or T;
  - `orchestrator_capabilities`;
  - pause, resume, rewrite, or delete of the registered handle;
  - read-only reads of the installed Effective Flow skill files during the H2 runs;
  - T's fixture turn.

  WP1 then needs an observer mode in which the tick's permitted calls run without approval.

- **Host data before self-report.**
  - Answers come from host-provided data wherever it exists: O's thread metadata (`runtimeMode`, `providerInstanceId`, and `recentRuns` with `runLimit` ≥ 1), item fields in the `activity` and `messages` views, and named host tools.
  - A model statement is labelled "self-report". A self-report alone never satisfies a no-go question.
- **Nonces and revision tags.**
  - Every probe run makes up a fresh eight-character nonce itself, without any tool call, and emits it on its checkpoint line before any other action.
  - Each prompt revision carries a tag (`rev2`, `proxy`, `delete`) that the run repeats.
  - S1 holds if two conditions are both met:
    - the nonce first appears in O's activity view in an item of run n (`assistant_message` or `reasoning`), and in no `user_message`, task prompt, or tool result before run n+1 quotes it;
    - run n+1 quotes it.
  - S3 holds if the run after a rewrite repeats the new tag.
- **Control turns and intervals.**
  - Every spike task uses a 180 s interval and is created with `enabled: false`.
  - Interactive turns in O while a task is active are allowed only as control turns: turns that only pause, resume, rewrite, or delete. The operator starts each one immediately after a scheduled run has finished. Any deferred fire during a control turn is recorded as an S10 side observation and counted against the budget.
  - All other interactive turns in O happen only while every spike task is paused. The exception is step 5, which tests that case deliberately.
  - Every stored schedule, including the `dedupe` defaults, is recorded from the tool result.
- **Proxy tick (S12).** T's fixture is one turn producing ten assistant paragraphs of about 2,000 characters each, with no tool calls. From its own read of T, the orchestrator records P0, the position just before those paragraphs. The proxy tick does:
  - one state read of T (`view: activity`, `limit: 3`, `maxCharsPerItem: 256`, `runLimit: 1`);
  - one page read of T (`view: activity`, `limit: 10`, `maxCharsPerItem: 1500`, `afterPosition: P0`);
  - one checkpoint line.

  Growth per tick is the full item text in O's `activity` view after the tick's start position. It is read with `maxCharsPerItem` at least the item length, or continued with `textOffset`. The `messages`-only total is reported separately. If the served page is short of 10 × 1,500 characters, S12 is labelled "partial". The spike publishes the measured values only; the #613 planning re-run derives the loop cap and quiet-tick budget from them.

- **Pseudonyms, not values.**
  - Raw excerpts replace IDs with stable pseudonyms (`O`, `T`, `H1`, …).
  - `observations.md` in the evidence root records every equality check as match or mismatch:
    - for S2–S4: creation result = rewritten prompt = run checkpoint = deletion argument;
    - for S6: identity result = O.
- **Evidence root in the primary checkout.** `<RUNTIME_STATE_ROOT>/.effective-flow/spikes/focus-schedule/<run-id>/` of the main worktree, gitignored by `.gitignore:7` and untracked. It holds the scripts, register, excerpts, `observations.md`, UI notes and screenshots, and a digest manifest.
- **Publication and redaction.** As in the 2026-11-02 spike, the evidence page publishes no thread or task IDs, links, titles, raw content, or user paths. Raw artifacts are cited by evidence-root path and SHA-256 digest.
- **Budget.**
  - Caps: 3 throwaway threads (O, T, one replacement); 5 scheduled tasks; 25 scheduled runs; 3 hours of wall time.
  - A run is one scheduled turn that appears in O.
  - Two runs are reserved for step 8. The S10 repeat is skipped if fewer than 6 unreserved runs remain.
  - Reaching any cap stops further steps, and the page reports the actual counts.
- **The 2026-11-02 evidence page stays unchanged** apart from one tail link, as for the session-shape observations.

## Measurement (orchestrator and operator, before the documentation phase)

This plan approves exactly these actions outside the documentation boundary:

- the operator opening, using, and archiving throwaway top-level threads, within the budget;
- O creating, pausing, resuming, rewriting, and deleting scheduled tasks from the operator scripts;
- the operator's approval answers under the permitted-call list;
- the orchestrator's `t3_thread_read` and `t3_thread_wait` calls on registered threads;
- everything below the evidence root.

The `effective-flow docs` orchestrator completes steps 1 to 9 of the approach before starting any documentation writer. No writer creates threads, schedules, or reads sessions. After step 9, the documentation phases write only the three files under "Affected files".

## Affected files

| File                                                                   | Description                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/developer-guide/focus-schedule-evidence.md`                      | New dated page `# focus schedule evidence (<date>)`. It holds the S1–S12 answers and `## Conclusions` with the decision line, plus the measured values, WP1 consequences, Limits, Retention, Budget, and Raw evidence digests. |
| `docs/developer-guide/focus-host-evidence.md`                          | One tail line linking the new page as a later dated addendum, in the form of the session-shape observations link at line 239.                                                                                                  |
| `docs/developer-guide/README.md`                                       | One entry next to the other focus evidence entries (lines 62–70).                                                                                                                                                              |
| `<RUNTIME_STATE_ROOT>/.effective-flow/spikes/focus-schedule/<run-id>/` | Untracked evidence root.                                                                                                                                                                                                       |

## Implementation details

### Operator scripts

The templates below use `{…}` placeholders that the orchestrator fills from the register. They are prompt texts the operator pastes, not code.

- **Checkpoint line.** Every probe run emits this line first, before any other action:

  `spike-probe {tag} | nonce={own 8-char nonce} | prev={quoted previous nonce or none} | handle={H} | pos={nextPosition or none}`

- **T fixture (in T).** "Write ten numbered paragraphs of about 2,000 characters each about any neutral topic. Use no tools."
- **Baseline (in O, interactive).** "Call `orchestrator_capabilities` and report the thread ID it returns. List the tools available to you. Call no other tool."
- **Create (in O, interactive).** The turn does three things:
  1. Create a scheduled task with `bindToCurrentThread: true`, `schedule: {type: interval, everyMs: 180000}`, `enabled: false`, and a placeholder prompt. Report the full tool result.
  2. Rewrite that task's prompt by the returned ID to the `rev2` probe. Report the result.
  3. Call no other tool.
- **rev2 probe (scheduled prompt).** The run does these steps in order:
  1. Emit the checkpoint line with tag `rev2`.
  2. Quote the most recent earlier `spike-probe` line visible in this conversation, or say "none".
  3. Call `orchestrator_capabilities` and report the thread ID.
  4. List the available tools, labelled self-report.
  5. Read T: `view: activity`, `limit: 3`, `afterPosition: {stored pos or omit}`. Report the returned positions and `nextPosition`.
  6. Call no other tool.
- **proxy probe.** Emit the checkpoint line with tag `proxy`, then do exactly the two reads defined under "Proxy tick (S12)".
- **delete probe.** Emit the checkpoint line with tag `delete`, then call `delete_scheduled_task` with `{H1}`, then report the result.
- **H2 prompts.**
  - First: `version` (no prefix).
  - After a rewrite: `$effective-flow version`.
- **Control turns (in O, interactive).** "Pause / resume / rewrite / delete task `{H}` as follows: {exact change}. Report the result, including any next run time. Call no other tool."

### Approach

1. **Setup snapshot.**
   - Record `git status --porcelain`, plus the T3, Codex, and model versions where they are visible.
   - Record the Effective Flow version installed for the Codex harness that O uses.
   - Record the current descriptions of `schedule_task`, `delete_scheduled_task`, `list_scheduled_tasks`, `t3_thread_read`, `t3_thread_wait`, and `orchestrator_capabilities`.
   - Confirm that the evidence root is ignored and untracked, then write the register.
2. **Create O and T.**
   - The operator opens O and T. The orchestrator registers them after verifying their metadata, recording mode, provider, and `recentRuns` (S8/S11 baseline).
   - T runs the fixture. The orchestrator waits until T's turn is finished, then records P0.
   - O runs the baseline. This gives the interactive comparison for S6, S8, S9, and S11.
3. **Create and rewrite (S2, S3).** O runs the create script. The orchestrator registers H1, fills the remaining scripts with H1's real ID, and records the stored schedule.
4. **Timer fires (S1, S6, S7, S8, S9, S11).**
   - A control turn resumes H1. Let two fires happen.
   - Between them, the operator adds one message to T, and the orchestrator waits until that turn is finished.
   - The orchestrator then reads O's `activity` and `messages` views and checks:
     - nonce provenance;
     - the identity result against O;
     - the scheduled-turn item fields against the interactive ones;
     - that the second run's read returned exactly the positions of the added message and nothing at or before the stored position.
   - The operator notes any UI marking. A control turn then pauses H1.
   - If the first read returned `nextPosition: null`, S7 is not observable.
5. **Busy thread (S10).**
   - The tool description predicts ("runs with no turn active") that the fire is deferred until O is idle.
   - In one interactive turn in O, resume H1, report the returned next run time, and then wait about four minutes using a primitive that needs no approval. Record the primitive.
   - While the fire is due, the orchestrator reads O's active-run state.
   - Record the number and timing of runs once O is idle (0, 1, or several; coalesced or caught up), interpreted against the stored `dedupe` settings, and whether the prediction held.
   - Repeat once if the budget allows. A control turn then pauses H1.
6. **Skill load (S5).**
   - O creates H2 with the unprefixed `version` prompt, a 180 s interval, and `enabled: true`. Let one fire happen.
   - A control turn rewrites H2 to `$effective-flow version`. Let one more fire happen.
   - A control turn deletes H2.
   - Loading counts as host-traceable when the run's output carries the exact installed version string and that string appears nowhere earlier in O's transcript, or when the activity view shows a read of the skill files. The unprefixed form runs first, so its result cannot be copied from context.
7. **Proxy growth (S12).** A control turn rewrites H1 to the `proxy` probe and resumes it. Let three fires happen and measure growth per tick as defined. A control turn pauses H1.
8. **Self-deletion (S4).**
   - A control turn rewrites H1 to the `delete` probe and resumes it.
   - After the deleting run, the orchestrator waits across at least two further intervals and confirms that no further scheduled run appears in O.
   - Record whether the run posted anything after its delete call.
9. **Cleanup and decision.**
   - The operator confirms in the T3 UI that no task created by the spike remains, deleting any leftover with a control turn in O. A screenshot or note of the empty task list goes into the evidence root with its digest.
   - The orchestrator confirms again that O receives no further scheduled run. The operator archives O and T, and the final counts are recorded.
   - Apply the decision rule and derive the WP1 consequences.
10. **Write.** Write the evidence page, the tail link, and the README entry, then run `pnpm agent:check`.

### Decision rule

| Question | No-go if                                                                                        | Otherwise changes in WP1                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1       | the nonce rule does not hold                                                                    | —                                                                                                                                                                  |
| S2       | handle absent                                                                                   | —                                                                                                                                                                  |
| S3       | the rewrite fails, or the next run does not repeat the new tag                                  | —                                                                                                                                                                  |
| S4       | the task keeps firing after the delete call, or the UI artifact still shows it                  | final notice before deletion, if the run was cut off after the call                                                                                                |
| S5       | neither form loads the skill                                                                    | the tick prompt's invocation form (with or without the `$effective-flow` prefix)                                                                                   |
| S6       | no identity from `orchestrator_capabilities`, or it differs from O                              | —                                                                                                                                                                  |
| S7       | the second read returns positions at or before the stored position, or misses the added message | —                                                                                                                                                                  |
| S8       | —                                                                                               | the gate-row harness matching rule                                                                                                                                 |
| S9       | —                                                                                               | tick detection and checkpoint provenance wording                                                                                                                   |
| S10      | —                                                                                               | the overlap rule                                                                                                                                                   |
| S11      | —                                                                                               | the tick allow-list wording and the required observer mode                                                                                                         |
| S12      | —                                                                                               | measured values only; the #613 planning re-run derives the cap and quiet-tick budget, keeping 24 h / 48 ticks labelled "uncalibrated" if growth was not observable |

`**Decision: go**` requires every no-go question to be observed without its no-go condition. These count as no-go:

- a no-go question that could not be observed;
- a no-go question answered only by self-report.

The page names each condition that led to the decision. The literal decision line appears exactly once on the page.

### Edge cases

- **A read, prompt, or schedule action targets an unregistered thread or task.** Stop before the call. This is the one unrecoverable mistake of the spike.
- **A task fires while it should be paused, or after cleanup was confirmed.** Record it. After cleanup, it is an S4 no-go. Delete the task with a control turn and confirm the deletion.
- **No timer fire arrives within three intervals.** Record it, repeat once within the budget, then record the question as not observable.
- **O turns out not to be on the Codex harness, or must be replaced.**
  - First delete every task bound to O from O itself, confirm silence across two intervals, archive O, and count its tasks against the cap.
  - Replace O once. If the replacement also fails, end the spike and write the page with `**Decision: no-go**`, the reason, and every question observed so far.
- **The wait in step 5 needs approval or is refused.** Use a shorter primitive that needs no approval, and record it. If no such primitive exists, record S10 as not observable.
- **A tool description changes during the spike.** Record both versions and repeat the affected questions.
- **A cap is reached.** Stop new steps, delete all tasks, and decide from what was observed. Any open no-go question is a no-go.
- **The evidence root is not ignored, or is tracked.** Stop before writing.

## Acceptance criteria

- [x] `docs/developer-guide/focus-schedule-evidence.md` answers each of S1–S12 as observed, observed with deviation, or not observable. Each answer gives its method, its evidence class (host data or self-report), its run count, and the versions recorded in step 1 (or "unavailable").
- [x] Under `## Conclusions`, the page carries the line `**Decision: go**` or `**Decision: no-go**`, derived by the decision rule. That literal string appears exactly once on the page. The page lists the measured S12 values and every WP1 wording that S4, S5, and S8–S11 change.
- [x] `observations.md` in the evidence root records a match or mismatch for every equality check in S2–S4 and S6, and the page cites it by digest.
- [x] The page contains no thread or task IDs, links, titles, raw session content, credentials, or user paths. It cites raw artifacts by evidence-root path and SHA-256 digest, and reports the thread, task, run, and wall-time counts and any register violation.
- [x] The evidence root holds the empty-task-list screenshot or note with its digest. The orchestrator's final read of O shows no scheduled run after the confirmed deletion, and O and T are archived.
- [x] `docs/developer-guide/focus-host-evidence.md` gains exactly one tail link line, and `docs/developer-guide/README.md` exactly one entry.
- [x] Compared with the step 1 snapshot, only the three affected files and this plan's own status change or archive move differ. No file under `src/`, `test/`, `evals/`, `build.mjs`, or `docs/concept/` changes, and `pnpm agent:check` passes.

The package is complete when all seven criteria hold together.

## Validation plan

- Check every answer on the page against the evidence-root excerpt it cites, and recompute two digests at random.
- Confirm that no no-go answer rests on self-report alone, and that the decision string appears exactly once.
- Before committing, search the page for strings shaped like IDs, URLs, links, or home paths.
- Confirm cleanup through the stored UI artifact and the orchestrator's final read of O.
- Run `pnpm agent:check` and compare `git status --porcelain` with the step 1 snapshot.

## Assumptions and open points

- The installed Effective Flow skill is the last release. That is enough for S5, which only checks loading and a version match.
- The page merges through a normal pull request on `develop` whatever the decision.
  - After a go, `effective-flow plan-issue 613` records the evidence commit, derives the loop cap and quiet-tick budget from the measured values, and transfers the changed WP1 wordings.
  - After a no-go, the same re-entry replans #613 instead.
  - This plan writes nothing to the tracker.
- The spike checks T3/Codex at a 180 s interval only. WP1 offers 5 minutes or more, so the 60 s schema minimum is not exercised. Claude-harness observers are out of scope, matching the #613 decision.
- Single observations of S1, S5, and S7 are stated under Limits. S10 is repeated once if the budget allows.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         2 |    0 |
| Testability     |        0 |         6 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Important, Testability.** Provenance and identity rested on the model's own report. _Incorporated:_ host data comes before self-report; S1 uses nonce provenance, S9 compares item fields, and S6 uses a host identity tool. No no-go answer rests on self-report alone.
- **Important, Testability.** The S12 fixture was too small, and the measured view was undefined. _Incorporated:_ T produces long items, growth is measured in the `activity` view at full length, and the `messages` total is reported separately.
- **Important, Testability.** No rule turned measured growth into a cap. _Resolution by owner decision:_ the spike publishes measured values only, and the #613 planning re-run derives the cap and budget.
- **Important, Error cases.** A continuously firing task confounded the steps. _Incorporated:_ tasks are paused and resumed per step (refined in the deep review below).
- **Important, Security.** Deny-by-default approvals could force a false no-go. _Resolution by owner decision:_ only the probe's permitted calls are approved, and each approval is recorded as an S11 fact.
- **Important, Architecture.** S5 tested a different invocation than WP1 uses. _Incorporated:_ both forms are probed, and the S5 row names the WP1 consequence.
- **Important, Testability.** S5 had no criterion for "loaded". _Incorporated:_ a timer fire is required, the version is matched against step 1, and the versions are recorded at setup.
- **Important, Data protection.** Redacted handles could not prove S2–S4. _Incorporated:_ pseudonyms, revision tags, and match/mismatch records.
- **Important, Error cases.** Replacing O could leave tasks firing. _Incorporated:_ O's tasks are deleted, silence is confirmed, O is archived, and its tasks count against the cap before the replacement.
- **Important, Testability.** The cleanup proof had no artifact. _Incorporated:_ a UI artifact, an orchestrator read across two intervals, and no use of the listing tool.
- **Important, Testability.** S10 ignored the result the tool description predicts. _Incorporated:_ the prediction is stated, the active-run state, next run time, and run count are recorded, and S10 is repeated once.
- **Note, Scope.** There was no cap on runs or wall time. _Incorporated:_ caps of 25 runs and 3 hours.
- **Note, Maintainability.** The no-go path was missing. _Incorporated:_ the page merges either way, and #613 is replanned on a no-go.

### Deep interactive review (2026-11-03)

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         3 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         2 |    3 |
| Testability     |        0 |         6 |    1 |
| Scope           |        0 |         0 |    2 |
| Maintainability |        0 |         0 |    1 |

- **Important, Error cases.** The pause/resume rule could not be followed: pausing is itself an interactive turn while the task is active. _Resolution by owner decision:_ pause, resume, rewrite, and delete turns count as control turns, allowed right after a run. The interval is 180 s, tasks are created with `enabled: false`, and deferred fires are recorded.
- **Important, Testability.** The S1 nonce rule would fail on `reasoning` items. _Incorporated:_ the nonce may first appear in run n's `assistant_message` or `reasoning` item, is generated without a tool, and is emitted first.
- **Important, Testability.** S7 had no failure condition the host can produce. _Incorporated:_ an exact position check against the added message; `nextPosition: null` counts as not observable.
- **Important, Error cases.** Self-deletion may cut the run off. _Incorporated:_ the checkpoint line comes before the delete call, S4 is judged by silence and the UI artifact, and the S4 row names the final-notice consequence for WP1.
- **Important, Testability.** The S5 order contaminated the unprefixed test. _Incorporated:_ the unprefixed form runs first, the host-traceable load criterion is defined, and the version is taken from the Codex install.
- **Important, Security.** The permitted calls left out the skill-file reads and T's fixture. _Incorporated:_ both are added and recorded as S11 facts.
- **Important, Testability.** The S12 proxy and fixture were underspecified. _Incorporated:_ a fixed P0 page, the contract's state-read parameters, an exact fixture, and a "partial" label.
- **Important, Testability.** S11's tool set for scheduled runs was never probed. _Incorporated:_ the rev2 run lists its tools as self-report, and `recentRuns` is recorded.
- **Important, Security.** The way O's and T's IDs enter the register was undefined. _Incorporated:_ links come from the operator, the name prefix and provider are verified, and threads are never listed.
- **Important, Security.** The runtime mode was open. _Resolution by owner decision:_ `approval-required`, without `run_scheduled_task_now`.
- **Important, Testability.** The exact probe texts were missing. _Incorporated:_ the "Operator scripts" templates.
- **Note, Scope.** Budget arithmetic and the definition of a run. _Incorporated:_ a run is defined, two runs are reserved for step 8, and the S10 repeat is conditional.
- **Note, Scope.** `run_scheduled_task_now` was mentioned but not approved. _Incorporated:_ dropped.
- **Note, Error cases.** The orchestrator had no approved way to wait. _Incorporated:_ `t3_thread_wait` on registered threads.
- **Note, Testability.** The S10 coalescing default was unrecorded. _Incorporated:_ the stored schedule, including `dedupe`, is recorded.
- **Note, Maintainability.** The decision string could appear more than once. _Incorporated:_ it appears exactly once.
- **Note, Error cases.** "Replace O once" was ambiguous. _Incorporated:_ a second failure ends the spike with a no-go page.

## Test results

- Measurement steps 1 to 8 ran on 2026-11-03 from 22:36 to 23:46 UTC (run fsx-11032236); the S4 silence check and cleanup followed on 2026-11-04. Evidence root `.effective-flow/spikes/focus-schedule/fsx-11032236/`, untracked. Budget: 2 valid threads (plus 2 invalid Claude-harness setup threads outside the budget by owner decision), 3 of 5 tasks, 18 of 25 scheduled runs.
- Decision rule applied: S1 to S7 observed by host data without a no-go condition, so `**Decision: go**`. S12 is labelled partial; S10 has one valid observation (attempt 1 invalid, repeat skipped for budget).
- Cleanup: `list_scheduled_tasks` returned no tasks, matching the operator's note on the empty automation list (no screenshot); the thread list filtered on the run label returned no threads after archiving.
- All 16 digests on the evidence page verified against the evidence root with `sha256sum -c`.
- Identifier scan of the evidence page (UUIDs, URLs, thread links, home paths, thread titles): no match. The decision line appears exactly once.
- `pnpm agent:check` passed in the delivery worktree.
- Changed files: the evidence page, one tail link line in `focus-host-evidence.md`, one README entry, and this plan's status and archive move. The primary checkout's `git status` differs from the step 1 snapshot only by two `evals/host-driver/` modifications and one untracked directory that were no longer present; this run wrote nothing there.

## Review findings

- No review phase in the documentation workflow. The orchestrator wrote the page inline instead of through the docs-writer worker and checked it against `observations.md` and `register.md`; it corrected three counts (S1 run count, S3 rewrite count, scheduled-run duration) before commit.

## Open points

- No open points.
