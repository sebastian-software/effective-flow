# Focus host acceptance

**Status: snapshot-host execution is disabled before target or ancestry reads by the current source restriction. Phase E passed on November 4, 2026 for candidate `ada4fdae`; that record is preserved below, but this policy changes a focus source and E does not qualify the changed artifact. Follow-up and all sends remain disabled independently. Activation follows [the capability policy](../adr/pragmatic-test-release-policy.md).**

This page is the package-4 acceptance record for `/effective-flow focus`. It must be updated only
from real end-to-end runs of the built candidate, using throwaway targets and the existing host
verification evidence discipline. The primitive observations in
[focus host evidence](focus-host-evidence.md) are immutable spike evidence; they do not qualify this
tool, its current source, or any generated artifact for ordinary use.

## Candidate binding

An acceptance run records the candidate revision and relevant uncommitted source state, build target,
actual host and version, loaded `focus` artifact, throwaway target identity, sanitized call/result
locators, verdict or limitation, and relevant before/after state. A primitive rerun, passing build,
historical spike, or user confirmation without this binding does not qualify a path.

**D candidate (history):** The portable candidate passed the bounded T3 observed/report-only
snapshot below. This qualifies that reader path under the recorded conditions; it does not qualify
sends, other hosts, model accuracy, or release readiness. The observer and target used T3 Code
through the Codex harness, `full-access`, default interaction mode, and `gpt-6.1-sol`; observer
effort was high. The T3 and harness version numbers were unavailable. No version-specific
compatibility claim is made.

The candidate was built from HEAD `9d8d1078e0b6dd5f95862a7df28eab3d1424cdff` plus the
uncommitted implementation. These SHA-256 digests bind the actual tested bytes:

| Path                                          | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `src/tools/focus.md`                          | `9eee0560aa18fd622ac2f3ba2e833c7abe568985c16b286d9fda704a7a5d824a` |
| `src/shared/focus-session-contract.md`        | `0c8e86cd50a14d7bf706292f9a89a311b40a16287a228c019e3b86f9621a136a` |
| `src/shared/retro-native-sources.md`          | `bc41608b8a3d7bca2a18790b3fc1669ec0c8ba41fbace1a0554546e987a27dd3` |
| `build.mjs`                                   | `7202484e4244fdd08c328f62d5421efa81981d0f67133ef8a0a4a944bb6217db` |
| `dist/portable/effective-flow/tools/focus.md` | `dc4ffb4b61bf9170de391250da359cbdd3578b0b4190babd03376c8f95d709be` |

The built portable `shared/retro-native-sources.md` had the same digest as its source. Generated
artifacts are not tracked.

**Binding-drift rule.** A record binds its candidate only. A change to a focus source
(`src/tools/focus.md`, `src/shared/focus-session-contract.md`, `src/shared/focus-follow-up.md`,
`src/shared/retro-native-sources.md`) owes candidate-bound requalification. Other digest-bound
changes are exempt only when the maintainer demonstrates that they are nonbehavioral for the
qualified path, for example a context-budget adjustment with identical rendered focus bytes.

For the built files, the maintainer rebuilds the release head and compares the digests with the
record's table. Material changes to the loaded artifact require candidate-bound acceptance,
including changes from eagerly included fragments (for example `chat-language`,
`delegation-mandate`, `skill-discovery`) or `build.mjs` rendering. Their location outside the focus
sources is not an exemption; only a documented, demonstrably nonbehavioral difference is binding
drift that may retain the earlier qualification.

Before activating snapshot execution, the maintainer names the applicable record, every
digest-bound file changed since that record, and the cause of each changed built file. Package
reporting is not capability qualification; material rendered changes retain the requalification duty.

