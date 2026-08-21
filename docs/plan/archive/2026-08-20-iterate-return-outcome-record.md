# A keyed outcome record for the iterate return

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)

## Requirement

PR #367 gave the `merge-gate` → `iterate` delegation a delimiter, a manifest and a minted boundary
token, so no caller-supplied review body can act as protocol on the way **in**. The way **back** has
none of that. `iterate` hands its outcome to the gate as prose, and the gate reads per-item outcomes
out of it to build the record condition 10 is evaluated against.

Verified against merged `develop` at `73a9498`. Three things about the exposure, stated precisely so
the plan is neither written against an imagined defect nor built on a comfortable one:

- **Condition 10 has no out-of-band cross-check.** It reads the Phase 3 per-finding record and
  nothing else.
- **Condition 6 does not backstop this channel.** It is scoped to bot **threads** — "every bot thread
  whose finding this run implemented" — and a review-**body** finding has no thread. A forged
  `implemented` for a body finding therefore costs one extra Phase-2 round and then passes: the head
  has not moved, the fresh round re-sets `VERIFIED_HEAD_SHA` to the same commit, and condition 10
  reads the forged outcome. `rejected` and `deferred` remain cheaper still, satisfying condition 10
  with no restart at all, but `implemented` is dearer rather than self-defeating.
- **Condition 7 is partly outcome-derived.** Its record is the thread IDs the gate handed over
  **plus** the threads whose findings it deferred or rejected. A forged outcome cannot make it block,
  but an outcome naming a thread the gate never delegated could add a never-assessed thread to that
  second list.

A bot's changes-requested review is excluded from the human-comment guard by Phase 1 rule 1, so
condition 4 does not backstop condition 10 for exactly the reviewer class this channel carries.

Two defects surfaced that are not about attacks at all:

- The outcome vocabularies **disagree**, across roughly fourteen sites, and the disagreement is
  categorical rather than lexical: `merge-gate` classifies _assessment_ outcomes, `iterate` classifies
  _processing_ outcomes, and "deferred" is a false friend between them. A third vocabulary — the
  `pr-review-handoff/v1` classification set — sits behind `iterate`'s and is where `skipped` is
  actually produced.
- The one sentence defining the entire return consumption has **no test behind it**.

This plan agrees the vocabulary and frames the return. It excludes the containment question — whether
returned prose may quote review bodies verbatim — and names below exactly what that leaves open,
rather than claiming it leaves nothing.

## Architecture decisions

- **The receiver pre-commits the key set, so the return needs no delimiter and no token.** The rule is
  keyed to every item identifier the run **recorded before delegating** — the identifiers it mints for
  body findings, plus the forge thread IDs it hands over in the item filter. "Recorded", not "minted":
  the gate mints identifiers only for body findings, and a rule keyed to minted identifiers alone
  would make every thread outcome inert and strand conditions 6 and 7.
- **The two halves of the key set carry different guarantees, and the plan says so.** Minted
  identifiers are unpredictable; forge thread IDs are assigned by the forge and publicly visible. The
  pre-commitment property is identical for both, and only the unpredictability differs.
- **Prose, not a helper operation.** A helper `build`/`parse` pair would put the matching in code,
  attractive because the forward direction chose prose precisely to avoid model arithmetic. Rejected
  because the rule reduces to a membership test against a list the receiver already holds, not
  arithmetic, and because splitting one delegation contract across prose and code adds a second place
  for the two ends to drift. Revisit if the rule grows past a membership test.
- **The minted identifier is a per-message channel key; the review id is the durable key.** It is
  minted fresh for each delegation, exactly as the boundary token is, so an identifier disclosed in a
  Phase 6 report or in a delegated gate's own return is useless in a later round. The durable
  per-finding record keys on the review id, with a finding ordinal where one review carries several.
- **A repeated identical outcome is idempotent; only a conflicting one is a mismatch.** Every gate
  delegation suppresses the summary comment, so `iterate` hands that content back — and that content
  restates which items were implemented, skipped or deferred. With no delimiter the receiver cannot
  separate the record from the summary, so a strict duplicate rule would fail correct rounds. An
  attacker who can predict the true value gains nothing by echoing it.
- **An unknown identifier is inert, not fatal** — but inertness buys narrowness, not immunity. A
  forged whole-run abort remains reachable and remains a denial of service in the fail-closed
  direction, exactly as the forward direction accepted.
