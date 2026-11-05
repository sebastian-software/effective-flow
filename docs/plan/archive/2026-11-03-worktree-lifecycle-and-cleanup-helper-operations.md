# Worktree lifecycle and cleanup helper operations

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

This plan delivers work package 4, "Worktree lifecycle and cleanup (stage 2)", of
`docs/concept/2026-10-29-runtime-state-cli.md`. The runtime-state helper `effective-flow-state.mjs`
takes over the following work, which the model so far replays in prose:

- worktree-run records and their per-record locks
- the nine eligibility conditions with claim-remove-reconcile
- non-force worktree removal
- removal of the closed legacy list, including the legacy directories that work package 3's
  migration preserves

`cleanup` apply is bound to the digest of its dry run.

Today the rules live in prose fragments that the model replays as shell commands:

- `src/shared/worktree-lifecycle.md`, `src/shared/worktree-integration.md`,
  `src/shared/worktree-record-obligation.md` and `src/tools/cleanup.md`
- every host that writes records itself

The stage 0 baseline (`docs/developer-guide/claude-code-allowlist-evidence.md`, "Baseline")
measured:

- 5–7 permission prompts per default-mode `cleanup` run, 2–3 of them housekeeping
- one auto-mode refusal in three runs, from the classifier blocking a compound command
  (lock + guard + removal)

Done when, per the concept:

- the lifecycle tests cover every transition and eligibility condition
- the `cleanup` measurement meets the concept's success criterion
- no prose `rm` remains for runtime state or the legacy list

**Workflow rationale:** Feature. This plan adds new shipped helper operations and new guard
classes, and it changes the record and cleanup contracts of every workflow that creates a
worktree.

## Outcome checkpoint

**Primary source:** `docs/concept/2026-10-29-runtime-state-cli.md`, work package 4 (repository
`sebastian-software/effective-flow`, base `origin/develop`).
**Original outcome:**

- `cleanup` runs cause no permission prompt and no auto-mode refusal for housekeeping, and at most
  one harness prompt for the destructive apply the user confirmed. This is measured.
- Delivery cleanup costs at most one harness prompt per integration (one `worktree remove` call
  for all records of a session). Evidence for this is indicative, not part of the pass condition.
- The lifecycle rules are enforced in code.
- The concept's safety boundaries stay intact: non-force worktree removal only, worktree locks
  never broken, the exact-name legacy list, `git worktree add` in prose.

