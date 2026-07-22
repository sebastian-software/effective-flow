## Effective Flow-owned worktree lifecycle

This contract adds crash-tolerant lifecycle evidence to the execution-location receipt. It never
replaces that receipt, Git's worktree registration, or the runtime-state write-safety contract.
A configured base directory, path pattern, branch prefix, age, or apparently empty checkout is
not ownership evidence.

Only worktrees created by Effective Flow receive lifecycle records. Reused user-managed or
`harness-managed` worktrees remain outside this lifecycle and must never be adopted retroactively.

### Runtime record

Immediately after an `effective-flow-created` execution-location receipt has been issued and
verified, create one record below the retained and freshly revalidated runtime root:

`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/<RECORD_ID>.json`

`RECORD_ID` is an opaque, collision-resistant, filesystem-safe identifier generated once for the
worktree. It is not derived as proof from the worktree path or branch. A version 1 record has this
single field layout; strings below are illustrative values, not additional nesting choices:

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

`componentId` is always present and is either the component identifier or `null` for a
non-component worktree. `branchPolicy` is exactly `retain` for delivery and partial-diff branches
or `delete-after-integration` for temporary `apply-review` component branches. `reason` is `null`
for the normal `active` or `cleanup-ready` state and otherwise contains the exact transition or
failure reason. During `cleanup-in-progress`, add the top-level string fields `cleanupRunId` and
`claimedAt`; they are absent in every other status.
For a cleanup claim, `cleanupRunId` and `claimedAt` identify its owner and timestamp.
The nested `receipt` is the immutable snapshot issued at creation; fresh receipts are compared
with its repository, root, checkout, origin, workflow, and purpose identity fields but never
overwrite it. Setup status may legitimately advance from the captured `pending` value after
lifecycle creation and is not branch-identity evidence.

`creationOid` is immutable evidence of the commit at which worktree and branch creation
succeeded. Capture the full commit OID once at creation and never replace it with the later
`HEAD`, current branch tip, base ref, or a moving remote tip. Normal commits after creation are
expected to advance the recorded branch beyond this OID.

Paths, IDs, status values, policy values, timestamps, and other machine-readable fields are not
localized. Reject an unknown schema, missing field, duplicate `recordId`, invalid value, path
alias, or record/filename mismatch. Never repair, reinterpret, overwrite, or delete such a record
automatically.

The record is runtime state, not configuration. Resolve its absolute handle below the verified
`RUNTIME_STATE_ROOT`, and apply “Runtime-state write safety” immediately before every parent
creation, lock acquisition, owner-file write, temporary-record write, rename, record deletion,
or lock release. A guard for one handle authorizes no other handle. Create or replace a record by
writing a complete sibling temporary file and atomically renaming it onto the expected record
handle; never expose a partially written record. If initial record creation fails, retain the
worktree and branch and do not run setup or delegate work there.

This temporary-file-and-rename sequence is the required atomic write; use an actual atomic
`rename`, not a truncate-and-rewrite operation on the live record.

### Serialized mutations

Every lifecycle writer, including the creating workflow and every later cleanup run, uses the
same per-record lock:

`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/<RECORD_ID>.lock`

Acquire it atomically with `mkdir`. After successful acquisition, write an `owner` file containing
the actor/run ID, workflow, process or session identity when available, and acquisition timestamp.
Keep the lock for the entire read/validate/transition/operation/reconciliation sequence. Under the
lock, freshly revalidate the runtime root, reread the record, Git worktree inventory and receipt,
and reject any drift before writing.

Release only the exact lock acquired by the current actor and only after its protected sequence
has reached a persisted outcome. An existing lock with another owner, an ownerless lock, or a lock
left by an interrupted process blocks fail-closed. Report its owner and timestamp when readable;
never break it based on age. Likewise, never take over another `cleanup-in-progress` claim. There
is no stale-lock timeout, lifecycle TTL, heartbeat, or age-based status transition.

### State machine

The complete status vocabulary is:

- `active`: the worktree exists and its owning workflow may still use it
- `cleanup-ready`: the intended work is durably secured on or integrated from the branch and the
  owner has released the worktree for safe removal
- `aborted`: the workflow stopped in a controlled way before cleanup readiness
- `failed`: the workflow failed or cannot prove that its intended work was safely completed
- `cleanup-in-progress`: one actor owns an exclusive removal claim
- `cleanup-failed`: an ordinary removal or required post-removal operation failed and may be
  retried only after all eligibility proofs pass again

Only these transitions are valid:

| From                                | To or terminal action                   | Required proof                                  |
| ----------------------------------- | --------------------------------------- | ----------------------------------------------- |
| newly created                       | `active`                                | verified receipt and atomic initial record      |
| `active`                            | `cleanup-ready`, `aborted`, or `failed` | owning workflow, under the record lock          |
| `cleanup-ready` or `cleanup-failed` | `cleanup-in-progress`                   | fresh eligibility checks plus cleanup run claim |
| `cleanup-in-progress`               | `cleanup-failed`                        | claimed actor records the exact failure         |
| `cleanup-in-progress`               | delete only this lifecycle record       | claimed actor proves complete cleanup           |

Do not transition `active`, `aborted`, or `failed` into a cleanup claim. A controlled user or
workflow stop becomes `aborted`; an implementation, integration, validation, ownership, or
state-persistence error becomes `failed`. A sudden interruption naturally leaves `active`,
`cleanup-in-progress`, or its lock in place. Report that uncertainty honestly; never infer a
crash or successful completion from elapsed time.

### Removal eligibility

Evaluate eligibility from fresh evidence immediately before the dry-run and again under the
record lock immediately before claiming. A worktree is removable only when every condition is
true:

