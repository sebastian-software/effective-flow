---
description: "Shepherds an existing pull request from open to merged: resolves the pull request, asks once whether the run may merge at the end or only report merge-readiness, then drives an ordered gate – wait for and repair the checks, have the notes of the configured automatic reviewers evaluated and answered through {{SKILL:iterate}}, block review-driven work and the merge while a comment from an account that is neither a bot nor the one the gate is authenticated as is open, and finally merge with the configured merge method. Every code change is delegated to {{SKILL:iterate}}; the tool itself commits and pushes nothing except the base-into-head merge that brings the head branch forward – cleanly, or with its conflicts resolved by a delegated worker."
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
3. if an open pull-request comment exists from an account that is **neither a bot nor the one this
   run is authenticated as**, implement no review note and merge nothing – the CI repair and the
   repair of a conflict with the base stay permitted (see "Human-comment guard"). Neither a bot's
   comment nor a comment the gate's own account wrote – including one the operator typed themselves
   in manual mode – blocks;
4. if no such comment exists, everything is green, every configured automatic reviewer has run for
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

```include
delegation-mandate
```

This gate is a delegator twice over, and the mandate governs the second kind. Handing the rest of a
code change to `{{SKILL:iterate}}` is a workflow-to-workflow delegation and keeps that tool's own
mechanics, including its interactive path – the mandate's own carve-out. Handing a conflicted merge
to `{{AGENT:merge-conflict-resolver}}` and the resolved tree to `{{AGENT:code-validator}}` is a
delegation to **named worker roles**, which is exactly what the mandate binds: those two are
mandatory, never a judgment call. Where the mandate's inline fallback would apply – no sub-agent
mechanism, or a delegation declined at run time – this gate does not resolve inline: it says so
visibly and stops, because implementing is the one thing this workflow never does itself.

**The mandate's "delegation is the default for analysis" does not reach this gate's own state
reading and guard evaluation.** Reading the pull-request status, the threads, and the comments
fresh, classifying every item through Phase 1's ordered rules, setting the human-comment guard, and
evaluating the Phase-4 conditions stay **in this run**. They are the security-relevant reasoning this
gate exists to perform, they read state only this run holds, and a sub-agent's summarized answer
would be exactly the kind of unprovable evidence every one of those rules fails closed on. What the
mandate binds here is the two worker-role delegations above, not the gate's own reading.

```lazy-include
runtime-state-safety
when: any wisdom, runtime migration, or worktree mutation below `.effective-flow/` is imminent
```

```lazy-include
effective-flow-dir-migration
when: any wisdom, runtime migration, or worktree mutation below `.effective-flow/` is imminent
```

