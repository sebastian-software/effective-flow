
# Effective Flow Plan

You are the orchestrator for pure implementation planning.

## Goal

This skill creates an actionable, validated implementation plan in `<plan.dir>/`. It recommends the appropriate follow-up workflow, generates **no code**, starts **no implementation**, and changes **no existing implementation files**.

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

**Load on demand:** Read `shared/config-migration.md`, when the Effective Flow configuration is read for the first time or an old config is migrated.

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

**Load on demand:** Read `shared/plan-numbering.md`, when a plan file is created or its date-slug name is resolved.

## Doc categories

Final documents from the documentation workflow are placed exclusively in one of the four fixed categories under `docs/`.

| Category        | Directory               | Audience                                                        |
| --------------- | ----------------------- | --------------------------------------------------------------- |
| User guide      | `docs/user-guide/`      | End users of the application                                    |
| Developer guide | `docs/developer-guide/` | Developers who contribute to the project                        |
| Operations      | `docs/operations/`      | Operations, deployment, monitoring, infrastructure              |
| Runbooks        | `docs/runbooks/`        | Step-by-step procedures for incident response and routine tasks |

### Prescribed standard doc structure

Unless the user or the underlying plan specifies otherwise, this **standard structure** of
three roles applies to the project documentation. It is a prose default: the documentation
workflow applies it when no different structure is required; an explicit wish of the user
(e.g. a purely technical README without marketing) always takes precedence. There is **no**
config field for this.

1. **Root `README.md` – marketing entry point.** A marketing page entirely from the user's
   perspective: value proposition first, promotional language allowed, kept short. It is
   created by the marketing agent (not by the factual documentation agent) and ends with
   exactly two follow-up links (see below).
2. **User documentation → `docs/user-guide/`.** Entirely from the user's perspective:
   describes installation and usage extensively, optionally with an FAQ and similar additions.
   The entry point is `docs/user-guide/README.md`.
3. **Technical documentation → `docs/developer-guide/`.** For developers and software
   architects: developers get an overview of the software, software architects can derive from
   it whether the software should be used from a technical standpoint. The entry point is
   `docs/developer-guide/README.md`.

**Two-links rule for the root README.** The root `README.md` ends with exactly two links, in
this order:

- first link → `docs/user-guide/README.md` (user documentation)
- second link → `docs/developer-guide/README.md` (technical documentation)

A link is only set if its target exists or is created in the same documentation run;
otherwise the link is omitted and noted as an open point, so no dead links arise.

### File name convention

- topic-based slugs in kebab-case, e.g. `installation.md`, `architecture.md`, `restart-database.md`
- no date or number prefix; the date-slug scheme (with a preserved legacy number) is exclusive to the plan directory `<plan.dir>/` (from `plan.dir` of the Effective Flow configuration/project-setup ADR, default `docs/plan`)
- slugs must be unique within their category
- file extension always `.md`

### Directory rules

- `docs/user-guide/README.md` as a curated entry point with a reading order is mandatory as soon as at least one user-guide document exists.
- `docs/developer-guide/README.md` as a curated entry point is mandatory as soon as at least one developer-guide document exists. It gives developers an overview and software architects a basis for decision-making, and is the target of the second link of the root README (see "Prescribed standard doc structure").
- `docs/operations/` and `docs/runbooks/` have no README by default.
- In `docs/runbooks/`, thematic subfolders are allowed, e.g. `docs/runbooks/database/restart.md`. They are optional; mandatory only once the flat list becomes unwieldy.
- Empty directories are not created in advance. A category directory comes into being only with the first document in it.

### Write boundary

- The documentation workflow may write final documents exclusively into these four directories and their subfolders.
- **Exception root `README.md`:** As the marketing entry point of the standard doc structure, the root `README.md` is a sanctioned write target of the documentation workflow and does not need to be named individually in every plan table for that. It is written exclusively in this marketing-entry-point role; if a root README already exists, it is not silently overwritten but the replacement is clarified with the user (analogous to the collision rule for existing target paths).
- Every **other** existing file outside these directories may only be changed if it is explicitly named in the `Affected files` table of the underlying plan file.

### Plan headers for documentation plans

