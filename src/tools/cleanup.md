---
description: "Migrates and cleans up legacy runtime remnants and inventories every linked Git worktree in the current project. After dry-run and explicit confirmation, it may remove only clean, registered, unlocked Effective Flow-created worktrees whose receipt and persisted lifecycle prove cleanup readiness, plus stopped merge-gate worktrees proven to hold no unpushed commits and schema-invalid lifecycle records whose worktree is absent or proven clean with nothing unpushed; it never forces removal, prunes worktrees, or force-deletes branches. Every run ends with an individual reason and safe next step for each remaining linked worktree. Migration cleanup remains git-aware, confirmation-gated, idempotent, and without backup or auto-commit."
catalogHint: "Cleans migration remnants and safely reports or removes verified Effective Flow worktrees, stopped merge-gate ones and schema-invalid records included."
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
- inventory stale diff baselines and discard one only after dry run and confirmation
- inventory every linked worktree from Git's machine-readable output and match it to verified
  execution-location and lifecycle evidence
- after a separate dry-run and confirmation, remove only independently proven cleanup-ready
  Effective Flow-owned worktrees with ordinary Git operations
- finish every run with an individual retention reason and safe next step for every linked
  worktree other than the main worktree
- do not create a commit and do not create a backup directory
- be idempotent; a true no-op has neither a migration action nor a removable worktree, but still
  prints the mandatory worktree report

```lazy-include
language-rules
when: the chat-language rule leaves this run's interactive output language on `language.project`, so the artifact-surface resolver must be read
```

```include
chat-language
```

```include
task-tracking
```

```lazy-include
runtime-state-safety
when: a stale diff baseline will be discarded, or a confirmed carry-over copy or its directory creation, the runtime migration, or a memory or tracker-marker mutation is imminent
```

```lazy-include
next-steps
when: the run reaches its completion report
```

```lazy-include
effective-flow-dir-migration
when: Phase 1 step 6 finds at least one legacy runtime directory and no valid `runtimeMigration.directory.version: 1` marker in `.effective-flow/memory.json`, a remote tracker access is about to perform its first runtime-state mutation (the forge contract's one-time `labelMigration.sf` marker), or any confirmed Phase 3 or Phase 5 mutation below `.effective-flow/` is about to run, even when Phase 1 found no legacy runtime directory (for example a carry-over copy or directory creation, a worktree lifecycle lock, claim, removal, reconcile, record write or deletion, a stale diff-baseline discard, or the confirmed removal of a legacy file such as a transitional `.effective-flow/config.json`)
```

```include
worktree-lifecycle
```

```include
config-migration
```

```include
issue-tracker
```

