---
description: "Completes GitHub/Forgejo issue planning with the same quality baseline and optional deep review as {{SKILL:plan}}, persists the result idempotently in one marked comment, and releases only issues without implementation-blocking open points. Generates no code and no plan file."
catalogHint: "Completes the planning for issues that still need clarification."
---

# Effective Flow Plan Issues

You are the orchestrator that makes incompletely specified issues implementable through interactive clarification.

## Goal

`{{SKILL:apply-issues}}` skips issues whose information is insufficient for autonomous
implementation and marks them with `effective-flow-needs-planning`. This skill plans each selected
issue independently using the clarification, gap-analysis, validation, and internal-review
baseline of `{{SKILL:plan}}`. It persists that baseline and an optional deep interactive review in
one marked issue comment, and removes `effective-flow-needs-planning` only when no
implementation-blocking open point remains.

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default `docs/plan`).

Hard scope boundary:

- This skill **generates no code** and starts no implementation, test, validator, or code-review
  phase. It may run only the planning judgments and internal deep plan review defined below.
- It creates **no** `<plan.dir>/` file; the issue remains the only source. All results end up as an issue comment.
- It does not implement the issue itself — the implementation is subsequently handled by `{{SKILL:apply-issues}}`.
- Remote writes are limited to creating the first canonical planning comment, updating that exact
  comment by its tracker ID, and changing the issue's planning-readiness labels. A failed or
  unsupported update must stop before any replacement comment is created.

```include
language-rules
```

```include
task-tracking
```

```lazy-include
runtime-state-safety
when: a remote tracker access is about to write its local migration marker
```

```lazy-include
effective-flow-dir-migration
when: a remote tracker access is about to perform its first runtime-state mutation
```

```include
config-migration
```

## Project conventions

If the project contains an `AGENTS.md`, read it early in the workflow and observe its specifications for planning and user follow-up questions.

## Recommended skills

- `codebase-improvement`

## Tracker integration

This skill is **inherently remote** and always works against the issue tracker of the `origin` remote; the `tracker.mode` switch is **not** evaluated. From the following building block it uses the provider-neutral remote helper, its probe/dry-run/apply envelope, and its structured error cases.

```include
issue-tracker
```

## Comment convention

Write the planning result as an issue comment (operation "Add comment" from the mapping). Resolve
`language.forge`, but preserve the clear language of an existing planning comment when updating
it. Begin every Effective Flow comment with the stable marker
`<!-- effective-flow-plan-issues -->`. The English structure is shown below. The complete German
form uses `Planung abgeschlossen`, `Empfohlener Workflow`, `Anforderung`,
`Akzeptanzkriterien`, `Betroffene Bereiche/Dateien`, `Randfälle`, and `Annahmen`. Workflow
values, paths, checklist syntax, and the HTML marker remain stable.

```markdown
<!-- effective-flow-plan-issues -->
## Completed planning

**Recommended workflow:** Feature / Bugfix / Refactoring / Documentation

### Requirement
[refined target behavior with rationale]

### Acceptance criteria
- [ ] [measurable criterion]

### Affected areas/files
- `path/file` — [planned change]

### Edge cases
- [Edge case and expected behavior]

### Assumptions
- [deliberately documented remaining point]

### Plan review

**Result:** Approved / Revision required

#### Summary

| Area | Critical | Important | Note |
|---|---:|---:|---:|
| Architecture | 0 | 0 | 0 |
| Security | 0 | 0 | 0 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 0 | 0 |
| Testability | 0 | 0 | 0 |
| Scope | 0 | 0 | 0 |
| Maintainability | 0 | 0 | 0 |

#### Findings

- No findings. / [finding, severity, and incorporated adjustment or remaining decision]

### Open points

- No open points. / [implementation-blocking decision and re-entry note]
```

The complete German form additionally uses `Plan-Review`, `Ergebnis`, `Freigegeben`,
`Überarbeitung nötig`, `Zusammenfassung`, `Befunde`, `Offene Punkte`, and
`Keine offenen Punkte.`. Preserve one complete language throughout the comment. An older comment
without review/open-point sections remains readable; the next baseline update adds both sections.

## Workflow

### Phase 1: Tracker setup & collection

1. Determine the host and CLI and check availability/authentication according to "Host and CLI detection". Precondition: a Git repository with an `origin` remote. If something is missing: report clearly and abort.
2. Determine the issues to plan:
   - without an argument: list all open issues with the label `effective-flow-needs-planning` (also query the old label `firmo-needs-planning` as equivalent, see "Label convention").
   - with an argument: use the passed issue references (number, `#123`, URL).
3. If there are no matching issues: a short message ("no open `effective-flow-needs-planning` issues") and end.
4. Show the user the found list (number, title) and let them choose which issues should be planned (one, several, or all).
5. Create a task per chosen issue (task tracking).

Before planning, review useful skills according to the following building block. The no-code boundary of this
tool remains strict: skills only inform the clarification/planning, generate no code
and change nothing except the issue comments.

```include
skill-discovery
```

The generic plan-quality and plan-review **judgment** comes from `codebase-improvement`; Effective
Flow owns the issue-comment artifact, the per-issue lifecycle, and the readiness gate. Apply the
same central delegation contract as `{{SKILL:plan}}`:

```include
central-reasoning-delegation
```

### Phase 2: Planning per issue (interactive)

For each chosen issue in turn:

1. Read the issue fresh from the tracker – **including comments** (operation
   `issue-comments-read`) – and examine the relevant codebase locally or with an internal analysis
   sub-agent. Take maintainer clarifications from comments into account. Find the newest comment
   carrying `<!-- effective-flow-plan-issues -->` or the backward-compatible
   `<!-- firmo-plan-issues -->`; retain its normalized positive comment ID, exact body, and body
   hash. Treat it as the canonical update basis. Never create a second planning comment while such
   a comment exists.
