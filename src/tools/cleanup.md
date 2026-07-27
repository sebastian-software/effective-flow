---
description: "Migrates and cleans up legacy runtime remnants and inventories every linked Git worktree in the current project. After dry-run and explicit confirmation, it may remove only clean, registered, unlocked Effective Flow-created worktrees whose receipt and persisted lifecycle prove cleanup readiness; it never forces removal, prunes worktrees, or force-deletes branches. Every run ends with an individual reason and safe next step for each remaining linked worktree. Migration cleanup remains git-aware, confirmation-gated, idempotent, and without backup or auto-commit."
catalogHint: "Cleans migration remnants and safely reports or removes verified Effective Flow worktrees."
---

# Effective Flow Cleanup

You clean up the legacy remnants that Effective Flow's migrations deliberately leave behind and
inspect the Git worktrees linked to the current repository. All migrations are
**non-destructive** and explicitly defer actual deletion to the user (see
`effective-flow-dir-migration.md`: "Effective Flow leaves the cleanup to the user";
`{{SKILL:setup}}`: the untracked old `config.json` is "left on disk"). This skill is the
sanctioned, user-driven path for migration finalization and the only later workflow that may
remove a worktree through a verified Effective Flow lifecycle record.

## Goal

- capture all outdated migration artifacts in the current project (discovery)
- when a legacy runtime directory exists and the completion marker is missing, automatically run
  the shared non-destructive runtime-directory migration after the initial inventory
- check them against their new counterpart and determine whether anything still needs to be carried over (carry-over)
- have the user confirm every carry-over candidate and carry over what is confirmed
- then delete the old data **git-aware** and only after explicit confirmation (dry run first)
- never delete before the new counterpart exists and the carry-over is complete or deliberately discarded
- inventory outdated `.gitignore` entries but leave them untouched and route their repair to `{{SKILL:setup}}`
- inventory every linked worktree from Git's machine-readable output and match it to verified
  execution-location and lifecycle evidence
- after a separate dry-run and confirmation, remove only independently proven cleanup-ready
  Effective Flow-owned worktrees with ordinary Git operations
- finish every run with an individual retention reason and safe next step for every linked
  worktree other than the main worktree
- do not create a commit and do not create a backup directory
- be idempotent; a true no-op has neither a migration action nor a removable worktree, but still
  prints the mandatory worktree report

```include
language-rules
```

```include
task-tracking
```

```lazy-include
runtime-state-safety
when: worktree lifecycle state will be read or mutated, or any confirmed legacy copy or removal, runtime migration, memory, or tracker-marker mutation is imminent
```