```lazy-include
issue-tracker-forge
when: the resolved tracker target is the forge and the Phase 1 inventory is about to list issues carrying `firmo-` labels
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
  runtime-state deletions allowed are the lifecycle record of a successfully reconciled
  `cleanup apply` claim and a confirmed stale diff baseline; no other active runtime file is a
  cleanup target.
- **Never target the main or current execution worktree.** `RUNTIME_STATE_ROOT` and the worktree
  from which cleanup is running are never removal candidates. A linked current execution
  worktree still appears in the final retained-worktree report.
- **No auto-commit.** The skill at most stages `git rm` changes and removes untracked files physically; it does not commit. Committing is done by the user or `{{SKILL:commit}}`.
- **No backup.** For artifacts that are not git-recoverable, no backup directory is deliberately created; the safety net is the explicit confirmation.
- **Do not write config.** This skill does not itself write carried-over config values into the project setup ADR — `{{SKILL:setup}}` is responsible for that (see Phase 3).
- **Do not edit `.gitignore`.** Inventory and report outdated entries, then route normalization
  to `{{SKILL:setup}}`, the sole repair owner.
- **Never touch hidden mode's ignore entry.** The `.effective-flow/` line in
  `$(git rev-parse --git-common-dir)/info/exclude` is the active counterpart that hidden mode relies
  on, never a legacy remnant: inventory it and leave it untouched. The local hidden configuration
  `.effective-flow/project-setup.md` is current configuration, not a legacy `config.json`, and the
  hidden-mode processed-thread ledger `.effective-flow/merge-gate/thread-ledger.json` that
  `{{SKILL:iterate}}` keeps is current runtime state, never a leftover.
- **Delete only with consent.** Every deletion happens only after a dry run and explicit confirmation.

## Legacy classes

The skill knows exactly these four classes of migration remnants, each with its new counterpart:

| Class                       | Legacy remnant                                                                                                                                 | New counterpart                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Runtime directories         | `.firmo/`, `.sf-plugin/` (deliberately left after migration)                                                                                   | `.effective-flow/`                              |
| Legacy `config.json`        | untracked `.firmo/config.json` or a legacy `config.json` in a runtime directory                                                                | project setup ADR (see `{{SKILL:setup}}`)       |
| Legacy `.gitignore` entries | outdated ignore lines for `.firmo/`/`.sf-plugin/` or the old two-line pattern `.effective-flow/*` + `!.effective-flow/config.json`             | the single line `.effective-flow/`              |
| `firmo-` labels             | `firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`-refactor`/`-build`/`-docs`, `firmo-issue-done`, `firmo-needs-planning` on the issue | the `effective-flow-` variant on the same issue |

`sf-` labels are **not** a standalone target: they are already moved to `effective-flow-` by the one-time `sf-` label migration (see "Label convention" in `issue-tracker-forge.md`). This skill only clears up remaining `firmo-` labels.

Linked worktrees are a separate cleanup class, not a fifth migration remnant. Existing
worktrees are never treated as legacy merely because they predate lifecycle recording.

Stale diff baselines are another separate class: an aborted `{{SKILL:build}}`, `{{SKILL:fix}}`, or
`{{SKILL:refactor}}` run leaves its `.effective-flow/runs/<RUN_ID>/diff-baseline/` directory
behind, and its diff can hold working-tree secrets. Nothing proves such a directory abandoned:
list each with its run ID (the run's start timestamp), warn that a run still in progress needs its
directory, and never infer staleness from age.

## Workflow

`cleanup plan` and `cleanup apply` are the helper operations of this tool, in the call shape of the
included lifecycle contract. `cwd` is `RUNTIME_STATE_ROOT`, `executionRoot` the cleanup checkout:

```text
node <skill-root>/scripts/effective-flow-state.mjs cleanup plan <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","decisions":<decisions>}'
node <skill-root>/scripts/effective-flow-state.mjs cleanup apply <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","decisions":<decisions>,"items":{"<itemId>":"<itemDigest>"}}'
```

`decisions` holds the carry-over answers: `discardAll` (legacy directory names whose open entries
are discarded), `discard` (single `.firmo/<path>` or `.sf-plugin/<path>` entries), and `config`
(`".effective-flow/config.json"`, `".firmo/config.json"` or `".sf-plugin/config.json"` →
`"complete"` once its values are in the ADR, `"discarded"` when the user drops them). `cleanup plan`
is read-only and returns `items` (actionable, each with `itemId` and `itemDigest`), `blocked` (with
`conditions`, `failures` or, for `invalid-record`, `schemaReason`, and a `blockers` array), and
`unrecorded` registered worktrees; item IDs are `worktree:<RECORD_ID>` (a stopped `merge-gate`
record included), `invalid-record:<RECORD_ID>` (with `schemaReason`, `action` and `evidence`; a
file named by no record ID is blocked as `itemId: null` with `fileNameSha256`), `legacy:.firmo`,
`legacy:.sf-plugin` and `config:.effective-flow/config.json`.

### Phase 1: Discovery / inventory

1. If this is a Git repository, issue and verify an execution-location receipt for the cleanup
   checkout and retain the verified main checkout as `RUNTIME_STATE_ROOT`. If Git or worktree
   support is unavailable, skip worktree removal, report the reason, and continue the migration
   inventory where possible.
2. Call `cleanup plan` without `decisions`; the helper guards the runtime root itself. From
   `git worktree list --porcelain -z` and the records below
   `<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/` it classifies every record by the removal
   eligibility conditions; the main worktree and this cleanup's own execution worktree are
   excluded as removal candidates.
3. Classify every linked worktree other than the main worktree into exactly one preliminary
   result: a **removal candidate** (`worktree:` or `invalid-record:` item), **retained** with its
   first failed condition, status or blocker (a `blocked` record: `active`, `aborted`, `failed`,
   `cleanup-in-progress`, dirty, locked, prunable, missing, mismatched, or an invalid schema with
   its `blockers`), or **recordless** (an `unrecorded` entry: foreign, harness-managed,
   user-managed or created before lifecycle recording). A call that is not `ok` makes the
   worktrees **not reliably checkable**: retained, never silently skipped.
4. **Stale diff baselines:** list every `<RUNTIME_STATE_ROOT>/.effective-flow/runs/*/diff-baseline/`
   directory read-only, without following a symlink.
5. Capture the existing legacy remnants in the project root:
   - **Runtime directories and legacy `config.json`:** the plan's `legacy:` and `config:` items,
     ready or blocked.
   - **`.gitignore`:** does it contain outdated lines for `.firmo/`/`.sf-plugin/` or the old two-line pattern?
   - **`info/exclude`:** read `$(git rev-parse --git-common-dir)/info/exclude` read-only and note
     whether it carries the `.effective-flow/` line. Inventory that line as the **active
     counterpart** of hidden mode, never as a legacy remnant and never as a removal candidate.
   - **`firmo-` labels:** forge history, and therefore only on the forge target with an authenticated CLI (see "Remote helper contract" in `issue-tracker-forge.md`) — list issues with `firmo-` labels separately per prefix. If the forge target, a Git repository, `origin`, or an authenticated CLI is missing, skip this class and report that briefly. On an external target this class is skipped entirely and reported as skipped: `firmo-` recognition and the one-time `sf-` migration are never run, emulated, or recorded against an external tool. Because that skip needs no tracker access, this tool requires no external-target contract.
6. If at least one legacy runtime directory exists, read
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
     inventory by calling `cleanup plan` again before making any carry-over or deletion decision.
     Do not invoke the prerequisite when no legacy runtime directory exists: such a cleanup run
     creates no runtime footprint merely to record a marker.
7. The marker certifies only the source it names. If `.firmo/` and `.sf-plugin/` both exist, the
   plan's inventory lists the unselected `.sf-plugin/` separately: the marker does not certify its
   carry-over and never releases it for deletion (`LEGACY_UNMIGRATED`). An item with
   `legacyMarker: true` comes from a marker written before markers named their source; it is
   certified only by a carry-over with no open entry.
8. For `firmo-` labels, determine whether the `effective-flow-` counterpart exists.
9. Give the user a compact inventory (class → artifacts found → whether a new counterpart exists),
   worktree counts (removal candidate, retained, recordless or not reliably checkable), and stale
   diff baselines by run ID. Never end for lack of migration remnants; worktree preview and the
   final report still run.

### Phase 2: Carry-over check

The plan re-derives carry-over: ordinary files, legacy `.worktrees/` included, require byte-identical
counterparts below `.effective-flow/` or explicit discard; missing/differing files and non-regular entries
stay in `carryOver.open`. Source-named markers allow `memory.json` proof by current canonical
containment (recursive objects, exact arrays/scalars), not marker alone; unpreserved keys/conflicts
and unavailable proof stay open. Legacy `config.json` needs a `config` decision: parse it; invalid
JSON is **not** a carry-over source (report path and error), while values absent from the project
setup ADR are candidates. `.gitignore` and labels have no file carry-over.

### Phase 3: Confirm and perform carry-over

Present the open entries grouped by legacy directory and obtain a decision per group. Before the
Carry over question, tell the user about every item with `legacyMarker: true`: its marker names no
source, so every entry, its `memory.json` included, must be carried or discarded.

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

- **Carry over:** if a copy needs a missing directory below `.effective-flow/`, apply
  “Runtime-state write safety” to that exact directory immediately before its `mkdir`, and to the
  concrete file target immediately before each confirmed copy. Copy (do not move) and never
  overwrite a file already present; a differing file therefore stays open until it is discarded. A
  block preserves source and target and directs the user to `{{SKILL:setup}}`.
- **Discard:** "Carry over nothing" adds the directory to `discardAll`; a file discarded under
  "Select individually" goes to `discard`.
- **Config values:** do **not** write them into the ADR yourself. Name the affected keys and refer
  to `{{SKILL:setup}}`; record `complete` once they are in the ADR, `discarded` when the user drops
  them. Until then the legacy `config.json`, and the runtime directory containing it, stay blocked.
  Reason `live-configuration` (`NOT_ELIGIBLE` on the `config:` item, an open carry-over entry inside
  a legacy directory) means the config locator finds no project setup ADR (steps 0–2), so a legacy
  `config.json` can still be the live configuration (step 3): no decision, `discarded` included,
  unblocks it; the next step is `{{SKILL:setup}}` to create the ADR.
- **Labels:** carried over in Phase 5 as add-`effective-flow-`-before-remove-`firmo-`.

After the copies, call `cleanup plan` with the decisions so far and present every entry still in
`carryOver.open` – a differing file, a non-regular entry, or unpreserved `memory.json` content –
with a discard option. A differing or non-regular entry can only be discarded, never copied; an
entry the user keeps blocks its directory. Then call `cleanup plan` with the final `decisions`;
this plan is the dry run of Phase 4.

### Phase 4: Dry-run preview

Before any deletion, list exactly what will be removed — **without** deleting yet:

1. Per artifact: path or label, class, and `itemId`.
2. Per file or directory, the Git status: **tracked** artifacts (a `LEGACY_TRACKED` item) are
   recoverable via the Git history and go through `git rm`; untracked or gitignored ones are
   **not** recoverable.
3. Warn on a dirty working tree and recommend committing/stashing first, so that a `git rm` staging is clean.
4. Offer a legacy runtime directory only as a `legacy:` item: the plan proves its counterpart and
   marker, its carry-over complete or discarded (a contained legacy `config.json` included), and
   no `.git` below it. A blocked one is not offered; report its failures (`LEGACY_UNMIGRATED`,
   `CARRY_OVER_OPEN` with the open entries, `LEGACY_TRACKED`, `NOT_ELIGIBLE`, `UNSAFE_TARGET`) and
   the safe retry through `{{SKILL:cleanup}}` or repair through `{{SKILL:setup}}`.
5. **Legacy worktrees:** a legacy directory with a nested `.git` or a registered worktree anywhere
   below it is blocked (`NOT_ELIGIBLE`, `nested-git` or `registered-worktree` with its
   `registrations`); deleting the directory is never a substitute for removing a worktree.
6. Show worktree candidates as their own class: path, checkout identity, status, owner
   workflow/purpose, and branch policy. State that eligibility is checked again under an exclusive
   record lock immediately before removal. An `invalid-record:` candidate shows its path,
   `schemaReason`, action and `evidence` instead, never a record field: `absent` deletes only the
   record file, `present-clean` the worktree, then the file.
7. List retained and recordless worktrees separately with their concrete reason. They are not
   offered for confirmation.
8. Explain that worktree removal uses only `git worktree remove <path>` without force. An
   `apply-review` branch is deleted only by `git branch -d`; when Git refuses, cleanup keeps it and
   reports it as `BRANCH_RETAINED`. Delivery, partial-diff and merge-gate branches remain. Cleanup
   never runs `git worktree prune` or `git branch -D`.
9. If there are no deletable migration artifacts, stale diff baselines, or worktree removal candidates, call the
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
question: Remove the verified Effective Flow worktrees listed in the dry run now, stopped merge-gate worktrees with no unpushed commits and schema-invalid records included, after checking every proof again under its lifecycle lock?
options:
  - label: Remove all verified
    description: Revalidate and remove every still-eligible listed worktree with ordinary git worktree remove
  - label: Select individually
    description: Choose which listed worktrees may be revalidated and removed
  - label: Keep all
    description: Remove no worktree; list every one in the final retained-worktree report
```

