## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with that contract as the worker instructions. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

# Effective Flow Fix

You are the orchestrator for the bugfix workflow.

## Goal

This workflow is optimized for finding and fixing defects, without unnecessary planning or documentation phases.

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

**Load on demand:** Read `shared/runtime-state-safety.md`, when any wisdom, report, backlink, or worktree mutation below `.effective-flow/` is imminent.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when any wisdom, report, backlink, or worktree mutation below `.effective-flow/` is imminent.

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

**Load on demand:** Read `shared/config-migration.md`, when the Effective Flow configuration is first read or a legacy config is migrated.

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

## Project conventions

If the project has an `AGENTS.md`, read it before investigation and fix and follow its guidance for analysis, implementation, tests, validation and commits.

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

Internal "repeat until done" loops of this workflow follow a uniform goal pattern instead of an ad-hoc formulated loop. The pattern combines the native `/goal` principles (Codex and Claude Code) with visible progress control. At explicit goal gates, the directly following central `goal-start-action` fragment renders the action after an authorized autonomous choice per harness.

### Goal controls

1. **Declare the completion condition up front.** Before the implementation work begins, formulate exactly one explicit, measurable completion condition. Derive it from the acceptance criteria and the validation plan of the basis (plan file, diagnosis or agreed scope). A good condition names the target state, the concrete check and the scope boundary – i.e. also what is deliberately not changed.
2. **Verify independently.** Do not check the condition by self-assessment, but via the independent instances anyway provided for it: ``effective-flow-code-validator`` for technical checks and the appropriate reviewer for content ones. The condition counts as fulfilled only once these instances confirm it.
3. **Loop with a bound.** If verification does not confirm the condition, fix the cause and verify again. Bound the internal correction rounds (guideline: three). If the condition still does not hold afterwards, abort the internal loop and escalate to the user instead of running on indefinitely – approach as in the retry escalation of the done protocol.
4. **Visible progress for an active native goal.** Once the native goal is active—whether started directly or through a pasted `/goal` prompt—the remaining workflow maintains a visible phase task list and concise chat updates even when only a few phases remain: before work, create or reconcile every known remaining numbered phase in stable order; mark each phase when it starts and reaches an end state; add findings, issues or parallel subtasks as soon as their set is known, without matching duplicates; on resume, continue the existing list; and keep more specific per-finding, per-issue, per-source and per-reviewer detail rules authoritative. Exactly one workflow owns the goal overview on the shared interaction surface: the orchestrator responsible for the remaining scope; `effective-flow apply-plan` hands ownership to its selected target workflow before that workflow’s remaining phases begin and opens no competing list, while `effective-flow apply-issues` and `effective-flow apply-review` retain ownership of their overall phases and issue or finding tasks; a non-interactively delegated subworkflow reports status and results to the owner and may keep a local detail list only in a harness-isolated subcontext, never as a second goal overview. Follow the native task tool’s state model: if only one entry may be active, keep the overall phase active while parallel detail work follows its existing rules and is summarized in chat; submit result-dependent status changes only after the determining tool result is known, never in the same parallel tool batch. After each numbered phase and each bounded correction round, post a short update with its result and the next step, adding a deviation or blocker only when present; during correction keep the phase active, report the failed check and correction result, and name the retry or escalation; these updates are not gates, so continue autonomously unless an existing approval rule or genuine blocker requires user input. Give skipped, terminally failed and aborted steps the best native end state, or an unambiguous `[skipped]`, `[failed]` or `[aborted]` suffix when none exists; keep a step awaiting user input open with its blocker, and never treat terminal failure or abort as satisfying the goal. If the task tool is unavailable, list the known remaining phases compactly in chat before continuing and carry their state in later updates; if updates fail irrecoverably, report that failure once, move all still-open tracking to chat without claiming a successful tool update, and continue the domain work. Immediately before goal success, the owner reconciles every known phase and dynamic entry—including the equivalent final chat summary in fallback mode—to a truthful visible end state, and independently verifies the domain completion condition; never complete the goal with an unresolved entry.

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
/goal Fully implement <plan file or agreed task> and run through the remaining phases of this workflow: all acceptance criteria fulfilled, project-configured checks green<, reviewer without open critical findings – only if the workflow has a review phase>. Maintain a visible phase task list and report the result and next step in chat after each major phase. Change nothing outside the scope. Stop when all criteria hold.
```

## Harness-specific goal-start action

When the explicit goal query in "Goal-driven completion control" authorizes an autonomous run, perform this harness-specific action:

After the user explicitly chooses the autonomous `/goal` option, output the full copy-pasteable `/goal` prompt prominently and ask the user to paste it as a new input. Use only this prompt handoff; without a pasted prompt, the workflow continues gated.

**Load on demand:** Read `shared/worktree-integration.md`, when the delivery/worktree mode is determined.

## Investigation method

This building block describes the read-only core of a bug and behavior investigation. The investigation steps described here are themselves read-only: they change no code and write no tests; a reproduction happens within these steps only through observation – running existing checks, describing logs and behavior – or through a documented reproduction guide. Whether the embedding workflow additionally produces a reproduction test is decided by that workflow itself (e.g. `effective-flow fix` additionally writes a failing test); `effective-flow investigate`, by contrast, stays fully read-only.

### Investigate symptom and code

1. Analyze the symptom or error description thoroughly: expected versus actual behavior.
2. Investigate the relevant code locally or via an internal Explore sub-agent – read-only.
3. Clarify open questions directly with the user:
   - when does the behavior occur
   - is there an error message or a clearly nameable expected versus actual behavior
   - since when has the behavior existed
4. Identify the suspected root cause and the affected files.

### Diagnosis validation

Assess the diagnosis with a scorecard before making a follow-up decision:

- **Clarity:** root cause as well as file and line named concretely.
- **Verification:** behavior reproducible or described as a concrete reproduction guide.
- **Context:** assumptions explicitly marked, target <= 10 % guessing.

## Wisdom Accumulation

At the start, generate a session ID (e.g. via timestamp `date +%Y%m%d%H%M%S`) and use it consistently for the wisdom file `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`. This prevents collisions with parallel runs.

If the wisdom write needs `.effective-flow/` to be created, apply the owning workflow's loaded
“Runtime-state write safety” contract to that exact directory immediately before its `mkdir`.
Immediately before creating, updating, or deleting the wisdom file, apply the contract again to
that concrete file path. A blocked guard leaves the file and directory unchanged.

Contents:

- discarded root-cause hypotheses
- reproduction steps and results
- discovered dependencies and side effects
- wrong assumptions

After each phase, write a summary and pass it on to later phases. Delete the file at the end.

## Project routing

Classify affected files and domains with the canonical “Project routing” contract above. Route
specialized and degraded product buckets separately from tooling-only work; ask only when the file
role is genuinely ambiguous.

Current workflow for review-report backlinks: `effective-flow fix`.

**Load on demand:** Read `shared/review-report-backlinks.md`, when a review-report backlink is written or updated.

**Load on demand:** Read `shared/unresolved-review-report.md`, when open or unimplemented review findings are offloaded as a report.

Current workflow for plan references: Bugfix (`effective-flow fix`).

**Load on demand:** Read `shared/plan-reference-routing.md`, when the argument could point to an existing plan file.

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

When an open plan for `effective-flow fix` is confirmed, it first passes through the
"clarification gate". If it does not pass the gate, refer according to the gate behavior to
`effective-flow plan` or `effective-flow review <planfile>` and end the workflow. If
the plan passes the gate:

- use the plan file's contents as the basis for diagnosis and fix
- do not skip reproduction automatically; if the plan already contains reproduction hints, validate them in Phase 2
- if a "clarified + goal-driven" context was already passed from the apply chain (basis clarified, confirmation for the autonomous run already given), honor it: skip the goal query in Phase 2 and run through phases 3–5 under the "Goal-driven completion control".

## Workflow

### Phase 1: Investigation

Run the read-only investigation per "Investigation method", section "Investigate symptom and code": analyze the error description, investigate the relevant code via an internal explore sub-agent, clarify the standard follow-up questions (when does the error occur, error message or expected versus actual behavior, since when) and identify the probable root cause along with the affected files.

### Phase 2: Reproduction

1. Try to reproduce the bug:
   - ``effective-flow-code-validator`` for the current technical state
   - if possible: ``effective-flow-test-writer`` for a failing test that documents the behavior
2. Perform a gap analysis for the diagnosis and fix strategy:
   - over-engineering
   - unspoken assumptions
   - missing acceptance criteria
   - edge cases
   - scope creep
3. Perform the diagnosis validation per "Investigation method" (Clarity, Verification, Context) and extend it with:
   - fix scope: minimal fix clearly defined
4. Present to the user:
   - where the bug is
   - what the root cause is
   - how it can be reproduced
   - gap-analysis insights
   - validation scorecard
5. Derive the explicit completion condition from the diagnosis, fix scope and acceptance criteria (see "Goal-driven completion control"); it covers phases 3–5 and feeds the explicit goal query in the approval question below.
6. Obtain approval. The approval question contains the explicit goal query (option "Autonomous via /goal"); handle it per "Explicit goal query for autonomous runs": if "Autonomous via /goal" is chosen, perform the central harness-specific goal-start action for phases 3–5; the option is omitted when the workflow was delegated non-interactively.

Ask the user: **Diagnosis and fix strategy approved?**
- Yes -- Approval granted, workflow continues gated
- Autonomous via /goal -- Remaining phases autonomous under the native /goal after this explicit selection (omitted for non-interactive delegation)
- Adjust -- Enter feedback as free text

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

### Phase 3: Fix

0. Per "Delivery and worktree integration", determine the effective delivery/worktree mode and
   its verified execution-location receipt, then run any applicable owned setup. Pass that
   receipt into phases 3–4 (fix, verification); each write-capable boundary revalidates it and
   roots every operation there.
1. Start every implementer selected by the canonical routing contract. Before
   ``effective-flow-generic-product-implementer``, emit the reduced-depth notice. Never send product code
   to ``effective-flow-generic-implementer``.
2. Give a precise assignment:
   - root cause
   - affected files
   - desired behavior after the fix
   - note: minimal change, no refactoring

### Phase 4: Verification

Start in parallel if possible:

1. ``effective-flow-test-writer``
   - confirms the failing test from Phase 2 or writes a regression test
2. ``effective-flow-code-validator``
   - repository-native lint, type, build and documentation checks that can be discovered safely
3. For every degraded generic product bucket, ``effective-flow-generic-product-reviewer``
   - performs a read-only qualitative review with the reduced-depth limitation
   - reports all severities; critical findings must be fixed before completion

If open findings or residual risks arise in the process, document them in a structured way so Phase 5 can write them as a review report:

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

### Phase 5: Completion

1. If errors were found in Phase 4: fix them and re-verify Phase 4 per "Goal-driven completion control": bound the internal correction rounds and escalate to the user if the completion condition still does not hold afterwards, instead of repeating indefinitely.
2. If findings or residual risks with a canonical open or unimplemented status in the complete
   report language (`Open` / `Not implemented` or `Offen` / `Nicht umgesetzt`) remain from
   verification, regression test or review-like check:
   - write them into a new file under `.effective-flow/review/` per "Open review-finding reports"
   - if a plan file exists, use the file name `review-report-YYYY-MM-DD-plan-<slug>.md`
   - name the generated report path in the completion summary
3. If this fix resolved a finding from an existing review-report file in `.effective-flow/review/`:
   - add a short implementation note as the last entry directly in the affected finding
   - begin the note with `✅` and name at least the date and workflow
4. Delete the wisdom file.
5. If delivery or worktree execution was active: perform the handback per "Delivery and worktree integration" (for a guided plan file including the plan status switch to `Umgesetzt`/`Implemented` and archive move to `<plan.dir>/archive/` at the delivery point, commit the changes, ownership-safe worktree cleanup if applicable, completion action `pr`/`merge`/`branch`, defer the checkout). If the workflow exceptionally runs in-place without delivery, it performs the same status switch and archive move directly in the working tree.
6. Summarize:
   - root cause
   - changes
   - new or adjusted tests
   - residual risks
   - for an active delivery/worktree mode: delivery branch, final checkout state and result of the completion action (PR URL, merge or retained branch)

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

## Rules

- Start independent specialist phases in parallel
- give the user a short status update after each phase
- fix errors before continuing
- keep changes minimal
- give internal sub-agents the done protocol
