# Start the merge-gate bot round while checks are still pending

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Today the delegated merge-gate run handles the automatic reviewer only after a green check pass.
Phase 2 waits until every check is satisfied and the branch is integrable, then records
`VERIFIED_HEAD_SHA`. Only after that does Phase 3 read the configured bot's verdict and delegate its
findings to `iterate`. When the bot has already requested changes on the current head, that wait
is spent on a head the gate knows it will replace. The fix round pushes a new head and CI starts
over.

Evidence comes from the local report
`.effective-flow/investigation/investigation-2026-11-24-merge-gate-waits-for-ci-before-the-bot-round.md`.
On PR 717, `recensor` submitted CHANGES_REQUESTED on head `5435baca` about 5 minutes after the
push. `Format, test and build` was still running 13 minutes later. The last eight CI runs took
12–21 minutes, so each changes-requested round loses about 7–16 minutes of wall-clock time. An
independent challenge found no documented reason that ties the bot round to green CI.

Goal: once the head is integrable, a **settled** changes-requested verdict on the current head
starts the bot round while checks are still pending. The merge stays bound to a green, verified
head, and every existing safety gate keeps its meaning. The new path is default behavior and has no
configuration key.

This is Feature work: it changes observable merge-gate behavior (when an `iterate` round starts)
and the wait and resume protocol on T3. It is not a refactor.

## Outcome checkpoint

**Primary source:** user request in this session, based on the investigation report above
(repository `sebastian-software/effective-flow`; source read at `develop` `8d6b991c`, published on `origin/develop` `02e1743c`)
**Original outcome:** a configured reviewer's settled changes-requested verdict on the current
integrable head starts the bot round without waiting for pending checks; the merge stays bound to a
green `VERIFIED_HEAD_SHA`
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** prompt-contract change in the merge-gate shared fragments and the
merge-gate tool goal, tests and docs, plus one new behavioural eval scenario with a control
**Continuation decision:** none

## Architecture decisions

1. **A Phase-3-only review anchor, `REVIEW_HEAD_SHA`.** Phase 3 assesses the head recorded in
   `REVIEW_HEAD_SHA`. On the green path it equals `VERIFIED_HEAD_SHA`. On the early path it is the
   current head, after Phase 2 step 1 has brought it forward and a fresh read has stated it
   integrable. `VERIFIED_HEAD_SHA` keeps its sole meaning, "verified green and mergeable". Phases 4
   and 5 and every set-aside confirmation keep using only that value.
   - Phase 2's sentence "nothing else in this workflow records a head SHA for later use"
     (`merge-gate-delegated-run.md` ≈1078–1080) names `REVIEW_HEAD_SHA` and the early-entry guard as
     exceptions, next to the `host-pr-watch` wait record. The configured-reviewer and
     check-list-waiver copies only say that Phase 2's statement stays true, so they stay unchanged.
   - `REVIEW_HEAD_SHA` is carried forward across a `BLOCKED-USER` re-dispatch like the other state
     "Answers and returns" lists.
   - Rejected: binding Phase 3 to "the current head" without a recorded anchor, because every
     head-bound record needs one fixed value. Rejected: loosening `VERIFIED_HEAD_SHA`, because that
     weakens the merge binding.
2. **Early entry is a decision point inside Phase 2, not a parallel loop.** It sits between step 1
   and step 2's wait. It skips the wait and runs Phase 3 in the **same round**. Whether the round
   continues is decided only by **head movement**: the `before` and `after` heads that "Repair
   checkpoints" already record around a dispatch. Equal heads continue to step 2's wait in the same
   round. Any difference, from an implementation, a correction commit or a foreign push, ends the
   round as Phase 3 step 6 does and discards `REVIEW_HEAD_SHA`. So an early bot iteration costs
   exactly one round, the same as a green-path bot iteration today, and there is never more than one
   head-moving writer at a time.
