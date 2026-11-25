# Name the required check keys in the verification-evidence producer mapping

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #744

## Requirement

The "Producer mapping" section of `src/shared/verification-evidence.md` (lines 20–41) tells a
producer how to build the `checks` list for `verification-evidence evidence-build`. It names
`check`, `scope` and the optional `limitation` as keys, and it lists the outcome values (`passed`,
`failed`, `skipped`, `unavailable`, `baseline-failure`) and provenance values (`executed`,
`not-run`, `baseline-compared`), but it never names the JSON keys `outcome` and `provenance` those
values belong in. The helper `src/scripts/verification-evidence-core.mjs` accepts exactly the keys
`check`, `outcome`, `provenance`, `scope`, `limitation`, `comparison` (`CHECK_KEYS`, lines
314–321), requires `check`, `outcome`, `provenance`, `scope` (`REQUIRED_CHECK_FIELDS`, line 323)
and rejects every other key with `unknown-field` (lines 480–482). A producer that guesses a key
such as `status` wastes a helper call and a retry in every workflow that records verification
evidence (`fix`, `refactor`, `build` via `build-delegated-run`, `deliver`).

Goal: the owning fragment names the complete check-entry shape once, and a contract test keeps the
prompt aligned with the helper's required keys.

Workflow rationale: Bugfix (`effective-flow fix`). The shipped prompt is incomplete relative to the
helper contract it documents, which causes rejected helper calls at run time; the fix corrects
that defect without new functionality. Per `AGENTS.md`, `src/**/*.md` is shipped product source,
so this is not a Documentation change.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow, issue #744.
**Original outcome:** The verification-evidence producer mapping names `check`, `outcome`,
`provenance` and `scope` as the required check keys and `limitation` and `comparison` as optional
ones; a contract test fails when `outcome` or `provenance` disappears from it; the CI order passes.
**Last evaluated attempt:** None; fresh baseline.
**No-progress count:** 0
**Cumulative approach:** One sentence in the owning fragment plus one contract test; no runtime
script, tool source or budget change expected.
**Continuation decision:** None.

## Architecture decisions

- State the entry shape only in `src/shared/verification-evidence.md`, the fragment that owns the
  producer mapping (AGENTS.md "Writing prompt text", point 2). The consuming tools (`fix`,
  `refactor`, `deliver`, `pr`, `build-delegated-run`) keep their existing lazy pointers unchanged.
- Extend the section's existing intro sentence (fragment lines 22–23) instead of adding a second
  sentence that would restate `check`, `scope` and `limitation`. Only its opening clause "A
  producer maps only checks it observed in this run" is pinned by a test
  (`test/workflow-contracts.test.mjs`, around line 27867); the bullets that follow it are pinned as
  exact substrings (around lines 27868–27877) and stay byte-identical, and the intro keeps its
  closing colon as the lead-in to them.
- Describe `comparison` as conditional, not plainly optional: the helper requires it on a
  `baseline-failure` entry and rejects it on every other outcome with `invalid-field`
  (`src/scripts/verification-evidence-core.mjs` lines 503–521). Describe `limitation` as optional
  and omitted rather than left empty, since an empty one returns `missing-field` (line 488).
  Calling either one plainly optional would reproduce the rejected call this fix removes.
- The new contract test hard-codes the required and conditional key names and names
  `REQUIRED_CHECK_FIELDS` in `src/scripts/verification-evidence-core.mjs` in its invariant comment
  (decided by score, see "Decided by score"). Probing the exported `validateRecord` would repeat the
  `missing-field` and conditional-`comparison` probes of `test/verification-evidence.test.mjs`
  (around lines 455–520) and enlarge the contract test; the accepted cost is that a later helper key change does not fail this test by itself.
