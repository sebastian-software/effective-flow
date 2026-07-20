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

## "The clarification gate was not passed"

Before an implementing tool (`build`, `fix`, `refactor`, `docs`, `apply`) actually implements a
plan file, an issue or a review finding, it checks whether the basis is **fully
clarified**. The gate fails in particular when:

- the plan file still contains an "Open Points" section with real entries,
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

## Wrong or unexpected marker language in plan files

The status marker in the header of a plan file (e.g. `**Planungsstatus:** Nicht umgesetzt` or
`**Plan status:** Not implemented`) follows `plan.markerLanguage` from
`.effective-flow/config.json`. If the key is not set there, Effective Flow detects the language from
existing plan files in the `<plan.dir>` directory; if no unambiguous signal is found, the
default is English. Only the marker itself follows this setting – the rest of the plan
content stays written in the language in which the plan was written, independently of it.

To fix the language permanently, set `plan.markerLanguage` explicitly via
[`/effective-flow setup`](./tools-setup.md) (core toggle "Marker") or enter it manually in
`.effective-flow/config.json` (see [Configuration](./configuration.md#block-plan)).

## There is no `.effective-flow/config.json`

This is not an error state. Without a config file, every tool works with the safe defaults
documented in [Configuration](./configuration.md#safe-defaults-at-a-glance) – worktree on,
completion via merge, local tracker, marker language from detection or English. A config is
also **not created automatically** just because a tool runs; it comes into being solely via
[`/effective-flow setup`](./tools-setup.md) or through manual creation. If you want to deviate from
the defaults, `/effective-flow setup` is the easiest way – the express path takes over the safe
defaults after a single confirmation.

## Getting rid of old `.firmo/`/`.sf-plugin/` directories or `firmo-` labels

Effective Flow migrates project-local legacy data (`.firmo/`, `.sf-plugin/`, `firmo-` labels)
**non-destructively**: it copies when needed and reads the old data as a fallback, but never
deletes it on its own. So if legacy directories, an untracked `.firmo/config.json` or
`firmo-` labels remain after a migration, that is **not an error**, but intentional.

For the final cleanup, use [`/effective-flow cleanup`](./tools-setup.md): it first shows
an inventory and a dry-run preview, asks before each deletion, and removes tracked files via
`git rm` (recoverable through the Git history), untracked directories only after explicit
confirmation. It does not commit and does not create a backup – you bring the staged changes
in afterwards with [`/effective-flow commit`](./tools-deliver.md).

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
