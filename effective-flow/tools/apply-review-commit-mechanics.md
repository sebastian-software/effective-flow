
# Effective Flow Apply Review – Commit mechanics

This internal sub-file is loaded by `tools/apply-review.md` as soon as the commit strategy `Individually` or `Individually with worktrees` is fixed in Phase 2. With `No commits` it is not needed.

**Load on demand:** Read `shared/runtime-state-safety.md`, when the commit lock or a component worktree below `.effective-flow/` is about to be mutated.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when the commit lock or a component worktree below `.effective-flow/` is about to be mutated.

#### Git commit mutex for "Individually"

If the commit strategy **Individually** was chosen, a global commit mutex applies to all delegation sub-agents. The mutex protects the entire critical git section, not just the final `git commit`.

Goal: parallel sub-agents may edit files at the same time, but must never perform staging or commit at the same time. This ensures a finding commit contains only changes of that finding.

Mutex convention:

- Lock handle: absolute
  `<RUNTIME_STATE_ROOT>/.effective-flow/apply-review-commit.lock`. Every concurrent delegation
  for the repository uses this one retained main-checkout handle, even when its
  `EXECUTION_ROOT` is linked or native.
- If the runtime directory is missing, from `RUNTIME_STATE_ROOT` apply “Runtime-state write
  safety” to that exact parent directory immediately before its `mkdir`. Immediately before
  every acquisition attempt, from the same root apply the guard again to the exact
  repository-relative lock target `.effective-flow/apply-review-commit.lock`. Do not create or
  remove a lock when the relevant guard blocks.
- Lock acquisition: atomically via `mkdir <absolute-lock-handle>`.
- Lock content: after a successful acquisition, write a short `owner` file below that absolute
  lock handle, with finding ID, component and timestamp.
- Lock release: delete only the lock you acquired yourself, after a commit success, commit abort or error handling.
- If the lock already exists: wait and retry. If the lock clearly seems orphaned, ask the user before removing it.

Critical section under the lock:

1. Run `git status --porcelain`.
2. If staged changes are already present that do not clearly belong to this finding: **do not commit**, inform the user and end with `ABORT` for this finding. Foreign staged changes must not be taken over or cleaned up.
3. Stage exclusively the files known from the pre-analysis and the actual implementation of this finding. Do not use blanket commands like `git add .`, `git add -A` or `git commit -a`.
4. Check `git diff --cached --name-only`. The list may only contain files of this finding.
5. Check `git diff --cached` whether the staged diff belongs content-wise to the current finding.
6. Run the commit with the message fixed in Phase 2.
   Its human-readable description uses the `language.git` value resolved by the orchestrator;
   the Conventional Commit type and other machine tokens remain stable English/ASCII.
7. Determine the commit hash directly afterwards with `git rev-parse HEAD` and log the `finding ID -> commit hash` mapping in the wisdom file.
8. Run `git status --porcelain` directly afterwards and log in the wisdom file whether uncommitted changes of other parallel findings still lie in the working tree. These residual changes are allowed as long as they are not staged and not part of the current commit.

If a check in the critical section fails, the sub-agent must unstage its own staged changes as far as clearly possible, release the lock and report `ABORT: [reason]`.

## Verified execution location

Every write-capable phase and delegated worker uses an **execution-location receipt**. The
receipt keeps `EXECUTION_ROOT` and `RUNTIME_STATE_ROOT` separate: tracked project work follows
the selected checkout, while private `.effective-flow/` state remains in the repository's main
checkout. It replaces any assumption that a one-time `cd`, an inherited current working
directory, or a subagent spawn option will keep later operations in the intended checkout.

### Receipt

Create the receipt before worktree creation, report-source resolution, or the first
write-capable action, whichever comes first. Pass it unchanged to every worker that may edit
files, read or mutate runtime state, run a formatter or a test that writes caches, run setup,
stage or commit, switch branches, or clean up a worktree. Record:

- the canonical absolute repository identity: the physical path returned by
  `git rev-parse --git-common-dir`, resolved against the command's working directory when Git
  returns a relative path;