```lazy-include
next-steps
when: the run reaches its completion report
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
independent verification happens in CI, inside the delegated `{{SKILL:iterate}}` run, and – for a
resolved merge conflict – inside the delegated `{{AGENT:merge-conflict-resolver}}` and
`{{AGENT:code-validator}}` roles. Delegating a check is not starting one here.

## Checkout provisioning boundary

Read this before the delivery and worktree integration below, because only a narrow part of that
fragment applies here. Two things are used: the verified execution location with its two roots, and
provisioning a checkout for the Git write of Phase 2 step 1 – the same one checkout whether that
merge applies cleanly or has to be resolved first.

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
claim/remove/reconcile sequence; on a controlled stop before the push – including a conflict this run
may not or cannot resolve – end the in-progress merge with `git merge --abort` so the checkout is
left clean, then transition it to `aborted`; on an error transition it to `failed`. `aborted` and `failed` retain the worktree and the branch for
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

**This workflow performs no `git commit` and no push of its own, with exactly two sanctioned kinds
of Git write, and both are the same operation on the same branch:** the **clean** base-into-head
merge – `origin/<base>` merged into the head branch as a merge commit and pushed normally, when that
merge applies without a conflict – and the **conflict-resolving** base-into-head merge, where the
same merge conflicts, `{{AGENT:merge-conflict-resolver}}` resolves the conflicted files, and the gate
commits and pushes the result. Each is a **kind** of write, not a one-time allowance: either applies
in every Phase-2 round whose fresh read calls for it, each occurrence is exactly one merge commit
plus one normal push of the head branch, and no Git write of any other kind is permitted at any
point.

The second kind is bounded by `mergeGate.conflictResolution`: `off` and an `ask` nobody can answer
make it unavailable, and the run then reports the conflict and makes **no commit and no push** –
exactly the previous outcome on the branch. That claim is about the branch, not about the machine:
step 1 provisions its checkout before the mode is evaluated, and that checkout is left clean by
`git merge --abort` and closed through its lifecycle on the same stop path.

**Which gate stands in for `pre-commit-gate` on the second kind of write.** This workflow carries no
`pre-commit-gate` include and runs no project validation itself, yet the conflict-resolving merge
commits newly authored content – so the stand-in is named rather than left to inference: it is the
`{{AGENT:code-validator}}` verification of the "Conflict-resolution delegation contract", delegated
in **`full`** mode, which is the mode that preserves a repository-mandated combined or top-level gate
instead of only the checks a role scope would select. The worker's own validation is the first layer
and does not replace it, and a verification that executed no check is treated as `ABORT` there. No
commit of this kind is ever written without that gate having run and passed.

**Every other code change is delegated to `{{SKILL:iterate}}`** – CI failures as free-text
instructions, bot findings as the review threads it already reads. This workflow therefore inherits
`{{SKILL:iterate}}`'s classification, action routing, path-ownership analysis, commit-integrity
mutex, validation phase, and push rules unchanged, and carries no second implementation, staging, or
push path.

Never rewrite the **head branch's** history – no rebase, no squashing of its commits, no
`commit --amend`, no force-push – here or in a delegation. A branch behind its base is fixed by
merging the base into it, never by replaying it, and a branch that **conflicts** with its base is
fixed the same way: the conflict is resolved inside that forward merge. A resolution that would need
a rewrite to succeed is reported, never performed.

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
  `Summary comment: suppressed`. This is mandatory in every delegation from this gate, and it rests
  on four grounds, none of which is how this run's own Phase 4 read would classify such a comment:
  up to `mergeGate.maxRounds` summary comments per run is noise on someone's pull request; nothing
  is lost, because `{{SKILL:iterate}}` hands that content back and Phase 6 reports it in chat; the
  guarantee that a **gate-initiated run leaves at most one item of its own** on the discussion (see
  "A deferred finding gets no thread reply") depends on it; and a gate running under a **different**
  account than the delegated run reads that summary as a foreign comment, which would activate the
  guard against the very work the round just completed. Under the same account the guard's identity
  rule excludes it, so that last ground is the residual rather than the main case – but the
  obligation is not conditional on the mode, and neither is the line;
- the **next-step suppression**, on its own line, in the exact literal form `Next steps: suppressed`.
  This is mandatory in every delegation from this gate. A delegated round is an intermediate result
  inside this run, and only Phase 6 knows whether the gate ended merged, blocked, or out of rounds,
  so a per-round recommendation would name a step the run has not reached. `{{SKILL:iterate}}` reads
  a malformed line as suppression rather than aborting, so a typo costs nothing here; only an
  **omitted** line costs one duplicated chat block;
- the **review-guard exemption**, on its own line, in the exact literal form
  `Review guard: established`. This is mandatory in **every** delegation from this gate, and the two
  kinds of delegation earn it differently – the mandatory rule is not one precondition applied twice:
  - a **CI repair** carries `Item filter: free-text-only`, so the delegated run classifies no review
    thread at all and a review-in-flight guard would protect nothing. That delegation is issued from
    Phase 2 step 3, **before** this run has observed any reviewer, and the exemption is correct there
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

## Conflict-resolution delegation contract

The second delegation of this workflow is a **worker-role** delegation, not a workflow handoff, and
it is separate from the `{{SKILL:iterate}}` contract above precisely because nothing it carries is
the same. It is issued from Phase 2 step 1, only from an observed conflict, and only once per round.

Hand `{{AGENT:merge-conflict-resolver}}`:

- the **provisioned checkout's absolute root** – the invocation checkout or the Effective
  Flow-owned worktree of this step, never a second one it provisions for itself;
- the **base and head refs** of the merge that is in progress, and the fact that it **is** in
  progress;
- the **conflicted paths** as `git status` reports them in that checkout, with their staged and
  unstaged state;
- the **resolved language values**, so the worker does not re-read the project setup ADR;
- **this run's own run state** – gated or non-interactive delegation – so the worker knows whether a
  question could be answered at all;
- the **boundary it works inside**, restated because it is the gate's boundary and not the worker's
  to relax: it resolves, validates, and stages by explicit path, and it never commits, never
  continues the merge, never aborts it, never pushes, and never rewrites history. The commit, the
  push, and every lifecycle transition stay here.

Consume from it:

- `DONE` with the **per-file record** – each conflicted path with its routing role, its risk
  classification, and what was done with it; each **adjacent** non-conflicted file with the named
  failing check that demanded the change; the exact validation commands with their results and every
  check skipped with its reason; and the complete list of staged paths;
- or `ABORT` with the file and the concrete contradiction, which ends the step as a controlled stop.

Then, before anything is committed, in **exactly this order** – the order is load-bearing and is
stated for the reason the second bullet gives:

- **reconcile the record against the working tree, first.** Every modified path must appear in the
  worker's own record, named and justified. A modified path the record does not name is an error:
  abort the merge, report it, and commit nothing. The adjacent-file allowance covers **reported**
  files, never unreported ones.

  **What this reconciliation proves, and what it does not.** It verifies that every modified path is
  **named**, and that every **adjacent** path carries a named check together with the **verbatim**
  failure output that check produced before the change. It does **not** re-run that check – this
  workflow runs no validation of its own – so the bound on adjacent files is enforced as a
  disclosure requirement plus a presence check on the evidence, and the Phase-6 report is where a
  human audits whether the named failure actually justified the change. An adjacent path named
  without a check, or named with a check but without its verbatim failure output, counts exactly as
  an unnamed path: abort the merge, report it, commit nothing;

- **verify independently, second.** Hand the resolved but uncommitted tree to
  `{{AGENT:code-validator}}` for an independent execution and report of the repository's checks, so
  the resolution is not verified only by the role that produced it. A failing verdict from **either**
  role is treated as `ABORT`; the two roles disagreeing is not a tie to break. This is the only
  validation this workflow commissions directly, and it still happens inside delegated roles – the
  gate starts none of its own.

  Hand `{{AGENT:code-validator}}`:
  - the **provisioned checkout's absolute root** – the same checkout, with the merge still in
    progress and the worker's paths staged;
  - its **assigned scope**: the union of the conflicted paths and every adjacent path the worker
    reported, bucketed and ordered per that role's `Project routing`;
  - the **validation mode `full`**, because this commit has no other pre-commit gate (see "Git write
    boundary") and `full` is the mode that preserves a repository-mandated combined or top-level
    gate;
  - the **resolved language values**, so the validator does not re-read the project setup ADR – its
    own language rule forbids that, so a validator handed none has no compliant option.

  **`{{AGENT:code-validator}}`'s own result declares the working-tree changes its validation
  generated.** Those paths come into existence **after** the reconciliation above and are therefore
  never measured against the worker's record – a reconciliation run afterwards would abort a correct
  resolution over a file the validator itself wrote. They are not staged either: the merge commit
  contains exactly the paths the worker staged, and a validation-generated change is reported and
  left in the working tree;

- **fail closed on an unverified resolution.** The resolution counts as verified only when these two
  layers together **executed at least one** of the repository's own checks and every executed check
  passed. A run in which every check was reported skipped – by the worker, with its reason, or by
  `{{AGENT:code-validator}}` returning `SKIPPED` – and any verdict that is not an affirmative pass
  are treated **exactly as `ABORT`**: abort the merge, report that the resolution could not be
  verified together with every check that did not run, and push nothing. An unprovable verification
  is never an assumed pass, exactly as an unstated merge state, an unstated `required` flag, an
  unprovable bot state, an unprovable assessment, and an unprovable identity are never assumed
  passes in this file.

**The head branch is untrusted input, and this is the threat model.** This gate operates on any open
pull request, including one from an external contributor whose head branch this repository does not
control. `{{AGENT:merge-conflict-resolver}}` discovers its validation commands from files that head
branch supplies – scoped instructions, CI workflows, task runners, manifests, package scripts – and
executes them in the provisioned checkout with full filesystem and network access, fully
automatically whenever `mergeGate.conflictResolution` is `auto`, which is the default. A project that
gates pull requests it does not trust should set `mergeGate.conflictResolution: ask`, so a human
authorizes every resolution, or `off`, so no untrusted branch's commands are executed by this
workflow at all. Stated here so the exposure is a configuration decision rather than a discovery.

## Configuration

Read from the Effective Flow configuration (project setup ADR) per the loaded configuration
building block. A missing line means the default.

| Key                              | Values                             | Default   |
| -------------------------------- | ---------------------------------- | --------- |
| `mergeGate.completion`           | `ask`, `merge`, `report`           | `ask`     |
| `mergeGate.conflictResolution`   | `off`, `ask`, `auto`               | `auto`    |
| `mergeGate.requireAllChecks`     | `true`, `false`                    | `true`    |
| `mergeGate.checkWaitMinutes`     | positive integer                   | `20`      |
| `mergeGate.maxRounds`            | positive integer                   | `3`       |
| `mergeGate.botWaitMinutes`       | positive integer                   | `10`      |
| `mergeGate.bots`                 | comma list of logins               | `(empty)` |
| `mergeGate.bots.<login>.trigger` | literal trigger comment text       | unset     |
| `mergeGate.bots.<login>.check`   | commit-status or check-run context | unset     |
| `delivery.mergeMethod`           | `squash`, `merge`, `rebase`        | `squash`  |

- `mergeGate.conflictResolution` decides what the gate does when the base-into-head merge of Phase 2
  conflicts. `auto` (the default) resolves it through `{{AGENT:merge-conflict-resolver}}`, has the
  resolved tree verified by `{{AGENT:code-validator}}`, and pushes one merge commit. `off` makes no
  commit and no push: the merge is aborted, the conflict is reported, and the **branch** ends exactly
  where it did before this capability existed – the checkout of Phase 2 step 1 is still provisioned
  before the mode is read and is cleaned up on the same stop path. `ask` poses the question **once
  per conflicted Phase-2 round** in a **gated** run – once per conflict, not once per run; in a
  **non-interactive delegated** run the question cannot be posed, so that combination – and only that
  combination – behaves as `off`, and the report names `mergeGate.conflictResolution: auto` as the
  setting that would authorize the resolution. The degradation mirrors how `mergeGate.completion`
  degrades; the per-round cadence deliberately does **not** mirror that key's once-per-run entry
  gate, for the reason Phase 2 states where the question is posed.
- **`mergeGate.conflictResolution` has no `prReview.*` predecessor.** It is new, it never existed
  under the legacy namespace, and the per-key legacy fallback below therefore finds nothing for it.
  A project that configured the old namespace and nothing since gets the default `auto` here, which
  is a behavior change on upgrade; `off` restores the previous behavior exactly.
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
- per round, where the base-into-head merge conflicted: the observed merge state and which entry
  point detected the conflict, the resolved `mergeGate.conflictResolution` mode with its source, the
  conflicted paths with their risk classification, `{{AGENT:merge-conflict-resolver}}`'s per-file
  resolution record including every adjacent file with the check that demanded it, both verification
  verdicts, and the resulting merge commit or the abort reason
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
   the capabilities `pullRequestStatus`, `pullRequestChecksWait`, `pullRequestMerge`, and
   `viewerRead`. On `CLI_MISSING` or `AUTH_FAILED`, abort without side effects. On
   `AMBIGUOUS_HOST`, ask for the provider once and retry.
   - Without `pullRequestStatus` nothing in this gate can run: report that and end.
   - Without `pullRequestChecksWait`, the wait step reports and asks instead of waiting (Phase 2).
   - Without `pullRequestMerge`, the run degrades to `report` and states that reason.
   - Without `viewerRead` the run **continues**. This is the one capability of the four whose
     absence ends nothing: the gate then cannot identify its own earlier writes on the manual path,
     so every remaining non-bot item counts and the human-comment guard activates (Phase 1). That
     blocks a merge rather than stopping the run, and the missing identity is reported as the
     reason.
   - **Forgejo** supports `pullRequestStatus`, `pullRequestMerge`, and `viewerRead`, and declares
     only `pullRequestChecksWait` unsupported: `tea` has no `checks` subcommand and Forgejo offers
     no server-side blocking watch. A Forgejo run therefore takes the documented no-watch path in
     Phase 2 — report the pending checks and ask once — and is the whole gate minus the blocking
     wait, not report-only. What stays unsupported there is `pr-checks-wait`, `review-create`, and
     `review-thread-reply`.
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
started**, has the bot threads answered and resolved through `{{SKILL:iterate}}`, and – where the
head branch conflicts with its base and `mergeGate.conflictResolution` allows it – resolves that
conflict and pushes the resulting merge commit. `report` withholds exactly one action: the merge in
Phase 5. What differs is the ending, not the work.

**The conflict resolution is explicitly among the things `report` does not withhold**, and that is a
deliberate cost rather than an oversight: a run the operator asked only to _report_ still writes one
semantic merge commit onto the head branch. The alternative is worse in practice – a `report` run
would otherwise report the same conflict forever, which is the very state the operator invoked the
gate to clear. An operator who wants no commit and no push at all in such a run sets
`mergeGate.conflictResolution: off`, which is the switch for exactly that, instead of giving this
rule a second exception.

```ask
when: `mergeGate.completion` is `ask` or unset and the run is gated
header: Completion
question: May this run merge the pull request once every gate passes, or only report merge-readiness?
options:
  - label: Merge
    description: mergeGate.completion = merge — repair, have the bot threads answered by the delegated iterate run, and merge with delivery.mergeMethod once every precondition holds
  - label: No merge
    description: mergeGate.completion = report — still repair failing checks, have the bot threads answered by the delegated iterate run, and resolve a conflict with the base and push that one merge commit, but never merge the pull request; the run ends with a merge-readiness report. Set mergeGate.conflictResolution = off for a run that makes no commit and no push at all.
