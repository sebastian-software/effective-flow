## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. Only the workflow/tool orchestrator starts workers or analysis fan-out. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with zero inherited turns when supported, otherwise its smallest supported history. Use that contract as the worker instructions and add a compact, self-contained handoff containing the objective, relevant artifact paths, scoped paths and ownership, execution and runtime-state roots when writes are allowed, resolved language, authority and write limits, and completion protocol. The worker is a leaf executor: it starts no child and returns missing essential context to the orchestrator. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

# Effective Flow Refactor

You are the orchestrator for the refactoring workflow.

## Goal

Code is restructured without changing existing behavior, with before/after validation as a safety net.

**Load on demand:** Read `shared/language-rules.md`, when an artifact output language or delegated language context must be resolved.

## Interactive output language

**Resolve `language.chat` once, before this run's first interactive output, and hold it for the
whole run.** It is `de` or `en`; there is no `auto`, and a missing row means **mirror the user's
language**, never inherit `language.project`. Precedence: an explicit in-message request, then a
configured value, then the conversation language, then `language.project`, then `en`. An invalid
value is reported and treated as an absent row — mirror, not a jump to `language.project`.

The sole bootstrap exception is `effective-flow setup` in Profile mode. It resolves an entry language
read-only, asks `Chat` in that language as its first substantive question, and then binds the
selected `de`, `en`, or recognizable mirrored conversation language once for its second question
and the remainder of that setup run. Mirror is pending removal of `language.chat`; English and
German are pending `en`/`de`, and none is persisted before setup's common confirmation. Express,
Guided, and every non-setup tool retain the ordinary resolve-once-before-output rule and never
rebind their chat language during a run.

Scope is every interactive output: free prose, status updates, completion reports, an `ask` block's header,
question, option labels and descriptions, the next-steps heading and each option's description (never its
invocation token), and the session-title label, though a reused artifact title keeps its own. Encoded values
stay verbatim inside translated prose — the description `delivery.prReview = always — post the findings
without asking` is posed in German as `delivery.prReview = always — Ergebnisse ohne Rückfrage posten`.

Delegated output is relayed **verbatim**: this key is not handed down, so worker reports and agent
notices arrive as written and only the orchestrator's framing follows it — a run may be visibly
bilingual. The router catalog, `effective-flow version` and the `pr-review` notice precede any config
read and stay on the conversation language.

**Load on demand:** Read `shared/config-migration.md`, when the project setup ADR must be located to read the configured `language.chat` value.

**Load on demand:** Read `shared/typography-rules.md`, when the resolved chat language is `de`.

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
- For analysis, exploration, and research, orchestration-level delegation is the **default**. Work inline only under this **triviality exception**: a single known file, one lookup, or a step whose whole cost is smaller than briefing a worker. Sites that name this exception mean exactly this definition.
- Only the workflow/tool orchestrator may start worker roles or analysis fan-out. Every named worker is a **leaf executor**: it starts no sub-agent, never re-delegates its assignment or a write, and returns missing essential context to the orchestrator instead of seeking it through child delegation. Start each worker with **zero inherited turns** when supported, otherwise the smallest host-supported history, and supply a compact, self-contained handoff with the objective; relevant artifact paths; scoped paths and ownership; execution and runtime-state roots when writes are allowed; resolved language; authority and write limits; and the completion protocol.
- If the orchestrator's harness offers no such mechanism, or a delegation is declined at runtime, the orchestrator works inline and says so in one visible line — never silently.
- An orchestrator that itself runs as a sub-agent — a workflow delegated by another workflow — starts its own worker and analysis sub-agents in the foreground or awaits each one's result, and **never ends its turn while a child is still pending**: a delegated run is not reliably resumed when a background child finishes. This binds its own fan-out only; the handoff that started it keeps the mechanics below.
- This mandate covers worker roles and analysis fan-out only. Delegation from one workflow to another keeps that tool's own mechanics, including its interactive/gated path.

**Load on demand:** Read `shared/plan-archival.md`, when the delivery point of the handback is reached, or in-place execution archives a plan file.

