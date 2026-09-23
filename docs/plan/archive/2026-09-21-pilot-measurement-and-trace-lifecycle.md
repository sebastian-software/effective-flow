# Pilot measurement and trace lifecycle

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `origin/develop` at `32e6288` on 2026-09-22.
**Working state:** The planning checkout remains on `develop` at `c628f3f`, behind the planning
baseline. Preserve the untracked `docs/concept/` tree and the four untracked 2026-09-21 field-pilot
plan files under `docs/plan/`.
**Depends on:** `docs/plan/archive/2026-09-21-execution-profile-and-activation-contract.md` and
`docs/plan/archive/2026-09-21-native-profile-rendering.md`.

## Requirement

Create a local, dependency-free measurement subsystem for the opt-in field pilot. Minimal records
must be useful without containing prompts, diffs, source, paths, environment values, secrets, or
personal/session identifiers. Detailed traces require explicit consent for the current run and
still use closed structured fields rather than raw prose. Aggregation and deletion must be
digest-bound, local, and limited to one dedicated runtime namespace.

This subsystem ships before workflow adoption. It does not activate Fast or create tracked pilot
evidence. Work packages 1 and 2 are already merged: this work package consumes their canonical
policy parser, native rendering, and exact runtime-script inventory guards without changing model
mappings, route classifications, generated Fast sidecars, native inventories, or workflow profile
selection. Changing the merge-gate load set creates behavioral-eval freshness debt that must be
re-recorded before the next release, not before this source merge.

## Architecture decisions

- Add `src/scripts/pilot-measurement.mjs` as a thin JSON-stdin CLI and
  `src/scripts/pilot-measurement-core.mjs` as the importable deterministic core. Add
  `src/scripts/pilot-measurement-protocol.mjs` as the versioned, dependency-free machine-readable
  authority for measurement thresholds, byte/cardinality caps, metric registry, grouping and
  adoption-gate rules, and exact-rational aggregate/evaluation algorithm versions. Its runtime
  projection of profile states, fallbacks, and `pilotControlOutcome` mappings must compare exactly
  with the contract parsed from `src/shared/execution-profiles.md` by `build-lib.mjs`; the merged WP1
  source remains canonical and divergence fails before the distribution swap. Canonicalize and hash
  the complete build-validated runtime projection; every generation stores that version/digest.
  Register all three modules in `RUNTIME_SCRIPT_FILES` so every distribution receives identical
  bytes. The protocol module imports no build module; `build-lib.mjs` imports its frozen policy
  projection, preserves the existing execution-profile exports for compatibility, and validates the
  marked Markdown rows against it, avoiding a runtime/build dependency cycle.
- Freeze the process contract used by existing runtime helpers: the operation is the sole positional
  argument, stdin is one exact-key JSON object, success or failure produces one stable JSON envelope
  on stdout, diagnostics on stderr use value-free codes/messages, and failure exits nonzero. Read-
  only operations are `protocol`, `inventory`, `evaluate`, and `discard-generation` with
  `dryRun:true`; operations with mutating forms are `begin-baseline`, `activate`, `start`,
  `start-packet`, `finish-packet`, `finalize`, `suspend`, `resume`, `reconcile-record`,
  `reconcile-lock`, `reconcile-temporary`, `begin-review`, `aggregate`, `purge`, and confirmed
  `discard-generation`. Every mutation applies the runtime guard and its operation-specific
  confirmation/digest contract immediately before writing.
- Keep user interaction and configuration resolution in the orchestrating workflow. The CLI treats
  the workflow as its trusted caller: it accepts only a closed `configState` plus explicit
  confirmation and current-run detail-consent attestations, binds them to the requested operation
  and reviewed digest, and never claims to cryptographically prove the preceding conversation or to
  parse the project-setup ADR independently. The workflow must resolve configuration fresh before a
  destructive or admission-changing call and may set either attestation only from the matching
  explicit user decision in that same run.
- Store only below `<RUNTIME_STATE_ROOT>/.effective-flow/model-tiering-pilot/`. The namespace has one
  schema/ownership marker plus `generations/<id>/`; each generation exclusively owns
  `records/`, `traces/`, `gate-observations/`, `summaries/`, `state`, `suspension`, `locks/`, and
  owned temporaries. Normal digest-bound deletion atomically renames one verified generation
  directory to a closed `tombstones/<id>-<review-digest>/` name; guarded discard uses the distinct
  closed `tombstones/<id>-discard-<inventory-digest>/` grammar. Each removes only its exact tombstone.
  Do not use `memory.json`, `cache.json`, review reports, `evals/`, or an external service.
- Make targeted `inventory` return a stable closed deletion status containing
  `generationStatus=present|absent` and the count of matching normal/discard tombstones for the
  requested generation. Completed purge or discard must report `absent` with zero
  matching tombstones. Already-absent completion and response-loss retry are idempotent; an unknown
  or mismatched tombstone remains blocking and is never treated as zero.
- Support a preregistered, Quality-only observational baseline before Fast activation. The same gate
  classifies packets, marks which baseline packets would have been Fast, and measures them with the
  same schema and boundaries while executing Quality. `begin-baseline` requires both a valid
  `executionProfiles.fast.enabled: true` setting and explicit confirmation, which together authorize
  local minimal measurement. `activate` requires the shipped protocol version/digest and baseline
  sample/window checks; it does not pair or rerun tasks.
- Treat the shipped, build-validated protocol module—not caller values or target-project Markdown—as
  the executable runtime preregistration. `begin-baseline` displays and confirms its exact
  version/digest; `activate` and aggregation re-read the shipped module and reject drift. The
  developer guide mirrors the measurement-specific registry and algorithms through a build-validated
  marked section; it does not become a second copy of the execution-profile policy. V1 evidence
  remains one local generation per project; any later cross-project analysis may consume only
  separately reviewed and approved aggregates and is out of scope here. Raw or detailed records
  never cross project boundaries.
