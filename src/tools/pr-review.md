---
description: "Shepherds an existing pull request from open to merged: resolves the pull request, asks once whether the run may merge at the end or only report merge-readiness, then drives an ordered gate – wait for and repair the checks, have the notes of the configured automatic reviewers evaluated and answered through {{SKILL:iterate}}, block review-driven work and the merge while a human comment is open, and finally merge with the configured merge method. Every code change is delegated to {{SKILL:iterate}}; the tool itself commits and pushes nothing except a base-into-head merge for a branch behind its base."
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
2. once green, hand the notes of the configured automatic reviewers (Greptile and comparable bots)
   to `{{SKILL:iterate}}`, which fixes the valid ones and answers and resolves their threads, and
   re-trigger the reviewer where needed;
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

- the **summary-comment suppression**, on its own line, in the exact literal form
  `Summary comment: suppressed`. This is mandatory in every delegation from this gate. In manual
  mode the delegated run posts under the same account as the gate and the operator, so its per-round
  summary comment would be a top-level, unresolvable, non-trigger item that the next fresh read –
  including **this run's own Phase 4 read** – counts as human. An unsuppressed summary would
  therefore activate the guard against the very work the round just completed, and up to
  `prReview.maxRounds` such comments per run were noise on the pull request besides. Nothing is
  lost: `{{SKILL:iterate}}` hands that content back and Phase 6 reports it in chat;
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
- the authenticated login `viewer-read` returned, or the reason it could not be read
- the human-comment guard state and the evidence that set it
- per round: the round number, the check result, the merge state, what was delegated, and what came
  back; plus `VERIFIED_HEAD_SHA` once a round sets it, and its discard on a Phase-3 restart
- the provisioned checkout: reused in place, or the Effective Flow-owned worktree with its lifecycle
  record handle and that record's last transition
- the bot round: which bot has run for which head, which trigger was posted, which threads went to
  `{{SKILL:iterate}}`, and which findings were deferred and reported in chat instead
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
checks repaired through `{{SKILL:iterate}}`, posts a configured bot trigger, and has the bot threads
answered and resolved through `{{SKILL:iterate}}`. `report` withholds exactly one action: the merge
in Phase 5. What differs is the ending, not the work.

```ask
when: `prReview.completion` is `ask` or unset and the run is gated
header: Completion
question: May this run merge the pull request once every gate passes, or only report merge-readiness?
options:
  - label: Merge
    description: prReview.completion = merge — repair, have the bot threads answered by the delegated iterate run, and merge with delivery.mergeMethod once every precondition holds
  - label: No merge
    description: prReview.completion = report — still repair failing checks and have the bot threads answered by the delegated iterate run, but never merge; the run ends with a merge-readiness report
```

### Phase 1: Read the state fresh and set the human-comment guard once

1. Read `pr-status-read` plus the review threads and the pull-request comments **fresh** through the
   loaded operations. Read the authenticated identity once through the loaded `viewer-read`
   operation (capability key `viewerRead`): the login it returns is what lets this run recognize a
   comment an **earlier** run of this gate wrote under the same account. Nothing else survives
   between runs – the comment or reply ID a mutation returned is known only to the run that
   performed that mutation, so a rule built on it reads every earlier run's output as a stranger's.
