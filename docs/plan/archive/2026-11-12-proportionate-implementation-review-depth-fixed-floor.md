# Proportionate implementation review depth with a fixed floor (package B)

**Plan status:** Implemented
**Source:** sebastian-software/effective-flow #650 (planning comment)
**Recommended workflow:** Feature (`effective-flow build`)

## Package scope

This plan file records the build of package (B), implementation, from the approved planning comment
on #650: requirement points 1 to 3 and the implementation half of point 5, in `build`, `fix` and
`refactor`, plus the diff-baseline helper. Package (A), planning (point 4 and the planning half of
point 1, in `plan` and `plan-issue`), is delivered separately and is not part of this build. The
approved planning text follows unchanged.

## Requirement

Make review depth and re-review scope explicit and proportionate in the planning and implementation workflows, and keep a fixed floor of full independent review at consequential boundaries. On 2026-11-12 the maintainer confirmed the issue is relevant and narrowed its scope as follows. Requirement points 1 and 2 cover Done-when items 1 and 2. Point 3 (floor) and point 4 (batching) come from the requested outcome. The last acceptance criterion covers Done-when items 4 and 5.

1. **Default coverage and implementation triggers.**
   - Planning: gap analysis (Phase 4), validation (Phase 5) and the internal plan review (Phase 6) are mandatory. In interactive runs the deep review (Phase 6b, `plan-review`) is user-requested depth only. Unattended runs keep the P-DPR site unchanged.
   - Implementation: the routed reviewers run, followed by exactly one incorporation pass. This sharpens the existing "re-run the affected review checks once" without replacing it.
   - Implementation triggers for a full pass after a correction:
     - (a) the correction changed a file that no corrected finding named;
     - (b) the correction touched a floor boundary from point 3;
     - (c) the scoped re-check cannot confirm a corrected finding as resolved;
     - (d) the correction changed a recorded assumption, an acceptance criterion, an architecture decision or public behavior.
   - A triggered full pass runs the routed reviewers of the triggering paths on those paths, with the cumulative diff as context. The triggering paths are: for (a) the unnamed files, for (b) the floor-hit files, for (c) the files of the unconfirmed finding, and for (d) the files that carry the changed contract or behavior. It never repeats the whole review.
   - Without a trigger, the scoped re-check verifies each corrected finding and reports any defect the correction introduced inside the changed areas. A finding outside the changed areas must name the trigger or floor boundary that justifies it.
   - An `uncertain` residual keeps its existing bounded evidence check and its stop or block. It starts no extra pass.
2. **Scoped re-review and delta.** The re-check reports three things: the changed areas, the findings it verified, and the evidence still open.
   - The orchestrator retains the `currentTree` of the render that fed the first review as `reviewTree`. After the incorporation pass it runs the normal cumulative render first, then a delta render with `sinceTree: reviewTree`.
   - A `sinceTree` render writes separate delta files (patch and path list) and returns their paths. It never replaces `diff.patch` or `paths.json`, and it applies `scope` the same way as the cumulative render.
   - The helper accepts `sinceTree` only if it equals a `currentTree` that an earlier render of the same handle recorded. Otherwise it fails with `INVALID_INPUT`.
   - If the review-input tree is unavailable, there is no scoped path. Every affected routed reviewer runs a full pass on the cumulative path list, and the reason is recorded. A failed render stops the step, as `diff-baseline` already requires.
   - `build` and `refactor` run the scoped re-check with their routed reviewers.
   - `fix` starts no reviewer re-check without a floor hit or trigger. The orchestrator writes the three-part report itself, from the delta render, the corrected findings with their evidence, and the open evidence. A floor hit or trigger starts `generic-product-reviewer` with its reduced-depth notice.
   - In a delegated `build`, the `independent-review` receipt is issued after the scoped re-check and any floor pass, and binds the post-incorporation content.
