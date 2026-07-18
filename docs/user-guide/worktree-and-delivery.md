# Worktree and Delivery

As soon as an Effective Flow tool changes code, tests, or documentation (`build`, `fix`,
`refactor`, `docs`, `maintain`, `apply`), the same question comes up twice: **where** does the
work run, and **how** does the result come back into your target branch? Both are governed by
two separate, independent configuration blocks – `worktree` for the execution location,
`delivery` for the delivery branch and its completion. The exact field values are in
[Configuration](./configuration.md#block-worktree) – this guide explains the interplay.

## Worktree: the execution location

By default (`worktree.enabled: true`) the implementation runs **not** in your current
checkout, but in a separate Git worktree with its own branch. This has two advantages:

- Your current working state – including uncommitted changes – stays untouched.
- The entire work of a run is cleanly bundled on a dedicated branch from the start.

The worktree is created under `<worktree.baseDir>/<repo-name>/<session-id>` (default base
`.effective-flow/.worktrees`) and is set up via `git worktree add` together with the delivery
branch. Then – depending on `worktree.setup` – the appropriate dependency installation runs
there automatically (detected from the lockfile, e.g. `pnpm install --frozen-lockfile` for
`pnpm-lock.yaml`), no setup at all (`none`), or a command you specify.

Whoever explicitly wants to work in their current checkout – for example for a quick,
non-delivered trial run – sets `worktree.enabled: false` or requests it explicitly in the task
("without worktree", "directly on the current branch").

## Delivery: the delivery branch

There is deliberately **no** dedicated `delivery.enabled` switch anymore. Delivery is always
active whenever work happens in the worktree or on a dedicated delivery branch – in the
default case, therefore, always. The delivery branch is named
`<delivery.branchPrefix>/<skill>/<slug>` (e.g. `effective-flow/build/user-login`), derived from
the plan title, task description, issue, or finding; on a name collision Effective Flow appends
a numeric suffix and reports the chosen name.

`delivery.baseBranch` (default `origin/main`) serves as the starting point. If it is a remote
ref, Effective Flow first fetches the current state via `git fetch`, so the delivery branch does
not start out stale.

### In-place only, without worktree

If `worktree.enabled: false` but a delivery action (PR, merge, branch) is still wanted,
Effective Flow creates the delivery branch directly in the main repo instead of in a worktree. If
your current working tree then contains uncommitted changes that should not become part of the
delivery branch, Effective Flow asks, instead of silently staging, stashing, or overwriting them.

### What gets committed and what stays local

Of the Effective Flow artifacts, **only the plan file** is committed – and even that only if the
workflow led one. All other `.effective-flow/` artifacts (`memory.json`, `cache.json`, local
review reports, investigations, the worktrees themselves) remain pure bookkeeping in the main
repo and are never carried into the delivery branch.

## Completion action (`delivery.completion`)

After the actual work is finished, `delivery.completion` (default `merge`) decides what
happens with the finished delivery branch:

| Value    | Behavior                                                                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `merge`  | The branch is merged locally into `delivery.baseBranch` via fast-forward or a merge commit. On a conflict, Effective Flow stops, leaves the branch, and informs you – no automatic conflict resolution. |
| `pr`     | The branch is pushed, [`/effective-flow pr`](./tools-deliver.md) opens a pull request against `delivery.baseBranch`.                                                                                    |
| `branch` | The branch is simply left in the local repo; you decide later yourself about a PR or merge.                                                                                                             |

If `delivery.completion` is not set (`null`), Effective Flow asks again on every run for the
desired action.

If a worktree is involved, Effective Flow removes it automatically after successful completion
(`git worktree remove`); the delivery branch itself is retained in the local repo. If the
removal fails because of uncommitted remnants, the worktree stays in place and Effective Flow
reports the path.

### Updating existing pull requests

If an already opened pull request needs subsequent changes, they always come as **new
commits** on the same branch – never via `commit --amend`, interactive rebase, squash, or
force-push. If a normal push fails because of diverged remote history, Effective Flow stops and
reports the conflict, instead of overwriting the history.

## Plan file: status change at the delivery point

If the workflow led a plan file, Effective Flow marks it as implemented only right at the
delivery point – that is, just before the PR is opened or the branch is merged – and moves it
to `<plan.dir>/archive/`. This status change is committed along with it and is thus part of the
PR or merge. Details on the plan format are in [Understanding tools](./tools-understand.md).

## Interplay with `/effective-flow pr`

At `delivery.completion: pr`, the final step delegates to
[`/effective-flow pr`](./tools-deliver.md) and hands over the delivery and base branch.
`/effective-flow pr` itself knows no dedicated worktree mode – it assumes that the branch
already exists and can be pushed, and only takes care of the PR creation (including host
detection for `gh` or `tea`, see [Remote Tracker](./remote-tracker.md)). If you call
`/effective-flow pr` directly for a manually created branch, the same rules on the base branch
and on not rewriting existing PR commits apply as described above.

## Distinction: the apply-review-specific worktree

`applyReview.worktree.*` (see [Configuration](./configuration.md#block-applyreview)) is a
**separate, independent** mechanism of [`/effective-flow apply`](./tools-implement.md) when
working through review findings: it isolates the **parallel** processing of several findings in
separate worktrees and brings their commits back onto your current branch via cherry-pick – so
it creates **no** delivery branch in the sense of this guide. Both mechanisms can use the same
physical `baseDir`, since they use different session and path segments; do not confuse them
when configuring.

## See also

- [Configuration](./configuration.md) – complete field reference for `delivery` and
  `worktree`
- [Implementation tools](./tools-implement.md) – tools that use this mechanism
- [Delivery tools](./tools-deliver.md) – `/effective-flow commit` and `/effective-flow pr`
- [Troubleshooting](./troubleshooting.md) – worktree conflicts and uncommitted changes
- [Glossary](./glossary.md) – worktree, delivery, delivery branch