```

### Phase 1: Read the state fresh and set the human-comment guard once

1. Read `pr-status-read` plus the review threads and the pull-request comments **fresh** through the
   loaded operations. Read the authenticated identity once through the loaded `viewer-read`
   operation (capability key `viewerRead`): the login it returns is what lets this run recognize a
   comment an **earlier** run of this gate wrote under the same account. Nothing else survives
   between runs – the comment or reply ID a mutation returned is known only to the run that
   performed that mutation, so a rule built on it reads every earlier run's output as a stranger's.
2. Evaluate every comment and thread in **exactly this order** and stop at the first rule that
   matches. The order is load-bearing, not cosmetic. **An item is human when the account that wrote
   it is neither a bot under rule 1 nor the one this run is authenticated as** – the guard keeps its
   name, so the name is told here what it means, and both halves of that definition are needed: a
   bot is an account other than this run's own, and a definition naming only the identity would make
   every automatic reviewer's note human:
   1. **The author is a bot** – either a login listed in `mergeGate.bots`, matched through "Matching
      a configured login" so one account is recognized whichever surface reported it, or an item
      whose normalized `authorType` is `bot`. **The two cases overlap; they do not divide the items
      between them.** That rule trims the `[bot]` suffix only for a bot-typed record, so every item
      the first case reaches through the trim is one the second reaches anyway. Both still earn their
      place: only the first reaches a configured login a surface reported unchanged and typed as
      anything else, and only the second carries app mode – the account this gate posts as appears in
      no configuration table, so it is recognized by `authorType` alone. The item is **excluded** and
      the evaluation stops there – the forge's own authorship record already separates those writes.
      **The identity lookup is deliberately not consulted for such an item.** `viewer-read` can
      legitimately fail on an installation token, so a rule that reached the identity here would fail
      closed and block precisely the one mode that never needed an identity.
   2. **The author is this run's own account** – the item's normalized `login` equals the login
      `viewer-read` returned. The item is **excluded**: whatever its body says, whichever of the two
      surfaces it sits on, and whether or not its thread is `resolved`.

      **The comparison has three boundaries, and each one is load-bearing.** Compare the `login`
      values as the loaded operations normalized them, with **no case folding**, and compare no
      other author field – display name, profile URL, and account ID take no part in it. **No
      `[bot]` trim applies here:** that trim belongs to rule 1's "Matching a configured login",
      where it reconciles the two spellings one reviewer is reported under, and letting it reach an
      identity comparison would let a foreign login differing from this run's by exactly that suffix
      pass as the run's own. An item whose `login` is **absent** cannot match and therefore counts –
      the same fail-safe direction as an `unknown` author type.

      **What rule 2 subsumes.** All of these are now excluded by authorship alone: this gate's own
      trigger comment from an earlier run, the thread replies and the per-round summary comments
      `{{SKILL:iterate}}` writes, the inline findings and the single outside-diff comment
      `delivery.prReview` publishes, and every comment the operator typed by hand. The guard no
      longer distinguishes between them, and it no longer has to know which writer produced which
      body.

      **What rule 2 gives up.** An objection the operator types themselves no longer holds the
      guard – on either surface, and however long it stays unresolved. That is the deliberate trade:
      the operator running this gate is present by definition, and the guard exists to stop a merge
      out from under **someone else's** open discussion, not to stop an operator from merging past
      their own note. A comment from any other account is untouched by this rule and counts exactly
      as it did before. The loosening is not silent either: Phase 6 reports every item this rule
      excluded that would otherwise have counted.

   3. **Everything else counts as human**, including an item whose normalized `authorType` is
      `unknown`. That is the fail-safe direction: the only consequence is a narrower run.

   **Fail closed – but never on rule 1.** A `viewer-read` that fails, is unsupported, or states no
   authenticated login leaves the identity unknown. Rule 2 is then **unprovable for every item** –
   there is no login to compare against – so every non-bot item counts and the guard activates.
   Report the missing identity as the reason, so the block is explainable instead of mysterious.
   **Rule 1 needs no identity and stays untouched by this** – bot authorship is read from the item's
   own record – and that is what keeps app mode running when the identity lookup does not.

   **This is a same-account contract.** Rule 2 recognizes an item only when the account that wrote it
   is the one `viewer-read` returns for **this** run. A pull request annotated through
   `delivery.prReview` under one account and then merged by a gate running under another – an
   operator-driven delivery and an app-driven gate, for instance – fails that condition, so those
   items count and still block. That residual is accepted rather than closed: closing it would mean
   proving authorship from body content, which this guard no longer does anywhere.

3. Decide **what counts** for the guard, because the two surfaces differ:
   - a **review thread** counts while it is not `resolved`. That is a **counting surface**, not an
     exclusion rule: it decides which threads are open at all, and it is the one place a resolution
     state still means anything to this guard. It is not a filter over what a resolved thread
     contains: **every item inside a resolved thread is still evaluated individually** under the
     rules above, and one written by any other account counts and holds the guard exactly as it
     would anywhere else. A resolution is a claim about the finding, never consent to whatever
     arrives after it, and neither provider un-resolves a thread when someone replies into it – so
     reading the resolution as a filter over the whole thread would silence precisely the objection
     this guard exists for;
   - a **top-level pull-request comment** has no resolved state on either provider, so it always
     counts unless rule 1 or rule 2 excluded it. A single old comment from another account therefore
     keeps the guard active until it is deleted – the deliberate fail-safe reading, since the
     alternative is merging a pull request under an open discussion;
   - **no exclusion rule reads a body.** Both rules above decide on the item's author record and
     nothing else, so no text an item carries – a copied trigger, a quoted Effective Flow marker, a
     signature, a hand-written stamp – can move it into or out of the guard in either direction. That
     does not defend the quote-reply surface, it removes it: there is no body read left for a copied
     body to mislead. This gate writes no marker of its own either (Phase 3), so no marker on this
     pull request is evidence about anything here.
4. **Set the guard.** If at least one counting item was excluded by **no** rule of step 2 – neither
   the bot rule nor the identity rule reached it, so the catch-all counted it as human – the
   human-comment guard is **active**. Reading it from the rule outcome rather than from the word
   "human" is deliberate: an item rule 1 excluded is a bot's and never activates the guard, however
   the noun is read. The guard is set once, here, from this first fresh read, and stays set for the
   rest of the run. A later fresh read may only set it – a human comment that appears mid-run is new
   information in the fail-safe direction – and nothing ever moves it from active back to inactive.

#### Human-comment guard

While the guard is active:

- **no review-driven implementation** – Phase 3 delegates nothing to `{{SKILL:iterate}}`;
- **no merge** – Phase 4 fails on this condition and the run ends with a report;
- **CI repair stays permitted** – a failing check is an objective defect, not an opinion a human is
  currently negotiating, so Phase 2 may still repair it. This narrowing is deliberate: it keeps the
  gate useful on an actively discussed pull request without ever landing a change out from under a
  reviewer;
- **the conflict resolution stays permitted** too, for the same reason and beside the same rule. A
  conflict with the merge target is an objective defect of the branch, not a position a reviewer is
  negotiating, and the repair is the one the gate already performs for a branch that is merely
  `BEHIND` – which the guard has never blocked either. What the guard keeps blocking is unchanged:
  the review-driven implementation and the merge. The resolution runs, the merge does not;
- **no thread reply, and no thread resolution, of any kind** – see the rule below.

#### A deferred finding gets no thread reply

When this gate assesses a bot finding but does not implement it – because the human-comment guard is
active, or because the finding was rejected – it names that finding **to the user in chat** and
writes **nothing** into its thread. It resolves nothing either.

This **supersedes** the earlier rule that the guard permits the gate to answer bot threads itself.
The two are not two standing options: the later decision replaces the earlier one, and it is written
here so that the two are not read as a contradiction. Resolving such a thread would signal "handled"
for a finding nobody handled: a resolution is a claim about the **finding**, never a statement about
who wrote the last word in the thread, so no authorship rule can make that claim true. A reply is no
better – it puts this gate's name under a finding it deliberately did not act on, where the reviewer
and the next reader look for the outcome. The chat summary is where that outcome belongs, because it
reaches the person who can decide about it.

The consequence, stated plainly: **the gate's only own write onto the pull request's discussion is
the trigger comment** of Phase 3, and a **gate-initiated run leaves at most that one item of its own
there** – because the delegated run's summary comment is suppressed (see "Delegation contract") and
its thread replies are resolved along with their threads. At most, not exactly: Phase 3 posts no
trigger for a bot it observed as **running**, and a run that posts no comment at all is the same
guarantee one write further in the safe direction. Every reply for a finding that _is_ implemented is
written and resolved by `{{SKILL:iterate}}`, as before, and those replies leave the guard untouched:
in manual mode they carry this run's own account and the identity rule excludes them, and in app mode
the bot rule does, before any identity is consulted.

**This bounds the discussion surface, not the branch.** The gate also writes to the head **branch** –
the two kinds of base-into-head merge – and those writes are bounded by "Git write boundary", not
here. Both statements are exact and neither weakens the other: nothing this gate pushes ever appears
as a comment, and the at-most-one guarantee above is a bound this gate keeps on the discussion for
its own sake. No guard rule reads it back – suppressing the delegated run's summary comment (see
"Delegation contract") is what sustains it, and that suppression is a contract of this file rather
than a consequence of how the next run classifies anything.

### Phase 2: Check gate (bounded)

Repeat the round below at most `mergeGate.maxRounds` times. Run its steps in exactly this order – the
branch repair comes first so its push is finished before any delegation starts.

**A round runs forward only.** There is no backward jump inside it: whenever the round would return
to the wait or the repair step – a check is still pending after the wait, a repair changed the head,
a re-read shows a new failure – the current round **ends** there and the run continues with a new
round under "Round accounting". Every wait and every repair is therefore counted and bounded, and no
run can push an unbounded number of commits onto someone's pull request.

1. **Bring the head branch forward (`BEHIND` or `DIRTY`).** Both forge states are repaired by the
   **same** local operation – merge `origin/<base>` into the head branch – and `DIRTY` only states in
   advance that the operation will conflict. Provision a checkout of the existing head branch per
   "Checkout provisioning boundary" (verified execution location, rooted operations), fetch the
   base, and merge `origin/<base>` into the head branch as a **merge commit**. Use Git's default
   merge-commit message; add no `Co-Authored-By` trailer and no AI attribution.
   - **The merge applies cleanly:** commit it and push the branch normally, then re-read the status.
   - **The merge conflicts:** continue with "Resolving a conflict with the base" below before
     anything is committed or pushed. That path ends either in the same one merge commit and one
     normal push, or in a controlled stop that makes no commit and no push and leaves the checkout
     clean.
   - These are the only kinds of Git write this workflow performs; see "Git write boundary". The push
     must be completed **before** any `{{SKILL:iterate}}` delegation in this or a later round.
   - **The conflict is discovered locally, never read from the forge.** `pr-status-read` reports
     `mergeState` and `mergeable` but no conflicted-file list, so `DIRTY` and `CONFLICTING` are an
     advance warning and nothing more. A branch reported `BEHIND` whose merge conflicts anyway enters
     exactly the same path, which is why this is one step and not two: the conflict appears in one
     place either way.
   - **Close the checkout's lifecycle in the same step.** Once the push is confirmed, an Effective
     Flow-owned worktree goes `active` → `cleanup-ready` and through the shared
     claim/remove/reconcile sequence; a reused in-place checkout has no record to close. A later
     round that needs this step again provisions a checkout again.
   - **A controlled stop on the conflict path** – `off`, an `ask` nobody answered, an `ABORT` from
     either verification role, or a conflict this run may not or cannot resolve – happens **before**
     the commit: the merge is still in progress, so end it with `git merge --abort` so the checkout
     is left clean, transition an Effective Flow-owned worktree to `aborted`, then stop, report, and
     merge nothing.
   - **A rejected push** happens **after** the merge commit already exists – diverged remote
     history, a protected head branch, a head branch in a fork. There is **no** merge to abort at
     that point, so `git merge --abort` is not run here: it would fail with "There is no merge to
     abort". The merge commit stays on the local branch – reset, amend, rebase and force-push
     nothing, and rewrite no history – transition an Effective Flow-owned worktree to `failed`, then
     stop, report the rejected push, and merge nothing. The edge cases below state this same stop
     per cause.
   - Both stops retain the worktree and its branch for inspection.
2. **Pending checks.** Call `pr-checks-wait` with `mergeGate.checkWaitMinutes` as its timeout and let
   the CLI block; the run consumes no tokens while CI runs. Restrict the wait to the forge's own
   required checks exactly when `mergeGate.requireAllChecks` is `false`; the helper owns the provider
   form of that restriction.
   - On a **timeout result** or when the provider has **no watch capability**: do **not** fall back
     to a prompt-driven poll loop. Report the still-pending checks by name and ask the user once.
   - An **unanswered or non-interactive** run ends there with a report and never merges.
3. **Failed checks.** Delegate to `{{SKILL:iterate}} <PR>` with the item filter set to
   **free-text-only** and an instruction derived from the failing check names and their reported
   failure detail. The human-comment guard does **not** block this delegation.
4. **Re-read the status** and evaluate the check criterion:
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

Leave the loop when the check criterion is satisfied **and** the forge has stated the branch is
integrable — either a merge state that is stated and is neither `BEHIND` nor `DIRTY`, **or**
`mergeable: MERGEABLE` from a provider that reports mergeability but no merge state at all. A
provider that states **neither** fails closed and keeps the loop running, for the same reason an
absent `draft` flag blocks and an unstated requiredness blocks: "neither `BEHIND` nor `DIRTY`" is
vacuously true of a field the provider never reported, and the criterion above delegates its own
safety to this condition. A compensating condition that disappears when the provider goes quiet
compensates for nothing.

**The second arm is Forgejo's, and it is a narrowing rather than a loosening.** Forgejo's
pull-request object has no `mergeStateStatus` equivalent, so the adapter states no merge state
rather than fabricating a `CLEAN` — which means `BEHIND` is undetectable there, and a
branch-protection rule that blocks an outdated branch fails the merge closed server-side instead.
An unstated **mergeability** still blocks in both arms, and Forgejo deliberately leaves it unstated
whenever the forge said `false`: it reports `false` while a conflict check is still running and for
any WIP-titled pull request, so the gate keeps looping instead of reporting a conflict that may not
exist. A genuine conflict on Forgejo therefore does not take the fast "stop and report the conflict"
path — it loops to `mergeGate.maxRounds` and ends with a report. Where the check list itself is
**unreported** (`checksReported: false`), the loop does not leave on the check criterion at all:
report that and ask once per step 2's rule before proceeding, and an unanswered or non-interactive
run ends there without merging.

Record the head SHA of that last read as
**`VERIFIED_HEAD_SHA`** – the one commit this run has verified as green and mergeable. Phases 4 and 5 use only that value, and nothing else in this
workflow records a head SHA for later use.

#### Resolving a conflict with the base

Entered from step 1 above, and only from a merge that has actually conflicted in the provisioned
checkout. The merge is in progress at this point: nothing is committed, nothing is pushed, and the
checkout is the one step 1 provisioned – never a second one.

1. **Resolve the mode before any further write.** Read `mergeGate.conflictResolution` and record the
   resolved value with its source.
   - **`off`:** end the merge with `git merge --abort`, report the conflict with the conflicted paths
     as `git status` reported them, and merge nothing. No commit and no push – exactly the outcome
     this workflow produced on the branch before the capability existed. The checkout was provisioned
     by step 1 before this mode was read; it is left clean here and its lifecycle record is closed as
     a controlled stop.
   - **`ask` in a gated run:** pose the question below **exactly once per Phase-2 round** – once per
     conflict, not once per run. An answer against the resolution is treated as `off` for that round.
     This deliberately deviates from `mergeGate.completion`'s once-per-run entry gate: that question
     settles one fixed decision for the whole run, while each round's conflict is a **different**
     conflict against a base that moved again, so consent given for one is not consent for the next.
     With the default `mergeGate.maxRounds: 3` a run may therefore pose it up to three times.
   - **`ask` in a non-interactive delegated run:** the question cannot be posed, so it behaves as
     `off`, and the report names `mergeGate.conflictResolution: auto` as the setting that would
     authorize the resolution.
   - **`auto`** (the default): continue with step 2.
2. **Capture the conflict state** – the conflicted paths, their staged and unstaged status, and the
   two sides per file – and delegate to `{{AGENT:merge-conflict-resolver}}` per
   "Conflict-resolution delegation contract". The human-comment guard does **not** block this
   delegation, for the reason stated beside the CI repair.
3. **Consume the worker's outcome.** `ABORT` ends this step as a controlled stop under step 1's last
   bullet. `DONE` continues.
4. **Reconcile, then verify independently** – in that order, per that contract: first match the
   worker's per-file record against the modified paths in the working tree, then hand the resolved
   but uncommitted tree to `{{AGENT:code-validator}}` in `full` mode. A modified path the record does
   not name and justify, a failing verdict from either role, or a verification that executed **no**
   check at all ends this step as a stop that commits nothing.
5. **Commit and push.** The gate – not the worker – completes the merge commit and pushes the head
   branch normally. Keep Git's default merge-commit message, which already lists the conflicted paths;
   add no `Co-Authored-By` trailer and no AI attribution. Then re-read the status, exactly as the
   clean path does, and close the checkout's lifecycle per step 1.
6. **One attempt per round.** There is no retry loop inside this step: it makes one resolution
   attempt, it opens **no round of its own** – it lives inside the round step 1 belongs to, which
   continues into step 2 – and `mergeGate.maxRounds` bounds how often the run may come back here. A conflict that re-appears in a later round because the base moved again is a new
   round's work, not a second attempt inside this one.

```ask
when: a Phase-2 base-into-head merge has conflicted, `mergeGate.conflictResolution` is `ask`, and the run is gated
header: Conflict
question: The head branch conflicts with its base. May this run resolve the conflict, verify the result, and push the merge commit?
options:
  - label: Resolve
    description: mergeGate.conflictResolution = auto — hand the conflicted files to the merge-conflict resolver, have the resolved tree verified independently, and push one merge commit
  - label: Report only
    description: mergeGate.conflictResolution = off — abort the merge, leave the branch untouched, and end the run with a report of the conflict