- `EXECUTION_ROOT`, the canonical absolute execution root from
  `git rev-parse --show-toplevel`;
- `RUNTIME_STATE_ROOT`, the canonical absolute main-checkout root resolved by the procedure
  below;
- the checkout identity: either the exact branch name, or `detached` plus the exact commit OID
  when detached HEAD is explicitly expected;
- the origin: `in-place`, `harness-managed`, or `effective-flow-created`;
- setup ownership and status: who may run setup and whether it is pending, complete, skipped,
  or externally managed;
- the workflow or component that owns the receipt and its purpose.

Canonicalize paths before comparison: resolve symlinks, `..`, relative segments, and platform
case behavior through the host's physical-path facility. Path shape does not prove ownership.
A pre-existing user-created linked worktree counts as `harness-managed` for lifecycle purposes:
it is external to Effective Flow and must not be removed by this workflow.

### Runtime-state root

Before report-source resolution or any operation that may create or enter a delivery, native,
or component worktree, run `git worktree list --porcelain` from the verified current checkout.
Parse records by their empty-line separator and use only the first record, which Git defines as
the main worktree. The first record of `git worktree list --porcelain` must begin with exactly
one `worktree <path>` line. Reject a missing or duplicate path field, an empty path, or any record
that contains the boolean line `bare`. A `bare` first record has no usable main checkout and
therefore cannot own runtime state.

Canonicalize that path physically and require it to exist as a directory. From the candidate
root, require `git rev-parse --show-toplevel` to resolve back to the same root and
`git rev-parse --git-common-dir` to resolve to the same canonical Git common directory recorded
as the repository identity in the execution receipt. Record the result as
`RUNTIME_STATE_ROOT`. In an in-place run from the main checkout, `EXECUTION_ROOT` and
`RUNTIME_STATE_ROOT` are the same physical path. In a linked, native, delivery, or component
worktree, they differ.

Entering or creating another worktree changes only `EXECUTION_ROOT` and its checkout fields; it
must not change `RUNTIME_STATE_ROOT`. Revalidate the retained runtime root from the current
porcelain first record and its common-directory identity before every runtime-state read or
mutation and after resume or Handoff. A missing, moved, newly bare, repository-mismatched, or
otherwise unusable runtime root fails closed. Preserve every checkout and all existing state;
never fall back to `EXECUTION_ROOT`. If the root is valid but its runtime-state safety checks
fail, direct the user to `effective-flow setup` as specified by that contract.

### Fail-closed preflight

At each write-capable orchestrator or worker boundary, and again after resume or Handoff,
verify from the receipt's absolute execution root:

1. `git rev-parse --show-toplevel` resolves to the recorded execution root.
2. `git rev-parse --git-common-dir` resolves to the recorded repository identity.
3. `git branch --show-current` equals the recorded branch. If detached HEAD was explicitly
   recorded instead, the branch output must still be empty and `git rev-parse HEAD` must equal
   the recorded OID.
4. For a linked worktree, `git worktree list --porcelain` contains an entry whose canonical
   path and checkout identity match the receipt.

If any value is missing, cannot be canonicalized, or differs, abort before writing. Report the
expected and actual root and checkout identity, and retain every checkout. Do not edit, run
setup, run a formatter or test that may write, stage, commit, switch branches, or clean up.

After a Handoff or resume, a harness may provide a different execution root. Adopt it only by
issuing a new `harness-managed` receipt after proving the same repository identity and that the
expected work is present and consistent. Otherwise abort for reconciliation. A prior successful
preflight never authorizes later writes from an unverified runtime location.

### Rooted operations

After preflight, root tracked project, validation, staging, commit, and worktree lifecycle
operations in `EXECUTION_ROOT`:

- pass the absolute root as the per-call working directory when the harness supports it;
- use absolute paths for file tools;
- use `git -C <EXECUTION_ROOT> ...` for Git operations when a per-call working directory is not
  guaranteed.