- No `contextBudget` change is planned. The budget counts only each target's built
  `tools/<name>.md` (`build.mjs` around lines 2637–2651); a ` ```lazy-include ` fence renders as a
  load pointer and the fragment ships separately as `shared/<name>.md`. Every consumer loads the
  fragment through such a pointer (`src/tools/fix.md:125-128`, `src/tools/refactor.md:120-123`,
  `src/tools/deliver.md:253-256`, `src/tools/pr.md:258-261`,
  `src/shared/build-delegated-run.md:89-92`), `merge-gate` and `iterate` do not reference it, and
  `test/workflow-contracts.test.mjs` (around lines 27762–27791) already asserts that no consumer
  includes it eagerly. The issue's step 3 is therefore a verification step only: the build report
  must show no budget overrun, and a budget is raised only if it does.

## Affected files

| File | Description |
| --- | --- |
| `src/shared/verification-evidence.md` | In `### Producer mapping`, extend the intro sentence to name the check-entry shape: required `check`, `outcome`, `provenance`, `scope`; optional `limitation` (omitted rather than empty); `comparison` only with `baseline-failure`; no other key; the bullet values go in `outcome` and `provenance`. |
| `test/workflow-contracts.test.mjs` | Add one contract test next to the existing producer-mapping test that asserts the mapping names every required check key and both conditional keys as backticked key names, pins the required list's order with `ordered`, and pins the `comparison` and no-other-key clauses with `includes`. |

## Implementation details

### Approach

1. In `src/shared/verification-evidence.md`, rewrite the intro sentence of `### Producer mapping`
   (lines 22–23) so that, after its unchanged opening clause "A producer maps only checks it
   observed in this run", it names each `checks` entry's keys as backticked names in prose:
   required `check` (what ran, such as `pnpm test`), `outcome`, `provenance` and `scope` (what it
   covered); optional `limitation`, omitted rather than left empty; `comparison` only with
   `baseline-failure`; no other key. It states that the bullet values below go in `outcome` and
   their provenance in `provenance`, and still ends with the colon that leads into the bullets.
   The sentence carries these exact literals, which step 2 pins: "required `check`",
   "optional `limitation`", "`comparison` only with `baseline-failure`" and "no other key".
   Add no inline JSON example: the prose sentence is the only statement of the entry shape
   (AGENTS.md "Writing prompt text", points 1, 2 and 4), and a quoted `"outcome"` would not satisfy
   the backticked-name test. Keep the bullets and all following paragraphs byte-identical.
2. In `test/workflow-contracts.test.mjs`, add a test beside the existing producer-mapping test that
   reuses `verificationEvidenceSection('### Producer mapping', '### Worktree producers')`. Its
   `// Invariant:` comment reads "the verification-evidence prompt names every required check key
   of the helper" and names `REQUIRED_CHECK_FIELDS` in
   `src/scripts/verification-evidence-core.mjs` as the source. Assert that the mapping contains
   each required key `` `check` ``, `` `outcome` ``, `` `provenance` ``, `` `scope` `` and the
   conditional keys `` `limitation` ``, `` `comparison` `` in backticked form, with one assertion
   message per key. Pin the required list's order and role with the file's existing `ordered`
   helper over the fragments "required `check`", `` `outcome` ``, `` `provenance` ``,
   `` `scope` `` and "optional `limitation`", so a required key that moves after "optional" or
   survives only in the later "go in" clause fails. Pin the role clauses with `includes`
   assertions for "`comparison` only with `baseline-failure`" and "no other key" (decided by score,
   see "Decided by score"). The backticked form is required because the bare English word
   "provenance" already precedes each value and would pass before the fix.
3. Confirm red-then-green locally: the new test fails against the unchanged fragment (it lacks
   `` `outcome` `` and `` `provenance` ``) and passes after step 1.
4. Run `pnpm format` (or `pnpm agent:check`) for the two edited files, then the CI order from
   `AGENTS.md`.
5. Run `node build.mjs` and read the `Always-loaded core (lines/budget)` report. Expected: no tool
   changes its count. If any tool reports over budget, raise only that tool's `contextBudget` to its
   new measured count plus at most ten lines, as `AGENTS.md` "Adding a tool or agent" requires.

### Component structure

Not relevant: no component or module is added.

