# Concept tool with deep concept review

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

Effective Flow currently starts at the level of a concrete change: `plan` writes an implementation
plan for a requirement, `investigate` analyses a defect, `build`/`fix`/`refactor`/`docs` implement.
There is no entry point for the step before that — deciding **what application to build at all**.

The new tool `/effective-flow concept` fills that gap. It produces a **complete but deliberately
shallow** concept for a new application or program: problem, target users, use cases, MVP scope,
non-goals, and a coarse technical direction. It is explicitly not an implementation plan and
contains no work breakdown yet.

Once the user is satisfied with that concept, a **deep concept review** elaborates it: it resolves
open decisions interactively, deepens the existing sections, and records the first planning steps
as a roadmap of work packages inside the same concept file, each with a recommended
`/effective-flow plan` handoff.

The classification is **Feature**: two new tool sources, one new shared fragment, a new
configuration key, a new routing branch in `review`, plus documentation and contract tests. No
existing behaviour is corrected or restructured, so neither Bugfix nor Refactoring applies, and the
change is not documentation-only.

## Architecture decisions

- **Own artifact directory, own configuration key.** Concepts live under `<concept.dir>/` (new
  configuration key `concept.dir`, default `docs/concept`), not under `<plan.dir>/`. Rationale: the
  plan corpus is consumed by resolvers that treat every file there as an implementable plan
  (`open-plans`, `apply` Stage A in `src/shared/apply-source-detection.md`, delivery archiving). A
  concept is not implementable and must never be picked up by them. A separate directory keeps all
  of those contracts untouched instead of teaching each of them a new exception.
- **One exposed tool, one internal tool.** `concept` is exposed via `TOOL_GROUPS`;
  `concept-review` is an internal tool source (built, but not listed in the router), exactly like
  `plan`/`plan-review`. This adds a single catalog line and reuses the established
  "gateway tool + internal deep review" shape.
- **Deep review entry points.** `concept` offers the deep review at the end of its own run (`ask`
  fence, same as `plan` Phase 6b). The later re-entry is `/effective-flow review <concept-file>`,
  through a new concept-file special case in `src/tools/review.md`. Calling `concept` with an
  existing concept file deliberately does **not** become a second mode: it reports the correct
  re-entry command and ends, so the tool keeps one purpose.
- **One shared fragment.** `src/shared/concept-contract.md` carries the directory and naming
  convention, the status marker, and the complete bilingual field/section mapping. The plan
  equivalent is split across three fragments (`plan-status`, `plan-contract`, `plan-numbering`)
  for historical reasons; the concept surface is small enough that one fragment is the honest
  boundary and avoids three near-empty files.
- **Status marker with two states.** `**Concept status:** Draft` / `**Concept status:** Elaborated`
  (German: `**Konzeptstatus:** Entwurf` / `**Konzeptstatus:** Ausgearbeitet`). Exactly one status line
  per file, same strictness as the plan-status convention (no mixed key/value language, no free
  text). There is deliberately no `Implemented` state and no concept archive: a concept is not
  implemented directly, it hands off to plans.
- **The roadmap stays inside the concept.** The deep review writes a
  `## Roadmap and work packages` section into the concept file and recommends one
  `/effective-flow plan` call per package. It never creates plan files. This keeps the write
  boundary of both tools at `<concept.dir>/` and keeps `<plan.dir>/` free of plans nobody has
  decided to start yet.
- **Handoff by self-contained text, not by coupling.** Each work package carries a ready-to-paste
  call whose requirement text already names the concept file, for example
  `/effective-flow plan "<work package> — see docs/concept/<file>.md"`. `src/tools/plan.md` and its
  gateway stay unchanged: Stage A of `plan-input-gateway` knows plans, review reports, and issue
  references, so a concept path falls through to the local planning workflow as free-text
  requirement — which is exactly what the handoff text is written for. Accepted consequence: the
  link is a convention, not an enforced contract.
- **No backlink tracking.** A concept is a stable document once elaborated; it does not maintain a
  list of the plans derived from it. Git history, the plans themselves, and the tracker already
  carry that relation, and any in-concept list would either go stale or force `plan` to write into
  `<concept.dir>/`.
- **Durable decisions are named, not authored.** The deep review marks decisions that deserve an
  ADR as ADR candidates inside the concept and recommends the next step; it writes nothing under
  `docs/adr/`. The judgment about ADR merit comes from `decision-records` through the relevance
  gate, consistent with how `apply-review` already consumes that owner.
