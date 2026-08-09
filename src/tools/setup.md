---
description: "Prepares a target project for using Effective Flow: enters `.effective-flow/` completely and idempotently into `.gitignore` (pure runtime directory) and writes the Effective Flow configuration via a guided wizard into a living project setup ADR (Markdown table) that an `**Effective Flow project setup:**` marker in AGENTS.md points to. Migrates an existing transitional `.effective-flow/config.json`, or otherwise `.firmo/config.json`, once into the ADR, invokes the shared runtime-directory migration for that selected legacy source, and preserves the config source content on disk. Always starts from safe defaults, offers an express and a guided path, explains every option even for Effective Flow newcomers, and shows the currently recorded values when a config exists. Maintains an existing configuration non-destructively. Use this skill for the one-time setup or to adjust the Effective Flow configuration."
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
when: setup has repaired and validated the runtime ignore state and is about to write a runtime marker or a capability probe below `.effective-flow/`
```

```lazy-include
effective-flow-dir-migration
when: the config locator selected a transitional JSON source and setup has repaired and validated the runtime ignore/index state before the config-migration marker
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
- **`language`** (source: shared "Language resolution"): `project` and optional `source`,
  `documentation.user`, `documentation.technical`, `workflow`, `forge`, `git` overrides
  (`de`/`en`; a missing override inherits `language.project`, whose default is `en`)
- **`plan`** (source: `{{SKILL:plan}}`): `dir` (string, default `docs/plan`) — directory of the plan files
- **`delivery`** (source: `{{SKILL:build}}`, section "Delivery and worktree integration" – likewise embedded in the other code-changing workflows): delivery is implied by worktree/branch (no separate `enabled` switch anymore) — `baseBranch` (default `origin/main`), `branchPrefix` (default `effective-flow`), `completion` (pr/merge/branch, default `merge`), `returnBranch` (auto or local branch name), `prReview` (ask/always/off, default `ask` — automatic PR review publication after a delivery), `mergeMethod` (squash/merge/rebase, default `squash` — how a pull request is integrated when `{{SKILL:merge-gate}}` merges it)
- **`mergeGate`** (source: `{{SKILL:merge-gate}}`): `completion` (ask/merge/report, default `ask` — may a gate run merge at the end or only report merge-readiness), `requireAllChecks` (bool, default `true`), `checkWaitMinutes` (positive integer, default `20`), `maxRounds` (positive integer, default `3`), `botWaitMinutes` (positive integer, default `10`), `bots` (comma list of automatic-reviewer logins, default empty), `bots.<login>.trigger` (the literal trigger comment text for one bot, unset by default), `bots.<login>.check` (the commit-status or check-run context that proves whether that bot has run, unset by default). This block was named `prReview.*` in an earlier generation; the legacy names are still read, and this skill migrates a legacy block in place (Step 6). **Not** the same thing as `delivery.prReview`: that key decides whether a run publishes **its own findings** onto a pull request it created and keeps its name, while `mergeGate.*` configures the merge gate.
- **`worktree`** (source: `{{SKILL:build}}`, section "Delivery and worktree integration"): `enabled` (bool, default `true`), `setup` (auto/none/command), `baseDir`
- **`tracker`** (source: `{{SKILL:review}}`, section "Issue-tracker integration" – likewise embedded in `{{SKILL:apply-review}}` and the other tracker workflows): `mode` (local/remote/external, default `local`), `remoteToolOverride` (auto/github/forgejo, default `auto`, forge only), `externalTool` (short identifier of the tool holding the issues, no whitelist, required for `mode: external`), `externalToolHint` (free text: MCP server name, workspace, team/project key, identifier convention, state names)
- **`skills`** (source: building block "Skill discovery"): `enabled` (bool, default `true` — toggles dynamic skill usage), `include` (list — prefer these skills project-wide), `exclude` (list — never apply these skills), `agents.<name>` and `tools.<name>` (each `include`/`exclude` for a single agent or a single tool). Keys are the source agent/tool names (e.g. `ui-implementer`, `plan`).

### Safe defaults (the single base)