### State management

Not relevant: no runtime state changes.

### API integration

Not relevant: the helper's CLI and validation stay unchanged.

### Styling approach

Not relevant: no UI.

### Accessibility

Not relevant: no UI.

### Edge cases

- The intro rewrite must keep its pinned opening clause and must not touch the pinned bullet
  literals; the existing producer-mapping test must stay green without edits.
- Two further tests pin nearby text and must stay green without edits: the model-tiers
  spawn-mention allowlist keys a block on the paragraph opening "Its only source is the
  per-command outcomes" (`test/model-tiers-contract.test.mjs` lines 155–159), and the build
  validation-budget contract pins the `### Worktree producers` paragraph
  (`test/build-validation-budget-contract.test.mjs` lines 43, 534–552). Neither paragraph changes.
- `` `comparison` `` and `` `limitation` `` already appear as backticked keys elsewhere in the
  section, so their assertions pass before the fix; that is acceptable, because the failing-first
  requirement covers `outcome` and `provenance` only.
- A behavioural eval suite whose load set reaches the fragment through a consumer's lazy pointer
  may show evidence debt after the edit; `pnpm eval <suite> verify` decides which ones; that is expected
  debt under `docs/adr/pragmatic-test-release-policy.md`, not a failure to fix here.

## Acceptance criteria

- [ ] The `### Producer mapping` section of `src/shared/verification-evidence.md` names
      `` `check` ``, `` `outcome` ``, `` `provenance` `` and `` `scope` `` as required keys,
      `` `limitation` `` as optional and omitted rather than empty, and `` `comparison` `` as
      allowed only with `baseline-failure`, and states that the outcome values go in `outcome` and
      the provenance values in `provenance`.
- [ ] The new test also fails when "`comparison` only with `baseline-failure`" or "no other key"
      is removed, or when a required key is listed only after "optional `limitation`".
- [ ] The existing tests that pin this fragment (`test/workflow-contracts.test.mjs` producer-mapping
      test, `test/model-tiers-contract.test.mjs`, `test/build-validation-budget-contract.test.mjs`)
      pass unchanged.
- [ ] A new test in `test/workflow-contracts.test.mjs` carries the invariant "the
      verification-evidence prompt names every required check key of the helper", passes after the
      change, and fails when `` `outcome` `` or `` `provenance` `` is removed from the fragment.
- [ ] Apart from this plan file's status update and archive move, no file other than the two listed
      under Affected files changes, unless the build report shows a budget overrun, in which case
      only the affected `contextBudget` lines change.
- [ ] The CI order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
      `pnpm test:distribution`.

## Validation plan

- Run the new test alone against the unchanged fragment and observe it fail, then against the
  edited fragment and observe it pass.
- Temporarily remove every occurrence of `` `outcome` `` (then of `` `provenance` ``) from the
  section and observe the new test fail; restore the sentence.
- Run the CI order through `t3-project`: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  `pnpm test:distribution`.
- Read the `Always-loaded core (lines/budget)` report of `node build.mjs` and confirm no tool is
  over budget.
- Run `pnpm eval <suite> verify` for the five suites (read-only) and report any evidence debt the
  fragment edit creates.

## Assumptions and open points

- Verified: the helper's accepted, required and conditional keys, value sets and pairing rules
  (`src/scripts/verification-evidence-core.mjs` lines 56–76, 314–324, 476–520); the fragment's
  current text (lines 20–41); every consumer's lazy pointer; the budget counting in `build.mjs`;
  the existing test helpers and pinned literals in `test/workflow-contracts.test.mjs`,
  `test/model-tiers-contract.test.mjs` and `test/build-validation-budget-contract.test.mjs`.
- Deliberate deviation from the issue: its acceptance wording calls `comparison` optional; this
  plan narrows it to "only with `baseline-failure`", because the helper requires it there and
  rejects it on every other outcome (`src/scripts/verification-evidence-core.mjs` lines 503–521).
  Likewise `limitation` is described as omitted rather than empty (line 488).
