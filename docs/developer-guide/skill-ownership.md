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

## Ownership inventory

The build reads only the table between the markers below. Every row represents one skill from
the relationship manifest; row membership is machine-reconciled exactly. Consumer,
classification, and coverage cells deliberately remain grouped explanatory prose for readability;
the manifest is authoritative for their structured values.

<!-- skill-ownership-table:start -->

| Central skill              | Effective-Flow consumer(s)                                                                                                                | Classification                                                                       | Domain coverage                                                                                                                                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `locale-typography`        | `language-rules`, `code-documenter`, `docs-writer`, `marketing-writer`                                                                    | delegate                                                                             | Locale-specific visible typography is centrally owned. Effective Flow retains its language policy and artifact structure.                                                                                                                                                           |
| `effective-web`            | `frontend-reviewer`, `ui-implementer`; `test-writer`, `e2e-tester`; `plan`, `plan-review`, `concept`, `concept-review` via relevance gate | delegate for reviewer/UI; route-when-relevant for test agents, planning and concepts | Accessibility, browser performance, CSS architecture, React, forms, and internationalization come from the central owner. Effective Flow retains routing, output contracts, and the test, plan and concept lifecycle.                                                               |
| `smart-dependency-updater` | `maintain`; `dependency-version-policy`                                                                                                   | delegate for maintenance; route-when-relevant for introduction                       | The skill owns dependency selection, introduction, ecosystem detection, grouping, release research, compatibility adjustment, lockfile handling, validation strategy, and update reporting. Effective Flow retains scope, commits, worktrees, and delivery.                         |
| `tech-docs`                | `docs`, `docs-writer`, `code-documenter`                                                                                                  | delegate                                                                             | The skill owns technical-documentation discovery, audience and task analysis, information architecture, interface and migration guidance, executable examples, in-code documentation, and verification. Effective Flow retains categories, paths, language, approval, and delivery. |
| `software-testing`         | `test-writer`; `e2e-tester`                                                                                                               | delegate for focused non-frontend tests; route-when-relevant for E2E                 | The skill owns focused non-frontend test design and implementation, fixtures, doubles, failure paths, flake diagnosis, and repository-native benchmark evidence. Browser testing remains with `effective-web`; Effective Flow retains assigned scenarios and delivery.              |
| `software-validation`      | `code-validator`; `test-writer`, `e2e-tester`                                                                                             | delegate for validation; route-when-relevant for execution-only test work            | The skill owns repository-native command discovery, deduplication, safe execution, process cleanup, terminal states, and evidence-gap reporting. Effective Flow retains assigned buckets, full/quick/off mode, phase gates, and delivery.                                           |
| `effective-workflow`       | `skill-discovery`                                                                                                                         | no-overlap                                                                           | This is an alternative repository-native orchestrator for direct use, not domain expertise to load inside Effective Flow. Effective Flow suppresses recursive orchestration while preserving the skill's independent use outside an `/effective-flow` run.                          |
| `codebase-improvement`     | `review`, `refactor`, `plan`, `plan-issue`, `plan-review`, `concept-review`, `generic-product-reviewer`                                   | route-when-relevant                                                                  | The skill owns generic audit and plan-quality judgment, including at the concept-artifact level. Effective Flow retains routing, artifacts, finding IDs, scorecard gates, reports, and delivery.                                                                                    |
| `port-codebases`           | `refactor` cross-language branch                                                                                                          | route-when-relevant                                                                  | The skill owns behavior-preserving cross-language, runtime, framework, platform, storage, and major-API migration guidance.                                                                                                                                                         |
| `software-architecture`    | `nodejs-reviewer`, `rust-reviewer`; `plan`, `plan-review`, `concept`, `concept-review` via relevance gate                                 | route-when-relevant                                                                  | The skill adds architecture judgment. Specialist reviewers retain their line-level checks, and planning or concept work loads it only after crossing the architecture boundary.                                                                                                     |
| `decision-records`         | `apply-review` through `adr-convention`; `concept-review` via relevance gate                                                              | delegate for ADR authoring; route-when-relevant for concept ADR candidates           | The skill decides ADR merit and authors against the repository’s declared living-ADR convention. The concept review only marks candidates and writes no ADR. Effective Flow retains candidate mapping, approval, status, backlinks, and summary tracking.                           |
| `product-management`       | `concept`, `concept-review`; `plan`, `plan-review` via relevance gate                                                                     | delegate for the concept workflows; route-when-relevant for planning                 | Product outcomes, audience, prioritization, and release judgment. The concept workflows delegate their product judgment outright; planning loads it only when a plan crosses the product boundary.                                                                                  |
| `product-design`           | `plan`, `plan-review`, `concept`, `concept-review` via relevance gate                                                                     | route-when-relevant                                                                  | The available central skill owns research, problem framing, information architecture, flows, and prototyping when a plan or concept crosses the design boundary.                                                                                                                    |
| `metro-english`            | `iterate`, `pr`, `docs-writer`, `code-documenter`                                                                                         | route-when-relevant                                                                  | The skill owns professional English prose for thread replies, PR text, and documentation prose. Effective Flow retains workflow state, forge interaction, and document structure.                                                                                                   |
| `web-legal-compliance`     | `plan`, `plan-review`, `concept-review` via relevance gate                                                                                | route-when-relevant                                                                  | The skill owns legal-disclosure and compliance judgment when a plan or concept crosses the web-legal boundary. Effective Flow retains the plan and concept lifecycle and their no-code boundary.                                                                                    |
| `pr-review`                | `iterate`                                                                                                                                 | delegate                                                                             | The skill owns reusable PR-feedback judgment through its read-only caller-owned handoff. Effective Flow retains current-context gathering, approval, implementation, commits, forge plumbing, and delivery.                                                                         |

