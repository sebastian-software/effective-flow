---
description: "Cleans up the legacy remnants that Effective Flow's migrations deliberately leave behind in a target project: old runtime directories `.firmo/`/`.sf-plugin/`, an untracked or legacy `config.json`, outdated `.gitignore` lines, and `firmo-` labels in the remote issue tracker. Reads all outdated artifacts, checks against their new counterpart whether anything still needs to be carried over, has the user confirm every carry-over candidate, and then deletes the old data git-aware and only after explicit confirmation (tracked via `git rm`, untracked/gitignored only after an \"irreversible\" confirmation, no backup, no auto-commit). Is idempotent and a no-op when no legacy remnants are present. Use this skill to conclusively finalize a completed migration and get rid of the old data."
catalogHint: "Cleans up migration remnants (`.firmo/`, old config, `firmo-` labels) after confirmation."
---

# Effective Flow Cleanup

You clean up the legacy remnants that Effective Flow's migrations deliberately leave behind. All migrations are **non-destructive** and explicitly defer the actual deletion to the user (see `effective-flow-dir-migration.md`: "Effective Flow leaves the cleanup to the user"; `{{SKILL:setup}}`: the untracked old `config.json` is "left on disk"). This skill is the sanctioned, user-driven path that handles this finalization — and the **only** place that actually deletes old data.

## Goal

- capture all outdated migration artifacts in the current project (discovery)
- check them against their new counterpart and determine whether anything still needs to be carried over (carry-over)
- have the user confirm every carry-over candidate and carry over what is confirmed
- then delete the old data **git-aware** and only after explicit confirmation (dry run first)
- never delete before the new counterpart exists and the carry-over is complete or deliberately discarded
- do not create a commit and do not create a backup directory
- be a no-op with a clear message when no legacy remnants are present

```include
language-rules
```

```include
task-tracking
```

```include
effective-flow-dir-migration
```

```include
config-migration
```

```include
issue-tracker
```

## Project conventions

If the project has an `AGENTS.md`, read it before cleaning up and follow its guidance on file formats, configuration, and project-wide conventions.

## Hard scope boundary

- **Only the current project.** This skill does **not** touch any global skill installation (e.g. `~/.claude/skills/effective-flow` or `~/.claude/skills/firmo`, `firmo-*`/`effective-flow-*` agents). Removing old installed skills/agents is done by the deploy scripts, not this tool.
- **Never delete the new.** The active runtime directory `.effective-flow/` (except for legacy content within it that is explicitly recognized as outdated, see legacy classes) and the project setup ADR are **never** deleted.
- **No auto-commit.** The skill at most stages `git rm` changes and removes untracked files physically; it does not commit. Committing is done by the user or `{{SKILL:commit}}`.
- **No backup.** For artifacts that are not git-recoverable, no backup directory is deliberately created; the safety net is the explicit confirmation.
- **Do not write config.** This skill does not itself write carried-over config values into the project setup ADR — `{{SKILL:setup}}` is responsible for that (see Phase 3).
- **Delete only with consent.** Every deletion happens only after a dry run and explicit confirmation.

## Legacy classes

The skill knows exactly these four classes of migration remnants, each with its new counterpart:

