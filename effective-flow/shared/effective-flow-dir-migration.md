## Runtime directory `.effective-flow/` and migration from `.firmo/`/`.sf-plugin/`

Effective Flow keeps project-local runtime data under `.effective-flow/` (`memory.json`,
`cache.json`, `review/`, `investigation/`, `merge-gate/` delegation messages, `.worktrees/`, and
wisdom files; a legacy `config.json` may still be present as transitional input, but configuration
migration to the project-setup ADR is owned by `effective-flow setup`). Earlier versions used `.firmo/`,
and still older ones used `.sf-plugin/`.

Every workflow that can mutate `.effective-flow/` must load this fragment after
“Runtime-state write safety” and run the following prerequisite before its **first** runtime
write. Merely finding `.effective-flow/` does not prove that migration ran. The stable,
versioned completion marker is the JSON value `runtimeMigration.directory.version: 1` in
`.effective-flow/memory.json`.

## Memory operations

`<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` changes only through the three typed `memory`
operations of the bundled runtime-state helper. Never lock, merge, or rewrite it in prose; a new key
family needs a new helper operation. Each call is one complete transaction: it takes and releases
the `memory` lock itself, re-reads memory, changes only its own field, preserves every other field,
and replaces the file atomically. The owning workflow has already loaded “Runtime-state write
safety” and the runtime-directory migration prerequisite.

**Helper call shape.** Write every call of the three JSON helpers as exactly one simple command:

```text
node <skill-root>/scripts/<helper>.mjs <argv> <<< '<json>'
```

with exactly this `<argv>` per helper: `effective-flow-state.mjs <group> <operation>`,
`config-resolve.mjs resolve`, and `remote-tracker.mjs <operation>`, or `<operation> --apply` for a
mutation.

- Resolve `<skill-root>` from the currently loaded Effective Flow skill, in the form it was
  reached (a symlinked install path included, never resolved through `realpath`), and spell it out
  literally as an absolute path. Never use a shell variable, `$PWD`, `~`, command substitution,
  `cd … &&`, an `echo … |` or `printf … |` pipe, a heredoc, a loop or function, a compound
  command joined by `;`, `&&` or `||`, a trailing `echo "exit=$?"` or any other trailing command,
  or `| grep` or any other pipe on the output. Read the exit status and the envelope from the tool
  result itself.
- Every JSON value is literal too: `cwd`, where sent, is the literal absolute path its owning
  contract names (`RUNTIME_STATE_ROOT` for `effective-flow-state.mjs`), never `$PWD`. Write a `'`
  inside the JSON as `'\''`.
- The Claude Code allow rule matches only this literal shape, so any other shape prompts for
  permission on every call. The rule binds every harness, since it is also the auditable shape.

Call one operation per command. `cwd` is the verified `RUNTIME_STATE_ROOT`, never `EXECUTION_ROOT`
or another linked worktree; `owner` carries no `runId`:

```text
node <skill-root>/scripts/effective-flow-state.mjs memory reserve <<< '{"cwd":"<RUNTIME_STATE_ROOT>","owner":{"workflow":"<workflow>"},"count":<N>}'
node <skill-root>/scripts/effective-flow-state.mjs memory set-marker <<< '{"cwd":"<RUNTIME_STATE_ROOT>","owner":{"workflow":"<workflow>"},"marker":"<marker>"}'
node <skill-root>/scripts/effective-flow-state.mjs memory migrate-directory <<< '{"cwd":"<RUNTIME_STATE_ROOT>","owner":{"workflow":"<workflow>"}}'
```

- `memory reserve`: `count` is the exact number of new findings (1–10000). `result.first` to
  `result.last` is the reserved range; `result.firstId` and `result.lastId` are its ends formatted
  as `R-<7 digits>`.
- `memory set-marker`: `marker` is `config-migration-adr`, with `"version":"config-to-adr-v1"`, or
  `label-migration-sf`. `result.changed: false` means the marker was already present.
- `memory migrate-directory` belongs to the runtime-directory migration prerequisite.
- `review write-report` runs a missing directory migration itself, then the `memory reserve`
  transaction with its outcomes below, then the report write (see `review`).

### Outcomes

`ok: true` carries `result`; exit 4 carries `outcome.code`. An outcome not handled below, any other
nonzero exit, an unparsable envelope, or an `error` blocks the owning mutation and every
publication that depends on it, naming the code, message, and path. A blocked call changed nothing.