2. Evaluate every comment and thread in **exactly this order** and stop at the first rule that
   matches. The order is load-bearing, not cosmetic:
   1. **The author is a bot** – either a login listed in `prReview.bots`, or an item whose
      normalized `authorType` is `bot`. Two disjoint cases, and the second one carries app mode: the
      account this gate posts as appears in no configuration table, so it is recognized by
      `authorType` alone. The item is **excluded** and the evaluation stops there – the forge's own
      authorship record already separates those writes. **The identity lookup is deliberately not
      consulted for such an item.** `viewer-read` can legitimately fail on an installation token, so
      a rule that reached the identity here would fail closed and block precisely the one mode that
      never needed an identity.
   2. **The item sits inside a `resolved` review thread, its author is this tool's own, _and_ it
      carries `<!-- effective-flow-iterate -->` or `<!-- effective-flow-pr-review -->`** – the author
      being the login `viewer-read` returned, or a bot under rule 1's two cases. Only then does it
      **not** count. All three conditions are required. This is stated for the individual comments,
      not only for the thread, because it has to cover both directions this tool writes into a
      thread: the replies `{{SKILL:iterate}}` writes and resolves, and the inline review comments the
      outbound direction publishes. In manual mode both carry the same account as the operator, so
      without this rule the guard would stay active for exactly the pull requests this tool
      successfully worked on — including the ones it annotated itself through `delivery.prReview`.

      **Both markers count, and the enumeration is pinned to the helper's marker table.** The two
      directions stamp different markers by design, because idempotency and repeat suppression need
      to tell _which_ writer produced a body. This rule needs the opposite granularity: _whether any_
      Effective Flow writer produced it. Naming both is therefore the point, not an oversight — a
      rule that knew only the `{{SKILL:iterate}}` marker could never exclude an outbound review
      comment, whatever its author and however resolved its thread. The enumeration is deliberately
      not replaced by a reference to the marker table: a future comment kind must not join a
      fail-open exclusion automatically, so a contract test compares this list against
      `COMMENT_MARKERS` and fails when they diverge. Adding a writer is then a decision someone
      makes, not a silent widening.

      **Each condition removes a different way the guard could fail open.** A resolved thread is not
      a closed discussion: neither provider auto-unresolves a thread when someone replies into it,
      so a reviewer can object inside a thread `{{SKILL:iterate}}` resolved – "this fix is wrong, do
      not merge" – and that reply must still count. The author condition alone does not achieve
      that in manual mode, because there the operator and this tool **are the same account**: an
      objection the operator types themselves into such a thread would otherwise be read as this
      tool's own output and discarded. The marker is what separates the two, and it is legitimate
      evidence **here** precisely because it is not doing the work alone – the helper stamps every
      reply `{{SKILL:iterate}}` writes and every inline comment the outbound direction publishes, so
      an item from the right account, in a resolved thread, carrying either stamp is this tool's; a
      hand-typed objection in the same place carries no stamp and counts. This does not soften the
      rule that a marker never excludes an item on its own: it is the third condition here, never the
      first.

      **A marker counts only as the body's first line.** The helper stamps it as a leading line,
      so every item this tool writes begins with one. A quote-reply does not: both providers prefix
      the quoted body with `>`, so a copied marker lands inside a blockquote and no longer opens the
      body. That distinction is the whole reason the position is part of the rule – an operator
      quote-replying their objection into a resolved thread would otherwise carry the marker along
      and have their own objection discarded. A marker found anywhere else in a body is quoted text
      and is disregarded. An operator who hand-writes the marker as their opening line is overriding
      their own guard deliberately, which is a different thing from being caught out by a quote
      button.

   3. **Otherwise the item is this gate's own output only when both hold:** its author's normalized
      `login` equals the login `viewer-read` returned, **and** its complete body equals the
      configured `prReview.bots.<login>.trigger` value of some configured bot. Compare the `login`
      exactly and compare no other author field – display name, profile URL, and account ID take no
      part in it. Compare the **whole** body after trimming surrounding whitespace; a prefix, a
      substring, a quoted copy, or any other partial or fuzzy match never qualifies. Such an item is
      excluded.

      **This is the only shape this rule has to recognize**, because a gate-initiated run leaves
      exactly one item of its own on the pull request: this trigger comment. The delegated
      `{{SKILL:iterate}}` run's summary comment is suppressed (see "Delegation contract") and its
      thread replies are resolved along with their threads, where rule 2 catches them. A
      `{{SKILL:iterate}}` run the operator started **themselves** is a different case, and rule 4
      covers it.

   4. **A top-level pull-request comment is this tool's own when both hold:** its author is this
      tool's own – the login `viewer-read` returned, or a bot under rule 1's two cases – **and** its
      body's leading line is `<!-- effective-flow-iterate -->`. Such an item is excluded. This
      reaches the summary comment a directly invoked `{{SKILL:iterate}}` run posts, which rule 3
      cannot: that rule matches one exact configured trigger text, and a summary comment is not it.
      Without this rule, running `{{SKILL:iterate}}` by hand and then asking this gate to merge would
      block on the tool's own report, permanently.

      **Two conditions here, three in rule 2 – and the missing one has no analogue.** Rule 2's
      `resolved` condition exists because a resolved thread is a container this tool marked handled,
      and an objection can be typed _inside_ it. A top-level comment has no such container: an
      objection is its own comment, carries no stamp of its own, and still counts under rule 5. The
      leading-line requirement carries the same weight it does in rule 2 – a quote-reply's copied
      marker sits behind a `>` and no longer opens the body – and a hand-written opening marker
      remains the same deliberate self-override.

      **The excluded summary comment hides no open question.** `{{SKILL:iterate}}` posts no
      substantive reply to a pure reviewer question and defers it, and it replies to and resolves
      only the threads it addressed. A deferred question therefore keeps its own unresolved thread,
      and that thread still counts. The summary comment reports on those threads; it never replaces
      them.

   5. **Everything else counts as human**, including an item whose normalized `authorType` is
      `unknown`. That is the fail-safe direction: the only consequence is a narrower run.

   **Fail closed – but never on rule 1.** A `viewer-read` that fails, is unsupported, or states no
   authenticated login leaves the identity unknown. A non-bot item can then not be _proven_ to be
   the gate's own under rule 3, and the `viewer-read` half of rules 2 and 4 is unprovable in exactly
   the same way; every such item therefore counts and the guard activates. Report the missing
   identity as the reason, so the block is explainable instead of mysterious. **Rule 1 needs no
   identity and stays untouched by this** – bot authorship is read from the item itself, as is the
   bot half of rules 2 and 4 – and that is what keeps app mode running when the identity lookup does
   not.

   **This is a same-account contract.** Rules 2 and 4 recognize an item only when the account that
   wrote it is the one `viewer-read` returns, or is bot-typed. A pull request annotated through
   `delivery.prReview` under one account and then merged by a gate running under another – an
   operator-driven delivery and an app-driven gate, for instance – fails that condition and still
   blocks. That is the accepted residual gap, not an oversight: closing it would mean letting a
   marker prove authorship on its own, which this guard refuses everywhere else.