```ask
when: there is at least one stale diff baseline
header: Baselines
question: Discard the stale diff baselines listed in the dry run now? Removal is physical and irreversible.
options:
  - label: Remove all listed
    description: Discard every listed diff-baseline directory
  - label: Select individually
    description: Choose which listed directories to discard; keep the rest
  - label: Keep all
    description: Discard no diff baseline; each stays for a later cleanup run
```

Execute per class:

- **Tracked files:** remove via `git rm` (staged, **no** commit).
- **Untracked/gitignored legacy items and worktrees:** "Yes, remove as listed" selects every
  `legacy:` and `config:` item of the dry run; "Remove all verified" every `worktree:` and
  `invalid-record:` item, "Select individually" the chosen ones. Send all selected items in **one**
  `cleanup apply` call (at most 64 `worktree:` and `invalid-record:` items; the rest after a fresh
  `cleanup plan`) with the dry run's `decisions` and each item's `itemDigest`; give it an explicit
  Bash timeout of 120000 ms and, in Codex, request sandbox escalation for it up front. The helper
  re-proves every selected item from fresh evidence before it removes anything.
- **Stale diff baselines:** for each confirmed directory, revalidate the receipt and `RUNTIME_STATE_ROOT`, apply runtime-state safety to its exact handle,
  and remove it only through `node <skill-root>/scripts/diff-baseline.mjs discard` with
  `{ "cwd": "<RUNTIME_STATE_ROOT>", "dir": "<its absolute handle>" }` on stdin, as
  `shared/diff-baseline.md`, section "Lifecycle", defines it; keep a refused one.
