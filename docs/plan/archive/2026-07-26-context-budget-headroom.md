# Context-budget headroom for the five budgeted tools

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Refactoring (`/effective-flow refactor`)

Planned at: `6591a11`, 2026-07-26. Working state: clean; `docs/plan/` holds this plan plus
`2026-07-16-0033-gemini-cli-platform-target.md`.

## Requirement

`build.mjs:1041` caps the always-loaded core of `build`, `fix`, `docs`, `review`, and `plan` at 700
lines. A clean build reports `build` 700, `plan` 700, `review` 697, `docs` 657, `fix` 619 — three
of the five are at or within three lines of the ceiling, so the next instruction change to any of
them fails the build. The goal is to reclaim as many lines as possible **without changing what the
tools instruct**, so future work has room.

Measured composition of the always-loaded core (analytic resolution of the eager include graph;
the absolute totals run 40–45 lines above the built figures because the harness transform compacts
fences and drops frontmatter, but the proportions hold):

| Tool     | Built | Own body | Largest eager contributors                                   |
| -------- | ----: | -------: | ------------------------------------------------------------ |
| `build`  |   700 |      431 | `plan-status` 72, `skill-discovery` 54, `project-routing` 53 |
| `plan`   |   700 |      359 | `doc-categories` 97, `language-rules` 77, `plan-status` 72   |
| `review` |   697 |  **591** | `skill-discovery` 54, `audit-reasoning-delegation` 39        |
| `docs`   |   657 |      280 | `doc-categories` 97, `plan-status` 72, `skill-discovery` 54  |
| `fix`    |   619 |      230 | `language-rules` 77, `plan-status` 72, `skill-discovery` 54  |

Weighted across the five tools, the eager fragments cost: `plan-status` 288 (72 × 4),
`skill-discovery` 270 (54 × 5), `doc-categories` 194 (97 × 2), `project-routing` 159 (53 × 3),
`language-rules` 154 (77 × 2), `apply-clarity-gate` 120, `goal-completion` 114.

Two structurally different problems follow from that table. `review` carries 82 % of its weight in
its own body, so only extraction and denser prose help there. The other four are dominated by eager
fragments, and several of those are **already lazy in a sibling tool**: `build`, `docs`, and
`review` load `language-rules` on demand while `fix` and `plan` inline it; `review` loads
`project-routing` on demand while `build`, `fix`, and `docs` inline it. Those are inconsistencies,
not deliberate differences.

Classification is `Refactoring`: instruction packaging and wording change, the instructions
themselves do not.

## Architecture decisions

- **Three levers, in decreasing safety.** (1) _Compression_: denser prose, removed duplication,
  compacted tables — no change to what is in context. (2) _Deferral_: eager → `lazy-include` for
  fragments that serve one identifiable decision point — the repository's own documented
  progressive-disclosure mechanism, with existing precedent. (3) _Extraction_: mode-gated blocks
  move out of a tool body (or an oversized shared fragment) into a new lazy fragment. All three
  preserve instruction content; only its packaging and delivery point change.
- **The deferral criterion, applied strictly.** A fragment may become lazy only when it serves
  exactly one nameable decision point **and** the load pointer states that trigger. This is a
  filter, not a wish: `goal-completion` fails it and stays eager (see below), even though it is a
  tempting 114 weighted lines.
- **`plan-status` splits rather than defers.** Its four canonical status markers are needed early,
  wherever a plan is recognized — that part stays eager. The 30-row bilingual field/section table
  plus its writer-consistency rules serve exactly one point: writing or translating a plan
  artifact. They move to a new lazy `plan-contract` fragment. This is the single largest win
  (~47 lines × 4 budgeted tools) and it also lightens `refactor`, `plan-review`, `apply-plan`, and
  `open-plans`, which are not budgeted but share the fragment.
- **`review` yields less than its size suggests, and the plan says so.** Its report-format block
  (~70 lines including the template) is cleanly Phase-4-only and becomes a lazy
  `review-report-format` fragment. Its configuration-and-memory block is **not** single-trigger:
  `### Usage` step 1 demands the dual-root receipt before the first memory, cache, or report
  access, steps 5–6 read configuration and cache at the start of the run, and steps 7–8 govern
  finding-ID reservation before publication. Deferring it would violate the same criterion that
  rejects `goal-completion`. Only the reference material moves — the `memory.json` example, the
  configuration schema, and the cache structure (~55 lines) — into a lazy `review-state` fragment;
  the procedural steps stay. Since that reference is read in nearly every run, count it as a modest
  win, not a structural one.
