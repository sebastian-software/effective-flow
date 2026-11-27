# Name autopilot delivery-base step in the PR review conflict-repair scope

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #824

## Requirement

The "No history rewriting" section of `src/shared/pr-review-comments.md` (conflict paragraph,
lines 339–344) states that the conflict repair on a head branch is "likewise performed by
`{{SKILL:merge-gate}}` and scoped to it – no other workflow resolves a conflict on a head branch"
(lines 340–341). That claim is no longer true: autopilot's delivery-base step
(`src/shared/autopilot-delivery-conflict.md`, lines 3–9) makes exactly one automatic attempt to
resolve a textual conflict with the base and commits the result as one merge commit on the
unrebased head. `src/shared/worktree-integration.md`, "Update existing PRs" (lines 386–389),
already names both performers, and so does `src/shared/merge-gate-conflict-resolution.md`
(lines 10–12). The delivery-base step can run on an existing plan PR's head
(`autopilot-delivery-conflict.md`, line 44), so the false claim matters. `merge-gate` and `iterate` load `pr-review-comments.md` eagerly and
`worktree-integration.md` only lazily, so the two fragments currently give agents contradictory
lists, and a later edit relying on "no other workflow resolves a conflict" could silently break
autopilot's delivery-base step.

Goal: correct the scope clause so both fragments name the same set of workflows that may resolve a
conflict on a head branch, without changing the built line count of any tool, and protect that
invariant with a guard test.