- Use the canonical two-control state machine: derive `configState=disabled|invalid|enabled` without
  rewriting persisted `generationState=none|baseline|active|suspended|review`. `none` writes no
  measurement; enabled+baseline records minimal Quality-only comparisons; enabled+active may select
  Fast; suspended/review always force Quality; and disabled/invalid stops new measurement and Fast
  while preserving the generation for later review. `activate` never substitutes for configuration,
  and configuration never substitutes for generation state.
- Make `review` a canonical generation state shared with work package 1. `begin-review` takes the
  lifecycle lock, requires explicit confirmation plus the expected generation/inventory digest as a
  compare-and-set guard, changes `baseline|active|suspended` to `review` even when configuration is
  disabled or invalid, and rejects every new reservation.
  A suspended transition preserves every suspension cause, incomplete record, and evidence-gap fact
  in the review inventory; it never clears or temporarily resumes admission. Already reserved
  records may finalize with their captured cohort and generation state and must drain or reconcile before
  aggregation. `review` always yields `not-evaluated + quality` to workflows and has no transition
  back to admission; the reviewed generation ends through the work-package-6 decision and purge.
  Suspension from `baseline|active` stores `resumeTo` as that exact prior state. `resume` is legal
  only while `generationState=suspended` and restores only the stored value—never a caller-selected
  target. After `suspended → review`, reconciliation may clear blockers but `resume` rejects and
  `generationState` remains `review`.
- Make one workflow record contain packet measurements. `start` reserves it before the first
  measured implementation spawn in both baseline and active generations, regardless of selected
  profile. It snapshots cohort, exact `configState`, exact `generationState`, protocol digest, gate
  result, and an atomically assigned start ordinal so later transitions cannot relabel an in-flight
  run. The helper mints opaque random run and packet IDs that encode no user, repository, branch,
  task, path, PR, session, or time, and returns unguessable workflow and per-packet capabilities
  whose hashes—not raw values—are persisted. The orchestrator calls `start-packet` exactly once
  immediately before a packet's first initial implementation attempt and `finish-packet` exactly
  once after that packet's terminal initial phase, including any retained-state Quality continuation
  after a failed Fast attempt; it never finishes or restarts the timer between those attempts. Each
  operation writes only that packet's capability-bound timing receipt, so parallel packets never
  append to a shared record through read-modify-write. `start-packet` records Node's monotonic counter plus an internal
  host/boot continuity probe: an anonymous packet-salted hash of `os.hostname()` plus the boot-time
  estimate `Date.now() - os.uptime() * 1000`. `finish-packet` recomputes both and accepts the duration
  only when the anonymous host fingerprint matches, the monotonic counter advanced, the boot
  estimate stayed within the protocol tolerance, the wall/monotonic deltas agree within tolerance,
  and the duration is within bounds. Otherwise it closes the packet with duration unavailable. Raw
  host input is never stored; counters, wall values, boot estimates, salt, and continuity
  fingerprints remain only in the in-flight timing receipt and are removed at finalization. No
  hostname, timestamp, or fingerprint enters the final record or aggregate. The
  orchestrator accumulates the closed packet outcomes and performs exactly one workflow finalization.
  Admission closure may reject new starts but still permits already reserved records and packet
  timers to finish.
- Record merge-gate correction rounds as separate anonymous period observations under
  `gate-observations/` while a baseline or active generation exists. Count actual correction work in
  separate closed counters for CI-repair `iterate` delegations, configured-reviewer implementation
  delegations, and conflict-resolution attempts. Pending-check/bot waits, keyword-less resumes,
  ordinary round starts, and Phase-4 returns without implementation are not corrections. Exclude
  observer-only runs; record `merge|report` and group them separately. Freeze terminal outcomes as
  `merged|reported-ready|reported-blocked|failed`, and emit exactly one observation in Phase 6 before
  wisdom deletion. Observations also contain cohort, harness family, checks-reported flag,
  required-check count, and required-checks-satisfied result; they carry no workflow record ID,
  PR/repository/branch identifier, check name, comment, finding, path, or per-run link to
  `build`/`refactor`. Aggregation compares baseline and active periods only and supplies the
  period-level CI/check and merge-gate non-regression evidence. The helper atomically assigns each
  observation a monotonic generation ordinal for deterministic chronological halves; no timestamp is
  exposed. Reserve only after Phase 0 has resolved a non-observer `merge|report` run and before
  Phase 1. Finalize before current Phase 6 step 1 deletes wisdom and delegation state, then perform
  cleanup and reporting. Map a verified Phase-5 merge to `merged`. For measurement only, project a
  report-mode run onto Phase 4 conditions 2–10, including the existing no-check-list waiver: if all
  pass, record `reported-ready`; otherwise record `reported-blocked` with the stable domain blocker,
  never report mode itself. Condition 1 remains the real merge authorization gate but is excluded
  only from that report-readiness projection. Map an unhandled workflow failure after reservation to
  `failed`. Derive required-check counts from the final normalized `pr-status-read`: an unreported
  list is unavailable, `mergeGate.requireAllChecks: true` counts every reported check, and `false`
  counts only `required: true` while any missing requiredness fails closed exactly as the existing
  gate contract specifies.
- Treat `configState=disabled|invalid` or `generationState=none|suspended|review` as a successful
  read-only observation no-op that preserves the stored generation. Only
  `configState=enabled + generationState=baseline|active` reserves the anonymous observation before
  gate work and finalizes it exactly once in Phase 6. Any reserve/finalize failure leaves the current
  merge outcome unchanged, but records or
  attempts to record an `evidence-gap` suspension; an incomplete reservation independently blocks
  future Fast even if suspension persistence fails. If storage cannot persist either artifact, emit
  a stable value-free pilot-control alert and disclose that durable cross-run suspension could not
  be proven. Later workflow preflight remains fail-closed on any incomplete evidence, storage guard,
  or inventory error. Reconciliation may permit `resume` only while the generation is still
  `suspended`; once `begin-review` has moved it to `review`, Fast remains unavailable for that
  generation.
