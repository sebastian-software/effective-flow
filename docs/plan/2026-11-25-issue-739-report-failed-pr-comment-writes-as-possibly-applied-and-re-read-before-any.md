# Report failed PR comment writes as possibly applied and re-read before any repeat

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #739

## Requirement

The remote helper reports a `review-thread-reply` that fails with a 5xx as `retryable: true`, but
the forge may already have stored the reply. A caller that repeats the write posts the same reply
twice. This has happened on GitHub: after repeated 502 errors, the thread showed two identical
"Fixed in <sha>" replies. `pr-comment` and `review-create` are non-idempotent writes of the same
kind and have the same ambiguity.

Goal: when one of these three PR writes loses its response, the helper reports
`mutationMayHaveSucceeded: true` and `retryable: false` on both providers. A lost response here
means a failed CLI or `tea` transport, or a 5xx that `tea api` returned. The workflow text then
makes a re-read of the written target mandatory before any repeat, so a stored write is
recognized and never sent again. Unflagged `INVALID_PAYLOAD` outcomes after a sent request stay out
of scope and are recorded as a follow-up below.

Recommended workflow: Bugfix (`effective-flow fix`). The change corrects a wrong error
classification and a missing recovery rule that together cause duplicate forge writes. It adds no
user-facing capability.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow, issue #739 (related: #560, an
ambiguous comment-write outcome on Forgejo/Gitea).
**Original outcome:** A `review-thread-reply`, `pr-comment` or `review-create` that loses its
response is flagged as possibly applied and non-retryable on GitHub and on `tea api` forges. It
is never repeated without a re-read of its target, and unit tests cover both providers.
**Last evaluated attempt:** None.
**No-progress count:** 0
**Cumulative approach:** Extend the shared possibly-applied membership in the remote helper. Add
one re-read recovery rule as a lazily loaded fragment, with pointers at each place one of the
writes is made.
**Continuation decision:** None.

## Architecture decisions

- **Extend the one membership set.** `review-thread-reply`, `pr-comment` and `review-create` join
  `POSSIBLY_APPLIED_MUTATIONS` in `src/scripts/remote-tracker-core.mjs` (currently line 2121).
  Both failure paths already read that set:
  - `runChecked` handles a failed CLI, including GitHub `gh api`, which exits non-zero on a 5xx,
    and a failed `tea` transport.
  - `teaApiSuccess` handles a `tea api` status of 500 or above.

  In the generic mutation path (around lines 7759–7775), both receive the operation name as their
  label, and that name is the set's key. No per-provider change and no label mapping is needed.
  This is verified: the thread reply's operation name and step label are both
  `review-thread-reply` on GitHub (`remote-tracker-github-core.mjs:627`) and on Forgejo
  (`remote-tracker-forgejo-core.mjs:568`).
- **All three writes, not only the reply** (scored decision, see "Decided by score"). The code
  comment beside the set says that membership follows the operation's documented recovery: "never
  re-run after `mutationMayHaveSucceeded: true`; re-read the state instead". Each new member
  therefore gets that recovery in prose.
- **The trigger is the helper's flag** (scored decision). The recovery applies when one of the
  three writes fails with `mutationMayHaveSucceeded: true`, and every pointer uses that same
  wording. The helper owns the trigger, so prose never infers from a bare error code whether a
  request went out.
- **The evidence is a new item by the authenticated account since the last pre-write read of the
  same target** (scored decision). For a reply, the target is the one thread that holds the
  answered `commentId`. For a PR comment it is the PR's comment list, and for a review submission
  the PR's review list. The re-read counts the write as posted when the target holds an item that
  meets three conditions:
  - its author `login` equals the login `viewer-read` returned;
  - its `id` was absent from the last read of that target taken before this write;
  - in standard mode, it carries the writer's marker on its leading line.

  This evidence holds when a reviewer comments after the stored reply and when the forge
  normalizes whitespace. It also works in hidden mode, where nothing is stamped. Limiting it to
  the target keeps a reply that succeeded on thread A from counting as the lost reply to thread B,
  which `iterate` Phase 5 step 2 would otherwise allow, since it posts several replies after one
  read.
