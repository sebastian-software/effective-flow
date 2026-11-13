# Focus cross-session messages

## Status

Active

Status note, November 13, 2026: the report-only snapshot path and the opt-in report-only follow-up
path are enabled on the T3 observed path, the follow-up path under the documented host prerequisite
and with the limitations of the [F record for candidate `024bcb2a`](../developer-guide/focus-host-acceptance.md#f-record-for-candidate-024bcb2a):
F3, where Looping was not reproducibly reported, and F12, where the loop cap and the cap tick's
deletion were not observed. All sends stay disabled. The decision below is unchanged.

## Context

A session that drifts cannot see its own drift. The planned `effective-flow focus` tool is an outside
observer that checks another session against its goal, and to be useful it sometimes has to say
something back: a course correction, or, on hosts where it cannot read the target, a request for
the target's own report. The decision is taken before the tool exists. Work package 4 of the
[concept](../concept/2026-11-02-focus-session-check.md) implements it, and this file is updated in
place if that work's real-host runs contradict it.

Sending text into another session is the pattern the [session rename butler](./session-rename-butler.md)
retired. Its failures were a world-writable title acting as a capability, a session identifier
crossing a trust boundary, an unverified prose guard, and success against the wrong target. The
[input trust boundary](./input-trust-boundary.md) adds that third-party text remains data and is
filtered before model processing. On Claude Code a reply was observed arriving in the model's
context inside a system reminder between tool calls (3 runs); no host-side pre-model filter or hook
was observed or is known, so a literal filter is inferred to be impossible for a prompt-level tool.

The host facts below come from the dated spike on 2026-11-02, recorded in
[focus host evidence](../developer-guide/focus-host-evidence.md) (plan:
[host verification spike](../plan/archive/2026-11-02-focus-host-verification-spike.md)). Most cells
there are single observations, and this ADR states only what that page supports.

## Decision

Each rule is a decision with its reason and its evidence tag. Exact mechanics (lookup fields, nonce
format, verdict wording, wait duration) belong to the focus contract of work package 4, so that
contract is stated once.

1. **What may cross: exactly two message kinds, the correction and the self-report request.** Each
   goes out only after a developer turn in the same run confirms its exact text; a cross-session
   message or other observed content never confirms. Unattended or scheduled runs send nothing. At
   most one request and one correction go out per invocation, and nothing is resent after a missing
   or late reply. Reason: consent stays with the human, and volume stays bounded. (Design decision,
   no host claim)
2. **Identity binding uses the host's stable reference, never a name.** On T3 Code that is the thread
   ID; on Claude Code the `[ref]`, stable across a rename but new after a restart, so it binds one
   process lifetime (Evidence: observed, 1 run, [Q11](../developer-guide/focus-host-evidence.md#claude-code-results)). A missing reference or the host's
   name-reuse notice ends admission (Evidence: observed with deviation, 1 run,
   [Q8](../developer-guide/focus-host-evidence.md#claude-code-results)). Identity and state are re-established right before each send. If the target, identity, state, or mode cannot be verified before dispatch, no send is invoked and the outcome is **Not attempted**. On T3 Code `delivery=steered` acknowledges acceptance of the steer (Evidence: observed with deviation, 1 run, [Q4](../developer-guide/focus-host-evidence.md#t3-code-results)). On Claude Code a successful send with a message identifier is **Acknowledged**, with recipient receipt still unconfirmed (Evidence: observed with deviation, 3 runs, [Q8](../developer-guide/focus-host-evidence.md#claude-code-results)); only an
   accepted reply (rule 4) confirms the request's round trip. Correction receipt remains unconfirmed, which the report says. Claude Code sends use the `[ref]`-qualified address, never the bare name (Evidence:
   description only, 0 runs, [Q10](../developer-guide/focus-host-evidence.md#claude-code-results); work package 4 is the check). If qualified addressing cannot be established before dispatch, focus is report-only; a failed or ambiguous dispatch never permits a bare-name fallback, retry, resend, or duplicate manual send. Never a target: the observer's own session
   (Claude Code: Evidence: observed, 1 run, [Q12](../developer-guide/focus-host-evidence.md#claude-code-results); T3 Code: Evidence: observed, 1 run,
   [Q2](../developer-guide/focus-host-evidence.md#t3-code-results)) or, on T3 Code, its ancestors via the parent chain (same Q2 tag). Codex self and
   ancestor recognition is not covered by the spike (0 runs); work package 4 is the check. The self-report runs only from a top-level
   focus session, because a sub-agent is described as sending under its parent's address (Evidence:
   description only, 0 runs, [Q10](../developer-guide/focus-host-evidence.md#claude-code-results); Q10 not observed by decision, work package 4 is the
   check). Claude Code coverage is local sessions only (Evidence: not covered by the spike, 0 runs,
   [Limits](../developer-guide/focus-host-evidence.md#limits); work package 4 is the check). Reason: the butler failed on a name-like
   handle.
3. **Two named lookup exceptions to the inventory ban,** scoped to focus's own contract; the
   [inventory ban](../../src/shared/retro-native-sources.md) and `retro`'s admission stay unchanged.
   On Claude Code, one targeted `ListAgents` lookup before each send (request or correction) and after each reply, using
   only whether the admitted reference is listed with its state and whether its name occurs once. On
   T3 Code, the observer's own `parentThreadId` chain, read with the smallest activity read and
   keeping only the parent and relationship fields. No target is ever chosen from a listing.
   Reason: both checks are needed for rules 2 and 4 and expose nothing else. (Design decision, no
   host claim)
4. **Reply acceptance on Claude Code.** A reply counts only when its `from-name` equals the admitted
   reference's name, it echoes the request's one-time nonce, the post-reply lookup still binds that
   name uniquely to the admitted `[ref]`, and no restart notice appeared. The reply carries no
   `[ref]`, so name plus nonce plus lookup is the strongest binding available (Evidence: observed,
   every received reply, 4 of 4 in [Q9](../developer-guide/focus-host-evidence.md#claude-code-results)). Every other cross-session message is discarded, and a
   reply after the bounded wait is never processed (Design decision, no host claim; late replies:
   Evidence: not observed by decision, 0 runs, [Q10](../developer-guide/focus-host-evidence.md#claude-code-results); work package 4 is the check).
5. **The stand-in for filter-before-model is a prompt-level rule, not a filter, and it is
   unenforced.** On Claude Code the reply reached the model's context inside a system reminder
   between tool calls (Evidence: observed with deviation, 3 runs, [Q8](../developer-guide/focus-host-evidence.md#claude-code-results)); no host-side
   pre-model filter or hook was observed or is known, so a literal filter is inferred to be
   impossible. What replaces it is the acceptance rule of rule 4, discarding foreign and late
   messages, developer-only confirmation, and treating accepted content as quoted evidence that
   remains data, fails closed, and never becomes an instruction. Every cross-session message,
   foreign ones included, has already reached the model, and the model only follows the rule.
   (Design decision, no host claim)
6. **Send modes per host.** T3 Code: steer a running delegated task, send nothing to a finished
   delegated task because a send there starts a fresh task, and never use the automatic or restart
   modes (Evidence: observed with deviation, 1 run, [Q4](../developer-guide/focus-host-evidence.md#t3-code-results); the last is a design decision).
   Start a new turn on an idle top-level thread (Evidence: not covered by the spike, 0 runs,
   [Q4](../developer-guide/focus-host-evidence.md#t3-code-results); no idle top-level thread was launched, and work package 4 is the check). The observer must run at least as broad as
   the target, otherwise focus is report-only and never asks for a broader mode (Evidence: observed,
   1 run, [Q5](../developer-guide/focus-host-evidence.md#t3-code-results)). Claude Code uses host delivery. A held or deferred message is not proof of non-acceptance: explicit acceptance is **Acknowledged**, explicit non-acceptance is **Rejected**, and an ambiguous result after dispatch is **Outcome unknown**. A hold is known from the `SendMessage` description only (Evidence: description only, 0
   runs, [Q10](../developer-guide/focus-host-evidence.md#claude-code-results); work package 4 is the check), and none was observed on a mode mismatch
   (Evidence: observed with deviation, 1 run, [Q8](../developer-guide/focus-host-evidence.md#claude-code-results)). Codex desktop sends nothing in the
   first version, since a sender exists only as a model self-report (Evidence: observed
   (self-report), 1 run, [Q7](../developer-guide/focus-host-evidence.md#codex-desktop-results)).

7. **Marker.** A fixed prefix names focus and the developer's confirmation and frames the text as a
   suggestion under the target's own approval gates. It is a label, not authentication: on T3 Code
   the receiver sees a plain user message with no host sender marker (Evidence: observed with
   deviation, 1 run, [Q4](../developer-guide/focus-host-evidence.md#t3-code-results)), which the receiver treats like any user turn (a design
   inference, not observed). On Claude Code replies carry `from`, `from-name`, and `from-mode`, but
   none identifies focus or the confirmation (Evidence: observed, every received reply, 4 of 4 in
   [Q9](../developer-guide/focus-host-evidence.md#claude-code-results)). Any session could write the same prefix.
8. **Correction content limits.** The correction refers only to the goal anchor and cited event
   locators, copies no command, URL, or executable path from the evidence, and passes the redaction
   check. Accepted self-report reply content passes the same redaction as observed evidence. Reason:
   a correction must not become a vehicle for text the target would execute. (Design decision, no
   host claim)
9. **Self-report request.** It asks for information only, as locators, and its text says not to run,
   re-run, or change anything, to return to the prior state, and to ask its own user nothing. That
   clause does not bind the target. Its verdicts form a separate self-report evidence level without
   On track, Looping, or Stalled. Reason: a self-report is weaker evidence than a read. (Design
   decision, no host claim)
10. **The only execution is one named, side-effect-free foreground wait of fixed maximum duration on
    Claude Code.** "Execution" means running a command with possible side effects; read-only `git`
    and forge metadata queries and the host's session tools count as reads. In 4 of 4 runs, with the
    observer in auto mode, a reply arrived in-run while foreground calls kept the turn open; the
    monitor alone did not deliver (Evidence: partially observed, 4 runs, [Q9](../developer-guide/focus-host-evidence.md#claude-code-results)). A
    background-only wait and `notify_when_idle` (Q9 variants b to d) are not observed by decision
    (Evidence: not observed by decision, 0 runs, [Q9](../developer-guide/focus-host-evidence.md#claude-code-results)). The default permission mode is not
    covered by the spike, since the observer ran in auto mode (Evidence: not covered by the spike, 0
    runs, [Setup deviations](../developer-guide/focus-host-evidence.md#deviations-from-the-plan) and [Limits](../developer-guide/focus-host-evidence.md#limits); work
    package 4 is the check). A blocked or approval-gated wait ends in "Cannot judge" (Design
    decision, no host claim).
11. **Accepted residual risks.** First, the T3 Code read side effect is unknown, so every read form
    is treated as possibly delivering, with one smallest state read before any content (Evidence:
    not observable, 1 run, [Q1](../developer-guide/focus-host-evidence.md#t3-code-results)). The concept infers from one observed idle-parent delivery
    of about one second that only a busy parent can lose a result; this is an inference. Second, a
    self-report target may block on a question to its own user after answering, which the
    confirmation dialog names (Evidence: observed in the Q8 plan-mode run, 1 run, [Q8](../developer-guide/focus-host-evidence.md#claude-code-results)).
    Third, the residual injection risk of the prompt-level stand-in in rule 5 (Design decision, no
    host claim).

### Decision change: opt-in follow-up ticks (#613)

Focus gains an opt-in follow-up mode, defined behind a disabled gate row until candidate-bound
operator qualification. The [schedule spike](../developer-guide/focus-schedule-evidence.md) on T3
Code with Codex threads answered every no-go question with go (Evidence: observed, single sequences
for several questions, one host version and interval). The decision:

- **Opted-in scheduled ticks.** Only the developer's next turn after an offer, naming one fixed
  interval, starts recurring checks; nothing schedules itself.
- **A single host schedule.** Each loop is one T3 `schedule_task` bound to the observer thread, whose
  prompt holds only the tick invocation, the session reference and its own handle. A one-line
  checkpoint in the observer conversation is the only state between ticks; focus writes no file,
  cache, memory or configuration. Harness-native schedulers are out of scope.
- **Report-only ticks.** A tick sends nothing and asks for no confirmation; a warranted correction
  points to an interactive focus run. Rule 1's "unattended or scheduled runs send nothing" stands.
- **Top-level targets only.** Delegated targets keep the one-off snapshot, so scheduled reads do not
  multiply the residual read side effect of rule 11, which stays unchanged.
- **The tick allow-list.** A tick may use only the contract's admission and page reads, the one
  analysis leaf, and deletion of its own handle.
- **Tick identification by prompt grammar and handle, with a deletion safeguard.** Host fields that
  mark a scheduled turn are not read, so a hand-typed tick prompt counts as a tick; this is harmless
  because ticks are report-only. A tick or stop deletes only a handle an earlier assistant message of
  the observer conversation names, so an edited prompt cannot delete an unrelated task.
- **A loop cap of 24 hours or 48 ticks.** The spike measured 13,130 characters of observer growth
  per proxy tick in the `activity` view (partial), which puts a full loop at roughly 630,000
  characters or more; continuing past the cap needs an explicit resume.

Residual risk: ticks read the target unattended, in whatever mode the observer runs. In an
approval-requiring mode each read waits for approval; in a broader mode the reads run without a
present developer. Target content that reaches a tick is still governed only by rule 5's
prompt-level stand-in, now applied with no developer in the conversation to notice an injection.
The report-only rule bounds what such content can cause to a visible observer message.

### Send-outcome reporting

The trajectory verdict and send outcome are independent. Both outbound kinds use these states:

| State               | Meaning                                                                                                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Not attempted**   | Dispatch was never invoked, including missing developer confirmation or a failed pre-send identity, state, or mode check. Pre-send inability to verify the target is not a send.                                                                                           |
| **Rejected**        | The host explicitly establishes that dispatch was not accepted.                                                                                                                                                                                                            |
| **Acknowledged**    | The host acknowledges acceptance, such as a message identifier or documented steered result. This proves acceptance only, never recipient receipt, reading, or action.                                                                                                     |
| **Outcome unknown** | Dispatch was invoked, but a missing, failed, or ambiguous acknowledgement cannot establish acceptance or rejection. Retain the trajectory verdict, say the message may have arrived, and do not retry, resend, use an address fallback, or advise a duplicate manual send. |

An accepted self-report reply additionally confirms only that request's round trip; it does not prove
that a correction was received or acted on. Missing self-report evidence still yields **Cannot judge**.
(Design decision, no host claim)

## Alternatives and tradeoffs

- **Report-only, no outward message:** safest, but the target never learns of drift it cannot see,
  and hosts without a reader get no signal at all.
- **Autonomous or unconfirmed sends:** removes the human from a channel where, on T3 Code, the
  receiver sees a plain user message (Q4).
- **Name-only binding:** the butler's failure mode; names are reused after restarts.
- **Reading private on-disk transcripts:** bypasses the host's session tools and the inventory ban.
- **Self-reports where a reader exists:** weaker than reading, and a request can disturb the target.
- **A Codex send in the first version:** the sender is known only from a model self-report.

## Consequences

- This is a bounded exception to "Nothing crosses a session boundary any more" in the
  [session rename butler](./session-rename-butler.md). The butler's rule that a run never retitles
  another session is unaffected, because a focus message is not a rename.
- The [input trust boundary](./input-trust-boundary.md)'s filter-before-model rule is met only by the
  prompt-level stand-in of rule 5.
- Observers are pushed toward broad modes, because a narrower observer cannot send on T3 Code.
- A late steer cannot stop an in-flight action; it lands after the running tool call returns.
- The eval stubs follow the observed reply and reader shapes.
- Work package 4 checks every rule tagged "not covered by the spike", "description only", or "not
  observed by decision" above.

## Review triggers

Review this living decision when a host reply carries a stable reference, Claude Code gains a
session reader, the T3 Code delivery side effect becomes observable, a Codex sender is verified, a
host offers a pre-model filter or hook for cross-session messages, real-host runs of work package 4
contradict a rule here, the work package 4 focus contract diverges from a rule here, or follow-up
operator qualification contradicts the decision change above.

## References

- [Focus session check concept](../concept/2026-11-02-focus-session-check.md)
- [Focus host evidence](../developer-guide/focus-host-evidence.md)
- [Focus schedule evidence](../developer-guide/focus-schedule-evidence.md)
- [Focus host verification spike plan](../plan/archive/2026-11-02-focus-host-verification-spike.md)
- [Session rename butler](./session-rename-butler.md)
- [Input trust boundary](./input-trust-boundary.md)
- [`retro-native-sources.md`](../../src/shared/retro-native-sources.md)

This is a living decision. Update this file in place when the current rules change; repository
history preserves earlier states.
