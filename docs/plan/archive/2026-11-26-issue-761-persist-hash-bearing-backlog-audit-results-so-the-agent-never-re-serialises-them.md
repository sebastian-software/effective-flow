# Persist hash-bearing backlog-audit results so the agent never re-serialises them

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Issue:** #761

## Requirement

The backlog-audit helper (`src/scripts/backlog-audit.mjs` over
`src/scripts/backlog-audit-core.mjs`, driven by `src/tools/backlog-audit.md`) returns four
hash-bearing objects that the agent must pass back unchanged: `permission` (`permission-prove`,
hash key `proofHash`), `inventory` (`inventory-build`, `inventoryHash`), `merged`
(`verdicts-validate`, `mergedHash`) and `writeSet` (`write-set-build`, `setHash`). `verifyHashed`
stops the run with `TAMPERED_INPUT` on any changed byte. Today the helper returns these objects
only inside the stdout envelope, and `backlog-audit.md` ("Input files") asks the agent to write
them into agent-authored input files, which means reproducing a large `inventory` byte for byte
from an earlier tool result. One dropped or altered byte ends the run, and the agent may improvise
an off-contract recovery such as reading private session data.

Goal: the agent never copies a hash-bearing object. The helper persists each such object itself
under the runtime guard, returns its absolute path, and every later operation accepts that path as
a reference field verified with exactly today's tamper check. The triage helper fix (#753, issue
#730, archived plan
`docs/plan/archive/2026-11-25-issue-730-persist-hash-bearing-triage-results-so-the-agent-never-re-serialises-them.md`)
is the reference design; this plan applies it to backlog-audit and adapts it where backlog-audit
differs (no runtime report file of its own, `merged` produced up to twice, `epic-candidates`,
`bounds-check` and `external-call-check` as extra consumers).

The workflow is **Feature**: it adds helper behaviour (persisted outputs, reference fields, run
binding, run-scoped cleanup of outputs) and changes the agent-facing contract in
`backlog-audit.md`; it fixes no defect in existing behaviour and is more than a restructuring.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #761, the backlog-audit
follow-up that the #730 plan decided to open.
**Original outcome:** A `/effective-flow backlog-audit` run over a goal with at least ten matching
issues completes without the agent re-emitting any hash-bearing object and without reading any
transcript or session file; inline objects stay supported and `TAMPERED_INPUT` semantics stay
unchanged.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** helper-persisted output files plus per-object reference fields, as in
triage (#753); this plan is the first attempt for backlog-audit.
**Continuation decision:** none

## Architecture decisions

- **Reference fields beside inline fields.** Each consuming operation accepts, beside its inline
  field, a reference field holding an absolute path: `permissionFile`, `inventoryFile`,
  `mergedFile`, `writeSetFile`. The agent copies only a path. Sending both the inline field and
  its reference field, or a reference field the operation does not consume, is `INVALID_PAYLOAD`.
  Allowed reference fields per operation (verified consumers in `backlog-audit-core.mjs`):
  `epic-candidates` → `permissionFile`; `inventory-build` → `permissionFile`; `bounds-check` →
  `inventoryFile`; `verdicts-validate` → `inventoryFile`; `write-set-build` → `inventoryFile`,
  `mergedFile`, `permissionFile`; `write-set-apply` → `permissionFile`, `writeSetFile`;
  `external-call-check` → `permissionFile`, `writeSetFile`. `permission-prove` and
  `snapshot-cleanup` accept none.
- **The path is part of the hashed object.** A producer allocates its output path first, adds it
  to the object as `inputFile`, computes the hash over the object including `inputFile` with the
  existing `withHash`, writes exactly that object, and returns the same object as envelope `data`.
  Rationale: `data` is the hash-bearing object itself, so a key outside the hash would make an
  inline pass-back fail; with the path inside the hash, inline callers keep working, the file
  deep-equals `data`, and `verifyHashed` stays untouched. This adds the key `inputFile` (all four
  objects) and `runId` (permission) to what is hashed; the hash function, canonicalisation and
  `TAMPERED_INPUT` semantics do not change, which keeps the issue's out-of-scope line ("changing
  what is hashed or how") intact in substance. The PR states this as a labelled departure, as #753
  did, together with the cleanup departure under "Lifecycle". Consequence: `inventoryHash`,
  `mergedHash` and `setHash` now identify the persisted file, not only the content, so two builds
  from identical inputs differ in `inputFile` and hash. Nothing compares them across rebuilds:
  `selected` binds entry hashes, and `merged.inventoryHash` and `writeSet.inventoryHash` are taken
  from the same hashed inventory.
- **Central reference resolution in `executeOperation`.** After the existing whole-input
  `inputFile` substitution and before the handler, a resolver reads each allowed reference field
  of the operation and substitutes the parsed object under the inline key. The handlers'
  existing `exactKeys`, `requireProof`, `requireInventory`, `verifyHashed` and `verifyWriteSet`
  then run unchanged on the substituted object, so tamper detection is identical for inline and
  referenced objects. After the hash verifies, the resolver requires the object's `inputFile` to
  equal the referenced path; a copied or moved file is `INVALID_PAYLOAD`.
- **Non-removing guarded read.** Reference reads share `readInputFile`'s checks (absolute path,
  `INPUT_FILE` name, exact `<root>/.effective-flow/backlog-audit/inputs/<name>` shape,
  `resolveRuntimeRoot`, per-component `realDirectoryOrNull`, `lstat` regular file,
  `readRegularFile` with `O_NOFOLLOW` and dev/ino match, size bound, JSON parse) but never unlink,
  because `permission`, `inventory` and `writeSet` have several consumers (`external-call-check`
  runs once per external call against the same `writeSet`). The shared checks are factored into one internal reader
  with a remove option rather than duplicated. A reference file name must match the exact output
  pattern of the kind its field names (`inventoryFile` accepts only `inventory-<runId>-<n>.json`,
  never an agent-authored `inventory-build-1.json`).
