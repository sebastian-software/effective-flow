## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with that contract as the worker instructions. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

# Effective Flow Apply Issues

You are the orchestrator that analyzes arbitrary issues from an external tracker and hands them off to the matching implementation workflow.

## Goal

This skill takes one or more issue references (GitHub via `gh`, Forgejo via `tea`) and works through them via the existing implementation skills. Unlike ``tools/apply-review.md``, it does **not** process the structured finding issues produced by `effective-flow review`, but **free-form human issues** without plan or finding structure. That is why each issue's content is first **analyzed and classified** before it is routed:

- Feature → `effective-flow build`
- Bugfix → `effective-flow fix`
- Refactoring → `effective-flow refactor`
- Documentation → `effective-flow docs`

If the information is not sufficient for an autonomous implementation, the issue is **skipped**, marked with the label `effective-flow-needs-planning` and explained via a comment. `effective-flow plan-issue` later collects these issues and completes the planning.

The skill implements nothing itself. It is an analysis and routing layer over the existing workflow skills. All status updates are appended **as comments on the respective issue**.

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

**Load on demand:** Read `shared/runtime-state-safety.md`, when any wisdom, tracker-marker, or other runtime-state mutation is imminent.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when any wisdom, tracker-marker, or other runtime-state mutation is imminent.

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

## Project conventions

If the project has an `AGENTS.md`, read it early in the workflow and honor its rules for routing, commits and user follow-up questions.

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

## Wisdom Accumulation

Use `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md` for:

- the resolved work list (issue number, optional epic reference)
- the analysis per issue (classification, sufficient/insufficient, target skill, prompt suggestion, confidence, what is missing)
- created PRs and checked-off epic entries
- skipped issues with reason
- failed delegations

Write a summary after each phase and pass it to later phases. Delete the file at the end.

## Tracker integration

This skill is **inherently remote**: it always works against the issue tracker of the `origin` remote. The `tracker.mode` switch from `effective-flow review`/``tools/apply-review.md`` is **not** evaluated. From the following shared building block, this skill uses the provider-neutral remote helper, its probe/dry-run/apply envelope, and its structured error cases. The finding/epic-specific body formats do not apply here; the exact checklist patch operation is reused analogously for container issues.

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

## Issue-tracker integration (remote mode)

This shared fragment connects `effective-flow review` and ``tools/apply-review.md`` with an external issue tracker (GitHub via `gh`, Forgejo via `tea`). It is **opt-in** via the Effective Flow configuration (project setup ADR) and disabled by default (`local`). In local mode both skills behave unchanged – findings run through the Markdown report file under `.effective-flow/review/`, no issues are created and no CLI is invoked.

The local/remote toggle (`tracker.mode`) affects exclusively **reviews**. **Investigations** (`effective-flow investigate`) are exempt from it and remain purely local in every mode under `.effective-flow/investigation/` (never committed, never as an issue). Of the Effective Flow artifacts, only **plans** are committed.

It encapsulates the **shared** building blocks: the `tracker` config schema including migration, the mode determination, the provider-neutral remote-helper contract, the label convention, and the canonical issue and epic body formats. The actual orchestration – when issues are **created** (`effective-flow review`) and when they are **read and processed** (``tools/apply-review.md``) – stays in the respective skill.

In addition, ``tools/apply-issues.md`` and `effective-flow plan-issue` use this fragment for the same provider-neutral helper operations. These two skills process **arbitrary** human issues instead of the finding issues produced by `effective-flow review`; they are **inherently remote** and do **not** evaluate the `tracker.mode` toggle (local/remote) – they only need a Git repository, an `origin` remote and an authenticated CLI. The finding-/epic-specific sections (issue body format, epic body format, `R-XXXXXXX` convention) apply only to `effective-flow review`/``tools/apply-review.md``; the checkbox-ticking mechanics for epic bodies are used by ``tools/apply-issues.md`` analogously for container issues.

### Configuration

Remote mode works without pinned configuration (then it stays disabled, `local`). If the Effective Flow configuration (project setup ADR) pins corresponding values, they override these defaults (schema shown here for illustration):

```json
{
  "tracker": {
    "mode": "local",
    "remoteToolOverride": "auto"
  }
}
```

Missing values have these defaults:

- `tracker.mode`: `"local"` (feature off)
- `tracker.remoteToolOverride`: `"auto"` (tool automatically from the `origin` URL)

Valid values:

- `tracker.mode`: `"local"`, `"remote"`
- `tracker.remoteToolOverride`: `"auto"`, `"github"`, `"forgejo"`

`remoteToolOverride` is intended only for ambiguous hosts (e.g. self-hosted GitHub Enterprise whose domain does not contain `github.com`). With `auto` the host detection below decides.

