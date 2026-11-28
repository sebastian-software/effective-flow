# merge-gate: drop a failing Associated plan line at Entry instead of aborting the run

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #818

## Requirement

The delegated merge-gate run aborts when its optional `Associated plan:` line fails the plan
check, although the line only orders next-step suggestions after a merge.

Two rules handle the same failure differently today:

- The caller rule in `src/tools/merge-gate.md` ("Dispatching the delegated run", lines 287-297)
  resolves the line through `plan-reference-resolve` before every dispatch. It passes only on
  `resolved` with `data.exact` true inside `<plan.dir>/` or `<plan.dir>/archive/`, and otherwise
  drops the line, "so it never aborts the gate; "Entry" repeats it".
- Entry step 2 in `src/shared/merge-gate-delegated-run.md` (lines 29-31) applies the same check
  by reference, but "a line failing it returns `ABORT unparseable input line`".

The caller text and the contract test comment at `test/workflow-contracts.test.mjs:5403-5406`
both describe Entry as a backstop that "never aborts a gate run". The Entry wording contradicts
that intent. When a line still fails at Entry (a plan moved or deleted between caller resolution
and Entry, or a caller that skipped its own check), the run has already loaded its contracts and
verified its roots. The caller does not re-dispatch on such an abort: it reports the abort,
deletes the wisdom file and ends the gate run (`src/tools/merge-gate.md:337-340`), so the user
has to start the whole gate again. The plan feeds only the merged-run candidate order in
`next-steps` and the `<plan-file>` fallback of the next-step block. Both already define the
no-plan case (`src/shared/next-steps.md:122-126`, `src/shared/merge-gate-delegated-run.md:1633-1635`).
Losing the plan costs one candidate, while aborting costs the whole gate run.

Goal: at Entry step 2, a line that fails the resolution check is dropped, recorded, and reported
in the Phase 6 report, and the run continues. A malformed or duplicated line still returns
`ABORT unparseable input line` through Entry step 1.

Workflow rationale: Bugfix. The shipped contract contradicts its own documented intent (caller
text and test comment), and the fix aligns Entry with it. It adds no capability. Per `AGENTS.md`,
`src/**/*.md` is shipped product source, so this is not a documentation change.

