# Offer to tick reviewed acceptance criteria before merge-gate closes an issue

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Issue:** #816

## Requirement

After a merge, merge-gate's post-merge issue observation (Phase 5.5, body in
`src/shared/merge-gate-issue-observation.md`) can rate a linked issue `incomplete` for one reason
only: nobody ticked its task-list checkboxes. This happens even when an Effective Flow review on
the same head has already rated every acceptance criterion `complete`. The `complete` verdict
requires "no unchecked entry in the issue's **own** task list"
(`merge-gate-issue-observation.md:113-123`). An `incomplete` verdict never reaches the `Issue done`
offer (`:133-134`). The case is common when the pull request refers to the issue with `Refs #N`
instead of a closing keyword.

Goal, as the maintainer decided it in the issue comment:

- One new follow-up offer, behind explicit confirmation: "Tick the listed criteria and close the
  issue".
- Preconditions for the offer:
  - The verdict is `incomplete` solely because of unchecked task-list entries.
  - An Effective Flow review on the merged head SHA marks every stated criterion of the issue
    `complete`.
- The offer quotes each criterion together with its review evidence.
- Nothing is written without confirmation. On confirmation the run ticks exactly the listed
  entries through the hash-guarded body update. It then closes the issue through the existing done
  path.
- In every other case the verdict stays `incomplete`, as it is today.
- No configuration switch. The rule against silently ticking checklists stays intact.

Workflow rationale: Feature. This adds new, user-visible merge-gate behaviour: a new gated
question, a new forge write path and two new helper operations. Nothing is corrected.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #816
**Original outcome:** A merge-gate run offers tick-and-close for an issue that is `incomplete` only because of unchecked task-list entries, provided a trusted Effective Flow review on the merged head marks every stated criterion `complete`. The run writes nothing without confirmation. On confirmation it ticks exactly the listed entries through the hash-guarded body update and closes through the existing done path. Every other case keeps today's verdict and behaviour. Fixture tests cover the offer, the decline and both fallback cases.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** fresh baseline: a pinned acceptance-summary line format, one read-only verdict helper, one local tick helper, and one new gated merge-gate question that feeds the existing done path
**Continuation decision:** none

## Architecture decisions

- **Read the review's verdict mechanically, from pinned summary lines.** Decided by score (see
  "Decided by score").
  - The acceptance-summary rule in `src/shared/review-acceptance-lens.md:128-148` is pinned to one
    parseable list line per criterion: `- issue-<n>#criterion-<key8>: <verdict>`. `<verdict>` is
    `complete`, `incomplete` or `undetermined`, optionally followed by ` — <fixed reason>`. The
    reason comes only from the lens's closed set (`:138-140`): none for `complete`, the published
    finding for `incomplete`, and "not confirmed in this review" for `undetermined`.
  - The review body stays human-facing prose (`src/shared/pr-review-integration.md:200-202`). The
    line is the visible summary itself, not a second hidden copy.
  - A new read-only forge-read operation in `src/scripts/remote-tracker-core.mjs` reads the lines.
    Its working name is `pr-acceptance-verdicts`.
  - The parser anchors on the whole line and ignores quoted (`>`) and fenced lines. Its one
    grammar is
    `^- issue-(\d+)#criterion-([0-9a-f]{8}): (complete|incomplete|undetermined)(?: — (.+))?$`.
    Two kinds of line count as `undetermined` for their key: a `complete` line with any suffix, and
    a line that names a requested issue and key but does not match the grammar.
  - The summary also carries one pinned line `reviewed-head: <sha>`, the head the lens collected its
    sources at (`review-acceptance-lens.md:26-34`). Decided by score. GitHub binds a review to the
    head at submission time because `buildReviewPayload`
    (`src/scripts/remote-tracker-github-core.mjs:80-125`) sends no `commit_id`, so a push during the
    review could otherwise file old-head verdicts under the new head. The helper requires
    `reviewed-head` to equal both the review's `commitSha` and the merged head. A missing or
    mismatched line disqualifies the review.
- **Only a trusted, submitted review on the merged head counts.**
  - `pr-acceptance-verdicts` makes its own `pr-read` and takes the head SHA from the raw provider
    record (`raw.head.sha`), as `pr-acceptance-sources` does (`remote-tracker-core.mjs:7164`).
    The normalized `pr-read` record carries only the head branch name (`:2997-3011`). The pull
    request must be merged.
  - An optional caller-supplied `headSha` is cross-checked against it. That value is Phase 5's
    `pr-merge` `headSha`, when present. A mismatch fails closed.
  - From `pr-reviews-read` (`:3935-3984`) the helper keeps a review only when all of these hold:
    - its body's first line is the `<!-- effective-flow-pr-review -->` marker, under the existing
      leading-line rule (`COMMENT_MARKERS` and `stampMarker` in
      `src/scripts/remote-tracker-shared-core.mjs:287-313`);
    - its `commitSha` equals the merged head;
    - its state is neither `PENDING` nor `DISMISSED`, and `submittedAt` is present;
    - its author passes the write-permission gate the acceptance sources use
      (`acceptanceAuthorPermission`, `:6043`). A marker alone can be spoofed.