- Minimal packet fields are cohort (`baseline|pilot`), selected profile, would-be-Fast eligibility,
  first gate reason, implementation duration in integer milliseconds, closed fallback category,
  escalation flag, and an optional typed nonnegative cost proxy. Workflow fields are
  `build|refactor`, native harness family, validation status/counts, review status/severity counts,
  completion status, quality-correction rounds, and the helper-assigned monotonic generation ordinal
  allocated atomically at `start`.
  Generation state, not individual records, carries phase start/transition dates for the
  preregistered calendar window; aggregate halves use the ordinal and expose no raw timestamp.
- Measure implementation duration with the capability-bound `start-packet`/`finish-packet` timing
  receipt from immediately before the first implementation spawn through completion of that
  packet's initial implementation phase. Include a failed Fast attempt and its retained-state
  Quality continuation; exclude later validation, review, and correction phases. A host change,
  reboot/reset, wall/monotonic disagreement, negative value, overflow, out-of-range delta, or lost
  timing receipt records duration as unavailable and never falls back to wall-clock subtraction.
  Sum compatible
  executor-cost usage over the same attempts using the closed shape `{kind, unit, value}`, where
  `value` is a bounded canonical unsigned decimal string in the proxy's smallest supported unit.
  Never use binary-float arithmetic. Any missing or incompatible attempt makes packet cost
  unavailable. Aborted or missing outcomes stay explicit and never become zero. Count each new
  Quality correction spawn after initial implementation as one correction round; a same-worker
  keyword-less resume is not a new round. Baseline and pilot use identical boundaries. Inject clock,
  ordinal, ID, and proxy sources into the core for deterministic tests.
- Treat unlike or unsupported cost proxies as separate/unavailable. Never infer currency or convert
  across harnesses or units.
- Detailed trace requires transient `detailOptIn: true` proven by an explicit current-run user
  request. This Boolean is the trusted workflow's current-run attestation, not durable or
  independently verifiable consent evidence. It may persist worker role/profile and requirement statuses, normalized repository-
  relative paths, stable check IDs/outcome/duration, closed escalation reasons, and finding
  ID/severity/status/category/path/line. It rejects raw handoffs, free-form findings, argv, shell,
  environment, stdout/stderr, source excerpts, absolute paths, URLs, and unknown keys.
- Every persisted identifier/path/check/category token has a bounded ASCII grammar and maximum
  length. Reject controls, traversal, URLs, email-like or credential-like values, home/root aliases,
  and source-derived prose. Validate paths lexically as normalized repository-relative tokens;
  never resolve them against the runtime-state root or read source files for validation. A dedicated
  bounded `containsCredentialMaterial` validator in the measurement core rejects credential-like
  names, assignments, bearer material, URL userinfo, and private-key markers; it never returns the
  rejected value. Persist only the consent Boolean/schema flag, never consent text or user identity.
  Hard schema limits are 128 packets per workflow; 256 requirements, checks, and findings per trace;
  1 MiB per workflow record; 4 MiB per detailed trace or CLI input; 10,000 workflow records and
  10,000 gate observations per generation; and 256 MiB total raw generation storage. Reaching a cap
  records `pilotControlOutcome=capacity-exhausted`, persists its matching suspension reason, stops
  new measurement, and forces Quality without deleting prior evidence. Aggregates suppress category
  cells with fewer than five observations unless a separate disclosure review explicitly approves
  them.
- Use a two-phase record lifecycle. `start` reserves the workflow and packet identities before every
  measured initial implementation; `finalize` authenticates with the raw capability and atomically
  replaces only that owned reservation with all packet/workflow outcomes. If preflight/start fails,
  select Quality and create no record. If finalization fails, keep product changes and report
  incomplete evidence. Every incomplete reservation independently blocks later Fast selection even
  if the same filesystem fault prevented a suspension write.
- The CLI, not caller prose alone, enforces the canonical Git/runtime guard immediately before each
  concrete lock, mkdir, file write, atomic rename, and deletion: exact root containment and symlink
  rejection, sentinel and target `git check-ignore`, and empty `git ls-files -- .effective-flow/`.
  The workflow completes the shared directory migration before its first pilot write; every
  mutating CLI operation verifies the migration marker and otherwise refuses with the documented
  migration/setup path. Purge repeats all checks after confirmation and immediately before deletion.
- Suspension state uses a closed, prose-free schema of reason codes, affected record IDs, status,
  and `resumeTo`. Under the lifecycle lock, new causes accumulate rather than overwriting earlier
  causes. Preflight checks both suspension state and incomplete reservations before every Fast
  decision. `resume` requires an exact suspension digest, the full reviewed-inventory digest, no
  unresolved incomplete reservation, and explicit confirmation; configuration changes do not clear
  it. A guarded `reconcile-record` operation may, after exact digest review and confirmation, convert
  a provably owned incomplete reservation to terminal `abandoned` without inventing outcomes;
  aggregation reports it as unavailable and purge retains ownership of it.
- Locks carry schema, operation, generation, owner PID, and nonce. Acquisition is exclusive and
  release removes only the caller's lock. A portable liveness check classifies `stale-provable` only
  when probing that PID returns a definite no-such-process result; a live PID, PID reuse, permission
  error, unsupported probe, or mismatch remains live/unknown. No lock is broken by age alone.
  `reconcile-lock` removes only a proven stale lock after explicit confirmation and exact digest
  matching. Lock metadata never enters aggregates and is purged with its generation.
- Atomic writes use a closed temporary-name grammar containing operation, generation, and owner
  nonce. Inventory distinguishes owned orphan temporaries from unknown entries. Only after the
  corresponding lock is proven stale may a digest-bound, explicitly confirmed reconciliation
  remove that owner's temporary artifacts; unknown names remain untouched and fail closed.
