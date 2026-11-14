// Runtime-state helper: the `presence` operations on the run-presence markers of merge-gate runs,
// one small JSON file per run at
// `<RUNTIME_STATE_ROOT>/.effective-flow/merge-gate-presence/<SESSION_ID>.json`, named after the
// run's wisdom SESSION_ID:
//
//   presence register  {cwd, sessionId, prNumber, head, base}
//   presence refresh   {cwd, sessionId, token, head?}
//   presence list      {cwd, sessionId?}
//   presence release   {cwd, sessionId, token}
//   presence prune     {cwd, sessionIds}
//
// A marker is exactly MARKER_KEYS: `schemaVersion` 1, `sessionId` (equal to its file name),
// `token` (32 hex characters the helper generates at `register` and returns once), `prNumber` (a
// positive safe integer), `head` (a full 40- or 64-hex object name), `base` (a branch name
// `isSafeBaseRef` accepts, at most MAX_BASE_BYTES of UTF-8), and `startedAt` and `lastActiveAt` in
// the `Date#toISOString` form, `startedAt` not after `lastActiveAt`. Any other content is
// `invalid` with a reason; the helper reports it and never rewrites it.
//
// Ownership: `register` creates the caller's own marker no-clobber; `refresh` and `release` act
// only on the marker named by the caller's `sessionId` and only when its `token` matches
// (NOT_OWNER otherwise), so a run never changes or removes another run's marker through them. The
// only removal of another run's marker is `prune`, the cleanup path: it removes a marker only while
// that run's wisdom file `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md` is absent, and
// keeps it as `possibly-suspended` otherwise. Nothing here decides by age: `list` only flags a
// marker whose `lastActiveAt` is older than STALE_AFTER_MS as `possiblyStale`.
//
// Every write is bounded (one marker of at most MAX_MARKER_BYTES) and passes the shared
// runtime-state guard: `register` through `createNoClobber`, `refresh` through `atomicWrite` with a
// re-read of the marker immediately before its rename, `release` and `prune` through the guard and a
// re-proven symlink-free directory chain and unchanged marker identity immediately before the
// unlink. `list` only reads; it never follows a symlink and never returns a token.

import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { isSafeBaseRef } from './config-resolve-core.mjs';
import {
  RUNTIME_STATE_DIR,
  assertDirectoryChain,
  atomicWrite,
  createNoClobber,
  ensureGuardedDirectory,
  guardTarget,
  guardTargets,
} from './runtime-state-guard.mjs';
import {
  ACQUIRED_AT_PATTERN,
  MAX_REPORTED_ENTRIES,
  OPERATION_KEYS,
  StateOutcome,
  TOKEN_PATTERN,
  fail,
  makeContext,
  requireClosedKeys,
  requireObject,
  requireRootSyntax,
  resolveRoot,
} from './effective-flow-state-core.mjs';
import { isObject, readBoundedFile, sameFileRead } from './runtime-file-primitives.mjs';

export const PRESENCE_DIRECTORY = 'merge-gate-presence';
export const PRESENCE_SCHEMA_VERSION = 1;
// The wisdom SESSION_ID: the shape the wisdom-file name accepts.
export const PRESENCE_SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const PRESENCE_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
export const MAX_BASE_BYTES = 255;
// The read and write bound of one marker; the largest valid marker serializes well below it.
export const MAX_MARKER_BYTES = 2048;
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
// A `lastActiveAt` further than this ahead of the helper's clock is invalid, so a crafted future
// time can never keep a marker looking active.
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const MAX_PRUNE_SESSION_IDS = MAX_REPORTED_ENTRIES;
export const MARKER_KEYS = Object.freeze([
  'schemaVersion',
  'sessionId',
  'token',
  'prNumber',
  'head',
  'base',
  'startedAt',
  'lastActiveAt',
]);
export const PRUNE_RESULTS = Object.freeze([
  'removed',
  'possibly-suspended',
  'missing',
  'not-regular',
  'wisdom-unreadable',
  'changed',
]);

