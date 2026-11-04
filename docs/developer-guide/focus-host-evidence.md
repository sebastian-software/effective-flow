# focus host evidence (2026-11-02)

Point-in-time developer evidence for work package 1 of
`docs/concept/2026-11-02-focus-session-check.md`. The plan is
`docs/plan/archive/2026-11-02-focus-host-verification-spike.md`.

## Question and scope

The concept's read, send, and reply rules for the future `effective-flow focus` tool rested on tool
descriptions and on one earlier plan, not on observed host behaviour. The spike replaces those
assumptions with observations on three hosts and answers twelve questions. "Observer" means a session
that is neither the target nor one of its ancestors, as `focus` would be.

- **T3 Code (read and send):** Q1 delivery side effect of reads, Q2 observer and ancestor identity,
  Q3 target state before a read or send, Q4 send semantics, Q5 the broader-modes rule.
- **Codex desktop (read):** Q6 reader, Q7 sender.
- **Claude Code (reach, no read):** Q8 request and reply, Q9 in-run reception, Q10 late, sub-agent,
  and busy cases, Q11 reference stability, Q12 own session.

Each answer below is marked **observed**, **observed with deviation** (from a tool description or
an earlier plan), or **not observable**, with its method, repeat count, and host version. The spike
ends with one conclusion per host: **go**, **go with adjusted rules**, or **drop**. See "Conclusions".

## Setup

| Item                     | Recorded value                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Run date                 | 2026-11-02 (UTC)                                                                                                           |
| T3 Code server           | `0.1.6`                                                                                                                    |
| Claude Code              | `2.1.316` in the spike session (inside T3 Code); `2.1.292` on the operator machine (Claude Code runs)                      |
| Codex desktop            | version not reported                                                                                                       |
| Installed skill          | Effective Flow `1.69.0` (`b575bee`)                                                                                        |
| effective-flow source    | `develop` at `47ce14570d2320b5484b21f9a44b59f13b3526b0`                                                                    |
| Spike session            | Claude Code in `bypassPermissions` mode, model `claude-opus-5-5`                                                           |
| T3 Code delegated tasks  | Claude Code harness, model `claude-haiku-5-5` at low effort, `approval-required` runtime mode unless a cell says otherwise |
| Operator-machine session | Claude Code with Opus 5.5, scratch directory outside any real project                                                      |
| Evidence root            | `.effective-flow/spikes/focus-hosts/20261102T090649Z/` in the primary checkout (untracked)                                 |

Method by host:

- **T3 Code:** the spike session acted as orchestrator and outside observer. It launched throwaway
  delegated tasks and drove reads and sends against them through the T3 Code orchestration tools.
- **Codex desktop:** the operator created two throwaway threads by script. Thread B read thread A
  once. The operator compared thread A before and after by screenshot.
- **Claude Code:** the operator ran two throwaway sessions (observer and target) by script, on the
  operator machine, and recorded results by screenshot.

Every read and send went to a throwaway target recorded in a run-local target register
(`register.json`).

### Deviations from the plan

- The Claude Code observer ran in **auto mode**, not default mode. The target showed as
  `interactive` in the session list and `prompting` as the sender mode.
- The T3 Code target script step T1 (`sleep 75 && echo ...`) never reached an approval prompt: the
  Claude Code harness inside the delegated task refused foreground sleep chains. It was replaced by
  T1b, which waits through a `node -e` timer of 75 seconds.
- The operator approved the T1b command earlier than scheduled. The outside observer still caught the
  running state, so Q3 and Q4 were observed for both "waiting at approval" and "running".
- One Claude Code send (target in plan mode, run 1) went out **without the pre-send session-list
  check** that the operator script requires. The register confirmed afterwards, from the target
  screenshot, that the message reached the intended throwaway target.

## T3 Code results

Host version: T3 Code server `0.1.6`. Method: tool calls from the spike session against throwaway
delegated tasks. Unless noted, each cell was observed once.