3. **Narrow trigger, fail closed.** Early entry fires only when all of these hold on one fresh read
   batch (`pr-status-read` plus the thread and review reads, with the unconfigured-reviewer advisory
   applied as on every fresh read):
   - `mergeGate.bots` is non-empty, the human-comment guard is inactive, and no caller limit
     (`no-branch-writes`) withholds delegation.
   - Phase 2 step 1 has run in this round, and the batch states the branch integrable by the same
     merge-state or mergeability test as the Phase 2 loop exit, except that a merge state of
     `UNKNOWN` counts as unprovable. The Forgejo WIP-draft exit's local-proof-only integrability does
     **not** count.
   - **Every** configured bot has a configured `mergeGate.bots.<login>.check`, every bot is in the
     state "has run", and every bot's own check is **completed and not failing**. For at least one
     bot, the **latest** review at the current head, resolved through the existing supersession
     rule, is CHANGES_REQUESTED with `submittedAt` later than `headCommittedAt`. Bots without
     `.check` never report "running", so they could look finished while still writing. A red bot
     check would let Phase 2 step 3 hand the reviewer's text to `iterate` a second time as a CI
     repair.
   - No check fails as Phase 2 step 4 defines it, and at least one check is pending **within the set
     the wait itself would wait for**, using the pending read's own wording (under
     `mergeGate.requireAllChecks: false`: required or of unstated requiredness, so Forgejo is not
     excluded).
   - No Phase-3 round of this run has **recorded outcomes** at this head yet, early or green. An
     early dispatch that returned `BLOCKED-USER` without outcomes has not assessed the head. This
     also covers the green-to-early re-entry that a Phase 4 condition-11 `pending` result or the
     ready-step return would otherwise cause at an unchanged `VERIFIED_HEAD_SHA`.

   Any unprovable condition means no early entry, and today's wait applies unchanged. When a
   changes-requested verdict exists at the head but early entry did not fire, the wisdom file
   records the first unmet condition, and Phase 6 names it.

4. **Failing CI keeps precedence, and iterate's own corrections stay as today.** A failing check
   takes the existing Phase 2 step 3 CI-repair path. Early entry never combines a Phase 2 step 3
   CI-repair delegation with a bot round. `iterate`'s own correction items, which fix local
   validation failures inside a delegation, stay as they are today. On the early path they are more
   likely, because CI has not checked the head yet. Phase 6 therefore names, per early round, the
   correction-bucket commits the repair helper attributes to the `correction` identifier.
5. **No trigger comments on the early path.** Early entry acts only on a verdict that already exists
   at the current head. It posts no trigger and no stale-verdict re-trigger. Every bot is "has run"
   by decision 3, so step 3 and the step-4 wait have nothing to do, and the T3 kind-`bot` suspend
   cannot arise. Skipping the re-trigger loses nothing: green-path Phase 3 at the same head still
   applies the stale-verdict rule before it hands over any further item.
6. **Green-path Phase 3 reuses early outcomes at the same head.** If an early round ends without
   head movement and the green path later sets `VERIFIED_HEAD_SHA` to that same head, Phase 3 reuses
   only the early round's `deferred` and `rejected` outcomes, and excludes `implemented` threads as
   today. It hands over again, as today, every `unassessed` item and every `implemented` finding
   without head movement, plus items that appeared after the early round. "No second outcome under
   an existing durable key" holds **for the same head only**. A still-open `deferred` thread at a
   later head is re-delegated exactly as today. This removes the manipulation surface of handing the
   same assessed reviewer text to `iterate` twice, without stranding items Phase 4 would return.
7. **Quick review-fix validation runs against the review head.** `ci-integrity` checks a Git tree,
   not CI state. On the early path it runs with `"tree":"<REVIEW_HEAD_SHA>"`, so projects that opted
   into quick validation keep it. Phase 4 condition 11 still demands CI evidence for the resulting
   head before any merge. Expected effect: while checks are pending, a job that has not registered
   yet makes the quick candidate "Unknown", so early rounds will often resolve to `full`. That is the
   existing fail-safe, not a regression.
