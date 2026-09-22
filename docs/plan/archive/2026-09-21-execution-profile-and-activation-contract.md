# Execution-profile and activation contract

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `91afe89` on 2026-09-21.
**Working state:** `docs/concept/` and
`docs/plan/2026-09-21-iterate-behavioural-eval-coverage.md` are untracked user work and must remain
untouched. The source concept for this plan is therefore working-tree evidence, not part of `HEAD`.
**Depends on:** Nothing. This is work package 1 of 6.

## Requirement

Define one provider-neutral contract for Quality and Fast implementation profiles before either
workflow may use Fast. The contract must own activation, ordered packet eligibility, first-reason
reporting, mixed-scope coupling, the initial-delegation-only boundary, retained-state escalation,
native capability loss, and portable behavior. It must not create a second file-routing system or
change the current `build` and `refactor` behavior in this delivery.

This is a behavioral extension and configuration contract, so Feature (`effective-flow build`) is
the appropriate implementation workflow.

## Architecture decisions

- Add `src/shared/execution-profiles.md` as the single policy source. Existing project-routing
  buckets remain the packet identity unless an approved plan already supplies narrower,
  independently owned packets.
- Use the Boolean project key `executionProfiles.fast.enabled`. Missing, `false`, malformed,
  ambiguous, or unreadable means Quality. `true` admits the project to the pilot lifecycle but does
  not itself start measurement or permit Fast. Only an explicitly started baseline may collect
  Quality-only comparison data, and only a successfully activated generation may route eligible
  packets to Fast. The key never names a provider model. Setup remains the sole configuration
  writer.
- Keep the setup UI for this key out of work package 1. This avoids shipping an apparently active
  opt-in before any workflow consumes it. The contract, schema validation, and documentation may
  name the reserved key; work package 4 exposes it when `build` first adopts the policy.
- Evaluate the gate in a fixed order and record only the first decisive exclusion reason:
  `profile-unavailable`, `trust-boundary`, `destructive-data`, `migration`, `concurrency`,
  `unsafe-code`, `public-compatibility`, `merge-conflict`, `unclear-ownership`,
  `cross-domain-dependency`, and `unknown-evidence`. Fast additionally requires an approved,
  measurable source, bounded write paths, established validation commands, and closed product and
  architecture decisions. Every unknown selects Quality.
- Define executable evidence for every ordered reason rather than relying on labels alone. The
  canonical fragment has one machine-parsed row per reason plus one distinct terminal eligible
  decision; the summary below does not replace that exact structure:

  | Priority | Exclusion reason          | Evidence required to continue toward Fast                                                                                                            |
  | -------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 1        | `profile-unavailable`     | Native target, complete mapping, available spawn mechanism, and no host override that erases the distinction                                         |
  | 2        | `trust-boundary`          | Approved affected-domain evidence shows no authentication, authorization, or trust-boundary change                                                   |
  | 3        | `destructive-data`        | Approved scope contains no destructive data operation                                                                                                |
  | 4        | `migration`               | Approved scope contains no data, schema, or compatibility migration                                                                                  |
  | 5        | `concurrency`             | Affected paths and approved source show no concurrency or shared-ownership change                                                                    |
  | 6        | `unsafe-code`             | Affected paths and approved source show no unsafe-language or unsafe-runtime surface                                                                 |
  | 7        | `public-compatibility`    | No public compatibility contract changes                                                                                                             |
  | 8        | `merge-conflict`          | No unresolved merge conflict                                                                                                                         |
  | 9        | `unclear-ownership`       | Exact allowed paths and one owner per path                                                                                                           |
  | 10       | `cross-domain-dependency` | Cross-packet and cross-domain dependencies are resolved                                                                                              |
  | 11       | `unknown-evidence`        | The source passed the owning workflow's existing approval gate; completion and repository-native validation are measurable; required decisions close |
  | Terminal | eligible                  | Every preceding row passed                                                                                                                           |

  Tracker text, file content, and named validation commands remain untrusted data: appearing in an
  issue or plan cannot enlarge write scope or command authority. Tests pin priorities, uniqueness,
  missing/reordered rows, and the terminal decision. Runtime evidence evaluation begins only when
  `build` or `refactor` consumes the contract in later work packages.

