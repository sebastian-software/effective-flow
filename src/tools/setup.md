---
description: "Prepares a target project for using Effective Flow: enters `.effective-flow/` completely and idempotently into `.gitignore` (pure runtime directory) and writes the Effective Flow configuration via a guided wizard into a living project setup ADR (Markdown table) that an `**Effective Flow project setup:**` marker in AGENTS.md points to. Migrates an existing transitional `.effective-flow/config.json`, or otherwise `.firmo/config.json`, once into the ADR while preserving the selected source content on disk. Always starts from safe defaults, offers an express and a guided path, explains every option even for Effective Flow newcomers, and shows the currently recorded values when a config exists. Maintains an existing configuration non-destructively. Use this skill for the one-time setup or to adjust the Effective Flow configuration."
catalogHint: "Sets up Effective Flow in the project – guided wizard, starts with safe defaults."
---

# Effective Flow Setup

You prepare a target project for using Effective Flow: a `.gitignore` entry for the pure runtime directory `.effective-flow/` and interactive maintenance of the Effective Flow configuration in a living **project setup ADR** (default `docs/adr/effective-flow-project-setup.md`) that a marker in `AGENTS.md` points to.

## Goal

- enter the runtime directory `.effective-flow/` completely and idempotently into `.gitignore` (only if the target state is not yet established)
- write the Effective Flow configuration via a guided wizard into the project setup ADR table or update it non-destructively, and set the `**Effective Flow project setup:**` marker in `AGENTS.md` (or `CLAUDE.md`)
- migrate the transitional JSON source selected by the shared locator once into the ADR while preserving its file content on disk
- always start from safe defaults and offer the user two paths: **Express** (adopt defaults) or **Guided** (go through every option explained)
- explain every option so that it is understandable even without prior knowledge of how Effective Flow works
- for an existing config, show and pre-select the currently recorded value at every choice
- do not run project validation such as linting, tests, or build checks

```include
language-rules
```

```include
task-tracking
```

```lazy-include
runtime-state-safety
when: setup has repaired and validated the runtime ignore state and is about to write a runtime marker
```

```lazy-include
effective-flow-dir-migration
when: setup has repaired and validated the runtime ignore state and is about to write a runtime marker
```

```include
adr-convention
```

```include
config-migration
```

## Project conventions

If the project has an `AGENTS.md`, read it before writing and follow its guidance on configuration, file formats, and project-wide conventions.

## Config schema

The Effective Flow configuration is optional and controls the defaults of the following blocks. Its source of truth is the project setup ADR table (see the building block above for encoding and locator). The respective skills are the authoritative source for valid values and defaults; this skill only summarizes them and must not count as the sole truth when the schema is extended. Unknown keys of an existing config are always preserved.

- **`review`** (source: `{{SKILL:review}}`): `profile` (full/focused/fast), `autoConfirmScope` (bool), `designDecisionSources` (full/standard/minimal), `validation` (full/quick/off)
- **`applyReview`** (source: `{{SKILL:apply-review}}`): `defaultCommitStrategy` (worktrees/single/none/`null` = ask at run time), `finalValidation` (full/changedScope/off), `stashPolicy` (interactive/keep/discard/apply), `worktree.baseDir`, `worktree.setup` (auto/none/command)
- **`plan`** (source: `{{SKILL:plan}}`): `markerLanguage` (de/en), `dir` (string, default `docs/plan`) — directory of the plan files
- **`delivery`** (source: `{{SKILL:build}}`, section "Delivery and worktree integration" – likewise embedded in the other code-changing workflows): delivery is implied by worktree/branch (no separate `enabled` switch anymore) — `baseBranch` (default `origin/main`), `branchPrefix` (default `effective-flow`), `completion` (pr/merge/branch, default `merge`), `returnBranch` (auto or local branch name)
- **`worktree`** (source: `{{SKILL:build}}`, section "Delivery and worktree integration"): `enabled` (bool, default `true`), `setup` (auto/none/command), `baseDir`
- **`tracker`** (source: `{{SKILL:review}}`, section "Issue-tracker integration" – likewise embedded in `{{SKILL:apply-review}}` and the other tracker workflows): `mode` (local/remote, default `local`), `remoteToolOverride` (auto/github/forgejo, default `auto`)
- **`skills`** (source: building block "Skill discovery"): `enabled` (bool, default `true` — toggles dynamic skill usage), `include` (list — prefer these skills project-wide), `exclude` (list — never apply these skills), `agents.<name>` and `tools.<name>` (each `include`/`exclude` for a single agent or a single tool). Keys are the source agent/tool names (e.g. `ui-implementer`, `plan`).

