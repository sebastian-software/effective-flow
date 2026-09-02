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
pnpm test:distribution  # build/archive/delivery smoke suite
```

The package manager is **pnpm**; the root `package.json` `packageManager` field is the source of
truth for the pinned version. Node.js 22 or newer is required by both the build and the shipped
runtime helper. Correctness rests on three
complementary layers: the `node:test` suite (`pnpm test`) covers pure transforms and isolated
installer behavior, including `install-skill.sh`'s dispatch and the DALO driver in
`local-common.sh`; the build guards (see "Guards") enforce source and rendered-output
completeness during `node build.mjs`; and `pnpm test:distribution` smoke-tests the built native
and portable layouts, archive, and staged delivery tree. `pnpm test:managers` separately
exercises the documented DALO and Skills CLI consumer paths against externally published
releases of those managers. After every source or installer change, use the same order as CI:
`pnpm agent:check`, `pnpm test`, `node build.mjs`, then `pnpm test:distribution`.

The build first writes into a temporary directory (`dist.tmp/`) and swaps it atomically against
`dist/` only after a fully successful run. If the build fails, the previous `dist/` stays
untouched.

## Placeholder and directive syntax

The sources use two kinds of placeholders that the build resolves – their expansion is never
written by hand.

**Inline references** sit in the middle of the text (including in the frontmatter `description:`
string) and use the Mustache syntax `{{…}}`:

| Placeholder     | Meaning                          | Replacement                                                                          |
| --------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| `{{FLOW}}`      | Bare skill invocation            | `/effective-flow` (Claude), `$effective-flow` (Codex), `effective-flow` (portable)   |
| `{{SKILL:X}}`   | Tool reference                   | `/effective-flow X` (exposed) or `` `tools/X.md` `` (internal)                       |
| `{{AGENT:X}}`   | Worker reference                 | `` `effective-flow-X` `` in all targets; native role or portable contract identifier |
| `{{VERSION}}`   | Version including git short hash | Manifest version + `git rev-parse --short HEAD`                                      |
| `{{TOOL_LIST}}` | Router tool list                 | The `EXPOSED_TOOLS` names joined with `, ` in catalog order                          |

For a resolved source body, `renderBody` applies the harness-specific transforms in this order:
`ask` blocks, portable worker-delegation preparation when required, then `{{FLOW}}`,
`{{SKILL:X}}` and `{{AGENT:X}}` references. Eager includes, lazy-include pointers, and
`{{VERSION}}` are resolved before that body enters `renderBody`. This ordering ensures the
interaction syntax is target-specific before worker and tool references receive their final
target syntax.

`{{TOOL_LIST}}` is not a body placeholder: it appears only in the router's frontmatter
`description` and is resolved once from `EXPOSED_TOOLS` before the per-harness description
transform rewrites the invocation prefix. The frontmatter description is the only catalog a
harness sees before it loads anything, so a hand-written list there silently drifts from the
exposed set and a missing name becomes a tool nobody can discover.

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

The optional `language` field accepts `en` or `de` and defaults to `en`. It controls only the
wrapper text generated by the build and the synthesized choices for an `approval` question.
The build preserves `header`, `question`, `when`, and source-provided option labels and
descriptions verbatim; it does not infer a language from that text or from a target project's
runtime `language.*` settings. German generated wrapper text therefore requires an explicit
`language: de` in the individual `ask` block.

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

Shared fragments may contain eager includes. The lazy `worktree-integration` fragment carries
three of them: `execution-location`, the single source for execution receipts, rooted operations
and ownership-safe cleanup; `worktree-lifecycle`, the ownership evidence an Effective Flow-created
worktree is removed against; and `base-branch-resolution`, the single rule that turns
`delivery.baseBranch` into a resolved base ref and a resolved local base branch. The internal
`apply-review-commit-mechanics` tool includes `execution-location` as well, and the `pr` tool
includes `base-branch-resolution`, which is why that rule is a fragment rather than prose in one
host: `pr` does not include `worktree-integration`, so a bare cross-reference would point at text
absent from its built output. Rendering each of those direct eager includes places the same
contract in all native and portable targets.

A shared fragment may equally contain a `lazy-include` fence, and a deferred fragment is not a
leaf: `worktree-integration` defers `pr-review-integration` at its own decision point. Nested
fences resolve to load pointers exactly like top-level ones, so a fragment reached through a
pointer can defer further work rather than paying for it. Because resolving one fragment can
name a fragment no tool references directly, the build walks the fragment set as a worklist —
every newly discovered name is queued, shipped, and revisited, with a `seen` set closing the
cycle the walk would otherwise not terminate on.

## Guards

The build aborts with an error message if any of these guards is violated:

- **Frontmatter/quoting guard:** `description` (and, for exposed tools, additionally
  `catalogHint`) must be strictly double-quoted.
- **Claude effort guard:** Every agent's nested `claude` block must contain `effort`. The build
  accepts exactly `low`, `medium`, `high`, `xhigh`, or `max`; a missing, empty, differently
  cased, or unknown value aborts the build with the agent name and source path. The field is
  rendered deterministically next to `model` in the native Claude sidecar.
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
- **Agent skill-recommendation roster guard (#168):** `assertAgentSkillRecommendationRoster`
  closes the hole that the recommendation-driven checks above leave open: a source without a
  `## Recommended skills` heading produces no chain and therefore no obligation. Every
  `src/agents/*.md` must carry that section or appear in `SKILL_RECOMMENDATION_EXEMPT_AGENTS` in
  `build.mjs` with a one-line reason, so the obligated set is
  `count(src/agents/*.md) − |exemptions|`. The set is two-sided like the next-steps exemptions: an
  exempt agent must carry **no** section, a non-exempt one must, and an exemption naming an agent
  that does not exist fails as stale. An empty roster is rejected rather than passed vacuously.
  The guard deliberately covers agents only — `src/shared/skill-discovery.md` states that a
  missing section is legitimate for a tool, and tools such as `version` or `cleanup` have no
  domain owner to name. `merge-conflict-resolver` is the only current exemption.
