---
description: "Orchestrates a comprehensive code review, or a deep interactive plan review when a plan-file argument is given: scope determination, design-decision detection, technical validation, domain review, and report generation."
catalogHint: "Checks code for quality and findings – or, more deeply, an existing plan."
---

# Effective Flow Review

You are the orchestrator for comprehensive code reviews.

## Goal

This workflow analyzes code quality and produces a structured report whose findings can serve directly as input for `{{SKILL:fix}}`, `{{SKILL:refactor}}`, `{{SKILL:build}}`, and `{{SKILL:docs}}`.

```lazy-include
language-rules
when: local or remote review output languages must be resolved
```

```include
task-tracking
```

```include
delegation-mandate
```

```lazy-include
runtime-state-safety
when: any wisdom, memory, cache, report, runtime migration, or tracker-marker mutation is imminent
```

```lazy-include
effective-flow-dir-migration
when: any wisdom, memory, cache, report, runtime migration, or tracker-marker mutation is imminent
```

```lazy-include
project-routing
when: Phase 1 classifies scoped files into routing buckets
```

```lazy-include
next-steps
when: the run reaches its completion report
```

## Task tracking in detail

In addition to the generic rule in the include above, this skill requires **per-source and per-sub-reviewer granularity** so that during the workflow the user sees live which streams and sub-agents are still running.

### Task structure

Tasks are created at **two** points in time, because the directory split in Phase 2c only determines the number of sub-reviewers at runtime:

**Point A — immediately after scope confirmation at the end of Phase 1:**

1. **Phase-level tasks:**
   - "Phase 1: Scope"
   - "Phase 2: Parallel data collection"
   - "Phase 3: Aggregation and design-decision filter"
   - "Phase 4: Report"
2. **Per-source tasks for Phase 2a** (one per design-decision source):
   - "2a: Search ADR source"
   - "2a: Search plan source"
   - "2a: Search conventions source"
   - "2a: Search code-comment source"
   - "2a: Search lint suppressions"
   - "2a: Search previous reviews"
3. **One task for Phase 2b:**
   - "2b: Technical validation"

**Point B — at the start of Phase 2c, after the directory-split heuristic has determined the sub-reviewer partition but **before** the first sub-reviewer is started:**

4. **Per-sub-reviewer tasks for Phase 2c** (1 to N depending on the directory split):
   - For a single reviewer per routing bucket: e.g. "2c: Frontend review" or "2c: Generic product review"
   - For a directory split: one dedicated task per sub-reviewer with the directory in the subject, e.g. "2c: Frontend review src/components", "2c: Backend review src/routes"
   - For a recursive split: one task per sub-sub-reviewer with the deeper path in the subject, e.g. "2c: Frontend review src/components/forms".

### Task lifecycle

- **Phase-level tasks:** set to `in_progress` before the phase starts, to `completed` after completion. Phase 1 is already active when the tasks are created → set it directly to `in_progress` and to `completed` after Phase 1 finishes.
- **Per-source / per-sub-reviewer tasks:**
  - `in_progress`: when the respective sub-agent in Phase 2 starts.
  - `completed`: when the sub-agent reports `DONE`.
  - **On `ABORT`:** still set to `completed`, and append `[failed]` to the subject.
- **Phase-2 aggregate lifecycle:** the phase-level task "Phase 2" only counts as `completed` once all three streams (2a, 2b, 2c) have reported `DONE` or `ABORT` — analogous to the Phase-3 start condition.
- **On early overall abort** (e.g. the skill is interrupted, several critical sub-agents abort, and the workflow cannot continue into Phase 3): set all still-open `pending` and `in_progress` tasks to `completed` and append `[aborted]` to their subjects before the skill ends with `DONE` or `ABORT`.

### Important

- Create tasks according to Point A and B above so that the user sees the full list before each start of the relevant sub-agents.
- Update tasks promptly as soon as a sub-agent reports — not batched.

## Recommended skills

- `codebase-improvement`
- `pr-review`

```include
audit-reasoning-delegation
```

`review.md` is already mostly orchestration; the delegable part is the
**finding-quality reasoning** (evidence standards, validation/rejection, dedup judgment,
prioritization) in Phases 2c/3. The reviewer agents (`{{AGENT:frontend-reviewer}}`,
`{{AGENT:nodejs-reviewer}}`, `{{AGENT:rust-reviewer}}`, `{{AGENT:generic-product-reviewer}}`) keep their line-level checks and
are **not** part of this delegation.