```include
worktree-lifecycle
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

This tool deliberately carries **no** deferred `tracker-target` pointer, unlike every other source
that embeds the fragment above. It resolves the tracker target only to decide whether its
`firmo-` label class runs at all, performs no tracker write of any kind, and skips that class
entirely on an external target. Loading the external contract would therefore be pure context
cost. Any tracker write added here must load the contract first.

## Project conventions

If the project has an `AGENTS.md`, read it before cleaning up and follow its guidance on file formats, configuration, and project-wide conventions.

## Hard scope boundary

- **Only the current project.** This skill does **not** touch any global skill installation (e.g. `~/.claude/skills/effective-flow` or `~/.claude/skills/firmo`, `firmo-*`/`effective-flow-*` agents). Removing old installed skills/agents is done by the deploy scripts, not this tool.
- **Never delete the new.** The active runtime directory `.effective-flow/` itself, its current
  runtime state, and the project setup ADR are never deleted. The recognized legacy
  `config.json` exception remains governed by the legacy classes below. The only current
  runtime-state deletion allowed is the exact lifecycle record owned by a successfully
  reconciled cleanup claim; no other active runtime file is a cleanup target.
- **Never target the main or current execution worktree.** `RUNTIME_STATE_ROOT` and the worktree
  from which cleanup is running are never removal candidates. A linked current execution
  worktree still appears in the final retained-worktree report.
- **No auto-commit.** The skill at most stages `git rm` changes and removes untracked files physically; it does not commit. Committing is done by the user or `{{SKILL:commit}}`.
- **No backup.** For artifacts that are not git-recoverable, no backup directory is deliberately created; the safety net is the explicit confirmation.
- **Do not write config.** This skill does not itself write carried-over config values into the project setup ADR — `{{SKILL:setup}}` is responsible for that (see Phase 3).
- **Do not edit `.gitignore`.** Inventory and report outdated entries, then route normalization
  to `{{SKILL:setup}}`, the sole repair owner.
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

Linked worktrees are a separate cleanup class, not a fifth migration remnant. Existing
worktrees are never treated as legacy merely because they predate lifecycle recording.

## Workflow

### Phase 1: Discovery / inventory

1. If this is a Git repository, issue and verify an execution-location receipt for the cleanup
   checkout and retain the verified main checkout as `RUNTIME_STATE_ROOT`. Inventory worktrees
   with `git worktree list --porcelain -z`, parsing NUL-delimited fields and records rather than
   human-formatted lines. The first record is the main worktree: validate it as the runtime root,
   exclude it as a removal target, and omit it only from the final retained-linked-worktree list.
   If Git or worktree support is unavailable, skip worktree removal, report the reason, and
   continue the migration inventory where possible.
2. Before reading lifecycle state, load and apply the runtime-root portion of “Runtime-state
   write safety”. Read schema-valid records only from the canonical absolute
   `<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/` handle. Match records to Git entries by
   canonical repository identity, path, checkout identity, and receipt owner/purpose. Treat the
   immutable `creationOid` as branch-history evidence: it must resolve as a commit and remain an
   ancestor of the current recorded branch tip, not equal current `HEAD`; path shape and branch
   prefix are never sufficient.
3. Classify every linked worktree other than the main worktree into exactly one preliminary
   result:
   - **removal candidate** only when every shared lifecycle eligibility proof passes and status
     is `cleanup-ready` or `cleanup-failed`;
   - **retained** with the first concrete failed proof, including current cleanup execution,
     `active`, `aborted`, `failed`, `cleanup-in-progress`, dirty, locked, prunable, missing,
     mismatched, foreign/harness-managed, unknown or invalid schema, or recordless state;
   - **not reliably checkable** when repository, path, runtime-state, or receipt evidence cannot
     be read safely; this is retained, never silently skipped.
4. Capture the existing legacy remnants in the project root:
   - **Runtime directories:** do `.firmo/` and/or `.sf-plugin/` exist?
   - **Legacy `config.json`:** does `.firmo/config.json`, `.sf-plugin/config.json`, or a `config.json` recognizable as outdated in `.effective-flow/` (transitional fallback whose values belong in the ADR) exist?
   - **`.gitignore`:** does it contain outdated lines for `.firmo/`/`.sf-plugin/` or the old two-line pattern?
   - **`firmo-` labels:** forge history, and therefore only on the forge target with an authenticated CLI (see "Remote helper contract" in `issue-tracker.md`) — list issues with `firmo-` labels separately per prefix. If the forge target, a Git repository, `origin`, or an authenticated CLI is missing, skip this class and report that briefly. On an external target this class is skipped entirely and reported as skipped: `firmo-` recognition and the one-time `sf-` migration are never run, emulated, or recorded against an external tool. Because that skip needs no tracker access, this tool requires no external-target contract.
5. If at least one legacy runtime directory exists, read
   `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` without mutation and inspect
   `runtimeMigration.directory.version`. When the valid version `1` marker is missing, treat the
   discovered legacy directory as the authorization for cleanup's first runtime write:
   - freshly revalidate the execution-location receipt and `RUNTIME_STATE_ROOT`, then apply
     “Runtime-state write safety” from that root;
   - invoke the loaded shared runtime-directory migration prerequisite exactly as written,
     without a separate carry-over confirmation and without reimplementing its inventory, copy,
     memory-merge, locking, or marker logic;
   - if any guard, source inventory, copy, memory validation, lock, or marker write fails, keep
     every legacy directory, do not offer any runtime directory for deletion, report the exact
     failure and safe retry through `{{SKILL:cleanup}}` (or the required ignore/index repair
     through `{{SKILL:setup}}`), and continue only independent inventory/reporting;
   - after success, repeat the legacy-runtime, counterpart, legacy-config, and nested-worktree
     inventory from fresh filesystem and Git evidence before making any carry-over or deletion
     decision.
     Do not invoke the prerequisite when no legacy runtime directory exists: such a cleanup run
     creates no runtime footprint merely to record a marker.
6. Treat the migration marker as proof only for the source selected by the shared precedence
   rule (`.firmo/`, otherwise `.sf-plugin/`). If `.firmo/` and `.sf-plugin/` both exist, inventory
   the unselected `.sf-plugin/` separately; the marker does not certify its carry-over and never
   releases it for deletion.
7. For each existing legacy remnant, determine whether its **new counterpart** exists (`.effective-flow/`, project setup ADR, or `effective-flow-` labels).
8. Give the user a compact inventory (class → artifacts found → whether a new counterpart exists)
   plus worktree counts by removal candidate, retained, and not reliably checkable. Do not end
   merely because no migration remnant exists; worktree preview and the final report still run.

### Phase 2: Carry-over check (read + compare)

Read the legacy remnants and determine whether anything still needs to be carried over before deleting:

- **Runtime directories:** For the source selected by the shared migration, verify the freshly
  written marker and compare any divergent or newer entries that the no-clobber migration
  deliberately left in place. If both legacy directories exist, compare the unselected
  `.sf-plugin/` independently against `.effective-flow/`; missing or divergent entries remain
  explicit carry-over/discard decisions because the selected source's marker proves nothing
  about them. Never treat legacy `.worktrees/` as a file carry-over candidate.
- **Legacy `config.json`:** Parse it. If it is not valid JSON, it is **not** a carry-over source: report the path and error and treat the file only as a deletion candidate (after confirmation). For valid JSON, compare each set value with the project setup ADR; values not represented there are carry-over candidates.
- **`.gitignore`/labels:** no file carry-over. For labels, the add-before-remove step in Phase 5 applies.

### Phase 3: Confirm and perform carry-over

The shared prerequisite has already carried over missing entries from its selected source
non-destructively. Present only the remaining divergent entries and any entries from an
unselected simultaneous legacy directory to the user, grouped by source, and obtain a decision
per group. Carry over only explicitly confirmed candidates.

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

- **Runtime files:** If a copy needs a missing directory below `.effective-flow/`, apply
  “Runtime-state write safety” to that exact directory immediately before its `mkdir`; repeat
  this for every missing parent created. Immediately before each confirmed copy, apply the guard
  again to the concrete file target. Copy only after it passes (do not move); do **not** overwrite
  a file already present in the target. A block preserves both source and target and directs the
  user to `{{SKILL:setup}}`. Rejected items remain deletion candidates.
- **Config values:** Do **not** write differing values into the ADR yourself. Disclose them and refer to `{{SKILL:setup}}` for the carry-over. Output the affected keys concretely so the user can confirm them in `{{SKILL:setup}}`. Only once the values are in the ADR or the user explicitly discards them is the legacy `config.json` considered free of carry-over and thus deletable.
- **Labels:** no file carry-over; the carry-over happens in Phase 5 as add-`effective-flow-`-before-remove-`firmo-`.

### Phase 4: Dry-run preview

Before any deletion, list exactly what will be removed — **without** deleting yet:

1. Per artifact: path or label and the class.
2. Per file/directory, the Git status: **tracked**, **untracked**, or **gitignored**. Tracked ones are recoverable via the Git history; untracked/gitignored artifacts (`.effective-flow/`, `.firmo/`, `.sf-plugin/` are gitignored) are **not** recoverable via Git.
3. Warn on a dirty working tree and recommend committing/stashing first, so that a `git rm` staging is clean.
4. For each legacy runtime directory, demonstrate from the refreshed inventory that its new
   counterpart exists and its own carry-over is complete or deliberately discarded. A valid
   marker may certify only the preferred source selected by the shared migration. If migration
   failed, the counterpart or marker is missing, or the directory was the unselected simultaneous
   source, do **not** offer it for deletion; report the concrete missing proof and the safe retry
   through `{{SKILL:cleanup}}` or repair through `{{SKILL:setup}}`.
5. **Couple nested classes:** A legacy `config.json` lies physically **inside** a runtime directory (e.g. `.firmo/config.json` in `.firmo/`). Do **not** offer the containing runtime directory (class "Runtime directories") for deletion while the contained legacy `config.json` (class "Legacy `config.json`") still has open carry-over — otherwise deleting the directory would take the not-yet-carried-over `config.json` with it. Only once its values are in the ADR or explicitly discarded is the containing directory also considered deletable.
6. **Couple legacy worktrees:** Before offering a legacy runtime directory for deletion, compare
   its canonical `<legacy-directory>/.worktrees/` tree with the fresh complete Git worktree
   inventory. If any registered linked worktree is current, active, retained, not reliably
   checkable, or otherwise still rooted below that tree, keep the containing legacy runtime
   directory. Worktree removal remains exclusively governed by the lifecycle
   claim/remove/reconcile protocol; deleting the containing directory is never a substitute.
7. Show verified worktree candidates as their own artifact class. For each candidate list path,
   checkout identity, lifecycle status, owner workflow/purpose, branch policy, and the successful
   receipt, registration, unlocked/non-prunable, clean-state, and non-current-worktree proofs.
   State that eligibility will be checked again under an exclusive record lock immediately
   before removal.
8. List preliminary retained and not-reliably-checkable worktrees separately with their concrete
   reason. They are not offered for confirmation. In particular, never offer the main worktree,
   current cleanup execution worktree, a worktree with `active`, `aborted`, `failed`, or
   `cleanup-in-progress` status, or a worktree without a valid matching lifecycle record.
9. Explain that worktree removal uses only `git worktree remove <path>` without force. For
   `apply-review` records, a proven integrated temporary branch may subsequently use
   `git branch -d`; delivery and partial-diff branches remain. Cleanup never runs
   `git worktree prune` or `git branch -D`.
10. If there are no deletable migration artifacts and no worktree removal candidates, call the
    action set a no-op, but continue to Phase 6 so the mandatory retained-worktree report is
    still produced.

### Phase 5: Confirm deletion and execute git-aware

Obtain confirmation **per artifact class** and only then execute the deletion.

```ask
when: there is at least one deletable legacy remnant
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

