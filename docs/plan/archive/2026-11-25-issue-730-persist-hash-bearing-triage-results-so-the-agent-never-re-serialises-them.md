# Persist hash-bearing triage results so the agent never re-serialises them

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Issue:** #730

## Requirement

The triage helper (`src/scripts/triage.mjs` over `src/scripts/triage-core.mjs`, driven by
`src/tools/triage.md`) returns four hash-bearing objects that the agent must pass back unchanged:
`permission` (`permission-prove`, hash key `proofHash`), `inventory` (`inventory-build`,
`inventoryHash`), `validated` (`verdicts-validate`, `validatedHash`) and `writeSet`
(`write-set-build`, `setHash`). Today the helper returns them only inside the stdout envelope, and
`triage.md` asks the agent to write them into agent-authored input files. For a multi-issue run the
`inventory` is about 50 KB; one altered byte ends the run with `TAMPERED_INPUT`, and a recent run
fell back to reading its own private session transcript to reassemble the payloads.

Goal: the agent never copies a hash-bearing object. The helper persists each such object itself
under the runtime guard, returns its absolute path, and every later operation accepts that path as a
reference field verified with exactly today's tamper check.

The workflow is **Feature**: it adds new helper behaviour (persisted outputs, reference fields, a
run-scoped cleanup) and changes the agent-facing contract in `triage.md`; it is not a pure
restructuring and fixes no defect in existing behaviour.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #730
**Original outcome:** A multi-issue `/effective-flow triage` run completes without the agent
re-emitting any hash-bearing object and without reading any transcript or session file; inline
objects stay supported and `TAMPERED_INPUT` semantics stay unchanged.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** helper-persisted output files plus per-object reference fields (issue
design (a)); this plan is the first attempt.
**Continuation decision:** none

## Architecture decisions

- **Design (a), reference fields.** Each consuming operation accepts, beside its inline field, a
  reference field `<name>File` (`permissionFile`, `inventoryFile`, `validatedFile`, `writeSetFile`)
  holding an absolute path. Rationale: the agent copies only a path; the whole-input `inputFile`
  form stays unchanged for agent-authored inputs; design (b) would still need an agent-written
  merge file and adds moving parts without a tamper-check benefit.
- **The path is part of the hashed object.** The producer allocates the output path first, adds it
  to the object as `inputFile`, then computes the hash over the object including `inputFile`, and
  writes exactly that object. The envelope `data` is that same object. Rationale: `data` is the
  hash-bearing object itself (for example `permissionProve` returns `withHash({...}, 'proofHash')`
  directly), so an extra key outside the hash would make an inline pass-back of `data` fail with
  `TAMPERED_INPUT`. Hashing the path in keeps inline callers working, makes the file's object
  deep-equal the envelope's object byte for byte, and leaves `verifyHashed` untouched.
- **Central reference resolution.** `executeOperation` resolves reference fields after the existing
  whole-input `inputFile` resolution and before the handler: for each allowed `<name>File` of the
  operation it reads the file and substitutes it under `<name>`. The handlers' existing
  `exactKeys`, `requireProof`, `requireInventory`, `requireValidated`, `verifyWriteSet` and
  `verifyDerivation` then run unchanged on the substituted object, so tamper detection is identical
  for inline and referenced objects. Passing both `<name>` and `<name>File`, or a reference field an
  operation does not consume, is `INVALID_PAYLOAD`. After the hash verifies, the resolver also
  requires the object's `inputFile` to equal the referenced path, and, where the operation knows
  its runtime root (an input `runtimeStateRoot` or the verified `inventory.runtimeStateRoot`), the
  referenced path to equal `<resolved root>/.effective-flow/triage/inputs/<name>`; a mismatch is
  `INVALID_PAYLOAD`. An input `runtimeStateRoot` is resolved through `resolveRuntimeRoot` before
  the comparison (as `reportWrite` already compares `context.cwd` with
  `inventory.runtimeStateRoot`), so a symlinked or non-canonical root string does not reject a
  legitimate run. The resolver reads and verifies `inventoryFile` first and checks the operation's
  other references against the verified `inventory.runtimeStateRoot`; when `inventory` arrives
  inline beside another reference field, the resolver runs `requireInventory` on it and uses its
  verified `runtimeStateRoot` the same way (decided by score), so the containment check never
  silently lapses. `write-set-build` and `write-set-apply` also require `permission.runId` to
  equal `inventory.runId` when the permission carries a `runId`, else `INVALID_PAYLOAD` (decided
  by score). This binds a file to its own path and run instead of accepting a copied or foreign
  file.
- **Non-removing guarded read.** Reference reads share `readInputFile`'s path, containment,
  symlink, regular-file, dev/ino and size checks but do not unlink, because `permission`,
  `inventory` and `validated` have several consumers. The shared checks are factored into one
  reader with a remove flag rather than duplicated. A reference file name must match the exact
  helper-output pattern of the kind its field names (for example `inventoryFile` accepts only an
  inventory output name, never an agent-authored `inventory-build-1.json`); the pattern follows the
  file-name scheme decided for run association.
