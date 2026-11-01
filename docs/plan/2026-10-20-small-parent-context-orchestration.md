# Keep parent contexts small during planned feature delivery

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Keep the user-facing parent session small while implementing an approved Feature plan. Preserve the complete implementation, documentation, testing, independent review, validation, approval, and delivery obligations. The first implementation covers `apply <Feature plan>` and `build <Feature plan>`; it establishes a measurable pattern before extending other workflows.

Planning baseline: `de23f9b`, 2026-10-20, clean execution checkout. Primary evidence is the local main-checkout report `.effective-flow/investigation/investigation-2026-10-20-session-model-context.md`. Its relevant findings are reproduced here so implementation does not depend on access to private session logs:

- Codex: 273 child sessions in four sampled roots, 126 on Luna; all 278 parsed spawns requested zero inherited turns. Initial child input median was 37,734 tokens, yet three parent peaks reached 362k–396k.
- Claude: cheaper child-request share rose from 1.9% to 20.8%; mean parent context changed only from 429k to 418k. These are descriptive cohorts, not matched experiments.
- Delegation already works. The missing boundary is how much workflow work and evidence remain in the parent across a long lifecycle. Moving existing history into another child cannot shrink that history in the host.
- Installed 1.68 and current source differ. Implement against this source baseline, including the existing fresh artifact judgments; do not reinstall the older design or count it as new work.

This is Feature work because it changes execution routing, return contracts, and relayed interaction, rather than merely changing prose layout.

### Scope

In scope: a thin planned-build caller, one initially fresh built-in workflow runner continued in the same agent after user questions, bounded artifact-based control traffic, guarded question/resume handling, complete quality preservation, a continuation record for the next workflow, and paired measurement.

Out of scope: changing model mappings, enabling Fast, automatic compaction or creation of user-visible chats, removing prior transcript messages, rewriting every workflow, changing merge criteria, and a general-purpose workflow engine. Unplanned direct `build` retains its existing planning and approval behavior; after approval it may enter the same execution seam. Non-Feature plans keep their current routes.

## Architecture decisions

1. **One additional execution boundary.** `apply-plan` remains the source resolver and clarification gate. It follows the thin `build` caller in the current run; only that caller spawns the fresh runner. Do not add both an apply child and a build child. The runner reads the persisted approved plan and owns phases 2–7.
2. **Keep the existing orchestration rights distinct.** Use a built-in general-purpose workflow orchestrator, not a named `src/agents/*` worker. Named workers remain leaves. The runner may start its existing specialists and must await them before returning.
3. **Preserve quality and authority.** The workflow runner is `deep`; existing specialist and independent-review tiers, Fast selection, validation order, review coverage, pre-commit gates, and delivery decisions retain their current contracts. Delegation never creates publication, merge, destructive-action, or scope-expansion authority.
4. **Artifacts carry evidence; the parent carries control.** Full plan bodies, diffs, test output, reviewer findings, and phase histories stay with the runner and their owning artifacts. The parent receives bounded status, artifact identities, evidence availability, questions, and the next user action. A summary cannot replace an unmet gate.
5. **A small deterministic helper, scoped to build.** Add `build-run.mjs` over `build-run-core.mjs`, following existing JSON CLI and runtime-safety patterns. Do not overload the merge-gate-specific `delegation-envelope` grammar or copy its entire implementation. Avoid a scheduler, global registry, new configuration block, or new memory counter.
6. **Explicit limits, not invented token guarantees.** Enforce UTF-8 limits on the helper's control artifacts and generated dispatch output. Measure real context separately from host transcripts. Host tool returns and worker free text cannot be universally intercepted; prompt discipline plus behavioural evidence covers that boundary.
7. **Separate same-run continuation from the next workflow.** After a user question, resume the same delegated agent with its existing transient state; no fresh-agent transfer or persistent storage of pilot capabilities is allowed. A lost agent/transient state requires a controlled stop with retained artifacts and unproven finalization reported honestly, not reconstructed authority. The latest completed run exposes a compact handoff for the next workflow in a fresh session; it does not resume a live pilot or grant unrestricted approval.
8. **Conservative rollout.** Prepare the final delegated-default candidate in an isolated, unpublished checkout. Keep the installed release unchanged during measurement; release the same measured candidate identity only after all gates pass. The complete inline route remains a compatibility fallback, labeled and excluded from isolation-success counts.

### Alternatives considered

- More eager-to-lazy moves alone reduce initial prompt size but do not isolate a multi-phase implementation. Use them at the caller/runner seam, with mandatory caller guards retained.
- A fresh child per phase introduces many new ownership and recovery boundaries. Defer that extension until the first runner's peak and cumulative measurements justify it.
- Lowering the parent or review model does not solve context growth and confounds the requested quality comparison.
- Requiring a new chat after every phase depends on host/user actions and is not a portable implementation contract.
- Reusing an unbounded build child forever only relocates the problem. A runner is limited to one approved plan, returns at terminal state or a user gate, and cannot adopt the next independent plan.

## Affected files