### Safe defaults (the single base)

The wizard **always** starts from this single named safe-defaults base. It comprises
the conservative `review`/`applyReview` values plus the core switches (values in the
ADR's table-encoding form):

| Key                               | Value                                               |
| --------------------------------- | --------------------------------------------------- |
| review.profile                    | focused                                             |
| review.autoConfirmScope           | false                                               |
| review.designDecisionSources      | standard                                            |
| review.validation                 | full                                                |
| applyReview.defaultCommitStrategy | null (ask at run time)                              |
| applyReview.finalValidation       | full                                                |
| applyReview.stashPolicy           | interactive                                         |
| applyReview.worktree.baseDir      | .effective-flow/.worktrees                          |
| applyReview.worktree.setup        | auto                                                |
| worktree.enabled                  | true                                                |
| delivery.completion               | merge                                               |
| delivery.baseBranch               | origin/main                                         |
| tracker.mode                      | local                                               |
| plan.dir                          | docs/plan                                           |
| plan.markerLanguage               | derived: detect from existing plans, otherwise `en` |

There is deliberately **no** second preset anymore. Anyone who wants a faster solo flow (e.g.
`review.profile: fast`, `review.validation: quick`, `applyReview.finalValidation:
changedScope`) reaches these values individually via the guided path (advanced
settings). For `plan.markerLanguage` there is no fixed value: detect the marker language
from existing plans (detection as in `{{SKILL:plan}}`); without a clear signal,
English.

## Workflow

### Step 1: .gitignore entry

Target state: the entire runtime directory `.effective-flow/` (excluding the `config.json` migration — the config now lives in the ADR; runtime files like `memory.json`, `cache.json`, `review/`, `.worktrees/`) is ignored. The single line achieves this:

```gitignore
.effective-flow/
```

There is **no** `!.effective-flow/config.json` exception pattern anymore: the Effective Flow configuration is no longer kept as a tracked `config.json`, but in the project setup ADR. `.effective-flow/` is thus a pure runtime directory and is ignored completely.

1. Check whether the target state is already established. In a Git worktree, run the
   non-verbose predicate `git check-ignore --no-index -- .effective-flow/config.json`: exit `0`
   means ignored, exit `1` means not ignored, and every other exit or launch error fails closed.
   Separately run `git ls-files -- .effective-flow/`; failure or any listed tracked path means
   the runtime target state is not established. Use
   `git check-ignore -v --no-index -- .effective-flow/config.json` only for diagnostics, never
   for the decision. There must also be **no** `!.effective-flow/config.json` negation line left
   in `.gitignore`. Without Git, use a line comparison of `.gitignore`: one line ignores
   `.effective-flow/` as a whole and **no** `!.effective-flow/…` negation line follows, but do
   not treat that as authorization for a runtime-state write.
2. If the target state is not yet established:
   - Migrate the former two-line pattern: if `.gitignore` contains the lines `.effective-flow/*` and `!.effective-flow/config.json` (old target state with a tracked `config.json`), replace **both** with the single line `.effective-flow/`.
   - Migrate old directory patterns of the predecessor names: if a line ignores the former `.firmo/` or `.sf-plugin/` (common spellings with/without a leading or trailing slash, including the old `.firmo/*` + `!.firmo/config.json` two-line form), replace it with the single line `.effective-flow/`. Normalize an already-present blanket `.effective-flow/` (or `.effective-flow`, `/.effective-flow/`) to `.effective-flow/` and remove any subsequent `!.effective-flow/config.json` negation line.
   - If every `.effective-flow/` entry is missing, append the line `.effective-flow/`. Ensure a trailing newline before appending. If `.gitignore` is missing, create it with this single line.
3. If the target state is already established: change nothing and report that briefly.
4. If the project is not a Git repository: point out that a `.gitignore` is ineffective without Git, and ask whether it should be written anyway. Then use the same line comparison as above instead of `git check-ignore`. The ADR and convention-marker creation continue independently, but no `.effective-flow/` runtime marker may be written.

### Step 2: Determine the ADR location and read the existing config

1. **Detect the ADR directory.** Look for an existing ADR convention (following the
   search globs of `{{SKILL:review}}`): `docs/adr/`, `docs/decisions/`, `adr/`. Use an
   existing directory. If none exists, the default is `docs/adr/`. If
   **several** exist, prefer `docs/adr/` for the project setup ADR; ask only on genuine
   ambiguity in the guided path:

```ask
when: several ADR directories exist and none is clearly `docs/adr/`
header: ADR location
question: In which directory should the Effective Flow project setup ADR live?
options:
  - label: docs/adr/
    description: Recommended default for the project setup ADR
  - label: docs/decisions/
    description: Use an existing directory
  - label: adr/
    description: Use an existing directory
```

2. **Resolve the project setup ADR.** Resolve an already-existing project setup ADR via the
   config locator (AGENTS.md marker `**Effective Flow project setup:** <path>` → default path/scan
   → transitional `.effective-flow/config.json`, otherwise `.firmo/config.json`; see the building block above). If a marker points to a dead
   path, continue down the order and note the outdated marker for correction. If an ADR resolves,
   it is authoritative and neither transitional JSON file is a migration source or may be
   untracked. Otherwise, capture the locator's exact verified absolute transitional JSON handle
   under `RUNTIME_STATE_ROOT` as `<source-handle>`; never replace it with or inspect a same-named
   fallback under `EXECUTION_ROOT`. For Git commands only, derive `<source-path>` as the verified
   repository-relative pathspec that identifies the same file after the locator's root/common-
   directory and containment checks. When both JSON files exist,
   `<RUNTIME_STATE_ROOT>/.effective-flow/config.json` wins; leave the unselected
   `<RUNTIME_STATE_ROOT>/.firmo/config.json` untouched throughout the run. Record whether Step 2
   resolved an ADR, a transitional JSON source, or no source; Step 6 uses this source state to
   detect intervening changes without inventing an undefined handle.
3. **Form the current values.** If an ADR exists, parse the `## Configuration` table per the
   encoding into an internal "current values" overview (key → currently recorded value). In the
   migration case, read `<source-handle>` as the current values and preserve all known and unknown
   keys. Show the respective value at every following question ("currently recorded: …") and use
   it as the pre-selection. If a key is missing, label the pre-selection as the default
   ("currently not set – default: …").
4. **Invalid source.** If the ADR table is invalid/ambiguous or the selected `<source-handle>` is
   not valid JSON, do not overwrite silently. Inform the user with that exact handle and the
   error, and ask whether the configuration should be newly created (old backup/overwrite) or the
   run aborted. Without the workflow's explicit invalid-source decision, do not write a
   replacement ADR, untrack either JSON file, or mark the migration complete.

### Step 3: Express or Guided

Briefly explain to the user that Effective Flow is immediately ready to use with safe defaults and that they only need to adjust something if they want to. Then offer the two paths:

```ask
header: Setup path
question: How would you like to set up the Effective Flow configuration?
options:
  - label: Express
    description: Adopt safe defaults (keep the current values of an existing config) — one confirmation step, then done
  - label: Guided
    description: Step by step through the options — each is explained, ideal if you do not yet know Effective Flow
```

- **Express:** Build the target configuration from the safe-defaults base (config schema above)
  plus – if a valid config exists – its existing values. Derive
  `plan.markerLanguage` per the base (detection, otherwise English). Jump directly to
  Step 6 (merge and write); the before/after list and confirmation there
  ensure that no existing, differing config is silently overwritten.
- **Guided:** Continue with Step 4 (core switches); the optional
  advanced gate follows afterwards (Step 5).

### Step 4: Core switches (guided path only)

These four switches determine the core behavior. **Before** each question, provide a short,
understandable explanation (what is it, why is it relevant, what does the choice mean) –
without assuming prior knowledge of Effective Flow – and state whether and with which value the
switch is currently set in the config (see Step 2); pre-select this value or the safe
default. Explain technical terms in one sentence at first mention.

**Worktree.** Explain: Effective Flow implements changes by default in a separate workspace
with its own branch (a "worktree"), so that your current state stays untouched and the
work is cleanly bundled; "No" works directly in your current checkout.

```ask
header: Worktree
question: Should the implementation run in a separate Git worktree?
options:
  - label: Yes
    description: worktree.enabled = true (default) — the implementation runs in a separate worktree with its own delivery branch
  - label: No
    description: worktree.enabled = false — in-place without a worktree; delivery branches are created in the main repo when needed
```

**Completion action.** Explain: how finished changes are brought in. `merge` brings them
directly into the target branch, `pr` opens a pull request (review before integration), `branch`
just leaves the branch; "ask at run time" decides anew each time.

```ask
header: Completion
question: Which completion action should Effective Flow use by default?
options:
  - label: Merge
    description: delivery.completion = merge (default) — merge the branch locally into the base branch, without a PR
  - label: Pull request
    description: delivery.completion = pr
  - label: Branch only
    description: delivery.completion = branch
  - label: Ask at run time
    description: delivery.completion = null — the action is asked per run
```

Briefly explain the base branch (the branch that is delivered into) and ask for it as free text
(`delivery.baseBranch`, default `origin/main`); the switch-back target (`delivery.returnBranch`,
default `auto`) only optionally.

**Marker language.** Explain: the language of the small status marker at the head of
plan files (only the marker, not the plan content). Pre-selection: the value detected from existing
plans; if there is no signal, English.

```ask
header: Marker
question: In which language should the status markers of new plan files be?
options:
  - label: English
    description: plan.markerLanguage = en (default if no language can be detected from existing plans)
  - label: German
    description: plan.markerLanguage = de
```

**Tracker.** Explain: where review findings end up – `local` as a Markdown report in the project
(`.effective-flow/review/`) or `remote` as issues on GitHub/Forgejo (useful for teamwork).

```ask
header: Tracker
question: Should review findings be kept locally as a Markdown report or remotely as issues (GitHub/Forgejo)?
options:
  - label: Local
    description: tracker.mode = local (default) — Markdown report under .effective-flow/review/
  - label: Remote
    description: tracker.mode = remote — findings as issues, tool automatically from origin (gh/tea)
```

For "Remote", ask for the tool override only if needed: the default `tracker.remoteToolOverride = auto` lets the shipped remote helper classify exact `github.com` origins and hosts that match a configured Forgejo `tea` login. Any other host returns `AMBIGUOUS_HOST` instead of guessing; then capture `github` or `forgejo` as free text. Otherwise leave `auto`.

### Step 5: Advanced settings (optional gate, guided path only)

The core switches suffice for everyday use. All remaining options are needed less often; therefore
first ask whether the user wants to adjust them at all:

```ask
header: Advanced
question: Would you like to adjust advanced settings (review, apply-review, paths, fine details)?
options:
  - label: No
    description: Keep safe defaults or existing values — recommended if you are still getting to know Effective Flow
  - label: Yes
    description: Go through the remaining options one by one, each explained
```

For "No": all advanced keys keep the safe default or the existing
config value; continue to Step 6. For "Yes": ask for each key block by block, each
with a short explanation, the valid values from the config schema above, and the current
config value or default as the pre-selection:

1. `review`: `review.profile` (full/focused/fast — depth of the review), `review.autoConfirmScope`, `review.designDecisionSources`, `review.validation`
2. `applyReview`: `applyReview.defaultCommitStrategy`, `applyReview.finalValidation`, `applyReview.stashPolicy`, `applyReview.worktree.baseDir`, `applyReview.worktree.setup`
3. `plan`: `plan.markerLanguage` (already asked in Step 4 — carry over), `plan.dir` (free text, default `docs/plan` — directory of the plan files)
4. `delivery`: `delivery.baseBranch` and `delivery.completion` (already asked in Step 4 — carry over), `delivery.branchPrefix`, `delivery.returnBranch`
5. `worktree`: `worktree.enabled` (already asked in Step 4 — carry over), `worktree.setup`, `worktree.baseDir`
6. `tracker`: `tracker.mode` (already asked in Step 4 — carry over), `tracker.remoteToolOverride` (auto/github/forgejo)
7. `skills`: `skills.enabled` (bool), `skills.include`/`skills.exclude` (global lists) as well as – as an advanced option – `skills.agents.<name>` and `skills.tools.<name>` for individual agents/tools. Additionally offer optionally (do not force) to materialize the built-in per-agent and per-tool recommendations visibly into the config as `skills.agents.<name>.include` or `skills.tools.<name>.include`; for a fallback recommendation (`effective-web › impeccable › frontend-design`), write only the **primary** skill (`effective-web`) — the built-in fallback stays active. Flat recommendations (e.g. `locale-typography`) are carried over unchanged.

Anyone who wants the former "fast solo workflow" sets, for example, `review.profile: fast`,
`review.validation: quick`, and `applyReview.finalValidation: changedScope` here.

Note: `applyReview.worktree.*` (apply-review's own worktree mechanism), the top-level `worktree.*` block (execution location), and the top-level `delivery.*` block (delivery branch/completion) are separate, independent config paths — do not confuse them when asking and merging.

Ask for free-text values (e.g. `baseBranch`, `branchPrefix`, `returnBranch`, `baseDir`, or an explicit `setup` command) as free text. On invalid input for an enumerated key, ask again or use the default and report that.

### Step 6: Merge and write

1. Build the target configuration non-destructively: set the known keys to the chosen values, carry over existing valid values for keys not asked about, and leave unknown keys unchanged.
2. This also applies to the safe defaults: a default value that would replace an already-present, differing config value is set only after explicit confirmation. Before writing, show a before/after list of **all** keys to be changed (whether from the express base, the core switches, or the advanced settings) and obtain confirmation. A full overwrite (discarding existing values) likewise only after explicit confirmation.
3. Resolve the project setup ADR freshly once more directly before writing (locator) and compare
   its result with the source state recorded in Step 2:
   - If an ADR now resolves, it is authoritative: re-read its table and do not migrate or touch
     either JSON fallback.
   - If Step 2 selected a transitional JSON source and no ADR now resolves, require the freshly
     resolved transitional handle to equal the retained `<source-handle>`. If they match,
     revalidate and re-read that exact absolute handle immediately before writing; do not resolve a
     fallback under `EXECUTION_ROOT` during this pre-write check. If the file disappeared, failed
     the runtime-root/repository checks, or became invalid, report that exact handle and abort the
     write. If the fresh locator selects a different transitional handle, stop before writing and
     restart from Step 2 with the newly selected source. In particular, if
     `<RUNTIME_STATE_ROOT>/.firmo/config.json` was retained and
     `<RUNTIME_STATE_ROOT>/.effective-flow/config.json` appeared, the higher-precedence Effective
     Flow source must be read and presented before any write.
   - If Step 2 found no source and the fresh locator still finds none, continue as a normal fresh
     setup; no `<source-handle>` or `<source-path>` exists and no migration action runs.
   - If Step 2 found no source but the fresh locator now finds a transitional JSON source, stop
     before writing and return to Step 2 with that newly selected source. Read and present its
     values instead of writing defaults over it. Likewise, if a previously resolved ADR
     disappeared and no ADR now resolves, restart from Step 2 rather than silently switching to a
     fallback or to defaults.

   Rebuild the target configuration from the applicable fresh values so that intervening changes,
   including unknown keys, are not lost.

   Before Step 4 in a migration case, perform a read-only idempotency check. This check creates
   nothing and touches no Git: read the verified absolute
   `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle non-mutatingly and inspect
   `configMigration.adr`. If the completion marker is already set, stop before Step 4 and before
   any Git action; do not migrate again. Re-resolve the ADR: if it is missing despite the
   completion marker, report the inconsistent state and ask whether to begin a separate normal
   non-migration setup or abort. Do not continue this migration path.

4. **Write the project setup ADR.** Determine the ADR directory (Step 2) and write the
   ADR to `<adr-dir>/effective-flow-project-setup.md` (default slug `effective-flow-project-setup`; an old slug `firmo-project-setup` is recognized as equivalent during the scan and switched to the new slug on write) in the
   living ADR format:
   - H1 `# Effective Flow project setup`
   - `## Status` with `Active`
   - a short `## Context` prose (this ADR holds the tracked Effective Flow configuration; `.effective-flow/` is a pure runtime directory)
   - `## Configuration` with the two-column table `| Key | Value |`; one row per key in the table-encoding form (boolean, unquoted string, literal `null`, `(empty)`, comma-separated list, dotted keys). Preserve unknown foreign keys from an existing source as their own rows.

   Example skeleton:

   ```markdown
   # Effective Flow project setup

   ## Status

   Active

   ## Context

   This ADR holds this project's tracked Effective Flow configuration. `.effective-flow/` is a pure
   runtime directory and completely gitignored.

   ## Configuration

   | Key                         | Value    |
   | --------------------------------- | ------- |
   | review.profile                    | focused |
   | applyReview.defaultCommitStrategy | null    |
   | worktree.enabled                  | true    |
   | tracker.mode                      | local   |
   ```

   In the migration case, snapshot the pre-write existence and content of the target ADR and the
   convention file that will carry the marker. Keep those snapshots only for the failure recovery
   in Step 6.

5. **Set the AGENTS.md marker.** Write the canonical line `**Effective Flow project setup:** <adr-path>` non-destructively: preferably into an existing `AGENTS.md`, otherwise into an existing `CLAUDE.md`, otherwise create a minimal `AGENTS.md` with this line. Leave the remaining content untouched; update an existing (possibly outdated) marker instead of duplicating it — this includes an old marker `**Firmo project setup:**`, which is switched to the new spelling in the process.
6. **Migration and untracking (migration case only).** If a transitional
   `.effective-flow/config.json` or old `.firmo/config.json` was read from `<source-handle>`:
   - In a Git repository, determine whether that exact source is tracked with
     `git ls-files -- <source-path>`. If it is tracked, untrack only that source automatically
     with `git rm --cached <source-path>`; **leave the file content on disk** (Effective Flow's
     non-destructive line), leaving cleanup to the user. `git rm --cached` **stages** an index
     change but creates **no** commit — the setup rule "creates no commits" stays intact. Never
     inspect, untrack, or otherwise modify the unselected fallback.
   - If that required untracking command fails or `<source-handle>` is no longer present on disk,
     the migration is incomplete. Report the failure, do not write `configMigration.adr`, and
     restore the ADR and convention-marker file from the snapshots taken immediately before Steps
     4–5 so the locator can select the same JSON source on a later run. Roll back only when the
     current content still exactly matches this run's write; never overwrite a concurrent change.
     If safe rollback is no longer possible, report the precise manual recovery needed instead of
     claiming that the migration completed.
   - If the project is not a Git repository or `<source-path>` is not tracked, skip the
     untracking and report that exact outcome; this is a successful migration path because no
     index repair is required.
   - Before writing the migration marker, freshly validate the repaired target state using the
     exact non-verbose checks from Step 1. Run
     `git check-ignore --no-index -- .effective-flow/memory.json` as the concrete-target
     predicate as well as the sentinel predicate, and require empty output from
     `git ls-files -- .effective-flow/`. If any check blocks, preserve the runtime directory,
     report the concrete reason and tracked paths, apply the same safe ADR/marker rollback, and do
     not write the marker.
   - Only after target-state validation passes, apply “Runtime-state write safety” immediately
     to the exact directory `.effective-flow/` immediately before its `mkdir` if it is missing.
     Apply the guard again to the concrete marker file immediately before writing it. Mark completion idempotently in
     `.effective-flow/memory.json` under `configMigration.adr` (`version` e.g.
     `config-to-adr-v1`, `appliedAt` timestamp). For a valid existing memory object, deep-merge
     only `configMigration.adr`: preserve every unrelated top-level field, nested field, and
     sibling `configMigration` state. Never write or update the marker after invalid JSON, failed
     required untracking, or failed target-state validation; the pre-write marker check above
     owns idempotency for an already-complete migration.

### Step 7: Summary

Report to the user:

- whether the `.gitignore` line `.effective-flow/` was added, a former two-line pattern (`.effective-flow/*` plus `!.effective-flow/config.json`) or an old `.firmo/`/`.sf-plugin/` line was migrated to it, or the target state was already established
- which path was chosen (Express or Guided) and whether advanced settings were adjusted
- the set central behavior values (`worktree.enabled` [default `true`], `delivery.completion` [default `merge`] including, if applicable, `delivery.baseBranch`/`delivery.returnBranch`, `plan.markerLanguage`, `tracker.mode`, and, if applicable, `tracker.remoteToolOverride`) as well as `plan.dir`, if set or changed from the default
- for a previously existing config: which keys were changed from the old state (before/after)
- the path of the written project setup ADR and the location of the set `**Effective Flow project setup:**` marker (`AGENTS.md`/`CLAUDE.md`)
- in the migration case: identify the exact `<source-handle>` selected by the locator and whether
  migration completed. For a completed migration, report whether `<source-path>` was **removed
  staged** via `git rm --cached` (content left on disk) or was already untracked. For an incomplete
  migration, report the failed step and rollback outcome and do not call the source migrated.
  Never name the unselected fallback as processed. State that no commit was created and that the
  user handles any cleanup themselves

## Rules

- Change only `.gitignore` (the `.effective-flow/` line or its migration), the project setup ADR, and the `**Effective Flow project setup:**` marker in `AGENTS.md`/`CLAUDE.md`; no further setup steps like deployment or Git hooks.
- Never overwrite existing config values and unknown keys without asking.
- On an abort during the questions, leave no half-written ADR; write only once at the end.
- Do not start project validation; linting, tests, and build checks are the job of other skills such as `{{AGENT:code-validator}}`.
- Do not create commits; committing is done by the user or `{{SKILL:commit}}`. Untracking an old `config.json` only stages an index change (`git rm --cached`) without committing.
- Do not process or store any secrets; the configuration contains only behavior defaults.