- **The recovery is loaded lazily at the failure point, and every write site names it** (scored
  decision). The full rule lives in a new fragment, `src/shared/pr-write-recovery.md`:
  - **One fence.** A ` ```lazy-include ` in `src/shared/pr-review-comments.md`, section
    "Idempotency via the Effective Flow markers", defers the fragment. Its `when:` is a
    `review-thread-reply`, `pr-comment` or `review-create` failing with
    `mutationMayHaveSucceeded: true`, except merge-gate's trigger posts. One eager sentence beside
    it states the duty, with the same exception: such a write is never re-sent blindly, and the
    last read of its target before the write is its baseline.
  - **One-clause pointers.** Each place where one of the three writes is made gets a single clause:
    on that failure, read `shared/pr-write-recovery.md` before any repeat. The places are:
    - "Reply to a thread" and "Submit a review with inline comments" in
      `pr-review-thread-writes.md`;
    - the outside-diff marked PR comment bullet in `pr-review-integration.md`;
    - `iterate` Phase 5 steps 2 and 3. These clauses also require a `review-threads-read`
      immediately before the replies, and a `pr-comments-read` immediately before the summary
      comment, as the baselines.

  `pr-review-comments` is the read surface that every consumer of `pr-review-thread-writes`
  already loads. The rule is therefore stated exactly once, and the pointer sits where a failure
  happens.
- **The review submission takes its own baseline read** (scored decision). The "Idempotency"
  section of `src/shared/pr-review-integration.md` reads exactly two surfaces for signature
  de-duplication. It gets one clause that requires a `pr-reviews-read` immediately before
  `review-create`, as that write's recovery baseline. The clause says this read serves the
  recovery and is no part of signature de-duplication, so "this check reads those two surfaces
  only" stays true.
- **merge-gate owns its trigger recovery** (scored decision for the outcome). The gate's two
  `pr-comment` posts keep their own checks:
  - the step 3 trigger decides "already posted" by body, author and `createdAt` against
    `headCommittedAt`, and posts if that cannot be proven;
  - the step 5 stale-verdict re-trigger decides by body, author and `createdAt` against the
    verdict's `submittedAt`, and posts nothing if that cannot be proven.

  The whole recovery for these posts lives in the single-consumer
  `src/shared/merge-gate-configured-reviewer.md`. Each step's own check on a fresh read is its
  re-read, and a post is repeated at most once. After a second flagged failure, or a re-read that
  stays unconfirmed, the gate reports the unconfirmed trigger and applies step 4's single wait as
  if the trigger had been posted. A trigger that did not land is covered by step 4's timeout
  report.

  For an unconfirmed step 5 re-trigger, the forge `createdAt` is unknown (scored decision). While
  it stays unconfirmed, "the reviewer has answered" means a submitted review at `REVIEW_HEAD_SHA`
  that was absent from a `pr-reviews-read` taken just before the post. The `host-pr-watch` wait
  record stores that review-id baseline instead of `createdAt`. Its Bounds rule and the step 5 and
  Phase 6 report wording name the unconfirmed re-trigger. No local clock is used, and a confirmed
  re-trigger keeps the existing `createdAt` rule unchanged.

  `pr-write-recovery.md` only excludes these posts. That keeps its general direction ("an
  unprovable re-read repeats nothing") from contradicting step 3's ("unprovable → post it").
- **4xx semantics stay as they are for each transport.** On `tea api`, a 4xx the forge stated
  stays a non-retryable refusal without the flag. On GitHub, `runChecked` cannot tell a stated 4xx
  from a lost response, so it flags every CLI failure of a set member, as it already does for
  `pr-merge`. That is the safe direction, since it costs one extra re-read, and it is kept.

## Affected files

| File | Description |
| --- | --- |
| `src/scripts/remote-tracker-core.mjs` | Add `review-thread-reply`, `pr-comment` and `review-create` to `POSSIBLY_APPLIED_MUTATIONS`. Update the two explanatory comments that name "three" mutations and their documented recovery: the one above the set and the one in `runChecked`. |
| `src/shared/pr-write-recovery.md` | New, lazily loaded fragment holding the full recovery rule for the three PR writes, with one sentence excluding merge-gate's trigger posts. |
| `src/shared/pr-review-comments.md` | In "Idempotency via the Effective Flow markers", add the ` ```lazy-include ` for `pr-write-recovery` and one eager sentence: never re-send blindly, and the last read of the target before the write is the baseline. |
| `src/shared/pr-review-thread-writes.md` | Add one clause each to "Reply to a thread" and "Submit a review with inline comments", naming `shared/pr-write-recovery.md` as the read before any repeat. The reply clause makes a re-read of the thread mandatory before any repeated reply. The review clause also covers the single fallback PR comment. |
| `src/tools/iterate.md` | Add one clause each to Phase 5 step 2 (replies) and step 3 (summary comment). Each takes its baseline read immediately before the write (`review-threads-read`, `pr-comments-read`). On a failure with `mutationMayHaveSucceeded: true`, it reads `shared/pr-write-recovery.md` before any repeat. |
| `src/shared/pr-review-integration.md` | Add one clause to "Idempotency": take a `pr-reviews-read` immediately before `review-create` as that write's recovery baseline. The read is no part of signature de-duplication. Add the one-clause pointer to the outside-diff marked PR comment bullet. |
| `src/shared/merge-gate-configured-reviewer.md` | Add the trigger recovery to steps 3 and 5: the step's own check on a fresh read settles a flagged post, a post is repeated at most once, and an unconfirmed post is reported before step 4's single wait. Step 5 gets the review-id answer rule for an unconfirmed re-trigger, and the step 5 running report and the Phase 6 item get matching wording. |
| `src/shared/host-pr-watch.md` | The wait record stores the review-id baseline instead of `createdAt` for an unconfirmed stale-verdict re-trigger. The Bounds rule reads "no review absent from that baseline" for such a re-trigger. |
| `test/remote-tracker.test.mjs` | Split the shared `issue-comment`/`pr-comment` loop (around lines 3211–3388) so `issue-comment` stays the retryable negative control. Add possibly-applied tests for the three writes on both providers, modelled on the `issue-close` tests. |
| `test/workflow-contracts.test.mjs` | Add a prose contract test for the recovery fragment, its lazy pointer, the write-site pointers and the merge-gate recovery, named after the invariant it protects. |
| `docs/user-guide/remote-tracker.md` | Document the possibly-applied outcome: for `pr-comment` at the comment-transport paragraph (around line 567), and for `review-thread-reply` and `review-create` at the thread-write paragraph (around line 504). |
| `src/tools/*.md` (`contextBudget:` line only) | Raise the budget of any tool that the `node build.mjs` report shows over budget after the edits. Change no other line of a tool beyond the `iterate.md` clauses above. |

