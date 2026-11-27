# Reject a Relayed answer line on a first delegated merge-gate dispatch

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #817

## Requirement

The caller contract in `src/tools/merge-gate.md` ("Dispatching the delegated run") allows a
`Relayed answer:` line "on a re-dispatch only". The delegated run in
`src/shared/merge-gate-delegated-run.md` does not enforce that rule:

- Entry step 1 accepts `Relayed answer: none` under every run state.
- Entry step 3 requires the wisdom file to be absent only on a dispatch without a
  `Relayed answer:` line. A dispatch that carries one passes whether or not the file exists.
- Entry step 5 then resolves the completion mode to `report` under `Relayed answer: none`,
  whatever `mergeGate.completion` says.

A caller that sends the line on a first dispatch by mistake therefore pays for a full gate run.
The run reads every check, evaluates the reviewer and the human-comment guard, and returns `DONE`
with a merge-readiness report, but it does not merge. Nothing signals the input error, and a
configured `mergeGate.completion: merge` is overridden without notice.

Every legitimate dispatch with a `Relayed answer:` line follows a return that kept the wisdom
file, so a `Relayed answer:` line without a wisdom file is always a caller error. The goal is to
reject that input at Entry, before any gate work or write, without changing any legitimate
re-dispatch.

The fix changes one rule of the shipped workflow contract and adds a test for it. It also brings
three eval scenarios that relied on the removed acceptance into line with the rule. The intended
behavior (fail-closed rejection of invalid input) is already stated on the caller side, and the
delegated run does not implement it. That makes this a Bugfix (`effective-flow fix`) rather than a
Feature.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #817, on base
`origin/develop` at `c29d03a3`.
**Original outcome:** The delegated merge-gate run rejects a first dispatch that carries any
`Relayed answer:` line with `ABORT unparseable input line` at Entry, with no gate work and no
write. Re-dispatches after `BLOCKED-USER` and `Resumed wait:` re-dispatches with
`Relayed answer: none` are still accepted, and a contract test covers the rejection.
**Last evaluated attempt:** None.
**No-progress count:** 0
**Cumulative approach:** A one-sentence rule in Entry step 3 of the delegated-run fragment, one
source-prose contract test, and earlier-dispatch seeds for the three draft-ready eval scenarios
that relied on the removed acceptance.
**Continuation decision:** None.

## Architecture decisions

- **Enforce the rule at Entry step 3, the receiver side.** Step 3 already owns the wisdom file's
  presence rules: absent without a `Relayed answer:` line, and present with an unconsumed wait
  record under `Resumed wait:`. The missing half is "present with a `Relayed answer:` line", so it
  belongs in the same step. Step 1 stays a purely syntactic line check, since it cannot see the
  file. The caller-side rule in `src/tools/merge-gate.md` already says "on a re-dispatch only" and
  stays unchanged.
- **Reuse `ABORT unparseable input line`, without a colon, exactly as spelled in Entry steps 1–3.**
  The issue proposes this code, and it follows the existing `Resumed wait:` precedent in step 3
  for the same failure class: an input line that requires a present wisdom file arrives without
  one. The caller handles it under "Any other `ABORT`": it reports the abort and deletes the
  wisdom file, which is a no-op on an absent file. `ABORT invalid wisdom file` keeps its current
  uses (an unsafe path, a wrong name or file kind, and a present file on a dispatch without a
  `Relayed answer:` line). After it, the caller keeps the path untouched.
- **Check order inside step 3.** The existing location, name and file-kind check runs first
  (`ABORT invalid wisdom file`). The `Resumed wait:` check runs next, then the new presence rule,
  then the `Caller limits:` check. For an absent file the `Resumed wait:` check and the new rule
  return the same `ABORT`, so their relative order has no observable effect. Placing the new
  sentence after the `Resumed wait:` sentence keeps that sentence's "instead" contrasting only
  with the absence rule, so it cannot be read as exempting a `Resumed wait:` dispatch from the
  new rule. A dispatch with an unsafe path is still reported as an invalid wisdom file, and every
  abort stays in steps 1–3. The fragment's "Every return ends the run once" bullet
  already guarantees that an abort from Entry steps 1–3 writes and deletes nothing, so no gate
  work, presence registration or wisdom-file write can happen first.
