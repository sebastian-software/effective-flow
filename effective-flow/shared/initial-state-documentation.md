## Initial state documentation

Before the actual workflow starts, check whether the project already has documented plans:

1. Check whether `<plan.dir>/` exists and contains at least one `.md` file.
2. If no plan files exist:
   - create `<plan.dir>/` if needed
   - investigate the current project state locally or with an internal sub-agent:
     - project structure
     - existing files
     - technologies used
     - existing architecture decisions
   - write the initial state as `<plan.dir>/YYYY-MM-DD-initial-state.md` (date via `date +%F`)
   - resolve `language.workflow` through the shared language rule and render the **complete**
     initial-state plan in that language, including title, status, headings, table labels, and
     prose. Pass the resolved language to any analysis delegate. Stable paths and technical
     tokens remain unchanged. The English form is shown below; use the canonical German plan
     contract for `de` and never mix forms.

```markdown
# Initial state — [Project name]

**Plan status:** Implemented

## Requirement

Documentation of the project state before the first feature workflow.

## Architecture decisions

[Existing architecture and design decisions]

## Affected files

| File | Description |
|---|---|
| [all relevant files] | [Description] |

## Implementation details

[Current project structure, technologies, dependencies]
```

3. If plan files exist: skip this step without a message.
4. If an initial plan file was created, record it in the wisdom file.

Important: The plan file in the completion phase gets its date-slug name according to `Plan file convention`.
