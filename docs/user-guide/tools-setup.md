# Tool reference: Setup & info

This group covers project setup, explicit cleanup of migration remnants, and version information.

## `/effective-flow setup`

**Purpose:** Prepares a target project for Effective Flow. It makes `.effective-flow/` a fully
gitignored runtime directory, creates or updates the living project-setup ADR, and writes the
canonical `**Effective Flow project setup:** <path>` marker in `AGENTS.md` or another existing
convention file. The wizard starts from safe defaults and offers two paths: **Express** (adopt
defaults while retaining existing values) or **Guided** (explain and choose each option).

**When to use:** On the first use of Effective Flow in a project, or later, to adjust individual
settings (project and surface languages, worktree, completion action, tracker mode, advanced
review/apply-review values, skill discovery).

**Typical call:** `/effective-flow setup`

**Input/output:** No input is required beyond the wizard answers. The output is the normalized
`.gitignore`, the project-setup ADR (default
`docs/adr/effective-flow-project-setup.md`), and its convention-file marker. When configuration
already exists, the wizard shows current values and changes them only after explicit
confirmation. Unknown ADR rows are preserved.

Express stores `language.project: en` and lets every absent override inherit it. Guided asks for
the project language first, then offers independent `de`/`en` overrides for source prose, user
documentation, technical documentation, local workflow artifacts, Forge prose, and Git/release
prose. Choosing “inherit project language” removes or omits the override and appears in the
before/after confirmation. A new ADR uses the technical-documentation language; setup preserves
the language of an existing ADR during ordinary updates.

**Interplay:** `setup` owns configuration writes and migration. Other tools only resolve and read
the ADR; if they find only a legacy JSON config, they may use it transitionally for that run and
point to `setup`. During migration, setup converts the legacy values to the flat Markdown table,
sets the marker, normalizes `.gitignore` to `.effective-flow/`, and untracks an old tracked config
without deleting its on-disk content. A legacy `plan.markerLanguage` remains a read fallback for
one compatibility generation when neither a valid workflow nor project language exists. Whenever
`language.workflow` is absent, setup may show that the old marker-only choice becomes the language
of the complete workflow artifact, propose the new key, and remove the old row only after
confirmation; an existing new key always wins. The values set here
(`language.*`, `review.*`, `applyReview.*`, `plan.*`, `delivery.*`, `worktree.*`, `tracker.*`,
`skills.*`) drive the other tools; the complete schema is in [Configuration](configuration.md).

`setup` is the only repair path when runtime-state safety blocks a write. It validates the
repaired ignore and index state before writing any migration marker below `.effective-flow/`;
missing Git or a failed validation leaves that marker unwritten.

## `/effective-flow cleanup`

**Purpose:** Clears away the legacy leftovers that Effective Flow's migrations deliberately
leave behind. It captures four classes of leftovers in the current project – legacy runtime
directories `.firmo/`/`.sf-plugin/`, an untracked or legacy `config.json`, outdated
`.gitignore` lines, and `firmo-` labels in the remote issue tracker –, reads them, checks
against their new counterpart whether anything should still be carried over, has each
carry-over candidate confirmed, and then deletes the removable legacy data **git-aware** and
only after explicit confirmation. Outdated `.gitignore` entries are reported but left untouched
for setup to repair.

**When to use:** After Effective Flow has migrated a project from an older version (`.firmo/`,
`.sf-plugin/`, `firmo-` labels) to the current state and you want to finally get rid of the
deliberately retained legacy data. All migrations themselves are non-destructive; `cleanup`
is the only path that truly deletes.

**Typical call:** `/effective-flow cleanup`

**Input/output:** No input beyond the confirmations. The skill first shows an inventory, then
a dry-run preview of the deletion; it removes tracked files via `git rm` (recoverable through
the Git history), and untracked/gitignored directories physically and irreversibly after
explicit confirmation. It creates **no** commit or backup and never changes current ADR values or
a global skill installation. It never edits `.gitignore`. It may copy confirmed runtime files into `.effective-flow/` or
remove a confirmed legacy config from that directory; otherwise the active runtime directory is
preserved. With no leftovers, cleanup is a no-op.

**Interplay:** `cleanup` does not adopt config values from a legacy `config.json` itself – it
points to [`/effective-flow setup`](#effective-flow-setup) for that, the owner of the
project-setup ADR. It likewise inventories outdated `.gitignore` entries but leaves them
untouched; only setup repairs or normalizes `.gitignore`. The staged `git rm` changes are then handled by
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
process, see [Release and Installation](https://github.com/sebastian-software/effective-flow/blob/develop/docs/developer-guide/release-and-installation.md).

## Further reading

- [Configuration](configuration.md) – complete project-setup ADR reference
- [Worktree and Delivery](worktree-and-delivery.md) – effect of `worktree.*`/`delivery.*`
- [Remote Tracker](remote-tracker.md) – effect of `tracker.*`
- [Skill Discovery](skill-discovery.md) – effect of `skills.*`
- [Release and Installation](https://github.com/sebastian-software/effective-flow/blob/develop/docs/developer-guide/release-and-installation.md) – how Effective Flow
  is installed and versioned
