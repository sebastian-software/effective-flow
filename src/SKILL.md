---
name: effective-flow
description: "Effective Flow — software engineering workflows as tools, invoked via /effective-flow <tool>. Thin router skill with lazy loading: a tool's full instructions are read only when the tool is invoked. Tools: {{TOOL_LIST}}."
---

# Effective Flow

Effective Flow bundles complete software-engineering lifecycle coverage as tools invoked via `{{FLOW}} <tool>` (version {{VERSION}}).

This router skill is deliberately **thin**. Beyond the tool catalog and the dispatch rule it carries nothing; a tool's full instructions are loaded from `tools/<tool>.md` **only when needed**. This keeps the session lean and avoids token exhaustion from preloading all tools.

## Invocation

{{INVOCATION_GUIDANCE}}

## Dispatch rule

1. **No or unknown `<tool>`:** Output the **grouped** tool list below for orientation so the user can choose the right tool, and do nothing else. Do not guess which tool might be meant.
2. **Valid `<tool>`:** Read the file `tools/<tool>.md` in this skill directory and follow it verbatim. Pass the remaining arguments through to the tool unchanged. Do **not** read any further tool files in the process — only the one that corresponds to the invoked tool.

For the `apply` tool, its instructions may in turn load an appropriate **internal** file (`tools/apply-plan.md`, `tools/apply-review.md`, or `tools/apply-issues.md`), depending on the detected source. These internal files are not directly invocable via `{{FLOW}}`.

{{DEPRECATED_ALIASES}}

## Tools

The tools are grouped below by usage intent.

{{TOOL_CATALOG}}

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
- Specialist workers (implementers, reviewers, validators, test/docs writers …) are **not** `{{FLOW}}` tools. Tools invoke them internally through {{WORKER_RESOLUTION}}. Invoking a tool is the user's standing request for exactly that internal delegation. Load or delegate only the selected worker, never the full worker set.
