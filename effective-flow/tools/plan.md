
# Effective Flow Plan

You are the orchestrator for pure implementation planning.

## Goal

This gateway delegates explicit issue references to `effective-flow plan-issue`; otherwise it creates an
actionable, validated implementation plan in `<plan.dir>/` without code or implementation and
recommends the appropriate follow-up workflow.

**Load on demand:** Read `shared/language-rules.md`, when an artifact output language or delegated language context must be resolved.

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

## Delegation mandate

Invoking an Effective Flow tool **is** the user's standing request for internal delegation through an available sub-agent mechanism (e.g. an `Agent`/`Task` tool, a bundled worker contract, or a comparable mechanism). A host default that discourages unrequested sub-agents does not apply inside a tool run.

- Where the workflow names a worker role, delegating to it is **mandatory**, not a judgment call.
- For analysis, exploration, and research, delegation is the **default**. Work inline only under this **triviality exception**: a single known file, one lookup, or a step whose whole cost is smaller than briefing a worker. Sites that name this exception mean exactly this definition.
- A worker that **has** a sub-agent tool may fan out **read-only** analysis sub-agents and passes its supplied language context to them. It never re-delegates its own assignment, never delegates a write, and never selects or sequences another worker role; that stays with the orchestrator. A worker whose tool list carries no sub-agent tool does not delegate at all — that limit rests on the tool list, not on prose.
- If the harness offers no such mechanism, or a delegation is declined at runtime, work inline and say so in one visible line — never silently.
- This mandate covers worker roles and analysis fan-out only. Delegation from one workflow to another keeps that tool's own mechanics, including its interactive/gated path.

**Load on demand:** Read `shared/completion-protocol.md`, when an internal sub-agent's result is returned.

**Load on demand:** Read `shared/runtime-state-safety.md`, when a legacy runtime directory migration or a session rename request is about to mutate `.effective-flow/`.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when a session rename request is about to be written below the runtime directory.

**Load on demand:** Read `shared/config-migration.md`, when the Effective Flow configuration is read for the first time or an old config is migrated.

**Load on demand:** Read `shared/plan-input-gateway.md`, when the user supplied a non-empty argument, before the local planning workflow starts.

The gateway's handoff to `effective-flow plan-issue` deliberately carries **no** `Next steps: suppressed`
line: the gateway ends this run immediately, so the receiving run owns the rest of the work and is
the one that closes in front of the user. It emits its own next-step block.

**Load on demand:** Read `shared/plan-reference-routing.md`, when the gateway classified the argument as an existing plan file and this run revises it.

## Plan status convention

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default
`docs/plan`).

Plan files in `<plan.dir>/` use exactly one canonical status marker in their header. The marker may be written in either German or English:

- open (German): `**Planungsstatus:** Nicht umgesetzt`
- completed (German): `**Planungsstatus:** Umgesetzt`
- open (English): `**Plan status:** Not implemented`
- completed (English): `**Plan status:** Implemented`

Both marker forms are equivalent. Only one language is used per plan file. The marker is not an
independent language choice: it is part of the complete plan language resolved by "Language
resolution" (`language.workflow` for a new plan, or the preserved language of an existing plan).

The complete bilingual field and section mapping lives in `plan-contract`; a workflow that writes
or translates a plan artifact loads it, a workflow that only recognizes the status does not.

Rules:

- The status marker must be written exactly as in the four canonical examples above, including bold, colon, and the capitalization of the marker keys and values.
- The plan status only applies when exactly one line with the prefix `**Planungsstatus:**` or `**Plan status:**` is present. Multiple status lines (even in different languages) make the plan status unclear (see below) and should be corrected.
- The only valid value pairs are the four key-value combinations listed above. Mixed forms of a German key and an English value or vice versa (e.g. `**Plan status:** Umgesetzt`) are **not** considered valid.
- Other values such as `Open`/`Done`, `Pending`/`Complete`, or arbitrary free text do not count either.
- Other occurrences of „Nicht umgesetzt“, „Umgesetzt“, "Not implemented", or "Implemented" in review findings, ADR rationales, or body text do not count as a plan status.
- If the marker is missing, occurs multiple times, contains an invalid value, or uses a mixed form of key and value language, the plan status is unclear. In that case, do not automatically treat the plan as open or completed.
- When a workflow sets the status to completed, the complete plan language is preserved: a German marker becomes `**Planungsstatus:** Umgesetzt`, an English marker becomes `**Plan status:** Implemented`.

