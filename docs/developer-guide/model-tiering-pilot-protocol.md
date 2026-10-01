# Model-tiering pilot protocol

This guide documents the shipped, local measurement protocol for the Quality/Fast field pilot of
`build`. It explains the executable contract owned by
[`src/scripts/pilot-measurement-protocol.mjs`](../../src/scripts/pilot-measurement-protocol.mjs)
and the guarded operations implemented by
[`src/scripts/pilot-measurement-core.mjs`](../../src/scripts/pilot-measurement-core.mjs). The
protocol itself activates nothing: Guided setup starts a baseline only through a confirmed action,
`build` lets the helper activate that baseline automatically once its preregistered conditions
pass, `build` is the only workflow that records runs and requests Fast, `refactor` has not adopted
Fast, and portable execution remains Quality-only and unmeasured.

## Authority and drift control

The protocol module owns the versioned closed schemas, limits, timing method, aggregation method,
metric registry, adoption gates, enum vocabularies, and full protocol digest. Its separate policy
projection is reconciled against the marked tables in
[`src/shared/execution-profiles.md`](../../src/shared/execution-profiles.md); the JSON mirror below
deliberately excludes that WP1 policy projection and contains only measurement-specific fields.

`build.mjs` parses this marked block, requires exactly one fenced canonical-JSON line, and compares
it with `PILOT_MEASUREMENT_DOCUMENTATION_PROJECTION`. Editing prose cannot alter the executable
contract, and changing the protocol export without refreshing this mirror aborts the build.

<!-- pilot-measurement-protocol:start -->