**Last evaluated attempt:** none.
**No-progress count:** 0
**Cumulative approach:** Work packages 1, 2, 3, 5 and 9 are delivered (#597, #599, #600, #598,
#601). Work package 8 is delivered (#601) with its measurement recorded as blocked
(`claude-code-allowlist-evidence.md`, "Work package 8 measurement"). This plan builds on the guard,
lock, memory-migration and allow-rule cores of work packages 2 and 3. Work packages 6 and 7 stay
open.
**Continuation decision:** User decisions of 2026-11-03:

- A component branch may be force-deleted only inside the `apply-review` run, after an exact
  patch-id proof against a target the helper derives itself.
- `worktree remove` takes a list of records.
- The transitional config file gets an exact-name guard class.
- Eval re-recording is debt due before the release after 1.71.0.
- Squash-merged delivery branches are handled in a separate follow-up issue.

## Architecture decisions

- **New sibling core `src/scripts/effective-flow-state-worktree-core.mjs`.** It follows the memory,
  commit and review cores. `effective-flow-state-core.mjs` registers its operations in four places:
  - `STATE_OPERATIONS`
  - `STATE_OPERATION_CLASSES`
  - `OPERATION_KEYS`
  - the lazy handler map

  The CLI keeps its two-token argv shape and its envelope and exit-code contract.

- **The helper derives every trusted fact itself.** The concept treats all input as untrusted model
  output, so the record's identity fields are compared against these facts and never trusted as
  input:
  - the repository identity, `RUNTIME_STATE_ROOT` and the main worktree, from `cwd` through
    `resolveRuntimeRoot` and `git rev-parse --git-common-dir`
  - the execution root, from an explicit `executionRoot` input verified against the porcelain
    worktree list
  - base directories, by importing `config-resolve-core.mjs`
  - registration, branch, tip and status, from Git
- **Operations and closed key sets.** Every operation also takes `cwd`.

  | Operation              | Class                          | Keys                                                                                                                               |
  | ---------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
  | `worktree record-init` | allowlisted                    | `executionRoot`, `record` (the complete v1 record)                                                                                 |
  | `worktree transition`  | allowlisted                    | `executionRoot`, `recordId`, `from`, `to`, `reason`, `sessionId`, `branch`, `workflow`, `fetchedHeadOid` (adoption only)           |
  | `worktree inspect`     | allowlisted                    | `executionRoot`, `sessionId` (optional; all sessions when absent)                                                                  |
  | `cleanup plan`         | allowlisted                    | `executionRoot`, `decisions` (carry-over decisions, see below)                                                                     |
  | `worktree remove`      | destructive, never allowlisted | `executionRoot`, `sessionId`, `recordIds` (one or more records of that session), `integrationRoot` (optional, `apply-review` only) |
  | `cleanup apply`        | destructive, never allowlisted | `executionRoot`, `decisions`, `items` (map of selected `itemId` to `itemDigest`)                                                   |

  `sessionId` is an ownership check: the record's `sessionId` must equal it for every transition
  out of `active` and for removing an `active` record. On adoption it is the new owner, and for
  `build` it is the build-run ID (`build-run-contract.md:40`). Both destructive operations get their
  own command prefixes and are listed in `NEVER_ALLOWLISTED_OPERATIONS`.

- **`worktree record-init`** creates an `active` record and writes it no-clobber. It checks:
  - the v1 schema with its exact key set
  - that the branch tip equals `creationOid`
  - that no record or lock with this `recordId` exists
  - that the worktree is newly registered: a linked, unlocked, non-prunable worktree in
    `git worktree list --porcelain -z`, named by no existing record, with `HEAD` on the recorded
    branch at `creationOid`, and at the path the purpose requires:

    | `purpose`                  | Required `worktreePath`                                                                                                       | Branch policy                                                 |
    | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
    | `delivery`, `partial-diff` | exactly `BASE/REPO/SESSION`, `BASE` from `worktree.baseDir`                                                                   | `retain`                                                      |
    | `plan-publication`         | exactly `BASE/REPO/SESSION-plan-publication` (`plan-publication.md:235`)                                                      | `retain`                                                      |
    | `apply-review`             | a direct child of `BASE/REPO/SESSION`, `BASE` from `applyReview.worktree.baseDir` (`apply-review-commit-mechanics.md:99-103`) | `delete-after-integration`; branch `apply-review/<SESSION>/…` |

    Any other combination of policy, purpose or branch is refused.
- **`worktree transition`** runs under the record lock. It accepts exactly these transitions:
  - `active` → `cleanup-ready` | `aborted` | `failed`.
  - `aborted` | `failed` → `active`: the adoption of `plan-pr-continuation.md:242-260`. Adoption
    requires all of these proofs:
    - purpose `delivery`
    - a matching repository and runtime root
    - `branch` and `workflow` equal to the record's
    - `creationOid` equal to `fetchedHeadOid` and an ancestor of the tip (condition 6)
    - a clean status

    It rewrites `sessionId`.

  `reason` must be `null` for `active` and `cleanup-ready`, and a non-empty string for `aborted`,
  `failed` and `cleanup-failed` (`build-run-core.mjs:1719-1727`). A `from` mismatch is an outcome
  and writes nothing.

- **`worktree inspect`** is read-only. It returns records, each with all failed eligibility
  conditions, plus registered worktrees under a session path that no record names.
- **`worktree remove`** runs claim-remove-reconcile for each listed record of one session. That
  costs one harness prompt per integration, not one per component.
  - An `active` record is moved `active` → `cleanup-ready` → claimed → removed under **one** lock
    hold, as `worktree-integration.md:437-443` and `worktree-lifecycle.md:99` require.
  - A `cleanup-ready` or `cleanup-failed` record is claimed directly.
  - If the harness denies the call, or auto mode refuses it, each host's outcome table falls back
    to the allowlisted `worktree transition active → cleanup-ready` with a `null` reason. A later
    `cleanup` then collects the worktree, and the exit self-check does not misclassify completed
    work as `failed`.
- **Branch policy `delete-after-integration`.** Force deletion is allowed only inside the
  `apply-review` run (user decision, 2026-11-03).
  1. After the worktree is removed, run `git branch -d`.
  2. If Git refuses, and the call carries `integrationRoot`, the helper runs the integration proof.
     It derives the target itself: the branch checked out in the porcelain-registered worktree at
     `integrationRoot`. That branch must not be the component branch, nor a branch of any record
     in the call. The proof:
     - Resolve `targetOid` and `branchOid`, and `mergeBase = git merge-base targetOid branchOid`.
     - Refuse if `git rev-list --merges mergeBase..branchOid` is not empty.
     - Every commit in `mergeBase..branchOid` must have an exact patch-id match in
       `mergeBase..targetOid`, computed with `git patch-id --verbatim`, which keeps whitespace
       exact (user decision, 2026-11-03).
     - An empty range counts as proven only if `git merge-base --is-ancestor branchOid targetOid`
       exits 0.
  3. On a successful proof, check that no porcelain worktree entry checks out the branch, then
     delete it with `git update-ref -d refs/heads/<branch> <branchOid>`. This is a
     compare-and-delete, so a ref that moved after the proof is not deleted.
  4. Without `integrationRoot` (in `cleanup apply`), or when the proof fails: the branch is kept,
     the record is deleted, and the result is `BRANCH_RETAINED` with the branch name and the
     unproven commits. Every host's final report lists them, because no record points at the
     branch any more.

  This narrows the rule "never `-D`" in `worktree-lifecycle.md:191-193`,
  `apply-review-commit-mechanics.md:177-179` and `cleanup.md:277`, `:362-366` and `:438`. `retain`
  branches are never touched.

- **Cleanup items and digest.** `cleanup plan` returns:
  - actionable items, each with a stable `itemId` and its own `itemDigest`
  - blocked items with reasons
  - stale diff baselines, as inventory only

  An `itemDigest` is SHA-256 over a canonical serialization (sorted, stable keys):
  - for a worktree item: `recordId`, `worktreePath`, branch, tip OID and policy
  - for a legacy item: its path, the complete listing below it (relative path, type, size, `dev`,
    `ino`, and SHA-256 for regular files), and the carry-over decisions that apply to it

  `cleanup apply` recomputes only the selected items and refuses with `PREVIEW_MISMATCH` before its
  first write if any `itemDigest` differs. An unrelated session's records therefore never
  invalidate the selection. The `items` map covers "Remove all verified", "Select individually" and
  the per-class answers of the four `cleanup` asks (Carry over, Delete, Worktrees, Baselines).

- **Carry-over is re-derived from fresh evidence, never from the migration result.** The migration
  reports `kept` and `skipped` only once and stores only its marker
  (`effective-flow-state-memory-core.mjs:449-451`, `:700-718`).
  - A regular file below the legacy source counts as carried only if a byte-identical regular file
    exists at the same relative path below `.effective-flow/`.
  - Every missing or differing file, and every non-regular entry, is open.
  - An open entry blocks removal unless `decisions` discards it. Answering "Carry over nothing"
    discards all of them.
  - The decisions are part of the `itemDigest`.
- **The migration marker records its source.** `migrateDirectory` additionally stores
  `runtimeMigration.directory.source` (`.firmo` or `.sf-plugin`). The guard requires the target to
  equal that stored source. A marker without `source` certifies nothing. Otherwise, after
  `.firmo/` is gone, the never-migrated `.sf-plugin/` would count as certified.
- **Guard classes in `src/scripts/runtime-state-guard.mjs`.**
  - **`legacyRuntimeDirectory`.** Removal is allowed only when all of the following hold:
    - the target is an entry of `LEGACY_RUNTIME_DIRS` at the repository root, a real directory
    - `git ls-files` lists nothing below it
    - the marker exists, and its stored `source` equals the target
    - there is no `.git` file or directory anywhere below its `.worktrees/`, registered or not;
      a prunable registration is reported for manual reconciliation
    - no open carry-over remains, after decisions
  - **`legacyConfigFile`** (user decision, 2026-11-03). An exact-name class for a transitional,
    gitignored `.effective-flow/config.json`. The same rule covers a nested legacy `config.json`
    inside a legacy directory. Such a file is removable only when:
    - the `config-resolve` locator resolves at steps 0–2 (`config-resolve-core.mjs:10`, `:95-98`),
      so the file is not the live configuration
    - `decisions` marks it `complete` or `discarded`
  - **The remover** walks bottom-up and unlinks only entries of the digested listing whose type,
    size, `dev` and `ino` still match. Immediately before each `unlink` or `rmdir`, it re-checks
    the chain with `lstat` and `assertDirectoryChain`. A symlink is unlinked and never followed.
    An unlisted or changed entry stops the item with `LEGACY_CHANGED`, and the partial state is
    reported.

  Tracked remnants stay a prose `git rm` (a non-goal of the concept) and yield `LEGACY_TRACKED`.
  `.sf-memory.json` keeps its existing class.

- **Git's own refusal is the last layer.**
  - Only `git worktree remove <path>` without `--force`, after a record match. The helper never
    unlinks a worktree path.
  - Never `git worktree prune`.
- **Time bound.**
  - `cleanup apply` and `worktree remove` have an internal deadline (proposal: 90 s). They start no
    new item after it and report the rest as `DEADLINE_REACHED`.
  - The prose gives both calls an explicit Bash timeout above that bound, following
    `iterate.md:806-807`.
  - Locks and claims are released or reconciled in every path, signals included.
- **Sandbox preflight, for Codex `.git` writes.** Before touching a record, the helper creates and
  removes a probe file in each directory Git writes to:
  - `.git/worktrees/<id>/`
  - `.git/` (for `packed-refs.lock`)
  - `.git/refs/heads/<dir>/` and `.git/logs/refs/heads/<dir>/`
  - the parent of `worktreePath`

  A failure returns `SANDBOX_DENIED` with nothing touched. The prose tells Codex to request
  escalation up front for both destructive calls, as `iterate.md:806` does.

- **Per-record lock inside the worktree core.**
  - The `<RECORD_ID>.lock` directory and its `owner` file keep their format and location, so
    `build-run-core.mjs:1766-1772` and prose-era state stay compatible.
  - No timeout and no break. A foreign or ownerless lock or claim makes the record ineligible
    (condition 9) and is reported.
  - `LOCK_NAMES` stays closed.
- **Record schema v1 is unchanged and exact.** The helper writes and accepts exactly the key set
  that `build-run-core.mjs:112-120` and `:1688-1706` check with `exact()`. A record with unknown or
  missing keys is invalid: `INVALID_STATE`, or "not eligible" (condition 1). It is never repaired
  (`worktree-lifecycle.md:75-78`).
- **Error mapping.** Inside the multi-item operations (`cleanup apply`, `worktree remove`), a guard
  error is a per-item result (`UNSAFE_TARGET`, `LEGACY_CHANGED`) and the remaining items continue.
  The whole call aborts with exit 3 only for root or input errors: `INVALID_ROOT`,
  `INVALID_INPUT`, `RUNTIME_STATE_UNSAFE`, and `PREVIEW_MISMATCH` before the first write.
- **Outcome codes.**
  - New: `RECORD_EXISTS`, `RECORD_NOT_FOUND`, `TRANSITION_INVALID`, `STATUS_MISMATCH`,
    `NOT_ELIGIBLE` (with the failed condition numbers), `LEGACY_TRACKED`, `LEGACY_UNMIGRATED`,
    `CARRY_OVER_OPEN`, `REMOVE_FAILED`, `BRANCH_RETAINED`, `DEADLINE_REACHED`.
  - Reused: `PREVIEW_MISMATCH`, `LOCK_HELD`, `NOT_OWNER`, `SANDBOX_DENIED` and `INTERRUPTED`.

  Every new code gets an entry in `OUTCOME_CODES` and `OUTCOME_MESSAGES`.

- **Out of scope:**
  - `git worktree add` and receipt creation (concept non-goal).
  - Stale diff baselines, which stay with `diff-baseline.mjs discard`.
  - Work packages 6 and 7.
  - Cleanup of squash-merged delivery branches (follow-up issue).
- **Delivery timing.** The change moves the `merge-gate`, `iterate` and `build-context` eval
  suites. It merges after release 1.71.0 (#595), and the re-recording is debt due before the
  following release.

## Affected files

| File                                                                                                                                                | Description                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/effective-flow-state-worktree-core.mjs`                                                                                                | New: the six operations, per-record lock, nine-condition evaluator, claim-remove-reconcile, patch-id proof, per-item digests, carry-over comparison, preflight, deadline                                                                                                           |
| `src/scripts/effective-flow-state-core.mjs`                                                                                                         | Register operations, classes, key sets, outcome codes                                                                                                                                                                                                                              |
| `src/scripts/effective-flow-state.mjs`                                                                                                              | `OUTCOME_MESSAGES` for the new outcomes                                                                                                                                                                                                                                            |
| `src/scripts/effective-flow-state-memory-core.mjs`                                                                                                  | Store `runtimeMigration.directory.source` in the marker (`:700-705`)                                                                                                                                                                                                               |
| `src/scripts/runtime-state-guard.mjs`                                                                                                               | `legacyRuntimeDirectory` and `legacyConfigFile` guard classes; listing-bound remover                                                                                                                                                                                               |
| `src/scripts/claude-settings-core.mjs`                                                                                                              | Four operations in `ALLOWLISTED_OPERATIONS`; `worktree remove` and `cleanup apply` in `NEVER_ALLOWLISTED_OPERATIONS`                                                                                                                                                               |
| `build.mjs`                                                                                                                                         | `RUNTIME_SCRIPT_FILES` entry; `CONTEXT_BUDGET_LINES` from the build report; build guard against prose `rm`, `rmdir` or `unlink` of runtime state or legacy paths and against prose record writes                                                                                   |
| `src/shared/worktree-lifecycle.md`                                                                                                                  | Reduced to status meanings, helper calls and outcome handling; narrowed `-D` rule                                                                                                                                                                                                  |
| `src/shared/worktree-integration.md`                                                                                                                | Record initialization (`:208-212`, `:283-286`), outcome handling (`:231-248`), abort paths (`:343-364`) and delivery cleanup (`:437-446`) through the helper, with the denial fallback; Codex notice; Bash timeout                                                                 |
| `src/shared/worktree-record-obligation.md`                                                                                                          | Exit self-check through `worktree inspect` and `worktree transition`                                                                                                                                                                                                               |
| `src/shared/plan-pr-continuation.md`                                                                                                                | Adoption (`:242-260`) through `worktree transition`                                                                                                                                                                                                                                |
| `src/shared/plan-publication.md`                                                                                                                    | Record initialization and cleanup (`:222-240`, `:336-345`) through the helper                                                                                                                                                                                                      |
| `src/shared/merge-gate-checkout-boundary.md`                                                                                                        | Record handling (`:22-40`) through the helper                                                                                                                                                                                                                                      |
| `src/shared/build-run-contract.md`                                                                                                                  | Record references (`:40`, `:86`) aligned with the helper                                                                                                                                                                                                                           |
| `src/tools/deliver.md`                                                                                                                              | Record writes (`:206`, `:264`) through the helper                                                                                                                                                                                                                                  |
| `src/tools/apply-review-commit-mechanics.md`                                                                                                        | Component records (`:115-125`) and integration cleanup (`:155-185`) through one `worktree remove` with `integrationRoot`; narrowed `-D` rule; `BRANCH_RETAINED` report                                                                                                             |
| `src/tools/apply-issues.md`                                                                                                                         | Record handling (`:298-410`) through the helper                                                                                                                                                                                                                                    |
| `src/tools/iterate.md`                                                                                                                              | Record handling (`:544-550`) through the helper                                                                                                                                                                                                                                    |
| `src/tools/cleanup.md`                                                                                                                              | Phases 1 and 4 through `cleanup plan`; Phase 5 through `cleanup apply` with `items` and `decisions`; the four asks kept; legacy and config removal and the worktree replay removed from prose; `git rm` and baseline discard unchanged; `-D` rule at `:277`, `:362-366` and `:438` |
| `src/shared/setup-allowlist.md` and the developer-guide pages that name the rule count                                                              | Updated rule count and operation list                                                                                                                                                                                                                                              |
| `evals/iterate/suite.config.mjs`, `evals/merge-gate/suite.config.mjs`                                                                               | Add the new core to the seeded state-helper sources                                                                                                                                                                                                                                |
| `test/effective-flow-state-worktree.test.mjs`                                                                                                       | New: unit tests with injected `fs`, runner and clock                                                                                                                                                                                                                               |
| `test/effective-flow-state-git.test.mjs`                                                                                                            | Git-backed tests for eligibility, removal, patch-id proof and legacy guards                                                                                                                                                                                                        |
| `test/effective-flow-state-memory.test.mjs`                                                                                                         | Marker `source`, including the two-run `.firmo/` then `.sf-plugin/` sequence                                                                                                                                                                                                       |
| `test/effective-flow-state-harness.test.mjs`                                                                                                        | Pinned allowlisted and never-allowlisted sets                                                                                                                                                                                                                                      |
| `test/worktree-lifecycle-contract.test.mjs` (including `:253`), `test/runtime-dir-migration-contract.test.mjs`, `test/runtime-state-guard.test.mjs` | Adjusted to the helper-based prose and the narrowed `-D` rule; named invariants kept                                                                                                                                                                                               |
| `docs/developer-guide/claude-code-allowlist-evidence.md`                                                                                            | New section "Work package 4 measurement"                                                                                                                                                                                                                                           |

## Implementation details

### Approach

1. **Core and registration.**
   - Implement the worktree core with the key sets above.
   - Every operation resolves its roots itself. Every record path goes through `guardTarget`, and
     every write through `atomicWrite` or `createNoClobber`.
   - Register the operations and outcomes, then add the core to `RUNTIME_SCRIPT_FILES` and to both
     eval suite configs.
2. **Eligibility.** Implement the nine conditions of `worktree-lifecycle.md:145-172` as one pure
   evaluator over facts the helper derived itself. It returns every failed condition number.
3. **Claim-remove-reconcile.** Port `worktree-lifecycle.md:174-204` step by step, with five
   changes:
   - the multi-record loop
   - the preflight
   - the branch policy above
   - an already-absent worktree reconciled only under the actor's own lock and claim
   - every other absent or prunable worktree reported, never pruned
4. **Cleanup plan and apply.**
   - `cleanup plan` composes `worktree inspect`, the two legacy guards with the carry-over
     comparison, and the baseline inventory.
   - `cleanup apply` checks the selected `itemDigest`s, then processes items one by one until the
     deadline and returns a result per item.
5. **Marker source.** Extend `migrateDirectory` additively; existing markers without `source`
   certify nothing.
6. **Prose reduction in every host of the table.**
   - Replace each replayed procedure with one literal helper call in the call shape of work package
     8, plus an outcome table that includes the denial fallback.
   - The user-facing parts stay in prose: the dry-run presentation, the four asks, and the retention
     and final report, including `BRANCH_RETAINED` branches.
7. **Allow rules and build guard.**
   - Extend both operation sets.
   - Add build-guard rules with failing fixtures against prose removal of runtime state or legacy
     paths, and against prose record writes.
8. **Budgets and checks.**
   - Set every touched `CONTEXT_BUDGET_LINES` entry from the `Always-loaded core` report.
   - Run CI's order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
9. **Follow-up and measurement.**
   - File the follow-up issue for squash-merged delivery branches.
   - Run the measurement below.
   - Record the eval debt in the PR body.

### Measurement

The measurement reuses the work package 8 harness under a new evidence root
`.effective-flow/spikes/allowlist/<date>-NN/`. The measurement `HOME` holds the worktree's portable
build as a symlink, and the run asserts the written rule set against the preview.

- **Cell.** `cleanup`, 3 runs in default mode and 3 in auto mode (`CLAUDE_CODE_AUTO_MODE_SERVER=0`).
  - **Prompt:** the neutral `/effective-flow cleanup`.
  - **Answers:** the host answers every ask with its first option.
  - **Seed:**
    - a `cleanup-ready` delivery record (`retain`)
    - a `cleanup-ready` `apply-review` record whose branch is merged into its target, so that
      `git branch -d` succeeds
    - one `active` record that must stay
    - a migrated `.firmo/` with the marker `source: .firmo` and its files carried over
- **Analysis.** The analyzer classifies `worktree remove` and `cleanup apply` as destructive. Every
  other `effective-flow-state.mjs` call counts as helper housekeeping.
- **Validity rule.** A run is valid when the host completed and the seed matched its manifest. An
  invalid run is repeated, and the repeat is recorded. There are at most two fix rounds; a third
  failure goes to the user.
- **Exercised.** A run counts as exercised when all of these hold:
  - `cleanup plan` and `cleanup apply` both succeeded
  - both eligible worktrees and records are gone
  - the delivery branch remains and the `apply-review` branch is gone
  - the `active` record is unchanged
  - `.firmo/` is gone
- **Pass condition.** Every cell must be exercised in at least 2 of 3 valid runs per mode. Across
  all valid runs:
  - helper housekeeping has 0 prompts and 0 auto-mode refusals
  - each default-mode run shows at most one harness prompt for `cleanup apply`

  The stage 0 baseline rows serve as the comparison.

- **Indicative evidence, not part of the pass condition.** One `iterate` run on a seeded PR shows
  `record-init` and `transition` without prompts, and delivery cleanup with at most one prompt.
- **Limit.** Server-side auto mode stays unmeasured.
- **A failure** blocks the implemented status. The PR states the miss and the run IDs.

### Edge cases

- **Selected item changed after the dry run** (for example a new file in `.firmo/` or a moved tip):
  `PREVIEW_MISMATCH` with no write. The prose reruns the dry run and asks again. Changes to
  unselected or unrelated items have no effect.
- **Entry created during removal:** `LEGACY_CHANGED`. The remaining tree stays, and the partial
  state is reported.
- **Foreign or ownerless lock, or a stale claim:** ineligible (condition 9), reported, never broken.
- **Worktree directory deleted by hand:** the registration is prunable, so the item is ineligible
  (condition 4) and reported. There is no prune. Only the actor's own claimed record is reconciled.
- **`git branch -d` refuses:**
  - Inside `apply-review`, with the proof complete: compare-and-delete.
  - Otherwise `BRANCH_RETAINED` with the unproven commits. The record is deleted, the branch stays
    and is reported.
- **Component branch with a merge commit, or a whitespace-only change during conflict
  resolution:** not proven, `BRANCH_RETAINED`.
- **Branch tip moved between proof and deletion:** `update-ref` refuses, `BRANCH_RETAINED`.
- **Harness denies or refuses `worktree remove`:** the host transitions the records to
  `cleanup-ready`, and a later `cleanup` collects them.
- **Registered worktree under a session path with no record:** reported, never removed.
- **Legacy directory:**
  - without a marker, or with a marker for the other source: `LEGACY_UNMIGRATED`
  - open carry-over without a discard: `CARRY_OVER_OPEN`
  - any `.git` below `.worktrees/`: blocked and reported
  - tracked content: `LEGACY_TRACKED`, then the prose `git rm` path
  - a symlink at the legacy name, or a chain changed during the walk: `UNSAFE_TARGET` for that item
- **Config file that is still the live configuration** (no ADR, locator step 3): blocked.
- **Config file without a carry-over decision:** `CARRY_OVER_OPEN`.
- **Codex sandbox:** the preflight fails, so the result is `SANDBOX_DENIED` with nothing touched.
  A rerun with escalation finds the item eligible.
- **Invalid record** (unknown or missing keys, bad `reason`, a policy that does not fit the
  purpose): `INVALID_STATE` or "not eligible", never rewritten.
- **Deadline or signal:** finished items stay finished. The in-flight claim is reconciled to
  `cleanup-failed` where possible, or reported. Remaining items get `DEADLINE_REACHED` or
  `INTERRUPTED`.

## Acceptance criteria

- [x] The six operations exist with exactly the key sets in "Architecture decisions" and reject
      extra argv before reading stdin. Unit tests cover every outcome and error code this plan names,
      and the per-item versus whole-call error mapping.
- [x] The lifecycle tests cover:
  - every valid transition, a rejected transition from each status, and a wrong `reason` per
    status
  - a wrong `sessionId`
  - adoption with each of its proofs failing alone
  - each of the nine eligibility conditions failing alone
  - `record-init` per purpose, with each "newly registered" criterion and each policy, purpose or
    branch mismatch failing alone
- [x] The claim-remove-reconcile tests cover:
  - a multi-record call
  - `retain`
  - `-d` success
  - inside `apply-review`: a complete patch-id proof with compare-and-delete, and a refusal for
    each of: a merge commit, a whitespace-only difference, a target equal to a component branch, a
    moved tip, and a branch still checked out
  - `BRANCH_RETAINED` without `integrationRoot`
  - removal failure leading to `cleanup-failed`
  - the absent-worktree reconcile
  - the preflight touching nothing
  - lock release in every path, including deadline and signal
- [x] Compatibility holds:
  - the helper transitions a prose-era v1 record
  - a helper-written record passes `build-run-core.mjs`'s `exact()` and lock checks
  - a record with an unknown key is refused
- [x] `cleanup apply` meets all of the following:
  - it refuses a changed selected item with `PREVIEW_MISMATCH` and no write
  - it refuses an `itemId` outside the plan
  - it executes only the selected items
  - its result is unchanged when an unrelated record turns `cleanup-ready`
  - it refuses when the carry-over decisions change
- [x] The legacy guards and the remover meet all of the following, with one test each:
  - they delete a migrated `.firmo/` with symlinks inside once open entries are discarded, without
    following any symlink
  - they refuse each of: missing marker, a marker for the other source (two-run sequence), open
    carry-over, any `.git` below `.worktrees/`, tracked content, a symlinked legacy name, a chain
    swapped mid-walk, and an entry added mid-walk
  - `legacyConfigFile` refuses without an ADR and without a decision
- [x] `src/` contains no prose `rm`, `rmdir` or `unlink` of runtime state or a legacy-list path,
      and no prose write of a worktree-run record. The build guard fails a fixture for each.
- [x] `harness allow-rules` writes the four new allowlisted operations and no rule for the two
      destructive ones. The pinned sets, the rule count and the documentation match.
- [x] Each host's prose has the denial fallback for `worktree remove` and the `BRANCH_RETAINED`
      report, pinned by contract tests.
- [x] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass. Every
      changed `CONTEXT_BUDGET_LINES` entry equals the built count plus at most ten.
- [x] The follow-up issue for squash-merged delivery branches exists.
- [x] The "Work package 4 measurement" section in
      `docs/developer-guide/claude-code-allowlist-evidence.md` records the six valid `cleanup` runs,
      and they meet the pass condition in "Measurement". The plan is marked implemented only when this
      criterion holds.

## Validation plan

- **Unit tests** with injected `fs`, runner and clock, as in work packages 2 and 3:
  - each operation and every outcome
  - the eligibility evaluator, with a table per condition
  - item-digest stability and sensitivity
  - the deadline
  - interruption between claim and removal
  - the remover race (chain swap and added entry)
- **Git-backed tests** in `test/effective-flow-state-git.test.mjs`:
  - a real linked worktree for each purpose, created, claimed and removed
  - a dirty worktree refused by condition 7 and by Git
  - a locked or a prunable registration
  - a branch not containing `creationOid`
  - the patch-id proof cases above, against real cherry-picked branches
  - the legacy guards against tracked, untracked and nested `.git` content
- **Memory tests:** the marker `source`, and the two-run sequence.
- **Contract tests.** The named invariants still hold through the new calls:
  - the record is written before setup
  - outcome transitions happen on every exit path, with the denial fallback
  - removal is non-force only, with no prune
  - force deletion only inside `apply-review` after the proof
  - the final report names retained items and branches
- **Build-guard fixtures** for prose removal and prose record writes.
- **Distribution smoke:** `cleanup plan` in each target's install layout.
- **Eval verification.**
  - Expected stale, recorded as debt: `pnpm eval merge-gate verify`, `pnpm eval iterate verify` and
    `pnpm eval build-context verify`.
  - Expected current: `pnpm eval next-steps verify`.
- **Measurement** as in "Measurement". The evidence is kept under the run root with a manifest
  digest.

## Assumptions and open points

- The concept is approved with no open points. Module placement, the lock, the guards, the digest
  and outcome reuse follow the conventions of work packages 2, 3, 8 and 9. The deviations from the
  current contract are user decisions of 2026-11-03:
  - force deletion inside `apply-review` after a patch-id proof
  - a list of records per `worktree remove`
  - the `legacyConfigFile` class
  - deferred eval re-recording
- Assumption: the work package 8 measurement harness, the sandbox repository and its token are
  still usable. If not, restoring them is part of the measurement step.
- Assumption: release 1.71.0 merges before this change. If it does not, delivery waits.
- Assumption: 90 s is enough for the deadline. The measurement records actual durations, and the
  bound is adjusted there if needed.

## Plan review

**Result:** Approved

### Summary

Counts of the latest round, the deep review of 2026-11-03.

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         2 |    0 |
| Security        |        0 |         2 |    1 |
| Data protection |        1 |         3 |    1 |
| Error cases     |        0 |         2 |    2 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    1 |

### Findings

#### Deep review (2026-11-03)

An independent judgment, following `effective-delivery` and `effective-engineering`, reviewed the
second revision against the code on `develop`. Every finding was incorporated.

- **Data protection, Critical.** The carry-over guard relied on `kept` and `skipped` lists that the
  migration never stores, and it contradicted the symlink acceptance criterion. **Incorporated:**
  carry-over is re-derived by byte comparison, with digest-bound discard decisions.
- **Architecture, Critical.** `cleanup apply` had no trustworthy target for the `-D` proof, and a
  target supplied by the caller allowed a vacuous proof. **Incorporated:** user decision, force
  deletion only inside the `apply-review` run, with a target the helper derives itself; in
  `cleanup`, `BRANCH_RETAINED`.
- **Security, Important.** The `-D` path had a check-to-use gap and blind spots for merge commits
  and empty ranges. **Incorporated:** resolved OIDs, refusal on merge commits, an ancestor rule for
  empty ranges, and compare-and-delete with `update-ref`.
- **Data protection, Important.** `git cherry` ignores whitespace. **Incorporated:** user decision,
  `git patch-id --verbatim`.
- **Architecture, Important.** The path rule for "newly registered" contradicted three of the four
  purposes. **Incorporated:** a path and policy table per purpose, with `BASE` derived through
  `config-resolve-core`.
- **Architecture, Important.** The whole-plan digest broke on parallel sessions and did not cover
  decisions. **Incorporated:** per-item digests, including the decisions.
- **Data protection, Important.** The remover could delete unlisted entries and unregistered
  checkouts below `.worktrees/`. **Incorporated:** a listing-bound remover, and blocking on any
  `.git` below `.worktrees/`.
- **Data protection, Important.** The config files had no checkable proof and could be the live
  configuration. **Incorporated:** locator steps 0–2 plus an explicit decision.
- **Security, Important.** After `.firmo/` is removed, the marker would certify `.sf-plugin/`.
  **Incorporated:** the marker stores its `source`.
- **Error cases, Important.** The input contracts were incomplete. **Incorporated:** a key-set
  table and the `sessionId` semantics.
- **Error cases, Important.** A refused `worktree remove` left completed work in `active`.
  **Incorporated:** the denial fallback to `cleanup-ready`.
- **Scope, Important.** N prompts per `apply-review` run. **Incorporated:** user decision, a list of
  records per call.
- **Security, Note.** `record-init` accepted any branch policy. **Incorporated:** policy, purpose and
  branch are bound together.
- **Error cases, Note.** The preflight was underspecified. **Incorporated:** probe files in the
  named directories.
- **Error cases, Note.** Whole-call error codes were used per item. **Incorporated:** an
  error-mapping rule.
- **Data protection, Note.** Branches under `BRANCH_RETAINED` became invisible. **Incorporated:**
  the outcome and final report list them.
- **Maintainability, Note.** Line references had drifted. **Incorporated.**
- **Testability, Note.** The outcome claim was wider than its evidence. **Incorporated:** narrowed
  to `cleanup`; the `iterate` run is indicative.

#### Internal review (2026-11-03)

The first draft had 2 Critical, 13 Important and 5 Note findings. All were incorporated except the
deferred eval re-recording, which is a user decision. The main corrections:

- the legacy guard was hardened against live worktrees, unmigrated sources and open carry-over
- `git worktree prune` was removed
- the exact v1 key set is enforced
- the missing record-writing hosts were added
- the receipt and roots are derived by the helper
- the `transition` keys and the adoption proofs were specified
- selection by `itemId`
- a deadline and a sandbox preflight
- the new core was added to the eval seeds
- the remover re-checks the path chain
- the `legacyConfigFile` class
- the measurement was fixed
- `NEVER_ALLOWLISTED_OPERATIONS` was extended and `PREVIEW_MISMATCH` reused
- delivery cleanup holds one lock throughout

## Open points

- No open points.

## Implementation notes (build run 2026-11-03)

**Delivered:**

- New core `src/scripts/effective-flow-state-worktree-core.mjs` with the six operations
  `worktree record-init`, `worktree transition`, `worktree inspect`, `worktree remove`,
  `cleanup plan` and `cleanup apply`, wired through `effective-flow-state-core.mjs` and the CLI
  message table. The deadline is 90 s with a 15 s item floor and a 10 s reconcile reserve, below
  the 120000 ms prose Bash timeout.
- Legacy guards `checkLegacyRuntimeDirectory` and `checkLegacyConfigFile` plus the remover in
  `runtime-state-guard.mjs`; the memory migration marker now records `source`.
- `harness allow-rules` writes 58 rules with 13 allowlisted operations; `worktree remove` and
  `cleanup apply` stay unlisted.
- Build guard `findProseRuntimeRemovalViolations` in `build-lib.mjs` fails prose removal of
  runtime state and prose writes of worktree-run records.
- Prose hosts (`cleanup`, `deliver`, `apply-review-commit-mechanics`, `apply-issues`, `iterate`
  and the shared worktree fragments) call the helper and carry the denial fallback and the
  `BRANCH_RETAINED` report.

**Deviations from the plan text:**

- A legacy migration marker without `source` certifies a directory only through a zero-open
  carry-over proof (`legacyMarker: true`, with `memory.json` listed as an open entry).
- `cleanup plan` returns a neutral `runs` list instead of a diff-baseline inventory, as the
  merge-gate eval guard requires.
- `worktree inspect` also returns `orphanLocks`; `cleanup plan` lists them as blocked and never
  removes them.

## Test results

- `pnpm agent:check`, `node build.mjs` and `pnpm test:distribution` pass.
- `pnpm test`: 4426 tests, 4397 pass, 27 skipped, 2 failed in the full run. One was a contract
  regex left behind by a review wording fix, corrected and passing. The other is the known
  full-suite-load timeout of `test_first_stage.py` in `test/host-driver.test.mjs`, which passes
  alone (3/3).
- Changed `CONTEXT_BUDGET_LINES` entries equal their built counts.
- Eval verification, debt before the release after 1.71.0: `merge-gate` (8 stale, 1 absent),
  `iterate` (7 stale) and `next-steps` (15 stale, already stale from earlier `develop` changes)
  need re-recording; `build-context` has 1 current and 7 absent scenarios.

**Follow-up and measurement:**

- Squash-merged delivery branches are tracked in #612.
- The "Work package 4 measurement" in `docs/developer-guide/claude-code-allowlist-evidence.md`
  passed in its first round: 6 of 6 valid runs exercised, 0 housekeeping prompts and 0 auto-mode
  refusals, exactly one `cleanup apply` prompt per default run. `cleanup apply` took 272–365 ms,
  well within the 90 s deadline. One earlier attempt hit an account usage limit and is recorded as
  invalid.

## Review findings

**Date:** 2026-11-03
**Reviewer:** effective-flow-nodejs-reviewer (review and one re-check round)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    29 |
| Open / Not implemented |     6 |

**External review report:** `.effective-flow/review/review-report-2026-11-03-plan-worktree-lifecycle-and-cleanup-helper-operations.md`