### Config migration

Reading the Effective Flow configuration from the project setup ADR (including the `tracker` keys) and the one-time migration of a legacy config is handled centrally by the fragment "Config migration" (`config-migration.md`); this fragment performs no own per-block migration for `tracker` anymore. The `tracker` config schema above (configuration, valid values, mode determination, first-invocation query) remains unaffected by this.

### Determine mode

At the start of the run, determine the effective mode in this order (the first matching rule wins):

1. **Argument type:** The passed argument type overrides the config mode for this run. A report file (`*.md` under `.effective-flow/review/`) forces `local`; an issue reference (issue number, `#123` or an issue URL) forces `remote`.
2. **Per-run wish of the user:** If the user explicitly requests issue/tracker work, `remote` is active; if they explicitly request local work ("local", "without issues", "report only"), `local` is active.
3. **Config:** otherwise `tracker.mode` from the Effective Flow configuration (project setup ADR) applies.
4. **First-invocation query:** If `tracker.mode` is not set in the config and neither argument nor per-run wish delivers a signal, run the first-invocation query below.

### First-invocation query

Only when step 4 above applies (no config value, no argument/per-run signal):

Ask the user: **Should review findings be tracked locally as a Markdown report or remotely as issues (GitHub/Forgejo)?**
- Local -- tracker.mode = local — Markdown report under .effective-flow/review/ (previous behavior)
- Remote -- tracker.mode = remote — findings as issues, tool automatically from origin (gh/tea)

Use the chosen answer as the tracker mode **for this run**. Do **not** write it into the configuration yourself — permanently pinning `tracker.mode` in the project setup ADR is handled exclusively by `effective-flow setup`. Briefly point this out to the user, e.g. "Tracker mode `remote` used for this run; pin permanently via `effective-flow setup`."

### Remote helper contract (remote mode only)

All deterministic remote mechanics run through the shipped helper:

```text
node <skill-root>/scripts/remote-tracker.mjs <operation> [--apply]
```

Pass exactly one JSON object through standard input and parse exactly one JSON result envelope from standard output. Resolve `<skill-root>` from the currently loaded Effective Flow skill; never copy the helper into the target project. The helper owns origin/provider/reference parsing, `gh`/`tea` probing, capability normalization, command construction, JSON normalization, payload validation, compatibility aliases, exact body patching, redaction, and stale-write preconditions. It never opens a shell and never prompts.

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

In remote mode, use these labels and create missing labels idempotently (tolerate an "already exists" message, do not treat it as an error):

| Label                                                                                          | Meaning                                                                           |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `effective-flow-review-finding`                                                                | marks a single finding issue                                                      |
| `effective-flow-review-epic`                                                                   | marks the epic/tracking issue                                                     |
| `effective-flow-fix`, `effective-flow-refactor`, `effective-flow-build`, `effective-flow-docs` | target action of the finding (exactly one per finding issue)                      |
| `critical`, `important`, `note`                                                                | severity of the finding (exactly one per finding issue; `note` for note findings) |
| `wontfix`                                                                                      | deliberately do not implement finding → ADR instead of code                       |
| `effective-flow-issue-done`                                                                    | issue implemented by ``tools/apply-issues.md`` (PR created)                        |
| `effective-flow-needs-planning`                                                                | skipped by ``tools/apply-issues.md``; planning via `effective-flow plan-issue` needed   |

`wontfix` already exists on many trackers; create it only if it is missing. `effective-flow-issue-done` and `effective-flow-needs-planning` belong to the issue-driven flow (``tools/apply-issues.md``/`effective-flow plan-issue`) and are created idempotently there.

**Backward compatibility (severity labels):** The English severity labels `critical`/`important`/`note` are the default; newly created or set is exclusively the English label. The former German labels `kritisch`/`wichtig`/`hinweis` are **not** upgraded but stay **recognized** permanently when reading, listing, deduplicating and detecting a finding's severity — run a severity query per language variant (once `critical`/`important`/`note`, once `kritisch`/`wichtig`/`hinweis`) and union by issue number, analogous to the `firmo-`/`effective-flow-` prefix rule above.

