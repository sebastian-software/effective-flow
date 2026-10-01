# `build` field-pilot integration

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `91afe89` on 2026-09-21.
**Revised against:** `35b4523` on 2026-09-29, after an implementation attempt stopped at step 1 on
interface drift against work packages 1–3; revised again against `5f43f2e` on 2026-10-01 for helper
protocol 1.1.0 (#512, `docs/plan/archive/2026-09-29-pilot-measurement-adoption-readiness.md`).
**Working state:** Preserve the untracked `docs/concept/` tree and every other untracked plan under
`docs/plan/`.
**Depends on:**

- `docs/plan/archive/2026-09-21-execution-profile-and-activation-contract.md`
- `docs/plan/archive/2026-09-21-native-profile-rendering.md`
- `docs/plan/archive/2026-09-21-pilot-measurement-and-trace-lifecycle.md`

## Requirement

Integrate the project-level field-pilot opt-in into `build`. Only the first attempted implementation
spawn of an eligible native packet may use Fast. Existing project routing, documentation, tests,
validation, Quality review, bounded correction, worktree ownership, and delivery must remain intact.
Every retry or corrective write is Quality-only, and a Fast fallback continues from retained dirty
state in the same verified checkout.

## Architecture decisions

### Configuration and generation lifecycle

- Expose `executionProfiles.fast.enabled` through setup only now, when an adopting workflow exists.
  Missing/false/invalid/unreadable/ambiguous remains Quality under the shipped reader
  (`src/shared/execution-profiles.md`, `src/shared/config-migration.md`); Profile and Express setup
  modes never enable it automatically. Ordinary workflow runs in those states perform no pilot
  runtime mutation; work package 3's explicit `begin-review` operation may still freeze a stored
  generation for the decision workflow. A valid `true` opt-in permits but does not start collection;
  disabling it preserves any stored generation and requires no migration or implicit deletion.
  Exposing the key also makes the existing merge-gate period observation
  (`src/shared/pilot-measurement.md`) reachable for real projects; that fragment is unchanged.
- **Setup placement (decided 2026-09-29):** the Guided opt-in and every generation action live in a
  new lazy fragment `src/shared/setup-execution-profiles.md`, loaded only when Guided Step 5 opens
  the new advanced block 10 (`executionProfiles`). `src/tools/setup.md` gains only that block's
  entry, its load pointer, and the `executionProfiles.fast.enabled` row in the Config schema; the
  `setup` `CONTEXT_BUDGET_LINES` entry (1923, currently without headroom) is raised only by the
  measured cost of those lines. No new setup invocation is added: the accepted invocation set
  (empty, `profile`, `express`, `guided`, `hidden`) stays unchanged. In hidden mode the key is
  written to the local `<RUNTIME_STATE_ROOT>/.effective-flow/project-setup.md` like every other key.
- **Activation (decided 2026-10-01, superseding the 2026-09-29 activation-owner decision):**
  activation is automatic in `build`. Helper protocol 1.1.0 removed `confirmation` from `activate`
  (passing it is `INVALID_PAYLOAD`), because the confirmed `begin-baseline` is the only consent, and
  reports readiness as a result instead of an error. Guided block 10 therefore offers only the two
  confirmed actions, and `build` never calls either of them:
  - `begin-baseline` reads `protocolVersion` and `protocolDigest` through the helper's `protocol`
    operation, displays the digest plus the local-data disclosure required by
    `src/shared/execution-profiles.md`, states that activation later follows automatically, and
    only after explicit confirmation sends `configState: "enabled"`, `fastEnabled: true`, the
    protocol pair, and `confirmation: true`.
  - `resume` is offered only while guarded `inventory` proves `generationState=suspended`,
    `configState` is `enabled`, and evidence is healthy. It is bound to the current inventory and
    suspension digests, shows the generation state and those digests (inventory exposes no cause
    text, so no cause summary is shown), accepts no target state, and restores only the
    helper-stored `resumeTo`. Terminal `review` is recognized and rejects resume even when the
    configuration was later disabled or became invalid. No generation action rewrites the Boolean.
  - A `baseline` generation offers no setup action; setup reports that it is collecting its
    baseline and that `build` activates it automatically.
- In `build` preflight, an enabled configuration reads the generation through guarded, read-only
  `inventory`. `none`, `suspended`, and `review` select
  `eligibility=not-evaluated + selectedProfile=quality` and reserve nothing. Inventory failure or
  ambiguity runs unmeasured Quality and calls no mutating operation.
- **Automatic activation in preflight:** in an enabled `baseline` generation every measured run
  reads `protocol` (version from `result.version`, digest from the envelope, which must equal
  `result.digest`) and calls `activate` once, before classification and `start`, with exactly the
  common keys, `configState: "enabled"`, and the protocol pair. It consumes the helper's results:
  - `activated`: the generation is `active`, persisted and effective alike, and the run's
    reservation is an `active` one;
  - `not-ready` with `unmet` a nonempty subset of `busy`, `window`, `sample`: it stays `baseline`
    and the run records a baseline reservation (with `busy`, the later `start` fails and the run is
    unmeasured);
  - `LOCKED` after the bounded retry: it stays `baseline`, because a held lock fails before any
    check;
  - `INVALID_STATE`, `WRITE_FAILED`, a lost or malformed response, or an unknown result is
    ambiguous: one guarded `inventory` re-read with the `generationId` decides the state, without a
    second `activate`; an unprovable re-read makes the run unmeasured Quality;
  - every other failure, including a protocol mismatch and the genuine evidence faults
    `INCOMPLETE_EVIDENCE` and `UNSAFE_STORAGE`, makes the run unmeasured Quality.

  A baseline reservation is never relabelled: the state decided here is the one every packet is
  classified under. `baseline` then executes eligible packets with Quality and records
  would-have-been-Fast; `active` permits one Fast attempt per eligible packet.

### Packets and the decision envelope

- Use the canonical project-routing bucket as packet identity. A narrower packet is allowed only
  when the approved plan supplies independent ownership, requirements, and validation. Never select
  a profile independently per file.
- After Phase 2 step 0 has established the execution-location receipt and captured the run-level
  diff baseline (which step 0 does last), retain a packet-to-path ownership map, capability result,
  coupling group, and per packet the shipped four-field decision envelope of
  `src/shared/execution-profiles.md` together with the decision-map `fallback`, the
  `fastAttemptConsumed` flag, and the helper-returned `pilotControlOutcome` where one exists. A
  reason exists only inside `excluded(reason)`; use only the shipped closed vocabularies
  (`src/scripts/pilot-measurement-protocol.mjs`): the eleven gate reasons, the nine fallbacks, and
  the ten pilot-control outcomes.
- Map the envelope to the helper's wire shape explicitly. Each `start` packet is
  `{selectedProfile, wouldBeFastEligible, gate: {eligibility: "eligible"|"excluded", firstReason}}`,
  with `firstReason` null exactly for `eligible`; the helper snapshots `configState` and
  `generationState` once per workflow record, not per packet. `not-evaluated` is never sent: runs
  that evaluate nothing reserve nothing.
- Classify every initial packet completely before `start`: capability check, packet snapshot gate,
  coupling, and the ordered exclusion gate. The helper fixes the packet set and each packet's
  selection at `start`, and in an active generation an eligible packet must be sent as `fast`.
  Nothing learned after `start` may change a reserved packet's selection; it can only produce a
  fallback.
- Set `fastAttemptConsumed` immediately before calling the worker. A rejected or uncertain spawn
  therefore cannot authorize another Fast attempt. One keyword-less resume is the same delegation;
  Retry 1–3 are new Quality spawns.
- Disjoint packets may mix Fast and Quality only with explicit nonoverlapping ownership and resolved
  dependencies. Coupled packets use Quality as one group. Diff attribution uses allowed-path maps,
  not wall-clock timing.
- Immediately before every implementation spawn, capture a freshly rooted **packet snapshot**
  (packet-scoped status and diff). It is distinct from the run-level diff baseline that Phase 2 step
  0 captures and Phases 3, 5, 6, and 7 render, and it is never called a "diff baseline"; it serves
  only packet attribution and retained-state transfer. Pre-existing dirtiness inside an allowed Fast
  path is `unclear-ownership` unless it is independently attributable, so the packet selects Quality
  or stops.

### Profile selection and fallback

- Fast tokens are rendered only inline. The five Phase 2 step 1 implementer selector lines carry
  `{{AGENT_PROFILE:<implementer>:fast}}` for the five Fast-capable implementers, which `build.mjs`
  accepts only in `src/tools/build.md` between `### Phase 2: Implementation` and
  `### Phase 3: Documentation`. Only non-token policy is deferred: Phase 2 gains lazy load pointers
  to `src/shared/execution-profiles.md` and to the new workflow-record fragment below; the canonical
  policy stays out of the always-loaded body.
- Distinguish pre-spawn profile unavailability from rejection of an actual Fast request. A missing
  native mapping, a missing spawn mechanism, or presence of `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`
  selects initial Quality with `eligibility=excluded(profile-unavailable)` and `fallback=none`;
  inspect the force variable by presence only and never read, relay, or persist its value. Only a
  host rejection after an attempted Fast spawn records `fallback=spawn-rejected`, consumes the
  attempt, and continues once with Quality.
- Portable execution is Quality-only and unmeasured: the helper admits only the harness families
  `claude|codex`, so a portable run calls no mutating pilot operation and records nothing, matching
  the merge-gate observation precedent.
- No sub-agent mechanism uses the existing disclosed inline fallback; the run records
  `excluded(profile-unavailable)` where it is measured and never claims that Fast was enforced.
- Every one of the eight post-attempt fallbacks (`spawn-rejected`, `worker-abort`, `missing-context`,
  `scope-growth`, `new-decision`, `requirements-mismatch`, `keywordless-exhausted`,
  `scope-incident`) consumes Fast and causes exactly one Fast→Quality transition in the same
  checkout. Thereafter every new spawn remains Quality under the existing completion/retry bounds.
  For `missing-context`, `scope-growth`, and `new-decision` the Quality continuation first inspects
  only; any write outside the original authorized packet waits for orchestrator/user approval.
  Authorized scope growth stays under the original packet identity and inherits its Fast-consumed
  state. Genuinely independent new work is never appended at finalization: stop the current workflow
  and ask whether to create a future-work issue, or a new plan when no issue tracker is available.
- Make all correction seams explicit: Phase 2 requirements repair, validator repair, review
  incorporation, final-validator repair, conflict resolution, and bounded completion corrections use
  the routed Quality implementer. Quality failure never falls back to Fast.

### Measurement and telemetry

- Operational handoff detail is not telemetry. Diffs and escalation detail live only in the
  transient retained-state handoff and are never persisted. With explicit per-run detailed-trace
  consent, `finalize` may carry the helper's trace schema and nothing more: `roles`, `requirements`
  (ID, status, optional path), `checks` (ID, outcome, duration), and `findings`, with
  `detailOptIn` true exactly when a trace is supplied.
- Workflow-record mechanics live in a new lazy fragment `src/shared/pilot-measurement-workflow.md`
  (the existing `src/shared/pilot-measurement.md` covers only the merge-gate observation). It owns
  the order below; `build.md` carries only the pointer and its per-packet state.
- Order per measured run (`configState=enabled`, proven `baseline|active`, native harness):
  1. In a `baseline` generation, `protocol` and the automatic `activate` described above.
  2. `start` once, after complete classification and before the first implementation spawn,
     reserving every initial packet. It returns `runId` and the workflow and packet capabilities,
     which exist only in transient orchestrator state and are never written to the wisdom file,
     chat, a handoff, a commit, or a pull request.
  3. `start-packet` immediately before each packet's first implementation spawn, and never a
     spawn before it succeeded (the start-before-spawn invariant), and `finish-packet` when that
     packet's initial phase ends, including its single retained-state Quality continuation. The
     helper derives each stored packet's `attempt` from its receipt: a packet that never spawned
     gets no timing operation and is recorded `not-started`, which only an `aborted` or `failed`
     record may hold and which every packet metric excludes; a packet whose initial phase is still
     open when the run aborts is not finished and is recorded `started` with an unavailable
     duration; a `completed` record requires a finished receipt for every packet.
  4. `finalize` exactly once with `completionStatus=completed|aborted|failed` (a missing outcome
     maps to `failed`; `abandoned` is reserved to reconciliation), `escalated` equal to
     `fallback != "none"`, and `costProxy` null (recorded as unavailable) unless the harness exposes a
     cost measure; no cost source is invented. A lost response may be re-sent once with the
     identical payload, because the helper deduplicates it.
- **Bounded `LOCKED` retry:** `LOCKED` is the one retryable helper error, because the helper changed
  nothing. Every locked operation `build` calls (`activate`, `start`, the packet operations,
  `finalize`, `record-incident`, `reconcile-record`) re-sends the identical payload at most twice
  more, after about two and then about five seconds; an exhausted retry counts as that operation's
  failure. No other error is re-sent, except a lost response where the step allows it.
- `start` failure creates no record and routes unmeasured Quality. Any in-flight reservation,
  including an unfinished merge-gate observation or timing receipt, makes `start` fail with
  `INCOMPLETE_EVIDENCE`; admission is therefore serialized, and such a run proceeds as unmeasured
  Quality without Fast and reports why.
- In an enabled baseline or active generation, the implementation duration spans the packet's
  initial phase between `start-packet` and `finish-packet`. Active or baseline Quality measures its
  Quality attempt; an attempted Fast fallback includes the failed Fast attempt plus its single
  retained-state Quality continuation. Later validation, review, retry, and correction spawns are
  excluded from duration and cost and counted only through correction-round fields. Missing or
  incompatible data records unavailable, never zero.
- A new workflow observing `generationState=review` selects
  `eligibility=not-evaluated + selectedProfile=quality`, creates no reservation, and cannot reopen
  admission. A record reserved before `begin-review` may finalize only with its captured start-time
  cohort and state snapshots. A `suspended → review` transition preserves causes and incomplete
  evidence while permanently removing the resume path.
- Invoke the helper with the operation as its sole positional argument and one exact-key JSON object
  on stdin. Parse only its stable stdout envelope and never scrape stderr or interpolate operational
  prose. Before the initial spawn, nonzero exit, malformed envelope, protocol-digest drift, or
  unknown keys prevents Fast and, only when no reservation exists, routes unmeasured Quality; the
  automatic `activate` results above are the named exceptions.
  Post-spawn mutation/finalization failure preserves the product diff, starts no implementation
  worker, and blocks later Fast. Guided control-operation failure reports the value-free failure and
  leaves proven state unchanged.

### Incidents, suspension, and reconciliation

- **Incident recording (decided 2026-10-01, superseding the 2026-09-29 incident decision):** a
  critical safety, data-integrity, authorization, or scope-boundary incident preserves state and
  calls the helper's `record-incident` with exactly the common keys, its `category` (`safety`,
  `data-integrity`, `authorization`, or `scope`), and `affectedRecordIds` holding the current
  `runId` when a record exists. The helper maps the category to its `critical-*` outcome; `build`
  keeps no category-to-outcome map, never names a `critical-*` outcome, and never calls `suspend`,
  which now rejects incident outcomes. The target is an inventory-proven `baseline`, `active`, or
  `suspended` generation, also in an unmeasured run after a failed activation or `start`. It never
  reverts potentially user- or sibling-owned work automatically.