- **Domain judgment is delegated, not copied** (AGENTS.md ownership check). `product-management` is
  the declared owner for product outcomes, audience, and prioritization and is therefore the
  **delegate**-level owner for both new tools. `software-architecture`, `product-design`,
  `effective-web`, and `web-legal-compliance` stay behind the relevance gate;
  `codebase-improvement` provides the artifact-level review judgment in `concept-review`. The tool
  sources carry only scope, output contract, lifecycle, and a short minimal fallback — no second
  product-discovery or architecture handbook.
- **Greenfield-first.** Both tools must work in a repository that contains no product code yet.
  Codebase and `AGENTS.md` context is read when present and recorded as verified context; its
  absence is a normal case, not an error.

## Affected files

| File                                        | Description                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/tools/concept.md`                      | **New** exposed tool source: frontmatter (`description`, `catalogHint`, both strictly double-quoted), scope boundary, phases 1–6, concept template, `ask` fence for the deep review.                                                                                                             |
| `src/tools/concept-review.md`               | **New** internal tool source: file adapter, finding split, interactive decision loop, roadmap authoring, status transition, persistence and re-entry contract.                                                                                                                                   |
| `src/shared/concept-contract.md`            | **New** shared fragment: `concept.dir`, file naming, collision rule, status marker, complete bilingual field/section mapping, roadmap section contract.                                                                                                                                          |
| `build.mjs`                                 | Add `'concept'` to the `Understand what to do` group in `TOOL_GROUPS` (first position, before `investigate`). `concept-review` stays unlisted and is therefore internal.                                                                                                                         |
| `src/tools/review.md`                       | New `### Concept-file special case`, placed **after** the plan-file special case and **before** the pull-request special case; resolves `<concept.dir>/` and delegates to `{{SKILL:concept-review}}`.                                                                                            |
| `src/SKILL.md`                              | The router `description` frontmatter enumerates the tools by name (`Tools: build, fix, plan, …`); add `concept` there. No build guard covers this list, so it is a manual accuracy edit.                                                                                                         |
| `src/shared/session-title.md`               | Add `concept` and `concept-review` to the list of work-subject tools that may propose a session title; without it a concept run stays on the generic default title.                                                                                                                              |
| `src/tools/setup.md`                        | Add `concept.dir` to the advanced configuration group list (currently group 4 `plan`) and to the setup summary that already names `plan.dir`.                                                                                                                                                    |
| `src/shared/doc-categories.md`              | The sentence declaring the date-slug scheme "exclusive to the plan directory" must also name `<concept.dir>/`; otherwise the fragment contradicts the new convention.                                                                                                                            |
| `docs/user-guide/tools-understand.md`       | New `## /effective-flow concept` section (first tool section), including the deep-review re-entry via `/effective-flow review <concept-file>`.                                                                                                                                                   |
| `docs/user-guide/tools-quality.md`          | Document the concept-file branch of `/effective-flow review` next to the existing plan-file branch.                                                                                                                                                                                              |
| `docs/user-guide/configuration.md`          | Add `concept.dir` to the full key table and to the `plan` key group description.                                                                                                                                                                                                                 |
| `docs/user-guide/glossary.md`               | Glossary entries for "Concept" and "Concept review", including the delimitation from "Plan".                                                                                                                                                                                                     |
| `docs/developer-guide/skill-ownership.json` | Add `concept`/`concept-review` as consumers of `product-management` (delegate), `codebase-improvement`, `software-architecture`, `product-design`, `web-legal-compliance`, `effective-web`, and `decision-records` (ADR candidates, route-when-relevant). `relevanceGateOwners` stays unchanged. |
| `docs/developer-guide/skill-ownership.md`   | Update the consumer and classification columns of the same rows (the build reconciles manifest and table).                                                                                                                                                                                       |
| `AGENTS.md`                                 | Short "Concept files (`docs/concept/`)" paragraph next to the existing plan-files paragraph.                                                                                                                                                                                                     |
| `README.md`                                 | One sentence in the entry flow: greenfield starts at `/effective-flow concept`, an existing codebase at `/effective-flow plan`.                                                                                                                                                                  |
| `test/workflow-contracts.test.mjs`          | New contract tests (see Validation plan).                                                                                                                                                                                                                                                        |

