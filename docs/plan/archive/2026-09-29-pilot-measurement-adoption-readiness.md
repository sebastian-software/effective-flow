# Pilot measurement helper: adoption readiness

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `35b4523` (`origin/develop`) on 2026-09-29.
**Blocks:** `docs/plan/2026-09-21-build-field-pilot-integration.md`, and through it
`docs/plan/2026-09-21-refactor-field-pilot-integration.md`.

## Requirement

The first adopting workflow (`build`) stopped at its interface check. The shipped
pilot-measurement helper (`src/scripts/pilot-measurement{,-core,-protocol}.mjs`) leaves four
decisions to the calling prompt that belong in deterministic, unit-tested code:

1. `activate` cannot report "baseline conditions not yet met", or "another run is in flight", as a
   success. Both fail with `INCOMPLETE_EVIDENCE`, the same code as a genuine evidence fault.
   `activate` also demands an operator `confirmation`, although the execution-profile contract, the
   archived measurement plan and the user guide describe activation as automatic once the
   preregistered window and sample conditions pass. The ADR's "explicit activation" wording is the
   outlier this package corrects.
2. A critical incident can only be recorded through `suspend`, with the workflow naming the
   `critical-*` control outcome itself. That contradicts the rule that a workflow never maps or
   fabricates a control outcome.
3. A failed `finalize` never persists the `finalization-failed` suspension the protocol defines.
4. A reserved packet that was never started (the run aborted earlier) cannot be finalized. If it
   could, it would count as an attempted Fast packet without escalation and skew the preregistered
   Fast gate.

Several further behaviours would break field use:

- A `merge-gate` observation that starts while another run's reservation is open, or that races an
  activation, persists an `evidence-gap` suspension of the whole pilot.
- Routine lock contention would suspend the pilot once finalization learns to auto-suspend.
- The unlocked marker fallback reports control state as persisted whenever any marker exists.
- A leftover marker silently freezes admission with no recovery path.

This work package fixes exactly these points in the helper, its protocol and its documentation. The
`build` integration then consumes helper results instead of deciding them. No generation exists yet,
so a protocol digest change now invalidates no collected evidence. Adding operations and changing
operation semantics is a feature, so the recommendation is `effective-flow build`.

## Architecture decisions

### `activate`

- `confirmation` is removed from the exact key set. Passing it is a new `INVALID_PAYLOAD`
  rejection; no caller in `src/` or in any doc example passes it. The generation's existence after
  the confirmed `begin-baseline` is the consent. `protocolVersion` and `protocolDigest` stay
  required as the caller-side drift check; callers take both from the `protocol` operation.
- **Order inside the lock:**
  1. The admission check (`INVALID_STATE` unchanged).
  2. The **busy check**, defined below. When busy, return
     `{status: "not-ready", generationId, generationState: "baseline", unmet: ["busy"]}`.
  3. The evidence-health check. Genuine faults keep `INCOMPLETE_EVIDENCE` or `UNSAFE_STORAGE`.
  4. The readiness check. Unmet conditions return `not-ready` with `unmet` listing `window`,
     `sample`, or both.
  5. The transition, returning `{status: "activated", generationId, generationState: "active"}`.
- `unmet` is drawn from the closed set `busy`, `window`, `sample`.
- The readiness sample keeps counting `wouldBeFastEligible` packets of **completed** baseline
  records. Completed records contain only `attempt: "started"` packets, so the count does not
  change. The protocol guide documents the remaining difference from aggregation: completed
  records versus all terminal records.

### The busy predicate (shared)

- The helper is **busy** when the fresh evidence inventory shows at least one incomplete workflow
  record, open packet timing, or open gate observation, and it shows no invalid member and no
  orphan temporary.
- `activate` and `start-gate-observation` use the same predicate.
- A crashed run's reservation cannot be told apart from a live one, because reservations carry no
  liveness data. This is accepted. The crashed run surfaces through `inventory`'s incomplete counts
  and the next adopter's failing `start`, and it is resolved with `reconcile-record`.

