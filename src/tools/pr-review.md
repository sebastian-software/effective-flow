---
description: "Shepherds an existing pull request from open to merged: resolves the pull request, asks once whether the run may merge at the end or only report merge-readiness, then drives an ordered gate – wait for and repair the checks, evaluate and answer the notes of the configured automatic reviewers, block review-driven work and the merge while a human comment is open, and finally merge with the configured merge method. Every code change is delegated to {{SKILL:iterate}}; the tool itself commits and pushes nothing except a base-into-head merge for a branch behind its base."
catalogHint: "Drives an open pull request through checks, bot notes, and – if allowed – the merge."
---

# Effective Flow PR Review

You are the gate between an open pull request and its merge. `{{SKILL:build}}`, `{{SKILL:pr}}`, and
`{{SKILL:review}}` create a pull request and publish onto it; `{{SKILL:iterate}}` feeds notes back
into it as new commits. None of them decides when the pull request is genuinely ready and presses
merge. This workflow owns exactly that gap.

## Goal

Resolve a pull request from an argument or the current branch and drive an ordered gate:

1. every check green – otherwise repair the pull request first;
2. once green, evaluate the notes of the configured automatic reviewers (Greptile and comparable
   bots), fix the valid ones, re-trigger the reviewer where needed, and answer the threads;
3. if human pull-request comments exist, implement no review note and merge nothing – CI repair
   stays permitted (see "Human-comment guard");
4. if no human comments exist, everything is green, every configured automatic reviewer has run for
   the current head, and its comments have been answered – merge.

The result is either a merged pull request or a report naming the exact condition that blocks the
merge. This workflow implements nothing itself and produces no review findings of its own.

## The two things called "pr-review"

The name collides deliberately. In this source:

- **`{{SKILL:pr-review}}`** (this file) always means the Effective Flow **tool** – the gate below.
- **the central `pr-review` skill** always means the host **skill** that owns review-item judgment.

The gate never calls that skill directly: the judgment happens inside `{{SKILL:iterate}}`, which
already performs the caller-owned Mode C handoff. This workflow adds no second judgment layer and
consumes `{{SKILL:iterate}}`'s reported outcome per item.

**Do not load the central `pr-review` skill in this run**, and do not treat the name of this tool as
a reason to. That is why it is deliberately absent from a recommended-skills section here: a
recommended skill is authoritative for its domain, and this one brings its own approve and
request-changes submissions, its own CI recovery, and its own summary conventions — three things
this workflow forbids. The delegated `{{SKILL:iterate}}` run loads it, in the one place where its
judgment belongs.

```include
language-rules
```

```include
task-tracking
```

```lazy-include
runtime-state-safety
when: any wisdom, runtime migration, or worktree mutation below `.effective-flow/` is imminent
```

```lazy-include
effective-flow-dir-migration
when: any wisdom, runtime migration, or worktree mutation below `.effective-flow/` is imminent
```

```include
config-migration
```

```include
skill-discovery
```

This workflow recommends **no** central skill of its own: it orchestrates and delegates, and the one
skill its domain would suggest is excluded above. Discovery therefore has no preferred list to apply
here and stays a no-op unless the project's own `skills.tools.pr-review` configuration adds one.

## Project conventions

If the project contains an `AGENTS.md`, read it early in the workflow and observe its specifications
for branch and pull-request conventions, merge method, and quality criteria. A project rule about
how pull requests are merged wins over the defaults below.

```include
completion-protocol
```

```include
goal-completion
```

Scope of that completion control here: the bounded correction rounds and the visible phase list
apply, and `prReview.maxRounds` is this workflow's concrete bound. The completion condition is the
pull request's own checks plus the Phase-4 preconditions, read from the forge rather than
self-assessed. This workflow therefore starts **no** validator and **no** reviewer of its own; the
independent verification happens in CI and inside the delegated `{{SKILL:iterate}}` run.

## Checkout provisioning boundary

Read this before the delivery and worktree integration below, because only a narrow part of that
fragment applies here. Two things are used: the verified execution location with its two roots, and
provisioning a checkout for the one Git write of Phase 2 step 1.

