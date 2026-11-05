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

The standalone `effective-flow deliver` partial-diff lifecycle is the narrow exception to reusing a
harness-managed source checkout as the delivery checkout. Its dirty or detached source receipt is
immutable input evidence, not the place where delivery work occurs. After confirming an exact
selection, `deliver` may create a separate `effective-flow-created` delivery worktree from the
refreshed configured base, issue a new purpose-scoped receipt for that worktree, and transfer only
the bound selection. It never switches, adopts, stages, commits in, or removes the harness-managed
source checkout. The source and delivery receipts remain distinct and must both pass preflight at
every cross-check; neither receipt may be substituted for the other.

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
together: `delivery` and `partial-diff` at exactly `BASE_DIR/REPO_NAME/SESSION_ID` and
`plan-publication` at `BASE_DIR/REPO_NAME/SESSION_ID-plan-publication` carry `retain`;
`apply-review` at a direct child of its session directory, on branch
`apply-review/<SESSION_ID>/<GROUP_NAME>`, carries `delete-after-integration`. `reason` is `null` for
`active` and `cleanup-ready` and the exact reason otherwise. `creationOid` is the full commit OID at
which worktree and branch creation succeeded, captured once and never replaced. The `receipt` is the
immutable creation snapshot; fresh receipts are compared with it, never written into it. During
`cleanup-in-progress` a cleanup claim, `cleanupRunId` and `claimedAt`, names its owner and
timestamp. The helper refuses an unknown schema, a missing or extra key or an invalid value and never
repairs, rewrites or deletes such a record.

### State machine

- `active`: the worktree exists and its owning workflow may still use it
- `cleanup-ready`: the intended work is durably secured on or integrated from the branch and the
  owner has released the worktree for safe removal
- `aborted`: the workflow stopped in a controlled way before cleanup readiness
- `failed`: the workflow failed or cannot prove that its intended work was safely completed
- `cleanup-in-progress`: one actor owns an exclusive removal claim
- `cleanup-failed`: an ordinary removal or required post-removal operation failed and may be
  retried only after all eligibility proofs pass again

| From                                | To or terminal action                   | Operation                                                                |
| ----------------------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| newly created                       | `active`                                | `worktree record-init`                                                   |
| `active`                            | `cleanup-ready`, `aborted`, or `failed` | `worktree transition` by the owning session                              |
| `aborted` or `failed`               | `active` (adoption)                     | `worktree transition` under the record lock, `plan-pr-continuation` only |
| `cleanup-ready` or `cleanup-failed` | `cleanup-in-progress`                   | claim inside `worktree remove`, `cleanup apply`                          |
| `cleanup-in-progress`               | `cleanup-failed` or record deleted      | the claiming helper call reconciles                                      |

A controlled user or workflow stop becomes `aborted`; an implementation, integration, validation,
ownership, or state-persistence error becomes `failed`. A sudden interruption leaves `active`,
`cleanup-in-progress`, or a lock in place: report that uncertainty, and never infer a crash or
completion from elapsed time. There is no TTL, heartbeat, stale-after threshold or age-based
transition. A foreign, ownerless or interrupted lock or claim stays: never break or take it over.

### Removal eligibility

The helper evaluates these conditions from fresh evidence under the record lock and reports every
failed one by number (`NOT_ELIGIBLE`, `conditions`):

