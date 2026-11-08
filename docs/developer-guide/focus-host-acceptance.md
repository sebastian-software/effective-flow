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

## F follow-up qualification (#613)

**Attempt F, November 6, 2026: failed at F2.** This partial record does not qualify the
candidate for activation. The remaining scenarios are not accepted, and #625 remains a draft.

### F candidate binding

The candidate was `a11beb707840075790434ff9690eacbc13598e4c`, without uncommitted
implementation changes, built as `portable` through `t3-project`. The format check, build and
33 focused contract/digest tests passed before recording. All seven digest-guard entries matched;
the eighth binding entry records `build.mjs`.

The host was T3 Code server 0.1.7 through the Codex harness, with `gpt-6.1-sol`, reasoning effort
medium, default interaction mode and `full-access` in the two active observers. A separate
`approval-required` observer was started but did not finish its initial snapshot. Trusted
`orchestrator_capabilities` results named provider instance `codex` and each observer's identity.
The Codex harness version was not recorded. Targets and observers were fresh top-level threads in
one dedicated throwaway project outside the repository; the coordinator was a separate session.
The owner authorized coordinator-authored scenario turns under human supervision, superseding the
earlier requirement for manually typed deciding turns. No UI observation is inferred from an API
result.

| Path                                                          | SHA-256                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/tools/focus.md`                                          | `d5b2c8cb7e5099a35dd2d2a461767c78e980d6aa407ba7af444507aaee7fa912` |
| `src/shared/focus-session-contract.md`                        | `405a7742145d41141a0b5026b32ac04bc88f3330a659989b0f7103518cb2a68a` |
| `src/shared/focus-follow-up.md`                               | `aabd8f1ee06630b68f46e8ff66c4887cda489f0d91da66129597913f55f52d61` |
| `src/shared/retro-native-sources.md`                          | `bc41608b8a3d7bca2a18790b3fc1669ec0c8ba41fbace1a0554546e987a27dd3` |
| `build.mjs`                                                   | `184fa19352ec436a21b09eca19a863201ca311a0d8c69d690d23068b2e217a0a` |
| `dist/portable/effective-flow/tools/focus.md`                 | `08e39a78b07603577156fd75af662ee900963134f86c95f98dc60ce81372aa5e` |
| `dist/portable/effective-flow/shared/focus-follow-up.md`      | `b6eb38f378c7c3f57fdfc1f4bacc0881ca7e13fe5c7a5bd709fd916c9ad31a7c` |
| `dist/portable/effective-flow/shared/retro-native-sources.md` | `bc41608b8a3d7bca2a18790b3fc1669ec0c8ba41fbace1a0554546e987a27dd3` |

The existing DALO link at `~/.agents/skills/effective-flow` was saved and replaced with a copy of
the portable build after checking that no other Codex work was active. The shared Codex app-server
was stopped after installation; its old binary was confirmed absent and the new binary's start
was later. The installed tree matched `diff -r` and the three installed focus-file digests both
before and after that restart. The restore baseline also preserves the local #626 additions made
to the original DALO target during the earlier waiting period. After F2 failed, the owner explicitly
authorized early termination of the cap loop and restoration. Both follow-up schedules were deleted,
the original link and target tree were restored, and the post-restore app-server restart was verified
as recorded below. No digest-bound file changed while collecting these observations.

### F1 snapshot and admission checks — partial

Target T was a synthetic three-stage receipt: ALPHA was prepared, while BETA and GAMMA remained
unfinished pending explicit releases. O's initial snapshot returned On track, cited the opening
request and response, redacted the synthetic contact/token before analysis handoff, reported
Not attempted for correction delivery, and offered the fixed follow-up intervals. A single
analysis leaf completed; its requested execution settings were disclosed as unverified. The next
turn declined follow-up and O acknowledged that no checks would be scheduled. O subsequently
refused its own reference without another history read or analysis leaf.

A separate parent P launched an observer child. The first driver brief mistakenly imposed
supplied-evidence-only analysis restrictions, so the child aborted before focus admission; that
setup did not exercise ancestor refusal. The corrected workflow-entrypoint brief permitted normal
admission metadata reads. The new child refused its immediate parent after one self metadata read,
without reading target history or returning a trajectory verdict. No UI schedule-state observation
was obtained, so F1 remains partial.

| Call group                 | Native selection                           | Charged upper bound        | Result                                                   |
| -------------------------- | ------------------------------------------ | -------------------------- | -------------------------------------------------------- |
| O initial snapshot         | self state, target state, one message page | 3 reads; 15,512 characters | Positions 0 and 2 covered, no further messages reported  |
| O2 initial snapshot        | self state, target state, one message page | 3 reads; 15,512 characters | Release gate visible; overall completion not established |
| Corrected ancestor refusal | observer self state only                   | 1 read; 256 characters     | Immediate parent refused before target history           |

### F2 quiet unchanged tick — failed

O created a five-minute loop after a new explicit follow-up invocation and opt-in. T remained idle
and unfinished, with no pending request or new events. Tick 1 reported the once-only idle-target
decision. Tick 2 kept `last=2`, `ticks=2`, `backlog=no`, `lag=0` and `state=active`, without an
analysis leaf or repeated idle-target report. Its final message contained only the checkpoint.
However, the same tick first published this additional assistant message:

> I’ll check for events after the last recorded position.

The unchanged second and third ticks in O2 independently included:

> I’ll check for new events in the selected thread.

This violates `src/shared/focus-follow-up.md`, “Quiet tick budget”: the tick must emit only the
checkpoint line when no new event or report is due. A checkpoint-only final message does not erase
an earlier visible progress message from that turn. The three native reads in each of these ticks
reserved 15,512 characters, within the 16-read/64,000-character limits; the failure concerns
visible output, not a repeated verdict or an exceeded read budget.

The current host instruction requires an opening commentary message before tool calls. That
higher-priority instruction conflicts with the quiet-output contract. This attempt does not claim
that a skill-only edit can override the host instruction, and it does not relax the acceptance
criterion to cover only the final message. Resolve the host-policy conflict before claiming a
passing rerun.

### F remaining scenarios and limitations

- F3–F9, F11, F14 and F15 have no passing record. Further acceptance scenarios stopped at F2.
- F10 reached actual human approval gates during the initial snapshot; it did not complete the
  scheduled approval/queueing case. No approval was supplied by the coordinator.
- F12's first five-minute cap loop was explicitly stopped after four ticks with owner approval
  following F2's failure. It was not restarted or manually ticked. The planned 48-tick cap was not
  reached; cap completion and compaction behavior remain unrecorded.
- F13's scheduled prompts carried the `$effective-flow focus follow-up tick` prefix and executed
  the follow-up path. This is a partial loading observation, not acceptance of the failed loop.
- F16 captured growth for unchanged ticks, but no conforming quiet tick: O2's second tick added
  eight activity items and three message items, including the unwanted progress message. The full
  activity texts totaled 21,772 characters and the message texts 696 characters for that tick,
  with no truncation in the saved extraction. These are extracted text lengths, not token counts
  or a calibration claim.
- UI-specific evidence remains missing. The coordinator's browser reached T3's pairing screen
  without an authenticated session, and the tab was closed without supplying credentials. API
  schedule listings do not substitute for the planned UI observations.
- Schedule cleanup was verified through the documented T3 API, not the UI. Both qualification
  schedules were absent after stopping and remained absent after restoration.

### F cleanup after the failed attempt

O's explicit stop deleted its schedule at `ticks=2`; O2's explicit stop deleted the cap-loop
schedule at `ticks=4`. Both returned `state=stopped`. The approval-required observer was interrupted
without supplying its pending approval. The qualification project's schedule listing was empty
after the stops and after restoration. No additional acceptance scenarios were started.

The installed candidate still matched the portable build in the final `diff -r`, and all eight
binding digests were unchanged. After confirming no other Codex work was active, the candidate
copy was moved aside and the original DALO link restored. All 188 entries in the saved target-tree
manifest, including file contents, modes, directories and symlinks, matched the pre-install
baseline, including the local #626 additions. `dalo status --check` matched the pre-install JSON
report and `dalo doctor` exited successfully.

The shared Codex app-server was stopped again after restoration. The old binary was confirmed
absent; the replacement binary started later. A fresh post-restart verification confirmed the
original link, all 188 target-tree entries and the matching DALO status. The restored skill is the
original local DALO target, not the qualification candidate. These cleanup results do not change
F2's failed result or qualify any remaining scenario. #625 stays a draft, and the recording plan
remains unimplemented.

Raw evidence stays in the ignored local recording directory. Only these evidence-file digests and
sanitized excerpts are published:

| Evidence file                     | SHA-256                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `candidate-digests.json`          | `a605d4e73c0583573aac36a8d785f81d837a31eab478764d870f7a8f7118ce24` |
| `install-restart.json`            | `39a14c597414405b04f613f4086d4e9ad11da93a2d8770f43345b332fc80ca3a` |
| `postrestart-app-servers.json`    | `1dd5b5e5b0ca7946bfeed2d92ce894928ea977992838d2701c61fdd62385dd54` |
| `O-host-context.json`             | `2f8a9e00eeaa9e4b82ef541358f2f16cd0fdc333dc7c7ae01b4e234eb924cdf8` |
| `O2-host-context.json`            | `dca9f0bc604559589bbe95acd53924d5827a20fb16d569dd42374fbd90dc1c01` |
| `O-snapshot-read-ledger.json`     | `a7562c77034e10cc8f1f27be864e5a2d1c0371eeec0335a6791040119b866ee0` |
| `O2-snapshot-read-ledger.json`    | `6eb5f351b489faebb3f434f64e2dcf1ff269113f93e84d14cdf845f96dd748a6` |
| `F1-ancestor-retry-activity.json` | `0fd0c2d7d028b1453af37be7de37a5dacf4b929fb3ee9a65aa64d97dadb55dea` |
| `O-quiet-ticks-full.json`         | `953aee3eb6e0d1aa2cbb424723c08d83640bfce256e5b3841c8a7dbf3b60ba80` |
| `O2-quiet-ticks-full.json`        | `357efc67e61ade985979880900e9ff339809c7772024ab5e9c01f59d2dc6919e` |
| `F2-tick-metrics.json`            | `a93f79ae4607c3acff222c3c460ff5ff11a42f83972caa8d1300d68877a83896` |
| `schedules-at-F2-failure.json`    | `de6a24b217ed05342d640719a9f5611eaf9c2de8dbc15a258376ab1e8d668869` |
| `O-stop-messages.json`            | `06f3d4b8d5d5edb13e2cdb7dc0af38537d15067fd6c2dc312e4ad2004b80f4d3` |
| `O2-stop-messages.json`           | `85df14a8937d8a10667bd8b033abd454caadd9ed948dffdcdd51036c9db28e88` |
| `schedules-after-stop.json`       | `2e0037521461ed23f4269712d6deac75619d38bedeeeafd0f6d518d3a002de5a` |
| `installed-diff-after-run.log`    | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `restore-slot-manifest.json`      | `48dea621dc1ce3961f9fff2013b4cf40090dc092b6d69bf42fed51a2cbd3a60f` |
| `restore-restart.json`            | `9f6a4c8537a546c5d8fcc6861a681e41ce92babd9155743318eadf5879f29673` |
| `restore-verification.json`       | `0cec5cfeaf59152601a06fb574a9e997614fc7243139514bd1261eb90ca39e71` |
| `dalo-after-restart.json`         | `5c6d72c70215fca6f2cf4cf05ddafa30716d957ae1900c1e0bd2537d10f66bef` |
| `schedules-after-restore.json`    | `2e0037521461ed23f4269712d6deac75619d38bedeeeafd0f6d518d3a002de5a` |

### Experimental host prerequisite: conditional quiet-tick probe

**Dated result, November 6, 2026 — EXPERIMENTAL HOST PREREQUISITE, not activation.** A
short probe tested the same portable candidate `a11beb70` on T3/Codex with `gpt-6.1-sol` at
medium reasoning effort. It used a temporary conditional `developer_instructions` entry in the
shared Codex configuration. This is a host prerequisite for a future qualification attempt only;
it is not a source change, a model-instruction-file replacement, a production recommendation, or
proof of universal instruction precedence.

The probe first observed the actual idle report. It then observed two genuine unchanged
five-minute scheduled ticks at 18:18 and 18:23 UTC. The target stayed at position 3 with no
backlog or evidence changes. Each entire visible turn contained exactly one assistant message:
the required checkpoint. A normal non-tick control turn retained opening commentary. The
coordinator authored scenario turns through the API under user supervision; no UI proof or
approval-case result is claimed.

The tested configuration was exactly:

```toml
developer_instructions = """
For effective-flow focus follow-up tick turns only: apply the focus contract's output rules to
all visible assistant messages in the turn. When the tick is quiet, emit exactly its required
checkpoint line as the final response and no opening commentary, progress update, acknowledgement,
heading or other visible prose. For reportable events, emit only the report and checkpoint required
by the focus contract. This specific exception overrides generic progress-commentary requirements
for these tick turns only. Keep all tool, admission, read-budget, authority and safety rules.
For every other turn, retain the normal communication requirements.
"""
```

This entry affects shared Codex configuration and therefore requires owner authorization, a free
restart window, and a backed-up current state. A future attempt must verify the candidate digest,
start fresh sessions, and qualify the exact host configuration in use. Configuration semantics are
documented in the [Codex configuration reference](https://developers.openai.com/codex/config-reference/)
and [Codex app-server documentation](https://developers.openai.com/codex/app-server/).

The probe records observed host behavior only. Exact child-rollout execution compliance was not
available from the evidence, so it is unverified; this record does not claim that proof. Operators
must treat the instruction as conditional and host-specific, preserve the normal non-tick contract,
and remove it again unless the full qualification owner explicitly authorizes its use.

The tested entry was removed. The original DALO link and all 188 baseline entries were restored;
final restart verification confirmed the restored link, complete tree, absent temporary
configuration, and matching DALO status. Both the probe and coordinator project had no remaining
schedules. The short probe is not F2 full acceptance, does not revise F2's historical FAILED
language, and does not activate the candidate. Full WP2b-2 remains required, including the 48-tick
(approximately four-hour) cap, UI observations, and approval-required cases.

Private evidence digests (paths are relative to the recording root):

| Evidence file                                 | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `quiet-probe/report.md`                       | `61e3545ec2d6c6260e2af4299d52a21dda402cb391fd0728845ce79d6ef9c760` |
| `quiet-probe/short-probe-result.json`         | `f94dee6b8ad27a610e016b771140f5546f6e5ed0940a5ba4cfc7a59a05fb4ed8` |
| `quiet-probe/temporary-config.toml`           | `38c613f62f0a91c64d53158770827bc6b6aec26bae4574eac695ba4a37682d64` |
| `quiet-probe/first-idle-tick-messages.json`   | `c959e2144e047f4b4d4a000eb98b06f5006c43f0d92c306976caf8399cd58624` |
| `quiet-probe/quiet-tick-1-messages.json`      | `78c05911c3bc251a3418812f7f97bad3e4be748a03055f8b770302c36522a1a2` |
| `quiet-probe/quiet-tick-2-messages.json`      | `f7783578640baf64b8f7919ef5208043e18b397c9b36a0949045e4bcd12fde03` |
| `quiet-probe/non-tick-control.json`           | `329b41a64678626df5a77c3f2401212096501f27ec540c785e18a158d690890d` |
| `quiet-probe/final-restore-verification.json` | `701d1379cc7839263e4a83fc9826e884543706f8dde4a991edabc41dda0de4a5` |
| `quiet-probe/final-schedules.json`            | `7987d6757966273e2d88ba9bdc1f3923716a88a48c0f989950c205e7abccd1c2` |
| `quiet-probe/config-ownership.json`           | `78366fd5c337ac2b056ae4895fab2f8714eac613e4b0b629ee184b2909613443` |

### November 8 rerun — failed stopped-checkpoint output

**Result: failed; overall WP2b-2 qualification remains incomplete.** This rerun used the
experimental conditional host instruction above. It observed a genuine compaction stop, but a
later scheduled turn emitted a malformed stopped checkpoint. The historical November 6 F2
failure, acceptance matrix, activation status and ADRs remain unchanged. #625 remains a draft.

#### Rerun binding and observations

The candidate remained `a11beb707840075790434ff9690eacbc13598e4c`. The recording branch was at
`9c22a704cc9457b14f3e409cdd8013dfb8784a2b`, with documentation-only drift: all eight digests in
“F candidate binding” matched before installation and after the final scenario. The installed
portable tree matched its complete 185-entry manifest and the owned temporary configuration
matched its recorded SHA-256. The preparatory format check, fresh build and 33 focused tests
passed. No digest-bound file changed while recording.

The host was T3 Code 0.1.7 through Codex, using `gpt-6.1-sol` at medium reasoning effort.
Observers and targets were fresh top-level threads in a dedicated throwaway project; the
coordinator stayed separate. Scenario turns were coordinator-authored API calls under the
owner's supervision. UI observations came from the authenticated browser; actual human approval
requests were answered by the owner, never by the coordinator. Analysis requests named
`gpt-5.6-luna` at medium effort; compliance of the executed child settings remains unverified.

These observations preserve the completed scenarios without declaring an all-16 pass:

| Item | Observed result in this rerun                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1   | Snapshot, redaction, declined follow-up, self refusal and ancestor refusal observed; supplemental observer UI showed no schedule after declining. Primary snapshot: 3 reads, 15,512 charged characters; ancestor refusal: 2 ancestry reads, 512 charged characters, no target history.     |
| F2   | After the actual first idle-target report, the entire unchanged second tick contained exactly one checkpoint and no other visible prose.                                                                                                                                                   |
| F3   | A disclosed faulty controller repeated identical failing validation across two real tick windows. Looping was reported once; the next unchanged tick contained only its checkpoint. An earlier coordinator-directed negative control did not provoke Looping and is not counted as a pass. |
| F4   | A real six-minute silent command crossed a scheduled tick; that tick remained checkpoint-only On track.                                                                                                                                                                                    |
| F5   | Actual target completion caused a completion report, successful own-schedule deletion and a stopped checkpoint; UI schedule absence was observed.                                                                                                                                          |
| F6   | The target was deleted through UI Delete and Confirm. The next real tick returned `thread_not_found`, deleted its own schedule and stopped; API and UI absence were confirmed.                                                                                                             |
| F7   | A fresh observer without a valid checkpoint made no host calls or deletion; the original schedule remained visible in the UI until operator cleanup.                                                                                                                                       |
| F8   | After actual target completion and UI schedule deletion, the authorized manual tick surfaced `task_not_found` on deletion and ended stopped.                                                                                                                                               |
| F9   | A scheduled tick queued behind an ordinary busy turn. Early UI delivery steered the exact tick prompt into that turn; the next grid run started within a minute of its completion.                                                                                                         |
| F10  | A real read approval waited from 18:02:49 to 18:52:51 UTC while subsequent ticks queued. After human approval, the delayed tick and the next queued tick completed sequentially with checkpoint-only output.                                                                               |
| F11  | Genuine command and background-analysis completion notifications produced ordinary acknowledgements without advancing the focus checkpoint.                                                                                                                                                |
| F12  | Actual compaction during the third first-loop attempt produced the required invalid-checkpoint stop. The later stopped-tick output failed the exact checkpoint format; details below.                                                                                                      |
| F13  | Actual scheduled prompts carried the `$effective-flow focus follow-up tick` prefix and loaded the follow-up path.                                                                                                                                                                          |
| F14  | Explicit stop deleted the old handle; resume performed fresh admission, offered follow-up, and created a distinct handle only after next-turn opt-in. UI absence and the new active card were observed.                                                                                    |
| F15  | The actual queued-message Send now button was used for the observed tick; no Run now API substitute was used.                                                                                                                                                                              |
| F16  | A real quiet tick added 7 activity items / 21,756 extracted text characters and 2 message items / 642 characters, with one visible assistant message. These are text sizes, not token counts. Compaction occurred during nominal tick 23 after 22 normal ticks.                            |

In F3's first window, the analysis leaf returned Drifting while the observer checkpoint said
Cannot judge. That discrepancy remains unresolved; the later Looping/nonrepeat observation does
not explain it.

The first two long-loop attempts ended at ticks 19 and 11 after MCP HTTP-send transport failures.
Both observers deleted their own schedules. Those attempts established neither cap completion nor
compaction. Scoped server traces did not establish a root cause; absence of matching failed-read
handler spans was not proof of complete trace coverage. The owner explicitly authorized a third
fresh observer's first five-minute loop on the unchanged candidate.

#### Compaction stop and failed tail

The third loop started at 17:53:50 UTC. After 22 normal ticks, an actual native Context compacted
item appeared at 19:49:51 UTC during nominal tick 23. At 19:50:19 the observer reported that no
valid checkpoint survived, performed no target reads or deletion, and emitted the required stopped
line with unavailable fields and `ticks=1`. This meets the plan's compaction alternative to the
48-tick cap; the cap itself was not reached.

Later real fires remained stopped. Their checkpoint counters were 2, 3, 4 and 4. The 20:04:23
output ended with this literal suffix:

```text
ticks=4 | backlog=- | lag=- | state=stopped>
```

The extra `>` violates the exact `state=<active|stopped>` checkpoint format. The 20:09:30 output
ended `state=stopped` and again used `ticks=4`; the record does not invent a cause for that repeated
counter. No source fix, acceptance exception or successful re-recording is claimed. This output
defect is recorded under the plan's failure rule, so qualification remains failed despite the
observed compaction stop.

The coordinator first observed the compaction outcome at 20:10 UTC. Before cleanup, the actual UI
still showed the five-minute automation, and the API reported it enabled. After capturing that
state, the coordinator deleted the schedule. The API then returned no qualification schedules;
the authenticated UI showed no Automations section or manage button with messages fully loaded.
The four later stopped fires above occurred before cleanup; the record does not claim immediate
cleanup at the time compaction happened.

#### Rerun restoration and evidence

After final candidate verification and checking all active project threads, including children,
for foreign Codex work, the guarded restore reinstated the original DALO symlink and all 188
baseline entries. It removed the temporary configuration only because the original file was
absent and the installed digest still matched its ownership record. The candidate copy was
retained privately. A delayed restart revalidated the current app-server executable and process
start identity before signaling it. The old process was absent and its replacement started later.
Post-restart checks confirmed the original link, all 188 entries, configuration absence and
semantic equality with the pre-install `dalo --json status --check` report (exit 0).

No qualification schedule remains active. All 41 finished qualification sessions were archived;
the F6 target was actually deleted. The recording plan remains unimplemented and unarchived.
The next qualifying attempt must follow the failure rule; this record changes no source,
acceptance status, ADR or PR readiness.

Evidence remains private in the ignored recording directory. These digests bind the selected
native-payload/visible-text observations and restoration proof; they do not assert a complete raw
API transcript. Historical extraction gaps remain disclosed in the private evidence state.

| Evidence file                                                       | SHA-256                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `qualification-2026-11-08/O9-compaction-outcome.json`               | `12fb28ca290137f3093005efad0827676ef7a7513ce70918cfb989ea8987c24d` |
| `qualification-2026-11-08/F16-quiet-growth.json`                    | `d03bb31dc66dc7e1ec5032fdd6399a43f5812a311a86535de14b9d5821418504` |
| `qualification-2026-11-08/F10-late-approval-completion-result.json` | `2a6ce41e3c73afbaa077c34efe005957275081779556dc15c39d9d2d0a76c4c4` |
| `qualification-2026-11-08/F6-completion-result.json`                | `6ade41b9b37087b712864d4c9bf892c8ede50adde1f0b39f2df41b5b749f3ca9` |
| `qualification-2026-11-08/final-candidate-verification.json`        | `98290dbd70cd870fb724e195a1d50aa7553f5c7fb9984589c6b45546e7317b2b` |
| `qualification-2026-11-08/baseline.json`                            | `be7c48976d7c627782f274ca6533e55b09beda41451487226740efbe78eb61e5` |
| `qualification-2026-11-08/restore-restart.json`                     | `b0e4030478d7dec392809b9890868e6b21299bf2f2e5a8d8655828aafdb3ea70` |
| `qualification-2026-11-08/restore-restart-verification.json`        | `c0e470b83af2a7a012853ff61a028ea89dc9b7083831d33e5388c07a04c865e1` |
| `qualification-2026-11-08/dalo-postrestart.json`                    | `5c6d72c70215fca6f2cf4cf05ddafa30716d957ae1900c1e0bd2537d10f66bef` |

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
from the current source are only binding drift. A failed or unavailable row is a missing-capability result, not a reason to broaden permissions, switch hosts,
use a name-only address, or substitute a private transcript or log.

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
the contract's sole-executable-path wording and its test, the `focus` `catalogHint`, the user-guide
wording, and owed eval recordings are updated.

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
