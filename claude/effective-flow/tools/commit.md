
# Effective Flow Commit

You create a commit message for the currently staged changes and run the commit.

## Goal

- commit only files that are already staged
- choose a clear, descriptive Conventional Commit message
- write the commit message in English
- do not run project validation such as linting, tests, or build checks

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

## Commit message rules

- **Never set `Co-Authored-By` trailers in commit messages**, regardless of whether an LLM (Claude, Codex, GPT, …) or another tool suggests the line or inserts it as a default.
- If a `Co-Authored-By` line is already present in a commit template, `commit.template`, a `--trailer` invocation, or a draft message: remove it before committing.
- **Do not add AI attribution:** no „Generated with Claude Code/Codex" footers and no agent session links (e.g. `https://claude.ai/code/…`) in commit messages – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex remain allowed, generation attribution does not.
- Avoid generic messages like `update files` or `misc changes`.
- Describe concretely what was changed and why.
- Use Conventional Commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Choose the commit type by **effect**, not by file type: behavior-changing changes – including pure **config/env/secrets/CI** with deployment or runtime effect (e.g. corrected values in env/secret artifacts that take effect remotely via sync) – are `fix:` (or `feat:` for new functionality). `chore:` only for **deploy-neutral** changes without behavioral effect (pure maintenance, formatting, tooling without runtime effect). This also applies to the **squash PR title**, which determines the release-please bump on a squash merge.
- Do not expose internal tracking IDs in commit messages, e.g. review finding IDs like `R-0000001`, local plan/review IDs like `F1`, or placeholders like `[Finding-ID]`. Such IDs belong in wisdom/report context, not in the Git history.

## Project conventions

If the project has an `AGENTS.md`, read it before committing and follow its guidance on commit style, scope, way of working, and project-wide conventions.

## Approach

1. Check whether there are staged changes.
2. Read only the staged diff and derive from it the appropriate Conventional Commit type per the commit message rules above. Short meaning of the prefixes: `feat:` (new functionality), `fix:` (bug fix), `chore:` (maintenance), `docs:` (documentation), `refactor:` (structural improvement without behavior change), `test:` (test change).
3. Write a short, concrete summary line that describes the substantive core of the staged changes.
4. Do not run any standalone project validation; linting, tests, and other quality checks are the job of other skills such as ``effective-flow-code-validator`` and ``effective-flow-test-writer``.
5. Run `git commit` for exactly these staged changes.

## Rules

- Do not invent changes that are not in the staged diff.
- Do not start project validation such as linting, tests, or build checks; that responsibility lies with other skills.
- Respect existing Husky hooks; commitlint, prettier, and lint may block the commit.
- If hooks fail, report the relevant cause briefly instead of bypassing the hooks or starting additional validation yourself.
- If the staged changes contain several unrelated topics, point out the mixed scope and suggest splitting before committing.