1. The record is schema-valid, `effective-flow-created`, and `cleanup-ready` or `cleanup-failed`
   (`worktree remove` also accepts this session's `active` record).
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
   empty.
8. It is neither the main worktree nor the calling run's own execution worktree.
9. No foreign or ownerless lock or cleanup claim exists.

### Helper operations

**Helper call shape.** Write every call of the three JSON helpers as exactly one simple command:

```text
node <skill-root>/scripts/<helper>.mjs <argv> <<< '<json>'
```

with exactly this `<argv>` per helper: `effective-flow-state.mjs <group> <operation>`,
`config-resolve.mjs resolve`, and `remote-tracker.mjs <operation>`, or `<operation> --apply` for a
mutation.

- Resolve `<skill-root>` from the currently loaded Effective Flow skill, in the form it was
  reached (a symlinked install path included, never resolved through `realpath`), and spell it out
  literally as an absolute path. Never use a shell variable, `$PWD`, `~`, command substitution,
  `cd … &&`, an `echo … |` or `printf … |` pipe, a heredoc, a loop or function, a compound
  command joined by `;`, `&&` or `||`, a trailing `echo "exit=$?"` or any other trailing command,
  or `| grep` or any other pipe on the output. Read the exit status and the envelope from the tool
  result itself.
- Every JSON value is literal too: `cwd`, where sent, is the literal absolute path its owning
  contract names (`RUNTIME_STATE_ROOT` for `effective-flow-state.mjs`), never `$PWD`. Write a `'`
  inside the JSON as `'\''`.
- The Claude Code allow rule matches only this literal shape, so any other shape prompts for
  permission on every call. The rule binds every harness, since it is also the auditable shape.

`cwd` is `RUNTIME_STATE_ROOT`; `executionRoot` is the registered checkout the calling run operates
from, and `RUNTIME_STATE_ROOT` for `worktree inspect`, the exit self-check and every call after the
run's own worktree was withdrawn, since that path no longer exists. `sessionId` proves ownership:
the record's own, or on adoption the new owner (`build` passes its build-run ID).

```text
node <skill-root>/scripts/effective-flow-state.mjs worktree record-init <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","record":<complete version 1 record, status active>}'
node <skill-root>/scripts/effective-flow-state.mjs worktree transition <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","recordId":"<RECORD_ID>","from":"active","to":"<cleanup-ready|aborted|failed>","reason":<null or "<reason>">,"sessionId":"<SESSION_ID>"}'
node <skill-root>/scripts/effective-flow-state.mjs worktree inspect <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<RUNTIME_STATE_ROOT>","sessionId":"<SESSION_ID>"}'
node <skill-root>/scripts/effective-flow-state.mjs worktree remove <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<RUNTIME_STATE_ROOT>","sessionId":"<SESSION_ID>","recordIds":["<RECORD_ID>"]}'
```

- **`worktree record-init`** runs immediately after the verified `effective-flow-created` receipt
  and before setup or delegation. It writes the record no-clobber only for a newly registered,
  unlocked linked worktree at the purpose's path whose branch tip is `creationOid`.
- **`worktree transition`** runs under the record lock; a `from` that differs from the stored
  status writes nothing.
- **`worktree inspect`** is read-only: the session's records with their failed conditions, plus
  registered worktrees under its session paths that no record names (`unrecorded`). Omitting
  `sessionId` covers every session.
- **`worktree remove`** lists every record of one session to withdraw in one call. Under one lock
  hold per record it moves `active` to `cleanup-ready`, claims it, runs only
  `git worktree remove <WORKTREE_PATH>` without force and never `git worktree prune`, applies the
  branch policy and deletes the record; a failed removal persists `cleanup-failed` with Git's error,
  and an already absent worktree is reconciled only under the call's own claim. Give the call an
  explicit Bash timeout of 120000 ms, above its 90 s deadline; in Codex, request sandbox escalation
  for it up front. `executionRoot` is never one of the listed worktrees.

**Branch policy.** `retain` leaves the branch. `delete-after-integration` runs
`git branch -d <BRANCH_NAME>`; when Git refuses, only an `apply-review` call carrying
`integrationRoot` lets the helper prove every component commit by exact patch-id against the branch
checked out there and then compare-and-delete the ref. Prose never runs `git branch -D`, and a
forced deletion outside that proof never happens.

**Outcomes.** Exit 0 carries `result`, exit 4 an `outcome.code`; any other exit, an unparsable
envelope or an `error` is handled as not `ok`. `worktree remove` exits 0 with `result.items[]`, one
`{recordId, ok, code?}` per record.

| Result                                                                                       | Handling                                                                                                                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `record-init` not `ok` (`RECORD_EXISTS`, `NOT_ELIGIBLE`, `LOCK_HELD`, `INTERRUPTED`, …)      | Retain worktree and branch, run no setup or delegation there, stop, and report the code and proofs.                                              |
| `transition` not `ok` (`STATUS_MISMATCH`, `RECORD_NOT_FOUND`, `NOT_OWNER`, `INTERRUPTED`, …) | Retain worktree and branch; report the record ID, code and current status. `LOCK_HELD` names the owner.                                          |
| `inspect` lists an orphan record lock                                                        | A lock with no record, or no owner: report it; never break it.                                                                                   |
| item `ok`                                                                                    | Worktree and record gone; report the branch outcome.                                                                                             |
| item `BRANCH_RETAINED`                                                                       | Worktree and record gone, branch kept: report `branch.branch`, `branch.reason` and `branch.unproven`.                                            |
| item `NOT_ELIGIBLE`, `LOCK_HELD`, `NOT_OWNER`, `RECORD_NOT_FOUND`, `INVALID_STATE`           | Nothing changed: report the failed conditions, owner or reason; the record keeps its status.                                                     |
| item `PREVIEW_MISMATCH` (`cleanup apply`)                                                    | The record changed after the dry run; nothing changed. Plan again.                                                                               |
| item `REMOVE_FAILED`                                                                         | The record is `cleanup-failed` with Git's error (or `persisted: false`): report partial cleanup.                                                 |
| item `UNSAFE_TARGET`, `WRITE_FAILED`, `GIT_FAILED`                                           | That item stopped; an in-flight claim or Git timeout is reconciled to `cleanup-failed`. Report the code and the status `worktree inspect` shows. |
| item `SANDBOX_DENIED`                                                                        | Nothing touched: rerun once with sandbox escalation, listing only the denied `recordIds`; otherwise report.                                      |
| item `DEADLINE_REACHED`, `INTERRUPTED`                                                       | Not started (also when under 15 s of the deadline remain; a record may already be `cleanup-ready`) or reconciled to `cleanup-failed`: report.    |
| harness denial, auto-mode refusal, another exit, an unparsable envelope or an `error`        | Nothing beyond the reported items changed: report the call.                                                                                      |

**Denial fallback.** After `worktree remove` returns any item that is not `ok` (`BRANCH_RETAINED`
aside) or fails as a whole call, and after the one `SANDBOX_DENIED` rerun, call `worktree
transition` `active` → `cleanup-ready` with `"reason":null` for every listed record not reported
removed (`STATUS_MISMATCH` means it already left `active`), because `effective-flow cleanup` collects only
`cleanup-ready` and `cleanup-failed`; report each retained worktree for `effective-flow cleanup`.

A final report names every retained worktree and every `BRANCH_RETAINED` branch, because no record
points at that branch any more.

## Base-branch resolution

`delivery.baseBranch` has exactly one resolution rule, and this is it; every later step uses the
results recorded here instead of restating the rule or re-deriving anything from the configured
value. The helper executes the rule: run
`node <skill-root>/scripts/effective-flow-mechanics.mjs <operation>` with exactly one JSON object on
standard input, `cwd` the verified absolute repository root. **Fail closed:** a nonzero exit, an
envelope that does not parse, or `ok: false` stops the run, naming the error code; never replay the
rule by hand.

1. Run `base-branch-resolve` with `cwd` and `configured`: the configured value as written, or
   `null` when the key is absent, from which the helper derives `origin/` plus the branch
   `origin/HEAD` names, else `origin/main`. By `data.outcome`:
   - `fetch-required`: the part before the value's first `/` is a remote that `git remote` lists
     (the remote-configured arm); continue with step 2.
   - `resolved`: the value resolved as a local ref as it stands (the remote-not-configured arm).
   - `resolved-substituted`: the same arm, where only the local branch part after the first `/`
     resolved (`main` for `origin/main`); report that substitution once.
   - `unresolvable`: neither the remote ref nor any local candidate resolves; abort, naming the
     value. Never invent or create a base branch.
2. Remote-configured arm only: run `base-branch-fetch` with `cwd`, `remote` and `branch` from step
   1, and `deliberateDivergence`: `true` only where the project setup ADR carries, in prose outside
   its configuration table, a sentence calling the divergence between `delivery.baseBranch` and the
   repository default deliberate and permanent, otherwise `false`. By `data.outcome`:
   - `resolved`: delivery starts from the current remote state. A non-`null` `data.divergence`
     means `origin/HEAD` names another branch, `data.divergence.originHead`: name both facts once,
     neither as authoritative — the clone-time cache may be the stale side — and offer
     `git remote set-head origin -a`. This adds no gate: the configured value wins.
   - `fetch-failed` (with `data.error`), `tracking-stale` or `unresolvable`: report and stop. Never
     fall back to a local branch here: a stale one would start delivery from the wrong commit.
   - `fetch-denied`: the sandbox refused the network or a `.git` write. Where the harness can rerun
     a command with escalated sandbox permissions (Codex), rerun this call once that way; otherwise,
     or when it is refused again, stop as for `fetch-failed`.

### Recorded results

The arm that ran records two named results. They are the only base-branch values later steps use,
and no step recomputes either one from the configured value.

- **Resolved base ref** (`data.baseRef`) — what a delivery branch is created from, and what a
  commit range is computed against.
- **Resolved local base branch** (`data.localBranch`) — the local branch every merge target,
  switch-back target and pull-request target uses.

The pair identifies its own arm, so a consuming step reads the arm off the two results, never off
which arm it watched run (a delegated run handed both ran none). The remote-configured arm's results
always **differ**, because its resolved base ref carries the remote name in front of the branch; the
remote-not-configured arm's are always **equal**, because it records one candidate as both. So equal
results are the remote-not-configured arm, and there is no arm name any caller passes alongside the
pair. The aborting arm records nothing, and no consuming step runs.

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

- `delivery.baseBranch`: derived from `origin/HEAD`, else `"origin/main"`
- `delivery.branchPrefix`: `"effective-flow"` (in hidden mode empty, and never a value containing
  `effective-flow`; the configuration building block forces it)
- `delivery.completion`: `"merge"` (merge into the target branch as the default completion)
- `delivery.returnBranch`: `"auto"` (the resolved local base branch)
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
present in a legacy config is ignored on read.

### Config migration

Reading the Effective Flow configuration from the project setup ADR is handled by the shared
fragment "Config migration" (`config-migration.md`); this fragment performs **no** own per-block
migration. `worktree.baseBranch`, `worktree.branchPrefix` and `worktree.completion` are retired rows
of that table and are never read: a run stops or reports under its retired-key rule, and
effective-flow setup rewrites them in place to their `delivery.*` successors.

### Determine mode (setup phase): Delivery is implied by worktree/branch

At the start of the actual implementation work, determine the effective mode:

- Before delivery setup, classify completion intent from the current invocation. Only an
  unambiguous affirmative directive to perform exactly one of `pr`, `merge`, or `branch` in this
  run is explicit intent. A negated, hypothetical, descriptive, or merely mentioned action is not
  override evidence. Alternatives such as "create a PR or keep a branch" and simultaneous requests
  for more than one action are ambiguous: interact for one affirmative action and abort before any
  mutation if unresolved.
- Record the explicit action and its evidence separately from configuration. When one exists, it is
  the effective completion even when it differs from `delivery.completion`; do not modify the
  configured value. The completion report names both the configured value and applied override.
  With no qualifying directive, retain the configured value, or its documented default when unset.
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
  (in-place without delivery). Plan archival still applies in that mode: it is owned by
  `plan-archival`, which the workflow loads through its own pointer rather than from here.

### Shared preconditions

When delivery or worktree is active:

1. `git` and, for worktree execution, `git worktree` must be available. The current execution
   receipt must pass the fail-closed preflight before continuing.
2. **Resolve `delivery.baseBranch` under "Base-branch resolution".** That rule is the single
   place the value is classified and resolved. Record its two results — the resolved base ref and
   the resolved local base branch — into the run state below. Every later step of this fragment
   names one of those two results; none of them re-derives either from the configured value, and
   none of them repeats the rule's remote probe or its refresh.
3. If the current HEAD has relevant uncommitted changes or local commits that
   are not contained in the resolved base ref, point that out. A delivery branch freshly
   created from the base branch does not contain this work. Only continue
   if the user confirms the chosen mode or the workflow creates a safe
   partial-diff PR by the procedure described below.
4. Name the delivery branch with the helper's `delivery-branch-name` (call and fail-closed rule as
   under "Base-branch resolution"): `cwd`, `branchPrefix` (`delivery.branchPrefix`), `skill` (this
   workflow), `text` (the plan title, task description, issue or finding), `visibility`,
   `excludeNames: []`. Names read `<delivery.branchPrefix>/<skill>/<slug>`; an empty prefix, the
   hidden-mode default and valid in every mode, drops the prefix segment and its slash: `<skill>/<slug>`.
   `named`: use `data.branch`, reported when `data.suffix` is not `null`; when `data.sanitized`, report
   `data.originalSlug` and `data.slug` in one line. `prefix-discloses`: stop, naming `delivery.branchPrefix` and effective-flow setup.

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
- the resolved base ref and the resolved local base branch from "Base-branch resolution",
- delivery branch name and exact creation OID,
- whether this run created the delivery branch,
- whether this run created the delivery worktree,
- the delivery execution-location receipt,
- for an Effective Flow-created worktree, its lifecycle record ID.

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
2. Otherwise `REPO_NAME` is the basename of the verified `RUNTIME_STATE_ROOT`, never of a linked or
   harness checkout; use `worktree.baseDir` (default `.effective-flow/.worktrees`) as the base dir. Worktree path:
   `BASE_DIR/REPO_NAME/SESSION_ID`. Resolve a relative `BASE_DIR` against
   `RUNTIME_STATE_ROOT`, never against a disposable worktree. When that path is below
   `.effective-flow/`, resolve every missing base or parent directory that will be created.
   From `RUNTIME_STATE_ROOT`, apply the owning workflow's loaded “Runtime-state write safety”
   contract to each exact directory path immediately before its `mkdir`; a guard for the
   eventual worktree path does not authorize creating its parents. Apply the contract again to
   the exact `WORKTREE_PATH` immediately before `git worktree add`.
   Create the worktree and delivery branch with
   `git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> <BASE_REF>`, where `<BASE_REF>` is the
   recorded resolved base ref, then immediately issue and verify an `effective-flow-created`
   receipt for the exact path, branch, workflow and delivery purpose. Record both artifacts as
   current-run-owned and capture the branch's exact creation OID. Immediately after that receipt
   succeeds, and before setup or delegation, write its lifecycle record (purpose `delivery`, branch
   policy `retain`) with `worktree record-init`. If the receipt or the record fails, retain the
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