| Class                       | Legacy remnant                                                                                                                                 | New counterpart                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Runtime directories         | `.firmo/`, `.sf-plugin/` (deliberately left after migration)                                                                                   | `.effective-flow/`                              |
| Legacy `config.json`        | untracked `.firmo/config.json` or a legacy `config.json` in a runtime directory                                                                | project setup ADR (see `{{SKILL:setup}}`)       |
| Legacy `.gitignore` entries | outdated ignore lines for `.firmo/`/`.sf-plugin/` or the old two-line pattern `.effective-flow/*` + `!.effective-flow/config.json`             | the single line `.effective-flow/`              |
| `firmo-` labels             | `firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`-refactor`/`-build`/`-docs`, `firmo-issue-done`, `firmo-needs-planning` on the issue | the `effective-flow-` variant on the same issue |

`sf-` labels are **not** a standalone target: they are already moved to `effective-flow-` by the one-time `sf-` label migration (see "Label convention" in `issue-tracker.md`). This skill only clears up remaining `firmo-` labels.

## Workflow

### Phase 1: Discovery / inventory

1. Capture the existing legacy remnants in the project root:
   - **Runtime directories:** do `.firmo/` and/or `.sf-plugin/` exist?
   - **Legacy `config.json`:** does `.firmo/config.json`, `.sf-plugin/config.json`, or a `config.json` recognizable as outdated in `.effective-flow/` (transitional fallback whose values belong in the ADR) exist?
   - **`.gitignore`:** does it contain outdated lines for `.firmo/`/`.sf-plugin/` or the old two-line pattern?
   - **`firmo-` labels:** only in remote mode with an authenticated CLI (see "Host and CLI detection" in `issue-tracker.md`) — list issues with `firmo-` labels separately per prefix. If remote mode, a Git repository, `origin`, or an authenticated CLI is missing, skip this class and report that briefly.
2. For each existing legacy remnant, determine whether its **new counterpart** exists (`.effective-flow/`, project setup ADR, or `effective-flow-` labels).
3. If no legacy remnants are present, the run is a **no-op**: report that clearly and end.
4. Give the user a compact inventory (class → artifacts found → whether a new counterpart exists).

### Phase 2: Carry-over check (read + compare)

Read the legacy remnants and determine whether anything still needs to be carried over before deleting:

- **Runtime directories:** Compare the content of the legacy directory (preferring `.firmo/` over `.sf-plugin/`) with `.effective-flow/`. Collect files that are present in the legacy directory but **missing** in `.effective-flow/` (or differ in content / are newer) as carry-over candidates. Pure runtime artifacts (`cache.json`, `.worktrees/`) are usually dispensable; name them as such.
- **Legacy `config.json`:** Parse it. If it is not valid JSON, it is **not** a carry-over source: report the path and error and treat the file only as a deletion candidate (after confirmation). For valid JSON, compare each set value with the project setup ADR; values not represented there are carry-over candidates.
- **`.gitignore`/labels:** no file carry-over. For labels, the add-before-remove step in Phase 5 applies.

### Phase 3: Confirm and perform carry-over

Present the carry-over candidates to the user grouped and obtain a decision per group. Carry over only explicitly confirmed candidates.

```ask
when: there are runtime file candidates that are missing in `.effective-flow/` or differ
header: Carry over
question: Which files from the old runtime directory should be carried over to `.effective-flow/` before it is deleted?
options:
  - label: Carry over all
    description: Copy every listed file to .effective-flow/ (do not overwrite existing files in the target)
  - label: Select individually
    description: Decide per file which is carried over and which is discarded
  - label: Carry over nothing
    description: Carry over no file — the entire old content is released for deletion
