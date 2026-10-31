// Runtime-state helper core: the three `mkdir` locks below `<RUNTIME_STATE_ROOT>/.effective-flow/`
// that workflows used to acquire and release by following prose, plus the dispatch, codes and
// envelopes of every helper operation. The `memory` operations live in
// `effective-flow-state-memory-core.mjs` and `harness allow-rules` in
// `effective-flow-state-harness-core.mjs`; both import this module and are loaded on first use.
//
// A lock is named by a closed enum and mapped to a fixed path; no path comes from the caller:
//
//   memory              -> .effective-flow/memory.lock/owner.json
//   iterate-commit      -> .effective-flow/iterate-commit.lock/owner
//   apply-review-commit -> .effective-flow/apply-review-commit.lock/owner
//
// The on-disk protocol is the one the prose uses: the lock is a directory created by `mkdir`, and
// the owner file below it is written exclusively right after. The helper writes a JSON owner with a
// token it generates, and treats every owner it cannot parse under its own schema, including one
// written by older prose, as foreign: it blocks `lock acquire`, `lock release` refuses it, and only
// a confirmed `lock break` against the observed directory identity and owner digest (or, for an
// owner above MAX_HASH_BYTES, its size) removes it.
//
// Every operation takes one JSON object; `executeOperation` never throws and returns one envelope:
//   success  {"ok":true,"operation":…,"result":…}                      exit 0
//   outcome  {"ok":false,"operation":…,"outcome":{"code":…,…}}         exit 4
//   error    {"ok":false,"operation":…,"error":{"code":…,"message":…}} exit 1, 2 or 3
// Outcomes are expected lock states a caller branches on; errors stop the step.
//
// `lock release` and `lock break` never delete under the lock's own name. After the guards and
// the final observation they atomically rename the lock directory to a unique tombstone sibling
// (`<lock>.release-<hex>` or `<lock>.break-<hex>` below `.effective-flow/`), verify the tombstone
// against that observation, and only then delete its owner file and directory with raw calls, so
// no git spawn sits between the last check and the delete. A tombstone is no lock name: it never
// blocks `lock acquire`, but one left behind (an interrupted helper, a failed delete, or a mismatch
// that could not be renamed back) may hold an unverified directory. `lock inspect` lists them.
//
// Every helper mutation of a lock path is serialized by that lock's guard, a bare `mkdir` sibling
// `<lock>.guard` below `.effective-flow/`. `lock acquire` holds it from its `mkdir` of the lock
// directory through the owner write, the identity re-check and any cleanup; `lock release` and
// `lock break` hold it from their final observation through the rename, the tombstone
// verification, any restore and the delete. No other helper call can therefore release, break or
// re-acquire the lock between a final identity check and the path mutation that relies on it, so a
// removal or cleanup only ever moves or deletes the node it validated. The guard is held for a few
// filesystem calls and at most one guard check; a caller that cannot take it within GUARD_WAIT_MS
// fails with RUNTIME_STATE_UNSAFE naming it and changes nothing. A guard is never broken by age: one
// left by an interrupted helper blocks every mutation of its lock, never displaces an owner, and is
// removed by hand only after confirming that no `effective-flow-state` call is running.

import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  link,
  lstat,
  mkdir,
  open,
  readdir,
  readlink,
  realpath,
  rename,
  rmdir,
  stat,
  unlink,
} from 'node:fs/promises';
import { hostname as osHostname } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import {
  O_NOFOLLOW,
  RUNTIME_STATE_DIR,
  RuntimeStateError,
  assertDirectoryChain,
  ensureGuardedDirectory,
  gitBaseEnv,
  guardTarget,
  resolveRuntimeRoot,
} from './runtime-state-guard.mjs';

export const STATE_OPERATIONS = Object.freeze([
  'lock acquire',
  'lock release',
  'lock inspect',
  'lock break',
  'memory reserve',
  'memory set-marker',
  'memory migrate-directory',
  'harness allow-rules',
]);

// Whether `harness allow-rules` writes an allow rule for an operation. Every entry of
// STATE_OPERATIONS is classified here; a destructive operation (`lock break`) and the rule writer
// itself are never allowlisted. The allowlisted ones equal ALLOWLISTED_OPERATIONS of the shared
// settings module, which a unit test pins.
export const STATE_OPERATION_CLASSES = Object.freeze({
  'lock acquire': 'allowlisted',
  'lock release': 'allowlisted',
  'lock inspect': 'allowlisted',
  'lock break': 'not-allowlisted',
  'memory reserve': 'allowlisted',
  'memory set-marker': 'allowlisted',
  'memory migrate-directory': 'allowlisted',
  'harness allow-rules': 'not-allowlisted',
});

export const LOCK_NAMES = Object.freeze(['memory', 'iterate-commit', 'apply-review-commit']);

export const LOCKS = Object.freeze({
  memory: Object.freeze({ directory: 'memory.lock', ownerFile: 'owner.json' }),
  'iterate-commit': Object.freeze({ directory: 'iterate-commit.lock', ownerFile: 'owner' }),
  'apply-review-commit': Object.freeze({
    directory: 'apply-review-commit.lock',
    ownerFile: 'owner',
  }),
});

export const OUTCOME_CODES = Object.freeze([
  'LOCK_HELD',
  'NOT_OWNER',
  'NOT_HELD',
  'BREAK_MISMATCH',
  'MIGRATION_REQUIRED',
  'MIGRATION_NOT_NEEDED',
  'MIGRATION_INCOMPLETE',
  'LEGACY_MEMORY_INVALID',
  'UNSUPPORTED_HARNESS',
  'UNSUPPORTED_PATH',
  'SETTINGS_NOT_IGNORED',
  'SETTINGS_TRACKED',
  'SETTINGS_INVALID',
  'PREVIEW_MISMATCH',
]);