const MARKER_NAME_PATTERN = /^([A-Za-z0-9][A-Za-z0-9._-]{0,127})\.json$/;
// The temporaries of `createNoClobber` (`.presence-<16 hex>.tmp`) and `atomicWrite`
// (`.<SESSION_ID>.json.<16 hex>.tmp`); `list` skips them.
const NO_CLOBBER_PREFIX = '.presence-';
const TEMPORARY_PATTERN =
  /^\.(?:presence-[0-9a-f]{16}|[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json\.[0-9a-f]{16})\.tmp$/;

// ---------------------------------------------------------------------------------------------
// Input validation

function requireSessionId(value, label = 'sessionId') {
  if (typeof value !== 'string' || !PRESENCE_SESSION_ID_PATTERN.test(value)) {
    fail('INVALID_INPUT', `${label} must match ${PRESENCE_SESSION_ID_PATTERN.source}`);
  }
  return value;
}

function requireHead(value) {
  if (typeof value !== 'string' || !PRESENCE_OBJECT_ID_PATTERN.test(value)) {
    fail('INVALID_INPUT', 'head must be a full 40- or 64-hex object name');
  }
  return value;
}

function validBase(value) {
  return (
    typeof value === 'string' &&
    Buffer.byteLength(value, 'utf8') <= MAX_BASE_BYTES &&
    (typeof value.isWellFormed !== 'function' || value.isWellFormed()) &&
    isSafeBaseRef(value)
  );
}

function validPrNumber(value) {
  return Number.isSafeInteger(value) && value > 0;
}

async function prepare(operation, input, deps) {
  requireObject(input, 'input');
  requireClosedKeys(input, OPERATION_KEYS[operation], 'input');
  return makeContext(deps);
}

async function resolve(context, cwd) {
  await requireRootSyntax(cwd);
  await resolveRoot(context, cwd);
}

// ---------------------------------------------------------------------------------------------
// Paths, clock and marker schema

function presencePaths(cwd, sessionId) {
  const stateDir = path.join(cwd, RUNTIME_STATE_DIR);
  const directory = path.join(stateDir, PRESENCE_DIRECTORY);
  return {
    stateDir,
    directory,
    marker: sessionId === undefined ? null : path.join(directory, `${sessionId}.json`),
    wisdom:
      sessionId === undefined
        ? null
        : path.join(stateDir, `.wisdom-accumulation-${sessionId}.tmp.md`),
  };
}

function nowMs(deps) {
  return (deps.now ?? Date.now)();
}

function isoTime(value) {
  return (
    typeof value === 'string' &&
    ACQUIRED_AT_PATTERN.test(value) &&
    new Date(value).toISOString() === value
  );
}

// Returns null for a valid marker named `sessionId`, else the first failed field as the reason.
// `now` null skips the clock-skew check: the caller's own marker, proven by its token, may carry a
// `lastActiveAt` ahead of a clock that stepped back, and that is no reason to refuse its own run.
function markerProblem(value, sessionId, now) {
  if (!isObject(value)) return 'not-an-object';
  const keys = Object.keys(value);
  if (keys.length !== MARKER_KEYS.length || !MARKER_KEYS.every((key) => keys.includes(key))) {
    return 'keys';
  }
  if (value.schemaVersion !== PRESENCE_SCHEMA_VERSION) return 'schema-version';
  if (value.sessionId !== sessionId) return 'session-id';
  if (typeof value.token !== 'string' || !TOKEN_PATTERN.test(value.token)) return 'token';
  if (!validPrNumber(value.prNumber)) return 'pr-number';
  if (typeof value.head !== 'string' || !PRESENCE_OBJECT_ID_PATTERN.test(value.head)) {
    return 'head';
  }
  if (!validBase(value.base)) return 'base';
  if (!isoTime(value.startedAt)) return 'started-at';
  if (!isoTime(value.lastActiveAt)) return 'last-active-at';
  const started = Date.parse(value.startedAt);
  const active = Date.parse(value.lastActiveAt);
  if (started > active) return 'timestamp-order';
  if (now !== null && active > now + MAX_CLOCK_SKEW_MS) return 'future-timestamp';
  return null;
}

function serialize(marker) {
  const text = `${JSON.stringify(Object.fromEntries(MARKER_KEYS.map((key) => [key, marker[key]])))}\n`;
  if (Buffer.byteLength(text, 'utf8') > MAX_MARKER_BYTES) {
    fail('INVALID_INPUT', `the marker would exceed ${MAX_MARKER_BYTES} bytes`);
  }
  return text;
}

// Reads one marker without following a symlink: `{ state: 'missing' }`, `{ state: 'valid', read,
// marker }` or `{ state: 'invalid', reason, read? }`.
async function readMarker(context, target, sessionId, now) {
  const read = await readBoundedFile(context.fs, target, MAX_MARKER_BYTES);
  if (read.state === 'missing') return { state: 'missing' };
  if (read.state !== 'ok') return { state: 'invalid', reason: read.state };
  let parsed;
  try {
    parsed = JSON.parse(read.content.toString('utf8'));
  } catch {
    return { state: 'invalid', reason: 'invalid-json', read };
  }
  const reason = markerProblem(parsed, sessionId, now);
  return reason ? { state: 'invalid', reason, read } : { state: 'valid', read, marker: parsed };
}

// Whether the run's wisdom file exists: `present` for any entry at its name, `absent` only for
// ENOENT, `unreadable` for every other failure.
async function wisdomState(context, wisdom) {
  try {
    await context.fs.lstat(wisdom);
    return 'present';
  } catch (error) {
    return error?.code === 'ENOENT' ? 'absent' : 'unreadable';
  }
}

function publicMarker(marker, now) {
  const ageSeconds = Math.max(0, Math.floor((now - Date.parse(marker.lastActiveAt)) / 1000));
  return {
    sessionId: marker.sessionId,
    state: 'valid',
    prNumber: marker.prNumber,
    head: marker.head,
    base: marker.base,
    startedAt: marker.startedAt,
    lastActiveAt: marker.lastActiveAt,
    ageSeconds,
    possiblyStale: now - Date.parse(marker.lastActiveAt) > STALE_AFTER_MS,
  };
}

// Loads the caller's own marker and proves the token; returns `{ loaded }` or an outcome. The
// clock-skew check applies only to other runs' markers (`list`), never to the caller's own.
async function loadOwn(context, paths, sessionId, token) {
  if (!(await assertDirectoryChain(context.cwd, paths.directory, { allowMissing: true }))) {
    return new StateOutcome('MARKER_NOT_FOUND', { sessionId });
  }
  const loaded = await readMarker(context, paths.marker, sessionId, null);
  if (loaded.state === 'missing') return new StateOutcome('MARKER_NOT_FOUND', { sessionId });
  if (loaded.state === 'invalid') {
    return new StateOutcome('MARKER_INVALID', { sessionId, reason: loaded.reason });
  }
  if (loaded.marker.token !== token) {
    return new StateOutcome('NOT_OWNER', { sessionId, reason: 'token-mismatch' });
  }
  return { loaded };
}

// Whether the marker is still the very file `read` saw.
async function unchanged(context, target, read) {
  const again = await readBoundedFile(context.fs, target, MAX_MARKER_BYTES);
  return again.state === 'ok' && sameFileRead(read, again);
}

// ---------------------------------------------------------------------------------------------
// Operations

export async function presenceRegister(input, deps = {}) {
  const context = await prepare('presence register', input, deps);
  const sessionId = requireSessionId(input.sessionId);
  if (!validPrNumber(input.prNumber)) fail('INVALID_INPUT', 'prNumber must be a positive integer');
  const head = requireHead(input.head);
  if (!validBase(input.base)) {
    fail('INVALID_INPUT', `base must be a safe branch name of at most ${MAX_BASE_BYTES} bytes`);
  }
  await resolve(context, input.cwd);
  const paths = presencePaths(context.cwd, sessionId);
  const now = new Date(nowMs(deps)).toISOString();
  const token = (deps.randomToken ?? (() => randomBytes(16).toString('hex')))();
  const content = serialize({
    schemaVersion: PRESENCE_SCHEMA_VERSION,
    sessionId,
    token,
    prNumber: input.prNumber,
    head,
    base: input.base,
    startedAt: now,
    lastActiveAt: now,
  });
  await ensureGuardedDirectory(context, paths.stateDir);
  await ensureGuardedDirectory(context, paths.directory);
  const created = await createNoClobber(context, paths.marker, content, {
    tempPrefix: NO_CLOBBER_PREFIX,
    fs: deps.fs,
    now: deps.now,
  });
  if (!created.created) return new StateOutcome('MARKER_EXISTS', { sessionId });
  return { sessionId, token, startedAt: now, lastActiveAt: now };
}

export async function presenceRefresh(input, deps = {}) {
  const context = await prepare('presence refresh', input, deps);
  const sessionId = requireSessionId(input.sessionId);
  if (typeof input.token !== 'string' || !TOKEN_PATTERN.test(input.token)) {
    fail('INVALID_INPUT', `token must match ${TOKEN_PATTERN.source}`);
  }
  const head = input.head === undefined ? undefined : requireHead(input.head);
  await resolve(context, input.cwd);
  const paths = presencePaths(context.cwd, sessionId);
  const now = nowMs(deps);
  const own = await loadOwn(context, paths, sessionId, input.token);
  if (own instanceof StateOutcome) return own;
  const { marker, read } = own.loaded;
  // The helper's clock wins, even behind the stored time: a marker left ahead of a clock that
  // stepped back would otherwise stay `future-timestamp` – invalid – for every other run until the
  // clock caught up. `startedAt` is clamped to it so the marker keeps `startedAt <= lastActiveAt`.
  const lastActiveAt = new Date(now).toISOString();
  const startedAt = Date.parse(marker.startedAt) > now ? lastActiveAt : marker.startedAt;
  const content = serialize({ ...marker, head: head ?? marker.head, startedAt, lastActiveAt });
  const written = await atomicWrite(context, paths.marker, content, {
    beforeRename: async () => !(await unchanged(context, paths.marker, read)),
  });
  if (!written.written) {
    return new StateOutcome('NOT_OWNER', { sessionId, reason: 'changed' });
  }
  return { sessionId, head: head ?? marker.head, lastActiveAt };
}

export async function presenceRelease(input, deps = {}) {
  const context = await prepare('presence release', input, deps);
  const sessionId = requireSessionId(input.sessionId);
  if (typeof input.token !== 'string' || !TOKEN_PATTERN.test(input.token)) {
    fail('INVALID_INPUT', `token must match ${TOKEN_PATTERN.source}`);
  }
  await resolve(context, input.cwd);
  const paths = presencePaths(context.cwd, sessionId);
  const own = await loadOwn(context, paths, sessionId, input.token);
  if (own instanceof StateOutcome) {
    // An already absent own marker is released: nothing is left to remove.
    if (own.code === 'MARKER_NOT_FOUND') return { sessionId, released: false, reason: 'missing' };
    return own;
  }
  await guardTarget(context, paths.marker);
  await assertDirectoryChain(context.cwd, paths.directory);
  if (!(await unchanged(context, paths.marker, own.loaded.read))) {
    return new StateOutcome('NOT_OWNER', { sessionId, reason: 'changed' });
  }
  await unlinkMarker(context, paths.marker);
  return { sessionId, released: true };
}

async function unlinkMarker(context, target) {
  try {
    await context.fs.unlink(target);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      fail('WRITE_FAILED', `cannot remove ${target}: ${error?.code ?? error?.message}`);
    }
  }
}