**Load on demand:** Read `shared/plan-contract.md`, when a plan artifact's fields, sections, or review prose are written or translated.

**Load on demand:** Read `shared/plan-numbering.md`, when a plan file is created or its date-slug name is resolved.

**Load on demand:** Read `shared/doc-categories.md`, when the requirement is classified as Documentation and a doc category or target path is decided.

**Load on demand:** Read `shared/session-rename.md`, when the run's subject is fixed and a session title is about to be applied or emitted.

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

## Recommended skills

- `codebase-improvement`

## Hard scope boundary

- In the local-plan path, only analysis, follow-up questions, and documentation changes under
  `<plan.dir>/` are allowed.
- Creating `<plan.dir>/` is allowed if the directory is missing.
- Changes to source code, tests, configuration, build files, README files, ADRs, and other project files outside `<plan.dir>/` are forbidden.
- Implementer, test, validator, or reviewer phases that could generate or modify code are forbidden.
- The plan itself should contain as little code as possible, or none. Describe the desired changes in natural language, with file references, interface names, data shapes, and acceptance criteria instead of complete code blocks.
- Code in the plan is only allowed when it is the shortest clear form to make a point unambiguous, for example a single literal, a short signature draft, or a minimal data example.
- If code is used, keep it minimal: do not anticipate complete functions, components, classes, tests, or larger snippets.
- If the user requests implementation during this skill, refer them — depending on the recommended implementation — to `effective-flow build`, `effective-flow fix`, `effective-flow refactor`, or `effective-flow docs` and end this skill after the plan.

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
   "Preferring" is the selection; **authority** is decided by the contract in point 5. A fallback
   notation `A › B` is an ordered preference: take the first available, non-excluded skill in the
   group, never both. If no such section exists (e.g. for tools), this point does not apply.
2. **Judge relevance:** Pull in only skills that clearly fit the **concrete** task (typically
   0–2), never "on suspicion". Never load the alternative orchestrator `effective-workflow`
   inside Effective Flow: nesting it would create competing lifecycle and delivery owners.
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
4. **Library docs:** For an unknown or current library or framework, use an available
   current-docs skill (e.g. `context7`) when needed instead of guessing from memory.
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

<!-- skill-ownership:relevance-gate-owners ["product-management","product-design","effective-web","software-architecture","web-legal-compliance"] -->

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
4. **Revision mode.** If the gateway returned source type `plan`, this run revises that existing
   plan file instead of writing a new one. Resolve the reference **after** the bulk migration of
   step 3 and against the post-migration file name — the gateway runs before that migration, so an
   earlier resolution would already be stale by the time Phase 3 writes.

   Apply only the reference-resolution and status-check sections of the loaded plan-reference rule,
   and ask **none** of its questions: it carries two — the implemented-plan question and the
   missing-or-contradictory-status question — and in revision mode neither is asked, because the
   single question below replaces both. **Skip its workflow-mismatch check** as well: revising a
   plan is not implementing it, so a recommendation pointing at another workflow is expected here
   and must trigger neither a warning nor a confirmation round.

   Enter revision mode **without asking** only when both hold: the reference was **exact** — a full
   path or a date-slug file name — and the resolved plan carries the canonical open status.
   A legacy number or a title slug is a fuzzy match that can land far from the requirement at hand
   (`effective-flow plan caching` resolves to an unrelated `2026-01-01-caching.md`), and a plan that is
   not open is the case the fragment would otherwise ask about. In either case, report the resolved
   path with the plan's title and status first, then ask exactly once:

If the revision target was resolved from a legacy number or a title slug, or the resolved plan does not carry the canonical open status: Ask the user: **Revise the resolved plan file in place, start a new plan, or stop?**
- Revise in place -- Reuse the reported file, reset its status to the canonical open value of its plan language, and move an archived plan back to <plan.dir>/
- New plan -- Leave the resolved plan untouched and write a new dated plan file for this requirement
- Abort -- End the run without changing any plan file