export const STATE_ERROR_CODES = Object.freeze([
  'INVALID_INPUT',
  'INVALID_ROOT',
  'UNSAFE_TARGET',
  'RUNTIME_STATE_UNSAFE',
  'WRITE_FAILED',
  'INVALID_STATE',
  'LEGACY_CHANGED',
  'GIT_FAILED',
  'INTERNAL_ERROR',
]);

const EXIT_CODES = Object.freeze({
  INVALID_INPUT: 2,
  INVALID_ROOT: 2,
  UNSAFE_TARGET: 3,
  RUNTIME_STATE_UNSAFE: 3,
  WRITE_FAILED: 3,
  INVALID_STATE: 3,
  LEGACY_CHANGED: 3,
  GIT_FAILED: 1,
  INTERNAL_ERROR: 1,
});

export const OUTCOME_EXIT_CODE = 4;

// Every caller-supplied owner string. It admits forge node IDs with `=` and `+`, both inert inside
// a single-quoted here-string, and never a quote, whitespace or shell metacharacter.
export const OWNER_STRING_PATTERN = /^[A-Za-z0-9._:/@=+-]{1,128}$/;
// `<workflow>-<at least 16 random hex characters>`, minted once per run by its workflow.
export const RUN_ID_PATTERN = /^[A-Za-z0-9._-]+-[0-9a-f]{16,}$/;
// `<runId>/<n>`: the delegation of item `n` within that run.
const DELEGATION_PATTERN = /^(.+)\/([1-9][0-9]{0,5})$/;
export const TOKEN_PATTERN = /^[0-9a-f]{32}$/;
// The generated owner fields an owner file must carry to count as `valid`; anything else in them
// would reach the model verbatim through `lock inspect`. `host` is a hostname of at most 253
// characters, `acquiredAt` exactly the `Date#toISOString` form.
export const HOST_PATTERN = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
export const ACQUIRED_AT_PATTERN = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
// Written instead of a local hostname the pattern refuses, so the helper's own owner stays valid.
export const UNKNOWN_HOST = 'unknown-host';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const IDENTITY_NUMBER_PATTERN = /^(?:0|[1-9][0-9]{0,39})$/;
// Characters that would break a single-quoted here-string or a shell expansion around `cwd`.
export const FORBIDDEN_ROOT_CHARACTERS = /['$`\\\u0000-\u001f\u007f-\u009f]/;

export const DEFAULT_WAIT_SECONDS = 30;
export const MAX_WAIT_SECONDS = 30;
export const RETRY_DELAY_MS = 200;
// The bounded wait for a lock's guard, and the pause between two attempts to take it.
export const GUARD_WAIT_MS = 10_000;
export const GUARD_RETRY_MS = 20;
export const MAX_STDIN_BYTES = 64 * 1024;
const MAX_OWNER_BYTES = 64 * 1024;
// An owner above this size is never hashed: it is `oversized`, identified by its size alone.
export const MAX_HASH_BYTES = 16 * 1024 * 1024;
export const MAX_REPORTED_ENTRIES = 64;
const READ_CHUNK_BYTES = 64 * 1024;

// The filesystem calls the core makes, injectable as `deps.fs` so tests can force a failure or a
// race at one exact call.
const DEFAULT_FS = Object.freeze({
  link,
  lstat,
  mkdir,
  open,
  readdir,
  readlink,
  realpath,
  rename,
  rmdir,
  stat,
  unlink,
});

const OPERATION_KEYS = Object.freeze({
  'lock acquire': Object.freeze(['cwd', 'lock', 'owner', 'waitSeconds']),
  'lock release': Object.freeze(['cwd', 'lock', 'token']),
  'lock inspect': Object.freeze(['cwd', 'lock']),
  'lock break': Object.freeze(['cwd', 'lock', 'token', 'identity', 'ownerDigest', 'ownerSize']),
});

// The caller-supplied owner fields per lock. The helper adds `token`, `acquiredAt`, `host` and
// `pid: null` itself; a pid would make every live lock look orphaned, because the helper process
// exits right after acquiring.
const OWNER_KEYS = Object.freeze({
  memory: Object.freeze(['workflow']),
  'iterate-commit': Object.freeze(['workflow', 'runId', 'item', 'delegation']),
  'apply-review-commit': Object.freeze(['workflow', 'runId', 'purpose', 'findingId', 'component']),
});
const GENERATED_OWNER_KEYS = Object.freeze(['token', 'acquiredAt', 'host', 'pid']);
const APPLY_REVIEW_PURPOSES = Object.freeze(['finding', 'final-validation']);
const IDENTITY_KEYS = Object.freeze(['dev', 'ino', 'mtimeNs']);

export class StateError extends RuntimeStateError {
  constructor(code, message, options) {
    super(code, message, options);
    this.name = 'StateError';
  }
}

// Throws a StateError; shared by the memory and harness cores.
export function fail(code, message) {
  throw new StateError(code, message);
}

// An expected state, returned as `outcome` instead of an error.
export class StateOutcome {
  constructor(code, details) {
    this.code = code;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------------------------
// Input validation

export function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_INPUT', `${label} must be a JSON object`);
  }
  return value;
}

export function requireClosedKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail('INVALID_INPUT', `unknown ${label} field: ${key}`);
  }
}

export function requireOwnerString(value, label) {
  if (typeof value !== 'string' || !OWNER_STRING_PATTERN.test(value)) {
    fail('INVALID_INPUT', `${label} must match ${OWNER_STRING_PATTERN.source}`);
  }
  return value;
}