- **The conflict-resolver return is a sibling, not part of this change.** It is also unframed, and it
  is the one place the gate demands verbatim untrusted content — a check's verbatim pre-change failure
  output, from commands the head branch supplies — which it parses a per-file record out of. Its
  threat model turns on the head branch rather than a reviewer, and its verbatim requirement needs
  re-examining on its own merits.

## Affected files

| File                                  | Description                                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/iterate.md`                | State the returned outcome record and the agreed closed vocabulary; align Phase 5's handback and Phase 6's table; carry the record in the wisdom file; reconcile the drift across its five vocabulary sites                                                                                                 |
| `src/tools/merge-gate.md`             | Replace the consumption sentence with the receiver rule; require the minted identifier to be unpredictable and per-message; correct the sentence describing identifiers as originating outside the gate; align the wisdom schema, the Phase 3 record and the ~seven sites stating the assessment vocabulary |
| `src/shared/pr-review-integration.md` | The sibling "exactly one returned item per supplied ID" contract and the handoff classification set that produces `skipped`                                                                                                                                                                                 |
| `docs/user-guide/tools-deliver.md`    | States the gate's outcome vocabulary and the per-finding assessment model; the documentation-sync gate makes this mandatory rather than optional                                                                                                                                                            |
| `test/workflow-contracts.test.mjs`    | Pin the receiver rule, the closed vocabulary on both ends, and the identifier requirement                                                                                                                                                                                                                   |

`src/shared/completion-protocol.md` is deliberately **not** in this table. It is eagerly included by
fifteen tools, five of which are budgeted at 700 rendered lines, and `review.md` currently renders at
684 — roughly sixteen lines of headroom before `node build.mjs`, one of this plan's own acceptance
criteria, fails. Put any note about `DONE`/`ABORT` being a sub-agent protocol in the two tools that
need it.

## Implementation details

### Approach

1. **Agree the outcome vocabulary.** Fix one closed set and use it on both ends. `merge-gate`'s
   `implemented | deferred | rejected` is the set condition 10 reasons about and is already pinned by
   an existing test that loops those three words inside condition 10 — extend it rather than replace
   it, or that test breaks. Map `iterate`'s `skipped` and `failed`, and an item **deselected** at its
   own approval gate, onto it explicitly; the plan's earlier draft omitted `deselected`. Treat the
   categorical difference as real: `merge-gate`'s words classify assessment, `iterate`'s classify
   processing, and "deferred" means different things on each side today. Reconcile all sites, not only
   `iterate`'s Phase 6 table.
2. **Correct the per-item abort claim while mapping.** `merge-gate` presumes a per-item `ABORT` that
   `iterate` never emits: every abort form `iterate` returns is whole-run, and a per-item failure is
   marked **failed**. Fix that sentence and its edge case rather than carrying the error forward.
3. **State the returned record.** For every item identifier the caller supplied — minted identifier or
   thread ID — `iterate` returns exactly one outcome from the agreed set. It mints no identifier of its
   own for a caller-supplied item and merges no two identified items into one outcome. The suppressed
   summary content still travels back; the receiver rule below is what makes its restatements harmless.
4. **State the receiver rule** in place of the consumption sentence. The gate counts an outcome only
   for an item identifier it recorded before the delegation. Repeated occurrences of the **same**
   outcome for one identifier are idempotent; a **conflicting** outcome for one identifier is a
   mismatch that ends the round unsuccessfully. An identifier with no outcome is the same mismatch. An
   outcome naming any identifier the run did not record is inert — reported, never recorded, and never
   fatal. Say plainly that no outcome is derived from anything else in the returned text; that sentence
   is the fix, and its absence is the defect.
5. **Bound and de-quote the inert report.** Nothing bounds how many inert outcomes a return may carry,
   and with containment deferred, echoing them puts attacker-controlled text into the gate's Phase 6
   summary and into its own return when the gate runs delegated. Report inert outcomes by identifier
   and count, never by reproducing their text, and bound how many are reported.
6. **Make the identifier unpredictable and per-message.** State the same concrete requirement the
   boundary token carries — at least 32 characters drawn from `A`–`Z` and `0`–`9`, chosen at random —
   rather than "comparable to". Also correct the sentence listing the stable identifiers among content
   that "originates outside this gate": it contradicts the sentence above it saying this run mints
   them. Decide and state whether the identifier leaves the absence-check scope or merely loses that
   label — an existing assertion pins the absence check near the phrase "caller-supplied value the
   manifest carries" and must survive the edit.
7. **Say what writes the Phase 3 record.** No outcome for a **delegated** item is derived from
   anything but the validated return. Two gate-internal writers exist and must be named rather than
   contradicted: a review with an empty body still has to be assessed — the review, not the finding, is
   the unit — and a finding assessed under an active human-comment guard is the gate's own decision.
   Neither has a delegated return, and the empty-body case has no identifier at all.
8. **Cover the identifier-free delegation.** The CI repair carries free text and no identifier, yet its
   return is consumed. State that the receiver rule governs identified items, and that the CI repair's
   outcome is consumed through the fresh check read and the whole-run abort instead.

### Edge cases

- **An outcome for an identifier the run did not record** — inert, reported by identifier and count.
  Never fatal: aborting here would hand a review body back the ability to cost a round.
- **A conflicting outcome for one recorded identifier** — mismatch, round unsuccessful.
- **The same outcome stated more than once for one identifier** — idempotent, not a mismatch. This is
  the ordinary case, because the suppressed summary restates outcomes.
- **A recorded identifier with no outcome** — mismatch. The key set was pre-committed, so absence is
  detectable.
- **An out-of-set value that the step 1 mapping recognises as a non-assessment** (`failed`, a
  deselected item) — the item is unassessed: the round survives and condition 10 blocks.
- **Any other out-of-set value** — mismatch, round unsuccessful.
- **Zero identifiers supplied** — a clean round. This is distinct from the existing empty-selection
  case, which is about a filter matching no thread.
- **A whole-run abort** — unchanged: the round counts as unsuccessful. Forgeable, and a denial of
  service in the fail-closed direction.
- **An empty-bodied review, or a finding deferred under the guard** — assessed by the gate itself, with
  no delegated return.

## Acceptance criteria

- [ ] One closed outcome vocabulary is stated in `src/tools/iterate.md` and `src/tools/merge-gate.md`,
      with explicit mappings for `skipped`, `failed` and a deselected item; a contract test asserts the
      same set on both ends and fails if either drifts.
- [ ] The existing condition 10 test that loops `implement`, `defer`, `reject` still passes.
- [ ] `merge-gate` no longer states that `iterate` returns a per-item `ABORT`.
- [ ] `iterate` states that it returns exactly one outcome per caller-supplied item identifier, minted
      identifier and thread ID alike.
- [ ] `merge-gate` states the receiver rule over identifiers **recorded** before the delegation, with
      same-value repetition idempotent, a conflicting value a mismatch, a missing outcome a mismatch,
      and an unrecorded identifier inert.
- [ ] `merge-gate` states that no outcome is derived from any other part of the returned text.
- [ ] Inert outcomes are reported by identifier and count, with a stated bound, and never by
      reproducing their text.
- [ ] The minted identifier requirement states at least 32 random characters from `A`–`Z` and `0`–`9`,
      minted per delegation message, with the review id plus a finding ordinal as the durable key.
- [ ] `merge-gate` no longer lists the stable identifiers among content originating outside the gate,
      and the existing assertion pinning the absence check near "caller-supplied value the manifest
      carries" still passes.
- [ ] The Phase 3 record is stated to be populated from the validated return for delegated items, with
      the empty-bodied review and the guard-deferred finding named as the two gate-internal writers.
- [ ] The CI repair's identifier-free return is covered explicitly.
- [ ] A contract test covers the consumption sentence, which has none today; removing the receiver rule
      makes it fail.
- [ ] No change reintroduces a declared byte count, an introducer-line grammar, or a whole-message
      absence check — five existing negative assertions in three families, two of which scan the entire
      file rather than one section, must stay green.
- [ ] The forward direction's four control lines are untouched; the return is declared in its own
      section, not as a fifth control line.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all pass.
- [ ] No new configuration key is introduced.

## Validation plan

- The four repository checks, run from the execution root.
- A revert check for every new assertion: confirm it fails against a tree without its rule, and confirm
  the mutation actually applied before trusting the result. Two vacuously passing assertions have
  already shipped in this area.
- A targeted check that removing the receiver rule alone fails the new consumption test.
- A rendered-line check on any tool whose eager includes changed, because `review.md` sits about
  sixteen lines under the 700-line budget.
- A grep sweep confirming the retired vocabulary wording is gone rather than merely supplemented.

## Assumptions and open points

- **Containment is deferred, and it leaves three exposures open.** A forged `rejected` for a _thread_
  ID is reached by the receiver rule under this plan, but the verbatim echo path is not: with inert
  outcomes de-quoted per step 5 the direct echo is closed, while quoted review text inside legitimate
  outcome prose still reaches the Phase 6 summary and, when the gate runs delegated, its own return. A
  forged `implemented` for a body finding still merges after one extra round, because condition 6 does
  not reach body findings. The earlier claim that the receiver rule makes quoted text harmless was too
  strong: it makes quoted text unable to **forge an outcome**, which is not the same thing.
- The conflict-resolver return is a known sibling instance and is not planned here.
- `DONE`/`ABORT` comes from a fragment written for internal sub-agents, not workflow handoffs. Noted
  rather than restructured, and deliberately kept out of that fragment for the budget reason above.
- The plan relies on the existing requirement that `iterate` returns each caller-supplied identifier
  unchanged and merges no two identified items.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         3 |    1 |
| Security        |        0 |         3 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         4 |    1 |
| Testability     |        0 |         3 |    0 |
| Scope           |        0 |         2 |    2 |
| Maintainability |        0 |         3 |    0 |

### Findings

The deep review verified every claim against merged `develop` and falsified two of them. Its
decision-requiring points were each decided and incorporated.

- **Critical, Architecture — the strict duplicate rule would fail correct rounds.** Every gate
  delegation suppresses the summary, whose handed-back content restates the outcomes, and with no
  delimiter the receiver cannot separate it from the record. Resolved by decision: same value
  idempotent, conflicting value a mismatch.
- **Important, Architecture — the key set is not uniform.** Thread items travel under forge thread IDs,
  not minted identifiers, so a rule keyed to minted identifiers would strand conditions 6 and 7.
  Resolved by decision: keyed to everything recorded before delegating, with the differing guarantees
  stated.
- **Important, Architecture — identifier lifetime was undecided.** Resolved by decision: per-message
  channel key, review id plus finding ordinal as the durable key.
- **Important, Architecture — step 5 contradicted an existing rule.** An empty-bodied review must be
  assessed without any delegated return. Incorporated as step 7, naming both gate-internal writers.
- **Important, Security — "condition 6 fails closed" was false for this channel.** It is scoped to bot
  threads and a body finding has none, so a forged `implemented` costs one round and then passes.
  Corrected in the requirement.
- **Important, Security — "condition 7 is not a return consumer" was half false.** Its deferred-or-
  rejected list is outcome-derived. Corrected, and reached by the widened key set.
- **Important, Security — inert outcomes are unbounded and echoed.** Crowding out is not closed by
  unpredictability. Incorporated as step 5.
- **Important, Error cases — out-of-set handling was stated two ways.** Resolved by decision:
  unassessed for mapped non-assessments, mismatch otherwise, with `deselected` added to the mapping.
- **Important, Error cases — `merge-gate` presumes a per-item `ABORT` that `iterate` never emits.**
  Incorporated as step 2.
- **Important, Error cases — the CI repair delegation carries no identifiers** and its return is
  consumed. Incorporated as step 8.
- **Important, Testability — the vocabulary is stated at ~14 sites, not two**, and a third vocabulary
  sits behind `iterate`'s. Step 1 widened accordingly.
- **Important, Testability — an existing test already pins the three assessment words** inside
  condition 10, so the set must be extended rather than replaced.
- **Important, Testability — five negative assertions in three families**, two scanning whole files.
  Criterion widened from three.
- **Important, Maintainability — `completion-protocol.md` has ~16 lines of budget headroom** across
  fifteen eager includes. Removed from the affected files with the reason recorded.
- **Important, Maintainability — two affected files were missing**: the user guide surface the
  documentation-sync gate makes mandatory, and the sibling handoff contract.
- **Important, Maintainability — the identifier requirement was unmeasurable** ("comparable to").
  Replaced with the token's concrete numbers.
- **Note, Architecture — inertness buys narrowness, not immunity**; the rationale overclaimed and is
  corrected.
- **Note, Error cases — a returned outcome disagreeing with the forge** is cross-checked only for
  implemented threads. Named as out of scope.
- **Note, Scope — deferring containment leaves three named exposures**, replacing the earlier claim
  that it left none.
- **Note, Scope — the conflict-resolver return** is recorded as a sibling, not planned here.

Verified sound and left unchanged: the pre-commitment property the rule rests on, the exclusion of bot
reviews from the human-comment guard, the prose-over-helper decision, and the validation plan's revert
discipline.

## Open points

- No open points.
