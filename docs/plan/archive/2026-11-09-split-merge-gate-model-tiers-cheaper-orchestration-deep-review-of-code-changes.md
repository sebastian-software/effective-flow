# Split merge-gate model tiers: cheaper orchestration, deep review of code changes

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Today the delegated merge-gate run and every iterate round it dispatches run at tier `deep` (Opus, effort `high`). Most of that run is orchestration: waiting on checks, reading bot threads, evaluating guards and merging. The per-spawn model tiers ADR records that merge-gate-dominated sessions carried 68 % of total cost.

Target split, as decided by the maintainer on 2026-11-09:

- **Orchestration** runs at `standard` (Sonnet, effort `medium`). This covers the delegated merge-gate run and the iterate run that merge-gate dispatches per round.
- **Judgment and code changes** keep `deep`. That covers the review-item classification of iterate, the conflict resolver, and the implementation workflows that iterate delegates to.
- **Every code change** the gate produces gets a `deep` review **before it is committed**. Today a conflict resolution gets only the `standard` `code-validator`. An iterate item routed to `fix` in TS/JS/Rust gets no `deep` reviewer either, because `fix/verification` adds `generic-product-reviewer` only for degraded buckets. Tooling changes such as lockfiles, CI workflows and build scripts get a `deep` review as well.

This decision supersedes the earlier one recorded in `test/model-tiers-contract.test.mjs` (~715-718): "irreversible merge and third-party-controlled PR text (user decision)". The merge itself follows fixed, helper-evaluated preconditions. PR text stays data. Every code change is now reviewed at `deep`.

Workflow: Feature. It deliberately changes orchestration behavior by adding one judgment spawn and two review steps and lowering two tiers.

Basis: `.effective-flow/investigation/investigation-2026-11-09-merge-gate-delegated-run-tier-deep.md` (local diagnosis report).

## Outcome checkpoint

**Primary source:** sebastian-software/effective-flow `origin/develop`; local investigation report above
**Original outcome:** merge-gate and iterate orchestration on `standard`; review-item classification on `deep`; every gate-produced code change reviewed at `deep` before its commit
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** none yet
**Continuation decision:** none

## Architecture decisions

- **`merge-gate/delegated-run` → `standard`, `Down: no`.** `mechanical` is ruled out. The run holds merge authority and meets none of the mechanical eligibility criteria in `docs/developer-guide/build-system.md`.
- **`merge-gate-delegation-contract/iterate-delegation` → `standard`, `Down: no`.** The iterate runner keeps only orchestration: freshness, approval, routing, commits, replies and resolution.
- **New site `iterate/classification`, `deep`, `Down: no`.** This is a read-only judgment spawn. It runs the `effective-delivery` Mode C classification (`pr-review-handoff/v1`) and the high-risk triage that iterate runs in its own context today (`src/tools/iterate.md` "Classification delegation", ~143-154, and ~667). It writes nothing and returns the handoff JSON. The runner validates it as today. This applies to every iterate run, including user-invoked ones, so one rule holds.
- **New site `iterate/review`, `Down: no`.** Tier: `role:frontend-reviewer,nodejs-reviewer,rust-reviewer,generic-product-reviewer`. This is a routed read-only review **per item, of its uncommitted diff, before that item's `commit create`** in Phase 3. It is not after Phase 4: iterate commits each item in Phase 3 (iterate.md ~767), so a later review could not keep rejected code out of history. This also keeps "one commit per thread/item".
- **New site `merge-gate-conflict-resolution/review`, same role set, `Down: no`.** This is a read-only routed review of the resolved merge, after reconcile and verify, before step 5 (commit and push).
- **Reviewer selection for both review sites.** Reuse the route already resolved for the item or the conflict verification through `src/shared/project-routing.md`. That means `frontend-js-ts`, `node-backend-cli`, `rust` and `generic-product` map to their reviewers, **`tooling` maps to `generic-product-reviewer` (`deep`)** in addition to the validator, and `documentation` needs no `deep` reviewer, so its validator suffices and is recorded. The review sites trigger no new `ambiguous` clarification: an ambiguous path is already resolved, or has stopped, upstream.
- **Unchanged:** `iterate/item-delegation` (`deep`), `merge-gate-conflict-resolution/resolver` (`deep`), `merge-gate-conflict-resolution/verification`, `iterate/validation`. Iterate keeps declaring `no-review-capability` (`src/shared/pr-review-integration.md` ~44-55). Its per-item review is no whole-PR review.
- **Fail closed.** If a required `deep` reviewer or the classification spawn is unavailable or declined, the item is not committed, or the conflict resolution commits nothing. No silent inline downgrade happens. A host that forces the subagent model (`CLAUDE_CODE_SUBAGENT_MODEL_FORCE`) keeps the existing host-override rule and is disclosed once. Classification alone keeps iterate's existing minimal local fallback, with disclosed reduced depth, as today.
- **ADR:** add a new dated decision to `docs/adr/per-spawn-model-tiers.md`. Amend the "delegated implementation workflow runs (… `iterate`) are `deep`" sentence (~90-96) and the lean-orchestrator lines (~153-163). Record the trade-off honestly: merge authority now runs on Sonnet.