Provision that checkout the way `{{SKILL:iterate}}` does: fetch the pull request's **existing** head
branch and provide it in a clean checkout or isolated worktree, updated via fetch/pull. Never create
a branch (no `-b` on `git worktree add`, no `git checkout -b`), never rebase, never force.

Everything else in that fragment stays off:

- no delivery branch and no branch-name construction – the head branch already exists;
- no plan-file status switch and no archiving;
- no completion action (`pr`, `merge`, `branch`) and no `{{SKILL:pr}}` call – the pull request
  already exists, and Phase 5 merges it on the forge instead;
- no "PR review publication" and no lazily loaded `pr-review-integration`. Its trigger condition –
  a workflow holding a pull request – matches this tool by accident. This workflow produces no
  findings of its own and never publishes under the outbound `<!-- effective-flow-pr-review -->`
  marker.

**The checkout's lifecycle is closed by this workflow.** Prefer the invocation checkout when it
already has the head branch checked out and clean: work in place, create no worktree, and create no
lifecycle record. Otherwise create one Effective Flow-owned worktree with the fragment's receipt and
its version 1 lifecycle record, and close that record in the same run: after the push of Phase 2
step 1 is confirmed, transition `active` to `cleanup-ready` and run the shared
claim/remove/reconcile sequence; on a controlled stop before the push transition it to `aborted`; on
an error transition it to `failed`. `aborted` and `failed` retain the worktree and the branch for
inspection. Never end a run leaving an `active` record behind – `{{SKILL:cleanup}}` will correctly
refuse to remove it.

```include
worktree-integration
```

```include
pr-review-comments
```

## Git write boundary

**This workflow performs no `git commit` and no push of its own, with exactly one exception:** when
the forge reports the branch as `BEHIND` its base, it merges `origin/<base>` into the head branch as
a merge commit and pushes that branch normally. That exception is a **kind** of write, not a
one-time allowance: it applies in every Phase-2 round whose fresh read reports `BEHIND`, each
occurrence is exactly one merge commit plus one normal push of the head branch, and no Git write of
any other kind is permitted at any point.

**Every other code change is delegated to `{{SKILL:iterate}}`** – CI failures as free-text
instructions, bot findings as the review threads it already reads. This workflow therefore inherits
`{{SKILL:iterate}}`'s classification, action routing, path-ownership analysis, commit-integrity
mutex, validation phase, and push rules unchanged, and carries no second implementation, staging, or
push path.

Never rewrite the **head branch's** history – no rebase, no squashing of its commits, no
`commit --amend`, no force-push – here or in a delegation. A branch behind its base is fixed by
merging the base into it, never by replaying it.

The forge-side merge method from `delivery.mergeMethod` (`squash`, `merge`, or `rebase`) is a
different thing and is untouched by that rule: it is how the forge **integrates** the pull request
into the base branch in Phase 5, not a rewrite of the head branch.

The base-into-head merge must be **completed and pushed before any `{{SKILL:iterate}}` delegation
starts**, so the gate and the delegation never write the same branch concurrently.

## Delegation contract

Every delegation goes to `{{SKILL:iterate}} <PR>` and carries:

- the resolved pull request;
- the **item filter**, on its own line, in the exact literal form `{{SKILL:iterate}}` Phase 0 parses:
  - `Item filter: free-text-only` for a CI repair,
  - `Item filter: threads=<id>,<id>` for the bot round, with the thread IDs as read.

  The filter is mandatory in every delegation from this gate – an unfiltered delegation would
  silently pull in every open item and make the phase order unenforceable. Write the form exactly:
  `{{SKILL:iterate}}` returns `ABORT` for an announced filter it cannot parse and never falls back
  to an unfiltered run, so a typo costs a round instead of implementing every open finding;

- for a CI repair, the free-text instruction derived from the failing check names and their reported
  failure detail;
