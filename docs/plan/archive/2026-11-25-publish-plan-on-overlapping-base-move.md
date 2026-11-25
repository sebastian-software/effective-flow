# Publish the plan when a base move overlaps it

**Plan status:** Implemented
**Source:** maintainer requirement on draft PR #735 (issue #734)
**Recommended workflow:** Feature (`effective-flow build`) on branch `effective-flow/plan/issue-734`

## Goal

A base move that overlaps the plan or cannot be decided no longer stops the Issue Buddy pass or
the autopilot run. Issue Buddy makes its single assessed re-publish on the assessed tip anyway and
the plan PR body carries a fixed, visible "unresolved base move" flag; autopilot records the move
and continues to build and its draft PR, whose appendix states that the overlap is unresolved and
left to review. Integrity failures and duplicate-plan evidence keep stopping.

Maintainer requirement (translated): "Even if there are conflicts that cannot be resolved
directly, publish the PR. Then it is the reviewer's or another instance's job to make the PR
mergeable again."

## Context

Baseline: PR #735 head `2b21bd15` on base `origin/develop` `741fd348`. Today:

- `plan-publication assess-base-move` returns `{state: "assessed", fromBaseOid, toBaseOid,
verdict, reason, commitCount, changedPathCount, citedPathCount, citedPaths, overlappingPaths}`;
  `assessBaseMove` decides in the order `undecidable` (`not-ancestor`, `gitlink`,
  `no-affected-files`, `unusable-entry`, `plan-identity`), `overlap` (`same-issue-plan`,
  `cited-path`), `fits`.
- `src/shared/issue-buddy-base-move.md` item 4: `overlap`/`undecidable` stops with the null
  failure `{issue: null, stage: "publish", code: "BASE_CHANGED"}`.
- `issue-buddy-core.mjs` `baseMoveOutcomes` binds every non-`fits` entry to that stopped pass.
- `autopilot-issue-source.md` records only a `fits` entry beside a confirmed PR;
  `autopilot-core.mjs` `base-move-record` has no verdict, reason or overlapping paths, and the
  appendix copy says "No changed path overlaps".
- `publish` builds the body as caller prose + marker line + `Refs #<N>`; it binds
  `expectedBaseOid` exactly and refuses a base that already tracks the plan path.
- `plan-pr-continuation` rewrites the plan PR body at its finish; autopilot's appendix is the
  durable flag on the delivered PR.
- A plan-only PR adds one new file, so a base move never yields a textual Git conflict; the
  overlap is semantic (the plan cites files that changed) and only review can reconcile it.

## Scope

In scope: the base-move path of PR #735 — the assess envelope, `publish`'s body, the Issue Buddy
fragment and Phase 5/6 text, the pass-report validator, autopilot's issue-source mapping,
`base-move-record`, the appendix, run-close/Phase 6 report, the three ADRs, the developer guide
lines that name these operations, and their tests.

Out of scope: `complete-branch` and orphan recovery (keep the strict collected-base binding);
automatic reconciliation by `merge-gate`/`iterate` (they read the flag as text; no new parser);
carrying the plan PR flag through `plan-pr-continuation`'s body rewrite; the archived #734 plan;
any change to the verdict algorithm or its reason enum; unrelated refactors.

## Decisions

1. **Publishable versus stopping reasons.** Every `fits` move and the reasons `cited-path`,
   `gitlink`, `no-affected-files` and `unusable-entry` re-publish. `not-ancestor` (base history
   rewritten or `fromBaseOid` gone: integrity, like `BASE_REWRITTEN`), `same-issue-plan` and
   `plan-identity` (the base already holds, or may hold, a plan of this issue: a duplicate, not a
   conflict a reviewer makes mergeable) keep stopping exactly as today.
2. **One deterministic source for that split.** `plan-publication-core.mjs` exports
   `BASE_MOVE_STOPPING_REASONS = ['not-ancestor', 'same-issue-plan', 'plan-identity']` and the
   assess envelope gains `republish: boolean` derived from it. The `baseMoves` entry keeps its
   ten keys; validators derive the split from `reason` via the constant, not from a copied field.
