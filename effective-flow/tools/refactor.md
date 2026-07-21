## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with that contract as the worker instructions. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

# Effective Flow Refactor

You are the orchestrator for the refactoring workflow.

## Goal

Code is restructured without changing existing behavior, with before/after validation as a safety net.

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

**Load on demand:** Read `shared/runtime-state-safety.md`, when any wisdom, report, memory, backlink, runtime migration, or worktree mutation is imminent.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when any wisdom, report, memory, backlink, runtime migration, or worktree mutation is imminent.

# Project-role detection and routing

Use this contract whenever implementation, review, testing, validation, or documentation depends on the role of an affected file. Classify the requested files or domains independently; never infer one route for the whole repository from its first manifest.

## Ordered routing table

The table between the marker comments is a build-validated runtime contract. Keep its columns and route IDs stable. Evaluate rows in ascending priority and stop at the first matching row for each affected file or domain.

<!-- project-routing-table:start -->

| Priority | Route                         | Matcher            | Implementer                                           | Reviewer                             | Decision         |
| -------: | ----------------------------- | ------------------ | ----------------------------------------------------- | ------------------------------------ | ---------------- |
|       10 | `excluded-generated-vendored` | `excluded`         | —                                                     | —                                    | `exclude`        |
|       20 | `documentation`               | `documentation`    | ``effective-flow-code-documenter`` / ``effective-flow-docs-writer`` | ``effective-flow-code-validator``           | `route`          |
|       30 | `tooling`                     | `tooling`          | ``effective-flow-generic-implementer``                       | ``effective-flow-code-validator``           | `route`          |
|       40 | `frontend-js-ts`              | `frontend-js-ts`   | ``effective-flow-ui-implementer``                            | ``effective-flow-frontend-reviewer``        | `route`          |
|       50 | `node-backend-cli`            | `node-backend-cli` | ``effective-flow-nodejs-implementer``                        | ``effective-flow-nodejs-reviewer``          | `route`          |
|       60 | `rust`                        | `rust-product`     | ``effective-flow-rust-implementer``                          | ``effective-flow-rust-reviewer``            | `route`          |
|       70 | `generic-product`             | `generic-product`  | ``effective-flow-generic-product-implementer``               | ``effective-flow-generic-product-reviewer`` | `route-degraded` |
|       80 | `ambiguous`                   | `otherwise`        | —                                                     | —                                    | `clarify`        |

<!-- project-routing-table:end -->

## Matcher contract

Apply the matchers in table order:

- **Excluded generated or vendored content:** generated outputs, vendored dependencies, third-party source, build output, and dependency caches are excluded from direct editing and review by default. If the task explicitly changes a generator or vendor-update mechanism, route the owned source or tooling operation instead of its output.
- **Documentation:** documentation-only files and domains use the code documenter or docs writer according to the requested audience and artifact. Technical validation remains repository-native.
- **Tooling:** CI/CD, build and release tooling, container configuration, dependency manifests and lockfiles, repository metadata, and formatter, linter, editor, or task-runner configuration use the tooling-only generic implementer. A language manifest does not make that manifest product code.
- **Frontend JavaScript/TypeScript:** UI components and browser-facing JavaScript/TypeScript use the UI implementer and frontend reviewer. Strong file signals include JSX/TSX, Vue or Svelte files and established frontend/client/component domains.
- **Node.js backend or CLI:** server, API, service, worker, and CLI JavaScript/TypeScript use the Node.js implementer and reviewer. Repository dependencies, entry points, and neighboring code distinguish this route from frontend code.
- **Rust product code:** Rust source and Cargo product domains use the Rust implementer and reviewer.
- **Generic product fallback:** clearly identified product code outside the specialized routes uses the generic product implementer and reviewer. This includes Python, Go, JVM, .NET, Ruby, PHP, Swift, and other or unknown languages when the task, path, manifest, or neighboring code establishes the product role.
- **Ambiguous:** if neither file role nor product/tooling ownership can be established safely, pause for one focused clarification. Never use the tooling-only generic implementer merely because no specialist language matched.

Explicit task scope and the closest repository instructions take precedence over filename heuristics. Generated, vendored, documentation, and tooling roles take precedence over language signals.

## Mixed repositories

Partition mixed changes per affected file or coherent domain. Preserve every recognized specialist bucket, route non-specialized product files through the generic product bucket, and route tooling and documentation separately. Run only the agents needed for non-empty buckets; parallelize only when the buckets are cleanly separable.

## Degraded product route

Before delegating a clearly identified generic product bucket, state visibly that Effective Flow is continuing with repository-native generalist implementation and qualitative review, with reduced language-specific specialist depth. This notice is informational and does not create a routine approval gate.

The generic product agents discover commands and conventions in this order:

1. scoped repository instructions
2. CI workflows and task runners
3. manifests and lockfiles
4. existing tests and neighboring code
5. current library documentation through an available documentation skill

Do not invent commands, install a toolchain or dependency without approval, or claim language expertise. If no safe native command or convention can be established, pause for a focused clarification. Validation and tests report unavailable checks as skipped with the reason.

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

## Plan status convention

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default
`docs/plan`).

Plan files in `<plan.dir>/` use exactly one canonical status marker in their header. The marker may be written in either German or English:

- open (German): `**Planungsstatus:** Nicht umgesetzt`
- completed (German): `**Planungsstatus:** Umgesetzt`
- open (English): `**Plan status:** Not implemented`
- completed (English): `**Plan status:** Implemented`

Both marker forms are equivalent. Only one language is used per plan file. The marker is not an
independent language choice: it is part of the complete plan language resolved by "Language
resolution" (`language.workflow` for a new plan, or the preserved language of an existing plan).

### Canonical bilingual plan contract

Readers map these complete forms to the same internal meanings; writers choose one column and
use it consistently throughout the artifact:

| Meaning              | German                                              | English                                      |
| -------------------- | --------------------------------------------------- | -------------------------------------------- |
| Status, open         | `**Planungsstatus:** Nicht umgesetzt`               | `**Plan status:** Not implemented`           |
| Status, completed    | `**Planungsstatus:** Umgesetzt`                     | `**Plan status:** Implemented`               |
| Source               | `**Quelle:**`                                       | `**Source:**`                                |
| Workflow             | `**Empfohlener Workflow:**`                         | `**Recommended workflow:**`                  |
| Doc category         | `**Doku-Kategorie:**`                               | `**Doc category:**`                          |
| Target path          | `**Ziel-Pfad:**`                                    | `**Target path:**`                           |
| Requirement          | `## Anforderung`                                    | `## Requirement`                             |
| Architecture         | `## Architekturentscheidungen`                      | `## Architecture decisions`                  |
| Affected files       | `## Betroffene Dateien`                             | `## Affected files`                          |
| Implementation       | `## Implementierungsdetails`                        | `## Implementation details`                  |
| Approach             | `### Vorgehen`                                      | `### Approach`                               |
| Component structure  | `### Komponentenstruktur`                           | `### Component structure`                    |
| State management     | `### Zustandsverwaltung`                            | `### State management`                       |
| API integration      | `### API-Integration`                               | `### API integration`                        |
| Styling approach     | `### Styling-Ansatz`                                | `### Styling approach`                       |
| Accessibility        | `### Barrierefreiheit`                              | `### Accessibility`                          |
| Edge cases           | `### Randfälle`                                     | `### Edge cases`                             |
| Acceptance criteria  | `## Akzeptanzkriterien`                             | `## Acceptance criteria`                     |
| Validation plan      | `## Validierungsplan`                               | `## Validation plan`                         |
| Assumptions          | `## Annahmen und offene Punkte`                     | `## Assumptions and open points`             |
| Plan review          | `## Plan-Review`                                    | `## Plan review`                             |
| Review result        | `**Ergebnis:** Freigegeben` / `Überarbeitung nötig` | `**Result:** Approved` / `Revision required` |
| Review summary       | `### Zusammenfassung`                               | `### Summary`                                |
| Plan-review findings | `### Befunde`                                       | `### Findings`                               |
| Open points          | `## Offene Punkte`                                  | `## Open points`                             |
| Empty open points    | `- Keine offenen Punkte.`                           | `- No open points.`                          |
| Test results         | `## Testergebnisse`                                 | `## Test results`                            |
| Review findings      | `## Review-Befunde`                                 | `## Review findings`                         |

Tables and finding prose follow the same rule. Plan file tables use `Datei` / `Beschreibung`
and review scorecards use `Bereich` / `Kritisch` / `Wichtig` / `Hinweis` in German; English uses
`File` / `Description` and `Area` / `Critical` / `Important` / `Note`. Review dates, reviewer
labels, summary statuses, and no-findings prose are likewise rendered wholly in the plan
language. Machine-stable values called out below are the only exceptions.

