# Pragmatic test and release policy

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Separate package release acceptance from qualification of experimental execution capabilities. Preserve the broad automated test layers and security boundaries without making every package release depend on a complete multi-host model-recording campaign. The owner approved this separation, including temporarily disabling unproven execution paths, on November 4, 2026.

This is a policy change, not a waiver under the existing policy. Explicitly supersede the blanket release-freshness requirement recorded by commit `dcd28974` and `docs/plan/archive/2026-09-21-release-gated-eval-freshness.md`. Do not reinterpret previous evidence or declare the historical host-driver race fixed.

## Outcome checkpoint

- **Primary outcome:** One implementable policy that keeps broad package checks mandatory and requires behavioural/native evidence at the activation boundary of the capability it qualifies.
- **Original outcome:** Unblock release work without allowing unqualified functionality or neglecting major tests.
- **Last evaluated attempt:** Planning against `origin/develop` at `ada4fdae89e654396971e7e357866a1820edc6f7`; owner accepted package/capability separation. No implementation or new recording attempted.
- **No-progress count:** 0 for this newly requested policy-planning outcome only.
- **Cumulative approach:** Prior release investigations, attempted fixture repairs and recording-environment work remain historical; their budgets are not reset or extended by this plan.
- **Continuation decision:** Implement this bounded policy before considering another recording campaign; evaluate the release afresh afterwards.

## Architecture decisions

1. **Mandatory package checks stay mandatory.** Retain format, full unit/integration tests including host-driver cases, build guards, distribution/installation smoke, Shellcheck, README checks and existing required-check reporting. Keep current required versus advisory status of other jobs. No test removal, selected-only replacement, deadline increase, assertion weakening or branch-protection bypass.
2. **Freshness is reported, not a universal package-release gate.** Always verify and report all five suites: `merge-gate`, `iterate`, `next-steps`, `build-context` and `focus`. Stale, absent or incomplete behavioural coverage alone does not fail a package release. These are evidence debts, never passes. Keep strict verification available with its existing truthful meaning for full suite acceptance.
3. **Integrity and actual defects remain distinct from freshness debt.** Invalid archives, malformed records, forged/mismatched internal stamps, verifier crashes and unclassifiable results fail closed. An expected source/loadset mismatch is stale evidence, not internal corruption. Known unresolved security-critical behavioural defects affecting reachable functionality block delivery until repaired or the affected capability is demonstrably unreachable. Do not infer that old failed evidence proves a current defect, or that missing evidence proves safety.
4. **Capability activation owns its evidence.** Existing supported baseline behaviour does not acquire a new blanket recording prerequisite. New or materially changed experimental delegation/native execution paths remain disabled until their applicable behavioural and host-boundary acceptance passes. In particular, automatic planned-build delegation must not ship active merely because the package gate becomes report-only: preserve the complete inline Quality route and select it before mutation while delegation is unqualified. Fast default-off is not evidence for the separate planned Quality delegation path.
5. **Focus is deliberately constrained.** Keep follow-up and send activation disabled. Do not advertise stale snapshot-host qualification as current. If a snapshot execution route still requires outstanding host qualification under its own contract, disable that route or retain its existing acceptance blocker; report-only release policy cannot grant it support. Documentation and deterministic pure helpers may still ship.
6. **One routine environment, targeted boundary validation.** Use the existing CI environment for routine package acceptance. Require an additional native/provider environment only when activating or materially changing a capability whose contract depends on that boundary. Do not introduce a universal machine matrix, re-pin hosts/models, or provision a recording host in this work. Enforce limitations through existing configuration/source routing and their tests rather than a new risk engine or waiver registry.

## Affected files

Paths refer to the inspected `origin/develop` tree, not the stale root checkout. Implementation first reconciles source drift on a clean source branch based on then-current `origin/develop`.

