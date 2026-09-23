## Merge-gate pilot observation

This fragment owns the optional, anonymous merge-gate observation. It measures period-level
correction work only. It never selects an execution profile, starts or activates a generation,
links an observation to a pull request or workflow record, or changes the merge gate's result.

Use the shipped helper as
`node <skill-root>/scripts/pilot-measurement.mjs <operation>`. Send exactly one JSON object on
standard input and accept only its single JSON envelope on standard output. Diagnostics and pilot
control alerts are value-free; never relay rejected input. The helper owns runtime guards,
capability authentication, atomic reservation/finalization, incomplete evidence, suspension, and
capacity controls. The workflow never reproduces those writes itself.

### Phase 0 observation preflight and reservation

Run this section only after Phase 0 has resolved a non-observer `merge|report` completion mode and
before Phase 1 performs gate work.

1. Resolve `executionProfiles.fast.enabled` fresh through the loaded configuration contract and
   classify it as the canonical `configState=disabled|invalid|enabled`. Do not repair or write the
   configuration here. Discover the current pilot generation with one read-only `inventory` call.
   Its stdin object has exactly these keys and no `generationId`:

   ```json
   {
     "runtimeStateRoot": "<verified RUNTIME_STATE_ROOT>",
     "repositoryIdentity": "<verified repository identity>"
   }
   ```

   Do not infer a generation from files or create one. Zero discovered generations returns
   `generationStatus=absent` as a read-only observation no-op. Exactly one returns
   `generationStatus=present`, its `generationId`, and its exact `generationState`; retain those
   values transiently and preserve `generationState` independently from `configState`. More than
   one generation fails closed as ambiguous. On that failure, a malformed success envelope, or any
   other inventory error, reserve nothing, claim no durable suspension or incomplete evidence,
   consume only explicit helper-returned pilot-control metadata as described in step 6, and
   continue the merge gate unchanged.

2. Determine the native harness family as the closed value `claude|codex`. Portable execution has
   no native pilot capability and records no observation. It continues the merge gate unchanged.
3. When inventory returned exactly one present generation, invoke `start-gate-observation` with an
   stdin object containing exactly these keys:

   ```json
   {
     "runtimeStateRoot": "<verified RUNTIME_STATE_ROOT>",
     "repositoryIdentity": "<verified repository identity>",
     "generationId": "<inventory generationId>",
     "configState": "<disabled|invalid|enabled>",
     "generationState": "<inventory generationState>",
     "mode": "<merge|report>",
     "harnessFamily": "<claude|codex>"
   }
   ```

   Only `configState=enabled` plus
   `generationState=baseline|active` may reserve. Disabled or invalid configuration and
   `none|suspended|review` generation state must return a successful read-only no-op that preserves
   the generation. The `none` case is inventory's absent result and never reaches this operation;
   the other no-op cases are returned by reservation. Observer-only execution never invokes this
   operation.

4. On a reservation, retain the returned `observationId`, capability, cohort, and ordinal only in
   the current run's transient state. Never place the raw capability or observation identifier in
   the wisdom file, chat, a delegation message, a pull-request artifact, or another record. Start
   three counters at zero:
   `ciRepairDelegations`, `reviewerImplementationDelegations`, and
   `conflictResolutionAttempts`.
5. If inventory or reservation fails, continue the merge gate with the same mode and outcome it
   would otherwise have had. Never retry a mutation whose envelope says it may have succeeded, and
   never turn an observation failure into a merge blocker.
6. Consume only the helper envelope's explicit `pilotControlOutcome`, `controlStatePersisted`, and
   `alert` metadata. Report a suspension or incomplete-evidence state only when the outcome names
   it and `controlStatePersisted` is `true`; never infer either from an exit code, missing receipt,
   or failed write. If `pilotControlOutcome` is `control-state-unpersistable`, relay only its stable
   value-free alert and state that durable cross-run control could not be proven. Missing metadata,
   a `none` outcome, or `controlStatePersisted: false` authorizes no persistence claim. This metadata
   never changes the current merge/report result, and the workflow performs no pilot state write of
   its own.

### Correction counters

Increment a counter only after the corresponding correction work was actually dispatched:

- `ciRepairDelegations`: one for each Phase-2 failed-check instruction successfully dispatched to
  `{{SKILL:iterate}}`; a refused envelope, pending-check wait, ordinary round start, or keyword-less
  resume is zero;
- `reviewerImplementationDelegations`: one for each configured-reviewer implementation delegation
  successfully dispatched to `{{SKILL:iterate}}`; triggers, assessments, deferred/rejected items,
  Phase-4 returns without implementation, and keyword-less resumes are zero;
- `conflictResolutionAttempts`: one each time `{{AGENT:merge-conflict-resolver}}` is actually
  started for a base-into-head conflict; a clean merge, `off`, an unanswered gate, or a stop before
  the resolver starts is zero.

Do not count retries or repairs by interpreting prose. The dispatch/start event itself is the only
counter authority.

### Phase 6 observation finalization

After a reservation, every normal, controlled, or early ending passes this section exactly once
before Phase 6 deletes wisdom or delegation state. No post-reservation path returns directly. A
path that ends before reaching Phase 4 finalizes with unavailable check evidence as specified
below. An unexpected workflow failure after reservation uses the same best-effort finalizer with
terminal outcome `failed`; it never discards product changes or changes the gate result.

1. Derive the closed terminal outcome:
   - `merged` only when a fresh Phase-5 read verifies the merge;
   - in `report` mode, evaluate a measurement-only projection of Phase-4 conditions 2–10 against
     the same ordered fresh observation batch and the existing no-check-list waiver semantics.
     Record `reported-ready` when all nine pass and `reported-blocked` with the stable domain
     blocker when any fails. Condition 1 remains the real merge-authorization condition and is
     excluded only from this measurement projection;
   - every controlled `report`-mode ending after reservation but before the Phase-4 batch records
     `reported-blocked`. Retain the stable non-identifying blocker `pre-phase4-controlled-stop` only
     in transient workflow state and the chat explanation; it is not part of the closed helper
     payload. For this path use `checksReported: false`, `requiredCheckCount: "unavailable"`, and
     `requiredChecksSatisfied: "unavailable"` regardless of earlier check reads;
   - `failed` for a reserved merge-mode run that did not reach a verified merge and for an
     unhandled workflow failure after reservation.
2. Derive check evidence only from the final normalized `pr-status-read`. An unreported check list
   is unavailable. With `mergeGate.requireAllChecks: true`, the required-check count is every
   reported check. With `false`, count only checks carrying `required: true`; any missing
   requiredness fails closed under the gate's existing rule. Record the corresponding
   `checksReported`, `requiredCheckCount`, and `requiredChecksSatisfied` values without check names.
3. Invoke `finalize-gate-observation` once. Its stdin object contains exactly these keys; the
   reservation already owns `configState`, `generationState`, `mode`, and `harnessFamily`, so none
   of them is repeated here:

   ```json
   {
     "runtimeStateRoot": "<verified RUNTIME_STATE_ROOT>",
     "repositoryIdentity": "<verified repository identity>",
     "generationId": "<reserved generationId>",
     "observationId": "<transient observationId>",
     "capability": "<transient capability>",
     "terminalOutcome": "reported-blocked",
     "ciRepairCorrections": 0,
     "reviewerCorrections": 0,
     "conflictCorrections": 0,
     "checksReported": false,
     "requiredCheckCount": "unavailable",
     "requiredChecksSatisfied": "unavailable"
   }
   ```

   This is the valid typed shape for a pre-Phase-4 controlled stop; other endings replace only the
   values with their derived closed outcome, integer counter values, and final check evidence. The
   helper authenticates the reservation and enforces exactly-once finalization. The three
   left-to-right counter mappings above are exact; do not rename, merge, or infer counters.

4. A finalization failure leaves the current merge/report result unchanged. Consume only its
   explicit `pilotControlOutcome`, `controlStatePersisted`, and `alert` metadata under Phase-0 step 6. Do not claim suspension or incomplete evidence without that confirmation. Apply an
   incomplete-evidence or `evidence-gap` control path only when the explicit outcome and persisted
   flag confirm it. When metadata supplies it, emit only the stable value-free pilot-control alert.
   A `control-state-unpersistable` alert remains value-free and reports only that durable cross-run
   control could not be proven. Do not retry an ambiguous mutation and do not include observation
   identity or capability in the final chat report.
