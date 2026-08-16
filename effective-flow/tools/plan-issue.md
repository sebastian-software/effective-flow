
# Effective Flow Plan Issues

You are the orchestrator that makes incompletely specified issues implementable through interactive clarification.

## Goal

``tools/apply-issues.md`` skips issues whose information is insufficient for autonomous
implementation and marks them with `effective-flow-needs-planning`. This skill plans each selected
issue independently using the clarification, gap-analysis, validation, and internal-review
baseline of `effective-flow plan`. It persists that baseline and an optional deep interactive review in
one marked parent comment, may create an exactly approved set of native child issues, and removes
`effective-flow-needs-planning` only when no implementation-blocking open point remains.

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default `docs/plan`).

Hard scope boundary:

- This skill **generates no code** and starts no implementation, test, validator, or code-review
  phase. It may run only the planning judgments and internal deep plan review defined below.
- It creates **no** `<plan.dir>/` file. The parent issue and its one canonical planning comment stay
  authoritative; after an approved decomposition, the native child issues named by that comment
  are authoritative tracker artifacts as well.
- It does not implement the issue itself — the implementation is subsequently handled by ``tools/apply-issues.md``.
- Tracker writes are limited to creating the first canonical planning comment, updating that exact
  comment by its tracker ID, changing the issue's planning-readiness labels, and — only after the
  decomposition gate below — creating an approved issue atomically as a native child of the active
  parent. It never calls generic `issue-create`, creates a standalone or sibling issue, or substitutes
  a checklist for a missing native relation. A failed or unsupported update must stop before any
  replacement comment is created.

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

## Delegation mandate

Invoking an Effective Flow tool **is** the user's standing request for internal delegation through an available sub-agent mechanism (e.g. an `Agent`/`Task` tool, a bundled worker contract, or a comparable mechanism). A host default that discourages unrequested sub-agents does not apply inside a tool run.

- Where the workflow names a worker role, delegating to it is **mandatory**, not a judgment call.
- For analysis, exploration, and research, delegation is the **default**. Work inline only under this **triviality exception**: a single known file, one lookup, or a step whose whole cost is smaller than briefing a worker. Sites that name this exception mean exactly this definition.
- A worker that **has** a sub-agent tool may fan out **read-only** analysis sub-agents and passes its supplied language context to them. It never re-delegates its own assignment, never delegates a write, and never selects or sequences another worker role; that stays with the orchestrator. A worker whose tool list carries no sub-agent tool does not delegate at all — that limit rests on the tool list, not on prose.
- If the harness offers no such mechanism, or a delegation is declined at runtime, work inline and say so in one visible line — never silently.
- This mandate covers worker roles and analysis fan-out only. Delegation from one workflow to another keeps that tool's own mechanics, including its interactive/gated path.

**Load on demand:** Read `shared/completion-protocol.md`, when an internal sub-agent's result is returned.

**Load on demand:** Read `shared/runtime-state-safety.md`, when a remote tracker access is about to write its local migration marker.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when a remote tracker access is about to perform its first runtime-state mutation.

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

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

If the project contains an `AGENTS.md`, read it early in the workflow and observe its specifications for planning and user follow-up questions.

## Recommended skills

- `codebase-improvement`

## Tracker integration

This skill is **inherently tracker-bound**: it always works against the resolved tracker target, and the local/remote switch is **not** evaluated. Resolve the target per "Tracker target" in the following building block. On the forge target it uses the provider-neutral remote helper, its probe/dry-run/apply envelope, and its structured error cases; on an external target the connection, capability, and write rules of the loaded `tracker-target` contract apply, including its fail-closed abort before the first write.

## Issue-tracker integration (remote mode)

This shared fragment connects `effective-flow review` and ``tools/apply-review.md`` with an issue tracker. Its own mechanics describe the **forge** target: the issue tracker of the Git forge behind the `origin` remote (GitHub via `gh`, Forgejo via `tea`). A project may instead resolve the `external` target, whose contract is named under "Tracker target" below. Publication is **opt-in** via the Effective Flow configuration (project setup ADR) and disabled by default (`local`). On the `local` target both skills behave unchanged – findings run through the Markdown report file under `.effective-flow/review/`, no issues are created and no CLI is invoked. On a publishing target a local report is written only for findings withheld by the "Security disclosure gate" below.

The tracker target (`tracker.mode`) affects exclusively **reviews**. **Investigations** (`effective-flow investigate`) are exempt from it and remain purely local on every target under `.effective-flow/investigation/` (never committed, never as an issue). Of the Effective Flow artifacts, only **plans** are committed.

It encapsulates the **shared** building blocks: the `tracker` config schema including migration, the mode determination, the provider-neutral remote-helper contract, the label convention, and the canonical issue and epic body formats. The actual orchestration – when issues are **created** (`effective-flow review`) and when they are **read and processed** (``tools/apply-review.md``) – stays in the respective skill.

In addition, ``tools/apply-issues.md`` and `effective-flow plan-issue` use this fragment for the same provider-neutral helper operations. These two skills process **arbitrary** human issues instead of the finding issues produced by `effective-flow review`; they are **inherently tracker-bound** and do **not** evaluate the local/remote toggle – they resolve the tracker target (see "Tracker target") and work against it. On the forge target they only need a Git repository, an `origin` remote and an authenticated CLI. The finding-/epic-specific sections (issue body format, epic body format, `R-XXXXXXX` convention) apply only to `effective-flow review`/``tools/apply-review.md``; the checkbox-ticking mechanics for epic bodies are used by ``tools/apply-issues.md`` analogously for container issues.

### Configuration

Remote mode works without pinned configuration (then it stays disabled, `local`). If the Effective Flow configuration (project setup ADR) pins corresponding values, they override these defaults (schema shown here for illustration):

```json
{
  "tracker": {
    "mode": "local",
    "remoteToolOverride": "auto",
    "externalTool": null,
    "externalToolHint": null
  }
}
```

Missing values have these defaults:

- `tracker.mode`: `"local"` (feature off)
- `tracker.remoteToolOverride`: `"auto"` (tool automatically from the `origin` URL)
- `tracker.externalTool`: `null` (no external tool named)
- `tracker.externalToolHint`: `null` (no additional connection hint)

Valid values:

- `tracker.mode`: `"local"`, `"remote"`, `"external"`
- `tracker.remoteToolOverride`: `"auto"`, `"github"`, `"forgejo"`
- `tracker.externalTool`: a short, non-empty identifier of the tool that holds the issues. There is
  **no** whitelist; Effective Flow neither rejects an unknown tool nor infers capabilities from the
  name. Required when the mode is `external`.
- `tracker.externalToolHint`: free text that lets the run-time agent pick the right connection —
  e.g. MCP server name, workspace, team or project key, identifier convention, or state names.

`remoteToolOverride` is intended only for ambiguous hosts (e.g. self-hosted GitHub Enterprise whose domain does not contain `github.com`). With `auto` the host detection below decides. It names a **forge** CLI and stays forge-only.

### Config migration