- **Lifecycle: retained until the run's `snapshot-remove`.** Helper-written output files are never
  removed on consumption; `snapshot-remove` with `{runtimeStateRoot, runId}` removes all output
  files of that run, and the existing day-old sweep (`snapshot-remove` without `runId`) still
  removes leftovers. Rationale: only `writeSet` has a single consumer (`write-set-apply`), and a
  retry after a failed apply would otherwise lose its input; one uniform rule is simpler to state
  once in `triage.md`. Agent-authored whole-input `inputFile` files keep today's read-and-remove.
  This deliberately departs from the issue's requirement 3 wording (remove a single-consumer file
  once its consumer succeeds); the PR states the departure and this reason. Three further labelled
  departures for the PR: the hashed objects gain the keys `inputFile` (all four) and `runId`
  (permission), which extends what is hashed although the issue puts "changing what is hashed" out
  of scope, because the path must sit inside the hash for inline pass-back to keep working; and
  output files are named `<kind>-<runId>-<n>.json` instead of the issue's `<kind>-<n>.json`,
  because names must carry the run so that `snapshot-remove {runId}` matches only that run's
  files; and the one-byte tamper criterion is narrowed to a value byte that keeps valid JSON, because a
  JSON-breaking byte is `INVALID_PAYLOAD` and a whitespace byte does not change the canonical
  JSON, both unchanged semantics.
- **`permission-prove` gains an optional `runtimeStateRoot`.** Without it the operation behaves as
  today and writes no file; `triage.md` Phase 2 always passes `RUNTIME_STATE_ROOT`. A stopped
  permission (`stopped: true`, unhashed) writes no file.
- **Run association: `permission-prove` mints the run id (decided by score).** With
  `runtimeStateRoot`, `permission-prove` mints a run id in today's `RUN_ID` format
  (`<local date>-<8 hex>`) and carries it inside the hashed permission as `runId`.
  `inventory-build` adopts `permission.runId` when present and mints one as today otherwise.
  Right after `requireProof` and before any forge read or scan-cursor write, it fails with
  `INVALID_PAYLOAD` when `snapshots/<runId>` or `reports/<runId>.md` already exists, so one proof
  cannot start two inventories once its snapshot or report exists, not even after the first
  run's `snapshot-remove`, and no report is overwritten; the existing `guardedMkdir` check in `writeSnapshot` stays the race backstop. Every output file is named `<kind>-<runId>-<n>.json`, and
  the exact output pattern of a kind is `<kind>-<RUN_ID>-<n>.json` with a positive decimal `<n>`
  (it fits the `INPUT_FILE` length limit). `snapshot-remove {runtimeStateRoot, runId}` removes
  exactly the output files whose name carries that `runId`, so a concurrent run's files are never
  matched. The hash is tamper evidence, not authentication: a model could forge a permission with
  another run's id, which the existence checks above refuse once that run has a snapshot or
  report (residual risk under Assumptions). The `triage.md` exit rule fires once
  `permission-prove` has returned a `runId` and uses `permission.runId`, so a stop between
  permission and inventory (a declined foreign URL, a bounds stop, an `inventory-build` error)
  still removes the permission file; `snapshot-remove {runId}` already succeeds when the run has
  no snapshot directory. Rationale: the agent copies no hash-bearing object at all, including `permission`,
  which three later operations consume.
- **Whole-input reader refuses helper-output names (decided by score).** The whole-input
  `{"inputFile": …}` path rejects a file whose name matches any kind's exact output pattern with
  `INVALID_PAYLOAD` before it removes anything, so a returned path sent the wrong way never
  deletes a multi-consumer object. The returned field keeps the issue's name `inputFile`.
- **backlog-audit is a follow-up (decided by score).** `backlog-audit` has the same pass-back
  pattern (`permission`, `inventory`, `merged`, `writeSet`; agent-written files under
  `.effective-flow/backlog-audit/inputs/`). This plan does not change it; the implementing run
  opens a follow-up issue for backlog-audit and links it from the PR.
- **Runtime state root for later producers.** `verdicts-validate` and `write-set-build` take no
  `runtimeStateRoot` input; they persist under `inventory.runtimeStateRoot`, which is covered by the
  verified `inventoryHash`.
- **Writes use the existing guard.** Output files are created with `createNoClobber` from
  `src/scripts/runtime-state-guard.mjs` (with a dedicated temp prefix that satisfies its
  `NO_CLOBBER_PREFIX_PATTERN`), after `resolveRuntimeRoot` and guarded creation of
  `.effective-flow/triage/inputs/`. The lowest free `<n>` is allocated in the core: try `n = 1, 2,
…`, and on an existing file move to the next `n` and recompute the hash (the path is hashed);
  stop with an error after a fixed bound. The dedicated prefix defines an output-temp name pattern
  (`.<prefix><hex>.tmp`, as `createNoClobber` writes it); both the day-old sweep and the run-scoped
  removal accept that pattern: they remove stale temps and skip fresh ones (a concurrent run may be
  inside `createNoClobber`) instead of failing closed with `UNSAFE_RUNTIME_STATE`, mirroring how
  snapshots accept `SNAPSHOT_TEMP`. All names match the existing `INPUT_FILE` pattern
  (`/^[a-z0-9][a-z0-9-]{0,78}\.json$/`). `<kind>` is `permission`, `inventory`, `validated` or
  `writeset`.

