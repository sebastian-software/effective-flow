## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with that contract as the worker instructions. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

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

## Language resolution

Effective Flow resolves the language of persisted, human-readable content by **target surface**.
The project setup ADR may contain these stable keys; each value is `de` or `en`:

| Key                                | Surface                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `language.project`                 | Fallback for every surface; default `en`                                    |
| `language.source`                  | Comments, test descriptions, and in-code documentation                      |
| `language.documentation.user`      | Root README, marketing entry point, and user documentation                  |
| `language.documentation.technical` | Developer/API documentation, operations documentation, runbooks, and ADRs   |
| `language.workflow`                | Plans, plan reviews, local review reports, and investigation reports        |
| `language.forge`                   | Issues, PR bodies, issue/PR comments, and remote review replies             |
| `language.git`                     | Commit descriptions, Conventional Commit PR titles, changelog/release prose |

Identifiers, public API names, config keys, encoded values, schemas, paths, label names, HTML
markers, finding IDs, action values, Conventional Commit types, and branch slugs are not
localized. Product UI/CLI/error text follows the target project's product-i18n rules and is not
controlled by this configuration. Exact quotations and incoming third-party text are not
translated unless explicitly requested.

### Resolver (the single precedence rule)

For each artifact, determine its target surface first and resolve exactly once:

1. An explicit user language request for that artifact wins.
2. When editing an existing artifact, preserve its clearly recognizable language unless the user
   requests translation. If it is mixed or unclear, clarify before changing human-readable prose.
3. For a new artifact, use the valid surface-specific `language.*` override.
4. Otherwise use a valid `language.project`.
5. Otherwise use `en`.

Only `de` and `en` are valid. An invalid value has no special meaning: report the affected key,
ignore it, and continue with the next fallback. A missing override means inheritance; `null` is
not a language value. Interactive, non-persisted replies follow the user's current language,
using `language.project` only if the conversation language is not recognizable.

At overlap boundaries, the publication destination decides: local review prose uses
`language.workflow`, remote review prose uses `language.forge`, commit prose uses `language.git`.
A PR title that is a Conventional Commit subject uses `language.git`; its body and all comments
use `language.forge`.

An orchestrating tool resolves every required surface once per run and passes the concrete
`de`/`en` values to delegated agents. Agents must use that supplied language context and must not
independently re-read the project setup ADR. A directly invoked agent or standalone tool with no
orchestrator resolves the required values itself using this same rule.

### Transitional workflow fallback (read compatibility only)

When no valid `language.workflow` and no valid `language.project` exist, a legacy
`plan.markerLanguage = de|en` may temporarily supply `language.workflow`; report that the old
marker setting now controls the **whole workflow artifact** and point to `effective-flow setup`.
Writers never create `plan.markerLanguage`.

If no `language.*` or legacy marker key exists, an unconfigured project may temporarily derive
`language.workflow` from its existing plan corpus only when the plan prose, canonical fields,
and status marker consistently and unambiguously use one language across the corpus. A marker
alone is not evidence. Mixed, contradictory, empty, or unclear corpora supply no signal and fall
through to `en`; report the setup recommendation. This fallback is read-only compatibility and
does not authorize rewriting existing plans.

### Complete artifact consistency

One persisted artifact uses one language for all human-readable prose, including its headings,
field labels, displayed status values, review sections, and open-point sections. Readers accept
the documented complete German and English forms; writers never mix them. An explicit translation
changes the complete artifact, not only one marker or heading.

### Typography

Map `de` to `de-DE` and `en` to `en-US`. Locale-specific typography of visible prose — quotation
marks, dashes, umlauts and ß, non-breaking spaces, number and date formats — is owned by the
central `locale-typography` skill. Its locale guidance is authoritative; Effective Flow keeps no
second typography checklist.

If the skill is unavailable (not installed, `skills.enabled: false`, or disabled via `exclude`),
use only this minimal fallback for German prose: real umlauts and ß rather than ASCII
transliterations, German quotation marks „…“, and a spaced en dash – for parenthetical dashes.
Do not alter code, identifiers, commands, paths, or machine-readable values for typography.

## Task tracking

When there are several tasks to complete, use an available TODO or task-tracking tool (e.g. `TaskCreate`/`TaskUpdate`, `TodoWrite`, or a comparable tool) to create a task list. Set each task to "in progress" before starting it and to "done" after completing it.

If no task tool is available, give the user a short progress update after each completed step instead.

### When to use

- with three or more subtasks or steps
- with complex tasks that have multiple phases
- when the user names several tasks at once

### When not to use

- with a single, trivial task
- when the task is done in fewer than three simple steps

**Load on demand:** Read `shared/runtime-state-safety.md`, when setup has repaired and validated the runtime ignore state and is about to write a runtime marker.

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when the config locator selected a transitional JSON source and setup has repaired and validated the runtime ignore/index state before the config-migration marker.

## Living ADR model

Effective Flow keeps architecture decisions (ADRs) as **living documents**: mutable
Markdown files that always carry the currently valid state of a decision. There is
no numbering and no supersede chain; the current file is the truth. This
building block is the authoritative convention for all ADRs **produced by Effective Flow**.

### Form and location

- **Location:** ADRs live in the project's detected ADR directory, default `docs/adr/`.
- **File name:** numberless, kebab-case slug — `docs/adr/<slug>.md` (e.g.
  `docs/adr/effective-flow-project-setup.md`).