- **GitHub only for the review evidence.** Every `tea`-backed forge refuses `review-create`, and the
  fallback is a pull-request comment with no head binding
  (`src/shared/pr-review-thread-writes.md:47-54`, `remote-tracker-operations.md:71`). On Forgejo the
  helper therefore reports no qualifying review, the offer never fires, and no fallback comment is
  read.
- **Reachability is narrow, and the plan accepts that.** Stream 2d runs only on an explicit
  `review <PR>`, never on the automatic post-delivery review (`review-acceptance-lens.md:3-5`). A
  closed pull request keeps the summary in chat (`:147-148`). merge-gate's own rounds can also move
  the head.
  - The offer therefore fires only when someone ran `review <PR>` on exactly the final head before
    the merge.
  - On GitHub, an issue that would be tick-eligible except for a missing qualifying review gets one
    report hint: run `review <PR>` on the final head before merge-gate. On a `tea`-backed forge the
    report says "tick offer unavailable on this forge" instead.
  - Making merge-gate run a review itself is out of scope.
- **The offer is fail-closed per issue.** An issue is tick-eligible only when every condition below
  holds on this run's fresh reads:
  - It is a forge issue. The probes show `issueUpdate`, `issueClose`, `prReviewsRead` and
    `collaboratorPermissionRead`. When any is missing, the report names it.
  - Every dimension of the existing `complete` rule holds except the own-task-list one: at least
    one stated criterion, PR-locator coverage of every criterion, no open native sub-issue, and no
    needs-planning classification in either spelling.
  - `issue-acceptance-criteria` returns the issue as `trust: 'trusted'`, within its issue bound,
    with no `truncated[]` entry for it.
  - None of its criteria is `dropped` or `displayTruncated`, and no two criteria share a `key8`.
    The projection gains an additive `key8` field (`issueCriteriaProjection`, `:5597-5617`), which
    the `pr` consumer ignores.
  - `task-list-tick` run dry over the body with all of the issue's criterion `key8`s returns
    `remainingUnchecked: 0`. So every unchecked task item in the body is a criterion, and an
    unchecked entry outside the criteria sections makes the issue ineligible.
  - At least one qualifying review lists every current criterion `key8` as `complete`. Decided by
    score: a qualifying review that omits a key is neutral. Only explicit `incomplete` or
    `undetermined` lines block.
  - No qualifying review on that head lists any of them as `incomplete` or `undetermined`.

  Anything else leaves the verdict and behaviour exactly as today.
- **Quote sanitized criterion text in the chat listing only.** Decided by score.
  - The listing before the question quotes each criterion's `displayText`, next to its evidence
    reference. The reference is rendered from the helper's parsed record (review id or URL,
    `commitSha`, `issue-<n>#criterion-<key8>: complete`) and is never copied from the review body.
  - The `ask` text itself stays fixed and quotes nothing.
  - The no-quoting rule gains one named exception with its own reason. `displayText` is neutralized,
    trust-gated and capped. The write it precedes is also bounded to the listed `key8`s, so the
    quoted text cannot change what gets written.
  - The sites to amend are `merge-gate-issue-observation.md:136-141`, `:193-195` and `:207-211`.
    Decided by score: the exception reaches the gated chat listing and the relayed
    `BLOCKED-USER issue-tick-done` evidence, because a relayed user sees the listing only there. It
    never reaches the `ask` text or the Phase 6 report. Raw issue or review text is never quoted.
- **A separate gated question with its own relayed id, posed first.** Decided by score.
  - The new `ask` fence has header `Tick and close`, options `Tick and set to done` and
    `Leave open`, and relayed id `issue-tick-done`. It is posed once per run for every tick-eligible
    issue, before `Issue done`.
  - On confirmation, its own per-issue loop runs, in order:
    1. Revalidate tick-eligibility on fresh reads.
    2. Tick.
    3. Write.
    4. Close through the existing transition mechanics of step 4: `issue-close` dry-run then
       `--apply`, then the post-transition re-read that must show `terminal (done)`.

    Its confirmed set only shrinks.
  - Ticked issues never enter the `Issue done` listing, which is built only from the issues step 3
    rated `complete`. Declining `Issue done` does not affect them.
  - The "nothing enters this loop late" sentence (`:291-294`, pinned at
    `test/workflow-contracts.test.mjs:13645`) gains one scoped clause for the separately confirmed
    tick set.
  - Steps 5 to 7 run after both questions.
  - A relayed run returns `BLOCKED-USER issue-tick-done` first and `BLOCKED-USER issue-done` on the
    next dispatch, because a dispatch returns exactly one question (`src/tools/merge-gate.md:133-137`).
  - The consumed `issue-tick-done` answer is a once-per-run record in the delegated run's wisdom
    file (`src/shared/merge-gate-delegated-run.md:498-506`). The record holds the instance digest, the
    option and each issue's outcome. Decided by score: once that record exists, no later dispatch
    of the same gate run poses `Tick and close` again, whatever its recomputed digest, and the
    recorded per-issue outcomes always reach Phase 6. An issue that becomes tick-eligible only after
    the record exists stays open, which is the safe default. Without this, a decline
    followed by an `issue-done` answer would re-ask `issue-tick-done` and lose the `Issue done` answer
    (`src/tools/merge-gate.md:321-330`).
  - Each state digest subject key has the form `#<n>=<key8>+<key8>…`, with the `key8`s sorted. The
    keys are comma-joined as the digest sentence (`merge-gate.md:122-129`) already does, so no key
    contains a comma.