| File                                                                                                                                             | Planned change                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/build.md`                                                                                                                             | Keep caller preflight, intent/plan routing, approval basis, dispatch, question relay and terminal handling; defer implementation execution.          |
| `src/tools/apply-plan.md`                                                                                                                        | Preserve source/status/clarification checks and pass a verified Feature-plan association into the single build dispatch seam.                        |
| `src/shared/build-delegated-run.md` (new)                                                                                                        | Own existing build phases 2–7 and their authoritative includes without weakening their order or gates.                                               |
| `src/shared/worktree-record-obligation.md`, `src/shared/worktree-lifecycle.md`, `src/shared/pr-review-integration.md`                            | Distinguish a build user pause from terminal workflow exit; preserve ownership, lock release and the originating interactive mode through the relay. |
| `test/worktree-lifecycle.test.mjs`, `test/execution-profile-workflow-contract.test.mjs`                                                          | Protect paused dirty worktree continuation, native profile lifecycle and unchanged truly non-interactive behavior.                                   |
| `src/shared/build-run-contract.md` (new)                                                                                                         | Define the small caller/runner protocol, allowed question origins and exact validation/dispatch sequence.                                            |
| `src/scripts/build-run.mjs`, `src/scripts/build-run-core.mjs` (new)                                                                              | Guarded control-artifact creation/read, digest binding, byte limits, reply matching and terminal validation.                                         |
| `src/shared/model-tiers.md`, `build.mjs`                                                                                                         | Register runner/probe spawn sites, ship both helpers, preserve existing role/profile sites, measure caller budget.                                   |
| `test/build-run.test.mjs` (new)                                                                                                                  | Protect the actual transport, state, failure and authorization invariants.                                                                           |
| `test/delegation-mandate-contract.test.mjs`, `test/model-tiers-contract.test.mjs`, `test/workflow-contracts.test.mjs`, `test/build-lib.test.mjs` | Protect single dispatch, leaf boundaries, tier/profile preservation and delivery of the split/helper files.                                          |
| `evals/build-context/` (new)                                                                                                                     | Suite config, bounded fixture/scenario adapters, evaluator, README and manually recorded evidence using the existing scaffold.                       |
| `test/build-context-eval.test.mjs` (new), `.github/workflows/ci.yml`                                                                             | Validate the new suite's archive/instrument and add evidence reporting with the existing strict release gate; retain pinned action references.       |
| `docs/adr/per-spawn-model-tiers.md`                                                                                                              | Amend the active lean-orchestrator decision with the planned-build boundary and host-depth tradeoff.                                                 |
| `docs/developer-guide/architecture.md`, `docs/developer-guide/build-system.md`                                                                   | Document caller/runner ownership, allowed eager/deferred boundaries, fallback and measured limits.                                                   |
| `docs/developer-guide/skill-ownership.json`, `docs/developer-guide/skill-ownership.md`                                                           | Classify the new fragments as orchestration-owned and retain domain judgment in the central skills.                                                  |

The existing router, global leaf mandate, generic completion protocol and merge-gate envelope format need no semantic rewrite. Do not edit generated `dist/`; build it from source.

## Implementation details

### Work package 1: Bound and verify the planned-build handoff

Prerequisite: none.

- Implement one build-owned protocol version with request, blocked-question/reply, and terminal records. Use `<RUNTIME_STATE_ROOT>/.effective-flow/build-runs/<run-id>/`, distinct from unattended-planning `runs/` and merge-gate state.
- Before any write, verify execution/runtime receipts, runtime migration, ignore/tracked-state guards, physical containment and regular-file identity. Use exclusive creation for a new run and each immutable record; do not overwrite a foreign run or repair malformed state.
- Request fields: protocol/run ID, exact plan path and content digest, original user instruction/restrictions as immutable source data, originating interactive/non-interactive run mode, verified roots/checkout identity, resolved languages, completion condition, selected delivery restrictions and source association. Do not copy full workflow instructions or the conversation into dispatch text.
- The helper returns the request path/digest and a compact dispatch projection. Plan contents and larger source inputs remain referenced artifacts. Input restrictions that affect authority are mandatory, not optional summary fields.
- Fixed first-version bounds: dispatch projection at most 8 KiB, each control JSON record at most 16 KiB, at most one outstanding question per run. UTF-8 bytes are not tokens. Store a longer original request separately without truncating it; the request digest binds that source.
- Reject a missing field, unknown control field, unsafe path, changed digest, invalid language or oversized control record before dispatch. Do not drop constraints or truncate questions to make them fit.
- A result contains status, source/final plan identity, final checkout/head identity, required phase outcomes with evidence references, retained-worktree information, applicable pilot status and a bounded user-facing conclusion. Every emitted artifact reference has a digest and an owning root.
- Evidence references may be outside runtime state when their owning plan/review/delivery contract permits it; validate against the recorded allowed roots rather than assuming every file lives under one directory.
- Before mandatory wisdom/baseline cleanup and execution-worktree removal, persist bounded phase/gate receipts under the verified runtime root. Reference committed deliverables, including the archived plan, by repository identity, immutable commit and blob identity, and path. Preserve only the non-Git evidence needed for acceptance in durable runtime artifacts. Terminal verification and continuation must remain valid after successful cleanup; do not retain full diffs or skip cleanup to satisfy the new protocol.
- A digest proves byte identity, not user authorization, command execution or substantive correctness. The caller checks the matching run/phase and existing gate outcomes; independent reviewers still judge the actual artifacts.

Verify: focused helper tests cover byte limits with multibyte text, exact-boundary inputs, missing fields, exclusive-create collision, symlink escape, stale source, foreign result and missing evidence.

### Work package 2: Execute one approved Feature plan in a fresh runner

Prerequisite: work package 1.

- Split build at the existing clarified-plan seam: the current source already treats a referenced unbuilt plan that passes clarification as approval for phases 2–7. Preserve that meaning, including the visible completion condition.
- Keep all guards needed to decide dispatch eager in the caller. Explicitly update the build-system progressive-disclosure rule for this seam; do not hide a gate behind a pointer whose trigger the gate itself controls.
- Target the built `build` caller at no more than 320 lines, measured by the build's split-newline convention. This is a proposed implementation cap, not a claim that 320 lines imply a token count. Use a tighter measured `CONTEXT_BUDGET_LINES` entry with at most ten lines of headroom.
- The fresh runner loads `build-delegated-run` once. It cannot re-enter the caller and spawn another build runner. The handoff uses zero inherited turns where supported and explicitly carries the rendered `deep` tier.
- Preserve exactly once: worktree setup/ownership, source association and backlinks, initial implementation, documentation synchronization, tests, validation/corrections, routed independent review/incorporation, final validation, commit/delivery gates, plan archival, pilot finalization, lifecycle cleanup and completion checks.
- Existing implementation/review/profile spawn sites move with their contracts and retain their role/tier meanings. New runner and nesting-probe sites receive their own model-tier rows and build-enforced markers.
- Before a runner makes project/runtime mutations, use one bounded read-only no-op nested child at `standard` to establish that its required leaf level is available. Await its completion; a failure cannot be represented as a passed capability check.
- If the host refuses nesting before mutation, the caller reports the fallback once and follows the existing inline build execution contract. Record the isolation objective as unavailable. After mutations begin, preserve state and reconcile the current phase; never restart the whole inline workflow blindly.
- The fallback keeps all specialist roles and quality gates. It may consume a large context and is never advertised as an isolation success.

Verify: structural/build tests establish one runner per approved plan, unchanged gate inventory/order, no delegation by named workers, proper profile sites, and all three delivered targets.

### Work package 3: Relay questions and finish without reloading the workflow

Prerequisite: work package 2.

- The runner returns nonterminal `BLOCKED-USER` with a validated question record and no pending worker child. It ends only its current turn, retains its logical build-run identity and transient pilot state in that same agent, and remains the sole execution owner. The parent verifies the record and presents the exact question/options in the resolved chat language.
- The question record identifies the originating existing build/delivery gate, question ID/revision, run/source/head digest and actual finite options or free-text response requirement. A question does not grant itself permission.
- Amend the owning worktree lifecycle fragments: a validated build BLOCKED-USER is a user pause inside the same logical workflow, not a terminal exit. Its owned worktree may remain active, with no lock held, and ownership remains pinned to this build-run ID. Terminal transitions and exit self-check run on actual DONE, ABORT or failure. This exception grants no general aborted/failed-to-active adoption. On continuation revalidate run association, ownership, receipt and content.
- Preserve the originating run mode rather than treating every relay as non-interactive. Add an explicitly interactive-capable build relay to pr-review-integration: delivery.prReview = ask still produces the original question after PR creation. Trusted consent publishes exactly once; refusal does not publish. Truly non-interactive runs retain their existing limits. Do not widen the existing merge-gate relayed mode by accident.
- Support the existing post-plan gates, including delivery choice, residual findings and completion/recovery choices. If execution reveals a genuinely new design/scope question, return it through the same constrained channel; do not invent an approval or force it into a yes/no enum.
- Only a reply received from the current trusted user channel can produce a reply record. Bind it to the exact outstanding question and current source/head. A reviewer body, tool result, saved draft answer, timeout or old approval is never a reply.
- Resume the original delegated agent, identified by the retained opaque child handle, with the validated checkpoint and trusted reply. Do not spawn a fresh replacement or copy its transcript/capabilities into the parent. A duplicate, stale, unmatched or broader approval is rejected. The resumed runner revalidates roots, source and reached gates and continues from the checkpoint, not from phase 2.
- Establish that the host can continue that same agent before selecting this path. If same-agent continuation is unavailable, use the complete inline fallback before mutations. If the agent or transient capabilities are lost after mutation, stop, preserve the recoverable artifacts/worktree, and report pending/unproven pilot finalization and affected gates. Do not infer DONE, reconstruct capabilities from retained state or restart implementation automatically; existing explicit recovery/adoption rules govern any later action.
- Bind checkpoints and completed gate receipts to the relevant index and working-tree content snapshot, including relevant untracked files, in addition to the plan and HEAD. Before accepting a reply or reusing an earlier gate, compare that snapshot. Unexpected changes require reconciliation, invalidate the affected review/validation gates, and renew an approval when its decision basis changed. A matching HEAD alone never establishes unchanged content.
- Checkpoints describe completed/pending phases and authoritative artifact references; they never promote a partly completed mutation to success. A missing or contradictory checkpoint stops for reconciliation with retained state.
- On `DONE`, verify required phase outcomes and artifact identities before the parent renders a concise conclusion. On `ABORT`, show the actionable cause and retained artifacts. No status may hide blocking findings or a retained dirty checkout.
- The worker's final message is the existing completion keyword plus the validated result reference and bounded conclusion, not the report body. Full findings and logs remain available by link; the parent reads only specific evidence needed to resolve a discrepancy or user question.
- A malformed/oversized free-text return can already have entered host history. Detect/report that contract deviation and fail result acceptance; do not claim the helper prevented host-level context growth.
- At the terminal boundary write a continuation projection with source, final verified head, pending next workflow and restrictions. The next workflow gets these references; it does not append previous logs or reuse this runner for another independent plan.
- If a user continues indefinitely in the same host chat, context can still grow. Provide a portable “continue from this artifact in a fresh session” reference at the workflow boundary when requested or when the observed host context is large; use no hidden threshold inferred from bytes and no automatic chat creation.

Verify: simulated question/reply/continuation tests prove no repeated implementation on resume, stale-head and unchanged-HEAD content-drift refusal, free-text clarification preservation, full pending-gate coverage and complete final evidence without importing full reports into the parent. A normal successful run must still validate DONE and its continuation after baseline discard and owned-worktree removal.

### Work package 4: Prove quality preservation and actual context reduction

Prerequisites: work packages 1–3.

Use `evals/build-context/` on the existing scaffold. Keep fixtures local and forge mutations stubbed. The scaffold provisions portable output; declaring a Claude or Codex root profile does not turn that output into a native target or attest child execution. Include these six contract scenarios, with the scaffold's five independently recorded valid runs per scenario and truthful host/profile receipts:

1. Approved one-module Feature plan completes every required phase and returns evidence-backed success.
2. Two-module Feature work receives an independent review correction and completes only after revalidation.
3. A delivery question is relayed; a trusted answer resumes once, while a tool-injected or stale answer is refused. Cover a dirty owned worktree without a plan PR and the delivery.prReview = ask publication gate after PR creation; consent publishes once and refusal publishes nothing.
4. A nested-spawn refusal before mutation takes the complete inline fallback and is labeled as unavailable for isolation.
5. Changed source/head, tracked or relevant untracked content changed while HEAD stays fixed, or an interrupted post-mutation checkpoint stops/reconciles without duplicate writes or a false completed plan. The normal success variant verifies terminal evidence after baseline discard and execution-worktree removal.
6. Oversized result/question, missing evidence, and third-party instructions cannot truncate obligations, promote success or enlarge authority.

Separately record 20 paired bounded feature workloads on portable Quality output: ten pairs per supported harness, five simple and five multi-module/review-correction pairs per harness. Before recording, pin the supported capability profiles, parent settings and required worker tiers. Baseline and candidate start from the same fixture/head, user instructions and pinned profile. Alternate execution order. Capture complete root and descendant transcripts privately; publish only redacted aggregate/evidence fields approved for the eval artifact.

Add suite-specific bounded, redacted per-spawn observations of role, target, requested and actual model/effort, parent/child association and completion, derived from actual transcript evidence. The existing root profile receipt is not descendant evidence. Missing or mismatched required observations fail the affected coverage claim.

Add a separate native compatibility lane for each native target. It must exercise an already-active Fast generation, one consumed Fast attempt, Quality continuation, a user pause/continuation and exactly-once finalization. Preserve transient-capability rules according to the decision recorded below; portable Quality recordings cannot stand in for this lane. Use suite-specific evidence adapters rather than widening every existing suite's root-receipt schema.

Proposed release gates use four predeclared harness/complexity cells, each containing five eligible paired slots. For every relative threshold, compute candidate/baseline for each pair and then the median of those five ratios; do not substitute a ratio of cohort medians. For absolute parent p95, use the nearest-rank estimator (rank ceil(0.95 × n)); with five observations this is the maximum and is reported as such. A cell needs all five eligible pairs and all required observations. Missing metrics leave it unproven; failures on a supported profile remain failed attempts, not replacement successes.

- In each cell, median paired parent-peak ratio is at most 0.50. For fresh-root slots whose first request input is at most 60k, candidate parent p95 is at most 120k; if fewer than five eligible absolute-threshold slots are available in a cell, that gate remains unproven.
- In each cell, the median paired cumulative root-plus-descendant input ratio is at most 1.15 and median paired elapsed-time ratio at most 1.25. Report raw totals, cached/uncached input where available and all fallback, invalid and failed attempts. Harness-wide aggregates are descriptive and never override a failing cell.
- Actual required review/validation models and gate coverage remain unchanged. Blinded independent review checks the final diff/artifacts against the same acceptance criteria and seeded known defects: no new Critical/Important defect, no missed seeded blocker, no unauthorized action, no false completion and no skipped validation.
- All independently specified fixture acceptance checks pass for baseline and candidate. Report rework/correction rounds and non-blocking observations; do not claim statistical proof of non-inferiority from twenty pairs.
- Unsupported-depth runs remain compatibility evidence and do not enter performance-success cohorts; disclose their count/rate. A supported profile that repeatedly cannot complete is not silently removed from the denominator.

Archive all twenty pair records and native compatibility evidence as sealed, suite-owned auxiliary evidence with immutable baseline build, candidate build and instrument identities. Extend pnpm eval build-context verify --mode strict to require the complete matrix, gate calculations and current candidate identity alongside the six behavioural scenarios. Raw transcripts and live capabilities stay private and outside published evidence.

Measure the final proposed delegated-default source in the isolated unpublished checkout, then release that measured candidate without a later source-level activation toggle. Activation means delivery of this approved candidate, not a source edit after measurement. Existing build-identity normalization is authoritative; any source or instrument change outside its existing normalization invalidates the affected evidence and requires fresh recordings. If gates fail, retain the currently installed release and the explicit measurement failure; do not relax quality, change thresholds after observing results, or call a parent-only reduction a total-cost saving.

## Acceptance criteria

- [ ] A clarified Feature plan reaches exactly one fresh deep build runner; unplanned/non-Feature and unsupported-host paths retain their existing authority/quality semantics.
- [ ] The built caller is at most 320 lines; all required dispatch guards remain eager and moved gate ownership is documented.
- [ ] Helper limits (8 KiB dispatch, 16 KiB control record), containment/digest checks, trusted reply binding and missing-evidence rejection are implemented and covered by meaningful boundary tests.
- [ ] Every existing phases-2–7 obligation is accounted for exactly once in the new path, including independent review, validation after correction, Fast lifecycle, archival and delivery/worktree cleanup.
- [ ] Resume compares index/worktree content as well as HEAD, invalidates affected gates after changes, never repeats completed side effects or treats a pending phase as complete; fallback and partial failure preserve recoverable state and remain visible.
- [ ] Terminal evidence and the continuation artifact remain verifiable after normal baseline/wisdom cleanup and owned-worktree removal, using durable receipts and immutable Git identities.
- [ ] The parent consumes compact results and referenced evidence rather than complete diffs/logs/reports, and a completed runner cannot absorb a new independent plan.
- [ ] All six behavioural scenarios have five current valid recordings, complete actual-model/profile evidence and no failing quality/authority invariant.
- [ ] All twenty portable Quality pairs, per-spawn observations and both native Fast compatibility lanes are archived and current; each five-pair cell passes its defined paired-ratio and nearest-rank gates before delivery of the delegated-default candidate.
- [ ] Required CI/distribution checks pass; affected existing eval evidence is refreshed before release; docs and skill-ownership relationships match the final contracts.

Together these criteria mean: one approved-plan delivery completes with the same required quality/authority evidence while the supported parent path demonstrably stays substantially smaller, and the compatibility path remains truthful.

## Validation plan

Run focused helper/contract tests first, then the repository's required distribution order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`. Build output supplies the final caller line measurement; never raise budgets merely to pass.

