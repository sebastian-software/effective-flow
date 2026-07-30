---
name: effective-flow
description: "Effective Flow — software engineering workflows as tools, invoked via effective-flow <tool>. Thin router skill with lazy loading: a tool's full instructions are read only when the tool is invoked. Tools: build, fix, plan, refactor, docs, review, apply, concept, plan-issue, maintain, commit, pr, setup, cleanup, open-plans, investigate, version."
argument-hint: "[concept|investigate|plan|open-plans|plan-issue|apply|build|fix|refactor|docs|maintain|iterate|review|pr-review|commit|pr|setup|cleanup|version]"
---

# Effective Flow

Effective Flow bundles complete software-engineering lifecycle coverage as tools invoked via `effective-flow <tool>` (version 1.55.3 (bc31a51)).

This router skill is deliberately **thin**. Beyond the tool catalog, the dispatch rule and the session-title contract it carries nothing; a tool's full instructions are loaded from `tools/<tool>.md` **only when needed**. This keeps the session lean and avoids token exhaustion from preloading all tools.

## Invocation

- Claude Code: `/effective-flow <tool> [arguments]`
- Codex: `$effective-flow <tool> [arguments]`

The portable instructions below use `effective-flow <tool>` as harness-neutral notation; invoke the skill with the syntax of the active harness.

## Dispatch rule

1. **No or unknown `<tool>`:** Output the **grouped** tool list below for orientation so the user can choose the right tool, and do nothing else. Do not guess which tool might be meant.
2. **Valid `<tool>`:** Read the file `tools/<tool>.md` in this skill directory and follow it verbatim. Pass the remaining arguments through to the tool unchanged. Do **not** read any further tool files in the process — only the one that corresponds to the invoked tool.

For the `apply` tool, its instructions may in turn load an appropriate **internal** file (`tools/apply-plan.md`, `tools/apply-review.md`, or `tools/apply-issues.md`), depending on the detected source. These internal files are not directly invocable via `effective-flow`.

## Session title

Hosts derive a session title from the **first** message, so a run is listed as
`Effective-flow plan R-0000010` long before its subject is known. Once the running tool knows that
subject, propose a better title — once.

- **Only where sessions carry titles:** emit only when the host exposes a session-management or
  session-title capability. Never call such a tool for the current session (they exclude it),
  never retitle another session, and never probe speculatively. Where a host offers a self-rename
  path, apply the title silently instead of proposing it. Otherwise stay silent.
- **Only from work-subject tools:** `concept`, `concept-review`, `plan`, `plan-issue`, `apply`,
  `apply-plan`, `apply-review`, `apply-issues`, `build`, `fix`, `refactor`, `docs`, `maintain`,
  `review`, `iterate`, and `investigate`. `version`, `open-plans`, `setup`, `cleanup`, `commit`, and `pr` stay silent, and
  internal sub-agents and workers never emit.
- **Once, as soon as the subject exists:** the issue or pull-request title has been read, the plan
  H1 has been read, the review or maintenance scope is fixed, or the requirement is clarified —
  whichever comes first for the running tool. A delegating parent leaves the emission to its
  delegate, and a delegate never repeats a subject its parent already proposed. Restate the title
  in the completion report only if the final scope diverged from it.
- **Subject first:** `<Subject> · <tool>`, at most 60 characters, cut at a word boundary. Reuse an
  existing artifact title verbatim — plan H1 without a legacy number, issue title without its
  `[R-XXXXXXX]` prefix, pull-request title without its Conventional Commit type — instead of
  paraphrasing it; otherwise use a short noun phrase from the requirement. For several issues, name
  the first subject and append `+N`. Append an identifier such as `#123` only where it aids lookup,
  never in front. No workflow-name prefix, no echo of the invocation, no AI attribution.
- **One line, never blocking:** output `**Suggested session title:** <title>` and nothing else — no
  explanation, no follow-up question, and never in place of the run's own output. The label follows
  the conversation language while a reused artifact title keeps its own. Never put secrets or
  credential values in a title; the session list is a persistent visible surface.

## Tools

The tools are grouped below by usage intent.

### Understand what to do
_Analysis & planning before code_

- `effective-flow concept` — Creates the concept for a new application – complete, but still on the surface.
- `effective-flow investigate` — Finds the cause of a bug or surprising behavior – pure analysis, no code.
- `effective-flow plan` — Routes issue references to issue planning or writes an actionable local plan – without code.
- `effective-flow open-plans` — Shows which plans are still open when you pick the thread back up.
- `effective-flow plan-issue` — Completes the planning for issues that still need clarification.

### Implement a change
_from a clarified plan/issue to code_

- `effective-flow apply` — Starts implementation from a finished source (plan, issue or review finding).
- `effective-flow build` — Fully implements a new feature – plan, code, tests, review, completion.
- `effective-flow fix` — Fixes a specific bug with a minimal, regression-guarded intervention.
- `effective-flow refactor` — Improves structure or readability without changing behavior.
- `effective-flow docs` — Creates or updates documentation without changing product behavior.
- `effective-flow maintain` — Runs recurring maintenance: dependency updates and security fixes.
- `effective-flow iterate` — Feeds PR review notes and instructions back into an existing PR as new commits.

### Ensure quality

- `effective-flow review` — Checks code for quality and findings – or, more deeply, an existing plan.
- `effective-flow pr-review` — Drives an open pull request through checks, bot notes, and – if allowed – the merge.

### Deliver changes

- `effective-flow commit` — Commits the staged changes with a fitting commit message.
- `effective-flow pr` — Opens a pull request from your branch (GitHub or Forgejo).

### Set up & info

- `effective-flow setup` — Sets up Effective Flow in the project – guided wizard, starts with safe defaults.
- `effective-flow cleanup` — Cleans migration remnants and safely reports or removes verified Effective Flow worktrees.
- `effective-flow version` — Shows the installed Effective Flow version.

## Language support

| Scope                                                     | Depth                                                                                                 |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Frontend JavaScript/TypeScript, Node.js backend/CLI, Rust | Specialist implementer and reviewer                                                                   |
| Other clearly identified product code                     | Disclosed reduced-depth implementer and qualitative reviewer, following repository-native conventions |
| Tooling, CI, configuration, repository metadata           | Tooling-only generic implementer plus technical validation                                            |

The workflow is complete across its lifecycle; it does not claim equal specialist expertise in
every language. Unknown product languages route automatically to the reduced-depth path after a
visible notice. A genuinely ambiguous file role or unsafe-to-infer native command requires focused
clarification instead of a guess.

## Rules

- Never load multiple tool files "just in case"; always only the currently invoked tool (plus, if applicable, the single internal `apply` source).
- Specialist workers (implementers, reviewers, validators, test/docs writers …) are **not** `effective-flow` tools. Tools invoke them internally through bundled `workers/effective-flow-<worker>.md` contracts delegated through the host harness's built-in general-purpose subagent mechanism. Load or delegate only the selected worker, never the full worker set.