## Implementation details

### Approach

1. **Helper membership.** In `src/scripts/remote-tracker-core.mjs`, add the three operation names
   to `POSSIBLY_APPLIED_MUTATIONS`. Rewrite the comment above the set and the matching passage in
   `runChecked`: they should no longer say "three", and they should say why the PR writes belong.
   The forge may store the comment before the response is lost, and the documented recovery is a
   re-read of the target. State the rule as "never re-run without first re-reading the state", so
   the comments match the one repeat the recovery allows after a re-read finds nothing. Do not
   change the logic of `teaApiSuccess` or `runChecked`.
2. **Recovery fragment** `src/shared/pr-write-recovery.md`, at most about twelve lines. It states:
   - **Never re-send blindly.** A `review-thread-reply`, `pr-comment` or `review-create` that fails
     with `mutationMayHaveSucceeded: true` is not sent again until its target has been re-read.
     The read operation depends on the write:
     - a reply: `review-threads-read`, then the one thread holding the answered `commentId`;
     - a PR comment: `pr-comments-read`;
     - a review submission: `pr-reviews-read`.
   - **When the write counts as posted.** The target holds an item that meets three conditions:
     - its author `login` equals the login `viewer-read` returned;
     - its `id` was absent from the last read of that target taken before this write;
     - in standard mode, it carries the writer's marker on its leading line.
   - **A posted write is never sent again.** It is handled exactly as a successful write. In
     hidden mode, a found reply is recorded per `pr-thread-ledger`, and the thread is then resolved
     as usual.
   - **If nothing is found,** the write may be repeated once, after that read. If the repeat also
     fails with the flag, it is not repeated again.
   - **An unconfirmed write is reported, never written again.** The re-read may be unprovable (no
     `viewer-read` login, no author that can be established, a read failure), or the second
     attempt may fail with the flag. Either way:
     - the run repeats nothing;
     - an unconfirmed reply's thread stays unresolved and is not recorded in the ledger;
     - the report says "possibly posted, unconfirmed: check the thread, review list or comment list
       before writing by hand".

     Where the report goes depends on the write. An unconfirmed reply is reported in the summary
     comment, or in the return of a gate-delegated run. An unconfirmed summary comment, review
     submission, fallback comment or outside-diff comment is reported only in the run's chat
     summary or return, never through a new PR write.
   - **merge-gate's trigger posts are excluded.** They follow their own recovery in the
     configured-reviewer route.