- **Title:** an H1 with the descriptive title — `# <Title>` (no `NNNN` prefix).
- **Language:** a new ADR uses `language.documentation.technical` resolved through the shared
  language rule. An existing ADR keeps its clearly recognizable language unless translation was
  requested. Human-readable headings and values use one language consistently; slugs, paths,
  config keys, references, and other machine-stable tokens are unchanged.
- **Status:** a `## Status` section holds the current state. English values are `Active`,
  `Superseded`, `Not implemented`; German values are `Aktiv`, `Abgelöst`, `Nicht umgesetzt`.
  Both complete forms remain readable.
- **Mutability:** an existing ADR is updated **in place** when the decision changes
  (content and `## Status`), not duplicated or replaced by a successor record.
- **Concurrency:** read the file fresh immediately before writing.

### Referencing

References to ADRs use the **slug or title**, not a number, e.g.
`(ADR: <slug>)`. Slug references stay stable across content changes.

### Backward read compatibility for numbered legacy ADRs

Existing numbered legacy ADRs (`NNNN-*.md`, H1 `# NNNN — Title`) remain **readable and
resolvable by number**. There is **no** mandatory bulk rename; legacy ADRs are not
touched. New ADRs are created exclusively in the living slug format. This mirrors Effective Flow's
established compatibility line (plan numbers via H1, `firmo-`/`effective-flow-` labels).

### Relationship to the `decision-records` skill (declared convention + fallback)

The living slug model described above is the **declared ADR convention of this
repo**. The host skill `decision-records` is the domain owner for ADR craft (whether a
decision is even ADR-worthy, lifecycle, supersession, index); its first
operating rule is to **discover the existing repo convention and follow it**, rather than
enforcing its own. This very building block is that convention — so the skill authors
Effective Flow ADRs in the living slug format (location/file name/title/status/mutability as
above), not in an immutably numbered one.

The layered contract therefore applies (see `skill-discovery.md`):

- **`decision-records` is authoritative when present.** The skill decides **whether** a finding
  is a durable decision and — if so — authors it according to the convention declared here.
  If the target repo declares its **own** ADR convention (different directory,
  title/status format, index), the skill follows that; the living slug model is only the
  default when the repo declares nothing else.
- **Minimal fallback when the skill is absent.** If `decision-records` is unavailable (not
  installed, `skills.enabled: false`, or disabled via `exclude`), the
  calling tool itself authors according to the **minimal fallback structure**
  below — **no** silent invention of a second convention.

Earlier versions of this building block described the slug model as a **deliberate divergence**
from an allegedly immutable/numbered `decision-records` skill. That premise is
outdated: `decision-records` now supports a declared living/mutable model (opt-in)
and follows the repo convention anyway. The living slug model is therefore no longer a
divergence but the declared convention the skill follows.

**Coexistence.** Where a project prefers to run a different ADR model, it declares that
convention in the target repo (the skill follows it) or toggles `decision-records` deliberately via the
`skills` config (`include`/`exclude`, also per-agent/-tool) on or off.

### Minimal fallback structure (only without `decision-records`)

A short core structure so that a calling tool can record a rejected decision as a living
slug ADR even without the skill — **not** a second full ADR handbook. Location
and form as under "Form and location"; read the file fresh before writing and update a
thematically fitting existing ADR in place instead of duplicating:

```markdown
# [Title of the decision]

## Status

Not implemented

## Context

[Origin: review report + finding ID, or issue/epic number in remote mode]

## Decision

[Short rationale for why it is not implemented]

## Rationale

[Full developer note or `wontfix` rationale]

## Source finding

[Finding ID] from [source]: [short version of the problem]  <!-- traceable backlink -->
```

Only **durable** decisions are recorded this way; a pure delivery rejection without a
durable architectural effect stays in the review report or tracker artifact and is not forced into
an ADR.

## Effective Flow configuration (project setup ADR)

The tracked truth for the Effective Flow configuration is a living ADR "Effective
Flow project setup" (default slug `effective-flow-project-setup`, see fragment "Living
ADR model"). It carries the config parameters with minimal prose as a **Markdown table**. There
is **no** `.effective-flow/config.json` as a config source anymore; `.effective-flow/` is a
pure runtime directory (`memory.json`, `cache.json`, `review/`, `.worktrees/`) and is
completely gitignored.

### Config locator (resolution order)

When reading the configuration, the project setup ADR is resolved in this order; the
first matching step wins:

1. **AGENTS.md marker.** The canonical line `**Effective Flow project setup:** <path>` in
   `AGENTS.md`, otherwise in `CLAUDE.md` or a comparable convention file → read the ADR
   under `<path>`. **Backcompat (one generation):** a still-present legacy marker
   `**Firmo project setup:** <path>` is recognized as equivalent on read; effective-flow setup
   converts it non-destructively to the new spelling on the next run. If the
   marker points to a path under which **no** ADR lives (dead/stale marker), do not stay
   there, but fall through in this order and report the stale marker
   (correction in effective-flow setup).
2. **Default path/scan.** Otherwise `docs/adr/effective-flow-project-setup.md` (the legacy slug
   `firmo-project-setup` is recognized as equivalent during the scan) or a scan of the detected
   ADR directory (`docs/adr/`, `docs/decisions/`, `adr/`) for the project setup ADR.
3. **Transitional compatibility.** Otherwise — only transitionally — establish or reuse the
   verified execution-location receipt and resolve the fallback from `RUNTIME_STATE_ROOT`: read
   a still-present absolute `<RUNTIME_STATE_ROOT>/.effective-flow/config.json` handle (otherwise
   `<RUNTIME_STATE_ROOT>/.firmo/config.json`) and point to effective-flow setup. Never inspect a
   same-named fallback below a linked `EXECUTION_ROOT`. A missing, bare, moved, unsafe, or
   repository-mismatched runtime root blocks the fallback. This read path creates **nothing**
   and touches **no** Git.