```json
{"adoptionGates":[{"comparison":"gte","gate":"baseline-sample","metric":"eligibleBaselinePackets","threshold":{"denominator":1,"numerator":20}},{"comparison":"gte","gate":"fast-without-escalation","metric":"fastWithoutEscalation","threshold":{"denominator":5,"numerator":4}},{"comparison":"lt","gate":"fallback-frequency","metric":"fallbackOccurrences","threshold":{"denominator":1,"numerator":3}},{"comparison":"gte","gate":"workflow-completion-non-regression","metric":"workflowCompletionDelta","threshold":{"denominator":20,"numerator":-1}},{"comparison":"gte","gate":"validation-non-regression","metric":"validationSuccessDelta","threshold":{"denominator":20,"numerator":-1}},{"comparison":"lte","gate":"critical-review-non-regression","metric":"criticalReviewFindingDelta","threshold":{"denominator":1,"numerator":0}},{"comparison":"lte","gate":"quality-correction-non-regression","metric":"qualityCorrectionMedianDelta","threshold":{"denominator":1,"numerator":0}},{"comparison":"lte","gate":"merge-gate-non-regression","metric":"mergeGateCorrectionMedianDelta","threshold":{"denominator":1,"numerator":0}},{"comparison":"lte","gate":"cost-benefit","metric":"compatibleCostMedianRatio","threshold":{"denominator":5,"numerator":4}}],"aggregation":{"algorithmVersion":2,"baselineEligiblePacketMinimum":20,"baselineWindowMinimumDays":7,"caveat":"observational-unpaired","cohortMinimum":20,"exactRationalVersion":1,"groupingVersion":1,"metricStratumMinimum":5,"ordinalHalfMinimum":5,"periodObservationMinimum":5,"suppressionMinimum":5},"enums":{"checkOutcomes":["passed","failed","skipped","unavailable"],"cohorts":["baseline","pilot"],"completionStatuses":["completed","aborted","failed","abandoned"],"discardDecisions":["change","stop"],"evaluationResults":["pass","fail","unavailable"],"findingSeverities":["critical","important","note"],"findingStatuses":["open","resolved","accepted"],"harnessFamilies":["claude","codex"],"observationModes":["merge","report"],"observationOutcomes":["merged","reported-ready","reported-blocked","failed"],"packetAttempts":["started","not-started","unknown"],"requirementStatuses":["completed","incomplete","not-applicable"],"reviewStatuses":["completed","not-run","unavailable"],"validationStatuses":["passed","failed","not-required","unavailable"],"workflows":["build","refactor"]},"limits":{"bootEstimateToleranceMs":5000,"maxChecksPerTrace":256,"maxCliInputBytes":4194304,"maxCostValueDigits":39,"maxDetailedTraceBytes":4194304,"maxDurationMs":86400000,"maxFindingsPerTrace":256,"maxGateObservationsPerGeneration":10000,"maxPacketsPerWorkflow":128,"maxRawGenerationBytes":268435456,"maxRelativePathBytes":512,"maxRequirementsPerTrace":256,"maxTokenBytes":128,"maxWorkflowRecordBytes":1048576,"maxWorkflowRecordsPerGeneration":10000,"wallMonotonicToleranceMs":2000},"metricRegistry":{"attemptOutcomes":{"value":"closed packet counts by attempt: started, not-started, unknown"},"attemptedFastPackets":{"denominator":"all packets with a consumed Fast attempt and attempt other than not-started","numerator":"packets with selectedProfile fast and fallback none"},"cost":{"unavailable":"missing, incompatible, or unsupported attempt proxy, or attempt unknown","value":"canonical unsigned decimal totals grouped by compatible kind and unit"},"duration":{"unavailable":"closed started-packet intervals without continuity proof","value":"bounded integer milliseconds for continuity-valid intervals of started packets"},"fallbackRate":{"denominator":"all attempted-Fast packets with attempt started or unknown","numerator":"attempted-Fast packets with fallback other than none"},"fastWithoutEscalation":{"denominator":"all attempted-Fast packets with attempt started or unknown","numerator":"attempted-Fast packets with attempt started and without escalation"},"mergeGateCorrections":{"denominator":"completed observations grouped by mode and harness","numerator":"actual correction attempts by closed counter"},"packetInclusion":{"notStarted":"excluded from every packet metric and counted only in attemptOutcomes","started":"counted in every packet metric","unknown":"counted in packet, eligibility, attempted-Fast, fallback-outcome, and cost-unavailable counts; never a success; excluded from cost groups and duration"},"qualityCorrections":{"denominator":"completed workflows","numerator":"quality correction rounds"},"reviewFindings":{"denominator":"completed workflows","numerator":"findings by severity"},"validationSuccess":{"denominator":"all terminal records for which required validation applied","numerator":"required-validation records passed"},"workflowCompletion":{"denominator":"all terminal workflow records","numerator":"terminal workflow records completed"}},"schema":1,"timing":{"algorithmVersion":1,"bootContinuity":"wall-minus-uptime","bootEstimateToleranceMs":5000,"durationUnit":"integer-milliseconds","hostContinuity":"packet-salted-sha256-hostname","maxDurationMs":86400000,"wallMonotonicToleranceMs":2000},"version":"1.1.0"}
```

<!-- pilot-measurement-protocol:end -->

## Local lifecycle and operation boundary

The helper accepts one closed-schema JSON object on standard input and returns one stable JSON
envelope. Its operation roster covers protocol inspection, inventory, baseline creation,
activation, workflow and packet recording, anonymous gate observations, suspension, incident
recording, explicit resume, reconciliation, review, aggregation, evaluation, purge, and exceptional
generation discard. Mutation is guarded by repository identity, the runtime-state migration prerequisite,
protocol version and digest, generation capability, capacity limits, and per-generation locking.

`inventory` accepts `runtimeStateRoot` and `repositoryIdentity`, with an optional explicit
`generationId`. Without that identifier it discovers the current generation: zero directories
returns `generationStatus=absent`, exactly one returns `present` with the generation state, and more
than one fails closed as ambiguous. Baseline creation is namespace-serialized so a second current
generation cannot be admitted concurrently. Namespace ownership and the initial generation tree
are assembled in private staging directories and published only after the owner record or initial
`state.json` and required subdirectories are complete. The namespace `generation.lock` is likewise
published from a complete temporary file, so a new writer never exposes a partially written lock.

