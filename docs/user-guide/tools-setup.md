# Tool reference: Setup & info

This group covers project setup, explicit cleanup of migration remnants and finished worktrees,
and version information.

## `/effective-flow setup`

**Purpose:** Prepares a target project for Effective Flow. It makes `.effective-flow/` a fully
gitignored runtime directory, creates or updates the living project-setup ADR, and writes the
canonical `**Effective Flow project setup:** <path>` marker in `AGENTS.md` or another existing
convention file. The wizard starts from safe defaults and offers two paths: **Express** (adopt
defaults while retaining existing values) or **Guided** (explain and choose each option).

**When to use:** On the first use of Effective Flow in a project, or later, to adjust individual
settings (project and surface languages, worktree, completion action, tracker target including an
external tool, advanced review/apply-review values, skill discovery), or to prepare the optional
session-rename check or Claude Code butler described below.

**Typical call:** `/effective-flow setup`

**Input/output:** No input is required beyond the wizard answers. The output is the normalized
`.gitignore`, the project-setup ADR (by default
`docs/adr/effective-flow-project-setup.md`), and its convention-file marker. When configuration
already exists, the wizard shows current values and changes them only after explicit
confirmation. Unknown ADR rows are preserved.

Setup follows an ADR file-naming convention your project has already decided on instead of
imposing its own. Before writing, it looks for a naming rule stated in `AGENTS.md`, `CLAUDE.md`,
or a decision register — `DECISIONS.md` at the repository root or at `docs/DECISIONS.md`, or a
`README.md`/`index.md` directly inside your ADR directory. A rule stated there wins. If nothing
states one, setup looks at how the ADR files directly inside that directory are already named and
uses that only when they all agree; an empty directory says nothing either way. Only if neither
answers does the Effective Flow slug default apply. A project that requires a numeric prefix
therefore gets `docs/adr/0002-effective-flow-project-setup.md`, and the completion report names
the applied convention and the file that established it.

If two or more sources state conventions that do not all agree, setup asks which one to use and
writes nothing until you answer. Answering "Inconclusive" sets all of those declarations aside and
falls back to how your ADR directory is already named, and then to the Effective Flow default. If
the question cannot be put to you at all — you skip it, or the run is not interactive — setup takes
that same "Inconclusive" route rather than jumping to its own default, so a uniformly numbered
directory does not receive a numberless file behind your back. It reports that it could not ask,
naming every source that spoke and what each one said.

Two sources can also agree that ADRs carry a number while stating different widths — `NNN-` in one,
`NNNNN-` in the other. That is not a disagreement about the convention, so setup does not ask; it
falls back to the width your existing files already use, then to four digits, and reports the
divergence.

If your project already has a project-setup ADR, setup updates that file where it lies. It is
never renamed to match the convention and never copied to a second, convention-shaped path; a
divergence between the existing path and the resolved convention is reported once. That also
applies to an ADR setup only finds on its final check just before writing. A symlink at
the intended target path stops the write instead: setup reports the path rather than writing
through it, whether the target is an existing ADR or a new one.

Setup never writes over a file that is already sitting at the name it resolved. If the convention
carries numbers it takes the next one and tries again, and stops on a second clash; with a numberless
convention there is no second name, so it stops and reports the path. This is what protects a
project-setup ADR whose configuration table was deleted or never finished — setup cannot read it as
configuration, but it will not overwrite it either. And if several files in your ADR directory could
each be the project-setup ADR, setup treats that as a question for you rather than as an empty
project: it lists them and asks which one to update, instead of adding one more.

