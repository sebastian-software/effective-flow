## Effective Flow-owned worktree lifecycle

This contract adds crash-tolerant lifecycle evidence to the execution-location receipt. It never
replaces that receipt, Git's worktree registration, or the runtime-state write-safety contract.
A configured base directory, path pattern, branch prefix, age, or apparently empty checkout is
not ownership evidence.

Only worktrees created by Effective Flow receive lifecycle records. Reused user-managed or
`harness-managed` worktrees remain outside this lifecycle and must never be adopted retroactively.

### Runtime record

Each Effective Flow-created worktree is described by one file
`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/<RECORD_ID>.json`, and while a writer holds
it, by the per-record lock `<RECORD_ID>.lock` beside it. Only the runtime-state helper operations below
create, change, claim or delete a record or take its lock; never write, rename or delete either in
prose. The helper resolves `RUNTIME_STATE_ROOT` from `cwd` and applies “Runtime-state write safety”
to every record and lock handle itself, fail-closed. `RECORD_ID` is an opaque, collision-resistant identifier matching
`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$`, generated once and never derived from the path or branch. A
version 1 record has exactly this key set; strings are illustrative:

```json
{
  "schemaVersion": 1,
  "recordId": "opaque-record-id",
  "sessionId": "workflow-session-id",
  "componentId": null,
  "workflow": "build",
  "purpose": "delivery",
  "repositoryIdentity": "/canonical/common-git-dir",
  "runtimeStateRoot": "/canonical/main-worktree",
  "worktreePath": "/canonical/linked-worktree",
  "branch": "effective-flow/build/example",
  "creationOid": "full-commit-oid",
  "ownership": "effective-flow-created",
  "receipt": {
    "repositoryIdentity": "/canonical/common-git-dir",
    "executionRoot": "/canonical/linked-worktree",
    "runtimeStateRoot": "/canonical/main-worktree",
    "checkout": {
      "kind": "branch",
      "branch": "effective-flow/build/example"
    },
    "origin": "effective-flow-created",
    "setupOwner": "Effective Flow build",
    "setupStatus": "pending",
    "workflow": "build",
    "purpose": "delivery"
  },
  "branchPolicy": "retain",
  "createdAt": "RFC-3339 timestamp",
  "updatedAt": "RFC-3339 timestamp",
  "status": "active",
  "reason": null
}
```

`componentId` is the component identifier or `null`. `purpose` and `branchPolicy` are bound
together: `delivery` and `partial-diff` at exactly `<base>/<repo>/SESSION_ID` and
`plan-publication` or `merge-gate` at `<base>/<repo>/SESSION_ID-<purpose>` carry `retain`;
`apply-review` at a direct child of its session directory, on branch
`apply-review/<SESSION_ID>/<GROUP_NAME>`, and `base-validation` at that `-<purpose>` leaf, on branch
`base-validation/<SESSION_ID>`, carry `delete-after-integration`, as does `issue-planning` on
`issue-planning/<SESSION_ID>`. `reason` is `null` for
`active` and `cleanup-ready` and the exact reason otherwise. `creationOid` is the full commit OID at
which worktree and branch creation succeeded, captured once and never replaced. The `receipt` is the
immutable creation snapshot; fresh receipts are compared with it, never written into it. During
`cleanup-in-progress` a cleanup claim, `cleanupRunId` and `claimedAt`, names its owner and
timestamp. The helper refuses an unknown schema, a missing or extra key or an invalid value and never
repairs or rewrites such a record; only cleanup's confirmed `invalid-record` item deletes one.

### State machine

- `active`: the worktree exists and its owning workflow may still use it
- `cleanup-ready`: the intended work is durably secured on or integrated from the branch and the
  owner has released the worktree for safe removal
- `aborted`: the workflow stopped in a controlled way before cleanup readiness
- `failed`: the workflow failed or cannot prove that its intended work was safely completed
- `cleanup-in-progress`: one actor owns an exclusive removal claim
- `cleanup-failed`: an ordinary removal or required post-removal operation failed and may be
  retried only after all eligibility proofs pass again

| From                                        | To or terminal action                   | Operation                                                                                               |
| ------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| newly created                               | `active`                                | `worktree record-init`                                                                                  |
| `active`                                    | `cleanup-ready`, `aborted`, or `failed` | `worktree transition` by the owning session                                                             |
| `aborted` or `failed`                       | `active` (adoption)                     | `worktree transition` under the record lock, `adoption` `plan-pr-continuation` or `partial-diff-resume` |
| `aborted` or `failed`                       | `cleanup-ready` (release)               | `worktree transition` under the record lock, `release: "partial-diff"`                                  |
| `cleanup-ready` or `cleanup-failed`         | `cleanup-in-progress`                   | claim inside `worktree remove`, `cleanup apply`                                                         |
| `aborted`/`failed` `merge-gate`             | `cleanup-in-progress`                   | claim inside `cleanup apply` only, after the no-unpushed-commits proof                                  |
| `aborted` `plan-preserved` `issue-planning` | `cleanup-in-progress`                   | claim inside `cleanup apply` only                                                                       |
| `cleanup-in-progress`                       | `cleanup-failed` or record deleted      | the claiming helper call reconciles                                                                     |
| `cleanup-in-progress`                       | `aborted` `plan-preserved` (restore)    | the claiming `cleanup apply` call, while the superseded plan is still in place                          |

