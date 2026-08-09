---
description: "Internal instruction for the deep review of one concept artifact: elaborates an existing concept under docs/concept/, clarifies decision-requiring points interactively, marks ADR candidates and records the first planning steps as a roadmap of work packages in that same file."
---

# Effective Flow Concept Review

You are the orchestrator for the deep review of one existing concept artifact.

## Goal

This internal tool takes a concept under `<concept.dir>/` from `Draft` to `Elaborated`: it checks
what is still unknown, imprecise, contradictory, or risky, walks the decision-requiring points one
by one, deepens the existing sections, marks durable decisions as ADR candidates, and records the
first planning steps as ordered work packages with a ready-to-paste handoff. Everything happens in
that one file.

```include
language-rules
```

```include
task-tracking
```

```include
delegation-mandate
```

This mandate authorizes **read-only** analysis fan-out only. The `Hard scope boundary` below is unaffected: never start an implementer, test writer, validator, code reviewer, or documentation specialist.

```lazy-include
completion-protocol
when: an internal sub-agent's result is returned
```

```lazy-include
concept-contract
when: a concept artifact's directory, file name, status, or sections are resolved or written
```

## Recommended skills

- `codebase-improvement`
- `product-management`
- `decision-records`

## Hard scope boundary

- Only analysis, user follow-up questions, and changes to exactly one referenced concept file
  under `<concept.dir>/` are allowed.
- Changes to source code, tests, configuration, build files, README files, ADRs, plan files,
  review reports, and every other project file are forbidden. In particular: create no plan file
  under `<plan.dir>/` and no ADR under `docs/adr/`, and never instruct `{{SKILL:plan}}` to change
  its own routing.
- Do not start any implementer, test, validator, code-review, or documentation specialists.
- Do not create any commits.
- The review is a concept review, not a code review. It may read code context but must not propose
  code changes.

## Input

Expect exactly one concept reference under `<concept.dir>/`, for example:

- `<concept.dir>/2026-07-27-team-scheduling-app.md`
- `2026-07-27-team-scheduling-app.md`
- `team-scheduling-app` (title slug)

Resolve it per the concept contract. If the reference is missing or ambiguous, ask for the specific
concept file. Never heuristically pick the newest file. A reference that resolves to a plan file
belongs to the plan review, not here; report that instead of reviewing it.

## Workflow

Before the analysis, review useful skills according to the following building block. The boundary
of this tool remains strict: skills only inform the review judgment, change nothing except the one
active concept file, and generate no code.

```include
skill-discovery
```

The generic artifact-level **judgment** of this tool comes from `codebase-improvement`, the
**product judgment** from `product-management`, and the judgment about which decision deserves an
ADR from `decision-records`. Effective Flow remains the artifact orchestrator (interactive loop,
persistence, status, roadmap and open-points normalization). The following building block applies:

```include
central-reasoning-delegation
```

### Phase 1: Load and normalize

1. Resolve the reference to exactly one file under `<concept.dir>/` and read it fresh from the
   file system.
2. Determine and preserve the complete artifact language from its canonical fields and sections.
   If the artifact is mixed or unclear, clarify before editing; do not infer the language from the
   marker.
3. Check the concept status per the concept contract. If the concept is already `Elaborated`, ask
   whether it should be reviewed again, reopened for a change, or the review aborted. Do not change
   the status without an explicit decision.
4. Ensure that the language-matching `## Roadmap and work packages`, `## Concept review`, and
   `## Open points` sections exist, in that order at the end of the file. Create a missing section
   with its empty state; move an existing one without changing its entries.
5. Except for that normalization, preserve existing content, order, marker, and complete language.

### Phase 2: Identify findings

The domain review **judgment** is provided by the skills named above: apply them to the loaded
concept so that they assess the findings — among others contradictions between problem, audience,
use cases, scope, and technical direction; a first version that is not viable; missing non-goals;
unrealistic technical direction; data protection and security surface; and feasibility. If the
concept crosses a declared specialist boundary, bring in the responsible owner via the relevance
gate — browser/UI detail to `effective-web`, architecture to `software-architecture`, legal
disclosure duties to `web-legal-compliance`; a narrow concept stays narrow. If a skill is missing,
the minimal generic fallback from the building block applies instead of a local full checklist.

Split the reported findings into two groups:

- **Directly incorporable:** a clear deficiency that can be corrected without a domain decision.
  Incorporate it directly and document it in `## Concept review`.
- **Decision-requiring:** a decision significantly affects the product, scope, risk, or later
  implementation. Clarify the point in Phase 3.

### Phase 3: Clarify decisions

Go through decision-requiring points one by one.

For each point:

1. Formulate the concrete risk or ambiguity.
2. Offer, when it makes sense, exactly three solution options. Each option names its description,
   advantages, disadvantages, and whether it is recommended and why.
3. Additionally, always offer "Decide later".
4. If fewer than three meaningful domain options exist, do not invent artificial ones. Name the
   existing options and still "Decide later".
5. If a harness ask format supports only three choice options, the domain options go in the
   question text and "Decide later" remains permissible as an explicit choice or free-text answer.

After the user's answer:

- For a domain decision: incorporate it into the appropriate section — problem, audience, solution
  sketch, scope, non-goals, or technical direction — and remove the corresponding entry from
  `## Open points`.
- For "Decide later": add or update a precise entry under `## Open points` with a re-entry note. An
  unresolved entry blocks the elaborated status.
- Update `## Concept review` immediately.

### Phase 4: Deepen and lay out the roadmap

1. Deepen the existing sections with everything the decisions produced. The concept becomes more
   concrete, but stays a concept: still no code, no interface specification, and no schedule.
2. Fill `## Roadmap and work packages` with ordered work packages. Each package names:
   - its goal
   - its rough scope
   - what would make it done
   - its dependencies on other packages
   - one ready-to-paste handoff per the roadmap section contract: a complete `{{SKILL:plan}}` call
     whose requirement string names the work package and this concept file
3. Create no plan file, maintain no list of derived plans, and change nothing about the routing of
   `{{SKILL:plan}}`.
4. Mark durable decisions in the concept as ADR candidates with a one-line rationale. Write no ADR
   and do not ask for one; the developer decides later.

### Phase 5: Persist

After each decision or direct correction, write back exactly the one resolved concept file, so it
is a reliable re-entry point at every moment. Keep these current:

- `## Open points` with its language-matching empty state when nothing remains open
- `## Concept review` with the result, a summary table over the areas of the concept contract, and
  the findings with severity, problem, and the incorporated adjustment or open decision need

Severities: **Critical** (blocks the elaborated status), **Important** (should be incorporated;
document a deliberate omission), **Note** (optional).

### Phase 6: Completion or re-entry

The loop ends when no critical finding and no blocking open point remains, when the user ends it,
or when the next decision needs information that is not currently available.

1. Set `**Concept status:** Elaborated` (German: `**Konzeptstatus:** Ausgearbeitet`) exactly when
   no critical finding and no blocking open point remains, and set the review result to
   `Approved`/`Freigegeben`. Otherwise the status stays `Draft`/`Entwurf` and the result is
   `Revision required`/`Überarbeitung nötig`.
2. Return the concept path, the number of blocking open points, and the first work package of the
   roadmap to the caller, which closes the run with its own next-step block. Name no re-entry
   invocation here.

## Rules

- Change only the one referenced concept file.
- Ask instead of guessing when a decision significantly affects the product or the later
  implementation.
- Directly fixable gaps without a product decision may be corrected without a follow-up question.
- Keep the concept file up to date after each step as a reliable re-entry point.
