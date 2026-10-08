# Prefer associated plans for next-step recommendations

**Plan status:** Implemented
**Source:** [Issue #540](https://github.com/sebastian-software/effective-flow/issues/540), [approved canonical planning comment](https://github.com/sebastian-software/effective-flow/issues/540#issuecomment-6055330239)
**Recommended workflow:** Feature

This completion record documents the approved issue implementation. The canonical issue comment remains the authoritative planning source.

## Requirement

Final recommendations follow the authoritative plan associated with the completed run and reconcile it with observed outcomes. The generic edge table supplies an applicable fallback. Recommendations remain read-only advice with existing readiness, approval, admission and suppression limits.

## Architecture decisions

- Keep selection in `src/shared/next-steps.md`; no production recommendation engine, tool, configuration key, dependency or runtime schema is added.
- Use explicit input or verified retained source links. Preserve complete authoritative issue reads and outcome context through handoffs without new delegation-envelope fields. Never select an unrelated plan by recency or title.
- Reconcile completed packages and delivery prerequisites before advancing. Completed or archived bases require reconciliation rather than renewed execution. Full cross-repository identity does not grant routing authority.
- Reuse the existing behavioral-eval scaffold and report channel. Eleven bounded cases each retain five fresh model sessions. Quantitative checks protect concrete choices, identities, authority and retained state; independent review assesses free explanations, purpose and German output.
- Disable Git automatic maintenance only for the fixture seed commit to prevent baseline-capture races. The optional internal `publicationRuntimeRoot` API places publication locks in the verified physical main checkout of the same repository; defaults, archive targets and caller write guards remain intact.

## Affected files

| File                                                                                                    | Description                                                                  |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/shared/next-steps.md`                                                                              | Associated-plan selection, reconciliation and safe generic fallback.         |
| `src/tools/merge-gate.md`, `apply.md`, `review.md`                                                      | Completion selectors apply only to generic fallback.                         |
| `src/tools/apply-plan.md`, `apply-issues.md`, `iterate.md`; shared observation and worktree integration | Retained source/outcome context and complete one-read issue observations.    |
| `build.mjs`, `test/workflow-contracts.test.mjs`                                                         | Measured context budget and integration/mirror invariants.                   |
| `docs/user-guide/`                                                                                      | Plan priority, prerequisites, fallback and observer-only reconciliation.     |
| `evals/next-steps/`, `test/next-steps-eval.test.mjs`                                                    | Bounded semantic suite, captured reports and sealed retained-state evidence. |
| `evals/_scaffold/`, `test/merge-gate-eval-round.test.mjs`                                               | Deterministic fixture seeding and verified publication runtime-root support. |
| `.github/workflows/ci.yml`, `AGENTS.md`, `docs/developer-guide/build-system.md`                         | Third-suite currency reporting and release gate.                             |

## Implementation details

The shared selector checks emission eligibility before optional bounded source reads. It maps the next applicable package to an existing exposed workflow with actual arguments, while delivery work, dependencies and approval boundaries take precedence. Missing or conflicting authority produces a concise limitation and an applicable fallback or silence.

The #37 regression recommends planning reconciliation of completed Q2a merges and preparation of Q2b. It grants no operational qualification, release-evidence or activation authority. Actual unfinished post-merge observation still permits observer-only re-entry; an intentionally open parent alone does not.

The generic table retains all 46 rows, its schema, tool-membership checks and user-guide mirror. All three distribution targets preserve returning-delegation suppression, hidden/provider boundaries, finding admission and the final chat-only block with at most two distinct options.

## Acceptance criteria

- [x] Associated authoritative plans precede generic edges and are reconciled with observed outcomes.
- [x] Explicit or verified association is required; unrelated, missing, unreadable and ambiguous context cannot become invented authority.
- [x] Ready packages use real tools and arguments; delivery, dependencies and approval boundaries lead when applicable.
- [x] Q2a/Q2b preparation, active local successors and completed/archive reconciliation behave as approved.
- [x] Observer re-entry requires actual unresolved reconciliation; completed work is not replayed.
- [x] Recommendation evidence preserves source identity, provider limits and read-only retained state.
- [x] Suppression, no-action/admission rules, concise German descriptions and final-block shape remain guarded.
- [x] Source contracts, handoffs, documentation, mirrors and semantic evidence agree.

## Test results

Required final source checks passed in order, each with exit 0:

1. `pnpm agent:check`: 752 files, no format errors.
2. `pnpm test`: 2,020 tests, 2,019 passed, one intentional archived-freshness skip, zero failures. A platform-specific filename subcase reported `EILSEQ`.
3. `node build.mjs`: three targets and all guards passed.
4. `pnpm test:distribution`: offline smoke passed.

Final published-artifact checks passed: `node --test test/next-steps-eval.test.mjs` (23/23), `pnpm agent:check` (863 files), and strict `next-steps` verification (all eleven scenarios current, 5/5 each). The 55 archived runs retain 275 byte-identical evidence files and 55 bound metadata files. Before/after checks found no validation-generated source or evidence changes.

Fresh recording used Codex CLI 0.159.3, `gpt-6.1-sol`, high reasoning, separate isolated nonforked sessions rooted in prepared projects, and only the rendered prompt. All 55 completed naturally with exit 0. Independent review read every complete original report and verified purpose, limitations, readiness, approvals, source identity and German output. All sealed before/after states were identical; six local read-only parser calls made no remote, probe or mutation calls.

Evidence is archived under `evals/next-steps/results/`, generation `902a32bf-edfb-480a-8c09-64889ed0b0e5`. The instrument is `sha256:58c6cb31c68deeef64f1dba76f4dfcab5f5b32e26933499118dec92cf6b5171c`. The evaluator and publication coordinator are deliberately outside model-instrument membership; their bounded corrections preserved the current round's inputs and sealed evidence.

The suite observes completed-run recommendation snapshots, not whole workflow execution. State snapshots prove retained differences, not transient writes that were fully rolled back. Existing `merge-gate` and `iterate` evidence remains stale (six scenarios × five runs each) and must be re-recorded before release; that currency debt is not a merge prerequisite.

## Review findings

**Date:** 2026-10-08
**Reviewer:** Independent technical and content validation; documentation delta independently checked by the receiving workflow.

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    10 |
| Open / Not implemented |     0 |

| Severity  | Count | Fixed | Open |
| --------- | ----: | ----: | ---: |
| Critical  |     0 |     0 |    0 |
| Important |     9 |     9 |    0 |
| Note      |     1 |     1 |    0 |

| Complexity | Count |
| ---------- | ----: |
| Low        |     8 |
| Medium     |     2 |
| High       |     0 |

Corrections resolved evidence formatting, exact path/reference handling, valid final-block forms, bounded authority checks, deterministic fixture preparation and overly restrictive prose grading. No current-scope findings or admitted residuals remain.

## Assumptions and open points

- No open points.