- **Ticking is a pure local transform plus the existing guarded write.**
  - A new local operation, `task-list-tick`, takes `{body, keys}`, where `keys` are all of the
    issue's criterion `key8`s. It is built on the existing `sectionListItems` walk
    (`remote-tracker-core.mjs:5441-5525`), extended with raw line indices, so its `key8`s are exactly
    the lens's and every other byte survives, CRLF included. Each key must match exactly one top-level item across every
    criteria-heading section. A zero or multiple match fails the operation and nothing is written.
  - An unchecked `[ ]` item becomes `[x]` on its first line only; continuation lines are preserved.
    Items already marked `[x]`/`[X]` and plain list items without a checkbox are counted no-ops
    (`alreadyTicked`, `notTask`). `walkIssueCriteria` accepts both forms (`:5576-5580`).
  - It returns `body`, `changed`, `ticked`, `alreadyTicked`, `notTask` and `remainingUnchecked`.
    `remainingUnchecked` counts the list items left anywhere in the resulting body, at any
    indentation and outside fenced code, whose text matches `MARKDOWN_CHECKBOX` with a space. Over-counting
    is fail-closed. It also returns `inputHash`, the `bodyHash` of the exact input body.
  - The write is the existing `issue-update-body` (`staleWriteGuard`, `:4619-4687`). Its
    `expectedBodyHash` is `task-list-tick`'s `inputHash` over the freshly read body, so the hash is
    bound to the exact string that was ticked. `checklist-patch` addresses entries by reference token, so it
    is not reused.
- **Interactive only, with no silent tick.**
  - A non-interactive run poses nothing, ticks nothing and carries the recommendation into the
    Phase 6 summary.
  - The sentence that the own task list "is not a completion signal by itself" stays. It gains the
    rule that this run ticks only after the `Tick and close` confirmation.
- **Owning fragment.** The offer is stated once, in `merge-gate-issue-observation.md`. The general
  contract `src/shared/issue-post-merge-observation.md` loads at the same decision point
  (`merge-gate-delegated-run.md:189-192`, `:1450-1453`). It keeps its verdict rule and gains one
  pointer sentence: a hosting fragment may define a single confirmation-gated tick offer for an item
  that is `incomplete` only because of task-list entries; its listing is the one other named quoting
  exception; and its reads and its separately confirmed set are scoped there.
  - The pointer amends the general contract's statements that conflict with it: "only a `complete`
    verdict may lead to an offer" (`:152`), the single-exception and "anywhere" quoting sentences
    (`:139-141`, `:148-150`, `:157-161`), "one pull-request read for the whole run" (`:79-81`) and
    "nothing enters it late" (`:189`).
  - It adds no second copy of the detail.

## Affected files

| File | Description |
|---|---|
| `src/shared/merge-gate-issue-observation.md` | Intro (`:3`, "steps 1 to 7 and the transition gate"). Step 3: record the tick-eligible sub-case of `incomplete`, its fail-closed conditions, and the composite read bounds. Step 4: the tick-eligible listing, the scoped quoting exception, the `Tick and close` loop before `Issue done`, the "nothing enters late" clause, relayed and non-interactive handling. New `Tick and close` `ask` fence. Report items for ticked, declined, stale-write, no-longer-eligible, missing-review hint and fallback outcomes |
| `src/shared/review-acceptance-lens.md` | Pin the acceptance-summary criterion line format with its optional fixed-reason suffix, and the `reviewed-head: <sha>` line |
| `src/shared/issue-post-merge-observation.md` | One pointer sentence to the hosted tick offer, scoping the `complete`-only offer rule, the quoting exception, the read bound and "nothing enters late" (`:79-81`, `:104-105`, `:139-161`, `:189`) |
| `src/shared/merge-gate-delegated-run.md` | Wisdom-file list (`:498-506`): the once-per-run `issue-tick-done` record |
| `src/shared/setup-allowlist.md` | Allow-rule and read-only operation counts (`:3`, `:82`) |
| `docs/user-guide/tools-setup.md` | Allow-rule and read-only operation counts (`:275`, `:282`) |
| `src/tools/merge-gate.md` | `issue-tick-done` row in the relayed question table and its state-digest subject keys; `contextBudget` adjusted from the measured `node build.mjs` report if the eager line count changes |
| `src/shared/next-steps.md` | `issue-tick-done` among the questions that never count for T3 (`:165`) |
| `src/scripts/remote-tracker-core.mjs` | New forge-read operation `pr-acceptance-verdicts`; new local operation `task-list-tick` in `LOCAL_OPERATIONS` (`:213`); additive `key8` in `issueCriteriaProjection`; operation lists, capability map (read: `prReviewsRead`) and input validation |
| `src/shared/remote-tracker-operations.md` | Rows and input notes for both new operations; `key8` in the `issue-acceptance-criteria` output |
| `src/scripts/claude-settings-core.mjs` | Classify both new operations under the existing listed/excluded rule; both are non-mutating |
| `docs/developer-guide/architecture.md` | Allow-rule total and read-only `remote-tracker` operation count (`:1144`, `:1146`) |
| `docs/developer-guide/configuration.md` | Count of read-only `remote-tracker.mjs` operations (`:135`) |
| `docs/developer-guide/build-system.md` | Fragment description (`~:1805`), which currently says seven steps and one transition gate; operation count (`:1532`) |
| `test/remote-tracker.test.mjs` | Fake-runner fixture tests for both operations and the `key8` projection |
| `test/remote-tracker-operations-reference.test.mjs` | Kind map and sample inputs for both operations |
| `test/workflow-contracts.test.mjs` | Prose-contract assertions for the offer, the decline, both fallbacks, the question order, the relayed and non-interactive paths, the forge-only and capability gates, the new id in `RELAYED_QUESTION_IDS` (`:26480`), the pinned summary line, and the adjusted no-quoting and "nothing enters late" assertions (`~:13645-13700`) |