Reading the Effective Flow configuration from the project setup ADR (including the `tracker` keys) and the one-time migration of a legacy config is handled centrally by the fragment "Config migration" (`config-migration.md`); this fragment performs no own per-block migration for `tracker` anymore. The `tracker` config schema above (configuration, valid values, mode determination, first-invocation query) remains unaffected by this.

### Determine mode

At the start of the run, determine the effective mode in this order (the first matching rule wins):

1. **Argument type:** The passed argument type overrides the config mode for this run. A report file (`*.md` under `.effective-flow/review/`) forces `local`; a forge issue reference (issue number, `#123` or a forge issue URL) forces `remote`; a tool-native identifier or URL of the configured external tool forces `external`.
2. **Per-run wish of the user:** A **generic** wish for issue/tracker work ("as issues", "publish to the tracker") activates the **configured** target and never redirects a run to a different one; without a configured target it selects `remote`. Only a wish that explicitly names the forge (GitHub, Forgejo, `origin`) selects `remote`, and only a wish that explicitly names the configured external tool selects `external`. If the user explicitly requests local work ("local", "without issues", "report only"), `local` is active — that stays the escape hatch on every target.
3. **Config:** otherwise `tracker.mode` from the Effective Flow configuration (project setup ADR) applies.
4. **First-invocation query:** If `tracker.mode` is not set in the config and neither argument nor per-run wish delivers a signal, run the first-invocation query below.

### First-invocation query

Only when step 4 above applies (no config value, no argument/per-run signal):

Ask the user: **Should review findings be tracked locally as a Markdown report or remotely as issues (GitHub/Forgejo)?**
- Local -- tracker.mode = local — Markdown report under .effective-flow/review/ (previous behavior)
- Remote -- tracker.mode = remote — findings as issues, tool automatically from origin (gh/tea)

Use the chosen answer as the tracker mode **for this run**. Do **not** write it into the configuration yourself — permanently pinning `tracker.mode` in the project setup ADR is handled exclusively by `effective-flow setup`. Briefly point this out to the user, e.g. "Tracker mode `remote` used for this run; pin permanently via `effective-flow setup`."

The query stays deliberately two-way: it runs only when no configuration pins a mode, and it must not write configuration itself, so it cannot obtain the tool identifier an external target requires. An external target is configured through `effective-flow setup` or named per run in an explicit user wish that supplies the tool.

### Tracker target

The determined mode names the **target** that owns issue identity for this run: `local` (Markdown report), `forge` (`remote` — the issue tracker of the `origin` remote), or `external` (the tool named by `tracker.externalTool`). Everything below in this fragment — the helper contract, the label convention with its `firmo-` compatibility and one-time `sf-` migration, the tracker operations, and the finding and epic body formats — describes the **forge** target.

`external` requires a non-empty `tracker.externalTool`. Without it the configuration is invalid: abort before any tracker access, name the missing key, and point to `effective-flow setup`. Never guess a tool, and never fall back to the forge or to `local`. While the mode is `local` or `remote`, `tracker.externalTool` and `tracker.externalToolHint` are ignored for routing and reported once as ignored. Both issue-carrying flows follow the resolved target: the issue-driven flow (``tools/apply-issues.md``, `effective-flow plan-issue`) and review publication.

The complete external contract — connection discovery with its fail-closed rules, the required capabilities, the write discipline, the classification mapping, the container mechanism, and the reference syntax — lives in the `tracker-target` fragment. Every source that embeds this fragment **must** carry its own deferred pointer to `tracker-target`, so a run loads that contract as soon as the resolved target is `external` and never for a `local` or `forge` run. A run that resolves `external` without that contract available aborts instead of improvising.

### Remote helper contract (remote mode only)

All deterministic remote mechanics of the forge target run through the shipped helper:

```text
node <skill-root>/scripts/remote-tracker.mjs <operation> [--apply]
```

Pass exactly one JSON object through standard input and parse exactly one JSON result envelope from standard output. Resolve `<skill-root>` from the currently loaded Effective Flow skill; never copy the helper into the target project. The helper owns origin/provider/reference parsing, `gh`/`tea` probing, capability normalization, command construction, JSON normalization, payload validation, compatibility aliases, exact body patching, redaction, and stale-write preconditions. It never opens a shell and never prompts.

Pass the verified absolute `RUNTIME_STATE_ROOT` as the top-level `cwd`. The helper runs `git`, `gh`
and `tea` in that directory, and every provider CLI resolves its repository context from it. The
runtime root is the one checkout guaranteed to exist for the whole run, whereas an execution
worktree may already have been withdrawn by the time a completion action runs. The field is
optional for compatibility — when it is absent the helper inherits the process working directory —
but an Effective Flow workflow always sets it. A `cwd` that is not an existing directory fails with
a structured error naming the path, never as a missing-CLI error.

For `finding-build` and `epic-build`, pass the already-resolved `language.forge` as the top-level
`language: en|de`; this applies equally when the finding or epic data is nested under its named
key. The optional field defaults to `en`, and unsupported values are rejected. The helper returns
the same language-stable payload keys in either language.

Successful envelopes contain `ok`, `operation`, `provider`, `data`, and `dryRun`. Failed envelopes additionally contain `error.code`, `error.message`, redacted `error.details`, and `error.retryable`, and the process exits nonzero. Treat errors as workflow input; do not discover flags, assemble API requests, read CLI credentials, or invent a fallback. In particular:

- `AMBIGUOUS_HOST`: obtain an explicit `github`/`forgejo` choice from configuration or the user, then retry with that override.
- `CLI_MISSING`/`AUTH_FAILED`: abort without side effects; offer local mode only with explicit user consent.
- `UNSUPPORTED_CAPABILITY`: report the unsupported provider capability and preserve the surrounding workflow state.
- `STALE_WRITE`: abort that write without retrying, merging, or overwriting; re-enter the workflow from a fresh read.
- all other structured errors: preserve scope and let the owning workflow decide whether a retry is safe.

Reads execute immediately. Mutations are dry runs by default: inspect the returned executable, argument vector, and redacted input preview, obtain every workflow-specific approval that still applies, and only then repeat the same operation with `--apply`. A dry run never changes Git, tracker state, memory, labels, issues, pull requests, comments, or review threads.

### Label convention

In remote mode, use these labels and create missing labels idempotently. The helper's label creation reads the repository's existing labels first and creates only what is genuinely missing, so a repeated run adds no second copy of a label; each call reports whether it created anything. Copies an earlier version already created are not removed and can still attach several times to one issue. Where the existing labels cannot be read, it aborts instead of creating:

| Label                                                                                          | Meaning                                                                           |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `effective-flow-review-finding`                                                                | marks a single finding issue                                                      |
| `effective-flow-review-epic`                                                                   | marks the epic/tracking issue                                                     |
| `effective-flow-fix`, `effective-flow-refactor`, `effective-flow-build`, `effective-flow-docs` | target action of the finding (exactly one per finding issue)                      |
| `critical`, `important`, `note`                                                                | severity of the finding (exactly one per finding issue; `note` for note findings) |
| `wontfix`                                                                                      | deliberately do not implement finding → ADR instead of code                       |
| `effective-flow-issue-done`                                                                    | issue implemented by ``tools/apply-issues.md`` (PR created)                        |
| `effective-flow-issue-in-progress`                                                             | forge fallback showing issue-backed implementation has started                    |
| `effective-flow-needs-planning`                                                                | skipped by ``tools/apply-issues.md``; planning via `effective-flow plan-issue` needed   |

