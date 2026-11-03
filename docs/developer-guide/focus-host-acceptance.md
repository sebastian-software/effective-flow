# Focus host acceptance

**Status: T3 observed/report-only snapshot accepted on November 2, 2026; all send paths remain disabled.**

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

The portable candidate passed the bounded T3 observed/report-only snapshot below. This qualifies
that reader path under the recorded conditions; it does not qualify sends, other hosts, model
accuracy, or release readiness. The observer and target used T3 Code through the Codex harness,
`full-access`, default interaction mode, and `gpt-6.1-sol`; observer effort was high. The T3 and
harness version numbers were unavailable. No version-specific compatibility claim is made.

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
artifacts are not tracked. Changes to these contracts require renewed candidate qualification.

## Observed run and corrections

Three bounded acceptance attempts and one post-correction requalification used synthetic throwaway
targets. Sanitized labels A, B, C, and D
identify their phases; no real task content or session address is published.

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

## Acceptance matrix

| Host/path                                | Required candidate-bound proof                                                                                                                                                                                                  | Current status                                                                                               | If unavailable                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| T3 observed, report-only                 | The built candidate loads `focus`; an exact throwaway target is admitted; the observer reads only the selected source with bounded coverage; identity, scope, redaction, cited evidence, and one snapshot verdict are recorded. | Passed D on the bound corrected candidate; C also passed before the spelling correction.                     | Return missing candidate-bound observed/report-only acceptance; do not claim ordinary support. |
| T3 delegated correction                  | A running delegated target is rechecked immediately before dispatch, and an atomic conditional primitive rejects a target that finishes between the state read and steer without starting a fresh task.                         | Disabled; no candidate-bound proof exists, and the required atomic conditional primitive is not established. | Report-only; do not invoke a correction.                                                       |
| T3 idle top-level correction             | Candidate-bound acceptance of the documented new-turn `queue` form, including exact same-run confirmation and outcome classification.                                                                                           | Disabled; idle top-level acceptance is absent.                                                               | Do not invoke a correction.                                                                    |
| Codex desktop observed                   | Candidate-bound deep-link reading, trusted self/ancestor refusal, bounded coverage, redaction, and cited verdict are observed on the loaded artifact.                                                                           | Disabled; this test host is unavailable here and no candidate-bound run exists.                              | Return the specific missing capability; do not read or send.                                   |
| Local Claude Code self-report/correction | Candidate-bound default-permission top-level proof, `[ref]`-qualified delivery, bounded request/reply and nonce checks, refusal/late/foreign-reply handling, and a separate confirmed correction case.                          | Disabled; this test host is unavailable here and no candidate-bound run exists.                              | Return the specific missing capability; do not look up, request, wait, or correct.             |
| Codex desktop send                       | A host-supported sender is independently observed and candidate-bound.                                                                                                                                                          | Disabled in this version; the spike recorded only a model self-report, not a host sender.                    | Never send through this path.                                                                  |

Every advertised path must have a completed row backed by the current candidate. A failed or
unavailable row is a missing-capability result, not a reason to broaden permissions, switch hosts,
use a name-only address, or substitute a private transcript or log.

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