**Load on demand:** Read `shared/runtime-state-safety.md`, when any wisdom, report, memory, backlink, runtime migration, or worktree mutation is imminent.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when any wisdom, report, memory, backlink, runtime migration, or worktree mutation is imminent.

**Load on demand:** Read `shared/session-title.md`, when the run's subject is fixed and whether a session title is due must be decided.

**Load on demand:** Read `shared/session-rename.md`, when the run's subject is fixed and a session title is about to be applied or emitted.

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

The tracked truth for the Effective Flow configuration is a living ADR "Effective Flow project
setup" (default slug `effective-flow-project-setup`, see fragment "Living ADR model"). It carries
the config parameters with minimal prose as a **Markdown table**. There is **no**
`.effective-flow/config.json` as a config source anymore; `.effective-flow/` is a private runtime
directory (`memory.json`, `cache.json`, `review/`, `.worktrees/`), completely ignored through
`.gitignore` or, in hidden mode, the Git common directory's `info/exclude`.

### Config locator (resolution order)

When reading the configuration, the project setup ADR is resolved in this order; the
first matching step wins:

0. **Local hidden configuration.** `<RUNTIME_STATE_ROOT>/.effective-flow/project-setup.md` (main
   checkout only, table encoding below) wins only if it declares `visibility | hidden` — **hidden
   mode**, whose forced values the deferred building block enforces; otherwise report it, go on.
   A reader without a verified `RUNTIME_STATE_ROOT` resolves it here first, read-only, from the
   first `git worktree list --porcelain` record (deferred building block); in a Git checkout where
   that fails it stops with a report and never falls through to standard mode. A tracked ADR's
   `visibility | hidden` row is never honoured: report and ignore it.
1. **AGENTS.md marker.** The canonical line `**Effective Flow project setup:** <path>` in
   `AGENTS.md`, otherwise in `CLAUDE.md` or a comparable convention file → read the ADR under
   `<path>`. The legacy spelling `**Firmo project setup:** <path>` is recognized as equivalent on
   read; the spelling stays here because it is the **detection** predicate, while what that
   recognition then triggers belongs to the deferred building block below. If the marker points to a
   path under which **no** ADR lives (dead/stale marker), do not stay there, but fall through in
   this order and report the stale marker (correction in effective-flow setup).
2. **Default path/scan.** Otherwise `docs/adr/effective-flow-project-setup.md` or a scan of the
   detected ADR directory (`docs/adr/`, `docs/decisions/`, `adr/`) for the project setup ADR. A
   file matches that scan when its stem equals `effective-flow-project-setup`, **and** its body
   carries one of the canonical configuration envelopes listed under "Table encoding" below. The
   stem comparison is deliberately tolerant of a legacy slug and a numeric prefix, so this one
   step can match **several** files; that tolerance and the ordered ranking which resolves a
   several-match state belong to the deferred building block below, not to this step.
3. **Transitional compatibility.** Otherwise — only transitionally — the legacy
   `<RUNTIME_STATE_ROOT>/.effective-flow/config.json` (otherwise
   `<RUNTIME_STATE_ROOT>/.firmo/config.json`) read fallback, whose complete contract is the
   deferred building block's.
4. **Built-in defaults.** Otherwise use the defaults of the respective source skills.

The deterministic read path of any tool is non-blocking in that it reads the ADR (or the
transitional fallback) but itself creates no file and mutates no Git; a retired row can still stop
the run (see "Table encoding"). Creating the ADR, the markers, the local hidden configuration and
the migration happen exclusively in effective-flow setup.

