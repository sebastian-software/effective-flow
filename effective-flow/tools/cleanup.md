
# Effective Flow Cleanup

You clean up the legacy remnants that Effective Flow's migrations deliberately leave behind and
inspect the Git worktrees linked to the current repository. All migrations are
**non-destructive** and explicitly defer actual deletion to the user (see
`effective-flow-dir-migration.md`: "Effective Flow leaves the cleanup to the user";
`effective-flow setup`: the untracked old `config.json` is "left on disk"). This skill is the
sanctioned, user-driven path for migration finalization and the only later workflow that may
remove a worktree through a verified Effective Flow lifecycle record.

## Goal

- capture all outdated migration artifacts in the current project (discovery)
- when a legacy runtime directory exists and the completion marker is missing, automatically run
  the shared non-destructive runtime-directory migration after the initial inventory
- check them against their new counterpart and determine whether anything still needs to be carried over (carry-over)
- have the user confirm every carry-over candidate and carry over what is confirmed
- then delete the old data **git-aware** and only after explicit confirmation (dry run first)
- never delete before the new counterpart exists and the carry-over is complete or deliberately discarded
- inventory outdated `.gitignore` entries but leave them untouched and route their repair to `effective-flow setup`
- inventory every linked worktree from Git's machine-readable output and match it to verified
  execution-location and lifecycle evidence
- after a separate dry-run and confirmation, remove only independently proven cleanup-ready
  Effective Flow-owned worktrees with ordinary Git operations
- finish every run with an individual retention reason and safe next step for every linked
  worktree other than the main worktree
- do not create a commit and do not create a backup directory
- be idempotent; a true no-op has neither a migration action nor a removable worktree, but still
  prints the mandatory worktree report

## Language resolution

Effective Flow resolves the language of persisted, human-readable content by **target surface**.
The project setup ADR may contain these stable keys; each value is `de` or `en`:

| Key                                | Surface                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `language.project`                 | Fallback for every surface; default `en`                                    |
| `language.source`                  | Comments, test descriptions, and in-code documentation                      |
| `language.documentation.user`      | Root README, marketing entry point, and user documentation                  |
| `language.documentation.technical` | Developer/API documentation, operations documentation, runbooks, and ADRs   |
| `language.workflow`                | Plans, plan reviews, local review reports, and investigation reports        |
| `language.forge`                   | Issues, PR bodies, issue/PR comments, and remote review replies             |
| `language.git`                     | Commit descriptions, Conventional Commit PR titles, changelog/release prose |

Identifiers, public API names, config keys, encoded values, schemas, paths, label names, HTML
markers, finding IDs, action values, Conventional Commit types, and branch slugs are not
localized. Product UI/CLI/error text follows the target project's product-i18n rules and is not
controlled by this configuration. Exact quotations and incoming third-party text are not
translated unless explicitly requested.

### Resolver (the single precedence rule)

For each artifact, determine its target surface first and resolve exactly once:

1. An explicit user language request for that artifact wins.
2. When editing an existing artifact, preserve its clearly recognizable language unless the user
   requests translation. If it is mixed or unclear, clarify before changing human-readable prose.
3. For a new artifact, use the valid surface-specific `language.*` override.
4. Otherwise use a valid `language.project`.
5. Otherwise use `en`.

Only `de` and `en` are valid. An invalid value has no special meaning: report the affected key,
ignore it, and continue with the next fallback. A missing override means inheritance; `null` is
not a language value. Interactive, non-persisted replies follow the user's current language,
using `language.project` only if the conversation language is not recognizable.

At overlap boundaries, the publication destination decides: local review prose uses
`language.workflow`, remote review prose uses `language.forge`, commit prose uses `language.git`.
A PR title that is a Conventional Commit subject uses `language.git`; its body and all comments
use `language.forge`.

An orchestrating tool resolves every required surface once per run and passes the concrete
`de`/`en` values to delegated agents. Agents must use that supplied language context and must not
independently re-read the project setup ADR. A directly invoked agent or standalone tool with no
orchestrator resolves the required values itself using this same rule.

### Transitional workflow fallback (read compatibility only)

When no valid `language.workflow` and no valid `language.project` exist, a legacy
`plan.markerLanguage = de|en` may temporarily supply `language.workflow`; report that the old
marker setting now controls the **whole workflow artifact** and point to `effective-flow setup`.
Writers never create `plan.markerLanguage`.

If no `language.*` or legacy marker key exists, an unconfigured project may temporarily derive
`language.workflow` from its existing plan corpus only when the plan prose, canonical fields,
and status marker consistently and unambiguously use one language across the corpus. A marker
alone is not evidence. Mixed, contradictory, empty, or unclear corpora supply no signal and fall
through to `en`; report the setup recommendation. This fallback is read-only compatibility and
does not authorize rewriting existing plans.

### Complete artifact consistency

One persisted artifact uses one language for all human-readable prose, including its headings,
field labels, displayed status values, review sections, and open-point sections. Readers accept
the documented complete German and English forms; writers never mix them. An explicit translation
changes the complete artifact, not only one marker or heading.

### Typography

Map `de` to `de-DE` and `en` to `en-US`. Locale-specific typography of visible prose — quotation
marks, dashes, umlauts and ß, non-breaking spaces, number and date formats — is owned by the
central `effective-writing` skill, which carries locale typography alongside its prose craft. Its
locale guidance is authoritative; Effective Flow keeps no second typography checklist.

If the skill is unavailable (not installed, `skills.enabled: false`, or disabled via `exclude`),
use only this minimal fallback for German prose: real umlauts and ß rather than ASCII
transliterations, German quotation marks „…“, and a spaced en dash – for parenthetical dashes.
Do not alter code, identifiers, commands, paths, or machine-readable values for typography.

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

**Load on demand:** Read `shared/runtime-state-safety.md`, when worktree lifecycle state will be read or mutated, or any confirmed legacy copy or removal, runtime migration, memory, or tracker-marker mutation is imminent.

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

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

## Runtime directory `.effective-flow/` and migration from `.firmo/`/`.sf-plugin/`

Effective Flow keeps project-local runtime data under `.effective-flow/` (`memory.json`,
`cache.json`, `review/`, `investigation/`, `.worktrees/`, and wisdom files; a legacy
`config.json` may still be present as transitional input, but configuration migration to the
project-setup ADR is owned by `effective-flow setup`). Earlier versions used `.firmo/`, and still older
ones used `.sf-plugin/`.

Every workflow that can mutate `.effective-flow/` must load this fragment after
“Runtime-state write safety” and run the following prerequisite before its **first** runtime
write. Merely finding `.effective-flow/` does not prove that migration ran. The stable,
versioned completion marker is the JSON value `runtimeMigration.directory.version: 1` in
`.effective-flow/memory.json`.

Resolve every current and legacy runtime path from the retained, verified
`RUNTIME_STATE_ROOT`. All reads, inventories, copies, collision decisions, and the final memory
write use absolute handles below that main checkout. Never scan or mutate a legacy/current
runtime tree below a linked execution worktree.

## Shared memory-state mutation

Every mutation of the retained absolute
`<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle uses this one repository-wide protocol.
This includes finding-number reservations, migration of
`<RUNTIME_STATE_ROOT>/.sf-memory.json`,
`runtimeMigration.directory`, `labelMigration.sf`, `configMigration.adr`, and every future
field. The owning workflow must already have loaded “Runtime-state write safety”; the runtime
directory migration prerequisite loads this fragment for its own marker and for all later
writers. Do not add a writer-specific lock or direct JSON rewrite.

Resolve the canonical file, legacy file, lock, owner record, and temporary file from the retained,
verified `RUNTIME_STATE_ROOT`. Run every guard from that root and use the resulting absolute
handles below the main checkout. Never inspect, lock, migrate, or mutate a same-named path below
`EXECUTION_ROOT` or another linked execution worktree.

### Acquire and own the lock

1. Generate a unique, unguessable lock token for this session. Apply “Runtime-state write
   safety” from `RUNTIME_STATE_ROOT` to the exact target `.effective-flow/memory.lock`, then
   acquire the retained absolute lock exclusively with the atomic command
   `mkdir <RUNTIME_STATE_ROOT>/.effective-flow/memory.lock`. A successful `mkdir` is the only
   evidence of acquisition; checking for absence first grants nothing.
2. As the first operation after acquisition, write
   `<RUNTIME_STATE_ROOT>/.effective-flow/memory.lock/owner.json` exclusively with at least the
   token, workflow/session identifier, and UTC acquisition timestamp; include the host and process
   ID when available. Guard this concrete absolute target before writing it. If the owner record
   cannot be written, remove the newly acquired empty lock directory only if it is still the lock
   from this acquisition, then fail.
3. If `mkdir` reports that the lock exists, retry with a short bounded delay for no more than 30
   seconds total. Do not mutate memory or publish an artifact while waiting. On timeout, read the
   owner record without changing it and report the recorded owner, session, and timestamp (or
   that the record is missing or invalid) with the lock path.
4. Never infer that age alone makes a lock disposable. A missing or malformed owner record, an
   apparently inactive process, or an unusually old timestamp makes it only an apparent orphan.
   Ask for explicit user confirmation before removing an apparent orphan. After confirmation,
   re-read the owner record and verify that the observed token or exact missing-record state is
   unchanged before guarded removal; otherwise leave it for its current owner and retry normally.
5. Normal release must release only its own lock: re-read `owner.json`, require the exact token
   from this acquisition, remove that owned record, and remove the lock directory only if empty.
   A mismatch or foreign entry is reported and left untouched. Use a `finally`/trap-equivalent
   release on handled failures; an abrupt interruption may leave an apparent orphan for the
   confirmed recovery path above.

### Mutate a fresh object and replace it atomically

While holding the lock:

1. Re-read the retained absolute `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle inside
   the lock. If it exists, use it as the base object. If it is absent, select the base exactly once
   through “Legacy `.sf-memory.json`” below: a valid, unchanged runtime-root legacy file is the
   base, otherwise the base is an empty object. Existing or legacy content must be valid JSON and
   a JSON object. If present, `lastFindingNumber` must be a nonnegative safe integer. Invalid JSON,
   a non-object value, or an invalid `lastFindingNumber` fails clearly; never default, repair, or
   overwrite it destructively.