3. **Fixed floor (boundary list).** The floor applies to every correction that no later review covers: the incorporation pass, plus the `build` Phase 6 step 3 `current-scope` corrections and containments.
   - Before such a correction is accepted, the orchestrator classifies each changed path from its path and its hunks in the delta patch. Per path it records the boundary hit, `none`, or `uncertain`. An uncertain classification counts as a hit (fail closed).
   - The record goes into the review results: `build-delegated-run` Phase 6 step 5, the `fix` Phase 4 report, `refactor` Phase 4 step 3.
   - The list:
     - security, authentication and authorization;
     - secrets and credentials;
     - data protection and personal data;
     - persistence, schema and migrations;
     - destructive or irreversible data operations;
     - money and billing;
     - public API and cross-module contracts;
     - dependency manifests and lockfiles;
     - CI, release and delivery configuration.
   - On a hit in `build` or `refactor`, the bucket's routed reviewer runs a full pass on the affected files; tooling or CI paths get `generic-product-reviewer`. In `fix`, every hit starts `generic-product-reviewer` with its reduced-depth notice.
4. **Batched planning questions and the planning ladder.**
   - In `plan`, Phase 4 incorporates directly resolvable gaps and defers its decision-requiring points. Deferred points are written into the open-points section of the artifact, marked as pending the batch.
   - Phase 5 decision needs join the same batch. Only the Phase 5 prose (`plan.md` about line 482) accepts points pending the batch; the `plan-lint` script is unchanged.
   - Phase 6 receives the deferred points as known open points and does not report them again as new findings.
   - After Phase 6, all pending points reach the user in one round, before completion and before the deep review is offered. The round uses the `plan-review` Phase 3 decision format. Consecutive ask calls with no analysis in between count as one round when the host caps the number of questions per call.
   - Planning ladder after the answers are worked in:
     - no trigger: no new judgment, the incorporation is only recorded;
     - (a) changed an unnamed section, (c) a point could not be confirmed as resolved, or (d) an answer changed an assumption, criterion or decision: a scoped Phase 6 judgment of the changed sections;
     - (b) an answer changed a section that names a floor topic: a full Phase 6 judgment.
   - A new decision-requiring finding from that judgment becomes an open point without a new round. Only a new Critical finding opens a second round. An unanswered point or "Decide later" becomes an open point.
   - A Phase 4 gap that Phase 6 classifies as Critical stays in the batch, and completion stays blocked until it is decided.
   - `plan-issue` Phase 3 maps step 1 to Phase 4, step 2 to Phase 5 and step 3 to Phase 6. It gains one batched ask between steps 3 and 4, with no tracker write before Phase 4. Unanswered points become open points that feed step 6. `plan-issue` is outside the unattended closure, so it needs no inventory entry.
5. **Packages and fragments (no child issues).**
   - Package (A), planning, covers point 4 and the planning half of point 1, in `plan` and `plan-issue`.
   - Package (B), implementation, covers points 1 to 3, in `build`, `fix` and `refactor`, plus the helper.
   - Two shared fragments, each loaded through `lazy-include`:
     - an implementation review-depth rule (coverage, triggers, floor list), loaded by `build-delegated-run`, `fix` and `refactor`;
     - a planning-batch rule (planning coverage, deferral, batch, planning ladder), loaded by `plan` and `plan-issue`. It loads the implementation rule only at its post-answer trigger check, so the triggers and the floor list stay defined once.

**Out of scope:**

- Reusing settled decisions and reopening them on changed evidence: owned by #476 (decision log) and #478 (frozen intent).
- Reuse of earlier results by a repeated `plan-review` run: owned by #476.
- How questions are worded and how many go into one turn: owned by #495. This issue fixes only when the round happens.
- `maintain`: its one-time incorporation pass is unchanged.
- The triviality exception in the delegation mandate: unchanged. It waives delegation, never a review step.

## Outcome checkpoint

**Primary source:** sebastian-software/effective-flow#650 (child of #653)
**Original outcome:** Proportionate review depth, scoped re-review with a fixed floor of full independent review at consequential boundaries, and one batched planning question round, without removing mandatory reviews.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** none yet
**Continuation decision:** none

## Acceptance criteria

- [ ] Two shared fragments (implementation review depth, planning batch) are loaded through `lazy-include` with `when:` conditions and never copied. The planning fragment loads the implementation fragment only at its trigger check. The repository build, including the context-budget check, and the test suite pass.
- [ ] In interactive runs, `plan` and `plan-issue` label the deep review as user-requested depth. Unattended P-DPR behavior is unchanged.
- [ ] Every re-check after an incorporation pass reports the changed areas (from the delta render), the verified findings and the open evidence. Every finding outside the changed areas names its trigger or floor boundary.
- [ ] A triggered full pass covers only the triggering paths, as defined for (a) to (d). An `uncertain` residual starts no extra pass and keeps its stop or block.
- [ ] Delta render:
  - `render` with `sinceTree` writes separate delta files and leaves `diff.patch` and `paths.json` unchanged (helper test).
  - A foreign tree or a tree from another handle fails with `INVALID_INPUT`, and an equal tree yields an empty delta (helper tests).
  - Without `sinceTree`, `render` output is unchanged.