**Backward compatibility (legacy prefix `firmo-`):** Earlier versions used the prefix `firmo-` instead of `effective-flow-` (`firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`firmo-refactor`/`firmo-build`/`firmo-docs`, `firmo-issue-done`, `firmo-needs-planning`). Newly **created or set** is exclusively the `effective-flow-` label; an upgrade of existing `firmo-` labels is **not** needed. When **reading, listing, deduplicating and detecting**, every `firmo-` variant counts permanently as equivalent to the associated `effective-flow-` variant:

- **Listing/filtering** (dedup, epic/issue search): `gh`/`tea` combine multiple `--label` specifications with AND semantics. Therefore run the query **separately per prefix** (once `effective-flow-…`, once `firmo-…`) and union the matches by the issue number.
- **Removing a status label** (`effective-flow-needs-planning`, `effective-flow-issue-done`): additionally remove the legacy `firmo-` variant, if present, so an issue does not stay "stuck" through a leftover legacy label.

**One-time `sf-` label migration:** The even older prefix `sf-` (`sf-review-finding`, `sf-review-epic`, `sf-fix`/`sf-refactor`/`sf-build`/`sf-docs`, `sf-issue-done`, `sf-needs-planning`) is **no longer** detected continuously, but **migrated once per repo**. On the **first** remote tracker access — provided the marker `labelMigration.sf.done` in the retained absolute `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle is missing and an authenticated CLI is present — an idempotent migration moves every still-present `sf-<x>` label to `effective-flow-<x>`: first add `effective-flow-<x>` on the issue, then remove `sf-<x>` (not the other way around, so an abort leaves no issue unclassified). If the runtime directory is missing, apply the owning workflow's loaded “Runtime-state write safety” contract from `RUNTIME_STATE_ROOT` to that exact directory immediately before its `mkdir`. After the remote migration, use the loaded shared memory mutation contract against the retained absolute memory handle: acquire its lock, re-read memory, merge only `labelMigration.sf`, and atomically persist `done` plus the completion timestamp while preserving every sibling and unknown field. If this marker mutation blocks or fails, preserve local state, report that the remote labels may already have migrated, and direct the user to `effective-flow setup`; the next run may repeat the idempotent remote migration. If the migration finds no `sf-` labels, it is a silent no-op. If the marker is set, any further scan is skipped — ongoing operations know only `effective-flow-` and `firmo-`. `sf-` is referenced exclusively in this migration.

### No AI attribution in issue bodies and comments

Do not add AI attribution to issue bodies, epic bodies and comments: no "Generated with Claude Code/Codex" footers, no agent session links (e.g. `https://claude.ai/code/…`) and no `Co-Authored-By` trailers – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex as the target harness are allowed, generation attribution is not.

### Remote prose language

Resolve `language.forge` once per remote run and pass it to all issue/comment writers. Preserve
the clear language of an existing issue or thread when editing/replying; otherwise use the
resolved Forge language. Finding and epic bodies use one complete language for human-readable
titles, headings, field labels, displayed severity/complexity values, and prose.

The German display mapping is `Schweregrad`, `Komplexität`, `Bereich`, `Datei`, `Problem`,
`Empfehlung`, `Prompt-Vorschlag`, `Befunde`, and
`Übersprungen (Architekturentscheidungen)`. English uses the template labels below. `Action`,
`Epic`, and `Signature` are stable helper/dedup fields and remain canonical English in both
forms, as do their action values. Displayed severities map to
`Kritisch`/`Wichtig`/`Hinweis`, and displayed complexities map to
`Niedrig`/`Mittel`/`Hoch`; their helper input enums remain
`Critical`/`Important`/`Note` and `Low`/`Medium`/`High`. Labels, issue numbers, `R-XXXXXXX` IDs, HTML markers, body
hashes, checklist syntax, and helper payload keys are never localized. Readers accept both
German and English historical display fields, including legacy `Signatur`, but canonical writes
use `Signature`.

### Issue body format (finding issue)

A finding issue must be **self-contained**: a foreign LLM session must be able to process it without access to the producing session. It contains the same content fields as a finding block of the local report format (see `effective-flow review`, "Report format").

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
comment read/create/update, label create/change, PR review-thread read/reply/resolve,
marker/checklist patch, or PR creation. Use the helper's normalized output rather than
provider-specific fields. For list operations, request the compatibility variants and let the
helper union matches by issue number before signature deduplication.

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
adapter reports the write as non-atomic instead of sending a misleading `If-Match` header.

Legacy-label transitions use the helper's add and remove operations in that order. The one-time `sf-` migration returns its completion marker only after every step succeeds; a partial failure reports completed steps and keeps the marker pending. Cleanup of recognized `firmo-` aliases uses the same add-before-remove operations without changing that one-time marker contract.

### Error and edge cases

- **Missing/unauthenticated CLI:** abort clearly, give a remediation hint, leave no partial state; no silent fallback to `local`.
- **No Git repository / no `origin` remote:** remote mode not possible; report.
- **Ambiguous host:** use `remoteToolOverride` or a per-run hint; if both are unclear, ask the user.
- **Argument type contradicts `tracker.mode`:** The argument type overrides the config mode for this run (see "Determine mode").

## Apply source detection

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default
`docs/plan`).

