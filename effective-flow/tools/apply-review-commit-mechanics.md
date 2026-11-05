
# Effective Flow Apply Review – Commit mechanics

This internal sub-file is loaded by `tools/apply-review.md` as soon as the commit strategy `Individually` or `Individually with worktrees` is fixed in Phase 2. With `No commits` it is not needed.

## Interactive output language

**Resolve `language.chat` once, before this run's first interactive output, and hold it for the
whole run.** It is `de` or `en`; there is no `auto`, and a missing row means **mirror the user's
language**, never inherit `language.project`. Precedence: an explicit in-message request, then a
configured value, then the conversation language, then `language.project`, then `en`. An invalid
value is reported and treated as an absent row — mirror, not a jump to `language.project`.

The sole bootstrap exception is `effective-flow setup` in Profile mode. It resolves an entry language
read-only, asks `Chat` in that language as its first substantive question, and then binds the
selected `de`, `en`, or recognizable mirrored conversation language once for its second question
and the remainder of that setup run. Mirror is pending removal of `language.chat`; English and
German are pending `en`/`de`, and none is persisted before setup's common confirmation. Express,
Guided, and every non-setup tool retain the ordinary resolve-once-before-output rule and never
rebind their chat language during a run.

Scope is every interactive output: free prose, status updates, completion reports, an `ask` block's header,
question, option labels and descriptions, the next-steps heading and each option's description (never its
invocation token), and the session-title label, though a reused artifact title keeps its own. Encoded values
stay verbatim inside translated prose — the description `delivery.prReview = always — post the findings
without asking` is posed in German as `delivery.prReview = always — Ergebnisse ohne Rückfrage posten`.

Delegated output is relayed **verbatim**: this key is not handed down, so worker reports and agent
notices arrive as written and only the orchestrator's framing follows it — a run may be visibly
bilingual. The router catalog, `effective-flow version` and the `pr-review` notice precede any config
read and stay on the conversation language.

**Load on demand:** Read `shared/config-migration.md`, when the project setup ADR must be located to read the configured `language.chat` value.

**Load on demand:** Read `shared/typography-rules.md`, when the resolved chat language is `de`.

**Load on demand:** Read `shared/runtime-state-safety.md`, when the commit lock or a component worktree below `.effective-flow/` is about to be mutated.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when the commit lock or a component worktree below `.effective-flow/` is about to be mutated.

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

#### Git commit mutex for "Individually"

If the commit strategy **Individually** was chosen, a global commit mutex applies to all delegation sub-agents. The mutex protects the entire critical git section, not just the final `git commit`.

Goal: parallel sub-agents may edit files at the same time, but must never perform staging or commit at the same time. This ensures a finding commit contains only changes of that finding.

Mutex convention:

- Lock: the helper's `apply-review-commit` lock at the retained absolute
  `<RUNTIME_STATE_ROOT>/.effective-flow/apply-review-commit.lock` handle. Every concurrent
  delegation for the repository uses this one main-checkout lock, even when its `EXECUTION_ROOT`
  is linked or native. Each step is one call through the absolute helper path handed over by
  `apply-review`, with `cwd` set to `RUNTIME_STATE_ROOT`, in the runtime-state helper call shape above; the helper
  applies the runtime-state guard itself:

  ```text
  node <skill-root>/scripts/effective-flow-state.mjs lock acquire <<< '{"cwd":"<RUNTIME_STATE_ROOT>","lock":"apply-review-commit","owner":{"workflow":"apply-review","runId":"<runId>","purpose":"finding","findingId":"<finding ID>","component":"<component>"}}'
  ```

  A finding commit passes `purpose: "finding"` with its finding ID and component; the Phase 7
  final-validation commit passes `purpose: "final-validation"`. Retain `result.owner.token`.
  Exit 4 is an outcome handled below; any other nonzero exit or `error` envelope ends the finding
  with `ABORT` without touching the index.

**Commit-lock waiting and orphans** (`iterate-commit`, `apply-review-commit`). A unit is one
`iterate` item or one `apply-review` finding; its delegation is the worker the orchestrator
started for it, and an inline unit is its own delegation. For `iterate`, "re-invoke `lock acquire`"
and "the commit critical section" mean the unchanged `commit create` call, whose `LOCK_HELD`
carries the same owner and identity details as `lock acquire`.

- **Ownership check:** immediately before `git commit`, run `lock inspect` and require a `valid`
  owner whose token equals the retained token. Otherwise ownership is lost: do not commit,
  unstage only this unit's own staging, and fail the unit closed. This bullet binds the prose
  sequences only, `apply-review`'s and `iterate`'s `HOOKS_UNTRUSTED` fallback; `commit create`
  performs both steps itself.
