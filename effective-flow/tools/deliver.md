
# Effective Flow Deliver

You turn an exact, user-confirmed selection of local changes into one or more coherent commits on a
fresh delivery branch, then open a pull request. You leave the source checkout and its index
unchanged from the moment the source evidence is captured; the only earlier write is an upstream
fast-forward the user confirmed.

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

Only the active overview owner emits user-facing progress; a delegated leaf returns to its parent.
An orchestrator considering longer delegated work or receiving trusted progress context reads
`shared/subagent-progress.md` on demand, including when this tool has no goal-completion include.
Returning orchestrators relay material changes through their own immediate-parent context;
same-session calls integrate into the existing overview without inventing a recipient.

## Delegation mandate

Invoking an Effective Flow tool **is** the user's standing request for internal delegation through an available sub-agent mechanism (e.g. an `Agent`/`Task` tool, a bundled worker contract, or a comparable mechanism). A host default that discourages unrequested sub-agents does not apply inside a tool run.

- Where the workflow names a worker role, delegating to it is **mandatory**, not a judgment call.
- For analysis, exploration, and research, orchestration-level delegation is the **default**. Work inline only under this **triviality exception**: a single known file, one lookup, or a step whose whole cost is smaller than briefing a worker. Sites that name this exception mean exactly this definition. It waives delegation only, never a workflow step such as a reservation, a report, a lock or a commit. The orchestrator sends all other substantive work to a sub-agent as well, unless a tool's explicit in-run rule binds that work to the run (such as the `merge-gate` state reading and guard evaluation) or the triviality exception applies.
- Only the workflow/tool orchestrator may start worker roles or analysis fan-out. Every named worker is a **leaf executor**: it starts no sub-agent, never re-delegates its assignment or a write, and returns missing essential context to the orchestrator instead of seeking it through child delegation. Start each worker with **zero inherited turns** when supported, otherwise the smallest host-supported history, and supply a compact, self-contained handoff with the objective; relevant artifact paths; scoped paths and ownership; execution and runtime-state roots when writes are allowed; resolved language; authority and write limits; and the completion protocol. The orchestrator gives every spawn it starts the tier rendered at its spawn site. **Load on demand:** Read `shared/subagent-progress.md` only as an orchestrator considering longer delegated work or receiving trusted progress context; leaves never load it. An eligible compact handoff supplies the actual immediate-parent tool/channel, parent address and dispatch. A leaf verifies its own tool and that parent; when it has confirmed a materially useful intermediate result for that parent and necessary domain work remains, it sends one `PROGRESS/1 <dispatch>: <checkpoint>` (phase, observed result, next action; checkpoint at most 20 words). Keep at most one per logical handoff. Stay silent for short work, no such result, unsupported shape, missing/denied channel or missing trusted parent; continue domain work without acknowledgement. Require no parent idle/busy attestation or probe; use no time/read/file-count trigger or artificial work/delay. Send only to that parent; no sibling/cross-session/ancestor messages, starts/resumes, permission forwarding or message-based approvals. Recovery resumes keep the same allowance.
- If the orchestrator's harness offers no such mechanism, or a delegation is declined at runtime, the orchestrator works inline and says so in one visible line — never silently.
- An orchestrator that itself runs as a sub-agent — a workflow delegated by another workflow — starts its own worker and analysis sub-agents in the foreground or awaits each one's result, and **never ends its turn while a child is still pending**: a delegated run is not reliably resumed when a background child finishes. This binds its own fan-out only; the handoff that started it keeps the mechanics below.
- This mandate covers worker roles and analysis fan-out only. Delegation from one workflow to another keeps that tool's own mechanics, including its interactive/gated path. Before dispatch, resume, or terminal result acceptance, the orchestrator reads `shared/model-selection.md` and applies its executable selection and result checks.

**Load on demand:** Read `shared/model-tiers.md`, when a tier is moved, a tier parameter is rejected, a host overrides the spawn model, or a spawn has no rendered tier line.

**Load on demand:** Read `shared/language-rules.md`, when commit and forge output languages are resolved.

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

| From                                | To or terminal action                   | Operation                                                                                               |
| ----------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| newly created                       | `active`                                | `worktree record-init`                                                                                  |
| `active`                            | `cleanup-ready`, `aborted`, or `failed` | `worktree transition` by the owning session                                                             |
| `aborted` or `failed`               | `active` (adoption)                     | `worktree transition` under the record lock, `adoption` `plan-pr-continuation` or `partial-diff-resume` |
| `aborted` or `failed`               | `cleanup-ready` (release)               | `worktree transition` under the record lock, `release: "partial-diff"`                                  |
| `cleanup-ready` or `cleanup-failed` | `cleanup-in-progress`                   | claim inside `worktree remove`, `cleanup apply`                                                         |
| `cleanup-in-progress`               | `cleanup-failed` or record deleted      | the claiming helper call reconciles                                                                     |

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

