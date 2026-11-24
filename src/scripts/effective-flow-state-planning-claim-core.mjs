// Runtime-state helper: the `planning-claim` operations on the shared per-issue planning claims of
// Issue Buddy, issue-sourced autopilot and `plan-issue`, one small JSON record per claimed issue at
// `<RUNTIME_STATE_ROOT>/.effective-flow/planning-claims/<TARGET_KEY>/<ISSUE_KEY>.json`:
//
//   planning-claim key      {target, issue}
//   planning-claim acquire  {cwd, target, issue, workflow, runId | passId}
//   planning-claim release  {cwd, target, issue, claimId}
//   planning-claim list     {cwd, target?}
//   planning-claim prune    {cwd, claims: [{targetKey, issueKey, acquiredAt, proof | confirmStale}]}
//
// `target` is `{kind: "forge", host, owner, repository}` (the `remote-tracker.mjs
// repository-resolve` identity) or `{kind: "external", id}` (the resolved tracker-target id).
// `issue` is the forge issue number or the external issue key. `planningClaimKey` is the one
// derivation of `<TARGET_KEY>`/`<ISSUE_KEY>` from them: deterministic, filesystem-safe (lower-case
// ASCII only, so a case-insensitive filesystem cannot merge two keys) and collision-resistant
// (a readable slug plus 16 hex characters of the SHA-256 of the canonical identity). Forge host,
// owner and repository are folded to lower case and a trailing `.git` is dropped, because every
// served forge compares them case-insensitively; an external issue key is folded to lower case; an
// external target id is kept verbatim. Every operation that touches a record derives its path
// through it, so no caller ever builds a key by hand.
//
// A record is exactly CLAIM_KEYS plus the one holder key of its workflow (`runId` for `autopilot`
// and `plan-issue`, `passId` for `issue-buddy`) and the optional OPTIONAL_CLAIM_KEYS: `schemaVersion` 1, `claimId` (32 hex characters
// generated at `acquire` and returned only to that caller), `workflow`, `target` (the canonical
// identity), `issue`, `targetKey` and `issueKey` (equal to its location), `acquiredAt` in the
// `Date#toISOString` form, `pid`, `pidStartTime` and `hostname`. `pid` is the session process that
// invoked the helper, not the short-lived helper itself: the parent of the helper's parent (the
// shell a harness spawned for the call), or null when it cannot be resolved; `deps.ownerPid`
// overrides it (with `deps.ownerPidStartTime`). `pidStartTime` is that process's start time
// (`processStartTime`), null when it cannot be read; a record written before the field existed
// lacks it and reads as null. Any other content is `invalid` with a reason; the helper reports it
// and never rewrites it.
//
// Ownership: `acquire` creates the record create-only and never waits; an existing record is the
// `CLAIMED` outcome with its holder, age, stale flag (older than STALE_AFTER_MS) and liveness. While
// a legacy `.effective-flow/issue-buddy/pass.lock` exists, `acquire` refuses with
// `LEGACY_PASS_LOCK` and never removes it. `release` removes only the record whose `claimId`
// matches (NOT_OWNER otherwise). `list` only reads and never returns a `claimId`. The only removal
// without the token is `prune`, the confirmed cleanup path: per claim it needs an orphan proof
// (PRUNE_PROOFS), re-verified by the helper itself, or `confirmStale: true` for a claim older than
// STALE_AFTER_MS, and the `acquiredAt` the caller observed. Nothing is ever broken by age alone.
//
// Liveness is `alive`, `dead` or `unknown`: a signal-0 probe of `pid`, only when the record's
// `hostname` is this host; a null `pid`, another or an unknown host is `unknown`. `dead` means the
// recorded process is provably gone: its pid is absent, or present with a start time other than
// the recorded `pidStartTime` (the pid was reused). A present pid is `alive` only while its start
// time matches or none was recorded, and `unknown` when the current one cannot be read.
//
// Every change of one issue's record (`acquire`, `release` and each `prune` item) runs under that
// issue's guard, a bare `mkdir` sibling `.<ISSUE_KEY>.guard` of the record (the pattern of the
// `lock` guard in `effective-flow-state-core.mjs`). Without it, two removals that both verified the
// same record could unlink in turn: the second one then removes the claim a new run acquired in
// between. The guard is held for a few filesystem calls only; a caller that cannot take it within
// GUARD_WAIT_MS fails with RUNTIME_STATE_UNSAFE naming it and changes nothing. A guard is never
// broken by age.
//
// Every write passes the shared runtime-state guard: `acquire` through `createNoClobber`,
// `release` and `prune` through the guard, a re-proven symlink-free directory chain and an
// unchanged record (file identity and content) immediately before the unlink.

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hostname as osHostname } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import {
  RUNTIME_STATE_DIR,
  assertDirectoryChain,
  createNoClobber,
  ensureGuardedDirectory,
  guardTarget,
  guardTargets,
} from './runtime-state-guard.mjs';
import {
  ACQUIRED_AT_PATTERN,
  GUARD_RETRY_MS,
  GUARD_WAIT_MS,
  HOST_PATTERN,
  MAX_REPORTED_ENTRIES,
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
import { isObject, readBoundedFile, sameFileRead } from './runtime-file-primitives.mjs';

export const PLANNING_CLAIM_DIRECTORY = 'planning-claims';
export const PLANNING_CLAIM_SCHEMA_VERSION = 1;
export const PLANNING_CLAIM_WORKFLOWS = Object.freeze(['issue-buddy', 'autopilot', 'plan-issue']);
// The holder key each workflow's record carries.
export const HOLDER_KEYS = Object.freeze({
  'issue-buddy': 'passId',
  autopilot: 'runId',
  'plan-issue': 'runId',
});
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;
// `run-init` takes the claim before it creates the ledger, so a missing ledger proves a closed run
// only once the claim is older than this grace period.
export const LEDGER_GRACE_MS = 60 * 1000;
// The read and write bound of one record; the largest valid record serializes well below it.
export const MAX_CLAIM_BYTES = 4096;
export const MAX_PRUNE_CLAIMS = MAX_REPORTED_ENTRIES;
export const CLAIM_KEYS = Object.freeze([
  'schemaVersion',
  'claimId',
  'workflow',
  'target',
  'issue',
  'targetKey',
  'issueKey',
  'acquiredAt',
  'pid',
  'hostname',
]);
// The owner start time every new record carries; optional on read, so an older record stays valid.
export const OPTIONAL_CLAIM_KEYS = Object.freeze(['pidStartTime']);
// The orphan proofs `prune` accepts, each verified by the helper against the runtime state:
// `pass-record-absent` (an `issue-buddy` holder whose `.effective-flow/issue-buddy/passes/<passId>
// .json` is gone), `run-ledger-closed` (an `autopilot` holder whose `.effective-flow/autopilot/
// <runId>/run.json` is closed, or gone while the claim is older than LEDGER_GRACE_MS: refused
// `ledger-absent-in-grace` before) and `process-dead` (the recorded process is provably gone on
// this host: liveness `dead`, identity-checked by pid and `pidStartTime`).
export const PRUNE_PROOFS = Object.freeze([
  'pass-record-absent',
  'run-ledger-closed',
  'process-dead',
]);
export const PRUNE_RESULTS = Object.freeze([
  'removed',
  'missing',
  'not-regular',
  'invalid',
  'changed',
  'not-stale',
  'proof-refused',
]);
export const LIVENESS_STATES = Object.freeze(['alive', 'dead', 'unknown']);
// The legacy whole-pass lock of Issue Buddy, relative to the runtime-state directory.
export const LEGACY_PASS_LOCK = 'issue-buddy/pass.lock';

// Holder ids: the Issue Buddy pass id shape and the autopilot run id
// (`autopilot-core.mjs` RUN_ID; that module builds on this one, so it is not imported back).
const PASS_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
export const AUTOPILOT_RUN_ID_PATTERN = /^ap-\d{8}T\d{6}Z-[0-9a-f]{8}$/;
const RUN_ID_PATTERN = PASS_ID_PATTERN;
const KIND_PREFIX = Object.freeze({ forge: 'forge', external: 'external' });
const SLUG_MAX = 48;
const DIGEST_HEX = 16;
export const TARGET_KEY_PATTERN = /^(?:forge|external)-[a-z0-9][a-z0-9._-]{0,47}-[0-9a-f]{16}$/;
export const ISSUE_KEY_PATTERN =
  /^issue-(?:[1-9][0-9]{0,15}|[a-z0-9][a-z0-9._-]{0,47}-[0-9a-f]{16})$/;
const MAX_IDENTITY_TEXT = 256;
const CLAIM_FILE_PATTERN = /^(issue-[a-z0-9._-]+)\.json$/;
// The temporaries of `createNoClobber` (`.planning-claim-<16 hex>.tmp`); `list` skips them.
const NO_CLOBBER_PREFIX = '.planning-claim-';
const TEMPORARY_PATTERN = /^\.planning-claim-[0-9a-f]{16}\.tmp$/;
// The per-issue guard directory (`.<ISSUE_KEY>.guard`, next to the record); `list` skips it.
const GUARD_PATTERN = /^\.issue-[a-z0-9._-]+\.guard$/;
const MAX_PASS_RECORD_BYTES = 1024 * 1024;
const MAX_LEDGER_BYTES = 1024 * 1024;

// ---------------------------------------------------------------------------------------------
// Key derivation

function identityText(value, label, { allowSlash = false } = {}) {
  if (typeof value !== 'string') fail('INVALID_INPUT', `${label} must be a string`);
  const text = value.trim();
  if (
    text === '' ||
    text.length > MAX_IDENTITY_TEXT ||
    /[\s\p{Cc}]/u.test(text) ||
    (typeof text.isWellFormed === 'function' && !text.isWellFormed()) ||
    (!allowSlash && text.includes('/')) ||
    text.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    fail('INVALID_INPUT', `${label} is not a usable identity`);
  }
  return text;
}

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, DIGEST_HEX);
}

