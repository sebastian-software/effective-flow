# Publish the plan before implementation

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `35b4523` on 2026-09-29, the tip of `origin/develop`. This revises the
2026-08-20 version, which was planned against `830e07a`. Every citation below was re-derived against
`35b4523` and read from `origin/develop`, because the local checkout was six commits behind at
revision time.
**Depends on:** the archive handshake
(`docs/plan/archive/2026-08-20-archive-handshake-state-model.md`, `Implemented`). It is delivered,
and its `plan-archival` fragment is reused with unchanged mechanics.

## Requirement

A plan written by `effective-flow plan` never enters Git during the planning run:

- the hard scope boundary allows changes only under `<plan.dir>/` (`src/tools/plan.md:102-105`);
- the rules forbid commits and any write to the index (`src/tools/plan.md:526-530`);
- Phase 7 writes, formats, lints, reports, and stops (`src/tools/plan.md:505-519`).

The plan first reaches Git at the delivery point of the implementing run
(`src/shared/worktree-integration.md:387-419`). Until then a finished, reviewed plan is an untracked
file in one person's checkout. `src/shared/plan-archival.md:161` calls that untracked state (State C)
"the ordinary case".

**Goal (revised 2026-09-29):** every plan-driven change lives in **one branch and one pull
request**, from the plan to the archived plan:

1. When the plan is finished, `effective-flow plan` commits it on a new delivery branch and opens a
   **draft** pull request that carries only the plan.
2. The implementing workflow finds that pull request and continues on the same branch, adding the
   implementation as further commits. That covers `apply` → `apply-plan` → `build`/`fix`/`refactor`/
   `docs`, and each of those four invoked with the plan file directly.
3. The final delivery commit marks the plan `Implemented` and moves it to `<plan.dir>/archive/`. This
   is the existing archive handshake, in its tracked-plan state.
4. At delivery, the pull request is retitled to the implementation's Conventional Commit title and
   marked ready for review. `merge-gate` then takes it through like any other pull request.

The whole process is then readable in a single branch and pull request: plan, implementation, review
notes, archival. The plan is also readable by others from the moment it is finished.

**Scope:** projects whose resolved `delivery.completion` is `pr`, which is this repository's value.
Every other value keeps today's behavior on both sides.

This extends the behavior of `plan`, `pr`, and the implementing workflows, so the recommendation is
Feature (`effective-flow build`).

## What this revision replaces

The user decided the new model on 2026-09-29. These decisions of the 2026-08-20 version no longer
apply:

- **Direct-commit mode** for `merge`/`branch`, and the **one-way fallback** from direct commit to a
  pull request. Publication now exists only in `pr` mode.
- **The local receipt** with its six `state` values. Discovery moves to a marker in the pull-request
  body. That marker is on the forge, so it also works from a teammate's machine, which the local
  receipt never did.
- **"An implementation is never stacked on an open plan pull request"**, together with the next-step
  rows that led with `merge-gate <PR>`. The plan pull request now **is** the implementation pull
  request.
- **Switching the user's checkout** to the publication branch and back. Publication now runs in a
  temporary worktree. The untracked-twin collision still matters in one place: an in-place
  continuation. That case is now excluded by rule, not handled after the fact.

The following survive with the same intent: the single consent question, the content check folded
into it, the non-interactive fail-closed rule, the prohibition list, and the exclusion of `concept`
and `plan-issue`.

## Architecture decisions

### Scope and consent

- **Publication exists only when the resolved `delivery.completion` is `pr`.**
  - `merge`, `branch`, or a missing row (default `merge`, `src/shared/config-migration.md`) keep the
    plan local as today, and no question is asked.
  - An invalid row publishes nothing and is reported.
  - `null` means "ask at run time", and the single publication question is that run-time choice.

  No configuration key is added, which follows the standing decision in
  `docs/plan/archive/2026-07-16-0053-plan-datei-im-pr-des-worktree-handbacks.md`.