`begin-baseline` is also the recovery boundary for interrupted initialization. Under the exact
owned namespace it validates and removes incomplete namespace or generation staging, partial
pre-state generation trees, and orphan initial-state temporaries before retrying. A complete
initial generation left behind with a stale `begin-baseline` lock is returned idempotently after
the lock owner is proved stale; a live or unproved owner remains `LOCKED`. Legacy truncated
namespace locks are removed only after the owned namespace, regular-file identity, and unchanged
contents have been rechecked. An arbitrary final namespace without the exact `owner.json` is never
adopted or repaired and remains `UNSAFE_STORAGE`.

Generation state is `none`, `baseline`, `active`, `suspended`, or `review`. Configuration state is
not generation state: disabling `executionProfiles.fast.enabled` stops new measurement and Fast
admission but neither deletes evidence nor clears suspension. `review` is terminal for admission;
it freezes new reservations while allowing already captured work to finish or reconcile. Only a
suspended generation can resume, and only after explicit confirmation. Suspension and resume use a
durable transition marker. Every admission path rejects both that marker and a suspension record,
so a crash between state writes freezes the generation rather than briefly reopening it.

That freeze is recoverable. Before doing its own work, every control write — an automatic
suspension, `suspend`, `resume`, and `record-incident` — rolls a leftover suspension-reason marker
forward under the lifecycle lock: it merges the marker's reason into the suspension record and the
suspended state, then removes the marker. Generations outside `baseline`, `active`, and `suspended`
are skipped, and a leftover `suspend` or `resume` marker keeps its previous handling. For a present
generation, `inventory` reports `transitionPending: true` while any marker exists, so a frozen
admission is never invisible. The marker allowlist and the capacity-check exemption are derived
from the protocol's suspension reasons (plus `suspend`, and `resume` for the allowlist only).

When an automatic suspension cannot take the lifecycle lock, its unlocked fallback publishes a
suspension-reason marker atomically: it writes a temporary and publishes it exclusively, never over
an existing marker. It reports the control state as persisted only when the marker present
afterwards carries exactly the requested reason. Only such fallback markers carry an optional
`ownerPid`. A locked marker write likewise never replaces an existing marker. If the marker it
finds, before or at the exclusive publish, describes the same transition (same operation and
content, ignoring `ownerNonce` and `ownerPid`), the lock holder adopts it and completes the
transition. A marker for a different transition makes the lock holder fail `INVALID_STATE`, and
that marker survives to be rolled forward later. A staged
fallback-marker temporary left by a crash before publication is proved stale by
`reconcile-temporary` through that `ownerPid`: a live or unknown owner stays `LOCKED`, and a
provably stale one is removed. A partially written staged temporary still fails `UNSAFE_STORAGE`
for `reconcile-temporary`, but `inventory` only lists it as an orphan temporary and stays readable.

`activate` needs no confirmation: the confirmed `begin-baseline` is the consent. It takes the
common keys plus `configState`, `protocolVersion`, and `protocolDigest`, the last two read from
`protocol` as the caller-side drift check; passing `confirmation` fails `INVALID_PAYLOAD`. Inside
the lifecycle lock it checks, in this order (a held lifecycle or packet lock fails with a plain,
retryable `LOCKED` before these checks, and the generation stays in `baseline`):

1. Admission: a suspension, a transition marker, or a state other than `baseline` fails
   `INVALID_STATE`.
2. Busy: returns `not-ready` with `unmet: ["busy"]`. `busy` is never combined with another member.
3. Evidence health: a genuine fault still fails `INCOMPLETE_EVIDENCE` or `UNSAFE_STORAGE`.
4. Readiness: returns `not-ready` with `unmet` listing `window`, `sample`, or both, in that order.
5. Transition: returns `activated` with `generationState: "active"`.

Both successful results carry `generationId`; `not-ready` keeps `generationState: "baseline"`. The
helper is **busy** when the evidence inventory shows at least one incomplete workflow record, open
packet timing, or open gate observation, and no invalid member or orphan temporary. Reservations
carry no liveness data, so a crashed run's open reservation also reads as busy. For a workflow
record, `inventory`'s incomplete counts expose it and `reconcile-record` resolves it.

