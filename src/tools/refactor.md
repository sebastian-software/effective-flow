---
description: "Orchestrates the refactoring workflow: analysis, gap analysis, plan validation, baseline, routed refactoring, review, post-validation and before/after comparison."
catalogHint: "Improves structure or readability without changing behavior."
---

# Effective Flow Refactor

You are the orchestrator for the refactoring workflow.

## Goal

Code is restructured without changing existing behavior, with before/after validation as a safety net.

```lazy-include
language-rules
when: an artifact output language or delegated language context must be resolved
```

```include
chat-language
```

```include
task-tracking
```

```include
delegation-mandate
```

```lazy-include
plan-archival
when: the delivery point of the handback is reached, or in-place execution archives a plan file
```

```lazy-include
plan-pr-continuation
when: the source is a plan file, hidden mode is off, and either "Shared preconditions" step 2 of `worktree-integration` has resolved the base or "Determine mode" selected in-place without delivery, before any archival
```

```lazy-include
runtime-state-safety
when: any wisdom, report, memory, backlink, runtime migration, or worktree mutation is imminent
```

```lazy-include
effective-flow-dir-migration
when: any wisdom, report, memory, backlink, runtime migration, or worktree mutation is imminent
```

```lazy-include
session-title
when: the run's subject is fixed and whether a session title is due must be decided
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

- `effective-delivery`

```include
audit-reasoning-delegation
```

`refactor.md` carries more inline reasoning than `{{SKILL:review}}`; the delegable part is
the **gap analysis and plan validation** in Phase 1 (root cause, complexity/over-engineering,
scope, risk, refactor-plan quality). The cross-language/runtime migration branch stays with the
same owner, whose porting guidance covers it. Baseline, behavior invariance, reports and delivery
remain Effective Flow contract.

## Project conventions

If the project has an `AGENTS.md`, read it before analysis and refactoring and follow its guidance for structure, boundaries, tests, review and commits.

```include
completion-protocol
```

```include
goal-completion
```

```lazy-include
worktree-integration
when: the delivery/worktree mode is determined (Phase 2, first step)
```

```lazy-include
diff-baseline
when: the diff baseline is captured at the end of Phase 2, or later rendered or discarded
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

```ask
header: Approval
question: Refactoring plan approved?
options:
  - label: Yes
    description: Approval granted, the workflow continues with Phase 2
  - label: Adjust
    description: Enter feedback as free text
```

```include
worktree-record-obligation
```

### Phase 2: Baseline

First, read the deferred `worktree-integration` fragment now – a mandatory load before any
worktree is created – then, per "Delivery and worktree integration", determine the effective
delivery/worktree mode and its verified execution-location receipt, then run any applicable owned setup before the
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

Document the baseline for the later comparison. Mark each check the approved acceptance criteria
require for that comparison. A required check that cannot be established is a controlled stop
before Phase 3: report it, reserve no pilot record, and move an owned worktree to `aborted`. A
reproducible pre-existing failure of one blocks nothing while its exact result stays comparable,
and unavailable optional evidence is recorded as unavailable. Then capture the diff baseline per
"Diff baseline", so files the baseline checks generate never count as the refactoring's change.

```include
skill-discovery
```

### Phase 3: Refactoring

```lazy-include
execution-profiles
when: Phase 2 is complete and the initial packets are about to be classified, or a Fast fallback is handled
```

```lazy-include
pilot-measurement-workflow
when: Phase 2 is complete and packets are about to be classified, and at every exit once a pilot record is reserved
```

**Profile seam.** Once Phase 2 is complete, every initial packet follows "Initial implementation
phase" of the loaded `execution-profiles` fragment: its per-packet state, preflight, delegation,
requirements check, and Fast→Quality transition, with `refactor` as the record's `workflow`. Bind
each packet to the Phase 2 checks and results, the exact
invariance expectation, approved paths, dependencies, and comparison commands. Unavailable optional
evidence or a reproducible pre-existing failure fails the `unknown-evidence` row. A Fast→Quality
handoff adds the baseline evidence. `fastAttemptConsumed` survives every later Phase 3 entry, and
eligibility is never evaluated again.

1. Start the appropriate implementer skill. The Quality selector is the default; the Fast reference
   serves only the first attempted spawn of a packet whose envelope selects `fast`, and
   `fastAttemptConsumed` is set immediately before that call:
   - Frontend: `Use the {{AGENT:ui-implementer}} skill for this phase.` Fast: {{AGENT_PROFILE:ui-implementer:fast}}.
   - Backend/CLI: `Use the {{AGENT:nodejs-implementer}} skill for this phase.` Fast: {{AGENT_PROFILE:nodejs-implementer:fast}}.
   - Rust: `Use the {{AGENT:rust-implementer}} skill for this phase.` Fast: {{AGENT_PROFILE:rust-implementer:fast}}.
   - Other clearly identified product code: emit the contract’s reduced-depth notice, then use `Use the {{AGENT:generic-product-implementer}} skill for this phase.` Fast: {{AGENT_PROFILE:generic-product-implementer:fast}}.
   - Tooling/CI/configuration/repository metadata: `Use the {{AGENT:generic-implementer}} skill for this phase.` Fast: {{AGENT_PROFILE:generic-implementer:fast}}.
   - Use every bucket selected by project routing; preserve specialist buckets in mixed scopes.
   - Never demote unsupported product code to the tooling-only generic implementer.
2. Assignment, repeated with the Phase 2 baseline evidence in every implementer handoff of Phases
   3, 4 and 6, incorporation and regression correction included:
   - change only structure
   - no new behavior
   - no new features
   - no unplanned bug fixes
