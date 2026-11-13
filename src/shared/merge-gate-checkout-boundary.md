## Merge-gate checkout boundary

This fragment carries the merge-gate-local half of the checkout provisioning boundary: which parts
of the delivery and worktree integration fragment stay off in this workflow, and how the one
checkout it does provision is closed again. It loads at the same moment as `worktree-integration`,
because both are meaningful only once Phase 2 step 1 has to provision a checkout. What decides that
moment stays in `{{SKILL:merge-gate}}`'s always-loaded core – the narrow use the fragment is loaded
for, the reason the verified execution location is not what the pointer brings, and the instruction
to provision the checkout from the pull request's existing head branch – so the trigger is
decidable without reading anything below. `{{SKILL:merge-gate}}` is this fragment's only consumer.

Everything else in that fragment stays off:

- no new branch name; the head branch is the pull request's existing branch;
- no plan-file status switch and no archiving, and no deferred pointer to `plan-archival` – this
  workflow holds no plan file;
- no completion action (`pr`, `merge`, `branch`) and no `{{SKILL:pr}}` call – the pull request
  already exists, and Phase 5 merges it on the forge instead;
- no "PR review publication" and no lazily loaded `pr-review-integration`. Its trigger condition –
  a workflow holding a pull request – matches this tool by accident. This workflow produces no
  findings of its own and never publishes under the outbound `<!-- effective-flow-pr-review -->`
  marker.

**The checkout's lifecycle is closed by this workflow.** A `fork` or `missing-branch` proof of Phase
2 step 1 provisions nothing: it creates no worktree and no worktree lifecycle record. Prefer the
invocation checkout when it already has the head branch checked out and clean: work in place, create
no worktree, and create no lifecycle record; it runs steps 1, 5 and 7 of the sequence below without
a record, and a failed `--ff-only` there is the local-divergence end. On the local-divergence end
of Phase 2 step 1, a reused in-place checkout has no record to close. When
`git worktree list --porcelain` shows the head branch checked out in any other state – a dirty
invocation checkout or another linked worktree – stop before provisioning: create no worktree and no
record, use no `--force` or detached workaround, merge nothing, and report which checkout holds the
branch and that it must be cleaned or released first. Git refuses to attach a branch that is already
checked out elsewhere without `--force`, which this workflow never uses.

Otherwise create one Effective Flow-owned worktree with the fragment's receipt and its lifecycle
record: purpose `merge-gate`, path `<worktree.baseDir>/<REPO_NAME>/<SESSION_ID>-merge-gate`,
`branchPolicy: retain`, the head branch as its branch, and a receipt `setupStatus` of `pending`,
`complete`, `skipped` or `externally managed`. Provision it in exactly this sequence; the fragment's
receipt is issued after step 2, and setup, if any, runs after step 7:

1. With `<head>` validated as in "Before provisioning", run
   `git fetch --no-write-fetch-head origin +refs/heads/<head>:refs/remotes/origin/<head>` from
   `RUNTIME_STATE_ROOT`. If the fetch fails, provision nothing and write no record; record a failed
   provisioning fetch, with its reason, like an undetermined existence check, and end the round
   under "A round runs forward only".
2. If `refs/heads/<head>` exists, run `git worktree add <path> <head>`; otherwise create the branch
   explicitly from the fetched ref with
   `git worktree add --track -b <head> <path> refs/remotes/origin/<head>`. Never create a new branch
   name, and never use `--force`, `--detach` or Git's implicit tracking guess.
3. Read `creationOid` as the branch tip in the new worktree.
4. Run `worktree record-init`.
5. Run `git merge --ff-only refs/remotes/origin/<head>` in the worktree.
6. If that fast-forward fails, the local head branch has diverged from `origin`: withdraw the record
   with the one `worktree remove` call and the denial fallback of its outcome table, merge, commit
   and push nothing, write no base-merge-unavailable record, and end the run per the
   local-divergence end of Phase 2 step 1.
7. After a successful fast-forward, run the head-identity check against `headSha`; its mismatch rule
   applies unchanged.

Close that record in the same run: after the push of Phase 2 step 1 is confirmed, withdraw it with
one `worktree remove` call, with the denial fallback of its outcome table; after a no-op merge or a
head-identity mismatch, which commit and push nothing, withdraw it with the same one
`worktree remove` call and the same fallback; on a controlled stop before the push – including a
conflict this run may not or cannot resolve – end the in-progress merge with `git merge --abort` so
the checkout is left clean, then call `worktree transition` to `aborted`; on an error, to `failed`.
`aborted` and `failed` retain the worktree and the branch for inspection; only `{{SKILL:cleanup}}`
releases such a record later, after confirmation and its no-unpushed-commits proof. Never end a run
leaving an `active` record behind – `{{SKILL:cleanup}}` will correctly refuse to remove it.
