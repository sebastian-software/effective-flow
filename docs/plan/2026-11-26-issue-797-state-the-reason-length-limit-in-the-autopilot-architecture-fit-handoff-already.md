# State the reason length limit in the autopilot architecture-fit handoff (already resolved)

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #797

## Requirement

Issue #797 reports that the architecture-fit leaf handoff in `src/tools/autopilot.md` describes
`reason` only as `"<one sentence>"`, while `fit-record` rejects a reason longer than
`LIMITS.reason` (300 characters). A rejected reason uses up the step's single retry. If the retry
also fails, the step records `unavailable: true`, and the pull-request appendix reads
"Architecture fit: not assessed — scoring unavailable" even though a valid score existed. The issue
asks for two things. First, the handoff should state the limit in the field itself. Second, a
contract test should compare the handoff's number with the limit in
`src/scripts/autopilot-core.mjs`, and its title should name that invariant.

Both are already on the planning base (HEAD `76572d46`), delivered for issue #743 by commit
`eca25b2d` ("fix(autopilot): state the reason length limit in the architecture-fit prompt
(#745)"). The archived plan for that work is
`docs/plan/archive/2026-11-25-issue-743-state-the-reason-length-limit-in-autopilot-architecture-fit-prompt.md`,
with status Implemented, and #743 is closed. Each of #797's acceptance criteria can be checked
against the current tree (see "Acceptance criteria").

The fix is not released yet. `eca25b2d` landed after the v1.80.0 release commit `059b1aea`, and
`.release-please-manifest.json` still reads `1.80.0`. The released skill therefore still says
`"<one sentence>"`, which is probably what #797 was filed from. The fix ships with the first
release-please release after v1.80.0. The open release PR #751 ("chore(develop): release
effective-flow 1.81.0") already lists #745 in its changelog, so the fix ships in v1.81.0 unless
release-please changes that PR before the release.

Goal: record that #797 needs no change to the repository, and hand the issue back so it can be
closed now as a duplicate of #743, resolved by #745 on `develop` and shipping in the first release
after v1.80.0 (decided by score; see "Decided by score").

Workflow rationale: Bugfix (`effective-flow fix`) is the category that #743 used for the same
defect. No implementation run is planned: the only remaining step is closing the issue, which no
implementing workflow does (see "Open points").

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #797
**Original outcome:** The architecture-fit handoff in `src/tools/autopilot.md` states the 300-character limit on `reason`. A test whose title names the invariant fails when that number and `LIMITS.reason` in `src/scripts/autopilot-core.mjs` differ. `node build.mjs` passes with `autopilot.md` inside its `contextBudget`, and the CI order passes.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** none for #797; the same outcome was delivered for issue #743 by commit `eca25b2d` (#745), which changed one line in a tool prompt and added one contract test.
**Continuation decision:** none

## Architecture decisions

- Make no repository change (decided by score; see "Decided by score").
  - `src/tools/autopilot.md:268` already reads
    `{"score": <integer>, "reason": "<one sentence, at most 300 characters>", "sources": ["<repository-relative path>"]}`.
    The line sits inside step 2 "Architecture fit", which ends at the spawn-site marker
    `<!-- spawn-site:autopilot/architecture-fit -->` (`:273`).
  - The invariant is pinned by
    `test/scored-decisions-contract.test.mjs:883-902`, the test "autopilot architecture-fit prompt
    states the reason limit that fit-record enforces". An `// Invariant:` comment precedes it. The
    test cuts out the step 2 text, requires exactly one
    `"reason": "<one sentence, at most N characters>"` in it, and compares N with `LIMITS.reason`,
    which it imports from `src/scripts/autopilot-core.mjs`.
  - `LIMITS` is exported at `src/scripts/autopilot-core.mjs:218-226` with `reason: 300`.
    `fitRecordOperation` (`:1062-1085`) checks the reason against it at `:1072`.
- Do not move the test into `test/workflow-contracts.test.mjs`, and do not add a second copy there.
  The issue names that file only in its proposed implementation; its acceptance criteria name no
  file. #743's plan has already weighed that placement and chose
  `test/scored-decisions-contract.test.mjs`, which holds all the other step 2 pins (`:809-880`).
  A second test would state the same contract twice, against `AGENTS.md` "Writing prompt text",
  point 2.
- Do not add a test against the built `autopilot.md`. #797's proposed implementation says
  "built", but its criteria do not require the build output. The existing test reads
  `src/tools/autopilot.md` through `tool()`. Step 2 (`:253-273`) contains no build placeholder, so
  the build copies line 268 unchanged and a second test of the built text would add nothing.

## Affected files

| File | Description |
|---|---|
| — | No file changes; the issue's requirement is already met on the planning base. |

## Implementation details

### Approach

1. Make no change to `src/`, `test/` or `docs/`.
2. If an implementation run is started anyway, it ends at its verification step: it runs the
   read-only checks under "Validation plan", produces no diff, and reports #797 as resolved by
   #745. It neither creates an empty commit nor opens a pull request.

### Component structure

Not relevant: no component changes.

### State management

Not relevant: no state changes.

### API integration

Not relevant: the `fit-record` helper and its limits stay unchanged.

### Styling approach

Not relevant: no user interface.

### Accessibility

Not relevant: no user interface.

### Edge cases

- `LIMITS.reason` or the handoff wording changes later: the existing test in
  `test/scored-decisions-contract.test.mjs` fails, so the two sides cannot drift apart unnoticed.
  #797 needs nothing more for this.
- Installed users on v1.80.0 or earlier still get the old handoff text until the next release.
  That is a release timing matter, not a repository gap; no version is bumped by hand
  (`AGENTS.md` "Versioning").
- The scored-decision scoring leaf (`src/shared/scored-decisions.md:62`) also writes reasons that
  `LIMITS.reason` caps, through `scoreList` (`src/scripts/autopilot-core.mjs:357`). That is a
  different contract, outside #797, and already tracked by the open issue #759.

## Acceptance criteria

Each criterion below restates one of #797's and is met on HEAD `76572d46`:

- [ ] `src/tools/autopilot.md` contains the string `"reason": "<one sentence, at most 300 characters>"` exactly once between `**Architecture fit.**` and `<!-- spawn-site:autopilot/architecture-fit -->` (it is at `:268`).
- [ ] `test/scored-decisions-contract.test.mjs` contains the test "autopilot architecture-fit prompt states the reason limit that fit-record enforces". It asserts that the number in that handoff equals the imported `LIMITS.reason`, so it fails as soon as the two differ.
- [ ] `node build.mjs` exits 0 and does not report a `contextBudget` violation for `autopilot`.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` each exit 0 when run in that order.
- [ ] `git status --porcelain --untracked-files=no` prints nothing after these checks.

Done when all five criteria hold on the planning base with no tracked diff.

## Validation plan

- Confirm the handoff line: search `src/tools/autopilot.md` for
  `at most 300 characters` and check that the single hit is in step 2, before the
  `autopilot/architecture-fit` spawn-site marker.
- Run `node --test test/scored-decisions-contract.test.mjs` through the project runner and confirm
  that the test "autopilot architecture-fit prompt states the reason limit that fit-record
  enforces" passes.
- Run the CI order through the project runner: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  `pnpm test:distribution`. Read the `autopilot` row of `node build.mjs`'s
  `Always-loaded core (lines/budget)` report.

## Assumptions and open points

- Assumption: #797 is a re-filed copy of #743. Their problem statements, proposed edits and
  acceptance criteria match. The only difference is the test file that #797's proposed
  implementation names, and the criteria do not name one.
- Assumption: this run did not execute the validation commands. That the CI order passes on HEAD
  `76572d46` rests on the GitHub Actions workflow "CI" having finished with `success` on that
  commit. The last change to `src/tools/autopilot.md` and to
  `test/scored-decisions-contract.test.mjs` is `eca25b2d`; the last change to
  `src/scripts/autopilot-core.mjs` is the older `ba71e1fe`.
- Out of scope: the optional truncation of an over-long reason at a word boundary before
  `fit-record`. #797 itself calls it a separate decision that this fix does not need, because it
  would change recorded content. It needs its own issue if it is wanted.

- Plan file disposition (decided by score): this plan is not published or committed. The
  caller discards it with the planning worktree after the handback, so no plan with the open
  status reaches `effective-flow open-plans`, plan routing or the autopilot architecture-fit
  sources (`src/tools/autopilot.md:258-259`). The work is already recorded in the archived #743
  plan.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->
```json
[{"site": "S-BAT", "question": "What should happen to this plan file once #797 is handed back?", "options": ["Do not publish or commit the plan; discard it with the planning worktree after the handback", "Commit the plan as Implemented, archived under docs/plan/archive/ with a pointer to #745", "Decide later"], "escape": ["Decide later"], "scores": [{"label": "Do not publish or commit the plan; discard it with the planning worktree after the handback", "score": 9, "reason": "Nothing is implemented, and the work is already recorded in the archived #743 plan and #745. Discarding the file means no Not-implemented plan can reach autopilot fit sources or open-plans, and no record is falsified. That beats option 2, which adds a duplicate and mislabeled archive record."}, {"label": "Commit the plan as Implemented, archived under docs/plan/archive/ with a pointer to #745", "score": 3, "reason": "It keeps the plan out of the open-plan sources, but plan-numbering ties archival to a delivery event of the implementing workflow. Marking a no-change plan Implemented misstates what happened and duplicates the #743 archive record, and this planning run cannot publish it anyway."}]}, {"site": "S-BAT", "question": "When should #797 be closed, given the fix is on develop but not yet released?", "options": ["Close #797 now as a duplicate of #743, noting the fix ships in the first release after v1.80.0", "Keep #797 open until the release containing #745 ships, then close it", "Decide later"], "escape": ["Decide later"], "scores": [{"label": "Close #797 now as a duplicate of #743, noting the fix ships in the first release after v1.80.0", "score": 9, "reason": "This matches the repo's convention: the close-develop-issues workflow closes issues when the fix merges to develop, which is how #743 was closed. The duplicate-plus-release note tells the reporter when to expect it, and it avoids a second issue that someone has to remember to close by hand."}, {"label": "Keep #797 open until the release containing #745 ships, then close it", "score": 3, "reason": "It closes when users actually get the fix, but that breaks the develop-merge closure convention #743 already followed. It leaves a duplicate open with no remaining work and needs a manual close after release-please ships, and the changelog already announces #745."}]}, {"site": "S-CLR", "question": "Issue #797's acceptance criteria are already met on HEAD by #745 (issue #743). What should this plan prescribe?", "options": ["No change: record #797 as resolved by #745 and hand it back for closure as a duplicate of #743", "Move the existing reason-limit test into test/workflow-contracts.test.mjs as #797 names", "Add a second reason-limit test in test/workflow-contracts.test.mjs beside the existing one", "Decide later"], "escape": ["Decide later"], "scores": [{"label": "No change: record #797 as resolved by #745 and hand it back for closure as a duplicate of #743", "score": 9, "reason": "HEAD already meets every #797 criterion: autopilot.md:268 states 300, and scored-decisions-contract.test.mjs pins it to LIMITS.reason with a named invariant. The criteria name no file. It beats moving the test because nothing needs to change."}, {"label": "Move the existing reason-limit test into test/workflow-contracts.test.mjs as #797 names", "score": 3, "reason": "This only satisfies the issue's non-binding file suggestion. It reverses #743's scored decision, splits the step 2 pins across two files, adds an autopilot-core import to a huge file, and creates build-context eval churn for no behaviour gain."}, {"label": "Add a second reason-limit test in test/workflow-contracts.test.mjs beside the existing one", "score": 1, "reason": "This duplicates an invariant that is already pinned, which breaks the 'state a contract once' rule. Every future limit or wording change would then have to be kept in sync in two tests, and it adds no coverage."}]}]
```
<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Revision required

### Summary

| Area | Critical | Important | Note |
|---|---:|---:|---:|
| Architecture | 0 | 0 | 0 |
| Security | 0 | 0 | 0 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 0 | 0 |
| Testability | 0 | 0 | 3 |
| Scope | 0 | 1 | 3 |
| Maintainability | 0 | 0 | 1 |

### Findings

Internal review, 2026-11-26 (gap analysis and plan review through `effective-delivery`). The
result is `Revision required` only because of the blocking open point: no implementation work
remains, and closing #797 is the caller's step.

- Scope, Important (gap analysis): the plan called #797 resolved without saying that the fix is
  not released yet; `eca25b2d` came after the v1.80.0 release commit `059b1aea`. Incorporated in
  "Requirement", "Edge cases" and "Open points". The closure timing was decided by score: close
  now with a release note.
- Scope, Note (gap analysis): the scored-decision leaf reason limit is already tracked by the open
  issue #759. Incorporated in "Edge cases" and the closure recommendation.
- Testability, Note (gap analysis): the CI assumption rested on one file's history. Incorporated:
  it now cites the successful CI run on HEAD `76572d46` and the last commit for each of the three
  files.
- Testability, Note (plan review): the acceptance criteria had no single completion condition, and
  `git status --porcelain` lists the untracked plan file. Incorporated: the check now uses
  `--untracked-files=no`, and the criteria end with one completion condition.
- Maintainability, Note (plan review): an open-status plan with nothing to implement would look
  routable once committed. The disposition was decided by score: the plan is not published and is
  discarded with the planning worktree.
- Scope, Note (plan review): the release that ships the fix can be named. Incorporated: v1.81.0 per
  release PR #751, with the caveat that release-please can still change it.

Deep plan review, 2026-11-26 (`effective-delivery`). It found no Critical or Important finding,
and the premises of the scored decisions still hold.

- Testability, Note: #797's proposal says the test should read the built `autopilot.md`, but the
  existing test reads the source file; the plan did not explain that difference. Incorporated in
  "Architecture decisions": the build copies step 2 unchanged, so no second test is needed.

## Open points

- Blocking: no implementation work remains. Closing #797 is a forge action that neither this
  planning run nor an implementing workflow is authorised to take. Recommendation: the caller,
  the Issue Buddy pass or the maintainer, closes #797 now as a duplicate of #743, resolved by #745
  on `develop` and shipping in the first release after v1.80.0 (v1.81.0 per release PR #751),
  points to #759 for the scored-decision leaf briefs, starts no `effective-flow fix` run, and
  discards this plan with the planning worktree instead of publishing it. Re-entry: if
  the maintainer wants the test in `test/workflow-contracts.test.mjs` after all, or wants the
  optional truncation, revise this plan with that requirement and clear this point.
