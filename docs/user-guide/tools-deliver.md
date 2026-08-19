# Tool reference: Deliver changes

This group brings finished changes into the repository and all the way to the merge:
`commit` creates a commit, `pr` opens a pull request from it, and `merge-gate` drives that pull
request to merge-readiness and, if allowed, merges it. `commit` and `pr` deliberately run **no**
project validation of their own (linting, tests, build checks) – the implementation tools and their
model-configured validation/test workers are responsible for that, applying central
`software-validation` and `software-testing` guidance when available. `merge-gate` starts no local
validation of its own either; it waits for the checks the forge reports and has failures repaired by
`/effective-flow iterate`. The one thing it has verified locally – a merge conflict it resolved – is
checked inside delegated workers, never by a command the gate runs itself.

## `/effective-flow commit`

**Purpose:** Creates a descriptive commit message for already **staged** changes and
executes the commit via `git`. Commits exclusively what is already `git add`-staged.

**When to use:** When only the currently staged changes are to be committed, with an
appropriate conventional-commit message.

**Typical call:** `/effective-flow commit`

**Input/output:** Input is the staged diff. Output is a commit with a
conventional-commit prefix (`feat:` new functionality, `fix:` defect fix, `chore:`
maintenance, `docs:` documentation, `refactor:` structural improvement without behavior change,
`test:` test change), description in `language.git`, without `Co-Authored-By` lines. The type and
other Conventional-Commit syntax remain English and language-stable.

**Interplay:** Typically used at the end of a `/effective-flow build`, `/effective-flow fix`,
`/effective-flow refactor`, `/effective-flow docs`, or `/effective-flow maintain` run (which follow these
commit rules internally as well), or standalone for manually staged changes.
Respects existing Husky hooks (commitlint, prettier, lint); if they fail, `commit`
briefly relays the cause instead of bypassing the hooks. With multiple unrelated
topics in the staged diff, it suggests splitting first.

## `/effective-flow pr`

**Purpose:** Creates or reuses a pull request from a local branch – or via a freshly created
delivery branch – on the detected Git host: GitHub via `gh` or
Forgejo via `tea`. Detects the host automatically from the `origin` URL, pushes the branch if
needed, derives the title and description for a new pull request, and restores the checkout after
a successful creation or reuse.

**When to use:** When finished changes on a branch are to be submitted as a pull request for
review, instead of merging them directly.

**Typical call:** `/effective-flow pr`

**Input/output:** Input is the head branch (default: currently checked-out branch) and the
base branch (default from `delivery.baseBranch`, legacy fallback `worktree.baseBranch`, otherwise
`main`). Output is the PR URL, the branch name, and the final local checkout state.

**Existing pull requests:** After pushing the branch, `pr` queries the detected host for open
pull requests and exact-matches both the requested head and base branches. Exactly one match is
reused without changing its title or description; the workflow then follows the same checkout
restoration and reporting path as a newly created pull request. Pull requests with another base,
closed or merged pull requests, and other non-matches are ignored. A failed or unparseable lookup
or multiple exact matches stops the workflow without attempting creation or guessing.

**Conventional-commit title:** `pr` enforces a PR title with a valid conventional-commit type
(`feat:`, `fix:`, `docs:`, `refactor:`, …), derived from the **effect** of the change or the
triggering workflow; an already valid, self-set title is preserved. This is
important because repositories with **squash merge** adopt the PR title as the subject of the single commit on
the target branch: there, the PR title is part of the release contract, and
**release-please** derives the version bump from it. An untyped title leads, despite green
CI, to a silent no-op release (no version, no delivery) – which is why `pr` normalizes
the title and asks only in cases of genuine ambiguity.

The title description follows `language.git` because a squash merge may make it the commit
subject. The PR body and subsequent PR or review-thread comments follow `language.forge`. These
may intentionally differ without producing a mixed artifact: each surface uses one resolved
language, while types, branch names, paths, labels, and other machine-facing tokens stay stable.