- **Unrecommended-relationship guard (#168):** The reverse direction of the ownership check,
  enforced inside `assertSkillOwnershipContract` itself. A declared relationship must be reachable
  from a recommendation; otherwise it is declared, documented, and dead, because skill discovery
  honours only `## Recommended skills` sections. The strictness follows the classification. A
  **`delegate`** consumer is checked **per consumer**: that pair is the whole layered contract, so
  a delegating source that swaps its owner has lost its domain guidance even while a sibling
  consumer keeps the relationship alive — the exact drift a per-relationship check cannot see. A
  **`route-when-relevant`** consumer is checked **per relationship**, because a relevance-gate
  consumer such as `plan` reaches its owner through the structured marker in
  `central-reasoning-delegation.md` instead of a section of its own. Shared-fragment consumers
  (`language-rules`, `dependency-version-policy`, `documentation-sync-contract`,
  `worktree-integration`) are exempt **by kind** in both cases: a fragment expresses its ownership
  as prose inside the tool that embeds it and can never produce a chain. The
  `recommendationCapableConsumers` argument that carries that filter is required, so dropping it
  fails the build instead of silently disabling the check.
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

- **Dependency-free runtime guard (#169):** every script named in the `RUNTIME_SCRIPT_FILES`
  allowlist must exist, import only Node.js built-ins or local siblings, and be copied
  byte-for-byte to native Claude, native Codex, and portable `scripts/` directories. The scan
  recognizes a static `import`/`export … from`, a side-effect `import`, and a dynamic
  `import()`, each anchored to the start of a statement so prose in a comment cannot be
  misread as one. One script pair carries this today: `remote-tracker.mjs`/
  `remote-tracker-core.mjs`. Its runtime prompts are additionally scanned with the unit-tested
  `findRemoteTrackerRecipeViolations` detector so direct `gh`/`tea` recipes, manual origin
  parsing, GraphQL assembly, and runtime flag discovery cannot return.

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
  deliberately or intentionally diverges, deviates, or conflicts with `effective-product` – the
  central skill that owns ADR craft – or that this skill requires immutable, numbered ADRs. An
  explicitly historical paragraph is accepted only when it also marks that premise as outdated or
  no longer a conflict. The guard intentionally excludes `docs/plan/archive/` and other
  historical records. The pure detector,
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
  **all three** targets so that the load pointer resolves in both native and portable installs. The
  fragment set is the transitive closure, so a fragment named only from inside another deferred
  fragment is delivered and checked just the same. (c) No generated artifact may still contain a
  raw ` ```include ` or ` ```lazy-include ` fence. Nothing in a delivered skill explains either
  directive, so a surviving fence reads as inert prose and the deferred fragment is silently never
  loaded — `assertNoUnresolvedEagerIncludes` and `assertNoUnresolvedLazyIncludes` run on every
  rendered body, tool, agent, router, and shipped fragment alike. The pure check logic
  (`resolveLazyIncludes`, `collectIncludeNames`, `assertNoEagerLazyOverlap`,
  `findUnresolvedLazyIncludes`) lives in `build-lib.mjs` and is covered in
  `test/build-lib.test.mjs`.
- **Documentation-sync consumer guard:** `tools/build.md`, `tools/fix.md`, `tools/refactor.md`, and
  `tools/maintain.md` must each embed the `documentation-sync` fragment **eagerly**. A lazy pointer
  does not satisfy the guard: its `when:` condition could be judged inapplicable, which is exactly
  the skippable documentation phase this gate replaces. Only the eager core is required; its
  `documentation-sync-contract` detail fragment stays lazy and keeps the core out of the context
  budget. The pure `findDocumentationSyncViolations` checker and its
  `assertDocumentationSyncConsumers` wrapper live in `build-lib.mjs` and are covered in
  `test/build-lib.test.mjs`. The core fragment deliberately opens at heading level four: it is
  always embedded inside a consuming tool's `###` phase heading, so an `##` heading would make the
  following phases read as its subsections.
- **Next-steps contract guard:** The pure `parseNextStepsTable`/`assertNextStepsContract` pair
  validates the marker-delimited edge table in `src/shared/next-steps.md`: exactly one start and
  end marker, the fixed `Tool | Condition | Then | Or` headers, a valid separator row, at most two
  edges per row, every edge cell a resolvable `{{SKILL:X}}` reference, and two-way coverage
  between the table's `Tool` column and the derived emitting-tool set
  (`count(src/tools/*.md) − |exemptions|`). The per-file fence check in `readSource` enforces the
  other half: a non-exempt `src/tools/*.md` lazily includes `next-steps` exactly once, an exempt
  one zero times. `findNextStepsDocViolations` then reconciles the same parsed edges against the
  table in `docs/user-guide/tool-flow.md`, row by row and column by column, after normalizing each
  side (`{{SKILL:X}}` resolved to its rendered Claude form, surrounding backticks stripped, `—`
  read as empty, cells trimmed) — so the shipped documentation page can never silently drift from
  the runtime contract it mirrors.
- **Context-budget guard (#99):** The always-loaded core of **every** tool – the built tool file
  without the lazy fragments – stays under a **per-tool** budget. `build`, `fix`, `docs`,
  `review` and `plan` share **700 lines**; `merge-gate` carries **3219**; every other
  `src/tools/*.md` carries its measured size plus **up to** ten lines. The build prints each
  measured size next to the budget it was measured against and aborts if a tool exceeds **its
  own** limit, naming the tool, its size and that limit. That printed size is the number to
  measure a new entry against — the guard counts `split('\n').length`, one line more than
  `wc -l` on a newline-terminated file. `merge-gate` differs from the 700 because it is an
  orchestration gate: its phases, delegation contracts and provider rules do not compress to
  the size of an implementation tool. Every number other than the six above is a measured
  backlog rather than a target – it records what a tool costs today with its mode-gated
  fragments still inlined, so each later deferral lowers the entries it touches and a large
  number reads as work outstanding, never as room to fill. The map and the built tool set are
  reconciled two-sidedly: a tool with no entry fails the build, and so does an entry naming no
  tool, so a newly added tool cannot ship unmeasured.
- **Router tool-list placeholder guard:** The `description` in `src/SKILL.md` must carry exactly
  one `{{TOOL_LIST}}` placeholder; any other count aborts the build and reports the number found.
  The list itself is generated from `EXPOSED_TOOLS`, and this guard is what keeps it generated:
  without it the placeholder can be deleted and the names written out by hand again, which is how
  the description had already drifted to advertise 19 of the 20 exposed tools.
- **`catalogHint` guard:** Every tool listed in `TOOL_GROUPS` (exposed) needs a non-empty,
  strictly quoted `catalogHint` field – the line the router catalog shows per tool.
- **`TOOL_GROUPS` completeness guard:** Every exposed tool is in exactly one group; duplicates
  or a tool without a matching source file make the build fail.
- **Deprecated-alias guards:** Every entry in `DEPRECATED_TOOL_ALIASES` must not appear in
  `TOOL_GROUPS`/`EXPOSED_TOOLS` (an alias stays out of the catalog, the `catalogHint` guard, and
  `argument-hint`), its replacement must itself be an exposed tool, and its alias name must have a
  matching `src/tools/<alias>.md` source, since the rendered `{{DEPRECATED_ALIASES}}` router clause
  routes the retired name to that file.
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
3. Add the tool's entry to `CONTEXT_BUDGET_LINES` in `build.mjs` — its built line count plus up to
   ten lines of headroom, with the line count read off the `Always-loaded core (lines/budget)`
   report `node build.mjs` prints rather than from `wc -l`. Every `src/tools/*.md` is measured,
   internal ones included.
4. Run `node build.mjs`. The guards described above cover missing sources, missing include
   targets, unsupported Codex sandbox modes, missing or duplicate `TOOL_GROUPS` entries, and a
   tool with no budget entry.

## Runtime scripts

One dependency-free script pair ships as consumer runtime code in the skill payload, split into an
I/O boundary and a pure, unit-testable core:

- **Remote-tracker.** Invoke it as `node <skill-root>/scripts/remote-tracker.mjs <operation>
[--apply]` with one JSON object on standard input. It emits one stable JSON envelope on
  standard output and uses nonzero exit codes for structured failures. Mutations are dry runs
  unless `--apply` is present. The core module is pure except for an injected process runner;
  provider CLIs are always executed as an executable plus argument array, never through a shell.

Unit tests exercise remote-tracker parsing, payloads, provider plans, redaction, capabilities,
compatibility, and stale writes with fake runners and fixtures. Forgejo capabilities are derived
once per run from authenticated login JSON plus documented `tea ... --help` command/flag surfaces;
absent commands become `UNSUPPORTED_CAPABILITY` before mutation. GitHub reads retain ETags for
diagnostics, but body writes are reported as non-atomic because GitHub does not support conditional
requests for these unsafe endpoints. Forgejo list reads page until an empty page, and create results
are normalized from the final URL that supported `tea` versions print after a successful issue or
pull-request creation. The CLI-level test spawns the real entry point; the build and distribution
checks prove that all three installed payloads contain identical, usable scripts.

Session titles have no shipped runtime helper. The ChatGPT Desktop Codex tab calls the app-native
current-task capability directly, while Claude Code follows the instruction-level rename-butler
contract in [`src/shared/session-rename.md`](../../src/shared/session-rename.md). Codex CLI has no
automatic title path in this scope.

## Progressive disclosure beyond the router

The top-level router (`SKILL.md`) loads only the tool catalog and the dispatch rule; the full
instruction of a tool arrives only on the call from `tools/<tool>.md`. This progressive
disclosure continues **within** a tool: a large tool no longer inlines every shared fragment
eagerly but moves the **mode-gated** blocks behind a `lazy-include` pointer (see "Placeholder
and directive syntax").

- **Core flow stays inline** – blocks that (almost) every run needs, or that must not be missed:
  `task-tracking`, `skill-discovery`, `completion-protocol`, `pre-commit-gate`,
  `goal-completion`, `apply-clarity-gate`, `delegation-mandate`, and the status markers in
  `plan-status`. `goal-completion` governs every remaining phase rather than one decision point,
  and `apply-clarity-gate` is a safety gate whose failure mode — silently not running — is the one
  nobody notices. Neither is deferred, however tempting their size. `delegation-mandate` is eager
  for the same reason: a lazy pointer at the delegation decision point would let the very host
  default this fragment corrects skip the pointer's own trigger, so the mandate must be present
  before the model plans the run. `base-branch-resolution` is eager in both of its hosts for a
  narrower reason: `pr` resolves a base on every run, in steps 1, 2 and 4, so there is no single
  decision point at which a pointer could sit. `typography-rules` is eager in all sixteen agents
  for a third reason: it states how a resolved `de`/`en` value is rendered, not how it is resolved,
  so deferring it behind `language-rules` would hide it from exactly the orchestrated agents that
  are handed a value and never resolve one. The fragment is split out of `language-rules` — which
  still embeds it, so every consumer of the resolver keeps the rule — precisely so the locale rule
  travels with the writer rather than with the resolver.
- **Mode-gated blocks are lazy** – needed only when the branch is reached: `language-rules`,
  `project-routing`, `commit-message-rules`, `doc-categories`, `plan-contract`,
  `initial-state-documentation`, `review-state`, `review-report-format`, `config-migration`,
  `config-migration-edge-cases`, `worktree-integration`, `issue-tracker`, `issue-tracker-forge`,
  `review-report-backlinks`, `unresolved-review-report`, `plan-numbering`,
  `plan-reference-routing`, `plan-archival`,
  `effective-flow-dir-migration`, `issue-post-merge-observation`, `pr-merge-completion`. The load
  trigger (`when:`) sits at the decision point where the mode/branch is determined.
  `plan-archival` is pointed at from the four tool sources that keep a plan file rather than from
  inside `worktree-integration`: its decision point is the delivery point of the handback, and
  in-place execution without delivery reaches that point while performing no other step of that
  fragment. Four of these names are deferred **halves** of a split: `issue-post-merge-observation`
  was separated from `issue-lifecycle`, `pr-merge-completion` from `pr-review-comments`,
  `issue-tracker-forge` from `issue-tracker`, and `config-migration-edge-cases` from
  `config-migration`; the first three remaining halves stay eager because their
  consumers read them on every run, and `config-migration`'s core is the exception the paragraph
  below records rather than a fourth instance of that rule. Cutting a fragment
  along the seam between an always-read part and a one-decision-point part is what lets the second
  half qualify for deferral at all. `config-migration` is the live proof that a fragment may be
  eager in one file and lazy in another: twelve tools that read configuration on every run inline
  its always-read core, while seven others defer the whole fragment behind their own first
  configuration read.

A fragment qualifies for deferral only when it serves **one nameable decision point** and the
pointer states that trigger. Where a fragment is read in nearly every run anyway — review's
configuration schema, for instance — deferring it would move the measured number without saving
anything real, so it stays inline.

Splitting also pays off without any deferral, when the halves have **different consumers**:
`config-migration` kept the config locator and the table encoding every reader needs, while the
`mergeGate.*` key table moved to `config-merge-gate-keys` (included by `setup` and `iterate`,
while `merge-gate` states the keys in its own `## Configuration` section) and the setup-only
language and legacy-`config.json` contracts moved to `config-setup-migration` (included by `setup`
alone). `pr-review-thread-writes` is the same cut on the write side of `pr-review-comments`,
included by `iterate` and `pr-review-integration`. Each half is still eagerly included where it is
needed; the saving is that a consumer no longer inlines the part it never reads.

The fragment is delivered **once per consumer target**, deduplicated, to that skill's `shared/`
directory and rendered there through the same pipeline as a tool body (nested eager includes,
nested load pointers, `{{VERSION}}`, `ask`, portable worker preparation, then references). A
worker reads the file at runtime the same way the router loads `tools/<tool>.md` on demand or
`apply` loads its `apply-*.md` siblings.

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

The native frontmatter also owns role-based model selection. Implementers and reviewers use
Claude `opus`/`xhigh` and Codex `gpt-5.6-sol`/`high`; support roles use Claude
`sonnet`/`medium` and Codex `gpt-5.6-luna`/`medium`. The source agent files are the canonical
per-role assignments. Portable workers intentionally omit these native fields, so the build
does not imply that a portable manager can enforce the same profiles.

Portable tool references use the harness-neutral notation `effective-flow <tool>`. Its router
also states the executable `/effective-flow` (Claude Code) and `$effective-flow` (Codex) forms,
so both managers install the same bytes instead of selecting by traversal order.

**Context budget.** The always-loaded core of every tool is measured and enforced during the
build (see "Guards"), each against its own budget; the build prints the sizes as a report, in map
order, which runs largest **measured** size first — not largest limit, so `fix`'s 700 sitting
between a 501 and a 420 limit is the order working rather than a sort violation. The order is a reading
aid and is deliberately unenforced: asserting it would turn a successful deferral, which is the
work the map exists to track, into a build failure until the map is re-sorted.
The five implementation tools share **700 lines** and currently measure `build` 538, `fix`
434, `docs` 570, `review` 692, and `plan` 624 — headroom ranges from `review`'s 8 lines, the
tightest since the eager `delegation-mandate` include was added, to `fix`'s 266 lines.
`merge-gate` is budgeted separately at **3219** and measures 3145: an orchestration gate whose
phases, delegation contracts and provider rules do not compress to the size of an implementation
tool, so it is held to a number that ratchets its own history down rather than to the shared 700.
The rest is loaded only when the mode is reached.

Every remaining tool carries its **measured size plus at most ten lines**, which is a backlog
rather than a target: those tools still inline the mode-gated fragments that the five
implementation tools already defer, and each conversion of an eager include to a `lazy-include`
lowers the entries it touches. The headroom is a flat line count rather than a percentage on
purpose — a percentage would give the largest tools the most room, which is where unwatched growth
costs the most — and ten lines are wide enough for the short pointer a deferral leaves behind. Ten
is the ceiling and not a fixed offset: most entries carry less, because a deferral that shrinks a
tool is recorded by lowering its entry to the new measurement instead of re-adding the full ten,
so `apply-issues` at 1143/1146 has three lines of room and not ten. Read a specific entry's
headroom off the build report. `iterate` at 1625 and `setup` at 1469 are the two largest
entries of that kind today.

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
