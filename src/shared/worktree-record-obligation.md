## Worktree record obligation

This binds a run only once it creates a worktree; a reused harness-managed, user-managed or
in-place checkout creates no record, and this self-check stays silent for it. Before any
`git worktree add`, reading the deferred `worktree-integration` fragment is mandatory, not a
judgement call. Immediately after its verified `effective-flow-created` receipt, and before setup
or delegation, write the lifecycle record
`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/<RECORD_ID>.json` with `worktree record-init`
as `worktree-lifecycle` specifies; if that call is not `ok`, retain the worktree and branch and
stop. On every exit path – completion, failure or abort – apply the transition that "Lifecycle
outcome handling" in `worktree-integration` assigns to it.

**Worktree-record exit self-check.** Run it after the exit path's own transition and before the
final report whenever this run executed `git worktree add`, with or without a receipt. Derive the
set from durable state, never from memory: `worktree inspect` with this run's `sessionId` returns its records and, as `unrecorded`, the registered worktrees under its session paths that no record
names; keep the records whose `workflow` is this run's. Every worktree this run created must end with its
record deleted and the worktree unregistered, or with its record in cleanup-ready, aborted, failed
or cleanup-failed; anything else is reported. Report a `cleanup-in-progress` record. Report each
`unrecorded` worktree as its own entry with path and branch: `{{SKILL:cleanup}}` cannot remove it,
and manual reconciliation is required. Set a record left `active` once with `worktree transition`
– to `aborted` after a controlled stop, otherwise to `failed` – and report only a call that is not
`ok`. Every self-check call passes `"executionRoot":"<RUNTIME_STATE_ROOT>"`, since the run's own
worktree may already be withdrawn. The self-check never removes or claims a worktree and never creates or backfills a record.
