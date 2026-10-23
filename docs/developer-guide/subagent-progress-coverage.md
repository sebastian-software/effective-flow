# Subagent progress coverage

This page is the source-derived coverage inventory for issue [#587](https://github.com/sebastian-software/effective-flow/issues/587). It records static contract reachability separately from live transport evidence. The register in `src/shared/model-tiers.md`, the `spawn-site` markers, and generated native inventories remain authoritative; the stable identifiers below are an omission check, not a frozen count.

## Evidence boundary and channels

All rows load the shared delegation/progress contracts as applicable. A worker leaf sends at most one advisory checkpoint to its actual immediate parent; returning orchestrators relay material changes with their own upstream context while the existing overview owner retains lifecycle control. Leaves never own the overview. Strict and workflow dispatches negotiate optional context and retain legacy header-free fallback when the selected receiver is unverified. Transport activation remains blocked for every unobserved target/mode shape.

| Target   | Addressed channel and evidence status                                                                                                                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude   | Generated workers add only `SendMessage`; `Agent` and `Task` remain omitted. Isolated CLI attempt was unauthenticated and provided no transport evidence.                                                                                                             |
| Codex    | Current desktop Collaboration host has addressed `collaboration.send_message`; one ordinary leaf and one immediate-parent chain delivered useful pre-terminal checkpoints and were joined. Native role selection, strict paths, and all other shapes remain unproven. |
| Portable | One current generated `nodejs-reviewer` worker was loaded through built-in Codex Collaboration and delivered one checkpoint before terminal completion; other portable roles/hosts remain unproven.                                                                   |

Historical #586 measurements remain historical. Matched complete shipped old/new cost evidence for contract loading, eligibility, direct/nested reporting, busy delivery, long fallback, and short controls is unavailable.

### Current matched portable pair

One matched pair used the current generated portable `nodejs-reviewer` worker in built-in Codex
Collaboration with the same frozen domain inputs, `gpt-6.1-sol` at high effort, and matching source
and test review outcomes. The control loaded the matching old owner; the reporting arm loaded the
matching full new owner. The reporting arm sent one checkpoint before its terminal result and one
relay under the parent's own context; both children joined. Parent-observed wall time was 123,841 ms
for control and 188,103 ms for reporting, a descriptive +51.89% (+64,262 ms). The interval includes
matching contract load, preflight, dispatch, model/domain work, joins, event waits, and result
postcheck; fixture preparation and ancestor contract reads were excluded. Counts were self-reported
as 7 orchestration batches/12 shell commands for control and 5/11 for reporting; token usage was
unavailable. Receiver selection was established before terminal completion. This single ordered
pair makes no causal, reliability, or general cost claim; native Codex role selection, Claude, other
portable hosts, strict/busy/fallback shapes, and full completion remain blocked.

<!-- coverage-roles:start -->

## Roles and generated variants

The source has 16 base roles and currently renders 21 Claude, 33 Codex, and 16 portable artifacts.

| Role identifier               | Source                                      | Claude      | Codex                  | Portable | Execution mode and owner                                           |
| ----------------------------- | ------------------------------------------- | ----------- | ---------------------- | -------- | ------------------------------------------------------------------ |
| `code-documenter`             | `src/agents/code-documenter.md`             | base        | base + mechanical/deep | base     | write-capable documentation leaf; immediate parent owns overview   |
| `code-validator`              | `src/agents/code-validator.md`              | base        | base + mechanical/deep | base     | read/write validation leaf; immediate parent owns overview         |
| `docs-writer`                 | `src/agents/docs-writer.md`                 | base        | base + mechanical/deep | base     | write-capable documentation leaf; immediate parent owns overview   |
| `e2e-tester`                  | `src/agents/e2e-tester.md`                  | base        | base + mechanical/deep | base     | write-capable test worker; immediate parent owns overview          |
| `frontend-reviewer`           | `src/agents/frontend-reviewer.md`           | base        | base                   | base     | read-only review worker; immediate parent owns overview            |
| `generic-implementer`         | `src/agents/generic-implementer.md`         | base + fast | base + fast            | base     | write-capable implementer; immediate parent owns overview          |
| `generic-product-implementer` | `src/agents/generic-product-implementer.md` | base + fast | base + fast            | base     | write-capable implementer; immediate parent owns overview          |
| `generic-product-reviewer`    | `src/agents/generic-product-reviewer.md`    | base        | base                   | base     | read-only review worker; immediate parent owns overview            |
| `marketing-writer`            | `src/agents/marketing-writer.md`            | base        | base + mechanical/deep | base     | write-capable documentation worker; immediate parent owns overview |
| `merge-conflict-resolver`     | `src/agents/merge-conflict-resolver.md`     | base        | base                   | base     | write-capable conflict worker; immediate parent owns overview      |
| `nodejs-implementer`          | `src/agents/nodejs-implementer.md`          | base + fast | base + fast            | base     | write-capable implementer; immediate parent owns overview          |
| `nodejs-reviewer`             | `src/agents/nodejs-reviewer.md`             | base        | base                   | base     | read-only review worker; immediate parent owns overview            |
| `rust-implementer`            | `src/agents/rust-implementer.md`            | base + fast | base + fast            | base     | write-capable implementer; immediate parent owns overview          |
| `rust-reviewer`               | `src/agents/rust-reviewer.md`               | base        | base                   | base     | read-only review worker; immediate parent owns overview            |
| `test-writer`                 | `src/agents/test-writer.md`                 | base        | base + mechanical/deep | base     | write-capable test worker; immediate parent owns overview          |
| `ui-implementer`              | `src/agents/ui-implementer.md`              | base + fast | base + fast            | base     | write-capable implementer; immediate parent owns overview          |

<!-- coverage-roles:end -->

<!-- coverage-spawn-sites:start -->

## Registered spawn sites

The following 54 identifiers are the complete current register. `analysis` is reserved for the 14 true read-only analysis sites. Worker and orchestrator modes come from the register's `role:` or workflow descriptions.

| Site identifier                                     | Source                                             | Mode / routed role                  | Sole upstream overview owner and direct-parent channel | Static coverage                          | Live gap                            |
| --------------------------------------------------- | -------------------------------------------------- | ----------------------------------- | ------------------------------------------------------ | ---------------------------------------- | ----------------------------------- |
| `apply-issues/issue-analysis`                       | `src/tools/apply-issues.md:223`                    | analysis                            | calling workflow / actual immediate parent             | compact leaf handoff and joined terminal | only addressed Codex ordinary shape |
| `apply-issues/issue-delegation`                     | `src/tools/apply-issues.md:336`                    | returning orchestrator              | caller / own upstream context                          | relay, strict receiver, joined terminal  | exact shape unobserved              |
| `apply-review/finding-pre-analysis`                 | `src/tools/apply-review.md:388`                    | analysis                            | calling workflow / actual immediate parent             | compact leaf handoff and joined terminal | only addressed Codex ordinary shape |
| `apply-review/component-delegation`                 | `src/tools/apply-review.md:438`                    | returning orchestrator              | caller / own upstream context                          | relay, strict receiver, joined terminal  | both apply-review hops unobserved   |
| `build/initial-implementation`                      | `src/tools/build.md:308`                           | worker: routed implementer          | build workflow / actual immediate parent               | implementer contract and join            | generated role and host unobserved  |
| `build/unit-tests`                                  | `src/tools/build.md:335`                           | worker: `test-writer`               | build workflow / actual immediate parent               | test-worker contract and join            | generated role and host unobserved  |
| `build/e2e-tests`                                   | `src/tools/build.md:337`                           | worker: `e2e-tester`                | build workflow / actual immediate parent               | test-worker contract and join            | generated role and host unobserved  |
| `build/validation`                                  | `src/tools/build.md:342`                           | worker: `code-validator`            | build workflow / actual immediate parent               | validator contract and join              | generated role and host unobserved  |
| `build/review`                                      | `src/tools/build.md:350`                           | worker: routed reviewer             | build workflow / actual immediate parent               | reviewer contract and join               | generated role and host unobserved  |
| `build/final-validation`                            | `src/tools/build.md:412`                           | worker: `code-validator`            | build workflow / actual immediate parent               | validator contract and join              | generated role and host unobserved  |
| `concept-review/analysis-fan-out`                   | `src/tools/concept-review.md:35`                   | analysis                            | calling workflow / actual immediate parent             | compact leaf handoff and joined terminal | exact shape unobserved              |
| `docs/implementation`                               | `src/tools/docs.md:266`                            | worker: routed documentation writer | docs workflow / actual immediate parent                | writer contract and join                 | generated role and host unobserved  |
| `docs/validation`                                   | `src/tools/docs.md:307`                            | worker: `code-validator`            | docs workflow / actual immediate parent                | validator contract and join              | generated role and host unobserved  |
| `fix/reproduction`                                  | `src/tools/fix.md:185`                             | worker: `code-validator`            | fix workflow / actual immediate parent                 | validator contract and join              | generated role and host unobserved  |
| `fix/failing-test`                                  | `src/tools/fix.md:232`                             | worker: `test-writer`               | fix workflow / actual immediate parent                 | test-worker contract and join            | generated role and host unobserved  |
| `fix/implementation`                                | `src/tools/fix.md:236`                             | worker: routed implementer          | fix workflow / actual immediate parent                 | implementer contract and join            | generated role and host unobserved  |
| `fix/regression-test`                               | `src/tools/fix.md:256`                             | worker: `test-writer`               | fix workflow / actual immediate parent                 | test-worker contract and join            | generated role and host unobserved  |
| `fix/verification`                                  | `src/tools/fix.md:259`                             | worker: validator/reviewer          | fix workflow / actual immediate parent                 | validator/reviewer contracts and join    | generated role and host unobserved  |
| `investigate/skeptic`                               | `src/tools/investigate.md:169`                     | analysis                            | calling workflow / actual immediate parent             | compact leaf handoff and joined terminal | exact shape unobserved              |
| `issue-buddy/readiness`                             | `src/tools/issue-buddy.md:189`                     | analysis                            | issue-buddy / actual immediate parent                  | compact leaf handoff and joined terminal | exact shape unobserved              |
| `issue-buddy/plan-run`                              | `src/tools/issue-buddy.md:216`                     | returning orchestrator              | issue-buddy / own upstream context                     | relay, strict receiver, joined terminal  | exact shape unobserved              |
| `issue-buddy/nested-spawn-probe`                    | `src/tools/issue-buddy.md:222`                     | prerequisite probe                  | no progress channel                                    | existing no-op probe                     | deliberately excluded               |
| `iterate/item-delegation`                           | `src/tools/iterate.md:733`                         | returning orchestrator              | iterate caller / own upstream context                  | relay, strict receiver, joined terminal  | exact shape unobserved              |
| `iterate/validation`                                | `src/tools/iterate.md:824`                         | worker: `code-validator`            | iterate workflow / actual immediate parent             | validator contract and join              | generated role and host unobserved  |
| `maintain/baseline-checks`                          | `src/tools/maintain.md:180`                        | worker: `code-validator`            | maintain workflow / actual immediate parent            | validator contract and join              | generated role and host unobserved  |
| `maintain/baseline-tests`                           | `src/tools/maintain.md:182`                        | worker: `test-writer`               | maintain workflow / actual immediate parent            | test-worker contract and join            | generated role and host unobserved  |
| `maintain/api-adaptation`                           | `src/tools/maintain.md:221`                        | worker: routed implementer          | maintain workflow / actual immediate parent            | implementer contract and join            | generated role and host unobserved  |
| `maintain/review`                                   | `src/tools/maintain.md:248`                        | worker: routed reviewer             | maintain workflow / actual immediate parent            | reviewer contract and join               | generated role and host unobserved  |
| `maintain/final-validation`                         | `src/tools/maintain.md:265`                        | worker: `code-validator`            | maintain workflow / actual immediate parent            | validator contract and join              | generated role and host unobserved  |
| `plan/codebase-examination`                         | `src/tools/plan.md:274`                            | analysis                            | calling workflow / actual immediate parent             | compact leaf handoff and joined terminal | exact shape unobserved              |
| `plan-issue/codebase-examination`                   | `src/tools/plan-issue.md:265`                      | analysis                            | calling workflow / actual immediate parent             | compact leaf handoff and joined terminal | exact shape unobserved              |
| `plan-review/analysis-fan-out`                      | `src/tools/plan-review.md:49`                      | analysis                            | calling workflow / actual immediate parent             | compact leaf handoff and joined terminal | exact shape unobserved              |
| `pr/body-draft`                                     | `src/tools/pr.md:290`                              | analysis                            | calling workflow / actual immediate parent             | compact leaf handoff and joined terminal | exact shape unobserved              |
| `refactor/baseline-checks`                          | `src/tools/refactor.md:222`                        | worker: `code-validator`            | refactor workflow / actual immediate parent            | validator contract and join              | generated role and host unobserved  |
| `refactor/baseline-tests`                           | `src/tools/refactor.md:227`                        | worker: `test-writer`               | refactor workflow / actual immediate parent            | test-worker contract and join            | generated role and host unobserved  |
| `refactor/initial-implementation`                   | `src/tools/refactor.md:266`                        | worker: routed implementer          | refactor workflow / actual immediate parent            | implementer contract and join            | generated role and host unobserved  |
| `refactor/review`                                   | `src/tools/refactor.md:301`                        | worker: routed reviewer             | refactor workflow / actual immediate parent            | reviewer contract and join               | generated role and host unobserved  |
| `refactor/post-validation-checks`                   | `src/tools/refactor.md:334`                        | worker: `code-validator`            | refactor workflow / actual immediate parent            | validator contract and join              | generated role and host unobserved  |
| `refactor/post-validation-tests`                    | `src/tools/refactor.md:336`                        | worker: `test-writer`               | refactor workflow / actual immediate parent            | test-worker contract and join            | generated role and host unobserved  |
| `retro/session-analysis`                            | `src/tools/retro.md:94`                            | analysis                            | calling workflow / actual immediate parent             | compact leaf handoff and joined terminal | exact shape unobserved              |
| `review/design-decision-sources`                    | `src/tools/review.md:464`                          | analysis                            | calling workflow / actual immediate parent             | compact leaf handoff and joined terminal | exact shape unobserved              |
| `review/technical-validation`                       | `src/tools/review.md:488`                          | worker: `code-validator`            | review workflow / actual immediate parent              | validator contract and join              | generated role and host unobserved  |
| `review/quality-review`                             | `src/tools/review.md:498`                          | worker: routed reviewer             | review workflow / actual immediate parent              | reviewer contract and join               | generated role and host unobserved  |
| `central-reasoning-delegation/judgment`             | `src/shared/central-reasoning-delegation.md:70`    | analysis                            | calling workflow / actual immediate parent             | compact leaf handoff and joined terminal | exact shape unobserved              |
| `documentation-sync-contract/code-documenter`       | `src/shared/documentation-sync-contract.md:36`     | worker: `code-documenter`           | sync owner / actual immediate parent                   | writer contract and join                 | generated role and host unobserved  |
| `documentation-sync-contract/docs-writer`           | `src/shared/documentation-sync-contract.md:38`     | worker: `docs-writer`               | sync owner / actual immediate parent                   | writer contract and join                 | generated role and host unobserved  |
| `documentation-sync-contract/marketing-writer`      | `src/shared/documentation-sync-contract.md:40`     | worker: `marketing-writer`          | sync owner / actual immediate parent                   | writer contract and join                 | generated role and host unobserved  |
| `initial-state-documentation/state-investigation`   | `src/shared/initial-state-documentation.md:10`     | analysis                            | calling workflow / actual immediate parent             | compact leaf handoff and joined terminal | exact shape unobserved              |
| `investigation-method/explore`                      | `src/shared/investigation-method.md:11`            | analysis                            | calling workflow / actual immediate parent             | compact leaf handoff and joined terminal | exact shape unobserved              |
| `merge-gate/delegated-run`                          | `src/tools/merge-gate.md:252`                      | returning orchestrator              | merge-gate caller / own upstream context               | strict receiver, relay, joined terminal  | exact shape unobserved              |
| `merge-gate-conflict-resolution/resolver`           | `src/shared/merge-gate-conflict-resolution.md:120` | worker: `merge-conflict-resolver`   | merge-gate / actual immediate parent                   | writer contract and join                 | generated role and host unobserved  |
| `merge-gate-conflict-resolution/verification`       | `src/shared/merge-gate-conflict-resolution.md:127` | worker: `code-validator`            | merge-gate / actual immediate parent                   | validator contract and join              | generated role and host unobserved  |
| `merge-gate-delegated-run/nested-spawn-probe`       | `src/shared/merge-gate-delegated-run.md:49`        | prerequisite probe                  | no progress channel                                    | existing no-op probe                     | deliberately excluded               |
| `merge-gate-delegation-contract/iterate-delegation` | `src/shared/merge-gate-delegation-contract.md:262` | returning orchestrator              | delegated gate / own upstream context                  | strict receiver, relay, joined terminal  | nested strict shape unobserved      |

<!-- coverage-spawn-sites:end -->

<!-- coverage-analysis:start -->

## Analysis reconciliation

These are the 14 and only 14 analysis identifiers in the register: `apply-issues/issue-analysis`, `apply-review/finding-pre-analysis`, `concept-review/analysis-fan-out`, `investigate/skeptic`, `issue-buddy/readiness`, `plan/codebase-examination`, `plan-issue/codebase-examination`, `plan-review/analysis-fan-out`, `pr/body-draft`, `retro/session-analysis`, `review/design-decision-sources`, `central-reasoning-delegation/judgment`, `initial-state-documentation/state-investigation`, and `investigation-method/explore`.
<!-- coverage-analysis:end -->

<!-- coverage-adapters:start -->

## Returning, transfer, and recovery paths

Each row is independently assessable. The immediate parent may be a returning relay while the sole upstream overview owner remains the caller or transferred recipient.

| Path identifier                           | Source                                       | Execution mode                       | Sole upstream overview owner and direct-parent channel | Static coverage                                  | Live gap                      |
| ----------------------------------------- | -------------------------------------------- | ------------------------------------ | ------------------------------------------------------ | ------------------------------------------------ | ----------------------------- |
| `apply-to-apply-plan`                     | `src/tools/apply.md`                         | transfer                             | apply caller / same-session or transferred parent      | routing and ownership transfer                   | exact host shape unobserved   |
| `apply-to-apply-issues`                   | `src/tools/apply.md`                         | returning workflow                   | apply caller / own upstream context                    | issue return and terminal join                   | exact host shape unobserved   |
| `apply-to-apply-review`                   | `src/tools/apply.md`                         | returning workflow                   | apply caller / own upstream context                    | review return and terminal join                  | exact host shape unobserved   |
| `apply-plan-to-build`                     | `src/tools/apply-plan.md`                    | non-returning transfer               | apply-plan / transferred build owner                   | recipient owns remaining phases                  | exact host shape unobserved   |
| `apply-plan-to-fix`                       | `src/tools/apply-plan.md`                    | non-returning transfer               | apply-plan / transferred fix owner                     | recipient owns remaining phases                  | exact host shape unobserved   |
| `apply-plan-to-refactor`                  | `src/tools/apply-plan.md`                    | non-returning transfer               | apply-plan / transferred refactor owner                | recipient owns remaining phases                  | exact host shape unobserved   |
| `apply-plan-to-docs`                      | `src/tools/apply-plan.md`                    | non-returning transfer               | apply-plan / transferred docs owner                    | recipient owns remaining phases                  | exact host shape unobserved   |
| `apply-issues-to-implementation`          | `src/tools/apply-issues.md`                  | returning adapter                    | apply-issues / own upstream context                    | issue identity, failure and reconciliation       | exact host shape unobserved   |
| `apply-review-overlap-to-per-finding`     | `src/tools/apply-review.md`                  | returning relay then per-finding     | apply-review / own upstream context                    | overlap barrier and finding identity             | both hops unobserved          |
| `apply-review-remote-to-per-finding`      | `src/tools/apply-review-remote.md`           | returning adapter                    | remote review / own upstream context                   | finding receipt and failed/unassessed outcomes   | exact host shape unobserved   |
| `merge-gate-to-iterate`                   | `src/tools/merge-gate.md`                    | strict returning dispatch            | merge-gate caller / own upstream context               | verified receiver, optional context, join        | strict transport unobserved   |
| `iterate-to-per-item-workflow`            | `src/tools/iterate.md`                       | returning per-item workflow          | iterate workflow / own upstream context                | per-item handoff, terminal join, and relay rules | per-item transport unobserved |
| `issue-buddy-to-plan`                     | `src/tools/issue-buddy.md`                   | foreground same-session workflow     | issue-buddy / same-session parent                      | five controls and optional context               | exact host shape unobserved   |
| `plan-to-plan-review-file`                | `src/tools/plan.md`                          | returning strict review              | plan owner / own upstream context                      | selected receiver and exact artifact             | exact host shape unobserved   |
| `plan-to-plan-review-unattended`          | `src/shared/unattended-planning.md`          | strict file payload                  | plan owner / own upstream context                      | three-control payload and legacy fallback        | exact host shape unobserved   |
| `plan-issue-to-plan-review`               | `src/tools/plan-issue.md`                    | returning issue adapter              | plan-issue owner / same-comment parent                 | comment/body hash and source association         | exact host shape unobserved   |
| `concept-to-concept-review`               | `src/tools/concept.md`                       | returning artifact review            | concept owner / own upstream context                   | artifact association and terminal join           | exact host shape unobserved   |
| `plan-gateway-to-plan-issue`              | `src/shared/plan-input-gateway.md`           | non-returning transfer               | gateway / transferred plan-issue owner                 | single overview and no pre-handoff write         | exact host shape unobserved   |
| `planning-to-central-judgment`            | `src/shared/central-reasoning-delegation.md` | analysis plus inline fallback        | planning owner / actual immediate parent               | compact handoff; no new terminal protocol        | exact host shape unobserved   |
| `worktree-to-commit-to-pr`                | `src/shared/worktree-integration.md`         | returning delivery chain             | implementer / own upstream context                     | roots, receipts, approval and commit proof       | exact host shape unobserved   |
| `plan-publication-to-commit-to-pr`        | `src/shared/plan-publication.md`             | returning publication chain          | planning owner / own upstream context                  | consent and publication receipts                 | exact host shape unobserved   |
| `plan-pr-continuation-to-publication`     | `src/shared/plan-pr-continuation.md`         | returning continuation               | planning owner / own upstream context                  | source/attempt identity and one overview         | exact host shape unobserved   |
| `deliver-to-commit-groups-to-pr`          | `src/tools/deliver.md`                       | returning commit/publication adapter | delivery owner / own upstream context                  | selected paths, receipts and commit proof        | exact host shape unobserved   |
| `pr-to-body-draft`                        | `src/tools/pr.md`                            | analysis result                      | PR owner / actual immediate parent                     | body-only result and separate checkpoint         | exact host shape unobserved   |
| `review-to-central-skill`                 | `src/shared/pr-review-integration.md`        | same-session Mode C adapter          | review/delivery owner / no fabricated native recipient | item-set and approval semantics                  | exact host shape unobserved   |
| `missing-keyword-continuation`            | `src/shared/completion-protocol.md`          | same child resumed once              | existing overview owner / same child association       | terminal keyword recovery                        | exact host shape unobserved   |
| `authorized-retry-and-fast-recovery`      | `src/shared/completion-protocol.md`          | new authorized attempt               | current workflow owner / new child association         | stale dispatch suppression and tier constraints  | exact host shape unobserved   |
| `merge-gate-answer-redispatch`            | `src/tools/merge-gate.md`                    | trusted answer re-dispatch           | merge-gate owner / fresh state and digest              | progress has no consent authority                | exact host shape unobserved   |
| `refused-spawn-inline-fallback`           | `src/shared/judgment-inline-fallback.md`     | inline or explicit abort             | current workflow owner / no child channel              | gates and joins unchanged                        | exact host shape unobserved   |
| `cancellation-replacement-partial-result` | `src/shared/subagent-progress.md`            | existing lifecycle                   | current overview owner / active dispatch               | late/duplicate progress ignored                  | exact host shape unobserved   |

<!-- coverage-adapters:end -->

`src/shared/subagent-progress.md` remains the sole orchestration owner. The delegation mandate and goal-completion relationships cover returning orchestrators and strict receivers; task-tracking loads progress only for orchestrators without goal-completion. This is Effective Flow mechanics with no copied domain playbook. Current runtime evidence remains bounded to the addressed Codex ordinary-wait path and the immediate leaf → build → apply-issues → root chain; the build parent joined its leaves while the root awaited the returning chain. It does not activate generated roles, Claude, portable, strict transport, or both apply-review hops.