### `record-incident` (new operation)

- **Input:** the common keys, `category`, and `affectedRecordIds`.
  - `category` is one of the closed set `safety`, `data-integrity`, `authorization`, `scope`.
  - `affectedRecordIds` is validated exactly as `suspend` validates it.
- **Mapping:** a core-only constant maps each category to its outcome:
  `critical-safety-incident`, `critical-data-integrity-incident`,
  `critical-authorization-incident`, `critical-scope-incident`. These are the four existing
  protocol outcomes, so the policy projection and the execution-profile control table stay
  unchanged.
- **Locking:** it joins the lifecycle-lock operation set and takes the lock itself. A held lock
  returns a retryable `LOCKED` with `pilotControlOutcome: "none"` and `controlStatePersisted:
false`. No unlocked marker fallback is used, so an incident can never be written behind a
  concurrent `resume`.
- **States:**
  - Under the lock it rejects `review` with `INVALID_STATE`.
  - From `baseline`, `active` or `suspended` it records the suspension. A re-suspension from
    `suspended` preserves the stored `resumeTo`.
- **Results:** a success returns the mapped outcome with `controlStatePersisted: true` and alert
  `none`. A write failure under the lock returns `pilotControlOutcome:
"control-state-unpersistable"`, `controlStatePersisted: false` and the value-free alert. That
  matches the existing control table and the adopter rule in `src/shared/pilot-measurement.md`
  step 6.
- It is added to the dispatch switch.

### `suspend`

- It no longer accepts the four `critical-*` outcomes, so no caller names an incident outcome.
- It keeps every other suspendable outcome, including `evidence-gap`.
- Existing tests call it only with `evidence-gap`.

### Transition markers and their recovery

- **Marker allowlist:** every `pilotControlMappings` suspension reason other than `none` (these
  are `finalization-failed`, the four `critical-*` outcomes, `evidence-gap` and
  `capacity-exhausted`), plus `suspend` and `resume`.
- **Capacity exemption:** the same reasons plus `suspend`. `resume` stays capacity-checked,
  unchanged.
- Both lists are derived from the protocol mappings rather than hard-coded.
- **Fallback fix:** the unlocked marker fallback of `persistPilotControl` reports persisted only
  when an existing marker's operation equals the requested reason. Any other existing marker
  counts as not persisted.
- **Roll-forward recovery:**
  - Before doing its own work, every `persistPilotControl`, `suspend` and `resume` completes a
    leftover suspension-reason marker under the lock by merging its reason into `suspension.json`
    and the suspended state, then removing the marker.
  - A leftover `resume` or `suspend` marker keeps today's handling.
  - `inventory` reports `transitionPending: true` while any marker exists, so a frozen admission is
    never invisible.

### Auto-suspension classification

The classification is exhaustive for `finalize` and the two gate-observation operations.

- **Never suspends; returns with `pilotControlOutcome: "none"` and stays retryable:**
  - caller errors: `INVALID_PAYLOAD`, `AUTHENTICATION_FAILED`;
  - contention: `LOCKED`;
  - location and version faults: `UNSAFE_RUNTIME_ROOT`, `MIGRATION_REQUIRED`, `PROTOCOL_DRIFT`;
  - a missing generation or record: `NOT_FOUND` from the generation or record read.
- **Mid-write fault; persists its outcome:**
  - The fault codes are `UNSAFE_STORAGE`, `WRITE_FAILED`, `INCOMPLETE_EVIDENCE` from a
    stored-record check, `NOT_FOUND` from the **timing-receipt read** (tagged there so it is
    distinguishable), and `INVALID_STATE` (practically unreachable after reservation).
  - `finalize` persists `finalization-failed`; the gate-observation operations keep `evidence-gap`.
- **Passes through untouched:** `CAPACITY_EXHAUSTED`, to the existing `executeOperation` handler,
  so no path suspends twice.