This shared building block is the single source of truth for **which
apply source type** a given argument is. It is used by `effective-flow apply`
(router) as well as by ``tools/apply-plan.md``, ``tools/apply-review.md``, and
``tools/apply-issues.md`` for the upstream argument classification. `effective-flow plan` uses only
Stage A as a planning gateway: it delegates an unambiguous `issue-reference` to
`effective-flow plan-issue` and never performs Stage B itself.

The building block only classifies and resolves the reference to a handle (file path or
issue number(s)). It makes **no** implementation decision, changes nothing, and
does not read findings/container contents deeper than necessary for classification. The
type-specific depth logic (plan status, finding parsing, container expansion) stays
in the respective skill.

Before report-source resolution, establish and verify the execution-location receipt's
`RUNTIME_STATE_ROOT` from the first porcelain worktree record. This is required even when
classification starts in a linked or native worktree and even when Stage A remains otherwise
read-only. If the main record is bare, missing, moved, unusable, or belongs to another Git common
directory, abort classification without falling back to `EXECUTION_ROOT`.

### Canonical source types

| Type              | Meaning                                                                                                       | Responsible skill                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `plan`            | plan file under `<plan.dir>/`                                                                                 | ``tools/apply-plan.md``                        |
| `review-report`   | review report file under `.effective-flow/review/`                                                            | ``tools/apply-review.md`` (local)              |
| `review-epic`     | tracking/epic issue of a `effective-flow review` run                                                               | ``tools/apply-review.md`` (remote, epic)       |
| `review-finding`  | single finding issue of a `effective-flow review` run                                                              | ``tools/apply-review.md`` (remote, issue list) |
| `container-issue` | generic issue with a sub-issue checklist, without a review label (`effective-flow-review-*`/`firmo-review-*`) | ``tools/apply-issues.md``                      |
| `plain-issue`     | freely written human issue                                                                                    | ``tools/apply-issues.md``                      |

Special results: `none` (empty/no argument) and `ambiguous` (not uniquely
resolvable). `issue-reference` is an **intermediate result** from stage A for an issue reference
not yet resolved into its subtype; stage B refines it.

### Stage A: syntactic classification (file system only)

Stage A needs no tracker I/O and is available to every skill. Determine the
type in this order (first matching rule wins):

1. **Empty/no argument** → `none`.
2. **Plan reference** → `plan`, if the argument resolves to exactly one file under
   `<plan.dir>/` or `<plan.dir>/archive/`. Permitted forms as in
   `plan-reference-routing`: full path (`<plan.dir>/YYYY-MM-DD-…md`),
   date-slug file name (`YYYY-MM-DD-…md`), legacy number without path (`NNNN`, resolved primarily
   via the H1) or — as a fallback — the title slug.
3. **Review report** → `review-report`, if the argument resolves to exactly one `*.md` file
   below absolute `<RUNTIME_STATE_ROOT>/.effective-flow/review/`. Resolve a filename-only
   argument directly below that directory; resolve a project-relative
   `.effective-flow/review/...` argument against `RUNTIME_STATE_ROOT`; accept an absolute path
   only when it is contained there. Physically canonicalize existing paths. For a prospective
   path, canonicalize the nearest existing ancestor before appending validated missing segments.
   Reject `..`, aliases, a symlink escape, and every path outside the directory. Retain the
   resulting absolute report handle and pass it unchanged to the responsible skill.
4. **Issue reference** → `issue-reference` (continue with stage B), when the remote helper's
   reference parser accepts the argument as a bare issue number (`123`), `#123`, or a
   host-neutral issue URL for the current repository. Multiple references are parsed as one list
   and classified individually in stage B; malformed or cross-repository references remain
   structured errors instead of heuristic matches.
5. **Otherwise** → `ambiguous`: the argument resolves to no category or matches
   both a plan **and** a review file at the same time. Do not guess — the caller
   asks (see "Ambiguity and fallbacks").

Distinguishing plan vs. report: primarily via the directory (`<plan.dir>/` or
`<plan.dir>/archive/` vs. `.effective-flow/review/`), secondarily via the header content
(plan status marker `**Planungsstatus:**` / `**Plan status:**` vs.
`### [R-XXXXXXX]` finding blocks). A four-digit number without a path is always a
(legacy) plan reference, never an issue reference.

### Stage B: issue subtype (tracker)

Stage B refines an `issue-reference` from stage A into the concrete subtype. It
requires the host/CLI detection and availability check from `issue-tracker.md`;
a skill that uses stage B therefore also embeds `issue-tracker.md`.
``tools/apply-plan.md`` does not need stage B — for a plan skill, stage A is enough
to recognize an issue reference as a foreign type and forward it.