An orphaned open gate observation has no such path, because `reconcile-record` handles only
workflow records. It arises when `merge-gate` crashes between `start-gate-observation` and
`finalize-gate-observation`, or when releasing the lock fails after the reservation was written.
It keeps `activate` at `not-ready` with `unmet: ["busy"]` and later observations at `not-recorded`
with reason `busy`, and it makes `start` and `aggregate` fail `INCOMPLETE_EVIDENCE`. It is visible
only through `inventory`'s `incompleteCounts.gateObservations`. The only way out is `begin-review`
followed by `discard-generation`.

The readiness sample counts `wouldBeFastEligible` packets of **completed** baseline records only.
Aggregation's `eligibleBaselinePackets` counts eligible packets of **all terminal** baseline
records, apart from `not-started` packets. Completed records hold only `started` packets, so the
readiness count never includes a packet that aggregation excludes, but aggregation can count more.

A critical incident is recorded with `record-incident`, never by naming an outcome. It takes the
common keys, a `category` from `safety`, `data-integrity`, `authorization`, or `scope`, and
`affectedRecordIds` validated exactly as `suspend` validates them. The helper maps the category to
its `critical-*` control outcome, and `suspend` rejects those four outcomes with `INVALID_PAYLOAD`.
`record-incident` fails `NOT_FOUND` for a missing generation, takes the lifecycle lock itself, and
has no unlocked fallback, so a held lock returns a retryable `LOCKED` instead of writing behind a
concurrent `resume`. Under the lock it rejects `review` with `INVALID_STATE` and suspends a
`baseline`, `active`, or already `suspended` generation; a re-suspension keeps the stored
`resumeTo`. Success returns `generationState: "suspended"`, the `suspensionDigest`, the mapped
outcome, `controlStatePersisted: true`, and alert `none`.

Lifecycle locks serialize generation-wide mutations; capability-bound packet locks allow unrelated
packet timers to run in parallel. An exclusive lifecycle lock excludes every packet lock and vice
versa, so review, purge, and discard cannot race a new packet writer. Recovery accepts only the
closed lifecycle or packet lock grammar, validates the complete lock record and generation, proves
the owner PID stale, and rechecks the same inode and digest before removal. Atomic-write temporary
names contain the owning lock nonce; recovery authenticates that mapping and supports both lock
classes.

### Callers

Three sources call the helper, each through a lazy fragment that owns its exact payloads:

- **Guided setup block 10**
  ([`src/shared/setup-execution-profiles.md`](../../src/shared/setup-execution-profiles.md)) reads
  `inventory` and offers at most one confirmed action for the proven state: `begin-baseline` for
  `none`, and `resume` for a `suspended` generation whose evidence is healthy (every incomplete
  count zero, no orphan temporary). `begin-baseline` binds the `protocol` version and digest;
  `resume` binds the current inventory and suspension digests and restores only the stored prior
  state. Setup never calls `activate`. `review` is terminal and never resumes. A portable build
  offers no action.
- **`build`**
  ([`src/shared/pilot-measurement-workflow.md`](../../src/shared/pilot-measurement-workflow.md))
  reads `inventory` only with an enabled configuration on a native Claude Code or Codex build, and
  records only for a `baseline` or `active` generation. A portable build never calls the helper,
  whatever host runs it. In a `baseline` generation every measured run first reads `protocol` and
  calls `activate` without a confirmation: `activated` makes the reservation an `active` one, a
  `not-ready` result with an unmet `window` or `sample` keeps the run a baseline run, `not-ready`
  with `busy` keeps the baseline while the following `start` fails with `INCOMPLETE_EVIDENCE`, so
  the run normally proceeds as unmeasured Quality, a `LOCKED` retry that stays locked keeps the
  baseline, a genuine evidence fault makes the run unmeasured, and an ambiguous result is settled
  by a fresh `inventory`. The order is then `start` once, after every initial packet is classified
  and before the first implementation spawn; `start-packet` immediately before each packet's first
  spawn, which is the start-before-spawn invariant the `attempt` rule relies on, and
  `finish-packet` when its initial phase ends, including a failed Fast attempt and its single
  Quality continuation; and `finalize` exactly once at every exit. A packet that never spawned gets
  no timing operation and is recorded `not-started`; one still open when the run aborts is
  recorded `started` with an unavailable duration. Any in-flight reservation makes `start` fail
  with `INCOMPLETE_EVIDENCE`, so the run proceeds as unmeasured Quality. A critical incident is
  recorded through `record-incident` by its category. `LOCKED` is retried with the identical
  payload at most twice more, after about two and then about five seconds. A failed or impossible
  finalization keeps the product diff and suspends nothing on the workflow side: the helper
  persists `finalization-failed` itself on a mid-write fault. The run then offers a confirmed
  `reconcile-record` once in the same run. For a still-open reservation it writes the record
  `abandoned` with every packet `unknown`; for a record `finalize` already persisted before its
  fault, it only drains the timing receipts and returns the stored `completionStatus`, which the
  run reports. A declined or failed reconciliation leaves the record for `discard-generation` or `purge`. `build` never calls
  `begin-baseline`, `resume`, or `suspend`.