```ask
when: there is at least one verified worktree removal candidate
header: Worktrees
question: Remove the verified Effective Flow worktrees listed in the dry run now, after checking every proof again under its lifecycle lock?
options:
  - label: Remove all verified
    description: Revalidate and remove every still-eligible listed worktree with ordinary git worktree remove
  - label: Select individually
    description: Choose which listed worktrees may be revalidated and removed
  - label: Keep all
    description: Remove no worktree; list every one in the final retained-worktree report
```

Execute per class:

- **Tracked files:** remove via `git rm` (staged, **no** commit). For untracked/gitignored, `git rm` does not apply.
- **Untracked/gitignored directories** (`.firmo/`, `.sf-plugin/`, a gitignored legacy
  `config.json`): immediately before removal, refresh the migration/carry-over evidence and Git
  worktree inventory. Remove physically only when no registered linked worktree remains below
  the directory's `.worktrees/` tree and only after the explicit “irreversible” confirmation
  above, without a backup.
- **`.gitignore`:** leave every line untouched. Report the exact outdated entries and route the
  user to `{{SKILL:setup}}`, the sole owner of normalization and repair.
- **`firmo-` labels:** only on the forge target with a successful helper probe; skipped on an external target. Build the full normalized label transitions through the remote helper: first add `effective-flow-<x>` on the issue, **then** detach `firmo-<x>` (add-new before remove-old, so an abort leaves no issue unclassified). The label **definition** in the tracker remains. Inspect the dry-run steps before applying; if a step fails, report the completed steps and preserve the still-classified issue.

