## Shared memory-state mutation

Every mutation of the retained absolute
`<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle uses this one repository-wide protocol.
This includes finding-number reservations, migration of
`<RUNTIME_STATE_ROOT>/.sf-memory.json`,
`runtimeMigration.directory`, `labelMigration.sf`, `configMigration.adr`, and every future
field. The owning workflow must already have loaded “Runtime-state write safety”; the runtime
directory migration prerequisite loads this fragment for its own marker and for all later
writers. Do not add a writer-specific lock or direct JSON rewrite.

Resolve the canonical file, legacy file, and temporary file from the retained, verified
`RUNTIME_STATE_ROOT`. Run every guard from that root and use the resulting absolute handles below
the main checkout. Never inspect, lock, migrate, or mutate a same-named path below
`EXECUTION_ROOT` or another linked execution worktree.

### Acquire and own the lock

`memory.lock` goes only through the bundled runtime-state helper, one call per step, in this
here-string shape and never as a heredoc (`<skill-root>` is the loaded skill's directory, `cwd` the
verified `RUNTIME_STATE_ROOT`):

```text
node <skill-root>/scripts/effective-flow-state.mjs lock acquire <<< '{"cwd":"<RUNTIME_STATE_ROOT>","lock":"memory","owner":{"workflow":"<workflow>"},"waitSeconds":30}'
```

The helper applies the runtime-state guard to the lock itself. Exit 4 carries one of the outcome
codes `LOCK_HELD`, `NOT_OWNER`, `NOT_HELD`, or `BREAK_MISMATCH`, handled below; any other nonzero
exit or `error` envelope blocks the owning mutation with its code and message.

1. **Acquire** with `lock: "memory"`, `owner: {"workflow": …}` (no `runId`), and
   `waitSeconds: 30`. Retain `result.owner.token`: it is the only evidence of ownership.
2. **`LOCK_HELD`** means the bounded wait ran out. Do not mutate memory or publish an artifact;
   report the `outcome` owner (its fields, or `missing`/`invalid` with byte count and digest),
   identity, and lock path, and block the owning mutation. A delegated worker never asks the user;
   it returns these diagnostics to its orchestrator. A gated orchestrator may take step 3; a
   relayed or non-interactive run fails closed with the diagnostics and offers no break.
3. **Apparent orphan.** Age alone never makes a lock disposable: only a `missing`, `invalid` or
   `oversized` owner, or one the user identifies as stale, is an apparent orphan. Only then, and
   only as the orchestrator, run `lock inspect` (`{cwd, lock}`), obtain explicit user confirmation
   for that observation, and run `lock break` with the observed token, or otherwise with the
   observed `identity` plus `ownerDigest` (the owner's `sha256`; `ownerSize`, its `bytes`, when
   `oversized`; neither when `missing`). `BREAK_MISMATCH` removed nothing: leave the lock to its
   current owner. After either result, acquire again.
4. **Ownership check:** immediately before the atomic rename of `memory.json`, run `lock inspect`
   and require a `valid` owner whose token equals the retained token; otherwise ownership is lost.
5. **Release** in a `finally`/trap-equivalent path with `lock release` (`{cwd, lock, token}`).
   `NOT_HELD` or `NOT_OWNER` is reported as lost ownership and changes nothing. An abrupt
   interruption may leave an apparent orphan for the confirmed path in step 3. Report a
   `leftoverTombstone`, or a `WRITE_FAILED` naming a tombstone, to the user with that path.

### Mutate a fresh object and replace it atomically

While holding the lock:

1. Re-read the retained absolute `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle inside
   the lock. If it exists, use it as the base object. If it is absent, select the base exactly once
   through “Legacy `.sf-memory.json`” below: a valid, unchanged runtime-root legacy file is the
   base, otherwise the base is an empty object. Existing or legacy content must be valid JSON and
   a JSON object. If present, `lastFindingNumber` must be a nonnegative safe integer. Invalid JSON,
   a non-object value, or an invalid `lastFindingNumber` fails clearly; never default, repair, or
   overwrite it destructively.
2. Merge only the field or subtree owned by the current operation into that fresh object.
   Preserve all other known or unknown fields with the same JSON meaning. A subtree writer
   re-reads and merges sibling keys rather than replacing their parent. The directory migration
   recursively adds only absent legacy keys with the fresh target winning every conflict; a
   marker writer updates only its named marker; a reservation updates only
   `lastFindingNumber`.