3. Decide **what counts** for the guard, because the two surfaces differ:
   - a **review thread** counts while it is not `resolved`, and rule 2 above extends that to this
     tool's own comments inside a resolved one;
   - a **top-level pull-request comment** has no resolved state on either provider, so it always
     counts unless rule 1, rule 3, or rule 4 excluded it. A single old human comment therefore keeps
     the guard active until it is deleted – the deliberate fail-safe reading, since the alternative
     is merging a pull request under an open human discussion;
   - **an item is excluded only through the rules above.** Three of them read a body, and each reads
     it narrowly: rule 3 as an exact match against a value this project configured, rules 2 and 4 as
     a marker occupying the body's first line. None of them searches a body for a tool's signature.
   - **An Effective Flow marker never excludes an item on its own**, whoever the author looks like.
     A marker is body content, and content is not authorship evidence: GitHub's quote-reply copies
     the quoted body verbatim, HTML comment included, so a human answering one of
     `{{SKILL:iterate}}`'s replies would otherwise silently switch off the guard that exists to
     protect them. That is why a marker never appears as a rule's only condition, and never counts
     anywhere but as the body's leading line. This gate writes no marker of its own at all
     (Phase 3), so no marker on this pull request is ever evidence about the gate itself.
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
- **no thread reply, and no thread resolution, of any kind** – see the rule below.

#### A deferred finding gets no thread reply

When this gate assesses a bot finding but does not implement it – because the human-comment guard is
active, or because the finding was rejected – it names that finding **to the user in chat** and
writes **nothing** into its thread. It resolves nothing either.

