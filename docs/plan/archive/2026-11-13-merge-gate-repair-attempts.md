# Stop unproductive repair loops in merge-gate

**Plan status:** Implemented
**Source:** sebastian-software/effective-flow #662 (planning comment)
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

`merge-gate` keeps its run-wide `mergeGate.maxRounds` bound, but it also accounts **repair attempts** separately from waiting. It stops automatic repair, with a report, when verified repairs keep leaving the same blocking reviewer finding in place, or when a repair would materially expand the authorized scope.

Today `merge-gate` counts every Phase-2 round and every Phase-4 return as one integer (`src/shared/merge-gate-delegated-run.md`, "Round accounting"). A CI re-wait, a base merge and an `iterate` correction all consume the same budget, and the Phase-6 report cannot say whether a finding survived an actual fix. The behaviour in #641 and #659 (the same finding re-reported on a base-merge head, then resolved by a real fix) shows that a base-only update and an ineffective repair need different treatment.

Decisions taken in planning (maintainer answers):

1. **Stop rule:** the second verified ineffective repair of the same blocking reviewer finding stops the run. The first one is recorded and the run may try once more. This is fixed, not a new configuration key.
2. **CI repairs are counted, never stopped:** the gate reads only a check's name and conclusion, with no structured failure detail. So CI repair attempts are counted per check and reported, but they never trigger the stop rule. `maxRounds` stays their bound.
3. **Scope expansion is declared up front:** the gate passes the authorized scope to the delegated `iterate` run. `iterate` reuses its existing path-ownership checks as the declaration (Phase 3 analyzed owned paths, the stop-before-modifying rule for an outside path, and Commit integrity). A repair whose paths leave the authorized scope is not edited or committed. It is returned as a declared scope expansion. The gate also checks the commits actually made against the scope, so a run that ignores the declaration still fails closed. Expansion is decided by paths only.
4. **Scope content and timing:** the authorized scope is the PR's changed paths plus **added** test files. It is read once, just before the run's first delegation, and stored. An undetermined read blocks only delegation. Non-delegating runs behave exactly as today.
5. **Test allowance owned by the helper:** `iterate` checks paths through the helper's `scope-check`. The test globs live only in the helper and allow only test files a repair adds. Editing or deleting an existing test file outside the PR's paths is an expansion.
6. **Envelope line is optional and version-neutral:** the scope line is optional in the delegation envelope, like `Progress context`, and valid under snapshot versions 1 and 2. It is mandatory under the merge-gate delegation contract. Without it, `iterate` behaves as today.
7. **Mechanics:** a new helper, `src/scripts/repair-attempt-core.mjs`, holds the accounting, matching, attribution, scope check and stop rule. Its thin CLI, `repair-attempt.mjs`, runs the named ref-only git reads itself through the injected `process-runner` (the `diff-baseline` precedent) and returns `undetermined` codes. The core stays pure and is tested with a fake runner.
8. **Eval mechanics:** the new merge-gate scenarios seed a local bare `origin` with real commits. At dispatch, `iterate-trace` advances the bare origin's head and pull refs to pre-seeded commits (fixed author and committer environment). The stub derives `headSha` from the bare origin's ref, so an in-run gate base merge stays consistent.

Planned at: `c9793539` (`origin/develop`), 2026-11-13.

Feature, because this adds a new gate capability (attempt accounting, a stop rule, an `iterate` scope declaration and a new helper) rather than fixing defective behaviour.

## Outcome checkpoint

**Primary source:** sebastian-software/effective-flow #662
**Original outcome:** merge-gate separates repair attempts from waits and base-only updates. It stops with an actionable report after the second ineffective repair of the same blocking reviewer finding, or before a repair outside the authorized scope is committed. The run-wide bound, open blocking findings, the verified-head merge guard, required independent review, and publication and write authority stay unchanged.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** planning only. A new repair-attempt helper that runs the git reads, an optional envelope scope line, an `iterate` scope declaration in delegated mode, merge-gate contract changes, tests, and two merge-gate eval scenarios.
**Continuation decision:** none

## Acceptance criteria

**Accounting**