function slug(value) {
  const text = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+/, '')
    .slice(0, SLUG_MAX)
    .replace(/[._-]+$/, '');
  return text === '' ? 'x' : text;
}

// The canonical target identity: `forge:<host>/<owner>/<repository>` or `external:<id>`.
function canonicalTarget(target) {
  if (!isObject(target)) fail('INVALID_INPUT', 'target must be a JSON object');
  if (target.kind === 'forge') {
    requireClosedKeys(target, ['kind', 'host', 'owner', 'repository'], 'target');
    const host = identityText(target.host, 'target.host').toLowerCase().replace(/\.$/, '');
    const owner = identityText(target.owner, 'target.owner', { allowSlash: true }).toLowerCase();
    const repository = identityText(target.repository, 'target.repository')
      .toLowerCase()
      .replace(/\.git$/, '');
    if (host === '' || repository === '') fail('INVALID_INPUT', 'target is not a usable identity');
    return { kind: 'forge', canonical: `forge:${host}/${owner}/${repository}` };
  }
  if (target.kind === 'external') {
    requireClosedKeys(target, ['kind', 'id'], 'target');
    const id = identityText(target.id, 'target.id', { allowSlash: true });
    return { kind: 'external', canonical: `external:${id}` };
  }
  fail('INVALID_INPUT', 'target.kind must be forge or external');
}

