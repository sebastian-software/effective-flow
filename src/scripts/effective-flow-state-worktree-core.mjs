// Runtime-state helper: the worktree-lifecycle and cleanup operations that workflows used to replay
// from prose (`worktree-lifecycle.md`, `worktree-integration.md`, `cleanup.md`).
//
//   worktree record-init  {cwd, executionRoot, record}
//   worktree transition   {cwd, executionRoot, recordId, from, to, reason, sessionId, branch?,
//                          workflow?, fetchedHeadOid?, release?, adoption?, visibility?}
//   worktree inspect      {cwd, executionRoot, sessionId?}
//   worktree remove       {cwd, executionRoot, sessionId, recordIds, integrationRoot?}
//   cleanup plan          {cwd, executionRoot, decisions?}
//   cleanup apply         {cwd, executionRoot, decisions?, items}
//   ledger init           {cwd, executionRoot, recordId, sessionId, manifest, groups, base,
//                          visibility, language}
//   ledger append         {cwd, executionRoot, recordId, sessionId, commitOid}
//   worktree resume-check {cwd, executionRoot, recordId, visibility}
//   ledger reconcile      {cwd, executionRoot, recordId, sessionId}
//
// The `ledger` operations, `worktree resume-check`, and the proofs of the release transition
// (`release: "partial-diff"`) and of the resume adoption (`adoption: "partial-diff-resume"`) live
// in `effective-flow-state-recovery-core.mjs`, which builds on the internals this module
// exports and is reached only through the dispatch of `effective-flow-state-core.mjs`; this module
// never imports it. The ledger's schema, path and comparisons live in
// `effective-flow-state-ledger-core.mjs`. Here, a ledger is deleted under the same lock and claim
// right before its record (`worktree remove`, `cleanup apply`), and `worktree inspect` reports one
// without a record as an orphan and never removes it. Every Git call inside a recorded worktree or
// the selection's source root runs only after the common-directory proof of that root, and with
// `core.fsmonitor=false`.
//
// Every input is untrusted. The helper derives every fact it relies on itself: `cwd` must be the
// main checkout (RUNTIME_STATE_ROOT) and yields the repository identity (the common Git directory);
// `executionRoot` must be a canonical path registered in `git worktree list --porcelain -z`; the
// base directories come from the configuration resolver (`config-resolve-core.mjs`); registration,
// branch, tip and status come from Git. A record's identity fields are compared against these facts
// and never trusted as input.
//
// Records live at `<cwd>/.effective-flow/worktree-runs/<RECORD_ID>.json` with the exact version 1
// key set `build-run-core.mjs` checks with `exact()` (RECORD_KEYS), plus `cleanupRunId` and
// `claimedAt` only while `cleanup-in-progress`. A record with unknown or missing keys, or any
// invalid value, is never repaired or rewritten: it is INVALID_STATE, or ineligible (condition 1),
// and it is deleted only through the confirmed `invalid-record:<RECORD_ID>` item of `cleanup apply`
// (see below). Every record write goes through `atomicWrite` (or `createNoClobber` for
// `record-init`), every record path through the runtime-state guard.
//
// The per-record lock is the directory `<RECORD_ID>.lock` with an `owner` file, created with
// `mkdir` and released only by the actor whose token it holds. It is never broken and has no
// timeout: a held lock is LOCK_HELD for `record-init` and `transition`, and a foreign or ownerless
// lock or claim makes a record ineligible (condition 9).
//
// `worktree remove` and `cleanup apply` run claim-remove-reconcile per record, each under one lock
// hold: an `active` record (`worktree remove` only) moves to `cleanup-ready`, then to
// `cleanup-in-progress` (the claim), the worktree is removed with `git worktree remove <path>`
// without `--force`, the branch policy is applied, and the record is deleted. A failed removal
// persists `cleanup-failed` with the exact Git error. The helper never runs `git worktree prune`,
// never unlinks a worktree path, and reconciles an already absent worktree only under its own lock
// and claim. Before touching a record, a sandbox preflight creates and removes a probe file in each
// directory Git will write to (SANDBOX_DENIED otherwise, nothing touched). Both bound every Git
// call by what is left of the deadline (DEFAULT_DEADLINE_MS), start no item once less than
// ITEM_FLOOR_MS is left or after SIGINT, SIGTERM or SIGHUP, and report the rest as
// DEADLINE_REACHED or INTERRUPTED. Any failure after a claim (a signal, a failed or timed-out Git
// call, a lost lock) is reconciled to `cleanup-failed` under the held lock. `record-init` and
// `transition` hold their signal handlers while the lock is held and return INTERRUPTED once it is
// released. The lock release itself spawns no Git.
//
// Branch policy `delete-after-integration`: after the removal, `git branch -d`. When Git refuses
// and the call carries `integrationRoot` (`apply-review` only), the patch-id proof below runs
// against the branch checked out at `integrationRoot`, and a proven branch is deleted with the
// compare-and-delete `git update-ref --no-deref -d refs/heads/<branch> <branchOid>` once no
// worktree checks it out. Otherwise the branch stays, the record is still deleted, and the item is BRANCH_RETAINED
// with the branch and its unproven commits. A `retain` branch is never touched by the worktree item
// itself. The one purpose exception is the temporary branch of `base-validation` and
// `issue-planning` (TEMPORARY_BRANCH_PURPOSES), which is never integrated: when `branch -d` refuses
// it, a tip still at `creationOid` that another ref also reaches is compare-and-deleted at that OID
// (see `deleteTemporaryBranch`). Every compare-and-delete (`compareAndDeleteBranch`) also refuses a
// branch a rebase or bisect uses and a symbolic ref, recreates the ref when a worktree checks it
// out right after the deletion, and removes the branch's `branch.<name>.*` configuration.
//
// The `branch:` class of `cleanup plan` and `cleanup apply` offers a local delivery branch whose
// content provably landed in `origin/<delivery.baseBranch>` (`planBranches`): an orphan under
// `refs/heads/<delivery.branchPrefix>/` that no record and no non-terminal build run names and no
// worktree checks out or uses, or the branch of a `delivery`, `partial-diff` or `plan-publication`
// record whose `worktree:` item is in the same plan (`dependsOn`). Its proof is one of the local
// tree proofs of `pr-delivery-git-core.mjs` (`ancestor`, `tip-tree`, `squash-tree`); no fetch or
// forge call runs. The apply value `{itemDigest, proof, proofCommit}` is only integrity: the
// pre-write pass re-derives candidacy and the cheap facts (`recomputeBranchItem`), and the item's
// own step re-runs the one proof and the record, checkout and in-use checks right before the
// compare-and-delete (`applyBranchItem`). Every unproven or excluded branch is retained with one
// reason of RETAINED_BRANCH_REASONS; nothing ever runs `git branch -D`, pushes or changes a remote
// ref.
//
// `cleanup plan` and `cleanup apply` alone may also claim a `merge-gate` record that a stopped run
// left `aborted` or `failed` (`mergeGateRelease` of `evaluateEligibility`): condition 6 is waived,
// and a fail-closed no-unpushed-commits proof, re-derived under the lock before the claim, guards
// the removal instead. Its failures are the entry's `blockers`; the record is never rewritten
// before the claim and its branch is retained.
//
// The same cleanup-only flag admits an `issue-planning` record that Issue Buddy kept `aborted` with
// reason `plan-preserved` (PRESERVED_PLAN_REASON, `preservedPlanRelease`): condition 1 accepts
// that status for it, and every other condition stays required. Its worktree still holding the
// untracked preserved plan fails condition 7, and so does any ignored entry in
// an `issue-planning` worktree (`ignoredPlanEntries`: `git status` never lists it and a removal would
// delete it with no copy), on every path to a removal. Once the user moved or discarded the plan, the record
// is an ordinary `worktree:` item removed after confirmation, a fully gone one through the gone
// route. While the plan is there, cleanup discards it only under the superseded-plan proof
// (SUPERSEDED_PLAN_PROOF, `supersededPlanProof`), which never deletes bytes the base cannot give
// back: condition 7 is the record's only failed condition, only through a non-empty status; that
// status holds exactly one untracked regular file `<plan.dir>/<name>` with an UNATTENDED_PLAN_NAME
// name and no ignored entry; the local `refs/remotes/origin/<base>` commit
// (no fetch) holds `<plan.dir>/archive/<name>` as a regular blob with exactly one canonical status
// line, Implemented; and the preserved copy either is an open plan the archive completes
// (`planCompletionMismatch` of `build-run-core.mjs`, valid UTF-8 on both sides, `completion-prefix`)
// or its raw blob is a recorded post-image of either path in the base history (`blob-history`). A
// failed proof leaves the record blocked with `supersededPlan: {reason}` (SUPERSEDED_PLAN_REASONS);
// a held one makes it a `worktree:` item with `proof`, its evidence, `conditions: []` and
// `waivedConditions: [7]`, whose digest also binds the plan and archive blobs and the match, never
// the base commit, and whose apply value is `{itemDigest, proof}`. Only the cleanup callers waive
// condition 7, never `evaluateEligibility`. Under the lock the claim re-derives the proof, and
// `discardSupersededPlan` discards exactly that file through a quarantine before the ordinary
// removal; a refusal before the quarantine rename restores the pre-claim record (`restored: true`).
// A released (`cleanup-ready` or `cleanup-failed`) `issue-planning` record whose worktree is gone,
// e.g. after a failed record deletion, takes the gone route too, also when its temporary branch is
// already deleted.
//
// A record file `readRecord` reports invalid is the `invalid-record:<RECORD_ID>` class of `cleanup
// plan` and `cleanup apply` (`assessInvalidRecord`), never a `worktree:` entry. Its proofs come
// only from Git and the filesystem: a field of the invalid record may block (a non-terminal
// `status`, a `worktreePath` another record names) but never authorizes. Its only action is
// `absent` (path unregistered and ENOENT: only the record file is deleted). A worktree still
// registered and present is `worktree-present` and never removed: nothing proves the checkout at
// that path is still the one the record's run created, so the user removes it and reruns cleanup.
// Every failed fact is a `blockers` entry. The record is never rewritten, its branch never
// touched; a failed deletion leaves the file as it was.
//
// The multi-item operations return `{items: [...]}` with one result per item; a guard refusal of
// one item (UNSAFE_TARGET, LEGACY_CHANGED, …) is that item's result and the others continue. Only
// a root or input error (INVALID_ROOT, INVALID_INPUT, RUNTIME_STATE_UNSAFE) or a PREVIEW_MISMATCH
// before the first write ends the whole call. `cleanup apply` items are `worktree:`,
// `invalid-record:` (together at most MAX_RECORD_IDS), `branch:` (at most MAX_BRANCH_ITEMS),
// `legacy:` and `config:`; each value is the bare `itemDigest`, a `branch:` item's
// `{itemDigest, proof, proofCommit}` and a proven `worktree:` item's `{itemDigest, proof}`.

import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, rmdir, unlink } from 'node:fs/promises';
import { hostname as osHostname } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { isSafeBaseRef, resolveConfiguration } from './config-resolve-core.mjs';
import {
  LEGACY_CONFIG_ENTRY,
  LEGACY_MEMORY_ENTRY,
  LEGACY_RUNTIME_DIRS,
  NON_LIVE_LOCATOR_STEPS,
  O_NOFOLLOW,
  RUNTIME_STATE_DIR,
  RuntimeStateError,
  TRANSITIONAL_CONFIG_FILE,
  assertDirectoryChain,
  asBuffer,
  atomicWrite,
  checkLegacyConfigFile,
  checkLegacyRuntimeDirectory,
  createNoClobber,
  ensureGuardedDirectory,
  errorDetail,
  guardTarget,
  guardedUnlink,
  hashRegularFile,
  isLegacyMigrationMarker,
  listLegacyTree,
  removeLegacyListing,
  runGit,
} from './runtime-state-guard.mjs';
import {
  HOST_PATTERN,
  OPERATION_KEYS,
  StateOutcome,
  TOKEN_PATTERN,
  UNKNOWN_HOST,
  fail,
  makeContext,
  requireClosedKeys,
  requireObject,
  requireRootSyntax,
  resolveRoot,
} from './effective-flow-state-core.mjs';
import { isObject, readBoundedFile } from './runtime-file-primitives.mjs';
import {
  DeliverySelectionError,
  hiddenWorktreeChanges,
  ignoredPathsAt,
  scopedGitRunner,
} from './delivery-selection-core.mjs';
import {
  RELEASE_QUARANTINE_PREFIX,
  deleteLedger,
  ledgerExists,
  ledgerPaths,
  ledgersDir,
  listLedgerIds,
  readLedger,
} from './effective-flow-state-ledger-core.mjs';
import { VISIBILITY_VALUES } from './remote-tracker-shared-core.mjs';
import {
  BRANCH_PROOFS,
  PrDeliveryGitError,
  branchProofRepository,
  branchSquashProof,
  branchTipProof,
  verifyBranchProof,
} from './pr-delivery-git-core.mjs';
import {
  canonicalPlanStatusLines,
  nonTerminalBuildRunBranches,
  planCompletionMismatch,
} from './build-run-core.mjs';
import { UNATTENDED_PLAN_NAME, classifyPlanText } from './plan-lint-core.mjs';

export const RECORDS_DIR = 'worktree-runs';
export const RECORD_SCHEMA_VERSION = 1;
// The exact version 1 key set, in the order the helper writes it.
export const RECORD_KEYS = Object.freeze([
  'schemaVersion',
  'recordId',
  'sessionId',
  'componentId',
  'workflow',
  'purpose',
  'repositoryIdentity',
  'runtimeStateRoot',
  'worktreePath',
  'branch',
  'creationOid',
  'ownership',
  'receipt',
  'branchPolicy',
  'createdAt',
  'updatedAt',
  'status',
  'reason',
]);
export const CLAIM_KEYS = Object.freeze(['cleanupRunId', 'claimedAt']);
export const RECEIPT_KEYS = Object.freeze([
  'repositoryIdentity',
  'executionRoot',
  'runtimeStateRoot',
  'checkout',
  'origin',
  'setupOwner',
  'setupStatus',
  'workflow',
  'purpose',
]);
export const RECORD_STATUSES = Object.freeze([
  'active',
  'cleanup-ready',
  'aborted',
  'failed',
  'cleanup-in-progress',
  'cleanup-failed',
]);
export const PURPOSES = Object.freeze([
  'delivery',
  'partial-diff',
  'plan-publication',
  'apply-review',
  'merge-gate',
  'base-validation',
  'issue-planning',
]);
// The purposes bound to `delete-after-integration`; every other purpose is bound to `retain`.
export const DELETE_AFTER_INTEGRATION_PURPOSES = Object.freeze([
  'apply-review',
  'base-validation',
  'issue-planning',
]);
// The purposes whose worktree sits on a temporary branch `<purpose>/<SESSION_ID>` that is never
// integrated: `record-init` binds the branch to exactly that name, and `deleteTemporaryBranch`
// compare-and-deletes it while its tip is still `creationOid` (`proof: 'unadvanced'`).
export const TEMPORARY_BRANCH_PURPOSES = Object.freeze(['base-validation', 'issue-planning']);
export const BRANCH_POLICIES = Object.freeze(['retain', 'delete-after-integration']);
export const SETUP_STATUSES = Object.freeze([
  'pending',
  'complete',
  'skipped',
  'externally managed',
]);
export const OWNERSHIP = 'effective-flow-created';
// The statuses whose `reason` must be null; every other status but `cleanup-in-progress` needs a
// non-empty reason.
const NULL_REASON_STATUSES = Object.freeze(['active', 'cleanup-ready']);
export const CLAIMABLE_STATUSES = Object.freeze(['cleanup-ready', 'cleanup-failed']);
// The statuses condition 1 accepts for a `merge-gate` record under the cleanup-only release
// (`mergeGateRelease` of `evaluateEligibility`): a stopped run keeps its record `aborted` or
// `failed`, and only `cleanup apply` may claim it from there.
export const MERGE_GATE_RELEASE_STATUSES = Object.freeze([
  'aborted',
  'failed',
  ...CLAIMABLE_STATUSES,
]);
// The `aborted` reason of an `issue-planning` record whose worktree Issue Buddy kept because it
// holds a preserved plan; only `cleanup plan` and `cleanup apply` claim such a record.
export const PRESERVED_PLAN_REASON = 'plan-preserved';
export const PRESERVED_PLAN_RELEASE_STATUSES = Object.freeze(['aborted', ...CLAIMABLE_STATUSES]);
// `from` → allowed `to` of `worktree transition`.
export const TRANSITIONS = Object.freeze({
  active: Object.freeze(['cleanup-ready', 'aborted', 'failed']),
  aborted: Object.freeze(['active']),
  failed: Object.freeze(['active']),
});
// `from` → allowed `to` of the release transition, selected only by `release: "partial-diff"`.
export const RELEASE_TRANSITIONS = Object.freeze({
  aborted: Object.freeze(['cleanup-ready']),
  failed: Object.freeze(['cleanup-ready']),
});
export const RELEASE_DISCRIMINATOR = 'partial-diff';
// The adoption discriminator of `worktree transition` with `to: "active"`: `plan-pr-continuation`
// (the default when `adoption` is absent) or `partial-diff-resume`, whose proofs live in
// `effective-flow-state-recovery-core.mjs`.
export const PLAN_PR_ADOPTION = 'plan-pr-continuation';
export const RESUME_ADOPTION = 'partial-diff-resume';
export const ADOPTIONS = Object.freeze([PLAN_PR_ADOPTION, RESUME_ADOPTION]);
// The `core.fsmonitor=false` configuration of every Git call inside a proven worktree or source.
const IN_WORKTREE_GIT_CONFIG = Object.freeze(['core.fsmonitor=false']);
export const ELIGIBILITY_CONDITIONS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9]);
// The closed vocabulary of the `blockers` array every blocked cleanup entry carries, in reporting
// order: facts beyond the nine conditions that stop a removal. A new cleanup class adds its own
// codes here; the `merge-gate` release reports the last three (`releaseBlockers`), the
// `invalid-record` class every other one (`invalidRecordEntries`).
export const BLOCKERS = Object.freeze([
  'invalid-record-id',
  'invalid-json',
  'no-worktree-path',
  'record-locked',
  'ledger-present',
  'unsafe-ledger-directory',
  'status-not-terminal',
  'recorded-elsewhere',
  'half-gone',
  'worktree-present',
  'in-progress-operation',
  'unpushed-commits',
  'proof-unavailable',
]);
// The statuses an invalid record must carry for its `invalid-record` item: those of a run that
// stopped or released its worktree. Any other value, a missing or unknown one included, is
// `status-not-terminal`.
export const INVALID_RECORD_TERMINAL_STATUSES = Object.freeze([
  'aborted',
  'failed',
  'cleanup-ready',
  'cleanup-failed',
]);
// The `readRecord` reasons of a record file that holds no JSON object (`invalid-json`).
const INVALID_JSON_REASONS = Object.freeze([
  'unreadable',
  'not-regular',
  'oversized',
  'invalid-json',
  'not-an-object',
]);
// The entries at `git rev-parse --git-path <name>` whose presence means a merge, cherry-pick,
// revert, rebase or sequencer operation is in progress in that worktree.
export const IN_PROGRESS_MARKERS = Object.freeze([
  'MERGE_HEAD',
  'CHERRY_PICK_HEAD',
  'REVERT_HEAD',
  'rebase-merge',
  'rebase-apply',
  'sequencer',
]);

export const DEFAULT_BASE_DIR = '.effective-flow/.worktrees';
export const PLAN_PUBLICATION_SUFFIX = '-plan-publication';
export const MERGE_GATE_SUFFIX = '-merge-gate';
export const BASE_VALIDATION_SUFFIX = '-base-validation';
export const ISSUE_PLANNING_SUFFIX = '-issue-planning';
// The leaf suffix of each purpose at `BASE_DIR/REPO_NAME/SESSION_ID<suffix>`: the purpose table of
// `record-init` and the session paths of `worktree inspect`. `delivery` and `partial-diff` take the
// bare session leaf, `apply-review` its own base directory.
export const PURPOSE_SUFFIXES = Object.freeze({
  'plan-publication': PLAN_PUBLICATION_SUFFIX,
  'merge-gate': MERGE_GATE_SUFFIX,
  'base-validation': BASE_VALIDATION_SUFFIX,
  'issue-planning': ISSUE_PLANNING_SUFFIX,
});
// The time bound of `worktree remove` and `cleanup apply`. No item starts once less than
// ITEM_FLOOR_MS of DEFAULT_DEADLINE_MS is left, and every Git call of the operation is bounded by
// what is left (in its own process group); the reconciliation of an in-flight claim may use
// RECONCILE_RESERVE_MS beyond the deadline for its guarded record write. The sum stays well below
// PROSE_BASH_TIMEOUT_MS, the explicit Bash timeout the prose gives both calls, so the helper always
// returns its own result before the harness kills it.
export const DEFAULT_DEADLINE_MS = 90_000;
export const ITEM_FLOOR_MS = 15_000;
export const RECONCILE_RESERVE_MS = 10_000;
export const PROSE_BASH_TIMEOUT_MS = 120_000;
export const MAX_RECORD_IDS = 64;
export const MAX_REPORTED_COMMITS = 64;
export const WORKTREE_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_LOCK_OWNER_BYTES = 16 * 1024;
const MAX_REASON_CHARS = 2000;