3. **Lazy pointer and eager duty** in `src/shared/pr-review-comments.md`, "Idempotency via the
   Effective Flow markers":
   - Add a ` ```lazy-include ` for `pr-write-recovery` with a `when:` clause: `review-thread-reply`,
     `pr-comment` or `review-create` failed with `mutationMayHaveSucceeded: true`, other than a
     merge-gate trigger post.
   - Add one eager sentence with the same exception: such a write is never re-sent blindly, and
     the last read of its target before the write is its recovery baseline.
4. **Write-site pointers.** Each pointer is one clause: on a failure with
   `mutationMayHaveSucceeded: true`, read `shared/pr-write-recovery.md` before any repeat.
   - **`src/shared/pr-review-thread-writes.md`:** add it to "Reply to a thread", where it makes a
     re-read of the thread mandatory before any repeated reply. Add it to "Submit a review with
     inline comments", where it covers the submission and its fallback PR comment.
   - **`src/tools/iterate.md`:** add it to Phase 5 step 2 (replies) and step 3 (summary comment).
     The same clauses require a `review-threads-read` immediately before the replies, and a
     `pr-comments-read` immediately before the summary comment, as the baselines.
   - **`src/shared/pr-review-integration.md`:**
     - in "Idempotency", add one clause that requires the `pr-reviews-read` immediately before
       `review-create` as its recovery baseline, outside signature de-duplication;
     - add the pointer to the outside-diff marked PR comment bullet.

   All edits are strictly additive and keep every string an existing prose test asserts,
   including:
   - `#552`'s `review-create`, "API description declares" and "Gitea declares both, Forgejo today
     neither";
   - "**Unlike step 3, an unprovable comparison posts nothing here.**";
   - the assertions on `pr-review-comments.md` and `pr-review-integration.md` in the test files
     listed under "Validation plan".
5. **merge-gate recovery** in `src/shared/merge-gate-configured-reviewer.md`:
   - **Step 3:** a trigger post that failed with `mutationMayHaveSucceeded: true` is settled by
     the existing "Idempotency without a marker" check on a fresh read. If that check finds
     nothing, the post may be repeated once. After a second flagged failure, or if the comparison
     is unprovable after a flagged failure, post nothing more, report the unconfirmed trigger and
     apply step 4's single wait as if the trigger had been posted.
   - **Step 5:** the same applies to the stale-verdict re-trigger, which keeps its own check.
     Before posting, take a `pr-reviews-read`. While the re-trigger stays unconfirmed, the reviewer
     has answered only when the post-wait re-read shows a submitted review at `REVIEW_HEAD_SHA`
     whose id was absent from that read. The step 5 running report and the Phase 6 item name an
     unconfirmed re-trigger instead of its `createdAt`. A confirmed re-trigger keeps the existing
     `createdAt` rule.
   - **`src/shared/host-pr-watch.md`:** for an unconfirmed re-trigger, the wait record stores that
     review-id baseline in place of `createdAt`. The Bounds exception reads "no review absent from
     the recorded baseline".
   - Use no local clock, and make no other merge-gate change.
6. **Unit tests** in `test/remote-tracker.test.mjs`. Reuse `fakeRunner`, `teaApiResult`,
   `teaApiRawResult`, `threadWriteProbe(giteaSwagger())` and the existing reply setups (GitHub reply
   plan tests around line 5263, Forgejo reply test around line 10051).
   - **Split the shared loop.** Today it runs over `['issue-comment', 'pr-comment']` (around line
     3211), and its 5xx test (around 3300–3326) and transport-failure test (around 3373–3388)
     assert retryable without the flag. Keep those assertions for `issue-comment` as the negative
     control. For `pr-comment`, assert `mutationMayHaveSucceeded: true` and `retryable: false` for
     Forgejo 500, 502 and 503 (JSON, HTML and plain-text bodies) and for a transport failure
     (`status: 1`) on both providers. Its 401 and 403 cases stay non-retryable without the flag.
     Its "fails closed ... without another creation" `INVALID_PAYLOAD` cases (around 3327–3345)
     stay unchanged.
   - **GitHub:** for `review-thread-reply` and `review-create`, a CLI failure (`status: 1`, stderr
     `HTTP 502: Bad Gateway`) returns `COMMAND_FAILED` with
     `details.mutationMayHaveSucceeded === true` and `retryable === false`.
   - **Forgejo/Gitea:** for `review-thread-reply`, with the thread-write routes probed as present,
     `tea api` statuses 500, 502 and 503 plus one non-JSON proxy error page return the flag and
     `retryable === false`, with a message that does not claim a refusal. A 403 stays
     non-retryable without the flag, and a transport failure returns the flag.
   - **Unchanged:** Forgejo `review-create` still fails `UNSUPPORTED_CAPABILITY`.