3. **The flag is rendered by `publish`, not composed by the model.** `publish` takes an optional
   `baseMove: {fromBaseOid, toBaseOid, verdict, reason, commitCount, overlappingPaths}`, accepted
   only with a publishable non-`fits` verdict, `toBaseOid === expectedBaseOid` and at most 20
   reportable paths. It inserts one fixed English paragraph between the caller prose and the
   marker tail. `fits` passes no `baseMove`, so its body is unchanged. `complete-branch` refuses
   the key (closed schema).
4. **Fixed English flag text** (English only, a stable string reviewers and agents can search;
   `<f7>`/`<t7>` are 7-character OIDs, `<s>` is `s` unless the count is 1):

   ```text
   **Unresolved base move.** The base moved from `<f7>` to `<t7>` while this plan was written (<n> commit<s>). The plan was published on `<t7>` without reconciling it. Reason: `<reason>`. Overlapping paths: `<p1>`, `<p2>`. Review must reconcile the plan with the new base before it is implemented.
   ```

   The "Overlapping paths" sentence is omitted when the list is empty; a list of exactly 20 adds
   ` (list truncated)`. The composed prose passes the existing `callerBody` checks (closing
   keyword, marker) and the final-length check; a refusal is an input-contract stop (item 5).

5. **Re-publish budget unchanged.** At most one assessed re-publish per issue and pass, for any
   publishable verdict; it re-runs `plan-lint publication-metadata` with the same blob check
   first. A second `BASE_CHANGED`, `BASE_REWRITTEN`, `BLOB_CHANGED`, `TIP_CHANGED` or any other
   error envelope stops as today.
6. **Pass outcome.** A flagged published move is a normal success: `published` verdict, PR in
   `pullRequestsOpened`, `outcome: completed`. `baseMoveOutcomes` binds publishable entries like
   `fits` today (PR opened, `failed` verdict, or failed pass) and stopping entries to the stopped
   pass.
7. **Autopilot records every move beside a confirmed PR.** `base-move-record` gains `verdict`,
   `reason`, `overlappingPaths` (closed schema; verdict/reason from the exported enums; a stopping
   reason is `INVALID_INPUT`; `fits` requires `reason: null` and no paths). No ledger migration:
   PR #735 is unmerged, so no released ledger carries the old shape. No `blocker-record`: the PR
   stays a draft and the appendix section is the flag.
8. **Appendix wording** (en/de, existing `COPY` pattern, same `### Base move` heading so blocker
   counting is untouched). Flagged moves replace the "No changed path overlaps…" line with
   en: ``The move is unresolved (`<reason>`): reconciling the plan with the new base is left to review.``
   plus ``Overlapping paths: `<p>`, …`` when non-empty;
   de: ``Die Verschiebung ist ungelöst (`<reason>`): den Plan mit der neuen Basis abzugleichen bleibt dem Review überlassen.``
   plus ``Überschneidende Pfade: `<p>`, …``. The range sentence stays as is.
9. **Other conflict-like stops in this path, judged:** included — `overlap`/`cited-path` and the
   three non-integrity `undecidable` reasons. Excluded, still stopping — `not-ancestor`,
   `same-issue-plan`, `plan-identity` (Decision 1); `CHANGESET_INVALID` "base already tracks the
   plan path" (a plan of this issue already landed); `BRANCH_EXISTS`/`PR_EXISTS` (race guards
   against a duplicate PR); `BASE_REWRITTEN`, `BLOB_CHANGED`, `TIP_CHANGED`, `INVALID_CONTENT`
   (integrity); a second `BASE_CHANGED` (budget). None of these is a mergeability conflict.

## Affected files

