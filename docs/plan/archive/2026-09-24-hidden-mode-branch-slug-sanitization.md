# Keep the product name out of hidden-mode branch slugs

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)

## Requirement

In hidden mode (`visibility: hidden`) no delivery branch may name Effective Flow. The prefix is
already covered: it is empty by default, and a prefix containing `effective-flow` is rejected. The
**slug** is not. Delivery branches are built as `<delivery.branchPrefix>/<skill>/<slug>`, or
`<skill>/<slug>` with the empty hidden-mode prefix. The slug is derived from the plan title, the task
description, the issue, or the finding, so a plan titled "Integrate Effective Flow into CI" produces
`build/integrate-effective-flow-into-ci`.

Nothing leaks today, because `pr` refuses such a head branch before any push (PR #459, commit
`813161d`). But the refusal comes at the very end: implementation, tests, review and commit have
already run, the run stops with a rename hint, and the user has to rename the branch and repeat the
PR step by hand. The optional note recensor left on the approved review of PR #459 describes exactly
this.

Goal: the slug is sanitized **when the branch name is built**, so a hidden-mode run never creates a
disclosing branch name in the first place. The `pr` pre-push check stays as the backstop.

Classification: Bugfix. A hidden-mode run fails avoidably late, and the fix is a correction to how
an existing branch name is built, not new functionality.

Planning basis: `develop` at `7ebba7a`, 2026-09-24.

## Architecture decisions

- **One disclosure rule, referenced rather than re-stated.** The rule is the one the helper applies
  in `assertUndisclosed` (`PRODUCT_NAME_PATTERNS` in `src/scripts/remote-tracker-shared-core.mjs`):
  `effective` and `flow` joined directly or by `-`, `_` or `.`, case-insensitive, or `Effective Flow`.
  `src/tools/pr.md` step 2 already states it in prose; the construction rule uses the same wording
  so the two cannot drift apart.
- **Sanitize at construction, in hidden mode only.** Standard mode keeps its current slugs byte for
  byte; the default prefix there is `effective-flow` anyway.
- **Sanitization rule.** Drop every matched occurrence from the slug together with any letters or
  digits attached to it up to the nearest hyphen, so no word fragment survives (`effective-flows-guide`
  becomes `guide`, not `s-guide`), and collapse the hyphens left behind. If nothing meaningful remains, use the neutral fallback slug `change`. The existing
  collision rule (append `-2`, `-3`, …) then applies unchanged.
- **Report the adjustment** in one line naming the original and the chosen slug, so the user is not
  surprised by a branch name that differs from the plan title.
- **Scope of construction sites.** Only branches that can reach the forge:
  - `src/shared/worktree-integration.md`, "Construct delivery branch names" (used by `build`, `fix`,
    `refactor`, `docs` and `maintain`);
  - `src/tools/deliver.md` step 3.2 (`deliver/<slug>`).

  Out of scope: `apply-review-remote` and `apply-issues`, which already stop in hidden mode before
  any branch exists, and the local component branches of `apply-review`, which are integrated by
  cherry-pick and never pushed.

- **No new code.** Branch construction is prose that the agent performs; there is no script to
  change. The helper's `pr-create` check and the `pr` pre-push check remain the enforced backstops.

## Affected files

