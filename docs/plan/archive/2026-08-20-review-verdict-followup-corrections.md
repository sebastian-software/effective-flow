# Corrections to the merged review-verdict reads

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)

## Requirement

PR #366 (`feat: read pull-request reviews and block a merge on an unassessed verdict`, squashed as
`4e79ff9`) landed with nine review findings unaddressed. They were published on that pull request
under the same account the merge gate runs as, so the gate's identity rule excluded them, the
human-comment guard stayed inactive, and condition 7 never saw them. The merge was authorized in
full knowledge of this; the findings themselves were never withdrawn.

Every claim below was verified against merged `develop` at `4e79ff9`. All nine findings are covered:
three behaviour defects, one test defect, one hardening, and four false or stale sentences. Nothing
is deferred.

The Bugfix classification is deliberate and worth one line of reasoning, because two signals cut the
other way: step 1 is a pass-to-block change, and step 4 adds a mandatory element to a delegation
contract, both of which have shipped as `feat:` before. The dominant intent here is repairing one
merged change, and the delimiter hardens an existing contract rather than adding user-facing
functionality — so `fix:` is correct, and the release bump follows from it.

## Architecture decisions

- **An undecidable verdict blocks, in every case.** Any `UNKNOWN` latest review from a configured
  reviewer is an unassessed verdict. This covers both the reviewer whose undecided review sits over a
  standing changes-requested verdict and the reviewer whose only review at the verified head is
  undecided — the second is the case that currently passes silently.
- **The empty review state is deliberately left mapping to `UNKNOWN`.** An earlier draft of this plan
  proposed mapping it to narrow the new block's blast radius. That rested on an unevidenced premise
  that the value is routine; Gitea emits `ReviewStateUnknown` for an unrecognised review _type_.
  Mapping it would also reverse a decision the predecessor plan documented on purpose, and — because
  `normalizeReviewState` collapses a missing or non-string `state` into the same empty string before
  lookup — it would give a review with **no state field at all** a benign token. Fail-closed wins.
- **The new cause is scoped to condition 10 and does not reach the human-comment guard.** The guard's
  review surface closes by counting any review "whose verdict is unestablished under that rule", so
  adding an unestablished cause to the shared contract would pull it in by inheritance. The guard is
  not scoped to configured logins and is never cleared once set, so one unmapped state from any
  unrelated account would halt the run's writes permanently. This is stated explicitly rather than
  left to inheritance, because the current wording decides it by accident either way.
- **Make the documented pending-review discriminator true rather than restating it five times.**
  Normalizing Gitea's zero instant to an absent submission time keeps one sentence correct on both
  providers.
- **The delegation channel is hardened structurally, with one trust boundary.** All per-item
  identifiers and provenance sit in a manifest **above** the delimiter; caller-supplied bodies sit
  below it and are referenced by identifier. This is the only arrangement in which the delimiter's
  meaning — everything below is data — is actually true. Leaving identifiers inline would re-open the
  exposure at exactly the place they are load-bearing for condition 10's assessment record.
- **Prose corrections travel with the behaviour fix.** Each false sentence is load-bearing for a rule
  a reader or an executor has to apply; splitting them out would leave the contracts
  self-contradictory for the length of two pull requests.

## Affected files