The new suite's `pnpm eval build-context verify` becomes available after its config/fixtures exist; it verifies recorded evidence and does not run a model. Add the suite to CI's existing evidence loop and strict release gate. Run the existing `merge-gate`, `iterate` and `next-steps` verify commands to identify which loaded sources became stale, and re-record every affected suite before the next release. Do not replace manual model evidence with archive tests.

Review generated Claude, Codex and portable output for single dispatch, valid role tiers, unchanged Fast representation, worker leaf boundaries, and shipped helpers. Perform the skill-ownership check for every expanded tool/shared fragment. No model prices, token-to-byte conversion, or subscription savings are assumed.

## Assumptions and open points

- The fixed bounds and performance thresholds are proposed acceptance targets for this requested change, not facts established by the diagnosis.
- Host nesting and transport differ. The protocol is portable at the artifact boundary; each supported host needs actual receipts. The known inline fallback preserves quality without promising small context.
- This pilot reduces future parent growth during planned Feature delivery. It cannot make already-large chats small, and does not yet isolate planning authoring, direct review aggregation, or every fix/refactor workflow.
- The active tier ADR already owns lean orchestration. Update it in place rather than introduce a competing architecture record or a second domain-skill playbook.
- Before implementation, compare the in-scope source with `de23f9b` and reconcile changes to approval, delivery, plan readiness or runtime receipts. Harmless line movement is not a blocker.
- User decision, 2026-10-20: continue the same delegated runner after questions. Transient capabilities stay only in that orchestrator; a lost agent state causes a controlled stop. No capability-persistence extension is authorized. The next-workflow handoff is separate from live-run resume.