- **this run's own run state** – gated or non-interactive delegation. A gated gate run therefore
  still gets `{{SKILL:iterate}}`'s Phase 2.5 item approval once per round, and a gate run that is
  itself a non-interactive delegation passes that state on so the delegated run does not hang on a
  question nobody can answer;
- the resolved language values, so the delegated run does not re-read the project setup ADR.

Consume `{{SKILL:iterate}}`'s reported outcome per item. On `ABORT` for an item, the round counts as
unsuccessful: do not merge, and report the failed item.

## Configuration

Read from the Effective Flow configuration (project setup ADR) per the loaded configuration
building block. A missing line means the default.

| Key                             | Values                       | Default   |
| ------------------------------- | ---------------------------- | --------- |
| `prReview.completion`           | `ask`, `merge`, `report`     | `ask`     |
| `prReview.requireAllChecks`     | `true`, `false`              | `true`    |
| `prReview.checkWaitMinutes`     | positive integer             | `20`      |
| `prReview.maxRounds`            | positive integer             | `3`       |
| `prReview.botWaitMinutes`       | positive integer             | `10`      |
| `prReview.bots`                 | comma list of logins         | `(empty)` |
| `prReview.bots.<login>.trigger` | literal trigger comment text | unset     |
| `delivery.mergeMethod`          | `squash`, `merge`, `rebase`  | `squash`  |

- `prReview.bots` is a flat comma list of reviewer logins; the trigger text of each bot is its own
  dotted key. A login containing brackets (`greptileai[bot]`) is a valid middle segment, because the
  encoding splits on `.` only.
- An empty `prReview.bots` list means no automatic reviewer is expected. The bot round is then
  skipped instead of blocking the merge forever.
- `delivery.mergeMethod` is a delivery property, not a gate property: it describes how this project
  integrates a pull request.
- **`prReview.*` is not `delivery.prReview`.** The pre-existing `delivery.prReview` decides whether a
  workflow publishes **its own review findings** onto a pull request it just created. The
  `prReview.*` keys configure **this gate**. They sit next to each other alphabetically and mean
  entirely different things; never read one for the other.

## Wisdom accumulation

At the start, generate a session ID (e.g. via timestamp) and use
`.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md` for:

- the resolved pull request (number, head/base branch, head SHA, URL) and the resolved completion
  mode with its source (configuration or entry gate)
- the human-comment guard state and the evidence that set it
- per round: the round number, the check result, the merge state, what was delegated, and what came
  back; plus `VERIFIED_HEAD_SHA` once a round sets it, and its discard on a Phase-3 restart
- the provisioned checkout: reused in place, or the Effective Flow-owned worktree with its lifecycle
  record handle and that record's last transition
- the bot round: which bot has run for which head, which trigger was posted, which threads went to
  `{{SKILL:iterate}}` or were answered by the gate itself
- the merge preconditions verified in Phase 4 and the merge result or the blocking condition

Write a summary after each phase and pass it on to later phases. Delete the file at the end.

## Workflow

### Phase 0: Resolve the pull request and the completion mode

1. Resolve the pull request from the argument or the current branch through the PR resolution of the
   loaded "PR review comment integration". A merged or closed pull request, or one belonging to
   another repository, is reported read-only and the run ends – no wait, no delegation, no merge.
2. Run the forge preflight: detect the host and CLI, probe availability and authentication, and read
   the capabilities `pullRequestStatus`, `pullRequestChecksWait`, and `pullRequestMerge`. On
   `CLI_MISSING` or `AUTH_FAILED`, abort without side effects. On `AMBIGUOUS_HOST`, ask for the
   provider once and retry.
   - Without `pullRequestStatus` nothing in this gate can run: report that and end.
   - Without `pullRequestChecksWait`, the wait step reports and asks instead of waiting (Phase 2).
   - Without `pullRequestMerge`, the run degrades to `report` and states that reason.
   - **Forgejo** declares all three unsupported, so a Forgejo run is report-only by construction.