- Aggregate only complete, valid records into two local views: a private pre-suppression decision
  payload and a suppression-preserving publication candidate. Both contain only approved counts,
  distributions, comparable medians, rates, unavailable markers, and observational/unpaired caveats;
  neither contains opaque IDs, paths, timestamps, aliases, or source-derived prose. The private view
  never leaves the generation and is purged with it. A binding review digest covers both views and
  all underlying evidence.
- Version a closed metric registry. Even-count medians are the exact rational mean of the two middle
  integers; threshold comparisons remain integer/rational until presentation. Define every
  numerator and denominator explicitly: Fast-without-escalation and fallback use all attempted-Fast
  packets; workflow completion uses all terminal workflow records; validation success uses all
  terminal records for which required validation applied, with missing results unsuccessful; review
  findings use completed workflows; and correction distributions use completed workflows.
  Aborted, missing, abandoned, excluded, malformed, and unsupported-proxy observations remain in
  named counts and never silently disappear from a denominator. The registry and grouping version
  are digest inputs. It separately fixes cohort-wide minima, per-metric/stratum minima, deterministic
  ordinal-half construction/minima, and period-observation mode/harness minima. Private evaluation
  sees pre-suppression counts, including the three-occurrence fallback threshold; the publication
  candidate still suppresses every cell below five.
- Make `evaluate` a read-only operation over an exact generation, private-decision, review, and
  protocol digest. Under a read-only inventory it verifies that the current review digest still
  matches all evidence/state/parameters/views and names the supplied decision digest; stale,
  ambiguous, or drifted summaries fail closed. It then applies the protocol-owned gate matrix with integer/rational math, returns each gate as
  `pass|fail|unavailable` plus `keepEligible`, writes no state, and never chooses Change versus Stop.
  Cost compares the median compatible proxy per pilot-baseline would-have-been-Fast Quality packet
  with the median total initial-phase proxy per active attempted-Fast packet, including its retained-
  state Quality continuation. Normalize Quality corrections per completed workflow and merge-gate
  corrections per completed observation, separately by `merge|report` and harness.
- Canonicalize JSON with lexicographically sorted object keys and stable record ordering, then hash
  with SHA-256. `aggregate` returns `decisionDigest` for the private view, `publicationDigest` for the
  suppressed candidate, and `reviewDigest` binding both digests plus schema and algorithm versions,
  generation, sorted member-digest sets for workflow records, detailed traces, anonymous gate
  observations, generation and suspension state, incomplete/invalid/excluded counts by class,
  grouping parameters, proxy compatibility, and suppression rules. Traces remain inventory-only and
  never feed metrics, but their membership is bound for exact purge. Purge targets the exact
  generation/review digest and fails if any member, state, view, or parameter changed after review.
- Give this subsystem sole deletion ownership for its exact namespace. Existing
  `effective-flow cleanup` remains unchanged. Purge requires a dry-run inventory, exact generation
  and review digest, explicit confirmation, no live writer, and no unknown/symlinked entry. Under
  the lifecycle lock it revalidates the digest, atomically renames the generation to its exact
  tombstone, and only then recursively deletes that tombstone. A retry may finish deleting only a
  tombstone whose ID/digest match the confirmed purge; it never resumes member-by-member deletion
  from a live generation or touches an unknown tombstone.
- Add `discard-generation` as a separate fail-closed retention escape hatch established before
  collection. Its read-only `dryRun:true` form requires disabled configuration, terminal
  `generationState=review`, verified namespace/generation ownership and physical containment, no
  live writer/lock, and no symlink or special file anywhere in the target. It inventories unknown or
  malformed regular files opaquely and returns only bounded counts by safe file type, total bytes,
  and the canonical full-inventory digest—never paths or values. The confirmed form requires that
  digest, explicit `change|stop`, and confirmation; it acquires its own lifecycle lock, proves no
  other writer/lock, and revalidates the full inventory before atomically renaming only the exact
  generation to its discard tombstone. It removes only that tombstone; same-digest retry is
  idempotent. It emits no aggregate and makes Keep unavailable. Manual deletion outside this guarded
  path remains forbidden.

## Schema outline

| Record                | Required content                                                                                                                                     | Explicitly excluded                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Minimal workflow      | Schema/kind, opaque IDs, workflow, native harness, packet metrics, validation/review/completion summaries                                            | Prompt, diff, source, paths, command text/output, environment, identity, model alias            |
| Detailed trace        | Minimal IDs, consent flag, roles/profiles, requirement IDs/statuses, safe relative paths, stable check outcomes, closed escalation/finding summaries | Raw handoff/reply, free prose, argv/shell, stdout/stderr, source excerpt, absolute path, secret |
| Private decision      | Generation/decision digest, pre-suppression counts, compatible medians/rates/distributions, unavailable markers, unpaired caveat                     | Export/publication, run/packet IDs, detailed findings, paths, timestamps, aliases, copied prose |
| Publication candidate | Generation/publication digest, suppressed counts and approved metrics, unavailable/suppression markers, unpaired caveat                              | Cells below five, run/packet IDs, detailed findings, paths, timestamps, aliases, copied prose   |

Unknown keys fail at every level. Existing credential detection may be a second barrier, never a
substitute for the allowlist.

## Affected files