## Plan review

### 2026-10-20 — Independent gap analysis and plan review

**Result:** Approved

Independent plan-level judgment using `effective-delivery` and `effective-engineering` identified two Important findings. Both were incorporated and independently verified closed on 2026-10-20. The focused verification reports no remaining findings; this is not an implementation or code review. The summary counts below record the findings resolved during this review, not outstanding blockers.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

### Findings

- **Important — Error cases: content drift at resume.** HEAD and plan identity do not cover uncommitted changes. Work package 3 now binds checkpoints/gate receipts to relevant index, working-tree and untracked contents, invalidates affected gates and renews approvals after decision-basis changes. The paused-run scenario includes unchanged-HEAD edits.
- **Important — Architecture: evidence survives cleanup.** Wisdom, diff snapshots and owned execution worktrees are temporary. Work package 1 now persists bounded gate receipts and immutable Git identities before cleanup; successful cleanup is explicitly covered by terminal-validation and continuation verification.

### Validation scorecard

- Clarity: concrete caller/runner ownership, files, protocol limits and ordered work packages.
- Verification: named contract scenarios, paired measurement gates and repository checks.
- Context: source baseline and observed metrics are separated from proposed thresholds and host limitations.
- Big picture: planned Feature delivery is the bounded first rollout, with quality and authority held constant.
- No-code boundary: this planning run changes only this plan file; the plan contains no implementation code.
- Workflow: Feature (`effective-flow build`) matches the changed execution and interaction behavior.