A controlled user or workflow stop becomes `aborted`; an implementation, integration, validation,
ownership, or state-persistence error becomes `failed`. A sudden interruption leaves `active`,
`cleanup-in-progress`, or a lock in place: report that uncertainty, and never infer a crash or
completion from elapsed time. There is no TTL, heartbeat, stale-after threshold or age-based
transition. A foreign, ownerless or interrupted lock or claim stays: never break or take it over.

### Removal eligibility

The helper evaluates these conditions from fresh evidence under the record lock and reports every
failed one by number (`NOT_ELIGIBLE`, `conditions`):

1. The record is schema-valid, `effective-flow-created`, and `cleanup-ready` or `cleanup-failed`
   (`worktree remove` also accepts this session's `active` record, cleanup a stopped `merge-gate`
   record or an `issue-planning` record `aborted` with reason `plan-preserved`).
2. Repository identity, `RUNTIME_STATE_ROOT`, path, branch, workflow, purpose and receipt snapshot
   match fresh evidence.
3. Exactly one linked worktree in `git worktree list --porcelain -z` matches the path.
4. That worktree is neither `locked` nor `prunable`, its directory exists, and its common Git
   directory matches.
5. Its `HEAD` and registration name the recorded branch; detached or changed branch identities fail.
6. `creationOid` is a commit and an ancestor of the branch tip
   (`git merge-base --is-ancestor <CREATION_OID> <CURRENT_BRANCH_TIP>` exits `0`), never compared
   with a moving remote tip.
7. `git -C <WORKTREE_PATH> status --porcelain --untracked-files=all --ignore-submodules=none` is
   empty; for removal it also fails on a kept release quarantine, ignored endpoint, any ignored entry
   in an `issue-planning` worktree (regardless of `plan.dir`), or hidden edit. Under the claim,
   planning removals recheck condition 7 just before Git removal and refuse an unavailable scan.
8. It is neither the main worktree nor the calling run's own execution worktree.
9. No foreign or ownerless lock or cleanup claim exists.

A released `partial-diff` record (`cleanup-ready` or `cleanup-failed`), a released `issue-planning`
one, or cleanup's `plan-preserved` `issue-planning` record, whose worktree is fully gone,
unregistered and its path absent, is removable without conditions 3, 4, 5 and 7 and the toplevel
part of 2; no Git call runs in the vanished path. A half-gone worktree keeps every condition.
Cleanup's confirmed claim of a `merge-gate` record in any of its four removable statuses waives
condition 6 for a no-unpushed-commits proof, re-derived under the lock without fetching: no merge,
cherry-pick, revert, rebase or sequencer in progress and an empty
`git rev-list HEAD --not --remotes`, or, fully gone (route above), a gone branch or that `rev-list`
from its tip. A failed call blocks; failures are `blockers`. Cleanup's confirmed
`preserved-plan-superseded` claim of a `plan-preserved` record waives condition 7 only for its one
proven plan file: under the lock it discards exactly that file, and the removal-time condition-7
facts must then hold fresh before the ordinary removal.

### Helper operations

```include
helper-call-shape
```

`cwd` is `RUNTIME_STATE_ROOT`; `executionRoot` is the registered checkout the calling run operates
from, and `RUNTIME_STATE_ROOT` for `worktree inspect`, the exit self-check and every call after the
run's own worktree was withdrawn, since that path no longer exists. `sessionId` proves ownership:
the record's own, or on adoption or release the new owner (`build` passes its build-run ID).

