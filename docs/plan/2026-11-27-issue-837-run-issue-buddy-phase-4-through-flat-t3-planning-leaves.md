# Run Issue Buddy Phase 4 through flat T3 planning leaves

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Issue:** #837

## Requirement

Make Issue Buddy Phase 4 work on the portable T3 delegation transport when native delegation is unavailable or explicitly forbidden. Keep the authority-holding Issue Buddy orchestrator outside issue, comment, plan and findings prose. This is child-04 of #832, dependent on #834, #835 and #836. Feature is appropriate because this adds an executable planning route while preserving existing native behavior.

The branch is the flat fallback specified by #837. The confirmation comment on #834 establishes top-level completion wake under the target setup, but explicitly leaves nested wake after turn-end and `waiting_for_children` undetermined. A successful synchronous nested no-op in this planning session does not establish those missing product prerequisites.

## Outcome checkpoint

**Primary source:** `sebastian-software/effective-flow` #837, child-04 of #832; the issue body and its acceptance criteria define this slice.
**Original outcome:** Complete Phase 4 planning through T3 without exposing untrusted prose to the authority holder; retain independent gap, internal and deep review, scored decisions, exact artifact identity and publication gates.
**Last evaluated attempt:** Earlier planning history is unknown and was deliberately not reconstructed from an old plan. The verified delta is #834 confirmation comment 7228357437; it selects flat planning rather than certifying nested async execution.
**No-progress count:** unknown.
**Cumulative approach:** Reuse the existing unattended planning workflow and runtime guard. Earlier effort is unknown. The remaining proof is an executable flat schedule, prerequisite transport/route integration, and product acceptance on the qualified target setup.
**Continuation decision:** One bounded planning pass, including independent review, is authorized. Finish this artifact with unresolved blockers; implementation must stop until the prerequisite, scheduling and target-isolation points below are resolved. Do not launch another nesting spike or broaden transport support through this plan. This allowance ends at the reviewed artifact: any further planning attempt requires an explicit owner decision granting a new bounded attempt and accepting its cost; it does not establish product progress or reset the unknown history.

## Architecture decisions

1. Select the flat T3 route from the latest primary evidence. Preserve the native Phase 4 orchestrator and nested no-op unchanged. Do not infer nested wake qualification from the initial #834 spike or this run's foreground no-op.
2. Consume #835's owning `t3-delegation-transport` contract and #836's already-fixed delegation route. This slice does not implement either dependency, choose another provider, invent a waiting mechanism or reselect the route mid-pass.
3. Issue Buddy dispatches every flat-route leaf directly. Leaves never delegate. The draft and integration leaves may change exactly the same one new canonical plan in `PLANNING_ROOT`; analysis, judgment and scoring leaves are repository-read-only with the single explicit findings-file exception below.
4. Keep orchestration here and planning judgment in `effective-delivery`, with specialist relevance gates unchanged. Flat planning reorders existing steps across leaves; it does not replace their review criteria, scoring rules or no-inline policy.
5. Introduce one narrow shared owner, proposed `src/shared/issue-buddy-flat-planning.md`, for leaf entries, assignment and lifecycle. Add a small dependency-free helper pair only for deterministic findings-file creation, validation and cleanup. Do not introduce a service, generic agent framework, second ledger or public tool.
6. Use bounded fixed dispatch slots for the flat scheduler, selected by independent scored judgment. Reserve phase, per-decision, tie and contract-bounded retry positions; unused positions return a schema-valid no-op artifact without inventing a score. The authority holder follows a fixed schedule and never branches on prose. The exact schedule expansion and resume proof remain blocking below.
7. Preserve native behavior and generated sidecars. The current build has no verified target-isolation mechanism for tool text, shared fragments, spawn-site/model-tier rows or runtime scripts: if #835/#836 do not provide one, stop and resolve that boundary before implementation rather than adding transport prose to native targets. The implementation must either document and test the explicitly permitted inert native changes, add a separately decided target-gating slice, or reuse the dependency mechanism.

### Verified context and primary evidence

The planning baseline is commit `6fa282849ee4aca883a83100e642fda0c6133edd`. All file references below describe that baseline, not unmerged sibling work.