Workflow routing values and skill references remain stable: `Feature`, `Bugfix`, `Refactoring`,
`Documentation`, and the referenced `effective-flow build`/`effective-flow fix`/`effective-flow refactor`/
`effective-flow docs` token are not translated. Doc-category values and target paths likewise remain
`user-guide`, `developer-guide`, `operations`, `runbooks`, and their stable paths.

Rules:

- The status marker must be written exactly as in the four canonical examples above, including bold, colon, and the capitalization of the marker keys and values.
- The plan status only applies when exactly one line with the prefix `**Planungsstatus:**` or `**Plan status:**` is present. Multiple status lines (even in different languages) make the plan status unclear (see below) and should be corrected.
- The only valid value pairs are the four key-value combinations listed above. Mixed forms of a German key and an English value or vice versa (e.g. `**Plan status:** Umgesetzt`) are **not** considered valid.
- Other values such as `Open`/`Done`, `Pending`/`Complete`, or arbitrary free text do not count either.
- Other occurrences of „Nicht umgesetzt“, „Umgesetzt“, "Not implemented", or "Implemented" in review findings, ADR rationales, or body text do not count as a plan status.
- If the marker is missing, occurs multiple times, contains an invalid value, or uses a mixed form of key and value language, the plan status is unclear. In that case, do not automatically treat the plan as open or completed.
- A writer must not combine fields or sections from both columns. A mixed plan is unclear and is
  not automatically rewritten. A requested translation converts the complete plan contract.
- When a workflow sets the status to completed, the complete plan language is preserved: a German marker becomes `**Planungsstatus:** Umgesetzt`, an English marker becomes `**Plan status:** Implemented`.

## Recommended skills

- `codebase-improvement`
- `port-codebases`

## Delegation contract: generic audit reasoning

The central skill `codebase-improvement` is the **declared owner** of the generic audit
reasoning (classification `route-when-relevant`, see
[Skill ownership](../../docs/developer-guide/skill-ownership.md)). Where this reasoning applies,
its guidance is **authoritative**, not optional advice; this tool carries **no second copy** of
the audit playbook – only the output contract, the lifecycle constraints, and a minimal
fallback.

**The skill owns the generic reasoning (the "how"):**

- repository reconnaissance and project-convention detection,
- evidence standards plus finding validation, rejection, and deduplication judgment,
- leverage-based prioritization, complexity and over-engineering lenses,
- gap analysis, root-cause placement, scope/risk control, and plan quality.

**This tool owns the orchestration and the output contract (the "what/when"):**

- the `effective-flow` entry point, the scope gate, and the progress updates,
- the agent selection, parallelization, and – in review – the directory-split heuristic,
- the finding schema (IDs `R-XXXXXXX`, severity, complexity, confidence gate), the
  report/tracker persistence, baselines/behavior invariance, resumability, and delivery.

**Output contract to the skill (binding).** Hand the skill the Effective Flow finding schema
(file+line, severity, complexity, area, problem, recommendation, confidence) as the target
format and instruct it to create **no report, issue, or delivery artifact of its own** and
**not** to stop after a mere summary. It delivers reasoning and finding candidates in this
schema; the deterministic thresholds and keys (confidence gate, dedup keys, scorecard bounds),
the persistence, the baseline, and the delivery are owned exclusively by this tool. That way no
two persistence/delivery loops run in parallel.

**Special branches** still route to their narrower owners when their declared scope applies:
`effective-web` (frontend, accessibility, CSS architecture, React), `software-architecture`
(architecture reasoning), `port-codebases` (cross-language/runtime migration),
`smart-dependency-updater` (dependency updates), and `decision-records` (ADR authoring) –
consistent with the [ownership inventory](../../docs/developer-guide/skill-ownership.md).

**Minimal fallback (skill missing).** If `codebase-improvement` is not available (not
installed, `skills.enabled: false`, or disabled via `exclude`), the short core guidance in this
tool's "Minimal fallback without skill" section applies. It keeps the workflow functional but
holds **no** second full audit handbook on hand – full depth comes only with the skill.

`refactor.md` carries more inline reasoning than `effective-flow review`; the delegable part is
the **gap analysis and plan validation** in Phase 1 (root cause, complexity/over-engineering,
scope, risk, refactor-plan quality). The cross-language/runtime migration branch routes
further to `port-codebases`. Baseline, behavior invariance, reports and delivery remain
Effective Flow contract.

## Project conventions

If the project has an `AGENTS.md`, read it before analysis and refactoring and follow its guidance for structure, boundaries, tests, review and commits.

## Completion protocol

When you use internal sub-agents, give them this response protocol:

- `DONE` for fully completed
- `ABORT: [reason]` for not completable

Check by the orchestrator:

1. `DONE`: phase completed.
2. `ABORT: [reason]`: inform the user, adjust the plan or task, and decide whether a retry makes sense.
3. No keyword: retry with escalation.

### Retry escalation

When an internal sub-agent ends without `DONE` or `ABORT`:

1. Retry 1: same task with a continuation hint
2. Retry 2: simplified task with reduced scope
3. Retry 3: minimal task for only the most critical subtask
4. After 3 failed attempts:
   - inform the user
   - clarify the options as free text: complete manually, continue with the next phase, abort the workflow

## Goal-driven completion control

Internal "repeat until done" loops of this workflow follow a uniform goal pattern instead of an ad-hoc formulated loop. The pattern adopts the three principles of the native `/goal` (Codex and Claude Code). At explicit goal gates, the directly following central `goal-start-action` fragment renders the action after an authorized autonomous choice per harness.

### The three principles

1. **Declare the completion condition up front.** Before the implementation work begins, formulate exactly one explicit, measurable completion condition. Derive it from the acceptance criteria and the validation plan of the basis (plan file, diagnosis or agreed scope). A good condition names the target state, the concrete check and the scope boundary – i.e. also what is deliberately not changed.
2. **Verify independently.** Do not check the condition by self-assessment, but via the independent instances anyway provided for it: ``effective-flow-code-validator`` for technical checks and the appropriate reviewer for content ones. The condition counts as fulfilled only once these instances confirm it.
3. **Loop with a bound.** If verification does not confirm the condition, fix the cause and verify again. Bound the internal correction rounds (guideline: three). If the condition still does not hold afterwards, abort the internal loop and escalate to the user instead of running on indefinitely – approach as in the retry escalation of the done protocol.

### Explicit goal query for autonomous runs

At the approval boundary of this workflow – where the completion condition is already fixed and the workflow is waiting for approval anyway – the user gets an **explicit choice** whether the remaining phases continue gated or autonomously under the native `/goal`. This replaces the earlier passive co-emitting of a `/goal` string: the option is actively queried, not merely offered. Workflows with this explicit gate include the central `goal-start-action` fragment directly after this control fragment.

#### When the query is omitted

Skip the goal query entirely (no extra option, no goal-start action and no `/goal` string) when the workflow runs as a **non-interactive sub-agent** of a superordinate orchestrator where no direct user interaction is intended – recognizable from the invocation context, for example "[Context from effective-flow apply-review: …]". `effective-flow apply-review` already steers its autonomous run at its own gate; an additional goal query per sub-delegation would be pointless there. Direct invocations and the handover through `effective-flow apply-plan` (interactive, individual) do **not** count as such delegation – there the goal query is retained.

#### Form of the query

- If the approval boundary is a yes/no approval, extend the approval question with a third option "Autonomous via `/goal`" next to "Yes" (continue gated) and "Adjust".
- If the approval boundary is a selection question (e.g. update groups) or if there is no yes/no approval at this boundary (e.g. because a planning phase was skipped), directly ask a concise standalone follow-up question "Run the remaining phases autonomously under `/goal`?". Depending on the interaction surface, use either yes/no answers or the explicit options "Continue gated" and "Autonomous via `/goal`".
- At the three-option approval gate, only "Autonomous via `/goal`" authorizes the harness-specific goal-start action; "Yes" continues gated and "Adjust" returns to clarification.
- At the standalone follow-up question, "Yes" or "Autonomous via `/goal`" authorizes the harness-specific goal-start action; "No" or "Continue gated" continues gated.
- No other response and no omitted query authorizes the goal-start action. On every gated path, **no** `/goal` string is emitted. The internal approval gates are retained in any case.

Rules for the `/goal` prompt and its objective in every harness path:

- **Self-sustaining:** Reference the underlying plan file, if present, and instruct to run through the remaining phases of this workflow – not "somehow make the criteria green".
- **Measurable:** Name the completion condition with the checks actually provided in the respective workflow (e.g. acceptance criteria fulfilled, project-configured checks green and – if the workflow has a review phase – reviewer without open critical findings) and the scope boundary. Leave out checks that do not apply.
- **Platform-neutral objective:** Restrict yourself to the condition text after `/goal `; that exact text is both the direct Codex `objective` and the objective in every prompt handoff or fallback.
- **Copy-ready presentation:** Whenever a `/goal` prompt is output for the user to paste – including a fallback after a failed direct start – put the fully resolved single-line command as the sole content of a dedicated fenced `text` code block. Keep the cause, explanation and paste prompt outside the fence; do not add a label, comment or other text inside it.
- **Only at gate-free boundaries:** Offer the autonomous run exclusively at approval boundaries after which no further approval gate follows, so an autonomous run does not get stuck at a later gate.

Form (replace placeholders, single line):

```text
/goal Fully implement <plan file or agreed task> and run through the remaining phases of this workflow: all acceptance criteria fulfilled, project-configured checks green<, reviewer without open critical findings – only if the workflow has a review phase>. Change nothing outside the scope. Stop when all criteria hold.
```

## Harness-specific goal-start action

When the explicit goal query in "Goal-driven completion control" authorizes an autonomous run, perform this harness-specific action:

After the user explicitly chooses the autonomous `/goal` option, output the full copy-pasteable `/goal` prompt prominently and ask the user to paste it as a new input. Use only this prompt handoff; without a pasted prompt, the workflow continues gated.

## Delivery and worktree integration

This shared fragment ties code-changing workflows to delivery branches, pull requests and
Git worktrees. The general values for base branch, branch-name construction and
completion action live in the `delivery` config block; the `worktree` block controls
exclusively whether and how the implementation runs in a separate Git worktree.

**By default the implementation runs in a Git worktree** (`worktree.enabled` default `true`):
an existing linked or harness-native worktree is reused, otherwise Effective Flow creates one
with its own branch. As soon as work happens in a worktree or on a dedicated delivery branch,
**delivery is implicitly active** and completes via `merge`
(default) or `pr`. There is no separate `delivery.enabled` switch anymore (see
"Delivery is implied by worktree/branch").

Only when the user explicitly asks for in-place work without a worktree and wants no
branch/PR/merge action does the workflow behave as if without this fragment: no
forced branch creation, no forced commits and no automatic
PR creation.

`<plan.dir>` is the plan directory from the Effective Flow configuration (project setup ADR) `plan.dir` (default
`docs/plan`).

### Roles of the config blocks

- **`delivery`** describes the delivery branch and its completion: base ref,
  branch prefix, completion action and return target.
- **`worktree`** describes exclusively the execution location: whether a worktree
  is used, where it lives and which setup runs in it.

Scope boundary: this fragment is **not** the per-finding worktree mechanism from
``tools/apply-review.md`` (`applyReview.worktree`). That one isolates parallel local
review findings and folds commits back onto the current branch via cherry-pick.
This fragment creates delivery branches for PR, merge or "branch only". Both
may use the same physical `baseDir`, since session and path segments
distinguish them.

## Verified execution location

Every write-capable phase and delegated worker uses an **execution-location receipt**. The
receipt keeps `EXECUTION_ROOT` and `RUNTIME_STATE_ROOT` separate: tracked project work follows
the selected checkout, while private `.effective-flow/` state remains in the repository's main
checkout. It replaces any assumption that a one-time `cd`, an inherited current working
directory, or a subagent spawn option will keep later operations in the intended checkout.

### Receipt

Create the receipt before worktree creation, report-source resolution, or the first
write-capable action, whichever comes first. Pass it unchanged to every worker that may edit
files, read or mutate runtime state, run a formatter or a test that writes caches, run setup,
stage or commit, switch branches, or clean up a worktree. Record:

- the canonical absolute repository identity: the physical path returned by
  `git rev-parse --git-common-dir`, resolved against the command's working directory when Git
  returns a relative path;
- `EXECUTION_ROOT`, the canonical absolute execution root from
  `git rev-parse --show-toplevel`;
- `RUNTIME_STATE_ROOT`, the canonical absolute main-checkout root resolved by the procedure
  below;
- the checkout identity: either the exact branch name, or `detached` plus the exact commit OID
  when detached HEAD is explicitly expected;
- the origin: `in-place`, `harness-managed`, or `effective-flow-created`;
- setup ownership and status: who may run setup and whether it is pending, complete, skipped,
  or externally managed;
- the workflow or component that owns the receipt and its purpose.

Canonicalize paths before comparison: resolve symlinks, `..`, relative segments, and platform
case behavior through the host's physical-path facility. Path shape does not prove ownership.
A pre-existing user-created linked worktree counts as `harness-managed` for lifecycle purposes:
it is external to Effective Flow and must not be removed by this workflow.

### Runtime-state root

Before report-source resolution or any operation that may create or enter a delivery, native,
or component worktree, run `git worktree list --porcelain` from the verified current checkout.
Parse records by their empty-line separator and use only the first record, which Git defines as
the main worktree. The first record of `git worktree list --porcelain` must begin with exactly
one `worktree <path>` line. Reject a missing or duplicate path field, an empty path, or any record
that contains the boolean line `bare`. A `bare` first record has no usable main checkout and
therefore cannot own runtime state.

Canonicalize that path physically and require it to exist as a directory. From the candidate
root, require `git rev-parse --show-toplevel` to resolve back to the same root and
`git rev-parse --git-common-dir` to resolve to the same canonical Git common directory recorded
as the repository identity in the execution receipt. Record the result as
`RUNTIME_STATE_ROOT`. In an in-place run from the main checkout, `EXECUTION_ROOT` and
`RUNTIME_STATE_ROOT` are the same physical path. In a linked, native, delivery, or component
worktree, they differ.

Entering or creating another worktree changes only `EXECUTION_ROOT` and its checkout fields; it
must not change `RUNTIME_STATE_ROOT`. Revalidate the retained runtime root from the current
porcelain first record and its common-directory identity before every runtime-state read or
mutation and after resume or Handoff. A missing, moved, newly bare, repository-mismatched, or
otherwise unusable runtime root fails closed. Preserve every checkout and all existing state;
never fall back to `EXECUTION_ROOT`. If the root is valid but its runtime-state safety checks
fail, direct the user to `effective-flow setup` as specified by that contract.

### Fail-closed preflight

At each write-capable orchestrator or worker boundary, and again after resume or Handoff,
verify from the receipt's absolute execution root:

1. `git rev-parse --show-toplevel` resolves to the recorded execution root.
2. `git rev-parse --git-common-dir` resolves to the recorded repository identity.
3. `git branch --show-current` equals the recorded branch. If detached HEAD was explicitly
   recorded instead, the branch output must still be empty and `git rev-parse HEAD` must equal
   the recorded OID.
4. For a linked worktree, `git worktree list --porcelain` contains an entry whose canonical
   path and checkout identity match the receipt.

If any value is missing, cannot be canonicalized, or differs, abort before writing. Report the
expected and actual root and checkout identity, and retain every checkout. Do not edit, run
setup, run a formatter or test that may write, stage, commit, switch branches, or clean up.

After a Handoff or resume, a harness may provide a different execution root. Adopt it only by
issuing a new `harness-managed` receipt after proving the same repository identity and that the
expected work is present and consistent. Otherwise abort for reconciliation. A prior successful
preflight never authorizes later writes from an unverified runtime location.

### Rooted operations

After preflight, root tracked project, validation, staging, commit, and worktree lifecycle
operations in `EXECUTION_ROOT`:

- pass the absolute root as the per-call working directory when the harness supports it;
- use absolute paths for file tools;
- use `git -C <EXECUTION_ROOT> ...` for Git operations when a per-call working directory is not
  guaranteed.

Do not rely on a previous `cd` or on a worker inheriting the orchestrator's current directory.
If a worker cannot establish and verify the assigned root, it returns `ABORT` without writes.
Edits, validation, commits, and lifecycle operations for one receipt stay in that receipt's
execution root; component and delivery receipts are never interchangeable.

Root every `.effective-flow/` read, collision check, directory creation, report or backlink
write, cache or memory read/write, migration, and wisdom operation in `RUNTIME_STATE_ROOT`.
Resolve the concrete target to an absolute handle before entering another worktree and retain
that handle. For an existing path, physically canonicalize the path itself; for a target that
does not exist yet, physically canonicalize its nearest existing ancestor and append only the
validated missing path segments. The result must remain below the canonical absolute
`<RUNTIME_STATE_ROOT>/.effective-flow/` directory, and report handles must remain below
`<RUNTIME_STATE_ROOT>/.effective-flow/review/`. Reject `..`, path aliasing, or any existing
symlink that escapes those directories. A project-relative path is only presentation; it is
never an operational handle after the roots diverge.