3. A required behavior or public-contract change, migration, concurrency or unsafe-code change, or
   open architecture decision lies outside the refactoring, and Quality does not authorize it: stop
   for replanning as a controlled stop, finalize a reserved pilot record per "Pilot record", and ask
   whether to capture it as a future-work issue, or as a new plan without an issue tracker;
   declining creates no artifact.

### Phase 3.5: Documentation sync

Render the diff baseline, then run the mandatory documentation sync gate for its path list per "Diff baseline" before review and
post-validation, so both cover the documentation changes. Documentation must describe the
restructured code, never a behavior change — a refactoring that alters no public surface commonly
ends in `no impact` verdicts, and the gate records them instead of skipping.

```include
documentation-sync
```

### Phase 4: Review

1. Render the diff baseline and hand the path list per "Diff baseline" to every reviewer project
   routing selects, including `{{AGENT:generic-product-reviewer}}` for degraded product buckets.
2. Aggregate findings and make exactly one automatic incorporation pass for new current-scope
   items through the routed Quality implementer. Render again and run the affected review checks once after the pass, then classify the residual batch via
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
   - Action (`{{SKILL:fix}}`, `{{SKILL:refactor}}`, `{{SKILL:build}}` or `{{SKILL:docs}}`)
   - Prompt suggestion
   - Status in the complete report language (English: Fixed / Open / Not implemented; German:
     Behoben / Offen / Nicht umgesetzt)
   - rationale for non-implementation or ADR reference as slug, if present, e.g. `(ADR: <slug>)`
   - the complete stable admitted record from “Durable derived-work gate”
5. Never create an ADR in this workflow and do not ask for one either. Deliberately unimplemented findings are documented exclusively in the review report. The developer decides on later implementation or on an ADR for a deliberate non-implementation when going through the findings file, typically via {{SKILL:apply-review}}.
6. Do not create an open-findings report or append an implementation backlink in this phase.
   Both are external finalization state and are persisted only after Phase 6 succeeds.

### Phase 5: Post-validation

Render the diff baseline, then start in parallel:

1. `{{AGENT:code-validator}}` with the path list per "Diff baseline"
2. `{{AGENT:test-writer}}`
   - runs all existing tests again
   - writes no new tests

### Phase 6: Before/after comparison and completion

**Pilot record.** A pilot record reserved in Phase 3 is finalized exactly once on every terminal
exit – success, the replanning stop, an abort, an exhausted regression loop, an unrepeatable
required check, an incident that ends the run, or a missing outcome – per the loaded `pilot-measurement-workflow` fragment, independently of the
external review state below. Its `validation` comes from the last Phase 5 run alone: Phase 2 only
proves the comparator available, an unchanged pre-existing failure stays `failed`, and a required
check Phase 5 could not repeat counts as unsatisfied. `review` comes from the latest Phase 4 run,
and `completionStatus` is `completed` only after this phase's comparison proves no regression,
`aborted` after the replanning stop or a user abort, and `failed` after an incident that ends the
run, a missing outcome, an exhausted regression loop, or a required check Phase 5 could not
repeat. An incident the run survives leaves the status to the comparison.

1. Compare the results from Phase 5 with the baseline:
   - tests
   - TypeScript
   - lint
   - build
   - an exactly unchanged pre-existing failure is no regression but is reported as unsuccessful,
     never as success
2. If a required check Phase 5 could not repeat, completion is blocked: report it, finalize no
   external review state, finalize a reserved pilot record per "Pilot record", move an owned
   worktree to `failed` as a validation error, and stop.
3. If regressions are found:
   - inform the user
   - back to Phase 3, then phases 4, 5 and 6 again – per "Goal-driven completion control": bound the internal correction rounds and escalate to the user if the baseline is still not reached afterwards, instead of repeating indefinitely
   - each Phase 3 pass of this loop is a new correction through the routed Quality implementer from the retained diff and the observed regression delta, inside the approved scope
4. If no regressions:
   - finalize external review state from the latest provisional review only:
     - use the session ID as the stable finalization marker for this workflow run; in a generated report, include it after the reviewer or phase in the existing `Source review` field, for example `Phase 4 (run <SESSION_ID>)`
     - if admitted findings with a canonical open or unimplemented status in the complete report language (`Open` / `Not implemented` or `Offen` / `Nicht umgesetzt`) remain, before applying the collision rule, search `.effective-flow/review/` for a report whose `Source workflow` is `{{SKILL:refactor}}` and whose `Source review` contains this run's finalization marker
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
   - delete the wisdom file and discard the diff baseline
   - if delivery or worktree execution was active: perform the handback per "Delivery and worktree integration" (for a guided plan file including the plan status switch to `Umgesetzt`/`Implemented` and archive move to `<plan.dir>/archive/` at the delivery point, commit the changes, ownership-safe worktree cleanup if applicable, completion action `pr`/`merge`/`branch`, defer the checkout). Hand only the **admitted residual** finding set of the latest Phase-4 review to that handback; never pass `current-scope`, `closed`, or unresolved `uncertain` candidates. If the workflow exceptionally runs in-place without delivery, it performs the same status switch and archive move directly in the working tree.
   - Run the worktree-record exit self-check.
   - finalize a reserved pilot record per "Pilot record" above
   - summarize what was refactored and state the worktree-record exit self-check result; for an active delivery/worktree mode, additionally name the delivery branch, the final checkout state and the result of the completion action (PR URL, merge or retained branch)
   - confirm that the behavior stayed unchanged
   - emit the next-step block per `next-steps` as the last element of the report

```include
pre-commit-gate
```

```include
commit-message-rules
```

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
- every implementation pass after a packet's initial Phase 3 attempt – Phase 4 incorporation, Phase 6 regression correction, retry – is Quality-only through the routed Quality implementer
