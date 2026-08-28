# AGENTS.md

This file provides guidance to any coding agent working with code in this repository.

**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md

## What this repo is

Effective Flow is a **source-to-dist build** for a single Software-Engineering skill set (`/effective-flow <tool>`) that ships to Claude Code and Codex from one source tree. `build.mjs` transforms Markdown sources under `src/` plus a small dependency-free Node.js runtime into two harness-native direct-install targets and one harness-neutral portable manager target under `dist/`.

**You edit `src/`, never `dist/`.** `dist/` is generated and gitignored.

## Commands

```sh
node build.mjs           # build native + portable targets into dist/ (also: pnpm build)
pnpm format              # format with oxfmt (Markdown + JS)
pnpm agent:check         # oxfmt --check (CI-style, no writes)
pnpm test                # run the unit test suite (node:test)
pnpm test:distribution   # isolated build/archive/delivery smoke suite
./install-skill.sh       # maintainer install/update of the portable build through DALO
./install-skill.sh local # maintainer build + copy of the current checkout
./local-link.sh          # developer build + symlink of the current checkout
```

Package manager is **pnpm**; the root `package.json` `packageManager` field is the source of truth for the pinned version. Node.js 22 or newer is required for the build and the shipped runtime scripts. Correctness rests on three layers: a `node:test` unit suite (`pnpm test`) covering pure transforms and installers, build-time guards during `node build.mjs`, and `pnpm test:distribution` for isolated archive/delivery layouts. After editing distribution sources, run the same sequence CI runs: `pnpm agent:check`, `pnpm test`, `node build.mjs`, then `pnpm test:distribution`.

## Build architecture

The source layout **mirrors the output**, and the directory decides the category:

- `src/SKILL.md` — the thin **router** (tool catalog + dispatch rule). Deliberately minimal: it only lists tools and lazy-loads the one `tools/<tool>.md` that was invoked. Never pre-load all tools.
- `src/tools/<name>.md` → `effective-flow/tools/<name>.md`. A tool is exposed via `/effective-flow <name>` only if its name is in the `EXPOSED_TOOLS` array in `build.mjs`. Tools not in that array (e.g. `apply-plan`, `apply-review`, `apply-issues`) are **internal** — built but not listed in the router; `apply` loads the right one on demand.
- `src/agents/<name>.md` → subagents. Agents are **not** `/effective-flow` tools; workflow tools call them internally as subagents. Frontmatter carries per-harness config under `claude:` and `codex:` keys. Every Claude agent requires both `model` and `effort`; Codex agents carry `model` and `model_reasoning_effort` alongside their harness-specific tools and sandbox settings.
- `src/shared/<name>.md` — include fragments, embedded via an `include` fence.
- `src/scripts/*.mjs` — dependency-free Node.js runtime resources copied byte-for-byte into `effective-flow/scripts/` for every target, but only if listed in `RUNTIME_SCRIPT_FILES` in `build.mjs`; an unregistered script is silently never shipped. Each one is a pair following the same split: `<name>.mjs` is a thin JSON CLI entry point over `<name>-core.mjs`, which keeps the deterministic logic importable and testable.

The build emits three consumer targets:

- **Native Claude** (`dist/claude/`): skill plus registered agent sidecars in `dist/claude/agents/effective-flow-<name>.md`.
- **Native Codex** (`dist/codex/`): skill plus registered agent sidecars in `dist/codex/agents/effective-flow-<name>.toml`.
- **Portable managers** (`dist/portable/effective-flow/`): one harness-neutral skill with bundled `workers/effective-flow-<name>.md` contracts. It delegates through built-in/general subagents and does not rely on managers installing native agent sidecars.

The release archive contains all three for release verification and maintenance; it is not a supported end-user installation interface. The machine-managed default/delivery branch publishes only the contents of `dist/portable/effective-flow/` at `effective-flow/`, so DALO and Skills CLI discover exactly one candidate and consume the built payload directly. `install-skill.sh local` and `local-link.sh` are checkout utilities that use only the two native targets; `install-skill.sh` with no arguments instead drives DALO to install and update the portable build, mirroring the DALO/Skills CLI consumer path rather than deploying native output.

