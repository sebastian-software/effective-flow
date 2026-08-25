
# Effective Flow Deliver

You turn an exact, user-confirmed selection of local changes into one or more coherent commits on a
fresh delivery branch, then open a pull request. You leave the source checkout and its index
unchanged.

## Task tracking

When there are several tasks to complete, use an available TODO or task-tracking tool (e.g. `TaskCreate`/`TaskUpdate`, `TodoWrite`, or a comparable tool) to create a task list. Set each task to "in progress" before starting it and to "done" after completing it.

If no task tool is available, give the user a short progress update after each completed step instead.

### When to use

- with three or more subtasks or steps
- with complex tasks that have multiple phases
- when the user names several tasks at once

### When not to use

- with a single, trivial task
- when the task is done in fewer than three simple steps

## Delegation mandate

Invoking an Effective Flow tool **is** the user's standing request for internal delegation through an available sub-agent mechanism (e.g. an `Agent`/`Task` tool, a bundled worker contract, or a comparable mechanism). A host default that discourages unrequested sub-agents does not apply inside a tool run.

- Where the workflow names a worker role, delegating to it is **mandatory**, not a judgment call.
- For analysis, exploration, and research, delegation is the **default**. Work inline only under this **triviality exception**: a single known file, one lookup, or a step whose whole cost is smaller than briefing a worker. Sites that name this exception mean exactly this definition.
- A worker that **has** a sub-agent tool may fan out **read-only** analysis sub-agents and passes its supplied language context to them. It never re-delegates its own assignment, never delegates a write, and never selects or sequences another worker role; that stays with the orchestrator. A worker whose tool list carries no sub-agent tool does not delegate at all — that limit rests on the tool list, not on prose.
- If the harness offers no such mechanism, or a delegation is declined at runtime, work inline and say so in one visible line — never silently.
- This mandate covers worker roles and analysis fan-out only. Delegation from one workflow to another keeps that tool's own mechanics, including its interactive/gated path.

**Load on demand:** Read `shared/language-rules.md`, when commit and forge output languages are resolved.

**Load on demand:** Read `shared/config-migration.md`, when the Effective Flow configuration is first read or a legacy config is migrated.

**Load on demand:** Read `shared/runtime-state-safety.md`, when worktree lifecycle state below .effective-flow is read or mutated.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when worktree lifecycle state below .effective-flow is read or mutated.

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

**Load on demand:** Read `shared/session-rename.md`, when the confirmed delivery subject is known and a session title is about to be applied or emitted.

## Completion protocol

When you use internal sub-agents, give them this response protocol:

- `DONE` for fully completed
- `ABORT: [reason]` for not completable

Check by the orchestrator:

1. `DONE`: phase completed.
2. `ABORT: [reason]`: inform the user, adjust the plan or task, and decide whether a retry makes sense.
3. No keyword: retry with escalation.

### Retry escalation

When an internal sub-agent ends without `DONE` or `ABORT`:

1. Retry 1: same task with a continuation hint
2. Retry 2: simplified task with reduced scope
3. Retry 3: minimal task for only the most critical subtask
4. After 3 failed attempts:
   - inform the user
   - clarify the options as free text: complete manually, continue with the next phase, abort the workflow

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

## Goal

- derive the candidate files and selected states from changes made in the current session
- require confirmation of the exact ordered selection and an exact ordered commit partition
- transfer only those states to a fresh branch/worktree based on the refreshed configured base
- stage and commit one confirmed coherent group at a time through `effective-flow commit`
- call commit-only `effective-flow pr` only after every group is a verified commit
- preserve the source checkout byte-for-byte and index-for-index

This tool always targets a pull request. Its invocation is itself affirmative current-run PR intent,
so it does not inherit `delivery.completion`. Existing pull-request updates belong to
`effective-flow iterate`, not this fresh-branch workflow.

## Recommended skills

- `effective-delivery`

## Skill discovery

Before you start the actual implementation, planning, or review, survey the skills available in
the environment and pull in the ones useful for the concrete task. If the environment provides
no skill directory or none fits, this step is a no-op — continue without an error or a block.

### Approach