- **`.gitignore`:** leave every line untouched. Report the exact outdated entries and route the
  user to `{{SKILL:setup}}`, the sole owner of normalization and repair.
- **`firmo-` labels:** only on the forge target with a successful helper probe; skipped on an external target. Build the full normalized label transitions through the remote helper: first add `effective-flow-<x>` on the issue, **then** detach `firmo-<x>` (add-new before remove-old, so an abort leaves no issue unclassified). The label **definition** in the tracker remains. Inspect the dry-run steps before applying; if a step fails, report the completed steps and preserve the still-classified issue.

`cleanup apply` outcomes:

- `PREVIEW_MISMATCH` (`itemId`, `reason`), whole call: a selected item changed since the dry run
  (`digest`), vanished (`unknown-item`) or is no longer actionable (`not-actionable`), which then
  carries its `conditions` and `blockers`, and nothing was written. Call `cleanup plan` again, show
  the new dry run, and ask again.
- `result.items[]`, one per selected item: worktree items follow the lifecycle outcome table, where
  `BRANCH_RETAINED` keeps an `apply-review` branch Git refused to delete. An `invalid-record:` item
  changed by its turn is its own `PREVIEW_MISMATCH`; its `REMOVE_FAILED` keeps the record file. A
  legacy item reports `ok` with `removedEntries`, or its code: `LEGACY_CHANGED`, `UNSAFE_TARGET` and
  `WRITE_FAILED` stop that item with the partial state (`removedEntries`, `stoppedAt`), the plan codes
  of Phase 4 block it, and `DEADLINE_REACHED` or `INTERRUPTED` leave it for a later run. Every other
  item continues. After `git rm` of tracked remnants, rerun cleanup so the untracked rest of a mixed
  legacy directory is planned.