export async function presenceList(input, deps = {}) {
  const context = await prepare('presence list', input, deps);
  const own = input.sessionId === undefined ? undefined : requireSessionId(input.sessionId);
  await resolve(context, input.cwd);
  const paths = presencePaths(context.cwd);
  const now = nowMs(deps);
  const result = {
    directory: `${RUNTIME_STATE_DIR}/${PRESENCE_DIRECTORY}`,
    staleAfterHours: STALE_AFTER_MS / 3_600_000,
    markers: [],
    unexpected: [],
    truncated: false,
  };
  if (!(await assertDirectoryChain(context.cwd, paths.directory, { allowMissing: true }))) {
    return result;
  }
  let names;
  try {
    names = (await context.fs.readdir(paths.directory)).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return result;
    fail('UNSAFE_TARGET', `cannot list ${paths.directory}: ${error?.code ?? error?.message}`);
  }
  for (const name of names) {
    if (TEMPORARY_PATTERN.test(name)) continue;
    const match = MARKER_NAME_PATTERN.exec(name);
    if (match && match[1] === own) continue;
    if (result.markers.length + result.unexpected.length >= MAX_REPORTED_ENTRIES) {
      result.truncated = true;
      break;
    }
    if (!match) {
      // An untrusted name is never echoed, only its digest.
      result.unexpected.push({
        fileNameSha256: createHash('sha256').update(name).digest('hex'),
      });
      continue;
    }
    const sessionId = match[1];
    const marker = presencePaths(context.cwd, sessionId);
    const loaded = await readMarker(context, marker.marker, sessionId, now);
    if (loaded.state === 'missing') continue;
    const wisdomFile = await wisdomState(context, marker.wisdom);
    result.markers.push(
      loaded.state === 'valid'
        ? { ...publicMarker(loaded.marker, now), wisdomFile }
        : { sessionId, state: 'invalid', reason: loaded.reason, wisdomFile },
    );
  }
  return result;
}

