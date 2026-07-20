# Worktree and Delivery

As soon as an Effective Flow tool changes code, tests, or documentation (`build`, `fix`,
`refactor`, `docs`, `maintain`, `apply`), the same question comes up twice: **where** does the
work run, and **how** does the result come back into your target branch? Both are governed by
two separate, independent configuration blocks – `worktree` for the execution location,
`delivery` for the delivery branch and its completion. The exact field values are in
[Configuration](./configuration.md#block-worktree) – this guide explains the interplay.

## Worktree: the execution location

By default (`worktree.enabled: true`) the implementation runs in a Git worktree. When the
session starts in the repository's main checkout, Effective Flow creates a separate worktree
with its own branch. When the session already runs in a linked, user-created, or harness-native
worktree, Effective Flow reuses it and does not create a nested one. The result is:

- The repository's main checkout – including its uncommitted changes – stays untouched when
  execution uses a separate worktree.
- The entire run stays tied to one verified checkout instead of depending on ambient process
  state.

An Effective Flow-owned worktree is created under
`<worktree.baseDir>/<repo-name>/<session-id>` (default base
`.effective-flow/.worktrees`) via `git worktree add` together with the delivery branch. Only
that newly created worktree runs automatic setup according to `worktree.setup`: lockfile-based
dependency installation, no setup (`none`), or a command you specify. A reused worktree is
assumed to have been prepared by its user or harness, so setup is not repeated unless you
explicitly request it or a missing prerequisite requires a decision.

Whoever explicitly wants to work in their current checkout – for example for a quick,
non-delivered trial run – sets `worktree.enabled: false` or requests it explicitly in the task
("without worktree", "directly on the current branch").

### Verified execution-location receipt

Before Effective Flow changes anything, it records and verifies an execution-location receipt:

- the canonical repository identity (Git common directory) and absolute execution root;
- the expected branch, or an explicitly expected detached HEAD and exact commit;
- whether the checkout is in-place, harness-managed, or Effective Flow-created;
- who owns setup and cleanup, and which workflow or component owns the receipt.

Every write-capable phase and delegated worker verifies that receipt before its first write and
after a resume or Handoff. File operations use absolute paths; shell operations use the receipt
root as their per-call working directory or use `git -C <root>`. Effective Flow never relies on
a previous `cd` or on a subagent inheriting a persistent working directory.

If the root, repository, branch, detached commit, or linked-worktree registration differs,
Effective Flow stops before editing, setup, validation that may write caches, staging, commits,
branch changes, or cleanup. It reports the expected and actual location and leaves all
checkouts intact.

### Harness-native worktrees

[Claude Code subagents](https://code.claude.com/docs/en/sub-agents) do not provide a portable
arbitrary-CWD contract, while [Claude Code isolation](https://code.claude.com/docs/en/worktrees)
creates a separate Claude-managed worktree. Effective Flow uses native isolation only for a
self-contained delegation that does not need an already selected Effective Flow root; the two
forms of isolation are never stacked.

[Codex app worktrees and Handoff](https://learn.chatgpt.com/docs/environments/git-worktrees)
remain Codex-managed. Effective Flow reuses such a worktree, revalidates it after Handoff or
resume, and never removes it. A detached Codex worktree is accepted only while its recorded
commit still matches; branch-based delivery first needs a branch created or adopted through
the supported app flow and a new verified receipt.

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

After successful completion, Effective Flow removes a worktree only when its receipt proves
that this workflow created that exact path and branch for the recorded purpose and a fresh
verification confirms a clean, matching checkout. The delivery branch itself is retained in
the local repo. Dirty, moved, missing, mismatched, user-created, and harness-managed worktrees
stay in place and Effective Flow reports why. It never force-removes them.

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
when configuring. Each component and the original integration root have separate receipts, and
component cleanup requires proof that Effective Flow created that component worktree.

## See also

- [Configuration](./configuration.md) – complete field reference for `delivery` and
  `worktree`
- [Implementation tools](./tools-implement.md) – tools that use this mechanism
- [Delivery tools](./tools-deliver.md) – `/effective-flow commit` and `/effective-flow pr`
- [Troubleshooting](./troubleshooting.md) – worktree conflicts and uncommitted changes
- [Glossary](./glossary.md) – worktree, delivery, delivery branch