- **File naming carries the run.** Output files are named `<kind>-<runId>-<n>.json` with `<kind>`
  one of `permission`, `inventory`, `merged`, `writeset`, `<runId>` in today's `RUN_ID` format
  (`<local date>-<8 hex>`) and `<n>` the lowest free positive decimal from 1, with a fixed upper
  bound (as triage's `MAX_OUTPUT_FILES`). The exact per-kind output patterns fit the existing
  `INPUT_FILE` pattern (`/^[a-z0-9][a-z0-9-]{0,78}\.json$/`, longest name about 41 characters),
  so `INPUT_FILE` is not widened. `merged` and `writeSet` carry no `runId` field; their files take
  the run id of the verified `inventory.runId`.
- **`permission-prove` mints the run id.** It gains an optional `runtimeStateRoot`. With it, it
  mints a run id in the `RUN_ID` format, carries it inside the
  hashed permission as `runId`, and persists the permission. Backlog-audit's proof is always hashed
  (`plans-only` or `tracker`, from `intake.proveRunnerPermission`; it has no stopped form), so it
  is always persisted when `runtimeStateRoot` is given. Without `runtimeStateRoot` it behaves as
  today and writes no file. `inventory-build` adopts `permission.runId` when present and mints
  one as today otherwise. Rationale: the permission is consumed by four later operations, so it
  must be persisted too, and its file name must carry the run for run-scoped cleanup.
- **Run binding.** A referenced or inline object must belong to the current run:
  - `inventory-build` with a permission that carries `runId` refuses with `INVALID_PAYLOAD`, right
    after `requireProof` and before any forge read or snapshot write, when
    `snapshots/<runId>` or any `inventory-<runId>-<n>.json` output already exists (the
    "permission proof that already started a run"); the existing exclusive `guardedMkdir` in
    `writeSnapshot` stays the race backstop.
  - Wherever an operation holds both a permission with `runId` and an inventory
    (`write-set-build`), it requires `permission.runId === inventory.runId`.
  - Wherever it holds a permission with `runId` and a `merged` or `writeSet`
    (`write-set-build`, `write-set-apply`, `external-call-check`), it requires the run id encoded
    in that object's hashed `inputFile` name to equal `permission.runId`. `merged` is already
    bound to its inventory by `merged.inventoryHash` (`write-set-build`, verified at
    `backlog-audit-core.mjs` `writeSetBuild`).
  - All references of one call must resolve under the same runtime root; where the operation
    knows its root (an input `runtimeStateRoot`, resolved through `resolveRuntimeRoot`, or the
    verified `inventory.runtimeStateRoot`), each reference must lie under it. The resolver reads
    and verifies `inventoryFile` first; when `inventory` arrives inline beside another reference,
    the resolver runs `requireInventory` on it and uses its verified `runtimeStateRoot` the same
    way, so the containment check never lapses. The same containment applies to an inline object
    that carries `inputFile` (for example an inline permission passed to `inventory-build`): its
    `inputFile` must lie under the operation's resolved root, so a permission persisted under one
    root never starts an inventory under another, where the already-started check and the run's
    cleanup would not see it.
  - A permission without `runId` (inline, produced without `runtimeStateRoot`) and objects without
    `inputFile` (inline objects from before this change) are still accepted unbound, so existing
    inline tests and callers keep working.
- **Lifecycle: retained until the run's `snapshot-cleanup`.** Output files are never removed on
  consumption. `snapshot-cleanup` handles the snapshot set and the `inputs/` set as two separate
  fail-closed groups (decided by score), snapshots first:
  - The snapshot group keeps today's behaviour unchanged: each snapshot directory is checked before
    it is removed, name by name; a failure there stops the call before the `inputs/` group, as
    today.
  - The `inputs/` group checks every entry (agent input names, output names, output temps) before
    its first removal; an unexpected entry raises `UNSAFE_RUNTIME_STATE` naming it, and no input
    file is removed.
  - So a stray file in `inputs/` never keeps a snapshot (quoted third-party issue text) on disk:
    snapshot removal never depends on `inputs/`, today's property.

  With `{runtimeStateRoot, runId}` it removes that run's snapshot directory and exactly the output
  files whose name carries that `runId`. Both modes return `removedInputs` beside `removed`/`kept`,
  as triage does. The day-old sweep (`snapshot-cleanup` without `runId`) keeps removing stale
  snapshots and input files, output files included. Agent-authored whole-input files keep today's
  read-and-remove. This departs on purpose from the issue's "checks every candidate before
  removing anything" for the run-scoped mode: the snapshot is removed even when the `inputs/` group
  fails. The PR labels this departure and its privacy reason.

- **Output temps.** Outputs are written with `createNoClobber` from
  `src/scripts/runtime-state-guard.mjs` using a dedicated temp prefix distinct from the snapshot
  prefix (for example `.backlog-audit-output-`, which satisfies `NO_CLOBBER_PREFIX_PATTERN`).
  Both cleanup modes accept that temp name pattern in `inputs/`: they remove a temp older than
  `NO_CLOBBER_TEMP_MAX_AGE_MS` (one hour, `runtime-state-guard.mjs`, newly imported) and skip a
  younger one (a concurrent run may be inside `createNoClobber`) instead of failing closed, as
  triage's `snapshotRemove` does.
- **Whole-input reader refuses helper outputs.** `readInputFile` rejects a name that matches any
  kind's exact output pattern with `INVALID_PAYLOAD` before it removes anything, so a returned path
  sent as `{"inputFile": …}` never deletes a multi-consumer object.
- **Exit rule moves to `permission-prove`.** `backlog-audit.md`'s exit rule fires once
  `permission-prove` has returned a `runId` and uses `permission.runId`, so a stop between
  permission and inventory (plans-only stop on `--issues-only`, a declined epic, a bound stop, an
  `inventory-build` error) still removes the permission file. `snapshot-cleanup {runId}` already
  succeeds when the run has no snapshot directory.
- **Whole-input trigger becomes agent-authored only.** A call carrying `externalIssues`
  (`epic-candidates`, `inventory-build`), leaf verdicts `primary`/`panel` (`verdicts-validate`),
  agent-drafted `drafts` (`write-set-build`) or re-read third-party `current`
  (`external-call-check`) sends its JSON, reference fields included, as a whole-input `inputFile`
  file; that fixed trigger replaces today's `externalIssues`/`inventory`/`merged`/`writeSet`
  trigger. `drafts` and `current` lose their file transport otherwise, because today they travel
  in a file only beside `inventory` or `writeSet`; drafts reach 20000 characters each and
  `current` carries quoted third-party text that must not cross the command-line here-string.
- **No shared code with triage.** Each helper keeps its own core per the existing helper layering
  (issue out of scope); the backlog-audit core reimplements the pattern locally, using triage's
  `triage-core.mjs` (`OUTPUT_KINDS`, `persistOutput`, `readReference`, `requireUnusedRun`,
  `snapshotRemove`) only as a reading reference.

## Affected files

| File                                                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/backlog-audit-core.mjs`                 | Output kinds and exact output-file patterns; `persistOutput` writer; optional `runtimeStateRoot` and run-id minting in `permissionProve`; persistence in the four producers; run-id adoption and already-started check in `inventoryBuild`; reference-field resolution in `executeOperation`; shared non-removing guarded reader factored out of `readInputFile`, which refuses output names; run binding checks; run-scoped and fail-closed output removal plus output-temp handling in `snapshotCleanup` |
| `src/scripts/backlog-audit.mjs`                      | Header comment: input files are read and removed, helper outputs are retained until `snapshot-cleanup`                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/tools/backlog-audit.md`                         | Helper-call paragraph and "Input files" replaced by one reference-field rule; exit rule fires once `permission-prove` returned a `runId`; Phase 1 passes `runtimeStateRoot` to `permission-prove`; later call shapes use reference fields; `contextBudget: 412` not raised                                                                                                                                                                                                                                 |
| `test/backlog-audit-core.test.mjs`                   | New tests for persistence, the reference chain, tamper and path rejection, run binding and run-scoped cleanup. Adjust the rebuild test (around lines 2504–2515, "same inputs rebuild the identical set"): narrow its invariant to stable entry ids and entry `hash` values and to equality after removing `inputFile` and `setHash`, with a comment naming that invariant. The input-file test (around line 3430) needs no change: its names do not match the output patterns                              |
| `src/shared/backlog-audit-external.md`               | Apply step: `external-call-check` call shape with `permissionFile` and `writeSetFile` instead of inline `permission` and `writeSet`, sent as a whole-input file because it carries `current`                                                                                                                                                                                                                                                                                                               |
| `test/backlog-audit-contract.test.mjs`               | Update the exit-rule assertion (around line 238), the permission-first assertion on the `permission-prove` call shape (around line 251), the `external-call-check` call-shape assertion on the external fragment (around line 304) and the input-file assertion (around line 325) to the new prose, each keeping a comment naming the invariant it protects                                                                                                                                                |
| `docs/developer-guide/build-system.md`               | "Backlog audit" bullet (around lines 1487–1499): agent-authored input files are read and removed; hash-bearing results are persisted by the helper and passed back by reference                                                                                                                                                                                                                                                                                                                            |
| `docs/developer-guide/subagent-progress-coverage.md` | Update the six `src/tools/backlog-audit.md:<line>` spawn-site references to the lines measured after the edit (already stale today: the guide says 183/206/220/256/260/263, the markers sit at 185/213/227/263/267/270; no test checks these numbers)                                                                                                                                                                                                                                                      |

No change to `build.mjs`: `backlog-audit.mjs` and `backlog-audit-core.mjs` are already in
`RUNTIME_SCRIPT_FILES`, and no runtime script is added.

## Implementation details

### Approach

1. **Shared guarded reader.** Factor the checks of `readInputFile` into one internal reader with a
   `remove` option. `readInputFile` keeps read-and-remove but first rejects any helper-output name
   with `INVALID_PAYLOAD`; the reference resolver reads without removal. Error codes otherwise stay
   those `readInputFile` produces today (`INVALID_PAYLOAD` for path, name, symlinked file or missing
   file; `UNSAFE_RUNTIME_STATE` for a symlinked directory component).
2. **Output writer.** Add one internal `persistOutput` that resolves the runtime root, ensures the
   guarded `inputs/` directory, allocates the lowest free `<n>` for `<kind>-<runId>-<n>.json`, builds
   `{...value, inputFile: <absolute path>}`, applies `withHash` with the kind's hash key, writes it
   with `createNoClobber`, retries with the next `<n>` (recomputing the hash) when the target
   exists, stops with an error after the fixed bound, and returns the hashed object. Guard failures
   map through the existing `guardFailure`.
3. **Producers.** `permissionProve` (only with `runtimeStateRoot`),
   `inventoryBuild`, `verdictsValidate` and `writeSetBuild` return the persisted object instead of
   the bare `withHash` result. Persisting is the last step before return, so a failing operation
   (`VERDICTS_INVALID`, a bound stop) writes nothing. `verdictsValidate` and `writeSetBuild` gain
   the `deps` parameter (passed by `HANDLERS`) and persist under the verified
   `inventory.runtimeStateRoot`. Both `withHash` branches of `writeSetBuild` (plans-only and
   tracker) are persisted. If persisting fails after `inventoryBuild` wrote its snapshot, it removes
   that run's snapshot directory, so a failed persist leaves no orphaned snapshot.
4. **Run id.** `permissionProve` mints the run id when given `runtimeStateRoot` and adds it to the
   permission before hashing; the permission from `intake.proveRunnerPermission` is extended
   inside the backlog-audit core, so `issue-intake-core.mjs` stays unchanged. Strip the intake
   proof's existing `proofHash` before adding `runId` and persisting, as `triage-core.mjs`
   `permissionProve` does; otherwise `withHash` would hash over the stale key and every persisted
   permission would fail `verifyHashed`. `inventoryBuild`
   adopts `permission.runId` when present, applies the already-started check from "Run binding"
   before any forge read, and mints as today otherwise.
5. **Reference fields.** Map each operation to its allowed reference fields as listed under
   "Architecture decisions". In `executeOperation`, after the whole-input substitution, reject
   both forms together, a reference field the operation does not consume, and a file name that does
   not match the exact output pattern of the field's kind; verify `inventoryFile` first, then the
   other references against its root; when neither an input `runtimeStateRoot` nor an inventory
   is present (`write-set-apply`, `external-call-check`), the first reference's resolved root binds
   the others; verify each hash with the existing verifier of its kind;
   require `value.inputFile === <path>`; substitute and call the handler unchanged. Add the
   run-binding checks in the handlers that hold the paired objects.
6. **Run-scoped cleanup.** Extend `snapshotCleanup` so that a call with `runId` also removes that
   run's output files in `inputs/` with `guardedUnlink`, following the two groups under
   "Lifecycle". The day-old sweep uses the same two groups. In both modes an output temp older than
   `NO_CLOBBER_TEMP_MAX_AGE_MS` is removed and a younger one skipped, and the return value adds
   `removedInputs`. The internal call in `boundsCheck` on a bound stop stays snapshot-only (for
   example through an internal option of the cleanup function), so a stray entry in `inputs/` never
   turns a bound stop into an error; the exit rule's `snapshot-cleanup {runId}` removes the run's
   outputs afterwards.
7. **Tool prose.** In `src/tools/backlog-audit.md` replace the "Pass every hash-bearing object …
   back unchanged" sentence and the "Input files" paragraph with one rule stated once: every
   hash-bearing result (`permission`, `inventory`, `merged`, `writeSet`) holds its absolute path as
   `inputFile`; pass that path as the matching `<name>File` field and never re-serialise the object;
   `TAMPERED_INPUT` stops the run; pass the most recent result of each kind; the helper keeps
   these files until the exit rule; a call carrying `externalIssues`, `primary`, `panel`, `drafts`
   or `current` sends its JSON, reference fields included, as a whole-input file: keep today's
   safeguards word for word (apply the runtime guard to
   `.effective-flow/backlog-audit/inputs/<operation>-<n>.json` under `RUNTIME_STATE_ROOT` with the
   lowest absent `<n>` from 1, write it only while absent, send `{"inputFile": "<absolute path>"}`),
   which the helper reads and removes. Change the exit-rule trigger to "once `permission-prove` has returned a
   `runId`", using `permission.runId`. Update the call shapes in Phase 1 (`permission-prove` with
   `runtimeStateRoot`; `epic-candidates` with `permissionFile`), Phase 2 (`inventory-build` with
   `permissionFile`; `bounds-check` with `inventoryFile`), Phases 3–4 (`verdicts-validate` with
   `inventoryFile`), Phase 6 (`write-set-build` with `inventoryFile`, `mergedFile`,
   `permissionFile`) and the apply phase (`write-set-apply` with `permissionFile`, `writeSetFile`);
   in `src/shared/backlog-audit-external.md` step 3, `external-call-check` with `permissionFile`,
   `writeSetFile`, `id`, `current` and `appliedIds`. Keep the net line change of `backlog-audit.md` small enough
   that `contextBudget: 412` holds; lower it to the newly measured count plus at most ten lines of
   headroom if the count drops, taken from `Always-loaded core (lines/budget)` of `node build.mjs`.