- **Safety gates stay in context.** `apply-clarity-gate` (40 lines × 3 tools) is what stops a tool
  from implementing a basis with open points or unmeasurable acceptance criteria. Its trigger is
  well anchored — the tool bodies name the gate independently — but the failure mode of a gate that
  silently does not run is exactly the one nobody notices, and no test covers it. 120 weighted
  lines do not buy that risk.
- **The 700-line guard stays at 700.** Reclaimed lines are headroom to spend, so ratcheting the
  limit down to lock the gain would defeat the stated purpose. A guard that also reported remaining
  headroom would be a genuine improvement, but it changes `build.mjs` behavior and is out of scope
  here.
- **Two commit classes with different proofs, one pull request.** Mechanical changes (deferral,
  extraction, the `plan-status` split) must leave the **fully expanded** instruction text
  byte-identical apart from load-pointer lines; that is verifiable and must be verified.
  Compression changes cannot be proven by diff and are carried by the 346-test suite plus review.
  The classes never share a commit — that separation is what makes the mechanical half provable and
  a regression bisectable — but they ship together, so the budget result is reviewable as one
  outcome.

### Deferral candidates and verdicts

| Fragment               | Tools                | Trigger                                  | Verdict                                       |
| ---------------------- | -------------------- | ---------------------------------------- | --------------------------------------------- |
| `language-rules`       | `fix`, `plan`        | an output language must be resolved      | **defer** — precedent in three tools          |
| `project-routing`      | `build`,`fix`,`docs` | a file or domain is routed to a worker   | **defer** — precedent in `review`             |
| `doc-categories`       | `plan`               | the classification is `Documentation`    | **defer** — single branch                     |
| `commit-message-rules` | `build`,`fix`,`docs` | a commit message is written              | **defer** — single point                      |
| `plan-status` (table)  | four tools           | a plan artifact is written or translated | **split**, defer the contract half            |
| `apply-clarity-gate`   | `build`,`fix`,`docs` | —                                        | **keep eager** — safety gate, see above       |
| `goal-completion`      | `build`,`fix`,`docs` | —                                        | **keep eager** — governs phases 2–7           |
| `skill-discovery`      | all five             | —                                        | **keep eager**, compress instead              |
| `task-tracking`        | all five             | —                                        | **keep eager** — whole-run discipline         |
| `completion-protocol`  | four tools           | —                                        | **keep eager** — every delegation             |
| `pre-commit-gate`      | `build`,`fix`,`docs` | a commit is imminent                     | **keep eager** — 5 lines, not worth a pointer |
| `doc-categories`       | `docs`               | —                                        | **keep eager** — the tool's subject           |

Three deliberate rejections carry the plan's credibility. `goal-completion` prescribes the visible
task list, the bounded correction rounds, and the goal query across every remaining phase, so it has
no single trigger. `apply-clarity-gate` has one, but it is a safety gate. And review's
configuration-and-memory block was rejected during the deep review after its `### Usage` steps
turned out to span the whole run — the criterion has to bite the plan's own favourite candidate to
mean anything.

## Affected files