### Placeholder / directive syntax in sources

The build resolves these — do not hand-write their expansions:

| Syntax                                      | Meaning                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `{{SKILL:X}}`                               | → `/effective-flow X` (exposed) or `` `tools/X.md` `` (internal)                                          |
| `{{AGENT:X}}`                               | → `` `effective-flow-X` `` in every target; native registered role or portable worker-contract identifier |
| `{{VERSION}}`                               | release-please manifest version + git short hash                                                          |
| ` ```include ` fence (name on its own line) | inlines `src/shared/<name>.md`                                                                            |
| ` ```ask ` fence                            | conditional user question (Claude `AskUserQuestion` block / Codex free-text)                              |

`include` and `ask` fence interiors are kept verbatim against the oxfmt formatter (`embeddedLanguageFormatting: off`).

Source frontmatter carries **no** `name` or `type` field — name and category come from the file's path. Descriptions must be strictly quoted (a build guard enforces this).

### Adding a tool or agent

1. Create `src/tools/<name>.md` (or `src/agents/<name>.md`). For an agent, select one of the repository's role profiles in its native frontmatter: implementers and reviewers use the quality tier (Claude `opus`/`xhigh`, Codex `gpt-5.6-sol`/`high`); support roles use the economical tier (Claude `sonnet`/`medium`, Codex `gpt-5.6-luna`/`medium`). The agent source is the canonical assignment—do not duplicate an exhaustive per-agent matrix in documentation.
2. To expose a tool via `/effective-flow`, add it to exactly one intent group in `TOOL_GROUPS` in `build.mjs`; `EXPOSED_TOOLS` is derived from `TOOL_GROUPS` (array/group order = catalog order in the router). An exposed tool also needs a `catalogHint` frontmatter field (strictly double-quoted, a single usage-oriented line). **Renaming an exposed tool ships a deprecated forwarding alias for the old name, not a breaking rename.** Add an entry to `DEPRECATED_TOOL_ALIASES` in `build.mjs` (old name → new name) and a matching `src/tools/<old-name>.md` that emits one deprecation notice naming the new invocation and then reads and follows the new tool's source verbatim, with the arguments unchanged. The alias stays out of `TOOL_GROUPS`, so it is reachable by name only and never appears in the router catalog, its frontmatter description, or `argument-hint`; a generated `{{DEPRECATED_ALIASES}}` router clause is what still routes the old name instead of printing the catalog. Remove the alias only in the next deliberate major release, which is the change that legitimately carries the breaking marker this convention otherwise avoids.
3. Run `node build.mjs`. Guards will fail if an exposed tool has no source, if an `include` target is missing, if a Claude agent omits `effort` or uses an unsupported value, if a Codex `sandbox_mode` is unsupported, if an exposed tool is missing or has an unquoted `catalogHint`, or if a tool is missing from or duplicated across `TOOL_GROUPS`.
4. If the new tool delegates to a worker or does its own analysis/exploration, embed the eager
   `delegation-mandate` include (see "Delegation" below). A new Claude `src/agents/<name>.md`
   lists `Agent, Task` in `claude.tools` **only if** its `claude.tools` also lists `Write` or
   `Edit` — a role that produces changes; that grant is what makes the read-only sub-agent
   fan-out fulfillable without weakening an observation role's own guarantee. An **observation
   role** that lists neither `Write` nor `Edit` stays without `Agent, Task` and does not delegate
   at all, regardless of `Bash`: `Bash` gives incidental write capability but withholding the
   sub-agent grant from such a role is defence in depth, not the role's read-only guarantee — for
   a role whose tool list genuinely cannot write, withholding the grant is that whole guarantee.
   Never use the parenthesised form `Agent(<type>)` to try to restrict it instead: a probe agent
   declared `tools: Read, Glob, Grep, Agent(Explore)` successfully spawned a `general-purpose`
   subagent, so the parenthesised form is read as an unrestricted grant, not a type filter, and
   must never be used to fake a read-only allowlist.