For a current-run-owned `effective-flow-created` delivery or partial-diff worktree, the record
stays `active` while the checkout can still change. At every terminal boundary before readiness,
call `worktree transition` once: a controlled stop goes to `aborted` with the concrete reason, an
implementation, validation, integration, ownership, or state error to `failed` with the exact
reason; both retain worktree and branch. Only after the intended changes are durably committed to
the delivery branch does the withdrawal of "Handback and completion action" step 4 run. A
transition that is not `ok` retains both artifacts and is reported with the record ID and code. A
sudden interruption leaves `active`.

### In-place delivery without worktree

When delivery is active and worktree execution stays off:

1. Keep and verify the current checkout's `in-place` receipt, and remember the originally
   checked-out branch.
2. Ensure the working tree contains no uncommitted changes that
   should not become part of the delivery branch. If such changes exist,
   do not silently stage, stash or overwrite them; either obtain a user decision
   or use the partial-diff PR via worktree.
3. Create and check out the delivery branch from the recorded resolved base ref.
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
2. `delivery.baseBranch` resolves under the "Base-branch resolution" rule.
3. The workflow knows the exact repository-relative files and final states that belong to its own
   output. A standalone local-change selection uses `effective-flow deliver`; implementation handback
   uses only the workflow's recorded output set plus any explicitly confirmed additions.

