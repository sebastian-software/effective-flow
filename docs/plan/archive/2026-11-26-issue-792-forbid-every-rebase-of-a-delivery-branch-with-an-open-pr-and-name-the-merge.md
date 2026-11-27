# Forbid every rebase of a delivery branch with an open PR and name the merge alternative

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #792

## Requirement

The "Update existing PRs" paragraph in `src/shared/worktree-integration.md` (inside "Handback and
completion action (completion phase)") forbids rewriting existing PR commits "via `commit --amend`,
interactive rebase, squash or force-push". Two gaps follow from that wording:

- A plain, non-interactive `git rebase origin/<base>` of a delivery branch with an open pull request
  is not named, so the paragraph reads as if it were allowed.
- The paragraph does not say how such a branch picks up new base commits. The sanctioned
  alternative (merge `origin/<base>` into the head branch as a merge commit and push normally)
  lives in `src/shared/pr-review-comments.md`, "No history rewriting". `merge-gate`, `iterate` and
  `pr-review-integration` embed it eagerly; a `build`, `fix`, `refactor` or `docs` run reaches it
  only at completion, through the `pr-review-integration` lazy include after a PR was created or
  reused — after a rebase during implementation would already have happened.

The same narrowed wording sits in `src/shared/plan-publication.md`, "Prohibited on every path"
("an interactive `rebase`"), although republication adds commits to an open plan PR whose worktree
record carries the fetched head OID as `creationOid`.

Consequence: a delivery run that rebases the plan-PR branch onto a moved base and force-pushes it
rewrites the plan commit the worktree record stores as `creationOid`. At handback,
`worktree remove` then fails condition 6 of `src/shared/worktree-lifecycle.md` ("`creationOid` is
a commit and an ancestor of the branch tip") with `NOT_ELIGIBLE`; the owned worktree stays
`cleanup-ready`, and reviewers lose the PR's force-pushed history.

Goal: one owning statement in `worktree-integration.md` that forbids every rebase of a branch with
an open pull request, names the merge-commit alternative, and gives the `creationOid` reason in one
clause, plus a guard test that names the invariant it protects.

Workflow rationale: Bugfix. The shipped prose under `src/` is the product, and its current wording
lets a delivery run take a path that breaks worktree withdrawal and PR history. The fix corrects
that behaviour without adding a feature. Per `AGENTS.md`, `src/**/*.md` routes as product source.

Planned against worktree HEAD `76572d46`; line numbers below refer to that commit.

## Outcome checkpoint

**Primary source:** GitHub issue #792 in `github.com/sebastian-software/effective-flow`; target
fragment `src/shared/worktree-integration.md`, "Update existing PRs".
**Original outcome:** The orchestrating run of a delivery workflow never rebases a branch with an
open pull request, at any point of the run; new base commits arrive only through a normal merge
commit, so on an adopted plan PR `creationOid` stays an ancestor of the branch tip and
`worktree remove` condition 6 holds. Guarded by a test; tool budgets still pass `node build.mjs`.
**Last evaluated attempt:** None.
**No-progress count:** 0
**Cumulative approach:** Fresh baseline; no earlier attempt.
**Continuation decision:** None.

The delivery PR states its one deliberate deviation from the issue's proposal: delivery workflows
do not merge the base or resolve conflicts themselves; the paragraph names the merge commit as the
only base-update form and leaves making it to `merge-gate` and autopilot's delivery-base step (see
"Decided by score"). The PR body references the issue with `Refs #792` unless the caller chooses a
closing keyword, and names the two follow-ups under "Assumptions and open points" as follow-up
work, never with a closing keyword.

## Architecture decisions

- `src/shared/worktree-integration.md`, "Update existing PRs", becomes the single owner of the
  delivery-branch rule (no rebase of any kind on a branch with an open PR, at any point of the run;
  new base commits only as a merge commit of `origin/<base>`, pushed normally). Rationale: every
  delivering workflow (`build` through `build-delegated-run`, `fix`, `refactor`, `docs`,
  `maintain`, `iterate`, the merge-gate delegated run, autopilot and plan publication) reads this
  fragment before implementation (for example `fix.md` line 235, `refactor.md` line 224, `docs.md`
  line 263, `build-delegated-run.md` line 166), while `pr-review-comments.md` reaches delivery
  hosts only at completion.
- The rule binds the orchestrating run, which is the actor of the issue's failure scenario.
  Write-capable workers (implementers, test writer, code validator) are not changed here (decided
  by score, see "Decided by score"); see the follow-up under "Assumptions and open points".
- The reason is one clause placed directly after the prohibition: where `creationOid` is a
  pull-request commit, as on an adopted plan PR, a rewrite replaces it, so condition 6 of
  `worktree-lifecycle` fails and `worktree remove` refuses the worktree; reviewers also lose the
  PR's history. `worktree-lifecycle.md` stays the owner of the condition itself; the guard test ties
  the number to that condition so a renumbering cannot leave the reference stale.
- Every mention of rebase or force-push in the paragraph is negated ("no rebase of any kind"),
  including the reason clause, so the sentence cannot be misread as permitting a mechanism. This is
  the convention the merge-gate Git write boundary test in `test/workflow-contracts.test.mjs`
  (lines 9231–9242) pins, and the new guard test pins it the same way.
- No workflow other than `{{SKILL:merge-gate}}` and autopilot's delivery-base step
  (`autopilot-delivery-conflict`) merges the base into a branch with an open PR (decided by score);
  this binds every host of the fragment, `iterate` and plan publication included, and is stated by
  exclusion so the two performers do not read it as binding them. The owner paragraph names a merge
  commit of `origin/<base>`, pushed normally, as the only sanctioned form of a base update and names
  the two performers by pointer only, without restating their flags, counts or bounds:
  `merge-gate-delegated-run.md` (line 915) merges with Git's defaults per occurrence, and
  `autopilot-delivery-conflict.md` (lines 3–9) owns its own bound. This leaves the
  `plan-pr-continuation` implementation-evidence check (a diff against `creationOid`, lines
  264–272) correct and adds no merge mechanics to the delivery hosts.
- `pr-review-comments.md` keeps its own eager text, because `merge-gate` and `iterate` need the
  rule always loaded and `worktree-integration` is lazy there; only its stale cross-reference label
  is corrected (decided by score). Its scope sentence (lines 339–341) already contradicts
  autopilot's delivery-base step at HEAD; this plan neither creates nor resolves that tension and
  records it as a follow-up.
- `plan-publication.md` keeps its own ban list (it is a token list pinned by
  `test/workflow-contracts.test.mjs` lines 25097–25115) and only drops the "interactive" qualifier;
  it does not gain a second copy of the merge alternative.
- The guard test lives in `test/worktree-lifecycle-contract.test.mjs`, which already reads the
  fragment as `delivery` (line 68) and `worktree-lifecycle` as `lifecycle` (line 66), has
  `assertClauses` (line 71) and a `flatten` helper (line 426), and names its tests after lifecycle
  invariants.

## Affected files

| File                                        | Description                                                                                                                                                                                                                                               |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/worktree-integration.md`        | Reword the "Update existing PRs" paragraph: no rebase of any kind at any point of the run, the qualified `creationOid` reason, and the merge-commit alternative made by no workflow other than `{{SKILL:merge-gate}}` and autopilot's delivery-base step. |
| `src/shared/plan-publication.md`            | In "Prohibited on every path", replace "an interactive `rebase`" with "a `rebase` of any kind"; the backticked token stays `rebase`.                                                                                                                      |
| `src/shared/pr-review-comments.md`          | In "No history rewriting" (line 329), correct the cross-reference label "Updating existing PRs" to "Update existing PRs"; nothing else changes.                                                                                                           |
| `docs/user-guide/worktree-and-delivery.md`  | In "Updating existing pull requests" (lines 360–365), forbid a rebase of any kind and add one sentence on how new base commits reach the branch.                                                                                                          |
| `test/worktree-lifecycle-contract.test.mjs` | Add one guard test, named after the invariant, that asserts the owning paragraph's clauses on the flattened fragment text.                                                                                                                                |

## Implementation details

### Approach

1. In `src/shared/worktree-integration.md`, rewrite the "Update existing PRs" paragraph (lines
   380–385 at `76572d46`) so that it states, in this order:
   - follow-up changes on a delivery branch with a pull request are new commits on the same branch,
     pushed normally (unchanged);
   - at any point of the run, existing PR commits are never rewritten: no `commit --amend`, no
     rebase of any kind (interactive or not), no squash, no force-push;
   - the reason, in one clause with no un-negated "rebase": where `creationOid` is a pull-request
     commit, as on an adopted plan PR, such a rewrite replaces it, so condition 6 of
     `worktree-lifecycle` fails and `worktree remove` refuses the worktree, and reviewers lose the
     PR's history;
   - new base commits reach such a branch only as a merge commit of `origin/<base>` into it,
     pushed normally, and no workflow other than `{{SKILL:merge-gate}}` and autopilot's
     delivery-base step (`autopilot-delivery-conflict`, within its own bound) makes that merge;
   - a rejected normal push because of diverged remote history still stops and reports (unchanged).
     Keep the paragraph a bold-labelled paragraph at its current position, keep the label
     `**Update existing PRs:**`, and add no new heading. Name tools with the `{{SKILL:X}}`
     placeholder, as `pr-review-comments.md` (line 336) does (`build-system.md`, "Placeholder and
     directive syntax").
2. In `src/shared/plan-publication.md`, "Prohibited on every path" (line 365), change
   "an interactive `rebase`" to "a `rebase` of any kind". The ban-list test compares only the
   backticked tokens, so it stays green; confirm with `pnpm test`.
3. In `src/shared/pr-review-comments.md`, "No history rewriting" (line 329), correct
   "Updating existing PRs" to "Update existing PRs". Change nothing else there; the one-word edit
   keeps its line count, so the `merge-gate` and `iterate` budgets should not move (the build report
   confirms).
4. In `docs/user-guide/worktree-and-delivery.md`, "Updating existing pull requests" (lines
   360–365), change the list to "never via `commit --amend`, a rebase of any kind, squash, or
   force-push", and add one sentence: a branch that has fallen behind or conflicts with its base is
   brought forward only by a merge commit, made by `/effective-flow merge-gate` or, before an
   autopilot delivery, by autopilot's delivery-base step, never by a rebase. Link `merge-gate` to
   its section in `tools-deliver.md` (`## /effective-flow merge-gate`, line 405, which covers the
   behind case at line 414) using that heading's generated anchor; name autopilot's step in plain
   words, linking `tools-automation.md` only if a section anchor for it exists.