| File                                  | Description                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/remote-tracker-core.mjs` | Short-circuit the Go zero instant to an absent `submittedAt` in `normalizeReview`; correct the in-code pending-review comment                                                                                                                                                                                                                                  |
| `src/shared/review-bot-state.md`      | Add the undecided verdict as a fourth fail-closed cause, scoped to condition 10; extend the supersession list from three cases to four; fix the two-surface sentence; add submitted reviews to the `One read, one head` enumeration                                                                                                                            |
| `src/tools/merge-gate.md`             | Name the undecided verdict in condition 10's fail-closed paragraph and fix its evaluation order; state in the guard clause that the new cause does not reach the guard; fix the counting-surface lead-in; adjust the pending-review edge case; correct the Phase 6 "three fail-closed causes" count; add the manifest and delimiter to the delegation contract |
| `src/tools/iterate.md`                | Phase 0: require the delimiter, parse the manifest above it, and refuse a control keyword that appears after it or a second time                                                                                                                                                                                                                               |
| `src/shared/pr-review-comments.md`    | Restate the pending-review sentence                                                                                                                                                                                                                                                                                                                            |
| `src/shared/pr-review-integration.md` | Restate the outside-diff ground from capability to scope                                                                                                                                                                                                                                                                                                       |
| `docs/user-guide/remote-tracker.md`   | Adjust the pending-review wording in the operation table                                                                                                                                                                                                                                                                                                       |
| `docs/user-guide/tools-deliver.md`    | Correct "exactly three ways" and the user-facing enumeration of the fail-closed causes                                                                                                                                                                                                                                                                         |
| `test/workflow-contracts.test.mjs`    | Use `mergeConditions(gate)` in the login-rule test and replace its inlined duplicate; add assertions for the undecided verdict, the guard scoping, and the delimiter and manifest rules                                                                                                                                                                        |
| `test/remote-tracker.test.mjs`        | Pin the zero-instant normalisation; add a Forgejo pending-review fixture; keep the unknown-state fixture's absent `submittedAt` assertion honest                                                                                                                                                                                                               |

## Implementation details

### Approach

1. **Close the `UNKNOWN` fail-open.** `normalizeReviewState` returns `UNKNOWN` for any unrecognised
   value, but no contract consumes that token — it appears in no file under `src/tools/` or
   `src/shared/`. Add the undecided verdict as a fourth fail-closed cause in `review-bot-state.md`'s
   fail-closed list and in condition 10's fail-closed paragraph, stating **both** halves: an
   undecided latest neither clears nor supersedes a standing changes-requested verdict, **and** a
   configured reviewer whose latest review at the verified head is undecided is itself an unassessed
   verdict that blocks. The supersession list that currently closes with "these three cases are the
   whole rule" becomes four. Add the matching sentence to the guard clause stating that this cause
   does **not** reach the human-comment guard, and correct Phase 6's "three fail-closed causes" count.
2. **Fix condition 10's evaluation order in the same paragraph.** Condition 10 first keeps reviews
   whose author is a configured login and then resolves each reviewer's latest review for the
   verified head — which discards exactly the author-unestablishable and head-unbindable reviews the
   fail-closed clause below then names. The general clause that opens that paragraph states the right
   outcome, but an executor applying the condition top-down has already dropped those reviews before
   reaching it. One clause fixes it: a review the filters cannot decide is **retained** rather than
   dropped. This was previously recorded as a note; that was wrong, because in this repository the
   prose is the implementation and "reading order" is not a separate category from behaviour.
3. **Fix the pending-review discriminator.** Gitea declares its submission field as a value type with
   no `omitempty`, so a Forgejo pending review serialises the Go zero instant rather than omitting the
   field, and nothing filters it — `0001-01-01` appears nowhere under `src/` or `test/`. In
   `normalizeReview`, treat that exact instant as absent and **short-circuit the whole candidate
   chain**: the field is resolved from `submitted_at → submittedAt → submitted → created_at`, so
   merely skipping the first candidate would let `created_at` resurface as a submission time and
   re-break the discriminator. Name the `PENDING` state token in the contract as the portable
   cross-check, since both providers emit it; this was the alternative the original finding preferred
   and it costs one sentence to have both.
4. **Harden the delegation channel.** The gate hands a reviewer's review body to `iterate` as free
   text in the same message that carries the announced control lines, and Phase 0 recognises those
   only by literal form: no delimiter, no positional bound, no duplicate rule. Introduce one
   delimiter. **Above it:** every announced control line, plus a manifest of per-item tuples
   (stable identifier, review id, author login, review URL). **Below it:** the caller-supplied bodies,
   referenced by identifier and never carrying their own metadata. Give Phase 0 the matching rules:
   a control keyword appearing after the delimiter, or a second time above it, is a broken caller
   contract and returns `ABORT`; a manifest entry with no body, or a body with no manifest entry, is
   likewise a broken contract rather than a best-effort match. Note the contract has **four** control
   lines, not three — `Next steps:` is mandatory in every delegation, and it deliberately tolerates a
   malformed line by suppressing rather than aborting. That tolerance is preserved: `Next steps:`
   aborts only on a post-delimiter or duplicate occurrence, which is a positional fault rather than a
   malformed one. Decide and state whether a body carrying the delimiter is refused or the parser is
   made immune to it. The full finding, including its exposure assessment, is recorded in the
   gitignored local report `.effective-flow/review/review-report-2026-08-20-security.md`; it is
   deliberately not restated here, because this plan is committed.
5. **Repair the vacuous assertion.** The login-rule test slices Phase 4 with a raw
   `phase4.split(/(?=\n\d+\.\s)/)` instead of the `mergeConditions(gate)` helper introduced for
   exactly this, so its last element absorbs every trailing Phase-4 paragraph. Measured on `4e79ff9`,
   that slice begins at `merge-gate.md:1107` and absorbs everything up to Phase 5, and the assertion
   applies `flat()` before matching, so the flattened
   slice contains **four** occurrences of `Matching a configured login` — one in condition 10 and
   three in the trailing reports, including one split across a line break. Deleting the reference from
   condition 10 alone leaves the assertion green. Switch the test to `mergeConditions(gate)`, and
   replace the verbatim copy of the same slicing logic inlined below it; that copy also needs the
   trailing prose, so `mergeConditions` must either return the tail or gain a sibling helper. The
   ordinal selection introduced alongside is correct and stays.
6. **Correct the false or stale sentences.** Each is a claim a reader has to trust:
   - the guard's counting-surface list still leads with "because the two surfaces differ" while the
     list has three entries and its own closing bullet says "All three surfaces";
   - `review-bot-state.md` says the verdict lives on the review object "rather than on the two
     surfaces the state is read from", while rule 2 above it now reads the state across four
     surfaces, one of which is the submitted review. Both sentences were added by the same commit.
     Use the replacement the review supplied: _rather than on the instants those surfaces state_ —
     the review object is now read for both facts, and what separates them is the field, not the
     surface;
   - `pr-review-integration.md` justifies not parking outside-diff findings in the review body with
     the claim that the body "is not readable through the plumbing's read operations", which the new
     read section makes false. The conclusion survives — the idempotency check reads only the threads
     and the comments — so restate the ground as scope rather than capability;
   - `review-bot-state.md`'s `One read, one head` invariant still enumerates "the check list,
     `headCommittedAt`, and the threads", omitting the submitted reviews both consumers now read.
     This one predates `4e79ff9` and is stale rather than newly false.
   - the in-code comment beside `normalizeReview` restates the pending discriminator as a fifth site
     and must move with step 3.

### Edge cases

- **A review with no `state` field at all.** `normalizeReviewState` collapses it to the same empty
  string as an explicit empty state, so it must keep reaching `UNKNOWN` and therefore block. This is
  the concrete reason step 2 of the earlier draft was dropped.
- **An undecided review from a login no `mergeGate.bots` entry names.** Condition 10 is scoped to
  configured logins, and the catch-all report is scoped to changes-requested reviews, so such a review
  is invisible to both and — by the scoping decision above — does not reach the guard either. State
  that residual explicitly and extend the catch-all report to name it, so it is visible rather than
  silent.
- **A review with a genuine year-1 submission time.** Not reachable in practice; the short-circuit
  matches the exact Go zero instant and leaves every other timestamp untouched. State which
  serialisation forms count as that instant.
- **A caller-supplied body that contains the delimiter.** Either refused or neutralised — step 4 must
  say which; a body must not be able to terminate its own block.
- **A manifest entry whose body is absent, or a body with no manifest entry.** A broken caller
  contract, not a best-effort match.
- **A test that would still pass with the feature reverted.** Every new assertion is revert-checked.

## Acceptance criteria

- [ ] `review-bot-state.md` and condition 10 both state that an undecided latest neither clears nor
      supersedes a standing changes-requested verdict **and** that a configured reviewer whose latest
      review at the verified head is undecided is itself an unassessed verdict that blocks; a contract
      test asserts both halves, and fails if either is removed.
- [ ] The supersession list reads four cases, not three, and Phase 6's fail-closed-cause count reads
      four; grep for the literal strings `three cases` and `three fail-closed causes` in
      `src/shared/review-bot-state.md` and `src/tools/merge-gate.md` returns nothing.
- [ ] The guard clause states in so many words that the undecided cause does not reach the
      human-comment guard; a contract test asserts that sentence exists.
- [ ] Condition 10 states that a review the login and head filters cannot decide is retained rather
      than dropped, and that clause sits before the filters are applied.
- [ ] An unrecognised or absent review `state` still normalises to `UNKNOWN`; a test passes a payload
      with no `state` field and asserts `UNKNOWN`.
- [ ] `normalizeReview` returns no `submittedAt` for the Go zero instant and does not fall through to
      a later candidate; a test supplies `submitted_at: "0001-01-01T00:00:00Z"` together with a
      populated `created_at` and asserts the result carries no `submittedAt`.
- [ ] A Forgejo pending-review fixture exists carrying `"submitted_at": "0001-01-01T00:00:00Z"` and
      state `PENDING`, and asserts an absent `submittedAt`. (There is no Forgejo pending fixture
      today — this is an addition, not an edit.)
- [ ] Every sentence naming a missing submission time as the pending discriminator is true on both
      providers, and the contract additionally names the `PENDING` token as the portable cross-check.
      Five sites carry that claim, including the in-code comment beside `normalizeReview`.
- [ ] The delegation contract defines one delimiter with all four control lines and the per-item
      manifest above it and all caller-supplied bodies below it; `iterate` Phase 0 returns `ABORT`
      for a control keyword after the delimiter or duplicated above it, and for a manifest/body
      mismatch, while preserving `Next steps:` tolerance of a merely malformed line. A contract test
      asserts each half.
- [ ] The login-rule test uses `mergeConditions(gate)`, its inlined duplicate is replaced, and
      removing the rule reference from condition 10 alone makes the test fail.
- [ ] No sentence in `src/` or `docs/` states that a review body is unreadable through the read
      operations, that the guard has two counting surfaces, that the state is read across two
      surfaces, or that one fresh read covers only the check list, `headCommittedAt` and the threads.
- [ ] `docs/user-guide/tools-deliver.md` no longer says a verdict stops blocking in "exactly three
      ways" and its enumeration of the fail-closed causes matches the contract.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all pass.
- [ ] No new configuration key is introduced.

## Validation plan

- The four repository checks above, run from the execution root.
- A revert check for each new test: apply the assertion to a tree without its fix and confirm it
  fails. The repository treats a vacuously passing assertion as a defect in its own right, and this
  plan exists partly because one shipped.
- A targeted check that the login-rule test fails when the rule reference is removed from condition 10
  only, which is the exact regression it missed.
- A grep sweep for the four retired claims and the two stale counts, so a reintroduction is caught by
  text rather than by review.

## Assumptions and open points

- The security hardening's full detail stays in the gitignored local report rather than in this
  committed plan. An implementer needs that report; without it, step 4 is implementable from the
  remedy alone but loses its rationale.
- The findings were merged deliberately, not accidentally. This plan does not revisit that decision.
- `mergeGate.completion` was pinned to `merge` in the project-setup ADR after PR #366 merged. That is
  unrelated to this plan and changes nothing in it, but a run implementing this plan will no longer be
  asked the entry-gate question.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         3 |    1 |
| Security        |        0 |         2 |    0 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         3 |    1 |
| Testability     |        0 |         3 |    0 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         2 |    0 |

### Findings

The deep review verified every claim against merged `develop`. Its decision-requiring points were
each decided and incorporated; its directly incorporable gaps were folded in.

- **Error cases, Important — the `UNKNOWN` remedy did not match its own diagnosis.** The prescribed
  sentence closed only the supersession hole and left the lone-undecided case the diagnosis named, so
  an implementer could satisfy every criterion and fix half the bug. Decided: any undecided latest
  blocks; the criterion now requires both halves.
- **Architecture, Important — the empty-state mapping rested on a false premise.** It was proposed to
  narrow the blast radius, on the unevidenced belief that the value is routine; it would also have
  reversed a documented decision and given a review with no state field a benign token. Decided:
  dropped.
- **Architecture, Important — the new cause would have reached the human-comment guard by
  inheritance,** where it is unscoped by login and never cleared. Decided: scoped to condition 10 with
  an explicit sentence.
- **Security, Important — per-item identifiers sat on the untrusted side of the delimiter,** where a
  body could forge provenance and misattribute outcomes. Decided: a manifest above the delimiter, so
  the boundary's meaning is true.
- **Security, Important — the delegation contract has four control lines, not three,** and
  `Next steps:` deliberately suppresses rather than aborts on a malformed line. Incorporated: the
  positional rule governs all four; the malformed-line tolerance is preserved.
- **Error cases, Important — the timestamp fix had a fall-through trapdoor.** `normalizeReview` walks
  four candidates, so skipping the first would let `created_at` resurface as a submission time.
  Incorporated as an explicit short-circuit, with the `PENDING` token named as the portable
  cross-check the original finding preferred.
- **Error cases, Important — condition 10's evaluation order is a defect, not a note.** In this
  repository the prose is the implementation, so an executor applying the filters top-down discards
  the reviews the fail-closed clause names before reaching it. Converted from an open point to a
  one-clause fix in step 2; the earlier classification was wrong.
- **Testability, Important — three further sites were missing from the affected files:** the
  user-facing copies in `tools-deliver.md`, Phase 6's fail-closed-cause count, and the supersession
  list's "three cases". All added.
- **Testability, Important — half of the vacuous-assertion recommendation was dropped:** the inlined
  duplicate of the slicing logic below the test. Added, with the note that it needs the trailing prose
  and so requires `mergeConditions` to return the tail or gain a sibling.
- **Testability, Important — the fixture claim was wrong.** There is no Forgejo pending-review
  fixture to correct; the fixture that omits the submission field is the unknown-state one. The
  criterion now says add rather than edit.
- **Maintainability, Important — two measurements in the plan were wrong.** The occurrence count is
  four, not three: the assertion applies `flat()` first, and one occurrence is split across a line
  break. The line figure was two different counting conventions rather than an error, so the sentence
  now names the slice's start line and extent instead of a count. The argument was unaffected, but a
  plan pinning its evidence to a commit should not invite that ambiguity.
- **Maintainability, Important — a fifth site restates the pending discriminator** in code comments,
  a named documentation-sync surface. Added.
- **Scope, Important — the Requirement's accounting was misleading.** It presented two predecessor
  decisions as review items dismissed, which made the total read as eleven against nine. Removed.
- **Architecture, Note — the Bugfix classification had two counter-signals** (a pass-to-block change
  and an additive protocol element, both of which have shipped as `feat:`). The classification stands;
  the reasoning is now stated rather than implicit.
- **Error cases, Note — two edge cases were missing:** a review with no `state` field, and an
  undecided review from an unconfigured login. Both added, the second with an extension to the
  catch-all report so it is visible rather than silent.
- **Scope, Note — the acceptance criteria pinned line numbers this change itself shifts.** Restated as
  concrete wording and grep-able assertions.
- **Data protection, Note — the committed plan omits the exploit path** while naming the remedy, so
  the artifact stays implementable without becoming a disclosure.

Verified sound and left unchanged: every line reference in the plan, the `UNKNOWN`-appears-nowhere
and `REQUEST_REVIEW`-already-mapped claims, all four false-or-stale sentences, the validation plan's
revert check, and the decision to keep the security detail in the gitignored report.

## Open points

- No open points.