- [ ] `mergeGate.maxRounds` keeps its meaning and counting. A separate per-cause **repair-attempt** record is kept per run. A CI wait, a bot wait, a review resubmission, a resolved delegation without a head movement, and a gate-made base merge (trigger (a) or (b), or conflict resolution) each consume **zero** repair attempts.
- [ ] In delegated mode, `iterate` returns the commit SHAs it created per caller-minted identifier. `delegation-envelope build` mints, and the gate records before dispatch, one identifier per item plus one for the free-text repair and one for the Phase-4 correction bucket. These are carried above the delimiter. An entry under any unminted name, such as `ci` or `validation`, is inert.
- [ ] A repair attempt is counted for each reviewer item whose trusted outcome is `implemented` and whose own identifier has at least one returned SHA inside the attributed range. A free-text CI repair with a returned SHA counts one CI attempt for each failing check named in the instruction. CI attempts are reported and never stop the run. Correction-bucket commits count no attempt for any cause. A head movement made only by the gate's own base merge does not count.
- [ ] Commit attribution: the gate records the head immediately before dispatch. The helper reads `git rev-list <before>..<after> --not origin/<base>`, with base fetched for that read. The range must contain only the gate's own base-merge commits, identified by their pushed SHAs, plus the returned SHAs. Any other commit is a foreign head movement: no attempt is counted, the round's matches are `uncertain`, and the report names the foreign commits. An undetermined attribution read makes the round `uncertain`.
- [ ] Return receiver rule:
  - entries for unminted identifiers are inert, and identical repeats are idempotent;
  - one SHA returned for two identifiers, or a returned SHA outside the attributed range, makes the round `uncertain`, with no attempt counted;
  - any `scopeExpansion` entry for a minted identifier (item, free-text repair, or correction bucket) stops the run, failing closed.

**Cause identity and matching**

- [ ] A reviewer **blocking cause** has a deterministic identity in the helper: its existing durable key (the forge thread ID, or the review id plus the finding ordinal), owned by the configured reviewer that reported it. A CI cause is the check name, used for counting and reporting only. A new comment ID, a new head SHA, or a wording change alone never establishes "same cause" or "new cause".
- [ ] Match rule: the helper compares only findings from the same configured reviewer, after "Matching a configured login". A re-reported finding is classified as follows:
  - `same` when (a) it keeps the same durable key, or (b) its anchored path and current line on the observed head overlap a hunk of a recorded repair diff of an open cause. The helper computes the overlap from forge anchors and git diffs, never from finding text.
  - `new`, a separate cause with its own counter, when the thread is anchored, its anchor is current, its durable key is not recorded, and its path and line overlap no recorded repair hunk of any open cause from the same reviewer.
  - `uncertain` in every other case, including:
    - the provider does not affirmatively state a current right-side line on the observed head: the new `lineOutdated` flag is true for a null GitHub `line`, for `diffSide: LEFT`, for a negative signed line, and always on Forgejo;
    - any commit between the attempt's after-head and the observed head changed the anchored path;
    - the hunk or path-change read is undetermined;
    - a body finding has no anchor.
- [ ] An `uncertain` observation neither increments nor resets any counter, and keeps the existing blocking and bounded handling (`maxRounds` still ends the run). A `new` finding is not evidence against an existing cause. A cause is resolved, and its counter reset, only when its own configured reviewer has run on a later head and reports no finding classified `same` or `uncertain` against it.

**Stop rule**

- [ ] When a reviewer cause reaches **two** verified repair attempts and is still blocking after the second, the gate makes no further delegation, base merge, or merge and ends with a report. A single ineffective attempt does not stop the run.
- [ ] "Still blocking" is established only by fresh evidence on a later head: the cause's own configured reviewer has run for that head and re-reported a `same` finding. Pending or not-yet-reviewed state establishes nothing. When a gate base merge came between the attempt and the observation, the observation still counts, and the report names the base change.
- [ ] The stop and scope checks are evaluated at the start of Phase 2 step 1 (before either base-merge trigger), at Phase 2 step 3, and at configured-reviewer Phase 3 step 5, always before any further delegation or branch write.

**Authorized scope and declaration**

