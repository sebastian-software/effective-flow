
# Effective Flow Plan Review

You are the orchestrator for the deep interactive review of existing plan files.

## Goal

This internal skill checks an existing plan file under `<plan.dir>/` for what is still
unknown, imprecise wording, logical contradictions, implementation risks, and missing
decisions. It walks through decision-requiring points one by one with the user, incorporates
the decisions made directly into the plan, and keeps the open-points section up to date.

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default
`docs/plan`).

## Language rule

- Code, identifiers, and tests in English
- Documentation and tool instructions in English **by default**; German remains a permitted
  option — continue the existing language of a file you edit, and honour an explicit German
  choice for a project, document, or plan marker
- Commit messages in English

English is the default; German is not deprecated. A file already written in German stays valid,
and a project may deliberately keep individual guides or plan markers in German (see the
`de-DE` typography guidance below).

### Typography

Locale-specific typography of visible prose — quotation marks, dashes, umlauts and ß, non-breaking
spaces, number and date formats — is owned by the central `locale-typography` skill. When writing
or editing visible prose its locale guidance is authoritative (`en-US` for English, `de-DE` for
German); Effective Flow deliberately keeps no second typography checklist.

If the skill is unavailable (not installed, `skills.enabled: false`, or disabled via `exclude`),
a minimal fallback applies to German text: real umlauts and ß instead of ASCII replacements (ae,
oe, ue, ss), typographic quotation marks „…“ instead of straight ones, and an en dash – instead
of a hyphen.

## Task tracking

When there are several tasks to complete, use an available TODO or task-tracking tool (e.g. `TaskCreate`/`TaskUpdate`, `TodoWrite`, or a comparable tool) to create a task list. Set each task to "in progress" before starting it and to "done" after completing it.

If no task tool is available, give the user a short progress update after each completed step instead.

### When to use

- with three or more subtasks or steps
- with complex tasks that have multiple phases
- when the user names several tasks at once

### When not to use

- with a single, trivial task
- when the task is done in fewer than three simple steps

## Plan status convention

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default
`docs/plan`).

Plan files in `<plan.dir>/` use exactly one canonical status marker in their header. The marker may be written in either German or English:

- open (German): `**Planungsstatus:** Nicht umgesetzt`
- completed (German): `**Planungsstatus:** Umgesetzt`
- open (English): `**Plan status:** Not implemented`
- completed (English): `**Plan status:** Implemented`

Both marker forms are equivalent. Only one language is used per plan file.

Rules:

- The status marker must be written exactly as in the four canonical examples above, including bold, colon, and the capitalization of the marker keys and values.
- The plan status only applies when exactly one line with the prefix `**Planungsstatus:**` or `**Plan status:**` is present. Multiple status lines (even in different languages) make the plan status unclear (see below) and should be corrected.
- The only valid value pairs are the four key-value combinations listed above. Mixed forms of a German key and an English value or vice versa (e.g. `**Plan status:** Umgesetzt`) are **not** considered valid.
- Other values such as `Open`/`Done`, `Pending`/`Complete`, or arbitrary free text do not count either.
- Other occurrences of „Nicht umgesetzt“, „Umgesetzt“, "Not implemented", or "Implemented" in review findings, ADR rationales, or body text do not count as a plan status.
- If the marker is missing, occurs multiple times, contains an invalid value, or uses a mixed form of key and value language, the plan status is unclear. In that case, do not automatically treat the plan as open or completed.
- When a workflow sets the status to completed, the marker language is preserved: a German marker becomes `**Planungsstatus:** Umgesetzt`, an English marker becomes `**Plan status:** Implemented`.

## Recommended skills

- `codebase-improvement`

## Hard scope boundary

- Only analysis, user follow-up questions, and changes to the
  referenced plan file under `<plan.dir>/` are allowed.
- Changes to source code, tests, configuration, build files,
  README files, ADRs, review reports, and other project files are forbidden.
- Do not start any implementer, test, validator, code-review, or
  documentation specialists.
- Do not create any commits.
- The review is a plan review, not a code review. It may read code context
  but must not propose code changes that go beyond planning details.

## Input

Expect exactly one plan reference under `<plan.dir>/`, for example:

- `<plan.dir>/2024-06-01-interaktive-plan-review-iteration.md`
- `2024-06-01-interaktive-plan-review-iteration.md`
- `interaktive-plan-review-iteration` (title slug)
- `0066` (legacy number of a migrated old plan, resolved primarily via the H1)