## Affected files

| File                                                 | Description                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/model-tiers.md`                          | Site table: two rows `deep` → `standard`; three new rows (`iterate/classification`, `iterate/review`, `merge-gate-conflict-resolution/review`)                                                                                                                                                                                |
| `src/tools/iterate.md`                               | "Classification delegation" and Phase 2: dispatch the classification spawn with a marker; Phase 3: per-item review step between the item's DONE and its `commit create`, with a marker and the finding handling; keep `no-review-capability`; replace the "has no reviewer phase at all" sentence (~887) with an accurate one |
| `src/shared/merge-gate-conflict-resolution.md`       | Delegation contract: ordered layers reconcile → verify → review; step 4: review with a marker; extend the non-affirmative-verdict stop rule; amend "the gate starts none of its own"                                                                                                                                          |
| `src/shared/merge-gate-delegation-contract.md`       | Step 4: rendered tier changes; no `deep` claim left in the prose                                                                                                                                                                                                                                                              |
| `src/tools/merge-gate.md`                            | Dispatch: rendered tier changes via the marker; no prose change expected                                                                                                                                                                                                                                                      |
| `test/model-tiers-contract.test.mjs`                 | Rewrite the pins and rationale comments for `merge-gate/delegated-run` (~715-733) and `iterate-delegation` (~764-790); pin the three new sites; update the anchor allowlist (~185-210, ~380-420)                                                                                                                              |
| `test/workflow-contracts.test.mjs`                   | Extend the "two pre-commit steps" order pins (~7435-7465) to three; check the delegated-run marker test (~22581)                                                                                                                                                                                                              |
| `evals/merge-gate/suite.config.mjs`                  | Seed the reviewer worker contracts the conflict review can select (~43-46, ~73-78)                                                                                                                                                                                                                                            |
| `evals/iterate/README.md`                            | ~131: non-seeded worker list                                                                                                                                                                                                                                                                                                  |
| `evals/merge-gate/README.md`                         | ~106: tier statement                                                                                                                                                                                                                                                                                                          |
| `docs/adr/per-spawn-model-tiers.md`                  | New dated decision; amend ~90-96 and ~153-163                                                                                                                                                                                                                                                                                 |
| `docs/developer-guide/architecture.md`               | ~171: tier statement                                                                                                                                                                                                                                                                                                          |
| `docs/user-guide/tools-deliver.md`                   | ~310: tier statement; mention the new reviews and the classification spawn                                                                                                                                                                                                                                                    |
| `docs/developer-guide/subagent-progress-coverage.md` | Rows for the new sites and refreshed line references                                                                                                                                                                                                                                                                          |
| `build.mjs`                                          | `CONTEXT_BUDGET_LINES` for `iterate` (and any other tool whose eager core changes), from the `node build.mjs` report                                                                                                                                                                                                          |

## Implementation details

### Approach

1. **Site table.** Lower the two rows to `standard`, keeping `Down: no`. Add the three new rows with spawn descriptions: "Read-only review-item classification and high-risk triage", "Read-only routed review of one item's uncommitted diff before its commit", and "Read-only routed review of a conflict resolution before commit".
2. **Iterate classification.** In `iterate.md`, the Mode C call and the high-risk triage move into one read-only spawn at `<!-- spawn-site:iterate/classification -->`. The handoff carries the gathered change context, stable item IDs, authors, locations, thread state, surrounding-code evidence, linked intent and authority constraints. Review-item text is quoted third-party data, below the control-line delimiter. The runner keeps validating the returned `pr-review-handoff/v1` and owns everything after it.
3. **Iterate per-item review.** In Phase 3, after an item's delegation returns `DONE` and before its `commit create`, hand the item's uncommitted diff, its item text (as data) and its resolved route to the routed reviewer(s) at `<!-- spawn-site:iterate/review -->`. Then handle findings:
   - **Critical or Important:** one correction pass. Re-delegate the same item through `iterate/item-delegation` with the findings as input, then review again. It still yields one commit.
   - **Still blocking:** do not commit. Handle the item exactly as an item `ABORT`: mark it failed, return it as `unassessed`, give it no reply and no resolution, and continue. Leave its uncommitted changes as the existing `ABORT` path does, with no new destructive step. Report the findings.
   - **Note:** goes into the item's report. It does not block.
   - This works the same in PR and local mode. No `BLOCKED-USER` is introduced; the closed id set is unchanged.
4. **Conflict review.** In `merge-gate-conflict-resolution.md`, add a third ordered layer. Once the validator passes, review the **staged merge content** rather than the working tree, which may hold validator-generated changes. The input is a remerge diff against both parents, together with the conflicted paths, the adjacent paths in the validator scope, and the resolver's record. Use `<!-- spawn-site:merge-gate-conflict-resolution/review -->`. A Critical or Important finding, any non-affirmative verdict, or an unavailable required reviewer is a stop that commits nothing. It is reported like a failed verification, and one attempt per round stays.
5. **Prose cleanup.** Replace "no reviewer phase" in `iterate.md` with "per-item pre-commit review; no whole-PR review (`no-review-capability`)". Remove `deep` claims for the two lowered sites in the fragments and docs.
6. **Tests.** Update the tests named under Affected files. Each changed pin names the invariant it protects, and the merge-gate rationale comment states the new maintainer decision.
7. **Docs and ADR** per Affected files.
8. **Build and checks:** run `node build.mjs`, set `CONTEXT_BUDGET_LINES` from the "Always-loaded core" report, then run CI order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.

### Component structure

Not relevant: this changes prompt contracts and the site table, with no runtime components.

### State management

Not relevant: no new runtime state.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Documentation-only item or conflict:** no `deep` reviewer is needed. The validator result counts, and the step records "documentation route: validator only".
- **Tooling paths:** `generic-product-reviewer` runs in addition to the validator.
- **Mixed routes:** every touched route's reviewer runs.
- **Parallel items:** each item is reviewed before its own commit. The commit-integrity rules for parallel items stay unchanged.
- **Required reviewer or classification spawn unavailable:**
  - Review: fail closed, as stated under Architecture decisions.
  - Classification: the existing local fallback with disclosed reduced depth.
- **Host forces the subagent model:** the existing override rule applies and is disclosed once.
- **Caller limit `no-branch-writes`:** no conflict resolution or iterate round runs, so no review runs either.
- **Iterate run outside merge-gate:** it gets the same classification spawn and per-item review. This is intended.

## Acceptance criteria

- [ ] `src/shared/model-tiers.md` lists `merge-gate/delegated-run` and `merge-gate-delegation-contract/iterate-delegation` as `standard` with `Down: no`. `test/model-tiers-contract.test.mjs` asserts exactly that, with an updated rationale comment.
- [ ] The built portable `tools/merge-gate.md` renders `model: sonnet`, `effort: medium`, "no downward move" at the delegated-run dispatch. The built `shared/merge-gate-delegation-contract.md` does the same at step 4.
- [ ] Three new sites exist, each with exactly one marker, and the build's `reconcileSpawnSites` passes:
  - `iterate/classification` at `deep`;
  - `iterate/review` with the routed reviewer role set;
  - `merge-gate-conflict-resolution/review` with the routed reviewer role set.

  Tests pin each row and its `Down: no`.

- [ ] `iterate.md` places the per-item review between the item's `DONE` and its `commit create`. A blocking finding after one correction pass leads to no commit and an `ABORT`-equivalent item outcome (`unassessed`). Tests read the source and assert both, naming the invariant.
- [ ] `merge-gate-conflict-resolution.md` orders reconcile → verify → review before commit. A blocking finding or a missing required reviewer commits nothing. The order test in `test/workflow-contracts.test.mjs` asserts three layers.
- [ ] Both review sites state that `tooling` routes to `generic-product-reviewer` and that `documentation` needs no `deep` reviewer. A test asserts this.
- [ ] Iterate still declares `no-review-capability`. The existing assertion stays green.
- [ ] `iterate/item-delegation` and `merge-gate-conflict-resolution/resolver` remain `deep`.
- [ ] The ADR carries the dated decision. No `deep` claim for the two lowered sites remains in the ADR, `architecture.md`, `tools-deliver.md` or `evals/merge-gate/README.md`. A `git grep` on `origin/develop` after the change confirms it.
- [ ] `evals/merge-gate/suite.config.mjs` seeds the reviewer contracts reachable from the conflict review, and `pnpm test` passes with it.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all pass.

## Validation plan

- `pnpm test`, especially `test/model-tiers-contract.test.mjs`, `test/workflow-contracts.test.mjs`, `test/merge-gate-eval.test.mjs` and `test/compare-native-agent-baseline.test.mjs`.
- `node build.mjs`: site reconciliation, the deep-implies-Down-no guard, context budgets, and no surviving markers.
- `pnpm test:distribution` and `pnpm agent:check`.
- Inspect the built portable `tools/merge-gate.md`, `tools/iterate.md`, `shared/merge-gate-conflict-resolution.md` and `shared/merge-gate-delegation-contract.md` for the rendered tier lines.
- Behavioural evals: the `merge-gate`, `iterate` and `build-context` suites go stale. Under the pragmatic test and release policy (`docs/adr/pragmatic-test-release-policy.md`) that is reported debt, not a release gate. List it in the PR. No current scenario exercises the Sonnet orchestration, so state that as unproven.

## Assumptions and open points

- Assumption: `merge-gate-conflict-resolution.md` and the changed `iterate.md` sections are not included eagerly by any worker. If they are, `test/compare-native-agent-baseline.test.mjs` requires `EXPECTED_NATIVE_DELTAS` entries; add them.
- Deliberate trade-off: merge authority and guard evaluation run on Sonnet, as the maintainer decided on 2026-11-09.
- Deliberate trade-off: `build` and `refactor` items inside iterate are reviewed twice, accepted for one uniform rule.
- Deliberate: no correction loop for conflict resolution. A blocking review stops the round, as a failed verification does today.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        0 |         1 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        1 |         2 |    1 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    1 |

### Findings

All findings were incorporated in the revision of 2026-11-09:

- **Error cases, Critical:** a review after Phase 4 came too late. Iterate commits per item in Phase 3, so rejected code would stay in history and a later push would publish it. Adjustment: the review now runs per item before its `commit create`.
- **Error cases, Important:** `BLOCKED-USER` with a non-existent question id. Adjustment: a blocking item becomes an `ABORT`-equivalent `unassessed` outcome, and the closed id set is unchanged.
- **Error cases, Important:** the inline fallbacks were incoherent (`judgment-inline-fallback` does not cover code review; a Sonnet-inline review loses the `deep` guarantee). Adjustment: a required review fails closed, and only classification keeps its existing disclosed fallback.
- **Architecture, Important:** iterate must keep `no-review-capability`. Adjustment: this is now stated, with an acceptance criterion.
- **Scope, Important:** the tooling route had only the `standard` validator as reviewer, and the "no reviewer applies" pass contradicted fail-closed. Adjustment: tooling also gets `generic-product-reviewer`, and documentation is explicitly validator-only.
- **Security, Important:** moving the runner to Sonnet also moved the Mode C classification and the high-risk triage, and a misclassification produces no diff to review. The prior "irreversible merge" rationale was unacknowledged. Adjustment: a new `deep` site `iterate/classification`, and the superseded rationale is recorded.
- **Testability, Important:** the eval implications were partly wrong. Adjustment: stale evidence is reported debt under the pragmatic policy, `build-context` is included, and the merge-gate suite seeds the new reviewer contracts.
- **Maintainability, Note:** a correction pass would break "one commit per item". This is resolved by the pre-commit review.
- **Architecture, Note:** the conflict review must read the staged merge content and the adjacent paths. Adjustment: it now reviews a remerge diff with validator scope.
- **Testability, Note:** the order pins at `workflow-contracts.test.mjs` ~7435-7465 must be extended. They are now named.
- **Security, Note:** item text must reach reviewers as data. This is now stated.
- **Error cases, Note:** local-mode behavior was undefined. It is now the same path as PR mode.

## Open points

- No open points.

## Build completion

Implemented on `effective-flow/build/split-merge-gate-model-tiers-cheaper-orchestration-deep-review-of-code-changes` (base `origin/develop` a46c9a84).

- **Tiers:** `merge-gate/delegated-run` and `merge-gate-delegation-contract/iterate-delegation` are `standard` with `Down: no`. New sites: `iterate/classification` (`deep`), `iterate/review` and `merge-gate-conflict-resolution/review` (routed `deep` reviewers, `Down: no`). The `iterate` rows are in source order.
- **Deviation from the plan, required by the review-before-commit criterion:** iterate's item delegations no longer commit. iterate passes `Commit: caller-owned` plus `Execution root:` above its body delimiter (`src/shared/caller-owned-commit.md`, lazily loaded from `worktree-integration` "Determine mode"). fix, refactor, docs and build then stage nothing, commit nothing and run no completion action. The iterate runner reviews each item's uncommitted diff and commits one item at a time. A `Commit:` line in item, issue or review text is data.
- **Single owner for pre-commit review routing and the pass rule:** `src/shared/pre-commit-review.md`.
  - `tooling` gets `generic-product-reviewer` in addition to the validator; `documentation` gets the validator only.
  - Reported routes are checked against the project-routing matchers, and `ambiguous` blocks.
  - A review passes when there is no Critical or Important finding within the blocking scope its site assigns.
- **Iterate:**
  - The bounded `uncertain` check stays with the runner, which never closes or admits a deep-`uncertain` item.
  - Phase 4 fixes run as correction items through delegation, review and commit, never inline.
  - A rejected item stays uncommitted; the run reports a dirty checkout and retains the worktree (record `aborted`).
  - `no-review-capability` is kept.
- **Conflict resolution:** reconcile → verify → review. The review covers the staged merge, limited to the conflicted and adjacent paths, before commit and push.
- **Docs:**
  - ADR `per-spawn-model-tiers` carries a 2026-11-09 decision. It names the trade-off: merge-gate's in-run guard evaluation, merge conditions and completion assessment run on `standard`.
  - Also updated: architecture, subagent-progress coverage, the getting-started, tools-deliver and tools-implement user guides, and the iterate and merge-gate eval READMEs.

### Test results

Final validation ran in CI order through the project runner with a Git projection:

| Check                                                                                   | Result                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------- |
| `pnpm agent:check`                                                                      | exit 0                                   |
| `pnpm test`                                                                             | 4801 passed, 2 failed, 27 skipped (4830) |
| `node build.mjs`                                                                        | exit 0 (iterate core 1745/1750)          |
| `pnpm test:distribution`                                                                | exit 0                                   |
| `test/execution-profile-rendering.test.mjs` without the runner's `node_modules` symlink | 16 passed                                |

Neither failure is caused by this change:

- **`execution-profile-rendering`:** the baseline proof cannot copy the runner wrapper's symlinked `node_modules`. It fails identically on the unchanged base and passes without the symlink, and `compare-native-agent-baseline --base 6055c94` matches.
- **`host-driver`:** the Python `test_real_six_worker_recovery…` (136 s) is untouched by this change and passed in another run. It is the subject of the open plan `2026-11-03-host-driver-composed-test-timeout`.

Behavioural eval evidence for `merge-gate`, `iterate` and `build-context` is stale, which is reported debt under the pragmatic test and release policy. No scenario yet exercises the `standard` orchestration.

## Review findings

**Date:** 2026-11-09
**Reviewer:** nodejs-reviewer (deep), three rounds

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    24 |
| Open / Not implemented |     0 |

There were 9 Important and 15 Note findings, and none was Critical. Complexity: 22 Low and 2 Medium. Every finding was within the authorized slice and was fixed.