1. **Prefer recommended skills:** Preferentially apply the skills listed further above under
   "Recommended skills", provided they are available and relevant to the concrete task.
   "Preferring" is the selection; **authority** is decided by the contract in point 5. A fallback
   notation `A › B` is an ordered preference: take the first available, non-excluded skill in the
   group, never both. If no such section exists (e.g. for tools), this point does not apply.
2. **Judge relevance:** Pull in only skills that clearly fit the **concrete** task (typically
   0–2), never "on suspicion". Never load the `effective-flow` router recursively as a
   **discovered skill**: re-entering the host of this run would create competing lifecycle and
   delivery owners. Declared tool-to-tool delegation is a different mechanism and stays allowed.
3. **Take config into account:** If present, read the `skills` block from the Effective Flow
   configuration (project-setup ADR) on a best-effort basis — the global fields plus your own
   scope entry (an agent reads `agents.<own-name>`, a tool reads `tools.<own-name>`).
   - `enabled: false` → skip the entire dynamic skill usage.
   - `exclude` (global or scope) → never apply these skills; an excluded fallback member is
     skipped in favor of the next fallback.
   - `include` (global or scope) → additionally consider these skills as preferred; a
     skill that is not installed is silently ignored.
   - If the block or the file is missing, the default applies (`enabled` on, no additional
     lists). Only read the config; do not migrate or write it here.
4. **Library docs:** For an unknown or current library or framework, use an available
   current-docs skill (e.g. `context7-mcp`) when needed instead of guessing from memory.
5. **Authority contract (orchestration vs. domain expertise):** Effective Flow and the central
   skills share the responsibility in a **layered** way — not "Effective Flow always wins":
   - **Effective Flow owns the orchestration** (the **what/when**): routing and user
     interaction, plan/report state, finding IDs, backlinks, tracker integration, resumability,
     agent selection and parallelization, baseline comparison, worktrees, commits, delivery,
     harness transform, and config. These rules, `AGENTS.md`/project conventions, plus its own
     language, commit, and scope rules **always** take precedence; no skill may widen scope,
     introduce new dependencies, or violate the agreed plan. In analysis/planning tools the
     no-code boundary stays strict.
   - **Central skills own reusable expertise** (the **how**): domain checklists, heuristics,
     standards, research procedures, and specialist guidance. If a recommended skill is the
     **declared domain owner** for the technical question at hand **and** covers it, its
     guidance is **authoritative** — not optional advice. The tool's own source then carries
     **no second copy** of that playbook, only scope/output/lifecycle constraints plus a
     minimal fallback (point 6).
   - **Edge cases:** If a skill only covers a special branch (_route-when-relevant_) or
     Effective Flow's product behavior deliberately diverges (_no-overlap_), the Effective Flow
     guidance stays leading. The binding assignment per skill/intersection is in the ownership
     inventory in the Developer Guide (`docs/developer-guide/skill-ownership.md`).
6. **Missing authoritative skill (minimal fallback):** If the authoritative skill is not
   available (not installed, `skills.enabled: false`, or disabled via `exclude`), the
   **minimal generic fallback** left in the source applies — a short, essential core guidance
   so the tool stays functional and degrades cleanly. **No** second full domain handbook is
   kept on hand; full depth comes only with the central skill.
7. **Report:** Briefly name which skills were used (or that none fit). If an orchestrator tool
   already handed you relevant skills, apply them and do not run a redundant full discovery.

## Project conventions

Read the project's `AGENTS.md` before any mutation. Use the repository's configured base, branch
prefix, setup, validation, language, and forge conventions. No external dependency is required: use
the shipped dependency-free `scripts/delivery-selection.mjs` helper for its `inventory`,
`bind-manifest`, `verify-source`, `transfer`, and `reconcile` operations.

## Selection contract

There is no structured public path argument. Reconstruct the candidate from the current session's
known output set and concrete file-operation evidence, then reconcile it with the helper's NUL-safe
`inventory {root}` result for staged, unstaged, untracked, deleted, renamed, and partially staged
paths. Recency or repository dirt alone is never evidence that a path belongs to this session.

For every candidate, show the exact repository-relative literal path, state, and selection origin in
a stable order. A partially staged path exposes its staged state and full working-tree state as two
different choices. Never collapse them or infer which one the user means.