3. Serialize the complete merged object, including a trailing newline, to a same-directory unique
   absolute file such as
   `<RUNTIME_STATE_ROOT>/.effective-flow/.memory.json.<session>.<token>.tmp`. Guard the concrete
   temporary path from `RUNTIME_STATE_ROOT`, create it exclusively, finish and close the write,
   and flush it when the host supports that operation. Never truncate or stream partial content
   into `memory.json`.
4. Apply “Runtime-state write safety” from `RUNTIME_STATE_ROOT` to the absolute canonical memory
   handle and pass the ownership check, both immediately before an atomic rename of the owned
   temporary file over the target.
   Because the temporary file is in the same directory, readers see either the previous complete
   object or the new complete object. If writing, flushing, or replacement fails—including
   permissions or disk-full errors—the prior `memory.json` remains the source of truth. Report the
   concrete failure and clean up only this operation's own temporary file; never delete a foreign
   temporary file or lock.
5. Release the owned lock only after the atomic replacement succeeds or the failure has been
   handled. A successful replacement is committed memory state and is never rolled back to
   compensate for a later artifact or remote-operation failure.

### Reserve finding IDs before publication

A producer must finish confidence filtering, design-decision filtering, and local or remote
deduplication before it knows the findings that will actually be new. If none remain, reserve
nothing and do not write `lastFindingNumber`. Otherwise:

1. Let `N` be the exact positive number of new findings. Acquire the lock, validate the fresh
   object and counter, and reserve the exact nonzero contiguous range
   `lastFindingNumber + 1` through `lastFindingNumber + N` by atomically persisting the upper
   bound under this protocol.
2. Record the ordered finding-to-ID mapping in in-run state, release the lock, and only then—before
   publishing any report, finding issue, or epic—use that reserved mapping. Concurrent producers
   therefore receive disjoint ranges.
3. Failure before the reservation is persisted prevents all publication. Failure or interruption
   after reservation never decrements or reuses the counter: unpublished IDs become permanent
   gaps, which are harmless evidence of monotonic allocation. Report the reserved range and any
   artifacts that were published before the interruption; on retry, deduplicate again and reserve
   a new range for whatever still needs publication.

### Legacy `.sf-memory.json`

Legacy adoption is never a preliminary migration or a separate write. For **every** writer—such
as the runtime-directory marker, label marker, config marker, or finding-range reservation—the
same locked transaction performs these steps when canonical memory is absent:

1. Inside the acquired lock, re-check the absolute
   `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle. If another compliant writer created
   it, use that fresh canonical object and leave `<RUNTIME_STATE_ROOT>/.sf-memory.json` untouched.
2. Otherwise, if `<RUNTIME_STATE_ROOT>/.sf-memory.json` exists, read it once, record its file
   identity and content digest, and validate it as the initial object, including
   `lastFindingNumber`. Invalid or unreadable legacy content fails the whole transaction; never
   replace it with an empty object.
3. Merge the current writer's intended mutation into that same initial object. Thus a
   runtime-directory prerequisite adds `runtimeMigration.directory` without losing the legacy
   counter; a label/config marker adds only its subtree; and a reservation allocates from the
   legacy `lastFindingNumber`.
4. Immediately before replacement, verify that the absolute legacy handle is unchanged by identity
   and digest. A change fails before canonical persistence. Otherwise write the combined base plus
   current mutation through one temporary file and one atomic replacement of canonical memory.
5. Only after that replacement succeeds, re-check that the legacy identity and digest still
   match, then remove `<RUNTIME_STATE_ROOT>/.sf-memory.json`. If it changed, do not remove it and
   report the conflict; if removal alone fails, report that cleanup failure without rolling back
   committed canonical memory.

For example, root legacy memory with `lastFindingNumber: 41` plus the runtime-directory
prerequisite produces one canonical object that retains `41` and adds the directory marker. A
following two-finding reservation therefore allocates `R-0000042`–`R-0000043` and persists `43`.
Never let the prerequisite publish its marker first and thereby hide the root legacy counter.

Timeout, invalid state, permission failure, disk exhaustion, failed replacement, or loss of lock
ownership blocks the owning mutation and every publication that depends on it. Preserve foreign
state, give the exact path and error, and leave confirmed recovery or repair to the user.
