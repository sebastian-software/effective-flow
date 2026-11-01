## Iterate commit fallback (`HOOKS_UNTRUSTED`)

`commit create` refused this item because the head's hook configuration is not trusted (a fork
head, or a hook-relevant configuration change). Commit this one item through the prose sequence
below instead; its `git commit` runs those hooks and prompts in default mode, so the user sees
it. It keeps the item's `iterate-commit` owner, paths and message. Only the `iterate` orchestrator
loads this fragment, and it already carries the helper call shape and the commit-lock contract
eagerly: apply those loaded copies here. In Codex, request sandbox escalation up front for the
`git add` and `git commit` calls, which write below `.git`.

- Acquire the mutex with `cwd` set to `RUNTIME_STATE_ROOT`; the helper applies the runtime-state
  guard itself:

  ```text
  node <skill-root>/scripts/effective-flow-state.mjs lock acquire <<< '{"cwd":"<RUNTIME_STATE_ROOT>","lock":"iterate-commit","owner":{"workflow":"iterate","runId":"<runId>","item":"<item>","delegation":"<runId>/<n>"}}'
  ```

  Retain `result.owner.token`. Exit 4 is an outcome handled by the commit-lock contract; any
  other nonzero exit or `error` envelope returns `ABORT` for the item without touching the index.

- **Release** on every success, abort, and error path with `lock release`
  (`{cwd, lock, token}`). `NOT_HELD` or `NOT_OWNER` is reported as lost ownership, changes
  nothing, and fails the item closed.

While holding the lock for the entire sequence, in the item's execution worktree:

1. Run `git status --porcelain` and inspect `git diff --cached --name-only` and
   `git diff --cached`. If any staged state already exists, treat it as foreign: do not commit,
   take it over, or clean it up. Release the verified-owned lock and return `ABORT` for the item.
2. Reconfirm that the item's explicit stage list contains only its analyzed and dynamically
   approved actual paths. Stage exactly those paths. Never use `git add .`, `git add -A`,
   `git commit -a`, or an equivalent blanket operation.
3. Inspect `git diff --cached --name-only` and require it to equal the explicit item-owned path
   set, then inspect the complete `git diff --cached` and require every staged hunk to belong to
   the current item. Record the verified staged paths and content before committing.
4. Create the item's conventional commit, capture its hash immediately with
   `git rev-parse HEAD`, and write the `item identity -> commit hash` mapping to the wisdom file.
5. Immediately confirm the committed paths and content against the recorded staged diff. Run
   `git status --porcelain`, require `git diff --cached` to be empty, and inspect the remaining
   working-tree diff. Changes from other active items may remain only when they are unstaged and
   outside this item's owned paths; record that residual state in the wisdom file.

If a check fails before the commit, unstage only paths whose staging is provably attributable to
this item in the current lock acquisition, verify the resulting cached state, release the lock
through the helper, and return `ABORT`. Never unstage or otherwise clean foreign
changes. If immediate post-commit confirmation fails, do not amend, reset, rebase, or otherwise
rewrite history: record the discrepancy, release the verified-owned lock, mark the item failed,
and stop delivery for reconciliation.
