## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. Only the workflow/tool orchestrator starts workers or analysis fan-out. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with zero inherited turns when supported, otherwise its smallest supported history. Use that contract as the worker instructions and add a compact, self-contained handoff containing the objective, relevant artifact paths, scoped paths and ownership, execution and runtime-state roots when writes are allowed, resolved language, authority and write limits, and completion protocol. The worker is a leaf executor: it starts no child and returns missing essential context to the orchestrator. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

# Effective Flow Maintain

You are the orchestrator for recurring project maintenance – a **thin adapter** around the dependency path of the central `effective-delivery` skill.

## Goal

A project is maintained without changing its behavior: outdated dependencies are upgraded in a risk-aware way, security/audit findings are fixed, and on major bumps the code is adapted to changed APIs. A green before-baseline serves as a safety net.

`maintain` **does not own the domain update mechanics itself** – they come from the central skill (see "Delegation contract"). `maintain` only steers the orchestration and the delivery.

Sharp scope boundary – `maintain` is deliberately lean:

- **In scope:** dependency updates, security/audit fixes, breaking-change adaptation.
- **Not in scope:** general refactoring or dead code (→ `effective-flow refactor`), bugfixes unrelated to dependencies (→ `effective-flow fix`), pure formatting/config upkeep (→ ``effective-flow-code-validator``), new functionality (→ `effective-flow build`).
- **Not a scheduler:** automatic, time-triggered bumping is handled by tools like Renovate or Dependabot. `maintain` is the interactive "clean up now" run.

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

**Load on demand:** Read `shared/runtime-state-safety.md`, when any wisdom, report, memory, runtime migration, or worktree mutation is imminent.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when any wisdom, report, memory, runtime migration, or worktree mutation is imminent.

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
   under `<path>`. The legacy spelling `**Firmo project setup:** <path>` is recognized as
   equivalent on read; the spelling stays here because it is the **detection** predicate, while
   what that recognition then triggers belongs to the deferred building block below. If the
   marker points to a path under which **no** ADR lives
   (dead/stale marker), do not stay there, but fall through in this order and report the stale
   marker (correction in effective-flow setup).
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
the run (see "Table encoding"). Creating the ADR, the markers and the migration happen exclusively
in the Git-touching path of effective-flow setup.

**Load on demand:** Read `shared/config-migration-edge-cases.md`, when the locator finds no ADR whose stem is exactly the current slug, its scan matches several files, a legacy setup marker or legacy slug is present, the transitional `.effective-flow/config.json` / `.firmo/config.json` fallback must be read, or a `tracker.mode: external` run resolves `tracker.externalStartedState` or `tracker.externalDoneState`, or a retired row named under "Table encoding" is present.

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

If the table is invalid or ambiguous (missing key, unknown encoding): use a
safe default for the run, inform the user about the affected key,
do **not** guess.

## Recommended skills

- `effective-delivery`

## Delegation contract

`effective-delivery` is the **declared domain owner** for dependency updates (classification `delegate`, see [Skill ownership](../../docs/developer-guide/skill-ownership.md)). The skill reaches well beyond them – audits, documentation, pull-request judgment, porting, and repository-native validation belong to it as well – but the part `maintain` delegates is its dependency work, and there its guidance is **authoritative**, not optional advice; `maintain` carries **no second copy** of this playbook.

**The skill owns the update mechanics (the "how"):**

- ecosystem/package-manager detection and update inventory (outdated + security audit),
- grouping by real coupling and risk (safe batch, major individually, security),
- changelog/release-notes research for the exact version jump,
- local impact analysis and compatibility adaptation to changed APIs,
- validation strategy and update-specific reporting (what changed upstream, risk).

**`maintain` owns the orchestration and delivery (the "what/when"):**

- the `effective-flow maintain` entry point, the scope gate, and the progress updates,
- Effective Flow configuration, goal/completion steering, and review-report backlinks,
- the green before/after baseline as a safety net,
- the delivery policy: **one commit per group**, worktree isolation, and delivery handback.

**Delivery constraint on the skill (binding).** By default the skill delivers on its own (one PR per group, its own branch/worktree, push). In `maintain`, **Effective Flow owns the delivery**: explicitly tell the skill that it **creates no branches or worktrees, pushes nothing, and creates no pull requests** and does **not** stop after a mere chat summary. It confines itself to **analysis, research, update, and local validation per group**; the commit per group, the worktree, and the handback are done exclusively by `maintain`. This way two delivery loops do not run in parallel.