The wizard **always** starts from this single named safe-defaults base. It comprises
the conservative `review`/`applyReview` values plus the core switches (values in the
ADR's table-encoding form):

| Key                               | Value                      |
| --------------------------------- | -------------------------- |
| review.profile                    | focused                    |
| review.autoConfirmScope           | false                      |
| review.designDecisionSources      | standard                   |
| review.validation                 | full                       |
| applyReview.defaultCommitStrategy | null (ask at run time)     |
| applyReview.finalValidation       | full                       |
| applyReview.stashPolicy           | interactive                |
| applyReview.worktree.baseDir      | .effective-flow/.worktrees |
| applyReview.worktree.setup        | auto                       |
| worktree.enabled                  | true                       |
| delivery.completion               | merge                      |
| delivery.baseBranch               | origin/main                |
| tracker.mode                      | local                      |
| plan.dir                          | docs/plan                  |
| language.project                  | en                         |

There is deliberately **no** second preset anymore. Anyone who wants a faster solo flow (e.g.
`review.profile: fast`, `review.validation: quick`, `applyReview.finalValidation:
changedScope`) reaches these values individually via the guided path (advanced
settings). Missing `language.*` overrides inherit `language.project`; Express therefore writes
only `language.project = en` unless existing overrides are preserved. The legacy
`plan.markerLanguage` is never written as a current setting.

The `mergeGate.*` merge-gate keys and `delivery.mergeMethod` are deliberately **not** part of this
base: a missing line means the source skill's default (see the defaults table in Step 5, block 9),
so Express writes no row for them and an unconfigured project gets the safe gate behavior
(`ask`, every check green, no automatic reviewer expected).

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
3. **Form the current values.** If an ADR exists, parse either canonical `## Configuration` /
   `| Key | Value |` or `## Konfiguration` / `| Schlüssel | Wert |` table per the encoding into
   an internal "current values" overview (key → currently recorded value), and retain the
   envelope language for a later update. In the
   migration case, read `<source-handle>` as the current values and preserve all known and unknown
   keys. Show the respective value at every following question ("currently recorded: …") and use
   it as the pre-selection. If a key is missing, label the pre-selection as the default
   ("currently not set – default: …"). While parsing, record a legacy merge-gate block: every row
   whose key begins with `prReview.` belongs to the former namespace of the `mergeGate.*` keys, and
   for each such row note whether a `mergeGate.*` row with the same trailing key already exists.
   `delivery.prReview` is **not** such a row and never becomes one. Step 6 migrates the recorded
   block in place.
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
  `language.project = en` per the base and retain valid existing language overrides. Apply the
  confirmed compatibility migrations described below — the language keys and a legacy `prReview.*`
  merge-gate block — when needed. Jump directly to Step 6
  (merge and write); the before/after list and confirmation there
  ensure that no existing, differing config is silently overwritten.
- **Guided:** Continue with Step 4 (core switches); the optional
  advanced gate follows afterwards (Step 5).

### Step 4: Core switches (guided path only)

These core switches determine the everyday behavior. **Before** each question, provide a short,
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

**PR review.** Explain: when a run creates a pull request, Effective Flow can post that run's
review findings on it as comments. "Ask each time" decides per run, "Always" posts without asking,
"Never" switches the automatic step off; an explicit `{{SKILL:review}} <PR>` stays available in
every case.

```ask
header: PR review
question: Should Effective Flow post its review findings on a pull request it created?
options:
  - label: Ask each time
    description: delivery.prReview = ask (default) — a gated run asks once per delivery
  - label: Always
    description: delivery.prReview = always — post the findings without asking
  - label: Never
    description: delivery.prReview = off — no automatic posting; an explicit review of a PR is unaffected
```

**Project and surface languages.** Explain: the project language is the fallback for every new
human-readable artifact, while optional surface overrides let source prose, documentation,
workflow artifacts, Forge communication, and Git history differ. A plan is entirely in the
workflow language, including its status marker. Only `de` and `en` are supported; German maps to
`de-DE` typography and English to `en-US`.

```ask
header: Language
question: Which default language should Effective Flow use for this project?
options:
  - label: English
    description: language.project = en (default)
  - label: German
    description: language.project = de
```

Then offer each override in turn: `language.source`, `language.documentation.user`,
`language.documentation.technical`, `language.workflow`, `language.forge`, and `language.git`.
For every override, offer **Inherit project language** first, then English and German. Inherit is
represented by an absent row, not `null`; removing an existing override is a normal before/after
change that requires confirmation. Explain the exact target surface from the shared language
table. In particular, a Conventional Commit PR title uses `language.git`, while the PR body and
comments use `language.forge`.

Before asking, detect compatibility input. If `language.workflow` is absent and a valid
`plan.markerLanguage` exists, show the old value and explain that migration changes it from a
marker-only language to the language of the complete plan/review artifact. Propose adding
`language.workflow = <legacy value>` and removing `plan.markerLanguage`; do neither before the
confirmed Step 6 write. If no `language.*` and no legacy key exist, use the existing-plan fallback
only when plan prose, canonical fields, and marker all consistently identify one language;
propose that as `language.workflow` and point to setup. Do not infer from a marker alone, and do
not guess for mixed, contradictory, empty, or unclear corpora.

**Tracker.** Explain: where issue work ends up – `local` as a Markdown report in the project
(`.effective-flow/review/`), `remote` as issues on GitHub/Forgejo (useful for teamwork), or
`external` as issues in a separate project-management tool the team already uses. Mention that the
external option needs a connection that already exists on this machine (an MCP connection or an
authenticated CLI) and that Effective Flow ships no product-specific adapter, so a run aborts
rather than guessing when it cannot find exactly one usable connection. Pull requests always stay
on the Git forge, whichever option is chosen.

```ask
header: Tracker
question: Where should issue work live: locally as a Markdown report, remotely as issues (GitHub/Forgejo), or in an external tool?
options:
  - label: Local
    description: tracker.mode = local (default) — Markdown report under .effective-flow/review/
  - label: Remote
    description: tracker.mode = remote — findings as issues, tool automatically from origin (gh/tea)
  - label: External tool
    description: tracker.mode = external — issues live in the project-management tool named by tracker.externalTool
```

For "Remote", ask for the tool override only if needed: the default `tracker.remoteToolOverride = auto` lets the shipped remote helper classify exact `github.com` origins and hosts that match a configured Forgejo `tea` login. Any other host returns `AMBIGUOUS_HOST` instead of guessing; then capture `github` or `forgejo` as free text. Otherwise leave `auto`.

For "External tool", ask two free-text follow-ups and explain each before asking:

1. `tracker.externalTool` – the short, stable identifier of the tool that holds the issues. It is
   required for this mode, there is no list of supported tools, and Effective Flow derives no
   capability from the name. Without a value the mode stays unusable, so ask again instead of
   writing an empty entry.
2. `tracker.externalToolHint` – optional free text that lets a run find the right connection at
   run time: MCP server name, workspace, team or project key, the tool's identifier convention, and
   the names of its states. Explain that a precise hint is what prevents an ambiguous-connection
   abort when several candidates exist.

`tracker.remoteToolOverride` stays a forge setting and is not asked for in this mode. Keep an
already recorded `externalTool`/`externalToolHint` when the mode is `local` or `remote`: they
document intent, are preserved unchanged, and are simply ignored for routing.

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
3. `language`: the project language and six overrides already asked in Step 4 — carry over
4. `plan`: `plan.dir` (free text, default `docs/plan` — directory of the plan files) and
   `concept.dir` (free text, default `docs/concept` — directory of the concept files). Both are
   canonicalized before they are written; reject values that resolve to the same directory or nest
   one inside the other instead of writing them.
5. `delivery`: `delivery.baseBranch`, `delivery.completion`, and `delivery.prReview` (already asked in Step 4 — carry over), `delivery.branchPrefix`, `delivery.returnBranch`, `delivery.mergeMethod` (squash/merge/rebase, default `squash` — how a pull request is integrated when the merge gate in block 9 merges it; with `squash` the pull-request title becomes the commit subject and therefore the release signal)
6. `worktree`: `worktree.enabled` (already asked in Step 4 — carry over), `worktree.setup`, `worktree.baseDir`
7. `tracker`: `tracker.mode` (already asked in Step 4 — carry over), `tracker.remoteToolOverride` (auto/github/forgejo, forge only), `tracker.externalTool` and `tracker.externalToolHint` (free text; required identifier plus optional connection hint for `mode: external`, carried over when already asked in Step 4)
8. `skills`: `skills.enabled` (bool), `skills.include`/`skills.exclude` (global lists) as well as – as an advanced option – `skills.agents.<name>` and `skills.tools.<name>` for individual agents/tools. Additionally offer optionally (do not force) to materialize the built-in per-agent and per-tool recommendations visibly into the config as `skills.agents.<name>.include` or `skills.tools.<name>.include`; for a fallback recommendation (`effective-web › impeccable › frontend-design`), write only the **primary** skill (`effective-web`) — the built-in fallback stays active. Flat recommendations (e.g. `locale-typography`) are carried over unchanged.
9. `mergeGate` – the **merge gate** of `{{SKILL:merge-gate}}`, asked as its own block: see below.

Anyone who wants the former "fast solo workflow" sets, for example, `review.profile: fast`,
`review.validation: quick`, and `applyReview.finalValidation: changedScope` here.

Note: `applyReview.worktree.*` (apply-review's own worktree mechanism), the top-level `worktree.*` block (execution location), and the top-level `delivery.*` block (delivery branch/completion) are separate, independent config paths — do not confuse them when asking and merging. The same applies to `delivery.prReview` (publish this run's findings after a delivery) and the `mergeGate.*` block (the merge gate): the rename removed the shared name, but the legacy `prReview.*` namespace is still read, so keep the two apart — `delivery.prReview` belongs to the `delivery` block, is never part of a legacy merge-gate block, and is never migrated.

Ask for free-text values (e.g. `baseBranch`, `branchPrefix`, `returnBranch`, `baseDir`, or an explicit `setup` command) as free text. On invalid input for an enumerated key, ask again or use the default and report that.

#### Block 9: the merge gate (`mergeGate.*`)

Ask this block **separately** from the `delivery.prReview` question of Step 4 and say so, because
this block was itself named `prReview.*` in an earlier generation and the two mean entirely
different things:

- **`delivery.prReview`** (Step 4) decides whether a run posts **its own review findings** onto a
  pull request it just created. It keeps its name and is untouched by the rename.
- **`mergeGate.*`** (this block) configures the tool that takes an **existing** pull request from
  open to merged: it waits for the checks, has failures repaired, evaluates the notes of the
  configured automatic reviewers, refuses to implement or merge while a human comment is open, and
  finally merges. If the project still carries these keys as `prReview.*`, show the recorded legacy
  values as the current ones and say that Step 6 migrates the block.

Explain first, then ask. The gate is safe without any of these keys, so "keep the defaults" is a
perfectly good answer.

```ask
when: the user chose the advanced settings and the merge gate block is being asked
header: Merge gate
question: When the merge gate has verified a pull request, may it merge, or should it only report?
options:
  - label: Ask each time
    description: mergeGate.completion = ask (default) — a gated run asks once per pull request
  - label: Merge
    description: mergeGate.completion = merge — merge as soon as every precondition holds
  - label: No merge
    description: mergeGate.completion = report — the gate still repairs failing checks and answers bot threads, it only never merges
```

Then ask for the remaining keys, each with a short explanation, the valid values, and the current
value or default as the pre-selection:

| Key                              | Values                             | Default   |
| -------------------------------- | ---------------------------------- | --------- |
| `mergeGate.completion`           | `ask`, `merge`, `report`           | `ask`     |
| `mergeGate.requireAllChecks`     | `true`, `false`                    | `true`    |
| `mergeGate.checkWaitMinutes`     | positive integer                   | `20`      |
| `mergeGate.maxRounds`            | positive integer                   | `3`       |
| `mergeGate.botWaitMinutes`       | positive integer                   | `10`      |
| `mergeGate.bots`                 | comma list of logins               | `(empty)` |
| `mergeGate.bots.<login>.trigger` | literal trigger comment text       | unset     |
| `mergeGate.bots.<login>.check`   | commit-status or check-run context | unset     |

- `mergeGate.requireAllChecks`: `true` (default) requires **every** check to be green; `false` falls
  back to the checks the forge itself marks as required — useful for a project with a permanently
  red optional check.
- `mergeGate.checkWaitMinutes`, `mergeGate.botWaitMinutes`: how long a single wait for the checks or
  for an automatic reviewer may take before the run reports instead of waiting longer.
- `mergeGate.maxRounds`: how many repair rounds one run may spend in total before it ends with a
  report instead of a merge.
- `mergeGate.bots`: the logins of the automatic reviewers this project expects (e.g.
  `greptileai[bot]`), as a comma list. Empty (the default) means no automatic reviewer is expected
  and the bot round is skipped rather than blocking the merge forever. Either spelling of a bot
  login works — `greptileai[bot]` as GitHub's UI shows it, or the bare `greptileai` — because the
  gate resolves a configured login through "Matching a configured login", which tolerates the
  trailing `[bot]` on either side for an account the forge reports as a bot. Listing both spellings
  is therefore redundant rather than a
  workaround, and the gate reports the collapse when it sees one — collapse such entries as described
  below **before** asking the two follow-up questions.
- `mergeGate.bots.<login>.trigger`: free text, the literal comment that re-triggers exactly that bot
  (e.g. `@greptileai`). Ask for it once per **reviewer** left after that collapse, never once per
  configured login. A login containing brackets is a valid middle segment, because the table encoding
  splits on `.` only. Say when asking that this should be a **distinctive mention** such as
  `@greptileai`, not generic prose such as `please review`, because the gate recognizes its own
  trigger comment by an exact match against this string — a generic value could be matched by an
  ordinary human comment, which would then be excluded from the human-comment guard.
- `mergeGate.bots.<login>.check`: free text, the commit-status context or check-run name that this
  reviewer publishes against a head commit (e.g. `recensor/review`). Ask for it once per **reviewer**
  as well, directly after that reviewer's trigger text, and offer "not set" as the answer —
  it is optional and unset by default. Explain what it buys: with a check context the gate and
  `{{SKILL:iterate}}` can tell a reviewer that is **still running** from one that has **not started**,
  so a running reviewer is waited for instead of triggered a second time. Without it both fall back
  to comparing the reviewer's newest comment against the head commit, which cannot see a reviewer
  that edits one sticky comment in place. Leave it unset only for a reviewer that publishes no check
  context at all, and do not infer that from an emoji acknowledgment: Greptile acknowledges a trigger
  with a reaction **and** publishes a `Greptile Review` check, so it is a reviewer that wants a
  configured `.check` rather than the fallback. Say how to observe it: open a recent pull request the
  reviewer has already reviewed and read its **checks list** – the reviewer's entry stands there
  under exactly the name to configure here. When in doubt, configure it. The two mistakes are not
  symmetric: a wrongly set context is named in the gate's own block and is corrected the moment it
  blocks, while an omitted one leaves the reviewer on the fallback and can never be reported at all.

`delivery.mergeMethod` (block 5) decides **how** the gate merges; it stays in the `delivery` block
because it is a property of this project's delivery, not of the gate.

#### Collapsing two `mergeGate.bots` spellings of one reviewer

A project that lists both spellings of one bot login — the workaround before the gate matched them —
carries two recorded entries for one reviewer. Resolve them through the gate's "Matching a configured
login" rule **before** the two follow-up questions above, on the Express path as well as the guided
one:

- **Collapse first, then ask.** Group the recorded logins into reviewers under that rule and ask
  `.trigger` and `.check` once per reviewer. Asking once per login asks one reviewer's question
  twice, and two different answers to it write exactly the conflict that rule refuses to resolve by
  guessing — one this skill, as the only writer of the configuration, would leave nothing able to
  repair.
- **Keep one entry.** The rule keeps the first of the collapsing logins as the reviewer's key, so
  record the chosen values under that spelling and drop the other entry's `mergeGate.bots` member and
  its `.trigger`/`.check` rows.
- **Show a disagreement, never resolve it silently.** If the collapsing entries already carry
  different recorded values for the same key, name both values verbatim together with the spelling
  that recorded each, and have the user choose one. Never combine them and never keep one silently. A
  key set on only one of the two is no disagreement: it is simply the reviewer's value.

```ask
when: two collapsing `mergeGate.bots` entries carry different recorded values for the same key
header: Bot conflict
question: These two entries are one reviewer and recorded different values for this key. Which value should the single entry keep?
options:
  - label: First value
    description: Keep the value recorded under the first of the two collapsing spellings, verbatim
  - label: Second value
    description: Keep the value recorded under the second spelling, verbatim
  - label: Neither
    description: Neither recorded value is right; capture the replacement as free text
```

- Show the whole collapse — the kept login, the removed list member and its removed rows, and every
  resolved disagreement — in the before/after list of Step 6 item 2 and write it only after the same
  confirmation as any other change. Without that confirmation, leave both entries exactly as they
  are; the gate keeps working and keeps reporting the collapse.

### Step 6: Merge and write

1. Build the target configuration non-destructively: set the known keys to the chosen values, carry over existing valid values for keys not asked about, and leave unknown keys unchanged. A legacy `prReview.*` merge-gate block recorded in Step 2 is not an unknown key: rewrite it as described below before the before/after list is built. Two recorded `mergeGate.bots` entries that denote one reviewer are collapsed just as early, as described for block 9.
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
   - For a new ADR, resolve `language.documentation.technical` through `language.project` and
     the default. Use the complete English envelope (`# Effective Flow project setup`,
     `## Status` + `Active`, `## Context`, `## Configuration`, `| Key | Value |`) for `en`, or
     the complete German envelope (`# Effective-Flow-Projektsetup`, `## Status` + `Aktiv`,
     `## Kontext`, `## Konfiguration`, `| Schlüssel | Wert |`) for `de`.
   - For an existing ADR, preserve its recognized English or German envelope and surrounding
     prose during a normal update, even when the configured technical-documentation language
     changes. Do not translate it incidentally.
   - Add a short context sentence in that envelope's language explaining that the ADR holds the
     tracked Effective Flow configuration and `.effective-flow/` is a pure runtime directory.
   - Use one row per key in the table-encoding form (boolean, unquoted string, literal `null`,
     `(empty)`, comma-separated list, dotted keys). Config keys and values remain identical and
     English in both envelopes: never write the legacy German token `(leer)`. Preserve unknown
     foreign keys from an existing source.

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

   The German equivalent changes only the human-readable envelope and context prose; it does not
   translate keys such as `language.project` or values such as `en`, `true`, and `focused`.

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
   - Only after target-state validation passes, and only because the locator selected the
     retained transitional `<source-handle>`, invoke the loaded shared runtime-directory
     migration prerequisite before writing `configMigration.adr`. Apply “Runtime-state write
     safety” immediately to every exact runtime target as required by that shared contract; do
     not duplicate its source precedence, inventory, copy, memory-merge, lock, or marker logic.
     A normal fresh setup with no selected transitional JSON source does not invoke this
     prerequisite and creates no `.effective-flow/` runtime footprint.
   - If the shared runtime-directory migration fails or remains incomplete, do not write
     `configMigration.adr`. Preserve the locator-selected config source and every safely copied
     partial runtime target, report the exact failure, and apply the same conditional ADR and
     convention-marker rollback used for failed untracking: roll back only this run's unchanged
     tracked writes and never overwrite a concurrent change. A later setup or cleanup run may
     resume the markerless runtime migration idempotently.
   - After the shared runtime-directory migration succeeds, mark completion idempotently in
     `.effective-flow/memory.json` under
     `configMigration.adr` (`version` e.g. `config-to-adr-v1`, `appliedAt` timestamp) through the
     loaded shared memory mutation contract: acquire its lock, re-read and validate memory,
     deep-merge only `configMigration.adr`, preserve every unrelated top-level field, nested field, sibling
     `configMigration` state, and unknown field, and atomically replace the file. If this marker is
     already set, do not migrate again. A lock, validation, or replacement failure leaves the
     prior memory file intact and is reported without claiming migration completion. Never write
     or update the marker after invalid JSON, failed required untracking, or failed target-state
     validation; the pre-write marker check above owns idempotency for an already-complete
     migration.

#### Rewriting a legacy `prReview.*` merge-gate block in place

The merge-gate keys of block 9 were named `prReview.*` in an earlier generation. If Step 2 recorded
such rows, rewrite that block **in place** as part of this same confirmed write — on the Express
path as well as the guided one:

- **Carry every legacy row over** to the identical trailing key under `mergeGate.`
  (`prReview.completion` → `mergeGate.completion`, `prReview.bots.<login>.trigger` →
  `mergeGate.bots.<login>.trigger`, and so on), preserving the recorded value verbatim. The values
  are unchanged by the rename; only the namespace moves.
- **Remove the old rows.** Do not leave both blocks standing. Nothing breaks if you do — every
  reader resolves `mergeGate.*` first — but two adjacent blocks of plausible-looking configuration,
  one of them inert, is exactly the artifact a later maintainer edits without effect.
- **Report a shadowed key, do not merge it.** If a `mergeGate.<key>` and a `prReview.<key>` row are
  both present with different values, keep the `mergeGate` value, name the discarded legacy value
  explicitly, and never combine the two into one setting.
- **`delivery.prReview` is not part of this block.** It is a `delivery` key with an unrelated
  meaning, keeps its name, and is neither carried over nor removed.
- Show the whole rewrite — every carried-over row, every removed row, and every shadowed key — in
  the before/after list of item 2 and write it only after the same confirmation as any other change.
  Without that confirmation, leave the legacy rows exactly as they are.

This skill is the **only** writer of the configuration. A `{{SKILL:merge-gate}}` or
`{{SKILL:iterate}}` run that resolves a value through the legacy namespace reports that once and
points here; it never rewrites the ADR itself.

### Step 7: Session rename capability (optional)

Hosts derive a session title from the first message, so a run is listed under a name that predates
its subject. Where the running host can rename its own session, Effective Flow applies the better
title itself instead of suggesting it; where it cannot, every run keeps printing a suggestion the
user applies by hand. That capability needs a one-time, per-user setup, and this step prepares it.

This step is **not** part of the configuration. It declares no key, belongs to none of the Step 5
blocks, and adds nothing to the Step 6 write. It **prints**: it never opens, edits, or creates a
file above the repository root, and it never touches the user's harness configuration. What the user
pastes, and whether they paste it at all, stays their decision. It has exactly one announced side
effect outside this repository: with the user's go-ahead, the probe in item 4 renames the current
session once, because a rename nobody can see proves nothing.

```ask
when: the configuration write completed and the run may prepare the host's self-rename capability
header: Self-rename
question: Should setup check whether this harness can rename its own session and print what that needs?
options:
  - label: Yes
    description: Detect the harness, print the definition to paste, and prove it once by renaming this session
  - label: No
    description: Skip it — runs keep printing a suggested title instead of applying it
```

For "No", note that runs keep emitting the suggestion line and continue with Step 8. For "Yes":

1. **Detect the harness** from the running environment. Codex is the only harness with an
   established rename path today. On any other harness, say plainly that no path is established,
   that runs therefore keep suggesting a title, and end this step. Never invent a mechanism, and
   never probe a harness for one.
2. **Print the definition block from `shared/session-rename.md` verbatim.** That fragment carries the
   complete `Stop` handler in both spellings; print the one the user prefers, or both, and replace
   `<skill-root>` with the absolute path of the installed skill first, because a hook resolves no
   placeholder. Name the file to paste it into — `~/.codex/hooks.json` or `~/.codex/config.toml`, or
   the repository-local counterpart — and say that every matching layer loads, so an existing hook
   file gains the `Stop` entry rather than being replaced. Do not open or write either file here.
3. **State the trust gate before the user pastes.** This is the step whose omission turns the hook
   into a permanent silent no-op, so state it plainly: a pasted hook does **not** run until it has
   been reviewed and trusted once, in whichever Codex client the user runs, and any later edit of
   the hook text marks it changed and skips it again until it is reviewed a second time. Name the
   route for the detected client rather than one route for everybody: in the CLI the `/hooks`
   command lists the sources and performs the review; the desktop app records hook trust through its
   own interface instead, so direct the user there and do not send them to a slash command their
   client may not have. Where the client is unclear, say only that the review happens once inside
   the client and that an edit re-gates it. An installation that permits managed hooks only
   (`allow_managed_hooks_only`) suppresses user, project and plugin hooks entirely; there the path
   is unavailable by policy, and this step says so instead of leaving the user to debug a hook that
   never fires.
4. **Probe with a real rename, not a claim.** Once the user confirms the hook is pasted and trusted,
   request the literal probe title `Effective Flow setup check` for the live session through the
   shipped script, exactly as that fragment specifies the call. Say beforehand that this deliberately
   renames the session once — the rename **is** the observable proof — and that the user renames it
   back or lets the next run retitle it. Report the concrete envelope, or its exact structured error.
   The probe writes one rename request below `.effective-flow/` through the script, so apply the
   loaded “Runtime-state write safety” contract from `RUNTIME_STATE_ROOT` to that exact target
   immediately beforehand and run nothing when the guard blocks. Never report a probe that did not
   run.
5. **Let the hook's own receipt close the loop.** A fresh installation has no receipt yet, so this
   first call reports the path as undeterminable even where the hook is installed perfectly — say so,
   and do not present it as a failure. The hook consumes the pending request when the turn ends and
   leaves a receipt beside it, so repeat the call in the following turn, which the user's own
   confirmation already creates. A receipt observed there is first-hand evidence that the hook really
   fired: report its observed timestamp and that the path is live. If the path is still not live,
   report the concrete reason the script returned and have the user check the session title before
   treating the hook as broken — a title now reading `Effective Flow setup check` proves the hook
   fired whatever the probe concluded. That second call is what turns a printed definition into an
   observed one; never claim a success nobody observed.

### Step 8: Summary

Report to the user:

- whether the `.gitignore` line `.effective-flow/` was added, a former two-line pattern (`.effective-flow/*` plus `!.effective-flow/config.json`) or an old `.firmo/`/`.sf-plugin/` line was migrated to it, or the target state was already established
- which path was chosen (Express or Guided) and whether advanced settings were adjusted
- the central behavior values (`worktree.enabled` [default `true`], `delivery.completion`
  [default `merge`] including, if applicable, `delivery.baseBranch`/`delivery.returnBranch`,
  `delivery.prReview` [default `ask`],
  `language.project` and all explicit `language.*` overrides, `tracker.mode`, and, if applicable,
  `tracker.remoteToolOverride` or `tracker.externalTool` plus `tracker.externalToolHint`) as well
  as `plan.dir` and `concept.dir`, if set or changed from the default
- if set or changed from the default: the merge-gate values `mergeGate.completion`,
  `mergeGate.requireAllChecks`, `mergeGate.checkWaitMinutes`, `mergeGate.maxRounds`,
  `mergeGate.botWaitMinutes`, `mergeGate.bots` with the trigger text and, where set, the check
  context recorded per login, and `delivery.mergeMethod`. Name the gate keys separately from
  `delivery.prReview` so the two are not read as one setting
- whether two `mergeGate.bots` entries were collapsed into one reviewer: which login was kept, which
  redundant list member and rows were removed, and, for every key the two disagreed about, both
  recorded values and the one the user chose
- whether a legacy `prReview.*` merge-gate block was rewritten in place: which rows were carried
  over to `mergeGate.*`, that the old rows were removed, and every shadowed legacy value that was
  discarded because a `mergeGate.*` row already held a different one
- for `tracker.mode = external`: both new values verbatim, plus the note that the connection is
  selected at run time from the hint and that a missing, ambiguous, or under-capable connection
  aborts the run instead of falling back to the forge
- whether `plan.markerLanguage` or a consistent existing plan corpus was proposed/migrated to
  `language.workflow`, including the visible semantic change and whether the legacy row was removed
- for a previously existing config: which keys were changed from the old state (before/after)
- the path of the written project setup ADR and the location of the set `**Effective Flow project setup:**` marker (`AGENTS.md`/`CLAUDE.md`)
- for the capability step of Step 7: the detected harness, whether a definition was printed, whether
  the verification ran and with which concrete result, whether a receipt in the following turn
  confirmed the hook really fired or which reason it reported instead, and that no file above the
  repository root and no configuration key was changed by it
- in the migration case: identify the exact `<source-handle>` selected by the locator and whether
  both runtime-directory and config migration completed. For a completed migration, report
  whether `<source-path>` was **removed
  staged** via `git rm --cached` (content left on disk) or was already untracked. For an incomplete
  migration, report the failed step and rollback outcome and do not call the source migrated.
  Never name the unselected fallback as processed. State that no commit was created and that the
  user handles any cleanup themselves

## Rules

- Change only `.gitignore` (the `.effective-flow/` line or its migration), the project setup ADR,
  the `**Effective Flow project setup:**` marker in `AGENTS.md`/`CLAUDE.md`, and—only when the
  locator selected a transitional config—the runtime targets written by the shared
  runtime-directory migration; no further setup steps like deployment or Git hooks.
- The capability step of Step 7 **prints**. It writes no file above the repository root, edits no
  harness configuration, and adds no configuration key. Its probe writes one rename request below
  `.effective-flow/` through the shipped script under the loaded write-safety contract, and the
  installed hook leaves its own receipt beside it; both are runtime state, not configuration. The
  probe renames the current session once, with the user's go-ahead and its own fixed probe title.
- Never overwrite existing config values and unknown keys without asking.
- On an abort during the questions, leave no half-written ADR; write only once at the end.
- Do not start project validation; linting, tests, and build checks are the job of other skills such as `{{AGENT:code-validator}}`.
- Do not create commits; committing is done by the user or `{{SKILL:commit}}`. Untracking an old `config.json` only stages an index change (`git rm --cached`) without committing.
- Do not process or store any secrets; the configuration contains only behavior defaults.