Do not rely on a previous `cd` or on a worker inheriting the orchestrator's current directory.
If a worker cannot establish and verify the assigned root, it returns `ABORT` without writes.
Edits, validation, commits, and lifecycle operations for one receipt stay in that receipt's
execution root; component and delivery receipts are never interchangeable.

Root every `.effective-flow/` read, collision check, directory creation, report or backlink
write, cache or memory read/write, migration, and wisdom operation in `RUNTIME_STATE_ROOT`.
Resolve the concrete target to an absolute handle before entering another worktree and retain
that handle. For an existing path, physically canonicalize the path itself; for a target that
does not exist yet, physically canonicalize its nearest existing ancestor and append only the
validated missing path segments. The result must remain below the canonical absolute
`<RUNTIME_STATE_ROOT>/.effective-flow/` directory, and report handles must remain below
`<RUNTIME_STATE_ROOT>/.effective-flow/review/`. Reject `..`, path aliasing, or any existing
symlink that escapes those directories. A project-relative path is only presentation; it is
never an operational handle after the roots diverge.

### Harness-owned worktrees

- **Claude Code:** Subagents start from the parent context and directory changes do not persist
  as a portable cross-call contract. Native `isolation: worktree` creates a separate
  Claude-managed worktree. Use it only for a deliberately self-contained delegation that does
  not need an already selected Effective Flow worktree. Never combine native isolation with an
  assigned Effective Flow execution root.
- **Codex app:** A Codex app worktree is harness-managed, may start in detached HEAD, and remains
  associated with its task across Handoff. Reuse and revalidate it; do not wrap it in another
  Effective Flow worktree or remove it. Detached HEAD is valid only when the receipt explicitly
  pins its OID. If delivery requires a branch, create or adopt that branch through the supported
  app flow, then issue and verify a new branch receipt before committing.

### Setup and cleanup ownership

Automatic setup runs only when a receipt is `effective-flow-created` and its setup status is
`pending`. A reused linked or harness-native worktree is assumed to be prepared by its owner;
mark setup `externally managed` and do not repeat it. Run setup there only after an explicit user
request, or after reporting a missing prerequisite and obtaining the workflow's required
decision.

Remove a worktree or delete its temporary branch only when all of these are true:

1. Its receipt says `effective-flow-created` and names this workflow/component and purpose.
2. A fresh fail-closed preflight matches the recorded repository, root, and checkout identity.
3. `git worktree list --porcelain` still contains the matching entry.
4. The worktree is clean under the workflow's existing cleanup policy; unexpected untracked or
   modified files make it dirty.

If any proof fails, retain the worktree and branch and report why. Never force-remove a dirty,
moved, missing, mismatched, reused, in-place, user-owned, or harness-managed worktree. A failure
between `git worktree add` and successful receipt creation also leaves the new worktree in place
for manual reconciliation.

Cleanup targets only the exact Effective Flow-owned execution/component worktree named by its
receipt. It must never remove, rename, or otherwise alter `RUNTIME_STATE_ROOT` or use the runtime
root as a cleanup target. Runtime reports, backlinks, memory, caches, migrations, and wisdom
state remain in the main checkout after an owned worktree is removed.

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

#### Git worktree isolation for "Individually with worktrees"

If the commit strategy **Individually with worktrees** was chosen, a worktree isolation per delegation component applies instead of the git commit mutex.

Preconditions:

- The original working tree must be clean before creating the worktrees (`git status --porcelain` empty), apart from ignored Effective Flow files under `.effective-flow/`.
- `git worktree` must be available.
- Read the Effective Flow configuration (project-setup ADR), if present. If it is missing or contains no worktree values, use the defaults.
- Issue and verify the original integration root's own execution-location receipt before
  creating any component worktree. That receipt retains the verified main checkout as
  `RUNTIME_STATE_ROOT`, even if the original integration root is itself linked or native.
  Revalidate both roots before every integration or runtime-state write.

Worktree paths:

1. Determine the repo name from `basename "$(git rev-parse --show-toplevel)"`.
2. Use `applyReview.worktree.baseDir` from the Effective Flow configuration (project-setup ADR) as the BaseDir, or the default `.effective-flow/.worktrees`.
   Resolve a relative BaseDir against `RUNTIME_STATE_ROOT`; an explicitly configured absolute
   external BaseDir remains absolute and must still pass the environment and ownership checks.
3. Create worktrees under:
   `BASE_DIR/REPO_NAME/SESSION_ID/GROUP_NAME`
4. `GROUP_NAME` must be deterministic, short and filesystem-safe and identify the component from Phase 4.2, e.g. `component-1`, `component-2` or a slugified component description. Not an action-bound name, since a component can contain findings of multiple actions.

The default deliberately lies inside the project root. This keeps worktree creation, file changes and setup commands within the usual workspace sandbox. External BaseDirs are to be used only if they are explicitly fixed in the Effective Flow configuration (project-setup ADR) and the environment allows write and execute rights for them.

Branch convention:

- Per component: `apply-review/<SESSION_ID>/<GROUP_NAME>`
- When the concrete worktree path is below `.effective-flow/`, resolve every missing base or
  parent directory. From `RUNTIME_STATE_ROOT`, apply “Runtime-state write safety” to each exact
  directory immediately before its `mkdir`. Guard the exact absolute `WORKTREE_PATH` separately
  from that same root and immediately before the worktree operation. Create the worktree with:
  `git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> HEAD`
- Immediately issue and verify a separate `effective-flow-created` execution-location receipt
  for the component path, branch, repository, component owner and `apply-review` purpose. Keep
  the original integration root under its own receipt and the main checkout under the unchanged
  runtime-state handle. Immediately after the receipt succeeds, initialize a version 1
  lifecycle record for this component as `active`, with branch policy
  `delete-after-integration`, below the verified `RUNTIME_STATE_ROOT`. Create it before setup or
  delegation and retain its record ID and absolute handle with the component receipt. If receipt
  or lifecycle-record creation fails, retain the new worktree and branch for reconciliation and
  do not delegate.

Setup detection in the worktree:

- `applyReview.worktree.setup: "auto"` or a missing value:
  - `pnpm-lock.yaml` → `pnpm install --frozen-lockfile --prefer-offline`
  - `package-lock.json` → `npm ci`
  - `yarn.lock` → `yarn install --frozen-lockfile`
  - `Cargo.toml` → `cargo fetch --locked`
  - `go.mod` → `go mod download`
  - `uv.lock` → `uv sync --frozen`
  - `poetry.lock` → `poetry install --sync`
  - no known file → no setup
- `applyReview.worktree.setup: "none"`: run no setup.
- `applyReview.worktree.setup` as a string: run this explicit setup command in the worktree.

Git hooks are not used for this setup. The setup is an explicit `apply-review` step so that it stays visible, reproducible and limited to the temporary worktree.

Before running the worktree setup, briefly show which setup mode is active and which command is planned. With `setup: "none"` no install/fetch command is run; if a sub-agent later fails due to missing dependencies, name the setup profile in the summary as a possible cause.
Record the component receipt's final setup status as `complete` or `skipped` before delegation.

Delegation in the worktree:

- Pass the delegation sub-agent the component receipt and its canonical absolute execution
  root together with the unchanged canonical `RUNTIME_STATE_ROOT`. Require its fail-closed
  preflight before the first write and explicitly rooted file, shell, validation, staging and
  commit operations throughout. Reports, backlinks, memory, cache, migrations, and wisdom use
  only retained absolute handles below the runtime root.
- Pass it the commit strategy `Individually with worktrees`.
- Within the verified component root, sub-agents commit after each finding individually,
  without an internal finding ID in the commit message.
- Log in the wisdom file per finding: execution-location receipt, commit hash and commit message.

