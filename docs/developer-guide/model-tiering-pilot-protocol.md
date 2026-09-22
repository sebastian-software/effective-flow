# Model-tiering pilot protocol

This guide documents the shipped, local measurement protocol for the future Quality/Fast pilot.
It explains the executable contract owned by
[`src/scripts/pilot-measurement-protocol.mjs`](../../src/scripts/pilot-measurement-protocol.mjs)
and the guarded operations implemented by
[`src/scripts/pilot-measurement-core.mjs`](../../src/scripts/pilot-measurement-core.mjs). It does
not activate the pilot: setup exposes no baseline or activation action, `build` and `refactor`
contain no Fast-profile reference, and portable execution remains Quality-only.

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
{"adoptionGates":[{"comparison":"gte","gate":"baseline-sample","metric":"eligibleBaselinePackets","threshold":{"denominator":1,"numerator":20}},{"comparison":"gte","gate":"fast-without-escalation","metric":"fastWithoutEscalation","threshold":{"denominator":5,"numerator":4}},{"comparison":"lt","gate":"fallback-frequency","metric":"fallbackOccurrences","threshold":{"denominator":1,"numerator":3}},{"comparison":"gte","gate":"workflow-completion-non-regression","metric":"workflowCompletionDelta","threshold":{"denominator":20,"numerator":-1}},{"comparison":"gte","gate":"validation-non-regression","metric":"validationSuccessDelta","threshold":{"denominator":20,"numerator":-1}},{"comparison":"lte","gate":"critical-review-non-regression","metric":"criticalReviewFindingDelta","threshold":{"denominator":1,"numerator":0}},{"comparison":"lte","gate":"quality-correction-non-regression","metric":"qualityCorrectionMedianDelta","threshold":{"denominator":1,"numerator":0}},{"comparison":"lte","gate":"merge-gate-non-regression","metric":"mergeGateCorrectionMedianDelta","threshold":{"denominator":1,"numerator":0}},{"comparison":"lte","gate":"cost-benefit","metric":"compatibleCostMedianRatio","threshold":{"denominator":5,"numerator":4}}],"aggregation":{"algorithmVersion":1,"baselineEligiblePacketMinimum":20,"baselineWindowMinimumDays":7,"caveat":"observational-unpaired","cohortMinimum":20,"exactRationalVersion":1,"groupingVersion":1,"metricStratumMinimum":5,"ordinalHalfMinimum":5,"periodObservationMinimum":5,"suppressionMinimum":5},"enums":{"checkOutcomes":["passed","failed","skipped","unavailable"],"cohorts":["baseline","pilot"],"completionStatuses":["completed","aborted","failed","abandoned"],"discardDecisions":["change","stop"],"evaluationResults":["pass","fail","unavailable"],"findingSeverities":["critical","important","note"],"findingStatuses":["open","resolved","accepted"],"harnessFamilies":["claude","codex"],"observationModes":["merge","report"],"observationOutcomes":["merged","reported-ready","reported-blocked","failed"],"requirementStatuses":["completed","incomplete","not-applicable"],"reviewStatuses":["completed","not-run","unavailable"],"validationStatuses":["passed","failed","not-required","unavailable"],"workflows":["build","refactor"]},"limits":{"bootEstimateToleranceMs":5000,"maxChecksPerTrace":256,"maxCliInputBytes":4194304,"maxCostValueDigits":39,"maxDetailedTraceBytes":4194304,"maxDurationMs":86400000,"maxFindingsPerTrace":256,"maxGateObservationsPerGeneration":10000,"maxPacketsPerWorkflow":128,"maxRawGenerationBytes":268435456,"maxRelativePathBytes":512,"maxRequirementsPerTrace":256,"maxTokenBytes":128,"maxWorkflowRecordBytes":1048576,"maxWorkflowRecordsPerGeneration":10000,"wallMonotonicToleranceMs":2000},"metricRegistry":{"attemptedFastPackets":{"denominator":"all packets with a consumed Fast attempt","numerator":"packets with selectedProfile fast and fallback none"},"cost":{"unavailable":"missing, incompatible, or unsupported attempt proxy","value":"canonical unsigned decimal totals grouped by compatible kind and unit"},"duration":{"unavailable":"closed packet intervals without continuity proof","value":"bounded integer milliseconds for continuity-valid packet intervals"},"fallbackRate":{"denominator":"all attempted-Fast packets","numerator":"attempted-Fast packets with fallback other than none"},"fastWithoutEscalation":{"denominator":"all attempted-Fast packets","numerator":"attempted-Fast packets without escalation"},"mergeGateCorrections":{"denominator":"completed observations grouped by mode and harness","numerator":"actual correction attempts by closed counter"},"qualityCorrections":{"denominator":"completed workflows","numerator":"quality correction rounds"},"reviewFindings":{"denominator":"completed workflows","numerator":"findings by severity"},"validationSuccess":{"denominator":"all terminal records for which required validation applied","numerator":"required-validation records passed"},"workflowCompletion":{"denominator":"all terminal workflow records","numerator":"terminal workflow records completed"}},"schema":1,"timing":{"algorithmVersion":1,"bootContinuity":"wall-minus-uptime","bootEstimateToleranceMs":5000,"durationUnit":"integer-milliseconds","hostContinuity":"packet-salted-sha256-hostname","maxDurationMs":86400000,"wallMonotonicToleranceMs":2000},"version":"1.0.0"}
```

<!-- pilot-measurement-protocol:end -->

## Local lifecycle and operation boundary

The helper accepts one closed-schema JSON object on standard input and returns one stable JSON
envelope. Its operation roster covers protocol inspection, inventory, baseline creation,
activation, workflow and packet recording, anonymous gate observations, suspension and explicit
resume, reconciliation, review, aggregation, evaluation, purge, and exceptional generation
discard. Mutation is guarded by repository identity, the runtime-state migration prerequisite,
protocol version and digest, generation capability, capacity limits, and per-generation locking.

`inventory` accepts `runtimeStateRoot` and `repositoryIdentity`, with an optional explicit
`generationId`. Without that identifier it discovers the current generation: zero directories
returns `generationStatus=absent`, exactly one returns `present` with the generation state, and more
than one fails closed as ambiguous. Baseline creation is namespace-serialized so a second current
generation cannot be admitted concurrently.

Generation state is `none`, `baseline`, `active`, `suspended`, or `review`. Configuration state is
not generation state: disabling `executionProfiles.fast.enabled` stops new measurement and Fast
admission but neither deletes evidence nor clears suspension. `review` is terminal for admission;
it freezes new reservations while allowing already captured work to finish or reconcile. Only a
suspended generation can resume, and only after explicit confirmation. Suspension and resume use a
durable transition marker. Every admission path rejects both that marker and a suspension record,
so a crash between state writes freezes the generation rather than briefly reopening it.

Lifecycle locks serialize generation-wide mutations; capability-bound packet locks allow unrelated
packet timers to run in parallel. An exclusive lifecycle lock excludes every packet lock and vice
versa, so review, purge, and discard cannot race a new packet writer. Recovery accepts only the
closed lifecycle or packet lock grammar, validates the complete lock record and generation, proves
the owner PID stale, and rechecks the same inode and digest before removal. Atomic-write temporary
names contain the owning lock nonce; recovery authenticates that mapping and supports both lock
classes.

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
or a `none`, `suspended`, or `review` generation, returns a successful read-only no-op. A reservation
returns an opaque `observationId`, raw capability, cohort, and start ordinal; only the capability
hash—not the raw capability—is persisted alongside the opaque observation ID, cohort, and ordinal.
Finalization authenticates that capability and accepts exactly the identifier,
capability, closed terminal outcome, three correction counters, `checksReported`, and the typed
`requiredCheckCount` and `requiredChecksSatisfied` values in addition to the runtime/generation
binding. It is exactly-once and response-loss-idempotent. Every post-reservation normal, controlled,
or early workflow exit calls it once. A pre-Phase-4 stop in report mode records `reported-blocked`
with unavailable check evidence; a reserved merge-mode run without a verified merge records
`failed` rather than silently dropping the observation.

If reservation or finalization fails after mutation might have started, the helper tries to persist
incomplete evidence or an `evidence-gap` suspension. The error envelope reports only the stable
`pilotControlOutcome`, `controlStatePersisted`, and value-free `alert` fields. Callers may claim
durable control only when the explicit outcome and persisted flag say so; they never infer it from
an exit code, missing receipt, or failed write.

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
used for evaluation; the publication candidate suppresses each undersized cell independently. The
private and public metric views contain no `generationId`; that binding exists only in the review
wrapper. Evaluation and purge share one validator that requires the current protocol, aggregation
and grouping versions, recomputed private/public/review digests, and unchanged evidence/state.
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
the workflow-record cap.

## Further reading

- [Architecture](architecture.md#local-pilot-measurement-boundary) – separation between policy,
  representation, configuration, lifecycle state, and observations
- [Configuration](configuration.md#reserved-execution-profile-key) – tracked ownership versus
  runtime ownership
- [User privacy and retention guide](../user-guide/model-tiering-pilot.md) – operator-facing data,
  consent, review, and deletion contract
- [Risk-aware pilot policy](../adr/risk-aware-model-tiering-pilot-policy.md) – durable decision and
  tradeoffs