Deliberately **not** touched: `src/tools/plan.md`, `src/shared/plan-input-gateway.md`,
`src/shared/apply-source-detection.md`, `src/tools/open-plans.md`, `src/tools/apply*.md`,
`src/shared/plan-*.md`, and the delivery/archive contracts. The separate-directory and
handoff-by-text decisions are what keep them out of scope.

## Implementation details

### Approach

1. **Fragment first.** Write `src/shared/concept-contract.md`: `<concept.dir>` resolution (config
   key `concept.dir`, default `docs/concept`), file name `YYYY-MM-DD-<slug>.md` with the same
   same-day collision suffix rule as plans, the status-marker convention with its four canonical
   forms, the bilingual field/section mapping, and the roadmap-section contract. State explicitly
   that a configured `concept.dir` identical to `plan.dir` is a configuration error that aborts
   with a clear message instead of being silently accepted.
2. **`src/tools/concept.md`.** Frontmatter description plus `catalogHint` (one usage-oriented
   line). Lazy-includes: `concept-contract`, `language-rules`; eager includes: `task-tracking`,
   `skill-discovery`, `central-reasoning-delegation`. `## Recommended skills` lists
   `product-management` (and nothing that lacks an ownership relationship — the build guard rejects
   an unowned recommendation). Phases as described below.
3. **`src/tools/concept-review.md`.** Internal tool, no `catalogHint`. Lazy-includes
   `concept-contract`; eager includes `task-tracking`, `skill-discovery`,
   `central-reasoning-delegation`, `language-rules`. Input contract: exactly one concept reference
   (full path, date-slug file name, or title slug) under `<concept.dir>/`; direct invocation with
   no reference asks instead of guessing the newest file.
4. **Routing in `src/tools/review.md`.** Insert the concept-file special case between the two
   existing special cases and preserve the documented four-digit precedence note verbatim.
5. **Registration.** Add `'concept'` to `TOOL_GROUPS`; `node build.mjs` then generates the catalog
   entry for all three targets and ships both new tool files plus the new shared fragment.
6. **Configuration surface.** Extend `src/tools/setup.md` and the configuration documentation. This
   repository's own project-setup ADR needs no new row as long as the default is used.
7. **Documentation and ownership manifest.** Update the user guide, glossary, `AGENTS.md`,
   `README.md`, and both skill-ownership files.
8. **Tests.** Add the contract tests to `test/workflow-contracts.test.mjs`.
9. **Verification.** Run `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`
   in that order (the sequence CI uses).

### Phases of `/effective-flow concept`

1. **Phase 0 — Argument gateway.** No argument: ask for the product idea. Argument resolves to an
   existing file under `<concept.dir>/`: report `/effective-flow review <concept-file>` as the
   correct entry point and end. Anything else is treated as the free-text product idea.
2. **Phase 1 — Context.** Read `AGENTS.md` and the repository structure when present; record
   verified context separately from assumptions. An empty repository is a valid state and is
   recorded as "no verified code context".
3. **Phase 2 — Bounded clarification.** Ask only about what changes the concept's substance:
   problem, primary users, the two or three central use cases, platform, hard constraints,
   explicit non-goals. Keep this bounded (at most two question rounds) — the artifact is
   deliberately shallow, and remaining uncertainty becomes an assumption or an open point instead
   of another question round.
4. **Phase 3 — Write the concept** under `<concept.dir>/YYYY-MM-DD-<slug>.md` in the resolved
   `language.workflow`, using the template below.
5. **Phase 4 — Self-check** against the scorecard (see "Plan validation" criteria mirrored for the
   concept artifact: every mandatory section filled, non-goals present, no work breakdown, no
   code).
