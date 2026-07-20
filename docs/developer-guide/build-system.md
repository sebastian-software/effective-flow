# Build system

`build.mjs` transforms the Markdown sources under `src/` into native Claude and Codex targets
plus one portable manager target under `dist/`. This document describes invocation,
placeholder syntax, and build guards. Conventions for adding tools and agents are described
canonically in [`AGENTS.md`](../../AGENTS.md); only a short summary follows here.

## Invocation

```sh
node build.mjs          # builds native + portable targets into dist/ (alias: pnpm build)
pnpm test               # runs the unit test suite (node:test)
pnpm format             # formats with oxfmt (Markdown + JS)
pnpm agent:check        # oxfmt --check, CI mode without write access
pnpm audit:skill-ownership -- <local-skills-directory> # optional, advisory upstream audit
pnpm test:distribution  # build/archive/delivery/installer smoke suite
```

The package manager is **pnpm**; the root `package.json` `packageManager` field is the source of
truth for the pinned version. Node.js 22 or newer is required by both the build and the shipped
runtime helper. Correctness rests on three
complementary layers: the `node:test` suite (`pnpm test`) covers pure transforms and isolated
installer behavior; the build guards (see "Guards") enforce source and rendered-output
completeness during `node build.mjs`; and `pnpm test:distribution` smoke-tests the built native
and portable layouts, archive, staged delivery tree, and direct release installer. After every
source or installer change, use the same order as CI: `pnpm agent:check`, `pnpm test`,
`node build.mjs`, then `pnpm test:distribution`.

The build first writes into a temporary directory (`dist.tmp/`) and swaps it atomically against
`dist/` only after a fully successful run. If the build fails, the previous `dist/` stays
untouched.

## Placeholder and directive syntax

The sources use two kinds of placeholders that the build resolves – their expansion is never
written by hand.

**Inline references** sit in the middle of the text (including in the frontmatter `description:`
string) and use the Mustache syntax `{{…}}`:

| Placeholder   | Meaning                          | Replacement                                                                          |
| ------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| `{{SKILL:X}}` | Tool reference                   | `/effective-flow X` (exposed) or `` `tools/X.md` `` (internal)                       |
| `{{AGENT:X}}` | Worker reference                 | `` `effective-flow-X` `` in all targets; native role or portable contract identifier |
| `{{VERSION}}` | Version including git short hash | Manifest version + `git rev-parse --short HEAD`                                      |

**No legacy aliases.** Names from before the rename – that is, `{{SKILL:sf-…}}` or
`{{AGENT:sf-…}}` with the old `sf-` prefix – are **not** mapped onto their current names. The
reference guard rejects them with a migration message ("drop the `sf-` prefix") instead of
silently rendering a dead `tools/sf-….md` or `sf-…` reference. Always use the current,
prefix-less name in the sources.

**Block directives** sit on their own lines as a code fence with an info string. The fence
interior is preserved verbatim against the Markdown formatter (oxfmt)
(`embeddedLanguageFormatting: off`).

An `include` fence embeds the shared file `src/shared/<name>.md`:

```include
task-tracking
```

An `ask` fence produces a conditional user question (Claude Code: `AskUserQuestion` block,
Codex: free-text question):

```ask
header: Approval
question: Plan approved?
type: approval
```

A `lazy-include` fence **defers** a mode-gated shared fragment (progressive disclosure, see
below). Instead of inlining it eagerly, the build delivers `src/shared/<name>.md` once per
harness as a loadable file `shared/<name>.md` and replaces the directive with a conditional load
pointer at the decision point. The `when:` line is the load trigger and is rendered in the
pointer after "as soon as":

```lazy-include
worktree-integration
when: the delivery/worktree mode is determined
```

→ becomes: "**Load on demand:** Read `shared/worktree-integration.md` as soon as the
delivery/worktree mode is determined." A routine run that never reaches the mode never loads the
fragment.

Shared fragments may contain eager includes. In particular, both the lazy
`worktree-integration` fragment and the internal `apply-review-commit-mechanics` tool include
`execution-location`, the single source for execution receipts, rooted operations and
ownership-safe cleanup. Rendering each of those direct eager includes places the same contract
in all native and portable targets.

## Guards

The build aborts with an error message if any of these guards is violated:

- **Frontmatter/quoting guard:** `description` (and, for exposed tools, additionally
  `catalogHint`) must be strictly double-quoted.
- **Reference guard:** Every `{{SKILL:X}}` must point to an existing `src/tools/X.md`, every
  `{{AGENT:X}}` to an existing `src/agents/X.md`. A legacy `sf-` prefix (see "No legacy aliases"
  above) is deliberately rejected with a migration message. The same guard also runs during
  rendering (`transformRefs`), so no accepted placeholder can ever produce a non-existent
  target.
