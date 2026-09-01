# Skill ownership

Effective Flow uses the central [skills collection](https://github.com/sebastian-software/skills.sebastian-software.com)
as the source for reusable domain expertise. This document describes the boundary between what
**Effective Flow itself owns** (orchestration) and what the **central skills own** (domain
expertise).

The adjacent [`skill-ownership.json`](skill-ownership.json) manifest is the machine-readable
source of truth. This guide is its human-readable explanation.

## Loose-coupling contract

The ownership inventory contains only relationships that Effective Flow actually uses or
explicitly declares. It is not a synchronized copy of the upstream catalog:

- a new, removed, or changed upstream skill creates no maintenance obligation until Effective
  Flow recommends it, names it as a relevance-gate owner, or deliberately establishes another
  relationship;
- absence from the manifest means “no currently declared Effective Flow relationship,” not
  “reviewed and excluded against an exhaustive upstream inventory”;
- `provenance.lastReviewedAt` and `provenance.observedRevision`, when present, record the context
  of a human review. They are informational, not compatibility pins, and normal builds never
  compare them with an upstream repository;
- upstream discovery is an optional maintainer audit. Candidates are reviewed manually rather
  than copied into the manifest automatically.

Update the manifest and this table together only when an actual relationship changes.

## The layered contract

The earlier contract read “a skill informs the how, Effective Flow’s rules always win.” It is
replaced by a **layered** model (the operative rule lives in `src/shared/skill-discovery.md`):

- **Effective Flow owns the orchestration** – the **what/when**: `/effective-flow` routing and
  user interaction; plan/report state, finding IDs, backlinks, tracker integration,
  resumability; agent selection, parallelization, baseline comparison, worktrees, commits,
  delivery; Claude/Codex transformation; and Effective Flow configuration. This layer always
  takes precedence.
- **Central skills own reusable expertise** – the **how**: domain checklists, heuristics,
  standards, research procedures, specialist implementation/review guidance, and reusable
  artifact conventions where a skill declares this scope.

If a central skill is the **declared domain owner** for a subject **and** covers it, its guidance
is **authoritative** – not optional advice. The respective Effective Flow source then carries
**no second copy** of that playbook, only scope, output, and lifecycle constraints plus a
**minimal generic fallback** for the case that the skill is missing (`skills.enabled: false`,
disabled via `exclude`, or not installed).

## Classification

Each intersection – that is, each pair of a central skill and an Effective Flow tool or agent –
belongs in exactly one class. A skill with multiple consumers can therefore have different
classifications per consumer:

- **delegate** – the central skill is authoritative; Effective Flow is a thin adapter and
  carries only orchestration plus a minimal fallback.
- **route-when-relevant** – the central skill owns only a special branch; the Effective Flow
  guidance stays leading and routes when needed.
- **no-overlap** – the Effective Flow behavior is genuinely product-specific or deliberately
  divergent; no domain transfer.

`no-overlap` currently has no instances. The manifest’s only entry was dropped together with
`effective-workflow`, and the nearest candidate – the merge gate – is recorded as an absent
relationship rather than a classified one (see “Deliberate boundaries”). The class stays defined and
the validator keeps accepting it, for the next genuinely divergent intersection.

## Ownership inventory

The build reads only the table between the markers below. Every row represents one skill from
the relationship manifest; row membership is machine-reconciled exactly. Consumer,
classification, and coverage cells deliberately remain grouped explanatory prose for readability;
the manifest is authoritative for their structured values.

<!-- skill-ownership-table:start -->

| Central skill           | Effective-Flow consumer(s)                                                                                                                                                                                                                                                                                                                                                                                                          | Classification                                                                                                                                                                                                                                            | Domain coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effective-delivery`    | `maintain`, `deliver`, `docs`, `review`, `refactor`, `build`, `fix`, `iterate`, `apply-issues`, `apply-review-remote`, `worktree-integration`, `code-validator`, `docs-writer`, `code-documenter`, `documentation-sync-contract`; `dependency-version-policy`, `plan`, `plan-issue`, `plan-review`, `concept-review`, `generic-product-reviewer`, `test-writer`, `e2e-tester`, `generic-implementer`, `generic-product-implementer` | delegate for the delivery, dependency-maintenance, documentation and validation consumers; route-when-relevant for the dependency-introduction policy, planning, concept review, generic product review, the test agents and the two generic implementers | The skill owns the delivery arc on an existing repository: audit and improvement judgment, PR-level review-item judgment through its read-only caller-owned Mode C handoff, dependency research and upgrade execution, repository-native command discovery and safe execution, technical and migration documentation, and behavior-preserving ports across languages, runtimes and frameworks. The tooling-only `generic-implementer` and the reduced-depth `generic-product-implementer` reach it for that discovery layer; its "not for writing system code or browser experiences" boundary aims at product and browser work, not at CI, build and repository metadata. Effective Flow retains routing, artifact and finding contracts, scorecard gates, validation mode and phase gates, target-path approval, worktrees, commits, forge plumbing, and delivery. |
| `effective-web`         | `frontend-reviewer`, `ui-implementer`; `test-writer`, `e2e-tester`; `plan`, `plan-review`, `concept`, `concept-review` via relevance gate                                                                                                                                                                                                                                                                                           | delegate for reviewer/UI; route-when-relevant for the test agents, planning and concepts                                                                                                                                                                  | The skill owns browser experiences end to end: accessibility, CSS architecture, React, layout, typography, forms, internationalization, browser performance, frontend testing, and the web-legal disclosure and consent surfaces a plan or concept can cross into. Effective Flow retains routing, output contracts, and the test, plan and concept lifecycle with its no-code boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `effective-engineering` | `test-writer`, `rust-implementer`, `nodejs-implementer`; `e2e-tester`, `nodejs-reviewer`, `rust-reviewer`; `plan`, `plan-review`, `concept`, `concept-review` via relevance gate                                                                                                                                                                                                                                                    | delegate for focused non-frontend tests and for the Rust and Node.js implementers; route-when-relevant for E2E, the specialist reviewers, planning and concepts                                                                                           | The skill owns system and data design together with focused non-frontend test design: service and module boundaries, quality attributes, data models and schema evolution, TypeScript and Rust contracts, fixtures, doubles, failure paths, flake diagnosis, and repository-native benchmark evidence. The two implementers delegate asymmetrically on purpose: Rust hands over its whole domain playbook, while the Node.js implementer delegates only the TypeScript language layer and retains what a reader of `route-typescript.md` cannot reach (see "Deliberate boundaries"). Browser testing stays with `effective-web`, the specialist reviewers keep their line-level checks, and Effective Flow retains assigned scenarios, artifacts, and delivery.                                                                                                      |
| `effective-writing`     | `language-rules`, `docs-writer`, `code-documenter`, `marketing-writer`; `iterate`, `pr`                                                                                                                                                                                                                                                                                                                                             | delegate for the language and writing workers; route-when-relevant for forge prose                                                                                                                                                                        | Effective Flow delegates two areas of the skill here: locale-specific visible punctuation, spacing, number and date forms for `language-rules`, `docs-writer`, `code-documenter` and `marketing-writer`, and natural US team English for the `iterate` and `pr` forge prose. The boundary is explicit: durable technical documentation stays with `effective-delivery` and market claims stay with `effective-marketing`, so this row owns neither documentation nor marketing prose craft; marketing copy craft sits with `effective-marketing`, with `copywriting`, `copy-editing` and `marketing-psychology` allowlisted behind it as an ordered fallback. Effective Flow retains its language policy, workflow state, forge interaction, and document structure.                                                                                                 |
| `effective-product`     | `concept`, `concept-review`; `apply-review` through `adr-convention`; `plan`, `plan-review` via relevance gate                                                                                                                                                                                                                                                                                                                      | delegate for the concept workflows and ADR authoring; route-when-relevant for planning                                                                                                                                                                    | The skill owns evidence-based product decisions and the records that fix them: outcomes, scope, prioritization and release judgment, design research, problem framing, information architecture and flows, and ADR merit and authoring against the repository's declared living-ADR convention. Effective Flow retains candidate mapping, approval, status, backlinks, summary tracking, and the plan and concept lifecycle.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `effective-marketing`   | `marketing-writer`                                                                                                                                                                                                                                                                                                                                                                                                                  | delegate for the root README's positioning copy                                                                                                                                                                                                           | The skill owns positioning, messaging, claims and proof, and the commercial page copy that carries them. Effective Flow's only marketing surface is the root `README.md`, and the skill claims no README as an artifact of its own. The split is declared by `effective-delivery` instead: a root README may contain technical onboarding owned there and product positioning owned here. `marketing-writer` records that split rather than inventing a single owner. `copywriting`, `copy-editing` and `marketing-psychology` stay allowlisted behind it as an ordered fallback. Effective Flow retains the write boundary, the documentation-target resolution, the follow-up-link invariant, and language resolution.                                                                                                                                             |

<!-- skill-ownership-table:end -->

Recommendations that do not belong to the central collection’s ownership contract are kept in
the manifest’s explicit `externalRecommendationAllowlist`. This includes fallback chains such as
`effective-web › impeccable › frontend-design` and `effective-writing › humanizer`, plus other
deliberate external recommendations. Every token still has to be declared, so a typo cannot be
mistaken for an external skill.

## Deliberate boundaries

- **`effective-delivery` and the audit/planning consumers:** The central skill owns reusable
  evidence, impact, prioritization, complexity, root-cause, scope, and risk judgment. Effective
  Flow retains specialist line-level checks and every orchestration/artifact contract. The
  minimal fallbacks in `central-reasoning-delegation.md` and
  `audit-reasoning-delegation.md` keep the tools functional when the owner is unavailable.
- **`effective-engineering` and specialist reviewers:** Architecture and data-design reasoning
  augments rather than replaces the Node.js and Rust line-level security, performance, and
  error-handling checks.
- **`effective-engineering` and the two specialist implementers — asymmetric on evidence.** A
  coverage audit against the pinned upstream checkout put the two languages in different
  positions, so identical treatment would be wrong in one of them. `rust-implementer` delegates
  its domain playbook: the skill's Rust route covers ownership and borrowing, `unsafe` and its
  safety proof, visibility and crate structure, trait and conversion design, the public-API semver
  surface, and Cargo/workspace/MSRV discovery, each in more depth than the agent carried. Logging,
  security and database access reach the route through
  `rust-architecture-and-boundaries.md` and the Data route, and toolchain commands through
  `rust-quality-and-review.md`, so those go too. **CLI contracts stay**, under the same
  route-reachability rule applied below to Node: exit codes, stream separation and `--help` live
  only in `cli-contracts.md`, which hangs off the testing route, and `route-rust.md` cross-links
  that route solely for test placement, public-API coverage, doctests and smoke evidence — a
  reader of the Rust route never reaches them. The named crate defaults (`anyhow`, `tokio`,
  `clap`, `diesel` and their siblings) survive only inside the agent's minimal fallback, because
  the skill deliberately names no crates and routes crate selection to `effective-delivery`.
  `nodejs-implementer`, by contrast, delegates **only** the TypeScript language layer and stays
  an owner of the rest. The retention rule is
  **route reachability**: material stays in the agent while a reader of the skill's TypeScript
  route cannot get to it, even when the skill covers it elsewhere. HTTP routing, status codes and
  middleware, worker threads, child processes, event emitters, rate limiting, security headers,
  and TypeScript-side database access are absent from that route entirely; environment
  configuration, request logging and `SIGTERM`/`SIGINT` shutdown sit behind the architecture
  route and CLI contracts behind the testing route. The rule is recorded in the agent source
  itself, so the standing obligation is one re-testable question — is this reachable from the
  TypeScript route now? — rather than a boundary a later reader has to re-derive. The house rule
  `pnpm exec` over `npx` is retained deliberately: the skill stays package-manager agnostic, so
  cutting it would be a behavior change disguised as delegation.
- **`effective-marketing` and the root README.** The skill's copy craft is authoritative for
  positioning, messaging, claims and proof, but it treats no README as an artifact of its own and
  its routing boundaries are silent on them. The split is declared by `effective-delivery`, twice
  and identically: a root README may contain technical onboarding owned there and product
  positioning owned by `effective-marketing`. `marketing-writer` records that split rather than
  pretending a single owner exists, and keeps `copywriting`, `copy-editing` and
  `marketing-psychology` as an ordered fallback so a project without the central skill does not
  lose the craft. Effective Flow retains the write boundary, documentation-target resolution, the
  follow-up-link invariant, and language resolution.
- **`effective-product` and `apply-review`:** ADR craft is delegated, while Effective Flow maps a
  rejected finding into a decision candidate and retains user approval and tracking.
- **`effective-delivery` and `iterate`:** `iterate` uses the caller-owned
  `pr-review-handoff/v1` analysis contract for classification. Effective Flow still gathers
  current context, approves and implements selected work, owns Git and forge mutations, and
  resolves or replies to threads.
- **`effective-delivery` and `deliver`:** The central skill supplies repository-native validation
  discovery and execution for the isolated delivery checkout. Effective Flow retains the complete
  local-change orchestration contract: deriving and confirming the session-owned selection,
  automatically deriving, displaying, and validating the ordered commit partition after that sole
  routine approval, creating and tracking the fresh worktree and branch, staging each group,
  delegating commits, verifying the exact committed handoff, and publishing it through `pr`. The
  workflow source therefore carries no second validation playbook.
- **`effective-delivery` and Effective Flow's own reviewer findings:** the shared
  `pr-review-integration` fragment hands Effective Flow's own reviewer findings to the same
  caller-owned Mode C contract, reached from `{{SKILL:review}}` when its argument resolves to a
  pull request, from the delivery completion step in `worktree-integration`, and from the two
  delivery paths that create pull requests without it, `apply-review-remote` and `apply-issues`.
  The skill supplies only the PR-level judgment; Effective Flow retains scope, agent fan-out, the
  design-decision filter, the security disclosure gate, finding IDs, publication, idempotency, and
  freshness. The skill's autonomous Mode A is deliberately not used, because it decides and posts
  on its own and would bypass the security disclosure gate that `src/tools/review.md` declares
  unconditional. Because skill discovery honours only the per-tool `## Recommended skills`
  sections, every entry point that can reach the trigger recommends `effective-delivery` itself:
  besides `review`, `apply-issues`, and `apply-review-remote`, the delivering workflows `build`,
  `refactor`, `maintain`, `fix`, and `docs` do, so the judgment is not silently skipped there.
- **`effective-delivery` and the documentation workers:** The central skill owns documentation
  craft and verification. Effective Flow keeps its optional standard categories, approved target
  paths, language resolution, worker model profiles, plan/report state, and delivery lifecycle. Its
  prescribed standard doc structure is a default, not a mandate: when the skill's repository
  discovery reports an established documentation structure, that structure wins. Effective Flow
  defines no local test for "established" — that judgment belongs to the skill, while the write
  boundary and target-path approval stay here. The `documentation-sync-contract` fragment is the
  same relationship inside the implementation tools: it owns when the documentation phase runs,
  which surfaces are in scope, and what counts as a finished verdict, and delegates every judgment
  about the documentation itself to the skill.
- **`effective-engineering`, `effective-delivery`, and test/validation workers:** The central
  skills own reusable evidence design and existing-command execution. Effective Flow keeps scenario
  and bucket assignment, validation mode, phase gates, agent profiles, and delivery.
- **`effective-delivery` and `merge-gate` — no relationship, by design.** The merge gate, exposed
  as `/effective-flow merge-gate`, resolves a pull request, waits for checks, runs the
  automatic-reviewer round, and merges. It performs no review-item judgment itself and is forbidden
  from loading `effective-delivery`, which brings its own approve and request-changes submissions,
  its own CI recovery, and its own summary conventions — all three of which the gate's workflow
  excludes. The exclusion costs the gate the whole delivery skill rather than only its review half,
  and that is the accepted trade. Every review-driven and CI-driven code change is delegated instead
  to `{{SKILL:iterate}}` (the `iterate` tool), which is where the skill's caller-owned Mode C
  handoff actually runs (see the two bullets above); the one code-affecting decision that does not go
  there — resolving a conflict with the base — goes to the `merge-conflict-resolver` worker, which
  declares no recommended central skill at all and therefore adds no relationship either. The gate
  declares **no** consumer relationship with the skill, in the manifest or in the table above. Do not
  add one, and do not record it as a `no-overlap` row either: the gate reaches the skill only
  indirectly, through a tool that declares the relationship for itself, so there is no intersection
  to classify — `no-overlap` describes a divergent overlap, not an absent one. Until the central
  collection was consolidated this bullet also had to separate the skill from the identically named
  deprecated tool `/effective-flow pr-review`; that collision is historical, because the skill is now
  `effective-delivery` and every remaining `pr-review` token belongs to the families listed next.
- **The surviving `pr-review` literals are not a central skill.** No skill carries that name any
  more, so a repository-wide sweep for it finds only names that belong to other concepts and must
  stay: the deprecated tool `src/tools/pr-review.md` with its tool token and its
  `DEPRECATED_TOOL_ALIASES` entry; the shared fragments `src/shared/pr-review-comments.md`,
  `src/shared/pr-review-thread-writes.md` and `src/shared/pr-review-integration.md` with their
  include tokens; the caller-owned handoff schema id `pr-review-handoff/v1`; the helper operations
  `pr-reviews-read` and `pr-review-comment-build`;
  the marker `<!-- effective-flow-pr-review -->`; the comment-kind enum value `'pr-review'` in
  `src/scripts/remote-tracker-core.mjs`; and two distinct camelCase configuration namespaces —
  `delivery.prReview`, which decides whether a delivery publishes its own findings onto the pull
  request it created, and the legacy `prReview.*` merge-gate block, still read for one compatibility
  generation as the fallback behind `mergeGate.<key>` (see `src/shared/config-merge-gate-keys.md` and
  `src/tools/merge-gate.md`). Those two namespaces mean entirely different things and are never read
  for one another. Renaming any of these crosses a concept boundary. What is frozen is each name,
  not each file's contents: `pr-review-integration.md` names the central skill in its body and was
  retargeted with all other ownership prose.
- **Remote tracker adapter:** Effective Flow owns its issue/finding schemas, IDs, compatibility
  aliases, Forgejo support, provider-neutral helper, and orchestration. `effective-delivery`
  continues to own reusable GitHub PR review judgment; the helper centralizes deterministic
  transport and never carries review-policy reasoning.

## Retired names

Upstream consolidated fourteen central skills into five: four newly merged successors, plus the
pre-existing `effective-web`, which absorbed one entry. A fifteenth, `effective-workflow`, has no
central successor at all. The inventory above therefore no longer shows which pre-merge skill a
relationship came from; that assignment is recorded in the table below, the only table in this guide
that maps a retired name to its successor. `pr-review` also appears above, under "Deliberate
boundaries", but there it is a frozen literal rather than a skill name:

| Retired skill              | Successor               |
| -------------------------- | ----------------------- |
| `codebase-improvement`     | `effective-delivery`    |
| `pr-review`                | `effective-delivery`    |
| `smart-dependency-updater` | `effective-delivery`    |
| `tech-docs`                | `effective-delivery`    |
| `port-codebases`           | `effective-delivery`    |
| `software-validation`      | `effective-delivery`    |
| `software-testing`         | `effective-engineering` |
| `software-architecture`    | `effective-engineering` |
| `product-management`       | `effective-product`     |
| `product-design`           | `effective-product`     |
| `decision-records`         | `effective-product`     |
| `metro-english`            | `effective-writing`     |
| `locale-typography`        | `effective-writing`     |
| `web-legal-compliance`     | `effective-web`         |
| `effective-workflow`       | Effective Flow itself   |

`effective-workflow`'s scope is this repository, so the relationship was dropped rather than
renamed, and the rule it carried survives as the self-recursion guard in
`src/shared/skill-discovery.md`.

## Ownership check when extending

When adding or extending a tool, agent, or shared include, ask whether the change carries a
second copy of a centrally owned playbook. If it does, delegate to the skill, retain only a
minimal fallback, and add or update the concrete consumer relationship in both manifest and
table. If the source recommends a non-relationship skill as an external alternative, add that
token deliberately to the external recommendation allowlist.

Two build guards now enforce what used to be convention, so neither half of the check can be
forgotten. Every `src/agents/*.md` must carry a `## Recommended skills` section or appear in
`SKILL_RECOMMENDATION_EXEMPT_AGENTS` in `build.mjs` with a one-line reason — the set is two-sided,
so an exempt agent must carry no section and an exemption for a deleted agent is stale. In the
other direction, a declared relationship must be reachable from a recommendation. That check is
strict where the contract is strict: a **`delegate`** consumer must name its owner itself, because
that pair is the whole layered contract and a sibling consumer must not be able to keep a dead
relationship looking alive. A `route-when-relevant` consumer is checked per relationship, since a
relevance-gate consumer reaches its owner through the structured marker rather than a section.
Shared-fragment consumers are exempt by kind, because a fragment expresses its ownership as prose
inside the tool that embeds it and can never carry a section of its own. The
roster guard covers agents only: `src/shared/skill-discovery.md` states that a missing section is
legitimate for a tool, and tools such as `version` or `cleanup` have no domain owner to name.

Run `node build.mjs` to reconcile all declared relationships, this table, every
`## Recommended skills` fallback token, and the structured relevance-gate marker. Use
`pnpm audit:skill-ownership -- <local-skills-directory>` only as a non-blocking review aid for a
local upstream checkout.

## See also

- `src/shared/skill-discovery.md` – the operative skill-discovery and authority contract.
- [Architecture](architecture.md) – the overall structure of Effective Flow.
- [`AGENTS.md`](../../AGENTS.md) – skill-discovery mechanics and contributor conventions.