- `record-incident` takes the lifecycle lock itself and has no unlocked fallback; `LOCKED` follows
  the bounded retry. If it is still locked or fails otherwise (for example `INVALID_STATE` under
  `review`), report only a stable value-free alert and keep later preflight fail-closed on storage
  or inventory uncertainty; never claim a persisted suspension.
- Keep implementation fallback and pilot control independent. Fallback describes the initial
  implementation attempt; `pilotControlOutcome` controls the pilot lifecycle. A scope incident may
  set both the `scope-incident` fallback and the `scope` category. `capacity-exhausted`,
  `evidence-gap`, `incomplete-record`, `finalization-failed`, and `control-state-unpersistable`
  (each read only from the helper's explicit `pilotControlOutcome`, `controlStatePersisted`, and
  `alert`) set only the control axis and never start a worker or change a successful product diff.
- **Finalization failure (decided 2026-10-01, superseding the 2026-09-29 reconciliation
  decision):** a failed `finalize`, or a record left unfinalizable, keeps the product changes, never
  becomes an implementation fallback, and suspends nothing on the workflow side. The helper persists
  `finalization-failed` itself on a genuine mid-write fault and reports it in the envelope; caller
  errors, lock contention, and location or version faults leave the pilot state unchanged, and
  `build` reports exactly what the envelope confirms. Still in the same run, `build` asks the user
  once whether to reconcile the incomplete record; on confirmation it calls `reconcile-record` with
  the transient `workflowCapability`, a freshly read `expectedInventoryDigest`, and
  `confirmation: true`, and the helper writes the record `abandoned` with every packet's `attempt`
  `unknown`, which never counts as a success. This is the only point at which reconciliation is
  possible, because no later run holds that capability. A declined, unanswered, non-interactive,
  or failed reconciliation leaves the incomplete record in place; it keeps every later measured run
  unmeasured until `discard-generation` or `purge`, and the completion report says so.
