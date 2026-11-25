## Proven branches in cleanup

A `branch:<name>` item is a local branch whose content the helper proved is in
`origin/<base>` (`baseRef`, from `delivery.baseBranch`), read from the local remote-tracking ref
without a fetch. `source: orphan` is a branch under `delivery.branchPrefix` that no lifecycle record
and no running build names and no worktree checks out or uses; `source: record` is the branch of a
`worktree:` item in the same plan (`dependsOn`), deleted only after that worktree is removed in the
same call. `proof` says how it landed:

- `ancestor`: the tip is already part of the base.
- `tip-tree`: merging the tip into the base would change nothing (a squash merge).
- `squash-tree`: the base commit `proofCommit` holds the branch's squash, but later base commits
  changed those lines again; shown distinctly as Phase 4 step 8 says, the content stays in
  `<proofCommit>`.

**Dry run (Phase 4):** list each item with branch, tip, `proof`, `proofCommit` and source, and
state that each is re-proven right before its deletion. List `retainedBranches` separately, one
entry per branch with its reason; they are never offered. A non-null `branchProof.reason` is a
repository-wide failure (`grafts`, `shallow-repository`, `base-ref-missing`, `timeout`,
`proof-unavailable` with `detail`, or `configuration-unavailable`): report it, and take the
branches it kept from `retainedBranches`, never from `detail` (`git-failed` names any failed Git
call, not only a failed branch listing). Only for `configuration-unavailable` (an invalid
`delivery.branchPrefix`, `baseBranch` or `returnBranch`) repair the configuration through
`{{SKILL:setup}}` before rerunning.

| Reason                                                | Meaning and safe next step                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `not-proven`, `base-ref-missing`                      | content not shown in `origin/<base>`, or that ref is missing: run the entry's `fetchHint`, rerun  |
| `recorded`                                            | a lifecycle record or a running build still names it: let that run finish                         |
| `record-unreadable`                                   | an invalid or foreign record file, or unreadable build-run state: no orphan is offered; repair it |
| `checked-out`, `in-use`                               | a worktree has it checked out, or a rebase or bisect uses it: finish that, then rerun             |
| `unsafe-name`                                         | a name outside `[A-Za-z0-9._-]` and `/`, or a symbolic ref: never deleted; decide yourself        |
| `empty-diff`, `no-merge-base`, `multiple-merge-bases` | nothing to compare, unrelated or criss-cross history: decide yourself                             |
| `merge-attribute`                                     | a merge driver or text/eol conversion applies to a changed path: decide yourself                  |
| `grafts`, `shallow-repository`, `git-version`         | the repository cannot carry the proof (grafts, shallow clone, Git below 2.38)                     |
| `branch-limit`, `candidate-limit`, `timeout`          | a bound was reached, never a proof: rerun cleanup for the rest                                    |
| `proof-unavailable`                                   | a proof Git call failed (`detail` names it): rerun, or decide yourself                            |

A build run whose session is gone never finishes and keeps its branch `recorded`; a run directory a
crashed `create` left without `request.json` keeps every orphan `record-unreadable`. Cleanup never
removes a build-run directory: report the run and tell the user they may remove
`<RUNTIME_STATE_ROOT>/.effective-flow/build-runs/<run-id>/` once they know no session continues that
run, which discards that run's state, and then rerun cleanup.

**Apply outcomes:** a deleted item is `ok` with `tip`, `restore` and any removed `configRemoved`
entries (`configRemaining` names entries Git could not remove; the branch is still deleted). A kept
one is `BRANCH_RETAINED` with its `reason`: `worktree-not-removed` (its worktree item was not
selected or did not succeed), a proof reason above, `recorded`, `record-unreadable`, `checked-out`,
`in-use`, `ref-moved` (the tip moved), `timeout`, or `ref-recreate-failed`. `SANDBOX_DENIED` touched
nothing. `PREVIEW_MISMATCH` `proof-commit-missing` means the selected `proofCommit` is gone: plan
again.

**Report (Phase 6):** report a `ref-recreate-failed` item first: its branch was deleted while a
worktree checked it out and could not be recreated; give its tip and its `restore` command. Then
name each deleted branch with its tip OID, its `restore` line (for example
`git branch 'effective-flow/build/x' <tip>`) and its removed configuration entries (upstream,
description). State that the restore works until garbage collection: unreachable objects whose file
age exceeds `gc.pruneExpire` (default two weeks) can be pruned at the next automatic gc; that while
`origin/<name>` still exists the history can also be restored from it; and that the content itself
stays in `<proofCommit>`. Name each retained branch with its reason.