| File                                                                                                               | Change                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/plan-publication-core.mjs`                                                                            | Export `BASE_MOVE_STOPPING_REASONS`; add `republish` to the assess envelope; optional `baseMove` input on `publish` with validation and the fixed flag paragraph in `buildPullRequestBody`; header comment. |
| `src/scripts/plan-publication.mjs`                                                                                 | Usage comment: `republish` in the assess output, `baseMove` on `publish`.                                                                                                                                   |
| `src/scripts/issue-buddy-core.mjs`                                                                                 | `baseMoveOutcomes`: bind by publishable/stopping reason instead of `fits`/non-`fits`; comment.                                                                                                              |
| `src/scripts/autopilot-core.mjs`                                                                                   | `BASE_MOVE_FIELDS` + validation for `verdict`, `reason`, `overlappingPaths`; appendix rendering and en/de `COPY` for a flagged move; header comment.                                                        |
| `src/shared/issue-buddy-base-move.md`                                                                              | Item 3 applies to every `republish: true` envelope and passes `baseMove` for a non-`fits` one; item 4 limited to `republish: false`; Report paragraph names the flagged publication.                        |
| `src/tools/issue-buddy.md`                                                                                         | Item 5 wording and Phase 6 report line for a flagged PR; `contextBudget` from the build report.                                                                                                             |
| `src/shared/autopilot-issue-source.md`                                                                             | Base-move bullet: any entry beside a confirmed PR is recorded with all fields and continues; an entry without one stops as today.                                                                           |
| `src/tools/autopilot.md`                                                                                           | Phase 6 report line names an unresolved move as left to review; `contextBudget` if the count changes.                                                                                                       |
| `docs/adr/plan-only-unattended-publication.md`                                                                     | Publication text may carry the helper-rendered base-move flag; a changed base gets one assessed re-publish, flagged when unresolved; tip/blob drift and the stopping reasons still stop.                    |
| `docs/adr/automation-tool-category.md`                                                                             | No-PR list names only the stopping reasons and a stopped re-publish; "Base move" bullet covers flagged moves.                                                                                               |
| `docs/adr/parallel-issue-planning.md`                                                                              | Decision and Consequences: an overlapping or undecidable move publishes flagged; rewritten base and same-issue plans still stop.                                                                            |
| `docs/developer-guide/build-system.md`                                                                             | Plan-publication paragraph: `publish`'s optional `baseMove` and its body paragraph.                                                                                                                         |
| `test/plan-publication.test.mjs`                                                                                   | Reason split, `republish`, `baseMove` schema/refusals, exact flag text.                                                                                                                                     |
| `test/plan-publication-git.test.mjs`                                                                               | Real-Git flagged publish.                                                                                                                                                                                   |
| `test/issue-buddy.test.mjs`, `test/issue-buddy-pass.test.mjs`, `test/issue-buddy-contract.test.mjs`                | Validator, pass and prose invariants.                                                                                                                                                                       |
| `test/autopilot-core.test.mjs`, `test/autopilot-appendix-core.test.mjs`, `test/scored-decisions-contract.test.mjs` | Record schema, appendix, blocker counting, issue-source prose.                                                                                                                                              |

## Approach

1. **WP1 — helper split and envelope** (`plan-publication-core.mjs`): export the constant, add
   `republish` to `assessBaseMoveOperation`'s return; tests in `plan-publication.test.mjs`.
2. **WP2 — `publish` flag**: closed-schema optional `baseMove`; validate (Decision 3) before any
   Git call where possible and `toBaseOid` against `expectedBaseOid`; render the paragraph
   (Decision 4) into the prose before `buildPullRequestBody`'s checks; dry run returns the same
   body. Unit tests plus one Git test.
3. **WP3 — Issue Buddy** (fragment, tool, `issue-buddy-core.mjs`): rewrite items 3/4 and Report
   per Decisions 5–6; adjust `baseMoveOutcomes`; update contract and pass tests.
4. **WP4 — autopilot** (`autopilot-core.mjs`, `autopilot-issue-source.md`, `autopilot.md`):
   extend `base-move-record`, appendix and copy (Decisions 7–8); update tests.
5. **WP5 — records**: the three ADRs and the developer-guide paragraph; keep prose short
   (AGENTS.md "Writing prompt text").
6. **WP6 — validate** per the plan below; set `contextBudget` from `node build.mjs`'s
   "Always-loaded core (lines/budget)" report.

## Acceptance criteria

1. `test/plan-publication.test.mjs`: a new test asserts `BASE_MOVE_STOPPING_REASONS` deep-equals
   `['not-ancestor', 'same-issue-plan', 'plan-identity']` and that `republish` is true for `fits`,
   `cited-path`, `gitlink`, `no-affected-files`, `unusable-entry` and false for the three.
2. Same file: `publish` dry run with `baseMove` (verdict `overlap`, reason `cited-path`, two
   paths) returns a `body` equal to caller prose + the Decision-4 paragraph + marker + `Refs #1`;
   without `baseMove` the body is byte-identical to today's.
