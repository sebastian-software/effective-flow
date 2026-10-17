# Model tiers

## Vocabulary

Three provider-neutral tiers name the model class a spawn runs on: `mechanical`, `standard` and
`deep`.

## Tier rules

- Pass the tier's "Harness values" on the spawn; the rendered site line is authoritative, and
  "Spawn sites" below is its source. A spawn without a rendered line, such as a correction or
  respawn, takes its role default for a named worker, otherwise the tier of the row whose Spawn
  entry describes it; without one, `standard`.
- A `deep` role or site never moves down; a cheaper implementer exists only through the gated Fast
  selector of `execution-profiles`.
- A `standard` role or site may move one step up or down for a stated reason, which appears in the
  spawn handoff and in the run summary: a validator re-run after a pure documentation change moves
  down, a failing cross-module validation moves up. A `Down: no` site, rendered as "no downward
  move", never moves down.
- A move past either end of the scale is a no-op.
- A retry or correction after a failed attempt runs at least on the role or site default.
- A Fast spawn's values, and their exception from the site line, belong to "Initial implementation
  phase" of `execution-profiles`.

## Host overrides

- On Claude Code, an Agent tool without a `model` parameter means the host forces the subagent
  model (for example through `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`): pass only the tier's `effort`,
  never probe the environment, and say once that the host sets the subagent model.
- A spawn rejected because of a tier parameter is retried once without it, or without both
  parameters when it is unclear which one was rejected; omit the rejected parameter for the rest of
  the run and report that once. A spawn the host refuses for its nesting depth is a declined
  delegation under the delegation mandate, never a tier-parameter rejection.
- `CLAUDE_CODE_EFFORT_LEVEL` is a user override of the effort and is not detected.
- A host whose spawn mechanism takes neither parameter inherits the parent's model and says so
  once.

## Role defaults

| Role | Tier |
| ---- | ---- |
| `code-documenter` | `standard` |
| `code-validator` | `standard` |
| `docs-writer` | `standard` |
| `e2e-tester` | `standard` |
| `frontend-reviewer` | `deep` |
| `generic-implementer` | `deep` |
| `generic-product-implementer` | `deep` |
| `generic-product-reviewer` | `deep` |
| `marketing-writer` | `standard` |
| `merge-conflict-resolver` | `deep` |
| `nodejs-implementer` | `deep` |
| `nodejs-reviewer` | `deep` |
| `rust-implementer` | `deep` |
| `rust-reviewer` | `deep` |
| `test-writer` | `standard` |
| `ui-implementer` | `deep` |

## Harness values

<!-- model-tier-table:start -->
| Tier | Claude Code Agent tool | Codex spawn |
| ---- | ---- | ---- |
| `mechanical` | `model: haiku`, `effort: low` | `model: gpt-5.6-luna`, `reasoning_effort: low` |
| `standard` | `model: sonnet`, `effort: medium` | `model: gpt-5.6-luna`, `reasoning_effort: medium` |
| `deep` | `model: opus`, `effort: high` | `model: gpt-6.1-sol`, `reasoning_effort: high` |
<!-- model-tier-table:end -->

## Spawn sites

