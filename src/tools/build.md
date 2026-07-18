---
description: "Orchestrates the complete feature workflow: intent gate, plan-reference detection, planning via {{SKILL:plan}}, implementation, documentation, tests, validation, review and completion. Uses explicit skill switches such as {{AGENT:ui-implementer}}, {{AGENT:nodejs-implementer}}, {{AGENT:rust-implementer}}, {{AGENT:generic-implementer}}, {{AGENT:code-validator}}, {{AGENT:test-writer}}, {{AGENT:docs-writer}} and reviewers."
catalogHint: "Fully implements a new feature – plan, code, tests, review, completion."
---

# Effective Flow Build

You are the orchestrator for the complete development workflow for new features.

```include
language-rules
```

```include
task-tracking
```

```lazy-include
config-migration
when: the Effective Flow configuration is first read or a legacy config is migrated
```

## Project conventions

If the project has an `AGENTS.md`, read it early in the workflow and follow its guidance for planning, implementation, review, tests, docs and commits.

```include
plan-status
```

```lazy-include
plan-numbering
when: a plan file is created or its date-slug name is resolved
```

## Phase 0: Intent Gate

Before starting the workflow, classify the user's requirement:

1. Determine the intent:
   - Feature: new functionality, new UI element, new page, new integration
   - Bugfix: fix a defect, something does not work, unexpected behavior
   - Refactoring: restructure code, improve performance, reduce technical debt, without changing behavior
   - Documentation: change README, guides, API documentation or other documents without changing product or code behavior
2. If the intent is clearly a feature: continue.
3. If the intent is not clear, ask the user:

```ask
header: Intent
question: What type is this requirement?
options:
  - label: Feature
    description: New functionality, new UI element, new page or integration
  - label: Bugfix
    description: Fix a defect, correct unexpected behavior
  - label: Refactoring
    description: Restructure code without changing behavior
  - label: Documentation
    description: Change documentation without product or code behavior
```

4. For Bugfix or Refactoring:
   - emit a clearly visible message that no feature was detected
   - refer to `{{SKILL:fix}}` or `{{SKILL:refactor}}` respectively
   - end the workflow immediately
5. For Documentation:
   - emit a clearly visible message that a pure documentation change was detected
   - refer to `{{SKILL:docs}}`
   - end the workflow immediately, unless the user has explicitly confirmed `{{SKILL:build}}` as the desired workflow
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
   - marker language of the status line: determine it by the same procedure as `{{SKILL:plan}}` (`plan.markerLanguage` from the Effective Flow configuration (project setup ADR) → auto-detection from existing plans → English as fallback). Since this initial state documentation is only created when **no** plan files exist yet, detection does not apply; therefore: `plan.markerLanguage` if set (`"de"` → `**Planungsstatus:** Umgesetzt`, `"en"` → `**Plan status:** Implemented`), otherwise the English marker `**Plan status:** Implemented`. Produce exactly one status line, no mixed-language form. The example block below shows the German marker for illustration; replace the status line with the marker determined this way.

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

```include
completion-protocol
```

```include
goal-completion
```

```lazy-include
worktree-integration
when: the delivery/worktree mode is determined (Phase 2, step 0)
```

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
| Frontend                | `{{AGENT:ui-implementer}}`      | `{{AGENT:frontend-reviewer}}` |
| Backend / CLI / Node.js | `{{AGENT:nodejs-implementer}}`  | `{{AGENT:nodejs-reviewer}}`   |
| Rust                    | `{{AGENT:rust-implementer}}`    | `{{AGENT:rust-reviewer}}`     |
| Generic                 | `{{AGENT:generic-implementer}}` | `{{AGENT:code-validator}}`    |
| Fullstack               | both                            | both                          |

For Fullstack:

- start frontend and backend subtasks in parallel when both areas are affected
- if only one area is affected, use only the appropriate skill
- additionally start `{{AGENT:generic-implementer}}` when CI, tooling, configuration, dependency manifests or other generic artifacts are affected

## Delegation rules

Use explicit skill switches for specialist phases:

- Planning: `{{SKILL:plan}}`
- Frontend: `{{AGENT:ui-implementer}}`
- Backend/CLI: `{{AGENT:nodejs-implementer}}`
- Rust: `{{AGENT:rust-implementer}}`
- Generic/Tooling/CI/Config: `{{AGENT:generic-implementer}}`
- Code docs: `{{AGENT:code-documenter}}`
- User docs: `{{AGENT:docs-writer}}`
- Tests: `{{AGENT:test-writer}}`
- E2E: `{{AGENT:e2e-tester}}`
- Validation: `{{AGENT:code-validator}}`
- Review: `{{AGENT:frontend-reviewer}}`, `{{AGENT:nodejs-reviewer}}`, `{{AGENT:rust-reviewer}}`

For cleanly separable subtasks, the internal sub-agent pattern is allowed and preferred for parallel phases.

Current workflow for review-report backlinks: `{{SKILL:build}}`.

```lazy-include
review-report-backlinks
when: a review-report backlink is written or updated
```

```lazy-include
unresolved-review-report
when: open or unimplemented review findings are offloaded as a report
```

Current workflow for plan references: Feature (`{{SKILL:build}}`).

```lazy-include
plan-reference-routing
when: the argument could point to an existing plan file
```

```include
apply-clarity-gate
```

When an open plan for `{{SKILL:build}}` is confirmed, it first passes through the
"clarification gate". If it does not pass the gate, refer according to the gate behavior to
`{{SKILL:plan}}` or `{{SKILL:review}} <planfile>` and end the workflow. If
the plan passes the gate:

- skip Phase 1 entirely
- use the plan file's contents as the agreed implementation plan
- derive the explicit completion condition from the acceptance criteria and the validation plan, and before starting Phase 2 present the explicit goal query per "Explicit goal query for autonomous runs". Since Phase 1 is skipped here and there is no yes/no approval at this boundary, it is the standalone yes/no follow-up question; if "Autonomous via /goal" is chosen, emit the `/goal` string for phases 2–7. The query is omitted when the workflow was delegated non-interactively (e.g. by `{{FIRMO}} apply-review`); the handover through `{{FIRMO}} apply-plan` does not count as such delegation. If a "clarified + goal-driven" context was already passed from the apply chain (basis clarified, confirmation for the autonomous run already given), honor it directly: skip this query and run through phases 2–7 under the "Goal-driven completion control".
- start directly with Phase 2

A referenced unbuilt plan only replaces the planning phase. Initial state documentation, review-report backlinks, implementation, documentation, tests, validation, review and completion still run normally.

## Workflow

### Phase 1: Planning

If no unbuilt plan file was referenced:

1. Start `{{SKILL:plan}}` with the feature requirement.
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

If `{{SKILL:plan}}` aborts due to missing information, ask the user about the open points and then restart the planning.

```ask
header: Approval
question: Implementation plan approved?
options:
  - label: Yes
    description: Approval granted, workflow continues gated
  - label: Autonomous via /goal
    description: Remaining phases autonomous under the native /goal — the skill emits the /goal string to paste (omitted for non-interactive delegation)
  - label: Adjust
    description: Enter feedback as free text
```

```include
skill-discovery
```

### Phase 2: Implementation

0. Per "Delivery and worktree integration", determine the effective delivery/worktree mode and, when a mode is active, first run the appropriate setup: worktree setup for worktree execution or delivery-branch setup in the main repo for in-place delivery. All following phases 2–6 (implementation, docs, tests, validation, review) then run in the delivery working directory.
1. Start the appropriate implementer skill with the agreed plan:
   - Frontend: `Use the {{AGENT:ui-implementer}} skill for this phase.`
   - Backend/CLI: `Use the {{AGENT:nodejs-implementer}} skill for this phase.`
   - Rust: `Use the {{AGENT:rust-implementer}} skill for this phase.`
   - Generic/Tooling/CI/Config: `Use the {{AGENT:generic-implementer}} skill for this phase.`
   - Fullstack: both in parallel or in clearly separated subphases
2. Check for the done protocol when delegating internally.
3. Check the result against the requirements.

### Phase 3: Documentation

Start in parallel if possible:

1. `{{AGENT:code-documenter}}` for in-code documentation of all new or changed exports – JSDoc/TSDoc for JS/TS, rustdoc doc comments (`///`/`//!`) for Rust
2. `{{AGENT:docs-writer}}` for README/guide updates if the change is user-relevant (for Rust incl. crate/module docs)

Assign the documentation phase by the same project type as implementation and review (see "Routing by project type"). In mixed Rust/JS repos (project type Fullstack), documentation routes **per file/domain**: Rust files with rustdoc conventions, JS/TS files as before.

