# Continue autopilot when the base branch moves during planning and the plan still fits

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Issue:** #734

## Requirement

A publishing Issue Buddy pass, including the one autopilot drives, plans in an `issue-planning`
worktree at `collect.baseOid`. Deep-tier planning and review take many minutes.

If `origin/<base>` moves in that time, even through unrelated docs-only commits:

- `plan-publication publish` fails with `BASE_CHANGED`.
- Outcome-mapping item 5 stops the pass without a retry.
- Autopilot closes with `no-pull-request`.
- The approved plan stays in a `plan-preserved` worktree. That worktree blocks later passes for the
  issue until an operator cleans it up.

The autopilot run for #731 was stopped this way by `741fd348`, a docs-only commit.

Goal: a base move no longer stops publication when it provably cannot affect the plan. When
publish reports `BASE_CHANGED` before any mutation, a helper-owned, read-only fit check compares
the plan with the range `collect.baseOid..<new tip>`. It reaches one of two outcomes:

- **The plan still fits.** No changed path overlaps a path the plan cites, and the range adds no
  plan for the same issue. The pass publishes once on the new tip and records the move.
- **The plan does not fit, or the check cannot decide.** Today's stop stays. The report adds the
  commit range, the overlapping paths and a concrete way out for the preserved plan.

Autopilot carries the recorded move into its run report and the PR appendix.

The workflow is Feature. The change adds new runtime behaviour visible to users of Issue Buddy and
autopilot: a new helper operation, a new pass-report field, a new ledger record and a new appendix
section. It is not behaviour-neutral, so it is not a refactoring.

## Outcome checkpoint

**Primary source:** `sebastian-software/effective-flow` issue #734 (refs #731)
**Original outcome:** A base move that does not overlap the plan no longer ends the autopilot run.
The plan PR is created on the current base tip. The move is recorded with the old and new base and
the checked paths, and both the run report and the PR appendix show it. An overlapping or
undecidable move still stops, and the report gives the commit range, the overlapping paths and a
way out. Tests cover the case that continues and the case that stops. Safety boundary: nothing is
pushed before the fit verdict, and the exact base binding of `publish` stays.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** A read-only `plan-publication` assessment operation, one re-publish per
issue from Issue Buddy, a pass-report field, an autopilot ledger record, and an appendix section.
**Continuation decision:** none

## Architecture decisions

- **The check lives in a new read-only `plan-publication` operation, `assess-base-move`**
  (decided by score, S-CLR).
  - `publish` keeps its exact `expectedBaseOid` comparison.
  - A fit verdict only gives Issue Buddy a new expected base for one more `publish` call.
  - If the base moves again between the assessment and that call, the exact comparison still
    catches it before any mutation.
  - Git reads stay helper-owned, as Issue Buddy's rule requires.
  - The verdict is testable apart from publication.
- **Every publishing Issue Buddy pass gets this behaviour**, standalone batch passes as well as
  autopilot-driven ones (decided by score, S-CLR). Only autopilot keeps a ledger and an appendix,
  so only autopilot records the move there. A standalone pass reports the move in its pass report
  and its chat report.
- **One assessed move per issue per pass** (decided by score, S-CLR). This also means one per
  autopilot run, because autopilot plans one issue.
  - A further `BASE_CHANGED` on the re-publish stops the pass as today, with the assessment
    diagnostics attached.
  - The planning window lasts minutes. The window between check and publish lasts seconds.
- **The fit check is deterministic and fails closed.**
  - The plan fits only if no changed path in the range overlaps a path the plan cites, and the
    range adds or changes no plan for the same issue (decided by score, S-BAT).
  - Overlap is compared with the existing `computeOverlap`, under Git's case-folding and
    Unicode-precomposition flags.
  - Directory prefixes, wildcards and shorthand come only from the Affected files table. Prose
    citations count only as exact files (decided by score, S-DEC), so a bare `docs/` or `src/`
    mentioned as context does not stop a docs-only move like `741fd348`.
  - A wildcard or placeholder in a token's first segment becomes a basename or suffix pattern,
    never the repository root (decided by score, S-DEC).
  - Every condition the helper cannot evaluate is `undecidable`, and an `undecidable` verdict
    stops the pass.
  - No model judges the diff. Acceptance criterion 3 requires an overlapping move to stop, and a
    judgment leaf could only downgrade an overlap to a fit.
- **The plan is not checked out or rebased in the worktree.**
  - `publish` already builds the plan commit by plumbing, with the freshly fetched tip as parent.
    Publishing with `expectedBaseOid: <new tip>` therefore places the plan on the current tip.
  - The planning worktree stays at `collect.baseOid`. Phase 4 forbids moving its HEAD.
  - `plan-lint publication-metadata` is re-run on the unchanged plan file only as an integrity
    check: its projection, `blobOid` included, must equal the first run's.
  - Its duplicate check reads the worktree's old tree. A same-issue plan arriving in the range is
    therefore caught by the assessment's `same-issue-plan` rule, not by the re-run.
- **The recorded move carries a bounded list of the checked paths** (decided by score, S-BAT): at
  most 20 cited paths plus the total, in the pass report, the ledger record and the appendix.
  - Each path goes through the appendix path-safety handling that `fit.sources` already uses.
  - Commit subjects and messages are never carried, only object IDs and counts. This keeps
    untrusted text out of forge-bound records.
- **Orphan recovery keeps the strict binding.** This covers `inspect-branch` and
  `complete-branch`. A recovered plan branch was created on its own base, and moving it is out of
  scope.
