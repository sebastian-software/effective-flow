---
description: "Internal instruction for the deep interactive review of one planning artifact: checks a local plan file or a delegated canonical issue-planning comment and maintains decisions directly in that same artifact."
---

# Effective Flow Plan Review

You are the orchestrator for the deep interactive review of one existing planning artifact.

## Goal

This internal skill checks either an existing plan file under `<plan.dir>/` or
`<plan.dir>/archive/`, or one canonical issue-planning comment delegated by
`{{SKILL:plan-issue}}`, for what is still unknown, imprecise wording, logical contradictions,
implementation risks, and missing decisions. It walks through decision-requiring points one by
one, incorporates decisions directly into that same artifact, and keeps its review and open-points
sections current. The review judgment is shared; loading, persistence, readiness, and re-entry are
artifact adapters.

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

- **File mode:** only analysis, user follow-up questions, and changes to exactly one referenced
  plan file under `<plan.dir>/` or `<plan.dir>/archive/` are allowed.
- **Issue mode:** only when delegated by `{{SKILL:plan-issue}}`; only analysis, user follow-up
  questions, and `issue-comment-update` for exactly one supplied canonical planning-comment ID are
  allowed. Return readiness to the caller; do not change labels here.
- Changes to source code, tests, configuration, build files,
  README files, ADRs, review reports, and other project files are forbidden.
- In issue mode, creating a plan file, adding a comment, updating another comment, changing the
  issue body, or independently resolving a tracker/issue is forbidden. If the targeted update is
  unsupported or stale, fail closed.
- Do not start any implementer, test, validator, code-review, or
  documentation specialists.
- Do not create any commits.
- The review is a plan review, not a code review. It may read code context
  but must not propose code changes that go beyond planning details.

## Input

Expect exactly one of these explicit modes:

- **File mode:** one plan reference under `<plan.dir>/` or `<plan.dir>/archive/`, for example:

  - `<plan.dir>/2024-06-01-interaktive-plan-review-iteration.md`
  - `<plan.dir>/archive/2024-06-01-interaktive-plan-review-iteration.md`
  - `2024-06-01-interaktive-plan-review-iteration.md`
  - `interaktive-plan-review-iteration` (title slug)
  - `0066` (legacy number of a migrated old plan, resolved primarily via the H1)

- **Issue mode:** a delegation receipt from `{{SKILL:plan-issue}}` containing exactly one issue
  reference, the canonical planning-comment ID, its freshly read body and `expectedBodyHash`, the
  already-resolved tracker adapter, and the concrete artifact language. Direct user invocation of
  issue mode is invalid; point to `{{SKILL:plan-issue}} <issue>`.

If the mode or reference is missing or ambiguous, ask for the specific plan file or return to the
delegating `plan-issue` workflow. Never heuristically pick a newest file, issue, or comment.

## Workflow

Before the analysis, review useful skills according to the following building block. The boundary
of this tool remains strict: skills only inform the review judgment, change nothing except the
single active planning artifact through its adapter, and generate no code.

```include
skill-discovery
```

The generic plan-review **judgment** of this tool (Phase 2) comes from the central skill
`codebase-improvement`; Effective Flow remains the plan-artifact orchestrator (interactive loop,
adapter-scoped persistence, status and open-points normalization). The following building block
applies:

```include
central-reasoning-delegation
```

### Phase 1: Load and normalize through the artifact adapter

1. Select exactly one adapter from the explicit input:
   - **File adapter:** resolve the plan reference to exactly one file under `<plan.dir>/` or
     `<plan.dir>/archive/`. Search both locations and determine uniqueness across their combined
     candidates; a missing archive contributes no candidates. Support a full path, date-slug file
     name, title slug, or four-digit legacy number. Resolve a legacy number primarily via its H1
     `# NNNN: …`; use the file name segment only as the existing secondary signal. Read that file
     fresh from the file system.
   - **Issue adapter:** accept only the complete delegation receipt from `plan-issue`. Verify that
     the supplied body starts with `<!-- effective-flow-plan-issues -->` (the caller canonicalizes
     the old marker before delegation), that the comment ID is positive, and that one issue and one
     tracker adapter are retained. The supplied body is the active artifact; do not read or create
     a local plan file.
2. Determine and preserve the complete artifact language from its canonical fields and sections.
   In issue mode, confirm it agrees with the concrete language in the delegation receipt. If the
   artifact is mixed or unclear, clarify before editing; do not infer language from the marker.
3. In file mode, check status according to the plan-status convention. If the plan is already
   implemented, ask whether it should be reviewed retrospectively, reopened for a follow-up
   change, or the review aborted. Do not change status without an explicit decision. Issue mode
   has no plan-file status and skips this step.