8. **Docs and comments.** Update the CLI header comment in `backlog-audit.mjs`, the comment above
   `readRegularFile`/`readInputFile` ("an input never outlives its call"), the `snapshotCleanup`
   comment, the "Backlog audit" bullet in `docs/developer-guide/build-system.md`, and the six
   spawn-site line references in `docs/developer-guide/subagent-progress-coverage.md`, measured
   after the edit.
9. **Tests** as listed under "Validation plan".

### Edge cases

- Inline pass-back of a returned `data` object, now carrying `inputFile`, verifies because the
  path is inside the hash.
- A file edited between calls: a changed value byte that keeps valid JSON fails with
  `TAMPERED_INPUT`; a change that breaks the JSON fails with `INVALID_PAYLOAD`; a whitespace-only
  change does not alter the canonical JSON and is not tamper evidence (unchanged semantics).
- A referenced file that is a symlink, outside the inputs directory, missing, or named outside the
  exact output pattern of its kind fails with `INVALID_PAYLOAD`; a symlinked directory component
  fails with `UNSAFE_RUNTIME_STATE`, as today.
- `merged` is produced twice with `--panel` (primary, then panel) and on a `VERDICTS_INVALID`
  retry only the successful call writes; each success takes the next free `<n>`. `write-set-build`
  is likewise rebuilt at the gate (a changed slug, `epic: null` after `DUPLICATE_EPIC` or
  `MALFORMED_EPIC`) and writes the next `writeset-<runId>-<n>`. Earlier files of either kind stay
  valid until cleanup, so the tool-prose rule says to pass the path of the most recent result of
  each kind; a stale `writeSetFile` would apply unchanged entries from a set the gate did not show.