1. The lifecycle record is schema-valid, has ownership `effective-flow-created`, and has status
   `cleanup-ready` or `cleanup-failed`.
2. A fresh execution-location receipt matches the immutable identity fields of the `receipt`
   snapshot and the top-level canonical repository identity, `RUNTIME_STATE_ROOT`, worktree path,
   exact branch, workflow, purpose, and ownership. The snapshot is compared as creation evidence;
   it is not rewritten with current checkout state.
3. Exactly one matching linked-worktree record exists in
   `git worktree list --porcelain -z`; parse NUL-delimited fields and records without
   line-oriented or path-shape assumptions.
4. The Git record is neither `locked` nor `prunable`, the canonical worktree directory exists,
   and its common Git directory matches the recorded repository identity.
5. The current `HEAD` and the Git worktree registration both identify the exact recorded branch,
   and that local branch resolves to `CURRENT_BRANCH_TIP`. Detached, missing, or changed branch
   identities do not qualify.
6. The immutable `creationOid` resolves locally as a commit, and it is an ancestor of
   `CURRENT_BRANCH_TIP`. Check with
   `git merge-base --is-ancestor <CREATION_OID> <CURRENT_BRANCH_TIP>`: exit `0` passes, exit `1`
   blocks, and every other exit code or command error also blocks. History rewriting that drops
   `creationOid` therefore fails closed. Never compare this proof against a moving remote tip.
7. `git -C <WORKTREE_PATH> status --porcelain --untracked-files=all --ignore-submodules=none`
   is empty. Modified submodules and every unexpected tracked or untracked path make it dirty.
8. The target is neither the main worktree/`RUNTIME_STATE_ROOT` nor the execution worktree from
   which the cleanup run itself is operating.
9. No foreign or ownerless lifecycle lock or cleanup claim exists.

Any failed, unavailable, contradictory, or ambiguous proof means retain. Worktrees created before
this lifecycle existed have no record and therefore remain ineligible even if their path, branch,
or contents look familiar.

### Claim, remove, and reconcile

After explicit user confirmation, process each selected candidate independently:

1. Acquire its record lock, rerun every eligibility check, generate a cleanup run ID, and
   atomically transition `cleanup-ready` or `cleanup-failed` to `cleanup-in-progress` with
   `cleanupRunId` and `claimedAt`. These fields are the cleanup run ID and claim timestamp that
   identify the claim owner.
2. While retaining the lock, require the freshly reread record and matching receipt to still
   prove ownership `effective-flow-created`, then run only
   `git worktree remove <WORKTREE_PATH>`. Never add `--force`, and never substitute
   `git worktree prune`.
3. If removal fails, atomically persist `cleanup-failed` with the exact command error, clear the
   claim fields, release the owned lock, and continue only with independently verified
   candidates.
4. If removal succeeds, re-read Git registration, the claimed record, path state, and branch
   policy. Do not reconstruct a removed worktree. A delivery or partial-diff branch with policy
   `retain` remains. A temporary component branch with policy `delete-after-integration` may be
   removed only after its integration is still proven, and only with
   `git branch -d <BRANCH_NAME>`; never use `git branch -D`.
5. Delete only the claimed lifecycle record after absence of the worktree is proven and the
   branch policy is completely satisfied. Then release the owned lock. If worktree removal
   succeeded but record or branch handling did not, preserve the record as `cleanup-failed` when
   it can still be written by the claim owner and report partial cleanup. If persistence itself
   fails, retain the lock/claim evidence and report manual reconciliation rather than claiming
   success.

A lifecycle record whose worktree is already absent is not a normal removal candidate. Reconcile
it only while the current actor still owns the matching lock and `cleanup-in-progress` claim and
can prove the exact successful removal plus branch outcome. Otherwise retain the record and report
the missing/mismatched worktree or interrupted claim for manual reconciliation.

### Retention reasons and final reporting

Classify every linked worktree other than the main worktree deterministically. At minimum retain
and distinguish:

- the current cleanup execution worktree: cleanup is running in this worktree
- `active`: an Effective Flow run is registered as active and may still be running or may have
  been interrupted unexpectedly
- `aborted`: the owning run stopped in a controlled way
- `failed`: the owning run failed before safe cleanup readiness
- `cleanup-in-progress` or an existing lock: cleanup is claimed, active, or may have been
  interrupted; include known owner and timestamp
- dirty, locked, prunable, missing, detached, branch/OID-mismatched, receipt-mismatched, or
  repository-mismatched worktrees: name the failed proof
- reused, user-managed, foreign, or `harness-managed` worktrees: not Effective Flow-owned
- no lifecycle record or an unknown/invalid schema: ownership or lifecycle cannot be proven
- `cleanup-failed`: include the recorded or current removal failure when it is not selected or
  no longer eligible for retry

Pair each reason with a conservative next step: let the named owner finish an active run or
claim; inspect and recover work from `aborted` or `failed`; clean a still-eligible dirty checkout
before rerunning cleanup; ask the known owner before unlocking a Git-locked worktree; let the
harness or user manage external worktrees; and manually reconcile recordless, prunable, missing,
invalid-schema, foreign-lock, or partial-cleanup state. Cleanup itself never breaks a lock or
upgrades a retained lifecycle status to make it eligible.

The completion report is mandatory even when no removal candidate or migration remnant exists.
List removed worktrees, failed or partial cleanup attempts, and every remaining linked worktree
other than the main worktree. For each remaining worktree show a project-relative path when it is
inside the runtime root (otherwise its canonical path), checkout identity, lifecycle/verification
status, one concrete retention reason, and one safe next step. Never collapse several worktrees
behind a shared reason. State explicitly when no linked worktrees remain. Report unmatched
lifecycle records separately so partial cleanup evidence is not hidden.