Per issue, read labels and body **once fresh** from the tracker and determine the subtype in
this precedence — **label before body structure**:

1. Label `effective-flow-review-epic` (or old `firmo-review-epic`) → `review-epic`.
2. Label `effective-flow-review-finding` (or old `firmo-review-finding`) → `review-finding`.
3. no review label, but the body contains a sub-issue checklist
   (`- [ ] #NNN …` / `- [x] #NNN …`) → `container-issue`.
4. otherwise → `plain-issue`.

Secondary signal when a label is missing (e.g. removed manually): a title in the format
`[R-XXXXXXX] …` together with a helper-parsed `Signature` field (legacy `Signatur` accepted on
read) is treated like `review-finding`. If the subtype remains unclear afterwards → `ambiguous`.

Why label before body: a `review-epic` carries — like a generic
`container-issue` — a `- [ ] #NNN` checklist. The label `effective-flow-review-epic` or
`effective-flow-review-finding` (old prefix `firmo-` equivalent, see "Label convention" in
`issue-tracker.md`) is the reliable discriminator and takes precedence over the
body structure.

### Ownership and mode

From the final source type follows exactly one responsible skill and — for
``tools/apply-review.md`` — the mode:

| Source type       | Responsible skill        | Mode / note                      |
| ----------------- | ------------------------ | -------------------------------- |
| `plan`            | ``tools/apply-plan.md``   | –                                |
| `review-report`   | ``tools/apply-review.md`` | local report flow                |
| `review-epic`     | ``tools/apply-review.md`` | remote mode, epic mode           |
| `review-finding`  | ``tools/apply-review.md`` | remote mode, issue-list mode     |
| `container-issue` | ``tools/apply-issues.md`` | container expansion in the skill |
| `plain-issue`     | ``tools/apply-issues.md`` | single work item                 |

Consistency with `issue-tracker.md`: the rule there, "argument type overrides the
config mode", stays valid — a `review-report` forces `local`, a
`review-epic`/`review-finding` forces `remote`. This building block delivers exactly that
argument type.

### Ambiguity and fallbacks

- **`none` (no argument):** do not heuristically pick the "newest". The caller
  lists local candidates (open plans from `<plan.dir>/`, report files under the absolute
  `<RUNTIME_STATE_ROOT>/.effective-flow/review/` directory) and asks for the specific source. If the effective
  tracker mode is `remote`, it additionally lists open review epics (label
  `effective-flow-review-epic`, incl. old `firmo-review-epic`) as candidates, since in
  remote mode no local report files exist.
- **`ambiguous`:** name the competing interpretations and ask, instead of
  guessing.
- **Mixed issue list** (different subtypes in one call, e.g. `review-finding`
  and `plain-issue`): do not guess. Ask the user to split the list by target type,
  or — in the router — route per issue. Conservative: ask.
- **Issue reference, but tracker CLI missing/not authenticated:** stage B cannot
  run → clear error message with a remediation hint per "Errors and edge cases" in
  `issue-tracker.md`; no silent fallback to a local type.
- **Unresolvable path:** `ambiguous` → ask or error message; note that
  `effective-flow open-plans` can list open plans.

### Use by the skills

- **Router (`effective-flow apply`):** runs stage A and — for issue references —
  stage B, reports the detected type, and delegates to the responsible skill with the
  original argument plus the retained runtime root and, for a local report, its absolute report
  handle. On `none`/`ambiguous`/mixed list: ask.
- **Planning gateway (`effective-flow plan`):** after read-only configuration resolution has supplied
  `<plan.dir>`, runs Stage A only when an argument exists. On `issue-reference`, it passes the
  complete original argument unchanged to `effective-flow plan-issue` and ends before plan inventory,
  migration, questions, or artifact creation. Every other result stays in the existing local plan
  workflow. A bare four-digit value therefore keeps the legacy-plan precedence and is not routed
  as an issue.
- **Responsibility skill (each of the three apply skills):** classifies the argument
  early via this building block. If the type matches its own responsibility → continue with its
  own depth logic. If it does not match:
  - **Direct invocation by the user:** clearly point to the responsible skill (or
    `effective-flow apply`) and end.
  - **Delegation from `effective-flow apply`:** should not occur, since the router
    routed correctly; the switch remains as a safeguard.

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

## Comment conventions

