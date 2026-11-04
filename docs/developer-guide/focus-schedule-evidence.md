# focus schedule evidence (2026-11-03)

Point-in-time developer evidence for work package 0 of issue #613, the opt-in follow-up mode of
`effective-flow focus`. The plan is `docs/plan/archive/2026-11-03-focus-schedule-task-evidence-spike.md`.
This page is a dated addendum to [focus host evidence](focus-host-evidence.md).

## Question and scope

The follow-up design in the #613 planning comment rests on T3 Code `schedule_task` behaviour that
this repository had never observed. The spike replaces those assumptions with observations on one
host, T3 Code with Codex threads, and answers twelve questions:

- **S1** prior context of a scheduled run, **S2** task handle, **S3** rewrite by ID, **S4**
  self-deletion, **S5** skill load, **S6** observer identity, **S7** cursor paging (the no-go
  questions);
- **S8** harness identity, **S9** scheduled-turn provenance, **S10** busy thread, **S11** mode,
  tools and approvals, **S12** context growth (the questions that only change WP1 wording).

Each answer is marked **observed**, **observed with deviation**, or **not observable**, with its
method, evidence class (**host data** or **self-report**), and run count. The spike ends with one
decision line; see "Conclusions".

Claude-harness observers are out of scope, matching the #613 decision. Only a 180 s interval was
exercised; WP1 offers 5 minutes or more, and the 60 s schema minimum was not tested.

## Setup

| Item                  | Recorded value                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Run date              | 2026-11-03 (UTC); silence and cleanup checks on 2026-11-04                                       |
| T3 Code               | version not visible to tools                                                                     |
| Codex CLI             | `codex-cli 0.165.0`                                                                              |
| Codex threads         | provider instance `codex`, model `gpt-6.1-sol`, runtime mode `approval-required`                 |
| Installed skill       | Effective Flow `1.70.0` (`694e0cc`) for the Codex harness                                        |
| effective-flow source | `develop` at `6ba2cf470380d5b979047b00db461d0167b0be6a`                                          |
| Orchestrator          | a separate T3 Code thread on the Claude Code harness; read-only, never a schedule or send target |
| Threads               | O (observer, owns the tasks) and T (read target), both top-level, created by the operator        |
| Interval              | 180 s for every task                                                                             |
| Evidence root         | `.effective-flow/spikes/focus-schedule/fsx-11032236/` in the primary checkout (untracked)        |

Method: the operator pasted fixed scripts into O and T and answered approvals; the orchestrator
verified every result by reading O and T with `t3_thread_read` (activity view, item fields,
`recentRuns`). The operator approved only the plan's permitted calls; each approval is an S11 fact.
A **run** is one host run in O started by a timer fire. A **control turn** is an interactive turn in
O that only pauses, resumes, rewrites, or deletes a task.

Each scheduled probe emitted a checkpoint line first: the task handle, a tag, a fresh nonce, and the
previous run's nonce. Nonce provenance (where a nonce first appears and who quotes it) is read from
item types and positions, so S1 does not rest on self-report.

## Answers

### S1 Prior context — observed

**Host data**, 13 runs of one task, including one deferred run. Each nonce first appears in its own run's
`assistant_message`, is absent from the prompt and from every user message and tool result before the
next run, and is quoted as `prev` by the next run together with the previous checkpoint line. The
chain held across ordinary fires, a deferred run (S10), and six proxy ticks (S12).

### S2 Task handle — observed

**Host data**, 1 creation. The `schedule_task` result in O carries `scheduledTaskId`. The creation
result, the ID used in the later rewrite, and the handle in the rewritten prompt match.

### S3 Rewrite by ID — observed

**Host data**, 4 rewrites. An update by `scheduledTaskId` changed only the given fields: `enabled`
stayed `false` when only the prompt was sent. The next scheduled runs repeated the new tag and the
same handle.

### S4 Self-deletion — observed

**Host data**, 1 self-deletion and 2 interactive deletions. A scheduled run called
`delete_scheduled_task` with its own handle and received `deleted: true`. The run was not cut off: it
posted the tool result and its final line and completed normally about 4 s later. No fire of that
task occurred over the following 55 nominal intervals. The checkpoint handle matches the deletion
argument. Deletion from an interactive control turn behaved the same (2 tasks). At cleanup the
project's automation list was empty, by operator note and by `list_scheduled_tasks`.

### S5 Skill load — observed

**Host data**, 4 unprefixed runs and 1 prefixed run.

- Prompt `version` (unprefixed): in 4 of 4 runs the model asked which version was meant. No skill
  file was read and the installed version string did not appear.
- Prompt `$effective-flow version`: the run read the installed skill's `tools/version.md` (approval
  required) and answered `Effective Flow 1.70.0 (694e0cc)`, matching the setup record. The string was
  absent from O before that run.

### S6 Observer identity — observed