- [ ] If the review-input tree is unavailable, the run falls back to a full pass on the cumulative path list and records the reason.
- [ ] Floor coverage:
  - Every correction that no later review covers is classified per path (hit, `none` or `uncertain`) from path and hunks, and the record appears in the review results.
  - The incorporation pass and the `build` Phase 6 step 3 corrections and containments are covered.
  - A hit or `uncertain` starts the full pass defined in requirement point 3.
- [ ] `fix` starts no reviewer re-check without a floor hit or trigger, and the orchestrator writes the three-part report.
- [ ] In a delegated `build`, the `independent-review` receipt is issued after the scoped re-check and any floor pass.
- [ ] Batching in `plan`:
  - Decision points from Phases 4, 5 and 6 reach the user in one round after Phase 6, as open points marked pending the batch.
  - The planning ladder (no judgment, scoped Phase 6, or full Phase 6) is applied as specified.
  - Directly resolvable gaps are incorporated without asking.
- [ ] `plan-issue` Phase 3 has one batched ask between steps 3 and 4, with no tracker write before Phase 4.
- [ ] Unattended: P-VAL and P-CRT are remapped together with the new batch site in `unattended-planning.md` and in the `QUESTION_INVENTORY` test. In unattended runs every deferred point becomes a blocking open point before P-DPR.
- [ ] Contract tests pin the rule text: triggers, floor list, `fix` behavior, batching sites, planning ladder and deep-review labelling.
- [ ] `pnpm eval <tool> verify` runs for every suite whose seeds reach the changed fragments (at least `build-context`; check `iterate` and `merge-gate`). Stale rounds, including `build-context` `review-correction`, are re-recorded before the next release.
- [ ] One manual paired run before and after, on the same host and model:
  - Example 1: a small reversible change through `plan`, then `build`. It records ask rounds and reviewer starts after the incorporation pass, and shows fewer of them.
  - Example 2: `build` or `fix` with a review finding whose correction touches a floor path, seeded if needed. It records whether the floor fired, the classification record, and which reviewer ran the full pass.
  - Counts go into the PR. No savings are inferred from finding counts.

## Affected areas/files

- `src/shared/` - two new fragments: implementation review depth (coverage, triggers, floor list) and planning batch (deferral, batch, planning ladder). Names chosen during implementation.
- `src/tools/plan.md` - Phases 4, 5, 6 and 6b: defer into open points, batch after Phase 6, apply the planning ladder; label 6b as user-requested depth in interactive runs.
- `src/tools/plan-issue.md` - Phase 3: one batched ask between steps 3 and 4.
- `src/shared/build-delegated-run.md` (incorporation pass, about lines 237-246; Phase 6 steps 3 and 5) - scoped re-check, delta render, floor on later corrections, receipt order.
- `src/shared/build-run-contract.md` (about lines 58-62) - receipt issued after the scoped re-check and floor pass.
- `src/tools/fix.md` (about lines 258-269) - orchestrator three-part report; `generic-product-reviewer` on a floor hit or trigger.
- `src/tools/refactor.md` (about lines 299-305) - scoped re-check and floor.
- `src/shared/diff-baseline.md` and `src/scripts/diff-baseline-core.mjs` with tests - `sinceTree`, separate delta files, validation.
- `src/shared/unattended-planning.md` - remap P-VAL and P-CRT, add the batch site.
- `test/unattended-planning-contract.test.mjs` - `QUESTION_INVENTORY` update.
- Contract tests for the new rule text.
- `evals/` - verify affected suites and re-record stale rounds, including `build-context` `review-correction`.
- `docs/user-guide/tools-understand.md` - planning flow.
- `docs/user-guide/tools-implement.md` - review incorporation in `build`, `fix` and `refactor`.
- `docs/developer-guide/architecture.md` (about line 868) - render contract with delta files.

## Edge cases

