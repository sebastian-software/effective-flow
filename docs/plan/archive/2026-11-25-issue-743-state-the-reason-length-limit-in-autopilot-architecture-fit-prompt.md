# State the reason length limit in autopilot architecture-fit prompt

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #743

## Requirement

Step 2 "Architecture fit" of `autopilot`'s pre-delivery steps (`src/tools/autopilot.md:253-273`)
asks one read-only leaf to return
`{"score": <integer>, "reason": "<one sentence>", "sources": ["<repository-relative path>"]}`. The
prompt caps `sources` at 20 ("listing at most 20 sources it used") but states no limit for
`reason`. `fitRecordOperation` in `src/scripts/autopilot-core.mjs:1062-1085` validates `reason`
with `text(input.reason, 'reason', LIMITS.reason)` (`:1072`), and `LIMITS.reason` is `300`
(`:218-226`, exported). A correct one-sentence rationale longer than 300 characters is therefore
rejected by `fit-record`, although the leaf was never told about the limit. The rejection uses up
the step's single retry; if the retry also fails, the step records `unavailable: true` and the
draft pull request's appendix reads "Architecture fit: not assessed — scoring unavailable" even
though a valid score existed. Every autopilot run reaches this prompt.

Goal: the architecture-fit prompt states the same `reason` limit that `fit-record` enforces, and a
contract test fails as soon as the prompt's number and `LIMITS.reason` disagree.

Workflow rationale: Bugfix. Shipped prompt text (`src/**/*.md` is product source per `AGENTS.md`)
causes avoidable runtime rejections and lost fit scores; the fix corrects that behaviour without a
new capability and without changing the helper.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #743
**Original outcome:** The architecture-fit prompt in `src/tools/autopilot.md` states the 300-character limit for `reason`; a test fails when the prompt and `LIMITS.reason` stop agreeing; `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** one in-line wording change in one tool prompt; one contract test that reads the number from the prompt and compares it with the exported core constant; no helper change.
**Continuation decision:** none

## Architecture decisions

- Fix the instruction the leaf reads, not the helper. Rejecting an over-long `reason` is the
  helper's correct fail-closed behaviour, and the same `LIMITS.reason` also bounds scored-decision
  option reasons (`src/scripts/autopilot-core.mjs:357`); raising or removing it would widen a shared
  contract to cover a prompt gap.
- Change the existing line in place instead of adding a sentence. The change then costs no line in
  the always-loaded core of `autopilot` (`contextBudget: 502` stays untouched, as the issue asks),
  the spawn-site marker `<!-- spawn-site:autopilot/architecture-fit -->` stays at line 273, and the
  line citation `src/tools/autopilot.md:273` in
  `docs/developer-guide/subagent-progress-coverage.md:108` stays valid.
- Bind the prompt to the code with a test rather than a build-time substitution. A placeholder
  rendered from `LIMITS` would need new build machinery for one number; a test that reads both
  sides catches drift with no product change (`AGENTS.md` "Writing prompt text", point 5).
- Place the test in `test/scored-decisions-contract.test.mjs`, beside the existing
  architecture-fit pins (decided by score; the issue suggested `test/workflow-contracts.test.mjs`,
  but its acceptance criterion names no file). That file already holds every pin of step 2 — the
  20-source cap, the `unavailable: true` fallback and the spawn-marker adjacency
  (`test/scored-decisions-contract.test.mjs:809-880`) — and already imports from
  `../src/scripts/autopilot-core.mjs` (`:13-18`), so `LIMITS` is one added name and a later edit of
  step 2 finds all its pins in one place.

## Affected files

| File                                      | Description                                                                                                                                                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/autopilot.md`                  | In step 2 "Architecture fit", change the `reason` value in the returned JSON shape (line 268) from `"<one sentence>"` to `"<one sentence, at most 300 characters>"`; no other line changes.                                             |
| `test/scored-decisions-contract.test.mjs` | Add `LIMITS` to the existing import from `../src/scripts/autopilot-core.mjs`; add one test, preceded by an `// Invariant:` comment, that reads the `reason` limit from the architecture-fit step and asserts it equals `LIMITS.reason`. |

## Implementation details

### Approach

1. In `src/tools/autopilot.md`, edit only the JSON-shape line of step 2 so the `reason` placeholder
   reads `"<one sentence, at most 300 characters>"`. Keep the surrounding wording byte-identical,
   in particular the phrase `listing at most 20 sources it used`, the `{cwd, runId, unavailable:
true}` call and the line `"Architecture fit: not assessed — scoring unavailable". It is never a
blocker.` directly above the spawn-site marker: `test/scored-decisions-contract.test.mjs`
   (around lines 809-880) asserts these exact substrings, including
   `never a blocker.\n {3}<!-- spawn-site:autopilot/architecture-fit -->\n`.
2. Confirm the file's line count is unchanged, so `contextBudget: 502` needs no update and the
   spawn-site marker remains at line 273.
