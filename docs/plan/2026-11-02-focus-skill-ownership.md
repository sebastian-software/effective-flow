# Focus skill ownership

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Documentation (`effective-flow docs`)
**Doc category:** developer-guide
**Target path:** docs/developer-guide/skill-ownership.md

## Requirement

Complete work package 3 of [the focus concept](../concept/2026-11-02-focus-session-check.md): classify the new `focus` tool's relationship with `effective-delivery` and record it in the ownership manifest and developer guide. The resulting records must pass the existing ownership guards. This is documentation and ownership metadata work; the focus tool itself belongs to concept work package 4.

The ownership decision is `route-when-relevant`. Effective Flow owns the trajectory verdicts and session orchestration. `effective-delivery` owns reusable repository-audit reasoning when that expertise is relevant to the observed session. This preserves the central skill's authority over its domain without transferring focus's product-specific rubric.

## Verified context

Planned on 2026-11-02 at HEAD `893d8770`, on `develop`. The source concept is untracked user work; it was read as the requirement basis and must be preserved. The two ownership targets have no local changes at planning time.

- `docs/developer-guide/skill-ownership.json` uses schema version 1 and per-consumer classifications within each skill's `relationships` entry.
- `docs/developer-guide/skill-ownership.md` defines the three classifications and groups their consumers and coverage in a marker-delimited inventory table. The build reconciles row membership by skill; explanatory consumer and classification prose still needs manual consistency review.
- `src/tools/retro.md` provides the neighboring session-analysis precedent: central audit reasoning with Flow-owned source admission and lifecycle. Its `delegate` classification does not determine focus's classification.
- `src/tools/focus.md` is absent. `assertSkillOwnershipContract` in `build-lib.mjs` rejects unknown consumers and checks recommendation reachability. The checked-in ownership case in `test/build-lib.test.mjs` exercises the repository's live manifest, guide, and source recommendations.
- The concept permits either `delegate` or `route-when-relevant` after assessment, and explicitly identifies the trajectory rubric as Flow-specific. Package 3's decision can be prepared independently of host verification and the ADR.

## Architecture decisions

- Use `route-when-relevant`: focus is primarily an orchestration judgment about goal progress, loops, fan-out, and stalls. Route repository-audit questions to `effective-delivery`; do not copy its reusable audit or prioritization playbook into Flow sources.
- Effective Flow retains goal anchoring, verdict vocabulary, observed versus self-report evidence, coverage limits, target admission, identity checks, delegation, confirmations, and cross-session message lifecycle. These are scope boundaries to explain, not a second rubric to reproduce in the guide.
- Keep the existing manifest schema, table markers, relevance-gate owner records, and guard behavior. `focus` needs one consumer relationship, not a new named worker or a new owner.
- Separate decision readiness from integration readiness. The decision in this plan is available to package 4 immediately. Final manifest/table edits must land with or after a complete, registered `focus` source that recommends `effective-delivery`. Adding the consumer before the source exists fails the guard. Package 4 depends on this decision, not on an independently merged metadata change; this avoids a circular dependency.

## Affected files

| File                                        | Description                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `docs/developer-guide/skill-ownership.json` | Add exactly one `focus` consumer classified `route-when-relevant` to the existing `effective-delivery` relationship.       |
| `docs/developer-guide/skill-ownership.md`   | Add `focus` to the delivery row's route-when-relevant group and explain the audit-versus-orchestration ownership boundary. |

`src/tools/focus.md` and its build registrations are read-only prerequisites for this package, implemented by concept package 4. Source creation, host capability verification, the messaging ADR, eval infrastructure, and behavioral evidence are outside this plan's write scope. Do not create a placeholder tool to satisfy the consumer guard.

## Implementation details

### Approach

1. Recheck the two targets, the concept, the current focus source, and the central skill's declared scope for drift. Preserve unrelated working-tree changes. If scope or rubric ownership changed materially, revise this plan before applying metadata changes.
2. Confirm the package 4 integration prerequisite: `src/tools/focus.md` exists as the real tool, has the normal build registrations, recommends `effective-delivery`, and states the domain split consistent with this plan. If it is absent, hand this decision to package 4 and defer the two target edits. Do not weaken the guard or broaden this documentation task into tool implementation.
3. Add the `focus` relationship to the existing `effective-delivery` consumer list, preserving other relationships, provenance, allowlists, and relevance-gate owner declarations. This local consumer check is not an upstream collection audit and must not refresh collection-wide provenance.
4. Update the existing delivery row between the table markers. Name `focus` in the appropriate consumer group and classification prose. Explain that delivery owns relevant reusable audit/evidence/prioritization judgment while Flow owns the trajectory rubric and session lifecycle. Preserve the existing `retro` boundary and all other classifications.
5. Format the two changed files, run the existing checks, and review the final diff for agreement among manifest, guide, and focus recommendations. No new test is needed for this low-impact record addition: existing ownership guards already cover its structural invariants.