function requireLock(value) {
  if (typeof value !== 'string' || !LOCK_NAMES.includes(value)) {
    fail('INVALID_INPUT', `lock must be one of ${LOCK_NAMES.join(', ')}`);
  }
  return value;
}

function requireToken(value) {
  if (typeof value !== 'string' || !TOKEN_PATTERN.test(value)) {
    fail('INVALID_INPUT', `token must match ${TOKEN_PATTERN.source}`);
  }
  return value;
}

function requireRunId(value) {
  requireOwnerString(value, 'owner.runId');
  if (!RUN_ID_PATTERN.test(value)) {
    fail('INVALID_INPUT', `owner.runId must match ${RUN_ID_PATTERN.source}`);
  }
  return value;
}

export function requireWaitSeconds(value) {
  if (value === undefined) return DEFAULT_WAIT_SECONDS;
  if (!Number.isInteger(value) || value < 0 || value > MAX_WAIT_SECONDS) {
    fail('INVALID_INPUT', `waitSeconds must be an integer from 0 to ${MAX_WAIT_SECONDS}`);
  }
  return value;
}

// Validates the caller-supplied owner fields of `lock` and returns them in a fixed key order.
export function requireOwnerInput(lock, value) {
  const owner = requireObject(value, 'owner');
  requireClosedKeys(owner, OWNER_KEYS[lock], 'owner');
  const fields = { workflow: requireOwnerString(owner.workflow, 'owner.workflow') };
  if (lock === 'iterate-commit') {
    fields.runId = requireRunId(owner.runId);
    fields.item = requireOwnerString(owner.item, 'owner.item');
    fields.delegation = requireOwnerString(owner.delegation, 'owner.delegation');
    const match = DELEGATION_PATTERN.exec(fields.delegation);
    if (!match || match[1] !== fields.runId) {
      fail('INVALID_INPUT', 'owner.delegation must be <runId>/<n> for the same runId');
    }
  }
  if (lock === 'apply-review-commit') {
    fields.runId = requireRunId(owner.runId);
    if (!APPLY_REVIEW_PURPOSES.includes(owner.purpose)) {
      fail('INVALID_INPUT', `owner.purpose must be one of ${APPLY_REVIEW_PURPOSES.join(', ')}`);
    }
    fields.purpose = owner.purpose;
    const required = owner.purpose === 'finding';
    for (const key of ['findingId', 'component']) {
      if (owner[key] === undefined && !required) continue;
      fields[key] = requireOwnerString(owner[key], `owner.${key}`);
    }
  }
  return fields;
}

function requireIdentity(value) {
  const identity = requireObject(value, 'identity');
  requireClosedKeys(identity, IDENTITY_KEYS, 'identity');
  for (const key of IDENTITY_KEYS) {
    if (typeof identity[key] !== 'string' || !IDENTITY_NUMBER_PATTERN.test(identity[key])) {
      fail('INVALID_INPUT', `identity.${key} must be a decimal string`);
    }
  }
  return { dev: identity.dev, ino: identity.ino, mtimeNs: identity.mtimeNs };
}

// The helper's own `cwd` check, run before any git call: the raw value must already be its
// canonical path, so a symlinked alias is refused, and it may hold nothing that could break the
// single-quoted here-string the prose builds around it.
export async function requireRootSyntax(value) {
  if (typeof value !== 'string' || value === '') fail('INVALID_INPUT', 'cwd must be a string');
  if (FORBIDDEN_ROOT_CHARACTERS.test(value)) {
    fail(
      'INVALID_ROOT',
      'cwd must not contain a quote, $, backtick, backslash or control character',
    );
  }
  if (typeof value.isWellFormed === 'function' && !value.isWellFormed()) {
    fail('INVALID_ROOT', 'cwd must be a well-formed path');
  }
  if (!path.isAbsolute(value)) fail('INVALID_ROOT', 'cwd must be an absolute path');
  let canonical;
  try {
    canonical = await realpath(value);
  } catch {
    fail('INVALID_ROOT', 'cwd must be an existing directory');
  }
  if (canonical !== value) fail('INVALID_ROOT', 'cwd must be its own canonical path, not an alias');
  return value;
}