```text
node <skill-root>/scripts/effective-flow-state.mjs worktree path-resolve <<< '{"cwd":"<RUNTIME_STATE_ROOT>","purpose":"<PURPOSE>","sessionId":"<SESSION_ID>"}'
node <skill-root>/scripts/effective-flow-state.mjs worktree path-prepare <<< '{"cwd":"<RUNTIME_STATE_ROOT>","purpose":"<PURPOSE>","sessionId":"<SESSION_ID>"}'
node <skill-root>/scripts/effective-flow-state.mjs worktree reuse-facts <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","baseRef":"<RESOLVED_BASE_REF>","localBaseBranch":"<RESOLVED_LOCAL_BASE_BRANCH>","visibility":"<VISIBILITY>"}'
node <skill-root>/scripts/effective-flow-state.mjs worktree record-init <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","record":<complete version 1 record, status active>}'
node <skill-root>/scripts/effective-flow-state.mjs worktree transition <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","recordId":"<RECORD_ID>","from":"active","to":"<cleanup-ready|aborted|failed>","reason":<null or "<reason>">,"sessionId":"<SESSION_ID>"}'
node <skill-root>/scripts/effective-flow-state.mjs worktree inspect <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<RUNTIME_STATE_ROOT>","sessionId":"<SESSION_ID>"}'
node <skill-root>/scripts/effective-flow-state.mjs worktree remove <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<RUNTIME_STATE_ROOT>","sessionId":"<SESSION_ID>","recordIds":["<RECORD_ID>"]}'
```