| File                                                                        | Description                                                                                                                                                                                     |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/plan-status.md`                                                 | Split: keep the four canonical markers and the status-validity rules; move the bilingual field/section table and writer rules out.                                                              |
| `src/shared/plan-contract.md`                                               | New lazy fragment holding the bilingual plan contract table and its writer-consistency rules.                                                                                                   |
| `src/shared/review-state.md`                                                | New lazy fragment: review's reference material only — the `memory.json` example, the configuration schema with defaults, the cache structure. The `### Usage` steps stay in the tool.           |
| `src/shared/review-report-format.md`                                        | New lazy fragment: review's report format and report template.                                                                                                                                  |
| `src/tools/review.md`                                                       | Replace the two extracted blocks with lazy pointers; compress `Phase 2` (81 lines), `Goal` (28), and `Task structure` (28). Carries the largest compression share of the five.                  |
| `src/tools/build.md`                                                        | Defer `project-routing` and `commit-message-rules`; take the `plan-status` split; compress `Phase 6` (52), `Phase 0` (36), `Phase 1` (38). Tightest tool against its target.                    |
| `src/tools/fix.md`                                                          | Defer `language-rules`, `project-routing`, `commit-message-rules`; take the split; compress `Phase 2` (38).                                                                                     |
| `src/tools/docs.md`                                                         | Defer `project-routing` and `commit-message-rules`; take the split; compress `Goal` (40) and scaffold mode (39).                                                                                |
| `src/tools/plan.md`                                                         | Defer `doc-categories`, `language-rules`; take the split; compress `Goal` (42) and `Phase 6` (33).                                                                                              |
| `src/shared/skill-discovery.md`                                             | Compress the seven-point approach without dropping a rule — it is inlined into all five budgeted tools, so each line saved counts five times.                                                   |
| `src/tools/refactor.md`, `plan-review.md`, `apply-plan.md`, `open-plans.md` | Take the `plan-status` split: add the `plan-contract` lazy pointer where they write or translate plan artifacts. Not budgeted, but they must stay correct.                                      |
| `test/runtime-state-safety-contract.test.mjs`                               | Lines 101–102 assert `collision checks` and `retained absolute memory handle` **in `review.md`**; after extraction those live in `review-state.md`. Repoint the assertions, do not delete them. |
| `test/build-lib.test.mjs`                                                   | Line 2268 asserts the four markers in `plan-status.md`; they stay there by design. Verify, and add the contract-table assertions against `plan-contract.md`.                                    |
| `docs/developer-guide/build-system.md`                                      | Refresh the "Progressive disclosure beyond the router" and context-budget sections with the new structure.                                                                                      |
| `docs/developer-guide/architecture.md`                                      | Only if PR #258 has merged: its new paragraph claims `build` and `plan` "sit at exactly the 700-line limit". True today, false after this change.                                               |

Deliberately unchanged: `build.mjs` (no guard, budget, or transform change), every agent source,
`dist/` (generated), and the archived plan `docs/plan/archive/2026-07-26-session-title-suggestions.md`
whose recorded measurements are a historical record.

## Implementation details

### Approach

Work in this order; each step is independently verifiable and the mechanical steps come first so
the expansion proof stays meaningful.

1. **Build the verification harness first.** A temporary script in the scratchpad that, for every
   budgeted tool, resolves the include graph **fully** — eager and lazy alike, transitively — and
   emits a normalized text (load-pointer lines stripped, trailing whitespace collapsed). Capture the
   baseline for all five tools at the starting commit. Without this, no mechanical claim is provable.
2. **Split `plan-status`.** Create `plan-contract`, move the table and writer rules, add lazy
   pointers in all eight consumers at the point where each writes or translates a plan artifact.
   Verify: expansion diff empty.
3. **Extract review's two blocks** into `review-state` (reference material only) and
   `review-report-format`, with pointers at Phase 1 and Phase 4. Repoint the two runtime-state
   assertions. Verify: expansion diff empty except the moved-guard ordering, and
   `findRuntimeStateSafetyViolations` still returns empty.
4. **Defer the four fragment/tool pairs** from the verdict table, one commit per fragment so a
   regression is bisectable. Verify after each: expansion diff empty.
5. **Compress prose**, tool by tool, largest section first. This is the only step that changes
   wording. Every removed sentence must be redundant with a neighbouring one, not merely verbose.
   Verify: full suite, plus manual review of the expansion diff, which is now non-empty by design.
6. **Update the two developer-guide documents** and run the full CI sequence.

### Deferral mechanics

A `lazy-include` fence carries the fragment name and a `when:` trigger, and
`renderLazyPointer` (`build-lib.mjs:1479`) turns it into exactly one line,
`**Load on demand:** Read `shared/<name>.md`, when <trigger>.` So each deferral saves the
fragment's full inlined size and costs one line. The trigger wording is the whole safety margin:
it must name the concrete decision point, in the same style as the existing pointers.

### Guards that constrain the work

