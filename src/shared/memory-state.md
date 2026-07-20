## Shared memory-state mutation

Every mutation of `.effective-flow/memory.json` uses this one repository-wide protocol. This
includes finding-number reservations, migration of `.sf-memory.json`,
`runtimeMigration.directory`, `labelMigration.sf`, `configMigration.adr`, and every future
field. The owning workflow must already have loaded “Runtime-state write safety”; the runtime
directory migration prerequisite loads this fragment for its own marker and for all later
writers. Do not add a writer-specific lock or direct JSON rewrite.

### Acquire and own the lock

1. Generate a unique, unguessable lock token for this session. Apply “Runtime-state write
   safety” to the exact target `.effective-flow/memory.lock`, then acquire the lock exclusively
   with atomic `mkdir .effective-flow/memory.lock`. A successful `mkdir` is the only evidence of
   acquisition; checking for absence first grants nothing.
2. As the first operation after acquisition, write
   `.effective-flow/memory.lock/owner.json` exclusively with at least the token, workflow/session
   identifier, and UTC acquisition timestamp; include the host and process ID when available.
   Guard this concrete target before writing it. If the owner record cannot be written, remove
   the newly acquired empty lock directory only if it is still the lock from this acquisition,
   then fail.
3. If `mkdir` reports that the lock exists, retry with a short bounded delay for no more than 30
   seconds total. Do not mutate memory or publish an artifact while waiting. On timeout, read the
   owner record without changing it and report the recorded owner, session, and timestamp (or
   that the record is missing or invalid) with the lock path.
4. Never infer that age alone makes a lock disposable. A missing or malformed owner record, an
   apparently inactive process, or an unusually old timestamp makes it only an apparent orphan.
   Ask for explicit user confirmation before removing an apparent orphan. After confirmation,
   re-read the owner record and verify that the observed token or exact missing-record state is
   unchanged before guarded removal; otherwise leave it for its current owner and retry normally.
5. Normal release must release only its own lock: re-read `owner.json`, require the exact token
   from this acquisition, remove that owned record, and remove the lock directory only if empty.
   A mismatch or foreign entry is reported and left untouched. Use a `finally`/trap-equivalent
   release on handled failures; an abrupt interruption may leave an apparent orphan for the
   confirmed recovery path above.

### Mutate a fresh object and replace it atomically

While holding the lock:

1. Re-read `.effective-flow/memory.json` inside the lock. A missing file means an empty object,
   except when the legacy migration below supplies the initial object. Existing content must be
   valid JSON and a JSON object. If present, `lastFindingNumber` must be a nonnegative safe
   integer. Invalid JSON, a non-object value, or an invalid `lastFindingNumber` fails clearly;
   never default, repair, or overwrite it destructively.
2. Merge only the field or subtree owned by the current operation into that fresh object.
   Preserve all other known or unknown fields with the same JSON meaning. A subtree writer
   re-reads and merges sibling keys rather than replacing their parent. The directory migration
   recursively adds only absent legacy keys with the fresh target winning every conflict; a
   marker writer updates only its named marker; a reservation updates only
   `lastFindingNumber`.
3. Serialize the complete merged object, including a trailing newline, to a same-directory unique
   temporary file such as `.effective-flow/.memory.json.<session>.<token>.tmp`. Guard the concrete
   temporary path, create it exclusively, finish and close the write, and flush it when the host
   supports that operation. Never truncate or stream partial content into `memory.json`.
4. Apply “Runtime-state write safety” to `.effective-flow/memory.json` immediately before an
   atomic rename of the owned temporary file over the target. Because the temporary file is in
   the same directory, readers see either the previous complete object or the new complete
   object. If writing, flushing, or replacement fails—including permissions or disk-full
   errors—the prior `memory.json` remains the source of truth. Report the concrete failure and
   clean up only this operation's own temporary file; never delete a foreign temporary file or
   lock.
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

When `.effective-flow/memory.json` is absent and `.sf-memory.json` is present, acquire the same
lock before migration. Inside the lock, re-check that the target is still absent, read and
validate the legacy file as the initial JSON object—including `lastFindingNumber` when present—and
persist it through the same temporary-file and atomic-rename path. Remove `.sf-memory.json` only
after successful persistence and only when it is still the file that was read; a removal failure
is reported without rolling back the new target. Never migrate by a separate direct write.

Timeout, invalid state, permission failure, disk exhaustion, failed replacement, or loss of lock
ownership blocks the owning mutation and every publication that depends on it. Preserve foreign
state, give the exact path and error, and leave confirmed recovery or repair to the user.
