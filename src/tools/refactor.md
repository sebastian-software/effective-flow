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
delegation-mandate
```

```lazy-include
runtime-state-safety
when: any wisdom, report, memory, backlink, runtime migration, or worktree mutation is imminent, or a session rename request is about to be written
```

```lazy-include
effective-flow-dir-migration
when: any wisdom, report, memory, backlink, runtime migration, or worktree mutation is imminent, or a session rename request is about to be written
```

```lazy-include
session-rename
when: the run's subject is fixed and a session title is about to be applied or emitted
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

```lazy-include
plan-contract
when: a plan artifact's fields, sections, or review prose are written or translated
```

## Recommended skills

- `codebase-improvement`
- `port-codebases`
- `pr-review`

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

```lazy-include
review-report-format
when: a review report is written or an existing one is augmented
```

```lazy-include
next-steps
when: the run reaches its completion report
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
8. Derive the explicit completion condition from the measurable acceptance criteria (see "Goal-driven completion control"); it covers phases 2–6. The completion condition includes behavior invariance: the baseline collected in Phase 2 must remain unchanged.
9. Obtain approval.

```ask
header: Approval
question: Refactoring plan approved?
options:
  - label: Yes
    description: Approval granted, the workflow continues with Phase 2
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

### Phase 3.5: Documentation sync

Run the mandatory documentation sync gate for the files this refactoring changed, before review and
post-validation, so both cover the documentation changes. Documentation must describe the
restructured code, never a behavior change — a refactoring that alters no public surface commonly
ends in `no impact` verdicts, and the gate records them instead of skipping.

```include
documentation-sync
```

### Phase 4: Review

1. Start every reviewer selected by project routing for the changed files, including
   `{{AGENT:generic-product-reviewer}}` for degraded product buckets.
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
   - Action (`{{SKILL:fix}}`, `{{SKILL:refactor}}`, `{{SKILL:build}}` or `{{SKILL:docs}}`)
   - Prompt suggestion
   - Status in the complete report language (English: Fixed / Open / Not implemented; German:
     Behoben / Offen / Nicht umgesetzt)
   - rationale for non-implementation or ADR reference as slug, if present, e.g. `(ADR: <slug>)`
5. Never create an ADR in this workflow and do not ask for one either. Deliberately unimplemented findings are documented exclusively in the review report. The developer decides on later implementation or on an ADR for a deliberate non-implementation when going through the findings file, typically via {{SKILL:apply-review}}.
6. Do not create an open-findings report or append an implementation backlink in this phase.
   Both are external finalization state and are persisted only after Phase 6 succeeds.

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
   - back to Phase 3, then phases 4, 5 and 6 again – per "Goal-driven completion control": bound the internal correction rounds and escalate to the user if the baseline is still not reached afterwards, instead of repeating indefinitely
3. If no regressions:
   - finalize external review state from the latest provisional review only:
     - use the session ID as the stable finalization marker for this workflow run; in a generated report, include it after the reviewer or phase in the existing `Source review` field, for example `Phase 4 (run <SESSION_ID>)`
     - if findings with a canonical open or unimplemented status in the complete report language (`Open` / `Not implemented` or `Offen` / `Nicht umgesetzt`) remain, before applying the collision rule, search `.effective-flow/review/` for a report whose `Source workflow` is `{{SKILL:refactor}}` and whose `Source review` contains this run's finalization marker
     - if exactly one matching report exists, reuse that report and its path; complete or validate its contents and memory update as needed, and do not create a collision-suffixed report
     - if more than one matching report exists, stop before writing and escalate the ambiguity to the user
     - if no matching report exists, write the findings into at most one new file under `.effective-flow/review/` per "Open review-finding reports"
     - if no findings with those canonical English or German open/unimplemented statuses remain,
       do not create a report
     - if a plan file exists, use the file name `review-report-YYYY-MM-DD-plan-<slug>.md`
     - name any generated report path in the completion summary
   - if this refactoring implemented a finding from an existing review-report file in `.effective-flow/review/`:
     - add a short implementation note as the last entry directly in the affected finding
     - begin the note with `✅`, name at least the date and workflow, and include the same finalization marker, for example `✅ Implemented on YYYY-MM-DD via {{SKILL:refactor}} (run <SESSION_ID>)`
     - before appending, read the finding again and check for an implementation note with this exact finalization marker; if one exists, do not append another note
   - delete the wisdom file
   - if delivery or worktree execution was active: perform the handback per "Delivery and worktree integration" (for a guided plan file including the plan status switch to `Umgesetzt`/`Implemented` and archive move to `<plan.dir>/archive/` at the delivery point, commit the changes, ownership-safe worktree cleanup if applicable, completion action `pr`/`merge`/`branch`, defer the checkout). Hand the **residual** finding set of the latest Phase-4 review to that handback — the findings that survived this run's correction rounds, not the full review history — so an automatic PR review publishes them instead of reviewing the pull request a second time. If the workflow exceptionally runs in-place without delivery, it performs the same status switch and archive move directly in the working tree.
   - summarize what was refactored; for an active delivery/worktree mode, additionally name the delivery branch, the final checkout state and the result of the completion action (PR URL, merge or retained branch)
   - confirm that the behavior stayed unchanged
   - emit the next-step block per `next-steps` as the last element of the report

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
- no new features or bug fixes during the refactoring