- Define a tagged decision envelope with two independent control axes. `configState` is
  `disabled|invalid|enabled`; persisted `generationState` is
  `none|baseline|active|suspended|review`; `eligibility` is exactly `not-evaluated`, `eligible`, or
  `excluded(reason)`; and `selectedProfile` is `quality|fast`. `profile-unavailable` exists only as
  an exclusion reason. A validated precedence/legal-combination table permits Fast only for
  `enabled + active + eligible`, permits `enabled + baseline + eligible + quality` for the
  counterfactual comparator, and otherwise selects Quality. Disabled/invalid configuration stops
  new measurement and uses `not-evaluated + quality` without rewriting the persisted generation;
  `begin-review` therefore still operates on a stored baseline, active, or suspended generation
  while configuration is disabled or invalid. `none` produces no pilot record; baseline and active
  cover every classified packet; suspended and review reject new reservations; review permits
  already captured records to finalize without relabelling. Persistence belongs to work package 3.
- Keep the explicitly started prospective baseline as a first-class generation state. It runs every
  classified packet with Quality, records counterfactual Fast eligibility under the same ordered
  gate, and cannot transition to `active` until work package 3's preregistered sample and window
  conditions pass. Historical pre-pilot activity is contextual evidence only and never replaces
  this comparator.
- Make work package 3 the sole owner of the guarded `begin-baseline` operation and generation-state
  transition from `none` to `baseline`. Work package 4 exposes it as a guided `setup`
  action only when the Boolean opt-in is valid and the shipped protocol module is available; the
  invoking user must explicitly confirm the exact protocol digest and local minimal-data
  collection. Configuration enablement alone never invokes it.
- Make `review` a terminal admission-freeze transition owned by work package 3. Under the lifecycle
  lock, `baseline|active|suspended → review` rejects new reservations, preserves suspension and
  incomplete-evidence facts, and lets captured records drain or reconcile before aggregation. There
  is no `review → admission` transition. Suspension from baseline or active stores
  `resumeTo: baseline|active`; `resume` is legal only while `generationState=suspended` and restores
  only that stored value, never a caller-selected target. After `begin-review`, evidence
  reconciliation may clear blockers but must leave `generationState=review`; `resume` rejects.
- Freeze the fallback enum for measurement and workflow handoff:
  `none`, `spawn-rejected`, `worker-abort`, `missing-context`, `scope-growth`, `new-decision`,
  `requirements-mismatch`, `keywordless-exhausted`, and `scope-incident`. Gate-selected Quality
  with no attempted Fast uses `none`, not a fallback. Tests pin the
  decision-to-reason/fallback mapping.
- Freeze a separate `pilotControlOutcome` enum: `none`, `finalization-failed`,
  `critical-safety-incident`, `critical-data-integrity-incident`,
  `critical-authorization-incident`, `critical-scope-incident`, `evidence-gap`,
  `incomplete-record`, `capacity-exhausted`, and `control-state-unpersistable`. Work package 3's
  shipped protocol owns the exact mapping: critical incidents, finalization failure, evidence gap,
  and capacity exhaustion persist the matching suspension reason; finalization/evidence failures
  also leave incomplete inventory; `incomplete-record` blocks directly from inventory; and
  `control-state-unpersistable` emits a value-free alert because no durable reason can be proven.
  None requests a Quality implementation worker or changes a successful product diff. Fast remains
  blocked until the relevant inventory/suspension is reconciled and, only from `suspended`, the
  confirmed `resume` succeeds.
- Let disjoint packets choose profiles independently only when ownership and dependencies are
  explicit. Coupled packets share Quality.
- Fast may be requested only for the first attempted implementation spawn. A keyword-less resume
  remains the same attempt; every newly spawned retry, correction, validation repair, review
  incorporation, conflict resolution, or scope-growth continuation is Quality-only.
- Continue escalation in the same verified checkout. The transfer record carries packet/bucket,
  original objective, allowed scope, changed paths, completed and incomplete requirements, checks
  and outcomes, dirty-state summary, escalation reason, the execution-location receipt, and a
  consumed-Fast marker. The orchestrator owns this record: changed paths and dirty state come from
  fresh Git inspection under the revalidated execution-location receipt, while worker-reported
  requirement and check results remain claims until verified. The Quality worker inspects the
  retained diff first and never starts a second Fast attempt. The record is ephemeral delegation
  data; it never enters minimal telemetry, and paths or handoff details may persist only through
  work package 3's explicit detailed-trace consent and redaction contract.
