---
description: "Shepherds an existing pull request from open to merged: resolves the pull request, asks once whether the run may merge at the end or only report merge-readiness, then drives an ordered gate – wait for and repair the checks, have the notes of the configured automatic reviewers evaluated and answered through {{SKILL:iterate}}, block review-driven work and the merge while a human comment is open, and finally merge with the configured merge method. Every code change is delegated to {{SKILL:iterate}}; the tool itself commits and pushes nothing except a base-into-head merge for a branch behind its base."
catalogHint: "Drives an open pull request through checks, bot notes, and – if allowed – the merge."
---

# Effective Flow Merge Gate

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

## The central `pr-review` skill stays out of this run

**Do not load the central `pr-review` skill here.** That is why it is deliberately absent from a
recommended-skills section: a recommended skill is authoritative for its domain, and this one brings
its own approve and request-changes submissions, its own CI recovery, and its own summary
conventions — three things this workflow forbids.

The judgment that skill owns still happens, one delegation away. `{{SKILL:iterate}}` loads it and
performs the caller-owned Mode C handoff, which is the one place that judgment belongs. This
workflow adds no second judgment layer and consumes `{{SKILL:iterate}}`'s reported outcome per item.

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
here and stays a no-op unless the project's own `skills.tools.merge-gate` configuration adds one.

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
apply, and `mergeGate.maxRounds` is this workflow's concrete bound. The completion condition is the
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