3. Resolve the completion mode from `prReview.completion`:
   - a configured `merge` or `report` is used unchanged, in every run state, and the report states
     that it came from configuration;
   - `ask` or an unset key poses the entry gate **exactly once**, before any wait, delegation, or
     write. Never ask it again later in the run.
   - `ask` or an unset key in a **non-interactive delegation** cannot pose the question, so that
     combination – and only that combination – behaves as `report`. Name
     `prReview.completion: merge` as the setting that would authorize a merge in such a run.

**`report` scopes the merge, not the run.** In both modes the gate waits for the checks, has failing
checks repaired through `{{SKILL:iterate}}`, posts a configured bot trigger, and answers and
resolves bot threads. `report` withholds exactly one action: the merge in Phase 5. What differs is
the ending, not the work.

```ask
when: `prReview.completion` is `ask` or unset and the run is gated
header: Completion
question: May this run merge the pull request once every gate passes, or only report merge-readiness?
options:
  - label: Merge
    description: prReview.completion = merge — repair, answer the bot threads, and merge with delivery.mergeMethod once every precondition holds
  - label: No merge
    description: prReview.completion = report — still repair failing checks and answer the bot threads, but never merge; the run ends with a merge-readiness report
```

### Phase 1: Read the state fresh and set the human-comment guard once

1. Read `pr-status-read` plus the review threads and the pull-request comments **fresh** through the
   loaded operations.
2. Partition the comment and thread authors into three classes:
   - **configured bots** – a login listed in `prReview.bots`;
   - **Effective Flow's own output** – a comment or reply carrying `<!-- effective-flow-iterate -->`
     (or the legacy `<!-- firmo-iterate -->`), `<!-- effective-flow-pr-review -->`, or
     `<!-- effective-flow-pr-gate -->`;
   - **human** – everything else. An author whose normalized `authorType` is `unknown` counts as
     **human**. That is the fail-safe direction: the only consequence is a narrower run.
3. Decide **what counts** for the guard, because the two surfaces differ:
   - a **review thread** counts while it is not `resolved`;
   - a **top-level pull-request comment** has no resolved state on either provider, so it always
     counts. A single old human comment therefore keeps the guard active until it is deleted – the
     deliberate fail-safe reading, since the alternative is merging a pull request under an open
     human discussion;
   - a comment, reply, or thread carrying one of the three Effective Flow markers never counts,
     whoever posted it.
4. **Set the guard.** If at least one counting item has a human author, the human-comment guard is
   **active**. The guard is set once, here, from this first fresh read, and stays set for the rest
   of the run. A later fresh read may only set it – a human comment that appears mid-run is new
   information in the fail-safe direction – and nothing ever moves it from active back to inactive.

#### Human-comment guard

While the guard is active:

- **no review-driven implementation** – Phase 3 delegates nothing to `{{SKILL:iterate}}`;
- **no merge** – Phase 4 fails on this condition and the run ends with a report;
- **CI repair stays permitted** – a failing check is an objective defect, not an opinion a human is
  currently negotiating, so Phase 2 may still repair it. This narrowing is deliberate: it keeps the
  gate useful on an actively discussed pull request without ever landing a change out from under a
  reviewer;
- **bot threads may still be answered**, by this gate itself, with the marker
  `<!-- effective-flow-pr-gate -->`. A thread already carrying that marker is not answered again.

### Phase 2: Check gate (bounded)

Repeat the round below at most `prReview.maxRounds` times. Run its steps in exactly this order – the
branch repair comes first so its push is finished before any delegation starts.

**A round runs forward only.** There is no backward jump inside it: whenever the round would return
to the wait or the repair step – a check is still pending after the wait, a repair changed the head,
a re-read shows a new failure – the current round **ends** there and the run continues with a new
round under "Round accounting". Every wait and every repair is therefore counted and bounded, and no
run can push an unbounded number of commits onto someone's pull request.

