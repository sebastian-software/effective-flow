## Delivery and worktree integration

This shared fragment ties code-changing workflows to delivery branches, pull requests and
Git worktrees. The general values for base branch, branch-name construction and
completion action live in the `delivery` config block; the `worktree` block controls
exclusively whether and how the implementation runs in a separate Git worktree.

**By default the implementation runs in a Git worktree** (`worktree.enabled` default `true`):
an existing linked or harness-native worktree is reused, otherwise Effective Flow creates one
with its own branch. As soon as work happens in a worktree or on a dedicated delivery branch,
**delivery is implicitly active** and completes via `merge`
(default) or `pr`. There is no separate `delivery.enabled` switch anymore (see
"Delivery is implied by worktree/branch").

Only when the user explicitly asks for in-place work without a worktree and wants no
branch/PR/merge action does the workflow behave as if without this fragment: no
forced branch creation, no forced commits and no automatic
PR creation.

`<plan.dir>` is the plan directory from the Effective Flow configuration (project setup ADR) `plan.dir` (default
`docs/plan`).

### Roles of the config blocks

- **`delivery`** describes the delivery branch and its completion: base ref,
  branch prefix, completion action and return target.
- **`worktree`** describes exclusively the execution location: whether a worktree
  is used, where it lives and which setup runs in it.

Scope boundary: this fragment is **not** the per-finding worktree mechanism from
``tools/apply-review.md`` (`applyReview.worktree`). That one isolates parallel local
review findings and folds commits back onto the current branch via cherry-pick.
This fragment creates delivery branches for PR, merge or "branch only". Both
may use the same physical `baseDir`, since session and path segments
distinguish them.

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

Root every forge operation in `RUNTIME_STATE_ROOT` as well — for a different reason than runtime
state. A provider CLI such as `gh` or `tea` resolves its repository context from its working
directory, and the execution worktree is not guaranteed to exist when that call happens: the
completion action runs after an Effective Flow-owned worktree may already have been withdrawn, so
an inherited execution directory can be a deleted path. Pass the absolute runtime root as the
per-call working directory for every remote-helper invocation and for the repository-wide Git
operations that accompany a completion action, such as refreshing the base ref, resolving refs and
pushing the delivery branch. Those act on refs, not on a working tree. This holds while the
execution worktree still exists, so the behavior does not depend on cleanup order. It never
redirects tracked project work, and never any operation that reads or changes a working tree —
branch creation, branch checkout, cleanliness checks and a default derived from the checked-out
branch all stay in `EXECUTION_ROOT`.

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

### Configuration

If the Effective Flow configuration (project setup ADR) pins corresponding values, they override these defaults (schema shown here for illustration):

```json
{
  "delivery": {
    "baseBranch": "origin/main",
    "branchPrefix": "effective-flow",
    "completion": "merge",
    "returnBranch": "auto",
    "prReview": "ask"
  },
  "worktree": {
    "enabled": true,
    "setup": "auto",
    "baseDir": ".effective-flow/.worktrees"
  }
}
```

Missing values have these defaults:

- `delivery.baseBranch`: `"origin/main"`
- `delivery.branchPrefix`: `"effective-flow"`
- `delivery.completion`: `"merge"` (merge into the target branch as the default completion)
- `delivery.returnBranch`: `"auto"` (local branch part from `delivery.baseBranch`)
- `delivery.prReview`: `"ask"` (a gated run asks once per created pull request)
- `worktree.enabled`: `true` (implementation runs in its own worktree)
- `worktree.setup`: `"auto"`
- `worktree.baseDir`: `.effective-flow/.worktrees`

Valid values:

- `delivery.completion`: `"pr"`, `"merge"`, `"branch"`
- `delivery.returnBranch`: `"auto"` or a local branch name as a string
- `delivery.prReview`: `"ask"`, `"always"`, `"off"`
- `worktree.enabled`: `true`, `false`
- `worktree.setup`: `"auto"`, `"none"` or an explicit setup command as a string

