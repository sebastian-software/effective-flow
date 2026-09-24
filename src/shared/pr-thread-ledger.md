## Processed-thread ledger (hidden mode)

This fragment applies only in hidden mode (`visibility: hidden`). There the remote helper
publishes replies, summary comments, and reviews without their marker, so a marker on the pull
request is evidence of nothing. `{{SKILL:iterate}}` then keeps its record of the threads it has
already answered in a local ledger instead, and that ledger takes over the marker's role
everywhere the marker contract in "PR review comment integration" relies on it. A `resolved`
thread stays done exactly as in standard mode, whatever the ledger says.

The ledger is one runtime-state file, `.effective-flow/merge-gate/thread-ledger.json` below
`RUNTIME_STATE_ROOT`. It is keyed by repository, pull-request number, and thread or comment ID. It
is never tracked, never staged, and never published. Both operations go through the remote helper
with the verified absolute `RUNTIME_STATE_ROOT` as `cwd`, like every other helper call. They are
local operations, so neither takes `--apply`:

- **`thread-ledger-lookup`** reads the ledger and creates nothing. Input: `repository` (the
  `repository-resolve` result), `pr`, `threads` (the normalized `review-threads-read` result),
  and `viewer` (the authenticated login from `viewer-read`, when it was established). The result
  classifies every thread as `resolved`, `recorded`, or `pending`. Only `pending` threads enter
  classification.
- **`thread-ledger-record`** adds IDs to the ledger. Input: `repository`, `pr`, and `threads`
  and/or `comments` as ID arrays. It holds an exclusive lock
  (`.effective-flow/merge-gate/thread-ledger.lock`) while it reads, merges, and replaces the file
  atomically, so concurrent records never lose each other's IDs. It is idempotent: an ID recorded
  twice keeps its first entry.

### When to look up

Run the lookup on the same fresh read that Phase 2 classifies, and again on the fresh read that
precedes each reply. Hidden mode replaces both marker exclusions with it: a thread the lookup
reports `recorded` counts as a thread that carries an iterate reply. Hidden mode publishes no
marked review of its own, so the review-marker exclusion has nothing left to exclude. A
caller-supplied `threads=<id>` filter still names its threads explicitly, and a `resolved` or
`recorded` thread stays excluded under it, exactly as a thread with an iterate reply does in
standard mode.

### When to record

Before the first record of a run, complete the loaded "Runtime-state write safety" guard for the
concrete target `.effective-flow/merge-gate/thread-ledger.json`. A blocked guard records nothing:
report it and continue without the ledger.

Record a thread immediately after its reply has been **posted** through `review-thread-reply`
with `--apply`, and before resolving it. Record only a posted reply. A thread whose reply was
unsupported, refused, or never applied stays unrecorded, because in standard mode such a thread
would carry no marked reply either. Optionally add the posted reply's own comment ID as a `comments`
entry; the lookup matches it against both a thread comment's node `id` and its numeric
`databaseId`. Do not record the summary comment: it is a pull-request comment outside every thread
and could never affect the lookup.

### Degradation is reported, never guessed away

- **Missing ledger.** A first hidden-mode run on a checkout has no ledger, and that is not an
  error. When the lookup reports `degraded` with `unrecordedViewerReplies`, those unresolved
  threads already hold a comment by the authenticated login but have no record. The ledger was
  most likely lost, for example because `.effective-flow/` was deleted. Those threads are **not**
  skipped, because authorship alone does not prove the earlier reply finished the thread. Name them
  in the summary as possibly answered before, so a second reply is a disclosed outcome rather than a
  silent one.
- **Corrupt ledger.** The lookup reports `state: corrupt`, treats the ledger as empty, and marks
  the result `degraded`. A record then fails with `LEDGER_CORRUPT` and leaves the file untouched.
  Continue the run without recording, and report the file path so the user can inspect or remove
  it. Never repair, rewrite, or delete it yourself.
- **Held lock.** A record fails with `LEDGER_LOCKED` while another record holds the lock, or
  while a crashed run's lock remains. The lock is never broken, not by age and not by guessing
  that its owner died. Do not retry: continue without recording, and report the lock path so the
  user can remove it once no run is active.
- **Unsafe target.** `UNSAFE_TARGET` (a symlinked, replaced, or vanished runtime directory or
  ledger file; anything already present at the lock path, a symlink included, is `LEDGER_LOCKED`)
  stops every ledger use for the rest of the run. Report it; the replies themselves
  are unaffected.
- **Failed write.** `WRITE_FAILED` from the temporary file or its rename leaves the previous
  ledger in place. A failed lock release is reported after the rename, so the new ledger may already
  be written; recording is idempotent, so either way continue without retrying and report it.

In every one of these cases, the threads the forge reports as `resolved` are still skipped. That is
what keeps a lost ledger from reopening work anybody already closed.
