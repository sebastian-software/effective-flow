
# Effective Flow Build

You are the orchestrator for the complete development workflow for new features.

## Language rule

- Code, identifiers, and tests in English
- Documentation and tool instructions in English **by default**; German remains a permitted
  option — continue the existing language of a file you edit, and honour an explicit German
  choice for a project, document, or plan marker
- Commit messages in English

English is the default; German is not deprecated. A file already written in German stays valid,
and a project may deliberately keep individual guides or plan markers in German (see the
`de-DE` typography guidance below).

### Typography

Locale-specific typography of visible prose — quotation marks, dashes, umlauts and ß, non-breaking
spaces, number and date formats — is owned by the central `locale-typography` skill. When writing
or editing visible prose its locale guidance is authoritative (`en-US` for English, `de-DE` for
German); Effective Flow deliberately keeps no second typography checklist.

If the skill is unavailable (not installed, `skills.enabled: false`, or disabled via `exclude`),
a minimal fallback applies to German text: real umlauts and ß instead of ASCII replacements (ae,
oe, ue, ss), typographic quotation marks „…“ instead of straight ones, and an en dash – instead
of a hyphen.

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

**Load on demand:** Read `shared/config-migration.md`, when the Effective Flow configuration is first read or a legacy config is migrated.

## Project conventions

If the project has an `AGENTS.md`, read it early in the workflow and follow its guidance for planning, implementation, review, tests, docs and commits.

## Plan status convention

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default
`docs/plan`).

Plan files in `<plan.dir>/` use exactly one canonical status marker in their header. The marker may be written in either German or English:

- open (German): `**Planungsstatus:** Nicht umgesetzt`
- completed (German): `**Planungsstatus:** Umgesetzt`
- open (English): `**Plan status:** Not implemented`
- completed (English): `**Plan status:** Implemented`

Both marker forms are equivalent. Only one language is used per plan file.

Rules:

- The status marker must be written exactly as in the four canonical examples above, including bold, colon, and the capitalization of the marker keys and values.
- The plan status only applies when exactly one line with the prefix `**Planungsstatus:**` or `**Plan status:**` is present. Multiple status lines (even in different languages) make the plan status unclear (see below) and should be corrected.
- The only valid value pairs are the four key-value combinations listed above. Mixed forms of a German key and an English value or vice versa (e.g. `**Plan status:** Umgesetzt`) are **not** considered valid.
- Other values such as `Open`/`Done`, `Pending`/`Complete`, or arbitrary free text do not count either.
- Other occurrences of „Nicht umgesetzt“, „Umgesetzt“, "Not implemented", or "Implemented" in review findings, ADR rationales, or body text do not count as a plan status.
- If the marker is missing, occurs multiple times, contains an invalid value, or uses a mixed form of key and value language, the plan status is unclear. In that case, do not automatically treat the plan as open or completed.
- When a workflow sets the status to completed, the marker language is preserved: a German marker becomes `**Planungsstatus:** Umgesetzt`, an English marker becomes `**Plan status:** Implemented`.

**Load on demand:** Read `shared/plan-numbering.md`, when a plan file is created or its date-slug name is resolved.

## Phase 0: Intent Gate

Before starting the workflow, classify the user's requirement:

1. Determine the intent:
   - Feature: new functionality, new UI element, new page, new integration
   - Bugfix: fix a defect, something does not work, unexpected behavior
   - Refactoring: restructure code, improve performance, reduce technical debt, without changing behavior
   - Documentation: change README, guides, API documentation or other documents without changing product or code behavior
2. If the intent is clearly a feature: continue.
3. If the intent is not clear, ask the user:

Frage den User: **What type is this requirement?**
- Feature -- New functionality, new UI element, new page or integration
- Bugfix -- Fix a defect, correct unexpected behavior
- Refactoring -- Restructure code without changing behavior
- Documentation -- Change documentation without product or code behavior