4. **Built-in defaults.** Otherwise use the defaults of the respective source skills.

The deterministic read path of any tool is non-blocking: It reads the ADR (or
the transitional fallback), but itself creates no file and mutates no Git. Creating
the ADR, the markers and the migration happen exclusively in the Git-touching path of
effective-flow setup.

### Table encoding (binding for writers and readers)

The config parameters stand as a flat Markdown table with two columns. Readers bootstrap before
they know the configured language by accepting both canonical envelopes: English
`## Configuration` with `| Key | Value |`, and German `## Konfiguration` with
`| Schlüssel | Wert |`. They likewise recognize `## Context`/`## Kontext`, `## Status`,
`Active`/`Aktiv` and `Superseded`/`Abgelöst`. The former German empty-list token `(leer)` is
accepted on legacy reads only. Config keys and newly written encoded values remain identical and
English in both envelopes, including `(empty)`. Writers (effective-flow setup, migration) and readers
(all tools) interpret values identically. A normal update preserves the existing ADR envelope
language; changing `language.documentation.technical` does not translate an existing ADR.

- **Boolean** → `true` / `false`.
- **String** → literal, unquoted (e.g. `focused`, `origin/main`).
- **`null`** (semantically "ask at run time", e.g. `applyReview.defaultCommitStrategy`) →
  the literal token `null`.
- **Empty list** → `(empty)`.
- **Filled list** → comma-separated (e.g. `humanizer, distill`).
- **Nesting** → dotted keys (e.g. `applyReview.worktree.baseDir`,
  `skills.agents.ui-implementer.include`); an empty object has no sub-lines.