function canonicalIssue(kind, issue) {
  if (kind === 'forge') {
    const number =
      typeof issue === 'string' && /^[1-9][0-9]{0,15}$/.test(issue) ? Number(issue) : issue;
    if (!Number.isSafeInteger(number) || number <= 0) {
      fail('INVALID_INPUT', 'issue must be a positive issue number on a forge target');
    }
    return number;
  }
  return identityText(issue, 'issue').toLowerCase();
}

function targetKeyFor(kind, canonical) {
  const rest = canonical.slice(canonical.indexOf(':') + 1);
  return `${KIND_PREFIX[kind]}-${slug(rest)}-${digest(canonical)}`;
}

function keysFor(kind, canonical, issue) {
  const issueKey =
    typeof issue === 'number' ? `issue-${issue}` : `issue-${slug(issue)}-${digest(issue)}`;
  return { targetKey: targetKeyFor(kind, canonical), issueKey };
}

// The one key derivation: `{targetKey, issueKey, target, issue, path}` with `target` the canonical
// identity, `issue` the normalized issue, and `path` the record path below the runtime-state root.
// Pure; throws INVALID_INPUT for an unusable target or issue.
export function planningClaimKey({ target, issue } = {}) {
  const { kind, canonical } = canonicalTarget(target);
  const normalized = canonicalIssue(kind, issue);
  const keys = keysFor(kind, canonical, normalized);
  return {
    ...keys,
    target: canonical,
    issue: normalized,
    path: `${RUNTIME_STATE_DIR}/${PLANNING_CLAIM_DIRECTORY}/${keys.targetKey}/${keys.issueKey}.json`,
  };
}

// Re-derives the keys of a stored canonical identity, or null when it is not one.
function keysOfStored(target, issue) {
  if (typeof target !== 'string') return null;
  const kind = target.startsWith('forge:')
    ? 'forge'
    : target.startsWith('external:')
      ? 'external'
      : null;
  if (kind === null) return null;
  if (kind === 'forge' ? !Number.isSafeInteger(issue) || issue <= 0 : typeof issue !== 'string') {
    return null;
  }
  return keysFor(kind, target, issue);
}

// ---------------------------------------------------------------------------------------------
// Paths, clock, host and liveness

function claimPaths(cwd, targetKey, issueKey) {
  const stateDir = path.join(cwd, RUNTIME_STATE_DIR);
  const directory = path.join(stateDir, PLANNING_CLAIM_DIRECTORY);
  const targetDirectory = targetKey === undefined ? null : path.join(directory, targetKey);
  return {
    stateDir,
    directory,
    targetDirectory,
    record:
      targetDirectory === null || issueKey === undefined
        ? null
        : path.join(targetDirectory, `${issueKey}.json`),
  };
}

function nowMs(deps) {
  return (deps.now ?? Date.now)();
}

// The host name a claim or an Issue Buddy pass record carries: `deps.hostname` or the OS host name,
// UNKNOWN_HOST when it is no usable host name.
export function localHost(deps = {}) {
  const host = (deps.hostname ?? osHostname)();
  return typeof host === 'string' && HOST_PATTERN.test(host) ? host : UNKNOWN_HOST;
}

function validPid(value) {
  return Number.isSafeInteger(value) && value > 1;
}