4. For Bugfix or Refactoring:
   - emit a clearly visible message that no feature was detected
   - refer to `$effective-flow fix` or `$effective-flow refactor` respectively
   - end the workflow immediately
5. For Documentation:
   - emit a clearly visible message that a pure documentation change was detected
   - refer to `$effective-flow docs`
   - end the workflow immediately, unless the user has explicitly confirmed `$effective-flow build` as the desired workflow
6. For Feature: first run the initial state documentation.

## Initial state documentation

Before the actual workflow starts, check whether the project already has documented plans:

1. Check whether `<plan.dir>/` exists and contains at least one `.md` file.
2. If no plan files exist:
   - create `<plan.dir>/` if needed
   - investigate the current project state locally or with an internal sub-agent:
     - project structure
     - existing files
     - technologies used
     - existing architecture decisions
   - write the initial state as `<plan.dir>/YYYY-MM-DD-initial-state.md` (date via `date +%F`)
   - use the format of the existing plan files:
   - marker language of the status line: determine it by the same procedure as `$effective-flow plan` (`plan.markerLanguage` from the Effective Flow configuration (project setup ADR) → auto-detection from existing plans → English as fallback). Since this initial state documentation is only created when **no** plan files exist yet, detection does not apply; therefore: `plan.markerLanguage` if set (`"de"` → `**Planungsstatus:** Umgesetzt`, `"en"` → `**Plan status:** Implemented`), otherwise the English marker `**Plan status:** Implemented`. Produce exactly one status line, no mixed-language form. The example block below shows the German marker for illustration; replace the status line with the marker determined this way.

```markdown
# Initial state — [Project name]

**Planungsstatus:** Umgesetzt

## Requirement

Documentation of the project state before the first feature workflow.

## Architecture decisions

[Existing architecture and design decisions]

## Affected files

| File | Description |
|---|---|
| [all relevant files] | [Description] |

## Implementation details

[Current project structure, technologies, dependencies]
```

3. If plan files exist: skip this step without a message.
4. If an initial plan file was created, record it in the wisdom file.

Important: The plan file in the completion phase gets its date-slug name according to `Plan file convention`.

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

Internal "repeat until done" loops of this workflow follow a uniform goal pattern instead of an ad-hoc formulated loop. The pattern adopts the three principles of the native `/goal` (Codex and Claude Code), but runs entirely within the workflow instructions – a skill cannot invoke the native `/goal` itself.

### The three principles

1. **Declare the completion condition up front.** Before the implementation work begins, formulate exactly one explicit, measurable completion condition. Derive it from the acceptance criteria and the validation plan of the basis (plan file, diagnosis or agreed scope). A good condition names the target state, the concrete check and the scope boundary – i.e. also what is deliberately not changed.
2. **Verify independently.** Do not check the condition by self-assessment, but via the independent instances anyway provided for it: ``code-validator`` for technical checks and the appropriate reviewer for content ones. The condition counts as fulfilled only once these instances confirm it.
3. **Loop with a bound.** If verification does not confirm the condition, fix the cause and verify again. Bound the internal correction rounds (guideline: three). If the condition still does not hold afterwards, abort the internal loop and escalate to the user instead of running on indefinitely – approach as in the retry escalation of the done protocol.

### Explicit goal query for autonomous runs

At the approval boundary of this workflow – where the completion condition is already fixed and the workflow is waiting for approval anyway – the user gets an **explicit choice** whether the remaining phases continue gated or autonomously under the native `/goal`. This replaces the earlier passive co-emitting of a `/goal` string: the option is actively queried, not merely offered.

#### When the query is omitted

Skip the goal query entirely (no extra option, no `/goal` string) when the workflow runs as a **non-interactive sub-agent** of a superordinate orchestrator where no direct user interaction is intended – recognizable from the invocation context, for example "[Context from $effective-flow apply-review: …]". `$effective-flow apply-review` already steers its autonomous run at its own gate; an additional goal query per sub-delegation would be pointless there. Direct invocations and the handover through `$effective-flow apply-plan` (interactive, individual) do **not** count as such delegation – there the goal query is retained.