6. **Phase 5 — Offer the deep review** through an `ask` fence ("Start the deep concept review
   now?" / Yes / No). On Yes: read `{{SKILL:concept-review}}` and run it with the just-written
   file. On No: report the re-entry command.
7. **Phase 6 — Completion report:** file path, one-paragraph summary, scorecard result, the note
   that no code was written, and the two possible follow-ups (deep review, or `/effective-flow
plan` once work packages exist).

### Concept template (English form)

The German form is rendered from the bilingual mapping in `concept-contract`; the file uses one
language throughout, exactly like a plan.

```markdown
# [Concept title]

**Concept status:** Draft
**Source:** /effective-flow concept

## Problem and motivation
## Target users and use cases
## Solution sketch
## Scope
### In scope (first version)
### Non-goals
## Technical direction
## Risks and open questions
## Roadmap and work packages
## Concept review
## Open points
```

Rules that belong in the fragment, not in prose here: `## Roadmap and work packages` carries the
empty state `- Not elaborated yet (see /effective-flow review <concept-file>).` while the status is
`Draft`; `## Concept review` mirrors the plan-review block with **Result**, a summary table over the
areas Product fit, Scope, Technical feasibility, Data and security, Risks, Roadmap, and a findings
list; `## Open points` uses the plan's empty states (`- No open points.` /
`- Keine offenen Punkte.`).

### Phases of the internal `concept-review`

1. **Load and normalize:** resolve exactly one file under `<concept.dir>/`, read it fresh, preserve
   its complete artifact language, ensure the review and open-points sections exist.
2. **Findings:** obtain the judgment from `codebase-improvement` at the artifact level and from
   `product-management` for the product substance; cross the relevance gate to
   `software-architecture`, `product-design`, `effective-web`, or `web-legal-compliance` only when
   the concept actually touches those boundaries. Split into directly incorporable corrections and
   decision-requiring points.
3. **Interactive decisions:** walk the decision-requiring points one by one, offering up to three
   substantive options plus "Decide later" (the shape `plan-review` already uses). Incorporate each
   answer into the matching section; "Decide later" becomes a concrete open point with a re-entry
   note.
4. **Deepen and lay out the roadmap:** elaborate the existing sections and fill
   `## Roadmap and work packages` with ordered work packages. Each package names its goal, its
   rough scope, what would make it done, its dependencies on other packages, and a ready-to-paste
   handoff whose requirement text points back at the concept file. No plan file is created, and no
   backlink section is maintained.
5. **Mark ADR candidates:** decisions in the concept that are durable rather than provisional are
   flagged as ADR candidates with a one-line rationale, using `decision-records` through the
   relevance gate for the merit judgment. Nothing is written under `docs/adr/`.
6. **Persist after every step** (the file is the re-entry point), keep `## Concept review` and
   `## Open points` current.
7. **Completion:** set `**Concept status:** Elaborated` only when no critical finding and no
   implementation-blocking open point remains; otherwise the status stays `Draft` and the review
   result is "Revision required". Report the file path, the number of blocking open points, the
   re-entry `/effective-flow review <concept-file>`, and the first recommended `plan` call.

### Component structure

Not relevant — this change ships Markdown contracts and one build registration, no runtime
components.

### State management

Not relevant beyond the artifact itself: the concept file is the single source of truth and the
re-entry point. Neither tool touches `.effective-flow/` runtime state, memory, cache, wisdom files,
or the tracker.

### API integration

Not relevant — no tracker, forge, or network access in either tool.

### Styling approach

Not relevant.

### Accessibility

Not relevant for the tool sources themselves. Accessibility questions inside a concrete concept are
routed to `effective-web` through the relevance gate.

### Edge cases

- **`<concept.dir>` missing:** created on first write; a missing directory is never an error.
- **Same-day slug collision:** append `-2`, `-3`, … as in the plan convention; never overwrite.
- **`concept.dir` equals `plan.dir`:** rejected as a configuration error with a clear message,
  because the `review` router could no longer tell a plan from a concept.
- **Existing concept file passed to `concept`:** report the `review` re-entry and end; no second
  mode.
- **Argument matches a plan file and a concept file:** ambiguous — name both interpretations and
  ask, never guess.
- **Bare four-digit argument in `review`:** stays a legacy plan reference; the concept branch is
  evaluated after the plan branch and must not change that precedence.
- **Concept reference resolves to several concept files:** ask for the specific file.
- **`language.workflow: de`:** the complete artifact including the status marker is German; a
  mixed-language concept file is clarified before editing rather than silently normalized.
- **Deep review interrupted:** the file already on disk carries every decision made so far, so
  `/effective-flow review <concept-file>` resumes without loss.
- **Empty repository / no `AGENTS.md`:** normal greenfield case; context is recorded as absent.
- **`skills.enabled: false` or the owner skills excluded:** the minimal generic fallback applies
  (short core checklist), and the run still completes.

## Acceptance criteria