| Question                              | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1 Delivery side effect of reads      | **Not observable.** An idle parent receives a child's result in the completion wake within about one second, before any outside read can race it. The control read afterwards reported the same `result_available` work state it showed before delivery, and the state call itself returns the summary. The state-only oracle cannot detect delivery, so the remaining Q1 cells were skipped.                                                                                                                                                                                                                                                                                                                                                                                        |
| Q2 Observer and ancestor identity     | **Observed.** The orchestration capabilities call returns the caller's own thread identifier in a parent-thread field, the field that names the parent of new delegates. A thread read returns the thread's own parent-thread identifier and a relationship field (`subagent` for delegated tasks), so ancestors are recognizable by walking that chain without a listing. Delegated task messages also carry the sender thread.                                                                                                                                                                                                                                                                                                                                                     |
| Q3 Target state before a read or send | **Observed.** One thread read (activity view, limit 3) returns the status, the active-run field, the pending-request count, the runtime mode, the parent and relationship fields, and the last item types. "Running, waiting at approval" (pending-request count 1) is distinguished from "running" (count 0) and "completed" (no active run). Whether the state read itself delivers a result is not observable (see Q1).                                                                                                                                                                                                                                                                                                                                                           |
| Q4 Send semantics                     | **Observed with deviation** from the expectation of an idle-but-not-finished state. A `steer` send to a running task, both while it waited at approval and while its approved command ran, returned `delivery=steered` with status `running` and created no task. The receiving model saw the steer only after the running tool call returned, as a plain user message with no host sender marker; the only marker was a text tag the sender wrote. A `queue` send to a finished delegated task returned `delivery=started` and a new task identifier: a fresh task. Delegated tasks have no idle-but-not-finished state, so `queue` while idle was not observed on a top-level thread (none was launched). The raw thread item carries the sender thread for readers of the thread. |
| Q5 Broader-modes rule                 | **Observed.** A send from an `approval-required` observer to a target in `auto-accept-edits` mode failed with a `runtime_mode_escalation_denied` error that says the child mode is broader than the parent mode. No task or delivery was created, and the target's mode was identical before and after. The rule fails the send; it does not change the target's mode.                                                                                                                                                                                                                                                                                                                                                                                                               |

Further facts:

- The delegation result carries a fixed field set (task, child thread, run, node, status, work state,
  pending-child-runs flag, latest terminal run and summary, provider, model, options, summary,
  pending-question flag, pending-approval, wait-timed-out flag, and a `next` hint). The hint says
  completion wakes the calling thread, so the caller should end its turn and not poll.
- A delegated task can itself call the orchestration tools and start a nested task, so grandchild
  tasks exist.
- Both harness notices that the T1 task listed as "received messages" (tool availability, MCP
  authentication) were host notices, not messages from another thread.

## Codex desktop results

Host version: not reported. Method: one script run, two throwaway threads.

| Question  | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q6 Reader | **Observed with deviation.** Thread B called `read_thread` once on the deep-link reference of thread A. The reference was accepted, and B reported extracting the thread identifier from it; there was no error. The result had no separate turn-summary field. It returned individual commands, tool and command outputs, and statuses, with the paging fields `order`, `limit`, `nextCursor` (null), and `hasMore` (false). Thread A looked identical before and after the read in the operator's screenshots (user prompt, duration line, final reply): no visible change. The 2026-10-23 plan recorded turn summaries; the observed granularity is finer. Repeat count: 1. |
| Q7 Sender | **Observed (self-report).** Thread B reported three send-capable tools: a send-message-to-thread tool, a handoff-thread tool with a follow-up prompt, and a create-thread tool. B sent nothing. The host's own UI tool list was not reported, so the answer rests on the model's statement. Repeat count: 1.                                                                                                                                                                                                                                                                                                                                                                   |

## Claude Code results

Host version: `2.1.292` on the operator machine. Method: two throwaway sessions by operator script;
results from screenshots. The observer ran in auto mode (see "Deviations from the plan").

| Question                  | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q8 Request and reply      | **Observed with deviation.** Same mode, 3 repeats: every `SendMessage` succeeded and returned a message identifier; the tool result said the message sat in the target inbox, not yet read, and no cross-session delivery notice appeared. The reply arrived within the observer's turn each time (about 45 to 60 seconds), as a cross-session message inside a system reminder directly after a foreground wait command, never through the monitor event. Target replies stayed informational (no file or shell actions), 3 of 3. Target in plan mode, 1 run (repeats 2 and 3 not run, see "Limits"): the target processed the request immediately; **no hold for approval** was observed although observer and target ran in different modes, which deviates from the `SendMessage` description. The target replied by `SendMessage` to the observer's socket address, allowed by the auto-mode classifier, and then raised an interactive question to its own user (plan mode with no task: what to plan?) and blocked there. The host also noted on the send result that it was messaging a new session for the first time under a previously used name (was it restarted?). |
| Q9 In-run reception       | **Partially observed.** Variant (a), an until-loop on the monitor tool: the monitor is only a timer. In-run reception worked only because the observer kept its turn open with additional foreground tool calls (a 45-second foreground wait); the reply is delivered between tool calls. In run 1 the observer also listed sessions mid-wait while the target was busy. Replies arrived in-run in 4 of 4 runs (3 same mode, 1 plan mode). Variants (b) background-only wait and (c)/(d) `notify_when_idle` were **not observed by decision**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Q10 Late, sub-agent, busy | **Not observed by decision.** Late reply, sub-agent sender, and busy target were not run. The expected behaviour is quoted from the `SendMessage` description only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Q11 Reference stability   | **Observed**, 1 rename, 1 restart (the target was restarted again for the plan-mode run and showed a new reference then as well). The `[ref]` (a six-hex-digit reference) was unchanged by a rename. After a restart the same name mapped to a **new** `[ref]`, and the old one disappeared from the list. The name survived the restart.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Q12 Own session           | **Observed.** The session list header names the observer's own session with its `[ref]`; the reference stayed stable across three calls.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

