# AGENTS.md

Guidance for coding agents in this repository.

**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md

**Use the Effective Flow skill** (`/effective-flow <tool>`; Codex: `$effective-flow <tool>`) for all work in this repository. Its contracts — delegation, skill discovery, language, plans and concepts, configuration, commit and PR rules — apply as shipped and are not repeated here; their source is `src/shared/`. The installed skill is the last release; `./local-link.sh` runs the current checkout instead.

**Source branch:** `origin/develop` — all source work happens on `develop`. `main` is the release-written delivery artifact without a source tree and the repository default branch: never branch from it or open a pull request against it (branch model: project-setup ADR).

**Sister project:** [skills](https://github.com/sebastian-software/skills.sebastian-software.com) develops the central `effective-*` domain skills (`effective-writing`, `effective-product`, `effective-engineering`, …). Effective Flow is the glue code around them: it owns orchestration (routing, plan and review state, tracker, agent selection, worktrees, delivery); domain craft stays in those skills. A playbook from there belongs there, not in `src/` (see "Skill discovery").

## What this repo is

A source-to-dist build: `build.mjs` turns Markdown under `src/` plus a dependency-free Node.js runtime into one skill set (`/effective-flow <tool>`) for Claude Code and Codex — two harness-native targets and one harness-neutral portable target under `dist/`. **Edit `src/`, never `dist/`** (generated, gitignored).

## Commands

```sh
node build.mjs           # build all targets into dist/ (also: pnpm build)
pnpm format              # format with oxfmt (Markdown + JS)
pnpm agent:check         # oxfmt --check, no writes
pnpm test                # node:test unit suite
pnpm test:distribution   # isolated build/archive/delivery smoke suite
./install-skill.sh       # maintainer: install/update the portable build through DALO
./install-skill.sh local # maintainer: build + copy this checkout
./local-link.sh          # developer: build + symlink this checkout
```

pnpm, pinned by the root `package.json` `packageManager` field; Node.js 22 or newer for build and shipped scripts. Correctness layers: unit tests (pure transforms, installers), build-time guards in `node build.mjs`, and the distribution suite (isolated archive/delivery layouts). After editing distribution sources run CI's order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.

**Behavioural evals** are a fourth, deliberately manual layer: suites `merge-gate`, `iterate` (fail-closed input parsing), and `next-steps` (plan-aware final recommendations) live in `evals/<tool>/`, run via `pnpm eval <tool> <command>` on the shared instrument `evals/_scaffold/`. Each `evals/<tool>/suite.config.mjs` declares seeds, evaluator, tracker stub, overlay policy and sandbox namespace and is hashed into that suite's instrument, since each binding decides what a run sees; `evals/<tool>/scenario-registry.mjs` is read by no run and stays outside it, so a new scenario costs only its own evidence. Evidence in `evals/<tool>/results/` is recorded by hand in fresh agent sessions; neither `pnpm test` (archive structure only) nor CI runs a model. `pnpm eval <tool> verify` (read-only, no lock) answers whether evidence still matches the tree; CI's `Behavioural eval evidence` step reports all three suites on every PR and enforces `--mode strict` on the release PR. Editing a source a suite loads therefore owes a re-recorded round of that suite before the next release, not the next merge; scenario counts and recording requirements belong to each suite's README. Round lifecycle: [`evals/merge-gate/README.md`](evals/merge-gate/README.md); suite differences: [`evals/iterate/README.md`](evals/iterate/README.md), [`evals/next-steps/README.md`](evals/next-steps/README.md).

## Build architecture

The source layout mirrors the output; the directory decides the category:

- `src/SKILL.md` — the thin router (catalog + dispatch rule); lazy-loads only the invoked `tools/<tool>.md`, never all tools.
- `src/tools/<name>.md` → `effective-flow/tools/<name>.md`; exposed via `/effective-flow <name>` only if listed in `EXPOSED_TOOLS` (`build.mjs`). Unlisted tools (`apply-plan`, `apply-review`, `apply-issues`, …) are internal, built but not routed; `apply` loads them on demand.
- `src/agents/<name>.md` → subagents, not tools; workflows call them. Frontmatter per harness: `claude:` requires `model` and `effort`; `codex:` carries `model`, `model_reasoning_effort`, tools and sandbox settings.
- `src/shared/<name>.md` — include fragments, embedded via an `include` fence.
- `src/scripts/*.mjs` — runtime copied byte-for-byte to `effective-flow/scripts/` in every target, **only if listed in `RUNTIME_SCRIPT_FILES`** (`build.mjs`); an unlisted script is silently never shipped. Pattern: thin JSON CLI `<name>.mjs` over importable, testable `<name>-core.mjs` (`config-resolve`, `delegation-envelope`, `delivery-selection`, `diff-baseline`). The remote tracker adds `remote-tracker-{shared,decomposition,github,forgejo,ledger}-core.mjs`, layered so none imports its core back. Pilot measurement: CLI `pilot-measurement.mjs`, `-core.mjs` (guarded local lifecycle and evidence), `-protocol.mjs` (immutable protocol, projections, digest).

Targets:

- **Native Claude** `dist/claude/`: skill, agent sidecars `agents/effective-flow-<name>.md`, five generated `-fast` implementer sidecars, native-agent inventory.
- **Native Codex** `dist/codex/`: skill, agent sidecars `agents/effective-flow-<name>.toml`, native-agent inventory; Fast is an explicit model and reasoning-effort override on the base worker reference, not another sidecar.
- **Portable** `dist/portable/effective-flow/`: one harness-neutral skill with bundled `workers/effective-flow-<name>.md` contracts, delegating through built-in subagents without native sidecars.

The release archive holds all three for verification and maintenance only; it is no end-user install interface. The delivery branch publishes only `dist/portable/effective-flow/` at `effective-flow/`, so DALO and Skills CLI discover exactly one candidate. `install-skill.sh local` and `local-link.sh` use only the native targets; `install-skill.sh` without arguments mirrors the DALO/Skills CLI consumer path.

### Execution profiles (Fast field pilot)

Policy: `src/shared/execution-profiles.md` (Quality is the default; Fast only for a bounded first implementation attempt). Configuration: `src/shared/setup-execution-profiles.md` (strict, default-off `executionProfiles.fast.enabled`, written only by Guided setup block 10). Measured-run records: `src/shared/pilot-measurement-workflow.md`. Adopting workflows are `build` (Phase 2) and `refactor` (Phase 3), each carrying the five inline `{{AGENT_PROFILE:X:fast}}` tokens; portable output stays Quality-only without native profile metadata. The build renders the five Claude Fast sidecars, Codex per-spawn `model`/`reasoning_effort` overrides and strict native-agent inventories, and copies the three pilot helper modules to every target. Pilot state is private runtime data under `<RUNTIME_STATE_ROOT>/.effective-flow/model-tiering-pilot/`, never tracked configuration or eval evidence. Guard mechanics: [`build-system.md`](docs/developer-guide/build-system.md); configuration ownership: [`configuration.md`](docs/developer-guide/configuration.md); measurement contract: [`model-tiering-pilot-protocol.md`](docs/developer-guide/model-tiering-pilot-protocol.md); rationale: [`risk-aware-model-tiering-pilot-policy.md`](docs/adr/risk-aware-model-tiering-pilot-policy.md), [`native-execution-profile-representation.md`](docs/adr/native-execution-profile-representation.md).

### Placeholder / directive syntax in sources

The build resolves `{{FLOW}}`, `{{SKILL:X}}`, `{{AGENT:X}}`, `{{AGENT_PROFILE:X:fast}}`, `{{BUILD_TARGET}}`, `{{VERSION}}`, `{{TOOL_LIST}}` and the ` ```include `, ` ```ask ` and ` ```lazy-include ` fences — never hand-write their expansions. Rows, replacements, fence semantics and the verbatim-fence rule are canonical in [`build-system.md`](docs/developer-guide/build-system.md), "Placeholder and directive syntax"; no copy here. Source frontmatter has **no** `name` or `type` field (the path decides), and descriptions are strictly quoted (guarded).

### Adding a tool or agent

Procedure (sources, agent role profiles, `TOOL_GROUPS`/`catalogHint`, next-steps contract, which guard catches what): [`build-system.md`](docs/developer-guide/build-system.md), "Adding a tool or agent". Two rules are canonical here:

- **Renaming an exposed tool ships a deprecated forwarding alias, not a breaking rename:** a `DEPRECATED_TOOL_ALIASES` entry (old → new) in `build.mjs` plus `src/tools/<old-name>.md`, which emits one deprecation notice naming the new invocation, then reads and follows the new tool's source verbatim with unchanged arguments. It stays out of `TOOL_GROUPS`: reachable by name only, absent from the router catalog, its description and `argument-hint`. Remove it only in the next deliberate major release.
- **Every `src/tools/*.md`, internal ones included, needs a `CONTEXT_BUDGET_LINES` entry** in `build.mjs`: its built line count plus **up to** ten lines of headroom (most carry less). Take the count from the `Always-loaded core (lines/budget)` report of `node build.mjs`, not `wc -l` (the guard counts `split('\n').length`, one more on a newline-terminated file). It is a measured backlog, not a target: moving an eager include behind a ` ```lazy-include ` pointer lowers the entries it touches.

New tools and agents must also satisfy "Delegation" below.

### Writing prompt text

Points 1–4 govern prompt text under `src/` and this file; point 5 governs `test/*.test.mjs`. Mechanics: [`build-system.md`](docs/developer-guide/build-system.md), "Writing prompt text".

1. **Length is paid on every run:** a tool's eager core on every run of it, an eager `src/shared` fragment on every including host, `AGENTS.md` in every session.
2. **State a contract once, in its owning fragment;** never keep a second copy.
3. **Put rare edge cases behind a ` ```lazy-include ` at their decision point,** only where "Progressive disclosure beyond the router" allows it.
4. **Prefer one precise sentence to its history;** a reason that constrains the next edit is not history.
5. **A test that reads source prose names the invariant it protects.**

## Delegation

The contract is [`src/shared/delegation-mandate.md`](src/shared/delegation-mandate.md), eager in every delegating tool and every `src/agents/*.md` worker. Every `src/agents/<name>.md` omits `Agent` and `Task` from `claude.tools`, writing or not: withholding them is the only enforceable Claude leaf boundary, since neither prose nor a parenthesised `Agent(<type>)` constrains a child once the tool is granted. Codex and portable workers carry the same leaf contract in their instructions instead. Workflow-to-workflow delegation (`apply-plan`, `merge-gate` → `iterate`) keeps the receiving tool's mechanics; `merge-gate` carries the eager include for its worker roles while its `iterate` handoff stays exempt.

## Skill discovery

Implementer, analysis and planning tools plus all agents embed `src/shared/skill-discovery.md` via ` ```include `; every agent's `claude.tools` includes `Skill` (Codex uses its own discovery). There is no static `skills:` frontmatter: recommendations are a short `## Recommended skills` prose section per agent or tool (`A › B` = prefer A, else B). Projects tune discovery through the `skills` configuration block (`src/shared/config-migration.md`, `/effective-flow setup`).

**Layered ownership contract.** A central skill that is the declared domain owner and fully covers the task is authoritative; the source keeps no second copy of its playbook, only scope/output/lifecycle constraints plus a minimal fallback for when the skill is absent. Effective Flow owns orchestration (routing, plan/report state, finding IDs, tracker, agent selection, worktrees, commits, delivery, harness transform, config). **When adding or expanding a tool, agent, or shared include, run the ownership check:** if it carries a second copy of a centrally owned playbook, delegate to the skill, keep only a minimal fallback, and update the consumer relationship in the manifest and the guide. Classification (delegate / route-when-relevant / no-overlap), the two build-enforced halves and the optional upstream audit: [`skill-ownership.md`](docs/developer-guide/skill-ownership.md), source of truth [`skill-ownership.json`](docs/developer-guide/skill-ownership.json).

## Versioning

release-please manages releases; `.release-please-manifest.json` holds the current version. **Never bump a version by hand:** Conventional Commits drive the release PR, changelog, tags, GitHub releases and asset upload. A rename shipped as a deprecated alias carries no `!` and no `BREAKING CHANGE:` footer. A published commit mistakenly marked breaking is pinned forward with a `Release-As: <version>` footer in the correcting commit's body — never rewritten, never `release-as` in the release-please configuration. Mechanics: [`release-and-installation.md`](docs/developer-guide/release-and-installation.md), "Versioning with release-please", "Version stamp and drift guard", "A mistakenly breaking commit is pinned forward".

## Workflow actions are pinned to commits

Every `uses:` in `.github/workflows/` pins a 40-character commit SHA with a trailing `# <version>` comment (`actions/checkout@3d3c42e… # v7`, never `@v7`): a tag is movable, and any action in the release job can reach the delivery and release App private keys. Resolve the SHA from the tag ref and dereference annotated tags to their commit (`pnpm/action-setup`, `googleapis/release-please-action`); a tag-object SHA does not resolve at run time. Renovate rewrites digest and comment together at the upstream tag's precision (`# v9`, not `# v9.0.0`), so tighten nothing that reads the comment. `test/workflow-contracts.test.mjs` enforces this for every workflow and is the **only** assertion matching an action's ref; all others match without it, so a digest bump touches no test and is never an occasion to weaken a neighbouring guard.

## No AI attribution

Nothing published from this repo — commits, PR and issue bodies, comments, documents — carries AI attribution: no Co-Authored-By trailer (deliberate, see `docs/plan/archive/2026-07-16-0024-no-coauthor-trailer.md`), no "Generated with Claude Code/Codex" footer, no agent session link. This also binds work outside an Effective Flow run and overrides any harness default. Factual mentions of Claude Code or Codex as target harnesses are fine.

## README ownership

Edit `README.md.src` on `develop`, run `mise install --locked` and `mise run readme:write`, commit the generated `README.md`, and verify with `mise run readme:check`. The release stages that output, rewrites developer-guide links and adds the delivery notice. README sources and tooling stay on `develop`, never `main`.
