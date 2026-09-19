# Merge gate configured-reviewer route extraction

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Refactoring (`effective-flow refactor`)

## Requirement

Complete the remaining high-value part of review finding **F-15** from
`docs/review/2026-08-31-architecture-and-consistency-review.md`: move the configured automatic
reviewer path of `merge-gate` behind a real mode gate, without changing any gate, merge, reviewer,
or post-merge behavior.

Three earlier rounds already removed locally gated blocks. At the planning baseline,
`origin/develop` at `bbd728d` on 2026-09-14, `src/tools/merge-gate.md` has 1,916 source lines. The
exact built cores are 2,737 lines for Claude, 2,725 for Codex, and 2,728 for the portable target,
against `CONTEXT_BUDGET_LINES['merge-gate'] = 2741`. `iterate` remains at 787 source lines and a
1,656-line core against 1,661.

The review's original approximately 1,200-line target is withdrawn as a completion condition.
Phases 0–6 are sequential, not alternative routes; splitting each phase would mainly lower an
initial/build metric while a successful gate eventually loads almost all of them. The implemented
round-three plan instead identified the next genuine branch: roughly 600 lines are relevant only
when a project declares an automatic reviewer through `mergeGate.bots` or its still-supported legacy
predecessor. The default configuration declares no reviewer, so this is a real cross-project context
saving. This repository does configure `recensor`, and therefore its own reviewer-enabled runs will
load the extracted fragment and save no cumulative context; that limitation is explicit rather than
hidden behind the smaller core number.

One prerequisite remains open in the review status table: none of the five archived merge-gate eval
scenarios configures `mergeGate.bots`, so no recorded run executes Phase 3. The extraction must not
start until a sixth scenario reaches the reviewer path, delegates reviewer items, validates their
returned outcomes, and exercises the fail-closed set-aside ending. The scenario is part of this plan
so the prerequisite and the seam it protects ship together.

This is a residual plan, not a revision of
`docs/plan/2026-09-02-merge-gate-deferring-tool-local-sections.md`. That predecessor delivered WP3,
WP2, and WP1 in pull requests #400–#402; its optional WP4 was superseded and delivered in #419. Its
stale open status is reconciled as documentation in this round. Giving `iterate` its own mode routes
and behavioral classification eval is separate scope: F-15's finding and implementation-status row
are specifically about `merge-gate`, while the review records `iterate` coverage separately.

### Verified context

- `src/tools/merge-gate.md` currently includes `review-bot-state` eagerly and carries reviewer-only
  material across configuration, returned outcomes, wisdom state, Phase 3, Phase-4 conditions 5, 7,
  and 10, the set-aside confirmation, unmatched-reviewer reporting, and Phase 6.
- `evals/merge-gate/_scaffold/scaffold.mjs` deliberately generates the same ADR for every scenario
  and omits `mergeGate.bots`. No scenario-local `iterate` instrument or delegation trace exists.
- `test/workflow-contracts.test.mjs` predominantly checks raw Markdown sources. Repointing a regex
  after a move does not prove the new fragment is reachable.
- `test/merge-gate-eval.test.mjs` binds archived evidence to the built load closure, including
  `tools/merge-gate.md` and `tools/iterate.md`; changing a reachable file invalidates every round.
- The local checkout is at `538e224`, five commits behind `origin/develop`, with three unrelated
  untracked plan files. No in-scope tracked file has a local uncommitted edit. Implementation starts
  from the configured base `origin/develop`, not from the stale local HEAD.

### Assumptions

- A fresh-agent eval can load a scenario-local replacement for `tools/iterate.md` from the copied
  skill root. WP0 verifies this before the result is used as evidence; failure is a stop.
- The candidate still contributes approximately 600 core lines after rebasing. The implementation
  measures the real contribution and stops if the saving is below 450 lines instead of widening the
  scope to hit a target.
- A project with an absent reviewer row is the population that benefits. A valid non-empty row, an
  empty present row, and an invalid present row all load the fragment because their rules must remain
  reachable.

## Architecture decisions

- **Gate on configuration-row presence, never on parsed non-emptiness.** The new pointer fires when
  the configuration contains `mergeGate.bots`, or `prReview.bots` while that legacy read remains
  supported. An unreadable present row resolves safely to an empty reviewer list but still loads the
  reporting and fallback rules. Triggering only on a successfully parsed non-empty value would make
  the fragment unreachable in exactly the fail-closed case.