- A correction touches a floor boundary and unrelated files: full pass on the floor-affected files, scoped check elsewhere.
- No incorporation pass happened because there were no findings: no re-check runs.
- The review-input tree is unavailable: full pass on the cumulative path list with a recorded reason. A failed render stops the step.
- A `sinceTree` equals the current tree: empty delta, so only the corrected findings are confirmed.
- An auth check is edited in a generic path such as `utils/`: the hunk-based classification records a hit or `uncertain`, never a silent `none`.
- Unattended planning run: no batch is asked; every deferred point becomes a blocking open point before P-DPR.
- The batched answers touch a section that names a floor topic: a full Phase 6 judgment.
- The user explicitly requests a full re-review or the deep review: honored as user-requested depth.

## Assumptions

- #476 and #478 may land before or after this issue. Packages A and B do not depend on them.
- The evidence in the issue body comes from one retrospective. It motivates the change, and no rule encodes it.
- The floor list is fixed for this issue. Changing it later is a deliberate rule change, not a per-run reviewer judgment.
- In `fix`, corrected findings outside the floor are confirmed by the orchestrator, not independently. This trade-off was accepted for small fixes.

## Plan review

**Result:** Approved

The deep interactive review ran on 2026-11-12 after an earlier gap analysis and internal plan review. The earlier round had 13 Important findings and 6 Notes, and all were incorporated or decided. The table and findings below cover the deep review.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         5 |    1 |
| Security        |        0 |         3 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    1 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         1 |    3 |
| Maintainability |        0 |         1 |    2 |

### Findings

- **Important (Architecture), incorporated:** a `sinceTree` render would have overwritten the cumulative files, and the "previous render" was undefined. Now the first review fixes `reviewTree`, and the delta render writes separate files.
- **Important (Architecture), incorporated:** trigger (c) fired after the re-check had already run. Redefined as "the re-check cannot confirm a corrected finding"; `uncertain` residuals keep their stop or block. This corrects the earlier note.
- **Important (Architecture), incorporated:** the scope of a triggered full pass was undefined. It now covers only the triggering paths for each trigger.
- **Important (Architecture), decided:** the planning and implementation ladders were inverted, and (b) had no meaning in planning. Now there is a separate planning ladder with (b) redefined as a floor topic in a section.
- **Important (Architecture), incorporated:** a partial `lazy-include` cannot be built. Split into two fragments.
- **Important (Security), incorporated:** `sinceTree` was unvalidated. It now accepts only an earlier recorded `currentTree` of the same handle.
- **Important (Security), decided:** `build` Phase 6 step 3 corrections went unreviewed. The floor now covers every correction that no later review covers.
- **Important (Security), incorporated:** a path-only classification could miss a boundary. Classification now uses path plus hunks, and the record goes into the review results.
- **Important (Error cases), incorporated:** the fallback without a previous render was fail-open. It now falls back to a full pass on the cumulative path list.
- **Important (Testability), incorporated:** the paired-run examples named no tool, and example 2 could pass vacuously. Now `plan` then `build`, and a seeded floor-path correction.
- **Important (Scope), decided:** `fix` has no re-check today. Now the orchestrator writes the report, and reviewers start only on a floor hit or trigger.
- **Important (Maintainability), incorporated:** new `lazy-include` fences invalidate archived eval rounds. Added verify and re-record of the affected suites.
- **Note (Scope), incorporated:** `plan-issue` Phase 3 has no question site today. The batched ask and the phase mapping are now specified.
- **Note (Testability), incorporated:** the frozen P-VAL and P-CRT lines need remapping too. Added.
- **Note (Maintainability), incorporated:** deferred points needed a home in the artifact. They now go into open points marked as pending the batch; `plan-lint` is unchanged.
- **Note (Scope), incorporated:** Phase 4 has no severity of its own. Now Phase 6 classifies the gap as Critical.
- **Note (Error cases), incorporated:** new decision-requiring findings after the batch now become open points without a new round.
- **Note (Scope), incorporated:** the `fix` floor wording was inaccurate. It now names `generic-product-reviewer` with its reduced-depth notice.
- **Note (Maintainability), incorporated:** `tools-implement.md` and the render contract in `architecture.md` were missing. Added.
- **Note (Architecture), incorporated:** the order of the delegated-build `independent-review` receipt was unspecified. It is now issued after the scoped re-check and any floor pass.

## Open points

- No open points.

## Build completion

Implemented package (B) on `effective-flow/build/review-depth-floor-650` (base `origin/develop` acc04830). Package (A) is delivered separately.