- Assumption: no eval evidence must be re-recorded for this change; any debt is reported per the
  pragmatic test and release policy.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->
```json
[
  {
    "site": "S-BAT",
    "question": "Which source should the new contract test use for the check-key list it asserts against the producer mapping?",
    "options": [
      "Hard-code the key names",
      "Probe validateRecord"
    ],
    "escape": [],
    "stop": null,
    "scores": [
      {
        "label": "Hard-code the key names",
        "score": 8,
        "reason": "It is the smallest change, matches the issue's proposal and AGENTS.md brevity, and names REQUIRED_CHECK_FIELDS as its invariant; the cost is that the test can drift silently when the helper changes."
      },
      {
        "label": "Probe validateRecord",
        "score": 5,
        "reason": "It catches drift in the required keys, but it repeats the missing-field probes already in test/verification-evidence.test.mjs, cannot find the conditional keys this way, and makes the contract test much larger."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "Should the new contract test also pin the key-role statements of the planned producer-mapping sentence (comparison only with baseline-failure, no other key)?",
    "options": [
      "Pin the role clauses",
      "Review-only coverage",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "stop": null,
    "scores": [
      {
        "label": "Pin the role clauses",
        "score": 7,
        "reason": "Two cheap `includes` checks protect the clauses that fix the root cause (guessed keys like `status`, misuse of `comparison`), as the file's other pinned literals do; the cost is fixed wording."
      },
      {
        "label": "Review-only coverage",
        "score": 5,
        "reason": "It leaves wording free and keeps the test small, but the deliberate deviation from the issue (`comparison` only with `baseline-failure`) and the 'no other key' rule could later be removed without any failing test."
      }
    ]
  }
]
```
<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area | Critical | Important | Note |
|---|---:|---:|---:|
| Architecture | 0 | 0 | 0 |
| Security | 0 | 0 | 0 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 0 | 0 |
| Testability | 0 | 0 | 3 |
| Scope | 0 | 0 | 3 |
| Maintainability | 0 | 0 | 2 |

### Findings

- Testability, Note: `outcome` and `provenance` appear twice in the planned sentence, so removing
  one occurrence would not fail a presence-only test. Adjusted: the validation removes every
  occurrence, and the test ties the four required keys to the word "required" with `ordered`.
- Scope, Note: the optional inline JSON example would state the entry shape a second time.
  Adjusted: the example is dropped; the prose sentence is the only statement.
- Scope, Note: narrowing `comparison` from the issue's "optional" to "only with
  `baseline-failure`" was not recorded as a deliberate deviation. Adjusted: recorded under
  Assumptions and open points with the helper lines.
- Maintainability, Note: the `CHECK_KEYS` line range was off by one. Adjusted to lines 314–321.
- Gap analysis (Phase 4) findings were incorporated before this review: `comparison` described as
  conditional and `limitation` as omitted rather than empty; prose naming required instead of a
  JSON example; the intro sentence extended rather than duplicated; two further pinning tests
  added to Edge cases; the plan file excluded from the no-other-files criterion. The test's key
  source was decided by score.
- Testability, Note (deep review): the `ordered` pin starting at "required" did not prove the
  keys' role, because `outcome` and `provenance` recur in the later "go in" clause. Adjusted: the
  pin ends at "optional `limitation`", and step 1 fixes the pinned literals.
- Testability, Note (deep review): the conditional `comparison` and "no other key" clauses were
  protected by review only. Decided by score: pin both with `includes`; acceptance criteria
  extended.
- Maintainability, Note (deep review): the rationale that probing `validateRecord` cannot find
  the conditional keys was wrong, and the `comparison` line range was cited inconsistently.
  Adjusted: the rationale rests on duplication and test size; the range is lines 503–521. The
  recorded score reason of the earlier decision is kept verbatim as scored.
- Scope, Note (deep review): the eval-debt example claimed `build-context` seeds reach the
  fragment, which its seeds do not show. Adjusted: `pnpm eval <suite> verify` decides.

## Open points

- No open points.