`delivery.enabled` is **retired**: delivery is no longer activated via its own switch,
but is active whenever work happens in a worktree/dedicated branch
(see "Delivery is implied by worktree/branch"). A `delivery.enabled` still
present in a legacy config is ignored on read and removed by the full config migration
(see "Config migration").

### Config migration

Reading the Effective Flow configuration from the project setup ADR and the one-time consolidation
of a legacy config onto the current schema – in particular moving old delivery values out of
`worktree.baseBranch`/`worktree.branchPrefix`/`worktree.completion` into `delivery.*` and
removing the retired `delivery.enabled` – is handled by the shared fragment
"Config migration" (`config-migration.md`) once and centrally. This fragment performs **no** own
per-block migration anymore. Until a config is migrated, reading applies: new value from
`delivery.*` before legacy value from `worktree.*` before default; an existing
`delivery.enabled` is ignored.

### Determine mode (setup phase): Delivery is implied by worktree/branch

At the start of the actual implementation work, determine the effective mode:

- Before any fetch, setup, branch change or other write-capable action, issue and verify an
  execution-location receipt for the current checkout. Before worktree creation, resolve and
  retain its verified `RUNTIME_STATE_ROOT` from the first record of
  `git worktree list --porcelain`; a path below `.effective-flow/.worktrees` does not prove
  ownership. Keep `EXECUTION_ROOT` and `RUNTIME_STATE_ROOT` separate for the entire run.
- **Worktree execution is active by default** (`worktree.enabled` default `true`). It
  stays off only when `worktree.enabled: false` is set or the user explicitly requests
  in-place work ("without worktree", "directly on the current branch").
- When the current receipt points to an existing linked or harness-native worktree rather than
  the repository's main worktree, reuse it as `harness-managed`. Do not create a nested delivery
  worktree, switch its branch, repeat automatic setup or remove it during handback.
- **Delivery is active as soon as work happens in a worktree or on a dedicated delivery
  branch** – so in the default case always. In addition, delivery is active when the
  user explicitly requests PR, branch or merge work (even with in-place work; then
  the delivery branch is created in the main repo).
- If the worktree is disabled via config (`worktree.enabled: false`), give a brief
  note that the (default) worktree mode is off via config. If the user then also
  requests no delivery action, perform no further steps from this fragment
  (in-place without delivery).

### Shared preconditions

When delivery or worktree is active:

1. `git` and, for worktree execution, `git worktree` must be available. The current execution
   receipt must pass the fail-closed preflight before continuing.
2. `delivery.baseBranch` must be resolvable. If it is a remote ref (e.g.
   `origin/main`), first run `git fetch REMOTE BRANCH`, so the delivery branch
   starts from the current remote state.
3. If the current HEAD has relevant uncommitted changes or local commits that
   are not contained in `delivery.baseBranch`, point that out. A delivery branch freshly
   created from the base branch does not contain this work. Only continue
   if the user confirms the chosen mode or the workflow creates a safe
   partial-diff PR by the procedure described below.
4. Construct delivery branch names: `<delivery.branchPrefix>/<skill>/<slug>`, e.g.
   `effective-flow/build/user-login`. Derive the slug from the plan title, the task description,
   the issue or finding. If the branch name already exists, append a
   numeric suffix and report the chosen name.

### Run-owned delivery state

Before creating or switching any delivery artifact, retain the original verified
execution-location receipt and initialize explicit current-run ownership flags for the delivery
worktree and branch. After the current run creates a delivery branch, record its exact name and
creation OID immediately; do not substitute the base ref or a later-moving remote tip. After the
current run creates a worktree, record that ownership separately from its
`effective-flow-created` receipt. A name, path, configured base directory or pre-existing receipt
never proves current-run ownership.

Carry this state through baseline validation and every later phase:

- original checkout receipt and checkout identity,
- delivery branch name and exact creation OID,
- whether this run created the delivery branch,
- whether this run created the delivery worktree,
- the delivery execution-location receipt,
- for an Effective Flow-created worktree, its lifecycle record ID and retained absolute record
  handle below `RUNTIME_STATE_ROOT`.

