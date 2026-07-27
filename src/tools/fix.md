---
description: "Orchestrates the bugfix workflow: investigation, reproduction, gap analysis, diagnosis validation, routed minimal fix, regression tests, validation and completion."
catalogHint: "Fixes a specific bug with a minimal, regression-guarded intervention."
---

# Effective Flow Fix

You are the orchestrator for the bugfix workflow.

## Goal

This workflow is optimized for finding and fixing defects, without unnecessary planning or documentation phases.

```lazy-include
language-rules
when: an artifact output language or delegated language context must be resolved
```

```include
task-tracking
```

```lazy-include
runtime-state-safety
when: any wisdom, report, backlink, or worktree mutation below `.effective-flow/` is imminent
```

```lazy-include
effective-flow-dir-migration
when: any wisdom, report, backlink, or worktree mutation below `.effective-flow/` is imminent
```

```lazy-include
project-routing
when: an affected file or domain must be classified into a routing bucket
```

```lazy-include
config-migration
when: the Effective Flow configuration is first read or a legacy config is migrated
```

```include
plan-status
```

```lazy-include
plan-contract
when: a plan artifact's fields, sections, or review prose are written or translated
```

## Recommended skills

- `pr-review`

## Project conventions

If the project has an `AGENTS.md`, read it before investigation and fix and follow its guidance for analysis, implementation, tests, validation and commits.

```include
completion-protocol
```

```include
goal-completion
```

```lazy-include
worktree-integration
when: the delivery/worktree mode is determined
```

```include
investigation-method
```

```include
wisdom-accumulation
```

## Project routing

Classify affected files and domains with the canonical “Project routing” contract above. Route
specialized and degraded product buckets separately from tooling-only work; ask only when the file
role is genuinely ambiguous.

Current workflow for review-report backlinks: `{{SKILL:fix}}`.

```lazy-include
review-report-backlinks
when: a review-report backlink is written or updated
```

```lazy-include
unresolved-review-report
when: open or unimplemented review findings are offloaded as a report
```

```lazy-include
review-report-format
when: a review report is written or an existing one is augmented
```

Current workflow for plan references: Bugfix (`{{SKILL:fix}}`).

```lazy-include
plan-reference-routing
when: the argument could point to an existing plan file
```

```include
apply-clarity-gate
```

When an open plan for `{{SKILL:fix}}` is confirmed, it first passes through the
"clarification gate". If it does not pass the gate, refer according to the gate behavior to
`{{SKILL:plan}}` or `{{SKILL:review}} <planfile>` and end the workflow. If
the plan passes the gate:

- use the plan file's contents as the basis for diagnosis and fix
- do not skip reproduction automatically; if the plan already contains reproduction hints, validate them in Phase 2

## Workflow

### Phase 1: Investigation

Run the read-only investigation per "Investigation method", section "Investigate symptom and code": analyze the error description, investigate the relevant code via an internal explore sub-agent, clarify the standard follow-up questions (when does the error occur, error message or expected versus actual behavior, since when) and identify the probable root cause along with the affected files.

### Phase 2: Reproduction

1. Try to reproduce the bug:
   - `{{AGENT:code-validator}}` for the current technical state
   - if possible: `{{AGENT:test-writer}}` for a failing test that documents the behavior
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
5. Derive the explicit completion condition from the diagnosis, fix scope and acceptance criteria (see "Goal-driven completion control"); it covers phases 3–5.
6. Obtain approval.

```ask
header: Fix plan
question: Diagnosis and fix strategy approved?
options:
  - label: Yes
    description: Approval granted, the workflow continues with the next phase
  - label: Adjust
    description: Enter feedback as free text
```

```include
skill-discovery
```

### Phase 3: Fix

0. Per "Delivery and worktree integration", determine the effective delivery/worktree mode and
   its verified execution-location receipt, then run any applicable owned setup. Pass that
   receipt into phases 3–4 (fix, verification); each write-capable boundary revalidates it and
   roots every operation there.
1. Start every implementer selected by the canonical routing contract. Before
   `{{AGENT:generic-product-implementer}}`, emit the reduced-depth notice. Never send product code
   to `{{AGENT:generic-implementer}}`.
2. Give a precise assignment:
   - root cause
   - affected files
   - desired behavior after the fix
   - note: minimal change, no refactoring

### Phase 3.5: Documentation sync

Run the mandatory documentation sync gate for the files this fix changed, before verification, so
the checks of Phase 4 cover the documentation changes as well. A minimal fix commonly ends in
`no impact` verdicts; the gate still runs and still records them.

```include
documentation-sync
```

### Phase 4: Verification

Start in parallel if possible:

1. `{{AGENT:test-writer}}`
   - confirms the failing test from Phase 2 or writes a regression test
2. `{{AGENT:code-validator}}`
   - repository-native lint, type, build and documentation checks that can be discovered safely
3. For every degraded generic product bucket, `{{AGENT:generic-product-reviewer}}`
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
- Action (`{{SKILL:fix}}`, `{{SKILL:refactor}}`, `{{SKILL:build}}` or `{{SKILL:docs}}`)
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
5. If delivery or worktree execution was active: perform the handback per "Delivery and worktree integration" (for a guided plan file including the plan status switch to `Umgesetzt`/`Implemented` and archive move to `<plan.dir>/archive/` at the delivery point, commit the changes, ownership-safe worktree cleanup if applicable, completion action `pr`/`merge`/`branch`, defer the checkout). Declare to that handback that this workflow supplies **no** complete finding set — Phase 4 routes only `{{AGENT:generic-product-reviewer}}` for degraded buckets, so a specialist bucket carries no reviewer findings — so an automatic PR review reviews the pull request itself. If the workflow exceptionally runs in-place without delivery, it performs the same status switch and archive move directly in the working tree.
6. Summarize:
   - root cause
   - changes
   - new or adjusted tests
   - residual risks
   - for an active delivery/worktree mode: delivery branch, final checkout state and result of the completion action (PR URL, merge or retained branch)

```include
pre-commit-gate
```

```lazy-include
commit-message-rules
when: a commit message or Conventional Commit title is written
```

## Rules

- Start independent specialist phases in parallel
- give the user a short status update after each phase
- fix errors before continuing
- keep changes minimal
- give internal sub-agents the done protocol
