# Scan unattended plans for publication blockers before reporting success

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Issue:** #799

## Requirement

An unattended planning run (Issue Buddy Phase 4, the autopilot plan stage) can return `DONE` for a
plan that the publication content scan later refuses. The refusal only surfaces in Issue Buddy
Phase 5, when `plan-publication.mjs publish --apply` fails with `SCAN_BLOCKED`. By then planning and
the deep review are spent, the authority-holding parent may not rewrite the plan, and the issue is
recorded `failed` under item 4 of Issue Buddy's "Ordered outcome mapping", spending a retry. The
observed trigger was an edge-case bullet that quoted the co-author trailer key with its colon in a
code span; the attribution pattern matches on every line, case-insensitively, code spans and fenced
code included.

The scan behaves as designed and stays unchanged. The defect is late detection: the planner, the
only party still authorized to edit the plan, never runs the scan on its own output and has no rule
telling it to avoid the literals the scan refuses.

Goal: the unattended `plan` entry runs the existing `scan` operation on its own plan in
"Completion", corrects blocking findings while it may still edit the plan, and fails closed with
finding ids only when it cannot clear them. Issue Buddy never sends a plan whose planner aborted to
Phase 5, and classifies that outcome from its own helper results. A Phase 5 `SCAN_BLOCKED` on plan content then becomes a rare integrity signal.

Non-goal: Phase 5 also refuses forge text it derives from the plan (`details.source: "derived"`,
for example a scan finding in the derived title or body, an unusable title or a closing keyword).
Those refusals stay detected in Phase 5; the self-scan covers the plan field only, line by line, and
passes no `title`, `body` or `commitMessage`. One known gap remains deliberately: the derived body
joins the wrapped lines of the first Requirement paragraph, so a forbidden phrase split across a
line break passes the self-scan and can still block in Phase 5. The writing rule (name such strings,
never write them) is the mitigation; a helper projection of the derived summary would be scope
creep.

Workflow rationale: Feature. This adds a new completion check, a new fail-closed abort reason, a
new Issue Buddy stop rule and a writing rule to shipped product source (`src/**/*.md` routes as
product source per `AGENTS.md`), plus tests. It is not a bugfix of the scan, and it changes run
behavior, so it is neither a refactoring nor a documentation-only change.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #799.
**Original outcome:** unattended plans that would fail the Phase 5 plan-content scan are corrected
or refused inside the planning run, with the scan patterns and their strictness unchanged and the
refusal carrying finding ids only.
**Last evaluated attempt:** none.
**No-progress count:** 0
**Cumulative approach:** new plan; no earlier attempt.
**Continuation decision:** none.

## Architecture decisions

- **Reuse the existing `scan` operation, unchanged.** `scan` in
  `src/scripts/plan-publication-core.mjs` requires `{cwd, runState, planFile}` (closed schema with
  optional `title`, `body` and `commitMessage`, none of which the self-scan passes), reads only the
  plan file through the safe regular-file reader, needs no Git repository and writes nothing. Under
  `runState: "unattended"` every finding is listed in `data.blocking` and nothing is
  acknowledgeable, which is the strictness Phase 5 applies to plan content. No new helper,
  operation or pattern is added.
- **Read the result from `data.blocking`, not from the exit code.** A scan with findings still
  exits 0 with `ok: true`; only `publish` turns findings into `SCAN_BLOCKED`.
- **Only the `plan` entry scans (decided by score).** "Completion" also serves the two `plan-review`
  entries, but only the `plan` entry's plan reaches the Phase 5 publish, and its Completion runs
  after the deep review returns, so review edits are scanned too. The `plan-review` file delegation
  needs no scan and therefore no rule for passing a review sub-run's abort through; the autopilot
  file review judges existing plans that the plan-publication helper never publishes, where
  unattended strictness would block lower-confidence classes for no benefit. The step therefore
  opens with "`plan` entry only".
- **Extend step 1 instead of adding a numbered step (decided by score).** Step 1 already finishes
  formatting and runs the final plan-lint, which the correction round repeats. Appending the scan
  and its correction round to step 1 keeps the loop inside the step it reruns, places it before the
  `publication-metadata` call of step 2, and keeps every "step 2" reference and its pinned test
  literals valid. `publication-metadata` binds the blob OID Phase 5 expects, so every correction
  happens before it.