- A denied or refused call, another nonzero exit, an `error` (`INVALID_ROOT`, `INVALID_INPUT`,
  `RUNTIME_STATE_UNSAFE`, `GIT_FAILED`): nothing beyond the reported items changed; report it and
  retain every selected artifact.

On a migration-cleanup error (e.g. `git rm` fails or the tracker is unreachable), abort that
dependent migration sequence in a controlled manner: report the partial state and delete nothing
whose new counterpart is not secured. A worktree error affects only that independently claimed
candidate and is reported as retained, failed, or partial cleanup.

### Phase 6: Completion

The completion report is mandatory even when no migration remnant or worktree candidate exists.

Report to the user:

- what was carried over (files to `.effective-flow/`) and which config values `{{SKILL:setup}}` owns
- what was deleted, separated into tracked (via `git rm`, staged) and physically removed,
  including discarded stale diff baselines
- which outdated `.gitignore` lines remain and that `{{SKILL:setup}}` owns their repair, not this run
- whether the Git common directory's `info/exclude` carries the `.effective-flow/` line, reported as
  hidden mode's active ignore entry that this run left untouched
- which `firmo-` labels were detached from how many issues (or that the label class was skipped)
- worktrees removed successfully, with their checkout identities and branch outcomes, every stopped
  `merge-gate` worktree released after its no-unpushed-commits proof with its kept head branch,
  every retired `invalid-record:` item with its action and kept `evidence.branch` (none for
  `absent`), and every `BRANCH_RETAINED` branch with its unproven commits
- failed removal attempts and partial cleanup, including exact record, lock, branch, or command
  state that remains