## Project conventions

If the project contains an `AGENTS.md`, read it before the review and treat its specifications as additional review context for scope, conventions, design decisions, and quality criteria.

## Scope determination

- Without arguments: check for uncommitted changes; if present, review only those, otherwise the entire codebase
- With arguments: only the described area

## Finding scope

The default finding scope is **only critical and important findings**. Notes are included in the report only when the user explicitly requests a comprehensive or complete review (e.g. "comprehensive review", "all findings", "including notes").

Briefly point out to the user at the start that by default only critical and important findings are reported and that a comprehensive review is available on request.

Use the active finding scope as a filter for the reviewer assignment, aggregation, report, and summary.

```include
completion-protocol
```

## Design-decision detection

The review workflow detects documented design decisions so that findings against deliberate decisions are not falsely reported as problems. The sources are searched in parallel in Phase 2a; the reconciliation with findings happens centrally in Phase 3.

## Project routing

Classify every file in scope using the loaded canonical “Project routing” contract. The reviewer
routing, including the directory-split heuristic, is defined in Phase 2c and operates per route
bucket rather than assigning one project-wide type.

## Effective Flow configuration and memory

Effective Flow-internal files live under `.effective-flow/` in the project root.

- Configuration: Effective Flow configuration from the project-setup ADR (see the "Config migration" building block)
- Memory file: `.effective-flow/memory.json`
- Cache file: `.effective-flow/cache.json`
- Review reports: `.effective-flow/review/`
- Temporary wisdom files: `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`

The file `.effective-flow/memory.json` stores persistent state across sessions. Unlike the wisdom file, it is never deleted.

```lazy-include
review-state
when: memory or cache data is inspected, reserved, or written
```

### Configuration schema

`review` works without a committed configuration. If the Effective Flow configuration (project-setup ADR) is missing, use internal defaults and do not create anything automatically.

Supported review configuration:

```json
{
  "review": {
    "profile": "focused",
    "autoConfirmScope": false,
    "designDecisionSources": "standard",
    "validation": "full"
  }
}
```

Defaults:

| Key                            | Default    | Values                        |
| ------------------------------ | ---------- | ----------------------------- |
| `review.profile`               | `focused`  | `full`, `focused`, `fast`     |
| `review.autoConfirmScope`      | `false`    | Boolean                       |
| `review.designDecisionSources` | `standard` | `full`, `standard`, `minimal` |
| `review.validation`            | `full`     | `full`, `quick`, `off`        |

Profile meaning:

- `full`: the current deep behavior with all design-decision sources and full technical validation.
- `focused`: critical and important findings, standard DD sources, and full validation as a safe default.
- `fast`: critical and important findings, reduced DD sources, and fast or disabled validation unless explicitly configured otherwise.

If `review.profile` is set and individual detail values are missing, derive the missing detail values from the profile:

| Profile   | DD sources | Validation |
| --------- | ---------- | ---------- |
| `full`    | `full`     | `full`     |
| `focused` | `standard` | `full`     |
| `fast`    | `minimal`  | `off`      |

Explicitly set detail values take precedence over profile derivations.

### Config migration

Reading the Effective Flow configuration from the project-setup ADR (including the `review` keys) and the one-time migration of an old config is handled centrally by the "Config migration" building block (`config-migration.md`); this building block no longer performs its own per-block migration for `review`. The `review` config schema above (defaults, profile derivation) is unaffected.

### Git tracking

The entire `.effective-flow/` directory must be ignored and untracked. Review never changes
`.gitignore`; if the runtime-state safety guard blocks, it preserves all state and directs the
user to `{{SKILL:setup}}`, the sole repair owner.

### Usage