5. A new user-invocable tool opts into the next-steps contract deliberately, either way: add a
   ` ```lazy-include ` fence for `next-steps` plus at least one row for the tool's name in
   `src/shared/next-steps.md`'s edge table, or add the tool to the exemption set in `build.mjs`
   with a one-line reason. The build derives the emitting set as
   `count(src/tools/*.md) − |exemptions|` and fails if a non-exempt tool carries no fence, a fence
   with no row, or a row for a tool without a fence — there is no silent third option that
   inherits "no recommendation". Any delegation site whose result returns to its caller (rather
   than handing the rest of the run to the receiving tool) carries the literal payload line
   `Next steps: suppressed`, so the caller emits the block once at the end instead of twice.

## Delegation

Invoking an Effective Flow tool **is** the user's standing request for internal delegation
through an available sub-agent mechanism; a host default that discourages unrequested sub-agents
does not apply inside a tool run. Delegating to a named worker role is **mandatory**; delegating
an analysis, exploration, or research step is the **default**, with a narrow exception for a
step whose whole cost is smaller than briefing a worker. A worker whose tool list carries a
sub-agent tool (`Agent, Task`) may fan out **read-only** analysis sub-agents but never
re-delegates its own assignment and never delegates a write; a worker whose tool list carries no
sub-agent tool does not delegate at all, and that limit rests on the tool list, not on prose.
Inline execution stays legitimate only as a **disclosed** fallback — a harness without a
sub-agent mechanism, or a runtime-declined delegation — never a silent one. The full contract is
[`src/shared/delegation-mandate.md`](src/shared/delegation-mandate.md), eagerly included in every
delegating tool and in every `src/agents/*.md` worker. Today eleven workers whose `claude.tools`
lists `Write` or `Edit` also carry `Agent, Task`; the five observation roles that list neither
(`frontend-reviewer`, `nodejs-reviewer`, `rust-reviewer`, `generic-product-reviewer`,
`code-validator`) do not. For the four reviewers among those five, whose tool list genuinely
cannot write, that omission is their entire read-only guarantee; `code-validator` also lists
`Bash`, so withholding the grant there is defence in depth rather than the source of its
read-only property — it only keeps the easy path to a write-capable child closed. It covers
worker roles and analysis fan-out only; delegation from one workflow to another (`apply-plan`,
`merge-gate` → `iterate`) keeps that tool's own mechanics, including its interactive/gated path. A
tool can be on both sides of that line: `merge-gate` carries the eager include for its worker-role
delegations while its handoff to `iterate` stays exempt.

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
block in the Effective Flow configuration / Projektsetup ADR (`enabled`, `include`, `exclude`, plus per-agent
`agents.<name>` and per-tool `tools.<name>`); `exclude` and `enabled: false` are hard
off-switches. See `src/shared/skill-discovery.md`, `src/shared/config-migration.md` (defaults)
and `/effective-flow setup` (wizard).

**Layered ownership contract.** Recommended central skills are not mere advice: where a central
skill is the _declared domain owner_ for the task at hand and fully covers it, its guidance is
**authoritative** and the Effective Flow source carries **no second copy** of that playbook —
only scope/output/lifecycle constraints plus a minimal generic fallback for when the skill is
absent. Effective Flow keeps ownership of orchestration (routing, plan/report state, finding
IDs, tracker, agent selection, worktrees, commits, delivery, harness transform, config). The
per-skill classification (delegate / route-when-relevant / no-overlap) lives in
[`docs/developer-guide/skill-ownership.json`](docs/developer-guide/skill-ownership.json), with
the human-readable explanation in
[`docs/developer-guide/skill-ownership.md`](docs/developer-guide/skill-ownership.md). **When
adding or expanding a tool, agent, or shared include, run the ownership check:** does it carry a
second copy of a centrally owned playbook? If so, delegate to the skill, keep only a minimal
fallback, and update the concrete consumer relationship in both files. Normal builds reconcile
only Effective Flow’s own relationship declarations, recommendations, and relevance-gate owners;
they neither synchronize the complete upstream catalog nor enforce the manifest’s informational
review revision. Use `pnpm audit:skill-ownership -- <local-skills-directory>` as an optional,
non-blocking maintainer aid and review its candidates manually.

## Versioning

Release versioning is managed by release-please. The source of truth for the
current released version is `.release-please-manifest.json`; do not bump versions
manually in feature or fix commits. Conventional Commit messages drive the next
release PR, changelog entries, tags, GitHub releases, and release asset upload.
The build stamps `<manifest-version> (<git-short-hash>)` into all three routers and a
**version-drift guard** fails the build if native Claude, native Codex, and portable outputs disagree.

A tool rename shipped as a deprecated alias (see "Adding a tool or agent") carries no `!` and no
`BREAKING CHANGE:` footer — it is additive, not a break. If an earlier, already-published commit on
the release branch was mistakenly marked breaking for a change that is not actually one, pin the
version forward instead of rewriting that commit: add a `Release-As: <version>` footer to the
commit body of the correcting change. The footer is a one-shot override that release-please
resolves before it counts breaking commits and that cleans itself up after the release; prefer it
over setting `release-as` in the release-please configuration, which stays in effect until removed
and would otherwise silently freeze every later version too.

## Workflow actions are pinned to commits

Every `uses:` in `.github/workflows/` references a 40-character commit SHA with a trailing
`# <version>` comment — `actions/checkout@3d3c42e… # v7`, never `actions/checkout@v7`. A tag is
movable, so an unpinned action lets upstream change what runs. That matters for every step here,
not only the ones that take a credential: the release job holds the delivery and release App
private keys, and any action in that job can reach them.

Resolve the SHA from the tag ref rather than copying it, and dereference annotated tags to their
commit — `pnpm/action-setup` and `googleapis/release-please-action` publish annotated tags, and
pinning the tag object yields a reference that does not resolve at run time. Renovate maintains
the pins and rewrites digest and comment together; it writes the upstream tag's own precision
(`# v9`, not `# v9.0.0`), so do not tighten anything that reads the comment.

A test in `test/workflow-contracts.test.mjs` scans the workflow directory and enforces this, so a
newly added workflow cannot slip past. It is the **only** assertion that matches an action's ref:
every other one matches the action without it, which is what keeps a Renovate digest bump from
touching any test — and from becoming an occasion to weaken a neighbouring guard while making CI
green.

## Language rules

Target projects configure language in the project-setup ADR (see
`src/shared/language-rules.md`). `language.project` defaults to `en`; optional `de`/`en`
overrides cover source prose, user and technical documentation, local Effective Flow artifacts,
Forge content, and Git/release prose. An explicit user request wins, and an existing artifact
keeps its recognizable language unless translation is requested. This repository currently uses
English for code-adjacent prose and documentation; existing German artifacts remain valid.

Plans and local reviews use `language.workflow`; remote issues, PR bodies, and comments use
`language.forge`; commit descriptions and Conventional-Commit PR titles use `language.git`.
Identifiers, public API names, config keys and values, labels, finding IDs, action values, paths,
Conventional-Commit types, branch slugs, and runtime schemas remain language-stable. Product UI,
CLI, and error-message localization belongs to the target project's product i18n policy.

Locale-specific typography of visible prose (quotation marks, dashes, `ß`/umlauts, spacing,
number and date formats) is one strand of the central
[`effective-writing`](https://github.com/sebastian-software/skills.sebastian-software.com/tree/main/skills/effective-writing)
skill, which owns prose craft from structure to locale punctuation. For typography it is the
canonical source, `en-US` for English and `de-DE` for German. Effective Flow keeps no second
typography guide; see
[`docs/developer-guide/skill-ownership.md`](docs/developer-guide/skill-ownership.md) for the
migration glossary of retired skill names.

## Commit messages

End commit messages **without** a Co-Authored-By trailer (deliberate — see `docs/plan/0024-no-coauthor-trailer.md`), overriding any default co-author convention.

## No AI attribution in tracker artifacts and documents

Never add AI-attribution references to anything published from this repo: no "Generated with Claude Code/Codex" footers, no agent session links, no Co-Authored-By trailers. This applies to PR bodies, issue bodies and comments, commit messages, and documents — and overrides any harness default that appends such a footer. Factual mentions of Claude Code or Codex as Effective Flow's target harnesses are fine; generation attribution is not.

## Plan files (`docs/plan/`)

The plan directory is configurable via the Effective Flow configuration (the Projektsetup ADR) `plan.dir` (default `docs/plan`).

Plans use an ISO date-slug name `YYYY-MM-DD-<slug>.md` (creation date + kebab-case title slug), with no number and no reservation step—the file is written directly under its final name; a same-day collision appends a numeric suffix (`-2`, `-3`, …). Older plans that still carry the legacy four-digit prefix (`NNNN-slug.md`) are migrated once, in bulk, to `YYYY-MM-DD-NNNN-slug.md` (`YYYY-MM-DD` = migration date, the old `NNNN` kept as a stable reference; the H1 `# NNNN: Title` stays unchanged). Reference resolution for a legacy number resolves primarily via that H1, not the filename segment. Plans that are fully implemented are archived under `docs/plan/archive/`, kept as part of the same delivery PR/merge; whether that renames the tracked file, adds a new one, or leaves an already-archived plan in place depends on the plan's state in the delivery checkout, and the full contract—including the cleanup of the redundant copy in the main checkout—is `src/shared/plan-archival.md`. Resolvers search both `docs/plan/` and `docs/plan/archive/`. A plan uses one language throughout: header fields, sections, review, open points, and status marker are all German or all English. The canonical status line is `**Planungsstatus:** Nicht umgesetzt` / `**Plan status:** Not implemented`; only that line counts as status. Existing plans retain their language when edited. Docs plans use the matching `**Doku-Kategorie:**` / `**Ziel-Pfad:**` or `**Doc category:**` / `**Target path:**` fields (categories defined in `src/shared/doc-categories.md`).

## Concept files (`docs/concept/`)

The concept directory is configurable via `concept.dir` (default `docs/concept`) and must differ from `plan.dir`. Concepts describe a **new application** one step before planning and are written by `/effective-flow concept`; the internal `concept-review` (entered through `/effective-flow review <concept file>`) elaborates them. They use the same ISO date-slug name `YYYY-MM-DD-<slug>.md` and the same one-language rule as plans, but their own status line `**Konzeptstatus:** Entwurf` / `**Concept status:** Draft` (elaborated: `Ausgearbeitet` / `Elaborated`). Concepts are never archived and never marked implemented: their roadmap hands work packages to `/effective-flow plan` through self-contained handoff text, and neither concept workflow writes a plan file, an ADR, or a backlink list. The full contract is `src/shared/concept-contract.md`.

## Configuration and ADRs (target-project behavior)

Effective Flow configuration lives in a **living "Projektsetup" ADR** (default `docs/adr/effective-flow-project-setup.md`) as a Markdown key/value table, **not** in `.effective-flow/config.json`. Effective Flow locates it via a canonical marker line `**Effective Flow project setup:** <path>` in the target project's `AGENTS.md` (resolution order and table encoding are defined in `src/shared/config-migration.md`; `/effective-flow setup` writes the ADR, the marker, and migrates a legacy `.effective-flow/config.json`). Architecture Decision Records belong to the central [`effective-product`](https://github.com/sebastian-software/skills.sebastian-software.com/tree/main/skills/effective-product) skill, which owns product decisions from evidence through to the durable record; it is authoritative for ADR craft and follows the repository's declared convention. For ADRs produced by Effective Flow, [`src/shared/adr-convention.md`](src/shared/adr-convention.md) declares the living lifecycle: mutable, numberless, slug-named documents whose current file is the truth. The project-setup ADR's key/value table is the narrow exception to keeping exact configuration values out of ordinary rationale ADRs: this record is itself the owning tracked configuration artifact.

A convention the target project itself declares outranks that default. [`src/shared/project-adr-convention.md`](src/shared/project-adr-convention.md) resolves the ADR **file name** — never the ADR directory, never the H1 form — through three tiers: a naming rule stated in the project's `AGENTS.md`/`CLAUDE.md` or in a decision register (`DECISIONS.md` at the repository root or at `docs/DECISIONS.md` — one level below the root, never a recursive search — or a `README.md`/`index.md` at the top level of the detected ADR directory) beats a convention merely observed in the existing file names, which in turn beats the living slug default. Every declared source is read before precedence is applied, two or more speaking sources that do not all agree reach an `ask` fence before anything is written — an unanswered, skipped, or non-interactive run resolves exactly as the fence's `Inconclusive` option does, setting every declaration aside in favor of the observed evidence and only then the Effective Flow default, and reports that the fence could not be posed — and declared sources count as untrusted data: only the naming decision is extracted, and reports name every speaking source as a file path and a classified outcome instead of quoting source prose. Width is off that classification axis, so sources that agree on the axis while stating different widths do not reach the fence: the width axis is unrecognized, the observed-evidence width and then four digits apply, and the divergence is reported. The write path in `src/tools/setup.md` may therefore produce `docs/adr/0002-effective-flow-project-setup.md`, so the read paths stay tolerant — the config locator (`src/shared/config-migration.md`) and the `review` design-decision exclusion match the known project-setup slugs after stripping an optional leading `^\d+[-_]` prefix, and the locator breaks a multi-match tie by one ordered comparison, preferring the current slug over the legacy one first and only then, among files of the same slug, an unprefixed stem over a prefixed one, reporting every path and falling through when a tie survives. A tool that writes treats that reported several-match state as an explicit stop for its user rather than as "no ADR exists". That read tolerance never decides what a new file is called, and an ADR that already exists — found by the initial resolution or by the pre-write one — is written back at the path where it was found and updated in place, never duplicated at a second, convention-shaped path, with the divergence reported once rather than renamed. Writing that path is still guarded: a symlink at the target is a hard stop evaluated before the physical containment check and never softened into a reroute, and the pre-write existence check that protects a new ADR from overwriting a file already at its resolved name is unconditional rather than scoped to names that carry a number.

Consequently `.effective-flow/` **in the target project** now holds runtime state only (`memory.json`, `cache.json`, `review/`, `.worktrees/`, wisdom files) and is **fully gitignored**. Legacy `.sf-plugin/` dirs are migrated once, non-destructively (`src/shared/effective-flow-dir-migration.md`); `/effective-flow cleanup` inventories whatever remains in a given checkout and deletes it only after a dry run and explicit confirmation. Issue-tracker labels use the `effective-flow-` prefix; the predecessor `firmo-` prefix is still recognised as equivalent when reading, listing, and deduplicating labels (one generation of read backward-compatibility), while the older `sf-` prefix is migrated once (on first remote access) to `effective-flow-` and not recognised on an ongoing basis. New labels are created with `effective-flow-` only. The tracker target itself is configurable: besides `local` and `remote`, `tracker.mode: external` points issue work at a project-management tool named by `tracker.externalTool` (with the free-text `tracker.externalToolHint` for connection discovery), for which Effective Flow ships no product-specific adapter and fails closed rather than falling back. The label vocabulary above keeps its exact strings in every target, pull requests stay on the Git forge behind `origin`, and plan files stay committed under `plan.dir`; the full contract is `src/shared/tracker-target.md`.