function validStartTime(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

// The fields of `/proc/<pid>/stat` after the parenthesized command name (field 3 onward), or null
// when the process has no readable stat. `deps.readProcStat(pid)` replaces the procfs read.
export function procStatFields(pid, deps = {}) {
  try {
    const stat = (deps.readProcStat ?? ((value) => readFileSync(`/proc/${value}/stat`, 'utf8')))(
      pid,
    );
    if (typeof stat !== 'string') return null;
    const close = stat.lastIndexOf(')');
    return close < 0 ? null : stat.slice(close + 2).split(' ');
  } catch {
    return null;
  }
}

// The start time of process `pid` in clock ticks since boot (`/proc/<pid>/stat` field 22), or null
// where procfs does not answer (any system without it, or a process that is gone). Together with
// the pid it identifies one process: a reused pid has another start time.
export function processStartTime(pid, deps = {}) {
  if (!validPid(pid)) return null;
  const fields = procStatFields(pid, deps);
  if (fields === null || !/^[0-9]{1,16}$/.test(fields[19] ?? '')) return null;
  const ticks = Number(fields[19]);
  return validStartTime(ticks) ? ticks : null;
}

// The session process and its start time, `{pid, pidStartTime}`: the parent of the helper's parent
// (the shell spawned for this call), read from `/proc` where it exists and from `ps` otherwise;
// `pid` null when neither answers, `pidStartTime` null when the start time cannot be read. `context`
// needs only `runner`. The Issue Buddy pass record stores the same pair, so both liveness probes
// agree. `deps.ownerPid` (with `deps.ownerPidStartTime`, else null) replaces the resolution.
export async function sessionOwner(context, deps = {}) {
  if (deps.ownerPid !== undefined) {
    const pid = validPid(deps.ownerPid) ? deps.ownerPid : null;
    const start = pid !== null && validStartTime(deps.ownerPidStartTime);
    return { pid, pidStartTime: start ? deps.ownerPidStartTime : null };
  }
  const parent = deps.parentPid ?? process.ppid;
  if (!validPid(parent)) return { pid: null, pidStartTime: null };
  const fields = procStatFields(parent, deps);
  if (fields !== null) {
    const pid = Number(fields[1]);
    return validPid(pid)
      ? { pid, pidStartTime: processStartTime(pid, deps) }
      : { pid: null, pidStartTime: null };
  }
  // No procfs: ask `ps`, and record no start time.
  try {
    const result = await context.runner({
      executable: 'ps',
      args: ['-o', 'ppid=', '-p', String(parent)],
      timeoutMs: 5000,
    });
    if (result?.status !== 0) return { pid: null, pidStartTime: null };
    const pid = Number(String(result.stdout ?? '').trim());
    return { pid: validPid(pid) ? pid : null, pidStartTime: null };
  } catch {
    return { pid: null, pidStartTime: null };
  }
}

// The session process pid alone (`sessionOwner`).
export async function sessionPid(context, deps = {}) {
  return (await sessionOwner(context, deps)).pid;
}

// `alive`, `dead` or `unknown` for a valid record on this host (see the header): `dead` only when
// the recorded process is provably gone, never on an unreadable identity.
export function claimLiveness(claim, host, deps = {}) {
  if (claim.pid === null || host === UNKNOWN_HOST || claim.hostname !== host) return 'unknown';
  try {
    (deps.kill ?? process.kill)(claim.pid, 0);
  } catch (error) {
    if (error?.code === 'ESRCH') return 'dead';
    if (error?.code !== 'EPERM') return 'unknown';
  }
  const recorded = validStartTime(claim.pidStartTime) ? claim.pidStartTime : null;
  // Without a recorded start time a present pid cannot be told from a reused one: alive, as before.
  if (recorded === null) return 'alive';
  const current = processStartTime(claim.pid, deps);
  if (current === null) return 'unknown';
  return current === recorded ? 'alive' : 'dead';
}

// ---------------------------------------------------------------------------------------------
// Record schema

function isoTime(value) {
  return (
    typeof value === 'string' &&
    ACQUIRED_AT_PATTERN.test(value) &&
    new Date(value).toISOString() === value
  );
}

// Returns null for a valid record at `<targetKey>/<issueKey>.json`, else the first failed field.
function claimProblem(value, targetKey, issueKey) {
  if (!isObject(value)) return 'not-an-object';
  if (!PLANNING_CLAIM_WORKFLOWS.includes(value.workflow)) return 'workflow';
  const holder = HOLDER_KEYS[value.workflow];
  const expected = [...CLAIM_KEYS, holder];
  const keys = Object.keys(value).filter((key) => !OPTIONAL_CLAIM_KEYS.includes(key));
  if (keys.length !== expected.length || !expected.every((key) => keys.includes(key))) {
    return 'keys';
  }
  if (value.schemaVersion !== PLANNING_CLAIM_SCHEMA_VERSION) return 'schema-version';
  if (typeof value.claimId !== 'string' || !TOKEN_PATTERN.test(value.claimId)) return 'claim-id';
  if (!holderIdValid(value.workflow, value[holder]))
    return holder === 'runId' ? 'run-id' : 'pass-id';
  if (value.targetKey !== targetKey) return 'target-key';
  if (value.issueKey !== issueKey) return 'issue-key';
  const derived = keysOfStored(value.target, value.issue);
  if (derived === null) return 'target';
  if (derived.targetKey !== targetKey || derived.issueKey !== issueKey) return 'identity';
  if (!isoTime(value.acquiredAt)) return 'acquired-at';
  if (value.pid !== null && !validPid(value.pid)) return 'pid';
  if (
    value.pidStartTime !== undefined &&
    value.pidStartTime !== null &&
    (value.pid === null || !validStartTime(value.pidStartTime))
  ) {
    return 'pid-start-time';
  }
  if (typeof value.hostname !== 'string' || !HOST_PATTERN.test(value.hostname)) return 'hostname';
  return null;
}

function holderIdValid(workflow, value) {
  if (typeof value !== 'string') return false;
  if (workflow === 'autopilot') return AUTOPILOT_RUN_ID_PATTERN.test(value);
  return (HOLDER_KEYS[workflow] === 'passId' ? PASS_ID_PATTERN : RUN_ID_PATTERN).test(value);
}

function serialize(claim) {
  const keys = [
    ...CLAIM_KEYS.slice(0, 3),
    HOLDER_KEYS[claim.workflow],
    ...CLAIM_KEYS.slice(3, -1),
    ...OPTIONAL_CLAIM_KEYS,
    ...CLAIM_KEYS.slice(-1),
  ];
  const text = `${JSON.stringify(Object.fromEntries(keys.map((key) => [key, claim[key]])))}\n`;
  if (Buffer.byteLength(text, 'utf8') > MAX_CLAIM_BYTES) {
    fail('INVALID_INPUT', `the claim would exceed ${MAX_CLAIM_BYTES} bytes`);
  }
  return text;
}

// Reads one record without following a symlink: `{ state: 'missing' }`, `{ state: 'valid', read,
// claim }` or `{ state: 'invalid', reason, read? }`.
async function readClaim(context, target, targetKey, issueKey) {
  const read = await readBoundedFile(context.fs, target, MAX_CLAIM_BYTES);
  if (read.state === 'missing') return { state: 'missing' };
  if (read.state !== 'ok') return { state: 'invalid', reason: read.state };
  let parsed;
  try {
    parsed = JSON.parse(read.content.toString('utf8'));
  } catch {
    return { state: 'invalid', reason: 'invalid-json', read };
  }
  const reason = claimProblem(parsed, targetKey, issueKey);
  return reason ? { state: 'invalid', reason, read } : { state: 'valid', read, claim: parsed };
}

// The holder as `list` and `CLAIMED` report it: never the `claimId`.
function publicClaim(claim, now, host, deps) {
  const holder = HOLDER_KEYS[claim.workflow];
  const ageMs = Math.max(0, now - Date.parse(claim.acquiredAt));
  return {
    targetKey: claim.targetKey,
    issueKey: claim.issueKey,
    state: 'valid',
    target: claim.target,
    issue: claim.issue,
    workflow: claim.workflow,
    [holder]: claim[holder],
    acquiredAt: claim.acquiredAt,
    ageMs,
    stale: ageMs > STALE_AFTER_MS,
    pid: claim.pid,
    hostname: claim.hostname,
    liveness: claimLiveness(claim, host, deps),
  };
}

// Whether the record is still the very file `read` saw.
async function unchanged(context, target, read) {
  const again = await readBoundedFile(context.fs, target, MAX_CLAIM_BYTES);
  return again.state === 'ok' && sameFileRead(read, again);
}

async function unlinkClaim(context, target) {
  try {
    await context.fs.unlink(target);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      fail('WRITE_FAILED', `cannot remove ${target}: ${error?.code ?? error?.message}`);
    }
  }
}