The procedure:

1. Resolve `delivery.baseBranch` by that same rule. Create a fresh worktree branch from the
   recorded resolved base ref at that exact OID, then immediately issue and verify
   a separate `effective-flow-created` receipt whose purpose is `partial-diff`. Before setup or
   file transfer, write its lifecycle record (branch policy `retain`) with `worktree record-init`;
   a failure retains both worktree and branch and aborts the partial-diff flow.
2. Take only the selected delivery states from the source checkout into the worktree. Permitted
   evidence is plan affected-file scope reconciled with actual output, review finding scope, issue
   scope, files recorded as produced by the workflow, or explicit user confirmation. Preserve
   additions, modifications, modes, deletions, and both rename endpoints; never use a whole-tree
   copy or infer ownership from recency.
3. Run setup only under the new receipt's setup ownership, then require its tracked tree and index
   to be clean before transfer. In the verified execution root, compare the exact transferred
   changed-path/state set with the selected output and require a meaningful diff against the base.
   Any extra, missing, or mismatched path aborts; an empty diff creates no commit or PR.
4. Stage only the explicitly known residual output and delegate the actual commit to
   `effective-flow commit` with the full verified receipt, expected branch and staged-tree OID plus the
   literal line `Next steps: suppressed`. Verify the returned commit OID, parent, branch, tree and
   residual state before continuing. Never describe locally reproduced commit behavior as a commit
   delegation.
