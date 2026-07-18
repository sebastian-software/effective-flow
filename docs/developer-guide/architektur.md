# Architecture

This document describes how Effective Flow is built as a repository: the source-to-dist model,
the router with lazy loading, and the split across the two harnesses Claude Code and Codex.
Behavior rules for agents (language rules, commit conventions, no-AI-attribution, plan-file
conventions) live canonically in [`AGENTS.md`](../../AGENTS.md) – this document references them
instead of duplicating them.

## Source-to-dist model

Effective Flow is **not** a runtime product but a build: `build.mjs` reads the Markdown sources
under `src/` and generates two harness-specific skill directories under `dist/` from them.

- Only `src/` is edited. `dist/` is generated and gitignored – changes there are lost on the
  next build.
- Source and delivery live on **two branches**: `develop` (source, no `dist/`) and the default
  branch `main` (carries the built `dist/` payload **and** the consumer-facing docs –
  `README.md` + `docs/user-guide/` –, but **not** the developer docs `docs/developer-guide/`;
  written mechanically by the release workflow). For details see
  [Release and installation](release-und-installation.md#source-and-delivery-branch).
- The source layout **mirrors the output**: the folder determines the category, the file name
  without `.md` the name. There is therefore no `name` or `type` field in the frontmatter.
- Details on the build flow, the placeholders, and the guards are in
  [`build-system.md`](build-system.md).

## Thin router with lazy loading

`src/SKILL.md` is the router: a tool catalog plus a dispatch rule, nothing else. It never loads
all tools up front but references, on the call `/effective-flow <tool>` (Claude) or
`$effective-flow <tool>` (Codex), exactly the one matching `tools/<tool>.md`. This lazy loading
keeps the session lean and avoids token exhaustion from unnecessarily preloaded tool
instructions.

With no `<tool>` or an unknown one, the router only prints the tool list and does nothing else.

The same progressive disclosure applies **within** a tool: mode-gated shared fragments (e.g.
worktree delivery, remote tracker, report handling) are no longer inlined eagerly but loaded on
demand via `lazy-include` only at the decision point. Details and the context budget are in
[`build-system.md`](build-system.md) under "Progressive disclosure beyond the router".

Effective Flow knows two building-block types:

| Type      | Description                                | Invocation                                          |
| --------- | ------------------------------------------ | --------------------------------------------------- |
| **Tool**  | Workflow or utility instruction            | `/effective-flow <tool>` (loads `tools/<tool>.md`)  |
| **Agent** | specialized worker (implementer, reviewer) | internally by tools as a subagent (`agents/<name>`) |

## Source directories

```text
src/
├── SKILL.md      # Router: tool catalog + dispatch, no tool contents
├── tools/        # one .md per tool → dist/<harness>/effective-flow/tools/<name>.md
├── agents/       # one .md per agent → dist/<harness>/agents/<name>
└── shared/       # include fragments, embedded via `include` fence
```

- **`src/tools/<name>.md`**: A tool is only callable via `/effective-flow <name>` if its name is
  in exactly one group of `TOOL_GROUPS` in `build.mjs` (see
  [`build-system.md`](build-system.md)). Unlisted tools (e.g. `apply-plan`, `apply-review`,
  `apply-issues`) are **internal**: built but not visible in the router catalog; `apply` loads
  the matching internal instruction on demand depending on the detected source.
- **`src/agents/<name>.md`**: Agents are **not** `/effective-flow` tools. Workflow tools call
  them internally as subagents. The frontmatter carries per-harness configuration under the keys
  `claude:` and `codex:` (model, color, tools/sandbox).
- **`src/shared/<name>.md`**: Include fragments embedded via the ` ```include ` fence into tools
  and agents (e.g. `language-rules`, `task-tracking`, `skill-discovery`, `goal-completion`,
  `worktree-integration`).

## Two-harness split

The build generates two independent outputs from the same source:

| Harness     | Target                        | Agent format                                                                                                                                                                    |
| ----------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `dist/claude/effective-flow/` | standalone `.md` subagents under `dist/claude/agents/`, namespace-prefixed `effective-flow-<name>.md` (Claude Code does not automatically discover agents nested inside skills) |
| Codex       | `dist/codex/effective-flow/`  | `.toml` agents nested under `dist/codex/effective-flow/agents/<name>.toml`                                                                                                      |

Both outputs carry the same version stamp (see
[`release-und-installation.md`](release-und-installation.md)); a build guard prevents version
drift between the harnesses.

## Repo structure at a glance

```text
effective-flow/                        (Repo)
├── src/                      # Sources (see above)
├── docs/                     # Project documentation
│   ├── plan/                 # Implementation plans (ISO-date slug, see plan-konventionen.md)
│   ├── user-guide/           # End-user documentation (delivered to main)
│   └── developer-guide/      # this document and its neighbors (develop only)
├── dist/                     # Generated, gitignored
│   ├── claude/effective-flow/         # Router SKILL.md + tools/*.md, agents separately under dist/claude/agents/
│   └── codex/effective-flow/          # Router SKILL.md + tools/*.md + agents/*.toml
├── build.mjs                 # Build script (see build-system.md)
├── install-skill.sh          # Installation from release or local checkout
└── local-link.sh             # Build + symlink for development
```

## Further reading

- [`build-system.md`](build-system.md) – build flow, placeholder syntax, guards.
- [`plan-konventionen.md`](plan-konventionen.md) – naming scheme and lifecycle of the plan files.
- [`release-und-installation.md`](release-und-installation.md) – versioning and installation.
- [`AGENTS.md`](../../AGENTS.md) – canonical agent behavior rules, skill discovery, commit and
  no-AI-attribution rules.