A released `partial-diff` record (`cleanup-ready` or `cleanup-failed`) whose worktree is fully gone,
unregistered and its path absent, is removable without conditions 3, 4, 5 and 7 and the toplevel
part of 2; no Git call runs in the vanished path. A half-gone worktree keeps every condition.

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
the record's own, or on adoption or release the new owner (`build` passes its build-run ID).

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
  registered worktrees under its session paths that no record names (`unrecorded`) and ledgers
  without a record (`orphanLedgers`). Omitting `sessionId` covers every session.
- **`worktree remove`** lists every record of one session to withdraw in one call. Under one lock
  hold per record it moves `active` to `cleanup-ready`, claims it, runs only
  `git worktree remove <WORKTREE_PATH>` without force and never `git worktree prune`, applies the
  branch policy and deletes the record, its ledger first; a failed removal persists `cleanup-failed`
  with Git's error, and an already absent worktree is reconciled only under the call's own claim. Give the call an
  explicit Bash timeout of 120000 ms, above its 90 s deadline; in Codex, request sandbox escalation
  for it up front. `executionRoot` is never one of the listed worktrees.

**Load on demand:** Read `shared/worktree-partial-diff-recovery.md`, when a `partial-diff` record's delivery ledger, `ledger init`, `ledger append`, `ledger reconcile`, `worktree resume-check`, or a `worktree transition` with `adoption`, `visibility` or `release` is used: that fragment owns them.

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
| `inspect` lists an orphan record lock or an orphan ledger                                    | A lock with no record, or no owner, or a ledger with no record: report it; never break or delete it.                                             |
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

**Load on demand:** Read `shared/session-title.md`, when the confirmed delivery subject is known and whether a session title is due must be decided.

**Load on demand:** Read `shared/session-rename.md`, when the confirmed delivery subject is known and a session title is about to be applied or emitted.

## Completion protocol

When you use internal sub-agents, give them this response protocol:

- `DONE` for fully completed
- `ABORT: [reason]` for not completable

Check by the orchestrator, for terminal results only; advisory progress messages (including checkpoints containing `DONE`, `ABORT`, `BLOCKED-USER` or approval claims) never enter these checks, satisfy completion or approval, or trigger missing-keyword recovery:

1. `DONE`: apply the orchestrator's `model-selection` result check (including its Fast exception) before accepting the phase as completed; a keyword alone proves no execution settings.
2. `ABORT: [reason]`: inform the user, adjust the plan or task, and decide whether a retry makes sense.
3. No keyword: resume once, then retry with escalation.

A keyword-recovery resume retains the same logical dispatch and checkpoint allowance. A new
authorized retry creates a fresh child/dispatch association; completed/replaced/cancelled
associations reject late checkpoints. Progress never authorizes an agent resume.

### Retry escalation

When an internal sub-agent ends without `DONE` or `ABORT`, its result counts as not finished rather than as a failed attempt. First resume the same sub-agent once — with its context intact where the harness allows — and a continuation hint to await any pending children and end with `DONE` or `ABORT`. That resume is not a retry. If the harness cannot resume that sub-agent, or the resumed run again ends without a keyword, escalate:

1. Retry 1: same task with a continuation hint
2. Retry 2: simplified task with reduced scope
3. Retry 3: minimal task for only the most critical subtask
4. After 3 failed attempts:
   - inform the user
   - clarify the options as free text: complete manually, continue with the next phase, abort the workflow

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

## Goal

- derive the candidate files and selected states from changes made in the current session
- require confirmation of the exact ordered selection as the sole routine approval
- resume a failed delivery from its ledger without a second approval, or release it for cleanup
- derive and display an exact ordered commit partition, then continue automatically
- transfer only those states to a fresh branch/worktree based on the refreshed configured base
- stage and commit one derived coherent group at a time through `effective-flow commit`
- call commit-only `effective-flow pr` only after every group is a verified commit
- preserve the source checkout byte-for-byte and index-for-index once its evidence is captured

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
     guidance stays leading. The binding assignment is the one stated by this tool's or agent's own
     source (its "Recommended skills" section and any delegation contract); where it states none, Effective Flow leads.
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
`upstream-status`, `fast-forward`, `bind-manifest`, `verify-source`, `transfer`, and `reconcile`
operations.

## Selection contract