- [x] `node build.mjs` completes without error and emits `tools/concept.md`,
      `tools/concept-review.md`, and `shared/concept-contract.md` in all three targets
      (`dist/claude/effective-flow/`, `dist/codex/effective-flow/`,
      `dist/portable/effective-flow/`).
- [x] All three generated routers list `concept` in the `Understand what to do` group with its
      `catalogHint`, and none of them lists `concept-review`.
- [x] `/effective-flow concept "<idea>"` writes exactly one file `<concept.dir>/YYYY-MM-DD-<slug>.md`
      with `**Concept status:** Draft`, all template sections present, and changes no file outside
      `<concept.dir>/`. Verified as a contract, not by an end-to-end run: the write boundary, the
      template, and the status forms are pinned by the new contract tests.
- [x] Running the deep review on that file fills `## Roadmap and work packages` with at least one
      work package whose handoff text is a complete, paste-ready `/effective-flow plan` call naming
      the concept file, updates `## Concept review`, and sets `**Concept status:** Elaborated`
      exactly when no critical finding and no blocking open point remains — while creating no file
      under `<plan.dir>/` and no file under `docs/adr/`. Pinned by the contract tests for the same
      reason.
- [x] Durable decisions in that concept are marked as ADR candidates with a rationale, and no ADR
      is written by the workflow.
- [x] `/effective-flow review <concept-file>` enters the concept review, and `review` still routes
      a plan reference to `plan-review` and a bare four-digit value to the legacy plan path.
- [x] `pnpm agent:check`, `pnpm test`, and `pnpm test:distribution` pass, including the new
      contract tests.
- [x] The registration surface is complete: `concept` appears in `TOOL_GROUPS`, in the router
      `description` in `src/SKILL.md`, and — together with `concept-review` — in the work-subject
      tool list of `src/shared/session-title.md`.
- [x] `docs/user-guide/tools-understand.md`, `tools-quality.md`, `configuration.md`, `glossary.md`,
      `AGENTS.md`, and `README.md` describe the tool, the `concept.dir` key, and both entry points;
      the skill-ownership manifest and table reconcile (enforced by the build guard).

Not performed: the optional manual smoke test from the validation plan (an interactive
`/effective-flow concept` run against a throwaway idea). It needs the built skill to be installed
and would create and discard files outside this change; the behavioural contracts it would exercise
are covered by the six new contract tests.

## Validation plan

All commands run from the repository root and must exit 0, in the order CI uses.

- `pnpm agent:check` — formatting gate for the new and edited Markdown sources.
- `pnpm test` — unit suite including the new contract tests in `test/workflow-contracts.test.mjs`:
  1. `concept.md` and `concept-review.md` state the `<concept.dir>/`-only write boundary and forbid
     creating plan files or code.
  2. `review.md` keeps the order plan-file special case → concept-file special case → Phase 1,
     with the four-digit precedence sentence intact (the base branch carries no pull-request
     special case; see the implementation notes).
  3. All three concept consumers reference `concept-contract` exactly once through a lazy include.
  4. `concept-contract.md` declares the four canonical status forms and the
     `concept.dir` ≠ `plan.dir` rule.
  5. `concept-review.md` sets `Elaborated` only in the no-critical-finding case and points its
     re-entry at `{{SKILL:review}}`, never at a tracker.
  6. `concept-review.md` names ADR candidates but forbids writing under `docs/adr/`, and neither
     new source instructs `plan` to be changed or a concept path to be routed through the plan
     gateway.
- `node build.mjs` — exercises the catalog, `catalogHint`, reference, lazy-fragment, and
  skill-ownership guards.
- `pnpm test:distribution` — archive and install layout including the new files.
- Manual smoke test in this repository: run `/effective-flow concept` for a throwaway idea, inspect
  the written file, run the deep review, then discard both the file and `docs/concept/`.

## Assumptions and open points

**Planning basis:** HEAD `70ed27e` on `effective-flow/build/pr-review-integration`, 2026-07-27.
Working state at planning time: no modified tracked files; three untracked plan files under
`docs/plan/` (including this one). Before executing, re-read `build.mjs` (`TOOL_GROUPS`),
`src/tools/review.md`, `src/shared/doc-categories.md`, and
`docs/developer-guide/skill-ownership.json` and confirm the referenced sections still exist.

**Stop conditions:**