- **`assertNoEagerLazyOverlap`** — a fragment must never be both eager and lazy in one file.
- **`projectRoutingConsumers` (`build.mjs:464`)** — `build`, `fix`, `refactor`, `review`,
  `maintain`, `docs` must include `project-routing`; the guard accepts a lazy include, which is why
  deferral is legal here.
- **Runtime-state writer guard (`findRuntimeStateSafetyViolations`)** — fragments are traversed at
  their owning include position, so the safety contract must still be loaded _before_ the first
  mutation in source order. Extracting review's memory and cache blocks moves mutations into a new
  fragment; the pointer must sit after review's existing `runtime-state-safety` load.
- **Context-budget guard** — unchanged at 700; it is the acceptance instrument, not a target.

### Edge cases

- A deferral that removes the only occurrence of a phrase asserted by a test turns a green suite
  red. That is a signal to repoint the assertion at the fragment, never to delete it.
- `oxfmt` reflows Markdown and is not always idempotent on long wrapped inline-code spans; format
  and re-check before trusting a line count.
- The expansion harness must resolve lazy fragments too, or every deferral looks like deleted
  content.
- Compression must not touch the canonical bilingual markers, status values, table headings,
  finding IDs, config keys, or routing values — they are machine-stable tokens.
- `review.md` is the only budgeted tool whose own body dominates; if extraction there falls short,
  the per-tool ceiling below is at risk while the others pass easily.

## Acceptance criteria

- [ ] `node build.mjs` reports `build`, `fix`, `docs`, and `plan` at **≤ 560 lines** and `review` at
      **≤ 620 lines**, against the verified starting point of `build` 700, `plan` 700, `review` 697,
      `docs` 657, `fix` 619. The split bar is structural, not a concession: four tools are dominated
      by eager fragments that can move, `review` is 82 % own body that mostly cannot.
- [ ] For every mechanical commit (steps 2–4), the fully expanded instruction text of all five
      tools is **identical** to its baseline once load-pointer lines are stripped — recorded per
      commit.
- [ ] For the compression commits, the expansion diff contains no removed rule, condition,
      threshold, canonical token, or trigger — only rewording and removed duplication. The diff is
      reviewed line by line and the reviewer's verdict is recorded.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` all exit 0.
      Test count is ≥ 346 and no test is deleted; assertions may only be repointed at the fragment
      that now owns the text.
- [ ] `grep -c "Load on demand" dist/claude/effective-flow/tools/<tool>.md` equals the number of
      lazy fences in each tool's source, for all five.
- [ ] `build.mjs` is byte-identical to its state at the starting commit.
- [ ] Each new fragment is referenced by at least one tool and ships once per harness under
      `shared/`.

## Validation plan

| Purpose                   | Command                        | Expected result                          |
| ------------------------- | ------------------------------ | ---------------------------------------- |
| Expansion equivalence     | scratchpad harness, per commit | empty diff for steps 2–4                 |
| Format                    | `pnpm agent:check`             | exit 0                                   |
| Contract and unit tests   | `pnpm test`                    | exit 0, ≥ 346 tests                      |
| Build, budget, all guards | `node build.mjs`               | exit 0, every budgeted tool ≤ 560        |
| Distribution              | `pnpm test:distribution`       | exit 0                                   |
| Runtime-state coverage    | included in `pnpm test`        | `findRuntimeStateSafetyViolations` empty |

Beyond the automated checks, one behavioral spot check per deferred fragment: run the owning tool
far enough to reach the stated trigger and confirm the fragment is actually pulled in. Deferral's
real risk is not a broken build but an agent that never loads what it needs, and no unit test can
see that.

## Assumptions and open points

- Assumption: the estimated end state (`build` ~548, `fix` ~406, `docs` ~515, `plan` ~449,
  `review` ~537) holds within ±40 lines. `build` is the tightest against its bar, because it keeps
  both `apply-clarity-gate` and `goal-completion` eager; its 431-line own body has enough prose
  (`Phase 6` 52, `Phase 1` 38, `Phase 0` 36) to close the gap, but it is the tool to watch.
- Assumption: compression yields 25–50 lines per tool. This is the least evidenced number in the
  plan — it is an estimate from section sizes, not a measured redundancy. If it underdelivers,
  `build` is the tool that misses its bar first.