### Harness-owned worktrees

- **Claude Code:** Subagents start from the parent context and directory changes do not persist
  as a portable cross-call contract. Native `isolation: worktree` creates a separate
  Claude-managed worktree. Use it only for a deliberately self-contained delegation that does
  not need an already selected Effective Flow worktree. Never combine native isolation with an
  assigned Effective Flow execution root.
- **Codex app:** A Codex app worktree is harness-managed, may start in detached HEAD, and remains
  associated with its task across Handoff. Reuse and revalidate it; do not wrap it in another
  Effective Flow worktree or remove it. Detached HEAD is valid only when the receipt explicitly
  pins its OID. If delivery requires a branch, create or adopt that branch through the supported
  app flow, then issue and verify a new branch receipt before committing.

### Setup and cleanup ownership

Automatic setup runs only when a receipt is `effective-flow-created` and its setup status is
`pending`. A reused linked or harness-native worktree is assumed to be prepared by its owner;
mark setup `externally managed` and do not repeat it. Run setup there only after an explicit user
request, or after reporting a missing prerequisite and obtaining the workflow's required
decision.

Remove a worktree or delete its temporary branch only when all of these are true:

1. Its receipt says `effective-flow-created` and names this workflow/component and purpose.
2. A fresh fail-closed preflight matches the recorded repository, root, and checkout identity.
3. `git worktree list --porcelain` still contains the matching entry.
4. The worktree is clean under the workflow's existing cleanup policy; unexpected untracked or
   modified files make it dirty.

If any proof fails, retain the worktree and branch and report why. Never force-remove a dirty,
moved, missing, mismatched, reused, in-place, user-owned, or harness-managed worktree. A failure
between `git worktree add` and successful receipt creation also leaves the new worktree in place
for manual reconciliation.

Cleanup targets only the exact Effective Flow-owned execution/component worktree named by its
receipt. It must never remove, rename, or otherwise alter `RUNTIME_STATE_ROOT` or use the runtime
root as a cleanup target. Runtime reports, backlinks, memory, caches, migrations, and wisdom
state remain in the main checkout after an owned worktree is removed.

### Configuration

If the Effective Flow configuration (project setup ADR) pins corresponding values, they override these defaults (schema shown here for illustration):

```json
{
  "delivery": {
    "baseBranch": "origin/main",
    "branchPrefix": "effective-flow",
    "completion": "merge",
    "returnBranch": "auto"
  },
  "worktree": {
    "enabled": true,
    "setup": "auto",
    "baseDir": ".effective-flow/.worktrees"
  }
}
```

Missing values have these defaults:

- `delivery.baseBranch`: `"origin/main"`
- `delivery.branchPrefix`: `"effective-flow"`
- `delivery.completion`: `"merge"` (merge into the target branch as the default completion)
- `delivery.returnBranch`: `"auto"` (local branch part from `delivery.baseBranch`)
- `worktree.enabled`: `true` (implementation runs in its own worktree)
- `worktree.setup`: `"auto"`
- `worktree.baseDir`: `.effective-flow/.worktrees`

Valid values:

- `delivery.completion`: `"pr"`, `"merge"`, `"branch"`
- `delivery.returnBranch`: `"auto"` or a local branch name as a string
- `worktree.enabled`: `true`, `false`
- `worktree.setup`: `"auto"`, `"none"` or an explicit setup command as a string

`delivery.enabled` is **retired**: delivery is no longer activated via its own switch,
but is active whenever work happens in a worktree/dedicated branch
(see "Delivery is implied by worktree/branch"). A `delivery.enabled` still
present in a legacy config is ignored on read and removed by the full config migration
(see "Config migration").

### Config migration

Reading the Effective Flow configuration from the project setup ADR and the one-time consolidation
of a legacy config onto the current schema – in particular moving old delivery values out of
`worktree.baseBranch`/`worktree.branchPrefix`/`worktree.completion` into `delivery.*` and
removing the retired `delivery.enabled` – is handled by the shared fragment
"Config migration" (`config-migration.md`) once and centrally. This fragment performs **no** own
per-block migration anymore. Until a config is migrated, reading applies: new value from
`delivery.*` before legacy value from `worktree.*` before default; an existing
`delivery.enabled` is ignored.

### Determine mode (setup phase): Delivery is implied by worktree/branch

At the start of the actual implementation work, determine the effective mode:

- Before any fetch, setup, branch change or other write-capable action, issue and verify an
  execution-location receipt for the current checkout. Before worktree creation, resolve and
  retain its verified `RUNTIME_STATE_ROOT` from the first record of
  `git worktree list --porcelain`; a path below `.effective-flow/.worktrees` does not prove
  ownership. Keep `EXECUTION_ROOT` and `RUNTIME_STATE_ROOT` separate for the entire run.
- **Worktree execution is active by default** (`worktree.enabled` default `true`). It
  stays off only when `worktree.enabled: false` is set or the user explicitly requests
  in-place work ("without worktree", "directly on the current branch").
- When the current receipt points to an existing linked or harness-native worktree rather than
  the repository's main worktree, reuse it as `harness-managed`. Do not create a nested delivery
  worktree, switch its branch, repeat automatic setup or remove it during handback.
- **Delivery is active as soon as work happens in a worktree or on a dedicated delivery
  branch** – so in the default case always. In addition, delivery is active when the
  user explicitly requests PR, branch or merge work (even with in-place work; then
  the delivery branch is created in the main repo).
- If the worktree is disabled via config (`worktree.enabled: false`), give a brief
  note that the (default) worktree mode is off via config. If the user then also
  requests no delivery action, perform no further steps from this fragment
  (in-place without delivery).

### Shared preconditions

When delivery or worktree is active:

1. `git` and, for worktree execution, `git worktree` must be available. The current execution
   receipt must pass the fail-closed preflight before continuing.
2. `delivery.baseBranch` must be resolvable. If it is a remote ref (e.g.
   `origin/main`), first run `git fetch REMOTE BRANCH`, so the delivery branch
   starts from the current remote state.
3. If the current HEAD has relevant uncommitted changes or local commits that
   are not contained in `delivery.baseBranch`, point that out. A delivery branch freshly
   created from the base branch does not contain this work. Only continue
   if the user confirms the chosen mode or the workflow creates a safe
   partial-diff PR by the procedure described below.
4. Construct delivery branch names: `<delivery.branchPrefix>/<skill>/<slug>`, e.g.
   `effective-flow/build/user-login`. Derive the slug from the plan title, the task description,
   the issue or finding. If the branch name already exists, append a
   numeric suffix and report the chosen name.

### Run-owned delivery state

Before creating or switching any delivery artifact, retain the original verified
execution-location receipt and initialize explicit current-run ownership flags for the delivery
worktree and branch. After the current run creates a delivery branch, record its exact name and
creation OID immediately; do not substitute the base ref or a later-moving remote tip. After the
current run creates a worktree, record that ownership separately from its
`effective-flow-created` receipt. A name, path, configured base directory or pre-existing receipt
never proves current-run ownership.

Carry this state through baseline validation and every later phase:

- original checkout receipt and checkout identity,
- delivery branch name and exact creation OID,
- whether this run created the delivery branch,
- whether this run created the delivery worktree,
- the delivery execution-location receipt.

For a reused `harness-managed` or user-managed worktree or branch, both creation flags stay
false. For in-place execution without delivery, no delivery artifact is recorded.

### Worktree execution

When worktree execution is active:

1. If the current receipt identifies a linked or harness-native worktree, keep that root and
   checkout identity and mark setup as `externally managed`. A detached harness-native checkout
   remains valid only at its pinned OID. If delivery requires a branch, create or adopt it
   through the harness-supported flow and issue a new verified receipt before committing; never
   silently switch a harness-managed worktree. The linked or native checkout becomes
   `EXECUTION_ROOT`; the porcelain main checkout remains `RUNTIME_STATE_ROOT`.
2. Otherwise determine the repo name from `basename "$(git rev-parse --show-toplevel)"` and use
   `worktree.baseDir` (default `.effective-flow/.worktrees`) as the base dir. Worktree path:
   `BASE_DIR/REPO_NAME/SESSION_ID`. Resolve a relative `BASE_DIR` against
   `RUNTIME_STATE_ROOT`, never against a disposable worktree. When that path is below
   `.effective-flow/`, resolve every missing base or parent directory that will be created.
   From `RUNTIME_STATE_ROOT`, apply the owning workflow's loaded “Runtime-state write safety”
   contract to each exact directory path immediately before its `mkdir`; a guard for the
   eventual worktree path does not authorize creating its parents. Apply the contract again to
   the exact `WORKTREE_PATH` immediately before `git worktree add`.
   Create the worktree and delivery branch with
   `git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> <BASE_REF>`, then immediately issue and
   verify an `effective-flow-created` receipt for the exact path, branch, workflow and delivery
   purpose. Record both artifacts as current-run-owned and capture the branch's exact creation
   OID before setup. If receipt creation or state recording fails, retain the worktree and branch
   for manual reconciliation.