| File                                                   | Planned change                                                                                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/pilot-measurement.md`                      | Add workflow-facing privacy, invocation, failure, retention, aggregation/evaluation, purge, and guarded-discard contract.                                                                                   |
| `src/tools/merge-gate.md`                              | Add anonymous period-level correction-round observation only; no profile routing or per-run linkage.                                                                                                        |
| `src/scripts/pilot-measurement.mjs`                    | Add thin structured CLI for generation, record, inventory, aggregation/evaluation, suspension, reconciliation, purge, and guarded discard.                                                                  |
| `src/scripts/pilot-measurement-core.mjs`               | Add schemas, safe filesystem lifecycle, locking, aggregate/evaluate math, and both digest-bound deletion paths.                                                                                             |
| `src/scripts/pilot-measurement-protocol.mjs`           | Add the shipped versioned measurement protocol, build-validated WP1 policy projection, adoption-gate data/algorithms, and canonical digest source.                                                          |
| `build-lib.mjs`                                        | Reconcile the runtime policy projection with the parsed canonical execution-profile contract through pure helpers.                                                                                          |
| `build.mjs`                                            | Register all three runtime modules, validate the policy projection and documented mirror, generalize the stale helper diagnostic, and remeasure `CONTEXT_BUDGET_LINES['merge-gate']` from the build report. |
| `scripts/distribution-smoke.mjs`                       | Extend the exact shipped-runtime inventory and execute the pilot helper's read-only protocol smoke path in every target.                                                                                    |
| `test/build-lib.test.mjs`                              | Cover policy-projection drift and the pure protocol/document reconciliation helpers.                                                                                                                        |
| `test/execution-profile-contract.test.mjs`             | Extend the exact runtime-script inventory while preserving every WP2 no-activation and target-separation guard.                                                                                             |
| `test/pilot-measurement.test.mjs`                      | Cover schemas, CLI, privacy, lifecycle, concurrency, aggregate/evaluate, purge, and guarded discard.                                                                                                        |
| `test/pilot-measurement-cli.test.mjs`                  | Spawn the CLI and pin parsing, envelopes, streams, exit codes, no-echo errors, and effects.                                                                                                                 |
| `test/pilot-measurement-git.test.mjs`                  | Cover real ignore/index, root mismatch, symlink, collision, and unrelated-state preservation.                                                                                                               |
| `test/pilot-measurement-timing.test.mjs`               | Cover capability-bound parallel packet timers, cross-process continuity, reboot/epoch drift, crashes, and unavailable-duration closure.                                                                     |
| `test/pilot-measurement-contract.test.mjs`             | Pin workflow-facing prohibitions and fail-closed ordering.                                                                                                                                                  |
| `test/workflow-contracts.test.mjs`                     | Pin merge-gate observation placement, exactly-once emission, and failure semantics.                                                                                                                         |
| `docs/user-guide/model-tiering-pilot.md`               | Explain local data, consent, retention, review, purge, and publication separation.                                                                                                                          |
| `docs/user-guide/tools-deliver.md`                     | Disclose anonymous period-level merge-gate/check observation while a pilot generation exists.                                                                                                               |
| `docs/user-guide/README.md`                            | Index the pilot guide.                                                                                                                                                                                      |
| `docs/developer-guide/architecture.md`                 | Add the local measurement boundary and its relationship to the existing policy and native profile rendering.                                                                                                |
| `docs/developer-guide/build-system.md`                 | Document the new runtime helper family and registration.                                                                                                                                                    |
| `docs/user-guide/configuration.md`                     | Distinguish project activation from per-run detailed consent.                                                                                                                                               |
| `docs/developer-guide/configuration.md`                | Document runtime namespace and ownership.                                                                                                                                                                   |
| `docs/developer-guide/model-tiering-pilot-protocol.md` | Explain the shipped protocol through a build-validated marked mirror and operational guidance.                                                                                                              |
| `docs/developer-guide/README.md`                       | Index the measurement-protocol guide.                                                                                                                                                                       |
| `docs/adr/risk-aware-model-tiering-pilot-policy.md`    | Record that lifecycle capability now exists while workflow adoption and setup activation remain absent.                                                                                                     |
| `AGENTS.md`                                            | Add the pilot subtree to the runtime-state inventory and distinguish lifecycle capability from workflow adoption.                                                                                           |

Do not change `src/tools/cleanup.md`, package eval commands, WP2's model mappings, route
classifications, native inventory helper, generated Fast sidecars, or `dist/**`. Do not rewrite
`evals/merge-gate/results/**` in this work package: the changed load identity makes the existing six
scenarios with five runs each stale, and that tracked evidence is re-recorded separately before the
next release. Real pilot records never enter the eval tree.

## Implementation details

### Approach

1. Require merged WP1 and WP2 at the execution baseline. Parse and validate the canonical
   `src/shared/execution-profiles.md` contract through `build-lib.mjs`, compare its relevant closed
   policy fields with the runtime protocol projection, and stop on any mismatch instead of creating
   another source of truth.
2. Implement exact-key schemas, byte/cardinality caps, bounded token grammars, enums, numeric
   bounds, opaque IDs, lexical safe relative paths, the dedicated credential-material detector,
   capability-bound packet timing receipts, duration/cost boundaries, and value-free
   prohibited-field rejection in the core.
3. Implement CLI-owned per-mutation Git/runtime guards, migration-marker verification, namespace
   ownership, restrictive directories/files, two-phase atomic records, detailed consent,
   suspension, and owner-bound crash-safe locks.
4. Implement protocol canonicalization/digesting, generation initialization, and the Quality-only
   baseline-to-active transition bound to the shipped version/digest and its minimum evidence checks.
5. Add reserved, exactly-once Phase-6 merge-gate observation only for
   `configState=enabled + generationState=baseline|active`, with
   separate actual-correction counters, closed mode/outcome values, no cross-run identifier or
   profile selection, and observer-only exclusion. Load the shared fragment lazily for the Phase-0
   observation preflight, reserve after completion-mode resolution and before Phase 1, and finalize
   before Phase 6 deletes the evidence needed for correction counts. No-generation is a no-op.
   Observation failure never mutates the current merge result but produces an
   incomplete/evidence-gap suspension path that blocks later Fast; an unpersistable suspension emits
   a stable explicit control alert.
6. Implement canonical digesting and the versioned exact-rational metric/adoption registry with
   explicit denominators/minima, compatible proxy grouping, a private pre-suppression decision view,
   a suppression-preserving publication candidate, their binding review digest, observational/
   unpaired wording, and read-only decision/review-digest-bound `evaluate` gate results.
7. Implement inventory, explicit stale-lock reconciliation, suspension resume that is legal only
   from `generationState=suspended`, and exact-generation digest-bound purge through the atomic
   tombstone rename. Add separately confirmed `discard-generation` for terminal reviewed generations
   whose unknown/malformed owned evidence prevents normal aggregation, binding opaque members to a
   full-inventory digest and requiring a `change|stop` decision. Unknown tombstones, symlinks, special
   files, live writers/locks, ownership/containment failure, or digest drift change nothing; each
   known tombstone retry is idempotent.
8. Add the thin non-echoing JSON CLI, register all three runtime modules in the exact 13-file
   inventory for
   every target, validate the policy projection and documentation mirror, generalize the stale
   `remote-tracker shipping guard` diagnostic to `runtime helper`, and assert byte-identical
   Claude/Codex/portable copies without changing WP2's native worker artifacts or inventories.
9. Add unit, spawned-CLI, filesystem, concurrency, crash, privacy, aggregation/evaluation, purge, and
   guarded-discard tests,
   including injected nondeterministic sources, value-free output, byte-preservation of unrelated
   runtime state, and orphan-temporary recovery across reservation, finalization, aggregate,
   suspension, transition, and purge preparation. Pin `baseline|active|suspended → review`, concurrent
   `start`/`begin-review` serialization, preserved suspension causes, and the absence of every
   `review → admission` transition.
10. Run the merge-gate freshness verifier and record the expected stale-evidence debt caused by the
    changed source/load identity. Do not weaken the verifier or rewrite the 30 archived runs here;
    schedule the manual six-scenario, five-run re-record before the next release.
11. Document the local-only lifecycle, baseline preregistration, activation versus trace consent, and
    the separate approval required for aggregate publication.

### Edge cases and stop conditions

- No supported cost proxy is not an error; persist `unavailable` and make cost benefit
  inconclusive.
- Stop if analysis would require raw prompts, command output, source excerpts, environment data,
  absolute paths, or arbitrary prose.
- Preflight/start failure selects Quality. Post-execution finalization failure never discards code,
  but pauses later Fast attempts until explicitly resolved.
- Aggregation refuses malformed, duplicate, incomplete, mismatched, unknown, symlinked, or live
  evidence; it never silently drops it. Only the separately confirmed discard path may inventory
  owned unknown/malformed regular files opaquely, and doing so makes Keep unavailable.
- Disablement stops new Fast selection but does not silently delete evidence.
- A missing or mismatched shipped protocol or insufficient Quality baseline blocks transition to
  active Fast; it never silently waives the comparator.
- Unknown or unproved-stale locks block mutation. Only explicit digest-bound reconciliation may
  remove a proven stale lock.
- Unknown entries remain untouched by every ordinary operation. In terminal review, guarded discard
  may delete them only as opaque members of the exact full-inventory digest after Change or Stop and
  explicit confirmation. Owned orphan temporary files otherwise remain blocking until their lock is
  proven stale and exact digest/owner reconciliation is explicitly confirmed.
- The helper never recursively targets `.effective-flow/` and never touches unrelated runtime
  state; recursive deletion is limited to the exact verified normal or discard tombstone after the
  atomic rename. Manual recursive deletion remains forbidden.

## Acceptance criteria

- [x] A minimal lifecycle creates and finalizes exactly one valid workflow record and no trace.
- [x] Baseline Quality, active Quality, and active Fast all reserve before their first measured spawn,
      retain start-time cohort/gate/ordinal, and finalize once through the unguessable capability.
- [x] Parallel packets use distinct `start-packet`/`finish-packet` capabilities and timing files;
      valid cross-process same-host/same-boot intervals produce bounded integer milliseconds, while
      epoch, reboot, host, clock-disagreement, crash, and lost-receipt cases close as unavailable
      without a wall-clock fallback or shared-record append. Concurrent Fast→Quality packets each
      keep one uninterrupted interval from the first Fast attempt through the terminal Quality
      continuation.
- [x] `configState` and persisted `generationState` remain separate: disablement or invalid
      configuration preserves the generation while stopping new measurement and Fast, every
      accepted `start` snapshots both axes, and configuration changes never activate, resume, or
      clear a generation.
- [x] A trace without explicit current-run consent writes nothing and exits nonzero.
- [x] Prohibited keys and values are absent from persisted bytes and error output.
- [x] Parallel runs cannot overwrite or merge identities; duplicate IDs fail.
- [x] Root, ignore/index, symlink, ownership, schema, and lock failures are fail-closed.
- [x] Baseline and pilot use identical classification, duration, cost, and outcome semantics; Fast
      cannot activate without the preregistered baseline gate.
- [x] The shipped protocol module is the sole executable authority; generation creation displays and
      confirms its exact version/digest, later operations reject drift, and the marked documentation
      mirror is build-validated. The build also proves its runtime projection of the WP1 state,
      fallback, and `pilotControlOutcome` policy equals the contract parsed from
      `src/shared/execution-profiles.md`. Its canonical digest covers that validated projection plus
      the adoption-gate registry and aggregate/evaluation algorithm versions.
- [x] `begin-review` atomically rejects new reservations, permits only captured in-flight records to
      finalize, accepts a suspended generation without clearing its causes, waits for all records to
      drain or reconcile before aggregation, operates even when configuration is disabled or
      invalid, requires explicit confirmation plus an expected generation/inventory digest, rejects
      stale state, and can never return the generation to admission.
- [x] A critical incident or incomplete finalization records its exact protocol-defined
      `pilotControlOutcome` and blocks Fast in the next run. `resume` accepts only a still-suspended
      generation with reconciled evidence and matching digests; it rejects every other generation
      state, including `review`.
- [x] Every incomplete reservation blocks Fast even without a suspension file; reconciliation may
      mark it only `abandoned`, never invent outcomes, and resume refuses any unresolved record or
      changed inventory/suspension digest.
- [x] Aggregate output contains a local private pre-suppression decision view, a suppression-
      preserving publication candidate, and a review digest binding both plus all evidence. Both use
      only approved fields and correctly compute compatible medians, rates, distributions,
      fallbacks, corrections, and outcomes; suppressed counts never leak into the public candidate.
- [x] Read-only `evaluate` requires exact generation/private-decision/review/protocol digests,
      revalidates that the current review binds the supplied decision view and unchanged evidence,
      state, parameters, and views, rejects every drift class, performs exact rational gate math,
      emits only `pass|fail|unavailable` plus `keepEligible`, persists nothing, and uses the fixed cost
      and correction denominators without choosing Change versus Stop.
- [x] Merge-gate observations provide comparable baseline/active period correction counts without
      any PR, workflow, repository, or per-run linkage, and provide anonymous required-check success
      for the same periods.
- [x] Report-mode observation tests reach both `reported-ready` and `reported-blocked`: readiness
      projects Phase 4 conditions 2–10 plus the existing waiver semantics, while condition 1 remains
      excluded only from measurement and still prevents an actual report-mode merge.
- [x] Disabled/invalid configuration and none/suspended/review generation states make observation a
      read-only no-op while preserving the generation; only enabled+baseline/active observation is
      reserved and finalized once. Failure preserves the current merge result but blocks later Fast
      through incomplete evidence or `evidence-gap` suspension and reports any unpersistable alert.
- [x] Reaching a workflow, observation, input, or total-storage cap records
      `pilotControlOutcome=capacity-exhausted`, persists the matching suspension when possible,
      rejects new measurement, and forces Quality without deleting accepted evidence.
- [x] Purge without confirmation or matching generation/digest changes nothing; confirmed purge
      atomically tombstones and removes only the exact review-digest-bound generation, supports idempotent
      tombstone retry, and leaves unrelated runtime bytes unchanged.
- [x] `discard-generation` is available before collection and accepts only disabled configuration,
      terminal review, verified containment/ownership, no writer/other-lock/symlink/special file, and
      a read-only value-free dry run returning bounded type counts, bytes, and the exact opaque full-
      inventory digest. Its confirmed `change|stop` call holds its own lifecycle lock, revalidates the
      digest, emits no aggregate, makes Keep unavailable, removes only its atomic discard tombstone,
      retries idempotently, and leaves unrelated runtime bytes unchanged.
- [x] Targeted inventory returns canonical `generationStatus=absent` plus zero matching tombstones
      after completed purge/discard, and tests already-absent completion, response-loss retry, and
      blocking mismatched/unknown tombstones.
- [x] Crash tests cover `start`, `finalize`, `aggregate`, `purge`, and `discard-generation`, including live, stale-provable,
      and unknown locks plus owned orphan temporaries and purge crashes before rename, after rename,
      and during tombstone removal, with equivalent discard crash boundaries.
- [x] All three runtime modules ship byte-identically to Claude, Codex, and portable; portable still
      cannot activate Fast.
- [x] The runtime-script inventory contains exactly 13 files after adding the three-module pilot
      family, and the distribution smoke invokes a harmless `protocol` operation in each target.
- [x] WP2's native model mappings, route classifications, base workers, five Claude Fast sidecars,
      Codex per-spawn rendering, and both native inventories remain unchanged; the isolated native
      baseline comparison passes.
- [x] The exact runtime-script inventory, distribution smoke suite, and execution-profile contract
      tests include the three pilot modules while continuing to reject workflow activation and
      portable native-profile metadata.
- [x] Spawned CLI tests pin positional operations, exact stdin/envelopes, stream separation,
      nonzero failures, value-free diagnostics, and filesystem effects; distribution tests pin
      registration and byte identity of all three runtime modules.

## Validation plan

```sh
node --test test/pilot-measurement.test.mjs test/pilot-measurement-cli.test.mjs test/pilot-measurement-contract.test.mjs test/pilot-measurement-git.test.mjs test/pilot-measurement-timing.test.mjs
node --test test/workflow-contracts.test.mjs test/runtime-state-safety-contract.test.mjs test/runtime-state-safety-git.test.mjs test/runtime-dir-migration-contract.test.mjs
node --test test/build-lib.test.mjs test/execution-profile-contract.test.mjs test/execution-profile-rendering.test.mjs
node --check src/scripts/pilot-measurement.mjs
node --check src/scripts/pilot-measurement-core.mjs
node --check src/scripts/pilot-measurement-protocol.mjs
node --check build.mjs
node scripts/compare-native-agent-baseline.mjs --base 7d1dcd5
pnpm agent:check
pnpm test
node build.mjs
pnpm test:distribution
pnpm eval merge-gate verify
```

## Test results

- The five pilot suites passed 75/75 tests, covering lifecycle, privacy, persisted-evidence
  validation, concurrency, crash recovery, capacity, aggregation/evaluation, and both deletion
  paths.
- The focused workflow/runtime-state set passed 337/337 tests and the build/profile set passed
  261/261 tests.
- The full `pnpm test` run passed 1,273/1,274 tests with one intentional skip and no failures.
- `pnpm agent:check`, all four syntax checks, the native-agent baseline comparison, `node build.mjs`,
  `pnpm test:distribution`, and `git diff --check` passed. The build measured `merge-gate` at
  2,314/2,320 lines.
- The direct offline merge-gate verifier passed and reported the expected release evidence debt:
  six scenarios with five stale runs each. Re-recording those 30 manual runs remains a separate
  pre-release task and is not a source-merge blocker.

## Implementation review

**Result:** Approved after corrections

- Independent Node.js and tooling/documentation reviews found and closed the lifecycle, schema,
  concurrency, capacity, privacy, aggregation, deletion, recovery, and documentation gaps discovered
  during implementation.
- The final closure review confirmed every must-fix finding closed. WP2 model mappings, worker
  profiles, activation surfaces, native inventories, and portable no-Fast behavior remain unchanged.
- No residual implementation finding or unassessed documentation surface remains.

## Assumptions and open points

- The initial field pilot accepts unavailable cost data but cannot claim the cost hypothesis when
  no comparable proxy exists.
- Real-run evidence remains local and untracked; merge-gate's archived eval corpus is not reused.
- WP1 is merged at `7d1dcd5` and WP2 at `32e6288`; implementation starts from a `develop` checkout
  containing both commits even though this planning checkout remains behind that baseline.
- The merge-gate archive is already stale after WP2. WP3 changes its load identity again but does
  not rewrite the 30 recorded runs; the release-gated re-record remains separate pre-release work.
- The workflow is the trusted authority for fresh project-setup resolution and explicit user
  interaction. The runtime helper validates and binds closed attestations and digests but cannot
  independently reconstruct the conversation that authorized them.

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

- **Critical — resolved state decision:** Runtime control has separate `configState` and persisted
  `generationState` axes. `review` is an atomic, terminal admission freeze with
  `not-evaluated + quality`; captured reservations may drain without relabelling. Disablement and
  invalid configuration preserve the generation. Suspension records the exact `baseline|active`
  return state, accepts no caller-selected target, and `resume` rejects after transition to review.
- **Critical — resolved authority decision:** A versioned runtime protocol module is the sole
  executable authority and digest source for measurement algorithms and thresholds in every target;
  its overlapping state, fallback, and pilot-control projection is build-validated against the
  canonical WP1 contract in `src/shared/execution-profiles.md`. The Markdown guide is an explanatory
  mirror, not another authority. Project generations stay local, and cross-project raw collection
  is excluded.
- **Critical — resolved deletion decision:** Each generation owns one directory that is atomically
  renamed to an ID/digest-bound tombstone before recursive deletion. Only that known tombstone may
  be retried, so partial purge cannot invalidate or strand a live generation.
- **Important — synchronized adoption interfaces:** The protocol ships exact adoption-gate math and
  a read-only private-decision/review-digest-bound `evaluate` operation before collection. Private
  pre-suppression inputs keep low-count gates evaluable without leaking them into the publication
  candidate. A separate value-free dry-run/full-inventory-digest `discard-generation` path can end
  retention after Change or Stop when malformed/unknown owned evidence prevents normal aggregation,
  without relaxing writer, lock, symlink, containment, or ownership guards.
- **Important — resolved evidence decision:** Merge-gate observation is reserved before gate work;
  failure never changes the current merge outcome but leaves incomplete evidence or an
  `evidence-gap` suspension that blocks later Fast until reconciliation and a legal suspended-state
  resume. Capacity exhaustion follows the same protocol-owned fail-closed control path.
- **Incorporated during deep review:** Every measured profile reserves and finalizes through one
  capability-bound workflow record; incomplete records block and reconcile without fabricated
  outcomes; clocks, ordinals, cost values, aggregate denominators, and merge-gate correction work
  are executable contracts; privacy has lexical schemas, hard caps, and value-free errors; owned
  crash temporaries are reconcilable; suspended generations can enter terminal review without an
  unsafe resume; and the CLI/distribution contract is exact.

### 2026-09-22 — Post-WP2 reconciliation

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------- | --------- | ---- |
| Architecture    | 0        | 0         | 0    |
| Security        | 0        | 0         | 0    |
| Data protection | 0        | 0         | 0    |
| Error cases     | 0        | 0         | 0    |
| Testability     | 0        | 0         | 0    |
| Scope           | 0        | 0         | 0    |
| Maintainability | 0        | 0         | 0    |

#### Findings

- **Critical — resolved policy-authority drift:** The merged WP1 Markdown contract and parser remain
  canonical. The new shipped protocol carries only a build-validated runtime projection of their
  overlapping closed values, so WP3 cannot silently fork the state, fallback, or pilot-control
  policy while adding measurement algorithms.
- **Important — resolved implementation baseline:** The plan now targets merged WP2 commit
  `32e6288`, references both archived predecessor plans, and removes the stale pre-WP1 working-state
  claim.
- **Important — resolved distribution scope:** The exact runtime-script inventory, distribution
  smoke path, build-lib reconciliation tests, and execution-profile no-activation guards now belong
  explicitly to WP3, while WP2's native mappings, sidecars, and inventories stay out of scope.
- **Important — resolved orchestration boundary:** The workflow owns fresh configuration resolution,
  current-run consent/confirmation, and the placement of packet timing calls; the CLI validates
  closed attestations, capability-bound cross-process timing receipts, continuity, bounds, and
  digests without pretending to prove conversation history or accepting shared packet writes.
- **Critical — resolved timing executability:** Separate `start-packet` and `finish-packet`
  operations own per-packet monotonic receipts, validate same-host/same-boot continuity using an
  internal wall-time/uptime cross-check, remove raw timing material at finalization, and turn every
  unprovable interval into unavailable rather than a fabricated wall-clock duration.
- **Important — resolved report classification:** `reported-ready` projects only Phase 4 conditions
  2–10 and the existing waiver semantics; completion-mode condition 1 still governs real merges but
  cannot make every report-mode observation look blocked.
- **Important — resolved validation drift:** The plan uses the current `pnpm eval merge-gate verify`
  interface and treats its 30-run re-record as release debt rather than silently folding a roughly
  three-hour manual evidence round into this source change.
- **Note — preserved workflow classification:** The work remains a Feature because it adds a local
  runtime subsystem and one measurement integration without changing product-code behavior outside
  the explicit pilot lifecycle.

## Open points

- No open points.
