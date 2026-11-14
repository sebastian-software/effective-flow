# Tool reference: Deliver changes

This group brings finished changes into the repository and all the way to the merge. `deliver`
turns a confirmed selection of current-session local changes into coherent commits on a fresh
branch and opens a pull request. The narrower tools keep strict boundaries: `commit` consumes only
an already staged diff, while `pr` consumes only commits on an already prepared branch.
`merge-gate` then drives the pull request to merge-readiness and, if allowed, merges it.

`commit` and `pr` deliberately run **no** project validation of their own (linting, tests, build
checks). `deliver` runs the repository's established pre-commit validation in its isolated
delivery checkout before it starts committing. Implementation tools and their model-configured
validation/test workers remain responsible for validating implementation handbacks, applying
central guidance when available: `effective-delivery` for running the repository's own checks and
`effective-engineering` for test strategy and regression tests. `merge-gate` starts no local
validation of its own either; it waits for the checks the forge reports and has failures repaired
by `/effective-flow iterate`. The one thing it has verified locally – a merge conflict it resolved
– is checked inside delegated workers, never by a command the gate runs itself.

## `/effective-flow deliver`

**Purpose:** Delivers an exact, user-confirmed selection of local changes as one or more coherent
commits on a fresh delivery branch, then opens a pull request without changing the source checkout
or its index. The one exception is an upstream fast-forward that you confirm before selection.

**When to use:** After work was completed locally and the relevant files are not yet all staged or
committed, especially when the checkout also contains unrelated changes. Use `commit` instead when
the exact intended diff is already staged, and use `pr` only when the intended commits are already
on a prepared branch.

**Typical call:** `/effective-flow deliver`

**Selection:** `deliver` reconstructs a candidate from the files changed in the current session and
checks those paths against Git. It never treats all repository dirt or recent files as session
output. Before any branch, worktree, index, commit, push, or forge mutation, it displays the complete
ordered candidate with each path's selected state and asks you to confirm it. Unstaged and untracked
files are eligible when you identify them; ignored paths, directories, globs, path aliases, and
untracked symbolic links are not. For a partially staged file, `deliver` shows the staged state and
the complete working-tree state as separate choices instead of choosing one for you.

