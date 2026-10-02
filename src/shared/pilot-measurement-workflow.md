## Pilot workflow record

This fragment owns the pilot workflow record of an adopting implementation workflow: preflight with
automatic activation, reservation, packet timing, finalization, incident recording, and same-run
reconciliation. The anonymous merge-gate observation is a different record owned by the
`pilot-measurement` fragment. The loaded `execution-profiles` fragment stays the canonical profile
policy; this fragment adds no gate row, state, fallback, or outcome.

A workflow run never calls `begin-baseline` or `resume`; those two are confirmed Guided setup
actions. A run reads the generation, lets the helper activate a baseline generation, and writes
only its own record and incidents.

### Helper contract

Invoke `node <skill-root>/scripts/pilot-measurement.mjs <operation>` with the operation as the sole
positional argument and exactly one JSON object with exactly the listed keys on standard input.
Accept only the single JSON envelope on standard output: `ok`, `operation`, and either
`protocolDigest` plus `result` or `error`. Never scrape standard error, never interpolate
operational prose, paths, diffs, or worker text into a payload, and never relay rejected input.
Every report about the pilot is value-free: name the operation, the stable error code, and the
closed outcome, never a capability, run or packet identifier, or payload value.

`runId`, `workflowCapability`, and every `packetId`/`packetCapability` exist only in the
orchestrator's transient state for the current run. Never write them to the wisdom file, chat, a
worker handoff, a retained-state continuation, a commit, a pull request, or any tracked artifact.

`LOCKED` is the one retryable error: the helper changed nothing. Re-send the identical payload at
most twice more, after about two and then about five seconds; an exhausted retry counts as that
operation's failure. Never re-send after any other error, except a lost response where a step
allows it.

Before the first implementation spawn, a failure no step below handles by name (a nonzero exit, a
malformed envelope, `PROTOCOL_DRIFT`, or an unknown key or result) prevents Fast; while no
reservation exists it makes the run an unmeasured run. After `start`, a helper failure preserves
the product diff, never starts, restarts, or re-routes an implementation worker by itself, and
blocks every later Fast attempt in the run.

### Preflight

Run the preflight once, after the execution-location receipt and the run-level diff baseline exist
and before the first packet is classified for `start`.

With `configState=enabled`, an **unmeasured run** holds no usable generation: every packet takes
`generationState=none` with `not-evaluated + quality`, the legal `no-generation` row, runs Quality
without Fast, and is never recorded. A portable build, an ambiguous or failed inventory, a genuine
activation fault, and a failed `start` each make the run unmeasured. That `generationState=none` is
the run's effective envelope, not a claim about the persisted generation: the orchestrator keeps an
inventory-proven persisted state separately as the incident target.

1. Resolve `executionProfiles.fast.enabled` fresh through the loaded configuration contract and
   classify it as `configState=disabled|invalid|enabled`. Do not repair or write it. Disabled or
   invalid selects `eligibility=not-evaluated + selectedProfile=quality` for every packet and calls
   no pilot operation.
2. This installation is the `{{BUILD_TARGET}}` build, fixed when it was built. `claude` and `codex`
   are the harness family. A `portable` build is an unmeasured run whatever host executes it: it
   calls no pilot operation, reads no inventory, and records nothing.
3. With `configState=enabled` on a native build, call the read-only `inventory` operation with
   exactly these keys:

   ```json
   {
     "runtimeStateRoot": "<verified RUNTIME_STATE_ROOT>",
     "repositoryIdentity": "<verified repository identity>"
   }
   ```

   `generationStatus=absent` is `generationState=none`. A present generation yields its
   `generationId` and exact `generationState`. `none`, `suspended`, and `review` select
   `not-evaluated + quality` and reserve nothing. Only `baseline` and `active` classify packets. An
   ambiguous or failed inventory is an unmeasured run and calls no mutating operation.