**Interplay:** `pr` is one of the three possible completion actions
(`delivery.completion: pr`) that `/effective-flow build`, `/effective-flow fix`, `/effective-flow refactor`,
`/effective-flow docs`, and `/effective-flow maintain` can trigger at the end of their delivery/worktree handback
– alongside `merge` and `branch`. But `pr` can also be called standalone, e.g. to
open an already-prepared delivery branch as a PR after the fact. For details on
delivery branch and completion actions, see [Worktree and delivery](worktree-and-delivery.md);
for the associated config keys, see [Configuration](configuration.md).

## `/effective-flow merge-gate [<PR reference>]`

**Purpose:** Shepherds an already-open pull request from "open" to "merged". `build`, `pr`, and
`review` create a pull request and can publish findings onto it, and `iterate` feeds review notes
back into it as new commits – but none of them decides when a pull request is genuinely ready and
presses merge. `merge-gate` owns exactly that gap. It resolves the pull request, asks once whether
the run may merge at the end or only report merge-readiness, then drives an ordered gate:

1. **Check gate** – waits for pending checks and, once they complete, repairs any failure by
   delegating to `/effective-flow iterate`. A branch that has fallen behind its base is brought
   forward with a merge commit, and a branch that **conflicts** with its base is brought forward by
   the same merge with its conflicts resolved inside it – see
   [Resolving a conflict with the base](#resolving-a-conflict-with-the-base).
2. **Automatic-reviewer round** – for each configured bot (Greptile and comparable tools),
   establishes whether it is still running, has not started, or has already run for the current
   head, triggers only the ones that have not started, waits, and then delegates their findings to
   `/effective-flow iterate`, which fixes the valid ones, replies, and resolves the threads. See
   [Three reviewer states, not two](#three-reviewer-states-not-two).
3. **Human-comment guard** – if any unresolved comment or thread was written by an account that is
   **neither a bot nor the one the run is authenticated as**, the run implements no review note and
   merges nothing. That is what "human" means here: the guard decides on the author record alone. A
   comment from the gate's own account never holds it – including, in the usual manual mode, a
   comment you typed yourself – and neither does an item whose author the forge reports as a bot
   account, on either surface and whether or not that bot is listed in `mergeGate.bots`, so a CI,
   coverage, or dependency bot commenting on the pull request does not block the merge either. CI
   repair stays permitted even when the guard is active, and so does the repair of a conflict with
   the base. A bot finding the run assesses but does not implement – because the guard is active, or
   because the finding was rejected – gets no thread reply at all: it is named in the run's chat
   summary instead, and the thread is left untouched and unresolved. See
   [Recognizing its own writes across runs](#recognizing-its-own-writes-across-runs).
4. **Merge** – only once every precondition holds (all checks green, the forge reports the pull
   request mergeable, the human guard is inactive, every configured bot has run, and every one of
   their open threads has actually been looked at by this run), the run merges with the configured
   merge method, guarded by the expected head commit. A reviewer thread that turned up after the
   round that handled its reviewer sends the run back for another round instead; see
   [A reviewer thread that arrives late](#a-reviewer-thread-that-arrives-late).
5. **Linked-issue observation** – after a confirmed merge, validates the pull request's lifecycle
   receipt and gives tracker automation one fixed 30-second grace period. It reports each linked
   issue as terminal, open, timed out, or unobservable. A terminal forge issue loses the
   `effective-flow-issue-in-progress` label, and a recorded native sub-item or checklist entry is
   completed only after its linked issue is observed terminal.

**When to use:** On a pull request that is otherwise done and only needs CI to pass, its automatic
reviewers to be satisfied, and the merge button pressed – so you do not have to babysit checks and
bot notes by hand. Also useful as a pure merge-readiness report: run it in report mode to see
exactly what is still blocking a pull request. Re-enter it with an already merged PR when a linked
issue was still open, timed out, or could not be observed. That observer-only path skips checks,
reviewers, branch writes, and merge, then validates the receipt and repeats only post-merge issue
observation and eligible reconciliation.

**What it never does:** It never reviews. It produces no findings of its own, never approves a pull
request or submits a "request changes" review, never rewrites history (no amend, rebase, squash, or
force-push of the head branch – a branch behind or in conflict with its base is only ever brought
forward with a merge commit, and a conflict that could only be resolved by rewriting history is
reported instead), and never merges past an open comment from an account that is neither a bot nor
the one it runs as. It implements no code itself: CI repairs and bot-finding fixes are delegated to
`/effective-flow iterate`, and a merge conflict is delegated to a dedicated resolver worker. The gate
itself only ever writes that one merge commit and pushes it.

It also never force-closes a linked issue and never treats PR prose as a substitute for a valid
lifecycle receipt. A missing, malformed, duplicated, or mismatched receipt leaves the merge result
unchanged and authorizes no tracker access. Post-merge tracker failure likewise cannot roll back a
successful merge.

#### Resolving a conflict with the base

A pull request whose head branch conflicts with its base used to end the run: the gate reported the
conflict and stopped. It now repairs that conflict with the **same** operation it already used for a
branch that had merely fallen behind – merging the base into the head branch – with the conflicts
resolved inside that merge. The result is one ordinary merge commit, pushed normally. Nothing is
rebased, squashed, amended, or force-pushed, and a resolution that would need any of those to succeed
is reported instead of performed.

What the run does with a conflict:

1. **Resolves it in a delegated worker.** The gate provisions a checkout, starts the merge, and hands
   the conflicted files to a dedicated resolver. That worker classifies each conflicted file's risk,
   regenerates generated and lock files from their source rather than merging their text, and removes
   every conflict marker. Where the two sides make contradictory statements that cannot be reconciled
   without a new product or architecture decision, it **aborts and names the contradiction** rather
   than guessing – uncertainty never resolves into a merge commit.

   **"Preserve both sides" covers _additive_ changes only.** Two independent additions to the same
   region both belong in the result, and dropping one because the other is newer would be a silent
   behavior loss. It never authorizes reinstating something one side deleted: a deletion is a
   decision, not an omission, and deliberately removing a vulnerable code path is a common shape of
   a security fix.

   **Not every conflict is a content conflict, and the rest have their own rules.** A delete/modify
   conflict – one side deleted the file, the other changed it – is high-risk by definition and
   defaults to an abort; it is resolved only where the deleting side's own commit establishes the
   intent of the deletion, and that evidence is stated in the report. Two sides that independently
   created the same path are treated as a high-risk conflict between two whole files, never
   concatenated. A rename that also changes content, a binary file, a submodule, and a symlink are
   aborts outright: the conflicted value is a decision, not something a merge can compute.

2. **Verifies the result twice, before anything is committed – and fails closed.** The resolver runs
   the repository's own checks on the resolved tree, and the gate then has that same uncommitted tree
   checked independently by its validation role, in that role's `full` mode. `full` is what honours a
   repository-mandated combined or top-level gate, and it is used here because this merge commit has
   no other pre-commit check standing behind it. The resolution counts as verified only when the two
   layers **together executed at least one** of the repository's own checks and every executed check
   passed. A failing verdict from either role, a verdict that is not an affirmative pass, and a run in
   which every applicable check came back skipped are all treated exactly as an abort: the merge is
   aborted, nothing is pushed, and the run reports every check that did not run. A disagreement
   between the two roles is never a tie broken in the merge's favour. CI remains the final criterion
   afterwards, and a failure it catches is repaired through `/effective-flow iterate` as before.
3. **Reports it file by file – and that report is what a human audits.** The run's chat summary names
   every conflicted file with what was done to it, and every non-conflicted file the resolver had to
   touch to make a **named** failing check pass, with that check and its failure output as it
   appeared verbatim **before** the change. That allowance exists because a conflict routinely makes
   an adjacent test or caller stale without Git ever marking it conflicted; it never covers an
   improvement made in passing. Be precise about what the gate enforces: it refuses to commit a
   modified file the resolver did not name, and it refuses an adjacent file named without that
   verbatim pre-change failure output – but it does **not** re-run the check. The bound is a
   disclosure requirement plus a presence check on the evidence, and whether the named failure
   genuinely justified the change is what the report leaves for a human to judge.

Three details worth knowing:

- **The human-comment guard does not block the resolution.** A conflict with the merge target is an
  objective defect of the branch, not a position a reviewer is negotiating, so the resolution runs
  even while an open comment from someone else blocks everything else. What the guard keeps blocking
  is unchanged: review-driven implementation and the merge itself.
- **Completion mode `report` does not withhold it either.** `report` withholds exactly one action:
  the merge of the pull request in the final phase. A `report` run therefore still resolves a
  conflict and pushes that one merge commit. That is deliberate – a `report` run would otherwise
  report the same conflict forever. `mergeGate.conflictResolution: off` is the switch for a run that
  makes no commit and no push at all.
- **One attempt per round.** There is no retry loop inside the step, and `mergeGate.maxRounds` bounds
  how often a run can come back to it – which, under `ask`, is also how often one run may pose its
  question, since that question is asked once per conflicted round rather than once per run. On any
  controlled stop – `off`, an unanswered question, an abort from either verifying role, a
  verification that executed no check at all – the in-progress merge is aborted so the checkout is
  left clean, and nothing is pushed.

**The head branch is untrusted input.** The gate operates on any open pull request, including one
whose head branch lives in a fork this repository does not control, and the resolver discovers the
validation commands above from files that branch supplies – scoped instructions, CI workflows, task
runners, manifests, package scripts – then executes them in the provisioned checkout with full
filesystem and network access. Under the default `auto` this happens automatically, with nobody
asked. A project that gates pull requests it does not trust should set
`mergeGate.conflictResolution: ask`, so a human authorizes every resolution, or `off`, so no
untrusted branch's commands are executed by this gate at all.

Whether the gate may do this at all is `mergeGate.conflictResolution` (default `auto`); see
[Block `mergeGate`](configuration.md#block-mergegate). On Forgejo this path has no entry point:
the forge reports no merge state at all, so neither `BEHIND` nor `DIRTY` is ever observed there, and
a genuine conflict surfaces as a bounded loop ending in a report rather than as the fast conflict
path.

#### Three reviewer states, not two

For each configured reviewer the gate establishes one of three states, and it treats them
differently:

- **Running** – a check context configured as `mergeGate.bots.<login>.check` is in a non-terminal
  state. The gate waits for it and posts **no** trigger comment: the reviewer is already working,
  and a trigger would either queue a redundant second run or, for a reviewer that reads a mention as
  a fresh request, discard the one in flight.
- **Not started** – no evidence that the reviewer has run or is running for the current head. This
  is the only state that gets the trigger comment, followed by a wait.
- **Has run** – a configured check reached a terminal state against the current head, or the
  reviewer's own output is newer than the head commit. The gate proceeds to its findings. Note what
  this state does and does not say: the reviewer **finished**, not that every thread it wrote has
  already appeared on the pull request. The gate therefore checks again before merging – see
  [A reviewer thread that arrives late](#a-reviewer-thread-that-arrives-late).

A reviewer **without** a configured `.check` context keeps the previous two-state behavior – "has
run" or "not started" – because the fallback signal (comparing the reviewer's newest comment against
the head commit's timestamp) genuinely cannot tell "running" from "not started". Configuring
`.check` for a reviewer that publishes a commit status or check run is therefore what buys the
third state. A state that cannot be established at all still counts as "not started", which blocks
the merge rather than passing it.

The same reviewer states guard [`/effective-flow iterate`](tools-implement.md). Called directly on
a pull request where a configured reviewer is still running, `iterate` no longer classifies a thread
set that is still growing: it names the reviewer, says what proved it, and asks once whether to wait
for it, proceed anyway, or abort. A non-interactive run that has nobody to ask aborts instead. A run
the gate delegated is exempt, because the gate has already established the state.

#### A reviewer thread that arrives late

A reviewer's check can go green while some of its threads are still on their way to the pull
request. The automatic-reviewer round works on the threads that were visible when it looked, so a
thread that lands a moment later was seen by nobody – and a finding nobody read is exactly what a
merge must not step over.

Right before merging, the gate therefore re-reads the pull request and requires that **every open
thread from a configured reviewer has an outcome from this run**: implemented, deferred, or
rejected. It is a deliberately different question from "was every thread answered and resolved". A
finding the run assessed and set aside gets no thread reply by design, so it is silent here; a
thread that was never assessed at all is what blocks.

What you will see when a late thread turns up:

- **While rounds remain:** the run goes back to the automatic-reviewer round for exactly those
  threads and handles them like any other reviewer finding. That return costs one of the rounds
  allowed by `mergeGate.maxRounds`, which is what keeps a reviewer that keeps publishing from
  cycling forever.
- **With the round budget exhausted:** the run ends with a report naming every thread that was
  never assessed. It does not merge, and it never merges "because the checks were green anyway".

#### Recognizing its own writes across runs

The human-comment guard only works if the gate can tell its own writes apart from someone else's,
and it has to do that again on every later run – not only inside the run that wrote them. It
decides that from the **author record alone**: no comment body, no Effective Flow marker, and no
thread resolution state takes any part in it. Two operating modes exist:

- **App mode:** the gate posts as a dedicated bot account (planned, the way Greptile does today).
  Its writes are recognized by authorship – a login listed in `mergeGate.bots`, matched with a
  trailing `[bot]` trimmed from each side when the forge reports that account as a bot, so one entry
  covers both of GitHub's APIs while a human account of the same name still has to match exactly, or
  a normalized bot account type – so no identity lookup is involved and nothing further is needed.
- **Manual mode (today):** the gate posts as the operator's own account, the same account a person
  might also comment from. It reads that account's authenticated login once per run and excludes
  **every** comment and thread carrying it – whatever the text says, on either surface, and whether
  or not the thread is resolved. The comparison is on the login exactly as the forge reported it:
  no case folding, no `[bot]` trimming (that trim belongs to bot matching, not to identity), and an
  item the forge reports without a login cannot match, so it counts. If the identity read fails or
  is unavailable, nothing can be proven as the gate's own, so every non-bot item counts and the
  guard activates – reported as the reason.

**What this means for a comment you write yourself.** In manual mode you and the gate are the same
account, so a comment you type on the pull request does **not** hold the guard – not as a top-level
comment, not as an unresolved thread, and not however long you leave it. This is a deliberate
loosening: the gate assumes the operator starting it is present by definition, and the guard exists
to stop it merging out from under **someone else's** open discussion. It is not configurable, so if
a comment has to stop this gate it must come from another account – or simply do not start the run,
or start it in report mode. The change is not silent either: the run's chat summary names every
comment and thread it skipped because its own account wrote it, so an objection you typed by hand
shows up in the report instead of blocking.

**The configured trigger text should still be a distinctive mention** – for a different reason than
before. It has to actually summon the reviewer, and the gate suppresses a duplicate trigger by
comparing that exact text against the comments its own account already left for the current head. A
generic value such as `please review` could be a sentence you typed yourself after the head commit,
and the gate would then read it as a trigger it had already posted and skip the mention the reviewer
was waiting for. A mention like `@greptileai` does not have this problem.

Effective Flow's **own published review** is recognized by the same single rule. When
`delivery.prReview` annotated the pull request from the account the gate runs as, both surfaces it
writes – the findings on a line inside the diff, which arrive as review threads, and the single
outside-diff finding, which has no line to anchor to and arrives as an ordinary pull-request comment
– are excluded by authorship alone. For the outside-diff comment that is what it effectively was
before; for the inline findings it is a change: they used to hold the guard until their thread was
resolved, and now they stop holding it at once. An unhandled finding from this product's own review
can therefore be merged past. The findings stay on the pull request to be read, and the chat summary
names each one that was skipped. Published from a **different** account than the gate runs as, they
count like any other foreign comment and block as before.

Two further things worth knowing about what the gate writes:

- **A bot finding it assesses but does not implement gets no thread reply.** Whether the human
  guard is active or the finding was rejected, the gate reports that to you in the run's chat
  summary and writes nothing into the thread. Replies for findings the run does implement come from
  the delegated `iterate` run, not from the gate itself.
- **The gate writes no Effective Flow marker.** A marker in the raw comment body would keep
  announcing which tool composed it, so the trigger comment carries only the configured text and
  nothing else. Reading the raw body of anything the gate posted shows no tool or model attribution
  beyond the posting account itself. A marker would not buy the guard anything in either direction
  either: the guard reads no body, so no marker on this pull request is evidence about anything it
  decides.

**Typical call:**

- `/effective-flow merge-gate` – resolves the pull request of the current branch
- `/effective-flow merge-gate 42` / `/effective-flow merge-gate #42` / a pull-request URL – resolves
  that specific pull request

**Input/output:**

- The entry question ("merge at the end, or only report merge-readiness?") is asked exactly once,
  at the start; a non-interactive run behaves as report-only.
- The result is either a merged pull request or a chat report naming the exact condition that is
  still blocking the merge (pending or failing checks, a reviewer still running or not yet answered,
  a reviewer thread that arrived too late for any round to assess it, an open comment from an account
  that is neither a bot nor the one the run is authenticated as, a conflict with the base the run was
  not allowed or not able to resolve, a non-mergeable state, or a squash-merge title that is not a
  Conventional Commit). The report also names every bot finding the
  run assessed but did not implement, since those get no thread reply, every comment and unresolved
  thread that did **not** hold the guard because the run's own account wrote it, every configured
  `.check` context that never appeared at all, and – for every conflict it met – the per-file record
  of how it was resolved. After a confirmed merge, the report also gives each receipted issue's
  observed state and an evidence-based closure step when it remains nonterminal. It checks, in
  order, for an intentional non-closing `Refs` relationship, open sub-items or checklist entries,
  `effective-flow-needs-planning`, a still-started external state, and finally a remaining terminal
  tracker transition. It does not invent unobserved work.
- The check gate and the merge are performed by the remote-tracker helper described in
  [Remote tracker](remote-tracker.md#merge-gate-operations), on both providers. Forgejo supports the
  status read, the merge and the identity read; only the blocking check wait is unsupported there,
  because `tea` has no `checks` subcommand and Forgejo offers no server-side watch. A Forgejo run
  therefore reports the pending checks by name and asks once instead of blocking, and is the whole
  gate minus that wait. `review-create`, `review-thread-reply`, and `review-thread-resolve` also stay
  unsupported there; the last of the three because Forgejo serves no resolve route, not because
  `tea` lacks the subcommand.

**Interplay:** Configured entirely under `mergeGate.*` in the project-setup ADR (completion mode,
conflict-resolution mode, check-wait timeout, round budget, bot registry) plus
`delivery.mergeMethod`; see [Configuration](configuration.md#block-mergegate). Do not confuse
`mergeGate.*` with `delivery.prReview`, which controls whether a delivery workflow publishes its own
findings onto the pull request it just created – a different thing entirely. Every review-driven and
CI-driven code change the gate wants is made by `/effective-flow iterate`, which the gate calls with
the reviewer state it has already established, so `iterate`'s own review-in-flight guard does not
re-derive it; a merge conflict goes to the resolver worker instead, because nothing in `iterate`'s
item model resolves an in-progress merge.

Issue observation is deliberately different from the configurable check wait: the lifecycle grace
period is always 30 seconds and has no configuration key. Pull-request mechanics stay on the forge,
while an external lifecycle receipt resolves only the currently configured external connection; the
receipt never selects one. If observation remains incomplete, the final next-step block recommends
`/effective-flow merge-gate <PR>` for observer-only re-entry before the general open-plans path.

#### Deprecated `pr-review` invocation

`/effective-flow merge-gate` was named `/effective-flow pr-review` before this tool was
renamed. The old name still works: `/effective-flow pr-review` prints a one-time deprecation
notice naming `/effective-flow merge-gate` and then forwards the run unchanged, with the same
arguments, into the gate above. It is deliberately absent from the tool overview and from
autocomplete – reachable by name only, not advertised – and carries no gate logic of its own. The
alias is removed with the next deliberate major release; use `/effective-flow merge-gate` going
forward.

## Further reading

- [Worktree and delivery](worktree-and-delivery.md) – delivery branch, completion actions
  (`pr`/`merge`/`branch`)
- [Configuration](configuration.md) – `delivery.*` and `mergeGate.*` keys in detail
- [Remote tracker](remote-tracker.md#merge-gate-operations) – the forge operations the merge gate
  needs, and their `gh` version floor
- [Tools: Implement](tools-implement.md) – the workflows that `commit` and `pr` typically
  trigger at the end, and `iterate`, which the merge gate delegates every code change to