<!-- skill-ownership-table:end -->

Recommendations that do not belong to the central collection’s ownership contract are kept in
the manifest’s explicit `externalRecommendationAllowlist`. This includes fallback chains such as
`effective-web › impeccable › frontend-design` and `metro-english › humanizer`, plus other
deliberate external recommendations. Every token still has to be declared, so a typo cannot be
mistaken for an external skill.

## Deliberate boundaries

- **`codebase-improvement` and the audit/planning consumers:** The central skill owns reusable
  evidence, impact, prioritization, complexity, root-cause, scope, and risk judgment. Effective
  Flow retains specialist line-level checks and every orchestration/artifact contract. The
  minimal fallbacks in `central-reasoning-delegation.md` and
  `audit-reasoning-delegation.md` keep the tools functional when the owner is unavailable.
- **`software-architecture` and specialist reviewers:** Architecture reasoning augments rather
  than replaces the Node.js and Rust line-level security, performance, and error-handling checks.
- **`decision-records` and `apply-review`:** ADR craft is delegated, while Effective Flow maps a
  rejected finding into a decision candidate and retains user approval and tracking.
- **`pr-review` and `iterate`:** `iterate` uses the caller-owned
  `pr-review-handoff/v1` analysis contract for classification. Effective Flow still gathers
  current context, approves and implements selected work, owns Git and forge mutations, and
  resolves or replies to threads.
- **`tech-docs` and the documentation workers:** The central skill owns documentation craft and
  verification. Effective Flow keeps its optional standard categories, approved target paths,
  language resolution, worker model profiles, plan/report state, and delivery lifecycle.
- **`software-testing`, `software-validation`, and test/validation workers:** The central skills
  own reusable evidence design and existing-command execution. Effective Flow keeps scenario and
  bucket assignment, validation mode, phase gates, agent profiles, and delivery.
- **`effective-workflow` and skill discovery:** Both skills orchestrate broad software work.
  Nesting one inside the other would create competing lifecycle and delivery owners, so the
  central skill remains a direct-use alternative and is never dynamically loaded by an active
  Effective Flow tool or agent.
- **Remote tracker adapter:** Effective Flow owns its issue/finding schemas, IDs, compatibility
  aliases, Forgejo support, provider-neutral helper, and orchestration. `pr-review` continues to
  own reusable GitHub PR review judgment; the helper centralizes deterministic transport and
  never carries review-policy reasoning.

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