5. Run `effective-flow pr` only for effective `pr` completion and only with the exact verified committed
   head handoff described below.
6. Withdraw the worktree as in "Handback and completion action" step 4. Leave the delivery branch
   locally and the main checkout unchanged. Non-selected changes in the main checkout remain
   untouched.

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
- **Hidden mode exception:** with `visibility: hidden` the plan is not committed either. It lives
  only below the forced `plan.dir` in the main repo, workers read it there by its absolute path
  under `RUNTIME_STATE_ROOT`, and the delivery branch carries no path below `.effective-flow/`.

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
   receipt is `effective-flow-created`, and the matching lifecycle record is still `active`, call
   `worktree transition` to `aborted` with the concrete pre-implementation stop reason. Retain the
   worktree and branch for inspection; an aborted worktree is never a cleanup candidate. A
   transition that is not `ok` retains both artifacts and is reported. Do not remove the worktree merely because `HEAD` and the branch tip
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
   is merged). The contract for that — which state the plan is in, what that state's action is,
   where every operation runs, and how the main-checkout copy is cleaned up — is owned by
   `plan-archival`, which every workflow that keeps a plan file loads through its own deferred
   pointer. Hand it the inputs it declares: `EXECUTION_ROOT` and `RUNTIME_STATE_ROOT` from this
   run's verified receipt, `plan.dir`, the plan file's repository-relative path, the plan's complete
   language, the delivery shape, whether hidden mode (`visibility: hidden`) is active, and — only when this run recorded one — the delivery branch's
   creation OID. Marking and move are **committed along with it** by step 2 and are thereby part of the
   PR/merge (implementation documentation). The `.effective-flow/` artifacts stay in the main repo.
   If the workflow kept no plan file, this step does not apply. **Hidden mode**
   (`visibility: hidden`) is the exception: `plan-archival`'s hidden arm marks and moves the plan in the main
   checkout only, takes nothing into `EXECUTION_ROOT`, stages nothing, and contributes no plan state
   to step 2.