### 2026-10-20 — Deep interactive plan review

**Result:** Approved

Six Important findings were identified and are now incorporated and independently verified closed. The user chose same-runner continuation on 2026-10-20; focused verification confirmed consistency with transient pilot authority, lifecycle pauses and the native compatibility lane. No blocking findings or open decisions remain. The summary counts record findings resolved during this review; earlier review results are history.

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         2 |    0 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    0 |

- **Important — Architecture: transient Fast capabilities.** A fresh runner cannot receive capabilities through retained state under the existing pilot contract. The user chose continuation of the original agent, with its transient state retained in that agent and a controlled stop if that state is lost. WP3 now distinguishes nonterminal question pauses, same-agent resume and a separate next-workflow handoff; protected capability persistence is excluded.
- **Important — Error cases: user pause is not terminal exit.** The owning lifecycle fragments will keep a paused build active under the same run identity, without held locks, and apply terminal exit handling only at actual completion/abort/failure. Add dirty-worktree continuation without a plan PR.
- **Important — Scope: interactive review publication.** Carry the originating run mode and adapt pr-review-integration for an interactive-capable build relay so its default ask is preserved; truly non-interactive and merge-gate relays retain their current limits.
- **Important — Testability: one gate population and estimator.** All relative thresholds now use median paired ratios within each of the four five-pair cells. Absolute p95 uses nearest rank, and missing observations leave a cell unproven.
- **Important — Testability: actual target and descendant coverage.** Portable Quality performance evidence is separated from two native Fast compatibility lanes; suite-specific observations establish actual child execution rather than relying on root profile receipts.
- **Important — Architecture: release identity and evidence freshness.** The final delegated-default candidate is measured unpublished and then delivered at that same identity; sealed pair/native records are required by the suite's strict verification, with no post-measurement activation source edit.

## Open points

- No open points.

## Implementation evidence and continuation

### 2026-10-20 — Capability boundaries

Implementation and independent code review are in progress in the existing draft PR #581. This plan remains **Not implemented** until its complete acceptance and evidence gates pass. Host capability probes are separate from the six behavioural scenarios and the twenty paired workloads; they cannot satisfy either population or support a context-reduction claim.

- Codex CLI 0.163.0 actually completed a deep child, a standard grandchild and continuation through their original handles. A separate capacity-limited probe observed a pre-mutation nesting refusal followed by a successful direct standard leaf. Complete inline workflow delivery still requires its own scenario recordings.
- Claude Code 2.1.292 returned API 429 `usage_limit_reached` before any child or model input. Its reported weekly reset was 2026-10-22 at 16:00 Europe/Berlin. Claude capability, both Claude workload cells and the Claude native lane remain unproven. Continue unaffected work without treating this failed attempt as an eligible measurement or repeatedly probing the unchanged limit.
- A real native Codex role probe loaded the generated Node.js implementer sidecar under Codex CLI 0.163.0. The spawn explicitly requested the Fast override `gpt-5.6-luna` with `medium` effort; the actual child ran `gpt-6.1-sol` with `high` effort from that sidecar. Native Fast compatibility is therefore unproven on this host. This is a compatibility follow-up for the existing native representation owner, not authority to change model mappings or enable Fast in this plan.

Keep the approved thresholds, native lanes, actual per-spawn observations and same candidate/instrument identity requirements unchanged. Record feasible portable Codex workloads only after independent review and the exact candidate pin. Later Claude recordings must continue that same identity without a source activation toggle. Private transcripts and live capabilities remain outside published evidence. Until all gates pass, retain the installed release, the open plan and the draft PR; do not mark this plan implemented, archive it or claim the proposed reduction.

### 2026-10-20 — Source implementation and validation