8. **On T3, a verdict wake enters early in the same round.** Early entry is evaluated before every
   suspend and on every checks resume at an unchanged head. Together with the "no recorded outcomes"
   condition, that already means "newly met", so the wait record needs no bot baseline. A checks
   resume that meets the conditions enters Phase 3 in the **recorded round**, the way an empty
   pending set already continues in its round. It takes precedence over **every** wake class at an
   unchanged head: progress, unchanged, and a changed wake caused only by a new pending check (e.g.
   a `pull_request_review` workflow). It also takes precedence over the Bounds rule "every
   still-pending check `required: false` → report and stop"; that rule then decides the following
   suspend. The entry resets the unchanged counter to zero. The re-suspension after an early Phase 3
   without head movement is named in "Round accounting" as a third same-round exception. No new
   wait kind is introduced.
9. **One home for the contract.** The full early-entry contract (conditions, records, re-dispatch
   rule, T3 precedence, report lines) lives once, in a new section of
   `merge-gate-configured-reviewer.md`. That fragment is loaded only when a `mergeGate.bots` row
   exists, so runs without a configured reviewer and T3 `iterate` or `pr` runs pay nothing for it.
   `merge-gate-delegated-run.md` (Phase 2 decision point, Round accounting, Answers and returns) and
   `host-pr-watch.md` (pending read, checks resume) carry one-line pointers at their decision points.

## Records

The early path adds two run-local wisdom-file records:

- **Early-entry guard**, bound to `REVIEW_HEAD_SHA` and discarded with it: the head, and whether a
  Phase-3 round recorded outcomes there. It enforces the "no recorded outcomes" condition and
  survives a `BLOCKED-USER` re-dispatch and a T3 resume as long as the head does not move.
- **Early-round report entry**, append-only, with no head SHA, kept until Phase 6 like the existing
  per-round records: round, bot, review ID, verdict `submittedAt`, dispatch time, per-finding
  outcomes, and the correction-bucket commits of that round. Phase 6 reports from it, so early
  outcomes and timing survive both endings: a round that moved the head, and a run that ends before
  a green head was verified.

A consuming dispatch after a `BLOCKED-USER iterate-approval` re-evaluates decision 3 on fresh reads.
If the conditions no longer hold (for example because a check failed during the question), it
consumes the answer in green-path Phase 3 under the existing digest rule.

## Affected files

| File                                                                                                                                                                                                                           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/merge-gate-configured-reviewer.md`                                                                                                                                                                                 | New "Early entry" section holding the whole contract of decisions 2–9 and "Records". Phase 3 steps 1–5 and the configured-reviewer wisdom record ("latest review for …") read at `REVIEW_HEAD_SHA`. Step 5 reuses early outcomes at the same head (decision 6). The stale-verdict re-trigger and trigger comments are skipped on the early path. Step 6 discards `REVIEW_HEAD_SHA` together with `VERIFIED_HEAD_SHA`. Phase 4 condition 10 and set-aside confirmations keep `VERIFIED_HEAD_SHA`. The Phase 6 items gain the early-round lines (timing, per-finding outcomes, correction commits, first unmet condition). |
| `src/shared/merge-gate-delegated-run.md`                                                                                                                                                                                       | Define `REVIEW_HEAD_SHA` next to `VERIFIED_HEAD_SHA`, and extend that paragraph's "nothing else records a head SHA" sentence. Add one-line pointers to the early-entry section at the Phase 2 decision point (after step 1), in Round accounting (the third same-round exception) and in "Answers and returns" (`REVIEW_HEAD_SHA` carried forward). Phase 3 pointer: the two entry paths.                                                                                                                                                                                                                                |
| `src/shared/merge-gate-provider-settled-threads.md`                                                                                                                                                                            | Predicate 3 is shared by the Phase 3 and Phase 4 batches. Split its wording so that Phase 3 reads `REVIEW_HEAD_SHA` and Phase 4 reads `VERIFIED_HEAD_SHA`.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/shared/merge-gate-review-fix-validation.md`                                                                                                                                                                               | `ci-integrity` runs with `"tree":"<REVIEW_HEAD_SHA>"`. On the green path that is the same value as today.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/shared/host-pr-watch.md`                                                                                                                                                                                                  | One-line pointers at the pending read and the checks resume to the early-entry section. Bot order is unchanged for the green path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/tools/merge-gate.md`                                                                                                                                                                                                      | The goal list (≈20–22, "once green, hand the notes of the configured automatic reviewers …") describes the new order. Update `contextBudget` from the `node build.mjs` report.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `test/workflow-contracts.test.mjs`                                                                                                                                                                                             | Update the pinned Phase-3 `VERIFIED_HEAD_SHA` phrases (e.g. the stale-verdict assertion) and the Phase 2 "nothing else records a head SHA" assertion (≈16402–16406). Add contract tests per acceptance criterion.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `test/merge-gate-conflict-validation-contract.test.mjs`, `test/iterate-quick-validation-contract.test.mjs`, `test/repair-attempt-contract.test.mjs`                                                                            | Phase 4 `ci-integrity` stays on `VERIFIED_HEAD_SHA`. Review-fix `ci-integrity` moves to `REVIEW_HEAD_SHA`. The stop check still runs before every delegation site, including the early one.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `evals/merge-gate/scenarios/<new>`, `evals/merge-gate/fixtures/<new>.json`, `evals/merge-gate/scenario-registry.mjs`, `evals/merge-gate/_scaffold/configured-reviewer-scenario.mjs`, `evals/merge-gate/_scaffold/evaluate.mjs` | New scenario plus control (see "Validation plan"). A sequenced `pr-status-read`, an origin seed, and an evaluator branch with its `BRANCHED_SCENARIOS` entry and a validity rule in the style of `unreported-checks-at-phase-four`, per `evals/merge-gate/README.md`. The two `_scaffold` files are hashed into the instrument, so editing them stales every merge-gate scenario.                                                                                                                                                                                                                                        |
| `docs/user-guide/tools-deliver.md`                                                                                                                                                                                             | The ordered gate (≈415–440) and the reviewer sections (≈1015, ≈1037): the early bot round, its conditions, and that the merge still waits for green checks.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