// Runs `fn` while holding the guard directory of one issue's record. `targetDirectory` must exist.
// `fn`'s own result or error is returned; a guard that cannot be removed afterwards is left in place
// and reported by the next call that waits for it.
async function withClaimGuard(context, targetDirectory, issueKey, deps, fn) {
  const guard = path.join(targetDirectory, `.${issueKey}.guard`);
  await guardTarget(context, guard);
  const now = deps.monotonicNow ?? (() => performance.now());
  const sleep = deps.sleep ?? ((ms) => delay(ms));
  const deadline = now() + GUARD_WAIT_MS;
  for (;;) {
    try {
      await context.fs.mkdir(guard, { mode: 0o700 });
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        fail('WRITE_FAILED', `cannot create ${guard}: ${error?.code ?? error?.message}`);
      }
    }
    // NaN ends the wait as well.
    const remaining = deadline - now();
    if (!(remaining > 0)) {
      fail(
        'RUNTIME_STATE_UNSAFE',
        `${guard} is still held after ${GUARD_WAIT_MS / 1000} seconds: another planning-claim call is changing this claim, or an interrupted one left the guard; nothing was changed. Remove it by hand only after confirming that no planning-claim call is running`,
      );
    }
    await sleep(Math.min(GUARD_RETRY_MS, remaining));
  }
  try {
    return await fn();
  } finally {
    await context.fs.rmdir(guard).catch(() => {});
  }
}

// ---------------------------------------------------------------------------------------------
// Orphan proofs

// Whether any entry exists at `target` below the runtime root, without following a symlink in its
// chain: `present`, `absent`, or `unreadable`.
async function entryState(context, directory, target) {
  if (!(await assertDirectoryChain(context.cwd, directory, { allowMissing: true }))) {
    return 'absent';
  }
  try {
    await context.fs.lstat(target);
    return 'present';
  } catch (error) {
    return error?.code === 'ENOENT' ? 'absent' : 'unreadable';
  }
}

// The Issue Buddy pass record of `passId`: `present`, `absent` or `unreadable`.
export async function passRecordState(context, passId) {
  const directory = path.join(context.cwd, RUNTIME_STATE_DIR, 'issue-buddy', 'passes');
  return entryState(context, directory, path.join(directory, `${passId}.json`));
}

// The autopilot run ledger of `runId`: `absent`, `open`, `closed` or `invalid`.
export async function runLedgerState(context, runId) {
  if (!AUTOPILOT_RUN_ID_PATTERN.test(runId)) return 'invalid';
  const directory = path.join(context.cwd, RUNTIME_STATE_DIR, 'autopilot', runId);
  if (!(await assertDirectoryChain(context.cwd, directory, { allowMissing: true }))) {
    return 'absent';
  }
  const read = await readBoundedFile(
    context.fs,
    path.join(directory, 'run.json'),
    MAX_LEDGER_BYTES,
  );
  if (read.state === 'missing') return 'absent';
  if (read.state !== 'ok') return 'invalid';
  let ledger;
  try {
    ledger = JSON.parse(read.content.toString('utf8'));
  } catch {
    return 'invalid';
  }
  if (!isObject(ledger) || ledger.runId !== runId) return 'invalid';
  if (ledger.status === 'open') return 'open';
  if (ledger.status === 'closed') return 'closed';
  return 'invalid';
}