- **`MIGRATION_REQUIRED`:** call `memory migrate-directory` once, treating its
  `MIGRATION_NOT_NEEDED` as success (another session won the race), then retry the operation once.
  Any other non-success result of either call blocks with its code; a delegated worker reports it
  and never asks the user.
- **`LOCK_HELD`:** the bounded wait ran out. Report the outcome's owner (its fields, or
  `missing`/`invalid`/`oversized` with byte count and digest), identity, and lock path, and block.
  A delegated worker returns these diagnostics to its orchestrator and never asks the user; a
  relayed or non-interactive run fails closed and offers no break.
- **`NOT_OWNER`:** the lock was broken and re-taken during the call; nothing was written. Block.
- **Legacy `.sf-memory.json`** is adopted inside the call when canonical memory is absent. Report
  `result.legacyAdopted`, a `result.legacyConflict` (the legacy file changed after the write and was
  kept), and a `result.legacyRemoval` failure with its path; none undoes the committed write.
  `LEGACY_CHANGED` is an error that wrote nothing; the caller may retry once.
- Report an unclean release to the user with its path: the `lockRelease` of a `result` or an
  `outcome` (for example a `leftoverTombstone`), or the release note appended to an error message.

**Orchestrator-only recovery of the memory lock.** Age alone never makes a lock disposable: only a
`missing`, `invalid` or `oversized` owner, or one the user identifies as stale, is an apparent
orphan. Only then, and only as a gated orchestrator, run `lock inspect` (`{cwd, "lock":"memory"}`),
obtain explicit user confirmation for that observation, and run `lock break` with the observed
token, or otherwise with the observed `identity` plus `ownerDigest` (the owner's `sha256`;
`ownerSize`, its `bytes`, when `oversized`; neither when `missing`). `BREAK_MISMATCH` removed
nothing: leave the lock to its current owner. After either result, retry the operation once.

### Reserve finding IDs before publication

Finish confidence filtering, design-decision filtering, local or remote deduplication, and
admission first. If no new finding remains, reserve nothing. Otherwise call `memory reserve` with
the exact count of the ordered list that will be published, map that list onto the returned range
in order, and only after the call succeeded publish any report, finding issue, or epic. A failed
reservation prevents all publication. A failure after it never reuses the range: unpublished IDs
stay permanent gaps. Report the range and what was already published; a retry deduplicates again
and reserves a new range.

## Migration prerequisite steps

1. **Read without creating anything.** Read the absolute
   `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle when present. A valid marker makes the
   prerequisite a no-op. Do not create a runtime footprint during a read-only run; this
   prerequisite runs only because a workflow-specific runtime write is already authorized and
   imminent.
2. **Migrate through the helper.** Without the marker, call `memory migrate-directory` as shown in
   “Memory operations”. The helper reads `.firmo/` when it exists, otherwise `.sf-plugin/`, from
   `RUNTIME_STATE_ROOT` only; copies only missing entries without ever replacing a target, excluding
   `.worktrees/`; merges the legacy `memory.json` so that existing values win; and writes the marker
   last. Without a legacy source it writes the marker alone.
3. **Handle the outcome.** `review write-report` runs this prerequisite in the same call: when its
   `result.migration` has `performed: true` or `failed: true`, steps 1 and 2 already ran and are
   not repeated; read the success fields (`source`, `copiedCount`, `keptCount`, `skipped`) from
   `result.migration`.
   - Success: report `result.source`, `result.copiedCount`, and `result.keptCount`. Report every
     `result.skipped` entry (a symlink or special file that was never followed or copied) with its
     path and type, and `result.skippedCount`.
   - `MIGRATION_NOT_NEEDED`: a concurrent run already wrote the marker; continue.
   - `LEGACY_MEMORY_INVALID` or `MIGRATION_INCOMPLETE` (`reason`: `copy-failed` or
     `target-missing`): the marker stays unset and the copied files stay. Report the path and
     reason, perform none of the workflow-specific runtime writes, and leave the retry to a later
     run.
   - Every other result follows “Memory operations”.

Both legacy directories stay unchanged. The `.gitignore` switch to a single `.effective-flow/`
entry—including migration of the earlier two-line pattern `.effective-flow/*` plus
`!.effective-flow/config.json`, as well as a blanket `.firmo/` or `.sf-plugin/` ignore line—is
handled only by `effective-flow setup`. Deletion of preserved legacy directories remains an explicit,
user-confirmed responsibility of `effective-flow cleanup`.