- **The ADRs record the changed intent.** Today a run keeps `collect.baseOid`, and publication
  compares `expectedBaseOid`. The new rule: a run plans at `collect.baseOid` and publishes on it,
  or on one later tip that passed the fit check. This lands in `docs/adr/parallel-issue-planning.md`
  and `docs/adr/automation-tool-category.md`.

## Affected files

| File | Description |
|---|---|
| `src/scripts/plan-publication-core.mjs` | New read-only `assess-base-move` operation: closed schema, fetch, ancestry check, changed paths of the range, cited-path extraction from the plan bytes, same-issue-plan rule, overlap verdict, bounded diagnostics |
| `src/scripts/plan-publication.mjs` | Register the operation; document input and output in the header comment |
| `src/scripts/delivery-selection-core.mjs` | Export `pathFoldingConfig` (or an equivalent folding-flag reader) next to `computeOverlap`; no behaviour change |
| `src/scripts/issue-buddy-core.mjs` | Pass report v2 accepts an optional, validated `baseMoves` field in `validateInput` and `validatePassReport`, bound to the persisted collection's `baseOid` and the pass outcome |
| `src/tools/issue-buddy.md` | Phase 5: on a pre-mutation `BASE_CHANGED`, load the new fragment; outcome-mapping item 5 names the single assessed re-publish; Phase 6 `pass-report` key list gains optional `baseMoves`; `contextBudget` re-measured |
| `src/shared/issue-buddy-base-move.md` | New lazy fragment: assessment call, verdict handling, integrity re-run, the single re-publish, pass-report entry, stop records and way-out text |
| `src/scripts/autopilot-core.mjs` | New `base-move-record` operation and ledger field; `pr-appendix` renders a "Base move" section (English and German) outside the blocker section; `run-close` returns `baseMove` |
| `src/scripts/autopilot.mjs` | Add `base-move-record` to the operation list in the header comment |
| `src/shared/autopilot-issue-source.md` | Map a pass-report `baseMoves` entry for `#<N>`: record a fitting move, report a stopping one with diagnostics and way out |
| `src/tools/autopilot.md` | Phase 6 report lists the base move; `contextBudget` re-measured if the core changes |
| `test/plan-publication-git.test.mjs` | Real-Git cases: unrelated move fits and publishes on the new tip; overlap; glob and shorthand entries; same-issue plan by name and by header; undecidable cases |
| `test/issue-buddy-pass.test.mjs` | Pass-level scenarios: unrelated move continues on the new tip; overlapping move stops with diagnostics |
| `test/fixtures/issue-buddy/world.mjs` | Helper to advance the remote base with chosen path changes during a pass; fixture plan text gains an Affected files table (tracked, glob and shorthand rows) |
| `test/scored-decisions-contract.test.mjs` | Contract assertion for the autopilot Phase 6 base-move line, beside the existing `tools/autopilot.md` prose assertions |
| `test/plan-publication.test.mjs` | Schema and unit cases for `assess-base-move` and cited-path extraction |
| `test/issue-buddy.test.mjs` | Pass-report `baseMoves` validation |
| `test/issue-buddy-contract.test.mjs` | Updated prose assertions for Phase 5, item 5 and the new fragment |
| `test/autopilot-core.test.mjs` | `base-move-record` validation, ledger write and appendix withdrawal; appendix rendering in both languages |
| `test/autopilot-appendix-core.test.mjs` | Blocker counting is unaffected by the new section |
| `docs/developer-guide/build-system.md` | Add `assess-base-move` to the `plan-publication` operation list and `base-move-record` to the autopilot ledger-writing and appendix-withdrawing operations |
| `docs/developer-guide/release-and-installation.md` | Name `assess-base-move` among the `plan-publication` operations that reach the network (fetch only) |
| `docs/adr/parallel-issue-planning.md` | Record the bounded base move after planning |
| `docs/adr/automation-tool-category.md` | Autopilot mechanics: base-move record in ledger and appendix; the no-PR list keeps only overlapping or undecidable moves |

## Implementation details

### Approach

1. **`assess-base-move` in `plan-publication-core.mjs`.** Add a closed `SCHEMAS` entry.
   - Required keys: `cwd`, `issue`, `planDir`, `planFile`, `remote`, `baseBranch`, `fromBaseOid`,
     `expectedBlobOid`.
   - The operation reuses `verifyRepositoryRoot`, `readPlanFile`, the issue-header agreement and
     `fetchBase`, so `BASE_REWRITTEN` and `REMOTE_UNREACHABLE` keep their meaning.
   - The plan blob must equal `expectedBlobOid`; otherwise the operation fails with
     `BLOB_CHANGED`.
   - The only write is the remote-tracking ref update of that fetch, the same one `publish`
     performs. The operation creates no branch, commit, push or forge object.
2. **Range facts.** Let `toBaseOid` be the fetched tip.
   - Require `fromBaseOid` to be an ancestor of `toBaseOid` (or equal to it).
   - An empty range is no separate verdict: it yields `fits` with `commitCount: 0`. `publish`
     has already fetched the moved tip into the tracking ref, so a remote reset back to the old
     base surfaces as `BASE_REWRITTEN` from the fetch, not as an empty range.
   - Count the commits in the range.
   - List the changed paths, with their status, through a `diff-tree -r -z --no-renames` read
     equivalent to `incomingChanges` in `delivery-selection-core.mjs`. Both endpoints of a rename
     count, and gitlink changes are flagged separately.
