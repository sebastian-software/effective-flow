---
description: "Thin adapter for recurring Node project maintenance: delegates the dependency-update mechanics (ecosystem detection, risk grouping, changelog research, compatibility adaptation, validation strategy, update reporting) to the central smart-dependency-updater skill and owns only the orchestration itself: scope gate, green baseline, one commit per group, review-report backlinks, and delivery/worktree handback. Not a feature, bugfix, or refactoring workflow, and not a scheduler."
catalogHint: "Runs recurring maintenance: dependency updates and security fixes."
---

# Effective Flow Maintain

You are the orchestrator for recurring project maintenance – a **thin adapter** around the central `smart-dependency-updater` skill.

## Goal

A project is maintained without changing its behavior: outdated dependencies are upgraded in a risk-aware way, security/audit findings are fixed, and on major bumps the code is adapted to changed APIs. A green before-baseline serves as a safety net.

`maintain` **does not own the domain update mechanics itself** – they come from the central skill (see "Delegation contract"). `maintain` only steers the orchestration and the delivery.

Sharp scope boundary – `maintain` is deliberately lean:

- **In scope:** dependency updates, security/audit fixes, breaking-change adaptation.
- **Not in scope:** general refactoring or dead code (→ `{{SKILL:refactor}}`), bugfixes unrelated to dependencies (→ `{{SKILL:fix}}`), pure formatting/config upkeep (→ `{{AGENT:code-validator}}`), new functionality (→ `{{SKILL:build}}`).
- **Not a scheduler:** automatic, time-triggered bumping is handled by tools like Renovate or Dependabot. `maintain` is the interactive "clean up now" run.

```include
language-rules
```

```include
task-tracking
```

```include
config-migration
```

```include
effective-flow-dir-migration
```

## Recommended skills

- `smart-dependency-updater`

## Delegation contract

`smart-dependency-updater` is the **declared domain owner** for dependency updates (classification `delegate`, see [Skill ownership](../../docs/developer-guide/skill-ownership.md)). Its guidance is **authoritative**, not optional advice; `maintain` carries **no second copy** of this playbook.

**The skill owns the update mechanics (the "how"):**

- ecosystem/package-manager detection and update inventory (outdated + security audit),
- grouping by real coupling and risk (safe batch, major individually, security),
- changelog/release-notes research for the exact version jump,
- local impact analysis and compatibility adaptation to changed APIs,
- validation strategy and update-specific reporting (what changed upstream, risk).

**`maintain` owns the orchestration and delivery (the "what/when"):**

- the `{{SKILL:maintain}}` entry point, the scope gate, and the progress updates,
- Effective Flow configuration, goal/completion steering, and review-report backlinks,
- the green before/after baseline as a safety net,
- the delivery policy: **one commit per group**, worktree isolation, and delivery handback.

**Delivery constraint on the skill (binding).** By default the skill delivers on its own (one PR per group, its own branch/worktree, push). In `maintain`, **Effective Flow owns the delivery**: explicitly tell the skill that it **creates no branches or worktrees, pushes nothing, and creates no pull requests** and does **not** stop after a mere chat summary. It confines itself to **analysis, research, update, and local validation per group**; the commit per group, the worktree, and the handback are done exclusively by `maintain`. This way two delivery loops do not run in parallel.

**Minimal fallback (skill missing).** If `smart-dependency-updater` is unavailable (not installed, `skills.enabled: false`, or disabled via `exclude`), the short core guidance under "Minimal fallback without the skill" applies. It keeps `maintain` functional but holds **no** second complete update manual – full depth comes only with the skill.

## Project conventions

If the project contains an `AGENTS.md`, read it before the scan and observe its specifications for dependencies, tests, review, and commits.

```include
completion-protocol
```

```include
goal-completion
```

```include
worktree-integration
```

## Wisdom Accumulation

At the start, generate a session ID (e.g. via timestamp `date +%Y%m%d%H%M%S`) and use it consistently for the wisdom file `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`. This prevents collisions on parallel runs.

Contents:

- baseline values and their meaning
- chosen update groups and rationale
- result per group (committed, rolled back, or marked as "manual")
- breaking changes reported by the skill with migration source (changelog/release notes)

Read the file before every delegated domain phase and pass its contents on as context. Delete it at the end of the workflow.

Current workflow for review-report backlinks: `{{SKILL:maintain}}`.

```include
review-report-backlinks
```

```include
unresolved-review-report
```

## Workflow

### Phase 0: Scope gate

1. Confirm that this is maintenance in the sense above. If the task is actually a feature, a bugfix unrelated to dependencies, or a general refactoring, emit a clearly visible message, point to the appropriate workflow, and end.
2. Detect the project type as in `{{SKILL:build}}`; this determines which implementer carries out a compatibility adaptation and which reviewer checks changed code. The ecosystem/package-manager detection itself is handled by the skill.
3. If no `package.json` and no lockfile are present: report that no supported Node project was detected, and end.

### Phase 1: Skill discovery and delivery setup

1. Review the available skills and bring in `smart-dependency-updater` per skill discovery. If it is missing, the "Minimal fallback without the skill" at the end applies.

```include
skill-discovery
```

2. Determine the effective delivery/worktree mode and verified execution-location receipt per
   "Delivery and worktree integration", then run any applicable owned setup **before** baseline
   and updates. Pass the receipt through all following phases, revalidate it at each
   write-capable boundary and root every operation there so the per-group commits land on the
   intended delivery branch.

### Phase 2: Baseline

Start in parallel with the verified execution-location receipt:

1. `{{AGENT:code-validator}}` – type checking, lint, build status.
2. `{{AGENT:test-writer}}` – run only the existing tests and document the result; write no new tests in this phase.

Document the baseline. If the baseline is already red (build/tests broken before any update): do not update, but point to `{{SKILL:fix}}`, since otherwise later regressions cannot be distinguished from pre-existing problems.

### Phase 3: Delegated update implementation

For the actual update work, follow the `smart-dependency-updater` skill under the **delivery constraint** established above. The skill handles: the update inventory (outdated + audit), grouping by risk and coupling, changelog/migration research, local impact analysis and compatibility adaptation, as well as the validation strategy per group. `maintain` steers the orchestration, the selection gate, and the delivery around this work.

1. **Selection gate:** Present the groups proposed by the skill and clarify which are implemented now.

```ask
header: Updates
question: Which of the proposed update groups should be implemented now?
options:
  - label: All safe ones
    description: Safe batch (patch/minor) and security fixes automatically, skip major bumps
  - label: Major too
    description: Additionally the major bumps individually with breaking-change adaptation
  - label: Security only
    description: Apply audit/security fixes exclusively
  - label: Selection
    description: Name specific groups as free text
```

2. From the chosen update selection, derive the explicit completion condition (implemented groups, baseline comparison green, reviewer with no open critical findings on code adaptations; see "Goal-driven completion control"); it covers phases 3–5. Since the update gate is a selection question, ask the standalone goal follow-up question directly after the selection per "Explicit goal query for autonomous runs". If "Autonomous via /goal" is chosen, emit the `/goal` string for phases 3–5; the follow-up question is omitted if the workflow was delegated non-interactively.

```ask
when: the workflow runs interactively and was not delegated as a non-interactive sub-agent (e.g. by {{FIRMO}} apply-review)
header: Goal
question: Run the remaining phases autonomously under /goal?
options:
  - label: Continue gated
    description: The workflow continues with the usual stops
  - label: Autonomous via /goal
    description: Remaining phases autonomously under native /goal — the skill emits the /goal string to paste
```

3. Work through the approved groups **one after another**. For each group the skill applies the version jump, updates the lockfile via the detected manager, researches breaking changes, and where needed adapts local code to the changed API – carried out via the implementer determined in phase 0 (`{{AGENT:ui-implementer}}`, `{{AGENT:nodejs-implementer}}`, `{{AGENT:rust-implementer}}`, or `{{AGENT:generic-implementer}}` for tooling/CI/config; task: only adapt to the changed API, no new behavior). Afterwards `maintain` compares against the baseline:
   - green → **one clean commit per group** (see commit rules), a meaningful message, e.g. `chore(deps): …`.
   - red and repairable → follow up with an adaptation via the implementer, validate again – limit the internal correction rounds per "Goal-driven completion control"; if the group stays red afterwards, treat it as "not sensibly repairable" instead of repeating indefinitely.
   - red and not sensibly repairable → roll the group back (manifest and lockfile to the state before the group) and mark it as "manual".
4. Record the result and rationale per group in the wisdom file.

### Phase 4: Review

Only if code was adapted for breaking changes in phase 3:

1. Start the appropriate reviewer for the changed files (`{{AGENT:frontend-reviewer}}`, `{{AGENT:nodejs-reviewer}}`, or `{{AGENT:rust-reviewer}}`).
2. Fix critical findings before completion.
3. If findings with status `Open` or `Not implemented` remain, write them per "Open review-finding reports" into a new file under `.effective-flow/review/` and name the report path in the completion summary.

Pure dependency bumps without code adaptation need no reviewer pass; note that briefly.

### Phase 5: Report and completion

1. Run `{{AGENT:code-validator}}` one last time as a final check.
2. Summarize based on the update-specific reporting from the skill:
   - which groups were implemented and committed (with version jumps),
   - which audit findings were fixed,
   - which updates were deferred as "manual" and why,
   - a reference to an offloaded review report, if present.
3. Confirm that the behavior stayed unchanged (baseline comparison green).
4. Delete the wisdom file.
5. If delivery or worktree execution was active: run the handback per "Delivery and worktree integration". The per-group commits already sit on the delivery branch; the handback performs ownership-safe worktree cleanup if applicable, runs the completion action `pr`/`merge`/`branch`, and restores only an in-place checkout it switched. Name the delivery branch, the final checkout state, and the result in the summary.

```include
pre-commit-gate
```

```include
commit-message-rules
```

## Minimal fallback without the skill

Only relevant when `smart-dependency-updater` is unavailable. Short core guidance so that `maintain` degrades cleanly – **not** a second complete update manual:

- Detect the package manager from the lockfile (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `bun.lockb` → bun, otherwise `package-lock.json`/npm) and derive all commands from it – never hardcode npm.
- Collect outdated dependencies (`outdated`) and security findings (`audit`) via the detected manager.
- Group roughly: safe batch (patch/minor without known breaking changes), major individually (with a changelog note), security separately.
- Per group: apply the bump, update the lockfile via the manager, validate against the baseline; green → one commit per group, red → roll back and mark as "manual".
- On major bumps read the changelog/release notes and adapt code only to the changed API (no new behavior).

## Rules

- Start independent phases (baseline validation and tests) in parallel.
- Give a brief status update after each phase.
- One commit per group, not a single collective commit across all updates.
- Never update while the baseline is red.
- No new features, no unplanned bugfixes, and no general refactoring in the maintenance run.
- On unclear risk (major without tests in the affected area) get individual confirmation instead of waving it through in the batch.
- Delivery stays with `maintain`: the delegated skill creates no branches/PRs and does not push.
