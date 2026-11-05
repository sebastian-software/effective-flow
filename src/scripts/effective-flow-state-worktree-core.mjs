// Runtime-state helper: the worktree-lifecycle and cleanup operations that workflows used to replay
// from prose (`worktree-lifecycle.md`, `worktree-integration.md`, `cleanup.md`).
//
//   worktree record-init  {cwd, executionRoot, record}
//   worktree transition   {cwd, executionRoot, recordId, from, to, reason, sessionId, branch?,
//                          workflow?, fetchedHeadOid?}
//   worktree inspect      {cwd, executionRoot, sessionId?}
//   worktree remove       {cwd, executionRoot, sessionId, recordIds, integrationRoot?}
//   cleanup plan          {cwd, executionRoot, decisions?}
//   cleanup apply         {cwd, executionRoot, decisions?, items}
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
// invalid value, is never repaired or rewritten: it is INVALID_STATE, or ineligible (condition 1).
// Every record write goes through `atomicWrite` (or `createNoClobber` for `record-init`), every
// record path through the runtime-state guard.
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
// compare-and-delete `git update-ref -d refs/heads/<branch> <branchOid>` once no worktree checks it
// out. Otherwise the branch stays, the record is still deleted, and the item is BRANCH_RETAINED
// with the branch and its unproven commits. A `retain` branch is never touched.
//
// The multi-item operations return `{items: [...]}` with one result per item; a guard refusal of
// one item (UNSAFE_TARGET, LEGACY_CHANGED, …) is that item's result and the others continue. Only
// a root or input error (INVALID_ROOT, INVALID_INPUT, RUNTIME_STATE_UNSAFE) or a PREVIEW_MISMATCH
// before the first write ends the whole call.

import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rmdir, unlink } from 'node:fs/promises';
import { hostname as osHostname } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { resolveConfiguration } from './config-resolve-core.mjs';
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
]);
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
// `from` → allowed `to` of `worktree transition`.
export const TRANSITIONS = Object.freeze({
  active: Object.freeze(['cleanup-ready', 'aborted', 'failed']),
  aborted: Object.freeze(['active']),
  failed: Object.freeze(['active']),
});
export const ELIGIBILITY_CONDITIONS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9]);