3. **Cited tokens.** Extract them from the same immutable plan bytes the blob check hashed.
   - **Sources.**
     - **Table tokens:** every backticked token in the File column of the `## Affected files` or
       `## Betroffene Dateien` table, counting every token in a cell.
     - **Prose tokens:** every other inline-code span outside fenced blocks.
     - The plan's own path is excluded.
   - **Normalization**, in this order:
     1. Strip a `:<line>` or `#<anchor>` suffix.
     2. A token is a candidate when it has no whitespace and contains a `/` or a file extension.
        Other tokens, such as `contextBudget:` or `RUNTIME_SCRIPT_FILES`, are ignored.
     3. Wildcards and placeholders are any segment containing `*`, `?`, `[`, `{` or `<`.
        - If such a segment is not the first segment, the token becomes the directory before it.
          For example, `src/tools/*.md`, `src/tools/{plan,review}.md` and
          `evals/merge-gate/scenarios/<name>.md` become their directories.
        - If it is the first segment, the token becomes a pattern, matched against the trailing
          segments of a changed path. The pattern maps `*` and `<…>` to one segment of any text,
          `?` to one character and `{a,b}` to alternation. A trailing `/` means the matched
          segments are a directory on the path. A single-segment token is thus a basename
          pattern, for example `*.md` or `remote-tracker-{shared,decomposition}-core.mjs`. If no
          pattern can be built, the token is unusable.
     4. A trailing `/` marks a directory entry (the S-LOC rule of `scored-decisions.md`) and is
        removed before validation.
     5. Every remaining literal path is validated with the repository-path rule of
        `validateLiteralPath` in `delivery-selection-core.mjs`. This rule allows dot-segments such
        as `.github/`, and rejects absolute paths, `..`, NUL and `\`. A failing token is unusable.
   - **Use per source.**
     - **Table tokens.** An unusable table token makes the verdict `undecidable`. Otherwise a
       table token is one of three kinds:
       - a **tracked path**: a file, or a directory prefix, in the `from` or `to` tree. It keeps
         the exact `computeOverlap` semantics.
       - a **pattern**.
       - a **shorthand**: any other token. A file shorthand overlaps a changed path that equals
         it or ends in `/<token>`. A token without `/` also overlaps a changed path whose
         basename equals the token or starts with `<token>.`. A directory shorthand overlaps a
         changed path that starts with `<token>/` or contains `/<token>/`. This keeps rows like
         `remote-tracker-github-core.mjs` under a `src/scripts/` entry fail-closed.
     - **Prose tokens** count only as exact files, by full-path equality. Unusable prose tokens,
       directory entries and patterns in prose are ignored.
   - **Folding.** All comparisons fold case and Unicode only as `core.ignorecase` and
     `core.precomposeunicode` of `cwd` say. The flags are read through the newly exported
     `pathFoldingConfig`.
4. **Verdict.** The closed enum, stated once and used by steps 6–8:
   - `fits`, with `reason: null`;
   - `overlap`, with reason `same-issue-plan` or `cited-path`;
   - `undecidable`, with reason `not-ancestor`, `gitlink`, `no-affected-files`,
     `unusable-entry` or `plan-identity`.

   `no-affected-files` means there is no table, or the table yields zero usable tokens.
   `unusable-entry` means at least one table token is unusable.

   The checks run in this order:
   1. **`undecidable`**, when the ancestry check fails, the range changes a gitlink, the table is
      missing or empty of usable tokens, or a table token is unusable.
   2. **`same-issue-plan`.** The range adds or modifies a `.md` file directly under `<planDir>/` or
      `<planDir>/archive/` that belongs to this issue.
      - Identify it as collection's `scanBase` in `issue-buddy-core.mjs` does: read the blob at
        `toBaseOid`, then apply `parseIssueHeader` together with the file-name rule
        (`-issue-<N>-`, or the plan's own basename).
      - A malformed header, or a header that conflicts with the file name, is `undecidable`
        (`plan-identity`).
      - A deleted file is no duplicate. An archive move appears as a delete plus an add, and the
        add side is checked.
   3. **`cited-path`.** The cited tokens overlap a changed path.
      - Tracked paths go through `computeOverlap(tracked, {paths, gitlinks: []}, folding)`.
        Patterns, shorthand and prose files go through their rules from step 3.
      - A changed `.md` file directly under `<planDir>/` or `<planDir>/archive/` is never matched
        by a directory prefix, a pattern or a shorthand, only by an exact-file citation. The
        same-issue rule covers it, so archive commits for other issues keep fitting.
   4. **`fits`** otherwise.

   The operation returns `{state: "assessed", fromBaseOid, toBaseOid, verdict, reason,
   commitCount, changedPathCount, citedPathCount, citedPaths, overlappingPaths}`. `citedPaths`
   lists the normalized table tokens and the cited prose files. Both lists hold at most 20
   entries, and their totals are always present. Errors use the existing envelope and exit codes.
5. **Issue Buddy (`src/tools/issue-buddy.md`).**
   - **Phase 5.** Add one sentence and a lazy-include pointer: when `publish --apply` fails with
     `BASE_CHANGED` and no `details.state`, and no base move has been assessed for this issue in
     this pass, follow `issue-buddy-base-move` instead of item 5.
   - **Item 5** keeps `BASE_CHANGED` in its stop list, adding "except the single assessed
     re-publish of `issue-buddy-base-move`".
   - **Phase 6.** Add the optional `baseMoves` to the exact `pass-report` input key list, so the
     stored report carries the move.
6. **New fragment `src/shared/issue-buddy-base-move.md`.**
   - Call `assess-base-move` with `fromBaseOid: collect.baseOid` and
     `expectedBlobOid: <metadata blobOid>`.
   - **`fits`:**
     - Re-run `plan-lint publication-metadata` with the same input and require an identical
       projection.
     - Then call `publish --apply` once, with `expectedBaseOid: <toBaseOid>` and the unchanged
       fixed texts.
     - Map that result with the ordinary ordered mapping. A further `BASE_CHANGED` is an item-5
       stop. Checks that first run here, such as the scan or the plan-path check, map as items 3
       and 4 already define.
   - **`overlap` or `undecidable`:** stop as item 5 does today, preserving the plan and its
     worktree, and record the pass failure `{issue: null, stage: "publish", code: "BASE_CHANGED"}`.
   - **Assessment error:** stop, recording the assessment's own error code as the pass failure.
   - **Pass-report entry:** a successful assessment envelope, whatever its verdict, adds exactly one
     `baseMoves` entry. An assessment error adds none.
   - **Chat report of a stopping move:** names the range `<from>..<to>`, the commit count, the
     bounded overlapping paths with the reason, the preserved plan and worktree paths, and the way
     out. A stopping move is an `overlap` or `undecidable` verdict, or a `fits` verdict whose
     re-publish then stopped, for example on a second `BASE_CHANGED`.
   - **The way out:** move or discard the preserved plan, run `effective-flow cleanup` to remove
     the kept planning worktree, then rerun the pass or autopilot run, which plans on the current
     tip.
7. **Pass report (`issue-buddy-core.mjs`).** Accept the optional `baseMoves` field only with
   `reportVersion: 2`.
   - The field is an array with at most one entry per issue:
     `{issue, fromBaseOid, toBaseOid, verdict, reason, commitCount, changedPathCount,
     citedPathCount, citedPaths, overlappingPaths}`.
   - Entries use full lowercase object IDs and the verdict and reason enum of step 4.
     `citedPaths` and `overlappingPaths` hold at most 20 safe repository-relative entries each.
   - The field is rejected in a dry-run (non-publishing) report.
   - `fromBaseOid` must equal the persisted collection's `baseOid`.
   - A `fits` entry requires one of these for that issue: a confirmed PR in `pullRequestsOpened`,
     a persisted `failed` verdict, or the pass's `outcome: failed`.
   - An `overlap` or `undecidable` entry requires `outcome: failed` with the null failure
     `{issue: null, stage: "publish", code: "BASE_CHANGED"}`.
   - The field is optional in both `validateInput` and the stored-report validator
     `validatePassReport`, so stored version-2 reports without it keep validating.
   - Version 1 reports and stored reports are never rewritten.
8. **Autopilot (`autopilot-core.mjs`, `autopilot.mjs`, `autopilot-issue-source.md`,
   `autopilot.md`).**
   - **Recording.** After a confirmed plan PR for `#<N>`, a `baseMoves` entry with verdict `fits`
     is recorded by a new literal `autopilot.mjs base-move-record` call:
     `{cwd, runId, fromBaseOid, toBaseOid, commitCount, changedPathCount, citedPathCount,
     citedPaths}`.
     - The schema is closed, and the operation keeps at most one record per run: an identical
       repeat returns `recorded: true` (idempotent, like `fit-record`), a different second record
       fails with `INVALID_STATE`.
     - It rejects a ledger whose source is not an issue.
     - Like the other record operations, it calls `withdrawAppendix`.
   - **Appendix.** `pr-appendix` renders a `### Base move` section from the record, through the
     English and German `COPY`. The section shows the old and new base as short object IDs and the
     counts, lists the cited paths through `field()` as `fit.sources` does, and states that no
     changed path overlaps them. It sits before `### Blockers`, so `countAppendixBlockers` is
     unaffected.
   - **Stopping entries.** An `overlap` or `undecidable` entry, or a `fits` entry without a
     confirmed PR for `#<N>`, creates no ledger record. The run closes `no-pull-request` through
     the existing `outcome: failed` mapping. Phase 6 reports the entry's range, overlapping paths,
     reason and way out from the stored pass report.
   - **Report.** `run-close` returns the recorded move as `baseMove`, beside `fit`, or `null`
     when none is recorded. Phase 6 of `src/tools/autopilot.md` lists it as one line, which a
     contract assertion checks.