All status updates are written as issue comments (operation "add comment" from the mapping above).
Resolve `language.forge` once and use it for new comment prose, preserving a clearly established
existing thread language. Use the English templates below or their complete German equivalents
(`Umgesetzt`, `Übersprungen`, `Umsetzung fehlgeschlagen` and corresponding sentences). Begin
every comment with the stable marker `<!-- effective-flow-apply-issues -->` so later runs
recognize their own comments and avoid duplicates:

- **Implemented:** `🤖 Implemented via effective-flow apply — PR #<nr>` (no internal IDs, no `Co-Authored-By`).
- **Skipped:** `⏭️ Skipped: some details are still missing for an autonomous implementation: <list of what is missing>. Complete with effective-flow plan-issue.`
- **Failed:** `⚠️ Implementation failed: <short reason>. Issue remains open.`

Do not expose internal tracking IDs or session details in comments.

## Workflow

### Phase 1: Argument & tracker setup

1. Determine host and CLI and check availability/authentication per "Host and CLI detection" in the included building block. Precondition: a git repository with an `origin` remote. If `origin`, the CLI or authentication is missing: report clearly and abort without side effects (no silent fallback).
2. Read the user argument and classify it via the "apply-source detection" (stage A and — for issue references — stage B):
   - source type `container-issue` or `plain-issue` → ``tools/apply-issues.md`` processes it itself; continue. Multiple issue references (number, `#123` or issue URL) are allowed as a list.
   - source type `plan` or `review-report` → point to the responsible skill (``tools/apply-plan.md`` or ``tools/apply-review.md``, or `effective-flow apply` for automatic routing) and end the skill.
   - source type `review-epic` or `review-finding` → these are epic/finding issues produced by `effective-flow review`; ``tools/apply-review.md`` is responsible for them. Point to it and end.
   - `ambiguous` → ask instead of guessing. When ``tools/apply-issues.md`` runs as a delegation from `effective-flow apply`, foreign types should not occur; the switch remains as a safeguard.
   - No argument (`none`): list open issues that carry neither `effective-flow-issue-done` nor `effective-flow-needs-planning` (exclude the legacy prefix `firmo-` equivalently, see "Label convention"), and ask the user which ones to process. Do **not** use a heuristic auto-selection.
3. Create the required labels idempotently (`effective-flow-issue-done`, `effective-flow-needs-planning`; tolerate an "already exists" message).

### Phase 2: Expansion & work list

1. Read each referenced issue **fresh** from the tracker (body, labels, status and **comments** via the "read comments" operation). The comments are part of the analysis basis: a planning comment from `effective-flow plan-issue` (marker `<!-- effective-flow-plan-issues -->`) contains the completed specification, and maintainers may add clarifications as a comment rather than in the body. Your own Effective Flow comments (`<!-- effective-flow-apply-issues -->`) are only noted here for the idempotency check in Phase 4, not counted as a functional requirement. **Backcompat (one generation):** the legacy markers `<!-- firmo-plan-issues -->` and `<!-- firmo-apply-issues -->` from earlier runs are recognized equivalently when reading; only the `effective-flow-` variant is written anew.
2. **Container detection:** if the body contains a task list with issue references (`- [ ] #NNN …` / `- [x] #NNN …`), treat the issue as a container:
   - expand to the **open** (`- [ ]`) sub-issue references and remember the container issue as an epic for the later check-off,
   - skip done (`- [x]`) entries,
   - then read each open sub-issue fresh from the tracker.
     If the body contains no such list, the issue itself is a single work item.
3. Skip work items that are already closed or carry the label `effective-flow-issue-done` (or legacy `firmo-issue-done`) (idempotency).
4. Deduplicate the work list (the same issue number only once, even if it is reachable via multiple containers).
5. Result: a flat list of work-item issues, each with an optional epic reference. Record it in the wisdom file.
6. Create a task per work item (task tracking with per-issue granularity) and give the user an overview:

```markdown
| Status | Count |
|---|---|
| To analyze | X |
| of which expanded from containers | C |
| already done (skipped) | Z |
| Total | N |
```

7. If the work list is empty: short message and abort.

### Phase 3: Analysis & classification (in parallel per work item)

Start an analysis sub-agent in parallel for **each work item**. These sub-agents implement nothing and change no files — they only analyze.

Each analysis sub-agent receives the issue body **and the issue comments** and the task to investigate the codebase and deliver a structured result:

- **Comments as a source:** evaluate body and comments together. The newest
  `<!-- effective-flow-plan-issues -->` planning comment is the authoritative planning artifact,
  even if the original body is thin; it is **not automatically sufficient**. If its
  `### Open points` / `### Offene Punkte` section is nonempty (anything other than exactly
  `- No open points.` / `- Keine offenen Punkte.`), or its plan-review result is
  `Revision required` / `Überarbeitung nötig`, treat the issue as `insufficient`. Also treat a
  review assumption explicitly marked as implementation-blocking as `insufficient`. Keep or add
  `effective-flow-needs-planning` and return it to `effective-flow plan-issue`; never route it to
  implementation.
  Further maintainer comments count as clarifications. Pure Effective Flow status comments
  (`<!-- effective-flow-apply-issues -->`) are not counted as requirements.