| File                                                                                         | Description                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/adr/pragmatic-test-release-policy.md`                                                  | New accepted policy, explicit supersession of blanket release freshness, preserved checks and capability activation obligations.                                       |
| `.github/workflows/ci.yml`                                                                   | Always report all five suites; replace release-wide freshness blocking with explicit integrity/error handling, retaining every other check and required job execution. |
| `test/workflow-contracts.test.mjs`                                                           | Protect mandatory tests, all-suite reporting, release/non-release equivalence for freshness, and fail-closed error propagation.                                        |
| `evals/_scaffold/round-core.mjs`, `evals/_scaffold/evaluate.mjs` and `evals/eval.mjs`        | Inspect and narrowly adapt result classification so coverage rollups or report-mode exit success cannot conceal invalid per-run evidence; retain strict semantics.     |
| `evals/build-context/_scaffold/archive.mjs` and `evals/build-context/_scaffold/evidence.mjs` | Separate expected identity drift from archive corruption and preserve independent lane/integrity failures under stale rollups.                                         |
| Existing verifier tests under `test/`                                                        | Cover the classification boundary without running a model or fabricating successful evidence. Identify exact owners before edits.                                      |
| `src/tools/build.md` and its existing routing/contract tests                                 | Disable unqualified planned-build delegation before mutation while retaining the complete inline Quality implementation path.                                          |
| `src/shared/build-run-contract.md`                                                           | Align delegation acceptance and fallback language with the route actually enabled; amend only if it owns the changed decision.                                         |
| `src/shared/build-delegated-run.md` and `test/delegation-mandate-contract.test.mjs`          | Reuse the existing complete inline phases 2–7 and their contract assertions; preserve mandatory-helper failures rather than copying the workflow into `build.md`.      |
| `src/tools/focus.md` and owning Focus gate fragments/tests, if affected                      | Keep follow-up/sends disabled and enforce the disposition of any unqualified snapshot-host execution route.                                                            |
| `src/shared/focus-session-contract.md`                                                       | Explicitly constrain its T3 observed/report-only snapshot route, whose candidate-bound release qualification is superseded and pending requalification.                |
| `docs/developer-guide/release-and-installation.md`                                           | Explain the package gate, visible evidence debt and separate capability acceptance.                                                                                    |
| `docs/developer-guide/focus-host-acceptance.md`                                              | State which routes remain disabled and why; no new supported-host claim.                                                                                               |
| `docs/adr/per-spawn-model-tiers.md`                                                          | Reconcile the draft planned-build isolation decision with the temporary inline-only disposition.                                                                       |
| `evals/{merge-gate,iterate,next-steps,build-context,focus}/README.md`                        | Replace blanket release-freshness prose with the new ownership rule; preserve recording procedures and truthful strict acceptance.                                     |
| `AGENTS.md`                                                                                  | Update the repository's behavioural release-policy summary without duplicating the new ADR.                                                                            |

## Implementation details

### Approach

1. **Establish the source baseline and disabled surface.** Work from fresh `origin/develop`, targeting `develop`, never the generated release branch or `main`. Preserve the root's unrelated fixture modifications, diagnostics and five existing untracked plans. Enumerate current planned-build and Focus activation routes and identify their existing configuration owners. List the minimal disabling changes and baseline fallback before touching CI; if a safe boundary cannot be established, stop for a focused decision rather than just relaxing the package gate.
2. **Record the policy once.** Add the ADR and update its consumers. Mark the former blanket release-freshness decision as superseded for package delivery, not as satisfied. Keep specific capability security/host contracts authoritative. Do not edit archived evidence, old result stamps or historical plans to manufacture compliance.
3. **Make reporting mechanically honest.** Inspect and narrowly adapt the named owning hooks: legacy round rollups currently prioritize coverage over invalid runs, build-context combines validity and behavioural problems and can prioritize staleness over lane problems, and the report-mode CLI can return success for invalid evidence. Classify underlying per-run and per-lane validity independently of the top-level freshness label. CI must distinguish current/pass, stale/absent/incomplete coverage, valid recorded negative outcomes, and invalid/error states without parsing incidental English console text. Separate expected candidate-identity drift from corruption at its evaluator/archive owner. Reuse structured fields where available; add only a narrow result discriminator if necessary. Preserve `verify --mode strict` failure on stale, absent or short evidence and its existing treatment of other states. Never implement report mode as an unconditional `continue-on-error` or blanket ignored exit code.
4. **Bind capabilities to acceptance.** Default the unqualified planned-build route to the full inline Quality path before any worker mutation, reusing the owner in `build-delegated-run.md` without suppressing mandatory-helper failures. Keep follow-up and sends unreachable under the current public configuration. For the specifically affected T3 observed/report-only snapshot route in `focus-session-contract.md`, either disable reads before content access or name and test an enforceable capability-specific blocker that remains after relaxing CI; historical qualification prose alone is not enforcement. Test that ordinary callers cannot accidentally activate an unqualified route, while established supported baseline functionality remains available. Do not add a new configuration framework or a new privileged override.
5. **Keep evidence debt visible and owned.** Summaries show each suite's verdict, current basis, debt and affected disabled capability when applicable; no misleading green-evidence label. Use the ADR and existing capability issues, rather than a new status database, to name re-entry: re-record and pass the applicable contract before activation. A maintainer must stop delivery for a known reachable security-critical failure; test machine-readable blocking verdicts where already represented and do not invent an automated semantic safety classifier.
6. **Deliver source policy first, then reassess the release.** Use a normal reviewed source PR to `develop`. Only after merge, reconcile the generated release head through its normal workflow and execute fresh release checks. This plan grants no merge permission. Keep PR #618 draft; its diagnostic code is not required to change the policy. Resolve #609's independent conflict/dependency separately. Update #613's release-blocker wording only after the capability disposition is implemented, preserving its remaining activation work and coordinating with the separate snapshot-requalification plan.

### Edge cases

- State mapping is explicit: `waived` retains its existing validated scope and is reported as waived, never newly authorized or relabelled current; `missing-stamp` means unqualified evidence debt unless an existing archive-integrity rule requires that stamp, in which case that rule still blocks; `surplus` is a structural anomaly and blocks pending reconciliation; `unproven` is capability evidence debt only after independent integrity checks pass. Unknown states fail closed. None becomes a qualification pass.
- Mixed conditions must preserve both dimensions: short-plus-corrupt and stale-plus-corrupt block; stale-plus-valid-negative reports both and retains applicability/security triage rather than replacing the negative outcome with a stale label. No coverage or identity rollup may mask a subordinate integrity failure.
- A release with only stale or absent corpus data can pass package checks, but summaries must retain those labels. This does not qualify any new execution mode.
- Invalid records, unreadable verifier output, omitted suites or verifier process failure remain failures, even if another suite merely needs recordings.
- A valid negative record is not silently discarded. Report it explicitly and determine whether the known defect is applicable to a reachable capability; unresolved safety-critical applicability blocks delivery pending triage.
- A source change may intentionally make every suite stale, including this policy/routing change. Do not update stamps or counts to conceal that effect.
- Disabling a route after work has started must not cause a second implementation, loss of state or a false successful continuation. Preserve existing post-mutation stop/recovery rules; fallback selection belongs before mutation.
- Existing narrow provisional-release mechanisms do not become general bypasses. Remove or reconcile obsolete CI wiring only where the new policy replaces it; preserve the underlying evidence and security validation functions.
- Future activation of planned delegation or Focus requires its own bounded acceptance work. This plan authorizes neither that activation nor a model-recording campaign.

## Acceptance criteria

- [ ] The ADR explicitly supersedes blanket release freshness and identifies unchanged mandatory checks, evidence-debt reporting and capability activation ownership; repository guidance has no contradictory blanket-release instruction.
- [ ] Deterministic workflow/verifier tests cover release and ordinary PRs with current, stale, absent and short evidence for all five suites. Only the latter freshness/coverage states cease to block package delivery; summaries remain truthful.
- [ ] Corrupt evidence, malformed results, verifier crashes and omitted suites fail the appropriate checks. Strict manual verification retains its previous full-acceptance semantics. Existing archive integrity assertions are not weakened.
- [ ] Deterministic fixtures cover short-plus-corrupt, stale-plus-corrupt and stale-plus-valid-negative, plus `waived`, `missing-stamp`, `surplus` and `unproven`. Both underlying evidence validity and freshness are visible; invalid evidence cannot escape through a successful report-mode process exit or a coverage/staleness rollup.
- [ ] Planned-build delegation is unreachable while unqualified, and the complete inline Quality path remains available before mutation. Tests preserve post-mutation recovery/stop boundaries.
- [ ] Focus follow-up/sends stay disabled; any snapshot-host route without required current qualification is disabled or retains its specific blocker, with tests and documentation matching the supported surface.
- [ ] Full CI-order acceptance passes on the final source tree: format, full `pnpm test`, build and distribution smoke, plus unchanged Shellcheck and other required jobs. No reduction in test population, concurrency, assertions, security guards or deadlines is used to obtain a pass.
- [ ] One reviewed source delivery to `develop` establishes the policy. A subsequent release assessment uses the updated release head, checks capability limitations and known security-critical defects, and does not claim a release merge or renewed behavioural qualification without evidence.

## Validation plan

1. Run focused workflow/verifier and build/Focus routing tests first, including the state matrix above. Use fixtures for verifier outcomes, not invented behavioural successes. Confirm the actual test owner names before constructing commands.
2. Run `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` in CI order in the qualified project runtime; obtain Shellcheck and remaining required jobs through their existing CI definitions. No full-suite bypass or selected-only acceptance.
3. Run read-only verification for all five suites in report and strict modes and compare truthful dispositions. Expected strict freshness failures remain expected failures, not qualification passes. No live model executions are required for this policy implementation while unqualified routes remain disabled.
4. Inspect generated native and portable routing output for the same capability restrictions; use existing build guards and distribution checks rather than adding a platform matrix. New prompt sources must satisfy existing ownership and context-budget guards.
5. Re-read the release's actual head/checks after normal source integration. Record which results are passing package checks, which are outstanding evidence debts, and which functions remain disabled. Stop on any reachable security-critical defect or unproven disabling boundary.

## Assumptions and open points

- The approved trade-off accepts release of existing baseline behaviour with disclosed stale/missing model evidence, not activation of unqualified execution functionality.
- The pinned source is the planning baseline, not authority to overwrite newer source or parallel Focus work. Reconcile source drift before implementation.
- Historical release repair budgets remain consumed or unknown. Policy implementation is a separate authorized outcome, not another fixture-repair attempt.
- No additional machine, provider/model pin migration, retry campaign, release-branch product edit or environment cleanup is included.

## Plan review

**Result:** Approved

### Summary

Independent judgment found no Critical findings, one Important clarification and two Notes. All three were incorporated in this plan: explicit owning verifier hooks and mixed-state coverage, the concrete T3 snapshot route, and the existing inline-workflow owner/tests. The table records the original findings, all resolved; no blocking plan findings remain. This is planning acceptance, not runtime or release acceptance.

The subsequent deep interactive review on November 4, 2026 found no additional findings or consequential open decisions. It independently checked package/capability separation, all five suites and mixed validity/freshness states, planned-build fallback and recovery, Focus admission and activation restrictions, and implementation proportionality against the pinned source. No execution checks were part of either review.

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **I1 — Error cases, Important, resolved:** Named the verifier/evaluator owners that combine drift, validity and coverage. Required independent underlying validity checks, explicit exceptional-state mapping and mixed-condition fixtures; retained strict verifier and archive-integrity semantics.
- **N1 — Security, Note, resolved:** Named the T3 observed/report-only snapshot route and required pre-content-access disabling or a tested surviving capability-specific blocker before relaxing CI.
- **N2 — Maintainability, Note, resolved:** Named `build-delegated-run.md` and `delegation-mandate-contract.test.mjs` as existing inline fallback owners, including phases 2–7 and mandatory-helper failure preservation.

## Open points

- No open points.