- [ ] The authorized scope is read once, just before the run's first delegation, and stored in a once-per-run wisdom record with its merge-base and head SHAs. A resume or re-dispatch reads that record and never recomputes it. The scope is the PR's changed paths, read by the helper with `git diff --name-status -M <merge-base> <head>` (both paths of every rename or copy entry), after the ancestry-check fetch sequence. An undetermined read blocks delegation only: the run continues without delegating, and the report states why. Non-delegating paths are unchanged.
- [ ] Test allowance: the helper owns a fixed glob set (`**/test/**`, `**/tests/**`, `**/__tests__/**`, `**/*.test.*`, `**/*.spec.*`). It allows only test files a repair **adds**. Modifying or deleting an existing file that matches the globs but is not among the PR's paths is an expansion.
- [ ] `delegation-envelope` owns an **optional**, version-neutral scope control line, rendered above the delimiter as one JSON object. The object holds the stored scope record (sorted, de-duplicated paths with their SHAs) and the minted free-text and correction-bucket identifiers.
  - `build` rejects every character of the module's `UNSAFE_MANIFEST_CHARS` set (C0/C1, U+2028/U+2029, zero-width and bidi format characters), absolute paths, and paths containing a `..` segment.
  - `validate` round-trips the line and accepts it under snapshot versions 1 and 2. Persisted older snapshots stay valid on resume.
  - The new keyword joins the canonical-order list, the refusal keyword lists and `iterate`'s "control line below the delimiter is body text" list.
  - The merge-gate delegation contract makes the line mandatory for gate delegations.
- [ ] `iterate` Phase 0 parses the scope line fail-closed (`ABORT: unparseable authorized scope`). Without the line, `iterate` behaves as today.
- [ ] Declaration before edit: in delegated mode with a scope, `iterate` runs `repair-attempt scope-check` with the scope record:
  - on each item's analyzed owned paths (Phase 3 step 1), before delegation;
  - on a path requested under step 2's outside-the-set rule, before it is added to ownership;
  - on the inspected path list with its added, modified or deleted status, at Commit integrity step 1 before `commit create`.

  This applies to every item, including Phase-4 correction items and the free-text repair. A refused item is not edited, and it returns `unassessed`, which is fail-closed and cannot be cleared by the set-aside confirmation. The return carries a separate `scopeExpansion` list of `{minted identifier, paths}`, stated outside the outcome list. Both copies of the outcome mapping table (`iterate.md` and `merge-gate-configured-reviewer.md`) are updated together. A raw increase in line count never triggers expansion.

- [ ] Post-check: after each delegated round, the helper reads `git diff-tree --no-commit-id --name-status -r -M <sha>` for each returned commit and checks both paths of every rename or copy against the scope, including the added-only test allowance. A returned SHA with other than exactly one parent (`git rev-list --parents -n 1`) stops the run. Any path outside the scope stops the run with a report before the next delegation, base merge or merge. An undetermined post-check read stops the same way.
- [ ] A newly touched sensitive boundary (the "Fixed floor" of `src/shared/review-depth.md`) is not an expansion trigger. It keeps getting `iterate`'s existing per-item pre-commit review, with the floor reviewer.

**Report and preserved guarantees**

- [ ] The Phase-6 report gains a repair-progress block for a stop. It names:
  - the unresolved cause and its reviewer;
  - every observed repair attempt (round, head before and after, outcome);
  - the waits and base changes in between;
  - foreign commits;
  - out-of-scope paths with their SHAs;
  - the specific decision the maintainer needs to make.

  Every run reports per-cause repair and CI attempt counts beside the existing delegated-round bullet.

- [ ] A real fix and a newly affected sensitive boundary still get the required independent review. Open blocking findings, the verified-head merge guard, the `mergeGate.completion` and write authority, and publication rules behave as before. A stop never merges.

**Tests and evidence**