#### Form of the query

- If the approval boundary is a yes/no approval, extend the approval question with a third option "Autonomous via `/goal`" next to "Yes" (continue gated) and "Adjust".
- If the approval boundary is a selection question (e.g. update groups) or if there is no yes/no approval at this boundary (e.g. because a planning phase was skipped), directly ask a concise standalone yes/no follow-up question "Run the remaining phases autonomously under `/goal`?".
- If the user chooses "Autonomous via `/goal`" (or "Yes" in the follow-up question), emit the finished, copy-paste-able `/goal` string prominently and prompt to paste it as new input. Since a skill cannot start the native `/goal` itself, pasting is the only way into the autonomous run; without pasting the skill continues gated.
- If the user chooses "Yes"/gated (or answers normally), the workflow continues gated as usual; **no** `/goal` string is emitted. The internal approval gates are retained in any case.

Rules for the `/goal` string once it is emitted:

- **Self-sustaining:** Reference the underlying plan file, if present, and instruct to run through the remaining phases of this workflow – not "somehow make the criteria green".
- **Measurable:** Name the completion condition with the checks actually provided in the respective workflow (e.g. acceptance criteria fulfilled, project-configured checks green and – if the workflow has a review phase – reviewer without open critical findings) and the scope boundary. Leave out checks that do not apply.
- **Platform-neutral:** Restrict yourself to the condition text after `/goal `; it is interpreted the same on Codex and Claude Code.
- **Only at gate-free boundaries:** Offer the autonomous run exclusively at approval boundaries after which no further approval gate follows, so an autonomous run does not get stuck at a later gate.

Form (replace placeholders, single line):

```text
/goal Fully implement <plan file or agreed task> and run through the remaining phases of this workflow: all acceptance criteria fulfilled, project-configured checks green<, reviewer without open critical findings – only if the workflow has a review phase>. Change nothing outside the scope. Stop when all criteria hold.
```

**Load on demand:** Read `shared/worktree-integration.md`, when the delivery/worktree mode is determined (Phase 2, step 0).

## Wisdom Accumulation

Insights from earlier phases must be passed on to later phases.

### Session isolation

Create a session ID at the start, for example via timestamp. Use it in:

- `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`

### Protocol

1. After each completed phase, write a summary into this file:

```markdown
## Phase X: [Name]
- **Decision:** [What was decided and why]
- **Problem:** [What was noticed or went wrong]
- **Context:** [What subsequent phases need to know]
```

2. Read the file before each delegated specialist phase and pass its content on as context.
3. Delete the file at the end of the workflow.

### What gets recorded

- architecture and design decisions with rationale
- problems and their resolution
- deviations from the original plan
- wrong assumptions
- technical constraints

## Project type detection

Determine the project type based on the following signals:

| Signal                                                                                                 | Project type |
| ------------------------------------------------------------------------------------------------------ | ------------ |
| React/Vue/Angular/Svelte dependencies, `src/components/`, `pages/`, `app/` with JSX/TSX                | Frontend     |
| Express/Fastify/Hono/Koa dependencies, `src/routes/`, `src/controllers/`, `src/services/`, `server.ts` | Backend API  |
| `bin/`, CLI entry point, commander/yargs/meow/clipanion                                                | CLI          |
| `Cargo.toml`/`Cargo.lock`, `src/main.rs`/`src/lib.rs`, `crates/`, `.rs` files, Cargo workspace         | Rust         |
| `.github/workflows/`, CI/CD, tooling, build, release, container or repository configuration            | Generic      |
| Combination of frontend + backend/CLI signals                                                          | Fullstack    |

A repo with Rust **and** JS/TS frontend/backend signals (e.g. Tauri, WASM) counts as Fullstack: Rust files go to the Rust agents, JS/TS files to the existing agents.
Generic files can be affected in addition to any project type; route them separately to the generic implementer instead of pushing them onto a language implementer.