The bounded runtime protocol, thin build caller and complete delegated/inline phase owner are implemented. Execution transitions, original-agent questions, content-drift checks, approved-plan-preserving completion, irreversible runtime-only handoff and cleanup-surviving evidence are covered by focused tests and independent review. Transient pilot capabilities are not persisted. The built caller measures **208/214 split-newline lines**, below the approved 320-line cap; this is not a token measurement.

Independent implementation review closed six execution/authority findings and two configuration/provider follow-ups. Independent evidence review closed seven provenance/verification findings and three adapter-compatibility follow-ups. The exact Codex built-in bootstrap inventory is bound without allowing user skills or altered canonical contracts. No scoped blocking code finding remains from those reviews; actual behavioural and performance acceptance remains separate.

The final prescribed correctness sequence passed: `pnpm agent:check`; `pnpm test` (2,983 passed, one skipped, zero failed); `node build.mjs` (all three targets); `pnpm test:distribution`. A real model-free coordinator preflight also built the approved baseline and current candidate, provisioned a disposable fixture and successfully prepared its isolated command/skill/prompt inputs. It stopped before model launch and supplies no behavioural recording or performance sample.

Freshness verification reports all five `merge-gate` recordings and all five `iterate` recordings stale after four loaded shared-source changes; refresh them before the next release. All eleven `next-steps` scenarios remain current. The six new build-context scenarios, portable paired matrix and native lanes have no archived workload evidence yet, so strict verification correctly remains unproven. Record the feasible actual Codex population after the candidate pin, retain failed attempts, and continue the unavailable cells only at that same candidate/instrument identity. The plan stays open and the PR stays draft while any approved gate is unmet.

### 2026-10-20 — First actual recording and sandbox integration

The first actual portable Codex candidate launch used clean source commit `8abc99aed951396e2f2a9ca694c7bf630df8d9c1` and instrument `sha256:c22dd78f5851bc95e94a67cf40ebcedda06f7b46140dbde50def638d911d2d55` on Codex CLI 0.163.0. The root ran `gpt-6.1-sol` with `high` effort and produced five positive model-usage observations, but completed no workflow and started no descendant. Two linked command-tool results returned exit code 71 with `sandbox_apply: Operation not permitted`; the outer CLI nevertheless exited zero. The outer macOS sandbox prevented the native command sandbox from starting. The earlier wrapper canary had not established this native integration.

This is a failed recording attempt, not an eligible scenario or paired measurement. Its original candidate, instrument, host receipts and raw recording bytes are retained in private runtime history with `recordingAccepted: false`, zero complete workflows and null performance metrics. Independent inspection verified all seven retained files against their recorded hashes. Do not relabel this attempt as evidence for a corrected instrument.

Further model calls are paused while the recording coordinator is corrected and independently checked with model-free native policy probes. The replacement must allow the fixture's actual Git and local forge operations while protecting host provenance, settings and raw transcripts from root and descendant tool writes. A changed recording instrument needs a fresh candidate pin and new recordings; no acceptance threshold or supported workflow duty is reduced by this integration repair.

### 2026-10-20 — Cross-harness recording instrument

The corrected coordinator uses native Codex tool policy and an independently checked whole-process Claude boundary. Claude preparation, launch, external stream capture and same-session continuation are present before the new candidate pin. The official sandbox runtime and its complete installed file membership are pinned; the exact public runtime bundle is retained privately for continuation after normal temporary-directory cleanup. Mutable Claude state cannot establish recording provenance. Unknown tool expressions, missing actual model/effort or usage observations, invalid parent edges and unbound capture chronology leave a recording unproven. No production runtime or native Fast model mapping changed in this correction.

Independent review closed four additional Codex recording-integration findings and found no new issue in the final cross-harness instrument. All 45 focused tests passed, including all four positive matrix cells and cross-harness rejection. Independent model-free native checks verified registration of 16 generated Codex roles and 21 Claude definitions, fixture Git/local-origin push and forge-stub operations, and denial of direct, inherited and symlink writes to protected host evidence. Claude checks also verified native Edit/Write protection and rejection of an excluded network domain. These checks started no model or provider API request and completed no feature workflow. Registration and tool protection do not establish actual Fast model/effort compatibility.

The complete prescribed sequence passed again: `pnpm agent:check`; `pnpm test` (3,002 passed, one intentional freshness skip, zero failed); `node build.mjs` (all targets, build caller 208/214 lines); `pnpm test:distribution`. An earlier full run had one failure in an unchanged process-runner timeout test. Its failed log is retained; five isolated repetitions and subsequent full runs passed without changing the test, timeout or concurrency. Existing merge-gate/iterate evidence remains stale and needs refresh before release; all eleven next-steps scenarios remain current. Build-context strict verification correctly fails while its six scenarios, twenty pairs and two native lanes are absent.

The final instrument review and correctness checks authorize a fresh clean candidate pin and new feasible Codex recordings. The first failed recording retains its original identity and is never adopted into the new instrument. Claude quota and observed native Codex Fast precedence remain the capability limits described above; no repeated quota probe, alternative account, model-mapping change or reduced acceptance gate is authorized by this continuation. The plan remains **Not implemented**, unarchived, and attached to draft PR #581. Required actual workload evidence and any reduction claim remain pending.

### 2026-10-20 — Second actual recording

A fresh actual Codex launch used clean candidate `04702825ba0d2e3468520345045e4295f0425c11` and corrected instrument `sha256:ff05960c3db9806776b3a7241acd786f664dc246ec81cc6d6808987d49363f26`. Ten unique sessions were recorded, with actual `gpt-6.1-sol/high` and `gpt-5.6-luna/medium` observations. The fixture reached Phase 7 after one documented correction round: implementation, documentation, tests, validation, independent review, final validation and plan archival were checkpointed; delivery, pilot finalization, cleanup and completion remained pending at a delivery-choice question. This is concrete partial workflow progress, not a complete scenario or paired measurement.

The CLI exited zero, but the coordinator rejected its postcheck because an initially absent isolated `codex/config.toml` became a generated fixture-trust entry. The separately reported difference between caller arguments and compiled native arguments is expected compilation, not a confirmed second settings drift in the compared settings objects. Full byte checks and rejection of genuine host drift must remain in place.