**Host data**, 3 scheduled runs. `orchestrator_capabilities` in every scheduled run returned a
`parentThreadId` equal to O, as in O's interactive baseline.

### S7 Cursor paging — observed

**Host data**, 1 cursor read across an added message, repeated by later runs. A first read of T
returned positions 0–2 and a next position of 2. The operator then added a message to T. The next
run read with `afterPosition: 2` and received positions 3–5, including the added message and nothing
at or before position 2. A read past the end returned no items and a null next position, consistent
with [focus session shape observations](focus-session-shape-observations.md).

Side observation: the probe stored that null cursor as `none`, and the following run omitted
`afterPosition`, which restarted paging at position 0.

### S8 Harness identity — observed

**Host data**, every run. Provider instance `codex` appears on the thread, in `recentRuns`, and as the
inherited provider in `orchestrator_capabilities`. Item IDs carry `provider:codex`.

### S9 Scheduled-turn provenance — observed

**Host data**, every scheduled run. A scheduled run starts with a `user_message` item whose text is
the stored prompt, with `createdBy: "agent"`, `creationSource: "mcp"`, and a message ID of the form
`scheduled-task-message:<task>:<epoch-ms>:scheduled`. Interactive turns carry `createdBy: "user"` and
`creationSource: "web"`. The T3 Code UI labels a scheduled run "Automation" followed by the task
title.

### S10 Busy thread — observed with deviation

**Host data and one operator screenshot**, 1 valid attempt (attempt 1 invalid).

- Attempt 1 was invalid: a long `sleep` through Codex `exec_command` yields after about 30 s, so O
  was idle when the fire came due.
- Attempt 2 kept O's turn active with an unanswered approval request. The due fire produced one run
  with status `queued`, which started 0.9 s after the active run ended, 126 s after it was requested.
  No duplicate run appeared.
- The interval grid stayed anchored to the nominal due times: the next fire came about 54 s after the
  deferred start.
- The UI shows the queued run as an "Automation" chip with "Send now", edit, and discard actions.

The queueing matches the tool description's prediction. The deviation is the grid: a deferral
shortens the gap to the next tick.

### S11 Mode, tools, and approvals — observed

**Host data**, every run; tool list by **self-report**. In `approval-required` mode the scheduled runs
kept the thread's runtime mode. These calls raised an approval request each time:
`schedule_task`, `delete_scheduled_task`, `t3_thread_read`, and skill-file reads.
`orchestrator_capabilities` raised none. The tool list a scheduled run reported was identical to the
interactive baseline.

### S12 Context growth — observed, partial

**Host data**, 6 proxy ticks (3 planned). Every tick added the same 8 activity items:

| Item                                  | Characters |
| ------------------------------------- | ---------: |
| scheduled `user_message` (the prompt) |        928 |
| checkpoint `assistant_message`        |        111 |
| state-read tool result                |      4,444 |
| approval request                      |         58 |
| page-read tool result                 |      7,487 |
| approval request                      |         58 |
| final `assistant_message`             |         42 |
| checkpoint item                       |          2 |
| **Total per tick, `activity` view**   | **13,130** |
| **Total per tick, `messages` view**   |  **1,081** |

Tool results account for 11,931 characters per tick. The label is **partial**: Codex wrote T's
fixture as one assistant item instead of ten, so the page read returned 5 items rather than
10 × 1,500 characters.

### Side observations

- A background command finishing starts a notification run in its thread, so an observer can become
  busy without a user or schedule turn.
- Two tasks bound to one thread fire on independent grids.
- Fires arrived 0.1–10 s after their nominal due time.

## Conclusions

Every no-go question S1–S7 was observed by host data without its no-go condition, so the decision
rule yields go:

**Decision: go**

- S1: the nonce chain held over 13 runs, including a deferred run.
- S2, S3: the handle is returned, and a rewrite by ID takes effect on the next run.
- S4: self-deletion stopped the task, and the automation list was empty at cleanup.
- S5: the prefixed form loads the skill.
- S6: `orchestrator_capabilities` returns O.
- S7: paging after a stored position neither repeats nor misses items.

### Measured values for the #613 planning re-run

- Growth per tick in O: 13,130 characters in the `activity` view and 1,081 characters in the
  `messages` view, constant over 6 ticks (partial: the page read served 5 items).
- Scheduled-run duration: 10 s for a run without tool calls; up to 173 s when operator approvals were slow.
- Fire latency: 0.1–10 s after the nominal due time.

The re-run derives the loop cap and the quiet-tick budget from these values.

### WP1 wordings changed by the observations

- **S4:** no final notice before deletion is needed: the run continues after the delete call and can
  post its final notice afterwards.
- **S5:** the tick prompt must start with `$effective-flow`; an unprefixed prompt does not load the
  skill.
- **S7 side observation:** the tick keeps the last numeric position when a read returns a null next
  position, and never omits the cursor.
