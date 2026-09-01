# Architecture

This document describes how Effective Flow is built as a repository: the source-to-dist model,
the router with lazy loading, and the split across the two harnesses Claude Code and Codex.
Behavior rules for agents (language rules, commit conventions, no-AI-attribution, plan-file
conventions) live canonically in [`AGENTS.md`](../../AGENTS.md) – this document references them
instead of duplicating them.

## Central language resolution

Human-readable output uses the target project's project-setup ADR rather than harness-specific
defaults. `language.project` is the common `de`/`en` fallback; optional overrides select source
prose, user documentation, technical documentation, local workflow artifacts, Forge prose, and
Git/release prose. Missing overrides inherit the project language, and a completely missing
configuration resolves to `en`.

Resolution order is artifact-specific: an explicit user request wins; while editing, a
recognizable existing artifact language comes next; a new artifact then uses its surface
override, `language.project`, and finally `en`. Orchestrating tools resolve every language needed
for a run once and pass the concrete values to delegated workers. A standalone tool performs the
same resolution itself. Workers do not independently reparse the ADR, which prevents parallel
writers from making inconsistent choices.

Publication target selects the surface. Plans, local reviews, and investigations use
`language.workflow`; issues, PR bodies, comments, and remote reviews use `language.forge`;
commit descriptions, Conventional-Commit PR titles, changelog prose, and release-note prose use
`language.git`. Root README/user-guide work uses `language.documentation.user`; developer/API,
operations, and runbook work uses `language.documentation.technical`; code comments, test
descriptions, and in-code documentation use `language.source`. Product UI and CLI localization is
outside this model.

