# `refactor` field-pilot integration

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `91afe89` on 2026-09-21.
**Working state:** Preserve the untracked `docs/concept/` tree and
`docs/plan/2026-09-21-iterate-behavioural-eval-coverage.md`.
**Depends on:** `docs/plan/2026-09-21-build-field-pilot-integration.md` and therefore work packages
1–3.

## Requirement

Reuse the `build` pilot integration for `refactor` without weakening behavior invariance. An
eligible native packet may use Fast only for its first Phase 3 implementation spawn after the
Phase 2 refactor baseline is complete. Quality review, post-validation, before/after comparison, every review
incorporation, and every regression loop remain Quality-controlled.

## Architecture decisions

- Reuse `build`'s native selector, measurement helper, retained-state transfer, and exact decision
  envelope verbatim: derived `configState`, persisted `generationState`,
  `eligibility=not-evaluated|eligible|excluded(reason)`, `selectedProfile=quality|fast`, fallback,
  `initialImplementationSpawnConsumed`, and helper-returned `pilotControlOutcome`. A reason exists
  only inside `excluded(reason)`. Do not fork a refactor policy. Fast is legal only for
  `enabled + active + eligible`; `enabled + baseline + eligible` executes Quality and records
  counterfactual Fast eligibility. This includes `build`'s terminal record obligations and
  protocol-controlled response to every critical safety, data-integrity, authorization, or scope-
  boundary incident.
- Establish the execution receipt and complete Phase 2 baseline validation/tests before profile
  selection. Bind baseline commands/results, exact invariance expectation, approved paths,
  dependencies, and comparison commands to every packet.
- Unknown or unavailable optional baseline evidence selects Quality under `unknown-evidence` and is
  recorded as unavailable. If a check is required by the approved acceptance criteria for the
  before/after comparison, inability to establish or repeat it blocks implementation or completion;
  it is never waived by selecting Quality.
- A required Phase 2 refactor-baseline check that executes and reproducibly exposes a pre-existing
  failure does not by itself block a structural refactor when the exact invariance comparator remains
  measurable. Unless the shipped protocol explicitly admits failing baselines for Fast, the
  canonical envelope records `eligibility=excluded(unknown-evidence) + selectedProfile=quality`
  because eligibility has not been positively established; it never invents a new reason. If Phase 5
  reproduces the same failure, required validation remains
  unsuccessful; Phase 6 may still mark workflow completion successful only when the exact comparison
  proves no regression. Never convert, omit, or relabel the pre-existing failure as success.
- After the Phase 2 refactor baseline is complete and immediately before measurement `start`, an
  enabled pilot baseline generation invokes positional `activate`. A successful not-ready response
  proves baseline; a successful transition means only the subsequently reserved workflow is active.
  After a crash, malformed response, or other ambiguous failure, re-read guarded inventory and use
  only the proven persisted state. If state cannot be proven, run Quality without measurement or
  `start` and claim neither cohort. Never relabel an already reserved pilot-baseline record.
- Consume the profile decision only at the first Phase 3 spawn. Re-entering Phase 3 after review or
  regression carries the consumed flag and never reruns Fast eligibility.
- The Fast handoff repeats the existing structural-only boundary: no new behavior, feature, or
  unplanned bug fix. A newly required behavior/public-contract change, migration, concurrency,
  unsafe code, or unresolved architecture decision is outside the refactor packet and stops for
  replanning; Quality does not make it allowable. If a measurement reservation exists, finalize it
  with the exact protocol schema and apply the shared owned-worktree `aborted` transition when the
  workflow terminates. An accidental executor regression is a different branch: retain the diff,
  correct it with Quality inside the approved scope and bounded Phase 3–6 loop, count the correction
  spawn, and use `failed` only for an actual implementation, validation, or state error rather than
  a deliberate replan stop.
- Phase 4 incorporation uses the routed Quality implementer. A Phase 6 regression returns through
  Phases 3–6 with Quality. The newest provisional finding set still replaces the prior set, and no
  external review state is finalized before successful comparison.