- **Publication is asked for exactly once per run, and never assumed.** There is exactly one
  ` ```ask ` fence. It names:
  - the remote, the base branch, the branch to be created, and that the pull request is a draft;
  - **the audience**, as the repository's visibility on the forge or, where that cannot be read,
    "everyone with read access to `<remote>`";
  - the content-check findings. Answering "publish" is then the explicit acknowledgement.

  A run below a non-interactive orchestrator publishes nothing and reports that the question could
  not be posed. **Hidden mode** (`visibility: hidden`) makes publication unavailable: its plans are
  untracked under `.effective-flow/plan`, and nothing published may name Effective Flow.

- **When to offer publication follows the plan's end state.** It is offered after a deep review
  that ended ready, and after a declined deep review. It is **not** offered while blocking open
  points remain: the next step there is `review` or `plan` on the plan file, and publishing first
  would only produce the local-versus-published mismatch below. This keeps the three existing `plan`
  next-step rows correct.

### The plan pull request

- **It is a draft, and `merge-gate` does not change.** `merge-gate` refuses to merge a draft
  (`src/tools/merge-gate.md:1204`, condition 3), so a plan-only pull request cannot be merged by
  accident. It becomes mergeable only through the implementing run's delivery. `merge-gate` still
  performs no plan-file status switch and no archiving.

- **Its branch has the implementing workflow's own name.** The name is
  `<delivery.branchPrefix>/<skill>/<slug>` (`src/shared/worktree-integration.md:154`), where
  `<skill>` comes from the plan's recommended workflow and `<slug>` from the plan title, with the
  usual numeric suffix on a collision. The name is **never** the discovery key.

- **A body marker is the discovery key, and the helper parses it, not the model.** The marker is
  `<!-- effective-flow-plan-pr:v1 {"plan":"<plan.dir>/<file>.md"} -->`, stamped as the body's own
  line, exactly once.
  - `pr-list` and `pr-read` emit a normalized `planPrMarker` (the validated plan path) or
    `planPrMarkerError`, and `pr-list` accepts an optional `planPath` filter. This follows the
    precedent of the deterministic decomposition-marker parsing (`inspectDecompositionKey`,
    `src/scripts/remote-tracker-core.mjs:2612`).
  - The helper accepts a marker only when it parses exactly, occurs exactly once as its own body
    line, and carries a repository-relative `plan` path with no `..` and no absolute path.
  - Comments are never read for it. Discovery hands the workflow those normalized fields and **never
    a pull-request body**, so no fork's or third party's text reaches the model during discovery.

  Body text is attacker-influenceable, so the marker alone never selects a branch. The verification
  rule below decides.

- **Only a same-repository pull request that this run's own `pr` call created is a plan pull
  request.** The normalized pull-request record today carries no head-repository field
  (`src/scripts/remote-tracker-core.mjs:2644-2651`). On Forgejo, `head` is the bare branch even for a
  fork. `pr` step 8 matches on head name and base only (`src/tools/pr.md:229-248`).

  Three changes close that gap:
  1. `pr-list` and `pr-read` gain a normalized **head-repository** (cross-repository) field on both
     providers;
  2. `pr` step 8 adds a same-repository condition, so a fork pull request with the same branch name
     is neither reused nor counted as a duplicate that could block delivery;
  3. publication accepts only a pull request that `pr` actually **created** in this run. A reused
     result means the branch was not this plan's own, so publication stops and reports.

  Two supporting rules:
  - `pr`'s step-12 report gains a `result: created | reused` line. A pull request found by step 10's
    `mutationMayHaveSucceeded` lookup counts as `created`.
  - An **absent** head repository — GitHub reports `head.repo: null` for a deleted fork — counts as
    foreign in verification. In `pr` step 8 an absent value is hydrated through `pr-read`, and if it
    is still absent the lookup aborts as incomplete output. It is never matched.

### Verification (shared by both sides)

A candidate counts only when **all** of the following hold:

- its marker is valid;
- it is open;
- its head repository is this repository;
- its base equals the resolved local base branch;
- **the head branch's changes against the merge base with the base ref touch only
  `<plan.dir>/<file>`**. The one exception is the `<plan.dir>/archive/<file>` → `<plan.dir>/<file>`
  rename that a publication after a revision from the archive commits.

That last bound keeps foreign commits on a branch carrying the right plan from shipping under the
implementation's title. The plan side and the implementation side apply the same rule.

A **remote** head that already carries non-plan commits is not a candidate. It is reported, and the
report states that neither `iterate` nor `merge-gate` finishes a plan pull request, because neither
archives the plan nor finalizes the draft. An interrupted implementation normally leaves its
commits **local** and the remote head untouched, and resumption covers that case (below).

### Continuation (implementation side)

- **It is loaded by the four implementing tools, not by `worktree-integration`.** `build`, `fix`,
  `refactor`, and `docs` each gain one `lazy-include` pointer to `plan-pr-continuation`. The pointer
  fires when the run's source is a plan file and hidden mode is off, and it runs before the delivery
  branch is constructed. That is the precedent the four tools already follow for `plan-archival`.

  `worktree-integration` stays unchanged, because it is in `merge-gate`'s recorded eval load set
  (`evals/merge-gate/suite.config.mjs`). Editing it would stale that evidence and owe a re-recorded
  round of about three hours before the next release.

- **It runs at one exact point in `worktree-integration`'s sequence:** after "Shared
  preconditions" step 2 has resolved the base (`src/shared/worktree-integration.md:144`), and before
  step 3.
  - When it continues on a candidate, it **supersedes** the mode determination's worktree or in-place
    result and completion record (`:105-136`).
  - It **replaces** branch naming (step 4, `:154`) and "Worktree execution" step 2's `-b` creation
    (`:206-207`) with the provisioning below.
  - Every later `worktree-integration` step applies unchanged. That includes setup, the lifecycle
    record, the delivery point, and the handback. "This run created the delivery branch" is set per
    the local-branch-state rule.
  - With no candidate, it returns before superseding anything.

- **It continues automatically on exactly one verified candidate.**
  - **Zero candidates:** today's path, unchanged.
  - **Several candidates, or one that fails verification:** stop, and report every candidate with
    its failed check. Never pick one.
  - **Discovery unavailable** (missing CLI or authentication, unreachable forge, unsupported
    `pr-list`): the run cannot rule out a plan pull request.
    - An interactive run asks once whether to continue without one, which means a new branch as
      today, or to stop.
    - A non-interactive run stops.

    This behavior change for `pr` projects is stated in the user guide.

- **A local plan that differs from the published one is asked about, not silently resolved.** An
  interactive run poses one question: either republish the local version onto the plan branch as a
  new commit, then continue, or stop.
  - That question **is** the republication consent. It carries the audience and the content-check
    findings of the local version.
  - `plan-pr-continuation` reaches `plan-publication` through a nested `lazy-include`, and passes it
    a `consent: given-by-caller` input that skips `plan-publication`'s own ask. The implementing run
    therefore never poses two questions, and never offers "keep local", which has no meaning there.
  - A non-interactive run stops. The question names both versions' locations and never overwrites
    either copy on its own.

- **It always uses a dedicated worktree for the existing head branch, and never switches a
  checkout.**
  - It fetches the head branch and creates one Effective Flow-owned worktree for it **without
    `-b`**, with `creationOid` set to the fetched head OID. This is the precedent of
    `src/tools/iterate.md:514-527`.
  - It overrides `worktree.enabled: false` for this run and says so. The in-place path
    (`src/shared/worktree-integration.md:251-266`) would switch the user's checkout, and Git refuses
    that over the untracked plan copy even when the content is identical
    (`src/shared/plan-archival.md:189-190`).
  - The one in-place exception is iterate's: the invocation checkout is clean and already on that
    branch.
  - **Under a harness-managed receipt** (a Claude Code or Codex worktree session), it creates a
    **sibling** worktree. That is one Effective Flow-owned worktree under the configured base
    directory of the verified `RUNTIME_STATE_ROOT`, not nested inside the harness worktree, which is
    never switched. This is a stated exception to `src/shared/worktree-integration.md:125-127`, and
    the report says that the changes live in the sibling worktree, not in the harness session's
    tree. The plan side's temporary publication worktree follows the same rule.
  - A run that will not reach delivery stops, because it would archive the plan without finishing
    the pull request.

- **An interrupted implementation resumes on the machine that ran it.**
  - A failed or stopped run retains its worktree and branch (lifecycle `aborted` or `failed`), and
    its local branch is ahead of the untouched remote head.
  - A re-run adopts that worktree when a retained record of this repository names the same branch,
    its `creationOid` equals the freshly fetched plan head, and the worktree is clean apart from the
    run's own commits.
  - Adoption is a new, guarded `aborted|failed` → `active` transition under the record lock. It is
    added to `src/shared/worktree-lifecycle.md`, which today sanctions no adoption at all and only
    forbids adopting harness-managed worktrees (`:9`).
  - Without such a record, "ahead" still stops the run, and the report names the retained worktree.

- **Implementation evidence is checked before anything is archived.** Implementation evidence means
  that the run's residual output plus its verified commits touch at least one path other than
  `<plan.dir>/<file>` and `<plan.dir>/archive/<file>`.
  - The continuation checks this **before** the `plan-archival` delivery point.
  - Without evidence, the run ends in a controlled stop (`aborted`). It archives nothing, leaves the
    local plan copy in place, and does not touch the draft.
  - Otherwise an empty implementation would push an archival commit, and the finish would then
    refuse it, leaving a draft that carries an `Implemented` plan and has no way back.

- **The local branch state is checked before provisioning.** After the fetch, the local branch
  must be absent (then it is created as a tracking branch, and the run records that it created it)
  or equal to the fetched OID. If the local branch is an ancestor of the fetched OID, it is
  fast-forwarded. A local branch that is ahead stops the run unless the resumption rule above
  adopts it. A local branch that has diverged always stops the run. The branch is never reset,
  rebased, or force-pushed.

- **A found plan pull request fixes the completion action to `pr`.** The fix is recorded as the
  run's explicit completion action, with its evidence (the pull-request URL), in the slot
  `src/shared/worktree-integration.md:105-116` already defines. That keeps the handback from asking
  a `null` question later.
  - A configured `merge` or `branch` stops the run with a report naming the pull request and the
    mismatch.
  - An **explicit** `merge` or `branch` directive in the current invocation stops the run the same
    way.

  The run never merges locally around an open draft.

- **The archive handshake's tracked state becomes the ordinary case, with unchanged mechanics.**
  On the plan branch the plan is tracked in the delivery checkout's index, so `plan-archival`
  selects State A: mark `Implemented`, then `git mv` into the archive. That happens at the existing
  delivery point, inside the final delivery commit. The main-checkout cleanup
  (`src/shared/plan-archival.md:178-212`) then removes the untracked copy the plan run left behind.
  Only descriptive wording changes:
  - `src/shared/plan-archival.md:161`;
  - `src/shared/plan-numbering.md:44-58`.

### Finishing the pull request lives in `pr`

- **`pr` gains a finalize input, so no second copy of its composition logic exists.**
  - The continuation passes `Finalize plan draft: <PR number>` to its `pr` delegation.
  - When `pr` reuses an open pull request whose number equals that verified number, `pr` runs its
    step-9 derivation of title and description anyway. It then applies three helper mutations, each
    dry run first:
    1. the Conventional Commit title;
    2. the body, through hash-guarded `pr-update-body`, keeping the plan marker;
    3. mark ready.
  - If the reused number differs from the verified one, the finish is refused and reported.
  - Title typing, the language rules, the hidden-mode rules, and the attribution ban stay in one
    place.
  - The finish runs **before** "PR review publication" (`src/shared/worktree-integration.md:484-491`),
    because review bots commonly skip drafts.
- **The finish requires implementation evidence.** For `pr`, that means `<merge-base>..<head>`
  touches at least one path other than `<plan.dir>/<file>` and `<plan.dir>/archive/<file>`. An empty
  implementation is never marked ready.
- **Any finish failure leaves a draft, and a direct `pr` run is the recovery.**
  - The report names the failed step, and `merge-gate` blocks on the draft.
  - The recovery is a direct `effective-flow pr` run on that branch. It applies the same three
    mutations when the reused pull request is a same-repository draft, carries a valid helper-parsed
    marker, and has implementation evidence. The direct run performs the full verification, not only
    the marker check.
  - Re-running `apply` cannot recover it, because the local plan copy is gone by then.
- **Retitling is required, not cosmetic.** Under the default squash merge the title becomes the
  single commit's subject and the release signal, and `merge-gate` condition 9 rejects a
  non-Conventional title.

### Helper operations

- **Two new operations, `pr-update-title` and `pr-mark-ready`,** each with a capability key.
- **Draft creation already exists and is reused.** It is the `pullRequestDraftCreate` capability
  with its `tea pulls create --draft` probe (`src/scripts/remote-tracker-core.mjs:2402`,
  `:4326-4335`; `src/scripts/remote-tracker-forgejo-core.mjs:319`). `pr` only gains the input that
  requests it.
- **The Forgejo mapping is verified first, never assumed.** It is a **hypothesis to verify** that
  Forgejo represents a draft by a WIP title prefix. The helper's existing WIP handling
  (`src/scripts/remote-tracker-core.mjs:3079`, `:3125`) concerns mergeability, not the draft
  representation. If `tea --draft` indeed produces a WIP title prefix:
  - the draft state and the title are one field;
  - retitle and mark-ready collapse into **one** title update, so a failure still leaves a draft;
  - the publication title's WIP prefix is accepted as the provider's draft form.

  If the semantics cannot be established, `pr-mark-ready` reports `UNSUPPORTED_CAPABILITY` on
  Forgejo.

- **The plan run probes draft creation, title update, and mark-ready before asking.** If any one is
  unsupported, publication is unavailable: nothing is written, and the report names the capability.
  A draft that no later delivery could finish would otherwise be stranded.

### Publication mechanics (plan side)

- **Publication runs in a temporary worktree and never touches the user's checkout.**
  - The plan run leaves the user's checkout exactly as today, with the finished plan untracked at
    `<plan.dir>/<file>`.
  - Publication provisions one Effective Flow-owned worktree through the existing provisioning
    contract: receipt, lifecycle record, withdrawal. It creates the branch from the resolved base
    ref, copies the plan in, stages it by explicit path, commits, pushes, and delegates the draft
    pull request to `pr`. It then withdraws the worktree and keeps the branch.
  - The worktree runs **no** `worktree.setup`: a one-file commit needs no dependency install. A Git
    hook that fails for lack of setup is reported, and the controlled stop retains the worktree and
    the unpushed branch per the lifecycle rules.
  - The worktree path is distinct from an implementing worktree's, so `plan` and `apply` in one
    session do not collide on `BASE_DIR/REPO/SESSION_ID`.
  - The commit is a delegation to `{{SKILL:commit}}`, as `worktree-integration` step 2 does it: the
    receipt, the expected branch, the declared path, the expected tree, and
    `Next steps: suppressed`.
  - The branch-collision check covers local refs and `origin/<name>`.
- **`merge-gate` and `iterate` stay off the plan pull request until `apply` has delivered.**
  `merge-gate` checks the draft flag only in Phase 4 (`src/tools/merge-gate.md:1204`). Before that,
  its rounds can run `iterate` fixes and a base-into-head merge that push commits onto the plan
  branch. `merge-gate` stays unchanged, to avoid staling its eval. Instead the plan-side report and
  the user guide both state: do not run `merge-gate` or `iterate` on the plan pull request before
  `apply`. Commits pushed there anyway fail the continuation's verification, and are reported.
- **The plan side applies the same three-way rule.** No candidate means first publication. Exactly
  one verified candidate means republication. Several candidates, or a failed one, make publication
  unavailable and are reported, so the run never opens a second marker pull request.
- **Republication commits onto the same branch.** It adds a **new** commit on the existing branch,
  in a temporary worktree provisioned from that branch without `-b`, and applies the same
  local-branch-state rule. It never amends, rebases, or force-pushes. The report adds "updated an
  open pull request; existing approvals may no longer apply". A pull request that has merged was
  archived by its delivery: revising that plan is the existing revision-from-archive path, and
  publishing it again starts a fresh branch.
- **Nothing rewrites history or bypasses hooks.** These are forbidden on every path in this plan:
  `--force`, `--force-with-lease`, `--no-verify`, `commit --amend`, interactive `rebase`, `squash`
  of existing commits, `reset --hard`, `checkout -f`, `clean`, and `push --delete`.

### Next steps, budgets, and evals

- **No new next-step rows.** After publication the next step is still `apply <plan-file>`, so the
  three `plan` rows and the `docs/user-guide/tool-flow.md` mirror stay correct. After delivery, the
  implementing tool's "PR opened" row leads to `merge-gate <PR>`, which is the same pull request.
- **Budgets, measured against `origin/develop`:**
  - `plan` is at 656 of 664 (`build.mjs:1978`). Its Phase 7 step, pointer, and rule carve-outs will
    exceed that.
  - `pr` is at **450 of 450** (`build.mjs:1988`) and gains the finalize input and the
    same-repository condition.
  - `build`, `fix`, `refactor`, and `docs` each gain one pointer.
  - Every entry the build reports over budget is raised to the built count plus at most ten lines,
    per `AGENTS.md`.
  - `worktree-integration` is a `lazy-include` in its hosts, so it would cost them nothing. It is
    left untouched for the eval reason above.
- **Eval obligation:** run `pnpm eval merge-gate verify` at delivery. The remote helper is stubbed
  in that suite and `worktree-integration` is untouched. The one expected staleness is the new
  adoption transition in `worktree-lifecycle`, if that fragment is in `merge-gate`'s load closure.
  A stale verdict means a re-recorded round of about three hours is owed before the next release,
  not before the merge, as `AGENTS.md` states. It is recorded in the pull request.

### Scope

In scope: `plan`, `pr`, the four implementing tools, the remote helper, and the adoption transition
in `worktree-lifecycle`. Unchanged: `concept`, `plan-issue`, `apply-plan`, `merge-gate`, and
`worktree-integration`.

## Affected files

| File                                                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/plan-publication.md`                                                      | **New, lazy from `plan`.** Its contents: <ul><li>declared inputs, mode resolution, the end-state gate, and the capability probe;</li><li>the content check (plan file and pull-request summary) and the single ask with the audience;</li><li>discovery and verification with the three-way rule;</li><li>the temporary worktree without setup, stage-by-path, commit, and push;</li><li>the `pr` delegation with the draft request, the marker, and `Next steps: suppressed`, plus the created-not-reused rule;</li><li>republication with the local-branch-state rule;</li><li>withdrawal, the prohibition list, and the report vocabulary.</li></ul> It carries the canonical runtime-state guard.                                                                           |
| `src/shared/plan-pr-continuation.md`                                                  | **New, lazy from `build`/`fix`/`refactor`/`docs`.** Its contents: <ul><li>the exact insertion point and what it supersedes;</li><li>discovery through the helper's normalized marker fields, and verification including the bounded-changes check;</li><li>the three-way decision, the discovery-unavailable question, and the mismatch question as republication consent (a nested `lazy-include` of `plan-publication` with `consent: given-by-caller`);</li><li>the dedicated or sibling worktree without `-b`, the local-branch-state rule, resumption by adoption, and the no-delivery stop;</li><li>the implementation-evidence check before archival;</li><li>the recorded completion action;</li><li>the `Finalize plan draft:` input on the `pr` delegation.</li></ul> |
| `src/shared/worktree-lifecycle.md`                                                    | The guarded `aborted`/`failed` → `active` adoption transition under the record lock, with its preconditions: same repository and branch, `creationOid` equal to the fetched head, and a clean worktree apart from the run's own commits. Harness-managed worktrees are still never adopted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/tools/plan.md`                                                                   | <ul><li>Phase 7 gains the publication step after the final write, format, and lint (`:507-508`), plus the pointer.</li><li>The hard scope boundary (`:102-105`) gains the carve-out, and so do the two rules (`:526-530`), with the second's rationale rewritten.</li><li>The revision-mode "no question after the move" rule names the publication ask as an exception.</li><li>The Phase 7 report gains the publication line, and the `catalogHint` is updated.</li></ul>                                                                                                                                                                                                                                                                                                     |
| `src/tools/build.md`, `fix.md`, `refactor.md`, `docs.md`                              | One `lazy-include` pointer each to `plan-pr-continuation`, beside the existing `plan-archival` pointer, with its trigger condition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/tools/pr.md`                                                                     | <ul><li>Step 8 gains the same-repository condition.</li><li>New creation-only inputs: a draft request and a marker line.</li><li>New `Finalize plan draft:` input, with the step-9 derivation on reuse, the three mutations, the number match, and the commits-beyond-plan condition.</li><li>A direct run recognizes a reusable plan draft, which is the recovery path.</li></ul>                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/scripts/remote-tracker-core.mjs`, `-github-core.mjs`, `-forgejo-core.mjs`        | <ul><li>The head-repository field in the normalized `pr-list` and `pr-read` records.</li><li>The deterministic `planPrMarker`/`planPrMarkerError` fields and the `planPath` filter on `pr-list`.</li><li>`pr-update-title` and `pr-mark-ready`, each with a capability key, a dry-run default, the normalized envelope, and the verified provider mapping.</li></ul>                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/shared/plan-archival.md`, `src/shared/plan-numbering.md`                         | Wording only: State A is the ordinary case for a published plan, and `plan` commits only through publication.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `build.mjs`                                                                           | `CONTEXT_BUDGET_LINES` for `plan`, `pr`, and every implementing tool the build reports over budget.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `docs/user-guide/tools-understand.md`, `worktree-and-delivery.md`, `configuration.md` | Plan publication under `delivery.completion: pr`, the continuation on the plan's pull request, and the discovery-unavailable question.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `test/workflow-contracts.test.mjs`                                                    | <ul><li>The new assertions.</li><li>Updates to `'the revision-mode move back from the archive never touches the Git index'` (around `:3971`/`:4080-4104`) and to `'the plan-archival fragment states its detection, states and cleanup'` (around `:9967`).</li><li>The returning-delegation site table gains `plan-publication` → `pr` and `plan-pr-continuation` → `pr`.</li></ul>                                                                                                                                                                                                                                                                                                                                                                                             |
| `test/execution-location-contract.test.mjs`                                           | The `pr-list` lookup wording (around `:356`) gains the same-repository condition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `test/remote-tracker*.test.mjs`                                                       | The head-repository normalization and the two new operations, on both providers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

`src/tools/merge-gate.md`, `src/tools/apply-plan.md`, `src/shared/worktree-integration.md`,
`src/shared/next-steps.md`, `docs/user-guide/tool-flow.md`, and
`docs/adr/effective-flow-project-setup.md` are deliberately **unchanged**.

## Implementation details

### Approach

1. **Remote helper.** Add the head-repository field. Establish the Forgejo draft semantics, then add
   `pr-update-title` and `pr-mark-ready` with tests.
2. **`pr`.** Add the same-repository condition, the creation-only inputs, and the finalize input.
   Raise the `pr` budget.
3. **Continuation.** Write `plan-pr-continuation` and add the four tool pointers. Adjust the wording
   in `plan-archival` and `plan-numbering`.
4. **Publication.** Write `plan-publication` and wire it into `plan.md`.
5. **Docs and budgets.** Update the user-guide pages and the tests, and raise every budget the build
   reports.
6. **Validation.** Run the validation sequence and `pnpm eval merge-gate verify`, then record the
   end-to-end run.

### Publication flow (plan side)

It runs as a Phase 7 step after the final write, format, and lint.

1. **Read-only resolution.** Resolve:
   - `delivery.completion` and `visibility`;
   - the end-state gate;
   - the base, through `src/shared/base-branch-resolution.md`. Keep both results — the base ref to
     branch from and the local base branch name. The base must be tracked on `origin`, as `pr`
     requires.
   - the forge probe with the three capabilities, and the repository's visibility;
   - the plan file at its final path.

   The only Git operation before consent is canonical resolution's base fetch. It commits nothing,
   moves no local branch, and stages nothing.

2. **Availability.** If publication is unavailable for any named reason, ask nothing, write
   nothing, and report the reason. Otherwise run discovery and verification and apply the three-way
   rule.
3. **Content check.** Scan the plan file and the `Requirement` summary that the pull-request body
   will quote.
4. **The single ask.** It lists the audience and the findings, and offers two options:
   - "publish as draft pull request" (on republication: "update the open pull request");
   - "keep local".
5. **Temporary worktree.** Provision it without setup. Under a harness-managed receipt, it is a
   sibling worktree:
   - first publication: a new branch from the base ref;
   - republication: the existing branch without `-b`, after the local-branch-state rule.
6. **Stage.** Copy the plan to `<plan.dir>/<file>` and stage it by explicit path. If this revision
   run brought the plan back from the archive, record the move as a rename (`git mv`, then the
   content), because the base still tracks the archived path. The user's checkout keeps its
   unstaged state.
7. **Commit.** Delegate to `{{SKILL:commit}}` with the receipt, the expected branch, the declared
   path, the expected tree, and `Next steps: suppressed`. Type `docs`, description in
   `language.git`, no AI attribution, hooks running.
8. **Push normally.**
   - **First publication:** delegate to `pr` with the prepared branch, both base results, the verified
     head OID, the draft request, the marker line, and `Next steps: suppressed`. Require that `pr`
     created the pull request.
   - **Republication:** `pr` is not called, because the open pull request already carries the new
     commit.
9. **Withdraw** the worktree through its lifecycle record, and keep the branch. The report tells the
   user not to run `merge-gate` or `iterate` on the plan pull request before `apply`.

### Continuation flow (implementation side)

It runs after `worktree-integration`'s "Shared preconditions" step 2, and only when the source is a
plan file and hidden mode is off.

1. **Discover and verify** through the helper's normalized marker fields, then apply the three-way
   rule. If discovery is unavailable, pose the one question, or stop in a non-interactive run.
2. **Compare** the local plan with the head tip's plan. On a mismatch, pose the one question, which
   is also the republication consent, or stop in a non-interactive run.
3. **Record** the completion action `pr`, with the pull-request URL as its evidence. A conflicting
   configured or explicit completion stops the run.
4. **Provision.**
   - Stop when delivery is disabled.
   - Otherwise fetch the head branch and apply the local-branch-state and resumption rules.
   - Then create, or adopt, the dedicated worktree without `-b`, with `creationOid` set to the
     fetched head. Under a harness-managed receipt that worktree is a sibling. Where
     `worktree.enabled: false` would have run in place, the override is reported.
   - The diff baseline (#503) is taken as usual before the first implementation write.
5. **Implement, validate, and review** as the workflow already does, with commits on that branch.
6. **Check implementation evidence** before the `plan-archival` delivery point. Without it, end in a
   controlled stop that archives nothing.
7. **Deliver.** The archive handshake resolves State A. The `pr` delegation carries
   `Finalize plan draft: <PR number>`, and `pr` reuses and finishes the pull request before
   pull-request review publication.

### Plan pull request shape

- **Title at publication:** `docs: plan <plan title>` in `language.git`. On Forgejo the provider's
  WIP draft prefix may precede it.
- **Body at publication**, in `language.forge`, with no AI attribution:
  - one sentence saying that the implementation follows as further commits;
  - the plan path;
  - the checked `Requirement` summary;
  - the marker line.
- **Title and body at delivery:** what `pr` derives in step 9 for this change, with the marker line
  kept.

### Content check

Before the ask, scan for a named, enumerated set of classes:

- private-key and certificate headers;
- common token shapes: provider-prefixed keys, JWTs, `Bearer` values;
- `password`, `secret`, and `api_key` assignments that carry a literal value;
- absolute paths rooted at `/Users/`, `/home/`, or a drive letter.

Repository-relative paths such as `src/shared/…`, `docs/plan/…`, and `.effective-flow/…` are
explicitly **not** findings. The findings go into the one question. There is no second fence, and a
non-interactive run publishes nothing.

### Report vocabulary

**Plan side:** exactly one publication line, in one of these shapes:

- published as a draft pull request (URL, branch, audience, and the note not to run `merge-gate` or
  `iterate` on it before `apply`);
- updated an open pull request (URL, plus the approval caveat);
- declined;
- unavailable, with its named reason;
- not attempted, because the run was a non-interactive delegation;
- failed at a named step, stating whether the branch and the pull request exist.

**Implementation side:** one line naming one of these:

- continued on the plan pull request (URL, and the sibling-worktree path where one applies);
- resumed an interrupted run by adoption (worktree path);
- no plan pull request found;
- continued without discovery, by the user's choice;
- stopped at a named reason.

`pr` adds one finish line: finished, with title and URL, or still a draft, naming the failed step.

### Edge cases

- **No plan pull request exists** — for example an older plan, a declined publication, a non-`pr`
  project, or a plan with open points. The behavior is exactly as today.
- **A fork pull request with the same branch name, or a deleted fork's pull request.** It is excluded
  by the same-repository condition in `pr` step 8 and in verification, and an absent head repository
  counts as foreign.
- **The remote head carries non-plan commits.** It is not a candidate. The report states that
  `iterate` and `merge-gate` do not finish a plan pull request.
- **Several candidates, or a failed verification.** Stop and report each one with its failed check.
- **Local and published plans differ.** The one question, which is the republication consent, or
  stop in a non-interactive run.
- **Local branch ahead.** It is resumed by adoption when a matching retained record exists.
  Otherwise the run stops and names the retained worktree.
- **Local branch diverged, or the head branch checked out elsewhere.** Stop. Never reset, rebase, or
  force.
- **Harness worktree session.** A sibling worktree is used on both sides, and the harness worktree
  is never switched.
- **An implementation that produced nothing.** A controlled stop before archival. The draft and the
  local plan stay untouched.
- **`merge-gate` or `iterate` run on the draft before `apply`.** Their pushed commits fail the
  continuation's verification, and the report says so. The documentation warns against it.
- **The base moves on while the draft is open.** Nothing special: `merge-gate` brings a `BEHIND` head
  forward after delivery with its sanctioned base-into-head merge.
- **The plan pull request was closed without merging.** It is not a candidate, so the run creates a
  new branch and pull request.
- **The finish fails.** The pull request stays a draft, the report names the step, and the recovery
  is a direct `pr` run on the branch.
- **Forge unreachable at plan time.** Publication is unavailable, and nothing is written.
- **Forge unreachable at implementation time.** The one question, or stop in a non-interactive run.
- **A teammate implements a published plan.** They need the plan file locally, as `apply` does
  today. Discovery then works independently of the machine.

## Acceptance criteria

The change is complete when every criterion below holds simultaneously.

- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` pass in that
      order.