- **Missing line = key not set → default of the source skill.** Deliberately
  different from a present line with value `null` (an explicit value, semantically "ask at
  run time"). Example: no `delivery.completion` line → default `merge`; a
  `delivery.completion | null` line → ask at run time.
- **`delivery.prReview`** → the literal string `ask` (default), `always`, or `off`; it governs the
  automatic PR review publication after a delivery. No `delivery.prReview` line → default `ask`,
  per the rule above.
- **`tracker.externalStartedState`** → a nullable string containing the external connection's stable
  state ID, or its exact accepted token only when that connection exposes no ID. Missing or `null`
  means unset and never authorizes a guessed transition. Readers validate a non-null value against a
  fresh list of writable states in the exact configured tracker context before every implementation
  run; stale, terminal, read-only, cross-context, and display-name-only matches fail closed before
  code. Only `effective-flow setup` writes a confirmed tracker-verified suggestion. The fixed post-merge
  observation grace period has no configuration key.

Reading a single value is a trivial line lookup (line with dotted key →
value cell). Example excerpt (interface sketch, not full content):

```markdown
## Configuration

| Key                         | Value    |
| --------------------------------- | ------- |
| review.profile                    | focused |
| applyReview.defaultCommitStrategy | null    |
| skills.exclude                    | (empty)  |
| worktree.enabled                  | true    |
```

If the table is invalid or ambiguous (missing key, unknown encoding): use a
safe default for the run, inform the user about the affected key,
do **not** guess.

### Merge-gate keys (`mergeGate.*`) and their legacy namespace

effective-flow merge-gate reads the keys below; effective-flow iterate reads the `bots` entries for its
review-in-flight guard. A missing line means the default, per the encoding rule above.

| Key                              | Values                             | Default   |
| -------------------------------- | ---------------------------------- | --------- |
| `mergeGate.completion`           | `ask`, `merge`, `report`           | `ask`     |
| `mergeGate.conflictResolution`   | `off`, `ask`, `auto`               | `auto`    |
| `mergeGate.requireAllChecks`     | `true`, `false`                    | `true`    |
| `mergeGate.checkWaitMinutes`     | positive integer                   | `20`      |
| `mergeGate.maxRounds`            | positive integer                   | `3`       |
| `mergeGate.botWaitMinutes`       | positive integer                   | `10`      |
| `mergeGate.bots`                 | comma list of logins               | `(empty)` |
| `mergeGate.bots.<login>.trigger` | literal trigger comment text       | unset     |
| `mergeGate.bots.<login>.check`   | commit-status or check-run context | unset     |

A login containing brackets (`greptileai[bot]`) is a valid middle segment, because the encoding
splits on `.` only.

**`mergeGate.conflictResolution` is new and has no `prReview.*` predecessor.** It never existed under
the legacy namespace, so the per-key fallback below finds nothing for it: a project that carries only
a legacy block gets the default `auto`, and there is no `prReview.conflictResolution` row to read,
migrate, or report as shadowed. `auto` resolves a conflict with the base through
effective-flow merge-gate's dedicated worker, `ask` asks once **per conflicted round** in a gated run —
once per conflict rather than once per run, deliberately unlike `mergeGate.completion`'s
once-per-run entry gate, because each round's conflict is a new one against a base that moved — and
behaves as `off` in a non-interactive delegated one, and `off` reports the conflict and makes no
commit and no push. That last claim is about the branch: the gate provisions its checkout before it
reads this key, and cleans it up on the same stop path.

**An unreadable or invalid `mergeGate.conflictResolution` resolves to `off`, not to `auto`.** The
general rule above says to use a safe default for the run; for every other key in this block the safe
default and the documented default are the same value, and for this one they are not — an
unparseable line must never authorize a commit and a push. Report the affected key as that rule
requires and continue with `off`.

**Backcompat (one generation):** these keys were formerly named `prReview.*`. Where a
`mergeGate.<key>` line is absent, read `prReview.<key>` and use its value; report **once per run**
that the legacy namespace was read and that effective-flow setup migrates it. Precedence is per key: a
present `mergeGate.<key>` always wins over a present `prReview.<key>`, and the two namespaces are
never merged at a finer grain than the individual key. Reading is all this fallback does — only
effective-flow setup writes configuration, and it rewrites a legacy block in place (carry the values
over, remove the old rows, report a shadowed key). Once every project has run effective-flow setup once,
the fallback has no remaining reader and is removable rather than load-bearing.

**`delivery.prReview` is not part of this block** and is never migrated: it decides whether a run
publishes **its own review findings** onto a pull request it created (see the encoding rule above),
while `mergeGate.*` configures the gate that takes an **existing** pull request from open to merged.

### Language configuration and compatibility migration

The supported language keys and their surface mapping live only in the shared "Language
resolution" fragment. This configuration contract accepts `language.project`,
`language.source`, `language.documentation.user`, `language.documentation.technical`,
`language.workflow`, `language.forge`, and `language.git`; every value is `de` or `en`.
Missing overrides inherit `language.project`, and a missing project language resolves to `en`.
Invalid values are ignored with a diagnostic and never guessed.

`plan.markerLanguage` is a legacy read/migration key, not part of the current schema. If
`language.workflow` is absent, effective-flow setup may propose migrating a valid legacy `de`/`en`
value to `language.workflow`; an existing `language.workflow` always wins. Show explicitly that
the old marker-only setting becomes the language of the complete workflow artifact. Apply the
addition and removal only in the confirmed before/after write step. Preserve the legacy key if
the write is not confirmed, and never emit it in a new configuration.

If neither language keys nor the legacy key exist, effective-flow setup may propose the read-only
plan-corpus fallback defined by "Language resolution" as `language.workflow`, but only when
prose, fields, and markers consistently identify one language. Mixed, contradictory, or empty
plan sets are not migrated. This compatibility path must be reported and confirmed like every
other config change.

<!-- runtime-state-safety: setup-repair-only:start -->

### One-time migration legacy `config.json` → project setup ADR

The migration of an existing `.effective-flow/config.json` or legacy `.firmo/config.json`
into the project setup ADR is **Git-touching** and runs exclusively in the
effective-flow setup path. It produces the ADR table from the current config content (encoding
as above), writes the AGENTS.md marker `**Effective Flow project setup:**`, switches
`.gitignore` to a single `.effective-flow/` and untracks the legacy `config.json`
(`git rm --cached`, leave the file content on disk). The exact procedure including
idempotency marking is in effective-flow setup.

Outside effective-flow setup, **no** migration takes place: The deterministic
read path creates nothing and touches no Git; on a missing ADR it reads instead a
still-present `<RUNTIME_STATE_ROOT>/.effective-flow/config.json` (otherwise
`<RUNTIME_STATE_ROOT>/.firmo/config.json`) and points to effective-flow setup.

<!-- runtime-state-safety: setup-repair-only:end -->

## Project conventions

If the project has an `AGENTS.md`, read it before writing and follow its guidance on configuration, file formats, and project-wide conventions.

## Config schema

The Effective Flow configuration is optional and controls the defaults of the following blocks. Its source of truth is the project setup ADR table (see the building block above for encoding and locator). The respective skills are the authoritative source for valid values and defaults; this skill only summarizes them and must not count as the sole truth when the schema is extended. Unknown keys of an existing config are always preserved.

- **`review`** (source: `effective-flow review`): `profile` (full/focused/fast), `autoConfirmScope` (bool), `designDecisionSources` (full/standard/minimal), `validation` (full/quick/off)
- **`applyReview`** (source: ``tools/apply-review.md``): `defaultCommitStrategy` (worktrees/single/none/`null` = ask at run time), `finalValidation` (full/changedScope/off), `stashPolicy` (interactive/keep/discard/apply), `worktree.baseDir`, `worktree.setup` (auto/none/command)
- **`language`** (source: shared "Language resolution"): `project` and optional `source`,
  `documentation.user`, `documentation.technical`, `workflow`, `forge`, `git` overrides
  (`de`/`en`; a missing override inherits `language.project`, whose default is `en`)
- **`plan`** (source: `effective-flow plan`): `dir` (string, default `docs/plan`) — directory of the plan files
- **`delivery`** (source: `effective-flow build`, section "Delivery and worktree integration" – likewise embedded in the other code-changing workflows): delivery is implied by worktree/branch (no separate `enabled` switch anymore) — `baseBranch` (default `origin/main`), `branchPrefix` (default `effective-flow`), `completion` (pr/merge/branch, default `merge`), `returnBranch` (auto or local branch name), `prReview` (ask/always/off, default `ask` — automatic PR review publication after a delivery), `mergeMethod` (squash/merge/rebase, default `squash` — how a pull request is integrated when `effective-flow merge-gate` merges it)
- **`mergeGate`** (source: `effective-flow merge-gate`): `completion` (ask/merge/report, default `ask` — may a gate run merge at the end or only report merge-readiness), `conflictResolution` (off/ask/auto, default `auto` — may a gate run resolve a conflict between the head branch and its base, verify the result, and push the merge commit), `requireAllChecks` (bool, default `true`), `checkWaitMinutes` (positive integer, default `20`), `maxRounds` (positive integer, default `3`), `botWaitMinutes` (positive integer, default `10`), `bots` (comma list of automatic-reviewer logins, default empty), `bots.<login>.trigger` (the literal trigger comment text for one bot, unset by default), `bots.<login>.check` (the commit-status or check-run context that proves whether that bot has run, unset by default). This block was named `prReview.*` in an earlier generation; the legacy names are still read, and this skill migrates a legacy block in place (Step 6). **Not** the same thing as `delivery.prReview`: that key decides whether a run publishes **its own findings** onto a pull request it created and keeps its name, while `mergeGate.*` configures the merge gate.
- **`worktree`** (source: `effective-flow build`, section "Delivery and worktree integration"): `enabled` (bool, default `true`), `setup` (auto/none/command), `baseDir`
- **`tracker`** (source: `effective-flow review`, section "Issue-tracker integration" – likewise embedded in ``tools/apply-review.md`` and the other tracker workflows): `mode` (local/remote/external, default `local`), `remoteToolOverride` (auto/github/forgejo, default `auto`, forge only), `externalTool` (short identifier of the tool holding the issues, no whitelist, required for `mode: external`), `externalToolHint` (free text: MCP server name, workspace, team/project key, identifier convention, state names), `externalStartedState` (nullable stable native state ID, or exact accepted token only when the connection exposes no ID; freshly tracker-verified before persistence)
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
so Express writes no row for them and an unconfigured project gets the gate's own defaults:
`completion: ask`, every check green, no automatic reviewer expected — and
`conflictResolution: auto`, which authorizes a gate run to resolve a conflict between the head
branch and its base and to push the resulting merge commit. That last one is the only default here
that writes, and it is what changes behavior for a project upgrading from an earlier generation.

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
   search globs of `effective-flow review`): `docs/adr/`, `docs/decisions/`, `adr/`. Use an
   existing directory. If none exists, the default is `docs/adr/`. If
   **several** exist, prefer `docs/adr/` for the project setup ADR; ask only on genuine
   ambiguity in the guided path:

If several ADR directories exist and none is clearly `docs/adr/`: Ask the user: **In which directory should the Effective Flow project setup ADR live?**
- docs/adr/ -- Recommended default for the project setup ADR
- docs/decisions/ -- Use an existing directory
- adr/ -- Use an existing directory

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

Ask the user: **How would you like to set up the Effective Flow configuration?**
- Express -- Adopt safe defaults (keep the current values of an existing config) — one confirmation step, then done
- Guided -- Step by step through the options — each is explained, ideal if you do not yet know Effective Flow

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

Ask the user: **Should the implementation run in a separate Git worktree?**
- Yes -- worktree.enabled = true (default) — the implementation runs in a separate worktree with its own delivery branch
- No -- worktree.enabled = false — in-place without a worktree; delivery branches are created in the main repo when needed

**Completion action.** Explain: how finished changes are brought in. `merge` brings them
directly into the target branch, `pr` opens a pull request (review before integration), `branch`
just leaves the branch; "ask at run time" decides anew each time.

Ask the user: **Which completion action should Effective Flow use by default?**
- Merge -- delivery.completion = merge (default) — merge the branch locally into the base branch, without a PR
- Pull request -- delivery.completion = pr
- Branch only -- delivery.completion = branch
- Ask at run time -- delivery.completion = null — the action is asked per run

Briefly explain the base branch (the branch that is delivered into) and ask for it as free text
(`delivery.baseBranch`, default `origin/main`); the switch-back target (`delivery.returnBranch`,
default `auto`) only optionally.

**PR review.** Explain: when a run creates a pull request, Effective Flow can post that run's
review findings on it as comments. "Ask each time" decides per run, "Always" posts without asking,
"Never" switches the automatic step off; an explicit `effective-flow review <PR>` stays available in
every case.

Ask the user: **Should Effective Flow post its review findings on a pull request it created?**
- Ask each time -- delivery.prReview = ask (default) — a gated run asks once per delivery
- Always -- delivery.prReview = always — post the findings without asking
- Never -- delivery.prReview = off — no automatic posting; an explicit review of a PR is unaffected

**Project and surface languages.** Explain: the project language is the fallback for every new
human-readable artifact, while optional surface overrides let source prose, documentation,
workflow artifacts, Forge communication, and Git history differ. A plan is entirely in the
workflow language, including its status marker. Only `de` and `en` are supported; German maps to
`de-DE` typography and English to `en-US`.

Ask the user: **Which default language should Effective Flow use for this project?**
- English -- language.project = en (default)
- German -- language.project = de

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

Ask the user: **Where should issue work live: locally as a Markdown report, remotely as issues (GitHub/Forgejo), or in an external tool?**
- Local -- tracker.mode = local (default) — Markdown report under .effective-flow/review/
- Remote -- tracker.mode = remote — findings as issues, tool automatically from origin (gh/tea)
- External tool -- tracker.mode = external — issues live in the project-management tool named by tracker.externalTool

For "Remote", ask for the tool override only if needed: the default `tracker.remoteToolOverride = auto` lets the shipped remote helper classify exact `github.com` origins and hosts that match a configured Forgejo `tea` login. Any other host returns `AMBIGUOUS_HOST` instead of guessing; then capture `github` or `forgejo` as free text. Otherwise leave `auto`.

For "External tool", ask the connection follow-ups and explain each before asking:

1. `tracker.externalTool` – the short, stable identifier of the tool that holds the issues. It is
   required for this mode, there is no list of supported tools, and Effective Flow derives no
   capability from the name. Without a value the mode stays unusable, so ask again instead of
   writing an empty entry.
