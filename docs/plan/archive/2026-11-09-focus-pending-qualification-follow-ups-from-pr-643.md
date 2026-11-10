# Focus pending-qualification follow-ups from PR 643

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)

## Requirement

PR #643 (issue #636) made `focus` present itself as pending qualification on every host. Its automatic reviews left six lower-severity notes that were not fixed before the merge. This plan closes them in one small follow-up on `develop`.

1. **R1 – resume without a session reference.** The gate sentence in `src/shared/focus-session-contract.md` limits the refuse-first clause to "a bare snapshot invocation (`{{FLOW}} focus` without a session reference, never a `follow-up` form)". The selection rule (around line 30) defers to the gate's pending refusal "wherever the gate states it". The gate states that refusal for "a `follow-up` limitation reply other than `follow-up stop`", which covers a resume. A resume without a reference (`{{FLOW}} focus follow-up`) therefore gets two conflicting readings: clarify the session first, or refuse first. **Maintainer decision (2026-11-09): refuse first.** Only `follow-up stop` without a reference keeps the normal clarification, so a stop is never blocked. Two further maintainer decisions from the deep review (2026-11-09): the selection rule's deferral is made precise, so an ambiguous or conflicting reference stays clarify-first, and no selection question follows a refuse-first reply.
2. **T1 – ordered assertion anchors.** The `ordered()` check added in PR #643 (`test/focus-contracts.test.mjs:177-187` on `develop`) uses a bare `only in` anchor. It does not bound the excluded list, and it does not catch an output listed on both sides, because `indexOf` matches the later copy.
3. **T2 – comment width.** The invariant comment block at `test/focus-contracts.test.mjs:139-142` has lines of 104 and 109 characters (lines 139 and 140). Most comments in the file stay at or near 100 columns; `oxfmt` sets no print width and does not reflow comments.
4. **Doc – per-host missing capability.** `docs/user-guide/tools-quality.md:60-61` says focus "returns the missing snapshot qualification". That is only the T3 observed row's result. Every other host returns its own row's missing capability, as line 18 of the same page and the gate sentence already say.
5. **Activation duties – frontmatter `description`.** `docs/developer-guide/focus-host-acceptance.md` (general activation paragraph around lines 282–287, follow-up activation step around lines 319–322) lists the pending sentence, the selection deferral, their tests, the `catalogHint` and the user guide as removal duties on the first activation. It omits the `src/tools/focus.md` frontmatter `description`, which also states "No host route is currently qualified" (#613).
6. **catalogHint – bare `#613`.** The only `doesNotMatch(/(?<![\w/-])#613\b/)` check covers the gate sentence. The `catalogHint` check requires only the qualified reference, so a later edit could add a bare `#613` without a failing test. The hint is rendered into the router `SKILL.md` that seeds the eval suites, and the focus evaluator's `TARGET_LOCATOR` (`evals/focus/_scaffold/evaluate.mjs:304`, pattern `(?<![A-Za-z0-9])#\d+\b`) turns a message containing a bare `#613` into a judgment instead of an admission failure.

Rationale for Bugfix: item 1 corrects a contradictory runtime instruction, and items 2–6 harden the tests and docs of the same fix. No gate row's availability changes, and nothing new is added.

## Outcome checkpoint

- **Primary source:** sebastian-software/effective-flow PR #643 review notes (R1, T1, T2, plus the first-round notes on the user guide, activation duties and `catalogHint`), planned against `origin/develop` at `07ebb1a6`.
- **Original outcome:** The focus pending-qualification contract has no contradictory reading for invocations without a session reference. The tests bind every asserted phrase tightly enough that the reviewed regressions fail. The user guide and activation duties are accurate.
- **Last evaluated attempt:** none. The notes were deliberately deferred at merge time.
- **No-progress count:** 0
- **Cumulative approach:** builds on #636/PR #643; wording and test changes only.
- **Continuation decision:** none.

## Architecture decisions

- **Exclude only `follow-up stop`.** The refuse-first clause covers every invocation without a session reference except `follow-up stop`. This includes the bare snapshot form and the bare resume (`{{FLOW}} focus follow-up`). The tick prompt always carries a reference and is unaffected. This keeps one source (the gate sentence).
- **Precise selection-rule deferral (maintainer decision, 2026-11-09).** The selection rule's deferral at `src/shared/focus-session-contract.md:30` currently ends "the gate's pending refusal comes first wherever the gate states it", and "it" can be read as the refusal (which the gate states for every row) or as the refuse-first ordering. It becomes exactly: "the gate's pending refusal comes first where the gate says it precedes selection clarification". An ambiguous or conflicting reference therefore stays clarify-first.
- **No selection question after the refusal (maintainer decision, 2026-11-09).** A reference-less invocation that is refused first gets no follow-up question about which session is meant. The reply ends with the missing capability. No contract change is needed, because a refusal ends admission; the plan records it as an edge case and the user guide states it.
- **No change to the eval scaffold or to the gate table rows.** As in PR #643.
- **Fixed R1 target clause.** The gate sentence's clause becomes exactly: "and for any invocation other than `follow-up stop` that has no session reference (for example `{{FLOW}} focus` or `{{FLOW}} focus follow-up`), which is refused before any selection is clarified". The test pins this exact phrase.
- **One exact list span replaces the list `ordered()` call.** The included/excluded lists are pinned as one contiguous fixed phrase, which fixes membership, order and both boundaries at once, and also catches an eighth output inserted into either list. The `ordered()` helper itself stays; it is used elsewhere in the file (for example lines 76, 188, 247, 276, 456, 570).
- **Bare-`#613` guard on all shipped focus sources.** Use the existing lookbehind pattern on the whole of `src/tools/focus.md` (frontmatter and body), `src/shared/focus-session-contract.md` and `src/shared/focus-follow-up.md`. One assertion then covers the `catalogHint`, the `description` and any future gate or follow-up text. The slice-level check at `test/focus-contracts.test.mjs:174` becomes redundant and is removed.

## Affected files

| File                                            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/focus-session-contract.md`          | Gate sentence (line 68): replace the bare-snapshot-only clause with the fixed R1 target clause. Keep every other fixed phrase. Selection rule (line 30): replace "wherever the gate states it" with the fixed precise deferral.                                                                                                                                                                                                                                                                                                                                                        |
| `test/focus-contracts.test.mjs`                 | Pin the R1 target clause and reject "never a `follow-up` form" (around line 156). Update the pinned selection-rule regex (line 200) to the precise deferral. Replace the list `ordered()` call and its comment (lines 175–187) with one exact list-span phrase and a one-line comment, and drop `'only in'` and the seven output phrases from the `assertPhrases` list (lines 158–166) because the span covers them (T1). Update and re-wrap the invariant comment (lines 139–142, T2). Replace the slice-level bare-`#613` check (line 174) with the whole-source assertion (item 6). |
| `docs/user-guide/tools-quality.md`              | Replace the sentence from "A snapshot request" (end of line 16) through "stays available." (line 18), and the sentence on lines 60–61, with the fixed sentences of Approach step 6.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `docs/developer-guide/focus-host-acceptance.md` | Add the `focus` frontmatter `description` at three places with the fixed wording of Approach step 7 (lines 286, 319, 322).                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `build.mjs`                                     | Only if `node build.mjs` fails the focus context budget: `CONTEXT_BUDGET_LINES.focus` (currently 410). Not expected, because the gate sentence stays one line.                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Implementation details

### Approach

1. **R1.** Replace the clause "and for a bare snapshot invocation (`{{FLOW}} focus` without a session reference, never a `follow-up` form), which is refused before any selection is clarified" in the gate sentence (line 68) with the fixed target clause from the architecture decisions. Keep the sentence a single sentence immediately before "On a disabled path …", and keep every other fixed phrase. In the selection rule at line 30, replace "comes first wherever the gate states it" with the fixed precise deferral "comes first where the gate says it precedes selection clarification".
2. **R1 test.** Assert the fixed target clause as an exact phrase on the flattened sentence slice, and add `doesNotMatch` for "never a `follow-up` form". Update the pinned selection-rule regex at line 200 to the precise deferral.
3. **T1.** Replace lines 175–187 (the comment and the list `ordered()` call) with a one-line comment ("one contiguous span fixes membership, order and both list boundaries") and one `assertPhrases` entry for the full list span as it stands on `develop`: "only in a snapshot refusal, a `follow-up` limitation reply other than `follow-up stop`, and a tick's disabled-row notice, and never in a `follow-up stop` reply, a checkpoint-only tick, the `handle:pending` statement or the invalid-checkpoint notice; it never precedes". Drop `'only in'` and the seven output phrases from the `assertPhrases` list at lines 158–166. Let `oxfmt` choose the quote style; do not escape by hand.
4. **T2.** Update the invariant comment (lines 139–142) to the R1 rule (every invocation without a reference except `follow-up stop`) and wrap it at no more than 100 columns.
5. **Item 6.** Add one `doesNotMatch(/(?<![\w/-])#613\b/)` assertion over the whole of `src/tools/focus.md`, `src/shared/focus-session-contract.md` and `src/shared/focus-follow-up.md`. Remove the now-redundant slice-level check at line 174.
6. **Doc.** In the user guide, replace the sentence from "A snapshot request" (end of line 16) through "stays available." (line 18) with: "Every invocation, including one without a session reference such as `focus follow-up`, returns that pending statement followed by the missing capability, before any question about which session is meant and with no such question afterwards; only `follow-up stop` is excepted and stays available." Replace the sentence on lines 60–61 with: "Focus states that it is pending qualification on all hosts and returns the specific missing capability for its host and request instead of a verdict about unread content." Keep the surrounding sentences, and let the lines wrap at about 100 columns.
7. **Activation duties.** In the host-acceptance guide: at line 286, write "replaces the pending wording of the `focus` `catalogHint`, of its frontmatter `description` and of the user guide"; at line 319, write "the `focus` `catalogHint` and frontmatter `description`"; at line 322, write "replaces the pending wording of the `catalogHint`, the frontmatter `description` and the user guide".
8. Run the build. Only if `node build.mjs` fails the focus context budget, raise `CONTEXT_BUDGET_LINES.focus` (`build.mjs:2487`) to the measured count plus up to ten lines of headroom.

### Component structure

Not relevant: text and test changes only.

### State management

Not relevant.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- `{{FLOW}} focus follow-up stop` without a reference: no pending statement; the agent asks which loop to stop. Stop and handle cleanup authority stay unchanged.
- `{{FLOW}} focus follow-up` without a reference: refused first with the pending statement, once per reply, followed by the row's missing capability. No selection question precedes or follows it; the reply ends with the missing capability.
- `{{FLOW}} focus` without a reference: refused first, and no selection question follows.
- Tick prompt: always carries a reference, unaffected. A hand-typed `focus follow-up tick` without a reference or handle does not match the tick prompt exactly, so it is no tick and is refused first like a resume.
- A reworded output in the gate sentence that drops one of the seven phrases still fails the existing `assertPhrases` check.
- An ambiguous or conflicting session reference (as opposed to a missing one) is still clarified first and refused afterwards. The precise deferral at line 30 makes that explicit, because the gate says the refusal precedes clarification only for invocations without a reference.

## Acceptance criteria

- [ ] The selection rule in `src/shared/focus-session-contract.md` (line 30) contains "comes first where the gate says it precedes selection clarification" and no longer contains "wherever the gate states it".
- [ ] The gate sentence in `src/shared/focus-session-contract.md` contains exactly the fixed target clause "and for any invocation other than `follow-up stop` that has no session reference (for example `{{FLOW}} focus` or `{{FLOW}} focus follow-up`), which is refused before any selection is clarified", and no longer contains "never a `follow-up` form".
- [ ] `test/focus-contracts.test.mjs` asserts that exact clause, `doesNotMatch` "never a `follow-up` form", and the precise selection-rule deferral. Restoring either previous wording makes the test fail.
- [ ] The test pins the full list span ("only in a snapshot refusal, … the invalid-checkpoint notice; it never precedes") as one exact phrase. Moving, duplicating or adding an output in either list makes the test fail.
- [ ] The invariant comment states the R1 rule, and no comment line in the edited region of `test/focus-contracts.test.mjs` exceeds 100 columns.
- [ ] One `doesNotMatch(/(?<![\w/-])#613\b/)` assertion covers the whole of `src/tools/focus.md`, `src/shared/focus-session-contract.md` and `src/shared/focus-follow-up.md`. Adding a bare `#613` to the `catalogHint` makes the test fail.
- [ ] On whitespace-flattened text (for example the test's `flat()`), `docs/user-guide/tools-quality.md` contains the two fixed sentences from Approach step 6 and no longer contains "returns the missing snapshot qualification".
- [ ] On whitespace-flattened text, `docs/developer-guide/focus-host-acceptance.md` contains the three fixed phrases from Approach step 7.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass, and `pnpm eval focus verify --mode report` reports freshness debt only, with no integrity error. The focus catalog line in the three built routers is unchanged.

## Validation plan

- Check the R1, T1 and item 6 assertions by temporarily applying each regression locally: restore "never a `follow-up` form", restore "wherever the gate states it", duplicate one output into the other list, add a bare `#613` to the `catalogHint`. Confirm that each fails, then revert. These temporary edits are never committed.
- Run `node --test test/focus-contracts.test.mjs test/focus-eval.test.mjs`, then the full CI order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`, `pnpm eval focus verify --mode report` (expected: freshness debt only). Project tooling runs through `t3-project`.
- Read the rendered gate sentence in one built `tools/focus.md` to confirm that `{{FLOW}}` renders per target.

## Assumptions and open points

- Out of scope: which gate row's missing capability a refused resume reports on a host where the follow-up row is unmatched (for example local Claude Code or Codex CLI). The gate already says "the row's missing capability" for the row the actual host matches. This plan does not change that rule, which predates it.
- Editing focus-loaded sources again adds focus eval freshness debt. This was already accepted for #636, and the debt is cleared in the regular recorded rounds before release.
- A #613 acceptance candidate prepared before this lands is moved by the binding-drift rule, as noted in the #636 plan.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    2 |
| Testability     |        0 |         0 |    3 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         2 |    1 |

### Findings

- **Important (Architecture):** the fixed R1 clause attached the `follow-up stop` exception to "session reference", and its parenthetical read as a complete list. Incorporated: the clause now reads "any invocation other than `follow-up stop` that has no session reference (for example …)".
- **Important (Maintainability):** "next to the `catalogHint`" was ambiguous in the follow-up activation step, which names it twice. Incorporated: the frontmatter `description` is added at three named places (lines 286, 319, 322).
- **Note (Error cases):** the behavior for an ambiguous or conflicting reference was not stated. Incorporated as an explicit edge case: unchanged, clarified first and refused afterwards.
- **Note (Testability):** the user-guide edits had no fixed wording. Incorporated: both replacement sentences are fixed in Approach step 6, and the acceptance criterion checks them.
- **Note (Maintainability):** the T2 premise ("wrap at 100") was inaccurate, and the eval claim had no source. Incorporated: the premise is restated with measured widths, and the claim cites `TARGET_LOCATOR` in `evals/focus/_scaffold/evaluate.mjs:304`.
- **Note (Scope):** the `build.mjs` budget change is unlikely to be needed. Incorporated: it is conditional on `node build.mjs` failing the budget.

Deep interactive plan review (2026-11-09):

- **Important (Maintainability):** the user-guide replacement sentence narrowed the paragraph to reference-less invocations, left "first" ambiguous, and started one line too late. Incorporated: the fixed sentence now covers every invocation, states "before any question about which session is meant", and replaces from "A snapshot request" at the end of line 16.
- **Important (Error cases):** the selection rule's "wherever the gate states it" could be read so that ambiguous or conflicting references are refused first too. Maintainer decision: make line 30 precise ("where the gate says it precedes selection clarification") and update the pinned regex at line 200.
- **Note (Testability):** literal text checks on wrapped Markdown pass or fail by line breaks. Incorporated: the documentation criteria use whitespace-flattened text.
- **Note (Maintainability):** two of the three host-acceptance insertion points had no fixed wording. Incorporated: all three are fixed in Approach step 7.
- **Note (Testability):** the T1 cleanup left a stale comment and an open choice about the redundant phrases. Incorporated: lines 175–187 are replaced, the redundant phrases dropped, and the `ordered()` helper kept.
- **Note (Error cases):** whether a selection question follows a refuse-first reply was open. Maintainer decision: no question follows; recorded in the edge cases and in the user-guide sentence.
- **Note (Testability):** "the actual host's own missing capability" did not match the per-row gate and was contract jargon. Incorporated: "the specific missing capability for its host and request".

## Open points

- No open points.