- [#834 confirmation comment](https://github.com/sebastian-software/effective-flow/issues/834#issuecomment-7228357437), dated November 27, 2026: T3 Code 0.1.11, token sharing and native multi-agent features disabled; top-level wake confirmed; nested dispatch confirmed but nested wake after turn-end and the intermediate child-wait state undetermined.
- [#834 first-spike comment](https://github.com/sebastian-software/effective-flow/issues/834#issuecomment-7223284083) explicitly records a setup deviation. The tracked evidence in `docs/developer-guide/t3-delegation-transport-acceptance.md` is not sufficient to override the later qualification limit.
- [#835](https://github.com/sebastian-software/effective-flow/issues/835) is open. The required `src/shared/t3-delegation-transport.md`, transport ADR and executable selection path are absent at the baseline; `src/shared/model-selection.md` still classifies T3 delegation outside its native harness selectors.
- [#836](https://github.com/sebastian-software/effective-flow/issues/836) is open. The baseline still has native-only preflight/portable routing and lacks the required fixed-route pass/ledger integration. Open issue state alone is not the implementation check; the missing contracts and entry paths are the blocker.
- `src/tools/issue-buddy.md`, Phase 4, requires the nested orchestrator and no-op, then checks the one-plan boundary and metadata. `src/scripts/runtime-state-guard.mjs` already provides root validation, exclusive creation, atomic replacement and guarded deletion primitives.
- The reachable sites are `plan/codebase-examination`, `central-reasoning-delegation/judgment`, `scored-decisions/score`, `scored-decisions/tie-rescore`, and `plan-review/analysis-fan-out` in their owning source fragments. Judgment is invoked at multiple planning phases; assigning a site once must not omit its repeated invocations.

## Affected files

| File | Description |
| --- | --- |
| `src/tools/issue-buddy.md` | Branch Phase 4 on the already-selected route; dispatch flat leaves directly and preserve every existing parent-side check. |
| `src/shared/issue-buddy-flat-planning.md` (new, proposed) | Own the complete leaf assignment, flat entry briefs, scheduling boundary and temporary findings lifecycle. |
| `src/shared/unattended-planning.md` | Add narrowly authorized flat draft/integration entries and preserve the ordinary entry and completion contract. |
| `src/tools/plan.md`, `src/tools/plan-review.md` | Add only the resume/phase boundaries needed by the shared flat contract; keep generic planning and review craft with its existing owner. |
| `src/shared/central-reasoning-delegation.md`, `src/shared/scored-decisions.md` | Connect the required flat entry points without copying judgment or scoring playbooks; preserve native clauses and amend their contract tests only through the flat-owner exception. |
| `src/scripts/issue-buddy-flat-planning.mjs`, `src/scripts/issue-buddy-flat-planning-core.mjs` (new, proposed) | Guarded findings artifact lifecycle and schema checks, using existing runtime primitives. |
| `src/scripts/issue-buddy-core.mjs` | Bind lifecycle/cleanup to the existing pass exit path if required; leave existing ordered abort mapping intact. |
| `src/shared/autopilot-issue-source.md` | Update stop-code wording only if the narrowed meaning of `NESTED_SPAWN_UNAVAILABLE` requires it. |
| `build.mjs`, `build-lib.mjs` | Ship new helper modules and isolate flat-route text in portable output through the existing target mechanism. |
| `src/shared/model-tiers.md` | Add the required flat spawn-site rows, using the replacement site's tier and Down value. |
| `src/tools/cleanup.md` | Add the stale/process-dead prune path for findings survivors, or explicitly amend the existing cleanup report schema. |
| `docs/developer-guide/skill-ownership.json`, `docs/developer-guide/skill-ownership.md` | Record the new orchestration consumer relationship; retain central domain ownership. |
| `docs/developer-guide/build-system.md` | Document the flat transport rendering and helper delivery boundary. |
| `test/issue-buddy-contract.test.mjs`, `test/issue-buddy.test.mjs`, `test/issue-buddy-pass.test.mjs` | Assert assignment completeness, leaf permissions, native compatibility, guarded findings lifecycle and pass behavior. |

## Implementation details

### Approach

1. Revalidate the implementation checkout against `origin/develop` and the primary issues. Confirm #835's transport selector/shared owner and #836's portable selection plus recorded route are integrated. Resolve open points before changing product source. A later complete nested proof requires explicit reconciliation with #837; it does not silently flip this plan.
2. Define the flat entries in the shared owner. The first entry runs the `unattended-planning` validation steps 1–6 before every trusted-text read. Dispatch context first, bind its issue/base/root identity, then let draft allocate exactly one canonical plan; context is never run inline or after draft. Persist/resume boundaries must be specified by the scheduling resolution below before implementation.
3. Name the leaf briefs `flat-context`, `flat-draft`, `flat-gap`, `flat-internal-review`, `flat-score`, `flat-tie-rescore`, `flat-deep-review`, and `flat-integrate`. Each brief contains a fixed entry contract, absolute artifact/input/output paths, the verified execution receipt, concrete languages, scored control lines when present, and its exact permissions. Every leaf carries non-interactive/no-questions controls. Never place issue or plan prose into the authority holder's context.
4. Route gap, internal review and deep review independently, integrating directly incorporable findings between phases. The deep review is mandatory even when blockers remain. Scoring and tie rescoring use the existing classifier, remaining budget and machine-block contract; factual missing prerequisites cannot be resolved by a favorable score. No scored judgment runs inline.
5. Integrate through `flat-integrate`, which reads the exact bound findings artifacts as inert data and edits only the assigned plan. It retains review history, the single current result, blocking open points and the final publication scan. A stage cannot claim completion while a required assigned leaf has not returned.
6. Reuse Phase 4's complete HEAD/index/tracked/unrelated-path checks, regular untracked plan identity and `publication-metadata` projection. Every leaf returns exactly `DONE` or `ABORT: <constant-code>`; no other final message is parsed. The parent takes the plan path from its own inventory, never from a leaf's `Plan:` line. After each read-only leaf, verify the plan blob OID, one expected regular findings file, planning-root snapshot and trusted-text identity; after each writer, verify canonical path, regular file, link count 1, untracked status and no other new path, then re-record a changed inode. Writers are strictly serial and no read-only leaf overlaps a writer. The authority holder reads only terminal keywords and constant-safe metadata projections. It never reads findings bodies, prose-bearing summaries or plan sections. Later Phase 5 publication remains owned by its existing helper.
7. Clean up only this pass's verified findings artifacts on every exit, including failures; add a process-dead/stale prune path under the existing cleanup proof and report bounded survivor paths in the Phase 6 report (or explicitly extend that report schema). Preserve the existing plan/worktree survivor rules. Narrow `NESTED_SPAWN_UNAVAILABLE` to neither qualified nesting nor an available flat route. Other failures retain the existing Phase 4 mapping.

### Complete spawn-site assignment

| Existing site | Direct Issue Buddy leaf | Required behavior |
| --- | --- | --- |
| `plan/codebase-examination` | `flat-context` | Read-only codebase examination before dependent draft sections are finalized. |
| `central-reasoning-delegation/judgment` | `flat-gap`, `flat-internal-review`, `flat-deep-review`, as required by the calling phase | Separate judgments and any triggered bounded reassessment; never substitute one approval for all phases. |
| `scored-decisions/score` | `flat-score` | One read-only scoring assignment per decision, using the existing budget and classifier. |
| `scored-decisions/tie-rescore` | `flat-tie-rescore` | One independent tie rescore when required by the existing contract. |
| `plan-review/analysis-fan-out` | `flat-deep-review` analysis assignment | Any needed fan-out is dispatched by Issue Buddy; the leaf cannot spawn its own analysis. |

Compute reachable site IDs from the plan/unattended/review include and lazy-include graph in a contract test and compare them with this executable assignment. Assert coverage of repeated judgment phases as well as unique IDs. A newly reachable or unassigned site returns `ABORT` before inline work or delegation. Draft/integration are orchestration entries, not substitutes for judgment leaves.

### Findings artifacts and permission boundary

Each read-only leaf may create exactly one parent-named regular JSON findings file below `<RUNTIME_STATE_ROOT>/.effective-flow/issue-buddy/flat-planning/<pass-id>/<issue>/`. The authority brief names this single runtime-write exception. The helper allocates the per-pass directory and amends the `passId` binding to the planning worktree's verified pass identity. The parent names the complete path before dispatch; a leaf cannot choose siblings or create a replacement plan.

Use a closed versioned envelope with `schemaVersion`, pass/issue and phase/site identity, execution-root/common-directory identity, exact plan reference and input blob identity where one exists, and a typed payload. Findings contain stable IDs, area, severity, artifact location, evidence reference, problem, proposed adjustment and whether a decision is needed. Scoring payloads carry the existing candidate scores/rationales; codebase payloads carry verified context and unresolved context. No envelope value grants authority or chooses a dispatch recipient. Before the plan exists, bind the context artifact to the issue/base/root identity instead of inventing a plan hash.

The helper validates exact keys and path/root identity, creates exclusively with guarded no-clobber primitives, rejects symlinks/nonregular files and stale or cross-pass input, and returns only constant-safe diagnostics. Scoring and judgment briefs carry only the artifact path and item index; the score leaf or helper invokes `decision-classify`, and the helper writes a tie-input file containing only tied options. Integration validates producer identity and bound input before consuming prose. Preserve immutable input identities per phase so an intentional plan edit does not make its own findings appear stale. Missing, malformed, replaced or unrelated artifacts stop the phase with a named constant-safe integrity result; ambiguous writer completion is never replayed automatically. Guard every creation/deletion and remove only artifacts proven owned by this pass, never foreign paths. List every new runtime module in `RUNTIME_SCRIPT_FILES`.

### Edge cases

- Keep role-specific handled outcomes distinct from operational aborts in one flat-owner table: integrity failures (foreign path, symlink, non-regular file, cross-pass, clobber or identity change) are a Phase 4 pass stop with `{issue: null, stage, code}` and the plan preserved; a declined or unavailable leaf dispatch is the Phase 0 step 10 pass stop and deliberately overrides scoring retry and ordinary inline-fallback rules; a judgment `ABORT` or rejected judgment payload consumes a fixed skip slot, with `scored judgment unavailable` in scored mode; rejected scoring consumes its reserved retry slot and then writes `scoring-failure` or `duplicate-rescore`; writer `ABORT` or an ambiguous return keeps the unchanged Phase 4 mapping. A handled blocker writes its typed payload and returns `DONE`; no terminal `ABORT` is relabeled as success, and no route or scored judgment is switched inline.
- A writer returns ambiguously: preserve its possible plan changes and inspect through the existing parent-side checks; never retry the write blindly.
- Zero, multiple, overwritten, tracked, linked or nonregular plans; changed HEAD/index/tracked paths; unrelated new files: retain the current pass-stop semantics.
- Findings cleanup fails or an artifact is unsafe: retain the survivor diagnostic and stop rather than deleting an unverified path.
- Budget exhaustion, ties without a usable rescore, missing judgment or unresolved decisions: preserve blocking open points and `Revision required`; still run the deep-review and final metadata path when operationally possible.
- Native delegation remains available and permitted: keep the native path. T3 eligibility, settings, cancellation and wake handling remain #835/#836 responsibilities.
- The #836 re-entry must name Phase 0 step 10 and the `issue-buddy/readiness` dispatch. A failed native probe remains `NESTED_SPAWN_UNAVAILABLE` without a mid-pass route switch; the flat route never emits that code.

## Acceptance criteria

- [ ] The implementation baseline contains verified #835 and #836 contracts; no transport or route behavior is fabricated in this slice.
- [ ] Under the qualified T3 target setup with nested wake unproven, Issue Buddy itself dispatches draft, all required analysis/judgment/scoring leaves and integration; no child starts a child or silently works an unassigned site inline. The live run records any residual child-run-indicator limitation.
- [ ] One contract assertion fails on drift when graph-derived IDs differ from the assigned five sites; a second anchored assertion maps context, gap/internal/ladder/plan-review/continuation judgments, S-CLR/S-RUL/S-BAT/second-round/S-DEC/S-RRL, fan-out, tie and retry points to slots. The unassigned-site rule returns `ABORT` before work.
- [ ] Every handoff carries only fixed brief controls and bound paths/roots/languages/scored controls. The authority holder consumes only `DONE`/constant `ABORT` and existing safe metadata projections, never issue, plan, comment, findings or judgment prose.
- [ ] Each read-only leaf has only its one guarded parent-named findings-file write; draft/integration change only the same canonical plan. Tests reject foreign paths, stale bindings, schema errors, symlinks, clobbering and ambiguous write replay.
- [ ] Success retains exactly one new untracked canonical plan, full snapshot checks, independent deep review and the publication scan. Early operational aborts may leave zero plans; an identified single-plan survivor follows the existing abort scan/metadata mapping. An unsafe identity or unrelated mutation stops immediately without scheduling further leaves. Every exit cleans owned findings or reports retained survivors without unsafe deletion.
- [ ] `NESTED_SPAWN_UNAVAILABLE` is emitted only when neither qualified nesting nor the flat route is available; native Phase 4 behavior remains unchanged, and native generated changes are either the explicitly listed inert set with named checks, a separately decided target gate, or the dependency-provided mechanism.
- [ ] The three named Issue Buddy suites cover native and flat pass behavior; required checks complete in order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.

## Validation plan

No tests, setup, project formatter or builds run during this planning pass. The implementing run uses `t3-project` after reading its instructions, checking the exact worktree runtime and satisfying the repository test-environment preflight. Run the existing focused Issue Buddy tests through the project test command, then the four required checks in the order above. Expect exit 0 and the named native/flat invariants to pass. Build only from `src/`; generated `dist/` stays untracked. Update only context budgets the build reports and verify new runtime files are shipped in all delivery artifacts where needed.

Use contract tests for Markdown dispatch/permission rules and helper-composition tests for findings bindings, role-specific blocker/abort mapping and cleanup. The existing pass suite composes helpers rather than executing Markdown: a test-side mock scheduler proves only its simulated sequence, not production dispatch ownership or terminal joins. If an executable production scheduling seam is introduced while resolving the schedule blocker, drive that exact seam through the injected mock transport; otherwise retain actual dispatch/join proof exclusively in live product acceptance. The live product acceptance must exercise one complete flat Phase 4 pass under the exact build and target-setup binding, in an announced linked top-level thread under the repository procedure, and record its bound evidence in #837 and a new dated section of `docs/developer-guide/t3-delegation-transport-acceptance.md`. Record direct parent-to-leaf dispatch, required context/gap/internal/deep judgments and applicable scoring/tie paths, terminal joins, integration into the same plan, final scan and metadata projection, bounded parent inputs/outputs demonstrating the prose boundary, and whether each leaf used `effective-delivery` or the minimal fallback. Top-level wake alone is not sufficient. Cover conditional branches deterministically in tests when the live issue does not reach them. Unit or contract tests do not prove live wake or nested capability. Report affected behavioural-eval freshness debt according to the repository release policy; do not present unrecorded model evidence as current.

## Assumptions and open points

The selected branch is evidence-backed rather than an assumption. Proposed helper/fragment names are implementation locations, not existing baseline files. This plan adds no dependency and no independent transport implementation. The product route is separate from the installed planning workflow used to author this artifact.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->
```json
[
  {
    "site": "S-CLR",
    "question": "Which flat scheduling design preserves the exact Issue Buddy parent-read boundary?",
    "options": [
      "Bounded fixed dispatch slots",
      "Path-only continuation mechanism",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Bounded fixed dispatch slots",
        "score": 8,
        "reason": "Fixed phases with reserved per-decision, tie and retry slots and safe no-op rules can preserve the read boundary without a new control projection, but still require a verified resume contract and prerequisites #835/#836."
      },
      {
        "label": "Path-only continuation mechanism",
        "score": 3,
        "reason": "Paths alone cannot resolve conditional continuation, budget tracking or independent tie assignment, and the required control mechanism and its compatibility with the exact read boundary are unproven at the baseline."
      }
    ]
  }
]
```
<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Revision required

### Summary

| Area | Critical | Important | Note |
| --- | --- | --- | --- |
| Architecture | 1 | 2 | 0 |
| Security | 0 | 0 | 0 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 2 | 0 |
| Testability | 0 | 2 | 0 |
| Scope | 0 | 1 | 0 |
| Maintainability | 0 | 1 | 0 |

### Findings

The independent internal review incorporated one Important error-handling finding and one testability Note: distinguish handled judgment/scoring blockers from operational leaf aborts, and classify contract/helper-composition evidence honestly until a production scheduling seam exists. The deep review adds one Critical target-isolation blocker and seven Important corrections: define the flat failure table; enforce terminal-keyword and between-leaf integrity checks; state required exceptions in the flat owner; cover the complete finite schedule and its cost; authorize schedule re-entry; provide killed-pass cleanup; and split graph-ID from invocation coverage. It also adds model-tier/spawn-site, readiness re-entry and live-evidence notes. The earlier gap review incorporated two Important corrections: early safety aborts may leave no plan, and live acceptance must prove the complete flat product pass. The critical and blocking findings remain explicit below.

### Review history (2026-11-27, plan)

Result at that time: Revision required

#### Summary

| Area | Critical | Important | Note |
| --- | --- | --- | --- |
| Architecture | 0 | 0 | 0 |
| Security | 0 | 0 | 0 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 1 | 0 |
| Testability | 0 | 0 | 1 |
| Scope | 0 | 0 | 0 |
| Maintainability | 0 | 0 | 0 |

#### Findings

The independent internal review incorporated one Important error-handling finding and one testability Note: distinguish handled judgment/scoring blockers from operational leaf aborts, and classify contract/helper-composition evidence honestly until a production scheduling seam exists. The three known implementation blockers remained. The earlier gap review incorporated two Important corrections: early safety aborts may leave no plan, and live acceptance must prove the complete flat product pass. No critical finding remained outside the explicit open points.

## Open points

- Blocking prerequisite #835: integrate and verify its owning transport contract and executable selector on the implementation base. Options: wait for the dependency or stop this slice; recommendation: wait. Re-entry: inspect the merged source contracts and their tests before implementation; an issue-state change alone is insufficient.
- Blocking prerequisite #836: integrate and verify portable fixed-route selection and ledger/pass recording. Options: wait for the dependency or stop this slice; recommendation: wait. Re-entry: inspect the actual recorded-route and portable/native behavior on the implementation base.
- Blocking fixed-schedule proof: the selected bounded fixed-slot approach still lacks an explicit finite phase/resume table covering context → draft ordering; Phase 2 S-CLR/S-RUL/S-BAT; the planning ladder's second round; plan-review S-DEC/S-RRL; repeated judgments; per-decision budget consumption; ties; bounded retries; P-DPR budget forwarding; keyword recovery/resume and Retries 1–3; final completion; and safe unused slots. The table must give a worst-case dispatch formula (the current upper-bound concern is approximately `4 × B × 4 = 16B`, or 320 sessions at `B=20`), cite or explicitly classify the no-extra-projection constraint, and compare a constant-safe helper projection before stopping. Missing evidence is not resolved by the score. Re-entry: the owner must explicitly grant a new bounded planning attempt and accept its maximum cost, then produce and independently verify the table against the integrated #835/#836 contracts before product edits. A site-ID list alone is insufficient; stop rather than inventing a path-only control plane if the selected schedule cannot meet the boundary.
- Blocking native-output isolation: the baseline build ships tool text, shared fragments, model-tier rows and runtime scripts to every target; no existing mechanism isolates this flat route to portable output. Options: (a) preserve the invariant while documenting and testing the explicitly listed inert native changes, (b) add a separately decided build-time target gate, or (c) reuse the mechanism delivered by #835 or #836; recommendation: (a), subject to verifying that native behavior and sidecars remain unchanged. Re-entry: the owner must decide the option on the integrated dependency baseline and name the build checks before implementation; decision 7's stop condition applies until then.