- **Bounded correction: one round.** After the first scan, the owning agent reads every listed
  line before the first edit (or edits from the bottom up, since ids carry line numbers), rewords
  each blocking line once per the writing rule, reruns step 1 in full (formatting and final lint)
  and scans again. Any blocking finding on the second scan returns exactly
  `ABORT: unattended plan content blocked: <id>, <id>` with the remaining finding ids
  (`<class>:<field>:<line>`) in `data.blocking` order, capped at the first 20 ids followed by
  `(+<k> more)` when more remain, and nothing else. This mirrors the "consolidates once" rule of
  the same section and bounds the diagnostic that autopilot copies into a blocker summary.
- **Operational scan failures keep the operational abort.** A nonzero exit, an envelope that does
  not parse, or `ok: false` (`INVALID_INPUT`, `UNSAFE_PATH`, `NOT_FOUND`, `INVALID_CONTENT`) is a
  terminal `ABORT: <diagnostic>` naming the error code when the envelope carries one, like the other
  operational failures of "Completion". This deliberately narrows the issue's "aborts the same
  way": a content-blocked abort may cost the issue a retry, an environment failure must not.
- **Correction stays inside the one-plan-file write boundary.** The step edits only the generated
  plan, which the `plan` entry already authorizes; it adds no runtime write, no Git operation and no
  second artifact.