- Portable is Quality-only in V1. Missing native support, a rejected Fast spawn, or Claude's
  `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` selects the registered Quality role; detect the environment
  variable by presence only and never read, relay, or persist its value. Missing support or that
  override prevents a Fast attempt and records gate reason `profile-unavailable`. A Fast spawn that
  was actually attempted but rejected records fallback `spawn-rejected`, consumes the attempt, and
  continues once with Quality. The run must not claim profile enforcement that the host prevented.
- Define the suspension interface: matching pilot-control outcomes require the work-package-3
  subsystem to persist a guarded cross-run suspension when storage permits, later runs to check both
  suspension and incomplete inventory before Fast, and an explicit confirmed `resume` to clear a
  suspended state. Work package 1 defines the interface and complete vocabulary but writes no
  runtime state itself.
- Make work package 3 the sole owner of the gitignored suspension record and its digest-bound clear
  operation. Work package 4 exposes that operation only as a guided `setup` action after guarded
  inventory, a redacted incident summary, and explicit confirmation by the invoking user. The
  action persists no incident detail into tracked configuration. Enabling/disabling the opt-in or a
  successful Quality run never clears suspension automatically.
- Record the durable safety and cross-harness choices in
  `docs/adr/risk-aware-model-tiering-pilot-policy.md` and
  `docs/adr/native-execution-profile-representation.md`, following the repository's living,
  numberless ADR convention and the authoritative `effective-product` guidance.

## Affected files

