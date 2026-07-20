# Architecture

This document describes how Effective Flow is built as a repository: the source-to-dist model,
the router with lazy loading, and the split across the two harnesses Claude Code and Codex.
Behavior rules for agents (language rules, commit conventions, no-AI-attribution, plan-file
conventions) live canonically in [`AGENTS.md`](../../AGENTS.md) – this document references them
instead of duplicating them.

## Source-to-dist model

Effective Flow is **not** a runtime product but a build: `build.mjs` reads the Markdown sources
under `src/` and generates two harness-native direct-install targets plus one portable manager
target under `dist/`.

- Only `src/` is edited. `dist/` is generated and gitignored – changes there are lost on the
  next build.
- Source and delivery live on **two branches**: `develop` (source, no `dist/`) and the default
  branch `main` (carries only the portable `effective-flow/` payload **and** the consumer-facing docs –
  `README.md` + `docs/user-guide/` –, but **not** the developer docs `docs/developer-guide/`;
  written mechanically by the release workflow). For details see
  [Release and installation](release-and-installation.md#source-and-delivery-branch).
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

| Type       | Description                                  | Invocation                                                   |
| ---------- | -------------------------------------------- | ------------------------------------------------------------ |
| **Tool**   | Workflow or utility instruction              | `/effective-flow <tool>` (loads `tools/<tool>.md`)           |
| **Worker** | specialized contract (implementer, reviewer) | internally by tools as a native or built-in/general subagent |

## Source directories

```text
src/
├── SKILL.md      # Router: tool catalog + dispatch, no tool contents
├── tools/        # one .md per tool → every consumer target's tools/<name>.md
├── agents/       # one .md contract per worker → native sidecars + portable resources
└── shared/       # include fragments, embedded via `include` fence
```

- **`src/tools/<name>.md`**: A tool is only callable via `/effective-flow <name>` if its name is
  in exactly one group of `TOOL_GROUPS` in `build.mjs` (see
  [`build-system.md`](build-system.md)). Unlisted tools (e.g. `apply-plan`, `apply-review`,
  `apply-issues`) are **internal**: built but not visible in the router catalog; `apply` loads
  the matching internal instruction on demand depending on the detected source.
- **`src/agents/<name>.md`**: Workers are **not** `/effective-flow` tools. Workflow tools call
  them internally as subagents. The frontmatter carries native per-harness configuration under
  `claude:` and `codex:`; the body is also the single contract rendered into the portable target.
- **`src/shared/<name>.md`**: Include fragments embedded via the ` ```include ` fence into tools
  and agents (e.g. `language-rules`, `task-tracking`, `skill-discovery`, `goal-completion`,
  `worktree-integration`).

## Three consumer targets

The build generates three independent outputs from the same source:

| Consumer           | Skill target                    | Worker resolution                                                                                                                                          |
| ------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct Claude Code | `dist/claude/effective-flow/`   | native `.md` agents under `dist/claude/agents/effective-flow-<name>.md`, installed into `$CLAUDE_HOME/agents`                                              |
| Direct Codex       | `dist/codex/effective-flow/`    | native `.toml` agents under `dist/codex/agents/effective-flow-<name>.toml`, installed into `$CODEX_HOME/agents`                                            |
| DALO / Skills CLI  | `dist/portable/effective-flow/` | bundled `workers/effective-flow-<name>.md` contracts, loaded one at a time and delegated through the harness's built-in general-purpose subagent mechanism |

All outputs use the same `effective-flow-<name>` worker namespace and carry the same version
stamp. Rendered-reference guards ensure every native reference has an exact sidecar and every
portable reference has an exact worker contract. Portable instructions never request those
identifiers as custom roles: if built-in delegation is unavailable, they fail clearly instead
of pretending that a worker ran.

The release archive retains all three targets. The default branch publishes only the portable
skill at `effective-flow/`; native sidecars are release-archive implementation details of the
direct installer, not competing skill-manager candidates.

## Repo structure at a glance

```text
effective-flow/                        (Repo)
├── src/                      # Sources (see above)
├── docs/                     # Project documentation
│   ├── plan/                 # Implementation plans (ISO-date slug, see plan-conventions.md)
│   ├── user-guide/           # End-user documentation (delivered to main)
│   └── developer-guide/      # this document and its neighbors (develop only)
├── dist/                     # Generated, gitignored
│   ├── claude/               # native skill + agents/effective-flow-*.md
│   ├── codex/                # native skill + agents/effective-flow-*.toml
│   └── portable/effective-flow/ # manager skill + workers/effective-flow-*.md
├── build.mjs                 # Build script (see build-system.md)
├── install-skill.sh          # Installation from release or local checkout
└── local-link.sh             # Build + symlink for development
```

## Further reading

- [`build-system.md`](build-system.md) – build flow, placeholder syntax, guards.
- [`plan-conventions.md`](plan-conventions.md) – naming scheme and lifecycle of the plan files.
- [`release-and-installation.md`](release-and-installation.md) – versioning and installation.
- [`AGENTS.md`](../../AGENTS.md) – canonical agent behavior rules, skill discovery, commit and
  no-AI-attribution rules.