// Null when `proof` holds for `claim`, else the refusal reason.
async function proofRefusal(context, claim, proof, host, deps) {
  if (proof === 'pass-record-absent') {
    if (claim.passId === undefined) return 'proof-not-applicable';
    const state = await passRecordState(context, claim.passId);
    return state === 'absent' ? null : `pass-record-${state}`;
  }
  if (proof === 'run-ledger-closed') {
    if (claim.workflow !== 'autopilot') return 'proof-not-applicable';
    const state = await runLedgerState(context, claim.runId);
    if (state === 'closed') return null;
    // `run-init` holds the claim before its ledger exists: a young claim without one is not proof.
    if (state === 'absent') {
      return nowMs(deps) - Date.parse(claim.acquiredAt) > LEDGER_GRACE_MS
        ? null
        : 'ledger-absent-in-grace';
    }
    return `ledger-${state}`;
  }
  const liveness = claimLiveness(claim, host, deps);
  return liveness === 'dead' ? null : `process-${liveness}`;
}

// ---------------------------------------------------------------------------------------------
// Input validation

function prepare(operation, input, deps) {
  requireObject(input, 'input');
  requireClosedKeys(input, OPERATION_KEYS[operation], 'input');
  return makeContext(deps);
}

async function resolve(context, cwd) {
  await requireRootSyntax(cwd);
  await resolveRoot(context, cwd);
}

function requireClaimId(value) {
  if (typeof value !== 'string' || !TOKEN_PATTERN.test(value)) {
    fail('INVALID_INPUT', `claimId must match ${TOKEN_PATTERN.source}`);
  }
  return value;
}

function requireHolder(input) {
  if (!PLANNING_CLAIM_WORKFLOWS.includes(input.workflow)) {
    fail('INVALID_INPUT', `workflow must be one of ${PLANNING_CLAIM_WORKFLOWS.join(', ')}`);
  }
  const holder = HOLDER_KEYS[input.workflow];
  const other = holder === 'runId' ? 'passId' : 'runId';
  if (input[other] !== undefined) {
    fail('INVALID_INPUT', `a ${input.workflow} claim carries ${holder}, not ${other}`);
  }
  if (!holderIdValid(input.workflow, input[holder])) {
    fail('INVALID_INPUT', `${holder} is not a valid ${input.workflow} ${holder}`);
  }
  return { workflow: input.workflow, holder, id: input[holder] };
}

// ---------------------------------------------------------------------------------------------
// Operations

export async function planningClaimKeyOperation(input, deps = {}) {
  prepare('planning-claim key', input, deps);
  return planningClaimKey(input);
}

export async function planningClaimAcquire(input, deps = {}) {
  const context = prepare('planning-claim acquire', input, deps);
  const key = planningClaimKey(input);
  const { workflow, holder, id } = requireHolder(input);
  await resolve(context, input.cwd);
  const paths = claimPaths(context.cwd, key.targetKey, key.issueKey);
  const legacyDirectory = path.join(paths.stateDir, path.dirname(LEGACY_PASS_LOCK));
  const legacy = await entryState(
    context,
    legacyDirectory,
    path.join(paths.stateDir, LEGACY_PASS_LOCK),
  );
  if (legacy !== 'absent') {
    return new StateOutcome('LEGACY_PASS_LOCK', {
      path: `${RUNTIME_STATE_DIR}/${LEGACY_PASS_LOCK}`,
    });
  }
  const host = localHost(deps);
  const { pid, pidStartTime } = await sessionOwner(context, deps);
  await ensureGuardedDirectory(context, paths.stateDir);
  await ensureGuardedDirectory(context, paths.directory);
  await ensureGuardedDirectory(context, paths.targetDirectory);
  // The create, and the read of a record that won it, run under the issue's guard.
  return withClaimGuard(context, paths.targetDirectory, key.issueKey, deps, async () => {
    // A record released between the failed create and its read is retried once.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const acquiredAt = new Date(nowMs(deps)).toISOString();
      const claimId = (deps.randomToken ?? (() => randomBytes(16).toString('hex')))();
      const claim = {
        schemaVersion: PLANNING_CLAIM_SCHEMA_VERSION,
        claimId,
        workflow,
        [holder]: id,
        target: key.target,
        issue: key.issue,
        targetKey: key.targetKey,
        issueKey: key.issueKey,
        acquiredAt,
        pid,
        pidStartTime,
        hostname: host,
      };
      const created = await createNoClobber(context, paths.record, serialize(claim), {
        tempPrefix: NO_CLOBBER_PREFIX,
        fs: deps.fs,
        now: deps.now,
      });
      if (created.created) {
        return {
          targetKey: key.targetKey,
          issueKey: key.issueKey,
          claimId,
          workflow,
          [holder]: id,
          acquiredAt,
        };
      }
      const existing = await readClaim(context, paths.record, key.targetKey, key.issueKey);
      if (existing.state === 'missing') continue;
      if (existing.state === 'invalid') {
        return new StateOutcome('CLAIMED', {
          targetKey: key.targetKey,
          issueKey: key.issueKey,
          state: 'invalid',
          reason: existing.reason,
        });
      }
      return new StateOutcome('CLAIMED', publicClaim(existing.claim, nowMs(deps), host, deps));
    }
    fail('WRITE_FAILED', `the claim ${key.path} changed during acquisition; retry`);
  });
}

