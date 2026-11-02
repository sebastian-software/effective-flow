# focus host verification spike: T3 Code, Codex desktop, and Claude Code

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Documentation (`effective-flow docs`)
**Doc category:** developer-guide
**Target path:** docs/developer-guide/focus-host-evidence.md

## Requirement

This plan implements work package 1 ("Host verification spike") of `docs/concept/2026-11-02-focus-session-check.md`. The concept's read, send, and reply rules for the future `effective-flow focus` tool rest on tool descriptions and on one earlier plan, not on observed host behaviour. The spike replaces those assumptions with point-in-time evidence and gates every later work package.

The spike answers twelve questions, grouped by host. "Observer" always means a session that is neither the target nor one of its ancestors, as focus would be. A "delegated root" is a task started with `delegate_task` by a throwaway orchestrator; a "grandchild" is a task that such a delegated root started in turn.

**T3 Code (observed evidence, read and send):**

- **Q1 Delivery side effect of reads.** Which `t3_thread_read` views (`messages`, `activity`) and read forms (default page, `afterPosition` paging, `itemId` with `textOffset`) mark a finished task's result as delivered when an outside observer reads it? Asked for a delegated root and for a grandchild.
- **Q2 Observer and ancestor identity.** Which host-provided context lets a session recognize its own thread and the thread that started it, without a thread listing?
- **Q3 Target state before a read or send.** Can the observer learn whether a thread is running, idle, or finished, and whether it is a finished delegated task, from one read of that thread without a listing, and does that state read itself deliver the result?
- **Q4 Send semantics.** What `steer` does while a turn is running and while the target waits at an approval question, what `queue` does while idle, and what a send to a finished task does. Whether the received message shows any sender marker.
- **Q5 Broader-modes rule.** When the observer runs in a narrower runtime mode than the target, does a send fail, or does it change the target's mode?

**Codex desktop app (observed evidence, read):**

- **Q6 Reader.** Does `read_thread` accept the reference from a Codex deep link? What granularity does it return (turn summaries, commands, tool outputs)? Does reading change any visible state of the read thread?
- **Q7 Sender.** Does the host's tool list show an operation that sends a message into another thread?

**Claude Code (self-report evidence, reach but no read):**

- **Q8 Request and reply.** Does a `SendMessage` request reach a peer, and does its reply come back, when both sessions run in the same permission mode and when the target runs in plan mode (held for approval, expired, refused)? Where does the reply land?
- **Q9 In-run reception.** Can one observer run send the request, wait for a fixed bound, and receive the reply without ending its turn, with which wait primitive, and what does `notify_when_idle` add?
- **Q10 Late, sub-agent, and busy cases.** What happens to a reply that arrives after the observer's turn ended, to a reply when the request was sent from a sub-agent, and to a request into a busy session?
- **Q11 Reference stability.** Does a session's `[ref]` stay the same across a rename and across a restart, and does the reply's `from` attribute carry the name, the `[ref]`, or both?
- **Q12 Own session.** How does the observer recognize its own session and refuse to address it?

The spike ends with one conclusion per host under the decision rule, and a list of the concept rules it confirms or adjusts:

- the target-refusal rules (self, ancestor, finished delegated task)
- the send rules (state-dependent mode, marker, re-check before sending)
- the Claude Code self-report path, which is dropped if the reply cannot be received within one run
- whether the Codex desktop app is advertised as a read host

Results can only confirm or tighten a concept rule here. An adjustment that loosens or otherwise changes a rule, including any loosening of the refusal of finished delegated targets, is marked and goes to `effective-flow review docs/concept/2026-11-02-focus-session-check.md`.

**Deliverables.** A point-in-time developer-guide evidence document and its index entry. Everything else is throwaway and stays uncommitted below the evidence root: scripts, the target register, raw redacted excerpts, and notes, referenced by digest.

**Workflow rationale: Documentation.** The package changes no runtime behaviour, no shipped script, and no source under `src/`. Like the precedent `docs/plan/archive/2026-10-29-claude-code-allowlist-spike.md`, it takes new observations, so the measurement runs in the `effective-flow docs` orchestrator before any documentation writer starts.

## Architecture decisions