`src/scripts/delegation-envelope-core.mjs`, `src/scripts/repair-attempt-core.mjs` and
`src/tools/iterate.md` stay unchanged. The envelope carries no new line, because the early-entry
records and the delegated run's "Head before dispatch" already record the review head, and the
repair helper already attributes correction-bucket commits.

## Implementation details

### Approach

1. **Anchor.** Define `REVIEW_HEAD_SHA` in `merge-gate-delegated-run.md`: set by the Phase 2 loop
   exit or by early entry, discarded on head movement, by Phase 3 step 6 and on a resume with a
   changed head, carried across a `BLOCKED-USER` re-dispatch, and read only by Phase 3, the
   review-fix `ci-integrity` and the early-entry guard. Extend Phase 2's head-SHA sentence.
2. **Early-entry section.** Write the new section in `merge-gate-configured-reviewer.md`:
   conditions (decision 3), head-movement rule (decision 2), records, the re-dispatch rule,
   precedence on T3 (decision 8) and the Phase 6 lines. Place one-line pointers in
   `merge-gate-delegated-run.md` and `host-pr-watch.md`.
3. **Re-anchor Phase 3** in `merge-gate-configured-reviewer.md` and split predicate 3 in
   `merge-gate-provider-settled-threads.md`. Leave the Phase-4 sections and set-aside confirmations
   on `VERIFIED_HEAD_SHA`.
4. **Outcome reuse.** In Phase 3 step 5, state that `deferred` and `rejected` outcomes recorded at a
   `REVIEW_HEAD_SHA` equal to the current `VERIFIED_HEAD_SHA` count as assessed, and that
   `unassessed` items, `implemented` findings without head movement and later items are delegated as
   today.
5. **Validation.** Switch the review-fix `ci-integrity` tree to `REVIEW_HEAD_SHA`.
6. **Tool goal and docs.** Update `src/tools/merge-gate.md` (goal and `contextBudget`) and
   `docs/user-guide/tools-deliver.md`.
7. **Tests and eval.** Add or update the contract tests, each naming the invariant it protects. Add
   the eval scenario and its control, and record evidence per `evals/merge-gate/README.md`.

### Edge cases

- **Without T3.** `pr-checks-wait` returns only when the checks finish. A round that starts right
  after a fix push usually finds no verdict yet, so on this path early entry fires only when the
  verdict was already present at the decision point. The gain lands mainly on T3. The Phase 6 lines
  make the actual timing visible.