For a reused `harness-managed` or user-managed worktree or branch, both creation flags stay
false and no lifecycle record is created. For in-place execution without delivery, no delivery
artifact is recorded.

### Worktree execution

When worktree execution is active:

1. If the current receipt identifies a linked or harness-native worktree, keep that root and
   checkout identity and mark setup as `externally managed`. A detached harness-native checkout
   remains valid only at its pinned OID. If delivery requires a branch, create or adopt it
   through the harness-supported flow and issue a new verified receipt before committing; never
   silently switch a harness-managed worktree. The linked or native checkout becomes
   `EXECUTION_ROOT`; the porcelain main checkout remains `RUNTIME_STATE_ROOT`.
2. Otherwise determine the repo name from `basename "$(git rev-parse --show-toplevel)"` and use
   `worktree.baseDir` (default `.effective-flow/.worktrees`) as the base dir. Worktree path:
   `BASE_DIR/REPO_NAME/SESSION_ID`. Resolve a relative `BASE_DIR` against
   `RUNTIME_STATE_ROOT`, never against a disposable worktree. When that path is below
   `.effective-flow/`, resolve every missing base or parent directory that will be created.
   From `RUNTIME_STATE_ROOT`, apply the owning workflow's loaded “Runtime-state write safety”
   contract to each exact directory path immediately before its `mkdir`; a guard for the
   eventual worktree path does not authorize creating its parents. Apply the contract again to
   the exact `WORKTREE_PATH` immediately before `git worktree add`.
   Create the worktree and delivery branch with
   `git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> <BASE_REF>`, then immediately issue and
   verify an `effective-flow-created` receipt for the exact path, branch, workflow and delivery
   purpose. Record both artifacts as current-run-owned and capture the branch's exact creation
   OID. Immediately after that receipt succeeds, initialize its version 1 worktree-lifecycle
   record as `active`, with branch policy `retain`, under the verified runtime root. Do this
   before setup or delegation. If receipt or lifecycle-record creation fails, retain the
   worktree and branch for manual reconciliation and do not continue inside it.
3. Only for that newly Effective Flow-created receipt, run setup per `worktree.setup` and
   briefly announce the mode beforehand:
   - `auto` or missing: decide by lockfile – `pnpm-lock.yaml` →
     `pnpm install --frozen-lockfile --prefer-offline`, `package-lock.json` →
     `npm ci`, `yarn.lock` → `yarn install --frozen-lockfile`, `Cargo.toml` →
     `cargo fetch --locked`, `go.mod` → `go mod download`, `uv.lock` →
     `uv sync --frozen`, `poetry.lock` → `poetry install --sync`, no known
     file → no setup.
   - `none`: run no setup.
   - String value: run this explicit command in the worktree.
     Record the final setup status as `complete` or `skipped` before delegation.
4. Pass the full receipt, including both roots, to every subsequent phase and delegated worker
   that creates or changes code, tests, documentation, or runtime state. Each boundary runs the
   fail-closed preflight. Project operations are explicitly rooted in `EXECUTION_ROOT`; runtime
   reads and writes use retained absolute handles below `RUNTIME_STATE_ROOT`. This also applies
   through the completion phase and the final validator/formatter.

### Lifecycle outcome handling

For a current-run-owned `effective-flow-created` delivery or partial-diff worktree, keep its
lifecycle record synchronized at every terminal workflow boundary. Perform every transition
under the record lock and the runtime-state write-safety guard:

- keep `active` while implementation, validation, commit, integration, or delivery preparation
  can still change the checkout;
- on a controlled stop before readiness, transition `active` to `aborted` with the concrete
  reason and retain both worktree and branch;
- on an implementation, validation, integration, ownership, or state error before readiness,
  transition `active` to `failed` with the exact reason and retain both artifacts;
- only after the intended changes are durably committed to the delivery branch may the owning
  workflow transition `active` to `cleanup-ready` and enter the shared claim/remove/reconcile
  sequence.