`wontfix` already exists on many trackers; the helper creates it only if it is missing.
`effective-flow-issue-in-progress`, `effective-flow-issue-done`, and
`effective-flow-needs-planning` belong to the issue-driven lifecycle and are created idempotently
where needed. The in-progress label is a forge fallback for a native started state; the done label
continues to mean "implementation secured in a PR", not "tracker issue closed". Merge reconciliation
removes the in-progress label only after it freshly observes the issue as terminal.

**Backward compatibility (severity labels):** The English severity labels `critical`/`important`/`note` are the default; newly created or set is exclusively the English label. The former German labels `kritisch`/`wichtig`/`hinweis` are **not** upgraded but stay **recognized** permanently when reading, listing, deduplicating and detecting a finding's severity — run a severity query per language variant (once `critical`/`important`/`note`, once `kritisch`/`wichtig`/`hinweis`) and union by issue number, analogous to the `firmo-`/`effective-flow-` prefix rule above.

**Backward compatibility (legacy prefix `firmo-`):** Earlier versions used the prefix `firmo-` instead of `effective-flow-` (`firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`firmo-refactor`/`firmo-build`/`firmo-docs`, `firmo-issue-done`, `firmo-needs-planning`). Newly **created or set** is exclusively the `effective-flow-` label; an upgrade of existing `firmo-` labels is **not** needed. When **reading, listing, deduplicating and detecting**, every `firmo-` variant counts permanently as equivalent to the associated `effective-flow-` variant:

- **Listing/filtering** (dedup, epic/issue search): `gh`/`tea` combine multiple `--label` specifications with AND semantics. Therefore run the query **separately per prefix** (once `effective-flow-…`, once `firmo-…`) and union the matches by the issue number.
- **Removing a status label** (`effective-flow-needs-planning`, `effective-flow-issue-done`): additionally remove the legacy `firmo-` variant, if present, so an issue does not stay "stuck" through a leftover legacy label. `effective-flow-issue-in-progress` is new and has no legacy variant.

**One-time `sf-` label migration:** The even older prefix `sf-` (`sf-review-finding`, `sf-review-epic`, `sf-fix`/`sf-refactor`/`sf-build`/`sf-docs`, `sf-issue-done`, `sf-needs-planning`) is **no longer** detected continuously, but **migrated once per repo**. On the **first** remote tracker access — provided the marker `labelMigration.sf.done` in the retained absolute `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle is missing and an authenticated CLI is present — an idempotent migration moves every still-present `sf-<x>` label to `effective-flow-<x>`: first add `effective-flow-<x>` on the issue, then remove `sf-<x>` (not the other way around, so an abort leaves no issue unclassified). If the runtime directory is missing, apply the owning workflow's loaded “Runtime-state write safety” contract from `RUNTIME_STATE_ROOT` to that exact directory immediately before its `mkdir`. After the remote migration, use the loaded shared memory mutation contract against the retained absolute memory handle: acquire its lock, re-read memory, merge only `labelMigration.sf`, and atomically persist `done` plus the completion timestamp while preserving every sibling and unknown field. If this marker mutation blocks or fails, preserve local state, report that the remote labels may already have migrated, and direct the user to `effective-flow setup`; the next run may repeat the idempotent remote migration. If the migration finds no `sf-` labels, it is a silent no-op. If the marker is set, any further scan is skipped — ongoing operations know only `effective-flow-` and `firmo-`. `sf-` is referenced exclusively in this migration.

### Security disclosure gate

A finding classified as security relevant is **never** written to a tracker without an explicit
per-run confirmation by the user. This gate binds every publisher of review findings and
overrides `tracker.mode` as well as every other configuration value; there is no configuration key
that switches it off. Publication to a third-party tracker is a disclosure with the same
consequences as publication to a public forge, so the gate binds a forge target and an external
target alike. The producing workflow owns the classification and the confirmation
(see `effective-flow review`, Phase 3 and Phase 4).

Rules for every publisher, on whichever tracker target the run resolved:

- **Local first:** the withheld findings are persisted in a local report below
  `.effective-flow/review/` before any tracker mutation. That report is the authoritative record
  for them; it stays in the gitignored runtime state of the main checkout and is never committed.
- **Confirmation before publication:** publication happens only after an explicit user decision in
  that run, taken with knowledge of the disclosure consequence. Keeping them local is the default;
  an unanswered, skipped, or non-interactive run publishes nothing from the withheld set.
- **Silence in public artifacts:** epic bodies, issue bodies, and comments contain no count, title,
  signature, ID, or other reference to a withheld finding. A public hint that unfixed security
  findings exist is itself an exploitable signal.
- **Conservative classification:** an uncertain or missing security assessment counts as security
  relevant and stays local.
- **Scope:** the gate covers the publication of review findings. It does not sanitize branch names,
  commit subjects, or pull request bodies of a later fix; that disclosure decision belongs to the
  delivering workflow and its user.

The gate governs only the destination of a finding. It never removes a finding, changes its
severity, or narrows the active finding scope.

### No AI attribution in issue bodies and comments

Do not add AI attribution to issue bodies, epic bodies and comments: no "Generated with Claude Code/Codex" footers, no agent session links (e.g. `https://claude.ai/code/…`) and no `Co-Authored-By` trailers – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex as the target harness are allowed, generation attribution is not. This binds every publisher on every tracker target, the forge and an external tool alike.

### Remote prose language

Resolve `language.forge` once per remote run and pass it to all issue/comment writers. Preserve
the clear language of an existing issue or thread when editing/replying; otherwise use the
resolved Forge language. Finding and epic bodies use one complete language for human-readable
titles, headings, field labels, displayed severity/complexity values, and prose.

The German display mapping is `Schweregrad`, `Komplexität`, `Bereich`, `Datei`, `Problem`,
`Empfehlung`, `Prompt-Vorschlag`, `Sicherheit`, `Befunde`, and
`Übersprungen (Architekturentscheidungen)`. English uses the template labels below. The exposure
values `external`, `internal`, and `none` of the `Security`/`Sicherheit` field are machine tokens
and stay unlocalized in both forms. `Action`,
`Epic`, and `Signature` are stable helper/dedup fields and remain canonical English in both
forms, as do their action values. Displayed severities map to
`Kritisch`/`Wichtig`/`Hinweis`, and displayed complexities map to
`Niedrig`/`Mittel`/`Hoch`; their helper input enums remain
`Critical`/`Important`/`Note` and `Low`/`Medium`/`High`. Labels, issue numbers, `R-XXXXXXX` IDs, HTML markers, body
hashes, checklist syntax, and helper payload keys are never localized. Readers accept both
German and English historical display fields, including legacy `Signatur`, but canonical writes
use `Signature`.

### Issue body format (finding issue)

A finding issue must be **self-contained**: a foreign LLM session must be able to process it without access to the producing session. It contains the same content fields as a finding block of the local report format (see the shared `review-report-format` fragment).

- **Title:** `[R-XXXXXXX] <short title in language.forge>`
- **Labels:** `effective-flow-review-finding`, the action label and the severity label.
- **Body** (canonical template):

```markdown
- **Severity**: Critical / Important / Note
- **Complexity**: Low / Medium / High
- **Area**: [...]
- **File**: [path:line]
- **Problem**: [...]
- **Recommendation**: [...]
- **Action**: effective-flow-fix | effective-flow-refactor | effective-flow-build | effective-flow-docs
- **Prompt suggestion**: [directly copy-pasteable plain text, without enclosing quotation marks, without escape sequences]
- **Epic**: #<epic number> (empty if no epic)
- **Signature**: [path:line] · [Area] · [short summary of the problem]  <!-- Dedup key -->
```

A finding published through the "Security disclosure gate" keeps its `Security`/`Sicherheit` field
in the issue body, so the accepted disclosure stays visible; an ordinary finding omits that field
instead of carrying an empty `none`.

The **Signature** field fixes the content dedup key (file+line, area, problem). It is deliberately **not** the `R-XXXXXXX` ID, because that is assigned freshly per run. Canonical writes use `Signature`; helper reads and deduplication also accept the legacy field name `Signatur` and normalize both forms to the same identity.

### Epic body format (tracking issue)

- **Title:** `Code review YYYY-MM-DD[-N]` for English or
  `Code-Review YYYY-MM-DD[-N]` for German
- **Labels:** `effective-flow-review-epic`
- **Body** (canonical template):

```markdown
Code review of YYYY-MM-DD · Scope: [Entire code / Described area] · Project type: [...]

## Findings

- [ ] #<nr> [R-0000001] <short title> — Action: effective-flow-fix
- [ ] #<nr> [R-0000002] <short title> — Action: effective-flow-refactor

## Skipped (design decisions)

- <short title> — Signature: [normalized signature] — covered by [decision reference] ([Source])
```

Rules for the task list:

- Each entry under `## Findings` references exactly one finding issue via its number and carries the `R-XXXXXXX` ID as well as the action.
- The section `## Skipped (design decisions)` uses **no** checkboxes and lists only findings filtered out by design decisions. A skipped entry is identified by title, normalized signature, and decision reference; it carries no issue number and no `R-XXXXXXX` ID, and it never advances `lastFindingNumber`. The section is omitted when no such findings are present.
- Ticking off delegates the exact checklist patch to the helper, using the body hash from the preceding fresh read. It may append the PR link; a finding deliberately not implemented is marked with its decision reference.

### Tracker operations

Describe tracker access only as a helper operation: issue/PR read and list, issue/PR create,
native sub-issue read/create, comment read/create/update, label create/change, PR review-thread read/reply/resolve,
marker/checklist patch, or PR creation. Use the helper's normalized output rather than
provider-specific fields. For list operations, request the compatibility variants and let the
helper union matches by issue number before signature deduplication.

The two native-containment operations are deliberately separate from generic issue creation:

- `issue-sub-issues-read` takes a mandatory top-level `parent` issue reference and returns a list of
  normalized issue objects. Every item additionally carries
  `parent: { number, repository }`; a child created from an Effective Flow decomposition also
  carries its normalized `decompositionKey` from the canonical marker in its body. A malformed,
  duplicated, invalid, or different-parent marker does not discard the provider-verified native
  child or abort its siblings: that child instead carries a safe structured
  `decompositionKeyError`. Planning reconciliation must fail closed on that diagnostic; lifecycle
  and merge observation still use the verified native relation and issue identity.
- `issue-sub-issue-create` is a mutation whose top-level `parent` is mandatory. Its `payload`
  contains a non-empty `title`, non-empty self-contained `body`, optional `labels`, and the stable
  lowercase `decompositionKey`. The helper validates that a parent URL belongs to the active
  repository, redacts complete recognizable secret values in titles and bodies, rejects an unsafe
  credential form it cannot transform deterministically, rejects secret-bearing labels and
  generation attribution, appends exactly
  one `<!-- effective-flow-decomposition-key:v1 {"parent":<number>,"key":"<key>"} -->`
  marker as the final nonblank standalone line of the child body, and returns the normalized child
  with the same parent relation and key. Reads recognize the marker only in that canonical appended
  position; quoted and fenced examples are ordinary issue prose. A body with an unclosed Markdown
  fence is rejected before preview, because an appended marker would remain unreadable inside that
  fence. Explicit secret forms include AWS access-key fields, refresh tokens, private-key blocks,
  client/session credentials, Authorization Bearer/token/Basic values, and common environment
  identifiers such as `GH_TOKEN`, `NPM_TOKEN`, `DATABASE_PASSWORD`, `*_SECRET`, and `*_API_KEY`.
  Quoted values, equals assignments, indented credential blocks, and single-token colon values are
  high-confidence and fully redacted. Sentence-like prose such as `Password: require …`,
  `Secret: do not log …`, or `Token: support …` remains unchanged; other multiword colon forms are
  ambiguous and fail closed with a value-free diagnostic instead of silently deleting specification
  semantics.

Canonical decomposition state uses four dependency-free local helper operations:

- `decomposition-records-build` accepts a nonempty exact record array with
  `key`, `title`, `workflow`, `body`, `status`, and `issue`, plus the artifact language, target,
  resolved target binding, and parent. It sanitizes publishable title/body text, requires exactly
  one language-matching Recommended-workflow field equal to the record workflow, validates the
  `proposed|approved|created|missing|declined` status/issue combination, enforces unique keys and
  target-aware created issue identities, binds each exact draft with a SHA-256 `draftHash`, and
  returns one complete canonical v2 section. Insert that returned section verbatim; never handwrite
  a record marker or its visible rendering.
- `decomposition-records-parse` accepts the fresh stored parent-comment body and validates those
  v2 boundaries, safe-encoded full records, target binding, exact schema, body workflow, recomputed
  hash, and byte-for-byte visible rendering. Quoted and fenced examples are ignored. A changed
  visible title/body, encoded record, status, identity, or rendering fails closed. It reports
  whether records were found and whether any active (`proposed|approved|created|missing`) record
  keeps the issue a decomposition container.
- `decomposition-container-compare` combines that fresh comment body with the fresh normalized
  native children. It reports `containerOnly: true` for an active canonical decomposition even when
  the child list is empty, and returns safe discrepancy codes for incomplete, missing, duplicated,
  invalid-marker, detached, mismatched, or unexpected children.
- `decomposition-child-workflow-parse` requires exactly one language-matching canonical
  Recommended-workflow field in a decomposed child's body, validates it against the parent record,
  and returns the stable workflow plus its `build|fix|refactor|docs` implementation route. It uses
  the Markdown inventory: blockquoted and fenced examples do not count, so an example-only body is
  rejected while one top-level field plus examples is accepted.

For a decomposition bound to GitHub, `decomposition-records-build` enforces the 65,536-byte UTF-8
comment ceiling on the generated section, and `planning-comment-build` enforces it again on the
complete stamped planning comment. The structured error reports `maximum`, `actual`, the unit, the
section/other-comment split, and per-record title/body/encoded-record contributions. This limit is
not applied to ordinary non-decomposition legacy planning comments; another provider may still
reject a smaller target-specific limit, which remains a fail-closed persistence error.

Forge identities are normalized only through the resolved host/repository and `parseReference`;
a URL from another host or repository never aliases `#N`. External tool-native identifiers and
URLs remain exact strings and are never collapsed by their trailing number. These operations are
local validation and reconciliation, not provider transport. Callers never parse marker data or
infer proposal identity from titles themselves. `planning-comment-build` also validates every
decomposition-bearing comment so a caller cannot bypass the canonical parser before persistence.

Both operations are provider-neutral at the workflow boundary. On GitHub, the helper maps child
reads to the paginated native sub-issues endpoint and creation to the provider's atomic
parent-aware create capability with the verified parent identity. The helper probes that create
capability before the first create preview or write. On Forgejo, both capabilities are false and the create operation returns
`UNSUPPORTED_CAPABILITY` before any write until a verified native operation exists. The helper
never routes `issue-sub-issue-create` through `issue-create`, never creates first and links later,
and never fabricates a checklist relation.

The normal mutation discipline applies: preview the exact redacted command and publishable child
payload, obtain the owning workflow's approval, then apply the identical operation. A command
failure during `issue-sub-issue-create`, or a successful command without a parseable same-repository
child URL, reports `mutationMayHaveSucceeded: true` and is non-retryable. The caller must read
`issue-sub-issues-read` fresh and reconcile the stable key before any later attempt. Zero matches
does not authorize a blind retry after an unknown outcome; one unique match recovers it; multiple
matches fail closed as ambiguous.

The targeted issue-comment update operation is `issue-comment-update`. Its input contains the
issue number, the positive `commentId` returned by `issue-comments-read`, the freshly computed
`expectedBodyHash` of that exact comment body, and `payload.body`. It is a mutation and therefore
uses the normal dry-run-first envelope. On apply, the helper reads the issue comments again,
requires exactly one matching comment ID, and compares its body hash before writing. A missing,
ambiguous, or changed comment fails with `TARGET_NOT_FOUND`, `AMBIGUOUS_TARGET`, or `STALE_WRITE`;
the caller must not fall back to `issue-comment` and create a competing comment.

Provider mapping for `issue-comment-update` is fixed and owned by the helper:

- GitHub: `PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}`.
- Forgejo: `PATCH /repos/{owner}/{repo}/issues/{index}/comments/{id}`; Forgejo currently ignores
  `index`, but the adapter still supplies the freshly resolved issue number.

Both send a JSON object with the validated, attribution-free `body`. If probing reports that the
provider or installed CLI cannot execute this API operation, abort with `UNSUPPORTED_CAPABILITY`
before a write; never append a replacement planning comment.

Body writes, including `issue-comment-update`, require `expectedBodyHash` from the immediately
preceding fresh read. Preview the exact patch and command in dry-run mode, then apply with the same
payload. Zero or multiple semantic matches are structured errors; unchanged state is successful
and idempotent. The helper exposes whether provider-level conditional writes are available; the
expected-body precondition is mandatory regardless. GitHub returns the read ETag for diagnostics
but documents unsafe-method conditional requests as unsupported for these endpoints, so the
adapter reports the write as non-atomic instead of sending a misleading `If-Match` header. The
fresh read therefore detects sequential re-entry and the per-draft child reads detect duplicates,
but neither is a cross-process lease: two simultaneous writers can still race between the final
read and PATCH/create. Fail closed on every duplicate observed before or after an uncertain result;
do not claim the client-side hash guard closes that provider TOCTOU window.

Legacy-label transitions use the helper's add and remove operations in that order. The one-time `sf-` migration returns its completion marker only after every step succeeds; a partial failure reports completed steps and keeps the marker pending. Cleanup of recognized `firmo-` aliases uses the same add-before-remove operations without changing that one-time marker contract.

### Error and edge cases

- **Missing/unauthenticated CLI:** abort clearly, give a remediation hint, leave no partial state; no silent fallback to `local`.
- **No Git repository / no `origin` remote:** remote mode not possible; report.
- **Ambiguous host:** use `remoteToolOverride` or a per-run hint; if both are unclear, ask the user.
- **Argument type contradicts `tracker.mode`:** The argument type overrides the config mode for this run (see "Determine mode").
- **External target:** connection discovery, its four fail-closed failure classes (missing tool identifier, no connection, ambiguous connection, missing capability) and the write discipline live in the loaded "Tracker target" fragment. There is no fallback to the forge or to `local`.

**Load on demand:** Read `shared/tracker-target.md`, when the resolved tracker target is `external`.

**Load on demand:** Read `shared/session-rename.md`, when the run's subject is fixed and a session title is about to be applied or emitted.

## Comment convention

Write the planning result as an issue comment (operation "Add comment" from the mapping). Resolve
`language.forge`, but preserve the clear language of an existing planning comment when updating
it. Begin every Effective Flow comment with the stable marker
`<!-- effective-flow-plan-issues -->`. The English structure is shown below. The complete German
form uses `Planung abgeschlossen`, `Empfohlener Workflow`, `Anforderung`,
`Akzeptanzkriterien`, `Betroffene Bereiche/Dateien`, `Randfälle`, and `Annahmen`. Workflow
values, paths, checklist syntax, and the HTML marker remain stable.

```markdown
<!-- effective-flow-plan-issues -->
## Completed planning

**Recommended workflow:** Feature / Bugfix / Refactoring / Documentation

### Requirement
[refined target behavior with rationale]

### Acceptance criteria
- [ ] [measurable criterion]

### Affected areas/files
- `path/file` — [planned change]

### Edge cases
- [Edge case and expected behavior]

### Assumptions
- [deliberately documented remaining point]

### Proposed decomposition

[the complete canonical v2 section returned by `decomposition-records-build`, inserted verbatim]

### Plan review

**Result:** Approved / Revision required

#### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

#### Findings

- No findings. / [finding, severity, and incorporated adjustment or remaining decision]

### Open points

- No open points. / [implementation-blocking decision and re-entry note]

```

The complete German form additionally uses `Plan-Review`, `Ergebnis`, `Freigegeben`,
`Überarbeitung nötig`, `Zusammenfassung`, `Befunde`, `Offene Punkte`, and
`Keine offenen Punkte.`. Preserve one complete language throughout the comment. An older comment
without review/open-point sections remains readable; the next baseline update adds both sections.
The `Proposed decomposition` section is optional and is omitted when no split is proposed. Its
versioned boundaries, safely encoded full records, and exact visible child rendering are stable
machine data. Build the complete section through `decomposition-records-build`, supplying
artifact language, target, resolved target binding, parent, and records; insert only its returned
section verbatim. Parse it again through `decomposition-records-parse`; never compose or interpret
its marker data ad hoc. `key` is
a lowercase parent-scoped slot key matching `[a-z0-9][a-z0-9._-]{0,79}`, `status` is `proposed`,
`approved`, `created`, `missing`, or `declined`, and `issue` is a positive normalized child reference
only for `created`. Forge identities bind to the exact resolved host/repository; external IDs stay
exact. `workflow` is exactly one supported workflow value and `draftHash` binds the approved key,
title, workflow, and body. The parser recomputes that hash and the complete visible rendering, so a
changed persisted title or body fails closed. Keys and created issue identities are unique within
the parent comment. Once persisted, a key is never derived again from an edited title or body and
is never reassigned to another child slot. Every English child body carries exactly one matching
`**Recommended workflow:** <value>` field; a German body uses
`**Empfohlener Workflow:** <value>` instead. The stable values remain `Feature`, `Bugfix`,
`Refactoring`, and `Documentation` in either language.

## Workflow

### Phase 1: Tracker setup & collection

1. Resolve the tracker target according to "Tracker target". On the forge target, determine the host and CLI and check availability/authentication according to "Remote helper contract"; precondition there is a Git repository with an `origin` remote. On an external target, establish exactly one connection per the loaded `tracker-target` contract and verify the capabilities this skill always needs — read issue and comments, list issues by classification, create a comment, update a comment by its ID, and add/remove a classification value. External decomposition additionally requires the complete native-container mechanism — native-child listing plus writable native sub-item completion — and atomic create-under-parent. Discover all three guarantees before proposing a split; when one is unavailable, keep ordinary comment-based planning available. If an always-required capability is missing: report clearly and abort without side effects.
2. Determine the issues to plan:
   - without an argument: list all open issues with the label `effective-flow-needs-planning`. On the forge target, also query the old label `firmo-needs-planning` as equivalent (see "Label convention"); on an external target that legacy prefix is forge history and is neither queried nor written there.
   - with an argument: use the passed issue references (number, `#123`, URL).
3. If there are no matching issues: a short message ("no open `effective-flow-needs-planning` issues") and end.
4. Show the user the found list (number, title) and let them choose which issues should be planned (one, several, or all).
5. Create a task per chosen issue (task tracking).

Before planning, review useful skills according to the following building block. The no-code boundary of this
tool remains strict: skills only inform the clarification/planning, generate no code
and do not widen the tracker-write boundary defined above.

## Skill discovery

Before you start the actual implementation, planning, or review, survey the skills available in
the environment and pull in the ones useful for the concrete task. If the environment provides
no skill directory or none fits, this step is a no-op — continue without an error or a block.

### Approach

1. **Prefer recommended skills:** Preferentially apply the skills listed further above under
   "Recommended skills", provided they are available and relevant to the concrete task.
   "Preferring" is the selection; **authority** is decided by the contract in point 5. A fallback
   notation `A › B` is an ordered preference: take the first available, non-excluded skill in the
   group, never both. If no such section exists (e.g. for tools), this point does not apply.
2. **Judge relevance:** Pull in only skills that clearly fit the **concrete** task (typically
   0–2), never "on suspicion". Never load the alternative orchestrator `effective-workflow`
   inside Effective Flow: nesting it would create competing lifecycle and delivery owners.
3. **Take config into account:** If present, read the `skills` block from the Effective Flow
   configuration (project-setup ADR) on a best-effort basis — the global fields plus your own
   scope entry (an agent reads `agents.<own-name>`, a tool reads `tools.<own-name>`).
   - `enabled: false` → skip the entire dynamic skill usage.
   - `exclude` (global or scope) → never apply these skills; an excluded fallback member is
     skipped in favor of the next fallback.
   - `include` (global or scope) → additionally consider these skills as preferred; a
     skill that is not installed is silently ignored.
   - If the block or the file is missing, the default applies (`enabled` on, no additional
     lists). Only read the config; do not migrate or write it here.
4. **Library docs:** For an unknown or current library or framework, use an available
   current-docs skill (e.g. `context7`) when needed instead of guessing from memory.
5. **Authority contract (orchestration vs. domain expertise):** Effective Flow and the central
   skills share the responsibility in a **layered** way — not "Effective Flow always wins":
   - **Effective Flow owns the orchestration** (the **what/when**): routing and user
     interaction, plan/report state, finding IDs, backlinks, tracker integration, resumability,
     agent selection and parallelization, baseline comparison, worktrees, commits, delivery,
     harness transform, and config. These rules, `AGENTS.md`/project conventions, plus its own
     language, commit, and scope rules **always** take precedence; no skill may widen scope,
     introduce new dependencies, or violate the agreed plan. In analysis/planning tools the
     no-code boundary stays strict.
   - **Central skills own reusable expertise** (the **how**): domain checklists, heuristics,
     standards, research procedures, and specialist guidance. If a recommended skill is the
     **declared domain owner** for the technical question at hand **and** covers it, its
     guidance is **authoritative** — not optional advice. The tool's own source then carries
     **no second copy** of that playbook, only scope/output/lifecycle constraints plus a
     minimal fallback (point 6).
   - **Edge cases:** If a skill only covers a special branch (_route-when-relevant_) or
     Effective Flow's product behavior deliberately diverges (_no-overlap_), the Effective Flow
     guidance stays leading. The binding assignment per skill/intersection is in the ownership
     inventory in the Developer Guide (`docs/developer-guide/skill-ownership.md`).
6. **Missing authoritative skill (minimal fallback):** If the authoritative skill is not
   available (not installed, `skills.enabled: false`, or disabled via `exclude`), the
   **minimal generic fallback** left in the source applies — a short, essential core guidance
   so the tool stays functional and degrades cleanly. **No** second full domain handbook is
   kept on hand; full depth comes only with the central skill.
7. **Report:** Briefly name which skills were used (or that none fit). If an orchestrator tool
   already handed you relevant skills, apply them and do not run a redundant full discovery.

The generic plan-quality and plan-review **judgment** comes from `codebase-improvement`; Effective
Flow owns the issue-comment artifact, the per-issue lifecycle, and the readiness gate. Apply the
same central delegation contract as `effective-flow plan`:

## Delegating the domain judgment to central skills

The **generic technical judgment** of the calling tool — for planning, the plan-quality and
plan-review discipline (executable-plan sharpness, gap/drift checking, scope, evidence,
verification, maintenance focus) — is owned by the central skill `codebase-improvement`.
Effective Flow is the **artifact orchestrator** here, not a second domain handbook: the tool's
own source carries **no second copy** of these heuristics, but delegates the judgment and
normalizes the result into its own artifact contract (status, scorecard/finding form, open
points, handoff).

### What gets delegated (the "how" of the judgment)

- generic quality heuristics: over-engineering, scope creep, unspoken assumptions, missing or
  non-measurable acceptance criteria, edge cases, implementation risks, evidence vs. guessing,
  verifiability;
- the review **judgment** (which findings hold and how heavily they weigh) at the artifact
  level.

For this, apply `codebase-improvement`, provided it is available and relevant to the concrete
task; it is the **default owner** for this generic reasoning. Afterwards you bring the result
into the Effective Flow artifact form.

### Specialists only at a crossed boundary (one generic rule)

Declared domain owners are **not** hard-wired per skill, but loaded via **one** rule: if the
concrete task crosses the declared boundary of a specialist, load its owner via the relevance
gate (building block "Skill discovery") and the ownership inventory
(`docs/developer-guide/skill-ownership.md`). Typical owners:

<!-- skill-ownership:relevance-gate-owners ["product-management","product-design","effective-web","software-architecture","web-legal-compliance"] -->

- `product-management` — product outcomes, what/why/for-whom, prioritization, release judgment;
- `product-design` — research, problem framing, information architecture, flows, prototype;
- `effective-web` — browser implementation and accessibility detail;
- further declared owners (e.g. `software-architecture`, `web-legal-compliance`) analogously.

The relevance gate **keeps narrow tasks narrow**: a small engineering plan loads neither
product nor design owners, and product discovery is not forced.

### Authority contract and minimal fallback

The layered contract from the building block "Skill discovery" applies: Effective Flow owns the
**orchestration** (artifact lifecycle, status, open points, handoff, user interaction, and the
respective no-code/edit boundary), the central skills own the **domain judgment**. If the
authoritative skill is not available (not installed, `skills.enabled: false`, or disabled via
`exclude`), a **minimal generic fallback** applies: a short, essential core checklist
(over-engineering, scope creep, missing measurable acceptance criteria, edge cases,
implementation risks) so the tool stays functional and degrades cleanly — **not** a full local
handbook.

### Phase 2: Planning per issue (interactive)

For each chosen issue in turn:

1. Read the issue fresh from the tracker – **including comments** (operation
   `issue-comments-read`) – and delegate the read-only examination of the relevant codebase to an
   internal analysis sub-agent; examine it inline only under the delegation mandate's triviality
   exception. Take maintainer clarifications from comments into account. Find the newest comment
   carrying `<!-- effective-flow-plan-issues -->` or the backward-compatible
   `<!-- firmo-plan-issues -->`; retain its normalized positive comment ID, exact body, and body
   hash. Treat it as the canonical update basis. Never create a second planning comment while such
   a comment exists.
2. Apply the clarification methodology from `effective-flow plan` (Phase 1/2): identify the genuinely relevant ambiguities — target behavior, domain rules, technical requirements, dependencies, edge cases, acceptance criteria — and ask the user about them specifically.
3. Repeat the clarification until a reliable basis exists. Document unimportant remaining points as assumptions instead of blocking the process.
4. Determine the recommended implementation (Feature / Bugfix / Refactoring / Documentation) according to the classification definitions from `effective-flow plan`.
5. Decide proactively whether the active issue is too broad for one coherent implementation or
   combines independently implementable outcomes. If so, prepare a concrete decomposition only
   when the forge helper proves its parent-aware operations or the external target proves the full
   native-container contract plus atomic create-under-parent. Give each
   child its own derived workflow and a complete body containing its refined requirement,
   measurable acceptance criteria, affected areas/files, edge cases, assumptions, and a plain
   parent reference. Give every body exactly one language-matching canonical workflow field:
   `**Recommended workflow:** <value>` in English or
   `**Empfohlener Workflow:** <value>` in German. Its stable value must equal the child's record
   workflow and must be a top-level field; blockquoted or fenced examples do not count. Require
   every Markdown fence in the child body to close before preview so the helper-appended final key
   marker remains readable. Do not copy credentials, secrets, session identifiers, or generation attribution;
   let the helper redact complete sensitive values and fail closed on a form it cannot transform
   safely. Labels pass through the same secret boundary and are rejected rather than redacted when
   sensitive. Do not attach `effective-flow-needs-planning`: every proposed child must already pass
   the implementation clarity gate. Allocate stable keys such as
   `child-01` once per parent and preserve existing keys on re-entry. If the target lacks any
   applicable guarantee, report decomposition as unavailable without creating a checklist or
   blocking the ordinary single-issue planning path.
6. If a central clarification is unanswered, normalize it as an implementation-blocking open point,
   persist the current artifact per Phase 4, retain `effective-flow-needs-planning`, report the
   re-entry `effective-flow plan-issue <issue>`, and continue with the next selected issue.

### Phase 3: Automatic quality baseline per issue

Before offering the deep interactive review, run the same quality baseline as the local planning
workflow for the active issue only:

1. Ask `codebase-improvement` for the generic gap judgment from `effective-flow plan` Phase 4:
   over-engineering, scope creep, hidden assumptions, missing or non-measurable acceptance
   criteria, edge cases, implementation risks, and evidence versus guessing. Use another declared
   domain owner only when the issue crosses that specialist boundary.
2. Incorporate directly resolvable gaps into the specification. Normalize the validation judgment
   from `effective-flow plan` Phase 5: concrete scope and file references, measurable acceptance
   criteria, sufficient verified context, explicit purpose/workflow, no-code compliance, and a
   fitting workflow recommendation.
3. Obtain the internal plan-review judgment from `codebase-improvement` exactly as in
   `effective-flow plan` Phase 6. Classify findings as Critical, Important, or Note across Architecture,
   Security, Data protection, Error cases, Testability, Scope, and Maintainability. Incorporate all
   critical findings and every directly resolvable important finding; record remaining
   decision-requiring findings as concrete open points.
4. Normalize the active comment to the canonical structure, including its language-matching plan
   review, scorecard, findings, and open-points section. `Approved` / `Freigegeben` requires no
   critical finding and no implementation-blocking open point; otherwise use
   `Revision required` / `Überarbeitung nötig`.
5. When a decomposition was prepared, include its exact child records, titles, workflows, and
   publishable bodies in the canonical comment before any approval or create operation. Review the
   proposed children as implementation units as well as reviewing the overall parent. Any child
   that is not self-contained or that still has a blocking open point blocks the decomposition.
   Pass the artifact language, target binding, active parent, and complete record set through
   `decomposition-records-build`, insert only its complete canonical section verbatim, and then pass
   the assembled comment through `planning-comment-build`. A schema error,
   duplicate key or created issue identity, invalid workflow, invalid status/issue combination,
   unsafe secret form, unclosed child fence, or body/record workflow mismatch blocks persistence.
   For GitHub, both operations enforce the 65,536-byte aggregate UTF-8 comment limit: the section
   must fit at build time and the complete stamped planning comment must fit before persistence. If
   it does not, report the structured size contributions and reduce the proposal/comment; never
   truncate a child body or bypass the canonical section. A smaller provider-specific rejection is
   likewise fail closed.
6. If critical findings or implementation-blocking open points remain, persist the baseline,
   retain the Needs-Planning label, do **not** offer the deep review yet, report re-entry via
   `effective-flow plan-issue <issue>`, and continue with the next selected issue.

### Phase 4: Persist, deep-review gate, and readiness

Complete this entire phase for the active issue before starting another issue:

1. Persist the self-contained baseline comment. If no planning comment exists, use
   `planning-comment-build` followed by `issue-comment` once and retain the returned comment ID and
   fresh body hash. If one exists, canonicalize the marker to
   `<!-- effective-flow-plan-issues -->`, preview `issue-comment-update` with the retained comment
   ID and `expectedBodyHash`, then apply that same payload. On `UNSUPPORTED_CAPABILITY`,
   `TARGET_NOT_FOUND`, `AMBIGUOUS_TARGET`, or `STALE_WRITE`, stop processing this issue without
   adding a fallback comment or removing its label; report that a fresh
   `effective-flow plan-issue <issue>` run is required. On an external target the same sequence runs
   through the resolved connection's create-comment and update-comment-by-ID capabilities under
   the `tracker-target` write discipline: preview the payload, re-read the exact comment
   immediately before the update, compare it verbatim, and treat a missing capability, a missing or
   ambiguous comment, or a changed body as the same fail-closed stop.
2. If the freshly persisted baseline contains a proposed decomposition, re-read that exact comment
   and confirm its body hash. Parse the body through `decomposition-records-parse` and reject any
   noncanonical, duplicate, or invalid record before showing the parent and every exact child title,
   workflow, body, stable key, and bound draft hash. Ask whether to create **that exact set** as
   native children of this parent. An unanswered or rejected prompt creates nothing. On approval,
   rebuild the complete canonical section from the parsed records with exactly those `proposed`
   statuses changed to `approved` and unchanged title/body hashes, then perform the guarded comment
   update, re-read, and parse it again. On rejection, rebuild and guardedly persist the section with
   the proposal `declined`, then continue with the existing single-issue planning and deep-review path;
   do not interpret approval of another parent or an earlier draft as approval here.
3. After approval, re-read the parent and canonical comment. For an external target, revalidate the full native-container contract
   and atomic create-under-parent before the first mutation. Enforce child-count and parent-state
   constraints that these reads expose; treat hierarchy-depth, permission, parent-state, or limit
   rejections surfaced only by the provider as fail-closed create errors rather than claiming a
   local preflight. For each approved draft in order:
   - immediately before the create preview, call `issue-sub-issues-read` and replace the local
     reconciliation state with that fresh list. A child-level `decompositionKeyError`, more than one
     match for any canonical key, a wrong-parent marker, or another record/list integrity error
     fails closed for this parent. Match the draft's stable key: exactly one valid match is reused;
     zero permits a preview; multiple matches stop before a write;
   - when zero matches remain, preview the parent-aware create and verify that its parent, key, exact
     publishable payload, and workflow still match the approved draft. Validate the body again with
     `decomposition-child-workflow-parse` using its artifact language and record workflow.
     Immediately before apply,
     call `issue-sub-issues-read` again and replace the local reconciliation state. One now-matching
     child is recovered without applying, zero permits applying the unchanged previewed operation,
     and multiple matches or any marker/integrity error stop before a write. Never call
     `issue-create`, create first and link later, or fall back to a checklist;
   - after success or unique-key recovery, call `issue-sub-issues-read` once more and require exactly
     one valid same-parent match for the key. A concurrently visible duplicate fails closed before
     the comment update. Then guardedly update the canonical comment with the normalized child
     reference and a `created` status before continuing. Every status/reference transition rebuilds
     the complete section through `decomposition-records-build`; never patch encoded marker data or
     the visible rendering independently.

   If a create failure says `mutationMayHaveSucceeded`, perform `issue-sub-issues-read` immediately
   and replace the local reconciliation state before any decision. A unique valid key match recovers
   the result; zero, multiple, or marker-error matches remain blocked and are never blindly retried.
   If any later child fails, preserve created children, mark all missing or unknown drafts explicitly
   in the canonical comment when its hash guard still permits that update, retain
   `effective-flow-needs-planning`, report fresh re-entry through
   `effective-flow plan-issue <parent>`, and stop only this parent. Never delete or recreate a valid child.

   This three-read sequence and its duplicate checks protect the approved sequential/re-entry
   workflow but are not a cross-process lease. The forge comment update is a non-atomic
   read-then-PATCH and the provider exposes no supported conditional unsafe write here, so
   simultaneous writers can still race after the last pre-create read. Never claim the body hash
   closes that TOCTOU window; if a duplicate or uncertain result becomes visible, stop and reconcile
   rather than retrying.

4. With a baseline that has no critical findings, ask for this issue only:

Ask the user: **Start the deep interactive plan review now?**
- Yes -- Search now for unknown, imprecise, and decision-requiring points
- No -- Continue later via plan-issue <issue>

Do not reuse this answer for any other selected issue.

- On **Yes**, read ``tools/plan-review.md`` and invoke it in **issue mode** with exactly this issue,
  the current canonical planning-comment ID and body, its freshly computed body hash, the
  already-resolved tracker adapter, the concrete artifact language, and the literal line
  `Next steps: suppressed` on its own line, because that run returns its result here. The internal
  review may update only this existing comment and returns whether implementation-blocking open
  points remain. Do not create a plan file or a second comment.
- On **No**, retain the approved automatic baseline and record no artificial open point; the
  next-step block of Phase 5 carries the optional later re-entry.

After either branch, apply the readiness decision. For an approved decomposition, readiness also
requires a fresh `decomposition-container-compare` over the stored canonical comment and fresh
native-child list to return `ok: true`; every active record must be `created` and resolve to exactly
one same-parent native child with the recorded identity. The parent then remains a container and is
not itself an additional implementation work item. If the deep review is ended, deferred after it
starts, fails to persist, or returns a blocking open point, keep or add
`effective-flow-needs-planning` and persist the exact re-entry need in the comment. Otherwise
remove `effective-flow-needs-planning`, plus any present `firmo-needs-planning` variant on the
forge target. Never set
`effective-flow-issue-done`.

Set the issue task to `completed`, annotated `[blocked]` when it was not released, and continue
with the next selected issue. One blocked issue must not prevent the remaining issues from
receiving their own baseline, question, comment update, and label decision.

### Phase 5: Summary

Report per issue whether it was released for implementation, retained for planning with its open
points, or failed closed during comment persistence. This skill itself implements nothing.

Emit the next-step block per `next-steps` as the last element of the report. A run that released at
least one issue takes the released row; a run that released none takes the retained row.

## Rules

- Do not change any implementation files and generate no code.
- Do not create any `<plan.dir>/` file.
- If clarification, baseline, or deep review does not enable a reliable plan, leave
  `effective-flow-needs-planning` in place and document the blocking decision in the canonical
  comment's open-points section.
- A nonempty open-points section is implementation-blocking. Never remove the Needs-Planning
  label while an entry remains.
- Process multiple issues artifact by artifact. Questions and answers apply only to the currently
  named issue.
- Child creation is legal only through `issue-sub-issue-create` with the active parent supplied.
  Generic `issue-create`, a create-then-link sequence, sibling creation, and checklist degradation
  are forbidden in this tool.
- Never set `Co-Authored-By` trailers and do not expose internal IDs in comments.
- Give the user a brief status update after each phase.