Plan files with `**Recommended workflow:** Documentation` additionally contain two lines in the header directly under the workflow recommendation:

- `**Doc category:** user-guide | developer-guide | operations | runbooks`
- `**Target path:** docs/<category>/<topic-slug>.md`

Rules:

- Both lines must be written exactly like this, including bold formatting, colon, and lowercasing of the category.
- The category in `**Doc category:**` must match the directory prefix in `**Target path:**`.
- The target path must point to a file within the matching category directory.
- Example: `**Doc category:** runbooks` together with `**Target path:** docs/runbooks/database/restart.md`.
- **Special case marketing entry point:** If the documentation plan targets the root `README.md`, `**Target path:** README.md` is set and the `**Doc category:**` line is **omitted** – the root README is not one of the four `docs/` categories. Only in exactly this case may the category line be absent; the consistency rule "category matches the directory prefix" remains unchanged for all `docs/` targets.

## Recommended skills

- `codebase-improvement`

## Hard scope boundary

- Only analysis, follow-up questions, and documentation changes under `<plan.dir>/` are allowed.
- Creating `<plan.dir>/` is allowed if the directory is missing.
- Changes to source code, tests, configuration, build files, README files, ADRs, and other project files outside `<plan.dir>/` are forbidden.
- Implementer, test, validator, or reviewer phases that could generate or modify code are forbidden.
- The plan itself should contain as little code as possible, or none. Describe the desired changes in natural language, with file references, interface names, data shapes, and acceptance criteria instead of complete code blocks.
- Code in the plan is only allowed when it is the shortest clear form to make a point unambiguous, for example a single literal, a short signature draft, or a minimal data example.
- If code is used, keep it minimal: do not anticipate complete functions, components, classes, tests, or larger snippets.
- If the user requests implementation during this skill, refer them — depending on the recommended implementation — to `$effective-flow build`, `$effective-flow fix`, `$effective-flow refactor`, or `$effective-flow docs` and end this skill after the plan.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when a legacy `.sf-plugin/` or `.firmo/` runtime dir must be migrated.

## Project conventions

If the project contains an `AGENTS.md`, read it early in the workflow and observe its specifications for planning, documentation, and file formats.

## Workflow

Before the analysis, review useful skills according to the following building block. The no-code
boundary of this tool remains strict: skills only inform the analysis and plan, generate no code,
and change nothing except the plan file under `<plan.dir>/`.

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

The generic plan-quality and plan-review **judgment** of this tool (Phases 4–6) comes from
the central skill `codebase-improvement`; Effective Flow remains the plan-artifact orchestrator.
The following building block applies:

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

### Phase 1: Scope and context

1. Analyze the requirement thoroughly.
2. Review existing plan files in `<plan.dir>/` to adopt structure and existing architecture decisions.
3. Check whether any plans in the old format (`NNNN-slug.md`) still exist in `<plan.dir>/`. If so, perform the bulk migration according to `Plan file convention`, section "Migration of old plans (NNNN → date)". The actual plan file for this run is only created in Phase 3/7 under `<plan.dir>/YYYY-MM-DD-<slug>.md` — there is no stub, no reservation, and no number.
4. Examine the relevant areas of the codebase locally or with an internal sub-agent:
   - project structure
   - affected modules and files
   - existing architecture decisions
   - technologies used
   - relevant tests and validation paths
5. Classify the recommended implementation:
   - **Feature:** new functionality, a new UI element, a new page, a new integration, or changed user behavior.
   - **Bugfix:** fix a bug, correct unexpected behavior, or eliminate a regression.
   - **Refactoring:** improve structure, maintainability, or performance without intended behavior change.
   - **Documentation:** change README, guides, API documentation, comments, or other documentation without changing product or code behavior.
6. If the classification is `Documentation`:
   - additionally determine the doc category according to `Doc categories` (user-guide, developer-guide, operations, runbooks).
   - propose a topic-based file slug for the target document that is unique within the category.
   - check whether the proposed target path under `docs/<category>/` already exists. On a collision, propose an alternative slug or clarify the overwrite later in Phase 2.
7. Explicitly record which statements are verified code context and which statements are assumptions.

### Phase 2: Clarification