export async function planningClaimRelease(input, deps = {}) {
  const context = prepare('planning-claim release', input, deps);
  const key = planningClaimKey(input);
  const claimId = requireClaimId(input.claimId);
  await resolve(context, input.cwd);
  const paths = claimPaths(context.cwd, key.targetKey, key.issueKey);
  const names = { targetKey: key.targetKey, issueKey: key.issueKey };
  if (!(await assertDirectoryChain(context.cwd, paths.targetDirectory, { allowMissing: true }))) {
    return { ...names, released: false, reason: 'missing' };
  }
  return withClaimGuard(context, paths.targetDirectory, key.issueKey, deps, async () => {
    const loaded = await readClaim(context, paths.record, key.targetKey, key.issueKey);
    // An already absent record is released: nothing is left to remove.
    if (loaded.state === 'missing') return { ...names, released: false, reason: 'missing' };
    if (loaded.state === 'invalid')
      return new StateOutcome('NOT_OWNER', { ...names, reason: 'invalid' });
    if (loaded.claim.claimId !== claimId) {
      return new StateOutcome('NOT_OWNER', { ...names, reason: 'token-mismatch' });
    }
    await guardTarget(context, paths.record);
    await assertDirectoryChain(context.cwd, paths.targetDirectory);
    if (!(await unchanged(context, paths.record, loaded.read))) {
      return new StateOutcome('NOT_OWNER', { ...names, reason: 'changed' });
    }
    await unlinkClaim(context, paths.record);
    return { ...names, released: true };
  });
}

export async function planningClaimList(input, deps = {}) {
  const context = prepare('planning-claim list', input, deps);
  const only = input.target === undefined ? undefined : canonicalTarget(input.target);
  await resolve(context, input.cwd);
  const paths = claimPaths(context.cwd);
  const now = nowMs(deps);
  const host = localHost(deps);
  const result = {
    directory: `${RUNTIME_STATE_DIR}/${PLANNING_CLAIM_DIRECTORY}`,
    staleAfterHours: STALE_AFTER_MS / 3_600_000,
    hostname: host,
    claims: [],
    unexpected: [],
    truncated: false,
  };
  if (!(await assertDirectoryChain(context.cwd, paths.directory, { allowMissing: true }))) {
    return result;
  }
  const onlyKey = only === undefined ? undefined : targetKeyFor(only.kind, only.canonical);
  const full = () => result.claims.length + result.unexpected.length >= MAX_REPORTED_ENTRIES;
  const unexpected = (name) =>
    // An untrusted name is never echoed, only its digest.
    result.unexpected.push({ fileNameSha256: createHash('sha256').update(name).digest('hex') });
  for (const targetKey of await listDirectory(context, paths.directory)) {
    if (onlyKey !== undefined && targetKey !== onlyKey) continue;
    if (full()) {
      result.truncated = true;
      break;
    }
    const targetDirectory = path.join(paths.directory, targetKey);
    let isDirectory = false;
    try {
      const info = await context.fs.lstat(targetDirectory);
      isDirectory = info.isDirectory() && !info.isSymbolicLink();
    } catch {
      continue;
    }
    if (!TARGET_KEY_PATTERN.test(targetKey) || !isDirectory) {
      unexpected(targetKey);
      continue;
    }
    for (const name of await listDirectory(context, targetDirectory)) {
      if (TEMPORARY_PATTERN.test(name) || GUARD_PATTERN.test(name)) continue;
      if (full()) {
        result.truncated = true;
        break;
      }
      const match = CLAIM_FILE_PATTERN.exec(name);
      if (!match || !ISSUE_KEY_PATTERN.test(match[1])) {
        unexpected(`${targetKey}/${name}`);
        continue;
      }
      const issueKey = match[1];
      const loaded = await readClaim(
        context,
        path.join(targetDirectory, name),
        targetKey,
        issueKey,
      );
      if (loaded.state === 'missing') continue;
      result.claims.push(
        loaded.state === 'valid'
          ? publicClaim(loaded.claim, now, host, deps)
          : { targetKey, issueKey, state: 'invalid', reason: loaded.reason },
      );
    }
    if (result.truncated) break;
  }
  return result;
}

async function listDirectory(context, directory) {
  try {
    return (await context.fs.readdir(directory)).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    fail('UNSAFE_TARGET', `cannot list ${directory}: ${error?.code ?? error?.message}`);
  }
}