1. Before the first memory, cache, or report lookup, establish the verified dual-root receipt.
   Retain `RUNTIME_STATE_ROOT` from the main porcelain worktree record independently from
   `EXECUTION_ROOT`; abort on an unusable or repository-mismatched main root. Read the absolute
   `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle at the start of the review workflow;
   this lookup is non-mutating and may precede the guard.
2. If the first runtime write requires creating `.effective-flow/`, apply “Runtime-state write
   safety” from `RUNTIME_STATE_ROOT` to the exact directory path `.effective-flow/` immediately
   before its `mkdir`. A later file or child-directory mutation requires its own guard for that
   exact target.
3. If canonical memory is absent but `<RUNTIME_STATE_ROOT>/.sf-memory.json` exists, do not run a
   preliminary migration. The first shared memory transaction must validate that unchanged legacy
   object, use it as the base, merge that writer's intended mutation, and persist the combined
   object to `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` in one replacement before removing
   the legacy file. Inform the user; never inspect or remove worktree-local legacy memory.
4. Without either memory file, the first reservation starts after `lastFindingNumber: 0`.
5. Read the Effective Flow configuration from the project-setup ADR if present (migration of an old config via the "Config migration" building block).
6. Read the absolute `<RUNTIME_STATE_ROOT>/.effective-flow/cache.json` handle if present and
   valid; use only valid, non-stale cache entries. Ignore a same-named cache below
   `EXECUTION_ROOT`.
7. Finish all confidence filtering, design-decision filtering, and local or remote deduplication.
   For the exact ordered list that remains, reserve one contiguous range through “Shared
   memory-state mutation” against the retained absolute memory handle under `RUNTIME_STATE_ROOT`.
   Format its mapping as `R-0000001`, `R-0000002`, ... . Reserve nothing when the list is empty.
8. The reservation must be atomically persisted and its lock released before any report, finding
   issue, epic, or pull-request comment is published. If reservation fails, publish nothing. If
   later publication fails or is interrupted, report the reserved range and partial result; the
   unused IDs remain permanent gaps and are never rolled back or reused.

```lazy-include
config-migration
when: the Effective Flow configuration is read for the first time or an old config is migrated
```

```lazy-include
issue-tracker
when: the resolved tracker target is the forge (`remote`) or an external tool
```

```lazy-include
tracker-target
when: the resolved tracker target is `external`
```

```lazy-include
security-disclosure-gate
when: findings are classified for publication or a withheld security finding is persisted or published
```

## Wisdom accumulation

At the start of Phase 1, generate a session ID (e.g. via the timestamp `date +%Y%m%d%H%M%S`) and use it consistently for the wisdom file `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`. This prevents collisions if several review runs are running in parallel.

Immediately before every creation, update, or deletion of this wisdom file, apply
“Runtime-state write safety” to its concrete path.

The wisdom file carries the outputs of the parallel Phase-2 streams between the phases:

- collected design decisions from Phase 2a (one block per source)
- technical findings from Phase 2b
- reviewer findings from Phase 2c (one block per sub-reviewer)

Delete the file at the end of the workflow, before `DONE`.

## Workflow

### Plan-file special case

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default
`docs/plan`).

Before Phase 1 and before any code-review-specific initialization
(config migration, tracker mode, memory, cache, or wisdom file),
check whether the user argument unambiguously points to a plan file under `<plan.dir>/`
or `<plan.dir>/archive/`. Search both locations and determine uniqueness across their
combined candidates; a missing archive contributes no candidates.

Allowed forms are:

- full path, e.g. `<plan.dir>/2024-06-01-feature.md` or
  `<plan.dir>/archive/2024-06-01-feature.md`
- date-slug file name, e.g. `2024-06-01-feature.md`
- title slug, e.g. `feature`
- legacy number, e.g. `0066` (for migrated old plans, resolved primarily via the H1
  `# 0066: …`; the file name segment is only the existing secondary signal)

If exactly one plan file is found, first resolve the same argument against `<concept.dir>/` per the
concept-file special case below. That cross-check belongs here, before the plan branch acts,
because acting first would make the ambiguity unreachable:

- **Plan match only:** continue with the plan steps below.
- **Plan match and concept match:** the argument is ambiguous. Name both interpretations, ask which
  artifact was meant, and start neither review. Only a bare file name or a title slug can be
  ambiguous — a full path names its directory, and a bare four-digit value stays a legacy plan
  reference.

For an unambiguous plan match:

1. Do not load any code-review configuration, tracker mode, memory file,
   cache, or wisdom file.
2. Read the internal instruction `{{SKILL:plan-review}}`.
3. Run it with the resolved plan file and the literal line `Next steps: suppressed`; it returns its
   result here.
4. Emit the next-step block per `next-steps` for the returned state, then end this `review`
   workflow; do not start a code review.

If no plan file or multiple plan files match and the user clearly wanted a plan
review, do not continue with Phase 1: report the missing plan or ask for the specific
file instead of guessing a code review. Only arguments without clear plan-review intent
may fall through to the normal code-review scope.

### Concept-file special case

Evaluated **after** the plan-file special case and never before it: a bare four-digit value stays a
legacy plan reference and is never read as a concept reference. Like the plan-file case, this
branch runs before Phase 1 and before any code-review-specific initialization.