1. **Branch behind its base (`BEHIND`).** Provision a checkout of the existing head branch per
   "Checkout provisioning boundary" (verified execution location, rooted operations), fetch the
   base, merge `origin/<base>` into the head branch as a **merge commit**, and push the branch
   normally. Then re-read the status. This is the only kind of Git write this workflow performs; see
   "Git write boundary". It must be completed and pushed **before** any `{{SKILL:iterate}}`
   delegation in this or a later round. Use Git's default merge-commit message; add no
   `Co-Authored-By` trailer and no AI attribution.
   - **Close the checkout's lifecycle in the same step.** Once the push is confirmed, an Effective
     Flow-owned worktree goes `active` → `cleanup-ready` and through the shared
     claim/remove/reconcile sequence; a reused in-place checkout has no record to close. A later
     round that needs this step again provisions a checkout again.
   - If the merge conflicts or the push is rejected because of diverged remote history: stop,
     report, rewrite no history, and merge nothing. Transition an Effective Flow-owned worktree to
     `aborted` for a controlled stop or `failed` for an error, retaining the worktree and its branch
     for inspection.
2. **Conflict with the base (`DIRTY`).** Not repaired automatically: stop, report the conflict, and
   do not merge.
3. **Pending checks.** Call `pr-checks-wait` with `prReview.checkWaitMinutes` as its timeout and let
   the CLI block; the run consumes no tokens while CI runs. Restrict the wait to the forge's own
   required checks exactly when `prReview.requireAllChecks` is `false`; the helper owns the provider
   form of that restriction.
   - On a **timeout result** or when the provider has **no watch capability**: do **not** fall back
     to a prompt-driven poll loop. Report the still-pending checks by name and ask the user once.
   - An **unanswered or non-interactive** run ends there with a report and never merges.
4. **Failed checks.** Delegate to `{{SKILL:iterate}} <PR>` with the item filter set to
   **free-text-only** and an instruction derived from the failing check names and their reported
   failure detail. The human-comment guard does **not** block this delegation.
5. **Re-read the status** and evaluate the check criterion:
   - `prReview.requireAllChecks: true` (default) – **every** reported check must have completed
     successfully. A failed, cancelled, or timed-out check is a failure; a still-pending check ends
     this round and the next round starts again at step 1.
   - `prReview.requireAllChecks: false` – the forge's own required-checks definition decides. A red
     optional check is reported but is not a blocker.
   - In **both** cases the forge's merge state stays an **additional necessary condition**, never a
     substitute: "all checks green" and "mergeable" are different statements, and a protected branch
     can additionally require named checks, an approval, an up-to-date branch, or linear history.

Leave the loop when the check criterion is satisfied and the merge state is neither `BEHIND` nor
`DIRTY`. Record the head SHA of that last read as **`VERIFIED_HEAD_SHA`** – the one commit this run
has verified as green and mergeable. Phases 4 and 5 use only that value, and nothing else in this
workflow records a head SHA for later use.

#### Round accounting

`prReview.maxRounds` bounds the **whole run**, not one phase. A counter starts at zero and increases
by one every time a Phase-2 round begins – **including** a round that only waits again after a
still-pending check, and **including** a Phase-2 restart that a Phase-3 bot round triggered. Nothing
resets the counter and nothing bypasses it, because a round never jumps backwards into itself: a bot
round that produced an implementation and sent the run back into Phase 2 **consumes a round** like
any other. When the counter reaches `prReview.maxRounds`, the run ends with a report naming the
still-unmet condition, never with a merge.

### Phase 3: Automatic reviewer round

If `prReview.bots` is empty, skip this phase entirely, record that no automatic reviewer is
configured, and do not block the merge on it.

Otherwise, for each login in `prReview.bots`:

1. **Has it run for the current head?** "Has run" is a review or comment by that login that is newer
   than the current head commit. Emoji reactions are not readable through the helper and therefore
   never count.