## Implementation details

### Approach

1. **Pin the summary line.** In `review-acceptance-lens.md` "Acceptance summary", state the
   one-line-per-criterion format with its optional fixed-reason suffix. An ADR candidate keeps its
   own line, which is never parsed. Pin the format with a contract test.
2. **Extend `issue-acceptance-criteria`** with an additive `key8` per kept criterion, using the
   same `criterionKey` (`:5426-5428`) the lens uses.
3. **Add `pr-acceptance-verdicts`** (forge read, GitHub only for qualifying reviews).
   - Input: `number`, `issues` (distinct positive integers, bounded like
     `issue-acceptance-criteria`), and an optional `headSha`.
   - It makes its own `pr-read` for the merged head, then reads `pr-reviews-read` and applies the
     filters from "Architecture decisions". It parses only exact lines that name a requested issue.
   - Output: `headSha`, plus per issue the qualifying reviews (`id`, `commitSha`, `author`, URL when
     the provider returns one) and a per-`key8` record of every verdict each review gave.
   - A review whose lines contradict each other for one key counts as `undetermined` for that key.
     On Forgejo the output holds no qualifying review.
4. **Add `task-list-tick`** (local, pure) with the semantics from "Architecture decisions". It
   preserves every byte except the ticked checkbox characters.
5. **Step 3 sub-case.**
   - When the only unmet `complete` dimension is unchecked own-task-list entries, check
     tick-eligibility.
   - Reads: one `issue-acceptance-criteria` call for the affected issues and one
     `pr-acceptance-verdicts` call for the run, plus a dry `task-list-tick` on the already read
     body.
   - Next to the existing fixed bound sentence (`:99-102`), name the two calls as separate composite
     reads, each with its own author-permission reads.
   - The verdict stays `incomplete`. The record notes `tick-eligible` with the criteria `key8`s, or
     the reason the issue is not.
6. **Step 4 offer.**
   - When at least one issue is tick-eligible and the run is gated, list each tick-eligible issue:
     its reference, then per criterion its ordinal, `key8`, `displayText` and evidence reference.
   - Then pose `Tick and close` once, before `Issue done`.
   - On `Tick and set to done`, take each listed issue in turn:
     1. Revalidate with one `issue-acceptance-criteria`, one `pr-acceptance-verdicts`, one
        `issue-read`, one sub-issue read and one `pr-read`. The fresh criterion `key8` set must be a
        subset of the listed set (or equal to it), and the fresh dry tick must return
        `remainingUnchecked: 0`.
     2. Run `task-list-tick` on the fresh body.
     3. Run `issue-update-body` (dry-run, then `--apply`) with its `inputHash`.
     4. Re-read the issue, its sub-issues and the pull request, and re-derive the verdict by step 3's
        rules. Only a `complete` verdict proceeds.
     5. Close through step 4's transition mechanics and the post-transition re-read that must show
        `terminal (done)`.

     The per-issue budget is the eight reads of steps 1 and 4 plus the post-transition re-read.
   - Revalidation (6.1) and the pre-close re-read (6.4) apply step 4's three revalidation outcomes
     word for word (`merge-gate-issue-observation.md:267-285`):
     - The issue is now terminal: skip the tick or the transition, and replace its recorded outcome
       with step 2's split outcome.
     - It is no longer eligible or no longer `complete`: drop it.
     - The read failed or could not be performed: drop it.

     The post-transition re-read in 6.5 replaces the recorded outcome, as step 4's does.
   - A failed transition follows step 4's failure rule (`:323-327`): continue with the remaining
     issues and never retry blindly.
   - The option description discloses everything the confirmation authorizes: the tick write, the
     transition, the label removal (step 5) and the container completion (step 6).
7. **Relayed and non-interactive runs.**
   - A relayed run returns `BLOCKED-USER issue-tick-done` before `issue-done`. A consumed
     `Tick and set to done` confirms exactly as a posed answer does.
   - A non-interactive run writes nothing and reports the recommendation.
