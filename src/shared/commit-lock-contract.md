**Commit-lock waiting and orphans** (`iterate-commit`, `apply-review-commit`). A unit is one
`iterate` item or one `apply-review` finding; its delegation is the worker the orchestrator
started for it, and an inline unit is its own delegation.

- **Ownership check:** immediately before `git commit`, run `lock inspect` and require a `valid`
  owner whose token equals the retained token. Otherwise ownership is lost: do not commit,
  unstage only this unit's own staging, and fail the unit closed.
- **Bounded worker wait:** on `LOCK_HELD` the worker re-invokes `lock acquire` unchanged. After
  three consecutive `LOCK_HELD` results with an unchanged owner and identity it stops waiting,
  leaves its edits unstaged, and returns the diagnostics (owner, identity, lock path) to the
  orchestrator. A worker cannot know whether another delegation is still active, so it never
  waits beyond that, never asks the user, and never breaks a lock.
- **Sibling rule:** only the orchestrator knows which delegations are active. While the owner
  `runId` equals this run's `runId` and the owning delegation is still active, it re-dispatches
  the waiting unit's commit critical section only after that owning delegation has returned,
  once per returned owner, and never takes the orphan path; a re-dispatch that meets another
  active sibling owner waits for that one's return the same way, so the re-dispatches are bounded
  by the run's delegations. A re-dispatched section keeps the unit's original `delegation` value
  `<runId>/<n>`. Once the orchestrator holds that delegation's result and its lock remains, the lock
  counts as foreign.
- **Foreign owner:** the orchestrator only reports the owner to the user, with no break
  suggestion. Age never counts. An apparent orphan is an owner `missing`, `invalid` or
  `oversized`, or one the user identifies as stale; only then, in a gated run, it runs
  `lock inspect`, obtains explicit user confirmation, and runs `lock break` with the observed
  token, or the identity plus owner digest (`ownerSize` for an `oversized` owner). A relayed or
  non-interactive run fails closed with the diagnostics.
- **`BREAK_MISMATCH`** (`changed-before-removal` included) removed nothing. The orchestrator
  re-reads the lock once with `lock inspect`: a sibling owner falls under the sibling rule, any
  other is reported to the user as foreign. No second break runs without a fresh confirmation.
- **After a confirmed break,** the orchestrator re-dispatches that unit's commit critical section
  once; its edits are still unstaged in the tree.
- **Tombstones:** a `leftoverTombstone` in a release or break result (the lock is free), or a
  `WRITE_FAILED` naming a tombstone path, is reported to the user with that path.