- **Keep the absence path sufficient and the sequence visible.** The current key/default table and
  row-presence resolution stay in the eager core. The Phase-3 heading and entry/empty-list skip
  shell, the numbered shells for Phase-4 conditions 5, 7, and 10, and short reference shells at each
  later reviewer-only summary, wisdom, and reporting point remain in `src/tools/merge-gate.md` and
  point to the exact owning heading in the fragment. Phase-0 capability and the human comment guard,
  whole-run `ABORT` rules, CI-repair/no-manifest receiver rules, the unconfigured reviewer advisory,
  and non-reviewer summary items also stay inline. The fragment is therefore re-entered where its
  work occurs instead of being loaded once ahead of the workflow and treated as a detached appendix.
- **Move one cohesive reviewer route.** The new single-consumer fragment contains the reviewer-only
  configuration rationale, reviewer portion of the returned-outcome and wisdom records, Phase 3
  steps 1–6, the bodies of conditions 5, 7, and 10, the set-aside confirmation, reports of unmatched
  configured logins, and reviewer-only Phase-6 items. Condition 6 stays inline; moving it would widen
  this plan beyond the configured-reviewer route.
- **Preserve closed vocabularies and durable identities verbatim.** The extraction does not rename a
  phase, outcome, condition, identifier, configuration key, ask option, or summary value. Existing
  nested lazy pointers keep their triggers.
- **Use an `iterate` echo only as eval instrumentation.** A configured-reviewer scenario replaces
  `tools/iterate.md` inside its copied sandbox skill with a deterministic contract that records the
  received handoff and returns one controlled outcome per supplied identifier. For that scenario,
  build identity hashes the echo instrument instead of production `iterate`, together with the full
  production `merge-gate` load closure; the existing scenarios retain their production-`iterate`
  identity. The echo neither stands in for production `iterate` behavior nor closes the separate gap
  in `iterate` classification coverage.
- **Ship in one pull request.** Scenario configuration, the echo instrument, the gate source, and
  reachable fragments participate in eval identity. One final re-record avoids multiple multi-hour
  evidence rounds.

## Affected files