function requirePruneItem(item, index) {
  const label = `claims[${index}]`;
  requireObject(item, label);
  requireClosedKeys(item, ['targetKey', 'issueKey', 'acquiredAt', 'proof', 'confirmStale'], label);
  if (typeof item.targetKey !== 'string' || !TARGET_KEY_PATTERN.test(item.targetKey)) {
    fail('INVALID_INPUT', `${label}.targetKey must match ${TARGET_KEY_PATTERN.source}`);
  }
  if (typeof item.issueKey !== 'string' || !ISSUE_KEY_PATTERN.test(item.issueKey)) {
    fail('INVALID_INPUT', `${label}.issueKey must match ${ISSUE_KEY_PATTERN.source}`);
  }
  if (!isoTime(item.acquiredAt)) {
    fail('INVALID_INPUT', `${label}.acquiredAt must be the acquiredAt that list reported`);
  }
  const hasProof = item.proof !== undefined;
  if (item.confirmStale !== undefined && item.confirmStale !== true) {
    fail('INVALID_INPUT', `${label}.confirmStale may only be true`);
  }
  if (hasProof === (item.confirmStale === true)) {
    fail('INVALID_INPUT', `${label} needs exactly one of proof and confirmStale`);
  }
  if (hasProof && !PRUNE_PROOFS.includes(item.proof)) {
    fail('INVALID_INPUT', `${label}.proof must be one of ${PRUNE_PROOFS.join(', ')}`);
  }
  return item;
}

export async function planningClaimPrune(input, deps = {}) {
  const context = prepare('planning-claim prune', input, deps);
  const items = input.claims;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_PRUNE_CLAIMS) {
    fail('INVALID_INPUT', `claims must hold 1 to ${MAX_PRUNE_CLAIMS} claims`);
  }
  items.forEach(requirePruneItem);
  const ids = items.map((item) => `${item.targetKey}/${item.issueKey}`);
  if (new Set(ids).size !== ids.length) fail('INVALID_INPUT', 'claims must be unique');
  await resolve(context, input.cwd);
  const host = localHost(deps);
  const results = [];
  if (
    !(await assertDirectoryChain(context.cwd, claimPaths(context.cwd).directory, {
      allowMissing: true,
    }))
  ) {
    return {
      items: items.map(({ targetKey, issueKey }) => ({ targetKey, issueKey, result: 'missing' })),
    };
  }
  const present = [];
  for (const item of items) {
    const paths = claimPaths(context.cwd, item.targetKey, item.issueKey);
    if (await assertDirectoryChain(context.cwd, paths.targetDirectory, { allowMissing: true })) {
      present.push(paths.record);
    }
  }
  await guardTargets(context, present);
  for (const item of items) {
    results.push({
      targetKey: item.targetKey,
      issueKey: item.issueKey,
      ...(await pruneOne(context, item, host, deps)),
    });
  }
  return { items: results };
}

// Removes one record only under its verified proof or confirmed staleness, and only while it is
// still the record the caller observed (`acquiredAt`) and the record the proof was checked on.
async function pruneOne(context, item, host, deps) {
  const paths = claimPaths(context.cwd, item.targetKey, item.issueKey);
  if (!(await assertDirectoryChain(context.cwd, paths.targetDirectory, { allowMissing: true }))) {
    return { result: 'missing' };
  }
  return withClaimGuard(context, paths.targetDirectory, item.issueKey, deps, async () => {
    const loaded = await readClaim(context, paths.record, item.targetKey, item.issueKey);
    if (loaded.state === 'missing') return { result: 'missing' };
    if (loaded.state === 'invalid') {
      return {
        result: ['not-regular', 'oversized'].includes(loaded.reason) ? 'not-regular' : 'invalid',
        reason: loaded.reason,
      };
    }
    const { claim, read } = loaded;
    if (claim.acquiredAt !== item.acquiredAt) return { result: 'changed' };
    if (item.confirmStale === true) {
      if (nowMs(deps) - Date.parse(claim.acquiredAt) <= STALE_AFTER_MS)
        return { result: 'not-stale' };
    } else {
      const refusal = await proofRefusal(context, claim, item.proof, host, deps);
      if (refusal !== null) return { result: 'proof-refused', reason: refusal };
    }
    await assertDirectoryChain(context.cwd, paths.targetDirectory);
    if (!(await unchanged(context, paths.record, read))) return { result: 'changed' };
    await unlinkClaim(context, paths.record);
    return { result: 'removed', ...(item.proof === undefined ? {} : { proof: item.proof }) };
  });
}

// ---------------------------------------------------------------------------------------------
// Helper-internal read

// Reads the claim of one issue, `claimId` included, for helper-internal callers (the Issue Buddy
// and autopilot cores) that must verify a holder; never expose its result through CLI output.
// Returns `{targetKey, issueKey, state: 'missing'}`, `{..., state: 'invalid', reason}` or
// `{..., state: 'valid', claim}`. `input` is `{cwd, target, issue}`; `deps` as for the operations.
export async function readPlanningClaim(input, deps = {}) {
  requireObject(input, 'input');
  requireClosedKeys(input, ['cwd', 'target', 'issue'], 'input');
  const context = makeContext(deps);
  const key = planningClaimKey(input);
  await resolve(context, input.cwd);
  const paths = claimPaths(context.cwd, key.targetKey, key.issueKey);
  const names = { targetKey: key.targetKey, issueKey: key.issueKey };
  if (!(await assertDirectoryChain(context.cwd, paths.targetDirectory, { allowMissing: true }))) {
    return { ...names, state: 'missing' };
  }
  const loaded = await readClaim(context, paths.record, key.targetKey, key.issueKey);
  if (loaded.state === 'valid') return { ...names, state: 'valid', claim: loaded.claim };
  if (loaded.state === 'invalid') return { ...names, state: 'invalid', reason: loaded.reason };
  return { ...names, state: 'missing' };
}