```lazy-include
concept-contract
when: the review argument may be a concept reference that must be resolved
```

`<concept.dir>` is the concept directory from the Effective Flow configuration (project-setup ADR)
`concept.dir` (default `docs/concept`). Check whether the user argument unambiguously points to a
concept file there. Allowed forms are the full path, the date-slug file name, and the title slug.

If exactly one concept file is found:

1. Do not load any code-review configuration, tracker mode, memory file, cache, or wisdom file.
2. Read the internal instruction `{{SKILL:concept-review}}`.
3. Run it with the resolved concept file and the literal line `Next steps: suppressed`.
4. Emit the next-step block per `next-steps` for the returned state, then end this `review`
   workflow; do not start a code review.

An argument that matches both a plan file and a concept file is ambiguous. That case is decided by
the cross-check in the plan-file special case above, which runs first and asks instead of starting
either review; the rule is stated there so it stays reachable. If no concept file or several
concept files match and the user clearly wanted a concept review, report the missing concept or ask
for the specific file instead of guessing a code review.

### Pull-request special case

Evaluated **after** the plan-file special case and never before it: a bare four-digit value stays a
legacy plan reference and is never read as a pull request.

A PR reference is `#42`, a bare number that is not four digits, or a PR URL — the path segment
`/pull/` (GitHub) or `/pulls/` (Forgejo) marks it, and an `/issues/` URL is not one. Resolve it
through the PR resolution of the loaded "PR review comment integration".

On a resolved pull request:

1. The review scope is that pull request's changed files; Phase 1 determines no other scope.
2. Do **not** resolve the tracker target in Phase 1 and do not apply its fail-closed classes. This
   path is inherently forge-bound: it publishes onto the pull request and performs no tracker
   write, so a missing `tracker.externalTool` or an unreachable external connection never aborts
   it. Required is only the forge preflight: detect the host and CLI and probe availability and
   authentication.
3. Finding IDs come from the existing shared memory-state reservation as usual.
4. Phases 2 and 3 run unchanged.
5. Phase 4 publishes the Phase-3 finding set through the loaded "PR review publication" instead of
   the local-mode report or the finding issues of a publishing target.
6. It emits the pull-request row of `next-steps`, not the local or publishing one.

An argument that plausibly matches both a plan file and a pull request is ambiguous: name both
interpretations and ask, never guess. A merged or closed pull request, or one belonging to another
repository, is reviewed read-only and reported as such.

```lazy-include
pr-review-integration
when: the review argument may be a pull-request reference that must be resolved, or findings are published onto a resolved pull request
```

### Phase 1: Scope

1. Read the arguments.
2. Load the Effective Flow configuration, migrate it if necessary, and determine the review profile, DD source profile, and validation mode. Additionally resolve the tracker **target** according to "Issue-tracker integration (remote mode)" — not only the mode (config `tracker.mode`, argument/per-run signal, and possibly a first-call query). For the forge target: detect the host and CLI and check CLI availability and authentication in advance; if the CLI is missing, abort clearly (no silent fallback to `local`). For `external`: `tracker.externalTool` must be set, and exactly one connection is established and checked in advance against the capabilities publication needs — create an issue, list or search issues by classification and description content for the `Signature` dedup, add a classification value, and the container mechanism. Each of the four fail-closed classes aborts before the first write, and neither missing connection nor missing capability falls back to the forge or to `local`. Name the resolved target — for `external` with tool identifier, connection, and container mechanism — in the status output and in the Phase-4 summary.
3. Resolve the concrete output language once before any Phase-2 delegation: resolve
   `language.workflow` for local review artifacts and `language.forge` for published tracker
   artifacts, then set `<review-output-language>` from the resolved target. Record the concrete
   `de`/`en` value in the wisdom context and pass it to every Phase-2 agent. Do not let delegated
   agents re-read or reinterpret the project setup ADR.
4. Without arguments:
   - check `git diff --name-only`
   - check `git diff --cached --name-only`
   - if there are changes: review only those files
   - otherwise the entire codebase
5. Examine the project structure and classify the scoped files into routing buckets. Use a valid `scopeIndex` cache only if Git HEAD, dirty state, and relevant file changes match the current situation.
6. Determine the final review scope (concrete file list or directory description).
7. Determine the active finding scope: the default is only critical+important, unless the user has explicitly requested a comprehensive review.
8. Obtain user confirmation only if the scope or review goal is unclear.
9. Skip the scope confirmation if the user has explicitly specified the scope, or if `review.autoConfirmScope: true` is set and the scope determination is unambiguous. Still ask if there are uncommitted changes and the desired scope is not unambiguous.

