---
name: effective-flow
description: "Effective Flow — software engineering workflows as tools, invoked via /effective-flow <tool>. Thin router skill with lazy loading: a tool's full instructions are read only when the tool is invoked. Tools: build, fix, plan, refactor, docs, review, apply, plan-issue, maintain, commit, pr, setup, cleanup, open-plans, investigate, version."
---

# Effective Flow

Effective Flow bundles a complete software engineering workflow as tools invoked via `{{FIRMO}} <tool>` (version {{VERSION}}).

This router skill is deliberately **thin**. It contains only the tool catalog and the dispatch rule; a tool's full instructions are loaded from `tools/<tool>.md` **only when needed**. This keeps the session lean and avoids token exhaustion from preloading all tools.

## Invocation

{{INVOCATION_GUIDANCE}}

## Dispatch rule

1. **No or unknown `<tool>`:** Output the **grouped** tool list below for orientation so the user can choose the right tool, and do nothing else. Do not guess which tool might be meant.
2. **Valid `<tool>`:** Read the file `tools/<tool>.md` in this skill directory and follow it verbatim. Pass the remaining arguments through to the tool unchanged. Do **not** read any further tool files in the process — only the one that corresponds to the invoked tool.

For the `apply` tool, its instructions may in turn load an appropriate **internal** file (`tools/apply-plan.md`, `tools/apply-review.md`, or `tools/apply-issues.md`), depending on the detected source. These internal files are not directly invocable via `{{FIRMO}}`.

## Tools

The tools are grouped below by usage intent.

{{TOOL_CATALOG}}

## Rules

- Never load multiple tool files "just in case"; always only the currently invoked tool (plus, if applicable, the single internal `apply` source).
- Specialist workers (implementers, reviewers, validators, test/docs writers …) are **not** `{{FIRMO}}` tools. Tools invoke them internally through {{WORKER_RESOLUTION}}. Load or delegate only the selected worker, never the full worker set.