- every remaining linked worktree other than the main worktree, one entry per worktree, with a
  path relative to the project root when internal (otherwise canonical absolute), checkout
  identity, lifecycle status and verification status, one concrete retention reason, and one
  safe next step; never collapse several worktrees behind a shared reason
- unmatched lifecycle records whose worktree is absent or mismatched, separately from linked
  worktrees, so interrupted post-removal state remains visible
- an explicit statement when no linked worktrees remain
- what else deliberately remains and why
- that **no** commit was created and which removals are staged

Retention reasons and their safe next steps:

- the current cleanup execution worktree: “Cleanup is running in this worktree.”
- `active`: an Effective Flow run is registered as active and may still be running or may have
  been interrupted unexpectedly; let the named owner finish
- `aborted` or `failed`: the owning run stopped or failed before cleanup readiness; inspect and
  recover its work. For a `partial-diff` record, the next step is `{{SKILL:deliver}}` in its source
  checkout, whose start offers to resume it or release it for cleanup; cleanup then removes it, also
  when its worktree is fully gone. A `merge-gate` record is offered by cleanup itself once its
  proof passes; otherwise resolve its `blockers` and rerun cleanup: `unpushed-commits` – push the
  head branch or drop those commits; `in-progress-operation` – finish or abort that merge,
  cherry-pick, revert or rebase; `proof-unavailable` – a proof Git call failed or timed out
- `cleanup-in-progress` or an existing lock: cleanup is claimed, active, or may have been
  interrupted; include known owner and timestamp and let the owner finish
- dirty: clean the checkout before rerunning cleanup; locked: ask the known owner before unlocking
- prunable, missing, detached, branch/OID-, receipt- or repository-mismatched: name the failed
  condition and reconcile manually
- reused, user-managed, foreign, or `harness-managed`: not Effective Flow-owned; the harness or
  user manages it
- no lifecycle record: ownership cannot be proven; reconcile manually
- an invalid schema: an `invalid-record:` item once its proof passes. Blocked by `dirty`: commit or
  discard; by `unpushed-commits`: push; then rerun cleanup. Any other blocker: reconcile manually
- `cleanup-failed`: include the recorded removal failure; rerun cleanup once it is eligible again
- an orphan record lock (no record, or no owner): report its path; never break it

Cleanup never breaks a lock or upgrades a retained lifecycle status to make it eligible; its one
claim from a retained status is the confirmed cleanup-only claim of an `aborted` or `failed`
`merge-gate` record, with condition 6 waived, after its no-unpushed-commits proof.

Then emit the next-step block per `next-steps` as the last element of the report: the staged-removals
row when this run staged deletions, the configuration row when it only referred config values on. A
report that found neither matches no row and emits nothing.

## Rules

- Never delete without a dry run and explicit confirmation.
- Do not delete any artifact before its new counterpart exists and the carry-over is complete or deliberately discarded.
- Remove untracked legacy remnants, lifecycle records and worktrees only through `cleanup apply`;
  never `rm`, `rmdir` or `unlink` them, or write a record, in prose.
- A migration marker certifies only the source it names; never use it as deletion proof for an
  unselected simultaneous legacy directory.
- Preserve the active `.effective-flow/` directory and all unrelated runtime state. Mutate below
  it only for the explicitly confirmed carry-over copies, migration and `cleanup apply` above, or a
  confirmed stale diff-baseline discard, always through runtime-state safety. Do not mutate the
  project setup ADR or a global skill installation.
- Do not create commits or backup directories.
- Do not write config yourself; config carry-over runs through `{{SKILL:setup}}`.
- Never edit `.gitignore`; inventory and report outdated entries and route repair to
  `{{SKILL:setup}}`.
- Leave the `.effective-flow/` line in `info/exclude` untouched; it is active, not legacy.
- For label cleanup, first add `effective-flow-`, then detach `firmo-` from the issue; the label definition remains.
- Never classify a worktree from age, last-modified time, base-directory shape, branch prefix, or
  apparent emptiness. There is no TTL, heartbeat, stale-after threshold, or automatic crash
  inference.
- Never use `git worktree remove --force`, `git worktree prune`, or `git branch -D`.
- If no legacy remnant is present, continue through worktree inventory and completion reporting.
  A no-op means that neither a migration action nor an eligible confirmed worktree removal ran.
- Output project-internal paths relative to the project root and external worktree paths in
  canonical absolute form.