- Assumption: deferring a fragment that a sibling tool already defers carries no new behavioral
  risk, since the pattern is in production for `language-rules` and `project-routing` today.
- Assumption: PR #258 is still open. If it merges first, `docs/developer-guide/architecture.md`
  gains a paragraph asserting the exact 700/700 measurement that this work invalidates; update it
  in step 6 rather than leaving a contradiction.
- Out of scope, deliberately: changing `CONTEXT_BUDGET_MAX_LINES`, adding headroom reporting to the
  build, extending the budget to non-budgeted tools, and any change to `refactor`, `maintain`, or
  the agents beyond the mechanical `plan-status` split they inherit.

### Drift check before implementing

Re-run `node build.mjs` on an unmodified checkout and compare the printed report with `build` 700,
`plan` 700, `review` 697, `docs` 657, `fix` 619. Never measure with `grep -c ""` on `dist/`: the
guard counts `split('\n').length`, one more than `grep` for newline-terminated files, and a
checked-in `dist/` may be stale. If the numbers moved, re-derive the per-tool targets before
starting.

### Stop conditions

- Stop if an expansion diff for a mechanical commit is non-empty and the difference is not purely a
  load-pointer line — that means content was lost, not moved.
- Stop if a deferral would require weakening or editing a build guard; the guard is the contract.
- Stop if compression cannot reach the per-tool ceiling without removing a rule, condition, or
  threshold. Report the shortfall and leave the tool above target rather than thinning behavior.
- Stop if `build.mjs` would need to change for any reason.

## Plan review

**Result:** Approved

Internal review plus deep interactive plan review, 2026-07-26. The deep review overturned one of
the plan's own claims and settled three decisions: `review`'s configuration-and-memory block is not
single-trigger and is no longer treated as a structural win; the per-tool bar is split (≤ 560 for
four tools, ≤ 620 for `review`) to match measured structure; `apply-clarity-gate` stays eager as a
safety gate; and both commit classes ship as one pull request with the classes kept in separate
commits.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Architecture, Important — deferral trades context cost for a compliance risk.** An inlined rule
  is always in context; a deferred one is read only if the agent notices its trigger. The plan
  contains this by applying the single-trigger criterion strictly, rejecting `goal-completion`,
  `skill-discovery`, `task-tracking`, and `completion-protocol` outright, and preferring fragments
  with production precedent. The behavioral spot check in the validation plan exists precisely
  because no unit test covers this failure mode.
- **Testability, Important — "no logic change" is only provable for the mechanical half.** The
  expansion-equivalence harness makes steps 2–4 objectively checkable, which is why they are kept in
  separate commits from compression. Compression is carried by the 346-test suite, the reviewed
  diff, and the rule that a removed sentence must be redundant with a neighbour.
- **Scope, Important — the change reaches beyond the five budgeted tools.** Splitting `plan-status`
  touches `refactor`, `plan-review`, `apply-plan`, and `open-plans`. Accepted: leaving them on a
  fragment that no longer contains the contract would be worse than the extra diff, and they gain
  the same reduction.
- **Architecture, Note — `pre-commit-gate` and `doc-categories`-in-`docs` are deliberately left
  alone.** Five lines and a tool's own subject matter respectively; deferring either costs more in
  risk and churn than it returns.
- **Testability, Note (deep review) — the estimate that carries the most weight is the least
  evidenced.** Per-tool compression yield is derived from section sizes, not from measured
  redundancy, and `build` clears its bar by roughly a dozen lines under that estimate. The stop
  conditions already forbid buying the shortfall with behavior, so the realistic failure mode is a
  reported miss on one tool, not a silent thinning.
- **Error cases, Note — the runtime-state guard is order-sensitive.** Review's extraction moves
  mutations into a new fragment, so the pointer must sit after the existing `runtime-state-safety`
  load. Named explicitly under "Guards that constrain the work" and covered by the existing
  violation test.
- **Scope, Note — the reclaimed headroom is unprotected.** Without a ratchet it will be consumed
  silently, but ratcheting contradicts the stated goal. Recorded as an out-of-scope follow-up
  (headroom reporting in the build) rather than folded in.
- **Maintainability, Note — more fragments means more indirection.** Three new fragments make the
  graph wider, which is the accepted price of progressive disclosure; each has a single owner and a
  single stated trigger.