The sender attributes of a reply, observed on every received reply:

- `from` is a socket address of the form `uds:/tmp/cc-socks/<pid>.sock`, one per process: after the
  target restarted, `from` was a different address.
- `from-name` carries the session name, unchanged across the restart.
- `from-mode` carries `prompting`, also when the target ran in plan mode, so it does not reflect the
  permission mode.
- None of the attributes carries the `[ref]`.

## Conclusions

One conclusion per host, as recorded in the "Decision (step 6)" block of `observations.md`.

- **T3 Code: go with adjusted rules.** Q1 is not observable (the oracle cannot detect delivery), so
  the refusal of finished delegated targets stays: read only running delegated tasks or
  non-delegated threads. Q2 yes. Q3 yes (the pending-request count separates an approval wait from
  running). Q4: a steer delivers (`steered`) but only after the running tool call, with no host sender
  marker for the receiver; a send to a finished target starts a fresh task, so it is refused.
  Delegated tasks have no idle-but-not-finished state. Q5: a narrower sender fails without any mode
  effect, so the observer must run at least as broad as the target, else report-only.
- **Codex desktop: go (read host).** `read_thread` accepts a deep-link reference and returns individual
  commands, outputs, and statuses with cursor paging, with no visible change to the read thread. The
  sender side: self-reported tools exist (not required; to verify in work package 4). Version not
  reported.
- **Claude Code: go with adjusted rules.** A reply arrived in-run in 4 of 4 runs when the observer kept
  its turn open with foreground tool calls (the monitor alone does not deliver). The `[ref]` is stable
  across a rename and new after a restart. The sender is identified by socket address, `from-name`, and
  `from-mode`, with no `[ref]`: accept a reply by name when the pre-send lookup showed the name unique
  and bound to the admitted `[ref]`, plus the host's restart notice (marked for the concept review).
  There is no approval hold on a mode mismatch. A request can leave the target blocked on a question
  to its own user (marked for the concept review).

## Consequences for the concept

Rules confirmed or tightened by the observations:

- Keep the refusal of finished delegated T3 Code targets: Q1 is not observable, so a read of a
  finished delegated task could take its result away from a parent that has not received it.
- Read only running delegated tasks or non-delegated threads on T3 Code.
- Recognize observer and ancestors on T3 Code from the capabilities call and the parent-thread chain,
  without a listing (Q2). Recognize the running, waiting-at-approval, and finished state from one thread
  read (Q3), using the pending-request count for the approval wait.
- The observer on T3 Code must run at least as broad as the target; otherwise `focus` is report-only
  (Q5). The failure leaves the target's mode untouched.
- A steer on T3 Code reaches the target only after its running tool call returns, and the receiver
  sees no host sender marker, so a `focus` message must carry its own text tag (Q4).
- The Codex desktop reader works from a deep-link reference with no visible side effect (Q6).
- On Claude Code, the `[ref]` is stable across a rename and changes on restart, so an admitted
  reference binds to one process lifetime (Q11). The observer recognizes its own session from the list
  header (Q12) and refuses to address it.
- A Claude Code reply does not carry the `[ref]` and does not reflect the permission mode in
  `from-mode`; the per-process socket address changes on restart (Q8, Q11).

Adjustments marked **for the concept review**:

1. **No idle-not-finished state for delegated tasks (T3 Code).** The state-dependent send becomes
   steer-while-running and refuse-when-finished. A send to a finished delegated task always starts a
   fresh task.
2. **Name-based sender acceptance on Claude Code.** Because the reply carries no `[ref]`, accept it by
   name when the pre-send lookup showed the name unique and bound to the admitted `[ref]`. Also show the
   host's restart notice, which flags a reused name.
3. **A self-report request can leave the target blocked on a question to its own user (Claude Code).**
   The concept's risk "a self-report request disturbs the run" is stronger than recorded: the target
   can end up waiting on its user after answering.
4. **Finer Codex reader and a self-reported Codex sender.** The reader returns individual commands and
   outputs, finer than the recorded turn summaries. A sender exists on Codex desktop, but only as a
   self-report.
5. **Keep the turn open on Claude Code.** To receive a reply in-run, `focus` must keep its turn open
   with short foreground tool calls. The monitor tool alone does not deliver.