2. `tracker.externalToolHint` – optional free text that lets a run find the right connection at
   run time: MCP server name, workspace, team or project key, the tool's identifier convention, and
   the names of its states. Explain that a precise hint is what prevents an ambiguous-connection
   abort when several candidates exist.
3. Discover exactly one configured connection from those values and list its writable native
   workflow states **fresh in the selected workspace/team/project context** before proposing
   `tracker.externalStartedState`. Show every candidate's display name and stable ID, or exact
   accepted token only when no ID exists. Validate an existing value by stable value, context,
   normalized `started` category, writability, and non-terminal state. If it is valid, keep it. If it
   is absent and exactly one candidate is normalized as `started`, propose that candidate's display
   name and stable value. With zero or multiple candidates, an unavailable/ambiguous connection, or a
   stale/read-only/terminal/cross-context configured value, propose no favorite and leave the value
   `null`; report that issue-backed implementation will fail closed until setup can verify one.
   Persist the suggestion only in the confirmed Step 6 write. Never infer a state from the tool name
   or a familiar display name.

`tracker.remoteToolOverride` stays a forge setting and is not asked for in this mode. Keep an
already recorded `externalTool`/`externalToolHint`/`externalStartedState` when the mode is `local` or
`remote`: they document intent, are preserved unchanged, and are simply ignored for routing.

### Step 5: Advanced settings (optional gate, guided path only)

The core switches suffice for everyday use. All remaining options are needed less often; therefore
first ask whether the user wants to adjust them at all:

Ask the user: **Would you like to adjust advanced settings (review, apply-review, paths, fine details)?**
- No -- Keep safe defaults or existing values — recommended if you are still getting to know Effective Flow
- Yes -- Go through the remaining options one by one, each explained

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
7. `tracker`: `tracker.mode` (already asked in Step 4 — carry over), `tracker.remoteToolOverride` (auto/github/forgejo, forge only), `tracker.externalTool` and `tracker.externalToolHint` (free text; required identifier plus optional connection hint for `mode: external`, carried over when already asked in Step 4), and the freshly verified nullable `tracker.externalStartedState`. Re-run state discovery before changing the latter; never accept arbitrary free text or a display-name-only match.
8. `skills`: `skills.enabled` (bool), `skills.include`/`skills.exclude` (global lists) as well as – as an advanced option – `skills.agents.<name>` and `skills.tools.<name>` for individual agents/tools. Additionally offer optionally (do not force) to materialize the built-in per-agent and per-tool recommendations visibly into the config as `skills.agents.<name>.include` or `skills.tools.<name>.include`; for a fallback recommendation (`effective-web › impeccable › frontend-design`), write only the **primary** skill (`effective-web`) — the built-in fallback stays active. Flat recommendations (e.g. `locale-typography`) are carried over unchanged.
9. `mergeGate` – the **merge gate** of `effective-flow merge-gate`, asked as its own block: see below.

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
  configured automatic reviewers, refuses to implement or merge while a comment from an account
  that is neither a bot nor the one it runs as is open, and finally merges. If the project still
  carries these keys as `prReview.*`, show the recorded legacy values as the current ones and say
  that Step 6 migrates the block.

Explain first, then ask. The gate is safe without any of these keys, so "keep the defaults" is a
perfectly good answer.

If the user chose the advanced settings and the merge gate block is being asked: Ask the user: **When the merge gate has verified a pull request, may it merge, or should it only report?**
- Ask each time -- mergeGate.completion = ask (default) — a gated run asks once per pull request
- Merge -- mergeGate.completion = merge — merge as soon as every precondition holds
- No merge -- mergeGate.completion = report — the gate still repairs failing checks, answers bot threads, and resolves a conflict with the base by pushing one merge commit; it only never merges the pull request. mergeGate.conflictResolution = off is the switch for a run that makes no commit and no push at all

Then ask for the remaining keys, each with a short explanation, the valid values, and the current
value or default as the pre-selection:

| Key                              | Values                             | Default   |
| -------------------------------- | ---------------------------------- | --------- |
| `mergeGate.completion`           | `ask`, `merge`, `report`           | `ask`     |
| `mergeGate.conflictResolution`   | `off`, `ask`, `auto`               | `auto`    |
| `mergeGate.requireAllChecks`     | `true`, `false`                    | `true`    |
| `mergeGate.checkWaitMinutes`     | positive integer                   | `20`      |
| `mergeGate.maxRounds`            | positive integer                   | `3`       |
| `mergeGate.botWaitMinutes`       | positive integer                   | `10`      |
| `mergeGate.bots`                 | comma list of logins               | `(empty)` |
| `mergeGate.bots.<login>.trigger` | literal trigger comment text       | unset     |
| `mergeGate.bots.<login>.check`   | commit-status or check-run context | unset     |

- `mergeGate.conflictResolution`: what a gate run does when the head branch conflicts with its base.
  `auto` (the default) has the conflict resolved by the gate's dedicated worker, the result verified
  independently, and one ordinary merge commit pushed — the branch moves forward instead of the run
  ending at the conflict. `off` reports the conflict and makes no commit and no push, which is
  exactly the outcome the gate produced on the branch before this key existed — it still provisions
  and cleans up a local checkout. `ask` asks once **per conflicted round** in a gated run — once per
  conflict, not once per run as `mergeGate.completion` does, because each round's conflict is a new
  one — and behaves as `off` in a non-interactive delegated one. Say when asking that the default
  **changes** behavior for
  a project upgrading from an earlier generation, and that `off` restores the previous behavior
  exactly. This key is new: it never existed as `prReview.conflictResolution`, so there is no legacy
  row to carry over for it.
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
  `@greptileai`, not generic prose such as `please review`, because the literal string does two jobs.
  It has to actually summon that reviewer — generic prose mentions nobody and the round then waits
  for output no one requested. And the gate suppresses a duplicate trigger by comparing this exact
  text, trimmed, against the comments its own account already left on the current head; in manual
  mode that account is the operator's own, so a phrase the operator might type by hand reads as a
  trigger already posted and the reviewer is waited for instead of summoned.