| File                                                  | Planned change                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/shared/execution-profiles.md`                    | Add canonical profile, gate, escalation, correction, capability, and portable contracts.          |
| `build-lib.mjs`                                       | Add pure assertions for the gate, legal state combinations, enums, controls, and transfer fields. |
| `build.mjs`                                           | Validate the canonical fragment even before a workflow consumes it.                               |
| `src/shared/config-migration.md`                      | Declare the Boolean shape and fail-closed default without adding a migration.                     |
| `docs/adr/risk-aware-model-tiering-pilot-policy.md`   | Record the opt-in, fail-closed gate, one-attempt boundary, and rollback policy.                   |
| `docs/adr/native-execution-profile-representation.md` | Record Codex override, Claude sidecar, and portable non-optimization decisions.                   |
| `docs/user-guide/configuration.md`                    | Document the reserved default-off key and its no-model-name rule.                                 |
| `docs/developer-guide/configuration.md`               | Document schema, ownership, and invalid-value behavior.                                           |
| `docs/developer-guide/build-system.md`                | Document the new marked policy guard, build phase, failure mode, and focused tests.               |
| `docs/user-guide/getting-started.md`                  | Distinguish caller model, Quality/Fast intent, portable behavior, and Claude force override.      |
| `AGENTS.md`                                           | Summarize the profile/configuration architecture for maintainers.                                 |
| `test/execution-profile-contract.test.mjs`            | Add focused, mutation-resistant policy and schema tests.                                          |
| `test/build-lib.test.mjs`                             | Cover gate parsing, order, duplicate IDs, and malformed contracts.                                |

`src/tools/build.md`, `src/tools/refactor.md`, `src/tools/setup.md`, and `dist/**` remain unchanged in
this work package. `src/shared/config-migration-edge-cases.md` also needs no change because there is
no legacy key or external-state migration.

## Implementation details

### Approach

1. Use `effective-product` to write the two ADRs, keeping replaceable model aliases and pilot
   thresholds out of the durable decision rationale.
2. Add the canonical shared fragment with marked gate rows, stable reason IDs, positive evidence,
   packet coupling, Quality-only corrections, retained-state fields, native capability handling,
   and portable Quality behavior.
3. Add pure validation in `build-lib.mjs`: one row per exclusion, exact order, unique priorities and
   reason IDs, the distinct terminal eligible decision, explicit `unknown → quality`, the complete
   transfer-field set, every legal config-state/generation-state/eligibility/selected-profile
   combination, the exact fallback enum, and the separate pilot-control outcomes. Reject missing,
   duplicate, or illegal combinations before rendering.
4. Make `build.mjs` load and validate that source fragment without emitting or activating it. A
   malformed policy must fail before the atomic distribution swap.
5. Extend the generic configuration reader contract for the Boolean key. Do not create a legacy
   migration and do not add it to setup's interactive choices yet.
6. Update maintainer and user documentation, clearly labeling the key reserved/default-off until an
   adopting workflow lands.
7. Add positive and mutation/error cases, including portable, presence-only Claude force override,
   unavailable-before-spawn versus rejected-after-attempt, one Fast attempt, untrusted source data,
   fresh Git-owned transfer evidence, and retained-state completeness.
8. Prove that neither workflow requests Fast and that generated artifacts are behaviorally
   unchanged.

### Edge cases and stop conditions

- Stop for a product decision if the persisted key name must change; renaming it later requires a
  compatibility contract.
- Stop rather than inventing packet identity outside project routing or an approved plan.
- Never interpret configured `true` as proof that the native harness can enforce Fast.
- A Fast request from `fix`, `iterate`, `merge-gate`, review, documentation, testing, validation,
  or conflict resolution is a contract violation.
- Enabling, disabling, or removing the row requires no data or source migration.
- Because this work package changes `src/shared/config-migration.md`, which the merge gate loads,
  expect `pnpm eval merge-gate verify` to report stale evidence. Complete the required six-scenario,
  five-run re-record before release unless the implemented build-identity check proves unchanged;
  never weaken or bypass the verifier.

## Acceptance criteria

- [x] One provider-neutral fragment defines Quality and Fast without provider model aliases.
- [x] Missing, false, malformed, ambiguous, unreadable, unavailable, and unknown all select Quality.
- [x] The ordered gate has one structurally validated row per exclusion plus one distinct terminal
      eligible decision; runtime evidence evaluation remains deferred to the adopting workflows.
- [x] The tagged config-state/generation-state/eligibility/selected-profile envelope and validated
      precedence table close over disabled, invalid, enabled, none, baseline, active, suspended,
      review, unavailable, eligible, excluded, and correction paths without conflating configuration
      with persisted generation state.
- [x] Work package 3 owns `begin-baseline`; work package 4's guided `setup` action can invoke it only
      after valid opt-in, protocol-digest display, local-data disclosure, and explicit confirmation.
- [x] Mixed-scope coupling, first-attempt-only Fast, Quality-only corrections, retained-state
      continuation, and no-second-Fast are explicit and tested.
- [x] The exact pilot-control enum and outcome-to-suspension/inventory/alert mapping are validated;
      no control outcome starts an implementation fallback or changes a successful product diff.
- [x] The transfer contract contains every required operational field while remaining separate from
      default telemetry.
- [x] Portable is explicitly Quality-only, and Claude force override cannot be reported as enforced
      Fast.
- [x] The suspension schema and transition contract require cross-run persistence and explicit
      confirmed resume when work package 3 implements the runtime owner; work package 4's guided
      `setup` action is the only user-facing clear path, and `resume` rejects outside `suspended`.
- [x] Review atomically freezes admission from baseline, active, or suspended; preserves incident and
      incomplete-evidence facts; drains captured records; and has no route back to admission.
- [x] Both ADRs exist and follow the repository convention.
- [x] No workflow adopts Fast and setup does not expose an inert opt-in.
- [x] Any merge-gate behavioral-evidence debt caused by the shared configuration change is measured;
      the required re-record remains an enforced prerequisite before release.

## Validation plan

Run focused checks first:

```sh
node --test test/execution-profile-contract.test.mjs test/build-lib.test.mjs
node --check build.mjs
```

Then run the repository sequence:

```sh
pnpm agent:check
pnpm test
node build.mjs
pnpm test:distribution
pnpm eval merge-gate verify
```

Inspect the generated diff or checksums to confirm that work package 1 has not changed workflow
behavior or introduced Fast worker artifacts.

## Implementation results

- Added the unconsumed canonical policy in `src/shared/execution-profiles.md` and pure parsing and
  validation in `build-lib.mjs`. The build reads and validates the fragment before the atomic
  distribution swap but does not render or activate it.
- Extended the configuration reader contract with the reserved strict Boolean
  `executionProfiles.fast.enabled`. Setup remains unchanged and is still the sole future writer.
- Added the two living ADRs plus user, developer, and maintainer documentation. Concrete native
  model aliases and pilot thresholds remain outside this work package.
- Added focused positive and mutation tests for the ordered evidence gate, GFM table parsing, state
  algebra, fallback and pilot-control mappings, transfer authority, build ordering, output
  inventories, and the no-activation boundary.
- Review incorporation pinned all positive-evidence clauses, completed the fallback-event map, and
  hardened source and generated-output checks. No workflow, worker, or portable artifact requests
  Fast.

## Test results

- `node --test test/execution-profile-contract.test.mjs test/build-lib.test.mjs`: 245 passed.
- `node --check build.mjs`: passed.
- `pnpm agent:check`: 472 files passed.
- `pnpm test`: 1,166 passed, one intentional skip, no failures.
- `node build.mjs`: passed for all three targets and all context budgets.
- `pnpm test:distribution`: passed.
- `git diff --check`: passed.
- `pnpm eval merge-gate verify`: completed successfully and reported all six scenarios stale, with
  five stale archived runs each. Per the repository contract this is measured release debt; the
  six-scenario, five-run re-record is required before release, not before this feature PR.
- Generated-output inspection found no `execution-profiles.md`, policy markers, Fast/profile-named
  worker, or activation string. The reserved key appears only in the expected configuration-reader
  contract.

## Review findings

**Date:** 2026-09-22
**Reviewer:** `effective-flow-code-validator`

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     4 |
| Open / Not implemented |     0 |

The four fixed Important findings covered exact gate evidence, GFM table parsing, complete
fallback-event mapping, and no-activation/build-order test discrimination. No Critical or Note
findings and no admitted residual findings remain; no external review report was created.

## Assumptions and open points

- The initial key name is `executionProfiles.fast.enabled`; no unresolved product choice remains.
- The concept's hybrid native representation is accepted and becomes durable through the ADR.
- Concrete Fast aliases are selected by work package 2, not this policy contract.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------- | --------- | ---- |
| Architecture    | 0        | 0         | 0    |
| Security        | 0        | 0         | 0    |
| Data protection | 0        | 0         | 0    |
| Error cases     | 0        | 0         | 0    |
| Testability     | 0        | 0         | 0    |
| Scope           | 0        | 0         | 0    |
| Maintainability | 0        | 0         | 0    |

### Findings

- **Critical — resolved architecture decision:** The flat decision envelope was replaced by a
  tagged config-state, generation-state, eligibility, and selected-profile structure with a
  validated precedence table. The prospective baseline can express `eligible + quality`, disabled
  configuration preserves the stored generation, and `profile-unavailable` is only an exclusion
  reason. The later deep review adds canonical terminal `review`, including direct
  `suspended → review`, captured-record drain, and no return to admission.
- **Important — resolved error-handling decision:** Work package 3 owns the guarded suspension
  record and digest-bound clear operation; work package 4 exposes it through guided `setup` only
  after inventory, redacted review, and explicit confirmation. Configuration changes and Quality
  success cannot clear it.
- **Important — resolved error-handling decision:** Measurement-finalization failure is now a
  separate pilot-control outcome within a closed vocabulary shared with work package 3. The mapping
  distinguishes persisted suspension, inventory-only blocking, and unpersistable alerts; none
  starts an implementation fallback or changes a successful product diff.
- **Incorporated during deep review:** Pre-spawn unavailability and post-attempt rejection now have
  different outcomes; the gate has one machine-readable row per exclusion and a terminal eligible
  result; source content is untrusted; transfer evidence is orchestrator-owned and freshly derived;
  environment detection is presence-only; handoff data is ephemeral; and the new build guard owns
  matching developer documentation. The pilot also now requires an explicitly started prospective
  Quality-only baseline rather than substituting historical activity. Work package 3 owns its
  guarded start transition, work package 4 owns the guided confirmation surface, and the build guard
  validates the complete state algebra, fallback vocabulary, and pilot-control separation.

## Open points

- No open points.
