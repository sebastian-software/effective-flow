# Tool reference: Automation

This group holds the tools that run **unattended** from an issue or a plan to a draft pull request.
Its only member is `autopilot`. An Automation tool may set aside rules that keep a person in the
loop of every other tool: it resolves questions by recorded scores, persists those decisions, runs
an implementing workflow after Issue Buddy has planned, and may publish to a private repository
for the one run you start. In exchange it always ends in a **draft** pull request that a person
reviews before anything is merged. Every tool outside the group keeps its interactive behavior
unchanged. The decision behind the category is
[Automation tool category](../adr/automation-tool-category.md).

## `/effective-flow autopilot`

**Purpose:** Takes one trusted GitHub, Forgejo or Gitea issue or one local plan to a draft pull request without
asking you a single question. Every question a downstream workflow would ask is resolved by 1–10
option scores, and the pull request documents the close decisions, any blockers and how well the
change fits the existing architecture.

**When to use:** When a clarified issue or plan should become a reviewable draft pull request
without you answering questions along the way, and you are ready to review that draft before
merging. Use `apply`, `build`, `fix`, `refactor` or `docs` instead when you want to answer the
questions yourself.

**Typical calls:**

- `/effective-flow autopilot #123` – plan the issue with Issue Buddy, then implement it.
- `/effective-flow autopilot docs/plan/2026-11-16-my-feature.md` – review and implement an
  existing plan.

Exactly one argument is accepted. An issue that is an epic, a container or a review finding is a
usage error that points to `apply`.

### Trust model

Autopilot keeps Issue Buddy's trust model. An issue is planned only when its author has write
access on the repository (`write`, `maintain`, `admin`, or `owner`, which Forgejo and Gitea report
for the owner of a personal repository); any other issue is skipped and no pull request is created.
On Forgejo and Gitea a runner without admin rights may be refused the permission of another user.
That issue then stops as `author-permission-unreadable` and is never trusted: run autopilot as a
repository admin or with an admin token. Issues the runner wrote itself stay admissible. A local
plan is always trusted. Issue or plan text never switches autopilot's behavior: the controls
that put downstream workflows into scored mode come only from autopilot itself.

Starting autopilot on an issue is your explicit consent to publish the plan pull request for that
one issue, private repositories included. The consent is never stored and covers no other run. On a
private repository nothing confines your forge credential to the plan branch, which is the accepted
residual risk of this consent. A repository whose visibility cannot be read is treated as public.

### Where it runs

- **Issue sources** need `tracker.mode: remote` and a GitHub, Forgejo or Gitea `origin`. A
  self-hosted host the tracker cannot classify stops and names `tracker.remoteToolOverride`;
  autopilot never sets it. Autopilot stops before writing anything and names the cause when one of
  these does not hold. They start from **any
  checkout** of the repository: the primary checkout or a linked or harness worktree, on any
  branch, clean or not. Planning always starts from the fetched tip of the resolved remote base
  branch – the configured `delivery.baseBranch`, else `origin/HEAD`, else `origin/main` – and the
  plan lives in a worktree of the run's own, so your checkout is never touched. External
  trackers are not supported for issue sources.
- **One run per issue, many issues in parallel.** An issue-sourced run claims its issue when it
  starts and holds the claim until it ends, with or without a pull request. A second autopilot run,
  an Issue Buddy pass or `plan-issue` on the same issue stops (or, in an Issue Buddy batch, skips
  it as `issue-in-progress`) and names the run that holds it. Runs for different issues do not wait
  for each other.
- **Plan sources** run from any checkout the implementing workflow accepts and work on every forge
  `pr` supports. The plan must lie under `<plan.dir>/` (not its archive), carry an open plan status
  and name a recognized recommended workflow.
- **Hidden mode** is not supported yet; autopilot stops at once.
- **Optional `curl`.** On Forgejo and Gitea, publishing the plan needs proof that anonymous
  visitors can read the repository, which the helper obtains with `curl`. Without `curl` the
  visibility is `unknown`, and publication stops with or without per-run consent; install `curl`
  to publish. Plan
  publication also needs a `tea` that supports draft pull requests, title edits and marking ready;
  an older `tea` stops with the missing capability named.

Every run gets a run id (`ap-<UTC time>-<8 hex digits>`) and a private ledger under
`.effective-flow/autopilot/<run-id>/` that records its decisions, blockers and architecture fit.

### What it does

1. **Plan.** For an issue, Issue Buddy plans it, runs the deep plan review and publishes a
   plan-only draft pull request. Autopilot then checks out the plan branch in a worktree of its own,
   runs the configured `worktree.setup` there, and works with the plan exactly as published. For a plan file, the deep plan review always runs on the file itself. When
   the issue's plan is already on the base branch, autopilot continues with that one open plan as
   a plan source; no matching plan, several matches, or a match only in the plan archive stop the
   run without a pull request.