7. **Prose contract test** in `test/workflow-contracts.test.mjs`, titled after the invariant: a
   possibly applied PR comment write is re-read on its own target and never re-sent blindly. It
   asserts:
   - in `pr-write-recovery.md`: the three operation names, the comparison of the target's new id
     against the last pre-write read, the one-repeat limit, the unresolved and manual report for an
     unconfirmed reply, and the merge-gate exclusion;
   - the lazy pointer and the eager sentence in `pr-review-comments.md`;
   - the pointer clauses in `pr-review-thread-writes.md`, `iterate.md` Phase 5 (with their
     baseline reads) and the `pr-review-integration.md` outside-diff bullet;
   - the baseline clause in `pr-review-integration.md`;
   - in `merge-gate-configured-reviewer.md`: the merge-gate one-repeat and report-then-wait
     recovery, and the step 5 review-id answer rule for an unconfirmed re-trigger;
   - the matching wait-record and Bounds wording in `host-pr-watch.md`.
8. **User guide.** In `docs/user-guide/remote-tracker.md`, document the possibly-applied outcome
   in the same voice as the `issue-close` paragraph: a lost response is reported as possibly
   applied, the caller re-reads the target, and never retries blindly. Put the `pr-comment` text at
   the comment-transport paragraph (around line 567), and the `review-thread-reply` and
   `review-create` text at the thread-write paragraph (around line 504).
9. **Budgets and formatting.** Run `pnpm format`, then `node build.mjs`. Raise only the
   `contextBudget:` lines the build reports as exceeded, to the built count plus at most ten lines.
   The build must deliver `shared/pr-write-recovery.md` to all three targets; the lazy-include
   guard checks this.

### Edge cases

- **A reviewer comments after the stored reply.** The reply is still found by its new id and
  author, so no duplicate is posted.
- **Several replies in one run** (`iterate` Phase 5 step 2). Only the failed reply's own thread is
  compared, so a reply that succeeded on another thread is never taken for it.
- **The forge normalizes whitespace in the stored body.** This has no effect, because no body is
  compared.
- **Hidden mode.** There is no marker, so the id and author decide alone, and a found reply is
  recorded in the ledger. In manual identity, a comment the operator wrote on that same thread
  between the baseline read and the re-read would count as the stored reply. `iterate` takes its
  baseline read immediately before the replies, so that window is one thread during Phase 5's
  replies, and the risk is accepted.
- **Hidden-mode PR comment.** The target is the PR's whole comment list. Any comment by the same
  login between the pre-write read and the re-read counts as the lost summary comment, for
  example an operator in manual identity or a gate trigger posted as the same account. The window
  is one write, and the risk is accepted.
- **The forge stores the reply after the re-read** (eventual consistency). The one permitted
  repeat could still post a duplicate. This race is accepted and is limited to one extra reply.
- **A reply stays unconfirmed.** It may have landed, so the report asks the operator to check the
  thread before writing anything by hand. Its thread stays unresolved and is not recorded in the
  ledger. In standard mode, a reply that did land carries the marker, so later runs treat the
  thread as done and leave it unresolved. A reply that did not land leaves the thread open for a
  later `iterate` run. In hidden mode, a later run may reach the ledger's degraded
  unrecorded-viewer-replies path and reply again, but only as a disclosed outcome, per
  `pr-thread-ledger`.
- **The unconfirmed write is the summary comment or a review publication.** It is reported only
  in the chat summary or return, never through another PR write.
- **`INVALID_PAYLOAD` after a sent request.** Three paths stay unflagged: a Forgejo `tea api`
  response with no status line, a 2xx with an unreadable body, and a GitHub exit 0 with output
  that cannot be parsed. They stay non-retryable but do not trigger the recovery. This is a known
  gap, see "Assumptions and open points".
- **A GitHub 4xx on one of the three writes.** The write is flagged as possibly applied
  (unchanged `runChecked` behaviour). The re-read finds nothing new and allows one repeat. That
  repeat fails the same way and is then reported.
- **Forgejo without thread-write routes.** `review-thread-reply` still fails
  `UNSUPPORTED_CAPABILITY` before any request, and the existing manual-reply fallback applies.
- **A suppressed summary comment** (gate-delegated `iterate`). No `pr-comment` is sent, so the rule
  never triggers.
- **merge-gate trigger in app mode.** Authorship comes from `authorType: bot`, as the existing
  checks define. The new clauses do not change that.

## Acceptance criteria

- [ ] On GitHub, a `review-thread-reply`, `pr-comment` or `review-create` whose CLI exits non-zero
      (a 5xx) returns `COMMAND_FAILED` with `mutationMayHaveSucceeded: true` and
      `retryable: false`.
- [ ] On Forgejo/Gitea, `review-thread-reply` and `pr-comment` return the same flag and
      `retryable: false` in two cases: a `tea api` status of 500, 502 or 503, including a non-JSON
      error body, and a failed `tea` transport. A stated 4xx stays non-retryable without the flag.