- **A check fails while the early round runs.** The fix push supersedes that CI run. The next round
  evaluates the new head's checks normally.
- **A check fails during a relayed `BLOCKED-USER` question.** The consuming dispatch re-evaluates
  decision 3, finds it unmet and consumes the answer in green-path Phase 3 (see "Records").
- **The early round ends without head movement.** The round continues to the wait. Once the head is
  green, Phase 3 reuses the early outcomes (decision 6), and Phase 4 decides with its existing
  conditions, including set-aside confirmation.
- **The head is `BEHIND`, `DIRTY` or `UNKNOWN`.** No early entry. Step 1 brings a `BEHIND` or `DIRTY`
  head forward first; its push changes the head, so the bot has to review the new head first.
- **Local validation fails for a reason the bot findings did not cause.** `iterate` fixes it as a
  correction item, as on the green path today (decision 4). The correction commit moves the head
  and ends the round. Phase 6 names the commit.
- **Human-comment guard active, a bot "running", a bot without `.check`, a red bot check,
  `checksReported: false` or the no-CI policy.** No early entry. Today's path applies, and Phase 6
  names the first unmet condition when a changes-requested verdict existed.

## Acceptance criteria

- [ ] `merge-gate-configured-reviewer.md` holds the early-entry section with exactly the conditions
      of decision 3, evaluated on one fresh read batch, and `merge-gate-delegated-run.md` and
      `host-pr-watch.md` hold only pointers to it. A contract test asserts each condition and the
      single home.
- [ ] Equal `before` and `after` heads continue the round, and any head movement ends it and discards
      `REVIEW_HEAD_SHA`. An early bot iteration consumes exactly one round. Tests assert both.
- [ ] Every Phase-3 verdict and thread read uses `REVIEW_HEAD_SHA`. Phase 4 conditions 8 and 10, the
      Phase-4 `ci-integrity`, `ci-evidence-match`, set-aside confirmations and `pr-merge` still use
      `VERIFIED_HEAD_SHA`. Tests assert both.
- [ ] Green-path Phase 3 at a head an early round assessed reuses only `deferred` and `rejected`
      outcomes, and hands over `unassessed` items, `implemented` findings without head movement and
      later items as today. A test asserts it.
- [ ] Early entry does not fire at a head where a Phase-3 round recorded outcomes, posts no trigger or
      re-trigger, treats `UNKNOWN` as unprovable, requires every bot check to be completed and not
      failing, and is disabled by `no-branch-writes`. The review-fix `ci-integrity` tree is
      `REVIEW_HEAD_SHA`. Tests assert each of these.
- [ ] `REVIEW_HEAD_SHA` and the early-entry guard survive a `BLOCKED-USER` re-dispatch and a T3 resume
      at an unchanged head. The consuming dispatch re-evaluates decision 3 on fresh reads. Tests
      assert both.
- [ ] Phase 6 reports each early round (verdict `submittedAt`, dispatch time, per-finding outcomes,
      correction commits) both after a head-moving early round and after a run that ended before a
      green head was verified, and names the first unmet condition for a non-entry. A test asserts
      each.
- [ ] `host-pr-watch.md`'s checks resume enters Phase 3 in the recorded round when the conditions
      are met at an unchanged head, with precedence over every wake class and the optional-check
      stop, and resets the unchanged counter. A test asserts it.
- [ ] The new eval scenario passes on call-log order and its control shows no early dispatch (see
      "Validation plan"). Evidence for both is recorded.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass.

## Validation plan

- Run CI's order through `t3-project`: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  `pnpm test:distribution`.
- **Eval scenario.** Fixture: a bot with `.check`, its check green, a latest CHANGES_REQUESTED review
  at the head, a required check pending, then a green element in the `pr-status-read` sequence. Pass
  condition, from the call log: the `iterate` echo's dispatch trace comes before the first
  `pr-checks-wait` start and before the status read that serves the green element. A run that merely
  never merges does not pass. **Control:** the same fixture with the verdict submitted after the
  green element; no early dispatch may occur.
- **Evidence debt.** Run `pnpm eval <tool> verify` for all five suites. Expect freshness debt in at
  least `merge-gate` (edited fragments and `_scaffold`), `iterate` (it reaches `host-pr-watch`) and
  `build-context` (it seeds every tool). Handle it per the pragmatic test and release policy and
  name it in the PR.