export async function presencePrune(input, deps = {}) {
  const context = await prepare('presence prune', input, deps);
  const ids = input.sessionIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_PRUNE_SESSION_IDS) {
    fail('INVALID_INPUT', `sessionIds must hold 1 to ${MAX_PRUNE_SESSION_IDS} session IDs`);
  }
  ids.forEach((id, index) => requireSessionId(id, `sessionIds[${index}]`));
  if (new Set(ids).size !== ids.length) fail('INVALID_INPUT', 'sessionIds must be unique');
  await resolve(context, input.cwd);
  const items = [];
  if (
    !(await assertDirectoryChain(context.cwd, presencePaths(context.cwd).directory, {
      allowMissing: true,
    }))
  ) {
    return { items: ids.map((sessionId) => ({ sessionId, result: 'missing' })) };
  }
  await guardTargets(
    context,
    ids.map((id) => presencePaths(context.cwd, id).marker),
  );
  for (const sessionId of ids) {
    items.push({
      sessionId,
      result: await pruneOne(context, presencePaths(context.cwd, sessionId)),
    });
  }
  return { items };
}

// Removes one marker only while its run's wisdom file is absent; the marker's content is never
// consulted, so a malformed marker of a finished run is removable too.
async function pruneOne(context, paths) {
  const before = await markerIdentity(context, paths.marker);
  if (before === null) return 'missing';
  if (before === false) return 'not-regular';
  const wisdom = await wisdomState(context, paths.wisdom);
  if (wisdom === 'present') return 'possibly-suspended';
  if (wisdom === 'unreadable') return 'wisdom-unreadable';
  await assertDirectoryChain(context.cwd, paths.directory);
  const after = await markerIdentity(context, paths.marker);
  if (after === null) return 'missing';
  if (!after || !sameIdentity(before, after)) return 'changed';
  await unlinkMarker(context, paths.marker);
  return 'removed';
}

// `null` for a missing marker, `false` for a non-regular entry, else its identity.
async function markerIdentity(context, target) {
  let info;
  try {
    info = await context.fs.lstat(target, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    fail('UNSAFE_TARGET', `cannot inspect ${target}: ${error?.code ?? error?.message}`);
  }
  if (!info.isFile()) return false;
  return { dev: info.dev, ino: info.ino, mtimeNs: info.mtimeNs, size: info.size };
}

function sameIdentity(left, right) {
  return ['dev', 'ino', 'mtimeNs', 'size'].every((key) => left[key] === right[key]);
}