4. **Automatic activation.** A proven `baseline` is activated by the helper, never by a user
   confirmation. Call `protocol` with `{}`, take `protocolVersion` from `result.version` and
   `protocolDigest` from the envelope, which must equal `result.digest`, then call `activate` once
   with exactly these keys and no `confirmation`:

   ```json
   {
     "runtimeStateRoot": "<verified RUNTIME_STATE_ROOT>",
     "repositoryIdentity": "<verified repository identity>",
     "generationId": "<inventory generationId>",
     "configState": "enabled",
     "protocolVersion": "<protocol result.version>",
     "protocolDigest": "<protocol digest>"
   }
   ```

   - `activated` makes the generation `active`, persisted and effective alike.
   - `not-ready` whose `unmet` is a nonempty subset of `busy`, `window`, and `sample` keeps it
     `baseline`. With `busy`, another run is in flight and the `start` below fails.
   - `LOCKED`, once its retry is exhausted, keeps it `baseline`: a held lock fails before any check.
   - `INVALID_STATE`, `WRITE_FAILED`, a lost or malformed response, or an unknown result is
     ambiguous: re-read `inventory` with the `generationId` and take its proven state as in step 3,
     without a second `activate`. An unprovable re-read makes the run unmeasured.
   - Every other failure makes the run unmeasured: a protocol mismatch, which sends no `activate`,
     and the genuine evidence faults `INCOMPLETE_EVIDENCE` and `UNSAFE_STORAGE` among them.

   In every unmeasured case the generation the first inventory proved stays the incident target.

   A reservation made after `activated` is an `active` reservation. The state decided here is the
   one every packet is classified under; a baseline reservation is never relabelled.

### Reservation

Classify every initial packet completely before `start`, in this order: the native capability
check, the packet snapshot gate, coupling, and the ordered exclusion gate. The packet snapshot gate
reads a freshly rooted packet snapshot; pre-existing unattributable dirtiness in an allowed Fast
path is `unclear-ownership`. Coupled packets share Quality; disjoint packets may mix profiles only
with explicit nonoverlapping ownership and resolved dependencies. The helper fixes the packet set
and each packet's selection at `start`; nothing learned afterwards changes a reserved selection, it
can only produce a fallback.

Map each packet's envelope to the wire shape exactly:

```json
{
  "selectedProfile": "quality",
  "wouldBeFastEligible": false,
  "gate": { "eligibility": "excluded", "firstReason": "unclear-ownership" }
}
```

`eligibility` is `eligible` or `excluded`, and `firstReason` is `null` exactly for `eligible`.
`wouldBeFastEligible` is `true` exactly for `eligible`. In `baseline` every packet is `quality`; in
`active` an eligible packet is `fast` and an excluded one `quality`. `not-evaluated` is never sent.
The helper snapshots `configState` and `generationState` once per record, not per packet.

Call `start` exactly once, before the first implementation spawn, with exactly these keys and one
packet entry per classified initial packet in a fixed order:

```json
{
  "runtimeStateRoot": "<verified RUNTIME_STATE_ROOT>",
  "repositoryIdentity": "<verified repository identity>",
  "generationId": "<inventory generationId>",
  "configState": "enabled",
  "workflow": "build",
  "harnessFamily": "<claude|codex>",
  "packets": ["<one wire-shape entry per packet>"]
}
```

A success returns `runId`, `workflowCapability`, and one `packetId`/`packetCapability` pair per
packet in the same order. Never re-send `start` other than after `LOCKED`. Any failure creates no
usable record: the run becomes an unmeasured run, the classification is discarded, and the
value-free reason is reported. The inventory-proven persisted state stays known and remains the
incident target. An in-flight reservation, including an unfinished merge-gate observation or timing
receipt, makes `start` fail with `INCOMPLETE_EVIDENCE`, so admission is serialized.

### Packet timing

The packet timing and identity operations take exactly these keys:

```json
{
  "runtimeStateRoot": "<verified RUNTIME_STATE_ROOT>",
  "repositoryIdentity": "<verified repository identity>",
  "generationId": "<reserved generationId>",
  "runId": "<transient runId>",
  "packetId": "<transient packetId>",
  "workflowCapability": "<transient workflowCapability>",
  "packetCapability": "<transient packetCapability>"
}
```

- **Start before spawn.** Call `start-packet` immediately before a packet's first implementation
  spawn, after its packet snapshot, and never spawn that packet before it succeeded. The helper
  reads a missing receipt as proof that the packet never started, so this order is what makes its
  `attempt` true.
- Call `finish-packet` once when that packet's initial phase ends: its Quality attempt, its Fast
  success, or its failed Fast attempt plus the single retained-state Quality continuation. Never
  finish or restart the timer between the Fast attempt and that continuation.
- Validation, review, retry, and correction spawns lie outside the interval and count only through
  `qualityCorrectionRounds`. Missing or incompatible data stays unavailable, never zero.