```ask
when: a scope confirmation is required per the rules above
header: Review scope
question: Review scope confirmed?
type: approval
```

### Phase 2: Parallel data collection

First review the available skills and include `codebase-improvement` per skill discovery; if the skill is missing, the "Minimal fallback without the skill" at the end applies. Discovery runs once before the three streams start.

```include
skill-discovery
```

This phase consists of three independent streams that must all be started simultaneously — no stream waits for another. Write each stream's outputs to the wisdom file.

#### Phase 2a: Design-decision collection (parallel per source)

Determine the active design-decision sources from `review.designDecisionSources`:

- `full`: all sources listed below.
- `standard`: ADRs, plan files, and convention files.
- `minimal`: ADRs and convention files.

Start a dedicated sub-agent for each active source **in parallel**. Each sub-agent searches only its own source:

- ADR — `docs/decisions/`, `docs/adr/`, `adr/`, `*.adr.md`. ADRs may exist in the living, slug-named format (`# <title>`, `## Status`) **or** in the numbered old format (`# NNNN — title`); both forms are read, and the search globs stay unchanged. **Exception:** the Effective Flow project-setup ADR (config, known slug `effective-flow-project-setup`, old `firmo-project-setup`, e.g. `docs/adr/effective-flow-project-setup.md`) is configuration, not an architecture rationale, and is **not** collected as a design-decision source.
- Plan files — `<plan.dir>/`, `plans/`
- Convention files — `CLAUDE.md`, `AGENTS.md`, comparable convention files
- Code comments — `@design-decision`, `DELIBERATE`, `INTENTIONAL`, `DESIGN:`
- Lint suppressions with a rationale — `eslint-disable ... -- [reason]`, `@ts-expect-error [reason]`
- Previous review reports — `.effective-flow/review/review-report-*.md`

Inactive sources are not searched and are documented in the wisdom section as "skipped by profile". Use valid `designDecisions` cache entries per source if their invalidation data still matches; otherwise recompute the source and update the cache after a successful extraction.

Each sub-agent returns a list of design decisions in the format:

```text
- [DD-001] [source] [area/file]: [summary]
```

If a source is empty: end the list with "none found".

Write all results to the wisdom file under `## Design decisions` with sub-sections per source.

#### Phase 2b: Technical validation

1. Observe `review.validation`:
   - `full`: Start `{{AGENT:code-validator}}` in check mode `full` (all safely discovered repository-native checks, no fixes).
   - `quick`: Start `{{AGENT:code-validator}}` in check mode `quick` (prefer a fast combined repository-native check; otherwise run the safely discoverable fast checks and skip the rest with reasons).
   - `off`: Do not start a validator. Document in the wisdom file and in the report that technical validation was disabled by the profile.
2. Collect technical problems in the wisdom file under `## Technical findings`.
3. Use valid `validatorScripts` cache entries only for script detection and profile selection. Do not use cached error lists as the current validation result.

#### Phase 2c: Quality review

1. **Reviewer selection per routing bucket:**
   - Frontend → `{{AGENT:frontend-reviewer}}`
   - Backend / CLI / Node.js → `{{AGENT:nodejs-reviewer}}`
   - Rust → `{{AGENT:rust-reviewer}}`
   - Other clearly identified product code → emit the reduced-depth notice, then `{{AGENT:generic-product-reviewer}}`
   - Tooling/configuration/repository metadata → technical findings from `{{AGENT:code-validator}}`; do not use a product reviewer
   - Mixed scopes → all reviewers selected for their own files; never demote a recognized specialist bucket
   - Clarification-required → stop that bucket and ask a focused file-role question
2. **Directory-split heuristic** (per routing bucket in scope):
   - Count the files in scope for this bucket.
   - **≤ 30 files:** one reviewer sub-agent for the whole bucket.
   - **> 30 files:** Split the scope by top-level directory (e.g. `src/components/`, `src/pages/`, `src/lib/` for frontend; `src/routes/`, `src/services/`, `src/middleware/` for backend; `src/`, `crates/<name>/src/` for Rust). One dedicated reviewer sub-agent per top-level directory. If a top-level directory still has > 30 files: split recursively one level deeper — at most **3 recursion levels** from the first split.
   - **Fallback for flat repos:** If no sub-directories exist, all files lie directly in the root scope, or the maximum recursion level is reached and a bucket still contains > 30 files: split the file list into alphabetical blocks of ≤ 30 files each and assign each block its own reviewer sub-agent.
   - A valid `scopeIndex` cache may provide the file list, routing buckets, and split calculation. If the invalidation does not clearly match, recompute the split.