- [ ] `test/remote-tracker.test.mjs` covers both providers in the style of the existing
      `issue-close` possibly-applied tests. The split loop keeps `issue-comment` as the negative
      control that still reports `retryable: true` without the flag.
- [ ] `src/shared/pr-write-recovery.md` states the recovery rule once: the re-read target for
      each operation, the evidence (a new id by the authenticated login against the last
      pre-write read of that target), the marker in standard mode, the ledger record in hidden
      mode, the one-repeat limit, the unresolved and manual report, and the merge-gate exclusion.
- [ ] Pointers name the fragment at every write site:
      - a lazy pointer and an eager duty sentence in `pr-review-comments.md`, both excepting
        merge-gate trigger posts;
      - one-clause pointers in `pr-review-thread-writes.md`, `iterate.md` Phase 5 (with baseline
        reads) and the `pr-review-integration.md` outside-diff bullet;
      - in `pr-review-thread-writes.md`, "Reply to a thread" makes the re-read mandatory before any
        repeated reply.
- [ ] `pr-review-integration.md` requires a `pr-reviews-read` before `review-create`.
- [ ] `merge-gate-configured-reviewer.md` states the one-repeat limit and the report-then-wait
      outcome for steps 3 and 5, and the review-id answer rule for an unconfirmed step 5
      re-trigger.
- [ ] `host-pr-watch.md` records that baseline in place of `createdAt`.
- [ ] A prose contract test in `test/workflow-contracts.test.mjs` asserts every item in the two
      criteria above, and every existing prose test still passes.
- [ ] `docs/user-guide/remote-tracker.md` documents the possibly-applied outcome of the three
      writes at their transport paragraphs.
- [ ] CI's order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
      `pnpm test:distribution`.

## Validation plan

- Run `pnpm test:preflight`, then CI's order: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  `pnpm test:distribution`. Run them through `t3-project`, as the host runtime instructions require.
- Targeted runs:
  - the split comment loop and the new PR-write tests in `test/remote-tracker.test.mjs`;
  - the existing `issue-close` and `pr-merge` possibly-applied tests in the same file;
  - `test/workflow-contracts.test.mjs`: the `#552` test, the configured-reviewer tests (around
    lines 11153 and 11354) and the new prose test;
  - `test/unattended-planning-contract.test.mjs`, `test/session-contracts.test.mjs`,
    `test/scored-decisions-contract.test.mjs`, `test/repair-attempt-contract.test.mjs`,
    `test/merge-gate-eval.test.mjs` and `test/model-tiers-contract.test.mjs`.
- Confirm that `node build.mjs` delivers `shared/pr-write-recovery.md` to the Claude, Codex and
  portable targets, and passes the lazy-include guards.
- Run `pnpm eval iterate verify`, `pnpm eval merge-gate verify` and `pnpm eval build-context verify`.
  All three are read-only and report the evidence debt that these edits create. Recording fresh
  evidence is not part of this change.

## Assumptions and open points

- Assumption: `gh api` exits non-zero on an HTTP 5xx, so the GitHub path reaches the failure
  branch of `runChecked`. The tests assert no stderr text beyond what they supply.
- Baseline reads: `iterate` Phase 5 has no explicit read immediately before its replies or summary
  comment, so the new clauses add `review-threads-read` and `pr-comments-read` there. The new
  `pr-review-integration.md` clause adds the `pr-reviews-read` that `review-create` lacks today.
  Merge-gate step 5 adds one before its re-trigger.
- Assumption: no workflow branches on `error.retryable` for these three writes today. A search of
  `src/shared` and `src/tools` verified this. Flipping it from `true` to `false` therefore changes
  no control flow beyond the new recovery rule.
- Follow-up (deliberately out of scope, scored decision): three outcomes after a sent request still
  return `INVALID_PAYLOAD` without the flag:
  - a `tea api` response with no status line (`remote-tracker-core.mjs` around 2069);
  - a 2xx with an unreadable body (around 2082);
  - a GitHub exit 0 with output that cannot be parsed (around 7765).

  They already fail closed as non-retryable. Flagging them would affect every set member and
  reverse existing tests, so it belongs in a separate issue.
- Note: the scored decision on the recovery evidence was first scored on an inaccurate premise:
  that an older marked reply could sit on a thread being answered again. It was re-scored with
  corrected context before being applied. The block below records only the applied decision.
- Expected evidence debt: the edits change sources that the `iterate`, `merge-gate` and
  `build-context` eval suites load, and the suites follow the new lazy pointer. All three will
  report freshness debt. Under the pragmatic test and release policy, that debt is reported, not
  repaired here.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->