- Every later run observes the suspension until an explicit confirmed Guided `resume` while the
  generation is still `suspended` and its evidence is healthy; a reviewed generation cannot resume.

## Retained-state Quality handoff

The continuation contains the packet/run and routing bucket, approved source and completion
condition, exact write paths and exclusions, unchanged execution receipt, initial selected profile
and tagged eligibility, packet snapshot summary, sibling/pre-existing dirty paths, completed and
failed requirements, checks/outcomes/skips, the exact fallback value, and `Fast consumed; no second
Fast attempt`. It carries no pilot capability. It ends with the standard `DONE`/`ABORT` protocol.

The worktree remains `active` during recoverable profile escalation. An unowned edit, terminal scope
incident, or unrecoverable implementation failure transitions an owned `active` lifecycle to
`failed` only when receipt and runtime guards still pass. If location validation itself failed,
preserve the existing lifecycle state and report that no safe transition was possible.

## Affected files

| File                                                                                                                                                                            | Planned change                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/build.md`                                                                                                                                                            | Inline `{{AGENT_PROFILE:<implementer>:fast}}` on the five Phase 2 step 1 selector lines; lazy pointers to the policy and workflow-record fragments; per-packet state after step 0; Quality-only correction wording in Phases 2, 5–7.                                                                                    |
| `src/shared/pilot-measurement-workflow.md` (new)                                                                                                                                | Workflow-record playbook: preflight inventory, automatic `protocol`/`activate` with its result handling, wire mapping, `start`, start-before-spawn `start-packet`/`finish-packet` and the `attempt` rule, `finalize`, `record-incident`, the bounded `LOCKED` retry, same-run `reconcile-record`, value-free reporting. |
| `src/tools/setup.md`                                                                                                                                                            | Guided Step 5 block 10 entry (opt-in, baseline start, resume; activation automatic in `build`), its lazy pointer, and the Config schema row only.                                                                                                                                                                       |
| `src/shared/setup-execution-profiles.md` (new)                                                                                                                                  | Guided opt-in, preserve-in-other-modes rule, and the confirmed `begin-baseline` and `resume` actions with digest display and disclosure; a `baseline` generation offers no action because `build` activates it.                                                                                                         |
| `src/shared/execution-profiles.md`, `src/shared/config-migration.md`                                                                                                            | Replace "reserved / not adopted / not yet an interactive setup choice" wording with `build` adoption; no policy change.                                                                                                                                                                                                 |
| `build.mjs`                                                                                                                                                                     | Update the adoption comment near the profile-token scope check; adjust only the measured `build` and `setup` `CONTEXT_BUDGET_LINES` entries, each with at most ten lines of headroom.                                                                                                                                   |
| `test/execution-profile-contract.test.mjs`                                                                                                                                      | Turn the no-adoption guard into an allowlist: `build.md` Phase 2 may carry the five tokens and the two lazy pointers; `refactor.md` and every other tool stay forbidden; update the isolated-build expectations.                                                                                                        |
| `test/execution-profile-rendering.test.mjs`                                                                                                                                     | Pin the rendered Claude `-fast` sidecar reference, the Codex per-spawn override, and the portable Quality-only text for the adopted `build` lines.                                                                                                                                                                      |
| `test/execution-profile-workflow-contract.test.mjs` (new)                                                                                                                       | Pin packet state, wire mapping, first-spawn consumption, correction boundaries, privacy, measurement order, automatic activation, incident recording, the `LOCKED` retry, packet `attempt` values, and same-run reconciliation; replay every replayable fixture against the merged helper.                              |
| `test/workflow-contracts.test.mjs`                                                                                                                                              | Pin setup block 10, enable/disable, preservation in Profile/Express/hidden, the unchanged invocation set, the two Guided generation actions and the absence of a setup activation, invalid values, and no model-name configuration; keep the diff-baseline pins green.                                                  |
| `test/pilot-measurement.test.mjs`                                                                                                                                               | None after the 2026-10-01 revision: #512 ships the `activate` coverage in `test/pilot-measurement-adoption.test.mjs`, so the earlier activation tests added here are removed again.                                                                                                                                     |
| `test/fixtures/execution-profiles/build/*.json`                                                                                                                                 | Representative disabled, eligible, excluded, mixed, fallback, retry, correction, incident, portable, activation (activated, not ready by busy, window, or sample, locked, evidence fault, ambiguous), `LOCKED`, finalization-failure, and packet-attempt cases.                                                         |
| `docs/user-guide/configuration.md`, `docs/user-guide/getting-started.md`, `docs/user-guide/model-tiering-pilot.md`                                                              | Replace the reserved/no-op wording with active `build` pilot semantics and the Guided actions.                                                                                                                                                                                                                          |
| `docs/user-guide/tools-setup.md`, `docs/user-guide/tools-implement.md`                                                                                                          | Explain opt-in, baseline start, automatic activation, suspended-only resume, rollback, and `build` eligibility, fallback, corrections, and unchanged gates.                                                                                                                                                             |
| `docs/developer-guide/configuration.md`, `docs/developer-guide/architecture.md`, `docs/developer-guide/build-system.md`, `docs/developer-guide/model-tiering-pilot-protocol.md` | Replace the "no workflow adopts Fast" statements; document the split configuration/generation reader, the workflow-record order with automatic activation, and fail-closed behavior; drop the protocol guide's never-spawned-packet bias note, which #512 resolved.                                                     |
| `docs/adr/native-execution-profile-representation.md`, `docs/adr/risk-aware-model-tiering-pilot-policy.md`                                                                      | Update the current-state statements that `build` has not adopted Fast; the decisions themselves stay unchanged.                                                                                                                                                                                                         |
| `AGENTS.md`                                                                                                                                                                     | Update the "Execution profiles (reserved policy)" section: `build` adopts Fast and activates automatically, `refactor` does not yet, setup exposes block 10 with two generation actions.                                                                                                                                |

`test/support/pilot-helper-contract.mjs` reads the 1.1.0 key sets from the helper source, including
`record-incident`, and the helper's incident categories.

The helper modules and their protocol stay unchanged in this plan; #512 owns them. If integration
exposes a missing generic interface, stop for replanning instead of extending the helper inline.
Do not duplicate the policy playbooks in `build.md` and do not edit `dist/**`.

## Implementation details

### Approach

1. Re-verify the interfaces this revision names against the implementation base: the four-field
   envelope and decision map in `src/shared/execution-profiles.md`, the closed vocabularies and
   operation list in `src/scripts/pilot-measurement-protocol.mjs` and `-core.mjs`, and the token
   scope in `build.mjs`. Stop on any drift from this revision.
2. Rewrite the no-adoption guard in `test/execution-profile-contract.test.mjs` into the scoped
   allowlist first, so the adoption lands against a guard that states the new boundary.
3. Add `src/shared/pilot-measurement-workflow.md` and the Phase 2 lazy pointers; place per-packet
   state after step 0 without touching step 0's final diff-baseline capture.
4. Put the five inline tokens on the Phase 2 step 1 selector lines and implement classification
   before `start`, the wire mapping, `fastAttemptConsumed`, packet snapshots, and routed spawns.
5. Implement the one Fast→Quality transition and retained-state continuation without resetting
   packet identity, scope, receipt, worktree lifecycle, or Fast-consumed state. Stop before writing
   when required decisions or scope exceed prior approval. Keep authorized scope growth within the
   original packet; for genuinely independent work, ask whether to create a future-work issue or,
   when no issue tracker is available, a new plan.
6. Replace ambiguous direct-fix/correction wording in Phases 2, 5, 6, and final completion loops
   (including Phase 5 step 3 "fix them directly") with the routed Quality implementer.
7. Implement the measurement order (automatic `protocol`/`activate` in a baseline generation,
   `start`, start-before-spawn `start-packet`/`finish-packet`, `finalize`), `record-incident`, the
   bounded `LOCKED` retry, the same-run confirmed `reconcile-record` after a finalization failure
   without a workflow-side suspension, and value-free reporting, all through the
   sole-positional-operation/exact-JSON contract.
8. Add `src/shared/setup-execution-profiles.md`, setup block 10, and the Config schema row; implement
   the Guided `begin-baseline` and `resume` actions and preservation in Profile, Express, and hidden
   mode.
9. Update every statement listed under Affected files that describes the key as reserved or `build`
   as not adopted.
10. Preserve documentation sync, tests, validation, Quality review, final validation, goal
    completion, plan archival, and delivery ordering.
11. Add fixture-driven contract cases that replay against the shipped helper. The manual
    fresh-session behavioural eval is out of scope (see "Scope change 2026-09-29" below); real field
    records stay under `.effective-flow/`.
12. Build, read the authoritative line report, and change only the measured `build` and `setup`
    budget entries.

### Required scenario matrix

At minimum cover the full configuration×generation matrix (missing/false/invalid/true crossed with
no generation/baseline/active/suspended/review), Guided `begin-baseline` confirmed/refused with the
digest and disclosure shown, no Guided activation offered for `baseline`, automatic preflight
`activate` with `activated` (an `active` reservation), `not-ready` by `busy`, `window`, and
`sample` (a baseline reservation, or an unmeasured run after `busy`), a `LOCKED` activation that
stays locked, a genuine evidence fault, and an ambiguous response settled by an `inventory`
re-read or left unprovable, review under enabled/disabled/invalid configuration, concurrent `start`/`begin-review`, an in-flight
reservation that serializes admission into unmeasured Quality, both stored `resumeTo` values, legal
suspended-state `resume`, rejected resume from every other generation state, eligible native,
portable (unmeasured) and missing-native/missing-spawn/force-override pre-spawn unavailability,
rejected attempted spawn, every ordered exclusion, disjoint mixed scope, coupled mixed scope,
retained dirty fallback, keyword-less resume then Quality retry, requirements repair, validator
repair, review repair, conflict-resolution repair, `start` failure, an aborted run with a packet
that never spawned (`not-started`) and one interrupted in its initial phase (`started`, duration
unavailable), `finalize` retry after a lost response and after one `LOCKED`, a `finalize` that
stays `LOCKED`, a rejected `finalize` (no suspension), a mid-write `finalize` fault the helper
suspends itself, confirmed (`unknown` attempts) and declined same-run reconciliation, each
critical safety/data-integrity/authorization/scope incident → `record-incident` by category →
next-run suspended → confirmed resume, a `record-incident` retried after `LOCKED`, one that stays
`LOCKED`, and one rejected under `review`,
capacity/incomplete/evidence-gap/finalization-failed/unpersistable-control-state paths, exact CLI operations/envelopes,
baseline Quality, active gate-selected Quality, active Fast, all eight post-attempt fallbacks,
correction measurement exclusion, pre-existing dirty allowed path, and safe/unsafe lifecycle failure
update. Include authorized scope growth under the original packet and independent new work that
stops before mutation and offers issue-or-plan capture.

### Edge cases and stop conditions

- New destructive work, migration, concurrency, unsafe code, public/trust contract, merge conflict,
  or unresolved decision selects Quality; work beyond the approved plan stops for replanning.
- A newly discovered independent packet is not added to the current record. Ask the user whether to
  capture it as an issue for future implementation, or as a new plan when no issue tracker exists;
  declining leaves no extra artifact.
- Sibling packet dirtiness is preserved and labeled. A whole-checkout diff is not valid attribution.
- Pre-existing unattributed dirtiness within the packet's own Fast paths is not treated as the Fast
  worker's output and cannot pass the ownership gate.
- Quality fallback abort, stale receipt, unsafe runtime root, or exhausted bounded correction is
  reported to the user; Fast is never attempted again.
- A non-interactive delegated run cannot pose the reconciliation question; it leaves the incomplete
  record and reports the `discard-generation`/`purge` route.
- A crashed run's open reservation reads as `busy` to `activate` and fails the next `start`; such
  runs stay unmeasured Quality until the record is reconciled or the generation is discarded.
- No meaningful implementation diff follows the existing no-empty-delivery rule.

## Acceptance criteria

- [ ] Pilot absent/false/malformed/unreadable/ambiguous runs remain Quality-only; portable runs remain
      Quality-only and call no mutating pilot operation.
- [ ] Opt-out/invalid states and valid `true` without a generation write no pilot data; only
      `configState=enabled + generationState=baseline|active` on a native harness records
      classified packets. Opt-out or invalid configuration preserves any stored generation, and an
      explicit `begin-review` may still freeze it.
- [ ] With enabled configuration, an active generation gives an eligible native packet exactly one
      attempted Fast initial spawn; a baseline generation executes the same packet with Quality and
      records `wouldBeFastEligible`.
- [ ] `build` never calls `begin-baseline` or `resume`; the two are Guided block-10 actions that
      send `confirmation: true` only after an explicit user confirmation in the same setup run.
      Setup offers no activation. In an enabled `baseline` generation every measured `build` run
      calls `activate` automatically before `start`, without `confirmation` and with the
      `protocol` pair; `activated` yields an `active` reservation, `not-ready` (`busy`, `window`,
      `sample`) and an exhausted `LOCKED` keep the baseline, genuine faults run unmeasured Quality,
      and ambiguity is settled by a guarded `inventory` re-read or runs unmeasured Quality. No
      baseline reservation can be relabelled.
- [ ] Every `start` packet has the shipped wire shape, `firstReason` is null exactly for `eligible`,
      and `not-evaluated` runs reserve nothing; the classification is complete before `start` and a
      reserved packet's selection never changes afterwards.
- [ ] Coupled mixed scope is Quality; disjoint packets may mix profiles without overlapping writes.
- [ ] Pre-spawn profile unavailability (missing native mapping, missing spawn mechanism, force
      variable) selects initial Quality with `excluded(profile-unavailable)` and `fallback=none`;
      only rejection of an actually attempted Fast spawn records `spawn-rejected`, consumes Fast,
      and makes one retained-state Quality continuation.
- [ ] Each of the eight post-attempt fallbacks consumes Fast and causes exactly one Fast→Quality
      transition; later Quality retries remain bounded by the existing completion protocol.
- [ ] Requirements, validator, review, final-validator, conflict-resolution, retry, and completion
      corrections are always Quality.
- [ ] Minimal records contain no operational handoff details or prohibited data; a detailed trace
      carries only the helper's trace schema and only with current-run consent.
- [ ] A measured run calls `start` once, `start-packet` immediately before each packet's first spawn
      and `finish-packet` when its initial phase ends, and `finalize` exactly once with the closed
      `completionStatus`, `escalated`, and `costProxy` values; a never-spawned packet gets no timing
      operation and is stored `not-started`, an interrupted one `started` with unavailable duration,
      and a `completed` record holds only started packets; pilot capabilities appear in no
      persisted or shared artifact.
- [ ] `LOCKED` is re-sent with the identical payload at most twice more and then counts as the
      operation's failure; no other error is re-sent except a lost response where allowed.
- [ ] An in-flight reservation makes `start` fail and the run proceeds as unmeasured Quality without
      Fast.
- [ ] Every critical safety, data-integrity, authorization, or scope-boundary incident calls
      `record-incident` with its helper category and preserves foreign/user state; `build` names no
      `critical-*` outcome and never calls `suspend`; a still-locked or failed `record-incident`
      reports only a value-free alert.
- [ ] A failed `finalize` triggers no workflow-side suspension: only the helper's envelope reports a
      helper-persisted `finalization-failed`, and caller errors, contention, and location faults
      change no pilot state. The run offers one confirmed same-run `reconcile-record`, which stores
      every packet `unknown`, and otherwise reports the `discard-generation`/`purge` route; the
      product diff is unchanged and no Quality fallback is requested.
- [ ] The next run observes suspension. Only an explicit confirmed Guided `resume` while
      `generationState=suspended` with healthy evidence can clear it; `review` is terminal and
      rejects resume.
- [ ] Authorized scope growth remains under its original packet and consumed-Fast state; independent
      new work cannot be added at finalization and instead stops for an explicit user choice to
      create a future-work issue or, without an issue tracker, a new plan.
- [ ] Fallback and pilot-control outcomes are recorded independently, and capacity, evidence-gap,
      incomplete, and unpersistable-control-state paths remain worker-free and fail-closed.
- [ ] The helper is invoked only through the sole-positional-operation/exact-JSON contract without
      scraping stderr or leaking operational values. Pre-spawn uncertainty prevents Fast;
      post-spawn failures preserve the diff and start no worker; failed Guided control operations
      report and leave proven state unchanged.
- [ ] Baseline Quality, active selected Quality, Fast success, and one Fast→Quality continuation use
      the `start-packet`/`finish-packet` measurement boundary; later validation/review/correction
      work is excluded and missing metrics remain unavailable rather than zero.
- [ ] `test/execution-profile-contract.test.mjs` allows Fast only in `build.md` Phase 2 and still
      rejects it in `refactor.md` and every other tool; no statement listed under Affected files
      still calls the key reserved or `build` unadopted.
- [ ] Setup accepts exactly the existing invocation set, exposes the key only in Guided block 10,
      preserves it in Profile, Express, and hidden mode, and writes no provider model name.
- [ ] Every pre-existing documentation, test, validation, review, completion, archival, and delivery
      gate still runs, and the diff-baseline pins in `test/workflow-contracts.test.mjs` stay green.
- [ ] Fixture-driven contract cases demonstrate the required routing outcomes.

## Validation plan

```sh
node --test test/execution-profile-contract.test.mjs test/execution-profile-rendering.test.mjs
node --test test/execution-profile-workflow-contract.test.mjs
node --test test/build-lib.test.mjs test/execution-location-contract.test.mjs test/worktree-lifecycle-contract.test.mjs
node --test test/pilot-measurement.test.mjs test/pilot-measurement-cli.test.mjs test/pilot-measurement-contract.test.mjs
node --test test/workflow-contracts.test.mjs
pnpm agent:check
pnpm test
node build.mjs
pnpm test:distribution
pnpm eval merge-gate verify
```

Record the built `build` and `setup` core line counts. `pnpm eval merge-gate verify` reports whether the edits to sources the merge-gate suite loads owe a re-record
before the next release; that verdict is reported, not fixed, by this plan.

### Scope change 2026-09-29

During implementation the manual fresh-session eval suite `evals/build/` proved impossible on the
shared `evals/_scaffold/` instrument without generic changes this plan excludes: the scaffold
provisions only the portable build (where every Fast token renders as unavailable, so no routing
outcome is observable), and `seal` refuses a run whose tracker-stub call log is empty, which every
correct `build` pilot run produces. By user decision the behavioural eval moves to a follow-up plan
that first generalizes the scaffold (selectable native build target with its agent sidecars, and a
suite-declared evidence channel). This plan delivers the adoption with fixture-driven contract
coverage only.

## Implementation notes

- Implemented on branch `effective-flow/build/build-field-pilot-integration-2` from `35b4523`.
- Deviation from Affected files, approved during review incorporation: `build-lib.mjs` gained the
  generic `{{BUILD_TARGET}}` placeholder (renders `claude`, `codex`, or `portable`; unknown
  targets throw) so a portable build is recognized at build time instead of from its host. It is
  documented in `AGENTS.md` and `docs/developer-guide/build-system.md`.
- New test support modules `test/support/pilot-helper-contract.mjs` (operation keys read from the
  helper source) and `test/support/native-profile-config.mjs` (profile mappings read from
  `build.mjs`); `docs/user-guide/tools-deliver.md` also carried a stale adoption sentence.
- An unmeasured run (portable build, failed or ambiguous inventory, failed `start`) uses the
  effective envelope `generationState=none + not-evaluated + quality`; the inventory-proven
  persisted state is kept separately as the incident target.
- Budgets: `build` 657/660 (was 617), `setup` 1927/1927 (was 1923).
- Revision 2026-10-01, merged with `origin/develop` at `5f43f2e` (#512, helper protocol 1.1.0):
  the workflow-record fragment gained the automatic `protocol`/`activate` preflight step, the
  bounded `LOCKED` retry, the start-before-spawn invariant with the `attempt` rule, and
  `record-incident`; the workflow-side `suspend` calls for incidents and failed finalization and
  the never-spawned-packet closure with its "known bias" note are gone. Guided block 10 lost its
  `activate` action. The same-run `reconcile-record` offer stays, because 1.1.0 still accepts it for
  any incomplete reservation and now stores every packet `unknown`. The three `activate` tests this
  branch had added to `test/pilot-measurement.test.mjs` were removed, because they asserted the
  1.0 contract and #512 covers activation in `test/pilot-measurement-adoption.test.mjs`. The
  fixture set grew from 32 to 44 cases; every replayable one runs against the merged helper, with
  a held lifecycle lock for the `LOCKED` cases and a removed timing receipt for the mid-write
  finalize fault. `build` and `setup` stayed within their budgets without a budget change.

## Test results

**Date:** 2026-10-01

- `pnpm agent:check`: passed (549 files).
- `pnpm test`: 1736 tests, 1735 passed, 0 failed, 1 skipped (the deliberate merge-gate freshness
  placeholder).
- `node build.mjs`: passed, no guard warnings; Claude 16 base + 5 Fast agents.
- `pnpm test:distribution`: passed.
- Targeted `node --test` over the execution-profile, pilot-measurement, and workflow-contract
  files: 520 passed, 0 failed. The workflow-contract fixtures (32) replay every helper-reaching
  scenario against the shipped helper in a temporary runtime root.
- `pnpm eval merge-gate verify`: stale for all six scenarios, mostly from earlier changes on
  `develop`; this change adds `shared/config-migration.md`. A re-recorded round is owed before
  the next release, not before merge.

Revision run on 2026-10-01, after merging `origin/develop` at `5f43f2e` (helper protocol 1.1.0):

- `pnpm agent:check`: passed (564 files).
- `pnpm test`: 1797 tests, 1796 passed, 0 failed, 1 skipped (the same deliberate placeholder).
- `node build.mjs`: passed; `build` 657/660, `setup` 1927/1927, `refactor` 920/922.
- `pnpm test:distribution`: passed.
- `test/execution-profile-workflow-contract.test.mjs`: 88 passed; all 44 fixtures check the model,
  and every replayable one runs against the merged helper.

## Review findings

**Date:** 2026-10-01
**Reviewer:** effective-flow-nodejs-reviewer (review and one targeted re-check)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    12 |
| Open / Not implemented |     0 |

The one open finding, that never-spawned packets were recorded as near-zero `available` durations
and counted as Fast attempts without escalation, was resolved by #512: the helper now records such
a packet as `not-started` and excludes it from every packet metric, and this plan's 2026-10-01
revision adopts that rule.

Two further observations were closed without a work artifact: the merge-gate observation fragment
still decides portability at run time (unchanged by this plan's design), and
`test/pilot-measurement-timing.test.mjs` showed one pre-existing load-sensitive failure.

## Assumptions and open points

- Profile state is per original packet/coupling group, not per workflow and not per file.
- The field pilot optimizes implementation only; baseline, review, validation, and comparison keep
  their current assignments.

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

The table counts unresolved findings. The 2026-09-29 revision found 6 critical, 13 important, and 7
note-level findings against `35b4523`; the 2026-10-01 revision found 2 critical and 3 important
findings against helper protocol 1.1.0; all are incorporated below.

### Findings

#### Revision 2026-10-01 (helper protocol 1.1.0, #512)

- **Critical — resolved activation decision (supersedes the 2026-09-29 activation decision):**
  1.1.0 rejects `confirmation` on `activate` and returns `activated` or `not-ready` with `unmet`
  from `busy`, `window`, `sample`. Decision: activation is automatic in `build`'s preflight for an
  enabled `baseline` generation, the results are consumed exactly as the helper defines them,
  ambiguity is settled by one guarded `inventory` re-read, and Guided block 10 no longer offers
  `activate`.
- **Critical — resolved incident interface (supersedes the 2026-09-29 incident decision):**
  `suspend` now rejects every `critical-*` outcome. Decision: `build` calls `record-incident` with
  the helper category and keeps no outcome map.
- **Important — resolved finalization failure (supersedes the 2026-09-29 reconciliation decision
  where it called `suspend`):** the helper persists `finalization-failed` itself on a mid-write
  fault, and caller errors, contention, and location faults never suspend. Decision: no
  workflow-side suspension; the same-run `reconcile-record` offer stays, now storing `unknown`
  attempts.
- **Important — resolved packet timing:** the start-before-spawn invariant and the `attempt` rule
  replace the closure of never-spawned packets, so the "known bias" containment text is removed.
- **Important — resolved lock contention:** #512 left the bounded `LOCKED` retry to this plan.
  Decision: the identical payload is re-sent at most twice more, after about two and then about five
  seconds, for every locked operation `build` calls.

#### Revision 2026-09-29 (drift against `35b4523`)

- **Critical — superseded activation decision:** `activate` requires a same-run user attestation
  (`confirmation: true`) and reports "not ready" as `INCOMPLETE_EVIDENCE`, so automatic preflight
  activation in `build` was impossible. Decision: activation is a confirmed Guided setup action;
  `build` only reads the generation through `inventory`.
- **Critical — resolved timing gap:** the helper measures duration through `start-packet` and
  `finish-packet`, and `finalize` fails while any reserved packet lacks a finished receipt. The
  measurement order now includes both operations and closes every reserved packet on every exit
  path. (The closure of never-spawned packets is superseded on 2026-10-01 by the `attempt` rule.)
- **Critical — superseded incident interface:** no typed-event input exists; `suspend` takes the
  caller's closed outcome, and helper failures carry no control outcome. Decision: `build` calls
  `suspend` with a fixed one-to-one class-to-outcome mapping and reports a failed `suspend`
  value-free.
- **Critical — resolved guard conflict:** `test/execution-profile-contract.test.mjs` rejects any
  adoption. It is now an affected file, rewritten first into a scoped allowlist.
- **Critical — resolved stale statements:** twelve shipped statements call the key reserved or
  `build` unadopted; all are listed under Affected files.
- **Critical — resolved setup budget:** `setup` has no line headroom. Decision: the Guided opt-in and
  actions go into a lazy fragment behind a new block 10; `setup.md` gains only the entry, the
  pointer, and the schema row.
- **Important — partly superseded reconciliation decision:** `reconcile-record` needs the originating run's
  raw capability, so no later run can clear an incomplete record. Decision: a failed `finalize`
  offers one confirmed same-run reconciliation; otherwise only `discard-generation` or `purge`
  remain, and resume shows no cause summary because inventory exposes none.
- **Important — resolved:** the shipped envelope has four fields plus decision-map `fallback`,
  `fastAttemptConsumed` (not `initialImplementationSpawnConsumed`), and the helper's
  `pilotControlOutcome`; the explicit wire mapping to `start` is added, with state snapshots per
  workflow record.
- **Important — resolved:** classification must complete before `start`, which fixes each packet's
  selection.
- **Important — resolved:** portable execution cannot be measured (`harnessFamily` is
  `claude|codex`); it is unmeasured Quality.
- **Important — resolved:** the trace schema holds no diffs or escalation detail; those stay in the
  transient handoff.
- **Important — resolved:** `begin-baseline` needs the protocol digest, disclosure, and
  `fastEnabled`; the Guided action now names them.
- **Important — resolved:** the shared measurement fragment covers only merge-gate; a new
  workflow-record fragment is planned.
- **Important — resolved:** Fast tokens are valid only inline on the Phase 2 step 1 selector lines;
  only non-token policy is deferred.
- **Important — resolved:** the shipped Phase 2 step 0 diff-baseline seam is respected; the per-packet
  snapshot is a distinct, differently named artifact placed after it.
- **Important — resolved:** `pnpm merge-gate-eval` no longer exists; validation uses
  `pnpm eval merge-gate verify`. The planned `evals/build/` suite was later moved out of scope (see
  "Scope change 2026-09-29").
- **Important — resolved:** a missing spawn mechanism is also `excluded(profile-unavailable)`.
- **Important — resolved:** `activate` has no helper test; the missing coverage is added. (Since
  #512 the coverage lives in `test/pilot-measurement-adoption.test.mjs`.)
- **Note — resolved:** concurrency serializes admission; an in-flight reservation yields unmeasured
  Quality.
- **Note — resolved:** closed `finalize` values (`completionStatus`, `escalated`, `costProxy`) and a
  safe single re-send are specified.
- **Note — resolved:** the fallback list uses the exact eight-value post-attempt enum, and conflict
  resolution joins the Quality-only corrections.
- **Note — resolved:** setup placement is Guided Step 5 block 10 with an unchanged invocation set and
  hidden-mode coverage.
- **Note — resolved:** dependency paths now point to `docs/plan/archive/`.
- **Note — resolved:** exposing the key also activates the existing merge-gate observation; stated.
- **Note — resolved:** validation commands use `pnpm eval <tool> verify`.

#### Original review (2026-09-21)

- **Important — resolved late-packet decision:** Authorized scope growth remains under its original
  packet identity. Genuinely independent work cannot be appended at finalization; the workflow stops
  and asks whether to create a future-work issue, or a new plan when no issue tracker is available.
- **Important — restored activation-boundary decision:** The 2026-09-21 decision that every
  enabled baseline workflow invokes `activate` in preflight was superseded on 2026-09-29 and is
  restored, on helper protocol 1.1.0, by the 2026-10-01 activation decision above.
- **Important — resolved failure-phase finding:** Helper failures are phase-specific: pre-spawn
  uncertainty prevents Fast, post-spawn failures preserve the product diff and start no worker, and
  Guided control failures leave proven state unchanged. Incomplete inventory blocks Fast even when
  the same storage fault prevents a suspension write.
- The review also incorporated Quality-only correction seams, first-attempt consumption before
  spawn, path-scoped parallel attribution, worktree-active escalation, telemetry/handoff separation,
  terminal record handling, incident suspension, and a dedicated semantic scenario matrix.

## Open points

- No open points.