5. Add a test to `test/worktree-lifecycle-contract.test.mjs` titled after the invariant, for example
   "a delivery branch with an open PR is never rebased, so creationOid stays an ancestor of its tip".
   Slice the flattened `delivery` text from `**Update existing PRs:**` to
   `1. **Mark the plan as implemented` (the end marker occurs once) and assert:
   - `assert.doesNotMatch(paragraph, /interactive rebase/)` and a positive match for the negated,
     unqualified form (for example `/no rebase of any kind/`);
   - "at any point of the run" is present;
   - the directional pin: the same negative-lookbehind `doesNotMatch` over rebase and force-push
     that `test/workflow-contracts.test.mjs` (lines 9238–9242) uses, so a permissive sentence such
     as a rebase "before the push" fails;
   - `origin/<base>` near "merge commit" near a normal push, and `\{\{SKILL:merge-gate\}\}` named as
     the performer;
   - `creationOid` near "condition 6", and, on the `lifecycle` text, that condition 6 of
     `worktree-lifecycle.md` is the `creationOid` ancestry condition;
   - the existing "new commits" and diverged-history stop clauses still present.
     Follow the file's `assert.match` / `assertClauses` style; the test name states the invariant
     (`AGENTS.md`, "Writing prompt text", point 5). The current paragraph text is pinned by no test,
     so no other assertion has to move.