```json
[{"site":"S-CLR","question":"Which non-idempotent PR write mutations should join POSSIBLY_APPLIED_MUTATIONS in this change?","options":["Thread reply only","Thread reply and PR comment","All three","Decide later"],"escape":["Decide later"],"scores":[{"label":"Thread reply only","score":5,"reason":"It fixes the observed duplicate with the smallest prompt cost but leaves the same hazard open for pr-comment and review-create, which the issue asks this change to decide."},{"label":"Thread reply and PR comment","score":6,"reason":"The marker-tagged iterate summary makes a PR-comment re-read cheap to document, but excluding review-create has no principled basis since a duplicated review is the costliest duplicate."},{"label":"All three","score":8,"reason":"It applies the documented-recovery membership rule consistently to every non-idempotent PR write and also covers the most damaging duplicate, a whole review, at the cost of three short re-read recovery sentences in their owning fragments."}]},{"site":"S-CLR","question":"Which evidence in the mandatory re-read makes a thread count as already answered by the failed attempt, so the reply is never sent again?","options":["Viewer reply since pre-write read","Newest viewer reply","Exact body match","Marker anywhere","Decide later"],"escape":["Decide later"],"scores":[{"label":"Viewer reply since pre-write read","score":9,"reason":"A comment id new since the pre-write read and authored by the authenticated login (marked in standard mode) finds the stored reply even after a later reviewer comment or whitespace normalization, and unlike Marker anywhere it also settles hidden mode and records the reply in the ledger."},{"label":"Newest viewer reply","score":3,"reason":"A reviewer or bot comment right after the stored reply makes the check miss it, so the reply is sent twice."},{"label":"Exact body match","score":3,"reason":"Forge whitespace normalization can make a stored reply fail an exact comparison and be sent again."},{"label":"Marker anywhere","score":7,"reason":"Works as well as the id check in standard mode because the pre-write read showed no marked reply, but in hidden mode it only stops for manual verification."}]},{"site":"S-BAT","question":"How does the review-create recovery obtain its baseline?","options":["Pointer in pr-review-integration","Baseline-free review check","Shared rule only","Decide later"],"escape":["Decide later"],"scores":[{"label":"Pointer in pr-review-integration","score":8,"reason":"One clause naming the pr-reviews-read taken just before review-create as the recovery baseline settles the conflict with the fragment two-surfaces text, keeps the shared id-based rule and adds one line; the next-best option leaves the fragments contradicting each other."},{"label":"Baseline-free review check","score":4,"reason":"It breaks the single shared rule: an earlier marked review by the viewer at the same head would be mistaken for the lost write, and hidden mode always falls back to manual verification."},{"label":"Shared rule only","score":5,"reason":"The shared fallback technically closes the gap, but the integration fragment still says only two surfaces are read, so its consumer may skip the baseline read."}]},{"site":"S-BAT","question":"Is the possibly-applied recovery rule eager or lazy-loaded?","options":["Eager in pr-review-comments","Lazy-include at the failure","Decide later"],"escape":["Decide later"],"scores":[{"label":"Eager in pr-review-comments","score":5,"reason":"It works but adds about eight lines to a fragment five tools load eagerly on every run for a branch only a rare structured failure reaches."},{"label":"Lazy-include at the failure","score":8,"reason":"The trigger is one nameable decision point, so it meets the progressive-disclosure test, and an eager never-resend-blindly sentence that also names the pre-write read duty keeps the mandatory re-read visible."}]},{"site":"S-BAT","question":"How wide is the recovery trigger for the three PR writes?","options":["Narrow to the flag","Prose covers any failure","Helper flags INVALID_PAYLOAD too","Decide later"],"escape":["Decide later"],"scores":[{"label":"Narrow to the flag","score":8,"reason":"It keeps one helper-owned trigger matching the issue 5xx scope and the state-contracts-once rule; the unflagged INVALID_PAYLOAD paths already fail closed as non-retryable, so they become a named follow-up."},{"label":"Prose covers any failure","score":5,"reason":"The extra re-read is cheap, but prose would judge from bare error codes whether a request went out, drifting from the helper flag into a second contract."},{"label":"Helper flags INVALID_PAYLOAD too","score":4,"reason":"Structurally complete but reaches into issue-close, pr-merge and issue-sub-issue-create and reverses existing fail-closed tests, so it belongs in a separate follow-up."}]},{"site":"S-BAT","question":"After a second flagged failure or an unconfirmed re-read of a merge-gate trigger or re-trigger post, what does the gate do?","options":["Report and wait","Report and stop","Decide later"],"escape":["Decide later"],"scores":[{"label":"Report and wait","score":8,"reason":"A lost response usually means the comment landed, so one blocking wait turns the likely case into a verdict this run, while step 4 timeout report already covers a trigger that did not land."},{"label":"Report and stop","score":5,"reason":"Safe and deterministic, but it gives up a round in the common case where the trigger landed and blocks the merge without observing the bot."}]},{"site":"S-DEC","question":"How does merge-gate step 5 decide the reviewer has answered when the re-trigger post is unconfirmed?","options":["Recover createdAt, local fallback","Review-id baseline","Decide later"],"escape":["Decide later"],"scores":[{"label":"Recover createdAt, local fallback","score":4,"reason":"Recovering the forge createdAt is sound when the comment landed, but the local-time fallback compares clocks and fails open when the local clock runs behind, while host-pr-watch gains a mixed-clock wait record."},{"label":"Review-id baseline","score":8,"reason":"It reuses the plan id-absent-from-pre-write-read evidence, so no clock skew can fail open, and confirmed re-triggers keep the existing createdAt rule, at the cost of an id-set variant of the host-pr-watch wait record and report wording."}]}]
```
<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area | Critical | Important | Note |
| --- | ---: | ---: | ---: |
| Architecture | 0 | 2 | 1 |
| Security | 0 | 0 | 0 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 6 | 1 |
| Testability | 0 | 0 | 3 |
| Scope | 0 | 0 | 1 |
| Maintainability | 0 | 0 | 2 |