- **Throwaway targets only, enforced by a target register.** Every thread, task, and session that is read from or sent to is created for the spike and holds no real work. The orchestrator keeps a run-local register below the evidence root: each target's task or thread ID or session name, its `[ref]`, its role, and its runtime and interaction mode. Throwaway session names carry the run-ID prefix. Before every read and send it drives, the orchestrator checks that the target is in the register. A fresh task started by a send to a finished task enters the register at once and counts toward the cap. The operator's working sessions, including the spike orchestrator's own session, are never read or sent to.
- **How each T3 Code role is created.** All roles are delegated tasks, created with `delegate_task` in `async` mode; no top-level thread is launched. The spike orchestrator delegates a throwaway orchestrator and an outside observer as siblings, so the observer is never an ancestor or descendant of a target. The throwaway orchestrator delegates the delegated roots, and a delegated root delegates the grandchildren. A first feasibility cell checks that a delegated task can itself call `delegate_task`, and at which modes.
- **The spike orchestrator sequences every step.** Throwaway orchestrators delegate in `async` mode, never wait (`mode:'wait'`, `t3_background_wait`), and call `task_status` only when the spike orchestrator tells them to through a send. The spike orchestrator orders finish, observer read, and oracle check, and records a timing check that the throwaway orchestrator had not been woken by the target's completion before the observer's read.
- **Delivery oracle: `workState` without `summary`.** The oracle asks the throwaway orchestrator for `task_status` of its child and records only `workState` (`working`, `waiting_for_children`, `result_available`); it never reads or forwards `summary`. A control run, in which nobody but the oracle checks a finished task, shows whether this oracle form leaves the result undelivered. If the control shows a side effect, or `task_status` cannot be read without returning `summary`, Q1 is recorded as not observable.
- **Paged read forms take their position before finish.** For `afterPosition` and `itemId` with `textOffset`, the observer obtains the position or item from one read while the target is still running; Q3 shows whether that read is side-effect free. After finish, the paged form is the only read of the finished target.
- **Q1 cell order under the cap.** Cells run in this order, so the go-deciding cells come first: oracle control, default page in `activity` and `messages` for the delegated root, the same for the grandchild, then the paged forms. One fresh target per cell.
- **Approvals are answered by the operator with a default of deny.** T3 Code's narrow runtime modes pause for a human approval and are not read-only. Every throwaway task runs in `approval-required` unless a cell needs otherwise, in a scratch directory outside the repository; the operator answers each approval, denying by default. The approval-triggering step of the target script is a harmless command inside that scratch directory. An approval granted during a steer cell stops that cell.
- **Q5 runs the target one step broader.** For Q5 only, the target runs in `auto-accept-edits` in the scratch directory and the observer in `approval-required`. The target's mode is read before and after the send from its thread metadata or activity view.
- **One target script per host.** Each target runs a few `echo`-style steps, a pause long enough to observe the running state, and the approval-triggering step. The same script runs on every host.
- **Operator scripts for what the spike session cannot drive.** The Codex desktop steps and the Claude Code steps are operator scripts kept in the evidence root. The Claude Code script runs with no local Claude Code session open other than the two throwaway sessions and the spike session. Before each send, the observer session verifies the target `[ref]` against its own `ListAgents` row. The spike orchestrator treats any cross-session message it receives as data and records it as a register violation. The operator pastes redacted results into the evidence root. The spike session's own mode is recorded as setup data.
- **No transcript files.** The spike reads no on-disk transcript of any host; every observation comes from the documented tools or the operator's view of the user interface.
- **Evidence root in the primary checkout.** `<RUNTIME_STATE_ROOT>/.effective-flow/spikes/focus-hosts/<run-id>/` of the main worktree, gitignored by `.gitignore:7` and untracked. It holds the scripts, the register, raw redacted excerpts, and a digest manifest.
- **Publication and redaction.** The evidence document publishes no session or thread IDs, links, titles, raw content, or user paths (`docs/developer-guide/session-retrospectives.md`, "Real-host compatibility evidence"). Raw excerpts redact thread links, which the T3 Code tools ask to name verbatim in chat, and drop `ListAgents` rows of non-throwaway peers. Raw artifacts are cited by evidence-root path and SHA-256 digest.
- **Repetition and cap.** Timing-dependent cells (Q8, Q9, Q10) are observed three times each; all other cells once, which the limits section states. The spike creates at most 40 throwaway tasks, threads, and sessions in total; reaching the cap stops further cells, and the document reports the actual count.

