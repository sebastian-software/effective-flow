---
description: "Lists all not-yet-implemented plan files from docs/plan/ with a short summary and checks the canonical plan-status marker."
catalogHint: "Shows which plans are still open when you pick the thread back up."
---

# Effective Flow Open Plans

You list open implementation plans from `<plan.dir>/`.

`<plan.dir>` is the plan directory from the Effective Flow configuration (project setup ADR) `plan.dir` (default
`docs/plan`). Resolve `<plan.dir>` through the config locator before listing anything; in hidden mode it lies
below the `RUNTIME_STATE_ROOT` that locator step 0 verifies, even from a linked worktree.

## Goal

- find all plan files with a canonical open status — both `**Planungsstatus:** Nicht umgesetzt` and `**Plan status:** Not implemented`
- output a short, helpful summary per open plan
- do not report plans with a missing or unclear status as open; instead report them separately as "status unclear"
- do not modify any files
- do not run tests, builds, or validations

```lazy-include
language-rules
when: the chat-language rule leaves this run's interactive output language on `language.project`, so the artifact-surface resolver must be read
```

```include
chat-language
```

```include
task-tracking
```

```include
plan-status
```

```lazy-include
config-migration
when: `<plan.dir>` is about to be resolved, so the config locator (including its hidden-mode step 0 and forced values) decides it
```

```lazy-include
next-steps
when: the run reaches its completion report
```

## Approach

```lazy-include
plan-lint
when: `<plan.dir>` is resolved and the plan files are about to be classified
```

1. Run plan-lint once without `files`: `cwd` is the root that holds the resolved `<plan.dir>`, `planDir` is `<plan.dir>` relative to it. It covers every Markdown file at the top level of `<plan.dir>/` in lexicographic order (date-slug names thereby sort chronologically) and reads `<plan.dir>/archive/` only for duplicates. A failed call stops the run with a report naming the failure; never classify the files by hand instead.
2. Classify each entry by its `status`: `open` is an open plan, `implemented` a completed one, and `unclear` (no, several, or an invalid status line) goes on the status-unclear list.
3. For open plans, take from the entry the title (`title`, for migrated legacy plans including the number preserved there, e.g. `# 0030: Title`), the path, the recommended workflow (`workflow`) and, for doc plans, the doc category (`docCategory`). Read the plan file itself only for:
   - a short summary from `## Anforderung` or `## Requirement`
   - optionally the most important affected files from `## Betroffene Dateien` or
     `## Affected files`, if short enough
4. Output:
   - If open plans exist: a table with `Plan`, `Title`, `Workflow`, `Category`, `Path`, `Summary`
     - for non-doc plans, show a dash in the `Category` column
     - for doc plans whose `docCategory` is `null`, show `unknown`
   - Then a short list of status-unclear plans, if present
   - For every entry with non-empty `duplicates`, point out that the same file name exists at the top level and in `archive/` (this duplicate violates the `Plan file convention` and should be resolved via the appropriate workflow)
   - If no open plans exist: a clear message "No open plans found."
5. Emit the next-step block per `next-steps` as the last element of the output, after the table. A run that found no open plan matches no row and emits nothing.

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
- Output paths relative to the project root.
- If `<plan.dir>/` is missing or contains no Markdown files, report that briefly.
