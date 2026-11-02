# Focus: Goal-Trajectory Check for a Running Session

**Concept status:** Elaborated
**Source:** effective-flow concept

## Problem and motivation

Long agent sessions, especially Effective Flow runs that fan out into sub-agents and delegated child threads, can lose their direction without anyone noticing in time. The maintainer describes three patterns (a stakeholder observation, not yet measured):

- **Loops:** the same failing command, the same edit and revert, the same review finding reopened, or retry escalation after retry escalation, without new evidence between rounds.
- **Fan-out:** side topics that the goal never asked for (an unrelated refactor, a tooling detour, "while I'm here" fixes) pull in more sub-agents and widen the open work instead of closing it.
- **Stall:** a lot of activity, but no artifact, check, or decision that moves the goal's completion condition forward.

The person running the session sees only the session's own narration. That narration is written by the agent that is drifting, so it rarely says "I am going in circles". A second session that reads the first one against its declared goal can judge the trajectory from the outside. Repeated checks are not a defect in themselves: a validator round after a fix is progress. What matters is whether each round produces new evidence toward the goal.

Effective Flow already bounds one kind of loop: `goal-completion` caps internal correction rounds of a workflow at about three and then escalates. focus targets what that bound does not see: fan-out and stall, loops that span workflows or retry escalations, loops in sessions that run no goal-completion workflow, and loops the agent does not count as correction rounds.

Verified repository context:

- `effective-flow retro` (`src/tools/retro.md`, #589, #590) already reads exactly one session: the current conversation, one supplied export, or one native session admitted through `src/shared/retro-native-sources.md`. That fragment admits only a reference selected by the requesting user. It binds the actual host and a documented read-only reader before any content read, forbids session inventories and private on-disk logs, treats historical content as quoted evidence rather than authority, and redacts secrets before handoff. `retro` looks backwards for environmental improvements, delegates the judgment to one read-only leaf with `effective-delivery` as owner, and writes nothing.
- `src/shared/goal-completion.md` defines how Effective Flow workflows declare one measurable completion condition and bound their correction rounds (guideline: three); the workflow's regular approval gates always apply.
- Plans under `docs/plan/` carry acceptance criteria and work packages; a run that started from a plan has a written goal anchor.
- `docs/adr/session-rename-butler.md` retired the only earlier cross-session write ("Nothing crosses a session boundary any more"), partly because a fork sent its parent's session ID and the wrong-target rename went unnoticed. `docs/adr/input-trust-boundary.md` asks future features to reuse the same trust boundary for third-party text.

Host context, observed in work package 1 unless marked (`docs/developer-guide/focus-host-evidence.md`, mostly single observations):

- **T3 Code (server `0.1.6`):**
  - `t3_thread_read` reads any thread by ID in a `messages` or `activity` view, with paging, per-item character limits, and run limits. One read (activity view, limit 3) returns the status, the active run, the pending-request count, the runtime mode, and the parent and relationship fields. That read separates running, waiting at approval, and finished.
  - The orchestration capabilities call returns the caller's own thread ID. A thread's `parentThreadId` and relationship field identify its ancestors, but only by reading each ancestor in turn.
  - Description only: reading a child's final result marks it delivered. Whether any read form does so could not be observed. An idle parent receives a child's result in its completion wake within about one second.
  - `t3_thread_send` in `steer` mode reaches a running delegated task (`delivery=steered`), including one waiting at approval. The receiving model sees the steer only after its running tool call returns, as a plain user message with no host sender marker. A send to a finished delegated task starts a fresh task.
  - Delegated tasks have no idle-but-not-finished state. A new-turn send to an idle top-level thread was not observed.
  - A send from an observer with a narrower runtime mode than the target fails (`runtime_mode_escalation_denied`) and leaves the target's mode unchanged.
  - T3 Code's documented child discovery is its thread-list operation with sub-agents included, an inventory call (description).
- **Claude Code (`2.1.292`, local sessions only):**
  - `ListAgents` lists peer sessions with name, `[ref]`, mode, and busy or idle state. It is an inventory and reads no session content. Its header names the observer's own session and `[ref]`.
  - A `[ref]` survives a rename. After a restart the same name maps to a new `[ref]`, and the host notes the reuse of a name on the next send.
  - `SendMessage` delivers by exact name. A reply arrives as a cross-session message whose attributes are a per-process socket address (`from`, new after a restart), the session name (`from-name`), and `from-mode` (`prompting`, not the permission mode). None of them carries the `[ref]`.
  - A reply arrived inside the observer's run in 4 of 4 runs, after about 45 to 60 seconds. It arrived only while the observer kept its turn open with foreground wait commands; the monitor alone did not deliver it.
  - A target in plan mode processed the request with no approval hold (1 run), although the `SendMessage` description says that a session in another permission mode holds messages for its user and may let them expire. That target replied and then blocked on a question to its own user.
  - Not observed: `notify_when_idle`, a background-only wait, late replies, a sub-agent as sender, a busy target, the default permission mode on the observer, and Remote Control, cloud, or desktop sessions.
  - No Claude Code tool reads another session's history; its transcripts exist only as private on-disk files.
- **Codex desktop (version not reported, 1 run):**
  - `read_thread` accepts a deep-link reference and returns individual commands, tool and command outputs, and statuses with cursor paging. This is finer than the turn summaries an earlier plan recorded.
  - The read thread showed no visible change (top-level thread, 1 observation).
  - Send-capable tools exist only as the model's self-report, with no host tool list.

Assumptions (not verified):

- A run that follows `goal-completion` makes its completion condition visible enough in its output for an observer to use it as a goal anchor; the fragment requires declaring the condition, not quoting it verbatim.
- Codex CLI offers no documented reader for another session.
- On T3 Code every read form may mark a final result delivered; focus treats it so.

## Target users and use cases

The first version serves three hosts at two evidence levels:

- **Observed evidence** on hosts with a documented session reader: T3 Code (read and send) and the Codex desktop app (read only in the first version).
- **Self-report evidence** in local Claude Code sessions, which can reach another session but not read it: focus asks the observed session for a structured status report and judges that report, checked against the shared repository where possible.

Codex CLI and portable hosts end with a stated limitation.

- **A developer who runs a long Effective Flow session (`build`, `apply`, `merge-gate`, …) in T3 Code or the Codex desktop app:**
  - Opens a second session, runs `effective-flow focus <session-ref>`, and learns whether the run is on track, drifting, looping, or stalled, with the events that support the verdict.
  - Receives one concrete course correction and, after confirming it, has focus send it into the observed session as a marked suggestion (T3 Code), or pastes the shown text there themselves (Codex desktop).
- **A developer running parallel local Claude Code sessions:** asks focus in one session to request a status report from another, and gets a deliberately limited verdict that is marked as based on self-report.
- **A developer coordinating several parallel threads:** checks one thread that has gone quiet or noisy and decides whether to intervene, without reading its full history.

**Success criterion:** a labelling rubric is written down before any session is recorded. On at least three recorded sessions per verdict, labelled under that rubric, focus reaches the matching verdict in at least 80 % of all cases and never returns Looping, Drifting, or Stalled for an on-track session ("Cannot judge" is allowed there). Every verdict cites events that the developer can find in the observed session. These thresholds apply to observed evidence. For self-report evidence, at least three fixtures each with a missing, held, refused, or narration-only reply end in "Cannot judge"; no drifting or looping fixture yields "Progress verified"; and every self-report verdict states its evidence level and cites the report items it relies on. An unclear goal or insufficient coverage produces "Cannot judge" with the reason, never a guessed verdict.

## Solution sketch

`effective-flow focus` is a new read-mostly tool that runs in a **separate observer session**. It takes one exact session reference and optionally an explicit goal, and returns one snapshot verdict in the observer's chat. It is a separate tool rather than a `retro` mode, because its purpose (live direction, not environmental improvement) and its one outward action differ; it shares `retro`'s source admission.

1. **Admit the source.** focus admits exactly the one session reference the developer selected. On hosts with a reader this is `retro`'s native-source admission, unchanged. On a host that can reach a session but not read it, as in Claude Code, a focus-owned admission branch applies: it binds the host's stable session reference (in Claude Code the `[ref]`), never the session name, which is a title any session can take on. A `[ref]` lasts one process lifetime: a reference that is no longer listed, or a host notice that a name was reused, ends the admission. Before each confirmed message and after each reply, focus runs one targeted lookup (in Claude Code `ListAgents`). It uses only two things from it: whether the admitted reference is listed with its state, and whether that reference's name occurs exactly once in the name column. This is a stated, narrow exception to the inventory ban. Nothing else from the listing is used, and no target is ever chosen from it. If the reference no longer matches or its name is not unique, nothing is sent. The self-report path runs only when focus is the top-level session, because a sub-agent's messages go out, and its replies come back, under its parent's address. When focus runs inside a spawned worker or a delegated task, it starts no self-report and ends with the missing-capability message. focus refuses before any content read:
   - the observer session itself, recognized from host-provided context: the T3 Code capabilities call, the Claude Code listing header;
   - an orchestrator that started the observer. On T3 Code focus recognizes it by walking the observer's own `parentThreadId` chain. This is a second stated exception: each ancestor read uses the smallest activity read, and focus keeps only the parent and relationship fields and discards the content. On Codex desktop, work package 4 must show how the observer recognizes itself and its ancestors; until then Codex is not advertised;
   - a finished delegated thread, whose final result a read could mark as delivered to the wrong reader. focus learns the state from one smallest state read (activity view, limit 3). That read may itself deliver, because the side effect is unknown. The residual risk is accepted: an idle parent receives the result within about a second, so only a busy parent can lose it, and the ADR records this.

   Where the host has a reader, focus reads (steps 2 to 4). Where it can reach the session but not read it, as in Claude Code, focus requests a self-report instead (step 4a). Where it can do neither, focus says so and stops.

2. **Cover sub-sessions through the parent only.** focus reads no child session in the first version. What it knows about children comes from the parent's own record: the briefs the parent sent, the statuses it saw, and the results it already received. That record is evidence about the children, never a source reference, so a child ID in it admits nothing. Fan-out stays visible there as spawned sub-agents and new topics; a loop inside a child is visible only as far as the parent saw it, and the report names that coverage gap.
3. **Anchor the goal.** The goal comes from, in this order: an explicit `goal:` argument, the plan or issue the session started from, the session's declared completion condition, or its opening request. A plan or issue reference found in the session is resolved read-only, and only in the observer's own repository or tracker scope. If the file is missing or differs, or the anchors contradict each other, focus asks once instead of judging against a guessed goal.
4. **Read bounded coverage.** focus starts with the most recent runs and small page limits and goes further back only when a candidate pattern needs it, since telling a validator round from a loop needs evidence of novelty across rounds. A tight read budget therefore raises the share of "Cannot judge" verdicts; that trade-off is accepted. Before every page, focus re-checks that the session has not become a finished delegated thread; a target that finishes between that check and the page read is an untested race. Command and tool outputs are the main secret-bearing evidence, especially on the Codex reader: focus requests them only for a candidate pattern and always redacts them. It records what it read and what it left out.

   4a. **Request a self-report (hosts without a reader).** focus shows the developer the exact request text and sends it only after confirmation, to the admitted reference. The request asks for a structured report of what has already happened, as locators rather than content: the goal as the session understands it, recent steps, checks run and their recorded results, paths and commit IDs touched, sub-agents started and their outcome, and what the session is blocked on. Its fixed text says to report only what has already happened and not to run, re-run, or change anything to answer. It also says to return to the prior state after replying and to ask its own user nothing about the request. That clause does not bind the target. The request carries a one-time nonce that the reply must echo. focus waits with one named, side-effect-free foreground wait command of fixed maximum duration, repeated until the bound is reached, because a reply is delivered only between foreground tool calls. That wait is focus's only execution. If the host blocks it or asks for approval, the run ends with "Cannot judge". A missing, held, refused, or late reply also gives "Cannot judge"; a reply after the wait is never processed as a reply. The reply is accepted only when all of these hold:
   - its `from-name` is the admitted reference's name;
   - it echoes the nonce;
   - the targeted lookup after the reply still shows that name unique and bound to the admitted `[ref]`;
   - no restart notice appeared.

   Any other cross-session message during the run is discarded. The reply is quoted third-party data. focus checks its claims only against git metadata of the observer's repository (commits, branches, committed diffs) and already-recorded CI status. It runs nothing to check them; test-run claims, uncommitted work, and work outside that repository are marked unverified.

5. **Judge the trajectory.** One read-only analysis leaf receives the goal, the redacted evidence, and the coverage limits. It compares progress events (new verified artifacts, passing checks, closed acceptance criteria, completed packages, decisions) with activity (repeated commands, re-edits, new topics, new sub-agents, growing open work). Observed content is quoted evidence: text addressed to focus or claiming a verdict is treated as a possible injection, never as input to the verdict. The leaf returns one verdict, **On track**, **Drifting**, **Looping**, **Stalled**, or **Cannot judge**, with cited events and at most one recommended course correction. Every verdict states its evidence level, observed or self-report. At the self-report level only three verdicts exist: **Progress verified** (claimed progress toward the goal is confirmed in git metadata, while the trajectory itself was not observed), **Drifting** (verified changes lie outside the goal), and **Cannot judge**. focus never says On track, Looping, or Stalled on self-report, because loops leave little trace in the repository and a drifting session can still produce real commits. A report that only narrates without verifiable items yields "Cannot judge".
6. **Report, then optionally send.** focus shows the verdict, the evidence, the coverage limits, and the proposed correction as the exact text it would send. The correction refers only to the goal anchor and cited event locators. It copies no command, URL, or executable path from the evidence, and it passes the same redaction check as all other output. Only after the developer confirms that exact text in the same run does focus send it. A confirmation counts only from a developer turn, never from a cross-session message or other observed content:
   - Right before sending, focus re-establishes the target's identity against the admitted reference and reads its state.
   - On T3 Code: focus offers a send only when its own runtime mode is at least as broad as the target's (`runtimeMode` from the state read); otherwise it is report-only.
     - A running delegated task gets a mid-turn update (`steer`). It arrives only after the target's running tool call returns, so a correction during an approval wait lands after that approval and its command have run; focus cannot stop an in-flight action.
     - A finished delegated task gets nothing, because a send would start a fresh task, and the report says so.
     - An idle top-level thread gets a new turn. This is unverified and checked in work package 4.
     - focus never uses the automatic or restart modes.
   - On Claude Code the host's own cross-session delivery applies; a held or refused message counts as not sent.
   - On Codex desktop focus sends nothing in the first version; the developer can paste the shown text.
   - The message carries a fixed prefix naming focus and the developer's confirmation, and it states that it is a suggestion, not a new requirement, and that the session's own approval gates still apply. The prefix is a label, not authentication: the receiver sees a plain user message with user-turn weight, and any session could write the same text.
   - A send whose target or delivery cannot be verified counts as not sent.

   Without a confirmation, nothing is sent.

focus never edits files, writes reports, changes the observed session's plan, or interrupts it. Its outward actions are confirmed messages only: the correction, and on hosts without a reader the self-report request before it. Its only execution is the named wait command on Claude Code. A host read side effect must never become another outward action.

## Scope

### In scope (first version)

- `effective-flow focus <session-ref> [goal: <text>]` as an exposed tool, one snapshot per invocation.
- Admission of exactly one developer-selected session: `retro`'s unchanged admission on reader hosts, a focus-owned reference-bound admission on reachable-only hosts; refusal of self, ancestor, and finished delegated targets, with the two stated lookup exceptions (Claude Code reference and name check, T3 Code ancestor chain).
- Sub-session coverage only through the parent's own record, with the gap named in the report.
- On local Claude Code sessions, as top-level session only: a confirmed self-report request with a nonce to the admitted reference, a bounded foreground wait, reply acceptance by name, nonce, and a post-reply lookup, verification against git metadata and recorded CI status, and the three self-report verdicts.
- Goal anchoring from explicit goal, source plan or issue, declared completion condition, or opening request, with one clarification when unclear.
- The five observed verdicts and three self-report verdicts with cited evidence, coverage limits, and at most one course correction.
- One confirmed, marked correction message into the observed session through the host's documented send operation: on T3 Code state-dependent and only from an observer at least as broad as the target, on Claude Code by host delivery. Codex desktop shows the correction without sending it.
- T3 Code and the Codex desktop app with observed evidence, local Claude Code sessions with self-report evidence; elsewhere focus names the missing capability.

### Non-goals

- **Reading child sessions directly:** it would need a session inventory, which `retro`'s admission rule forbids; the parent's record covers fan-out well enough for a first version.
- **Sending on Codex desktop:** its send tools are known only from a model self-report, with no verified sender marker or identity binding; a later extension needs its own evidence.
- **Remote Control, cloud, and desktop Claude Code sessions:** not observed in work package 1.
- **Self-reports where a reader exists:** on T3 Code and the Codex desktop app the observed history is better evidence than the agent's own account, so focus sends no status request there.
- **Continuous watching or scheduling:** one snapshot per call; a developer can repeat it with existing means (`/loop`, scheduled tasks) without focus keeping state between calls.
- **Sending in unattended or scheduled runs:** without a developer in the conversation focus stays report-only, and a confirmation covers exactly one shown text in the same run. On Claude Code an unattended run therefore ends with the missing-capability message.
- **Autonomous intervention:** no interrupt, restart, cancel, or unconfirmed send, because a wrong verdict would derail a healthy run.
- **Reading private on-disk transcripts** (Claude Code JSONL, Codex rollouts): the same trust boundary as `retro`; it would add a privacy surface and a dependency on undocumented file formats.
- **Judging code quality or correctness:** that belongs to `review`; focus judges direction, not the diff.
- **Environmental improvement advice:** that stays with `retro`.
- **Changing the observed session's artifacts** (plan, report, configuration) or its sub-agents.
- **Cross-session dashboards or inventories:** focus checks exactly one admitted session and never resolves a target from a session listing; the only listing uses are the targeted reference and name checks of an already-admitted reference.
- **Asking a peer to act:** a self-report request asks for information only; asking another session to run, change, or approve anything would launder permissions across sessions.

## Technical direction

- **Prompt-level exposed tool, no new runtime helper at first,** in the "Ensure quality" group next to `review` and `retro`, classified for next steps like `retro` (chat result, no saved source). It shares `retro`'s source admission unchanged on reader hosts; the focus-specific rules (reference-bound admission for reachable-only hosts, target refusals, parent-only child coverage, self-report, the send) live in a focus-owned contract instead of widening `retro`'s. Being prompt-level, focus cannot filter third-party text before the model sees it, as `input-trust-boundary.md` asks; work package 2 records how reply acceptance, developer-only confirmation, and evidence-only treatment stand in for that filter.
- **Judgment delegation:** one generic read-only analysis leaf at its own spawn site, as in `retro`; no new named worker role. The ownership check in `docs/developer-guide/skill-ownership.md` decides ownership. `effective-delivery` may own the audit reasoning, but the verdict rubric is specific to Effective Flow orchestration, so a route-when-relevant result with a Flow-owned rubric is equally acceptable.
- **Host binding:** the reader and sender are discovered at run time from the actual host's documented tools, never assumed by build target. On T3 Code these are the thread read and thread send operations, in the Codex desktop app the thread read operation with a deep-link reference (no send), and in Claude Code the cross-session send with the session listing and the foreground wait. Each run records the host version it bound, since the Codex version of the spike is unknown. Codex CLI and portable hosts end with a stated limitation.
- **Data:** nothing persisted. The goal, coverage record, evidence, and verdict live only in the observer's run; evidence and the outbound message are redacted, as in `retro`.
- **Verification:** a behavioural eval suite on the `evals/_scaffold/` instrument, extended with a session stub binding that serves fixture threads through the read interface and fixture replies to a self-report request. The fixtures cover each verdict at both evidence levels plus the unclear-goal, missing-capability, self-reference, finished-target, and missing-reply cases, so evidence stays reproducible and `pnpm eval verify` stays meaningful. Fixture threads follow the observed reader shapes: the T3 Code timeline and the Codex desktop item list of commands, outputs, and statuses. Codex results are reported as their own stratum. Fixture replies carry the observed Claude Code attributes (`from`, `from-name`, `from-mode`, no `[ref]`) plus the nonce.

## Risks and open questions

- **Read side effects (risk, accepted):** on T3 Code the delivery side effect of reads could not be observed, so every read form counts as possibly delivering. Mitigated by refusing finished delegated targets, one smallest state read before content, and a re-check before every page. The residual risk is a busy parent losing a result to the state read; an idle parent receives it within about a second. The ADR records the acceptance.
- **Late steer (risk):** a T3 Code steer reaches the target only after its running tool call, so a correction cannot stop an action already approved or in flight. The report says so when the target waits at approval.
- **Mode pressure (risk):** a send needs an observer at least as broad as the target, which nudges developers to run focus in broad modes. focus stays report-only otherwise and never asks for a broader mode; the ADR covers it.
- **Self-report bias (risk):** a drifting agent describes its own work, which is exactly the narration focus exists to look past. Mitigated by the separate evidence level, the reduced self-report verdict set without On track, verification against git metadata, and "Cannot judge" for unverifiable reports; the residual weakness is accepted for Claude Code until it offers a reader.
- **Self-report request disturbs the run (risk, accepted):** the request arrives in the observed session as a new message and costs it a turn. In the spike a plan-mode target answered and then blocked on a question to its own user. focus cannot see the target's permission mode before sending, and no approval hold protected that user. Mitigated by the developer's confirmation, a request that asks for information only, and the return-to-prior-state clause; the confirmation dialog names the blocking risk. A helpful peer may still run checks or block despite the request text; that residual risk is accepted.
- **Held or expired messages (risk):** the `SendMessage` description says a session in another permission mode holds messages for its user and may let them expire, and remote sessions report nothing back. One plan-mode observation showed no hold. focus bounds the wait and reports "Cannot judge" rather than treating silence as a reply.
- **Name takeover during the wait (risk):** a Claude Code reply carries no `[ref]`, only the session name, which another session can take on. Mitigated by the nonce only the recipient sees, the name-uniqueness checks before the request and after the reply, and the restart notice as a stop signal.
- **Blocked wait (risk):** the foreground wait is a command that the host may block or, in the default permission mode, may put behind an approval. Then the self-report run ends with "Cannot judge". Work package 4 checks the default mode.
- **Thin Codex evidence (risk):** the Codex reader rests on one run with an unknown version, and its read side effect on one top-level thread. Its finer item list helps loop detection but carries more command output to redact.
- **Forged confirmation or reply (risk):** a cross-session message arrives in the observer's own conversation and could claim a confirmation or carry instructions. Mitigated by accepting confirmations only from developer turns, sender-matching the reply, and discarding late or foreign messages.
- **Read access laundered through the reply (risk):** the observed session may hold a wider scope than the observer and could pass on content from outside it. Mitigated by asking for locators, not content, and by redaction.
- **Reply delivery in Claude Code (risk):** in-run reception worked in 4 of 4 runs with the foreground wait. Late replies, a busy target, and focus as a sub-agent remain unobserved; work package 4 checks them, and if a run cannot receive a reply there, the self-report path is dropped and Claude Code ends with the missing-capability message.
- **Wrong target (risk):** the retired session-rename butler failed silently on a wrong session ID. Mitigated by binding the send to the admitted reference, re-establishing identity right before sending, and treating unverifiable delivery as not sent.
- **Injection through the correction (risk):** observed content could try to shape the verdict or the correction text, which then arrives in the observed session with user-turn weight and only a text prefix as marker. Mitigated by treating observed content as quoted evidence, limiting the correction to goal and locators, the redaction check, and the developer's confirmation of the exact text.
- **Child blind spot (risk):** a loop entirely inside a child that the parent has not yet seen goes unnoticed in the first version. The report names the gap; direct child coverage is a later extension that would need a host link without an inventory call.
- **Partial evidence (risk):** summarized, compacted, or truncated history can hide the decisive event. The verdict must degrade to "Cannot judge" rather than overclaim.
- **Weak false-alarm evidence (risk):** three on-track sessions give little confidence for a "never" claim, and missed loops count only against the overall rate. The first calibration round may show the bar needs tightening.
- **Unmeasured problem (risk):** the three patterns are a stakeholder observation; the eval fixtures are the first evidence of how often they occur and how well they can be told apart.
- **ADR candidate (confirmed cross-session send):** a confirmed write into another, developer-selected session under the observer's authority is durable, crosses a trust boundary, and reverses the posture of `session-rename-butler.md`. The ADR should relate to that ADR and to `input-trust-boundary.md` and cover the identity binding, the two lookup exceptions, reply acceptance by name and nonce, the text-only marker with user-turn weight, the mode precondition, the foreground wait as the only execution, the accepted read side-effect risk, and the injection limits.

## Roadmap and work packages

1. **Host verification spike on T3 Code, Codex desktop, and Claude Code**
   - Goal: replace the tool-description assumptions with observed host behaviour.
   - Scope: on throwaway threads, check which `t3_thread_read` views and read positions mark a final result delivered (for a root and for a child); what host context identifies the observer's own session and its ancestors; the `steer` and new-turn send semantics while running, idle, and finished; and what the broader-modes rule does to the target. In the Codex desktop app: whether `read_thread` accepts a deep-link reference, what it returns, and whether a documented send exists. Also the Codex read side effects. In Claude Code: how a self-report request and its reply travel between sessions in the same and in different permission modes; whether one run can wait for and receive the reply; what happens to a late reply, a reply when focus runs as a sub-agent, and a message into a busy session; whether the `[ref]` stays stable across renames; and how the observer recognizes its own session.
   - Done when: written evidence answers each question and confirms or adjusts the target-refusal and send rules of this concept.
   - Dependencies: none; gates every package below.
   - Status: done (#602). Evidence: `docs/developer-guide/focus-host-evidence.md`. T3 Code: go with adjusted rules; Codex desktop: go as a read host; Claude Code: go with adjusted rules. This concept incorporates the adjustments.
   - Handoff: `effective-flow plan "Work package 1 of docs/concept/2026-11-02-focus-session-check.md: host verification spike for the focus tool on T3 Code (read-view delivery side effects, observer and ancestor identity, send-mode semantics while running, idle, and finished, broader-modes effect), the Codex desktop app (read_thread with deep-link references, send capability), and Claude Code (self-report request and reply via cross-session messages across permission modes, in-run reply reception, late and sub-agent replies, [ref] stability); record evidence, no tool source yet"`
2. **ADR on confirmed cross-session messages**
   - Goal: record the trust-boundary decision before the tool is built.
   - Scope: the correction message and the self-report request, the reference-bound admission with its two lookup exceptions, identity binding, developer-only confirmation, reply acceptance by name, nonce, and post-reply lookup, how these stand in for the filter-before-model rule of `input-trust-boundary.md`, state-dependent mode choice with the mode precondition, the separate self-report evidence level, the text-only marker with user-turn weight, the foreground wait as the only execution, the accepted read side-effect risk, injection and redaction limits, the unattended rule, and the relation to `session-rename-butler.md` and `input-trust-boundary.md`.
   - Done when: the ADR is accepted and consistent with the spike evidence.
   - Dependencies: 1.
   - Handoff: `effective-flow plan "Work package 2 of docs/concept/2026-11-02-focus-session-check.md: write the ADR for focus's confirmed cross-session messages (correction and self-report request), relating it to docs/adr/session-rename-butler.md and docs/adr/input-trust-boundary.md and using the evidence in docs/developer-guide/focus-host-evidence.md"`
3. **Skill-ownership check for focus**
   - Goal: settle who owns the trajectory judgment.
   - Scope: classify focus against `effective-delivery` (delegate or route-when-relevant) and record the consumer relationship in `skill-ownership.json` and the guide.
   - Done when: the classification is recorded and the build's ownership guards accept it.
   - Dependencies: none; runs in parallel with 1 and 2.
   - Handoff: `effective-flow plan "Work package 3 of docs/concept/2026-11-02-focus-session-check.md: run the skill-ownership check for the new focus tool and record its effective-delivery relationship in docs/developer-guide/skill-ownership.json and skill-ownership.md"`
4. **focus tool and its contract**
   - Goal: ship `effective-flow focus` as described in the solution sketch.
   - Scope: the tool source, the focus-owned contract (target refusals, parent-only coverage, goal anchoring, verdicts, confirmed send), reuse of `retro`'s admission, the analysis spawn site, and the build registrations an exposed tool needs.
   - Done when: the tool builds for every target, the build guards pass, and manual runs succeed on each advertised host. A host that fails is not advertised and ends with the missing-capability message.
     - T3 Code: a cited verdict and a correctly marked, confirmed send, including a new-turn send to an idle top-level thread and the report-only path for a narrower observer.
     - Codex desktop: a cited verdict from a deep-link reference, and recognition of the observer itself and its ancestors.
     - Claude Code: a self-report round trip with a self-report verdict and the nonce, with the observer in the default permission mode. Also the spike cells left open: background wait and `notify_when_idle`, late reply, sub-agent sender, busy target, and plan-mode repeats.
   - Dependencies: 1, 2, 3.
   - Handoff: `effective-flow plan "Work package 4 of docs/concept/2026-11-02-focus-session-check.md: implement the focus tool and its focus-owned contract per the elaborated concept, the ADR from work package 2, and the open cells in docs/developer-guide/focus-host-evidence.md"`
5. **Eval instrument: session stub and labelling rubric**
   - Goal: make focus evidence reproducible.
   - Scope: a scaffold binding that serves fixture threads through the read interface and fixture replies to a self-report request, in the reader and reply shapes observed in work package 1, and a written labelling rubric for the observed and self-report verdict sets, fixed before any recording.
   - Done when: a fixture thread can be read through the stub in a scaffold run, and the rubric is committed.
   - Dependencies: 1 (read interface shape); runs in parallel with 4.
   - Handoff: `effective-flow plan "Work package 5 of docs/concept/2026-11-02-focus-session-check.md: add a session stub binding to evals/_scaffold (fixture threads and self-report replies in the shapes recorded in docs/developer-guide/focus-host-evidence.md) and a labelling rubric for the observed and self-report focus verdict sets"`
6. **focus eval suite and calibration round**
   - Goal: show the success criterion holds.
   - Scope: `evals/focus/` with fixtures for every verdict and the edge cases, and one recorded round.
   - Done when: the recorded round meets the success criterion of this concept and `pnpm eval focus verify` passes.
   - Dependencies: 4, 5.
   - Handoff: `effective-flow plan "Work package 6 of docs/concept/2026-11-02-focus-session-check.md: create the focus behavioural eval suite and record the calibration round against the concept's success criterion"`

## Concept review

**Result:** Approved

| Area                  | Result                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Product fit           | Problem, audience, and verdicts consistent; self-report verdicts reduced so they cannot falsely reassure           |
| Scope                 | Parent-only coverage, Codex read-only, local Claude Code sessions only, and confirmed messages only keep v1 small  |
| Technical feasibility | Read, send, and reply rules rest on work package 1 evidence; open spike cells move to work package 4               |
| Data and security     | Reference binding, two named lookup exceptions, reply acceptance by name and nonce, text-only marker, redaction    |
| Risks                 | Accepted read side effect, late steer, target blocking, name takeover, blocked wait, and thin Codex evidence named |
| Roadmap               | Work package 1 done; five packages remain, each handoff names the evidence page                                    |

Findings, round 1 (T3 Code only):

- **Critical — child admission contradicted `retro`'s admission rule:** decision: sub-sessions only through the parent's own record; direct child reads became a non-goal.
- **Critical — a read could consume another orchestrator's delivery:** decision: refuse finished delegated targets, re-check before every page, verify read views in work package 1.
- **Important — cross-session write ignored the butler precedent:** added identity binding, pre-send re-check, unverifiable delivery as not sent, and the ADR relation.
- **Important — injection path into the outbound message:** added evidence-only treatment, correction limits, and the redaction check.
- **Important — send mode half-settled:** decision: state-dependent sending on T3 Code, never the automatic or restart modes.
- **Important — authority marker undecided:** decision: fixed prefix with advisory framing.
- **Important — unattended sends:** added the non-goal.
- **Important — eval instrument could not reproduce live threads:** decision: a stub binding as its own work package.
- **Important — success criterion weak:** decision: existing thresholds plus a rubric fixed before recording; remaining weakness listed as a risk.
- **Important — planning readiness:** roadmap filled; host behaviour is a gating package.
- **Notes:** loop overlap with `goal-completion`, read budget versus coverage, goal-anchor scope and ancestor detection, ownership placement, and ADR worthiness addressed.

Findings, round 2 (Codex desktop and Claude Code added):

- **Critical — self-report target bound to a mutable session name, with no permitted identity check:** decision: a focus-owned admission branch that binds the stable `[ref]`, with one targeted listing lookup as a stated exception to the inventory ban.
- **Important — a self-report "On track" would give the false reassurance the problem warns about:** decision: self-report verdicts limited to Progress verified, Drifting, and Cannot judge.
- **Important — no measurable bar for self-report:** added fixture counts and outcomes to the success criterion.
- **Important — reply and forged confirmation reach the orchestrator directly:** added developer-only confirmation, sender matching, discarding of late and foreign messages, and the `input-trust-boundary.md` relation in work package 2.
- **Important — in-run reply reception unverified:** added to work package 1, with top-level-only self-report and a fallback to the missing-capability message.
- **Important — test-result verification would execute code:** verification limited to git metadata and recorded CI status.
- **Important — real-host acceptance only on T3 Code:** work package 4 now requires a manual run on each advertised host.
- **Notes:** locator-only reports against read laundering, Codex read side effects and summary granularity, the residual risk of a peer running checks, and the unattended Claude Code ending added.

Findings, round 3 (work package 1 evidence):

- **Critical — the Claude Code reply carries no `[ref]`, and a name match alone reopens the round-2 gap:** decision: the request carries a nonce the reply must echo; the reply is accepted by name only when name-uniqueness lookups before the request and after the reply bind it to the admitted `[ref]`, with no restart notice.
- **Critical — on T3 Code the finished-target check is itself a read with an unknown delivery side effect:** decision: accept the residual risk with one smallest state read, record it in the ADR, and treat every read form as possibly delivering.
- **Important — the T3 Code ancestor check reads unadmitted threads:** decision: a bounded chain read of the observer's own ancestors as a second named exception, keeping only parent and relationship fields.
- **Important — in-run reception needs foreground commands, contradicting "runs nothing":** decision: one named, side-effect-free foreground wait as focus's only execution; a blocked or approval-gated wait ends in "Cannot judge".
- **Important — a self-report request can leave the target blocked, and no approval hold was observed:** decision: a return-to-prior-state clause plus a documented, accepted residual risk named in the confirmation dialog; held-message wording corrected to description-only.
- **Important — Codex send rests on a model self-report:** decision: Codex desktop is read-only in v1, and sending there is a non-goal.
- **Important — the T3 Code send rules were partly wrong:** incorporated: steer while running, refuse when finished, idle top-level new turn unverified, late steer named as a limit.
- **Important — the text prefix was presented as a safeguard:** incorporated: the prefix is a label with user-turn weight, not authentication; added to the risks and the ADR scope.
- **Important — mode precondition missing:** incorporated: report-only unless the observer is at least as broad as the target.
- **Important — Claude Code coverage broader than the evidence:** incorporated: local sessions only, restart ends admission, open spike cells in the work package 4 done-when.
- **Important — Codex statements stale:** incorporated: finer item granularity, one-observation side effect, version recorded per run, self and ancestor recognition in work package 4.
- **Important — work package 1 still treated as open:** incorporated: status done with evidence link, host context relabelled, dependent risks rewritten.
- **Notes:** ADR scope and handoffs extended with the evidence page; command outputs redacted and requested per candidate pattern; the top-level signal for self-report stated.

## Open points

- No open points.