- An exit that ends the run before every packet completed finalizes as `aborted` or `failed`,
  never `completed`. A packet that never spawned gets no timing operation; the helper records it as
  `not-started` and excludes it from every packet metric. A packet whose initial phase is still open
  at that exit is not finished; the helper records it as `started` with an unavailable duration.
- A lost `start-packet` or `finish-packet` response may be re-sent once with the identical payload.
  Any other failure leaves the record unfinalizable: send no further packet operation or fabricated
  outcome, continue implementation with Quality, and apply "Finalization failure" at the exit.

### Finalization

After `start`, every normal, controlled, or early ending passes this step exactly once, after the
last workflow outcome is known and before the completion report. Call `finalize` with exactly these
keys:

```json
{
  "runtimeStateRoot": "<verified RUNTIME_STATE_ROOT>",
  "repositoryIdentity": "<verified repository identity>",
  "generationId": "<reserved generationId>",
  "runId": "<transient runId>",
  "workflowCapability": "<transient workflowCapability>",
  "packets": [
    {
      "packetId": "<transient packetId>",
      "packetCapability": "<transient packetCapability>",
      "fallback": "none",
      "escalated": false,
      "costProxy": null
    }
  ],
  "validation": { "status": "passed", "requiredCount": 1, "totalCount": 1, "satisfiedCount": 1 },
  "review": { "status": "completed", "severityCounts": { "critical": 0, "important": 0, "note": 0 } },
  "completionStatus": "completed",
  "qualityCorrectionRounds": 0,
  "detailOptIn": false,
  "trace": null
}
```

- `fallback` is the packet's exact decision-map value, and `escalated` equals `fallback != "none"`.
  Baseline and Quality-selected packets, and every packet that never spawned, always send `none`.
- `costProxy` is `null`, recorded as unavailable, unless the harness exposes a cost measure; then
  it is `{kind, unit, value}` from that measure: `kind` and `unit` are tokens, and `value` is a
  canonical unsigned decimal string (`0` or no leading zero, at most 39 digits). Never invent a
  cost source. A packet that never spawned sends `null`.
- A token is lowercase `[a-z0-9._-]`, starts and ends alphanumeric, has at most 128 characters,
  and holds no credential-like material. The rule covers `costProxy.kind` and `unit` and the
  trace's `role`, `id`, and `category`.
- `validation` counts the final validation's required checks, all checks, and satisfied required
  checks as integers, with neither `requiredCount` nor `satisfiedCount` above `totalCount`. Its
  `status` is closed: `passed` needs `requiredCount > 0` and `satisfiedCount >= requiredCount`;
  `failed` needs `requiredCount > 0` and `satisfiedCount < requiredCount`; `not-required` needs
  `requiredCount` and `satisfiedCount` of `0`; `unavailable`, for a validation never reached,
  needs `satisfiedCount` of `0`.
- `review.status` is `completed` with the aggregated severity counts, `not-run` when no reviewer
  started, or `unavailable` when not reached. A status other than `completed` sends all three
  severity counts as `0`.
- `completionStatus` is `completed`, `aborted`, or `failed`; a missing outcome maps to `failed`, and
  `abandoned` is reserved to reconciliation.
- `qualityCorrectionRounds` counts dispatched Quality correction spawns after the initial phase.
- `detailOptIn` is `true` exactly when `trace` is supplied, and only with the user's explicit
  detailed-trace consent in the current run. The trace holds only `roles` (`role`, `profile`),
  `requirements` (`id`, `status`, optional `path`), `checks` (`id`, `outcome`, `durationMs`), and
  `findings` (`id`, `severity`, `status`, `category`, `path`, `line`). Diffs, escalation detail, and
  handoff prose never enter it.
- A lost response may be re-sent once with the identical payload; the helper deduplicates it.
  Every other failure, `LOCKED` after its retry included, is a finalization failure.

### Incidents and pilot control

A critical incident preserves all state and never reverts potentially user- or sibling-owned work
automatically. Record it with `record-incident`, naming only its `category`: `safety`,
`data-integrity`, `authorization`, or `scope` for a scope-boundary incident. Never name a
`critical-*` outcome and never call `suspend`: the helper maps the category to its outcome.