**Minimal fallback (skill missing).** If `effective-delivery` is unavailable (not installed, `skills.enabled: false`, or disabled via `exclude`), the short core guidance under "Minimal fallback without the skill" applies. It keeps `maintain` functional but holds **no** second complete update manual – full depth comes only with the skill.

## Project conventions

If the project contains an `AGENTS.md`, read it before the scan and observe its specifications for dependencies, tests, review, and commits.

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

**Load on demand:** Read `shared/worktree-integration.md`, when the delivery/worktree mode is determined (Phase 1, step 2).

This workflow keeps no plan file — its basis is the dependency and security surface, not a plan —
so it carries no deferred pointer to `plan-archival` and performs no plan-file status switch and no
archiving.

## Wisdom Accumulation

At the start, generate a session ID (e.g. via timestamp `date +%Y%m%d%H%M%S`) and use it consistently for the wisdom file `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`. This prevents collisions on parallel runs.

Contents:

- baseline values and their meaning
- chosen update groups and rationale
- result per group (committed, rolled back, or marked as "manual")
- breaking changes reported by the skill with migration source (changelog/release notes)

Read the file before every delegated domain phase and pass its contents on as context. Delete it at the end of the workflow.

Current workflow for review-report backlinks: `effective-flow maintain`.

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

## Workflow

### Phase 0: Scope gate

1. Confirm that this is maintenance in the sense above. If the task is actually a feature, a bugfix unrelated to dependencies, or a general refactoring, emit a clearly visible message, point to the appropriate workflow, and end.
2. Classify affected compatibility-adaptation files with the canonical “Project routing” contract above. It determines implementer and reviewer buckets; ecosystem/package-manager detection itself remains with the central updater skill.
3. If no `package.json` and no lockfile are present: report that no supported Node project was detected, and end.

### Phase 1: Skill discovery and delivery setup

1. Review the available skills and bring in `effective-delivery` per skill discovery. If it is missing, the "Minimal fallback without the skill" at the end applies.

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

2. Determine the effective delivery/worktree mode and verified execution-location receipt per
   "Delivery and worktree integration", then run any applicable owned setup **before** baseline
   and updates. Pass the receipt through all following phases, revalidate it at each
   write-capable boundary and root every operation there so the per-group commits land on the
   intended delivery branch.

### Phase 2: Baseline

Start in parallel with the verified execution-location receipt:

1. ``effective-flow-code-validator`` – type checking, lint, build status.
2. ``effective-flow-test-writer`` – run only the existing tests and document the result; write no new tests in this phase.

Wait for both baseline workers to finish and preserve both diagnostics before deciding whether the
baseline is green. Document the complete baseline. If either result is already red (build/tests
broken before any update):

1. Do not update, since otherwise later regressions cannot be distinguished from pre-existing
   problems, and point to `effective-flow fix`.
2. Run the dedicated "Abort handback before implementation" from "Delivery and worktree
   integration" with the retained current-run delivery state.
3. Report both baseline diagnostics, the final checkout, every removed artifact, and every retained
   path or branch with its exact reason. Report partial cleanup explicitly.
4. End the workflow before Phase 3 and before any commit, completion prompt, push, pull request or
   merge.

### Phase 3: Delegated update implementation

For the actual update work, follow the dependency path of `effective-delivery` under the **delivery constraint** established above. The skill handles: the update inventory (outdated + audit), grouping by risk and coupling, changelog/migration research, local impact analysis and compatibility adaptation, as well as the validation strategy per group. `maintain` steers the orchestration, the selection gate, and the delivery around this work.

1. **Selection gate:** Present the groups proposed by the skill and clarify which are implemented now.

Ask the user: **Which of the proposed update groups should be implemented now?**
- All safe ones -- Safe batch (patch/minor) and security fixes automatically, skip major bumps
- Major too -- Additionally the major bumps individually with breaking-change adaptation
- Security only -- Apply audit/security fixes exclusively
- Selection -- Name specific groups as free text