- **No caller-path change is needed.** The examination of every caller path (see "Verified
  context" under Assumptions) found that each dispatch with a `Relayed answer:` line follows a
  return that kept the wisdom file. The proposed rule therefore rejects only callers that break
  the existing "re-dispatch only" contract.
- **The rule covers every `Relayed answer:` line, and the three draft-ready eval scenarios get the
  wisdom file a real first dispatch leaves.** This was decided by score; see "Decided by score"
  under Assumptions. Narrowing the rule to `none` would leave the step 6 stopping answers (which
  ignore the digest) able to end a first dispatch silently. The scenarios'
  "no wisdom file is seeded" premise describes the very input this fix rejects. The suite must
  therefore present each of them as a genuine re-dispatch.

## Affected files

| File                                                                                                                                                                                            | Description                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/merge-gate-delegated-run.md`                                                                                                                                                        | Entry step 3 ("Wisdom file"): add one sentence after the `Resumed wait:` sentence and before the `Caller limits:` sentence. It states that a dispatch with a `Relayed answer:` line, `none` included, requires a present file and otherwise returns `ABORT unparseable input line`. No other step changes.                                                                                          |
| `test/workflow-contracts.test.mjs`                                                                                                                                                              | Add one source-prose contract test near the existing Entry step 3 tests (the probe test around line 27519 and the `Resumed wait:` entry test around line 28248). Its leading comment names the protected invariant.                                                                                                                                                                                 |
| `evals/merge-gate/_scaffold/run-state-seed.mjs`                                                                                                                                                 | Seed, for `draft-ready-redispatch-marks-ready`, `draft-ready-keep-draft-stops` and `forgejo-wip-draft-marks-ready`, the runtime state a first dispatch leaves when it returns `BLOCKED-USER ready-for-review` in round 1. That state is the wisdom file at the path each scenario prompt already names, plus the run's own presence marker. Update the header comment ("three scenarios") to match. |
| `evals/merge-gate/suite.config.mjs`                                                                                                                                                             | Update the `prepareCheckout` comment that says `run-state-seed.mjs` seeds "exactly those three". Keep the seed in the same `prepareCheckout` chain position. The two mark-ready scenarios keep their draft-ready `origin` from `merge-origin.mjs`, and `draft-ready-keep-draft-stops` stays without one.                                                                                            |
| `evals/merge-gate/scenarios/draft-ready-redispatch-marks-ready.md`, `evals/merge-gate/scenarios/draft-ready-keep-draft-stops.md`, `evals/merge-gate/scenarios/forgejo-wip-draft-marks-ready.md` | Replace the "No wisdom file is seeded" premise (lines 14–15 in the first file) and any equivalent prose with the seeded earlier-dispatch record. Keep the prompts' input lines unchanged unless the digest check below requires otherwise.                                                                                                                                                          |
| `evals/merge-gate/README.md`                                                                                                                                                                    | Rewrite every passage that lists what `run-state-seed.mjs` seeds: the instrument-table row (line 69), the sentence at lines 828–829, and the draft-ready paragraph (lines 834–841). The answered cases become re-dispatches that find their earlier dispatch's wisdom file.                                                                                                                         |
| `test/merge-gate-eval.test.mjs`                                                                                                                                                                 | Add seed checks next to the existing run-state seed tests (around lines 3400–3412). They assert that each of the three slots holds its wisdom file with the expected records and its presence marker, and that the seed's `readyForReviewDigest` equals the prompt's `digest=` value.                                                                                                               |

## Implementation details

### Approach

1. In `src/shared/merge-gate-delegated-run.md`, Entry step 3, insert one sentence directly after
   the `Resumed wait:` sentence ("A `Resumed wait:` dispatch instead requires … returns
   `ABORT unparseable input line`.") and before the `Caller limits:` sentence. Its meaning: a dispatch with a `Relayed answer:` line, `none`
   included, requires a present file from an earlier dispatch of this gate run; without one it
   returns `ABORT unparseable input line`. Keep the existing sentences of step 3 byte-identical
   and contiguous. Three existing tests in `test/workflow-contracts.test.mjs` read step 3 and must
   stay green, and the planned insertion point keeps their orders and substrings intact:
   - the nested-spawn probe test (around line 27519). It matches the regex
     `` it must be absent or a regular file, absent on a dispatch without a `Relayed answer:` line; otherwise return `ABORT invalid wisdom file` ``.
   - the caller-loop test (around lines 27253–27262). Its `ordered` check requires "A present
     file is this gate run's record from an earlier dispatch." to precede
     `` `ABORT caller limits narrowed` ``.
   - the `Resumed wait:` entry test (around line 28248). It matches the `Resumed wait:` sentence
     inside the `between('3. **Wisdom file.**', '\n4. **Fresh state.**')` slice.
2. Leave Entry steps 1, 5 and 6, the caller section of `src/tools/merge-gate.md`,
   `src/shared/host-pr-watch.md` and `src/shared/merge-gate-delegation-contract.md` unchanged. The
   rule's effect on them is covered by the edge cases below.
3. In `test/workflow-contracts.test.mjs`, add one test. Its leading comment states the
   invariant: "a `Relayed answer:` line, `none` included, is accepted only together with a wisdom
   file an earlier dispatch of the same gate run left behind, so a first dispatch carrying it
   aborts at Entry before any gate work or write". The test:
   - slices Entry step 3 between `3. **Wisdom file.**` and `\n4. **Fresh state.**` with the
     existing `mergeGateDelegatedRun` source helper and asserts the new rule. The assertion
     covers `Relayed answer:`, `none` included, a required present file, and the
     `ABORT unparseable input line` return.
   - asserts that the Entry step 1 slice does not contain the new rule's own wording, the
     phrase that requires a present file for a `Relayed answer:` line. That keeps the presence
     check in the step that can see the file. Step 1 already mentions `Relayed answer:` and
     `ABORT unparseable input line`, so the negative assertion matches only the new phrase.
   - does not duplicate two guarantees the rejection relies on, which are already guarded. Its
     invariant comment names them instead: "An `ABORT` from Entry steps 1 to 3 writes and deletes
     nothing" (asserted around line 26982), and Phase 6's "Delete the wisdom file – except on a
     `BLOCKED-USER` return –" (asserted around line 26992). Criterion 2 depends on that retention.
     Criterion 3 rests on two other guarantees. The first is the "Every return ends the run once"
     bullet (fragment lines 81–85), under which `SUSPENDED host-pr-watch` "ends the same way" and so
     keeps the wisdom file. The second is step 3's existing requirement of a present file with an
     unconsumed wait record under `Resumed wait:`. The invariant comment names both.
4. Re-base the three draft-ready eval scenarios on a genuine re-dispatch:
   - In `evals/merge-gate/_scaffold/run-state-seed.mjs`, add a seed for
     `draft-ready-redispatch-marks-ready`, `draft-ready-keep-draft-stops` and
     `forgejo-wip-draft-marks-ready`. The seed writes, at the `Wisdom file:` path each prompt
     already names, the records a round-1 first dispatch leaves before it returns
     `BLOCKED-USER ready-for-review`. Follow the "Wisdom accumulation" list of the fragment, the
     record shapes of the existing `wisdomRecord` / `forgejoWipConflictWisdomRecord` seeds, and the
     runtime-state write rules the existing seeds follow:
     - the resolved pull request and completion mode
     - the caller limits of dispatch 1
     - the `viewer-read` result
     - the `nested-spawn probe passed` record
     - the presence token with entry notice, plus a matching presence marker for the run's
       `SESSION_ID`
     - the guard state
     - a fixture-derived `## Round 1` record, like the `## Round 1` sections of the existing seeds
       (`run-state-seed.mjs` around lines 393–414 and 477–486). For the two GitHub scenarios:
       checks green, no trigger fired. For the Forgejo scenario: the WIP-draft exit's proof
       `clean`, with trigger (c) not fired.
     - `VERIFIED_HEAD_SHA` and `REVIEW_HEAD_SHA`, both equal to the fixture head
     - the "Draft ready for review" record: class `unmarked`, blocker count 0, and the
       `appendixTrust` of the fixture's `pr-draft-classify` result
     - the closing line saying the `ready-for-review` question was posed in round 1 with its
       state digest and returned `BLOCKED-USER`
     - no consumed `ready-for-review` answer, so the re-dispatch's answer is the first
       consumption and the instance counts as not yet re-dispatched
   - Chain the new seed to `merge-origin.mjs` the way `seedForgejoWipConflictRun` already does.
     The two mark-ready scenarios keep their draft-ready `origin`. `draft-ready-keep-draft-stops`
     has no `origin`: it is absent from `DRAFT_READY_ORIGIN_SCENARIOS` (`merge-origin.mjs` lines
     73–81), and a run that stops at Entry never fetches. Its seed therefore adds only the wisdom
     file and the presence marker. None of the three scenarios joins
     `DRAFT_READY_ORIGIN_SCENARIOS` or `SEALED_OBSERVATION_SCENARIOS`. Update the header comment
     of `run-state-seed.mjs` and the `prepareCheckout` comment in
     `evals/merge-gate/suite.config.mjs` to match.
   - Make the digest check executable. The `ready-for-review` digest is computed only from the
     fresh `pr-draft-classify` result (`appendix`, `class`, `trust`; `src/tools/merge-gate.md`
     around lines 121–130), not from the wisdom file. No test pins the three prompts' `digest=`
     values today. Add a `readyForReviewDigest(fixture)` helper to the seed module and use it
     both for the seeded posed line and in the new seed checks.
   - Replace the "No wisdom file is seeded" premise in the three scenario files and the
     passages of `evals/merge-gate/README.md` that list what `run-state-seed.mjs` seeds (the
     instrument-table row at line 69, the sentence at lines 828–829 and the draft-ready paragraph
     at lines 834–841) with the seeded earlier-dispatch record. The expected endings (mark-ready and continue; the step 6
     `Keep draft` stop with its report and Phase 6) stay as they are.
   - In `test/merge-gate-eval.test.mjs`, add seed checks next to the existing run-state seed tests
     (around lines 3400–3412). They assert, for each of the three slots, the wisdom file's
     records, the absence of a consumed `ready-for-review` answer, and the presence marker. They
     also assert that `readyForReviewDigest(fixture)` equals the `digest=` value of the
     scenario's prompt.
5. Run `node build.mjs` and read the `Always-loaded core (lines/budget)` report. The fragment is
   reached only through a ` ```lazy-include ` pointer in `src/tools/merge-gate.md` (lines
   349–352), so no `contextBudget:` should change. If the report shows a change, adjust only the
   reported line and only within its ten-line headroom.

### Component structure

Not relevant: the change touches one prose rule of a shipped Markdown fragment, its contract
test, and the eval suite's seed scaffold and scenario prose.

### State management

Not relevant beyond the wisdom file, whose lifecycle stays unchanged. The rule only reads whether
the file is present.

### API integration

Not relevant: no helper script, forge call or runtime CLI changes.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **First dispatch with `Relayed answer: none` (or any concrete answer) and no wisdom file.** The
  run returns `ABORT unparseable input line` from Entry step 3 and writes, registers and deletes
  nothing. The caller handles it under "Any other `ABORT`": it reports the abort and deletes the
  wisdom file, which is a no-op because the file is absent. An Entry abort never qualifies for the
  retrospective slot (`Entry abort: yes`).
- **Re-dispatch after a valid `BLOCKED-USER`.** Phase 6 step 1 keeps the wisdom file on a
  `BLOCKED-USER` return, so the file is present and the dispatch is accepted as before.
- **Re-dispatch with `Relayed answer: none` after an invalid `BLOCKED-USER` or an unanswered
  question.** Both follow a `BLOCKED-USER` return, which kept the file, and every dispatch records
  its caller limits in the wisdom file before its first return. The dispatch is accepted as
  before. Under `non-interactive`, every `BLOCKED-USER` is invalid and follows the same path.
- **`Resumed wait:` re-dispatch carrying `Relayed answer: none`.** It follows a
  `SUSPENDED host-pr-watch` return. That return also keeps the file, because the "Every return
  ends the run once" bullet says it "ends the same way" as `BLOCKED-USER` (fragment lines 81–85).
  Step 3 already requires a present file with an unconsumed wait record there. Both rules are satisfied together, so the
  dispatch is accepted as before.
- **Malformed `BLOCKED-USER` from a misbehaving delegated run that never wrote its wisdom file.**
  The caller's single `Relayed answer: none` re-dispatch now aborts at Entry instead of running a
  report-only gate. The caller then reports the abort and dispatches nothing more. This fails
  closed and replaces a report the contract cannot vouch for. It is accepted deliberately.
- **Unsafe wisdom-file path together with a `Relayed answer:` line.** The location, name and
  file-kind check still runs first and returns `ABORT invalid wisdom file`, and the caller keeps
  the path untouched, as before.
- **Inline gate run** (the `ABORT nested-spawn-unavailable` fallback). It parses no dispatch input
  lines, so the rule does not apply.

## Acceptance criteria

- [ ] Entry step 3 of `src/shared/merge-gate-delegated-run.md` states that a dispatch with a
  `Relayed answer:` line, `none` included, requires a present wisdom file and otherwise returns
  `ABORT unparseable input line`. Because steps 1–3 run before any write and an abort from them
  writes and deletes nothing, a first dispatch with `Relayed answer: none` and no wisdom file ends
  at Entry with no gate work and no write.
- [ ] A re-dispatch after `BLOCKED-USER` (with `none` or a concrete answer, kept by the Phase 6
  exception) still meets a present wisdom file and is accepted. So does a `Resumed wait:`
  re-dispatch with `Relayed answer: none`, kept by the `SUSPENDED` retention and already required
  by step 3's wait-record rule. Both hold because the following stay unchanged:
  - the step 3 location, name and file-kind sentence and the `Resumed wait:` sentence
  - the Phase 6 step 1 `BLOCKED-USER` retention exception
  - the `SUSPENDED host-pr-watch` "ends the same way" retention
  - the caller's re-dispatch paths in `src/tools/merge-gate.md` and
    `src/shared/host-pr-watch.md`
- [ ] `test/workflow-contracts.test.mjs` contains a new test, with a leading invariant comment,
  that fails when the new step 3 rule or its `ABORT unparseable input line` return is removed.
  The existing assertions around lines 26982 and 26992 keep failing `pnpm test` when the Entry
  steps 1–3 no-write guarantee or the Phase 6 `BLOCKED-USER` retention is removed. All existing
  tests stay green.
- [ ] The three draft-ready scenarios each find a seeded earlier-dispatch wisdom file at their
  prompt's `Wisdom file:` path, together with a matching presence marker. The scenario prose and
  the README passages at lines 69, 828–829 and 834–841 no longer claim that an absent wisdom file
  is accepted with a `Relayed answer:` line, nor that `run-state-seed.mjs` seeds only the
  earlier scenarios. The new seed checks in `test/merge-gate-eval.test.mjs` pass, including the
  digest equality.
- [ ] CI's order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  `pnpm test:distribution`. `node build.mjs` reports no `contextBudget:` violation.

## Validation plan

- Before the edit, add the new test and confirm it fails on the unchanged fragment, because the
  step 3 rule is missing. After the edit, confirm it passes.
- Run CI's order from `AGENTS.md`: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  `pnpm test:distribution`. Run the project's commands through the `t3-project` runner where the
  host requires it.
- Run `pnpm eval merge-gate verify` after all edits. The fragment is in the suite's load set, and
  `run-state-seed.mjs` and `suite.config.mjs` are instrument files. Expect freshness debt on every
  recorded merge-gate round, with no integrity error. Under
  `docs/adr/pragmatic-test-release-policy.md`, freshness alone requires no new model run.
- Prove the seeds with the new checks in `test/merge-gate-eval.test.mjs`. Like the existing seed
  tests, they run the suite's `prepareCheckout` on a temporary slot, so no
  `pnpm eval merge-gate prepare` round, lock or recorded evidence is needed.
- Manual check: read Entry steps 1–8 in order and confirm that the new sentence is the only
  fragment change and that no earlier step writes.

## Assumptions and open points

- **Verified context** (read from `c29d03a3`): Entry steps 1, 3 and 5 at
  `src/shared/merge-gate-delegated-run.md` lines 15–26, 32–39 and 44–51. The Entry
  no-write/no-delete guarantee at lines 79–80. First wisdom-file write at `register`, after the
  step 4 read (lines 127–131). Caller limits recorded before each dispatch's first return
  (around line 499). Phase 6 step 1 retention on `BLOCKED-USER` (around line 1471). Caller
  dispatch and return handling at `src/tools/merge-gate.md` lines 276–338. `Resumed wait:`
  keeping the `Relayed answer:` line in `src/shared/host-pr-watch.md` (around lines 134 and
  156–161). No other source dispatches with a `Relayed answer:` line.
- **Verified eval dependency:** no merge-gate eval scenario sends `Relayed answer: none`. Three
  scenarios, however, send a concrete `Relayed answer:` line with no wisdom file and rely on the
  current acceptance of an absent file: `draft-ready-redispatch-marks-ready` (its scenario file
  says so at lines 14–15; the prompt is at line 28), `draft-ready-keep-draft-stops` and
  `forgejo-wip-draft-marks-ready`, all under `evals/merge-gate/scenarios/`.
  `evals/merge-gate/README.md` lines 839–841 state the same reasoning. The instrument file
  `evals/merge-gate/_scaffold/run-state-seed.mjs`, which is hashed into the instrument through
  `evals/merge-gate/suite.config.mjs:161`, seeds runtime state for three other scenarios only.
  Under the decided scope, these three get a seed as well (Approach step 4). Entry step 6 ends
  the `Keep draft` scenario "whatever its digest"
  (`src/shared/merge-gate-delegated-run.md:52-55`), so a narrower rule would have left that
  path silent.
- **Verified digest independence:** the `ready-for-review` digest is computed only from the
  fresh `pr-draft-classify` result (`src/tools/merge-gate.md` around lines 121–130). Seeding a
  wisdom file therefore leaves each prompt's precomputed `digest=` valid, and the new
  `readyForReviewDigest` check in Approach step 4 pins it.
- **Deliberately not changed:** `docs/developer-guide/architecture.md` (around lines 168–180)
  describes the relayed-answer re-dispatch at a level that does not state the presence rule.
  It stays accurate and needs no edit.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->
```json
[{"site": "S-BAT", "question": "Which scope should the new Entry step 3 presence rule (a Relayed answer line requires a present wisdom file from an earlier dispatch, else ABORT unparseable input line) have, given the three draft-ready eval scenarios that send a concrete Relayed answer without a wisdom file?", "options": ["Every Relayed answer line, seed the three scenarios", "Relayed answer: none only", "none and stopping answers, seed the keep-draft scenario", "Every line, defer eval rework to a follow-up"], "escape": [], "stop": [], "scores": [{"label": "Every Relayed answer line, seed the three scenarios", "score": 9, "reason": "It is the issue's own proposal and fully enforces the re-dispatch-only rule in one short sentence; its edge over D is that every round goes stale anyway, so seeding three scenarios buys complete enforcement."}, {"label": "Relayed answer: none only", "score": 4, "reason": "It meets the literal acceptance criteria without eval churn, but a first dispatch carrying a step 6 stopping answer still ends with no merge and no input error, so #817 stays half-fixed."}, {"label": "none and stopping answers, seed the keep-draft scenario", "score": 6, "reason": "It closes every input that can wrongly end a run and seeds only one scenario, but step 3 needs a longer rule and continue answers stay outside the re-dispatch-only rule."}, {"label": "Every line, defer eval rework to a follow-up", "score": 2, "reason": "It ships a contract the three draft-ready scenarios contradict, so re-recording them yields Entry aborts as failing evidence, a debt the pragmatic test policy does not allow."}]}]
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
| Error cases     |        0 |         1 |    1 |
| Testability     |        0 |         2 |    2 |
| Scope           |        0 |         0 |    2 |
| Maintainability |        0 |         0 |    3 |

### Findings

- **Error cases, Important (incorporated):** The draft open point said that under option B
  concrete answers stay gated by their digest. That is wrong for the Entry step 6 stopping
  answers, which end the run "whatever its digest". The option text was corrected, the missing
  middle variant (`none` plus stopping answers) was added, and the scored decision covers every
  `Relayed answer:` line.
- **Testability, Important (incorporated):** An acceptance criterion required the new test to
  fail on removals that the approach left to the existing assertions around lines 26982 and
  26992. The criterion now assigns those guarantees to the existing assertions.
- **Scope, Note (incorporated):** The option costs misattributed eval staleness. The fragment
  edit stales every merge-gate round under every option. The decision and the Validation plan
  now state this, and they name option C's failing-evidence consequence.
- **Testability, Note (incorporated):** The negative step 1 assertion now names the exact new
  phrase it checks, because step 1 already mentions `Relayed answer:` and
  `ABORT unparseable input line`.
- **Testability, Note (incorporated):** The seeded wisdom file now holds the records a real first
  dispatch leaves before `BLOCKED-USER` (the passed probe, caller limits, presence token and
  marker), so the scenarios exercise a reachable entry state.

Deep plan review (2026-11-27):

- **Testability, Important (incorporated):** The seed list held only header records, which is a
  state no real first dispatch leaves before posing `ready-for-review`. The seed now also writes
  the round-1 record, `VERIFIED_HEAD_SHA` / `REVIEW_HEAD_SHA`, the "Draft ready for review" record
  and the posed line. A `readyForReviewDigest` helper makes the digest check executable.
- **Scope, Note (incorporated):** `draft-ready-keep-draft-stops` has no `origin`. The plan now
  says that its seed adds only the wisdom file and the presence marker, and that none of the
  three scenarios joins `DRAFT_READY_ORIGIN_SCENARIOS` or `SEALED_OBSERVATION_SCENARIOS`.
- **Maintainability, Note (incorporated):** Two more README passages list what
  `run-state-seed.mjs` seeds (line 69 and lines 828–829). They are now in Affected files and in
  the acceptance criteria.
- **Error cases, Note (incorporated):** The plan had attributed criterion 3 to the
  `BLOCKED-USER` retention. It now rests on the `SUSPENDED host-pr-watch` "ends the same way"
  retention and on step 3's existing wait-record rule.
- **Maintainability, Note (incorporated without a decision):** Inserting the new sentence before
  the `Resumed wait:` sentence would have made that sentence's "instead" readable as an exemption.
  The insertion point moved behind the `Resumed wait:` sentence and before the `Caller limits:`
  sentence. Both checks return the same `ABORT` for an absent file, so behavior, scope and the
  pinned tests are unaffected.
- **Maintainability, Note (incorporated):** The scored-decision record now carries `"stop": []`
  in the list shape the record contract names. The scoring leaf's reason is kept verbatim: its
  "D" is the plan's option (D), the next-best option at 6.

## Open points

- No open points.
