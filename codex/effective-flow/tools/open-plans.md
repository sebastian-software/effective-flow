
# Effective Flow Open Plans

You list open implementation plans from `<plan.dir>/`.

`<plan.dir>` is the plan directory from the Effective Flow configuration (project setup ADR) `plan.dir` (default
`docs/plan`).

## Goal

- find all plan files with a canonical open status — both `**Planungsstatus:** Nicht umgesetzt` and `**Plan status:** Not implemented`
- output a short, helpful summary per open plan
- do not report plans with a missing or unclear status as open; instead report them separately as "status unclear"
- do not modify any files
- do not run tests, builds, or validations

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

## Approach

1. Check whether `<plan.dir>/` exists.
2. Read all Markdown files at the top level of `<plan.dir>/` in lexicographic order (date-slug names thereby sort chronologically). Exclude `<plan.dir>/archive/`.
3. Determine each file's plan status via the canonical single-marker rule of the Plan status convention: exactly one line with the prefix `**Planungsstatus:**` or `**Plan status:**` and a valid value.
4. Classify (both marker languages are equivalent):
   - **Open:** exactly `**Planungsstatus:** Nicht umgesetzt` or `**Plan status:** Not implemented`
   - **Completed:** exactly `**Planungsstatus:** Umgesetzt` or `**Plan status:** Implemented`
   - **Status unclear:** no status line, multiple status lines, or a different value
5. For open plans, determine:
   - the title from the first H1 line (for migrated legacy plans including the number preserved there, e.g. `# 0030: Title`)
   - the path
   - the recommended workflow from `**Recommended workflow:** ...`
   - for doc plans additionally the doc category from `**Doc category:** ...`, if present
   - a short summary from `## Requirement`
   - optionally the most important affected files from `## Affected files`, if short enough
6. Output:
   - If open plans exist: a table with `Plan`, `Title`, `Workflow`, `Category`, `Path`, `Summary`
     - for non-doc plans, show a dash in the `Category` column
     - for doc plans without a `**Doc category:**` line, show `unknown`
   - Then a short list of status-unclear plans, if present
   - If multiple plan files carry the same date-slug name, point this out separately (this duplicate violates the `Plan file convention` and should be resolved via the appropriate workflow)
   - If no open plans exist: a clear message "No open plans found."

## Summary rules

- Summarize the requirement in one sentence.
- Prefer the first substantive paragraph under `## Requirement`.
- If the section is missing, use the H1 title as a fallback.
- Remove pure meta sentences like "Verified code context:" from the summary.
- Shorten long summaries to about 160 characters.
- Do not invent content that is not in the plan file.

## Rules

- Do not modify any files.
- Do not start any implementation or validation.
- Do not count review-finding statuses like `Not implemented` or `Not implemented` as a plan status.
- Output paths relative to the project root.
- If `<plan.dir>/` is missing or contains no Markdown files, report that briefly.