9. **Documentation.** Amend `docs/adr/parallel-issue-planning.md` (decision and consequences) and
   the autopilot mechanics in `docs/adr/automation-tool-category.md` (base-move record, appendix
   section, no-PR list). Update the operation lists in `docs/developer-guide/build-system.md` and
   `docs/developer-guide/release-and-installation.md`.
10. **Budgets and build.** Run `node build.mjs` and re-measure `contextBudget` for
    `src/tools/issue-buddy.md` and `src/tools/autopilot.md` from the
    `Always-loaded core (lines/budget)` report. Keep new prose in lazy fragments. No new script
    file is added, so `RUNTIME_SCRIPT_FILES` is unchanged.

### Component structure

Not relevant: no UI.

### State management

- The autopilot ledger gains one optional base-move field, written only through `base-move-record`
  and the runtime-state guard.
- The Issue Buddy pass report gains the optional `baseMoves` field.
- The assessment itself keeps no state.

### API integration

Forge access is unchanged.

- The assessment only fetches.
- The single re-publish uses the existing `publish --apply` path, with its scan, hooks, create-only
  push and draft-PR confirmation.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Base reset after `publish` fetched the moved tip:** the assessment's fetch (without `+`) fails
  with `BASE_REWRITTEN`. Stop under item 5, with that code and no `baseMoves` entry.