// The record ID shares `build-run-core.mjs`'s identifier rule, so a helper-written record is also
// a valid build-run lifecycle reference.
export const RECORD_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
// A session ID becomes a path segment of the worktree path.
export const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
// A conservative subset of `git check-ref-format --branch`: no whitespace, control character,
// `~^:?*[\`, `..`, `//`, `@{`, leading `-` or `/`, trailing `/`, `.` or `.lock`.
const BRANCH_PATTERN =
  /^(?!-)(?!\/)(?!.*\.\.)(?!.*\/\/)(?!.*@\{)(?!.*\/\.)(?!\.)(?!.*\.lock$)(?!.*[/.]$)[^\x00-\x20~^:?*[\\\x7f]+$/;
// The only branch names a `branch:` item may carry: no shell or pattern metacharacter can reach a
// Git argument, a config key or the restore line. Any other name is retained as `unsafe-name`.
export const SAFE_BRANCH_NAME_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
export const ITEM_ID_PATTERN =
  /^(?:(?:worktree|invalid-record):[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}|branch:[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*|legacy:\.(?:firmo|sf-plugin)|config:\.effective-flow\/config\.json)$/;

// The `branch:` class of `cleanup plan` and `cleanup apply` (see the header). MAX_BRANCH_ITEMS
// bounds both the proof candidates of one plan and the `branch:` items of one apply call;
// BRANCH_PROOF_BUDGET_MS bounds the plan's branch discovery and proofs, never its other inventory.
export const MAX_BRANCH_ITEMS = 32;
export const BRANCH_PROOF_BUDGET_MS = 45_000;
// The purposes whose `retain` record binds a branch cleanup may offer with its worktree item.
export const BRANCH_ITEM_PURPOSES = Object.freeze(['delivery', 'partial-diff', 'plan-publication']);
export const BRANCH_SOURCES = Object.freeze(['record', 'orphan']);
// Every retained branch carries exactly one of these reasons: the first that applies, in this
// order (repository-wide, exclusions, limits, then the proof result). `git-version` is never
// decided repository-wide (never a `repositoryReason`): `ancestor` still runs below Git 2.38, so
// `git-version` stays a branch's own pass-1 result, reported only for a branch that no exclusion
// kept and `ancestor` did not prove.
export const RETAINED_BRANCH_REASONS = Object.freeze([
  'grafts',
  'shallow-repository',
  'git-version',
  'base-ref-missing',
  'record-unreadable',
  'unsafe-name',
  'recorded',
  'checked-out',
  'in-use',
  'branch-limit',
  'timeout',
  'candidate-limit',
  'no-merge-base',
  'multiple-merge-bases',
  'empty-diff',
  'merge-attribute',
  'not-proven',
  'proof-unavailable',
]);
// The retained reasons a fetch of `origin/<base>` and a rerun may resolve.
export const FETCH_HINT_REASONS = Object.freeze(['not-proven', 'base-ref-missing']);
// The `reason` of a `branch:` item that `cleanup apply` kept (`BRANCH_RETAINED`); SANDBOX_DENIED,
// DEADLINE_REACHED and INTERRUPTED keep their own codes.
export const BRANCH_ITEM_REASONS = Object.freeze([
  'worktree-not-removed',
  'grafts',
  'shallow-repository',
  'not-proven',
  'empty-diff',
  'multiple-merge-bases',
  'merge-attribute',
  'proof-unavailable',
  'timeout',
  'recorded',
  'record-unreadable',
  'checked-out',
  'in-use',
  'ref-moved',
  'ref-recreate-failed',
]);
// The files below `<common>/` and each `<common>/worktrees/<id>/` that name a branch a rebase
// (`--update-refs` included) or a bisect still uses; read directly, never through Git.
export const BRANCH_IN_USE_FILES = Object.freeze([
  'rebase-merge/head-name',
  'rebase-merge/update-refs',
  'rebase-apply/head-name',
  'BISECT_START',
]);
// The superseded-plan proof of `cleanup plan` and `cleanup apply` (see the header). The plan's
// proofs share one budget, min(SUPERSEDED_PLAN_PROOF_BUDGET_MS, what is left of DEFAULT_DEADLINE_MS
// − BRANCH_PROOF_BUDGET_MS), so the branch proofs after them keep their full budget.
export const SUPERSEDED_PLAN_PROOF = 'preserved-plan-superseded';
export const SUPERSEDED_PLAN_PROOF_BUDGET_MS = 30_000;
// The closed vocabulary of a blocked record's `supersededPlan.reason`, in evaluation order: the
// first failing check is reported; a failed or timed-out Git call at any step is
// `proof-unavailable`.
export const SUPERSEDED_PLAN_REASONS = Object.freeze([
  'hidden-mode',
  'base-unavailable',
  'dirty-entries',
  'not-plan-file',
  'unsafe-plan-file',
  'archive-missing',
  'archive-not-implemented',
  'content-diverged',
  'proof-unavailable',
]);
const DEFAULT_PLAN_DIR = 'docs/plan';
const MAX_PLAN_BYTES = 512 * 1024;
// A `plan.dir` the proof accepts: relative, with no pathspec, shell or pattern metacharacter.
const PLAN_DIR_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;
const IMPLEMENTED_STATUS_LINE =
  /^\*\*(?:Plan status:\*\* Implemented|Planungsstatus:\*\* Umgesetzt)$/;
const OPEN_STATUS_LINE =
  /^\*\*(?:Plan status:\*\* Not implemented|Planungsstatus:\*\* Nicht umgesetzt)$/;
const DEFAULT_BRANCH_PREFIX = 'effective-flow';
const DEFAULT_BASE_BRANCH = 'main';
const MAX_IN_USE_FILE_BYTES = 1024 * 1024;
const NO_REPLACE_ENV = Object.freeze({ GIT_NO_REPLACE_OBJECTS: '1' });

const PROBE_FLAGS = fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | O_NOFOLLOW;
const OWNER_FLAGS = PROBE_FLAGS;

// The filesystem calls the core makes for locks and probes, injectable as `deps.fs`.
const DEFAULT_FS = Object.freeze({ lstat, mkdir, open, readdir, realpath, rename, rmdir, unlink });

// ---------------------------------------------------------------------------------------------
// Small helpers

function isText(value, max = 4096) {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    value.length <= max &&
    !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value) &&
    (typeof value.isWellFormed !== 'function' || value.isWellFormed())
  );
}

function isAbsolutePath(value) {
  return (
    isText(value) &&
    path.isAbsolute(value) &&
    path.normalize(value) === value &&
    (value === '/' || !value.endsWith('/'))
  );
}

function isTimestamp(value) {
  return (
    typeof value === 'string' && TIMESTAMP_PATTERN.test(value) && Number.isFinite(Date.parse(value))
  );
}

export function isBranchName(value) {
  return typeof value === 'string' && value.length <= 255 && BRANCH_PATTERN.test(value);
}

// `YYYY-MM-DDTHH:mm:ssZ`, UTC without milliseconds.
function timestamp(deps) {
  return new Date((deps.now ?? Date.now)()).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function randomHex(deps, bytes = 16) {
  return (deps.randomToken ?? (() => randomBytes(bytes).toString('hex')))();
}

function localHost(deps) {
  const host = (deps.hostname ?? osHostname)();
  return typeof host === 'string' && HOST_PATTERN.test(host) ? host : UNKNOWN_HOST;
}

// A JSON serialization with recursively sorted object keys, the input of every `itemDigest`.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function itemDigest(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

// The ledger binding of `record`: the fields a ledger must repeat exactly.
export function ledgerBinding(record) {
  return {
    recordId: record.recordId,
    creationOid: record.creationOid,
    worktreePath: record.worktreePath,
    branch: record.branch,
    receiptDigest: itemDigest(record.receipt),
  };
}

export async function phase(deps, name, detail) {
  await deps.onPhase?.(name, detail);
}

function gitStdout(result) {
  return asBuffer(result?.stdout).toString('utf8');
}

function gitOk(result) {
  return !result?.error && result?.status === 0;
}

async function gitLine(context, cwd, args) {
  const result = await runGit(context, cwd, args);
  return gitOk(result) ? gitStdout(result).trim() : null;
}

async function canonical(fs, value) {
  try {
    return await fs.realpath(value);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Record schema

// Why `value` is not an exact version 1 record (null when it is). `fileId` is the record ID its
// file name carries.
export function recordProblem(value, fileId) {
  if (!isObject(value)) return 'not-an-object';
  const claimed = value.status === 'cleanup-in-progress';
  const allowed = claimed ? [...RECORD_KEYS, ...CLAIM_KEYS] : RECORD_KEYS;
  const required = allowed;
  if (Object.keys(value).some((key) => !allowed.includes(key))) return 'unknown-key';
  if (required.some((key) => !Object.hasOwn(value, key))) return 'missing-key';
  if (value.schemaVersion !== RECORD_SCHEMA_VERSION) return 'schema-version';
  if (typeof value.recordId !== 'string' || !RECORD_ID_PATTERN.test(value.recordId)) {
    return 'record-id';
  }
  if (fileId !== undefined && value.recordId !== fileId) return 'record-id-file-mismatch';
  if (!isText(value.sessionId, 256)) return 'session-id';
  if (value.componentId !== null && !isText(value.componentId, 256)) return 'component-id';
  if (!isText(value.workflow, 128)) return 'workflow';
  if (!PURPOSES.includes(value.purpose)) return 'purpose';
  for (const key of ['repositoryIdentity', 'runtimeStateRoot', 'worktreePath']) {
    if (!isAbsolutePath(value[key])) return key;
  }
  if (!isBranchName(value.branch)) return 'branch';
  if (typeof value.creationOid !== 'string' || !OID_PATTERN.test(value.creationOid)) {
    return 'creation-oid';
  }
  if (value.ownership !== OWNERSHIP) return 'ownership';
  const receipt = value.receipt;
  if (!isObject(receipt)) return 'receipt';
  const receiptKeys = Object.keys(receipt);
  if (
    receiptKeys.length !== RECEIPT_KEYS.length ||
    RECEIPT_KEYS.some((key) => !Object.hasOwn(receipt, key))
  ) {
    return 'receipt-keys';
  }
  if (
    !isObject(receipt.checkout) ||
    Object.keys(receipt.checkout).length !== 2 ||
    receipt.checkout.kind !== 'branch' ||
    !isBranchName(receipt.checkout.branch)
  ) {
    return 'receipt-checkout';
  }
  for (const key of ['repositoryIdentity', 'executionRoot', 'runtimeStateRoot']) {
    if (!isAbsolutePath(receipt[key])) return `receipt-${key}`;
  }
  if (receipt.origin !== OWNERSHIP) return 'receipt-origin';
  if (!isText(receipt.setupOwner, 256)) return 'receipt-setup-owner';
  if (!SETUP_STATUSES.includes(receipt.setupStatus)) return 'receipt-setup-status';
  if (!isText(receipt.workflow, 128) || !PURPOSES.includes(receipt.purpose)) {
    return 'receipt-workflow';
  }
  if (!BRANCH_POLICIES.includes(value.branchPolicy)) return 'branch-policy';
  const expectedPolicy = DELETE_AFTER_INTEGRATION_PURPOSES.includes(value.purpose)
    ? 'delete-after-integration'
    : 'retain';
  if (value.branchPolicy !== expectedPolicy) return 'branch-policy-purpose';
  if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) return 'timestamp';
  if (!RECORD_STATUSES.includes(value.status)) return 'status';
  if (NULL_REASON_STATUSES.includes(value.status)) {
    if (value.reason !== null) return 'reason';
  } else if (value.status === 'cleanup-in-progress') {
    if (value.reason !== null && !isText(value.reason, MAX_REASON_CHARS)) return 'reason';
  } else if (!isText(value.reason, MAX_REASON_CHARS)) {
    return 'reason';
  }
  if (claimed) {
    if (!isText(value.cleanupRunId, 128) || !isTimestamp(value.claimedAt)) return 'claim';
  }
  return null;
}

// The record with its keys in the written order.
function ordered(record) {
  const out = {};
  for (const key of RECORD_KEYS) out[key] = record[key];
  if (record.status === 'cleanup-in-progress') {
    for (const key of CLAIM_KEYS) out[key] = record[key];
  }
  return out;
}

function serialize(record) {
  return `${JSON.stringify(ordered(record), null, 2)}\n`;
}

// ---------------------------------------------------------------------------------------------
// Paths and roots

export function recordPaths(cwd, recordId) {
  const stateDir = path.join(cwd, RUNTIME_STATE_DIR);
  const dir = path.join(stateDir, RECORDS_DIR);
  const lock = path.join(dir, `${recordId}.lock`);
  return {
    stateDir,
    dir,
    record: path.join(dir, `${recordId}.json`),
    lock,
    owner: path.join(lock, 'owner'),
  };
}

// Parses `git worktree list --porcelain -z`: one entry per worktree, the main worktree first.
export function parseWorktreeList(buffer) {
  const fields = asBuffer(buffer).toString('utf8').split('\0');
  const entries = [];
  let current = null;
  for (const field of fields) {
    if (field === '') {
      if (current) entries.push(current);
      current = null;
      continue;
    }
    if (field.startsWith('worktree ')) {
      if (current) entries.push(current);
      current = {
        path: field.slice(9),
        head: null,
        branch: null,
        bare: false,
        detached: false,
        locked: false,
        prunable: false,
      };
      continue;
    }
    if (!current) continue;
    if (field.startsWith('HEAD ')) current.head = field.slice(5);
    else if (field.startsWith('branch ')) current.branch = field.slice(7);
    else if (field === 'bare') current.bare = true;
    else if (field === 'detached') current.detached = true;
    else if (field === 'locked' || field.startsWith('locked ')) current.locked = true;
    else if (field === 'prunable' || field.startsWith('prunable ')) current.prunable = true;
  }
  if (current) entries.push(current);
  return entries;
}

export async function listWorktrees(context) {
  const result = await runGit(context, context.cwd, ['worktree', 'list', '--porcelain', '-z']);
  if (!gitOk(result)) {
    const detail = result?.timedOut
      ? `timed out after ${result.boundMs} ms`
      : (result?.error?.message ?? errorDetail(result?.stderr));
    fail('GIT_FAILED', `git worktree list failed: ${detail}`);
  }
  const entries = parseWorktreeList(result.stdout);
  for (const entry of entries) entry.canonical = await canonical(context.fs, entry.path);
  return entries;
}

function matches(entry, target) {
  return entry.path === target || entry.canonical === target;
}

// Verifies `value` as a canonical path registered in the porcelain list. A refusal is INVALID_ROOT.
async function requireRegistered(context, worktrees, value, label) {
  if (!isAbsolutePath(value)) fail('INVALID_ROOT', `${label} must be an absolute normalized path`);
  if ((await canonical(context.fs, value)) !== value) {
    fail('INVALID_ROOT', `${label} must be an existing canonical path, not an alias`);
  }
  const entry = worktrees.find((candidate) => matches(candidate, value));
  if (!entry) fail('INVALID_ROOT', `${label} is not a registered worktree of this repository`);
  return entry;
}

export function prepare(operation, input, deps) {
  requireObject(input, 'input');
  requireClosedKeys(input, OPERATION_KEYS[operation], 'input');
  const context = makeContext(deps);
  context.fs = { ...DEFAULT_FS, ...deps.fs };
  return context;
}

export async function openRoots(context, input) {
  await requireRootSyntax(input.cwd);
  const { cwd, common } = await resolveRoot(context, input.cwd);
  // The common Git directory, read by the in-use check of `compareAndDeleteBranch`.
  context.common = common;
  const worktrees = await listWorktrees(context);
  const execution = await requireRegistered(
    context,
    worktrees,
    input.executionRoot,
    'executionRoot',
  );
  return { cwd, common, worktrees, executionRoot: execution.canonical ?? execution.path };
}

// The base directories of the purpose table and the configuration locator step, from the
// configuration resolver. A configured value that is set but invalid is INVALID_STATE.
async function resolveBases(context, deps) {
  let config;
  try {
    config = await resolveConfiguration(
      { cwd: context.cwd, tool: 'cleanup' },
      { runner: context.runner, env: deps.env },
    );
  } catch (error) {
    fail('INVALID_STATE', `the configuration cannot be resolved: ${error?.message ?? error}`);
  }
  const base = (key) => {
    const entry = config.values[key];
    if (!entry) return path.resolve(context.cwd, DEFAULT_BASE_DIR);
    if (entry.state !== 'set') fail('INVALID_STATE', `${key} is invalid`);
    const value = typeof entry.value === 'string' ? entry.value : entry.raw;
    if (typeof value !== 'string' || value.trim() === '') {
      return path.resolve(context.cwd, DEFAULT_BASE_DIR);
    }
    if (!isText(value) || value.includes('\0')) fail('INVALID_STATE', `${key} is invalid`);
    return path.resolve(context.cwd, value);
  };
  return {
    worktree: base('worktree.baseDir'),
    applyReview: base('applyReview.worktree.baseDir'),
    locatorStep: config.source.step,
  };
}

// The canonical form of `target` when it exists, else `target` itself.
async function canonicalOrSelf(fs, target) {
  return (await canonical(fs, target)) ?? target;
}

// The one branch name a record of TEMPORARY_BRANCH_PURPOSES may carry.
function temporaryBranchName(record) {
  return `${record.purpose}/${record.sessionId}`;
}

// The paths of the purpose table for one record: `{exact}` or `{parent}` (a direct child).
async function requiredLocation(context, bases, record) {
  const repo = path.basename(context.cwd);
  const session = record.sessionId;
  if (record.purpose === 'apply-review') {
    return {
      parent: await canonicalOrSelf(context.fs, path.join(bases.applyReview, repo, session)),
    };
  }
  const leaf = `${session}${PURPOSE_SUFFIXES[record.purpose] ?? ''}`;
  return { exact: await canonicalOrSelf(context.fs, path.join(bases.worktree, repo, leaf)) };
}

// ---------------------------------------------------------------------------------------------
// Record reading and writing

// Reads one record: `{state: 'missing'}`, `{state: 'invalid', reason}` or `{state: 'ok', record}`.
export async function readRecord(context, paths, recordId) {
  const read = await readRecordFile(context, paths, recordId);
  if (read.state === 'invalid') return { state: 'invalid', reason: read.reason };
  return read.state === 'ok' ? { state: 'ok', record: read.record } : { state: 'missing' };
}

// The classification of `readRecord` plus what the `invalid-record` class binds: the SHA-256 of
// the file's bytes (null when unread) and, for an invalid record, its parsed `value` (a JSON
// object, else null). The value is evidence that may only block, never authorize.
async function readRecordFile(context, paths, recordId) {
  const read = await readBoundedFile(context.fs, paths.record, MAX_RECORD_BYTES);
  if (read.state === 'missing') return { state: 'missing' };
  const invalid = (reason, value = null) => ({
    state: 'invalid',
    reason,
    value,
    sha256: read.sha256 ?? null,
  });
  if (read.state !== 'ok') return invalid(read.state);
  let value;
  try {
    value = JSON.parse(read.content.toString('utf8'));
  } catch {
    return invalid('invalid-json');
  }
  const problem = recordProblem(value, recordId);
  if (problem) return invalid(problem, isObject(value) ? value : null);
  return { state: 'ok', record: value, sha256: read.sha256 };
}

async function listRecordNames(context) {
  const dir = path.join(context.cwd, RUNTIME_STATE_DIR, RECORDS_DIR);
  if (!(await assertDirectoryChain(context.cwd, dir, { allowMissing: true }))) return [];
  try {
    return await context.fs.readdir(dir);
  } catch (error) {
    fail('UNSAFE_TARGET', `cannot list ${dir}: ${error?.code ?? error?.message}`);
  }
}

// Every record file below `worktree-runs/`: the record IDs of the `*.json` names that match
// RECORD_ID_PATTERN (`ids`) and every other `*.json` name (`foreign`), both sorted. The guard's
// temporary files end in `.tmp` and never count.
async function listRecordFiles(context) {
  const names = (await listRecordNames(context)).filter((name) => name.endsWith('.json')).sort();
  const ids = [];
  const foreign = [];
  for (const name of names) {
    const id = name.slice(0, -5);
    if (RECORD_ID_PATTERN.test(id)) ids.push(id);
    else foreign.push(name);
  }
  return { ids, foreign };
}

// Every `*.json` record ID below `worktree-runs/` (sorted); none when the directory is missing.
async function listRecordIds(context) {
  return (await listRecordNames(context))
    .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    .map((name) => name.slice(0, -5))
    .sort();
}

// Every `<RECORD_ID>.lock` below `worktree-runs/` without a `<RECORD_ID>.json` beside it (sorted):
// an orphan lock, left by an interrupted actor or held by one that is still creating its record.
// It is reported, never removed: a record lock is never broken.
async function listOrphanLocks(context) {
  const names = await listRecordNames(context);
  const records = new Set(
    names.filter((name) => name.endsWith('.json')).map((n) => n.slice(0, -5)),
  );
  return names
    .filter((name) => name.endsWith('.lock'))
    .map((name) => name.slice(0, -5))
    .filter((id) => RECORD_ID_PATTERN.test(id) && !records.has(id))
    .sort();
}

export async function lockStillOwned(context, paths, held) {
  const observed = await observeRecordLock(context, paths);
  return (
    observed.present && observed.owner.state === 'valid' && observed.owner.token === held.token
  );
}

// Writes `record` atomically while the lock is still this actor's.
async function writeRecord(context, paths, record, held) {
  const written = await atomicWrite(context, paths.record, serialize(record), {
    beforeRename: async () => ((await lockStillOwned(context, paths, held)) ? null : 'lock-lost'),
  });
  if (!written.written)
    fail('WRITE_FAILED', `the lock of ${paths.record} was lost before the write`);
}

// ---------------------------------------------------------------------------------------------
// Per-record lock

// The owner a lock file holds: `valid` (this helper's JSON format) with its token, `invalid`, or
// `missing`. Never trusted beyond the token comparison.
async function readLockOwner(context, ownerPath) {
  const read = await readBoundedFile(context.fs, ownerPath, MAX_LOCK_OWNER_BYTES);
  if (read.state === 'missing') return { state: 'missing' };
  if (read.state !== 'ok') return { state: 'invalid', reason: read.state };
  try {
    const parsed = JSON.parse(read.content.toString('utf8'));
    if (isObject(parsed) && typeof parsed.token === 'string' && TOKEN_PATTERN.test(parsed.token)) {
      return {
        state: 'valid',
        token: parsed.token,
        fields: {
          runId: typeof parsed.runId === 'string' ? parsed.runId : null,
          operation: typeof parsed.operation === 'string' ? parsed.operation : null,
          acquiredAt: typeof parsed.acquiredAt === 'string' ? parsed.acquiredAt : null,
          host: typeof parsed.host === 'string' ? parsed.host : null,
        },
      };
    }
  } catch {
    // Reported as invalid below.
  }
  return { state: 'invalid', reason: 'foreign-format', bytes: read.bytes, sha256: read.sha256 };
}

async function observeRecordLock(context, paths) {
  let info;
  try {
    info = await context.fs.lstat(paths.lock, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return { present: false };
    return { present: true, owner: { state: 'invalid', reason: error?.code ?? 'unreadable' } };
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    return { present: true, owner: { state: 'invalid', reason: 'not-a-directory' } };
  }
  return {
    present: true,
    identity: { dev: String(info.dev), ino: String(info.ino) },
    owner: await readLockOwner(context, paths.owner),
  };
}

function publicLock(observed, paths) {
  if (!observed.present) return { present: false };
  const owner =
    observed.owner.state === 'valid'
      ? { state: 'valid', ...observed.owner.fields }
      : { state: observed.owner.state };
  return { present: true, path: paths.lock, owner };
}

// The reportable state of the record lock at `paths`, observed without taking or touching it.
export async function observedLock(context, paths) {
  return publicLock(await observeRecordLock(context, paths), paths);
}

// Takes the record lock: `{token, identity}` or a LOCK_HELD outcome. Never waits and never breaks.
async function acquireRecordLock(context, paths, fields, deps) {
  await ensureGuardedDirectory(context, paths.stateDir);
  await ensureGuardedDirectory(context, paths.dir);
  await guardTarget(context, paths.lock);
  try {
    await context.fs.mkdir(paths.lock, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      return new StateOutcome('LOCK_HELD', {
        lock: `${RECORDS_DIR}/${path.basename(paths.lock)}`,
        ...publicLock(await observeRecordLock(context, paths), paths),
      });
    }
    fail('WRITE_FAILED', `cannot create ${paths.lock}: ${error?.code ?? error?.message}`);
  }
  let identity;
  try {
    const info = await context.fs.lstat(paths.lock, { bigint: true });
    identity = { dev: String(info.dev), ino: String(info.ino) };
  } catch (error) {
    fail('WRITE_FAILED', `cannot inspect ${paths.lock} after creating it: ${error?.code}`);
  }
  const token = randomHex(deps);
  const owner = {
    token,
    acquiredAt: new Date((deps.now ?? Date.now)()).toISOString(),
    host: localHost(deps),
    pid: null,
    workflow: 'effective-flow-state',
    ...fields,
  };
  let handle;
  try {
    await guardTarget(context, paths.owner);
    handle = await context.fs.open(paths.owner, OWNER_FLAGS, 0o600);
    await handle.writeFile(`${JSON.stringify(owner)}\n`);
    await handle.sync();
  } catch (error) {
    await handle?.close().catch(() => {});
    if (handle) await context.fs.unlink(paths.owner).catch(() => {});
    await context.fs.rmdir(paths.lock).catch(() => {});
    if (error instanceof RuntimeStateError) throw error;
    fail('WRITE_FAILED', `cannot write ${paths.owner}: ${error?.code ?? error?.message}`);
  }
  await handle.close().catch(() => {});
  return { token, identity };
}

// Releases a lock this actor holds. Never throws: `{released: true}` or `{released: false, reason}`.
// It removes the lock only when the owner file still carries this actor's token and the directory
// keeps the identity recorded at creation; any other lock is left untouched (`not-owner`), because
// a record lock is never broken. The release spawns no Git: the owner token, the directory identity
// and a symlink-free directory chain from `cwd` to the lock prove it, so a failing or timed-out
// Git runner (a deadline, a signal) can never leak a lock this actor holds.
async function releaseRecordLock(context, paths, held) {
  try {
    const observed = await observeRecordLock(context, paths);
    if (!observed.present) return { released: false, reason: 'missing' };
    if (
      observed.owner.state !== 'valid' ||
      observed.owner.token !== held.token ||
      observed.identity?.dev !== held.identity.dev ||
      observed.identity?.ino !== held.identity.ino
    ) {
      return { released: false, reason: 'not-owner' };
    }
    await assertDirectoryChain(context.cwd, paths.lock);
    await context.fs.unlink(paths.owner);
    await context.fs.rmdir(paths.lock);
    return { released: true };
  } catch (error) {
    return {
      released: false,
      reason: error instanceof RuntimeStateError ? error.code : (error?.code ?? 'failed'),
      message: error?.message,
    };
  }
}

// Runs `fn(held)` under the record lock and releases it on every path. A LOCK_HELD outcome is
// returned unchanged; a failed release is attached as `lockRelease` to an object result.
export async function withRecordLock(context, paths, fields, deps, fn) {
  const held = await acquireRecordLock(context, paths, fields, deps);
  if (held instanceof StateOutcome) return held;
  let value;
  let failure;
  try {
    value = await fn(held);
  } catch (error) {
    failure = error;
  }
  const release = await releaseRecordLock(context, paths, held);
  if (failure) {
    if (!release.released && failure instanceof Error) {
      failure.message = `${failure.message}; record lock release failed: ${release.reason}`;
    }
    throw failure;
  }
  if (release.released) return value;
  if (value instanceof StateOutcome) {
    return new StateOutcome(value.code, { ...value.details, lockRelease: release });
  }
  return { ...value, lockRelease: release };
}

// The INTERRUPTED outcome of a single-record write that a signal reached before the write:
// nothing was written and `status` is the record's unchanged status (null when none exists yet).
export function interruptedUnderLock(signals, recordId, status) {
  return new StateOutcome('INTERRUPTED', {
    recordId,
    signal: signals.signal,
    written: false,
    ...(status === null ? {} : { status }),
  });
}

// Runs a single-record operation (`record-init`, `transition`) with the SIGINT, SIGTERM and SIGHUP
// handlers of `watchSignals` installed for its whole duration. An installed handler replaces the
// default termination, so a signal can no longer end the process while the record lock is held: it
// is recorded, the operation skips its write when the signal came first (`interruptedUnderLock`),
// the lock is released on every path by `withRecordLock`, and only then is the result returned as
// INTERRUPTED. A write that had already landed is reported with `written: true` and its status;
// a release transition whose restore ran before the signal was seen completes its write and is
// reported so, with the `release` (`{route, restored}`) it carried out, and a resume adoption whose
// record write landed carries its `resume` summary the same way. A resume adoption that appended a
// recovered tip to the ledger and then saw the signal before the record write skips that write
// and reports `written: false` with `ledgerAppended: true` and the appended `appendedOid` (the next
// resume finds that entry already recorded); without `ledgerAppended`, nothing was appended.
export async function deferSignals(deps, recordId, fn) {
  const signals = watchSignals(deps);
  try {
    const value = await fn(signals);
    if (!signals.signal || (value instanceof StateOutcome && value.code === 'INTERRUPTED')) {
      return value;
    }
    if (value instanceof StateOutcome) {
      return new StateOutcome('INTERRUPTED', {
        recordId,
        signal: signals.signal,
        written: false,
        refused: value.code,
      });
    }
    return new StateOutcome('INTERRUPTED', {
      recordId,
      signal: signals.signal,
      written: true,
      status: value.status,
      ...(value.release ? { release: value.release } : {}),
      ...(value.resume ? { resume: value.resume } : {}),
      ...(value.lockRelease ? { lockRelease: value.lockRelease } : {}),
    });
  } finally {
    signals.dispose();
  }
}

// ---------------------------------------------------------------------------------------------
// Eligibility

// The nine removal conditions of `worktree-lifecycle.md` over facts the helper derived itself.
// Returns every failed condition number, ascending. `statuses` are the statuses condition 1
// accepts (`cleanup-ready` and `cleanup-failed`; `worktree remove` adds `active`). `removal` marks
// the callers that remove (`worktree remove`, `cleanup plan`/`apply`, `worktree inspect`), the
// only ones where a fully gone `partial-diff` or `issue-planning` worktree counts (see
// `goneRemovable`) and where a retained release quarantine fails condition 7 as well (`quarantineRetained`): `git worktree
// remove` deletes an ignored quarantine with the only copy of the bytes it holds. For the same
// reason a ledger endpoint at whose place an ignored untracked file stands (the endpoint itself,
// below a directory in its place, or in place of a parent directory), or ledger endpoints that
// cannot be established, fail condition 7 of those callers too (`ignoredEndpoints`), and so does
// an index entry of the worktree, of any purpose, whose skip-worktree or assume-unchanged bit
// hides bytes that neither its index nor HEAD holds, or such entries that cannot be established
// (`hiddenChanges`): `git status` never compares their working tree.
//
// `mergeGateRelease` is the cleanup-only release of a `merge-gate` record, passed only by `cleanup
// plan` and the item recompute, pre-lock gone gate and claim of `cleanup apply`, never by `worktree
// remove`, `worktree inspect` or an adoption. For purpose `merge-gate` alone it replaces `statuses`
// by MERGE_GATE_RELEASE_STATUSES and waives condition 6 (a force-push or reset after a stopped run
// may leave `creationOid` off the branch); the no-unpushed-commits proof that guards it instead
// is reported through `releaseBlockers`, never as a condition. Every other purpose ignores it.
export function evaluateEligibility(
  facts,
  { statuses = CLAIMABLE_STATUSES, removal = false, mergeGateRelease = false } = {},
) {
  const failed = [];
  const release = mergeGateReleaseApplies(facts, mergeGateRelease);
  const preserved = preservedPlanRelease(facts, mergeGateRelease);
  const accepted = release
    ? MERGE_GATE_RELEASE_STATUSES
    : preserved
      ? PRESERVED_PLAN_RELEASE_STATUSES
      : statuses;
  const gone = removal && goneRemovable(facts, release, preserved);
  if (!facts.schemaValid || !facts.ownershipCreated || !accepted.includes(facts.status)) {
    failed.push(1);
  }
  if (!(gone ? facts.receiptFieldsMatch : facts.receiptMatches)) failed.push(2);
  if (!gone && (facts.registrationCount !== 1 || !facts.linked)) failed.push(3);
  if (
    !gone &&
    (facts.locked || facts.prunable || !facts.directoryExists || !facts.commonDirMatches)
  ) {
    failed.push(4);
  }
  if (
    !gone &&
    (!facts.headOnBranch ||
      !facts.registrationOnBranch ||
      !facts.branchTip ||
      facts.registeredHead !== facts.branchTip)
  ) {
    failed.push(5);
  }
  // A fully gone `issue-planning` worktree whose temporary branch an earlier removal attempt
  // already deleted has no tip left to reach `creationOid` from: only the commit itself is required.
  const branchDeleted = gone && facts.purpose === 'issue-planning' && facts.branchTip === null;
  if (!release && (!facts.creationIsCommit || (!facts.creationAncestor && !branchDeleted))) {
    failed.push(6);
  }
  if (
    !gone &&
    (!facts.clean ||
      (removal &&
        (facts.quarantineRetained ||
          facts.ignoredEndpoints === null ||
          facts.ignoredEndpoints.length > 0 ||
          facts.ignoredPlanEntries === null ||
          (facts.ignoredPlanEntries ?? []).length > 0 ||
          facts.hiddenChanges === null ||
          facts.hiddenChanges.length > 0)))
  ) {
    failed.push(7);
  }
  if (facts.isMain || facts.isExecutionRoot) failed.push(8);
  if (facts.foreignLock || facts.foreignClaim) failed.push(9);
  return failed;
}

// Invariant: a released `partial-diff` or `issue-planning` record (`cleanup-ready` or
// `cleanup-failed`) whose worktree is fully gone (no registration in `git worktree list --porcelain`
// and `lstat` of its path is ENOENT) is removable. That proof, the same the release's `gone` route
// takes, replaces conditions 3, 4, 5 and 7 and the toplevel half of condition 2; conditions 1, the
// receipt fields of 2, 6, 8 and 9 stay required, no Git call runs inside the vanished path, and the
// claim and removal sequence is unchanged (the post-claim reconcile of an absent worktree). A half-gone worktree
// (registered without its directory, or present without its registration) and every other purpose
// keep the full conditions: cleanup never prunes. Under `mergeGateRelease` (`release`), a fully
// gone `merge-gate` record in a MERGE_GATE_RELEASE_STATUSES status takes the same route with
// condition 6 waived; its branch must be gone or pass the no-unpushed-commits proof instead.
// The preserved-plan release takes the same gone route with every condition but 3, 4, 5 and 7.
// A released `issue-planning` record (`cleanup-ready` or `cleanup-failed`) takes it as well, so a
// removal whose worktree is already gone, e.g. one whose record deletion failed after `git worktree
// remove`, is retried; its temporary branch may be gone too (condition 6 of `evaluateEligibility`).
function goneRemovable(facts, release = false, preserved = false) {
  if (facts.gone !== true) return false;
  if (release) return MERGE_GATE_RELEASE_STATUSES.includes(facts.status);
  if (preserved) return true;
  return (
    (facts.purpose === 'partial-diff' || facts.purpose === 'issue-planning') &&
    CLAIMABLE_STATUSES.includes(facts.status)
  );
}

function mergeGateReleaseApplies(facts, mergeGateRelease) {
  return mergeGateRelease === true && facts.purpose === 'merge-gate';
}

// Whether the cleanup-only flag admits an `issue-planning` record kept `aborted` with reason
// PRESERVED_PLAN_REASON (see the header): never without the flag, so `worktree remove`, `worktree
// inspect` and an adoption keep condition 1 for it.
function preservedPlanRelease(facts, mergeGateRelease) {
  return (
    mergeGateRelease === true &&
    facts.purpose === 'issue-planning' &&
    facts.status === 'aborted' &&
    facts.reason === PRESERVED_PLAN_REASON
  );
}

// Whether the no-unpushed-commits proof applies to a `merge-gate` record under the release: a
// removable status and a worktree that is either present and proven ours or fully gone. Any other
// record (an `active` one, a half-gone or foreign worktree) is blocked by conditions 1, 3 or 4
// alone; no proof call runs for it and it carries no blocker.
function releaseProofApplies(facts) {
  return (
    MERGE_GATE_RELEASE_STATUSES.includes(facts.status) &&
    (facts.commonDirMatches === true || facts.gone === true)
  );
}

// The `blockers` of the `merge-gate` release over `facts.releaseProof` (`releaseProof` of
// `gatherFacts`), in BLOCKERS order; empty for every other purpose, without `mergeGateRelease`, and
// where the proof does not apply (`releaseProofApplies`). Where it applies it fails closed: a
// missing proof or one whose Git call failed or timed out (null) is `proof-unavailable`, never an
// empty result.
export function releaseBlockers(facts, { mergeGateRelease = false } = {}) {
  if (!mergeGateReleaseApplies(facts, mergeGateRelease) || !releaseProofApplies(facts)) return [];
  const proof = facts.releaseProof ?? null;
  const found = new Set();
  if (proof === null || proof.inProgress === null || proof.unpushed === null) {
    found.add('proof-unavailable');
  }
  if (proof?.inProgress?.length > 0) found.add('in-progress-operation');
  if (proof?.unpushed?.length > 0) found.add('unpushed-commits');
  return BLOCKERS.filter((blocker) => found.has(blocker));
}

// The failed conditions and the blockers of `facts` together: `{conditions, blockers}`. A record is
// removable only when both are empty.
export function assessEligibility(facts, options = {}) {
  return {
    conditions: evaluateEligibility(facts, options),
    blockers: releaseBlockers(facts, options),
  };
}

// The in-progress operations of the proven worktree behind `inWorktree` (IN_PROGRESS_MARKERS that
// exist at their `git rev-parse --git-path` location), or null when Git or `lstat` cannot establish
// them. Only after the common-directory proof of that worktree.
async function operationsInProgress(fs, inWorktree) {
  const result = await inWorktree([
    'rev-parse',
    '--path-format=absolute',
    ...IN_PROGRESS_MARKERS.flatMap((name) => ['--git-path', name]),
  ]);
  if (!gitOk(result)) return null;
  const locations = gitStdout(result)
    .split('\n')
    .filter((line) => line !== '');
  if (
    locations.length !== IN_PROGRESS_MARKERS.length ||
    !locations.every((location) => path.isAbsolute(location))
  ) {
    return null;
  }
  const found = [];
  for (const [index, location] of locations.entries()) {
    try {
      await fs.lstat(location);
      found.push(IN_PROGRESS_MARKERS[index]);
    } catch (error) {
      if (error?.code !== 'ENOENT') return null;
    }
  }
  return found;
}

// The first commit of `rev-list <args> --not --remotes` run by `runner` (an empty list when every
// commit is on a remote-tracking ref), or null when Git fails or times out. No fetch runs: every
// commit the list leaves out stays reachable from a remote-tracking ref after the removal.
async function unpushedCommits(runner, revision) {
  const result = await runner(['rev-list', '--max-count=1', revision, '--not', '--remotes']);
  if (!gitOk(result)) return null;
  return gitStdout(result)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

// The tip of `refs/heads/<branch>` read from the main checkout: `{state: 'present', oid}`,
// `{state: 'missing'}`, or null when Git fails or times out (a missing branch is an empty listing,
// never a failed call).
async function branchState(context, branch) {
  const ref = `refs/heads/${branch}`;
  const result = await runGit(context, context.cwd, [
    'for-each-ref',
    '--format=%(objectname) %(refname)',
    ref,
  ]);
  if (!gitOk(result)) return null;
  const line = gitStdout(result)
    .split('\n')
    .find((entry) => entry.endsWith(` ${ref}`));
  if (line === undefined) return { state: 'missing' };
  const oid = line.slice(0, line.indexOf(' '));
  return OID_PATTERN.test(oid) ? { state: 'present', oid } : null;
}

// The no-unpushed-commits proof of the `merge-gate` release: `{inProgress, unpushed}`, each a list
// or null when unestablished. A present worktree whose common directory is proven ours is read
// inside it (`IN_PROGRESS_MARKERS`, then `rev-list HEAD --not --remotes`); a fully gone one runs no
// Git in its vanished path, only from the main checkout: a deleted branch has nothing left to lose,
// an existing one must pass the same `rev-list` from its tip. Only where `releaseProofApplies`.
async function mergeGateReleaseProof(context, facts, record) {
  if (facts.commonDirMatches) {
    const inWorktree = guardedGit(context, record.worktreePath);
    const inProgress = await operationsInProgress(context.fs, inWorktree);
    const unpushed = await unpushedCommits(inWorktree, 'HEAD');
    return { inProgress, unpushed };
  }
  // Defence in depth: a worktree neither proven ours nor fully gone never reaches the branch proof.
  if (!facts.gone) return null;
  const branch = await branchState(context, record.branch);
  if (branch === null) return { inProgress: [], unpushed: null };
  if (branch.state === 'missing') return { inProgress: [], unpushed: [] };
  const unpushed = await unpushedCommits((args) => runGit(context, context.cwd, args), branch.oid);
  return { inProgress: [], unpushed };
}

async function branchTip(context, branch) {
  const tip = await gitLine(context, context.cwd, [
    'rev-parse',
    '--verify',
    '-q',
    `refs/heads/${branch}^{commit}`,
  ]);
  return tip && OID_PATTERN.test(tip) ? tip : null;
}

// Whether `record.worktreePath` is an existing canonical directory whose common Git directory is
// this repository's own (derived from `cwd`, not merely the one the untrusted record names). The
// single `rev-parse --git-common-dir` probe is the only Git call any operation runs inside a
// recorded path before this proof; every other in-worktree call, probe or write waits for it.
async function proveOwnWorktree(context, roots, record) {
  return proveRepositoryDirectory(context, roots, record.worktreePath, record.repositoryIdentity);
}

// The proof of `proveOwnWorktree` for any `target`: an existing canonical directory whose common
// Git directory is this repository's (`roots.common`) and equals `identity`.
async function proveRepositoryDirectory(context, roots, target, identity) {
  const { fs } = context;
  const proof = { directoryExists: false, commonDirMatches: false };
  try {
    const info = await fs.lstat(target);
    proof.directoryExists =
      info.isDirectory() && !info.isSymbolicLink() && (await canonical(fs, target)) === target;
  } catch {
    proof.directoryExists = false;
  }
  if (!proof.directoryExists) return proof;
  const common = await gitLine(context, target, [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]);
  const canonicalCommon = common === null ? null : await canonical(fs, common);
  proof.commonDirMatches =
    canonicalCommon !== null && canonicalCommon === roots.common && canonicalCommon === identity;
  return proof;
}

// Runs Git in `root` with `core.fsmonitor=false`; only for a root proven this repository's.
export function guardedGit(context, root) {
  return (args, options = {}) =>
    runGit(
      context,
      root,
      [...IN_WORKTREE_GIT_CONFIG.flatMap((entry) => ['-c', entry]), ...args],
      options,
    );
}

// The runner the reused `delivery-selection-core.mjs` functions get: Git only in `provenRoots`
// (a `merge-file` on temporary files runs in the main checkout), always with
// `core.fsmonitor=false`, with the environment `runGit` gives every helper call.
export function selectionRunner(context, roots, provenRoots) {
  return scopedGitRunner((cwd, args, options) => runGit(context, cwd, args, options), {
    roots: provenRoots,
    defaultRoot: roots.cwd,
    config: IN_WORKTREE_GIT_CONFIG,
  });
}

// The canonical source root of `manifest` once its common Git directory is proven this
// repository's and it is not `deliveryRoot` (the record's worktree), else null. Nothing else runs
// in it before this proof. A delivery worktree as its own source would prove every source check
// against itself, so a release would discard the only copy of its residual.
export async function proveSourceRoot(context, roots, manifest, deliveryRoot) {
  const root = manifest.source.root;
  if (manifest.source.repositoryIdentity !== roots.common || !isAbsolutePath(root)) return null;
  if ((await canonical(context.fs, root)) !== root) return null;
  if (root === (await canonicalOrSelf(context.fs, deliveryRoot))) return null;
  const proof = await proveRepositoryDirectory(context, roots, root, roots.common);
  return proof.commonDirMatches ? root : null;
}

// Whether the proven worktree `root` holds a release quarantine a failed restore kept: an entry
// named with RELEASE_QUARANTINE_PREFIX directly below the root, of any type. Read from the file
// system, since `git status` never lists an ignored one; only the root's own listing is read and
// no entry is followed. A root that cannot be listed counts as holding one (fail closed).
async function retainsQuarantine(fs, root) {
  try {
    return (await fs.readdir(root)).some((name) =>
      String(name).startsWith(RELEASE_QUARANTINE_PREFIX),
    );
  } catch {
    return true;
  }
}

// The ledger endpoints of a `partial-diff` `record` at whose place its proven worktree holds an
// ignored untracked file (`ignoredPathsAt`: the endpoint itself, any file below a directory in its
// place, or a file in place of one of its parent directories), sorted. `git status` never lists
// them, so the worktree looks clean, and such an endpoint reads as absent, while they hold delivery
// bytes a removal would delete. Every endpoint of every group counts, a committed deletion
// included. There are none, and no Git call runs, without a ledger and when the guard refuses the
// `ledgers/` entry itself (that entry stops every removal on its own, see `claimAndRemove`). Null
// when they cannot be established: an invalid ledger, or a listing Git or the file system fails.
// Only for a worktree whose common directory is proven ours.
async function ignoredLedgerEndpoints(context, roots, record) {
  if (record.purpose !== 'partial-diff') return [];
  let read;
  try {
    read = await readLedger(context, roots.cwd, ledgerBinding(record));
  } catch (error) {
    if (!(error instanceof RuntimeStateError) || error.code !== 'UNSAFE_TARGET') throw error;
    return [];
  }
  if (read.state === 'missing') return [];
  if (read.state !== 'ok') return null;
  const endpoints = new Set(
    read.ledger.groups.flatMap((group) => group.endpoints.map((endpoint) => endpoint.path)),
  );
  if (endpoints.size === 0) return [];
  try {
    return await ignoredPathsAt(
      { root: record.worktreePath, paths: [...endpoints] },
      { runner: selectionRunner(context, roots, [record.worktreePath]) },
    );
  } catch (error) {
    if (error instanceof DeliverySelectionError) return null;
    throw error;
  }
}

// The paths of the proven worktree `root` whose skip-worktree or assume-unchanged index entry hides
// bytes that neither its index nor HEAD holds (`hiddenWorktreeChanges`), sorted; null when Git or
// the file system cannot establish them. Only for a worktree whose common directory is proven ours.
async function hiddenWorktreeEntries(context, roots, root) {
  try {
    return await hiddenWorktreeChanges(
      { root },
      { runner: selectionRunner(context, roots, [root]) },
    );
  } catch (error) {
    if (error instanceof DeliverySelectionError) return null;
    throw error;
  }
}

// All ignored entries of a proven issue-planning worktree, independent of plan.dir so retries
// still protect files in a former plan directory. Empty for other purposes; null on scan failure.
async function ignoredPlanningWorktreeEntries(context, record) {
  if (record.purpose !== 'issue-planning') return [];
  const status = await guardedGit(
    context,
    record.worktreePath,
  )(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching']);
  const entries = gitOk(status) ? porcelainEntries(status.stdout) : null;
  if (entries === null) return null;
  return entries
    .filter((entry) => entry.code === '!!')
    .map((entry) => entry.path)
    .sort();
}

// The facts condition 7 of `evaluateEligibility` reads for the proven worktree of `record`: `clean`
// (an empty `git status`) and the removal-only `quarantineRetained`, `ignoredEndpoints`,
// `hiddenChanges` and `ignoredPlanEntries`. Only for a worktree whose common directory is proven ours.
async function conditionSevenFacts(context, roots, record) {
  const target = record.worktreePath;
  const status = await guardedGit(
    context,
    target,
  )(['status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none']);
  return {
    clean: gitOk(status) && asBuffer(status.stdout).length === 0,
    quarantineRetained: await retainsQuarantine(context.fs, target),
    ignoredEndpoints: await ignoredLedgerEndpoints(context, roots, record),
    hiddenChanges: await hiddenWorktreeEntries(context, roots, target),
    ignoredPlanEntries: await ignoredPlanningWorktreeEntries(context, record),
  };
}

// The removal-time condition-7 facts of `facts` that fail, by name; empty when condition 7 holds.
function failedConditionSevenFacts(facts) {
  return [
    ...(facts.clean ? [] : ['clean']),
    ...(facts.quarantineRetained ? ['quarantineRetained'] : []),
    ...(facts.ignoredEndpoints?.length === 0 ? [] : ['ignoredEndpoints']),
    ...(facts.ignoredPlanEntries?.length === 0 ? [] : ['ignoredPlanEntries']),
    ...(facts.hiddenChanges?.length === 0 ? [] : ['hiddenChanges']),
  ];
}

// Gathers the facts of one valid record. `worktrees` is a fresh porcelain list; `ownLock` the
// token this actor holds on the record lock (null when none); `ownClaim` this actor's claim ID;
// `mergeGateRelease` adds the `releaseProof` of a `merge-gate` record (see `evaluateEligibility`).
export async function gatherFacts(
  context,
  roots,
  worktrees,
  record,
  { ownLock = null, ownClaim = null, mergeGateRelease = false },
) {
  const { fs } = context;
  const target = record.worktreePath;
  const registrations = worktrees.filter((entry) => matches(entry, target));
  const entry = registrations[0] ?? null;
  const facts = {
    schemaValid: true,
    ownershipCreated: record.ownership === OWNERSHIP,
    status: record.status,
    reason: record.reason,
    purpose: record.purpose,
    registrationCount: registrations.length,
    linked: Boolean(entry) && entry !== worktrees[0] && !entry.bare,
    locked: Boolean(entry?.locked),
    prunable: Boolean(entry?.prunable),
    registrationOnBranch: entry?.branch === `refs/heads/${record.branch}` && !entry?.detached,
    registeredHead: entry?.head ?? null,
    directoryExists: false,
    commonDirMatches: false,
    headOnBranch: false,
    branchTip: null,
    creationIsCommit: false,
    creationAncestor: false,
    clean: false,
    quarantineRetained: false,
    ignoredEndpoints: [],
    ignoredPlanEntries: [],
    hiddenChanges: [],
    isMain: target === roots.cwd || (worktrees[0] ? matches(worktrees[0], target) : false),
    isExecutionRoot: target === roots.executionRoot,
    foreignLock: false,
    foreignClaim: false,
    receiptMatches: false,
    gone: false,
  };
  let toplevel = null;
  Object.assign(facts, await proveOwnWorktree(context, roots, record));
  // Fully gone: unregistered and the path itself absent (ENOENT), proven without Git in it.
  facts.gone =
    registrations.length === 0 && !facts.directoryExists && (await pathAbsent(fs, target));
  // Every further in-worktree Git call reads the worktree's configuration, which a foreign
  // repository controls (`core.fsmonitor` runs a command on `status`). They run only once the
  // common directory proved the worktree this repository's; otherwise the facts stay false.
  if (facts.commonDirMatches) {
    const inWorktree = guardedGit(context, target);
    const line = async (args) => {
      const result = await inWorktree(args);
      return gitOk(result) ? gitStdout(result).trim() : null;
    };
    const top = await line(['rev-parse', '--show-toplevel']);
    toplevel = top === null ? null : await canonical(fs, top);
    facts.headOnBranch =
      (await line(['symbolic-ref', '-q', 'HEAD'])) === `refs/heads/${record.branch}`;
    Object.assign(facts, await conditionSevenFacts(context, roots, record));
  }
  facts.branchTip = await branchTip(context, record.branch);
  const commit = await runGit(context, context.cwd, [
    'cat-file',
    '-e',
    `${record.creationOid}^{commit}`,
  ]);
  facts.creationIsCommit = gitOk(commit);
  if (facts.creationIsCommit && facts.branchTip) {
    const ancestor = await runGit(context, context.cwd, [
      'merge-base',
      '--is-ancestor',
      record.creationOid,
      facts.branchTip,
    ]);
    facts.creationAncestor = gitOk(ancestor);
  }
  const receipt = record.receipt;
  facts.receiptFieldsMatch =
    record.repositoryIdentity === roots.common &&
    record.runtimeStateRoot === roots.cwd &&
    receipt.repositoryIdentity === roots.common &&
    receipt.runtimeStateRoot === roots.cwd &&
    receipt.executionRoot === target &&
    receipt.checkout.kind === 'branch' &&
    receipt.checkout.branch === record.branch &&
    receipt.origin === record.ownership &&
    receipt.workflow === record.workflow &&
    receipt.purpose === record.purpose;
  // The toplevel half of condition 2 needs the worktree itself; the release of a gone worktree
  // checks only the fields (`receiptFieldsMatch`).
  facts.receiptMatches = facts.receiptFieldsMatch && toplevel === target;
  const paths = recordPaths(roots.cwd, record.recordId);
  const lock = await observeRecordLock(context, paths);
  facts.lock = publicLock(lock, paths);
  facts.foreignLock =
    lock.present && !(ownLock && lock.owner.state === 'valid' && lock.owner.token === ownLock);
  facts.foreignClaim =
    record.status === 'cleanup-in-progress' && !(ownClaim && record.cleanupRunId === ownClaim);
  if (mergeGateReleaseApplies(facts, mergeGateRelease) && releaseProofApplies(facts)) {
    facts.releaseProof = await mergeGateReleaseProof(context, facts, record);
  }
  return facts;
}

// ---------------------------------------------------------------------------------------------
// The superseded-plan proof

// Whether cleanup derives the superseded-plan proof for a record (see the header): the
// preserved-plan release admits it, its worktree is present and proven ours, condition 7 is its
// only failed condition and it has no blocker. A known ignored entry alongside a non-empty status
// is reported by the proof's own `dirty-entries` rule; an unavailable scan never admits the proof.
// `mergeGateRelease` is the caller's cleanup-only flag, as `preservedPlanRelease` takes it.
function supersededPlanApplies(facts, { conditions, blockers }, mergeGateRelease) {
  return (
    preservedPlanRelease(facts, mergeGateRelease) &&
    facts.commonDirMatches === true &&
    facts.gone !== true &&
    conditions.length === 1 &&
    conditions[0] === 7 &&
    blockers.length === 0 &&
    facts.ignoredPlanEntries !== null &&
    failedConditionSevenFacts(facts)
      .filter((fact) => fact !== 'ignoredPlanEntries')
      .join() === 'clean'
  );
}

// The configuration of a cleanup call, or null when it cannot be resolved.
async function cleanupConfiguration(context, deps) {
  try {
    return await resolveConfiguration(
      { cwd: context.cwd, tool: 'cleanup' },
      { runner: context.runner, env: deps.env },
    );
  } catch {
    return null;
  }
}

// `plan.dir` of `config` (default DEFAULT_PLAN_DIR) without a leading `./` or a trailing `/`, or
// null when it is invalid or outside PLAN_DIR_PATTERN.
function planDirectory(config) {
  const entry = configEntry(config, 'plan.dir');
  if (entry.state === 'unset') return DEFAULT_PLAN_DIR;
  if (entry.state !== 'set') return null;
  const value = entry.value.replace(/^\.\//, '').replace(/\/+$/, '');
  return PLAN_DIR_PATTERN.test(value) ? value : null;
}

// The repository-wide inputs of the proof, read once per call without a fetch: `{planDir, baseRef,
// baseCommit}`, the commit of the local `refs/remotes/origin/<baseRef>` (`deliveryConfiguration`),
// or `{reason}`: `hidden-mode`, `base-unavailable` (no configuration, no safe base ref or no such
// local ref, an invalid `plan.dir`) or `proof-unavailable`.
async function supersededPlanInputs(git, tracking, deps) {
  const config = await cleanupConfiguration(git, deps);
  if (tracking.timedOut) return { reason: 'proof-unavailable' };
  if (config === null) return { reason: 'base-unavailable' };
  if (config.visibility === 'hidden') return { reason: 'hidden-mode' };
  const delivery = await deliveryConfiguration(git, deps, config);
  if (tracking.timedOut) return { reason: 'proof-unavailable' };
  const planDir = planDirectory(config);
  if (!delivery?.baseRef || planDir === null) return { reason: 'base-unavailable' };
  const resolved = await runGit(git, git.cwd, [
    '--no-replace-objects',
    'rev-parse',
    '--verify',
    '-q',
    `refs/remotes/origin/${delivery.baseRef}^{commit}`,
  ]);
  const baseCommit = gitOk(resolved) ? gitStdout(resolved).trim() : null;
  if (baseCommit !== null && OID_PATTERN.test(baseCommit)) {
    return { planDir, baseRef: delivery.baseRef, baseCommit };
  }
  if (resolved?.error || resolved?.timedOut || resolved?.status !== 1) {
    return { reason: 'proof-unavailable' };
  }
  return { reason: 'base-unavailable' };
}

// The raw blob OID of `content`, hashed without filters and without writing an object, or null.
async function rawBlobOid(git, content) {
  const result = await runGit(git, git.cwd, ['hash-object', '--no-filters', '--stdin'], {
    stdin: content,
  });
  const oid = gitOk(result) ? gitStdout(result).trim() : null;
  return oid !== null && OID_PATTERN.test(oid) ? oid : null;
}

// The plan file at `planPath` below the proven worktree `root`, read once: every directory down to
// it is a real directory inside `root` (no symbolic link), and the file is regular, read without
// following a link within MAX_PLAN_BYTES; its raw blob OID is hashed from those same bytes.
// `{state: 'ok', identity, content, blob}`, `missing`, `unsafe`, or `git-failed`.
async function readPlanFile(context, git, root, planPath) {
  const { fs } = context;
  let directory = root;
  for (const segment of planPath.split('/').slice(0, -1)) {
    directory = path.join(directory, segment);
    try {
      const info = await fs.lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) return { state: 'unsafe' };
    } catch (error) {
      return { state: error?.code === 'ENOENT' ? 'missing' : 'unsafe' };
    }
  }
  if ((await canonical(fs, directory)) !== directory) return { state: 'unsafe' };
  const read = await readBoundedFile(fs, path.join(root, planPath), MAX_PLAN_BYTES);
  if (read.state === 'missing') return { state: 'missing' };
  if (read.state !== 'ok') return { state: 'unsafe' };
  const blob = await rawBlobOid(git, read.content);
  if (blob === null) return { state: 'git-failed' };
  return { state: 'ok', identity: read.identity, content: read.content, blob };
}

// The entries of `git status --porcelain=v1 -z` as `{code, path}` (a rename or copy consumes its
// source field), or null when the output is malformed.
function porcelainEntries(buffer) {
  const fields = asBuffer(buffer).toString('utf8').split('\0');
  if (fields.pop() !== '') return null;
  const entries = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field.length < 4 || field[2] !== ' ') return null;
    const code = field.slice(0, 2);
    entries.push({ code, path: field.slice(3) });
    if (/[RC]/.test(code)) index += 1;
  }
  return entries;
}

// The blob of exactly one regular-file entry at `archivePath` in an `ls-tree -z` listing, else null
// (absent, a symbolic link, a gitlink, a tree).
function archiveBlob(result, archivePath) {
  const entries = gitStdout(result).split('\0').filter(Boolean);
  if (entries.length !== 1) return null;
  const entry = entries[0].match(/^(?:100644|100755) blob ([0-9a-f]+)\t([^]*)$/);
  return entry && entry[2] === archivePath && OID_PATTERN.test(entry[1]) ? entry[1] : null;
}

// Whether a recorded post-image of `git log --raw -z` is `blob`.
function recordsPostImage(result, blob) {
  return gitStdout(result)
    .split('\0')
    .map((field) => field.replace(/^\n+/, ''))
    .some((field) => field.startsWith(':') && field.slice(1).split(' ')[3] === blob);
}

// The superseded-plan proof of `record`, for one that `supersededPlanApplies` admits, with the
// `inputs` of `supersededPlanInputs`: `{ok: true, evidence, identity}`, or `{ok: false, reason}`
// with the first failing reason of SUPERSEDED_PLAN_REASONS. It writes nothing. `git` is the proof's
// Git context (`branchGitContext`): GIT_NO_REPLACE_OBJECTS=1, and in `cleanup plan` its budget.
async function supersededPlanProof(context, git, record, inputs) {
  if (inputs.reason) return { ok: false, reason: inputs.reason };
  const refused = (reason) => ({ ok: false, reason });
  const unavailable = refused('proof-unavailable');
  const { planDir, baseRef, baseCommit } = inputs;
  const status = await guardedGit(
    git,
    record.worktreePath,
  )([
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
    '--ignored=matching',
    '--ignore-submodules=none',
  ]);
  const entries = gitOk(status) ? porcelainEntries(status.stdout) : null;
  if (entries === null) return unavailable;
  const changed = entries.filter((entry) => entry.code !== '!!');
  if (
    changed.length !== 1 ||
    changed[0].code !== '??' ||
    entries.some((entry) => entry.code === '!!')
  ) {
    return refused('dirty-entries');
  }
  const planPath = changed[0].path;
  const name = planPath.slice(planDir.length + 1);
  if (
    !planPath.startsWith(`${planDir}/`) ||
    name.includes('/') ||
    !UNATTENDED_PLAN_NAME.test(name)
  ) {
    return refused('not-plan-file');
  }
  const preserved = await readPlanFile(context, git, record.worktreePath, planPath);
  if (preserved.state === 'git-failed') return unavailable;
  if (preserved.state !== 'ok') return refused('unsafe-plan-file');
  const archivePath = `${planDir}/archive/${name}`;
  const listing = await runGit(git, git.cwd, [
    '--no-replace-objects',
    'ls-tree',
    '-z',
    '--full-tree',
    baseCommit,
    '--',
    archivePath,
  ]);
  if (!gitOk(listing)) return unavailable;
  const archive = archiveBlob(listing, archivePath);
  if (archive === null) return refused('archive-missing');
  const size = await gitLine(git, git.cwd, ['--no-replace-objects', 'cat-file', '-s', archive]);
  if (size === null) return unavailable;
  if (Number(size) > MAX_PLAN_BYTES) return refused('archive-not-implemented');
  const read = await runGit(git, git.cwd, ['--no-replace-objects', 'cat-file', 'blob', archive]);
  if (!gitOk(read)) return unavailable;
  const archived = asBuffer(read.stdout);
  const archivedText = archived.toString('utf8');
  const archivedLines = canonicalPlanStatusLines(archivedText);
  if (
    classifyPlanText(archivedText).status !== 'implemented' ||
    archivedLines.length !== 1 ||
    !IMPLEMENTED_STATUS_LINE.test(archivedLines[0])
  ) {
    return refused('archive-not-implemented');
  }
  const preservedText = preserved.content.toString('utf8');
  const preservedLines = canonicalPlanStatusLines(preservedText);
  let match = null;
  if (
    classifyPlanText(preservedText).status === 'open' &&
    preservedLines.length === 1 &&
    OPEN_STATUS_LINE.test(preservedLines[0]) &&
    planCompletionMismatch(preserved.content, archived, { fatalUtf8: true }) === null
  ) {
    match = 'completion-prefix';
  } else {
    const history = await runGit(git, git.cwd, [
      '--no-replace-objects',
      'log',
      '--no-renames',
      '--full-history',
      '-m',
      '--no-abbrev',
      '--raw',
      '-z',
      '--format=',
      baseCommit,
      '--',
      `:(literal)${planPath}`,
      `:(literal)${archivePath}`,
    ]);
    if (!gitOk(history)) return unavailable;
    if (recordsPostImage(history, preserved.blob)) match = 'blob-history';
  }
  if (match === null) return refused('content-diverged');
  return {
    ok: true,
    identity: preserved.identity,
    evidence: {
      planPath,
      planBlob: preserved.blob,
      archivePath,
      archiveBlob: archive,
      match,
      baseRef,
      baseCommit,
    },
  };
}

// A prover of the superseded-plan proof for one call: it resolves the inputs at its first proof
// and reuses them. With `startedAt` (`cleanup plan`), every proof runs within the shared budget
// (see SUPERSEDED_PLAN_PROOF_BUDGET_MS), and one it no longer reaches is `proof-unavailable`;
// without it (`cleanup apply`), the call's own deadline bounds every Git call.
function supersededPlanProver(context, deps, startedAt = null) {
  const now = deps.now ?? Date.now;
  let state = null;
  return async (record) => {
    if (state === null) {
      let deadline = null;
      if (startedAt !== null) {
        const monotonic = deps.monotonicNow ?? (() => performance.now());
        const left = (deps.deadlineMs ?? DEFAULT_DEADLINE_MS) - (monotonic() - startedAt);
        const budget = Math.min(
          deps.supersededPlanProofBudgetMs ?? SUPERSEDED_PLAN_PROOF_BUDGET_MS,
          left - (deps.branchProofBudgetMs ?? BRANCH_PROOF_BUDGET_MS),
        );
        deadline = now() + Math.max(0, budget);
      }
      const tracking = { timedOut: false };
      const git = branchGitContext(context, tracking, deadline, now);
      state = { deadline, git, inputs: null };
      state.inputs =
        deadline !== null && now() >= deadline
          ? { reason: 'proof-unavailable' }
          : await supersededPlanInputs(git, tracking, deps);
    }
    if (state.deadline !== null && now() >= state.deadline) {
      return { ok: false, reason: 'proof-unavailable' };
    }
    return supersededPlanProof(context, state.git, record, state.inputs);
  };
}

// ---------------------------------------------------------------------------------------------
// Input validation

export function requireRecordId(value, label = 'recordId') {
  if (typeof value !== 'string' || !RECORD_ID_PATTERN.test(value)) {
    fail('INVALID_INPUT', `${label} must match ${RECORD_ID_PATTERN.source}`);
  }
  return value;
}

export function requireSessionId(value) {
  if (typeof value !== 'string' || !SESSION_ID_PATTERN.test(value)) {
    fail('INVALID_INPUT', `sessionId must match ${SESSION_ID_PATTERN.source}`);
  }
  return value;
}

// The applicable shape of `decisions` (all keys optional):
//   discardAll  legacy directory names whose open carry-over is discarded ("Carry over nothing")
//   discard     legacy-relative paths (`.firmo/<path>`) whose open carry-over is discarded
//   config      legacy configuration path → `complete` | `discarded`
export function requireDecisions(value) {
  if (value === undefined) return { discardAll: [], discard: [], config: {} };
  const decisions = requireObject(value, 'decisions');
  requireClosedKeys(decisions, ['discardAll', 'discard', 'config'], 'decisions');
  const list = (key, check) => {
    const entries = decisions[key] ?? [];
    if (!Array.isArray(entries) || entries.length > 10_000) {
      fail('INVALID_INPUT', `decisions.${key} must be an array`);
    }
    for (const entry of entries) {
      if (!check(entry)) fail('INVALID_INPUT', `decisions.${key} has an invalid entry`);
    }
    return [...new Set(entries)].sort();
  };
  const discardAll = list('discardAll', (entry) => LEGACY_RUNTIME_DIRS.includes(entry));
  const discard = list('discard', (entry) => {
    if (typeof entry !== 'string' || !isText(entry)) return false;
    const [head, ...rest] = entry.split('/');
    return (
      LEGACY_RUNTIME_DIRS.includes(head) &&
      rest.length > 0 &&
      rest.every((part) => part !== '' && part !== '.' && part !== '..')
    );
  });
  const config = {};
  if (decisions.config !== undefined) {
    const map = requireObject(decisions.config, 'decisions.config');
    const allowed = [
      TRANSITIONAL_CONFIG_FILE,
      ...LEGACY_RUNTIME_DIRS.map((name) => `${name}/${LEGACY_CONFIG_ENTRY}`),
    ];
    for (const [key, decision] of Object.entries(map)) {
      if (!allowed.includes(key))
        fail('INVALID_INPUT', `decisions.config has an unknown file: ${key}`);
      if (!['complete', 'discarded'].includes(decision)) {
        fail('INVALID_INPUT', `decisions.config.${key} must be complete or discarded`);
      }
      config[key] = decision;
    }
  }
  return { discardAll, discard, config };
}

// The `items` of `cleanup apply`, checked by shape only: every value is the bare `itemDigest`,
// except a `branch:` item's, which is exactly `{itemDigest, proof, proofCommit}`, and a proven
// `worktree:` item's, which is exactly `{itemDigest, proof: "preserved-plan-superseded"}`. What
// the values claim is re-derived by the pre-write pass, never trusted; which form a `worktree:`
// item needs is decided there too (a wrong form is PREVIEW_MISMATCH `proof-mismatch`).
function requireItems(value) {
  const items = requireObject(value, 'items');
  const ids = Object.keys(items);
  const limit = MAX_RECORD_IDS + 3 + MAX_BRANCH_ITEMS;
  if (ids.length === 0 || ids.length > limit) {
    fail('INVALID_INPUT', `items must select 1 to ${limit} items`);
  }
  for (const id of ids) {
    if (!ITEM_ID_PATTERN.test(id)) fail('INVALID_INPUT', `items has an invalid itemId: ${id}`);
    if (itemKind(id) === 'branch') {
      requireBranchItemValue(id, items[id]);
      continue;
    }
    if (itemKind(id) === 'worktree' && isObject(items[id])) {
      const entry = items[id];
      if (
        Object.keys(entry).length !== 2 ||
        typeof entry.itemDigest !== 'string' ||
        !SHA256_PATTERN.test(entry.itemDigest) ||
        entry.proof !== SUPERSEDED_PLAN_PROOF
      ) {
        fail(
          'INVALID_INPUT',
          `items.${id} must be a SHA-256 itemDigest or {itemDigest, proof: "${SUPERSEDED_PLAN_PROOF}"}`,
        );
      }
      continue;
    }
    if (typeof items[id] !== 'string' || !SHA256_PATTERN.test(items[id])) {
      fail('INVALID_INPUT', `items.${id} must be a SHA-256 itemDigest`);
    }
  }
  if (ids.filter((id) => itemKind(id) === 'branch').length > MAX_BRANCH_ITEMS) {
    fail('INVALID_INPUT', `items must select at most ${MAX_BRANCH_ITEMS} branch items`);
  }
  // Every record item takes a record lock and may run a removal; the three legacy items do not.
  const recordItems = ids.filter((id) => ['worktree', 'invalid-record'].includes(itemKind(id)));
  if (recordItems.length > MAX_RECORD_IDS) {
    fail(
      'INVALID_INPUT',
      `items must select at most ${MAX_RECORD_IDS} worktree and invalid-record items`,
    );
  }
  return items;
}

const BRANCH_ITEM_VALUE_KEYS = Object.freeze(['itemDigest', 'proof', 'proofCommit']);

function requireBranchItemValue(id, value) {
  const name = id.slice('branch:'.length);
  if (!isBranchName(name) || !SAFE_BRANCH_NAME_PATTERN.test(name)) {
    fail('INVALID_INPUT', `items has an invalid itemId: ${id}`);
  }
  if (
    !isObject(value) ||
    Object.keys(value).length !== BRANCH_ITEM_VALUE_KEYS.length ||
    BRANCH_ITEM_VALUE_KEYS.some((key) => !Object.hasOwn(value, key)) ||
    typeof value.itemDigest !== 'string' ||
    !SHA256_PATTERN.test(value.itemDigest) ||
    !BRANCH_PROOFS.includes(value.proof) ||
    typeof value.proofCommit !== 'string' ||
    !OID_PATTERN.test(value.proofCommit)
  ) {
    fail(
      'INVALID_INPUT',
      `items.${id} must be {itemDigest, proof, proofCommit} with a SHA-256 itemDigest, a proof of ${BRANCH_PROOFS.join('|')} and a full proofCommit`,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// worktree record-init

function staticRecordChecks(record) {
  const problem = recordProblem(record);
  if (problem) fail('INVALID_INPUT', `record is not a valid version 1 record: ${problem}`);
  if (record.status !== 'active' || record.reason !== null) {
    fail('INVALID_INPUT', 'record-init writes only an active record with a null reason');
  }
  if (!SESSION_ID_PATTERN.test(record.sessionId)) {
    fail('INVALID_INPUT', `record.sessionId must match ${SESSION_ID_PATTERN.source}`);
  }
  if (record.purpose === 'apply-review') {
    const prefix = `apply-review/${record.sessionId}/`;
    if (!record.branch.startsWith(prefix) || record.branch.length === prefix.length) {
      fail('INVALID_INPUT', `an apply-review branch must be ${prefix}<component>`);
    }
  }
  if (
    TEMPORARY_BRANCH_PURPOSES.includes(record.purpose) &&
    record.branch !== temporaryBranchName(record)
  ) {
    fail('INVALID_INPUT', `a ${record.purpose} branch must be ${temporaryBranchName(record)}`);
  }
  if (
    record.receipt.executionRoot !== record.worktreePath ||
    record.receipt.checkout.branch !== record.branch ||
    record.receipt.workflow !== record.workflow ||
    record.receipt.purpose !== record.purpose ||
    record.receipt.repositoryIdentity !== record.repositoryIdentity ||
    record.receipt.runtimeStateRoot !== record.runtimeStateRoot
  ) {
    fail('INVALID_INPUT', 'record.receipt does not match the record identity fields');
  }
}

export async function recordInit(input, deps) {
  const context = prepare('worktree record-init', input, deps);
  const record = requireObject(input.record, 'record');
  staticRecordChecks(record);
  const roots = await openRoots(context, input);
  const paths = recordPaths(roots.cwd, record.recordId);
  const bases = await resolveBases(context, deps);
  const proofs = [];
  if (record.repositoryIdentity !== roots.common) proofs.push('repository');
  if (record.runtimeStateRoot !== roots.cwd) proofs.push('runtime-root');
  const location = await requiredLocation(context, bases, record);
  if (
    location.exact !== undefined
      ? record.worktreePath !== location.exact
      : path.dirname(record.worktreePath) !== location.parent
  ) {
    proofs.push('path');
  }
  if ((await canonical(context.fs, record.worktreePath)) !== record.worktreePath) {
    proofs.push('path-not-canonical');
  }
  const exists = async (target) => {
    try {
      await context.fs.lstat(target);
      return true;
    } catch {
      return false;
    }
  };
  if ((await exists(paths.record)) || (await exists(paths.lock))) {
    return new StateOutcome('RECORD_EXISTS', { recordId: record.recordId, path: paths.record });
  }
  return deferSignals(deps, record.recordId, (signals) =>
    withRecordLock(
      context,
      paths,
      { operation: 'worktree record-init', runId: record.sessionId },
      deps,
      async () => {
        await phase(deps, 'underLock', {
          operation: 'worktree record-init',
          recordId: record.recordId,
        });
        const worktrees = await listWorktrees(context);
        const registrations = worktrees.filter((entry) => matches(entry, record.worktreePath));
        const entry = registrations[0];
        if (registrations.length !== 1) proofs.push('not-registered');
        else {
          if (entry === worktrees[0] || entry.bare) proofs.push('not-linked');
          if (entry.locked) proofs.push('locked');
          if (entry.prunable) proofs.push('prunable');
          if (entry.branch !== `refs/heads/${record.branch}` || entry.detached) {
            proofs.push('head-not-on-branch');
          }
        }
        if (
          (await branchTip(context, record.branch)) !== record.creationOid ||
          (registrations.length === 1 && entry.head !== record.creationOid)
        ) {
          proofs.push('tip-not-creation-oid');
        }
        for (const id of await listRecordIds(context)) {
          if (id === record.recordId) continue;
          const other = await readBoundedFile(
            context.fs,
            recordPaths(roots.cwd, id).record,
            MAX_RECORD_BYTES,
          );
          if (other.state !== 'ok') continue;
          try {
            if (JSON.parse(other.content.toString('utf8'))?.worktreePath === record.worktreePath) {
              proofs.push('already-recorded');
              break;
            }
          } catch {
            // An unreadable record names nothing.
          }
        }
        if (proofs.length > 0) {
          return new StateOutcome('NOT_ELIGIBLE', { recordId: record.recordId, proofs });
        }
        if (signals.signal) return interruptedUnderLock(signals, record.recordId, null);
        const created = await createNoClobber(context, paths.record, serialize(record), {
          tempPrefix: '.record-init-',
        });
        if (!created.created) {
          return new StateOutcome('RECORD_EXISTS', {
            recordId: record.recordId,
            path: paths.record,
          });
        }
        return { recordId: record.recordId, path: paths.record, status: 'active' };
      },
    ),
  );
}

// ---------------------------------------------------------------------------------------------
// worktree transition

function requireTransition(input) {
  const recordId = requireRecordId(input.recordId);
  const sessionId = requireSessionId(input.sessionId);
  if (!Object.hasOwn(TRANSITIONS, input.from) && !RECORD_STATUSES.includes(input.from)) {
    fail('INVALID_INPUT', `from must be one of ${RECORD_STATUSES.join(', ')}`);
  }
  if (!RECORD_STATUSES.includes(input.to)) {
    fail('INVALID_INPUT', `to must be one of ${RECORD_STATUSES.join(', ')}`);
  }
  if (!Object.hasOwn(input, 'reason')) fail('INVALID_INPUT', 'reason is required (null or text)');
  const adoption = input.to === 'active';
  for (const key of ['branch', 'workflow']) {
    if (input[key] === undefined) {
      if (adoption) fail('INVALID_INPUT', `${key} is required for an adoption`);
    } else if (key === 'branch' ? !isBranchName(input.branch) : !isText(input.workflow, 128)) {
      fail('INVALID_INPUT', `${key} is invalid`);
    }
  }
  // The adoption discriminator: absent means `plan-pr-continuation`; outside an adoption it is
  // forbidden. The resume adoption forbids `fetchedHeadOid` and requires `visibility`.
  let adoptionKind = null;
  if (adoption) {
    adoptionKind = input.adoption ?? PLAN_PR_ADOPTION;
    if (!ADOPTIONS.includes(adoptionKind)) {
      fail('INVALID_INPUT', `adoption must be one of ${ADOPTIONS.join(', ')}`);
    }
  } else if (input.adoption !== undefined) {
    fail('INVALID_INPUT', 'adoption is only valid for an adoption (to: active)');
  }
  if (adoptionKind === PLAN_PR_ADOPTION) {
    if (typeof input.fetchedHeadOid !== 'string' || !OID_PATTERN.test(input.fetchedHeadOid)) {
      fail('INVALID_INPUT', 'fetchedHeadOid must be a full commit OID for an adoption');
    }
  } else if (input.fetchedHeadOid !== undefined) {
    fail(
      'INVALID_INPUT',
      adoptionKind === RESUME_ADOPTION
        ? 'fetchedHeadOid is not valid for a partial-diff-resume adoption'
        : 'fetchedHeadOid is only valid for an adoption',
    );
  }
  if (adoptionKind === RESUME_ADOPTION) {
    if (!VISIBILITY_VALUES.includes(input.visibility)) {
      fail(
        'INVALID_INPUT',
        `visibility must be one of ${VISIBILITY_VALUES.join(', ')} for a partial-diff-resume adoption`,
      );
    }
  } else if (input.visibility !== undefined) {
    fail('INVALID_INPUT', 'visibility is only valid for a partial-diff-resume adoption');
  }
  let release = false;
  if (input.release !== undefined) {
    if (input.release !== RELEASE_DISCRIMINATOR) {
      fail('INVALID_INPUT', `release must be "${RELEASE_DISCRIMINATOR}"`);
    }
    if (!RELEASE_TRANSITIONS[input.from]?.includes(input.to)) {
      fail('INVALID_INPUT', 'release is only valid for aborted or failed -> cleanup-ready');
    }
    release = true;
  }
  return {
    recordId,
    sessionId,
    from: input.from,
    to: input.to,
    reason: input.reason,
    adoption,
    adoptionKind,
    release,
    branch: input.branch,
    workflow: input.workflow,
    visibility: input.visibility,
  };
}

function reasonProblem(to, reason) {
  if (NULL_REASON_STATUSES.includes(to)) return reason === null ? null : 'must be null';
  return isText(reason, MAX_REASON_CHARS) ? null : 'must be a non-empty string';
}

// `releaseProofs` and `resumeProofs` are the proof sets of the release transition and of the
// resume adoption, supplied only by `effective-flow-state-recovery-core.mjs` (the dispatch sends
// every input with `release` or `adoption: "partial-diff-resume"` there). Each is called as
// `fn({context, roots, paths, record, request, held, signals, deps})` under the record lock and
// returns its result (`release` or `resume`) or a StateOutcome refusal; `resumeProofs` also writes
// the recovered ledger entry, if any, before the record is written here.
export async function transition(input, deps, { releaseProofs = null, resumeProofs = null } = {}) {
  const context = prepare('worktree transition', input, deps);
  const request = requireTransition(input);
  if (request.release && typeof releaseProofs !== 'function') {
    fail(
      'INTERNAL_ERROR',
      'the release transition runs through effective-flow-state-recovery-core',
    );
  }
  const resume = request.adoptionKind === RESUME_ADOPTION;
  if (resume && typeof resumeProofs !== 'function') {
    fail('INTERNAL_ERROR', 'the resume adoption runs through effective-flow-state-recovery-core');
  }
  const allowed = request.release ? RELEASE_TRANSITIONS : TRANSITIONS;
  if (!allowed[request.from]?.includes(request.to)) {
    return new StateOutcome('TRANSITION_INVALID', { from: request.from, to: request.to });
  }
  const problem = reasonProblem(request.to, request.reason);
  if (problem) fail('INVALID_INPUT', `reason ${problem} for status ${request.to}`);
  return deferSignals(deps, request.recordId, async (signals) => {
    const roots = await openRoots(context, input);
    const paths = recordPaths(roots.cwd, request.recordId);
    return withRecordLock(
      context,
      paths,
      { operation: 'worktree transition', runId: request.sessionId },
      deps,
      async (held) => {
        await phase(deps, 'underLock', {
          operation: 'worktree transition',
          recordId: request.recordId,
        });
        const read = await readRecord(context, paths, request.recordId);
        if (read.state === 'missing') {
          return new StateOutcome('RECORD_NOT_FOUND', { recordId: request.recordId });
        }
        if (read.state === 'invalid') {
          fail('INVALID_STATE', `${paths.record} is not a valid record (${read.reason})`);
        }
        const record = read.record;
        if (record.status !== request.from) {
          return new StateOutcome('STATUS_MISMATCH', {
            recordId: record.recordId,
            expected: request.from,
            status: record.status,
          });
        }
        // An adoption and a release replace the session-ownership check by their own proofs.
        if (!request.adoption && !request.release && record.sessionId !== request.sessionId) {
          return new StateOutcome('NOT_OWNER', {
            recordId: record.recordId,
            reason: 'session-mismatch',
          });
        }
        for (const key of ['branch', 'workflow']) {
          if (!request.adoption && input[key] !== undefined && input[key] !== record[key]) {
            return new StateOutcome('NOT_ELIGIBLE', { recordId: record.recordId, proofs: [key] });
          }
        }
        if (record.repositoryIdentity !== roots.common || record.runtimeStateRoot !== roots.cwd) {
          return new StateOutcome('NOT_ELIGIBLE', {
            recordId: record.recordId,
            proofs: ['repository'],
          });
        }
        let resumed = null;
        if (resume) {
          resumed = await resumeProofs({
            context,
            roots,
            paths,
            record,
            request,
            held,
            signals,
            deps,
          });
          if (resumed instanceof StateOutcome) return resumed;
        } else if (request.adoption) {
          const refused = await adoptionProofs(context, roots, record, input, held);
          if (refused) return refused;
        }
        let released = null;
        if (request.release) {
          released = await releaseProofs({
            context,
            roots,
            paths,
            record,
            request,
            held,
            signals,
            deps,
          });
          if (released instanceof StateOutcome) return released;
        }
        const next = {
          ...record,
          status: request.to,
          reason: request.reason,
          updatedAt: timestamp(deps),
          ...(request.adoption || request.release ? { sessionId: request.sessionId } : {}),
        };
        // A signal skips the write, except after a release that restored residual paths: those
        // were discarded already, so the record write completes and `deferSignals` reports it
        // as INTERRUPTED with `written: true` and the `release` that landed. A resume adoption
        // that already appended its recovered tip to the ledger reports that append.
        if (signals.signal && !(released?.restored.length > 0)) {
          const interrupted = interruptedUnderLock(signals, record.recordId, record.status);
          if (resumed?.recovered) {
            return new StateOutcome('INTERRUPTED', {
              ...interrupted.details,
              ledgerAppended: true,
              appendedOid: resumed.recovered,
            });
          }
          return interrupted;
        }
        await writeRecord(context, paths, next, held);
        return {
          recordId: record.recordId,
          from: request.from,
          status: request.to,
          sessionId: next.sessionId,
          ...(released ? { release: released } : {}),
          ...(resumed ? { resume: resumed } : {}),
        };
      },
    );
  });
}

// The adoption proofs of `plan-pr-continuation.md`: purpose `delivery`, the same branch and
// workflow, `creationOid` equal to the fetched head and an ancestor of the tip, and the removal
// conditions 2 to 7 and 9 (registration, receipt, branch, clean status, no foreign claim).
async function adoptionProofs(context, roots, record, input, held) {
  const proofs = [];
  if (record.purpose !== 'delivery') proofs.push('purpose');
  if (input.branch !== record.branch) proofs.push('branch');
  if (input.workflow !== record.workflow) proofs.push('workflow');
  if (input.fetchedHeadOid !== record.creationOid) proofs.push('fetched-head');
  const worktrees = await listWorktrees(context);
  const facts = await gatherFacts(context, roots, worktrees, record, { ownLock: held.token });
  const conditions = evaluateEligibility(facts, { statuses: ['aborted', 'failed'] }).filter(
    (condition) => condition !== 8,
  );
  if (proofs.length === 0 && conditions.length === 0) return null;
  return new StateOutcome('NOT_ELIGIBLE', { recordId: record.recordId, proofs, conditions });
}

// ---------------------------------------------------------------------------------------------
// worktree inspect

// `mergeGateRelease` is set only by `cleanup plan`: each valid record then carries the `blockers`
// of `assessEligibility` beside its conditions. `worktree inspect` never sets it. `recordSet`
// (`cleanup plan` only) is the one `readRecordSet` read of the record files: `records` then holds
// its valid records alone, never re-read, and `cleanup plan` reports the invalid ones and the names
// that are no record ID once, from the same read, as the `invalid-record` class.
async function inspectRecords(
  context,
  roots,
  { sessionId = null, mergeGateRelease = false, recordSet = null } = {},
) {
  const worktrees = await listWorktrees(context);
  const records = [];
  const sources = new Map();
  const facts = new Map();
  const named = new Set();
  const ids = recordSet === null ? await listRecordIds(context) : [...recordSet.valid.keys()];
  for (const id of ids) {
    const paths = recordPaths(roots.cwd, id);
    const read =
      recordSet === null
        ? await readRecord(context, paths, id)
        : { state: 'ok', record: recordSet.valid.get(id) };
    if (read.state !== 'ok') {
      if (sessionId === null) {
        records.push({
          recordId: id,
          valid: false,
          reason: read.reason ?? read.state,
          conditions: [1],
          lock: publicLock(await observeRecordLock(context, paths), paths),
        });
      }
      continue;
    }
    const record = read.record;
    named.add(record.worktreePath);
    if (sessionId !== null && record.sessionId !== sessionId) continue;
    const recordFacts = await gatherFacts(context, roots, worktrees, record, { mergeGateRelease });
    const { conditions, blockers } = assessEligibility(recordFacts, {
      removal: true,
      mergeGateRelease,
    });
    sources.set(id, record);
    facts.set(id, recordFacts);
    records.push({
      recordId: id,
      valid: true,
      sessionId: record.sessionId,
      componentId: record.componentId,
      workflow: record.workflow,
      purpose: record.purpose,
      worktreePath: record.worktreePath,
      branch: record.branch,
      branchPolicy: record.branchPolicy,
      status: record.status,
      reason: record.reason,
      ...(record.status === 'cleanup-in-progress'
        ? { cleanupRunId: record.cleanupRunId, claimedAt: record.claimedAt }
        : {}),
      tip: recordFacts.branchTip,
      conditions,
      ...(mergeGateRelease ? { blockers } : {}),
      lock: recordFacts.lock,
    });
  }
  const orphanLedgers = [];
  const recordIds = new Set(await listRecordIds(context));
  const ledgers = await listLedgerIdsOrUnsafe(context, roots.cwd);
  for (const id of ledgers.ids) {
    if (!RECORD_ID_PATTERN.test(id) || recordIds.has(id)) continue;
    orphanLedgers.push({
      recordId: id,
      reason: 'orphan-ledger',
      path: ledgerPaths(roots.cwd, id).ledger,
    });
  }
  const orphanLocks = [];
  for (const id of await listOrphanLocks(context)) {
    const paths = recordPaths(roots.cwd, id);
    orphanLocks.push({
      recordId: id,
      reason: 'orphan-lock',
      lock: publicLock(await observeRecordLock(context, paths), paths),
    });
  }
  return {
    worktrees,
    records,
    sources,
    facts,
    named,
    orphanLocks,
    orphanLedgers,
    ledgerDirectory: ledgers.finding,
  };
}

// The ledger IDs of `listLedgerIds` and no finding, or, when the guard refuses the `ledgers/`
// entry itself (a symbolic link, a file), no IDs and the one finding `{reason: 'unsafe', path}`:
// an unsafe ledger directory is reported, never read or deleted through, and never stops the
// listing of the records. Any other failure still ends the call.
async function listLedgerIdsOrUnsafe(context, cwd) {
  try {
    return { ids: await listLedgerIds(context, cwd), finding: null };
  } catch (error) {
    if (!(error instanceof RuntimeStateError) || error.code !== 'UNSAFE_TARGET') throw error;
    return { ids: [], finding: { reason: 'unsafe', path: ledgersDir(cwd) } };
  }
}

function isBelow(parent, target) {
  const relative = path.relative(parent, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function unrecordedWorktrees(context, roots, worktrees, named, sessionId, deps) {
  let sessionRoots = null;
  if (sessionId !== null) {
    const bases = await resolveBases(context, deps);
    const repo = path.basename(roots.cwd);
    sessionRoots = await Promise.all(
      [
        path.join(bases.worktree, repo, sessionId),
        ...Object.values(PURPOSE_SUFFIXES).map((suffix) =>
          path.join(bases.worktree, repo, `${sessionId}${suffix}`),
        ),
        path.join(bases.applyReview, repo, sessionId),
      ].map((candidate) => canonicalOrSelf(context.fs, candidate)),
    );
  }
  return worktrees
    .slice(1)
    .filter((entry) => !named.has(entry.path) && !named.has(entry.canonical))
    .filter(
      (entry) =>
        sessionRoots === null ||
        sessionRoots.some(
          (root) =>
            [entry.path, entry.canonical].includes(root) ||
            isBelow(root, entry.canonical ?? entry.path),
        ),
    )
    .map((entry) => ({
      path: entry.canonical ?? entry.path,
      branch: entry.branch?.startsWith('refs/heads/') ? entry.branch.slice(11) : null,
      head: entry.head,
      detached: entry.detached,
      locked: entry.locked,
      prunable: entry.prunable,
      isExecutionRoot: (entry.canonical ?? entry.path) === roots.executionRoot,
    }));
}

export async function inspect(input, deps) {
  const context = prepare('worktree inspect', input, deps);
  const sessionId = input.sessionId === undefined ? null : requireSessionId(input.sessionId);
  const roots = await openRoots(context, input);
  const { worktrees, records, named, orphanLocks, orphanLedgers, ledgerDirectory } =
    await inspectRecords(context, roots, { sessionId });
  return {
    runtimeStateRoot: roots.cwd,
    executionRoot: roots.executionRoot,
    sessionId,
    records,
    orphanLocks,
    // A ledger without its record, reported and never removed.
    orphanLedgers,
    // Only when the `ledgers/` entry is unsafe: `{reason: 'unsafe', path}`, and no ledger listed.
    ...(ledgerDirectory ? { ledgerDirectory } : {}),
    unrecorded: await unrecordedWorktrees(context, roots, worktrees, named, sessionId, deps),
  };
}

// ---------------------------------------------------------------------------------------------
// Signals and deadline

function watchSignals(deps) {
  const target = deps.signalTarget;
  const state = { signal: null, dispose: () => {} };
  if (target && typeof target.on === 'function') {
    const handlers = WORKTREE_SIGNALS.map((signal) => {
      const handler = () => {
        if (state.signal === null) state.signal = signal;
      };
      target.on(signal, handler);
      return [signal, handler];
    });
    state.dispose = () => {
      for (const [signal, handler] of handlers) target.off(signal, handler);
    };
  }
  return state;
}

// The deadline of one `worktree remove` or `cleanup apply` call, started before its first Git
// call. `canStart()` is false once less than the per-item floor is left; `gitBudget()` is the
// bound of the next Git call: what is left of the deadline, plus the reconciliation reserve while
// `reconciling` is set (the guarded `cleanup-failed` write of an in-flight claim).
function startClock(deps) {
  const now = deps.monotonicNow ?? (() => performance.now());
  const limit = deps.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const floor = deps.itemFloorMs ?? ITEM_FLOOR_MS;
  const reserve = deps.reconcileReserveMs ?? RECONCILE_RESERVE_MS;
  const start = now();
  const left = () => limit - (now() - start);
  const clock = {
    limit,
    floor,
    reconciling: false,
    remaining: () => Math.max(0, left()),
    canStart: () => left() >= floor,
    gitBudget: () => Math.max(1, Math.ceil(left() + (clock.reconciling ? reserve : 0))),
  };
  return clock;
}

// Bounds every Git call of `context` by `clock`: each call gets the remaining budget as
// `timeoutMs` (never more than a bound it already carries) and runs in its own process group, so
// the bound stops a hook or helper Git starts with it. A timed-out call is an ordinary failed
// result (`timedOut: true`) that the caller reconciles; its bound is returned as `boundMs`.
function boundGit(context, clock) {
  const runner = context.runner;
  context.clock = clock;
  context.runner = async (request) => {
    const budget = clock.gitBudget();
    const timeoutMs =
      typeof request.timeoutMs === 'number' ? Math.min(request.timeoutMs, budget) : budget;
    const result = await runner({ ...request, timeoutMs, processGroup: true });
    return result && typeof result === 'object' ? { ...result, boundMs: timeoutMs } : result;
  };
}

// Runs `fn` with the reconciliation reserve of the call's clock, if any.
async function reconciling(context, fn) {
  const clock = context.clock;
  if (!clock) return fn();
  const previous = clock.reconciling;
  clock.reconciling = true;
  try {
    return await fn();
  } finally {
    clock.reconciling = previous;
  }
}

// The exact failure of a Git call: its spawn error, a timeout of its bound, or its stderr line.
function gitFailureDetail(result, fallback) {
  if (result?.error) return result.error.message ?? result.error.code ?? fallback;
  if (result?.timedOut) return `${fallback}: timed out after ${result.boundMs} ms`;
  return errorDetail(result?.stderr) || fallback;
}

// ---------------------------------------------------------------------------------------------
// Sandbox preflight

// The nearest existing directory at or above `target`, not above `stop`.
async function nearestDirectory(fs, target, stop) {
  let current = target;
  for (;;) {
    try {
      const info = await fs.lstat(current);
      if (info.isDirectory() && !info.isSymbolicLink()) return current;
    } catch {
      // Keep climbing.
    }
    if (current === stop || path.dirname(current) === current) return null;
    current = path.dirname(current);
  }
}

// The directories Git writes to when removing `record`'s worktree and, for a temporary branch,
// deleting its ref. For a `gone` worktree no Git call runs in its vanished path: it has no
// administrative directory left to probe.
async function preflightDirectories(context, roots, record, { gone = false } = {}) {
  const { fs } = context;
  const directories = [];
  const gitDir = gone
    ? null
    : await gitLine(context, record.worktreePath, [
        'rev-parse',
        '--path-format=absolute',
        '--git-dir',
      ]);
  const canonicalGitDir = gitDir === null ? null : await canonical(fs, gitDir);
  if (canonicalGitDir && isBelow(path.join(roots.common, 'worktrees'), canonicalGitDir)) {
    directories.push(canonicalGitDir);
  }
  directories.push(roots.common);
  if (record.branchPolicy === 'delete-after-integration') {
    directories.push(...(await branchRefDirectories(fs, roots.common, record.branch)));
  }
  const parent = await nearestDirectory(fs, path.dirname(record.worktreePath), '/');
  if (parent) directories.push(parent);
  return [...new Set(directories)];
}

// Creates and removes one probe file in each of `directories`. Returns null, or the first denied
// directory.
async function probeDirectories(context, directories, deps) {
  for (const directory of directories) {
    const probe = path.join(directory, `.effective-flow-probe-${randomHex(deps, 8)}`);
    let handle;
    try {
      handle = await context.fs.open(probe, PROBE_FLAGS, 0o600);
    } catch (error) {
      return { directory, errno: error?.code ?? 'EACCES' };
    }
    await handle.close().catch(() => {});
    try {
      await context.fs.unlink(probe);
    } catch (error) {
      return { directory, errno: error?.code ?? 'EACCES', probe };
    }
  }
  return null;
}

// The sandbox preflight of `record`'s worktree removal (`preflightDirectories` takes `options`).
async function preflight(context, roots, record, deps, options = {}) {
  return probeDirectories(
    context,
    await preflightDirectories(context, roots, record, options),
    deps,
  );
}

// ---------------------------------------------------------------------------------------------
// Integration proof

// The `git patch-id --verbatim` of every non-merge commit in `range`: Map commit → patch ID.
async function patchIds(context, range) {
  const log = await runGit(context, context.cwd, [
    'log',
    '-p',
    '--no-merges',
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '--no-renames',
    '--format=commit %H',
    range,
  ]);
  if (!gitOk(log)) return null;
  const ids = new Map();
  if (asBuffer(log.stdout).length === 0) return ids;
  const patch = await runGit(context, context.cwd, ['patch-id', '--verbatim'], {
    stdin: asBuffer(log.stdout),
  });
  if (!gitOk(patch)) return null;
  for (const line of gitStdout(patch).split('\n')) {
    const [id, commit] = line.trim().split(/\s+/);
    if (id && commit) ids.set(commit, id);
  }
  return ids;
}

async function revList(context, args) {
  const result = await runGit(context, context.cwd, ['rev-list', ...args]);
  if (!gitOk(result)) return null;
  return gitStdout(result)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

// Proves that every commit of `branchOid` beyond the merge base with the integration target has an
// exact `--verbatim` patch-id match on the target. Returns `{proven, reason, unproven}`.
//
// The proof is deliberately conservative: a merge commit on the branch, a missing merge base or any
// Git failure is unproven, never assumed integrated. `--verbatim` keeps whitespace significant, so
// a commit counts only when its diff is byte-identical on the target; a reworded or reordered
// squash is reported with its commits rather than deleted. A branch with no commits beyond the
// merge base is proven only when it is an ancestor of the target (`ancestor`).
export async function integrationProof(context, branchOid, targetOid) {
  const mergeBase = await gitLine(context, context.cwd, ['merge-base', targetOid, branchOid]);
  if (!mergeBase) return { proven: false, reason: 'no-merge-base', unproven: [branchOid] };
  const merges = await revList(context, ['--merges', `${mergeBase}..${branchOid}`]);
  if (merges === null) return { proven: false, reason: 'git-failed', unproven: [] };
  if (merges.length > 0) {
    return {
      proven: false,
      reason: 'merge-commit',
      unproven: merges.slice(0, MAX_REPORTED_COMMITS),
    };
  }
  const commits = await revList(context, ['--reverse', `${mergeBase}..${branchOid}`]);
  if (commits === null) return { proven: false, reason: 'git-failed', unproven: [] };
  if (commits.length === 0) {
    const ancestor = await runGit(context, context.cwd, [
      'merge-base',
      '--is-ancestor',
      branchOid,
      targetOid,
    ]);
    return gitOk(ancestor)
      ? { proven: true, reason: 'ancestor', unproven: [] }
      : { proven: false, reason: 'not-ancestor', unproven: [] };
  }
  const branchIds = await patchIds(context, `${mergeBase}..${branchOid}`);
  const targetIds = await patchIds(context, `${mergeBase}..${targetOid}`);
  if (!branchIds || !targetIds) return { proven: false, reason: 'git-failed', unproven: commits };
  const present = new Set(targetIds.values());
  const unproven = commits.filter((commit) => !present.has(branchIds.get(commit)));
  return unproven.length === 0
    ? { proven: true, reason: 'patch-id', unproven: [] }
    : {
        proven: false,
        reason: 'patch-id-mismatch',
        unproven: unproven.slice(0, MAX_REPORTED_COMMITS),
      };
}

// Applies `delete-after-integration` after the worktree is gone. Returns the branch outcome:
// `{outcome: 'deleted' | 'deleted-after-proof' | 'missing'}` or
// `{outcome: 'retained', reason, unproven, detail}` (`detail` is Git's `branch -d` refusal).
//
// `git branch -d` is always tried first. Only a call that carries `integrationRoot` (the
// `apply-review` squash or rebase flow, where `branch -d` cannot see the integration) may fall back
// to the patch-id proof, and only then is the branch deleted with `update-ref -d` bound to the
// exact `branchOid` that was proven: a branch that moved since is `ref-moved` and stays. Without
// `integrationRoot` the branch is retained as `not-merged` with the commits `HEAD` lacks, and the
// only other forced deletion is the purpose exception of TEMPORARY_BRANCH_PURPOSES
// (`base-validation`, `issue-planning`): their temporary branch is never integrated, so
// `branch -d` may refuse it whatever `HEAD` is. Instead of the patch-id proof, a tip that still
// equals the record's `creationOid` holds no commit of its own and is compare-and-deleted at that
// OID (`proof: 'unadvanced'`), but only while the record still binds it (`<purpose>/<SESSION_ID>`,
// `delete-after-integration`; else `binding`) and another ref
// still reaches `creationOid` (else `unreachable`), so the deletion never drops the last ref to a
// commit. A tip that moved is retained as `advanced` with its new commits. Every retained outcome
// keeps the branch and still lets the record go.
async function deleteTemporaryBranch(context, record, integration, deps) {
  const branch = record.branch;
  const branchOid = await branchTip(context, branch);
  if (!branchOid) return { outcome: 'missing', branch };
  const soft = await runGit(context, context.cwd, ['branch', '-d', branch]);
  if (gitOk(soft)) return { outcome: 'deleted', branch, branchOid };
  const refusal = errorDetail(soft?.stderr);
  const retained = (reason, unproven = [], extra = {}) => ({
    outcome: 'retained',
    branch,
    branchOid,
    reason,
    unproven,
    detail: refusal,
    ...extra,
  });
  // A refused compare-and-delete keeps the branch; a failed recreate names its restore command.
  const refusedDeletion = ({ refused, restore }) =>
    retained(refused, [], restore === undefined ? {} : { restore });
  const deletedConfig = ({ configRemoved, configRemaining }) => ({
    ...(configRemoved ? { configRemoved } : {}),
    ...(configRemaining ? { configRemaining } : {}),
  });
  if (TEMPORARY_BRANCH_PURPOSES.includes(record.purpose)) {
    if (branchOid !== record.creationOid) {
      const advanced = await revList(context, [
        `--max-count=${MAX_REPORTED_COMMITS}`,
        branchOid,
        '--not',
        record.creationOid,
      ]);
      return retained('advanced', advanced ?? []);
    }
    if (
      branch !== temporaryBranchName(record) ||
      record.branchPolicy !== 'delete-after-integration'
    ) {
      return retained('binding');
    }
    if (!(await reachedElsewhere(context, record.creationOid, branch))) {
      return retained('unreachable');
    }
    const deletion = await compareAndDeleteBranch(context, branch, branchOid, deps);
    if (deletion.refused) return refusedDeletion(deletion);
    return {
      outcome: 'deleted-after-proof',
      branch,
      branchOid,
      proof: 'unadvanced',
      ...deletedConfig(deletion),
    };
  }
  if (!integration) {
    const unmerged = await revList(context, [
      `--max-count=${MAX_REPORTED_COMMITS}`,
      branchOid,
      '--not',
      'HEAD',
    ]);
    return retained('not-merged', unmerged ?? []);
  }
  if (integration.branch === branch || integration.excluded.includes(integration.branch)) {
    return retained('target-is-component');
  }
  const targetOid = await branchTip(context, integration.branch);
  if (!targetOid) return retained('target-missing');
  const proof = await integrationProof(context, branchOid, targetOid);
  if (!proof.proven) return retained(proof.reason, proof.unproven);
  const deletion = await compareAndDeleteBranch(context, branch, branchOid, deps);
  if (deletion.refused) return refusedDeletion(deletion);
  return {
    outcome: 'deleted-after-proof',
    branch,
    branchOid,
    proof: proof.reason,
    ...deletedConfig(deletion),
  };
}

// Whether a ref other than `refs/heads/<branch>` contains `oid`. A failed Git call counts as no.
async function reachedElsewhere(context, oid, branch) {
  const result = await runGit(context, context.cwd, [
    'for-each-ref',
    '--format=%(refname)',
    '--contains',
    oid,
  ]);
  if (!gitOk(result)) return false;
  return gitStdout(result)
    .split('\n')
    .map((line) => line.trim())
    .some((ref) => ref !== '' && ref !== `refs/heads/${branch}`);
}

// Deletes `refs/heads/<branch>` only while it still points at the proven `branchOid`, is no
// symbolic ref, and no worktree checks it out or uses it (`branchesInUse`). Returns
// `{refused: null}` once deleted, with the removed `branch.<branch>.*` configuration
// (`configRemoved`, or `configRemaining` when its removal failed; neither fails the deletion), else
// `{refused}`: `interrupted` (a signal recorded before the delete, only with `signals`), `checked-out`, `in-use`, `ref-moved` (also a ref that became symbolic, or whose
// symbolic state is unknown), or `ref-recreate-failed` with the `restore` command. Both
// `update-ref` calls pass `--no-deref`, so a symbolic ref's target is never touched. A delete that
// failed or timed out is re-read: a ref that is gone counts as deleted (a hook can be stopped after
// the transaction committed), so only a present or unreadable ref is `ref-moved`. A worktree that
// checks the branch out after the deletion, or a relist that fails, gets the ref recreated at
// `branchOid` (`git update-ref --no-deref <ref> <oid> ''`, which creates it only while it is
// absent) and is `checked-out`.
async function compareAndDeleteBranch(context, branch, branchOid, deps, signals = null) {
  const ref = `refs/heads/${branch}`;
  const checkedOut = (await listWorktrees(context)).some((entry) => entry.branch === ref);
  if (checkedOut) return { refused: 'checked-out' };
  const inUse = await branchesInUse(context.fs, context.common);
  if (inUse.unreadable || inUse.names.has(branch)) return { refused: 'in-use' };
  await phase(deps, 'beforeBranchDelete', { branch, branchOid });
  if ((await isSymbolicBranch(context, branch)) !== false) return { refused: 'ref-moved' };
  // A signal recorded during the checks above stops the deletion; the delete itself is the last
  // step a signal can still prevent.
  if (signals?.signal) return { refused: 'interrupted', signal: signals.signal };
  const deleted = await runGit(context, context.cwd, [
    'update-ref',
    '--no-deref',
    '-d',
    ref,
    branchOid,
  ]);
  // What follows a delete that did not report success reconciles a deletion that may already have
  // happened, so it may use the reserve beyond the deadline.
  const settle = gitOk(deleted) ? (fn) => fn() : (fn) => reconciling(context, fn);
  if (!gitOk(deleted) && (await settle(() => branchRefPresent(context, branch))) !== false) {
    return { refused: 'ref-moved' };
  }
  await phase(deps, 'afterBranchDelete', { branch, branchOid });
  let relisted = null;
  try {
    relisted = await settle(() => listWorktrees(context));
  } catch {
    relisted = null;
  }
  if (relisted === null || relisted.some((entry) => entry.branch === ref)) {
    // The recreate is the reconciliation of a deletion that already happened, so it may use the
    // reserve beyond the deadline.
    const recreated = await reconciling(context, () =>
      runGit(context, context.cwd, ['update-ref', '--no-deref', ref, branchOid, '']),
    );
    if (gitOk(recreated)) return { refused: 'checked-out', recreated: true };
    return {
      refused: 'ref-recreate-failed',
      restore: restoreCommand(branch, branchOid),
      detail: gitFailureDetail(recreated, 'git update-ref failed'),
    };
  }
  return { refused: null, ...(await settle(() => removeBranchConfig(context, branch))) };
}

// The shell-quoted command that recreates a deleted branch at its tip.
export function restoreCommand(branch, oid) {
  return `git branch '${branch.replaceAll("'", "'\\''")}' ${oid}`;
}

// The branch names a rebase or bisect in the main checkout or a linked worktree still uses, read
// from BRANCH_IN_USE_FILES below `common` and `common/worktrees/*/`, never through Git: `{names,
// unreadable}`. An entry that exists but cannot be read, or an unreadable `worktrees/` directory,
// sets `unreadable`, which callers treat as every branch in use.
export async function branchesInUse(fs, common) {
  const names = new Set();
  if (typeof common !== 'string' || !path.isAbsolute(common)) return { names, unreadable: true };
  let unreadable = false;
  const directories = [common];
  try {
    for (const entry of (await fs.readdir(path.join(common, 'worktrees'))).sort()) {
      directories.push(path.join(common, 'worktrees', entry));
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') unreadable = true;
  }
  const add = (value) => {
    const name = value.startsWith('refs/heads/') ? value.slice(11) : value;
    if (name !== '') names.add(name);
  };
  for (const directory of directories) {
    for (const file of BRANCH_IN_USE_FILES) {
      const read = await readBoundedFile(fs, path.join(directory, file), MAX_IN_USE_FILE_BYTES);
      if (read.state === 'missing') continue;
      if (read.state !== 'ok') {
        unreadable = true;
        continue;
      }
      const lines = read.content
        .toString('utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (file === 'rebase-merge/update-refs') {
        for (const line of lines) if (line.startsWith('refs/heads/')) add(line);
      } else if (lines[0] !== undefined) {
        add(lines[0]);
      }
    }
  }
  return { names, unreadable };
}

// Lists the repository-local `branch.<branch>.*` entries (`git config --local --null
// --get-regexp`, filtered here to exactly that subsection) and removes their section. Returns
// `{configRemoved}` with the removed `{key, value}` entries (omitted when none), plus
// `configRemaining` with the entries and the reason when Git could not remove them; "no such
// section" counts as removed.
async function removeBranchConfig(context, branch) {
  const listed = await runGit(context, context.cwd, [
    'config',
    '--local',
    '--null',
    '--get-regexp',
    '^branch\\.',
  ]);
  if (!listed?.error && listed?.status === 1) return {};
  if (!gitOk(listed)) {
    return {
      configRemaining: {
        entries: null,
        reason: gitFailureDetail(listed, 'git config --get-regexp failed'),
      },
    };
  }
  const entries = [];
  for (const record of gitStdout(listed).split('\0')) {
    if (record === '') continue;
    const newline = record.indexOf('\n');
    const key = newline === -1 ? record : record.slice(0, newline);
    const value = newline === -1 ? null : record.slice(newline + 1);
    const subsection = key.slice('branch.'.length, key.lastIndexOf('.'));
    if (key.startsWith('branch.') && subsection === branch) entries.push({ key, value });
  }
  if (entries.length === 0) return {};
  const removal = await runGit(context, context.cwd, [
    'config',
    '--local',
    '--remove-section',
    `branch.${branch}`,
  ]);
  if (gitOk(removal) || /no such section/i.test(asBuffer(removal?.stderr).toString('utf8'))) {
    return { configRemoved: entries };
  }
  return {
    configRemaining: { entries, reason: gitFailureDetail(removal, 'git config failed') },
  };
}

// ---------------------------------------------------------------------------------------------
// Claim, remove, reconcile

function itemFailure(recordId, code, details = {}) {
  return { recordId, ok: false, code, ...details };
}

// Errors that end only the item they occurred in.
const PER_ITEM_ERRORS = Object.freeze([
  'UNSAFE_TARGET',
  'LEGACY_CHANGED',
  'WRITE_FAILED',
  'GIT_FAILED',
  'INVALID_STATE',
]);

// The digest input of a `worktree:` item. A proven superseded-plan item (`evidence`) also binds
// its proof and the confirmed plan and archive blobs, never `baseRef` or `baseCommit`, so a fetch
// alone changes no digest; every other item's input is unchanged.
function worktreeDigestInput(record, tip, evidence = null) {
  return {
    kind: 'worktree',
    recordId: record.recordId,
    worktreePath: record.worktreePath,
    branch: record.branch,
    tip,
    branchPolicy: record.branchPolicy,
    ...(evidence === null
      ? {}
      : {
          proof: SUPERSEDED_PLAN_PROOF,
          planPath: evidence.planPath,
          planBlob: evidence.planBlob,
          archivePath: evidence.archivePath,
          archiveBlob: evidence.archiveBlob,
          match: evidence.match,
        }),
  };
}

// Persists `cleanup-failed` with `reason` for a record this actor claimed; never throws.
async function markCleanupFailed(context, paths, record, reason, held, deps) {
  const { cleanupRunId, claimedAt, ...rest } = record;
  try {
    await reconciling(context, () =>
      writeRecord(
        context,
        paths,
        {
          ...rest,
          status: 'cleanup-failed',
          reason: reason.slice(0, MAX_REASON_CHARS) || 'cleanup failed',
          updatedAt: timestamp(deps),
        },
        held,
      ),
    );
    return { persisted: true };
  } catch (error) {
    return { persisted: false, message: error?.message ?? String(error) };
  }
}

// Whether `lstat` of `target` fails with ENOENT; any other error counts as present.
async function pathAbsent(fs, target) {
  try {
    await fs.lstat(target);
    return false;
  } catch (error) {
    return error?.code === 'ENOENT';
  }
}

async function worktreeGone(context, record) {
  const worktrees = await listWorktrees(context);
  const registered = worktrees.some((entry) => matches(entry, record.worktreePath));
  const present = !(await pathAbsent(context.fs, record.worktreePath));
  return { registered, present, gone: !registered && !present };
}

// Runs claim-remove-reconcile for one record. `options`:
//   sessionId     the owner every record must belong to (`worktree remove`), or null
//   allowActive   whether an `active` record is first moved to `cleanup-ready`
//   integration   `{branch, excluded}` for the `apply-review` proof, or null
//   expectDigest  the selected `itemDigest` re-checked under the lock (`cleanup apply`), or null
//   mergeGateRelease  the cleanup-only `merge-gate` release (`cleanup apply` only; see
//                 `evaluateEligibility`), for the pre-lock gone gate and the claim
//   supersededPlan  `{planPath}` of a confirmed superseded-plan item (`cleanup apply` only), or
//                 null: the claim re-derives the proof and discards that plan (`removeClaimed`)
//   signals       the signal state of the call
async function removeOne(context, roots, recordId, options, deps) {
  const paths = recordPaths(roots.cwd, recordId);
  const first = await readRecord(context, paths, recordId);
  if (first.state === 'missing') return itemFailure(recordId, 'RECORD_NOT_FOUND');
  if (first.state === 'invalid') {
    return itemFailure(recordId, 'INVALID_STATE', { reason: first.reason, conditions: [1] });
  }
  // The sandbox preflight runs Git inside the worktree and writes a probe beside it, so it waits
  // until the record's path is proven this repository's worktree; a foreign or missing path is
  // refused here without a lock, a probe or any further Git call in it.
  if (options.sessionId !== null && first.record.sessionId !== options.sessionId) {
    return itemFailure(recordId, 'NOT_OWNER', { reason: 'session-mismatch' });
  }
  const proof = await proveOwnWorktree(context, roots, first.record);
  let gone = false;
  if (!proof.commonDirMatches) {
    // Only a fully gone worktree that `goneRemovable` admits passes without the proof; it is
    // removed by the post-claim reconcile of an absent worktree, with no Git call in its path.
    const mergeGateRelease = options.mergeGateRelease === true;
    const facts = await gatherFacts(context, roots, await listWorktrees(context), first.record, {
      mergeGateRelease,
    });
    const statuses = options.allowActive ? ['active', ...CLAIMABLE_STATUSES] : CLAIMABLE_STATUSES;
    const { conditions, blockers } = assessEligibility(facts, {
      statuses,
      removal: true,
      mergeGateRelease,
    });
    if (conditions.length > 0 || blockers.length > 0 || !facts.gone) {
      return itemFailure(recordId, 'NOT_ELIGIBLE', {
        status: first.record.status,
        conditions,
        blockers,
      });
    }
    gone = true;
  }
  const denied = await preflight(context, roots, first.record, deps, { gone });
  if (denied) return itemFailure(recordId, 'SANDBOX_DENIED', denied);
  const cleanupRunId = `cleanup-${randomHex(deps)}`;
  const outcome = await withRecordLock(
    context,
    paths,
    { operation: options.operation, runId: cleanupRunId },
    deps,
    (held) => claimAndRemove(context, roots, paths, recordId, cleanupRunId, held, options, deps),
  );
  if (outcome instanceof StateOutcome) {
    return itemFailure(recordId, outcome.code, outcome.details);
  }
  return outcome;
}

// The body of `removeOne`, entirely under the record lock `held`. Order matters and each step is a
// persisted state: the eligibility conditions are re-derived from fresh Git facts (never from the
// plan), `active` moves to `cleanup-ready`, the claim writes `cleanup-in-progress` with this run's
// `cleanupRunId`, and only then does Git remove the worktree, without `--force` and without ever
// pruning or unlinking the path. Every failure after the claim is persisted as `cleanup-failed`
// with the exact reason, so the record stays the visible truth; only a gone worktree lets the
// branch policy run and the record be deleted. The `merge-gate` release proof is re-derived here,
// under the lock and before the claim, and so is the superseded-plan proof of a confirmed proven
// item, which alone waives condition 7 and is bound by the digest; a refusal of its discard
// before the quarantine rename restores the pre-claim record instead (`discardSupersededPlan`).
async function claimAndRemove(context, roots, paths, recordId, cleanupRunId, held, options, deps) {
  await phase(deps, 'underLock', { operation: options.operation, recordId });
  const read = await readRecord(context, paths, recordId);
  if (read.state === 'missing') return itemFailure(recordId, 'RECORD_NOT_FOUND');
  if (read.state === 'invalid') {
    return itemFailure(recordId, 'INVALID_STATE', { reason: read.reason, conditions: [1] });
  }
  let record = read.record;
  if (options.sessionId !== null && record.sessionId !== options.sessionId) {
    return itemFailure(recordId, 'NOT_OWNER', { reason: 'session-mismatch' });
  }
  const mergeGateRelease = options.mergeGateRelease === true;
  const worktrees = await listWorktrees(context);
  const facts = await gatherFacts(context, roots, worktrees, record, {
    ownLock: held.token,
    mergeGateRelease,
  });
  const statuses = options.allowActive ? ['active', ...CLAIMABLE_STATUSES] : CLAIMABLE_STATUSES;
  let { conditions, blockers } = assessEligibility(facts, {
    statuses,
    removal: true,
    mergeGateRelease,
  });
  let superseded = null;
  if ((options.supersededPlan ?? null) !== null) {
    superseded = supersededPlanApplies(facts, { conditions, blockers }, mergeGateRelease)
      ? await supersededPlanProver(context, deps)(record)
      : { ok: false, reason: null };
    if (!superseded.ok) {
      return itemFailure(recordId, 'NOT_ELIGIBLE', {
        status: record.status,
        conditions,
        blockers,
        ...(superseded.reason ? { supersededPlan: { reason: superseded.reason } } : {}),
      });
    }
    conditions = [];
  }
  if (options.expectDigest !== null) {
    const digest = itemDigest(
      worktreeDigestInput(record, facts.branchTip, superseded?.evidence ?? null),
    );
    if (digest !== options.expectDigest) {
      return itemFailure(recordId, 'PREVIEW_MISMATCH', { reason: 'digest' });
    }
  }
  if (conditions.length > 0 || blockers.length > 0) {
    return itemFailure(recordId, 'NOT_ELIGIBLE', { status: record.status, conditions, blockers });
  }
  // The ledger is deleted right before the record, so a `ledgers/` entry the guard refuses fails
  // the item here, before any write or removal (UNSAFE_TARGET): nothing is deleted through it.
  await ledgerExists(context, roots.cwd, recordId);
  if (record.status === 'active') {
    record = { ...record, status: 'cleanup-ready', reason: null, updatedAt: timestamp(deps) };
    await writeRecord(context, paths, record, held);
  }
  if (options.signals.signal) {
    return itemFailure(recordId, 'INTERRUPTED', {
      signal: options.signals.signal,
      status: record.status,
    });
  }
  // The exact record before the claim, which a refused superseded-plan discard restores.
  const preClaim = record;
  record = {
    ...record,
    status: 'cleanup-in-progress',
    cleanupRunId,
    claimedAt: timestamp(deps),
    updatedAt: timestamp(deps),
  };
  await writeRecord(context, paths, record, held);
  const claimed = record;
  const claimOptions = superseded?.ok
    ? {
        ...options,
        discardPlan: { evidence: superseded.evidence, identity: superseded.identity },
        preClaim,
      }
    : options;
  try {
    return await removeClaimed(context, roots, paths, recordId, claimed, held, claimOptions, deps);
  } catch (error) {
    // Any error after the claim (a failed or timed-out Git call, a lost lock, a guard refusal)
    // would otherwise leave the record `cleanup-in-progress` under a claim no one finishes. It is
    // reconciled to `cleanup-failed` with the error under the still-held lock, then mapped as usual.
    // A superseded-plan discard that already restored the pre-claim record (`restoredItem`) is
    // not reconciled again: its restore result is the item's state.
    if (error?.restoredItem) {
      const { code, message, status, restored, persisted } = error.restoredItem;
      error.itemDetails = {
        code: code ?? 'INTERNAL_ERROR',
        ...(message ? { message } : {}),
        status,
        restored,
        ...(persisted ? { persisted } : {}),
      };
      throw error;
    }
    const code = error instanceof RuntimeStateError ? error.code : 'INTERNAL_ERROR';
    const persisted = await markCleanupFailed(
      context,
      paths,
      claimed,
      `${code}: ${error?.message ?? String(error)}`,
      held,
      deps,
    );
    if (error && typeof error === 'object') {
      error.itemDetails = {
        status: persisted.persisted ? 'cleanup-failed' : claimed.status,
        persisted,
        ...(error.quarantine ? { quarantine: error.quarantine } : {}),
        ...(error.discardedPlan ? { discardedPlan: error.discardedPlan } : {}),
      };
    }
    throw error;
  }
}

// The claimed part of `claimAndRemove`: `record` is `cleanup-in-progress` under this actor's claim.
// A confirmed superseded plan (`options.discardPlan`) is discarded first; every result after its
// discard names it as `discardedPlan`.
async function removeClaimed(context, roots, paths, recordId, record, held, options, deps) {
  if (options.discardPlan) {
    const refused = await discardSupersededPlan(
      context,
      paths,
      recordId,
      record,
      held,
      options,
      deps,
    );
    if (refused !== null) return refused;
    const discardedPlan = options.discardPlan.evidence.planPath;
    try {
      await phase(deps, 'afterDiscard', { recordId });
      return {
        ...(await removeClaimedWorktree(
          context,
          roots,
          paths,
          recordId,
          record,
          held,
          options,
          deps,
        )),
        discardedPlan,
      };
    } catch (error) {
      if (error && typeof error === 'object') error.discardedPlan = discardedPlan;
      throw error;
    }
  }
  await phase(deps, 'afterClaim', { recordId });
  if (options.signals.signal) {
    const signal = options.signals.signal;
    const reconciled = await markCleanupFailed(
      context,
      paths,
      record,
      `interrupted by ${signal} before the worktree removal`,
      held,
      deps,
    );
    return itemFailure(recordId, 'INTERRUPTED', { signal, status: 'cleanup-failed', reconciled });
  }
  return removeClaimedWorktree(context, roots, paths, recordId, record, held, options, deps);
}

// The discard of a confirmed superseded plan under the record lock and this actor's claim: null
// once the plan file is gone, else the item's result. The plan is checked in place (identity and
// raw blob of the proof under the lock), renamed into a RELEASE_QUARANTINE_PREFIX entry of the
// worktree root, checked there again and unlinked.
// Every outcome before the rename (an interrupt, a changed file or directory, a thrown error, a
// failed rename while the file is still at its path) restores `options.preClaim` and reports
// `restored: true`; only a failed restore write falls back to `cleanup-failed` (`restored: false`).
// A thrown error outside PER_ITEM_ERRORS is restored first and still ends the call. After the
// rename, a quarantine whose file cannot be verified is kept, which fails condition 7 until the
// user resolves it, and the record is `cleanup-failed`.
async function discardSupersededPlan(context, paths, recordId, record, held, options, deps) {
  const { evidence, identity } = options.discardPlan;
  const git = branchGitContext(context, { timedOut: false });
  const target = path.join(record.worktreePath, evidence.planPath);
  const failed = async (reason, details = {}) => {
    const persisted = await markCleanupFailed(context, paths, record, reason, held, deps);
    return itemFailure(recordId, 'REMOVE_FAILED', { reason, persisted, ...details });
  };
  const restore = async (code, details = {}) => {
    try {
      await reconciling(context, () => writeRecord(context, paths, options.preClaim, held));
      return itemFailure(recordId, code, {
        ...details,
        status: options.preClaim.status,
        restored: true,
      });
    } catch (error) {
      const reason = `${code}: the claim could not be restored: ${error?.message ?? error}`;
      const persisted = await markCleanupFailed(context, paths, record, reason, held, deps);
      return itemFailure(recordId, code, {
        ...details,
        status: persisted.persisted ? 'cleanup-failed' : record.status,
        restored: false,
        persisted,
      });
    }
  };
  const sameFile = (read) =>
    read.identity.dev === identity.dev &&
    read.identity.ino === identity.ino &&
    read.blob === evidence.planBlob;
  const inPlace = async () => {
    const read = await readPlanFile(context, git, record.worktreePath, evidence.planPath);
    if (read.state === 'git-failed') {
      fail('GIT_FAILED', `the preserved plan ${evidence.planPath} could not be hashed`);
    }
    return read.state === 'ok' && sameFile(read) ? read : null;
  };
  const quarantine = path.join(
    record.worktreePath,
    `${RELEASE_QUARANTINE_PREFIX}${randomHex(deps, 8)}`,
  );
  let preserved;
  try {
    await phase(deps, 'afterClaim', { recordId });
    if (options.signals.signal) {
      return await restore('INTERRUPTED', { signal: options.signals.signal });
    }
    // The file, and its directory as a canonical path inside the worktree, right before the rename.
    const directory = path.dirname(target);
    preserved = await inPlace();
    if (preserved === null || (await canonical(context.fs, directory)) !== directory) {
      return await restore('PLAN_CHANGED', { planPath: evidence.planPath });
    }
  } catch (error) {
    // Restored first; only a per-item error ends the item here, every other one ends the call.
    const code = error instanceof RuntimeStateError ? error.code : 'INTERNAL_ERROR';
    const result = await restore(code, { message: error?.message ?? String(error) });
    if (error instanceof RuntimeStateError && PER_ITEM_ERRORS.includes(error.code)) return result;
    if (error && typeof error === 'object') error.restoredItem = result;
    throw error;
  }
  try {
    await context.fs.rename(target, quarantine);
  } catch (error) {
    const message = `the preserved plan could not be moved: ${error?.code ?? error?.message}`;
    let still = false;
    try {
      still = (await inPlace()) !== null;
    } catch {
      still = false;
    }
    if (still) return restore('WRITE_FAILED', { message });
    return failed(`${message}; it is no longer at ${evidence.planPath}`);
  }
  // From here on nothing is restored; a thrown error names the quarantine until the unlink and the
  // discarded plan after it.
  try {
    const beforeRead = await context.fs.lstat(quarantine, { bigint: true }).catch(() => null);
    const quarantined = await readBoundedFile(context.fs, quarantine, MAX_PLAN_BYTES);
    const matches =
      quarantined.state === 'ok' &&
      quarantined.identity.dev === identity.dev &&
      quarantined.identity.ino === identity.ino &&
      quarantined.content.equals(preserved.content) &&
      beforeRead?.isFile() &&
      String(beforeRead.dev) === quarantined.identity.dev &&
      String(beforeRead.ino) === quarantined.identity.ino &&
      String(beforeRead.mtimeNs) === quarantined.identity.mtimeNs &&
      beforeRead.size === BigInt(quarantined.bytes);
    const beforeUnlink = matches
      ? await context.fs.lstat(quarantine, { bigint: true }).catch(() => null)
      : null;
    if (
      !beforeUnlink?.isFile() ||
      beforeUnlink.dev !== beforeRead.dev ||
      beforeUnlink.ino !== beforeRead.ino ||
      beforeUnlink.ctimeNs !== beforeRead.ctimeNs ||
      beforeUnlink.mtimeNs !== beforeRead.mtimeNs ||
      beforeUnlink.size !== beforeRead.size
    ) {
      return await failed(
        `the preserved plan changed on its way into the quarantine ${quarantine}, which is kept`,
        { quarantine },
      );
    }
    await context.fs.unlink(quarantine);
  } catch (error) {
    if (error && typeof error === 'object') error.quarantine = quarantine;
    throw error;
  }
  return null;
}

// The removal of a claimed `record`'s worktree, its branch policy and the record deletion.
async function removeClaimedWorktree(context, roots, paths, recordId, record, held, options, deps) {
  const before = await worktreeGone(context, record);
  let reconciledAbsent = false;
  if (before.gone) {
    // Already absent under this actor's own lock and claim: reconciled without a Git call.
    reconciledAbsent = true;
  } else if (!before.registered || !before.present) {
    const reason = before.registered
      ? 'the worktree directory is missing but still registered; never pruned'
      : 'the worktree path exists but is not registered';
    const persisted = await markCleanupFailed(context, paths, record, reason, held, deps);
    return itemFailure(recordId, 'REMOVE_FAILED', { reason, persisted });
  } else {
    if (record.purpose === 'issue-planning') {
      const proof = await proveOwnWorktree(context, roots, record);
      const discardedPlan = options.discardPlan?.evidence.planPath ?? null;
      const facts = proof.commonDirMatches
        ? await conditionSevenFacts(context, roots, record)
        : null;
      const failedFacts = facts === null ? null : failedConditionSevenFacts(facts);
      if (failedFacts === null || failedFacts.length > 0) {
        const failure =
          failedFacts === null
            ? 'the worktree identity could not be re-established before removal'
            : `condition 7 fails: ${failedFacts.join(', ')}`;
        const reason =
          discardedPlan === null
            ? failure
            : `the preserved plan ${discardedPlan} was discarded, but ${failure}`;
        const persisted = await markCleanupFailed(context, paths, record, reason, held, deps);
        return itemFailure(recordId, 'REMOVE_FAILED', { reason, persisted });
      }
    }
    const removal = await runGit(context, roots.cwd, ['worktree', 'remove', record.worktreePath]);
    if (!gitOk(removal)) {
      const detail = gitFailureDetail(removal, 'git worktree remove failed');
      const persisted = await markCleanupFailed(context, paths, record, detail, held, deps);
      return itemFailure(recordId, 'REMOVE_FAILED', { reason: detail, persisted });
    }
  }
  const after = await worktreeGone(context, record);
  if (!after.gone) {
    const reason = 'the worktree is still present after its removal';
    const persisted = await markCleanupFailed(context, paths, record, reason, held, deps);
    return itemFailure(recordId, 'REMOVE_FAILED', { reason, persisted });
  }
  await phase(deps, 'afterRemove', { recordId });
  let branch = { outcome: 'retained', branch: record.branch, reason: 'retain-policy' };
  if (record.branchPolicy === 'delete-after-integration') {
    branch = await deleteTemporaryBranch(context, record, options.integration, deps);
  }
  try {
    // The ledger goes under the same lock and claim, immediately before its record.
    await deleteLedger(context, roots.cwd, recordId);
    await guardedUnlink(context, paths.record);
  } catch (error) {
    const reason = `the worktree was removed but the record could not be deleted: ${error?.message}`;
    const persisted = await markCleanupFailed(context, paths, record, reason, held, deps);
    return itemFailure(recordId, 'REMOVE_FAILED', { reason, persisted, removed: true, branch });
  }
  const base = {
    recordId,
    worktreePath: record.worktreePath,
    removed: true,
    ...(reconciledAbsent ? { reconciledAbsent: true } : {}),
    branch,
  };
  if (branch.outcome === 'retained' && record.branchPolicy === 'delete-after-integration') {
    return { ...base, ok: false, code: 'BRANCH_RETAINED' };
  }
  return { ...base, ok: true };
}

// Runs `items` one by one with the deadline and signals, mapping per-item guard errors. A whole-call
// error keeps the results so far as `envelopeDetails.items`.
async function runItems(entries, clock, deps, run) {
  const signals = watchSignals(deps);
  const items = [];
  try {
    for (const entry of entries) {
      if (signals.signal) {
        items.push({ ...entry.id, ok: false, code: 'INTERRUPTED', signal: signals.signal });
        continue;
      }
      if (!clock.canStart()) {
        items.push({
          ...entry.id,
          ok: false,
          code: 'DEADLINE_REACHED',
          deadlineMs: clock.limit,
          remainingMs: Math.floor(clock.remaining()),
          itemFloorMs: clock.floor,
        });
        continue;
      }
      try {
        items.push(await run(entry, signals));
      } catch (error) {
        if (error instanceof RuntimeStateError && PER_ITEM_ERRORS.includes(error.code)) {
          items.push({
            ...entry.id,
            ok: false,
            code: error.code,
            message: error.message,
            ...(error.itemDetails ?? {}),
            ...(error.removed !== undefined ? { removedEntries: error.removed } : {}),
            ...(error.remaining !== undefined ? { stoppedAt: error.remaining } : {}),
          });
          continue;
        }
        if (error instanceof Error) {
          error.envelopeDetails = {
            items: error.itemDetails
              ? [...items, { ...entry.id, ok: false, code: error.code, ...error.itemDetails }]
              : items,
          };
        }
        throw error;
      }
    }
  } finally {
    signals.dispose();
  }
  return items;
}

function requireRecordIds(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RECORD_IDS) {
    fail('INVALID_INPUT', `recordIds must list 1 to ${MAX_RECORD_IDS} record IDs`);
  }
  const ids = value.map((id, index) => requireRecordId(id, `recordIds[${index}]`));
  if (new Set(ids).size !== ids.length) fail('INVALID_INPUT', 'recordIds must not repeat an ID');
  return ids;
}

export async function removeRecords(input, deps) {
  const context = prepare('worktree remove', input, deps);
  const sessionId = requireSessionId(input.sessionId);
  const recordIds = requireRecordIds(input.recordIds);
  const clock = startClock(deps);
  boundGit(context, clock);
  const roots = await openRoots(context, input);
  let integration = null;
  if (input.integrationRoot !== undefined) {
    const entry = await requireRegistered(
      context,
      roots.worktrees,
      input.integrationRoot,
      'integrationRoot',
    );
    if (!entry.branch?.startsWith('refs/heads/') || entry.detached) {
      fail('INVALID_ROOT', 'integrationRoot must have a branch checked out');
    }
    const excluded = [];
    for (const id of recordIds) {
      const read = await readRecord(context, recordPaths(roots.cwd, id), id);
      if (read.state === 'ok') excluded.push(read.record.branch);
    }
    integration = { branch: entry.branch.slice(11), excluded };
  }
  const items = await runItems(
    recordIds.map((recordId) => ({ id: { recordId }, recordId })),
    clock,
    deps,
    (entry, signals) =>
      removeOne(
        context,
        roots,
        entry.recordId,
        {
          operation: 'worktree remove',
          sessionId,
          allowActive: true,
          integration,
          expectDigest: null,
          mergeGateRelease: false,
          signals,
        },
        deps,
      ),
  );
  return { sessionId, items };
}

// ---------------------------------------------------------------------------------------------
// cleanup plan and cleanup apply

// The `runtimeMigration.directory` marker as stored in canonical memory, reduced to `version` and,
// when the key exists, `source`; null when memory or the marker is absent or unreadable. The
// absent-versus-present distinction of `source` is load-bearing: an absent key is the legacy marker
// that certifies a directory only through a zero-open carry-over (`isLegacyMigrationMarker`), while
// a present key identifies the migrated source, not proof that its current content is preserved.
async function readMarker(context) {
  const memory = await readCleanupMemory(
    context,
    path.join(RUNTIME_STATE_DIR, LEGACY_MEMORY_ENTRY),
  );
  const marker = memory?.runtimeMigration?.directory;
  if (!isObject(marker)) return null;
  // A marker written before `source` existed keeps the key absent, which the guard reads as a
  // legacy marker (see `checkLegacyRuntimeDirectory`).
  return Object.hasOwn(marker, 'source')
    ? { version: marker.version, source: marker.source }
    : { version: marker.version };
}

async function readCleanupMemory(context, relative, expected) {
  const target = path.join(context.cwd, relative);
  try {
    await assertDirectoryChain(context.cwd, path.dirname(target));
    const read = await readBoundedFile(context.fs, target, 1024 * 1024);
    if (read.state !== 'ok' || (expected && read.sha256 !== expected.sha256)) return null;
    const memory = JSON.parse(read.content.toString('utf8'));
    return isObject(memory) ? memory : null;
  } catch {
    return null;
  }
}

function containsMemory(target, source) {
  if (!isObject(source)) return isDeepStrictEqual(target, source);
  return (
    isObject(target) &&
    Object.keys(source).every(
      (key) => Object.hasOwn(target, key) && containsMemory(target[key], source[key]),
    )
  );
}

async function memoryCarriedOver(context, name, entry) {
  const source = await readCleanupMemory(context, path.join(name, LEGACY_MEMORY_ENTRY), entry);
  const target = await readCleanupMemory(
    context,
    path.join(RUNTIME_STATE_DIR, LEGACY_MEMORY_ENTRY),
  );
  return source !== null && target !== null && containsMemory(target, source);
}

// Whether `.effective-flow/<relative>` is a regular file byte-identical to the listed one.
async function carriedOver(context, relative, entry) {
  const target = path.join(context.cwd, RUNTIME_STATE_DIR, relative);
  try {
    if (!(await assertDirectoryChain(context.cwd, path.dirname(target), { allowMissing: true }))) {
      return false;
    }
    const info = await context.fs.lstat(target, { bigint: true });
    if (!info.isFile() || String(info.size) !== entry.size) return false;
    return (await hashRegularFile(target, info)) === entry.sha256;
  } catch {
    return false;
  }
}

function applicableDecisions(name, decisions) {
  const prefix = `${name}/`;
  const config = {};
  for (const [key, value] of Object.entries(decisions.config)) {
    if (key.startsWith(prefix)) config[key] = value;
  }
  return {
    discardAll: decisions.discardAll.includes(name),
    discard: decisions.discard.filter((entry) => entry.startsWith(prefix)),
    config,
  };
}

// Re-derives the carry-over of one legacy directory from fresh evidence: every regular file is
// carried only when a byte-identical regular file exists at the same path below `.effective-flow/`;
// every missing or differing file and every non-regular entry is open unless a decision discards
// it. The top-level `config.json` follows the legacy-config rule. The top-level `memory.json`
// may instead prove its current values remain in canonical memory under a source-named marker;
// conflicts, even ones the migration's target-wins merge accepted, still require explicit discard.
// Under a legacy marker without `source` it remains an ordinary byte-identical carry-over entry.
async function carryOver(context, name, listing, decisions, locatorStep, { legacyMarker }) {
  const applicable = applicableDecisions(name, decisions);
  const carried = [];
  const open = [];
  const discarded = [];
  for (const entry of listing.entries) {
    const relative = entry.path;
    if (entry.type === 'directory') continue;
    const full = `${name}/${relative}`;
    if (relative === LEGACY_CONFIG_ENTRY) {
      const decision = applicable.config[full];
      if (!NON_LIVE_LOCATOR_STEPS.includes(locatorStep)) {
        open.push({ path: full, kind: 'config', reason: 'live-configuration' });
      } else if (decision === 'complete' || decision === 'discarded') {
        discarded.push({ path: full, kind: 'config', decision });
      } else {
        open.push({ path: full, kind: 'config', reason: 'decision-required' });
      }
      continue;
    }
    let reason;
    if (entry.type !== 'file') reason = 'non-regular';
    else if (
      (await carriedOver(context, relative, entry)) ||
      (relative === LEGACY_MEMORY_ENTRY &&
        !legacyMarker &&
        (await memoryCarriedOver(context, name, entry)))
    ) {
      carried.push(full);
      continue;
    } else reason = 'missing-or-different';
    if (applicable.discardAll || applicable.discard.includes(full)) {
      discarded.push({ path: full, kind: 'file', reason, type: entry.type });
    } else {
      open.push({ path: full, kind: 'file', reason, type: entry.type });
    }
  }
  return { carried, open, discarded, applicable };
}

function digestListing(listing) {
  return {
    root: listing.root,
    entries: listing.entries,
  };
}

// One legacy runtime directory as a cleanup item: `{actionable, item, listing}`; null when absent.
async function legacyDirectoryItem(context, name, decisions, locatorStep, marker) {
  const target = path.join(context.cwd, name);
  try {
    await context.fs.lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    fail('UNSAFE_TARGET', `cannot inspect ${target}: ${error?.code ?? error?.message}`);
  }
  const itemId = `legacy:${name}`;
  let listing;
  try {
    listing = await listLegacyTree(target);
  } catch (error) {
    if (error instanceof RuntimeStateError && PER_ITEM_ERRORS.includes(error.code)) {
      return {
        actionable: false,
        item: {
          itemId,
          kind: 'legacyRuntimeDirectory',
          path: name,
          failures: [{ code: error.code, message: error.message }],
        },
      };
    }
    throw error;
  }
  if (listing.root.type !== 'directory') {
    return {
      actionable: false,
      item: {
        itemId,
        kind: 'legacyRuntimeDirectory',
        path: name,
        failures: [{ code: 'UNSAFE_TARGET', reason: 'not-a-real-directory' }],
      },
    };
  }
  const legacyMarker = isLegacyMigrationMarker(marker);
  const carry = await carryOver(context, name, listing, decisions, locatorStep, { legacyMarker });
  const failures = await checkLegacyRuntimeDirectory(context, target, {
    marker,
    listing,
    open: carry.open,
  });
  // A registered worktree anywhere at or below the legacy directory blocks it, not only one below
  // its `.worktrees/`: removing the directory would delete a checkout Git still tracks.
  const canonicalTarget = await canonicalOrSelf(context.fs, target);
  const worktrees = (await listWorktrees(context))
    .filter((entry) =>
      [target, canonicalTarget].some(
        (base) =>
          [entry.path, entry.canonical].includes(base) ||
          isBelow(base, entry.canonical ?? entry.path) ||
          isBelow(base, entry.path),
      ),
    )
    .map((entry) => ({
      path: entry.canonical ?? entry.path,
      locked: entry.locked,
      prunable: entry.prunable,
    }));
  if (worktrees.length > 0 && !failures.some((entry) => entry.reason === 'nested-git')) {
    failures.push({
      code: 'NOT_ELIGIBLE',
      reason: 'registered-worktree',
      registrations: worktrees,
    });
  }
  const item = {
    itemId,
    kind: 'legacyRuntimeDirectory',
    path: name,
    entryCount: listing.entries.length,
    ...(legacyMarker ? { legacyMarker: true } : {}),
    carryOver: {
      carried: carry.carried.length,
      open: carry.open,
      discarded: carry.discarded,
    },
    ...(worktrees.length > 0 ? { registrations: worktrees } : {}),
  };
  if (failures.length > 0) return { actionable: false, item: { ...item, failures }, listing };
  const digest = itemDigest({
    kind: 'legacyRuntimeDirectory',
    path: name,
    listing: digestListing(listing),
    decisions: carry.applicable,
  });
  return { actionable: true, item: { ...item, itemDigest: digest }, listing };
}

async function legacyConfigItem(context, decisions, locatorStep) {
  const target = path.join(context.cwd, TRANSITIONAL_CONFIG_FILE);
  try {
    await context.fs.lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    fail('UNSAFE_TARGET', `cannot inspect ${target}: ${error?.code ?? error?.message}`);
  }
  const itemId = `config:${TRANSITIONAL_CONFIG_FILE}`;
  const decision = decisions.config[TRANSITIONAL_CONFIG_FILE];
  const failures = await checkLegacyConfigFile(context, target, { locatorStep, decision });
  const item = { itemId, kind: 'legacyConfigFile', path: TRANSITIONAL_CONFIG_FILE, locatorStep };
  if (failures.length > 0) return { actionable: false, item: { ...item, failures } };
  const listing = await listLegacyTree(target);
  const digest = itemDigest({
    kind: 'legacyConfigFile',
    path: TRANSITIONAL_CONFIG_FILE,
    listing: digestListing(listing),
    decisions: { decision },
  });
  return { actionable: true, item: { ...item, decision, itemDigest: digest }, listing };
}

// Every run directory `.effective-flow/runs/<RUN_ID>/` with the names of its entries, read-only and
// without following a link: inventory only. Removing anything below it stays with its own helper.
async function runInventory(context) {
  const runs = path.join(context.cwd, RUNTIME_STATE_DIR, 'runs');
  if (!(await assertDirectoryChain(context.cwd, runs, { allowMissing: true }))) return [];
  let names;
  try {
    names = (await context.fs.readdir(runs)).sort();
  } catch {
    return [];
  }
  const inventory = [];
  for (const runId of names) {
    const dir = path.join(runs, runId);
    try {
      const info = await context.fs.lstat(dir);
      if (!info.isDirectory() || info.isSymbolicLink()) continue;
      inventory.push({ runId, path: dir, entries: (await context.fs.readdir(dir)).sort() });
    } catch {
      // Gone or unreadable: not listed.
    }
  }
  return inventory;
}

async function locatorStepOrNull(context, deps) {
  try {
    return (await resolveBases(context, deps)).locatorStep;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// The `invalid-record` class

// Every record file below `worktree-runs/`, read once: `valid` (record ID → record), `invalid`
// (record ID → `{recordId, schemaReason, value, sha256}` of `readRecordFile`) and `foreign`, the
// `*.json` names that are no record ID.
async function readRecordSet(context, roots) {
  const { ids, foreign } = await listRecordFiles(context);
  const valid = new Map();
  const invalid = new Map();
  for (const id of ids) {
    const read = await readRecordFile(context, recordPaths(roots.cwd, id), id);
    if (read.state === 'ok') valid.set(id, read.record);
    else if (read.state === 'invalid') {
      invalid.set(id, {
        recordId: id,
        schemaReason: read.reason,
        value: read.value,
        sha256: read.sha256,
      });
    }
  }
  return { valid, invalid, foreign };
}

// Whether a canonical `candidates` path of the invalid record `selfId` is recorded elsewhere, from
// the records alone: the `worktreePath` of a valid record or of another invalid record whose
// status is not terminal, or the session directory of a valid `apply-review` record (its
// `worktreePath`'s parent) or any path below it. Terminal invalid records sharing a path never
// block each other; they retire one at a time.
async function recordedElsewhere(context, set, selfId, candidates) {
  const exact = new Set();
  const parents = [];
  const name = async (target) => {
    exact.add(target);
    exact.add(await canonicalOrSelf(context.fs, target));
  };
  for (const record of set.valid.values()) {
    await name(record.worktreePath);
    if (record.purpose === 'apply-review') {
      const parent = path.dirname(record.worktreePath);
      parents.push(parent, await canonicalOrSelf(context.fs, parent));
    }
  }
  for (const other of set.invalid.values()) {
    const value = other.value;
    if (other.recordId === selfId || value === null) continue;
    if (INVALID_RECORD_TERMINAL_STATUSES.includes(value.status)) continue;
    // Any absolute path may block, a trailing `/` or other unnormalized form included.
    if (isText(value.worktreePath) && path.isAbsolute(value.worktreePath)) {
      await name(path.resolve(value.worktreePath));
    }
  }
  return candidates.some(
    (target) =>
      exact.has(target) || parents.some((parent) => parent === target || isBelow(parent, target)),
  );
}

// Assesses one invalid record file (`entry` of `readRecordSet`) from fresh facts: `{recordId,
// schemaReason, action, blockers, evidence, worktreePath, paths, digest}`. `action` is `absent`,
// or null when no path, a half-gone or a present worktree leaves none. Of the record only `status`
// and a validated `worktreePath` are read, and both can only block; `evidence` holds the validated
// path, the schema-problem code and facts the helper derived, never a free-text field. `ownLock`
// is the token of the record lock this actor holds (null when none). The digest binds the record
// file's bytes and the action.
async function assessInvalidRecord(context, roots, worktrees, set, entry, { ownLock = null } = {}) {
  const { fs } = context;
  const found = new Set();
  const paths = recordPaths(roots.cwd, entry.recordId);
  const lock = await observeRecordLock(context, paths);
  if (lock.present && !(ownLock && lock.owner.state === 'valid' && lock.owner.token === ownLock)) {
    found.add('record-locked');
  }
  try {
    if (await ledgerExists(context, roots.cwd, entry.recordId)) found.add('ledger-present');
  } catch (error) {
    if (!(error instanceof RuntimeStateError) || error.code !== 'UNSAFE_TARGET') throw error;
    found.add('unsafe-ledger-directory');
  }
  const value = INVALID_JSON_REASONS.includes(entry.schemaReason) ? null : entry.value;
  const target = isAbsolutePath(value?.worktreePath) ? value.worktreePath : null;
  let action = null;
  let candidates = [];
  const evidence = { schemaReason: entry.schemaReason, worktreePath: target };
  if (value === null) {
    found.add('invalid-json');
  } else {
    if (!INVALID_RECORD_TERMINAL_STATUSES.includes(value.status)) found.add('status-not-terminal');
    if (target === null) found.add('no-worktree-path');
  }
  if (target !== null) {
    const real = await canonical(fs, target);
    candidates = [...new Set([target, real ?? target])];
    if (await recordedElsewhere(context, set, entry.recordId, candidates)) {
      found.add('recorded-elsewhere');
    }
    const registrations = worktrees.filter((registration) =>
      candidates.some((candidate) => matches(registration, candidate)),
    );
    const present = !(await pathAbsent(fs, target));
    const registration = registrations.length === 1 ? registrations[0] : null;
    Object.assign(evidence, {
      registrations: registrations.length,
      present,
      head: registration?.head ?? null,
      branch: registration?.branch?.startsWith('refs/heads/')
        ? registration.branch.slice(11)
        : null,
    });
    if (registrations.length === 0 && !present) action = 'absent';
    else if (registrations.length > 0 && present) found.add('worktree-present');
    else found.add('half-gone');
  }
  const blockers = BLOCKERS.filter((blocker) => found.has(blocker));
  return {
    recordId: entry.recordId,
    schemaReason: entry.schemaReason,
    action,
    blockers,
    evidence,
    worktreePath: target,
    paths: candidates,
    digest: itemDigest({
      kind: 'invalidRecord',
      recordId: entry.recordId,
      recordSha256: entry.sha256,
      schemaReason: entry.schemaReason,
      worktreePath: target,
      action,
    }),
  };
}

// The `invalid-record` entries of `cleanup plan`: every invalid record file exactly once, as an
// item or blocked with its `blockers` (and no `reason`), and every `*.json` name that is no record
// ID blocked as `invalid-record-id` under the SHA-256 of its name, which is never echoed. `paths`
// are the worktree paths these records name, which `unrecorded` leaves out. `set` is the plan's one
// `readRecordSet` read, shared with `inspectRecords`.
async function invalidRecordEntries(context, roots, worktrees, set) {
  const items = [];
  const blocked = [];
  const paths = [];
  for (const entry of set.invalid.values()) {
    const assessed = await assessInvalidRecord(context, roots, worktrees, set, entry);
    paths.push(...assessed.paths);
    const shown = {
      itemId: `invalid-record:${assessed.recordId}`,
      kind: 'invalidRecord',
      recordId: assessed.recordId,
      schemaReason: assessed.schemaReason,
      ...(assessed.action === null ? {} : { action: assessed.action }),
      evidence: assessed.evidence,
    };
    if (assessed.blockers.length === 0) items.push({ ...shown, itemDigest: assessed.digest });
    else blocked.push({ ...shown, blockers: assessed.blockers });
  }
  for (const name of set.foreign) {
    blocked.push({
      itemId: null,
      kind: 'invalidRecord',
      fileNameSha256: createHash('sha256').update(name).digest('hex'),
      blockers: ['invalid-record-id'],
    });
  }
  return { items, blocked, paths };
}

// Retires one selected invalid record under its record lock by deleting its record file. The
// pre-lock recompute and the one under the lock re-derive the facts, and any difference from
// `expectDigest` is this item's PREVIEW_MISMATCH with nothing written. Only `absent` is ever
// actionable, so no Git call writes anything; a failed deletion is REMOVE_FAILED and keeps the file
// as it was: the record is never rewritten.
async function retireInvalidRecord(context, roots, recordId, expectDigest, signals, deps) {
  const paths = recordPaths(roots.cwd, recordId);
  const fresh = async (ownLock) => {
    const set = await readRecordSet(context, roots);
    const entry = set.invalid.get(recordId);
    if (!entry) return null;
    const worktrees = await listWorktrees(context);
    return assessInvalidRecord(context, roots, worktrees, set, entry, { ownLock });
  };
  const mismatch = (assessed) => {
    if (assessed === null) return { reason: 'unknown-item' };
    if (assessed.blockers.length > 0)
      return { reason: 'not-actionable', blockers: assessed.blockers };
    return assessed.digest === expectDigest ? null : { reason: 'digest' };
  };
  const changed = mismatch(await fresh(null));
  if (changed) return itemFailure(recordId, 'PREVIEW_MISMATCH', changed);
  // Only the record directory is written (the lock, the file deletion), so only it is probed: the
  // record's untrusted path names no directory to write to.
  const denied = await probeDirectories(context, [paths.dir], deps);
  if (denied) return itemFailure(recordId, 'SANDBOX_DENIED', denied);
  const outcome = await withRecordLock(
    context,
    paths,
    { operation: 'cleanup apply', runId: `cleanup-${randomHex(deps)}` },
    deps,
    async (held) => {
      await phase(deps, 'underLock', { operation: 'cleanup apply', recordId });
      const assessed = await fresh(held.token);
      const moved = mismatch(assessed);
      if (moved) return itemFailure(recordId, 'PREVIEW_MISMATCH', moved);
      if (signals.signal) return itemFailure(recordId, 'INTERRUPTED', { signal: signals.signal });
      const { action, worktreePath } = assessed;
      try {
        await guardedUnlink(context, paths.record);
      } catch (error) {
        return itemFailure(recordId, 'REMOVE_FAILED', {
          action,
          reason: `the record file could not be deleted: ${error?.message ?? String(error)}`,
          recordKept: true,
        });
      }
      return { recordId, ok: true, action, worktreePath, recordDeleted: true };
    },
  );
  if (outcome instanceof StateOutcome) return itemFailure(recordId, outcome.code, outcome.details);
  return outcome;
}

// ---------------------------------------------------------------------------------------------
// The `branch:` class

// The delivery configuration the `branch:` class reads through the resolver: `{prefix, baseRef,
// excluded}`, or null when it cannot be resolved or a value is invalid (no branch is then
// classified). `prefix` is `delivery.branchPrefix` (default `effective-flow`, `''` in hidden mode)
// without a trailing `/`; `baseRef` the branch name of `delivery.baseBranch` normalized as Issue
// Buddy does (an `origin/` prefix stripped, `origin/HEAD` resolved, unset → `origin/HEAD`, else
// `main`), or null when it names no safe branch; `excluded` the names that are never candidates:
// the base branch and an explicit `delivery.returnBranch`.
// `config` may be one `cleanupConfiguration` already resolved in the same call.
async function deliveryConfiguration(context, deps, config = null) {
  config ??= await cleanupConfiguration(context, deps);
  if (config === null) return null;
  const prefixEntry = configEntry(config, 'delivery.branchPrefix');
  const baseEntry = configEntry(config, 'delivery.baseBranch');
  const returnEntry = configEntry(config, 'delivery.returnBranch');
  if ([prefixEntry, baseEntry, returnEntry].some((entry) => entry.state === 'invalid')) return null;
  const prefix =
    prefixEntry.state === 'set' ? prefixEntry.value.replace(/\/+$/, '') : DEFAULT_BRANCH_PREFIX;
  if (prefix !== '' && !SAFE_BRANCH_NAME_PATTERN.test(prefix)) return null;
  const configured = baseEntry.value ? baseEntry.value.replace(/^origin\//, '') || null : null;
  let baseRef = configured;
  if (baseRef === null || baseRef === 'HEAD') {
    baseRef =
      (await originHeadBranch(context)) ?? (configured === null ? DEFAULT_BASE_BRANCH : null);
  }
  if (baseRef !== null && !isSafeBaseRef(baseRef)) baseRef = null;
  const returnBranch = returnEntry.value && returnEntry.value !== 'auto' ? returnEntry.value : null;
  return {
    prefix,
    baseRef,
    excluded: new Set([configured, baseRef, returnBranch].filter((name) => name !== null)),
  };
}

// One value of a resolved configuration, trimmed: `{state: 'set', value}`, `{state: 'unset'}` or
// `{state: 'invalid'}`.
function configEntry(config, key) {
  const entry = config.values?.[key];
  if (!entry) return { state: 'unset', value: null };
  const value = typeof entry.value === 'string' ? entry.value : entry.raw;
  return entry.state === 'set' && typeof value === 'string'
    ? { state: 'set', value: value.trim() }
    : { state: 'invalid', value: null };
}

// The branch `refs/remotes/origin/HEAD` points at, or null.
async function originHeadBranch(context) {
  const ref = await gitLine(context, context.cwd, [
    'symbolic-ref',
    '-q',
    'refs/remotes/origin/HEAD',
  ]);
  return ref?.startsWith('refs/remotes/origin/') ? ref.slice(20) || null : null;
}

// Every local branch as `{tips, symbolic}`: `tips` maps name → tip, `symbolic` holds the names
// whose ref is a symbolic ref (listed with its target's tip, so never a candidate); null when Git
// fails. A ref name holds no space, so the third field is the symbolic target or empty.
async function localBranches(context) {
  const result = await runGit(context, context.cwd, [
    '--no-replace-objects',
    'for-each-ref',
    '--format=%(objectname) %(refname) %(symref)',
    'refs/heads/',
  ]);
  if (!gitOk(result)) return null;
  const tips = new Map();
  const symbolic = new Set();
  for (const line of gitStdout(result).split('\n')) {
    if (line === '') continue;
    const [oid, ref, target, ...rest] = line.split(' ');
    if (!OID_PATTERN.test(oid) || !ref?.startsWith('refs/heads/') || rest.length > 0) return null;
    const name = ref.slice(11);
    tips.set(name, oid);
    if (target) symbolic.add(name);
  }
  return { tips, symbolic };
}

// Whether `refs/heads/<branch>` itself is a symbolic ref: true, false (a plain ref or none), or
// null when Git fails.
async function isSymbolicBranch(context, branch) {
  const result = await runGit(context, context.cwd, ['symbolic-ref', '-q', `refs/heads/${branch}`]);
  if (gitOk(result)) return true;
  return !result?.error && result?.status === 1 ? false : null;
}

// Whether the ref `refs/heads/<branch>` itself exists, never following a symbolic ref: true,
// false, or null when Git fails. `for-each-ref` silently skips a dangling symbolic ref and a broken
// loose ref, so the symbolic-ref check runs first: a symbolic ref, dangling or not, is present, and
// one `symbolic-ref` cannot read (a broken ref) is null. Only a ref neither check finds is gone.
async function branchRefPresent(context, branch) {
  const symbolic = await isSymbolicBranch(context, branch);
  if (symbolic !== false) return symbolic;
  const ref = `refs/heads/${branch}`;
  const result = await runGit(context, context.cwd, ['for-each-ref', '--format=%(refname)', ref]);
  if (!gitOk(result)) return null;
  return gitStdout(result)
    .split('\n')
    .some((line) => line === ref);
}

// What the record set says about branches: `named` (branch → IDs of the valid records and of the
// invalid records with a validated `branch` that name it) and `unreadable`, set by an invalid
// record without a validated `branch` or a foreign `*.json` name, which suppresses every orphan.
function recordBranchFacts(set) {
  const named = new Map();
  const add = (branch, recordId) => named.set(branch, [...(named.get(branch) ?? []), recordId]);
  let unreadable = set.foreign.length > 0;
  for (const record of set.valid.values()) add(record.branch, record.recordId);
  for (const entry of set.invalid.values()) {
    const branch = INVALID_JSON_REASONS.includes(entry.schemaReason) ? null : entry.value?.branch;
    if (isBranchName(branch)) add(branch, entry.recordId);
    else unreadable = true;
  }
  return { named, unreadable };
}

// Every exclusion that applies to `name`: `record-unreadable` (an orphan while a record or the
// build-run state is unreadable), `unsafe-name` (also a symbolic ref, in `symbolic`), `recorded` (a record other than its own, or a
// non-terminal build run, names it), and, where `worktrees` and `inUse` are given, `checked-out`
// (a worktree other than its own record's checks it out) and `in-use`. `bound` maps a record-bound
// branch to its own record.
function branchExclusions(
  name,
  { records, runs, bound, worktrees = null, inUse = null, symbolic = null },
) {
  const own = bound.get(name) ?? null;
  const reasons = [];
  if (own === null && (records.unreadable || runs.state !== 'ok'))
    reasons.push('record-unreadable');
  if (!isBranchName(name) || !SAFE_BRANCH_NAME_PATTERN.test(name) || symbolic?.has(name)) {
    reasons.push('unsafe-name');
  }
  const naming = records.named.get(name) ?? [];
  if (
    naming.some((recordId) => recordId !== own?.recordId) ||
    (runs.state === 'ok' && runs.branches.includes(name))
  ) {
    reasons.push('recorded');
  }
  if (
    worktrees?.some(
      (entry) =>
        entry.branch === `refs/heads/${name}` && !(own && matches(entry, own.worktreePath)),
    )
  ) {
    reasons.push('checked-out');
  }
  if (inUse && (inUse.unreadable || inUse.names.has(name))) reasons.push('in-use');
  return reasons;
}

// The one reason of a retained branch: the first of RETAINED_BRANCH_REASONS among `reasons`.
export function retainedBranchReason(reasons) {
  return RETAINED_BRANCH_REASONS.find((reason) => reasons.includes(reason)) ?? null;
}

// The digest input of a `branch:` item: `kind` plus exactly the fields the item binds. The current
// base commit is reported beside it, never digested, so a fetch alone changes no digest.
export function branchDigestInput({ branch, tip, baseRef, proof, proofCommit, source, dependsOn }) {
  return { kind: 'branch', branch, tip, baseRef, proof, proofCommit, source, dependsOn };
}

// A copy of `context` whose Git calls run with GIT_NO_REPLACE_OBJECTS=1 and record a timeout in
// `tracking`; with `deadline` (epoch ms, read through `now`) each call is also bounded by what is
// left, and one the deadline already passed is not started.
function branchGitContext(context, tracking, deadline = null, now = Date.now) {
  const runner = context.runner;
  return {
    ...context,
    env: { ...context.env, ...NO_REPLACE_ENV },
    runner: async (request) => {
      let bounded = request;
      if (deadline !== null) {
        const remaining = Math.floor(deadline - now());
        if (remaining <= 0) {
          tracking.timedOut = true;
          return {
            status: null,
            signal: null,
            stdout: Buffer.alloc(0),
            stderr: '',
            timedOut: true,
          };
        }
        bounded = {
          ...request,
          timeoutMs:
            typeof request.timeoutMs === 'number'
              ? Math.min(request.timeoutMs, remaining)
              : remaining,
          processGroup: true,
        };
      }
      const result = await runner(bounded);
      if (result?.timedOut) tracking.timedOut = true;
      return result;
    },
  };
}

// The dependencies the proof core gets: the injected runner (bound by the caller's deadline inside
// the proof core), environment, clock and temporary directory.
function proofDeps(context, deps) {
  return {
    runner: context.runner,
    env: deps.env,
    now: deps.now ?? Date.now,
    ...(deps.tmpdir ? { tmpdir: deps.tmpdir } : {}),
  };
}

// One proof call as its result. The proof core throws only PrDeliveryGitError: a refused input
// (never expected) is `proof-unavailable` with `invalid-input`, any other code `git-failed`; both
// details are in BRANCH_PROOF_UNAVAILABLE_DETAILS. Any other error is a defect and propagates.
async function settleBranchProof(run) {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof PrDeliveryGitError)) throw error;
    return {
      proof: null,
      proofCommit: null,
      reason: 'proof-unavailable',
      detail: error.code === 'INVALID_INPUT' ? 'invalid-input' : 'git-failed',
    };
  }
}

// The `branch:` items and retained branches of `cleanup plan`. Its own clock bounds only this
// part: the proof budget is min(BRANCH_PROOF_BUDGET_MS, DEFAULT_DEADLINE_MS − what the plan already
// used) and bounds the repository facts and every proof Git call; the discovery calls before them
// are bounded by what is left of DEFAULT_DEADLINE_MS. A branch the budget no longer reaches is
// retained as `timeout`, never offered. The
// candidates are the local branches under `<prefix>/` (only with a non-empty prefix) and the
// branch of each `retain` record of BRANCH_ITEM_PURPOSES whose `worktree:` item this plan lists
// (`actionable`), under the prefix unless it is empty; the base and return branch never are.
// Every exclusion is decided before any proof; at most MAX_BRANCH_ITEMS candidates, record-bound
// first, then by name, are proven: pass 1 `ancestor`/`tip-tree` for each, pass 2 the `squash-tree`
// search for those `not-proven`, with the budget left. Everything else is retained with one reason.
async function planBranches(context, roots, { worktrees, recordSet, actionable }, deps, startedAt) {
  const monotonic = deps.monotonicNow ?? (() => performance.now());
  const now = deps.now ?? Date.now;
  const left = (deps.deadlineMs ?? DEFAULT_DEADLINE_MS) - (monotonic() - startedAt);
  // Discovery (configuration, the branch listing) is bounded by what is left of the plan's
  // deadline; the repository facts and every proof by the proof budget.
  const discoveryDeadline = now() + Math.max(0, left);
  const deadline =
    now() + Math.max(0, Math.min(deps.branchProofBudgetMs ?? BRANCH_PROOF_BUDGET_MS, left));
  const tracking = { timedOut: false };
  const git = branchGitContext(context, tracking, discoveryDeadline, now);
  const summary = { prefix: null, baseRef: null, baseCommit: null, reason: null, detail: null };
  const items = [];
  const retained = [];
  const delivery = await deliveryConfiguration(git, deps);
  if (delivery === null) {
    return { items, retained, summary: { ...summary, reason: 'configuration-unavailable' } };
  }
  Object.assign(summary, { prefix: delivery.prefix, baseRef: delivery.baseRef });
  const listing = await localBranches(git);
  if (listing === null) {
    const reason = tracking.timedOut ? 'timeout' : 'proof-unavailable';
    return { items, retained, summary: { ...summary, reason, detail: 'git-failed' } };
  }
  const { tips: branches, symbolic } = listing;
  const bound = new Map();
  for (const record of recordSet.valid.values()) {
    if (!actionable.has(record.recordId) || !BRANCH_ITEM_PURPOSES.includes(record.purpose))
      continue;
    if (delivery.prefix !== '' && !record.branch.startsWith(`${delivery.prefix}/`)) continue;
    if (!bound.has(record.branch)) bound.set(record.branch, record);
  }
  const names = [...branches.keys()]
    .filter(
      (name) =>
        !delivery.excluded.has(name) &&
        ((delivery.prefix !== '' && name.startsWith(`${delivery.prefix}/`)) || bound.has(name)),
    )
    .sort();
  if (names.length === 0) return { items, retained, summary };
  let repository = null;
  if (delivery.baseRef !== null) {
    repository = await settleBranchProof(() =>
      branchProofRepository(
        { cwd: roots.cwd, baseRef: delivery.baseRef, deadline },
        proofDeps(context, deps),
      ),
    );
  }
  const repositoryReason = delivery.baseRef === null ? 'base-ref-missing' : repository.reason;
  Object.assign(summary, {
    baseCommit: repository?.baseCommit ?? null,
    reason: repositoryReason,
    detail: repository?.detail ?? null,
  });
  const facts = {
    records: recordBranchFacts(recordSet),
    runs: await nonTerminalBuildRunBranches(roots.cwd),
    bound,
    worktrees,
    inUse: await branchesInUse(context.fs, roots.common),
    symbolic,
  };
  const sourceOf = (name) => (bound.has(name) ? 'record' : 'orphan');
  const retain = (name, reason, detail = null) =>
    retained.push({
      branch: name,
      tip: branches.get(name),
      reason,
      ...(detail ? { detail } : {}),
      ...(FETCH_HINT_REASONS.includes(reason) && delivery.baseRef
        ? { fetchHint: `git fetch origin ${delivery.baseRef}` }
        : {}),
    });
  const candidates = [];
  for (const name of names) {
    const reasons = branchExclusions(name, facts);
    if (repositoryReason !== null) reasons.push(repositoryReason);
    const reason = retainedBranchReason(reasons);
    if (reason === null) candidates.push(name);
    else retain(name, reason, reason === repositoryReason ? summary.detail : null);
  }
  candidates.sort(
    (left, right) => Number(bound.has(right)) - Number(bound.has(left)) || (left < right ? -1 : 1),
  );
  for (const name of candidates.slice(MAX_BRANCH_ITEMS)) retain(name, 'branch-limit');
  const proving = candidates.slice(0, MAX_BRANCH_ITEMS);
  const results = new Map();
  const timedOut = { proof: null, proofCommit: null, reason: 'timeout', detail: null };
  for (const [pass, prove] of [
    [1, branchTipProof],
    [2, branchSquashProof],
  ]) {
    for (const name of proving) {
      if (pass === 2 && results.get(name).reason !== 'not-proven') continue;
      results.set(
        name,
        now() >= deadline
          ? timedOut
          : await settleBranchProof(() =>
              prove(
                { cwd: roots.cwd, tip: branches.get(name), repository, deadline },
                proofDeps(context, deps),
              ),
            ),
      );
    }
  }
  for (const name of proving) {
    const result = results.get(name);
    if (result.proof === null) {
      retain(name, result.reason, result.detail);
      continue;
    }
    const source = sourceOf(name);
    const fields = {
      branch: name,
      tip: branches.get(name),
      baseRef: delivery.baseRef,
      proof: result.proof,
      proofCommit: result.proofCommit,
      source,
      dependsOn: source === 'record' ? `worktree:${bound.get(name).recordId}` : null,
    };
    items.push({
      itemId: `branch:${name}`,
      kind: 'branch',
      ...fields,
      baseCommit: summary.baseCommit,
      itemDigest: itemDigest(branchDigestInput(fields)),
    });
  }
  retained.sort((left, right) => (left.branch < right.branch ? -1 : 1));
  return { items, retained, summary };
}

// The record whose `worktree:` item binds `name` as a record-bound `branch:` item: a valid
// `retain` record of BRANCH_ITEM_PURPOSES naming it (under the prefix unless it is empty) whose
// worktree item `cleanup plan` would list as actionable now; null when there is none.
async function boundRecord(context, roots, shared, delivery, name) {
  const candidates = [...shared.recordSet.valid.values()]
    .filter(
      (record) =>
        record.branch === name &&
        BRANCH_ITEM_PURPOSES.includes(record.purpose) &&
        (delivery.prefix === '' || name.startsWith(`${delivery.prefix}/`)),
    )
    .sort((left, right) => (left.recordId < right.recordId ? -1 : 1));
  for (const record of candidates) {
    const facts = await gatherFacts(context, roots, shared.worktrees, record, {
      mergeGateRelease: true,
    });
    const { conditions, blockers } = assessEligibility(facts, {
      removal: true,
      mergeGateRelease: true,
    });
    if (conditions.length === 0 && blockers.length === 0) return record;
  }
  return null;
}

// The cheap pre-write check of one selected `branch:` item, run with GIT_NO_REPLACE_OBJECTS=1 and
// writing nothing: `proofCommit` names a commit (else `proof-commit-missing`); candidacy is
// re-derived from the current configuration, record set and build runs (`unknown-item`, or
// `not-actionable` with the retained reason as its one blocker); the digest over the current
// `branch`, `tip`, `baseRef`, `source`, `dependsOn` and the supplied `proof`/`proofCommit` matches
// (else `digest`); and `proofCommit` is in the current `origin/<base>`. No proof, checkout or
// in-use check runs here: those are the item's own step.
async function recomputeBranchItem(context, roots, name, value, shared, deps) {
  const tracking = { timedOut: false };
  const git = branchGitContext(context, tracking);
  const resolved = await gitLine(git, roots.cwd, [
    '--no-replace-objects',
    'rev-parse',
    '--verify',
    '-q',
    `${value.proofCommit}^{commit}`,
  ]);
  if (resolved !== value.proofCommit) return { reason: 'proof-commit-missing' };
  if (shared.delivery === undefined) shared.delivery = await deliveryConfiguration(git, deps);
  const delivery = shared.delivery;
  if (delivery === null || delivery.excluded.has(name)) return { reason: 'unknown-item' };
  const tip = await branchTip(git, name);
  if (tip === null) return { reason: 'unknown-item' };
  const symbolicRef = await isSymbolicBranch(git, name);
  if (symbolicRef === null) {
    return {
      reason: 'not-actionable',
      blockers: [tracking.timedOut ? 'timeout' : 'proof-unavailable'],
    };
  }
  shared.worktrees ??= await listWorktrees(git);
  shared.recordSet ??= await readRecordSet(context, roots);
  shared.buildRuns ??= await nonTerminalBuildRunBranches(roots.cwd);
  const own = await boundRecord(git, roots, shared, delivery, name);
  if (own === null && !(delivery.prefix !== '' && name.startsWith(`${delivery.prefix}/`))) {
    return { reason: 'unknown-item' };
  }
  const reason = retainedBranchReason(
    branchExclusions(name, {
      records: recordBranchFacts(shared.recordSet),
      runs: shared.buildRuns,
      bound: own ? new Map([[name, own]]) : new Map(),
      symbolic: symbolicRef ? new Set([name]) : null,
    }),
  );
  if (reason !== null) return { reason: 'not-actionable', blockers: [reason] };
  const fields = {
    branch: name,
    tip,
    baseRef: delivery.baseRef,
    proof: value.proof,
    proofCommit: value.proofCommit,
    source: own ? 'record' : 'orphan',
    dependsOn: own ? `worktree:${own.recordId}` : null,
  };
  const digest = itemDigest(branchDigestInput(fields));
  if (digest !== value.itemDigest) return { reason: 'digest' };
  if (delivery.baseRef === null)
    return { reason: 'not-actionable', blockers: ['base-ref-missing'] };
  const contained = await runGit(git, roots.cwd, [
    '--no-replace-objects',
    'merge-base',
    '--is-ancestor',
    value.proofCommit,
    `refs/remotes/origin/${delivery.baseRef}`,
  ]);
  if (!gitOk(contained)) {
    const blocker = tracking.timedOut
      ? 'timeout'
      : contained?.status === 1
        ? 'not-proven'
        : 'base-ref-missing';
    return { reason: 'not-actionable', blockers: [blocker] };
  }
  return { digest, branchItem: fields };
}

// The nearest existing `refs/heads/<dir>` and `logs/refs/heads/<dir>` directories of `branch`
// below `common`: where Git writes when it deletes or recreates the ref.
async function branchRefDirectories(fs, common, branch) {
  const directories = [];
  const branchDir = path.dirname(branch);
  for (const base of [
    path.join(common, 'refs', 'heads'),
    path.join(common, 'logs', 'refs', 'heads'),
  ]) {
    const found = await nearestDirectory(
      fs,
      branchDir === '.' ? base : path.join(base, branchDir),
      common,
    );
    if (found) directories.push(found);
  }
  return directories;
}

// A proof result's reason as a delete-time `reason` of BRANCH_ITEM_REASONS.
function branchItemReason(reason) {
  if (BRANCH_ITEM_REASONS.includes(reason)) return reason;
  if (['no-merge-base', 'base-ref-missing', 'candidate-limit'].includes(reason))
    return 'not-proven';
  return 'proof-unavailable';
}

// The step of one `branch:` item, immediately before its deletion and with GIT_NO_REPLACE_OBJECTS=1
// on every Git call: a record-bound item needs its `worktree:` item selected and removed in this
// call (`completed`, else `worktree-not-removed`); the tip is still the planned one (`ref-moved`);
// `verifyBranchProof` re-checks grafts, shallow, `proofCommit` in the current base and the one
// claimed proof (never a search); the whole record set and build-run state are read again
// (`recorded`, `record-unreadable` for an orphan); the sandbox preflight probes `<common>` and the
// ref directories (SANDBOX_DENIED); a signal recorded by then is INTERRUPTED before any deletion;
// then `compareAndDeleteBranch` checks checkout and in-use and deletes. A Git call cut off by the
// deadline is `timeout`. Every kept branch is BRANCH_RETAINED with its `reason`; nothing else in
// the call is affected.
async function applyBranchItem(context, roots, entry, completed, deps, signals) {
  const item = entry.branchItem;
  const retained = (reason, extra = {}) => ({
    itemId: entry.itemId,
    ok: false,
    code: 'BRANCH_RETAINED',
    branch: item.branch,
    tip: item.tip,
    reason,
    ...extra,
  });
  if (item.dependsOn !== null && completed.get(item.dependsOn) !== true) {
    return retained('worktree-not-removed');
  }
  await phase(deps, 'beforeBranchItem', { itemId: entry.itemId, branch: item.branch });
  const tracking = { timedOut: false };
  const git = branchGitContext(context, tracking);
  try {
    const tip = await branchTip(git, item.branch);
    if (tip !== item.tip) return retained(tracking.timedOut ? 'timeout' : 'ref-moved');
    const now = deps.now ?? Date.now;
    const verified = await settleBranchProof(() =>
      verifyBranchProof(
        {
          cwd: roots.cwd,
          tip,
          baseRef: item.baseRef,
          proof: item.proof,
          proofCommit: item.proofCommit,
          deadline: now() + context.clock.remaining(),
        },
        proofDeps(git, deps),
      ),
    );
    if (verified.proof !== item.proof || verified.proofCommit !== item.proofCommit) {
      return retained(
        branchItemReason(verified.reason ?? 'not-proven'),
        verified.detail ? { detail: verified.detail } : {},
      );
    }
    const set = await readRecordSet(context, roots);
    const runs = await nonTerminalBuildRunBranches(roots.cwd);
    const reason = retainedBranchReason(
      branchExclusions(item.branch, {
        records: recordBranchFacts(set),
        runs,
        // A record-bound item's own record is already gone, and the record-unreadable suppression
        // applies only to orphans.
        bound: item.source === 'record' ? new Map([[item.branch, { recordId: null }]]) : new Map(),
      }),
    );
    if (reason !== null) return retained(reason);
    const denied = await probeDirectories(
      context,
      [roots.common, ...(await branchRefDirectories(context.fs, roots.common, item.branch))],
      deps,
    );
    if (denied) {
      return {
        itemId: entry.itemId,
        ok: false,
        code: 'SANDBOX_DENIED',
        branch: item.branch,
        ...denied,
      };
    }
    // A signal that arrived during any step above stops the item here: nothing is deleted yet.
    if (signals.signal) {
      return {
        itemId: entry.itemId,
        ok: false,
        code: 'INTERRUPTED',
        signal: signals.signal,
        branch: item.branch,
        tip: item.tip,
      };
    }
    const deletion = await compareAndDeleteBranch(git, item.branch, tip, deps, signals);
    if (deletion.refused === 'interrupted') {
      return {
        itemId: entry.itemId,
        ok: false,
        code: 'INTERRUPTED',
        signal: deletion.signal,
        branch: item.branch,
        tip: item.tip,
      };
    }
    if (deletion.refused) {
      const { refused, ...rest } = deletion;
      return retained(refused === 'ref-moved' && tracking.timedOut ? 'timeout' : refused, rest);
    }
    return {
      itemId: entry.itemId,
      ok: true,
      deleted: true,
      branch: item.branch,
      tip,
      proof: item.proof,
      proofCommit: item.proofCommit,
      source: item.source,
      restore: restoreCommand(item.branch, tip),
      ...(deletion.configRemoved ? { configRemoved: deletion.configRemoved } : {}),
      ...(deletion.configRemaining ? { configRemaining: deletion.configRemaining } : {}),
    };
  } catch (error) {
    if (tracking.timedOut && error instanceof RuntimeStateError) return retained('timeout');
    throw error;
  }
}

export async function cleanupPlan(input, deps) {
  const startedAt = (deps.monotonicNow ?? (() => performance.now()))();
  const context = prepare('cleanup plan', input, deps);
  const decisions = requireDecisions(input.decisions);
  const roots = await openRoots(context, input);
  // Every record file is read once, so each lands in exactly one class, however it changes meanwhile.
  const recordSet = await readRecordSet(context, roots);
  const { worktrees, records, sources, facts, named, orphanLocks, ledgerDirectory } =
    await inspectRecords(context, roots, { mergeGateRelease: true, recordSet });
  const invalid = await invalidRecordEntries(context, roots, worktrees, recordSet);
  const items = [];
  const blocked = [];
  // The superseded-plan proofs run before the branch proofs, within their own budget.
  const proveSuperseded = supersededPlanProver(context, deps, startedAt);
  for (const record of records) {
    const itemId = `worktree:${record.recordId}`;
    // The digest binds the record exactly as its facts were derived; it is never re-read here,
    // so a record deleted or replaced since then cannot leak into the item.
    const source = sources.get(record.recordId);
    if (record.valid && record.conditions.length === 0 && record.blockers.length === 0) {
      items.push({
        itemId,
        kind: 'worktree',
        ...record,
        itemDigest: itemDigest(worktreeDigestInput(source, record.tip)),
      });
    } else if (record.valid && supersededPlanApplies(facts.get(record.recordId), record, true)) {
      const proof = await proveSuperseded(source);
      if (proof.ok) {
        items.push({
          itemId,
          kind: 'worktree',
          ...record,
          conditions: [],
          waivedConditions: [7],
          proof: SUPERSEDED_PLAN_PROOF,
          ...proof.evidence,
          itemDigest: itemDigest(worktreeDigestInput(source, record.tip, proof.evidence)),
        });
      } else {
        blocked.push({
          itemId,
          kind: 'worktree',
          blockers: [],
          ...record,
          supersededPlan: { reason: proof.reason },
        });
      }
    } else {
      blocked.push({ itemId, kind: 'worktree', blockers: [], ...record });
    }
  }
  const branches = await planBranches(
    context,
    roots,
    {
      worktrees,
      recordSet,
      actionable: new Set(
        items.filter((item) => item.kind === 'worktree').map((item) => item.recordId),
      ),
    },
    deps,
    startedAt,
  );
  items.push(...branches.items);
  items.push(...invalid.items);
  blocked.push(...invalid.blocked);
  for (const orphan of orphanLocks) {
    blocked.push({
      itemId: `worktree:${orphan.recordId}`,
      kind: 'orphanLock',
      blockers: [],
      ...orphan,
    });
  }
  const locatorStep = await locatorStepOrNull(context, deps);
  const marker = await readMarker(context);
  for (const name of LEGACY_RUNTIME_DIRS) {
    const legacy = await legacyDirectoryItem(context, name, decisions, locatorStep, marker);
    if (legacy) {
      if (legacy.actionable) items.push(legacy.item);
      else blocked.push({ blockers: [], ...legacy.item });
    }
  }
  const config = await legacyConfigItem(context, decisions, locatorStep);
  if (config) {
    if (config.actionable) items.push(config.item);
    else blocked.push({ blockers: [], ...config.item });
  }
  return {
    runtimeStateRoot: roots.cwd,
    executionRoot: roots.executionRoot,
    marker,
    locatorStep,
    decisions,
    items,
    blocked,
    // A worktree an invalid record names is accounted for by its `invalid-record` entry.
    unrecorded: await unrecordedWorktrees(
      context,
      roots,
      worktrees,
      new Set([...named, ...invalid.paths]),
      null,
      deps,
    ),
    runs: await runInventory(context),
    // The repository-wide facts of the `branch:` class and every branch it kept, each with its
    // one reason.
    branchProof: branches.summary,
    retainedBranches: branches.retained,
    // Only when the `ledgers/` entry is unsafe; `cleanup apply` then refuses every worktree item.
    ...(ledgerDirectory ? { ledgerDirectory } : {}),
  };
}

// The order `cleanup apply` runs its items in: valid records first, then the branches (a
// record-bound one after its worktree), then invalid records, the legacy directories and the
// legacy config file.
const ITEM_ORDER = Object.freeze({
  worktree: 0,
  branch: 1,
  'invalid-record': 2,
  legacy: 3,
  config: 4,
});

function itemKind(itemId) {
  return itemId.slice(0, itemId.indexOf(':'));
}

// Recomputes one selected item from fresh evidence: `{ok: true, ...}` with what apply needs, or a
// PREVIEW_MISMATCH reason.
async function recomputeItem(context, roots, itemId, decisions, shared, deps, value = null) {
  const kind = itemKind(itemId);
  const key = itemId.slice(kind.length + 1);
  if (kind === 'branch') return recomputeBranchItem(context, roots, key, value, shared, deps);
  if (kind === 'worktree') {
    const read = await readRecord(context, recordPaths(roots.cwd, key), key);
    if (read.state !== 'ok') return { reason: 'unknown-item' };
    shared.worktrees ??= await listWorktrees(context);
    const facts = await gatherFacts(context, roots, shared.worktrees, read.record, {
      mergeGateRelease: true,
    });
    let { conditions, blockers } = assessEligibility(facts, {
      removal: true,
      mergeGateRelease: true,
    });
    let superseded = null;
    if (supersededPlanApplies(facts, { conditions, blockers }, true)) {
      shared.proveSuperseded ??= supersededPlanProver(context, deps);
      superseded = await shared.proveSuperseded(read.record);
      if (superseded.ok) conditions = [];
    }
    const evidence = superseded?.ok ? superseded.evidence : null;
    const digest = itemDigest(worktreeDigestInput(read.record, facts.branchTip, evidence));
    // An item `cleanup plan` would list as blocked is never selectable, whatever digest it carries.
    if (conditions.length > 0 || blockers.length > 0) {
      return {
        reason: 'not-actionable',
        conditions,
        blockers,
        digest,
        ...(superseded ? { supersededPlan: { reason: superseded.reason } } : {}),
      };
    }
    // A proven item is selected only as `{itemDigest, proof}`, every other one only as its digest.
    if ((evidence !== null) !== isObject(value)) return { reason: 'proof-mismatch', digest };
    return {
      digest,
      recordId: key,
      supersededPlan: evidence === null ? null : { planPath: evidence.planPath },
    };
  }
  if (kind === 'invalid-record') {
    // Nothing is written during the first pass, so its items share one record set and one list.
    shared.worktrees ??= await listWorktrees(context);
    shared.recordSet ??= await readRecordSet(context, roots);
    const entry = shared.recordSet.invalid.get(key);
    if (!entry) return { reason: 'unknown-item' };
    const assessed = await assessInvalidRecord(
      context,
      roots,
      shared.worktrees,
      shared.recordSet,
      entry,
    );
    if (assessed.blockers.length > 0) {
      return { reason: 'not-actionable', blockers: assessed.blockers, digest: assessed.digest };
    }
    return { digest: assessed.digest, invalidRecordId: key };
  }
  shared.locatorStep ??= await locatorStepOrNull(context, deps);
  if (kind === 'legacy') {
    shared.marker ??= await readMarker(context);
    const legacy = await legacyDirectoryItem(
      context,
      key,
      decisions,
      shared.locatorStep,
      shared.marker,
    );
    if (!legacy?.listing) return { reason: 'unknown-item' };
    if (!legacy.actionable) return { reason: 'not-actionable', failures: legacy.item.failures };
    const digest = itemDigest({
      kind: 'legacyRuntimeDirectory',
      path: key,
      listing: digestListing(legacy.listing),
      decisions: applicableDecisions(key, decisions),
    });
    return { digest, legacy };
  }
  const config = await legacyConfigItem(context, decisions, shared.locatorStep);
  if (!config) return { reason: 'unknown-item' };
  if (!config.actionable) return { reason: 'not-actionable', failures: config.item.failures };
  const listing =
    config.listing ?? (await listLegacyTree(path.join(context.cwd, key)).catch(() => null));
  if (!listing) return { reason: 'unknown-item' };
  const digest = itemDigest({
    kind: 'legacyConfigFile',
    path: key,
    listing: digestListing(listing),
    decisions: { decision: decisions.config[key] },
  });
  return { digest, config: { ...config, listing } };
}

// Removes one legacy item through the guard's listing-bound remover. Recompute eligibility and
// match the digest after earlier items, then recheck current preservation and guards for each
// non-directory source. The original listing still binds every source identity and SHA-256;
// owned removals change the remaining listing, so only the initial recheck compares its digest.
// Tracked files are never removed here (`git rm` stays prose).
async function applyLegacy(context, roots, itemId, prepared, decisions, deps) {
  const recheck = async (matchDigest) => {
    const fresh = await recomputeItem(context, roots, itemId, decisions, {}, deps);
    if (fresh.reason || (matchDigest && fresh.digest !== prepared.digest)) {
      const error = new RuntimeStateError(
        'LEGACY_CHANGED',
        `${itemId} no longer matches its cleanup proof`,
      );
      error.itemDetails = {
        reason: fresh.reason ?? 'digest',
        ...(fresh.failures ? { failures: fresh.failures } : {}),
      };
      error.removed = 0;
      error.remaining = '';
      throw error;
    }
    return fresh;
  };
  const fresh = await recheck(true);
  const target = path.join(context.cwd, fresh.legacy?.item.path ?? TRANSITIONAL_CONFIG_FILE);
  const entry = fresh.legacy ?? fresh.config;
  if (fresh.config) await guardTarget(context, target);
  const { removed } = await removeLegacyListing(context, target, entry.listing, {
    beforeEntry: deps.onLegacyEntry,
    validateEntry: async (source) => {
      if (source.type !== 'directory') await recheck(false);
    },
  });
  return { itemId, ok: true, removed: true, removedEntries: removed };
}

// `cleanup apply`: removes only the items the caller selected by `itemId` with the digest `cleanup
// plan` showed. Every selected item is recomputed first and any difference (a changed digest, an
// unknown item, or an item that is no longer actionable, `reason: "not-actionable"`) ends the
// whole call as PREVIEW_MISMATCH before the first write; items then run in ITEM_ORDER, each
// re-checked again under its own lock or listing (an `invalid-record` item's difference there is
// its own PREVIEW_MISMATCH). Nothing here
// breaks a lock, prunes, or forces a removal, and `decisions` can only discard carry-over entries,
// never widen what the guard admits.
export async function cleanupApply(input, deps) {
  const context = prepare('cleanup apply', input, deps);
  const decisions = requireDecisions(input.decisions);
  const selected = requireItems(input.items);
  const clock = startClock(deps);
  boundGit(context, clock);
  const roots = await openRoots(context, input);
  const shared = {};
  const prepared = [];
  for (const itemId of Object.keys(selected).sort(
    (left, right) =>
      ITEM_ORDER[itemKind(left)] - ITEM_ORDER[itemKind(right)] || (left < right ? -1 : 1),
  )) {
    const fresh = await recomputeItem(
      context,
      roots,
      itemId,
      decisions,
      shared,
      deps,
      selected[itemId],
    );
    if (fresh.reason) {
      return new StateOutcome('PREVIEW_MISMATCH', {
        itemId,
        reason: fresh.reason,
        ...(fresh.conditions ? { conditions: fresh.conditions } : {}),
        ...(fresh.blockers ? { blockers: fresh.blockers } : {}),
        ...(fresh.supersededPlan ? { supersededPlan: fresh.supersededPlan } : {}),
        ...(fresh.failures ? { failures: fresh.failures } : {}),
      });
    }
    const expected =
      typeof selected[itemId] === 'string' ? selected[itemId] : selected[itemId].itemDigest;
    if (fresh.digest !== expected) {
      return new StateOutcome('PREVIEW_MISMATCH', { itemId, reason: 'digest' });
    }
    prepared.push({ id: { itemId }, itemId, ...fresh });
  }
  // Which items succeeded so far: a record-bound branch runs only after its worktree item did.
  const completed = new Map();
  const items = await runItems(prepared, clock, deps, async (entry, signals) => {
    const result = await applyItem(entry, signals);
    completed.set(entry.itemId, result.ok === true);
    return result;
  });
  return { items };

  async function applyItem(entry, signals) {
    if (entry.branchItem) return applyBranchItem(context, roots, entry, completed, deps, signals);
    if (entry.recordId) {
      const result = await removeOne(
        context,
        roots,
        entry.recordId,
        {
          operation: 'cleanup apply',
          sessionId: null,
          allowActive: false,
          integration: null,
          expectDigest: entry.digest,
          mergeGateRelease: true,
          supersededPlan: entry.supersededPlan,
          signals,
        },
        deps,
      );
      return { itemId: entry.itemId, ...result };
    }
    if (entry.invalidRecordId) {
      const result = await retireInvalidRecord(
        context,
        roots,
        entry.invalidRecordId,
        entry.digest,
        signals,
        deps,
      );
      return { itemId: entry.itemId, ...result };
    }
    return applyLegacy(context, roots, entry.itemId, entry, decisions, deps);
  }
}