3. Same file: `publish` refuses with `INVALID_INPUT` a `baseMove` with verdict `fits`, a stopping
   reason, `toBaseOid` differing from `expectedBaseOid`, 21 paths or a path holding a backtick;
   `complete-branch` refuses the key.
4. `test/plan-publication-git.test.mjs`: after a base move touching a cited path, `publish
--apply` with `expectedBaseOid: toBaseOid` and `baseMove` opens a draft PR whose stored body
   contains `**Unresolved base move.**`, and `inspectPlanPrMarker` on it is `valid`.
5. `test/issue-buddy-pass.test.mjs`: the overlap test becomes "an overlapping base move publishes
   on the new tip with the flag": `outcome: completed`, one `pullRequestsOpened` entry, the
   `overlap` entry in `baseMoves`, no null failure; a new test keeps a `same-issue-plan` move
   stopping with the null `BASE_CHANGED` failure and the plan preserved.
6. `test/issue-buddy.test.mjs`: an `overlap`/`cited-path` and an `undecidable`/`gitlink` entry
   validate beside a confirmed PR in a completed report; a `not-ancestor` or `same-issue-plan`
   entry in a completed report is refused with "base move does not match the pass outcome".
7. `test/issue-buddy-contract.test.mjs`: the fragment test asserts the text names `republish`,
   passes `baseMove` on a flagged re-publish, and stops only when `republish` is false; the
   old "stops on overlap, undecidable" assertion is replaced.
8. `test/autopilot-core.test.mjs`: `base-move-record` stores `verdict`, `reason`,
   `overlappingPaths`; refuses a stopping reason, `fits` with a path or non-null reason, and an
   unknown key; `pr-appendix` renders the Decision-8 en and de lines for a flagged move and the
   unchanged "No changed path overlaps" line for `fits`.
9. `test/autopilot-appendix-core.test.mjs`: `countAppendixBlockers` returns 0 for an appendix
   with only a flagged base-move section, in both languages.
10. `test/scored-decisions-contract.test.mjs`: the issue-source test asserts that an entry beside
    a confirmed PR is recorded with `verdict`, `reason` and `overlappingPaths` and the run
    continues; one without a PR stops.
11. `grep -n "A changed base, branch tip\|overlapping or undecidable move still does\|overlaps the plan or cannot be decided" docs/adr/*.md`
    returns nothing, and `grep -n "Unresolved base move" docs/adr/plan-only-unattended-publication.md`
    finds the flag.
12. `node build.mjs` passes its guards, including every touched tool's `contextBudget`.

## Validation plan

Run through `t3-project` in a worktree under `/home/t3/project-exports/`, in CI order:

1. `pnpm agent:check`
2. `pnpm test` (runs `pnpm test:preflight` first)
3. `node build.mjs`
4. `pnpm test:distribution`
5. `pnpm eval merge-gate verify`, `pnpm eval iterate verify`, `pnpm eval next-steps verify`,
   `pnpm eval build-context verify`, `pnpm eval focus verify`: no suite config binds a changed
   source (checked: none names `issue-buddy*`, `autopilot*` or `plan-publication*`), so each must
   report no new evidence debt; any debt that does appear is recorded in the PR body.