- **Classification:** Feature / Bugfix / Refactoring / Documentation (definitions as in `effective-flow plan`, Phase 1) and from that the target skill (`effective-flow build` / `effective-flow fix` / `effective-flow refactor` / `effective-flow docs`).
- **Sufficiency check:** applies the "clarification gate" analogously at issue granularity: can a clear target behavior and at least one **measurable acceptance criterion** be derived from the issue (body **and comments**), and are there enough file/area hints for the target workflow to start autonomously? Result: `sufficient` or `insufficient`. On `insufficient`: a concrete list of what is missing (open functional questions, missing acceptance criteria, unclear scope).
  A canonical planning comment passes this gate only when its required sections meet those checks
  and its review/open-points state contains no implementation blocker. Older planning comments
  without Plan-review or Open-points sections remain backward-compatible and are assessed by the
  existing target-behavior, measurable-acceptance-criterion, and file/area checks rather than
  rejected solely for missing the new sections.
- **Prompt suggestion:** a directly usable plain-text task for the target skill.
- **Confidence:** `High` / `Medium` / `Low` regarding the file scope (analogous to the pre-analysis in ``tools/apply-review.md``).
- **Affected files:** best estimate of the touched files (for the conflict consideration in Phase 4).

Write each result into the wisdom file. When in doubt, an issue counts as `insufficient` — better to hand off cleanly to `effective-flow plan-issue` than to implement on an unclear basis.

### Phase 3.5: Approval and goal query

This is the approval boundary of this workflow: the classification is fixed, and the remaining phases (delegation, PRs, comments, summary) then run without a further regular approval gate.

1. Give the user an overview of the analysis: per work item the issue number, classification, `sufficient`/`insufficient` and the target skill or what is missing.

```markdown
| Issue | Classification | Result | Target / Missing |
|---|---|---|---|
| #<nr> | Feature/Bugfix/Refactoring/Docs | sufficient | effective-flow build … |
| #<nr> | … | insufficient | missing: … |
```

2. Per "Goal-driven completion control" (principle 1), declare the explicit completion condition for phases 4–5: every `sufficient` issue is implemented via the matching implementation skill and has either a newly created PR or a new commit on the specified target PR with a PR comment, label `effective-flow-issue-done` and — for container origin — a checked-off epic entry; every `insufficient` issue carries `effective-flow-needs-planning` together with a comment; the project-configured checks of the delegated workflows are green; nothing outside the chosen issues is changed.
3. Ask the goal query per "Explicit goal query for autonomous runs". The approval boundary here is a yes/no approval, hence "Autonomous via `/goal`" as a third option:

Ask the user: **Start implementing the sufficiently specified issues?**
- Yes -- Approval granted, the workflow continues gated (status update per issue)
- Autonomous via /goal -- Remaining phases autonomous under native /goal after this explicit selection
- Adjust -- Enter feedback as free text (e.g. correct the issue selection or target skill)

4. **Dropping the query:** if ``tools/apply-issues.md`` itself runs as a non-interactive sub-agent of a higher-level orchestrator (recognizable from the call context, e.g. "[Context from …]"), skip this gate entirely (no extra option, no goal-start action and no `/goal` string) and continue directly with Phase 4. A direct call by the user does **not** count as such a delegation.
5. On choosing "Autonomous via `/goal`": perform the central harness-specific goal-start action with the following form (single line, without internal IDs):

```text
/goal Fully work through the issues analyzed via effective-flow apply (#… , #…) and run the remaining phases of this workflow: implement each sufficiently specified issue via the matching implementation skill, create exactly one PR per issue without a target PR, update issues with a target PR exclusively through new commits on the existing PR branch, comment the PR link, set effective-flow-issue-done and check off the epic entry; mark insufficient issues with effective-flow-needs-planning and a comment; project-configured checks of the delegated workflows green. Change nothing outside the named issues. Stop when all chosen issues are processed.
```

6. On "Yes"/gated (or a normal answer): continue gated without a `/goal` string. On "Adjust": incorporate the feedback (correct selection/target) and ask the query again. Start Phase 4 only after this approval.

### Phase 4: Routing & delegation