3. Only for that newly Effective Flow-created receipt, run setup per `worktree.setup` and
   briefly announce the mode beforehand:
   - `auto` or missing: decide by lockfile – `pnpm-lock.yaml` →
     `pnpm install --frozen-lockfile --prefer-offline`, `package-lock.json` →
     `npm ci`, `yarn.lock` → `yarn install --frozen-lockfile`, `Cargo.toml` →
     `cargo fetch --locked`, `go.mod` → `go mod download`, `uv.lock` →
     `uv sync --frozen`, `poetry.lock` → `poetry install --sync`, no known
     file → no setup.
   - `none`: run no setup.
   - String value: run this explicit command in the worktree.
     Record the final setup status as `complete` or `skipped` before delegation.
4. Pass the full receipt, including both roots, to every subsequent phase and delegated worker
   that creates or changes code, tests, documentation, or runtime state. Each boundary runs the
   fail-closed preflight. Project operations are explicitly rooted in `EXECUTION_ROOT`; runtime
   reads and writes use retained absolute handles below `RUNTIME_STATE_ROOT`. This also applies
   through the completion phase and the final validator/formatter.

### In-place delivery without worktree

When delivery is active and worktree execution stays off:

1. Keep and verify the current checkout's `in-place` receipt, and remember the originally
   checked-out branch.
2. Ensure the working tree contains no uncommitted changes that
   should not become part of the delivery branch. If such changes exist,
   do not silently stage, stash or overwrite them; either obtain a user decision
   or use the partial-diff PR via worktree.
3. Create and check out the delivery branch from `delivery.baseBranch`.
4. Issue a new receipt for the delivery branch after switching. Record the branch as
   current-run-owned and capture its exact creation OID before setup or implementation. Run
   implementation, tests, validation and final formatting through explicitly rooted operations
   after a successful preflight at every write-capable boundary.
5. After completion, proceed per "Handback and completion action".

### Partial-diff PR via worktree

When the main checkout already holds changes that should not fully go into the PR,
a separate worktree is the preferred safe path, provided these
preconditions are met:

1. `git worktree` is available.
2. `delivery.baseBranch` is resolvable and, for remote refs, updatable.
3. The workflow knows an explicit list of the files that should go into the PR.

The procedure:

1. Create a fresh worktree branch from `delivery.baseBranch`, then immediately issue and verify
   a separate `effective-flow-created` receipt whose purpose is `partial-diff`.
2. Take only the selected delivery files from the main checkout into the worktree.
   Permitted sources for this selection are plan affected files,
   review finding scope, issue scope, known files produced by the workflow, or
   an explicit user selection.
3. In the verified execution root, check whether the taken-over files produce a meaningful diff
   against the base ref. If not, abort and create no empty PR.
4. Commit in the verified execution root and run `effective-flow pr` against
   `delivery.baseBranch`.
5. Remove the worktree only after the receipt passes the ownership-safe cleanup checks. Leave
   the delivery branch locally and the main checkout unchanged. Non-selected changes in the
   main checkout remain untouched.

A heuristic partial-diff selection by "all changed files
except <plan.dir>" is not allowed. The workflow must know the files to include or
ask. This reliably keeps newly created plans, `.effective-flow/` state and other
local working files outside the PR.

### What lives in the delivery branch and what stays in the main repo

Data-keeping invariant: **Of the Effective Flow artifacts, only plans are
committed.** Reviews (local reports) and investigations always stay local and
untracked; in remote mode reviews are tracked as issues instead (never in the repo),
investigations remain purely local in any case (see "Issue-tracker integration" and
`effective-flow investigate`).

- **In the delivery branch:** the actual code, test and documentation deliverables of the
  workflow as well as – if the workflow kept a plan file – its final
  state (in the implemented case the archived, implemented-marked plan file).
- **Only in the main repo, never committed:** pure Effective Flow bookkeeping and runtime state, i.e.
  all remaining `.effective-flow/` artifacts – `memory.json`, `cache.json`, local review reports
  under `.effective-flow/review/`, investigation reports under `.effective-flow/investigation/`,
  config migration status and wisdom files. Their operational paths are absolute handles below
  `RUNTIME_STATE_ROOT`, even while tracked work executes elsewhere.

### Abort handback before implementation

Use this handback only when a workflow must abort after delivery setup but before implementation,
for example when `maintain` finds a red baseline. It is separate from normal completion: do not
mark or archive a plan, commit, ask for or execute a completion action, push, merge or create a
pull request. Preserve all abort diagnostics before lifecycle cleanup.

Fail closed. Mutate only artifacts that the retained run-owned delivery state proves were created
by the current run:

1. **No delivery artifacts:** For in-place execution without delivery, perform no lifecycle
   cleanup. Report the unchanged checkout.
2. **Externally managed state:** For `harness-managed`, user-managed or adopted worktrees and
   branches, perform no lifecycle mutation. Report every retained path or branch and that it is
   externally managed.
3. **Effective Flow-owned worktree:** Only when both current-run creation flags are true and the
   receipt is `effective-flow-created`, freshly revalidate repository identity, execution root,
   checkout identity, purpose, worktree registration and clean status. Verify that both `HEAD`
   and the delivery branch tip still equal the recorded creation OID. If every proof passes, run
   `git worktree remove <WORKTREE_PATH>` without force. Revalidate that the branch still exists at
   the recorded creation OID and then delete it safely with `git branch -d <BRANCH_NAME>`. Never
   compare against a moving remote tip.
4. **In-place transient branch:** Only when the current run created the delivery branch, freshly
   verify the delivery receipt, clean status, exact branch name and recorded creation OID. Verify
   that the retained original checkout belongs to the same repository and can still be restored.
   Restore the original branch or detached OID first, revalidate its retained receipt, then
   revalidate and safely delete the unchanged transient branch with
   `git branch -d <BRANCH_NAME>`.
5. **Retention and partial cleanup:** Any dirty state, changed tip, ownership mismatch, receipt or
   registration mismatch, failed restoration, ordinary worktree-removal failure or safe
   branch-deletion refusal retains the affected artifact. Report its exact path or branch and the
   failed proof or command. If worktree removal or original-checkout restoration succeeds but
   branch deletion fails, report that partial cleanup explicitly and retain the branch. Never
   force-remove a worktree or force-delete a branch in this abort handback.

End the workflow immediately after reporting the abort handback. Do not enter implementation or
normal delivery completion.

### Handback and completion action (completion phase)

Following the workflow's regular completion logic (including goal verification).
The final status switch of the plan file to `Umgesetzt`/`Implemented` and its
archiving is handled by step 1 below at the delivery point – the implementing workflow therefore does **not** set the
status beforehand, but leaves it to this phase (exception: in-place without
delivery, see step 1):

**Update existing PRs:** If the delivery branch already has a pull request
and subsequent changes are needed, those changes are always created and pushed as new
commits on the same PR branch. Existing PR commits must not
be rewritten via `commit --amend`, interactive rebase, squash or force-push.
If a normal push fails because of diverged remote history,
stop and report the conflict instead of overwriting history.

1. **Mark the plan as implemented, archive it and take it into the delivery branch:**
   Provided the workflow kept a plan file, this is the **delivery point** at which
   the plan counts as implemented (immediately before the PR is opened or the delivery branch
   is merged):
   - Set the canonical status marker to `Umgesetzt`/`Implemented` (preserve the complete plan
     language: German plan → `**Planungsstatus:** Umgesetzt`, English plan →
     `**Plan status:** Implemented`).
   - Move the plan file via `git mv` to `<plan.dir>/archive/` (create the directory if
     needed), per "Archive of implemented plans" of the plan-file convention.
   - If the implementation ran in a worktree or partial-diff worktree, provide this final,
     archived and implemented-marked state in the worktree (under
     `<plan.dir>/archive/<file>`). Marking and move are **committed along with it** and
     are thereby part of the PR/merge (implementation documentation). The `.effective-flow/` artifacts stay in the
     main repo.
   - If the workflow kept no plan file, this step does not apply.
   - If the workflow exceptionally runs in-place without delivery (no worktree, no
     branch/PR/merge action), the workflow performs the same status switch and
     archive move directly in the working tree; the final commit/merge into the
     target branch is then the delivery event.
