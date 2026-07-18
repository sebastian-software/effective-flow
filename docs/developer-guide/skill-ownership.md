# Skill ownership

Effective Flow uses the central [skills collection](https://github.com/sebastian-software/skills.sebastian-software.com)
as the source for reusable domain expertise. This document describes the boundary between what
**Effective Flow itself owns** (orchestration) and what the **central skills own** (domain
expertise), plus an inventory that classifies each intersection with the current skillset.

## The layered contract

The earlier contract read "a skill informs the how, Effective Flow's rules always win". It is
replaced by a **layered** model (the operative rule lives in `src/shared/skill-discovery.md`):

- **Effective Flow owns the orchestration** – the **what/when**: `/effective-flow` routing and
  user interaction; plan/report state, finding IDs, backlinks, tracker integration,
  resumability; agent selection, parallelization, baseline comparison, worktrees, commits,
  delivery; Claude/Codex transformation and the Effective Flow configuration. This layer always
  takes precedence.
- **Central skills own reusable expertise** – the **how**: domain checklists, heuristics,
  standards, research procedures, specialist implementation/review guidance, and reusable
  artifact conventions where a skill declares this scope.

If a central skill is the **declared domain owner** for a subject **and** covers it, its guidance
is **authoritative** – not optional advice. The respective Effective Flow source then carries
**no second copy** of that playbook, only scope, output, and lifecycle constraints plus a
**minimal generic fallback** for the case that the skill is missing (not installed,
`skills.enabled: false`, or deactivated via `exclude`).

## Classification

Each intersection – that is, each pair of a central skill and an Effective-Flow tool/agent –
belongs in exactly one class. A skill with multiple consumers can therefore be classified
differently per consumer (e.g. `effective-web`: delegate for the reviewer/UI, route for the test
agents):

- **delegate** – the central skill is authoritative; Effective Flow is a thin adapter and
  carries only orchestration + minimal fallback.
- **route-when-relevant** – the central skill owns only a special branch; the Effective Flow
  guidance stays leading and routes when needed.
- **no-overlap** – the Effective Flow behavior is genuinely product-specific or deliberately
  divergent; no domain transfer.

## Ownership inventory (current default-branch skillset)

| Central skill              | Effective-Flow tool(s)/agent(s)                                                                        | Classification                                     | Domain coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `locale-typography`        | `src/shared/language-rules.md` (typography part), `code-documenter`, `docs-writer`, `marketing-writer` | delegate                                           | complete – a genuine superset (13 locales). Effective Flow keeps only the language policy (code EN / docs DE / commits EN).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `effective-web`            | `frontend-reviewer`, `ui-implementer`, `test-writer`, `e2e-tester`, `plan`/`plan-review` (via gate)    | delegate (reviewer/UI) / route (test agents, plan) | complete – accessibility, Core Web Vitals, CSS architecture, React, forms, i18n (versioned standards such as WCAG stay in the skill). For `plan`/`plan-review` route-when-relevant: browser/accessibility detail of a plan is only pulled in via the relevance gate when the boundary is crossed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `smart-dependency-updater` | `maintain`                                                                                             | delegate                                           | complete – `maintain` is a thin adapter: the skill owns ecosystem detection, grouping, changelog research, compatibility adjustment, validation strategy, and update reporting; Effective Flow keeps only the orchestration + delivery (scope gate, baseline, commit per group, worktree, handback) and gives the skill "EF owns delivery" as a constraint so that no two delivery loops run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `codebase-improvement`     | `review`, `refactor`, `plan`, `plan-review`                                                            | route-when-relevant                                | Tool-level audit reasoning in `review`/`refactor` delegated to the skill (via `src/shared/audit-reasoning-delegation.md` + minimal fallback): reconnaissance, evidence standards, finding validation/dedup, leverage prioritization, complexity, root cause, scope/risk, plan quality. Effective Flow keeps orchestration, finding schema/IDs, confidence/scorecard gates, and the report/tracker/baseline/delivery contract; the reviewer agents (line-level checks) stay untouched. `plan`/`plan-review` additionally delegate the generic plan-quality/review **judgment** (gap analysis, scorecard, plan-review findings – `plan` phases 4–6, `plan-review` phase 2) via their own shared include `src/shared/central-reasoning-delegation.md` and normalize the result into status/scorecard/finding form; the plan artifact lifecycle stays with Effective Flow, and if the skill is missing a minimal generic fallback applies. |
| `port-codebases`           | `refactor` (cross-language branch)                                                                     | route-when-relevant                                | complete for the special branch; applies only for cross-language/runtime migration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `software-architecture`    | `nodejs-reviewer`, `rust-reviewer`                                                                     | route-when-relevant                                | **Gap:** carries architecture reasoning, **not** the line-level checks (injection, event-loop blocking, unhandled rejections, Clippy idiomatics).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `decision-records`         | `apply-review` (`src/shared/adr-convention.md`)                                                        | delegate (with fallback)                           | `apply-review` hands rejected findings over as decision candidates; the skill decides on ADR-worthiness and authors according to the declared repo convention (Effective Flow's living slug model from `adr-convention.md`), which is at the same time the minimal fallback when the skill is missing. Effective Flow keeps mapping, approval/status flow, backlink, and summary tracking. The earlier `no-overlap` classification was based on the pre-#85 state of the skill (allegedly immutable/numbered); since the living/mutable variant the model conflict is gone.                                                                                                                                                                                                                                                                                                                                                            |
| `product-management`       | `plan`, `plan-review` (via relevance gate)                                                             | route-when-relevant                                | Product outcomes, what/why/for-whom, prioritization, and release judgment – only when a concrete plan crosses the product boundary (loaded via the relevance gate, not hard-wired). A narrow engineering plan does not load the skill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `product-design`           | `plan`, `plan-review` (via relevance gate)                                                             | route-when-relevant                                | Research, problem framing, information architecture, flows, prototype – only when the design boundary is crossed via the relevance gate. **Not installed in the current default-branch skillset**; the generic specialist rule loads the owner automatically as soon as it is available.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Deliberate exceptions

- **`codebase-improvement` ↔ `review`/`refactor`:** What is delegated is exclusively the
  **tool-level reasoning** (via the shared include `src/shared/audit-reasoning-delegation.md`).
  The **reviewer agents** (`frontend-reviewer`, `nodejs-reviewer`, `rust-reviewer`) and their
  line-level checks stay untouched, as do the finding schema/IDs, the profiles/gates, and the
  report/tracker/baseline/delivery contract. The classification stays `route-when-relevant`
  because the skill does not cover the orchestration.
- **`codebase-improvement` ↔ `plan`/`plan-review`:** The Firmo plan lifecycle (naming, status,
  category metadata, storage, archive, open points, handoff, interactive write/review loop with
  edit-only-referenced-plan) stays with Effective Flow. The **generic plan-quality and
  plan-review judgment** comes from `codebase-improvement` via its own shared include
  `src/shared/central-reasoning-delegation.md`. It is deliberately separated from the audit
  include (`src/shared/audit-reasoning-delegation.md`, `review`/`refactor`) because the plan
  artifact knows no finding/report/delivery contract but scorecard, plan review, and open
  points; both includes, however, share the same rule (delegate the judgment, route specialists
  via the relevance gate, minimal fallback). Specialists (`product-management`, `product-design`,
  `effective-web`, `software-architecture`, `web-legal-compliance` …) are **not** hard-wired per
  skill but loaded only when the boundary is crossed; an owner not yet installed (e.g.
  `product-design`) is silently skipped until it is available.
- **`software-architecture` ↔ reviewer:** The line-level security, performance, and
  error-handling checklists of the `nodejs-reviewer`/`rust-reviewer` stay in Effective Flow –
  the central skill adds architecture reasoning but does not replace the check depth.
- **`decision-records` ↔ `apply-review`:** `apply-review` delegates the ADR authoring to the
  skill. Effective Flow's living slug ADR model (`src/shared/adr-convention.md`) is **no longer a
  divergence** but the convention **declared** for this repo, which the skill follows (it
  discovers and follows the repo convention), as well as the **minimal fallback** when the skill
  is missing. Both the ADR _craft_ ("when/what as an ADR") and the authoring lie with the skill;
  Effective Flow keeps only mapping, approval/status, backlink, and summary tracking. The earlier
  `no-overlap` classification was based on the pre-#85 state of the skill.
- **`pr-review`:** currently recommended by no tool but overlaps strongly with
  `src/tools/iterate.md` (PR feedback, CI recovery, branch maintenance) – an obvious future
  delegation candidate.

## Ownership check when extending

When adding or extending a tool, agent, or shared include, the rule is: **Does the change carry a
second copy of a centrally owned playbook?** If yes, delegate to the skill and keep only a
minimal fallback; enter the intersection above into the inventory and classify it.

## See also

- `src/shared/skill-discovery.md` – the operative skill-discovery rule including the authority
  contract.
- [Architecture](architecture.md) – overall structure of Effective Flow.
- [`AGENTS.md`](../../AGENTS.md) – skill-discovery mechanics and contributor conventions.