For each explicitly selected worktree candidate, independently execute the shared lifecycle
claim/remove/reconcile protocol:

1. Revalidate the cleanup execution receipt and `RUNTIME_STATE_ROOT`, apply runtime-state safety
   to the exact lock and record handles, and atomically acquire the per-record lock. If the lock
   exists, retain the worktree and report its readable owner/timestamp; never break it.
2. Under the lock, freshly reread the record, receipt, `git worktree list --porcelain -z`, exact
   branch, common directory, `locked`/`prunable` attributes, path, clean status including
   untracked files and submodules, and main/current-worktree exclusions. Require `creationOid` to
   resolve as a commit and run
   `git merge-base --is-ancestor <CREATION_OID> <CURRENT_BRANCH_TIP>`: only exit `0` passes; exit
   `1`, every other code, and command errors block. Current `HEAD` and Git registration must still
   name the recorded branch, but later commits are valid and no moving remote tip is compared.
   Drift makes this candidate retained without affecting another candidate.
3. Only from `cleanup-ready` or `cleanup-failed`, atomically write `cleanup-in-progress` with this
   cleanup run's unique ID and claim timestamp. Keep the lock through the Git operation and
   reconciliation.
4. Run exactly `git worktree remove <WORKTREE_PATH>`. On refusal, persist `cleanup-failed` with
   the exact error, clear this run's claim fields, release only its own lock, and continue with
   independently valid candidates.
