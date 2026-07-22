# Troubleshooting and FAQ

Common questions and error patterns around Effective Flow – sorted by topic. If a message leads you
here, check the matching section first before you retry a run.

## "gh: command not found" or "tea: command not found"

The [remote tracker](./remote-tracker.md) and `/effective-flow pr` require, in remote mode, an
installed and authenticated CLI:

- **GitHub** (host `github.com`): install [`gh`](https://cli.github.com/), then
  `gh auth login` or `gh auth status` to check.
- **Forgejo/Gitea** (any other host): install `tea` and configure it with the respective
  login.

If the CLI is missing or not authenticated, Effective Flow deliberately aborts **clearly** instead of
silently falling back to local mode – so you are never left in the dark about whether a
finding was actually created as an issue. Effective Flow offers a fallback to `local` only
if you explicitly agree to it. Afterwards, check with `git remote get-url origin` whether the
right host is detected; for ambiguous hosts (e.g. GitHub Enterprise),
`tracker.remoteToolOverride` in the [Configuration](./configuration.md#block-tracker) helps.

## Worktree conflicts and uncommitted changes

By default, Effective Flow works in a separate [worktree](./worktree-and-delivery.md) and does not
touch your current checkout in the process. Two situations still lead to a
follow-up question instead of an automatic continuation:

- **Uncommitted changes in the main checkout**, when delivery is to happen without a worktree
  as an exception (`worktree.enabled: false`): Effective Flow never stages, stashes or overwrites
  these changes silently. Commit or stash them manually, or let the implementation run
  regularly in the default worktree.
- **Removing the worktree fails**, because uncommitted remnants still lie within it: the
  worktree then deliberately stays in place, and Effective Flow reports the path. Check the remnants
  manually (`git -C <worktree-path> status`) and commit or discard them before you retry
  `git worktree remove <path>`.

A merge conflict on completion (`delivery.completion: merge`) is likewise never
resolved automatically: Effective Flow stops, leaves the delivery branch in place and informs you, so you
can resolve the conflict deliberately.

## Cleanup keeps a linked worktree

[`/effective-flow cleanup`](./tools-setup.md#effective-flow-cleanup) always reports every remaining
linked worktree except the repository's main worktree. The report gives the checkout identity,
inspection or lifecycle status, the specific reason for retaining it, and a safe next step.
Retention is intentional whenever Effective Flow cannot prove that normal removal is safe.

| Reported state or reason                        | What it means                                                                                     | Safe next step                                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `active`                                        | Work may still be running, or the owning run may have ended unexpectedly, for example in a crash. | Check whether the owning workflow is still running and inspect the worktree before changing anything. Age alone is not evidence that it is finished. |
| `aborted` or `failed`                           | The run stopped before it could mark the worktree safe for cleanup.                               | Inspect `git -C <worktree-path> status`; recover or commit wanted changes, or discard them deliberately outside the automatic cleanup path.          |
| Dirty checkout                                  | Tracked, untracked, or submodule state would make ordinary removal unsafe.                        | Inspect the status and secure or intentionally discard the remaining work. Then run cleanup again.                                                   |
| Locked worktree                                 | Git or another workflow has marked the worktree as unavailable for removal.                       | Identify who owns the lock. Unlock it only after you have verified that no workflow or external process still depends on it.                         |
| `cleanup-in-progress` or lifecycle lock         | Another cleanup actor claimed the record, or a previous attempt stopped after claiming it.        | Inspect the recorded owner and timestamp. Do not break the lock or claim merely because it looks old.                                                |
| Prunable or missing worktree path               | Git registration and the filesystem no longer agree.                                              | Inspect `git worktree list --porcelain` and reconcile the Git metadata manually. Cleanup never runs a broad `git worktree prune`.                    |
| Missing or unknown lifecycle record             | Effective Flow cannot prove ownership or a safe completed run.                                    | Treat the worktree as user-managed. Inspect and resolve it manually; cleanup does not adopt legacy worktrees from a path or branch pattern.          |
| Receipt, branch, commit, or repository mismatch | Current Git state no longer matches the record that created the worktree.                         | Verify the repository and checkout history manually. Preserve the worktree until you understand the mismatch.                                        |
| Harness-managed or user-created                 | Effective Flow does not own cleanup for this checkout.                                            | Use the owning harness or your normal Git workflow to manage it.                                                                                     |
| Cleanup is running in this worktree             | The current execution worktree cannot safely remove itself.                                       | Let cleanup finish, then run it from the main checkout or another safe execution location if this worktree should be reconsidered.                   |

If normal `git worktree remove <path>` fails, the lifecycle remains `cleanup-failed` with the
reported error. Fix the concrete cause and rerun cleanup; it rechecks ownership, the receipt, Git
registration, branch, status, lock, and lifecycle before retrying. If the worktree was removed but
its lifecycle record or temporary component branch remains, the report calls this partial cleanup.
Delivery branches are intentionally retained. A temporary `apply-review` branch is removed only
when integration is proven and ordinary `git branch -d` accepts it.

Cleanup does not use a timeout, heartbeat, or stale-after rule, so it never reclassifies `active`
or `cleanup-in-progress` state based on age. It also never uses `--force`, `git branch -D`, or a
broad prune operation. These limits preserve recoverable work after a crash or interrupted run.

## "The clarification gate was not passed"

Before an implementing tool (`build`, `fix`, `refactor`, `docs`, `apply`) actually implements a
plan file, an issue or a review finding, it checks whether the basis is **fully
clarified**. The gate fails in particular when:

- the plan file still contains an "Open points" section with real entries (the former spelling
  "Open Points" remains readable),
- measurable acceptance criteria are missing or are formulated without a concrete check,
- points marked as assumptions substantially affect the behavior, the scope or the risk of
  the implementation,
- an issue or finding does not describe the desired implementation independently enough to
  work through it without a follow-up question.

This is **not an error**, but a deliberate safeguard against implementation on the basis of
assumptions. In this case, Effective Flow does not abort mid-implementation, but points
back to the clarification:

- a plan file goes to [`/effective-flow plan`](./tools-understand.md) or its deeper review
  (`/effective-flow review <plan file>`),
- an issue or finding goes to [`/effective-flow plan-issue`](./tools-understand.md).

Add the missing information there and then call the implementing tool again.

## Wrong or mixed language in Effective Flow artifacts

A new plan—including its header fields, sections, review, open points, and status marker—uses
`language.workflow` from the [project-setup ADR](./configuration.md#block-language). Local review
and investigation reports use the same setting. Existing artifacts retain their recognizable
language unless you explicitly request a translation, so changing the project configuration does
not rewrite earlier files.

Other surfaces intentionally may differ: remote issues and comments and PR bodies use
`language.forge`; commit descriptions and Conventional-Commit PR titles use `language.git`.
Each missing override inherits `language.project`, which itself defaults to `en`. An invalid
`de`/`en` value is reported and ignored in favor of the next fallback rather than guessed.

Use [`/effective-flow setup`](./tools-setup.md) to inspect and change these values. If only a
legacy `plan.markerLanguage` row exists, Effective Flow can still read it as a temporary workflow
fallback and setup offers a confirmed migration; writers never create the old row. A repository
without language settings may temporarily infer the workflow language from existing plans only
when plan prose and markers are consistently German or English. Mixed or contradictory plans are
not a valid signal. If one existing artifact is itself mixed or unclear, clarify its intended
language before asking Effective Flow to edit it.

## There is no project-setup ADR

This is not an error. Without an ADR or transitional legacy source, every tool uses the safe
defaults in [Configuration](./configuration.md#safe-defaults-at-a-glance): worktree enabled,
completion via merge, local tracker as the safe base, and English as the project language.
Review still asks for local or remote mode on first use when no source pins `tracker.mode`.
Running an ordinary tool never creates configuration or touches Git. To persist different settings, run
[`/effective-flow setup`](./tools-setup.md); its Express path adopts the safe base after one
before/after confirmation.

If a convention-file marker exists but points to a missing ADR, Effective Flow reports the stale
marker and continues through the default-path scan and other fallbacks. Run setup to correct the
marker once you have chosen the intended ADR location.

## Getting rid of old `.firmo/`/`.sf-plugin/` directories or `firmo-` labels

Effective Flow migrates project-local legacy data (`.firmo/`, `.sf-plugin/`, `firmo-` labels)
**non-destructively**: it copies when needed and reads the old data as a fallback, but never
deletes it on its own. So if legacy directories, an untracked `.firmo/config.json` or
`firmo-` labels remain after a migration, that is **not an error**, but intentional.

For the final cleanup, use [`/effective-flow cleanup`](./tools-setup.md): it first shows an
inventory and a dry-run preview, asks before each deletion, removes tracked files via `git rm`
(recoverable through Git history), and removes untracked directories only after explicit
confirmation. The same run also inventories linked worktrees and ends with the mandatory
remaining-worktree report described above. It does not commit and does not create a backup – you
bring the staged changes in afterwards with [`/effective-flow commit`](./tools-deliver.md).

## A workflow cannot resolve a worker

First identify the installation path:

- **DALO:** confirm that the source and skill are selected as shown in
  [Getting started](getting-started.md#preferred-dalo), then run `dalo sync` again.
- **Skills CLI:** repeat the command for your harness from
  [Getting started](getting-started.md#alternative-skills-cli-1519).

For either manager, no native agent sidecars are expected. The installed skill must contain
`workers/effective-flow-*.md`. Effective Flow loads only the selected contract and delegates it
through the harness's built-in general-purpose subagent mechanism. A host without that mechanism
is unsupported for worker-dependent portable workflows; the tool should state this clearly
rather than silently continuing.

## DALO reports an ambiguous `effective-flow` slot

Current releases publish exactly one portable candidate at `effective-flow/SKILL.md`. If an
inspection also shows `claude/effective-flow` or `codex/effective-flow`, the source points at an
older delivery commit or at the release archive instead of the default branch. Refresh the DALO
catalog source with `dalo sync` and verify its commit. Release archives intentionally contain all
three build targets for release maintenance and are not a supported end-user installation source
or manager catalog.

Skills CLI users should likewise select `--skill effective-flow` from the repository/default
branch, not from an extracted archive. Claude Code and Codex receive the same portable files;
only their destination directories differ.

## See also

- [Configuration](./configuration.md) – full field reference
- [Worktree and delivery](./worktree-and-delivery.md)
- [Remote tracker](./remote-tracker.md)
- [Glossary](./glossary.md)