6. **Observer at least as broad as the target (T3 Code), else report-only.** This turns the Q5 failure
   into a precondition for sending.

## Limits

- Most cells are single observations. Only the timing-dependent Claude Code cells were repeated:
  Q8 same mode 3 times, Q8 plan mode once, Q9 in-run reception 4 runs.
- Q1 is not observable with the available oracle, so the delivery side effect of reads is unknown
  for every view and read form.
- Remote Control sessions, cloud sessions, and desktop Claude sessions were not observed; the Claude
  Code results cover local sessions only.
- Q9 variants (b), (c), and (d), and all of Q10 (late reply, sub-agent sender, busy target), were not
  observed by decision; the Q8 plan-mode repeats 2 and 3 were also not run. They are to be exercised in
  work package 4's real-host runs.
- The race in which a target finishes between a state read and a page read is untested.
- The Codex sender is a model self-report, not a host tool list.
- The Codex desktop version is unknown.
- The observer on Claude Code ran in auto mode, and one send skipped the pre-send list check.

## Retention

- The evidence root is kept in the primary checkout, untracked.
- The target and operator scripts (`operator-codex.md`, `operator-claude-code.md`) are reused for
  work package 4's manual host runs.
- The observed read and reply shapes (T3 Code thread-read and send results, the Codex reader result
  fields, and the Claude Code reply attributes) are reused for work package 5's session stub.

## Budget

- **T3 Code:** 11 of the 40 throwaway tasks. This counts 6 delegated tasks and 5 fresh tasks started by
  sends to finished threads. Steers created no task. All tasks completed with no running turns, so
  nothing needed cancelling.
- **Codex desktop:** 2 throwaway threads (A and B); their deletion was requested from the operator.
- **Claude Code:** 2 throwaway sessions (observer and target); the target was restarted and renamed
  during the run. Closing both was requested from the operator.
- The throwaway cap of 40 was not reached.

## Raw evidence digests

Artifacts below the evidence root `.effective-flow/spikes/focus-hosts/20261102T090649Z/`, with the
SHA-256 digest from `digests.sha256`.

| Artifact                        | SHA-256                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `observations.md`               | `f36900afe350a93307ae601b8caee27308ac733d67cd2904739439b0c4abd0c9` |
| `register.json`                 | `4a0680a36385ae87984c5474979b05b134650fd3abc2646d386d76fac2ca88d6` |
| `setup.txt`                     | `2aa4a95ad38e50dee2c73fffd0ca82d3ca209de311f4197ee02b160c19c196fe` |
| `tool-descriptions.md`          | `adb38a3f84e972f0b382bee57da766dae40258c87b87779a600592101a362509` |
| `operator-codex.md`             | `ac6eca0c2f85bd65b234170b37507d17f2d2d9d6bb7d9bf990cedffe70b71a53` |
| `operator-claude-code.md`       | `f4eb1c9bfb0df61f21c5269ac34f7c5377b6f024804785d4dada566f56822f97` |
| `raw/cc-q11-q12-listagents.png` | `7ac09a5ae07c995099d8a62a83c1ebb6bb0bb0e99fbb09f9951fd604e1dc3d90` |
| `raw/cc-q8-plan-1-observer.png` | `757c9b585cdfa6baf26dc1ec689453f8a6188bb18a0060cf798cfc202fa65b7f` |
| `raw/cc-q8-plan-1-target.png`   | `ecfaf6ee28875a3c8201c9ee6d0aa1f13a601553918bf4655a1ebbb7f5a88b75` |
| `raw/cc-q8-same-1.png`          | `c5b914da7e64fdcc058f2a15d14217419f8bc115bed0ea3d5f7cd75f8e734f23` |
| `raw/cc-q8-same-2.png`          | `31cd5da94e8003742cac492524b7f90df47cef8fa455b99a2348da10d88e8207` |
| `raw/cc-q8-same-3.png`          | `4bb3d7a889084c40b470f1ba7956918aaa72f8b858c0cf2570a83f88784089aa` |
| `raw/codex-threadA-after.png`   | `d9937280080dccb904aead4ff8e5f6f4fc73006843c5d8306ba34692a97209be` |
| `raw/codex-threadA-before.png`  | `4bbfb8c9162e343d9845dc1c8474db7e033beccb70e0cfa95c31e2d3e9ad98a4` |
| `raw/codex-threadB-read.png`    | `45f4d64f601b186dfe7d24258e703192eba88e6580f40bef602de9069f312183` |

Later session-shape observations for the eval stub: [focus session shape observations](focus-session-shape-observations.md).

Later `schedule_task` observations for the follow-up mode: [focus schedule evidence](focus-schedule-evidence.md).
