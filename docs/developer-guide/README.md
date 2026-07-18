# Developer Guide

Technical entry point for Effective Flow – for developers who contribute to the project and for
software architects who want to assess how Effective Flow is built and whether it fits
technically.

Effective Flow is a **source-to-dist build**: `build.mjs` transforms the Markdown sources under
`src/` into two harness-specific skill directories under `dist/` (Claude Code and Codex). There
is no runtime application – you edit `src/`, never `dist/`.

## Reading order

1. [Architecture](architecture.md) – repository layout: source-to-dist model, the thin router
   with lazy loading, and the split across the two harnesses.
2. [Build system](build-system.md) – how `build.mjs` transforms `src/` into `dist/`: invocation,
   placeholder syntax, build guards, and the unit test suite.
3. [Configuration](configuration.md) – the Effective Flow configuration in the living
   project-setup ADR, with the developer-oriented overview of all config blocks.
4. [Plan conventions](plan-conventions.md) – naming scheme, canonical status markers, and
   archiving of the plan files under `<plan.dir>/`.
5. [Skill ownership](skill-ownership.md) – the boundary between Effective Flow orchestration
   and central skill expertise (layered contract), including the ownership inventory over the
   current skillset.
6. [Release and installation](release-and-installation.md) – versioning via release-please,
   publishing, and installation of the built skill.
7. [Terminology](terminology.md) – binding DE→EN glossary for the language migration (English
   as default, German still permitted).

## See also

- [`AGENTS.md`](../../AGENTS.md) – canonical conventions for adding tools and agents, plus the
  binding language, commit, and versioning rules.
- [User Guide](../user-guide/README.md) – using Effective Flow (installation, tool reference,
  configuration, troubleshooting).