```

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
     no marker, no preamble, no signature – posted through the helper's PR-comment mutation. Two
     things still need that exact body: this step's own idempotency check below, which compares the
     body against the configured text, and keeping the raw comment from announcing which tool
     composed it. The guard is no longer one of them – it reads no body at all, and it excludes this
     comment on the next run by its author alone. Do **not** use the `pr` comment-kind builder – it
     stamps `<!-- effective-flow-iterate -->`, the marker `{{SKILL:iterate}}` reads as its own
     already processed work, and any marker at all would defeat both purposes above.
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
2. the check criterion from `mergeGate.requireAllChecks` is satisfied, **and the fresh read reported
   a check list at all**. `checksReported: false` blocks this condition outright. The Phase-2
   question does not cover it: this condition is re-evaluated against a **different, later** read,
   and the criterion is vacuously satisfied by an empty list under `requireAllChecks: true` — so a
   combined-status response that came back empty at Phase-4 time would otherwise pass silently,
   after the operator answered a question about an entirely different read. An unreported list is an
   unproven one, exactly as an unstated requiredness and an absent `draft` flag are;
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

**This reports only; it is not a condition and never blocks the merge.** An unresolved thread from
another account already holds condition 4's human-comment guard, so what reaches this point is one of
two things: a thread whose author is bot-typed – excluded from that guard by Phase 1's bot rule –
under a login no entry names, **or** a thread this run's own account wrote, which the guard's
identity rule excludes on either surface and whatever its body. Making that block would double-count
the first case and could stall merges condition 4 correctly releases, it would re-block exactly what
the identity rule was changed to release in the second, and it would strand a project that
deliberately ignores a thread-posting bot: its only escape would be adding that bot to
`mergeGate.bots`, which then makes this gate wait for it as a reviewer and trigger it. The residual gap is therefore accepted and made visible rather than closed –
such a finding can still be merged past, but never without the run saying so. Note that "Matching a
configured login" does not reach this case at all: a wholly wrong or absent login is not a spelling
problem.

### Phase 5: Merge

In mode `report`, or when any Phase-4 condition failed, report the exact unmet condition and perform
no merge. In mode `report` that is the only thing withheld: the repairs, any conflict resolution and
its pushed merge commit, any bot trigger Phase 3 posted, and the delegated `{{SKILL:iterate}}` rounds
of the earlier phases have already happened, and the run ends by reporting whether the pull request
is merge-ready and what a merge run would still need.

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
   - **every conflict with the base this run met**: the resolved `mergeGate.conflictResolution` mode
     with its source, the conflicted paths with their risk classification, the resolver's per-file
     record – the side kept, the sides merged, or the generated file regenerated – every **adjacent**
     non-conflicted file with the named check that demanded it **and that check's verbatim pre-change
     failure output**, both verification verdicts with the checks each layer actually executed, and
     the merge commit that resulted or the concrete reason the run stopped instead. This is what makes
     a semantic resolution auditable file by file rather than silent, and it is the only place a
     human can check whether a named failure genuinely justified an adjacent change – the gate
     verified that the evidence is present, never that it is convincing. Report it even when
     everything went well;
   - the delegated `{{SKILL:iterate}}` rounds and their results, including the summary content each
     one handed back instead of posting;
   - the bot round per configured login: the observed state, the evidence that established it, and
     whether the run triggered, waited, or proceeded;
   - **every pair of `mergeGate.bots` entries that collapsed to one reviewer**, with the surviving
     key so the redundant row can be dropped – and every collapse whose entries set the same
     `.trigger` or `.check` to different values, that conflict named with both values and named as
     what blocked the merge on that reviewer;
   - whether comments from another account were found and what that blocked;
   - **every item the guard's identity rule excluded that would otherwise have counted** – every
     unresolved review thread **and** every top-level comment this run's own account wrote, each
     named with its author and the surface it sits on. This is the only place such a **top-level
     comment** is reported at all, and – for as long as `mergeGate.bots` is empty, which is the
     default – the only place any such item is reported: they no longer hold the guard, and Phase 4's
     unmatched-thread report fires only for a non-empty `mergeGate.bots` and reaches no top-level
     comment in any case, so without this line the loudest case – an objection the operator typed
     themselves – would be silent. With a **non-empty** `mergeGate.bots` an unresolved thread this
     run's own account wrote also lands in that report, because this gate's own account is never one
     of its entries; report such an item **once**, here, rather than in both places. It reads **no
     body**, deliberately: that is the same authorship reading the rule itself uses, and the price is
     that this gate's own trigger comment is listed here beside a hand-typed objection;
   - **every bot finding this run assessed but did not implement**, named here rather than answered
     in its thread;
   - **every unresolved thread that matched no configured login**, when Phase 4 carried that case
     here, each with the author it carries beside the configured logins – this one blocked nothing
     and nothing is written into those threads, so this summary is where that report reaches the
     user;
   - the merge result, or the precise blocking condition.
3. Emit the next-step block per `next-steps` as the last element of that chat report. It stays chat
   only: nothing of it is written onto the pull request. Omit it after a successful merge when
   `<plan.dir>/` holds no open plan — the merged row's only edge is `{{SKILL:open-plans}}`, which
   would then have nothing to list.

## Edge cases

- **The head moves during the run:** the SHA guard on `pr-merge` rejects the merge; report and do not
  retry blindly.
- **The merge state is unstated:** the loop already fails closed on it and keeps running. The
  resolution path is entered only from a merge that actually conflicted, so an unstated state never
  starts a speculative merge.
- **The push is rejected after a successful resolution** – someone pushed to the head branch while
  the worker was working: stop, report, rewrite no history, and transition the worktree to `failed`.
  Never retry with force. The merge commit already exists here, so there is no merge to abort – this
  is the post-commit stop Phase 2 step 1 separates from the pre-commit one.
- **The conflict is in a file the repository generates** (a lockfile, a build output that is
  tracked): the resolver regenerates it from its source instead of merging its text. `dist/` is
  gitignored in this repository and cannot conflict here, but a consumer project's generated tracked
  files can.
- **The conflict re-appears in a later round** because the base moved again: the next round runs the
  same step, and the round counter bounds it.
- **The human-comment guard is active:** the resolution runs, the merge does not – named beside the
  CI repair for the same reason.
- **`mergeGate.conflictResolution: ask` in a non-interactive delegated run:** it behaves as `off`,
  and the report names `auto` as the setting that would authorize the resolution.
- **The two verification roles disagree** – `{{AGENT:merge-conflict-resolver}}` reports `DONE` and
  `{{AGENT:code-validator}}` reports a failure: treated as `ABORT`. Abort the merge and report both
  verdicts; a disagreement is never a tie to break in the merge's favor.
- **The resolver changed a file it did not report:** the gate compares the modified paths against the
  worker's own record before committing. A file the record does not name and justify is an error –
  abort the merge, report it, commit nothing. The adjacent-file allowance is for **reported** files,
  never for unreported ones. An adjacent file named without its verbatim pre-change failure output is
  treated the same way: the gate cannot re-run the check, so the evidence's presence is what it
  enforces and the Phase-6 report is what a human audits.
- **Completion mode `report` with a conflict:** the resolution runs, the merge commit is pushed, and
  the run ends by reporting merge-readiness. Only the Phase-5 merge is withheld.
- **The head branch is protected against direct pushes:** the resolution succeeds locally and the
  push is rejected. Report that the branch protection blocks the repair, transition the worktree to
  `failed`, and never work around it. It is the post-commit stop of the rejected-push case above:
  the merge commit stays, and there is no merge to abort.
- **The head branch lives in a fork:** the pull request's head is a branch in **another** repository,
  and pushing to it requires the contributor to have allowed maintainer edits. Without that
  permission the resolution succeeds locally and the push is rejected – the same failure mode as the
  protected-branch case above and handled identically: report it, transition the worktree to
  `failed`, never work around it. This is also where the untrusted-input exposure named in the
  "Conflict-resolution delegation contract" is highest, because a fork's head branch is written by
  someone outside this repository; a project gating such pull requests sets
  `mergeGate.conflictResolution` to `ask` or `off`.
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
- **A colleague comments on the pull request:** it counts and the guard activates. Unchanged, and the
  reason the guard exists at all.
- **A human quote-replies to the gate's trigger comment,** copying its body: it counts and the guard
  activates, because the author is another account. The copied body is irrelevant in both directions
  now – no exclusion rule reads a body, so neither a quoted trigger text nor a quoted marker can move
  the item either way.
- **The operator types an objection themselves:** it no longer counts, whichever surface it sits on
  and whatever it says. This is the requested change rather than a gap, and Phase 6's summary names
  every such item so the merge is never quiet about it.
- **The operator writes the configured trigger text by hand:** excluded – not for what it says, but
  because the operator's account is the account this run is authenticated as, exactly like every
  other comment that operator types. The advice that a configured trigger should be a distinctive
  mention survives, but not for this reason any more: it has to actually summon the reviewer, and
  Phase 3's idempotency compares the configured text against the bodies on the pull request.
- **`viewer-read` fails, is unsupported, or exposes no login:** the gate cannot identify its own
  writes on the manual path, so every remaining non-bot item counts, the guard activates, and the
  missing identity is reported as the reason for the block.
- **App mode with an installation token:** `viewer-read` may fail there, but every item the gate
  wrote is already excluded by the bot rule before the identity is consulted, so the run proceeds
  normally. This is the case the evaluation order exists for.
- **An item this run's own account wrote that the surface reports with `authorType: unknown`:** the
  identity rule still excludes it, because that rule reads the `login` and not the account class. If
  `viewer-read` failed as well, it counts – the residual, and the fail-safe direction.
- **An item whose `login` is absent while `viewer-read` succeeded:** the identity rule cannot match,
  so it counts. Same fail-safe direction, and the reason the boundary is stated with the rule.
- **The authenticated identity changes between runs** (a different token): earlier writes are no
  longer recognized as own output and count as human. Fail-safe and correct – the gate genuinely
  cannot prove they were its own.
- **A thread `{{SKILL:iterate}}` answered and resolved:** its replies carry this run's own account,
  so the identity rule excludes them and a successful earlier run does not block the next one. The
  thread's resolution plays no part in that any more – it never has to, because authorship settles
  it. A reply from **any other** account inside that same resolved thread still counts and still
  holds the guard: step 3 evaluates every item in a resolved thread individually, and a resolution is
  not consent.
- **`{{SKILL:iterate}}` could not resolve a thread it answered:** it keeps its reply and reports the
  manual resolution, which leaves an unresolved item behind carrying this run's own account in manual
  mode. That item no longer counts – the identity rule excludes it, resolved or not – and Phase 6
  names it. Thread **reply** is unsupported on Forgejo, so the reply itself is what cannot be written
  there; thread **resolution** is supported. Since a Forgejo merge is reachable, this is a real
  loosening there rather than a theoretical one: the operator no longer has to resolve such a thread
  by hand before this gate will merge.
- **The delegated run's summary comment:** it is suppressed for every gate-initiated round, so it
  never appears at all – for the four grounds the "Delegation contract" states, none of which is the
  guard any more. A summary comment from a `{{SKILL:iterate}}` run the operator started **themselves**
  does exist, and the identity rule excludes it by its author alone; posted under a **different**
  account than this run's it counts, like any other foreign comment.
- **A pull request this delivery annotated itself** (`delivery.prReview` published inline findings):
  under the account this run is authenticated as, those inline comments are excluded by author alone
  – resolved or not. Where such a finding used to block until its thread was resolved, it now stops
  blocking immediately, which is a genuine loosening: an unhandled finding of this product's own
  review can be merged past. Phase 6 names each one, so it is reported rather than silent. Published
  under a **different** account they still count and still block while their thread is unresolved.
- **The same delivery's outside-diff findings:** published as one top-level comment, and excluded by
  the same author rule. The two surfaces no longer block differently: neither blocks under this run's
  own account, and both count under any other. Phase 4's unmatched-thread report reaches no top-level
  comment at all, which is why Phase 6's report of excluded items covers both surfaces rather than
  threads alone.
- **A review body rather than a comment:** no rule covers it, and none is needed. The guard reads the
  review threads and the pull-request comments; a review body is in neither, so it can never hold the
  guard.
- **`mergeGate.bots` is empty:** the bot round is skipped and the merge is not blocked on it.
- **Branch protection requires an approval:** the forge reports a blocked merge state; report that a
  human approval is missing and never attempt to approve.
- **A non-required check is red while the required ones are green:** with the default
  `mergeGate.requireAllChecks: true` this blocks the merge and enters the repair loop like any other
  failure. With `false` the forge merge state decides and the red optional check is reported but not
  treated as a blocker.
- **A check is red and a comment from another account is open:** the CI repair runs, the merge does
  not. This is the one case where the guard is deliberately narrow.
- **`pr-checks-wait` times out or is unsupported:** report the pending checks and ask once; never
  fall back to a prompt-driven poll loop.
- **Forgejo:** `pr-status-read`, `pr-merge`, and `viewer-read` are supported; `pr-checks-wait`,
  `review-create`, and `review-thread-reply` are not. The run is the whole gate minus the blocking
  wait: step 2 takes the no-watch path, reports the pending checks by name and asks once, and an
  unanswered or non-interactive run ends there. Three consequences are worth naming.
  - **Requiredness is unstated on every check**, because Forgejo has no such flag. With
    `mergeGate.requireAllChecks: false` the existing fail-closed rule therefore treats every check
    as blocking – stricter than the default, never looser.
  - **`mergeGate.bots` entries must be spelled as the bare login.** Forgejo states no account class,
    so every author normalizes to `authorType: 'unknown'`: the bot rule's `authorType` case never
    fires there, a bot comment from an account no entry names counts as human and holds the guard –
    its login is neither configured nor this run's own – and an entry spelled `X[bot]` matches no
    bare Forgejo login at all, leaving that reviewer permanently **not started** and blocking Phase-4
    condition 5. The fail-safe direction is correct; on Forgejo it is the only direction.
  - **The conflict-resolution path has no entry point there.** Forgejo reports no merge state, so
    neither `BEHIND` nor `DIRTY` is ever observed, and `mergeable: false` is deliberately reported as
    unstated rather than as `CONFLICTING`. Step 1's forward merge is therefore reached only when
    something else brings the run to it, and a genuine conflict surfaces as a bounded loop that ends
    in a report rather than as the fast conflict path – stated so it is not later read as an
    oversight.
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

- Perform **no** `git commit` and **no** push other than the two kinds of base-into-head merge that
  Phase 2 step 1 allows – the clean one and the conflict-resolving one. Delegate every other code
  change to `{{SKILL:iterate}}`.
- Never rewrite the head branch's history: no `commit --amend`, no rebase, no squashing of its
  commits, no force-push. The forge-side `delivery.mergeMethod` – including `squash` and `rebase` –
  is the integration of the pull request in Phase 5 and is not covered by this rule. A conflict is
  resolved inside the forward merge or not at all; a resolution that would need a rewrite is
  reported.
- Resolve a conflict only through `{{AGENT:merge-conflict-resolver}}`, never inline, and only when
  `mergeGate.conflictResolution` allows it: `off`, and `ask` in a non-interactive delegated run,
  make no commit and no push and report. Never commit a resolved tree that
  `{{AGENT:code-validator}}` did not verify, and never commit a modified path the worker's own record
  does not name and justify – an **adjacent** path is justified only by a named check carried with
  its verbatim pre-change failure output.
- **Never treat an unverified resolution as a verified one.** A resolution whose two verification
  layers together executed **no** check at all, or whose verdict is anything other than an
  affirmative pass, is treated exactly as `ABORT`: abort the merge, report that the resolution could
  not be verified and which checks did not run, and push nothing. An unprovable verification is never
  an assumed pass, as no unprovable condition is anywhere in this workflow.
- Leave no checkout mid-merge: every controlled stop on the conflict path aborts the in-progress
  merge and transitions the lifecycle record to `aborted`; an error transitions it to `failed`.
  Never end a run leaving an `active` record behind.
- Make **one** resolution attempt per round. There is no retry loop inside the step; a conflict that
  survives is reported, and `mergeGate.maxRounds` bounds how often the run returns to it.
- Never approve a pull request and never request changes, not even to unblock a merge.
- Evaluate the guard in Phase 1's order – bot authorship first, then the item's login against this
  run's own authenticated login – and count everything else as human. The guard's **exclusions** read
  authorship only: no exclusion rule reads a body, and none reads a thread's resolution state. A
  thread's `resolved` state decides one thing and nothing else – whether that thread is open at all –
  never whether an item inside it is excluded, so an item another account wrote into a resolved
  thread counts like any other. This workflow writes no Effective Flow marker of its own either, so no
  marker anywhere on the pull request is evidence about anything here.
- Never let an unprovable identity clear the guard. A failed, unsupported, or login-less
  `viewer-read` makes every remaining non-bot item count, which activates the guard wherever such an
  item exists and leaves a pull request without one unblocked; report the missing identity as the
  reason. The identity is never consulted for an item rule 1 already excluded.
- Write nothing into the thread of a bot finding this run did not implement – no reply, no
  resolution. Name it in the chat summary instead. The trigger comment is this workflow's only own
  write **onto the pull request's discussion**, and suppressing the delegated run's summary comment
  keeps it the only item a gate-initiated run can leave there – at most one, since a bot observed as
  **running** gets no trigger at all. The head **branch** is a different surface: the two kinds of
  base-into-head merge are bounded by "Git write boundary" and by the rule above, never by this one.
- Announce `Summary comment: suppressed`, `Review guard: established`, and `Next steps: suppressed`
  in every delegation, each on its own line and in exactly that literal form, and never delegate
  without any of them.
- Take every bot's state from the loaded "Automatic reviewer state" and never treat an unprovable
  state as **has run**; an unprovable precondition blocks the merge. Trigger only a bot that has
  **not started**, never one that is **running** – a mention aimed at a reviewer already working
  costs the run in flight or queues a redundant one.
- Read the pull-request status, threads, and comments fresh before every write and before the merge.
- Ask the entry gate exactly once, at the start. A configured `mergeGate.completion` of `merge` or
  `report` is used unchanged in every run state; only `ask` or an unset key in a non-interactive
  delegation behaves as `report`.
- `report` withholds the merge and nothing else: repairs, the conflict resolution with its pushed
  merge commit, the bot trigger for a bot that has **not started**, and the delegated
  `{{SKILL:iterate}}` rounds still run.
- Never fall back to a prompt-driven poll loop when a wait times out; report and ask once.
- Never exceed `mergeGate.maxRounds`, never reset the counter, and never jump backwards inside a
  round – a repeated wait, a repair, a Phase-2 restart from the bot round, and a Phase-4 return into
  Phase 3 each consume a round.
- Post no summary comment of your own; the run summary goes to the user in chat.
- Never set a `Co-Authored-By` trailer and add no AI attribution in the merge commit, in trigger
  comments, or in any other published text.
- Do not start project validation such as linting, tests, or builds yourself; the pull request's own
  checks are the criterion, repairs run through `{{SKILL:iterate}}`, and the two verifications of a
  resolved merge conflict run inside `{{AGENT:merge-conflict-resolver}}` and
  `{{AGENT:code-validator}}` – delegated roles, never a command this workflow runs.
- Give the user a brief status update after each phase.
- On a missing or unauthenticated CLI: abort cleanly and perform no local side effects.