There is no path-list argument to prepare. If session evidence is missing, contradictory, or admits
more than one plausible scope, `deliver` asks you to refine the selection in normal conversation.
If the exact files and states still cannot be agreed, it stops without changing Git or the forge.
This manifest confirmation is the workflow's sole routine approval; the only questions that can come
before it are the [resume and release questions](#resuming-or-releasing-a-failed-delivery) for a
retained failed delivery and the conditional upstream questions described under
[When your branch is behind its upstream](#when-your-branch-is-behind-its-upstream). The
[committed-range route](#publishing-commits-you-already-made) replaces it with at most its provider
question or one focused publish question. If source state drifts after
confirmation, `deliver` displays the updated manifest and asks you to confirm it again before it
continues.

**Commit groups:** After the file/state selection is confirmed, `deliver` proposes an ordered set of
coherent commits based on the session's task boundaries and the substantive diffs. It shows every
group's exact paths and tentative Conventional Commit effect as a non-blocking progress update,
validates that the groups form a complete, non-overlapping ordered partition of the selected
changes, and continues automatically without a second approval or refinement round. Ambiguous
grouping or order stops before staging; `deliver` never guesses or creates a mixed catch-all commit
merely to finish.

Each derived group is staged by literal path in sequence and handed to the staged-only `commit`
tool. After each commit, `deliver` verifies the parent, branch, tree, and remaining groups. If a
later group or commit hook fails, the fresh worktree and branch are retained together with all
earlier verified commits and the still-uncommitted groups. Nothing is pushed and no pull request is
created; successful commits are never amended, reordered, squashed, or retried.

#### Publishing commits you already made

When the session produced no uncommitted changes to select, `deliver` can still publish commits it
made itself. The route applies only when the reconciled candidate is empty, the checkout is clean
(untracked files included), and the branch is attached and not the base branch. It needs no
confirmation round of its own and creates no branch, worktree, commit, or manifest.

- **Which commits count:** only commits whose full 40-character OID (64 in a SHA-256 repository)
  this session holds: from a
  `commit` report (which always names the full OID), from `git rev-parse HEAD` right after the
  session's own `git commit`, or from a worker report naming the full OID. An abbreviated OID, a
  merge commit, a rebased or cherry-picked commit, an OID lost to context compaction, and any
  guess from author, message, or recency never count.
- **Four conditions:** the fetch and upstream state allow publishing; the commits between the
  refreshed base and `HEAD` are non-empty and all session-known; no pull request already exists
  for the branch (any base, any state); and no earlier `pr` attempt on it ended uncertain.
- **Outcomes:** when all four hold, `deliver` lists each commit and its changed paths and hands
  the branch to `pr` without asking a tool-choice question. An open pull request instead points
  you to `iterate`, or to a direct `pr` call when it is a plan's draft. A failed condition that
  you can reasonably override, such as commits this session cannot vouch for, only closed or
  merged pull requests, an uncertain earlier attempt, or an unexpected upstream, produces one
  focused **Publish via pr** or **Cancel** question naming the condition. Hard failures, such as
  a failed or stale fetch, a detached checkout, an empty range, or missing forge access, end with
  one notice line. An unanswered or skipped question, and a non-interactive run, resolve to
  **Cancel**: nothing is pushed. When the run must ask which forge it is (`github` or `forgejo`),
  that is its only question: a condition that would otherwise ask the Publish or Cancel question
  then ends with a notice instead, and an unanswered forge question also ends with a notice, with
  nothing pushed.
- **Dirty checkouts:** any staged, unstaged, or untracked change keeps the selection path above.
  When the configured base resolves to an `origin` remote-tracking ref and the checkout is attached
  to a non-base branch, its delivery adds one notice line that committed work on the branch is not
  included. A local-only base, a detached checkout, or the base branch itself (`HEAD_IS_BASE`) adds
  no notice, because the range read fails and a failed read adds none; on the base branch the
  earlier upstream check's ahead notice is the signal.
- **Verification:** this route carries no verification evidence in this version. `deliver` passes
  `pr` the line `Verification evidence: none`, so the pull request gets no verification section and
  the report says `no trusted verification evidence`. A positive path for this route is not part of
  this version.
- **Writes:** `deliver` itself pushes nothing. The only write is `pr`'s `push -u`, which also
  sets the branch's upstream configuration; `pr` owns it.

#### Resuming or releasing a failed delivery

A delivery that failed after its first commit stays retained, and a later `deliver` run can continue
it. Right after it verifies the source checkout, before the upstream check, `deliver` looks for
retained deliveries (lifecycle status `aborted` or `failed`; see
[Resuming or releasing a failed delivery](./worktree-and-delivery.md#resuming-or-releasing-a-failed-delivery))
and checks each one read-only. It reports every candidate with its committed and remaining group
counts, and a record that another run still holds is reported and left alone.

- **Resume.** One question, **Resume** or **New delivery**, lists the deliveries that can be
  continued. A delivery qualifies when at least one of its commit groups is provably on its branch,
  the source checkout still holds the confirmed selection, the worktree holds exactly the changes the
  earlier run left (no file hidden by skip-worktree or assume-unchanged differs from the index and
  `HEAD`, and no ignored file stands where a delivery file belongs), and the current visibility is
  not weaker than the original one. Resume continues
  the same branch and worktree with the original selection and does not ask you to confirm it again.
  An unanswered question or a non-interactive run starts a new delivery and keeps the record.
- **What a resume skips and reruns.** It skips the upstream check and fast-forward, the selection and
  its confirmation, the commit grouping, branch and worktree creation, the transfer, and the project
  setup. It reruns the repository validation, the exact-diff reconcile against the recorded progress,
  and the source comparisons against a fresh snapshot, then commits only the remaining groups from the
  first uncommitted one and continues with the pull request and report as usual. Base branch and
  languages come from the recorded progress. A commit that was created but never recorded, for
  example after a helper failure, is accepted once the same proofs hold. A group that a failing commit
  hook left staged is unstaged by the resume itself while it holds the worktree's Git index lock,
  only while the index still stages exactly that group, and committed again; staged content that
  changed since then, a newer entry beside the group included, stops the resume and stays staged. If
  the resume fails again, the record returns to its failed state and can be resumed the same way.
- **Release.** A candidate that cannot be resumed, for example because the visibility is weaker or
  its branch history no longer matches the recorded progress, is listed with the way it can be
  released and, with recorded progress, the exact paths a release discards. A separate **Release**
  question (**Release all listed**, **Select individually** or **Keep all**) asks for explicit
  confirmation; nothing is released otherwise. Releasing a record with recorded progress discards its
  remaining changes from the worktree only when they provably equal what is still in your checkout,
  and keeps every discarded file as a tree under `refs/effective-flow/released/<RECORD_ID>/`
  (`git ls-tree -r <ref>` lists it; `git update-ref -d <ref>` drops it once you no longer need it);
  without recorded progress it requires a clean or already vanished worktree. Each file is
  re-checked against the source right before it is discarded, and release stops with a write failure
  if either side changed. When the source checkout or the worktree changed and the worktree still
  holds changes, release is refused and the blocking paths are listed: restore the source checkout
  or clean the worktree by hand first. Release is also refused when a kept quarantine from an earlier
  failed release is in the worktree (it holds the only copy of those files; recover them by hand,
  cleanup refuses it too), when an ignored file stands where a delivery file belongs or a hidden
  (skip-worktree or assume-unchanged) file differs from index and `HEAD`, and when the source
  checkout is the delivery worktree itself; remove or fix those files by hand. The
  branch and its commits stay, and `/effective-flow cleanup` then removes the worktree. A delivery
  started from another checkout is resumed or released by `deliver` in that checkout; from here only
  its clean or vanished worktree can be released.
- **A failure before the first commit** offers no resume, but the record can still be released.
- **Resume unavailable for this run.** When the selection is too large for the recorded progress
  (256 KiB), the delivery shows this notice once and continues unchanged. If it fails later, it can
  only be released.

These two questions are the only routine approvals `deliver` adds. Selection approval is not asked
again, and a resumed run reports its model evidence as observed, with no claim of its own.

**Isolation and result:** `deliver` refreshes `delivery.baseBranch` and creates a collision-safe
`<delivery.branchPrefix>/deliver/<slug>` branch in a new Effective Flow-owned worktree. Only the
confirmed states are transferred, and any conflict with newer base content stops instead of
overwriting it. From the moment `deliver` records its evidence, the dirty, detached, base-branch, or
harness-managed source checkout remains the immutable source of evidence: `deliver` never switches,
stages, commits in, or removes it. The only earlier write is an upstream fast-forward you
confirmed.

After every group is a verified commit and the delivery checkout is clean, `deliver` removes only
its verified clean worktree, retains the local branch, and hands the exact branch, base, and head
commit to `pr`. The invocation itself is an affirmative request for a pull request, so `deliver`
does not inherit a different `delivery.completion`; when the configured value differs, the result
reports both values without changing the configuration. Updating an existing pull request belongs
to `/effective-flow iterate`, not this fresh-branch workflow.

#### When your branch is behind its upstream

Before it reconstructs the candidate, `deliver` compares your current branch with its upstream
(`@{u}`), for example `develop` with `origin/develop`. It fetches that upstream non-interactively
(`GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`), so a credential prompt fails instead of
waiting for input, and gives up after 60 seconds. When you have no SSH setup of your own, the
default `ssh` runs with `BatchMode=yes`, so a host-key or passphrase prompt fails at once. An SSH
command or program you configured yourself (`GIT_SSH_COMMAND`, `core.sshCommand`, `GIT_SSH`, or
an SSH variant setting such as `GIT_SSH_VARIANT` or `ssh.variant`) is used unchanged, so there
only the 60-second limit ends a host-key or passphrase prompt. Every inherited `GIT_TRACE*`
variable and `GIT_CURL_VERBOSE` is removed for the fetch, so its diagnostic output cannot echo your
SSH command, credentials, or fetched data. A failed fetch is reported
without the user name, password, query string, or fragment of the remote URL. A local
upstream, one that tracks another branch of the same repository, is compared without fetching. The comparison target is the branch's
own upstream, not `delivery.baseBranch`; the configured base is still refreshed later, as described
above.

Most states end with one notice line and no question, and `deliver` goes on to the selection: a
detached checkout, a branch without an upstream, an upstream that no longer exists, a fetch that
failed, timed out, could not refresh the upstream, or was skipped because the upstream
configuration is invalid, a comparison that could not be completed, a branch that is up to date,
and a branch that is only ahead. An ahead branch still reaches the selection, and when the checkout is
clean and nothing is left to select, the [committed-range route](#publishing-commits-you-already-made) applies. Two
states ask:

- **Behind:** `deliver` names the upstream and how many commits your branch is behind, then asks
  whether to **Fast-forward first**, **Continue without update**, or **Abort**.
- **Diverged, or local changes in the way:** when your branch also has its own commits, or when an
  incoming change touches a path that is staged, modified, untracked, or ignored in your checkout,
  no fast-forward is offered. `deliver` reports the ahead and behind counts and every overlapping
  path, then asks whether to **Continue without update** or **Abort**.

An unanswered or skipped question, and a non-interactive run, continue without an update: a
fast-forward only ever runs after an explicit **Fast-forward first**. **Abort** ends the run without
touching your working tree, index, or local branch; the upstream fetch before the question may
already have stored the fetched commits, `FETCH_HEAD`, and the remote-tracking branch. Continuing without an update is safe, because the confirmed states are still
transferred onto the refreshed base with conflict detection.

A confirmed update is a fast-forward and nothing else. `deliver` never stashes, rebases, creates a
merge commit, forces, or retries it. Uncommitted changes stay in place, locally ignored files are
never overwritten, and Git hooks are disabled for the update, so the report says that `post-merge`
hooks were skipped. Afterwards `deliver` verifies the new `HEAD` and every path that was staged,
modified, untracked, or ignored before the update. If the update fails without writing anything,
you see the diagnostic, including Git's own error output when there is any, and the
continue-or-abort question. If it fails after `HEAD` has already
moved, `deliver` stops before the selection and reports the old and new `HEAD` and every differing
path.

This fast-forward is the only write `deliver` makes to your source checkout, and it happens before
the source evidence is recorded. The final report names the upstream outcome.

The update only brings your branch current with its own upstream. On a feature branch that tracks
its own remote branch, newer content on the configured base is not pulled in, so a conflict with the
base can still stop `deliver` later, when it transfers the confirmed states to the delivery
worktree.

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

**Interplay:** Use it standalone for manually staged changes, or let `deliver` and implementation
workflows call it with a verified delivery receipt after they have staged only their known output.
`commit` never selects, stages, unstages, restores, or validates files. It respects existing hooks;
if a hook fails, it reports the cause instead of bypassing it. With multiple unrelated topics in a
directly staged diff, it suggests splitting first. Every report names the created commit's full
40-character OID (64 in a SHA-256 repository), never an abbreviation, so a later publish can recognize the commit as
session-made. A delivery caller additionally receives the branch, tree OID, and remaining staged, unstaged, and untracked state so it can
verify the boundary before continuing.

## `/effective-flow pr`

**Purpose:** Creates or reuses a pull request from an already prepared, committed branch on the
detected Git host: GitHub via `gh` or Forgejo via `tea`. It verifies the exact head and base, pushes
the branch if needed, and derives the title and description for a new pull request. It never creates
or switches a branch, stages or commits content, or restores a checkout.

**When to use:** When every intended change is already committed on an attached, non-base branch
and that branch is ready to publish. If local staged, unstaged, or untracked changes still need to
be included, use `deliver`; direct `pr` aborts on a dirty checkout rather than omitting them.
When the session's own commits are all that is left to publish, `deliver` hands them to `pr` for
you (see [Publishing commits you already made](#publishing-commits-you-already-made)).

**Typical call:** `/effective-flow pr`

**Input/output:** A direct invocation takes the clean currently checked-out branch as its head. A
returning delivery handback supplies an exact head branch, base branch, and verified head OID, even
if its delivery worktree has already been removed. The base defaults from `delivery.baseBranch`;
without that key it is the branch `origin/HEAD` names, and `main` where that ref does not resolve. A
retired `worktree.baseBranch` row is never read: without `delivery.baseBranch` beside it, `pr` stops
before any fetch or push, on a direct invocation and a committed handoff alike, and points to
`/effective-flow setup`. Output is the PR URL, head and
base branches, the verified head OID, and `result: created` or `result: reused`. A detached checkout, the base branch itself, a branch with
no commits against the refreshed base, contradictory handoff evidence, or a changed head OID stops
before publishing.

**Existing pull requests:** After pushing the branch, `pr` queries the detected host for open
pull requests and exact-matches the requested head and base branches, and requires the host to
report the head as this repository's own (`sameRepository`, decided by repository id or by the
full name compared case-insensitively). A fork's or deleted fork's pull request with the same head
name therefore neither matches nor counts as a duplicate, and a match whose repository the host
does not state even after a fresh read stops the lookup as incomplete. Exactly one match is reused without changing its title or description;
the workflow then follows the same checkout restoration and reporting path as a newly created pull
request. Pull requests with another base, closed or merged pull requests, and other non-matches are
ignored. A failed or unparseable lookup or multiple exact matches stops the workflow without
attempting creation or guessing.

**Finishing a plan's draft:** A reused pull request is changed in exactly one case: it is the draft
that [`plan` published](tools-understand.md#publishing-the-plan-as-a-draft-pull-request), and its
branch now carries implementation beyond the plan. An implementing run's delivery names that pull
request by number, and only once the plan was archived on its branch; a different number or a
missing marker then refuses the finish, and when no pull request matches at all, `pr` stops before
creating a new one. A direct `pr` call is the recovery path after a failed finish: it finishes a
draft with a valid plan marker whose branch already holds the archived plan and no longer the plan
itself. `pr` then derives the final title and description as for a new pull request, updates the
title, updates the body while keeping the marker line, and marks the pull request ready, each as a
dry run first. On Forgejo, while the pull request is still a draft, the body is updated first and
the retitle and the ready transition are one final edit, so marking the pull request ready is always
the last change. The first failure stops it, the pull request stays a draft, and the report names
the failed step.

**Verification section:** A new pull request, and a plan's draft that `pr` finishes, gets a
"Verification" section in its description when the workflow that hands the branch over actually ran
checks: the `build`, `fix` and `refactor` handbacks, and `deliver` after its own pre-commit
validation. The section lists only checks that workflow observed in the run, never CI results,
reviewer output or a command that was merely planned. It is bound to the content, not to a commit:
`pr` compares the verified content with the content it publishes, ignoring the run's own plan file
and its archived copy, so a plan archived after validation does not invalidate it. Equal content
shows the results under "Verified on `<short head>`"; the same content after a rebase or amend still
counts. Any other difference, such as a formatter run or a fix after the last check, replaces the
results with one notice that the recorded results do not match the content of `<short head>` and
are not reported. The section follows `language.forge`; check, scope and limitation text stays as
the workflow wrote it. Derived description prose makes no test claims of its own, and a description
you supplied stays unchanged, with the section following it.

`pr` never starts validation and never invents evidence. When there is nothing trustworthy to show,
the description carries no section and the final report says why on its verification line:

- **Direct `pr` run:** `no trusted verification evidence`. A record pasted by you or read from saved
  state is ignored, because only a returning workflow's checked handoff is trusted.
- **Handoff without a record:** `no verification record supplied by this workflow` (for example
  from `docs`, `maintain` or `iterate`), or `none` when a producer could not build one.
- **Rejected record:** `rejected (<reason>)`, for a malformed or oversized record or a text field
  that is too long, spans several lines or carries text unsafe to publish, for example an absolute
  or home-relative path, a URL with credentials, a mention, an issue-closing keyword, HTML, a
  credential-like or log-shaped value, and in hidden mode a workflow name or plan path. Relative
  paths and plain URLs are allowed. A gap never blocks the commit or the pull request.

A reused open pull request keeps its title and description. The report only states whether this
run's record matches the current head (`verification: current (<short head>)`), is `stale`, or was
rejected; an older section on that pull request keeps naming the head it was verified on.

A section where every check passed:

```markdown
## Verification

Verified on `3f9c2a1`.

| Check | Outcome | Scope | Limitation |
| --- | --- | --- | --- |
| pnpm lint | passed | whole repository | — |
| pnpm test | passed | unit and integration tests | — |
| pnpm build | passed | production build | — |
```

A section with known limitations. A skipped or unavailable check is never shown as passed, and a
failure that was already present is shown as a baseline failure with the first seven characters of
the baseline tree it was compared against:

```markdown
## Verification

Verified on `3f9c2a1`.

| Check | Outcome | Scope | Limitation |
| --- | --- | --- | --- |
| pnpm lint | passed | whole repository | — |
| pnpm test | baseline failure | payments package unit tests | unchanged against base 8d41e07 |
| pnpm test:e2e | skipped | end-to-end tests | no browser available in the delivery checkout |
```

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

**T3 Code:** On T3 Code, `pr` links each created or reused pull request to the current thread once, right
after it is created or matched. A failed link is reported in one line and never blocks the run. Other
hosts do nothing extra, and `deliver` gets the same behavior through `pr`.

**Interplay:** `pr` is the commit-only leaf used by `deliver` and by the `pr` completion action of
implementation workflows. It can also be called standalone for a clean, already-prepared branch.
Fresh branch creation and local-change transfer belong to `deliver` or an implementation handback,
not to `pr`. For details on delivery branches and completion actions, see
[Worktree and delivery](worktree-and-delivery.md); for the associated config keys, see
[Configuration](configuration.md).

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
   [Resolving a conflict with the base](#resolving-a-conflict-with-the-base). The same merge also
   runs for a head that has a failing check and does not contain its base, whatever merge state the
   forge reports – see
   [A failing check on a behind head](#a-failing-check-on-a-behind-head). Where the base merge is
   proven unavailable for the head – it lives in a fork, in no same-name branch on `origin`, or in a
   same-name branch that carries a different commit while the forge reports `BEHIND` or `DIRTY` – the
   branch is not brought forward: the run ends with a report instead. The proofs are listed under
   [the base merge can be proven unavailable](#resolving-a-conflict-with-the-base).
2. **Automatic-reviewer round** – for each configured bot (Greptile and comparable tools),
   establishes whether it is still running, has not started, or has already run for the current
   head, triggers the ones that have not started – and, once per verdict, one with a configured
   check that has run whose changes-requested verdict went stale because another check run was
   re-run green after it, replacing an earlier run of the same check – waits,
   and then delegates their findings to `/effective-flow iterate`, which fixes the valid ones,
   replies, and resolves the threads. On
   Forgejo, which declares neither thread write, the reviewer's own later approval settles a thread
   instead; see the Forgejo note under **Input/output**. See
   [Three reviewer states, not two](#three-reviewer-states-not-two).
3. **Human-comment guard** – if any unresolved comment or thread, **or any changes-requested
   review**, was written by an account that is
   **neither a bot nor the one the run is authenticated as**, the run implements no review note and
   merges nothing. The review surface counts only that one verdict and only on the reviewer's latest
   review, so a routine "looks good" review never holds a guard that is never cleared; see
   [A reviewer that requests changes](#a-reviewer-that-requests-changes). That is what "human" means here: the guard decides on the author record alone. A
   comment from the gate's own account never holds it – including, in the usual manual mode, a
   comment you typed yourself – and neither does an item whose author the forge reports as a bot
   account, on either surface and whether or not that bot is listed in `mergeGate.bots`, so a CI,
   coverage, or dependency bot commenting on the pull request does not block the merge either. Some
   such bots are typed by the forge as ordinary users (Codecov's `codecov-commenter`); the guard
   cannot recognize those, so list the login in `mergeGate.botAccounts` to exclude its top-level
   comments and review-thread items. That key never excludes a changes-requested review. CI
   repair stays permitted even when the guard is active, and so does the repair of a conflict with
   the base. A bot finding the run assesses but does not implement – because the guard is active, or
   because the finding was rejected – gets no thread reply at all: it is named in the run's chat
   summary instead, and the thread is left untouched and unresolved. See
   [Recognizing its own writes across runs](#recognizing-its-own-writes-across-runs).
4. **Merge** – only once every precondition holds (all checks green, the forge reports the pull
   request mergeable, the human guard is inactive, every configured bot has run, every one of
   their open threads has actually been looked at by this run, and every changes-requested review a
   configured reviewer published for the verified head has been disposed of finding by finding –
   which, for anything the delegated run set aside rather than fixed, takes your confirmation; see
   [Confirming a finding the run set aside](#confirming-a-finding-the-run-set-aside)), the run
   merges with the configured
   merge method, guarded by the expected head commit. A reviewer thread that turned up after the
   round that handled its reviewer sends the run back for another round instead; see
   [A reviewer thread that arrives late](#a-reviewer-thread-that-arrives-late). A reviewer that
   states its objection as a **verdict** rather than as a thread is handled by its own precondition;
   see [A reviewer that requests changes](#a-reviewer-that-requests-changes). "All checks green"
   counts a skipped or neutral check as passing, as GitHub does, and additionally means a check list
   was reported at all, and a repository that runs **no CI** never
   reports one: there an interactive run with `mergeGate.completion: merge` asks you whether the
   absent list is expected – once while it waits for checks, and again at the verified head commit
   it would merge, because that second question is asked about the read the merge is actually
   decided on. It merges only if you confirm that second one, and reports afterwards that the merge
   was performed on a waived check list rather than on green checks. Declining, or leaving the
   question unanswered, ends the run; a non-interactive run cannot ask and therefore does not merge.
   The question covers the missing list alone: a check that has appeared and is pending or red
   blocks exactly as before, and the question is put to you only where nothing else is blocking the
   merge either. Fewer runs reach that question than the paragraph above suggests, and the two
   forges differ: on GitHub the check wait that precedes it treats a response carrying no check list
   at all as a failed command rather than as an empty result, so a run on the default
   `mergeGate.requireAllChecks: true` ends in that wait and neither question is put to you. Setting
   `mergeGate.requireAllChecks: false` makes the same response readable instead – the wait then asks
   only about the forge's own required checks. On Forgejo the helper polls within the same bound and
   already asks you once. Those two are where the waiver is reachable; a GitHub repository that runs
   no CI at all and keeps the default check criterion still cannot be merged by this tool.

   **Declared no-CI policy.** A repository that intentionally runs no CI can record
   `mergeGate.noCiPolicy.bases` (exact base branch names) in its setup, and `setup` writes it only
   on your explicit choice. For a pull request into a listed base whose fresh status read reports
   no check at all, the gate then skips the pending-checks question and the waiver, and merges once
   every other condition holds; no waiver record is written. It applies only where the same
   `mergeGate.noCiPolicy.*` rows are on the base branch, so a pull request cannot grant it to
   itself (in hidden mode the file is local and there is no such guard). A non-interactive run uses
   it only with `mergeGate.noCiPolicy.unattended: true` and `mergeGate.completion: merge`;
   otherwise it stops as before. A GitHub repository without CI also needs
   `mergeGate.requireAllChecks: false`, or its check wait fails before the policy is reached. On
   Forgejo the run makes one status read instead of waiting.
   The policy reaches nothing but the missing check list: a pending or red check, every other
   condition and branch protection are unchanged, and a base that requires checks refuses the merge.
   The report names the policy, the matched base and the residual risk that a check attaching
   after the read, or CI the pull request itself introduces, looks like no CI; where the policy
   was configured but did not apply, it says why.

5. **Linked-issue observation, completion assessment, and the offered transition** – after a
   confirmed merge, validates the pull request's lifecycle
   receipt and gives tracker automation one fixed 30-second grace period. It reports each linked
   issue as terminal, open, timed out, or unobservable. For every issue still open or timed out it
   then assesses – without asking – whether the merged pull request completes it, recording
   `complete`, `incomplete`, or `undetermined`. Only a `complete` verdict, and only in an interactive
   run, produces an **offer**: one question covering every eligible issue, which on your confirmation
   sets those issues to their terminal tracker state. A decline transitions nothing, and neither
   does a non-interactive run. A terminal forge issue loses the `effective-flow-issue-in-progress`
   label, and a recorded native sub-item or checklist entry is
   completed only after its linked issue is observed terminal – which an issue transitioned here now
   is.

**How it runs:** The gate runs as one delegated run on the `standard` tier, so the long wait-and-repair
loop stays out of your session's context. The code it lands is reviewed at the `deep` tier: each
review item's change before its commit, and a conflict resolution before it is committed and pushed.
A blocking finding commits nothing, and a review counts only findings within its site's blocking
scope: the item's diff, or for a conflict the resolved and adjacent hunks. The standard runner never
closes or admits an item that the `deep` classification marked `uncertain`. A rejected item stays
uncommitted: the run reports a dirty checkout, retains the worktree (recorded as `aborted`), and the
next round stops until it is cleaned. Classifying review items is a separate read-only `deep` step. A restriction you give your session – do not merge, or
commit or push nothing onto the branch – travels into the delegated run and wins over
`mergeGate.completion`: the run then only reports, or ends with its report where it would otherwise
write to the branch. A restriction neither of those expresses, such as read only, is never
translated: your session asks you to restate it or stops, and if you insist, runs the gate inline in
your session. Without a "do not merge" restriction, your session asks for the merge
completion mode before the gate starts. Every later question – a waiver for a missing check list, a conflict resolution, a
finding it set aside, an issue transition – comes back through your session with what each answer
does, and the run then continues with your answer, or ends with its report when you stop it. A host that cannot start a nested sub-agent runs the gate inline and says so once.

**Waiting on T3 Code:** On T3 Code the gate links the resolved pull request to the thread and leaves
every wait for pending checks or a pending configured reviewer to the host's pull-request watch: it
never uses `sleep`, `gh --watch` or polling. The run suspends, the session prints one line naming
what it waits for and ends the turn, and each pull-request event resumes the gate with fresh reads.
The wait has no time bound, so `mergeGate.checkWaitMinutes` and `mergeGate.botWaitMinutes` do not
apply there; you can say continue or stop. The line warns when none of the pending checks is
required, or when a reviewer's has-run check is not required, because such a pass may not wake the
gate. `/effective-flow merge-gate <PR>` in the same session continues a suspended gate; a new session
starts a fresh run, whose report names the earlier run's leftover wisdom file for
`/effective-flow cleanup`. Three consecutive wakes that change nothing end the run with a report
naming the pending checks or reviewer and the re-entry command, unless the only wait is for a
reviewer's answer to a stale-verdict re-trigger: then the gate hands that verdict's items to
`iterate`, as on every other host. A resume under `mergeGate.requireAllChecks: true` where only
non-required checks remain pending also ends with that report. Where the watch
cannot be loaded or is rejected (Forgejo support is unconfirmed), or the gate runs inside a sub-agent, the run reports and
stops instead of waiting and never merges. The watch is removed before the final report. Every
other host keeps the bounded waits unchanged.

**When to use:** On a pull request that is otherwise done and only needs CI to pass, its automatic
reviewers to be satisfied, and the merge button pressed – so you do not have to babysit checks and
bot notes by hand. Also useful as a pure merge-readiness report: run it in report mode to see
exactly what is still blocking a pull request. Re-enter it with an already merged PR when a linked
issue was still open, timed out, or could not be observed. That observer-only path skips checks,
reviewers, branch writes, and merge, then validates the receipt and repeats post-merge issue
observation, the completion assessment with its offered terminal transition, and eligible
reconciliation – which makes it the intended recovery path for a run that could not pose the offer.
An issue that is already terminal on re-entry skips the assessment and the question entirely, so such
a re-entry retries only the reconciliation a previous run left open.

**What it never does:** It never reviews. It produces no findings of its own, never approves a pull
request or submits a "request changes" review, never rewrites history (no amend, rebase, squash, or
force-push of the head branch – a branch behind or in conflict with its base is only ever brought
forward with a merge commit, and not at all where the base merge is proven unavailable; a conflict
that could only be resolved by rewriting history is reported instead), and never merges past an open
comment from an account that is neither a bot nor the one it runs as. It implements no code itself:
CI repairs and bot-finding fixes are delegated to `/effective-flow iterate`, and a merge conflict is
delegated to a dedicated resolver worker. The gate itself only ever writes that one merge commit and
pushes it.

It also never force-closes a linked issue and never treats PR prose as a substitute for a valid
lifecycle receipt. A transition you confirmed after a `complete` assessment verdict is not a forced
close and is the one authorized path: the gate closes nothing on its own authority, nothing at all in
a non-interactive run, and nothing for an issue whose verdict was `incomplete` or `undetermined`. A
missing, malformed, duplicated, or mismatched receipt leaves the merge result unchanged and
authorizes no tracker access. Post-merge tracker failure likewise cannot roll back a
successful merge.

#### Anonymous pilot-period observation

While a local pilot generation exists in `baseline` or `active`, a non-observer `merge-gate` run
may create one anonymous period observation. It counts actual CI-repair delegations, configured-
reviewer implementation delegations, and conflict-resolution attempts, then records the closed
`merge|report` mode, terminal outcome, native harness family, and required-check summary. Pending
waits, ordinary rounds, keyword-less resumes, and Phase-4 returns without implementation are not
corrections.

The gate discovers the current generation with a read-only helper call carrying the verified
runtime root and repository identity. Zero generations is a no-op, exactly one supplies the state,
and multiple generations fail closed without choosing one. Reservation then passes that generation
with the separately resolved configuration state, `merge|report` mode, and `claude|codex` harness.

The observation has no PR, repository, branch, workflow-record, check-name, comment, finding, or
path identifier and no per-run link to `build` or `refactor`. It is grouped only at the generation
period level. Disabled or invalid configuration and `none`, `suspended`, or `review` generation
states make observation a read-only no-op; observer-only post-merge re-entry records nothing. The
observation is also skipped, with nothing persisted and no effect on the pilot, when admission
closes as it starts or while another measured run is still in flight.

Reservation or finalization failure never changes whether the current run merges or reports ready.
After a reservation, every normal, controlled, or early exit finalizes exactly once. A report-mode
exit before the final gate batch records `reported-blocked` with unavailable required-check
evidence; a merge-mode failure records `failed`. The helper's explicit `pilotControlOutcome`,
`controlStatePersisted`, and value-free `alert` metadata is the only authority for claiming an
`evidence-gap` or durable suspension. The gate never infers either from an exit code, missing
receipt, or failed write; if persistence cannot be proven, it says so without changing the gate
result. The observation never influences profile selection: only `build` and `refactor` select
Fast, and only for an eligible packet in an active generation. See
[Model-tiering pilot data and privacy](model-tiering-pilot.md) for the local evidence and retention
boundary.

#### Resolving a conflict with the base

A pull request whose head branch conflicts with its base used to end the run: the gate reported the
conflict and stopped. It now repairs that conflict with the **same** operation it already used for a
branch that had merely fallen behind, or that is behind with a failing check – merging the base into
the head branch – with the conflicts
resolved inside that merge. The result is one ordinary merge commit, pushed normally. Nothing is
rebased, squashed, amended, or force-pushed, and a resolution that would need any of those to succeed
is reported instead of performed. Where the base merge is proven unavailable for the head (see
below), the gate does not attempt it and the run ends with a report instead.

What the run does with a conflict:

1. **Resolves it in a delegated worker.** The gate provisions a
   [checkout](worktree-and-delivery.md#merge-gate-checkout), starts the merge, and hands the
   conflicted files to a dedicated resolver. That worker classifies each conflicted file's risk,
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

2. **Verifies the result twice and has it reviewed, before anything is committed – and fails closed.** The resolver runs
   the repository's own checks on the resolved tree, and the gate then has that same uncommitted tree
   checked independently by its validation role. By default that role runs in `full` mode, which
   honours a repository-mandated combined or top-level gate, because this merge commit has no other
   pre-commit check standing behind it. The resolution counts as verified only when the two
   layers **together executed at least one** of the repository's own checks and every executed check
   passed. A failing verdict from either role, a verdict that is not an affirmative pass, and a run in
   which every applicable check came back skipped are all treated exactly as an abort: the merge is
   aborted, nothing is pushed, and the run reports every check that did not run. A disagreement
   between the two roles is never a tie broken in the merge's favour. A third layer follows: a routed
   `deep` review of the staged resolution, limited to the conflicted and adjacent paths, still before
   the commit. A blocking finding from that review commits nothing, exactly like a failed
   verification. CI remains the final criterion
   afterwards, and a failure it catches is repaired through `/effective-flow iterate` as before.
   Only a repository that opted in with `mergeGate.conflictValidation: quick` can validate less,
   and only for a low-risk conflict; see
   [CI-backed `quick` validation](#ci-backed-quick-validation-of-a-conflict-commit) below.
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

Five details worth knowing:

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
- **The head-identity check applies to every merge.** The gate merges the base only into a checkout
  whose tip is exactly the head commit it just checked. Otherwise – a fork pull request whose head
  is not the same-name branch on `origin`, or a head that moved since the read – it merges nothing,
  pushes nothing, re-reads the status, ends the round and reports the mismatch. If the re-read shows
  a different head commit, the head moved and the next round decides from it. If it shows the same
  head commit, whichever trigger called for the merge, the gate compares the same-name branch on
  `origin` with it. A branch that is only ahead (the forge lags) stays transient. A branch equal to
  the pull request's head while the local checkout differs ends the run with a report. Anything else
  writes the base-merge-unavailable record once per run with the proof `different-commit`.
- **The base merge can be proven unavailable.** The gate looks for one of three proofs – two before
  it provisions anything for a merge, one at the head-identity check. Each writes the one
  base-merge-unavailable record, once per run, and from then on neither trigger merges again.
  - `fork` – the pull request states that its head is in another repository.
  - `missing-branch` – `git ls-remote` finds no same-name branch on `origin`. A lookup that fails
    any other way proves nothing: the gate reports it and carries on. A head branch name that fails
    validation ends the run with a report before anything is looked up.
  - `different-commit` – the same-head mismatch above.

  A `fork` or `missing-branch` proof ends the run with a report whatever the merge state, and so does
  a `different-commit` proof wherever the forge reports `BEHIND` or `DIRTY`. That run merges,
  commits, pushes and delegates nothing; the report lists the failing checks and tells you to merge
  the base, or resolve the conflict, where the head lives. A `different-commit` proof with any other
  merge state keeps the previous path: the failing check goes to `iterate`.

**The head branch is untrusted input.** The gate operates on any open pull request, including one
whose head branch lives in a fork this repository does not control, and the resolver discovers the
validation commands above from files that branch supplies – scoped instructions, CI workflows, task
runners, manifests, package scripts – then executes them in the provisioned checkout with full
filesystem and network access. Under the default `auto` this happens automatically, with nobody
asked. A project that gates pull requests it does not trust should set
`mergeGate.conflictResolution: ask`, so a human authorizes every resolution, or `off`, so no
untrusted branch's commands are executed by this gate at all. This holds on Forgejo too, where a
failing check on a behind head can now reach the auto-resolution (see below): set `ask` or `off`
there as well.

Whether the gate may do this at all is `mergeGate.conflictResolution` (default `auto`); see
[Block `mergeGate`](configuration.md#block-mergegate). On Forgejo the forge reports no merge state,
so neither `BEHIND` nor `DIRTY` is ever observed there. The path is reachable there only through a
failing check on a behind head (see below); a genuine conflict on a head without a failing check
still surfaces as a bounded loop ending in a report rather than as the fast conflict path. A
conflict met through a failing check whose cause the base does not fix ends in a controlled stop
without an `iterate` repair: the resolution's full verification runs into that red check.

#### CI-backed `quick` validation of a conflict commit

A gate run that resolves a conflict used to validate the merge commit in `full` mode every time, and the
resolver ran the repository's combined gate on top of it, so a one-minute conflict could cost two full
test-suite runs. `mergeGate.conflictValidation: quick` (default `full`) lets a repository whose pull
request CI already runs its test suite skip that local run for a **low-risk** conflict. It governs only
the conflict-resolution commit; `review.validation` and `applyReview.finalValidation` are untouched. The
key is set in [Block `mergeGate`](configuration.md#block-mergegate).

The configured value is a ceiling, and the run decides again in every conflict round. It validates in
`quick` mode only when all of these hold before the push; otherwise it validates in `full` mode:

- the same `mergeGate.conflictValidation: quick` row is on the base branch (read after the run's
  fetch), so a pull request cannot lower its own validation; in hidden mode the local file counts;
- the base branch has a CI job that runs the repository's bare test command on every pull request
  that targets it, with no condition, filter or indirection the run cannot prove;
- the pull request changes no workflow file, and no workflow it references;
- the forge is GitHub, and the job is known to block the merge: either
  `mergeGate.requireAllChecks: true`, or the job is reported as a required check;
- the resolver rated no conflicted file high-risk.

Under `quick` the resolver runs targeted checks for the conflicted and adjacent paths only, and the
validator runs every established check except the detected CI test commands once. Where a mandated
combined gate contains that command and its remaining parts cannot run separately, the run uses
`full`. A conflict that needs an adjacent-file fix and surfaces that failure only in the validator
aborts under `quick`; that is the accepted trade-off.

Because the test command then runs only in CI, the **merge** needs proof. Before it merges, the gate
checks on a fresh status read that the CI job's complete set of instances succeeded on the exact head
it merges, from the detected workflow, and that the base has not changed its workflows since. A
skipped, neutral, failed or ambiguous result is no evidence, and the check-list waiver and the no-CI
policy never stand in for it. A job that has not appeared on the head yet, as right after the
push, makes the gate wait once in the same round, for at most `mergeGate.checkWaitMinutes`; if it
still has not appeared, the gate stops and says so. A job that is still running makes the gate wait
in its next round, within `mergeGate.maxRounds` and `mergeGate.checkWaitMinutes`. A reviewer thread
or verdict the run still has to assess goes first. Without the evidence the gate does not merge: it
reports what is missing and leaves the pushed commit in place, with no force push and no local
`full` run afterwards.

The proof requirement travels with the commit, not with the run. A merge commit validated in `quick`
mode carries the trailer line `Effective-Flow-Conflict-Validation: quick` in its message; a gate that
cannot confirm the trailer before the push stops with "quick marker not verified" and pushes
nothing. While `mergeGate.conflictValidation: quick` counts, as the first condition above states, every gate run looks
for that trailer among the pull request's commits that are not on the base before it merges. So a
later run, or a run that never saw the conflict, still demands the same CI evidence; when it cannot
read the history, for example in a shallow clone, it demands the evidence anyway. Where no evidence
can exist – on Forgejo, or once the base's CI test job is no longer detected – the gate does not
merge: its report names the marked commits, and the way out is a merge by hand or a history rewrite
that drops them.

A repository that has not opted in is unaffected: under `full` the gate looks for no trailer and
adds no merge condition. One limit follows from that: a `quick` commit pushed earlier merges on the
ordinary checks alone once the base has switched back to `full`.

While `mergeGate.conflictValidation` is `full` and the conditions above hold, the completion report
carries one line proposing `quick`, with the workflow file, the job and the test command. The run
never switches by itself and asks nothing during the run; `/effective-flow setup` makes the same
offer.

#### When the environment itself fails

If a check cannot run because of the environment, not the change, the run stops instead of working
around it. The signatures are: the execution environment's own wall-clock limit (a runner or container
deadline or timeout), no space left on device, Git unavailable for a check that needs it, and a process
whose termination could not be confirmed. A check with one of these counts as not executed. Both
roles report the check and its diagnostic, and neither splits the suite, compares against the base or
reruns it. The gate then ends the round before the commit and the push, reports the signature and the
affected checks, and pushes nothing. A timeout of the agent's own tool, or one that cannot be
attributed, is not a signature and keeps the previous behavior, so repositories with long suites run
as before.

#### Another gate on the same repository

Each gate run keeps one small marker file below `.effective-flow/merge-gate-presence/`, named
after its session, with its pull request number, head, base and last activity. At entry the run lists
the other markers and shows one line per valid one, naming that run's pull request and the files both
runs change. A marker with no activity for more than 24 hours is shown as possibly stale, never as
active. The notice only informs: it changes no gate decision, and it is not a message to the other
session. A run releases its marker when it ends, except when it returns a question to you or
suspends, so a waiting run stays visible. [`cleanup`](tools-setup.md#effective-flow-cleanup) removes
a marker only when its run's wisdom file is gone.

#### A failing check on a behind head

On a base that does not require branches to be up to date, the forge does not report a head that
merely lags its base as `BEHIND`, and a check that fails only because its fix is on the base would
otherwise go to `iterate`, which cannot merge the base. The gate therefore has a second trigger for
the same merge. It fires when the latest status read shows a check failing by the gate's check
criterion – `mergeGate.requireAllChecks` is respected, and skipped or neutral checks never count –
and the head commit does not contain `origin/<base>`. That is a Git ancestry check, independent of
forge state, so it also works on Forgejo. The gate then merges the base into the head exactly as it
does for `BEHIND`, **at most once per run** and before any `iterate` delegation; a head that is
green and merely behind stays untouched.

- **Undetermined ancestry.** If the ancestry cannot be determined – missing data, a failed fetch, a
  shallow clone – the gate keeps its previous path to `iterate` and reports why.
- **Round cost.** When the red check is the pull request's own defect, the merge costs one extra
  round before `iterate` sees the failure. When checks only fail during the wait, the guard round,
  the merge round and the next wait round all pass first. With `mergeGate.maxRounds` of 1 the run
  ends before the merge; with 2 it performs the merge but ends before the merge's new checks
  complete or `iterate` repairs anything. A head-identity mismatch on an unmoved head means the merge
  cannot run: unless `origin` is only ahead or a local checkout diverged, it costs one round and
  records `different-commit`, and the next round hands the failing check to `iterate` – unless the
  forge reports `BEHIND` or `DIRTY`, where the run ends with a report instead. A `fork` or
  `missing-branch` proof ends the run in the round that finds it.
- **Once, then `iterate`.** If the check is still red after that merge, it goes to `iterate` even if
  the base has moved again. Once a base-merge-unavailable record exists, the merge is not tried
  again either.
- **Same boundaries as `BEHIND`.** The human-comment guard and `report` mode do not block it; only a
  caller limit of `no-branch-writes` prevents it. The head-identity check above applies.

#### Three reviewer states, not two

For each configured reviewer the gate establishes one of three states, and it treats them
differently:

- **Running** – a check context configured as `mergeGate.bots.<login>.check` is in a non-terminal
  state. The gate waits for it and posts **no** trigger comment: the reviewer is already working,
  and a trigger would either queue a redundant second run or, for a reviewer that reads a mention as
  a fresh request, discard the one in flight.
- **Not started** – no evidence that the reviewer has run or is running for the current head. This
  is the state that gets the trigger comment, followed by a wait. The one exception is a reviewer
  with a configured `mergeGate.bots.<login>.check` that **has run** with a stale changes-requested
  verdict: another check run (not a commit status)
  was re-run after the verdict and came back green at the unchanged head, so the gate re-posts the
  trigger once for that verdict and reports the verdict as stale if no new review follows. Only an
  actual re-run counts – a run that replaced an earlier run of the same check. A check whose first
  run merely started after the verdict does not, and a job re-run inside the same workflow run
  cannot be detected, so that verdict is not re-triggered and keeps blocking like any
  changes-requested verdict.
- **Has run** – a configured check reached a terminal state against the current head, or the
  reviewer's own output – a comment, a review thread, a thread reply, or a **submitted review** – is
  newer than the head commit. The gate proceeds to its findings. Note what
  this state does and does not say: the reviewer **finished**, not that every thread it wrote has
  already appeared on the pull request. The gate therefore checks again before merging – see
  [A reviewer thread that arrives late](#a-reviewer-thread-that-arrives-late).

A reviewer **without** a configured `.check` context keeps the previous two-state behavior – "has
run" or "not started" – because the fallback signal (comparing the reviewer's newest output against
the head commit's timestamp) genuinely cannot tell "running" from "not started". That fallback now
also weighs a **submitted review**, which is the reviewer's own published verdict rather than a
by-product: a reviewer whose only output for a head is a review used to look like one that had never
started, and now reads as one that has run. On a project with no configured `.check` that is a
change in behavior, not only in visibility – such a pull request can now reach the merge it
previously blocked at. Configuring
`.check` for a reviewer that publishes a commit status or check run is therefore what buys the
third state. A state that cannot be established at all still counts as "not started", which blocks
the merge rather than passing it.

**Unconfigured-reviewer hint.** When a normal gate read sees a bot-typed submitted review or review
thread, but the effective configuration either lacks that reviewer login or has the login without a
`.check`, the final chat summary includes one non-blocking advisory immediately before its next
steps. Repeated sightings and the bare/`[bot]` spellings are reported once. A check name by itself or
a top-level bot comment does not qualify, so ordinary CI, coverage, deployment, and dependency
activity does not produce the hint; a reviewer that writes only a top-level or sticky comment can
therefore go unnoticed. The advisory does not enroll the reviewer in the current run, trigger or
wait for it, change a merge condition, write the project-setup ADR, or post to the pull request. After
listing the reviewers, it gives one copy-paste-ready
[targeted setup request](tools-setup.md#targeted-changes-and-questions) for all of them,
with the reviewer's login filled in (the observed login for a missing reviewer, the configured
spelling when only `.check` is missing):
`/effective-flow setup add <login> to mergeGate.bots and ask me for mergeGate.bots.<login>.trigger and mergeGate.bots.<login>.check`
for a missing login, or `/effective-flow setup ask me for mergeGate.bots.<login>.check` when only
`.check` is missing. Several reviewers are joined with "and" in one request, so one setup run shows
one preview and asks for one confirmation. The request carries no check name: setup asks for
`.check` itself and keeps an existing login and trigger when only `.check` is missing. The Guided
route follows as the fallback: `/effective-flow setup guided` → **Advanced settings** →
**Block 9 (`mergeGate`)**, where you add or select the login in `mergeGate.bots`. On either route, set a distinctive per-reviewer trigger only
when the tool supports one, and copy the exact `.check` context from the checks list of a pull
request that reviewer has handled. Never guess the context: `.check` is left unset only by
answering "not set" in setup, for a reviewer without its own check context.

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
finding the run assessed and set aside gets no thread reply by design, so it is silent in that
other question; a thread that was never assessed at all is what blocks here. Handing a thread over
is not an assessment of it either: an item whose fix failed, and an item you deselected at the
delegated run's own approval gate, come back as `unassessed` and block exactly as a thread nobody
saw does, and so does a thread the gate named that the delegated run left out as already addressed.
A thread this run already recorded as implemented is not handed to `iterate` again in a later round,
on any forge; if it is still unresolved at the merge check, the report names it. A thread the run **deferred or rejected** takes the same confirmation a set-aside review
finding does; see
[Confirming a finding the run set aside](#confirming-a-finding-the-run-set-aside).
On a forge that can neither reply to nor resolve review threads, such as Forgejo, a thread the
reviewer's own later approval has settled is left out of this check; see the Forgejo note under
**Input/output**.

What you will see when a late thread turns up:

- **While rounds remain:** the run goes back to the automatic-reviewer round for exactly those
  threads and handles them like any other reviewer finding. That return costs one of the rounds
  allowed by `mergeGate.maxRounds`, which is what keeps a reviewer that keeps publishing from
  cycling forever.
- **With the round budget exhausted:** the run ends with a report naming every thread that was
  never assessed. It does not merge, and it never merges "because the checks were green anyway".

#### A reviewer that requests changes

A reviewer can state a blocking objection in three places, and until now the gate read only two of
them. Its inline comments arrive as review threads and its notes as pull-request comments – but the
**verdict** itself, and any finding a reviewer writes into its review body rather than as an inline
comment, live on the review object, which nothing read. A reviewer could request changes and the gate
would report every condition satisfied and merge.

It now reads the submitted reviews too, at the same instant as the status and the threads, and two
things follow from that.

**A merge precondition of its own.** Where a configured reviewer's **latest** review for the verified
head requests changes, the merge is blocked while this run has not disposed of it – finding by
finding. Only a finding the delegated run **implemented**, and only where the head actually moved in
that round, clears on its own; a finding it deferred or rejected clears once **you** confirm it, and
a finding that came back unassessed does not clear at all. What blocks is the **absence of a
disposal the gate may act on**, never the disagreement: this gate never approves and never requests
changes, so a rejected finding is reported in the run's chat summary rather than argued with. A
verdict bound to an **earlier** head does not block on its own; a moved head resets
every reviewer's state instead, and the run may not merge until each configured reviewer has run for
the new one. Exactly as with a late thread, a verdict the run cannot assess sends it back for another
round while rounds remain and ends in a report once they are spent – and where both a late thread and
an unassessed verdict are outstanding, one round handles them together rather than costing two.

A verdict stops blocking when the reviewer submits a later **approving** review for the same head,
when the verdict is **dismissed**, when the run implements every finding it carries and the head
moves with it, or when you confirm the findings the run set aside. Which of those apply depends on
what the reviewer wrote and on how the delegated run classified it, so the list is not a fixed count
of routes out. A later **commented** review – the shape every batch of inline comments takes – withdraws
nothing, so a reviewer that requests changes and then adds one more inline comment does not quietly
clear the block. A later **undecided** review – one whose state the run cannot map onto a known
verdict – clears nothing either, and it blocks in its own right: a configured reviewer whose latest
review at the verified head is undecided counts as an unassessed verdict even where no
changes-requested review stands behind it.

**A third surface for the human-comment guard.** A changes-requested review from an account that is
neither a bot nor the one the run is authenticated as holds the guard, exactly as an open comment
from that account does. Only that one verdict counts, and only on the author's latest review: a
commented or approving review never activates a guard that, once set, is never cleared, and a
reviewer who later approves stops holding one.

Where the reviewer's verdict cannot be established at all – an author or a head binding the read
cannot pin down, two reviews from one login at the same head with identical submission times, or a
latest review whose state the run cannot map onto a known verdict – the verdict counts as unassessed
and the merge blocks. That last cause is scoped to this merge condition alone: it deliberately does
not activate the human-comment guard, which is not scoped to configured reviewers and, once set, is
never cleared. If the forge cannot serve the review read at all,
the run reports that the verdicts are unestablished and asks once; a non-interactive run ends there
and never merges. The run's summary lists every configured reviewer's changes-requested review at the
verified head with a per-finding outcome, and every changes-requested review whose author matches no
configured login – the latter blocks nothing, but the run never stays quiet about it.

#### Confirming a finding the run set aside

`/effective-flow iterate` does not fix every finding: it rejects the ones it reads as false
positives and defers the ones it reads as out of scope or as questions. Those two classifications
are a **judgment about text the reviewer wrote**, produced by a run that read that text – and a pull
request can influence what a reviewer writes. Nothing on the forge corroborates them either, because
the gate deliberately writes no reply and no resolution for a finding it did not implement. So the
gate no longer merges on one by itself.

What you see instead, in a run allowed to merge: **one question per round that has something new to
ask**, listing every finding
and thread the run set aside with its review id, its author, the review URL and the outcome the
delegated run returned – a thread is listed with its thread ID and its own comment link, so every
item on the list has somewhere you can go and read it – and no reviewer text at all. Reading the finding is the point of the
question, so it sends you to the review rather than quoting it at you. Answering **Confirm** treats
those items as disposed of for that round and the gate continues; answering **Stop**, or leaving it
unanswered, ends the run with a report and starts no further round.

**Confirming does not always mean the run merges that round.** One evaluation can hold set-aside
items beside items nobody assessed at all. The question clears the first group, and the second goes
back for another round – in the same single return, costing one round rather than two. Holding the
question back until nothing else is outstanding would be worse: the set-aside item would sit in
neither branch, and no later round would ever move it. Your answer carries forward, so a confirmed
item is not put to you again next round: the run records it against the finding's own identity – the
review it belongs to, or the thread's forge ID – and every later round of the same run reads that
record before it composes the next question.

**Unless the head moves.** A new commit on the pull request re-runs the reviewer and its findings are
derived afresh, so every confirmation recorded before that commit expires with it – exactly as the
verified head SHA and each reviewer's observed state already do. You are asked again for whatever
the new round sets aside, about findings you can go and read at the head that is actually being
merged. What that does **not** catch is a reviewer that rewrites a review body, or adds to a thread,
without the head moving at all: the finding behind a confirmed item can change while its identity
does not. That is the same blind spot an in-place edit already has for the run's assessment record,
and it is worth knowing about when a reviewer of yours works that way.

Three things it deliberately does not do:

- It never clears an `unassessed` item. A judgment you can go and read and no judgment at all are
  different things, so an unassessed finding keeps going back for another round instead.
- It is never posed in a report-mode run, where no answer could authorize a merge anyway, and it
  cannot be posed in a non-interactive delegated run – which therefore blocks and reports.
- It does not make the classification true. A run steered by the review body can reach a rejection
  that looks entirely honest; what changes is that no merge happens on one without somebody having
  looked at the finding.

A finding the delegated run reports as **implemented** clears on its own, but only where the head
commit actually moved in that round. That is coarse on purpose – it proves a commit existed, never
that the commit addressed the finding – and it closes the "claim implemented, change nothing" path.

#### What the gate accepts back from a delegated run

Every code change the gate wants is made by `/effective-flow iterate`, and the gate builds its
per-finding assessment record out of what that run reports back. Two things make that report a
contract rather than prose.

**One closed vocabulary, agreed on both ends.** An item comes back as `implemented`, `deferred`,
`rejected`, or `unassessed`, and nothing else. The first three are assessments – somebody read the
finding and reached an outcome about it. The fourth is the explicit absence of one, and it is what
you see when the item's own implementation failed, when the item was deselected at the delegated
run's approval gate, or when the delegated run left a named thread out as already addressed: nobody judged that finding, so it blocks the merge exactly as a finding no round
ever saw does. The delegated run classifies how it _processed_ an item and the gate classifies how a
finding was _assessed_, so the mapping between the two is written down in both tools rather than
guessed; "deferred" in particular does not mean the same thing on each side until it is pinned.

**The gate counts an outcome only for an item it recorded before delegating.** Before a round goes
out, the run has already written down every item identifier it is about to hand over – and one is
minted for every item it hands over, findings carried in a review body and reviewer threads alike. The forge's own publicly visible thread IDs are not part of that list: a thread ID travels out
so the delegated run can address the thread, and an outcome quoting one back states nothing.
On the way back it matches the report against exactly that list: the same outcome stated
twice for one item is the same outcome, two _different_ outcomes for one item end the round without
merging, an item with no outcome at all does the same, and an outcome naming an identifier the run
never handed over is reported and otherwise ignored. Nothing else in the returned text produces an
outcome.

That last part matters because a review body is text a pull request can influence, and the same
delegation hands those bodies over – and no value such a body can contain is a key at all, because
every key was minted for this one message and never published anywhere.
Ignoring an unrecognized identifier rather than aborting on it is
deliberate: aborting would let a review body cost the run a round just by naming something. Those
ignored entries are listed in the run's chat summary by identifier and count, up to a bound, and
never by quoting their text back at you.

**The outgoing message is built and checked by a shipped helper, never by hand.** The
`delegation-envelope` script in the installed skill assembles every message the gate sends to
`iterate`: it mints the item identifiers, states the run state (`gated` or `non-interactive`) and
the resolved languages on their own control lines above the item texts, and checks the finished
message before it goes out. A review finding whose text contains the message's delimiter line, a
finding whose review carries no URL or no author (refused as `missing-provenance` rather than given
an invented link), or an empty review body, is not handed over; the first two count as unassessed
and keep the merge blocked. A CI-repair instruction that looks like part of the message format is
refused: the run ends right there with a report naming that check as not auto-repairable, merges
nothing, and starts no further round that would only refuse the same instruction again. If the helper itself fails or cannot be run – missing from the installed build, or no
suitable `node` – the gate stops before `iterate` runs, writes nothing further to the pull request,
and names the helper's error code. That stop
costs no round.

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

A third source of authorship is declared by the project rather than reported by the forge:
`mergeGate.botAccounts` lists automated accounts the forge types as users, and the guard excludes
their top-level comments and review-thread items. It does not apply to a submitted review, so a
changes-requested review from a listed login still counts.

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
  tracker transition. Where that check stops at the non-closing `Refs` relationship or at
  `effective-flow-needs-planning`, the step also names the open points recorded for that issue – at
  `effective-flow-needs-planning` because settling them is what the planning path has to do, and at
  the non-closing `Refs` relationship because that check matches every `Refs`-linked issue and is
  otherwise the whole guidance such an issue ever gets. It does not invent unobserved work.
- The report also names, per linked issue, the completion verdict – `complete`, `incomplete`, or
  `undetermined` – and the criterion locators behind it: which criterion, and whether its covering
  statement sat in the merged pull request's title or body. It quotes no criterion text and no
  pull-request text; you read the wording at the issue and pull-request URLs. Per issue it then says
  whether the terminal transition was offered, how you answered, and what the transition did –
  including, for a non-interactive run, the transition it recommended instead of posing, and, where
  the offer was unavailable, which capability or configuration value was missing on which connection.
  That last case is reported as unavailable, never as an incomplete issue.
- Per assessed issue the report then names the **open points** recorded in that issue's canonical
  planning comment – the implementation-blocking decisions
  [`/effective-flow plan-issue`](tools-understand.md) left standing in the comment rather than in the
  issue body, which is why no other read of the gate ever sees them. You get it for every issue the
  run assessed, whichever closure step that issue was given, and it keeps three results apart: the
  recorded entries; that none were recorded, saying which of three reasons applies – the comment
  states its empty section, the comment predates the section and carries none, or the issue carries
  no canonical comment at all; and that the open points are unobserved, because the comment could not
  be read. An issue that was already terminal when the grace period ended is never
  assessed and carries no such line. This is the one place the gate quotes issue text, and it can
  afford to because these open points are **report-only**: they enter no completion verdict, block no
  `complete` one, reach no terminal-transition offer, and authorize no write. At most twenty entries per issue are
  quoted and each is cut at 500 characters, with the truncation stated and the comment URL given, and
  anything inside an entry that reads like an instruction is shown as text and never acted on.
- The check gate, the merge, and the offered issue close are performed by the remote-tracker helper
  described in [Remote tracker](remote-tracker.md#merge-gate-operations), on both providers. Forgejo
  supports the status read, the check wait, the merge, the identity read and the issue close when
  the probed `tea api --include` transport is available. `tea` has no `checks` subcommand and
  Forgejo offers no server-side watch, so the helper performs bounded polling inside the same
  check-wait operation; the run does not spend a model turn per interval. `review-create` stays
  unsupported on every `tea`-backed forge.
  `review-thread-reply` and `review-thread-resolve` are probed per instance from the forge's API
  description: Gitea declares both routes and supports them, Forgejo serves neither, and an instance
  that declares only one route is served neither, whatever subcommands `tea` offers. The open-points observation adds one comment read per assessed issue
  through the same helper, and the absence of that capability costs exactly that observation – the
  report then says the open points are unobserved and every verdict, offer, and write is what it
  would have been anyway.
  On Forgejo that read rides `tea`'s issue and issue-comment support rather than the `tea api`
  transport the issue close needs, so a `tea` built without `--include` still reads the comment.
- On Forgejo the gate can neither answer nor resolve a review thread, so an unresolved thread from
  a configured bot counts as **provider-settled** once that same reviewer's latest submitted review
  for the verified head is an approval – a different review from the one that opened the thread,
  submitted after it. A dismissal alone settles nothing. A settled thread is no longer handed to
  `iterate` and no longer blocks the merge, and the report lists it with its URL as "left
  unresolved – the provider cannot resolve review threads". A thread that still blocks is named
  with its URL. If the gate's run implemented that thread, resolve it in the Forgejo web UI, where
  it may appear collapsed as "outdated" in the conversation tab, and re-run the gate, or re-run
  after the bot's next verdict. A thread that is still unassessed is cleared by a re-run, and one
  the run set aside by the same confirmation a set-aside finding takes; see
  [Confirming a finding the run set aside](#confirming-a-finding-the-run-set-aside). Do not reply
  in the thread, because your reply would make it appear as a human-authored thread.

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
receipt never selects one. The final next-step block reconciles the verified associated plan or
canonical issue-planning record with the observed merge outcome. Unfinished delivery, review, or
actual post-merge reconciliation takes priority over a later package. Observer-only
`/effective-flow merge-gate <PR>` re-entry is recommended only when it can address that unfinished
reconciliation; a parent intentionally open for later packages is insufficient by itself. A stale
planning record can instead lead to `plan` or `plan-issue` preparation through its known reference.
The general `open-plans` fallback appears only when there is an open local plan to list. This
selection is read-only, grants no approval, and starts no follow-up; see [Tool flow](tool-flow.md).

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
- [Model-tiering pilot data and privacy](model-tiering-pilot.md) – anonymous period observations,
  local evidence, consent, and retention
- [Remote tracker](remote-tracker.md#merge-gate-operations) – the forge operations the merge gate
  needs, and their `gh` version floor
- [Tools: Implement](tools-implement.md) – the workflows that `commit` and `pr` typically
  trigger at the end, and `iterate`, which the merge gate delegates every code change to