- **Central-skill ownership guard (#168):** The dependency-free guard reconciles
  `docs/developer-guide/skill-ownership.json` with the dedicated table in
  `skill-ownership.md`, every token in source `## Recommended skills` fallback chains, and the
  structured relevance-gate owner marker in `src/shared/central-reasoning-delegation.md`.
  Recommended central skills require a relationship for the concrete tool or agent consumer;
  external alternatives require an explicit allowlist entry. Duplicate relationships, invalid
  or missing classifications, unknown schema fields or consumers, stale or extra Markdown rows,
  stale relevance owners, malformed recommendation bullets, and unknown recommendation tokens
  fail with the offending name. The guard performs no network
  request, does not enumerate the upstream catalog, and never compares the optional
  `provenance.observedRevision` value with another repository.
  The Markdown guard reconciles exact skill-row membership. Its grouped consumer,
  classification, and coverage prose remains a human explanation; the JSON manifest is the
  authoritative structured relationship contract.
- **Rendered worker-resolution guard (#159):** Every rendered router, tool, shared fragment and
  worker contract is scanned after transformation. Native references must resolve to exact
  namespaced sidecars under `dist/{claude,codex}/agents/`; portable references must resolve to
  exact contracts under `dist/portable/effective-flow/workers/`. All worker artifacts carry
  matching metadata, and no source placeholder may remain.
- **Foreign harness tool-parameter guard (#163):** Every rendered Markdown and TOML file is
  scanned before the atomic `dist/` swap. A native target may contain only parameters owned by
  that harness, while the portable target may contain no native-only parameters. Violations
  report the target, relative file, line, and parameter. The extensible ownership registry and
  pure checker live as `HARNESS_TOOL_PARAMETER_OWNERSHIP` and
  `findForeignHarnessToolParameters` in `build-lib.mjs` and are covered in
  `test/build-lib.test.mjs`.

  | Parameter             | Owning target |
  | --------------------- | ------------- |
  | `run_in_background`   | Claude        |
  | `yield_time_ms`       | Codex         |
  | `sandbox_permissions` | Codex         |

- **Remote-tracker guards (#169):** `src/scripts/remote-tracker.mjs` and its importable core
  must exist, import only Node.js built-ins or local siblings, and be copied byte-for-byte to
  native Claude, native Codex, and portable `scripts/` directories. Runtime prompts are scanned
  with the unit-tested `findRemoteTrackerRecipeViolations` detector so direct `gh`/`tea`
  recipes, manual origin parsing, GraphQL assembly, and runtime flag discovery cannot return.

- **Retired consumer-config guard (#166):** The hand-maintained root `README.md` and every
  Markdown file under `docs/user-guide/` are scanned for the retired
  `.effective-flow/config.json` interface. The path is accepted only in an explicitly allowlisted
  migration section, while the former negation pattern is rejected everywhere. Diagnostics name
  the file, 1-based line, and violation kind. The same pure detector,
  `findRetiredConfigDocViolations`, runs again in `stage-delivery.mjs` after documentation
  transforms, so the exact mechanically staged default-branch payload is checked rather than
  inferred from source files. Unit tests cover allowlist boundaries and diagnostics;
  `pnpm test:distribution` verifies the staged-payload rejection path.
- **ADR ownership-contract guard (#167):** `AGENTS.md`,
  `docs/developer-guide/configuration.md`, `docs/developer-guide/skill-ownership.md`, and
  `src/shared/adr-convention.md` are scanned for stale current claims that Effective Flow
  deliberately or intentionally diverges, deviates, or conflicts with `decision-records`, or
  that the central skill requires immutable, numbered ADRs. An explicitly historical paragraph is accepted only
  when it also marks that premise as outdated or no longer a conflict. The guard intentionally
  excludes `docs/plan/archive/` and other historical records. The pure detector,
  `findStaleAdrContractClaims`, lives in `build-lib.mjs` and is covered in
  `test/build-lib.test.mjs`.

- **Include-target guard:** Every ` ```include ` fence must point to an existing
  `src/shared/<name>.md`.
- **Runtime-state writer guard (#165):** The pure `findRuntimeStateSafetyViolations` source
  analyzer walks tools and agents in source order, follows eager and lazy shared includes, and
  rejects an operational mutation below `.effective-flow/` unless the canonical
  `runtime-state-safety` fragment was loaded earlier. Read-only lookup is excluded. A marked
  setup-repair-only scope is evaluated only through setup, whose runtime marker additionally
  requires the sentinel, concrete-target, and tracked-state validations to precede the write.
  The analyzer recognizes both filesystem commands and operational prose such as write, persist,
  append, move, store, record, emit, and replace, while stripping clearly descriptive passive
  forms before matching; it does not rely on a writer allowlist.
- **Runtime-directory migration guard (#174):** The pure
  `findRuntimeDirMigrationViolations` analyzer reuses the ordered runtime-mutation traversal and
  rejects any operational mutation below `.effective-flow/` that can be reached before the
  `effective-flow-dir-migration` prerequisite. It follows nested shared writers, so loading the
  fragment late in a parent tool does not hide an earlier indirect write. The migration fragment
  is exempt from requiring itself, while the separate runtime-state writer guard still requires
  its concrete copies and marker write to follow `runtime-state-safety`.
- **Lazy-include guards (#99):** (a) No fragment may be embedded in the same file both eagerly
  (` ```include `) **and** lazily (` ```lazy-include `) (otherwise the block would be loaded
  twice). (b) Every lazily referenced fragment must be delivered as `shared/<name>.md` for
  **all three** targets so that the load pointer resolves in both native and portable installs. The pure check
  logic (`resolveLazyIncludes`, `collectIncludeNames`, `assertNoEagerLazyOverlap`) lives in
  `build-lib.mjs` and is covered in `test/build-lib.test.mjs`.
- **Context-budget guard (#99):** The always-loaded core of the largest tools (`build`, `fix`,
  `docs`, `review`, `plan`) – the built tool file without the lazy fragments – stays under
  **700 lines**. The build prints the measured sizes as a report and aborts if a tool exceeds
  the budget.
- **`catalogHint` guard:** Every tool listed in `TOOL_GROUPS` (exposed) needs a non-empty,
  strictly quoted `catalogHint` field – the line the router catalog shows per tool.
- **`TOOL_GROUPS` completeness guard:** Every exposed tool is in exactly one group; duplicates
  or a tool without a matching source file make the build fail.
- **Codex sandbox guard:** A value given in `codex.sandbox_mode` must be among the modes
  supported by Codex.
- **Version-drift guard:** The version string stamped into all three router outputs
  (`<manifest version> (<git short hash>)`) must be identical.
- **Doc landing-page guard:** If a README-required doc category
  (`docs/user-guide/`, `docs/developer-guide/`) contains at least one document, a `README.md`
  must be present there as a curated landing page (rule from `src/shared/doc-categories.md`);
  otherwise the build aborts. This way the mandatory technical entry point cannot vanish
  unnoticed. The pure check logic lives as `missingCategoryReadmes` in `build-lib.mjs` and is
  covered in `test/build-lib.test.mjs`.
- **Self-contained-agent-contract guard (#100):** Every agent description and every agent body
  is the complete runtime metadata and instruction basis of the subagent – it receives no
  sibling or history context at runtime. The guard therefore aborts the build if an agent source
  (frontmatter **and** body) offloads its meaning onto another agent: history comparisons
  ("original agent", "same depth as the …"), relative-to-sibling scope ("… like the `<X>`
  reviewer/implementer/…"), or a cross-agent shorthand as a contract substitute ("As with
  `{{AGENT:…}}`"). A **legitimate** delegation reference such as "delegate to
  `{{AGENT:code-validator}}`" stays allowed – only the "As with `{{AGENT:…}}`" form is blocked.
  The pure check logic lives as `findSelfReferentialContractPhrases` (with the blocklist
  `SELF_CONTAINED_CONTRACT_PATTERNS`) in `build-lib.mjs` and is covered in
  `test/build-lib.test.mjs`.

## Adding a tool or agent

Short version (canonical in [`AGENTS.md`](../../AGENTS.md), section "Adding a tool or agent"):

1. Create a new source file under `src/tools/<name>.md` or `src/agents/<name>.md`.
2. To expose a tool via `/effective-flow`, add the name to exactly one group of `TOOL_GROUPS` in
   `build.mjs` (the array/group order determines the catalog order in the router) and add a
   strictly quoted `catalogHint` frontmatter field.
3. Run `node build.mjs`. The guards described above cover missing sources, missing include
   targets, unsupported Codex sandbox modes, and missing or duplicate `TOOL_GROUPS` entries.

## Runtime scripts

The remote-tracker adapter is the only consumer runtime code in the skill payload. Invoke it as
`node <skill-root>/scripts/remote-tracker.mjs <operation> [--apply]` with one JSON object on
standard input. It emits one stable JSON envelope on standard output and uses nonzero exit codes
for structured failures. Mutations are dry runs unless `--apply` is present. The core module is
pure except for an injected process runner; provider CLIs are always executed as an executable
plus argument array, never through a shell.

Unit tests exercise parsing, payloads, provider plans, redaction, capabilities, compatibility,
and stale writes with fake runners and fixtures. Forgejo capabilities are derived once per run
from authenticated login JSON plus documented `tea ... --help` command/flag surfaces; absent
commands become `UNSUPPORTED_CAPABILITY` before mutation. GitHub reads retain ETags for
diagnostics, but body writes are reported as non-atomic because GitHub does not support
conditional requests for these unsafe endpoints. Forgejo list reads page until an empty page,
and create results are normalized from the final URL that supported `tea` versions print after a
successful issue or pull-request creation. The CLI-level test spawns the real entry point;
the build and distribution checks prove that all three installed payloads contain identical,
usable scripts.

## Progressive disclosure beyond the router

The top-level router (`SKILL.md`) loads only the tool catalog and the dispatch rule; the full
instruction of a tool arrives only on the call from `tools/<tool>.md`. This progressive
disclosure continues **within** a tool: a large tool no longer inlines every shared fragment
eagerly but moves the **mode-gated** blocks behind a `lazy-include` pointer (see "Placeholder
and directive syntax").

- **Core flow stays inline** – blocks that (almost) every run needs: `language-rules`,
  `task-tracking`, `skill-discovery`, `completion-protocol`, `commit-message-rules`,
  `pre-commit-gate`, `goal-completion`, `apply-clarity-gate`, `plan-status`.
- **Mode-gated blocks are lazy** – needed only when the branch is reached: `config-migration`,
  `worktree-integration`, `issue-tracker`, `review-report-backlinks`,
  `unresolved-review-report`, `plan-numbering`, `plan-reference-routing`,
  `effective-flow-dir-migration`. The load trigger (`when:`) sits at the decision point where
  the mode/branch is determined.

The fragment is delivered **once per consumer target**, deduplicated, to that skill's `shared/`
directory and rendered there through the same pipeline as a tool body (nested eager includes,
`{{VERSION}}`, references/`ask`). A worker reads the file at runtime
the same way the router loads `tools/<tool>.md` on demand or `apply` loads its `apply-*.md`
siblings.

Execution-location behavior intentionally remains instruction-level and harness-neutral: Git
metadata verifies the absolute root and checkout identity, while Claude- or Codex-managed
worktree lifecycle stays outside Effective Flow ownership. No runtime helper or configuration
schema is required for the receipt.

## Native and portable worker rendering

Each `src/agents/<name>.md` body remains the only worker contract. The native renderers combine
it with harness-specific frontmatter to produce registered `effective-flow-<name>` sidecars.
The portable renderer writes the same body to `workers/effective-flow-<name>.md`; instructions
that reference a worker receive a short delegation protocol telling the harness to load only
the selected contract and pass it to a built-in general-purpose subagent. This is orchestration
metadata, not a duplicate domain playbook: centrally discovered skills remain authoritative
for their declared domains.

Portable tool references use the harness-neutral notation `effective-flow <tool>`. Its router
also states the executable `/effective-flow` (Claude Code) and `$effective-flow` (Codex) forms,
so both managers install the same bytes instead of selecting by traversal order.

**Context budget.** The always-loaded core of the five largest tools stays under **700 lines**
(measured and enforced during the build, see "Guards"); the build prints the sizes as a report.
For comparison, before the change: `build` 1185 → ~624, `fix` 917 → ~425, `docs` 925 → ~498,
`review` 787 → ~646, `plan` 723 → ~615 lines. The rest is loaded only when the mode is reached.

## Optional upstream ownership audit

Maintainers can inspect a supplied local checkout, its `skills/` directory, or a newline-delimited
listing file without changing normal CI:

```sh
pnpm audit:skill-ownership -- /path/to/skills.sebastian-software.com
```

The audit reports upstream skills without declared Effective Flow relationships as review
candidates and also notes declared relationship skills absent from the supplied input. Candidate
findings are advisory: they do not produce a failing status, mutate the manifest, assign a
classification, or run during `build`, `test`, or `agent:check`. A candidate may remain unrelated
indefinitely. Update the relationship manifest only after a human review establishes a concrete
Effective Flow consumer; refresh the informational provenance only when that relationship review
actually occurs.

## Further reading

- [`architecture.md`](architecture.md) – source-to-dist model and repo structure.
- [`plan-conventions.md`](plan-conventions.md) – plan-file schema.
- [`release-and-installation.md`](release-and-installation.md) – version stamp and release.
- [`AGENTS.md`](../../AGENTS.md) – canonical build and behavior rules.