6. Run `pnpm format` on the touched files, then CI's order: `pnpm agent:check`, `pnpm test`,
   `node build.mjs`, `pnpm test:distribution`.

### Edge cases

- Delivery branch without a pull request yet: outside the issue's scope; the paragraph keeps its
  "already has a pull request" condition. See assumptions.
- `delivery.mergeMethod: rebase` is how the forge integrates a PR, not a head-branch rewrite; the
  new wording must not be read as forbidding that configuration value.
- `source-upstream-sync.md` forbids a merge commit for its local fast-forward-only source sync; the
  new rule is scoped to a delivery branch with an open PR and must not be phrased as a general
  "merge the base" instruction.
- A delivery run on a plan PR whose base has moved continues without merging the base; the PR may
  show as behind or conflicting, and `merge-gate` brings it forward later. Autopilot runs its own
  delivery-base step (`autopilot-delivery-conflict.md`) unchanged.
- A branch the run created itself (`creationOid` is the new branch's OID, `plan-publication.md`
  line 245) is not the condition-6 case; the reason clause is qualified to the pull-request-commit
  case so it does not overclaim.

## Acceptance criteria

- [ ] The "Update existing PRs" paragraph of `src/shared/worktree-integration.md` forbids every
      rebase of a branch with an open pull request, interactive or not, "at any point of the run",
      alongside amend, squash and force-push, and no longer contains "interactive rebase".