- [ ] Every raised `CONTEXT_BUDGET_LINES` entry equals its reported built count plus at most ten
      lines.
- [ ] Helper tests on GitHub and Forgejo cover the head-repository field of `pr-list` and `pr-read`,
      including an absent head repository.
- [ ] Helper tests cover `planPrMarker`/`planPrMarkerError` for a valid marker, a duplicate marker, a
      malformed marker, a `..` path, an absolute path, and a marker that is not on its own line, plus
      the `planPath` filter.
- [ ] Helper tests cover `pr-update-title` and `pr-mark-ready` on both providers: the dry-run plan,
      the `--apply` plan, the capability key, and `UNSUPPORTED_CAPABILITY` where applicable. The
      chosen Forgejo mapping is itself under test.
- [ ] A test asserts the same-repository condition in `pr` step 8, with an absent head repository
      hydrated and otherwise aborting. `test/execution-location-contract.test.mjs` is updated to
      match.
- [ ] A test asserts that `pr` passes the draft request and places the marker line on creation only,
      and that step 12 reports `result: created | reused`.
- [ ] A test asserts that `pr`'s `Finalize plan draft:` input does all of these:
  - matches the pull-request number;
  - runs the step-9 derivation on reuse;
  - performs the three mutations, dry run first;
  - requires implementation evidence as defined for `pr`;
  - runs before pull-request review publication;
  - leaves a draft on failure.