1. Identify all genuinely relevant ambiguities:
   - desired behavior
   - domain rules
   - technical requirements
   - dependencies
   - edge cases
   - acceptance criteria
   - for documentation plans additionally: doc category and target path, if not unambiguously determinable in Phase 1
2. Ask the user about every relevant ambiguity.
3. Repeat the clarification until no open points remain that would prevent a reliable plan.
4. If an uncertainty is unimportant for the implementation, document it as an assumption instead of blocking the workflow.

### Phase 3: Plan creation

Write the plan file to `<plan.dir>/YYYY-MM-DD-<slug>.md`. `YYYY-MM-DD` is the creation date (via `date +%F`), `<slug>` a kebab-case slug from the final title. On a name collision on the same day, append a numeric suffix (`-2`, `-3`, …). The H1 is `# <title>` without a number.

Before you write the plan, determine the language of the canonical status marker in this order. The first source that yields a valid value wins.

#### Step 1: Consult the configuration

1. Read the Effective Flow configuration from the project-setup ADR (locator via the `**Effective Flow project setup:**` marker in `AGENTS.md`; see the "Config migration" building block) if present.
2. Read the value `plan.markerLanguage`:
   - `"de"` → marker language German; output a status line like "Marker language adopted from the Effective Flow configuration (project-setup ADR): German." and skip Steps 2 to 6.
   - `"en"` → analogously English.
   - any other value (e.g. `"fr"`, `null`, `true`) → ignore it, output a brief note, and continue with Step 2.
   - key missing → go to Step 2 without an extra note (detection outputs its own status line).
3. If the configuration is not readable (missing or corrupt): a brief note to the user, then Step 2.

#### Step 2: Auto-detection from `<plan.dir>/`

1. Read all `.md` files under `<plan.dir>/`. Do _not_ create any new directories and do not write any other files.
2. Determine the plan status per file via the canonical single-marker rule: exactly one line with the prefix `**Planungsstatus:**` or `**Plan status:**` and a valid value; files with a missing, multiple, or invalid status line count as "unclear".
3. Count the plan files with a German marker (`de_count`) and with an English marker (`en_count`). Files with status "unclear" are ignored.
4. Determine the detection result:
   - `de_count > 0` and `en_count == 0` → detection: German.
   - `en_count > 0` and `de_count == 0` → detection: English.
   - otherwise (both > 0 or both == 0) → detection: not unambiguous.

#### Step 3: Note on permanent commitment

If the detection from Step 2 yielded an unambiguous result and `plan.markerLanguage` is not yet set in the Effective Flow configuration (project-setup ADR): use the detected value for this run and briefly note that `$effective-flow setup` permanently commits the marker language in the project-setup ADR. Write **nothing** to the configuration here and do not create a file.

#### Step 4: Adopt the detection result

For an unambiguous detection result:

- Use the detected language as the marker language of the new plan file.
- Output a one-line status update, e.g. "Marker language detected from 12 existing plans: German."
- Skip Steps 5 and 6.

#### Step 5: Question to the user

Only if neither Step 1 nor Step 4 could determine the language:

Frage den User: **In which language should the status marker in the plan header be written?**
- German -- Status line **Planungsstatus:** Nicht umgesetzt
- English -- Status line **Plan status:** Not implemented

In the accompanying message, briefly state why the question is asked (mixed inventory, no recognizable marker, or config not set).

#### Step 6: Note after the question

Only if Step 5 was executed: use the chosen marker language for **this plan**. Do **not** write it to the configuration — permanently committing `plan.markerLanguage` in the project-setup ADR is done exclusively by `$effective-flow setup`. Briefly note this to the user, e.g. "Marker language `de` used for this plan; commit permanently via `$effective-flow setup`."

#### Consistency rules

Use the final marker language consistently: German marker with German values, English marker with English values. Do not mix the marker key and value. Do not carry over language explanations or HTML comments from the example blocks below into the final plan file.

The plan must use at least this structure. Depending on the chosen marker language, use one of the two status lines, not both:

German status line:

```markdown
**Planungsstatus:** Nicht umgesetzt
```

English status line:

```markdown
**Plan status:** Not implemented
```

Complete plan template (insert the status line according to the chosen marker language):

