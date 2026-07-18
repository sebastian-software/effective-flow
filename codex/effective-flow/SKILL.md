---
name: effective-flow
description: "Effective Flow — software engineering workflows as tools, invoked via $effective-flow <tool>. Thin router skill with lazy loading: a tool's full instructions are read only when the tool is invoked. Tools: build, fix, plan, refactor, docs, review, apply, plan-issue, maintain, commit, pr, setup, cleanup, open-plans, investigate, version."
argument-hint: "[investigate|plan|open-plans|plan-issue|apply|build|fix|refactor|docs|maintain|iterate|review|commit|pr|setup|cleanup|version]"
---

# Effective Flow

Effective Flow bundles a complete software engineering workflow as tools invoked via `$effective-flow <tool>` (version 1.48.0 (1cdd053)).

This router skill is deliberately **thin**. It contains only the tool catalog and the dispatch rule; a tool's full instructions are loaded from `tools/<tool>.md` **only when needed**. This keeps the session lean and avoids token exhaustion from preloading all tools.

## Invocation

`$effective-flow <tool> [arguments]`

On Codex the same skill is invoked via the skill name (e.g. `$effective-flow <tool> [arguments]`); the dispatch rule is identical.

## Dispatch rule

1. **No or unknown `<tool>`:** Output the **grouped** tool list below for orientation so the user can choose the right tool, and do nothing else. Do not guess which tool might be meant.
2. **Valid `<tool>`:** Read the file `tools/<tool>.md` in this skill directory and follow it verbatim. Pass the remaining arguments through to the tool unchanged. Do **not** read any further tool files in the process — only the one that corresponds to the invoked tool.

For the `apply` tool, its instructions may in turn load an appropriate **internal** file (`tools/apply-plan.md`, `tools/apply-review.md`, or `tools/apply-issues.md`), depending on the detected source. These internal files are not directly invocable via `$effective-flow`.

## Tools

The tools are grouped below by usage intent.

### Understand what to do
_Analysis & planning before code_

- `$effective-flow investigate` — Finds the cause of a bug or surprising behavior – pure analysis, no code.
- `$effective-flow plan` — Fully clarifies a task and writes an actionable plan – without code.
- `$effective-flow open-plans` — Shows which plans are still open when you pick the thread back up.
- `$effective-flow plan-issue` — Completes the planning for issues that still need clarification.

### Implement a change
_from a clarified plan/issue to code_

- `$effective-flow apply` — Starts implementation from a finished source (plan, issue or review finding).
- `$effective-flow build` — Fully implements a new feature – plan, code, tests, review, completion.
- `$effective-flow fix` — Fixes a specific bug with a minimal, regression-guarded intervention.
- `$effective-flow refactor` — Improves structure or readability without changing behavior.
- `$effective-flow docs` — Creates or updates documentation without changing product behavior.
- `$effective-flow maintain` — Runs recurring maintenance: dependency updates and security fixes.
- `$effective-flow iterate` — Feeds PR review notes and instructions back into an existing PR as new commits.

### Ensure quality

- `$effective-flow review` — Checks code for quality and findings – or, more deeply, an existing plan.

### Deliver changes

- `$effective-flow commit` — Commits the staged changes with a fitting commit message.
- `$effective-flow pr` — Opens a pull request from your branch (GitHub or Forgejo).

### Set up & info

- `$effective-flow setup` — Sets up Effective Flow in the project – guided wizard, starts with safe defaults.
- `$effective-flow cleanup` — Cleans up migration remnants (`.firmo/`, old config, `firmo-` labels) after confirmation.
- `$effective-flow version` — Shows the installed Effective Flow version.

## Rules

- Never load multiple tool files "just in case"; always only the currently invoked tool (plus, if applicable, the single internal `apply` source).
- Specialist agents (implementers, reviewers, validators, test/docs writers …) are **not** `$effective-flow` tools; the tools invoke them internally as subagents (nested under `agents/` on Codex, as registered `effective-flow-*` subagents on Claude Code).