- **`merge-gate`** records the anonymous period observation described under "Evidence and
  consent".

## Evidence and consent

All owned state stays under
`<RUNTIME_STATE_ROOT>/.effective-flow/model-tiering-pilot/`, behind the repository's mandatory
runtime-state safety and migration checks. Minimal workflow records are bounded structured facts;
they exclude prompts, diffs, source, paths, command text and output, environment values, aliases,
URLs, and personal, repository, branch, task, PR, or session identifiers.

Detailed traces are a separate optional channel. A workflow can attest `detailOptIn: true` only
after the user explicitly requests detail in that current run. Consent is not a project setting,
is not stored as prose or identity, and never carries into a later run. Detailed traces remain
private inventory and do not feed metrics.

`merge-gate` observations form a third channel. Only a non-observer run during `baseline` or
`active` may reserve one; it records closed mode/outcome, harness, required-check summary, and the
three correction counters. It has no workflow-record, PR, repository, branch, check-name, comment,
finding, or path identifier and therefore supports anonymous period-level comparison only.

The reservation payload has exactly `runtimeStateRoot`, `repositoryIdentity`, `generationId`,
`configState`, `generationState`, `mode`, and `harnessFamily`. Disabled or invalid configuration,
or a `none`, `suspended`, or `review` generation, returns a successful read-only no-op:
`{status: "not-recorded", reason, pilotControlOutcome: "none"}`. Inside the lifecycle lock the
reservation checks admission first, so admission closed by a concurrent transition such as an
activation, or a state that differs from the caller's `generationState`, returns reason
`admission-closed`. It then applies the busy predicate from `activate`; a busy generation, or a
lock already held when the reservation tries to acquire it, returns reason `busy`. Neither result
persists anything or suspends the pilot. Only then does the evidence-health check run, where an
invalid member or orphan temporary still takes the `evidence-gap` path. A reservation
returns an opaque `observationId`, raw capability, cohort, and start ordinal; only the capability
hash—not the raw capability—is persisted alongside the opaque observation ID, cohort, and ordinal.
Finalization authenticates that capability and accepts exactly the identifier,
capability, closed terminal outcome, three correction counters, `checksReported`, and the typed
`requiredCheckCount` and `requiredChecksSatisfied` values in addition to the runtime/generation
binding. `requiredCheckCount` is taken from the final `pr-status-read` check list after its
deduplication, so it counts the latest run per check identity and never a superseded run. It is
exactly-once and response-loss-idempotent. Every post-reservation normal, controlled, or early
workflow exit calls it once. A pre-Phase-4 stop in report mode records `reported-blocked`
with unavailable check evidence; a reserved merge-mode run without a verified merge records
`failed` rather than silently dropping the observation.