2. **Ensure committed handoff:** Preserve every verified commit already created by the implementing
   workflow, such as `effective-flow maintain`'s per-group commits. Verify that each expected commit is
   still reachable in order from the exact delivery branch and never amend, squash, reorder, or
   replace it. Then inventory only the uncommitted residual output: known code, test and
   documentation deliverables plus the plan state from step 1. An unselected changed path blocks
   handback rather than being swept into the commit.
   - When residual output exists, stage exclusively its literal known paths, reconcile the complete
     staged set, and record the exact staged-tree OID and pre-commit `HEAD`. Delegate the actual
     commit to `effective-flow commit` with the full verified execution-location receipt, expected branch,
     declared residual paths and expected tree, plus the literal line `Next steps: suppressed`.
     Resolve `language.git` for the human-readable description and keep Conventional Commit types
     stable. Require the returned commit to be a new child of the expected `HEAD` on the exact
     branch with the expected tree and no unaccounted residual state before advancing the receipt.
   - When no residual output exists but verified earlier commits do, continue without creating an
     empty commit.
   - When neither residual output nor a verified commit range exists, inform the user, safely remove
     only an automatically created empty delivery branch/worktree under its ownership contract, and
     end without PR or merge.
3. **Determine completion action:** Use the unambiguous affirmative current-run action recorded
   during setup first. If it overrides a valid `delivery.completion`, report both the configured
   value and the applied explicit action. If no qualifying explicit action exists and
   `delivery.completion` has a valid value, use it and briefly report that the action came from the
   Effective Flow configuration (project setup ADR). Otherwise ask:

If Delivery was active and no valid value for `delivery.completion` is set: Ask the user: **How should the delivery branch be completed?**
- Pull request -- Push the branch and create a PR against the base branch via pr
- Merge -- Merge the branch locally into the base branch, without a PR
- Branch only -- Leave the branch in the local repo, no further action

4. **Withdraw an Effective Flow-owned worktree:** Only when the receipt is
   `effective-flow-created` and the intended changes are durably committed on its delivery
   branch, call `worktree remove` once, with `cwd` and `executionRoot` = `RUNTIME_STATE_ROOT` in the literal
   shape, with the record ID of every
   worktree this step withdraws (an `active` record passes `cleanup-ready` inside the call). Handle each item by the
   lifecycle outcome table, with its denial fallback. The `retain`
   branch policy leaves the delivery branch in the local repository. For `in-place` and
   `harness-managed` receipts, perform no worktree cleanup and create no lifecycle state; leave
   handling to the user or harness. The verified `RUNTIME_STATE_ROOT` is never a cleanup target,
   and local review state there remains intact.