```markdown
# [Title]

**Plan status:** Not implemented
**Source:** $effective-flow plan
**Recommended workflow:** Feature (`$effective-flow build`) / Bugfix (`$effective-flow fix`) / Refactoring (`$effective-flow refactor`) / Documentation (`$effective-flow docs`)
<!-- Only for Recommended workflow: Documentation: -->
**Doc category:** user-guide | developer-guide | operations | runbooks
**Target path:** docs/<category>/<topic-slug>.md

## Requirement

[Requirement, goal, and rationale for the workflow recommendation]

## Architecture decisions

- [Decision with rationale]

## Affected files

| File | Description |
|---|---|
| `path/file` | [planned change] |

## Implementation details

### Approach

1. [concrete implementation step]

### Component structure

[Only if relevant]

### State management

[Only if relevant]

### API integration

[Only if relevant]

### Styling approach

[Only if relevant]

### Accessibility

[Only if relevant]

### Edge cases

- [Edge case and expected behavior]

## Acceptance criteria

- [ ] [measurable criterion]

## Validation plan

- [planned test, check, or manual verification]

## Assumptions and open points

- [Assumption or deliberately documented remaining point]

## Plan review

**Result:** Approved / Revise

### Summary

| Area | Critical | Important | Note |
|---|---:|---:|---:|
| Architecture | 0 | 0 | 0 |
| Security | 0 | 0 | 0 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 0 | 0 |
| Testability | 0 | 0 | 0 |
| Scope | 0 | 0 | 0 |
| Maintainability | 0 | 0 | 0 |

### Findings

- No findings. / [Finding with area, severity, problem, and adjustment]

## Open Points

- No open points.
```

Rules:

- Remove irrelevant optional subsections or write a brief "Not relevant" with a rationale.
- Use concrete file references as soon as they can be derived from the codebase.
- Formulate the acceptance criteria so that together they yield exactly one measurable completion condition. The implementing workflow derives its goal condition and the optional `/goal` string from them; avoid vague criteria without a named check.
- Write the plan as an implementation guide, not as a pre-implementation.
- Avoid code blocks in the plan. Use them only when a short code formulation is clearer and shorter than a prose description.
- If a code example is necessary, limit it to the smallest meaningful fragment and document that it is an example or an interface sketch.
- Add a `## Plan review` section per the template. It contains exclusively plan-level findings, no code-review findings.
- Add a section for open points at the end of the plan. For German-language plans it is called `## Offene Punkte` with the empty state `- Keine offenen Punkte.`; for English-language plans it is called `## Open Points` with the empty state `- No open points.`. If the user wants to make a decision later, document the point there concretely with a re-entry note.
- Do not write any `## Test results` or `## Review findings`, because nothing has been implemented yet.
- Set the canonical open plan status exactly according to the marker language chosen in Phase 3: German to `**Planungsstatus:** Nicht umgesetzt` or English to `**Plan status:** Not implemented`; `$effective-flow build`, `$effective-flow fix`, `$effective-flow refactor`, and `$effective-flow docs` later use this status to recognize the planning or analysis basis.
- Set exactly one line `**Recommended workflow:** ...` in the header area. Choose one of the four categories Feature, Bugfix, Refactoring, or Documentation and name the appropriate skill in parentheses.
- For `**Recommended workflow:** Documentation (`$effective-flow docs`)`, place the two additional lines `**Doc category:** ...` and `**Target path:** ...` directly below it per `Doc categories`. Omit the HTML comment `<!-- Only for ... -->` and the two lines for the other three workflows from the header area.

### Phase 4: Gap analysis