| Site                                                | Spawn                                                                                      | Tier                                                                                                      | Down  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ----- |
| `apply-issues/issue-analysis`                       | Read-only analysis sub-agent per work item                                                 | `standard`                                                                                                | `yes` |
| `apply-issues/issue-delegation`                     | Delegated implementation workflow run per sufficient issue (orchestrates its own workers)  | `deep`                                                                                                    | `no`  |
| `apply-review/finding-pre-analysis`                 | Read-only pre-analysis sub-agent per implementable finding                                 | `standard`                                                                                                | `yes` |
| `apply-review/component-delegation`                 | Delegated implementation workflow run per overlap component (orchestrates its own workers) | `deep`                                                                                                    | `no`  |
| `build/initial-implementation`                      | Routed Quality implementer per initial packet                                              | `role:ui-implementer,nodejs-implementer,rust-implementer,generic-product-implementer,generic-implementer` | `no`  |
| `build/unit-tests`                                  | Unit and component tests of the built change (validates a Fast packet)                     | `role:test-writer`                                                                                        | `no`  |
| `build/e2e-tests`                                   | End-to-end tests of a new user flow (validates a Fast packet)                              | `role:e2e-tester`                                                                                         | `no`  |
| `build/validation`                                  | Validation of the built change (validates a Fast packet)                                   | `role:code-validator`                                                                                     | `no`  |
| `build/review`                                      | Routed reviewers of the built change                                                       | `role:frontend-reviewer,nodejs-reviewer,rust-reviewer,generic-product-reviewer`                           | `no`  |
| `build/final-validation`                            | Final validation before completion (validates a Fast packet)                               | `role:code-validator`                                                                                     | `no`  |
| `concept-review/analysis-fan-out`                   | Read-only review fan-out over the concept under review                                     | `deep`                                                                                                    | `no`  |
| `docs/implementation`                               | Routed documentation writers                                                               | `role:marketing-writer,docs-writer,code-documenter`                                                       | `yes` |
| `docs/validation`                                   | Technical check of documentation changes                                                   | `role:code-validator`                                                                                     | `yes` |
| `fix/reproduction`                                  | Bug reproduction on the current state                                                      | `role:code-validator`                                                                                     | `yes` |
| `fix/failing-test`                                  | Failing test that documents the bug                                                        | `role:test-writer`                                                                                        | `yes` |
| `fix/implementation`                                | Routed implementers of the fix                                                             | `role:ui-implementer,nodejs-implementer,rust-implementer,generic-product-implementer,generic-implementer` | `no`  |
| `fix/regression-test`                               | Regression test that confirms the fix                                                      | `role:test-writer`                                                                                        | `yes` |
| `fix/verification`                                  | Validation and degraded-bucket review of the fix                                           | `role:code-validator,generic-product-reviewer`                                                            | `yes` |
| `iterate/item-delegation`                           | Delegated implementation workflow run per actionable item (orchestrates its own workers)   | `deep`                                                                                                    | `no`  |
| `iterate/validation`                                | Validation after the items are implemented                                                 | `role:code-validator`                                                                                     | `yes` |
| `maintain/baseline-checks`                          | Baseline type, lint and build status                                                       | `role:code-validator`                                                                                     | `yes` |
| `maintain/baseline-tests`                           | Baseline run of the existing tests                                                         | `role:test-writer`                                                                                        | `yes` |
| `maintain/api-adaptation`                           | Routed implementers adapting code to a changed dependency API                              | `role:ui-implementer,nodejs-implementer,rust-implementer,generic-product-implementer,generic-implementer` | `no`  |
| `maintain/review`                                   | Routed reviewers of adapted code                                                           | `role:frontend-reviewer,nodejs-reviewer,rust-reviewer,generic-product-reviewer`                           | `no`  |
| `maintain/final-validation`                         | Final validation before completion                                                         | `role:code-validator`                                                                                     | `yes` |
| `plan/codebase-examination`                         | Read-only codebase examination for the plan                                                | `standard`                                                                                                | `yes` |
| `plan-issue/codebase-examination`                   | Read-only codebase examination for the issue plan                                          | `standard`                                                                                                | `yes` |
| `plan-review/analysis-fan-out`                      | Read-only review fan-out over the plan under review                                        | `deep`                                                                                                    | `no`  |
| `refactor/baseline-checks`                          | Baseline type, lint and build status                                                       | `role:code-validator`                                                                                     | `yes` |
| `refactor/baseline-tests`                           | Baseline run of the existing tests                                                         | `role:test-writer`                                                                                        | `yes` |
| `refactor/initial-implementation`                   | Routed Quality implementer per initial packet                                              | `role:ui-implementer,nodejs-implementer,rust-implementer,generic-product-implementer,generic-implementer` | `no`  |
| `refactor/review`                                   | Routed reviewers of the refactoring                                                        | `role:frontend-reviewer,nodejs-reviewer,rust-reviewer,generic-product-reviewer`                           | `no`  |
| `refactor/post-validation-checks`                   | Post-validation checks (validates a Fast packet)                                           | `role:code-validator`                                                                                     | `no`  |
| `refactor/post-validation-tests`                    | Post-validation test run (validates a Fast packet)                                         | `role:test-writer`                                                                                        | `no`  |
| `review/design-decision-sources`                    | Read-only design-decision search per active source                                         | `standard`                                                                                                | `yes` |
| `review/technical-validation`                       | Technical validation of the review scope                                                   | `role:code-validator`                                                                                     | `yes` |
| `review/quality-review`                             | Routed reviewers per bucket and directory split                                            | `role:frontend-reviewer,nodejs-reviewer,rust-reviewer,generic-product-reviewer`                           | `no`  |
| `central-reasoning-delegation/judgment`             | Read-only judgment of the written plan, issue plan or concept artifact                     | `deep`                                                                                                    | `no`  |
| `documentation-sync-contract/code-documenter`       | In-code documentation update of the sync gate                                              | `role:code-documenter`                                                                                    | `yes` |
| `documentation-sync-contract/docs-writer`           | User and technical document update of the sync gate                                        | `role:docs-writer`                                                                                        | `yes` |
| `documentation-sync-contract/marketing-writer`      | Root README update of the sync gate                                                        | `role:marketing-writer`                                                                                   | `yes` |
| `initial-state-documentation/state-investigation`   | Read-only investigation of the current project state                                       | `standard`                                                                                                | `yes` |
| `investigation-method/explore`                      | Read-only Explore investigation of the relevant code                                       | `standard`                                                                                                | `yes` |
| `merge-gate/delegated-run`                          | Delegated merge-gate run after Phase 0 (orchestrates its own workers)                      | `deep`                                                                                                    | `no`  |
| `merge-gate-conflict-resolution/resolver`           | Resolution of a conflicted base-into-head merge                                            | `role:merge-conflict-resolver`                                                                            | `no`  |
| `merge-gate-conflict-resolution/verification`       | Independent verification of a conflict resolution                                          | `role:code-validator`                                                                                     | `no`  |
| `merge-gate-delegated-run/nested-spawn-probe`       | No-op child proving the delegated merge-gate run can spawn                                 | `mechanical`                                                                                              | `yes` |
| `merge-gate-delegation-contract/iterate-delegation` | Delegated iterate workflow run per round (orchestrates its own workers)                    | `deep`                                                                                                    | `no`  |
