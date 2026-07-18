# Build system

`build.mjs` transforms the Markdown sources under `src/` into two harness-specific skill
directories under `dist/claude/` and `dist/codex/`. This document describes invocation,
placeholder syntax, and build guards. Conventions for adding tools and agents are described
canonically in [`AGENTS.md`](../../AGENTS.md); only a short summary follows here.

## Invocation

```sh
node build.mjs   # builds both harnesses into dist/ (alias: pnpm build)
pnpm test        # runs the unit test suite (node:test)
pnpm format      # formats with oxfmt (Markdown + JS)
pnpm agent:check # oxfmt --check, CI mode without write access
```

The package manager is **pnpm** (`packageManager: pnpm@11.9.0`). Correctness rests on two
complementary layers: a `node:test` unit suite (`pnpm test`, `test/build-lib.test.mjs`) that
covers the pure `build-lib.mjs` transforms (frontmatter parsing, `{{SKILL:X}}`/`{{AGENT:X}}`
and `include` resolution, body rendering, description quoting), **and** the build guards (see
"Guards") that kick in during the `node build.mjs` run – the unit tests secure the transform
logic, the guards the completeness and consistency of the sources. After every source change,
the same order as in CI applies: `pnpm agent:check` (format), `pnpm test` (unit tests), then
`node build.mjs` (build + guards).

The build first writes into a temporary directory (`dist.tmp/`) and swaps it atomically against
`dist/` only after a fully successful run. If the build fails, the previous `dist/` stays
untouched.

## Placeholder and directive syntax

The sources use two kinds of placeholders that the build resolves – their expansion is never
written by hand.

**Inline references** sit in the middle of the text (including in the frontmatter `description:`
string) and use the Mustache syntax `{{…}}`:

| Placeholder   | Meaning                          | Replacement                                                     |
| ------------- | -------------------------------- | --------------------------------------------------------------- |
| `{{SKILL:X}}` | Tool reference                   | `/effective-flow X` (exposed) or `` `tools/X.md` `` (internal)  |
| `{{AGENT:X}}` | Agent reference                  | `` `X` `` (Codex) or `` `effective-flow-X` `` (Claude subagent) |
| `{{VERSION}}` | Version including git short hash | Manifest version + `git rev-parse --short HEAD`                 |

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

## Guards

The build aborts with an error message if any of these guards is violated:

- **Frontmatter/quoting guard:** `description` (and, for exposed tools, additionally
  `catalogHint`) must be strictly double-quoted.
- **Reference guard:** Every `{{SKILL:X}}` must point to an existing `src/tools/X.md`, every
  `{{AGENT:X}}` to an existing `src/agents/X.md`. A legacy `sf-` prefix (see "No legacy aliases"
  above) is deliberately rejected with a migration message. The same guard also runs during
  rendering (`transformRefs`), so no accepted placeholder can ever produce a non-existent
  target.
- **Include-target guard:** Every ` ```include ` fence must point to an existing
  `src/shared/<name>.md`.
- **Lazy-include guards (#99):** (a) No fragment may be embedded in the same file both eagerly
  (` ```include `) **and** lazily (` ```lazy-include `) (otherwise the block would be loaded
  twice). (b) Every lazily referenced fragment must be delivered as `shared/<name>.md` for
  **both** harnesses so that the load pointer resolves on Claude Code and Codex. The pure check
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
- **Version-drift guard:** The version string stamped into both router outputs
  (`<manifest version> (<git short hash>)`) must be identical in the Claude and Codex output.
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

The fragment is delivered **once per harness**, deduplicated, to
`dist/<harness>/effective-flow/shared/` and rendered there through the same pipeline as a tool
body (nested eager includes, `{{VERSION}}`, references/`ask`). An agent reads the file at runtime
the same way the router loads `tools/<tool>.md` on demand or `apply` loads its `apply-*.md`
siblings.

**Context budget.** The always-loaded core of the five largest tools stays under **700 lines**
(measured and enforced during the build, see "Guards"); the build prints the sizes as a report.
For comparison, before the change: `build` 1185 → ~624, `fix` 917 → ~425, `docs` 925 → ~498,
`review` 787 → ~646, `plan` 723 → ~615 lines. The rest is loaded only when the mode is reached.

## Further reading

- [`architecture.md`](architecture.md) – source-to-dist model and repo structure.
- [`plan-conventions.md`](plan-conventions.md) – plan-file schema.
- [`release-and-installation.md`](release-and-installation.md) – version stamp and release.
- [`AGENTS.md`](../../AGENTS.md) – canonical build and behavior rules.
