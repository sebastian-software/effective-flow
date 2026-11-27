# Persist the pilot-observation capability in a helper-owned handle instead of model context

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #813

## Requirement

A merge-gate run that reserves an anonymous pilot gate observation can lose the observation's
capability, and then no run can finalize the observation. Today `start-gate-observation` returns the
raw capability to the model. `src/shared/pilot-measurement.md` step 4 (`:68-73`) tells the run to
keep that value "only in the current run's transient state" and never to write it into chat, a
delegation message or another record. Whether the capability survives therefore depends on the
model keeping a value it is told never to print. In the reported gate run, the delegated sub-agent
redacted the capability from its own notes. The wisdom-file handle was written without it, two
re-dispatches (a host-PR-watch resume and a relayed-answer resume) could not call
`finalize-gate-observation`, and the observation stayed reserved after the pull request merged. The
merge was unaffected, but the measurement was lost.

Goal: the pilot helper keeps the capability itself, in a helper-owned file with restrictive
permissions. The model never sees the raw capability. It addresses the observation only by its
`generationId` and `observationId`. Finalization reads the capability from that file and
authenticates it against the reservation's stored hash, as it does today.

Correction of the issue's premise: `abandon-reservation` never covered gate observations. It
handles only workflow reservations (`src/scripts/pilot-measurement-core.mjs:4548-4554`, `:4633`).
An open gate observation clears only through `begin-review` followed by `discard-generation`
(`src/shared/cleanup-pilot-reservations.md:19-21`,
`docs/developer-guide/model-tiering-pilot-protocol.md:250-262`). In this plan, "abandon" in the
issue's fourth acceptance criterion therefore means those existing exit paths (see "Decided by
score").

Workflow rationale: **Bugfix**. The defect is the reported loss of a reserved observation, caused
by how custody of the capability is designed. The fix keeps the observation's measurement semantics,
counters, outcomes and gate behaviour unchanged. The only changes are where the capability lives
and the matching helper interface.

## Outcome checkpoint

**Primary source:** issue #813 in `github.com/sebastian-software/effective-flow`, the
pilot-observation capability custody of `merge-gate`.
**Original outcome:** a run can reserve and finalize a gate observation without the raw capability
appearing in model-visible output. A re-dispatched run finalizes from the persisted handle. A wrong
or missing handle is rejected. The handle is created with restrictive permissions under
runtime-state write safety and is invalidated on finalization and removed when its generation is
discarded or purged.
**Last evaluated attempt:** none.
**No-progress count:** 0
**Cumulative approach:** a helper-owned capability handle file outside the pilot namespace,
addressed by validated opaque identifiers; prose and documentation updated to match.
**Continuation decision:** none.

## Architecture decisions

- **Terminology:** in this plan, "handle" means the helper-owned file. In shipped prose, docs and
  tests, that file is called the **capability file**. This keeps it apart from the wisdom-file
  **observation handle** (`src/shared/pilot-measurement.md:86-95`), whose name stays as it is and
  is pinned by `test/workflow-contracts.test.mjs:28113-28140`. The directory keeps the scored name
  `pilot-observation-handles/`.
- **The helper owns the capability.** `start-gate-observation` generates the capability as today
  (`randomOpaque(deps, 32)`, `:4003`) and keeps storing only its hash in the reservation record
  (`:4008`). It also writes the raw value into a capability handle file and no longer returns it.
  The success envelope becomes `{status: 'reserved', observationId, cohort, ordinal}`.
- **Handle location (decided by score):** `<RUNTIME_STATE_ROOT>/.effective-flow/pilot-observation-handles/<generationId>/<observationId>.json`.
  The location is a sibling of `model-tiering-pilot/`, not inside it. The pilot namespace
  (`:543`) and every generation tree (`inspectGenerationInitialization` ~`:1855`, `evidenceInventory`
  ~`:2443`, `assertKnownGenerationTree` `:5478-5495`, the temporary sweeps `:1507` and `:4736`) are
  closed sets. An older released helper, which can share a generation with a newer local build in
  the same repository, fails closed with `UNSAFE_STORAGE` on any unknown entry. The sibling location
  leaves all of those sets, and the evidence inventory and its digest, unchanged. The helper derives
  the path from the `generationId` and `observationId`, both validated by the existing `opaque()`
  pattern (`:140`, `:307-310`). No caller supplies a path.
- **Handle content:** one canonical JSON object `{schema, kind: 'gate-observation-handle',
generationId, observationId, capability}`. It is written with the pilot core's own exclusive-write
  discipline: `O_CREAT|O_EXCL|O_WRONLY|O_NOFOLLOW` at mode `0600`, then fsync and a directory sync,
  as `writeExclusiveJson` does (`:523-538`). Directories are created at `0700` and checked
  component by component with symlink refusal (`directoryState`). After `guardedMkdir`
  (`:494-506`) creates `pilot-observation-handles/` or `<generationId>/`, call `syncDirectory`
  (`:509`) on the parent, so a durable reservation never loses its handle's directory entry. The handle is read with the
  existing `readRegular` no-follow, regular-file, size-capped read (`:400-415`). The pilot core keeps
  its own `PilotMeasurementError` taxonomy, so the shared `runtime-state-guard.mjs` is not
  introduced into it.