This **supersedes** the earlier rule that the guard permits the gate to answer bot threads itself.
The two are not two standing options: the later decision replaces the earlier one, and it is written
here so that the two are not read as a contradiction. Resolving such a thread would signal "handled"
for a finding nobody handled, and leaving an unresolved reply behind is precisely what makes the
next run read its predecessor's output as a human comment.

The consequence, stated plainly: **the gate's only own write is the trigger comment** of Phase 3,
and a **gate-initiated run leaves exactly that one item of its own on the pull request** – because
the delegated run's summary comment is suppressed (see "Delegation contract") and its thread replies
are resolved along with their threads. Every reply for a finding that _is_ implemented is written
and resolved by `{{SKILL:iterate}}`, as before, and Phase 1's rule 2 keeps those replies out of the
guard.

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

1. **Has it run for the current head?** Compare two normalized fields of the fresh read: the
   `createdAt` timestamp of that login's newest comment, review thread, or thread reply against the
   `headCommittedAt` timestamp from `pr-status-read`. The bot counts as having run when its newest
   `createdAt` is later than `headCommittedAt`; both are RFC-3339 strings and are compared as
   instants, not as text.
   - **Fail closed when either value is absent.** The provider does not always expose them, and the
     helper leaves an unexposed value out rather than guessing. Without both timestamps the gate
     cannot prove the bot ran for **this** head, so it treats the bot as not having run: it may
     trigger and wait, and it never merges on an unprovable precondition. Report the missing field
     as the reason, so a Phase-4 block on this bot is explainable.
   - Emoji reactions are not readable through the helper and therefore never count, whatever their
     timing.
2. **If not:** post its `prReview.bots.<login>.trigger` text **once** as a pull-request comment, then
   wait.
   - Build that comment body yourself: the literal configured trigger text and **nothing else** –
     no marker, no preamble, no signature – posted through the helper's PR-comment mutation. That
     exact body is what Phase 1's rule 3 recognizes as this gate's own on the next run, and it is
     also what keeps the raw comment from announcing which tool composed it. Do **not** use the `pr`
     comment-kind builder – it stamps `<!-- effective-flow-iterate -->`, the marker
     `{{SKILL:iterate}}` reads as its own already processed work, and any marker at all would defeat
     both purposes above.
   - **Idempotency without a marker.** A trigger has already been posted for the current head when a
     comment exists whose body equals the configured trigger text after trimming surrounding
     whitespace, whose author is established as this gate's own, and whose `createdAt` is **not
     older than** `headCommittedAt`. Both timestamp fields are part of the normalized envelopes
     already. Post no second trigger then.
   - **Establishing that author differs by mode**, and neither case reads a configured login: in
     manual mode the author's `login` equals the one `viewer-read` returned; in app mode the
     author's normalized `authorType` is `bot`. **No configuration names the account this gate posts
     as** – a `prReview.bots` entry is a reviewer the gate waits for, never the author of the
     trigger – so matching the trigger's author against that list would look for a comment that
     cannot exist.
   - If a timestamp is absent, or the author cannot be established at all, the comparison is
     unprovable. Treat the trigger as **not yet posted for this head** and post it: a redundant
     mention costs one extra bot run, a wrongly suppressed one costs the merge. This is the same
     direction step 1 fails in.
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
`prReview.botWaitMinutes` per bot for nothing. The gate writes **nothing** into the already present
bot threads either: per "A deferred finding gets no thread reply" it leaves every one of them
untouched and unresolved, and names the findings it did not implement in its chat summary instead.

**This workflow never approves a pull request and never requests changes** – not even to unblock a
merge. A protected branch that requires an approval is reported as needing a human approval.

### Phase 4: Merge preconditions

Verify every one of the following against a **fresh** read. Any unmet condition ends the run with a
report naming exactly that condition, and merges nothing:

1. the resolved completion mode is `merge`;
2. the check criterion from `prReview.requireAllChecks` is satisfied;
3. the forge reports the pull request as mergeable and **not a draft**;
4. the human-comment guard is inactive;
5. every login in `prReview.bots` has run for the current head, proven by the `createdAt` versus
   `headCommittedAt` comparison of Phase 3 – a missing timestamp is an unmet condition, never an
   assumed pass;
6. every bot thread **whose finding this run implemented** is answered and resolved – those are
   written and resolved by `{{SKILL:iterate}}`. A finding this run deferred or rejected does
   **not** block the merge: it is named in the Phase-6 chat summary and its thread is deliberately
   left untouched. That scoping is deliberate, not an oversight – nothing in this workflow may write
   into such a thread any more (see "A deferred finding gets no thread reply"), so requiring an
   answer there would be a condition no run could ever satisfy;
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
delegated `{{SKILL:iterate}}` rounds of the earlier phases have already happened, and the run ends
by reporting whether the pull request is merge-ready and what a merge run would still need.

Otherwise call `pr-merge` with `delivery.mergeMethod` and `VERIFIED_HEAD_SHA` as the expected head.
Inspect the default dry-run command preview, then repeat with `--apply`.

- If the expected head SHA no longer matches the current head, the operation **fails closed**: a
  human pushed while the gate was working. Report that and do not retry blindly.
- Never re-run the mutation after a structured error carrying `mutationMayHaveSucceeded: true` –
  re-read the pull-request state instead and report what it shows.

### Phase 6: Summary

1. Delete the wisdom file.
2. Report to the user in chat. **Neither this workflow nor any run it delegates posts a summary
   comment onto the pull request:** the gate has none of its own, and `{{SKILL:iterate}}`'s
   per-round summary is suppressed for every gate-initiated round, so its content arrives here
   instead. The merge itself is visible on the pull request anyway. Report:
   - the resolved pull request and the resolved mode with its source;
   - the check outcome per round;
   - the delegated `{{SKILL:iterate}}` rounds and their results, including the summary content each
     one handed back instead of posting;
   - the bot round state per configured login;
   - whether human comments were found and what that blocked;
   - **every bot finding this run assessed but did not implement**, named here rather than answered
     in its thread;
   - the merge result, or the precise blocking condition.

## Edge cases

- **The head moves during the run:** the SHA guard on `pr-merge` rejects the merge; report and do not
  retry blindly.
- **A bot acknowledges with an emoji reaction instead of a comment.** Greptile does this. Reactions
  are not readable through the helper, so such a bot times out and blocks the merge – a report, never
  a wrong merge.
- **A bot posts nothing because it found nothing** is indistinguishable from "has not run yet"
  through comments alone; the same timeout applies. Known limitation.
- **The provider exposes no `createdAt` or no `headCommittedAt`:** bot freshness is unprovable, so
  the bot counts as not having run, the merge is blocked, and the missing field is named as the
  reason. Never merge on an assumed precondition.
- **A human quote-replies to the gate's trigger comment,** copying its body: the item is
  human-authored, so it counts and the guard activates. With no marker left to copy there is nothing
  in the body that could mislead the guard, and a quoted body carries the quote markup and therefore
  no longer equals the trigger text exactly.
- **The operator writes the configured trigger text by hand:** it matches rule 3 and is excluded.
  That is correct – a trigger is not a discussion, and treating it as one would block the merge for
  no reason. It also means the configured trigger should be a distinctive mention: a
  non-distinctive text such as `please review` could be typed by a person who genuinely wants a
  discussion and would then be excluded too.
- **`viewer-read` fails, is unsupported, or exposes no login:** the gate cannot identify its own
  writes on the manual path, so every remaining non-bot item counts, the guard activates, and the
  missing identity is reported as the reason for the block.
- **App mode with an installation token:** `viewer-read` may fail there, but every item the gate
  wrote is already excluded by rule 1 before the identity is consulted, so the run proceeds
  normally. This is the case the evaluation order exists for.