Express writes no `mergeGate.*` row and no `delivery.mergeMethod` row: a missing line means the
merge gate's own default, so an unconfigured project gets `completion: ask`, every check required
green, no automatic reviewer expected — and `conflictResolution: auto`, which authorizes a gate run
to resolve a conflict between an open pull request's head branch and its base and to push the
resulting merge commit. That last one is the only one of those defaults that leads a run to write,
and it is what changes behavior for a project upgrading from an earlier generation; see
[Block `mergeGate`](configuration.md#block-mergegate).

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

After the configuration write, setup offers an optional session-rename capability step. In the
**Codex tab embedded in the ChatGPT Desktop app**, the native current-task capability needs no
installation or configuration. After the user consents to the visible check, setup calls it once
with the fixed title `Effective Flow setup check` and reports the concrete result. It supplies no
task id, performs no task lookup, and does not retry. A successful call proves the path for that
run; an absent, denied, or failed capability means only that this probe failed. Later eligible
Desktop runs still attempt the native operation independently and print one suggested title only
when that individual call is unavailable or fails. Because the app exposes no reliable manual-title
ownership check, a later Desktop run may replace a title the user set manually.

On Claude Code, setup retains the existing one-time path: the user creates a second session titled
`Effective Flow rename butler`, pastes the standing mandate, and lets setup verify it by sending one
message to that session. Codex CLI has no automatic title path in this scope. Choosing **No** skips
only this visible setup check; it does not disable later host-specific title handling. Runs stay
suggestion-only on Claude Code without a configured butler, Codex CLI, and any other host without a
supported title path. The step adds no configuration key, never edits harness configuration, and
creates no title runtime file. See [Getting
started](getting-started.md#keeping-sessions-tellable-apart) for each host's current behavior.

Users who installed the former Codex path must remove only the `Stop` handler whose command invokes
`session-title.mjs apply` from their personal or repository-local Codex configuration. Preserve
unrelated handlers and the containing file. Setup gives this instruction but never opens, edits, or
deletes the configuration. Old title request and receipt files are inert and may remain; setup does
not remove them.

`setup` is the only repair path when runtime-state safety blocks a write. It validates the
repaired ignore and index state before writing any migration marker below `.effective-flow/`;
missing Git or a failed validation leaves that marker unwritten.

When the shared locator selected a transitional JSON config, setup also invokes the shared
runtime-directory migration after successful ignore/index repair and before it writes
`configMigration.adr`. This carries missing runtime state from `.firmo/` (otherwise `.sf-plugin/`)
into `.effective-flow/` without overwriting existing targets. A fresh setup with no selected
legacy config does not run this prerequisite and therefore does not create a runtime footprint.
If the runtime migration fails, setup leaves the config marker unwritten, preserves the selected
source and safely copied partial state, and applies its existing conditional rollback to its own
unchanged ADR/convention writes.

## `/effective-flow cleanup`

**Purpose:** Clears away legacy leftovers that Effective Flow's migrations deliberately leave
behind and checks every linked Git worktree in the current repository. For migrations, it still
handles the same four classes: legacy runtime directories `.firmo/`/`.sf-plugin/`, an untracked
or legacy `config.json`, outdated `.gitignore` lines, and `firmo-` labels in the remote issue
tracker. It reads them, checks their new counterpart for data that still needs to be carried
over, confirms each carry-over candidate, and deletes removable legacy data **git-aware** only
after explicit confirmation. Outdated `.gitignore` entries are reported but left untouched for
setup to repair.

After the initial legacy inventory, cleanup automatically invokes the same shared
runtime-directory migration when `.firmo/` or `.sf-plugin/` exists and the versioned completion
marker is missing. It then refreshes the legacy, counterpart, config, and worktree inventory
before offering any deletion. The migration itself needs no confirmation because it is
non-destructive and target-wins; confirmations remain mandatory for divergent carry-over,
explicit discard, and deletion. A run with no legacy runtime directory creates no marker or
runtime footprint.

If both legacy directories exist, `.firmo/` remains the selected migration source and
`.sf-plugin/` is assessed separately; the selected source's marker never certifies the unselected
directory. Cleanup also retains a legacy runtime directory while any registered current, active,
retained, or otherwise unresolved linked worktree remains below its `.worktrees/` tree. Such a
worktree can be removed only through the normal lifecycle claim protocol, never by deleting its
containing legacy directory.

For worktrees, `cleanup` parses Git's complete linked-worktree inventory and matches it against
the persisted Effective Flow lifecycle under
`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/`. A worktree becomes a removal candidate
only when all independent checks agree: Effective Flow created it, its lifecycle is
`cleanup-ready` or `cleanup-failed`, its execution-location receipt still matches its repository,
path, branch, purpose, and registration, and the checkout is clean, unlocked, and not prunable.
The repository's main worktree and the worktree running `cleanup` are never removal candidates.

**When to use:** After Effective Flow has migrated a project from an older version (`.firmo/`,
`.sf-plugin/`, `firmo-` labels) and you want to remove deliberately retained legacy data, or when
a finished Effective Flow run left a linked worktree behind. Migration itself remains
non-destructive, and a worktree's age alone never makes it safe to remove.

**Typical call:** `/effective-flow cleanup`

**Input/output:** No input beyond the confirmations. The skill first shows an inventory, then a
dry-run preview of each deletion class. It removes tracked legacy files via `git rm` (recoverable
through Git history), removes untracked or gitignored legacy directories physically and
irreversibly after explicit confirmation, and removes an eligible worktree with ordinary
`git worktree remove <path>` only after confirmation. It never uses `--force`, broad
`git worktree prune`, or `git branch -D`. Delivery branches remain in the repository; a temporary
`apply-review` branch may be removed only with `git branch -d` when its lifecycle proves that the
component was integrated safely.

The final report is always produced, even when no migration remnant or removable worktree exists.
It separates removed worktrees from failed removal attempts and lists every remaining linked
worktree except the main worktree. Each entry includes its path, checkout identity, lifecycle or
inspection status, a specific reason for keeping it, and a safe next step. When cleanup runs in a
linked worktree, that current execution worktree is reported as in use by the cleanup run. Active,
aborted, failed, dirty, locked, prunable, harness-managed, mismatched, and lifecycle-less worktrees
stay intact.
An `active` record may represent either work still in progress or a run interrupted by a crash;
there is no timeout or heartbeat that guesses which one it is.

Cleanup creates **no** commit or backup and never changes current ADR values or a global skill
installation. It never edits `.gitignore`. It may copy confirmed runtime files into
`.effective-flow/` or remove a confirmed legacy config from that directory; otherwise it
preserves active runtime state. A true no-op means there are no migration actions and no eligible
worktrees, but the remaining-worktree report still appears.

**Interplay:** `cleanup` does not adopt config values from a legacy `config.json` itself – it
points to [`/effective-flow setup`](#effective-flow-setup) for that, the owner of the
project-setup ADR. It likewise inventories outdated `.gitignore` entries but leaves them
untouched; only setup repairs or normalizes `.gitignore`. It also never adopts an older worktree
that has no lifecycle record, even when its path or branch name looks like Effective Flow. The
staged `git rm` changes are then handled by [`/effective-flow commit`](tools-deliver.md).

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

- [Configuration](configuration.md) – complete project-setup ADR reference
- [Worktree and Delivery](worktree-and-delivery.md) – effect of `worktree.*`/`delivery.*`
- [Remote Tracker](remote-tracker.md) – effect of `tracker.*`
- [Skill Discovery](skill-discovery.md) – effect of `skills.*`
- [Release and Installation](../developer-guide/release-and-installation.md) – how Effective Flow
  is installed and versioned