- Retained-state fallback uses the `build` transfer record plus baseline evidence and observed
  regression delta. Operational commands and deltas remain in the ephemeral handoff or consented
  trace. Map evidence deterministically: Phase 2 records comparator availability but is not output-
  validation success; Phase 5 alone supplies required validation status/counts; Phase 6 supplies the
  behavior-comparison result and workflow completion status. Missing required Phase 5 evidence is
  unsuccessful and blocks completion. An exactly reproduced pre-existing failure remains an
  unsuccessful validation while Phase 6 may independently report successful no-regression
  completion; never convert or omit it. Correction spawns map only to correction-round fields.
- Invoke `pilot-measurement.mjs <operation>` with the operation as the sole positional argument, one
  exact-key JSON object on stdin, and only its stable stdout envelope as data; never scrape stderr.
  Before Phase 3's initial spawn, nonzero, malformed, drifted, or unknown responses prevent Fast and
  route unmeasured Quality when no reservation exists. After implementation, finalization/control
  failure preserves the product diff, starts no implementation worker, retains incomplete/control
  evidence or emits the value-free alert, and blocks later Fast. Consume protocol-returned control
  outcomes; never map them locally.
- Keep fallback and pilot control independent. Detect `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` by presence
  only and never read, relay, or persist its value. Pre-spawn unavailability selects
  `excluded(profile-unavailable) + quality + fallback=none`; it is not a Fast→Quality transition.
  Only an actually attempted Fast spawn can create a fallback. Critical incidents may set both
  axes, while finalization, evidence, capacity, incomplete-record, or control-state failures set
  only `pilotControlOutcome`, authorize no refactor write, and never alter a successful product diff.
- A new workflow observing `generationState=review` selects `not-evaluated + quality`, creates no
  reservation, and cannot reopen admission. A record reserved before `begin-review` may finalize
  only with its captured cohort and state. `resume` is legal only while still `suspended`, restores
  only the helper-stored `resumeTo=baseline|active`, and rejects every other state. A
  `suspended → review` transition preserves causes and incomplete evidence while permanently
  removing the resume path.
- Measure from immediately before the first Phase 3 implementation spawn. Pilot-baseline Quality
  and active gate-selected Quality measure that initial Quality attempt; an attempted Fast fallback
  includes the failed Fast attempt plus its single retained-state Quality continuation. Phase 2
  refactor-baseline work, documentation sync, Phase 4 incorporation, Phase 5 validation, and every
  repeated Phase 3–6 regression loop are excluded from implementation duration/cost. Each new
  Quality implementation spawn after the initial phase increments the correction-round field; a
  same-worker keyword-less resume does not. Missing or incompatible metrics are unavailable, never
  zero.
- Authorized structural scope growth within the approved refactor stays under the original reserved
  packet and inherits Fast-consumed state. Genuinely independent work or a required behavior change
  is not added at finalization and receives no write in this workflow. Ask whether to capture it as
  a future-work issue, or as a new plan when no issue tracker is available; declining creates no
  artifact.
- Disabling the project opt-in restores Quality-only refactoring and stops new measurement while
  preserving any stored generation; it performs no source/runtime migration or implicit deletion.

## Affected files