- `external-call-check`, called once per external call, and every repeated consumer reuse the same
  `writeSetFile` and `permissionFile`, which survive consumption. A `failed` apply stops the run, and
  the exit rule removes its files; a rerun is a new run with its own `permission-prove`.
- Plans-only mode (hidden, local or unset tracker): the permission is hashed and, with
  `runtimeStateRoot`, persisted like a tracker permission; the plans-only `writeSet` is persisted.
- A bound-stopped inventory (unhashed) writes no file; `permission-prove` without
  `runtimeStateRoot` writes no file.
- Two concurrent runs: allocation is no-clobber, names carry different run ids, and run-scoped
  cleanup touches only the named run's files; a fresh output temp of the other run is skipped.
- A crash inside `createNoClobber` leaves an output temp; the next cleanup removes it once it is
  older than `NO_CLOBBER_TEMP_MAX_AGE_MS` instead of stopping later runs with
  `UNSAFE_RUNTIME_STATE`.
- A run that stops after `permission-prove` but before `inventory-build` still removes its
  permission file through the exit rule.
- A referenced file copied from another path or runtime root fails with `INVALID_PAYLOAD` although
  its hash verifies; so does an inline permission whose `inputFile` lies under another runtime
  root than the one `inventory-build` receives.
- Hidden visibility: the runtime state root is used as today; no new hidden-mode branch.

