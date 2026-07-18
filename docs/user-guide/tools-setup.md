# Tool reference: Setup & info

This group covers the one-time setup of a project and one info command.

## `/effective-flow setup`

**Purpose:** Prepares a target project for using Effective Flow: idempotently adds `.effective-flow/`
to `.gitignore` (runtime state such as `memory.json`, `cache.json`, `review/`, or
`.worktrees/` is ignored, while `.effective-flow/config.json` stays **tracked**) and creates
`.effective-flow/config.json` via a guided wizard, or updates it non-destructively.
It always starts from safe defaults and offers two paths: **Express** (adopt defaults or
existing values) or **Guided** (each option explained individually).

**When to use:** On the first use of Effective Flow in a project, or later, to adjust individual
settings (worktree, completion action, marker language, tracker mode, advanced
review/apply-review values, skill discovery).

**Typical call:** `/effective-flow setup`

**Input/output:** No input required beyond the answers to the wizard questions. The output
is the updated `.gitignore` and `.effective-flow/config.json`; when a config already exists,
the wizard shows the currently committed value before each question and changes it only after
explicit confirmation.

**Interplay:** `setup` is the only place where deferred config-migration follow-up questions
are decided; other tools defer unclear migration cases only with a safe default. The values
set here (`review.*`, `applyReview.*`, `plan.*`, `delivery.*`, `worktree.*`, `tracker.*`,
`skills.*`) drive the behavior of all other tools – the full schema reference lives in
[Configuration](configuration.md).

## `/effective-flow cleanup`

**Purpose:** Clears away the legacy leftovers that Effective Flow's migrations deliberately
leave behind. It captures four classes of leftovers in the current project – legacy runtime
directories `.firmo/`/`.sf-plugin/`, an untracked or legacy `config.json`, outdated
`.gitignore` lines, and `firmo-` labels in the remote issue tracker –, reads them, checks
against their new counterpart whether anything should still be carried over, has each
carry-over candidate confirmed, and then deletes the legacy data **git-aware** and only after
explicit confirmation.

**When to use:** After Effective Flow has migrated a project from an older version (`.firmo/`,
`.sf-plugin/`, `firmo-` labels) to the current state and you want to finally get rid of the
deliberately retained legacy data. All migrations themselves are non-destructive; `cleanup`
is the only path that truly deletes.

**Typical call:** `/effective-flow cleanup`

**Input/output:** No input beyond the confirmations. The skill first shows an inventory, then
a dry-run preview of the deletion; it removes tracked files via `git rm` (recoverable through
the Git history), and untracked/gitignored directories physically and irreversibly after
explicit confirmation. It creates **no** commit and no backup, touches neither `.effective-flow/`
nor the project-setup ADR nor a global skill installation, and is a no-op when no leftovers
are present.

**Interplay:** `cleanup` does not adopt config values from a legacy `config.json` itself – it
points to [`/effective-flow setup`](#effective-flow-setup) for that, the owner of the
project-setup ADR. The staged `git rm` changes are then handled by
[`/effective-flow commit`](tools-deliver.md).

## `/effective-flow version`

**Purpose:** Shows the currently installed Effective Flow version including the short Git hash.

**When to use:** To check which Effective Flow version is installed, for example before a bug
report or after an update.

**Typical call:** `/effective-flow version`

**Input/output:** No input. The output is a single-line version string; no files are changed.

**Interplay:** The displayed version comes from `.release-please-manifest.json` and is
maintained via release-please (versions and `CHANGELOG.md` are generated automatically from
Conventional-Commit messages, not manually). For details on the release and installation
process, see [Release and Installation](../developer-guide/release-and-installation.md).

## Further reading

- [Configuration](configuration.md) – complete `.effective-flow/config.json` reference
- [Worktree and Delivery](worktree-and-delivery.md) – effect of `worktree.*`/`delivery.*`
- [Remote Tracker](remote-tracker.md) – effect of `tracker.*`
- [Skill Discovery](skill-discovery.md) – effect of `skills.*`
- [Release and Installation](../developer-guide/release-and-installation.md) – how Effective Flow
  is installed and versioned
