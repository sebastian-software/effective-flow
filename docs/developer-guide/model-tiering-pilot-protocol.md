# Model-tiering pilot protocol

This guide documents the shipped, local measurement protocol for the Quality/Fast field pilot of
`build`, `refactor` and `fix` (protocol `1.3.0`). It explains the executable contract owned by
[`src/scripts/pilot-measurement-protocol.mjs`](../../src/scripts/pilot-measurement-protocol.mjs)
and the guarded operations implemented by
[`src/scripts/pilot-measurement-core.mjs`](../../src/scripts/pilot-measurement-core.mjs). The
protocol itself activates nothing: setup (Guided or Targeted) starts a baseline only through a confirmed action,
a measured `build`, `refactor` or `fix` run lets the helper activate that baseline automatically once its
preregistered conditions pass, and these three are the only workflows that record runs and request
Fast. Portable
builds are measured like native ones and may request Fast only on a qualified harness.

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
{"adoptionGates":[{"comparison":"gte","gate":"baseline-sample","metric":"eligibleBaselinePackets","threshold":{"denominator":1,"numerator":10}},{"comparison":"gte","gate":"fast-without-escalation","metric":"fastWithoutEscalation","threshold":{"denominator":5,"numerator":4}},{"comparison":"lt","gate":"fallback-frequency","metric":"fallbackOccurrences","threshold":{"denominator":1,"numerator":3}},{"comparison":"gte","gate":"workflow-completion-non-regression","metric":"workflowCompletionDelta","threshold":{"denominator":20,"numerator":-1}},{"comparison":"gte","gate":"validation-non-regression","metric":"validationSuccessDelta","threshold":{"denominator":20,"numerator":-1}},{"comparison":"lte","gate":"critical-review-non-regression","metric":"criticalReviewFindingDelta","threshold":{"denominator":1,"numerator":0}},{"comparison":"lte","gate":"quality-correction-non-regression","metric":"qualityCorrectionMedianDelta","threshold":{"denominator":1,"numerator":0}},{"comparison":"lte","gate":"merge-gate-non-regression","metric":"mergeGateCorrectionMedianDelta","threshold":{"denominator":1,"numerator":0}},{"comparison":"lte","gate":"cost-benefit","metric":"compatibleCostMedianRatio","threshold":{"denominator":5,"numerator":4}}],"aggregation":{"algorithmVersion":3,"baselineEligiblePacketMinimum":10,"baselineRecordMinimum":5,"caveat":"observational-unpaired","cohortMinimum":5,"exactRationalVersion":1,"groupingVersion":1,"metricStratumMinimum":5,"ordinalHalfMinimum":5,"periodObservationMinimum":5,"suppressionMinimum":5},"enums":{"checkOutcomes":["passed","failed","skipped","unavailable"],"cohorts":["baseline","pilot"],"completionStatuses":["completed","aborted","failed","abandoned"],"discardDecisions":["change","stop"],"evaluationResults":["pass","fail","unavailable"],"findingSeverities":["critical","important","note"],"findingStatuses":["open","resolved","accepted"],"harnessFamilies":["claude","codex"],"installKinds":["native","portable"],"modelCompliance":["verified","mismatch","unverified","not-applicable"],"observationModes":["merge","report"],"observationOutcomes":["merged","reported-ready","reported-blocked","failed"],"packetAttempts":["started","not-started","unknown"],"qualificationOutcomes":["qualified","unqualified","unproven"],"requirementStatuses":["completed","incomplete","not-applicable"],"reviewStatuses":["completed","not-run","unavailable"],"validationStatuses":["passed","failed","not-required","unavailable"],"workflows":["build","refactor","fix"]},"harnessQualification":{"fastMappingIdentity":"sha256-hex-of-canonical-fast-mapping-per-harness","file":"fast-harness-qualification.json","location":"installed-skill-scripts-directory","portableFastRequires":"qualified-in-generation-snapshot-and-snapshot-identity-equals-installed","recordKey":["installKind","harnessFamily"],"schemaVersion":1,"unavailable":"absent, malformed, or unreadable means profile-unavailable"},"limits":{"bootEstimateToleranceMs":5000,"maxChecksPerTrace":256,"maxCliInputBytes":4194304,"maxCostValueDigits":39,"maxDetailedTraceBytes":4194304,"maxDurationMs":86400000,"maxFindingsPerTrace":256,"maxGateObservationsPerGeneration":10000,"maxPacketsPerWorkflow":128,"maxRawGenerationBytes":268435456,"maxRelativePathBytes":512,"maxRequirementsPerTrace":256,"maxTokenBytes":128,"maxWorkflowRecordBytes":1048576,"maxWorkflowRecordsPerGeneration":10000,"wallMonotonicToleranceMs":2000},"metricRegistry":{"admissionChanged":{"value":"a Fast packet that fell back to Quality before its spawn consumed no Fast attempt, is no escalation, and stays out of every attempted-Fast metric"},"attemptOutcomes":{"value":"closed packet counts by attempt: started, not-started, unknown"},"attemptedFastPackets":{"denominator":"all packets with a consumed Fast attempt, attempt other than not-started, and modelCompliance other than mismatch","numerator":"packets with selectedProfile fast and fallback none"},"cost":{"unavailable":"missing, incompatible, or unsupported attempt proxy, or attempt unknown","value":"canonical unsigned decimal totals grouped by compatible kind and unit"},"duration":{"unavailable":"closed started-packet intervals without continuity proof","value":"bounded integer milliseconds for continuity-valid intervals of started packets"},"fallbackRate":{"denominator":"all attempted-Fast packets with attempt started or unknown","numerator":"attempted-Fast packets with fallback other than none"},"fastWithoutEscalation":{"denominator":"all attempted-Fast packets with attempt started or unknown","numerator":"attempted-Fast packets with attempt started and without escalation"},"mergeGateCorrections":{"denominator":"completed observations grouped by mode and harness","numerator":"actual correction attempts by closed counter"},"minimumCounting":{"baselineEligiblePackets":"eligible packets of completed baseline records","baselineRecords":"completed baseline records, except records whose only first gate reason is correction-pass","cohortRecords":"terminal records of the cohort, except records whose only first gate reason is correction-pass"},"modelCompliance":{"disclosed":"Fast packets with modelCompliance unverified stay in the metrics and are counted","excluded":"Fast packets with modelCompliance mismatch leave every Fast metric, duration, and cost and are counted only in modelComplianceOutcomes"},"ordinalHalves":{"gating":"an unavailable split never makes an adoption gate unavailable","value":"chronological halves by record ordinal, reported for information only"},"packetInclusion":{"notStarted":"excluded from every packet metric and counted only in attemptOutcomes","started":"counted in every packet metric","unknown":"counted in packet, eligibility, attempted-Fast, fallback-outcome, and cost-unavailable counts; never a success; excluded from cost groups and duration"},"qualityCorrections":{"denominator":"completed workflows","numerator":"quality correction rounds"},"reviewFindings":{"denominator":"terminal records whose review ran (review status completed)","numerator":"critical and important findings by severity"},"validationSuccess":{"denominator":"all terminal records for which required validation applied","numerator":"required-validation records passed"},"workflowCompletion":{"denominator":"all terminal workflow records","numerator":"terminal workflow records completed"}},"schema":1,"timing":{"algorithmVersion":1,"bootContinuity":"wall-minus-uptime","bootEstimateToleranceMs":5000,"durationUnit":"integer-milliseconds","hostContinuity":"packet-salted-sha256-hostname","maxDurationMs":86400000,"wallMonotonicToleranceMs":2000},"version":"1.3.0"}
```

<!-- pilot-measurement-protocol:end -->

### Quality-mapping identity

Every Quality packet runs on the role's `deep` model tier, so a change of those values would
silently mix two Quality populations in one generation. Protocol `1.2.0` therefore binds the
**Quality-mapping identity** into `protocolSource`, and so into the protocol digest:
`PILOT_MEASUREMENT_QUALITY_MAPPING_IDENTITY` is the SHA-256 digest (`sha256:` plus hex) of the
canonical JSON of `MODEL_TIER_MAPPINGS.deep` in `build.mjs`, covering both harnesses. It is a digest
rather than the values because the portable target forbids provider model names in copied scripts.
The module is copied byte for byte and cannot import `build.mjs`, so the build computes the
digest from the mapping and fails when it differs. Changing the `deep` values then requires a new
protocol version and a migration. The JSON mirror above projects only measurement-specific fields
and carries the version, not the identity; the policy side states the rule in
[`src/shared/execution-profiles.md`](../../src/shared/execution-profiles.md).

### Harness qualification

A portable Fast request rests on a build-validated record per install kind and harness family,
shipped as
[`src/scripts/fast-harness-qualification.json`](../../src/scripts/fast-harness-qualification.json)
to the installed `scripts/` directory (`harnessQualification` in the mirror above). Each record
states the probe outcome (`qualified`, `unqualified` or `unproven`), the host version as
major.minor, the probe date and the **Fast-mapping identity**: the SHA-256 of the canonical
sorted-key JSON of that harness's `AGENT_PROFILE_MAPPINGS.fast` values. The build fails when a
record's identity differs from the current mapping. The helper reads the file only from the
installed skill root; an absent, malformed, oversized or unreadable file means
`profile-unavailable`.

`begin-baseline` snapshots the records and the identity into the generation state, and `inventory`
returns both the installed records and the snapshot under `qualification`, so a workflow never
parses the file. `start` and `start-packet` reject `selectedProfile: fast` with `PROFILE_UNAVAILABLE`
for a portable harness that is not `qualified` in the snapshot or whose snapshot identity differs
from the installed record's. A harness that qualifies later needs a new generation. The host
version is not checked before a spawn; `modelCompliance` checks it per packet, so a host update
never forces a new generation. State persisted under `1.2.0` has no snapshot.

The records of 2026-11-21: Claude Code portable `qualified` (host 2.1, child ran
`claude-sonnet-5-5` at `medium` under T3 Code); Codex portable `unproven`, because the probe could
not run. Native records keep the sidecar rendering and need no probe.

## Local lifecycle and operation boundary

The helper accepts one closed-schema JSON object on standard input and returns one stable JSON
envelope. Its operation roster covers protocol inspection, inventory, baseline creation,
activation, workflow and packet recording, anonymous gate observations, suspension, incident
recording, explicit resume, reconciliation, orphaned-reservation listing and abandonment, review, aggregation, evaluation, purge, and exceptional
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
from the protocol's suspension reasons plus `quality-mapping-changed`, the reason of the protocol
migration below (and `suspend`, and `resume` for the allowlist only).

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
4. Readiness: returns `not-ready` with `unmet: ["sample"]` unless the generation holds at least
   `baselineEligiblePacketMinimum` (10) eligible packets in at least `baselineRecordMinimum` (5)
   completed baseline records. There is no calendar window. Records whose only first gate reason is
   `correction-pass` count toward neither.
5. Transition: returns `activated` with `generationState: "active"`.

Both successful results carry `generationId`; `not-ready` keeps `generationState: "baseline"`. The
helper is **busy** when the evidence inventory shows at least one incomplete workflow record, open
packet timing, or open gate observation, and no invalid member or orphan temporary. Activation
therefore needs an idle generation, while recording does not (see "Overlap and admission").
`inventory` names the cause in `busyCause`: `open-reservations` while a workflow reservation or
packet timing is open, otherwise `open-observations` while a gate observation is open, and `null`
when nothing is open or the evidence holds an invalid member or orphan temporary. Its incomplete
counts expose the open members. A timing receipt that a terminal record kept, because its
`finalize` or `reconcile-record` faulted after persisting the record, counts as an open packet
timing when it names a packet of that record that did not stay `not-started`, so a fresh
`inventory` still succeeds and `reconcile-record` can drain it. Until then a new `start` or
`start-gate-observation` that admission would otherwise accept fails `INCOMPLETE_EVIDENCE`, and
`resume`, `activate`, and `aggregate` stay closed as for any open timing. A receipt of an unknown
run or packet, a never-started packet, or a mismatched reservation still fails every inventory
with `INCOMPLETE_EVIDENCE`.

A crashed run's open reservation reads as busy like a live one. Only the owning run can finalize it
or reconcile it, because `reconcile-record` needs that run's transient `workflowCapability`; no
later run or setup holds it. A later `effective-flow cleanup` session closes it through
`abandon-reservation` (see "Orphaned reservations"); the only other exit is `begin-review` followed
by `discard-generation` with the pilot disabled (`configState: "disabled"`), which loses the
generation. `purge` is no exit: it needs a reviewed aggregate, and `aggregate` fails
`INCOMPLETE_EVIDENCE` while anything is open.

### Orphaned reservations

Two operations serve `cleanup`
([`src/shared/cleanup-pilot-reservations.md`](../../src/shared/cleanup-pilot-reservations.md)),
which holds no run capability:

- **`list-reservations`** is read-only and takes `runtimeStateRoot`, `repositoryIdentity` and an
  optional `generationId`. It returns `generationStatus` (`absent` lists nothing), `protocolCurrent`
  (an earlier protocol's generation lists nothing), `staleAfterHours` (24) and `reservations`. Each
  item carries an opaque `itemId` (a digest of generation and run, naming no run), `state`,
  `workflow`, `reservedAt`, `ageMs`, `stale` (older than 24 hours), `liveness`, `proof` and the
  `recordDigest` an abandonment binds to. An open reservation is `state: "open"` with `proof`
  `process-dead` only for `dead`, otherwise `null`. An abandoned record whose timing receipts were
  not all drained (the abandonment faulted or crashed after writing it) is listed as
  `state: "pending-drain"` with `proof: "already-abandoned"`, `reservedAt`, `ageMs` and `liveness`
  `null` and `stale` `false`; its leftover receipts would otherwise fail every later `start` and
  `start-gate-observation` with `INCOMPLETE_EVIDENCE`. Open gate observations carry no owner or
  time fields and are never listed.
- **`abandon-reservation`** takes the common keys plus `itemId`, `recordDigest`,
  `confirmation: true` and exactly one basis: `proof: "process-dead"`,
  `proof: "already-abandoned"` or `confirmStale: true`. Under the lifecycle lock it finds the item
  again and finalizes an open reservation as `abandoned` (every attempt `unknown`, a receipt's
  `admission-changed` fallback kept, transient fields dropped, that run's timing receipts drained)
  through the same writer as `reconcile-record`; it writes no other record. It returns `abandoned`
  with its `basis` (`process-dead` or `stale`). For a record it already abandoned it is idempotent:
  whatever the basis and `recordDigest`, it only drains that run's remaining receipts by
  membership, as `reconcile-record` does behind a terminal record, and returns `abandoned` with
  `basis: "already-abandoned"`. It fails `NOT_FOUND` for an unknown or otherwise closed item,
  `STALE_REVIEW` when an open record changed since the listing, `INVALID_STATE` when the chosen
  basis no longer holds (also `already-abandoned` for a record still open), `PROTOCOL_DRIFT` for an
  earlier protocol's generation, `INVALID_PAYLOAD` without `confirmation: true` or with both or
  neither basis, and a retryable `LOCKED` when the lock is held. It holds the lifecycle lock and
  stages its writes under the `reconcile-record` operation name, so a 1.3.0 helper of an earlier
  release (1.77.0) that meets the held lock or a crashed write's temporary reads it as an ordinary
  reconciliation, never as unsafe storage.

The liveness rule derives from the reservation's salted `ownerDigest` without storing any process
id, and the stored reservation keeps exactly the 1.3.0 shape, so an earlier 1.3.0 helper sharing the
runtime state still accepts it. The host binding lives inside the opaque `ownerSalt`: 24 random
bytes (32 base64url characters), then a 16-byte host binding (22 base64url characters), then up to
two 12-byte ancestor digests (16 characters each). The owner is the parent of the helper's parent,
the tool's shell; a helper started through a forking wrapper (`timeout`, `sh -c`, a sandbox
launcher) would record the wrapper's short-lived shell instead, so the salt also binds the owner's
parent and that parent's parent, each a truncated digest of the random part, the host identity, its
pid and its start time. An ancestor that is unreadable, lacks a start time, is init, or runs in
another pid namespace ends the chain; the salt then binds fewer, never a guessed one. The host
binding is the first 16 bytes of the digest of the random part, the owner's host identity and the
ancestor digests; the identity is the host name, the kernel boot id
(`/proc/sys/kernel/random/boot_id`) and the owner's pid-namespace inode (`/proc/<pid>/ns/pid`), or
null when any part was unreadable or `/proc/self` does not name the helper's own pid (a procfs of
another pid namespace). The salt of 54 to 86 characters keeps the `[A-Za-z0-9_-]{32,128}` form every
1.3.0 helper validates. A later session recomputes the binding from its own host name, boot id, pid
namespace (`/proc/self/ns/pid`) and `/proc/self`. Liveness is `unknown` when the salt carries no
binding (a 32-character salt from a release before the check, or any other length), the binding
names another host identity (another machine of the same name, another boot, or a container with
its own pid namespace) or any part is unreadable on either side, the owner could not be resolved,
or procfs hides processes or a process start time is unreadable. Proof therefore needs Linux
`/proc`. Otherwise it is `alive` only when a live process hashes to the owner digest; with the
owner gone it is `unknown` while a live process hashes to a recorded ancestor digest, since that
ancestor may be the session a wrapper ran under or only a long-lived parent of a session that
ended; and it is `dead` only when neither does (the owner and every recorded ancestor are gone or
their pids were reused with other start times). An owner recorded without a start time is `alive`
while any process holds its pid. The workflow fragment still requires calling the helper directly
from the tool's shell, so the owner is the session itself. The proof needs the session and its
recorded parent processes gone, so after a crash under a still-running terminal or supervisor the
record usually shows `unknown` and the 24-hour path applies. Two residuals remain, both for a
wrapped call contrary to the direct-invocation rule: it can still read `dead` while the session
runs when the ancestor chain ends at a pid-namespace boundary or at init, or when more wrapper
levels lie between the helper and the session than the two recorded parents. Only `dead` offers
the `process-dead` proof; every other open reservation can be abandoned only through
`confirmStale` after 24 hours, and such a reservation may still belong to a live long run, which
then records nothing more. Its
`start-packet` and `finish-packet` then fail `NOT_FOUND` after its workflow capability
authenticated (a packet without a receipt fails `INVALID_STATE` instead, so `NOT_FOUND` names only
a closed or missing record), and its own `finalize` finds the terminal record, drains its receipts
and returns `abandoned` instead of `finalized`. A 1.77.0 helper sharing the state reports
`finalized` for such a record instead: the stored abandoned record stays correct, only that run's
report differs. Terminal writes strip the salt with the other transient fields.

The observation limitation stays: an open `merge-gate` observation carries no owner proof, is never
listed, and clears only by `begin-review` followed by `discard-generation`.

An open gate observation is `open-observations`. `merge-gate` under T3 Code keeps its observation
open across `SUSPENDED host-pr-watch` re-dispatches, so a waiting gate run blocks activation until
it finalizes the observation at its end; `reconcile-record` handles only workflow records. An
orphan arises when `merge-gate` crashes between `start-gate-observation` and
`finalize-gate-observation`, or when releasing the lock fails after the reservation was written.
It keeps `activate` at `not-ready` with `unmet: ["busy"]` and makes `aggregate` fail
`INCOMPLETE_EVIDENCE`; it no longer blocks `start` or later observations. It is visible through
`busyCause` and `incompleteCounts.gateObservations`. Its only way out is the same `begin-review`
followed by `discard-generation`.

The readiness sample and aggregation's `eligibleBaselinePackets` count alike: the
`wouldBeFastEligible` packets of **completed** baseline records. Aggregation reports the metric
only once at least `baselineRecordMinimum` (5) completed baseline records count, records whose only
first gate reason is `correction-pass` excluded; below that it is unavailable.

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

### Overlap and admission

`start` and `start-gate-observation` do not fail because another record or observation is open.
Under the lifecycle lock, each new start sets a transient `overlapFlag` on every open workflow
reservation, and a new reservation flags itself when any other reservation or observation is open;
`finalize` ORs the flag into the terminal record's `overlapped`. Observations are never flagged.
Nothing stores a reference, ordinal or counter of another record or observation, so overlap is an
unlinked confounder. `start-gate-observation` returns `not-recorded` with reason `busy` only when
the lifecycle lock is held.

An overlapping record keeps its `eligible` and `fast` classification. `start-packet` of a `fast`
packet fails closed when admission is closed: a suspension, a transition marker, an incident, a
generation state that differs from the reservation's, a **foreign** incomplete record, or foreign
leftover evidence: another run's timing receipt (also one a terminal record kept because its
`finalize` or `reconcile-record` faulted before removing it), an orphan temporary file, or an
invalid records member. A lock staging file counts only once the writer its staged record names is
provably gone, the proof `reconcile-temporary` uses; a staging file without a valid record counts
too, so a live writer caught between creating and writing it briefly closes admission. The run's
own reservation and timing receipts and an open gate observation do not count. It writes nothing
and consumes no Fast attempt, and the workflow runs that packet Quality with the pre-spawn fallback
`admission-changed`.

A `start-packet` re-sent after a lost response finds its Fast receipt already written, but no
child has spawned yet, so it checks admission and the Fast profile again before acknowledging the
Fast start. If either closed in the meantime, it fails `ADMISSION_CHANGED` or `PROFILE_UNAVAILABLE`
and writes nothing, and the workflow re-sends it once with the fallback `admission-changed`. That
call replaces the unspawned Fast receipt with a fresh `admission-changed` receipt, which `finalize`
then matches against the packet's fallback. Like a first fallback call it does not recheck
admission, so it succeeds even if admission reopened after the refused retry; it fails
`INVALID_STATE` only for a receipt that is already finished or already a fallback.

Open reservations carry transient fields that exist for the overlap and the orphan check: a
reservation-salted hash of the host name, process id and process start time, the salt itself with
its folded host binding and ancestor digests, the reservation time and the overlap flag. Every terminal write
(`finalize`, `reconcile-record`, `abandon-reservation`) strips them.

### Callers

Setup (Guided and Targeted), the three adopting workflows, `cleanup` and `merge-gate` call the helper, each through a lazy
fragment that owns its exact payloads:

- **Setup block 10** (Guided advanced settings or a Targeted request)
  ([`src/shared/setup-execution-profiles.md`](../../src/shared/setup-execution-profiles.md)) reads
  `inventory` and offers at most one confirmed action for the proven state: `begin-baseline` for
  `none`, and `resume` for a `suspended` generation whose evidence is healthy (every incomplete
  count zero, no orphan temporary). `begin-baseline` binds the `protocol` version and digest;
  `resume` binds the current inventory and suspension digests and restores only the stored prior
  state. Setup never calls `activate`. `review` is terminal and never resumes. A portable build
  offers the same actions; it reports each harness family's installed qualification and the
  `busyCause`.
- **`build`, `refactor` and `fix`**
  ([`src/shared/pilot-measurement-workflow.md`](../../src/shared/pilot-measurement-workflow.md))
  name themselves in `start`'s `workflow` field and follow the same order; `refactor` classifies
  its packets only after its Phase 2 baseline and `fix` only after its failing-test step. Each reads `inventory` only with an enabled configuration and a harness family, and records
  only for a `baseline` or `active` generation. The harness family comes only from the parameter shape
  of the spawn tool the run holds (Claude Code's Agent tool is `claude`, a Codex spawn is `codex`); a
  client surface such as T3 Code is no signal, and without the signal the run is unmeasured Quality.
  `start` carries `installKind` (from the build target) and `harnessFamily`. A run whose trusted
  caller region carries `Caller: iterate` is measured, runs Quality and records `correction-pass` at
  gate priority 0. Before `finish-packet`, a portable Fast packet whose attempt started a child
  takes its `modelCompliance` from `model-selection verify`; a native Fast attempt reports
  `unverified`, the only value the helper accepts for it. A `fast` reservation whose attempt left no
  child to verify (spawn rejected before any child started, or Quality from the first spawn after an
  unpersisted incident) also reports `unverified`, since `finish-packet` accepts `not-applicable`
  for a `fast` reservation only with an `admission-changed` receipt; a packet not reserved as `fast`
  reports `not-applicable`. In a `baseline` generation every measured run first reads `protocol` and
  calls `activate` without a confirmation: `activated` makes the reservation an `active` one, a
  `not-ready` result with an unmet `sample` keeps the run a baseline run, `not-ready` with `busy`
  keeps the baseline and the run recording, a `LOCKED` retry that stays locked keeps the
  baseline, a genuine evidence fault makes the run unmeasured, and an ambiguous result is settled
  by a fresh `inventory`. The order is then `start` once, after every initial packet is classified
  and before the first implementation spawn; `start-packet` immediately before each packet's first
  spawn, which is the start-before-spawn invariant the `attempt` rule relies on, and
  `finish-packet` when its initial phase ends, including a failed Fast attempt and its single
  Quality continuation; and `finalize` exactly once at every exit. A packet that never spawned gets
  no timing operation and is recorded `not-started`; one still open when the run aborts is
  recorded `started` with an unavailable duration. An in-flight reservation of another run no longer blocks `start`; it marks both
  records `overlapped`. A critical incident is
  recorded through `record-incident` by its category. After any critical incident, persisted or
  not, no packet that has not yet spawned attempts Fast; a reserved Fast packet that runs Quality
  for that reason finalizes as `scope-incident` with `escalated: true`, so it is charged to Fast
  rather than counted as a Fast success. Once the helper persisted the suspension, that packet's
  `start-packet` meets `ADMISSION_CHANGED` instead and it finalizes `admission-changed`: the
  receipt binds the fallback, and the persisted suspension already charges the incident durably. An incident the helper cannot persist yields only a
  value-free alert and one same-run ask to retry it; otherwise the run reports that nothing durable
  keeps later runs off Fast and that setup's `Disable` is the confirmed recovery path.
  `LOCKED` is retried with the identical payload at most twice more, after about two and then
  about five seconds; `finalize`, which overlapping runs contend for at their ends, is retried at
  most five times more, after about two, five, ten, twenty, and thirty seconds. A failed or impossible
  finalization keeps the product diff and suspends nothing on the workflow side: the helper
  persists `finalization-failed` itself on a mid-write fault. The run then offers a confirmed
  `reconcile-record` once in the same run. For a still-open reservation it writes the record
  `abandoned` with every packet `unknown`; for a record `finalize` already persisted before its
  fault, it only drains the timing receipts and returns the stored `completionStatus`, which the
  run reports. For a Fast packet whose receipt proves the pre-spawn `admission-changed` fallback,
  the abandoned record keeps that fallback with `modelCompliance: "not-applicable"`. A declined or
  failed reconciliation leaves the record until the generation is discarded.
  `refactor` takes the record's `validation` from its last Phase 5 run alone, so an unchanged
  pre-existing failure stays `failed`, and sets `completionStatus` to `completed` only after its
  Phase 6 comparison proves no regression, to `aborted` after a replanning stop or a user abort,
  and to `failed` after an incident that ends the run, a missing outcome, an exhausted regression
  loop, or a required check Phase 5 could not repeat; an incident the run survives leaves the
  status to the comparison. Neither workflow calls `begin-baseline`, `resume`, or `suspend`.
- **`cleanup`**
  ([`src/shared/cleanup-pilot-reservations.md`](../../src/shared/cleanup-pilot-reservations.md))
  lists open reservations with `list-reservations` and, after a dry run and one confirmation per
  item, closes each with `abandon-reservation`; it reports only operation, error code and outcome.
- **`merge-gate`** records the anonymous period observation described under "Evidence and
  consent", also under T3 Code. Its `harnessFamily` follows the same rule as above, and the
  observation carries `installKind`. Under T3 Code the observation survives
  `SUSPENDED host-pr-watch` re-dispatches through the gate run's wisdom file and is finalized once at
  the end of the gate run.

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
`active` may reserve one; it records closed mode/outcome, harness, install kind, required-check summary, and the
three correction counters. It has no workflow-record, PR, repository, branch, check-name, comment,
finding, or path identifier and therefore supports anonymous period-level comparison only.

The reservation payload has exactly `runtimeStateRoot`, `repositoryIdentity`, `generationId`,
`configState`, `generationState`, `mode`, `harnessFamily`, and `installKind`. Disabled or invalid configuration,
or a `none`, `suspended`, or `review` generation, returns a successful read-only no-op:
`{status: "not-recorded", reason, pilotControlOutcome: "none"}`. Inside the lifecycle lock the
reservation checks admission first, so admission closed by a concurrent transition such as an
activation, or a state that differs from the caller's `generationState`, returns reason
`admission-closed`. A lock already held when the reservation tries to acquire it returns reason
`busy`; an open record or observation of another run no longer does. Neither result persists
anything or suspends the pilot. Only then does the evidence-health check run, where an
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

A delegated `merge-gate` run that returns `BLOCKED-USER` before a verified merge finalizes its
reservation as `reported-blocked` in either mode, and the caller's re-dispatch reserves afresh.
One logical gate run can therefore leave several observations, each counted on its own in the
per-mode medians of the correction counters. A `SUSPENDED host-pr-watch` return under T3 Code is
not such an ending: the observation continues across it.

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

Each Fast packet also records `modelCompliance`: `verified` when every observed turn ran on the
Fast alias and not on the `deep` model, with the Fast effort, on a host whose major.minor equals
the installed record's; `mismatch` when a check fails; `unverified` when no observation exists
(always the case for a native Fast attempt, and for a `fast` reservation whose attempt left no
child: a spawn rejected before any child started or a Quality-only run after an unpersisted
incident); `not-applicable` for a Quality packet, an
`admission-changed` fallback or a packet that never started. `mismatch` packets keep their work but
leave every Fast metric, duration and cost and are counted only in `modelComplianceOutcomes`;
`unverified` packets stay in the metrics and are counted. `admission-changed` packets consume no
Fast attempt, are no escalation and stay out of the attempted-Fast metrics.

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
Observations are grouped by `mode` plus `harnessFamily`. Evaluation also enforces cohort (5 records), metric-
stratum and period-observation minima; insufficient or incompatible evidence yields
`unavailable`, never a favorable default. Records whose only first gate reason is `correction-pass`
count toward no minimum. The chronological halves are reported for information only: an unavailable
split never makes an adoption gate or Keep unavailable. Critical and important finding rates use
the records whose review ran as the denominator. The protocol identifies the analysis as
observational and unpaired, pooled across task mix, overlap, harness and install kind; it requires
no per-workflow stratum.

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

| Class       | Codes                                                                                                                                                                                                    | Result                                                                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neutral     | `INVALID_PAYLOAD`, `AUTHENTICATION_FAILED`, `LOCKED`, `UNSAFE_RUNTIME_ROOT`, `MIGRATION_REQUIRED`, `PROTOCOL_DRIFT`, and `NOT_FOUND` from a generation or record read                                    | Retryable error with `pilotControlOutcome: "none"`; no suspension. An `UNSAFE_RUNTIME_ROOT` retry succeeds only once the check its `details.reason` names passes |
| Passthrough | `CAPACITY_EXHAUSTED`                                                                                                                                                                                     | Unchanged; the capacity handler suspends exactly once                                                                                                            |
| Fault       | `NOT_FOUND` from the timing-receipt read, and every other code, including `UNSAFE_STORAGE`, `WRITE_FAILED`, `INCOMPLETE_EVIDENCE`, and `INVALID_STATE`; a non-helper error is reported as `WRITE_FAILED` | Persists `finalization-failed` (`finalize`) or `evidence-gap` (gate observations), keeping the original code                                                     |

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

An `UNSAFE_RUNTIME_ROOT` error envelope also carries `error.details`, after `exitCode`, naming the
failed runtime-root check; no other code carries `details`, and the code, exit status 3 and message
stay constant. Its `details.reason` is one closed value from `UNSAFE_RUNTIME_ROOT_REASONS`:
`git-unavailable`, `git-failed`, `not-directory`, `toplevel-mismatch`, `identity-mismatch`,
`path-resolution`, `tracked-runtime-state`, `not-ignored`. Only `git-failed` adds
`details.subcommand`: `rev-parse`, `ls-files` or `check-ignore`. Neither field carries a path, Git
argument, exit status, stdout or stderr. A missing runner or a spawn error is `git-unavailable`, a
`check-ignore` exit 1 is `not-ignored`, and an unresolvable path, including a missing root or
identity, is `path-resolution`, so it and `identity-mismatch` both point at the supplied root or
identity. The control operations above copy `details` through their rewrap;
the CLI writes it to the stdout envelope only, and stderr keeps `<code>: <message>`.

The persisted protocol digest binds every generation, and an unrecognized digest fails the
stored-state check with `UNSAFE_STORAGE`. The exceptions are the prior protocols a release
persisted generations under, a digest-to-reason map: version `1.1.0`, shipped by releases 1.66.0
through 1.67.1, maps to `quality-mapping-changed`, because protocol `1.2.0` changed the
Quality-mapping identity; version `1.2.0` (digest
`sha256:a39232140a24ffcfb95f1165cea2343e4593c32dc3594ef81a6d9295505b099c`), shipped from v1.68.0 to
v1.76.0, maps to `protocol-parameters-changed`, because `1.3.0` changed minima, enums, record fields
and the state shape. A generation recorded under either must never continue; it migrates in one
step instead of failing. State validation depends on the stored protocol version, so a `1.2.0`
state without the `1.3.0` fields stays valid for `inventory`, `begin-review` and
`discard-generation`.

- **Locked paths migrate.** Before every locked operation except `begin-review` and
  `discard-generation`, the lifecycle lock first moves a pending prior-protocol generation to `suspended`
  with its mapped reason (`quality-mapping-changed` or `protocol-parameters-changed`). It writes the suspension through the ordinary
  marker-guarded path, records `resumeTo` as the stored `baseline` or `active` state, keeps the
  stored protocol binding of all its evidence, and is a no-op once persisted. An interrupted
  migration (marker or suspension present, state not yet suspended) completes under the same lock.
  A suspension-reason marker left by release 1.67.1 is completed first; a leftover `suspend` or
  `resume` marker cannot be adopted, so the migration leaves it in place without failing. A
  `review` generation is already closed and keeps its state.
- **Read-only paths never migrate.** `inventory` reports such a generation as `suspended` with
  `transitionPending: true` until a locked operation persists the migration, and reports
  `protocolCurrent: false` for every generation bound to an earlier protocol, so setup never
  offers `resume` for it. The anonymous gate
  observation admission check and the suspension and incident writers read it as suspended as well.
- **Everything else is `PROTOCOL_DRIFT`.** After the migration no operation extends, activates,
  records into, finalizes or resumes the generation, and `begin-baseline` refuses to adopt it
  (`INVALID_STATE`). Its evidence keeps its prior protocol binding and is never mixed into a
  later generation.
- **Exits.** The generation can only be reviewed and removed: `begin-review`, then
  `discard-generation` with its usual disabled-configuration and confirmation preconditions, after
  which a new baseline starts under `1.3.0`. Neither migrates, so `begin-review` accepts the
  `inventoryDigest` read before it. No workflow offers either operation yet; an operator calls the
  shipped helper directly.
- **Nothing else migrates.** A different version, a prior digest under another version, the
  current digest under a prior version, or any other unknown digest still fails `UNSAFE_STORAGE` on read and
  locked paths alike.

## Further reading

- [Architecture](architecture.md#local-pilot-measurement-boundary) – separation between policy,
  representation, configuration, lifecycle state, and observations
- [Configuration](configuration.md#execution-profile-key) – tracked ownership versus
  runtime ownership
- [User privacy and retention guide](../user-guide/model-tiering-pilot.md) – operator-facing data,
  consent, review, and deletion contract
- [Risk-aware pilot policy](../adr/risk-aware-model-tiering-pilot-policy.md) – durable decision and
  tradeoffs