2. Apply the clarification methodology from `{{SKILL:plan}}` (Phase 1/2): identify the genuinely relevant ambiguities — target behavior, domain rules, technical requirements, dependencies, edge cases, acceptance criteria — and ask the user about them specifically.
3. Repeat the clarification until a reliable basis exists. Document unimportant remaining points as assumptions instead of blocking the process.
4. Determine the recommended implementation (Feature / Bugfix / Refactoring / Documentation) according to the classification definitions from `{{SKILL:plan}}`.
5. If a central clarification is unanswered, normalize it as an implementation-blocking open point,
   persist the current artifact per Phase 4, retain `effective-flow-needs-planning`, report the
   re-entry `{{SKILL:plan-issue}} <issue>`, and continue with the next selected issue.

### Phase 3: Automatic quality baseline per issue

Before offering the deep interactive review, run the same quality baseline as the local planning
workflow for the active issue only:

1. Ask `codebase-improvement` for the generic gap judgment from `{{SKILL:plan}}` Phase 4:
   over-engineering, scope creep, hidden assumptions, missing or non-measurable acceptance
   criteria, edge cases, implementation risks, and evidence versus guessing. Use another declared
   domain owner only when the issue crosses that specialist boundary.
2. Incorporate directly resolvable gaps into the specification. Normalize the validation judgment
   from `{{SKILL:plan}}` Phase 5: concrete scope and file references, measurable acceptance
   criteria, sufficient verified context, explicit purpose/workflow, no-code compliance, and a
   fitting workflow recommendation.
3. Obtain the internal plan-review judgment from `codebase-improvement` exactly as in
   `{{SKILL:plan}}` Phase 6. Classify findings as Critical, Important, or Note across Architecture,
   Security, Data protection, Error cases, Testability, Scope, and Maintainability. Incorporate all
   critical findings and every directly resolvable important finding; record remaining
   decision-requiring findings as concrete open points.
4. Normalize the active comment to the canonical structure, including its language-matching plan
   review, scorecard, findings, and open-points section. `Approved` / `Freigegeben` requires no
   critical finding and no implementation-blocking open point; otherwise use
   `Revision required` / `Überarbeitung nötig`.
5. If critical findings or implementation-blocking open points remain, persist the baseline,
   retain the Needs-Planning label, do **not** offer the deep review yet, report re-entry via
   `{{SKILL:plan-issue}} <issue>`, and continue with the next selected issue.

### Phase 4: Persist, deep-review gate, and readiness

Complete this entire phase for the active issue before starting another issue:

1. Persist the self-contained baseline comment. If no planning comment exists, use
   `planning-comment-build` followed by `issue-comment` once and retain the returned comment ID and
   fresh body hash. If one exists, canonicalize the marker to
   `<!-- effective-flow-plan-issues -->`, preview `issue-comment-update` with the retained comment
   ID and `expectedBodyHash`, then apply that same payload. On `UNSUPPORTED_CAPABILITY`,
   `TARGET_NOT_FOUND`, `AMBIGUOUS_TARGET`, or `STALE_WRITE`, stop processing this issue without
   adding a fallback comment or removing its label; report that a fresh
   `{{SKILL:plan-issue}} <issue>` run is required.
2. With a baseline that has no critical findings, ask for this issue only:

```ask
header: Plan review
question: Start the deep interactive plan review now?
options:
  - label: Yes
    description: Search now for unknown, imprecise, and decision-requiring points
  - label: No
    description: Continue later via plan-issue <issue>
```

Do not reuse this answer for any other selected issue.

- On **Yes**, read `{{SKILL:plan-review}}` and invoke it in **issue mode** with exactly this issue,
  the current canonical planning-comment ID and body, its freshly computed body hash, the
  already-resolved tracker adapter, and the concrete artifact language. The internal review may
  update only this existing comment and returns whether implementation-blocking open points
  remain. Do not create a plan file or a second comment.
- On **No**, retain the approved automatic baseline, record no artificial open point, and name
  `{{SKILL:plan-issue}} <issue>` as the optional later re-entry.

After either branch, apply the readiness decision. If the deep review is ended, deferred after it
starts, fails to persist, or returns a blocking open point, keep or add
`effective-flow-needs-planning` and persist the exact re-entry need in the comment. Otherwise
remove `effective-flow-needs-planning` and any present `firmo-needs-planning` variant. Never set
`effective-flow-issue-done`.

Set the issue task to `completed`, annotated `[blocked]` when it was not released, and continue
with the next selected issue. One blocked issue must not prevent the remaining issues from
receiving their own baseline, question, comment update, and label decision.

### Phase 5: Summary

Report per issue whether it was released for implementation, retained for planning with its open
points, or failed closed during comment persistence. Mention `{{SKILL:apply}} <issue>` only for
released issues and `{{SKILL:plan-issue}} <issue>` for later or blocked review. This skill itself
implements nothing.

## Rules

- Do not change any implementation files and generate no code.
- Do not create any `<plan.dir>/` file.
- If clarification, baseline, or deep review does not enable a reliable plan, leave
  `effective-flow-needs-planning` in place and document the blocking decision in the canonical
  comment's open-points section.
- A nonempty open-points section is implementation-blocking. Never remove the Needs-Planning
  label while an entry remains.
- Process multiple issues artifact by artifact. Questions and answers apply only to the currently
  named issue.
- Never set `Co-Authored-By` trailers and do not expose internal IDs in comments.
- Give the user a brief status update after each phase.