This selection affects visible prose only. Config keys and encoded values, identifiers, API
names, labels, HTML markers, finding IDs, action values, paths, Conventional-Commit types, branch
slugs, schemas, and internal runtime/wisdom headings remain stable. German and English plan and
review templates remain readable; a writer emits one complete language variant per artifact.
See [Configuration](../user-guide/configuration.md#block-language) for the user-facing schema and
[`src/shared/language-rules.md`](../../src/shared/language-rules.md) for the executable contract.

## Source-to-dist model

Effective Flow is **not** a runtime product but a build: `build.mjs` reads the Markdown sources
under `src/` and generates two harness-native artifacts plus one portable manager target under
`dist/`.

- Only `src/` is edited. `dist/` is generated and gitignored – changes there are lost on the
  next build.
- Source and delivery live on **two branches**: `develop` (source, no `dist/`) and the default
  branch `main` (carries only the portable `effective-flow/` payload **and** the consumer-facing docs –
  `README.md` + `docs/user-guide/` –, but **not** the developer docs `docs/developer-guide/`;
  written mechanically by the release workflow). For details see
  [Release and installation](release-and-installation.md#source-and-delivery-branch).
- The source layout **mirrors the output**: the folder determines the category, the file name
  without `.md` the name. There is therefore no `name` or `type` field in the frontmatter.
- Details on the build flow, the placeholders, and the guards are in
  [`build-system.md`](build-system.md).

## Thin router with lazy loading

`src/SKILL.md` is the router: a tool catalog, a dispatch rule, and exactly one behavioral
contract. It never loads all tools up front but references, on the call `/effective-flow <tool>`
(Claude) or `$effective-flow <tool>` (Codex), exactly the one matching `tools/<tool>.md`. This lazy
loading keeps the session lean and avoids token exhaustion from unnecessarily preloaded tool
instructions.

With no `<tool>` or an unknown one, the router only prints the tool list and does nothing else.

**The one documented exception to router thinness** is the eagerly included `session-title`
fragment: a session-level concern that no single tool owns, since a run's title outlives the tool
that produced it. Two things put it in the router. It is read once per session and its trigger
fires in nearly every work-subject run, so a deferred read would cost more than inlining. And at
the time of the decision the context-budget guard left no room anywhere else — `build` and `plan`
sat at exactly the 700-line limit, where even a four-line `lazy-include` pointer per tool would
have failed the build.

That second reason has since expired: the budget refactor returned enough headroom that a per-tool
pointer would now fit. The placement stands on the first reason alone, which is the durable one.
Treat this as a bounded exception, not a precedent: further cross-tool behavior belongs in a tool
or a mode-gated fragment unless it, too, is read once and needed almost always.

The related `session-rename` fragment follows that default rather than the exception: it is
lazily loaded and pointed to from each work-subject tool, not from the router. The router resolves
only eager includes, so a lazy pointer placed in `src/SKILL.md` would register no fragment and
ship a dangling reference.

The same progressive disclosure applies **within** a tool: mode-gated shared fragments (e.g.
worktree delivery, remote tracker, report handling) are no longer inlined eagerly but loaded on
demand via `lazy-include` only at the decision point. Details and the context budget are in
[`build-system.md`](build-system.md) under "Progressive disclosure beyond the router".

Effective Flow knows two building-block types:

| Type       | Description                                  | Invocation                                                   |
| ---------- | -------------------------------------------- | ------------------------------------------------------------ |
| **Tool**   | Workflow or utility instruction              | `/effective-flow <tool>` (loads `tools/<tool>.md`)           |
| **Worker** | specialized contract (implementer, reviewer) | internally by tools as a native or built-in/general subagent |

## Delegation mandate

Invoking a tool is the user's standing request for internal delegation: a harness default that
discourages unrequested sub-agents does not apply inside a run.
[`src/shared/delegation-mandate.md`](../../src/shared/delegation-mandate.md) is the single source
of truth, eagerly included in every delegating tool (`build`, `fix`, `refactor`, `docs`,
`maintain`, `review`, `iterate`, `deliver`, `apply-review`, `apply-issues`, `plan`, `plan-issue`,
`investigate`, `merge-gate`) and in every worker under `src/agents/`; `plan-review` and
`concept-review` carry
it for read-only analysis fan-out only, restating their existing ban on starting implementers,
test writers, validators, and reviewers next to the include. Delegating to a named worker role is
mandatory; analysis and exploration delegation is the default, with a narrow triviality
exception; a worker whose `claude.tools` carries `Agent, Task` may fan out read-only analysis
sub-agents but never re-delegates its own assignment or a write. That grant tracks whether the
worker's own tool list already lists `Write` or `Edit` — a role that produces changes: today eleven
workers qualify and carry `Agent, Task`, while the five observation roles that list neither
(`frontend-reviewer`, `nodejs-reviewer`, `rust-reviewer`, `generic-product-reviewer`,
`code-validator`) omit it and do not delegate at all. For the four reviewers, whose tool list
genuinely cannot write, that omission is the whole read-only guarantee; `code-validator` also
lists `Bash`, so withholding the grant there is defence in depth, not the source of its
read-only property — it only keeps the easy path to a write-capable child closed. The
parenthesised allowlist form `Agent(<type>)` cannot narrow that grant to read-only sub-agents —
it is read as an unrestricted grant, not a type filter, and must not be used in its place. Inline
execution stays legitimate only as a disclosed fallback —
never silent. Workflow-to-workflow delegation (`apply-plan`, `merge-gate` → `iterate`) keeps its own
mechanics and is out of scope for this mandate — which is why `merge-gate` carries the include for
its worker-role delegations (`merge-conflict-resolver`, `code-validator`) while that one handoff
stays exempt. Delegation mechanics are Effective Flow's own
orchestration ownership, so this carries no central-skill relationship under the layered
ownership contract in [`AGENTS.md`](../../AGENTS.md#skill-discovery).

## Source directories

```text
src/
├── SKILL.md      # Router: tool catalog + dispatch, no tool contents
├── tools/        # one .md per tool → every consumer target's tools/<name>.md
├── agents/       # one .md contract per worker → native sidecars + portable resources
└── shared/       # include fragments, embedded via `include` fence
```

- **`src/tools/<name>.md`**: A tool is only callable via `/effective-flow <name>` if its name is
  in exactly one group of `TOOL_GROUPS` in `build.mjs` (see
  [`build-system.md`](build-system.md)). Unlisted tools (e.g. `apply-plan`, `apply-review`,
  `apply-issues`) are **internal**: built but not visible in the router catalog; `apply` loads
  the matching internal instruction on demand depending on the detected source.
- **Deprecated tool aliases**: a renamed exposed tool can keep its old name callable through
  `DEPRECATED_TOOL_ALIASES` in `build.mjs` (see [`build-system.md`](build-system.md)) instead of
  shipping the rename as a breaking change. An alias is also an internal tool source — absent from
  `TOOL_GROUPS`, so it is reachable by name only and never appears in the router catalog, the
  router frontmatter description, or `argument-hint`. The router's dispatch rule still routes it,
  through a generated `{{DEPRECATED_ALIASES}}` clause that names the alias, its replacement, and
  the tool source it forwards to. `pr-review` is such an alias for `merge-gate` today: invoking it
  reports the deprecation once and then forwards the run unchanged to `tools/merge-gate.md`,
  carrying no gate logic of its own. It is removed with the next deliberate major release.
- **`src/agents/<name>.md`**: Workers are **not** `/effective-flow` tools. Workflow tools call
  them internally as subagents. The frontmatter carries native per-harness configuration under
  `claude:` and `codex:`; the body is also the single contract rendered into the portable target.
  Each Claude block requires `model` and `effort`, while each Codex block defines `model` and
  `model_reasoning_effort`. These source fields are the canonical worker-profile assignments.
- **`src/shared/<name>.md`**: Include fragments embedded via the ` ```include ` fence into tools
  and agents (e.g. `delegation-mandate`, `task-tracking`, `skill-discovery`, `goal-completion`)
  or deferred via a ` ```lazy-include ` pointer (e.g. `worktree-integration`, which every one of
  its seven consumers now loads on demand). `execution-location` is the canonical nested fragment
  for repository/root/checkout receipts, write-boundary preflight and ownership-safe cleanup;
  both delivery and `apply-review` component worktrees include it instead of duplicating the
  contract.

## Cross-harness execution locations

Effective Flow treats two absolute Git-verified roots as data, not as ambient process state.
Write-capable workers receive a receipt containing the canonical `EXECUTION_ROOT`, retained
`RUNTIME_STATE_ROOT`, common Git directory, branch or detached OID, origin, setup owner, and
workflow/component purpose. They revalidate it at their first write boundary and after resume
or Handoff.

Before worktree creation or local report-source resolution, Effective Flow parses the first
record of `git worktree list --porcelain` as the main checkout. It rejects bare, missing,
moved, noncanonical, or common-directory-mismatched records and retains the resulting physical
path as `RUNTIME_STATE_ROOT`. Tracked files and Git lifecycle operations use `EXECUTION_ROOT`;
all `.effective-flow/` reads, report-name collision checks, backlinks, memory/cache updates, and
migrations use canonical absolute handles below `RUNTIME_STATE_ROOT`. Prospective paths
canonicalize their nearest existing ancestor, so `..` and existing symlink escapes fail closed.
An in-place main-checkout run has identical roots; linked/native and Effective Flow-owned
worktrees have different roots.

Claude native `isolation: worktree` and Codex app worktrees remain harness-owned. They may be used
or reused where appropriate, and Effective Flow never removes one. Normal implementation does not
nest another delivery worktree around an existing native checkout. The standalone `deliver`
partial-diff lifecycle is the narrow exception: it treats the dirty or detached harness checkout as
immutable source evidence and creates a separate Effective Flow-owned delivery worktree from the
refreshed configured base. The source and delivery receipts remain distinct, and neither may be
substituted for the other.

Effective Flow-created delivery, partial-diff and review-component worktrees have distinct receipts
and may be cleaned up only after fresh ownership and state verification. Cleanup never targets or
alters `RUNTIME_STATE_ROOT`, which is why local reports and memory survive component and delivery
worktree removal.

## Delivery orchestration boundaries

Delivery is split across one orchestrator and two narrow leaf tools:

- `deliver` owns candidate discovery from current-session file-operation evidence, mandatory
  confirmation of the exact file/state manifest as the sole routine approval, automatic derivation
  and non-blocking display of ordered coherent commit groups, exact partition validation, fresh
  branch/worktree creation, selected-state transfer, validation, per-group staging, and verification
  of the resulting commits. There is no commit-group approval or refinement round; unresolved
  grouping stops before staging. The dependency-free `delivery-selection` runtime binds the selected
  staged or working-tree states to source `HEAD`, applies them to the refreshed base with conflict
  detection, and reconciles the exact resulting diff without emitting file content.
- `commit` owns only `git commit` for an already staged diff. It never selects, stages, unstages, or
  validates files. A delivery caller supplies a verified execution-location receipt, declared path
  group, and expected index-tree OID; the result reports enough exact Git state for the caller to
  verify the parent, branch, commit tree, and remaining changes.
- `pr` owns only publication of commits from a prepared branch. A direct call requires a clean,
  attached, non-base checkout. A returning delivery caller supplies the exact head, base, verified
  head OID, and successful commit-only evidence. `pr` never creates or switches a branch, stages or
  commits files, or treats dirt in another checkout as PR content.

After manifest confirmation, `deliver` proceeds automatically through transfer, validation,
sequential commit execution, and PR publication while preserving every fail-closed boundary.
Manifest drift requires redisplay and reconfirmation. It stages and verifies one derived group at a
time. If a later group, hook, receipt check, or tree comparison fails, earlier commits and all
remaining local states stay on the run-owned branch/worktree; no push or PR occurs and no successful
commit is rewritten. Only a clean final branch with a non-empty verified commit range is handed to
`pr`, after the worktree is removed through its ownership-safe lifecycle and the local branch is
retained.

Implementation workflows use the same boundary at handback: they preserve verified earlier
commits, stage only their recorded residual output, call `commit`, verify its receipt, and call `pr`
only for an effective `pr` completion. Completion precedence is established before delivery setup.
Exactly one unambiguous affirmative current-invocation request for `pr`, `merge`, or `branch`
overrides `delivery.completion`; negated, hypothetical, descriptive, or alternative wording does
not. The report records both configured and applied values without mutating configuration.
Invoking `deliver` is itself explicit `pr` intent, so that tool never inherits another completion
action.

## Persisted worktree lifecycle

[`src/shared/worktree-lifecycle.md`](../../src/shared/worktree-lifecycle.md) is the common lifecycle
contract for every Effective Flow-created delivery, partial-diff, and `apply-review` component
worktree. It consumes the canonical execution-location receipt and runtime-state safety contracts
instead of restating repository identity, path containment, ignore, or tracked-state rules. The
delivery and component-worktree creation paths both register through this shared contract;
user-created, reused, and harness-managed worktrees remain outside Effective Flow ownership.

After receipt creation, each owned worktree gets a versioned record under
`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/`. The record binds the session or component,
workflow and purpose, canonical repository and worktree identities, branch and creation OID,
ownership, timestamps, lifecycle status, and branch follow-up policy. Records are atomic,
gitignored runtime state. Every write, replacement, lock, or deletion revalidates the exact
absolute runtime handle through the runtime-state safety guard.

The record's immutable `creationOid` identifies the commit from which the worktree branch was
created; it is not a frozen expected branch tip. Fresh verification requires that `creationOid`
still resolves as a commit and is an ancestor of the current recorded branch tip. Valid committed
work can advance `HEAD`, while rewritten or divergent history that breaks this ancestry fails
closed and blocks cleanup.

The state machine is explicit: creation starts at `active`; durably securing the intended changes
on the branch or completing component integration moves to `cleanup-ready`; controlled stops and
errors move to `aborted` or `failed`.
An eligible cleanup actor serializes a fresh read and validation with a per-record lock, then
claims `cleanup-ready` or `cleanup-failed` as `cleanup-in-progress` with its run ID and timestamp.
A failed normal removal returns to `cleanup-failed`; complete and reverified worktree and branch
cleanup removes only that actor's record. Foreign locks and claims are never stolen, even when
they appear old.

Cleanup derives eligibility from the intersection of independent evidence: owned lifecycle,
matching receipt, current Git registration, branch and purpose agreement, clean status, and the
absence of `locked` or `prunable` attributes. It never targets the main worktree or its own
execution worktree and never uses `--force`, broad `git worktree prune`, or `git branch -D`.
Existing worktrees without a lifecycle record remain diagnostic-only. There is no TTL, heartbeat,
or stale-after configuration: an old `active` or `cleanup-in-progress` record can represent a
crash, but elapsed time cannot prove cleanup eligibility.

Every cleanup run reconciles partial outcomes and reports removed worktrees, failed attempts, and
all remaining linked worktrees except the main worktree. A current linked execution worktree
remains in that final inventory even though it is excluded as a removal target. Each retained
entry carries its checkout identity, observed status, individual retention reason, and safe next
step.

## Three consumer targets

The build generates three independent outputs from the same source:

| Consumer                     | Skill target                    | Worker resolution                                                                                                                                          |
| ---------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native Claude artifact       | `dist/claude/effective-flow/`   | native `.md` agents under `dist/claude/agents/effective-flow-<name>.md`, deployed by `./install-skill.sh local` and `./local-link.sh`                      |
| Native Codex artifact        | `dist/codex/effective-flow/`    | native `.toml` agents under `dist/codex/agents/effective-flow-<name>.toml`, deployed by `./install-skill.sh local` and `./local-link.sh`                   |
| DALO / Skills CLI (end user) | `dist/portable/effective-flow/` | bundled `workers/effective-flow-<name>.md` contracts, loaded one at a time and delegated through the harness's built-in general-purpose subagent mechanism |

All outputs use the same `effective-flow-<name>` worker namespace and carry the same version
stamp. Rendered-reference guards ensure every native reference has an exact sidecar and every
portable reference has an exact worker contract. Portable instructions never request those
identifiers as custom roles: if built-in delegation is unavailable, they fail clearly instead
of pretending that a worker ran.

The release archive retains all three targets for verification and release maintenance; it is
not a supported end-user installation interface. The default branch publishes only the portable
skill at `effective-flow/`, which is the payload consumed by DALO and Skills CLI.

## Caller and worker model profiles

The model running the Effective Flow tool is the **caller**: it interprets the workflow,
delegates work, and integrates the results. Native worker sidecars have independent,
role-specific profiles. Implementers, reviewers, and the merge-conflict resolver use the quality
tier—Claude `opus` with `xhigh` effort and Codex `gpt-5.6-sol` with `high` reasoning effort. Documentation, testing,
validation, and other support roles use the economical tier—Claude `sonnet` with `medium`
effort and Codex `gpt-5.6-luna` with `medium` reasoning effort. The individual files under
`src/agents/` remain the exhaustive source of truth for which role belongs to which tier.

Caller defaults are deliberately documentation rather than generated skill configuration.
This keeps Effective Flow from overriding a user's global or project harness settings and lets
the caller be escalated for unusually ambiguous or architecture-heavy work without changing
the worker fleet. Claude can apply a model or effort override from skill frontmatter for the
current turn, but the next user prompt returns to the session selection; Effective Flow therefore
does not place a caller override in its router. Native worker metadata is rendered only into the
Claude and Codex sidecars.
Portable worker contracts contain no native model metadata; their built-in/general subagents
therefore follow the model-selection behavior of the consuming manager and harness.

## Repo structure at a glance

```text
effective-flow/                        (Repo)
├── src/                      # Sources (see above)
├── docs/                     # Project documentation
│   ├── plan/                 # Implementation plans (ISO-date slug, see plan-conventions.md)
│   ├── user-guide/           # End-user documentation (delivered to main)
│   └── developer-guide/      # this document and its neighbors (develop only)
├── dist/                     # Generated, gitignored
│   ├── claude/               # native skill + agents/effective-flow-*.md
│   ├── codex/                # native skill + agents/effective-flow-*.toml
│   └── portable/effective-flow/ # manager skill + workers/effective-flow-*.md
├── build.mjs                 # Build script (see build-system.md)
├── install-skill.sh          # Default: drives DALO install/update; `local`: native checkout copy
└── local-link.sh             # Developer build + symlink helper
```

## Further reading

- [`build-system.md`](build-system.md) – build flow, placeholder syntax, guards.
- [`plan-conventions.md`](plan-conventions.md) – naming scheme and lifecycle of the plan files.
- [`release-and-installation.md`](release-and-installation.md) – versioning and installation.
- [`AGENTS.md`](../../AGENTS.md) – canonical agent behavior rules, skill discovery, commit and
  no-AI-attribution rules.