- **Runtime-state write safety:** before any handle write or read, the existing `repositoryGuard`
  checks (`:453-492`) apply. In addition, `.effective-flow/pilot-observation-handles` must be
  untracked and `git check-ignore --no-index` ignored, using the same check that is applied today to
  `.effective-flow/model-tiering-pilot` (`:477-479`). If the check fails, nothing is written. This
  check is defence in depth: Git cannot re-include a child of the already required ignored
  `.effective-flow/`, so a test can make it fail only through an injected `deps.runner`.
- **Anomaly classification:** every `fault` persists a pilot-wide `evidence-gap` suspension
  (`:3330-3352`), so each anomaly has a fixed code:

  | Anomaly                                                                                                | Code                    | Control outcome |
  | ------------------------------------------------------------------------------------------------------ | ----------------------- | --------------- |
  | Missing handle                                                                                         | `AUTHENTICATION_FAILED` | `none`          |
  | Wrong capability, mismatched identifiers, or a consumed marker whose `capabilityHash` differs          | `AUTHENTICATION_FAILED` | `none`          |
  | Symlink, non-regular file, oversize, malformed JSON, unknown `kind`/`schema`, or extra or missing keys | `UNSAFE_STORAGE`        | `evidence-gap`  |
  | Consumed marker on an open reservation                                                                 | `UNSAFE_STORAGE`        | `evidence-gap`  |

  Exact-key validation applies to both handle kinds. Leftover `.tmp-*` files in a handle directory
  are removed by the generation removal step.

- **Finalization authenticates from the handle (decided by score):** `finalize-gate-observation`
  accepts exactly its current keys minus `capability`, so a payload that still carries `capability`
  is `INVALID_PAYLOAD`. It reads the handle at the derived path and requires the handle's
  `generationId` and `observationId` to match the request. It then authenticates the handle's
  capability with the existing `authenticate` (`timingSafeEqual` against `capabilityHash`,
  `:368-375`). A missing handle or a mismatching one is `AUTHENTICATION_FAILED`, which stays a
  neutral control code (`CONTROL_NEUTRAL_CODES`, `:229-236`): nothing is persisted and the
  reservation stays open. A handle that is a symlink, not a regular file, or oversized fails as
  storage is classified today.
- **Invalidation on finalization (decided by score):** finalization first writes the finalized
  record as today. It then atomically replaces the handle with a consumed marker
  `{schema, kind: 'gate-observation-handle-consumed', generationId, observationId, capabilityHash}`
  that holds no raw capability. A repeat finalization of an already finalized record that finds a
  consumed marker whose `capabilityHash` equals the record's returns `finalized` without mutation.
  This keeps the documented "exactly-once and response-loss-idempotent" contract. If a crash happens
  between the record write and the marker rewrite, the raw handle remains. A repeat call
  authenticates it, writes the marker and returns `finalized`. A marker rewrite that fails after the
  finalized record is durable is best effort (decided by score). Finalization still returns
  `finalized` without a suspension. The raw handle stays until a later finalization or the removal
  of its generation.
- **Removal with the generation (decided by score):** `discard-generation` (`discardGeneration`,
  `:5651`) and `purge` (`purgeGeneration`, `:5518`) also remove
  `pilot-observation-handles/<requested generationId>/`, and only that directory: regular files
  and `.tmp-*` leftovers, refusing symlinks, then the empty directory. Deletion therefore stays
  scoped to one generation, as `docs/user-guide/model-tiering-pilot.md:198-200`, the dry-run
  confirmation and `test/pilot-measurement-contract.test.mjs:132-140` require. When the generation
  exists, removal runs under the lifecycle lock before `rename(root, tombstone)` (`:5576-5586`,
  `:5723-5741`). A crash in between leaves the generation present, and a retry finishes the
  removal. In the generation-absent branches (`:5528-5551`, `:5664-5690`), removal runs only
  inside the existing `!input.dryRun` block, after its digest and confirmation checks. The
  namespace-absent returns (`:5525`, `:5663`) are reached only by dry runs, because a confirmed run
  calls `ensureNamespace` (`:5521-5523`, `:5659-5661`, `:649-694`). Those branches only validate. A
  confirmed run against an absent namespace creates the namespace and removes through the
  generation-absent branch. Re-running purge or discard for an absent generation id therefore
  clears directories that an older helper's discard or purge left behind. Every dry run validates
  the requested handle directory and reports `observationHandles: <count>`.
  - **Absent-branch binding (decided by score):** the absent-generation dry run also returns
    `observationHandlesDigest`, an opaque inventory of that handle directory built like
    `opaqueInventory`. A confirmed absent-branch run that removes handles must echo it through a
    new optional `observationHandlesDigest` input key. A missing or mismatched value is
    `STALE_REVIEW`, and nothing is removed. Confirmed deletion therefore stays bound to what the
    dry run showed. The user guide states that the directory names under the handle root are the
    non-secret generation ids to pass.
  - **Name set:** a handle directory may contain only `<opaque>.json` and `.tmp-*` entries. Any
    other entry, symlink or non-regular file is `UNSAFE_STORAGE` in both the dry run and the
    confirmed run.
  - **Late anomalies:** for a present generation, the handle directory is outside `reviewDigest`
    and `fullInventoryDigest`. An anomaly that appears after the dry run makes the confirmed run
    fail closed with `UNSAFE_STORAGE`, and the user re-runs the dry run.

  No new abandon operation is added, and cleanup is unchanged.

