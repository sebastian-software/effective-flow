---
description: "Lists all not-yet-implemented plan files from docs/plan/ with a short summary and checks the canonical plan-status marker."
catalogHint: "Shows which plans are still open when you pick the thread back up."
---

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

```include
language-rules
```

```include
task-tracking
```

```include
plan-status
```

```lazy-include
next-steps
when: the run reaches its completion report
```

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