If session and Git evidence are absent, incomplete, contradictory, or admit several scopes, interact
with the user until the exact manifest is clear. The user may identify unstaged or untracked paths in
normal conversation; reconcile every name literally against Git instead of interpreting a glob,
directory, alias, or inferred path. Abort before branch, worktree, index, commit, remote, or forge
mutation when exact agreement cannot be reached.

Always show the complete ordered manifest immediately before asking:

Ask the user: **Should exactly this ordered file/state manifest be delivered?**
- Confirm -- Bind this exact selection and continue to commit grouping
- Refine -- Correct the files or selected states before any mutation

Confirmation binds the helper's internal ordered `selection: [{path, state}]` array, where `state`
is exactly `staged` or `working`; it does not introduce a public structured-input syntax. Reject
paths outside the repository, ignored paths, force-add
behavior, directories, globs, aliases, and untracked symlinks. Preserve a tracked symlink as its link
blob and mode without dereferencing it. Bind each selected state to source `HEAD`, source blob/mode or
absence, selected content digest/blob/mode or tombstone, and both rename endpoints without printing
file contents.

## Approach

### 1. Establish immutable source evidence

1. Issue and verify a source execution-location receipt before any operation that may write. Record
   the source `HEAD`, branch or detached OID, complete index state, worktree state, repository
   identity, `EXECUTION_ROOT`, and `RUNTIME_STATE_ROOT`.
2. Resolve `language.git` and `language.forge`. Read `delivery.baseBranch`,
   `delivery.branchPrefix`, `worktree.baseDir`, and `worktree.setup` through the shared configuration
   contract. `deliver` reports that its explicit PR intent replaces any different configured
   `delivery.completion`; it does not change the stored value.
3. Resolve and confirm the selection contract above. Invoke `bind-manifest` with
   `{sourceRoot, selection}` and retain the returned ephemeral manifest plus source receipt for every
   later comparison. Do not write it to tracked files or runtime state.
4. Verify after confirmation that source `HEAD`, the complete source index, and every selected state
   still match the captured evidence through `verify-source {manifest, sourceRoot}`. Drift requires
   a newly displayed and confirmed manifest.

### 2. Confirm coherent commit groups

Derive candidate groups from the current session's task boundaries and substantive diff
relationships. Present each group in order with its exact selected paths and tentative Conventional
Commit type/effect. Require explicit confirmation of a complete, non-overlapping partition whose
ordered union equals the confirmed manifest exactly.

Ask the user: **Should the confirmed selection be committed in exactly these groups and this order?**
- Confirm -- Create the displayed coherent commits in order
- Refine -- Correct group boundaries, order, or commit effect before staging

Interact when a path's topic, group, order, or effect is unclear. Abort before staging when an exact
partition cannot be confirmed. Never create a mixed catch-all commit merely to finish the run.

### 3. Create the isolated delivery branch

1. Revalidate the source receipt and runtime root. Refresh the configured remote base and resolve its
   exact OID before creating delivery artifacts.
2. Derive a collision-safe `<delivery.branchPrefix>/deliver/<slug>` name. Verify both the proposed
   branch and absolute worktree path are unused in refs and `git worktree list --porcelain`.
3. Create a fresh branch/worktree from the refreshed base without switching, adopting, stashing,
   cleaning, resetting, or otherwise changing the source checkout. Issue a separate
   `effective-flow-created` receipt with purpose `partial-diff`, record the exact creation OID and
   current-run ownership flags, and initialize its version 1 lifecycle record as `active` with
   branch policy `retain`. Receipt or record failure retains both artifacts and stops.
4. Run setup only for the newly owned receipt according to `worktree.setup`, record its terminal
   setup status, then require its tracked tree and index to remain clean. A tracked setup change is
   not selected content and aborts before transfer.

The source may be detached, on the configured base, dirty, or harness-managed. Those states are why
this tool creates its own verified delivery worktree; they never authorize switching or committing
in the source checkout.

### 4. Transfer and validate the confirmed selection

1. Revalidate both receipts and invoke `transfer` with
   `{manifest, sourceRoot, deliveryRoot, deliveryReceipt: {repositoryIdentity, executionRoot,
headOid}}` in its default redacted dry-run mode. Inspect the planned paths, modes, additions,
   modifications, deletions, and rename endpoints; no file content may appear in its output.