- **Wisdom-file timing stays as it is (decided by score):** the run keeps `generationId`,
  `observationId`, cohort, ordinal and counters in its transient state. The wisdom file receives
  the observation handle only on a `SUSPENDED host-pr-watch` return. That handle now holds
  `generationId`, `observationId` and the three counters, and no capability. `BLOCKED-USER` still
  finalizes in Phase 6 before returning, and its re-dispatch still reserves afresh.
- **Identifiers are non-secret references (decided by score):** step 4 of
  `src/shared/pilot-measurement.md` and the wisdom bullet in `src/shared/merge-gate-delegated-run.md`
  are reworded. `generationId` and `observationId` become non-secret references, and the run must
  keep them in its own working state, and in the wisdom handle on a suspension, until
  finalization. Losing them loses the observation. They stay out of chat, delegation messages and
  pull-request artifacts. The capability is never returned, so it cannot be mentioned at all. This
  removes the wording that grouped the identifier with a secret and led to the redaction.
- **Security model shift, stated explicitly (decided by score):** the capability no longer proves
  that the caller possesses a secret. The capability check detects only a handle file that does
  not match its reservation, such as a corrupted or tampered file inside the private runtime root.
  An unknown identifier fails `NOT_FOUND` when the reservation is read, before the handle is read
  (`:4111-4114`). A stale reference to an already finalized observation returns `finalized`
  through the consumed marker. The identifier pair becomes a bearer reference inside the private,
  ignored runtime root. A run that holds another run's open
  `observationId` could finalize that observation, so foreign open references are not detected.
  This is accepted for an anonymous, local, default-off measurement whose threat is accidental
  mis-addressing. Anyone who can read the runtime root could already read the handle.
- **No protocol change:** the protocol digest covers policy, limits and enums, not operation input
  and output shapes (`pilot-measurement-protocol.mjs:300-367`). No `limits` or `enums` entry
  changes, so `PILOT_MEASUREMENT_PROTOCOL_VERSION`, the digest and the projection in
  `docs/developer-guide/model-tiering-pilot-protocol.md:29` stay unchanged. The only new input key
  is the optional `observationHandlesDigest` of purge and discard, and the protocol digest does not
  cover input keys either. No new operation is added, so `PILOT_MEASUREMENT_OPERATIONS` and the 1.77.0 lock-operation compatibility list
  (`test/pilot-measurement-orphans.test.mjs:63-78`) stay unchanged. No new script file is added, so
  `RUNTIME_SCRIPT_FILES` (`build.mjs:139`) stays unchanged.

## Affected files

