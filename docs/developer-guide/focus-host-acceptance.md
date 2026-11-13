# Focus host acceptance

**Status: snapshot-host execution and the follow-up mode are enabled on the T3 observed path, the follow-up mode under the documented host prerequisite, bound by the [F record for candidate `024bcb2a`](#f-record-for-candidate-024bcb2a) with its recorded limitations. Phases D and E are history. Sends remain disabled independently. Activation follows [the capability policy](../adr/pragmatic-test-release-policy.md).**

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

**Recorded bindings.** F ([`024bcb2a`](#f-record-for-candidate-024bcb2a)) is the current binding for both T3 observed rows; E and the D binding above are history. The
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

### November 9 rerun — failed first scheduled output

**Result: failed; overall WP2b-2 qualification remains incomplete.** A fresh approval-required
observer completed its first scheduled turn with only the literal text `< t3-thread>` and no
required focus checkpoint. API messages and the authenticated UI agree. The cause remains
unproven; neither the earlier trailing-`>` defect nor model execution compliance is established
as its explanation. The November 6 and November 8 records, activation status, acceptance matrix
and ADRs remain unchanged. #625 remains a draft.

#### November 9 candidate binding

This attempt used candidate `21f2a36802a98abf696c6780d46372b2c529136c`, portable build
`1.72.0 (21f2a36)`, on T3 Code 0.1.7 through provider instance `codex`, with host-reported
`gpt-6.1-sol` at medium reasoning effort and full-access runtime mode. Observers and targets were
fresh top-level sessions in a dedicated throwaway project. The separate coordinator authored
scenario requests through the API under the plan's supervised-execution amendment. Human
approvals were answered only by the owner. Requested or host-reported settings do not prove the
executed model settings; model compliance remains unverified.

Fresh format, build and 33 focused tests passed before installation. The installed portable tree
matched its complete 185-entry manifest, and the owned temporary configuration matched its saved
SHA-256 before and after the scenarios. The original DALO tree retained all 188 baseline entries.
All eight candidate digests below matched at both boundaries; no digest-bound file changed
during recording.

| Candidate file                                                | SHA-256                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/tools/focus.md`                                          | `d5b2c8cb7e5099a35dd2d2a461767c78e980d6aa407ba7af444507aaee7fa912` |
| `src/shared/focus-session-contract.md`                        | `405a7742145d41141a0b5026b32ac04bc88f3330a659989b0f7103518cb2a68a` |
| `src/shared/focus-follow-up.md`                               | `e860ebeda3357900478132e1bbd29fa8fb404a7b29ac15f4407d8d4ec4720d4d` |
| `src/shared/retro-native-sources.md`                          | `bc41608b8a3d7bca2a18790b3fc1669ec0c8ba41fbace1a0554546e987a27dd3` |
| `build.mjs`                                                   | `184fa19352ec436a21b09eca19a863201ca311a0d8c69d690d23068b2e217a0a` |
| `dist/portable/effective-flow/tools/focus.md`                 | `08e39a78b07603577156fd75af662ee900963134f86c95f98dc60ce81372aa5e` |
| `dist/portable/effective-flow/shared/focus-follow-up.md`      | `b5a2e105e2a63584993f9fcd0ea548d729e7d39b9854ebeb5510be10df9148cb` |
| `dist/portable/effective-flow/shared/retro-native-sources.md` | `bc41608b8a3d7bca2a18790b3fc1669ec0c8ba41fbace1a0554546e987a27dd3` |

Regular PR CI passed on synthetic merge `7e1bd06d4805768b2306af370004a107aa9ef5c2` into
`4f4e516f23d6e1b339bf1782088325c8f49a734a`: 5,034 tests, 5,007 passed, zero failed and 27 skipped,
plus format, build and distribution checks. This was not an exact-branch full-suite pass.
The four focus-source blobs and digest fixture matched the candidate. Earlier local full-suite
timeouts remain timeouts; they were not relabeled or repeated for this record. No branch update
from develop was performed.

#### Fresh observations and unrecorded cases

These results belong only to November 9; no November 8 pass carries forward.

| Item | Observation and result                                                                                                                                                                                                                                                                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1   | Observed pass: identity and scope checked before history; synthetic contact and token redacted from leaf and final; snapshot and analysis leaf both On track with cited evidence. Three reads charged 15,512 characters. Declined follow-up left no UI automation; self and ancestor requests were refused without target history. Model compliance remains unverified. |
| F2   | Observed pass: after the first idle-target report, the entire unchanged second real tick contained one checkpoint and no other assistant prose or analysis leaf. Three reads charged 15,512 characters; the five-minute automation was visible.                                                                                                                         |
| F3   | Not provoked: two identical missing-file reads failed in separate windows, but the request explicitly asked for a retry. The observer treated this as a known blocker, stayed On track, and later produced an idle-target report. No Looping or nonrepeat pass is claimed.                                                                                              |
| F4   | Observed pass: a real silent 420-second wait crossed a real scheduled tick. While the command was still running, that whole turn emitted only an On track checkpoint. Five reads charged 30,768 characters. The wait was an observation fixture, not project validation.                                                                                                |
| F5   | Not yet recorded: no qualifying target-completion scenario was performed.                                                                                                                                                                                                                                                                                               |
| F6   | Not yet recorded: no target was deleted through the UI in this attempt.                                                                                                                                                                                                                                                                                                 |
| F7   | Not yet recorded: no fresh invalid-checkpoint observer scenario was allocated.                                                                                                                                                                                                                                                                                          |
| F8   | Not yet recorded: no failed-deletion scenario was performed.                                                                                                                                                                                                                                                                                                            |
| F9   | Queue and timing observed, without final pass adjudication: an ordinary busy observer turn ended at 14:28:13.659 UTC; its queued tick started at 14:28:14.207, and the following real grid run was requested at 14:28:49.593.                                                                                                                                           |
| F10  | Intended late-approval overlap not provoked: the owner approved the first tick's reads before the following grid. That completed scheduled turn failed the required output contract, as detailed below.                                                                                                                                                                 |
| F11  | Not yet recorded: no qualifying host-notification scenario was performed.                                                                                                                                                                                                                                                                                               |
| F12  | Observed pass: the fresh observer's first five-minute loop reached 48 ticks, deleted its own schedule and emitted the capped stopped result. API and UI confirmed absence.                                                                                                                                                                                              |
| F13  | Observed pass on this path: actual scheduled prompts carried the `$effective-flow focus follow-up tick` prefix and performed admission and incremental reads. No independent loader or deterministic model-compliance claim is made.                                                                                                                                    |
| F14  | Not yet recorded: cleanup stop was performed, but no stop/resume qualification sequence followed.                                                                                                                                                                                                                                                                       |
| F15  | Not provoked: the coordinator missed the early-send window. No Send now click or manual tick occurred.                                                                                                                                                                                                                                                                  |
| F16  | Quiet tick 2 added 7 activity items / 21,532 extracted text characters and 2 message items / 539 characters. Its three reads charged 15,512 characters. The first loop subsequently reached its cap. These are character counts, not tokens; no compaction-stop result is claimed.                                                                                      |

The snapshot evidence retains the report-only limits: initial-read delivery effects and the
state/history race were not established. Native compaction history was not exhaustively inspected;
the cap result does not prove that no internal compaction occurred.

#### Missing checkpoint and failure cleanup

The approval-required scheduled run began at 14:24:04.771 UTC. Human read approvals completed at
14:27:16.232 and 14:27:25.958. At 14:27:37.189 its sole visible assistant output was:

```text
< t3-thread>
```

The run completed at 14:27:37.252 without a focus checkpoint or prescribed report. The host's
separate native checkpoint was not a focus output. This is an observed output defect, not a
successful late-approval overlap. No source fix, static-guard proof of model behavior or acceptance
exception is claimed.

Further scenario provocations stopped. The main observer processed its own stop and deleted its
schedule; the coordinator deleted the approval-required observer's schedule and interrupted only
its own following pending run. No approval was answered by the coordinator, and no stopped
checkpoint is invented for that interrupted turn. API and paired UI observations confirmed both
automations absent.

The independent first cap loop was preserved without manual ticks, interval changes or an early
stop. It started at 13:38:51.290 UTC; its actual 48th run was requested at 17:39:29.329. Its own
schedule deletion returned true at 17:39:57.809. The completed output at 17:40:05.642 reported the
48-tick cap and ended `ticks=48 | backlog=no | lag=0 | state=stopped`. The native run completed at
17:40:05.737. The schedule API returned an empty list, and the authenticated, fully loaded UI
showed no Automations heading or manage button. This cap result does not reverse the independent
output failure.

#### November 9 restoration and evidence

After final candidate verification, all active projects, including child sessions, were checked
before shared mutations. No foreign Codex run was active; foreign work was untouched. The guarded
restore reinstated the original DALO symlink and all 188 baseline entries. It removed only the
owned temporary configuration, after confirming that the original was absent and its installed
hash still matched. The candidate copy was retained privately.

A 45-second delayed helper rechecked the current app-server executable and process-start identity
before signaling it. The old process was absent and its replacement started later. Post-restart
verification confirmed the original link, full 188-entry tree and configuration absence.
`dalo --json status --check` returned exit 0; its complete parsed JSON was semantically equal to
the fresh pre-install baseline. DALO assistant and doctor checks also returned exit 0.

No qualification schedule remains active. All 16 finished sessions belonging to this attempt,
including the cap observer and target, were archived. The recording plan remains unimplemented
and unarchived. This failed entry changes no product source, fixture, activation status, ADR or
PR readiness. Any further fix and fresh qualification require the plan's failure procedure.

The private evidence includes native-payload captures, visible-text observations and explicit
coordinator transcriptions of actual tool results. The digests below bind those existing files;
they do not assert a complete raw API export or backfill missing historical payloads.

| Evidence file                                                  | SHA-256                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| `qualification-2026-11-09/O4-first-tick-output-failure.json`   | `85eddf81eda0bed5d0b98897e782791d2e8e989c4bfa29cbf048a7df138c53d9` |
| `qualification-2026-11-09/O4-first-tick-output-failure-UI.png` | `bc85334ebcda68b0f4abf0e47583de6ec5b5c37a5a7264a0b460761367d740b1` |
| `qualification-2026-11-09/F1-completion-result.json`           | `e57917a547c13ad37409753ba7a58c08ae562ce88bb063590428a8da27cb2a4a` |
| `qualification-2026-11-09/F2-completion-result.json`           | `436dc8e23c9307c3dde60fc0792ea926e1911dc4496e17063e2a4af72f0243d1` |
| `qualification-2026-11-09/F4-completion-result.json`           | `dc46b137dbc0d02b62a1f15206bf4f658d29a6544f21c86344320e45aee03d57` |
| `qualification-2026-11-09/F13-completion-result.json`          | `bb931a9f1aef350823625f76c574829fd31d8625db21901b326e16a6eaa7c812` |
| `qualification-2026-11-09/F16-quiet-tick-growth.json`          | `4a4b52782579622e5ee2a647475d97d1c276e793ff46e4d0a2745a61da01f1d1` |
| `qualification-2026-11-09/cap-completion-result.json`          | `5cb01c93ab1cc217cdda1d8a1ba1b896464be128e781c0f944f67add01d28586` |
| `qualification-2026-11-09/O2-cap-completion-UI.png`            | `987d08c091a84820562c3d0c79eb20b972fa4d501d9496cd7326b7652bbb9115` |
| `qualification-2026-11-09/failure-cleanup-noncap.json`         | `8362234ca06756e6e87f4ba70463dc581f2ac0303249e72eaf876f20891bdf26` |
| `qualification-2026-11-09/candidate-end-integrity.json`        | `bdefb7556c31f2d282a7ef68539a7f707c808b3c38f0ccb6455a6e89da105ad8` |
| `qualification-2026-11-09/baseline.json`                       | `0290b52c06b745a4ba46bfe23851a56f6ae66e1219231a92c910bd451c1e7263` |
| `qualification-2026-11-09/restore-restart.json`                | `41313ef17e0be20f23b42ed6eef5bbe514ff4242ad51eeb2bf1bd2d2fe19557b` |
| `qualification-2026-11-09/restore-verification.json`           | `9745eb052a9d83798b427fce2aad0a9e266b73b5c7c2eb9dad710f0d806ea8fb` |
| `qualification-2026-11-09/dalo-restored.json`                  | `5c6d72c70215fca6f2cf4cf05ddafa30716d957ae1900c1e0bd2537d10f66bef` |
| `qualification-2026-11-09/ci-tested-tree-binding.json`         | `14aaf6aacb0c306276f479cfdf1b0d2111633b4b858e985fdbe07aa5414686d1` |

### November 11 recording on candidate C — failed snapshot output

**Result: failed; overall WP2b-2 qualification remains incomplete.** The first scenario of the
recording on integration candidate C produced an observed output defect. The defect ended the
recording under the #613 failure rule. No item F1–F16 is recorded for C, and no schedule was
created. The earlier records, activation status, acceptance matrix and ADRs remain unchanged.
#625 remains a draft.

#### C: candidate binding

The candidate was merge commit `a2e97ad8f83b13dac87bf2b7931f2731c029a810`. Its parents are
`974fe72e` and the `develop` merge base `2ff3c0fd`.

- **Build:** portable build `1.73.0 (a2e97ad)`.
- **Host:** T3 Code 0.1.7 through provider instance `codex`.
- **Model:** host-reported `gpt-6.1-sol` at medium reasoning effort, in full-access runtime mode
  with approval policy `never`.
- **Sessions:** fresh top-level sessions in a dedicated throwaway project.
- **Configuration:** the qualified conditional `developer_instructions` entry was active, with
  SHA-256 `38c613f6…`. It was the only key in a configuration file that did not exist before.
- **Scenario requests:** a separate coordinator authored them through the API under supervised
  execution.

Local validation of C:

- format, build, distribution and the eval evidence report passed;
- the full suite passed except the focus digest guard (5,042 passed, 27 skipped, 1 failed). The
  guard is red by design until a passing record exists;
- CI's unit-test step matched that result, and format, shellcheck and manager compatibility
  passed.

Install and restore:

- The installed portable tree matched its complete 192-entry manifest at installation and at the
  end.
- The configuration hash matched at both boundaries.

| Candidate file                                                | SHA-256                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/tools/focus.md`                                          | `d5b2c8cb7e5099a35dd2d2a461767c78e980d6aa407ba7af444507aaee7fa912` |
| `src/shared/focus-session-contract.md`                        | `405a7742145d41141a0b5026b32ac04bc88f3330a659989b0f7103518cb2a68a` |
| `src/shared/focus-follow-up.md`                               | `c6ee9dc6414b1ae4037a4012d9afba88599fe3f6f8a9ee39bd15c1f340ffe601` |
| `src/shared/retro-native-sources.md`                          | `bc41608b8a3d7bca2a18790b3fc1669ec0c8ba41fbace1a0554546e987a27dd3` |
| `build.mjs`                                                   | `e16d106ef09ecdb7f52255d04a7eccdfcf5cba4a4b9199007ed3ddad7dbc47d4` |
| `dist/portable/effective-flow/tools/focus.md`                 | `08e39a78b07603577156fd75af662ee900963134f86c95f98dc60ce81372aa5e` |
| `dist/portable/effective-flow/shared/focus-follow-up.md`      | `2b41e1c864aede33157781c14fd006ad4b3b421e4ed186711f5a627b425af4d2` |
| `dist/portable/effective-flow/shared/retro-native-sources.md` | `bc41608b8a3d7bca2a18790b3fc1669ec0c8ba41fbace1a0554546e987a27dd3` |

#### C: observed defect

The first scenario was the initial snapshot of the cap-loop observer on a synthetic open target.
It ran from 23:06:34 to 23:07:40 UTC.

Internally the run followed the contract:

- it loaded the candidate skill and `focus-follow-up.md`;
- it checked identity and scope before history and read the target within budget;
- it selected `gpt-5.6-luna` at medium effort for the analysis leaf;
- the leaf returned a supported On track verdict ending `DONE`.

The sole visible final message was:

```text
**On track — observed snapshot.**

< t3 >
```

The message lacks the target citation, cited evidence, coverage, the report-only correction and
dispatch statement, and the follow-up offer. API messages and the provider's raw output in the
private Codex session record agree byte for byte.

The visible output token count leaves no room for a link that was generated and then removed: 19
tokens against about 4 tokens of message overhead. The model itself produced the fragment and
ended the message. This is an observed output defect. No source fix or acceptance exception is
claimed.

**Cause.** A later read-only diagnosis found the same fragment shape (`< t3-thread >` or `< t3 >`)
in five independent assistant messages:

- the November 9 tick output above;
- this snapshot;
- three messages in two non-focus sessions, both without the `developer_instructions` entry and
  with approval policy `never`.

That is about 1% of messages that carry a T3 thread link. The host instructs the model to mention
a thread by its link, and no focus source requires a link. The focus output lists the target
identity first, so in a snapshot the link lands right after the headline. In a tick it lands
before the required final checkpoint. Elsewhere it usually ends the message.

The diagnosis therefore points to a host-prompted, model-level link-emission glitch that focus
turns into a total loss of the report or checkpoint. It was challenged once and weakened in
detail, not refuted. The model attribution and a possible tool-output trigger remain open. The
cause is not proven.

#### C: restoration and evidence

Before installation, every active project was checked. One foreign Codex run blocked the first
attempt, and installation proceeded only after it ended; foreign work was untouched.

After the defect, further scenarios stopped. The main target, a second staged target and the
observer were archived, and no schedule existed.

The guarded restore:

- confirmed that the installed tree still matched the candidate manifest;
- reinstated the original DALO slot link and all 190 baseline entries;
- removed only the owned temporary configuration after its hash matched;
- signalled the app-server only after rechecking its executable and process-start identity. The
  old process was absent afterwards.

Post-restore verification confirmed the original link, the full tree and the absence of the
configuration. `dalo --json status --check` returned output byte-identical to the pre-install
capture. The host was restored at 23:08:36 UTC.

The recording plan remains unimplemented and unarchived. This failed entry changes no product
source, fixture, activation status, ADR or PR readiness. The attempt allowance for C is used up.
Any further candidate needs an owner decision and follows the plan's failure procedure.

| Evidence file                              | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `candidate-c/O2-snapshot-defect.json`      | `ab46277ce21353e4ba640032178fbf6a2f85ac32dd79c517a2ef041c83fb1da2` |
| `candidate-c/O2-raw-provider-output.json`  | `0368d8567936a1ff821f1c70e2ff5bcc0a07ed63b33841a3353afd962d92ad23` |
| `candidate-c/diagnosis-2026-11-12.md`      | `9061f8c9b9e3b999694dddc2e65560c10376b1eefc9e7bd4a93b543b8a58f58b` |
| `candidate-c/candidate-digests.json`       | `8df27d497d8ea5197f7ada9d9d27ed0f392f4d49563afc5abdfab2d82d050cd0` |
| `candidate-c/step0-result.json`            | `87673f71aac2abaa32cae5bc61fc6674d1eb6dc817ee6546c124d3711494842c` |
| `candidate-c/candidate-end-integrity.json` | `aaa7e2739d9c1a23609b237b670416d0c842686e0a46541b1b569b5b96ec763c` |
| `candidate-c/baseline.json`                | `e2f492d4d7a273b9c95f2f1c8dc53bf136eb637b715d814777295b0440482b01` |
| `candidate-c/restart-restore.json`         | `ff42ffee1ff9409f6f583fa2504a9d0e91456163ea847f733d4e42e83f94701c` |
| `candidate-c/restore-verification.json`    | `2244a5e098173d718b813fdd4e4c6deb89a299752d564ba736fa218b37efa094` |
| `candidate-c/dalo-post.json`               | `5a95cb8868fffd47d5af27e0f97440b11d3eece613c260e8af4effe201588425` |

### November 12 recording on candidate 887ba1fd — failed host-link naming

**Result: failed; overall WP2b-2 qualification remains incomplete.** The first scenario on
candidate `887ba1fd` produced an observed defect: the observer's otherwise complete snapshot cited
its target as a T3 thread link, which `887ba1fd`'s naming rule forbids. Under the owner decision
of 2026-11-12, a visible host thread link in focus output is a defect even when the message is
complete. The recording stopped under the #613 failure rule. No item F1–F16 is recorded for
`887ba1fd`, and no schedule was created. The earlier records, activation status, acceptance
matrix and ADRs remain unchanged. #625 remains a draft.

#### 887ba1fd: candidate binding

The candidate was `887ba1fd012f264cc88032633c7c9cc3df3c92c6`. It is candidate `a2e97ad8` plus two
commits: the failed entry above and the fix. The fix makes focus name every session in visible
output by its exact reference in inline code (on T3 the bare thread ID), never as a host thread
link, and exempts the checkpoint line, whose `target=` stays raw.

- **Delta from `a2e97ad8`:** among the focus sources and `build.mjs`, only the fix's two sentences
  changed. `origin/develop` changed no file the focus build includes since merge base `2ff3c0fd`.
- **Build:** portable build `1.73.0 (887ba1f)`.
- **Host:** T3 Code 0.1.7 through provider instance `codex`.
- **Model:** host-reported `gpt-6.1-sol` at medium reasoning effort, in full-access runtime mode
  with approval policy `never`.
- **Configuration:** the qualified conditional `developer_instructions` entry was active
  (SHA-256 `38c613f6…`), the only key in a configuration file that did not exist before.
- **Sessions:** fresh top-level sessions in a dedicated throwaway project. The coordinator
  authored the scenario requests through the API under supervised execution.

Validation:

- On a clean, container-local checkout of the candidate, the following passed:
  - format;
  - the focus contract tests (26) and focus eval tests (88);
  - the build, with focus at 413 of 414 budget lines;
  - the distribution suite;
  - the eval evidence report for all five suites.
- CI's unit-test step on the candidate failed only in the focus digest guard, which is red by
  design (5,107 tests, 5,079 passed, 27 skipped, 1 failed).
- Format, shellcheck and manager compatibility passed.

Install window 1:

- The installed portable tree matched its complete 192-entry manifest at installation and at the
  end.
- `diff -r` against the build was empty.
- The configuration hash matched at both boundaries.

| Candidate file                                                | SHA-256                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/tools/focus.md`                                          | `dc468d84335e22eba080d0dca70d027de9ff2b26af3e33a69c2ef2d2d467e496` |
| `src/shared/focus-session-contract.md`                        | `405a7742145d41141a0b5026b32ac04bc88f3330a659989b0f7103518cb2a68a` |
| `src/shared/focus-follow-up.md`                               | `6ffc6c707374588998349a10cbe2697b093fa1fadee89501a5240cc7f8c896e4` |
| `src/shared/retro-native-sources.md`                          | `bc41608b8a3d7bca2a18790b3fc1669ec0c8ba41fbace1a0554546e987a27dd3` |
| `build.mjs`                                                   | `e16d106ef09ecdb7f52255d04a7eccdfcf5cba4a4b9199007ed3ddad7dbc47d4` |
| `dist/portable/effective-flow/tools/focus.md`                 | `0a247f3d66d400706a0800a7f0accb5a7505ae77064f5f1e6e3e237656dd9aee` |
| `dist/portable/effective-flow/shared/focus-follow-up.md`      | `24c769ab9ffc162850761bb888047b448beef555aab12bf2045537bbe94cc562` |
| `dist/portable/effective-flow/shared/retro-native-sources.md` | `bc41608b8a3d7bca2a18790b3fc1669ec0c8ba41fbace1a0554546e987a27dd3` |

#### 887ba1fd: observed defect

The first scenario was the initial snapshot of the cap-loop observer on a synthetic open target.
It ran from 12:18:53 to 12:20:15 UTC.

The observer:

- loaded the installed skill;
- read the target within budget;
- selected `gpt-5.6-luna` at medium effort for the analysis leaf.

Its final message was complete. It carried:

- the On track verdict with cited positions;
- coverage and the conservative read budget;
- owner-guidance use and the analysis leaf's settings;
- the report-only limits and "Message delivery: Not attempted";
- the follow-up offer.

The offer's stop command named the target as a bare ID inside inline code. The first sentence,
however, cited the target as a Markdown link to the target's T3 thread URL, in the form
`[Selected session](<t3-thread://…>)`.

The observer's private Codex session record shows that the observer read the installed
`tools/focus.md`, including the new naming sentence, before answering. The T3 host prompt in the
same session tells the model to mention a thread by its link. In this run the host instruction
prevailed over the focus rule.

API messages and the provider output in the session record agree byte for byte. A scan of the
observer's three assistant messages found the link in the final message and no other link,
fragment or truncation.

This is an observed defect under the owner decision above. No source fix or acceptance exception
is claimed. The naming rule alone did not contain the host link instruction on this model and
effort.

#### 887ba1fd: restoration and evidence

Before installation, every active project was checked: no Codex work was running, and the
configuration file was absent. After the defect, no further scenario started. The target and the
observer were archived, and the schedule list of the throwaway project was empty.

The guarded restore:

- confirmed that the installed tree still matched the candidate manifest;
- reinstated the original DALO slot link and all 190 baseline entries;
- removed only the owned temporary configuration, after its hash matched;
- signalled the app-server only after rechecking its executable and process-start identity. The
  old process was absent afterwards.

`dalo --json status --check`, run in the same environment as the pre-install capture, returned
byte-identical output. The host was restored at 12:20:53 UTC.

The recording plan remains unimplemented and unarchived. This failed entry changes no product
source, fixture, activation status, ADR or PR readiness. The attempt allowance for `887ba1fd` is
used up. Any further candidate needs an owner decision and follows the plan's failure procedure.

| Evidence file                                       | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `candidate-d/O2-snapshot-link-defect.json`          | `20b70786133f53ddb7418fa4dfdb2c00b47566d4703c182ec851c6151ebaf6af` |
| `candidate-d/scan-O2-window1.json`                  | `2a0b74f72a241561bbd017f2c30e4c09f308a42d2312ce84d8b9a373576af2a1` |
| `candidate-d/candidate-digests.json`                | `86cf9ca2411cd1e1fdc6c2487589c388ee35b67a0a6f234987b1d9e1f618c4c0` |
| `candidate-d/step0-result.json`                     | `08e068fd557c55c877a832188e39ac3d87426a3b038bc2117e2c8787691702d1` |
| `candidate-d/step0-source-delta.txt`                | `97c014b7083578e01b6fbd21db99ccd4e916d7ce4e6d44da7310c4d94f2d932a` |
| `candidate-d/window-1/candidate-end-integrity.json` | `8664d800850fc765d1a6c27a14a252e32067ed34d5612fd221e1bfb129e94a76` |
| `candidate-d/window-1/baseline.json`                | `708bea3cc85b33b830db32c6fdde0342b1a6a50f453571a5c80a3122ba6907ce` |
| `candidate-d/window-1/restart-restore.json`         | `7df551028d8fbf3ac1c37b457f14caaf6cb14b5177e10ce9aac7704c56da8d6a` |
| `candidate-d/window-1/restore-verification.json`    | `9a9e7f4a31427e9081959939f2c057487e08a7d120e4ce5cbb8cf4ef303bcb9c` |
| `candidate-d/window-1/dalo-post.json`               | `d6b8b7e7f43b21175b50c2602d8569c0851ca582fbaacdd629710dfce5d54e91` |

### November 12 recording on candidate 887ba1fd, window 2 — failed follow-up offer

**Result: failed; overall WP2b-2 qualification remains incomplete.** After the window 1 failure
above, the owner decided on 2026-11-12:

- a well-formed host thread link to the right session in an otherwise complete message counts as a
  limitation, not a defect;
- a malformed link fragment, a link or ID naming the wrong session and an incomplete report stay
  defects;
- the qualified configuration gains one sentence that applies the naming rule to every focus turn;
- one further attempt on `887ba1fd`.

In the second install window, a complete snapshot omitted the follow-up offer that its eager offer
condition required. The recording plan counts a missing offer as an incomplete report, so the
recording stopped under the #613 failure rule. No item F1–F16 is recorded as passed for `887ba1fd`.
The earlier records, activation status, acceptance matrix and ADRs remain unchanged. #625 remains
a draft.

#### 887ba1fd window 2: binding

The candidate, its validation and its eight digests are those of the window 1 entry above.
Differences:

- **Build:** portable build `1.73.0 (57fc72a)`. The branch head had advanced only by the window 1
  failed entry, a documentation commit. The installed tree matched window 1's 192-entry manifest
  except for the version stamp in `SKILL.md` and `tools/version.md`, and all eight digests matched.
- **Configuration:** the extended entry below was active (SHA-256 `c19e3da3…`), the only key in a
  configuration file that did not exist before. Its first eight lines are the qualified 2026-11-10
  entry unchanged.

```toml
developer_instructions = """
For effective-flow focus follow-up tick turns only: apply the focus contract's output rules to
all visible assistant messages in the turn. When the tick is quiet, emit exactly its required
checkpoint line as the final response and no opening commentary, progress update, acknowledgement,
heading or other visible prose. For reportable events, emit only the report and checkpoint required
by the focus contract. This specific exception overrides generic progress-commentary requirements
for these tick turns only. Keep all tool, admission, read-budget, authority and safety rules.
For every other turn, retain the normal communication requirements.
In every effective-flow focus turn, snapshots and follow-up ticks alike, name every session in
visible output by its exact reference in inline code (on T3 the bare thread ID), never as a host
thread link or angle-bracketed URL, even where host instructions ask to mention threads by their
link. The checkpoint line keeps its raw target.
"""
```

Host, model, effort, runtime mode, approval policy and session handling were as in window 1. Install
window 2 ran from 14:23:38 to 14:32:54 UTC. The installed tree matched its manifest at installation
and at the end, `diff -r` against the build was empty, and the configuration hash matched at both
boundaries.

#### 887ba1fd window 2: observations before the defect

These observations are not recorded items, because the record binds only a complete pass:

- The cap-loop observer's opening snapshot of a synthetic open target was complete and named the
  target in inline code. The 5-minute opt-in created a schedule, and the checkpoint kept a raw
  `target=`. The first scheduled tick posted the one-time idle-target report with the exact
  `state=active` ending.
- The main observer's positive snapshot of a second synthetic target was complete, including the
  offer. "No follow-up" created no schedule. The self refusal and, through the delegated child of a
  parent session, the ancestor refusal were complete.
- One host fault occurred. Shortly after T3 marked the second target settled, the observer's
  target-state read returned a tool error instead of session metadata. The observer refused
  admission completely, without verdict or delivery. Under the plan this is a host fault and was
  retried.
- A scan of all 17 assistant messages of the three observers found no host thread link, no
  malformed fragment and no truncation. T3 texts equalled the Codex session records byte for byte.

#### 887ba1fd window 2: observed defect

The retried snapshot of the second target ran from 14:30:51 to 14:31:42 UTC in the main observer.
It came after that observer's earlier offer for the same target and the operator's "no follow-up"
answer.

The final message carried the On track verdict with cited positions, coverage, the conservative read
budget, owner-guidance use, the analysis leaf's settings and "Message delivery: Not attempted". It
named the target in inline code. It ended "No follow-up scheduled." without the offer and its
disclosures.

The eager offer condition held:

- a non-tick turn completed an initial verdict;
- the target was a top-level admitted target on the T3 observed path;
- the gate row matched, as the same observer's earlier offer shows;
- the snapshot served a history page.

Under `shared/focus-follow-up.md` "Offer", a "no follow-up" answer withdraws only the offer it
answers, and a new snapshot owes a new offer. The turn's tool calls show no read of
`shared/focus-follow-up.md`, which `tools/focus.md` loads on demand before presenting an offer.

This is an observed defect in focus's snapshot behaviour, independent of the link rule. No source
fix or acceptance exception is claimed.

#### 887ba1fd window 2: restoration and evidence

Before installation, no Codex work was running in any project and the configuration file was absent.
After the defect, no further scenario started. The coordinator deleted the cap loop's schedule
through the T3 API after its first tick; the schedule list of the throwaway project was then empty.
All throwaway sessions were archived.

The guarded restore:

- confirmed that the installed tree still matched the candidate manifest;
- reinstated the original DALO slot link and all 190 baseline entries;
- removed only the owned temporary configuration, after its hash matched;
- signalled the app-server only after rechecking its executable and process-start identity. The
  old process was absent afterwards.

`dalo --json status --check` returned output byte-identical to the pre-install capture. The host was
restored at 14:32:54 UTC.

The recording plan remains unimplemented and unarchived. This failed entry changes no product
source, fixture, activation status, ADR or PR readiness. The further allowance for `887ba1fd` is
used up. Any further attempt or candidate needs an owner decision.

| Evidence file                                       | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `candidate-d/window-2/O-missing-offer-defect.json`  | `a6166d5526ff74c2ef220747ed90b4aeeeb3b7f6292ddafd2157c40ab6f874ff` |
| `candidate-d/window-2/O-host-fault-1.json`          | `dcfb9270c1d36cc71fc8a93eb9f7bf20e587edfa68b0de9a0e0bc068ead42f91` |
| `candidate-d/scan-w2-O-final.json`                  | `57b0b75b4a4b77f79a2d6e9a234861ee6854906df084daf1c0d0d87cefab40be` |
| `candidate-d/scan-w2-O2-final.json`                 | `66a6a0fbc551dd6fc1519af2836ca5d78fa87ff271118ba1cd5bee4bde67b318` |
| `candidate-d/scan-w2-P-child-final.json`            | `2dd14a234b040d77afdec08671ac3850dfe9ceabdd271c57d5ea8feba81ea444` |
| `candidate-d/temporary-config-2.toml`               | `c19e3da30e7256403e4a88881745026311c5127c3e35051cc656cff813680f42` |
| `candidate-d/window-2/stage-deviation.json`         | `69df1b1966178731de702a1af6f9d2e88a8bfddeb96f53be76c446c8d702c571` |
| `candidate-d/window-2/candidate-end-integrity.json` | `b00650dc6cc2ecb2a711ca1e204ce7d7c7ece440691488505055cf210d48fda9` |
| `candidate-d/window-2/baseline.json`                | `7d02285bc7e0c3000015da74ae802f35a8491db2f4a43741368650576fca32dd` |
| `candidate-d/window-2/restart-install.json`         | `1243540ee870f542c8ab702d605f1bd34cd0850a92674d91b995d2d10ba9f804` |
| `candidate-d/window-2/restart-restore.json`         | `36afe8fa36d8f42b84e113d5a536994acea2ee2f2ea5d7174bb1eb95cfae5c83` |
| `candidate-d/window-2/restore-verification.json`    | `fbc92a2b2e65ebef8b71c9b32df08cdd0b4ce9bbf8300a1c959068c712bcc176` |
| `candidate-d/window-2/dalo-post.json`               | `d6b8b7e7f43b21175b50c2602d8569c0851ca582fbaacdd629710dfce5d54e91` |

### November 12 recording on candidate 85728d95 — failed schedule self-deletion

**Result: failed; overall WP2b-2 qualification remains incomplete.** After the window 2 failure
above, the fix `85728d95` made a declined or withdrawn offer bind only itself. One install window on
`85728d95` observed every item F1–F16. The owner accepted two deviations as limitations during the
run:

- a later snapshot in a long observer conversation carried the follow-up offer without its
  disclosures;
- one end event deleted its schedule with a malformed ID.

When the second deviation recurred at the cap of a different loop, the owner reclassified it as a
defect under the #613 failure rule. No item F1–F16 is recorded as passed for `85728d95`. The
earlier records, activation status, acceptance matrix and ADRs remain unchanged. #625 remains a
draft.

#### 85728d95: binding

The candidate was `85728d955c31ae553788c9286d6b6cab2ce4bf39`: `887ba1fd`, its two failed entries and
the fix.

- **Delta from `887ba1fd`:** among the focus sources and `build.mjs`, only the fix's sentence in
  `src/tools/focus.md` changed.
- **Build:** portable build `1.73.0 (85728d9)`, focus at 414 of 414 budget lines.
- **Validation on a clean, container-local checkout:**
  - format, the focus contract tests (27) and the focus eval tests (88) passed;
  - the build and the distribution suite passed;
  - the eval evidence report passed for all five suites.
- **CI:** run `43249974317` failed only in the focus digest guard, which is red by design (5,108
  tests, 5,080 passed, 27 skipped, 1 failed).
- **Host:** host, model, effort, runtime modes and session handling were as for `887ba1fd`.
- **Configuration:** the extended entry shown in the window 2 binding was active (SHA-256
  `c19e3da3…`).

Install window 1 ran from 16:53:56 to 21:04:58 UTC. The installed tree matched its 192-entry
manifest at installation and at the end. `diff -r` against the build was empty, and the
configuration hash matched at both boundaries.

| Candidate file                                                | SHA-256                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/tools/focus.md`                                          | `f694d14058fa4a50bee7fd19b8540b06d98743fdceb83a8deec482ede19e9b78` |
| `src/shared/focus-session-contract.md`                        | `405a7742145d41141a0b5026b32ac04bc88f3330a659989b0f7103518cb2a68a` |
| `src/shared/focus-follow-up.md`                               | `6ffc6c707374588998349a10cbe2697b093fa1fadee89501a5240cc7f8c896e4` |
| `src/shared/retro-native-sources.md`                          | `bc41608b8a3d7bca2a18790b3fc1669ec0c8ba41fbace1a0554546e987a27dd3` |
| `build.mjs`                                                   | `e16d106ef09ecdb7f52255d04a7eccdfcf5cba4a4b9199007ed3ddad7dbc47d4` |
| `dist/portable/effective-flow/tools/focus.md`                 | `00adaf80283bd198fb23e65150c28cd67ad590c79ba62c4438f43d6d5c4226b5` |
| `dist/portable/effective-flow/shared/focus-follow-up.md`      | `24c769ab9ffc162850761bb888047b448beef555aab12bf2045537bbe94cc562` |
| `dist/portable/effective-flow/shared/retro-native-sources.md` | `bc41608b8a3d7bca2a18790b3fc1669ec0c8ba41fbace1a0554546e987a27dd3` |

#### 85728d95: observations

These observations are not recorded items, because the record binds only a complete pass:

- **Snapshot and refusals (F1):**
  - a positive snapshot with the offer; "no follow-up" created no schedule;
  - complete self and ancestor refusals;
  - after the decline, a second snapshot of the same target carried a new offer, so the window 2
    defect did not recur;
  - the authenticated T3 UI rendered the target ID as inline code, not as a link.
- **Tick behaviour:**
  - the one-time idle report, then a quiet tick (F2);
  - Looping reported once and not repeated (F3);
  - a quiet tick across an 11-minute silent command (F4);
  - completion reported and the schedule deleted, twice (F5);
  - a queued tick behind an operator turn, answering no developer turn (F9);
  - a background-task notification run that was not treated as a tick (F11);
  - the bare thread ID and the `$effective-flow` prefix in every tick prompt (F13);
  - stop, then an explicit resume with a new offer and a new handle (F14).
- **Invalid checkpoint (F7):** in a fresh observer, the first tick stopped before any host access
  with the one-time notice and `ticks=1`. The second tick wrote `ticks=2` with no notice and no
  deletion. Both were observed for two loops.
- **Failed deletion (F8):**
  - the owner deleted the schedule in the T3 UI before the target completed and before any grid
    fire. This order was swapped from the plan to remove timing pressure;
  - the directly sent tick reported completion, surfaced `task_not_found` and stated that deletion
    was unconfirmed, ending `state=stopped`.
- **Approval-required mode (F10):** the owner held a tick's real approval past several grid fires.
  The held tick then completed with the exact checkpoint, and the queued fires ran one after
  another without overlap.
- **Early send (F15):** T3 labels the early-send control for a queued scheduled run "Steer". The
  steered tick ran inside the busy operator turn and posted the exact checkpoint.
- **Cap loop (F12, F16):** the loop reached its 48-tick cap without compaction. A real quiet tick
  added 7 `activity` items (about 20,400 payload characters) and 2 `messages` (about 1,800
  characters).
- **Host fault:** one target-state read failed after T3 auto-settled the target. The observer
  refused admission completely and the retry succeeded.
- **Naming:** a scan of 141 assistant messages across five observers found no host thread link, no
  malformed fragment and no truncation. T3 texts equalled the Codex session records.

Both limitations the owner accepted before the reclassification:

- **Offer disclosures:** the fifth snapshot in the main observer's conversation offered the
  intervals without the offer's disclosures. The report was otherwise complete and the opt-in
  worked.
- **Schedule ID:** see the observed defect below. The owner first accepted its F6 occurrence as a
  limitation.

#### 85728d95: observed defect

`shared/focus-follow-up.md` deletes the prompt's handle under the deletion safeguard. Its T3
scheduled-task ID carries the `scheduled-task:` prefix that the checkpoint line also records.

In two of the three loops that ended by an end event, the observer passed the ID to
`delete_scheduled_task` without that prefix:

- **F6, approval-mode observer:** after the owner deleted the target in the T3 UI, the next tick
  read `thread_not_found` and reported lost access with Cannot judge. It then called
  `delete_scheduled_task` with the bare UUID and received `task_not_found`. It ended
  `state=stopped` with the notice that deletion was unconfirmed. The schedule kept firing until
  the owner deleted it in the T3 UI.
- **F12, cap-loop observer:** tick 48 reported the cap. It then made the same unprefixed call,
  received `task_not_found` and ended `state=stopped` with the same notice. Tick 49 retried the
  unprefixed call, as the stopped-state rule requires, and posted only its checkpoint. The owner
  deleted the schedule in the T3 UI.

The main observer passed the full prefixed ID in all four of its deletions. Three of them deleted
the schedule; the fourth was the provoked F8 failure.

Every report was honest and the fallback notice worked. The end events' self-deletion still failed
for reasons inside focus's own call. This is an observed defect in focus's end-event behaviour. No
source fix or acceptance exception is claimed.

#### 85728d95: restoration and evidence

After the defect, no further scenario started:

- the owner deleted the remaining schedules in the T3 UI; the T3 database then held no active
  qualification schedule, and the UI listed none;
- all throwaway sessions were archived, and the F6 target had been deleted.

The guarded restore:

- confirmed that the installed tree still matched the candidate manifest;
- reinstated the original DALO slot link and all 190 baseline entries;
- removed only the owned temporary configuration, after its hash matched;
- signalled the app-server only after rechecking its executable and process-start identity. The
  old process was absent afterwards.

The pre-install DALO capture ran with `CLAUDE_CONFIG_DIR` set to a second Claude profile. In that same
environment, `dalo --json status --check` returned output identical to the capture. With the
variable unset, only the known hook target differed. The host was restored at 21:04:58 UTC.

The recording plan remains unimplemented and unarchived. This failed entry changes no product
source, fixture, activation status, ADR or PR readiness. A further candidate needs the owner's
decision.

| Evidence file                                              | SHA-256                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `candidate-85728d95/window-1/F12-cap.json`                 | `d13e4b3d23c3ae7b3eb608904e853ad1e006f3a775b19a9afe8e2294ee6ecdb5` |
| `candidate-85728d95/window-1/F6-lost-access.json`          | `bb564b2a4c0f89431e46d9e905e1587cc0fadd43c8c8443f0e551b064ed57fb6` |
| `candidate-85728d95/window-1/limitations.json`             | `67b98c34c3d23c805a1d94b654d6497a24ebd2d88a045fe0f85d3b250f1d62ab` |
| `candidate-85728d95/window-1/F7-F8-T2b.json`               | `a62c2bd1ed50c7802f97894f03dcd13ded927d7d6c0afdbd23315cc41a7173a9` |
| `candidate-85728d95/window-1/F15-early-send.json`          | `c9ea55225db5146a924947086c4da5057497fca54393528447bd8e4b69458b7a` |
| `candidate-85728d95/window-1/F16-growth.jsonl`             | `8e0d62021ab50c3d754fe8fdaec04f598907cf47eddd85866007864a84e00579` |
| `candidate-85728d95/window-1/O-host-fault-1.json`          | `a0b75760073fede013d89330b6bd1cb097dc6b7040aaa3795d311cf676f9b187` |
| `candidate-85728d95/scan-O-final.json`                     | `6f62fffd678835823f00d3a3d59ac3ad2b4754f82109b5b90f66f3eff2313715` |
| `candidate-85728d95/scan-O2-final.json`                    | `80b41ff459ab8aa0f44d18032ed5d966028b61fb24dfe6fdf1985faf9904dabf` |
| `candidate-85728d95/scan-O3-final.json`                    | `8ffe45c04321ca91ad0ba5462741541ea880d1a4ad910f12b94b5f02601a5b4a` |
| `candidate-85728d95/scan-O4-final.json`                    | `d81d34933c55387d9c0fda0c3b20bd77e4b44a5a0b6deefcda0d1dbff8798a64` |
| `candidate-85728d95/scan-P-child-final.json`               | `0dc93f58bfb4aee535261cfcb259dff99de353c7c500869af909beaa4175facf` |
| `candidate-85728d95/qualified-config.toml`                 | `c19e3da30e7256403e4a88881745026311c5127c3e35051cc656cff813680f42` |
| `candidate-85728d95/candidate-digests.json`                | `3c57ce7b864c82c4765757bcd6d1766b21e31bb9e7515f55350be67432b5e734` |
| `candidate-85728d95/window-1/candidate-end-integrity.json` | `ffcd0a2b68daec239558a14f49ec5bfc95f5165b57e99c27636a1d2fe872e90f` |
| `candidate-85728d95/window-1/baseline.json`                | `3930f03ee06319bbdc21a4e18d36f006172b1623285c85032f77e95acd8ee9ce` |
| `candidate-85728d95/window-1/restart-install.json`         | `4f207cc5043c28d44ed26b479fd00c52826a16dec4168a675931318d9a16a78b` |
| `candidate-85728d95/window-1/restart-restore.json`         | `2fe932e23b80b1d620a2fd08de4466db2754461a6d8e6d59621bbacd85850414` |
| `candidate-85728d95/window-1/restore-verification.json`    | `f10bd140debdab5682621075995e870bc8cfc1afc6ec391d945e7f89182afa29` |
| `candidate-85728d95/window-1/dalo-post-eg.json`            | `d6b8b7e7f43b21175b50c2602d8569c0851ca582fbaacdd629710dfce5d54e91` |

### F record for candidate 024bcb2a

**Result: passed with limitations.** On candidate `024bcb2a`, 14 of the 16 checklist items passed. By
owner decision of 2026-11-13, F3 and F12 are recorded as limitations instead of passes (see
`#### 024bcb2a: limitations`). No defect was observed. This record is the current binding for both
T3 observed rows; the earlier entries of this section, failed ones included, stay unchanged as
history.

The record was made on 2026-11-13 in three install windows of the same candidate. Window 1 was
valid until 12:47:50 UTC and ended in an external DALO fault; window 2 observed the items that
window 1 had left open; window 3 was a short window for the two facts that the retained records
could not give.

How to read it:

- **Pseudonyms.** Observers and targets carry role letters and the window that observed them, for
  example `O` (window 1) and `T` (window 1); `O2b` is the second cap-loop observer of window 2.
  Schedule handles are `H1`, `H2`, …. No thread ID, schedule ID, absolute user path or UUID is
  published; quoted checkpoint lines and tick prompts carry pseudonyms in place of those values.
  Observers `O` and `O2` exist in windows 1 and 2, and `O` in window 3, and are never mixed.
- **Authorship and provenance.** Unless an item says otherwise, the coordinator authored every
  scenario turn through the API under owner supervision (owner decision, 2026-11-06). Scheduled
  tick prompts are sent by the T3 scheduler; a tick prompt typed into an observer (F7, F8) is a
  coordinator turn. The owner alone performed these actions in the authenticated T3 UI or the
  approval prompts: the deletion of `T4` (window 1) for F6, the schedule deletion for F8, the
  Steer click for F15 and the real approvals of F10, plus the rendering check of window 3. Schedule
  and queue state is labelled "API" where it comes from the host's `list_scheduled_tasks` or
  `t3_queue` listings, which the owner accepted as schedule-state evidence (2026-11-13), and "UI"
  where the owner observed the authenticated T3 UI. No API result is presented as a UI
  observation.
- **Targets.** Targets are throwaway top-level threads in a dedicated throwaway project, running a
  staged synthetic task: the opening request asks for a three-part validation note (Scope,
  Evidence, Delivery) with overall completion withheld until a stage 3 request, the target answers
  stage 1 and then waits for the coordinator's stage 2 and stage 3 requests. Synthetic targets
  mention no threads or links.
- **Valid outputs only.** Window 1 outputs after 12:47:50 UTC are invalid and listed in
  `#### 024bcb2a: limitations`; every count, scan and checkpoint criterion covers valid outputs
  only.
- **German output.** From 13:40 UTC in window 2 the observers answered in German (see the host
  environment limitation). German text is quoted verbatim, sanitized, from the retained excerpts,
  each with an English gloss. For window 2 the excerpts are the leading characters that the watch
  log kept; the complete texts are not part of the evidence root. Window 3's complete German
  snapshot is in `window-3/ui/F1-ui-id-rendering.png`, and its trusted-context messages are in
  `window-3/O-host-context.json`.
- **Expected output** cites the headings of `src/shared/focus-follow-up.md` (follow-up), of
  `src/tools/focus.md` and of `src/shared/focus-session-contract.md` (the contract).

#### 024bcb2a: candidate binding

The candidate was `024bcb2a30065018530f2b2d39157985770e541f`, the merge of `origin/develop`
(`fe0624d4`) into the handle fix `855b0616`; the branch also holds `85728d95`, its failed entry
`60e817d4` and the earlier candidates' history.

- **Delta from `85728d95`:** among the four focus sources and `build.mjs`, only the "Scheduling"
  paragraph of `src/shared/focus-follow-up.md` changed (the handle is the complete ID returned by
  `schedule_task`, prefix included, passed unchanged as `scheduledTaskId`), and `build.mjs`
  differs only in the `CONTEXT_BUDGET_LINES` rows `iterate`, `setup`, `refactor` and `fix`, which
  the merge of `develop` brought in. `origin/develop` changed no focus source and no included
  fragment since `fe0624d4`. The source diffs are in `step0-source-delta.txt`; the built-file
  digests of the table below are in `candidate-digests.json`.
- **Build:** target `portable`, version stamp `1.73.0 (024bcb2)`, focus at 414 of 414 budget lines.
  The staged build came from a container-local clean clone at `024bcb2a`; the worktree build lacked
  Git and carried a no-Git stamp, with identical focus digests (`candidate-digests.json`).
  The built `retro-native-sources.md` equals its source.
- **Validation on a clean, container-local checkout (step 0):** format check, the focus contract
  tests (28 of 28) and the focus eval tests (88 of 88) passed; the build and the distribution
  suite passed; `pnpm eval <suite> verify --mode report` passed for all five suites. The digest
  guard test fails by design on the digest mismatch until the fixture follows this record
  (`step2-digest-guard.log`).
- **CI:** run `43320346579`, attempt 2, failed only in the focus digest guard (5,223 tests, 5,177
  passed, 45 skipped, 1 failed). Its attempt 1 also failed `test_real_six_worker_recovery`, a
  host-driver test outside focus, which passed unchanged on rerun and is logged as a flake. #625
  was a draft at head `024bcb2a`.
- **Calibration of the scan:** before the first install, the extended scan reproduced the known
  failures of `85728d95` window 1 (`calibration-result.json`): every prefix-stripped
  `delete_scheduled_task` call (`O4` at F6, `O2` at the cap tick and its retry), the four complete
  calls of `O`, and the offer without its disclosures.
- **Host:** T3 Code through provider instance `codex`. The T3 version `0.1.7` was reported by `O`
  (window 1) in its own snapshots (`window-1/F1-snapshots-refusals.json`, `F4-long-wait.json`);
  `O4` (window 1) wrote "host version unavailable" and `O` (window 3) reported no host version, and
  no host result carrying a server version is in the evidence root, so the T3 server version is not
  independently captured. The Codex harness version is `0.165.0`, as DALO reports it (the
  `provider_version` of the `codex` hook target), identical before and after the install in all
  three windows (`window-{1,2,3}/dalo-preinstall.json`, `dalo-post.json`).
- **Trusted context (window 3):** the observer `O` (window 3) called `orchestrator_capabilities`
  once. The result, in sanitized form: parent thread = this observer (pseudonymized),
  `inheritedProviderInstanceId` `codex`, `inheritedModel` `gpt-6.1-sol`, reasoning effort `medium`,
  runtime mode `full-access`, interaction mode `default`; the `codex` provider lists
  `canRunChildTask` true; features `appOwnedSubagents`, `asyncPolling`, `incrementalThreadRead` and
  `scheduledTasks` true (`window-3/O-host-context.json`). Not captured: the same call in the
  window 1 and window 2 observers (owner decision, 2026-11-13: re-observed once in window 3).
- **Model and effort:** `gpt-6.1-sol` at medium effort for the observers. The observers' analysis
  leaves ran as `gpt-5.6-luna` at medium effort as the observers reported; execution compliance
  with that selection is unverified, because no supported exact-child evidence handle was exposed.
- **Modes:** observers in default interaction mode and `full-access` runtime mode, except `O4`
  (window 1), which ran in approval-required mode; the trusted-context capture of `O4` is not
  captured.
- **Sessions:** fresh top-level observers and targets in the dedicated throwaway project, plus
  `P` (window 1) and its delegated child for the ancestor refusal. The coordinator was a separate
  session.

The qualified configuration was the extended entry below, the only key in `~/.codex/config.toml`,
a file that did not exist before (`config-ownership.json` of each window). Its first nine lines (the opening line plus eight instruction lines) are
the 2026-11-10 entry of "Experimental host prerequisite" unchanged. SHA-256
`c19e3da30e7256403e4a88881745026311c5127c3e35051cc656cff813680f42`, checked at every install, at
the end of windows 2 and 3 and at each window's removal.

```toml
developer_instructions = """
For effective-flow focus follow-up tick turns only: apply the focus contract's output rules to
all visible assistant messages in the turn. When the tick is quiet, emit exactly its required
checkpoint line as the final response and no opening commentary, progress update, acknowledgement,
heading or other visible prose. For reportable events, emit only the report and checkpoint required
by the focus contract. This specific exception overrides generic progress-commentary requirements
for these tick turns only. Keep all tool, admission, read-budget, authority and safety rules.
For every other turn, retain the normal communication requirements.
In every effective-flow focus turn, snapshots and follow-up ticks alike, name every session in
visible output by its exact reference in inline code (on T3 the bare thread ID), never as a host
thread link or angle-bracketed URL, even where host instructions ask to mention threads by their
link. The checkpoint line keeps its raw target.
"""
```

The entry's tick part applies to tick turns only. Its naming sentence also covers snapshot turns; it
is a prerequisite of the qualified naming on both rows, not of report-only correctness. The entry was
active for every scenario below, and the report-only row's snapshots ran with it present.

| Candidate file                                                | SHA-256                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/tools/focus.md`                                          | `f694d14058fa4a50bee7fd19b8540b06d98743fdceb83a8deec482ede19e9b78` |
| `src/shared/focus-session-contract.md`                        | `405a7742145d41141a0b5026b32ac04bc88f3330a659989b0f7103518cb2a68a` |
| `src/shared/focus-follow-up.md`                               | `f0dc099ec5c547ab28b761d1a4759c8809071ba59f4614048779ec7f91861d57` |
| `src/shared/retro-native-sources.md`                          | `bc41608b8a3d7bca2a18790b3fc1669ec0c8ba41fbace1a0554546e987a27dd3` |
| `build.mjs`                                                   | `1ce1e423bde44b6e03041d2952b241f0fe04da85eadcd664902a811c2d26265f` |
| `dist/portable/effective-flow/tools/focus.md`                 | `00adaf80283bd198fb23e65150c28cd67ad590c79ba62c4438f43d6d5c4226b5` |
| `dist/portable/effective-flow/shared/focus-follow-up.md`      | `c29cdf0d30aeca48ce9e3f5e74c89d23035706302af29ddf2673df92bdbf9ef5` |
| `dist/portable/effective-flow/shared/retro-native-sources.md` | `bc41608b8a3d7bca2a18790b3fc1669ec0c8ba41fbace1a0554546e987a27dd3` |

No digest-bound file changed between `024bcb2a` and the commit that carries this record: the four
focus sources, `build.mjs` and the three built focus files keep the digests above.

**Install windows.** Every window copied the portable build into the skill slot (no link), wrote
the qualified configuration and started a fresh Codex app-server. The installed tree was the
195-entry manifest of `candidate-manifest.json`, which has the same digest in all three windows.
Before each install, no Codex app-server was running and `~/.codex/config.toml` did not exist. The
install tool wrote its state only after these checks and recorded the configuration hash
(`install-state.json`); a separate result file for the pre-scenario tree comparison is not part of
the evidence root for any window.

| Window | Installed (UTC) | Fresh app-server | Held until / closed (UTC) | Baseline restored against             |
| ------ | --------------- | ---------------- | ------------------------- | ------------------------------------- |
| 1      | 09:04:49        | 09:05:41         | valid to 12:47:50; 13:30  | none possible (DALO fault, see below) |
| 2      | 13:31:54        | 13:32:14         | about 19:45 hold; 17:51   | its own pre-install capture           |
| 3      | 19:36:35        | 19:36:42         | 19:47                     | its own pre-install capture           |

- **Window 1.** Baseline: the original DALO source link with 190 entries, captured at 09:04:41.
  Between 12:43 and 12:47:50 UTC an external DALO reorganization replaced the skill slot with the
  released 1.72.0 (`1.72.0 (87b7bfc)`), created new `agent-setup.*` sources and removed the original
  DALO source; the candidate copy was no longer in the slot (`host-fault-dalo-reorg.json`). The
  fault was detected at 12:54:09, when a scheduled tick of `O` (window 1) loaded the released
  contract. Window 1 is valid until 12:47:50 UTC, the modification time of the slot link. The
  coordinator deleted the two remaining schedules through the API at 12:55:10 (listing empty), and
  closed the window at 13:30 UTC (restore steps 13:29:39–13:29:44): it removed the owned configuration after the hash matched, sent
  one guarded SIGTERM to the app-server at 13:29:44 (old process absent) and left the slot as DALO
  wrote it, because the original source no longer existed and the planned link restore was
  impossible. `dalo status --check` therefore differs from the pre-install capture because of the
  reorganization (`window-1/dalo-post.json`, `window-close.json`). No end-of-window integrity check
  of the candidate tree exists for window 1; the fault ended its validity instead.
- **Window 2.** Baseline captured at 13:31:39 against the reorganized DALO source (185 entries);
  the owner extended the hold to about 19:45 UTC. At 17:50:38 the manifest comparison was equal,
  `diff -r` against the build was empty, the three installed focus-file digests matched the table
  and the configuration hash matched (`candidate-end-integrity.json`). The restore put the slot
  link back to the window 2 baseline with all 185 entries equal, removed the owned configuration
  after the hash matched, sent a guarded SIGTERM at 17:51:13 (old process absent), and
  `dalo status --check` equalled the pre-install capture in the same environment
  (`CLAUDE_CONFIG_DIR` unset in both; `dalo-preinstall.json` and `dalo-post.json` have the same
  digest).
- **Window 3.** A short window for the rendering and trusted-context observations of F1. Baseline
  captured at 19:36:25 (185 entries). At 19:47:36 the manifest comparison was equal, `diff -r` was
  empty and the configuration hash matched. The restore returned the slot link to the window 3
  baseline and removed the configuration after the hash matched; a guarded SIGTERM followed at
  19:47:37 (old process absent), and `dalo status --check` equalled the pre-install capture. No
  schedule was created in window 3.
- **No schedule remains.** Window 1: the two remaining schedules were deleted by the coordinator
  through the API, and the listing was empty (API). Window 2: the last schedule was deleted through
  the API at 17:46, and the listing was empty at close (API). Window 3: none created. All window
  threads were archived. The T3 UI was not separately checked for the final empty state; the API
  listing is the evidence, as accepted by the owner.
- **Develop.** After D, `origin/develop` advanced (`ccf2d3a8` at window 1's close, `c9793539` at
  window 2's close) without changing any focus source since `fe0624d4`; the window 1 note records
  only non-focus `build.mjs` budget rows.

**Evidence files.** The raw evidence stays in a private evidence root under the main checkout's
ignored `.effective-flow/` directory (pseudonym registers, unsanitized observer excerpts, T3 UI
captures, `orchestrator_capabilities` results; the Codex session records are read in place, not
copied). The table lists the cited subset of the frozen files by SHA-256, paths relative to the
root: the item excerpts and scans cited above, the step 0 and step 2 logs, the install and restore
state of each window and the scripts that made the scans. The root's `FROZEN-manifest.json`
(SHA-256 `9a902d81282a9ec5b67a2984a92d0c1d0ca73fa5716cf04b6244b853b6ca45c5`) lists all 168 frozen
files, so the full set is verifiable against it.

| Evidence file                                                   | SHA-256                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `candidate-024bcb2a/calibration-85728d95-window-1.log`          | `3746cc1effdd4f0e1f6a12843d6d32b79dd87a96d47e86d89cf03d59a47cb374` |
| `candidate-024bcb2a/calibration-result.json`                    | `c312f8ebacfb0541974d76c75397f01f180b4d6be89c8e31efac022ef62ecbf1` |
| `candidate-024bcb2a/candidate-digests.json`                     | `ceddacbd0f416c49ff42a11e88a8c7c4f2dfbb36c192c92d28830840370dcfae` |
| `candidate-024bcb2a/clean-run.sh`                               | `97b35c525a7bc3072a807a44c301d8ba49440694692d409032ad676774b9727e` |
| `candidate-024bcb2a/evidence-completion.json`                   | `7619cfa97e12cb592025e007fc121044e89b762231cbdab6fc23264969072c0e` |
| `candidate-024bcb2a/extract.py`                                 | `59d7828d566d8b1d046fc77738bac96b397f4589016ed7d028cd17cf019b719f` |
| `candidate-024bcb2a/f16.py`                                     | `a37d864fc192c300f20172c5ef7ec130a5d22e36d5df9216b20eedb7e121e850` |
| `candidate-024bcb2a/followup-issue-ref.json`                    | `993540859b37d7abd11c2a4db675d693025381611e3b7d53536a4233cfa42455` |
| `candidate-024bcb2a/followup-issue.md`                          | `47a72f0ff4fed604cb1d707ec59abe57760129c1c5bc26366abad90882782229` |
| `candidate-024bcb2a/last.py`                                    | `f0bbfb9beb060e59a9a9d31d9fa9ba916983584c5a464211d259d71fdca5287d` |
| `candidate-024bcb2a/ops.py`                                     | `54a1d54e6d84e2b64777b4a7bb24ffe28632c8c970ae8a1d55fc509d9f001302` |
| `candidate-024bcb2a/publication-scan-followup-issue.json`       | `b15e31501fedbc4fd467c3e140d3162f5f0864f6d5c9f6e236dda94c66accdc9` |
| `candidate-024bcb2a/qualified-config.toml`                      | `c19e3da30e7256403e4a88881745026311c5127c3e35051cc656cff813680f42` |
| `candidate-024bcb2a/register-w3.json`                           | `dd5389642be687db913ab952bc3ae83f667e6069ae5d5df5c6dbe7959544442d` |
| `candidate-024bcb2a/register.json`                              | `d4dc2e572b5fc1fe8381a5f5dec9c8be5d50192ea5002687a3113078db24db6a` |
| `candidate-024bcb2a/report-completeness.json`                   | `a8551d62126656b0889d5bc1564f239f8e605cef9de2c8dc78b276f9e4744e4c` |
| `candidate-024bcb2a/scan-sched-O-f14stop.json`                  | `93118e5b928bc4540f68d9b1504a239dffcae2943eac157ba401ed384f0facc5` |
| `candidate-024bcb2a/scan-sched-O-f5.json`                       | `28ba9ad400c191edfd00a8ce28130a76df0846d1e96ab444ae5d7f0251ecd7b1` |
| `candidate-024bcb2a/scan-sched-O-f8.json`                       | `4a3c17b503d9628450599bcdc791a3afdeebace6c86905693dda3acfb1ae0c99` |
| `candidate-024bcb2a/scan-sched-O2-compact.json`                 | `d013bafd613c5dba4f50e5588ea05c558e4e18611d2b461a04d06d5677401248` |
| `candidate-024bcb2a/scan-sched-O2b-compact.json`                | `ebed483f411f6802105089f7c57f029dc56bb1b0e1ec5dc4bec2eae356355e65` |
| `candidate-024bcb2a/scan-sched-O4-f6.json`                      | `8b8366e175e147ee16f8b559cf5e87110dba20e0ca020e705c3bac3bfb09743f` |
| `candidate-024bcb2a/scan.py`                                    | `d9d57c60ca0998f60671f4a97532863f84a5849e0c364c0cda476d09b5bbceb0` |
| `candidate-024bcb2a/scan_sched.py`                              | `a2a441d038a9da3c42d8fcc41f238b0663dcee20563e01add527ab4cfe4df5a5` |
| `candidate-024bcb2a/scanall.sh`                                 | `760b1e71cce33069f36f289c76d5c5fe347e3a318c3909a4786be46cc25bd260` |
| `candidate-024bcb2a/slotguard.sh`                               | `1e6e77aa799ad35baa106dfa2646e8f85a976bd6dcbff0277bc1dd2380268866` |
| `candidate-024bcb2a/step0-agent-check.log`                      | `eb7f73267973aa9a911d47cd3f8d22874b33b707b14b4baa804e4bdfffd10cff` |
| `candidate-024bcb2a/step0-build.log`                            | `92ef53479b6cb1a6616a698905dda0eff5ddf7c1c6ad7d4bfe9a294bffbdfbd4` |
| `candidate-024bcb2a/step0-distribution.log`                     | `b475bc2fa99aac61b05e1b3a1b7255e7345fb0f7b63d3df134a7a29949d31c81` |
| `candidate-024bcb2a/step0-eval-build-context.log`               | `fd105460a9d23dba927ae1e17b399fe398f720edf47601605a2cfafbef5e9bd5` |
| `candidate-024bcb2a/step0-eval-focus.log`                       | `84550ca72a1b8af72d0b179eaaf173785769b7eda40f8bfd1eca375612bf3938` |
| `candidate-024bcb2a/step0-eval-iterate.log`                     | `77772f6c78e0596ea90d9aec62190cfa083bf7ac0fe4cd4f4a29ed3a43a151ce` |
| `candidate-024bcb2a/step0-eval-merge-gate.log`                  | `7a5da1467b69a483b440df8d7d5f650360ce8cdca7a2e59e64175eca5c900363` |
| `candidate-024bcb2a/step0-eval-next-steps.log`                  | `f9877c820d5e8f21a93eab54a4d756929e677697a4d50e6d74ad630c19e1a08c` |
| `candidate-024bcb2a/step0-focus-contracts.log`                  | `2f5c3f23e2b4dd00bf3d22a62869e764e628ebbbd19b2d80b0e75de9dd446dda` |
| `candidate-024bcb2a/step0-focus-eval.log`                       | `9901cccd37e9cf542f0ef4d903ca41e2d41a517fbe987a5a2724b60760614f97` |
| `candidate-024bcb2a/step0-result.json`                          | `ecb1f4c175a3d92ab352ce3f2092a62e72212da56a796410787ddaf9bcfdd44b` |
| `candidate-024bcb2a/step0-source-delta.txt`                     | `fa0511835b0f2f72ebab74cf67ccde90c3529847d87f9290e05cb55e8c69b26f` |
| `candidate-024bcb2a/step2-agent-check.log`                      | `f95889fedf7360b64e26c059ee65999128ee5ca3300f3b813a40a0de44ffe98c` |
| `candidate-024bcb2a/step2-build-clean.log`                      | `bf5f08f12c2640830ec348aa8c09e5d12985e7f7bbed2186bea787f08b7ce0df` |
| `candidate-024bcb2a/step2-build.log`                            | `7ac78d494ccce766ade1d835a3a5951abbd3f7447066c9a2c703bc1722c66d1b` |
| `candidate-024bcb2a/step2-digest-guard.log`                     | `b3f70793274bbedf564c142ec9d79508590cbe89719bdef12fb6b8ed2908c496` |
| `candidate-024bcb2a/step2-focus-contracts.log`                  | `12b9403bd461217c7b61b4c8617c1fd735453e2a7dc0799f3decd5acd806651a` |
| `candidate-024bcb2a/watch.py`                                   | `5e92a0b08136d38ec30b28d9547b4b8780bd310951ef5d1308456738e2563702` |
| `candidate-024bcb2a/window-1/F1-ancestor-refusal.json`          | `d8bd367d2da9eba7429e2d98ceabbeffce18bb8a92dbeae593e9268caf65eb9f` |
| `candidate-024bcb2a/window-1/F1-snapshots-refusals.json`        | `b7817b47c0af8b21f549e9cfe36ac825fc626a97eaaed1ceca83ec4be909957a` |
| `candidate-024bcb2a/window-1/F10-queue-0948.json`               | `02cff0c12aa95c748e58d42e77409889f524f3fe343baffa595714510f481f75` |
| `candidate-024bcb2a/window-1/F11-notification-run.json`         | `0b0d4eff52c4615cce2a77c651c56f57353daa6ef1e557e6ce673672c23536fb` |
| `candidate-024bcb2a/window-1/F13-tick-prompts.json`             | `a04a1014f4bd58ae843786a263350e8da9cc9b12af7adb852ee94ae7133fab97` |
| `candidate-024bcb2a/window-1/F14-stop-resume.json`              | `7b92042f4c29866673caa4a2be41d4b82ad614da72d3d164cdcbd3d33c974cb4` |
| `candidate-024bcb2a/window-1/F15-attempt-1.json`                | `b2e2c82785367b50787b43c99e9662d0fee4d4a6e21c1f8e67cf677205c5fb85` |
| `candidate-024bcb2a/window-1/F15-attempt-2.json`                | `414097f4b86436ec3bba4620993aa513b3a8031c766e96ac3a18bc471b58c596` |
| `candidate-024bcb2a/window-1/F15-attempt-3.json`                | `cd6bdfddcacc041a9b21fde8b747a1641503d7caeb222ce955c095eface68dc5` |
| `candidate-024bcb2a/window-1/F15-attempt-4.json`                | `7de48ffa623fd949885b9f425929d8fcf1909d22f080710e46de6969acb9dac3` |
| `candidate-024bcb2a/window-1/F15-attempt-5.json`                | `5a0c6993a05d25d23097bb58f040a628b35273cf05626d2d2b4f4fbd94a8e64a` |
| `candidate-024bcb2a/window-1/F16-growth.jsonl`                  | `7ccaeb6dfd0a98af6e7e717c536bc97392e96bfc404e0d409a630b657c0beb4d` |
| `candidate-024bcb2a/window-1/F2-idle-and-quiet.json`            | `c5ac7cf5ce08b1043f54b490c6468f161c69778ac17c2b226b2be6b45f569b1d` |
| `candidate-024bcb2a/window-1/F3-attempt-1.json`                 | `ef63b3645ad7ccf263ef1d57b2a186cddf64ed607e6127a6f36ce4981e2c0d12` |
| `candidate-024bcb2a/window-1/F3-attempt-2.json`                 | `9dfb1214afb760645ad6d85d463773769d95f3c84a785e41db3ef28af94b196c` |
| `candidate-024bcb2a/window-1/F4-long-wait.json`                 | `a4795cd9a86c3f8ed38ca38318c9e99a55b823e3d736a1ec1400828e5a4cdbf7` |
| `candidate-024bcb2a/window-1/F4-target-activity.json`           | `3fcc6724c1dbebcdc102cb49ce98c11b97f76cfc0f6a3a1d6014f30664245d56` |
| `candidate-024bcb2a/window-1/F5-completion.json`                | `e0d93e49d2713560e38300414cba623088f701b7b13cd10aff589c87b8dfc405` |
| `candidate-024bcb2a/window-1/F6-lost-access.json`               | `de3215eee7be4bb68d14d91edba871f290245fa012b976d6dfb33270b608357b` |
| `candidate-024bcb2a/window-1/F7-invalid-checkpoint.json`        | `8d30c555de9e6a521eb00e7a821867f4297126406bcc9a37510b5caa896f7eae` |
| `candidate-024bcb2a/window-1/F9-queue-1012.json`                | `726d8a8645a9816b3527189db94e946ee0728f009b2f4ebe7f59c223232a4260` |
| `candidate-024bcb2a/window-1/F9-runs.json`                      | `c03feb8ae7d484fd8f4a6bf8431546e1a000f8b1a2d5c00635b69a3db637ffb1` |
| `candidate-024bcb2a/window-1/O4-offer-ruling.json`              | `175a84bde964bb52b87d401982575d31e61eaaabbc222f303a448c8b63754a9f` |
| `candidate-024bcb2a/window-1/O4-offer-verbatim.txt`             | `9aa5b158c58f2290ff9574c04c1d21b9e9f50f249cb70dc864828791a2d698a2` |
| `candidate-024bcb2a/window-1/app-server-after-install.json`     | `5936f6507a9e2ec3152458ddcdad9044b076869a3229011b0ca82e5f22baf855` |
| `candidate-024bcb2a/window-1/baseline.json`                     | `161f1e43f31c676d42222bcfcf045340e540e857cf50fdf72485932ffcd5ba98` |
| `candidate-024bcb2a/window-1/candidate-manifest.json`           | `e051028bae95be20ac36530397a8a0ed059df7f3537717628151a8f67c32b8e6` |
| `candidate-024bcb2a/window-1/config-ownership.json`             | `9d16ff24ec8cc1254d34cd5c8669e584ac68ac8c40d3bf522c8347a6251baa5e` |
| `candidate-024bcb2a/window-1/dalo-post.json`                    | `1afe38b548b5bdd2f960f0c607f1b42b6dd2b664d330f518fd996a112e653d32` |
| `candidate-024bcb2a/window-1/dalo-preinstall.json`              | `5a95cb8868fffd47d5af27e0f97440b11d3eece613c260e8af4effe201588425` |
| `candidate-024bcb2a/window-1/host-fault-dalo-reorg.json`        | `3aed7efa2a956af4762c1e66bb16a981a802ae300208a30af644a88152daab9e` |
| `candidate-024bcb2a/window-1/install-state.json`                | `4017e27d27e57f535b24f454accb3c8760b008056289b4c8b4afba234be910fd` |
| `candidate-024bcb2a/window-1/register-window-1.json`            | `4cac4904f5dd6168e97b5a5930f253f48bd64c65b7127540a113a045aa62c197` |
| `candidate-024bcb2a/window-1/restart-install.json`              | `4a5b1a770a4760e86bffdb78c61c2191ccdfd95ee89b0275128bfb4cfbe8990f` |
| `candidate-024bcb2a/window-1/restart-restore.json`              | `b041e3857f161fe208b4430d7d3fa881e2347487b8f954a7e9fb385aabf2ad7b` |
| `candidate-024bcb2a/window-1/restore-state.json`                | `3ecfdd0e7a5de5dfd204b8d63624ead09eb4c4fdba401c2665554a3371e0d19e` |
| `candidate-024bcb2a/window-1/scan-sched-w1-O-valid.json`        | `1769e8e694321fb9eab07d2ab0cad2c1b0ca5a0c0fccd6201392db1ecc9da321` |
| `candidate-024bcb2a/window-1/scan-sched-w1-O2-valid.json`       | `22b49e6a3f47df853cddba334d71db39144f64c09886b1027b32779016064e82` |
| `candidate-024bcb2a/window-1/scan-sched-w1-O3.json`             | `9cecdce8773e9b0ef1465349150e1526ed3d66e55187464b4364ecfcb69ae893` |
| `candidate-024bcb2a/window-1/scan-sched-w1-O4.json`             | `8b8366e175e147ee16f8b559cf5e87110dba20e0ca020e705c3bac3bfb09743f` |
| `candidate-024bcb2a/window-1/scan-w1-O-valid.json`              | `568236bb32ef338d873260162ec81468be604044b18edb8df368ac24bd08cbcd` |
| `candidate-024bcb2a/window-1/scan-w1-O2-valid.json`             | `11cf59f3edc9dd3ba7ad96fdd21e9acdd8a75d79cfad0244307b2fef1c9aa346` |
| `candidate-024bcb2a/window-1/scan-w1-O3.json`                   | `a80279ea549d8a9d6648cf00c21faa5b8d00ac6f00c70072c12c0b7be011d05e` |
| `candidate-024bcb2a/window-1/scan-w1-O4.json`                   | `4b9b4026571934b5b1796945cf89d7666d7b9e853cd6d908759027f910637694` |
| `candidate-024bcb2a/window-1/scan-w1-P-child.json`              | `a6450c0da9da34f426b17938855f01705cf170d208f739893599da853ffabf70` |
| `candidate-024bcb2a/window-1/watch.log`                         | `403ed0e19e77733df5e99c259656f7c37cfd65692fff7fa3fac916c5948534cf` |
| `candidate-024bcb2a/window-1/window-close.json`                 | `ea63eb7625e7750bfb8d37d5010963a4bb26f5713d84778ca54d1bcf23dc33f3` |
| `candidate-024bcb2a/window-2/F12-compaction-1.json`             | `65222b185affcbe87057118a2215ca1bfcb238f2a48f9c9ab960089fac5759a1` |
| `candidate-024bcb2a/window-2/F12-compaction-2.json`             | `84f601809e73bb48d9a84489b5c1de0ba4081b4f414c96324a4b46f75df580d4` |
| `candidate-024bcb2a/window-2/F15-attempt-1.json`                | `087c3d916d926a09764279c34889a820b19bb72d9a802398811159cbd8cb3860` |
| `candidate-024bcb2a/window-2/F15-early-send.json`               | `aef56a19f8f744cb5ca9d4fd7cb01d50afe0edf865e46bd5e988599c1a558e50` |
| `candidate-024bcb2a/window-2/F16-growth.jsonl`                  | `b21c7e24d7cdf996065bc7cb2b5448efcb3d0de3bc5a38a14fab48d89329eaff` |
| `candidate-024bcb2a/window-2/F3-attempt-3.json`                 | `0ab81c3de6b051fa7652cdaa74db35d5697d713cd3d5888029f7fdb207846647` |
| `candidate-024bcb2a/window-2/F3-limitation.json`                | `4ee3eedfaefdcda442e02fae8ec8466a946f864ca52776e0fea7058ce8747c47` |
| `candidate-024bcb2a/window-2/F8-failed-deletion.json`           | `8559c23e9abfe35967231b5a1c5930979e8f064ef845dc5243adc06a5485f578` |
| `candidate-024bcb2a/window-2/F8-ui-delete.json`                 | `f7b14cfe9c654618cfca982a7cdbc10796deb063730fdff6e5410863786846e9` |
| `candidate-024bcb2a/window-2/app-server-after-install.json`     | `cd0e1eec708a6a61c3108677665bd46ee3bf7897c3c5c1a1ab73bd09ee2e1672` |
| `candidate-024bcb2a/window-2/baseline.json`                     | `4c7996718db1f48f9e47bdd58f33238bcba2fd15bf52a46ce47875f3824d26e0` |
| `candidate-024bcb2a/window-2/candidate-end-integrity.json`      | `c3753ac416732251e396bdad40f3eb14acef73085983136a584e32d3df1bc4aa` |
| `candidate-024bcb2a/window-2/candidate-manifest.json`           | `e051028bae95be20ac36530397a8a0ed059df7f3537717628151a8f67c32b8e6` |
| `candidate-024bcb2a/window-2/codex-AGENTS.md-1340`              | `70fc0d66d50f30526e3c07aff1d1d0e49abc74c8eec47e83f0fd38a804fd59a6` |
| `candidate-024bcb2a/window-2/config-ownership.json`             | `9d16ff24ec8cc1254d34cd5c8669e584ac68ac8c40d3bf522c8347a6251baa5e` |
| `candidate-024bcb2a/window-2/dalo-post.json`                    | `1afe38b548b5bdd2f960f0c607f1b42b6dd2b664d330f518fd996a112e653d32` |
| `candidate-024bcb2a/window-2/dalo-preinstall.json`              | `1afe38b548b5bdd2f960f0c607f1b42b6dd2b664d330f518fd996a112e653d32` |
| `candidate-024bcb2a/window-2/hold-extension.json`               | `9fb334412aaea4fe000f14dfa350277b7b4100e546a4da323f2b600cb5a1b684` |
| `candidate-024bcb2a/window-2/host-change-agents-md.json`        | `f531a572cf4ae9e077a5807cc5d115d1ecbe11ae7efc16483f2268d192b4e46e` |
| `candidate-024bcb2a/window-2/install-state.json`                | `181316ceddaa5075693cf51d7ecab5c1edeb7d806e2fafce4fca9886d606b8b2` |
| `candidate-024bcb2a/window-2/restart-install.json`              | `197d034437be2862ba31bf2cfa22d51499ebe14f3be8dac7dcb343bd933b745e` |
| `candidate-024bcb2a/window-2/restart-restore.json`              | `e4f6b2dbb0cf7a2c548ccd5856b48eddf8217f2f2cffb60ab781df2c949e5a77` |
| `candidate-024bcb2a/window-2/restore-state.json`                | `0948bbf01767691aec842b5a15614a660b5112c9cd38dc042289aea795d66c34` |
| `candidate-024bcb2a/window-2/scan-sched-w2-O.json`              | `698e7bc7a391a56dda4cdcf9f488ee9bd0ec79f0760263cfaaa8830272bb325e` |
| `candidate-024bcb2a/window-2/scan-sched-w2-O2.json`             | `d013bafd613c5dba4f50e5588ea05c558e4e18611d2b461a04d06d5677401248` |
| `candidate-024bcb2a/window-2/scan-sched-w2-O2b.json`            | `837828fe4e0793e1d346ab4e146371181e209ca574662341175bf1c930d28a9b` |
| `candidate-024bcb2a/window-2/scan-w2-O.json`                    | `de5c04de2d8f633cef1a8920d9bd5d39e3a8844e2f279a121ec97b5c5155536c` |
| `candidate-024bcb2a/window-2/scan-w2-O2.json`                   | `be23e8bacb1fcc79d1fba4838a10679d0f7e0444cb29b1d315d6f5387a068f4d` |
| `candidate-024bcb2a/window-2/scan-w2-O2b.json`                  | `1fc5e158516fd3d1f62c72b5bc0fbacd11c1ef66e9afff9465c2b1bf74f0e00e` |
| `candidate-024bcb2a/window-2/ui/F8-schedules-after-delete.png`  | `e2da895ff1ea53903654c262af9b0201cb8368ee3fae72fa742150e344546cb2` |
| `candidate-024bcb2a/window-2/ui/F8-schedules-before-delete.png` | `4793795a13c263855cb0dd4a2f4cc58666b748de379486a743e54b7c48593b11` |
| `candidate-024bcb2a/window-2/watch.log`                         | `a3d34b008f7062f4a1eab422b9275e3c05655a6e8ef8a4a59cae05bf8bf2eddc` |
| `candidate-024bcb2a/window-2/window-close.json`                 | `b84d34aed90fe922fbc2f28ae1a72c93d1a4183c847d64fb224f27423321d164` |
| `candidate-024bcb2a/window-3/F1-ui-and-context.json`            | `dda7cad3ce5d6b0c5a23805aabb25828a99b910a9ab31464a787e215d948943f` |
| `candidate-024bcb2a/window-3/O-host-context.json`               | `90b667c11339af03a43d9b96e82631e063021b3df73013d9a3b32b086f88fbb4` |
| `candidate-024bcb2a/window-3/app-server-after-install.json`     | `948a8771e317ed280b7d588679f7011f217f200803004ae984a52011bd44aef9` |
| `candidate-024bcb2a/window-3/baseline.json`                     | `e40bdcd876ffbc74516dcc8d59efc4887e31aca035c615bd4be1f68cddeb754b` |
| `candidate-024bcb2a/window-3/candidate-end-integrity.json`      | `5ba707da05d2466653da27c6592c794f62c27523afb0e1401d7d27e94337194a` |
| `candidate-024bcb2a/window-3/candidate-manifest.json`           | `e051028bae95be20ac36530397a8a0ed059df7f3537717628151a8f67c32b8e6` |
| `candidate-024bcb2a/window-3/config-ownership.json`             | `9d16ff24ec8cc1254d34cd5c8669e584ac68ac8c40d3bf522c8347a6251baa5e` |
| `candidate-024bcb2a/window-3/dalo-post.json`                    | `1afe38b548b5bdd2f960f0c607f1b42b6dd2b664d330f518fd996a112e653d32` |
| `candidate-024bcb2a/window-3/dalo-preinstall.json`              | `1afe38b548b5bdd2f960f0c607f1b42b6dd2b664d330f518fd996a112e653d32` |
| `candidate-024bcb2a/window-3/install-state.json`                | `5e98c9514f6ee00625b298397a32c3605772f6c51859288d08961c798afdb0f8` |
| `candidate-024bcb2a/window-3/restart-install.json`              | `c65ccd5729bbc13eadfd135ce4dda823728c7f3f09abcbb49b392e5c03de40eb` |
| `candidate-024bcb2a/window-3/restart-restore.json`              | `c3a9d6f5f00fb9dd5e102f7f067ebe5097a1049dafd09004cee9513802919b19` |
| `candidate-024bcb2a/window-3/restore-state.json`                | `9be73215fc2fdd2add722ccf8209e1dc98e9a116a683df213144e815d89a317b` |
| `candidate-024bcb2a/window-3/scan-w3-O.json`                    | `728834dcb336e968fc6c484f7be89f347fe2b24345d23204c1c5054b5ca24bf5` |
| `candidate-024bcb2a/window-3/ui/F1-ui-id-rendering.png`         | `d17eb06384e24e077301ad4677d0d24c24d2a90447a7c5af0292819a63e0ec0b` |
| `candidate-024bcb2a/window-3/window-close.json`                 | `f338946223e5255d9cf8a788e2c0a344be32580f242820f08cec8d75c3cec00d` |

#### 024bcb2a: F1

Snapshot requalification with the offer, the re-offer after a decline, both refusals and the UI
rendering of the target ID.

- **Setup:** observer `O` (window 1) in default mode; target `T` (window 1) idle after stage 1, with
  its opening request at position 0 and its answer at position 2. Parent `P` (window 1) and a child
  task of it for the ancestor refusal.
- **Trigger:** `$effective-flow focus <T (window 1)>` at 09:06:34 UTC (coordinator turn). After the
  first verdict the coordinator answered "no follow-up" (09:08:22). Self refusal: `$effective-flow
focus <O (window 1)>` at 09:08:41. Ancestor refusal: `$effective-flow focus <P (window 1)>` at
  09:08:55, as the task of the child of `P` (documented exception: the child exists only through
  `P`'s delegated task, so that task is the deciding turn). Second snapshot of `T` at 09:10:06, with
  `T` idle. Opt-in "5 minutes." as the very next turn at 09:11:22.
- **Expected:** `src/tools/focus.md` "Snapshot verdict" (identity, coverage and budget, evidence,
  one verdict, analysis-leaf use, send state "Not attempted") and `src/shared/focus-follow-up.md`
  "Offer" (the eager offer condition, the intervals and the disclosures). "No follow-up"
  creates no schedule and, under `src/tools/focus.md` "Follow-up mode", does not suppress the offer
  of a later snapshot that meets the condition. Self and ancestor refusal under
  `src/shared/focus-session-contract.md` "Authority before any host access" without history reads
  or a verdict.
- **Observed, first snapshot (09:08:03):** "**On track** — `<T (window 1)>`." with the goal anchor
  (opening request, position 0, three-part note; answer at position 2 supplying Scope, Evidence and
  Delivery and awaiting stage 2), coverage "three native reads, one history page, positions 0 and
  2; no truncation", conservative charge 15,512/64,000, tool activity not inspected, `effective-
delivery` guidance and one completed analysis leaf (`gpt-5.6-luna`, medium; compliance
  unverified), "Message outcome: Not attempted — correction delivery is disabled", and the offer:
  5, 15, 30 or 60 minutes or no follow-up; each tick posts visibly; the schedule persists until
  deleted with a cap of 24 hours or 48 ticks; a dedicated observer thread is recommended; stop with
  `$effective-flow focus follow-up stop <T (window 1)>`. The report-only disclosure ("Each tick
  posts visibly here and only reports") is present. The identity appears as the bare ID in inline
  code. The text carries no redaction statement. It names the analysis leaf as completed without
  quoting its verdict. The window 3 snapshot states it ("Eine abgeschlossene Analyse-Delegation
  bestätigt das Urteil", "a completed analysis delegation confirms the verdict", On track;
  `window-3/ui/F1-ui-id-rendering.png`).
- **Observed, "no follow-up":** "No follow-up scheduled." No `schedule_task` call preceded the
  opt-in at 09:11: the Codex record of `O` (window 1) holds three schedule creations in total,
  matching the three opt-ins at 09:11, 10:31 and 10:41.
- **Observed, self refusal (09:08:51):** "Focus cannot inspect `<O (window 1)>`: it is this observer
  session, which the focus contract excludes. No new history read, analysis, or message dispatch
  was attempted."
- **Observed, ancestor refusal (09:09:28), child of `P` (window 1):** "Cannot inspect `<P (window
1)>`: trusted T3 metadata identifies it as this observer's parent/orchestrator. The focus
  contract prohibits reviewing an ancestor. No target history was read; no trajectory verdict
  issued. Admission used one native read, reserving 256 characters as a conservative upper bound.
  Message outcome: Not attempted — ancestor targets are refused."
- **Observed, second snapshot (09:10:51), the re-offer check (the regression of the failed entry `486aa2fc`):** "**On track** — `<T (window 1)>`.
  Unchanged since the previous snapshot." It served a history page, carried the same verdict
  fields and a new, complete offer (intervals, visible ticks, persistence, cap, dedicated observer,
  report-only, stop command), and the opt-in at 09:11:22 created the loop of F13 and F2 (first
  checkpoint 09:11:48, `ticks=0`, `state=active`). Its read ledger, as the observer reported it,
  follows.

| Call | Native selection                                          | Charged upper bound | Result                                                  |
| ---- | --------------------------------------------------------- | ------------------: | ------------------------------------------------------- |
| 1–2  | Admission reads: ancestry and target state (not itemized) |                 512 | Admitted; incidental content discarded.                 |
| 3    | One history page of the target (limits not itemized)      |              15,000 | Positions 0–2; no truncation, no further message pages. |

Total: 3/16 native reads, 1/4 history pages, 15,512/64,000 charged characters, as the observer
reported them. The split between the first two rows and the third is derived from that total; the
per-call selections are not itemized in the evidence root. The first snapshot reported the same
total.

- **UI rendering (window 3):** `O` (window 3) took one snapshot of `T` (window 3) at 19:39:12
  (coordinator turn). The owner checked the authenticated T3 UI: the target ID renders as inline
  code and is not clickable (UI; capture `window-3/ui/F1-ui-id-rendering.png`). The user-guide
  sentence that focus names sessions in inline code, plain text rather than a clickable host
  thread link, matches this observation, and no scan recorded a well-formed link, so the sentence
  needs no correction.
- **Schedule state:** the decline created none (shown by the creation count above; the T3 UI
  listing at that moment was not captured). The opt-in created one, active in the T3 scheduled-task
  listing of the later items.
- **Authorship:** coordinator turns throughout; the ancestor refusal's deciding turn was the task
  of the child of `P` (window 1); the window 3 rendering check was the owner's.
- **Window and result:** windows 1 and 3. **Pass.**

#### 024bcb2a: F2

- **Setup:** the loop of F1's opt-in, `H1`, on `T` (window 1), which had gone idle after stage 1.
  Interval 5 minutes.
- **Trigger:** the first scheduled tick (prompt 09:16:49) and the next one (09:21:49), both sent
  by the scheduler.
- **Expected:** `src/shared/focus-follow-up.md` "Judging and reporting", idle target: one report
  for a target with no active run, pending request, new events or completion evidence, then a
  quiet tick with only the checkpoint ("Quiet tick budget").
- **Observed:** the first tick (09:17:19): "`<T (window 1)>` is idle, with no active run, pending
  request, or new messages after position 2. Stage 2 awaits coordinator instruction; a decision to
  continue is needed. Overall completion is not established. Verdict remains **On track**. No
  message dispatch attempted; ticks are report-only." followed by the checkpoint ending `ticks=1`
  … `state=active`. The second tick (09:22:19) was exactly one message, the checkpoint line
  (`focus-follow-up v1 | target=<T (window 1)> | goal=opening@0 | verdict=On track | last=2 |
pattern=none | correction=none | mechanism=t3-schedule | interval=5 | handle=scheduled-task:<H1>
| started=2026-11-13T09:11:45.036Z | ticks=2 | backlog=no | lag=0 | state=active`), unchanged
  evidence, no prose.
- **Schedule state:** loop active; the ticks arrived on the 5-minute grid. A listing at that
  moment was not captured.
- **Authorship:** scheduler ticks; no coordinator turn between them.
- **Window and result:** window 1. **Pass.**

#### 024bcb2a: F3

Repetition, recorded as a limitation (owner decision, 2026-11-13).

- **Setup:** a target whose script repeats the same failing step across two tick windows, with a
  request that does not ask for the retry (a requested retry stays On track).
- **Trigger and observed**, three attempts, follow the table.

| Attempt | Window | Observer, target                | Arrangement                                                                                                                                       | Observer outcome                                                                                                                                                                                                                                                                                  | Valid provocation                              |
| ------- | ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1       | 1      | `O` (window 1), `T` (window 1)  | Rounds from 09:22 to about 09:49: the requested stage 2 command twice (09:22, 09:33) between "Continue stage2." nudges; `T` reran on its own once | Tick 3 (09:28:06) reported the newly actionable blocker once; ticks 4–8 were quiet, verdict On track, `pattern=none`, every checkpoint exact                                                                                                                                                      | No: the repetitions were coordinator-requested |
| 2       | 1      | `O` (window 1), `T2` (window 1) | One opening instruction, an explicit stage 2 check at about 10:4x, then "Continue stage2." at about 10:48 and 10:53                               | Tick 1 (10:47:40) reported the blocker once; ticks 2 (10:52:25) and 3 (10:57:32) were quiet, On track, no Looping                                                                                                                                                                                 | Yes                                            |
| 3       | 2      | `O` (window 2), `T2` (window 2) | One read-file instruction, then two "Continue stage2." nudges across tick windows                                                                 | Tick 1 (13:42) reported a new blocker ("**Neuer Blocker** in …", "new blocker in"); ticks 2 and 3 quiet; tick 4 (13:56) reported a changed blocker ("**Geänderter Blocker** in …", "changed blocker in") after new evidence; tick 5 (14:01) quiet with `verdict=Cannot judge` and `pattern=15,18` | Yes                                            |

- **Expected:** the tick reports Looping once, and the next tick on unchanged evidence does not
  repeat it (`src/shared/focus-follow-up.md` "Judging and reporting", `src/tools/focus.md`
  "Snapshot verdict").
- **Observed overall:** the target failed the same step three to six times across tick windows. The
  observer reported the blocker once (in window 2 also a changed blocker) and then stayed quiet on
  On track or Cannot judge, never Looping. The quiet ticks and the once-only reports were correct,
  with no repeated nudge; Looping was not reproducibly reported. Candidate `85728d95` produced
  Looping once under a similar arrangement.
- **Schedule state:** loops active throughout (API listings at the attempts' ends were not
  separately captured).
- **Authorship:** coordinator turns for the target requests; scheduler ticks.
- **Window and result:** windows 1 and 2. **Limitation (owner decision 2026-11-13)**, resting on
  attempts 2 and 3 (`window-1/F3-attempt-2.json`, `window-2/F3-attempt-3.json`,
  `window-2/F3-limitation.json`; attempt 1: `window-1/F3-attempt-1.json`).

#### 024bcb2a: F4

- **Setup:** the loop `H1` of F2 on `T` (window 1); at 09:54:56 the coordinator told the target to
  run `sleep 660 && echo verification-done` and then write a two-sentence Evidence section
  (`window-1/F4-target-activity.json`). The command produced no output until 10:06. The target
  posted a one-line waiting commentary about every 65 seconds (09:55–10:06), which advanced
  `last=`, and wrote the Evidence section at 10:06:11.
- **Trigger:** the scheduled ticks that fell inside the wait: ticks 8, 9 and 10 (09:53–10:03).
- **Expected:** `src/shared/focus-follow-up.md` "Judging and reporting": long test, CI or approval
  waits are no Looping or Stalled verdict; a quiet tick passes.
- **Observed:** ticks 8 (09:53:04), 9 (09:58:09) and 10 (10:03:09) posted only the checkpoint,
  `verdict=On track`, `pattern=none`, with `last=` advancing 33, 40, 44. Tick 11 (10:08:14) reported
  that `T` had delivered the requested synthetic Evidence section, awaited stage 3 (position 50)
  and needed a coordinator decision, with the coverage line (three native reads, one page,
  positions 45–50, 15,512/64,000) and a verdict that stayed On track, no correction. No Looping or
  Stalled report occurred.
- **Schedule state:** loop active, ticks on the grid (no separate listing).
- **Authorship:** scheduler ticks; coordinator target requests.
- **Window and result:** window 1. **Pass.**

#### 024bcb2a: F5

- **Setup:** loop `H2` on `T` (window 1), created by F14's resume (checkpoint at 10:31:16,
  `ticks=0`); the target at stage 2.
- **Trigger:** the coordinator sent the stage 3 request; the next scheduled tick at about 10:38.
- **Expected:** `src/shared/focus-follow-up.md` "End events": completion deletes exactly the
  prompt's handle (complete handle), then one final notice and `state=stopped`.
- **Observed:** the tick (10:38:28) reported that `T` completed the synthetic task and posted the
  final notice with `ticks=1` and `state=stopped`. Its `delete_scheduled_task` call (10:38:14) passed
  the complete handle, equal to the creation result, the prompt's `handle:` and the checkpoint's
  `handle=`, and completed.
- **Schedule state:** the handle was absent from `list_scheduled_tasks` at 10:38 (API).
- **Authorship:** coordinator stage 3 turn; scheduler tick.
- **Window and result:** window 1. **Pass.**

#### 024bcb2a: F6

- **Setup:** `O4` (window 1) in approval-required mode, loop `H3` on `T4` (window 1), 11 scheduled
  ticks done.
- **Trigger:** the owner deleted `T4` (window 1) in the T3 UI at 10:34:02; the deletion was
  confirmed by the read-only thread projection (`deleted_at`).
- **Expected:** `src/shared/focus-follow-up.md` "End events": lost access deletes the prompt's
  handle under the deletion safeguard, then one notice and `state=stopped`; no further fire.
- **Observed:** the tick (10:35:04) reported "Follow-up stopped: `<T4 (window 1)>` is no longer …"
  (excerpt) as lost access, with `ticks=12` and `state=stopped`. Its deletion (10:34:59) passed the
  complete handle and completed. In approval-required mode the owner answered the approval prompts;
  the prompt's argument view is not captured, and the delete-call scan shows the complete handle.
- **Schedule state:** the handle was absent from `list_scheduled_tasks` at 10:35 (API); no later
  fire arrived.
- **Authorship:** owner UI action (deletion of the target and approvals); scheduler tick.
- **Window and result:** window 1. **Pass.** The call of this item is one of the two long-context
  deletions on which the effect of the handle fix rests (see the limitations).

#### 024bcb2a: F7

- **Setup:** `O` (window 1) ran a loop `H4` on `T2` (window 1). `O3` (window 1) is a fresh
  observer without any valid checkpoint.
- **Trigger:** the coordinator sent `H4`'s tick prompt into `O3` (window 1) at about 10:58, and a
  second time shortly after.
- **Expected:** `src/shared/focus-follow-up.md` "Deletion safeguard and stopped ticks": the first
  tick stops before any host access, deletes nothing, posts one delete-in-T3 notice and writes a
  stopped line with `-` fields; a second tick posts the exact checkpoint with `ticks=2`, no repeated
  notice and no deletion.
- **Observed:** the first tick (10:58:29) stopped before host access with the one-time notice
  ("No valid checkpoint is available for …", excerpt), dash fields, `ticks=1`, `state=stopped`,
  deleting nothing. The second (10:59:14) was the checkpoint line only, `ticks=2`, no notice, no
  deletion. The scan found zero delete calls in `O3` (window 1) and both checkpoints with the
  exact ending.
- **Schedule state:** `H4` still active at 10:59 (API). The planned UI check and F8's UI deletion
  of that handle did not follow in window 1, because F8 was not started there; `H4` was deleted by
  the coordinator through the API at 12:55 after the fault.
- **Authorship:** coordinator turns (a typed tick prompt counts as a tick).
- **Window and result:** window 1. **Pass.**

#### 024bcb2a: F8

Failed deletion, with the schedule deleted in the T3 UI before the tick.

- **Setup:** `O` (window 2) ran a loop `H5` on `T2` (window 2). The qualified configuration ran
  together with the rewritten global instructions of window 2.
- **Trigger:** after the coordinator's request for `T2`'s completion, the owner deleted `H5` in
  the T3 UI at about 14:24:30, before any tick had observed the completion (the order the plan
  allows to remove timing pressure); then the coordinator typed `H5`'s tick prompt into `O`
  (window 2) at about 14:24:5x.
- **Expected:** `src/shared/focus-follow-up.md` "End events": the completion is reported, the
  actual delete error is surfaced, the final notice states that deletion is not confirmed, and the
  checkpoint ends `state=stopped`.
- **Observed:** the tick (14:26:13) opened "**Synthetische Aufgabe abgeschlossen – On track.**"
  ("Synthetic task completed – On track.", excerpt), reported the completion with the
  `task_not_found` result and the not-confirmed notice, and ended `ticks=10` … `state=stopped`.
  The delete call at 14:26:08 passed the complete handle, equal to the creation result, the
  prompt's handle and the checkpoint's, and failed with `task_not_found`: the only `task_not_found`
  of the record, provoked by the UI deletion.
- **Schedule state (UI):** the owner's two captures of the scheduled-task view show `H5` among the
  qualification schedules before the deletion and absent after it, while the window's other
  qualification schedule and the unrelated schedules of the host stay listed
  (`window-2/ui/F8-schedules-before-delete.png`, `window-2/ui/F8-schedules-after-delete.png`).
- **Authorship:** owner UI deletion; coordinator tick prompt.
- **Window and result:** window 2. **Pass.**

#### 024bcb2a: F9

- **Setup:** `O` (window 1), loop `H1` on `T` (window 1), 5-minute interval.
- **Trigger:** the coordinator started an operator turn (`sleep 265`) at 10:11:30 that ended at
  10:16:31, so that a fire fell inside it and the turn ended less than a minute before the next
  grid fire.
- **Expected:** `src/shared/focus-follow-up.md` "Overlap": one queued run after the busy turn,
  treating the developer turn as no input, and the next fire on the grid within a minute.
- **Observed:** the 10:12:05 fire queued behind the operator turn (`t3_queue list` at 10:12:43
  showed one queued tick prompt, API). The queued tick ran at 10:17:03 as a quiet tick
  (`ticks=12`) and answered no developer turn; the next fire followed at 10:17:39 (`ticks=13`),
  36 seconds later. No overlap.
- **Schedule state:** loop active; queue (API) as above.
- **Authorship:** coordinator operator turn; scheduler ticks.
- **Window and result:** window 1. **Pass.**

#### 024bcb2a: F10

Approval-required mode.

- **Setup:** `O4` (window 1) in approval-required mode, target `T4` (window 1), 5-minute interval.
  The owner answered the real approval prompts.
- **Offer ruling:** before the opt-in turn, the coordinator ruled the verbatim offer complete
  (`window-1/O4-offer-ruling.json`, `window-1/O4-offer-verbatim.txt`). It carried both approval
  elements, "This observer requires approvals for session reads, skill reads, and final schedule
  deletion; pending approvals hold later checks.", and all general disclosures.
- **Trigger:** the owner held the real approval of the first scheduled tick (fire 09:38:09) past the
  09:43 and 09:48 grid fires. The hold time was told in advance: not captured.
- **Expected:** `src/shared/focus-follow-up.md` "Overlap": one queued run per later fire, no
  overlap, and the exact checkpoint after approval.
- **Observed:** `t3_queue list` at 09:48:30 showed two queued tick prompts behind the held tick
  (API). Tick 1 posted at 09:49:25 (`ticks=1`, `state=active`); the queued fires ran one after
  another at 09:50:09 (`ticks=2`) and 09:50:55 (`ticks=3`), without overlap, each ending with the
  exact checkpoint.
- **Approval-mode ticks:** `O4` delivered 12 scheduled ticks, the first after the real approval:
  ticks 1–11 ended `state=active` (09:49:25, 09:50:09, 09:50:55, 09:55:30, 10:06:50, 10:09:51,
  10:13:31, 10:24:01, 10:24:57, 10:25:42, 10:31:02), and tick 12 ended `state=stopped` (F6). The
  scan found every checkpoint with a raw `target=` and the exact ending. The per-tick raw native
  output files are not part of the evidence root; the watch log and the per-message digests of
  `scan-w1-O4.json` are.
- **Schedule state:** queue (API) as above; loop active until F6.
- **Authorship:** owner approvals and hold; scheduler ticks.
- **Window and result:** window 1. **Pass.**

#### 024bcb2a: F11

- **Setup:** `O` (window 1), loop `H1` active.
- **Trigger:** the coordinator's operator turn started a child task in the background
  (`delegate_task`, a notifier that replies "pong") at about 10:27:5x.
- **Expected:** a finished background task produces a host notification run in the observer thread
  that is not treated as a tick (`src/shared/focus-follow-up.md` "Tick admission and allow-list").
- **Observed:** at 10:28:02 the host delivered a user-role notification, "Delegated task … [completed]:
  pong". The observer (10:28:07) answered with one sentence, "The delegated child completed and
  replied “pong.”", with no checkpoint, no host read and no tick treatment.
- **Schedule state:** loop active (no separate listing).
- **Authorship:** coordinator operator turn; host notification.
- **Window and result:** window 1. **Pass.**

#### 024bcb2a: F12

The cap loop, recorded as a limitation (owner decision, 2026-11-13): the cap of 48 ticks was not
reached on `024bcb2a`.

- **Setup:** a fresh observer `O2` per attempt, its first loop, 5-minute interval, a long-running
  target.
- **Expected:** `src/shared/focus-follow-up.md` "End events": the loop reaches the cap and the cap
  tick deletes the schedule with the complete handle, confirmed in the T3 UI; a compaction before
  the cap falls under "Deletion safeguard and stopped ticks".
- **Observed:** three loop ends, none at the cap, follow the table.

| Loop | Window | Observer         | Opt-in checkpoint | Completed ticks | End                                                                                                                                                                                                                                  |
| ---- | ------ | ---------------- | ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | 1      | `O2` (window 1)  | 09:08:31          | 43              | The external DALO fault at 12:47:50. Ticks 44 (12:49:43) and 45 (12:54:23) are invalid; the coordinator deleted the schedule through the API at 12:55:10.                                                                            |
| 2    | 2      | `O2` (window 2)  | 13:34:59          | 23              | Context compaction during the 15:30:03 fire: tick 23 checkpoint (15:31:20, `state=active`), then a stopped message with `ticks=24` (15:32:08). The schedule was deleted by focus.                                                    |
| 3    | 2      | `O2b` (window 2) | 15:45:46          | 21              | Compaction at the 22nd fire (17:36), after tick 21 at 17:31:45. No traceable checkpoint remained; nothing was deleted, one delete-in-T3 notice and a dash-field stopped line (`ticks=1`) followed. Later fires posted stopped ticks. |

- **Loop 1:** the watch log and `scan-w1-O2-valid.json` hold 44 valid checkpoints, ticks 0 to 43,
  every one with a raw `target=` and the exact ending.
- **Loop 2:** after the compaction no target read occurred. The deletion safeguard applied as
  `src/shared/focus-follow-up.md` requires: an earlier checkpoint named the handle, so the call
  passed the complete handle (15:31:55, completed). The first fire posted two checkpoints, tick 23
  active and then tick 24 stopped. The final message opened "Die Folgeprüfung ist beendet; der
  Zeitplan … wurde gelösch…" ("The follow-up check has ended; the schedule … was deleted",
  excerpt). With focus having deleted the schedule, there were no later fires to observe.
- **Loop 3:** the final message opened "Nach der Kontextkürzung fehlt ein gültig
  rückverfolgbarer Checkpoint. Die Beobachtung ist beendet; der Zeitpla…" ("After the context
  compaction, no validly traceable checkpoint is present. The observation has ended; the schedule
  …", excerpt). With no traceable checkpoint, the safeguard deleted nothing and told the developer
  once to delete the schedule in T3. The two later fires (17:41:14 and 17:46:15) posted
  checkpoint-only stopped ticks (`ticks=2`, `ticks=3`) with the exact ending and no repeated
  notice.
- **Schedule state (API):** loop 1: deleted by the coordinator, listing empty. Loop 2: deleted by
  focus (the call completed; a listing check is not captured). Loop 3: deleted by the coordinator at 17:46, listing empty.
  The T3 UI was not separately observed for these states.
- **Authorship:** coordinator opt-in turns; scheduler ticks; coordinator API deletions as stated.
- **Window and result:** windows 1 and 2. **Limitation (owner decision 2026-11-13).**
  Evidence: `window-2/F12-compaction-1.json`, `window-2/F12-compaction-2.json`,
  `window-1/watch.log`, `window-2/watch.log`.

#### 024bcb2a: F13

- **Setup:** the loop `H1` of F1 on `T` (window 1).
- **Trigger:** every scheduled tick of the loop.
- **Expected:** the scheduled turn loads the skill through the `$effective-flow` prefix, and the
  tick prompt carries the bare target ID, not a link (`src/shared/focus-follow-up.md`
  "Scheduling").
- **Observed:** each prompt had the form `$effective-flow focus follow-up tick <T (window 1)>
handle:scheduled-task:<H1>`, with the prefix, the bare ID and the complete handle, for example at
  09:16:49 and 09:21:49. `window-1/F13-tick-prompts.json` holds the 41 scheduled tick
  prompts before 12:47:50 UTC, all with the `$effective-flow` prefix, the bare target reference and
  the complete handle. Every scheduled tick of the loop loaded the skill through the prefix
  (`evidence-completion.json`), and every checkpoint kept the exact ending (`scan-w1-O-valid.json`).
- **Schedule state:** loop active.
- **Authorship:** scheduler prompts.
- **Window and result:** window 1. **Pass.**

#### 024bcb2a: F14

- **Setup:** `O` (window 1), loop `H1` on `T` (window 1), running since 09:11:45.
- **Trigger:** `follow-up stop` at about 10:28:4x, then an explicit resume at about 10:29:1x.
- **Expected:** `src/shared/focus-follow-up.md` "Stop and resume": the stop deletes the latest
  checkpoint's handle (complete handle) and emits `state=stopped`; the resume re-admits the target,
  shows a new offer, and a schedule with a new handle exists only after the opt-in.
- **Observed:** the stop deleted the schedule at 10:28:46 with the complete handle (completed) and
  posted "Focus follow-up stopped and the schedule was deleted." with a checkpoint at
  `ticks=15` and `state=stopped`. The resume (10:30:24) re-admitted `T`, took an On track snapshot and showed a new
  complete offer. After "5 minutes" the new schedule `H2` posted its first checkpoint at 10:31:16
  (`ticks=0`, `state=active`).
- **Schedule state:** `H1` absent from `list_scheduled_tasks` after the stop (API); `H2` active.
- **Authorship:** coordinator turns.
- **Window and result:** window 1. **Pass.**

#### 024bcb2a: F15

Early send of a queued tick through the T3 UI.

- **Setup:** an operator turn that keeps the observer busy (`sleep 300`) while a tick queues
  behind it, without a prohibition of focus actions.
- **Trigger:** the owner clicked the control T3 labels "Steer" on the queued scheduled run.
- **Expected:** `src/shared/focus-follow-up.md` "Overlap": a queued tick the developer sends early
  through the T3 UI is an ordinary tick.
- **Observed:** the attempts follow the table.

| Attempt | Window | Operator turn                                   | Queued tick                                        | Steer                                            | Outcome                                                                                  |
| ------- | ------ | ----------------------------------------------- | -------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1       | 1      | 10:21:00–10:26:17                               | behind it, 10:22:20 (API listing)                  | not clicked                                      | Not provoked                                                                             |
| 2       | 1      | 11:05:25–11:10:56                               | behind it, 11:06:49 (API listing)                  | not clicked                                      | Not provoked                                                                             |
| 3       | 1      | 11:15:25–11:20:42                               | behind it, 11:16:45 (API listing)                  | not clicked                                      | Not provoked                                                                             |
| 4       | 1      | 11:31:02–11:36:21, forbade focus actions        | prompt delivered as a steering message at 11:35:19 | owner clicked in the UI                          | No tick ran, no skill load, no checkpoint; not provoked (the turn forbade focus actions) |
| 5       | 1      | 11:41:07–11:46:23                               | behind it, 11:42:15 (API listing)                  | not clicked                                      | Not provoked                                                                             |
| 1       | 2      | 14:04:11–14:09:41                               | behind it, 14:05:26 (API listing)                  | not clicked                                      | Not provoked                                                                             |
| 2       | 2      | `sleep 300` from 14:16:37, no focus prohibition | behind it, 14:20:26 (API listing)                  | owner clicked "Steer" in the authenticated T3 UI | **Observed**                                                                             |

In the passing attempt the steer was delivered as a steering message at 14:20:51 and the queue was
empty at 14:21:04 (API). The steered tick ran inside the busy operator turn and posted the exact
checkpoint at 14:22:16 (`ticks=9`, `state=active`), a quiet tick.

- **Schedule state:** queue by `t3_queue list` (API); the Steer click itself was the owner's UI
  action.
- **Authorship:** coordinator operator turns; owner UI Steer (window 2 attempt 2, window 1 attempt
  4); scheduler ticks.
- **Window and result:** window 2, attempt 2. **Pass.** The unclicked attempts and window 1's
  attempt 4 are listed as not provoked.

#### 024bcb2a: F16

A real quiet tick's observer growth, and whether the first loop reaches the cap before compaction.

- **Setup and trigger:** the cap-loop observers of F12.
- **Expected:** growth recorded in the `activity` and `messages` views; the compaction tick count
  recorded when the first loop does not reach the cap.
- **Observed**, `window-2/F16-growth.jsonl` and `window-1/F16-growth.jsonl`, follows the table.

| Sample                                                                                                    | Activity items | Activity payload characters | Messages | Message payload characters |
| --------------------------------------------------------------------------------------------------------- | -------------: | --------------------------: | -------: | -------------------------: |
| `O2b` (window 2) after tick 2                                                                             |             49 |                     300,532 |       11 |                     11,159 |
| `O2b` (window 2) after tick 3                                                                             |             57 |                     337,719 |       13 |                     12,981 |
| `O2b` (window 2) at the compaction                                                                        |            213 |                   1,125,494 |       51 |                     48,209 |
| `O2` (window 2) after its compaction stop (`window-1/F16-growth.jsonl`, label `w2-after-compaction-stop`) |            200 |                     766,900 |       54 |                     50,863 |

Between ticks 2 and 3, both quiet, `O2b` (window 2) grew by 8 `activity` items (37,187
characters, about 37,200) and 2 `messages` (1,822 characters, about 1,800). The tick counts at
compaction were 24 (`O2` (window 2), 23 completed) and 21 completed (`O2b` (window 2), at the 22nd
fire); window 1's first loop reached tick 43 before the fault, without compaction. Window 1's two
growth samples at ticks 44 and 45 were taken after the fault and are not cited.

- **WP0 limits re-observed:** busy-thread queueing confirmed (F9, F10 and F15 queue listings);
  scheduled-turn skill load confirmed (F13); `nextPosition` across runs confirmed indirectly (the
  `last=` values of the checkpoints advance across runs without re-reading earlier pages);
  delete-then-continue confirmed (after the UI deletion in F8 and the focus deletions in F5, F6
  and F14, no further fire arrived for the deleted handle).
- **Schedule state:** as for F12.
- **Authorship:** scheduler ticks; the growth was read by the coordinator through the API.
- **Window and result:** windows 1 and 2. **Pass**: the growth and the compaction tick counts
  are recorded; the cap is the F12 limitation.

#### 024bcb2a: limitations

- **Link diagnosis and containment.** Candidate `a2e97ad8` ended a snapshot with the fragment
  `< t3 >` (entry `5d4fb583`), and an earlier run on 2026-11-09 produced `< t3-thread>`. A read-only
  diagnosis tied both to the host's rule to mention threads by their link: about 1% of the assistant
  messages that carried a T3 thread link ended at a malformed link, focus or not. The cause is not
  proven. Since `887ba1fd`, focus names sessions in inline code and never as a host thread link;
  the first window of `887ba1fd` showed the host link instruction overriding that focus rule
  (entry `57fc72ab`), so the extended host configuration adds the naming sentence. The naming rule
  and the extended host prerequisite are the containment under test, not a proven fix. The
  remaining risk is a truncated report, which the completeness check below catches.
- **Counts of the scan** (valid outputs only; every assistant message of each observer, top-level or
  delegated, final and commentary; the patterns are `t3-thread:`, `<\s*t3`, `<[a-z][a-z0-9+.-]*:`
  and a Markdown link to any scheme, applied after well-formed links are removed):

| Observer                | Messages scanned | Naming a session | Conforming mentions | Non-conforming mentions | Well-formed links | Defect matches | T3 text equals Codex record | Checkpoints (raw `target=`, exact ending) |
| ----------------------- | ---------------: | ---------------: | ------------------: | ----------------------: | ----------------: | -------------: | --------------------------: | ----------------------------------------: |
| `O` (window 1)          |               98 |               13 |                  14 |                       3 |                 0 |              0 |                       98/98 |                                        43 |
| `O2` (window 1)         |               48 |                2 |                   2 |                       1 |                 0 |              0 |                       48/48 |                                        44 |
| `O3` (window 1)         |                2 |                1 |                   1 |                       0 |                 0 |              0 |                         2/2 |                                         2 |
| `O4` (window 1)         |               18 |                3 |                   3 |                       1 |                 0 |              0 |                       18/18 |                                        13 |
| child of `P` (window 1) |                2 |                1 |                   1 |                       0 |                 0 |              0 |                         2/2 |                                         0 |
| `O` (window 2)          |               25 |                6 |                   6 |                       1 |                 0 |              0 |                       25/25 |                                        11 |
| `O2` (window 2)         |               29 |                2 |                   2 |                       1 |                 0 |              0 |                       29/29 |                                        25 |
| `O2b` (window 2)        |               29 |                3 |                   3 |                       1 |                 0 |              0 |                       29/29 |                                        25 |
| `O` (window 3)          |                6 |                3 |                   3 |                       2 |                 0 |              0 |                         6/6 |                                         0 |
| **Total**               |          **257** |           **34** |              **35** |                  **10** |             **0** |          **0** |                     **257** |                                   **163** |

The files are `window-1/scan-w1-O-valid.json`, `scan-w1-O2-valid.json`, `scan-w1-O3.json`,
`scan-w1-O4.json`, `scan-w1-P-child.json`, `window-2/scan-w2-O.json`, `scan-w2-O2.json`,
`scan-w2-O2b.json` and `window-3/scan-w3-O.json`. No scan found a well-formed host thread link,
a malformed fragment, a link or ID naming the wrong session, or a mismatch between the T3 text
and the Codex record. Nine of the ten non-conforming mentions are the ID inside the longer
inline-code span of the offer's stop command, the shape that "Offer" prescribes; the tenth is the
raw JSON block of the trusted-context capture in window 3. None is a title, an abbreviation, a
bare mention or a link.

- **Evidence strength.** N, the number of session-naming messages scanned, is 34 (257 messages
  in all). With no malformed fragment among them, the approximate 95% upper bound on the
  per-message rate is about 3/N, roughly 9%. The earlier ~1% rate counted messages that carried
  a link, a different population, so the two figures do not compare. A pass on this sample, one
  model and one effort, shows that the containment held here; it does not prove a low rate.
- **Report completeness.** `report-completeness.json` classifies the messages of the eight
  observers of windows 1 and 2 (snapshot, tick report, quiet tick, refusal, other) and finds zero
  incomplete snapshot, tick or refusal reports: a verdict, coverage and message outcome for
  snapshots, the exact checkpoint ending for ticks, the message outcome for refusals. `O` (window 3) is not part of that file; its one snapshot is complete in the UI capture.
- **Delete calls** (`window-1/scan-sched-w1-*.json`, `window-2/scan-sched-w2-*.json`; the F5, F6
  and F14 calls also in `scan-sched-O-f5.json`, `scan-sched-O4-f6.json` and
  `scan-sched-O-f14stop.json`): every `delete_scheduled_task` call passed the complete handle with
  its `scheduled-task:` prefix, equal to the creation result, the prompt's `handle:` and the
  checkpoint's `handle=`.

| Observer         | Calls | With the complete handle | Completed | `task_not_found` | Which                           |
| ---------------- | ----: | -----------------------: | --------: | ---------------: | ------------------------------- |
| `O` (window 1)   |     2 |                        2 |         2 |                0 | F14 stop, F5 completion         |
| `O2` (window 1)  |     0 |                        0 |         0 |                0 |                                 |
| `O3` (window 1)  |     0 |                        0 |         0 |                0 |                                 |
| `O4` (window 1)  |     1 |                        1 |         1 |                0 | F6 lost access                  |
| `O` (window 2)   |     1 |                        1 |         0 |                1 | F8, provoked by the UI deletion |
| `O2` (window 2)  |     1 |                        1 |         1 |                0 | compaction stop                 |
| `O2b` (window 2) |     0 |                        0 |         0 |                0 | none (no traceable checkpoint)  |
| **Total**        | **5** |                    **5** |     **4** |            **1** |                                 |

On `85728d95` the stripped ID occurred only in the long-context observers (`O4` at F6, `O2` at the
cap). On `024bcb2a`, the corresponding calls are `O4` (window 1) at F6 and `O2` (window 2) at the
first compaction stop, both complete and completed; the cap-tick deletion itself was not
exercised (see F12 below). The fix's effect in the long-context case therefore rests on these few
calls. All eight schedule updates in the scans carried the prefix as well.

- **Offer disclosures.** Counted per observer, valid outputs only: `O` (window 1) 4 offers, all
  complete; `O2` (window 1) 1 offer that omitted the report-only disclosure and was otherwise
  complete (partial omission); `O4` (window 1) 1 complete offer, including both elements of the
  approval disclosure (approval for reads and deletion, and the hold of later ticks); `O` (window 2) 1 and `O2` (window 2) 1, both complete; `O2b` (window 2) 1 German offer, which the English
  patterns of the scan cannot read and which was checked by hand, all disclosures present; `O`
  (window 3) 1 German offer, all disclosures visible in the UI capture. The offers with omissions
  stay a known limitation, as for `85728d95`: the opt-in worked and the reports were otherwise
  complete. It is tracked, with the F3 and F12 limitations and the home path below, in
  [#663](https://github.com/sebastian-software/effective-flow/issues/663). No approval-mode offer
  lacked an element of the approval disclosure, and no offer was missing.
- **Withdrawn offers.** The record exercises a declined offer only (F1's "no follow-up" followed by
  a second snapshot, which carried a new offer). A withdrawn offer, an unrelated turn after the
  offer followed by a later snapshot, is not recorded.
- **F3, Looping not reported.** Attempt 1 is not a valid provocation, because the coordinator
  requested the repetitions, and a requested retry stays On track; the limitation rests on attempts
  2 (window 1) and 3 (window 2). In both, the target repeated the same failing step across tick
  windows, and the observer reported the blocker once and then stayed quiet, never Looping.
  `85728d95` produced Looping once under a similar arrangement. The quiet ticks and the once-only
  reports were correct; reproducible Looping reports are not shown (owner decision, 2026-11-13).
- **F12, cap not reached.** The three loops ended after 43, 23 and 21 completed ticks, with no
  missing checkpoint (the first compaction fire posted two checkpoints, tick 23 active and tick 24
  stopped). Both compaction stops conform to `src/shared/focus-follow-up.md` "Deletion safeguard
  and stopped ticks": no target read, deletion where the handle was traceable (`O2` (window 2)),
  none with the delete-in-T3 notice and a dash-field stopped line where it was not (`O2b` (window
  2)), and later fires as exact stopped ticks. The cap tick's own deletion, where `85728d95`
  stripped the handle, was not exercised on `024bcb2a`. The long-context deletion evidence of D is
  `O4` (window 1) at F6 and `O2` (window 2) at its compaction stop (owner decision, 2026-11-13).
- **Host environment (window 2 and window 3).** At 13:40:00 UTC in window 2, `~/.codex/AGENTS.md`
  was rewritten with a German chat-language rule, Europe/Berlin times and a rule against native
  Codex subagents, `delegate_task` only (SHA-256
  `70fc0d66d50f30526e3c07aff1d1d0e49abc74c8eec47e83f0fd38a804fd59a6`,
  `window-2/codex-AGENTS.md-1340`). Sessions started at 13:32–13:34 did not contain the rule: the
  13:34 snapshots, before the 13:40 rewrite, are English, and observer output was German from the
  first tick of `O2` (window 2) at 13:41 on. Window 3's output was also German; the file was not
  re-captured in window 3. The owner accepted this as host environment (2026-11-13). The qualified
  configuration therefore ran together with other global instructions in windows 2 and 3, which is
  the combination the qualification does not cover. The reporting ticks of window 2 dispatched the
  analysis leaf through the T3 `delegate_task` child task, not through a native Codex subagent
  (`evidence-completion.json`). The larger context plausibly contributed to the two compactions.
  Window 1 ran without this file.
- **Home path in `O2` (window 2).** The compaction-stop message of `O2` (window 2) at 15:32:08
  carried a Markdown link whose target was the absolute slot path of `shared/focus-follow-up.md`,
  quoted here as `~/.agents/skills/effective-flow/shared/focus-follow-up.md`. It is a local path
  link, not a thread link, and no defect pattern matched. It breaches the redaction rule of
  `src/shared/focus-session-contract.md` ("Authority before any host access": redact personal
  values before display) and is counted as one limitation (owner decision, 2026-11-13), tracked in
  #663. The verbatim message is not part of the evidence root.
- **Invalid outputs of window 1 after 12:47:50 UTC**, not cited anywhere above: the tick of `O`
  (window 1) at 12:47:58 (tick 24), its tick at 12:54:09 (tick 25), which loaded the released
  contract, posted a stopped checkpoint and tried a deletion that returned `task_not_found`, the
  ticks of `O2` (window 1) at 12:49:43 (tick 44) and 12:54:23 (tick 45), and the two growth samples
  taken after them.
- **Not recorded.** The T3 UI was observed for F1's rendering (window 3), F8's deletion and F15's
  Steer; other schedule states are API listings. Window 1 has no end-of-window integrity check and
  no link restore. The T3 server version is not independently captured, the trusted context exists
  for one observer, and the per-call selections of F1's read ledger are not itemized. No snapshot
  states its redaction outcome; F1 passes without that field. Window 1's leaf verdict is recorded
  only as one completed analysis leaf.
- **Scope.** The record binds the portable build only. Native maintainer builds are not qualified,
  which stays an accepted residual risk; so does the extra visible commentary on quiet ticks that a
  default Codex configuration produces. Other hosts and other models are not covered. The scenarios
  ran once each, apart from the attempts listed.

**Host prerequisite status, November 13, 2026.** The conditional `developer_instructions` entry
shown under "Experimental host prerequisite", extended by the naming sentence shown in the binding
above (SHA-256 `c19e3da3…`), is now the qualified configuration of the follow-up mode on this
path, recorded on `gpt-6.1-sol` at medium reasoning effort in a configuration file that holds only
that entry. A default Codex configuration, a combination with other configuration keys and another
`developer_instructions` value are not qualified. For this path the statement supersedes that
section's wording "a host prerequisite for a future qualification attempt only", "not … a production
recommendation" and "remove it again unless the full qualification owner explicitly authorizes its
use", which stays unedited as dated history. The entry applies to follow-up tick
turns, so it is a prerequisite of the follow-up row. Its naming sentence also covers snapshots and is a prerequisite of the qualified naming, not of report-only correctness.

## Acceptance matrix

| Host/path                                       | Required candidate-bound proof                                                                                                                                                                                                  | Current status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | If unavailable                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| T3 observed, report-only                        | The built candidate loads `focus`; an exact throwaway target is admitted; the observer reads only the selected source with bounded coverage; identity, scope, redaction, cited evidence, and one snapshot verdict are recorded. | Passed F on the bound candidate `024bcb2a`. The extended host configuration entry was active; its tick part addresses tick turns only, and its naming sentence, which also covers snapshots, is a prerequisite of the qualified naming, not of report-only correctness. History: passed E on the bound candidate `ada4fdae`, passed D on the bound corrected candidate, and C also passed before the spelling correction; E and D are history, and the D binding is superseded by the follow-up mode change (#613). | Return missing current snapshot qualification before target or ancestry reads; do not claim support. |
| T3 delegated correction                         | A running delegated target is rechecked immediately before dispatch, and an atomic conditional primitive rejects a target that finishes between the state read and steer without starting a fresh task.                         | Disabled; no candidate-bound proof exists, and the required atomic conditional primitive is not established.                                                                                                                                                                                                                                                                                                                                                                                                        | Report-only; do not invoke a correction.                                                             |
| T3 idle top-level correction                    | Candidate-bound acceptance of the documented new-turn `queue` form, including exact same-run confirmation and outcome classification.                                                                                           | Disabled; idle top-level acceptance is absent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Do not invoke a correction.                                                                          |
| Codex desktop observed                          | Candidate-bound deep-link reading, trusted self/ancestor refusal, bounded coverage, redaction, and cited verdict are observed on the loaded artifact.                                                                           | Disabled; this test host is unavailable here and no candidate-bound run exists.                                                                                                                                                                                                                                                                                                                                                                                                                                     | Return the specific missing capability; do not read or send.                                         |
| Local Claude Code self-report/correction        | Candidate-bound default-permission top-level proof, `[ref]`-qualified delivery, bounded request/reply and nonce checks, refusal/late/foreign-reply handling, and a separate confirmed correction case.                          | Disabled; this test host is unavailable here and no candidate-bound run exists.                                                                                                                                                                                                                                                                                                                                                                                                                                     | Return the specific missing capability; do not look up, request, wait, or correct.                   |
| Codex desktop send                              | A host-supported sender is independently observed and candidate-bound.                                                                                                                                                          | Disabled in this version; the spike recorded only a model self-report, not a host sender.                                                                                                                                                                                                                                                                                                                                                                                                                           | Never send through this path.                                                                        |
| T3 observed follow-up (schedule_task, T3/Codex) | The follow-up qualification checklist below is recorded on the built candidate, with trusted host context naming provider instance `codex` for the observer thread.                                                             | Passed F on the bound candidate `024bcb2a`, with the documented host prerequisite and the limitations in `#### 024bcb2a: limitations` (F3, F12 and window 2's host environment). Sends stay disabled.                                                                                                                                                                                                                                                                                                               | Offer no follow-up; `follow-up stop` and a tick's deletion of its own handle stay available.         |

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
recorded candidate on this page. For each one, record the setup, the trigger, the expected observer
output, and the schedule state verified in the T3 UI; focus never lists schedules.

- renewed snapshot qualification, including self and ancestor refusal, recorded before the next
  activation — recorded: F1 for `024bcb2a`;
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
recorded candidate re-observed them. The actual order differed from the one this checklist first
described: the enabling edits (the contract's sole-executable-path wording and its test, the
`focus` `catalogHint` and frontmatter `description`, the user-guide wording) were made first on the
unmerged candidate, with both T3 observed gate rows enabled and all send rows disabled, and the
record above followed on that candidate. The `catalogHint` keeps the candidate's wording instead of
the pending wording. The `focus` and `build-context` eval rounds are post-merge debt, not part of
this record. Under the ADR-strict rule of the [capability policy](../adr/pragmatic-test-release-policy.md),
a later focus-source change, or a built focus change not documented as demonstrably nonbehavioral,
needs a passing record for a candidate matching the merge head plus the updated digest file, or both
rows are disabled again; the digest guard in `pnpm test` enforces it against the digests of the
recorded candidate. The record binds the portable build only; native maintainer builds are not
qualified, which stays an accepted residual risk.

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
observations can explain why a criterion exists, but only a completed candidate-bound row can integrate an
enabled host path into `develop`.