- **Not applicable:** `finalize` never raises `STALE_REVIEW`.

Further rules:

- **Wrapper placement:** the `finalize` wrapper runs after `finalize`'s lock is released, as
  `guardedObservationMutation` does, because `persistPilotControl` takes the lifecycle lock itself.
- **Envelope:** the error envelope carries the control metadata. An unpersistable result reports
  `control-state-unpersistable` with the value-free alert.
- **Stated limitation:** `CAPACITY_EXHAUSTED` from an oversized caller payload (input bytes, trace
  arrays, trace bytes) still suspends through the capacity handler. The claim "caller errors never
  suspend" is limited to `INVALID_PAYLOAD` and `AUTHENTICATION_FAILED`.

### Gate observation

- **`start-gate-observation`, order inside the lock:**
  1. The admission check. `INVALID_STATE` now returns
     `{status: "not-recorded", reason: "admission-closed", pilotControlOutcome: "none"}` instead of
     suspending, which covers a race with a concurrent activation.
  2. The busy check. When busy, it returns `not-recorded` with reason `busy`.
  3. The evidence-health check.
- A held lock also returns `not-recorded`/`busy`.
- Invalid members, orphan temporaries, and the mid-write faults above keep the `evidence-gap` path.
- `finalize-gate-observation` under `LOCKED` returns the retryable error with
  `pilotControlOutcome: "none"` and no suspension.
- `src/shared/pilot-measurement.md` stays byte-identical. It already treats every successful no-op
  as "continue unchanged" and enumerates no reason values. It is part of the `merge-gate` eval's
  hashed skill set, while the helper scripts are not.

### Stored packets record `attempt`

- Each stored final packet gains `attempt`, drawn from the closed set `started`, `not-started`,
  `unknown`.
- `validateStoredWorkflow` passes the record's `completionStatus` to `validateStoredFinalPacket`,
  which enforces these invariants:
  - **`completed`:** every packet is `started`, and a missing or unfinished receipt is a mid-write
    fault.
  - **`aborted` or `failed`:** handled per receipt:
    - A missing receipt yields `not-started`, with duration and cost unavailable, `fallback:
"none"` and `escalated: false`. A conflicting caller outcome (escalation, fallback or cost)
      fails `INVALID_PAYLOAD`, a caller error.
    - A receipt still `started` is closed by `finalize` as `started` with duration unavailable,
      under the packet lock, and the receipt is removed as on the normal path.
    - A finished receipt is `started` as today.
  - **`abandoned`, from `reconcile-record`:** every packet is always `unknown`.
- **Adopter invariant**, carried into the `build` plan: `start-packet` runs immediately before
  every implementation spawn. "Missing receipt" is evidence of "not started" only under that
  invariant.

### Metric inclusion per `cohortMetrics` field

- **`not-started` packets are excluded from every field:**
  - `packetCount`, `eligiblePacketCount` (which feeds `eligibleBaselinePackets`);
  - `attemptedFastCount`, `fastWithoutEscalation`, `fallbackOccurrences`, `fallbackOutcomes`;
  - `durationContributorCount`, `durationOutcomes`, `durationMedianMs`;
  - `costGroups`, `costUnavailableCount`.
- **`unknown` packets:**
  - They count in `packetCount`.
  - They count in `eligiblePacketCount` when `wouldBeFastEligible`.
  - Pilot-Fast `unknown` packets count in `attemptedFastCount`, but are **removed explicitly from
    the `fastWithoutEscalation` numerator**. They are stored with `escalated: false` and would
    otherwise count as successes.
  - They count in `costUnavailableCount`, which keeps the cost gate fail-closed.
  - They are excluded from the duration fields, whose values they lack.
- **A new closed count, `attemptOutcomes`** (keys `started`, `not-started`, `unknown`), keeps
  excluded packets visible in every cohort.