- Stop if `concept` cannot be registered without touching an unrelated resolver — that would mean
  the separate-directory decision no longer holds and the plan needs revision, not a workaround.
- Stop if the skill-ownership build guard demands a change to `relevanceGateOwners`. That list is
  reconciled against the marker in `src/shared/central-reasoning-delegation.md`; adding consumers
  must not change it. If it does, the ownership classification was chosen wrongly.
- Stop if `pnpm test` or `pnpm test:distribution` is already failing on the base branch, so results
  cannot be attributed to this change.
- Stop before adding any tracker, network, or runtime-state access to either tool; both are
  documentation-only workflows by design.

- Assumption: `language.workflow` (`en` here) governs the concept artifact, exactly as it does for
  plans; no separate language key is introduced.
- Assumption: concepts are committed like plans (`docs/concept/` is tracked, not gitignored) —
  they are project documentation, not runtime state.
- Assumption: no concept archive and no `Implemented` status in this scope; if concepts accumulate
  later, an archive can be added the same way `<plan.dir>/archive/` was.
- Assumption: `/effective-flow open-plans` continues to list plans only. A concept overview is a
  possible follow-up, not part of this change.
- Decided in the deep plan review: the handoff is self-contained text, the concept keeps no
  backlinks to derived plans, and durable decisions are only marked as ADR candidates. The
  rationale for each is recorded under "Architecture decisions"; the rejected alternatives
  (gateway coupling, a maintained "derived plans" section, ADR authoring from the concept
  workflow) are deliberately out of scope and would each need their own plan.

## Implementation notes

Implemented on 2026-07-27 by `/effective-flow build` in the delivery worktree on branch
`effective-flow/build/concept-tool-with-deep-concept-review`, based on `origin/develop` (`2dddb72`).

Deviations from the plan, all deliberate:

- **No pull-request special case on the base branch.** `origin/develop` has no
  `### Pull-request special case` in `src/tools/review.md` — that section comes from the still
  unmerged branch `effective-flow/build/pr-review-integration`. The concept-file special case
  therefore sits between the plan-file case and `### Phase 1: Scope`, and its contract test pins
  that order. When both branches merge, the intended final order is plan → concept →
  pull-request; the four-digit precedence sentence exists once per branch and is kept.
- **`ask` header shortened.** The harness limits an `ask` header to 12 characters, so Phase 5 of
  `concept` uses `Deep review` instead of `Concept review`.
- **Ownership manifest wider than planned.** Besides the recommended skills, `concept` and
  `concept-review` were declared as consumers of the relevance-gate owners they name in prose
  (`effective-web`, `software-architecture`, `product-design`, `web-legal-compliance`) plus
  `decision-records` for the ADR-candidate judgment. `relevanceGateOwners` stayed unchanged, as the
  stop condition required.
- **`doc-categories` wording generalized** instead of merely extended: the date-slug scheme is now
  described as exclusive to the two Effective Flow artifact directories.

## Test results

All commands run from the repository root in the delivery worktree, in CI order:

| Check                    | Result                                                         |
| ------------------------ | -------------------------------------------------------------- |
| `pnpm agent:check`       | passed — all 254 files correctly formatted                     |
| `pnpm test`              | passed — 369 tests, 0 failures, including 6 new contract tests |
| `node build.mjs`         | passed — 18 exposed tools (+7 internal) in all three targets   |
| `pnpm test:distribution` | passed — offline distribution checks                           |

Verified acceptance criteria: `dist/{claude,codex,portable}/effective-flow/tools/concept.md` and
`concept-review.md` plus `shared/concept-contract.md` exist in every target; all three routers list
`concept` under "Understand what to do" with its `catalogHint` and none lists `concept-review`; the
router `argument-hint` and `description` carry `concept`.

## Review findings

**Date:** 2026-07-27
**Reviewer:** inline orchestrator review (no reviewer subagents — the session forbids unrequested
agent calls; disclosed instead of silently skipped)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     2 |
| Open / Not implemented |     1 |

- **F1 — Important, Low, markup** (`src/shared/concept-contract.md`): the roadmap empty state was
  written as a code span containing escaped backticks, which renders broken in the shipped
  fragment. **Fixed** — replaced by prose that points at the template block.
- **F2 — Note, Low, documentation** (`docs/user-guide/tools-understand.md`): the configuration link
  named only `#block-plan` although `#block-concept` now exists. **Fixed** — both anchors linked.