- **Bounded worker wait:** on `LOCK_HELD` the worker re-invokes `lock acquire` unchanged. After
  three consecutive `LOCK_HELD` results with an unchanged owner and identity it stops waiting,
  leaves its edits unstaged, and returns the diagnostics (owner, identity, lock path) to the
  orchestrator. A worker cannot know whether another delegation is still active, so it never
  waits beyond that, never asks the user, and never breaks a lock.
- **Sibling rule:** only the orchestrator knows which delegations are active. While the owner
  `runId` equals this run's `runId` and the owning delegation is still active, it re-dispatches
  the waiting unit's commit critical section only after that owning delegation has returned,
  once per returned owner, and never takes the orphan path; a re-dispatch that meets another
  active sibling owner waits for that one's return the same way, so the re-dispatches are bounded
  by the run's delegations. A re-dispatched section keeps the unit's original `delegation` value
  `<runId>/<n>`. Once the orchestrator holds that delegation's result and its lock remains, the lock
  counts as foreign.
- **Foreign owner:** the orchestrator only reports the owner to the user, with no break
  suggestion. Age never counts. An apparent orphan is an owner `missing`, `invalid` or
  `oversized`, or one the user identifies as stale; only then, in a gated run, it runs
  `lock inspect`, obtains explicit user confirmation, and runs `lock break` with the observed
  token, or the identity plus owner digest (`ownerSize` for an `oversized` owner). A relayed or
  non-interactive run fails closed with the diagnostics.
- **`BREAK_MISMATCH`** (`changed-before-removal` included) removed nothing. The orchestrator
  re-reads the lock once with `lock inspect`: a sibling owner falls under the sibling rule, any
  other is reported to the user as foreign. No second break runs without a fresh confirmation.
- **After a confirmed break,** the orchestrator re-dispatches that unit's commit critical section
  once; its edits are still unstaged in the tree.
- **Tombstones:** a `leftoverTombstone` in a release or break result (the lock is free), or a
  `WRITE_FAILED` naming a tombstone path, is reported to the user with that path.

- Release on every commit success, commit abort, and error path with `lock release`
  (`{cwd, lock, token}`). `NOT_HELD` or `NOT_OWNER` is reported as lost ownership, changes
  nothing, and fails the finding closed.

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

1. `REPO_NAME` is the basename of the verified `RUNTIME_STATE_ROOT`, never of a linked checkout.
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
  runtime-state handle. Immediately after the receipt succeeds, and before setup or delegation,
  write the component's lifecycle record (purpose `apply-review`, branch policy
  `delete-after-integration`) with `worktree record-init` and retain its record ID with the
  component receipt. If the receipt or the record fails, retain the new worktree and branch for
  reconciliation and do not delegate.

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
not yet proven integrated. Call `worktree transition` to `failed` when the component
implementation, commit, integration, or validation fails, or to `aborted` when the workflow
deliberately stops that component before integration. Retain the worktree and branch in
both states. An unexpected interruption leaves `active`; never infer an outcome from age.

Integration back into the original branch:

1. Wait for all worktree component final statuses.
2. Process the successful components in the **deterministic component order from Phase 4.2, step 5** (by report position of their first finding). Determine per component the new commits on its branch since `HEAD` of the original branch, in component order.
3. Revalidate the original integration receipt, then integrate the commits back into that
   verified root sequentially with `git -C <ORIGINAL_ROOT> cherry-pick <commit>`.
4. On a cherry-pick conflict: first run the cherry-pick conflict assessment. Resolve low-risk conflicts directly; ask the user only on high-risk or unclear conflicts.
5. After every successful component is integrated and validated, withdraw all of their
   `effective-flow-created` worktrees with one call (Bash timeout 120000 ms; in Codex, request sandbox escalation up front):

   ```text
   node <skill-root>/scripts/effective-flow-state.mjs worktree remove <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<ORIGINAL_ROOT>","sessionId":"<SESSION_ID>","recordIds":["<RECORD_ID>"],"integrationRoot":"<ORIGINAL_ROOT>"}'
   ```

   The call moves each `active` record through `cleanup-ready` and removes its worktree without
   force. `integrationRoot` lets the helper delete a branch `git branch -d <BRANCH_NAME>` refuses
   after the cherry-picks once its exact patch-id proof against `ORIGINAL_ROOT` passes. That in-run
   proof is the only forced branch deletion; prose never runs `git branch -D` or `git worktree prune`.
   Handle each item by the lifecycle outcome table, with its denial fallback; name every
   `BRANCH_RETAINED` branch with its unproven commits in the summary.

6. On a failed component, call `worktree transition` `active` → `failed`, keep the worktree and
   branch, name both paths and the record in the summary, and obtain a user decision only for
   manual reconciliation. On a controlled cancellation, use `aborted` instead. Neither status is
   eligible for automatic cleanup.

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
