---
description: "Orchestrates the complete feature workflow: intent gate, plan-reference detection, planning via {{SKILL:plan}}, project-aware implementation, documentation, tests, validation, review and completion."
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
runtime-state-safety
when: any wisdom, report, memory, or worktree mutation below `.effective-flow/` is imminent
```

```lazy-include
effective-flow-dir-migration
when: any wisdom, report, memory, or worktree mutation below `.effective-flow/` is imminent
```

```include
project-routing
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

```include
goal-start-action
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

## Project routing

Classify every affected file or domain with the canonical “Project routing” contract above. Use
the resulting implementer and reviewer buckets independently; mixed repositories do not have one
global project type. Start cleanly separable buckets in parallel.

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
- derive the explicit completion condition from the acceptance criteria and the validation plan, and before starting Phase 2 present the explicit goal query per "Explicit goal query for autonomous runs". Since Phase 1 is skipped here and there is no yes/no approval at this boundary, it is the standalone goal follow-up question; "Yes" performs the central harness-specific goal-start action for phases 2–7, while "No" continues gated. The query is omitted when the workflow was delegated non-interactively (e.g. by `{{FIRMO}} apply-review`); the handover through `{{FIRMO}} apply-plan` does not count as such delegation. If a "clarified + goal-driven" context was already passed from the apply chain (basis clarified, confirmation for the autonomous run already given), honor it directly: skip this query and run through phases 2–7 under the "Goal-driven completion control".
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
7. Obtain explicit approval. The approval question contains the explicit goal query (option "Autonomous via /goal"); handle it per "Explicit goal query for autonomous runs": if "Autonomous via /goal" is chosen, perform the central harness-specific goal-start action for phases 2–7; the option is omitted when the workflow was delegated non-interactively. Do not start Phase 2 without this approval.

If `{{SKILL:plan}}` aborts due to missing information, ask the user about the open points and then restart the planning.

```ask
header: Approval
question: Implementation plan approved?
options:
  - label: Yes
    description: Approval granted, workflow continues gated
  - label: Autonomous via /goal
    description: Remaining phases autonomous under the native /goal after this explicit selection (omitted for non-interactive delegation)
  - label: Adjust
    description: Enter feedback as free text
```

```include
skill-discovery
```

### Phase 2: Implementation

0. Per "Delivery and worktree integration", determine the effective delivery/worktree mode and
   its verified execution-location receipt, then run any applicable owned setup. Pass that
   receipt to every worker in phases 2–6 (implementation, docs, tests, validation, review);
   each write-capable boundary revalidates it and roots every operation there.
1. Start the appropriate implementer skill with the agreed plan:
   - Frontend: `Use the {{AGENT:ui-implementer}} skill for this phase.`
   - Backend/CLI: `Use the {{AGENT:nodejs-implementer}} skill for this phase.`
   - Rust: `Use the {{AGENT:rust-implementer}} skill for this phase.`
   - Other clearly identified product code: emit the contract’s reduced-depth notice, then use `Use the {{AGENT:generic-product-implementer}} skill for this phase.`
   - Tooling/CI/configuration/repository metadata: `Use the {{AGENT:generic-implementer}} skill for this phase.`
   - Fullstack: both in parallel or in clearly separated subphases
2. Check for the done protocol when delegating internally.
3. Check the result against the requirements.

### Phase 3: Documentation

Start in parallel if possible:

1. `{{AGENT:code-documenter}}` for in-code documentation of all new or changed exports, using the established conventions of each routed file/domain
2. `{{AGENT:docs-writer}}` for README/guide updates if the change is user-relevant

Assign documentation per file/domain using the canonical routing contract. Preserve the explicit
JS/TS and Rust branches; for other product languages, use repository-native conventions rather
than inventing a documentation format.

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

1. Start every reviewer selected by the canonical routing contract for the changed files, including `{{AGENT:generic-product-reviewer}}` for degraded product buckets. Tooling-only buckets still receive technical validation and do not route to the product fallback. Explicitly instruct each reviewer to deliver **all severities** (Critical + Important + Note), so the later plan-file report serves as a complete audit trail — deviating from the `{{SKILL:review}}` default, which delivers only Critical + Important.
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
8. Never create an ADR in this workflow and do not ask for one either. Deliberately unimplemented findings are documented exclusively in the review report. The developer decides on later implementation or on an ADR for a deliberate non-implementation when going through the findings file, typically via {{SKILL:apply-review}}.
9. If after review there remain findings with status `Open` or `Not implemented`:
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
## Review findings

**Date:** YYYY-MM-DD
**Reviewer:** [all routed reviewers / none]

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
6. If delivery or worktree execution was active: perform the handback per "Delivery and worktree integration" (plan status switch to `Umgesetzt`/`Implemented` and archive move to `<plan.dir>/archive/` at the delivery point, commit the changes, ownership-safe worktree cleanup if applicable, completion action `pr`/`merge`/`branch`, defer the checkout). If the workflow exceptionally runs in-place without delivery, perform the same status switch and archive move directly in the working tree.
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
  - end with `DONE` or `ABORT: [reason]`
- Write a wisdom summary after each completed phase
- Pass the accumulated insights from the wisdom file to each delegated phase