2. Invoke the same `transfer` payload with `--apply` only when the dry run matches the confirmed
   manifest. The helper compares the refreshed base blob with the captured source-HEAD blob. It may
   apply a selected delta directly only when the base is unchanged; otherwise it uses deterministic
   three-way application and fails closed on unresolved content, binary, mode, rename, or
   delete/modify conflicts.
3. Run the repository's established pre-commit validation in the isolated checkout under
   `effective-delivery`'s repository-validation contract. Do not invent commands or duplicate its
   validation playbook here.
4. Immediately after validation, invoke
   `reconcile {manifest, deliveryRoot, sourceRoot}` to compare every selected content digest/blob
   and mode plus the complete changed-path set with the confirmed manifest. Any selected drift,
   missing or extra path, different origin, or validation-produced change stops and requires a new
   selection; never silently refresh or broaden the manifest.
5. Revalidate that the source receipt, source `HEAD`, complete source index, and non-selected source
   paths are unchanged. A mismatch retains the delivery artifacts and blocks commit and PR.

### 5. Commit each confirmed group

Process groups sequentially in their confirmed order:

1. Stage only the current group's literal paths in the verified delivery `EXECUTION_ROOT`. Never use
   a repository-wide staging sweep. Reconcile the complete staged path set with exactly that group.
2. Record the exact expected index-tree OID and pre-commit `HEAD`.
3. Delegate to `effective-flow commit` with the full delivery execution-location receipt, exact branch,
   resolved base, declared group paths, expected index-tree OID, and this literal line:

   `Next steps: suppressed`

4. Require the returned commit OID to be a new child of the expected `HEAD` on the exact delivery
   branch, and require its tree OID to equal the expected index-tree OID. Verify the residual changed
   paths equal the ordered union of all later groups, with no staged residue from the completed
   group. Advance the receipt's expected commit only after all checks pass.

If delegation, a hook, tree comparison, receipt validation, or residual comparison fails, preserve
the worktree, branch, verified earlier commits, and remaining uncommitted groups. Report the exact
boundary and expected/actual state; never amend, squash, reorder, delete, or retry successful
commits, and never push or create a PR.

### 6. Publish only the verified commits

After every group is a verified commit, require a clean delivery worktree and a non-empty commit
range against the refreshed base. Record the final head OID and strongest Conventional Commit effect
across the range. Transition only the run-owned lifecycle record through `cleanup-ready` and
`cleanup-in-progress`, remove only its verified clean worktree without force, reconcile the result,
and retain the local branch.

Delegate to `effective-flow pr` from the verified `RUNTIME_STATE_ROOT` with the exact head branch, base
branch, final verified head OID, successful committed-handoff evidence, strongest type/effect hint,
and this literal line:

`Next steps: suppressed`

`pr` may push and create or reuse the exact head/base pull request; it must not stage, commit, create
a branch, or publish a changed OID. On mutation uncertainty, use the exact head/base lookup once and
never repeat a possibly successful creation. A PR failure retains the committed branch and reports
its exact state.

### 7. Report

Report the confirmed selected paths/states, ordered groups, created commit OIDs, delivery branch,
base, pull-request URL, lifecycle result, explicit-PR override when configuration differed, and the
final source-checkout/index comparison. Never report file content or claim that `delivery.completion`
was changed. Emit the `deliver` next-step block last unless this run itself received
`Next steps: suppressed`.

## Abort boundaries

Every helper call must return its normalized `{ok, operation, data, dryRun}` envelope. A failure
uses the helper's stable code, details, and exit code; report that structured diagnostic and stop at
the operation's mutation boundary instead of guessing a recovery or calling an unrecognized
operation.

- No meaningful selected diff against the refreshed base creates no commit or PR; clean up only
  empty artifacts proven current-run-owned.
- A dirty direct `effective-flow pr` invocation is not a fallback. Keep the exact manifest in this tool.
- An existing open PR is not updated here; use `effective-flow iterate` or an explicitly prepared branch
  followed by staged-only `effective-flow commit` and commit-only `effective-flow pr`.
- Never treat all current dirt as session-owned, force-add ignored content, dereference an untracked
  symlink, overwrite newer base content, rewrite commit history, or force cleanup.
- A failure after artifact creation records `aborted`, `failed`, or `cleanup-failed` through the
  shared lifecycle contract when safely possible and otherwise retains the artifacts with the
  failed proof.