If a lifecycle transition cannot be persisted safely, retain the worktree and branch and report
the record handle and failed guard or operation. A sudden interruption deliberately leaves
`active`; no age check upgrades or downgrades it.

### In-place delivery without worktree

When delivery is active and worktree execution stays off:

1. Keep and verify the current checkout's `in-place` receipt, and remember the originally
   checked-out branch.
2. Ensure the working tree contains no uncommitted changes that
   should not become part of the delivery branch. If such changes exist,
   do not silently stage, stash or overwrite them; either obtain a user decision
   or use the partial-diff PR via worktree.
3. Create and check out the delivery branch from `delivery.baseBranch`.
4. Issue a new receipt for the delivery branch after switching. Record the branch as
   current-run-owned and capture its exact creation OID before setup or implementation. Run
   implementation, tests, validation and final formatting through explicitly rooted operations
   after a successful preflight at every write-capable boundary.
5. After completion, proceed per "Handback and completion action".

### Partial-diff PR via worktree

When the main checkout already holds changes that should not fully go into the PR,
a separate worktree is the preferred safe path, provided these
preconditions are met:

1. `git worktree` is available.
2. `delivery.baseBranch` is resolvable and, for remote refs, updatable.
3. The workflow knows an explicit list of the files that should go into the PR.

The procedure:

1. Create a fresh worktree branch from `delivery.baseBranch`, then immediately issue and verify
   a separate `effective-flow-created` receipt whose purpose is `partial-diff`. Before setup or
   file transfer, initialize its lifecycle record as `active` with branch policy `retain`; a
   record-creation failure retains both worktree and branch and aborts the partial-diff flow.
2. Take only the selected delivery files from the main checkout into the worktree.
   Permitted sources for this selection are plan affected files,
   review finding scope, issue scope, known files produced by the workflow, or
   an explicit user selection.
3. In the verified execution root, check whether the taken-over files produce a meaningful diff
   against the base ref. If not, abort and create no empty PR.
4. Commit in the verified execution root and run `effective-flow pr` against
   `delivery.baseBranch`.
5. Remove the worktree only through the shared lifecycle transition, claim, ordinary remove, and
   reconciliation sequence after the receipt passes every ownership-safe cleanup check. Leave
   the delivery branch locally and the main checkout unchanged. Non-selected changes in the
   main checkout remain untouched.

A heuristic partial-diff selection by "all changed files
except <plan.dir>" is not allowed. The workflow must know the files to include or
ask. This reliably keeps newly created plans, `.effective-flow/` state and other
local working files outside the PR.

### What lives in the delivery branch and what stays in the main repo

Data-keeping invariant: **Of the Effective Flow artifacts, only plans are
committed.** Reviews (local reports) and investigations always stay local and
untracked; in remote mode reviews are tracked as issues instead (never in the repo),
investigations remain purely local in any case (see "Issue-tracker integration" and
`effective-flow investigate`).

- **In the delivery branch:** the actual code, test and documentation deliverables of the
  workflow as well as – if the workflow kept a plan file – its final
  state (in the implemented case the archived, implemented-marked plan file).
- **Only in the main repo, never committed:** pure Effective Flow bookkeeping and runtime state, i.e.
  all remaining `.effective-flow/` artifacts – `memory.json`, `cache.json`, local review reports
  under `.effective-flow/review/`, investigation reports under `.effective-flow/investigation/`,
  config migration status and wisdom files. Their operational paths are absolute handles below
  `RUNTIME_STATE_ROOT`, even while tracked work executes elsewhere.

### Abort handback before implementation

Use this handback only when a workflow must abort after delivery setup but before implementation,
for example when `maintain` finds a red baseline. It is separate from normal completion: do not
mark or archive a plan, commit, ask for or execute a completion action, push, merge or create a
pull request. Preserve all abort diagnostics before lifecycle cleanup.

Fail closed. Mutate only artifacts that the retained run-owned delivery state proves were created
by the current run:

1. **No delivery artifacts:** For in-place execution without delivery, perform no lifecycle
   cleanup. Report the unchanged checkout.