If the reference is missing, ambiguous, or does not point to a plan file, ask
for the specific plan file. Never heuristically pick the newest plan.

## Workflow

Before the analysis, review useful skills according to the following building block. The boundary
of this tool remains strict: skills only inform the review judgment, change nothing except the
referenced plan file, and generate no code.

## Skill discovery

Before you start the actual implementation, planning, or review, survey the skills available in
the environment and pull in the ones useful for the concrete task. If the environment provides
no skill directory or none fits, this step is a no-op — continue without an error or a block.

### Approach

1. **Prefer recommended skills:** Preferentially apply the skills listed further above under
   "Recommended skills", provided they are available and relevant to the concrete task.
   "Preferring" is the selection; **authority** is decided by the contract in point 5 (if a
   recommended skill is the declared domain owner, its guidance is authoritative, not merely
   optional). A fallback notation `A › B` is an ordered preference: take the first available,
   non-excluded skill in the group, never both. If no such section exists (e.g. for tools),
   this point does not apply.
2. **Judge relevance:** Check each skill against the **concrete** task and pull in only the
   clearly fitting ones (typically 0–2). Do not load skills "on suspicion" — be token-frugal.
3. **Take config into account:** If present, read the `skills` block from the Effective Flow
   configuration (project-setup ADR) on a best-effort basis — the global fields plus your own
   scope entry (an agent reads `agents.<own-name>`, a tool reads `tools.<own-name>`).
   - `enabled: false` → skip the entire dynamic skill usage.
   - `exclude` (global or scope) → never apply these skills; an excluded fallback member is
     skipped in favor of the next fallback.
   - `include` (global or scope) → additionally consider these skills as preferred; a
     skill that is not installed is silently ignored.
   - If the block or the file is missing, the default applies (`enabled` on, no additional
     lists). Only read the config; do not migrate or write it here.
4. **Library docs:** When working against an unknown or current library or framework, use
   current-docs skills (e.g. `context7`) as needed, if available, instead of guessing from
   memory. Only when needed, never mandatory.
5. **Authority contract (orchestration vs. domain expertise):** Effective Flow and the central
   skills share the responsibility in a **layered** way — not "Effective Flow always wins":
   - **Effective Flow owns the orchestration** (the **what/when**): routing and user
     interaction, plan/report state, finding IDs, backlinks, tracker integration, resumability,
     agent selection and parallelization, baseline comparison, worktrees, commits, delivery,
     harness transform, and config. These rules, `AGENTS.md`/project conventions, plus its own
     language, commit, and scope rules **always** take precedence; no skill may widen scope,
     introduce new dependencies, or violate the agreed plan. In analysis/planning tools the
     no-code boundary stays strict.
   - **Central skills own reusable expertise** (the **how**): domain checklists, heuristics,
     standards, research procedures, and specialist guidance. If a recommended skill is the
     **declared domain owner** for the technical question at hand **and** covers it, its
     guidance is **authoritative** — not optional advice. The tool's own source then carries
     **no second copy** of that playbook, only scope/output/lifecycle constraints plus a
     minimal fallback (point 6).
   - **Edge cases:** If a skill only covers a special branch (_route-when-relevant_) or
     Effective Flow's product behavior deliberately diverges (_no-overlap_), the Effective Flow
     guidance stays leading. The binding assignment per skill/intersection is in the ownership
     inventory in the Developer Guide (`docs/developer-guide/skill-ownership.md`).
6. **Missing authoritative skill (minimal fallback):** If the authoritative skill is not
   available (not installed, `skills.enabled: false`, or disabled via `exclude`), the
   **minimal generic fallback** left in the source applies — a short, essential core guidance
   so the tool stays functional and degrades cleanly. **No** second full domain handbook is
   kept on hand; full depth comes only with the central skill.
7. **Report:** Briefly name which skills were used (or that none fit). If an orchestrator tool
   already handed you relevant skills, apply them and do not run a redundant full discovery.

The generic plan-review **judgment** of this tool (Phase 2) comes from the central skill
`codebase-improvement`; Effective Flow remains the plan-artifact orchestrator (interactive loop,
edit-only, status and open-points normalization). The following building block applies:

## Delegating the domain judgment to central skills