- [ ] The same paragraph gives the reason in one clause, directly after the prohibition, naming
      `creationOid` as a pull-request commit and condition 6 of `worktree-lifecycle`
      (`worktree remove`).
- [ ] The same paragraph names a merge commit of `origin/<base>`, pushed normally, as the only form
      in which new base commits reach the branch, states that no workflow other than
      `{{SKILL:merge-gate}}` and autopilot's delivery-base step makes that merge, restates neither
      performer's flags, counts or bounds, and contains no un-negated "rebase" or "force-push".
- [ ] `src/shared/plan-publication.md`, "Prohibited on every path", names "a `rebase` of any kind"
      instead of "an interactive `rebase`".
- [ ] `docs/user-guide/worktree-and-delivery.md`, "Updating existing pull requests", forbids "a
      rebase of any kind" and names the merge commit made by `merge-gate` (or, before an autopilot
      delivery, autopilot's delivery-base step) as the route for new base commits, with a working
      link to the `merge-gate` section.
- [ ] `src/shared/pr-review-comments.md` line 329 reads "Update existing PRs" and is otherwise
      unchanged; no new copy of the delivery-branch rule is added (`plan-publication.md` gains no
      merge alternative, and `pr-review-comments.md` keeps its existing text).
- [ ] `test/worktree-lifecycle-contract.test.mjs` contains a guard test whose name states the
      `creationOid` ancestry invariant and which fails for each mutation of the validation plan.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` (including its `Always-loaded core