On a revision run:

- Write to the **same path**: no new dated file, no `-2` suffix.
- Reset the status to the canonical open value of the plan's complete language, **unconditionally**
  and not only when the plan was archived. A plan left at `Umgesetzt` / `Implemented` inside
  `<plan.dir>/` would make the emitted `effective-flow apply <plan-file>` reopen the implemented-plan
  question this revision just answered, and `effective-flow open-plans` would not list it. An archived
  plan additionally moves back to `<plan.dir>/` with `git mv`, exactly as the question stated.
- If the status line was missing, duplicated, or invalid, report that unclear status and obtain
  explicit confirmation before writing the canonical open value — the same confirmation any other
  header change needs.
- Preserve a legacy `# NNNN: <title>` H1 verbatim; the `# <title>` rule of Phase 3 covers newly
  created plans only.
- Append this run's review to `## Plan review` / `## Plan-Review` as a **dated subsection**; never
  overwrite the existing section, so earlier passes stay readable.
- Report a changed classification and obtain explicit confirmation before rewriting
  `**Recommended workflow:**`. ``tools/apply-plan.md`` and `effective-flow open-plans` both route on that
  field, so it never flips silently.
- Offer Phase 6b again, as on any other run.

5. Delegate the read-only examination of the relevant areas of the codebase to an internal sub-agent; examine them inline only under the delegation mandate's triviality exception:
   - project structure
   - affected modules and files
   - existing architecture decisions
   - technologies used
   - relevant tests and validation paths
6. Classify the recommended implementation:
   - **Feature:** new functionality, a new UI element, a new page, a new integration, or changed user behavior.
   - **Bugfix:** fix a bug, correct unexpected behavior, or eliminate a regression.
   - **Refactoring:** improve structure, maintainability, or performance without intended behavior change.
   - **Documentation:** change README, guides, API documentation, comments, or other documentation without changing product or code behavior.
7. If the classification is `Documentation`:
   - additionally determine the doc category according to `Doc categories` (user-guide, developer-guide, operations, runbooks).
   - propose a topic-based file slug for the target document that is unique within the category.
   - check whether the proposed target path under `docs/<category>/` already exists. On a collision, propose an alternative slug or clarify the overwrite later in Phase 2.
8. Explicitly record which statements are verified code context and which statements are assumptions.

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

Write the plan file to `<plan.dir>/YYYY-MM-DD-<slug>.md`. `YYYY-MM-DD` is the creation date (via `date +%F`), `<slug>` a kebab-case slug from the final title. On a name collision on the same day, append a numeric suffix (`-2`, `-3`, …). The H1 is `# <title>` without a number. On a revision run per Phase 1 step 4, this step targets the resolved existing path instead and none of these naming rules apply.

Before writing, resolve `language.workflow` once through the shared language resolver and retain
that concrete value for all planning/review delegates. For an existing plan, preserve its
clearly recognizable complete plan language. The legacy marker and existing-plan-corpus paths
are only the transitional read fallbacks defined centrally; report the setup recommendation when
either is used. Do not write configuration from this tool.

The plan uses the complete German or English contract in "Plan status convention" — status,
header fields, sections, review content, and open points all use one column. Stable workflow
values, skill references, doc-category values, and paths are not translated. Do not carry
language explanations or template comments into the plan.

The English form of the structural template is shown below. For `de`, render the complete German
field/section mapping from the canonical bilingual plan contract, including German table headings
and review prose; do not partially translate this example:

```markdown
# [Title]

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`) / Bugfix (`effective-flow fix`) / Refactoring (`effective-flow refactor`) / Documentation (`effective-flow docs`)
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

**Result:** Approved / Revision required

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

## Open points