```include
review-bot-state
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
  `mergeGate.maxRounds` such comments per run were noise on the pull request besides. Nothing is
  lost: `{{SKILL:iterate}}` hands that content back and Phase 6 reports it in chat;
- the **review-guard exemption**, on its own line, in the exact literal form
  `Review guard: established`. This is mandatory in **every** delegation from this gate, and the two
  kinds of delegation earn it differently – the mandatory rule is not one precondition applied twice:
  - a **CI repair** carries `Item filter: free-text-only`, so the delegated run classifies no review
    thread at all and a review-in-flight guard would protect nothing. That delegation is issued from
    Phase 2 step 4, **before** this run has observed any reviewer, and the exemption is correct there
    precisely because the run's scope excludes every item a reviewer could still be adding to;
  - a **bot round** carries thread IDs and is issued from Phase 3, after this run has observed the
    state of every configured reviewer. A delegated run that re-derived it would either duplicate
    this run's wait or block against a reviewer the gate is deliberately not waiting for.

  Write the form exactly: `{{SKILL:iterate}}` returns `ABORT` for an announced review-guard line it
  cannot parse and never continues as an unguarded run, so a typo costs a round instead of silently
  removing the guard. Omitting the line is worse: a non-interactive gate run cannot answer the
  guard's question and comes back as `ABORT: review still in flight`.

  The line stays its own and is deliberately **not** derived from `Item filter:`. A filter states the
  scope of a run; only the caller knows whether that scope, or its own prior observation, makes the
  guard unnecessary. Deriving one from the other would hand the exemption to any future workflow that
  filters merely for scoping, without it ever having earned it;

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

| Key                              | Values                             | Default   |
| -------------------------------- | ---------------------------------- | --------- |
| `mergeGate.completion`           | `ask`, `merge`, `report`           | `ask`     |
| `mergeGate.requireAllChecks`     | `true`, `false`                    | `true`    |
| `mergeGate.checkWaitMinutes`     | positive integer                   | `20`      |
| `mergeGate.maxRounds`            | positive integer                   | `3`       |
| `mergeGate.botWaitMinutes`       | positive integer                   | `10`      |
| `mergeGate.bots`                 | comma list of logins               | `(empty)` |
| `mergeGate.bots.<login>.trigger` | literal trigger comment text       | unset     |
| `mergeGate.bots.<login>.check`   | commit-status or check-run context | unset     |
| `delivery.mergeMethod`           | `squash`, `merge`, `rebase`        | `squash`  |

- `mergeGate.bots` is a flat comma list of reviewer logins; the trigger text and the check context of
  each bot are their own dotted keys. A login containing brackets (`greptileai[bot]`) is a valid
  middle segment, because the encoding splits on `.` only.
- An empty `mergeGate.bots` list means no automatic reviewer is expected. The bot round is then
  skipped instead of blocking the merge forever.
- `mergeGate.bots.<login>.check` names the commit status or check run that reviewer publishes, for
  example `recensor/review`. It is matched against the normalized `name` of an entry in
  `pr-status-read`'s check list, per the loaded "Automatic reviewer state". Unset is the default and
  selects that block's fallback signal, so a project that configures nothing keeps its previous
  behavior exactly.
- The legacy `prReview.*` names are still read: the loaded configuration building block resolves
  `mergeGate.<key>` first, falls back to `prReview.<key>`, and reports once that it did. This
  workflow never writes configuration – `{{SKILL:setup}}` migrates the block.
- `delivery.mergeMethod` is a delivery property, not a gate property: it describes how this project
  integrates a pull request.
- **`mergeGate.*` is not `delivery.prReview`.** The pre-existing `delivery.prReview` decides whether a
  workflow publishes **its own review findings** onto a pull request it just created. The
  `mergeGate.*` keys configure **this gate**. They mean entirely different things; never read one for
  the other, and never let the rename of this gate's namespace reach `delivery.prReview`.

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
- the bot round: the observed state of every configured reviewer – **running**, **not started**, or
  **has run** – together with the evidence that established it (the check context with its status,
  the two timestamps, or the value that was missing), which trigger was posted, which threads went to
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
3. Resolve the completion mode from `mergeGate.completion`:
   - a configured `merge` or `report` is used unchanged, in every run state, and the report states
     that it came from configuration;
   - `ask` or an unset key poses the entry gate **exactly once**, before any wait, delegation, or
     write. Never ask it again later in the run.
   - `ask` or an unset key in a **non-interactive delegation** cannot pose the question, so that
     combination – and only that combination – behaves as `report`. Name
     `mergeGate.completion: merge` as the setting that would authorize a merge in such a run.

**`report` scopes the merge, not the run.** In both modes the gate waits for the checks, has failing
checks repaired through `{{SKILL:iterate}}`, posts a configured bot trigger where a bot has **not
started**, and has the bot threads answered and resolved through `{{SKILL:iterate}}`. `report`
withholds exactly one action: the merge in Phase 5. What differs is the ending, not the work.

```ask
when: `mergeGate.completion` is `ask` or unset and the run is gated
header: Completion
question: May this run merge the pull request once every gate passes, or only report merge-readiness?
options:
  - label: Merge
    description: mergeGate.completion = merge — repair, have the bot threads answered by the delegated iterate run, and merge with delivery.mergeMethod once every precondition holds
  - label: No merge
    description: mergeGate.completion = report — still repair failing checks and have the bot threads answered by the delegated iterate run, but never merge; the run ends with a merge-readiness report
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
   1. **The author is a bot** – either a login listed in `mergeGate.bots`, matched through
      "Matching a configured login" so one account is recognized whichever surface reported it, or an
      item whose
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
      configured `mergeGate.bots.<login>.trigger` value of some configured bot. Compare the `login`
      exactly and compare no other author field – display name, profile URL, and account ID take no
      part in it. Compare the **whole** body after trimming surrounding whitespace; a prefix, a
      substring, a quoted copy, or any other partial or fuzzy match never qualifies. Such an item is
      excluded.

      **This is the only shape this rule has to recognize**, because a gate-initiated run leaves at
      most one item of its own on the pull request: this trigger comment. It is **at most** rather
      than exactly one because Phase 3 posts no trigger for a bot it observed as **running**; a run
      that leaves nothing behind narrows nothing here. The delegated
      `{{SKILL:iterate}}` run's summary comment is suppressed (see "Delegation contract") and its
      thread replies are resolved along with their threads, where rule 2 catches them. A
      `{{SKILL:iterate}}` run the operator started **themselves** is a different case, and rule 4
      covers it.

   4. **A top-level pull-request comment is this tool's own when both hold:** its author is this
      tool's own – the login `viewer-read` returned, or a bot under rule 1's two cases – **and** its
      body's leading line is `<!-- effective-flow-iterate -->` or `<!-- effective-flow-pr-review -->`.
      Such an item is excluded. This reaches both top-level comments this tool leaves behind: the
      summary comment a directly invoked `{{SKILL:iterate}}` run posts, and the comment the outbound
      direction publishes for findings whose line lies **outside the diff**. Rule 3 reaches neither:
      it matches one exact configured trigger text, and neither of those bodies is it. Without this
      rule, running `{{SKILL:iterate}}` by hand – or letting `delivery.prReview` annotate a line
      outside the diff – and then asking this gate to merge would block on the tool's own output,
      permanently.

      **Both markers count, and the enumeration is pinned to the helper's marker table**, for the
      same reason rule 2 names both. The outside-diff case is the one that cannot resolve itself: an
      inline finding is anchored in a thread and stops counting once that thread is resolved, but a
      top-level comment has no resolved state, and `{{SKILL:iterate}}` skips an item carrying the
      outbound marker as this tool's own published output rather than as input awaiting action.
      Nothing would ever clear it. The enumeration is deliberately not
      replaced by a reference to the marker table: a future comment kind must not join a fail-open
      exclusion automatically, so a contract test compares this list against `COMMENT_MARKERS` and
      fails when they diverge.

      **Two conditions here, three in rule 2 – and the missing one has no analogue.** Rule 2's
      `resolved` condition exists because a resolved thread is a container this tool marked handled,
      and an objection can be typed _inside_ it. A top-level comment has no such container: an
      objection is its own comment, carries no stamp of its own, and still counts under rule 5.
      Requiring resolution here would not tighten the rule but disable it, because the surface it
      covers is never resolved – which is why the two-condition shape is pinned by the same contract
      test. The leading-line requirement carries the same weight it does in rule 2 – a quote-reply's
      copied marker sits behind a `>` and no longer opens the body – and a hand-written opening
      marker remains the same deliberate self-override.

      **Neither excluded comment hides an open question.** `{{SKILL:iterate}}` posts no substantive
      reply to a pure reviewer question and defers it, and it replies to and resolves only the
      threads it addressed. A deferred question therefore keeps its own unresolved thread, and that
      thread still counts. The summary comment reports on those threads; it never replaces them. An
      outside-diff finding is not a question at all: it is this product's own review output, which
      stays on the pull request to be read, and which no run was ever going to act on.

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
and a **gate-initiated run leaves at most that one item of its own on the pull request** – because
the delegated run's summary comment is suppressed (see "Delegation contract") and its thread replies
are resolved along with their threads. At most, not exactly: Phase 3 posts no trigger for a bot it
observed as **running**, and a run that writes nothing at all is the same guarantee one write
further in the safe direction. Every reply for a finding that _is_ implemented is written
and resolved by `{{SKILL:iterate}}`, as before, and Phase 1's rule 2 keeps those replies out of the
guard.

