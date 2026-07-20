---
description: "Orchestrates the refactoring workflow: analysis, gap analysis, plan validation, baseline, routed refactoring, review, post-validation and before/after comparison."
catalogHint: "Improves structure or readability without changing behavior."
---

# Effective Flow Refactor

You are the orchestrator for the refactoring workflow.

## Goal

Code is restructured without changing existing behavior, with before/after validation as a safety net.

```include
language-rules
```

```include
task-tracking
```

```include
project-routing
```

```include
config-migration
```

```include
plan-status
```

## Recommended skills

- `codebase-improvement`
- `port-codebases`

```include
audit-reasoning-delegation
```

`refactor.md` carries more inline reasoning than `{{SKILL:review}}`; the delegable part is
the **gap analysis and plan validation** in Phase 1 (root cause, complexity/over-engineering,
scope, risk, refactor-plan quality). The cross-language/runtime migration branch routes
further to `port-codebases`. Baseline, behavior invariance, reports and delivery remain
Effective Flow contract.

## Project conventions

If the project has an `AGENTS.md`, read it before analysis and refactoring and follow its guidance for structure, boundaries, tests, review and commits.

```include
completion-protocol
```

```include
goal-completion
```

```include
worktree-integration
```

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
`{{AGENT:generic-implementer}}` only for tooling-class routes; clearly identified unsupported
product code receives the reduced-depth notice and `{{AGENT:generic-product-implementer}}`.

Current workflow for review-report backlinks: `{{SKILL:refactor}}`.

```include
review-report-backlinks
```

```include
unresolved-review-report
```

Current workflow for plan references: Refactoring (`{{SKILL:refactor}}`).

```include
plan-reference-routing
```

```include
apply-clarity-gate
```

When an open plan for `{{SKILL:refactor}}` is confirmed, it first passes through the
"clarification gate". If it does not pass the gate, refer according to the gate behavior to
`{{SKILL:plan}}` or `{{SKILL:review}} <planfile>` and end the workflow. If
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
9. Obtain approval. The approval question contains the explicit goal query (option "Autonomous via /goal"); handle it per "Explicit goal query for autonomous runs": if "Autonomous via /goal" is chosen, emit the `/goal` string for phases 2–6; the option is omitted when the workflow was delegated non-interactively.

```ask
header: Approval
question: Refactoring plan approved?
options:
  - label: Yes
    description: Approval granted, workflow continues gated
  - label: Autonomous via /goal
    description: Remaining phases autonomous under the native /goal — the skill emits the /goal string to paste (omitted for non-interactive delegation)
  - label: Adjust
    description: Enter feedback as free text
```

### Phase 2: Baseline

First, per "Delivery and worktree integration", determine the effective delivery/worktree mode
and its verified execution-location receipt, then run any applicable owned setup before the
baseline is collected. Pass that receipt into phases 2–5 (baseline, refactoring and
post-validation); each write-capable boundary revalidates it and roots every operation there.

Start in parallel:

1. `{{AGENT:code-validator}}`
   - TypeScript errors
   - lint errors
   - build status
2. `{{AGENT:test-writer}}`
   - run all existing tests and document the result
   - do not write new tests in this phase

Document the baseline for the later comparison.

```include
skill-discovery
```

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
   `{{AGENT:generic-product-reviewer}}` for degraded product buckets.
2. Aggregate findings:
   - Critical: fix before completion
   - Important: should be fixed
   - Note: optional
3. Present the review results in detail, including status per finding.
4. Document each finding in a structured way so open or unimplemented findings can be written as a review report:
   - Title
   - Severity (Critical / Important / Note)
   - Complexity (Low / Medium / High)
   - Area
   - File + line
   - Problem
   - Recommendation
   - Action (`{{SKILL:fix}}`, `{{SKILL:refactor}}`, `{{SKILL:build}}` or `{{SKILL:docs}}`)
   - Prompt suggestion
   - Status (Fixed / Open / Not implemented)
   - rationale for non-implementation or ADR reference as slug, if present, e.g. `(ADR: <slug>)`
5. Never create an ADR in this workflow and do not ask for one either. Deliberately unimplemented findings are documented exclusively in the review report. The developer decides on later implementation or on an ADR for a deliberate non-implementation when going through the findings file, typically via {{SKILL:apply-review}}.
6. If after review there remain findings with status `Open` or `Not implemented`:
   - write them into a new file under `.effective-flow/review/` per "Open review-finding reports"
   - if a plan file exists, use the file name `review-report-YYYY-MM-DD-plan-<slug>.md`
   - name the generated report path in the completion summary
7. If this phase implemented a finding from an existing review-report file in `.effective-flow/review/`:
   - add a short implementation note as the last entry directly in the affected finding
   - begin the note with `✅` and name at least the date and workflow

### Phase 5: Post-validation

Start in parallel:

1. `{{AGENT:code-validator}}`
2. `{{AGENT:test-writer}}`
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
   - back to Phase 3, then phases 5 and 6 again – per "Goal-driven completion control": bound the internal correction rounds and escalate to the user if the baseline is still not reached afterwards, instead of repeating indefinitely
3. If no regressions:
   - delete the wisdom file
   - if delivery or worktree execution was active: perform the handback per "Delivery and worktree integration" (for a guided plan file including the plan status switch to `Umgesetzt`/`Implemented` and archive move to `<plan.dir>/archive/` at the delivery point, commit the changes, ownership-safe worktree cleanup if applicable, completion action `pr`/`merge`/`branch`, defer the checkout). If the workflow exceptionally runs in-place without delivery, it performs the same status switch and archive move directly in the working tree.
   - summarize what was refactored; for an active delivery/worktree mode, additionally name the delivery branch, the final checkout state and the result of the completion action (PR URL, merge or retained branch)
   - confirm that the behavior stayed unchanged

```include
pre-commit-gate
```

```include
commit-message-rules
```

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
