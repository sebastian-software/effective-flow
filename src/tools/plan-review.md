---
description: "Internal instruction for the deep interactive plan review: checks plan files for logic, data security, feasibility, UI/UX, and open points, and maintains decisions directly in the plan."
---

# Effective Flow Plan Review

You are the orchestrator for the deep interactive review of existing plan files.

## Goal

This internal skill checks an existing plan file under `<plan.dir>/` or
`<plan.dir>/archive/` for what is still unknown, imprecise wording, logical contradictions,
implementation risks, and missing decisions. It walks through decision-requiring points one
by one with the user, incorporates the decisions made directly into the plan, and keeps the
open-points section up to date.

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default
`docs/plan`).

```include
language-rules
```

```include
task-tracking
```

```include
plan-status
```

## Recommended skills

- `codebase-improvement`

## Hard scope boundary

- Only analysis, user follow-up questions, and changes to the
  referenced plan file under `<plan.dir>/` or `<plan.dir>/archive/` are allowed.
- Changes to source code, tests, configuration, build files,
  README files, ADRs, review reports, and other project files are forbidden.
- Do not start any implementer, test, validator, code-review, or
  documentation specialists.
- Do not create any commits.
- The review is a plan review, not a code review. It may read code context
  but must not propose code changes that go beyond planning details.

## Input

Expect exactly one plan reference under `<plan.dir>/` or `<plan.dir>/archive/`, for example:

- `<plan.dir>/2024-06-01-interaktive-plan-review-iteration.md`
- `<plan.dir>/archive/2024-06-01-interaktive-plan-review-iteration.md`
- `2024-06-01-interaktive-plan-review-iteration.md`
- `interaktive-plan-review-iteration` (title slug)
- `0066` (legacy number of a migrated old plan, resolved primarily via the H1)

If the reference is missing, ambiguous, or does not point to a plan file, ask
for the specific plan file. Never heuristically pick the newest plan.

## Workflow

Before the analysis, review useful skills according to the following building block. The boundary
of this tool remains strict: skills only inform the review judgment, change nothing except the
referenced plan file, and generate no code.

```include
skill-discovery
```

The generic plan-review **judgment** of this tool (Phase 2) comes from the central skill
`codebase-improvement`; Effective Flow remains the plan-artifact orchestrator (interactive loop,
edit-only, status and open-points normalization). The following building block applies:

```include
central-reasoning-delegation
```

### Phase 1: Load and normalize the plan

1. Resolve the plan reference to exactly one file under `<plan.dir>/` or
   `<plan.dir>/archive/`. Search both locations and determine uniqueness across their combined
   candidates; a missing archive contributes no candidates. Support a full path, date-slug
   file name, title slug, or four-digit legacy number. Resolve a legacy number primarily via
   its H1 `# NNNN: …`; use the file name segment only as the existing secondary signal.
2. Read the plan file fresh from the file system.
3. Determine and preserve the complete plan language from its canonical fields and sections, then
   check the status according to the plan-status convention. If the artifact is mixed or unclear,
   clarify the language before editing it; do not infer the language from the marker alone.
4. If the plan is already implemented, ask whether it should only be reviewed retrospectively, reopened
   for a follow-up change, or the review aborted. Do not change
   the status without an explicit decision.
5. Ensure that a section for open points exists at the end:
   - German-language plans use `## Offene Punkte` with `- Keine offenen Punkte.`
   - English-language plans use `## Open points` with `- No open points.`
   - If one of the two sections already exists, require it to match the complete plan language.
   - If a combined section `## Annahmen und offene Punkte` exists:
     move decision-requiring points to `## Offene Punkte`; leave
     pure assumptions in the existing section.
   - If a combined section `## Assumptions and open points` exists:
     move decision-requiring points to `## Open points`; leave pure
     assumptions in the existing section.
6. Preserve existing plan content, order, and complete plan language. Pass that concrete language
   to any delegated reviewer; the delegate does not resolve configuration independently.

