## Worktree record obligation

This binds a run only once it creates a worktree; a reused harness-managed, user-managed or
in-place checkout creates no record, and this self-check stays silent for it. Before any
`git worktree add`, reading the deferred `worktree-integration` fragment is mandatory, not a
judgement call. Immediately after its verified `effective-flow-created` receipt, and before setup
or delegation, write the lifecycle record
`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/<RECORD_ID>.json` exactly as
`worktree-lifecycle` specifies; if that write fails, retain the worktree and branch and stop. On
every exit path – completion, failure or abort – apply the transition that "Lifecycle outcome
handling" in `worktree-integration` assigns to it.

**Worktree-record exit self-check.** Run it after the exit path's own transition and before the
final report whenever this run executed `git worktree add`, with or without a receipt. Derive the
set from durable state, never from memory: the linked worktrees at this run's
`BASE_DIR/REPO_NAME/SESSION_ID` path in `git worktree list --porcelain`, and every record whose
`sessionId` and `workflow` match this run. Every worktree this run created must end with its
record deleted and the worktree unregistered, or with its record in cleanup-ready, aborted, failed
or cleanup-failed; anything else is reported. Report a `cleanup-in-progress` record. Report each
registered worktree no record names by `worktreePath` as its own entry with path and branch:
`{{SKILL:cleanup}}` cannot remove it, and manual reconciliation is required. Set a record left
`active` once – to `aborted` after a controlled stop, otherwise to `failed` – under the record lock
and the runtime-state write-safety guard, and report only a failed write. The self-check never
removes or claims a worktree and never creates or backfills a record.