**Load on demand:** Read `shared/config-migration-edge-cases.md`, when step 0 must resolve `RUNTIME_STATE_ROOT` itself, the local `.effective-flow/project-setup.md` of step 0 exists or a `visibility` row is present, the locator finds no ADR whose stem is exactly the current slug, its scan matches several files, a legacy setup marker or legacy slug is present, the transitional `.effective-flow/config.json` / `.firmo/config.json` fallback must be read, or a `tracker.mode: external` run resolves `tracker.externalStartedState` or `tracker.externalDoneState`, or a retired row named under "Table encoding" is present.

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
- **`executionProfiles.fast.enabled`** → strict Boolean and fail-closed. A missing row or literal
  `false` is `disabled`; malformed, ambiguous, or unreadable input is `invalid`; both states select
  Quality and stop new measurement without rewriting persisted pilot-generation state. Only the
  literal `true` is `enabled`, and it admits the project to the pilot lifecycle but does not start a
  baseline, activate a generation, prove native Fast capability, or itself permit Fast. The key is
  reserved until an adopting workflow ships, has no legacy migration, names no provider model, and
  is not yet an interactive setup choice.
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
- **`delivery.prReview`** → the literal string `ask`, `always`, or `off`; a missing line resolves to
  `ask` through the rule above. What the value governs is the owning workflow's, not this fragment's.
- **Retired rows** → `worktree.baseBranch`, `worktree.branchPrefix`, `worktree.completion` and a row
  whose key begins with `prReview.` are never read; their presence can stop a run, the one exception
  to the safe-default rule below, under the deferred building block's retired-key contract.
- **`tracker.externalStartedState`** and **`tracker.externalDoneState`** → nullable state IDs read
  only by a `tracker.mode: external` run; their per-key notes are the deferred building block's.

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

If the table is invalid or ambiguous (missing key, unknown encoding): use a safe default for the
run, inform the user about the affected key, do **not** guess.

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

The complete bilingual field and section mapping lives in `plan-contract`; a workflow that writes
or translates a plan artifact loads it, a workflow that only recognizes the status does not.

Rules:

- The status marker must be written exactly as in the four canonical examples above, including bold, colon, and the capitalization of the marker keys and values.
- The plan status only applies when exactly one line with the prefix `**Planungsstatus:**` or `**Plan status:**` is present. Multiple status lines (even in different languages) make the plan status unclear (see below) and should be corrected.
- The only valid value pairs are the four key-value combinations listed above. Mixed forms of a German key and an English value or vice versa (e.g. `**Plan status:** Umgesetzt`) are **not** considered valid.
- Other values such as `Open`/`Done`, `Pending`/`Complete`, or arbitrary free text do not count either.
- Other occurrences of „Nicht umgesetzt“, „Umgesetzt“, "Not implemented", or "Implemented" in review findings, ADR rationales, or body text do not count as a plan status.
- If the marker is missing, occurs multiple times, contains an invalid value, or uses a mixed form of key and value language, the plan status is unclear. In that case, do not automatically treat the plan as open or completed.
- When a workflow sets the status to completed, the complete plan language is preserved: a German marker becomes `**Planungsstatus:** Umgesetzt`, an English marker becomes `**Plan status:** Implemented`.

**Load on demand:** Read `shared/plan-contract.md`, when a plan artifact's fields, sections, or review prose are written or translated.

## Recommended skills

- `effective-delivery`

## Delegation contract: generic audit reasoning

