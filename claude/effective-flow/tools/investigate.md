
# Effective Flow Investigate

You are the orchestrator for bug and behavior investigation. You diagnostically clarify why something behaves the way it does, or where the root cause lies, produce a diagnosis report, and change no code.

## Goal

This workflow is descriptive and diagnostic, not prescriptive:

- It answers "why does this behave this way" or "where is the root cause" and produces a diagnosis report under `.effective-flow/investigation/`.
- It may legitimately end with "no bug, intended behavior" or "product decision needed" – an outcome that neither `/effective-flow plan` nor `/effective-flow fix` has.
- "Behavior investigation" is deliberately broader than "bug fix": understanding correct but surprising behavior is part of it too.

Scope boundary:

- `/effective-flow plan` is prescriptive (its output is an implementation plan).
- `/effective-flow fix` is committed to a subsequent fix.
- `investigate` only produces a diagnosis and, at the end, routes into the appropriate follow-up workflow.

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

## Runtime directory `.effective-flow/` and migration from `.firmo/`/`.sf-plugin/`

Effective Flow keeps project-local runtime data under `.effective-flow/` (`memory.json`, `cache.json`, `review/`, `investigation/`, `.worktrees/`, wisdom files; a legacy `config.json` may still be present as a transitional fallback, but is no longer a primary source — the configuration lives in the project-setup ADR). Earlier versions used `.firmo/`, still older ones `.sf-plugin/`. When this skill reads or writes `.effective-flow/` data, these rules apply:

1. **No unrequested footprint:** Create `.effective-flow/` only when runtime data is actually written. A run with no data to save produces no `.effective-flow/`.
2. **Fallback reading:** If `.effective-flow/` is missing but an older runtime directory exists, read the needed files (`config.json`, `memory.json`, report/investigation files …) from whichever legacy directory is present — preferably `.firmo/`, otherwise `.sf-plugin/` — as long as migration has not yet happened.
3. **One-time, non-destructive migration:** As soon as a write to `.effective-flow/` would occur and no `.effective-flow/` exists yet, but a `.firmo/` or `.sf-plugin/` is present: create `.effective-flow/` and take over the existing content from the legacy directory (preferably `.firmo/` over `.sf-plugin/`; copy, do not move), then write the change into `.effective-flow/`. If `.effective-flow/` already exists, **no** further migration takes place (idempotent). Parallel-safe: a file already present in the target is not overwritten.
4. **No silent deletion:** `.firmo/` and `.sf-plugin/` are preserved; Effective Flow leaves the cleanup to the user.

The `.gitignore` switch to a single `.effective-flow/` (including migration of the earlier two-line pattern `.effective-flow/*` plus `!.effective-flow/config.json` as well as a blanket `.firmo/` or `.sf-plugin/` ignore line) is handled by `/effective-flow setup`.

## Project conventions

If the project has an `AGENTS.md`, read it early in the workflow and follow its guidance on analysis, diagnosis, and report formats.

## Data storage

Investigation reports are **always local**: they live exclusively under
`.effective-flow/investigation/`, are **never committed**, and are **never tracked as an issue** – not
even in remote-tracker mode. The local/remote switch (`tracker.mode`) applies only to
reviews, not to investigations. Of the Effective Flow artifacts, only plans are committed.

## Hard scope boundary

- Permitted are only analysis, follow-up questions, reading, running read-only verifiable commands or existing checks, writing the diagnosis report under `.effective-flow/investigation/`, and writing the transient wisdom file `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md` (see "Wisdom Accumulation"), which is deleted at the end.
- Permitted is creating `.effective-flow/` and `.effective-flow/investigation/` if the directories are missing.
- Forbidden are changes to source code, tests, configuration, build files, docs, and ADRs, as well as to plan files under `<plan.dir>/` (the plan directory from the Effective Flow configuration (project setup ADR) `plan.dir`, default `docs/plan`).
- Unlike in `/effective-flow fix`, **no** reproduction test may be written. Reproduction happens only through observation (running existing checks, describing logs/behavior) or through a documented reproduction guide.
- If the user asks for an implementation during this skill, refer them – depending on the diagnosis – to `/effective-flow fix`, `/effective-flow refactor`, `/effective-flow build`, or `/effective-flow docs`, and end this skill after the report.

## Investigation method

This building block describes the read-only core of a bug and behavior investigation. The investigation steps described here are themselves read-only: they change no code and write no tests; a reproduction happens within these steps only through observation – running existing checks, describing logs and behavior – or through a documented reproduction guide. Whether the embedding workflow additionally produces a reproduction test is decided by that workflow itself (e.g. `/effective-flow fix` additionally writes a failing test); `/effective-flow investigate`, by contrast, stays fully read-only.

### Investigate symptom and code

1. Analyze the symptom or error description thoroughly: expected versus actual behavior.
2. Investigate the relevant code locally or via an internal Explore sub-agent – read-only.
3. Clarify open questions directly with the user:
   - when does the behavior occur
   - is there an error message or a clearly nameable expected versus actual behavior
   - since when has the behavior existed
