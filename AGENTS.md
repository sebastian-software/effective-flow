# AGENTS.md

This file provides guidance to any coding agent working with code in this repository.

## What this repo is

Firmo is a **source-to-dist build** for a single Software-Engineering skill set (`/firmo <tool>`) that ships to **two harnesses** — Claude Code and Codex — from one source tree. There is no runtime application here: `build.mjs` transforms Markdown sources under `src/` into two harness-specific skill directories under `dist/`.

**You edit `src/`, never `dist/`.** `dist/` is generated and gitignored.

## Commands

```sh
node build.mjs        # build both harnesses into dist/ (also: pnpm build)
pnpm format           # format with oxfmt (Markdown + JS)
pnpm agent:check      # oxfmt --check (CI-style, no writes)
./local-update.sh     # build + copy skill into ~/.claude/skills and ~/.agents/skills
./local-link.sh       # same but symlinks dist/ (for development)
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
| `{{VERSION}}`                               | version + git short hash                                                     |
| ` ```include ` fence (name on its own line) | inlines `src/shared/<name>.md`                                               |
| ` ```ask ` fence                            | conditional user question (Claude `AskUserQuestion` block / Codex free-text) |

`include` and `ask` fence interiors are kept verbatim against the oxfmt formatter (`embeddedLanguageFormatting: off`).

Source frontmatter carries **no** `name` or `type` field — name and category come from the file's path. Descriptions must be strictly quoted (a build guard enforces this).

### Adding a tool or agent

1. Create `src/tools/<name>.md` (or `src/agents/<name>.md`).
2. To expose a tool via `/firmo`, add its name to `EXPOSED_TOOLS` in `build.mjs` (array order = catalog order in the router).
3. Run `node build.mjs`. Guards will fail if an exposed tool has no source, if an `include` target is missing, or if a Codex `sandbox_mode` is unsupported.

## Versioning

`version.txt` holds the single source of truth (currently bumped via `/firmo version` semantics). The build stamps `<version> (<git-short-hash>)` into both routers and a **version-drift guard** fails the build if Claude and Codex outputs disagree.

## Language rules

Unless the user asks otherwise (see `src/shared/language-rules.md`):

- Code, identifiers, tests, and commit messages are **English**.
- Documentation (including files under `docs/` and this repo's Markdown prose) is **German**; continue the existing language of a file you edit. (This file, AGENTS.md, deliberately stays in English as a cross-harness agent instruction.)

## Commit messages

End commit messages **without** a Co-Authored-By trailer (deliberate — see `docs/plan/0024-no-coauthor-trailer.md`), overriding any default co-author convention.

## No AI attribution in tracker artifacts and documents

Never add AI-attribution references to anything published from this repo: no "Generated with Claude Code/Codex" footers, no agent session links, no Co-Authored-By trailers. This applies to PR bodies, issue bodies and comments, commit messages, and documents — and overrides any harness default that appends such a footer. Factual mentions of Claude Code or Codex as Firmo's target harnesses are fine; generation attribution is not.

## Plan files (`docs/plan/`)

Plans use a four-digit gapless prefix `NNNN-slug.md`, each number used exactly once. The canonical status line is `**Planungsstatus:** Nicht umgesetzt` / `**Plan status:** Not implemented` (one language per file; the `**Empfohlener Workflow:**` line stays German either way). Only that canonical line counts as status — ignore other occurrences of the words in prose. Docs plans additionally carry `**Doku-Kategorie:**` and `**Ziel-Pfad:**` (categories defined in `src/shared/doc-categories.md`).

## Target-project runtime state (not this repo)

The tools read/write project-local state under `.firmo/` **in the target project** (`config.json` tracked, `memory.json`/`cache.json`/`review/` gitignored). Legacy `.sf-plugin/` dirs are migrated once, non-destructively (`src/shared/firmo-dir-migration.md`). Note: this repo still contains a legacy `.sf-plugin/` of its own review history. Issue-tracker labels use the `firmo-` prefix; the old `sf-` prefix is still recognised as equivalent when reading, listing, and deduplicating labels (permanent read backward-compatibility), but new labels are created with `firmo-` only.