### Phase 2: Check gate (bounded)

Repeat the round below at most `mergeGate.maxRounds` times. Run its steps in exactly this order – the
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
3. **Pending checks.** Call `pr-checks-wait` with `mergeGate.checkWaitMinutes` as its timeout and let
   the CLI block; the run consumes no tokens while CI runs. Restrict the wait to the forge's own
   required checks exactly when `mergeGate.requireAllChecks` is `false`; the helper owns the provider
   form of that restriction.
   - On a **timeout result** or when the provider has **no watch capability**: do **not** fall back
     to a prompt-driven poll loop. Report the still-pending checks by name and ask the user once.
   - An **unanswered or non-interactive** run ends there with a report and never merges.
4. **Failed checks.** Delegate to `{{SKILL:iterate}} <PR>` with the item filter set to
   **free-text-only** and an instruction derived from the failing check names and their reported
   failure detail. The human-comment guard does **not** block this delegation.
5. **Re-read the status** and evaluate the check criterion:
   - `mergeGate.requireAllChecks: true` (default) – **every** reported check must have completed
     successfully. A failed, cancelled, or timed-out check is a failure; a still-pending check ends
     this round and the next round starts again at step 1.
   - `mergeGate.requireAllChecks: false` – only checks the forge marks as required count, read from
     the `required` flag `pr-status-read` reports per check. A red optional check is reported but is
     not a blocker. A check whose requiredness the provider does not state **fails closed** and is
     treated as blocking, because an unproven "optional" is exactly the value that would wave a red
     check through. An **empty** required subset counts as satisfied: no reported check is required,
     so nothing required is outstanding, and the merge state below decides the rest.
   - That last rule is deliberate and has a known limit worth stating. The `required` flag exists
     only on checks that have **already reported**, so a required check which has not reported yet is
     absent from the list entirely and cannot be counted. This criterion therefore cannot distinguish
     "nothing is required here" from "a required check has not started". The merge state is what
     covers the difference — a forge blocks the merge while its required checks are unmet — which is
     why that condition is necessary rather than decorative. Do not read a satisfied criterion as
     proof that every required check has run.
   - In **both** cases the forge's merge state stays an **additional necessary condition**, never a
     substitute: "all checks green" and "mergeable" are different statements, and a protected branch
     can additionally require named checks, an approval, an up-to-date branch, or linear history.