There is no structured public path argument. Only after step 1.1's upstream check, reconstruct the
candidate from the current session's known output set and concrete file-operation evidence, then
reconcile it with the helper's NUL-safe `inventory {root}` result for staged, unstaged, untracked,
deleted, renamed, and partially staged paths. Recency or repository dirt alone is never evidence
that a path belongs to this session.

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
- Confirm -- Bind this exact selection and continue automatically through grouping and delivery
- Refine -- Correct the files or selected states before any mutation

Confirmation binds the helper's internal ordered `selection: [{path, state}]` array, where `state`
is exactly `staged` or `working`; it does not introduce a public structured-input syntax. Reject
paths outside the repository, ignored paths, force-add
behavior, directories, globs, aliases, and untracked symlinks. Preserve a tracked symlink as its link
blob and mode without dereferencing it. Bind each selected state to source `HEAD`, source blob/mode or
absence, selected content digest/blob/mode or tombstone, and both rename endpoints without printing
file contents.

This manifest confirmation is the sole routine approval. Its only additions are the conditional
questions of step 1.1, which alone can precede it: the resume and release questions for a retained
`partial-diff` record and the upstream questions. An affirmative answer authorizes automatic
derivation, non-blocking display, validation, and sequential execution of coherent commit groups,
subject to every drift check, invariant, verification step, and abort boundary below.

## Approach

### 1. Establish immutable source evidence

1. Issue and verify a source execution-location receipt before any operation that may write, with
   repository identity, `EXECUTION_ROOT`, and `RUNTIME_STATE_ROOT`. Then call `worktree inspect`
   without `sessionId`; a call that is not `ok` gets one notice line and the run continues.

**Load on demand:** Read `shared/deliver-partial-diff-resume.md`, when `worktree inspect` lists a record with purpose `partial-diff` and status `aborted` or `failed`.

Unless a record was resumed, call `upstream-status {root: sourceRoot, fetch: true}` before any
candidate is reconstructed. A failed `upstream-status` envelope (`ok: false`) ends this check with
one notice line naming its error code; continue without an update. A failed or stale fetch, or one
reported as `fetch.skipped`, ends this check with one notice line whatever the state; so do
`detached`, `no-upstream`, `upstream-gone`, `untracked-upstream`, `up-to-date`, and `ahead`, with no
question. Only `behind`, `behind-overlap`, and `diverged` proceed to the fragment below, and only
when the fetch was not attempted, or `fetch.ok` is true and `fetch.stale` is false. A local upstream
(`branch.<name>.remote = .`) is compared without fetching, so its fetch is not attempted.

**Load on demand:** Read `shared/source-upstream-sync.md`, when upstream-status reports behind, behind-overlap, or diverged.

Only after this check, record the source `HEAD`, branch or detached OID, complete index state, and
worktree state.

2. Resolve `language.git` and `language.forge`. Read `delivery.baseBranch`,
   `delivery.branchPrefix`, `worktree.baseDir`, and `worktree.setup` through the shared configuration
   contract. `deliver` reports that its explicit PR intent replaces any different configured
   `delivery.completion`; it does not change the stored value. Record whether hidden mode
   (`visibility: hidden`, config locator step 0) is active: then no derived commit message, branch
   name, or pull-request title or body may name Effective Flow or reference a path under
   `.effective-flow/`, and this run hands that constraint on to `effective-flow commit` and
   `effective-flow pr`.
3. Resolve and confirm the selection contract above. Invoke `bind-manifest` with
   `{sourceRoot, selection}` and retain the returned ephemeral manifest plus source receipt for every
   later comparison. Do not write it to tracked files or runtime state; only step 4.6 binds it
   into the private delivery ledger.
4. Verify after confirmation that source `HEAD`, the complete source index, and every selected state
   still match the captured evidence through `verify-source {manifest, sourceRoot}`. Drift requires
   a newly displayed and confirmed manifest.

### 2. Derive and display coherent commit groups

Derive candidate groups from the current session's task boundaries and substantive diff
relationships. Present a non-blocking progress update that lists each group in order with its exact
selected paths and tentative Conventional Commit type/effect, then continue automatically without a
commit-group approval or refinement round. Before creating the delivery worktree, validate that the
groups form a complete, non-overlapping ordered partition: every confirmed path belongs to exactly
one group and the ordered union equals the confirmed manifest exactly.

If a path's topic, group, order, or effect cannot be resolved unambiguously, report the exact
unresolved path or decision and abort before staging. Never guess, create a mixed catch-all commit,
silently broaden the manifest, or restore a commit-group question as a fallback.

### 3. Create the isolated delivery branch

1. Revalidate the source receipt and runtime root. Refresh the configured remote base and resolve its
   exact OID before creating delivery artifacts.