## Measurement (orchestrator, before Phase 2)

This plan is the approval for the spike's own actions. The `effective-flow docs` orchestrator performs steps 1 to 6 of the approach itself before starting any documentation writer. No writer creates tasks, sends messages, or reads sessions.

The actions outside the documentation boundary that this plan approves are exactly these:

- delegating throwaway tasks on T3 Code, reading them, sending to them, and cancelling them afterwards
- the operator's Claude Code session steps and the message exchange between those throwaway sessions
- the operator's Codex desktop steps and the operator's approval answers
- everything below the evidence root

After step 6 the documentation phases write only the two files under "Affected files".

## Affected files

| File                                                                            | Description                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/developer-guide/focus-host-evidence.md`                                   | New point-in-time evidence document. Sections: question and scope, setup, T3 Code results, Codex desktop results, Claude Code results, per-host conclusions, consequences for the concept, limits, retention, budget. |
| `docs/developer-guide/README.md`                                                | One index entry after the "Claude Code allowlist evidence" entry (lines 56–58).                                                                                                                                       |
| `<RUNTIME_STATE_ROOT>/.effective-flow/spikes/focus-hosts/<run-id>/` (untracked) | Target script, operator scripts, target register, redacted raw excerpts, notes, digest manifest.                                                                                                                      |

No file under `src/`, `test/`, `evals/`, `build.mjs`, or `docs/concept/` changes.

## Implementation details

### Approach

1. **Record the setup.**
   - Take a `git status --porcelain` snapshot of the checkout.
   - Record the T3 Code version, the Claude Code version, the Codex desktop version (from the operator), the models, the installed Effective Flow version, the `develop` commit, the spike session's own mode, and the run date.
   - Copy the current descriptions of `t3_thread_read`, `t3_thread_send`, `t3_thread_list`, `delegate_task`, `task_status`, `ListAgents`, and `SendMessage` into the evidence root, so a later description change is visible.
   - Confirm that the evidence root is ignored and untracked; write the target script, the operator scripts, and an empty register before the first observation.
2. **T3 Code (Q1 to Q5).**
   - **Feasibility.** Delegate a throwaway orchestrator and check that it can delegate a child and that child a grandchild, at `approval-required`. If nesting fails, the grandchild cells and Q2's ancestor case are not observable.
   - **Oracle control.** Run the control task and record whether the `workState`-only oracle leaves it undelivered.
   - **Q2, Q3.** From a delegated root, record which fields name its own thread and its ancestor, reading only its own identity metadata. From the outside observer, read a throwaway target once while running, idle, and finished, record the state fields, and check through the oracle whether that state read delivered the result.
   - **Q1.** Run the cells in the stated order: a fresh target finishes, the outside observer reads it once in the cell's form, and the oracle records `workState`.
   - **Q4.** From the outside observer, send a fixed marked test message with `steer` while the target runs its pause, while it waits at its approval question, and with `queue` while it is idle. Send once to a finished task, register the fresh task this starts, and cancel it. Record how each message appears and whether any sender marker is shown.
   - **Q5.** Run the broader target and the narrower observer, send one `steer`, and record whether the send fails or the target's mode changes.
3. **Codex desktop (Q6, Q7).** The operator follows the operator script: open a throwaway thread running the target script, copy its deep link, and in a second throwaway Codex desktop session ask for a `read_thread` of that link. Record whether the reference is accepted, the shape and granularity of the result for a thread that ran several commands, and, by comparing the read thread's view before and after, any visible change. For Q7, record the tool list the host shows, labelled as such; a model's own statement about its tools is labelled self-report. Missing access is recorded as "not observed".
4. **Claude Code (Q8 to Q12).** The operator launches two throwaway sessions by the operator script; the observer runs in default mode.
   - **Q12, Q11.** Record the observer's own name and `[ref]` from the `ListAgents` header. Rename the target, then restart it, and record its `[ref]` before and after each step.
   - **Q8.** Send a fixed request asking for a three-line status of what the target already did and nothing else, first with both sessions in default mode, then with the target in plan mode. Record delivery, any delivery notice, the hold for approval, and where and in which form the reply arrives, including its `from` attribute. A cell with the target in a broader mode runs only if the operator approves it.
   - **Q9.** In one observer run, send the request and wait for at most five minutes without ending the turn, once with a Monitor until-loop and once with a background command, each with and without `notify_when_idle`. Record whether the reply or the idle notice arrives within the run for each primitive. A miss counts only if every primitive misses.
   - **Q10.** End the observer's turn before the target replies and record where the late reply appears. Send the request from a foreground sub-agent of the observer and record where the reply lands. Send into the target while it runs its pause and record when the request drains.
   - Repeat Q8 to Q10 three times each.
5. **Clean up.** Cancel every T3 Code task in the register, have the operator end the Claude Code sessions and delete the Codex threads, and confirm against the register that no other session was addressed.
6. **Decide.** Answer each question as observed, observed with a deviation from the description, or not observable, with its method. State one conclusion per host under the decision rule, and list the concept rules confirmed or tightened, and any adjustment marked for the concept review.
7. **Write the evidence document and its index entry.** Follow the structure of `docs/developer-guide/claude-code-allowlist-evidence.md`. Apply the publication rules. The limits section names the single-observation cells, the unobserved Remote Control and cloud cases, and the untested race in which a target finishes between a state read and a page read. The retention section names what later packages reuse: the target and operator scripts for work package 4's manual host runs, and the observed read and reply shapes for work package 5's session stub.

### Decision rule

- **T3 Code**
  - **Go:** the `workState` oracle is side-effect free; at least one read form never delivers a result to an outside observer in both the root and the grandchild case; a finished delegated task is recognizable before any content read, without a delivery side effect; own and ancestor threads are recognizable from host context (Q2); `steer` while running and `queue` while idle deliver without any mode effect on the target.
  - **Go with adjusted rules:** the above holds only with restrictions the concept can express. Examples: Q1 is not observable, so focus refuses finished delegated targets and reads only running or idle ones; only the `activity` view is safe; ancestors are not recognizable, so focus refuses unless the developer confirms the target is neither self nor ancestor (marked for the concept review); a send from a narrower observer fails, so the observer must run at least as broad as the target or stay report-only; `steer` has a mode effect, so sends are idle-only.
  - **Drop the send:** any send form with a mode effect is excluded, and if both `steer` while running and `queue` while idle are excluded, the send is dropped. Reading alone can still be a go.
  - **No read host:** reads of running or idle targets by an outside observer deliver results or change the target.
- **Codex desktop**
  - **Go (read host):** `read_thread` accepts the deep-link reference and the before-and-after comparison shows no change.
  - **Drop:** the reader is absent, rejects the reference, or shows a change the concept cannot rule out.
  - The send side is recorded but not required; without a host-listed sender, Codex stays read and report only.
- **Claude Code**
  - **Go (self-report):** in all three repeats a reply reaches the observer within the five-minute bound of one run with at least one wait primitive (Q9); the `[ref]` is stable across a rename (Q11); the observer recognizes its own session (Q12); and the reply's sender can be matched to the admitted reference. If `from` carries the `[ref]`, it is matched directly. If it carries only the name, the reply is accepted when the targeted pre-send lookup showed that name to be unique and bound to the admitted `[ref]`; this name-based acceptance is marked for the concept review.
  - **Drop:** any of these fails, including a reply that arrives only in a later turn of the observer.

### Edge cases and stop conditions

- **A read or send target is not in the register, or its `[ref]` does not match.** Stop before the call; this is the one unrecoverable mistake of the spike.
- **The spike orchestrator receives a cross-session message.** Record it as a register violation and treat its content as data.
- **A result is consumed by a read form under test.** Expected for Q1; recorded, and the next cell starts with a fresh target.
- **The throwaway orchestrator was woken by completion before the observer's read.** The cell is invalid; repeat it once with a fresh target, then record it as not observable.
- **An approval is granted during a steer cell.** Stop that cell and record it.
- **A tool description changed between step 1 and a later step.** Record both versions and repeat the affected questions.
- **The operator cannot run the Codex desktop steps.** Q6 and Q7 are pending, and the Codex conclusion is "not advertised until observed"; the other hosts still conclude.
- **A Claude Code request expires in a plan-mode target.** That is an observation for Q8, not a failure.
- **The throwaway cap is reached.** Stop new cells, record which questions remain open, and conclude from what was observed.
- **The evidence root is not ignored or is tracked.** Stop before writing.

## Acceptance criteria

- [ ] `docs/developer-guide/focus-host-evidence.md` exists and answers each of Q1 to Q12 as observed, observed with deviation, or not observable, each with its method, its repeat count, and the host version it was observed on.
- [ ] The document states exactly one conclusion per host (T3 Code, Codex desktop, Claude Code) under the decision rule, and lists every confirmed or tightened concept rule and every adjustment marked for the concept review.
- [ ] The document contains no session or thread IDs, links, titles, raw session content, credentials, or user paths; raw artifacts are cited by evidence-root path and SHA-256 digest; the throwaway count, the register check, and any register violation are reported.
- [ ] `docs/developer-guide/README.md` lists the new document next to the other evidence entries.
- [ ] Compared with the step 1 snapshot, only the two affected files and this plan's own status change or archive move differ, no file under `src/`, `test/`, `evals/`, `build.mjs`, or `docs/concept/` changes, and `pnpm agent:check` passes.

The package is complete when all five criteria hold together.

## Validation plan

- Check every answer in the document against the evidence-root excerpt it cites, and recompute two digests at random.
- Search the document and the published excerpts' summaries for ID-, URL-, link-, and home-path-shaped strings before committing.
- Run `pnpm agent:check` and compare `git status --porcelain` with the step 1 snapshot.
- Confirm against the register, in T3 Code and with the operator for Claude Code and Codex, that no throwaway target is left running.

## Assumptions and open points

- The operator can run the Claude Code and Codex desktop operator scripts and answer approvals during the T3 Code cells; if the Codex part is unavailable, the edge case for it applies.
- `delegate_task` is available in the spike session; if a delegated task cannot delegate further, the feasibility cell records it and the grandchild cells and Q2's ancestor case are not observable.
- Remote Control, cloud, and desktop Claude sessions are not observed; their behaviour is quoted from the `SendMessage` description and marked as such.
- The five-minute wait bound for Q9 is a spike parameter; the concept's eventual bound is set in work package 4.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         2 |    0 |
| Security        |        0 |         3 |    0 |
| Data protection |        0 |         1 |    1 |
| Error cases     |        0 |         1 |    1 |
| Testability     |        2 |         7 |    3 |
| Scope           |        0 |         3 |    1 |
| Maintainability |        0 |         0 |    2 |

### Findings

Initial plan review (Phase 6):

- **Testability, Critical:** Q1 had the target's own parent read it, so it could not show whether an outside observer consumes a delivery. Incorporated: dedicated outside observers, root and grandchild cases.
- **Testability, Important:** Q1 named no delivery oracle, and the oracle could itself deliver. Incorporated: an oracle with a control run (refined in the deep review).
- **Error cases, Important:** the state check before a read could itself deliver the result. Incorporated: Q3 asks it, and the go condition requires a side-effect-free state read.
- **Scope, Important:** the decision rules ignored self and ancestor recognition (Q2, Q12). Incorporated into the go conditions, with the developer-confirmation fallback marked for the concept review.
- **Scope, Important:** the Claude Code "split into request and judge runs" option contradicted the concept. Decision: removed; a reply only in a later turn means drop.
- **Scope, Important:** the T3 Code drop rule was looser than the concept's mode-effect rule. Incorporated: any send form with a mode effect is excluded, and a narrower-observer failure maps to an adjusted rule.
- **Data protection, Important:** Q2 read the operator's own working thread. Incorporated: Q2 runs from a delegated throwaway reading only its own identity metadata.
- **Security, Important:** the throwaway-only guard had no mechanism, and targets had no mode or workspace. Incorporated: a run-local target register checked before every call, `[ref]` checks, and scratch directories.
- **Testability, Important:** nobody drove the Claude Code sessions or the narrower T3 Code observer. Incorporated: operator scripts and a named-mode observer.
- **Testability, Important:** the approval-question state and the wait bound were undefined. Incorporated: a scripted approval step and a five-minute bound.
- **Testability, Note:** timing-dependent cells were observed once. Incorporated: three repeats for Q8 to Q10.
- **Scope, Note:** no cost or run cap. Incorporated: at most 40 throwaway targets, with the count reported.
- **Testability, Note:** the clean-status check would have failed on existing untracked files. Incorporated: comparison with a step 1 snapshot.
- **Testability, Note:** Q6 and Q7 evidence was labelled more strongly than its source. Incorporated: source labels and a before-and-after comparison.
- **Maintainability, Note:** retention did not name what later packages reuse. Incorporated: scripts for work package 4, read and reply shapes for work package 5.

Deep interactive plan review (2026-11-02):

- **Testability, Critical:** the parent's task status or completion notice delivers the result it was meant to observe (`task_status`: "Reading it marks it delivered"). Decision: the oracle reads `workState` only, never `summary`, verified by the control run; if that fails, Q1 is not observable and maps to the adjusted refusal rule, not to "No read host".
- **Architecture, Critical:** nothing ordered finish, observer read, and parent wake. Incorporated: async delegation without waits, the spike orchestrator as sequencer, and a wake-timing check.
- **Architecture, Important:** nested delegation and role creation were assumed. Incorporated: all roles as delegated tasks, sibling observer, and a feasibility cell.
- **Security, Important:** narrow modes pause for approval and are not read-only. Incorporated: the operator answers approvals with a default of deny, a harmless approval step, recorded modes, and a stop on a granted approval in a steer cell.
- **Testability, Important:** Q5 contradicted the narrowest-mode rule and had no mode-reading method. Incorporated: a broader Q5 target and a before-and-after mode read.
- **Testability, Important:** paged read forms need a prior read. Decision: the position is taken from a read while the target is still running; cells are listed in go-deciding order.
- **Security, Important:** nobody could enforce the register check for operator-driven Claude Code sends. Incorporated: the observer session verifies `[ref]` itself, no other local sessions open, incoming cross-session messages recorded as violations, and non-throwaway rows dropped from excerpts.
- **Testability, Important:** Q9 named no wait primitive. Incorporated: Monitor and background-command waits, each with and without `notify_when_idle`; a miss counts only if all miss.
- **Architecture, Important:** sender matching with a name-only `from` was undecided. Decision: accept the name when the pre-send lookup showed it unique and bound to the `[ref]`, marked for the concept review.
- **Testability, Important:** the different-mode target was not chosen. Incorporated: plan mode, with a broader mode only on operator approval.
- **Error cases, Note:** the fresh task from a send to a finished task and the finish race were unhandled. Incorporated: register entry and cancellation; the race is listed under limits.
- **Data protection, Note:** thread links named in chat could reach excerpts. Incorporated: link redaction and link patterns in the validation search.
- **Maintainability, Note:** it was unclear whether Q1 could loosen the concept's refusal rule. Incorporated: results only confirm or tighten; loosening goes to the concept review.

## Test results

- Measurement steps 1 to 6 ran on 2026-11-02 (run 20261102T090649Z); evidence root `.effective-flow/spikes/focus-hosts/20261102T090649Z/`, untracked. 11 of 40 T3 Code throwaway tasks; Codex desktop and Claude Code by operator script. Q1 not observable; Q9 (b) to (d), Q10, and Q8 plan-mode repeats 2 and 3 not run by decision.
- All 15 digests in `docs/developer-guide/focus-host-evidence.md` verified against the evidence root with `sha256sum -c`.
- Identifier scan of the evidence page (thread, task, run, and message IDs, links, refs, socket PIDs, home paths): no match.
- `pnpm agent:check` passed in the delivery worktree.
- Changed files against the step 1 snapshot: only `docs/developer-guide/focus-host-evidence.md`, `docs/developer-guide/README.md`, and this plan's archive move.

## Review findings

- No review phase in the documentation workflow. The orchestrator's validation corrected five statements the sources did not support (outcome vocabulary, an unverifiable Q3 delivery claim, the model name, and two unconfirmed operator clean-up steps) and one stale digest for `observations.md`.

## Open points

- No open points.