(lines/budget)` report, with no `contextBudget` line changed) and `pnpm test:distribution`
      all pass, and the built `shared/worktree-integration.md` of every target contains
      "no rebase of any kind".

## Validation plan

- Mutation check of the guard test: temporarily (a) revert the paragraph to "interactive rebase"
  only, (b) add one permissive rebase sentence, (c) delete the merge-commit sentence, (d) delete
  the `{{SKILL:merge-gate}}` performer, and (e) drop "at any point of the run"; for each, run
  `node --test test/worktree-lifecycle-contract.test.mjs`, confirm the new test fails, restore.
- `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` in CI's order.
- Read the build's `Always-loaded core (lines/budget)` report for `build`, `fix`, `refactor`,
  `docs`, `maintain`, `iterate`, `merge-gate` and `plan`; `worktree-integration` and
  `plan-publication` are lazy includes in all of them, and the `pr-review-comments` edit keeps its
  line count, so their eager cores should be unchanged.
- `grep` the built `dist/*/effective-flow/shared/worktree-integration.md` (and the portable
  equivalent) for the placeholder-free phrase "no rebase of any kind"; confirm
  `test/execution-location-contract.test.mjs` still sees the `worktree-integration` include fence in
  the four tools.
- Check the new user-guide link resolves to the `merge-gate` heading in `tools-deliver.md`.
- `pnpm eval iterate verify`, `pnpm eval merge-gate verify` and `pnpm eval build-context verify`:
  `iterate` and `merge-gate` seed the `worktree-integration` fragment, and `build-context` reaches
  it, `plan-publication` and `pr-review-comments` through every `tools/*.md` seed
  (`evals/build-context/suite.config.mjs` lines 20–34). Freshness debt is expected and is recorded,
  not repaired, per the pragmatic test and release policy.

## Assumptions and open points

- Verified: `worktree-integration` is reached only through `lazy-include` fences (`fix.md`,
  `refactor.md`, `docs.md`, `maintain.md`, `iterate.md`, `build-delegated-run.md`,
  `merge-gate-delegated-run.md`, `autopilot-delivery-conflict.md`, `autopilot-issue-source.md`,
  `autopilot-blockers.md`, `plan-publication.md`), and `plan-publication` only through lazy
  includes (`plan.md`, `plan-pr-continuation.md`). Assumption: editing them changes no tool's eager
  core, so no `contextBudget` line needs to move; the build report confirms or refutes this.
- Verified: no source under `src/` sanctions a rebase or force-push of a head branch;
  `apply-issues.md`, `apply-review-remote.md`, `iterate.md` and `pr.md` already forbid plain
  "rebase". Only `worktree-integration.md` and `plan-publication.md` narrow the prohibition to an
  interactive rebase.
- Verified: `pr-review-comments.md` refers to this paragraph as "Updating existing PRs", while the
  label reads "Update existing PRs".
- Verified: `plan-pr-continuation.md` (lines 264–272) treats commits beyond `creationOid` as the
  run's verified commits and derives its implementation evidence from
  `git diff --name-only <creation OID>`; because delivery workflows make no base merge, this check
  stays correct and is not changed.
- Verified: `creationOid` is a pull-request commit on an adopted head (`plan-pr-continuation.md`
  lines 66 and 254, `plan-publication.md` line 250) and the new branch's OID when the run created
  the branch (`plan-publication.md` line 245).
- Assumption: a delivery branch without a pull request stays outside this change. For a branch
  created from the base, the old base commit stays an ancestor after a rebase onto a forward-moved
  base, so condition 6 is not the failure there; the plan-PR case is.
- Verified: no developer guide or ADR documents this rule, but the user guide does
  (`docs/user-guide/worktree-and-delivery.md` lines 360–365, with the same "interactive rebase"
  narrowing); no test pins that passage.
- Known existing contradiction, not created or resolved here: `pr-review-comments.md` (lines
  339–341) says "no other workflow resolves a conflict on a head branch", while
  `autopilot-delivery-conflict.md` (lines 3–9, 44 and 56–71) already resolves one conflict on a
  delivery head. Follow-up for the caller: a separate issue to reconcile that scope sentence.
- Scope decision: worker sources (implementers, test writer, code validator) carry no rebase ban of
  their own; only `src/agents/merge-conflict-resolver.md` (line 66) does, and
  `test/workflow-contracts.test.mjs` (lines 9357–9364) states that a worker should carry such a ban
  in its own source. Follow-up for the caller: a separate issue for a per-worker ban.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-CLR",
    "question": "Who merges origin/<base> into a delivery branch with an open PR, when, and what happens on a conflict?",
    "options": [
      "No base merge in delivery workflows",
      "Clean merge before push, abort and stop on conflict",
      "Clean merge before push, one conflict-resolution attempt",
      "Resolve conflicts in place and amend pr-review-comments",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "No base merge in delivery workflows",
        "score": 9,
        "reason": "Smallest change: bans every rebase and names the merge as the only base-update form while merge-gate and autopilot keep owning the merge, so nothing contradicts pr-review-comments and no evidence-check change is needed; beats option 2 by adding no new mechanics."
      },
      {
        "label": "Clean merge before push, abort and stop on conflict",
        "score": 6,
        "reason": "Safe and keeps condition 7 clean, but adds a new merge step to every delivery run that duplicates autopilot's delivery-base step and merge-gate and must be ordered around the creationOid evidence check, which the issue's outcome does not need."
      },
      {
        "label": "Clean merge before push, one conflict-resolution attempt",
        "score": 4,
        "reason": "Puts conflict resolution into build, fix, refactor and docs, contradicting pr-review-comments' scope sentence and copying the long autopilot resolver chain, so length and maintenance cost rise a lot."
      },
      {
        "label": "Resolve conflicts in place and amend pr-review-comments",
        "score": 2,
        "reason": "Unguarded in-place resolution can leave a conflicted checkout that fails condition 7, and it edits the eagerly embedded pr-review-comments, moving merge-gate and iterate cores and eval evidence, on an unverified issue proposal."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How is src/shared/pr-review-comments.md (No history rewriting) treated once worktree-integration.md Update existing PRs becomes the single owner of the delivery-branch rule?",
    "options": [
      "Leave pr-review-comments.md unchanged",
      "Correct only its cross-reference label",
      "Replace its general no-rewrite paragraph with a pointer",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Leave pr-review-comments.md unchanged",
        "score": 4,
        "reason": "It avoids the context-budget churn and the eval evidence debt, but it leaves the verified wrong cross-reference label 'Updating existing PRs', which no longer matches the owner it names."
      },
      {
        "label": "Correct only its cross-reference label",
        "score": 8,
        "reason": "It fixes the verified label defect, keeps the eagerly loaded rule that merge-gate and iterate need, and adds no length. It still creates eval debt for one changed word, and two short restatements remain, which the issue explicitly allows."
      },
      {
        "label": "Replace its general no-rewrite paragraph with a pointer",
        "score": 3,
        "reason": "It removes the second copy, but the pointer leads to worktree-integration, which is lazy-loaded where merge-gate and iterate need the rule. The repair paragraphs' 'the rule above' would lose its target. Eval debt grows and the rule is no longer present eagerly."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "The no-rebase rule lives in worktree-integration.md, which only the orchestrating run reads; write-capable workers carry no rebase ban in their own sources. How does the plan handle workers?",
    "options": [
      "Bind the orchestrating run and leave workers to a follow-up",
      "Add the ban to a shared fragment write-capable workers include",
      "Pass the ban in every write-capable worker brief",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Bind the orchestrating run and leave workers to a follow-up",
        "score": 7,
        "reason": "Matches the issue's scope and its orchestrator failure scenario, with no eager-core or eval-debt growth. The edge over option 2 is that it stays honest if the outcome is narrowed and the worker gap goes to a follow-up."
      },
      {
        "label": "Add the ban to a shared fragment write-capable workers include",
        "score": 6,
        "reason": "Fits the per-worker-source principle, but pre-commit-gate reaches only the five implementers (test-writer and code-validator don't include it). It also adds cost to six tool cores and eval debt beyond the issue."
      },
      {
        "label": "Pass the ban in every write-capable worker brief",
        "score": 3,
        "reason": "It relies on the orchestrator's brief, so no worker's own source forbids the rewrite. That is the inheritance by implication that the workflow-contracts.test.mjs precedent rejects, and there is no per-worker guard."
      }
    ]
  }
]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

Internal review (2026-11-26): one full judgment, then one full ladder judgment after the scored
decisions were worked in (they changed architecture decisions and acceptance criteria and touch a
cross-module delivery contract). Deep plan review (2026-11-26): one full judgment; its one
decision-requiring finding was decided by score, and every other finding was incorporated. The
summary counts all three judgments.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         3 |    3 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         0 |    4 |
| Scope           |        0 |         0 |    5 |
| Maintainability |        0 |         1 |    3 |

### Findings

Internal review and ladder:

- Maintainability, Important: the user guide (`docs/user-guide/worktree-and-delivery.md`,
  "Updating existing pull requests") carries the same "interactive rebase" narrowing and would
  contradict the new rule. Incorporated: the guide is in Affected files, Approach step 4 and the
  acceptance criteria.
- Architecture, Important: the plan said autopilot's delivery-base step brings forward any branch
  that is behind or conflicting; it merges only on a conflict, within its own bound. Incorporated:
  the step is named by pointer only.
- Architecture, Important: the claim that the decision keeps `pr-review-comments.md`'s scope
  sentence true was wrong, because autopilot's step already resolves a head-branch conflict.
  Corrected; recorded as a known existing contradiction with a follow-up.
- Architecture, Note: "one `--no-ff` merge commit" as the only form would contradict
  `merge-gate`'s default-flag, per-occurrence merge. Incorporated: the owner sentence states only
  the form.
- Architecture, Note: it was unclear which hosts the no-merge sentence binds. Incorporated: stated
  by exclusion.
- Testability, Note: the planned reason clause carried an un-negated "rebase" and the test lacked
  the directional pin. Incorporated.
- Testability, Note: the mutation checks did not cover removing the merge alternative.
  Incorporated: mutations (c) and (d).
- Testability, Note: `build-context` eval freshness debt was not listed. Incorporated.
- Scope, Note: the user-guide sentence named only `merge-gate`. Incorporated.
- Scope, Note: the deviation from the issue's in-place conflict resolution had no reporting duty.
  Incorporated under Outcome checkpoint.
- Scope, Note: "no second full copy" could not hold with `pr-review-comments.md` keeping its text.
  Incorporated: reworded to "no new copy".
- Maintainability, Note: a bare "condition 6" reference could go stale. Incorporated: the test
  ties the number to the lifecycle condition.

Deep plan review:

- Architecture, Important: the former open point offered widening the `pr-review-comments.md`
  edit, which reopened the scored label-only decision, and one acceptance criterion still allowed
  that. Incorporated: the contradiction is recorded as existing, with a follow-up, and the
  criterion no longer allows further edits.
- Architecture, Note: the reason clause overclaimed for branches the run created and could read as
  referring to the merge. Incorporated: qualified to the pull-request-commit case and moved
  directly after the prohibition.
- Error cases, Note: the rule binds only the orchestrating run, not write-capable workers. Decided
  by score: the outcome is narrowed to the orchestrating run, and a per-worker ban is a follow-up.
- Testability, Note: "at any point of the run" was unpinned and the tool-reference form was open.
  Incorporated: assertion and mutation (e), `{{SKILL:merge-gate}}`, and a placeholder-free dist
  grep phrase.
- Maintainability, Note: the owner paragraph restated autopilot's bound against the plan's own
  "no count" rule. Incorporated: pointer only.
- Maintainability, Note: the user-guide list wording and link target were imprecise.
  Incorporated: "a rebase of any kind" and a link to the `merge-gate` section.
- Scope, Note: the deviation statement named only `merge-gate`. Incorporated: both performers.
- Scope, Note: load paths, budgets and cited lines were confirmed; no change needed.

## Open points

- No open points.