The rejection also exposed a capture-ordering gap: original stdout/stderr and the external process receipt had not been saved before the rejecting postcheck. Those missing original bytes are unavailable and must never be reconstructed or presented as original evidence. The actual journals, ten raw sessions, observed config bytes and paused fixture were retained with hashes in private runtime history. No owned process remains. Preserve this paused fixture without blindly resuming it; first correct and independently validate prelaunch initialization and outcome capture before any further model start.

This second attempt remains rejected with zero valid full workflows and null performance metrics. Its candidate, instrument and original files remain distinct from the first attempt and from every future recording identity. The plan stays **Not implemented** and PR #581 stays draft; the approved scenario, paired-workload, native-lane and reduction gates are unchanged.

### 2026-10-20 — Final bounded correction and host gate

The bounded recording correction is complete and independently reviewed. The exact native fixture-trust entry is initialized through the official local writer before sealed settings capture; later byte drift still rejects. Original stdout/stderr buffers, actual arguments, sealed stdin, timestamps and process outcome are saved before parsing or rejecting postchecks. Invalid outcomes remain closed, unproven attempts with null metrics. Current-turn input is validated and sealed before any filesystem, guard or subprocess activity. Root identity comes from the actual top-level native event; protected per-turn rollout prefixes bind the same root and runner across a trusted reply and reject foreign IDs, rewritten prefixes and copied-prefix corruption. The two-turn production-path test uses explicit synthetic gate judgments and diagnostic transcripts; it is not a feature recording.

Independent follow-up closed the final Important/Small capture finding and reports no open code findings at any severity. All 49 focused tests passed, including all four positive matrix cells and rejection cases. The final prescribed sequence passed: `pnpm agent:check`; `pnpm test` (3,006 passed, one intentional freshness skip, zero failed); `node build.mjs` (all three targets, caller 208/214 lines); `pnpm test:distribution`. The upstream #580 rule withholding dependent execution options while delivery/review is unfinished is preserved; the approved measurement baseline remains `de23f9b`.

The current Codex recording profile is still **unproven and blocked**. All nine actual spawn messages and child assignments in the second attempt are encrypted. The regular local App-Server methods `thread/read` with turns, `thread/turns/list` and `thread/items/list` were checked on an isolated history copy without models, provider requests or auth material. They expose wait events and child IDs/paths but no original assignment or role text. Older probe rollouts containing plaintext do not supply the missing current assignments. The closed literal adapter recognizes 17 of 172 freeform blocks from the actual attempt and zero helper invocations; unknown/dynamic forms stay unproven. Labels, guessed roles, decryption or new audit/attestation infrastructure cannot replace the approved observations.

No further identical costly recordings are authorized until an accessible official source for actual assignment/role and helper evidence is established. Keep both failed attempts and the paused fixture unchanged; do not blindly resume them, reconstruct missing stdout, relabel them under a later instrument or count them as eligible pairs. Continue through this branch and existing draft PR #581 after revalidating roots, source and forge association. Any later instrument change requires a new candidate/instrument pin and fresh affected recordings. Claude quota, actual Claude model/effort observation and the native Codex Fast precedence remain separate unproven gates. No profile downgrade, model-mapping change or activation toggle is included.

Zero complete behavioural scenarios, zero eligible pairs and neither native lane have been archived. Build-context strict verification therefore fails as required. Merge-gate and iterate recordings remain stale and need refresh before release; all eleven next-steps scenarios remain current. This plan stays **Not implemented** and unarchived, and PR #581 stays draft. The checked implementation is reviewable, but no acceptance-completion or context-reduction claim is made.

### 2026-10-21 — Remaining evidence gates and recorder compatibility

The separate native representation correction in PR #582 passed 36 actual Codex configuration
checks, including every Fast/tier role and conflicting model/effort parameters. This is bounded
role-selection evidence, not the full native workload lane. Its source is now included as a normal
dependency merge. The recording adapter had rejected schema 2 and Codex Fast sidecars; it now
reuses the central canonical inventory parser, binds exact target directory membership and
registers base, Fast and tier workers. Claude retains its generated models, efforts and tools.
Regression coverage rejects stale, missing, foreign and extra inventory entries. The canonical
parser and both local imports are instrument-bound; a regression test checks each dependency's
hash contribution. The build selector test follows the delegated phase's actual shared-file path.
Fresh model-free probes of both installed CLIs passed: 33 Codex registrations, 21 Claude
definitions, fixture Git/stub operations and protected-host/descendant write denials. Claude also
passed file-tool and non-provider network denials. Neither probe started a model turn or changed
fixture content; the ledger/lock absence was restored. These are recorder prerequisites only.

The recording instrument changes with this compatibility correction. A later cohort must use a
new clean candidate/instrument pin and matching baseline receipt. The failed attempts retain their
original identities, original journal hashes and zero eligible measurements; missing original
stdout/process receipts remain unavailable.

Current read-only strict verification still reports all six build-context scenarios absent,
twenty pairs and both full native lanes unrecorded. Eight merge-gate scenarios and seven iterate
scenarios are stale; all eleven next-steps scenarios remain current. A fresh model-free official
App-Server inspection additionally covered full turn items and bounded original item hydration.
It exposes native commands but still no original root/runner/worker spawn assignment. The nine
retained original spawn messages remain encrypted and the closed helper grammar still has no
input-bound helper observations. No decryption, task-name inference, new attestation infrastructure
or known-unprovable cohort launch was used.

The retained Claude sandbox bundle was restored without network or dependency resolution and
passed the exact membership pin. Claude Code is still 2.1.292; the reported weekly reset at
2026-10-22 16:00 Europe/Berlin remained future at this check, so the unchanged quota was not probed
again. Actual Claude model/effort, workloads and native continuation remain unproven. Preserve
Quality defaults, all thresholds and lifecycle gates; keep this plan Not implemented and both
PR #581 and PR #582 in draft until the complete approved evidence is accepted.

### 2026-10-22 — Supported native capture qualification