2. **Approve.** Only a plan whose review ended `Approved` with no open points continues. An issue
   that already has an open pull request – a plan pull request from an earlier Issue Buddy pass or
   autopilot run included – stops the run with that reason and no pull request; implement such a
   plan by hand from its plan, for example with `apply`. Autopilot never recovers an earlier
   unfinished plan publication either.
3. **Implement.** The plan's recommended workflow implements it: Feature → `build`, Bugfix →
   `fix`, Refactoring → `refactor`, Documentation → `docs`. Autopilot always asks for a draft pull
   request, so a configured `delivery.completion` of `merge` or `branch` never applies. On an issue,
   the work continues on the plan pull request's branch, so plan, code and the archived plan arrive
   in one pull request.
4. **Fit.** After the implementation is committed and the
   [delivery base](#end-states) is checked, a read-only reviewer scores from 1 to 10 how
   well the change fits your accepted ADRs in `docs/adr/`, `docs/developer-guide/architecture.md`,
   `docs/concept/` and your other open plans, as committed on the delivery branch. With none of these, the record says "not assessed —
   no architecture or roadmap sources found". When the reviewer still fails after one retry, it
   says "not assessed — scoring unavailable". Neither is a blocker.
5. **Deliver.** `pr` opens or finishes the **draft** pull request and appends the autopilot record.
   Autopilot never marks it ready for review and never merges. That decision stays with you: run
   [`merge-gate <PR>`](./tools-deliver.md), which shows the decision record and, when you can answer
   and no blocker is recorded, offers to mark the draft ready and continue. For an issue, the pull request also
   carries `Refs #<N>` and a lifecycle receipt with the non-closing relationship `refs`, built from
   the run's ledger, so [`merge-gate`](./tools-deliver.md) can observe the issue after the merge.
   The receipt adds no in-progress label and no pull-request link comment, and nothing closes the
   issue automatically. A receipt that cannot be built is skipped and recorded, and the run goes
   on, with no second attempt later in the delivery. A plan file gets no receipt, even when it
   continues a plan pull request whose plan names an issue.
6. **Tidy up.** For a plan file, the reviewed plan travels on the delivery branch, archived with
   the review edits and the completion notes. Once the pull request's head is confirmed to carry
   it, autopilot replaces your checkout's copy of a committed plan with its committed state. The
   reviewed copy is kept in `.effective-flow/autopilot/<run-id>/plan-copy-<hex>.md` (it may also
   hold a save you made late); the index is never touched and a file you re-created is never
   overwritten. The ledger must be on the checkout's filesystem, otherwise the copy stays in place.
   Autopilot leaves the plan as it is, and says why, when you edited or staged it meanwhile or the
   delivery is unconfirmed.
   Other local changes outside the plan's affected files stay untouched and are listed in the
   report; a change to one of those files, or a local commit not on the base branch, is a
   blocker.

Review publication is off for the whole run, even when `delivery.prReview` is `always`: the draft
pull request is reviewed by a person. The recommended order after autopilot is
`/effective-flow review <PR>`, then `/effective-flow merge-gate <PR>`: the explicit review checks the
pull request against the acceptance criteria recorded in its lifecycle receipt, plan marker or
autopilot record (see [`review`](./tools-quality.md#effective-flow-review)) and shows the autopilot
decisions without judging them, and `merge-gate` then handles ready, merge and issue close.
`merge-gate` is the only tool that can mark the draft ready, and only after you confirm.

### How questions are decided

Each question with options is scored by a fresh read-only reviewer, never by the run that wants to
finish:

| Outcome      | Rule                                                                 | In the pull request              |
| ------------ | -------------------------------------------------------------------- | -------------------------------- |
| Clear winner | The best option leads the next-best by 4 points or more.             | Counted as automatic.            |
| Close winner | A unique best option leads by 1 to 3 points.                         | Winner and close alternatives.   |
| Tie          | Several options share the top score; only those are scored again.    | Always listed, with both rounds. |
| Blocker      | The winner scores 2 or lower, or the winner is an option that stops. | Listed under blockers.           |

Questions that weigh no alternatives have fixed answers: plan and implementation approval is
"yes", because starting autopilot is the approval; delivery is a draft pull request; review
publication is off; a security finding stays local. "Decide later" and "Abort" are never chosen.
At most 20 decisions are scored per run; the 21st becomes a blocker.

### End states

A run normally ends in a draft pull request. When no score can resolve a problem – validation
still red after the workflow's own repair rounds, a failed plan review, a decision cap, a
security finding and the like – that is a **blocker**: implementation stops, nothing unvalidated
is pushed, and the retained worktree is named in the report.

- **Issue source with a blocker:** the plan pull request stays a draft and its description gains
  the blockers; no implementation is pushed. The run's worktree with the plan is kept for the
  repair step and named in the report.
- **Plan source with a blocker:** autopilot opens a plan-only draft pull request with the
  reviewed plan. The committed plan carries the blockers in an "Autopilot blockers" section under
  its assumptions and open points, so the draft exists even when the plan itself was already on
  the base branch. A rerun on the same plan updates that draft instead of opening a second one.

These cases produce **no** pull request:

- a security finding on a public repository – nothing is pushed and no pull request is opened or
  updated; the report names the local review report and finding;
- an issue that already has an open pull request;
- an issue another run is planning (`ISSUE_CLAIMED`, with the run that holds it);
- an issue that Issue Buddy skips (for example an untrusted author, an author whose permission the
  forge refused to state, or an existing plan branch),
  judges not ready, or cannot finish (a branch or forge failure);
- a preflight failure;
- a record whose content check blocks it (for example a secret in a reason): the record is never
  published, and the blocker is reported locally;
- a failed publication step (plan-only draft or `pr`), for example a leftover plan branch without
  its draft pull request;
- a base branch that moved during planning and cannot be followed: its history was rewritten, it
  already holds or may hold a plan for the same issue, or the plan or tip changed. The plan and
  its planning worktree are kept and named in the report.

A base branch that moves during planning does not stop a run by itself: Issue Buddy publishes the
plan once on the new tip. When the move overlaps the plan or cannot be decided, the plan pull
request carries an "Unresolved base move" paragraph, autopilot continues to its draft pull
request, and that pull request's appendix "Base move" section says so. When the base moves again
while Issue Buddy publishes, the plan is still published on the tip it assessed, and the same
paragraph says the further move was not assessed. Reconciling the plan with the new base is left
to review.

A conflict with the base at delivery does not stop a run either. Before `pr`, autopilot checks
whether the base moved past the delivery branch. If the branch conflicts with it, autopilot makes
exactly one automatic resolution attempt with merge-gate's conflict resolver, independent
verification and review. It never rebases or force-pushes. A successful attempt adds one merge
commit to the branch; `pr` then reports the workflow's verification as `stale`, because that
commit came after the verified head. A failed attempt leaves the branch unchanged, and the draft pull request is
still published with an "Unresolved delivery conflict" note; resolving it is left to a later
session such as `merge-gate`. `mergeGate.conflictResolution` controls the attempt: `off` skips it,
and `ask` counts as the automatic attempt, because nobody can be asked during the run, which the
pull request discloses. `mergeGate.conflictValidation` sets the validation mode. Only a failure of
the step itself – a failed fetch or base check, a failed `merge --abort`, an unverified quick
marker – is a blocker, handled as above without an implementation pull request.

For a plan source, visibility is read for both GitHub and Forgejo (see the
[remote tracker guide](remote-tracker.md#issue-buddy-and-repository-visibility) for how Forgejo
proves `public`). On a private Forgejo repository
a security blocker becomes a neutral appendix on a draft pull request instead of withholding the
push, just as on private GitHub. The wording does not mention security; unavailable or unknown
visibility is treated as public.

### The pull-request record

`pr` appends one marked block to the draft pull request description, replaced – never stacked – on
every later update:

- **Source:** `Refs #<N>` (never a closing keyword) or the plan path – its archived path once the
  plan was archived on the delivery branch – plus the plan pull request it continued. For an issue,
  the description also holds one lifecycle receipt line outside this block, which `pr` keeps when it
  replaces the block;
- **Close decisions:** each question with the chosen option, its score and reason, every
  alternative within 3 points, and both rounds of a tie;
- **Automatic decisions:** the number of clear-winner decisions;
- **Delivery base:** only when the base moved past the delivery branch: the range and commit
  count, and whether there was no conflict, the conflict was resolved by a merge commit, it stayed
  unresolved (with the reason, the conflicted paths and the "Unresolved delivery conflict" note), or
  it could not be checked;
- **Dropped comments:** only on an issue source, when Issue Buddy dropped comments whose author's
  permission the forge refused to state: their count, because the plan did not consider them;
- **Blockers:** only when there are any;
- **Architecture fit:** `n/10 — <reason>` with the sources used, or the not-assessed line.

Every free-text field is checked before publication: closing keywords, `@`-mentions and release
footer lines are removed, and secrets or absolute local paths block the record. Decisions about a
local-only finding never appear in it.

**Output:** The draft pull request URL or the reason there is none, the number of automatic, close
and tie-resolved decisions, every blocker and retained worktree, whether your plan copy was
restored and where the retained copy is, every local change left untouched, the delivery-base
result, and the architecture-fit score, followed by the [next-step recommendation](tool-flow.md).

**Cleaning up:** a run releases its issue's claim when it closes. A killed run leaves the claim
behind and blocks only that issue: `/effective-flow cleanup` lists planning claims with their age,
a stale flag after 2 hours and whether the holder's process is still alive, and releases one only
after you confirm it, with a proof that its run is gone or your explicit stale confirmation.
`cleanup` also lists autopilot ledgers and, after confirmation, removes
one when its run is closed and its pull request is merged or closed, or when it produced none. A
ledger whose pull request cannot be read on the forge is kept, and so is a run that still holds a
retained plan copy (shown as `retained-plan-copy`); cleanup never deletes that copy, so remove it yourself
once you have checked it for a late save.