## Open points

- No open points.

## Test results

| Check                   | Command                  | Baseline                    | Result                         |
| ----------------------- | ------------------------ | --------------------------- | ------------------------------ |
| Format                  | `pnpm agent:check`       | pass, 240 files             | pass, 244 files                |
| Unit and contract tests | `pnpm test`              | pass, 345 of 345            | pass, 345 of 345, none removed |
| Build and budget guard  | `node build.mjs`         | 700 / 619 / 657 / 697 / 700 | 540 / 427 / 543 / 598 / 478    |
| Distribution smoke      | `pnpm test:distribution` | pass                        | pass                           |

Always-loaded core, baseline to final: `build` 700 → 540, `fix` 619 → 427, `docs` 657 → 543,
`review` 697 → 598, `plan` 700 → 478. That is **787 lines** returned in total and 157 to 273 lines
of headroom per tool, against a guard left unchanged at 700.

Expansion equivalence, measured per commit on the fully resolved include graph of all five tools
with load-pointer lines stripped and content lines sorted: every mechanical commit is byte-
identical to its predecessor except for lines that are individually enumerated in that commit's
message. Across the whole change, the accumulated content diff is 12 to 16 lines per tool, all
accounted for: the removed duplicate authority sentence and its line re-wrapping, the
`plan-contract` heading moving from level three to level two, two cross-reference lines gained in
`plan-status`, and one reworded cross-reference to the relocated report format.

### Deviations from the plan

- **review yields less than even the revised estimate.** The deep review had already narrowed the
  configuration block to reference material; implementation narrowed it further. The configuration
  schema is read in nearly every run, so deferring it would move the measured number without saving
  anything real — the same argument the plan uses to justify eager inlining elsewhere. Only the
  `memory.json` example and the cache structure moved. `review` reached 598 through the report-format
  extraction instead.
- **A better target appeared than the planned compression.** `build` was still 28 lines over after
  the mechanical work. Rather than compress prose, the initial-state bootstrap and its 23-line plan
  template moved out: it fires only for a project with no plan files at all, which is textbook
  mode-gating. This is mechanical and provable, and it took `build` from 584 to 538.
- **Compression was deliberately cut back.** Reflowing `skill-discovery` from bullets to prose
  produced a 42-line diff in a contract fragment that five tools and every agent depend on, for four
  lines per tool — and the ceilings were already met without it. Only the genuine duplication
  survived: point 1 restated point 5's authority rule verbatim.
- **Four consumers keep a pointer they may never follow.** `fix`, `refactor`, `apply-plan` and
  `open-plans` were verified never to write plan-artifact prose, so dropping the contract entirely
  would have been correct. `fix` and `refactor` got the pointer anyway — it costs one line, keeps
  the split a provable relocation rather than a judgement call, and a tool that never needs the
  fragment simply never loads it. `apply-plan` and `open-plans` are contractually forbidden from
  modifying plans and got none.
- **Two planned changes proved unnecessary.** The runtime-state assertions stayed valid, because
  both pinned phrases live in review's `Usage` steps and Phase 4, which did not move. And
  `architecture.md` needed no update: PR #258, which introduces the paragraph asserting the exact
  700/700 measurement, is still open. **That paragraph will be stale on merge** and is the one
  follow-up this change leaves behind.
- **The plan's "≥ 346 tests" criterion was measured on the wrong branch.** On `develop` the baseline
  is 345. The criterion means "no test lost", and none was.

## Review findings

**Date:** 2026-07-26
**Reviewer:** orchestrator (inline; the `effective-flow-*` specialists were not spawned, see below)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     2 |
| Open / Not implemented |     0 |

Two findings arose during the run and both were fixed before completion: the first draft of the
`plan-status` split dropped the contract from `fix` outright, which the expansion diff exposed as
content removal rather than relocation; and the first compression pass churned a shared contract
fragment for a marginal gain. No critical findings, so no external review report was produced.

Implementation, review and validation ran inline in the orchestrator rather than through the
`effective-flow-*` specialist sub-agents, because the invoking session carried an explicit
instruction not to spawn agents unasked. Phase structure, gates, baseline comparison and the
expansion proof were unaffected.
