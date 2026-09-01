# Effective Flow — architecture and consistency review

**Date:** 2026-08-31
**Scope:** whole repository at `3b44300` (develop), measured against the current central skills
collection (`sebastian-software/skills.sebastian-software.com`, DALO checkout at `f79397b`).
**Language:** English, per this repository's own `language.workflow: en`.

This is a review report, not a plan. It carries no plan status marker and is not subject to the
plan contract. Findings are numbered `F-nn` so follow-up plans can cite them.

## Implementation status

This document records the repository as it stood at `3b44300`. It is kept as the point-in-time
review it was, not rewritten as work lands, so the table below is the only place that tracks what
has changed since. Update it when a finding is closed; leave the finding text itself alone.

| Finding                                              | Status      | Landed as                                                                                                       |
| ---------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| F-01 `deliver` missing from the router description   | implemented | `02e6696` — the tool list is generated from `EXPOSED_TOOLS` and guarded                                         |
| F-02 stale `Firmo` branding in shipped descriptions  | implemented | `ce23e7a` — plus a guard scanning `src/` and both build scripts                                                 |
| F-10 local base branch unresolvable without a remote | implemented | `4740ca0` — one resolution rule distinguishing a missing remote from a failed fetch                             |
| F-05, F-06, §6.4 (the P2 ownership tier)             | implemented | `51d0dc9` (#393) — both specialist implementers thinned, `effective-marketing` declared, two build guards added |
| Everything else                                      | open        | —                                                                                                               |

Two corrections the implementation work produced, recorded here because they are defects in this
document rather than in the code:

- **The Rust CLI contract should not have been on the cut list.** `§6.1 D-1` and the P2 plan derived
  from it listed `CLI tools` among the sections to delegate. `cli-contracts.md` turns out to be
  reachable only from the central skill's _testing_ route, so under the same route-reachability rule
  this review applied to Node, it had to be retained. Review of #393 caught it; the section is
  retained there with that reason recorded in the source.
- **The Node coverage claim in `§6.1 D-2` was too strong.** A per-topic audit against the pinned
  skill checkout established that `route-typescript.md` is a language-contract route and covers
  none of the Node runtime layer, so only the language half was delegated. The asymmetry between
  Rust and Node in #393 is deliberate and evidence-based, not an unfinished migration.

---

## 1. Verdict

Effective Flow is a genuinely coherent system, and the parts that were deliberately optimised are
excellent: the thin router, the two-stage `include`/`lazy-include` mechanism, the build-time guards
(next-steps closure, catalogHint, version drift, workflow SHA pinning), the provider-neutral tracker
helper with real Forgejo parity, and the layered skill-ownership contract are all above the quality
bar you normally see in an agent workflow repo.

The problems are not conceptual. They are **uneven application of the repository's own good ideas**:

- **Progressive disclosure was proven on five tools and never rolled out.** `build`, `fix`, `docs`,
  `review` and `plan` expand by 89–116 lines from eager includes. `refactor`, `maintain`, `iterate`,
  `cleanup` and `apply-issues` expand by 1 036–1 826 lines. Same mechanism, opposite discipline.
- **The ownership check is not enforced anywhere.** Two specialist implementers carry a full second
  copy of a centrally owned playbook and declare no relationship at all, because nothing in the build
  fails when a `## Recommended skills` section is simply absent.
- **One of the six central skills — `effective-marketing` — has zero declared relationship**, while
  Effective Flow ships a `marketing-writer` agent doing exactly its job.
- **The "fully local" line is the least finished of the three.** It works for planning, review and
  apply, but the delivery preflight defaults to a remote ref and documents no fallback.
- **Over-specification is concentrated, not general.** `merge-gate` alone is 2 341 source lines,
  more than the next four tools combined, and ~880 of them run before Phase 0 begins.

Everything below is concrete and measured. Section 6 turns it into a priority order.

---

## 2. Consistency findings

### F-01 — `deliver` is missing from the router's skill description (defect, user-visible)

`src/SKILL.md` frontmatter ends with:

> `Tools: build, fix, plan, refactor, docs, review, apply, concept, plan-issue, maintain, iterate, commit, pr, merge-gate, setup, cleanup, open-plans, investigate, version.`

That is 19 names. `EXPOSED_TOOLS` (derived from `TOOL_GROUPS` in `build.mjs`) has 20 — `deliver` is
absent. The description is what both harnesses use for skill triggering and what a user reads when
they type the bare skill name, and `deliver` is a headline feature in `README.md`.

Root cause: `argument-hint` is generated from `EXPOSED_TOOLS` (`build.mjs:944`) and therefore cannot
drift, but the description is hand-written prose with **no** reconciling guard. Every other
cross-cutting list in this repo (next-steps rows, catalogHints, skill-ownership rows, workflow
action pins) has a guard; this one does not.

**Fix:** render the tool list into the description at build time, or add a guard that fails the build
when the description's `Tools:` sentence does not match `EXPOSED_TOOLS` exactly.

### F-02 — Stale `Firmo` brand in two shipped agent descriptions

- `src/agents/frontend-reviewer.md:2` — "…with **Firmo** confidence, design-decision filter, and report format…"
- `src/agents/ui-implementer.md:2` — "…under **Firmo** conventions for readability, file splitting…"

These are not internal comments. They are the `description` field that becomes the registered agent
description in `dist/claude/agents/` and `dist/codex/agents/`. The three other `Firmo` occurrences
(`apply-review.md:324` prose, plus the two intentional backcompat markers in `config-migration.md`
and `setup.md`) are separate: the markers are correct and must stay; the `apply-review.md:324` prose
should read "Effective Flow".

### F-03 — `worktree-integration` is eager in three tools and lazy in four

| Fragment loading       | Tools                                |
| ---------------------- | ------------------------------------ |
| ` ```lazy-include `    | `build`, `docs`, `fix`, `merge-gate` |
| ` ```include ` (eager) | `refactor`, `maintain`, `iterate`    |

Same 477-line fragment, same role (delivery/worktree setup), opposite discipline. There is no stated
reason why `refactor` needs it before it knows whether the run will deliver, when `build` does not.
Cost: 1 431 lines of always-loaded context across the three tools.

### F-04 — `issue-tracker` (419 lines) is eagerly loaded in five tools regardless of tracker mode

Eager sites: `apply-issues`, `apply-review-remote`, `apply`, `cleanup`, `plan-issue`.

`tracker.mode` defaults to `local`. A local-only project therefore pays 419 lines of GitHub/Forgejo
helper contract, label vocabulary, `firmo-` read compatibility and `sf-` migration mechanics in five
tools that will never touch a forge. The mode is resolved _inside_ the fragment, so the gate exists —
it is just evaluated after the context has already been spent.

Note the asymmetry: `tracker-target.md` (the `external` contract, 332 lines) **is** correctly
described as "Loaded only once a run has resolved the tracker target `external`". The forge contract
deserves the same treatment.

### F-05 — Two specialist implementers carry a second copy of a centrally owned playbook

`src/agents/rust-implementer.md` (131 lines) and `src/agents/nodejs-implementer.md` (120 lines) have
**no `## Recommended skills` section at all**. `rust-implementer` contains full sections on Cargo and
workspaces, error handling (`thiserror` vs `anyhow`), ownership/borrowing/lifetimes, trait
abstractions, async runtime choice, `Send`/`Sync`, `unsafe` discipline, CLI argument parsing and
database/ORM usage.

`effective-engineering` declares ownership of exactly this — its description names "Rust crates,
ownership, APIs, unsafe code, concurrency, and performance" and it ships
`rust-ownership-and-api-design.md`, `rust-errors-and-concurrency.md`, `rust-unsafe-and-ffi.md`,
`rust-architecture-and-boundaries.md`, `rust-performance-and-memory.md`,
`rust-quality-and-review.md`, `rust-simd-and-parallelism.md`, and the parallel `typescript-*` set.

The asymmetry is stark: `rust-reviewer` and `nodejs-reviewer` **do** recommend `effective-engineering`
and are 73–75 lines. Their implementer counterparts recommend nothing and are 120–131 lines. The
review half of each language was migrated to the layered contract; the implementation half was not.

**Root cause is structural.** `AGENTS.md` says the build "reconciles … every `## Recommended skills`
fallback token" — but an agent with no such section produces no token, so it reconciles cleanly. The
ownership check documented in `AGENTS.md` and `skill-ownership.md` is a **manual convention with no
enforcement**. That is why this drifted silently.

### F-06 — `effective-marketing` has no declared relationship, while `marketing-writer` does its job

`skill-ownership.json` declares relationships for five central skills. The sixth,
`effective-marketing`, appears nowhere in `src/` and only once in `docs/` (in the ownership prose,
as an exclusion).

Meanwhile `src/agents/marketing-writer.md` (111 lines) writes the root `README.md` as a marketing
entry page, and recommends `copywriting`, `copy-editing`, `marketing-psychology` — three
allowlisted third-party skills. `skill-ownership.md` states this deliberately: _"marketing copy craft
sits with the allowlisted `copywriting`, `copy-editing` and `marketing-psychology` skills."_

That decision predates the consolidation. `effective-marketing` now explicitly owns "commercial page,
campaign, sales, email, and social copy" and absorbed the `linkedin-*`, `consultant-profile` and
copy skills upstream. Routing Effective Flow's only marketing surface to three third-party skills
while the house-owned domain owner sits unused is the clearest ownership inversion in the repo.

### F-07 — Two config namespaces with overlapping semantics, mid-migration

`worktree.*` and `delivery.*` both carry `baseBranch`, `branchPrefix`, `completion`, `baseDir`,
`enabled`, `setup`. The intended split is documented in `worktree-integration.md` ("`delivery`
describes the delivery branch and its completion; `worktree` describes exclusively the execution
location") and the legacy fallback is real and correct.

But the migration is not finished, and readers must know it:

- `src/tools/pr.md:87,98` still reads "legacy fallback: `worktree.baseBranch`".
- `src/tools/apply-review-remote.md:77` and `src/tools/apply-issues.md:264` each restate the same
  legacy fallback inline.
- A third namespace, `applyReview.worktree.*`, means something different again (per-finding
  isolation) and is correctly scope-fenced — but a reader now has three `worktree` spellings.

This is not broken, it is unfinished. It should either complete (drop the legacy read after one
release, as `DEPRECATED_TOOL_ALIASES` does for tool names) or be centralised so the fallback rule is
stated once rather than three times.

### F-08 — `prReview.*` vs `delivery.prReview` vs `mergeGate.*`

`skill-ownership.md` documents this carefully and correctly: `delivery.prReview` and the legacy
`prReview.*` merge-gate block "mean entirely different things and are never read for one another."
The handling is right. The naming is a trap that will cost someone an incident. Worth an explicit
rename of the legacy block to something that cannot collide, on the same one-generation schedule.

### F-09 — The three deployment lines exist in configuration but nowhere in documentation

`setup` asks the tracker question with exactly the three options (`local` / `remote` / `external`),
which maps cleanly onto your three Groblinien. But:

- no user-guide page presents the three lines as scenarios;
- `getting-started.md` documents one flow — "The typical flow: Plan → Build → Pull Request" — which
  is line 2 or 3, never line 1;
- `setup` never asks whether a forge exists at all, so the tracker choice, `delivery.completion` and
  `delivery.baseBranch` are three independent questions the user must assemble into a coherent line
  themselves.

See §3 for the functional consequence.

---

## 3. The three Groblinien

| Capability                                              | 1. Fully local        | 2. Forge + built-in tracker | 3. Forge + external tracker       |
| ------------------------------------------------------- | --------------------- | --------------------------- | --------------------------------- |
| `concept`, `investigate`, `plan`, `open-plans`          | full                  | full                        | full                              |
| `plan-issue`                                            | n/a by design         | full                        | full                              |
| `apply`, `build`, `fix`, `refactor`, `docs`, `maintain` | full                  | full                        | full                              |
| `review` → findings                                     | local Markdown report | forge issues + epic         | external issues + container       |
| `apply` from findings                                   | full                  | full                        | full                              |
| Worktree isolation                                      | full                  | full                        | full                              |
| `commit`                                                | full                  | full                        | full                              |
| `deliver`                                               | **gap — see F-10**    | full                        | full                              |
| `pr`, `merge-gate`, `iterate`                           | n/a by design         | full                        | full (PRs stay on forge)          |
| Security disclosure gate                                | full                  | full                        | full                              |
| Post-merge issue lifecycle                              | n/a                   | full                        | full, with documented degradation |

**Lines 2 and 3 are in good shape.** Forgejo is not a token second provider: `merge-gate` documents
per-operation capability (`pullRequestChecksWait` unsupported, `issueClose` conditional on the probed
`tea api` transport) and takes a real no-watch path rather than pretending. The `external` contract
is the strongest single document in the repo — fail-closed on four named failure classes, fresh state
resolution before _every_ transition, proof-of-write before choosing the native container mechanism.

### F-10 — The local line's delivery preflight defaults to a remote ref with no documented fallback

`delivery.baseBranch` defaults to `origin/main`. `worktree-integration.md:138–145` states the
preflight:

> 2. `delivery.baseBranch` must be resolvable. If it is a remote ref (e.g. `origin/main`), first run
>    `git fetch REMOTE BRANCH` …

In a repository with no `origin`, this is unresolvable and nothing documents what happens next. The
tracker path handles the same situation explicitly (`issue-tracker.md:416` — "No Git repository / no
`origin` remote: remote mode not possible; report"), and `pr.md:86` knows how to strip the remote
prefix ("`main` for `origin/main`"). The delivery preflight has neither.

Concretely: a fresh local-only project taking Express defaults gets `tracker.mode: local` (correct)
and `delivery.completion: merge` (correct — local merge, no PR), and then the first `build` run hits
a preflight that wants to fetch from a remote that does not exist.

**Fix, smallest form:** in the preflight, if `delivery.baseBranch` is a remote ref whose remote does
not exist, fall back to its local branch part — the transformation `pr.md` and
`delivery.returnBranch: auto` already perform — and report the substitution once.

**Fix, better form:** have `setup` detect `origin` and default `delivery.baseBranch` to `main` (or
the current branch) when there is none.

### F-11 — No scenario-level entry point for line 1

Related to F-09 but functionally distinct. There is no `setup` question of the shape "does this
project have a Git forge?", so nothing coordinates the three answers that together define a line.
A user who wants purely local development must know to pick `local` + `merge` + a local base branch.

**Suggestion:** add one leading `ask` in `setup` Step 4 offering the three lines as named profiles,
each pre-filling the tracker/completion/baseBranch triple, with the existing per-key questions kept
as the Guided path. This is a small change with a large clarity payoff and it makes your three
Groblinien a first-class, testable concept rather than an emergent one.

---

## 4. LLM efficiency

### 4.1 Measured always-loaded cost

Resolved (post-eager-include) size of every built tool, and how much of it is include expansion:

| Tool           | Own source |  Resolved | Eager expansion | Budgeted?   |
| -------------- | ---------: | --------: | --------------: | ----------- |
| `merge-gate`   |      2 341 |     3 175 |             834 | yes (3 250) |
| `iterate`      |        776 | **2 602** |       **1 826** | **no**      |
| `refactor`     |        322 | **1 797** |       **1 475** | **no**      |
| `maintain`     |        274 | **1 593** |       **1 319** | **no**      |
| `apply-issues` |        392 | **1 583** |       **1 191** | **no**      |
| `setup`        |        975 |     1 565 |             590 | no          |
| `cleanup`      |        391 | **1 427** |       **1 036** | **no**      |
| `apply-review` |        604 |     1 401 |             797 | no          |
| `plan-issue`   |        437 |     1 137 |             700 | no          |
| `apply`        |        142 |       974 |             832 | no          |
| `deliver`      |        269 |       736 |             467 | no          |
| `review`       |        598 |       687 |          **89** | yes (700)   |
| `plan`         |        518 |       621 |         **103** | yes (700)   |
| `docs`         |        323 |       567 |             244 | yes (700)   |
| `build`        |        419 |       535 |         **116** | yes (700)   |
| `fix`          |        273 |       431 |             158 | yes (700)   |

The pattern is unmistakable. Where the eager/lazy discipline was applied — `build` (9 eager / 17
lazy), `review` (5/14), `plan` (5/11) — expansion is 89–116 lines. Where it was not — `refactor`
(18 eager / 7 lazy), `iterate` (14/4), `maintain` (14/5) — expansion is 1 300–1 800 lines.

### F-12 — The context budget guard covers 6 of 28 tools and misses the second-largest

`CONTEXT_BUDGET_LINES` in `build.mjs:1291` measures `build`, `fix`, `docs`, `review`, `plan`,
`merge-gate`. It does not measure `iterate` (2 602 lines), `refactor` (1 797), `maintain` (1 593),
`apply-issues` (1 583), `setup` (1 565) or `cleanup` (1 427) — every one of which is larger than
five of the six budgeted tools. The comment says merge-gate "is measured here so it can never grow
unwatched again"; the six tools above are precisely the ones growing unwatched.

**Fix:** budget every tool. Give the five converted tools their proven 700, put the unconverted ones
on a ratchet at their current size, and lower the ratchet as each is converted. That turns the
conversion backlog into something the build reports on every run.

### F-13 — Highest-leverage eager fragments

Cost = fragment lines × eager use sites:

| Fragment               | Lines | Eager sites | Total lines | Assessment                                                                                                                                                                                          |
| ---------------------- | ----: | ----------: | ----------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `language-rules`       |    79 |          32 |   **2 528** | Over-loaded. Most runs need "which language surface applies to my one output", not the full seven-key matrix. Split into a ~10-line resolution core (eager) + the full contract (lazy).             |
| `issue-tracker`        |   419 |           5 |   **2 095** | See F-04. Should be lazy behind the resolved tracker mode, exactly as `tracker-target` already is.                                                                                                  |
| `skill-discovery`      |    55 |          33 |       1 815 | Justified — this is the core mechanism and must run before work starts. Could still shed ~15 lines of rationale prose.                                                                              |
| `worktree-integration` |   477 |           3 |   **1 431** | See F-03. Already lazy in four tools; make it lazy in the other three.                                                                                                                              |
| `config-migration`     |   118 |          12 |   **1 416** | Over-loaded. The locator's four-step resolution order plus table encoding is ~40 lines; the ambiguity/tie-break/legacy-slug prose is the rest and is needed by `setup` and by ambiguous cases only. |
| `task-tracking`        |    16 |          41 |         656 | Fine.                                                                                                                                                                                               |
| `delegation-mandate`   |     9 |          32 |         288 | Fine — this is what a 9-line eager contract should look like.                                                                                                                                       |

Converting F-03, F-04, F-13's `language-rules` and `config-migration` alone removes on the order of
**4 000–5 000 lines** of always-loaded context across the tool set, with no behaviour change: every
one of these fragments already resolves a mode or a key _inside itself_, so the gate exists and only
the load point moves.

### F-14 — The always-on router spends 39% of itself on session titles

`dist/…/SKILL.md` is 142 lines. `src/SKILL.md` is 51 of them; the eagerly included
`session-title` fragment is 56. This is loaded in **every session that touches Effective Flow**,
before any tool is chosen, and it governs a cosmetic concern (proposing a better session name).

The router's stated purpose is "deliberately thin: beyond the tool catalog, the dispatch rule and the
session-title contract it carries nothing." The session-title contract is now the largest single
thing in it.

**Fix:** move `session-title` to a lazy include pulled by the tools that actually run long enough to
warrant a rename, or compress it to a ~10-line core with the host-capability edge cases lazy.

### F-15 — `merge-gate` spends ~880 lines before Phase 0

Structure of `src/tools/merge-gate.md` (2 341 lines):

| Lines    | Section                                                         |
| -------- | --------------------------------------------------------------- |
| 13–34    | Goal                                                            |
| 35–123   | **"`effective-delivery` stays out of this run"** (89 lines)     |
| 124–200  | Project conventions, checkout provisioning boundary             |
| 201–464  | Git write boundary, delegation contract                         |
| 465–587  | Returned outcome record                                         |
| 588–880  | Conflict-resolution delegation, configuration, advisory, wisdom |
| 881–2281 | Phases 0–6 (the actual workflow)                                |
| 2282+    | Rules                                                           |

Two observations. First, 89 always-loaded lines are spent explaining why a skill is _not_ loaded —
the reasoning is sound (§ "Deliberate boundaries" in `skill-ownership.md`) and belongs in the
developer guide, not in a runtime prompt; three lines of directive would do the job at run time.
Second, Phase 5.5 (post-merge issue observation) is 300 lines for a step that follows an
already-successful merge and is explicitly allowed to degrade. It is the strongest candidate in the
repo for a lazy fragment.

A realistic target is ~1 200 always-loaded lines with the boundary rationale, Phase 5.5, and the
conflict-resolution contract lazily loaded — roughly a 60% cut with no capability loss.

### F-16 — Over-specification risks fighting harness evolution

You asked specifically whether the definitions are too deep to let Claude Code and Codex improvements
flow through. Mostly they are not: the delegation mandate, worker model profiles and skill discovery
are all written against capabilities rather than mechanisms, which is right.

Three places do encode mechanism rather than intent, and will need edits when the harnesses move:

1. **`session-title` / `session-rename`** (56 + 282 lines) encode host-specific rename paths and
   probing rules. Every new host capability is a source edit.
2. **`merge-gate` Phase 2/3** encode polling, wait minutes and bot-acknowledgement behaviour
   (including "a bot acknowledges with an emoji reaction instead of a comment"). Reasonable today;
   brittle against forge and bot changes.
3. **`goal-completion.md`** — a single 4 416-character paragraph prescribing native task-tool state
   transitions in detail ("if only one entry may be active…", "submit result-dependent status changes
   only after the determining tool result is known"). This is the most harness-coupled paragraph in
   the repo, it is eagerly loaded in 10 tools, and it is genuinely hard to read. It should state the
   invariant (every phase reaches a truthful visible end state; never report completion with an
   unresolved entry) and let the harness's own task tooling handle the mechanics.

Everything else reads as durable.

---

## 5. Architecture against current practice

### What is right and should not change

- **Thin router + lazy tool loading.** This is the correct pattern and predates its general adoption.
- **Single source → multiple harness targets** with a version-drift guard. Better than the common
  practice of maintaining per-harness copies.
- **Build-time guards as the consistency mechanism.** next-steps closure, catalogHint, TOOL_GROUPS
  uniqueness, alias non-exposure, workflow SHA pinning with a single ref-matching test. This is the
  right instinct; §2 shows where it simply has not been applied yet.
- **Deprecated forwarding aliases instead of breaking renames**, with `Release-As:` for mistaken
  breaking markers. Correct and well documented.
- **Fail-closed external tracker with no shipped adapter.** Resisting the urge to ship a Linear
  adapter is the right call — it keeps Effective Flow glue rather than integration surface.
- **Read-only guarantee resting on the tool list, not on prose**, with the `Agent(<type>)` probe
  result recorded. This is real security reasoning, not cargo cult.

### Where the architecture diverges from the central skills' own pattern

The five central skills converged on a consistent shape: a ~100-line `SKILL.md` with Workflow /
**Route by Intent** / Operating Rules / Routing Boundaries, and 30–60 `references/*.md` loaded one at
a time by the route table. `effective-delivery` is 53 files and its `SKILL.md` loads none of them
until a route is chosen.

Effective Flow's tools are structurally the opposite: a small number of very large documents
(`merge-gate` alone is 246 KB resolved) with conditionals inline. The `lazy-include` mechanism gives
you exactly the same capability the skills use — you have simply applied it to five tools out of 28.

**This is the single most valuable architectural recommendation in this review:** adopt the central
skills' own route-table shape for the large tools. `merge-gate` becomes a phase table plus seven
lazily loaded phase fragments; `iterate` becomes a mode table plus mode fragments. It is not a new
mechanism, it is the mechanism you already built, applied consistently.

### Missing: an eval/regression layer for behaviour

Every central skill ships `evals/evals.json`. Effective Flow has a strong `node:test` suite, but it
tests **transforms** (does the build emit the right files, are the tables reconciled) — not
**behaviour** (does a `merge-gate` run on a PR with an unanswered human comment actually refuse to
merge). The guards prove the document is well-formed; nothing proves the document produces the
intended run. Given the size of `merge-gate` and `iterate`, this is the largest untested surface in
the repo.

---

## 6. Skills repository: boundary, duplication, and what should move

### 6.1 Duplication to remove (Effective Flow → delegate)

| #   | Effective Flow source                          | Duplicates                                        | Action                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | `src/agents/rust-implementer.md` (131 lines)   | `effective-engineering` `rust-*` references       | Add `## Recommended skills: effective-engineering`. Cut to a ~40-line adapter: assigned scope, source language, file-splitting/handoff conventions, minimal fallback. Add the relationship as `delegate` in `skill-ownership.json`.                     |
| D-2 | `src/agents/nodejs-implementer.md` (120 lines) | `effective-engineering` `typescript-*` references | Same treatment.                                                                                                                                                                                                                                         |
| D-3 | `src/agents/marketing-writer.md` (111 lines)   | `effective-marketing`                             | Recommend `effective-marketing` as the primary owner; keep `copywriting`/`copy-editing`/`marketing-psychology` as the allowlisted fallback chain. Add `effective-marketing` to `skill-ownership.json` with `marketing-writer` as a `delegate` consumer. |
| D-4 | `src/tools/merge-gate.md:35–123`               | —                                                 | Not a skill duplication, but 89 lines of rationale that belongs in `skill-ownership.md`. Replace with a three-line directive.                                                                                                                           |

The pattern behind D-1/D-2 is worth naming: **reviewers were migrated to the layered contract,
implementers were not.** Check `generic-implementer` and `generic-product-implementer` on the same
axis while you are there — `generic-product-implementer` recommends only `context7-mcp`, and
`generic-implementer` recommends nothing at all, though `effective-delivery` owns repository-native
command discovery which is precisely what its disclosed reduced-depth mode relies on.

### 6.2 Candidates to move _into_ the skills repository

These are Effective Flow fragments that encode reusable domain expertise rather than orchestration —
the stated boundary in `skill-ownership.md`. Each is a genuine "someone outside Effective Flow would
want this" case.

| #   | Fragment                                                                           |                             Lines | Proposed home                                                              | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------- | --------------------------------: | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-1 | `src/shared/worktree-lifecycle.md` + `execution-location.md`                       |                         238 + 168 | `effective-delivery` (`references/worktree-safety.md` already exists)      | Worktree ownership receipts, `EXECUTION_ROOT` vs `RUNTIME_STATE_ROOT` separation and the fail-closed preflight are general Git-agent safety, not Effective Flow policy. `effective-delivery` already declares one shared worktree-safety contract for every route that touches a worktree — this is the deeper version of that same contract, and any agent driving worktrees needs it.                                                                                                                                               |
| M-2 | `src/shared/security-disclosure-gate.md`                                           |                               102 | `effective-delivery`                                                       | "Never publish a security finding to a public tracker without explicit per-run confirmation" is a rule every review tool should follow. Effective Flow keeps the finding IDs, the local report and the gate's placement in Phase 4; the skill owns the classification heuristic and the disclosure principle.                                                                                                                                                                                                                         |
| M-3 | `src/shared/commit-message-rules.md` + the Conventional-Commit type-by-effect rule | 15 + related prose in `commit.md` | `effective-delivery`                                                       | Conventional Commits, release signalling and "type by effect, not by file touched" are ecosystem conventions. Small, but it is exactly the kind of thing that should be stated once for every skill that commits.                                                                                                                                                                                                                                                                                                                     |
| M-4 | `src/shared/investigation-method.md`                                               |                                21 | `effective-delivery` (`references/investigation.md` exists)                | Already tiny and already overlaps a reference the skill ships. Likely a straight delete-and-delegate.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| M-5 | `src/shared/adr-convention.md` + `project-adr-convention.md`                       |                         110 + 220 | `effective-product` (`references/adr-format.md` exists)                    | **The strongest candidate.** `project-adr-convention.md` is 220 lines of three-tier naming-convention resolution (declared rule beats observed convention beats default, with an `ask` fence on disagreement and untrusted-source handling). That is general ADR craft — the exact thing `effective-product` declares ownership of, and it says it "follows the repository's declared convention" without specifying how to determine it. Effective Flow keeps only "where the project-setup ADR lives and how its table is encoded". |
| M-6 | `src/shared/doc-categories.md`                                                     |                               126 | `effective-delivery` (`references/route-docs.md`, `guides-and-readmes.md`) | The standard documentation-category taxonomy is reusable. `skill-ownership.md` already concedes the skill wins when it detects an established structure — so the default taxonomy might as well live with the owner.                                                                                                                                                                                                                                                                                                                  |

M-5 and M-1 are the two that matter most: together they are ~740 lines of genuinely reusable
expertise currently locked inside Effective Flow.

### 6.3 Explicitly keep in Effective Flow

Confirming the boundary is drawn correctly, these should **not** move: the router and dispatch;
`TOOL_GROUPS`/`EXPOSED_TOOLS`/aliases; `next-steps` edges; `plan-contract`, `plan-archival`,
`plan-numbering`, `concept-contract`; `R-XXXXXXX` finding IDs, `Signature` dedup, epic/container
mechanics; `tracker-target` and `issue-tracker` (the schemas are Effective Flow's own);
`remote-tracker-core.mjs`; the config locator and table encoding; the harness transform; agent model
profiles; `review-state`, `memory-state`, `wisdom-accumulation`. All of this is orchestration and is
correctly owned here.

### 6.4 One process fix behind all of §6

**Make the ownership check enforceable.** Today it is prose in `AGENTS.md` and a manual
`pnpm audit:skill-ownership`. Minimum viable enforcement:

1. Every `src/agents/*.md` must carry a `## Recommended skills` section **or** be listed in an
   explicit exemption set with a one-line reason — exactly the shape the `next-steps` contract
   already uses, and exactly the guard that would have caught F-05.
2. Every skill named in any `## Recommended skills` section must have a declared relationship in
   `skill-ownership.json` (this may already hold — verify), **and** the reverse: every central skill
   that is recommended anywhere must appear in the manifest. That would have caught F-06.

---

## 7. Priority order

### P0 — correctness, small, do first

- **F-01** `deliver` missing from the router description, plus a guard so it cannot recur.
- **F-02** `Firmo` in two shipped agent descriptions.
- **F-10** local-line delivery preflight fallback when `origin` does not exist.

### P1 — efficiency, high leverage, mechanical

- **F-12** extend `CONTEXT_BUDGET_LINES` to all 28 tools; ratchet the unconverted ones.
- **F-03** make `worktree-integration` lazy in `refactor`, `maintain`, `iterate` (−1 431 lines).
- **F-04** make `issue-tracker` lazy behind the resolved tracker mode (−2 095 lines).
- **F-13** split `language-rules` and `config-migration` into eager core + lazy contract
  (−~3 000 lines combined).
- **F-14** move or compress `session-title` out of the always-on router.

Combined, P1 removes roughly 4 000–5 000 lines of always-loaded context with no behaviour change.

### P2 — ownership, medium effort, high conceptual value

- **F-05 / D-1 / D-2** convert `rust-implementer` and `nodejs-implementer` to thin adapters.
- **F-06 / D-3** declare `effective-marketing` and route `marketing-writer` to it.
- **§6.4** add the two ownership guards so this class of drift becomes a build failure.
- Audit `generic-implementer` and `generic-product-implementer` on the same axis.

### P3 — structural, larger, highest long-term payoff

- **F-15 / §5** restructure `merge-gate` and `iterate` into the central skills' route-table shape:
  a phase/mode table plus lazily loaded fragments. Target ~1 200 always-loaded lines for `merge-gate`.
- **F-16** de-couple `goal-completion`, `session-title`/`session-rename` and the `merge-gate` bot
  handling from harness mechanics; state invariants, not procedures.
- **§5** add a behavioural eval layer (mirroring the central skills' `evals/evals.json`), starting
  with `merge-gate` refusal conditions and `iterate` classification.

### P4 — cleanup

- **F-07** finish or centralise the `worktree.*` → `delivery.*` migration.
- **F-08** rename the legacy `prReview.*` merge-gate block.
- **F-09 / F-11** document the three Groblinien as scenarios; add a leading profile question to `setup`.
- **M-1 … M-6** move the six reusable fragments to the skills repository.