| File                                                                  | Description                                                                                                                                                           |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evals/merge-gate/_scaffold/scaffold.mjs`                             | Permit an explicitly declared scenario to supply project-setup rows and an `iterate` instrument while preserving current defaults for every existing scenario.        |
| `evals/merge-gate/_scaffold/iterate-echo.md`                          | New deterministic test instrument that records the reviewer handoff and returns the caller-owned outcome schema.                                                      |
| `evals/merge-gate/_scaffold/iterate-trace.mjs`                        | New bounded JSONL writer/reader for the echo handoff, separate from the forge-helper call log.                                                                        |
| `evals/merge-gate/_scaffold/build-identity.mjs`                       | Bind configured-reviewer runs to their scenario-local instrument and the production files they actually load.                                                         |
| `evals/merge-gate/fixtures/configured-reviewer-set-aside-blocks.json` | New provider-faithful envelopes for one configured reviewer, one unresolved thread, one changes-requested review finding, and the post-delegation fresh reads.        |
| `evals/merge-gate/scenarios/configured-reviewer-set-aside-blocks.md`  | New fresh-agent prompt and expected handoff, outcome, and non-merge result.                                                                                           |
| `evals/merge-gate/results/**`                                         | Five valid final runs for all six scenarios; stale identities are replaced rather than mixed into the round.                                                          |
| `evals/merge-gate/README.md`                                          | Document scenario-local configuration, the echo boundary, validity/discard rules, and expanded round cost.                                                            |
| `test/eval-fixture-fidelity.test.mjs`                                 | Prove new envelopes through the real helper normalizer and pin the configuration and echo-trace schemas.                                                              |
| `test/merge-gate-eval.test.mjs`                                       | Register the sixth scenario and assert attributed Phase-3 delegation, Phase-4 re-read, set-aside block, and no merge.                                                 |
| `src/tools/merge-gate.md`                                             | Retain the absence/fail-closed shells and add the presence-gated reviewer-route pointer.                                                                              |
| `src/shared/merge-gate-configured-reviewer.md`                        | New single-consumer fragment holding the configured-reviewer-only contract and workflow bodies.                                                                       |
| `test/workflow-contracts.test.mjs`                                    | Repoint moved raw-source subjects, pin retained shells, and prove the pointer trigger contains both current and legacy presence tokens.                               |
| `build.mjs`                                                           | Lower `CONTEXT_BUDGET_LINES['merge-gate']` to the measured core plus at most ten lines.                                                                               |
| `docs/developer-guide/build-system.md`                                | Record the new single-consumer fragment, its presence trigger, and the measured budget.                                                                               |
| `docs/plan/2026-09-02-merge-gate-deferring-tool-local-sections.md`    | Record #419 as delivery of the superseding WP4, explicitly retire its retrospective unticked criterion, set `Implemented`, and move it to `docs/plan/archive/`.       |
| `docs/plan/2026-09-02-merge-gate-behavioural-evals.md`                | Append dated partial progress for the configured-reviewer scenario without claiming its remaining scenario groups complete.                                           |
| `docs/review/2026-08-31-architecture-and-consistency-review.md`       | Add #419 and the achieved baseline; close F-15 and its configured-reviewer prerequisite only after final evidence passes, while retaining the separate `iterate` gap. |

## Implementation details

### Approach

1. **Drift gate and predecessor reconciliation.** Start from `origin/develop`. Compare every
   affected path with `bbd728d`, run `node build.mjs`, and record all target-specific cores. Verify
   #419 delivered the old plan's WP4 before marking that predecessor implemented; do not archive the
   broader behavioral-eval plan.
2. **WP0 — configured-reviewer eval capability.** Add explicit per-scenario setup rows and the
   sandboxed `iterate` echo. Configure `recensor` with its completed check at the verified head;
   present one bot-typed unresolved thread and one changes-requested review with one body finding.
   The echo receives the two minted identifiers and returns `deferred` for both. The prompt retains
   the scaffold's explicit non-interactive instruction, so the documented non-interactive set-aside
   branch is selected without inventing a harness limitation. Assert the delimiter, item manifest,
   identifier-to-thread/review attribution, `Summary comment: suppressed`, the suppressed next-steps
   declaration, and review-guard declaration. A missing, duplicate, or mismatched identifier fails.
   Hash the echo instrument in this scenario's build identity instead of production `iterate`; keep
   the production merge-gate closure and leave every existing scenario's identity unchanged.
3. **WP1 — pre-extraction evidence.** Run the new scenario five times against the unchanged gate.
   Every valid run reaches Phase 3, invokes the scenario-local echo once, validates both returns,
   re-reads the Phase-4 surfaces, cannot pose the set-aside question in the non-interactive run, and
   makes no `pr-merge` call. A run without an echo trace, runtime root, required fresh read, or
   provider-faithful operation is invalid and redone. More than five discarded runs stops the round.
   Commit these baseline records in a dedicated intermediate commit before extracting the route;
   final records may replace them in the working tree, while Git history preserves the reviewable
   before-state and its exact build identity.
4. **WP2 — dependency trace and extraction.** Trace every current writer and reader of the configured
   reviewer state. Move only the reviewer-owned bodies listed under Architecture decisions into
   `src/shared/merge-gate-configured-reviewer.md`. Retain the Phase-3 heading and entry/empty skip
   shell, numbered condition shells 5, 7, and 10, and an exact-heading pointer at every later point
   that consumes reviewer-only summary, wisdom, or reporting rules. Also leave inline every shell
   required for absence behavior, a run-wide failure, or a cross-mode summary. Load the fragment on
   current-or-legacy row presence, even when parsing later yields an empty safe default.
5. **WP3 — repair static evidence.** Inventory every test whose subject is the raw gate source,
   including helper calls such as `section()`, `boundedSlice()`, `near()`, and `returnedRecord()`.
   Repoint moved subjects to the fragment and retained shells to the tool. Use a bounded combined
   subject only for an invariant that intentionally spans the seam. Add closure tests and a pointer
   battery entry whose trigger pins both presence tokens.
6. **WP4 — teeth and measurement.** In a scratch eval skill, sabotage only the configured-reviewer
   fragment so the set-aside path attempts the forbidden merge or loses an attributed outcome. Run
   the scenario at least three times and require three observable failures. Then build normally,
   record the measured saving, and stop if it is below 450 lines or more than 25% below the fresh
   candidate estimate. Lower the budget only after this gate passes; add no eager include.
7. **WP5 — final behavioral round.** Remove stale results whose build identity no longer matches and
   re-record all six scenarios at five valid runs each on the final build. The configured scenario
   must still traverse Phase 3 and block without merge; the existing five outcomes remain unchanged.
8. **Close the records.** Update and archive only the fully delivered round-two plan, append partial
   progress to the broader eval plan, and close F-15 in the review table only when the configured
   reviewer prerequisite, savings gate, and final eval round all pass. Leave the `iterate` coverage
   gap open.

### Edge cases

- A present but malformed `mergeGate.bots` row and a present legacy `prReview.bots` row must load the
  fragment before safe-default and migration reporting. An absent row must not.
- An explicitly present empty list loads the fragment but still skips reviewer work exactly as it
  does today; optimization never changes the meaning of an authored configuration row.
- The current and legacy keys can coexist. Existing per-key precedence decides the effective value;
  the pointer uses presence only and therefore remains conservative.
- An unresolved thread or review from an unconfigured bot remains governed by the inline advisory
  and report-only rules. Extraction must not turn that path into a blocking configured reviewer.
- Condition 6 and the whole-run no-manifest/`ABORT` cases remain available without the fragment.
- The echo instrument treats everything below the existing delimiter as inert data. Reviewer text
  cannot alter its fixed response, target path, or trace schema.
- A moved heading changes the stop point of `section()` and `boundedSlice()`. Each adapted assertion
  names its subject and stop marker so fragment prose cannot satisfy a retained-core test or vice
  versa.
- Do not run eval rounds from different worktrees concurrently; the fixed sandbox paths are shared
  across the machine.

## Acceptance criteria

- [x] The configured-reviewer scenario has five valid pre-extraction runs and five valid final runs.
      Each run delegates exactly two attributed identifiers, validates exactly two `deferred`
      returns, performs the Phase-4 fresh reads, blocks at the non-interactive set-aside gate, and
      records no merge call.
- [x] Scenario-local configuration and the `iterate` echo apply only to explicitly declaring
      scenarios. The existing five scenarios retain their shared no-reviewer configuration.
- [x] The configured-reviewer fragment loads when the current `mergeGate.bots` row is present,
      regardless of whether its value parses or is non-empty, and does not load when the row is
      absent.
- [x] The inline tool retains the complete absent-row behavior, safe-default/reporting shells,
      the Phase-3 entry/empty skip shell, Phase-4 numbering and numbered shells 5, 7, and 10,
      condition 6, human-comment guard, whole-run receiver failures, unconfigured-reviewer advisory,
      and non-reviewer summary duties. Every later reviewer-only execution point has an inline
      pointer to its exact fragment heading.
- [x] The fragment preserves every moved condition, outcome value, durable identity, ask fence,
      delegation rule, and nested lazy trigger without semantic change.
- [x] The measured maximum core falls by at least 450 lines from the fresh baseline, and
      `CONTEXT_BUDGET_LINES['merge-gate']` equals the achieved maximum plus at most ten lines. A miss
      stops the round rather than pulling `iterate` or shared-fragment redesign into scope.
- [x] Every affected raw-source assertion reads the owning source or a deliberately bounded combined
      subject. Removing the pointer fails a closure test, and the sabotaged-fragment probe fails at
      least three of three runs.
- [x] The five pre-extraction runs exist in a dedicated intermediate commit before final evidence
      replaces them. The configured scenario's identity hashes its echo instrument and the
      production merge-gate closure; the other five identities continue to hash production
      `iterate`.
- [x] All six eval scenarios finish at five valid final runs with current build identities and no
      skipped scenario. The five established scenario outcomes do not change.
- [x] The round-two plan is archived as implemented with #419 recorded; the broader eval plan records
      partial progress only; the review closes F-15 and its prerequisite without closing `iterate`.
- [x] The repository checks pass in the required final order: `pnpm agent:check`, `pnpm test`,
      `node build.mjs`, and `pnpm test:distribution`.

## Validation plan

| Purpose                              | Command                                           | Expected result                                                                               |
| ------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Formatting and source policy         | `pnpm agent:check`                                | Exit 0.                                                                                       |
| Focused workflow contracts           | `node --test test/workflow-contracts.test.mjs`    | Exit 0 after each source move.                                                                |
| Eval fixture and instrument fidelity | `node --test test/eval-fixture-fidelity.test.mjs` | Exit 0, including scenario configuration and echo-trace schemas.                              |
| Build, closure, and budget           | `node build.mjs`                                  | Exit 0; maximum merge-gate core saves at least 450 lines and stays within its lowered budget. |
| Behavioral evidence                  | `node --test test/merge-gate-eval.test.mjs`       | Exit 0; six scenarios, five valid final runs each, none skipped.                              |
| Full unit suite                      | `pnpm test`                                       | Exit 0 after the final eval re-record.                                                        |
| Distribution delivery                | `pnpm test:distribution`                          | Exit 0 for isolated Claude, Codex, and portable layouts.                                      |

Also compare the expanded configured-reviewer instruction stream before and after extraction and
account for every semantic difference. The expected differences are the core pointer, fragment
orientation, and test instrumentation; the production reviewer route must otherwise be equivalent.

## Assumptions and open points

- Assumption: about five minutes per fresh-agent run remains representative. The final six-scenario
  round is roughly two and a half hours, plus the prerequisite recording; elapsed time and discarded
  runs are reported.
- Assumption: the legacy `prReview.bots` read still exists at execution time. If it lands first as
  retired, remove only that trigger token and re-derive the seam; do not keep a dead compatibility
  branch for this plan.
- Out of scope: restructuring `iterate`, splitting `review-bot-state` or `pr-review-comments`,
  changing automatic-reviewer semantics, resolving the known reviewer-check deadlock, compressing
  run-wide contracts, or adding Codex-native automatic eval execution.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         2 |    1 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         1 |    0 |

### Findings

- **Architecture, Important — sequential phases are not independent modes.** Incorporated: the
  plan rejects the literal seven-fragment/~1,200 target and extracts only the configuration branch
  that a default no-reviewer run never needs.
- **Security, Important — a parsed-non-empty trigger is circular.** Incorporated: presence of the
  current or still-supported legacy row opens the fragment before parsing, preserving malformed-row
  safe defaults and reporting.
- **Error cases, Important — a dynamic scenario setup could diverge from production.** Incorporated:
  scenario-local rows and the echo trace have pinned schemas and explicit opt-in; production parsing
  is unchanged.
- **Testability, Important — Phase 3 has no executed scenario.** Incorporated as a hard prerequisite
  with five baseline runs before extraction and five final runs afterwards.
- **Testability, Important — an echo can prove the handoff while hiding production `iterate`.**
  Incorporated as an explicit instrumentation boundary; the plan closes only merge-gate
  reachability and leaves `iterate` classification coverage open.
- **Testability, Note — raw-source tests can pass after a bad repoint.** Incorporated as a subject
  inventory, bounded cross-seam rule, closure removal check, and three-run teeth probe.
- **Scope, Important — stale predecessor plans obscure what remains.** Incorporated: archive only
  the fully delivered round-two plan, update the broader eval plan as partial, and keep unrelated
  review findings open.
- **Scope, Note — this repository configures a reviewer.** The default/absent-row route saves context;
  the repository's own reviewer-enabled runs load the extracted fragment and gain structure, not a
  smaller cumulative prompt.
- **Maintainability, Important — the old line target is unsupported.** Replaced by a measured
  minimum saving and an explicit stop instead of scope expansion.

### Deep review, 2026-09-14

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         2 |    0 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    0 |

- **Architecture, Important — one early pointer would lose workflow locality.** Incorporated:
  Phase 3, the three later numbered conditions, and every subsequent reviewer-only consumer retain
  ordered inline shells that point to exact fragment headings.
- **Testability, Important — replacing baseline results would erase reviewable before-evidence from
  the delivery diff.** Incorporated: the unchanged-gate runs are committed separately before the
  extraction and remain inspectable in Git history after the final records replace them.
- **Testability, Important — scenario identity must describe the code that actually executes.**
  Incorporated: the configured scenario hashes its echo rather than production `iterate`, while
  retaining the production merge-gate closure; existing scenarios keep the current identity model.
- **Scope, Important — closing F-15 must not imply that the unsupported line target or the separate
  `iterate` gap was achieved.** Incorporated: completion means all evidence-backed,
  merge-gate-local mode-gated work is delivered with a measured saving. The review keeps `iterate`
  open and records why approximately 1,200 lines is not a valid merge-gate completion gate.

No implementation-blocking decision remains after these corrections.

## Open points

- No open points.

## Implementation record

Implemented on 2026-09-15 on top of `origin/develop` at `473e518`.

- The configured-reviewer route now lives in the presence-gated
  `src/shared/merge-gate-configured-reviewer.md` fragment. By implementation time the legacy
  `prReview.bots` key had been retired upstream, so the route correctly keys only on the current
  `mergeGate.bots` row; present empty and malformed rows remain conservative and load the route.
- The measured always-loaded core fell from 2,746 to 2,127 lines for Claude, from 2,734 to 2,121
  for Codex, and from 2,737 to 2,124 for the portable target. The maximum saving is 619 lines and
  the 2,134-line budget leaves seven lines of headroom.
- The pre-extraction configured-reviewer evidence remains reviewable in commit `098bcf6`. The final
  corpus contains five valid current-build runs for each of six scenarios. Two candidate
  configured-reviewer runs were discarded and replaced: one could not obtain its mandatory
  delegation slot, and one invoked the eval echo twice after a protocol retry. This stayed below
  the plan's stop threshold.
- The final assertions pass 25/25. Three final-build sabotage runs each produced the intended
  observable attribution failure: only one of two real reviewer items retained a mapped outcome
  when review `700002` was deliberately substituted.
- The broader behavioral-eval plan remains partial because production `iterate` classification
  coverage and its other scenario groups are still open.
