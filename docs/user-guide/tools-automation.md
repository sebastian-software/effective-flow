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

**Purpose:** Takes one trusted GitHub issue or one local plan to a draft pull request without
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

Autopilot keeps Issue Buddy's trust model. An issue is planned only when its author has `write` or
`admin` permission on the repository; any other issue is skipped and no pull request is created. A
local plan is always trusted. Issue or plan text never switches autopilot's behavior: the controls
that put downstream workflows into scored mode come only from autopilot itself.

Starting autopilot on an issue is your explicit consent to publish the plan pull request for that
one issue, private repositories included. The consent is never stored and covers no other run. On a
private repository nothing confines your forge credential to the plan branch, which is the accepted
residual risk of this consent. A repository whose visibility cannot be read is treated as public.

### Where it runs

- **Issue sources** need the **primary checkout** of the repository – not a linked or harness
  worktree – with `tracker.mode: remote`, a GitHub `origin`, a clean tracked tree and index, no Git
  operation in progress, and `HEAD` at the tip of the base branch. Autopilot stops before writing
  anything and names the cause when one of these does not hold. Forgejo and external trackers are
  not supported for issue sources yet.
- **Plan sources** run from any checkout the implementing workflow accepts and work on every forge
  `pr` supports. The plan must lie under `<plan.dir>/` (not its archive), carry an open plan status
  and name a recognized recommended workflow.
- **Hidden mode** is not supported yet; autopilot stops at once.

Every run gets a run id (`ap-<UTC time>-<8 hex digits>`) and a private ledger under
`.effective-flow/autopilot/<run-id>/` that records its decisions, blockers and architecture fit.

### What it does

1. **Plan.** For an issue, Issue Buddy plans it, runs the deep plan review and publishes a
   plan-only draft pull request. Autopilot then restores the plan file locally, byte for byte from
   the plan branch. For a plan file, the deep plan review always runs on the file itself. When
   the issue's plan is already on the base branch, autopilot continues with that one open plan as
   a plan source; no matching plan, several matches, or a match only in the plan archive stop the
   run without a pull request.
2. **Approve.** Only a plan whose review ended `Approved` with no open points continues. When the
   issue already has a plan pull request – exactly one draft from this repository whose branch
   changes only the plan – autopilot continues on it instead of planning again, and its recorded
   review result is binding: the plan is not reviewed a second time. Any other open pull request
   for the issue stops the run.
3. **Implement.** The plan's recommended workflow implements it: Feature → `build`, Bugfix →
   `fix`, Refactoring → `refactor`, Documentation → `docs`. Autopilot always asks for a draft pull
   request, so a configured `delivery.completion` of `merge` or `branch` never applies. On an issue,
   the work continues on the plan pull request's branch, so plan, code and the archived plan arrive
   in one pull request.
4. **Fit.** After the implementation is committed, a read-only reviewer scores from 1 to 10 how
   well the change fits your accepted ADRs in `docs/adr/`, `docs/developer-guide/architecture.md`,
   `docs/concept/` and your other open plans, as committed on the delivery branch. With none of these, the record says "not assessed —
   no architecture or roadmap sources found". When the reviewer still fails after one retry, it
   says "not assessed — scoring unavailable". Neither is a blocker.
5. **Deliver.** `pr` opens or finishes the **draft** pull request and appends the autopilot record.
   Autopilot never marks it ready for review and never merges.
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
pull request is reviewed by a person, and `merge-gate` is the next step.

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
  the blockers; no implementation is pushed. The restored plan file stays in your checkout for the
  repair step.
- **Plan source with a blocker:** autopilot opens a plan-only draft pull request with the
  reviewed plan. The committed plan carries the blockers in an "Autopilot blockers" section under
  its assumptions and open points, so the draft exists even when the plan itself was already on
  the base branch. A rerun on the same plan updates that draft instead of opening a second one.

These cases produce **no** pull request:

- a security finding on a public repository – nothing is pushed and no pull request is opened or
  updated; the report names the local review report and finding;
- an issue that Issue Buddy skips (for example an untrusted author or an existing plan branch),
  judges not ready, or cannot finish (a held lock, a branch or forge failure);
- a preflight failure;
- a record whose content check blocks it (for example a secret in a reason): the record is never
  published, and the blocker is reported locally;
- a failed publication step (plan-only draft or `pr`), for example a leftover plan branch without
  its draft pull request.

On a private repository a security blocker is listed in the pull request with neutral wording that
does not mention security.

### The pull-request record

`pr` appends one marked block to the draft pull request description, replaced – never stacked – on
every later update:

- **Source:** `Refs #<N>` (never a closing keyword) or the plan path – its archived path once the
  plan was archived on the delivery branch – plus the plan pull request it continued;
- **Close decisions:** each question with the chosen option, its score and reason, every
  alternative within 3 points, and both rounds of a tie;
- **Automatic decisions:** the number of clear-winner decisions;
- **Blockers:** only when there are any;
- **Architecture fit:** `n/10 — <reason>` with the sources used, or the not-assessed line.

Every free-text field is checked before publication: closing keywords, `@`-mentions and release
footer lines are removed, and secrets or absolute local paths block the record. Decisions about a
local-only finding never appear in it.

**Output:** The draft pull request URL or the reason there is none, the number of automatic, close
and tie-resolved decisions, every blocker and retained worktree, whether your plan copy was
restored and where the retained copy is, every local change left untouched, and the
architecture-fit score, followed by the [next-step recommendation](tool-flow.md).

**Cleaning up:** `/effective-flow cleanup` lists autopilot ledgers and, after confirmation, removes
one when its run is closed and its pull request is merged or closed, or when it produced none. A
ledger whose pull request cannot be read on the forge is kept, and so is a run whose retained plan
copy changed since review (shown as `retained-plan-copy`).