3. In `test/scored-decisions-contract.test.mjs`, add `LIMITS` to the existing import list from
   `../src/scripts/autopilot-core.mjs` (`:13-18`).
4. Add one test directly after the test "autopilot wires the delivery-state calls and reads fit
   sources from the delivery head" (`:809-880`), which is the file's last test, so the new test is
   appended at the end of the file, preceded by an `// Invariant:` comment
   that names the rule: the limit the architecture-fit prompt states for `reason` equals
   `LIMITS.reason` in `autopilot-core.mjs`. The test:
   - reads the raw source of `src/tools/autopilot.md` through the file's `tool('autopilot')`
     helper (`:344`) and isolates step 2, from the
     `**Architecture fit.**` heading up to the `<!-- spawn-site:autopilot/architecture-fit -->`
     marker, failing with a clear message if either anchor is missing;
   - normalizes that slice with the file's existing `flat()` helper (`:343`), so the pin holds the
     wording rather than the line layout, as the neighbouring step 2 test does;
   - extracts the number from the `"reason": "<one sentence, at most N characters>"` placeholder
     in the normalized slice with a regular expression and requires exactly one such match;
   - asserts that the extracted number, converted to a number, equals `LIMITS.reason`.
5. Run the validation plan below.

### Edge cases

- **Limit removed from the prompt:** the regular expression finds no match and the test fails
  instead of passing vacuously.
- **`LIMITS.reason` changed in the core only:** the number comparison fails, naming both values.
- **Prompt number changed only:** same failure in the other direction.
- **Formatter rewraps the edited line:** the line grows from 97 to about 121 columns, beyond
  oxfmt's default width of 100 (the file already has 17 longer lines). If `pnpm format` or
  `pnpm agent:check` moves text onto a new line, the line count changes; then re-check the
  spawn-site marker line and the `:273` citation. The test is unaffected, because it matches the
  normalized slice, not the raw line layout.
- **Length unit:** `text()` counts `value.length`, i.e. UTF-16 code units, not code points or bytes.
  "Characters" is the right instruction for a one-sentence rationale; a reason in German with
  umlauts still counts one unit per letter. No change to the counting is planned.

## Acceptance criteria

- [ ] `src/tools/autopilot.md` step 2 "Architecture fit" contains exactly one `reason` placeholder
      that states `at most 300 characters`, and the file's line count and `contextBudget: 502` are
      unchanged.