## Acceptance criteria

- [ ] `permission-prove` (with `runtimeStateRoot`), `inventory-build`, `verdicts-validate` and
      `write-set-build` each write their result under
      `<runtime root>/.effective-flow/backlog-audit/inputs/` with a name `<kind>-<runId>-<n>.json`,
      return its absolute path as `data.inputFile`, and the file's parsed object deep-equals
      `data`.
- [ ] The chain `permission-prove` → `epic-candidates` → `inventory-build` → `bounds-check` →
      `verdicts-validate` → `write-set-build` → `write-set-apply`, run with the existing stubbed
      forge reads and writes, succeeds when each call receives only the returned paths in its
      reference fields; the same `inventoryFile` and `permissionFile` serve every consumer and still
      exist after each successful consumer; an external-target fixture also passes
      `external-call-check` with `permissionFile` and `writeSetFile`.
- [ ] A referenced file changed in one value byte between calls, keeping valid JSON, fails with
      `TAMPERED_INPUT`; a symlinked referenced file or an out-of-tree path fails with
      `INVALID_PAYLOAD`; a symlinked directory component fails with `UNSAFE_RUNTIME_STATE`.
- [ ] Sending both an inline field and its reference field, a reference field the operation does
      not consume, an agent-authored name of the right kind (for example `inventoryFile` naming
      `inventory-build-1.json`), or a copied file whose `inputFile` differs from its path fails with
      `INVALID_PAYLOAD`.