2. From the chosen update selection, derive the explicit completion condition (implemented groups, baseline comparison green, reviewer with no open critical findings on code adaptations; see "Goal-driven completion control"); it covers phases 3–5.
3. Work through the approved groups **one after another**. For each group the skill applies the version jump, updates the lockfile via the detected manager, researches breaking changes, and where needed adapts local code to the changed API – carried out via every implementer selected in phase 0. Emit the reduced-depth notice before ``effective-flow-generic-product-implementer``; reserve ``effective-flow-generic-implementer`` for tooling/CI/configuration. The task is only to adapt to the changed API, with no new behavior. Afterwards `maintain` compares against the baseline:
   - green → **one clean commit per group** (see commit rules), with the description in resolved
     `language.git` and a stable Conventional Commit type, e.g. `chore(deps): …`.
   - red and repairable → follow up with an adaptation via the implementer, validate again – limit the internal correction rounds per "Goal-driven completion control"; if the group stays red afterwards, treat it as "not sensibly repairable" instead of repeating indefinitely.
   - red and not sensibly repairable → roll the group back (manifest and lockfile to the state before the group) and mark it as "manual".
4. Record the result and rationale per group in the wisdom file.

### Phase 3.5: Documentation sync

Run the mandatory documentation sync gate once for all implemented groups, after the group loop and
before review. Typical surfaces here are documented runtime or dependency requirements, changed
build or test commands, and migration notes for a breaking upgrade.

Phase 3 already committed one clean commit per update group, so the gate's own changes get their
own dedicated commit (Conventional Commit type `docs`) before Phase 4; never fold them into an
unrelated group commit and never leave them uncommitted for the handback.

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

Only if code was adapted for breaking changes in phase 3:

1. Start every reviewer selected by project routing for the changed files, including
   ``effective-flow-generic-product-reviewer`` for degraded product buckets.
2. Fix critical findings before completion.
3. Make exactly one automatic incorporation pass for new current-scope findings, then classify the
   residual batch through “Gated residual review-finding reports”. Preserve the maintenance
   security evidence supplied by `effective-delivery`: security taxonomy alone does not admit a
   finding, but a concretely evidenced reachable material-harm residual may be admitted. Remaining
   `current-scope` or unresolved `uncertain` items block; `closed` items create no artifact.
4. If admitted findings with a canonical open or unimplemented status in the complete report language
   (`Open` / `Not implemented` or `Offen` / `Nicht umgesetzt`) remain, write them per "Open
   review-finding reports" into a new file under `.effective-flow/review/` and name the report
   path in the completion summary.

Pure dependency bumps without code adaptation need no reviewer pass; note that briefly.

### Phase 5: Report and completion

1. Run ``effective-flow-code-validator`` one last time as a final check.
2. Summarize based on the update-specific reporting from the skill:
   - which groups were implemented and committed (with version jumps),
   - which audit findings were fixed,
   - which updates were deferred as "manual" and why,
   - a reference to an offloaded review report, if present.
3. Confirm that the behavior stayed unchanged (baseline comparison green).
4. Delete the wisdom file.
5. If delivery or worktree execution was active: run the handback per "Delivery and worktree integration". The per-group commits already sit on the delivery branch; the handback performs ownership-safe worktree cleanup if applicable, runs the completion action `pr`/`merge`/`branch`, and restores only an in-place checkout it switched. Hand only the **admitted residual** Phase-4 finding set to that handback; never pass `current-scope`, `closed`, or unresolved `uncertain` candidates. If Phase 4 did not run at all (pure dependency bumps without code adaptation), declare **no** complete finding set, so an automatic PR review reviews the pull request itself. Name the delivery branch, the final checkout state, and the result in the summary.
6. Emit the next-step block per `next-steps` as the last element of the report.

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

Only relevant when `effective-delivery` is unavailable. Short core guidance so that `maintain` degrades cleanly – **not** a second complete update manual:

- Detect the package manager from the lockfile (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `bun.lockb` → bun, otherwise `package-lock.json`/npm) and derive all commands from it – never hardcode npm.
- Collect outdated dependencies (`outdated`) and security findings (`audit`) via the detected manager.
- Group roughly: safe batch (patch/minor without known breaking changes), major individually (with a changelog note), security separately.
- Per group: apply the bump, update the lockfile via the manager, validate against the baseline; green → one commit per group, red → roll back and mark as "manual".
- On major bumps read the changelog/release notes and adapt code only to the changed API (no new behavior).

## Rules

- Start independent phases (baseline validation and tests) in parallel.
- Give a brief status update after each phase.
- One commit per group, not a single collective commit across all updates.
- Never update while the baseline is red.
- No new features, no unplanned bugfixes, and no general refactoring in the maintenance run.
- On unclear risk (major without tests in the affected area) get individual confirmation instead of waving it through in the batch.
- Delivery stays with `maintain`: the delegated skill creates no branches/PRs and does not push.