5. **Execute action:** Run this step and every Git, remote-helper and provider-CLI operation it
   performs in `RUNTIME_STATE_ROOT`, per "Rooted operations". Step 4 may already have removed the
   Effective Flow-owned worktree, so an inherited execution directory can be a deleted path; the
   delivery branch and its commits are repository-wide and need no worktree. Never fall back to
   `EXECUTION_ROOT` for this step.
   - `branch` / Branch only: leave the branch, report the name and a note about later
     PR creation.
   - `merge`: the target is the recorded resolved local base branch or the
     explicit `delivery.returnBranch`. Ensure that the target working tree
     is clean; otherwise inform instead of merging. If the local target branch is
     behind its remote-tracking ref, point that out. Merge the delivery branch –
     prefer fast-forward, otherwise a merge commit; on conflict stop, leave the branch
     and inform the user, no automatic conflict resolution.
   - `pr`: resolve and record the final delivery-branch head OID after every intended commit and
     require a non-empty verified commit range against the recorded resolved base ref. Delegate to
     `effective-flow pr` and pass the exact delivery branch, base branch, verified final head OID,
     successful commit-only handoff evidence, the verified `RUNTIME_STATE_ROOT` as its execution
     root, and the workflow/change type
     (`feat`/`fix`/`refactor`/`docs`/`chore` depending on the implementing workflow and effect) as
     a title-type hint, so the PR title carries a valid Conventional Commit type — with a squash
     merge it is the release signal — and the literal line `Next steps: suppressed` on its own
     line, because `effective-flow pr` returns its result here and the implementing workflow is the one
     that closes this run. Hand the base over typed rather than as one bare value: pass **both**
     recorded results, the resolved base ref and the resolved local base branch, each named as
     such, so the delegated run recomputes neither and needs no arm name beside them —
     "Base-branch resolution" states how a pair identifies the arm that produced it. Freshness is
     the one thing that pair cannot carry: the resolved base ref is a mutable remote-tracking
     name, and this handoff can reach `effective-flow pr` long after the resolution that recorded it,
     so an `origin` that moved in between would leave the delegated empty-range check and the
     derived title and description reading a base the pull request no longer has. The delegated
     run therefore brings that ref up to date through "Base-branch resolution" itself, immediately
     before it inspects the range; that refresh is not a second resolution and recomputes neither
     result.
     Once `effective-flow pr` returned the pull request, run "PR review publication" with that pull
     request, whether this run is gated or a non-interactive delegation, and either the workflow's
     residual finding set or its explicit declaration that it has none. It uses the same verified
     `RUNTIME_STATE_ROOT`. This stays inside step 5 deliberately: step 4 has already withdrawn an
     Effective Flow-owned worktree and step 6 restores the checkout to the base branch, so a review
     running after them would have no execution root and would read base-branch content.

**Load on demand:** Read `shared/pr-review-integration.md`, when the completion action created or reused a pull request and the automatic PR review may run.

Retain the verified source plan/issue association, any established archive move, complete planning
basis already read and actual completion outcome (branch retained, PR opened, or merged) across
cleanup and returning delegations as ordinary context, without a new envelope field. The final
emitter uses these in the shared `next-steps` selection even after automatic merge; never rebuild a
source path from a removed execution worktree. Suppressed delegations still emit no block.

6. **Restore checkout:** For in-place delivery that switched the current checkout, after
   successful PR creation or with `branch`, switch back to `delivery.returnBranch` or, with
   `auto`, to the recorded resolved local base branch, provided the working tree is clean.
   Do not switch a reused harness-managed checkout. If an applicable switch-back fails,
   explicitly report the actual branch as a side effect.

### Build user pause

A validated `build-run-contract` `BLOCKED-USER` is a pause inside the same logical workflow. Keep its owned record `active`, pinned to that build-run ID, including a dirty worktree without a plan PR; release every lock before yielding. Run terminal handback/exit handling only at actual DONE, ABORT or failure. Same-agent continuation revalidates the run association, ownership, execution receipt and index/worktree/untracked snapshot before any write. This exception cannot adopt a failed/aborted or foreign worktree.

Returning commit, PR and review handoffs retain the implementing workflow's overview. Apply `shared/subagent-progress.md` for eligible cross-agent relays with each hop's own context; same-session calls integrate directly. Delivery/cleanup receipts, approval gates and terminal joins remain authoritative.