The `record-incident` payload has exactly `runtimeStateRoot`, `repositoryIdentity`,
`generationId`, `category`, and `affectedRecordIds`, which holds the current `runId` when a record
exists and is empty otherwise. Only an inventory-proven `baseline`, `active`, or `suspended`
generation is the incident target, also in an unmeasured run after a failed activation or `start`.
A success returns the persisted suspension. `LOCKED` follows the retry policy; once exhausted, or
after any other failure, report only a stable value-free alert, claim no persisted suspension, and
ask once, still in the same run, because no durable state then stops a later run from selecting
Fast:

```ask
header: Incident
question: A critical incident could not be persisted as a pilot suspension, so a later measured build run could still select Fast. Retry recording it now?
options:
  - label: Retry
    description: Re-send the identical incident under the LOCKED retry policy; a success persists the suspension
  - label: Leave
    description: Record nothing more; later measured runs may select Fast until the pilot is disabled in Guided setup
```

On **Retry**, re-send the identical payload under the same policy and report the persisted
suspension on success. A declined, unanswered, non-interactive, or failed retry leaves no
suspension. The completion report then states that no durable state keeps a later measured run off
Fast, and that the confirmed recovery path is `{{SKILL:setup}}` Guided block 10 `Disable`, after
which Fast returns only through a confirmed `Enable` there.

After any critical incident in the run, persisted or not, no packet that has not yet spawned makes
a Fast attempt: it runs Quality from its first spawn, still timed by `start-packet` and
`finish-packet`. A Fast attempt already spawned keeps its own outcome. At `finalize`, a packet
reserved as `fast` that ran Quality this way sends `scope-incident` with `escalated: true`: the
incident consumed its only Fast attempt, and the closed vocabulary's one incident fallback charges
it to Fast, where `none` would credit a Quality execution as a Fast success. The incident's own
category stays on the control axis.

A reserved record still finalizes after an incident. Implementation fallback and pilot control
stay independent: a scope incident may set both the `scope-incident` fallback and the `scope`
category. From a helper error envelope consume only explicit `pilotControlOutcome`,
`controlStatePersisted`, and `alert`; report a suspension or incomplete evidence only when
`controlStatePersisted` is `true`. `capacity-exhausted`, `evidence-gap`, `incomplete-record`,
`finalization-failed`, and `control-state-unpersistable` set only the control axis, never start a
worker, and never change a successful product diff. `control-state-unpersistable` relays only its
value-free alert.

### Finalization failure

A failed `finalize`, or a record left unfinalizable, keeps every product change and never becomes
an implementation fallback. The workflow suspends nothing for it: on a genuine mid-write fault the
helper itself persists `finalization-failed` and reports it in the envelope, while a rejected
request, lock contention, or a location or version fault leaves the pilot state unchanged. Report
exactly what the envelope confirms. Still in the same run, ask once, because no later run holds the
capability:

```ask
header: Pilot record
question: The pilot record of this run could not be finalized. Mark it abandoned now?
options:
  - label: Reconcile
    description: Mark this run's incomplete pilot record abandoned; product changes stay unchanged
  - label: Keep
    description: Leave the incomplete record in place; only a generation discard or purge clears it
```

On **Reconcile**, read a fresh `inventory` with the `generationId`, then call `reconcile-record` with
exactly `runtimeStateRoot`, `repositoryIdentity`, `generationId`, `runId`, `workflowCapability`,
`expectedInventoryDigest` (that fresh `inventoryDigest`), and `confirmation: true`. The helper
acts on the record's state. For a reservation still open, it writes the record as `abandoned` with
every packet's `attempt` `unknown`, which never counts as a success. When `finalize` faulted after
persisting the record, for example while removing a timing receipt, the helper only drains the
remaining receipts and returns the stored `completionStatus`. Report the status the helper returns.
A declined, unanswered, non-interactive, or failed reconciliation leaves the incomplete record in
place. The completion report then states that it keeps every later measured run
unmeasured and that only `discard-generation` or `purge` clears it.

Only a suspension the helper persisted, from a successful `record-incident` or an envelope with
`controlStatePersisted: true`, keeps later runs off Fast: each later run observes that persisted
suspension until an explicit confirmed Guided `resume` while the generation is still `suspended`
with healthy evidence; a reviewed generation never resumes. An incident that could not be persisted
leaves no durable state, so nothing keeps a later measured run off Fast; the only confirmed
recovery is `{{SKILL:setup}}` Guided block 10 `Disable`, and Fast returns only through a confirmed
`Enable` there.