### Routing by project type

| Project type            | Implementer                     | Reviewer                      |
| ----------------------- | ------------------------------- | ----------------------------- |
| Frontend                | ``ui-implementer``      | ``frontend-reviewer`` |
| Backend / CLI / Node.js | ``nodejs-implementer``  | ``nodejs-reviewer``   |
| Rust                    | ``rust-implementer``    | ``rust-reviewer``     |
| Generic                 | ``generic-implementer`` | ``code-validator``    |
| Fullstack               | both                            | both                          |

For Fullstack:

- start frontend and backend subtasks in parallel when both areas are affected
- if only one area is affected, use only the appropriate skill
- additionally start ``generic-implementer`` when CI, tooling, configuration, dependency manifests or other generic artifacts are affected

## Delegation rules

Use explicit skill switches for specialist phases:

- Planning: `$effective-flow plan`
- Frontend: ``ui-implementer``
- Backend/CLI: ``nodejs-implementer``
- Rust: ``rust-implementer``
- Generic/Tooling/CI/Config: ``generic-implementer``
- Code docs: ``code-documenter``
- User docs: ``docs-writer``
- Tests: ``test-writer``
- E2E: ``e2e-tester``
- Validation: ``code-validator``
- Review: ``frontend-reviewer``, ``nodejs-reviewer``, ``rust-reviewer``

For cleanly separable subtasks, the internal sub-agent pattern is allowed and preferred for parallel phases.

Current workflow for review-report backlinks: `$effective-flow build`.

**Load on demand:** Read `shared/review-report-backlinks.md`, when a review-report backlink is written or updated.

**Load on demand:** Read `shared/unresolved-review-report.md`, when open or unimplemented review findings are offloaded as a report.

Current workflow for plan references: Feature (`$effective-flow build`).

**Load on demand:** Read `shared/plan-reference-routing.md`, when the argument could point to an existing plan file.

## Clarification gate (fully clarified?)

Before a basis (plan file, issue, or review finding) is implemented, this
gate checks whether it is **fully clarified** and **implementable without a follow-up question**. The gate applies
at **both** entry points: in the apply chain (`$effective-flow apply` →
``tools/apply-plan.md``/``tools/apply-issues.md``/``tools/apply-review.md``) **and** on
direct invocation of an implementing workflow (`$effective-flow build`, `$effective-flow fix`,
`$effective-flow refactor`, `$effective-flow docs`) with a plan file.

Guiding principle: **No assumptions except the absolutely obvious.** When in doubt, prefer one
clarification round too many over one too few.

### Abort criteria (at least one applies → do not implement)

- **Open points:** the plan contains an `## Offene Punkte` or
  `## Open Points` section with entries other than the empty state (`- Keine offenen Punkte.` /
  `- No open points.`).
- **Missing measurable acceptance criteria:** there are no acceptance criteria, or they are
  formulated without a named check/metric (no concrete check, no verifiable
  target state).
- **Implementation-relevant assumptions:** the plan contains uncertainties marked as assumptions that
  materially affect the behavior, scope, or risk of the implementation.
- **Not self-contained (issues/findings):** an issue or finding does not describe the
  intended implementation self-containedly enough to work through it without a follow-up question.

Pure, uncritical assumptions with no implementation relevance do not block.

### Behavior at the gate

- **Passed** (no criterion applies): continue to implementation.
- **Not passed:** briefly name the affected points, refer back to a clarification round,
  and end the current skill instead of partially implementing or guessing.
  Target skill of the clarification: a plan file goes to `$effective-flow plan` or its in-depth
  plan review (`$effective-flow review <planfile>`); an issue or finding goes to
  `$effective-flow plan-issue`.

The gate replaces the former separate "check open points" check: where a workflow previously
ran this check on its own, this gate now serves as the single authoritative instance,
to avoid duplicate maintenance.