Official passive PreToolUse/PostToolUse hooks were qualified against the installed Codex 0.163.0
in an isolated profile with a protected journal and unchanged model/sandbox policy. Eleven real
events covered root and child Bash boundaries plus the original spawn. The spawn input was still
encrypted at both hook boundaries; SubagentStart supplied no task and UserPromptSubmit only the
root input. The Code Mode host disable switch failed actual tool execution. Neither route supplies
a supported plaintext original assignment. No production hook activation or task inference is
admitted. Shell probes retained actual Here-Document temporary-file denials, not helper success.

The bounded recorder correction consumes native completed CommandExecution boundaries with exact
thread/execution/timing/argv binding and the unchanged literal helper grammar. Duplicate views
must not count twice, and encrypted original tasks stop explicitly as unsupported. Regression
tests protect malformed, foreign, ambiguous and synthetic-output cases. These tests are not model
recordings and do not close the original-assignment, full workload or acceptance gates. The new
instrument requires repinning; this plan remains Not implemented and unarchived, with both PRs
in draft.

## 2026-10-23 — Bounded PR581 provisional release disposition (documentation addendum)

This addendum documents a separate release disposition for the bounded provisional
implementation on feature PR581. It does not complete this plan, change the full acceptance
criteria, archive the plan, or alter the ordinary strict verifier. Full strict acceptance remains
`FAILED`/`UNPROVEN` while the six behavioural scenario families, the twenty portable Quality pairs,
and one complete native lane per harness are absent. The plan remains **Not implemented** and
unarchived.

The provisional branch may authorize only the exact complete absence represented by the
implementation's 22 `ABSENT_POPULATIONS` entries: 16 behavioural variants, four paired cells
(Codex and Claude, simple and review-correction), and one native lane each for Codex and Claude.
Partial, invalid, stale, synthetic, failed, or archived records remain rejected. Missing
diagnostics stay outside `results/`; no model, role, authority, or quality invariant may fail.
The ordinary `merge-gate`, `iterate`, and `next-steps` suites remain strict, and the new default
orchestration plus complete inline fallback remain unchanged.

The implementation binds a detached Git Blob authorization with schema
`effective-flow.build-context-provisional-pr581/1`. The exact repository, feature PR581,
release PR/ref/version, final source commit and tree, instrument and policy digests, maximum
seven-day expiry, actual user authority text and digest, independent policy report and closed
material findings, and original protected-host request/preparation/policy/run are all required.
The release PR must remain open and unmerged against `develop` at the authorized head. `inspect`
and `verify` are read-only; they load only the pinned blob and the original authenticated GitHub
run/jobs/logs through the existing backend, then verify exact materialization files, modes, and
digests. Absent repository pins fail the normal full strict route. No release-please stamp
exception, Fast activation, pilot resume, or hosted publication is implied.

The practical bootstrap sequence is: complete the remaining owned implementation work; refresh
the other suites; qualify a separate clean committed source candidate (the CLI rejects dirty or
untracked input while foreign plans remain preserved); inspect that candidate; obtain an
independent policy report bound to its source/tree/instrument/policy; and then run the original
protected-host and technical checks against the exact final release-PR tree. The later release
decision must report the full strict result and the provisional disposition separately. A stop or
recovery condition retains failed evidence and leaves the full acceptance unproven.

Documentation surface inventory for this slice:

| Surface                                                    | Disposition                                                                        | Reason                                                                                                                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evals/build-context/provisional-release.mjs` and CLI help | Updated by implementation; docs describe its read-only `inspect`/`verify` contract | The implementation owns exact validation and backend re-observation; this plan records the reader-facing release decision.                                             |
| `evals/build-context/README.md`                            | Updated                                                                            | The suite needs the exact provisional boundary, 22-entry absence list, identities, and bootstrap constraints.                                                          |
| `docs/developer-guide/release-and-installation.md`         | Updated                                                                            | Release operators need the post-loop blocking step, pinned variables, live-PR checks, and no-waiver distinction.                                                       |
| This plan                                                  | Updated with this addendum                                                         | The slice needs a traceable open status and recovery path without marking full acceptance complete.                                                                    |
| Root `README.md` / `README.md.src`                         | No impact                                                                          | This is a release-policy and developer-evidence route, not an end-user installation change.                                                                            |
| Technical tests and workflow contracts                     | No documentation edit                                                              | Implementation and test owners retain these files; current evidence is intermediate and the final report follows the remaining regression and independent-review work. |

Current evidence to report accurately: 63 focused build-context tests and 438 workflow tests pass
for the present slice; the prior expected last-step contract failure was corrected. The new
`test/build-context-provisional-host.test.mjs` covers 32/32 admission cases for the complete
`verifyHostedCandidate` → `observeBackend` → raw API/ZIP/source-and-transport Git-chain path; the
original backend/transport tests are 39/39 green. These are unit fixtures and regression tests,
not actual hosted admission proof. The initial fixture failure remains retained in the named
private log. The full strict verifier still fails as required. These counts are not final release
acceptance.

### 2026-10-23 — Independent policy review of this slice

Independent policy review passed 470/470 targeted tests and identified two Important findings of
low complexity. Both are corrected: the operator guides no longer suggest anchoring the detached
blob in the immutable validation transport or guarantee its availability, and the workflow ordering
assertion is formatted. No known findings remain open for this slice; the bounded corrections
await their independent recheck.

GitHub Blob availability is not guaranteed throughout the maximum seven-day authorization window.
The two trusted pins provide no storage guarantee; an unavailable exact blob fails reading and
admission closed. The original validation snapshot branch remains create-only and immutable, with
no new branch or delivery PR for this bridge.

The parent workflow still owns the separate Hosted fix, final four checks, exact-candidate review,
and original exact-source host qualifications. Full acceptance remains unproven and this plan
remains Not implemented and open.

## Review findings

**Date:** 2026-10-20
**Reviewer:** Independent runtime/workflow and Node.js reviewers

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    23 |
| Open / Not implemented |     0 |

These counts cover implementation-review findings: eight runtime/workflow findings, ten initial evidence findings, four native recording-integration findings and one final capture follow-up. The actual recording and acceptance gates above remain open.