2. **Ensure commit:** Commit all intended changes in the delivery branch
   – code, test and documentation deliverables as well as the taken-over plan file – via the
   commit logic from `effective-flow commit` (stage exclusively known changed files
   explicitly, derive a concrete Conventional Commit message, never set a
   `Co-Authored-By` trailer). Resolve `language.git` for the human-readable commit description;
   keep Conventional Commit types stable. Workflows that have already committed their work
   (e.g. `effective-flow maintain` with one commit per group) only commit the
   plan file here afterwards, if needed. If there is nothing to commit: inform the user,
   remove an automatically created empty delivery branch and end without
   PR/merge.
3. **Determine completion action:** If `delivery.completion` has a valid value,
   use it and briefly report that the action was taken from the Effective Flow configuration
   (project setup ADR). Otherwise ask:

If Delivery was active and no valid value for `delivery.completion` is set: Ask the user: **How should the delivery branch be completed?**
- Pull request -- Push the branch and create a PR against the base branch via pr
- Merge -- Merge the branch locally into the base branch, without a PR
- Branch only -- Leave the branch in the local repo, no further action

4. **Withdraw an Effective Flow-owned worktree:** Only when the receipt is
   `effective-flow-created`, freshly reverify its repository, root, checkout identity, purpose
   and clean state, then run `git worktree remove <WORKTREE_PATH>`; retain the delivery branch
   in the local repo. If any proof fails or uncommitted remnants remain, keep the worktree and
   report the path and mismatch. For `in-place` and `harness-managed` receipts, perform no
   worktree cleanup; leave lifecycle handling to the user or harness. The verified
   `RUNTIME_STATE_ROOT` is never a cleanup target, and local review state there remains intact.
5. **Execute action:**
   - `branch` / Branch only: leave the branch, report the name and a note about later
     PR creation.
   - `merge`: the target is the local branch part of `delivery.baseBranch` or the
     explicit `delivery.returnBranch`. Ensure that the target working tree
     is clean; otherwise inform instead of merging. If the local target branch is
     behind its remote-tracking ref, point that out. Merge the delivery branch –
     prefer fast-forward, otherwise a merge commit; on conflict stop, leave the branch
     and inform the user, no automatic conflict resolution.
   - `pr`: delegate to `effective-flow pr` and pass the delivery branch, base branch and the
     workflow/change type (`feat`/`fix`/`refactor`/`docs`/`chore` depending on the implementing
     workflow and effect) as a title-type hint, so the PR title carries a
     valid Conventional Commit type — with a squash merge it is the release signal.
6. **Restore checkout:** For in-place delivery that switched the current checkout, after
   successful PR creation or with `branch`, switch back to `delivery.returnBranch` or, with
   `auto`, to the local branch part of `delivery.baseBranch`, provided the working tree is clean.
   Do not switch a reused harness-managed checkout. If an applicable switch-back fails,
   explicitly report the actual branch as a side effect.

## Wisdom Accumulation

At the start, create a session ID (e.g. via timestamp `date +%Y%m%d%H%M%S`) and use it consistently for the wisdom file `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`. This prevents collisions with parallel runs.

Contents:

- baseline values and their meaning
- structural decisions and rationale
- discovered dependencies
- problems during the restructuring
- wrong assumptions

## Project routing

Classify affected files and domains with the canonical “Project routing” contract above. Use
``effective-flow-generic-implementer`` only for tooling-class routes; clearly identified unsupported
product code receives the reduced-depth notice and ``effective-flow-generic-product-implementer``.

Current workflow for review-report backlinks: `effective-flow refactor`.

## Review-report backlinks

When this workflow implements a finding from an existing review-report file in `.effective-flow/review/`:

- before execution moves into any worktree, identify the absolute report handle; verify that it
  stays below `RUNTIME_STATE_ROOT/.effective-flow/review/` and retain it unchanged
- immediately before changing the report, revalidate `RUNTIME_STATE_ROOT`, canonical containment,
  and repository identity, then apply the owning workflow's loaded “Runtime-state write safety”
  contract from the main checkout to that concrete report path; a block leaves it unchanged
- append to the affected finding, as the last entry, a short implementation note
- start the note with a green check mark and write it in the preserved report language, for
  example `✅ Implemented on YYYY-MM-DD via [current workflow]` or
  `✅ Umgesetzt am YYYY-MM-DD über [current workflow]`
- update only the findings that were actually addressed by this workflow
- if several reports or findings are candidates, ask instead of marking indiscriminately
- never reconstruct a project-relative report path from `EXECUTION_ROOT` and never write a
  backlink into a same-named report in a delivery, native, or component worktree

## Open review-finding reports

When a workflow review produces findings that are not fixed directly before completion, write these open findings additionally into a review-report file under `.effective-flow/review/`.

Goal:

- Open or deliberately unimplemented findings do not get lost in long plan files.
- ``tools/apply-review.md`` can process the findings later in the familiar report format.
- The plan file stays completion documentation and only points to the external report.

Applies to findings with status in either complete report language:

- `Open`
- `Not implemented`
- `Not implemented (ADR: <slug>)` or comparable ADR statuses; legacy German
  `Nicht umgesetzt (ADR: <slug>)` remains readable

Do not carry over into the external report:

- Findings with status `Fixed`
- Findings that were fixed directly during the workflow
- purely informational reviewer comments without a concrete recommendation

### Report path

Resolve and revalidate the main-checkout `RUNTIME_STATE_ROOT` before any report lookup. All
directory existence checks, collision checks, report creation, and memory reads/writes use
absolute handles below that root; never inspect or fall back to a same-named path below
`EXECUTION_ROOT`.

If `<RUNTIME_STATE_ROOT>/.effective-flow/` is missing, apply the owning workflow's loaded
“Runtime-state write safety” contract from `RUNTIME_STATE_ROOT` to the exact directory
`.effective-flow/` immediately before its `mkdir`. If the review directory is missing,
separately apply it to that exact directory immediately before its `mkdir`. Apply the contract
again to the concrete absolute report handle immediately before writing the report and to the
absolute `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle as required by the loaded
“Shared memory-state mutation” contract. A blocked target remains unchanged.

1. Create `<RUNTIME_STATE_ROOT>/.effective-flow/review/` if needed.
2. If the workflow has a plan file as its basis, prefer:
   - `.effective-flow/review/review-report-YYYY-MM-DD-plan-<slug>.md`
   - on collision: `.effective-flow/review/review-report-YYYY-MM-DD-plan-<slug>-1.md`, `-2`, ...
3. If no plan file exists as a basis, use:
   - `.effective-flow/review/review-report-YYYY-MM-DD-WORKFLOW.md`
   - on collision: `.effective-flow/review/review-report-YYYY-MM-DD-WORKFLOW-1.md`, `-2`, ...
4. Always write the origin at the top of the report using the complete report language:
   - English: `**Origin plan:**`, `**Source workflow:**`, `**Source review:**`
   - German: `**Ursprungsplan:**`, `**Quell-Workflow:**`, `**Quell-Review:**`
   - Keep paths, skill references, and `None`/`Keiner` display semantics mapped internally.

### Finding IDs and memory

This report uses the same global finding IDs as `effective-flow review`.

1. Finish confidence and design-decision filtering plus any applicable deduplication, then fix the
   ordered list of findings that the report will actually publish.
2. If the list is empty, publish no finding report and reserve no IDs.
3. Otherwise use “Shared memory-state mutation” against the absolute
   `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle to reserve the exact range for that
   list. Format the returned consecutive numbers with seven digits, e.g. `R-0000021`.
4. Only after the reservation is atomically persisted and the lock is released, publish the
   report with that fixed mapping. If reservation fails, publish nothing. If report publication
   then fails or is interrupted, report the error and leave the reserved IDs as permanent gaps;
   never roll back or reuse them.

### Report format

Resolve `language.workflow` and use the matching complete canonical report format from
`effective-flow review` section "Report format". Do not duplicate the template here. When appending to
an existing report, preserve its clearly recognizable report language.

Additional header fields for workflow reports:

- Directly below the matching project-type field, set the three matching English or German
  origin/source lines defined above. The plan path uses `<plan.dir>` from configuration.
- All tables and finding blocks stay in the `effective-flow review` format.
- The `## Skipped findings (design decisions)` section is only emitted when such findings are present.

Rules:

- Critical findings may only remain in this report if the user has explicitly decided to complete the workflow despite an open critical finding.
- Determine the action as in `effective-flow review`: defect → `effective-flow fix`, structural problem → `effective-flow refactor`, missing functionality or safeguard → `effective-flow build`, pure documentation gap → `effective-flow docs`.
- Never enter anything automatically in `Developer note`. This field is reserved exclusively for the developer's manual notes and stays empty in automatically generated reports. When a finding was deliberately not implemented and an ADR exists, note the ADR reference in the `Status` via slug, e.g. `Not implemented (ADR: <slug>)`. Existing reports using `Nicht umgesetzt (ADR: <slug>)` remain readable.
- After writing, output the report path to the user.

