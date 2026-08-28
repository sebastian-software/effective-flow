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

| Central skill           | Effective-Flow consumer(s)                                                                                                                                                                                                                                                                                                                                                    | Classification                                                                                                                                                                                                              | Domain coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `effective-delivery`    | `maintain`, `deliver`, `docs`, `review`, `refactor`, `build`, `fix`, `iterate`, `apply-issues`, `apply-review-remote`, `worktree-integration`, `code-validator`, `docs-writer`, `code-documenter`, `documentation-sync-contract`; `dependency-version-policy`, `plan`, `plan-issue`, `plan-review`, `concept-review`, `generic-product-reviewer`, `test-writer`, `e2e-tester` | delegate for the delivery, dependency-maintenance, documentation and validation consumers; route-when-relevant for the dependency-introduction policy, planning, concept review, generic product review and the test agents | The skill owns the delivery arc on an existing repository: audit and improvement judgment, PR-level review-item judgment through its read-only caller-owned Mode C handoff, dependency research and upgrade execution, repository-native command discovery and safe execution, technical and migration documentation, and behavior-preserving ports across languages, runtimes and frameworks. Effective Flow retains routing, artifact and finding contracts, scorecard gates, validation mode and phase gates, target-path approval, worktrees, commits, forge plumbing, and delivery.                                                                                                                           |
| `effective-web`         | `frontend-reviewer`, `ui-implementer`; `test-writer`, `e2e-tester`; `plan`, `plan-review`, `concept`, `concept-review` via relevance gate                                                                                                                                                                                                                                     | delegate for reviewer/UI; route-when-relevant for the test agents, planning and concepts                                                                                                                                    | The skill owns browser experiences end to end: accessibility, CSS architecture, React, layout, typography, forms, internationalization, browser performance, frontend testing, and the web-legal disclosure and consent surfaces a plan or concept can cross into. Effective Flow retains routing, output contracts, and the test, plan and concept lifecycle with its no-code boundary.                                                                                                                                                                                                                                                                                                                           |
| `effective-engineering` | `test-writer`; `e2e-tester`, `nodejs-reviewer`, `rust-reviewer`; `plan`, `plan-review`, `concept`, `concept-review` via relevance gate                                                                                                                                                                                                                                        | delegate for focused non-frontend tests; route-when-relevant for E2E, the specialist reviewers, planning and concepts                                                                                                       | The skill owns system and data design together with focused non-frontend test design: service and module boundaries, quality attributes, data models and schema evolution, TypeScript and Rust contracts, fixtures, doubles, failure paths, flake diagnosis, and repository-native benchmark evidence. Browser testing stays with `effective-web`, the specialist reviewers keep their line-level checks, and Effective Flow retains assigned scenarios, artifacts, and delivery.                                                                                                                                                                                                                                  |
| `effective-writing`     | `language-rules`, `docs-writer`, `code-documenter`, `marketing-writer`; `iterate`, `pr`                                                                                                                                                                                                                                                                                       | delegate for the language and writing workers; route-when-relevant for forge prose                                                                                                                                          | Effective Flow delegates two areas of the skill here: locale-specific visible punctuation, spacing, number and date forms for `language-rules`, `docs-writer`, `code-documenter` and `marketing-writer`, and natural US team English for the `iterate` and `pr` forge prose. The boundary is explicit: durable technical documentation stays with `effective-delivery` and market claims stay with `effective-marketing`, so this row owns neither documentation nor marketing prose craft; marketing copy craft sits with the allowlisted `copywriting`, `copy-editing` and `marketing-psychology` skills. Effective Flow retains its language policy, workflow state, forge interaction, and document structure. |
| `effective-product`     | `concept`, `concept-review`; `apply-review` through `adr-convention`; `plan`, `plan-review` via relevance gate                                                                                                                                                                                                                                                                | delegate for the concept workflows and ADR authoring; route-when-relevant for planning                                                                                                                                      | The skill owns evidence-based product decisions and the records that fix them: outcomes, scope, prioritization and release judgment, design research, problem framing, information architecture and flows, and ADR merit and authoring against the repository's declared living-ADR convention. Effective Flow retains candidate mapping, approval, status, backlinks, summary tracking, and the plan and concept lifecycle.                                                                                                                                                                                                                                                                                       |

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

Run `node build.mjs` to reconcile all declared relationships, this table, every
`## Recommended skills` fallback token, and the structured relevance-gate marker. Use
`pnpm audit:skill-ownership -- <local-skills-directory>` only as a non-blocking review aid for a
local upstream checkout.

## See also

- `src/shared/skill-discovery.md` – the operative skill-discovery and authority contract.
- [Architecture](architecture.md) – the overall structure of Effective Flow.
- [`AGENTS.md`](../../AGENTS.md) – skill-discovery mechanics and contributor conventions.