Leave the loop when the check criterion is satisfied and the merge state is **stated** and is
neither `BEHIND` nor `DIRTY`. An unstated merge state fails closed and keeps the loop running, for
the same reason an absent `draft` flag blocks and an unstated requiredness blocks: "neither `BEHIND`
nor `DIRTY`" is vacuously true of a field the provider never reported, and the criterion above
delegates its own safety to this condition. A compensating condition that disappears when the
provider goes quiet compensates for nothing. Record the head SHA of that last read as
**`VERIFIED_HEAD_SHA`** – the one commit this run has verified as green and mergeable. Phases 4 and 5 use only that value, and nothing else in this
workflow records a head SHA for later use.

#### Round accounting

`mergeGate.maxRounds` bounds the **whole run**, not one phase. A counter starts at zero and increases
by one every time a Phase-2 round begins – **including** a round that only waits again after a
still-pending check, and **including** a Phase-2 restart that a Phase-3 bot round triggered – and by
one more for every **return into Phase 3** that Phase 4's condition 7 performs. That return is
counted here explicitly because it begins no Phase-2 round of its own; uncounted, a reviewer that
keeps publishing threads would cycle between Phase 4 and Phase 3 without a bound. Nothing resets the
counter and nothing bypasses it, because a round never jumps backwards into itself: a bot round that
produced an implementation and sent the run back into Phase 2 **consumes a round** like any other,
and so does the return into Phase 3. When the counter reaches `mergeGate.maxRounds`, the run ends
with a report naming the still-unmet condition, never with a merge.

### Phase 3: Automatic reviewer round

If `mergeGate.bots` is empty, skip this phase entirely, record that no automatic reviewer is
configured, and do not block the merge on it.

Otherwise, for each login in `mergeGate.bots`, after "Matching a configured login" has de-duplicated
entries that denote the same reviewer – two spellings of one account are one round here, not two:

1. **Observe its state** through the loaded "Automatic reviewer state", against the fresh read: one
   of **running**, **not started**, or **has run**. Record the state together with the evidence that
   established it – the check context with its status, the two timestamps, or the value that was
   missing – so a Phase-4 block on this bot is explainable instead of mysterious.
   - **A bot with a configured `mergeGate.bots.<login>.check`** takes the primary signal, and only
     that signal can report **running**.
   - **A bot without one** takes the fallback signal, which distinguishes **has run** from **not
     started** and nothing else. That is exactly the two-way behavior this phase had before, so an
     existing project sees no change.
   - **An unprovable state is not started**, never an assumed pass: the gate may trigger and wait,
     and it never merges on an unprovable precondition.
2. **Running: wait, and post nothing.** The bot is already working for this head. Post **no** trigger
   comment: a mention would either queue a redundant second run or, for a reviewer that reads a
   mention as a fresh request, discard the one in flight. Apply the single wait of step 4.
3. **Not started: post its `mergeGate.bots.<login>.trigger` text once** as a pull-request comment,
   then apply the single wait of step 4.
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
     already. Post no second trigger then, and apply the wait instead.
   - **Establishing that author differs by mode**, and neither case reads a configured login: in
     manual mode the author's `login` equals the one `viewer-read` returned; in app mode the
     author's normalized `authorType` is `bot`. **No configuration names the account this gate posts
     as** – a `mergeGate.bots` entry is a reviewer the gate waits for, never the author of the
     trigger – so matching the trigger's author against that list would look for a comment that
     cannot exist.
   - If a timestamp is absent, or the author cannot be established at all, the comparison is
     unprovable. Treat the trigger as **not yet posted for this head** and post it: a redundant
     mention costs one extra bot run, a wrongly suppressed one costs the merge. This is the same
     direction step 1 fails in.
   - If no trigger text is configured for that login, post nothing and apply the same single wait for
     the bot's own schedule; report that no trigger is configured.
