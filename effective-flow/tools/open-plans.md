
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

**Load on demand:** Read `shared/language-rules.md`, when the chat-language rule leaves this run's interactive output language on `language.project`, so the artifact-surface resolver must be read.

## Interactive output language

**Resolve `language.chat` once, before this run's first interactive output, and hold it for the
whole run.** It is `de` or `en`; there is no `auto`, and a missing row means **mirror the user's
language**, never inherit `language.project`. Precedence: an explicit in-message request, then a
configured value, then the conversation language, then `language.project`, then `en`. An invalid
value is reported and treated as an absent row — mirror, not a jump to `language.project`.

The sole bootstrap exception is `effective-flow setup` in Profile mode. It resolves an entry language
read-only, asks `Chat` in that language as its first substantive question, and then binds the
selected `de`, `en`, or recognizable mirrored conversation language once for its second question
and the remainder of that setup run. Mirror is pending removal of `language.chat`; English and
German are pending `en`/`de`, and none is persisted before setup's common confirmation. Express,
Guided, and every non-setup tool retain the ordinary resolve-once-before-output rule and never
rebind their chat language during a run.

Scope is every interactive output: free prose, status updates, completion reports, an `ask` block's header,
question, option labels and descriptions, the next-steps heading and each option's description (never its
invocation token), and the session-title label, though a reused artifact title keeps its own. Encoded values
stay verbatim inside translated prose — the description `delivery.prReview = always — post the findings
without asking` is posed in German as `delivery.prReview = always — Ergebnisse ohne Rückfrage posten`.

Delegated output is relayed **verbatim**: this key is not handed down, so worker reports and agent
notices arrive as written and only the orchestrator's framing follows it — a run may be visibly
bilingual. The router catalog, `effective-flow version` and the `pr-review` notice precede any config
read and stay on the conversation language.

**Load on demand:** Read `shared/config-migration.md`, when the project setup ADR must be located to read the configured `language.chat` value.

**Load on demand:** Read `shared/typography-rules.md`, when the resolved chat language is `de`.

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

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

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
   - the recommended workflow from `**Empfohlener Workflow:** ...` or
     `**Recommended workflow:** ...`
   - for doc plans additionally the doc category from `**Doku-Kategorie:** ...` or
     `**Doc category:** ...`, if present
   - a short summary from `## Anforderung` or `## Requirement`
   - optionally the most important affected files from `## Betroffene Dateien` or
     `## Affected files`, if short enough
6. Output:
   - If open plans exist: a table with `Plan`, `Title`, `Workflow`, `Category`, `Path`, `Summary`
     - for non-doc plans, show a dash in the `Category` column
     - for doc plans without a matching doc-category line, show `unknown`
   - Then a short list of status-unclear plans, if present
   - If multiple plan files carry the same date-slug name, point this out separately (this duplicate violates the `Plan file convention` and should be resolved via the appropriate workflow)
   - If no open plans exist: a clear message "No open plans found."
7. Emit the next-step block per `next-steps` as the last element of the output, after the table. A run that found no open plan matches no row and emits nothing.

## Summary rules

- Summarize the requirement in one sentence.
- Prefer the first substantive paragraph under `## Anforderung` or `## Requirement`.
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