- **Empty range** (only reachable if something outside the pass rewound the tracking ref):
  `fits` with `commitCount: 0`; re-publish once.
- **Shorthand File-column token** such as `remote-tracker-github-core.mjs` listed under a
  `src/scripts/` row, and a range that changes `src/scripts/remote-tracker-github-core.mjs`:
  `overlap` through the shorthand rule.
- **A same-issue plan identified only by its `**Issue:**` header** under a non-issue file name:
  `overlap` (`same-issue-plan`); a header that conflicts with its file name: `undecidable`.
- **`fromBaseOid` not an ancestor of the new tip:** `undecidable`, stop.
- **A gitlink changes in the range:** `undecidable`, stop.
- **No Affected files table, or no usable token in it:** `undecidable` (`no-affected-files`).
- **A single unusable table token** (for example `../outside.md`): `undecidable`
  (`unusable-entry`); the same token in prose is ignored.
- **A glob entry such as `src/tools/*.md`, and a changed file under `src/tools/`:** `overlap`.
  A changed file elsewhere does not overlap it.
- **A first-segment pattern such as `*.md` or `remote-tracker-{shared,decomposition}-core.mjs`
  in the table:** overlaps a changed path whose basename matches; other changes do not.
- **A changed path lies below a cited table directory entry:** `overlap`.
- **A dot-path such as `.github/workflows/ci.yml` in the table:** a valid tracked path, matched
  normally.
- **A docs-only move like `741fd348`** (`AGENTS.md`, `docs/developer-guide/…`, another issue's
  archived plan): `fits` for a plan that cites none of those files in its table or as exact prose
  files, even when its prose mentions `docs/` or `docs/plan/`; `overlap` for a plan whose table or
  prose cites `AGENTS.md` as a file.
- **The range adds a plan for the same issue, open or archived:** `overlap` with reason
  `same-issue-plan`. An archived plan for another issue does not overlap, even when the plan cites
  `docs/plan/` as a table directory.
- **Case-only or Unicode-normalization differences:** folded only as Git's flags say, as
  `computeOverlap` already does.
- **The base moves again between the assessment and the re-publish:** the exact comparison fails
  with `BASE_CHANGED` before any mutation. Stop under item 5, and keep the first assessment entry
  in the report.
- **Plan bytes changed after the first metadata run:** the assessment fails with `BLOB_CHANGED`,
  or the re-run returns a different projection. Integrity stop, no publication.
- **A new base commit adds the exact plan path:** `same-issue-plan` overlap. `publish`'s own check
  would also refuse it.
- **`BASE_CHANGED` from `inspect-branch` or `complete-branch` (orphan recovery):** unchanged
  strict stop.
- **A very large range:** overlap is computed over the full path set. Only the returned lists are
  bounded, with totals.

## Acceptance criteria

- [ ] In `test/plan-publication-git.test.mjs`, the remote base is advanced by a commit that touches
  only paths the plan does not cite, including an archived plan for another issue.
  - `assess-base-move` returns `fits` with the correct `fromBaseOid` and `toBaseOid`.
  - A following `publish --apply` with `expectedBaseOid: <toBaseOid>` creates the plan branch,
    whose commit parent is the new tip, and the draft PR.