### Edge cases

- A focus implementation already introduced the correct relationship: reconcile only missing or inconsistent prose; do not duplicate the consumer.
- A focus source is present but recommends a different owner or transfers the whole rubric: stop and reconcile with the package 4 owner before publishing contradictory records.
- Unrelated checks already fail: record their baseline and attribution. Do not fix unrelated source or tests under this documentation scope, and do not claim the acceptance criteria passed.

## Acceptance criteria

- [ ] The `effective-delivery` relationship contains exactly one `focus` consumer with classification `route-when-relevant`.
- [ ] The guide's delivery row explicitly includes `focus` in the route-when-relevant group and explains the same ownership boundary.
- [ ] The actual focus source recommends `effective-delivery` and respects this boundary; this is verified as package 4 integration evidence, not implemented here.
- [ ] Existing schema, provenance, relevance-gate declarations, other consumer classifications, and `retro` semantics are preserved.
- [ ] Ownership contract tests and the build accept the records without unknown-consumer or unreachable-recommendation errors; the required repository checks pass.
- [ ] The implementation diff for this package is confined to the two ownership artifacts, apart from normal plan lifecycle updates. The source concept remains untouched.

## Validation plan

Run from the repository root after the integration prerequisite is met:

1. Format only the targets with `pnpm exec oxfmt docs/developer-guide/skill-ownership.json docs/developer-guide/skill-ownership.md`.
2. Run the repository's required order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, then `pnpm test:distribution`. Expect successful exits, including the existing checked-in ownership contract test and build reconciliation. Generated `dist/` output is never edited or committed.
3. Manually compare the delivery manifest entry, inventory consumer/classification prose, and focus recommendation. The table guard checks skill row membership, so a green build alone cannot establish prose consistency or the correctness of the domain split.
4. Review the scoped diff and repository status. Confirm the two ownership artifacts are the only implementation changes attributable to this package and user work is preserved.

The optional upstream `audit:skill-ownership` audit is not required for a local consumer addition. Host checks and focus behavioral eval recordings remain package 4 and package 6 responsibilities. This plan run performs only plan formatting and plan lint, not implementation validation.

## Assumptions and open points

- The concept's approved focus rubric remains the package 4 implementation basis. Re-read it if the concept changes before execution.
- Integration readiness depends on package 4's real source and recommendations. This is a known prerequisite, not an unresolved ownership decision. The independent ownership decision is ready for that package now.

## Plan review

**Result:** Approved

### Summary

Reviewed against the concept, live ownership schema and guard, retro precedent, and the `effective-delivery` plan discipline. The two-file scope is sufficient once the focus source exists. The prerequisite prevents an invalid manifest and resolves the concept's apparent package-order cycle without a stub or guard exception.

### Findings

- Important, sequencing: package 3 cannot pass ownership validation before the package 4 consumer exists. Incorporated an explicit integration prerequisite and distinguished the prior decision from the final record edits.
- Note, verification: the inventory guard reconciles skill rows rather than every consumer named in prose. Incorporated manual consumer/classification and boundary comparison alongside existing automated checks.
- No unresolved critical or important findings. All scorecard criteria pass: concrete scope, measurable acceptance, verified context, purpose, plan-only writes, no implementation code, justified workflow, and matching documentation target.

### Deep interactive review — 2026-11-02

**Result:** Approved

A separate read-only judgment using `effective-delivery` checked this persisted plan against the current concept and package 4 prerequisites, ownership manifest and guide, retro precedent, absent focus source, build guards, existing tests, validation commands, and recommendation/fallback boundary. It reported no additional findings or decision-requiring points.

| Area            | Critical | Important | Note |
| --------------- | -------- | --------- | ---- |
| Architecture    | 0        | 0         | 0    |
| Security        | 0        | 0         | 0    |
| Data protection | 0        | 0         | 0    |
| Error cases     | 0        | 0         | 0    |
| Testability     | 0        | 0         | 0    |
| Scope           | 0        | 0         | 0    |
| Maintainability | 0        | 0         | 0    |

The ownership decision is ready for package 4. Applying the two ownership-record edits remains conditional on the real focus source and recommendation being present. Implementation tests and the build were inspected as validation paths, not executed by this review.

## Open points

- No open points.