### Phase 2: Identify findings

The domain review **judgment** is provided by `codebase-improvement` (see "Delegating the
domain judgment to central skills"): apply the skill to the loaded plan file so that it
assesses the findings — among others logical contradictions between requirement,
architecture decisions, approach, edge cases, acceptance criteria, and validation plan;
data security/data protection; security; feasibility; error cases; testability; scope and
maintainability. If the plan crosses a declared specialist boundary, bring in the responsible owner
via the relevance gate — browser/UI/accessibility detail to `effective-web`,
product/design questions to `product-management`/`product-design`, further owners analogously; a
narrow plan stays narrow. If `codebase-improvement` is missing, the minimal generic
fallback from the building block applies instead of a local full checklist.

Split the reported findings into two groups (Effective Flow artifact handling):

- **Directly incorporable:** a clear plan deficiency that can be
  corrected without a domain decision. Incorporate it directly and document it in the matching
  `## Plan-Review` / `## Plan review` section.
- **Decision-requiring:** a decision significantly affects behavior, scope,
  risk, or later implementation. Clarify the point in Phase 3.

### Phase 3: Clarify decisions

Go through decision-requiring points one by one.

For each point:

1. Formulate the concrete risk or ambiguity.
2. Offer, when it makes sense, exactly three solution options. Each option names:
   - description
   - advantages
   - disadvantages
   - whether it is recommended and why
3. Additionally, always offer "Decide later".
4. If fewer than three meaningful domain options exist, do not invent
   artificial options. Name the existing options and still "Decide
   later".
5. If a harness ask format supports only three choice options, the
   domain options go in the question text and "Decide later" remains permissible
   as an explicit choice or free-text answer.

After the user's answer:

- For a domain decision: incorporate it into the appropriate plan section,
  for example architecture decisions, approach, edge cases,
  acceptance criteria, or validation plan. Remove the corresponding entry from
  `## Offene Punkte` or `## Open points`. Continue to recognize the former English spelling
  `## Open Points` when reading an existing plan.
- For "Decide later": add or update a precise entry in
  `## Offene Punkte` or `## Open points` with a re-entry note.
- Update the matching `## Plan-Review` / `## Plan review` immediately.

### Phase 4: Update the plan

After each decision or direct correction:

1. Write the plan file back.
2. Keep the open-points section up to date:
   - German: `## Offene Punkte` with the empty state `- Keine offenen Punkte.`
   - English: `## Open points` with the empty state `- No open points.`
   - Open points → each decision-oriented, concrete, and with a note on
     how the review is continued later.
3. Update the matching plan-review section in the plan language:
   - German uses `**Ergebnis:** Freigegeben` / `**Ergebnis:** Überarbeitung nötig`.
   - English uses `**Result:** Approved` / `**Result:** Revision required`.
   - Use the approved value if no critical findings and no
     implementation-blocking open points remain.
   - Use the revision-required value if critical findings or
     implementation-blocking open points remain.
   - a summary table with the areas Architecture, Security,
     Data protection, Error cases, Testability, Scope, and Maintainability.
   - findings with severity, problem, and the incorporated adjustment or open
     decision need.

### Phase 5: Completion or re-entry

The loop ends when one of these states is reached:

- No critical findings and no implementation-blocking open points
  remain.
- The user ends the loop.
- The next decision needs external research, product coordination, or
  other information not currently available.

If open points remain, report clearly:

- the plan path,
- the number of open points,
- that the re-entry happens via `{{SKILL:review}} <plan-file>`.

If no open points remain, report the plan path and that the plan is ready for the
recommended implementation workflow.

## Rules

- Change only the referenced plan file.
- Ask instead of guessing when a decision significantly affects the later
  implementation.
- Directly fixable plan gaps without a product decision may be corrected
  without a follow-up question.
- Keep the plan file up to date after each step as a reliable re-entry point.