| File                                       | Description                                                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/worktree-integration.md`       | Step 4 of "Shared preconditions": in hidden mode, sanitize the derived slug against the disclosure rule, fall back to `change`, report the adjustment. This fragment is eager, so keep it to 1–2 lines. |
| `src/tools/deliver.md`                     | Step 3.2: the same sanitization for `deliver/<slug>`, by reference to the construction rule rather than a second copy.                                                                                  |
| `build.mjs`                                | `CONTEXT_BUDGET_LINES` for every tool whose built count exceeds its budget, using the counts `node build.mjs` reports, headroom ≤ 10.                                                                   |
| `test/workflow-contracts.test.mjs`         | Extend the test "an empty delivery prefix drops the prefix segment: branches read <skill>/<slug>" (or add a neighbour) with assertions for the sanitization, the fallback and the report in both files. |
| `docs/user-guide/worktree-and-delivery.md` | One clause in the "Hidden mode" section: slugs are cleaned of the product name, with the fallback.                                                                                                      |

## Implementation details

### Approach

1. Extend step 4 of "Shared preconditions" in `src/shared/worktree-integration.md`: in hidden mode,
   remove every match of the disclosure rule (the same wording as `pr.md` step 2) from the derived
   slug together with any letters or digits attached to it up to the nearest hyphen, collapse repeated or edge hyphens, use `change` when the result is empty, then apply the
   collision suffix. Report original and chosen slug in one line.
2. In `src/tools/deliver.md` step 3.2, state that the hidden-mode slug is sanitized per that
   construction rule before the collision check.
3. Run `node build.mjs`, adopt the reported counts into `CONTEXT_BUDGET_LINES` where a budget is
   exceeded.
4. Add the contract assertions and run a cp-snapshot mutation check on the new sentence.
5. Update the user-guide clause.
6. Run the CI sequence.

### Edge cases

- **Slug made only of the product name** (plan titled "Effective Flow"): the result is empty, so the
  fallback `change` applies, e.g. `build/change`.
- **Split spellings** such as `effective-flow`, `effective_flow`, `effectiveflow`, `Effective Flow`:
  all match, because the rule itself is case-insensitive and accepts every separator form; it does
  not rely on how the slug was normalized.
- **Attached fragments** such as `effective-flows` or `effectiveflowish`: the whole hyphen-delimited
  word carrying the match is dropped, never just the matched characters.
- **Words that only contain one half** ("effective caching", "workflow"): no match, the slug is kept.
  The rule requires both halves joined.
- **Collision after sanitization**: two plans that both collapse to `change` get `change-2`, by the
  existing rule.
- **A user-supplied branch name** is not rewritten; the `pr` pre-push check still refuses a
  disclosing one.

## Acceptance criteria

- [ ] `src/shared/worktree-integration.md` step 4 states, for hidden mode, the removal of disclosure
      rule matches from the slug, the `change` fallback, and the one-line report; standard mode
      wording is unchanged.
- [ ] `src/tools/deliver.md` step 3.2 applies the same sanitization to `deliver/<slug>` by reference.
- [ ] A contract test in `test/workflow-contracts.test.mjs` pins the sanitization, the fallback and
      the report in both files, and fails when the sentence is removed (confirmed by a mutation
      check).
- [ ] `docs/user-guide/worktree-and-delivery.md` "Hidden mode" section mentions the sanitization.
- [ ] `pnpm agent:check`, `node build.mjs`, `pnpm test` and `pnpm test:distribution` all exit 0.

Completion condition: every box above is checked, with the CI sequence as the final gate.

## Validation plan

- `node --test test/workflow-contracts.test.mjs` for the new assertions, plus a cp-snapshot
  mutation check (never `git checkout`).
- Full CI sequence: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- `worktree-integration.md` is included by `merge-gate` and `iterate` as well, so this change is a
  merge-gate eval input: `pnpm eval merge-gate verify` will report the archive stale. The re-record
  already owed since PR #459 covers it; no separate round is needed.

## Assumptions and open points

- Assumption: `change` is an acceptable neutral fallback slug. It carries no product or task
  information, which is the point.
- Out of scope: rewriting user-supplied branch names, and the local `apply-review` component
  branches that never reach the forge.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         1 |    0 |

### Findings

- **Maintainability, Important (incorporated):** A second prose copy of the disclosure rule could
  drift from `PRODUCT_NAME_PATTERNS`. The plan requires the same wording as `pr.md` step 2 and a
  pointer to the helper constant rather than a new formulation.
- **Error cases, Important (incorporated):** A slug consisting only of the product name would become
  empty and produce a malformed branch such as `build/`. The `change` fallback and the existing
  collision rule cover it.
- **Scope, Note (incorporated):** `worktree-integration.md` is also a merge-gate eval input, so the
  validation plan states the stale verdict and folds it into the re-record already owed.
- **Architecture, Note:** `worktree-integration.md` is an eager fragment charged to several tools'
  budgets; the change is limited to one or two lines and `deliver.md` references it instead of
  copying it.
- **Testability, Note:** The behaviour lives in prose, so the contract test plus mutation check is
  the strongest available guard; the `pr` pre-push check remains the enforced backstop.

### Deep review 2026-09-24

**Result:** Approved

- **Error cases, Important (incorporated):** Removing only the matched characters left fragments
  such as `s-guide`. The rule now drops each match together with the letters or digits attached to
  it up to the nearest hyphen.
- **Scope, Note (incorporated):** The edge-case rationale claimed slug generation lowercases first,
  which no contract states. It now rests on the rule being case- and separator-insensitive itself.
- **Maintainability, Note (decided):** The empty-result fallback stays `change`: neutral, short, and
  deterministic, with the existing collision suffix for repeats.

## Open points

- No open points.

## Test results

- Regression: a new contract test in `test/workflow-contracts.test.mjs` failed before the fix and passes after it; a cp-snapshot mutation check confirmed it guards the new sentence. It also pins the identical disclosure-rule wording in `pr.md`, `worktree-integration.md` and `deliver.md`.
- `pnpm agent:check`, `node build.mjs`, `pnpm test` (1346 tests, 1345 pass, 1 skipped), `pnpm test:distribution`: all exit 0. No budget change was needed.
- Deviation: `deliver.md` states the rule in the same words instead of only pointing to `worktree-integration.md`, because `deliver` never loads that fragment.