- [ ] A second `inventory-build` with a permission that already started a run fails with
      `INVALID_PAYLOAD` before any forge read; `inventory-build` given an inline permission whose
      `inputFile` lies under another runtime root fails with `INVALID_PAYLOAD`; `write-set-build`
      given a permission or `merged` of another run, and `write-set-apply` and
      `external-call-check` given a `writeSet` of another run, fail with `INVALID_PAYLOAD`;
      `write-set-apply` and `external-call-check` given `permissionFile` and `writeSetFile` under
      two different runtime roots fail with `INVALID_PAYLOAD`; a permission without `runId` is
      still accepted.
- [ ] `snapshot-cleanup` with `{runtimeStateRoot, runId}` removes every output file of that run and
      none of a concurrent run's, and reports them in `removedInputs`; with an unexpected entry in
      `inputs/` it removes no input file, still removes the run's snapshot directory and fails with
      `UNSAFE_RUNTIME_STATE`; without `runId`, an unexpected entry in `inputs/` still lets the
      stale snapshots be removed, removes no input file and fails with `UNSAFE_RUNTIME_STATE`; an
      unexpected entry inside a snapshot directory fails the call before any input file is removed;
      in both modes an output temp younger than `NO_CLOBBER_TEMP_MAX_AGE_MS` is skipped and an
      older one removed.
- [ ] A bound stop from `bounds-check` returns `{stopped: true, stop}` even when `inputs/` holds an
      unexpected entry.
- [ ] A returned output path sent as whole-input `{"inputFile": …}` fails with `INVALID_PAYLOAD`
      and the file still exists afterwards.
- [ ] A persist failure injected after `inventory-build` wrote its snapshot fails with
      `UNSAFE_RUNTIME_STATE` and leaves `.effective-flow/backlog-audit/snapshots` present and empty.
      Seam, as in `test/triage-core.test.mjs` `persistFailure`: a permission from the existing
      `proven()` helper (no `runtimeStateRoot`, so no `runId` and no already-started check), and
      `.effective-flow/backlog-audit/inputs` replaced by a regular file before `inventory-build`.
- [ ] `permission-prove` without `runtimeStateRoot` returns today's object and writes no file.
- [ ] All existing tests in `test/backlog-audit-core.test.mjs` that pass objects inline still pass;
      the one rebuild-identity test is narrowed as listed under "Affected files", keeping its
      invariant on entry ids and entry hashes.
- [ ] `src/tools/backlog-audit.md` states the reference-field rule once, its exit rule fires once
      `permission-prove` returned a `runId`, `test/backlog-audit-contract.test.mjs` asserts both,
      `contextBudget` is not above 412, and `node build.mjs` reports `backlog-audit` within it.
- [ ] A follow-up issue for the post-release manual check exists and the PR links it.
- [ ] CI order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
      `pnpm test:distribution`.