## Risks

- **Stale plan is implemented.** Autopilot builds a plan whose cited files changed. Mitigation:
  the appendix flag and the draft state; the implementer works on the current tree.
- **Flag lost on manual continuation.** `plan-pr-continuation` rewrites the plan PR body; the
  person running `build` on it is then the reconciler. Accepted; out of scope.
- **Path text trips a body check.** A changed path holding a closing-keyword phrase or a scan
  finding makes `publish` refuse; the pass then stops as an input-contract fault (item 5), the
  same safe failure as today.
- **Validator drift.** Issue Buddy and autopilot both read the exported constant, so the split
  cannot diverge between them.

## Open points

- No open points.

## Build completion

**Date:** 2026-11-25
**Workflow:** `effective-flow build` (interactive, inline Quality), new commits on draft PR #735

### Requirement

Implemented as planned: a base move that overlaps the plan or cannot be decided no longer stops the
Issue Buddy pass or the autopilot run. Issue Buddy makes its single assessed re-publish on the new
tip and the plan pull request carries the fixed "Unresolved base move" paragraph; autopilot records
the move and continues to its draft pull request, whose appendix states that reconciling the plan
with the new base is left to review. A rewritten base and a same-issue plan in the range still stop.

### Architecture decisions

- Implemented as Decisions 1–9 state. `BASE_MOVE_STOPPING_REASONS` and `baseMoveRepublishes` in
  `plan-publication-core.mjs` are the single source of the split; the assess envelope carries
  `republish`, and both validators derive the split from `reason`.
- Review correction: `assessBaseMove` now checks `plan-identity` and `same-issue-plan` directly after
  `not-ancestor`, so a same-issue plan in the range stops even when the range also touches a gitlink
  or the plan has no usable Affected files table (Decision 1).
- `publish` additionally refuses a `baseMove` whose two OIDs are equal or whose commit count is
  below 1; neither can come from a real re-publish.
- A refusal on the composed body caused by the flag is an input-contract stop, never a recorded
  `failed` verdict.

### Affected files

All files of the Affected files table, plus the user guide pages `docs/user-guide/tools-understand.md`
and `docs/user-guide/tools-automation.md` from the documentation sync gate. `contextBudget` values
are unchanged (`issue-buddy` 579/580, `autopilot` 495/495).

### Implementation details

- `src/scripts/plan-publication-core.mjs`: stopping-reason constant, `republish`, `baseMove` input
  with closed-schema validation before any process call, `buildBaseMoveFlag`, reordered reasons.
- `src/scripts/issue-buddy-core.mjs`: `baseMoveOutcomes` binds publishable reasons to a published or
  failed issue and stopping reasons to the stopped pass.
- `src/scripts/autopilot-core.mjs`: `base-move-record` stores `verdict`, `reason` and
  `overlappingPaths`; the appendix renders the unresolved move in English and German.
- Prompt sources: `issue-buddy-base-move.md` items 3 and 4 and Report, `issue-buddy.md` item 5 and
  Phase 6, `autopilot-issue-source.md` and `autopilot.md`.
- Records: the three ADRs, `build-system.md` and the two user guide pages.

### Test results

- Phase 5, full CI order: `pnpm agent:check` passed; `pnpm test` 6673 tests, 6588 passed, 0 failed,
  85 skipped; `node build.mjs` and `pnpm test:distribution` passed; all five `pnpm eval <suite>
verify` calls reported freshness debt only, no integrity blocker.
- After the review corrections, verified targeted: `pnpm agent:check`, `node build.mjs` and
  `pnpm test:distribution` passed; 1857 tests in the 18 affected test files, 1856 passed, 0 failed,
  1 skipped. The full suite was not rerun after the corrections.

## Review findings

**Date:** 2026-11-25
**Reviewer:** effective-flow-nodejs-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     5 |
| Open / Not implemented |     0 |

One further Note (gitlink paths labelled "Overlapping paths") was closed: the wording is the fixed
text of Decision 4.