- [ ] A test asserts that a reuse **without** `Finalize plan draft:` performs no metadata mutation.
      The one exception is a direct invocation that reuses a same-repository draft with a valid
      helper-parsed marker and implementation evidence: it runs the full verification and applies
      the same three mutations.
- [ ] A test on `src/shared/plan-publication.md` asserts the mode mapping, the end-state gate, the
      hidden-mode and non-interactive paths, and the three-capability probe before the ask.
- [ ] A test on `src/shared/plan-publication.md` asserts exactly one ` ```ask ` fence, with a `when:`
      line, a header of at most 12 characters, and the audience named. It also asserts that
      `consent: given-by-caller` skips that fence.
- [ ] A test on `src/shared/plan-publication.md` asserts the content-check class literals and the
      non-findings, applied both to the plan and to the summary.
- [ ] A test on `src/shared/plan-publication.md` asserts all of these:
  - the three-way rule;
  - the temporary worktree without setup, which is a sibling under a harness-managed receipt;
  - no switch of the invocation checkout;
  - staging by explicit path, with no `git add -A` and no `git add .`;
  - the `{{SKILL:commit}}` delegation;
  - the local-plus-`origin` collision check;
  - the created-not-reused rule;
  - `Next steps: suppressed`.
- [ ] A test on `src/shared/plan-publication.md` asserts all of these:
  - republication as a new commit without `-b`, with the approval caveat;
  - the "no `merge-gate` or `iterate` before `apply`" note;
  - all ten prohibited literals.
- [ ] A test on `src/shared/plan-pr-continuation.md` asserts the insertion point after "Shared
      preconditions" step 2 and what it supersedes, and that discovery reads only the helper's
      marker fields and never a pull-request body.
- [ ] A test on `src/shared/plan-pr-continuation.md` asserts all five verification checks, including
      the bounded-changes check and its rename exception, and the three-way decision.
- [ ] A test on `src/shared/plan-pr-continuation.md` asserts the discovery-unavailable question and
      the mismatch question, each with a non-interactive stop. It also asserts the nested
      `lazy-include` of `plan-publication` with `consent: given-by-caller`.
- [ ] A test on `src/shared/plan-pr-continuation.md` asserts all of these:
  - the dedicated worktree without `-b`, with `creationOid`;
  - the `worktree.enabled` override;
  - the sibling worktree under a harness-managed receipt;
  - the no-delivery stop;
  - the local-branch-state rule;
  - resumption by adoption.
- [ ] A test on `src/shared/plan-pr-continuation.md` asserts the implementation-evidence check before
      archival, the recorded completion action with the configured and explicit `merge`/`branch`
      stops, and the `Finalize plan draft:` input.
- [ ] A test asserts that `src/shared/worktree-lifecycle.md` defines the guarded
      `aborted|failed` → `active` adoption with its preconditions, and still never adopts a
      harness-managed worktree.
- [ ] Each of `build.md`, `fix.md`, `refactor.md`, and `docs.md` carries exactly one `lazy-include`
      pointer to `plan-pr-continuation`, and a test asserts it.
- [ ] `src/tools/plan.md` carries exactly one `lazy-include` fence for `plan-publication`, in Phase 7,
      after the final write, format, and lint.
- [ ] `src/tools/plan.md` no longer carries an unqualified `Do not create any commits.` or an
      unqualified `Do not stage anything or otherwise write to the Git index.`.
- [ ] The hard scope boundary of `src/tools/plan.md` names the temporary worktree, the plan branch,
      the push, and the draft pull request as the only state the tool may create outside
      `<plan.dir>/`.
- [ ] In `src/tools/plan.md`, the "no question after the move" rule names the publication ask as an
      exception.
- [ ] The updated revision-mode test asserts the four `plan.md` properties above.
- [ ] `src/shared/plan-archival.md` and `src/shared/plan-numbering.md` name the published-plan case,
      and their detection, state, and cleanup assertions are otherwise unchanged.
- [ ] The three user-guide pages name the publication, the continuation, the discovery-unavailable
      question, and the "no `merge-gate` or `iterate` before `apply`" rule, and a test asserts each
      of them.
- [ ] At delivery, this command exits 0:
      `git diff --exit-code "$(git merge-base origin/develop HEAD)" HEAD -- src/tools/merge-gate.md src/tools/apply-plan.md src/shared/worktree-integration.md src/shared/next-steps.md docs/user-guide/tool-flow.md docs/adr/effective-flow-project-setup.md`.
      It is a delivery-time check, not a permanent test.
- [ ] `pnpm eval merge-gate verify` is run at delivery and its verdict is recorded in the pull
      request. A stale verdict is recorded as a re-record owed before the next release.
- [ ] The pull request records the end-to-end run from the validation plan:
  - the draft pull request's URL, and the main checkout's `git status` after publication;
  - the same pull request retitled and ready after `apply`, with the archived plan path in its
    final commit;
  - the merged result, or the recorded reason step 3 was deferred.

## Validation plan

- Run `pnpm agent:check`, then `pnpm test`, then `node build.mjs`, then `pnpm test:distribution`.
  Record every budget line the build reports.
- The new unit assertions, each reading the live source rather than restating it.
- **End-to-end in this repository** (`delivery.completion: pr`):
  1. Run `plan` for a small change whose merge is harmless — a `docs:` change, because the squash
     title feeds release-please — and answer "publish". Expect a draft with the marker,
     the branch on the remote, the main checkout unchanged apart from the untracked plan, and the
     temporary worktree withdrawn.
  2. Run `apply <plan-file>`. Expect the continuation line, commits on the same branch, a final
     commit that archives the plan, the pull request retitled and ready, and the main-checkout copy
     removed by the existing cleanup.
  3. Run `merge-gate <PR>`. Expect an ordinary gate run and merge. After `git pull` the plan exists
     only in the archive.
- **Negative runs:**
  - `merge-gate` on a still-draft plan pull request may run its rounds, then refuses at condition 3.
    Any commit it pushed makes a following `apply` report a failed verification;
  - `apply` with a locally edited plan poses the mismatch question;
  - a project with `delivery.completion: merge` sees no publication question and an unchanged
    implementation;
  - republication adds a commit and reports the approval caveat;
  - a plan with open points is not offered publication;
  - `apply` that produced no change ends in a controlled stop with the plan unarchived;
  - an interrupted `apply` is resumed by adoption on the same machine;
  - in a harness worktree session, both sides use a sibling worktree.
- If a Forgejo host is available, repeat step 1 there. Otherwise record that the Forgejo mapping was
  verified by helper tests only.

## Assumptions and open points

- **Assumption:** `pr`'s lifecycle mode accepts a prepared branch from a temporary worktree as its
  execution root (`src/tools/pr.md:63`, `:89-93`, `:139-144`). If implementation finds otherwise,
  the needed change to `pr.md` is in scope.
- **Assumption:** `plan-publication` can use the provisioning, lifecycle-record, and withdrawal
  parts of `worktree-integration` without pulling the implementing workflows' delivery steps into
  `plan`. This is a lazy read at publication time only.
- **Assumption:** the sibling worktree under a harness-managed receipt needs no change to
  `worktree-integration` itself. The exception is stated and executed inside the two new
  fragments, which provision through the existing contract with the exception applied.
- **Assumption:** the plan file is present locally wherever `apply` runs. Implementing from a
  machine that never had the file is out of scope, as it is today.

## Open points

- No open points.

## Implementation notes

Delivered by `effective-flow build` on 2026-09-29 against `origin/develop` `35b4523`. These are the
deviations from the plan text above, each made deliberately during implementation or review:

- **`sameRepository` replaces the slug comparison.** The helper emits `sameRepository`. It is
  decided by repository id, or else by the ASCII-case-insensitive full name. It is `false` for a
  deleted fork, and absent when the payload does not state the head repository.
  - `pr` step 8 matches only `true`, and hydrates an absent value through `pr-read`.
  - Discovery never hydrates: an absent value counts as foreign, so discovery never runs `pr-read`.
  - `headRepository` remains, for reports only.
  - Comparing against a slug derived from the remote URL would have rejected a mixed-case or
    renamed remote.
- **Adoption proofs live in `plan-pr-continuation`.** `worktree-lifecycle` carries only the
  adoption row. The full proofs moved into the lazily loaded continuation, so hosts that
  eagerly include the lifecycle contract gain no lines.
- **`plan` eagerly includes `worktree-record-obligation`.** The existing record-obligation guard
  requires it, because `plan` can now reach `worktree-integration`. The include sits after Phase 7,
  together with the `plan-publication` pointer.
- **The continuation also covers in-place execution without delivery.** Its pointers fire there
  too. It runs discovery only, and a verified plan pull request stops the run before archival.
- **The completion decision uses the effective completion.** A missing `delivery.completion` row
  means `merge`. An explicit `pr` request overrides a configured or missing `merge`/`branch`, and
  only an effective `merge`/`branch` stops the run.
- **Forgejo drafts are title-based.** This was verified against the `tea` 0.16 help:
  - `pr-mark-ready` is one edit that removes the WIP prefix, verified by one read-back;
  - Forgejo `pr-read` now reads the raw `tea api` object and reports `state: merged`;
  - the read, list, update and mark-ready capabilities require `tea api --include`.
- **Budgets raised to the measured counts:** `plan` 693, `pr` 472, `fix` 513, `build` 619, and
  `refactor` 924.
- **The end-to-end validation run is deferred.** The installed skill is release 1.65.0, which
  cannot execute the new flow before this change is released. The first plan published after the
  release serves as that run.

## Test results

**Date:** 2026-09-29

| Check                         | Result                                                                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm agent:check`            | passed (514 files)                                                                                                                                                                                        |
| `pnpm test`                   | passed: 1706 tests, 1705 pass, 0 fail, 1 intentional skip                                                                                                                                                 |
| `node build.mjs`              | passed; every changed budget equals its built count plus at most two lines                                                                                                                                |
| `pnpm test:distribution`      | passed                                                                                                                                                                                                    |
| protected-file diff           | `git diff --exit-code <merge-base>` on the six protected paths exits 0                                                                                                                                    |
| `pnpm eval merge-gate verify` | stale for all six scenarios. Already stale at the merge base; this branch adds the built `worktree-integration.md` through the `worktree-lifecycle` include. A re-record is owed before the next release. |