3. **Assignment to each reviewer sub-agent:**
   - comprehensive review of the assigned files
   - observe the active finding scope
   - write finding titles, problems, solutions, and other human-readable result prose in the
     concrete Phase-1 `<review-output-language>`; do not resolve configuration independently
   - **no design-decision check in the reviewer** — the design decisions are reconciled centrally in Phase 3, which keeps the reviewer assignment lean. This instruction overrides contrary default rules in `{{AGENT:frontend-reviewer}}`, `{{AGENT:nodejs-reviewer}}`, `{{AGENT:rust-reviewer}}`, or `{{AGENT:generic-product-reviewer}}`: in Phase 2c, reviewers must not search for, filter by, or factor design decisions into the confidence.
   - for each finding:
     - severity
     - area
     - file + line
     - problem
     - solution
     - confidence
     - complexity
4. All reviewer sub-agents run **in parallel** (both across routing buckets and within a bucket when there is a directory split).
5. Collect all findings in the wisdom file under `## Reviewer findings` with sub-sections per sub-reviewer.

### Phase 3: Aggregation and design-decision filter

**Precondition:** Start Phase 3 only once all three Phase-2 streams (2a, 2b, 2c) have reported `DONE` (or `ABORT`). Opportunistically reading the wisdom file ahead while a stream is still writing would process incomplete data.

1. Aggregate findings from `## Technical findings` and all sub-sections under `## Reviewer findings`.
2. Finding-quality check. The **reasoning** behind evidence assessment, validation, candidate rejection, dedup judgment, and prioritization follows `codebase-improvement` (see "Delegation contract: generic audit reasoning") where available; if the skill is missing, the minimal fallback applies. The following **deterministic thresholds and keys** remain an Effective Flow output contract in every case and are not handed off to the skill:
   - filter out confidence < 80
   - remove duplicates (same area, same file+line, similar problem)
   - check severity consistency
   - filter findings outside the active finding scope out of the main report
3. **Central design-decision filter** (this is the only place where design decisions are reconciled against findings):
   - Read all entries collected under `## Design decisions` in the wisdom file.
   - Check each remaining finding individually for whether it is covered by a documented design decision.
   - On a match: remove the finding from the main report and move it into the "Skipped findings (design decisions)" table with a source reference.
   - In case of uncertainty (partial overlap): keep the finding in the report but annotate it with a reference to the potentially relevant design decision.
4. **Central security classification:** classify every remaining finding as `local-only` or `publishable` per the loaded "Security disclosure gate". This is the only place where a finding's publication class is decided. Record the class, the exposure marking, and the reason in the wisdom file so Phase 4 does not re-derive them.
5. Determine the follow-up action for each remaining finding:
   - defect → `{{SKILL:fix}}`
   - structural problem → `{{SKILL:refactor}}`
   - missing functionality / safeguard → `{{SKILL:build}}`
   - pure documentation gap, outdated documentation, incorrect examples, missing migration, CLI, or API documentation → `{{SKILL:docs}}`
6. Formulate prompt suggestions:
   - directly copyable plain text
   - no surrounding quotation marks
   - no escape sequences like `\"`

### Phase 4: Report

Phase 4 branches according to the tracker target resolved in Phase 1. On the `local` target a Markdown report is written as before. On a publishing target — the forge or an external tool — finding issues and a container (epic) are created, and a local report is written **only** for the findings the security classification held back. A publishing run without `local-only` findings therefore writes no local report, exactly as before. The finding numbering from `.effective-flow/memory.json` applies to every target.

#### Local mode

1. Reuse the Phase-1 `language.workflow` value for the complete new local report. Existing reports
   retain their clearly recognizable language. Pass the same concrete language to report writers.