- `mergeGate.bots.<login>.check`: free text, the commit-status context or check-run name that this
  reviewer publishes against a head commit (e.g. `recensor/review`). Ask for it once per **reviewer**
  as well, directly after that reviewer's trigger text, and offer "not set" as the answer —
  it is optional and unset by default. Explain what it buys: with a check context the gate and
  `effective-flow iterate` can tell a reviewer that is **still running** from one that has **not started**,
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

If two collapsing `mergeGate.bots` entries carry different recorded values for the same key: Ask the user: **These two entries are one reviewer and recorded different values for this key. Which value should the single entry keep?**
- First value -- Keep the value recorded under the first of the two collapsing spellings, verbatim
- Second value -- Keep the value recorded under the second spelling, verbatim
- Neither -- Neither recorded value is right; capture the replacement as free text

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

This skill is the **only** writer of the configuration. A `effective-flow merge-gate` or
`effective-flow iterate` run that resolves a value through the legacy namespace reports that once and
points here; it never rewrites the ADR itself.

### Step 7: Session rename capability (optional)

Hosts derive a session title from the first message, so a run is listed under a name that predates
its subject. Where the running harness has an established rename path, Effective Flow applies the
better title itself instead of suggesting it; where it has none, every run keeps printing a
suggestion the user applies by hand. The ChatGPT Desktop Codex tab exposes its path directly and
needs no installation; Claude Code still needs a one-time, per-user butler setup.

This step is **not** part of the configuration. It declares no key, belongs to none of the Step 5
blocks, and adds nothing to the Step 6 write. It explains the detected path and, on Claude Code,
prints what the user pastes; it never opens, edits, or creates a file above the repository root, and
it never touches the user's harness configuration. What the user pastes, and whether they paste it
at all, stays their decision. Its announced side effects outside this repository are the verification
probe's: with the user's go-ahead it renames the current session once, because a rename nobody can
see proves nothing, and on the Claude Code path it sends one message to the user's own butler session.

If the configuration write completed and the run may prepare the harness's session-rename capability: Ask the user: **Should setup check this harness's established session-rename path and prove it once?**
- Yes -- Detect the harness, explain or prepare its path, and prove it once by renaming this session
- No -- Skip only this visible capability check; later runs keep following their host's path

For "No", note that setup skips only this visible check and continue with Step 8. On ChatGPT Desktop,
later eligible runs still attempt the native operation and fall back independently from each call's
result. On Claude Code, setup neither prepares nor verifies a butler; without an already working
butler, later runs keep emitting the suggestion line. For "Yes", **detect the harness** from the
running environment first. Two harnesses have an established rename path today: the **ChatGPT
Desktop Codex tab** exposes a native current-task operation, while **Claude Code** mandates a second
session as a rename butler. Follow that harness's path below and no other. Codex CLI has no automatic
path in this scope. On any other harness, say plainly that no path is established, that runs therefore
keep suggesting a title, and end this step. Never invent a mechanism, and never probe a harness for
one.

#### ChatGPT Desktop, Codex tab: the native capability needs no installation

1. **Explain the direct path.** The app already exposes its current-task title operation, currently
   `codex_app__set_thread_title`; there is no hook, trust review, file or one-time configuration to
   install. Ordinary Effective Flow runs use it directly when their subject is fixed.
2. **Name the precise stale-hook cleanup without performing it.** A user who followed the former
   setup may still have a `Stop` handler whose command invokes `session-title.mjs apply` in
   `~/.codex/hooks.json`, `~/.codex/config.toml`, or a repository-local counterpart. Tell them to
   remove only that matching handler themselves, preserving unrelated handlers and the containing
   file. Never open, edit or delete their harness configuration here.
3. **Probe with a real rename, not a claim.** Say beforehand that this deliberately renames the
   current session once and that the user may rename it back or let the next run retitle it. Then
   call the native operation once with only the literal title `Effective Flow setup check`; omit
   `threadId`, never list or resolve tasks, and never retry. Report the concrete result. A successful
   call proves the path for this run; an absent, denied or failed operation means only that this setup
   probe failed. Later eligible runs still attempt the operation and fall back independently from
   each call's result. Never report a probe that did not run or claim more than the host reported.

#### Claude Code: the butler session the user mandates

1. **Print the marker title and the mandate block from `shared/session-rename.md` verbatim.** Read
   `<skill-root>/shared/session-rename.md`, resolving `<skill-root>` to the absolute path of the
   installed skill. That fragment owns both: the literal
   marker title a butler carries, `Effective Flow rename butler`, and the fenced standing-mandate
   block below it. Print both from that file, character for character — never from memory and never
   rephrased, so one wording ships everywhere. If the file cannot be read, say so and print nothing
   rather than reconstructing the text: several of its clauses were put there by a live test, and a
   remembered paraphrase drops them while looking complete. Never shorten it, never replace it with
   your own explanation, and never send it to any session yourself: the user pastes it, because a
   mandate that arrives through the channel it authorizes is not a mandate.