2. **Externally managed state:** For `harness-managed`, user-managed or adopted worktrees and
   branches, perform no lifecycle mutation. Report every retained path or branch and that it is
   externally managed.
3. **Effective Flow-owned worktree:** Only when both current-run creation flags are true, the
   receipt is `effective-flow-created`, and the matching lifecycle record is still `active`,
   acquire its record lock and transition it to `aborted` with the concrete pre-implementation
   stop reason. Retain the worktree and branch for inspection; an aborted worktree is never a
   cleanup candidate. If the transition cannot be persisted, retain both artifacts and report
   the lifecycle failure. Do not remove the worktree merely because `HEAD` and the branch tip
   still equal the creation OID. Never compare against a moving remote tip when proving ownership
   or deciding whether any current-run artifact may be changed.
4. **In-place transient branch:** Only when the current run created the delivery branch, freshly
   verify the delivery receipt, clean status, exact branch name and recorded creation OID. Verify
   that the retained original checkout belongs to the same repository and can still be restored.
   Restore the original branch or detached OID first, revalidate its retained receipt, then
   revalidate and safely delete the unchanged transient branch with
   `git branch -d <BRANCH_NAME>`.
5. **Retention and partial cleanup:** Any lifecycle-write failure, dirty state, changed tip,
   ownership mismatch, receipt or registration mismatch, or failed restoration retains the
   affected artifact. Report its exact path or branch and the failed proof or command. If
   restoration succeeds but safe deletion of an in-place transient branch is refused, report
   partial cleanup explicitly and retain that branch. Never force-remove a worktree or
   force-delete a branch in this abort handback.

End the workflow immediately after reporting the abort handback. Do not enter implementation or
normal delivery completion.

### Handback and completion action (completion phase)

Following the workflow's regular completion logic (including completion-condition verification).
The final status switch of the plan file to `Umgesetzt`/`Implemented` and its
archiving is handled by step 1 below at the delivery point – the implementing workflow therefore does **not** set the
status beforehand, but leaves it to this phase (exception: in-place without
delivery, see step 1):

**Update existing PRs:** If the delivery branch already has a pull request
and subsequent changes are needed, those changes are always created and pushed as new
commits on the same PR branch. Existing PR commits must not
be rewritten via `commit --amend`, interactive rebase, squash or force-push.
If a normal push fails because of diverged remote history,
stop and report the conflict instead of overwriting history.

1. **Mark the plan as implemented, archive it and take it into the delivery branch:**
   Provided the workflow kept a plan file, this is the **delivery point** at which
   the plan counts as implemented (immediately before the PR is opened or the delivery branch
   is merged):
   - Set the canonical status marker to `Umgesetzt`/`Implemented` (preserve the complete plan
     language: German plan → `**Planungsstatus:** Umgesetzt`, English plan →
     `**Plan status:** Implemented`).
   - Move the plan file via `git mv` to `<plan.dir>/archive/` (create the directory if
     needed), per "Archive of implemented plans" of the plan-file convention.
   - If the implementation ran in a worktree or partial-diff worktree, provide this final,
     archived and implemented-marked state in the worktree (under
     `<plan.dir>/archive/<file>`). Marking and move are **committed along with it** and
     are thereby part of the PR/merge (implementation documentation). The `.effective-flow/` artifacts stay in the
     main repo.
   - If the workflow kept no plan file, this step does not apply.
   - If the workflow exceptionally runs in-place without delivery (no worktree, no
     branch/PR/merge action), the workflow performs the same status switch and
     archive move directly in the working tree; the final commit/merge into the
     target branch is then the delivery event.
2. **Ensure commit:** Commit all intended changes in the delivery branch
   – code, test and documentation deliverables as well as the taken-over plan file – via the
   commit logic from `effective-flow commit` (stage exclusively known changed files
   explicitly, derive a concrete Conventional Commit message, never set a
   `Co-Authored-By` trailer). Resolve `language.git` for the human-readable commit description;
   keep Conventional Commit types stable. Workflows that have already committed their work
   (e.g. `effective-flow maintain` with one commit per group) only commit the
   plan file here afterwards, if needed. If there is nothing to commit: inform the user,
   remove an automatically created empty delivery branch and end without
   PR/merge.