2. Resolve the concrete absolute report handle below
   `<RUNTIME_STATE_ROOT>/.effective-flow/review/`. Run all directory lookups and collision checks
   there. If `.effective-flow/` is missing, guard that exact directory from the runtime root
   immediately before its `mkdir`. If `.effective-flow/review/` is missing, separately guard
   that exact directory immediately before its `mkdir`. Finish finding filtering and
   deduplication, reserve the exact nonzero contiguous ID range through the shared memory
   contract against the retained absolute runtime-root memory handle, and release its lock before
   publishing the report. Guard the concrete report file again immediately before writing it,
   then create `<RUNTIME_STATE_ROOT>/.effective-flow/review/review-report-YYYY-MM-DD[-N].md`. Use
   the report format below. Never inspect or create a report below a linked execution worktree.
3. If the active finding scope only covers critical and important findings (default):
   - do not include notes in the main report
   - briefly mention that notes were filtered out and that a comprehensive review is available on request
4. If `review.validation: off` was active, mention in the report that technical validation was skipped. Carry the Phase-3 security classification into the report as well: every finding gets its `Security` field, and a report holding at least one `local-only` finding gets the disclosure banner. The publication gate is a no-op here, because local mode publishes nothing.
5. Update valid cache areas (`designDecisions`, `scopeIndex`, `validatorScripts`) only after a successful recomputation. Do not write review findings to the cache.
6. Present the most important findings to the user and point to the saved report file.
7. Delete the wisdom file.
8. Emit the next-step block per `next-steps` as the last element of the report.

#### Publishing target (forge or external tool)

Use the formats, labels, and operations from "Issue-tracker integration (remote mode)". The steps below are written for the forge target and apply to an external target with the resolved connection taking the place of the helper, every mutation following the write discipline, classification mapping, and container mechanism of the loaded "Tracker target" contract — and with one exception: the legacy-compatibility mechanics (`firmo-` label unions, the legacy `Signatur` field, the one-time `sf-` migration) are forge history and are neither queried nor written on an external target. A local report is written only for the `local-only` findings of the security classification.

Reuse the Phase-1 `language.forge` value for finding issues, the container, and tracker comments. It may differ from `language.workflow`; labels, IDs, action values, signatures, and helper fields stay stable. The local security report keeps `language.workflow`, so one run may legitimately write in both languages — each artifact stays complete in its own language.

1. **Ensure labels:** Create the required labels idempotently (`effective-flow-review-finding`, `effective-flow-review-epic`, the action and severity labels, `wontfix`). On an external target, ensure the same canonical strings in the connection's classification primitive; if it exposes none, abort rather than creating findings without severity and action.
2. **Dedup first:** On the forge target, use the helper's compatibility label queries and finding-dedup operation for existing finding issues in every state. It unions current and `firmo-` label results by issue number, reads both canonical `Signature` and legacy `Signatur`, normalizes either form, and removes exact duplicates from the creation list. On an external target, search existing findings by the canonical classification value and by `Signature` content through the resolved connection; do not query legacy `firmo-`/`Signatur` forms there, since no run has ever written them to that tool. In case of an uncertain semantic match outside that exact identity (e.g. only a shifted line number), treat it as a new finding and note the possible relationship in the issue body. Remote dedup applies to `publishable` findings; a `local-only` finding was never published and therefore cannot match a remote issue.
3. **Dedup withheld findings:** Run the local dedup of the loaded "Security disclosure gate" for the `local-only` findings, which remote dedup cannot see. This must finish before the reservation, so a finding already recorded in an earlier report consumes no new ID.
4. **Reserve IDs:** Reserve exactly one contiguous nonzero `R-XXXXXXX` range through the shared memory contract for the ordered list of all remaining findings of **both** classes, and release its lock. Findings dropped by remote or local dedup are not part of that list. Only after the reservation is atomically persisted may any report or issue be published; if reservation fails, publish nothing.
5. **Run the security disclosure gate:** the local security report and then the publication offer follow the loaded "Security disclosure gate" — in that order and before any tracker mutation. Use the same report handle, directory guards, and collision mechanics as local mode, and never inspect or create a report below a linked execution worktree.
6. **Create finding issues:** Build each canonical payload through the helper and publish one issue per reserved ID. Publish the `publishable` findings, plus the withheld findings only when the gate returned an explicit publication confirmation. Canonical writes always use `Signature`. An issue-creation failure does not roll memory back; report any created subset and leave unused reserved IDs as permanent gaps.
7. **Create a new epic:** Create a **new** epic issue from the helper's canonical epic payload in the resolved Forge language (English title `Code review YYYY-MM-DD[-N]` and section `Skipped (design decisions)`; German title `Code-Review YYYY-MM-DD[-N]` and section `Übersprungen (Architekturentscheidungen)`), with label `effective-flow-review-epic`. The task list contains exclusively the finding issues newly created in this run. Skipped findings (design decisions) go into that non-checkable localized section and are identified by title, normalized signature, and decision reference only. They receive no issue, no `R-XXXXXXX` ID, and do not advance `lastFindingNumber`. Already-existing (deduplicated) findings are **not** referenced. An existing epic is never extended. Record the epic number in the `Epic` field of the associated finding issues. On an external target, build the container with the mechanism decided in Phase 1 — the native parent/sub-issue relation when the connection exposes one, otherwise the checklist — and never mix both within one container.
8. **Avoid an empty epic:** If no new findings remain after dedup, do **not** create an empty epic; instead report to the user that all findings already exist as issues. The same applies to the split: if every new finding of this run stayed local, create no epic and report the local report path instead.
9. Do not rewrite `memory.json` after publication; the range was already persisted in Step 4.
10. Report to the user the resolved target (for `external` including tool identifier, connection, and container mechanism), the epic URL or identifier, the number of newly created findings, the number of deduplicated findings, plus the number of withheld findings and the local report path. If this run published to a different target than the previous run recorded, state that deduplication does not span targets and that findings may already exist in the old one.
11. Delete the wisdom file.
12. Emit the next-step block per `next-steps` as the last element of the report.