- [ ] `test/scored-decisions-contract.test.mjs` contains a test, preceded by an `// Invariant:` comment
      naming the prompt-to-`LIMITS.reason` agreement, that passes on the changed tree and fails when
      either the prompt's number or `LIMITS.reason` is changed to a different value, or when the
      limit phrase is removed from the prompt (checked once locally by temporary edits that are
      reverted before committing).
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass, in that
      order. The one tolerated exception (decided by score): a failure whose error message is
      identical to one reproduced by the same command on the unchanged base `ea0c5b94` before the
      change — such as the reported `iterate` context-budget error — counts as pre-existing, is not
      repaired here and is recorded in the pull request body; any new or changed failure fails this
      criterion. The compared unit is the failing check's error message (for the build, the guard's
      context-budget line; for a test, its name and assertion message), never the whole output, so
      durations, test counts, timings and absolute paths are ignored. The same pre-existing failure
      may appear in more than one of the four commands (`test/context-budget.test.mjs` and the
      distribution suite's build also check budgets); each occurrence is recorded.

## Validation plan

- Before any change, run the four CI commands once on the unchanged base and keep each failing
  check's error message (build guard line, or test name plus assertion message) verbatim, so a
  pre-existing failure can be told apart from one this change causes.
- `node --test test/scored-decisions-contract.test.mjs test/autopilot-core.test.mjs`
  as the fast loop after each change.
- Mutation check of the new test (not committed): temporarily set the prompt's number to `299`,
  then restore it and temporarily set `LIMITS.reason` to `301`, then restore it and temporarily
  delete the `, at most 300 characters` phrase; the new test must fail in all three cases and pass
  after each restore.
- `wc -l src/tools/autopilot.md` before and after the change, plus a check that line 273 is still
  the spawn-site marker.
- `pnpm eval build-context verify` (read-only) shows the expected freshness debt with integrity
  still green.
- CI order from `AGENTS.md`: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  `pnpm test:distribution`.

## Assumptions and open points

- Assumption: oxfmt keeps Markdown prose lines unwrapped (prose-wrap "preserve"), so the longer line
  is not reflowed; `pnpm agent:check` confirms this, and the edge case above covers the opposite.
- Assumption (unverified baseline): a read-only examination reported that `node build.mjs` on this
  base (`ea0c5b94`, equal to `origin/develop` at planning time) stopped with a context-budget error
  for `iterate` (1872 lines, budget 1871), unrelated to `autopilot`; PR #741, the base's last
  commit, passed CI on its own head, and CI for the merged commit was still running. The acceptance
  criteria tolerate only an identical, reproduced baseline failure; the `iterate` budget is not
  changed in this plan.
- Eval evidence: the `build-context` suite seeds every `src/tools/*` and `src/scripts/*` file
  (`evals/build-context/suite.config.mjs:13-23`), so editing `src/tools/autopilot.md` creates
  report-mode freshness debt for `build-context` only. Per
  `docs/adr/pragmatic-test-release-policy.md` that is post-merge debt that needs no new model run;
  the pull request body names it. The test file is outside every suite's load set.
- Residual risk: a model does not count characters exactly, so stating the limit makes an
  over-long `reason` less likely but does not rule it out. `fit-record`'s fail-closed rejection,
  the existing single retry and the `unavailable: true` fallback stay the backstop; feeding the
  rejection message back into the retry is not part of this plan.
- Out of scope, noted for a possible follow-up: the scored-decision leaf brief in
  `src/shared/scored-decisions.md` asks for `"reason":"<one sentence>"` without a limit, while
  `decision-classify` bounds those reasons by the same `LIMITS.reason`; and the `sources` cap of 20
  in the same prompt is pinned by a hard-coded string in `test/scored-decisions-contract.test.mjs`
  rather than compared with `LIMITS.sources`. Issue #743 covers only the architecture-fit `reason`.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[{"site": "S-BAT", "question": "How should the acceptance criterion \"`node build.mjs` passes\" treat a possible pre-existing `iterate` context-budget failure (1872 lines, budget 1871) on the unchanged base?", "options": ["Keep the criterion strict; a red base blocks delivery until a separate fix lands", "Allow the one-line iterate contextBudget correction as a scoped prerequisite", "Accept only the identical reproduced pre-existing failure, recorded in the PR", "Decide later"], "escape": ["Decide later"], "scores": [{"label": "Keep the criterion strict; a red base blocks delivery until a separate fix lands", "score": 5, "reason": "Keeps the gate honest, but an unattended fix run would stop on a failure in iterate that this change cannot cause. The failure is also unverified: #741 changed iterate.md and passed CI on its own head."}, {"label": "Allow the one-line iterate contextBudget correction as a scoped prerequisite", "score": 4, "reason": "The edit is trivial, but it widens scope into iterate.md, which the iterate and merge-gate eval suites load, so it adds evidence debt in both. It could also clash with a separate fix of the same base problem."}, {"label": "Accept only the identical reproduced pre-existing failure, recorded in the PR", "score": 8, "reason": "Matches the plan's assumption to report the failure rather than repair it, and keeps autopilot moving. Tolerance is limited to the exact message reproduced on ea0c5b94, so any new or changed build failure still blocks."}]}, {"site": "S-BAT", "question": "Which test file should hold the new prompt-to-`LIMITS.reason` test?", "options": ["workflow-contracts.test.mjs as the issue names, cross-referencing the step 2 pins", "scored-decisions-contract.test.mjs beside the existing step 2 pins", "Decide later"], "escape": ["Decide later"], "scores": [{"label": "workflow-contracts.test.mjs as the issue names, cross-referencing the step 2 pins", "score": 5, "reason": "This matches the issue's suggestion and the file's source()/prose() helpers would work. But it splits the step 2 pins across two files, needs a new autopilot-core import in a 28.9k-line file, and its autopilot tests cover issue-source claims, not architecture fit."}, {"label": "scored-decisions-contract.test.mjs beside the existing step 2 pins", "score": 8, "reason": "All architecture-fit step 2 pins are already here (20-source cap, unavailable fallback, spawn marker), and the file already imports from autopilot-core.mjs, so LIMITS is a one-name addition. The acceptance criterion does not name a file. The catch: the file header scopes it to scored-decisions.md."}]}]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    4 |

### Findings

- Maintainability, Note: the first placement of the new test, next to the issue-source claim tests
  in `test/workflow-contracts.test.mjs`, would have put it in an unrelated section, away from the
  existing architecture-fit pins. Incorporated: the test now sits directly after the step 2 test in
  `test/scored-decisions-contract.test.mjs` (see "Decided by score").
- Planning-ladder re-check of the sections the two decisions changed (trigger: changed acceptance
  criterion and architecture decision): incorporated an Important testability precision — the
  build-failure tolerance compares the failing check's error message, not whole command output,
  which could never match for `pnpm test` — and a Note correcting the step 2 test's line range to
  `:809-880` and stating that the new test is appended at the end of the file.
- Deep plan review, Maintainability, Note: the assumption that no eval suite loads
  `src/tools/autopilot.md` was wrong; `build-context` seeds every tool and script source.
  Incorporated: the assumption now records the `build-context` freshness debt, its post-merge
  handling and its disclosure in the pull request body, plus a read-only `verify` step.
- Deep plan review, Maintainability, Note: the `fitRecordOperation` citation started one line late.
  Incorporated: corrected to `:1062-1085`.

## Open points

- No open points.