The new and updated contract tests read the live sources. Mutation checks confirmed that they fail
on the targeted regressions. `test/pilot-measurement-timing.test.mjs` failed intermittently in one
earlier full run, and passes in isolation. It is unrelated to this change.

## Review findings

**Date:** 2026-09-29
**Reviewer:** `effective-flow-nodejs-reviewer`, `effective-flow-generic-product-reviewer` (reduced depth)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    38 |
| Open / Not implemented |     0 |

32 findings in the first pass: 0 critical, 10 important, 22 notes. Six further notes came from the
re-check. All were incorporated.

## Plan review

**Result:** Approved

### Follow-ups after delivery

These do not block implementation, so they are not open points.

- **Implementing a published plan without a local copy.** A teammate currently needs the plan file
  on disk. **Re-entry:** if that turns out to be common, let `apply` accept the plan pull request's
  URL as a source and read the plan from its head branch.
- **`effective-flow concept` keeps writing an unpublished artifact,** which is deliberately out of
  scope. **Re-entry:** revisit if concepts become a basis for parallel work.
- The 2026-08-20 follow-up about the untracked twin left at publication is obsolete. Publication no
  longer switches the user's checkout, and the copy it leaves is the ordinary one that
  `plan-archival`'s cleanup already removes.

### Summary