The gap judgment rests with `codebase-improvement` (see "Delegating the domain judgment to
central skills"). Apply the skill to the plan and let it assess the generic gaps —
over-engineering, scope creep, unspoken assumptions, missing or non-measurable acceptance
criteria, edge cases, hidden intentions, implementation risks, evidence vs. guessing. If the
concrete plan crosses a declared specialist boundary (product, design, browser/accessibility,
architecture, legal …), bring in the responsible owner via the relevance gate; a narrow
engineering plan stays narrow.

Incorporate the reported gaps into the plan and clean it up before you report it as complete. If
`codebase-improvement` is missing, the minimal generic fallback from the building block applies
(a short core checklist), **not** a second plan-quality handbook.

### Phase 5: Plan validation

Normalize the quality judgment from Phase 4 into the Effective Flow scorecard (the skill provides
the judgment, Effective Flow the artifact form):

| Criterion               | Target                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Clarity                 | concrete file references and clear steps, target >= 80%                                                            |
| Verification            | measurable acceptance criteria per requirement                                                                     |
| Context                 | verified code vs. assumptions, target <= 10% guessing                                                              |
| Big Picture             | purpose and workflow explicitly described                                                                          |
| No-code boundary        | no changes outside `<plan.dir>/`                                                                                   |
| Code frugality          | no code in the plan unless a minimal fragment is the shortest clear explanation                                    |
| Workflow recommendation | Feature, Bugfix, Refactoring, or Documentation is justified and fits the scope                                     |
| Doc target              | for documentation plans, `**Doc category:**` and `**Target path:**` are set, valid, and consistent with each other |

If a criterion is not met, revise the plan or ask the user for the missing information.

### Phase 6: Plan review

Before completion, perform a review of the plan itself. This review checks the planned changes at the plan level and is **not a code review**.

Rules:

- Do not start any normal reviewer skills, implementers, test writers, or validators.
- Continue to change only the plan file under `<plan.dir>/`.
- Check the planned changes against the verified code context from Phase 1.
- Do not output complete code suggestions; adhere to the code-frugality rule.

The review **judgment** is provided by `codebase-improvement` (see "Delegating the domain
judgment to central skills"): apply the skill to the plan so that it assesses the findings at the
plan level — among others architecture fit, security surface, data protection, error cases,
testability, scope, and maintainability. If the plan crosses a declared specialist boundary
(product, design, browser/accessibility, architecture, legal …), bring in the responsible owner
via the relevance gate. If `codebase-improvement` is missing, the minimal generic fallback from
the building block applies instead of a local full checklist.

Classify the findings reported by the skill into the Effective Flow severity (artifact form):

- **Critical:** the plan may not be completed before the finding is incorporated.
- **Important:** the finding should be incorporated; if deliberately not, document the rationale in the plan.
- **Note:** optional improvement or check point.

Approach:

1. Obtain the review judgment via `codebase-improvement` (plus relevant specialists).
2. Incorporate all critical findings directly into the plan.
3. Incorporate important findings or document in the `## Plan review` why they are deliberately not implemented.
4. Update the `## Plan review` section with the result, summary, and findings.
5. If critical findings still remain after the revision, ask the user for the missing decision and do not complete the plan.

### Phase 6b: Deep interactive plan review

If the internal plan review from Phase 6 no longer contains any critical findings,
ask the user whether the deep interactive plan review should be started now.

Frage den User: **Start the deep interactive plan review now?**
- Yes -- Search now for unknown, imprecise, and decision-requiring points
- No -- Continue later via review <plan-file>

On `Yes`: Read the internal instruction ``tools/plan-review.md`` and run it with the
just-created plan file. Continue to observe the write boundary: only the
plan file under `<plan.dir>/` may be changed.

On `No`: Continue with Phase 7 and name in the conclusion the re-entry via
`$effective-flow review <plan-file>`.

### Phase 7: Completion

1. Write the plan file.
2. Format only the new plan file if a formatter for Markdown is clearly configured.
3. Report to the user:
   - the path of the created plan file
   - a brief summary of the planned approach
   - the recommended workflow with rationale
   - the scorecard result
   - a note that no code changes were made
   - a note as to which skill call implements the plan later, for example `$effective-flow build <plan.dir>/YYYY-MM-DD-<slug>.md`, `$effective-flow fix <plan.dir>/YYYY-MM-DD-<slug>.md`, `$effective-flow refactor <plan.dir>/YYYY-MM-DD-<slug>.md`, or `$effective-flow docs <plan.dir>/YYYY-MM-DD-<slug>.md`

## Rules

- Do not start any implementation phase.
- Do not run any tests that could change project files.
- Do not create any commits.
- Give the user a brief status update after each phase.
- If the plan would not be reliable due to missing information, ask instead of guessing.