## Validation plan

- Unit tests in `test/backlog-audit-core.test.mjs` with the existing `repository()` and `forge()`
  helpers and `executeOperation` deps: per-producer persistence and deep equality; the reference
  chain with file reuse (tracker and external fixture); one-value-byte tamper; symlinked file,
  out-of-tree path and symlinked directory component; both-forms, unconsumed-field, wrong-kind name
  and copied-file rejections; already-started permission; cross-run permission, `merged` and
  `writeSet` (including `external-call-check`); inline permission under another root;
  `permissionFile` and `writeSetFile` under two runtime roots for `write-set-apply` and
  `external-call-check`; narrowed rebuild-identity test;
  run-scoped cleanup with a second run's files and a fresh foreign temp present;
  fail-closed cleanup on an unexpected entry; stale temp sweep; returned path refused as whole
  input and kept; persist failure leaves no snapshot; `permission-prove` without
  `runtimeStateRoot` writes nothing.
- `test/backlog-audit-contract.test.mjs`: updated exit-rule and input-file assertions on the new
  prose, including the fixed whole-input trigger for `externalIssues`, `primary`, `panel`,
  `drafts` and `current` together with the runtime-guard, lowest-absent-`<n>` and write-only-while-absent
  safeguards, the `permission-prove` call shape with `runtimeStateRoot`, and the
  `external-call-check` reference-field call shape in `src/shared/backlog-audit-external.md`.