2. Merge only the field or subtree owned by the current operation into that fresh object.
   Preserve all other known or unknown fields with the same JSON meaning. A subtree writer
   re-reads and merges sibling keys rather than replacing their parent. The directory migration
   recursively adds only absent legacy keys with the fresh target winning every conflict; a
   marker writer updates only its named marker; a reservation updates only
   `lastFindingNumber`.
3. Serialize the complete merged object, including a trailing newline, to a same-directory unique
   absolute file such as
   `<RUNTIME_STATE_ROOT>/.effective-flow/.memory.json.<session>.<token>.tmp`. Guard the concrete
   temporary path from `RUNTIME_STATE_ROOT`, create it exclusively, finish and close the write,
   and flush it when the host supports that operation. Never truncate or stream partial content
   into `memory.json`.
4. Apply “Runtime-state write safety” from `RUNTIME_STATE_ROOT` to the absolute canonical memory
   handle immediately before an atomic rename of the owned temporary file over the target.
   Because the temporary file is in the same directory, readers see either the previous complete
   object or the new complete object. If writing, flushing, or replacement fails—including
   permissions or disk-full errors—the prior `memory.json` remains the source of truth. Report the
   concrete failure and clean up only this operation's own temporary file; never delete a foreign
   temporary file or lock.
5. Release the owned lock only after the atomic replacement succeeds or the failure has been
   handled. A successful replacement is committed memory state and is never rolled back to
   compensate for a later artifact or remote-operation failure.

### Reserve finding IDs before publication

A producer must finish confidence filtering, design-decision filtering, and local or remote
deduplication before it knows the findings that will actually be new. If none remain, reserve
nothing and do not write `lastFindingNumber`. Otherwise:

1. Let `N` be the exact positive number of new findings. Acquire the lock, validate the fresh
   object and counter, and reserve the exact nonzero contiguous range
   `lastFindingNumber + 1` through `lastFindingNumber + N` by atomically persisting the upper
   bound under this protocol.
2. Record the ordered finding-to-ID mapping in in-run state, release the lock, and only then—before
   publishing any report, finding issue, or epic—use that reserved mapping. Concurrent producers
   therefore receive disjoint ranges.
3. Failure before the reservation is persisted prevents all publication. Failure or interruption
   after reservation never decrements or reuses the counter: unpublished IDs become permanent
   gaps, which are harmless evidence of monotonic allocation. Report the reserved range and any
   artifacts that were published before the interruption; on retry, deduplicate again and reserve
   a new range for whatever still needs publication.

### Legacy `.sf-memory.json`

Legacy adoption is never a preliminary migration or a separate write. For **every** writer—such
as the runtime-directory marker, label marker, config marker, or finding-range reservation—the
same locked transaction performs these steps when canonical memory is absent:

1. Inside the acquired lock, re-check the absolute
   `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle. If another compliant writer created
   it, use that fresh canonical object and leave `<RUNTIME_STATE_ROOT>/.sf-memory.json` untouched.
2. Otherwise, if `<RUNTIME_STATE_ROOT>/.sf-memory.json` exists, read it once, record its file
   identity and content digest, and validate it as the initial object, including
   `lastFindingNumber`. Invalid or unreadable legacy content fails the whole transaction; never
   replace it with an empty object.
3. Merge the current writer's intended mutation into that same initial object. Thus a
   runtime-directory prerequisite adds `runtimeMigration.directory` without losing the legacy
   counter; a label/config marker adds only its subtree; and a reservation allocates from the
   legacy `lastFindingNumber`.
4. Immediately before replacement, verify that the absolute legacy handle is unchanged by identity
   and digest. A change fails before canonical persistence. Otherwise write the combined base plus
   current mutation through one temporary file and one atomic replacement of canonical memory.
5. Only after that replacement succeeds, re-check that the legacy identity and digest still
   match, then remove `<RUNTIME_STATE_ROOT>/.sf-memory.json`. If it changed, do not remove it and
   report the conflict; if removal alone fails, report that cleanup failure without rolling back
   committed canonical memory.

For example, root legacy memory with `lastFindingNumber: 41` plus the runtime-directory
prerequisite produces one canonical object that retains `41` and adds the directory marker. A
following two-finding reservation therefore allocates `R-0000042`–`R-0000043` and persists `43`.
Never let the prerequisite publish its marker first and thereby hide the root legacy counter.

Timeout, invalid state, permission failure, disk exhaustion, failed replacement, or loss of lock
ownership blocks the owning mutation and every publication that depends on it. Preserve foreign
state, give the exact path and error, and leave confirmed recovery or repair to the user.

1. **Read without creating anything.** Read the absolute
   `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle when present. A valid
   marker makes the prerequisite a no-op. A missing marker starts the migration scan even when
   `.effective-flow/` already contains a transitional `config.json`, wisdom file, report, cache,
   worktree, or unrelated memory fields. Do not create a runtime footprint during a read-only
   run; this prerequisite is activated only because a workflow-specific runtime write is already
   authorized and imminent. When canonical memory is absent, do not write the marker yet: the
   locked memory transaction in Step 5 must first adopt a valid absolute
   `<RUNTIME_STATE_ROOT>/.sf-memory.json` as its base.
2. **Choose exactly one legacy source.** Use the whole `<RUNTIME_STATE_ROOT>/.firmo/` tree when
   it exists; otherwise use `<RUNTIME_STATE_ROOT>/.sf-plugin/` when it exists. If both exist, do
   not combine them. Preserve both legacy
   directories unchanged. If neither exists, proceed directly to the final marker update as part
   of the already-authorized first runtime write, without a separate eager migration write.
3. **Validate before carrying state over.** Inventory the selected source without mutation. All
   entries required for the merge must be readable. If either present `memory.json` is invalid
   JSON, is not a JSON object, or cannot be read, a safe memory merge is impossible: report the
   path and error, leave the completion marker unset, perform none of the workflow-specific
   runtime writes, and retry on a later run. Do not reinterpret configuration or migrate it to an
   ADR here; that remains `effective-flow setup`’s responsibility.
4. **Merge the directory tree without replacing target state.** Walk the chosen legacy tree
   recursively, except for the entire `.worktrees/` subtree: legacy worktrees are path-registered
   and remain only in the legacy directory. For every other relative path, an existing target
   path wins regardless of type, timestamp, or content. Create only missing target directories
   and copy only missing files—including `cache.json`, report or investigation trees, and wisdom
   files—using no-clobber or exclusive-create semantics so a target that appears concurrently
   still wins. Apply “Runtime-state write safety” separately and immediately before each concrete
   `mkdir` or copy target. Treat `memory.json` specially under step 5 instead of copying it as a
   normal file. A copy, read, or guard failure stops the merge, leaves the marker unset, preserves
   both legacy directories and all target entries already carried over, blocks the
   workflow-specific runtime write with an actionable error, and allows the next run to retry
   the remaining missing paths.
