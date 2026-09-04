# Reduce goal-driven completion control to its invariants

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Refactoring (`effective-flow refactor`)

## Requirement

`src/shared/goal-completion.md` states the completion contract for every implementation workflow.
Its fourth bullet — "Visible progress" — is a single Markdown list item of **2 893 characters**, 66 %
of the whole file, and it prescribes the mechanics of a harness's native task tool in detail rather
than the guarantee those mechanics exist to produce.

The fragment is included **eagerly in ten tools**, so it is always-loaded context in every
implementation workflow, and roughly 1 100 tokens of it are paid ten times over. `merge-gate` then
immediately follows the include with its own paragraph narrowing which parts apply to it — evidence
that the fragment carries more than any single site needs.

The goal is to state the nine invariants the fragment actually guarantees and let each harness's own
task tooling supply the mechanics, so a harness change no longer forces a source edit here.

This plan covers **only** this fragment. Finding F-16 of
`docs/review/2026-08-31-architecture-and-consistency-review.md` named two further surfaces; both were
re-examined and are deliberately out of scope (see "Architecture decisions").

## Architecture decisions

- **Preserve every invariant; delete only prescription.** The nine invariants below are the contract.
  Any sentence that survives must serve one of them; any sentence that only describes _how_ a
  particular task tool behaves goes.
- **State capability, not mechanism.** Follow the pattern the sibling fragment
  `src/shared/task-tracking.md` already uses — "use an available TODO or task-tracking tool (e.g.
  `TaskCreate`/`TaskUpdate`, `TodoWrite`, or a comparable tool)" — which is capability-shaped and has
  needed no edit as harnesses changed. `goal-completion` currently re-specifies that same ground at
  much greater length and much tighter coupling.
- **Write the contract test first, against the current file.** The fragment has no substantive test:
  the only two references in `test/` assert that the built file exists and that its heading survives
  the harness transform. The single real risk of this change is silently dropping an invariant while
  compressing, and a test written against the current text — green before any prose is touched — is
  what converts that risk into a failing build.
- **Establish completeness by classification, not by extraction.** A test derived from the invariant
  list can only prove that the test and the list agree; it cannot prove the list is complete, so a
  tenth invariant nobody spotted would be deleted with a green suite. The run therefore enumerates
  **every sentence** of the current fragment and assigns each one to `invariant` or `mechanism` with
  a written reason. Nothing may stay unclassified. That turns the derivation into a covering
  argument: an overlooked invariant surfaces as a sentence that fits neither bucket instead of
  staying invisible.
- **The context budget measures lines; this change is measured in characters.** Rewriting one
  2 894-character line into readable invariants raises the line count while lowering the token cost,
  so the affected ratchets **rise** here. That is against the direction ratchets otherwise move and
  is done deliberately, with the reason recorded at the entries: this is the one case where the line
  metric and the real context cost point opposite ways. A file whose bullet is a single enormous line
  costs one line of budget and roughly 700 tokens, which is the blind spot this change exposes rather
  than creates.
- **Keep the fragment eager.** Deferring it is not part of this change. It is loaded at the start of
  every run that has phases, so a pointer would relocate the load rather than avoid it — the same
  reasoning that made `config-migration` a split rather than a deferral.
- **Do not touch the ten consumers' scope-narrowing paragraphs.** They are each consumer's statement
  of which invariants apply to it, and they remain correct against a shorter fragment.
- **Out of scope, with reasons.** F-16 named three surfaces; examination showed they are three
  different problems:
  - `session-title.md` / `session-rename.md`: the intent/mechanism separation F-16 asks for
    **already exists as a file boundary**, and the always-loaded problem was fixed separately. What
    remains — that `session-rename.md` devotes 232 of 282 lines to one host — collides with roughly
    134 wording-pinned assertions, with `src/tools/setup.md` reading the fragment from disk at
    runtime and printing a fenced block verbatim, and with clauses whose test comments record
    live-test provenance. A separate plan, not this one.
  - `merge-gate` Phase 2/3: its branching is on **forges**, not harnesses, and every bot name in it
    is an illustration rather than a branch, so a harness-motivated change buys little there. It also
    has no behavioural safety net: the eval scenarios added in `evals/merge-gate/` configure
    `mergeGate.bots` empty by design, so Phase 3 never executes in any archived run. A third eval
    scenario with a configured reviewer is the prerequisite for touching it.
  - F-16 additionally mislocated the bot-acknowledgement rule in Phase 2/3. It sits in
    `## Configuration` and is a **negative** rule — that nothing may be inferred from an emoji
    reaction — which is durable evidence discipline rather than a bot integration. Nothing to change.