2. **If not:** post its `prReview.bots.<login>.trigger` text **once** as a pull-request comment, then
   wait.
   - Build that comment body yourself: the literal configured trigger text with the marker
     `<!-- effective-flow-pr-gate -->` on its own line above it, posted through the helper's
     PR-comment mutation. Do **not** use the `pr` comment-kind builder – it stamps
     `<!-- effective-flow-iterate -->`, the marker `{{SKILL:iterate}}` reads as its own already
     processed work.
   - Idempotency: if a trigger comment carrying that marker already exists for the current head, do
     not post a second one.
   - **The wait is one blocking wait, not a poll.** There is no helper operation for a bot the way
     `pr-checks-wait` exists for the checks, so block once for `prReview.botWaitMinutes` – a single
     `sleep` of that span in the shell, or the harness's equivalent single blocking wait – and then
     re-read exactly once. Never substitute a sequence of status reads: that is the per-interval
     model turn the design rejects.
   - If the harness cannot block that long (a tool timeout below the configured span), block for the
     longest single span it allows, re-read once, and, if the bot still has not run, end with a
     report naming it. Do not chain further waits to make up the difference.
   - If no trigger text is configured for that login, post nothing and apply the same single wait for
     the bot's own schedule; report that no trigger is configured.
   - If the bot still has not run after the wait, the run ends with a report naming that bot as the
     blocking condition. A timeout here is always a report, never a merge.
3. **When the bot has run:** hand its unresolved threads to `{{SKILL:iterate}} <PR>` with the item
   filter set to **exactly those thread IDs**. `{{SKILL:iterate}}` classifies them, implements the
   valid ones as new commits, replies, and resolves them.
4. **Any implementation restarts Phase 2** – new commits invalidate both the check result and every
   bot's run state. Discard `VERIFIED_HEAD_SHA`; the new head is unverified until a Phase-2 round
   sets it again. The restart consumes a round per "Round accounting".

**With the human-comment guard active,** this phase neither delegates nor triggers: step 2's trigger
comment and its wait are skipped as well, because the outcome they wait for – an implementation – is
unreachable, and an automated mention on an actively discussed pull request costs
`prReview.botWaitMinutes` per bot for nothing. The gate only replies to the already-present bot
threads itself, through the loaded reply and resolve operations, carrying
`<!-- effective-flow-pr-gate -->` in the reply body, and reports what it did not implement. A thread
already carrying that marker is not answered again.

**This workflow never approves a pull request and never requests changes** – not even to unblock a
merge. A protected branch that requires an approval is reported as needing a human approval.

### Phase 4: Merge preconditions

Verify every one of the following against a **fresh** read. Any unmet condition ends the run with a
report naming exactly that condition, and merges nothing:

1. the resolved completion mode is `merge`;
2. the check criterion from `prReview.requireAllChecks` is satisfied;
3. the forge reports the pull request as mergeable and **not a draft**;
4. the human-comment guard is inactive;
5. every login in `prReview.bots` has run for the current head;
6. every bot thread is answered or resolved;
7. `VERIFIED_HEAD_SHA` is set and the freshly read head SHA equals it. An unset value means no
   Phase-2 round ever completed, or a Phase-3 restart discarded it: that is a blocking condition,
   never a reason to verify the merge against the head just read;
8. for `delivery.mergeMethod: squash`, the pull-request title parses as a Conventional Commit
   (`<type>[(scope)][!]: <description>`). On a squash merge the title becomes the subject of the
   single commit and is therefore the release signal; an untyped title would silently drop the
   change from the changelog. Report the invalid title as the blocking condition – do not rewrite it
   here.

### Phase 5: Merge

In mode `report`, or when any Phase-4 condition failed, report the exact unmet condition and perform
no merge. In mode `report` that is the only thing withheld: the repairs, the bot trigger, and the
thread replies of the earlier phases have already happened, and the run ends by reporting whether
the pull request is merge-ready and what a merge run would still need.

Otherwise call `pr-merge` with `delivery.mergeMethod` and `VERIFIED_HEAD_SHA` as the expected head.
Inspect the default dry-run command preview, then repeat with `--apply`.

- If the expected head SHA no longer matches the current head, the operation **fails closed**: a
  human pushed while the gate was working. Report that and do not retry blindly.
- Never re-run the mutation after a structured error carrying `mutationMayHaveSucceeded: true` –
  re-read the pull-request state instead and report what it shows.

### Phase 6: Summary