5. After success, prove that the worktree registration and path are gone and reread the claimed
   record. Preserve `retain` branches. For `delete-after-integration`, reconfirm the recorded
   integration proof and use only `git branch -d <BRANCH_NAME>`; if safe deletion is refused,
   retain the branch and lifecycle record and report partial cleanup.
6. Delete only this run's lifecycle record after every required postcondition is proven, then
   release only its own lock. A failure after worktree removal is partial cleanup, not success.
   Never reconstruct the worktree or take over a foreign/orphaned claim to complete it.

If the claimed worktree is already removed or no longer registered before record or branch
post-processing finishes, reconcile only while this run still owns the matching lock and claim.
Otherwise retain the lifecycle evidence and report manual reconciliation.

On a migration-cleanup error (e.g. `git rm` fails or the tracker is unreachable), abort that
dependent migration sequence in a controlled manner: report the partial state and delete nothing
whose new counterpart is not secured. A worktree error affects only that independently claimed
candidate and is reported as retained, failed, or partial cleanup.

### Phase 6: Completion

The completion report is mandatory even when no migration remnant or worktree candidate exists.
For a linked current execution checkout, use the explicit reason “Cleanup is running in this
worktree.”

Report to the user:

- what was carried over (files to `.effective-flow/`) and which config values were referred to `{{SKILL:setup}}`
- what was deleted, separated into tracked (via `git rm`, staged) and physically removed
- which outdated `.gitignore` lines remain and that `{{SKILL:setup}}` owns their repair
- which `firmo-` labels were detached from how many issues (or that the label class was skipped)
- worktrees removed successfully, with their checkout identities and retained/deleted branch
  outcomes
- failed removal attempts and partial cleanup, including exact record, lock, branch, or command
  state that remains
- every remaining linked worktree other than the main worktree, one entry per worktree, with a
  path relative to the project root when internal (otherwise canonical absolute), checkout
  identity, lifecycle status and verification status, one concrete retention reason, and one
  safe next step
- unmatched lifecycle records whose worktree is absent or mismatched, separately from linked
  worktrees, so interrupted post-removal state remains visible
- an explicit statement when no linked worktrees remain
- what else deliberately remains and why
- that **no** commit was created; refer to `{{SKILL:commit}}` for the staged changes

## Rules

- Never delete without a dry run and explicit confirmation.
- Do not delete any artifact before its new counterpart exists and the carry-over is complete or deliberately discarded.
- Do not delete a runtime directory while it contains a legacy `config.json` with open carry-over; only after carry-over into the ADR or deliberate discard is it deletable.
- Do not delete a runtime directory while a registered current, active, retained, or otherwise
  unresolved linked worktree remains below its `.worktrees/` tree.
- A migration marker certifies only the one source selected by the shared precedence rule; never
  use it as deletion proof for an unselected simultaneous legacy directory.
- Preserve the active `.effective-flow/` directory and all unrelated runtime state. Mutate below
  it only for the explicitly confirmed legacy carry-over/migration operations above or for the
  exact lifecycle record, temporary record, and owned lock handles authorized by the shared
  worktree-lifecycle contract, always through runtime-state safety. Do not mutate the project
  setup ADR or a global skill installation.
- Do not create commits or backup directories.
- Do not write config yourself; config carry-over runs through `{{SKILL:setup}}`.
- Never edit `.gitignore`; inventory and report outdated entries and route repair to
  `{{SKILL:setup}}`.
- For label cleanup, first add `effective-flow-`, then detach `firmo-` from the issue; the label definition remains.
- Never classify a worktree from age, last-modified time, base-directory shape, branch prefix, or
  apparent emptiness. There is no TTL, heartbeat, stale-after threshold, or automatic crash
  inference.
- Never remove a worktree without a valid Effective Flow lifecycle record, dry-run listing,
  explicit confirmation, fresh eligibility proof, per-record lock, and exclusive
  `cleanup-in-progress` claim.
- Use only ordinary `git worktree remove <path>` and, for a proven integrated temporary branch,
  `git branch -d`. Never use `--force`, `git worktree prune`, or `git branch -D`.
- If no legacy remnant is present, continue through worktree inventory and completion reporting.
  A no-op means that neither a migration action nor an eligible confirmed worktree removal ran.
- Output project-internal paths relative to the project root and external worktree paths in
  canonical absolute form.