2026-09-29 deep interactive pass:

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         3 |    0 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         3 |    0 |
| Testability     |        0 |         2 |    0 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    1 |

2026-09-29 revision pass:

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         3 |    1 |
| Security        |        1 |         1 |    1 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         3 |    1 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         2 |    0 |
| Maintainability |        0 |         2 |    0 |

Every finding of both passes is incorporated or decided, and no critical finding or blocking open
point is outstanding. The earlier
passes' tables are superseded along with the model they reviewed. Their findings stay below as a
record.

### Findings

Judgment was provided by the `effective-delivery` skill, applied by a read-only review worker
against `origin/develop` `35b4523`. That worker built a scratch copy once to read the real budgets.

#### 2026-09-29, deep interactive pass: 11 findings, 7 incorporated directly, 4 decided by the user

Decisions (the user chose the recommended option each time):

- **[Security] Important, decided:** discovery would have put every open pull request's body,
  including fork text, in front of the model. _Decision:_ the helper parses the marker
  deterministically and emits normalized fields plus a `planPath` filter. Discovery never hands a
  body to the model.
- **[Architecture] Important, decided:** in harness worktree sessions the feature stopped on the
  implementation side and was undefined on the plan side. _Decision:_ both sides use a sibling
  Effective Flow-owned worktree, and the harness worktree is never switched.
