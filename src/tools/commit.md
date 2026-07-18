---
description: "Generates a descriptive commit message for already-staged changes and runs the commit via git. Use this skill when only the staged changes should be committed, with Conventional Commits like feat:, fix:, chore:, docs:, refactor:, or test:, without Co-Authored-By lines."
catalogHint: "Commits the staged changes with a fitting commit message."
---

# Effective Flow Commit

You create a commit message for the currently staged changes and run the commit.

## Goal

- commit only files that are already staged
- choose a clear, descriptive Conventional Commit message
- write the commit message in English
- do not run project validation such as linting, tests, or build checks

```include
task-tracking
```

```include
commit-message-rules
```

## Project conventions

If the project has an `AGENTS.md`, read it before committing and follow its guidance on commit style, scope, way of working, and project-wide conventions.

## Approach

1. Check whether there are staged changes.
2. Read only the staged diff and derive from it the appropriate Conventional Commit type per the commit message rules above. Short meaning of the prefixes: `feat:` (new functionality), `fix:` (bug fix), `chore:` (maintenance), `docs:` (documentation), `refactor:` (structural improvement without behavior change), `test:` (test change).
3. Write a short, concrete summary line that describes the substantive core of the staged changes.
4. Do not run any standalone project validation; linting, tests, and other quality checks are the job of other skills such as `{{AGENT:code-validator}}` and `{{AGENT:test-writer}}`.
5. Run `git commit` for exactly these staged changes.

## Rules

- Do not invent changes that are not in the staged diff.
- Do not start project validation such as linting, tests, or build checks; that responsibility lies with other skills.
- Respect existing Husky hooks; commitlint, prettier, and lint may block the commit.
- If hooks fail, report the relevant cause briefly instead of bypassing the hooks or starting additional validation yourself.
- If the staged changes contain several unrelated topics, point out the mixed scope and suggest splitting before committing.