## Affected files

| File                                   | Description                                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `test/workflow-contracts.test.mjs`     | New contract test pinning the invariants; written and green **before** the prose changes                                   |
| `src/shared/goal-completion.md`        | Rewritten: bullet 4 reduced from one 2 893-character item to the invariants it guarantees; bullet 3's stale clause removed |
| `build.mjs`                            | The affected `CONTEXT_BUDGET_LINES` entries raised by the measured line delta, with the reason at the entries              |
| `docs/developer-guide/architecture.md` | Only if it describes the fragment's content; verify during the run                                                         |

## Implementation details

### The nine invariants that must survive

1. Exactly one declared, measurable completion condition, derived from the basis, naming the target
   state, the concrete check, and the scope boundary — including what is deliberately not changed.
2. It is verified by **independent instances**, never by self-assessment.
3. Correction rounds are **bounded**; exhaustion escalates to the user instead of looping.
4. **Exactly one workflow owns the progress overview** on the shared surface, with the named handoff:
   `apply-plan` hands ownership to its selected target workflow before that workflow's phases begin;
   `apply-issues` and `apply-review` retain it; a delegated subworkflow reports rather than opening a
   second overview.
5. Every known phase and dynamic entry reaches a **truthful visible end state** before completion is
   reported.
6. **Terminal failure or abort never satisfies the completion condition.**
7. A step awaiting user input stays open, carrying its blocker.
8. Progress updates are **not gates** — the run continues unless an existing approval rule or a
   genuine blocker applies.
9. A failed tracking update is reported **once**; tracking moves to chat without claiming a
   successful tool update, and the domain work continues.

### Approach

1. **Classify every sentence** of the current fragment as `invariant` or `mechanism`, with a written
   reason each, and leave nothing unclassified. Reconcile the resulting invariant set against the
   nine above: a tenth invariant extends the list before any test is written, and a sentence that
   fits neither bucket is reported rather than silently dropped.
2. Write the contract test against the **current** fragment and confirm it passes. Assert each
   invariant by a stable token that does not depend on the sentence around it, so a rewrite is free
   to reword. Invariants 2, 4, 6 and 9 are the ones most easily lost when compressing and each needs
   its own assertion rather than a shared one.
3. Rewrite bullet 4 to state invariants 4–9 in readable form. Remove the task-tool mechanics: the
   single-active-entry branch, the parallel-tool-batch ordering rule, the harness-isolated
   subcontext, the native-end-state-versus-suffix instruction, and the task-tool-unavailable
   fallback, which `task-tracking.md` already covers in capability-shaped form.
4. Remove the clause in bullet 3 stating that Effective Flow "neither offers nor starts a
   harness-native autonomous run" — it is residue of a removed feature, not a live rule. Confirm that
   reading during the run before deleting it.
5. Leave bullets 1–3 otherwise intact; they are already invariant-shaped.
6. Re-run the contract test. It must still pass, unchanged, against the rewritten fragment. A test
   that had to be edited to pass is the signal that an invariant moved or was lost.
7. Measure the line delta the rewrite produces in each of the ten consumers and raise exactly those
   `CONTEXT_BUDGET_LINES` entries by it, with the reason recorded at the entries. Report the
   character delta beside it, because that is where the actual win is.

### Edge cases

- **A rewrite that satisfies the test by keeping the old wording.** The test pins tokens, not
  sentences; verify separately that the character count actually fell.
- **`{{AGENT:code-validator}}` reference in bullet 2** must survive the rewrite, or the build's
  reference guard fails. That is a useful backstop for invariant 2 but is not a substitute for its
  own assertion.
- **A consumer whose scope-narrowing paragraph contradicts the shortened fragment.** Read
  `merge-gate.md`'s narrowing paragraph after the rewrite and confirm it still reads correctly.
- **The build's `{{AGENT:…}}` and heading transforms** must keep working; `build-lib.test.mjs`
  asserts the rendered heading matches `/Goal-driven completion control/`, so the heading text is
  fixed.
- **`apply-issues` has one line of budget headroom.** It is the tightest of the ten and will need its
  ratchet raised before the rewrite can build at all.

## Acceptance criteria

- [ ] Every sentence of the original fragment is classified `invariant` or `mechanism` with a reason,
      and none is left unclassified.
- [ ] A contract test in `test/workflow-contracts.test.mjs` asserts all invariants, and it passes
      against the **unmodified** fragment before any prose is changed.