- **[Error cases] Important, decided:** an interrupted implementation had no way back. _Decision:_
  resume by adopting the retained worktree on the same machine, through a new guarded
  `aborted|failed` → `active` transition in `worktree-lifecycle`. That transition may stale the
  `merge-gate` eval, which is recorded as an obligation.
- **[Scope] Important, decided:** `merge-gate` and `iterate` can push onto a draft plan pull request
  before refusing it. _Decision:_ `merge-gate` stays unchanged. The report and the user guide warn
  against it, and the negative-run expectation is corrected.

Incorporated directly:

- **[Error cases] Important:** an empty implementation archived the plan and could not be finished.
  _Incorporated:_ implementation evidence is defined and checked before the archival point, with a
  controlled stop otherwise.
- **[Testability] Important:** the `pr` recovery path contradicted a criterion. _Incorporated:_ the
  criterion names the direct-invocation exception with full verification.
- **[Architecture] Important:** the continuation's insertion point was ambiguous. _Incorporated:_ it
  runs after "Shared preconditions" step 2, with what it supersedes named.
- **[Architecture] Important:** republishing from inside an implementation run would have asked
  twice. _Incorporated:_ the mismatch question is the consent, passed through a nested
  `lazy-include` with `consent: given-by-caller`.
- **[Error cases] Important:** the helper facts. _Incorporated:_ an absent head repository counts
  as foreign, the existing draft capability is cited and reused, and the Forgejo WIP evidence is
  reworded as a hypothesis.