4. Ensure that a language-matching section for open points exists at the end of the active
   artifact. In file mode, retain the existing end-of-plan contract. In issue mode, keep Open
   points after the Plan-review section as in the canonical planning-comment structure. If an
   existing section is elsewhere, move it without changing its entries:
   - German-language plans use `## Offene Punkte` with `- Keine offenen Punkte.`
   - English-language plans use `## Open points` with `- No open points.`
   - German issue comments use `### Offene Punkte` with `- Keine offenen Punkte.`
   - English issue comments use `### Open points` with `- No open points.`
   - If one of the two sections already exists, require it to match the complete plan language.
   - If a combined section `## Annahmen und offene Punkte` exists:
     move decision-requiring points to `## Offene Punkte`; leave
     pure assumptions in the existing section.
   - If a combined section `## Assumptions and open points` exists:
     move decision-requiring points to `## Open points`; leave pure
     assumptions in the existing section.
5. Ensure that a language-matching `## Plan-Review` / `## Plan review` section exists in file mode
   or `### Plan-Review` / `### Plan review` in issue mode. Older issue comments missing these
   sections are normalized in place; do not reject them or create another comment.
6. Except for the explicit open-points normalization above, preserve existing artifact content,
   order, marker, and complete language. Pass that concrete language to any delegated reviewer;
   the delegate does not resolve configuration independently.

### Phase 2: Identify findings

The domain review **judgment** is provided by `codebase-improvement` (see "Delegating the
domain judgment to central skills"): apply the skill to the loaded planning artifact so that it
assesses the findings — among others logical contradictions between requirement,
architecture decisions, approach, edge cases, acceptance criteria, and validation plan;
data security/data protection; security; feasibility; error cases; testability; scope and
maintainability. If the artifact crosses a declared specialist boundary, bring in the responsible owner
via the relevance gate — browser/UI/accessibility detail to `effective-web`,
product/design questions to `product-management`/`product-design`, further owners analogously; a
narrow plan stays narrow. If `codebase-improvement` is missing, the minimal generic
fallback from the building block applies instead of a local full checklist.

Split the reported findings into two groups (Effective Flow artifact handling):

- **Directly incorporable:** a clear planning deficiency that can be corrected without a domain
  decision. Incorporate it directly and document it in the active artifact's matching Plan-review
  section.
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

- For a domain decision: incorporate it into the appropriate artifact section,
  for example architecture decisions, approach, edge cases,
  acceptance criteria, or validation plan. Remove the corresponding entry from
  `Offene Punkte` or `Open points`. Continue to recognize the former English spelling
  `## Open Points` when reading an existing file plan.
- For "Decide later": add or update a precise entry in the artifact's open-points section with a
  re-entry note. An unresolved entry blocks implementation.
- Update the artifact's matching Plan-review section immediately.

### Phase 4: Persist through the artifact adapter

After each decision or direct correction:

1. Persist exactly the active artifact:
   - **File adapter:** write only the resolved plan file back.
   - **Issue adapter:** preserve the leading `<!-- effective-flow-plan-issues -->` marker and call
     `issue-comment-update` for only the supplied comment ID, issue, and tracker adapter. Use the
     body hash from the immediately preceding successful read/update as `expectedBodyHash`, first
     preview the dry run, then apply the identical payload. Refresh the retained body/hash after
     each successful update. Never call `issue-comment`, create a file, update the issue body, or
     choose another comment. On unsupported capability, missing target, ambiguity, or stale body,
     return a blocking persistence failure to `plan-issue` without a fallback write.
2. Keep the artifact's open-points section up to date:
   - German: `## Offene Punkte` with the empty state `- Keine offenen Punkte.`
   - English: `## Open points` with the empty state `- No open points.`
   - In issue mode use the same labels at heading level three.
   - Open points → each decision-oriented, concrete, and with a note on
     how the review is continued later.
3. Update the matching plan-review section in the artifact language and at its adapter's heading
   level:
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

Return an artifact-specific result:

- **File mode, open points remain:** report the plan path, number of blocking open points, and
  re-entry via `{{SKILL:review}} <plan-file>`.
- **File mode, ready:** report the plan path and that it is ready for its recommended workflow.
- **Issue mode:** return to `plan-issue` the issue reference, canonical comment ID, latest body and
  hash, review result, blocking-open-point count, and persistence status. If review is incomplete
  or blocked, name re-entry via `{{SKILL:plan-issue}} <issue>`; never suggest the public `review`
  gateway for an issue. `plan-issue` alone applies the Needs-Planning label decision.

## Rules

- Change only the active artifact through its adapter: the referenced plan file in file mode or
  the supplied canonical planning comment in issue mode.
- Ask instead of guessing when a decision significantly affects the later
  implementation.
- Directly fixable plan gaps without a product decision may be corrected
  without a follow-up question.
- Keep the active artifact up to date after each step as a reliable re-entry point.