- **S8:** the gate row matches the harness by provider instance `codex` on the observer thread.
- **S9:** a run is identified as scheduled by `createdBy: "agent"` and `creationSource: "mcp"` on
  its first `user_message`, not by prompt text. Another task bound to the same thread passes that
  test too, so the run and its checkpoint are attributed to the follow-up loop only when the `<task>`
  segment of the message ID `scheduled-task-message:<task>:<epoch-ms>:scheduled` matches the
  expected task handle.
- **S10:** the overlap rule expects a queued tick to start right after a busy turn and the next tick
  to follow on the nominal grid, possibly within a minute.
- **S11:** in `approval-required` mode every tick needs approval for `t3_thread_read`, and the final
  tick for `delete_scheduled_task`. WP1 either requires an observer mode that allows these calls or
  states that the operator approves each tick.

## Limits

- S1, S5 (prefixed form), and S7 rest on single sequences in one O/T pair.
- S10 has one valid busy observation; the planned repeat was skipped for budget, and attempt 1 is
  invalid.
- S12 is partial, as stated above.
- One host version, one model, one interval.
- The S4 cleanup proof is an operator note plus the orchestrator's `list_scheduled_tasks` read; no
  screenshot of the automation list was taken.

## Budget and deviations

| Item           | Cap | Used                                                                   |
| -------------- | --- | ---------------------------------------------------------------------- |
| Threads        | 3   | 2 valid; 2 invalid setup threads outside the budget (owner decision)   |
| Tasks          | 5   | 3, all deleted                                                         |
| Scheduled runs | 25  | 18                                                                     |
| Wall time      | 3 h | 1 h 10 min for steps 1–8; silence and cleanup checks the following day |

Deviations from the plan:

- The first observer and target threads were created on the Claude Code harness. They were not
  registered, received no schedule, and were replaced by Codex threads.
- The operator approved one `sleep` command that was not a permitted call (harmless; S10 attempt 1).
- A pasted script created one duplicate task. It was registered on sight, observed twice for S5, and
  deleted by a control turn.
- One unplanned tail fire before the first pause, and three extra proxy ticks in step 7 because the
  task was not paused in time; all are counted above.
- T's fixture produced one item instead of ten (S12 partial).

## Retention

The evidence root stays untracked in the primary checkout. It holds the pseudonym register with
the real thread and task IDs, which this page does not publish. All four spike threads,
including the two invalid setup threads, were archived on 2026-11-04.

## Raw evidence

Paths are relative to the evidence root.

| Artifact                             | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `setup.md`                           | `ca241f7d739be1cf6716399ba7d1237b95523221a196a6465a89ab58d7e15443` |
| `git-status-step1.txt`               | `9a11d2f80907f054e898bf9a5617bf25eb01004483c5828a216e76a58c466238` |
| `tool-descriptions.md`               | `9c50c6f3028205330b02a32dd9af34fbdb6fabf31a32fbb6253e407e43e55fc5` |
| `observations.md`                    | `137ca1392d8128fdfb4b8b45744f8c63e483438426c19f8333b157d54ac31021` |
| `register.md`                        | `65dd8eea0c57fae58c696f103d602e215662dc26654907076779b63684e48cdd` |
| `excerpts/O-activity-after-136.json` | `f99e48422e999bc7c8dc84531c521afccb900ecb78eaaf3072a45ca2c91d3a02` |
| `ui/s10-queued-automation.png`       | `f7a0a354d30b4bf0e4065e7527281bbaa83bae3b43193deece55307655a19cf4` |
| `scripts/01-T-fixture.md`            | `4d20cf722adcd87141f9ba9eae5a7508f21e381202b6210f96b021adedbccde3` |
| `scripts/02-O-baseline.md`           | `b50b2a170c9a3db5f0f5e99e0b576a847c1c769bb573600ab317357f4753aea8` |
| `scripts/03-O-create.md`             | `1c98d8cd0cc0093dac5aa801ba38a971021404c1d394aaffd2591682953f9165` |
| `scripts/04-O-resume.md`             | `5013fbe1c45f11bdb46ef9b9733e5c2451985f84c8b3168a247ecefca940be21` |
| `scripts/05-O-busy.md`               | `7c3d5598b049d14b7276464f671579b7b50baf00fa5921f454f8e833d3cafdce` |
| `scripts/06-O-pause-create-H2.md`    | `2f8392aee1a24ed49bea2ad4244ebf8981509a7a5aaa61909bdb71f0930d6591` |
| `scripts/07-O-delete-H2-proxy.md`    | `1c8d72f9fc514edbd93d3c66469ee9638f0a3cc19270ea2db36b4b0b7dad6169` |
| `scripts/proxy-prompt.md`            | `e9c07ef5e9b8802854a8afe5ff3a4c3860a67a83b22788b0efd78deb6391dfc8` |
| `scripts/rev2-prompt-template.md`    | `35a30aadfc0d81c243a6519e693ca0493adfa8bf54ba711e88fbdb3a0787b6a1` |