- **New fragment `src/shared/review-depth.md`** is the single owner of default coverage, the re-check order (cumulative render, delta render, floor classification, scoped re-check, full pass only where a trigger or floor hit widens it), triggers (a) to (d) with their triggering paths, the scoped re-check and its three-part report, the admission-`uncertain` residual rule, the per-path floor classification from path and hunks (a floor classification of `uncertain` counts as a hit) and the fixed nine-item floor list. A delta render refused after a successful cumulative render is a failed render; only a missing `reviewTree` selects the full-pass fallback with a recorded reason.
- **Load sites** (`lazy-include`, never copied):
  - `src/shared/build-delegated-run.md`: `when: Phase 6 aggregates review findings for the incorporation pass, or a step 3 correction or containment is about to be accepted`. Step 1 retains `reviewTree`; tooling or CI floor hits go to `generic-product-reviewer`; step 3 corrections and containments are classified against the floor; step 5 carries the classification record and the re-check report.
  - `src/tools/fix.md`: `when: Phase 4 aggregates findings for the incorporation pass`. No reviewer re-check without a floor hit or trigger; the orchestrator writes the three-part report; a hit or trigger starts `generic-product-reviewer` with its reduced-depth notice on the triggering paths.
  - `src/tools/refactor.md`: `when: Phase 4 aggregates review findings for the incorporation pass`. Scoped re-check by the routed reviewers plus the floor; the record goes into Phase 4 step 3.
- **`src/shared/build-run-contract.md`:** `independent-review` is issued after the Phase 6 scoped re-check and every floor pass, including those for step 3 corrections and containments, bound to the content Phase 6 leaves after its last accepted correction.
- **Diff-baseline helper:** `render` accepts an optional `sinceTree`. Every render records its `currentTree` in `rendered-trees.json` (at most 256 distinct trees, oldest evicted). A `sinceTree` not recorded by an earlier render of the same handle fails with `INVALID_INPUT`. A `sinceTree` render writes only `delta.patch` and `delta-paths.json`, returns `deltaDiffPath`, `deltaPathsPath`, `currentTree` and `deltaEntries`, applies `scope` like the cumulative render and never touches `diff.patch` or `paths.json`. Output without `sinceTree` is unchanged apart from the recorded tree.
- **Docs:** `docs/user-guide/tools-implement.md`, `docs/developer-guide/architecture.md` (render contract and delta render), `docs/developer-guide/build-system.md` (lazy fragment list, runtime scripts).
- **Context budgets:** `fix` 562, `refactor` 970.

### Test results

Final validation in CI order through the project runner, in a container-local copy with a shallow Git directory:

| Check                    | Result                                                |
| ------------------------ | ----------------------------------------------------- |
| `pnpm agent:check`       | exit 0                                                |
| `pnpm test`              | 5121 tests: 5092 passed, 2 failed, 27 skipped         |
| `node build.mjs`         | exit 0 (build 215/215, fix 562/562, refactor 970/970) |
| `pnpm test:distribution` | exit 0                                                |

Neither failure is caused by this change. `execution-profile-rendering` needs commit 6055c94, which the shallow copy lacks. The `host-driver` six-worker recovery test fails identically on the unchanged base.

New tests: the delta-render helper tests in `test/diff-baseline-git.test.mjs` and `test/diff-baseline.test.mjs`, and the rule-text contract tests in `test/review-depth-contract.test.mjs`.

Behavioural evals: `pnpm eval <suite> verify --mode report` exits 0 with no integrity blockers for all five suites. Of the suites, only `build-context` changes its candidate basis with this change. That covers six scenarios, `review-correction` among them. None has archived runs, so no recorded round became stale, but all six must be recorded before the next release. The `merge-gate`, `iterate`, `next-steps` and `focus` bases are unchanged by this change, and their existing staleness predates it.

The manual paired before/after run in the acceptance criteria is still pending.

## Review findings

**Date:** 2026-11-12
**Reviewer:** nodejs-reviewer (deep), first review and one scoped re-check

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     9 |
| Open / Not implemented |     0 |

There was 1 Important finding and 8 Notes, none Critical, and all were within the authorized slice. The re-check after the incorporation pass confirmed every corrected finding. Its floor classification marked `review-depth.md` and `build-run-contract.md` as hits and `build.mjs` as uncertain, and the full pass on those three paths found no defect. It raised one formatting Note, which was corrected as a current-scope item and classified `none` against the floor.