```

- **Runtime files:** Copy confirmed items to `.effective-flow/` (do not move); do **not** overwrite a file already present in the target. Rejected items remain deletion candidates.
- **Config values:** Do **not** write differing values into the ADR yourself. Disclose them and refer to `{{SKILL:setup}}` for the carry-over. Output the affected keys concretely so the user can confirm them in `{{SKILL:setup}}`. Only once the values are in the ADR or the user explicitly discards them is the legacy `config.json` considered free of carry-over and thus deletable.
- **Labels:** no file carry-over; the carry-over happens in Phase 5 as add-`effective-flow-`-before-remove-`firmo-`.

### Phase 4: Dry-run preview

Before any deletion, list exactly what will be removed — **without** deleting yet:

1. Per artifact: path or label and the class.
2. Per file/directory, the Git status: **tracked**, **untracked**, or **gitignored**. Tracked ones are recoverable via the Git history; untracked/gitignored artifacts (`.effective-flow/`, `.firmo/`, `.sf-plugin/` are gitignored) are **not** recoverable via Git.
3. Warn on a dirty working tree and recommend committing/stashing first, so that a `git rm` staging is clean.
4. For each legacy remnant, demonstrate that its new counterpart exists and the carry-over is complete or deliberately discarded. If the new counterpart is missing (e.g. `.effective-flow/` does not exist because the migration has not run yet), do **not** offer this remnant for deletion: report that and point out that a normal tool run triggers the migration to `.effective-flow/`.
5. **Couple nested classes:** A legacy `config.json` lies physically **inside** a runtime directory (e.g. `.firmo/config.json` in `.firmo/`). Do **not** offer the containing runtime directory (class "Runtime directories") for deletion while the contained legacy `config.json` (class "Legacy `config.json`") still has open carry-over — otherwise deleting the directory would take the not-yet-carried-over `config.json` with it. Only once its values are in the ADR or explicitly discarded is the containing directory also considered deletable.

### Phase 5: Confirm deletion and execute git-aware

Obtain confirmation **per artifact class** and only then execute the deletion.

```ask
header: Delete
question: Remove the legacy remnants listed above now? Tracked files via `git rm` (recoverable via the history); untracked/gitignored directories are removed physically and irreversibly.
options:
  - label: Yes, remove as listed
    description: Tracked via git rm (staged, no commit); untracked/gitignored deleted physically; firmo labels detached from the issue
  - label: Remove tracked only
    description: Only the git-recoverable, tracked artifacts via git rm; keep untracked directories and labels for now
  - label: Cancel
    description: Delete nothing; the inventory remains
```

Execute per class:

- **Tracked files:** remove via `git rm` (staged, **no** commit). For untracked/gitignored, `git rm` does not apply.
- **Untracked/gitignored directories** (`.firmo/`, `.sf-plugin/`, a gitignored legacy `config.json`): remove physically — only after the explicit "irreversible" confirmation above, without a backup.
- **`.gitignore`:** remove only clearly outdated lines (`.firmo/`, `.sf-plugin/`, old two-line pattern). Ensure that `.effective-flow/` remains ignored; leave foreign lines untouched. The canonical `.gitignore` normalization is the job of `{{SKILL:setup}}`; here only remove the old remnants.
- **`firmo-` labels:** only in remote mode with a CLI. First add `effective-flow-<x>` on the issue, **then** detach `firmo-<x>` from the issue (add-new before remove-old, so an abort leaves no issue unclassified). The label **definition** in the tracker remains — do **not** run `label delete`. Use the tool mapping from `issue-tracker.md` (`--add-label`/`--remove-label`, or `tea issue edit`).

On any error (e.g. `git rm` fails, tracker unreachable), abort in a controlled manner: report the partial state and delete nothing whose new counterpart is not secured.

### Phase 6: Completion

Report to the user:

- what was carried over (files to `.effective-flow/`) and which config values were referred to `{{SKILL:setup}}`
- what was deleted, separated into tracked (via `git rm`, staged) and physically removed
- which `.gitignore` lines were removed
- which `firmo-` labels were detached from how many issues (or that the label class was skipped)
- what deliberately remains and why
- that **no** commit was created; refer to `{{SKILL:commit}}` for the staged changes

## Rules

- Never delete without a dry run and explicit confirmation.
- Do not delete any artifact before its new counterpart exists and the carry-over is complete or deliberately discarded.
- Do not delete a runtime directory while it contains a legacy `config.json` with open carry-over; only after carry-over into the ADR or deliberate discard is it deletable.
- Do not touch `.effective-flow/` (the active directory) or the project setup ADR, nor a global skill installation.
- Do not create commits or backup directories.
- Do not write config yourself; config carry-over runs through `{{SKILL:setup}}`.
- For label cleanup, first add `effective-flow-`, then detach `firmo-` from the issue; the label definition remains.
- If no legacy remnant is present, the run is a no-op.
- Output paths relative to the project root.