| File                                                | Planned change                                                                                                                                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/refactor.md`                             | Add post-baseline initial profile selection, retained-state fallback, Quality-only incorporation/regression, and measurements.                                                               |
| `docs/user-guide/tools-implement.md`                | Document refactor-specific baseline and invariance behavior.                                                                                                                                 |
| `test/execution-profile-workflow-contract.test.mjs` | Extend shared workflow assertions for the exact envelope/state matrix, activation recovery, phase-specific CLI failures, baseline binding, measurement boundaries, and consumed-state loops. |
| `test/refactor-review-lifecycle-contract.test.mjs`  | Preserve provisional/final review ordering through profile integration.                                                                                                                      |
| `test/fixtures/execution-profiles/refactor/*.json`  | Add baseline, eligible, excluded, fallback, invariant, and regression scenarios.                                                                                                             |
| `evals/execution-profiles/**`                       | Extend the synthetic fresh-session matrix with refactor cases.                                                                                                                               |
| `build.mjs`                                         | Adjust only the observed `refactor` context budget if required.                                                                                                                              |

Shared policy and measurement files change only for a genuinely generic missing interface. Do not
repeat canonical policy prose or edit `dist/**`.

## Implementation details

### Approach

1. Verify the completed `build` integration interfaces and reuse its packet/coupling, consumption,
   decision-envelope, fallback/control separation, CLI, privacy, lifecycle, and incident handling
   unchanged.
2. Add lazy pointers at the Phase 3 profile-selection seam while preserving existing eager routing
   and configuration contracts.
3. Bind the Phase 2 refactor-baseline output and behavior-invariance completion condition to each packet
   before evaluating eligibility. Distinguish unavailable required evidence, which blocks; optional
   unavailable evidence, which routes Quality; and a reproducible pre-existing required-check
   failure with a measurable comparator, which may proceed Quality-only unless the shipped protocol
   explicitly admits it. In that default path record exact
   `excluded(unknown-evidence) + quality`.
4. For an enabled pilot baseline generation, invoke `activate` after the Phase 2 refactor baseline
   and before `start`, including guarded inventory recovery for ambiguous responses. Then reserve
   the complete packet set, select from the proven state, and consume the initial profile immediately
   before the first routed Phase 3 spawn. Never append a later packet identity.
5. Reuse the retained-state Quality continuation; add baseline evidence and regression delta, and
   revalidate the same execution receipt before writing.
6. Make Phase 4 automatic incorporation explicitly Quality-only. Persist Fast-consumed across the
   Phase 6 loop and force every repeated Phase 3 spawn to Quality.
7. Map Phase 2 refactor-baseline/post-validation/comparison into the generic minimal
   validation/completion fields: Phase 2 owns comparator availability, Phase 5 owns required
   validation status/counts, and Phase 6 owns comparison plus workflow completion. Preserve an
   unchanged pre-existing failure as unsuccessful validation even when completion is successful, and
   treat missing required Phase 5 evidence as unsuccessful and blocking. Attach review/correction
   outcomes without persisting commands, paths, regression deltas, prose, or source.
8. Keep the two finalization lifecycles separate. After successful `start`, attempt measurement
   `finalize` exactly once on every terminal workflow exit, including behavior-change stop, abort,
   missing outcome, incident, regression-budget exhaustion, and success. Only external review
   reports/backlinks and the latest provisional finding set wait for a successful Phase 6
   comparison; then preserve wisdom deletion, plan archival/delivery handback, and completion report.
9. Extend focused contract/fixture tests and the synthetic manual scenario matrix.
10. Build, use the reported core line count, and change only the measured `refactor` budget with at
    most ten lines of headroom.

### Required scenario matrix

Reuse all shared `build` cases where applicable, including the exact decision envelope, full
configuration×generation matrix, pilot-baseline Quality with would-have-been-Fast, every suspension
incident, force-variable presence-only handling, fallback/control independence, and every terminal
record path. Add: missing/incomplete Phase 2 refactor baseline; automatic activation and ambiguous-
response inventory recovery after it; active-generation eligible Fast; `review` plus concurrent
`start`/`begin-review`; pre-spawn versus post-spawn CLI errors; invariant success; behavior-change
discovery; Phase 4 Quality incorporation; Phase 6 regression returning to Quality Phase 3;
replacement of provisional findings; exact duration/correction boundaries; measurement finalization
on every terminal exit versus external review finalization only after successful comparison; and no
late packet addition. Test authorized structural growth, independent new work, discovered required
behavior change, issue/new-plan/decline capture, and accidental executor regression separately. For
Phase 2 evidence, distinguish a missing required comparator, unavailable optional evidence, a
reproducible pre-existing required-check failure with unchanged Phase 5/6 results, and a worsened
failure. Pin the exact field ownership: Phase 2 comparator availability, Phase 5 validation
status/counts, and Phase 6 comparison/completion, including the valid combination of unsuccessful
validation with successful no-regression completion. The reproducible-failing-baseline fixture must
assert `excluded(unknown-evidence) + quality` unless a protocol revision explicitly admits it.

### Edge cases and stop conditions

- Baseline uncertainty never makes a packet Fast; a missing required comparison check blocks the
  workflow, while a missing optional check is recorded and routes Quality.
- A discovered scope or architecture decision beyond the approved refactor stops for replanning;
  Quality is not authorization to change behavior. Independent future work is captured only after
  the user's issue/new-plan choice and never enters the current measurement record.
- Receipt/root drift, unowned edits, measurement failure, Quality abort, or bounded-loop exhaustion
  follows the shared fail-closed/retained-state behavior.
- Authorized structural scope growth stays in the original packet and cannot reset Fast
  consumption. Independent new work cannot be added after `start`.
- No meaningful diff follows the existing no-empty-delivery rule.

## Acceptance criteria

- [ ] Disabled, unavailable, malformed, and portable pilot paths preserve Quality-only refactoring.
- [ ] The exact `configState`/`generationState`/tagged `eligibility`/`selectedProfile` envelope is
      captured without local activation or nullable-reason fields; a reason exists exactly for
      `excluded(reason)`.
- [ ] In an enabled active generation, an eligible native packet gets exactly one Fast Phase 3 spawn
      after complete Phase 2 refactor-baseline capture; in an enabled pilot baseline generation, it executes Quality and
      records would-have-been-Fast.
- [ ] Automatic activation occurs after the complete Phase 2 refactor baseline and before `start`;
      successful not-ready/transition and ambiguous recoverable/unprovable outcomes match `build`,
      and no already reserved pilot-baseline record is relabelled.
- [ ] Fast receives baseline evidence and the explicit behavior-invariance boundary.
- [ ] Phase 4 review remains Quality-tier; incorporation is Quality-only.
- [ ] Every repeated Phase 3 after regression is Quality and the eligibility gate is not rerun.
- [ ] Phase 5 repeats baseline checks without writing tests, and Phase 6 cannot complete with a
      behavior regression.
- [ ] Phase 2 contributes comparator availability but no output-validation success; Phase 5 alone
      owns required validation status/counts; Phase 6 owns comparison and workflow completion.
      Missing required Phase 5 evidence blocks, while an exactly unchanged pre-existing failure
      remains unsuccessful validation and may coexist with successful no-regression completion.
- [ ] Required behavior change stops for replanning; accidental regression uses bounded Quality
      correction without changing the approved behavior contract.
- [ ] A reproducible pre-existing required-check failure with a measurable comparator may proceed
      with exact `excluded(unknown-evidence) + quality` unless explicitly admitted by the shipped
      protocol; unchanged failure remains an unsuccessful required validation result but may coexist
      with successful no-regression workflow completion, while missing evidence or worsening still
      blocks.
- [ ] Provisional findings are replaced on rerun and finalized only after successful comparison.
- [ ] Mixed-scope, retained-state, measurement, incident, and rollback behavior match `build`.
- [ ] Started workflow records receive exactly one terminal finalization attempt across success,
      behavior-change stop, abort, missing outcome, incident, regression-budget exhaustion, and
      success. External review state finalizes only after successful comparison; start/finalization
      failures retain the shared phase-specific fail-closed behavior.
- [ ] Review rejects new reservations and has no resume path; captured records keep their start-time
      state, and only a still-suspended generation can resume to its stored target.
- [ ] Pre-spawn unavailability, attempted-spawn fallback, and protocol control remain independent;
      CLI and force-variable handling match the shared exact contracts without authorizing writes.
- [ ] The initial Phase 3 measurement excludes Phase 2, documentation, review, validation, and later
      correction loops; new Quality correction spawns are counted, keyword-less resumes are not,
      and unavailable metrics never become zero.
- [ ] Authorized structural scope growth stays in the reserved packet; independent work or required
      behavior change gets no write or late record identity and prompts for future issue/new-plan
      capture, with decline creating no artifact.
- [ ] Refactor-specific fixture and fresh-session scenarios demonstrate the required outcomes.

## Validation plan

```sh
node --test test/execution-profile-workflow-contract.test.mjs
node --test test/refactor-review-lifecycle-contract.test.mjs
node --test test/execution-location-contract.test.mjs test/worktree-lifecycle-contract.test.mjs
node --test test/pilot-measurement.test.mjs test/pilot-measurement-cli.test.mjs test/pilot-measurement-contract.test.mjs
node --test test/execution-profile-eval.test.mjs
pnpm execution-profile-eval:verify
pnpm agent:check
pnpm test
node build.mjs
pnpm test:distribution
pnpm merge-gate-eval verify
```

Record the built `refactor` core line count, add one current categorical result per refactor
scenario, and make the digest-aware verifier pass.

### Scope change 2026-10-06

The fresh-session behavioural eval (`evals/execution-profiles/**`, `pnpm execution-profile-eval:verify`,
`test/execution-profile-eval.test.mjs`) is out of scope for the same reason `build` dropped its
suite in "Scope change 2026-09-29" of `docs/plan/archive/2026-09-21-build-field-pilot-integration.md`:
the shared `evals/_scaffold/` instrument provisions only the portable build, where every Fast token
renders as unavailable, and `seal` refuses a run with an empty tracker-stub call log. By user
decision this plan delivers fixture-driven contract coverage only. The behavioural eval for both
adopting workflows belongs to a follow-up plan that first generalizes the scaffold; that plan does
not exist yet. Validation uses `pnpm eval merge-gate verify` and `pnpm eval iterate verify` in place
of the retired `pnpm merge-gate-eval verify`.

## Implementation notes

**Executed against:** `d8d707d` (`origin/develop`) on 2026-10-06, after `build` adopted the pilot
(#513) and the helper reached protocol 1.1.0 (#512).

- **Drift resolved at execution time.** The decision envelope uses `build`'s `fastAttemptConsumed`,
  not `initialImplementationSpawnConsumed`. `activate` takes no confirmation and reports a not-ready
  window as success; incidents go through `record-incident` with a category.
- **Shared packet contract extracted.** `build` held the per-packet state, the delegation and
  requirements-check rules, and the Fast→Quality transition inline in its Phase 2. Instead of a
  second copy, or a runtime read of `tools/build.md`, both workflows now point to the new section
  "Initial implementation phase" in `src/shared/execution-profiles.md`. `build`'s behavior is
  unchanged; its core shrank from 662 to 632 lines.
- **`refactor` integration.** Phase 2 binds required, optional, and pre-existing-failing checks per
  packet; a required check that cannot be established is a controlled stop before Phase 3 with no
  reservation. Phase 3 is the profile seam with the five selector tokens, the structural-only
  boundary and baseline evidence in every implementer handoff of Phases 3, 4, and 6, and a
  replanning stop for a required behavior change. Phase 4 incorporation and every Phase 6 regression
  loop are Quality-only. Phase 6 gains an explicit branch for a required check Phase 5 could not
  repeat. "Pilot record" owns the field mapping and the `completionStatus` mapping: `completed` only
  with no regression; `aborted` after a replanning stop or a user abort; `failed` after an
  unrepeatable required check, an incident that ends the run, a missing outcome, or an exhausted
  regression loop. An incident the run survives leaves the status to the comparison, as in `build`.
- **Shared fragments.** `pilot-measurement-workflow.md` sends `workflow: build|refactor` with
  `start`; `setup-execution-profiles.md` names both adopting workflows in the opt-in, the
  `begin-baseline` data disclosure, and the ask descriptions.
- **Budgets.** `refactor` 971/975 (was 924), `build` 632/640 (was 662), `setup` 1927/1927 unchanged.

### Affected files (as delivered)

- `src/tools/refactor.md`, `src/tools/build.md`, `src/shared/execution-profiles.md`,
  `src/shared/pilot-measurement-workflow.md`, `src/shared/setup-execution-profiles.md`, `build.mjs`
- `test/execution-profile-workflow-contract.test.mjs`, `test/execution-profile-contract.test.mjs`,
  `test/execution-profile-rendering.test.mjs`, `test/refactor-review-lifecycle-contract.test.mjs`,
  `test/workflow-contracts.test.mjs`, 34 fixtures under `test/fixtures/execution-profiles/refactor/`
- `AGENTS.md`, `docs/adr/risk-aware-model-tiering-pilot-policy.md`,
  `docs/adr/native-execution-profile-representation.md`, `docs/developer-guide/build-system.md`,
  `docs/developer-guide/model-tiering-pilot-protocol.md`, `docs/developer-guide/architecture.md`,
  `docs/developer-guide/configuration.md`, `docs/user-guide/model-tiering-pilot.md`,
  `docs/user-guide/tools-implement.md`, `docs/user-guide/configuration.md`,
  `docs/user-guide/getting-started.md`, `docs/user-guide/tools-setup.md`,
  `docs/user-guide/tools-deliver.md`

## Test results

- Focused contract suites (`execution-profile-workflow-contract`, `execution-profile-contract`,
  `execution-profile-rendering`, `refactor-review-lifecycle-contract`, `workflow-contracts`): 571/571
  passed. The refactor fixtures replay against the shipped helper with `workflow: refactor`.
- `pnpm agent:check`: passed. `node build.mjs`: passed, no guard warning.
- `pnpm test`: 1994 tests, 1993 passed, 0 failed, 1 skipped (pre-existing skip).
- `pnpm test:distribution`: offline checks passed.
- `pnpm eval merge-gate verify` and `pnpm eval iterate verify`: all 12 scenarios `current`; no
  re-record owed.
- Mutation probes confirmed that the Phase 4 Quality incorporation, the `unknown-evidence` gate
  row, the rendered refactor selector lines, the Phase 5 no-write rule, and the `completionStatus`
  mapping are each caught by a test.

## Review findings

**Date:** 2026-10-06
**Reviewer:** effective-flow-nodejs-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     8 |
| Open / Not implemented |     0 |

## Assumptions and open points

- Work package 4 establishes the one reusable workflow-integration seam.
- The field pilot optimizes implementation only; baseline, review, validation, and comparison keep
  their current assignments.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------- | --------- | ---- |
| Architecture    | 0        | 0         | 0    |
| Security        | 0        | 0         | 0    |
| Data protection | 0        | 0         | 0    |
| Error cases     | 0        | 0         | 0    |
| Testability     | 0        | 0         | 0    |
| Scope           | 0        | 0         | 0    |
| Maintainability | 0        | 0         | 0    |

### Findings

- **Important — resolved pre-existing-failure decision:** A reproducible failing Phase 2 reference
  with an exact comparator may proceed, but records `excluded(unknown-evidence) + quality` unless the
  shipped protocol explicitly admits it. Required validation remains unsuccessful while no-
  regression completion may still be successful; missing or worsened evidence blocks.
- **Important — resolved measurement-field decision:** Phase 2 owns comparator availability, Phase 5
  owns required validation status/counts, and Phase 6 owns comparison and completion. An unchanged
  pre-existing failure remains visible as unsuccessful validation even when no-regression completion
  succeeds.
- The review also incorporated post-baseline placement, pilot-baseline-versus-active behavior,
  persistent Fast consumption across regressions, Quality-only review incorporation, provisional-
  review lifecycle preservation, shared terminal record handling, and explicit semantic scenarios.

## Open points

- No open points.