Out of scope: caller-side resolution of a plan that exists only on the pull-request head (#814).
Out of scope: any change to the caller rule in `src/tools/merge-gate.md`.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #818
**Original outcome:** A delegated merge-gate dispatch whose `Associated plan:` line fails resolution continues through the gate without the plan. The Phase 6 report names the dropped path and the reason. A malformed or duplicated line still returns `ABORT unparseable input line`. A contract test in `test/workflow-contracts.test.mjs` pins the drop rule.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** fresh baseline: wording change in Entry step 2, a wisdom-file record and a Phase 6 report bullet in `merge-gate-delegated-run.md`, plus contract-test updates
**Continuation decision:** none

## Architecture decisions

- **Drop, not documented fail-closed.** The issue offers two directions: drop the line, or keep
  the abort and document why. Dropping is chosen. The caller text already states the intent: "so
  it never aborts the gate". The test comment at `test/workflow-contracts.test.mjs:5403-5406`
  calls Entry's check a backstop that "never aborts a gate run". No ADR or developer guide
  records a fail-closed rationale for this line (grep over `docs/adr` and `docs/developer-guide`
  finds none). The line carries no authority: it never gates a merge, a push or a write. It only
  selects one next-step candidate, and the no-plan path is already defined downstream. A
  fail-closed abort here protects nothing that dropping exposes.
- **Malformed versus failing, stated in step 1** (decided by score, see "Decided by score").
  Entry step 1 keeps its generic "unknown, duplicated, malformed or missing line" abort, which
  already covers a duplicated `Associated plan:` line. Step 1 gains one separate sentence: an
  `Associated plan:` line is malformed only when its value is empty. Step 1 runs first and is
  where "malformed" is decided, so the boundary lives there and nowhere else. Every present,
  non-empty value reaches step 2, and one that fails the resolution check is dropped, whatever the
  check's outcome. It mirrors the caller rule, which drops on any failing outcome, a nonzero exit
  and `ok: false` included. An absolute or `..` value therefore drops through the check and is
  never malformed.
- **The drop is recorded in the wisdom file** (decided by score). Phase 6 may run in a later
  dispatch than the one whose Entry dropped the line, for example after a `BLOCKED-USER` return. The wisdom file
  already carries entry-time facts across re-dispatches to Phase 6: caller limits, entry-notice
  lines and consumed answers (`merge-gate-delegated-run.md:498-506`). Entry steps 1 to 3 must
  still write nothing on an abort (line 79). The drop is therefore held in run state at step 2
  and appended to the wisdom file at one fixed point on every dispatch: when Entry step 4 applies
  "Run presence". On a first dispatch it goes into the write made before `register`
  (`merge-gate-delegated-run.md:127-130`); on a re-dispatch it is appended there, next to
  `refresh` (`:131-133`). That point lies after steps 1 to 3 and after step 4's mismatch abort.
  Phase 6 step 1 deletes the wisdom file before step 2 reports (`:1471-1475`), so step 1 carries
  the drop records into step 2, next to the consumed-answer count it already carries. The record is its own wisdom item, because the
  caller-limits item is pinned verbatim (`test/workflow-contracts.test.mjs:27272`) and
  `Caller limits:` is optional. Without the record, a drop in a dispatch that returned
  `BLOCKED-USER` would leave no trace once the caller drops the same line silently on the
  re-dispatch. The record does not guarantee a report of every drop: a drop is reported only
  where a delegated Phase 6 report reaches the caller (see "Endings without a delegated report"
  under Edge cases).
- **Caller-side and inline drops stay unreported** (decided by score). The caller drops a failing
  line silently before every dispatch and before an inline run, and an inline run skips "Entry"
  (`merge-gate-delegated-run.md:4-7`). This plan reports only the Entry drop. The issue scopes
  itself to what the delegated run does with a line that fails anyway, and #814 owns the caller
  side.
- **Single source of the check stays in `merge-gate.md`.** Entry keeps applying the caller's check
  by reference. The caller text is already correct and stays unchanged. This avoids touching the
  always-loaded core and its `contextBudget: 985`.

## Affected files

| File                                     | Description                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/merge-gate-delegated-run.md` | Entry step 1: one sentence stating that an `Associated plan:` line is malformed only when its value is empty. Entry step 2: drop a failing `Associated plan:` line, hold the reason, continue. Entry step 4 ("Run presence"): append the held drop to the wisdom file. Wisdom accumulation: add the dropped-line record. Phase 6 step 1: carry the drop records into step 2. Phase 6 step 2 report: add a bullet for every carried drop. |
| `test/workflow-contracts.test.mjs`       | Rewrite the test at lines 5381-5397 ("validates Associated plan at Entry and rejects anything else") to pin the step 1 malformed sentence, the drop rule, the wisdom-file record and the Phase 6 bullet. Update its invariant comment and title. Keep the step 1 pin at line 26911 green.                                                                                                                                                |

## Implementation details

### Approach

1. **Entry step 1** (`src/shared/merge-gate-delegated-run.md:15-26`). Add one separate sentence
   after the first sentence that ends in `ABORT unparseable input line`: an `Associated plan:` line
   is malformed only when its value is empty. Insert it after that phrase, so the
   200-character window of the pin at `test/workflow-contracts.test.mjs:26911` stays intact.
2. **Entry step 2** (`src/shared/merge-gate-delegated-run.md:29-31`). Replace "a line failing it
   returns `ABORT unparseable input line`" with a drop rule. The new text refers to the caller's
   check and does not list its outcomes again. It says:
   - a line that fails that check on any outcome is dropped, never aborted;
   - the run keeps the dropped path and the reason: the helper's `outcome` verbatim; for a
     `resolved` outcome that still fails, "not exact"; for an `ok: false` envelope, its error
     code; "nonzero exit" only when there is no envelope (launch failure, no output);
   - that dispatch continues without an associated plan.
     The step 2 text must not mention `ABORT unparseable input line` at all, not even in negated
     form, because the test of step 5 asserts its absence from that slice.
     Keep the sentence "Only that validated plan feeds the merged-run candidate order of
     `next-steps`" unchanged.
3. **Wisdom accumulation and write point** (`merge-gate-delegated-run.md`, list at lines 498-506,
   and "Run presence" at lines 127-133). Add one item of its own after the caller-limits item:
   every `Associated plan:` line Entry dropped, with its path and reason, appended when Entry step 4
   applies "Run presence": on a first dispatch in the write before `register`, on a re-dispatch
   next to `refresh`. Use the same append-only behaviour as the neighbouring items.
4. **Phase 6** (`merge-gate-delegated-run.md:1471-1483`). In step 1, carry the drop records into
   step 2 before the wisdom file is deleted, next to the consumed-answer count. In step 2, add one
   bullet after the entry-notice bullet: every carried `Associated plan:` drop, with its path and
   reason, stating that the dispatch that dropped it continued without the plan. The bullet is
   reported wherever Phase 6 step 2 reports.
5. **Contract test** (`test/workflow-contracts.test.mjs:5381-5397`). Rename the test so it
   describes the drop, for example "the delegated merge-gate run drops a failing Associated plan
   line at Entry and reports it". Replace the ABORT regex with assertions that:
   - Entry step 2 drops a line that fails the caller's check on any outcome, by reference to that
     check, and continues without the plan;
   - Entry step 1 carries the sentence that an `Associated plan:` line is malformed only when its
     value is empty;
   - the bounded slice between `2. **Roots.**` and `3. **Wisdom file.**` matches neither
     `ABORT unparseable input line` nor the outcome names `ambiguous`, `not-found`,
     `outside-plan-dir` and `UNSAFE_PATH`, asserted with `doesNotMatch` on that slice only,
     because step 1 in the same section still uses that abort;
   - "Run presence" appends the held drop, and the wisdom-file list carries the dropped-line record;
   - Phase 6 step 1 carries the drop records into step 2, and step 2 carries the dropped-line
     bullet;
   - the existing `ordered(... '2. **Roots.**', "the caller's `Associated plan:` check",
'3. **Wisdom file.**')` order still holds;
   - the validated-plan sentence still holds.
     Rewrite the invariant comment above the test (line 5380-5381): a failing line is dropped and
     reported, and only a malformed or duplicated line aborts through step 1. Keep the caller
     assertions at lines 5398-5409, which this plan does not change, but reword their comment at
     lines 5403-5406: the full criteria live once in the always-loaded core, and both the caller and
     Entry drop a failing line, so the comment no longer calls Entry's check strict.
6. **Step 1 coverage.** The step 1 pin at `test/workflow-contracts.test.mjs:26911` already ties
   "An unknown, duplicated, malformed or missing line" to `ABORT unparseable input line`. It stays
   unchanged; the new step 1 sentence is pinned by the test of step 5.
7. Run the CI order and the eval verify step from the validation plan.

### Component structure

Not relevant: prose contract and one contract test, no new module.

### State management

One new append-only wisdom-file record. It follows the existing rule that Entry steps 1 to 3
write nothing on an abort: the drop is held in run state until Entry step 4 applies "Run
presence", where it is appended on every dispatch. Phase 6 step 1 carries the records into step 2
before it deletes the wisdom file.

### API integration

Not relevant: no helper, CLI or forge call changes. `plan-reference-resolve` is used as today.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Plan deleted or moved between caller resolution and Entry.** Entry resolves `not-found`. The
  line is dropped and recorded, and the run continues.
- **Ambiguous reference or non-exact match.** Dropped, with `ambiguous` or, for a `resolved`
  outcome that still fails, "not exact" as reason. The helper returns `resolved` only inside
  `<plan.dir>/` or its archive; a path outside is its own `outside-plan-dir` outcome.
- **Path outside `<plan.dir>/`, absolute path, or unsafe state.** Dropped, with the helper's
  outcome or error code as reason. Never malformed, because step 1 calls only an empty value
  malformed.
- **Helper failure.** An `ok: false` envelope, which comes with a nonzero exit, is dropped with its
  error code as reason. A launch failure or a nonzero exit without an envelope is dropped with
  reason "nonzero exit". Both match the caller rule.
- **Duplicated `Associated plan:` line.** Still `ABORT unparseable input line` in step 1, as an
  Entry abort (`Entry abort: yes`).
- **Empty value after the label.** Malformed under the new step 1 sentence:
  `ABORT unparseable input line`.
- **Re-dispatch.** The caller resolves again before every dispatch. A later dispatch may carry a
  valid line again, and its validated plan is then used for the next-step block. Earlier drop
  records stay in the wisdom file and are all reported in Phase 6, each with its path and reason.
- **Later Entry abort in the same dispatch.** Any Entry abort, steps 1 to 5, ends the gate with
  the abort reason alone: the return carries `ABORT <reason>` and `Entry abort: yes`, and the
  caller reports only the abort (`src/tools/merge-gate.md:139`, `:337-340`). The dropped line is
  then irrelevant, and the plan promises no report of it. An abort in steps 1 to 3 writes nothing;
  a step 4 mismatch abort comes before the first wisdom-file write
  (`merge-gate-delegated-run.md:40-43`, `:127-130`).
- **Endings without a delegated report** (decided by score). A drop is reported only where a
  delegated Phase 6 report reaches the caller. Caller endings that delete the wisdom file without
  one leave a recorded drop unreported, in line with the caller-side decision: the caller's
  Phase 0 step 1 re-read ending the run after `BLOCKED-USER`, a restriction added while answering
  a relayed question, an invalid return from the `Relayed answer: none` dispatch, the T3
  report-and-stop path or a stop request after `SUSPENDED host-pr-watch`, and
  `ABORT nested-spawn-unavailable`, after which the caller runs inline
  (`src/tools/merge-gate.md:313-337`, `src/shared/host-pr-watch.md:150-167`).
- **Inline run.** A caller that runs the gate inline skips "Entry"
  (`merge-gate-delegated-run.md:4-7`); only the caller's own drop applies there, and this plan does
  not change it. Caller-side and inline drops stay unreported (decided by score).
- **Retrospective slot.** The `next-steps` T4 abort clause excludes Entry aborts. The example
  `unparseable input line` in `src/shared/next-steps.md:168` stays valid, because step 1 still
  returns it.

## Acceptance criteria

- [ ] Entry step 1 of `src/shared/merge-gate-delegated-run.md` states in one separate sentence that
      an `Associated plan:` line is malformed only when its value is empty.
- [ ] Entry step 2 drops an `Associated plan:` line that fails the caller's resolution check on any
      outcome, by reference to that check, and that dispatch continues without the plan. The step 2
      text no longer returns `ABORT unparseable input line` for that line.
- [ ] The wisdom-accumulation list carries a record of every dropped line with its path and reason,
      appended when Entry step 4 applies "Run presence". Phase 6 step 1 carries the records into
      step 2, and the Phase 6 report lists every carried drop with path and reason and states that the
      dispatch that dropped it continued without the plan.
- [ ] Entry step 1 still returns `ABORT unparseable input line` for a duplicated `Associated plan:`
      line, or one whose value is empty (malformed). The existing step 1 pin at
      `test/workflow-contracts.test.mjs:26911` passes unchanged.
- [ ] `src/tools/merge-gate.md` is unchanged.
- [ ] A contract test in `test/workflow-contracts.test.mjs` pins the step 1 sentence, the drop
      rule, the absence of the abort phrase and outcome names from the step 2 slice, the write point,
      the Phase 6 carry-over and bullet. It fails against the current Entry step 2 wording.
- [ ] The full CI order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
      `pnpm test:distribution`.

## Validation plan

- **Red first:** write the rewritten contract test before the prose change and confirm that it
  fails against the current Entry step 2 wording.
- **Unit tests:** `node --test test/workflow-contracts.test.mjs`, then the full `pnpm test`.
- **Full CI order:** `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- **Eval evidence:** run `pnpm eval merge-gate verify` (read-only). The `merge-gate` suite seeds
  `tools/merge-gate.md`, whose lazy-include closure contains `merge-gate-delegated-run.md`
  (`evals/merge-gate/suite.config.mjs:97`). Report the freshness debt in the pull request. Under
  `docs/adr/pragmatic-test-release-policy.md` no new model run is required for freshness alone.
- **Manual check:** read the built `dist/claude/effective-flow/shared/merge-gate-delegated-run.md`
  and confirm that Entry steps 1 and 2, the wisdom-file item and the Phase 6 bullet read as one
  consistent rule.

## Assumptions and open points

- Assumption: no helper change is needed. `plan-reference-resolve` already reports every outcome
  the drop reason names (`docs/developer-guide/build-system.md:1344-1348`).
- Assumption: the caller does not parse the Phase 6 report. `src/tools/merge-gate.md:134` treats it
  as a free-form outcome record, so a new bullet needs no caller change.
- Assumption: the user guide (`docs/user-guide/tools-deliver.md:1444-1447`) describes the line
  without the abort and needs no change.
- Assumption: editing `merge-gate-delegated-run.md` creates freshness debt in every eval suite
  whose load closure includes it, at least `merge-gate`. CI reports the debt without failing, and
  re-recording evidence is not part of this issue.
- Assumption: the dropped path is never read or executed. It comes from the caller's trusted
  control line, and wisdom content carries no routing authority
  (`merge-gate-delegated-run.md:26`).

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-BAT",
    "question": "Should a line the caller drops before dispatch, or before an inline run, also be reported in the final report?",
    "options": [
      "Keep caller-side drops unreported",
      "Caller reports its own drop",
      "Caller-supplied Dropped plan line"
    ],
    "escape": [],
    "stop": [],
    "scores": [
      {
        "label": "Keep caller-side drops unreported",
        "score": 8,
        "reason": "Issue #818 scopes itself to the delegated run and #814 owns caller-side resolution; this keeps the always-loaded core and its contextBudget 985 unchanged, provided the plan states plainly that caller-side and inline drops stay silent."
      },
      {
        "label": "Caller reports its own drop",
        "score": 5,
        "reason": "Closes the reporting gap for the common caller-side and inline case, but widens scope into the always-loaded core, overlaps #814 and adds a second report point."
      },
      {
        "label": "Caller-supplied Dropped plan line",
        "score": 3,
        "reason": "Adds new contract surface to the dispatch list and Entry step 1 for a suggestion-only field, still misses inline runs, and reaches beyond the issue scope."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Does the Entry drop of a failing Associated plan line need a wisdom-file record, or is the reporting dispatch run state enough?",
    "options": [
      "Run-state report only",
      "Wisdom item, final dispatch only",
      "Wisdom item, report every drop"
    ],
    "escape": [],
    "stop": [],
    "scores": [
      {
        "label": "Run-state report only",
        "score": 5,
        "reason": "Cheapest and enough for a single dispatch, but a drop in an earlier BLOCKED-USER dispatch followed by a silent caller drop on re-dispatch never reaches the final report, missing acceptance criterion 2."
      },
      {
        "label": "Wisdom item, final dispatch only",
        "score": 2,
        "reason": "Pays for a wisdom item and its timing rule while reporting only what the reporting dispatch run state already holds, so the record buys nothing."
      },
      {
        "label": "Wisdom item, report every drop",
        "score": 8,
        "reason": "Follows the existing wisdom-file pattern for entry-time facts across re-dispatches and alone guarantees the final report states every drop; its edge over run-state only is closing the BLOCKED-USER plus silent re-dispatch gap."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Where is the boundary between a malformed and a failing Associated plan value stated?",
    "options": [
      "Boundary in step 1",
      "Step 2 with back-reference",
      "Step 2 clause only"
    ],
    "escape": [],
    "stop": [],
    "scores": [
      {
        "label": "Boundary in step 1",
        "score": 8,
        "reason": "Step 1 runs first and decides malformed, so stating there that the line is malformed only when its value is empty is the one-owner statement AGENTS.md asks for; it needs its own pin and must sit as a separate sentence so the 200-character window of the pin at line 26911 stays intact."
      },
      {
        "label": "Step 2 with back-reference",
        "score": 5,
        "reason": "Closes the wording gap, but the abort decision stays in step 1 while the limiting rule lives later, and the back-reference adds text without moving the boundary."
      },
      {
        "label": "Step 2 clause only",
        "score": 3,
        "reason": "Entry runs in order, so step 1 can abort an absolute or .. value as malformed before step 2 is reached, leaving the ambiguity open."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "How does the plan treat gate endings where no delegated Phase 6 report reaches the caller, so a recorded drop is never reported?",
    "options": [
      "Document unreported endings",
      "Name drop in interim returns",
      "Correct reason text only",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "stop": [],
    "scores": [
      {
        "label": "Document unreported endings",
        "score": 8,
        "reason": "Consistent with the caller-side decision and issue scope at plan-text cost; states plainly that criterion 2 holds only where a Phase 6 report reaches the caller and fixes the over-strong guarantee wording."
      },
      {
        "label": "Name drop in interim returns",
        "score": 5,
        "reason": "The free-form done-so-far part would carry the drop through relayed-question and report-and-stop endings, but still misses the invalid none return and earlier-dispatch drops, and adds a rule for a suggestion-only line."
      },
      {
        "label": "Correct reason text only",
        "score": 4,
        "reason": "Fixes the overclaim but leaves the edge cases silent on endings that delete the wisdom file before Phase 6, so readers would assume every drop gets reported."
      }
    ]
  }
]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         2 |    3 |
| Testability     |        0 |         0 |    3 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    2 |

### Findings

Internal review:

- Architecture, Important: the wisdom-file record looked unnecessary, because every plan consumer
  sits in the reporting dispatch. It was made a decision and decided by score to keep the record:
  without it, a drop in a `BLOCKED-USER` dispatch leaves no trace once the caller drops the line
  silently on re-dispatch. Incorporated in Architecture decisions.
- Error cases, Important: the edge case for a later Entry abort promised a report on a step 4 or 5
  abort, which the return contract cannot deliver. Incorporated: every Entry abort ends the gate
  with its reason alone, and no drop report is promised for it.
- Error cases, Note: a failing `resolved` outcome would have named `resolved` as the drop reason.
  Incorporated: such a drop names "not exact".
- Testability, Note: the malformed boundary sat in step 2 while step 1 decides it first. It was
  made a decision and decided by score to state it in step 1. Incorporated in Approach step 1.
- Testability, Note: the negative assertion must be limited to the step 2 slice, because step 1
  still uses the same abort. Incorporated in Approach step 5.
- Maintainability, Note: the caller-assertion comment at `test/workflow-contracts.test.mjs:5403-5406`
  would go stale. Incorporated: Approach step 5 rewords it.
- The Phase 4 gap analysis was incorporated before this review. It corrected the inline-run edge
  case, pinned the write timing, removed the outcome enumeration from Entry step 2, corrected the
  abort-cost rationale and dropped the wrong `:27154` pin. Its open question on reporting
  caller-side drops was decided by score.

Deep review (2026-11-27):

- Error cases, Important: the write point "first wisdom-file write" was not fixed on a
  re-dispatch, and Phase 6 step 1 deletes the wisdom file before step 2 reports. Incorporated: the
  drop is appended when Entry step 4 applies "Run presence" on every dispatch, and Phase 6 step 1
  carries the records into step 2.
- Error cases, Note: the plan implied that every drop reaches the final report, which caller
  endings without a delegated Phase 6 report contradict. Decided by score: the edge case "Endings
  without a delegated report" documents them as unreported.
- Error cases, Note: the drop reason was ambiguous for an `ok: false` envelope with a nonzero exit.
  Incorporated: the envelope's error code wins, and "nonzero exit" applies only without one.
- Testability, Note: "without an outcome list" was not measurable, and "outside plan.dir" for a
  `resolved` outcome is unreachable. Incorporated: the step 2 slice is asserted free of the abort
  phrase and the outcome names, and the reason for a failing `resolved` outcome is "not exact".
- Maintainability, Note: an ambiguous acceptance-criterion wording, a dispatch identifier the
  record does not carry, and a stale step 1 line reference. Incorporated.

## Open points

- No open points.