- **Manual field check on T3** with this checkout linked through `./local-link.sh` (the installed
  skill is the last release), on the next PR that gets a `recensor` changes-requested verdict. Record
  whether `recensor/review` is a required check and the order in which review and check arrived. The
  Phase 6 lines should show the dispatch before `Format, test and build` finished, and the merge only
  after a green pass on the final head.

## Assumptions and open points

- Assumption: the forge reports the bot's review at the current head before CI finishes. This is
  confirmed for `recensor` on PR 717 and is the precondition for any gain.
- Assumption: on T3, the gate is woken after the bot's own check has completed. That holds when the
  review is observed after the check completes, or when the check is required. Otherwise the
  completion of a non-required bot check wakes nothing, and the run falls back to the green path. The
  field check records which case applies.
- Out of scope: combining a Phase 2 step 3 CI repair and a bot round in one delegation, starting a
  bot round on a head that is not integrable, and bots without a configured `.check` or with a red
  own check.
- Separate follow-up: cancelling superseded CI runs with a `concurrency` group in
  `.github/workflows/ci.yml` is tracked in issue #720, not in this plan.

## Plan review

**Result:** Approved

Three independent passes: a gap analysis with plan review, a scoped re-review of the sections the
first user decisions changed, and the deep interactive plan review. Counts cover all three.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    5 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        1 |        12 |    3 |
| Testability     |        0 |         1 |    4 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         4 |    4 |

### Findings

- Error cases, Critical: an early round without implementation followed by green-path Phase 3 at
  the same head would hand the same reviewer text to `iterate` again. Resolved by user decision:
  reuse early outcomes (decision 6), narrowed to `deferred` and `rejected` so `unassessed` items are
  not stranded.
- Error cases, Important: early rounds would have cost an extra round on T3. Resolved by user
  decision: same-round entry (decisions 2 and 8), with precedence over every wake class and a
  counter reset.
- Error cases and Architecture, Important: thread triggers were unobservable and bots without
  `.check` could look finished mid-review. Resolved by user decision: only completed bots with
  `.check`, every bot "has run", latest review CHANGES_REQUESTED (decision 3).
- Error cases, Important: forced `full` validation rested on a wrong reason. Resolved by user
  decision: quick `ci-integrity` against `REVIEW_HEAD_SHA` (decision 7).
- Error cases, Important (deep review): correction items on the not-yet-checked head. Resolved by
  user decision: allowed as today and reported per early round (decision 4).
- Security, Important (deep review): a red bot check would reopen the reviewer-text channel through
  a CI repair. Resolved by user decision: every bot check must be completed and not failing
  (decision 3).
- Error cases, Important: "implements nothing" and "head did not move" were conflated; head movement
  is now the only criterion (decision 2). Incorporated.
- Error cases and Testability, Important: early timing and outcomes were discarded with the head; a
  `BLOCKED-USER` re-dispatch was unspecified. Split into guard and report records, with a re-dispatch
  rule ("Records"). Incorporated.
- Testability, Important: the eval could pass without proving anything. Call-log pass condition and
  a control added. Incorporated.
- Error cases, Important: the T3 gain depends on a wake after the bot check completes. Stated as an
  assumption and recorded in the field check. Incorporated.
- Maintainability, Important: the contract would have been paid for on every run. One home in the
  configured-reviewer fragment with pointers (decision 9). Incorporated.
- Architecture and Maintainability, Important: set-aside confirmations stay on `VERIFIED_HEAD_SHA`;
  no new envelope line; the `merge-gate.md` goal changes. Incorporated.
- Notes (incorporated): `UNKNOWN` merge state unprovable; only Phase 2's head-SHA sentence changes;
  eval debt across all five suites; corrected stale-verdict rationale; Phase 6 names the first unmet
  condition; precedence over the optional-check stop; latest-review rule; Forgejo pending-set
  wording; green-to-early re-entry guard; no bot baseline; corrected eval paths; predicate 3 split;
  corrected Phase-4 condition bindings.

## Open points

- No open points.
