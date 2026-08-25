# Worktree and Delivery

As soon as an Effective Flow tool changes code, tests, or documentation (`build`, `fix`,
`refactor`, `docs`, `maintain`, `apply`), the same question comes up twice: **where** does the
work run, and **how** does the result come back into your target branch? The same delivery boundary
also matters when [`/effective-flow deliver`](./tools-deliver.md#effective-flow-deliver) turns
current-session local changes into a pull request. Two separate, independent configuration blocks
govern the normal implementation path – `worktree` for the execution location and `delivery` for
the delivery branch and its completion. The exact field values are in
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

- the canonical repository identity (Git common directory), absolute execution root, and
  absolute runtime-state root;
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

The two roots deliberately serve different purposes:

- `EXECUTION_ROOT` holds tracked code, tests, documentation, validation output, staging, and
  commits. It changes when Effective Flow enters a delivery or component worktree.
- `RUNTIME_STATE_ROOT` is the repository's verified main checkout. Effective Flow derives it
  from the first record of `git worktree list --porcelain` before resolving a report or creating
  a worktree, and keeps it unchanged for the run.

Local reports, backlinks, `memory.json`, caches, migrations, and other `.effective-flow/` state
use absolute paths below `RUNTIME_STATE_ROOT`. This also applies when a task starts in a linked
or native worktree, so removing an Effective Flow-owned worktree cannot remove its report or
memory. If the main checkout is bare, missing, moved, belongs to another repository, or a
runtime path escapes through a symlink, Effective Flow stops without changing state. Ignore or
tracked-state problems point to `/effective-flow setup`; Effective Flow does not fall back to a
worktree-local runtime directory.

### Persisted worktree lifecycle

Every newly created Effective Flow delivery, partial-diff, or `apply-review` component worktree
gets its own lifecycle record under
`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/`. Effective Flow writes the record only after
the execution-location receipt exists and records the repository and worktree identity, branch,
branch creation commit (OID), workflow and purpose, ownership, timestamps, status, and
branch-cleanup policy.
Reused, user-created, and harness-managed worktrees do not receive Effective Flow ownership this
way.

The recorded `creationOid` is immutable evidence of where Effective Flow created the branch, not
the branch's expected final tip. During cleanup, that commit must still resolve and remain an
ancestor of the current recorded branch tip. Normal committed work therefore advances `HEAD`
without invalidating the record. Rewritten or divergent history, including a branch tip that no
longer descends from `creationOid`, blocks automatic cleanup.

The lifecycle makes later cleanup explicit instead of relying on path or age heuristics:

| Status                | Meaning and cleanup behavior                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `active`              | The owning workflow may still be running or may have been interrupted unexpectedly. Cleanup keeps the worktree.              |
| `cleanup-ready`       | The intended work is safely stored or integrated. Cleanup may remove the worktree if every fresh safety check also passes.   |
| `aborted`             | The workflow stopped deliberately before cleanup eligibility. Cleanup keeps the worktree for inspection or recovery.         |
| `failed`              | The workflow failed before cleanup eligibility. Cleanup keeps the worktree and its contents.                                 |
| `cleanup-in-progress` | One verified actor has claimed the removal attempt. Other workflows and cleanup runs leave the worktree and claim untouched. |
| `cleanup-failed`      | A normal removal attempt did not finish. A later cleanup may retry only after all safety checks pass again.                  |

All status changes use a per-record lock and fresh receipt, Git registration, and lifecycle
checks. Before removing a worktree, the owning actor changes an eligible record to
`cleanup-in-progress` with its run ID and timestamp. A foreign or apparently abandoned lock or
claim is never broken automatically. There is no TTL, heartbeat, or stale-after setting: elapsed
time cannot prove that a workflow has ended safely.

The lifecycle record remains until worktree removal and any permitted branch follow-up are fully
verified. If a crash happens between those steps, a later cleanup reconciles the registration,
path, branch policy, and claim. It removes only its own record when the result is complete;
otherwise it reports partial cleanup and preserves the remaining state.

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

### Delivering local changes from the current session

`/effective-flow deliver` is the standalone bridge from uncommitted local work to a pull request.
It derives a candidate file/state selection from concrete changes made in the current session,
reconciles it with Git, and always asks you to confirm the complete ordered selection. Unstaged and
untracked files can be selected. A partially staged file is shown as two choices – its staged state
and its complete working-tree state. When session evidence is missing, contradictory, or admits
several scopes, the tool asks for clarification; without an exact selection, it aborts before
creating a branch or changing any index, commit, remote, or forge state.

After selection, `deliver` proposes an ordered partition into coherent commits and asks you to
confirm the exact paths, order, and tentative commit effect for every group. It then refreshes the
configured base and creates a fresh `<delivery.branchPrefix>/deliver/<slug>` branch in an
Effective Flow-owned worktree. Only the confirmed states are transferred. The source checkout may
be dirty, detached, on the base branch, or harness-managed; it remains unchanged, including its
index and all non-selected files.

Each group is staged separately in the delivery worktree and committed through the staged-only
`commit` tool. The pull request is opened through the commit-only `pr` tool only after all groups
and the final clean branch have been verified. If a later group fails, the branch and worktree stay
available with earlier commits and the remaining uncommitted groups exactly at that boundary;
nothing is pushed, no pull request is opened, and successful commits are not rewritten.

### In-place only, without worktree

If `worktree.enabled: false` but a delivery action (PR, merge, branch) is still wanted,
Effective Flow creates the delivery branch directly in the main repo instead of in a worktree. If
your current working tree then contains uncommitted changes that should not become part of the
delivery branch, Effective Flow asks, instead of silently staging, stashing, or overwriting them.

### What gets committed and what stays local

Of the Effective Flow artifacts, **only the plan file** is committed – and even that only if the
workflow led one. All other `.effective-flow/` artifacts (`memory.json`, `cache.json`, local
review reports, investigations, the worktrees themselves) remain pure bookkeeping in the main
repo and are never carried into the delivery branch. Report-name collision checks and finding
number reads/writes also inspect only that main-checkout runtime directory.

Implementation workflows preserve any verified commits they created earlier, then inventory only
their known residual output: code, tests, documentation, and the applicable plan state. They stage
only those literal paths and delegate the actual commit to the staged-only `commit` tool. An extra
changed path blocks delivery instead of being swept into the commit. The returned parent, branch,
tree, and remaining state must match before the workflow can continue to PR or merge.

## Completion action (`delivery.completion`)

After the actual work is finished, `delivery.completion` (default `merge`) decides what happens
with the finished delivery branch unless the current invocation contains one unambiguous,
affirmative request for `pr`, `merge`, or `branch`:

| Value    | Behavior                                                                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `merge`  | The branch is merged locally into `delivery.baseBranch` via fast-forward or a merge commit. On a conflict, Effective Flow stops, leaves the branch, and informs you – no automatic conflict resolution. |
| `pr`     | The branch is pushed, [`/effective-flow pr`](./tools-deliver.md) opens a pull request against `delivery.baseBranch`.                                                                                    |
| `branch` | The branch is simply left in the local repo; you decide later yourself about a PR or merge.                                                                                                             |

If `delivery.completion` is not set (`null`), Effective Flow asks again on every run for the
desired action.

An explicit completion request has precedence over the configured value for that run. Effective
Flow records the evidence before delivery setup and reports both values when, for example, an
explicit request for `pr` replaces configured `merge`; it does not modify the project-setup ADR.
Negated requests ("do not open a PR"), hypothetical or descriptive mentions, and a bare mention of
an action are not overrides. Alternatives or simultaneous requests for several actions are
ambiguous: Effective Flow asks you to choose one and aborts before delivery mutation if the choice
remains unresolved.

Invoking `/effective-flow deliver` is itself an affirmative request for `pr`. It always opens a
pull request after successful commits and reports when this replaces a different configured
completion action. It does not use `delivery.completion` as its default.

After successful completion, Effective Flow removes a worktree only when its receipt proves
that this workflow created that exact path and branch for the recorded purpose and a fresh
verification confirms a clean, matching checkout. The delivery branch itself is retained in
the local repo. Dirty, moved, missing, mismatched, user-created, and harness-managed worktrees
stay in place and Effective Flow reports why. A retained Effective Flow-created worktree keeps
its lifecycle record so a later [`/effective-flow cleanup`](./tools-setup.md#effective-flow-cleanup)
can reassess it. Effective Flow never force-removes a worktree.

### Updating existing pull requests

If an already opened pull request needs subsequent changes, they always come as **new
commits** on the same branch – never via `commit --amend`, interactive rebase, squash, or
force-push. If a normal push fails because of diverged remote history, Effective Flow stops and
reports the conflict, instead of overwriting the history.

## Plan file: status change at the delivery point

If the workflow led a plan file, Effective Flow marks it as implemented only right at the
delivery point – that is, just before the PR is opened or the branch is merged – and archives it
under `<plan.dir>/archive/`. This status change is committed along with it and is thus part of the
PR or merge.

What archiving does depends on the state the plan is in: a plan Git already tracks in the delivery
checkout is renamed, a plan the planning run left untracked is written into the archive and added,
and a plan an earlier run already archived is refreshed where it is rather than re-added at top
level. The redundant, still untracked copy left behind in your main checkout is removed once the
archived state is safely in the delivery branch and the copy has not changed in the meantime –
that copy is what would otherwise make a later `git pull` refuse. Details on the plan format are
in [Understanding tools](./tools-understand.md).

## Interplay with `/effective-flow pr`

At effective `pr` completion, the final step delegates to
[`/effective-flow pr`](./tools-deliver.md#effective-flow-pr) with the exact prepared head branch,
base branch, verified head OID, and successful commit-only handoff. `pr` creates no branch and
accepts no working-tree content: it pushes only the verified commit range and handles PR creation
or exact head/base reuse, including host detection for `gh` or `tea` (see
[Remote Tracker](./remote-tracker.md)).

A direct `pr` call requires a clean, attached, non-base checkout whose branch contains at least one
commit against the refreshed base. Staged, unstaged, or untracked content makes the invocation
abort rather than silently excluding it. Use `deliver` when local content still needs selection or
isolation.

## Distinction: the apply-review-specific worktree

`applyReview.worktree.*` (see [Configuration](./configuration.md#block-applyreview)) is a
**separate, independent** mechanism of [`/effective-flow apply`](./tools-implement.md) when
working through review findings: it isolates the **parallel** processing of several findings in
separate worktrees and brings their commits back onto your current branch via cherry-pick – so
it creates **no** delivery branch in the sense of this guide. Both mechanisms can use the same
physical `baseDir`, since they use different session and path segments; do not confuse them
when configuring. Each component and the original integration root have separate receipts, and
each Effective Flow-created component has a separate lifecycle record. A component becomes
`cleanup-ready` only after successful integration and validation. Component cleanup requires
proof that Effective Flow created that exact worktree; an aborted, failed, or ambiguously
integrated component remains available for inspection.

## See also

- [Configuration](./configuration.md) – complete field reference for `delivery` and
  `worktree`
- [Implementation tools](./tools-implement.md) – tools that use this mechanism
- [Delivery tools](./tools-deliver.md) – `/effective-flow deliver`, `commit`, and `pr`
- [Troubleshooting](./troubleshooting.md) – worktree conflicts and uncommitted changes
- [Glossary](./glossary.md) – worktree, delivery, delivery branch