- **`worktree path-resolve`** is read-only and the only source of an Effective Flow-created
  worktree path; `apply-review` adds `"group":"<GROUP_NAME>"`. It returns `worktreePath` (the
  purpose's leaf listed above, below `<base>/<repo>`, `<repo>` the basename of `cwd`), the `parents`
  still to create, `base`, its `source` and `diagnostics`. The base is `EFFECTIVE_FLOW_WORKTREE_BASE_DIR`
  when set and not empty (`source: "environment"`), else `worktree.baseDir`, for `apply-review`
  `applyReview.worktree.baseDir` (`configuration`), else `.effective-flow/.worktrees` (`default`),
  relative values against `cwd`. Whether the variable is set is known only from `source`, never
  from a shell probe. Report each `diagnostics` entry (`configured-base-differs`,
  `configured-base-invalid`) once per run and continue.
- **`worktree path-prepare`** takes the same input, re-derives that result and creates its missing
  `parents`: below `.effective-flow/` under the runtime-state guard, elsewhere only after the base,
  its ancestors and every segment pass the trust check. It never creates `worktreePath`, which must
  not exist yet, and proves the leaf's parent writable with a probe directory it removes. Never
  compose a worktree path or `mkdir` its parents in prose; run `git worktree add` at exactly that
  `worktreePath`, and `record-init` proves the created leaf.
- **`worktree record-init`** runs immediately after the verified `effective-flow-created` receipt
  and before setup or delegation. It writes the record no-clobber only for a newly registered,
  unlocked linked worktree at the purpose's path whose branch tip is `creationOid`.
- **`worktree transition`** runs under the record lock; a `from` that differs from the stored
  status writes nothing.
- **`worktree inspect`** is read-only: the session's records with their failed conditions, plus
  registered worktrees under its session paths that no record names (`unrecorded`) and ledgers
  without a record (`orphanLedgers`); its session paths also cover each record's `<base>/<repo>`,
  so an earlier base stays visible. Omitting `sessionId` covers every session.
- **`worktree remove`** lists every record of one session to withdraw in one call. Under one lock
  hold per record it moves `active` to `cleanup-ready`, claims it, runs only
  `git worktree remove <WORKTREE_PATH>` without force and never `git worktree prune`, applies the
  branch policy and deletes the record, its ledger first; a failed removal persists `cleanup-failed`
  with Git's error, and an already absent worktree is reconciled only under the call's own claim. Give the call an
  explicit Bash timeout of 120000 ms, above its 90 s deadline; in Codex, request sandbox escalation
  for it up front. `executionRoot` is never one of the listed worktrees.

```lazy-include
worktree-partial-diff-recovery
when: a `partial-diff` record's delivery ledger, `ledger init`, `ledger append`, `ledger reconcile`, `worktree resume-check`, or a `worktree transition` with `adoption`, `visibility` or `release` is used: that fragment owns them
```

**Branch policy.** `retain` leaves the branch. `delete-after-integration` runs
`git branch -d <BRANCH_NAME>`; when Git refuses, only an `apply-review` call carrying
`integrationRoot` lets the helper prove every component commit by exact patch-id against the branch
checked out there and then compare-and-delete the ref; a never-integrated `base-validation` branch
is compare-and-deleted only while its tip is `creationOid` and another ref reaches it, else kept
(`advanced`, `unreachable`), and so is an `issue-planning` branch; a local delivery branch is
compare-and-deleted only as `{{SKILL:cleanup}}`'s confirmed `branch:` item, under its helper proof
that the content landed in the base branch. Prose never runs `git branch -D`, and a forced deletion
outside these proofs never happens.

**`base-validation`** is the orchestrator's, at `baselineHead`; setup follows the worktree setup
policy, the validator installs nothing. Every exit path – completion, failure or abort – restores
the checkout to `creationOid`, removes the untracked, non-ignored output the validator reported as
generated, and withdraws the record with `worktree remove` and its denial fallback, never `aborted`
or `failed`, so a refused removal stays `cleanup-ready` or `cleanup-failed` for `{{SKILL:cleanup}}`.

**Outcomes.** Exit 0 carries `result`, exit 4 an `outcome.code`; any other exit, an unparsable
envelope or an `error` is handled as not `ok`. `worktree remove` exits 0 with `result.items[]`, one
`{recordId, ok, code?}` per record.

| Result                                                                                       | Handling                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path-resolve` or `path-prepare` not `ok` (`WORKTREE_*`, `UNSAFE_TARGET`, …)                 | No worktree created and no other base tried: stop before `git worktree add`, report code and `path`. `WORKTREE_BASE_INVALID` names a missing or non-directory base outside `.effective-flow/` by `key` or `variable`; `WORKTREE_SANDBOX_DENIED`, a denied write in an existing parent or below `.effective-flow/`, needs the base writable. |
| `record-init` not `ok` (`RECORD_EXISTS`, `NOT_ELIGIBLE`, `LOCK_HELD`, `INTERRUPTED`, …)      | Retain worktree and branch, run no setup or delegation there, stop, and report the code and proofs.                                                                                                                                                                                                                                     |
| `transition` not `ok` (`STATUS_MISMATCH`, `RECORD_NOT_FOUND`, `NOT_OWNER`, `INTERRUPTED`, …) | Retain worktree and branch; report the record ID, code and current status. `LOCK_HELD` names the owner.                                                                                                                                                                                                                                 |
| `inspect` lists an orphan record lock or an orphan ledger                                    | A lock with no record, or no owner, or a ledger with no record: report it; never break or delete it.                                                                                                                                                                                                                                    |
| item `ok`                                                                                    | Worktree and record gone; report the branch outcome.                                                                                                                                                                                                                                                                                    |
| item `BRANCH_RETAINED`                                                                       | Worktree, record gone, branch kept: report `branch.branch`, `branch.reason` and `branch.unproven` (`ref-recreate-failed`: deleted; `branch.restore`).                                                                                                                                                                                   |
| item `NOT_ELIGIBLE`, `LOCK_HELD`, `NOT_OWNER`, `RECORD_NOT_FOUND`, `INVALID_STATE`           | Nothing changed: report the failed conditions and `blockers`, owner or reason; the record keeps its status.                                                                                                                                                                                                                             |
| item `PREVIEW_MISMATCH` (`cleanup apply`)                                                    | The record changed after the dry run; nothing changed. Plan again.                                                                                                                                                                                                                                                                      |
| item `REMOVE_FAILED`                                                                         | The record is `cleanup-failed` with Git's error (or `persisted: false`): report partial cleanup.                                                                                                                                                                                                                                        |
| item `UNSAFE_TARGET`, `WRITE_FAILED`, `GIT_FAILED`                                           | That item stopped; an in-flight claim or Git timeout is reconciled to `cleanup-failed`. Report the code and the status `worktree inspect` shows.                                                                                                                                                                                        |
| item `restored: true` (`PLAN_CHANGED`, `INTERRUPTED`, `GIT_FAILED`, …; `cleanup apply`)      | A superseded-plan discard refused before its quarantine: the record is back at `aborted`/`plan-preserved`, nothing removed. Plan again. With `restored: false` the restore write failed and the record is `cleanup-failed` (or, with `persisted: false`, still claimed): report it.                                                     |
| item `SANDBOX_DENIED`                                                                        | Nothing touched: rerun once with sandbox escalation, listing only the denied `recordIds`; otherwise report.                                                                                                                                                                                                                             |
| item `DEADLINE_REACHED`, `INTERRUPTED`                                                       | Not started (also when under 15 s of the deadline remain; a record may already be `cleanup-ready`) or reconciled to `cleanup-failed`: report.                                                                                                                                                                                           |
| harness denial, auto-mode refusal, another exit, an unparsable envelope or an `error`        | Nothing beyond the reported items changed: report the call.                                                                                                                                                                                                                                                                             |

**Denial fallback.** After `worktree remove` returns any item that is not `ok` (`BRANCH_RETAINED`
aside) or fails as a whole call, and after the one `SANDBOX_DENIED` rerun, call `worktree
transition` `active` → `cleanup-ready` with `"reason":null` for every listed record not reported
removed (`STATUS_MISMATCH` means it already left `active`), because `{{SKILL:cleanup}}` collects only
`cleanup-ready` and `cleanup-failed`; report each retained worktree for `{{SKILL:cleanup}}`.

A final report names every retained worktree and every `BRANCH_RETAINED` branch, because no record
points at that branch any more.