// Verifies the runtime-state root. A refusal of the shared root check (not a directory, not a
// toplevel, a linked worktree) is INVALID_ROOT here, since `cwd` names no valid root; a git fault
// keeps GIT_FAILED.
export async function resolveRoot(context, value) {
  try {
    return await resolveRuntimeRoot(context, value);
  } catch (error) {
    if (
      error instanceof RuntimeStateError &&
      (error.code === 'UNSAFE_TARGET' || error.code === 'INVALID_INPUT')
    ) {
      fail('INVALID_ROOT', error.message);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Lock inspection

export function lockPaths(cwd, lock) {
  const stateDir = path.join(cwd, RUNTIME_STATE_DIR);
  const directory = path.join(stateDir, LOCKS[lock].directory);
  return {
    stateDir,
    directory,
    guard: `${directory}.guard`,
    ownerFile: LOCKS[lock].ownerFile,
    ownerPath: path.join(directory, LOCKS[lock].ownerFile),
  };
}

export function identityOf(info) {
  return { dev: String(info.dev), ino: String(info.ino), mtimeNs: String(info.mtimeNs) };
}

// Both compare only two present identities: an absent one (a node that could not be read) never
// equals anything, itself included.
//
// The mtime component is only as fine as the filesystem's timestamp granularity: on a coarse
// filesystem a directory removed and re-created within one tick, on a reused inode, keeps all three
// values. The owner token or digest then tells the two apart, and the tombstone verification
// re-checks both on the renamed node itself, so a match there is the observed lock.
function sameIdentity(left, right) {
  if (!left || !right) return false;
  return IDENTITY_KEYS.every((key) => left[key] === right[key]);
}

function sameNode(left, right) {
  if (!left || !right) return false;
  return left.dev === right.dev && left.ino === right.ino;
}

// Whether `value` is exactly the `Date#toISOString` form of the instant it names, so an impossible
// calendar date such as February 31 is refused rather than rolled over.
function roundTripsAsIso(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

// Whether `parsed` is an owner record this helper wrote for `lock`: exactly the generated plus the
// lock's caller fields, each in its documented form.
function isHelperOwner(lock, parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const allowed = [...GENERATED_OWNER_KEYS, ...OWNER_KEYS[lock]];
  if (Object.keys(parsed).some((key) => !allowed.includes(key))) return false;
  if (typeof parsed.token !== 'string' || !TOKEN_PATTERN.test(parsed.token)) return false;
  if (
    typeof parsed.acquiredAt !== 'string' ||
    !ACQUIRED_AT_PATTERN.test(parsed.acquiredAt) ||
    !roundTripsAsIso(parsed.acquiredAt)
  ) {
    return false;
  }
  if (typeof parsed.host !== 'string' || !HOST_PATTERN.test(parsed.host)) return false;
  if (parsed.pid !== null) return false;
  const { token, acquiredAt, host, pid, ...caller } = parsed;
  try {
    const normalized = requireOwnerInput(lock, caller);
    return Object.keys(normalized).length === Object.keys(caller).length;
  } catch {
    return false;
  }
}

// Reads the owner file without following a symlink. A helper-format owner is returned parsed; any
// other content only as its byte count and SHA-256 digest, never verbatim. The size is checked
// before any read: content above MAX_OWNER_BYTES is never buffered or parsed, only streamed through
// the hash in fixed chunks, so even an oversized owner keeps the digest an identity break needs.
// Above MAX_HASH_BYTES nothing is read: the owner is `oversized` with its size only.
async function readOwner(fs, lock, ownerPath) {
  let handle;
  try {
    handle = await fs.open(
      ownerPath,
      fsConstants.O_RDONLY | O_NOFOLLOW | (fsConstants.O_NONBLOCK ?? 0),
    );
  } catch (error) {
    if (error?.code === 'ENOENT') return { state: 'missing' };
    fail('UNSAFE_TARGET', `cannot open ${ownerPath}: ${error?.code ?? error?.message}`);
  }
  const hash = createHash('sha256');
  let total = 0;
  let content = null;
  try {
    const info = await handle.stat();
    if (!info.isFile()) fail('UNSAFE_TARGET', `${ownerPath} is not a regular file`);
    if (info.size > MAX_HASH_BYTES) return { state: 'oversized', bytes: info.size };
    const keep = info.size <= MAX_OWNER_BYTES;
    const chunks = [];
    const buffer = Buffer.alloc(READ_CHUNK_BYTES);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      // A file that grew past the cap while it was read is oversized as well.
      if (total > MAX_HASH_BYTES) return { state: 'oversized', bytes: total };
      hash.update(buffer.subarray(0, bytesRead));
      if (keep && total <= MAX_OWNER_BYTES) chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    if (keep && total <= MAX_OWNER_BYTES) content = Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof RuntimeStateError) throw error;
    fail('UNSAFE_TARGET', `cannot read ${ownerPath}: ${error?.code ?? error?.message}`);
  } finally {
    await handle.close().catch(() => {});
  }
  const digest = { bytes: total, sha256: hash.digest('hex') };
  if (content) {
    try {
      const parsed = JSON.parse(content.toString('utf8'));
      if (isHelperOwner(lock, parsed)) return { state: 'valid', owner: parsed, ...digest };
    } catch {
      // Not JSON: reported as invalid below.
    }
  }
  return { state: 'invalid', ...digest };
}

// The observable state of one lock: whether its directory exists, the directory identity
// (device, inode, nanosecond mtime), its entries and its owner. Reads only.
export async function observeLock(context, lock) {
  const paths = lockPaths(context.cwd, lock);
  const base = { lock, path: paths.directory, ownerFile: paths.ownerFile };
  if (!(await assertDirectoryChain(context.cwd, paths.stateDir, { allowMissing: true }))) {
    return { ...base, present: false };
  }
  return { ...base, ...(await observeDirectory(context, lock, paths.directory)) };
}

// Observes one lock-shaped directory: the lock itself, or its tombstone after the rename.
async function observeDirectory(context, lock, directory) {
  const { fs } = context;
  let info;
  try {
    info = await fs.lstat(directory, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return { present: false };
    fail('UNSAFE_TARGET', `cannot inspect ${directory}: ${error?.code ?? error?.message}`);
  }
  if (info.isSymbolicLink()) fail('UNSAFE_TARGET', `${directory} is a symlink`);
  if (!info.isDirectory()) fail('UNSAFE_TARGET', `${directory} is not a directory`);
  let entries;
  try {
    entries = (await fs.readdir(directory)).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return { present: false };
    fail('UNSAFE_TARGET', `cannot list ${directory}: ${error?.code ?? error?.message}`);
  }
  const owner = await readOwner(fs, lock, path.join(directory, LOCKS[lock].ownerFile));
  return {
    present: true,
    identity: identityOf(info),
    entries: entries.slice(0, MAX_REPORTED_ENTRIES),
    entryCount: entries.length,
    owner: publicOwner(owner),
  };
}

function publicOwner(owner) {
  if (owner.state === 'missing') return { state: 'missing' };
  if (owner.state === 'oversized') return { state: 'oversized', bytes: owner.bytes };
  if (owner.state === 'invalid')
    return { state: 'invalid', bytes: owner.bytes, sha256: owner.sha256 };
  return { state: 'valid', fields: owner.owner, bytes: owner.bytes, sha256: owner.sha256 };
}

// Whether the lock directory holds nothing but its one known owner file (or nothing at all).
export function onlyOwnerEntry(observation) {
  return (
    observation.entryCount <= 1 &&
    observation.entries.every((entry) => entry === observation.ownerFile)
  );
}

// ---------------------------------------------------------------------------------------------
// Operations

export function makeContext(deps) {
  return {
    runner: deps.runner,
    env: gitBaseEnv(deps.env ?? process.env),
    fs: { ...DEFAULT_FS, ...deps.fs },
    cwd: null,
  };
}

async function prepare(operation, input, deps) {
  requireObject(input, 'input');
  requireClosedKeys(input, OPERATION_KEYS[operation], 'input');
  const lock = requireLock(input.lock);
  return { lock, context: makeContext(deps) };
}

// Runs `fn` while holding the guard of `lock` (see the header). The guard path passes the git guard
// once per operation, before it is first taken, so no git spawn runs while another helper waits.
// `fn`'s own result or error is returned; a guard that cannot be removed afterwards is left in
// place and reported by the next call that waits for it.
async function withLockGuard(context, lock, deps, fn) {
  const { fs } = context;
  const { guard } = lockPaths(context.cwd, lock);
  if (!context.guardChecked) {
    await guardTarget(context, guard);
    context.guardChecked = true;
  }
  const now = deps.monotonicNow ?? (() => performance.now());
  const sleep = deps.sleep ?? ((ms) => delay(ms));
  const deadline = now() + GUARD_WAIT_MS;
  for (;;) {
    try {
      await fs.mkdir(guard, { mode: 0o700 });
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        fail('WRITE_FAILED', `cannot create ${guard}: ${error?.code ?? error?.message}`);
      }
    }
    const remaining = deadline - now();
    if (remaining <= 0) {
      fail(
        'RUNTIME_STATE_UNSAFE',
        `${guard} is still held after ${GUARD_WAIT_MS / 1000} seconds: another effective-flow-state call is changing the ${lock} lock, or an interrupted one left the guard; nothing was changed. Remove it by hand only after confirming that no effective-flow-state call is running`,
      );
    }
    await sleep(Math.min(GUARD_RETRY_MS, remaining));
  }
  try {
    return await fn();
  } finally {
    await fs.rmdir(guard).catch(() => {});
  }
}

const WRITE_FLAGS = fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | O_NOFOLLOW;

// Writes the owner record exclusively (never over an existing file, never through a symlink).
// Returns whether a file was created, so a failed write can remove exactly that file, and the
// written file's device and inode from `fstat` (null when unreadable), so a later cleanup removes
// that file only.
async function writeOwnerExclusive(fs, ownerPath, content) {
  let handle;
  try {
    handle = await fs.open(ownerPath, WRITE_FLAGS, 0o600);
  } catch (error) {
    return { created: false, error };
  }
  try {
    await handle.writeFile(content);
    await handle.sync();
    let file = null;
    try {
      file = identityOf(await handle.stat({ bigint: true }));
    } catch {
      // Unknown identity: the file is then never removed by identity.
    }
    await handle.close();
    return { created: true, file };
  } catch (error) {
    await handle.close().catch(() => {});
    return { created: true, error };
  }
}

async function nodeIdentity(fs, target) {
  try {
    return identityOf(await fs.lstat(target, { bigint: true }));
  } catch {
    return null;
  }
}

function localHost(deps) {
  const host = (deps.hostname ?? osHostname)();
  return typeof host === 'string' && HOST_PATTERN.test(host) ? host : UNKNOWN_HOST;
}

// One acquisition attempt. Returns the owner record on success, or null when the lock exists.
// Everything from the `mkdir` on runs under the lock's guard, so no break and re-acquire can land
// between an identity check below and the cleanup that relies on it.
async function tryAcquire(context, lock, fields, deps) {
  await guardTarget(context, lockPaths(context.cwd, lock).directory);
  return withLockGuard(context, lock, deps, () => createLock(context, lock, fields, deps));
}

async function createLock(context, lock, fields, deps) {
  const { fs } = context;
  const paths = lockPaths(context.cwd, lock);
  try {
    await fs.mkdir(paths.directory, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') return null;
    fail('WRITE_FAILED', `cannot create ${paths.directory}: ${error?.code ?? error?.message}`);
  }
  const created = await nodeIdentity(fs, paths.directory);
  if (!created) {
    // Without the identity nothing proves the directory at the lock path is still this attempt's,
    // so it is neither written into nor removed.
    fail(
      'WRITE_FAILED',
      `cannot read the identity of ${paths.directory} after creating it; the directory is left in place`,
    );
  }
  const owner = {
    token: (deps.randomToken ?? (() => randomBytes(16).toString('hex')))(),
    acquiredAt: new Date((deps.now ?? Date.now)()).toISOString(),
    host: localHost(deps),
    pid: null,
    ...fields,
  };
  // Only this acquisition's own file and directory are removed, and only while the directory is
  // still the one this attempt created.
  const removeOwn = async (ownerCreated) => {
    if (!sameNode(await nodeIdentity(fs, paths.directory), created)) return;
    if (ownerCreated) await fs.unlink(paths.ownerPath).catch(() => {});
    await fs.rmdir(paths.directory).catch(() => {});
  };
  let failure;
  let written;
  try {
    await guardTarget(context, paths.ownerPath);
    written = await writeOwnerExclusive(fs, paths.ownerPath, `${JSON.stringify(owner)}\n`);
    if (written.error) {
      failure = new StateError(
        'WRITE_FAILED',
        `cannot write ${paths.ownerPath}: ${written.error?.code ?? written.error?.message}`,
      );
      await removeOwn(written.created);
    }
  } catch (error) {
    failure = error;
    await removeOwn(false);
  }
  if (failure) throw failure;
  if (!sameNode(await nodeIdentity(fs, paths.directory), created)) {
    // The owner file at the lock path is removed only when it is the very file just written.
    if (sameNode(await nodeIdentity(fs, paths.ownerPath), written.file)) {
      await fs.unlink(paths.ownerPath).catch(() => {});
    }
    fail('WRITE_FAILED', `${paths.directory} was replaced during acquisition`);
  }
  return owner;
}

// Whether anything sits at the lock path. A cheap probe before each retry: the guard and `mkdir`
// run only when the path is free, or when the probe itself cannot tell.
async function lockPathOccupied(fs, directory) {
  try {
    await fs.lstat(directory);
    return true;
  } catch {
    return false;
  }
}

async function acquireLock(input, deps) {
  const { lock, context } = await prepare('lock acquire', input, deps);
  const fields = requireOwnerInput(lock, input.owner);
  const waitSeconds = requireWaitSeconds(input.waitSeconds);
  await requireRootSyntax(input.cwd);
  await resolveRoot(context, input.cwd);
  return acquireOwned(context, lock, fields, waitSeconds, deps);
}

// Acquires `lock` for the verified root on `context` within `waitSeconds`: the acquired result
// with its owner record, or a LOCK_HELD outcome with the observed lock. Creates a missing
// `.effective-flow/` through the guard. A memory transaction reuses it to take the memory lock.
export async function acquireOwned(context, lock, fields, waitSeconds, deps) {
  const paths = lockPaths(context.cwd, lock);
  await ensureGuardedDirectory(context, paths.stateDir);

  // The deadline is checked after each attempt and the last sleep is cut to it, so the wait never
  // exceeds `waitSeconds` by more than the duration of one final attempt.
  const now = deps.monotonicNow ?? (() => performance.now());
  const sleep = deps.sleep ?? ((ms) => delay(ms));
  const deadline = now() + waitSeconds * 1000;
  let attempts = 0;
  for (;;) {
    attempts += 1;
    if (attempts === 1 || !(await lockPathOccupied(context.fs, paths.directory))) {
      const owner = await tryAcquire(context, lock, fields, deps);
      if (owner)
        return { lock, path: paths.directory, ownerFile: paths.ownerFile, owner, attempts };
    }
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(RETRY_DELAY_MS, remaining));
  }
  return new StateOutcome('LOCK_HELD', {
    waitSeconds,
    attempts,
    ...(await observeLock(context, lock)),
  });
}

async function guardLockTargets(context, paths) {
  await guardTarget(context, paths.ownerPath);
  await guardTarget(context, paths.directory);
}

const TOMBSTONE_SUFFIX = /^(?:release|break)-[0-9a-f]+$/;

// A unique sibling of the lock directory below `.effective-flow/`, guarded once before the rename.
async function tombstonePath(context, lock, paths, kind, deps) {
  const suffix = (deps.randomToken ?? (() => randomBytes(16).toString('hex')))();
  const tombstone = path.join(paths.stateDir, `${LOCKS[lock].directory}.${kind}-${suffix}`);
  await guardTarget(context, tombstone);
  if (await lockPathOccupied(context.fs, tombstone)) {
    fail('WRITE_FAILED', `tombstone ${tombstone} already exists`);
  }
  return tombstone;
}

// Whether the renamed node is exactly the observed lock: same directory identity, only the known
// owner entry, and the same owner state, size and digest (which covers the token). An `oversized`
// owner has no digest, so its size is all that is compared.
function matchesObservation(observed, renamed) {
  return (
    Boolean(renamed?.present) &&
    sameIdentity(renamed.identity, observed.identity) &&
    onlyOwnerEntry({ ...renamed, ownerFile: observed.ownerFile }) &&
    renamed.owner.state === observed.owner.state &&
    renamed.owner.bytes === observed.owner.bytes &&
    renamed.owner.sha256 === observed.owner.sha256
  );
}

// Renames the observed lock to its tombstone, verifies it, and deletes it with raw calls. Returns
// `{status}`: `removed`, `gone` (the lock vanished before the rename) or `restored` (a mismatch was
// renamed back to the lock name). A tombstone that cannot be observed counts as a mismatch. A
// mismatch that cannot be renamed back is WRITE_FAILED naming the tombstone, which then holds the
// unverified directory untouched. A verified tombstone whose delete fails has already freed the lock
// name: that is `removed` with `leftoverTombstone` naming it.
async function removeThroughTombstone(context, lock, paths, observed, tombstone) {
  const { fs } = context;
  try {
    await fs.rename(paths.directory, tombstone);
  } catch (error) {
    if (error?.code === 'ENOENT') return { status: 'gone' };
    fail('WRITE_FAILED', `cannot rename ${paths.directory}: ${error?.code ?? error?.message}`);
  }
  let renamed = null;
  try {
    renamed = await observeDirectory(context, lock, tombstone);
  } catch {
    // An unobservable tombstone (UNSAFE_TARGET, EACCES, EMFILE, …) is unverified: a mismatch.
  }
  if (!matchesObservation(observed, renamed)) {
    // Under the guard no helper can have taken the lock name; only an actor outside the helper can
    // have changed it. rename(2) would replace an empty directory at the lock name; a racing
    // non-helper `mkdir` replaced this way is the only one that could be lost.
    if (!(await lockPathOccupied(fs, paths.directory))) {
      try {
        await fs.rename(tombstone, paths.directory);
        return { status: 'restored' };
      } catch {
        // Reported below.
      }
    }
    fail(
      'WRITE_FAILED',
      `${paths.directory} changed after the observation and could not be restored; the unverified directory is left at ${tombstone}`,
    );
  }
  try {
    if (renamed.owner.state !== 'missing') {
      await fs.unlink(path.join(tombstone, paths.ownerFile));
    }
    await fs.rmdir(tombstone);
  } catch {
    return { status: 'removed', leftoverTombstone: tombstone };
  }
  return { status: 'removed' };
}

function removedResult(base, removal) {
  return removal.leftoverTombstone
    ? { ...base, leftoverTombstone: removal.leftoverTombstone }
    : base;
}

async function releaseLock(input, deps) {
  const { lock, context } = await prepare('lock release', input, deps);
  const token = requireToken(input.token);
  await requireRootSyntax(input.cwd);
  await resolveRoot(context, input.cwd);
  return releaseOwned(context, lock, token, deps);
}

// Releases `lock` when its owner carries `token`: the released result, or a NOT_HELD or NOT_OWNER
// outcome that changed nothing. A memory transaction reuses it in its `finally`.
export async function releaseOwned(context, lock, token, deps) {
  const paths = lockPaths(context.cwd, lock);
  const first = await observeLock(context, lock);
  if (!first.present) return new StateOutcome('NOT_HELD', first);
  // The guards need the lock directory to exist; the decision uses the observation taken after them.
  await guardLockTargets(context, paths);
  const tombstone = await tombstonePath(context, lock, paths, 'release', deps);
  // The final observation, the decision and the removal share one guard hold.
  const decision = await withLockGuard(context, lock, deps, async () => {
    const observed = await observeLock(context, lock);
    if (!observed.present) return new StateOutcome('NOT_HELD', observed);
    if (observed.owner.state !== 'valid' || observed.owner.fields.token !== token) {
      return new StateOutcome('NOT_OWNER', { reason: 'token-mismatch', ...observed });
    }
    if (!onlyOwnerEntry(observed)) {
      return new StateOutcome('NOT_OWNER', { reason: 'unexpected-entries', ...observed });
    }
    return removeThroughTombstone(context, lock, paths, observed, tombstone);
  });
  if (decision instanceof StateOutcome) return decision;
  const removal = decision;
  if (removal.status === 'gone') {
    return new StateOutcome('NOT_HELD', await observeLock(context, lock));
  }
  if (removal.status === 'restored') {
    return new StateOutcome('NOT_OWNER', {
      reason: 'changed-before-removal',
      ...(await observeLock(context, lock)),
    });
  }
  return removedResult({ lock, path: paths.directory, released: true }, removal);
}

// The tombstones of `lock` below `.effective-flow/`, as sorted paths relative to `cwd`.
async function listTombstones(context, lock) {
  const paths = lockPaths(context.cwd, lock);
  if (!(await assertDirectoryChain(context.cwd, paths.stateDir, { allowMissing: true }))) {
    return { tombstones: [], tombstoneCount: 0 };
  }
  let names;
  try {
    names = await context.fs.readdir(paths.stateDir);
  } catch (error) {
    fail('UNSAFE_TARGET', `cannot list ${paths.stateDir}: ${error?.code ?? error?.message}`);
  }
  const prefix = `${LOCKS[lock].directory}.`;
  const found = names
    .filter((name) => name.startsWith(prefix) && TOMBSTONE_SUFFIX.test(name.slice(prefix.length)))
    .sort()
    .map((name) => path.posix.join(RUNTIME_STATE_DIR, name));
  return { tombstones: found.slice(0, MAX_REPORTED_ENTRIES), tombstoneCount: found.length };
}

async function inspectLock(input, deps) {
  const { lock, context } = await prepare('lock inspect', input, deps);
  await requireRootSyntax(input.cwd);
  await resolveRoot(context, input.cwd);
  return { ...(await observeLock(context, lock)), ...(await listTombstones(context, lock)) };
}

// Compare-and-remove of an apparent orphan. Every observation is re-read after the guards ran and
// compared before anything is deleted; any change, or any entry besides the known owner file,
// refuses with BREAK_MISMATCH. The tombstone verification repeats the comparison on the renamed
// node itself, so a change between the last observation and the rename also refuses.
async function breakLock(input, deps) {
  const { lock, context } = await prepare('lock break', input, deps);
  const byToken = input.token !== undefined;
  const byIdentity = input.identity !== undefined;
  if (byToken === byIdentity) {
    fail('INVALID_INPUT', 'lock break needs exactly one of token or identity');
  }
  if (byToken && (input.ownerDigest !== undefined || input.ownerSize !== undefined)) {
    fail('INVALID_INPUT', 'ownerDigest and ownerSize are only valid together with identity');
  }
  if (input.ownerDigest !== undefined && input.ownerSize !== undefined) {
    fail('INVALID_INPUT', 'lock break takes at most one of ownerDigest or ownerSize');
  }
  const token = byToken ? requireToken(input.token) : undefined;
  const identity = byIdentity ? requireIdentity(input.identity) : undefined;
  const ownerDigest = input.ownerDigest;
  if (
    ownerDigest !== undefined &&
    (typeof ownerDigest !== 'string' || !SHA256_PATTERN.test(ownerDigest))
  ) {
    fail('INVALID_INPUT', `ownerDigest must match ${SHA256_PATTERN.source}`);
  }
  const ownerSize = input.ownerSize;
  if (
    ownerSize !== undefined &&
    (!Number.isSafeInteger(ownerSize) || ownerSize <= MAX_HASH_BYTES)
  ) {
    fail('INVALID_INPUT', `ownerSize must be an integer above ${MAX_HASH_BYTES}`);
  }
  await requireRootSyntax(input.cwd);
  await resolveRoot(context, input.cwd);
  const paths = lockPaths(context.cwd, lock);
  let tombstone = null;
  if ((await observeLock(context, lock)).present) {
    await guardLockTargets(context, paths);
    tombstone = await tombstonePath(context, lock, paths, 'break', deps);
  }
  const mismatch = (reason, state) => new StateOutcome('BREAK_MISMATCH', { reason, ...state });
  if (!tombstone) {
    // Nothing was guarded for a lock absent at the first look, so nothing is removed.
    const observed = await observeLock(context, lock);
    return mismatch(observed.present ? 'changed-before-removal' : 'missing', observed);
  }
  // The final observation, the comparison and the removal share one guard hold.
  const decision = await withLockGuard(context, lock, deps, () =>
    decideBreak(context, lock, paths, tombstone, { token, identity, ownerDigest, ownerSize }),
  );
  if (decision instanceof StateOutcome) return decision;
  const removal = decision;
  if (removal.status === 'gone') return mismatch('missing', await observeLock(context, lock));
  if (removal.status === 'restored') {
    return mismatch('changed-before-removal', await observeLock(context, lock));
  }
  return removedResult({ lock, path: paths.directory, broken: true }, removal);
}

// Compares the final observation against the break's expectation and, on a match, removes it.
// Returns a BREAK_MISMATCH outcome or the removal status. Runs under the lock's guard.
async function decideBreak(context, lock, paths, tombstone, expected) {
  const { token, identity, ownerDigest, ownerSize } = expected;
  const byToken = token !== undefined;
  const observed = await observeLock(context, lock);
  const mismatch = (reason) => new StateOutcome('BREAK_MISMATCH', { reason, ...observed });
  if (!observed.present) return mismatch('missing');
  if (!onlyOwnerEntry(observed)) return mismatch('unexpected-entries');
  if (byToken) {
    if (observed.owner.state !== 'valid' || observed.owner.fields.token !== token) {
      return mismatch('token-mismatch');
    }
  } else {
    if (!sameIdentity(observed.identity, identity)) return mismatch('identity-mismatch');
    if (observed.owner.state === 'valid') return mismatch('token-required');
    if (ownerSize !== undefined) {
      if (observed.owner.state !== 'oversized' || observed.owner.bytes !== ownerSize) {
        return mismatch('owner-mismatch');
      }
    } else if (ownerDigest === undefined) {
      if (observed.owner.state !== 'missing') return mismatch('owner-mismatch');
    } else if (observed.owner.state !== 'invalid' || observed.owner.sha256 !== ownerDigest) {
      return mismatch('owner-mismatch');
    }
  }
  return removeThroughTombstone(context, lock, paths, observed, tombstone);
}

// The memory and harness operations live in their own modules, which import this one. They are
// loaded on first use through literal specifiers, so the import graph stays acyclic, a lock call
// never loads them, and the build's dependency scan still sees both.
const loadMemory = () => import('./effective-flow-state-memory-core.mjs');
const loadHarness = () => import('./effective-flow-state-harness-core.mjs');

const HANDLERS = Object.freeze({
  'lock acquire': acquireLock,
  'lock release': releaseLock,
  'lock inspect': inspectLock,
  'lock break': breakLock,
  'memory reserve': async (input, deps) => (await loadMemory()).reserveMemory(input, deps),
  'memory set-marker': async (input, deps) => (await loadMemory()).setMemoryMarker(input, deps),
  'memory migrate-directory': async (input, deps) =>
    (await loadMemory()).migrateDirectory(input, deps),
  'harness allow-rules': async (input, deps) => (await loadHarness()).allowRules(input, deps),
});

// Runs one operation and returns its envelope; never throws. `deps.runner` is the injected process
// runner; `deps.env` the environment git inherits (stripped by `gitBaseEnv`). Tests may also inject
// `sleep`, `monotonicNow`, `now`, `hostname`, `randomToken` and `fs` (a partial override of the
// filesystem calls in DEFAULT_FS).
export async function executeOperation(operation, input, deps = {}) {
  try {
    if (!STATE_OPERATIONS.includes(operation)) {
      fail('INVALID_INPUT', `unknown operation: ${operation}`);
    }
    if (typeof deps.runner !== 'function') fail('INTERNAL_ERROR', 'no process runner was injected');
    const value = await HANDLERS[operation](input, deps);
    if (value instanceof StateOutcome) {
      return { ok: false, operation, outcome: { code: value.code, ...value.details } };
    }
    return { ok: true, operation, result: value };
  } catch (error) {
    return errorEnvelope(STATE_OPERATIONS.includes(operation) ? operation : null, error);
  }
}

// A RuntimeStateError keeps its code when it is one of this helper's codes; anything else is
// INTERNAL_ERROR.
export function errorEnvelope(operation, error) {
  const known = error instanceof RuntimeStateError && STATE_ERROR_CODES.includes(error.code);
  return {
    ok: false,
    operation: operation ?? null,
    error: {
      code: known ? error.code : 'INTERNAL_ERROR',
      message: error?.message ?? 'unexpected effective-flow-state failure',
    },
  };
}

export function exitCodeFor(envelope) {
  if (envelope.ok) return 0;
  if (envelope.outcome) return OUTCOME_EXIT_CODE;
  return EXIT_CODES[envelope.error?.code] ?? 1;
}