When an open plan for `$effective-flow build` is confirmed, it first passes through the
"clarification gate". If it does not pass the gate, refer according to the gate behavior to
`$effective-flow plan` or `$effective-flow review <planfile>` and end the workflow. If
the plan passes the gate:

- skip Phase 1 entirely
- use the plan file's contents as the agreed implementation plan
- derive the explicit completion condition from the acceptance criteria and the validation plan, and before starting Phase 2 present the explicit goal query per "Explicit goal query for autonomous runs". Since Phase 1 is skipped here and there is no yes/no approval at this boundary, it is the standalone yes/no follow-up question; if "Autonomous via /goal" is chosen, emit the `/goal` string for phases 2–7. The query is omitted when the workflow was delegated non-interactively (e.g. by `$effective-flow apply-review`); the handover through `$effective-flow apply-plan` does not count as such delegation. If a "clarified + goal-driven" context was already passed from the apply chain (basis clarified, confirmation for the autonomous run already given), honor it directly: skip this query and run through phases 2–7 under the "Goal-driven completion control".
- start directly with Phase 2

A referenced unbuilt plan only replaces the planning phase. Initial state documentation, review-report backlinks, implementation, documentation, tests, validation, review and completion still run normally.

## Workflow

### Phase 1: Planning

If no unbuilt plan file was referenced:

1. Start `$effective-flow plan` with the feature requirement.
2. Explicitly instruct the planning skill:
   - to change only `<plan.dir>/`
   - to produce no code
   - to start no implementation, test, validator or reviewer skills
   - to clarify open questions before the plan is written
3. Adopt the generated plan file as the agreed implementation plan.
4. Read the plan file in full and check:
   - exactly one canonical status line `**Planungsstatus:** Nicht umgesetzt` or `**Plan status:** Not implemented` is present
   - acceptance criteria are measurable
   - a validation plan is present
   - affected files are concrete enough for Phase 2
5. Present the plan file to the user with a short validation scorecard.
6. Derive the explicit completion condition from the acceptance criteria and the validation plan (see "Goal-driven completion control"); it covers phases 2–7 and feeds the explicit goal query in the approval question below.
7. Obtain explicit approval. The approval question contains the explicit goal query (option "Autonomous via /goal"); handle it per "Explicit goal query for autonomous runs": if "Autonomous via /goal" is chosen, emit the `/goal` string for phases 2–7; the option is omitted when the workflow was delegated non-interactively. Do not start Phase 2 without this approval.

If `$effective-flow plan` aborts due to missing information, ask the user about the open points and then restart the planning.

Frage den User: **Implementation plan approved?**
- Yes -- Approval granted, workflow continues gated
- Autonomous via /goal -- Remaining phases autonomous under the native /goal — the skill emits the /goal string to paste (omitted for non-interactive delegation)
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

### Phase 2: Implementation

0. Per "Delivery and worktree integration", determine the effective delivery/worktree mode and, when a mode is active, first run the appropriate setup: worktree setup for worktree execution or delivery-branch setup in the main repo for in-place delivery. All following phases 2–6 (implementation, docs, tests, validation, review) then run in the delivery working directory.
1. Start the appropriate implementer skill with the agreed plan:
   - Frontend: `Use the `ui-implementer` skill for this phase.`
   - Backend/CLI: `Use the `nodejs-implementer` skill for this phase.`
   - Rust: `Use the `rust-implementer` skill for this phase.`
   - Generic/Tooling/CI/Config: `Use the `generic-implementer` skill for this phase.`
   - Fullstack: both in parallel or in clearly separated subphases
2. Check for the done protocol when delegating internally.
3. Check the result against the requirements.

### Phase 3: Documentation

Start in parallel if possible:

1. ``code-documenter`` for in-code documentation of all new or changed exports – JSDoc/TSDoc for JS/TS, rustdoc doc comments (`///`/`//!`) for Rust
2. ``docs-writer`` for README/guide updates if the change is user-relevant (for Rust incl. crate/module docs)