- **Writing rule in `unattended-planning` "Completion" (decided by score).** One sentence next to
  the self-scan: name forbidden publication strings by description (for example "the co-author
  trailer", "an attribution footer", "an agent session link") and reword any literal the scan
  blocks. It costs nothing on interactive or translation runs; interactive publication still blocks
  high-confidence findings before its question, so no finished work is lost there.
- **Issue Buddy never publishes after a planner abort (decided by score, twice).** In Phase 4 of
  `src/tools/issue-buddy.md`, after any planner `ABORT` other than the nested-spawn one (which keeps
  its rule), the parent still runs the existing snapshot and no-mutation verification; a detected
  mutation or ambiguous identity stays a pass stop. When exactly one verified new plan exists, the
  parent runs `publication-metadata` and its own `plan-publication.mjs scan` with
  `runState: "unattended"` on that plan, applies the existing "Ordered outcome mapping" to those
  helper results (item 4, `failed`, only for a helper-proven content fault such as a non-empty
  `data.blocking` or invalid metadata; otherwise item 5), keeps the plan as a preserved leftover and
  skips Phase 5. No new plan means item 5 with no leftover. The abort text itself never decides the
  outcome: it comes from a delegated run fed by third-party issue text, and item 4 requires origin
  proof from operation, phase and safe details. This keeps today's item 4 retry accounting for a
  plan-then-abort case (for example a failed final lint) and closes today's gap in which an aborted
  plan could reach `publish --apply`.
- **The preserved plan stays listable.** Issue Buddy's planning-worktree rule keeps a worktree only
  "unless Phase 5 preserves a plan in it"; it becomes "unless Phase 4 or Phase 5 preserves a plan in
  it", so the worktree moves to `aborted` with reason `plan-preserved` and the next pass's Phase 1
  inventory lists it.
- **Inline quoting rule.** The scan call passes one JSON object on standard input through a quoted
  here-document (`<<'JSON'`), stated in the step itself: `plan-publication`, whose "Content check"
  carries the same rule for interactive runs, is not guaranteed to be loaded at this point.

## Affected files

| File | Description |
|---|---|
| `src/shared/unattended-planning.md` | "Completion" step 1: `plan`-entry-only self-scan, correction round, rescan, capped abort line and the writing rule; new abort reason. |
| `src/shared/plan-publication.md` | "Content check": one pointer line that the unattended `plan` entry scans its own plan before completion, so a plan-content `SCAN_BLOCKED` in a later publish is a rare integrity signal. |
| `src/tools/issue-buddy.md` | Phase 4: after a planner `ABORT`, keep the no-mutation verification, classify with the parent's own `publication-metadata` and `scan` results, preserve the plan and skip Phase 5; allow the one extra `scan` call beside "Call only `publication-metadata`". Planning-worktree rule: "unless Phase 4 or Phase 5 preserves a plan in it". Possibly its `contextBudget:` line. |
| `test/plan-publication.test.mjs` | Attribution test: the observed shape (a list bullet with the trailer key and its colon inside a code span) added to the blocking loop and its descriptive rewording added to the harmless loop, built with the file's existing `cat(...)` split helper. |
| `test/unattended-planning-contract.test.mjs` | Register the new abort reason in the fail-closed inventory; pin the self-scan sentence in step 1, its `plan`-entry scope, its position before the step 2 metadata call, the one-round bound and the capped abort line, naming the invariant. |
| `test/issue-buddy-contract.test.mjs` | Pin the Phase 4 planner-abort path (verification kept, parent-run helper classification, Phase 5 skipped) and update the pinned planning-worktree literal to name Phase 4, with the invariant "a plan preserved after a planner abort is classified by the parent's own helpers and stays listable by Phase 1". |
| `docs/developer-guide/plan-conventions.md` | Unattended completion paragraph: the self-scan before the metadata check, the new abort and the Issue Buddy stop. |

## Implementation details

### Approach

1. In `src/shared/unattended-planning.md`, "Completion", extend step 1 after "run the final
   mechanical plan-lint": for the `plan` entry only, run
   `node <skill-root>/scripts/plan-publication.mjs scan` with
   `{cwd: <retained verified EXECUTION_ROOT>, runState: "unattended", planFile: <plan path relative to EXECUTION_ROOT>}`
   as one JSON object on standard input through a quoted here-document (`<<'JSON'`).
2. In the same step, state the outcomes in as few sentences as the rule allows:
   - empty `data.blocking`: continue with step 2;
   - non-empty `data.blocking`: read all listed lines first (or edit bottom-up), reword each once
     per the writing rule, rerun step 1's formatting and final lint, and scan again;
   - still non-empty after the rescan: return
     `ABORT: unattended plan content blocked: <id>, <id>` with the remaining ids in `data.blocking`
     order, at most 20 then `(+<k> more)`; never the matched value or plan text;
   - nonzero exit, unparseable envelope or `ok: false`: terminal `ABORT: <diagnostic>` with the
     error code when the envelope carries one.
3. Add the writing rule as one sentence in that step.
4. In `src/shared/plan-publication.md`, "Content check", add one line: the unattended `plan` entry
   runs this `scan` with `runState` `unattended` on its own plan before completion
   (`unattended-planning`), so a plan-content `SCAN_BLOCKED` in a later publish is a rare integrity
   signal. Keep the scan's classes and strictness unchanged.
5. In `src/tools/issue-buddy.md`, Phase 4, next to "Require terminal `DONE` or `ABORT`", state
   the planner-abort path: the delegated orchestrator relays the planner's terminal line verbatim;
   the snapshot and no-mutation verification still run; with exactly one verified new plan the
   parent runs `publication-metadata` and `plan-publication.mjs scan` (`runState: "unattended"`,
   ids only) and classifies through the existing ordered mapping; the plan is preserved and Phase 5
   is skipped; no plan means item 5. Reword "Call only `plan-lint.mjs publication-metadata`" so it
   admits this one `scan` call on the abort path. In the planning-worktree rule, replace "unless
   Phase 5 preserves a plan in it" with "unless Phase 4 or Phase 5 preserves a plan in it". Leave the
   nested-spawn rule, the "Ordered outcome mapping" items and Phase 5 unchanged.
6. Update the unattended completion paragraph of `docs/developer-guide/plan-conventions.md`.
7. Add the tests listed under "Affected files".
8. Run `node build.mjs` and read the `Always-loaded core (lines/budget)` report. `plan.md` and
   `plan-review.md` load `unattended-planning` through a `lazy-include`, so their eager cores are not
   expected to grow; `issue-buddy.md` grows by a few lines, so set its `contextBudget:` only
   if the report shows the guard needs it.
9. Run `pnpm eval build-context verify` and `pnpm eval next-steps verify` read-only and record in
   the pull request which suites show evidence debt for the edited sources; no evidence is recorded
   in this change.

### Edge cases

- A literal the plan seems to need: the writing rule says to describe it; if one slips through,
  the correction round rewords it, and a line that cannot be reworded ends in the content-blocked
  abort instead of a Phase 5 failure.
- The scan reports a class other than `attribution` (for example an absolute local path or a
  credential-style assignment, which also block under unattended strictness): the same correction
  round applies.
- A rewording changes the line count: ids carry line numbers, so all listed lines are read before
  the first edit, or edited bottom-up.
- The correction introduces a new finding on another line: the rescan catches it and the run
  aborts with that id; there is no third scan.
- The correction breaks formatting or lint-relevant structure: the rerun of step 1 catches it, and
  a failed final lint keeps its existing terminal abort.
- The deep review edits the plan after the planner's own review: the `plan` entry's Completion runs
  after that sub-run returns and scans the final file; the review entries do not scan.
- Many findings (for example pasted log output): the abort line lists at most 20 ids, then the
  remaining count.
- A forbidden phrase split across a wrapped Requirement line: see the Non-goal; Phase 5 still
  catches it through the derived body.
- The abort line must not leak content: ids carry class, field and line only.
- A finding inside the "Decided by score" machine block: reword only within a JSON string value,
  keeping the JSON valid and every label and score unchanged; if that is impossible, end in the
  content-blocked abort instead of editing the block's structure.
- A planner abort that left no plan (an envelope, configuration or hidden-mode abort): Issue Buddy
  records item 5, preserves nothing and withdraws the worktree normally.
- A planner abort with a plan whose parent-run helpers find no content fault (for example an
  operational abort after a clean scan): item 5; the plan is still preserved and never published.

## Acceptance criteria

- [ ] `src/shared/unattended-planning.md` "Completion" step 1 names the `plan-publication.mjs scan`
  call for the `plan` entry only, with `runState: "unattended"` and the plan file relative to
  `EXECUTION_ROOT`, after the final plan-lint and before the step 2 `publication-metadata` call, and
  the existing "step 2" references are unchanged.
- [ ] The step reads `data.blocking`, allows exactly one correction round that reruns formatting and
  the final lint before a rescan, and returns `ABORT: unattended plan content blocked: <id>, <id>`
  with finding ids only, in `data.blocking` order and capped at 20 plus a remaining count, when
  blocking findings remain.
- [ ] A scan error envelope, nonzero exit or unparseable output is a terminal
  `ABORT: <diagnostic>`, naming the error code when the envelope carries one.
- [ ] The descriptive-naming rule is stated once, in `unattended-planning` "Completion", with no
  second copy elsewhere under `src/`.
- [ ] `src/shared/plan-publication.md` "Content check" carries the one-line pointer, and the scan's
  patterns and strictness in `src/scripts/` are unchanged.
- [ ] `src/tools/issue-buddy.md` Phase 4, after any planner `ABORT` other than the nested-spawn one,
  keeps the no-mutation verification, classifies a present plan only from the parent's own
  `publication-metadata` and `scan` results through the existing ordered mapping, preserves that
  plan, and never reaches Phase 5; the planning-worktree rule names Phase 4, so the worktree moves
  to `aborted` with reason `plan-preserved`.
- [ ] `test/plan-publication.test.mjs` shows a blocking `attribution` finding for the code-span
  bullet with the trailer key and its colon, and none for its descriptive rewording.
- [ ] `test/unattended-planning-contract.test.mjs` pins the self-scan, its scope, its position, its
  bound and its abort line, and its fail-closed abort inventory includes
  `ABORT: unattended plan content blocked`; `test/issue-buddy-contract.test.mjs` pins the Phase 4
  abort path and the amended planning-worktree rule; each test names the invariant it protects.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass.

## Validation plan

- `pnpm agent:check`, then `pnpm test`, then `node build.mjs`, then `pnpm test:distribution`, in
  CI's order.
- Targeted runs while iterating: `node --test test/plan-publication.test.mjs`,
  `node --test test/unattended-planning-contract.test.mjs` and
  `node --test test/issue-buddy-contract.test.mjs`.
- Read the `Always-loaded core (lines/budget)` report of `node build.mjs` for `plan`,
  `plan-review` and `issue-buddy`.
- `pnpm eval build-context verify` and `pnpm eval next-steps verify` (read-only) to report evidence
  debt.

## Assumptions and open points

- Verified: the source "Completion" has numbered steps, with `publication-metadata` as step 2, and
  prose plus test literals refer to "step 2"
  (`src/shared/unattended-planning.md`, `test/unattended-planning-contract.test.mjs`).
- Verified: `scan` exits 0 with `ok: true` when it finds something; only `publish` raises
  `SCAN_BLOCKED` (`src/scripts/plan-publication-core.mjs`).
- Verified: on a plan source, autopilot records any plan-stage `ABORT` as a `plan-not-approved`
  blocker whose summary is its diagnostic (`src/tools/autopilot.md`); that path is unaffected
  because the review entries do not scan. On an issue source, autopilot runs Issue Buddy and stops
  on its verdict, so the Phase 4 stop above governs it.
- Verified: Issue Buddy Phase 4 maps only `ABORT: NESTED_SPAWN_UNAVAILABLE` today; for any other
  planner `ABORT` it goes on to verify the new plan file and run `publication-metadata`
  (`src/tools/issue-buddy.md`).
- Verified: the existing attribution test already covers the trailer key with and without its
  colon through `scanText`, the function `scan` applies to each line; the new entries add the
  observed code-span bullet shape there rather than a second `run('scan', …)` test, which would add
  no branch (`test/plan-publication.test.mjs`).
- Deviation from the issue: the prose-contract test lives in
  `test/unattended-planning-contract.test.mjs`, not `test/workflow-contracts.test.mjs`, because that
  file already owns the Completion and abort-inventory tests (decided by score).
- Assumption: no behavioural eval suite config names `unattended-planning.md` directly;
  `build-context` seeds every tool and script and is the most likely suite to show debt. The
  read-only `verify` runs settle it.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->
```json
[
  {"site":"S-CLR","question":"How should Issue Buddy handle the planner's new content-blocked abort?","options":["Item-4 mapping only","No Issue Buddy change","Phase 4 abort stop"],"escape":[],"stop":null,"scores":[{"label":"Item-4 mapping only","score":4,"reason":"It records the content-blocked abort as failed but never states that Phase 4 stops before Phase 5, so a plan aborted for another reason can still reach publish."},{"label":"No Issue Buddy change","score":2,"reason":"It leaves an aborted plan verifiable and publishable, caught at best by a later scan refusal after extra work."},{"label":"Phase 4 abort stop","score":9,"reason":"One Phase 4 sentence stops every planner abort before Phase 5, preserves the plan and maps each reason to item 4 or item 5; its edge over item-4 mapping is that it also closes the publish path for non-content aborts."}]},
  {"site":"S-BAT","question":"Which Completion entries run the self-scan?","options":["Plan entry only","Plan and file delegation","All three entries"],"escape":[],"stop":null,"scores":[{"label":"Plan entry only","score":9,"reason":"Only the plan entry's output reaches the Phase 5 publish scan and its Completion runs after the deep review, so review edits are scanned too; its edge is that it needs no pass-through rule for a review sub-run abort."},{"label":"Plan and file delegation","score":4,"reason":"It duplicates the scan the planner's own Completion already runs on the same file and adds a pass-through rule for no extra protection."},{"label":"All three entries","score":2,"reason":"The autopilot file review covers existing plans never published through the plan-publication helper, so unattended strictness would abort runs over content that never needed to pass the publish check."}]},
  {"site":"S-CLR","question":"Which fragment owns the descriptive-naming writing rule?","options":["Unattended Completion","Plan contract","Publication content check"],"escape":[],"stop":null,"scores":[{"label":"Unattended Completion","score":8,"reason":"This fragment owns the self-scan and its correction round, where the reword-any-blocked-literal half applies, and it costs nothing on interactive or translation runs."},{"label":"Plan contract","score":6,"reason":"It reaches every plan writer but covers artifact structure rather than publishability, and it adds length to every workflow that writes or translates a plan."},{"label":"Publication content check","score":2,"reason":"It loads only during interactive publication, after the plan is written, and states that the script owns the finding classes, so a naming rule there comes too late and contradicts its own stance."}]},
  {"site":"S-CLR","question":"Where does the new prose-contract test for the Completion self-scan step live?","options":["Unattended planning contract test","Workflow contracts test"],"escape":[],"stop":null,"scores":[{"label":"Unattended planning contract test","score":8,"reason":"This file already owns the unattended-planning prose tests, including the Completion literal and the fail-closed abort inventory, so one contract stays in one place at the cost of a recorded deviation from the issue's file name."},{"label":"Workflow contracts test","score":5,"reason":"It holds many prose contracts and would satisfy the criterion literally, but it has no unattended-planning tests and would split the Completion step's coverage across two files."}]},
  {"site":"S-CLR","question":"How is the self-scan laid out in Completion?","options":["New numbered step","Extend step 1"],"escape":[],"stop":null,"scores":[{"label":"New numbered step","score":5,"reason":"A separate step reads clearly but forces renumbering, four rewritten step-2 references and changed pinned test literals, churn the scan itself does not need."},{"label":"Extend step 1","score":8,"reason":"Step 1 already covers formatting and the final lint that the correction round repeats, so the loop stays inside the step it reruns while the step-2 references and test literals stay valid."}]},
  {"site":"S-DEC","question":"How does Issue Buddy classify a planner abort for the outcome mapping?","options":["Parent-verified classification","Explicit reason list","Accept item-5 shift"],"escape":[],"stop":null,"scores":[{"label":"Parent-verified classification","score":9,"reason":"It keeps today's item 4 retry accounting for plan-then-abort cases and bases the outcome on parent-run helper results instead of child free text, meeting item 4's origin-proof requirement; that is its edge over the reason list, at the cost of one or two read-only helper calls."},{"label":"Explicit reason list","score":4,"reason":"It restores the failed-lint retry path, but the outcome depends on matching free text from a delegated run fed by third-party issue text, and the list drifts as abort reasons are added."},{"label":"Accept item-5 shift","score":2,"reason":"It turns today's item 4 outcomes into pass stops with no retry accounting, so one issue that never succeeds can stall every later pass."}]}
]
```
<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area | Critical | Important | Note |
|---|---:|---:|---:|
| Architecture | 0 | 1 | 2 |
| Security | 0 | 1 | 0 |
| Data protection | 0 | 0 | 1 |
| Error cases | 0 | 5 | 6 |
| Testability | 0 | 0 | 4 |
| Scope | 0 | 1 | 2 |
| Maintainability | 0 | 0 | 4 |

### Findings

- Gap analysis and internal review (2026-11-26), all incorporated:
  - Scope, Important: scanning in all three Completion entries would add a new gate on autopilot
    plan sources that are never published through the helper; decided by score as `plan` entry
    only.
  - Error cases, Important: a scanning review sub-run's abort could be resumed or retried under the
    completion protocol; resolved by the `plan`-entry-only scope, which needs no pass-through rule.
  - Error cases, Important (twice): Issue Buddy Phase 4 continues after a non-spawn planner abort, so
    an aborted plan could reach Phase 5; decided by score as the Phase 4 abort stop with the item 4
    / item 5 mapping.
  - Scope, Note (twice): derived-text refusals and a phrase split across a wrapped Requirement line
    stay Phase 5 concerns; stated as a non-goal and an edge case.
  - Error cases, Note: the correction round now reruns step 1 in full and reads all listed lines
    before editing, since ids carry line numbers.
  - Data protection, Note: the abort line is capped at 20 ids plus a remaining count.
  - Error cases, Note: the reason for stating the here-document rule inline was corrected; the
    fragment is not guaranteed to be loaded at this point.
  - Testability, Note (three): the abort line format is fixed; the unit test extends the existing
    attribution loops instead of duplicating an existing `scan` operation test; the error-code
    criterion now applies only when the envelope carries one.
  - Maintainability, Note (four): the schema description was corrected; step references and Affected
    files follow the scored decisions; the writing rule was shortened to its effective half; the
    pointer line in `plan-publication` is kept because the issue asks for it, without a second
    rationale.
  - Architecture, Note (two): the autopilot assumption is limited to the plan-source path; the
    issue-source path follows the Issue Buddy stop.
- Deep plan review (2026-11-26), all incorporated:
  - Error cases, Important: the first Phase 4 stop skipped the parent's no-mutation verification on
    exactly the abnormal runs; the verification now always runs and only Phase 5 is skipped, and an
    abort without a plan preserves nothing.
  - Architecture, Important: a plan kept by Phase 4 would vanish with its worktree, since only
    Phase 5 preserved plans; the planning-worktree rule now names Phase 4 as well.
  - Error cases, Important: mapping every non-content abort to item 5 would turn today's item 4
    outcomes (for example a failed final lint with a plan) into repeated pass stops; decided by
    score as parent-verified classification through the existing ordered mapping.
  - Security, Important: classifying from the child's free-text abort reason lacks item 4's origin
    proof; the parent now runs its own read-only `scan` and `publication-metadata`.
  - Error cases, Note: rewording inside the "Decided by score" block must keep its JSON, labels and
    scores intact; added as an edge case.
  - Error cases, Note: the delegated orchestrator relays the planner's terminal line verbatim;
    added to the Phase 4 step.
  - Testability, Note: the Issue Buddy contract test now also pins the amended planning-worktree
    rule, with the invariant named.

## Open points

- No open points.
