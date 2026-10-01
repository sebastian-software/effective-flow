## Pilot workflow record

This fragment owns the pilot workflow record of an adopting implementation workflow: preflight,
reservation, packet timing, finalization, incident suspension, and same-run reconciliation. The
anonymous merge-gate observation is a different record owned by the `pilot-measurement` fragment.
The loaded `execution-profiles` fragment stays the canonical profile policy; this fragment adds no
gate row, state, fallback, or outcome.

A workflow run never calls `begin-baseline`, `activate`, or `resume`. Those three are confirmed
Guided setup actions. A run only reads the generation and writes its own record.

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

Before the first implementation spawn, a nonzero exit, a malformed envelope, `PROTOCOL_DRIFT`, or
an unknown key prevents Fast; while no reservation exists it makes the run an unmeasured run.
After `start`, a helper failure preserves the product diff, never starts, restarts, or re-routes an
implementation worker by itself, and blocks every later Fast attempt in the run.

### Preflight

Run the preflight once, after the execution-location receipt and the run-level diff baseline exist
and before the first packet is classified for `start`.

With `configState=enabled`, an **unmeasured run** holds no usable generation: every packet takes
`generationState=none` with `not-evaluated + quality`, the legal `no-generation` row, runs Quality
without Fast, and is never recorded. A portable build, an ambiguous or failed inventory, and a
failed `start` each make the run unmeasured. That `generationState=none` is the run's effective
envelope, not a claim about the persisted generation: the orchestrator keeps an inventory-proven
persisted state separately as the target of an incident's `suspend`.

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
packet in the same order. Never re-send `start`. Any failure creates no usable record: the run
becomes an unmeasured run, the classification is discarded, and the value-free reason is reported.
The inventory-proven persisted state stays known and remains the incident `suspend` target.
An in-flight reservation, including an unfinished merge-gate observation or timing receipt, makes
`start` fail with `INCOMPLETE_EVIDENCE`, so admission is serialized.

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

- Call `start-packet` immediately before a packet's first implementation spawn, after its packet
  snapshot.
- Call `finish-packet` once when that packet's initial phase ends: its Quality attempt, its Fast
  success, or its failed Fast attempt plus the single retained-state Quality continuation. Never
  finish or restart the timer between the Fast attempt and that continuation.
- Validation, review, retry, and correction spawns lie outside the interval and count only through
  `qualityCorrectionRounds`. Missing or incompatible data stays unavailable, never zero.
- Close every reserved packet on every exit path. A packet that never spawned is closed at the exit
  by `start-packet` followed directly by `finish-packet`, and the record then finalizes as
  `aborted` or `failed`, never `completed`. Known bias, awaiting a helper follow-up: the helper
  records that near-zero interval as an available duration, and counts such a packet reserved as
  `fast` as an attempted Fast packet without escalation.
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
  Baseline and Quality-selected packets always send `none`.
- `costProxy` is `null`, recorded as unavailable, unless the harness exposes a cost measure; then
  it is `{kind, unit, value}` from that measure: `kind` and `unit` are tokens, and `value` is a
  canonical unsigned decimal string (`0` or no leading zero, at most 39 digits). Never invent a
  cost source.
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

### Incidents and pilot control

A critical incident preserves all state, never reverts potentially user- or sibling-owned work
automatically, and calls `suspend` with the fixed outcome of its class:

| Incident class      | `pilotControlOutcome`              |
| ------------------- | ---------------------------------- |
| safety              | `critical-safety-incident`         |
| data integrity      | `critical-data-integrity-incident` |
| authorization       | `critical-authorization-incident`  |
| scope boundary      | `critical-scope-incident`          |
| failed finalization | `finalization-failed`              |

The `suspend` payload has exactly `runtimeStateRoot`, `repositoryIdentity`, `generationId`,
`pilotControlOutcome`, and `affectedRecordIds`, which holds the current `runId` when a record exists
and is empty otherwise. Only an inventory-proven `baseline`, `active`, or `suspended` generation is
suspended, also in an unmeasured run after a failed `start`. If `suspend` fails, report only a stable value-free alert, claim no persisted
suspension, and keep later preflights fail-closed on storage or inventory uncertainty.

A reserved record still finalizes after an incident. Implementation fallback and pilot control
stay independent: a scope incident may set both `scope-incident` and `critical-scope-incident`.
From a helper error envelope consume only explicit `pilotControlOutcome`,
`controlStatePersisted`, and `alert`; report a suspension or incomplete evidence only when
`controlStatePersisted` is `true`. `capacity-exhausted`, `evidence-gap`, `incomplete-record`, and
`control-state-unpersistable` set only the control axis, never start a worker, and never change a
successful product diff. `control-state-unpersistable` relays only its value-free alert.

### Finalization failure

A failed `finalize`, or a record left unfinalizable, keeps every product change and calls `suspend`
with `finalization-failed` and `[runId]`. It never becomes an implementation fallback. Still in the
same run, ask once, because no later run holds the capability:

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
`expectedInventoryDigest` (that fresh `inventoryDigest`), and `confirmation: true`. A declined,
unanswered, non-interactive, or failed reconciliation leaves the incomplete record in place. The
completion report then states that the generation can leave suspension only through
`discard-generation` or `purge`.

Every later run observes the suspension until an explicit confirmed Guided `resume` while the
generation is still `suspended` with healthy evidence; a reviewed generation never resumes.