8. **Report items.** Per tick-eligible issue, report one of:
   - ticked and closed;
   - declined: still open, with the unchanged closure guidance;
   - stale write: still open, nothing ticked;
   - no longer eligible on revalidation;
   - ticked, but the pre-close verdict was no longer `complete`, with its reason;
   - ticked, but the transition failed with its blocker, or the re-read showed another split
     outcome;
   - became terminal during the tick loop, reported with its split outcome.

   Fallback cases report today's `incomplete` reason unchanged. An issue that is otherwise eligible
   but has no qualifying review also gets the `review <PR>` hint.
9. **Registration.**
   - Add `issue-tick-done` to the relayed question table, the digest sentence, `next-steps.md:165`
     and `RELAYED_QUESTION_IDS`.
   - Add both operations to the reference table, its test maps, `LOCAL_OPERATIONS` (for
     `task-list-tick`) and the allowlist classification.
   - Update the operation counts in the two developer guides.
   - Rebuild, and update any `contextBudget` from the measured report.

### Component structure

Not relevant: no UI components.

### State management

Every forge write sits behind the confirmation. The only run state is the delegated run's
once-per-run `issue-tick-done` wisdom-file record (instance digest, option, per-issue outcomes),
which the relayed path uses.

### API integration

The plan adds two new `remote-tracker` operations (Approach steps 3 and 4) and one additive output
field (step 2). They reuse `pr-read`, `pr-reviews-read`, `issue-acceptance-criteria`, `issue-read`,
`issue-update-body` and `issue-close`. No new provider call shape is added.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **No qualifying review.** The review has no marker, another head SHA, a non-writer author, or a
  `PENDING` or `DISMISSED` state; or the run is in hidden mode, on Forgejo, or on an external
  target. The verdict stays `incomplete`, there is no offer, and the report names the reason.
- **A criterion is not `complete`.** A qualifying review names a criterion `incomplete` or
  `undetermined`, or two qualifying reviews disagree. The issue is ineligible.
- **A review omits a criterion.** It might be a review of older criterion text, or a lens failure
  that still carries a `reviewed-head` line. The omission is neutral, and eligibility then depends
  on the other qualifying reviews.
- **Unusable criteria or task list.**
  - An unchecked task item sits outside the criteria sections (`remainingUnchecked > 0`).
  - A criterion is truncated, dropped or `key8`-colliding.
  - The issue is untrusted, truncated or over the issue bound.

  The issue is ineligible in each case.
- **Missing capability.** A required capability is unprobed or refused. The issue is ineligible and
  the capability is named.
- **Stale body.** The body changed between the read and the write, so `issue-update-body` returns
  `STALE_WRITE`. Nothing is ticked, the issue is not closed, and the report names it. There is no
  blind retry.
- **Already ticked.** Every criterion is already ticked, so `task-list-tick` reports `changed: false`
  and no write is needed. The issue proceeds to the close, whose re-read decides.
- **Tick succeeds, close is refused.** The post-write verdict (Approach step 6.4) is not
  `complete`, for example because a sub-issue was opened meanwhile. The ticks stay, because they reflect reviewed evidence.
  The issue stays open and is reported with its new reason.
- **Issue already `complete`.** It is unaffected and goes only to `Issue done`.

## Acceptance criteria

- [ ] For an issue with unticked criteria and a qualifying review on the merged head that marks all
      of them `complete`, a gated run lists the issue and poses `Tick and close` before `Issue done`.
      No forge write happens before confirmation. Checked by contract assertions on the fragment and
      by `test/remote-tracker.test.mjs` fixtures for `pr-acceptance-verdicts`.
- [ ] On `Leave open` nothing is ticked or closed (contract assertion).
- [ ] Without a qualifying review, or with a qualifying review that marks any criterion
      `incomplete` or `undetermined`, the verdict stays `incomplete` and no offer is made, as today.
      Checked by the Validation plan's `pr-acceptance-verdicts` filter and parser fixtures, plus
      contract assertions.
- [ ] `task-list-tick` changes exactly the listed unchecked criterion lines and no other byte, and
      reports `remainingUnchecked`. It fails on a zero or ambiguous match. The write goes through
      `issue-update-body` with `expectedBodyHash`, and a stale hash yields `STALE_WRITE` with no
      write. Checked by the Validation plan's `task-list-tick` fixtures.
- [ ] The relayed order (`issue-tick-done` before `issue-done`), a relayed decline followed by an
      `issue-done` answer that still applies `Issue done`, no re-pose of `Tick and close` after a
      consumed answer, an issue that becomes terminal during the tick loop, the non-interactive
      no-write path,
      the forge-only and capability gates, and the close after the tick via the existing re-read are
      asserted in `test/workflow-contracts.test.mjs`.
- [ ] `issue-tick-done` is registered in the relayed question table and in `RELAYED_QUESTION_IDS`,
      and the pinned criterion and `reviewed-head` line formats are asserted.
- [ ] A contract assertion pins the quoting exception's scope: `displayText` appears in the gated
      listing and the relayed evidence, never in the `ask` text or the Phase 6 report.
- [ ] CI order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
      `pnpm test:distribution`.

## Validation plan