- [ ] Focused unit tests for the helper, with a fake runner for the git reads, cover at least:
  - a base-only update followed by the same finding: zero attempts used, so a legitimate fix proceeds;
  - two ineffective repairs: stop;
  - one ineffective repair, then an effective one: resolved, no stop;
  - a genuinely new anchored finding: `new` cause with its own counter, which does not block resolution of other causes;
  - an uncertain match: no increment, no reset, no stop;
  - outdated, left-side, negative-line and Forgejo anchors: `uncertain`;
  - an anchored path changed by an intervening commit: `uncertain`;
  - a body finding without an anchor: `uncertain`;
  - another reviewer's overlapping thread: not `same`;
  - a repair that adds focused test files: in scope;
  - a repair that edits or deletes an existing out-of-PR test: expansion;
  - a rename from an out-of-scope path into a test path: expansion;
  - a returned merge commit: stop;
  - a declared path outside the scope: expansion stop;
  - CI or reviewer waits only: no attempt, no stop;
  - repeated CI repairs: counted, no stop;
  - a foreign commit, or a base commit brought in by a gate merge: correct attribution;
  - correction-bucket commits: no attempt;
  - an entry under an unminted `ci` or `validation` name: inert;
  - one SHA claimed for two identifiers: `uncertain`;
  - a post-check failure recorded after a Phase-3 delegation: the next Phase 2 step 1 stops before either base-merge trigger;
  - an undetermined scope read: delegation blocked, no stop of a non-delegating run;
  - a resume: uses the stored scope;
  - each undetermined git read: the specified outcome.
- [ ] A contract test names the invariants it protects in the merge-gate and `iterate` prose:
  - separate repair accounting, with waits and base merges excluded;
  - the second-attempt stop for reviewer causes only;
  - the same/new/uncertain rule;
  - the scope declaration before edit and commit;
  - the eager post-check;
  - the stop check placement before step 1;
  - the eager placement of `iterate`'s scope parse and checks.
- [ ] Two new `evals/merge-gate` scenarios modelled on #641/#659, built on anchored threads, each with its own fixture, expected outcome and evaluator rule:
  1. a gate-made base merge re-reports the same finding (no attempt used), then a legitimate fix is made and approved;
  2. two ineffective repairs end in a report with no merge.

  The setup seeds a local bare `origin`, following `_scaffold/no-ci-checkout.mjs`. At dispatch, `iterate-trace` advances the origin's head and `refs/pull/<N>/head` refs to pre-seeded commits (fixed author and committer environment) and returns those SHAs with `implemented`. The stub forge derives `headSha` from the bare origin's ref. Per-head bot reviews use sequenced tracker fixtures. `scripts/repair-attempt.mjs` and `scripts/repair-attempt-core.mjs` are added to `LOAD_SET_SEEDS`. The `iterate` suite gets a scope-parsing scenario. Existing merge-gate scenarios keep their expected outcomes, because the scope is read only before a delegation.

- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` exit 0. `pnpm eval merge-gate verify` and `pnpm eval iterate verify` report only the expected freshness debt and no integrity failure.

## Affected areas/files

- `src/scripts/repair-attempt-core.mjs` (new) — pure operations over injected reads:
  - normalize round records (head before dispatch and after, gate base-merge SHAs, returned SHAs per minted identifier, outcomes, thread anchors with reviewer and `lineOutdated`);
  - attribute commits;
  - classify same, new or uncertain;
  - count reviewer and CI attempts;
  - evaluate the stop rule;
  - run `scope-check` (stored scope, added-only test globs, rename both sides, single-parent check);
  - return a structured decision, `undetermined` codes, and report data.
- `src/scripts/repair-attempt.mjs` (new) — thin JSON CLI with one envelope (`{ ok, operation, data }`). It runs the ref-only git reads (`rev-list`, `diff --name-status -M`, `diff-tree --name-status -M`, `rev-list --parents`, hunk reads) through the injected `process-runner`, following `diff-baseline.mjs`. The base fetch stays in the gate's existing ancestry-check sequence.
- `src/scripts/remote-tracker-core.mjs` and its tests — add `lineOutdated` to the normalized thread read, computed before the `originalLine` fallback: true for a null GitHub `line`, for `diffSide: LEFT`, for a negative signed line, and always for Forgejo threads.
- `src/scripts/delegation-envelope-core.mjs` and `test/delegation-envelope*.test.mjs` — the optional, version-neutral scope line and the minted free-text and correction-bucket identifiers.
- `build.mjs` — add both new files to `RUNTIME_SCRIPT_FILES`, and update `CONTEXT_BUDGET_LINES` for the grown `iterate` and `merge-gate` tools.
- `AGENTS.md` — add the new helper pair to the helper-pair list. It is not allowlisted in setup, following the `delegation-envelope` precedent.
- `src/shared/merge-gate-delegated-run.md` — eager:
  - "Round accounting" (`maxRounds` unchanged, plus separate repair accounting);
  - the stop and scope checks at the start of step 1 and at step 3;
  - the scope read before the first delegation;
  - the attribution and post-check helper calls and their stop;
  - the once-per-run scope record and the per-round repair fields in the wisdom file;
  - the Rules section.

  Only the Phase-6 repair-progress report layout goes behind a `lazy-include`.

- `src/shared/merge-gate-delegation-contract.md` — make the scope line mandatory for gate delegations, and define the minted identifiers, returned SHAs, the `scopeExpansion` return and the receiver rule.
- `src/shared/merge-gate-configured-reviewer.md` — Phase 3 step 5: record the round and evaluate the stop before any further delegation. Also:
  - scope matching per configured reviewer;
  - link the head-movement corroboration to repair counting;
  - keep the outcome mapping table in step with `iterate.md`;
  - add the Phase-6 report items.
- `src/tools/iterate.md` — delegated mode. Eager: recognizing the scope keyword, the fail-closed parse, and the `scope-check` calls at Phase 3 steps 1 and 2 and at Commit integrity step 1. Lazy: only the return-format detail (returned SHAs and the `scopeExpansion` list) and the mapping-table rows. Interactive `iterate` stays unchanged.
- `docs/user-guide/tools-deliver.md` and `docs/user-guide/configuration.md` — cover:
  - repair attempts beside `maxRounds`;
  - the stop report;
  - CI attempts that never stop the run;
  - fresh counters for each new invocation;
  - the added-only test allowance;
  - why body findings, outdated anchors and Forgejo threads stay `uncertain`.
- Tests:
  - `test/repair-attempt*.test.mjs` (new);
  - a new contract test (or an extension of `test/workflow-contracts.test.mjs`);
  - `test/execution-profile-contract.test.mjs` (`EXPECTED_RUNTIME_SCRIPTS`);
  - `test/merge-gate-eval.test.mjs` (`LOADED_BY_A_RUN`);
  - `test/eval-fixture-fidelity.test.mjs` (the iterate corpus count).
- `evals/merge-gate/`:
  - `scenarios/`, `fixtures/` and `scenario-registry.mjs`;
  - `suite.config.mjs` (`LOAD_SET_SEEDS` and the instrument files);
  - `_scaffold/evaluate.mjs`, `_scaffold/iterate-echo.md` and `_scaffold/iterate-trace.mjs`, where the trace moves the refs;
  - a new local-origin setup module modelled on `_scaffold/no-ci-checkout.mjs`;
  - the stub forge's `headSha` derived from the bare origin.
- `evals/iterate/` — the scope-parsing scenario.
- All archived `merge-gate` and `iterate` rounds become freshness debt.

**Order of work** (verify each step with `pnpm test`, and with `node build.mjs` from step 3 on):

1. the helper with its fake-runner unit tests;
2. the `lineOutdated` thread flag and the envelope scope line, with their tests;
3. `iterate` delegated-mode prose and the iterate eval scenario;
4. the merge-gate prose and the contract test;
5. the merge-gate eval scenarios, the docs, and the full check list above.

## Edge cases

- **Base merge and repair in the same round:** commits brought in from the base are excluded through `--not origin/<base>`. Only returned `iterate` commits count, and the post-check covers only those SHAs.
- **A gate base merge between the attempt and the next observation:** the observation counts, and the report names the base change. A match whose anchored path that merge changed is `uncertain`.
- **Several findings in one round:** `iterate` makes one commit per item, so each `implemented` item with its own returned SHA records one attempt for its own cause. One SHA returned for two items makes the round `uncertain` (receiver rule).
- **A same-key thread that the gate recorded `implemented` is excluded from later delegation, as today:** the stop is reached through a new anchored thread that overlaps the repair. That exclusion is not relaxed.
- **Several configured reviewers:** causes, matches and resolution are kept per reviewer. Another reviewer's overlapping thread never counts against a cause.
- **A cause is resolved and later reappears:** its counter restarts at zero, so the stop rule sees only consecutive ineffective attempts.
- **`deferred`, `rejected` or `unassessed` outcomes:** these are not repair attempts. They keep today's fail-closed handling.
- **A CI check fails repeatedly after repairs:** the attempts are counted and reported, and `maxRounds` ends the run.
- **A repair adds new test files:** in scope. **A repair edits or deletes an existing test outside the PR's paths:** expansion.
- **A repair renames an out-of-scope file into a test path:** both rename paths are checked, so this is an expansion.
- **A repair needs a lockfile, snapshot, or generated-file path outside the PR's paths:** this is an expansion. The item is refused without edits, and the report asks for the decision.
- **`iterate` ignores the declaration and commits outside the scope, or returns a merge commit:** the post-check stops the run before the next delegation, base merge or merge. Pushed commits stay on the PR branch, with no revert and no force push. The report names their SHAs and paths.
- **A refused repair:** it is refused before any edit. Uncommitted changes from any other cause are reported as a dirty checkout.
- **A foreign push during a round:** no attempt is counted, matches are `uncertain`, and the report names the foreign commits.
- **Quoted reviewer text names `ci`, `validation`, or another unminted key:** the entry is inert.
- **A crafted PR path with a control, line-separator, zero-width or bidi character:** `build` rejects it. Delegation is blocked, and the report states why.
- **A shallow clone, failed fetch, or missing pull ref before the first delegation:** delegation is blocked. A green PR that needs no delegation still merges as today.
- **`maxRounds` is reached before the repair stop:** the existing cap report applies and includes the repair counts.
- **Resume of a suspended or re-dispatched run:** the counters and the stored scope come from the wisdom file. The scope is never recomputed. Older envelope snapshots stay valid.

## Assumptions

- Repair records are in-run state in the wisdom file. No cross-run persistence is added, so a new gate invocation starts with fresh counters.
- Only the gate's own base merges count as base-only updates. A base merge pushed by someone else is a foreign commit.
- A legitimate fix that needs a path outside the authorized scope is a maintainer decision, which the stop report requests.
- Stop coverage depends on anchored GitHub review threads with a current right-side line. Body findings and all Forgejo threads produce `uncertain` matches, so `maxRounds` stays their bound. The docs state this.
- Overlap with #650 and #656 is limited to referring to the "Fixed floor" of `src/shared/review-depth.md`. This issue does not change review depth.
- New eval scenarios need hand-recorded fresh-session evidence per the repository's evidence policy. Missing slots are visible freshness debt, not a CI failure.

## Plan review

**Result:** Approved

Two review rounds ran: the automatic baseline (13 Important and 5 Note findings, all incorporated or decided, including CI attempts that never stop, an optional envelope line and a local-origin eval) and the deep interactive review summarized below.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         3 |    0 |
| Security        |        0 |         2 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         5 |    0 |
| Testability     |        0 |         2 |    1 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         1 |    2 |

### Findings

- Architecture, Critical: the match rule had no `new` class, so a genuinely new finding was impossible and unrelated findings blocked resolution. Incorporated: same, new and uncertain classes, with `new` never counting as evidence against an existing cause.
- Architecture, Important: no owner for test-glob matching, a root-only glob, and existing tests left editable. Decided: the helper `scope-check` owns the globs, with `**/` patterns, and allows added test files only.
- Architecture, Important: git output was left to prose transcription. Decided: the helper CLI runs the ref-only git reads through `process-runner`.
- Architecture, Important: thread anchors from later delegations conflicted with a once-stored scope. Decided: the scope is PR paths plus added test files only.
- Security, Important: the reserved `ci` and `validation` keys were forgeable through quoted text. Incorporated: minted identifiers for the free-text repair and the correction bucket, with unminted names inert.
- Security, Important: the rename and merge-commit blind spots in the scope reads. Incorporated: `--name-status -M` with both paths checked, and a stop for any non-single-parent returned SHA.
- Error cases, Important: anchors were not current on Forgejo, on the left side, or after later commits. Incorporated: a broader `lineOutdated`, intervening path changes counted as `uncertain`, and undetermined reads made explicit.
- Error cases, Important: a correction-bucket expansion was missing from the stop list. Incorporated.
- Error cases, Important: a fail-closed scope read at gate start would stop non-delegating runs and break evals. Decided: read just before the first delegation, with an undetermined read blocking delegation only.
- Error cases, Important: U+2028/U+2029 could split the envelope line. Incorporated: reuse of `UNSAFE_MANIFEST_CHARS`.
- Error cases, Important: matching was not tied to the reviewer that owns the cause. Incorporated: per-reviewer matching and resolution.
- Testability, Important: the eval could not produce attributable head moves or a gate-made merge. Decided: `iterate-trace` advances the bare origin's refs, and the stub derives `headSha` from them.
- Testability, Important: the edge case "one commit for several findings" contradicted the duplicate-SHA rule. Incorporated: one commit per item, with a shared SHA counted as `uncertain`.
- Testability, Note: the step-4 stop test described an unreachable state. Incorporated: restated as a post-check failure followed by the stop at the next step 1.
- Maintainability, Important: the safety checks sat behind a `lazy-include`. Incorporated: the parse, scope checks, attribution and post-check stay eager, and only the report layout and return format are lazy.
- Maintainability, Note: the envelope version was deferred. Decided: the line is version-neutral under v1 and v2.
- Maintainability, Note: the counting condition was looser than the receiver rule. Incorporated: it now requires the item's own SHA inside the attributed range.

## Open points

- No open points.

## Build completion

Implemented on `effective-flow/build/merge-gate-repair-attempts-662` (base `origin/develop` c9793539), in the plan's five-step order.

- **New helper pair `src/scripts/repair-attempt-core.mjs` / `repair-attempt.mjs`.** Operations `scope-read`, `scope-check`, `attribute`, `post-check`, `record` and `evaluate`, one `{ ok, operation, data }` envelope. The CLI runs the ref-only git reads through `process-runner` with inherited `GIT_*` variables masked and `--no-replace-objects`; it never fetches. Every failed read returns one of ten `undetermined` codes with the outcome the plan specifies. The stop is sticky in the repair state. Name-status reads use `-z`; paths must be canonical.
  - Accounting: one attempt per reviewer cause per round for `implemented` items with their own returned SHA inside the attributed range; CI attempts per failing check, never stopping; correction-bucket commits, waits, resubmissions and gate base merges count nothing. Receiver rule as specified; entries under unminted identifiers are inert whatever their shape. A replayed `record` of a stored round returns the stored result; a round that was `uncertain` only because a returned SHA lay outside the range may be re-recorded once with a descendant `after`.
  - Matching: `same` / `new` / `uncertain` per configured reviewer from durable keys, forge anchors and git hunks (a trailing TAB in a `+++` header is stripped). Resolution needs the cause's own reviewer on a later head.
  - Scope: PR paths from `git diff --name-status -z -M <merge-base> <head>`, stored once. The test globs allow added test files only; a modified or deleted test outside the PR's paths is allowed only when it is absent at the stored head and its adding first-parent commit is single-parent (so a test brought in by a base merge stays an expansion).
  - Post-check: every commit the delegated round actually made, returned or foreign, except the gate's own base merges. An out-of-scope path, a commit without exactly one parent or an undetermined read stops the run (`scope-expansion-committed`, `merge-commit`, `post-check-undetermined`, or `foreign-commit-unverified` for unreturned commits). A missing or unparseable `Scope expansion:` line on a scoped `DONE` or non-Phase-0 `ABORT` stops with `scope-line-missing`.
- **`remote-tracker-core.mjs`:** normalized threads carry `lineOutdated` (null GitHub `line`, `diffSide: LEFT`, negative line, always on Forgejo).
- **`delegation-envelope-core.mjs`:** optional, version-neutral `Authorized scope:` control line above the delimiter (scope record plus minted free-text and correction identifiers), with the `UNSAFE_MANIFEST_CHARS`, absolute-path and `..` refusals, round-trip under snapshot versions 1 and 2, and the keyword in the refusal lists.
- **`src/tools/iterate.md`:** delegated mode parses the line fail-closed in Phase 0 (`ABORT: unparseable authorized scope`, read only above a body delimiter) and runs `scope-check` at Phase 3 step 1, step 2's outside-the-set rule, Phase 4 step 2 for correction items, and Commit integrity step 1. Every refusal edits nothing more, records the item's paths as rejected and uncommitted, and returns `unassessed`. The return format (`Returned commits:`, `Scope expansion:`) is the new lazy fragment `src/shared/delegated-scope-return.md`; the new mapping row sits in both identical outcome tables. Interactive `iterate` is unchanged.
- **Merge-gate prose:** `merge-gate-delegated-run.md` "Round accounting" (`maxRounds` unchanged, separate repair accounting) and "Repair checkpoints" (scope read once after the ancestry fetches, head before dispatch, `record` after every return except `BLOCKED-USER`, one status re-read for a lagging head, `evaluate`, and the stop check owned by step 4 and applied at Phase 2 step 1 before both triggers, Phase 2 step 3 and configured-reviewer Phase 3 step 5). An undetermined scope read blocks delegation only. `merge-gate-delegation-contract.md` makes the line mandatory and owns minted identifiers, the return lines and the receiver rule. `merge-gate-configured-reviewer.md` adds "Repair evaluation per configured reviewer". The Phase-6 repair-progress layout is the new lazy fragment `src/shared/merge-gate-repair-report.md`; every run reports per-cause and CI attempt counts.
- **Evals:** merge-gate scenarios `repair-after-base-merge-merges` and `repeated-ineffective-repair-stops` on a seeded local bare origin (`_scaffold/repair-origin.mjs`); `iterate-trace` advances the head and pull refs and returns the seeded SHAs; the stub forge serves `originHeads` fixtures from the bare origin's head. Iterate scenario `unparseable-authorized-scope-aborts`. Both helper files are in `LOAD_SET_SEEDS`. Existing fixtures gained `lineOutdated`; the host-driver frozen corpus excludes the three new scenarios.
- **Build and docs:** both helper files in `RUNTIME_SCRIPT_FILES`; `iterate` budget 1798 (merge-gate core unchanged at 917/922); `AGENTS.md` helper-pair list; `docs/user-guide/tools-deliver.md`, `docs/user-guide/configuration.md`, `docs/developer-guide/build-system.md`, `docs/developer-guide/architecture.md`.

### Test results

Final validation in CI order through the project runner. `pnpm test`, `node build.mjs` and `pnpm test:distribution` ran in a container-local full clone, because the container cannot see the worktree's Git directory.

| Check                                               | Result                                             |
| --------------------------------------------------- | -------------------------------------------------- |
| `pnpm agent:check`                                  | exit 0                                             |
| `pnpm test`                                         | 5357 tests: 5253 passed, 53 failed, 51 skipped     |
| `node build.mjs`                                    | exit 0 (iterate 1789/1798, merge-gate 917/922)     |
| `pnpm test:distribution`                            | exit 0                                             |
| `pnpm eval <suite> verify --mode report` (all five) | exit 0, no integrity blockers, freshness debt only |

The 53 failures are exactly the 53 that fail on the unchanged base in the same environment (host-driver Python, process-group signal and hook-timeout, tier-swap and eval-round provisioning tests). The change adds 94 tests, all passing: `test/repair-attempt-core.test.mjs`, `-cli`, `-contract`, `-git`, `test/delegation-envelope-scope.test.mjs`, `test/merge-gate-eval-repair.test.mjs`, plus extensions of the remote-tracker, envelope, eval and workflow-contract tests.

Behavioural evals: no round was recorded. All archived `merge-gate` and `iterate` rounds are stale, and the three new scenarios have no archived runs, so they must be recorded in fresh sessions before the next release.

## Review findings

**Date:** 2026-11-14
**Reviewer:** nodejs-reviewer and generic-product-reviewer (deep), one scoped re-check each, and one verification of the follow-up corrections

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    32 |
| Open / Not implemented |     0 |

The first review raised 23 distinct findings (7 Important, 16 Notes; one Important was reported by both reviewers). The re-check and the verification raised 11 defects in the corrections (3 Important). All within the authorized slice were corrected, including the duplicate, which the plan's fail-closed decision for scope expansion makes current scope: unreturned commits are now post-checked. Two Notes were closed without a change: an intervening path change stays `uncertain` as the acceptance criteria state, and a left-side multi-line thread start can only widen an overlap into a safe stop.