The component lifecycle remains `active` after a successful delegation because its commits are
not yet proven integrated. Under the per-record lock, transition it to `failed` when the
component implementation, commit, integration, or validation fails, or to `aborted` when the
workflow deliberately stops that component before integration. Retain the worktree and branch in
both states. An unexpected interruption leaves `active`; never infer an outcome from age.

Integration back into the original branch:

1. Wait for all worktree component final statuses.
2. Process the successful components in the **deterministic component order from Phase 4.2, step 5** (by report position of their first finding). Determine per component the new commits on its branch since `HEAD` of the original branch, in component order.
3. Revalidate the original integration receipt, then integrate the commits back into that
   verified root sequentially with `git -C <ORIGINAL_ROOT> cherry-pick <commit>`.
4. On a cherry-pick conflict: first run the cherry-pick conflict assessment. Resolve low-risk conflicts directly; ask the user only on high-risk or unclear conflicts.
5. After successful integration and validation, acquire the component lifecycle lock and
   reverify that its receipt and lifecycle record still prove `effective-flow-created`, Git
   registration, exact checkout identity, clean state, and proof that every component commit was
   integrated. Transition `active` to `cleanup-ready`, claim it as `cleanup-in-progress`, and
   run only `git worktree remove <WORKTREE_PATH>` without force while retaining the lock.
   Reconcile the absence of the worktree, then apply the recorded `delete-after-integration`
   policy only when integration is still proven, using exclusively
   `git branch -d <BRANCH_NAME>`. Delete only the fully reconciled lifecycle record. A remove or
   branch-cleanup refusal becomes `cleanup-failed` with the exact error and retains the remaining
   record, branch, or partial state. Never use `git worktree prune`, `git branch -D`, or alter
   `RUNTIME_STATE_ROOT` and its local review state.
6. On a failed component, transition an `active` lifecycle record to `failed` under its lock,
   keep the worktree and branch, name both paths and the record in the summary, and obtain a user
   decision only for manual reconciliation. On a controlled cancellation, use `aborted` instead.
   Neither status is eligible for automatic cleanup.

Cherry-pick conflict assessment:

1. Capture the conflict state:
   - `git status --porcelain`
   - affected conflict files
   - current commit, worktree branch and finding assignment from the wisdom file
   - conflict markers and affected sections per file
2. Assess the risk per file and for the entire conflict.

A conflict counts as **low-risk** only if all conditions are met:

- The conflict is small, locally contained and unambiguously understandable.
- The affected changes are additive or mechanically combinable.
- There are no contradictory functional statements.
- No code paths with non-obvious runtime logic are affected.
- The resolution requires no new architecture or product decision.

Typical low-risk cases:

- identical changes on both sides
- additive Markdown or documentation sections that can both be preserved
- independent entries in lists, tables or changelogs
- trivial ordering conflicts without semantic meaning
- formatting or comment conflicts without effect on behavior

A conflict counts as **high-risk** as soon as at least one condition applies:

- Production code, tests with behavior assertions, public APIs, schemas, migrations, lockfiles or build/runtime configurations are affected.
- Both sides change the same logic, the same control flow, the same data structure or the same error message with a different meaning.
- The resolution could remove, hide or recombine behavior.
- The conflict area is large, distributed or not safely assessable without full context.
- An automatic resolution would make assumptions about product behavior, architecture or priority between findings.

When in doubt, treat the conflict as high-risk.

Automatic resolution of low-risk conflicts:

1. Edit exclusively the conflict-affected files.
2. Preserve both sides if they are independent and additive.
3. Remove conflict markers completely.
4. Stage only the resolved conflict files with explicit paths.
5. Run `git cherry-pick --continue`.
6. Log in the wisdom file: commit, worktree branch, affected files, risk level, resolution strategy and rationale.

User query on high-risk or unclear conflicts:

Stop the integration and give the user a compact conflict assessment:

- commit and worktree branch
- affected files
- conflict type per file
- suspected cause
- risk level with rationale
- proposed options:
  - resolve manually
  - specify a concrete resolution strategy
  - skip the commit
  - abort the workflow

Do not perform any automatic conflict resolution as long as the user has given no direction.