- No open points.
```

Rules:

- Remove irrelevant optional subsections or write a brief "Not relevant" with a rationale.
- Use concrete file references as soon as they can be derived from the codebase.
- Formulate the acceptance criteria so that together they yield exactly one measurable completion condition. The implementing workflow derives its completion condition from them; avoid vague criteria without a named check.
- Write the plan as an implementation guide, not as a pre-implementation.
- Avoid code blocks in the plan. Use them only when a short code formulation is clearer and shorter than a prose description.
- If a code example is necessary, limit it to the smallest meaningful fragment and document that it is an example or an interface sketch.
- Add the matching `## Plan-Review` or `## Plan review` section. It contains exclusively
  plan-level findings, no code-review findings.
- Add a section for open points at the end of the plan. For German-language plans it is called `## Offene Punkte` with the empty state `- Keine offenen Punkte.`; for English-language plans it is called `## Open points` with the empty state `- No open points.`. Continue to recognize the former English spelling `## Open Points` when reading existing plans. If the user wants to make a decision later, document the point there concretely with a re-entry note.
- Do not write `## Testergebnisse` / `## Test results` or `## Review-Befunde` /
  `## Review findings`, because nothing has been implemented yet.
- Set the canonical open status and every header/section label from the resolved complete plan
  language; later workflows use either complete form to recognize the basis.
- Set exactly one matching workflow field in the header area. Choose one of the stable categories
  Feature, Bugfix, Refactoring, or Documentation and name the appropriate skill in parentheses.
- For a Documentation recommendation, place the matching German or English doc-category and
  target-path fields directly below it per `Doc categories`. Omit the HTML comment and the two
  fields for the other workflows.

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

| Criterion               | Target                                                                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clarity                 | concrete file references and clear steps, target >= 80%                                                                                                                                                         |
| Verification            | measurable acceptance criteria per requirement                                                                                                                                                                  |
| Context                 | verified code vs. assumptions, target <= 10% guessing                                                                                                                                                           |
| Big Picture             | purpose and workflow explicitly described                                                                                                                                                                       |
| No-code boundary        | no changes outside `<plan.dir>/`                                                                                                                                                                                |
| Code frugality          | no code in the plan unless a minimal fragment is the shortest clear explanation                                                                                                                                 |
| Workflow recommendation | Feature, Bugfix, Refactoring, or Documentation is justified and fits the scope                                                                                                                                  |
| Doc target              | documentation plans contain the matching German or English target-path field, plus the doc-category field unless `Doc categories` sanctions its omission; a present category is consistent with its target path |

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
3. Incorporate important findings or document in the matching `## Plan-Review` / `## Plan review` section why they are deliberately not implemented.
4. Update that language-matching review section with the result, summary, and findings.
5. If critical findings still remain after the revision, ask the user for the missing decision and do not complete the plan.

### Phase 6b: Deep interactive plan review

If the internal plan review from Phase 6 no longer contains any critical findings,
ask the user whether the deep interactive plan review should be started now.

Ask the user: **Start the deep interactive plan review now?**
- Yes -- Search now for unknown, imprecise, and decision-requiring points
- No -- Continue later via review <plan-file>

On `Yes`: Read the internal instruction ``tools/plan-review.md`` and run it with the
just-created plan file. Continue to observe the write boundary: only the
plan file under `<plan.dir>/` may be changed. The delegation payload carries the literal line
`Next steps: suppressed` on its own line, because that run returns its result here.

On `No`: Continue with Phase 7; the next-step block of that phase carries the re-entry.

### Phase 7: Completion

1. Write the plan file.
2. Format only the new plan file if a formatter for Markdown is clearly configured.
3. Report to the user:
   - the path of the created plan file
   - a brief summary of the planned approach
   - the recommended workflow with rationale
   - the scorecard result
   - a note that no code changes were made
   - on a revision run: that the existing file was revised in place, plus every confirmed header change
4. Emit the next-step block per `next-steps` as the last element of the report. A deep review that
   returned `Revision required` or a nonzero blocking open-point count takes the open-points row,
   not the ready one — implementation comes after those points are closed.

## Rules

- Do not start any implementation phase.
- Do not run any tests that could change project files.
- Do not create any commits.
- Give the user a brief status update after each phase.
- If the plan would not be reliable due to missing information, ask instead of guessing.