4. **The wait is one blocking wait, not a poll.** Both states above end in the same wait. There is no
   helper operation for a bot the way `pr-checks-wait` exists for the checks, so block once for
   `mergeGate.botWaitMinutes` – a single `sleep` of that span in the shell, or the harness's
   equivalent single blocking wait – then re-read exactly once and observe the state again. Never
   substitute a sequence of status reads: that is the per-interval model turn the design rejects.
   - If the harness cannot block that long (a tool timeout below the configured span), block for the
     longest single span it allows, re-read once, and, if the bot still has not run, end with a
     report naming it. Do not chain further waits to make up the difference.
   - If the bot is still not **has run** after the wait, the run ends with a report naming that bot
     and its observed state as the blocking condition. A timeout here is always a report, never a
     merge – and that holds for **running** exactly as it does for **not started**: a reviewer this
     run watched working is still a reviewer whose notes nobody has answered.
5. **When the bot has run:** hand its unresolved threads to `{{SKILL:iterate}} <PR>` with the item
   filter set to **exactly those thread IDs**. `{{SKILL:iterate}}` classifies them, implements the
   valid ones as new commits, replies, and resolves them.
6. **Any implementation restarts Phase 2** – new commits invalidate both the check result and every
   bot's state. Discard `VERIFIED_HEAD_SHA`; the new head is unverified until a Phase-2 round
   sets it again. The restart consumes a round per "Round accounting".

**With the human-comment guard active,** this phase neither delegates nor triggers: the trigger
comment and its wait are skipped as well, because the outcome they wait for – an implementation – is
unreachable, and an automated mention on an actively discussed pull request costs
`mergeGate.botWaitMinutes` per bot for nothing. The gate writes **nothing** into the already present
bot threads either: per "A deferred finding gets no thread reply" it leaves every one of them
untouched and unresolved, and names the findings it did not implement in its chat summary instead.

**This workflow never approves a pull request and never requests changes** – not even to unblock a
merge. A protected branch that requires an approval is reported as needing a human approval.

### Phase 4: Merge preconditions

Verify every one of the following against a **fresh** read. Any unmet condition ends the run with a
report naming exactly that condition, and merges nothing – with the single exception condition 7
states for itself, which sends the run back into Phase 3 while rounds remain instead of ending it:

1. the resolved completion mode is `merge`;
2. the check criterion from `mergeGate.requireAllChecks` is satisfied;
3. the forge reports the pull request as mergeable and **not a draft**;
4. the human-comment guard is inactive;
5. every login in `mergeGate.bots` is observed as **has run** for the current head through the loaded
   "Automatic reviewer state" – **running** and **not started** are both unmet conditions, and an
   unprovable state is **not started**, never an assumed pass. Which reported output belongs to a
   configured login follows "Matching a configured login", so that contract's fallback signal weighs
   a reviewer's pull-request comments and its review threads as the one reviewer's evidence;
6. every bot thread **whose finding this run implemented** is answered and resolved – those are
   written and resolved by `{{SKILL:iterate}}`. A finding this run deferred or rejected does
   **not** block the merge: it is named in the Phase-6 chat summary and its thread is deliberately
   left untouched. That scoping is deliberate, not an oversight – nothing in this workflow may write
   into such a thread any more (see "A deferred finding gets no thread reply"), so requiring an
   answer there would be a condition no run could ever satisfy;