- **The authenticated identity changes between runs** (a different token): earlier writes are no
  longer recognized as own output and count as human. Fail-safe and correct – the gate genuinely
  cannot prove they were its own.
- **A thread `{{SKILL:iterate}}` answered and resolved:** rule 2 keeps its replies out of the guard,
  so a successful earlier run does not block the next one. A reply from **any other** account inside
  that same resolved thread still counts – resolution is not consent.
- **`{{SKILL:iterate}}` could not resolve a thread it answered:** it keeps its reply and reports the
  manual resolution, which leaves an unresolved item behind that carries the operator's account in
  manual mode. On a later run that item is in no resolved thread and its body is not the trigger
  text, so it counts as human and the guard activates. Thread resolution is unsupported only on
  Forgejo, where this gate is report-only anyway, so this costs a merge that was unavailable
  regardless – named here so it is not later read as an oversight.
- **The delegated run's summary comment:** it is suppressed for every gate-initiated round, so it
  never becomes such an item. A summary comment from a `{{SKILL:iterate}}` run the operator started
  themselves does exist, and rule 4 excludes it by its author plus its leading marker; before that
  rule it fell through to the catch-all and blocked the merge permanently.
- **A pull request this delivery annotated itself** (`delivery.prReview` published inline findings):
  once a finding is implemented, answered, and its thread resolved, rule 2 excludes the outbound
  comment by the `<!-- effective-flow-pr-review -->` marker, so the gate can merge the pull request
  its own product wrote on. While such a thread is still unresolved the finding is unhandled and it
  keeps counting, which is the intended block.
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
- **Forgejo:** `pr-status-read`, `pr-checks-wait`, `pr-merge`, and `viewer-read` are all unsupported,
  so the run degrades to report-only and states the reason. The guard therefore stays active there,
  which blocks a merge that was unavailable anyway – nothing is lost.
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
- Never read an Effective Flow marker as authorship evidence, and write none. Evaluate the guard in
  Phase 1's order – bot authorship first, then this tool's own comments inside a resolved thread,
  then the authenticated login plus the exact configured trigger text – and count everything else as
  human.
- Never let an unprovable identity clear the guard. A failed, unsupported, or login-less
  `viewer-read` makes every remaining non-bot item count, which activates the guard wherever such an
  item exists and leaves a pull request without one unblocked; report the missing identity as the
  reason. The identity is never consulted for an item rule 1 already excluded.
- Write nothing into the thread of a bot finding this run did not implement – no reply, no
  resolution. Name it in the chat summary instead. The trigger comment is this workflow's only own
  write, and suppressing the delegated run's summary comment keeps it the only item a gate-initiated
  run leaves on the pull request.
- Announce `Summary comment: suppressed` in every delegation, and never delegate without it.
- Never treat a bot as having run for the current head without both `createdAt` and
  `headCommittedAt`; an unprovable precondition blocks the merge.
- Read the pull-request status, threads, and comments fresh before every write and before the merge.
- Ask the entry gate exactly once, at the start. A configured `prReview.completion` of `merge` or
  `report` is used unchanged in every run state; only `ask` or an unset key in a non-interactive
  delegation behaves as `report`.
- `report` withholds the merge and nothing else: repairs, the bot trigger, and the delegated
  `{{SKILL:iterate}}` rounds still run.
- Never fall back to a prompt-driven poll loop when a wait times out; report and ask once.
- Never exceed `prReview.maxRounds`, never reset the counter, and never jump backwards inside a
  round – a repeated wait, a repair, and a Phase-2 restart from the bot round each consume a round.
- Post no summary comment of your own; the run summary goes to the user in chat.
- Never set a `Co-Authored-By` trailer and add no AI attribution in the merge commit, in trigger
  comments, or in any other published text.
- Do not start project validation such as linting, tests, or builds yourself; the pull request's own
  checks are the criterion, and repairs run through `{{SKILL:iterate}}`.
- Give the user a brief status update after each phase.
- On a missing or unauthenticated CLI: abort cleanly and perform no local side effects.