Current workflow for plan references: Refactoring (`effective-flow refactor`).

## Plan references

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default `docs/plan`).

When the user references an existing plan file on invocation — for example `<plan.dir>/2024-06-01-feature.md`, `2024-06-01-feature.md`, `0030` (legacy number), or `feature` (title slug) — check the plan before the first substantive workflow phase.

### Resolve the reference

1. Resolve the reference to exactly one file under `<plan.dir>/` **or** `<plan.dir>/archive/`.
2. Permitted forms:
   - full path, e.g. `<plan.dir>/2024-06-01-feature.md` or `<plan.dir>/archive/2024-06-01-feature.md`
   - date-slug file name, e.g. `2024-06-01-feature.md`
   - legacy number, e.g. `0030` (resolved primarily via the H1 `# 0030: …`, see `Plan file convention`, not via the file name segment)
   - title slug, e.g. `feature`
3. If no file matches: report the error and note that `effective-flow open-plans` can list open plans.
4. If multiple files match: ask the user for the specific file.

### Check the status

1. Read the plan file fresh from the file system.
2. Determine the implementation status according to the plan status convention: exactly one line with the prefix `**Planungsstatus:**` or `**Plan status:**` and a valid value; if the status line is missing, duplicated, or invalid, the status is unclear.
3. Status rules (both marker languages are equivalent):
   - exactly one status line `**Planungsstatus:** Nicht umgesetzt` or `**Plan status:** Not implemented` → the plan can be used as a basis.
   - exactly one status line `**Planungsstatus:** Umgesetzt` or `**Plan status:** Implemented` → ask the user whether the plan should be implemented again, only checked, or whether the workflow should be aborted.
   - missing or contradictory status → check whether `## Testergebnisse` / `## Test results` or
     `## Review-Befunde` / `## Review findings` are present. If so, treat the plan as probably
     implemented and ask. If not, ask whether the plan should be used as an unbuilt specification.

### Check the workflow recommendation

1. Check whether exactly one canonical line `**Empfohlener Workflow:** ...` or
   `**Recommended workflow:** ...` is present in the header. It must match the language of the
   complete plan; a mixed header makes the language unclear.
2. Determine the recommendation:
   - Feature or `effective-flow build` → `effective-flow build`
   - Bugfix or `effective-flow fix` → `effective-flow fix`
   - Refactoring or `effective-flow refactor` → `effective-flow refactor`
   - Documentation or `effective-flow docs` → `effective-flow docs`
3. If the current skill is ``tools/apply-plan.md``: use the recommendation as the target workflow and continue.
4. If the recommendation matches the current workflow: continue.
5. If the recommendation points to a different workflow:
   - emit a clearly visible message stating which workflow is recommended
   - only ask to continue if the user explicitly wants to use the plan with the current workflow anyway
6. If the recommendation is missing or unclear: continue after the status check, but point out the missing or unclear recommendation.

### Check open points

The check for open or unclarified points is handled by the "clarification gate"
(`apply-clarity-gate.md`), which the implementing workflows and the apply chain themselves
embed. This reference rule does not duplicate that check separately.

### After a successful check

- Use the contents of the plan file as the agreed basis for the current workflow.
- Record in the wisdom file which plan file is the source and which workflow recommendation it contains.
- The status update to completed happens only at the completion of the implementing workflow and
  preserves the complete plan language: a German plan becomes
  `**Planungsstatus:** Umgesetzt`, an English plan becomes `**Plan status:** Implemented`.

## Clarification gate (fully clarified?)

Before a basis (plan file, issue, or review finding) is implemented, this
gate checks whether it is **fully clarified** and **implementable without a follow-up question**. The gate applies
at **both** entry points: in the apply chain (`effective-flow apply` →
``tools/apply-plan.md``/``tools/apply-issues.md``/``tools/apply-review.md``) **and** on
direct invocation of an implementing workflow (`effective-flow build`, `effective-flow fix`,
`effective-flow refactor`, `effective-flow docs`) with a plan file.

Guiding principle: **No assumptions except the absolutely obvious.** When in doubt, prefer one
clarification round too many over one too few.

### Abort criteria (at least one applies → do not implement)

- **Open points:** the plan contains an `## Offene Punkte` or canonical `## Open points` section
  with entries other than the empty state (`- Keine offenen Punkte.` / `- No open points.`).
  Continue to recognize the former English spelling `## Open Points` when reading existing plans.
- **Missing measurable acceptance criteria:** there are no acceptance criteria, or they are
  formulated without a named check/metric (no concrete check, no verifiable
  target state).
- **Implementation-relevant assumptions:** the plan contains uncertainties marked as assumptions that
  materially affect the behavior, scope, or risk of the implementation.
- **Not self-contained (issues/findings):** an issue or finding does not describe the
  intended implementation self-containedly enough to work through it without a follow-up question.

Pure, uncritical assumptions with no implementation relevance do not block.

### Behavior at the gate

- **Passed** (no criterion applies): continue to implementation. Before delegating, the
  orchestrating workflow resolves the concrete output language for every destination surface
  through the shared language rules and includes those `de`/`en` values in the agent task. The
  agent uses the supplied values and does not reinterpret project configuration.
- **Not passed:** briefly name the affected points, refer back to a clarification round,
  and end the current skill instead of partially implementing or guessing.
  Target skill of the clarification: a plan file goes to `effective-flow plan` or its in-depth
  plan review (`effective-flow review <planfile>`); an issue or finding goes to
  `effective-flow plan-issue`.

The gate replaces the former separate "check open points" check: where a workflow previously
ran this check on its own, this gate now serves as the single authoritative instance,
to avoid duplicate maintenance.

When an open plan for `effective-flow refactor` is confirmed, it first passes through the
"clarification gate". If it does not pass the gate, refer according to the gate behavior to
`effective-flow plan` or `effective-flow review <planfile>` and end the workflow. If
the plan passes the gate:

- use the plan file's contents as the refactoring plan
- still validate in Phase 1 that no intended behavior change is included
- if a "clarified + goal-driven" context was already passed from the apply chain (basis clarified, confirmation for the autonomous run already given), honor it: skip the goal query in Phase 1 and run through phases 2–6 under the "Goal-driven completion control".

## Workflow

### Phase 1: Analysis

1. Analyze the refactoring requirement thoroughly.
2. Investigate the affected code:
   - current structure and dependencies
   - existing tests
   - affected spots
3. Clarify open questions directly with the user:
   - what exactly should be refactored
   - which constraints apply
4. Create a compact refactoring plan:
   - before -> after
   - affected files and dependencies
   - risks and side effects
5. Perform the gap analysis. The **reasoning** (root-cause placement, over-engineering/complexity lens, scope control, risk, unspoken assumptions, edge cases) follows `codebase-improvement` (see "Delegation contract: generic audit reasoning"), if available; if the skill is missing, the minimal fallback applies. What stays Effective-Flow-specific is the check for **possible behavior changes** (refactoring must not change behavior) and **missing measurable acceptance criteria**.
6. Perform the plan validation. The substantive judgment (is the refactor plan viable, executable, correctly scoped) follows the same skill; the following **deterministic scorecard thresholds** and the **behavior invariance** remain Effective Flow output contract and are not handed off to the skill:
   - Clarity: file references, target >= 80%
   - Verification: measurable acceptance criteria beyond "tests pass"
   - Context: <= 10% guessing
   - Big Picture: benefit clear
   - Behavior invariance: every change justified
7. Present the plan with scorecard.
8. Derive the explicit completion condition from the measurable acceptance criteria (see "Goal-driven completion control"); it covers phases 2–6 and feeds the explicit goal query in the approval question below. The completion condition includes behavior invariance: the baseline collected in Phase 2 must remain unchanged.
9. Obtain approval. The approval question contains the explicit goal query (option "Autonomous via /goal"); handle it per "Explicit goal query for autonomous runs": if "Autonomous via /goal" is chosen, perform the central harness-specific goal-start action for phases 2–6; the option is omitted when the workflow was delegated non-interactively.

Ask the user: **Refactoring plan approved?**
- Yes -- Approval granted, workflow continues gated
- Autonomous via /goal -- Remaining phases autonomous under the native /goal after this explicit selection (omitted for non-interactive delegation)
- Adjust -- Enter feedback as free text

### Phase 2: Baseline

First, per "Delivery and worktree integration", determine the effective delivery/worktree mode
and its verified execution-location receipt, then run any applicable owned setup before the
baseline is collected. Pass that receipt into phases 2–5 (baseline, refactoring and
post-validation); each write-capable boundary revalidates it and roots every operation there.