Workflow rationale: the change corrects a wrong statement in shipped product source (`src/**/*.md`
routes as product source, not as documentation per `AGENTS.md`), with no intended behaviour change
beyond removing the contradiction. That is a Bugfix (`effective-flow fix`), committed as `fix(...)`.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow, issue #824
**Original outcome:** `pr-review-comments.md`, `worktree-integration.md` and
`merge-gate-conflict-resolution.md` name the same workflows
(`merge-gate` and autopilot's delivery-base step) as the only ones that resolve a conflict on a head
branch; no tool's `contextBudget` changes; a guard test protects the invariant.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** one-paragraph rewording in one shared fragment plus one guard test
**Continuation decision:** none

## Architecture decisions

- Reword only the scope clause of the conflict paragraph in `src/shared/pr-review-comments.md`,
  using the issue's replacement wording ("likewise performed by `{{SKILL:merge-gate}}`; besides it,
  only autopilot's delivery-base step (`autopilot-delivery-conflict`) resolves a conflict on a head
  branch, within its own bound."). Rationale: this matches the wording already used in
  `worktree-integration.md` lines 387–389 and keeps one owning statement per fragment.
- Name the fragment as a plain backticked `autopilot-delivery-conflict`, not as a placeholder.
  Rationale: `{{SKILL:X}}` is reserved for tools; shared fragments are referenced as plain
  backticked names (`worktree-integration.md:388`, `merge-gate-conflict-resolution.md:11`,
  `config-merge-gate-keys.md:15`).
- Keep the conflict paragraph at exactly six source lines (339–344) by rewrapping its remaining
  sentences. Rationale: `pr-review-comments.md` is eager in `merge-gate` (981/981) and `iterate`
  (1910/1910), and the guard in `build.mjs` (around line 2648) counts built lines with
  `split('\n').length`, so any added line fails the build. A six-line rewrap with the issue's exact
  clause needs one or two lines of about 103 characters; that is acceptable because the file has no
  width guard and already holds many lines over 100 characters, so no shortening of the issue's
  clause is needed.
- Leave the "fallen behind" paragraph (lines 334–337) unchanged: autopilot never merges a branch
  that is only behind its base (`src/shared/autopilot-delivery-conflict.md` lines 55–58, step 5:
  only a merge that stops with conflicts continues; any other outcome is `merge-failed`).
- Host one guard test in `test/workflow-contracts.test.mjs` that covers all three fragments naming
  the head-branch conflict performers (`pr-review-comments.md`, `worktree-integration.md`,
  `merge-gate-conflict-resolution.md`), so the test's invariant title is literally true. Each
  fragment is cut to its own paragraph with the existing `boundedSlice()` helper (line 100) first,
  and only that slice is normalised with `prose()` (line 270), so the assertions are independent of
  line wrapping but cannot be satisfied by text elsewhere in the file. One cross-fragment test is
  preferred over adding a clause to the existing per-paragraph test in
  `test/worktree-lifecycle-contract.test.mjs` (lines 1231–1276), because the invariant spans
  fragments and should be stated once.

## Affected files

| File                               | Description                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/pr-review-comments.md` | Replace the scope clause of the conflict paragraph in "No history rewriting" and rewrap the paragraph's remaining sentences so it stays six lines; no other text changes.                                                                                                                       |
| `test/workflow-contracts.test.mjs` | Add one guard test whose title names the invariant that every fragment lists the same workflows that may resolve a conflict on a head branch; it checks bounded paragraphs of `pr-review-comments.md`, `worktree-integration.md` and `merge-gate-conflict-resolution.md` (all three read only). |

## Implementation details

### Approach

1. In `src/shared/pr-review-comments.md`, conflict paragraph (lines 339–344), replace the clause
   "likewise performed by `{{SKILL:merge-gate}}` and scoped to it – no other workflow resolves a
   conflict on a head branch." with the issue's replacement clause quoted under "Architecture
   decisions". Keep the paragraph's opening ("A head branch that **conflicts** … the **second**
   sanctioned repair") and its closing sentence ("It changes nothing about the rule above: … is
   reported instead of performed.") word for word; only redistribute the line breaks so the
   paragraph still spans exactly six lines.
2. Do not touch the "fallen behind" paragraph, the "New work goes exclusively as new commits"
   paragraph, or any other section of the fragment.
3. In `test/workflow-contracts.test.mjs`, add one test that, for each fragment, first cuts the raw
   paragraph with `boundedSlice()` and only then normalises that slice with `prose()`:
   - `src/shared/pr-review-comments.md`: the slice from "A head branch that **conflicts**" to "is
     reported instead of performed." must name `{{SKILL:merge-gate}}` and
     `autopilot-delivery-conflict`; for the negative check, the whole "### No history rewriting"
     section, cut with `section(text, '### No history rewriting')` (line 85; the section runs to the
     end of the file, so it has no stop heading for `boundedSlice()`), must no longer contain "no
     other workflow resolves a conflict";
   - `src/shared/worktree-integration.md`: the slice from "**Update existing PRs:**" to
     "1. **Mark the plan as implemented" must name `{{SKILL:merge-gate}}` and
     `autopilot-delivery-conflict`;
   - `src/shared/merge-gate-conflict-resolution.md`: its opening paragraph (the slice from
     "## Conflict-resolution delegation contract" to "with its own stated substitutions.") must name `{{SKILL:merge-gate}}` and
     `autopilot-delivery-conflict`.
     Its title names the invariant, for example "every fragment lists the same workflows that may
     resolve a conflict on a head branch", as the issue prescribes. A one-line comment above the test
     states that it pins the two named performers in each fragment plus the removal of the old
     exclusivity phrase, not a full set comparison, because the fragments spell the performers
     differently (`{{SKILL:autopilot}}` in `merge-gate-conflict-resolution.md`, "no workflow other
     than …" in `worktree-integration.md`). The two other fragments already satisfy their
     assertions; only `pr-review-comments.md` changes.
4. Run `pnpm format` (or check with `pnpm agent:check`) and confirm oxfmt preserves the manual line
   breaks: `.oxfmtrc.json` sets no `proseWrap`, and neighbouring lines of the fragment already vary
   widely in width (lines 326–337), which a reflowing formatter would not leave. The comment above
   `prose()` in `test/workflow-contracts.test.mjs` (lines 264–269) says oxfmt reflows Markdown; this
   step settles it for this file, and the test design does not depend on either answer.
5. Run `node build.mjs` and confirm the `Always-loaded core (lines/budget)` report still shows
   `merge-gate` 981/981 and `iterate` 1910/1910 and that no `contextBudget:` line in `src/tools/`
   changed.

### Edge cases

- The issue's clause is longer than the old one (about 70 characters). If the six-line rewrap would
  push a line well past the file's usual width, rebalance the line breaks across the paragraph's
  later lines; never add a seventh line and never change a `contextBudget` value.
- `{{SKILL:merge-gate}}` expands to a longer string in the built output; this changes built line
  lengths only, not the built line count the budget guard measures.
- Other tools that include `pr-review-comments.md` through `pr-review-integration.md` are equally
  unaffected, because the edit is line-count neutral.
- `test/unattended-planning-contract.test.mjs` (around line 242) keys an exclusion table on exact
  phrases of `pr-review-comments.md`; the known entries concern set-aside confirmation and pending
  checks and do not quote the edited clause. The full `pnpm test` run confirms that no entry quotes
  it.

## Acceptance criteria

- [ ] Compared on `prose()`-normalised text of the bounded conflict paragraph, the "No history
      rewriting" section of `src/shared/pr-review-comments.md` contains the issue's replacement clause
      naming `autopilot-delivery-conflict` and no longer contains "no other workflow resolves a
      conflict"; the "fallen behind" paragraph is byte-identical to `origin/develop`.
- [ ] The conflict paragraph still spans exactly six source lines, and
      `git diff --stat origin/develop -- src test` lists only `src/shared/pr-review-comments.md` and
      `test/workflow-contracts.test.mjs` (the plan file's own archival under `docs/plan/` is excluded).
- [ ] The new guard test in `test/workflow-contracts.test.mjs` passes, checks bounded paragraphs of
      all three fragments, and its title names the invariant that every fragment lists the same
      workflows that may resolve a conflict on a head branch.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all pass in
      CI's order, with no `contextBudget:` line in `src/tools/` changed.

## Validation plan

- `pnpm agent:check` (formatting unchanged apart from the edited paragraph).
- `pnpm test`, including the new guard test in `test/workflow-contracts.test.mjs`.
- `node build.mjs`, reading the `Always-loaded core (lines/budget)` report for `merge-gate`
  (981/981) and `iterate` (1910/1910).
- `pnpm test:distribution`.
- `git diff --stat origin/develop -- src test` shows only the two affected files, and
  `git diff origin/develop -- src/tools` is empty.
- Inspect `git diff origin/develop -- src/shared/pr-review-comments.md`: the conflict paragraph
  carries the issue's replacement clause word for word (modulo line breaks), and nothing else in
  the file changed. The guard test deliberately pins only the two performer names and the removed
  phrase, not the full clause.
- `pnpm eval merge-gate verify`, `pnpm eval iterate verify` and `pnpm eval build-context verify`
  (read-only) report the resulting evidence-freshness debt; recording new evidence is not part of
  this plan.

## Assumptions and open points

- Assumption: oxfmt's default prose handling preserves manual line breaks, because `.oxfmtrc.json`
  sets no `proseWrap` and the fragment's line widths already vary widely; step 4 of the approach
  verifies this.
- Verified: the six-line rewrap is feasible. The new clause adds about 66 characters, bringing the
  paragraph to about 580 characters; a word-boundary wrap needs a width of at least 103 characters
  for six lines, and no line-width guard exists.
- Assumption: editing `pr-review-comments.md` creates behavioural-eval freshness debt for the
  `merge-gate`, `iterate` and probably `build-context` suites (their load sets reach the fragment
  through `tools/merge-gate.md` and `tools/iterate.md`). Under
  `docs/adr/pragmatic-test-release-policy.md` that debt is reported, not blocking, so re-recording is
  out of scope.
- Verified: no other text in `src/`, `docs/` (outside `docs/plan/archive/`), `AGENTS.md` or `test/`
  claims that only `merge-gate` resolves a head-branch conflict, and no existing test asserts the old
  sentence.
- Out of scope: `src/agents/merge-conflict-resolver.md` (lines 12–15) still describes only
  `{{SKILL:merge-gate}}` as the caller that starts the merge and completes and pushes the merge
  commit, although autopilot's delivery-base step also spawns it with its own substitutions
  (`src/shared/autopilot-delivery-conflict.md`, lines 59–69). That text makes no exclusivity claim
  about head-branch conflicts, so this plan leaves it unchanged; it is a candidate for a separate
  follow-up issue.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    4 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    2 |

### Findings

- Testability, Note: the negative check over the whole "No history rewriting" section had no
  stop marker, because the section runs to the end of the file. Incorporated: approach step 3 now
  cuts that section with `section()` and keeps `boundedSlice()` for the positive paragraph checks.
- Testability, Note: the invariant title promises "the same workflows" while the assertions check
  inclusion of the two named performers plus removal of the old exclusivity phrase. Incorporated:
  the issue-prescribed title stays, and approach step 3 adds a one-line test comment stating that
  scope, since the fragments spell the performers differently and a set comparison would be
  brittle.
- Maintainability, Note: the `prose()` line reference was off by one. Incorporated: corrected to
  line 270.
- Gap analysis (before this review): two Important findings (unbounded test slices that could pass
  without checking the paragraph; diff-scope checks that would fail once the plan is archived) and
  four Notes (third fragment `merge-gate-conflict-resolution.md` outside the invariant, clause
  matching across line breaks, unsourced "fallen behind" rationale, uncited oxfmt evidence) were
  all incorporated into the architecture decisions, approach, acceptance criteria, validation plan
  and assumptions.
- Deep review, Testability, Note: the exact replacement clause had no stated check, since the guard
  test pins only the performer names and the removed phrase. Incorporated: the validation plan now
  inspects the diff of `pr-review-comments.md` for the clause; the test stays deliberately narrow.
- Deep review, Testability, Note: the `merge-gate-conflict-resolution.md` slice named no start
  marker. Incorporated: approach step 3 names "## Conflict-resolution delegation contract".
- Deep review, Maintainability, Note: the six-line rewrap needs one or two lines of about 103
  characters, not "about 100". Incorporated: the architecture decision and the assumption now state
  the 103-character minimum and why it is acceptable.
- Deep review, Scope, Note: `src/agents/merge-conflict-resolver.md` still describes only
  `merge-gate` as its caller. Deliberately not incorporated: it makes no head-branch exclusivity
  claim, so it stays out of scope and is recorded under assumptions as a follow-up candidate.

## Open points

- No open points.
