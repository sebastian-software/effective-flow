# AGENTS.md

This file provides guidance to any coding agent working with code in this repository.

## What this repo is

Firmo is a **source-to-dist build** for a single Software-Engineering skill set (`/firmo <tool>`) that ships to **two harnesses** — Claude Code and Codex — from one source tree. There is no runtime application here: `build.mjs` transforms Markdown sources under `src/` into two harness-specific skill directories under `dist/`.

**You edit `src/`, never `dist/`.** `dist/` is generated and gitignored.

## Commands

```sh
node build.mjs           # build both harnesses into dist/ (also: pnpm build)
pnpm format              # format with oxfmt (Markdown + JS)
pnpm agent:check         # oxfmt --check (CI-style, no writes)
./install-skill.sh       # install the latest GitHub release asset
./install-skill.sh local # build + copy the current checkout
./local-link.sh          # build + symlink dist/ (for development)
```

Package manager is **pnpm** (`packageManager: pnpm@11.9.0`). There is no test suite; correctness is enforced by build-time guards (see below) — after editing sources, `node build.mjs` is the check that must pass.

## Build architecture

The source layout **mirrors the output**, and the directory decides the category:

- `src/SKILL.md` — the thin **router** (tool catalog + dispatch rule). Deliberately minimal: it only lists tools and lazy-loads the one `tools/<tool>.md` that was invoked. Never pre-load all tools.
- `src/tools/<name>.md` → `firmo/tools/<name>.md`. A tool is exposed via `/firmo <name>` only if its name is in the `EXPOSED_TOOLS` array in `build.mjs`. Tools not in that array (e.g. `apply-plan`, `apply-review`, `apply-issues`) are **internal** — built but not listed in the router; `apply` loads the right one on demand.
- `src/agents/<name>.md` → subagents. Agents are **not** `/firmo` tools; workflow tools call them internally as subagents. Frontmatter carries per-harness config under `claude:` and `codex:` keys (model, tools, sandbox, etc.).
- `src/shared/<name>.md` — include fragments, embedded via an `include` fence.

The build emits per harness:

- **Claude** (`dist/claude/`): agents ship separately as registered subagents in `dist/claude/agents/`, namespaced `firmo-<name>.md` (Claude Code does not auto-discover skill-nested agents).
- **Codex** (`dist/codex/`): agents ship nested as `agents/<name>.toml`.

### Placeholder / directive syntax in sources

The build resolves these — do not hand-write their expansions:

| Syntax                                      | Meaning                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `{{SKILL:X}}`                               | → `/firmo X` (exposed) or `` `tools/X.md` `` (internal)                      |
| `{{AGENT:X}}`                               | → `` `X` `` (Codex) or `` `firmo-X` `` (Claude)                              |
| `{{VERSION}}`                               | release-please manifest version + git short hash                             |
| ` ```include ` fence (name on its own line) | inlines `src/shared/<name>.md`                                               |
| ` ```ask ` fence                            | conditional user question (Claude `AskUserQuestion` block / Codex free-text) |

`include` and `ask` fence interiors are kept verbatim against the oxfmt formatter (`embeddedLanguageFormatting: off`).

Source frontmatter carries **no** `name` or `type` field — name and category come from the file's path. Descriptions must be strictly quoted (a build guard enforces this).

### Adding a tool or agent

1. Create `src/tools/<name>.md` (or `src/agents/<name>.md`).
2. To expose a tool via `/firmo`, add it to exactly one intent group in `TOOL_GROUPS` in `build.mjs`; `EXPOSED_TOOLS` is derived from `TOOL_GROUPS` (array/group order = catalog order in the router). An exposed tool also needs a `catalogHint` frontmatter field (strictly double-quoted, a single usage-oriented line).
3. Run `node build.mjs`. Guards will fail if an exposed tool has no source, if an `include` target is missing, if a Codex `sandbox_mode` is unsupported, if an exposed tool is missing or has an unquoted `catalogHint`, or if a tool is missing from or duplicated across `TOOL_GROUPS`.

## Skill discovery

