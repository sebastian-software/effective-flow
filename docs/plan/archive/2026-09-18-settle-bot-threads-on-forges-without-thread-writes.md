# Settle bot threads on forges without thread writes

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)

## Requirement

On Forgejo, `merge-gate` never merges a pull request once a configured bot has left an inline thread whose finding `iterate` implemented (issue #434, observed on `fastner/llm-automatisator` PR #33). The investigation report `.effective-flow/investigation/investigation-2026-09-18-merge-gate-forgejo-condition-6.md` traced three causes:

1. Condition 6 (`src/tools/merge-gate.md:1397-1404`) requires every implemented bot thread to be answered **and** resolved. Forgejo supports neither write (`reviewThreadReplies: false`, `reviewThreadResolution: false`, `src/scripts/remote-tracker-core.mjs:4395-4405`), and its API serves no route for either.
2. Condition 7 (`merge-gate.md:1405-1461`) checks threads only against the current run's own outcome record. A fresh run therefore treats the still-open thread as unassessed and blocks.
3. Phase 3 step 5 (`merge-gate.md:1297-1299`) hands every unresolved bot thread to `iterate` each round. On Forgejo, iterate's exclusions (`iterate.md:596-611`) can never fire, so the same thread is re-delegated round after round and run after run.

The archived plan `docs/plan/archive/2026-08-18-forgejo-tea-renderer-reads.md:217-224, 307-312` recorded this gap and deferred "a branch for targets lacking both capabilities" in `merge-gate.md`. This plan is that branch.

Goal: on a forge that can neither reply to nor resolve review threads, the reviewer's own later approval settles its threads. A bot thread counts as settled once the same configured reviewer's latest submitted review for the verified head is an approval, and that approval was submitted later than the review that opened the thread. The gate then stops re-delegating the thread, conditions 6 and 7 no longer consider it, and the report names each such thread with its URL, left unresolved. It also corrects the stale claims about iterate's reply on Forgejo.

Classified **Bugfix**: the gate never reaches a merge its own conditions intend, and the repair direction was already recorded. No new user-facing capability is added.

## Architecture decisions

- **Clearing basis is the reviewer's later approval read from forge state, not a durable run record.** (Decided with the user.) The reviewer's verdict lives on the forge, so it survives across runs without new persistence. That also fixes the fresh-run loop, which in-run evidence alone would not.
- **The predicate is a time order, not a head comparison.** (Decided in the deep review.) A thread is _provider-settled_ when all of the following hold. Its parent review is by the same configured reviewer. That reviewer's latest submitted review for `VERIFIED_HEAD_SHA`, resolved through the supersession rule of "Automatic reviewer state", is `APPROVED`. That approval is a different review from the parent. And its `submittedAt` is strictly later than the parent's. Missing times fail closed. This matches condition 10, which accepts a same-head approval after a change request (`review-bot-state.md:191`), and still leaves notes inside the approving review itself unsettled.
- **A dismissal alone settles nothing.** (Decided in the deep review.) The adapter folds every dismissed review into `DISMISSED` and discards its original state (`remote-tracker-core.mjs:5016-5020`), so a stale approval dismissed on push is indistinguishable from a dismissed change request. Only a later approval settles. A thread whose review was dismissed but never followed by an approval is left for manual resolution in the web UI.
- **Supersession reuses the existing rule, with no second copy.** The fragment points to "Automatic reviewer state" for "latest review at the head". It adds only what that rule leaves open for this use: only **submitted** reviews compete, so `PENDING` and `REVIEW_REQUESTED` rows are ignored, as condition 10 already ignores `PENDING` (`merge-gate.md:1566-1573`).
- **Settles automatically, with no operator confirmation.** (Decided with the user.) This mirrors condition 10, where a later approval clears a verdict without asking (`merge-gate.md:1576-1579`). The report makes it visible instead.
- **Settled threads are removed from what conditions 6 and 7 look at, not called "assessed".** (Decided in the deep review, finding 1.) Condition 7's text rests on "assessed by this run" and "the outcome recorded for each thread it delegated, and nothing besides" (`merge-gate.md:1405, 1413-1414, 1422-1426, 1446-1447`). Filtering settled threads out of the thread set at `:1407` keeps every one of those sentences true. The same filter applies to condition 6.
- **In-run evidence closes the round window.** (Decided in the deep review.) On such a forge, Phase 3 step 5 also skips a thread this run has already recorded as `implemented`. Otherwise it would be re-delegated when Phase 3 runs again after iterate's push but before the bot's approval is visible (condition 5 can report "has run" from a check context or a comment first, `review-bot-state.md:100-127, 257-259`). If the approval is still missing at Phase 4, condition 6 blocks, and the report tells the operator to re-run after the bot's verdict. That thread's implemented outcome still clears condition 7 in the same run, as today.
- **Scoped by capability, not by provider name.** The branch applies only when the forge preflight reports **both** `reviewThreadReplies` and `reviewThreadResolution` unsupported. GitHub, and any forge able to write threads, keeps today's behavior unchanged.
- **Fail closed.** Any missing link leaves the thread on the normal path, where it blocks. That covers: an absent parent review id; a parent review missing from the review read; a different reviewer under "Matching a configured login"; a missing `submittedAt` on either review; `prReviewsRead` unavailable; and an undecidable latest review (identical timestamps, `review-bot-state.md:205-207`).
- **The rule lives in a new lazy fragment, with a capped core.** (Growth cap decided in the deep review.) The rule goes in `src/shared/merge-gate-provider-settled-threads.md`, loaded only when the preflight reports both capabilities unsupported. `merge-gate.md` has 2 lines of budget headroom (2868/2870) and may grow by **at most 12 lines**: one short reference each in Phase 0, Phase 3 step 5, conditions 6 and 7, and Phase 6. Everything else goes in the fragment. GitHub runs never load it.
- **No fallback reply as a PR comment (issue option 3).** (Decided with the user.) It would break the gate's promise to leave at most the trigger comment on the PR (`merge-gate.md:1094-1097`), and it resolves nothing.
- **The adapter carries the parent review id on Forgejo threads only.** Forgejo threads get an optional `reviewId` field. The GitHub thread shape stays as it is: GitHub can write threads, so it never enters the branch, and its full-object `deepEqual` test (`test/remote-tracker.test.mjs:3556-3587`) stays untouched.

## Affected files

| File                                                | Description                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/remote-tracker-core.mjs`               | `readForgejoReviewThreads` (5667-5702): keep each comment's parent review id when flattening review pages (5681-5696). Forgejo branch of the `review-threads-read` normaliser (5325-5365): emit `reviewId` as a string                                                                              |
| `src/shared/pr-review-comments.md`                  | Thread-field list (84-85): document the optional Forgejo `reviewId` in one line                                                                                                                                                                                                                     |
| `src/shared/merge-gate-provider-settled-threads.md` | **New** lazy fragment: definition of a _provider-settled thread_, which read it is evaluated on, fail-closed rules, the in-run implemented exclusion, and report wording                                                                                                                            |
| `src/tools/merge-gate.md`                           | Phase 0 step 2: one sentence reading the two thread-write capabilities, plus the lazy fence at column 0 after the Phase 0 list. Phase 3 step 5: exclusion bullet. Conditions 6 and 7: filter settled threads out of the considered set. Phase 6: one report bullet. At most 12 added lines in total |
| `src/tools/iterate.md`                              | Phase 5 step 2 (775-779): cover a provider that supports neither reply nor resolution                                                                                                                                                                                                               |
| `src/shared/pr-review-thread-writes.md`             | Lines 21-24: same correction for the reply-unsupported case                                                                                                                                                                                                                                         |
| `build.mjs`                                         | `CONTEXT_BUDGET_LINES`: re-measure `merge-gate` and `iterate` from the build report and set each to the new count plus at most ten lines                                                                                                                                                            |
| `test/remote-tracker.test.mjs`                      | Forgejo walk test (3603-3675): give both fixture reviews comments, and assert each thread carries the `reviewId` of the review it was read under                                                                                                                                                    |
| `test/workflow-contracts.test.mjs`                  | New contract tests for the fragment and its use in Phase 3, conditions 6 and 7, and Phase 6. A pinned trigger entry for the new lazy pointer in the battery at 2614-2710. An iterate Phase 5 test                                                                                                   |
| `docs/developer-guide/build-system.md`              | "Mode-gated blocks are lazy" (486-550): add the new `merge-gate-*` fragment with its trigger                                                                                                                                                                                                        |
| `docs/user-guide/remote-tracker.md`                 | 490-492: replace "`iterate` keeps its reply" and "merge-gate reads the same refusal as workflow input" with the actual behavior                                                                                                                                                                     |
| `docs/user-guide/tools-implement.md`                | 279-280: remove "otherwise only a reply" for Forgejo                                                                                                                                                                                                                                                |
| `docs/user-guide/tools-deliver.md`                  | Forgejo paragraph (735-745): describe provider-settled threads and the remaining manual resolution                                                                                                                                                                                                  |
| `evals/merge-gate/results/**`                       | Re-record all 25 archived runs (`<scenario>/run-{1..5}.*` plus `.generation.json`), because the build identity changes (see Validation plan)                                                                                                                                                        |
| `test/merge-gate-eval.test.mjs`                     | Update the stale "Twenty-four paths" comment (209) if the new fragment changes that count                                                                                                                                                                                                           |

## Implementation details

### Approach

1. **Adapter.** In `readForgejoReviewThreads`, the review loop (5681) already knows `review.id`. Keep it with each comment of that review when collecting the pages. For example, pair each comment with its review id rather than pushing bare items at 5696. Don't rely on a `pull_request_review_id` field in the comment payload: current fixtures lack it, and it has not been checked against the live instance. The Forgejo normaliser branch then emits `reviewId: String(<id>)`, and omits the key when no id is available. Compare ids as strings, because `pr-reviews-read` returns a numeric `id` (5054).
2. **Contract doc.** Add one line to the thread fields in `pr-review-comments.md`: `reviewId` is present only on Forgejo and names the review the thread was read under.
3. **New fragment `merge-gate-provider-settled-threads.md`.** Its content:
   - **Scope.** It applies only when the preflight reported both `reviewThreadReplies` and `reviewThreadResolution` unsupported.
   - **Definition.** The time-order predicate from the architecture decisions, applied to an unresolved thread whose author is a configured reviewer under "Matching a configured login". "Same reviewer" means that matching, including spellings that collapse to one reviewer (`review-bot-state.md:64-82`). "Latest" follows "Automatic reviewer state", over submitted reviews only.
   - **Which read.** Evaluate on one batch of threads and reviews read together. In Phase 3 step 5, use the step-4 re-read, or a fresh thread-and-review read when step 4 took none. Don't rely on Phase 1's read after a restart (`merge-gate.md:1167, 1242`). Conditions 6 and 7 re-evaluate on the Phase 4 batch the merge decision relies on.
   - **In-run exclusion.** In Phase 3 step 5, also skip a thread whose durable key already holds `implemented` from this run.
   - **Fail closed.** List the conditions from the architecture decisions.
   - **Report wording.** Phase 6 lists the threads settled on the Phase 4 batch. For each: its URL (or the statement that the provider published none, as at 1628-1633), the settling approval, and "left unresolved – the provider cannot resolve review threads". A thread that still blocks on such a forge gets: its URL; the statement that it can only be resolved in the forge's web UI and the run then re-run, or that the run should be re-run after the bot's next verdict; a note not to reply in the thread, since a human reply would appear as a human-authored thread; and a note that Forgejo may show the thread collapsed as outdated in the conversation tab.
4. **`merge-gate.md` Phase 0 step 2.** Add one sentence to step 2 reading the two thread-write capabilities, **separate** from the existing capability list (test 8959 pins that list's wording). Place the `lazy-include` fence, with `when:` naming both capabilities as unsupported, at column 0 **after** the Phase 0 list ends, before `**\`report\` scopes the merge**`(~922).`LAZY_INCLUDE_RE` (`build-lib.mjs:2039`) does not match an indented fence, and a fence inside the list would end it.
5. **Phase 3 step 5.** Add one exclusion bullet next to "Exclude every item the durable confirmation record … holds" (~1300): provider-settled threads, and on such a forge this run's `implemented` threads, are not handed to `iterate`. When nothing remains, the delegation builder returns `nothing-to-delegate` (`delegation-envelope-core.mjs:806-811`) and no round is used (`merge-gate.md:477-482`).
6. **Conditions 6 and 7.** Condition 7: change the thread-set sentence at ~1407 to take every unresolved configured-reviewer thread "that is not provider-settled". Condition 6: add the same clause. Keep the pinned sentence "A finding this run deferred or rejected does not block the merge" verbatim, and leave every sentence pinned by tests 5864, 5896ff, 12114 and 12150 intact.
7. **Phase 6.** Add one bullet next to 1869-1870 pointing to the fragment's report wording for settled threads and for threads that still block.
8. **`iterate.md` Phase 5 step 2 and `pr-review-thread-writes.md` 21-24.** Add the case where replying is unsupported too. Write nothing into the thread, leave it unresolved, and report reply and resolution as manual. When a gate delegated the run, the return carries this, since the summary comment is suppressed there.
9. **Developer guide.** Add the fragment to "Mode-gated blocks are lazy" in `build-system.md` with its trigger, as the existing `merge-gate-*` entries do.
10. **User docs.** Correct the three passages listed under Affected files.
11. **Budget.** Run `node build.mjs`, and check that the `merge-gate` core grew by at most 12 lines. Read the `Always-loaded core (lines/budget)` rows for `merge-gate` and `iterate`, and set each `CONTEXT_BUDGET_LINES` entry to the measured count plus at most ten lines.

### Component structure

Not relevant: no new module. The only runtime change is a field added inside an existing normaliser.

### State management

No new persisted state. Settlement is computed from one batch of threads and reviews read together. The in-run `implemented` exclusion uses the outcome record the run already keeps (`merge-gate.md:757-820`).

### API integration

No new forge call. The review id is already known inside the existing review-comment walk (`pulls/{n}/reviews/{id}/comments`), and review states and `submittedAt` come from the existing `pr-reviews-read`.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **PR #33, fresh run.** Thread 1424 has parent review 40 (change request, then dismissed), and review 41 is `APPROVED` at the verified head with a later `submittedAt`. The thread is settled, excluded in Phase 3 (`nothing-to-delegate`), conditions 5, 6, 7 and 10 pass, and the gate merges.
- **PR #33, same run, approval not yet visible after iterate's push.** The thread is skipped in Phase 3 through the in-run `implemented` record. If the approval is still missing at Phase 4, condition 6 blocks and the report says to re-run after the bot's verdict.
- **Thread inside the approving review itself.** The parent is the approval, so "a different review" fails: not settled, normal path.
- **Change request and later approval at the same head.** Settled, consistent with condition 10.
- **Dismissed review, no later approval** (including a stale approval dismissed on push). Not settled. The gate blocks and names the thread URL for manual resolution.
- **Bot requests changes again at the verified head.** Its latest review is not an approval, so the thread is not settled. In a fresh run it goes to `iterate`, which is correct fail-closed behavior.
- **Latest review at the verified head is `COMMENTED` or `UNKNOWN`.** Not settled (supersession rule).
- **`PENDING` or `REVIEW_REQUESTED` rows.** Ignored for "latest". Only submitted reviews compete.
- **Two reviews from one reviewer at one head with the same `submittedAt`.** Undecidable, so not settled (`review-bot-state.md:205-207`).
- **Several configured bots.** Each thread is judged only against its own reviewer's reviews. One bot's approval never settles another bot's thread.
- **`prReviewsRead` unsupported.** Nothing can be settled, and the gate keeps its existing degradation.
- **Thread without `reviewId`, or a review without `submittedAt`.** Not settled; fail closed.
- **Thread resolved manually in the UI.** A fresh run sees it as resolved and today's path applies. Within the run that implemented it, "answered" still can't be observed on Forgejo, so the report says to resolve it in the UI and then re-run.
- **Human-authored thread.** Never reaches the fragment: it is not a configured-reviewer thread, and the human-comment guard applies as today.
- **GitHub or any forge that supports either thread write.** The fragment is never loaded and behavior is unchanged.
- **Bot login spelled `X[bot]` in the configuration on Forgejo.** It does not match a bare Forgejo login (`review-bot-state.md:46-55`). That behavior is unchanged: such a thread is not a configured-reviewer thread at all.

## Acceptance criteria

- [ ] `review-threads-read` on Forgejo returns `reviewId` (string) on every thread, equal to the id of the review it was read under. A test in `test/remote-tracker.test.mjs` asserts this with two reviews that both carry comments. The GitHub normalisation test at 3556-3587 passes unchanged.
- [ ] `src/shared/merge-gate-provider-settled-threads.md` exists and is referenced from `merge-gate.md` only through a column-0 `lazy-include` placed after the Phase 0 list, whose `when:` names both `reviewThreadReplies` and `reviewThreadResolution`. New contract tests assert that the fragment:
  - settles only on a same-reviewer latest submitted `APPROVED` review for `VERIFIED_HEAD_SHA` that differs from the parent and has a strictly later `submittedAt`;
  - states that a dismissal alone, a commented or `UNKNOWN` review, and `PENDING`/`REVIEW_REQUESTED` rows settle nothing;
  - fails closed on each listed missing link;
  - names the read batch it is evaluated on;
  - excludes this run's `implemented` threads in Phase 3;
  - defines the report wording, including the thread URL, the web-UI and re-run guidance, and the "don't reply" note.
- [ ] Contract tests assert that `merge-gate.md` uses "provider-settled" in Phase 3 step 5, condition 6, condition 7 (in the thread-set sentence) and Phase 6. All existing tests on conditions 6 and 7 (5864, 5896ff, 12114, 12150) and the Phase 0 list test (8959) pass unmodified.
- [ ] The trigger battery in `test/workflow-contracts.test.mjs` (2614-2710) pins the new lazy pointer.
- [ ] A contract test asserts that `iterate.md` Phase 5 covers a provider on which the reply is unsupported, and that it writes nothing into the thread in that case.
- [ ] The `merge-gate` always-loaded core grew by at most 12 lines. `CONTEXT_BUDGET_LINES` for `merge-gate` and `iterate` equals the measured built count plus at most ten.
- [ ] The three user-guide passages no longer claim that iterate keeps a reply on Forgejo, and `build-system.md` lists the new lazy fragment.
- [ ] Completion condition: `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all pass, with the 25 re-recorded merge-gate eval runs in place so that `test/merge-gate-eval.test.mjs` passes against the new build identity.

## Validation plan

- Unit tests: the Forgejo thread walk with `reviewId` for two reviews with comments, and the GitHub shape unchanged.
- Contract tests in `test/workflow-contracts.test.mjs` as listed in the acceptance criteria. They follow the existing `near(...)`/`section(...)` style and do not pin exact prose beyond the key terms.
- Run the full CI sequence: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- **Eval re-record.** The build identity follows lazy pointers without any condition (`evals/merge-gate/_scaffold/build-identity.mjs:163-230`). Editing `merge-gate.md`, `iterate.md` or `pr-review-comments.md` and adding the fragment therefore changes it, and every archived run in `evals/merge-gate/results/` (5 scenarios × 5) fails `assertBoundToCurrentBuild`. Re-record all of them per `evals/merge-gate/README.md` "Running a round": all slots concurrently, discard null-cwd runs, and keep the receipts truthful. `remote-tracker-core.mjs` is not part of the identity (`test/merge-gate-eval.test.mjs:195-202`), and all fixtures are GitHub-only, so the fidelity test is unaffected. The scenarios cover the unchanged path, not the Forgejo branch.
- Manual check (recommended, outside CI): on a Forgejo pull request with an implemented bot thread and a later bot approval, a fresh `merge-gate` run excludes the thread in Phase 3, merges, and lists the thread as left unresolved with its URL.

## Assumptions and open points

- Planned at `b043480` on `develop`, 2026-09-18. The in-scope files had no uncommitted changes. Before implementing, re-read the cited line ranges in `merge-gate.md`, `iterate.md`, `review-bot-state.md`, `remote-tracker-core.mjs` and `workflow-contracts.test.mjs`. Line movement is harmless; a changed condition 6, 7 or 10 wording, supersession rule, or thread shape is not.
- Stop conditions:
  - Stop and revise the plan if an existing contract test on conditions 6, 7 or 10, or the Phase 0 list, has to be weakened or rewritten to pass. The change is meant to be additive.
  - Stop if `readForgejoReviewThreads` no longer walks reviews one by one, so the parent review id is not known at the call site.
  - Stop if the `merge-gate` core would grow by more than 12 lines. Move the excess into the fragment instead.
  - Stop if the eval re-record cannot be completed. The change must not be delivered with `test/merge-gate-eval.test.mjs` failing.
- Assumption: the build delivers a new `src/shared/*.md` fragment named only by a `lazy-include` to all three targets without registration (`docs/developer-guide/build-system.md:274-278`, transitive closure). Confirmed by the deep review's code reading; `node build.mjs` and `pnpm test:distribution` verify it.
- Assumption: Forgejo reviews from `pr-reviews-read` carry `submittedAt` (`normalizeReview` 5040-5064). Where it is absent, the thread fails closed.
- Assumption: bots on Forgejo, such as `recensor-bot`, submit an approval after a fix, as PR #33 showed. A bot that only comments, or only dismisses, leaves the thread for manual resolution. That is accepted.
- Assumption (not checked live): a Forgejo re-request creates a `REVIEW_REQUESTED` row authored by the bot. The fragment ignores such rows for "latest".
- Accepted behavior: a thread this run deferred or rejected, whose bot then approves the verified head later, is provider-settled and needs no set-aside confirmation. The reviewer's own approval outranks the run's deferral, the same authority condition 10 relies on.
- Out of scope: a Forgejo merge-gate eval fixture. The fidelity harness cannot replay `tea api` status lines, and `evals/merge-gate/README.md:398-400` puts conditions 6, 7 and 10 out of eval scope end to end.
- Out of scope: a user-invoked `iterate` on Forgejo re-classifies an already implemented thread, because its exclusions cannot fire there. Only the gate path is fixed here.
- Out of scope: the stale "fifteen" run count in `docs/developer-guide/build-system.md:140-147` and the `--help`-probe claim at 440-442.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         3 |    1 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         3 |    3 |
| Testability     |        0 |         1 |    2 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         1 |    2 |

### Findings

- **Error cases – Important (incorporated):** the first draft had no stop conditions for a changed thread walk, pinned tests that would need weakening, budget overrun, or a failed eval re-record. Stop conditions and a drift baseline (`b043480`) have been added.
- **Testability – Important (incorporated):** it was unstated whether the build ships a lazy-only fragment without registration. This is now an explicit assumption, confirmed by code reading and verified by the build.
- **Architecture – Note (documented):** a thread deferred in this run is settled by a later bot approval without a set-aside confirmation. This is recorded as accepted behavior.

#### Deep review 2026-09-18

- **Architecture – Important (incorporated):** "a provider-settled thread counts as assessed" would have made four unpinned condition-7 sentences false (`merge-gate.md:1405, 1413-1414, 1422-1426, 1446-1447`). Settled threads are now filtered out of the thread set conditions 6 and 7 consider.
- **Architecture – Important (decided: time order):** the predicate was stated three ways ("after", "other than", "earlier head"). It is now one time-order rule, consistent with condition 10.
- **Security – Important (decided: drop):** the dismissal branch could settle threads under a stale approval dismissed on push, because the adapter discards the pre-dismissal state. A dismissal alone no longer settles anything.
- **Error cases – Important (decided: exclude + report):** within one run, Phase 3 could re-delegate an implemented thread before the approval is visible, and condition 6 then ends the run. Phase 3 now also skips this run's `implemented` threads on such a forge, and the report says to re-run after the bot's verdict.
- **Error cases – Important (incorporated):** "the same fresh read" was undefined inside Phase 3. The fragment now names the batch for Phase 3 (the step-4 re-read, or a fresh one) and for Phase 4.
- **Maintainability – Important (decided: ≤ 12 lines):** the budget stop condition could never fire. The `merge-gate` core now has an explicit 12-line growth cap, with the rest in the fragment.
- **Architecture – Important (incorporated):** a lazy fence can't sit inside the Phase 0 list (`build-lib.mjs:2039` matches column 0 only). The fence now goes after the list.
- **Error cases – Note (incorporated):** `PENDING`/`REVIEW_REQUESTED` rows and identical timestamps were undefined. Only submitted reviews compete, and identical timestamps fail closed.
- **Error cases – Note (incorporated):** the "resolved manually" case holds only for a fresh run. The report now says to resolve in the UI, re-run, and not reply in the thread.
- **Error cases – Note (incorporated):** added edge cases for a new change request at the verified head, several bots, and human-authored threads.
- **Scope – Note (incorporated):** the eval path was wrong (`evals/merge-gate/runs/**`). It is now `evals/merge-gate/results/**` with 25 runs, and the stale "Twenty-four paths" comment is included.
- **Maintainability – Note (incorporated):** the `build-system.md` lazy-fragment list and the test trigger battery were missing from the affected files and criteria.
- **Testability – Note (incorporated):** the existing Forgejo walk fixture has one review without comments, so it has to change to prove `reviewId` for two reviews.
- **Testability – Note (confirmed):** an empty selection yields `nothing-to-delegate` and uses no round. `pr-reviews-read` keeps dismissed reviews. `commitSha` and `submittedAt` come from the existing normaliser.
- **Maintainability – Note (confirmed):** `iterate.md` and `pr-review-thread-writes.md` are already stale today ("keep the reply" on a forge that refuses replies). The plan's correction covers them.

## Open points

- No open points.