| File                                                   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/pilot-measurement-core.mjs`               | Add the handle path derivation, an ignore and tracking guard for the handle root, the exclusive handle write and the no-follow read. `startGateObservation` writes the handle before the reservation under the same lifecycle lock, rolls the handle back on reservation failure and drops `capability` from its output. `finalizeGateObservation` drops the `capability` input, authenticates from the handle and rewrites it to the consumed marker. Discard and purge remove the generation's handle directory.                                                                            |
| `src/shared/pilot-measurement.md`                      | Helper summary (`:10-12`): the helper also owns capability custody. Step 4 (`:68-73`): no capability is returned. `generationId` and `observationId` are non-secret references that the run keeps in its working state until finalization, and they stay out of chat, delegation messages and pull-request artifacts. "Suspended observation" (`:86-95`): the handle holds `generationId`, `observationId` and the counters. Phase 6 step 3 (`:145-169`): remove the `capability` key. Step 4 (`:171-177`): final-report wording.                                                             |
| `src/shared/merge-gate-delegated-run.md`               | Wisdom record bullet (`:582-584`): the identifiers appear only in the handle `pilot-measurement` keeps across a `SUSPENDED host-pr-watch` return, and no capability appears at all.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `AGENTS.md`                                            | "Execution profiles" pilot-state sentence (`:61`): append "and `.effective-flow/pilot-observation-handles/`".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/shared/setup-execution-profiles.md`               | `begin-baseline` disclosure (`:125-135`): one clause saying that an open merge-gate observation keeps its random capability in a helper-owned file below `.effective-flow/pilot-observation-handles/` until finalization.                                                                                                                                                                                                                                                                                                                                                                     |
| `test/pilot-measurement.test.mjs`                      | Gate-observation tests stop passing `reservation.capability`. New cases cover the handle lifecycle, missing, tampered and symlinked handles, the consumed marker and repeat finalization, and handle removal on discard and purge.                                                                                                                                                                                                                                                                                                                                                            |
| `test/pilot-measurement-adoption.test.mjs`             | Update gate-observation calls (`:290`, `:714`, `:1204-1218`, `:2453-2567`). Re-express the workflow-capability rejection (`:2548-2556`) as a rejected `capability` key.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `test/pilot-measurement-cli.test.mjs`                  | Spawned CLI test (`:155-205`): reserve in one process and finalize in a second process with only the identifiers. Assert that no stdout or stderr carries the raw capability read from the handle file.                                                                                                                                                                                                                                                                                                                                                                                       |
| `test/pilot-measurement-git.test.mjs`                  | Real-Git check (`:72-76`): `check-ignore --no-index` also reports `.effective-flow/pilot-observation-handles` as ignored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `test/pilot-measurement-contract.test.mjs`             | Restate the invariant of "deletion remains generation-scoped" (`:132-140`) as "the generation directory plus that generation's handle directory". Pin handle removal to `pilot-observation-handles/<opaque generationId>/`, using only `unlink` and `rmdir`, never a recursive `rm`. Replace the `Never place the raw capability or observation identifier` pin (`:32`) with two pins: the new step-4 custody clause, and the unchanged exclusion of identifiers from chat, delegation messages and pull-request artifacts. Assert that the finalize payload has no `capability` key.         |
| `test/workflow-contracts.test.mjs`                     | Extend the "Suspended observation" test (`:28113-28140`) with an assertion that the handle holds no capability.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `docs/developer-guide/model-tiering-pilot-protocol.md` | Reservation and finalization contract (`:425-450`): handle custody, consumed marker and key list without `capability`. Generation discard and purge remove the requested generation's handles. For an absent generation, the removal is bound to `observationHandlesDigest` (`:250-262`). The custody paragraph says that the capability check detects only a handle file inconsistent with its reservation, and that the identifiers are bearer references. Re-dispatch survival (`:394-399`). The "All owned state stays under" sentence (`:403-404`) names the handle root.                |
| `docs/user-guide/model-tiering-pilot.md`               | `:13-18` ("Where evidence lives"): name `.effective-flow/pilot-observation-handles/` and its content, a random capability that is later reduced to its hash. `:44-48`: the helper keeps the capability, and it is never shown. The observation identifier is a non-secret reference that the run keeps until finalization. `:198-213`: purge and discard also remove the generation's handle directory. For an absent generation, the confirmed run echoes the dry run's `observationHandlesDigest`, and the directory names under the handle root are the non-secret generation ids to pass. |
| `docs/developer-guide/configuration.md`                | `:25-33` and `:388-389`: list `pilot-observation-handles/` beside `model-tiering-pilot/` as pilot-owned runtime state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `docs/developer-guide/build-system.md`                 | `:1084-1089`: the core also owns the handle root.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `docs/developer-guide/architecture.md`                 | `:944`: name the handle root beside `model-tiering-pilot/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Implementation details

### Approach

1. **Handle primitives in the core.** Add a path helper. It takes the guard context and the
   validated opaque `generationId` and `observationId`, and returns
   `<runtimeDirectory>/pilot-observation-handles/<generationId>/<observationId>.json`. Add a guard
   that checks the handle root is untracked and ignored (same `check-ignore --no-index` call as
   `:477-479`), and that every existing component is a real directory, not a symlink. Add a
   create-directories step (`0700`), an exclusive handle write (`0600`, `O_EXCL|O_NOFOLLOW`, fsync
   and directory sync), and a dedicated atomic replace for the consumed marker. The replace writes
   a temporary file at `0600` and then renames it. Use `skipCapacity: true` or a separate
   primitive, because `atomicWrite`'s capacity projection measures the generation tree
   (`:868-881`), and the handle lies outside it. Read the handle with
   `readRegular(..., { missing: true, maximum: <small cap> })` (`:400-406`), mapping `null` to
   `AUTHENTICATION_FAILED` rather than `NOT_FOUND`, and validate its exact keys.
2. **Reservation.** In `startGateObservation`, inside the existing lifecycle lock and after
   admission and evidence-health checks, write the handle after the capability is generated. The
   handle write comes before the `state.json` ordinal increment (`:4017-4024`), so a failed handle
   write consumes no ordinal. If any step between the handle write and a durable reservation
   record fails, remove the handle best effort and fail as today, through
   `guardedObservationMutation`. Those steps are the `state.json` write (`WRITE_FAILED` or
   `CAPACITY_EXHAUSTED`, `:866-882`) and the reservation-record write (`:4025-4034`). Rollback does
   not apply to `flagOpenReservations` after the record exists. Never
   return `reserved` unless both files exist. Remove `capability` from the success envelope.
3. **Finalization.** In `finalizeGateObservation`, remove `capability` from the exact key list
   (`:4067-4077`). Read the reservation as today, then the handle:
   - raw handle: check its bound identifiers, authenticate, write the finalized record, then
     call `syncDirectory` on `gate-observations/` so the record rename is durable. `atomicWrite`
     does not sync the parent directory after `rename` (`:889-900`). Next, atomically replace the
     handle with the consumed marker and sync the handle directory. A surviving marker therefore
     always implies a durable finalized record;
   - consumed marker on an already finalized record with an equal `capabilityHash`: return
     `finalized` without mutation;
   - consumed marker on an open reservation: reject as a storage fault, without finalizing;
   - missing handle or identifier or hash mismatch: `AUTHENTICATION_FAILED`;
   - raw handle on an already finalized record (crash window): authenticate, write the marker,
     return `finalized`;
   - a marker rewrite that fails after the finalized record is durable: catch the error inside
     finalization, before `guardedObservationMutation` classifies it, and return `finalized`.
4. **Generation removal.** In `discardGeneration` and `purgeGeneration`:
   - Remove the requested generation's handle directory, regular files and `.tmp-*` leftovers
     only, before the generation tree is tombstoned. An absent directory is a no-op.
   - In the generation-absent branch, run the same removal only inside its `!input.dryRun` block,
     and only after the echoed `observationHandlesDigest` matches. In the namespace-absent dry-run
     branch, only validate. Never touch another generation id's directory.
   - Add `observationHandles: <count>` for the requested generation to every dry-run result. Add
     `observationHandlesDigest` to the absent-generation dry-run result.
   - Accept only `<opaque>.json` and `.tmp-*` entries. Any other entry is `UNSAFE_STORAGE`.
   - In the dry run, validate the handle directory so that a symlink or a non-regular entry is
     reported before confirmation. A confirmed run fails closed with the storage code those
     operations already use.
5. **Prose.** Update `src/shared/pilot-measurement.md` and `src/shared/merge-gate-delegated-run.md`
   as listed above. State once, in step 4, that the helper keeps the capability and that the run
   keeps the identifiers as non-secret references. Append the handle root to the `AGENTS.md`
   pilot-state sentence. Keep every sentence pinned by
   `test/workflow-contracts.test.mjs:28113-28140` verbatim, or update the pin in the same change.
   Do not change `src/tools/merge-gate.md` or `src/shared/host-pr-watch.md`: their handle sentences
   stay correct. Add the one-clause disclosure to `src/shared/setup-execution-profiles.md`.
6. **Documentation.** Update the five docs listed above in English.
7. **Tests.** Update the existing gate-observation tests and add the new ones listed under
   "Validation plan".

### Component structure

Not relevant: no new module. All runtime changes stay inside `pilot-measurement-core.mjs` behind
the unchanged CLI `pilot-measurement.mjs`.

### State management

The handle has three states. It is absent before reservation. It is raw (holding the capability)
from reservation until finalization. It is consumed (holding only the capability hash) after
finalization, until its generation is discarded or purged. The reservation record format is
unchanged.

### API integration

Not relevant: no forge or network interaction.

### Styling approach

Not relevant: no UI.

### Accessibility

Not relevant: no UI.

### Edge cases

- Handle write fails (root is a symlink, a non-directory component, `EEXIST`, guard failure): no
  reservation is written, and the failure is classified like a reservation fault today.
- The `state.json` or reservation write fails after the handle exists: the handle is removed best
  effort, and a leftover is removed with its generation. A leftover authenticates nothing.
- A reservation made by the new helper and finalized by an older helper, for example after a
  `SUSPENDED host-pr-watch` re-dispatch under another installed version: the older helper requires
  `capability` (`:4067-4077`), which the wisdom handle no longer carries. The observation stays
  open until `begin-review` and `discard-generation`, the same neutral loss as the reverse
  direction.
- Finalization with a missing handle, for example for a reservation made by an older helper
  without handles: `AUTHENTICATION_FAILED`, neutral, and the reservation stays open. It clears
  through `begin-review` and `discard-generation` like a lost capability today.
- A tampered handle whose capability does not match the hash, or whose bound identifiers differ:
  `AUTHENTICATION_FAILED`.
- A symlinked or non-regular handle file: never followed; storage failure.
- Repeat finalization after a lost response: the consumed marker gives `finalized` with no
  mutation.
- A crash between the finalized-record write and the marker rewrite: a repeat call authenticates
  the raw handle, writes the marker and returns `finalized`.
- A marker rewrite that fails after the record is durable: the call returns `finalized`, no
  suspension is persisted, and the raw handle stays until its generation is removed.
- Handle directories left behind by an older helper's discard or purge: re-running `purge` or
  `discard-generation` for that absent generation id removes them.
- A run that holds another run's open `observationId`: it can finalize that observation. This is
  accepted and documented as a bearer reference inside the runtime root.
- A wisdom-file handle written by an older release that still contains a capability: the new prose
  sends no capability, so the leftover value is ignored. Finalization authenticates from the helper
  handle if one exists, otherwise `AUTHENTICATION_FAILED`.
- Number of handles: bounded per generation by the existing observation cap (test `:1267-1281`).
- An older helper in the same repository never reads `pilot-observation-handles/`, so its
  generation checks are unaffected.

## Acceptance criteria

The change is complete when every criterion below holds and the CI-order checks in the validation
plan pass:

- [ ] The `start-gate-observation` success envelope has no `capability` key. In a spawned-CLI test,
      the raw capability read from the handle file appears in no stdout or stderr of
      `start-gate-observation` or `finalize-gate-observation`.
- [ ] `finalize-gate-observation` accepts exactly its former key set without `capability`. A
      payload with `capability` is `INVALID_PAYLOAD`.
- [ ] A second, separate CLI process that has only `generationId` and `observationId` finalizes a
      reservation made by the first process.
- [ ] A missing handle, a handle with a wrong capability and a handle with mismatched identifiers
      each give exactly the code `AUTHENTICATION_FAILED`, not `NOT_FOUND`, with
      `pilotControlOutcome: none`, and the reservation stays
      open. A symlinked handle is not followed and gives `UNSAFE_STORAGE`, as in the anomaly table.
- [ ] The handle file is mode `0600` and its directories are `0700`. Reservation writes no handle
      and no reservation, and consumes no ordinal, in two cases. A symlinked component gives
      `UNSAFE_STORAGE` with a persisted `evidence-gap`. A handle-root ignore-check failure through
      an injected runner gives `UNSAFE_RUNTIME_ROOT` with `pilotControlOutcome: none`.
- [ ] After finalization, the handle file holds no raw capability (consumed marker). A repeat
      finalization returns `finalized` without changing the record. An injected marker-write
      failure after the record write still returns `ok: true` with `result.status: 'finalized'`.
      No `suspension.json` is written, and the generation state and the record are unchanged.
- [ ] After `discard-generation` and after `purge`, no `pilot-observation-handles/<generationId>/`
      directory remains for the requested generation. Another generation id's directory is left
      untouched. A handle directory of an absent generation is removed by a confirmed purge or
      discard for that id only when the echoed `observationHandlesDigest` equals the dry run's
      value. A missing or mismatched value gives `STALE_REVIEW` and removes nothing. An entry
      other than `<opaque>.json` or `.tmp-*` gives `UNSAFE_STORAGE`.
- [ ] `src/shared/pilot-measurement.md` has no `capability` key in its finalize payload. Its step 4
      says the helper keeps the capability and calls the identifiers non-secret references that
      stay out of chat, delegation messages and pull-request artifacts. Its "Suspended observation"
      handle lists only `generationId`, `observationId` and the three counters. Contract tests pin
      these statements.
- [ ] The `AGENTS.md` pilot-state sentence names `.effective-flow/pilot-observation-handles/`.

## Validation plan

- Unit tests in `test/pilot-measurement.test.mjs`: the handle lifecycle (absent, raw, consumed),
  file modes, identifier binding, the missing, wrong and symlinked handle cases, repeat
  finalization, the crash window simulated with an injected failure between the record write and
  the marker write, a failed marker write that still returns `finalized`, reservation rollback
  after injected `state.json` and reservation-write failures, and discard/purge removal. Removal is
  covered for a present generation and for an absent generation. For an absent namespace, the dry
  run validates and reports, and the confirmed run removes through the generation-absent branch. A
  foreign generation's directory is left untouched. The marker-failure case asserts
  `result.status: 'finalized'`, no `suspension.json` and an unchanged generation state. The
  absent-branch binding is covered by a matching, a missing and a mismatched
  `observationHandlesDigest`. An unexpected entry name in a handle directory is covered as well.
- `test/pilot-measurement-cli.test.mjs`: reserve and finalize in two processes, with the absence
  assertion on all output.
- Contract tests: `test/pilot-measurement-contract.test.mjs` and `test/workflow-contracts.test.mjs`
  as above.
- CI order from `AGENTS.md`: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  `pnpm test:distribution`. Run `pnpm test:preflight` first in the worker environment.
- `node build.mjs`: confirm that the `Always-loaded core (lines/budget)` report shows no
  merge-gate budget change. The edited fragments are lazy.
- `pnpm eval merge-gate verify`: record the expected freshness debt from editing fragments in the
  merge-gate load closure, following `docs/adr/pragmatic-test-release-policy.md`. Do not record
  new evidence in this change.

## Assumptions and open points

- Out of scope, follow-up: `build`, `refactor` and `fix` keep a transient workflow capability with
  the same custody risk (`src/shared/pilot-measurement-workflow.md:328-329`). A separate issue
  should decide whether the same handle pattern applies there.
- Out of scope, follow-up: binding a handle to a run-scoped key would detect foreign open
  references. It is not needed for this bugfix.
- With the wisdom-timing decision, the run must still keep the `observationId` in its working state
  between reservation and finalization. Step 4 now calls it a non-secret reference that must be
  kept, and the capability never reaches the model, which removes the incident's cause.
- `docs/developer-guide/architecture.md:1198` concerns the build-run workflow capability. That
  capability stays transient and is out of scope.
- The protocol digest does not cover operation schemas (verified in
  `pilot-measurement-protocol.mjs:300-367`). Existing protocol tests confirm that the digest is
  unchanged.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-CLR",
    "question": "Where does start-gate-observation persist the capability handle, and how is it addressed?",
    "options": ["In-generation handle directory", "Helper-owned sibling directory", "Caller-supplied handle path", "Decide later"],
    "escape": ["Decide later"],
    "scores": [
      { "label": "In-generation handle directory", "score": 3, "reason": "An older released helper fails with UNSAFE_STORAGE on any unknown generation-tree directory, so a shared generation would break mixed-version repositories, and every closed set and the evidence digest would have to widen." },
      { "label": "Helper-owned sibling directory", "score": 8, "reason": "Older helpers never see it and every closed set and the evidence inventory stay unchanged; the path comes from validated opaque ids, so only explicit handle cleanup and ignore guarding are added." },
      { "label": "Caller-supplied handle path", "score": 3, "reason": "The helper must validate an arbitrary caller path and the caller must still keep that path across delegation, the same transient-state loss the issue describes." }
    ]
  },
  {
    "site": "S-CLR",
    "question": "How does the finalize input treat the raw capability field after the change?",
    "options": ["Remove the capability field", "Keep an optional capability fallback", "Decide later"],
    "escape": ["Decide later"],
    "scores": [
      { "label": "Remove the capability field", "score": 8, "reason": "It meets acceptance criteria 1 and 3 with one closed, handle-only way to authenticate; a handle-less reservation from an older helper ends where lost-capability reservations already end, cleared through begin-review and discard-generation." },
      { "label": "Keep an optional capability fallback", "score": 4, "reason": "It helps only a rare older-helper reservation whose capability a run still holds, at the price of a second raw-capability input path that breaks the missing-handle rejection and keeps the raw value model-visible." }
    ]
  },
  {
    "site": "S-CLR",
    "question": "What does abandon in acceptance criterion 4 cover for gate-observation handles?",
    "options": ["Existing generation discard", "New gate-observation abandon path", "Decide later"],
    "escape": ["Decide later"],
    "scores": [
      { "label": "Existing generation discard", "score": 8, "reason": "abandon-reservation only handles workflow reservations and an open gate observation clears only through begin-review followed by discard-generation, so reading abandon as those exit paths meets criterion 4 without new protocol, cleanup flow or tests." },
      { "label": "New gate-observation abandon path", "score": 4, "reason": "Workable, but it rests on the issue mistaken premise and adds a helper operation, a cleanup flow, protocol and documentation changes that criterion 4 does not require." }
    ]
  },
  {
    "site": "S-CLR",
    "question": "When is the observation reference (generationId, observationId, the three counters) written to the gate run wisdom file?",
    "options": ["From reservation until finalization", "Only at a host-pr-watch suspension", "Decide later"],
    "escape": ["Decide later"],
    "scores": [
      { "label": "From reservation until finalization", "score": 4, "reason": "It would also cover a delegated run that dies mid-gate, but goes beyond the reported incident, conflicts with the rule that a re-dispatch finding a handle continues rather than finalizes, and forces rewriting the BLOCKED-USER, Phase 6 and caller-side ending contracts." },
      { "label": "Only at a host-pr-watch suspension", "score": 7, "reason": "It fixes the reported incident with the smallest change and matches the issue wording, since the suspension handle failed only because it lacked the capability and the BLOCKED-USER path already finalizes in Phase 6 and reserves afresh." }
    ]
  },
  {
    "site": "S-CLR",
    "question": "What does finalize-gate-observation do with the handle after it writes the finalized record?",
    "options": ["Delete the handle on finalize", "Replace the handle with a consumed marker", "Decide later"],
    "escape": ["Decide later"],
    "scores": [
      { "label": "Delete the handle on finalize", "score": 5, "reason": "Simpler and meets criterion 4, but drops the documented response-loss idempotency, breaks the existing second-finalize test, and answers a repeated finalize of a finalized observation with a misleading neutral AUTHENTICATION_FAILED." },
      { "label": "Replace the handle with a consumed marker", "score": 8, "reason": "A marker without the raw capability counts as invalidated under criterion 4 and keeps the documented exactly-once, response-loss-idempotent contract and the existing test, at the cost of one more file state to define and test." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How should the plan address the risk that a run redacts or drops observationId, the same way the capability was lost?",
    "options": ["Accept the residual risk", "Reword as non-secret references", "Helper lookup by run-held key", "Decide later"],
    "escape": ["Decide later"],
    "scores": [
      { "label": "Accept the residual risk", "score": 3, "reason": "Step 4 would still group observationId with the capability under the never-place rule, so a run could redact the identifier just as it did the capability and finalization would fail again." },
      { "label": "Reword as non-secret references", "score": 9, "reason": "It removes the prose that made the identifier look secret and keeps identifiers out of chat, delegation messages and PR artifacts, pinned by a contract test; it beats the helper lookup because it adds no input field, scope or attack surface." },
      { "label": "Helper lookup by run-held key", "score": 5, "reason": "It would recover a dropped observationId, but adds an input field, a lookup path and scope, and the key is still a value the run has to keep." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How should the plan treat foreign open-observation references?",
    "options": ["Correct the claim", "Bind to a run-scoped key", "Keep the bullet as written", "Decide later"],
    "escape": ["Decide later"],
    "scores": [
      { "label": "Correct the claim", "score": 8, "reason": "Rewording makes the bullet accurate for a local, default-off pilot whose only threat is accidental mis-addressing and notes run binding as a follow-up, without a new input field." },
      { "label": "Bind to a run-scoped key", "score": 5, "reason": "It would catch foreign open references, but widens both operations and adds a session-identity dependency to guard against a rare accidental mix-up." },
      { "label": "Keep the bullet as written", "score": 1, "reason": "The claim is false for foreign open observations, so keeping it leaves a known inaccurate security statement." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How is a failed consumed-marker rewrite classified after the finalized record is already durable?",
    "options": ["Best effort, return finalized", "Neutral control code", "Keep fault classification", "Decide later"],
    "escape": ["Decide later"],
    "scores": [
      { "label": "Best effort, return finalized", "score": 8, "reason": "The finalized record is durable and complete and a leftover raw handle only allows the same idempotent finalized answer until generation removal, so swallowing the failure avoids a false failure or a pilot suspension." },
      { "label": "Neutral control code", "score": 3, "reason": "It reports an error for an already finalized observation, and since ambiguous mutations are never retried the caller cannot act on it." },
      { "label": "Keep fault classification", "score": 4, "reason": "Consistent with today catch-all handling, but it persists a pilot-wide evidence-gap suspension when no evidence is missing." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "What scope does handle removal in discard-generation and purge have?",
    "options": ["Cross-generation sweep in every branch", "Requested generation only, every branch", "Sweep orphans at begin-baseline", "Decide later"],
    "escape": ["Decide later"],
    "scores": [
      { "label": "Cross-generation sweep in every branch", "score": 2, "reason": "It widens a confirmed generation-bound purge or discard to other generations, contradicting the user guide, the single-generation dry-run confirmation and the generation-scoped deletion contract test." },
      { "label": "Requested generation only, every branch", "score": 9, "reason": "Deletion stays scoped to one generation as documented, confirmed and pinned, both early-return branches are specified, and older-helper leftovers clear by re-running for the absent id; its edge over the begin-baseline sweep is that it adds no side effect to another command." },
      { "label": "Sweep orphans at begin-baseline", "score": 6, "reason": "Safe because only one generation exists at a time, but it gives begin-baseline an undocumented deletion and leaves the early-return branches unspecified." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Does the change update the AGENTS.md pilot-state sentence?",
    "options": ["Append the handle root", "Keep AGENTS.md unchanged", "Decide later"],
    "escape": ["Decide later"],
    "scores": [
      { "label": "Append the handle root", "score": 8, "reason": "With a second pilot-owned root the sentence becomes incomplete and could mislead an agent writing name sets or cleanup rules; four words per session is a tolerable cost for a load-bearing fact." },
      { "label": "Keep AGENTS.md unchanged", "score": 4, "reason": "Shorter, but agents reading only AGENTS.md before touching runtime-state checks would not know the handle root." }
    ]
  },
  {
    "site": "S-DEC",
    "question": "How is confirmed handle removal in the absent-generation branch bound and made discoverable?",
    "options": ["Digest-bound handle inventory", "Unbound removal, documented", "No removal for absent generations", "Decide later"],
    "escape": ["Decide later"],
    "scores": [
      { "label": "Digest-bound handle inventory", "score": 8, "reason": "The only option that keeps confirmed deletion in the absent branch under the documented dry-run plus exact-digest contract, reusing STALE_REVIEW with one optional key and documenting directory names for discovery." },
      { "label": "Unbound removal, documented", "score": 5, "reason": "Workable because leftover handles authenticate nothing once the reservation is gone, but it adds an exception to the dry-run-plus-digest deletion contract in the user guide." },
      { "label": "No removal for absent generations", "score": 2, "reason": "Contradicts the earlier scored every-branch removal decision and leaves no supported way to clear mixed-version leftovers." }
    ]
  }
]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         3 |    0 |
| Error cases     |        0 |         1 |    5 |
| Testability     |        0 |         3 |    2 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         1 |    3 |

### Findings

The Phase 4 gap analysis found 4 Important findings and 8 Notes. Each was either incorporated or
turned into a scored decision. Those findings covered orphaned handles, the anomaly
classification, the order of the ordinal and rollback, capacity accounting, the dry run, the
follow-up for workflow capabilities, and the three batch decisions. The internal review below
covers this round and the full re-review that followed the batch answers. All findings are
incorporated.

- Testability, Important: the generation-scoped deletion pin
  (`test/pilot-measurement-contract.test.mjs:132-140`) was not listed. It is now restated and
  extended to the handle directory.
- Data protection, Important: a sweep of orphaned handles across generations would have widened a
  confirmed purge or discard. It was resolved by score: removal is limited to the requested
  generation and also runs in the absent branches.
- Data protection, Important: the user guide's "Where evidence lives" section and its purge
  section were missing from Affected files. They are now added.
- Testability, Important: acceptance criterion 5 contradicted the fault classification. It now
  names `UNSAFE_STORAGE` with `evidence-gap` and `UNSAFE_RUNTIME_ROOT` with `none`.
- Error cases, Important: removal in the namespace-absent branch is reachable only by a dry run.
  Removal now runs only inside the confirmed generation-absent block, and dry runs only validate.
- Testability, Important: the marker-failure criterion relied on a `pilotControlOutcome` field
  that success envelopes do not carry. It now checks `result.status`, the absence of
  `suspension.json` and an unchanged state.
- Maintainability, Important: settled points were still listed as pending. They are now removed.
- Error cases, Note: the order between the record and the marker was not durable. A directory
  sync was added before the marker.
- Error cases, Note: rollback now also covers a failed `state.json` write.
- Error cases, Note: a parent-directory sync was added after creating handle directories.
- Error cases, Note: two edge cases were added: a reservation that an older helper finalizes, and
  dry-run reporting of `observationHandles` for leftovers.
- Maintainability, Note: an internal miscount and a stale line reference were corrected.
- Maintainability, Note: the helper file is renamed to "capability file" in shipped prose. The
  `AGENTS.md` path is now fully qualified, and the user-guide identifier wording is added.
- Maintainability, Note: `AGENTS.md` now names the handle root, resolved by score.
- Testability, Note: a real-Git ignore check for the handle root was added.

Deep plan review. Its findings are counted in the summary above, and all are incorporated:

- Data protection, Important: confirmed handle removal for an absent generation was bound to no
  digest, and the generation id could not be discovered. Resolved by score: the absent-branch dry
  run returns `observationHandlesDigest`, the confirmed run echoes it (`STALE_REVIEW` on a
  mismatch), and the user guide names the directory names as the ids to pass.
- Security, Note: the security bullet overstated what the capability proves. It now says that the
  check detects only a handle file that does not match its reservation, and that an unknown
  identifier fails `NOT_FOUND`.
- Error cases, Note: the "never fails on an unreported anomaly" promise is replaced by fail-closed
  behaviour and a re-run of the dry run. The entry-name set of a handle directory is now fixed.
- Testability, Note: a missing handle is read with `missing: true` and mapped to
  `AUTHENTICATION_FAILED`. Tests assert the exact code.

## Open points

- No open points.