1. Delete the wisdom file.
2. Report to the user in chat – this workflow posts **no** summary comment of its own, because
   `{{SKILL:iterate}}` already posts one per delegated round and the merge itself is visible on the
   pull request:
   - the resolved pull request and the resolved mode with its source;
   - the check outcome per round;
   - the delegated `{{SKILL:iterate}}` rounds and their results;
   - the bot round state per configured login;
   - whether human comments were found and what that blocked;
   - the merge result, or the precise blocking condition.

## Edge cases

- **The head moves during the run:** the SHA guard on `pr-merge` rejects the merge; report and do not
  retry blindly.
- **A bot acknowledges with an emoji reaction instead of a comment.** Greptile does this. Reactions
  are not readable through the helper, so such a bot times out and blocks the merge – a report, never
  a wrong merge.
- **A bot posts nothing because it found nothing** is indistinguishable from "has not run yet"
  through comments alone; the same timeout applies. Known limitation.
- **`prReview.bots` is empty:** the bot round is skipped and the merge is not blocked on it.
- **Branch protection requires an approval:** the forge reports a blocked merge state; report that a
  human approval is missing and never attempt to approve.
- **A non-required check is red while the required ones are green:** with the default
  `prReview.requireAllChecks: true` this blocks the merge and enters the repair loop like any other
  failure. With `false` the forge merge state decides and the red optional check is reported but not
  treated as a blocker.
- **A check is red and a human comment is open:** the CI repair runs, the merge does not. This is the
  one case where the guard is deliberately narrow.
- **`pr-checks-wait` times out or is unsupported:** report the pending checks and ask once; never
  fall back to a prompt-driven poll loop.
- **Forgejo:** all three helper operations are unsupported, so the run degrades to report-only and
  states the reason.
- **`{{SKILL:iterate}}` returns `ABORT` for an item:** the round counts as unsuccessful, the run does
  not merge, and the failed item is reported.
- **The item filter matches nothing** (every named thread was resolved between the read and the
  delegation): `{{SKILL:iterate}}` returns cleanly with no items and never falls back to processing
  everything.
- **The pull request is a draft:** report and do not merge.
- **The pull-request title is not a Conventional Commit and the merge method is `squash`:** report
  the invalid title as the blocking condition and do not merge.
- **Concurrent gate runs on the same pull request:** this workflow holds no lock of its own.
  `{{SKILL:iterate}}`'s commit mutex protects the index, but two gate runs could both wait. Out of
  scope; the merge SHA guard makes the second merge fail closed rather than duplicate work.

## Rules

- Perform **no** `git commit` and **no** push other than the base-into-head merge that Phase 2 step 1
  allows. Delegate every other code change to `{{SKILL:iterate}}`.
- Never rewrite the head branch's history: no `commit --amend`, no rebase, no squashing of its
  commits, no force-push. The forge-side `delivery.mergeMethod` – including `squash` and `rebase` –
  is the integration of the pull request in Phase 5 and is not covered by this rule.
- Never approve a pull request and never request changes, not even to unblock a merge.
- Read the pull-request status, threads, and comments fresh before every write and before the merge.
- Ask the entry gate exactly once, at the start. A configured `prReview.completion` of `merge` or
  `report` is used unchanged in every run state; only `ask` or an unset key in a non-interactive
  delegation behaves as `report`.
- `report` withholds the merge and nothing else: repairs, the bot trigger, and thread replies still
  run.
- Never fall back to a prompt-driven poll loop when a wait times out; report and ask once.
- Never exceed `prReview.maxRounds`, never reset the counter, and never jump backwards inside a
  round – a repeated wait, a repair, and a Phase-2 restart from the bot round each consume a round.
- Post no summary comment of your own; the run summary goes to the user in chat.
- Never set a `Co-Authored-By` trailer and add no AI attribution in the merge commit, in thread
  replies, in trigger comments, or in any other published text.
- Do not start project validation such as linting, tests, or builds yourself; the pull request's own
  checks are the criterion, and repairs run through `{{SKILL:iterate}}`.
- Give the user a brief status update after each phase.
- On a missing or unauthenticated CLI: abort cleanly and perform no local side effects.