## Affected files

| File                                                 | Description                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/triage-core.mjs`                        | Output-file persistence in the four producers; optional `runtimeStateRoot` for `permission-prove`; reference-field resolution in `executeOperation`; shared non-removing guarded reader factored out of `readInputFile`; run-scoped removal of output files in `snapshotRemove`                                                                                                     |
| `src/tools/triage.md`                                | "Arguments and helper calls" and "Input files": pass the returned `inputFile` as the reference field, never re-serialise a hash-bearing object (stated once); exit rule fires once `permission-prove` returned a `runId`; Phase 2 passes `runtimeStateRoot` to `permission-prove`; later call shapes use reference fields; net line change zero or less, `contextBudget` not raised |
| `test/triage-core.test.mjs`                          | New tests for persistence, the reference-field chain, tamper and path rejection, run-scoped cleanup                                                                                                                                                                                                                                                                                 |
| `test/triage-contract.test.mjs`                      | One assertion that `triage.md` states the reference-field rule, naming the invariant it protects                                                                                                                                                                                                                                                                                    |
| `docs/developer-guide/subagent-progress-coverage.md` | Update the three `triage.md` line references if the spawn-site markers move                                                                                                                                                                                                                                                                                                         |

No change to `build.mjs`: `triage.mjs` and `triage-core.mjs` are already in `RUNTIME_SCRIPT_FILES`
and no new runtime script is added.

## Implementation details

### Approach

1. **Shared guarded reader.** Factor the checks of `readInputFile` (absolute path, `INPUT_FILE`
   name, exact `<root>/.effective-flow/triage/inputs/<name>` shape, `resolveRuntimeRoot`, per
   component `realDirectoryOrNull`, `lstat` regular file, `readRegularFile` bound, JSON parse) into
   one internal reader with a `remove` option. `readInputFile` keeps read-and-remove but first
   rejects a helper-output name (any kind's exact output pattern) with `INVALID_PAYLOAD`; the
   reference resolver uses read-only. Error codes otherwise stay those `readInputFile` produces
   today.
2. **Output writer.** Add one internal `persistOutput(context/deps, runtimeStateRoot, kind, runKey,
value, hashKey)` that ensures the guarded inputs directory, allocates the lowest free `<n>`,
   builds `{...value, inputFile: <absolute path>}`, applies `withHash` over it and writes it with
   `createNoClobber`; it returns the hashed object. A guard failure maps through the existing
   `guardFailure`. The run key is the run id; `permissionProve` mints it when `runtimeStateRoot` is
   supplied, and `inventoryBuild` adopts `permission.runId` (see "Run association").
3. **Producers.** `permissionProve` (only when `runtimeStateRoot` is supplied and the proof is not
   stopped), `inventoryBuild`, `verdictsValidate` and `writeSetBuild` return the persisted object
   instead of the bare `withHash` result. Persisting is the last step before return, so a failing
   operation (for example `VERDICTS_INVALID`) writes nothing. `verdictsValidate` and
   `writeSetBuild` gain the `deps` parameter (passed by `HANDLERS`) to reach the runtime guard. An
   unhashed early return (a stopped permission, a stopped inventory) writes no file; both
   `withHash` branches of `writeSetBuild` (forge and report-only) are persisted. If persisting fails
   after `inventoryBuild` has written its snapshot, it removes that run's snapshot directory the
   way `writeSnapshot` cleans up on failure, so a failed persist leaves no orphaned snapshot.
4. **Reference fields.** In `executeOperation`, after the whole-input `inputFile` substitution, map
   each operation to its allowed reference fields: `inventory-build` → `permissionFile`;
   `verdicts-validate` → `inventoryFile`; `report-write` → `inventoryFile`, `validatedFile`;
   `write-set-build` → `inventoryFile`, `validatedFile`, `permissionFile`; `write-set-apply` →
   `permissionFile`, `inventoryFile`, `writeSetFile`. Reject both forms together, a reference
   field the operation does not consume, and a file whose name does not match the exact output
   pattern of the field's kind (an agent-authored `inventory-build-1.json` is rejected), with
   `INVALID_PAYLOAD`. Verify `inventoryFile` first, then the other references against its verified
   `inventory.runtimeStateRoot`. Substitute the parsed object under the inline key and call the
   handler unchanged.
5. **Run-scoped cleanup.** Extend `snapshotRemove` so that a call with `runId` also removes the
   output files of that run in `.effective-flow/triage/inputs/` (and only those), with
   `guardedUnlink`; unexpected entries keep raising `UNSAFE_RUNTIME_STATE` as the stale sweep does.
   The return value reports the removed input files beside `removed`/`kept` snapshot names. Stale
   output temps (see "Writes use the existing guard") are removed and fresh ones skipped in both
   modes.
6. **Tool prose.** In `src/tools/triage.md` replace the "pass back unchanged" sentence and the
   "Input files" paragraph with one rule: every hash-bearing result carries `inputFile`; pass that
   path as the matching reference field and never re-serialise the object; a call carrying
   `assessments` or `drafts` sends its JSON as an agent-authored whole-input `inputFile` file
   (which may hold reference fields), read and removed as today; that fixed trigger replaces the
   current `inventory`/`validated`/`writeSet` trigger. Update the
   call shapes in Phase 2 (`permission-prove` with `runtimeStateRoot`; `inventory-build` with
   `permissionFile`), verdicts validation, report writing, write-set build and write-set apply to
   the reference fields. Change the exit-rule trigger to "once `permission-prove` has returned a
   `runId`", using `permission.runId`. Hold the budget (decided by score): the net line change of
   `triage.md` is zero or less, so `contextBudget: 331` is kept or lowered to the new measured count
   from `Always-loaded core (lines/budget)` plus at most ten lines of headroom.
7. **Tests** as listed under "Validation plan".

### Edge cases

- Inline pass-back of a returned `data` object (now carrying `inputFile`) verifies, because the
  path is inside the hash.
- A file edited between calls: a changed value byte that keeps valid JSON fails with
  `TAMPERED_INPUT`; a change that breaks the JSON fails with `INVALID_PAYLOAD`; a whitespace-only
  change does not alter the canonical JSON and is not tamper evidence (unchanged semantics).
- A referenced file that is a symlink, outside the inputs directory, missing, or carries a name
  that is not the exact output pattern of its kind fails with `INVALID_PAYLOAD`; a symlinked
  directory component fails with `UNSAFE_RUNTIME_STATE` (`realDirectoryOrNull`), as today.
- `VERDICTS_INVALID` retry and repeated `write-set-build` calls: each successful producer call writes
  a new file under the next free `<n>`; earlier files remain until the run's `snapshot-remove`.
- Two concurrent runs: allocation is no-clobber, so neither overwrites the other's file, and
  run-scoped removal touches only the named run's files.
- `permission-prove` without `runtimeStateRoot` and stopped permissions: no file, unchanged
  envelope.
- A fresh output temp of a concurrent run is skipped by both sweeps, neither removed nor failing.
- A run that stops after `permission-prove` but before `inventory-build` succeeds still removes
  its permission file through the exit rule.
- A crash inside `createNoClobber` leaves an output temp in `inputs/`; the next sweep removes it
  once stale instead of stopping every later triage run with `UNSAFE_RUNTIME_STATE`.
- A failed persist after the inventory snapshot was written leaves no orphaned snapshot.
- A referenced file copied from another path or another runtime root fails with
  `INVALID_PAYLOAD` even though its hash verifies.
- Hidden visibility: the runtime state root path is used as today; no new hidden-mode branch.

## Acceptance criteria

- [ ] `permission-prove` (with `runtimeStateRoot`), `inventory-build`, `verdicts-validate` and
      `write-set-build` each write their result under `<runtime root>/.effective-flow/triage/inputs/`,
      return its absolute path as `data.inputFile`, and the file's parsed object deep-equals `data`.
- [ ] The chain `permission-prove` (with `runtimeStateRoot`) → `inventory-build` → `verdicts-validate` → `report-write` → `write-set-build` →
      `write-set-apply` (stubbed forge reads, `selected: []` or a stubbed apply) succeeds when each call
      passes only the returned paths as reference fields, without the caller touching any object; the
      same `inventoryFile` serves every consumer and still exists after each successful consumer, and
      `permissionFile` is accepted by `inventory-build`, `write-set-build` and `write-set-apply`.
- [ ] A reference to an agent-authored name of the right kind (for example `inventoryFile` naming
      `inventory-build-1.json`) or a copied file whose `inputFile` differs from its path fails with
      `INVALID_PAYLOAD`; a run whose `runtimeStateRoot` is given through a symlinked path succeeds.
- [ ] A persist failure injected after `inventory-build` wrote its snapshot leaves no snapshot
      directory of that run.
- [ ] Sending both the inline field and its reference field, or a reference field the operation
      does not consume, fails with `INVALID_PAYLOAD`.
- [ ] A stopped permission or stopped inventory writes no file; the report-only `writeSet` is
      persisted like the forge one.
- [ ] A stale output temp in `inputs/` is removed by `snapshot-remove` instead of failing it.
- [ ] A returned output path sent as whole-input `{"inputFile": …}` fails with `INVALID_PAYLOAD`
      and the file still exists afterwards.
- [ ] `inventory-build` adopts the run id of a permission produced with `runtimeStateRoot`; a
      second `inventory-build` with the same permission fails with `INVALID_PAYLOAD` before any forge
      read, leaves the scan cursor unchanged, and is also rejected after the first run's
      `report-write` and `snapshot-remove`.
- [ ] After a permission file is written and `inventory-build` stops, `snapshot-remove
{runtimeStateRoot, runId: permission.runId}` leaves no output file of that run; a fresh output
      temp of another run is skipped, not removed and not failing.
- [ ] `write-set-build` with inline `inventory` and a `permissionFile` or `validatedFile` from
      another runtime root fails with `INVALID_PAYLOAD`.
- [ ] `write-set-build` and `write-set-apply` given a `permissionFile` whose `runId` differs from
      `inventory.runId` fail with `INVALID_PAYLOAD`; a permission without `runId` (inline, produced
      without `runtimeStateRoot`) is still accepted.
- [ ] A follow-up issue for backlog-audit exists and the PR links it.
- [ ] The post-merge manual check below is recorded as a tracked follow-up issue (or an
      acceptance run per `docs/developer-guide/t3-acceptance-runs.md`) and the PR links it.
- [ ] A referenced file whose content changes by one value byte between calls fails with
      `TAMPERED_INPUT`; a symlinked referenced file or an out-of-tree path fails with
      `INVALID_PAYLOAD`; a symlinked directory component fails with `UNSAFE_RUNTIME_STATE`, as for
      today's whole-input `inputFile`.
- [ ] `snapshot-remove` with `{runtimeStateRoot, runId}` removes every remaining output file of that
      run and no output file of a concurrent run.
- [ ] All existing tests in `test/triage-core.test.mjs` and `test/triage-contract.test.mjs` that
      pass objects inline still pass unchanged.
- [ ] `src/tools/triage.md` states the reference-field rule once, its `contextBudget` is not
      above 331, and `node build.mjs` reports `triage` within it.
- [ ] CI order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.

## Validation plan

- Unit tests in `test/triage-core.test.mjs` using the existing `forge()` stub and
  `executeOperation` deps: per-producer persistence and deep-equality; the reference chain from
  `permission-prove` through `write-set-apply` (the `proven()` helper gains a variant that passes
  `runtimeStateRoot`); one-value-byte tamper → `TAMPERED_INPUT`; symlinked file and out-of-tree path →
  `INVALID_PAYLOAD`; symlinked directory component → `UNSAFE_RUNTIME_STATE`; agent-authored name
  of the right kind → `INVALID_PAYLOAD`; unconsumed reference field → `INVALID_PAYLOAD`; symlinked
  root string accepted; injected persist failure leaves no snapshot; copied file (path mismatch) →
  `INVALID_PAYLOAD`; both inline and reference
  field → `INVALID_PAYLOAD`; full chain through `write-set-apply` with file reuse; stale output
  temp swept; fresh foreign temp skipped; permission file removed after a stopped inventory; inline
  inventory root check; second inventory rejected with unchanged cursor, also after
  `snapshot-remove`; returned path sent as whole-input `inputFile` rejected and kept; run id adoption and
  second-inventory rejection; permission/inventory run-id mismatch in `write-set-build` and
  `write-set-apply` → `INVALID_PAYLOAD`; run-scoped
  `snapshot-remove` with a second run's files present; `permission-prove` without
  `runtimeStateRoot` writes nothing.
- `test/triage-contract.test.mjs`: one assertion on the reference-field rule in `triage.md`,
  including the fixed whole-input trigger for `assessments` and `drafts`.
- CI order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- Manual check (post-merge, by a maintainer, tracked by the linked follow-up, decided by score): `/effective-flow triage` with five or more issue
  references in this repository completes without the agent re-emitting a hash-bearing object and
  without reading any transcript or session file.

## Assumptions and open points

- Assumption (verified): `data` of each producer is the hash-bearing object itself
  (`src/scripts/triage-core.mjs` `permissionProve`, `inventoryBuild`, `verdictsValidate`,
  `writeSetBuild` return `withHash(...)` directly).
- Assumption (verified): `snapshot-remove` with `runId` does not touch `inputs/` today; only the
  day-old sweep does (`snapshotRemove`, `staleBefore` guard).
- Assumption (verified): today `runId` is minted by `inventory-build` and does not exist when
  `permission-prove` runs; this plan moves minting to `permission-prove`.
- Residual risk (accepted, consistent with the existing threat model): the hashes are tamper
  evidence, not authentication. A model that forges a permission with the id of a concurrent run
  that has neither snapshot nor report yet could make one run's `snapshot-remove` delete the
  other's output files. The existence checks refuse every reuse once a snapshot or report exists.
- Residual risk (accepted): a run stopped before `report-write` (no item left, an escalation,
  a user abort) leaves neither snapshot nor report after `snapshot-remove`, and neither does a
  report removed by `report-prune`, so its proof can be reused; harmless, because all of that
  run's files are already gone.
- Assumption: no developer-guide section documents the triage helper's input-file contract, so no
  contract guide edit is required (only the line references in
  `docs/developer-guide/subagent-progress-coverage.md` may need updating); `docs/developer-guide/build-system.md` describes only backlog-audit input
  files.
- Out of scope per the issue: changing what is hashed for existing fields or how `TAMPERED_INPUT`
  works, and the remote-tracker input file.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-BAT",
    "question": "Run association of output files: how does snapshot-remove {runId} find all output files of a run, and none of a concurrent run, when permission is produced before inventory-build mints the runId?",
    "options": [
      "Mint run id in permission-prove",
      "Keep permission inline",
      "Run manifest in snapshot",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Mint run id in permission-prove",
        "score": 8,
        "reason": "Meets the full goal: no hash-bearing object is ever copied. Each file name carries its run, so cleanup matches by name and per-kind patterns stay exact. The hashed permission blocks a forged runId, but a reused proof must fail closed when its snapshot directory already exists."
      },
      {
        "label": "Keep permission inline",
        "score": 6,
        "reason": "Simplest option, explicitly allowed by the issue, and clean run-scoped names. But the agent still copies a small hash-bearing object to three consumers, which leaves the stated goal partly unmet. The plan's permission-prove acceptance criteria would need rewriting."
      },
      {
        "label": "Run manifest in snapshot",
        "score": 3,
        "reason": "Adds a mutable manifest that later producers must update atomically. The permission file exists before the snapshot directory does, so it cannot be recorded at creation. A corrupted manifest could also make snapshot-remove delete another run's files unless every entry is re-validated."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "backlog-audit uses the same hash-bearing pass-back pattern (permission, inventory, merged, writeSet). Handle it in this plan or as a follow-up?",
    "options": [
      "Follow-up issue",
      "Apply to backlog-audit here",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Follow-up issue",
        "score": 8,
        "reason": "The plan is already a 322-line Feature that changes triage core, prose, tests and lifecycle. The issue's item 5 explicitly allows a linked follow-up, so a separate issue keeps one PR reviewable and lets backlog-audit reuse the design once triage has proven it."
      },
      {
        "label": "Apply to backlog-audit here",
        "score": 4,
        "reason": "It removes the same failure mode at once and keeps the two tools consistent, but it roughly doubles the PR. It also touches a separate 2,820-line core with its own kinds, including merged and externalIssues, and its own cleanup, which raises review and regression risk."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Every result carries data.inputFile, the same key as the whole-input form {inputFile}; an agent that sends a returned path that way makes readInputFile delete a multi-consumer file before the handler rejects the input. How to prevent this?",
    "options": [
      "Reader refuses output names",
      "Rename returned field",
      "Both",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Reader refuses output names",
        "score": 8,
        "reason": "This is the smallest change that stops the deletion: the reader rejects helper-output names before unlinking, so the test passes. It keeps the issue's inputFile wording and the hashed object's key, and the plan already has exact per-kind output-name patterns for the check."
      },
      {
        "label": "Rename returned field",
        "score": 3,
        "reason": "Renaming alone makes the mistake less likely but does not prevent it. readInputFile still accepts any INPUT_FILE name, so a returned path sent as {inputFile} is still deleted and the required test fails. It also departs from the issue's wording without fully fixing the problem."
      },
      {
        "label": "Both",
        "score": 7,
        "reason": "The reader guard fixes the problem, and the rename removes the hint the issue's own wording gives (\"take that path as its inputFile\"). But it adds a second departure from the issue and changes the hashed key, for a mistake the guard already refuses with a clear error."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "When write-set-build or write-set-apply get inventory inline plus permissionFile or validatedFile, no runtime root is known and the root-containment check for those references is skipped. How to close this?",
    "options": [
      "Verify inline inventory too",
      "Forbid mixing",
      "Accept and document",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Verify inline inventory too",
        "score": 9,
        "reason": "Closes the gap with no API restriction: requireInventory is pure and cheap, and a hash-verified inline root is as trustworthy as one from inventoryFile. It also keeps the plan's rule of identical handling for inline and referenced objects, which Forbid mixing breaks."
      },
      {
        "label": "Forbid mixing",
        "score": 6,
        "reason": "Also closes the gap, but it adds a coupling rule between fields and a new INVALID_PAYLOAD path that agents can trip over, without adding security over verifying the inline inventory."
      },
      {
        "label": "Accept and document",
        "score": 3,
        "reason": "Leaves copied or foreign permission and validated files unbound to their run whenever inventory comes inline, even though a cheap fix is available."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "triage.md contextBudget: must the edit keep the current budget 331, or may it raise it?",
    "options": [
      "Hold the budget",
      "Raise and label it",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Hold the budget",
        "score": 7,
        "reason": "Satisfies the strict reading of requirement 4 and AGENTS.md's 'length is paid on every run'. Merging the pass-back sentence and the Input files paragraph into one rule plausibly offsets the extra call-shape fields, but forcing a zero net delta may over-compress the prose."
      },
      {
        "label": "Raise and label it",
        "score": 6,
        "reason": "Plan step 6 already sets the budget to the measured count plus up to ten lines, and the issue cites that same AGENTS.md rule, so a small raise is defensible. Calling it a 'departure' misstates the case, and it gives up the length discipline the issue asks for."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "Run binding of permission: validated and writeSet are run-bound through inventoryHash, but a permissionFile from another run in the same runtime root is accepted by write-set-build and write-set-apply. How should the plan handle this?",
    "options": [
      "Bind permission to run",
      "Reword the claim",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Bind permission to run",
        "score": 8,
        "reason": "The plan already puts runId inside the hashed permission, so requiring permission.runId === inventory.runId in write-set-build and write-set-apply costs one line each plus one test and makes the own path and run claim true."
      },
      {
        "label": "Reword the claim",
        "score": 5,
        "reason": "Rewording is honest at no cost but knowingly keeps a gap that the new run id makes trivial to close."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "The original outcome (a multi-issue triage run with no re-emitted hash-bearing object and no transcript read) is only checked by a post-merge manual run that no acceptance criterion lists. How should the plan handle it?",
    "options": [
      "Track post-merge check",
      "Run check before merge",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Track post-merge check",
        "score": 7,
        "reason": "An unattended run that stops at a draft PR can complete and verify it, and it ensures the issue manual acceptance criterion is never silently dropped, although the outcome is still checked only after merge."
      },
      {
        "label": "Run check before merge",
        "score": 5,
        "reason": "It proves the outcome before merge, but local-link.sh changes the host installed skill, a run in the implementing context does not show that a fresh agent avoids re-serialising, and write-set-apply stays unexercised."
      }
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
| Security        |        0 |         1 |    5 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         5 |    3 |
| Testability     |        0 |         0 |    4 |
| Scope           |        0 |         0 |    4 |
| Maintainability |        0 |         0 |    2 |

### Findings

- Important (Error cases): a returned path sent as whole-input `inputFile` is deleted before the
  handler rejects it, losing a multi-consumer object. Decided by score: the whole-input reader
  refuses helper-output names before removing anything.
- Important (Error cases): a crash inside `createNoClobber` leaves a dot-temp in `inputs/` that
  the fail-closed sweep would reject, blocking every later run. Incorporated: output-temp pattern
  accepted and removed by both sweeps, with edge case and test.
- Important (Security): reference containment did not fix real-path comparison or verification
  order. Incorporated: input roots resolved through `resolveRuntimeRoot`, exact path equality,
  `inventoryFile` verified first, symlinked-root test.
- Note (Security): a referenced file was not bound to its own path. Incorporated: the object's
  `inputFile` must equal the referenced path.
- Note (Security): a name-prefix kind check accepted agent-authored files. Incorporated: exact
  output pattern per kind in the decisions and approach, with a test.
- Note (Error cases): a failed persist after the inventory snapshot would orphan it; the two later
  producers lacked `deps`. Incorporated in approach step 3 with a test.
- Note (Error cases): unhashed stops and the report-only `writeSet` branch were unaddressed.
  Incorporated in step 3 and the acceptance criteria.
- Note (Testability): reuse of one reference across consumers, `write-set-apply`, `permissionFile`
  consumers and both `INVALID_PAYLOAD` rejections lacked criteria. Incorporated.
- Note (Testability): acceptance and edge cases disagreed on the symlinked-directory code.
  Incorporated: `UNSAFE_RUNTIME_STATE` for a directory component, `INVALID_PAYLOAD` for the file.
- Note (Testability): the orphaned-snapshot edge case and the unconsumed-reference rejection were
  missing from the validation plan. Incorporated.
- Note (Scope): retaining every output file until the run's `snapshot-remove` departs from the
  issue's requirement 3 wording. Incorporated as a labelled departure with its reason.
- Deep review, Important (Error cases): the exit rule fired only after `inventory-build`, orphaning
  the permission file on an earlier stop. Incorporated: exit rule fires once `permission-prove`
  returned a `runId`; edge case, criterion and test.
- Deep review, Important (Error cases): proof reuse was detected late (after forge reads and the
  scan-cursor write), with the wrong code, and not after `snapshot-remove`. Incorporated: early
  existence check on snapshot and report, `INVALID_PAYLOAD`, unchanged cursor, `guardedMkdir` kept
  as backstop.
- Deep review, Note (Security): the hash cannot block a forged run id. Incorporated: rationale
  reworded; residual risk recorded under Assumptions.
- Deep review, Note (Security): the root-containment check lapsed for an inline `inventory`.
  Decided by score: the resolver verifies an inline inventory and uses its root.
- Deep review, Note (Error cases): a concurrent run's fresh temp would fail the sweeps.
  Incorporated: fresh temps skipped, stale ones removed, with a test.
- Deep review, Note (Scope): the `contextBudget` criterion was tautological. Decided by score: hold
  the budget at 331 or lower.
- Deep review, Note (Scope): two further departures (new hashed keys, value-byte tamper criterion)
  were unlabelled. Incorporated as labelled departures.
- Deep review, Note (Maintainability): an edge case treated `report-write` as a producer.
  Incorporated: corrected to repeated `write-set-build` calls.
- Re-review, Important (Error cases): with no hash-bearing object inline any more, the whole-input
  file trigger was undefined. Incorporated: a fixed trigger for `assessments` and `drafts`, covered
  by the contract assertion.
- Re-review, Note (Error cases): "not even after `snapshot-remove`" held only once a snapshot or
  report existed. Incorporated: decision and criterion reworded, harmless reuse recorded as
  residual risk.
- Re-review, Note (Security): `permission` was not bound to its run. Decided by score: require
  `permission.runId` to equal `inventory.runId` in `write-set-build` and `write-set-apply`.
- Re-review, Note (Scope): the run id in output names departs from the issue's `<kind>-<n>.json`.
  Incorporated as a labelled departure.
- Re-review, Note (Maintainability): `subagent-progress-coverage.md` cites `triage.md` line
  numbers. Incorporated into Affected files.
- Re-review, Note (Testability): the original outcome had no tracked check. Decided by score: keep
  the manual check post-merge and track it as a linked follow-up.

## Open points

- No open points.

## Build completion

**Date:** 2026-11-26
**Workflow:** `effective-flow build` (inline Quality, unattended autopilot run, completion `pr`
as draft)

### Requirement

Persist every hash-bearing triage helper result (`permission`, `inventory`, `validated`,
`writeSet`) as a run-scoped file and let later calls name it by a reference field, so the agent
never re-serialises a hash-bearing object (issue #730).

### Architecture decisions

Implemented as planned, including every "Decided by score" outcome: reference fields with the path
inside the hash, central reference resolution in `executeOperation`, a non-removing guarded reader,
retention until the run's `snapshot-remove`, `permission-prove` minting the run id with
`runtimeStateRoot`, the whole-input reader refusing helper-output names, inline-inventory
verification, `permission.runId` bound to `inventory.runId` in `write-set-build` and
`write-set-apply`, `contextBudget: 331` held, and backlog-audit left to a follow-up.

Choices the plan left open: a leftover output temp counts as stale after one hour (the guard's own
`NO_CLOBBER_TEMP_MAX_AGE_MS`); run-mode `snapshot-remove` checks every entry of the snapshot root,
the run directory and `inputs/` before its first removal and fails closed on an unexpected entry; a
malformed `permission.runId` is `INVALID_PAYLOAD`; the scan cursor is written only after the
snapshot and the inventory output were persisted, and a later failure removes both.

Accepted residual risk (review): a run that waits more than 24 hours at a gate can lose its output
files to another run's day-old sweep and then fails `write-set-apply` with `INVALID_PAYLOAD`; the
run is restarted.

### Affected files

- `src/scripts/triage-core.mjs`: output persistence, reference resolution, run-id minting and
  adoption, reuse and run-binding checks, run-scoped cleanup.
- `src/scripts/triage.mjs`: CLI header comment describes the persisted results and their cleanup.
- `src/tools/triage.md`: one reference-field rule, fixed whole-input trigger for `assessments` and
  `drafts`, reference call shapes, exit rule on `permission.runId`; net line change zero.
- `test/triage-core.test.mjs`: 23 new unit tests covering the acceptance criteria.
- `test/triage-contract.test.mjs`: one assertion on the reference-field rule.
- `docs/developer-guide/subagent-progress-coverage.md`: unchanged; the `triage.md` spawn-site
  markers did not move.

### Implementation details

See the approach above; every step was implemented. Documentation sync: only the CLI header
comment was updated; the developer guide, user guide, README, ADRs and `AGENTS.md` have no impact.

### Test results

- Full CI order on the implementation tree: `pnpm agent:check`, `pnpm test` (6732 passed, 0 failed,
  85 skipped), `node build.mjs` (`triage 325/331`), `pnpm test:distribution`, all green.
- After the review corrections, targeted: the affected test files (124 passed), `pnpm agent:check`,
  `node build.mjs` and `pnpm test:distribution`, all green.
- Not done in this run: the backlog-audit follow-up issue and the tracked post-merge manual check
  (acceptance criteria that need forge writes); they are left to the draft pull request's review.

### Review result

One Node.js review with all severities, one incorporation pass, a scoped re-check with a floor
full pass on `src/scripts/triage-core.mjs`, and a floor re-check of the follow-up correction. No
Critical or Important finding.

## Review findings

**Date:** 2026-11-26
**Reviewer:** effective-flow-nodejs-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     6 |
| Open / Not implemented |     0 |

One further Note was closed as the accepted residual risk recorded above.
