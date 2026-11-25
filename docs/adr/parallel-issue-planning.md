# Parallel issue planning

**Status:** Active

Supersedes the whole-pass lock and the primary-checkout requirement of
[Plan-only unattended publication](plan-only-unattended-publication.md).

## Context

Issue Buddy, and with it every issue-sourced `autopilot` run, was serialized per repository by two
mechanisms. A whole-pass `pass.lock` below `.effective-flow/issue-buddy/` made every other pass stop
with `LOCKED` while one was running, and the pass had to start in the primary checkout, clean and
exactly at `origin/<base>`. A second autopilot run for a different issue therefore stopped seconds
after the first one started, and no run could start from a linked or harness worktree.

The serialization protected more than it needed to. The real invariant is that one issue is
planned by at most one run, across Issue Buddy, issue-sourced `autopilot` and `plan-issue`. Different
issues share no plan file, branch or pull request.

## Decision

A **per-issue planning claim** replaces the repository-wide lock. It is one record per issue at
`<RUNTIME_STATE_ROOT>/.effective-flow/planning-claims/<TARGET_KEY>/<ISSUE_KEY>.json`, owned by the
state helper's `planning-claim key|acquire|release|list|prune` group, so three workflows use one
primitive and one key derivation: the repository identity of `repository-resolve` on the forge, or
the resolved tracker-target id and the issue key on an external target.

- `acquire` creates the record create-only and never waits; a held claim is `CLAIMED` with its
  holder, age, a stale flag after 2 hours and same-host liveness. While a legacy `pass.lock`
  exists, every `acquire` refuses with `LEGACY_PASS_LOCK` and never removes it.
- `release` needs the token returned by `acquire`; `list` never returns a token.
- Claims are never broken automatically. `prune`, the confirmed cleanup path, removes a claim only
  under an orphan proof the helper verifies (`pass-record-absent`, `run-ledger-closed`,
  `process-dead`) or after explicit stale confirmation, and only while the record is still the one
  the caller observed. A killed run blocks only its own issue.

Each Issue Buddy pass keeps a **pass record** (`passes/<passId>.json`, `pass-open`/`pass-close`)
instead of a lock. Its mutation mutex covers only short local state reads and writes, never a fetch
or forge call, and waits at most 10 s before `LOCKED`. A batch pass skips an issue another run holds
as `issue-in-progress`, a skip reason distinct from the lifecycle label
`effective-flow-issue-in-progress`; a single-issue pass stops with `ISSUE_CLAIMED`. Recovery,
stale-attempt accounting and trusted text are restricted to issues the pass holds.

**Every planning run starts from the fetched tip of the resolved remote base branch**: the
configured `delivery.baseBranch`, else `origin/HEAD`, else `origin/main`. No branch name is a
default. The invoking checkout's branch, cleanliness and position no longer matter: runtime state
stays in the primary checkout, and plan files live only in run-owned worktrees. Issue Buddy plans
in an `issue-planning` worktree per pass, created at the collected base OID and named to the plan
writer by a validated `Execution root:` control line; a plan that cannot be published keeps its
worktree, and the claim is released anyway. `plan-issue` examines the code read-only at the fetched
base OID and creates no worktree.

An issue-sourced `autopilot` run takes the claim in `run-init`, before its ledger exists, holds it
until `run-close` for every outcome, and lets Issue Buddy adopt it through the existing
`Autopilot run:` caller line after a helper-internal ledger check, exclusively (one adopting pass
per run) and without recovery authority; the token never leaves the helper. Autopilot no longer continues on an existing open pull request: Issue Buddy's
`open-pull-request` skip is a stop with no pull request. The restored plan lives in a run-owned
delivery worktree, set up per `worktree.setup`, that `plan-pr-continuation` adopts.

A planning run may meet a base branch that moved while it planned. It plans at `collect.baseOid` and
publishes on that OID, or on one later tip that passed the read-only `plan-publication
assess-base-move` check (fetch only, verdict `fits`, `overlap` or `undecidable`). The pass makes
at most one assessed re-publish per issue, on the assessed tip; an overlapping or undecidable move
publishes too, with a fixed "Unresolved base move" flag in the plan pull request for review to
reconcile. When the base moves again during that re-publish, `publish` (with `allowNewerBase`)
still builds the plan commit on the assessed tip behind the newer one, assesses nothing more, and
the flag states that the further move was not assessed. The owner chose this on PR #735 over
issue #734's criterion that a second move stops. A rewritten base and a plan of the same issue in
either range still stop. Orphan recovery keeps the strict binding to the collected base.

## Consequences

Runs for different issues proceed in parallel from any checkout of the repository, and a stuck or
killed run blocks one issue rather than the repository. `cleanup` gains planning claims and orphaned
pass records as confirmed-per-item classes (`planning-claim prune`, `pass-prune`; it never decides
orphanhood itself and never calls `pass-close`), removes trusted text no pass record lists through
`trusted-prune`, and removes a kept `issue-planning` worktree once the operator has moved or
discarded its preserved plan.

A moved base no longer stops a run: a fitting move publishes as is, an overlapping or undecidable
one, or a base that moved again after the assessment, publishes flagged and leaves the
reconciliation to review. A rewritten base and a same-issue plan in the range still stop.

Claims are machine-local. Across machines the existing remote guards still prevent duplicates:
`BRANCH_EXISTS`, `PR_EXISTS`, `plan-branch-exists`, the create-only push and the canonical planning
comment. A plan pull request published by a batch Issue Buddy pass is no longer picked up by
autopilot; it is implemented by hand from its plan.

## Scope boundary

Only issue planning changes: Issue Buddy, issue-sourced `autopilot` and `plan-issue`. `plan` with a
free-text requirement and the implementing workflows keep their own worktree behavior. Autopilot's
draft-pull-request end state, decisions and ledger contents are unchanged apart from the internal
claim field.