- **F3 — Note, Low, merge coordination** (`src/tools/review.md`): see the first implementation note
  above. **Not implemented** — nothing is actionable in this branch; the reconciliation belongs to
  whichever branch merges second. No external review report was written, because this is an
  informational coordination note rather than a defect handed to `/effective-flow apply`.

No critical findings.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         2 |    0 |
| Scope           |        0 |         3 |    1 |
| Maintainability |        0 |         2 |    1 |

### Findings

- **Architecture, important — plan corpus contamination.** Storing concepts under `<plan.dir>/`
  would have forced exceptions into `apply-source-detection`, `open-plans`, and the delivery
  archive path, all of which treat every file there as implementable. Incorporated: the separate
  `concept.dir` decision, plus the explicit non-scope list under "Affected files".
- **Error cases, important — `concept.dir` = `plan.dir`.** A configuration where both keys point
  at the same directory would make the `review` router unable to distinguish the two artifact
  types. Incorporated as an edge case and as a rule that belongs in the fragment: fail with a clear
  message instead of guessing.
- **Scope, important — two tools versus one two-mode tool.** A single tool with a file-argument
  mode would have been smaller but mixes two lifecycles in one source. Incorporated: the exposed
  gateway plus internal deep review mirrors `plan`/`plan-review`, and `concept <existing-file>`
  explicitly refuses to become a second mode.
- **Maintainability, important — no second domain handbook.** A concept tool invites copying a
  product-discovery playbook into the source, which the AGENTS.md ownership check forbids.
  Incorporated: `product-management` is the delegate-level owner, the other owners stay behind the
  relevance gate, and the source keeps only a minimal fallback.
- **Testability, important — routing regressions are silent.** The `review` router's precedence is
  already pinned by an ordered contract test; inserting a branch without extending it would let a
  future reordering pass. Incorporated as validation item 2.
- **Scope, note — shallow stays shallow.** Without a bound, the clarification phase would grow the
  first concept into a full specification and erase the difference between the two depths.
  Incorporated: at most two question rounds in Phase 2, and a self-check criterion "no work
  breakdown, no code".
- **Scope, important — incomplete registration surface.** A new tool is not registered by
  `TOOL_GROUPS` alone: the router `description` in `src/SKILL.md` enumerates the tool names by hand
  and no build guard covers that list, and `src/shared/session-title.md` enumerates the tools that
  may propose a session title. Both were missing from the first draft and are now in the affected
  files.
- **Maintainability, note — drift and stop conditions.** The plan now records its planning basis
  (HEAD, date, working state) and the files to re-read before execution, plus explicit stop
  conditions, so a later executor can tell whether the plan still describes reality.
- **Security, note.** Neither tool touches the tracker, forge, network, or runtime state, and both
  write a single documentation file, so no security or data-protection surface is added. Recorded
  deliberately rather than left implicit.
- **Architecture, important — broken handoff to `plan` (deep review, decided).** The first draft
  recommended `/effective-flow plan "<work package>"` without checking what `plan` does with a
  concept path. Verified against `src/shared/plan-input-gateway.md`: Stage A knows only plans,
  review reports, and issue references, so a concept path is treated as free-text requirement.
  Decision: keep `plan` unchanged and make the handoff text self-contained by naming the concept
  file inside the requirement string. Rejected: teaching the gateway a concept type (grows
  `plan.md`, the gateway, docs, and tests for a convenience gain).
- **Scope, important — concept lifecycle creep (deep review, decided).** A "derived plans" section
  in the concept would either go stale or force `plan` to write into `<concept.dir>/`. Decision: no
  backlink tracking; Git history, the plans, and the tracker carry that relation.
- **Maintainability, important — durable decisions without a home (deep review, decided).**
  Concepts contain architecture and product decisions that outlive the concept. Decision: the deep
  review marks ADR candidates and defers authoring, with `decision-records` supplying the merit
  judgment through the relevance gate; the write boundary stays `<concept.dir>/`. This adds
  `decision-records` to the ownership manifest as a consumer relationship without changing
  `relevanceGateOwners`.
- **Testability, important — the three decisions must be pinned (deep review).** Handoff text,
  absent backlinks, and ADR-candidate-only behaviour are conventions that a later edit could
  silently reverse. Incorporated as validation item 6 and two acceptance criteria.

## Open points

- No open points.