**Completion condition (no correction loop):** The review is complete when the findings that were quality-checked in Phase 3, filtered against design decisions, and classified by the security gate are available — on the `local` target in the report, on a publishing target as finding issues plus their container (or with the message that all findings already exist), with every withheld finding in the local security report or, if that report was blocked, reported in the chat as not persisted —, the exact published finding range was reserved atomically before publication, and the wisdom file has been deleted. The independent check is provided by the finding-quality check in Phase 3 (confidence filter, duplicate and severity consistency). This workflow only produces a report and implements nothing; therefore there is no bounded correction loop.

```lazy-include
review-report-format
when: a review report is written or an existing one is augmented
```

## Known limitations

- **The directory split in Phase 2c** can obscure cross-cutting issues across module boundaries (e.g. architecture consistency between `src/components/` and `src/lib/`). For repos where such cross-module reviews are important: override the threshold in the user argument or review the entire scope without a split.
- **Reviewers in Phase 2c have no design-decision context** — a deliberate trade-off in favor of speed. The central filter in Phase 3 catches documented design decisions but, in ambiguous cases (partial overlap), may produce more false positives than a reviewer-informed pass.
- **Phase 3 may only start once all three Phase-2 streams are complete.** An LLM orchestrator must observe this synchronization explicitly — opportunistic pre-reading while a stream is still writing leads to incomplete data in aggregation and filtering.

## Minimal fallback without the skill

Only relevant if `codebase-improvement` is not available. Brief core guidance for the finding-quality reasoning in Phase 3 so that `review` degrades cleanly – **not** a second full audit handbook:

- A finding counts only with concrete evidence (file+line, reproducible cause); discard vague or purely stylistic guesses.
- Merge duplicates via the content signature (file+line, area, similar problem), not via the wording.
- Prioritize by impact: highest damage × probability of occurrence first; broadly effective causes before local symptoms.
- The deterministic gates above (confidence < 80, severity consistency, finding scope) remain unchanged.

## Rules

- **Always start** Phase 2 (2a, 2b, 2c) **in parallel** — no sequential processing.
- Within Phase 2a, all design-decision sources in parallel.
- Within Phase 2c, all reviewer sub-agents in parallel (across routing buckets and across directory splits).
- Reviewers in Phase 2c check **no** design decisions — the central filter happens in Phase 3.
- On the `local` target, this skill writes the review report, temporary wisdom, memory, and valid cache entries. On a publishing target, it additionally writes finding issues and their container through the resolved target and writes a local report only for the findings withheld by the security gate. Every local runtime mutation uses “Runtime-state write safety”.
- A security-classified finding never reaches a tracker without the explicit per-run confirmation from the publication gate. This binds the forge and an external target alike, overrides `tracker.mode` and every other configuration, and no config key switches the gate off.
- Publication never spans two targets: `Signature` dedup and the reserved `R-XXXXXXX` range see only the resolved target, so report the limitation when this run publishes to a different target than the previous one.
- Prompt suggestions must be directly copyable without quotation marks and without escape sequences (applies to the report and the issue body alike).
- The active finding scope (default: only critical+important) must be respected in the report or in the finding issues.