5. **Merge memory recursively under the shared contract, target wins.** Use “Shared memory-state
   mutation” above; do not introduce a migration-specific lock or direct writer. Inside its lock,
   select the retained absolute `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle or a
   valid unchanged `<RUNTIME_STATE_ROOT>/.sf-memory.json` as the base, then merge the selected
   legacy directory's `memory.json` by recursively adding only keys absent from that freshest
   base. At every scalar, array, object, or type conflict preserve the base value. After every
   directory copy has succeeded, add only `runtimeMigration.directory.version: 1` and atomically
   persist the base, directory merge, and marker in one replacement. Never reduce or replace
   existing counters, migration markers, status, or unrelated fields.
6. **Certify only success.** The marker is the final migration mutation and is written only after
   all safe carry-over work succeeds. A run with no legacy source records it as part of the first
   authorized runtime write. Once version `1` is present, later prerequisites skip the legacy
   scan and are idempotent. An interrupted or concurrent run with no marker retries; it never
   deletes legacy data, overwrites target paths, or treats a partially populated target as proof
   of completion.

The `.gitignore` switch to a single `.effective-flow/` entry—including migration of the earlier
two-line pattern `.effective-flow/*` plus `!.effective-flow/config.json`, as well as a blanket
`.firmo/` or `.sf-plugin/` ignore line—is handled only by `effective-flow setup`. Deletion of preserved
legacy directories remains an explicit, user-confirmed responsibility of `effective-flow cleanup`.

## Effective Flow configuration (project setup ADR)

The tracked truth for the Effective Flow configuration is a living ADR "Effective
Flow project setup" (default slug `effective-flow-project-setup`, see fragment "Living
ADR model"). It carries the config parameters with minimal prose as a **Markdown table**. There
is **no** `.effective-flow/config.json` as a config source anymore; `.effective-flow/` is a
pure runtime directory (`memory.json`, `cache.json`, `review/`, `.worktrees/`) and is
completely gitignored.

### Config locator (resolution order)

When reading the configuration, the project setup ADR is resolved in this order; the
first matching step wins:

1. **AGENTS.md marker.** The canonical line `**Effective Flow project setup:** <path>` in
   `AGENTS.md`, otherwise in `CLAUDE.md` or a comparable convention file → read the ADR
   under `<path>`. **Backcompat (one generation):** a still-present legacy marker
   `**Firmo project setup:** <path>` is recognized as equivalent on read; effective-flow setup
   converts it non-destructively to the new spelling on the next run. If the
   marker points to a path under which **no** ADR lives (dead/stale marker), do not stay
   there, but fall through in this order and report the stale marker
   (correction in effective-flow setup).
2. **Default path/scan.** Otherwise `docs/adr/effective-flow-project-setup.md` or a scan of the
   detected ADR directory (`docs/adr/`, `docs/decisions/`, `adr/`) for the project setup ADR. A
   file matches that scan when its stem equals `effective-flow-project-setup` or the legacy slug
   `firmo-project-setup` after stripping an optional leading `^\d+[-_]` numeric prefix, **and**
   its body carries one of the canonical configuration envelopes listed under "Table encoding"
   below. Both the numeric prefix and the legacy slug are read-side tolerance; they do not decide
   what a new file is named. That tolerance widens the scan to a family of names, so **several**
   files can match inside this one step; "the first matching step wins" ranks the four steps, not
   the matches within a step. Rank the matches by one **ordered** comparison rather than by two
   independent preferences: prefer the current slug `effective-flow-project-setup` over the legacy
   `firmo-project-setup` first, and only among files carrying the same slug prefer an unprefixed
   stem over a prefixed one. Stated as two independent preferences,
   `0001-effective-flow-project-setup.md` and `firmo-project-setup.md` would each win one and
   neither would survive both. If more than one match still ties at the top of that ranking, report
   every matching path and fall through to the next step instead of picking one. Falling through
   here is not the same result as finding nothing: a tool that **writes** configuration ends its run
   on a reported several-match result, reporting every matching path so its user resolves the
   duplicates by hand, and never reads it as "no project setup ADR exists", because writing a new
   ADR into that state adds a further one beside the matches already reported.
3. **Transitional compatibility.** Otherwise — only transitionally — establish or reuse the
   verified execution-location receipt and resolve the fallback from `RUNTIME_STATE_ROOT`: read
   a still-present absolute `<RUNTIME_STATE_ROOT>/.effective-flow/config.json` handle (otherwise
   `<RUNTIME_STATE_ROOT>/.firmo/config.json`) and point to effective-flow setup. Never inspect a
   same-named fallback below a linked `EXECUTION_ROOT`. A missing, bare, moved, unsafe, or
   repository-mismatched runtime root blocks the fallback. This read path creates **nothing**
   and touches **no** Git.
4. **Built-in defaults.** Otherwise use the defaults of the respective source skills.

The deterministic read path of any tool is non-blocking: It reads the ADR (or
the transitional fallback), but itself creates no file and mutates no Git. Creating
the ADR, the markers and the migration happen exclusively in the Git-touching path of
effective-flow setup.

### Table encoding (binding for writers and readers)

The config parameters stand as a flat Markdown table with two columns. Readers bootstrap before
they know the configured language by accepting both canonical envelopes: English
`## Configuration` with `| Key | Value |`, and German `## Konfiguration` with
`| Schlüssel | Wert |`. They likewise recognize `## Context`/`## Kontext`, `## Status`,
`Active`/`Aktiv` and `Superseded`/`Abgelöst`. The former German empty-list token `(leer)` is
accepted on legacy reads only. Config keys and newly written encoded values remain identical and
English in both envelopes, including `(empty)`. Writers (effective-flow setup, migration) and readers
(all tools) interpret values identically. A normal update preserves the existing ADR envelope
language; changing `language.documentation.technical` does not translate an existing ADR.

- **Boolean** → `true` / `false`.
- **String** → literal, unquoted (e.g. `focused`, `origin/main`).
- **`null`** (semantically "ask at run time", e.g. `applyReview.defaultCommitStrategy`) →
  the literal token `null`.
- **Empty list** → `(empty)`.
- **Filled list** → comma-separated (e.g. `humanizer, distill`).
- **Nesting** → dotted keys (e.g. `applyReview.worktree.baseDir`,
  `skills.agents.ui-implementer.include`); an empty object has no sub-lines.
- **Missing line = key not set → default of the source skill.** Deliberately
  different from a present line with value `null` (an explicit value, semantically "ask at
  run time"). Example: no `delivery.completion` line → default `merge`; a
  `delivery.completion | null` line → ask at run time.
- **`delivery.prReview`** → the literal string `ask` (default), `always`, or `off`; it governs the
  automatic PR review publication after a delivery. No `delivery.prReview` line → default `ask`,
  per the rule above.
- **`tracker.externalStartedState`** → a nullable string containing the external connection's stable
  state ID, or its exact accepted token only when that connection exposes no ID. Missing or `null`
  means unset and never authorizes a guessed transition. Readers validate a non-null value against a
  fresh list of writable states in the exact configured tracker context before every implementation
  run; stale, terminal, read-only, cross-context, and display-name-only matches fail closed before
  code. Only `effective-flow setup` writes a confirmed tracker-verified suggestion. The fixed post-merge
  observation grace period has no configuration key.
- **`tracker.externalDoneState`** → a nullable string containing the external connection's stable
  **terminal** state ID, or its exact accepted token only when that connection exposes no ID. Missing
  or `null` means unset and never authorizes a guessed transition. Readers validate a non-null value
  against a fresh list of writable states in the exact configured tracker context before the offered
  post-merge terminal transition; stale, non-terminal, read-only, cross-context, not-done-category,
  and display-name-only matches make that transition unavailable instead of guessing, and never
  abort a run whose merge already succeeded. That transition is not the only reader: the post-merge
  observation of an issue found already terminal resolves the same value by the same rules, and a
  value that fails there makes that issue's reconciliation unavailable rather than its transition.
  Only `effective-flow setup` writes a confirmed
  tracker-verified suggestion. The completion assessment behind the offer has no configuration key of its own.

Reading a single value is a trivial line lookup (line with dotted key →
value cell). Example excerpt (interface sketch, not full content):

```markdown
## Configuration

| Key                         | Value    |
| --------------------------------- | ------- |
| review.profile                    | focused |
| applyReview.defaultCommitStrategy | null    |
| skills.exclude                    | (empty)  |
| worktree.enabled                  | true    |
```

If the table is invalid or ambiguous (missing key, unknown encoding): use a
safe default for the run, inform the user about the affected key,
do **not** guess.

## Issue-tracker integration (remote mode)

This shared fragment connects `effective-flow review` and ``tools/apply-review.md`` with an issue tracker. Its own mechanics describe the **forge** target: the issue tracker of the Git forge behind the `origin` remote (GitHub via `gh`, Forgejo via `tea`). A project may instead resolve the `external` target, whose contract is named under "Tracker target" below. Publication is **opt-in** via the Effective Flow configuration (project setup ADR) and disabled by default (`local`). On the `local` target both skills behave unchanged – findings run through the Markdown report file under `.effective-flow/review/`, no issues are created and no CLI is invoked. On a publishing target a local report is written only for findings withheld by the "Security disclosure gate" below.

The tracker target (`tracker.mode`) affects exclusively **reviews**. **Investigations** (`effective-flow investigate`) are exempt from it and remain purely local on every target under `.effective-flow/investigation/` (never committed, never as an issue). Of the Effective Flow artifacts, only **plans** are committed.

It encapsulates the **shared** building blocks: the `tracker` config schema including migration, the mode determination, the provider-neutral remote-helper contract, the label convention, and the canonical issue and epic body formats. The actual orchestration – when issues are **created** (`effective-flow review`) and when they are **read and processed** (``tools/apply-review.md``) – stays in the respective skill.

In addition, ``tools/apply-issues.md`` and `effective-flow plan-issue` use this fragment for the same provider-neutral helper operations. These two skills process **arbitrary** human issues instead of the finding issues produced by `effective-flow review`; they are **inherently tracker-bound** and do **not** evaluate the local/remote toggle – they resolve the tracker target (see "Tracker target") and work against it. On the forge target they only need a Git repository, an `origin` remote and an authenticated CLI. The finding-/epic-specific sections (issue body format, epic body format, `R-XXXXXXX` convention) apply only to `effective-flow review`/``tools/apply-review.md``; the checkbox-ticking mechanics for epic bodies are used by ``tools/apply-issues.md`` analogously for container issues.

### Configuration

Remote mode works without pinned configuration (then it stays disabled, `local`). If the Effective Flow configuration (project setup ADR) pins corresponding values, they override these defaults (schema shown here for illustration):

```json
{
  "tracker": {
    "mode": "local",
    "remoteToolOverride": "auto",
    "externalTool": null,
    "externalToolHint": null
  }
}
```

Missing values have these defaults:

- `tracker.mode`: `"local"` (feature off)
- `tracker.remoteToolOverride`: `"auto"` (tool automatically from the `origin` URL)
- `tracker.externalTool`: `null` (no external tool named)
- `tracker.externalToolHint`: `null` (no additional connection hint)

Valid values:

- `tracker.mode`: `"local"`, `"remote"`, `"external"`
- `tracker.remoteToolOverride`: `"auto"`, `"github"`, `"forgejo"`
- `tracker.externalTool`: a short, non-empty identifier of the tool that holds the issues. There is
  **no** whitelist; Effective Flow neither rejects an unknown tool nor infers capabilities from the
  name. Required when the mode is `external`.
- `tracker.externalToolHint`: free text that lets the run-time agent pick the right connection —
  e.g. MCP server name, workspace, team or project key, identifier convention, or state names.

`remoteToolOverride` is intended only for ambiguous hosts (e.g. self-hosted GitHub Enterprise whose domain does not contain `github.com`). With `auto` the host detection below decides. It names a **forge** CLI and stays forge-only.

### Config migration

Reading the Effective Flow configuration from the project setup ADR (including the `tracker` keys) and the one-time migration of a legacy config is handled centrally by the fragment "Config migration" (`config-migration.md`); this fragment performs no own per-block migration for `tracker` anymore. The `tracker` config schema above (configuration, valid values, mode determination, first-invocation query) remains unaffected by this.

### Determine mode

At the start of the run, determine the effective mode in this order (the first matching rule wins):

1. **Argument type:** The passed argument type overrides the config mode for this run. A report file (`*.md` under `.effective-flow/review/`) forces `local`; a forge issue reference (issue number, `#123` or a forge issue URL) forces `remote`; a tool-native identifier or URL of the configured external tool forces `external`.
2. **Per-run wish of the user:** A **generic** wish for issue/tracker work ("as issues", "publish to the tracker") activates the **configured** target and never redirects a run to a different one; without a configured target it selects `remote`. Only a wish that explicitly names the forge (GitHub, Forgejo, `origin`) selects `remote`, and only a wish that explicitly names the configured external tool selects `external`. If the user explicitly requests local work ("local", "without issues", "report only"), `local` is active — that stays the escape hatch on every target.
3. **Config:** otherwise `tracker.mode` from the Effective Flow configuration (project setup ADR) applies.
4. **First-invocation query:** If `tracker.mode` is not set in the config and neither argument nor per-run wish delivers a signal, run the first-invocation query below.

### First-invocation query

Only when step 4 above applies (no config value, no argument/per-run signal):

Ask the user: **Should review findings be tracked locally as a Markdown report or remotely as issues (GitHub/Forgejo)?**
- Local -- tracker.mode = local — Markdown report under .effective-flow/review/ (previous behavior)
- Remote -- tracker.mode = remote — findings as issues, tool automatically from origin (gh/tea)

Use the chosen answer as the tracker mode **for this run**. Do **not** write it into the configuration yourself — permanently pinning `tracker.mode` in the project setup ADR is handled exclusively by `effective-flow setup`. Briefly point this out to the user, e.g. "Tracker mode `remote` used for this run; pin permanently via `effective-flow setup`."

The query stays deliberately two-way: it runs only when no configuration pins a mode, and it must not write configuration itself, so it cannot obtain the tool identifier an external target requires. An external target is configured through `effective-flow setup` or named per run in an explicit user wish that supplies the tool.

### Tracker target

The determined mode names the **target** that owns issue identity for this run: `local` (Markdown report), `forge` (`remote` — the issue tracker of the `origin` remote), or `external` (the tool named by `tracker.externalTool`). Everything below in this fragment — the helper contract, the label convention with its `firmo-` compatibility and one-time `sf-` migration, the tracker operations, and the finding and epic body formats — describes the **forge** target.

`external` requires a non-empty `tracker.externalTool`. Without it the configuration is invalid: abort before any tracker access, name the missing key, and point to `effective-flow setup`. Never guess a tool, and never fall back to the forge or to `local`. While the mode is `local` or `remote`, `tracker.externalTool` and `tracker.externalToolHint` are ignored for routing and reported once as ignored. Both issue-carrying flows follow the resolved target: the issue-driven flow (``tools/apply-issues.md``, `effective-flow plan-issue`) and review publication.

The complete external contract — connection discovery with its fail-closed rules, the required capabilities, the write discipline, the classification mapping, the container mechanism, and the reference syntax — lives in the `tracker-target` fragment. Every source that embeds this fragment **must** carry its own deferred pointer to `tracker-target`, so a run loads that contract as soon as the resolved target is `external` and never for a `local` or `forge` run. A run that resolves `external` without that contract available aborts instead of improvising.

### Remote helper contract (remote mode only)

All deterministic remote mechanics of the forge target run through the shipped helper:

```text
node <skill-root>/scripts/remote-tracker.mjs <operation> [--apply]
```

Pass exactly one JSON object through standard input and parse exactly one JSON result envelope from standard output. Resolve `<skill-root>` from the currently loaded Effective Flow skill; never copy the helper into the target project. The helper owns origin/provider/reference parsing, `gh`/`tea` probing, capability normalization, command construction, JSON normalization, payload validation, compatibility aliases, exact body patching, redaction, and stale-write preconditions. It never opens a shell and never prompts.

Pass the verified absolute `RUNTIME_STATE_ROOT` as the top-level `cwd`. The helper runs `git`, `gh`
and `tea` in that directory, and every provider CLI resolves its repository context from it. The
runtime root is the one checkout guaranteed to exist for the whole run, whereas an execution
worktree may already have been withdrawn by the time a completion action runs. The field is
optional for compatibility — when it is absent the helper inherits the process working directory —
but an Effective Flow workflow always sets it. A `cwd` that is not an existing directory fails with
a structured error naming the path, never as a missing-CLI error.

For `finding-build` and `epic-build`, pass the already-resolved `language.forge` as the top-level
`language: en|de`; this applies equally when the finding or epic data is nested under its named
key. The optional field defaults to `en`, and unsupported values are rejected. The helper returns
the same language-stable payload keys in either language.

Successful envelopes contain `ok`, `operation`, `provider`, `data`, and `dryRun`. Failed envelopes additionally contain `error.code`, `error.message`, redacted `error.details`, and `error.retryable`, and the process exits nonzero. Treat errors as workflow input; do not discover flags, assemble API requests, read CLI credentials, or invent a fallback. In particular:

- `AMBIGUOUS_HOST`: obtain an explicit `github`/`forgejo` choice from configuration or the user, then retry with that override.
- `CLI_MISSING`/`AUTH_FAILED`: abort without side effects; offer local mode only with explicit user consent.
- `UNSUPPORTED_CAPABILITY`: report the unsupported provider capability and preserve the surrounding workflow state.
- `STALE_WRITE`: abort that write without retrying, merging, or overwriting; re-enter the workflow from a fresh read.
- all other structured errors: preserve scope and let the owning workflow decide whether a retry is safe.

Reads execute immediately. Mutations are dry runs by default: inspect the returned executable, argument vector, and redacted input preview, obtain every workflow-specific approval that still applies, and only then repeat the same operation with `--apply`. A dry run never changes Git, tracker state, memory, labels, issues, pull requests, comments, or review threads.

### Label convention

In remote mode, use these labels and create missing labels idempotently. The helper's label creation reads the repository's existing labels first and creates only what is genuinely missing, so a repeated run adds no second copy of a label; each call reports whether it created anything. Copies an earlier version already created are not removed and can still attach several times to one issue. Where the existing labels cannot be read, it aborts instead of creating:

| Label                                                                                          | Meaning                                                                           |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `effective-flow-review-finding`                                                                | marks a single finding issue                                                      |
| `effective-flow-review-epic`                                                                   | marks the epic/tracking issue                                                     |
| `effective-flow-fix`, `effective-flow-refactor`, `effective-flow-build`, `effective-flow-docs` | target action of the finding (exactly one per finding issue)                      |
| `critical`, `important`, `note`                                                                | severity of the finding (exactly one per finding issue; `note` for note findings) |
| `wontfix`                                                                                      | deliberately do not implement finding → ADR instead of code                       |
| `effective-flow-issue-done`                                                                    | issue implemented by ``tools/apply-issues.md`` (PR created)                        |
| `effective-flow-issue-in-progress`                                                             | forge fallback showing issue-backed implementation has started                    |
| `effective-flow-needs-planning`                                                                | skipped by ``tools/apply-issues.md``; planning via `effective-flow plan-issue` needed   |

`wontfix` already exists on many trackers; the helper creates it only if it is missing.
`effective-flow-issue-in-progress`, `effective-flow-issue-done`, and
`effective-flow-needs-planning` belong to the issue-driven lifecycle and are created idempotently
where needed. The in-progress label is a forge fallback for a native started state; the done label
continues to mean "implementation secured in a PR", not "tracker issue closed". Merge reconciliation
removes the in-progress label only after it freshly observes the issue as terminal.

**Backward compatibility (severity labels):** The English severity labels `critical`/`important`/`note` are the default; newly created or set is exclusively the English label. The former German labels `kritisch`/`wichtig`/`hinweis` are **not** upgraded but stay **recognized** permanently when reading, listing, deduplicating and detecting a finding's severity — run a severity query per language variant (once `critical`/`important`/`note`, once `kritisch`/`wichtig`/`hinweis`) and union by issue number, analogous to the `firmo-`/`effective-flow-` prefix rule above.

**Backward compatibility (legacy prefix `firmo-`):** Earlier versions used the prefix `firmo-` instead of `effective-flow-` (`firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`firmo-refactor`/`firmo-build`/`firmo-docs`, `firmo-issue-done`, `firmo-needs-planning`). Newly **created or set** is exclusively the `effective-flow-` label; an upgrade of existing `firmo-` labels is **not** needed. When **reading, listing, deduplicating and detecting**, every `firmo-` variant counts permanently as equivalent to the associated `effective-flow-` variant:

- **Listing/filtering** (dedup, epic/issue search): `gh`/`tea` combine multiple `--label` specifications with AND semantics. Therefore run the query **separately per prefix** (once `effective-flow-…`, once `firmo-…`) and union the matches by the issue number.
- **Removing a status label** (`effective-flow-needs-planning`, `effective-flow-issue-done`): additionally remove the legacy `firmo-` variant, if present, so an issue does not stay "stuck" through a leftover legacy label. `effective-flow-issue-in-progress` is new and has no legacy variant.

**One-time `sf-` label migration:** The even older prefix `sf-` (`sf-review-finding`, `sf-review-epic`, `sf-fix`/`sf-refactor`/`sf-build`/`sf-docs`, `sf-issue-done`, `sf-needs-planning`) is **no longer** detected continuously, but **migrated once per repo**. On the **first** remote tracker access — provided the marker `labelMigration.sf.done` in the retained absolute `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle is missing and an authenticated CLI is present — an idempotent migration moves every still-present `sf-<x>` label to `effective-flow-<x>`: first add `effective-flow-<x>` on the issue, then remove `sf-<x>` (not the other way around, so an abort leaves no issue unclassified). If the runtime directory is missing, apply the owning workflow's loaded “Runtime-state write safety” contract from `RUNTIME_STATE_ROOT` to that exact directory immediately before its `mkdir`. After the remote migration, use the loaded shared memory mutation contract against the retained absolute memory handle: acquire its lock, re-read memory, merge only `labelMigration.sf`, and atomically persist `done` plus the completion timestamp while preserving every sibling and unknown field. If this marker mutation blocks or fails, preserve local state, report that the remote labels may already have migrated, and direct the user to `effective-flow setup`; the next run may repeat the idempotent remote migration. If the migration finds no `sf-` labels, it is a silent no-op. If the marker is set, any further scan is skipped — ongoing operations know only `effective-flow-` and `firmo-`. `sf-` is referenced exclusively in this migration.

### Security disclosure gate

A finding classified as security relevant is **never** written to a tracker without an explicit
per-run confirmation by the user. This gate binds every publisher of review findings and
overrides `tracker.mode` as well as every other configuration value; there is no configuration key
that switches it off. Publication to a third-party tracker is a disclosure with the same
consequences as publication to a public forge, so the gate binds a forge target and an external
target alike. The producing workflow owns the classification and the confirmation
(see `effective-flow review`, Phase 3 and Phase 4).

Rules for every publisher, on whichever tracker target the run resolved:

- **Local first:** the withheld findings are persisted in a local report below
  `.effective-flow/review/` before any tracker mutation. That report is the authoritative record
  for them; it stays in the gitignored runtime state of the main checkout and is never committed.
- **Confirmation before publication:** publication happens only after an explicit user decision in
  that run, taken with knowledge of the disclosure consequence. Keeping them local is the default;
  an unanswered, skipped, or non-interactive run publishes nothing from the withheld set.
- **Silence in public artifacts:** epic bodies, issue bodies, and comments contain no count, title,
  signature, ID, or other reference to a withheld finding. A public hint that unfixed security
  findings exist is itself an exploitable signal.
- **Conservative classification:** an uncertain or missing security assessment counts as security
  relevant and stays local.
- **Scope:** the gate covers the publication of review findings. It does not sanitize branch names,
  commit subjects, or pull request bodies of a later fix; that disclosure decision belongs to the
  delivering workflow and its user.

The gate governs only the destination of a finding. It never removes a finding, changes its
severity, or narrows the active finding scope.

### No AI attribution in issue bodies and comments

Do not add AI attribution to issue bodies, epic bodies and comments: no "Generated with Claude Code/Codex" footers, no agent session links (e.g. `https://claude.ai/code/…`) and no `Co-Authored-By` trailers – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex as the target harness are allowed, generation attribution is not. This binds every publisher on every tracker target, the forge and an external tool alike.

### Remote prose language

Resolve `language.forge` once per remote run and pass it to all issue/comment writers. Preserve
the clear language of an existing issue or thread when editing/replying; otherwise use the
resolved Forge language. Finding and epic bodies use one complete language for human-readable
titles, headings, field labels, displayed severity/complexity values, and prose.

The German display mapping is `Schweregrad`, `Komplexität`, `Bereich`, `Datei`, `Problem`,
`Empfehlung`, `Prompt-Vorschlag`, `Sicherheit`, `Befunde`, and
`Übersprungen (Architekturentscheidungen)`. English uses the template labels below. The exposure
values `external`, `internal`, and `none` of the `Security`/`Sicherheit` field are machine tokens
and stay unlocalized in both forms. `Action`,
`Epic`, and `Signature` are stable helper/dedup fields and remain canonical English in both
forms, as do their action values. Displayed severities map to
`Kritisch`/`Wichtig`/`Hinweis`, and displayed complexities map to
`Niedrig`/`Mittel`/`Hoch`; their helper input enums remain
`Critical`/`Important`/`Note` and `Low`/`Medium`/`High`. Labels, issue numbers, `R-XXXXXXX` IDs, HTML markers, body
hashes, checklist syntax, and helper payload keys are never localized. Readers accept both
German and English historical display fields, including legacy `Signatur`, but canonical writes
use `Signature`.

### Issue body format (finding issue)

A finding issue must be **self-contained**: a foreign LLM session must be able to process it without access to the producing session. It contains the same content fields as a finding block of the local report format (see the shared `review-report-format` fragment).

- **Title:** `[R-XXXXXXX] <short title in language.forge>`
- **Labels:** `effective-flow-review-finding`, the action label and the severity label.
- **Body** (canonical template):

```markdown
- **Severity**: Critical / Important / Note
- **Complexity**: Low / Medium / High
- **Area**: [...]
- **File**: [path:line]
- **Problem**: [...]
- **Recommendation**: [...]
- **Action**: effective-flow-fix | effective-flow-refactor | effective-flow-build | effective-flow-docs
- **Prompt suggestion**: [directly copy-pasteable plain text, without enclosing quotation marks, without escape sequences]
- **Epic**: #<epic number> (empty if no epic)
- **Signature**: [path:line] · [Area] · [short summary of the problem]  <!-- Dedup key -->
```

A finding published through the "Security disclosure gate" keeps its `Security`/`Sicherheit` field
in the issue body, so the accepted disclosure stays visible; an ordinary finding omits that field
instead of carrying an empty `none`.

The **Signature** field fixes the content dedup key (file+line, area, problem). It is deliberately **not** the `R-XXXXXXX` ID, because that is assigned freshly per run. Canonical writes use `Signature`; helper reads and deduplication also accept the legacy field name `Signatur` and normalize both forms to the same identity.

### Epic body format (tracking issue)

- **Title:** `Code review YYYY-MM-DD[-N]` for English or
  `Code-Review YYYY-MM-DD[-N]` for German
- **Labels:** `effective-flow-review-epic`
- **Body** (canonical template):

```markdown
Code review of YYYY-MM-DD · Scope: [Entire code / Described area] · Project type: [...]

## Findings

- [ ] #<nr> [R-0000001] <short title> — Action: effective-flow-fix
- [ ] #<nr> [R-0000002] <short title> — Action: effective-flow-refactor

## Skipped (design decisions)

- <short title> — Signature: [normalized signature] — covered by [decision reference] ([Source])
```

Rules for the task list:

- Each entry under `## Findings` references exactly one finding issue via its number and carries the `R-XXXXXXX` ID as well as the action.
- The section `## Skipped (design decisions)` uses **no** checkboxes and lists only findings filtered out by design decisions. A skipped entry is identified by title, normalized signature, and decision reference; it carries no issue number and no `R-XXXXXXX` ID, and it never advances `lastFindingNumber`. The section is omitted when no such findings are present.
- Ticking off delegates the exact checklist patch to the helper, using the body hash from the preceding fresh read. It may append the PR link; a finding deliberately not implemented is marked with its decision reference.

### Tracker operations

Describe tracker access only as a helper operation: issue/PR read and list, issue/PR create,
issue state transition, native sub-issue read/create, comment read/create/update, label
create/change, PR review-thread read/reply/resolve, PR submitted-review read,
marker/checklist patch, or PR creation. Use the helper's normalized output rather than
provider-specific fields. For list operations, request the compatibility variants and let the
helper union matches by issue number before signature deduplication.

The two native-containment operations are deliberately separate from generic issue creation:

- `issue-sub-issues-read` takes a mandatory top-level `parent` issue reference and returns a list of
  normalized issue objects. Every item additionally carries
  `parent: { number, repository }`; a child created from an Effective Flow decomposition also
  carries its normalized `decompositionKey` from the canonical marker in its body. A malformed,
  duplicated, invalid, or different-parent marker does not discard the provider-verified native
  child or abort its siblings: that child instead carries a safe structured
  `decompositionKeyError`. Planning reconciliation must fail closed on that diagnostic; lifecycle
  and merge observation still use the verified native relation and issue identity.
- `issue-sub-issue-create` is a mutation whose top-level `parent` is mandatory. Its `payload`
  contains a non-empty `title`, non-empty self-contained `body`, optional `labels`, and the stable
  lowercase `decompositionKey`. The helper validates that a parent URL belongs to the active
  repository, redacts complete recognizable secret values in titles and bodies, rejects an unsafe
  credential form it cannot transform deterministically, rejects secret-bearing labels and
  generation attribution, appends exactly
  one `<!-- effective-flow-decomposition-key:v2 <base64url> -->`
  marker as the final nonblank standalone line of the child body, and returns the normalized child
  with the same parent relation and key. The encoded payload is exactly
  `{"target":"forge|external","parent":"<identity>","key":"<key>"}`; a forge parent is stored in its
  normalized `#<number>` form and an external identity byte for byte. A `v1` marker is **not**
  parsed: it fails closed as an unsupported version reporting `version` and `supported`, never as a
  malformed marker and never rewritten. Reads recognize the marker only in that canonical appended
  position; quoted and fenced examples are ordinary issue prose. A body with an unclosed Markdown
  fence is rejected before preview, because an appended marker would remain unreadable inside that
  fence. Explicit secret forms include AWS access-key fields, refresh tokens, private-key blocks,
  client/session credentials, Authorization Bearer/token/Basic values, and common environment
  identifiers such as `GH_TOKEN`, `NPM_TOKEN`, `DATABASE_PASSWORD`, `*_SECRET`, and `*_API_KEY`.
  Quoted values, equals assignments, indented credential blocks, and single-token colon values are
  high-confidence and fully redacted. Sentence-like prose such as `Password: require …`,
  `Secret: do not log …`, or `Token: support …` remains unchanged; other multiword colon forms are
  ambiguous and fail closed with a value-free diagnostic instead of silently deleting specification
  semantics.

Canonical decomposition state uses these dependency-free local helper operations:

- `decomposition-records-build` accepts a nonempty exact record array with
  `key`, `title`, `workflow`, `body`, `status`, and `issue`, plus the artifact language, target,
  resolved target binding, and parent. It sanitizes publishable title/body text, requires exactly
  one language-matching Recommended-workflow field equal to the record workflow, validates the
  `proposed|approved|created|missing|declined` status/issue combination, enforces unique keys and
  target-aware created issue identities, binds each exact draft with a SHA-256 `draftHash`, and
  returns one complete canonical v2 section. Insert that returned section verbatim; never handwrite
  a record marker or its visible rendering.
- `decomposition-records-parse` accepts the fresh stored parent-comment body and validates those
  v2 boundaries, safe-encoded full records, target binding, exact schema, body workflow, recomputed
  hash, and byte-for-byte visible rendering. Quoted and fenced examples are ignored. A changed
  visible title/body, encoded record, status, identity, or rendering fails closed. It reports
  whether records were found and whether any active (`proposed|approved|created|missing`) record
  keeps the issue a decomposition container.
- `decomposition-container-compare` combines that fresh comment body with the fresh normalized
  native children. It reports `containerOnly: true` for an active canonical decomposition even when
  the child list is empty, and returns safe discrepancy codes for incomplete, missing, duplicated,
  invalid-marker, detached, mismatched, or unexpected children.
- `decomposition-key-build` is the single canonical writer of the stable-key marker for both
  targets. It accepts `target`, the target-aware `parent`, the resolved forge `repository` binding
  when the parent is a URL, and the stable lowercase `key`, either flat or under `decomposition`.
  Without a `body` it returns `{ marker }`. With a `body` it first runs the same child-text
  sanitization the forge child payload applies — generation attribution is rejected and credential
  material is redacted — and then rejects an unclosed Markdown fence, a body that already carries a
  marker, and an appended marker it cannot read back, before returning
  `{ marker, body, parent, key }` with the marker as the final nonblank standalone line. Never
  handwrite that marker or concatenate it by hand: the four guards live only here. Fail-closed
  codes are `INVALID_PAYLOAD` for generation attribution in the body, an empty or whitespace-only
  body, credential material that cannot be safely redacted (`reason: unterminated-private-key`,
  `unterminated-quoted-secret`, `ambiguous-empty-secret-assignment`, `empty-secret-assignment`,
  `ambiguous-secret-assignment`, `ambiguous-colon-credential-assignment`,
  `residual-secret-assignment`, or `residual-private-key`), an unclosed fence
  (`reason: unclosed-markdown-fence`), a caller-supplied marker, an unreadable appended marker
  (`reason: unreadable-appended-decomposition-marker`), an unknown target, or an invalid key, and
  `INVALID_REFERENCE` for a parent that is not a valid identity of that target.
- `decomposition-key-parse` accepts the fresh stored child body plus the expected `target` and
  `parent` (flat or under `context`). It reports `{ found: false, key: null }` for an absent marker
  and `{ found: true, version, target, parent, key }` otherwise, with both parents normalized
  through the same target-aware rule the writer uses, so `42`, `'42'`, `'#42'`, and a
  repository-bound issue URL all compare equal while an external identity compares byte for byte.
  It fails closed with `AMBIGUOUS_TARGET` for more than one marker and `INVALID_PAYLOAD` for a
  marker that is not the final nonblank standalone line, an unsupported version (`version`,
  `supported`), a malformed or undecodable payload, an invalid schema, a target mismatch
  (`expectedTarget`, `actualTarget`), or a different parent (`expectedParent`, `actualParent`).
- `decomposition-child-workflow-parse` requires exactly one language-matching canonical
  Recommended-workflow field in a decomposed child's body, validates it against the parent record,
  and returns the stable workflow plus its `build|fix|refactor|docs` implementation route. It uses
  the Markdown inventory: blockquoted and fenced examples do not count, so an example-only body is
  rejected while one top-level field plus examples is accepted.

For a decomposition bound to GitHub, `decomposition-records-build` enforces the 65,536-byte UTF-8
comment ceiling on the generated section, and `planning-comment-build` enforces it again on the
complete stamped planning comment. The structured error reports `maximum`, `actual`, the unit, the
section/other-comment split, and per-record title/body/encoded-record contributions. This limit is
not applied to ordinary non-decomposition legacy planning comments; another provider may still
reject a smaller target-specific limit, which remains a fail-closed persistence error.

Forge identities are normalized only through the resolved host/repository and `parseReference`;
a URL from another host or repository never aliases `#N`. External tool-native identifiers and
URLs remain exact strings and are never collapsed by their trailing number. These operations are
local validation and reconciliation, not provider transport. Callers never parse marker data or
infer proposal identity from titles themselves. `planning-comment-build` also validates every
decomposition-bearing comment so a caller cannot bypass the canonical parser before persistence.

Both operations are provider-neutral at the workflow boundary. On GitHub, the helper maps child
reads to the paginated native sub-issues endpoint and creation to the provider's atomic
parent-aware create capability with the verified parent identity. The helper probes that create
capability before the first create preview or write. On Forgejo, both capabilities are false and the create operation returns
`UNSUPPORTED_CAPABILITY` before any write until a verified native operation exists. The helper
never routes `issue-sub-issue-create` through `issue-create`, never creates first and links later,
and never fabricates a checklist relation.

The normal mutation discipline applies: preview the exact redacted command and publishable child
payload, obtain the owning workflow's approval, then apply the identical operation. A command
failure during `issue-sub-issue-create`, or a successful command without a parseable same-repository
child URL, reports `mutationMayHaveSucceeded: true` and is non-retryable. The caller must read
`issue-sub-issues-read` fresh and reconcile the stable key before any later attempt. Zero matches
does not authorize a blind retry after an unknown outcome; one unique match recovers it; multiple
matches fail closed as ambiguous.

The targeted issue-comment update operation is `issue-comment-update`. Its input contains the
issue number, the positive `commentId` returned by `issue-comments-read`, the freshly computed
`expectedBodyHash` of that exact comment body, and `payload.body`. It is a mutation and therefore
uses the normal dry-run-first envelope. On apply, the helper reads the issue comments again,
requires exactly one matching comment ID, and compares its body hash before writing. A missing,
ambiguous, or changed comment fails with `TARGET_NOT_FOUND`, `AMBIGUOUS_TARGET`, or `STALE_WRITE`;
the caller must not fall back to `issue-comment` and create a competing comment.

Provider mapping for `issue-comment-update` is fixed and owned by the helper:

- GitHub: `PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}`.
- Forgejo: `PATCH /repos/{owner}/{repo}/issues/{index}/comments/{id}`; Forgejo currently ignores
  `index`, but the adapter still supplies the freshly resolved issue number.

Both send a JSON object with the validated, attribution-free `body`. If probing reports that the
provider or installed CLI cannot execute this API operation, abort with `UNSUPPORTED_CAPABILITY`
before a write; never append a replacement planning comment.

Body writes, including `issue-comment-update`, require `expectedBodyHash` from the immediately
preceding fresh read. Preview the exact patch and command in dry-run mode, then apply with the same
payload. Zero or multiple semantic matches are structured errors; unchanged state is successful
and idempotent. The helper exposes whether provider-level conditional writes are available; the
expected-body precondition is mandatory regardless. GitHub returns the read ETag for diagnostics
but documents unsafe-method conditional requests as unsupported for these endpoints, so the
adapter reports the write as non-atomic instead of sending a misleading `If-Match` header. The
fresh read therefore detects sequential re-entry and the per-draft child reads detect duplicates,
but neither is a cross-process lease: two simultaneous writers can still race between the final
read and PATCH/create. Fail closed on every duplicate observed before or after an uncertain result;
do not claim the client-side hash guard closes that provider TOCTOU window.

Legacy-label transitions use the helper's add and remove operations in that order. The one-time `sf-` migration returns its completion marker only after every step succeeds; a partial failure reports completed steps and keeps the marker pending. Cleanup of recognized `firmo-` aliases uses the same add-before-remove operations without changing that one-time marker contract.

### Error and edge cases

- **Missing/unauthenticated CLI:** abort clearly, give a remediation hint, leave no partial state; no silent fallback to `local`.
- **No Git repository / no `origin` remote:** remote mode not possible; report.
- **Ambiguous host:** use `remoteToolOverride` or a per-run hint; if both are unclear, ask the user.
- **Argument type contradicts `tracker.mode`:** The argument type overrides the config mode for this run (see "Determine mode").
- **External target:** connection discovery, its four fail-closed failure classes (missing tool identifier, no connection, ambiguous connection, missing capability) and the write discipline live in the loaded "Tracker target" fragment. There is no fallback to the forge or to `local`.

This tool deliberately carries **no** deferred `tracker-target` pointer, unlike every other source
that embeds the fragment above. It resolves the tracker target only to decide whether its
`firmo-` label class runs at all, performs no tracker write of any kind, and skips that class
entirely on an external target. Loading the external contract would therefore be pure context
cost. Any tracker write added here must load the contract first.

## Project conventions

If the project has an `AGENTS.md`, read it before cleaning up and follow its guidance on file formats, configuration, and project-wide conventions.

## Hard scope boundary

- **Only the current project.** This skill does **not** touch any global skill installation (e.g. `~/.claude/skills/effective-flow` or `~/.claude/skills/firmo`, `firmo-*`/`effective-flow-*` agents). Removing old installed skills/agents is done by the deploy scripts, not this tool.
- **Never delete the new.** The active runtime directory `.effective-flow/` itself, its current
  runtime state, and the project setup ADR are never deleted. The recognized legacy
  `config.json` exception remains governed by the legacy classes below. The only current
  runtime-state deletion allowed is the exact lifecycle record owned by a successfully
  reconciled cleanup claim; no other active runtime file is a cleanup target.
- **Never target the main or current execution worktree.** `RUNTIME_STATE_ROOT` and the worktree
  from which cleanup is running are never removal candidates. A linked current execution
  worktree still appears in the final retained-worktree report.
- **No auto-commit.** The skill at most stages `git rm` changes and removes untracked files physically; it does not commit. Committing is done by the user or `effective-flow commit`.
- **No backup.** For artifacts that are not git-recoverable, no backup directory is deliberately created; the safety net is the explicit confirmation.
- **Do not write config.** This skill does not itself write carried-over config values into the project setup ADR — `effective-flow setup` is responsible for that (see Phase 3).
- **Do not edit `.gitignore`.** Inventory and report outdated entries, then route normalization
  to `effective-flow setup`, the sole repair owner.
- **Delete only with consent.** Every deletion happens only after a dry run and explicit confirmation.

## Legacy classes

The skill knows exactly these four classes of migration remnants, each with its new counterpart:

| Class                       | Legacy remnant                                                                                                                                 | New counterpart                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Runtime directories         | `.firmo/`, `.sf-plugin/` (deliberately left after migration)                                                                                   | `.effective-flow/`                              |
| Legacy `config.json`        | untracked `.firmo/config.json` or a legacy `config.json` in a runtime directory                                                                | project setup ADR (see `effective-flow setup`)       |
| Legacy `.gitignore` entries | outdated ignore lines for `.firmo/`/`.sf-plugin/` or the old two-line pattern `.effective-flow/*` + `!.effective-flow/config.json`             | the single line `.effective-flow/`              |
| `firmo-` labels             | `firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`-refactor`/`-build`/`-docs`, `firmo-issue-done`, `firmo-needs-planning` on the issue | the `effective-flow-` variant on the same issue |

`sf-` labels are **not** a standalone target: they are already moved to `effective-flow-` by the one-time `sf-` label migration (see "Label convention" in `issue-tracker.md`). This skill only clears up remaining `firmo-` labels.

Linked worktrees are a separate cleanup class, not a fifth migration remnant. Existing
worktrees are never treated as legacy merely because they predate lifecycle recording.

## Workflow

### Phase 1: Discovery / inventory

1. If this is a Git repository, issue and verify an execution-location receipt for the cleanup
   checkout and retain the verified main checkout as `RUNTIME_STATE_ROOT`. Inventory worktrees
   with `git worktree list --porcelain -z`, parsing NUL-delimited fields and records rather than
   human-formatted lines. The first record is the main worktree: validate it as the runtime root,
   exclude it as a removal target, and omit it only from the final retained-linked-worktree list.
   If Git or worktree support is unavailable, skip worktree removal, report the reason, and
   continue the migration inventory where possible.
2. Before reading lifecycle state, load and apply the runtime-root portion of “Runtime-state
   write safety”. Read schema-valid records only from the canonical absolute
   `<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/` handle. Match records to Git entries by
   canonical repository identity, path, checkout identity, and receipt owner/purpose. Treat the
   immutable `creationOid` as branch-history evidence: it must resolve as a commit and remain an
   ancestor of the current recorded branch tip, not equal current `HEAD`; path shape and branch
   prefix are never sufficient.
3. Classify every linked worktree other than the main worktree into exactly one preliminary
   result:
   - **removal candidate** only when every shared lifecycle eligibility proof passes and status
     is `cleanup-ready` or `cleanup-failed`;
   - **retained** with the first concrete failed proof, including current cleanup execution,
     `active`, `aborted`, `failed`, `cleanup-in-progress`, dirty, locked, prunable, missing,
     mismatched, foreign/harness-managed, unknown or invalid schema, or recordless state;
   - **not reliably checkable** when repository, path, runtime-state, or receipt evidence cannot
     be read safely; this is retained, never silently skipped.
4. Capture the existing legacy remnants in the project root:
   - **Runtime directories:** do `.firmo/` and/or `.sf-plugin/` exist?
   - **Legacy `config.json`:** does `.firmo/config.json`, `.sf-plugin/config.json`, or a `config.json` recognizable as outdated in `.effective-flow/` (transitional fallback whose values belong in the ADR) exist?
   - **`.gitignore`:** does it contain outdated lines for `.firmo/`/`.sf-plugin/` or the old two-line pattern?
   - **`firmo-` labels:** forge history, and therefore only on the forge target with an authenticated CLI (see "Remote helper contract" in `issue-tracker.md`) — list issues with `firmo-` labels separately per prefix. If the forge target, a Git repository, `origin`, or an authenticated CLI is missing, skip this class and report that briefly. On an external target this class is skipped entirely and reported as skipped: `firmo-` recognition and the one-time `sf-` migration are never run, emulated, or recorded against an external tool. Because that skip needs no tracker access, this tool requires no external-target contract.
5. If at least one legacy runtime directory exists, read
   `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` without mutation and inspect
   `runtimeMigration.directory.version`. When the valid version `1` marker is missing, treat the
   discovered legacy directory as the authorization for cleanup's first runtime write:
   - freshly revalidate the execution-location receipt and `RUNTIME_STATE_ROOT`, then apply
     “Runtime-state write safety” from that root;
   - invoke the loaded shared runtime-directory migration prerequisite exactly as written,
     without a separate carry-over confirmation and without reimplementing its inventory, copy,
     memory-merge, locking, or marker logic;
   - if any guard, source inventory, copy, memory validation, lock, or marker write fails, keep
     every legacy directory, do not offer any runtime directory for deletion, report the exact
     failure and safe retry through `effective-flow cleanup` (or the required ignore/index repair
     through `effective-flow setup`), and continue only independent inventory/reporting;
   - after success, repeat the legacy-runtime, counterpart, legacy-config, and nested-worktree
     inventory from fresh filesystem and Git evidence before making any carry-over or deletion
     decision.
     Do not invoke the prerequisite when no legacy runtime directory exists: such a cleanup run
     creates no runtime footprint merely to record a marker.
6. Treat the migration marker as proof only for the source selected by the shared precedence
   rule (`.firmo/`, otherwise `.sf-plugin/`). If `.firmo/` and `.sf-plugin/` both exist, inventory
   the unselected `.sf-plugin/` separately; the marker does not certify its carry-over and never
   releases it for deletion.
7. For each existing legacy remnant, determine whether its **new counterpart** exists (`.effective-flow/`, project setup ADR, or `effective-flow-` labels).
8. Give the user a compact inventory (class → artifacts found → whether a new counterpart exists)
   plus worktree counts by removal candidate, retained, and not reliably checkable. Do not end
   merely because no migration remnant exists; worktree preview and the final report still run.

### Phase 2: Carry-over check (read + compare)

Read the legacy remnants and determine whether anything still needs to be carried over before deleting:

- **Runtime directories:** For the source selected by the shared migration, verify the freshly
  written marker and compare any divergent or newer entries that the no-clobber migration
  deliberately left in place. If both legacy directories exist, compare the unselected
  `.sf-plugin/` independently against `.effective-flow/`; missing or divergent entries remain
  explicit carry-over/discard decisions because the selected source's marker proves nothing
  about them. Never treat legacy `.worktrees/` as a file carry-over candidate.
- **Legacy `config.json`:** Parse it. If it is not valid JSON, it is **not** a carry-over source: report the path and error and treat the file only as a deletion candidate (after confirmation). For valid JSON, compare each set value with the project setup ADR; values not represented there are carry-over candidates.
- **`.gitignore`/labels:** no file carry-over. For labels, the add-before-remove step in Phase 5 applies.

### Phase 3: Confirm and perform carry-over

The shared prerequisite has already carried over missing entries from its selected source
non-destructively. Present only the remaining divergent entries and any entries from an
unselected simultaneous legacy directory to the user, grouped by source, and obtain a decision
per group. Carry over only explicitly confirmed candidates.

If there are runtime file candidates that are missing in `.effective-flow/` or differ: Ask the user: **Which files from the old runtime directory should be carried over to `.effective-flow/` before it is deleted?**
- Carry over all -- Copy every listed file to .effective-flow/ (do not overwrite existing files in the target)
- Select individually -- Decide per file which is carried over and which is discarded
- Carry over nothing -- Carry over no file — the entire old content is released for deletion

- **Runtime files:** If a copy needs a missing directory below `.effective-flow/`, apply
  “Runtime-state write safety” to that exact directory immediately before its `mkdir`; repeat
  this for every missing parent created. Immediately before each confirmed copy, apply the guard
  again to the concrete file target. Copy only after it passes (do not move); do **not** overwrite
  a file already present in the target. A block preserves both source and target and directs the
  user to `effective-flow setup`. Rejected items remain deletion candidates.
- **Config values:** Do **not** write differing values into the ADR yourself. Disclose them and refer to `effective-flow setup` for the carry-over. Output the affected keys concretely so the user can confirm them in `effective-flow setup`. Only once the values are in the ADR or the user explicitly discards them is the legacy `config.json` considered free of carry-over and thus deletable.
- **Labels:** no file carry-over; the carry-over happens in Phase 5 as add-`effective-flow-`-before-remove-`firmo-`.

### Phase 4: Dry-run preview

Before any deletion, list exactly what will be removed — **without** deleting yet:

1. Per artifact: path or label and the class.
2. Per file/directory, the Git status: **tracked**, **untracked**, or **gitignored**. Tracked ones are recoverable via the Git history; untracked/gitignored artifacts (`.effective-flow/`, `.firmo/`, `.sf-plugin/` are gitignored) are **not** recoverable via Git.
3. Warn on a dirty working tree and recommend committing/stashing first, so that a `git rm` staging is clean.
4. For each legacy runtime directory, demonstrate from the refreshed inventory that its new
   counterpart exists and its own carry-over is complete or deliberately discarded. A valid
   marker may certify only the preferred source selected by the shared migration. If migration
   failed, the counterpart or marker is missing, or the directory was the unselected simultaneous
   source, do **not** offer it for deletion; report the concrete missing proof and the safe retry
   through `effective-flow cleanup` or repair through `effective-flow setup`.
5. **Couple nested classes:** A legacy `config.json` lies physically **inside** a runtime directory (e.g. `.firmo/config.json` in `.firmo/`). Do **not** offer the containing runtime directory (class "Runtime directories") for deletion while the contained legacy `config.json` (class "Legacy `config.json`") still has open carry-over — otherwise deleting the directory would take the not-yet-carried-over `config.json` with it. Only once its values are in the ADR or explicitly discarded is the containing directory also considered deletable.
6. **Couple legacy worktrees:** Before offering a legacy runtime directory for deletion, compare
   its canonical `<legacy-directory>/.worktrees/` tree with the fresh complete Git worktree
   inventory. If any registered linked worktree is current, active, retained, not reliably
   checkable, or otherwise still rooted below that tree, keep the containing legacy runtime
   directory. Worktree removal remains exclusively governed by the lifecycle
   claim/remove/reconcile protocol; deleting the containing directory is never a substitute.
7. Show verified worktree candidates as their own artifact class. For each candidate list path,
   checkout identity, lifecycle status, owner workflow/purpose, branch policy, and the successful
   receipt, registration, unlocked/non-prunable, clean-state, and non-current-worktree proofs.
   State that eligibility will be checked again under an exclusive record lock immediately
   before removal.
8. List preliminary retained and not-reliably-checkable worktrees separately with their concrete
   reason. They are not offered for confirmation. In particular, never offer the main worktree,
   current cleanup execution worktree, a worktree with `active`, `aborted`, `failed`, or
   `cleanup-in-progress` status, or a worktree without a valid matching lifecycle record.
9. Explain that worktree removal uses only `git worktree remove <path>` without force. For
   `apply-review` records, a proven integrated temporary branch may subsequently use
   `git branch -d`; delivery and partial-diff branches remain. Cleanup never runs
   `git worktree prune` or `git branch -D`.
10. If there are no deletable migration artifacts and no worktree removal candidates, call the
    action set a no-op, but continue to Phase 6 so the mandatory retained-worktree report is
    still produced.

### Phase 5: Confirm deletion and execute git-aware

Obtain confirmation **per artifact class** and only then execute the deletion.

If there is at least one deletable legacy remnant: Ask the user: **Remove the legacy remnants listed above now? Tracked files via `git rm` (recoverable via the history); untracked/gitignored directories are removed physically and irreversibly.**
- Yes, remove as listed -- Tracked via git rm (staged, no commit); untracked/gitignored deleted physically; firmo labels detached from the issue
- Remove tracked only -- Only the git-recoverable, tracked artifacts via git rm; keep untracked directories and labels for now
- Cancel -- Delete nothing; the inventory remains

If there is at least one verified worktree removal candidate: Ask the user: **Remove the verified Effective Flow worktrees listed in the dry run now, after checking every proof again under its lifecycle lock?**
- Remove all verified -- Revalidate and remove every still-eligible listed worktree with ordinary git worktree remove
- Select individually -- Choose which listed worktrees may be revalidated and removed
- Keep all -- Remove no worktree; list every one in the final retained-worktree report

Execute per class:

- **Tracked files:** remove via `git rm` (staged, **no** commit). For untracked/gitignored, `git rm` does not apply.
- **Untracked/gitignored directories** (`.firmo/`, `.sf-plugin/`, a gitignored legacy
  `config.json`): immediately before removal, refresh the migration/carry-over evidence and Git
  worktree inventory. Remove physically only when no registered linked worktree remains below
  the directory's `.worktrees/` tree and only after the explicit “irreversible” confirmation
  above, without a backup.
- **`.gitignore`:** leave every line untouched. Report the exact outdated entries and route the
  user to `effective-flow setup`, the sole owner of normalization and repair.
- **`firmo-` labels:** only on the forge target with a successful helper probe; skipped on an external target. Build the full normalized label transitions through the remote helper: first add `effective-flow-<x>` on the issue, **then** detach `firmo-<x>` (add-new before remove-old, so an abort leaves no issue unclassified). The label **definition** in the tracker remains. Inspect the dry-run steps before applying; if a step fails, report the completed steps and preserve the still-classified issue.

For each explicitly selected worktree candidate, independently execute the shared lifecycle
claim/remove/reconcile protocol:

1. Revalidate the cleanup execution receipt and `RUNTIME_STATE_ROOT`, apply runtime-state safety
   to the exact lock and record handles, and atomically acquire the per-record lock. If the lock
   exists, retain the worktree and report its readable owner/timestamp; never break it.
2. Under the lock, freshly reread the record, receipt, `git worktree list --porcelain -z`, exact
   branch, common directory, `locked`/`prunable` attributes, path, clean status including
   untracked files and submodules, and main/current-worktree exclusions. Require `creationOid` to
   resolve as a commit and run
   `git merge-base --is-ancestor <CREATION_OID> <CURRENT_BRANCH_TIP>`: only exit `0` passes; exit
   `1`, every other code, and command errors block. Current `HEAD` and Git registration must still
   name the recorded branch, but later commits are valid and no moving remote tip is compared.
   Drift makes this candidate retained without affecting another candidate.
3. Only from `cleanup-ready` or `cleanup-failed`, atomically write `cleanup-in-progress` with this
   cleanup run's unique ID and claim timestamp. Keep the lock through the Git operation and
   reconciliation.
4. Run exactly `git worktree remove <WORKTREE_PATH>`. On refusal, persist `cleanup-failed` with
   the exact error, clear this run's claim fields, release only its own lock, and continue with
   independently valid candidates.
5. After success, prove that the worktree registration and path are gone and reread the claimed
   record. Preserve `retain` branches. For `delete-after-integration`, reconfirm the recorded
   integration proof and use only `git branch -d <BRANCH_NAME>`; if safe deletion is refused,
   retain the branch and lifecycle record and report partial cleanup.
6. Delete only this run's lifecycle record after every required postcondition is proven, then
   release only its own lock. A failure after worktree removal is partial cleanup, not success.
   Never reconstruct the worktree or take over a foreign/orphaned claim to complete it.

If the claimed worktree is already removed or no longer registered before record or branch
post-processing finishes, reconcile only while this run still owns the matching lock and claim.
Otherwise retain the lifecycle evidence and report manual reconciliation.

On a migration-cleanup error (e.g. `git rm` fails or the tracker is unreachable), abort that
dependent migration sequence in a controlled manner: report the partial state and delete nothing
whose new counterpart is not secured. A worktree error affects only that independently claimed
candidate and is reported as retained, failed, or partial cleanup.

### Phase 6: Completion

The completion report is mandatory even when no migration remnant or worktree candidate exists.
For a linked current execution checkout, use the explicit reason “Cleanup is running in this
worktree.”

Report to the user:

- what was carried over (files to `.effective-flow/`) and which config values `effective-flow setup` owns
- what was deleted, separated into tracked (via `git rm`, staged) and physically removed
- which outdated `.gitignore` lines remain and that `effective-flow setup` owns their repair, not this run
- which `firmo-` labels were detached from how many issues (or that the label class was skipped)
- worktrees removed successfully, with their checkout identities and retained/deleted branch
  outcomes
- failed removal attempts and partial cleanup, including exact record, lock, branch, or command
  state that remains
- every remaining linked worktree other than the main worktree, one entry per worktree, with a
  path relative to the project root when internal (otherwise canonical absolute), checkout
  identity, lifecycle status and verification status, one concrete retention reason, and one
  safe next step
- unmatched lifecycle records whose worktree is absent or mismatched, separately from linked
  worktrees, so interrupted post-removal state remains visible
- an explicit statement when no linked worktrees remain
- what else deliberately remains and why
- that **no** commit was created and which removals are staged

Then emit the next-step block per `next-steps` as the last element of the report: the staged-removals
row when this run staged deletions, the configuration row when it only referred config values on. A
report that found neither matches no row and emits nothing.

## Rules

- Never delete without a dry run and explicit confirmation.
- Do not delete any artifact before its new counterpart exists and the carry-over is complete or deliberately discarded.
- Do not delete a runtime directory while it contains a legacy `config.json` with open carry-over; only after carry-over into the ADR or deliberate discard is it deletable.
- Do not delete a runtime directory while a registered current, active, retained, or otherwise
  unresolved linked worktree remains below its `.worktrees/` tree.
- A migration marker certifies only the one source selected by the shared precedence rule; never
  use it as deletion proof for an unselected simultaneous legacy directory.
- Preserve the active `.effective-flow/` directory and all unrelated runtime state. Mutate below
  it only for the explicitly confirmed legacy carry-over/migration operations above or for the
  exact lifecycle record, temporary record, and owned lock handles authorized by the shared
  worktree-lifecycle contract, always through runtime-state safety. Do not mutate the project
  setup ADR or a global skill installation.
- Do not create commits or backup directories.
- Do not write config yourself; config carry-over runs through `effective-flow setup`.
- Never edit `.gitignore`; inventory and report outdated entries and route repair to
  `effective-flow setup`.
- For label cleanup, first add `effective-flow-`, then detach `firmo-` from the issue; the label definition remains.
- Never classify a worktree from age, last-modified time, base-directory shape, branch prefix, or
  apparent emptiness. There is no TTL, heartbeat, stale-after threshold, or automatic crash
  inference.
- Never remove a worktree without a valid Effective Flow lifecycle record, dry-run listing,
  explicit confirmation, fresh eligibility proof, per-record lock, and exclusive
  `cleanup-in-progress` claim.
- Use only ordinary `git worktree remove <path>` and, for a proven integrated temporary branch,
  `git branch -d`. Never use `--force`, `git worktree prune`, or `git branch -D`.
- If no legacy remnant is present, continue through worktree inventory and completion reporting.
  A no-op means that neither a migration action nor an eligible confirmed worktree removal ran.
- Output project-internal paths relative to the project root and external worktree paths in
  canonical absolute form.