Assign the documentation phase by the same project type as implementation and review (see "Routing by project type"). In mixed Rust/JS repos (project type Fullstack), documentation routes **per file/domain**: Rust files with rustdoc conventions, JS/TS files as before.

Skip user docs only with a short justification.

### Phase 4: Tests

Start in parallel if possible:

1. ``test-writer`` for unit tests and component tests
2. ``e2e-tester`` for new user flows if a real flow was added

### Phase 5: Validation

1. Start ``code-validator``.
2. Give the user the complete list of all errors and warnings found.
3. If errors are found: fix them directly or delegate again to the appropriate implementer.
4. Fix and re-verify per "Goal-driven completion control": bound the internal correction rounds and escalate to the user if the validator still does not pass afterwards, instead of repeating indefinitely.

### Phase 6: Review

1. Start the appropriate reviewer skill for the changed files. Explicitly instruct the reviewer to deliver **all severities** (Critical + Important + Note), so the later plan-file report serves as a complete audit trail — deviating from the `$effective-flow review` default, which delivers only Critical + Important.
2. Aggregate all review findings and classify them:
   - Critical: must be fixed before completion
   - Important: should be fixed, can be handled as a follow-up
   - Note: optional
3. Assign each finding a local ID in the order of aggregation: `F1`, `F2`, `F3`, ... These IDs apply only within this workflow run and are reused later in the plan file.
4. Fix all critical findings before completion.
5. Present the review results in this format. Additionally aggregate the Complexity counters so Phase 7 can adopt them without deriving them again:

```markdown
**Review results**

Summary:
| Severity | Count | Fixed | Open |
|---|---|---|---|
| Critical | X | X | X |
| Important | X | X | X |
| Note | X | X | X |

| Complexity | Count |
|---|---|
| Low | X |
| Medium | Y |
| High | Z |
```

Note: Before completion, the "Open" column for "Critical" must be 0.

6. If findings were not implemented, list them directly in the summary with prompt suggestions for later implementation.
7. Document each finding in a structured way so open or unimplemented findings can be carried over into an external review report:
   - local ID (`F1`, `F2`, ...)
   - Title
   - Severity (Critical / Important / Note)
   - Complexity (Low / Medium / High)
   - Area
   - File + line
   - Problem
   - Recommendation
   - Status (Fixed / Open / Not implemented)
   - rationale for non-implementation (incl. ADR reference as slug, if present, e.g. `(ADR: <slug>)`)
8. Never create an ADR in this workflow and do not ask for one either. Deliberately unimplemented findings are documented exclusively in the review report. The developer decides on later implementation or on an ADR for a deliberate non-implementation when going through the findings file, typically via `tools/apply-review.md`.
9. If after review there remain findings with status `Open` or `Not implemented`:
   - write them into a new file under `.effective-flow/review/` per "Open review-finding reports"
   - if a plan file exists, use the file name `review-report-YYYY-MM-DD-plan-<slug>.md`
   - record the generated report path for Phase 7
10. If this phase implemented a finding from an existing review-report file in `.effective-flow/review/`:

- add a short implementation note as the last entry directly in the affected finding
- begin the note with `✅` and name at least the date and workflow

### Phase 7: Completion

1. Run ``code-validator`` one last time as a final check.
2. Document the completed workflow in the plan file, without changing the status marker beforehand:
   - if Phase 1 created a new plan file via `$effective-flow plan`: update that file.
   - if the user referenced an unbuilt plan file: update the referenced file.
   - if, exceptionally, no plan file exists: create `<plan.dir>/` and assign the date-slug name per `Plan file convention`.
   - the status marker stays unchanged here (`**Planungsstatus:** Nicht umgesetzt` or `**Plan status:** Not implemented`): the status switch to `Umgesetzt`/`Implemented` and the archiving to `<plan.dir>/archive/` are handled by step 6 below at the delivery point per "Delivery and worktree integration" (exception: in-place without delivery, see there).
   - Content:
     - requirement
     - architecture decisions
     - affected files
     - implementation details
     - test results
     - review result and reference to external review reports if open findings were offloaded