Umsetzer- and analysis/planning tools plus all agents embed the shared `skill-discovery`
include (via a ` ```include ` fence): before implementing, planning, or reviewing they scan
the host's available skills and apply the useful ones. The mechanism is fully
harness-neutral — on Claude via the `Skill` tool (added to every agent's `claude.tools`),
on Codex via its own skill discovery.

There is **no** static `skills:` frontmatter preload anymore. Per-agent and per-tool
skill recommendations live as a short `## Empfohlene Skills` prose section in the agent or
tool source (honoured by the include as "prefer if available"; a fallback group is written
`A › B`, meaning "prefer A, else B"). A project tunes this at runtime through the optional `skills`
block in the Firmo configuration / Projektsetup ADR (`enabled`, `include`, `exclude`, plus per-agent
`agents.<name>` and per-tool `tools.<name>`); `exclude` and `enabled: false` are hard
off-switches. See `src/shared/skill-discovery.md`, `src/shared/config-migration.md` (defaults)
and `/firmo setup` (wizard).

## Versioning

Release versioning is managed by release-please. The source of truth for the
current released version is `.release-please-manifest.json`; do not bump versions
manually in feature or fix commits. Conventional Commit messages drive the next
release PR, changelog entries, tags, GitHub releases, and release asset upload.
The build stamps `<manifest-version> (<git-short-hash>)` into both routers and a
**version-drift guard** fails the build if Claude and Codex outputs disagree.

## Language rules

Unless the user asks otherwise (see `src/shared/language-rules.md`):

- Code, identifiers, tests, and commit messages are **English**.
- Documentation (including files under `docs/` and this repo's Markdown prose) is **German**; continue the existing language of a file you edit. (This file, AGENTS.md, deliberately stays in English as a cross-harness agent instruction.)

## Commit messages

End commit messages **without** a Co-Authored-By trailer (deliberate — see `docs/plan/0024-no-coauthor-trailer.md`), overriding any default co-author convention.

## No AI attribution in tracker artifacts and documents

Never add AI-attribution references to anything published from this repo: no "Generated with Claude Code/Codex" footers, no agent session links, no Co-Authored-By trailers. This applies to PR bodies, issue bodies and comments, commit messages, and documents — and overrides any harness default that appends such a footer. Factual mentions of Claude Code or Codex as Firmo's target harnesses are fine; generation attribution is not.

## Plan files (`docs/plan/`)

The plan directory is configurable via the Firmo configuration (the Projektsetup ADR) `plan.dir` (default `docs/plan`).

Plans use an ISO date-slug name `YYYY-MM-DD-<slug>.md` (creation date + kebab-case title slug), with no number and no reservation step — the file is written directly under its final name; a same-day collision appends a numeric suffix (`-2`, `-3`, …). Older plans that still carry the legacy four-digit prefix (`NNNN-slug.md`) are migrated once, in bulk, to `YYYY-MM-DD-NNNN-slug.md` (`YYYY-MM-DD` = migration date, the old `NNNN` kept as a stable reference; the H1 `# NNNN: Title` stays unchanged). Reference resolution for a legacy number resolves primarily via that H1, not the filename segment. Plans that are fully implemented move to `docs/plan/archive/`, kept as part of the same delivery PR/merge; resolvers search both `docs/plan/` and `docs/plan/archive/`. The canonical status line is `**Planungsstatus:** Nicht umgesetzt` / `**Plan status:** Not implemented` (one language per file; the `**Empfohlener Workflow:**` line stays German either way). Only that canonical line counts as status — ignore other occurrences of the words in prose. Docs plans additionally carry `**Doku-Kategorie:**` and `**Ziel-Pfad:**` (categories defined in `src/shared/doc-categories.md`).

## Configuration and ADRs (target-project behavior)

Firmo configuration lives in a **living "Projektsetup" ADR** (default `docs/adr/firmo-project-setup.md`) as a Markdown key/value table, **not** in `.firmo/config.json`. Firmo locates it via a canonical marker line `**Firmo project setup:** <path>` in the target project's `AGENTS.md` (resolution order and table encoding are defined in `src/shared/config-migration.md`; `/firmo setup` writes the ADR, the marker, and migrates a legacy `.firmo/config.json`). ADRs are treated as **living** documents (mutable, numberless, slug-named — see `src/shared/adr-convention.md`), a deliberate divergence from the host `decision-records` skill.

Consequently `.firmo/` **in the target project** now holds runtime state only (`memory.json`, `cache.json`, `review/`, `.worktrees/`, wisdom files) and is **fully gitignored**. Legacy `.sf-plugin/` dirs are migrated once, non-destructively (`src/shared/firmo-dir-migration.md`); this repo still contains a legacy `.sf-plugin/` of its own review history. Issue-tracker labels use the `firmo-` prefix; the old `sf-` prefix is still recognised as equivalent when reading, listing, and deduplicating labels (permanent read backward-compatibility), but new labels are created with `firmo-` only.