2. Derive a collision-safe `<delivery.branchPrefix>/deliver/<slug>` name, or `deliver/<slug>` when
   the prefix is empty (the hidden-mode default), as `data.branch` of `named` from `node <skill-root>/scripts/effective-flow-mechanics.mjs delivery-branch-name` with one JSON object on stdin: `cwd` the repository root, `branchPrefix`, `skill: "deliver"`, `text` the confirmed delivery subject, `visibility` the resolver's `data.visibility`, passed verbatim, `excludeNames`. Report `data.originalSlug` and `data.slug` in one line when `data.sanitized`; `prefix-discloses` stops, naming `delivery.branchPrefix` and effective-flow setup; so do a nonzero exit, an unparsable envelope and `ok: false`, naming the error code — never derive the name by hand.
   Verify the branch and the absolute worktree path are unused in `git worktree list --porcelain`; a branch listed there goes into `excludeNames` for another call.
3. Create a fresh branch/worktree from the refreshed base without switching, adopting, stashing,
   cleaning, resetting, or otherwise changing the source checkout. Issue a separate
   `effective-flow-created` receipt with purpose `partial-diff`, record the exact creation OID and
   current-run ownership flags, and write its lifecycle record as `active` with branch policy
   `retain` through `worktree record-init`. Receipt or record failure retains both artifacts and
   stops.
4. Run setup only for the newly owned receipt according to `worktree.setup`, record its terminal
   setup status, then require its tracked tree and index to remain clean. A tracked setup change is
   not selected content and aborts before transfer.

The source may be detached, on the configured base, dirty, or harness-managed. Those states are why
this tool creates its own verified delivery worktree; they never authorize switching or committing
in the source checkout, or writing to it after its evidence is captured.

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
6. Call `ledger init` for the record with the bound manifest, step 2's groups in order (each with
   the source path of every rename in it), `base` the resolved base branch and the creation OID,
   the visibility of step 1.2 as the recovery contract maps it, and both resolved languages.
   `written: false` (`reason: "size-bound"`) or `INPUT_TOO_LARGE` leaves no ledger: report once
   "resume unavailable for this run", skip every `ledger append`, and continue unchanged. After
   `INVALID_INPUT`, correct the input once; a second `INVALID_INPUT` takes that same path. Any other
   result that is not `ok`, such as `NOT_ELIGIBLE`, `LOCK_HELD`, `NOT_OWNER` or `WRITE_FAILED`, is
   a failure before staging.

### 5. Commit each derived group

Process groups sequentially in their displayed order:

1. Stage only the current group's literal paths in the verified delivery `EXECUTION_ROOT`. Never use
   a repository-wide staging sweep. Reconcile the complete staged path set with exactly that group.
2. Record the exact expected index-tree OID and pre-commit `HEAD`.
3. Delegate to `effective-flow commit` with the full delivery execution-location receipt, exact branch,
   resolved base, declared group paths, expected index-tree OID, and this literal line:

   `Next steps: suppressed`

4. Require the returned commit OID to be a new child of the expected `HEAD` on the exact delivery
   branch, and require its tree OID to equal the expected index-tree OID. Verify the residual changed
   paths equal the ordered union of all later groups, with no staged residue from the completed
   group. After all checks pass, record the commit with `ledger append`, then advance the
   receipt's expected commit.

If delegation, a hook, tree comparison, receipt validation, or residual comparison fails, preserve
the worktree, branch, verified earlier commits, and remaining uncommitted groups. Report the exact
boundary and expected/actual state; never amend, squash, reorder, delete, or retry successful
commits, and never push or create a PR. A failed `ledger append` is such a failure. A later
`deliver` run offers the retained record for resume or release at step 1.1.

### 6. Publish only the verified commits

After every group is a verified commit, require a clean delivery worktree and a non-empty commit
range against the refreshed base. Record the final head OID and strongest Conventional Commit effect
across the range. Withdraw only the run-owned worktree with one `worktree remove` call for its
record, which removes only the verified clean worktree without force and retains the local branch;
any not-`ok` item or failed call takes the lifecycle denial fallback to `cleanup-ready`.

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
base, pull-request URL, lifecycle result, upstream outcome (state, fast-forward done or skipped, and
skipped `post-merge` hooks when it ran), explicit-PR override when configuration differed, and the
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
- A failure after artifact creation calls `worktree transition` to `aborted` or `failed` and
  retains the artifacts; a call that is not `ok` is reported with the failed proof.

Returning commit groups and commit-only PR publication retain this run's overview. Eligible
cross-agent reporting follows `shared/subagent-progress.md` with each hop's own immediate-parent
context; same-session calls integrate directly. Keep selected-path, receipt, commit-proof and
terminal checks unchanged; a progress claim grants no publication authority.