- The existing rule that any unavailable cost value makes `compatibleCostMedianRatio` unavailable
  is unchanged.
- The ADR records the `not-started` exclusion and the `unknown` fail-closed rule as decisions.

### Versions

- `PILOT_MEASUREMENT_PROTOCOL_VERSION` becomes `1.1.0`.
- `aggregation.algorithmVersion` and `RECORD_SCHEMA` are incremented. `RECORD_SCHEMA` is shared
  by reservations and records.
- The documented one-line mirror is refreshed from the build output.
- Two preregistrations therefore never share one version.

### Out of scope

- Parallel workflow runs stay serialized.
- Resume after an incomplete record still needs `reconcile-record`.
- The cost-ratio unavailability rule is unchanged.
- `CAPACITY_EXHAUSTED` handling of oversized payloads is unchanged.
- Reconciling the protocol's adoption gates with the review plan is deferred (see Assumptions).
- Every workflow, setup or router change is excluded.
- `CHANGELOG` is not edited; release-please owns it.

## Affected files

| File                                                   | Planned change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/pilot-measurement-core.mjs`               | `activate` key set, lock-internal order, `busy`/`window`/`sample` results. Shared busy predicate. `record-incident` with category map, validation, lifecycle lock and dispatch entry. `suspend` rejects `critical-*`. Derived marker allowlist and capacity exemption. Exact-reason fallback check. Roll-forward recovery and `transitionPending` in `inventory`. `finalize` auto-suspension wrapper with the exhaustive classification and tagged receipt `NOT_FOUND`. `control-state-unpersistable` results. `start-gate-observation` order with `admission-closed`/`busy`, and `finalize-gate-observation` `LOCKED` handling. `attempt` field with invariants in `validateStoredFinalPacket`/`validateStoredWorkflow`. Receipt handling in `finalizeWorkflow`. `reconcile-record` writes `unknown`. Per-field metric inclusion and `attemptOutcomes`. |
| `src/scripts/pilot-measurement-protocol.mjs`           | Version `1.1.0`, incremented `aggregation.algorithmVersion` and `RECORD_SCHEMA`, `attempt` enum, metric-registry text for the inclusion rules and `attemptOutcomes`. The digest changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/scripts/pilot-measurement.mjs`                    | Unchanged. It dispatches through the exported operation list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `test/pilot-measurement.test.mjs`                      | Cases for every result and invariant named in the acceptance criteria. Add `attempt` and the incremented schema to the six stored-packet fixtures around lines 1016, 1706–1735, 1826–1850, 2003–2030, 2223 and 2309.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `test/pilot-measurement-timing.test.mjs`               | Lines 294–306: the first failing `finalize` now suspends `finalization-failed`, and the generation stays suspended after the successful retry. Add the missing-receipt and started-receipt cases.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `test/pilot-measurement-cli.test.mjs`                  | The new operation, and the `activate` envelope without `confirmation`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `test/pilot-measurement-contract.test.mjs`             | Keep or adapt the source-text anchors touched by the change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `docs/developer-guide/model-tiering-pilot-protocol.md` | Mirror (lines 23–29); lifecycle (lines 58–64): `activate` results, `record-incident`, roll-forward, `transitionPending`; failure sections (lines 107–111, 155–163): classification, `control-state-unpersistable`, `admission-closed`/`busy`; `attempt`, per-field inclusion and `attemptOutcomes`; the readiness-count difference; the manual remedy for a pre-existing local generation.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `docs/developer-guide/build-system.md`                 | Lines 654–655: `activate` needs no confirmation. Add `record-incident` wherever operations are enumerated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `docs/user-guide/model-tiering-pilot.md`               | Lines 42–62: activation is automatic after the baseline conditions pass, incidents suspend Fast, and `busy`/`admission-closed` observations are not recorded.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `docs/adr/risk-aware-model-tiering-pilot-policy.md`    | Lines 29–31, 63–64, 94–95: automatic activation replaces "explicit activation". Record the incident operation, the `LOCKED` rule, roll-forward recovery and the conservative `attempt` rules as decisions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/shared/execution-profiles.md`                     | Prose only: incidents are recorded through the helper's incident operation, never by naming an outcome. Every marked table stays unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Checked and unchanged:

- `src/shared/pilot-measurement.md` and every `src/tools/*.md`;
- `AGENTS.md`, `docs/user-guide/configuration.md`, `docs/developer-guide/configuration.md`;
- `build.mjs` and `build-lib.mjs` with their tests (the mirror test compares against the live
  constant);
- `scripts/distribution-smoke.mjs`, which runs only `protocol`;
- `CHANGELOG.md` and `dist/**`.

## Implementation details

### Approach

1. Re-verify these anchors against the checkout, and stop if any changed in meaning rather than
   line number:
   - the `activate` readiness `fail`;
   - the `transitionMarker` allowlist and `capacityControlWrite` exemption;
   - `persistPilotControl` and its fallback;
   - `resume`'s marker check;
   - `guardedObservationMutation`;
   - the `executeOperation` capacity handler;
   - `validateStoredFinalPacket` and `validateStoredWorkflow`;
   - the `finalizeWorkflow` receipt loop;
   - `reconcile-record`;
   - `cohortMetrics`.
2. Markers: derive the allowlist and exemption, fix the fallback check, add roll-forward recovery
   and `transitionPending`.
3. Add the shared busy predicate. Reorder `activate` and `start-gate-observation` inside the lock,
   and add their new results.
4. Add `record-incident` and restrict `suspend`.
5. Add the exhaustive classification, the `finalize` wrapper outside the lock, the receipt
   `NOT_FOUND` tag, the `control-state-unpersistable` results, and the `finalize-gate-observation`
   `LOCKED` handling.
6. Add `attempt`, its invariants, the receipt handling, `reconcile-record`, the metric inclusion
   and `attemptOutcomes`. Increment the versions.
7. Update tests and fixtures, then the docs and the ADR. Refresh the mirror from the build output.
8. Run the validation plan.

### Edge cases

- **`activate` on an `active` generation** stays `INVALID_STATE`. The adopter calls it only when
  `inventory` reports `baseline`, and re-reads `inventory` after any failure.
- **`record-incident` or `finalize` meeting `LOCKED`** returns a retryable error without a
  suspension. The `build` plan defines the bounded retry policy.
- **`finalize` retried after an auto-suspension** still drains the record through the existing
  retry path. The generation stays suspended, and `resume` stays blocked until evidence is healthy.
- **A crash between marker and state write** leaves a marker that the next control operation rolls
  forward. `inventory` shows `transitionPending` meanwhile.
- **A crashed run leaves an open reservation.** `activate` and gate observation report `busy`, and
  the next adopter's `start` fails and routes unmeasured Quality. `reconcile-record` resolves it.
- **A local development generation created before this change** fails the stored-digest check with
  `UNSAFE_STORAGE`. The protocol guide documents the manual remedy: remove that local generation
  directory. No migration is provided, because no released generation exists.
- **Lock windows get longer** because the per-run `activate` preflight performs a full evidence
  inventory under the lifecycle lock. This is accepted, because contention no longer suspends.

## Acceptance criteria

- [ ] **`activate`:** called without `confirmation`, it returns `activated` once the 7-day window
      and the 20-packet sample are met. Otherwise it returns `not-ready` with `unmet` listing
      exactly the unmet members of `busy`, `window`, `sample`; `busy` is reported under an open
      reservation, timing or observation. A genuine evidence fault still fails
      `INCOMPLETE_EVIDENCE`. Passing `confirmation` is newly rejected with `INVALID_PAYLOAD`.
- [ ] **`record-incident`:** maps each of the four categories to its `critical-*` outcome and
      persists the suspension with `controlStatePersisted: true`, preserving `resumeTo` on
      re-suspension. Under a held lock it returns `LOCKED` with `controlStatePersisted: false`. A
      write failure yields `control-state-unpersistable` with the value-free alert. `review` is
      rejected. `suspend` rejects every `critical-*` outcome.
- [ ] **Markers:** a leftover marker for `finalization-failed`, for each `critical-*` outcome and for
      `suspend` leaves `inventory` readable, with `transitionPending: true`. The next control
      operation rolls a suspension-reason marker forward. The fallback reports persisted only for
      an exact-reason marker. The allowlist and exemption are derived from the protocol mappings.
- [ ] **`finalize` failures:** a mid-write fault persists `finalization-failed` and returns the
      control metadata. Every "never suspends" code returns `pilotControlOutcome: "none"` without a
      suspension. `CAPACITY_EXHAUSTED` suspends exactly once. A test covers each classified code.
- [ ] **Receipts and `attempt`:** `finalize` of an `aborted` or `failed` run records a missing
      receipt as `not-started`, rejecting a conflicting caller outcome, and a `started` receipt as
      `started` with duration unavailable. A `completed` run still requires finished receipts.
      `reconcile-record` records `unknown`. The stored-packet validator enforces the invariants
      per `completionStatus`.
- [ ] **Metrics:** metric tests show the per-field inclusion rules for every `cohortMetrics` field
      named under "Metric inclusion", the explicit numerator removal of `unknown` pilot-Fast
      packets, and a populated `attemptOutcomes`.
- [ ] **Gate observation:** `start-gate-observation` returns `not-recorded` with reason
      `admission-closed` on an admission race, and with reason `busy` when busy or under `LOCKED`.
      In both cases it persists nothing. `finalize-gate-observation` under `LOCKED` does not
      suspend. Invalid members and orphan temporaries still produce `evidence-gap`.
- [ ] **Versions:** the protocol version is `1.1.0`, `aggregation.algorithmVersion` and
      `RECORD_SCHEMA` are incremented, the digest changed, and the documented mirror matches the
      build output.
- [ ] **Docs and evals:** every document passage named in "Affected files" describes the new
      behaviour. `src/shared/pilot-measurement.md` and every `src/tools/*.md` are unchanged, and
      `pnpm eval merge-gate verify` reports the recorded evidence as current.
- [ ] **Validation:** the full validation plan passes.

## Validation plan

- `node --test test/pilot-measurement.test.mjs test/pilot-measurement-timing.test.mjs test/pilot-measurement-cli.test.mjs test/pilot-measurement-contract.test.mjs`
- `node --test test/execution-profile-contract.test.mjs test/build-lib.test.mjs`
- `pnpm agent:check`
- `pnpm test`
- `node build.mjs`
- `pnpm test:distribution`
- `pnpm eval merge-gate verify`
- `git diff --stat origin/develop -- src/shared/pilot-measurement.md src/tools` is empty

## Assumptions and open points

- No pilot generation exists in any released or shared environment. The helper stores state only
  locally below `.effective-flow/`, and this checkout's inventory reports `absent`.
- The protocol's preregistered `adoptionGates` remain authoritative for this work package, even
  though they differ from `docs/plan/2026-09-21-field-pilot-review-and-adoption-decision.md`:
  70 % versus 4/5, 30 % versus 4/5 cost, 25 % latency, 30 versus 20 packets, and the incident rule.
  In addition, `resume` deletes incident information that `evaluate` would need. Both must be
  reconciled in a revision of the review plan, with its own protocol change, **before any
  `begin-baseline` runs**. Until then a further digest change stays free of consequences. The user
  deferred this deliberately on 2026-09-29.
- Two pre-existing recovery gaps surfaced during implementation review. They are unreachable today,
  because no generation can exist before a workflow adopts the pilot, and belong to the same
  "before any `begin-baseline`" set:
  - an orphaned open gate observation, left by a `merge-gate` crash between start and finalize,
    has no reconcile path short of `begin-review` plus `discard-generation`;
  - a staged temporary whose JSON was only partially written before a crash fails
    `reconcile-temporary` with `UNSAFE_STORAGE`.

  Both are documented in the protocol guide.

- `docs/plan/2026-09-21-build-field-pilot-integration.md` is revised after this plan. The revision
  consumes:
  - the `activate` results;
  - `record-incident`;
  - the `finalize` metadata;
  - `start-packet` and `finish-packet` with the start-before-spawn invariant;
  - the bounded `LOCKED` retry policy;
  - the `attempt` rule.

  That revision is its own planning step.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         3 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        3 |         5 |    0 |
| Testability     |        0 |         1 |    3 |
| Scope           |        0 |         1 |    3 |
| Maintainability |        0 |         1 |    5 |

Counts cover both review passes as raised. Every finding is incorporated or deliberately deferred.
No critical finding remains open.

### Findings

**First pass (2026-09-29):**

- **Critical, error cases:** a `critical-*` or `finalization-failed` marker made storage unreadable.
  → The marker lists are derived from the protocol mappings.
- **Critical, error cases:** routine `LOCKED` contention would suspend the pilot.
  → Contention, caller and location/version errors never auto-suspend.
- **Important, architecture:** the not-started exclusion covered too few metrics.
  → Inclusion is defined per `cohortMetrics` field.
- **Important, error cases:** the `busy` predicate was imprecise.
  → It is exact, includes open observations, and accepts the crashed-run ambiguity.
- **Important, error cases:** packets aborted mid-attempt were unhandled.
  → They count as `started`; the start-before-spawn invariant goes into the `build` plan; conflicting
  caller outcomes are rejected.
- **Important, maintainability:** the versions did not move with the digest.
  → They are incremented.
- **Important, scope:** the gates differ from the review plan.
  → Deferred by user decision; recorded under Assumptions.
- **Notes:** exact doc passages, the unchanged-files list, the CLI, fixtures and anchors are fixed.

**Deep interactive review (2026-09-29):**

- **Critical, architecture (direct):** the derived marker allowlist dropped `suspend`, which would
  break every existing suspension write. → `suspend` is added to both lists, and `resume` stays
  capacity-checked.
- **Critical, error cases (direct + decision):** the marker fallback reported persisted for any
  existing marker, so an incident could be lost behind a concurrent `resume`. → Exact-reason check.
  **Decision:** `record-incident` returns a retryable `LOCKED` and uses no unlocked fallback.
- **Important, error cases (decision):** a leftover marker froze admission invisibly. **Decision:**
  roll-forward recovery plus `transitionPending` in `inventory`.
- **Important, error cases (direct):** the `finalize` wrapper's placement and error classification
  were underspecified. → The wrapper sits outside the lock, `CAPACITY_EXHAUSTED` passes through, the
  receipt `NOT_FOUND` is tagged, and the classification is exhaustive.
- **Important, error cases (decision):** an admission race during gate observation suspended the
  pilot. **Decision:** `not-recorded`/`admission-closed`, with a fixed order inside the lock.
- **Important, architecture (decision):** `activate` stayed ambiguous under a concurrent run.
  **Decision:** `not-ready` with `unmet: ["busy"]`.
- **Important, data protection (decision):** the outcome for unpersistable control state
  contradicted the control table. **Decision:** `control-state-unpersistable` with the value-free
  alert.
- **Important, architecture (decision):** the cost-population exclusion removed a fail-closed
  effect. **Decision:** `not-started` is excluded; `unknown` stays as unavailable cost.
- **Important, testability (direct):** metric names are now the concrete `cohortMetrics` fields;
  `unknown` is removed explicitly from the numerator; `attemptOutcomes` is added.
- **Notes (direct):**
  - The `attempt` invariants are enforced with `completionStatus`.
  - `aggregation.algorithmVersion` is incremented, `RECORD_SCHEMA` is shared, and the fixture list
    is completed.
  - `record-incident` takes the lifecycle lock and validates `affectedRecordIds`.
  - The capacity limitation for oversized caller payloads is stated.
  - The `confirmation` rejection is marked as new, and the ADR outlier is named.
  - The timing test's new meaning is spelled out.

## Implementation notes

Implemented on 2026-09-29 through `effective-flow build` on branch
`effective-flow/build/pilot-measurement-adoption-readiness`. The version values are protocol
`1.1.0`, `aggregation.algorithmVersion` 2, `RECORD_SCHEMA` 2, and digest
`sha256:18ff022103e4ff0f5d5aebb492f58e738fdabbbfe367f6594b8dad2c80f15e3d`.

Deviations from the plan text, all within its intent:

- `activate` under a concurrent run returns `unmet: ["busy"]` alone. The busy check returns early,
  before the readiness check.
- For an aborted or failed run, `finalize` closes a still-`started` receipt under the lifecycle lock
  rather than a packet lock. The two locks exclude each other.
- Roll-forward merges only a marker's reason, because markers carry no record ids.
- `not-started` and `unknown` packets additionally require unavailable duration and cost,
  `fallback: "none"` and `escalated: false`.
- `attemptOutcomes` is part of the private aggregate only, not of the publication candidate.
- An error code outside the neutral and passthrough sets is classified as a mid-write fault.

Additions made during testing, review and final validation:

- Temporary file names built from an operation name use a closed `WRITE_OPERATIONS` allowlist
  instead of the credential screen, which had rejected `critical-authorization-incident`.
- `beginTransition` publishes its marker exclusively, and adopts an identical marker (same
  transition, ignoring the owner fields) that another writer published meanwhile.
- The unlocked fallback publishes its marker atomically with an optional `ownerPid`, and
  `reconcile-temporary` can prove such a staged marker stale.
- The capacity walk counts an entry that vanishes mid-walk as 0 bytes and maps every file-system
  error. This fixes a check-then-use race between parallel `start-packet` calls that the change had
  made likely.

## Test results

- Pilot suites (`test/pilot-measurement.test.mjs`, `-timing`, `-cli`, `-contract`, and the new
  `test/pilot-measurement-adoption.test.mjs`): 134/134 pass.
- `node --test test/execution-profile-contract.test.mjs test/build-lib.test.mjs`: 349/349 pass.
- `pnpm test`, run twice: 1700 pass, 0 fail, 1 intentional skip (the `merge-gate` freshness test).
- `pnpm agent:check`, `node build.mjs` and `pnpm test:distribution` pass. No context budget is
  exceeded.
- Stress runs of the parallel-packet timing test: 0 failures in 44 runs, down from about 6 in 37
  before the capacity-walk fix.
- `git diff --stat origin/develop -- src/shared/pilot-measurement.md src/tools` is empty.
- `pnpm eval merge-gate verify` reports all six scenarios stale. This predates the branch: it comes
  from #465 and #468 on `develop`, and none of the 15 listed files is in this branch's diff. The
  change adds no staleness. A re-recorded round is owed before the next release anyway.

## Review findings

**Date:** 2026-09-29
**Reviewer:** `effective-flow-nodejs-reviewer`, plus validation by `effective-flow-code-validator`

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    13 |
| Open / Not implemented |     0 |

- **Implementation review:** 0 Critical, 2 Important, 9 Notes, and 4 further Notes from the
  re-checks. Everything in scope is fixed.
- **Other defects fixed:** one product defect found in the test phase (`authorization` incidents
  never persisted) and one race found in final validation.
- **Closed below the follow-up threshold:** three observations, none reachable today:
  - the missing observation reconcile path;
  - partial staged temporaries;
  - splitting the growing core module.

  The first two are listed under Assumptions as prerequisites before the first `begin-baseline`.

## Open points

- No open points.
