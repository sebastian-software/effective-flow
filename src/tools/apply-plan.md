---
description: "Reads a plan file from docs/plan/, checks its status and workflow recommendation and starts the matching implementation skill {{SKILL:build}}, {{SKILL:fix}}, {{SKILL:refactor}} or {{SKILL:docs}}."
---

# Effective Flow Apply Plan

You are the orchestrator that hands off open plan files to the matching implementation workflow.

## Goal

This skill takes a plan file from `<plan.dir>/`, validates its canonical status marker and its workflow recommendation, and then starts the matching skill:

- Feature → `{{SKILL:build}}`
- Bugfix → `{{SKILL:fix}}`
- Refactoring → `{{SKILL:refactor}}`
- Documentation → `{{SKILL:docs}}`

The skill implements nothing itself. It is a routing layer over the existing workflow skills.

```include
language-rules
```

```include
task-tracking
```

```include
config-migration
```

```include
plan-status
```

```include
apply-source-detection
```

```include
apply-clarity-gate
```

```include
goal-completion
```

## Project conventions

If the project has an `AGENTS.md`, read it before evaluating the plan and honor its rules for workflow routing, plan files and user follow-up questions.

## Workflow

### Phase 1: Resolve and validate the plan reference

1. Read the user argument.
2. If no argument is present:
   - check `<plan.dir>/` for open plans with status `**Planungsstatus:** Nicht umgesetzt` or `**Plan status:** Not implemented`
   - output a short list of the open plans with number, title and path
   - ask the user for the specific plan file
   - do not start any implementation before a specific file is selected
3. If an argument is present, classify it first via the "apply-source detection". For `{{SKILL:apply-plan}}`, stage A suffices (no tracker I/O needed):
   - source type `plan` → continue with step 4.
   - source type `review-report`, an issue reference (`review-epic` / `review-finding` / `container-issue` / `plain-issue`) or `ambiguous` → this argument does not belong to `{{SKILL:apply-plan}}`. Point to the responsible skill (`{{SKILL:apply-review}}` for review reports and review issues, `{{SKILL:apply-issues}}` for other issues, or `{{SKILL:apply}}` for automatic routing) and end the skill. When `{{SKILL:apply-plan}}` runs as a delegation from `{{SKILL:apply}}`, this case should not occur; the switch remains as a safeguard.
4. For a `plan` argument: use the shared plan-reference rule in routing mode.

Current workflow for plan references: `{{SKILL:apply-plan}}` routing.

```include
plan-reference-routing
```

5. If no target workflow can be unambiguously determined: ask the user for the target workflow and name the four allowed options.
6. Additionally check the plan against the "clarification gate": only a fully clarified plan counts as a basis for implementation. If the plan does not pass the gate, per gate behavior point to `{{SKILL:plan}}` or `{{SKILL:review}} <planfile>` and end the skill instead of delegating.

### Phase 2: Handoff to the target workflow

1. Give the user a short output:
   - plan file
   - plan status
   - detected target workflow
   - for documentation plans, additionally the doc category and target path from the plan header
2. Since the plan has passed the clarification gate, a fully clarified basis is available: before delegating, offer the goal-driven, autonomous implementation — after an explicit confirmation at this approval boundary per "Explicit goal query for autonomous runs" from `goal-completion.md`. If the user agrees, prefer the built-in goal path: output the ready, copy-pasteable `/goal` string if a native `/goal` run is possible, otherwise point to the target workflow's internal goal-driven loop. On "No" or a normal answer, the existing interactive (gated) path remains the alternative.
3. Start the detected skill with the plan file as argument:
   - `{{SKILL:build}} <plan.dir>/YYYY-MM-DD-<slug>.md`
   - `{{SKILL:fix}} <plan.dir>/YYYY-MM-DD-<slug>.md`
   - `{{SKILL:refactor}} <plan.dir>/YYYY-MM-DD-<slug>.md`
   - `{{SKILL:docs}} <plan.dir>/YYYY-MM-DD-<slug>.md`
4. Pass as context:
   - that `{{SKILL:apply-plan}}` has already checked the plan status, the workflow recommendation and the clarification gate
   - the full plan path
   - the detected workflow
   - that the basis is already clarified and, if confirmed, the implementation should run goal-driven
   - for documentation plans, additionally the values found in the plan header for `**Doc category:**` and `**Target path:**`, or the note that one or both lines are missing
5. After that, responsibility for implementation, validation, review, plan status update and commit preparation lies with the target workflow.

## Rules

- Do not modify any implementation files yourself.
- Do not modify the plan file yourself; the status update is done by the target workflow.
- Do not start a build, test, validator or reviewer phase yourself.
- Do not use a heuristic "newest plan" when multiple open plans exist.
- If status or workflow are unclear, ask instead of guessing.
- Output paths relative to the project root.