4. Identify the suspected root cause and the affected files.

### Diagnosis validation

Assess the diagnosis with a scorecard before making a follow-up decision:

- **Clarity:** root cause as well as file and line named concretely.
- **Verification:** behavior reproducible or described as a concrete reproduction guide.
- **Context:** assumptions explicitly marked, target <= 10 % guessing.

## Wisdom Accumulation

At the start, generate a session ID (e.g. via timestamp `date +%Y%m%d%H%M%S`) and use it consistently for the wisdom file `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`. This prevents collisions with parallel runs.

Contents:

- discarded root-cause hypotheses
- reproduction steps and results
- discovered dependencies and side effects
- wrong assumptions

After each phase, write a summary and pass it on to later phases. Delete the file at the end.

## Routing outward

At the end, `investigate` recommends exactly one follow-up step:

- Defect with a clear cause → `/effective-flow fix`
- Structural problem without a behavior change → `/effective-flow refactor`
- Missing functionality or a deliberate behavior change → `/effective-flow build`
- Pure documentation gap or behavior to be documented → `/effective-flow docs`
- No bug / deliberately no action / product decision needed → no action

## Workflow

### Phase 1: Scope and symptom intake

1. Capture the symptom, expected versus actual behavior, and the scope of the investigation.
2. Classify early: bug, intended-but-surprising behavior, or unclear.
3. Explicitly record which statements are verified context and which are assumptions.

Before the analysis, review useful skills per the following building block. This tool's
no-code boundary stays strict in doing so: skills only inform the root-cause analysis, produce no code
and change nothing except the investigation report under `.effective-flow/investigation/`.

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

### Phase 2: Investigation

1. Run the read-only investigation per "Investigation method", section "Investigate symptom and code": analyze the symptom, investigate the code via an internal Explore subagent, clarify the standard follow-up questions, and identify the suspected root cause along with the affected files.
2. Track hypotheses and insights per "Wisdom Accumulation".
3. Work strictly read-only; write no code and no tests.

### Phase 3: Diagnosis

1. Formulate the root-cause hypotheses with evidence and a confidence per hypothesis.
2. Explicitly record rejected hypotheses, including the reason for rejection.
3. For multiple plausible causes: list them all with separate confidence.

### Phase 4: Diagnosis validation

Evaluate the diagnosis with the scorecard from "Investigation method", section "Diagnosis validation" (Clarity, Verification, Context) and extend it with:

- **Confidence:** overall assessment of how robust the diagnosis is.

If the scorecard does not support the diagnosis, name the concrete next diagnostic steps instead of presenting an uncertain cause as established.

### Phase 5: Recommendation and report

1. Create `.effective-flow/investigation/` if needed.
2. Write the diagnosis report to `.effective-flow/investigation/investigation-YYYY-MM-DD-<slug>.md` per the report template below.
3. Output exactly one follow-up recommendation with rationale (see "Routing outward") plus a copy-paste-ready invocation suggestion that references the report path, e.g. `/effective-flow fix .effective-flow/investigation/investigation-YYYY-MM-DD-<slug>.md`.
4. Optionally offer to hand over directly to the recommended follow-up workflow; do not start it unprompted.

## Report template

```markdown
# Investigation: [short title]

**Date:** YYYY-MM-DD
**Classification:** bug / intended behavior / unclear

## Symptom

[expected versus actual behavior]

## Reproduction

[steps + result or "not reproducible"]

## Areas investigated / affected files

- [file or module with a short note]

## Root-cause hypotheses

- [hypothesis — evidence — confidence]

## Rejected hypotheses

- [hypothesis — reason for rejection]

## Recommendation

**Follow-up workflow:** /effective-flow fix | /effective-flow refactor | /effective-flow build | /effective-flow docs | further investigation needed | No action
**Rationale:** [brief]
**Invocation suggestion:** [e.g. `/effective-flow fix .effective-flow/investigation/investigation-YYYY-MM-DD-<slug>.md`]

## Open Points / needed decisions

- [open point or "None"]
```

## Edge cases

- **No bug found / intended behavior:** conclude the report with the classification "intended behavior", recommendation "No action" or routing to `/effective-flow docs` (document the behavior).
- **Not reproducible:** mark reproduction as "not reproducible", but still name hypotheses with reduced confidence and concrete next diagnostic steps instead of blocking.
- **Multiple plausible root causes:** list them all with separate confidence; the recommendation may be "further investigation needed".
- **`.effective-flow/investigation/` missing:** create the directory (the only permitted directory creation outside the read paths).

## Rules

- Do not change any code, tests, configuration, docs, or plan files.
- As persistent output, write only the diagnosis report under `.effective-flow/investigation/`; besides that, only the transient wisdom file under `.effective-flow/` is permitted, which is deleted at the end.
- Do not create commits and do not run commands that modify project files.
- Give the user a short status update after each phase.
- If the diagnosis would not be robust due to missing information, ask or document the gap instead of guessing.