### Findings

- Error cases, Important: the goal promised a flag on every unobservable failure, while some
  failures after a sent request stay unflagged `INVALID_PAYLOAD`, and the pointers used two
  different triggers. Incorporated by scored decision: every trigger is the helper's flag, and
  the unflagged paths are a recorded follow-up.
- Architecture, Important: the `review-create` baseline was described as an existing read, but
  none exists. Incorporated: `pr-review-integration.md` now requires a `pr-reviews-read`
  immediately before `review-create`, outside signature de-duplication.
- Architecture, Important: the only load pointer sat far from where the writes fail.
  Incorporated: every write site names `shared/pr-write-recovery.md` in one clause, including
  `iterate` Phase 5 steps 2 and 3, and one fence is kept.
- Error cases, Important: the merge-gate recovery was split across two fragments, contradicted
  step 3's direction for an unprovable comparison, and left the gate's behaviour after a second
  failure undefined. Incorporated: the recovery moves into `merge-gate-configured-reviewer.md`, and
  the general fragment only excludes these posts. By scored decision, the outcome after a second
  failure is to report and then wait.
- Error cases, Note: in hidden mode, a PR comment's target is the whole comment list.
  Incorporated as an accepted edge case.
- Testability, Note: the `build-context` suite also takes on evidence debt. Incorporated into the
  validation plan and the debt note.
- Testability, Note: other prose tests assert text in the edited sections. Incorporated: the
  edits are strictly additive, and those test files are in the targeted runs.
- Deep review, Error cases, Important: reporting an unconfirmed summary comment "in the summary
  comment" would repeat the very write, and review publication has no summary comment.
  Incorporated: only unconfirmed replies go into the summary comment or return. Every other
  unconfirmed write is reported in the chat summary or return, never through a new PR write.
- Deep review, Error cases, Important: the "manual reply" wording and the edge case treated an
  unconfirmed write as never written. Incorporated: the report says "possibly posted,
  unconfirmed", and the edge case now describes the standard-mode marker and hidden-mode ledger
  outcomes.
- Deep review, Error cases, Important: the step 5 local-time substitute mixed clocks and left the
  `host-pr-watch` wait record and reports undefined. Incorporated by scored decision: while a
  re-trigger is unconfirmed, the answer is a review id absent from a `pr-reviews-read` taken before
  the post, the wait record stores that baseline, and `host-pr-watch.md` is in scope.
- Deep review, Error cases, Important: `iterate` Phase 5 has no explicit read right before its
  replies, so the baseline window was wider than stated. Incorporated: the Phase 5 clauses require
  `review-threads-read` and `pr-comments-read` immediately before the writes.
- Deep review, Architecture, Note: merge-gate trigger posts would load the general fragment only to
  read their exclusion. Incorporated: the `when:` clause and the eager sentence except them.
- Deep review, Maintainability, Note: the rewritten code comments could contradict the one
  allowed repeat. Incorporated: the comments read "never re-run without first re-reading the
  state".
- Deep review, Scope, Note: the outside-diff marked PR comment had no pointer. Incorporated.
- Deep review, Testability, Note: two prose-reading test files were missing from the targeted
  runs. Incorporated.
- Deep review, Maintainability, Note: the user-guide thread-write location was wrong.
  Incorporated: corrected to around line 504.

## Open points

- No open points.