The commit/PR strategy is by default **"one PR per issue"** (no commit-strategy question). Every implementable issue without a target PR is its own sub-group in its own delivery branch, preferably with worktree isolation, analogous to the remote mode of ``tools/apply-review.md`` (Phase 4 remote): branch off the base branch from the `delivery` config block (legacy fallback: old `worktree.baseBranch`/`worktree.branchPrefix` values), one PR via `effective-flow pr`. File-overlapping issues run sequentially to avoid working-tree conflicts; non-overlapping ones run in parallel.

If an issue body or non-Effective Flow comment names a target PR (`Ziel-PR: #<nr>`, `Target PR: #<nr>` or a PR URL), **"new commit on existing PR"** applies instead:

1. Do not create a new delivery branch and no new PR.
2. Fetch the head branch of the target PR, check it out in an isolated worktree or in the clean
   current checkout, issue and verify the downstream workflow's execution-location receipt, and
   update it via rooted pull/fetch operations without any rebase or force operation.
3. Implement the issue there and commit the change as a new commit on the PR branch. Existing PR commits must not be rewritten via `commit --amend`, rebase, squash or force-push.
4. Push the PR branch normally. If the push is rejected due to diverged remote history, mark the issue as failed and report the conflict instead of overwriting history.
5. Use the URL of the existing PR as the result PR link for the issue comment, epic entry and summary.

Issues with the same target PR run sequentially so that new commits are created in order on the same PR branch.

**Insufficient issues (`insufficient`):**

1. Do not implement.
2. Set label `effective-flow-needs-planning`.
3. Append a skipped comment with the list of what is missing (template above), unless the comments read in Phase 2 already contain an identical `<!-- effective-flow-apply-issues -->` skipped comment (idempotency based on the "read comments" operation).
4. Task to `completed` with the addition `[skipped]`.

**Sufficient issues (`sufficient`), each with its own verified execution root:**

1. Delegate to the target skill determined in Phase 3 and pass along the prompt suggestion as the task description:
   - Feature: `Use the skill effective-flow build for this issue.`
   - Bugfix: `Use the skill effective-flow fix for this issue.`
   - Refactoring: `Use the skill effective-flow refactor for this issue.`
   - Documentation: `Use the skill effective-flow docs for this issue.`
     The delegation sub-agent runs as a **non-interactive** delegation (context hint "[Context from effective-flow apply-issues: …]"): no explicit goal query, no `/goal` string, completion protocol `DONE`/`ABORT`.
     Pass the absolute root and execution-location receipt established by that delegated workflow;
     never rely on an inherited current directory or create a nested worktree around a reused
     harness-native one.
2. Commit the changes using resolved `language.git` for the description (Conventional Commit
   type stable, no internal IDs, no `Co-Authored-By`) and push the branch. Pass resolved
   `language.git` and `language.forge` to the delegated delivery path. If a target PR is present:
   **do not create a new PR**, but use the existing PR link and optionally extend its body by one
   exact `Closes #<issue>` or `Refs #<issue>` entry through the helper's idempotent body patch,
   using the fresh body hash so concurrent edits fail closed. If no target PR is present: take
   the branch through `effective-flow pr` as exactly one PR against the base branch; include
   `Closes #<issue>` in the helper-validated PR payload.
3. **Immediately after a successful push or PR creation:** build and write the PR-link comment
   through the helper, set label `effective-flow-issue-done`, and — if the issue originates from
   a container — read the container body fresh and use the helper's exact checklist patch with
   its body hash and PR-link suffix. Apply only when the stale-write precondition still matches.
4. Task to `completed`.

**Error cases:**

- If the delegation (`ABORT`), the push to the target PR or the PR creation fails: do **not** mark the issue as done, do not set `effective-flow-issue-done`, do **not** check off the epic entry, append a failed comment and continue with the next issue. Task to `completed` with the addition `[failed]`.
- If an issue passed as part of a list lacks an assigned epic: implement it anyway and create a PR; the check-off is omitted and reported to the user.

Give a short status update after each completed issue.

### Phase 5: Summary

Report to the user:

- processed issues with result (implemented / skipped / failed)
- created PRs with URL
- skipped issues (`effective-flow-needs-planning`) with reason and the note that `effective-flow plan-issue` can complete the planning
- checked-off epic entries, if containers were processed

Then delete the wisdom file.

## Rules

- Do not modify any implementation files yourself; the implementation lies with the delegated workflows.
- Do not create a `<plan.dir>/` file; the internal planning is handled by the respective implementation workflow.
- Do not use a heuristic "newest issue" when multiple candidates exist.
- When in doubt about the sufficiency check: treat it as `insufficient` and point to `effective-flow plan-issue` instead of guessing.
- Never set a `Co-Authored-By` trailer and do not expose internal IDs in commits or comments.
- Give the user a short status update after each phase.