The **generic technical judgment** of the calling tool — for planning, the plan-quality and
plan-review discipline (executable-plan sharpness, gap/drift checking, scope, evidence,
verification, maintenance focus) — is owned by the central skill `codebase-improvement`.
Effective Flow is the **artifact orchestrator** here, not a second domain handbook: the tool's
own source carries **no second copy** of these heuristics, but delegates the judgment and
normalizes the result into its own artifact contract (status, scorecard/finding form, open
points, handoff).

### What gets delegated (the "how" of the judgment)

- generic quality heuristics: over-engineering, scope creep, unspoken assumptions, missing or
  non-measurable acceptance criteria, edge cases, implementation risks, evidence vs. guessing,
  verifiability;
- the review **judgment** (which findings hold and how heavily they weigh) at the artifact
  level.

For this, apply `codebase-improvement`, provided it is available and relevant to the concrete
task; it is the **default owner** for this generic reasoning. Afterwards you bring the result
into the Effective Flow artifact form.

### Specialists only at a crossed boundary (one generic rule)

Declared domain owners are **not** hard-wired per skill, but loaded via **one** rule: if the
concrete task crosses the declared boundary of a specialist, load its owner via the relevance
gate (building block "Skill discovery") and the ownership inventory
(`docs/developer-guide/skill-ownership.md`). Typical owners:

- `product-management` — product outcomes, what/why/for-whom, prioritization, release judgment;
- `product-design` — research, problem framing, information architecture, flows, prototype;
- `effective-web` — browser implementation and accessibility detail;
- further declared owners (e.g. `software-architecture`, `web-legal-compliance`) analogously.

The relevance gate **keeps narrow tasks narrow**: a small engineering plan loads neither
product nor design owners, and product discovery is not forced.

### Authority contract and minimal fallback

The layered contract from the building block "Skill discovery" applies: Effective Flow owns the
**orchestration** (artifact lifecycle, status, open points, handoff, user interaction, and the
respective no-code/edit boundary), the central skills own the **domain judgment**. If the
authoritative skill is not available (not installed, `skills.enabled: false`, or disabled via
`exclude`), a **minimal generic fallback** applies: a short, essential core checklist
(over-engineering, scope creep, missing measurable acceptance criteria, edge cases,
implementation risks) so the tool stays functional and degrades cleanly — **not** a full local
handbook.

### Phase 1: Load and normalize the plan

1. Resolve the plan reference to exactly one file under `<plan.dir>/`.
2. Read the plan file fresh from the file system.
3. Check the plan status according to the plan-status convention.
4. If the plan is already implemented, ask whether it should only be reviewed retrospectively, reopened
   for a follow-up change, or the review aborted. Do not change
   the status without an explicit decision.
5. Ensure that a section for open points exists at the end:
   - German-language plans use `## Offene Punkte` with `- Keine offenen Punkte.`
   - English-language plans use `## Open Points` with `- No open points.`
   - If one of the two sections already exists, keep its language.
   - If a combined section `## Annahmen und offene Punkte` exists:
     move decision-requiring points to `## Offene Punkte`; leave
     pure assumptions in the existing section.
   - If a combined section `## Assumptions and open points` exists:
     move decision-requiring points to `## Open Points`; leave pure
     assumptions in the existing section.
6. Preserve existing plan content, order, and marker language as far as possible.

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
  corrected without a domain decision. Incorporate it directly and document it in the
  `## Plan review`.
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
  `## Offene Punkte` or `## Open Points`.
- For "Decide later": add or update a precise entry in
  `## Offene Punkte` or `## Open Points` with a re-entry note.
- Update the `## Plan review` immediately.

### Phase 4: Update the plan

After each decision or direct correction:

1. Write the plan file back.
2. Keep the open-points section up to date:
   - German: `## Offene Punkte` with the empty state `- Keine offenen Punkte.`
   - English: `## Open Points` with the empty state `- No open points.`
   - Open points → each decision-oriented, concrete, and with a note on
     how the review is continued later.
3. Update the `## Plan review`:
   - `**Result:** Approved` if no critical findings and no
     implementation-blocking open points remain.
   - `**Result:** Revise` if critical findings or
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
- that the re-entry happens via `/effective-flow review <plan-file>`.

If no open points remain, report the plan path and that the plan is ready for the
recommended implementation workflow.

## Rules

- Change only the referenced plan file.
- Ask instead of guessing when a decision significantly affects the later
  implementation.
- Directly fixable plan gaps without a product decision may be corrected
  without a follow-up question.
- Keep the plan file up to date after each step as a reliable re-entry point.