- **[Testability] Important:** the fixed-SHA diff check would fail on unrelated `develop` churn.
  _Incorporated:_ the check diffs against the merge base.
- **[Maintainability] Note:** `pr` reports `result: created | reused`; the commit is delegated to
  `{{SKILL:commit}}`; the collision check includes `origin/<name>`; the end-to-end change is a
  harmless `docs:` change; and the criteria are flat checkboxes, because the formatter collapsed the
  nested lists.

#### 2026-09-29, revision pass — one branch, one pull request: 1 Critical, 13 Important, 3 Note, all incorporated

- **[Security] Critical:** "not a fork" could not be checked. The normalized pull-request record has
  no head-repository field, and `pr` step 8 matches on head name and base only. A fork pull request
  with the same predictable branch name would be reused at publication, or would block delivery as a
  duplicate. _Incorporated:_ a head-repository field on `pr-list`/`pr-read`, a same-repository
  condition in `pr` step 8, publication only on a pull request that `pr` created, and the finish
  bound to the verified number.
- **[Security] Important:** "the tip tracks the plan" admitted foreign commits. _Incorporated:_ the
  head's changes against the merge base may touch only the plan (plus the archive rename), on both
  sides. A branch with implementation commits routes to `iterate`.
- **[Architecture] Important:** the harness-managed, in-place, and no-delivery execution shapes were
  uncovered, and the in-place path would switch the checkout over the untracked plan.
  _Incorporated:_ a dedicated worktree always, overriding `worktree.enabled: false` (with iterate's
  already-on-branch exception), and stops for harness-managed and no-delivery runs.
- **[Architecture] Important:** fixing the delivery shape was unspecified. _Incorporated:_ it is
  recorded as the run's explicit completion action, and an explicit `merge`/`branch` directive
  stops the run too.
- **[Architecture] Important:** the finish would have duplicated `pr`'s composition.
  _Incorporated:_ a `Finalize plan draft:` input in `pr`, ordered before pull-request review
  publication.
- **[Error cases] Important:** Forgejo drafts are likely title-based. _Incorporated:_ the mapping is
  verified first, retitle and ready collapse into one title update, and otherwise
  `UNSUPPORTED_CAPABILITY`.
- **[Error cases] Important:** the plan side had no three-way rule. _Incorporated:_ a failed or
  multiple candidate makes publication unavailable.
- **[Error cases] Important:** the local branch state after the fetch was unhandled.
  _Incorporated:_ absent, equal, or fast-forwardable; ahead or diverged stops the run.
- **[Scope] Important:** "offline means stop" blocked unpublished plans. _Incorporated:_ one
  interactive question to continue without a plan pull request, a non-interactive stop, and the
  behavior change documented.
- **[Scope] Important:** `review <plan-file>` after publication would produce a mismatch.
  _Incorporated:_ publication is only offered in ready or declined end states, and a mismatch poses
  the republish-or-stop question.
- **[Maintainability] Important:** a pointer in `worktree-integration` would stale the `merge-gate`
  eval. _Incorporated:_ the pointers moved into the four implementing tools, the `plan-archival`
  precedent, and a `merge-gate verify` check at delivery.
- **[Maintainability] Important:** the budget facts were wrong. _Incorporated:_ `plan` is 656/664,
  `pr` is 450/450 and is listed, and `worktree-integration` is lazy in its hosts.
- **[Testability] Important:** "unchanged" and "byte-identical" as permanent tests would break every
  future edit, and there was no behavioral proof. _Incorporated:_ a delivery-time
  `git diff --exit-code`, and recorded end-to-end evidence as a criterion.
- **[Data protection] Important:** the ask did not state the audience. _Incorporated:_ it names the
  repository's visibility, and the content check also covers the body's summary.
- **[Architecture] Note:** the temporary worktree's setup and path collision. _Incorporated:_ no
  setup, a reported hook failure, and a distinct path.
- **[Error cases] Note:** the finish had no re-entry. _Incorporated:_ a direct `pr` run recognizes a
  reusable plan draft.
- **[Security] Note:** marker strictness and empty implementations. _Incorporated:_ exact path, one
  marker, body only, and commits beyond the plan required before ready.

#### Earlier passes (2026-08-20, superseded model)

The findings below reviewed the direct-commit and local-receipt model this revision replaced. They
stay as a record.

##### 2026-08-20, first pass — 3 Critical, 9 Important, 5 Note, all incorporated

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

##### 2026-08-20, deep pass — 2 Critical, 11 Important, 6 Note, all incorporated or decided

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

##### Rebase pass, 2026-08-20 — onto `830e07a`

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