3. **Determine completion action:** If `delivery.completion` has a valid value,
   use it and briefly report that the action was taken from the Effective Flow configuration
   (project setup ADR). Otherwise ask:

If Delivery was active and no valid value for `delivery.completion` is set: Ask the user: **How should the delivery branch be completed?**
- Pull request -- Push the branch and create a PR against the base branch via pr
- Merge -- Merge the branch locally into the base branch, without a PR
- Branch only -- Leave the branch in the local repo, no further action

4. **Withdraw an Effective Flow-owned worktree:** Only when the receipt is
   `effective-flow-created` and the intended changes are durably committed on its delivery
   branch, acquire the lifecycle record lock, freshly reverify every eligibility proof, and
   transition `active` to `cleanup-ready`. Claim it as `cleanup-in-progress` for this workflow's
   cleanup run, execute only `git worktree remove <WORKTREE_PATH>` without force, and reconcile
   the result while retaining the lock. The `retain` branch policy leaves the delivery branch in
   the local repository. Delete only the successfully reconciled lifecycle record; a proof,
   remove, or record-finalization failure becomes `cleanup-failed` where safely writable and is
   reported with the retained path or partial state. For `in-place` and `harness-managed`
   receipts, perform no worktree cleanup and create no lifecycle state; leave handling to the
   user or harness. The verified `RUNTIME_STATE_ROOT` is never a cleanup target, and local review
   state there remains intact.
5. **Execute action:** Run this step and every Git, remote-helper and provider-CLI operation it
   performs in `RUNTIME_STATE_ROOT`, per "Rooted operations". Step 4 may already have removed the
   Effective Flow-owned worktree, so an inherited execution directory can be a deleted path; the
   delivery branch and its commits are repository-wide and need no worktree. Never fall back to
   `EXECUTION_ROOT` for this step.
   - `branch` / Branch only: leave the branch, report the name and a note about later
     PR creation.
   - `merge`: the target is the local branch part of `delivery.baseBranch` or the
     explicit `delivery.returnBranch`. Ensure that the target working tree
     is clean; otherwise inform instead of merging. If the local target branch is
     behind its remote-tracking ref, point that out. Merge the delivery branch –
     prefer fast-forward, otherwise a merge commit; on conflict stop, leave the branch
     and inform the user, no automatic conflict resolution.
   - `pr`: delegate to `effective-flow pr` and pass the delivery branch, base branch, the verified
     `RUNTIME_STATE_ROOT` as its execution root, the workflow/change type
     (`feat`/`fix`/`refactor`/`docs`/`chore` depending on the implementing workflow and effect) as
     a title-type hint, so the PR title carries a valid Conventional Commit type — with a squash
     merge it is the release signal — and the literal line `Next steps: suppressed` on its own
     line, because `effective-flow pr` returns its result here and the implementing workflow is the one
     that closes this run.
     Once `effective-flow pr` returned the pull request, run "PR review publication" with that pull
     request, whether this run is gated or a non-interactive delegation, and either the workflow's
     residual finding set or its explicit declaration that it has none. It uses the same verified
     `RUNTIME_STATE_ROOT`. This stays inside step 5 deliberately: step 4 has already withdrawn an
     Effective Flow-owned worktree and step 6 restores the checkout to the base branch, so a review
     running after them would have no execution root and would read base-branch content.

```lazy-include
pr-review-integration
when: the completion action created or reused a pull request and the automatic PR review may run
```

6. **Restore checkout:** For in-place delivery that switched the current checkout, after
   successful PR creation or with `branch`, switch back to `delivery.returnBranch` or, with
   `auto`, to the local branch part of `delivery.baseBranch`, provided the working tree is clean.
   Do not switch a reused harness-managed checkout. If an applicable switch-back fails,
   explicitly report the actual branch as a side effect.
