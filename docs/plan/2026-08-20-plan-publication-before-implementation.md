# Publish the plan before implementation

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `830e07a` on 2026-08-20 — the tip of `origin/develop`, which the checkout is
level with. First written against `9efe8c5` and rebased after `cbcea61` (#361) and `830e07a` (#362)
landed; `830e07a` changed `src/tools/plan.md`, which this plan also edits, so every citation into that
file is against `830e07a`.
**Working state:** the tree carries four untracked plan files
(`docs/plan/2026-08-12-merge-gate-context-and-source-slimming.md`,
`docs/plan/2026-08-14-native-chatgpt-desktop-task-titles.md`,
`docs/plan/2026-08-20-archive-handshake-state-model.md`, and this file). Only the archive-handshake
plan is related; the other two must remain untouched.

**Depends on:** `docs/plan/2026-08-20-archive-handshake-state-model.md`, which exists, is fully
specified and carries no blocking open point. It has since split into two deliveries; this plan is
scoped against that split — see "Prerequisite" below.

## Requirement

A plan written by `effective-flow plan` never enters Git during the planning run. `src/tools/plan.md`
Phase 7 (lines 431–444) writes and formats the Markdown file and stops; `src/tools/plan.md:450`
forbids commits outright, and the hard scope boundary (lines 93–101) forbids any change outside
`<plan.dir>/`. The plan file is first committed at the **delivery point of the implementing run** —
`src/shared/worktree-integration.md:355-373` marks it `Implemented`, moves it with `git mv` into
`<plan.dir>/archive/`, and commits both into the implementation PR.

The consequence is that `<plan.dir>/` at top level is never a committed state. A finished, reviewed
plan exists only as an untracked file in one person's working tree — verifiable in this checkout,
where the open plans show as `??`. Nobody else can read it, reference it, or start dependent
work from it until the implementation itself is delivered, which is exactly the point at which the
plan stops being useful as a coordination artifact.

The goal is to make a finished plan a **published** artifact before implementation starts: committed
to the base branch, or opened as a pull request, according to the repository's existing delivery
default, so that other work can proceed in parallel on that basis.

This is a behavioral extension of one tool, so the recommendation is Feature (`effective-flow build`).

## Prerequisite: the archive handshake is a separate, earlier change

The deep review established that the archive handshake in `src/shared/worktree-integration.md` step 1
is shared by every code-changing workflow, and that it already carries defects independent of
publication:

- `git mv` on an untracked path is fatal, so the literal instruction cannot execute in the case it
  most often meets today.
- There is no state for a plan **already archived** on the base by an earlier run; such a plan is
  indistinguishable from an unpublished one and would be re-added at top level.
- The mark-and-move is described where the file lives, which after publication would stage an
  uncommitted rename in the user's main checkout.

Fixing that handshake is therefore its own change, planned and delivered **before** this one. It
owns: the archive states and their index-first detection, the never-rename-in-the-main-checkout
constraint, and the rule that no end state leaves two copies of one plan on the base branch. It reads
**no** publication receipt: it settled on detecting state from the index of the delivery checkout, so
the receipt-reading contract and the no-receipt fallback moved into its own deferred delivery (c),
which is gated on this plan. Splitting it keeps a defect in
the shared delivery path from being coupled to a planning feature, and lets publication land on a
handshake already known to be correct.

This plan consequently **writes** receipts and does not change `worktree-integration.md`.

## Architecture decisions

- **Reuse `delivery.completion`; add no configuration key.** `pr` publishes the plan as a pull
  request; `merge` and `branch` publish it as a direct commit on the base branch. This follows the
  standing decision in `docs/plan/archive/2026-07-16-0053-plan-datei-im-pr-des-worktree-handbacks.md`
  ("Kein neuer Config-Schalter") and keeps the plan run's publication mode aligned with how the
  project delivers everything else. The cost is accepted and named: for plan publication `merge` and
  `branch` collapse into one behavior, because a plan has no code to validate and no branch worth
  keeping around unmerged. The key now governs two unrelated events, which is why its three
  user-guide descriptions are in scope.

- **Publication is asked for exactly once per run, and never assumed.** Planning is currently a
  read-mostly activity, and turning every run into a Git-writing one without asking would be a silent
  change of contract. The question names the concrete remote and target branch, because "Publish"
  otherwise reads as a local action, and it carries any content-check findings in its own text so
  that answering "Publish" is the explicit acknowledgement. There is exactly one ` ```ask ` fence on
  this path. A run below a non-interactive orchestrator publishes nothing and reports why — the same
  fail-closed rule `src/shared/pr-review-integration.md:178-184` applies to `delivery.prReview: ask`.

- **Publication happens after the plan file is final, not before.** `src/tools/plan.md:493` has
  Phase 7 step 1 write the plan file, so publishing earlier would commit a version the run then
  rewrites — and would silently defeat the divergence mitigation below. The final write and format
  therefore move ahead of publication, and Phase 7 step 1 becomes a verified no-op whenever a
  publication ran.

  `830e07a` added a rule at `src/tools/plan.md:179-187` that every question a revision owes the user is
  asked before the plan is moved back from the archive, and that none is posed afterwards. The
  publication ask is not a revision-owed question — it is a delivery decision about the finished
  artifact, and Phase 6b's deep-review ask already sits on the same side of that move. The rule gains
  a one-clause carve-out naming both, so its literal wording stops contradicting two asks that
  legitimately follow the move.

- **The commit is created on a delivery branch, and the local base moves only after a successful
  push.** Committing onto the checked-out base and then discovering that the push is refused would
  strand an unpublished commit on the user's base, and the only undo is destructive. The order is:
  branch → commit → **push** → and only then fast-forward the local base onto the pushed commit. A
  refused push leaves the local base exactly where it was, which is what makes the fallback to a
  pull request a no-op on the object graph.

- **The branch is fresh on first publication and reused on republication.** These are the two halves
  of one rule, not a contradiction: the first publication of a plan creates
  `<delivery.branchPrefix>/plan/<plan-file-stem>` from the resolved base; a later publication of the same
  plan commits on top of the existing branch so that one plan keeps one pull request, consistent with
  `src/shared/worktree-integration.md:348-353`. Divergence between the local and the remote branch
  aborts and reports; it is never reconciled by rewriting history.

- **The fallback direction is one-way: direct commit may become a pull request, never the reverse.**
  A refused push to a protected base is a repository policy statement, and a pull request is the
  mechanism that protection prescribes — so this is compliance, not a workaround. It is deliberately
  a different posture from `src/tools/merge-gate.md:1194`, which stops and reports when a head branch
  is protected: there the protected branch is the one the run must repair in place and no alternative
  mechanism exists, whereas here the alternative mechanism is the project's own configured one.

- **Publication never rewrites history and never bypasses hooks.** Forbidden on this path:
  `--force`, `--force-with-lease`, `--no-verify`, `commit --amend`, interactive rebase, squash,
  `reset --hard`, `checkout -f`, `clean`, and `push --delete`. The amend/rebase/squash prohibitions
  are the same ones `src/shared/worktree-integration.md:348-353` already imposes on pushing onto a
  branch with an open pull request, which is exactly what republication does.

- **Publication writes a local receipt, and for now it is the only thing that reads it.** The receipt
  was first justified as the answer to a question the archive handshake needed — distinguishing
  "tracked only on an unmerged publication branch" from "untracked". That prerequisite has since
  settled on detecting state from the index of the delivery checkout, so it reads no receipt at all,
  and the cross-tool reader moved into its deferred delivery (c). The honest statement of what the
  receipt is today: **fragment-internal state for republication.** It answers two questions that
  `plan-publication.md` asks itself — is this a first publication or a republication onto an existing
  branch, and does the working-tree copy still match what was published — both of which are otherwise
  undecidable offline, which the plan's own offline edge case requires.

  The full schema is written anyway, including the `state` field, so delivery (c) inherits a receipt
  it can read rather than one it has to migrate. That is a deliberate cost: some fields have no reader
  until (c) ships.

  **`state` has exactly six allowed values, and each has one write point.** The set is closed: a
  reader that meets any other value treats the receipt as unreadable and falls back to its no-receipt
  path rather than guessing, which is what lets delivery (c) interpret it offline.

  | Value                 | Meaning                                                                     | Written                                                                                        |
  | --------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
  | `committed`           | The plan is on the base branch, and the local base points at it.            | Direct-commit mode, after the push succeeded **and** the local base was fast-forwarded onto it |
  | `pushed-not-merged`   | The commit is on the remote base, but the local base was not moved onto it. | Direct-commit mode, after a successful push whose local fast-forward then failed               |
  | `pull-request-open`   | The plan is on a publication branch with an open pull request.              | Pull-request mode, after `effective-flow pr` returned a URL, **before** the return switch      |
  | `branch-pushed`       | The publication branch is on the remote; no pull request is **confirmed**.  | Pull-request mode, after a push whose `pr` delegation returned no URL and preserved the branch |
  | `pull-request-merged` | That pull request has since merged, so the plan is on the base.             | A later republication run that reads `pull-request-open` and observes the pull request merged  |
  | `pull-request-closed` | That pull request was closed without merging; the branch may still exist.   | A later republication run that reads `pull-request-open` and observes it closed unmerged       |

  **The three recovery states exist because a later run must not mistake them for a fresh
  publication.** `branch-pushed` and `pull-request-closed` both leave a real branch on the remote, so a
  run treating either as unpublished would create a second branch for one plan, or push onto an
  existing one it never verified. A republication run reading either looks the branch up first: where
  it still exists and carries this plan, it reuses it and opens — or reopens — the pull request; where
  it does not, it publishes afresh and says so.

  **`branch-pushed` records an unconfirmed pull request, never a proven absent one.**
  `effective-flow pr` returns no URL both when creation genuinely failed and when creation may have
  succeeded while its confirmation lookup did not run, and it forbids retrying creation in that state
  (`src/tools/pr.md:258-260`). So a run resuming from `branch-pushed` **searches the forge for an
  existing pull request on that branch before creating one**, and creates one only when the search
  ran and found none. Where the search cannot run, it reports the unconfirmed state and creates
  nothing — the one outcome this state exists to prevent is a second pull request for one plan.

  `pushed-not-merged` is the direct-commit counterpart: the plan is published and only the operator's
  local base lags, so a later run fast-forwards it rather than republishing, and reports if it still
  cannot. **The publication branch survives that state**, which is the exception to step 7's deletion
  rule: deletion is what makes the branch redundant, and it is redundant only once the local base
  actually carries the pushed commit. The final checkout is the resolved return branch in both cases,
  reached by **direct-commit mode's own return switch in step 7** — step 8 is confined to
  pull-request mode and cannot serve it — and the run reports which branch it is standing on and
  whether the local base still lags.

  **`pull-request-merged` needs a branch transition, because a squash merge leaves the old branch
  unmergeable.** `delivery.mergeMethod` defaults to `squash` and is `squash` in this repository, so
  the base gains a single new commit that the publication branch does not contain and is not
  descended from. Committing a revision onto that retained branch would therefore reopen the plan
  file as an add/add conflict against the squashed base rather than as an update. So a run reading
  `pull-request-merged` **does not reuse that branch**: it deletes it locally and remotely once the
  merge is observed, and republication starts a fresh branch from the refreshed base under the same
  dated name, which now resolves to a new branch. That is a non-rewriting transition — nothing is
  rebased, amended or force-pushed; one branch ends and another begins — and it is why the state
  exists rather than collapsing into `committed`: the plan is on the base, but the path back to
  editing it differs.

  Two consequences are stated rather than left to be derived. A **refused** push writes no receipt at
  all in direct-commit mode — the run falls back to pull-request mode and the receipt it eventually
  writes is `pull-request-open` or `branch-pushed` — so no state ever describes a publication that
  never reached the remote. And the last two values are the only ones a run other than the publishing
  one writes, which is why both are observed rather than assumed: a republication run that cannot
  reach the forge leaves the receipt at `pull-request-open` and reports that it could not confirm
  either outcome.

  The receipt is runtime state under `.effective-flow/`, so the new fragment carries the canonical
  runtime-state guard. `findRuntimeStateSafetyViolations` scans a shared fragment only when it is
  reachable through an include chain from a tool or agent — `walkRuntimeStateMutations` roots at
  non-`shared/` contexts — and `plan-publication` is reachable from `plan.md`'s own fence, so it is
  covered. `src/tools/plan.md` already lazily includes `runtime-state-safety` itself.

- **After a pull-request publication the run returns to the base branch and leaves the plan file
  behind as an untracked copy.** `open-plans` reads the file system by status marker
  (`src/tools/open-plans.md:41-46`), not Git, and `apply <plan-file>` needs the file on disk.
  Returning to base without the file would make a just-published plan invisible to the two tools that
  consume it. Plan 0053 once removed such a copy to avoid a dangling file — but **that cleanup rule
  is no longer present anywhere in the live `src/shared/worktree-integration.md`**, so this decision
  reverses nothing; it makes an already-existing leftover deliberate and gives it a receipt so its
  divergence can be detected. The phantom top-level plan that `open-plans` reports as open is
  therefore a **pre-existing** condition of every worktree PR delivery, not a new risk of this
  change. What is genuinely new is the checkout collision after the plan pull request merges.

- **An implementation is never stacked on an open plan pull request; merging the plan first is what
  keeps archival clean.** Branching the implementation from the publication branch would put the plan
  PR's commit into every implementation PR, turning an ordinary delivery into a stacked review.
  Instead, the next-step rows lead with `merge-gate <PR>` after a pull-request publication — because
  merging the plan pull request puts the plan **on the base**, which is exactly what makes the archive
  handshake's tracked-plan state fire cleanly when the implementation later delivers.

  `merge-gate` itself archives nothing. Archival lives entirely in the prerequisite change and
  `src/tools/merge-gate.md:145` ("no plan-file status switch and no archiving") stays true. A
  published but unimplemented plan carrying `Not implemented` on the base is not a defect to be
  papered over — it is accurate, and `open-plans` listing it is correct: the plan is published, not
  implemented. Marking it implemented at publication time would be the actual error.

- **Scope stays at `effective-flow plan`.** `concept` and `plan-issue` keep their current behavior.
  The asymmetry to `concept` is deliberate: a concept is not a work basis that others branch from,
  and `plan-issue` already publishes into the tracker.

- **The publication mechanics live in a new shared fragment, lazily included.** The build's
  `BUDGET_TOOLS` guard reports the `plan` core at **619 of its 700** budgeted lines at `830e07a` — up
  from ~552, because `830e07a` added 66 lines to `src/tools/plan.md`. With 81 lines of headroom an
  eager include is out of the question, and the pointer plus this plan's own additions to the core
  (Phase 6c, the two amended rules, the scope boundary, the Phase 7 report line) have to fit inside
  it. A `lazy-include` costs about three lines. The budget line in the build output is a real
  constraint for this change, not a formality.

## Affected files

| File                                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/plan-publication.md`           | **New.** The publication contract: declared inputs, mode resolution, the single ask with the folded content check, branch construction and reuse, the commit, push-then-fast-forward ordering, the one-way fallback, receipt writing, republication, the return-to-base behavior, the prohibition list, and the report vocabulary. Carries the canonical runtime-state guard and the `Next steps: suppressed` line at its `effective-flow pr` delegation site. |
| `src/tools/plan.md`                        | New Phase 6c (publication) after the final write; the final write and format move ahead of it and Phase 7 step 1 becomes a verified no-op; `lazy-include` fence for `plan-publication`; amended `## Rules` at `:512` and the staging rule at `:513-516`, plus the hard scope boundary; Phase 7 report extended by the publication line; `catalogHint` updated.                                                                                                 |
| `src/shared/next-steps.md`                 | The three existing `plan` rows are re-worded to name the unpublished case; three new rows cover the pull-request and unpublished-branch cases. The justification prose at line 52 names the old row key verbatim and is updated with them.                                                                                                                                                                                                                     |
| `docs/user-guide/tool-flow.md`             | Row-for-row, order-sensitive, exact-string mirror of all six rows; `findNextStepsDocViolations` compares by index.                                                                                                                                                                                                                                                                                                                                             |
| `docs/user-guide/tools-understand.md`      | Lines 3–6 claim the planning tools "either read only or keep their writes within the designated planning surfaces" and that none changes configuration; the `/effective-flow plan` section describes a purely local artifact.                                                                                                                                                                                                                                  |
| `docs/user-guide/worktree-and-delivery.md` | Lines 151–153 document `delivery.completion` as deciding what happens "after the actual work is finished"; it now also governs plan publication.                                                                                                                                                                                                                                                                                                               |
| `docs/user-guide/configuration.md`         | Line 397, the `completion` row of the `delivery` table; same correction.                                                                                                                                                                                                                                                                                                                                                                                       |
| `test/workflow-contracts.test.mjs`         | New assertions for the publication contract, the receipt schema, and the six next-step rows; `src/shared/plan-publication.md` added to the returning-delegation site table with delegate `pr`.                                                                                                                                                                                                                                                                 |
| `docs/adr/effective-flow-project-setup.md` | Untouched — no new key. Listed to record that the check was made.                                                                                                                                                                                                                                                                                                                                                                                              |

`src/shared/worktree-integration.md` is deliberately **absent**: its archive state model belongs to
the prerequisite change.

## Implementation details

### Approach

1. Write `src/shared/plan-publication.md` as a self-contained contract with the sections below. It
   declares its inputs explicitly — the verified execution root, the resolved `delivery.completion`,
   `delivery.baseBranch`, `delivery.branchPrefix`, `delivery.returnBranch`, `plan.dir`,
   `language.git`, `language.forge`, the run state, and the absolute path of the finished plan file.
2. Resolve the publication mode per the table below.
3. **Resolve everything the question must name, before asking — read-only.** The ask names the
   concrete remote and target branch, and it must suppress itself where publication is unavailable,
   so the base resolution and the publishability checks of step 4 run **first**. Split step 4 at the
   mutation boundary rather than moving it wholesale: every read in it — resolving
   `delivery.baseBranch`, deriving the remote per base shape, confirming the resolved base ref
   exists, and the working-tree preconditions — happens here.

   **The one Git operation before consent is the base fetch, and it is named rather than denied.**
   Canonical resolution runs `git fetch REMOTE BRANCH` for a remote base
   (`src/shared/base-branch-resolution.md`), so this step is not literally read-only. What it must
   not do is touch anything the user would have to undo: it writes **no** commit, moves **no** local
   branch, changes **no** checked-out file and stages nothing. Updating a remote-tracking ref and the
   object store is what lets the question name a target that actually exists, and a failed fetch is
   exactly the unavailability the ask must suppress itself on — deferring it past consent would put
   the question first and the fact second. Where
   that resolution finds publication unavailable, pose no question at all, publish nothing, and
   report which case applied. Then run the content check and ask once, with the findings rendered
   inside that one question. On a non-interactive delegated run, skip the ask, publish nothing, and
   report that the question could not be posed.

4. Carry step 3's already-resolved results forward and perform the first Git mutation only here, so
   nothing below re-resolves a value the question was posed against. The preconditions it verified:
   the plan file exists at its final path; no staged changes are present;
   no unrelated tracked modification blocks a branch switch. Resolve `delivery.baseBranch` **once**
   through `src/shared/base-branch-resolution.md` and carry **both** of its recorded results through
   every step below — the **resolved base ref**, which a branch is created from, and the **resolved
   local base branch**, which every push and checkout target uses. Verify that the resolved base ref
   exists. Never reuse the configured value for both: with this repository's
   `delivery.baseBranch: origin/develop` the ref is `origin/develop` while the local base branch is
   `develop`, and passing the configured value where the local name belongs creates a remote branch
   literally named `origin/develop`. Stage the plan file explicitly by path — never `git add -A` or
   `git add .`.
5. Determine first-publication versus republication from the receipt. Create the branch fresh from
   the **resolved base ref**, or check out and update the existing one; abort on divergence.
6. Commit the single file using the commit logic of `effective-flow commit` and the message rules of
   `src/shared/commit-message-rules.md`. Type `docs`; no `Co-Authored-By`; no AI attribution.
7. Push. In direct-commit mode the push is
   `git push <remote> <branch>:<resolved-local-base-branch>` — the local branch name taken from step
   4's recorded results, never from the configured value — and deliberately not `pr`'s
   `git push -u origin <head-branch>` (`src/tools/pr.md:147`), which would create a remote branch
   instead of advancing the base. On success, fast-forward the **resolved local base branch** onto
   the pushed commit. **Switch to the resolved return branch before deleting anything**: the run is
   standing on the publication branch, and Git refuses to delete the branch that is checked out. The
   return switch is therefore direct-commit mode's own step, not a borrowing of step 8, which is
   confined to pull-request mode — it clears the untracked twin the same way step 8 does, and a
   refused switch is reported and leaves the run where it stands. Only then delete the
   now-redundant local publication branch — **redundant only once the local base actually carries
   that commit**, so a failed fast-forward keeps the branch, records `pushed-not-merged`, and still
   returns to the return branch. On any refusal of the push itself —
   protection, non-fast-forward, missing remote, auth — the local base stays put and the run
   continues at step 8, reporting the switch and its reason.

   **Which remote, per base shape.** Canonical resolution records a remote only for a base that
   names one, so this path defines all three shapes rather than assuming `origin`:

   - **Base names `origin`** (`origin/develop`, this repository): push to `origin`. Both this step
     and the step-8 fallback are available.
   - **Base names another remote** (`upstream/main`): push to that remote. The pull-request fallback
     is **not** available — `effective-flow pr` requires the base to be tracked on `origin` and
     aborts as **base branch tracked on a non-`origin` remote** (`src/tools/pr.md:158`) — so a
     refusal here ends publication with a report naming that remote, and never silently retargets
     the pull request at `origin`.
   - **Slashless base** (`develop`, no remote recorded): resolution names no remote at all, so the
     remote comes from the **resolved local base branch's own upstream** — `@{upstream}` of that
     branch, whose remote half is the one it actually tracks. That is the only value which states
     where this base is published; `origin` merely being configured says nothing about it, and
     picking it on that ground can push to the wrong repository or advance a branch nobody tracks.
     Where the resolved local base branch has **no** upstream, or its upstream names a branch other
     than that base, publication is unavailable in both modes — report which of the two applied and
     publish nothing. Never fall back to `origin`, to the single configured remote, or to the
     current branch's upstream.

     **Refresh that upstream and branch from its remote-tracking ref.** Canonical resolution fetches
     nothing for a slashless value, so the local branch may simply be behind — the ordinary state of
     a checkout nobody just pulled — and branching from it would build the publication commit on a
     stale head and earn a non-fast-forward rejection even though the upstream is healthy. Fetch the
     discovered upstream and create the branch from **that remote-tracking ref**, while the push and
     checkout targets stay the local base branch name. This mirrors `pr`'s remote-not-configured
     arm, and it is the same split the two-result rule already makes everywhere else: the ref is
     what you branch from, the local name is what you push to.

8. In pull-request mode (chosen or fallen back into): push the branch and delegate to
   `effective-flow pr` with the delivery payload plus the literal line `Next steps: suppressed`.
   **`effective-flow pr` restores no checkout** — `src/tools/pr.md:261-263` states that it never
   switches or otherwise restores one, because it did not create or change one — so this fragment
   owns the return itself.

   **Write the receipt first, then switch.** The receipt records that the pull request exists, which
   is true the moment `pr` returns its URL and stays true however the switch then goes; ordering it
   after the switch would lose that fact on exactly the failure the operator needs it for. The
   untracked copy is the only part gated on the switch.

   Then switch back to the resolved return branch (`delivery.returnBranch`, `auto` meaning the branch
   the run started on) and leave the publication branch in place locally and remotely. **Clear the
   deliberate untracked twin first:** after an earlier publication the return branch carries an
   untracked copy at the same path the publication branch tracks, and Git refuses the switch even
   when the contents match. Compare that copy against the committed content, remove it when they
   match, and stop with a report when they differ — a divergent copy is unpublished work and is never
   discarded to make a switch succeed. A refused or impossible switch for any other reason — an
   unrelated tracked modification, a missing return branch — is reported and leaves the run on the
   publication branch; the pull request already exists and is not rolled back.

9. Standing on the restored return branch, re-materialize the plan file as an untracked copy in the
   working tree. That copy is what makes the published plan visible from the base branch, so it is
   written only after step 8's switch is confirmed. On a reported failed switch the receipt written in
   step 8 already records the publication, no copy is written, and the report names the branch the run
   is standing on.
10. Wire the fragment into `plan.md`: the `lazy-include` fence, Phase 6c, the moved final write, the
    amended rules, the extended Phase 7 report, the `catalogHint`.
11. Update `next-steps.md`, its line-52 prose, and the `tool-flow.md` mirror; then the three
    user-guide pages; then the contract tests.

### Mode resolution

| `delivery.completion` | Publication mode                                    | Note                                                                                                                                                             |
| --------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pr`                  | pull request                                        | This project's configured value.                                                                                                                                 |
| `merge`               | direct commit on the base branch                    | Deliberately not "create a branch and merge it locally"; for a plan there is nothing to keep the branch for. Publishes without review and without CI, by design. |
| `branch`              | direct commit on the base branch                    | Same as `merge`; a dangling plan branch nobody merges publishes nothing.                                                                                         |
| `null`                | asked at run time                                   | The ask offers the two modes plus "local only".                                                                                                                  |
| missing               | default `merge` → direct commit                     | Per the missing-line rule in `src/shared/config-migration.md:62`.                                                                                                |
| present but invalid   | asked at run time, and the affected key is reported | Never guessed.                                                                                                                                                   |

### The single ask and the content check

Publication is the first time a plan file leaves the machine, and plans routinely quote source
excerpts, internal paths, ticket content and — for investigation-derived plans — log fragments. Before
the ask, the run scans the plan file for a **named, enumerated** set of pattern classes: private-key
and certificate headers, common token shapes (provider-prefixed keys, JWTs, `Bearer` values),
`password`/`secret`/`api_key` assignments carrying a literal value, and absolute filesystem paths
rooted at `/Users/`, `/home/`, or a drive letter. Repository-relative paths such as `src/shared/…`,
`docs/plan/…`, and `.effective-flow/…` are explicitly **not** findings — a naive "local path" rule
would flag essentially every plan this repository writes. The class list is part of the contract so
that the corresponding test asserts behavior rather than the presence of a sentence.

Findings are rendered inside the one ` ```ask ` fence's question text; choosing to publish is the
explicit acknowledgement. There is no second fence and no separate override step. A non-interactive
run publishes nothing regardless of findings. The fence's header stays within the 12-character cap
(`ASK_MAX_HEADER_LENGTH` in `build-lib.mjs:15`) and carries a `when:` line so it is absent from runs
that cannot publish; two options when the mode is resolved, three when it must also be chosen.

### Branch and commit shape

- Branch: `<delivery.branchPrefix>/plan/<plan-file-stem>`, where `<plan-file-stem>` is the plan file
  name without its `.md` extension — **including the date**. Here that is
  `effective-flow/plan/2026-08-20-plan-publication-before-implementation`. The date is what makes the
  name unique: plan file names are unique by date plus slug, so a format that discarded the date
  would send a later plan with the same title onto an unrelated existing branch, local or remote.
  Before reusing an existing branch, verify it is this plan's own — its tip must carry exactly this
  plan file at this path — and stop with a report rather than committing onto a branch that is not.
- Exactly one plan is staged: `<plan.dir>/<file>.md`, plus `<plan.dir>/archive/<file>.md` when a
  revision run left an unstaged move back from the archive. A publication commit containing anything
  else is a defect.
- Commit type `docs`, description in `language.git`.
- No project validation runs: the commit reuses the logic of `effective-flow commit`, which declares
  that it runs none (`src/tools/commit.md:24`). `src/shared/pre-commit-gate.md` is loaded only by the
  implementing tools and is not on this path, so there is nothing to exempt and the fragment must not
  write an exemption. Locally configured Git hooks are respected and never bypassed.
- After a successful direct-commit push the local publication branch is deleted; after a
  pull-request publication it is retained, because its pull request is open.

### The publication receipt

Written under `.effective-flow/` as runtime state, keyed by the plan file's repository-relative path,
and carrying: the publication mode, an explicit `state`, the branch name, the remote, the
pull-request URL when one exists, the commit hash, and a content hash of the published file. It is the local, offline-safe
answer to three questions the archive handshake and republication both need: has this plan been
published at all, is its pull request still open, and does the working-tree copy still match what was
published.

The prerequisite change owns how the receipt is **read** and what happens when it is absent. Its
absence is a real case, not a theoretical one: a receipt is local, so a teammate's checkout never has
one. That limitation is named here and resolved there.

### Next-step rows

The six rows below are mutually exclusive and each condition is decidable from the table alone,
without a prose side-rule. A direct-commit publication needs no row of its own: it leaves neither a
pull request nor an unpublished branch, so the first three rows already fit it.

| Tool | Condition                                                                                 | Then                 | Or                   |
| ---- | ----------------------------------------------------------------------------------------- | -------------------- | -------------------- |
| plan | no plan pull request and no unpublished plan branch, deep review declined                 | `apply <plan-file>`  | `review <plan-file>` |
| plan | no plan pull request and no unpublished plan branch, deep review done, ready              | `apply <plan-file>`  | `plan <plan-file>`   |
| plan | no plan pull request and no unpublished plan branch, deep review done, open points remain | `review <plan-file>` | `plan <plan-file>`   |
| plan | plan pull request opened, no blocking open points recorded                                | `merge-gate <PR>`    | `apply <plan-file>`  |
| plan | plan pull request opened, blocking open points recorded                                   | `merge-gate <PR>`    | `plan <plan-file>`   |
| plan | plan branch committed locally but unpublished                                             | `pr`                 | `apply <plan-file>`  |

The pull-request rows lead with `merge-gate <PR>` deliberately: merging the plan pull request first
puts the plan on the base, so the archive handshake's tracked-plan state applies when the
implementation later delivers. Leading with `apply` would steer runs into the case where the plan is
absent from the base and the implementation delivers without it. A declined deep review records no blocking open points and therefore matches
the fourth row without needing a mapping sentence. The sixth row does not distinguish the review
state, because pushing an unpublished branch dominates either way. Every row carries at most two
edges, every `(tool, condition)` key is unique, and `apply`, `review`, `plan`, `merge-gate`, and `pr`
are all exposed and emitting.

### Republication and revision

- A revision run republishes rather than trusting the working-tree copy, which the receipt's content
  hash can show to have diverged.
- **A revision that brought the plan back from the archive stages both sides of that move.** Since
  `830e07a`, `src/tools/plan.md` moves an archived plan back to `<plan.dir>/` as a plain, deliberately
  unstaged filesystem move, so the working tree then carries an unstaged deletion of
  `<plan.dir>/archive/<file>` alongside an untracked `<plan.dir>/<file>`. Staging only the top-level
  path would commit an addition while the base still tracks the archived path — two copies of one plan
  on the base branch, the invariant the prerequisite change exists to enforce. Publication therefore
  stages **both** paths of that one plan, so the commit is a proper rename. This does not contradict
  `830e07a`: the rule it added forbids leaving a staged rename behind in a tool that has no step which
  would ever commit it, and publication is precisely such a step. The exactly-one-file rule below
  reads as exactly one **plan**, both of its paths, and nothing else.
- The existing publication branch is reused and updated. Pushing onto a branch whose pull request may
  already carry approvals or review comments can silently invalidate them, so the report says so:
  "updated an open pull request; existing approvals may no longer apply". The run neither queries nor
  repairs the review state.
- Offline, the branch and pull-request state cannot be confirmed, so republication aborts and reports
  instead of guessing. A first publication offline fails at the push and takes the ordinary fallback.
- "Already published and unchanged" is decided by comparing the working-tree file against the
  receipt's content hash — a local comparison, unlike a comparison against the pull-request head.

### Report vocabulary

Exactly one publication line, in one of these shapes: published as a pull request (URL plus the
untracked-copy path); published as a commit on the base branch (branch and short hash); updated an
open pull request (URL plus the approval caveat); switched from direct commit to a pull request (with
the reason); committed locally but unpublished (branch name, and that the base branch is unchanged);
declined by the user; not attempted because the run was a non-interactive delegation. A failed
publication never silently degrades to "no publication": the reason is always named, and the state of
the local base branch is always stated.

### Edge cases

- **Protected base branch.** The push is refused; the run falls back to a pull request and reports
  the switch, naming branch protection. The local base was never moved.
- **Base branch moved between resolution and push.** The push is a non-fast-forward and is refused;
  same fallback, reason reported. The run does not fetch-and-rebase the base on the user's behalf.
- **Push succeeds but the local base cannot be fast-forwarded** because it carries commits the remote
  lacks. The publication succeeded and is reported as such; the local base is left untouched and the
  report states explicitly that it now diverges from the pushed base.
- **No remote / offline.** The push fails, so the local base is never moved and the fallback to a
  pull request also fails. The run reports that the plan is committed only on the local delivery
  branch, names the branch, and states that the base is unchanged. That is the sixth next-step row's
  state.
- **Dirty working tree.** Other modified or untracked files are never staged and never carried onto
  the delivery branch. A staged change present at publication time, or an unrelated tracked
  modification that would block the branch switch, aborts publication with a report. The run never
  stashes on the user's behalf. The one tracked modification that is **not** unrelated — the unstaged
  deletion left by a revision-mode move back from the archive — is staged with its counterpart rather
  than treated as a blocker; see "Republication and revision".
- **Untracked twin after a pull-request publication.** Two remaining risks, both named in the
  fragment and the report: once the plan pull request merges, Git refuses to check out or merge over
  the untracked copy even when it is byte-identical, which blocks a manual `git pull`, `merge-gate`'s
  own base update, and any branch switch into a base carrying the file — the remediation is to remove
  that one file first; and the copy diverges silently the moment anyone edits it, which the receipt's
  content hash detects and the republish-on-revision rule handles. The report prints the exact path
  and states that it is not the published copy.
- **Branch exists but local and remote have diverged.** Abort and report; never reconcile by
  rewriting history.
- **Deep review declined or open points remaining.** Publication is offered regardless: a plan with
  open points is still a valid coordination basis, and the pull-request rows route it back to
  `plan <plan-file>` rather than to `apply`.

## Acceptance criteria

The change is complete when every criterion below holds simultaneously.

- [ ] The prerequisite archive-handshake change has been delivered, so that a published plan is
      archived exactly once and no end state leaves two copies of one plan on the base branch.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass, in
      that order. This subsumes the include-resolution, next-steps fence/row pairing, exposed and
      emitting edge, `tool-flow.md` mirror, ask-block, runtime-state-safety, and context-budget
      guards.
- [ ] `test/workflow-contracts.test.mjs:'plan stops naming an implementation tool at completion but keeps the template field'`
      still passes unchanged.
- [ ] The returning-delegation site table in `test/workflow-contracts.test.mjs` contains
      `{ file: 'src/shared/plan-publication.md', delegates: ['pr'] }`, and the fragment carries
      `Next steps: suppressed` within the window that test checks around its `pr` reference.
- [ ] A test reads the live `src/shared/plan-publication.md` and asserts the mode-resolution mapping:
      `pr` → pull request, `merge` and `branch` → direct commit, `null` and invalid → ask, missing →
      the `merge` default.
- [ ] A test asserts the fragment names `git add -A` and `git add .` nowhere, and describes staging
      the plan file by explicit path.
- [ ] A test asserts the ordering literal: the fragment states that the local base branch is
      fast-forwarded only after a successful push, and the strings `fast-forward` and `push` appear in
      that order in the ordering sentence.
- [ ] A test asserts the fallback direction by literal: the fragment contains a sentence mapping a
      refused push to a pull request, and contains none of the strings that would describe a pull
      request becoming a direct commit (`pull request` → `direct commit` in that order in a fallback
      sentence).
- [ ] A test asserts the prohibition list contains all ten literals: `--force`, `--force-with-lease`,
      `--no-verify`, `commit --amend`, `rebase`, `squash`, `reset --hard`, `checkout -f`, `clean`,
      `push --delete`.
- [ ] A test asserts the receipt schema: the fragment names the mode, an explicit `state`, the branch,
      the remote, the pull-request URL, the commit hash, and the content hash as receipt fields, and
      locates the receipt under `.effective-flow/`. The prerequisite plan's delivery (c) requires the
      `state` field; this plan writes it and defines its values.
- [ ] A test asserts the closed `state` vocabulary by literal — `committed`, `pushed-not-merged`,
      `pull-request-open`, `branch-pushed`, `pull-request-merged`, `pull-request-closed` and no
      seventh value — and that the fragment names one write point per value, including that a refused
      push writes no receipt in direct-commit mode and that an unreachable forge leaves a
      `pull-request-open` receipt unchanged.
- [ ] A test asserts the three recovery states resolve to branch reuse rather than a fresh
      publication: `branch-pushed` and `pull-request-closed` look the branch up and reuse it when it
      carries this plan, and `pushed-not-merged` fast-forwards the local base instead of
      republishing.
- [ ] A test asserts that `branch-pushed` searches for an existing pull request before creating one
      and creates none when that search cannot run, and that `pushed-not-merged` keeps the
      publication branch — the stated exception to the deletion rule — and names the final checkout.
- [ ] A test asserts the `pull-request-merged` transition: the retained branch is deleted rather than
      reused, republication branches fresh from the refreshed base, and the fragment names the squash
      merge as the reason without prescribing a rebase, amend or force-push.
- [ ] A test asserts that direct-commit mode performs its **own** return switch before deleting the
      publication branch, and that the slashless-base arm branches from the fetched remote-tracking
      ref of the discovered upstream while pushing to the local base branch name.
- [ ] A test asserts the content-check class list by literal: private key, token, `password`,
      `secret`, `api_key`, `/Users/`, `/home/`; and that `src/shared/` and `docs/plan/` are named as
      explicit non-findings.
- [ ] A test asserts exactly one ` ```ask ` fence in `src/shared/plan-publication.md`, that it carries
      a `when:` line, and that its header is at most 12 characters.
- [ ] A test asserts the non-interactive fail-closed path: a delegated run publishes nothing and
      reports that the question could not be posed.
- [ ] A test asserts the republication rules: branch reuse on republication, abort on divergence,
      abort when offline, the approval caveat string in the report vocabulary, and the content-hash
      comparison for "already published".
- [ ] A test asserts all seven report shapes are present in the report-vocabulary section.
- [ ] A test asserts all eight edge cases are present as headed or bolded entries.
- [ ] A test asserts the return-to-base behavior: **the fragment itself** switches back to the
      resolved return branch after `effective-flow pr` returns — `pr` restores no checkout
      (`src/tools/pr.md:261-263`) — and re-materializes the untracked copy afterwards and prints its
      path. A test also asserts the single receipt write point: the receipt is written **before** the
      switch, so the failed-switch path still records the opened pull request, writes no copy, and
      reports the branch the run is standing on.
- [ ] A test asserts the twin-clearing rule: the fragment compares the deliberate untracked copy
      against the committed content before switching, removes it only on a match, and stops with a
      report when the two differ.
- [ ] A test derives the `plan` rows through `parseNextStepsTable` and `edge.tool === 'plan'` — not by
      a `startsWith('| plan')` string match, which also matches `plan-issue` — and asserts exactly six
      rows whose conditions are the six literals specified above.
- [ ] A test asserts `docs/user-guide/tool-flow.md` mirrors those six rows in order via
      `findNextStepsDocViolations`, and that the justification prose at `src/shared/next-steps.md:52`
      names a condition that still exists.
- [ ] A test asserts `src/tools/plan.md` contains a Phase 6c heading, exactly one `lazy-include` fence
      for `plan-publication`, and a Phase 7 step 1 described as a no-op after a publication.
- [ ] A test asserts `src/tools/merge-gate.md` is **unchanged** by this plan and still states that it
      performs no plan-file status switch and no archiving.
- [ ] `src/tools/plan.md` no longer carries an unqualified `Do not create any commits.` (at HEAD
      `:512`) **nor** an unqualified `Do not stage anything or otherwise write to the Git index.`
      (`:513-516`, added by `830e07a`). Both gain the publication carve-out, and the second's
      rationale sentence — "this tool has no step that would ever commit a staged rename it left
      behind" — is rewritten, because after this change it has exactly such a step. The hard scope
      boundary (unchanged at `93–101`) names the publication branch, the push, and the receipt as the
      only state the tool may create outside `<plan.dir>/`.
- [ ] The `catalogHint` in `src/tools/plan.md` reads
      `"Routes issue references to issue planning or writes an actionable local plan – without code – and can publish it."`
      and the frontmatter `description` is unchanged, because it claims nothing this change
      invalidates.
- [ ] A test asserts that none of `docs/user-guide/tools-understand.md` lines 3–6,
      `docs/user-guide/worktree-and-delivery.md` lines 151–153, and `docs/user-guide/configuration.md`
      line 397 still describes `plan` as write-local-only or `delivery.completion` as governing only
      the post-implementation delivery; each names plan publication.
- [ ] `docs/adr/effective-flow-project-setup.md` is byte-identical to its state at `830e07a`.

## Validation plan

- `pnpm agent:check` → `pnpm test` → `node build.mjs` → `pnpm test:distribution`, in that order, as
  `AGENTS.md` prescribes after editing distribution sources. Confirm the `plan` budget line in the
  build output stays under 700.
- The new unit assertions listed above, each reading the live source rather than restating it.
- Manual run in this repository (`delivery.completion: pr`): expect a plan pull request, a checkout
  returned to `develop`, the plan file still present on disk, a receipt under `.effective-flow/`, and
  a report naming the URL and the untracked-copy path.
- Manual republication of the same plan: expect the existing branch reused, the open pull request
  updated, and the approval caveat in the report.
- Manual run in a freshly created scratch repository configured with `delivery.completion: merge` and
  an unprotected base: expect a commit on the base branch, a pushed base, and the local publication
  branch deleted.
- Manual negative run against a protected base branch: observe the fallback, the reported reason, and
  that the local base branch did not move. If no protected branch is available, substitute a
  read-only remote URL and record the substitution in the completion report.
- Manual offline run: expect the commit on the local branch only, the base unchanged, and the sixth
  next-step row offering `pr`.
- Manual end-to-end check with the prerequisite change in place: publish a plan as a pull request,
  merge it through `merge-gate`, then implement it and confirm the archive handshake selects its
  tracked-plan state and archives exactly once.

## Assumptions

- **Assumption:** "auf main committed" in the requirement means the configured `delivery.baseBranch`
  (`origin/develop` here), not the literal branch `main`. The repository's own base branch is
  `develop`, so reading it literally would be wrong for this very project.
- **Assumption:** `effective-flow pr` can be delegated to with a prepared branch and a verified
  execution root, and needs no change; its lifecycle mode accepts exactly that
  (`src/tools/pr.md:81-120`, and line 119 for the prepared head). If implementation finds otherwise,
  the needed change to `src/tools/pr.md` is in scope.
- **Assumption:** publication runs in the invocation checkout rather than a worktree, even though
  `worktree.enabled` is `true` here. A single-file docs commit does not need an isolated build
  environment, and `effective-flow pr` already performs its lifecycle branch work in the invocation
  checkout. The fragment still takes the verified execution root as an input and aborts on an
  unrelated tracked modification rather than switching branches over it.
- **Assumption:** a receipt is local runtime state, so a teammate's checkout never has one. The
  prerequisite change owns the no-receipt fallback; this plan only guarantees that a receipt exists
  wherever the publication itself ran.

## Open points

- No open points.

## Plan review

**Result:** Approved

### Follow-ups after delivery

Neither blocks implementation, so neither is an open point; both are recorded here so the clarity
gate reads this plan as actionable while the observations survive.

- **The untracked twin is never removed automatically.** The receipt's content hash detects
  divergence, but nothing deletes the leftover working-tree copy, so the checkout collision after a
  merged plan pull request remains a manual remediation. The prerequisite change's own main-checkout
  cleanup covers the copy left at the **archival** point, not this one, which is left at the
  **publication** point. **Re-entry:** decide once the collision has been observed in practice which
  run should remove a working-tree copy identical to a file it just published or merged.
- **`effective-flow concept` keeps writing an unpublished artifact,** which is now visibly asymmetric
  to `plan`. Deliberately out of scope. **Re-entry:** revisit if concepts start being used as a basis
  for parallel work.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        2 |         3 |    1 |
| Security        |        0 |         2 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         2 |    0 |
| Testability     |        0 |         3 |    1 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         0 |    3 |

That result was `Revision required` solely because one implementation-blocking open point remained:
the prerequisite archive-handshake change was planned but not yet delivered. It has since shipped —
`docs/plan/archive/2026-08-20-archive-handshake-state-model.md` carries `Plan status: Implemented` —
so that blocker is gone and no implementation-blocking open point remains. Every finding of the two
review passes plus the rebase pass below has been incorporated; no critical finding is outstanding.
The first acceptance criterion stays the gate and is verified against the archived plan.

### Findings

Judgment was provided by the `effective-delivery` skill. The declared owner in
`docs/developer-guide/skill-ownership.json` is `codebase-improvement`, which is not installed in this
environment, so its available equivalent was applied; the substitution is recorded here.

#### 2026-08-20, first pass — 3 Critical, 9 Important, 5 Note, all incorporated

- **[Architecture] Critical:** "no special case needed" for the archive handshake was false — an
  implementation started from a base without the plan would leave two copies on the base and a plan
  reported open forever. _Incorporated:_ the archive handshake became a scoped, then a separately
  planned, prerequisite change.
- **[Architecture] Critical:** the next-step rows were unspecified and overlapping with the existing
  deep-review conditions. _Incorporated:_ six exact, mutually exclusive rows.
- **[Error cases] Critical:** the fallback ordering stranded an unpublished commit on the local base.
  _Incorporated:_ inverted to push-then-fast-forward.
- **[Architecture] Important:** plan 0053's untracked-copy decision appeared to be reversed silently.
  _Incorporated, then corrected in the second pass_ — the rule is no longer in the live source.
- **[Error cases] Important:** the revision-run reasoning assumed the wrong premise.
  _Incorporated:_ the "Republication and revision" section.
- **[Data protection] Important:** the untracked twin's risk was understated. _Incorporated:_
  divergence and phantom-open-plan effects named, plus the block on `merge-gate`'s base update.
- **[Architecture] Important:** no execution-root contract and no rule for unrelated tracked
  modifications. _Incorporated:_ declared input, abort-never-stash rule, worktree rationale.
- **[Security] Important:** a planning tool now writes a shared branch with only one safety rule.
  _Incorporated:_ prohibition list, fresh-branch rule, an ask naming remote and branch.
- **[Data protection] Important:** plan content leaves the machine for the first time.
  _Incorporated:_ the content check.
- **[Testability] Important:** the acceptance criteria did not form one completion condition.
  _Incorporated:_ restated as one simultaneous condition; manual runs moved to validation.
- **[Scope] Important:** the documentation surface was incomplete. _Incorporated:_ three user-guide
  pages added.
- **[Maintainability] Important:** an invented pre-commit-gate exemption. _Incorporated:_ removed;
  `commit`'s own no-validation declaration cited instead.
- **[Testability] Note:** the delegation-site criterion named the wrong file. _Incorporated._
- **[Scope] Note:** the frontmatter criterion targeted a claim the frontmatter does not make.
  _Incorporated:_ exact `catalogHint` string specified.
- **[Maintainability] Note:** `src/shared/merge-gate.md` does not exist. _Incorporated:_ corrected to
  `src/tools/merge-gate.md:1194` and the fallback re-argued on its own terms.
- **[Maintainability] Note:** the context-budget figure was a hard claim. _Incorporated._
- **[Maintainability] Note:** the review section claimed Approved before any review ran.
  _Incorporated._

#### 2026-08-20, deep pass — 2 Critical, 11 Important, 6 Note, all incorporated or decided

- **[Architecture] Critical:** the fresh-branch rule and the republication-reuse rule contradicted
  each other for the same branch in the same run. _Decision:_ reuse wins on republication, fresh
  applies to the first publication only, divergence aborts.
- **[Architecture] Critical:** the three archive states were not locally decidable and the
  already-archived fourth state was missing. _Decision:_ publication writes a local receipt; the
  reading contract moves into the prerequisite change.
- **[Architecture] Important:** the 0053 supersession premise no longer holds — the cleanup rule is
  absent from the live fragment, so the phantom open plan is pre-existing rather than new.
  _Incorporated:_ the decision was restated and the risk re-scoped.
- **[Architecture] Important:** Phase 6c would publish a file that Phase 7 step 1 then rewrites.
  _Incorporated:_ the final write moves ahead of publication and Phase 7 step 1 becomes a no-op.
- **[Architecture] Important:** with `completion: pr` the documented normal outcome was a plan
  permanently marked `Not implemented` on the base. _Decision:_ the pull-request rows lead with
  `merge-gate <PR>`. (The archival half of that decision was reversed by the rebase pass below.)
- **[Architecture] Note:** approach step 8 duplicated `pr`'s checkout restoration. _Incorporated._
- **[Security] Important:** the prohibition list omitted `commit --amend`, rebase, squash,
  `reset --hard`, `checkout -f`, `clean`, and `push --delete`. _Incorporated:_ all ten literals.
- **[Security] Important:** republication can silently invalidate an existing approval. _Decision:_
  update and report the review impact; abort offline.
- **[Data protection] Important:** the content check was undefined and its override needed a second
  dialog, contradicting the one-ask decision. _Decision:_ the check is an enumerated class list and
  its findings are folded into the single ask.
- **[Error cases] Important:** the offline end state had no row offering `pr`. _Incorporated:_ the
  sixth row.
- **[Error cases] Important:** no rule for a local base that cannot be fast-forwarded after a
  successful push. _Incorporated:_ its own edge case and report shape.
- **[Testability] Important:** four criteria were universal negatives over free prose.
  _Incorporated:_ restated as enumerated literal assertions.
- **[Testability] Important:** the row count had to be derived through `parseNextStepsTable`, not a
  string match that also catches `plan-issue`. _Incorporated._
- **[Testability] Important:** Republication, the report vocabulary, the edge cases, Phase 6c, the
  ask shape, the branch name, and the commit type had no criteria at all. _Incorporated:_ the
  criteria list grew from 17 to 25.
- **[Scope] Important:** the change had grown into two. _Decision:_ the archive handshake is planned
  and delivered first; this plan writes receipts and no longer edits `worktree-integration.md`.
- **[Scope] Note:** the direct-commit push cannot reuse `pr`'s `push -u origin <head-branch>`.
  _Incorporated:_ the refspec shape is named.
- **[Testability] Note:** the justification prose at `next-steps.md:52` names an old row key
  verbatim. _Incorporated._
- **[Maintainability] Note:** `src/tools/commit.md:20` was the wrong line. _Incorporated:_ `:24`.
- **[Maintainability] Note:** `docs/user-guide/tools-understand.md:3-5` truncated the false claim.
  _Incorporated:_ lines 3–6.
- **[Maintainability] Note:** the fate of the local publication branch after a direct-commit push was
  unstated. _Incorporated:_ it is deleted.

#### Rebase pass, 2026-08-20 — onto `830e07a`

Two commits landed while this plan sat open: `cbcea61` (#361) renders nested lazy-include fences in
shipped shared fragments, and `830e07a` (#362) makes the revision-mode move back from the archive an
unstaged filesystem move. The prerequisite plan also changed shape — it split into two deliveries and
settled on index-first detection. Every citation in this plan was re-verified against `830e07a`; all
of them outside `src/tools/plan.md` were already correct, and the staleness was concentrated in that
one file plus the prerequisite's framing.

- **[Error cases] Decision-requiring:** `830e07a` leaves a revision that brought a plan back from the
  archive with an unstaged deletion of `<plan.dir>/archive/<file>` beside an untracked
  `<plan.dir>/<file>`. Staging only the top-level path would commit an addition while the base still
  tracks the archived path — **two copies of one plan on the base branch**, the invariant the
  prerequisite exists to enforce; the alternative reading is that the dirty-tree rule aborts every
  publication after such a revision. Neither was specified. _Decision:_ publication stages **both**
  paths of that one plan, so the commit is a proper rename. This is consistent with `830e07a`'s own
  rationale, which forbids leaving a staged rename behind in a tool that has no step to commit it —
  publication is exactly such a step. The exactly-one-file rule now reads as exactly one **plan**.
- **[Architecture] Decision-requiring:** the receipt lost its reader. Delivery (a) of the prerequisite
  uses index-first detection and reads no receipt; the `merge-gate` archival that would have read one
  is being dropped. Only `plan-publication.md` itself still consumes it. _Decision:_ keep the full
  schema including the `state` field so delivery (c) inherits a receipt rather than migrating one, and
  rewrite the architecture decision honestly — it is fragment-internal state for republication, and
  some fields have no reader until (c) ships.
- **[Architecture] Decision-requiring:** dropping the `merge-gate` archival reopened the problem it
  was introduced to solve, and the pull-request next-step rows still carried its rationale.
  _Decision:_ the rows keep leading with `merge-gate <PR>`, for a different and better reason —
  merging the plan pull request puts the plan on the base, which is what makes the archive handshake's
  tracked-plan state fire cleanly later. A published but unimplemented plan carrying
  `Not implemented` is accurate rather than defective; marking it implemented at publication time
  would be the actual error.
- **[Maintainability] Important:** `830e07a` added a second rule at `src/tools/plan.md:513-516`
  forbidding staging, whose stated rationale — "this tool has no step that would ever commit a staged
  rename it left behind" — becomes false with publication. _Incorporated:_ the criterion now amends
  **both** rules and requires that rationale sentence to be rewritten.
- **[Error cases] Important:** `830e07a` also added a rule at `:179-187` that no question is posed
  once a revision has moved the plan. _Incorporated:_ a one-clause carve-out naming the publication
  ask and Phase 6b's deep-review ask, both of which legitimately follow the move and neither of which
  is a revision-owed question.
- **[Scope] Important:** the context budget moved from ~552 to **619 of 700**, because `830e07a` added
  66 lines to `src/tools/plan.md`. _Incorporated:_ the figure is corrected and the budget line is
  restated as a real constraint — 81 lines of headroom must absorb Phase 6c, the two amended rules,
  the scope boundary, the Phase 7 report line and the fence pointer.
- **[Maintainability] Notes, all incorporated:** the header rebased to `830e07a` and every
  `src/tools/plan.md` line citation re-derived (`:450`→`:512`, `:433`→`:493`); "the prerequisite does
  not exist yet" corrected to "planned but not delivered", with the re-entry pointing at `apply`
  rather than `plan`; four "four archive states" / "four-state" wordings corrected, two of which the
  prerequisite plan had not itself identified; the working state corrected, since
  `2026-08-19-delivery-push-retry.md` was implemented and archived by `de3ba34`; the ADR baseline
  moved to `830e07a`; the untracked-twin open point re-scoped, since the prerequisite's cleanup covers
  the copy left at archival, not the one left at publication; and the runtime-state-guard reason
  corrected — `walkRuntimeStateMutations` roots at non-`shared/` contexts, so a fragment is scanned
  because it is reachable from a tool, not because it lives in `src/shared/`.

`cbcea61` changes nothing for this plan: its fence for `plan-publication` is top-level in a tool body,
which always resolved. The new `assertNoUnresolvedLazyIncludes` is a free safety net should the
fragment ever nest a fence of its own.
