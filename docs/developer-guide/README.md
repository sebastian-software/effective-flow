# Developer Guide

Technical entry point for Effective Flow – for developers who contribute to the project and for
software architects who want to assess how Effective Flow is built and whether it fits
technically.

Effective Flow is a **source-to-dist build**: `build.mjs` transforms the Markdown sources under
`src/` into native Claude/Codex targets and one portable manager target under `dist/`. There
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
   and central skill expertise (layered contract), including the loosely coupled inventory of
   actual Effective Flow relationships.
6. [Release and installation](release-and-installation.md) – versioning via release-please,
   publishing, and installation of the built skill.
7. [Terminology](terminology.md) – binding German/English glossary for the complete bilingual
   artifact contracts; the configured project and surface languages select new output while
   existing artifact languages remain valid.

## See also

- [`AGENTS.md`](../../AGENTS.md) – the always-loaded contract, canonical for the **rules**:
  language, delegation, commit and no-AI-attribution rules, the deprecated forwarding alias a tool
  rename ships, the `CONTEXT_BUDGET_LINES` entry every tool needs, and no hand-bumped versions.
  The **mechanics** those rules point at are canonical here — [`build-system.md`](build-system.md)
  for placeholder syntax and for adding a tool or agent,
  [`release-and-installation.md`](release-and-installation.md) for release-please, and
  [`skill-ownership.md`](skill-ownership.md) for the ownership-check **mechanics** and the
  per-skill classification.
- [User Guide](../user-guide/README.md) – using Effective Flow (installation, tool reference,
  configuration, troubleshooting).
- [Architecture and consistency review](../review/2026-08-31-architecture-and-consistency-review.md)
  – point-in-time audit of the repository at `3b44300` against the central skills; it is kept as
  the record it was, and its implementation-status table tracks which findings have since landed.