3. **Plan-file findings summary:** Write only a compact summary in the plan file. Open or unimplemented findings are not copied in full into the plan file, but written into the external review report from Phase 6.

   Use this template:

```markdown
## Review findings

**Date:** YYYY-MM-DD
**Reviewer:** [frontend-reviewer / nodejs-reviewer / both / none]

### Summary

| Status | Count |
|---|---:|
| Fixed | X |
| Open / Not implemented | Y |

**External review report:** `.effective-flow/review/review-report-YYYY-MM-DD-plan-<slug>.md` <!-- only output if open findings were offloaded -->

No findings found. <!-- only output if no findings arose -->
```

Rules for the findings report:

- Do not copy open or unimplemented findings in full into the plan file.
- If open or unimplemented findings exist, name the external review report from Phase 6.
- Fixed findings may be counted briefly; full details of fixed findings are not required in the plan file.
- If no findings arose: write "No findings found." in the section instead of the tables.
- If no reviewers were started in Phase 6 (e.g. because the change required no review): write a short note with justification in the section instead.

4. Delete the wisdom file.
5. Check whether a formatter is configured and format all changed files including the plan file once, consistently.
6. If delivery or worktree execution was active: perform the handback per "Delivery and worktree integration" (plan status switch to `Umgesetzt`/`Implemented` and archive move to `<plan.dir>/archive/` at the delivery point, commit the changes, retract the worktree if applicable, completion action `pr`/`merge`/`branch`, defer the checkout). If the workflow exceptionally runs in-place without delivery, perform the same status switch and archive move directly in the working tree.
7. Summarize what was implemented, tested and documented; for an active delivery/worktree mode, additionally name the delivery branch, the final checkout state and the result of the completion action (PR URL, merge or retained branch).

## Rules

## Pre-commit gate

Before every commit, the checks configured in the project must pass without errors. Typical checks are type-checking, linting, and tests — use the scripts defined in the project (e.g. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm agent:check`).

- If a check reports errors: fix the errors first, then check again.
- Never commit code that does not pass these checks.
- This rule applies even when a separate verification phase exists — it is an additional safeguard, not a replacement.

## Commit message rules

- **Never set `Co-Authored-By` trailers in commit messages**, regardless of whether an LLM (Claude, Codex, GPT, …) or another tool suggests the line or inserts it as a default.
- If a `Co-Authored-By` line is already present in a commit template, `commit.template`, a `--trailer` invocation, or a draft message: remove it before committing.
- **Do not add AI attribution:** no „Generated with Claude Code/Codex" footers and no agent session links (e.g. `https://claude.ai/code/…`) in commit messages – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex remain allowed, generation attribution does not.
- Avoid generic messages like `update files` or `misc changes`.
- Describe concretely what was changed and why.
- Use Conventional Commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Choose the commit type by **effect**, not by file type: behavior-changing changes – including pure **config/env/secrets/CI** with deployment or runtime effect (e.g. corrected values in env/secret artifacts that take effect remotely via sync) – are `fix:` (or `feat:` for new functionality). `chore:` only for **deploy-neutral** changes without behavioral effect (pure maintenance, formatting, tooling without runtime effect). This also applies to the **squash PR title**, which determines the release-please bump on a squash merge.
- Do not expose internal tracking IDs in commit messages, e.g. review finding IDs like `R-0000001`, local plan/review IDs like `F1`, or placeholders like `[Finding-ID]`. Such IDs belong in wisdom/report context, not in the Git history.

- Always start independent specialist phases in parallel when they are truly independent
- Give the user a short status update after each phase
- If a phase reports errors, fix them before continuing
- Skip optional steps only with a short justification
- Give internal sub-agents the instruction:
  - first summarize the task in 2-3 sentences
  - end with `DONE` or `ABORT: [reason]`
- Write a wisdom summary after each completed phase
- Pass the accumulated insights from the wisdom file to each delegated phase