Skip user docs only with a short justification.

### Phase 4: Tests

Start in parallel if possible:

1. `{{AGENT:test-writer}}` for unit tests and component tests
2. `{{AGENT:e2e-tester}}` for new user flows if a real flow was added

### Phase 5: Validation

1. Start `{{AGENT:code-validator}}`.
2. Give the user the complete list of all errors and warnings found.
3. If errors are found: fix them directly or delegate again to the appropriate implementer.
4. Fix and re-verify per "Goal-driven completion control": bound the internal correction rounds and escalate to the user if the validator still does not pass afterwards, instead of repeating indefinitely.

### Phase 6: Review

1. Start the appropriate reviewer skill for the changed files. Explicitly instruct the reviewer to deliver **all severities** (Kritisch + Wichtig + Hinweis), so the later plan-file report serves as a complete audit trail — deviating from the `{{SKILL:review}}` default, which delivers only Kritisch + Wichtig.
2. Aggregate all review findings and classify them:
   - Kritisch: must be fixed before completion
   - Wichtig: should be fixed, can be handled as a follow-up
   - Hinweis: optional
3. Assign each finding a local ID in the order of aggregation: `F1`, `F2`, `F3`, ... These IDs apply only within this workflow run and are reused later in the plan file.
4. Fix all critical findings before completion.
5. Present the review results in this format. Additionally aggregate the Komplexität counters so Phase 7 can adopt them without deriving them again:

```markdown
**Review results**

Summary:
| Schweregrad | Count | Behoben | Offen |
|---|---|---|---|
| Kritisch | X | X | X |
| Wichtig | X | X | X |
| Hinweis | X | X | X |

| Komplexität | Count |
|---|---|
| Low | X |
| Medium | Y |
| High | Z |
```

Note: Before completion, the "Offen" column for "Kritisch" must be 0.

6. If findings were not implemented, list them directly in the summary with prompt suggestions for later implementation.
7. Document each finding in a structured way so open or unimplemented findings can be carried over into an external review report:
   - local ID (`F1`, `F2`, ...)
   - Title
   - Schweregrad (Kritisch / Wichtig / Hinweis)
   - Komplexität (Leicht / Mittel / Schwer)
   - Bereich
   - Datei + line
   - Problem
   - Empfehlung
   - Status (Behoben / Offen / Nicht umgesetzt)
   - rationale for non-implementation (incl. ADR reference as slug, if present, e.g. `(ADR: <slug>)`)
8. Never create an ADR in this workflow and do not ask for one either. Deliberately unimplemented findings are documented exclusively in the review report. The developer decides on later implementation or on an ADR for a deliberate non-implementation when going through the findings file, typically via {{SKILL:apply-review}}.
9. If after review there remain findings with status `Offen` or `Nicht umgesetzt`:
   - write them into a new file under `.effective-flow/review/` per "Open review-finding reports"
   - if a plan file exists, use the file name `review-report-YYYY-MM-DD-plan-<slug>.md`
   - record the generated report path for Phase 7
10. If this phase implemented a finding from an existing review-report file in `.effective-flow/review/`:

- add a short implementation note as the last entry directly in the affected finding
- begin the note with `✅` and name at least the date and workflow

### Phase 7: Completion

1. Run `{{AGENT:code-validator}}` one last time as a final check.
2. Document the completed workflow in the plan file, without changing the status marker beforehand:
   - if Phase 1 created a new plan file via `{{SKILL:plan}}`: update that file.
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
## Review-Findings

**Date:** YYYY-MM-DD
**Reviewer:** [frontend-reviewer / nodejs-reviewer / both / none]

### Summary

| Status | Count |
|---|---:|
| Behoben | X |
| Offen / Nicht umgesetzt | Y |

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

```include
pre-commit-gate
```

```include
commit-message-rules
```

- Always start independent specialist phases in parallel when they are truly independent
- Give the user a short status update after each phase
- If a phase reports errors, fix them before continuing
- Skip optional steps only with a short justification
- Give internal sub-agents the instruction:
  - first summarize the task in 2-3 sentences
  - end with `ERLEDIGT` or `ABBRUCH: [reason]`
- Write a wisdom summary after each completed phase
- Pass the accumulated insights from the wisdom file to each delegated phase