- `pnpm test` with new fixtures in `test/remote-tracker.test.mjs`:
  - `pr-acceptance-verdicts`:
    - the review filters: a qualifying review, wrong head SHA, a `headSha` mismatch, a missing or
      mismatched `reviewed-head` line, a marker not on
      the first line, a missing marker, a non-writer author, `PENDING` and `DISMISSED` states, a
      missing `submittedAt`, and an unmerged pull request;
    - the parser: a verdict line inside a `>` quote or a fenced block (ignored), a line for an issue
      that was not requested, contradicting lines in one review (`undetermined`), an incomplete
      verdict, a `complete` line with a suffix and a malformed line (both `undetermined`), and a
      review that omits a key (neutral);
    - conflicting reviews and a Forgejo provider;
  - `task-list-tick`:
    - exact tick, an untouched foreign line, preserved continuation lines, and a CRLF body;
    - a plain item, an already ticked `[x]` or `[X]` item, zero match, and ambiguous match;
    - an unchecked item outside the criteria section, an unchecked task nested under a criterion,
      `[ ]` inside fenced code (not counted), and several criteria sections;
    - a multi-line criterion's `key8` and an HTML-comment checklist;
    - `inputHash`;
  - the additive `key8` in `issue-acceptance-criteria`;
  - the stale-hash `issue-update-body` path, reusing the existing fixture pattern (`:3735-3841`).
- Decided by score: the issue's fixture criterion is met by helper fixtures for the offer and both
  fallbacks and by prose-contract assertions for the decline and the gate paths, per repository
  convention. No eval scenario is added.
- `test/remote-tracker-operations-reference.test.mjs` with the reference rows.
- `test/workflow-contracts.test.mjs` with the new and adjusted prose-contract assertions.
- `pnpm agent:check`, `node build.mjs` (with the context-budget report) and
  `pnpm test:distribution`, in that order.
- `pnpm eval merge-gate verify` reports the evidence debt this change creates.

## Assumptions and open points

- Assumption: the review's own acceptance coverage does not replace the observation's PR-locator
  coverage dimension. Only the own-task-list dimension may be overridden by the review, as the issue
  states ("incomplete only because task-list entries are unchecked").
- Assumption: reviews published before the pinned line format existed carry no parseable lines and
  so yield no offer. Old reviews are not migrated.
- Assumption: editing `merge-gate-issue-observation.md`, `issue-post-merge-observation.md` and
  `review-acceptance-lens.md` creates freshness debt for the `merge-gate` eval suite and any suite
  that loads them. CI reports it without failing.