7. **every unresolved thread of a configured reviewer has been assessed by this run** – implemented,
   or deliberately deferred or rejected. Take every unresolved thread of the same fresh read whose
   author is a login in `mergeGate.bots` under "Matching a configured login" – the threads arrive
   from the surface that reports a bot without its `[bot]` suffix, so a literal comparison against a
   configured login matches nothing here and reports this condition satisfied while open findings
   sit there – and match it against the record this run kept per round:
   the thread IDs it handed to `{{SKILL:iterate}}`, plus the threads whose findings it deferred or
   rejected. A thread in neither list arrived after the Phase-3 observation that fixed this run's
   item filter – the reviewer's check had gone terminal by then, which states that the reviewer
   finished and never that every thread it wrote had already arrived (see "Automatic reviewer
   state") – so nobody reached any outcome about it, and it blocks. An **empty** `mergeGate.bots`
   list produces no such thread and satisfies this condition, as it satisfies condition 5.

   **This is not condition 6 widened, and the two must never be folded into one.** Condition 6 asks
   whether a thread this run **implemented** was answered and resolved, and its narrow scope stays
   correct for the reason stated there. This condition asks a different question: whether the thread
   was **assessed at all**. Deferred and rejected are outcomes this run reached about a finding it
   read; **never assessed** is the absence of any outcome, about a finding nobody read. A finding
   that was judged and set aside is therefore silent in both conditions, and an unjudged thread
   blocks here and only here. A future simplification that merges the two restores the defect this
   condition exists for: it would either demand a reply no run may write, or wave through a finding
   no run ever saw.

   **Unmet while rounds remain: return to Phase 3** with exactly those threads, instead of ending
   the run. That return **consumes a round** under "Round accounting", precisely as a Phase-3
   restart does – the round counter is the only thing that bounds a reviewer which keeps publishing.
   Once the counter has reached `mergeGate.maxRounds`, the run ends with a report naming every
   unassessed thread; never with a merge.

   **Fail closed.** Whenever the fresh read cannot establish that a thread was assessed – an
   unreadable thread list, an author that cannot be established, an unstated resolution state – the
   thread counts as unassessed and blocks. An unprovable assessment is treated exactly as an
   unprovable reviewer state is in condition 5: never as an assumed pass;

8. `VERIFIED_HEAD_SHA` is set and the freshly read head SHA equals it. An unset value means no
   Phase-2 round ever completed, or a Phase-3 restart discarded it: that is a blocking condition,
   never a reason to verify the merge against the head just read;
9. for `delivery.mergeMethod: squash`, the pull-request title parses as a Conventional Commit
   (`<type>[(scope)][!]: <description>`). On a squash merge the title becomes the subject of the
   single commit and is therefore the release signal; an untyped title would silently drop the
   change from the changelog. Report the invalid title as the blocking condition – do not rewrite it
   here.

**Report every unresolved thread that matched no configured login.** When `mergeGate.bots` is
non-empty and **at least one** unresolved thread of the same fresh read matched no configured login
under "Matching a configured login", carry those threads into the Phase-6 summary – each one named
with the author it actually carries, beside the configured logins. The **zero** case is what this
report began as and stays inside it: where **none** of the unresolved threads matched, condition 7
reporting itself satisfied is indistinguishable from "no reviewer threads are open", the log records
the same thing in both cases, and a gate whose unassessed-thread protection is inert would say so
nowhere. Per thread is that case plus the **mixed** one – a thread from a configured reviewer beside
a thread under a login no entry names – where condition 7 keeps only the matched thread in its
record and the other is outside it entirely, so every Phase-4 condition can hold while a
never-assessed finding sits open. A trigger that fired only on zero would stay silent about exactly
that pull request.

**This reports only; it is not a condition and never blocks the merge.** An unresolved thread from a
_human_ already holds condition 4's human-comment guard, so what reaches this point is a thread whose
author is bot-typed – excluded from that guard by Phase 1 rule 1 – under a login no entry names.
Making that block would double-count the human case and could stall merges condition 4 correctly
releases, and it would strand a project that deliberately ignores a thread-posting bot: its only
escape would be adding that bot to `mergeGate.bots`, which then makes this gate wait for it as a
reviewer and trigger it. The residual gap is therefore accepted and made visible rather than closed –
such a finding can still be merged past, but never without the run saying so. Note that "Matching a
configured login" does not reach this case at all: a wholly wrong or absent login is not a spelling
problem.

### Phase 5: Merge

In mode `report`, or when any Phase-4 condition failed, report the exact unmet condition and perform
no merge. In mode `report` that is the only thing withheld: the repairs, any bot trigger Phase 3
posted, and the delegated `{{SKILL:iterate}}` rounds of the earlier phases have already happened, and
the run ends by reporting whether the pull request is merge-ready and what a merge run would still
need.

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
   - the bot round per configured login: the observed state, the evidence that established it, and
     whether the run triggered, waited, or proceeded;
   - **every pair of `mergeGate.bots` entries that collapsed to one reviewer**, with the surviving
     key so the redundant row can be dropped – and every collapse whose entries set the same
     `.trigger` or `.check` to different values, that conflict named with both values and named as
     what blocked the merge on that reviewer;
   - whether human comments were found and what that blocked;
   - **every bot finding this run assessed but did not implement**, named here rather than answered
     in its thread;
   - **every unresolved thread that matched no configured login**, when Phase 4 carried that case
     here, each with the author it carries beside the configured logins – this one blocked nothing
     and nothing is written into those threads, so this summary is where that report reaches the
     user;
   - the merge result, or the precise blocking condition.

## Edge cases

- **The head moves during the run:** the SHA guard on `pr-merge` rejects the merge; report and do not
  retry blindly.
- **A bot acknowledges with an emoji reaction instead of a comment.** Greptile does this. Reactions
  are not readable through the helper, so on the fallback signal that acknowledgment never counts and
  the bot times out and blocks the merge – a report, never a wrong merge. **An acknowledgment is not
  a check.** Greptile also publishes a `Greptile Review` check context, so configuring `.check` for
  it removes this limitation entirely; do not read the reaction as evidence that a reviewer has no
  check to configure.
- **A bot edits one sticky comment in place instead of posting a new one.** Its `createdAt` never
  moves past `headCommittedAt`, so that edit is invisible to the fallback signal. The fallback reads
  the newest comment, review **thread**, or thread reply, so a review that also opens a thread for
  this head is still seen; on a head whose **only** output is that edit it is not, and the fallback
  reports **not started** for a reviewer that has in fact reviewed – a merge precondition that can no
  longer become true. recensor edits its summary comment this way, and Greptile did exactly this on
  the pull request that introduced the check-based signal: it found nothing, therefore opened no
  thread, and its frozen summary edit was its whole output for that head. Only a configured `.check`
  resolves it: the fallback cannot, by construction, because the one timestamp it reads is the one
  the reviewer stopped moving.
- **A bot posts nothing because it found nothing** is indistinguishable from "has not run yet" on
  the fallback signal; the same timeout applies. A configured `.check` removes this limitation for
  the bots that publish one.
- **The provider exposes no `createdAt` or no `headCommittedAt`:** bot freshness is unprovable on the
  fallback signal, so the bot counts as **not started**, the merge is blocked, and the missing field
  is named as the reason. Never merge on an assumed precondition.
- **A bot's configured `.check` context never appears** – a misconfigured value, or an app that is
  not installed: it is indistinguishable from a context about to appear, so the bot counts as **not
  started**. The gate triggers, waits, and finally blocks the merge naming the missing context, which
  is what makes the misconfiguration visible instead of silent.
- **A bot's configured `.check` is non-terminal:** the bot is **running**, so this run waits for it
  and posts **no** trigger. That is the one behavioral difference a configured `.check` makes to this
  phase; a bot without one keeps the previous two-way behavior exactly.
- **A bot's `.check` is terminal but failed:** it has run. The conclusion states what the reviewer
  found, not whether it ran, so its threads are handed to `{{SKILL:iterate}}` like any other.
- **A bot's `.check` goes terminal before its last thread is published:** the threads that land
  afterwards were in no Phase-3 item filter, so Phase 4's condition 7 finds them unassessed, sends
  the run back into Phase 3 for exactly those threads at the cost of a round, and blocks the merge
  outright once the rounds are used up. This is the window "Automatic reviewer state" narrows and
  leaves to its consumer to close.
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
- **The same delivery's outside-diff findings:** they are published as one top-level comment carrying
  the same marker, and rule 4 excludes it by author plus leading marker. The two surfaces therefore
  block differently on purpose – an inline finding blocks until its thread is resolved, an
  outside-diff finding never blocks – because a top-level comment has no resolved state to clear.
  Before rule 4 named this marker, such a comment blocked the merge with no recovery short of
  deleting the record, since implementing the finding leaves the comment in place and
  `{{SKILL:iterate}}` skips the marker as this tool's own output.
- **A review body carrying an Effective Flow marker:** no rule covers it, and none is needed. The
  guard reads the review threads and the pull-request comments; a review body is in neither, so it
  can never hold the guard.
- **`mergeGate.bots` is empty:** the bot round is skipped and the merge is not blocked on it.
- **Branch protection requires an approval:** the forge reports a blocked merge state; report that a
  human approval is missing and never attempt to approve.
- **A non-required check is red while the required ones are green:** with the default
  `mergeGate.requireAllChecks: true` this blocks the merge and enters the repair loop like any other
  failure. With `false` the forge merge state decides and the red optional check is reported but not
  treated as a blocker.
- **A check is red and a human comment is open:** the CI repair runs, the merge does not. This is the
  one case where the guard is deliberately narrow.
- **`pr-checks-wait` times out or is unsupported:** report the pending checks and ask once; never
  fall back to a prompt-driven poll loop.
- **Forgejo:** `pr-status-read`, `pr-checks-wait`, `pr-merge`, and `viewer-read` are all unsupported,
  so the run degrades to report-only and states the reason. The guard therefore stays active there,
  which blocks a merge that was unavailable anyway – nothing is lost. Every bot takes the fallback
  signal there as well, because no check rollup is reported at all.
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
- Never read an Effective Flow marker as authorship evidence **on its own**, and write none. A
  marker is only ever one condition beside the author, and only as the body's leading line.
  Evaluate the guard in Phase 1's order – bot authorship first, then this tool's own items inside a
  resolved thread, then the authenticated login plus the exact configured trigger text, then this
  tool's own top-level comment by its leading iterate marker – and count everything else as human.
- Never let an unprovable identity clear the guard. A failed, unsupported, or login-less
  `viewer-read` makes every remaining non-bot item count, which activates the guard wherever such an
  item exists and leaves a pull request without one unblocked; report the missing identity as the
  reason. The identity is never consulted for an item rule 1 already excluded.
- Write nothing into the thread of a bot finding this run did not implement – no reply, no
  resolution. Name it in the chat summary instead. The trigger comment is this workflow's only own
  write, and suppressing the delegated run's summary comment keeps it the only item a gate-initiated
  run can leave on the pull request – at most one, since a bot observed as **running** gets no
  trigger at all.
- Announce `Summary comment: suppressed` and `Review guard: established` in every delegation, each on
  its own line and in exactly that literal form, and never delegate without either of them.
- Take every bot's state from the loaded "Automatic reviewer state" and never treat an unprovable
  state as **has run**; an unprovable precondition blocks the merge. Trigger only a bot that has
  **not started**, never one that is **running** – a mention aimed at a reviewer already working
  costs the run in flight or queues a redundant one.
- Read the pull-request status, threads, and comments fresh before every write and before the merge.
- Ask the entry gate exactly once, at the start. A configured `mergeGate.completion` of `merge` or
  `report` is used unchanged in every run state; only `ask` or an unset key in a non-interactive
  delegation behaves as `report`.
- `report` withholds the merge and nothing else: repairs, the bot trigger for a bot that has **not
  started**, and the delegated `{{SKILL:iterate}}` rounds still run.
- Never fall back to a prompt-driven poll loop when a wait times out; report and ask once.
- Never exceed `mergeGate.maxRounds`, never reset the counter, and never jump backwards inside a
  round – a repeated wait, a repair, a Phase-2 restart from the bot round, and a Phase-4 return into
  Phase 3 each consume a round.
- Post no summary comment of your own; the run summary goes to the user in chat.
- Never set a `Co-Authored-By` trailer and add no AI attribution in the merge commit, in trigger
  comments, or in any other published text.
- Do not start project validation such as linting, tests, or builds yourself; the pull request's own
  checks are the criterion, and repairs run through `{{SKILL:iterate}}`.
- Give the user a brief status update after each phase.
- On a missing or unauthenticated CLI: abort cleanly and perform no local side effects.
