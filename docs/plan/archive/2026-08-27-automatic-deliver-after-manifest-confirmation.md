# Automatically Continue Deliver After Manifest Confirmation

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Planned against:** `2eda90b` on 2026-08-27

## Requirement

Keep `effective-flow deliver`'s explicit confirmation of the complete ordered file/state manifest,
because that confirmation defines the exact local changes the user authorizes for delivery. Once the
manifest is confirmed, remove the routine second approval of the proposed commit groups: derive the
complete ordered partition, show it as a non-blocking progress update, and continue automatically
through transfer, validation, sequential commits, and pull-request creation.

This is a Feature because it changes user-visible workflow behavior while preserving the selection
boundary, partition invariants, verification steps, and fail-closed abort behavior.

## Architecture decisions

- **The confirmed manifest remains the sole routine authority gate.** The complete ordered paths,
  states, and selection origins are still displayed and explicitly confirmed before branch,
  worktree, index, commit, remote, or forge mutation.
- **Manifest confirmation authorizes deterministic continuation.** After it is bound and reverified,
  `deliver` derives the ordered commit partition, reports the groups non-blockingly, validates the
  partition, and continues without another user question.
- **Automatic continuation does not weaken safety boundaries.** Groups remain coherent, complete,
  non-overlapping, and ordered, with an exact union equal to the confirmed manifest. Manifest drift
  requires redisplay and renewed manifest confirmation. An unresolvable grouping, transfer
  conflict, validation drift, hook failure, receipt mismatch, commit verification failure, or
  publication failure still stops at its existing boundary.
- **A derivation failure aborts instead of reopening an approval gate.** `deliver` does not guess a
  catch-all group, silently broaden the manifest, or ask the removed group-confirmation question as
  a fallback.
- **Runtime helper and leaf-tool responsibilities remain unchanged.** `delivery-selection`,
  `commit`, and `pr` keep their existing boundaries; the change is instruction-level orchestration.
- **Historical artifacts remain historical.** The archived plan that introduced the former
  two-confirmation design remains unchanged.

## Affected files

| File                                      | Description                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/deliver.md`                    | Makes manifest confirmation the sole routine approval and automatically derives, displays, validates, and processes commit groups. |
| `test/workflow-contracts.test.mjs`        | Guards the single ask, removed group gate, automatic ordering, exact partition, sequential failures, and final audit output.       |
| `docs/user-guide/tools-deliver.md`        | Documents automatic commit grouping and continuation after the manifest confirmation.                                              |
| `docs/user-guide/getting-started.md`      | Updates the local-change delivery recipe to describe the single routine approval.                                                  |
| `docs/developer-guide/architecture.md`    | Records the revised orchestration boundary and preserved safety contracts.                                                         |
| `docs/developer-guide/skill-ownership.md` | Keeps ownership unchanged while describing automatic grouping as Effective Flow orchestration after the sole manifest approval.    |

Explicitly unchanged: runtime helper scripts, `build.mjs`, `src/tools/commit.md`,
`src/tools/pr.md`, ownership JSON, generated `dist/`, archived historical plans, and unrelated
untracked plan files.

## Implementation details

### Approach

1. Revised `src/tools/deliver.md` so its manifest `ask` is the only routine approval and its
   affirmative response authorizes automatic grouping and delivery.
2. Replaced the commit-group `ask` and refinement loop with a non-blocking group display followed by
   exact complete/non-overlapping ordered-partition validation.
3. Kept ambiguity fail-closed before staging and preserved manifest-drift reconfirmation, transfer
   checks, sequential per-group commit verification, retained-state failure handling, delegated
   `commit` and `pr` boundaries, and final group/OID reporting.
4. Updated the existing contract test with positive and negative assertions instead of adding a
   duplicate test surface.
5. Synchronized the two user-guide and two developer-guide documents that described the former
   second approval. Root/index documentation, operations/runbooks, CLI help, and `AGENTS.md` were
   assessed and had no impact.
6. Built and inspected native Claude, native Codex, and portable artifacts to verify that the source
   contract survives generation unchanged.

### Edge cases

- Manifest drift still requires a newly displayed and confirmed manifest.
- Partially staged paths remain distinct manifest choices before confirmation.
- Multiple coherent topics produce several displayed ordered groups without another pause.
- Unresolvable grouping stops before staging with the unresolved decision identified.
- Later-group failures retain the worktree, branch, earlier verified commits, and remaining work;
  nothing is pushed and no pull request is created.
- Validation, transfer, hook, receipt, lifecycle, or publication failures retain their existing
  abort and recovery boundaries.
- Unrelated worktree changes remain outside the confirmed manifest and untouched.

## Acceptance criteria

- [x] `src/tools/deliver.md` contains exactly one routine `ask`: the exact ordered file/state
      manifest confirmation. The former commit-group question and refine option are absent.
- [x] An affirmative manifest response binds and reverifies the manifest, displays a complete
      ordered group partition, and continues automatically through delivery while checks succeed.
- [x] Every confirmed path belongs to exactly one derived group, groups run in displayed order, and
      final reporting retains the exact groups and created commit OIDs.
- [x] Manifest drift, grouping ambiguity, transfer, validation, commit, receipt, lifecycle, and
      publication failures continue to stop at their established boundaries.
- [x] Focused and full tests prove the single confirmation, automatic continuation, partition, and
      failure behavior, and all four current documentation surfaces describe the same contract.
- [x] All three generated targets satisfy the revised contract and the repository's complete
      CI-equivalent sequence passes.

## Validation plan

- Focused workflow-contract test for positive and negative single-gate assertions.
- Repository formatting gate, full unit suite, source-to-distribution build, and isolated
  distribution smoke suite in the order required by `AGENTS.md`.
- `git diff --check` and read-only inspection of all three generated `deliver` artifacts.
- Independent all-severity review of the exact source, test, and documentation diff.

## Test results

- Negative proof: the former focused assertion failed when it still required the removed second
  confirmation.
- `node --test test/workflow-contracts.test.mjs`: 167 passed, 0 failed.
- Final `pnpm agent:check`: 307 files correctly formatted.
- `pnpm test`: 745 passed, 0 failed, 0 skipped or cancelled.
- `node build.mjs`: Claude, Codex, and portable targets generated successfully.
- Generated-target inspection: each target contains exactly one manifest question, no retired
  commit-group question or refine text, and all automatic grouping, delegation, abort, and reporting
  clauses.
- `pnpm test:distribution`: offline distribution checks passed.
- `git diff --check`: no whitespace errors.

No live interactive commit/push/forge run was used as validation evidence; delivery is performed by
the workflow handback after these local checks.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

### Findings

- No findings.

## Review findings

**Date:** 2026-08-27
**Reviewer:** `effective-flow-code-validator`

No findings found.

## Open points

- No open points.