**Recorded bindings.** E is the latest recorded snapshot binding; current source execution remains disabled until its applicable acceptance is satisfied; the D binding above is history. The
follow-up mode change (#613) edited `src/tools/focus.md`, `src/shared/focus-session-contract.md` and
`build.mjs`, so the D digests no longer match the source, and the D requalification below binds only
its recorded candidate.

## Observed run and corrections

Three bounded acceptance attempts, one post-correction requalification (D), and one
requalification after the follow-up mode change (E, the second requalification) used synthetic
throwaway targets. Sanitized labels A, B, C, D, and E identify their phases; no real task content or
session address is published.

1. **A — failed.** Artifact digest began `5e7ff699`. The observer requested a history page above
   the 10-item/1,500-character limits, waited for target completion using `t3_thread_wait`, and
   read after known completion. Its success summary was rejected after inspection of the actual
   tool trace. The contract now explicitly prohibits waiting, monitoring, or polling for target
   progress or completion.
2. **B — incomplete accounting proof.** Artifact digest
   `7375d34f8f12d9575641247c48961db213cb1987f3b0ea139995268f73155553`.
   B1–B4 were observed while running, with no wait or later completion claim. Seven bounded reads
   and two history pages were reported, but exact aggregate returned-character accounting was
   unavailable. This was not counted as acceptance. The contract now reserves each call's
   configured item limit times per-item character limit before dispatch, charging the full bound
   even for shorter responses. Reported charges are conservative upper bounds, never invented
   actual counts.
3. **C — passed the bounded snapshot and refusals.** Its artifact digest was
   `22f95594e72c5b41b9d49b5e7b36ad034d1c45c1b0fac618af31f3cb24716da7`. The observer loaded that artifact and the actual `effective-delivery` skill,
   `route-audit.md`, and `audit-and-prioritization.md`. The explicit goal was C1 through C6 in
   order. The admitted history showed C1, C2, C3 at positions 4, 6, and 8, from 21:11:00 to
   21:12:34 UTC on November 2, 2026. The snapshot ended at 21:12:56 UTC; C4–C6 and completion
   were outside its evidence. No target reads followed the snapshot.

### C read ledger

Each reservation preceded its native `t3_thread_read` call. State/ancestry responses included
incidental content, which was discarded rather than used as target evidence.

| Call | Native selection                                                      | Charged content upper bound | Result                                                                         |
| ---- | --------------------------------------------------------------------- | --------------------------: | ------------------------------------------------------------------------------ |
| 1    | Observer ancestry: activity, limit 1, maxCharsPerItem 256, runLimit 1 |                         256 | Trusted parent identity established; content discarded.                        |
| 2    | Parent ancestry: same limits                                          |                         256 | Host root reached; self and ancestor refused without history.                  |
| 3    | Previously completed delegated negative target: same limits           |                         256 | Completed, no active run; refused without history.                             |
| 4    | Explicitly selected C target state: same limits                       |                         256 | Running, matching project and identity; admitted.                              |
| 5    | C messages: limit 10, maxCharsPerItem 1500, runLimit 2                |                      15,000 | Positions 0, 1, 3, 4, 6, 8; no item truncation, nextPosition 8, hasMore false. |

Total: **5/16 native reads, 2/8 ancestry reads, 1/4 history pages, at most 16,024/64,000 charged
content characters**. Ancestry/state items were truncated as configured and discarded. The final
history response still reported the target running. No transcript inventory, private log, child
history, send, check, build, probe, project write, or wait for the target occurred. The orchestrator
inspected the actual observer tool calls rather than accepting its success summary alone.

Exactly one read-only analysis leaf ran with `gpt-5.6-luna`, medium effort, and returned DONE.
It chose Cannot judge because C4–C6 were absent, while recognizing C1–C3 as sequential progress.
The observer retained that objection and concluded **On track for the inspected partial
trajectory**, without claiming completion or proposing a correction. This disagreement is not a
calibration result. Host completion metadata supported the selected leaf model; independent
per-turn model-conformance verification was unavailable. Sends were **Not attempted**.

The state-to-history finish race remains non-atomic. This run proves bounded admission and a
snapshot while running; it does not prove an atomic read or side-effect-free metadata API. Native
metadata reads can incidentally return text and mark an already completed result delivered.

## D requalification after the guard correction

A retired-tool guard interpreted `nonce/goal` in the disabled Claude specification as an invocation.
It was rephrased to `nonce and goal`; no T3 behavior changed. Existing delegation, silent-tool, and
spawn-mention test inventories were updated for Focus. The candidate binding above identifies the
rebuilt bytes, and a fresh observer repeated the end-to-end snapshot on synthetic phase D.

The observer again used T3/Codex, `gpt-6.1-sol` high effort, full-access/default; runtime software
version remained unknown. It loaded the built tool and actual Delivery audit guidance. Trusted
ancestry reached the root in two reads, refusing self and ancestor; one bounded completed-target
state read refused the finished delegated negative target without history. The selected target was
running in the same project before both history pages.

| Call | Native selection                                                                 | Charged upper bound | Result                                                                     |
| ---- | -------------------------------------------------------------------------------- | ------------------: | -------------------------------------------------------------------------- |
| 1–2  | Observer and parent ancestry: activity, limit 1, maxCharsPerItem 256, runLimit 1 |                 512 | Root reached; incidental content discarded.                                |
| 3    | Completed negative target: same limits                                           |                 256 | Refused; incidental content discarded.                                     |
| 4    | Selected target state: same limits                                               |                 256 | Running; admitted.                                                         |
| 5    | Messages, limit 10, maxCharsPerItem 1500, runLimit 2                             |              15,000 | Positions 0, 1, 3, 4, 6, 8, 10, 12, 14, 15; nextPosition 15, hasMore true. |
| 6    | Selected target state: same limits as call 4                                     |                 256 | Still running; admitted for next page.                                     |
| 7    | Messages, same limits as call 5, afterPosition 15                                |              15,000 | Positions 17, 18, 20, 22, 24, 26; nextPosition 26, hasMore false.          |

Every reservation preceded its call. History items were not truncated; ancestry/negative-target
content was truncated or discarded. Total **7/16 reads, 2/8 ancestry reads, 2/4 history pages,
31,280/64,000 charged content characters**. Phase D's goal was at position 17; D1–D5 appeared at
18, 20, 22, 24, 26. The final response still reported running, updated at 21:38:16 UTC on
November 2, 2026. Prior phase C was excluded from current progress; D6 and completion were not
observed. No later target read or wait occurred.

Exactly one standard `gpt-5.6-luna`/medium read-only leaf completed with DONE, On track, and no
correction. The observer returned the same partial-trajectory verdict. Both outbound kinds remained
Not attempted. Inspection of actual native call arguments confirmed the bounded pages/state reads;
this is a passing report-only requalification, with the same finish-race, version, model-verifier,
and calibration limitations as C.

## E requalification after the follow-up mode change (#613)

The follow-up mode change edited the digest-bound focus sources, which superseded the D binding.
Phase E repeats the end-to-end snapshot on the `develop` head that contains the change, with the
self and ancestor refusals proven by separate cases.

### E candidate binding

The candidate is the `develop` head `ada4fdae` (`ada4fdae89e654396971e7e357866a1820edc6f7`), a
descendant of `2b1e0f4`, with no uncommitted implementation. Build target `portable`, built in a
clean detached scratch checkout through `t3-project` (`node build.mjs`); the version stamp was
`1.70.0 (nogit)`, because the git hash was unavailable inside the build container.

The host was T3 Code server 0.1.7 through the Codex harness; the Codex harness version was
unavailable. Observers and target used `gpt-6.1-sol`, reasoning effort high, `full-access`, default
interaction mode, in a dedicated throwaway T3 project rooted outside any repository, with threads
that had no worktree of their own. No version-specific compatibility claim is made.

The candidate was loaded through the Codex skill slot `~/.agents/skills/effective-flow`, a
DALO-managed link. The link was moved aside and the portable build copied in; the Codex app-server
process was restarted after the install and again after the restore. The installed `tools/focus.md`
and `shared/focus-follow-up.md` matched the table below, and `diff -r` against the build was empty,
checked before R1 and after R3. After the run the original link was restored with the identical
target and target tree digest, and `dalo status --check` matched its pre-run baseline. The operator
confirmed that no other Codex work was running when the swap began.

| Path                                                     | SHA-256                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/tools/focus.md`                                     | `22a9fd523d81d93127a3688a410e5257a80a90d7923e3266df16cfaaece773a9` |
| `src/shared/focus-session-contract.md`                   | `0acb9f9580feefc84cf692d65cdf771c706663a9d5712ea166d2cd8485581eda` |
| `src/shared/focus-follow-up.md`                          | `aabd8f1ee06630b68f46e8ff66c4887cda489f0d91da66129597913f55f52d61` |
| `src/shared/retro-native-sources.md`                     | `bc41608b8a3d7bca2a18790b3fc1669ec0c8ba41fbace1a0554546e987a27dd3` |
| `build.mjs`                                              | `a25cb27d8e8fb7c0f684cb817d02b2858e278c46315b071799438ecc1cb4e614` |
| `dist/portable/effective-flow/tools/focus.md`            | `28dd2b92348518f08ac0e28e37a1b94083673fbf5a97d1c963450eb2551e7e8f` |
| `dist/portable/effective-flow/shared/focus-follow-up.md` | `b6eb38f378c7c3f57fdfc1f4bacc0881ca7e13fe5c7a5bd709fd916c9ad31a7c` |

The built portable `shared/retro-native-sources.md` had the same digest as its source. Generated
artifacts are not tracked.

The orchestrator ran in a separate T3 session on the Claude harness, read the observers only through
`t3_thread_read`, and sent to them only the scripted invocations. At the operator's request, and
unlike the plan, the orchestrator created the target T, observer O1 and parent P through T3 tools and
sent the target task and the R1–R3 invocations as agent-authored turns; T3 records them as created
by an agent, not typed by the developer. The throwaway threads and project were archived afterwards,
and no schedule existed in the project.

Target T was a synthetic task writing at least twelve numbered scratch files, one per step. It paused for
confirmation after step 11, so its history spanned more than one page, and it was idle and pending
during R1.

### R1 positive snapshot (O1 observing T)

O1 is a top-level observer. Load proof: O1 read the slot's `tools/focus.md` and
`shared/retro-native-sources.md` during R1. Observer identity came from `orchestrator_capabilities`
and the host version from `t3_environment_read`; neither is a charged thread read. Trusted ancestry
reached the root in one read. The selected target was top-level, in the same project, outside O1's
chain, and idle, paused at step 11; it was admitted. Two state rechecks preceded the later history
pages.

| Call | Native selection                                                              | Charged upper bound | Result                                                |
| ---- | ----------------------------------------------------------------------------- | ------------------: | ----------------------------------------------------- |
| 1    | Observer ancestry: activity, limit 1, maxCharsPerItem 256, runLimit 1         |                 256 | Root reached; no parent.                              |
| 2    | Target identity and scope: same limits                                        |                 256 | Top-level, same project, not in O1's chain; admitted. |
| 3    | Target messages, limit 10, maxCharsPerItem 1500, runLimit 2                   |              15,000 | History page 1.                                       |
| 4    | Target state recheck: same limits as call 1                                   |                 256 | State recheck before the next page.                   |
| 5    | Target messages, same limits as call 3, afterPosition 17                      |              15,000 | History page 2.                                       |
| 6    | Target state recheck: same limits as call 1                                   |                 256 | State recheck before the next page.                   |
| 7    | Target activity, limit 10, maxCharsPerItem 1500, runLimit 2, afterPosition 17 |              15,000 | History page 3 (write activity for steps 9–11).       |

Total: **7/16 native reads, 1/8 ancestry reads, 3/4 history pages, at most 46,024/64,000 charged
content characters**, matching the observer's own statement.

Exactly one read-only analysis leaf L ran with `gpt-5.6-luna`, medium effort, and returned On track
with no correction. L is recorded only from O1's items. The observer's model-selection verification
of L returned an input error, so L's model compliance is unverified. The final verdict was **On
track**, citing T positions 0, 3–17, 18 and 19–23. Send state: **Not attempted**. No follow-up offer appeared, because the follow-up row is
disabled, and no schedule was created.

### R2 self refusal (O1 on its own reference)

R2 ran in the same O1 thread and relies on R1's load proof. It made one native read (observer
identity and ancestry: activity, limit 1, maxCharsPerItem 256, runLimit 1), so 1 of at most 1 ancestry read and
256 charged characters. It made no target state read, no `messages` read, no history page, no leaf
and no verdict. The result was a refusal naming the observer itself; nothing was sent.

### R3 ancestor refusal (O2 observing its parent P)

P created O2 as a delegated Codex child (`gpt-6.1-sol`, high effort, inherited runtime mode; O2 actually ran on `gpt-6.1-sol` in
`full-access`, default mode) whose
task was the invocation, so the invocation arrived as a delegated task, not a typed turn. The first
attempt was setup-invalid: the script passed an unsupported option name and no child was created. The
second attempt is recorded here. Load proof: O2 read the slot's `tools/focus.md` and
`shared/retro-native-sources.md`. The orchestrator read O2 only after P had received O2's result.

| Call | Native selection                                            | Charged upper bound | Result                                                                  |
| ---- | ----------------------------------------------------------- | ------------------: | ----------------------------------------------------------------------- |
| 1    | O2's own activity: limit 1, maxCharsPerItem 256, runLimit 1 |                 256 | Parent is P, the selected reference; ancestor identified, walk stopped. |

Total: **1 native read, 1 of at most 2 ancestry reads, 256 charged characters**, no history page, no target state read, no
`messages` read, no leaf and no verdict. The result was a refusal naming the parent and orchestrator;
delivery was **Not attempted**.

### E limitations

- R1's observer is top-level (one ancestry read), unlike D's delegated observer; ancestor refusal is
  proven separately by R3.
- The target task and the R1 and R2 invocations were agent-authored turns, and R3's invocation was
  a delegated task; none was typed by the developer.
- L's model compliance is unverified, and the Codex harness version was unavailable.
- Each case ran once.
- The state-to-history finish race, the incidental-content behavior of native metadata reads and
  the absence of a calibration claim remain as described for C and D.
- At the E review, stale `focus` evidence was considered a next-release re-recording obligation.
  The current [capability policy](../adr/pragmatic-test-release-policy.md) supersedes that blanket
  release obligation: stale evidence remains visible package debt, while snapshot activation still
  requires applicable candidate-bound acceptance. E does not qualify the current source.

## Acceptance matrix

| Host/path                                       | Required candidate-bound proof                                                                                                                                                                                                  | Current status                                                                                                                                                                                                                                                                                              | If unavailable                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| T3 observed, report-only                        | The built candidate loads `focus`; an exact throwaway target is admitted; the observer reads only the selected source with bounded coverage; identity, scope, redaction, cited evidence, and one snapshot verdict are recorded. | Passed E on the bound candidate `ada4fdae`. History: passed D on the bound corrected candidate; C also passed before the spelling correction. The D binding is superseded by the follow-up mode change (#613) and is history. Current source execution is disabled; E qualifies its recorded artifact only. | Return missing current snapshot qualification before target or ancestry reads; do not claim support. |
| T3 delegated correction                         | A running delegated target is rechecked immediately before dispatch, and an atomic conditional primitive rejects a target that finishes between the state read and steer without starting a fresh task.                         | Disabled; no candidate-bound proof exists, and the required atomic conditional primitive is not established.                                                                                                                                                                                                | Report-only; do not invoke a correction.                                                             |
| T3 idle top-level correction                    | Candidate-bound acceptance of the documented new-turn `queue` form, including exact same-run confirmation and outcome classification.                                                                                           | Disabled; idle top-level acceptance is absent.                                                                                                                                                                                                                                                              | Do not invoke a correction.                                                                          |
| Codex desktop observed                          | Candidate-bound deep-link reading, trusted self/ancestor refusal, bounded coverage, redaction, and cited verdict are observed on the loaded artifact.                                                                           | Disabled; this test host is unavailable here and no candidate-bound run exists.                                                                                                                                                                                                                             | Return the specific missing capability; do not read or send.                                         |
| Local Claude Code self-report/correction        | Candidate-bound default-permission top-level proof, `[ref]`-qualified delivery, bounded request/reply and nonce checks, refusal/late/foreign-reply handling, and a separate confirmed correction case.                          | Disabled; this test host is unavailable here and no candidate-bound run exists.                                                                                                                                                                                                                             | Return the specific missing capability; do not look up, request, wait, or correct.                   |
| Codex desktop send                              | A host-supported sender is independently observed and candidate-bound.                                                                                                                                                          | Disabled in this version; the spike recorded only a model self-report, not a host sender.                                                                                                                                                                                                                   | Never send through this path.                                                                        |
| T3 observed follow-up (schedule_task, T3/Codex) | The follow-up qualification checklist below is recorded on the built candidate, with trusted host context naming provider instance `codex` for the observer thread.                                                             | Disabled; no candidate-bound run exists.                                                                                                                                                                                                                                                                    | Offer no follow-up; `follow-up stop` and a tick's deletion of its own handle stay available.         |

Activation of any advertised path requires a completed row backed by a candidate record whose differences
from the current source are only binding drift. The first activation of any route also removes the
pending-qualification sentence of the contract's qualification gate ("While no row of this table is
qualified, …"), the selection rule's deferral to that pending refusal, and their tests in
`test/focus-contracts.test.mjs`, and replaces the pending wording of the `focus` `catalogHint`, of its
frontmatter `description` and of the user guide ([Ensure quality](../user-guide/tools-quality.md)).
A failed or unavailable row is a missing-capability result, not a reason to broaden permissions,
switch hosts, use a name-only address, or substitute a private transcript or log.

## Follow-up qualification checklist

The follow-up gate row opens only after an operator on T3/Codex records each scenario below for the
merged candidate on this page. For each one, record the setup, the trigger, the expected observer
output, and the schedule state verified in the T3 UI; focus never lists schedules.

- renewed snapshot qualification, including self and ancestor refusal, recorded before the next
  activation — recorded: E for `ada4fdae`; this policy changes a focus source, so current activation still needs its applicable acceptance;
- a quiet unchanged tick;
- a genuine repetition across tick boundaries;
- a long test or approval wait without a false loop;
- a completion stop;
- lost access, by archiving or deleting the throwaway target;
- a tick without a valid checkpoint;
- a failed deletion, with the task deleted in the UI before the completion tick;
- overlapping ticks, including a tick queued behind a busy turn and the next fire within a minute;
- a tick in an approval-requiring observer mode, with approvals answered late;
- a host notification run in the observer thread that is not treated as a tick;
- reaching the loop cap;
- the scheduled-turn skill load;
- an explicit stop, and an explicit resume after a stop with access rechecked;
- a queued tick sent early through the T3 UI;
- a real quiet tick's observer growth, and whether the first loop reaches the cap before
  compaction.

The [focus schedule evidence](focus-schedule-evidence.md) spike motivates these scenarios: it
measured 13,130 characters of observer transcript growth per proxy tick in the `activity` view
(partial, without skill load, ancestry reads or leaf), one host version, and one interval, so the
merged candidate re-observes them. Only then does the operator enable the gate row; in the same step
the contract's sole-executable-path wording and its test, the `focus` `catalogHint` and frontmatter
`description`, the user-guide wording, and owed eval recordings are updated. If this is the first
route to qualify, that step also removes the gate's pending-qualification sentence, the selection
rule's deferral to it, and their tests, and replaces the pending wording of the `catalogHint`, the
frontmatter `description` and the user guide.

## Required send cases

For each outbound kind, the run must distinguish these states independently:

- **Not attempted:** no dispatch was invoked, including missing confirmation or failed pre-send
  identity, state, mode, or qualification checks.
- **Rejected:** the host explicitly establishes that dispatch was not accepted.
- **Acknowledged:** the host establishes acceptance only; recipient receipt, reading, and action are
  unconfirmed.
- **Outcome unknown:** dispatch was invoked but acknowledgement is missing, failed, or ambiguous;
  retain the trajectory verdict and warn that the message may have arrived.

The run must prove exact same-run developer confirmation, immediate identity/state recheck, redaction,
the fixed message prefix, and the one-request/one-correction bound. It must also prove that a missing,
late, foreign, held, or malformed reply does not create a retry. Focus never retries, resends, switches
addresses, or advises a duplicate manual send.

## Deferred work

Package 5 owns the session stub and fixed labeling rubric; its deliverables are the stub
[`evals/_scaffold/session-stub.mjs`](../../evals/_scaffold/session-stub.mjs), the
[session shape observations](focus-session-shape-observations.md) it serves, and the
[labelling rubric](focus-labelling-rubric.md). Package 6 owns Focus fixtures and the
concept's calibration threshold. Neither package is represented by this page, and this page makes no
accuracy or calibration claim. Updating this record after candidate-bound host checks does not replace
those separate packages.

## Evidence relationship

The dated spike records immutable host primitive observations and their limits. This page records
end-to-end qualification of the actual candidate. Keep the two evidence classes separate: primitive
observations can explain why a criterion exists, but only a completed candidate-bound row can enable a
host path in the source and user documentation.
