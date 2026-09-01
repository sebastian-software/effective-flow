---
description: "Creates a complete but deliberately shallow concept for a new application or program in docs/concept/: problem, target users, use cases, first-version scope, non-goals and a coarse technical direction — without code and without a work breakdown. Offers the deep concept review that elaborates the concept and records the first planning steps."
catalogHint: "Creates the concept for a new application – complete, but still on the surface."
---

# Effective Flow Concept

You are the orchestrator for the initial concept of a new application or program.

## Goal

This tool writes one concept artifact under `<concept.dir>/`: what the application is, for whom,
which problem it solves, what belongs in its first version, what is deliberately excluded, and in
which technical direction it points. The concept is **complete but deliberately shallow** — every
mandatory section is filled, none of them is specified to implementation depth.

It is not an implementation plan and contains no work breakdown. Once the user is satisfied with
the concept, the deep concept review (`{{SKILL:concept-review}}`, offered at the end of this run
and re-entered later through `{{SKILL:review}} <concept-file>`) elaborates it and records the first
planning steps.

```lazy-include
language-rules
when: an artifact output language or delegated language context must be resolved
```

```include
task-tracking
```

```lazy-include
config-migration
when: the Effective Flow configuration is read for the first time or an old config is migrated
```

```lazy-include
concept-contract
when: a concept artifact's directory, file name, status, or sections are resolved or written
```

```lazy-include
session-title
when: the run's subject is fixed and whether a session title is due must be decided
```

```lazy-include
session-rename
when: the run's subject is fixed and a session title is about to be applied or emitted
```

```lazy-include
next-steps
when: the run reaches its completion report
```

## Recommended skills

- `effective-product`

## Hard scope boundary

- Only analysis, follow-up questions, and one new file under `<concept.dir>/` are allowed.
- Creating `<concept.dir>/` is allowed if the directory is missing.
- Changes to source code, tests, configuration, build files, README files, ADRs, plan files, and
  every other project file outside `<concept.dir>/` are forbidden. In particular: no plan file
  under `<plan.dir>/` and no ADR under `docs/adr/`.
- Implementer, test, validator, or reviewer phases that could generate or modify code are
  forbidden.
- The concept contains no code. Describe the application in natural language; name technologies,
  interfaces, and data shapes by name instead of sketching them in code.
- If the user requests implementation during this tool, point to the path
  concept → deep concept review → `{{SKILL:plan}}` → `{{SKILL:build}}` and end this tool after the
  concept.

## Project conventions

If the project contains an `AGENTS.md`, read it early and observe its specifications for
documentation and file formats. A repository without product code is the normal greenfield case,
not an error.

## Workflow

Before the analysis, review useful skills according to the following building block. The scope
boundary of this tool remains strict: skills only inform the concept, generate no code, and change
nothing except the concept file under `<concept.dir>/`.

```include
skill-discovery
```

The **product judgment** of this tool — problem framing, audience, use-case selection, first-version
scope, and prioritization — is owned by the central skill `effective-product`; the technical
direction crosses `effective-engineering` and, for browser products, `effective-web` only when the
concrete concept touches those boundaries. Effective Flow remains the artifact orchestrator. The
following building block applies:

```include
central-reasoning-delegation
```

### Phase 0: Argument gateway

1. Resolve the Effective Flow configuration read-only and determine `<concept.dir>`. If it is
   identical to `<plan.dir>`, abort per the concept contract.
2. If the argument resolves to exactly one existing file under `<concept.dir>/`: do not start a
   second mode. Report that this concept already exists and that its deep review is entered through
   `{{SKILL:review}} <concept-file>`, then end.
3. If there is no argument: ask for the product idea in one question.
4. Everything else is the free-text product idea and enters Phase 1.

### Phase 1: Context

1. Read `AGENTS.md` and the repository structure when present.
2. Record which statements are verified repository context and which are assumptions. An empty
   repository is recorded as "no verified code context" and is not an obstacle.
3. Check whether `<concept.dir>/` already holds concepts, and adopt their structure. Their language
   is **not** adopted: a new concept follows the resolved `language.workflow` (see Phase 3).

### Phase 2: Bounded clarification

1. Ask only about what changes the substance of the concept:
   - the problem and who has it
   - the primary user groups
   - the two or three central use cases
   - platform and hard constraints
   - what is explicitly **not** wanted
2. Keep the clarification bounded: at most two question rounds. The artifact is deliberately
   shallow — remaining uncertainty becomes an assumption or an entry under open points instead of
   another question round.
3. Never invent a domain fact. When a detail is unknown and unimportant for the concept level,
   record it as an open question in the concept.

### Phase 3: Concept creation

Write the concept file to `<concept.dir>/YYYY-MM-DD-<slug>.md` per the concept contract, in the
concrete `language.workflow` value resolved once through the shared language resolver. A new
concept always follows that resolved value; an existing concept corpus is not a language signal and
never overrides it. Only when editing an existing concept do you preserve its clearly recognizable
complete language, and only an unconfigured project may derive the language from its corpus through
the transitional read fallback defined centrally — report the setup recommendation when that path
is used. Do not write configuration from this tool.

Use the structural template from the concept contract, and observe:

- Fill every mandatory section; an empty section is a defect, not brevity.
- `## Non-goals` is mandatory and must not be empty — it is what keeps the concept shallow.
- `## Technical direction` names direction, not design: platform, stack candidates with a one-line
  rationale each, coarse architecture, external systems, and the data outline in prose.
- `## Roadmap and work packages` carries only its empty state at this point; the deep review fills
  it.
- `## Concept review` carries only the not-yet-reviewed result at this point.
- Write no code, no interface listing, no work breakdown, and no schedule.

### Phase 4: Self-check

Check the written concept against this scorecard:

| Criterion      | Target                                                                |
| -------------- | --------------------------------------------------------------------- |
| Completeness   | every mandatory section filled, non-goals present and non-empty       |
| Shallowness    | no work breakdown, no code, no schedule, no interface specification   |
| Evidence       | verified repository context and assumptions are distinguishable       |
| Decidability   | a reader can tell from the concept whether they want this application |
| Scope boundary | exactly one new file under `<concept.dir>/`, nothing else changed     |
| Language       | one complete language including the status marker                     |

If a criterion is not met, revise the concept or ask the user for the missing information.

### Phase 5: Offer the deep review

```ask
header: Deep review
question: Start the deep concept review now?
options:
  - label: Yes
    description: Elaborate the concept now, clarify decisions and record the first planning steps
  - label: No
    description: Continue later via review <concept-file>
```

On `Yes`: read the internal instruction `{{SKILL:concept-review}}` and run it with the
just-written concept file. The write boundary stays unchanged: only that file may be changed. The
delegation payload carries the literal line `Next steps: suppressed` on its own line, because that
run returns its result here.

On `No`: continue with Phase 6; the next-step block of that phase carries the re-entry.

### Phase 6: Completion

1. Format only the new concept file if a formatter for Markdown is clearly configured.
2. Report to the user:
   - the path of the created concept file
   - a short summary of the concept: problem, audience, first version, non-goals
   - the scorecard result
   - the note that no code and no plan file were written
3. Emit the next-step block per `next-steps` as the last element of the report. A deep review that
   returned `Revision required` or a nonzero blocking open-point count takes the open-points row,
   not the ready one — planning a work package comes after those points are closed.

## Rules

- Do not start any implementation phase and create no plan file.
- Do not create any commits.
- Give the user a short status update after each phase.
- If the concept would not be reliable due to missing information, ask instead of guessing — but
  stay within the bounded clarification of Phase 2.