- [ ] After the rewrite, that same test passes **without having been edited**.
- [ ] `src/shared/goal-completion.md` contains no sentence naming a task tool's internal state model,
      batching semantics, subcontext isolation, or end-state suffixes.
- [ ] The file is at most **2 600 characters** (from 4 416) and no single line exceeds 400
      characters. Bullets 1–3 are 1 464 characters and stay intact, so a target below roughly 2 400
      would contradict step 5.
- [ ] `node build.mjs`, `pnpm test`, `pnpm agent:check` and `pnpm test:distribution` all pass.
- [ ] Each affected `CONTEXT_BUDGET_LINES` ratchet is raised by exactly the measured line delta and
      carries the reason at its entry. The character cost of the fragment falls by at least 40 %,
      replicated across ten eager consumers; that reduction, not the line count, is the win.

## Validation plan

- Run the contract test against the unmodified fragment first; a failure there means the invariants
  were misread and the plan's premise is wrong.
- Run the full CI sequence in the order `AGENTS.md` prescribes: `pnpm agent:check`, `pnpm test`,
  `node build.mjs`, `pnpm test:distribution`.
- Compare the built output before and after: the ten consuming tools must differ **only** by the
  rewritten fragment, and no other rendered file may move.
- Mutation-check the new test: delete one invariant from the rewritten fragment and confirm the test
  fails, for at least invariants 2, 4, 6 and 9.
- Record the character count before and after, and the per-tool line and character deltas.

## Assumptions and open points

- **Assumption:** the nine invariants are the complete set. They were derived from a single reading,
  so the plan no longer rests on that: step 1 classifies every sentence and extends the list before
  any test exists. A green first run of the test confirms the test matches the list, never that the
  list is complete — only the classification does that.
- **Assumption:** no consumer depends on the removed mechanics in a way no test would catch. Ten
  eager sites were identified; two scope-narrowing paragraphs were read, not all ten. The run should
  read the remaining eight.
- **Assumption:** `docs/developer-guide/architecture.md` does not restate the fragment's content.
  Verify during the run rather than trusting this.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    1 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    0 |

### Findings

Deep interactive review, 2026-09-02. Two of the three important findings were defects in this plan's
own arithmetic and were found by recomputing its numbers rather than by re-reading its prose.

- **Important (Error cases) — incorporated.** The acceptance criterion "at most 1 600 characters"
  contradicted approach step 5, which keeps bullets 1–3 intact. Those bullets are 1 464 characters
  and the heading 58, so with invariants 4–9 the file cannot land below roughly 2 400. The 65–70 %
  figure came from the review, which had assumed the whole file would be rewritten. Corrected to
  2 600 characters, with the arithmetic stated at the criterion so it cannot drift back.
- **Important (Architecture) — decided and incorporated.** The plan asserted that the always-loaded
  budgets would fall. They will rise: the budget counts **lines**, and turning one 2 894-character
  line into readable invariants adds roughly 7–11 lines to each of the ten eager consumers. Measured
  headroom is 1 line for `apply-issues`, 5 for `apply-review`, 6 for `refactor`, `maintain` and
  `iterate`, and 8 for `apply-plan` — six of ten would break the build. Resolved by raising exactly
  those ratchets by the measured delta with the reason recorded at the entries, and by stating the
  real win in characters. The underlying blind spot — a single enormous line costing one line of
  budget and roughly 700 tokens — is exposed by this change, not caused by it.
- **Important (Testability) — decided and incorporated.** A contract test derived from the invariant
  list cannot establish that the list is complete; a green run proves only that test and list agree.
  The plan now classifies every sentence of the fragment as invariant or mechanism with a written
  reason and leaves nothing unclassified, so an overlooked invariant surfaces as an unclassifiable
  sentence. The corresponding assumption was rewritten to say what the test does and does not prove.
- **Note (Scope):** the plan deliberately narrows F-16 from three surfaces to one. The other two are
  recorded with their reasons rather than dropped, and each needs its own plan — the merge-gate one
  behind an eval prerequisite.
- **Note (Architecture):** shortening the fragment weakens a guarantee Effective Flow currently states
  itself and will thereafter rely on the harness to provide. That is the intended trade of F-16, but
  a harness with weak task tooling degrades further than today. Invariant 9 bounds it.
- **Note (Error cases):** the character-count criterion is a proxy for "prescription removed" and
  could be met by unrelated deletion. The mutation check in the validation plan is what actually
  guards the invariants.

## Open points

- No open points.