export const DEFAULT_BASE_DIR = '.effective-flow/.worktrees';
export const PLAN_PUBLICATION_SUFFIX = '-plan-publication';
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
const OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
// A conservative subset of `git check-ref-format --branch`: no whitespace, control character,
// `~^:?*[\`, `..`, `//`, `@{`, leading `-` or `/`, trailing `/`, `.` or `.lock`.
const BRANCH_PATTERN =
  /^(?!-)(?!\/)(?!.*\.\.)(?!.*\/\/)(?!.*@\{)(?!.*\/\.)(?!\.)(?!.*\.lock$)(?!.*[/.]$)[^\x00-\x20~^:?*[\\\x7f]+$/;
export const ITEM_ID_PATTERN =
  /^(?:worktree:[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}|legacy:\.(?:firmo|sf-plugin)|config:\.effective-flow\/config\.json)$/;

const PROBE_FLAGS = fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | O_NOFOLLOW;
const OWNER_FLAGS = PROBE_FLAGS;

// The filesystem calls the core makes for locks and probes, injectable as `deps.fs`.
const DEFAULT_FS = Object.freeze({ lstat, mkdir, open, readdir, realpath, rmdir, unlink });

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

async function phase(deps, name, detail) {
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
  const expectedPolicy = value.purpose === 'apply-review' ? 'delete-after-integration' : 'retain';
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

async function listWorktrees(context) {
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

function prepare(operation, input, deps) {
  requireObject(input, 'input');
  requireClosedKeys(input, OPERATION_KEYS[operation], 'input');
  const context = makeContext(deps);
  context.fs = { ...DEFAULT_FS, ...deps.fs };
  return context;
}

async function openRoots(context, input) {
  await requireRootSyntax(input.cwd);
  const { cwd, common } = await resolveRoot(context, input.cwd);
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

// The paths of the purpose table for one record: `{exact}` or `{parent}` (a direct child).
async function requiredLocation(context, bases, record) {
  const repo = path.basename(context.cwd);
  const session = record.sessionId;
  if (record.purpose === 'apply-review') {
    return {
      parent: await canonicalOrSelf(context.fs, path.join(bases.applyReview, repo, session)),
    };
  }
  const leaf =
    record.purpose === 'plan-publication' ? `${session}${PLAN_PUBLICATION_SUFFIX}` : session;
  return { exact: await canonicalOrSelf(context.fs, path.join(bases.worktree, repo, leaf)) };
}

// ---------------------------------------------------------------------------------------------
// Record reading and writing

// Reads one record: `{state: 'missing'}`, `{state: 'invalid', reason}` or `{state: 'ok', record}`.
async function readRecord(context, paths, recordId) {
  const read = await readBoundedFile(context.fs, paths.record, MAX_RECORD_BYTES);
  if (read.state === 'missing') return { state: 'missing' };
  if (read.state !== 'ok') return { state: 'invalid', reason: read.state };
  let value;
  try {
    value = JSON.parse(read.content.toString('utf8'));
  } catch {
    return { state: 'invalid', reason: 'invalid-json' };
  }
  const problem = recordProblem(value, recordId);
  return problem ? { state: 'invalid', reason: problem } : { state: 'ok', record: value };
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

async function lockStillOwned(context, paths, held) {
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
async function withRecordLock(context, paths, fields, deps, fn) {
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
function interruptedUnderLock(signals, recordId, status) {
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
// INTERRUPTED. A write that had already landed is reported with `written: true` and its status.
async function deferSignals(deps, recordId, fn) {
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
// accepts (`cleanup-ready` and `cleanup-failed`; `worktree remove` adds `active`).
export function evaluateEligibility(facts, { statuses = CLAIMABLE_STATUSES } = {}) {
  const failed = [];
  if (!facts.schemaValid || !facts.ownershipCreated || !statuses.includes(facts.status)) {
    failed.push(1);
  }
  if (!facts.receiptMatches) failed.push(2);
  if (facts.registrationCount !== 1 || !facts.linked) failed.push(3);
  if (facts.locked || facts.prunable || !facts.directoryExists || !facts.commonDirMatches) {
    failed.push(4);
  }
  if (
    !facts.headOnBranch ||
    !facts.registrationOnBranch ||
    !facts.branchTip ||
    facts.registeredHead !== facts.branchTip
  ) {
    failed.push(5);
  }
  if (!facts.creationIsCommit || !facts.creationAncestor) failed.push(6);
  if (!facts.clean) failed.push(7);
  if (facts.isMain || facts.isExecutionRoot) failed.push(8);
  if (facts.foreignLock || facts.foreignClaim) failed.push(9);
  return failed;
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
  const { fs } = context;
  const target = record.worktreePath;
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
    canonicalCommon !== null &&
    canonicalCommon === roots.common &&
    canonicalCommon === record.repositoryIdentity;
  return proof;
}

// Gathers the facts of one valid record. `worktrees` is a fresh porcelain list; `ownLock` the
// token this actor holds on the record lock (null when none); `ownClaim` this actor's claim ID.
async function gatherFacts(context, roots, worktrees, record, { ownLock = null, ownClaim = null }) {
  const { fs } = context;
  const target = record.worktreePath;
  const registrations = worktrees.filter((entry) => matches(entry, target));
  const entry = registrations[0] ?? null;
  const facts = {
    schemaValid: true,
    ownershipCreated: record.ownership === OWNERSHIP,
    status: record.status,
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
    isMain: target === roots.cwd || (worktrees[0] ? matches(worktrees[0], target) : false),
    isExecutionRoot: target === roots.executionRoot,
    foreignLock: false,
    foreignClaim: false,
    receiptMatches: false,
  };
  let toplevel = null;
  Object.assign(facts, await proveOwnWorktree(context, roots, record));
  // Every further in-worktree Git call reads the worktree's configuration, which a foreign
  // repository controls (`core.fsmonitor` runs a command on `status`). They run only once the
  // common directory proved the worktree this repository's; otherwise the facts stay false.
  if (facts.commonDirMatches) {
    const top = await gitLine(context, target, ['rev-parse', '--show-toplevel']);
    toplevel = top === null ? null : await canonical(fs, top);
    facts.headOnBranch =
      (await gitLine(context, target, ['symbolic-ref', '-q', 'HEAD'])) ===
      `refs/heads/${record.branch}`;
    const status = await runGit(context, target, [
      '-c',
      'core.fsmonitor=false',
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--ignore-submodules=none',
    ]);
    facts.clean = gitOk(status) && asBuffer(status.stdout).length === 0;
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
  facts.receiptMatches =
    record.repositoryIdentity === roots.common &&
    record.runtimeStateRoot === roots.cwd &&
    receipt.repositoryIdentity === roots.common &&
    receipt.runtimeStateRoot === roots.cwd &&
    receipt.executionRoot === target &&
    receipt.checkout.kind === 'branch' &&
    receipt.checkout.branch === record.branch &&
    receipt.origin === record.ownership &&
    receipt.workflow === record.workflow &&
    receipt.purpose === record.purpose &&
    toplevel === target;
  const paths = recordPaths(roots.cwd, record.recordId);
  const lock = await observeRecordLock(context, paths);
  facts.lock = publicLock(lock, paths);
  facts.foreignLock =
    lock.present && !(ownLock && lock.owner.state === 'valid' && lock.owner.token === ownLock);
  facts.foreignClaim =
    record.status === 'cleanup-in-progress' && !(ownClaim && record.cleanupRunId === ownClaim);
  return facts;
}

// ---------------------------------------------------------------------------------------------
// Input validation

function requireRecordId(value, label = 'recordId') {
  if (typeof value !== 'string' || !RECORD_ID_PATTERN.test(value)) {
    fail('INVALID_INPUT', `${label} must match ${RECORD_ID_PATTERN.source}`);
  }
  return value;
}

function requireSessionId(value) {
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

function requireItems(value) {
  const items = requireObject(value, 'items');
  const ids = Object.keys(items);
  if (ids.length === 0 || ids.length > MAX_RECORD_IDS + 3) {
    fail('INVALID_INPUT', `items must select 1 to ${MAX_RECORD_IDS + 3} items`);
  }
  for (const id of ids) {
    if (!ITEM_ID_PATTERN.test(id)) fail('INVALID_INPUT', `items has an invalid itemId: ${id}`);
    if (typeof items[id] !== 'string' || !SHA256_PATTERN.test(items[id])) {
      fail('INVALID_INPUT', `items.${id} must be a SHA-256 itemDigest`);
    }
  }
  return items;
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
  if (adoption) {
    if (typeof input.fetchedHeadOid !== 'string' || !OID_PATTERN.test(input.fetchedHeadOid)) {
      fail('INVALID_INPUT', 'fetchedHeadOid must be a full commit OID for an adoption');
    }
  } else if (input.fetchedHeadOid !== undefined) {
    fail('INVALID_INPUT', 'fetchedHeadOid is only valid for an adoption');
  }
  return { recordId, sessionId, from: input.from, to: input.to, reason: input.reason, adoption };
}

function reasonProblem(to, reason) {
  if (NULL_REASON_STATUSES.includes(to)) return reason === null ? null : 'must be null';
  return isText(reason, MAX_REASON_CHARS) ? null : 'must be a non-empty string';
}

export async function transition(input, deps) {
  const context = prepare('worktree transition', input, deps);
  const request = requireTransition(input);
  if (!TRANSITIONS[request.from]?.includes(request.to)) {
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
        if (!request.adoption && record.sessionId !== request.sessionId) {
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
        if (request.adoption) {
          const refused = await adoptionProofs(context, roots, record, input, held);
          if (refused) return refused;
        }
        const next = {
          ...record,
          status: request.to,
          reason: request.reason,
          updatedAt: timestamp(deps),
          ...(request.adoption ? { sessionId: request.sessionId } : {}),
        };
        if (signals.signal) return interruptedUnderLock(signals, record.recordId, record.status);
        await writeRecord(context, paths, next, held);
        return {
          recordId: record.recordId,
          from: request.from,
          status: request.to,
          sessionId: next.sessionId,
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

async function inspectRecords(context, roots, { sessionId = null } = {}) {
  const worktrees = await listWorktrees(context);
  const records = [];
  const sources = new Map();
  const named = new Set();
  for (const id of await listRecordIds(context)) {
    const paths = recordPaths(roots.cwd, id);
    const read = await readRecord(context, paths, id);
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
    const facts = await gatherFacts(context, roots, worktrees, record, {});
    sources.set(id, record);
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
      tip: facts.branchTip,
      conditions: evaluateEligibility(facts),
      lock: facts.lock,
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
  return { worktrees, records, sources, named, orphanLocks };
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
        path.join(bases.worktree, repo, `${sessionId}${PLAN_PUBLICATION_SUFFIX}`),
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
  const { worktrees, records, named, orphanLocks } = await inspectRecords(context, roots, {
    sessionId,
  });
  return {
    runtimeStateRoot: roots.cwd,
    executionRoot: roots.executionRoot,
    sessionId,
    records,
    orphanLocks,
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
// deleting its ref.
async function preflightDirectories(context, roots, record) {
  const { fs } = context;
  const directories = [];
  const gitDir = await gitLine(context, record.worktreePath, [
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
    const branchDir = path.dirname(record.branch);
    for (const base of [
      path.join(roots.common, 'refs', 'heads'),
      path.join(roots.common, 'logs', 'refs', 'heads'),
    ]) {
      const found = await nearestDirectory(
        fs,
        branchDir === '.' ? base : path.join(base, branchDir),
        roots.common,
      );
      if (found) directories.push(found);
    }
  }
  const parent = await nearestDirectory(fs, path.dirname(record.worktreePath), '/');
  if (parent) directories.push(parent);
  return [...new Set(directories)];
}

// Creates and removes one probe file per directory. Returns null, or the first denied directory.
async function preflight(context, roots, record, deps) {
  for (const directory of await preflightDirectories(context, roots, record)) {
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
// `integrationRoot` the branch is never force-deleted; it is retained as `not-merged` with the
// commits `HEAD` lacks. Every retained outcome keeps the branch and still lets the record go.
async function deleteTemporaryBranch(context, record, integration, deps) {
  const branch = record.branch;
  const branchOid = await branchTip(context, branch);
  if (!branchOid) return { outcome: 'missing', branch };
  const soft = await runGit(context, context.cwd, ['branch', '-d', branch]);
  if (gitOk(soft)) return { outcome: 'deleted', branch, branchOid };
  const refusal = errorDetail(soft?.stderr);
  const retained = (reason, unproven = []) => ({
    outcome: 'retained',
    branch,
    branchOid,
    reason,
    unproven,
    detail: refusal,
  });
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
  const checkedOut = (await listWorktrees(context)).some(
    (entry) => entry.branch === `refs/heads/${branch}`,
  );
  if (checkedOut) return retained('checked-out');
  await phase(deps, 'beforeBranchDelete', { branch, branchOid });
  const deleted = await runGit(context, context.cwd, [
    'update-ref',
    '-d',
    `refs/heads/${branch}`,
    branchOid,
  ]);
  if (!gitOk(deleted)) return retained('ref-moved');
  return { outcome: 'deleted-after-proof', branch, branchOid, proof: proof.reason };
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

function worktreeDigestInput(record, tip) {
  return {
    kind: 'worktree',
    recordId: record.recordId,
    worktreePath: record.worktreePath,
    branch: record.branch,
    tip,
    branchPolicy: record.branchPolicy,
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

async function worktreeGone(context, record) {
  const worktrees = await listWorktrees(context);
  const registered = worktrees.some((entry) => matches(entry, record.worktreePath));
  let present = true;
  try {
    await context.fs.lstat(record.worktreePath);
  } catch (error) {
    present = error?.code !== 'ENOENT';
  }
  return { registered, present, gone: !registered && !present };
}

// Runs claim-remove-reconcile for one record. `options`:
//   sessionId     the owner every record must belong to (`worktree remove`), or null
//   allowActive   whether an `active` record is first moved to `cleanup-ready`
//   integration   `{branch, excluded}` for the `apply-review` proof, or null
//   expectDigest  the selected `itemDigest` re-checked under the lock (`cleanup apply`), or null
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
  if (!proof.commonDirMatches) {
    const facts = await gatherFacts(context, roots, await listWorktrees(context), first.record, {});
    const statuses = options.allowActive ? ['active', ...CLAIMABLE_STATUSES] : CLAIMABLE_STATUSES;
    return itemFailure(recordId, 'NOT_ELIGIBLE', {
      status: first.record.status,
      conditions: evaluateEligibility(facts, { statuses }),
    });
  }
  const denied = await preflight(context, roots, first.record, deps);
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
// branch policy run and the record be deleted.
async function claimAndRemove(context, roots, paths, recordId, cleanupRunId, held, options, deps) {
  const read = await readRecord(context, paths, recordId);
  if (read.state === 'missing') return itemFailure(recordId, 'RECORD_NOT_FOUND');
  if (read.state === 'invalid') {
    return itemFailure(recordId, 'INVALID_STATE', { reason: read.reason, conditions: [1] });
  }
  let record = read.record;
  if (options.sessionId !== null && record.sessionId !== options.sessionId) {
    return itemFailure(recordId, 'NOT_OWNER', { reason: 'session-mismatch' });
  }
  const worktrees = await listWorktrees(context);
  const facts = await gatherFacts(context, roots, worktrees, record, { ownLock: held.token });
  if (options.expectDigest !== null) {
    if (itemDigest(worktreeDigestInput(record, facts.branchTip)) !== options.expectDigest) {
      return itemFailure(recordId, 'PREVIEW_MISMATCH', { reason: 'digest' });
    }
  }
  const statuses = options.allowActive ? ['active', ...CLAIMABLE_STATUSES] : CLAIMABLE_STATUSES;
  const conditions = evaluateEligibility(facts, { statuses });
  if (conditions.length > 0) {
    return itemFailure(recordId, 'NOT_ELIGIBLE', { status: record.status, conditions });
  }
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
  record = {
    ...record,
    status: 'cleanup-in-progress',
    cleanupRunId,
    claimedAt: timestamp(deps),
    updatedAt: timestamp(deps),
  };
  await writeRecord(context, paths, record, held);
  const claimed = record;
  try {
    return await removeClaimed(context, roots, paths, recordId, claimed, held, options, deps);
  } catch (error) {
    // Any error after the claim (a failed or timed-out Git call, a lost lock, a guard refusal)
    // would otherwise leave the record `cleanup-in-progress` under a claim no one finishes. It is
    // reconciled to `cleanup-failed` with the error under the still-held lock, then mapped as usual.
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
      };
    }
    throw error;
  }
}

// The claimed part of `claimAndRemove`: `record` is `cleanup-in-progress` under this actor's claim.
async function removeClaimed(context, roots, paths, recordId, record, held, options, deps) {
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

export async function cleanupPlan(input, deps) {
  const context = prepare('cleanup plan', input, deps);
  const decisions = requireDecisions(input.decisions);
  const roots = await openRoots(context, input);
  const { worktrees, records, sources, named, orphanLocks } = await inspectRecords(context, roots);
  const items = [];
  const blocked = [];
  for (const record of records) {
    const itemId = `worktree:${record.recordId}`;
    if (record.valid && record.conditions.length === 0) {
      // The digest binds the record exactly as its facts were derived; it is never re-read here,
      // so a record deleted or replaced since then cannot leak into the item.
      items.push({
        itemId,
        kind: 'worktree',
        ...record,
        itemDigest: itemDigest(worktreeDigestInput(sources.get(record.recordId), record.tip)),
      });
    } else {
      blocked.push({ itemId, kind: 'worktree', ...record });
    }
  }
  for (const orphan of orphanLocks) {
    blocked.push({ itemId: `worktree:${orphan.recordId}`, kind: 'orphanLock', ...orphan });
  }
  const locatorStep = await locatorStepOrNull(context, deps);
  const marker = await readMarker(context);
  for (const name of LEGACY_RUNTIME_DIRS) {
    const legacy = await legacyDirectoryItem(context, name, decisions, locatorStep, marker);
    if (legacy) (legacy.actionable ? items : blocked).push(legacy.item);
  }
  const config = await legacyConfigItem(context, decisions, locatorStep);
  if (config) (config.actionable ? items : blocked).push(config.item);
  return {
    runtimeStateRoot: roots.cwd,
    executionRoot: roots.executionRoot,
    marker,
    locatorStep,
    decisions,
    items,
    blocked,
    unrecorded: await unrecordedWorktrees(context, roots, worktrees, named, null, deps),
    runs: await runInventory(context),
  };
}

const ITEM_ORDER = Object.freeze({ worktree: 0, legacy: 1, config: 2 });

function itemKind(itemId) {
  return itemId.slice(0, itemId.indexOf(':'));
}

// Recomputes one selected item from fresh evidence: `{ok: true, ...}` with what apply needs, or a
// PREVIEW_MISMATCH reason.
async function recomputeItem(context, roots, itemId, decisions, shared, deps) {
  const kind = itemKind(itemId);
  const key = itemId.slice(kind.length + 1);
  if (kind === 'worktree') {
    const read = await readRecord(context, recordPaths(roots.cwd, key), key);
    if (read.state !== 'ok') return { reason: 'unknown-item' };
    shared.worktrees ??= await listWorktrees(context);
    const facts = await gatherFacts(context, roots, shared.worktrees, read.record, {});
    const digest = itemDigest(worktreeDigestInput(read.record, facts.branchTip));
    const conditions = evaluateEligibility(facts);
    // An item `cleanup plan` would list as blocked is never selectable, whatever digest it carries.
    if (conditions.length > 0) return { reason: 'not-actionable', conditions, digest };
    return { digest, recordId: key };
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
// whole call as PREVIEW_MISMATCH before the first write; items then run worktrees first, legacy directories next,
// the legacy config file last, each re-checked again under its own lock or listing. Nothing here
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
    const fresh = await recomputeItem(context, roots, itemId, decisions, shared, deps);
    if (fresh.reason) {
      return new StateOutcome('PREVIEW_MISMATCH', {
        itemId,
        reason: fresh.reason,
        ...(fresh.conditions ? { conditions: fresh.conditions } : {}),
        ...(fresh.failures ? { failures: fresh.failures } : {}),
      });
    }
    if (fresh.digest !== selected[itemId]) {
      return new StateOutcome('PREVIEW_MISMATCH', { itemId, reason: 'digest' });
    }
    prepared.push({ id: { itemId }, itemId, ...fresh });
  }
  const items = await runItems(prepared, clock, deps, async (entry, signals) => {
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
          signals,
        },
        deps,
      );
      return { itemId: entry.itemId, ...result };
    }
    return applyLegacy(context, roots, entry.itemId, entry, decisions, deps);
  });
  return { items };
}