If reservation or finalization fails, the helper classifies the failure as described under
[Failure semantics](#failure-semantics); a fault in either gate-observation operation persists an
`evidence-gap` suspension. The error envelope reports only the stable `pilotControlOutcome`,
`controlStatePersisted`, and value-free `alert` fields. Callers may claim durable control only
when the explicit outcome and persisted flag say so; they never infer it from an exit code, missing
receipt, or failed write.

## Packet attempts

Every stored final packet records `attempt` from the closed set `started`, `not-started`, and
`unknown`. The stored-record validator checks it against the record's `completionStatus`:

| `completionStatus`    | Allowed `attempt`          |
| --------------------- | -------------------------- |
| `completed`           | `started`                  |
| `aborted` or `failed` | `started` or `not-started` |
| `abandoned`           | `unknown`                  |

A `not-started` or `unknown` packet has unavailable duration and cost, `fallback: "none"`, and
`escalated: false`. `finalize` derives `attempt` from the packet's timing receipt:

| Receipt       | `completed` record                                       | `aborted` or `failed` record                                           |
| ------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Missing       | Mid-write fault (`NOT_FOUND`, tagged as a receipt fault) | `not-started`; a fallback, escalation, or cost fails `INVALID_PAYLOAD` |
| Still started | Mid-write fault (`INCOMPLETE_EVIDENCE`)                  | `started`, duration unavailable, receipt removed under the lock        |
| Finished      | `started` with duration                                  | `started` with duration                                                |

`reconcile-record` writes `unknown` for every packet of the abandoned record. A missing receipt is
evidence of "not started" only when the adopting workflow calls `start-packet` immediately before
every implementation spawn.

Metrics include packets by attempt:

- `not-started` packets are excluded from every packet field of a cohort.
- `unknown` packets count in `packetCount`, in `eligiblePacketCount` when would-be-Fast eligible, in
  `attemptedFastCount` and `fallbackOutcomes`, and in `costUnavailableCount`, which keeps the cost
  gate fail-closed. They never count as a success: they are removed from the
  `fastWithoutEscalation` numerator although they are stored with `escalated: false`. They are
  excluded from cost groups and duration fields.
- `attemptOutcomes` counts every cohort's packets by `started`, `not-started`, and `unknown`, so
  excluded packets stay visible. It appears in the private decision view only, not in the
  publication candidate.

## Aggregation, review, and removal

Aggregation is deterministic and versioned. Packet duration comes from a cross-process timing
receipt bound to the packet capability. A usable interval must preserve monotonic and wall-clock
continuity, the wall-minus-uptime boot estimate, and a packet-salted hostname hash; otherwise its
duration is unavailable. Finalization and reconciliation remove authenticated raw timing receipts,
and aggregation rejects a terminal record while any residual timing receipt remains.

Metrics use exact rational arithmetic. The baseline cost stratum is the would-be-Fast set that ran
on Quality; the pilot cost stratum is the attempted-Fast set. Cost is comparable only when both
strata have the required sample and one identical kind-and-unit group, with no unavailable proxy.
Observations are grouped by `mode` plus `harnessFamily`. Evaluation also enforces cohort, metric-
stratum, ordinal-half, and period-observation minima; insufficient or incompatible evidence yields
`unavailable`, never a favorable default. The protocol identifies the analysis as observational and
unpaired.

Review binds an inventory digest before aggregation. The private pre-suppression decision view is
used for evaluation. In the publication candidate, a fixed or dynamic distribution is visible only
when every member meets the suppression minimum; otherwise the entire distribution is replaced by
one suppression marker. A packet subset count is visible only when both that subset and its
complement within `packetCount` meet the suppression minimum. Duplicate child counts and ratios are
suppressed with their distribution; only enclosing totals remain visible because no child count is
then available for subtraction. The private and public metric views contain no `generationId`; that
binding exists only in the review wrapper. Evaluation and purge share one validator that requires
the current protocol, aggregation and grouping versions, recomputed private/public/review digests,
and unchanged evidence/state.
Neither view is published automatically, and even a suppressed candidate requires a separate
approval.

Normal purge requires the reviewed generation, a dry-run inventory, exact generation and review
digests, explicit confirmation, and no live or unknown writer. It atomically tombstones and removes
only the bound generation. Retry rescans the tombstone directory, rejects unknown or mismatched
names, and reports the observed remainder instead of assuming zero. Deletion retains exclusive
ownership until writers are excluded and the reviewed generation has disappeared.

`discard-generation` is narrower recovery for malformed or unknown owned evidence that prevents
normal aggregation. It requires disabled configuration, review state, a separate confirmation of
the value-free opaque inventory, and a `change` or `stop` decision. That inventory streams bounded
raw bytes, separately enforces the total generation limit, and hashes content without text
normalization. Discard emits no aggregate and cannot produce Keep. Manual recursive deletion is
outside the protocol.

## Failure semantics

The subsystem fails toward Quality. Protocol drift, unsafe storage, invalid state, incomplete
evidence, live or unproved locks, capacity exhaustion, or an unsafe runtime root prevents new Fast
admission. A recording or observation error does not undo successful product edits and does not
change the current merge result. If durable suspension cannot be proven, callers report a stable,
value-free alert rather than echoing rejected input. Storage and cardinality exhaustion use the
same crash-safe capacity suspension; only terminal or reserved workflow record files count toward
the workflow-record cap. The storage walk sums every entry that still exists; an entry that
vanishes mid-walk, such as a temporary a concurrent packet writer removes as it publishes, counts
as 0 bytes.

`finalize`, `start-gate-observation`, and `finalize-gate-observation` classify every failure,
validation included, into exactly one class:

| Class       | Codes                                                                                                                                                                                                    | Result                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Neutral     | `INVALID_PAYLOAD`, `AUTHENTICATION_FAILED`, `LOCKED`, `UNSAFE_RUNTIME_ROOT`, `MIGRATION_REQUIRED`, `PROTOCOL_DRIFT`, and `NOT_FOUND` from a generation or record read                                    | Retryable error with `pilotControlOutcome: "none"`; no suspension                                            |
| Passthrough | `CAPACITY_EXHAUSTED`                                                                                                                                                                                     | Unchanged; the capacity handler suspends exactly once                                                        |
| Fault       | `NOT_FOUND` from the timing-receipt read, and every other code, including `UNSAFE_STORAGE`, `WRITE_FAILED`, `INCOMPLETE_EVIDENCE`, and `INVALID_STATE`; a non-helper error is reported as `WRITE_FAILED` | Persists `finalization-failed` (`finalize`) or `evidence-gap` (gate observations), keeping the original code |

`finalize` checks that the generation exists before it takes its lock, so a missing generation is
neutral. Its classification runs after that lock is released, because persisting control state
takes the lifecycle lock itself; a `finalization-failed` suspension names the run as its affected
record. A retried `finalize` still drains the record, and the generation stays suspended until an
explicit `resume`. Routine lock contention therefore never suspends the pilot. The claim that
caller errors never suspend covers `INVALID_PAYLOAD` and `AUTHENTICATION_FAILED` only: an oversized
caller payload still exhausts capacity and suspends through the capacity handler.

When a fault's suspension cannot be persisted, the error reports
`pilotControlOutcome: "control-state-unpersistable"`, `controlStatePersisted: false`, and the
value-free alert, and keeps its original code. `record-incident` follows the same contract: a
neutral error before its lock, or a `review` rejection under it, reports outcome `none`; a failure
after the suspension write completed still reports the mapped outcome as persisted;
`CAPACITY_EXHAUSTED` passes through; and every other failure reports `control-state-unpersistable`.
Once a JSON object input is dispatched to one of these four operations, its errors carry the
control fields in the error envelope. Input that is not a JSON object fails `INVALID_PAYLOAD`, and
an unknown operation fails `INVALID_OPERATION`, before dispatch and without control fields.

The persisted protocol digest binds every generation. A local development generation created
before protocol `1.1.0` therefore fails the stored-state check with `UNSAFE_STORAGE`; no migration
is provided, because no released generation exists. Remove that generation's directory,
`<RUNTIME_STATE_ROOT>/.effective-flow/model-tiering-pilot/generations/<generationId>/`, by hand and
start a new baseline. This one-time development remedy sits outside the protocol, like any other
manual deletion.

## Further reading

- [Architecture](architecture.md#local-pilot-measurement-boundary) – separation between policy,
  representation, configuration, lifecycle state, and observations
- [Configuration](configuration.md#execution-profile-key) – tracked ownership versus
  runtime ownership
- [User privacy and retention guide](../user-guide/model-tiering-pilot.md) – operator-facing data,
  consent, review, and deletion contract
- [Risk-aware pilot policy](../adr/risk-aware-model-tiering-pilot-policy.md) – durable decision and
  tradeoffs
