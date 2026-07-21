# 0033: Gemini CLI Platform Target

**Plan status:** Not implemented
**Empfohlener Workflow:** Feature (`/effective-flow build`)

## Goal

Effective Flow gains Gemini CLI as a fourth build artifact: an installable Gemini CLI extension
is added alongside the native targets for Claude Code and Codex and the portable manager target.
All four artifacts are generated from the same source-to-dist pipeline; Gemini does not introduce
a separate set of workflow instructions.

The scope covers Gemini CLI exclusively. Gemini Web, Google AI Studio, and IDE-specific Gemini
Code Assist interfaces are not part of this initiative.

## Verified Current State

### Sources and Build

- `src/SKILL.md` is the thin router. It publishes the grouped tool catalog and loads only the
  specifically invoked `tools/<tool>.md`.
- `src/tools/` currently contains 17 publicly invocable tools derived from `TOOL_GROUPS` and 6
  internal tools. The build does not duplicate these counts; it derives them from `TOOL_GROUPS`
  and source discovery.
- `src/agents/` currently contains 15 agent contracts. Their count is also derived from the
  available source files.
- `src/shared/` contains eagerly embedded fragments and fragments delivered through
  `lazy-include`.
- `src/scripts/` contains the dependency-free runtime resources `remote-tracker.mjs` and
  `remote-tracker-core.mjs`.
- `build-lib.mjs` provides the pure parsers, renderers, and guards; `build.mjs` handles file-system
  I/O, source discovery, artifact generation, the build summary, and guards.
- `test/build-lib.test.mjs` tests the pure transformations. Additional repository-wide tests
  verify execution and documentation contracts.
- The build currently generates `dist/claude/`, `dist/codex/`, and `dist/portable/` under
  `dist.tmp/` first. Only after all guards pass is the complete tree atomically swapped into
  `dist/`; if an error occurs, the previous `dist/` remains intact.
- The semantic release version comes from `.release-please-manifest.json`. The router stamp adds
  the short Git hash; a guard prevents version drift between targets.
- `pnpm test:distribution` checks the build, release archive, installer, and the portable delivery
  tree staged on `main`.

### Existing Delivery

- `develop` is the source and release-please branch.
- The default branch, `main`, is contractually reserved for exactly one portable
  `effective-flow/` manager candidate plus consumer documentation. It contains no native wrappers
  and must not receive a second `skills/effective-flow/` candidate.
- The release archive contains the native Claude and Codex artifacts and the portable target.
- `install-skill.sh`, `local-common.sh`, and `local-link.sh` support the existing native Claude
  Code and Codex installation and local development workflows. They will not be extended into a
  Gemini installer.

## Binding Gemini CLI Contracts

This plan is based on the official documentation for Gemini CLI v0.39.1:

- [Extension reference](https://github.com/google-gemini/gemini-cli/blob/v0.39.1/docs/extensions/reference.md)
- [Extension publishing](https://github.com/google-gemini/gemini-cli/blob/v0.39.1/docs/extensions/releasing.md)
- [Custom commands](https://github.com/google-gemini/gemini-cli/blob/v0.39.1/docs/cli/custom-commands.md)
- [Agent Skills](https://github.com/google-gemini/gemini-cli/blob/v0.39.1/docs/cli/creating-skills.md)
- [Subagents](https://github.com/google-gemini/gemini-cli/blob/v0.39.1/docs/core/subagents.md)

Immediately before implementation, these five sources must be checked again against the current
Gemini CLI version. This applies especially to subagents because their contract is still in
preview in v0.39.1. If the current contract conflicts with the manifest, command, skill, or agent
structure defined here, implementation stops with a specific incompatibility message; it neither
silently omits agents nor claims unverified platform parity.

## Architecture Decisions

### A Fourth Target in the Same Pipeline

`build.mjs` gains `dist.tmp/gemini/effective-flow/` as a fourth target. After the successful
atomic swap, the extension is located under `dist/gemini/effective-flow/`. The meaning and
installation contracts of the existing three targets do not change.

The Gemini structure is:

```text
dist/gemini/effective-flow/
├── gemini-extension.json
├── commands/
│   └── effective-flow/
│       └── <exposed-tool>.toml
├── skills/
│   └── effective-flow/
│       ├── SKILL.md
│       ├── tools/
│       │   └── <exposed-or-internal-tool>.md
│       ├── shared/
│       │   └── <lazy-fragment>.md
│       └── scripts/
│           ├── remote-tracker.mjs
│           └── remote-tracker-core.mjs
└── agents/
    └── effective-flow-<agent>.md
```

`dist/` remains generated and gitignored. The implementation does not edit files there as
sources.

### Router, Commands, and Arguments

- `skills/effective-flow/SKILL.md` remains the only Gemini Agent Skill and preserves the thin
  router's progressive-disclosure model.
- All source tools—public and internal—are delivered under `skills/effective-flow/tools/`.
  Internal tools remain files loaded exclusively by the router.
- Exactly one `commands/effective-flow/<tool>.toml` file is generated for every public tool
  derived from `TOOL_GROUPS`. The path-based namespace produces the intended
  `/effective-flow:<tool>` command.
- Internal tools do not receive command files. The build derives the expected command set from
  `EXPOSED_TOOLS` and checks for missing, additional, or colliding names.
- Every command file contains `description` and a `prompt` safely serialized with the existing
  `tomlString` approach. The prompt delegates precisely to the router and named tool; Gemini
  replaces its own `{{args}}` token with the user's arguments.
- `{{args}}` is explicitly protected during the Effective Flow transformation and remains
  byte-for-byte intact in the generated TOML file. Empty arguments are valid.
- No `!{...}` construct is added. Command generation therefore does not cause the extension to
  execute shell commands in advance.
- According to Gemini CLI v0.39.1, extension commands have the lowest priority. If an extension
  command collides with a project or user command of the same name, Gemini also exposes the
  extension command under a fallback composed of the extension name, a period, and the previous
  command name. For the extension `effective-flow`, the fallback derived from the normal command
  `/effective-flow:plan` is therefore `/effective-flow.effective-flow:plan`; in general, the
  fallback is `/effective-flow.effective-flow:<tool>`. The fixed `effective-flow` subdirectory
  minimizes conflicts. Documentation and tests show both the normal conflict-free name and this
  exact fallback and treat the actual `/help` display as authoritative.

### Rendering the Source Syntax

The Gemini renderer is added to `build-lib.mjs` as a pure transformation and is called by
`build.mjs` with the same known tool and agent sets as the existing renderers. It handles the
source syntax as follows:

| Source syntax                      | Gemini output                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `{{SKILL:X}}` for a public tool    | `/effective-flow:X`                                                              |
| `{{SKILL:X}}` for an internal tool | `` `tools/X.md` ``                                                               |
| `{{AGENT:X}}`                      | `` `effective-flow-X` ``                                                         |
| `{{VERSION}}`                      | Release-please version plus short Git hash in router or text context             |
| `include`                          | Eagerly embedded content from `src/shared/X.md`                                  |
| `lazy-include`                     | Gemini-compatible load pointer to `shared/X.md`; fragment delivered exactly once |
| `ask`                              | Conditional text-based question with preserved options and conditions            |

The router's internal generator placeholders for the catalog, invocation, and worker resolution
are also replaced completely before writing. The final guard must not find unresolved Effective
Flow placeholders or directives in any Gemini Markdown or TOML file. Gemini's `{{args}}` is the
only Mustache sequence intentionally retained in command prompts.

### Agents and Platform-Specific Metadata

- Every contract under `src/agents/*.md` gains an explicit `gemini:` block. It contains the
  Gemini tool names approved for that agent and only those additional fields supported by the
  subagent specification revalidated before implementation.
- The renderer reads only this `gemini:` block. It derives neither model or tool values nor
  sandbox settings from `claude:` or `codex:`.
- If no Gemini model is specified, the field is deliberately omitted and Gemini uses its
  documented default. No Claude or Codex model name is adopted as a fallback.
- A sandbox field that does not exist in Gemini is not simulated. Unknown Gemini fields, tool
  names, or incomplete required metadata fail the build with the file path and agent name.
- Each agent source produces exactly one preview subagent,
  `agents/effective-flow-<agent>.md`. Its YAML frontmatter declares the same
  `effective-flow-<agent>` name, the cleaned description, and the explicit Gemini values; its
  body comes from the shared agent contract.

### Manifest and Deliberately Omitted Features

`gemini-extension.json` is generated deterministically with `JSON.stringify` and contains exactly
the fields required for the selected MVP: the name `effective-flow`, the semantic version from
`.release-please-manifest.json`, and the extension description.

There is no `GEMINI.md` and no `contextFileName`: always-loaded extension context would undermine
the thin router and lazy loading. Without a concrete product requirement, the manifest also does
not include MCP servers, settings, policies, themes, hooks, or `excludeTools`.

## Delivery Design

### Dedicated `gemini` Branch

The default branch, `main`, remains the sole portable manager candidate. The Gemini extension is
published instead on a dedicated, machine-managed `gemini` branch. Its repository root is an
exact, installable copy of the contents of `dist/gemini/effective-flow/`, so
`gemini-extension.json` is located directly at the branch root.

User installation is:

```sh
gemini extensions install https://github.com/sebastian-software/effective-flow --ref gemini
```

Local development uses the built target directly:

```sh
gemini extensions link dist/gemini/effective-flow
```

`install-skill.sh`, `local-common.sh`, and `local-link.sh` remain limited to Claude Code and Codex.
They do not invoke Gemini, and a missing `gemini` binary does not affect the normal build.

### Staging and Release Workflow

- `scripts/stage-delivery.mjs` gains an explicit Gemini mode alongside the unchanged `main`
  staging function. This mode clears only the verified Gemini branch worktree and copies the
  contents of `dist/gemini/effective-flow/` to its root. The portable `stageDelivery` function and
  its single-candidate guard remain unchanged.
- `.github/workflows/release.yml` continues to build and validate on `develop`. For a version
  generated by release-please, it additionally creates a worktree for the pre-created,
  machine-managed `gemini` branch, stages it through the Gemini mode, validates it statically,
  writes a new non-forced delivery commit, and pushes it to `gemini` alongside the archive and
  `main` delivery.
- The workflow then verifies that the remote branch points to exactly this commit and that its
  root matches the built extension tree. A missing branch, a divergent tree, or a second
  extension root makes release delivery fail visibly.
- `scripts/distribution-smoke.mjs` gains a Gemini layout and Gemini delivery mode. The offline
  smoke test checks the fourth target and staged branch root; the archive smoke test additionally
  expects the Gemini target. The existing `main` smoke test continues to expect exactly one
  portable candidate and no target wrappers.
- The release documentation describes the one-time creation of the `gemini` branch; afterward,
  only the release workflow advances it. There is no force-push.

## Source Files Affected by the Future Implementation

| File or area                                        | Planned change                                                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `build-lib.mjs`                                     | Add pure Gemini reference, body, command, and agent metadata transformations and static guards                                   |
| `build.mjs`                                         | Add the fourth target, source discovery usage, directories, manifest, commands, skills, agents, summary, guards, and atomic swap |
| `test/build-lib.test.mjs`                           | Add unit tests for Gemini rendering, `{{args}}` preservation, TOML escaping, metadata, and error cases                           |
| Other existing `test/*.test.mjs`, by responsibility | Extend repository-wide build and contract checks to four targets                                                                 |
| `src/agents/*.md`                                   | Add explicit `gemini:` metadata to all agents found through source discovery                                                     |
| `src/SKILL.md`, `src/tools/*.md`, `src/shared/*.md` | Change only if shared wording needs a verified Gemini-neutral note; do not create a Gemini copy of the contracts                 |
| `AGENTS.md`                                         | Document the build architecture, target rules, and agent frontmatter for Gemini                                                  |
| `scripts/stage-delivery.mjs`                        | Add a separate Gemini branch staging mode without weakening the `main` contract                                                  |
| `scripts/distribution-smoke.mjs`                    | Add Gemini build, archive, and branch-root checks                                                                                |
| `.github/workflows/release.yml`                     | Add validated delivery to the `gemini` branch                                                                                    |
| `package.json`                                      | Update the two-harness description to the current multi-target delivery model; retain existing check scripts                     |
| `README.md`                                         | Document Gemini CLI as a third native runtime target, installation through `--ref gemini`, and local linking                     |
| `docs/user-guide/README.md`                         | Add a Gemini entry point and navigation to installation, usage, and troubleshooting                                              |
| `docs/user-guide/getting-started.md`                | Add Gemini installation, command namespace, and first use                                                                        |
| `docs/user-guide/troubleshooting.md`                | Add command conflicts with the exact period fallback, preview subagents, and branch and installation diagnostics                 |
| `docs/user-guide/glossary.md`                       | Extend the harness term and invocation syntax with Gemini CLI, `/effective-flow:<tool>`, and the conflict fallback               |
| `docs/developer-guide/README.md`                    | Extend the architecture overview with Gemini                                                                                     |
| `docs/developer-guide/architecture.md`              | Document the fourth build target and separate branch delivery                                                                    |
| `docs/developer-guide/build-system.md`              | Document Gemini renderers, directives, guards, metadata, and validation                                                          |
| `docs/developer-guide/release-and-installation.md`  | Document the four-target archive and the lifecycle, installation, and validation of the dedicated `gemini` branch                |
| `docs/developer-guide/skill-ownership.md`           | Extend orchestration ownership from “Claude/Codex transformation” to Gemini and multi-target transformation                      |
| `docs/developer-guide/skill-ownership.json`         | Reconcile with the guide mechanically; edit only if this actually changes a structured relationship or classification            |

`dist/**` is build output only and not a list of source files to edit directly.

## Implementation Steps

1. Recheck the five official Gemini sources and record the supported manifest, command, skill,
   and preview subagent fields. Stop before the first product-code step if they are incompatible.
2. Add the Gemini harness to `build-lib.mjs`: perform pure transformations for references, `ask`,
   lazy-load pointers, command prompt and TOML serialization, and explicit agent metadata. Extend
   unit tests with positive and negative cases first.
3. Add validated `gemini:` blocks to all `src/agents/*.md` files. Derive the tool set for each
   agent from its functional contract and validate it against the official Gemini tool list.
4. Add `DIST_GEMINI` and the extension directories under `dist.tmp/` to `build.mjs`. Generate the
   manifest, exactly one router skill, all tool resources, derived lazy fragments, runtime
   scripts, commands for public tools only, and one subagent per agent source.
5. Extend the existing guards and build summary to Gemini: derive counts from `TOOL_GROUPS`, tool
   files, agent files, lazy fragments, and the runtime script list instead of maintaining new
   fixed numbers.
6. Extend staging, the distribution smoke test, and the release workflow with the dedicated
   `gemini` branch; continue testing the unchanged single-candidate contract for `main`.
7. Update the README, user guide, developer guide, and `AGENTS.md` for the validated target
   architecture and the two native Gemini commands for installation and local linking.
8. Run the complete validation and, when Gemini CLI is available locally, the native smoke test.

## Edge Cases and Error Behavior

- **Gemini CLI is unavailable locally:** All static checks and the normal build remain mandatory
  and can still pass. Only the native smoke test is skipped, with a documented reason.
- **The preview schema has changed:** The build neither discards nor guesses metadata.
  Implementation stops before delivery and identifies the incompatible contract.
- **Command name conflict:** The build prevents internal duplicates. When a collision occurs, the
  project or user command wins the normal name; Gemini CLI v0.39.1 exposes the extension command
  with the extension name and a period prepended. For this extension, `/effective-flow:plan`
  becomes `/effective-flow.effective-flow:plan`. Static documentation checks protect this exact
  form; a native smoke test confirms it through `/help` in an isolated generated collision rather
  than claiming it has been practically tested without a running Gemini CLI.
- **TOML special characters or multiline prompts:** The existing basic-string serializer is used
  and tested with quotation marks, backslashes, line breaks, and `{{args}}`; there are no
  unprotected triple quotation marks.
- **Empty command arguments:** The prompt remains valid and passes an empty argument set to the
  explicitly named tool.
- **Agent metadata is missing or unknown:** The build fails with the source path and field instead
  of adopting Claude or Codex values or omitting an agent.
- **A lazy fragment or runtime script is missing:** The build fails before the atomic swap; the
  previous `dist/` remains fully intact.
- **The Gemini branch is missing or contains unrelated files:** The release step fails before the
  push. The verified stager may change only its separate worktree and generates an exact extension
  root.
- **Default-branch regression risk:** The existing delivery smoke test continues to prove that
  exactly one portable candidate exists under `effective-flow/`; Gemini is neither copied to
  `main` nor managed by the Claude and Codex shell installers.

## Acceptance Criteria

- [ ] `node build.mjs` additionally generates the structure defined above under
      `dist/gemini/effective-flow/` without changing the existing Claude, Codex, or portable
      layouts.
- [ ] `gemini-extension.json` is valid JSON and contains exactly the name `effective-flow`, the
      semantic release-please version, and the description; unnecessary manifest features,
      `GEMINI.md`, and `contextFileName` are absent.
- [ ] The command set exactly matches the public tools derived from `TOOL_GROUPS`; internal tools
      have no command file. Every file is located under
      `commands/effective-flow/<tool>.toml` and produces `/effective-flow:<tool>`.
- [ ] Every command TOML file is statically valid, has `prompt` and `description`, contains exactly
      the intended tool name, and preserves Gemini's `{{args}}`; no artifact contains `!{...}`.
- [ ] `skills/effective-flow/` contains the thin router, all public and internal tools, all derived
      lazy fragments, and the two runtime resources discovered from `src/scripts/`.
- [ ] All Effective Flow source directives and generator placeholders are fully rendered in
      Gemini artifacts. `{{args}}` remains only where a Gemini command accepts arguments.
- [ ] Exactly one `agents/effective-flow-<agent>.md` exists for every discovered agent source,
      with valid YAML frontmatter, a matching namespaced name, a description, and only explicit
      `gemini:` values.
- [ ] No Gemini agent adopts model, tool, or sandbox values from `claude:` or `codex:`; unknown
      fields and tools produce a clear build error.
- [ ] The version stamp is consistent across Claude, Codex, portable, and Gemini; the manifest
      uses the semantic version without a Git hash.
- [ ] Build and distribution guards prove complete lazy resources, runtime scripts, resolved
      agent references, and the absence of foreign harness parameters for all four targets.
- [ ] After staging, the `main` branch still contains exactly one portable `effective-flow/`
      candidate plus consumer documentation and no Gemini extension.
- [ ] The machine-managed `gemini` branch contains exactly the built extension tree at its root
      and can be installed with
      `gemini extensions install https://github.com/sebastian-software/effective-flow --ref gemini`.
- [ ] Local development with `gemini extensions link dist/gemini/effective-flow` is documented;
      `install-skill.sh`, `local-common.sh`, and `local-link.sh` remain specific to Claude and
      Codex.
- [ ] For a project or user command conflict, the user guide and troubleshooting documentation
      specify the v0.39.1 fallback exactly as `/effective-flow.effective-flow:<tool>`; the concrete
      example for `/effective-flow:plan` is `/effective-flow.effective-flow:plan`.
- [ ] The README, user documentation, and developer documentation describe the same four-target
      architecture, the same command namespace, and the requirement to revalidate the preview
      subagent contract before implementation.
- [ ] `docs/user-guide/README.md`, `getting-started.md`, `troubleshooting.md`, and `glossary.md`, as
      well as `docs/developer-guide/README.md`, `architecture.md`, `build-system.md`,
      `release-and-installation.md`, and `skill-ownership.md`, contradict neither the four-target
      contract nor the separate `main` and `gemini` branch contract. The skill-ownership guide and
      `skill-ownership.json` remain structurally reconciled by the existing ownership guard; a
      wording-only harness change does not invent a relationship in the manifest.

## Validation

The future implementation runs at least the following commands in this order:

```sh
pnpm agent:check
pnpm test
node build.mjs
pnpm test:distribution
```

Build guards and tests additionally verify statically:

1. JSON parsing and the exact allowed keys of `gemini-extension.json`;
2. TOML syntax for the supported command subset, required fields, escaping, and unchanged
   `{{args}}`;
3. YAML frontmatter, required fields, and allowed Gemini metadata for every preview subagent;
4. exact tool, command, and agent sets derived from the sources;
5. complete lazy fragments and runtime scripts in all four targets;
6. identical version stamps and the semantic manifest version;
7. no unresolved `{{SKILL:...}}`, `{{AGENT:...}}`, `{{VERSION}}`, `include`, `lazy-include`, `ask`,
   or internal router placeholders in generated artifacts;
8. `{{args}}` only in Gemini commands and no newly generated `!{...}` shell injection anywhere;
9. byte-for-byte identical Gemini build and branch root and the unchanged single-candidate
   contract for `main`;
10. a failed build before the atomic swap in which the previous `dist/` remains intact;
11. the exact documented conflict fallback `/effective-flow.effective-flow:plan` and consistent
    four-target and branch terminology in all canonical user and developer documents named in the
    file inventory.

When `gemini` is available locally, a native smoke test follows the static checks:

1. Run `gemini extensions link dist/gemini/effective-flow` in an isolated test configuration.
2. Check the extension and command list through `/help`.
3. Run an argument-free command such as `/effective-flow:version` and a command with arguments.
4. In the isolated test configuration, create a project command that collides with
   `/effective-flow:plan`; use `/help` to confirm that the project command receives the normal name
   and the extension receives the `/effective-flow.effective-flow:plan` fallback, then invoke that
   fallback once.
5. Test a workflow with agent delegation.
6. Remove the link afterward through the documented Gemini extension management command.

If Gemini CLI is not installed, only this native block is recorded as skipped; all static and
repository-owned checks remain mandatory.

## Open Questions

- None.

## Plan Review

**Result:** Approved

- The source-to-dist, atomic-swap, and release-please contracts match the current repository.
- Tool and agent counts are derived from the sources; the current snapshot of 17 public plus 6
  internal tools and 15 agents is verified context only.
- `main` remains free of a competing Gemini skill candidate. The dedicated `gemini` branch
  satisfies the installable-root contract without weakening portable manager delivery.
- Preview subagents are required scope, but revalidation, strict metadata guards, and an explicit
  abort path protect their implementation.
- Validation covers pure transformations, generated artifacts, distribution, branch staging,
  and—when available—Gemini CLI itself.