- Out of scope:
  - making merge-gate run an acceptance review itself;
  - a Forgejo review head binding;
  - ticking entries outside the criteria sections;
  - any configuration switch.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-CLR",
    "question": "How should merge-gate obtain the merged-head review per-criterion acceptance result?",
    "options": [
      "Pinned summary lines + read-only helper",
      "Hidden machine block + read-only helper",
      "Agent reads review prose"
    ],
    "scores": [
      {
        "label": "Pinned summary lines + read-only helper",
        "score": 8,
        "reason": "Reuses the per-key8 acceptance summary the review body already holds, so there is one source and the body stays prose. A deterministic, fixture-testable parser with marker, author and head-SHA filters. Cost: a visible line format becomes a parse contract."
      },
      {
        "label": "Hidden machine block + read-only helper",
        "score": 6,
        "reason": "The most robust parse target, but it keeps a second copy of the summary that can drift from the visible verdicts. It also adds a machine payload to a body that pr-review-integration.md keeps as human-facing prose with no hidden keys."
      },
      {
        "label": "Agent reads review prose",
        "score": 2,
        "reason": "A judgment call on unpinned prose before a write-and-close action is not deterministic and cannot be pinned by fixtures. It skips enforced author-permission and head-SHA filters and invites misreading a review that is incomplete or undetermined."
      }
    ]
  },
  {
    "site": "S-CLR",
    "question": "In the tick-and-close offer, how is each criterion and its review evidence shown?",
    "options": [
      "Sanitized displayText in chat listing only",
      "Locators only, no criterion text",
      "Raw criterion text in listing and question"
    ],
    "scores": [
      {
        "label": "Sanitized displayText in chat listing only",
        "score": 8,
        "reason": "Does what the maintainer decided (quote each criterion with its evidence) by reusing the trust-gated, bounded displayText the acceptance lens already shows. The question stays fixed and the change is one named, scoped exception. It still weakens a deliberate no-quoting rule."
      },
      {
        "label": "Locators only, no criterion text",
        "score": 5,
        "reason": "Safest choice: the pinned no-quoting rule and its tests stay as they are, and the review URL and commitSha are real evidence. But it does not do what the decision explicitly asks, and the operator must check every criterion at the issue URL."
      },
      {
        "label": "Raw criterion text in listing and question",
        "score": 1,
        "reason": "Puts raw, attacker-influenceable issue text into the confirmation question, the exact injection path the fixed ask-fence text exists to block. It also skips the trust gate and sanitization that issue-acceptance-criteria already provides."
      }
    ]
  },
  {
    "site": "S-CLR",
    "question": "Which question surface carries the tick-and-close offer?",
    "options": [
      "Separate gated question with own id",
      "Extend the Issue done question",
      "Per-issue tick question"
    ],
    "scores": [
      {
        "label": "Separate gated question with own id",
        "score": 9,
        "reason": "Gives the extra body write its own consequence row, state digest and a question that quotes criteria, which Issue done never does. Its edge over per-issue: it keeps the once-per-run batch pattern and its relay/digest machinery; the only cost is a new id."
      },
      {
        "label": "Extend the Issue done question",
        "score": 3,
        "reason": "One question would hold two groups and three options that each fit only some issues; closing complete issues while declining ticks needs a fourth option. It breaks the quotes-no-criterion contract and merges two consequences into one relayed id."
      },
      {
        "label": "Per-issue tick question",
        "score": 4,
        "reason": "Allows per-issue consent but departs from the run-level batch pattern every gated issue mutation uses; N issues mean N relayed instances needing their own ids or digests, with no safety gain over one listed question that re-reads the basis before each write."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How is the review's verdict bound to the head it actually reviewed?",
    "options": [
      "Pinned reviewed-head summary line",
      "Send commit_id in review-create",
      "Document the residual risk"
    ],
    "scores": [
      {
        "label": "Pinned reviewed-head summary line",
        "score": 8,
        "reason": "Closes the race inside the feature's own parse contract: lens headSha goes into the body, and the helper checks it against commitSha and the merged head, failing closed. It is forge-neutral and fixture-testable. The cost is one more pinned line format."
      },
      {
        "label": "Send commit_id in review-create",
        "score": 6,
        "reason": "Fixes the root cause, since the provider binds the review to the reviewed commit. But it changes every review-create payload, needs headSha passed into publication (absent when the lens fails), and needs separate proof for Forgejo/tea and line anchoring."
      },
      {
        "label": "Document the residual risk",
        "score": 2,
        "reason": "Leaves a known path where merge-gate ticks criteria and closes an issue based on verdicts about unreviewed code. That is not acceptable for a write-and-close action when a cheap deterministic guard exists."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How is the issue's fixture-test criterion (offer, decline, both fallbacks) met?",
    "options": [
      "Helper fixtures plus contract assertions",
      "Add merge-gate eval scenarios too",
      "Record eval scenarios in this change"
    ],
    "scores": [
      {
        "label": "Helper fixtures plus contract assertions",
        "score": 8,
        "reason": "Meets 'fixture tests' as written. Helper fixtures cover the offer and fallback filters and contract assertions cover the decline and gate paths, per repo convention. Not 9: the policy may want live evidence for a new action gate."
      },
      {
        "label": "Add merge-gate eval scenarios too",
        "score": 5,
        "reason": "Registering scenarios without recording them only adds absent-evidence debt and does not test the criterion. Running an eval is not a fixture test, and the issue does not ask for one, so the scenarios have value only once someone later spends model runs on them."
      },
      {
        "label": "Record eval scenarios in this change",
        "score": 4,
        "reason": "The policy's standard round is five independent runs per case, so four cases need about twenty hand-recorded fresh sessions. The fixture criterion does not need that, and routine PRs need no new model runs. It is only justified if the new write gate needs live refusal and control evidence."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Where may the criterion displayText appear?",
    "options": [
      "Gated listing and relayed evidence",
      "Gated listing only",
      "Also the Phase 6 report"
    ],
    "scores": [
      {
        "label": "Gated listing and relayed evidence",
        "score": 8,
        "reason": "In a relayed run the user sees the listing only through the BLOCKED-USER evidence, so only this option meets the maintainer's 'quote each criterion' decision in both modes. Neutralized, capped displayText and key8-bound writes limit the risk; the cost is criterion text in the caller's context."
      },
      {
        "label": "Gated listing only",
        "score": 5,
        "reason": "It keeps the dispatching caller's context free of issue-derived text, but relayed users then consent from locators alone. That splits the experience by mode and misses the decided 'quote each criterion' outcome for every relayed run."
      },
      {
        "label": "Also the Phase 6 report",
        "score": 3,
        "reason": "After the write the text gives no consent value, yet it would enter the DONE outcome record that callers and next-steps consume. It also blurs the open-points exception, which rests on being report-only, and widens the no-quoting rule the most."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "How does a re-dispatch treat a consumed issue-tick-done answer?",
    "options": [
      "Never re-pose once consumed",
      "Digest skip, outcomes always carried",
      "Exclude processed issues from digest",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Never re-pose once consumed",
        "score": 9,
        "reason": "Matches how other once-per-run wisdom records work: closed or STALE_WRITE issues can't change the digest, issue-done answers are kept and outcomes reach Phase 6. Late-eligible issues stay open, the safe default. Beats exclusion: no residual-set digest rule."
      },
      {
        "label": "Digest skip, outcomes always carried",
        "score": 3,
        "reason": "Carrying outcomes fixes the lost-report half, but a partial STALE_WRITE still re-asks issue-tick-done, which discards the issue-done answer and adds a relay round. It documents the defect the record exists to prevent instead of removing it."
      },
      {
        "label": "Exclude processed issues from digest",
        "score": 6,
        "reason": "Asks again only for issues newly eligible and unprocessed, so consent stays scoped. But the residual digest can never match the recorded one. That needs a second rule for an empty residual and outcome carry-over, and any re-ask still discards the issue-done answer."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "How does a qualifying review that omits a current criterion count?",
    "options": [
      "Omission is neutral",
      "Any omission disqualifies",
      "Newest qualifying review only",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Omission is neutral",
        "score": 9,
        "reason": "Matches the plan's Architecture rule and the issue's wording (blocks when a review 'names' a criterion incomplete). Explicit negatives still veto. Its edge over 'Any omission disqualifies': a lens failure or a review of older criterion text, which judged nothing, can no longer block the offer."
      },
      {
        "label": "Any omission disqualifies",
        "score": 4,
        "reason": "Strictly fail-closed, but a review that assessed nothing (lens failed, or older key8s) would veto a complete verdict, forcing a re-review. That adds no safety on top of the confirmation gate, and the Architecture text and the issue's 'names any criterion' wording would need rewriting."
      },
      {
        "label": "Newest qualifying review only",
        "score": 3,
        "reason": "It drops the rule that any qualifying review naming a criterion incomplete or undetermined blocks the offer, so an older explicit negative on the same head is ignored. A failed newest review still blocks, and 'newest' needs its own ordering rule."
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
| Architecture | 0 | 1 | 0 |
| Security | 0 | 0 | 2 |
| Data protection | 0 | 0 | 1 |
| Error cases | 0 | 1 | 1 |
| Testability | 0 | 1 | 0 |
| Scope | 0 | 0 | 0 |
| Maintainability | 0 | 1 | 2 |

### Findings

Internal review on 2026-11-27. Every finding has been incorporated into the plan.

- **Architecture, Important.** In a relayed run, declining `Tick and close` and then answering
  `issue-done` would ask `issue-tick-done` again and lose the `Issue done` answer. Fix: the consumed
  answer becomes a once-per-run wisdom record that a re-dispatch with a matching digest reuses.
  `merge-gate-delegated-run.md` was added to Affected files, plus an acceptance criterion.
- **Maintainability, Important.** The general contract `issue-post-merge-observation.md` loads
  beside the owning fragment, and it still stated the `complete`-only offer rule, the single
  quoting exception, the one-read bound and "nothing enters late". Fix: one pointer sentence there
  scopes all four to the hosted tick offer, with no second copy of the detail.
- **Error cases, Important.** The plan was ambiguous about whether the verdict is re-derived between
  the tick write and the close, and revalidation did not pin the fresh criterion set. Fix: a
  post-write re-read with verdict re-derivation, the fresh `key8` set required to be a subset of the
  listed set, `remainingUnchecked: 0` on the fresh body, a stated per-issue read budget, and the
  report item renamed.
- **Testability, Important.** The security-relevant parser and tick rules had no fixtures. Fix: the
  Validation plan now lists the marker position, quoted and fenced lines, unrequested issues,
  in-review contradictions, `submittedAt` and the merged state; continuation lines, `[X]`, fenced
  `[ ]`, nested tasks, several sections, CRLF and `inputHash`.
- **Data protection, Note.** The write hash was not bound to the ticked string. Fix:
  `task-list-tick` returns `inputHash`, which is used as `expectedBodyHash`.
- **Error cases, Note.** The `review <PR>` hint was wrong on `tea`-backed forges. Fix: it is
  GitHub-only, and other forges report the offer as unavailable.
- **Security, Note.** The evidence reference quoted a review-body line. Fix: the reference is
  rendered from the helper's parsed record.
- **Security, Note.** The scope of the `displayText` exception was not pinned. Fix: decided by
  score (gated listing and relayed evidence only), plus an acceptance criterion.
- **Maintainability, Note.** Some count sites and the fragment intro were missing. Fix: added
  `setup-allowlist.md`, `tools-setup.md`, `build-system.md:1532`, `architecture.md:1144` and the
  fragment intro.
- **Maintainability, Note.** The digest subject-key format was ambiguous. Fix: pinned as
  `#<n>=<key8>+<key8>…`.

### Deep review (2026-11-27)

The deep review judged the plan anew. It produced three Important findings and four Notes, with
none Critical. Every finding was incorporated.

- **Architecture / Error cases, Important.** The digest-matched skip of a consumed
  `issue-tick-done` answer broke after a confirmed tick, because closed issues change the digest.
  Fix: decided by score, a consumed answer is never posed again in the gate run, and its outcomes
  always reach Phase 6.
- **Error cases, Important.** The tick loop dropped an issue that had become terminal, which would
  leave a stale outcome driving steps 5 to 7. Fix: step 4's three revalidation outcomes now apply at
  both re-reads, the post-transition re-read replaces the outcome, and a report item and an
  assertion were added.
- **Testability, Important.** The plan contradicted itself on a review that omits a criterion. Fix:
  decided by score, omission is neutral. The edge cases and fixtures were aligned.
- **Testability, Note.** The handling of deviant lines was unpinned. Fix: one grammar. A `complete`
  line with a suffix and a malformed line for a requested key read `undetermined`.
- **Maintainability, Note.** `task-list-tick` could drift from the lens's `key8`s. Fix: it builds on
  `sectionListItems` with raw line indices, and `remainingUnchecked` is defined over
  `MARKDOWN_CHECKBOX`.
- **Error cases, Note.** A tick followed by a failed transition was missing. Fix: a report item and
  step 4's failure rule.
- **Maintainability, Note.** State management wrongly said there was no runtime state. Fix: the
  wisdom-file record is named.

## Open points

- No open points.