Start in parallel:

1. ``effective-flow-code-validator``
   - TypeScript errors
   - lint errors
   - build status
2. ``effective-flow-test-writer``
   - run all existing tests and document the result
   - do not write new tests in this phase

Document the baseline for the later comparison.

## Skill discovery

Before you start the actual implementation, planning, or review, survey the skills available in
the environment and pull in the ones useful for the concrete task. If the environment provides
no skill directory or none fits, this step is a no-op — continue without an error or a block.

### Approach

1. **Prefer recommended skills:** Preferentially apply the skills listed further above under
   "Recommended skills", provided they are available and relevant to the concrete task.
   "Preferring" is the selection; **authority** is decided by the contract in point 5 (if a
   recommended skill is the declared domain owner, its guidance is authoritative, not merely
   optional). A fallback notation `A › B` is an ordered preference: take the first available,
   non-excluded skill in the group, never both. If no such section exists (e.g. for tools),
   this point does not apply.
2. **Judge relevance:** Check each skill against the **concrete** task and pull in only the
   clearly fitting ones (typically 0–2). Do not load skills "on suspicion" — be token-frugal.
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
4. **Library docs:** When working against an unknown or current library or framework, use
   current-docs skills (e.g. `context7`) as needed, if available, instead of guessing from
   memory. Only when needed, never mandatory.
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

### Phase 3: Refactoring

1. Start the appropriate implementer skill.
   - Use every bucket selected by project routing; preserve specialist buckets in mixed scopes.
   - Never demote unsupported product code to the tooling-only generic implementer.
2. Assignment:
   - change only structure
   - no new behavior
   - no new features
   - no unplanned bug fixes

### Phase 4: Review

1. Start every reviewer selected by project routing for the changed files, including
   ``effective-flow-generic-product-reviewer`` for degraded product buckets.
2. Aggregate findings:
   - Critical: fix before completion
   - Important: should be fixed
   - Note: optional
3. Present the review results in detail, including status per finding. Treat the results as
   provisional until Phase 6 confirms that no regression remains. On every Phase 4 run, replace
   the previous provisional review set in full with the newest results; do not carry findings
   from superseded runs forward.
4. Document each provisional finding in a structured way so open or unimplemented findings can
   be written as a review report after successful validation:
   - Title
   - Severity (Critical / Important / Note)
   - Complexity (Low / Medium / High)
   - Area
   - File + line
   - Problem
   - Recommendation
   - Action (`effective-flow fix`, `effective-flow refactor`, `effective-flow build` or `effective-flow docs`)
   - Prompt suggestion
   - Status (Fixed / Open / Not implemented)
   - rationale for non-implementation or ADR reference as slug, if present, e.g. `(ADR: <slug>)`
5. Never create an ADR in this workflow and do not ask for one either. Deliberately unimplemented findings are documented exclusively in the review report. The developer decides on later implementation or on an ADR for a deliberate non-implementation when going through the findings file, typically via `tools/apply-review.md`.
6. Do not create an open-findings report or append an implementation backlink in this phase.
   Both are external finalization state and are persisted only after Phase 6 succeeds.

### Phase 5: Post-validation

Start in parallel:

1. ``effective-flow-code-validator``
2. ``effective-flow-test-writer``
   - runs all existing tests again
   - writes no new tests

### Phase 6: Before/after comparison and completion

1. Compare the results from Phase 5 with the baseline:
   - tests
   - TypeScript
   - lint
   - build
2. If regressions are found:
   - inform the user
   - back to Phase 3, then phases 4, 5 and 6 again – per "Goal-driven completion control": bound the internal correction rounds and escalate to the user if the baseline is still not reached afterwards, instead of repeating indefinitely
3. If no regressions:
   - finalize external review state from the latest provisional review only:
     - use the session ID as the stable finalization marker for this workflow run; in a generated report, include it after the reviewer or phase in the existing `Source review` field, for example `Phase 4 (run <SESSION_ID>)`
     - if findings with status `Open` or `Not implemented` remain, before applying the collision rule, search `.effective-flow/review/` for a report whose `Source workflow` is `effective-flow refactor` and whose `Source review` contains this run's finalization marker
     - if exactly one matching report exists, reuse that report and its path; complete or validate its contents and memory update as needed, and do not create a collision-suffixed report
     - if more than one matching report exists, stop before writing and escalate the ambiguity to the user
     - if no matching report exists, write the findings into at most one new file under `.effective-flow/review/` per "Open review-finding reports"
     - if no findings with status `Open` or `Not implemented` remain, do not create a report
     - if a plan file exists, use the file name `review-report-YYYY-MM-DD-plan-<slug>.md`
     - name any generated report path in the completion summary
   - if this refactoring implemented a finding from an existing review-report file in `.effective-flow/review/`:
     - add a short implementation note as the last entry directly in the affected finding
     - begin the note with `✅`, name at least the date and workflow, and include the same finalization marker, for example `✅ Implemented on YYYY-MM-DD via effective-flow refactor (run <SESSION_ID>)`
     - before appending, read the finding again and check for an implementation note with this exact finalization marker; if one exists, do not append another note
   - delete the wisdom file
   - if delivery or worktree execution was active: perform the handback per "Delivery and worktree integration" (for a guided plan file including the plan status switch to `Umgesetzt`/`Implemented` and archive move to `<plan.dir>/archive/` at the delivery point, commit the changes, ownership-safe worktree cleanup if applicable, completion action `pr`/`merge`/`branch`, defer the checkout). If the workflow exceptionally runs in-place without delivery, it performs the same status switch and archive move directly in the working tree.
   - summarize what was refactored; for an active delivery/worktree mode, additionally name the delivery branch, the final checkout state and the result of the completion action (PR URL, merge or retained branch)
   - confirm that the behavior stayed unchanged

## Pre-commit gate

Before every commit, the checks configured in the project must pass without errors. Typical checks are type-checking, linting, and tests — use the scripts defined in the project (e.g. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm agent:check`).

- If a check reports errors: fix the errors first, then check again.
- Never commit code that does not pass these checks.
- This rule applies even when a separate verification phase exists — it is an additional safeguard, not a replacement.

## Commit message rules

- Resolve `language.git` through the shared language rule and write the human-readable subject
  description and body in that language. Preserve a valid user-supplied message. Conventional
  Commit types, optional scopes, `!`, trailer keys, issue references, and other machine tokens
  remain English/ASCII. This rule also governs Conventional Commit PR-title descriptions and
  explicitly generated changelog/release-note prose.
- **Never set `Co-Authored-By` trailers in commit messages**, regardless of whether an LLM (Claude, Codex, GPT, …) or another tool suggests the line or inserts it as a default.
- If a `Co-Authored-By` line is already present in a commit template, `commit.template`, a `--trailer` invocation, or a draft message: remove it before committing.
- **Do not add AI attribution:** no „Generated with Claude Code/Codex" footers and no agent session links (e.g. `https://claude.ai/code/…`) in commit messages – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex remain allowed, generation attribution does not.
- Avoid generic messages like `update files` or `misc changes`.
- Describe concretely what was changed and why.
- Use Conventional Commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Choose the commit type by **effect**, not by file type: behavior-changing changes – including pure **config/env/secrets/CI** with deployment or runtime effect (e.g. corrected values in env/secret artifacts that take effect remotely via sync) – are `fix:` (or `feat:` for new functionality). `chore:` only for **deploy-neutral** changes without behavioral effect (pure maintenance, formatting, tooling without runtime effect). This also applies to the **squash PR title**, which determines the release-please bump on a squash merge.
- Do not expose internal tracking IDs in commit messages, e.g. review finding IDs like `R-0000001`, local plan/review IDs like `F1`, or placeholders like `[Finding-ID]`. Such IDs belong in wisdom/report context, not in the Git history.

## Minimal fallback without the skill

Only relevant when `codebase-improvement` is not available. Brief core guidance for the gap analysis and plan validation in Phase 1, so `refactor` degrades cleanly – **not** a second complete audit handbook:

- Place the cause in the right spot: address the structural problem itself, not the nearest symptom.
- Keep the scope narrow: only the planned restructuring; no features, no bug fixes, no gold-plating (over-engineering lens).
- Assess risk by blast radius: treat widely used or untestable spots more cautiously and in smaller steps.
- The deterministic scorecard thresholds above (Clarity >= 80%, Context <= 10% guessing) and the behavior invariance remain unchanged.

## Rules

- Start independent specialist phases in parallel
- give a status update after each phase
- do not introduce a documentation phase if the refactoring changes no public behavior
- no new features or bug fixes during the refactoring