- [ ] In the same suite, each of these commits returns `overlap` and names the reason and the
  overlapping path, and no case creates a branch, push or forge object:
  - a commit that changes a path listed in the Affected files table;
  - a commit under a glob entry's directory;
  - a commit that changes the file a shorthand File-column token names;
  - a commit whose changed basename matches a first-segment pattern in the table;
  - a commit that adds a plan for the same issue, once by file name and once only by its
    `**Issue:**` header.

  Separate cases return `undecidable` for a gitlink change, for a plan without an Affected
  files table and for a single unusable table token. A `741fd348`-shaped commit (`AGENTS.md`, a
  `docs/developer-guide/` page, another issue's archived plan) returns `fits` for a plan whose
  prose mentions `docs/` and `docs/plan/` but not `AGENTS.md`, and `overlap` for a plan whose
  prose cites `AGENTS.md`.
- [ ] `publish` with `expectedBaseOid: collect.baseOid` against a moved base still fails with
  `BASE_CHANGED` before mutation. The existing test "publication bindings refuse a moved base or
  branch tip before forge mutation" passes unchanged.
- [ ] `issue-buddy.mjs pass-report` (`test/issue-buddy.test.mjs`):
  - accepts a valid version-2 `baseMoves` entry, including a `fits` entry paired with a `failed`
    verdict, and still validates a stored version-2 report without the field;
  - rejects malformed object IDs, a `fromBaseOid` other than the collection's `baseOid`, unknown
    verdicts or reasons, a reason that does not belong to its verdict, a stopping entry without
    the null `BASE_CHANGED` failure, more than one entry per issue, over-long path lists, the
    field in a dry-run report, and the field on a version-1 report.
- [ ] In `test/issue-buddy-pass.test.mjs` (real Git, `test/fixtures/issue-buddy/world.mjs`), a
  pass whose base moves after collection:
  - with an unrelated move, publishes on the new tip and its version-2 report with a `fits`
    `baseMoves` entry is accepted;
  - with an overlapping move, ends with a `failed` version-2 report carrying the null
    `BASE_CHANGED` failure and an `overlap` entry, and keeps the plan and its worktree.
- [ ] `autopilot.mjs base-move-record`:
  - writes one ledger record and withdraws the appendix digest;
  - returns `recorded: true` for an identical repeat, and rejects a different second record and
    a plan-source ledger.

  `pr-appendix` then renders a `### Base move` section with both short object IDs, the counts and
  the cited paths, in English and German. The blocker count is unchanged, and `run-close` returns
  the record as `baseMove`, or `null` without one (`test/autopilot-core.test.mjs`,
  `test/autopilot-appendix-core.test.mjs`).
- [ ] `src/tools/issue-buddy.md`, `src/shared/issue-buddy-base-move.md`,
  `src/shared/autopilot-issue-source.md` and `src/tools/autopilot.md` state:
  - the single assessed re-publish;
  - the stop for an overlapping or undecidable move, or a fitting move whose re-publish stopped,
    with the range, the overlapping paths, the stop record and the way out;
  - `baseMoves` in Issue Buddy's Phase 6 `pass-report` key list;
  - the autopilot Phase 6 base-move line.

  The updated contract assertions in `test/issue-buddy-contract.test.mjs` and
  `test/scored-decisions-contract.test.mjs` pass.
- [ ] The CI order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs` (all context budgets
  within their limits) and `pnpm test:distribution`.

## Validation plan

- **Unit and schema tests** for `assess-base-move` and cited-path extraction
  (`test/plan-publication.test.mjs`): the normalization order, candidate detection, prefix
  reduction and first-segment patterns, dot-paths, shorthand tokens (including the archived-plan
  example `remote-tracker-github-core.mjs`), directory shorthand, unusable table and prose
  tokens, prose exact-file matching, and the plan-directory exclusion.
- **Real-Git cases** in `test/plan-publication-git.test.mjs`.
  - A new fixture helper commits specific file, plan-file or gitlink changes to the remote base.
    The existing `advanceRemoteBranch` commits the same tree, so it changes no path.
  - The fixture plan text (`PLAN_TEXT`) gains an Affected files table with a tracked row, a glob
    row and a shorthand row; without a table every assessment is `undecidable`.
  - The `not-ancestor` case first moves the local remote-tracking ref. A fetch without `+`
    otherwise reports `BASE_REWRITTEN`.
- **Pass-level scenarios** in `test/issue-buddy-pass.test.mjs`: unrelated move continues,
  overlapping move stops with diagnostics.
- **Pass-report validation tests** in `test/issue-buddy.test.mjs`.
- **Ledger and appendix tests** in `test/autopilot-core.test.mjs` and
  `test/autopilot-appendix-core.test.mjs`.
- **Prose contract assertions** in `test/issue-buddy-contract.test.mjs`.
- **Build and distribution:** `node build.mjs` for the budgets and guards, then
  `pnpm test:distribution`.
- **Eval evidence:** `pnpm eval <tool> verify` for each suite confirms that no behavioural-eval
  suite loads a changed source. None references Issue Buddy or autopilot today.
- **Manual acceptance** (optional, outside CI): run autopilot on an issue while an unrelated
  docs-only commit lands on `develop` during planning. Expect a plan PR on the new tip and a
  "Base move" appendix section.

## Assumptions and open points

- Assumption: path-level overlap, plus the same-issue-plan rule, is the accepted fit criterion.
  The issue names path overlap as the minimum, and its acceptance criteria require an overlap to
  stop.
  - The check cannot see indirect dependencies, for example a changed shared fragment that an
    affected tool includes but the plan does not cite.
  - The plan's Affected files table and cited paths are its declared scope. The implementing run
    validates against the new tip anyway.
- Assumption: a bounded re-review on overlap is out of scope, because acceptance criterion 3
  requires an overlapping or undecidable move to stop. A re-review can follow as its own issue.
- Assumption: commit subjects are deliberately not reported. Object IDs, counts and paths are
  enough to inspect the range locally.
- Assumption: the plan PR body keeps its fixed template. Autopilot records the move only in the
  appendix; standalone passes record it only in the pass and chat reports.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->
```json
[{"site":"S-CLR","question":"Where should the base-move fit check live?","options":["New read-only plan-publication assess operation, called by Issue Buddy before a re-publish on the assessed tip","Inside plan-publication publish: an opt-in policy that checks overlap itself and publishes on the new tip in one call"],"scores":[{"label":"New read-only plan-publication assess operation, called by Issue Buddy before a re-publish on the assessed tip","score":8,"reason":"Keeps publish's exact expectedBaseOid guard and BASE_CHANGED test unchanged, keeps Git reads in a testable read-only script operation that reuses the overlap helpers, and any later base move is still caught by the exact compare; the cost is a few more lines in Issue Buddy's near-budget core."},{"label":"Inside plan-publication publish: an opt-in policy that checks overlap itself and publishes on the new tip in one call","score":5,"reason":"Workable, and one call closes the gap between check and publish, but it puts a judgment call inside the mutating operation, loosens the deliberate exact-base binding, and makes the fits/overlap/undecidable verdicts and the rebase record harder to test and report on their own."}]},{"site":"S-CLR","question":"Which Issue Buddy passes may continue past a moved base?","options":["Only passes driven by an autopilot run (trusted Autopilot run: caller line)","Every publishing Issue Buddy pass, standalone or autopilot-driven"],"scores":[{"label":"Only passes driven by an autopilot run (trusted Autopilot run: caller line)","score":6,"reason":"It matches the issue's acceptance criteria and fits the lazy autopilot fragment cheaply, but standalone batch passes, which run longer, still stop on BASE_CHANGED and leave plan-preserved worktrees behind."},{"label":"Every publishing Issue Buddy pass, standalone or autopilot-driven","score":7,"reason":"It fixes the stop where it costs most, in long batch passes, with one consistent Phase 5 rule, and a fit check trusted unattended is safe for hand-implemented plans; the cost is eager-core prose near the budget."}]},{"site":"S-CLR","question":"How many base moves may one pass absorb before it stops?","options":["One: a second move after the fit check stops the pass as today","Up to three fit-checked moves in a bounded loop, then stop"],"scores":[{"label":"One: a second move after the fit check stops the pass as today","score":8,"reason":"One move covers the real failure window (the ~18-minute planning period), while a move in the seconds-long check-to-publish gap is rare and stops safely with BASE_CHANGED, keeping the near-budget eager core and the ledger and appendix records minimal."},{"label":"Up to three fit-checked moves in a bounded loop, then stop","score":5,"reason":"Safe and viable since each check re-reads the whole range and overlaps still stop, but it covers a rare seconds-long case at the cost of loop text in a near-budget eager core, up to three ledger and appendix records, and drift from the no-retry rule."}]},{"site":"S-BAT","question":"How should the base-move check treat a moved range that adds a plan for the same issue?","options":["Overlap verdict when the range adds or changes a plan for this issue under the plan dir or its archive","Undecidable verdict for any change under the plan dir","Move the planning worktree to the new tip and re-lint there"],"scores":[{"label":"Overlap verdict when the range adds or changes a plan for this issue under the plan dir or its archive","score":9,"reason":"It closes the duplicate-plan gap that lint (old tree) and publish (exact path) both miss, matches fresh collection's plan-on-base skip, and still lets unrelated archive commits like 741fd348 continue, which option 2 cannot."},{"label":"Undecidable verdict for any change under the plan dir","score":2,"reason":"It is safe against duplicates, but archive commits land often, so autopilot would stop on the motivating case (741fd348 archived another issue's plan), which defeats the issue's goal."},{"label":"Move the planning worktree to the new tip and re-lint there","score":1,"reason":"Issue Buddy forbids moving HEAD in the planning worktree after collection, and the plan builds the commit by plumbing on the fetched tip, so this breaks an existing invariant for a check the range diff already gives."}]},{"site":"S-BAT","question":"What does the recorded base move show about the checked paths?","options":["A bounded list of the cited paths (at most 20, plus the total) in ledger record, pass report and appendix","Counts only, with the deviation from the issue stated in the plan"],"scores":[{"label":"A bounded list of the cited paths (at most 20, plus the total) in ledger record, pass report and appendix","score":9,"reason":"Meets the acceptance criterion's 'checked paths' literally and matches the plan's own Outcome claim. It reuses the existing LIMITS.sources/path bounds and the field() safety used for fit.sources, so the extra risk is small. Counts-only would leave the criterion unmet."},{"label":"Counts only, with the deviation from the issue stated in the plan","score":3,"reason":"Honest about the gap but still fails the stated criterion and contradicts the Outcome checkpoint. It saves little because bounded, safe path rendering already exists for fit.sources."}]},{"site":"S-DEC","question":"How should the base-move check treat a cited wildcard or placeholder token whose first segment is already a wildcard?","options":["Undecidable when such a token is in the Affected files table; ignored when it appears in prose","Match it as a basename pattern against changed paths, falling back to undecidable if no pattern can be built","Treat it as the repository root, so every base move overlaps","Decide later"],"escape":["Decide later"],"scores":[{"label":"Undecidable when such a token is in the Affected files table; ignored when it appears in prose","score":4,"reason":"The table half is safe but stops every plan with such a row, and these tokens are common (132 of 238 archived plans). Ignoring them in prose fails open on real citations, which works against the fail-closed goal."},{"label":"Match it as a basename pattern against changed paths, falling back to undecidable if no pattern can be built","score":9,"reason":"It stays fail-closed: it matches a superset of the cited files and stops when no pattern can be built. Unlike option 1, it neither drops prose citations nor stops on table rows, so unrelated docs-only moves still continue, at the cost of a few lines of pattern code."},{"label":"Treat it as the repository root, so every base move overlaps","score":2,"reason":"It is safe, but every base move would stop for the many plans that cite such tokens, including runtime-path placeholders like <RUNTIME_STATE_ROOT>. That brings back the unnecessary stops on unrelated moves that the issue is meant to remove."}]},{"site":"S-DEC","question":"How broadly do citations in the plan's prose count for the base-move overlap check?","options":["Prose directories count as prefixes; document that broad citations stop docs-only moves and add a test pair","Prose citations count only as exact files; prefixes and shorthand come only from the Affected files table","Only the Affected files table counts; prose citations are ignored","Decide later"],"escape":["Decide later"],"scores":[{"label":"Prose directories count as prefixes; document that broad citations stop docs-only moves and add a test pair","score":3,"reason":"This matches the issue's wording most literally, but 133 of 238 archived plans would stop on a 741fd348-shaped docs-only move, so the feature would rarely do what the issue asks."},{"label":"Prose citations count only as exact files; prefixes and shorthand come only from the Affected files table","score":9,"reason":"Exact files cited in prose still count, so the issue's 'any other repository path the plan cites' holds; unlike option 3 it keeps prose-cited files, and unlike option 1 broad context directories no longer stop unrelated moves."},{"label":"Only the Affected files table counts; prose citations are ignored","score":5,"reason":"This is the simplest rule and fires most often, but it breaks the issue's explicit prose-citation clause and misses a plan whose prose names a file it relies on, such as AGENTS.md."}]}]
```
<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

Deep plan review (2026-11-25), following the internal review below. Every finding was
incorporated, two of them through scored decisions (S-DEC). No critical finding and no open point
remains.

### Summary

| Area | Critical | Important | Note |
|---|---:|---:|---:|
| Architecture | 0 | 1 | 0 |
| Security | 0 | 0 | 0 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 3 | 2 |
| Testability | 0 | 0 | 2 |
| Scope | 0 | 1 | 1 |
| Maintainability | 0 | 1 | 0 |

### Findings

- **Error cases, Important. "Path-shaped" relied on a Git ref-name check.** That check dropped
  dot-paths such as `.github/…`, and its "unusable" examples could never fire.
  - Adjusted: step 3 now fixes the normalization order and validates with the repository-path
    rule of `validateLiteralPath`.
- **Error cases, Important. A wildcard in the first segment left no directory prefix.**
  - Decided by score: such a token becomes a basename or suffix pattern, and becomes unusable when
    no pattern can be built. Edge case and test added.
- **Architecture, Important. Plan-directory citations undid the same-issue-plan decision.**
  - Adjusted: a changed `.md` file directly under the plan directory or its archive is matched only
    by the same-issue rule and exact-file citations. A test was added in which another issue's
    archived plan still fits.
- **Scope, Important. Broad prose citations would stop most plans on a docs-only move.**
  - Decided by score: prose counts only as exact files, and prefixes, patterns and shorthand come
    only from the Affected files table. A `741fd348`-shaped test pair was added.
- **Error cases, Important. The `unusable-entry` rule and the reason values contradicted each
  other across steps.**
  - Adjusted: one closed verdict and reason enum in step 4, referenced by steps 6–8. Both
    undecidable reasons are defined.
- **Maintainability, Important. Issue Buddy's Phase 6 `pass-report` key list was not updated.**
  - Adjusted: step 5, the affected-file row and a contract assertion now cover it.
- **Testability, Note. The autopilot run report had no data source for the move.**
  - Adjusted: `run-close` returns `baseMove`, and the Phase 6 line is contract-tested.
- **Testability, Note. The fixture plans had no Affected files table.**
  - Adjusted: both fixtures gain a table with tracked, glob and shorthand rows.
- **Error cases, Note. Deleted plan files, directory shorthand, folding and an unreachable edge
  case.**
  - Adjusted: the same-issue rule ignores deletions. A directory shorthand matches as a segment
    infix. Folding applies to every comparison. The impossible edge case was dropped.
- **Error cases, Note. A fitting move whose re-publish stopped was not reported.**
  - Adjusted: it is reported as a stopping move with the way out. Autopilot treats it as a stop
    with no record, and dry-run reports reject `baseMoves`.
- **Scope, Note. The contract carried unused data.**
  - Adjusted: the commit and changed-path lists were dropped in favour of their counts.
    `expectedBlobOid` is now required.

### Earlier internal review (2026-11-25)

Prior-round history, after the gap analysis. All findings were incorporated: 2 Important and 5
Notes. Where this list differs from the deep review above, the deep review supersedes it.

- **Error cases, Important. Shorthand File-column tokens could yield a false `fits`.** A token such
  as `remote-tracker-github-core.mjs` listed under a `src/scripts/` row never equals the full
  changed path.
  - Adjusted: Approach step 3 adds the shorthand rule (suffix and basename match for untracked
    tokens).
  - Edge case and test cases added.
- **Error cases, Important. The same-issue-plan rule matched file names only.** It missed a plan
  identified by its `**Issue:**` header.
  - Adjusted: the rule now identifies plans as collection's `scanBase` does, by header and file
    name. A conflicting header is `undecidable`.
  - A header-only test case was added.
- **Error cases, Note. `base-move-record` was not idempotent.**
  - Adjusted: an identical repeat returns `recorded: true`; a different second record fails.
- **Testability, Note. `baseMoves` was not bound to persisted state, and the stored-report
  validator was missing.**
  - Adjusted: `fromBaseOid` must equal the collection `baseOid`. Stopping entries require the null
    `BASE_CHANGED` failure. The field is optional in both validators. Acceptance criterion added.
- **Testability, Note. No pass-level test.**
  - Adjusted: two `test/issue-buddy-pass.test.mjs` scenarios added, with the fixture listed among
    the affected files.
- **Scope, Note. Wildcard and placeholder entries (`{…}`, `<…>`) would always stop.**
  - Adjusted: they are folded into the conservative directory-prefix rule, which the deep review
    extended with first-segment patterns.
- **Maintainability, Note. The `unchanged` verdict was practically unreachable, and its edge-case
  text was wrong.**
  - Adjusted: an empty range is `fits` with `commitCount: 0`. A reset base is documented as
    `BASE_REWRITTEN`.

## Open points

- No open points.
