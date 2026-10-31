## Memory operations

`<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` changes only through the three typed `memory`
operations of the bundled runtime-state helper. Never lock, merge, or rewrite it in prose; a new key
family needs a new helper operation. Each call is one complete transaction: it takes and releases
the `memory` lock itself, re-reads memory, changes only its own field, preserves every other field,
and replaces the file atomically. The owning workflow has already loaded “Runtime-state write
safety” and the runtime-directory migration prerequisite.

```include
state-helper-call
```

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