- CI order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`; read the
  `backlog-audit` line of `Always-loaded core (lines/budget)`.
- Manual check after release (maintainer, outside the implementing run's completion condition,
  tracked by a follow-up issue the implementing run opens and links from the PR, decided by score):
  `/effective-flow backlog-audit` over a goal with at least ten matching issues completes; during
  the run the agent never re-emits a hash-bearing object and never reads a transcript or session
  file.

## Assumptions and open points

- Assumption (verified): each producer's `data` is the hash-bearing object itself
  (`backlog-audit-core.mjs` `inventoryBuild`, `verdictsValidate` and `writeSetBuild` return
  `withHash(...)`; `permissionProve` returns `intake.proveRunnerPermission(...)`).
- Assumption (verified): today `runId` is minted in `inventoryBuild` after the bounds pre-check;
  no state records that a proof started a run; `snapshotCleanup` with `runId` does not touch
  `inputs/`, only the day-old sweep does.
- Assumption (verified): `permission-prove`, `write-set-apply` and `external-call-check` receive no
  `runtimeStateRoot` today; `verdicts-validate` and `write-set-build` reach it through
  `inventory.runtimeStateRoot`.
- Assumption (verified): backlog-audit writes no runtime report named by run id (its report name
  comes from `name-allocate` with family `concept`), so the already-started check can rely only on
  the run's snapshot directory and its inventory output files.
- Residual risk (accepted, consistent with the existing threat model): the hashes are tamper
  evidence, not authentication. After a run's `snapshot-cleanup` its snapshot and output files are
  gone, so an inline copy of its permission could start a new inventory; harmless, because nothing
  of the earlier run remains to collide with. A forged permission carrying a concurrent run's id
  before that run has a snapshot could let one run's cleanup remove the other's output files.
- Residual risk (accepted, decided by score, as in triage): another run's day-old entry sweep
  removes the output files of a run paused for more than 24 hours at its confirmation gate; that
  run then fails closed with `INVALID_PAYLOAD` at `write-set-build` or `write-set-apply`, and a
  rerun recovers. The issue routes day-old leftovers through the existing sweep.
- Out of scope per the issue: changing the hash function or `TAMPERED_INPUT` semantics, and sharing
  code between the triage and backlog-audit helpers.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-BAT",
    "question": "Who owns the issue post-release manual acceptance check (backlog-audit over at least ten matching issues, no re-emitted hash-bearing object, no transcript or session read)?",
    "options": [
      "Follow-up issue",
      "Pre-merge local-link run",
      "Untracked maintainer note"
    ],
    "escape": [],
    "stop": null,
    "scores": [
      {
        "label": "Follow-up issue",
        "score": 8,
        "reason": "Matches the after-release timing and the #730/#753 precedent, and an unattended run ending at a draft PR can open and link the issue itself."
      },
      {
        "label": "Pre-merge local-link run",
        "score": 3,
        "reason": "Contradicts the after-release wording and changes the host installed skill, which an unattended run should not do."
      },
      {
        "label": "Untracked maintainer note",
        "score": 3,
        "reason": "An untracked acceptance criterion is easily dropped after merge, the gap the #730 decision closed."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How does snapshot-cleanup validate the inputs directory beside the snapshots once it also removes helper output files?",
    "options": [
      "Accept and report",
      "Two fail-closed groups",
      "Run-scoped only"
    ],
    "escape": [],
    "stop": null,
    "scores": [
      {
        "label": "Accept and report",
        "score": 5,
        "reason": "Matches triage and the issue wording but regresses today: one stray input file would keep quoted third-party snapshot text on disk until the user acts."
      },
      {
        "label": "Two fail-closed groups",
        "score": 8,
        "reason": "Keeps validate-before-remove for the run output files as the issue asks while snapshot removal never depends on the state of inputs, in both modes."
      },
      {
        "label": "Run-scoped only",
        "score": 4,
        "reason": "A stray input still blocks the run own snapshot at the exit rule, the main privacy path, and the two modes diverge."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How does the plan handle another run day-old sweep removing the output files of a run paused for more than 24 hours at its confirmation gate?",
    "options": [
      "Accept residual risk",
      "Per-run-id sweep"
    ],
    "escape": [],
    "stop": null,
    "scores": [
      {
        "label": "Accept residual risk",
        "score": 9,
        "reason": "The issue routes day-old leftovers through the existing sweep, triage accepted the same risk, and the paused run fails closed and recovers by a rerun; simpler than a per-run keep rule at almost no loss."
      },
      {
        "label": "Per-run-id sweep",
        "score": 3,
        "reason": "A run paused past the cutoff has all its files past it anyway, so the keep rule adds logic and tests for little gain."
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
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         1 |    1 |
| Error cases     |        0 |         1 |    4 |
| Testability     |        0 |         2 |    2 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    2 |

### Findings

- Testability, Important (incorporated): the persist-failure seam built the permission with
  `runtimeStateRoot`, so the already-started check would fail before any snapshot write and the
  test would pass without exercising the rollback. The criterion now uses the `proven()` permission
  without `runId` and asserts an existing, empty snapshot root.
- Error cases, Note (incorporated): the plan described a `write-set-apply` retry inside a run that
  the tool does not have; a `failed` apply stops the run, and a rerun is a new run.
- Data protection, Note (decided by score): validating everything first would let one stray input
  file keep a run's snapshot on disk; cleanup now validates snapshots and inputs as two separate
  fail-closed groups.
- Error cases, Note (decided by score): another run's day-old sweep can remove a run paused more
  than 24 hours; accepted as a residual risk under Assumptions.
- Maintainability, Note (incorporated): the intake proof's `proofHash` must be stripped before the
  permission is re-hashed with `runId` and `inputFile`.
- Error cases, Note (incorporated): a rebuilt `writeSet` leaves an older valid file; the tool prose
  passes the most recent result of each kind.
- Full re-review after the scored decisions (planning ladder, floor boundary: destructive
  removal). Data protection, Important (incorporated): the two-group rule overstated a
  check-all-first rule for the snapshot group; the snapshot group keeps today's name-by-name
  removal. Error cases, Important (incorporated without a new round, minimal option): the reverse
  direction was unstated; a snapshot-group failure stops the call before the `inputs/` group, as
  today, because the other option (aggregate errors and still run `inputs/`) adds error
  aggregation that no requirement asks for. Error cases, Note (incorporated): the internal
  `boundsCheck` cleanup stays snapshot-only so a bound stop is never lost. Scope, Note
  (incorporated): the PR labels the cleanup departure. Testability, Note (incorporated): the
  day-old mode and the snapshot-group failure are asserted. Maintainability, Note (incorporated):
  the return field is named `removedInputs` in both modes.
- Deep plan review (`plan-review`): Testability, Important (incorporated): persisting the path in
  the hash changes `setHash` across identical rebuilds, which breaks the existing rebuild-identity
  test; the test is listed and narrowed, and the hash consequence is stated. Security, Note
  (incorporated): the rewritten tool prose keeps the whole-input safeguards word for word and the
  contract test asserts them. Testability, Note (incorporated): with no root known, the first
  reference's root binds the others, with its own criterion.

## Open points

- No open points.

## Build completion

- The backlog-audit helper persists its four hash-bearing results and accepts their returned paths
  in operation-specific reference fields. Inline inputs remain supported. The helper verifies
  references and binds them to the audit run before use.
- Snapshot cleanup and input cleanup validate their groups separately. A bad input entry cannot
  prevent snapshot cleanup, and a run-scoped cleanup does not remove another run's output files.
- Updated the backlog-audit tool, external tracker guidance, developer docs and regression tests.
  The built tool uses 411 of its 412 context-budget lines.
- The 104 targeted tests passed. The full run reported 6,796 passes, 85 skips and one test cancelled
  at its own timeout. That test passed on the base and in an independent targeted check of the
  unchanged candidate. The full suite was not rerun. Format, build and distribution checks passed.
- The post-release manual check is tracked in #765.

## Review findings

**Date:** 2026-11-26
**Reviewer:** Node.js reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     0 |
| Open / Not implemented |     0 |

No findings found.