The central skill `effective-delivery` is the **declared owner** of the generic audit reasoning
(classification `delegate`, see
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
`effective-web` (frontend, accessibility, CSS architecture, React), `effective-engineering`
(architecture and data-contract reasoning), and `effective-product` (ADR authoring) – consistent
with the [ownership inventory](../../docs/developer-guide/skill-ownership.md).

Cross-language or runtime migration and dependency updates are **not** special branches any more:
`effective-delivery` owns them itself, so the default owner above already covers them and there is
nothing to re-route.

**Minimal fallback (skill missing).** If `effective-delivery` is not available (not installed,
`skills.enabled: false`, or disabled via `exclude`), the short core guidance in this tool's
"Minimal fallback without skill" section applies. It keeps the workflow functional but
holds **no** second full audit handbook on hand – full depth comes only with the skill.

`refactor.md` carries more inline reasoning than `effective-flow review`; the delegable part is
the **gap analysis and plan validation** in Phase 1 (root cause, complexity/over-engineering,
scope, risk, refactor-plan quality). The cross-language/runtime migration branch stays with the
same owner, whose porting guidance covers it. Baseline, behavior invariance, reports and delivery
remain Effective Flow contract.

## Project conventions

If the project has an `AGENTS.md`, read it before analysis and refactoring and follow its guidance for structure, boundaries, tests, review and commits.

## Completion protocol

When you use internal sub-agents, give them this response protocol:

- `DONE` for fully completed
- `ABORT: [reason]` for not completable

Check by the orchestrator:

1. `DONE`: phase completed.
2. `ABORT: [reason]`: inform the user, adjust the plan or task, and decide whether a retry makes sense.
3. No keyword: resume once, then retry with escalation.

### Retry escalation

When an internal sub-agent ends without `DONE` or `ABORT`, its result counts as not finished rather than as a failed attempt. First resume the same sub-agent once — with its context intact where the harness allows — and a continuation hint to await any pending children and end with `DONE` or `ABORT`. That resume is not a retry. If the harness cannot resume that sub-agent, or the resumed run again ends without a keyword, escalate:

1. Retry 1: same task with a continuation hint
2. Retry 2: simplified task with reduced scope
3. Retry 3: minimal task for only the most critical subtask
4. After 3 failed attempts:
   - inform the user
   - clarify the options as free text: complete manually, continue with the next phase, abort the workflow

## Goal-driven completion control

Internal "repeat until done" loops of this workflow follow a uniform completion pattern instead of an ad-hoc formulated loop. The pattern pairs one declared completion goal with independent verification and visible progress control. It steers the workflow's own run, and the workflow's regular approval gates always apply.

### Goal controls

1. **Declare the completion condition up front.** Before the implementation work begins, formulate exactly one explicit, measurable completion condition. Derive it from the acceptance criteria and the validation plan of the basis (plan file, diagnosis or agreed scope). A good condition names the target state, the concrete check and the scope boundary – i.e. also what is deliberately not changed.
2. **Verify independently.** Do not check the condition by self-assessment, but via the independent instances anyway provided for it: ``effective-flow-code-validator`` for technical checks and the appropriate reviewer for content ones. The condition counts as fulfilled only once these instances confirm it.
3. **Loop with a bound.** If verification does not confirm the condition, fix the cause and verify again. Bound the internal correction rounds (guideline: three). If the condition still does not hold afterwards, abort the internal loop and escalate to the user instead of running on indefinitely – approach as in the retry escalation of the done protocol.
4. **Visible progress.** Every run keeps a visible phase task list and concise chat updates even when only a few phases remain; the generic task-tracking thresholds govern only ad-hoc subtask lists and never this overview. Whatever task tooling the harness offers must produce these guarantees:
   - Exactly one workflow owns the progress overview: `effective-flow apply-plan` hands ownership to its target workflow before that workflow's phases begin; `effective-flow apply-issues` and `effective-flow apply-review` retain ownership; a delegated subworkflow reports instead of a second progress overview.
   - Before work, list every known remaining numbered phase; add findings, issues or parallel subtasks as soon as their set is known; on resume, continue the existing list; keep more specific per-finding, per-issue, per-source and per-reviewer rules authoritative.
   - After each numbered phase and correction round, post a short update with its result and next step; these updates are not gates, so continue unless an existing approval rule or a genuine blocker requires input.
   - Mark skipped, terminally failed and aborted steps as such; keep a step awaiting user input open with its blocker; never treat terminal failure or abort as satisfying the completion condition.
   - If tracking fails irrecoverably, report that failure once, move still-open tracking to chat without claiming a successful tool update, and continue the domain work.
   - Before reporting completion, reconcile every known phase and dynamic entry to a truthful visible end state; never report completion with an unresolved entry.

**Load on demand:** Read `shared/worktree-integration.md`, when the delivery/worktree mode is determined (Phase 2, first step).

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

## Gated residual review-finding reports

**Load on demand:** Read `shared/durable-follow-up-gate.md`, when residual implementation-review candidates are about to be classified before ID reservation or materialization.

When a workflow review leaves candidates after its one correction pass, classify them through the
loaded “Durable derived-work gate” before any ID reservation, directory creation, or report write.
Only `admitted` residual root causes may enter a review-report file under
`.effective-flow/review/`.

Goal:

- Independently admitted material harm or structural irreversibility remains actionable.
- ``tools/apply-review.md`` can process only the admitted findings later in the familiar format.
- The plan file stays completion documentation and only points to the external report.

Status is still read in either complete report language, but it is only a candidate selector:

- English: `Open`, `Not implemented`, or `Not implemented (ADR: <slug>)`
- German: `Offen`, `Nicht umgesetzt`, or `Nicht umgesetzt (ADR: <slug>)`

Treat each English/German pair as the same semantic state when filtering or handing findings
between phases. Writers use only the values matching the complete report language; readers keep
both forms readable.

Do not carry over into the external report:

- Findings with status `Fixed` (English) or `Behoben` (German); legacy German `Umgesetzt` remains
  readable as the same completed state
- Findings that were fixed directly during the workflow
- purely informational reviewer comments without a concrete recommendation
- `current-scope`, `closed`, or `uncertain` candidates

Return every `current-scope` candidate to the owning workflow for correction, safe containment, or
an explicit scope decision by the authorized owner; completion stays blocked while one remains.
Resolve each credible `uncertain` path through its single bounded evidence/containment check or stop
and escalate. `closed` candidates produce only aggregate counts and short reasons in chat. Internal
implementation reviews create no closed appendix.

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

1. Finish confidence and design-decision filtering, same-run root-cause grouping, known-reference
   and exact-signature deduplication, then run admission once for the unresolved batch and fix the
   ordered list of `admitted` root causes the report will actually publish.
2. If the list is empty, publish no finding report and reserve no IDs.
3. Otherwise use “Shared memory-state mutation” against the absolute
   `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle to reserve the exact range for that
   list. Format the returned consecutive numbers with seven digits, e.g. `R-0000021`.
4. Only after the reservation is atomically persisted and the lock is released, publish the
   report with that fixed mapping. If reservation fails, publish nothing. If report publication
   then fails or is interrupted, report the error and leave the reserved IDs as permanent gaps;
   never roll back or reuse them.

### Report format

Resolve `language.workflow` and use the matching complete canonical report format from the shared
`review-report-format` fragment. Do not duplicate the template here. When appending to
an existing report, preserve its clearly recognizable report language.

Additional header fields for workflow reports:

- Directly below the matching project-type field, set the three matching English or German
  origin/source lines defined above. The plan path uses `<plan.dir>` from configuration.
- All tables and finding blocks stay in the `effective-flow review` format, with one additional
  report-language status field in every workflow finding:
  - English: `- **Status**: Fixed | Open | Not implemented`
  - German: `- **Status**: Behoben | Offen | Nicht umgesetzt`
- The `## Skipped findings (design decisions)` section is only emitted when such findings are present.
- Every finding carries the stable admitted record from the loaded gate. A workflow report that
  lacks an explicit valid `Admission outcome: admitted` is not an implementation source.

Rules:

- A Critical candidate caused by or required for the active slice is `current-scope` and cannot be
  exported. A genuinely independent Critical residual is reportable only after admission and an
  explicit decision to complete despite it.
- Determine the action as in `effective-flow review`: defect → `effective-flow fix`, structural problem → `effective-flow refactor`, missing functionality or safeguard → `effective-flow build`, pure documentation gap → `effective-flow docs`.
- Never enter anything automatically in `Developer note`. This field is reserved exclusively for
  the developer's manual notes and stays empty in automatically generated reports. When a finding
  was deliberately not implemented and an ADR exists, note the ADR reference in the matching
  report-language `Status`: `Not implemented (ADR: <slug>)` or
  `Nicht umgesetzt (ADR: <slug>)`.
- After writing, output the report path to the user.

**Load on demand:** Read `shared/review-report-format.md`, when a review report is written or an existing one is augmented.

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

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
5. Perform the gap analysis. The **reasoning** (root-cause placement, over-engineering/complexity lens, scope control, risk, unspoken assumptions, edge cases) follows `effective-delivery` (see "Delegation contract: generic audit reasoning"), if available; if the skill is missing, the minimal fallback applies. What stays Effective-Flow-specific is the check for **possible behavior changes** (refactoring must not change behavior) and **missing measurable acceptance criteria**.
6. Perform the plan validation. The substantive judgment (is the refactor plan viable, executable, correctly scoped) follows the same skill; the following **deterministic scorecard thresholds** and the **behavior invariance** remain Effective Flow output contract and are not handed off to the skill:
   - Clarity: file references, target >= 80%
   - Verification: measurable acceptance criteria beyond "tests pass"
   - Context: <= 10% guessing
   - Big Picture: benefit clear
   - Behavior invariance: every change justified
7. Present the plan with scorecard.
8. Derive the explicit completion condition from the measurable acceptance criteria (see "Goal-driven completion control"); it covers phases 2–6. The completion condition includes behavior invariance: the baseline collected in Phase 2 must remain unchanged.
9. Obtain approval.

Ask the user: **Refactoring plan approved?**
- Yes -- Approval granted, the workflow continues with Phase 2
- Adjust -- Enter feedback as free text

## Worktree record obligation

This binds a run only once it creates a worktree; a reused harness-managed, user-managed or
in-place checkout creates no record, and this self-check stays silent for it. Before any
`git worktree add`, reading the deferred `worktree-integration` fragment is mandatory, not a
judgement call. Immediately after its verified `effective-flow-created` receipt, and before setup
or delegation, write the lifecycle record
`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/<RECORD_ID>.json` exactly as
`worktree-lifecycle` specifies; if that write fails, retain the worktree and branch and stop. On
every exit path – completion, failure or abort – apply the transition that "Lifecycle outcome
handling" in `worktree-integration` assigns to it.

**Worktree-record exit self-check.** Run it after the exit path's own transition and before the
final report whenever this run executed `git worktree add`, with or without a receipt. Derive the
set from durable state, never from memory: the linked worktrees at this run's
`BASE_DIR/REPO_NAME/SESSION_ID` path in `git worktree list --porcelain`, and every record whose
`sessionId` and `workflow` match this run. Every worktree this run created must end with its
record deleted and the worktree unregistered, or with its record in cleanup-ready, aborted, failed
or cleanup-failed; anything else is reported. Report a `cleanup-in-progress` record. Report each
registered worktree no record names by `worktreePath` as its own entry with path and branch:
`effective-flow cleanup` cannot remove it, and manual reconciliation is required. Set a record left
`active` once – to `aborted` after a controlled stop, otherwise to `failed` – under the record lock
and the runtime-state write-safety guard, and report only a failed write. The self-check never
removes or claims a worktree and never creates or backfills a record.

### Phase 2: Baseline

First, read the deferred `worktree-integration` fragment now – a mandatory load before any
worktree is created – then, per "Delivery and worktree integration", determine the effective
delivery/worktree mode and its verified execution-location receipt, then run any applicable owned setup before the
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
   "Preferring" is the selection; **authority** is decided by the contract in point 5. A fallback
   notation `A › B` is an ordered preference: take the first available, non-excluded skill in the
   group, never both. If no such section exists (e.g. for tools), this point does not apply.
2. **Judge relevance:** Pull in only skills that clearly fit the **concrete** task (typically
   0–2), never "on suspicion". Never load the `effective-flow` router recursively as a
   **discovered skill**: re-entering the host of this run would create competing lifecycle and
   delivery owners. Declared tool-to-tool delegation is a different mechanism and stays allowed.
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
   current-docs skill (e.g. `context7-mcp`) when needed instead of guessing from memory.
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

### Phase 3.5: Documentation sync

Run the mandatory documentation sync gate for the files this refactoring changed, before review and
post-validation, so both cover the documentation changes. Documentation must describe the
restructured code, never a behavior change — a refactoring that alters no public surface commonly
ends in `no impact` verdicts, and the gate records them instead of skipping.

#### Documentation sync gate

Every implementation run passes this gate once its implementation is functionally complete and
before its verification, review and completion phases. The phase is **mandatory**: it is not
skippable, not conditional on a prior "is this user-relevant?" judgment, and not satisfied by an
intention to document later. It runs inside the calling workflow's already verified
execution-location receipt and owns no delivery, commit strategy, plan-status switch or worktree
of its own.

Every documentation surface the gate enumerates ends in exactly one recorded verdict — `updated`,
`no impact` or `blocked`. A surface left unassessed is an unfinished phase, and a `blocked`
surface prevents completion under the blocking rule of the detail contract.

**Load on demand:** Read `shared/documentation-sync-contract.md`, when the documentation sync phase starts.

### Phase 4: Review

1. Start every reviewer selected by project routing for the changed files, including
   ``effective-flow-generic-product-reviewer`` for degraded product buckets.
2. Aggregate findings and make exactly one automatic incorporation pass for new current-scope
   items. Run the affected review checks once after the pass, then classify the residual batch via
   “Gated residual review-finding reports”. A remaining `current-scope` or unresolved `uncertain`
   item blocks completion; only `admitted` residuals may become a report, and `closed` items do not.
3. Present the review results in detail, including status per finding. Treat the results as
   provisional until Phase 6 confirms that no regression remains. On every Phase 4 run, replace
   the previous provisional review set in full with the newest results; do not carry findings
   from superseded runs forward.
4. Document each admitted provisional finding in a structured way so open or unimplemented findings can
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
   - Status in the complete report language (English: Fixed / Open / Not implemented; German:
     Behoben / Offen / Nicht umgesetzt)
   - rationale for non-implementation or ADR reference as slug, if present, e.g. `(ADR: <slug>)`
   - the complete stable admitted record from “Durable derived-work gate”
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
     - if admitted findings with a canonical open or unimplemented status in the complete report language (`Open` / `Not implemented` or `Offen` / `Nicht umgesetzt`) remain, before applying the collision rule, search `.effective-flow/review/` for a report whose `Source workflow` is `effective-flow refactor` and whose `Source review` contains this run's finalization marker
     - if exactly one matching report exists, reuse that report and its path; complete or validate its contents and memory update as needed, and do not create a collision-suffixed report
     - if more than one matching report exists, stop before writing and escalate the ambiguity to the user
     - if no matching report exists, write the findings into at most one new file under `.effective-flow/review/` per "Open review-finding reports"
     - if no findings with those canonical English or German open/unimplemented statuses remain,
       do not create a report
     - if a plan file exists, use the file name `review-report-YYYY-MM-DD-plan-<slug>.md`
     - name any generated report path in the completion summary
   - if this refactoring implemented a finding from an existing review-report file in `.effective-flow/review/`:
     - add a short implementation note as the last entry directly in the affected finding
     - begin the note with `✅`, name at least the date and workflow, and include the same finalization marker, for example `✅ Implemented on YYYY-MM-DD via effective-flow refactor (run <SESSION_ID>)`
     - before appending, read the finding again and check for an implementation note with this exact finalization marker; if one exists, do not append another note
   - delete the wisdom file
   - if delivery or worktree execution was active: perform the handback per "Delivery and worktree integration" (for a guided plan file including the plan status switch to `Umgesetzt`/`Implemented` and archive move to `<plan.dir>/archive/` at the delivery point, commit the changes, ownership-safe worktree cleanup if applicable, completion action `pr`/`merge`/`branch`, defer the checkout). Hand only the **admitted residual** finding set of the latest Phase-4 review to that handback; never pass `current-scope`, `closed`, or unresolved `uncertain` candidates. If the workflow exceptionally runs in-place without delivery, it performs the same status switch and archive move directly in the working tree.
   - Run the worktree-record exit self-check.
   - summarize what was refactored and state the worktree-record exit self-check result; for an active delivery/worktree mode, additionally name the delivery branch, the final checkout state and the result of the completion action (PR URL, merge or retained branch)
   - confirm that the behavior stayed unchanged
   - emit the next-step block per `next-steps` as the last element of the report

## Pre-commit gate

Before every commit, the checks configured in the project must pass without errors. Typical checks are type-checking, linting, and tests — use the scripts defined in the project (e.g. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm agent:check`).

- If a check reports errors: fix the errors first, then check again.
- Never commit code that does not pass these checks.
- This rule applies even when a separate verification phase exists — it is an additional safeguard, not a replacement.

## Commit message rules

`effective-delivery` owns commit-message craft and is authoritative when present: deriving the
message from the staged diff, choosing a recognized type from the actual change, the
subject-boundary test, and when a body is owed. It states classification by effect in its general
form — `chore:` is no escape hatch for a user-visible change — but neither of the two refinements
below, which therefore **override** it: deployment-effective **config/env/secrets/CI** is not
`chore:`, and the **squash PR title** is the release signal and carries the same classification.
The two bans below are scope constraints rather than a second copy: this
repository states unconditionally what the skill makes conditional on a repository, host, or user
requirement.

- Resolve `language.git` through the shared language rule and write the human-readable subject
  description and body in that language. Preserve a valid user-supplied message. Conventional
  Commit types, optional scopes, `!`, trailer keys, issue references, and other machine tokens
  remain English/ASCII. This rule also governs Conventional Commit PR-title descriptions and
  explicitly generated changelog/release-note prose.
- **Never set `Co-Authored-By` trailers in commit messages**, regardless of whether an LLM (Claude, Codex, GPT, …) or another tool suggests the line or inserts it as a default.
- If a `Co-Authored-By` line is already present in a commit template, `commit.template`, a `--trailer` invocation, or a draft message: remove it before committing.
- **Do not add AI attribution:** no „Generated with Claude Code/Codex" footers and no agent session links (e.g. `https://claude.ai/code/…`) in commit messages – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex remain allowed, generation attribution does not.
- **Minimal fallback when `effective-delivery` is absent or undiscovered** — the floor that keeps such a run able to write an acceptable message, and not a second copy of the skill's guidance on choosing between types: take the type from the Conventional Commit set `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`; state concretely what was changed and why; and never settle for a generic message such as `update files` or `misc changes`. Several sources embed this fragment without recommending the skill, so the floor carries that substance itself rather than deferring it.
- Choose the commit type by **effect**, not by file type: behavior-changing changes – including pure **config/env/secrets/CI** with deployment or runtime effect (e.g. corrected values in env/secret artifacts that take effect remotely via sync) – are `fix:` (or `feat:` for new functionality). `chore:` only for **deploy-neutral** changes without behavioral effect (pure maintenance, formatting, tooling without runtime effect). This also applies to the **squash PR title**, which determines the release-please bump on a squash merge.
- Do not expose internal tracking IDs in commit messages, e.g. review finding IDs like `R-0000001`, local plan/review IDs like `F1`, or placeholders like `[Finding-ID]`. Such IDs belong in wisdom/report context, not in the Git history.

## Minimal fallback without the skill

Only relevant when `effective-delivery` is not available. Brief core guidance for the gap analysis and plan validation in Phase 1, so `refactor` degrades cleanly – **not** a second complete audit handbook:

- Place the cause in the right spot: address the structural problem itself, not the nearest symptom.
- Keep the scope narrow: only the planned restructuring; no features, no bug fixes, no gold-plating (over-engineering lens).
- Assess risk by blast radius: treat widely used or untestable spots more cautiously and in smaller steps.
- The deterministic scorecard thresholds above (Clarity >= 80%, Context <= 10% guessing) and the behavior invariance remain unchanged.

## Rules

- Start independent specialist phases in parallel
- give a status update after each phase
- no new features or bug fixes during the refactoring