2. **Say what the user does with them.** They open a second Claude Code session, set that session's
   title to the marker title exactly, and paste the mandate into it as its first message. Name the
   two consequences plainly: while a session carries that title it answers rename requests from any
   session that finds it, so the title is the entire capability and nothing else authenticates it;
   and a rename costs the butler one model turn, which is why a small, cheap model is the sensible
   choice for that session.
3. **Probe with a real rename, not a claim.** Once the user confirms the butler is set up, list the
   sessions and report what the lookup found before acting on it: no session carrying the marker
   title, several of them, or exactly one. Only for exactly one, send it this session's own id
   together with the literal probe title `Effective Flow setup check`, in the request shape the same
   `<skill-root>/shared/session-rename.md` defines — read it there rather than assembling the message
   from memory. Say beforehand that this deliberately renames the session once — the rename
   **is** the observable proof — and that the user renames it back or lets the next run retitle it.
   This path writes no file at all: the request is a cross-session message, so it creates no runtime
   target and invokes no write-safety guard. Never report a probe that did not run.
4. **The reply arrives in the next turn, so close the loop there.** The butler answers as a user turn
   after this one has ended, so this turn reports only that the request was sent — say so instead of
   presenting the silence as a failure. In the following turn, which the user's own confirmation
   already creates, report the reply itself: the title the butler says it observed, verbatim. A
   reported `Effective Flow setup check` is first-hand evidence that the path works end to end. A
   different observed title means the host kept a title the user had set, which is the host working
   as designed rather than a broken setup. No reply at all means the butler is absent, declining, or
   unattended, and runs will keep printing the suggestion line. Report the concrete outcome and never
   claim a success nobody observed.

### Step 8: Summary

Report to the user:

- whether the `.gitignore` line `.effective-flow/` was added, a former two-line pattern (`.effective-flow/*` plus `!.effective-flow/config.json`) or an old `.firmo/`/`.sf-plugin/` line was migrated to it, or the target state was already established
- which path was chosen (Express or Guided) and whether advanced settings were adjusted
- the central behavior values (`worktree.enabled` [default `true`], `delivery.completion`
  [default `merge`] including, if applicable, `delivery.baseBranch`/`delivery.returnBranch`,
  `delivery.prReview` [default `ask`],
  `language.project` and all explicit `language.*` overrides, `tracker.mode`, and, if applicable,
  `tracker.remoteToolOverride` or `tracker.externalTool` plus `tracker.externalToolHint` and the
  verified `tracker.externalStartedState`) as well
  as `plan.dir` and `concept.dir`, if set or changed from the default
- if set or changed from the default: the merge-gate values `mergeGate.completion`,
  `mergeGate.conflictResolution`,
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
- for `tracker.mode = external`: the external tool and hint verbatim, the observed state candidates,
  and the confirmed `tracker.externalStartedState` stable value or `null`, plus the note that the connection is
  selected at run time from the hint and that a missing, ambiguous, or under-capable connection
  aborts the run instead of falling back to the forge
- whether `plan.markerLanguage` or a consistent existing plan corpus was proposed/migrated to
  `language.workflow`, including the visible semantic change and whether the legacy row was removed
- for a previously existing config: which keys were changed from the old state (before/after)
- the path of the written project setup ADR and the location of the set `**Effective Flow project setup:**` marker (`AGENTS.md`/`CLAUDE.md`)
- for the capability step of Step 7: the detected harness, which path it followed, whether the
  Desktop native path was explained or the Claude marker title and mandate were printed, whether the
  verification ran and with which concrete result, whether stale-hook removal guidance was relevant,
  and — on Claude Code — what the following turn added, whether exactly one butler was found and
  which title its reply reported. State that no file above the repository root and no configuration
  key was changed by the step
- in the migration case: identify the exact `<source-handle>` selected by the locator and whether
  both runtime-directory and config migration completed. For a completed migration, report
  whether `<source-path>` was **removed
  staged** via `git rm --cached` (content left on disk) or was already untracked. For an incomplete
  migration, report the failed step and rollback outcome and do not call the source migrated.
  Never name the unselected fallback as processed. State that no commit was created and that the
  user handles any cleanup themselves

Then emit the next-step block per `next-steps` as the last element of the report, but only when this
run left staged changes behind — which happens solely in the `git rm --cached` migration case. A run
with nothing staged matches no row and emits nothing.

## Rules

- Change only `.gitignore` (the `.effective-flow/` line or its migration), the project setup ADR,
  the `**Effective Flow project setup:**` marker in `AGENTS.md`/`CLAUDE.md`, and—only when the
  locator selected a transitional config—the runtime targets written by the shared
  runtime-directory migration; no further setup steps like deployment or Git hooks.
- The capability step of Step 7 writes no file, edits no harness configuration, and adds no
  configuration key. The Desktop path calls the app-native current-task title operation directly;
  the Claude Code path sends a cross-session message. Neither creates a runtime target or invokes a
  write-safety guard. Either probe renames the current session once, with the user's go-ahead and its
  own fixed probe title.
- Never overwrite existing config values and unknown keys without asking.
- On an abort during the questions, leave no half-written ADR; write only once at the end.
- Do not start project validation; linting, tests, and build checks are the job of other skills such as ``effective-flow-code-validator``.
- Do not create commits. Untracking an old `config.json` only stages an index change (`git rm --cached`) without committing; Step 7's next-step block names who commits it.
- Do not process or store any secrets; the configuration contains only behavior defaults.
