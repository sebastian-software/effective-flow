# Tool reference: Deliver changes

This group brings finished changes into the repository and all the way to the merge:
`commit` creates a commit, `pr` opens a pull request from it, and `merge-gate` drives that pull
request to merge-readiness and, if allowed, merges it. `commit` and `pr` deliberately run **no**
project validation of their own (linting, tests, build checks) – the implementation tools and their
model-configured validation/test workers are responsible for that, applying central
`software-validation` and `software-testing` guidance when available. `merge-gate` runs no local
validation either; it waits for the checks the forge reports and has failures repaired by
`/effective-flow iterate`.

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
   forward with a merge commit; a branch that conflicts with its base is reported, not repaired.
2. **Automatic-reviewer round** – for each configured bot (Greptile and comparable tools),
   establishes whether it is still running, has not started, or has already run for the current
   head, triggers only the ones that have not started, waits, and then delegates their findings to
   `/effective-flow iterate`, which fixes the valid ones, replies, and resolves the threads. See
   [Three reviewer states, not two](#three-reviewer-states-not-two).
3. **Human-comment guard** – if any unresolved comment or thread has a human author, the run
   implements no review note and merges nothing. CI repair stays permitted even then. A top-level
   comment whose author the forge reports as a bot account never holds the guard, whether or not
   that bot is listed in `mergeGate.bots` – a CI, coverage, or dependency bot commenting on the
   pull request therefore does not block the merge. A bot finding the run assesses but does not
   implement – because the guard is active, or because the finding was rejected – gets no thread
   reply at all: it is named in the run's chat summary instead, and the thread is left untouched
   and unresolved. See
   [Recognizing its own writes across runs](#recognizing-its-own-writes-across-runs).
4. **Merge** – only once every precondition holds (all checks green, the forge reports the pull
   request mergeable, the human guard is inactive, every configured bot has run, and every one of
   their open threads has actually been looked at by this run), the run merges with the configured
   merge method, guarded by the expected head commit. A reviewer thread that turned up after the
   round that handled its reviewer sends the run back for another round instead; see
   [A reviewer thread that arrives late](#a-reviewer-thread-that-arrives-late).

**When to use:** On a pull request that is otherwise done and only needs CI to pass, its automatic
reviewers to be satisfied, and the merge button pressed – so you do not have to babysit checks and
bot notes by hand. Also useful as a pure merge-readiness report: run it in report mode to see
exactly what is still blocking a pull request.

**What it never does:** It never reviews. It produces no findings of its own, never approves a pull
request or submits a "request changes" review, never rewrites history (no amend, rebase, squash, or
force-push of the head branch – a branch behind its base is only ever brought forward with a merge
commit), and never merges past an open human comment. It implements no code itself: every code
change – CI repairs and bot-finding fixes alike – is delegated to `/effective-flow iterate`.

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

The human-comment guard only works if the gate can tell its own writes apart from a person's, and
it has to do that again on every later run – not only inside the run that wrote them. Two operating
modes exist:

- **App mode:** the gate posts as a dedicated bot account (planned, the way Greptile does today).
  Its writes are recognized by authorship alone – a login listed in `mergeGate.bots`, matched with a
  trailing `[bot]` trimmed from each side when the forge reports that account as a bot, so one entry
  covers both of GitHub's APIs while a human account of the same name still has to match exactly, or
  a normalized bot account type – so no identity lookup is involved and nothing further is needed.
- **Manual mode (today):** the gate posts as the operator's own account, the same account a human
  might also comment from. Its one own write, the trigger comment posted in the automatic-reviewer
  round, is recognized by that account's authenticated identity **plus** an exact match against the
  configured `mergeGate.bots.<login>.trigger` text. A comment that matches only one of the two – the
  right account with different wording, or the right wording from a different account – does not
  count as the gate's own.

Because manual mode matches on exact wording, **the configured trigger text should be a distinctive
mention.** A generic value such as `please review` could be typed by a person who genuinely wants a
discussion; that comment would then match exactly and be excluded from the guard. A mention like
`@greptileai` does not have this problem.

The gate recognizes Effective Flow's **own published review** the same way. When
`delivery.prReview` annotated the pull request, findings on a line inside the diff arrive as review
threads and stop counting once their thread is resolved. A finding whose line lies outside the diff
cannot be anchored to a thread, so it arrives as one ordinary pull-request comment — and a
pull-request comment has no resolved state to clear. The gate therefore treats that comment as its
own output and merges past it. The comment stays on the pull request to be read; it is this
product's own review, not a person's open question, and nothing in the workflow was ever going to
act on it.

Two further things worth knowing about what the gate writes:

- **A bot finding it assesses but does not implement gets no thread reply.** Whether the human
  guard is active or the finding was rejected, the gate reports that to you in the run's chat
  summary and writes nothing into the thread. Replies for findings the run does implement come from
  the delegated `iterate` run, not from the gate itself.
- **The gate writes no Effective Flow marker.** A marker in the raw comment body would keep
  announcing which tool composed it, so the trigger comment carries only the configured text and
  nothing else. Reading the raw body of anything the gate posted shows no tool or model attribution
  beyond the posting account itself.

**Typical call:**

- `/effective-flow merge-gate` – resolves the pull request of the current branch
- `/effective-flow merge-gate 42` / `/effective-flow merge-gate #42` / a pull-request URL – resolves
  that specific pull request

**Input/output:**

- The entry question ("merge at the end, or only report merge-readiness?") is asked exactly once,
  at the start; a non-interactive run behaves as report-only.
- The result is either a merged pull request or a chat report naming the exact condition that is
  still blocking the merge (pending or failing checks, a reviewer still running or not yet answered,
  a reviewer thread that arrived too late for any round to assess it, an open human comment, a
  non-mergeable state, or a squash-merge title that is not a Conventional Commit). The report also
  names every bot finding the run assessed but did not implement, since those get no thread reply,
  and every configured `.check` context that never appeared at all.
- On GitHub, the check gate and the merge are performed by the remote-tracker helper described in
  [Remote tracker](remote-tracker.md#merge-gate-operations). Forgejo does not yet support the
  underlying operations, so a Forgejo run degrades to report-only there.

**Interplay:** Configured entirely under `mergeGate.*` in the project-setup ADR (completion mode,
check-wait timeout, round budget, bot registry) plus `delivery.mergeMethod`; see
[Configuration](configuration.md#block-mergegate). Do not confuse `mergeGate.*` with
`delivery.prReview`, which controls whether a delivery workflow publishes its own findings onto the
pull request it just created – a different thing entirely. Every code change the gate wants is made
by `/effective-flow iterate`, which the gate calls with the reviewer state it has already
established, so `iterate`'s own review-in-flight guard does not re-derive it.

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
