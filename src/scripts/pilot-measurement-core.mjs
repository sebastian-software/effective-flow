import { createHash, randomBytes as cryptoRandomBytes, timingSafeEqual } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  PILOT_MEASUREMENT_POLICY_PROJECTION,
  PILOT_MEASUREMENT_PROTOCOL,
  PILOT_MEASUREMENT_PROTOCOL_DIGEST,
  PILOT_MEASUREMENT_PROTOCOL_VERSION,
  canonicalizeJson,
  protocolProjection,
} from './pilot-measurement-protocol.mjs';

export const PILOT_MEASUREMENT_OPERATIONS = Object.freeze([
  'protocol',
  'inventory',
  'begin-baseline',
  'activate',
  'start',
  'start-packet',
  'finish-packet',
  'finalize',
  'start-gate-observation',
  'finalize-gate-observation',
  'suspend',
  'resume',
  'reconcile-record',
  'reconcile-lock',
  'reconcile-temporary',
  'begin-review',
  'aggregate',
  'evaluate',
  'purge',
  'discard-generation',
]);

export const PILOT_MEASUREMENT_ERROR_CODES = Object.freeze([
  'INVALID_OPERATION',
  'INVALID_PAYLOAD',
  'UNSAFE_RUNTIME_ROOT',
  'MIGRATION_REQUIRED',
  'PROTOCOL_DRIFT',
  'INVALID_STATE',
  'AUTHENTICATION_FAILED',
  'CAPACITY_EXHAUSTED',
  'LOCKED',
  'STALE_REVIEW',
  'INCOMPLETE_EVIDENCE',
  'UNSAFE_STORAGE',
  'NOT_FOUND',
  'WRITE_FAILED',
]);

const EXIT_CODES = Object.freeze({
  INVALID_OPERATION: 2,
  INVALID_PAYLOAD: 2,
  UNSAFE_RUNTIME_ROOT: 3,
  MIGRATION_REQUIRED: 3,
  PROTOCOL_DRIFT: 4,
  INVALID_STATE: 4,
  AUTHENTICATION_FAILED: 5,
  CAPACITY_EXHAUSTED: 6,
  LOCKED: 7,
  STALE_REVIEW: 8,
  INCOMPLETE_EVIDENCE: 8,
  UNSAFE_STORAGE: 9,
  NOT_FOUND: 10,
  WRITE_FAILED: 11,
});

const ERROR_MESSAGES = Object.freeze({
  INVALID_OPERATION: 'unsupported pilot measurement operation',
  INVALID_PAYLOAD: 'pilot measurement input does not match the closed schema',
  UNSAFE_RUNTIME_ROOT: 'pilot measurement runtime guard rejected the target',
  MIGRATION_REQUIRED: 'effective-flow runtime migration must complete before pilot writes',
  PROTOCOL_DRIFT: 'pilot measurement protocol does not match the shipped authority',
  INVALID_STATE: 'pilot measurement lifecycle does not allow this operation',
  AUTHENTICATION_FAILED: 'pilot measurement capability authentication failed',
  CAPACITY_EXHAUSTED: 'pilot measurement capacity is exhausted',
  LOCKED: 'pilot measurement state has a live or unproved lock',
  STALE_REVIEW: 'pilot measurement reviewed digest is stale',
  INCOMPLETE_EVIDENCE: 'pilot measurement evidence is incomplete or invalid',
  UNSAFE_STORAGE: 'pilot measurement storage contains an unsafe entry',
  NOT_FOUND: 'pilot measurement target does not exist',
  WRITE_FAILED: 'pilot measurement mutation could not be completed safely',
});

const OWNER = Object.freeze({ schema: 1, owner: 'effective-flow-model-tiering-pilot' });
const STATE_SCHEMA = 1;
const RECORD_SCHEMA = 1;
const TRACE_SCHEMA = 1;
const OBSERVATION_SCHEMA = 1;
const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const READ_FLAGS = fsConstants.O_RDONLY | O_NOFOLLOW | (fsConstants.O_NONBLOCK ?? 0);
const WRITE_FLAGS = fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | O_NOFOLLOW;
const TOKEN = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/;
const OPAQUE = /^[A-Za-z0-9_-]{32,128}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const NAMESPACE_STAGING = /^\.model-tiering-pilot-staging-([A-Za-z0-9_-]{32,128})$/;
const GENERATION_STAGING = /^\.staging-([A-Za-z0-9_-]{32,128})-([A-Za-z0-9_-]{32,128})$/;
const LIFECYCLE_LOCK_OPERATIONS = new Set([
  'activate',
  'start',
  'pilot-control',
  'finalize',
  'start-gate-observation',
  'finalize-gate-observation',
  'suspend',
  'begin-review',
  'resume',
  'reconcile-record',
  'aggregate',
  'purge',
  'discard-generation',
]);

export class PilotMeasurementError extends Error {
  constructor(code, options = {}) {
    super(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.WRITE_FAILED, { cause: options.cause });
    this.name = 'PilotMeasurementError';
    this.code = code;
    this.exitCode = EXIT_CODES[code] ?? 1;
    if (options.pilotControlOutcome !== undefined) {
      this.pilotControlOutcome = options.pilotControlOutcome;
      this.controlStatePersisted = options.controlStatePersisted;
      this.alert = options.alert;
    }
  }
}

function fail(code, options) {
  throw new PilotMeasurementError(code, options);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactObject(value, required, optional = []) {
  if (!isObject(value)) fail('INVALID_PAYLOAD');
  const keys = Object.keys(value);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !required.includes(key) && !optional.includes(key))
  ) {
    fail('INVALID_PAYLOAD');
  }
  return value;
}

function enumValue(value, values) {
  if (!values.includes(value)) fail('INVALID_PAYLOAD');
  return value;
}

function booleanValue(value) {
  if (typeof value !== 'boolean') fail('INVALID_PAYLOAD');
  return value;
}

function integer(value, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail('INVALID_PAYLOAD');
  return value;
}

function stringValue(value, maximum = PILOT_MEASUREMENT_PROTOCOL.limits.maxTokenBytes) {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value) > maximum) {
    fail('INVALID_PAYLOAD');
  }
  return value;
}

function token(value) {
  const candidate = stringValue(value);
  if (!TOKEN.test(candidate) || containsCredentialMaterial(candidate)) fail('INVALID_PAYLOAD');
  return candidate;
}

function opaque(value) {
  if (typeof value !== 'string' || !OPAQUE.test(value)) fail('INVALID_PAYLOAD');
  return value;
}

function digestValue(value) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail('INVALID_PAYLOAD');
  return value;
}

function assertProtocol(version, digest) {
  if (
    version !== PILOT_MEASUREMENT_PROTOCOL_VERSION ||
    digest !== PILOT_MEASUREMENT_PROTOCOL_DIGEST
  ) {
    fail('PROTOCOL_DRIFT');
  }
}

export function containsCredentialMaterial(value) {
  if (typeof value !== 'string') return false;
  return (
    /(?:^|[^a-z])(password|passwd|secret|token|api[_-]?key|private[_-]?key|authorization)(?:[^a-z]|$)/i.test(
      value,
    ) ||
    /(?:bearer\s+[a-z0-9._~-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|[a-z][a-z0-9+.-]*:\/\/[^/\s]+@)/i.test(
      value,
    ) ||
    /(?:password|passwd|secret|token|api[_-]?key)\s*[:=]/i.test(value)
  );
}

export function validateRelativePath(value) {
  const candidate = stringValue(value, PILOT_MEASUREMENT_PROTOCOL.limits.maxRelativePathBytes);
  if (
    /[^\x20-\x7e]/.test(candidate) ||
    candidate.includes('\0') ||
    candidate.includes('\\') ||
    candidate.startsWith('/') ||
    /^[A-Za-z]:/.test(candidate) ||
    candidate.startsWith('~') ||
    candidate.includes('://') ||
    candidate.endsWith('/') ||
    path.posix.normalize(candidate) !== candidate ||
    candidate.split('/').some((part) => part === '' || part === '.' || part === '..') ||
    /[@<>\r\n]/.test(candidate) ||
    containsCredentialMaterial(candidate)
  ) {
    fail('INVALID_PAYLOAD');
  }
  return candidate;
}

export function canonicalDigest(value) {
  return `sha256:${createHash('sha256').update(canonicalizeJson(value), 'utf8').digest('hex')}`;
}

function hashCapability(value) {
  return canonicalDigest({ capability: value });
}

function authenticate(capability, expected) {
  if (typeof capability !== 'string' || typeof expected !== 'string') fail('AUTHENTICATION_FAILED');
  const actual = Buffer.from(hashCapability(capability));
  const stored = Buffer.from(expected);
  if (actual.length !== stored.length || !timingSafeEqual(actual, stored)) {
    fail('AUTHENTICATION_FAILED');
  }
}

function randomOpaque(deps, bytes = 24) {
  return (deps.randomBytes ?? cryptoRandomBytes)(bytes).toString('base64url');
}

async function uniqueOpaque(deps, unavailable, used = new Set(), bytes = 24) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = randomOpaque(deps, bytes);
    if (!used.has(candidate) && !(await unavailable(candidate))) {
      used.add(candidate);
      return candidate;
    }
  }
  fail('INVALID_STATE');
}

async function pathExists(target) {
  const info = await lstat(target).catch((error) =>
    error?.code === 'ENOENT' ? null : Promise.reject(error),
  );
  if (info?.isSymbolicLink()) fail('UNSAFE_STORAGE');
  return info !== null;
}

async function readRegular(target, { missing = false, maximum = 8 * 1024 * 1024 } = {}) {
  let handle;
  try {
    handle = await open(target, READ_FLAGS);
  } catch (error) {
    if (missing && error?.code === 'ENOENT') return null;
    fail(error?.code === 'ENOENT' ? 'NOT_FOUND' : 'UNSAFE_STORAGE', { cause: error });
  }
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maximum) fail('UNSAFE_STORAGE');
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

async function readJson(target, options) {
  const source = await readRegular(target, options);
  if (source === null) return null;
  try {
    const value = JSON.parse(source);
    if (!isObject(value)) fail('UNSAFE_STORAGE');
    return value;
  } catch (error) {
    if (error instanceof PilotMeasurementError) throw error;
    fail('UNSAFE_STORAGE', { cause: error });
  }
}

async function directoryState(target) {
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isDirectory()) fail('UNSAFE_STORAGE');
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    if (error instanceof PilotMeasurementError) throw error;
    fail('UNSAFE_STORAGE', { cause: error });
  }
}

function asText(value) {
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value ?? '');
}

async function gitCall(runner, cwd, args, allowed = [0]) {
  if (typeof runner !== 'function') fail('UNSAFE_RUNTIME_ROOT');
  const result = await runner({ executable: 'git', args: ['-C', cwd, ...args], cwd });
  if (result?.error || !allowed.includes(result?.status)) fail('UNSAFE_RUNTIME_ROOT');
  return asText(result.stdout).trim();
}

async function repositoryGuard(input, deps, { mutation = false } = {}) {
  if (!path.isAbsolute(input.runtimeStateRoot) || !path.isAbsolute(input.repositoryIdentity)) {
    fail('INVALID_PAYLOAD');
  }
  let root;
  let identity;
  try {
    root = await realpath(input.runtimeStateRoot);
    if (!(await stat(root)).isDirectory()) fail('UNSAFE_RUNTIME_ROOT');
    const top = await realpath(await gitCall(deps.runner, root, ['rev-parse', '--show-toplevel']));
    if (top !== root) fail('UNSAFE_RUNTIME_ROOT');
    const common = await gitCall(deps.runner, root, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]);
    identity = await realpath(common);
    if (identity !== (await realpath(input.repositoryIdentity))) fail('UNSAFE_RUNTIME_ROOT');
  } catch (error) {
    if (error instanceof PilotMeasurementError) throw error;
    fail('UNSAFE_RUNTIME_ROOT', { cause: error });
  }
  const tracked = await gitCall(deps.runner, root, ['ls-files', '--', '.effective-flow/']);
  if (tracked !== '') fail('UNSAFE_RUNTIME_ROOT');
  for (const target of ['.effective-flow', '.effective-flow/model-tiering-pilot']) {
    await gitCall(deps.runner, root, ['check-ignore', '--no-index', '-q', '--', target], [0]);
  }
  if (mutation) {
    const memory = await readJson(path.join(root, '.effective-flow', 'memory.json'), {
      maximum: 1024 * 1024,
    });
    if (memory?.runtimeMigration?.directory?.version !== 1) fail('MIGRATION_REQUIRED');
  }
  return {
    root,
    repositoryIdentity: identity,
    runtimeDirectory: path.join(root, '.effective-flow'),
    namespace: path.join(root, '.effective-flow', 'model-tiering-pilot'),
  };
}

async function guardedMkdir(context, target, deps) {
  await repositoryGuard(context.input, deps, { mutation: true });
  const parent = path.dirname(target);
  if (!(target === context.runtimeDirectory || (await directoryState(parent))))
    fail('UNSAFE_STORAGE');
  try {
    await mkdir(target, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== 'EEXIST') fail('WRITE_FAILED', { cause: error });
  }
  if (!(await directoryState(target))) fail('UNSAFE_STORAGE');
  await chmod(target, 0o700);
}

async function syncDirectory(context, target, deps) {
  await repositoryGuard(context.input, deps, { mutation: true });
  let handle;
  try {
    handle = await open(target, fsConstants.O_RDONLY | O_NOFOLLOW);
    if (!(await handle.stat()).isDirectory()) fail('UNSAFE_STORAGE');
    await handle.sync();
  } catch (error) {
    if (error instanceof PilotMeasurementError) throw error;
    fail('WRITE_FAILED', { cause: error });
  } finally {
    await handle?.close();
  }
}

async function writeExclusiveJson(context, target, value, deps) {
  await repositoryGuard(context.input, deps, { mutation: true });
  let handle;
  try {
    handle = await open(target, WRITE_FLAGS, 0o600);
    await handle.writeFile(`${canonicalizeJson(value)}\n`, 'utf8');
    await handle.sync();
  } catch (error) {
    if (error?.code === 'EEXIST') fail('INVALID_STATE', { cause: error });
    fail('WRITE_FAILED', { cause: error });
  } finally {
    await handle?.close();
  }
  await chmod(target, 0o600);
  await syncDirectory(context, path.dirname(target), deps);
}

async function validateNamespaceStaging(target) {
  const entries = await safeEntries(target);
  const names = new Set(entries.map(({ name }) => name));
  if ([...names].some((name) => !['owner.json', 'generations', 'tombstones'].includes(name))) {
    fail('UNSAFE_STORAGE');
  }
  const owner = await readJson(path.join(target, 'owner.json'), { missing: true });
  if (owner === null) {
    if (entries.length !== 0) fail('UNSAFE_STORAGE');
    return false;
  }
  if (canonicalizeJson(owner) !== canonicalizeJson(OWNER)) fail('UNSAFE_STORAGE');
  for (const name of ['generations', 'tombstones']) {
    if (!names.has(name)) continue;
    if (!(await directoryState(path.join(target, name)))) fail('UNSAFE_STORAGE');
    if ((await safeEntries(path.join(target, name))).length !== 0) fail('UNSAFE_STORAGE');
  }
  return names.has('generations') && names.has('tombstones');
}

async function publishNamespace(context, deps) {
  const staging = path.join(
    context.runtimeDirectory,
    `.model-tiering-pilot-staging-${randomOpaque(deps, 24)}`,
  );
  await guardedMkdir(context, staging, deps);
  try {
    await writeExclusiveJson(context, path.join(staging, 'owner.json'), OWNER, deps);
    for (const name of ['generations', 'tombstones']) {
      await guardedMkdir(context, path.join(staging, name), deps);
    }
    await syncDirectory(context, staging, deps);
    await repositoryGuard(context.input, deps, { mutation: true });
    if (await pathExists(context.namespace)) fail('INVALID_STATE');
    await rename(staging, context.namespace);
    await chmod(context.namespace, 0o700);
    await syncDirectory(context, context.runtimeDirectory, deps);
  } catch (error) {
    if (error instanceof PilotMeasurementError && error.code === 'INVALID_STATE') {
      const owner = await readJson(path.join(context.namespace, 'owner.json'), { missing: true });
      if (owner !== null && canonicalizeJson(owner) === canonicalizeJson(OWNER)) {
        await repositoryGuard(context.input, deps, { mutation: true });
        await rm(staging, { recursive: true, force: false }).catch(() => {});
        return;
      }
    }
    throw error;
  }
}

function validateNamespaceInitializationLock(value) {
  exactObject(value, ['schema', 'operation', 'ownerPid', 'nonce']);
  if (
    value.schema !== 1 ||
    value.operation !== 'initialize-namespace' ||
    !Number.isSafeInteger(value.ownerPid) ||
    value.ownerPid <= 0 ||
    !OPAQUE.test(value.nonce)
  ) {
    fail('UNSAFE_STORAGE');
  }
  return value;
}

async function withNamespaceInitializationLock(context, deps, action) {
  const target = path.join(context.runtimeDirectory, '.model-tiering-pilot.init.lock');
  const existingIdentity = await lstat(target).catch((error) =>
    error?.code === 'ENOENT' ? null : Promise.reject(error),
  );
  if (existingIdentity !== null) {
    if (!existingIdentity.isFile() || existingIdentity.isSymbolicLink()) fail('UNSAFE_STORAGE');
    const before = await readRegular(target, { maximum: 16 * 1024 });
    const existing = validateNamespaceInitializationLock(JSON.parse(before));
    if (probePid(existing.ownerPid, deps) !== 'stale-provable') fail('LOCKED');
    await repositoryGuard(context.input, deps, { mutation: true });
    const checked = await lstat(target);
    const current = await readRegular(target, { maximum: 16 * 1024 });
    if (
      checked.dev !== existingIdentity.dev ||
      checked.ino !== existingIdentity.ino ||
      current !== before
    ) {
      fail('STALE_REVIEW');
    }
    await unlink(target).catch((error) => fail('WRITE_FAILED', { cause: error }));
    await syncDirectory(context, context.runtimeDirectory, deps);
  }
  const value = {
    schema: 1,
    operation: 'initialize-namespace',
    ownerPid: process.pid,
    nonce: randomOpaque(deps, 24),
  };
  await atomicWrite(context, target, value, 'namespace-init-lock', 'namespace', deps, undefined, {
    noReplace: true,
    existsCode: 'LOCKED',
  });
  await syncDirectory(context, context.runtimeDirectory, deps);
  try {
    return await action();
  } finally {
    const current = validateNamespaceInitializationLock(await readJson(target));
    if (current.nonce !== value.nonce || current.ownerPid !== process.pid) fail('LOCKED');
    await repositoryGuard(context.input, deps, { mutation: true });
    await unlink(target).catch((error) => fail('WRITE_FAILED', { cause: error }));
    await syncDirectory(context, context.runtimeDirectory, deps);
  }
}

async function ensureNamespace(input, deps) {
  const context = { ...(await repositoryGuard(input, deps, { mutation: true })), input };
  if (!(await directoryState(context.runtimeDirectory))) fail('MIGRATION_REQUIRED');
  if (!(await directoryState(context.namespace))) {
    await withNamespaceInitializationLock(context, deps, async () => {
      if (await directoryState(context.namespace)) return;
      const stagingEntries = (await safeEntries(context.runtimeDirectory)).filter(({ name }) =>
        NAMESPACE_STAGING.test(name),
      );
      for (const entry of stagingEntries) {
        if (!entry.isDirectory()) fail('UNSAFE_STORAGE');
        const staging = path.join(context.runtimeDirectory, entry.name);
        const complete = await validateNamespaceStaging(staging);
        if (!complete) {
          await repositoryGuard(input, deps, { mutation: true });
          await rm(staging, { recursive: true, force: false }).catch((error) =>
            fail('WRITE_FAILED', { cause: error }),
          );
          await syncDirectory(context, context.runtimeDirectory, deps);
          continue;
        }
        await repositoryGuard(input, deps, { mutation: true });
        try {
          await rename(staging, context.namespace);
          await syncDirectory(context, context.runtimeDirectory, deps);
        } catch (error) {
          if (error?.code !== 'EEXIST' && error?.code !== 'ENOTEMPTY') {
            fail('WRITE_FAILED', { cause: error });
          }
        }
        break;
      }
      if (!(await directoryState(context.namespace))) await publishNamespace(context, deps);
    });
  }
  const ownerPath = path.join(context.namespace, 'owner.json');
  const existing = await readJson(ownerPath, { missing: true });
  if (existing === null || canonicalizeJson(existing) !== canonicalizeJson(OWNER)) {
    fail('UNSAFE_STORAGE');
  }
  await chmod(context.namespace, 0o700);
  for (const name of ['generations', 'tombstones']) {
    const target = path.join(context.namespace, name);
    if (!(await directoryState(target))) await guardedMkdir(context, target, deps);
  }
  return { ...context, exists: true };
}

async function withNamespaceLock(context, operation, deps, action) {
  const target = path.join(context.namespace, 'generation.lock');
  const nonce = randomOpaque(deps, 24);
  const value = {
    schema: 1,
    operation,
    generationId: 'namespace',
    ownerPid: process.pid,
    nonce,
  };
  await atomicWrite(context, target, value, 'namespace-lock', 'namespace', deps, undefined, {
    noReplace: true,
    existsCode: 'LOCKED',
  });
  await syncDirectory(context, context.namespace, deps);
  const previous = context.activeLock;
  context.activeLock = value;
  try {
    return await action();
  } finally {
    context.activeLock = previous;
    const current = await readJson(target, { missing: true });
    if (current?.nonce !== nonce || current.ownerPid !== process.pid) fail('LOCKED');
    await repositoryGuard(context.input, deps, { mutation: true });
    await unlink(target).catch((error) => fail('WRITE_FAILED', { cause: error }));
    await syncDirectory(context, context.namespace, deps);
  }
}

function validateNamespaceLockRecord(value) {
  exactObject(value, ['schema', 'operation', 'generationId', 'ownerPid', 'nonce']);
  if (
    value.schema !== 1 ||
    value.operation !== 'begin-baseline' ||
    value.generationId !== 'namespace' ||
    !Number.isSafeInteger(value.ownerPid) ||
    value.ownerPid <= 0 ||
    !OPAQUE.test(value.nonce)
  ) {
    fail('UNSAFE_STORAGE');
  }
  return value;
}

async function recoverNamespaceLock(context, deps) {
  const target = path.join(context.namespace, 'generation.lock');
  const identity = await lstat(target).catch((error) =>
    error?.code === 'ENOENT' ? null : Promise.reject(error),
  );
  if (identity === null) return false;
  if (!identity.isFile() || identity.isSymbolicLink()) fail('UNSAFE_STORAGE');
  const before = await readRegular(target, { maximum: 16 * 1024 });
  let lock = null;
  try {
    lock = validateNamespaceLockRecord(JSON.parse(before));
  } catch (error) {
    if (!(error instanceof PilotMeasurementError) && !(error instanceof SyntaxError)) throw error;
  }
  if (lock !== null && probePid(lock.ownerPid, deps) !== 'stale-provable') fail('LOCKED');
  await repositoryGuard(context.input, deps, { mutation: true });
  const checked = await lstat(target).catch((error) =>
    error?.code === 'ENOENT' ? fail('STALE_REVIEW') : Promise.reject(error),
  );
  const current = await readRegular(target, { maximum: 16 * 1024 });
  if (checked.dev !== identity.dev || checked.ino !== identity.ino || current !== before) {
    fail('STALE_REVIEW');
  }
  await unlink(target).catch((error) => fail('WRITE_FAILED', { cause: error }));
  await syncDirectory(context, context.namespace, deps);
  return true;
}

async function inspectNamespace(input, deps) {
  const context = { ...(await repositoryGuard(input, deps)), input };
  if (!(await directoryState(context.namespace))) return { ...context, exists: false };
  const owner = await readJson(path.join(context.namespace, 'owner.json'));
  if (canonicalizeJson(owner) !== canonicalizeJson(OWNER)) fail('UNSAFE_STORAGE');
  return { ...context, exists: true };
}

function generationPath(context, generationId) {
  opaque(generationId);
  return path.join(context.namespace, 'generations', generationId);
}

async function regularFileSize(target, { missing = false } = {}) {
  const info = await lstat(target).catch((error) =>
    missing && error?.code === 'ENOENT' ? null : Promise.reject(error),
  );
  if (info === null) return null;
  if (info.isSymbolicLink() || !info.isFile()) fail('UNSAFE_STORAGE');
  return info.size;
}

async function rawTreeBytes(root) {
  let total = 0;
  async function visit(directory) {
    for (const entry of await safeEntries(directory)) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else {
        total += await regularFileSize(target);
        if (!Number.isSafeInteger(total)) fail('CAPACITY_EXHAUSTED');
      }
    }
  }
  await visit(root);
  return total;
}

function capacityControlWrite(operation) {
  return ['suspend', 'capacity-exhausted', 'evidence-gap'].includes(operation);
}

async function atomicWrite(
  context,
  target,
  value,
  operation,
  generationId,
  deps,
  maximum,
  { noReplace = false, existsCode = 'INVALID_STATE', skipCapacity = false } = {},
) {
  const body = `${canonicalizeJson(value)}\n`;
  const bodyBytes = Buffer.byteLength(body);
  if (maximum !== undefined && bodyBytes > maximum) fail('CAPACITY_EXHAUSTED');
  const ownerNonce = context.activeLock?.nonce ?? randomOpaque(deps, 24);
  const nonce = randomOpaque(deps, 12);
  const temporary = path.join(
    path.dirname(target),
    `.tmp-${token(operation)}-${generationId === 'namespace' ? 'namespace' : opaque(generationId)}-${ownerNonce}-${nonce}`,
  );
  await repositoryGuard(context.input, deps, { mutation: true });
  let handle;
  try {
    handle = await open(temporary, WRITE_FLAGS, 0o600);
    await handle.truncate(bodyBytes);
    await handle.writeFile(body, 'utf8');
    await handle.sync();
  } catch (error) {
    try {
      await handle?.close();
      await unlink(temporary);
    } catch {}
    fail('WRITE_FAILED', { cause: error });
  } finally {
    await handle?.close();
  }
  if (generationId !== 'namespace' && !skipCapacity && !capacityControlWrite(operation)) {
    const root = generationPath(context, generationId);
    const replacedBytes = (await regularFileSize(target, { missing: true })) ?? 0;
    const projectedBytes = (await rawTreeBytes(root)) - replacedBytes;
    if (projectedBytes > PILOT_MEASUREMENT_PROTOCOL.limits.maxRawGenerationBytes) {
      await repositoryGuard(context.input, deps, { mutation: true });
      await unlink(temporary).catch(() => {});
      fail('CAPACITY_EXHAUSTED');
    }
  }
  await repositoryGuard(context.input, deps, { mutation: true });
  try {
    if (noReplace) {
      await link(temporary, target);
      await unlink(temporary);
    } else {
      await rename(temporary, target);
    }
    await chmod(target, 0o600);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    if (noReplace && error?.code === 'EEXIST') fail(existsCode, { cause: error });
    fail('WRITE_FAILED', { cause: error });
  }
}

async function acquireLock(context, generationId, operation, deps, lockName = 'lifecycle.lock') {
  const locks = path.join(generationPath(context, generationId), 'locks');
  if (!(await directoryState(locks))) await guardedMkdir(context, locks, deps);
  if (lockName !== 'lifecycle.lock' && !/^packet-[A-Za-z0-9_-]{32,128}\.lock$/.test(lockName)) {
    fail('INVALID_PAYLOAD');
  }
  const classifyLocks = async () => {
    const entries = await safeEntries(locks);
    const lockNames = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.startsWith('.tmp-')) continue;
      if (
        !entry.isFile() ||
        (entry.name !== 'lifecycle.lock' &&
          !/^packet-[A-Za-z0-9_-]{32,128}\.lock$/.test(entry.name))
      ) {
        fail('UNSAFE_STORAGE');
      }
      lockNames.push(entry.name);
    }
    return lockNames;
  };
  const before = await classifyLocks();
  if (
    (lockName === 'lifecycle.lock' && before.length > 0) ||
    (lockName !== 'lifecycle.lock' && before.includes('lifecycle.lock'))
  ) {
    fail('LOCKED');
  }
  const target = path.join(locks, lockName);
  const nonce = randomOpaque(deps, 24);
  const value = { schema: 1, operation, generationId, ownerPid: process.pid, nonce };
  await repositoryGuard(context.input, deps, { mutation: true });
  let handle;
  try {
    handle = await open(target, WRITE_FLAGS, 0o600);
    await handle.writeFile(`${canonicalizeJson(value)}\n`, 'utf8');
    await handle.sync();
  } catch (error) {
    if (error?.code === 'EEXIST') fail('LOCKED');
    fail('WRITE_FAILED', { cause: error });
  } finally {
    await handle?.close();
  }
  const after = await classifyLocks();
  const conflicts =
    lockName === 'lifecycle.lock'
      ? after.some((name) => name !== lockName)
      : after.includes('lifecycle.lock');
  if (conflicts) {
    const current = await readJson(target, { missing: true });
    if (current?.nonce === nonce && current.ownerPid === process.pid) {
      await repositoryGuard(context.input, deps, { mutation: true });
      await unlink(target).catch(() => {});
    }
    fail('LOCKED');
  }
  return { target, nonce, value, lockName };
}

function validateLockRecord(value, generationId, lockName) {
  exactObject(value, ['schema', 'operation', 'generationId', 'ownerPid', 'nonce']);
  const packetLock = /^packet-([A-Za-z0-9_-]{32,128})\.lock$/.exec(lockName);
  if (
    value.schema !== 1 ||
    value.generationId !== generationId ||
    !Number.isSafeInteger(value.ownerPid) ||
    value.ownerPid <= 0 ||
    !OPAQUE.test(value.nonce) ||
    (lockName === 'lifecycle.lock'
      ? !LIFECYCLE_LOCK_OPERATIONS.has(value.operation)
      : packetLock === null || !['start-packet', 'finish-packet'].includes(value.operation))
  ) {
    fail('UNSAFE_STORAGE');
  }
  return value;
}

async function assertNoGenerationLocks(root, generationId) {
  for (const entry of await safeEntries(path.join(root, 'locks'))) {
    if (
      !entry.isFile() ||
      (entry.name !== 'lifecycle.lock' && !/^packet-[A-Za-z0-9_-]{32,128}\.lock$/.test(entry.name))
    ) {
      fail('UNSAFE_STORAGE');
    }
    validateLockRecord(
      await readJson(path.join(root, 'locks', entry.name)),
      generationId,
      entry.name,
    );
    fail('LOCKED');
  }
}

async function releaseLock(context, lock, deps) {
  if (
    ['purge', 'discard-generation'].includes(lock.value.operation) &&
    !(await directoryState(generationPath(context, lock.value.generationId)))
  ) {
    return;
  }
  const current = await readJson(lock.target, { missing: true });
  if (current === null) fail('LOCKED');
  if (current.nonce !== lock.nonce || current.ownerPid !== process.pid) fail('LOCKED');
  await repositoryGuard(context.input, deps, { mutation: true });
  await unlink(lock.target).catch((error) => fail('WRITE_FAILED', { cause: error }));
}

async function withLock(context, generationId, operation, deps, action) {
  const lock = await acquireLock(context, generationId, operation, deps);
  const previous = context.activeLock;
  context.activeLock = lock.value;
  let completed = false;
  let result;
  try {
    result = await action();
    completed = true;
  } finally {
    if (
      completed &&
      ['purge', 'discard-generation'].includes(operation) &&
      (await directoryState(generationPath(context, generationId)))
    ) {
      await repositoryGuard(context.input, deps, { mutation: true });
      await rm(generationPath(context, generationId), { recursive: true, force: false }).catch(
        (error) => fail('WRITE_FAILED', { cause: error }),
      );
    }
    context.activeLock = previous;
    await releaseLock(context, lock, deps);
  }
  return result;
}

async function withPacketLock(context, generationId, packetId, operation, deps, action) {
  opaque(packetId);
  const lock = await acquireLock(context, generationId, operation, deps, `packet-${packetId}.lock`);
  const previous = context.activeLock;
  context.activeLock = lock.value;
  try {
    return await action();
  } finally {
    context.activeLock = previous;
    await releaseLock(context, lock, deps);
  }
}

function validatePersistedState(state, generationId) {
  exactObject(state, [
    'schema',
    'kind',
    'generationId',
    'protocolVersion',
    'protocolDigest',
    'generationState',
    'baselineStartedAt',
    'activatedAt',
    'reviewStartedAt',
    'nextWorkflowOrdinal',
    'nextObservationOrdinal',
  ]);
  if (
    state.schema !== STATE_SCHEMA ||
    state.kind !== 'pilot-generation-state' ||
    state.generationId !== generationId ||
    state.protocolVersion !== PILOT_MEASUREMENT_PROTOCOL_VERSION ||
    state.protocolDigest !== PILOT_MEASUREMENT_PROTOCOL_DIGEST ||
    !PILOT_MEASUREMENT_POLICY_PROJECTION.generationStates.includes(state.generationState) ||
    state.generationState === 'none' ||
    !Number.isSafeInteger(state.nextWorkflowOrdinal) ||
    state.nextWorkflowOrdinal < 1 ||
    !Number.isSafeInteger(state.nextObservationOrdinal) ||
    state.nextObservationOrdinal < 1 ||
    Number.isNaN(Date.parse(state.baselineStartedAt)) ||
    (state.activatedAt !== null && Number.isNaN(Date.parse(state.activatedAt))) ||
    (state.reviewStartedAt !== null && Number.isNaN(Date.parse(state.reviewStartedAt)))
  ) {
    fail('UNSAFE_STORAGE');
  }
  return state;
}

function validatePersistedSuspension(value, generationId) {
  exactObject(value, [
    'schema',
    'kind',
    'generationId',
    'status',
    'resumeTo',
    'reasons',
    'affectedRecordIds',
  ]);
  const allowedReasons = PILOT_MEASUREMENT_POLICY_PROJECTION.pilotControlMappings
    .map(({ suspensionReason }) => suspensionReason)
    .filter((reason) => reason !== 'none');
  if (
    value.schema !== 1 ||
    value.kind !== 'pilot-suspension' ||
    value.generationId !== generationId ||
    value.status !== 'suspended' ||
    !['baseline', 'active'].includes(value.resumeTo) ||
    !Array.isArray(value.reasons) ||
    value.reasons.length === 0 ||
    value.reasons.some((reason) => !allowedReasons.includes(reason)) ||
    new Set(value.reasons).size !== value.reasons.length ||
    !Array.isArray(value.affectedRecordIds) ||
    value.affectedRecordIds.some((id) => !OPAQUE.test(id)) ||
    new Set(value.affectedRecordIds).size !== value.affectedRecordIds.length
  ) {
    fail('UNSAFE_STORAGE');
  }
  return value;
}

async function transitionMarker(root) {
  const marker = await readJson(path.join(root, 'suspension-transition.json'), { missing: true });
  if (marker === null) return null;
  exactObject(
    marker,
    ['schema', 'kind', 'generationId', 'operation', 'ownerNonce'],
    ['expectedInventoryDigest', 'expectedSuspensionDigest', 'resumeTo'],
  );
  if (
    marker.schema !== 1 ||
    marker.kind !== 'suspension-transition' ||
    !['suspend', 'resume', 'evidence-gap', 'capacity-exhausted'].includes(marker.operation) ||
    !OPAQUE.test(marker.generationId) ||
    !OPAQUE.test(marker.ownerNonce) ||
    (marker.expectedInventoryDigest !== undefined &&
      !DIGEST.test(marker.expectedInventoryDigest)) ||
    (marker.expectedSuspensionDigest !== undefined &&
      !DIGEST.test(marker.expectedSuspensionDigest)) ||
    (marker.resumeTo !== undefined && !['baseline', 'active'].includes(marker.resumeTo))
  ) {
    fail('UNSAFE_STORAGE');
  }
  return marker;
}

async function beginTransition(context, root, generationId, operation, deps, extra = {}) {
  const current = await transitionMarker(root);
  if (current !== null) {
    const comparable = { ...current };
    delete comparable.ownerNonce;
    const requested = {
      schema: 1,
      kind: 'suspension-transition',
      generationId,
      operation,
      ...extra,
    };
    if (canonicalizeJson(comparable) !== canonicalizeJson(requested)) fail('INVALID_STATE');
    return current;
  }
  const marker = {
    schema: 1,
    kind: 'suspension-transition',
    generationId,
    operation,
    ownerNonce: context.activeLock?.nonce ?? randomOpaque(deps, 24),
    ...extra,
  };
  await atomicWrite(
    context,
    path.join(root, 'suspension-transition.json'),
    marker,
    operation,
    generationId,
    deps,
  );
  return marker;
}

async function clearTransition(context, root, marker, deps) {
  const target = path.join(root, 'suspension-transition.json');
  const current = await readJson(target);
  if (canonicalDigest(current) !== canonicalDigest(marker)) fail('INVALID_STATE');
  const identity = await lstat(target);
  await repositoryGuard(context.input, deps, { mutation: true });
  const checked = await lstat(target);
  if (identity.dev !== checked.dev || identity.ino !== checked.ino) fail('INVALID_STATE');
  await unlink(target).catch((error) => fail('WRITE_FAILED', { cause: error }));
}

function assertEvidenceHealthy(context, evidence) {
  const currentNonce = context.activeLock?.nonce;
  if (
    evidence.invalidMembers.length > 0 ||
    evidence.incompleteRecords.length > 0 ||
    evidence.incompleteTimings.length > 0 ||
    evidence.incompleteObservations.length > 0 ||
    evidence.orphanTemporaries.length > 0
  ) {
    fail('INCOMPLETE_EVIDENCE');
  }
  if (evidence.locks.some(({ nonce }) => nonce !== currentNonce)) fail('UNSAFE_STORAGE');
}

async function assertAdmissionOpen(context, evidence) {
  const transition = await transitionMarker(evidence.root);
  if (
    evidence.suspension !== null ||
    transition !== null ||
    !['baseline', 'active'].includes(evidence.state.generationState)
  ) {
    fail('INVALID_STATE');
  }
  assertEvidenceHealthy(context, evidence);
}

async function loadState(context, generationId) {
  const root = generationPath(context, generationId);
  if (!(await directoryState(root))) fail('NOT_FOUND');
  const state = await readJson(path.join(root, 'state.json'));
  try {
    return { root, state: validatePersistedState(state, generationId) };
  } catch (error) {
    if (error instanceof PilotMeasurementError && error.code === 'PROTOCOL_DRIFT') throw error;
    fail('UNSAFE_STORAGE', { cause: error });
  }
}

function commonInput(input, extraRequired = [], optional = []) {
  exactObject(
    input,
    ['runtimeStateRoot', 'repositoryIdentity', 'generationId', ...extraRequired],
    optional,
  );
  stringValue(input.runtimeStateRoot, 4096);
  stringValue(input.repositoryIdentity, 4096);
  opaque(input.generationId);
  return input;
}

function baseResult(operation, result) {
  return { ok: true, operation, protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST, result };
}

export function errorEnvelope(operation, error) {
  const normalized =
    error instanceof PilotMeasurementError
      ? error
      : new PilotMeasurementError('WRITE_FAILED', { cause: error });
  const envelope = {
    ok: false,
    operation: PILOT_MEASUREMENT_OPERATIONS.includes(operation) ? operation : null,
    error: { code: normalized.code, message: normalized.message, exitCode: normalized.exitCode },
  };
  if (normalized.pilotControlOutcome !== undefined) {
    envelope.pilotControlOutcome = normalized.pilotControlOutcome;
    envelope.controlStatePersisted = normalized.controlStatePersisted;
    envelope.alert = normalized.alert;
  }
  return envelope;
}

function nowMs(deps) {
  const value = (deps.nowMs ?? Date.now)();
  if (!Number.isSafeInteger(value) || value < 0) fail('WRITE_FAILED');
  return value;
}

function nowIso(deps) {
  return new Date(nowMs(deps)).toISOString();
}

async function ensureGenerationDirectories(context, generationId, deps) {
  const root = path.join(
    context.namespace,
    'generations',
    `.staging-${generationId}-${context.activeLock?.nonce ?? randomOpaque(deps, 24)}`,
  );
  await repositoryGuard(context.input, deps, { mutation: true });
  try {
    await mkdir(root, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') return null;
    fail('WRITE_FAILED', { cause: error });
  }
  if (!(await directoryState(root))) fail('UNSAFE_STORAGE');
  for (const name of ['records', 'traces', 'gate-observations', 'summaries', 'locks']) {
    await guardedMkdir(context, path.join(root, name), deps);
  }
  return root;
}

function initialGenerationState(generationId, deps) {
  return {
    schema: STATE_SCHEMA,
    kind: 'pilot-generation-state',
    generationId,
    protocolVersion: PILOT_MEASUREMENT_PROTOCOL_VERSION,
    protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
    generationState: 'baseline',
    baselineStartedAt: nowIso(deps),
    activatedAt: null,
    reviewStartedAt: null,
    nextWorkflowOrdinal: 1,
    nextObservationOrdinal: 1,
  };
}

async function inspectGenerationInitialization(root, generationId) {
  const expectedDirectories = new Set([
    'records',
    'traces',
    'gate-observations',
    'summaries',
    'locks',
  ]);
  let state = null;
  const presentDirectories = new Set();
  let temporaryCount = 0;
  for (const entry of await safeEntries(root)) {
    if (entry.isDirectory() && expectedDirectories.has(entry.name)) {
      presentDirectories.add(entry.name);
      continue;
    }
    if (entry.isFile() && entry.name === 'state.json') {
      state = validatePersistedState(await readJson(path.join(root, entry.name)), generationId);
      continue;
    }
    if (
      entry.isFile() &&
      new RegExp(
        `^\\.tmp-begin-baseline-${escapedRegExp(generationId)}-[A-Za-z0-9_-]{32,128}-[A-Za-z0-9_-]{16}$`,
      ).test(entry.name)
    ) {
      temporaryCount += 1;
      continue;
    }
    fail('UNSAFE_STORAGE');
  }
  if (state === null) {
    for (const name of presentDirectories) {
      if ((await safeEntries(path.join(root, name))).length !== 0) fail('UNSAFE_STORAGE');
    }
    return null;
  }
  if (
    state.generationState !== 'baseline' ||
    state.activatedAt !== null ||
    state.reviewStartedAt !== null ||
    state.nextWorkflowOrdinal !== 1 ||
    state.nextObservationOrdinal !== 1
  ) {
    fail('INVALID_STATE');
  }
  for (const name of expectedDirectories) {
    if (!(await directoryState(path.join(root, name)))) fail('UNSAFE_STORAGE');
  }
  if (temporaryCount !== 0) fail('UNSAFE_STORAGE');
  return state;
}

async function recoverGenerationInitialization(context, deps) {
  const generations = path.join(context.namespace, 'generations');
  const complete = [];
  for (const entry of await safeEntries(generations)) {
    const staging = GENERATION_STAGING.exec(entry.name);
    const generationId = staging?.[1] ?? (OPAQUE.test(entry.name) ? entry.name : null);
    if (!entry.isDirectory() || generationId === null) fail('UNSAFE_STORAGE');
    const target = path.join(generations, entry.name);
    const state = await inspectGenerationInitialization(target, generationId);
    if (state === null) {
      await repositoryGuard(context.input, deps, { mutation: true });
      await rm(target, { recursive: true, force: false }).catch((error) =>
        fail('WRITE_FAILED', { cause: error }),
      );
      await syncDirectory(context, generations, deps);
      continue;
    }
    if (staging !== null) {
      const published = generationPath(context, generationId);
      if (await pathExists(published)) fail('INVALID_STATE');
      await repositoryGuard(context.input, deps, { mutation: true });
      await rename(target, published).catch((error) => fail('WRITE_FAILED', { cause: error }));
      await syncDirectory(context, generations, deps);
      complete.push({ generationId, state });
    } else {
      complete.push({ generationId, state });
    }
  }
  if (complete.length > 1) fail('INVALID_STATE');
  return complete[0] ?? null;
}

function countBySuffix(entries, suffix) {
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(suffix)).length;
}

async function safeEntries(directory, { missing = false } = {}) {
  if (!(await directoryState(directory))) {
    if (missing) return [];
    fail('NOT_FOUND');
  }
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) fail('UNSAFE_STORAGE');
  }
  return entries;
}

async function fileDigest(target) {
  return (await rawFileDigest(target, PILOT_MEASUREMENT_PROTOCOL.limits.maxRawGenerationBytes))
    .digest;
}

async function rawFileDigest(target, maximum) {
  let handle;
  try {
    handle = await open(target, READ_FLAGS);
    const info = await handle.stat();
    if (!info.isFile() || info.size > maximum) fail('CAPACITY_EXHAUSTED');
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let offset = 0;
    while (offset < info.size) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, info.size - offset),
        offset,
      );
      if (bytesRead === 0) fail('UNSAFE_STORAGE');
      hash.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
    return { bytes: info.size, digest: `sha256:${hash.digest('hex')}` };
  } catch (error) {
    if (error instanceof PilotMeasurementError) throw error;
    fail('UNSAFE_STORAGE', { cause: error });
  } finally {
    await handle?.close();
  }
}

function incompleteStoredValue(action) {
  try {
    return action();
  } catch (error) {
    if (error instanceof PilotMeasurementError) {
      fail('INCOMPLETE_EVIDENCE', { cause: error });
    }
    throw error;
  }
}

async function readEvidenceJson(target, options) {
  try {
    return await readJson(target, options);
  } catch (error) {
    if (error instanceof PilotMeasurementError && error.code === 'CAPACITY_EXHAUSTED') throw error;
    fail('INCOMPLETE_EVIDENCE', { cause: error });
  }
}

function validateStoredDuration(value) {
  if (!isObject(value)) fail('INVALID_PAYLOAD');
  if (value.status === 'unavailable') {
    exactObject(value, ['status']);
    return value;
  }
  exactObject(value, ['status', 'milliseconds']);
  if (value.status !== 'available') fail('INVALID_PAYLOAD');
  integer(value.milliseconds, PILOT_MEASUREMENT_PROTOCOL.limits.maxDurationMs);
  return value;
}

function validateStoredCost(value) {
  if (!isObject(value)) fail('INVALID_PAYLOAD');
  if (value.status === 'unavailable') {
    exactObject(value, ['status']);
    return value;
  }
  exactObject(value, ['status', 'kind', 'unit', 'value']);
  if (value.status !== 'available') fail('INVALID_PAYLOAD');
  validateCostProxy({ kind: value.kind, unit: value.unit, value: value.value });
  return value;
}

function validateStoredReservationPacket(value, generationState) {
  exactObject(value, [
    'packetId',
    'selectedProfile',
    'wouldBeFastEligible',
    'gate',
    'packetCapabilityHash',
  ]);
  opaque(value.packetId);
  digestValue(value.packetCapabilityHash);
  const packet = validatePacketReservation({
    selectedProfile: value.selectedProfile,
    wouldBeFastEligible: value.wouldBeFastEligible,
    gate: value.gate,
  });
  assertPacketPolicy(packet, generationState);
  return value;
}

function validateStoredFinalPacket(value, generationState) {
  exactObject(value, [
    'packetId',
    'selectedProfile',
    'wouldBeFastEligible',
    'firstGateReason',
    'implementationDuration',
    'fallback',
    'escalated',
    'costProxy',
  ]);
  opaque(value.packetId);
  const firstReason =
    value.firstGateReason === null
      ? null
      : enumValue(value.firstGateReason, PILOT_MEASUREMENT_POLICY_PROJECTION.gateReasons);
  const eligible = firstReason === null;
  if (booleanValue(value.wouldBeFastEligible) !== eligible) fail('INVALID_PAYLOAD');
  const selectedProfile = enumValue(value.selectedProfile, ['quality', 'fast']);
  assertPacketPolicy(
    {
      selectedProfile,
      wouldBeFastEligible: eligible,
      gate: { eligibility: eligible ? 'eligible' : 'excluded', firstReason },
    },
    generationState,
  );
  validateStoredDuration(value.implementationDuration);
  const fallback = enumValue(value.fallback, PILOT_MEASUREMENT_POLICY_PROJECTION.fallbacks);
  const escalated = booleanValue(value.escalated);
  if (
    (fallback === 'none') !== !escalated ||
    (generationState === 'baseline' && (fallback !== 'none' || escalated)) ||
    (selectedProfile === 'quality' && (fallback !== 'none' || escalated))
  ) {
    fail('INVALID_PAYLOAD');
  }
  validateStoredCost(value.costProxy);
  return value;
}

function validateStoredWorkflow(value, generationId, runId) {
  return incompleteStoredValue(() => {
    const common = [
      'schema',
      'kind',
      'runId',
      'workflowCapabilityHash',
      'generationId',
      'protocolDigest',
      'cohort',
      'configState',
      'generationState',
      'workflow',
      'harnessFamily',
      'ordinal',
      'packets',
    ];
    const reservation = value.kind === 'workflow-reservation';
    exactObject(
      value,
      reservation
        ? common
        : [
            ...common,
            'validation',
            'review',
            'completionStatus',
            'qualityCorrectionRounds',
            'detailTrace',
          ],
    );
    if (
      value.schema !== RECORD_SCHEMA ||
      !['workflow-reservation', 'workflow-record'].includes(value.kind) ||
      value.runId !== runId ||
      value.generationId !== generationId ||
      value.protocolDigest !== PILOT_MEASUREMENT_PROTOCOL_DIGEST
    ) {
      fail('INVALID_PAYLOAD');
    }
    opaque(value.runId);
    digestValue(value.workflowCapabilityHash);
    enumValue(value.cohort, PILOT_MEASUREMENT_PROTOCOL.enums.cohorts);
    enumValue(value.configState, ['enabled']);
    enumValue(value.generationState, ['baseline', 'active']);
    enumValue(value.workflow, PILOT_MEASUREMENT_PROTOCOL.enums.workflows);
    enumValue(value.harnessFamily, PILOT_MEASUREMENT_PROTOCOL.enums.harnessFamilies);
    integer(value.ordinal);
    if (value.ordinal < 1 || !Array.isArray(value.packets) || value.packets.length === 0) {
      fail('INVALID_PAYLOAD');
    }
    if (value.packets.length > PILOT_MEASUREMENT_PROTOCOL.limits.maxPacketsPerWorkflow) {
      fail('CAPACITY_EXHAUSTED');
    }
    for (const packet of value.packets) {
      if (reservation) validateStoredReservationPacket(packet, value.generationState);
      else validateStoredFinalPacket(packet, value.generationState);
    }
    if (new Set(value.packets.map(({ packetId }) => packetId)).size !== value.packets.length) {
      fail('INVALID_PAYLOAD');
    }
    if (value.cohort !== (value.generationState === 'baseline' ? 'baseline' : 'pilot')) {
      fail('INVALID_PAYLOAD');
    }
    if (!reservation) {
      validateValidation(value.validation);
      validateReview(value.review);
      enumValue(value.completionStatus, PILOT_MEASUREMENT_PROTOCOL.enums.completionStatuses);
      integer(value.qualityCorrectionRounds, 10_000);
      booleanValue(value.detailTrace);
    }
    return value;
  });
}

function validateStoredTiming(value, generationId, runId, packetId) {
  return incompleteStoredValue(() => {
    const common = [
      'schema',
      'kind',
      'status',
      'generationId',
      'runId',
      'packetId',
      'packetCapabilityHash',
      'salt',
      'hostFingerprint',
      'startWallMs',
      'startMonotonicNs',
      'startBootEstimateMs',
    ];
    exactObject(
      value,
      value.status === 'finished'
        ? [...common, 'duration', 'finishWallMs', 'finishMonotonicNs', 'finishBootEstimateMs']
        : common,
    );
    if (
      value.schema !== 1 ||
      value.kind !== 'packet-timing-receipt' ||
      !['started', 'finished'].includes(value.status) ||
      value.generationId !== generationId ||
      value.runId !== runId ||
      value.packetId !== packetId
    ) {
      fail('INVALID_PAYLOAD');
    }
    digestValue(value.packetCapabilityHash);
    opaque(value.salt);
    digestValue(value.hostFingerprint);
    integer(value.startWallMs);
    integer(value.startBootEstimateMs);
    if (!/^(?:0|[1-9][0-9]*)$/.test(value.startMonotonicNs)) fail('INVALID_PAYLOAD');
    if (value.status === 'finished') {
      validateStoredDuration(value.duration);
      integer(value.finishWallMs);
      integer(value.finishBootEstimateMs);
      if (!/^(?:0|[1-9][0-9]*)$/.test(value.finishMonotonicNs)) fail('INVALID_PAYLOAD');
    }
    return value;
  });
}

function validateStoredObservation(value, generationId, observationId) {
  return incompleteStoredValue(() => {
    const common = [
      'schema',
      'kind',
      'observationId',
      'capabilityHash',
      'generationId',
      'protocolDigest',
      'cohort',
      'mode',
      'harnessFamily',
      'ordinal',
    ];
    const reservation = value.kind === 'gate-observation-reservation';
    exactObject(
      value,
      reservation
        ? common
        : [
            ...common,
            'terminalOutcome',
            'corrections',
            'checksReported',
            'requiredCheckCount',
            'requiredChecksSatisfied',
          ],
    );
    if (
      value.schema !== OBSERVATION_SCHEMA ||
      !['gate-observation-reservation', 'gate-observation'].includes(value.kind) ||
      value.observationId !== observationId ||
      value.generationId !== generationId ||
      value.protocolDigest !== PILOT_MEASUREMENT_PROTOCOL_DIGEST
    ) {
      fail('INVALID_PAYLOAD');
    }
    digestValue(value.capabilityHash);
    enumValue(value.cohort, PILOT_MEASUREMENT_PROTOCOL.enums.cohorts);
    enumValue(value.mode, PILOT_MEASUREMENT_PROTOCOL.enums.observationModes);
    enumValue(value.harnessFamily, PILOT_MEASUREMENT_PROTOCOL.enums.harnessFamilies);
    integer(value.ordinal);
    if (value.ordinal < 1) fail('INVALID_PAYLOAD');
    if (!reservation) {
      enumValue(value.terminalOutcome, PILOT_MEASUREMENT_PROTOCOL.enums.observationOutcomes);
      exactObject(value.corrections, ['ciRepair', 'configuredReviewer', 'conflictResolution']);
      integer(value.corrections.ciRepair, 10_000);
      integer(value.corrections.configuredReviewer, 10_000);
      integer(value.corrections.conflictResolution, 10_000);
      booleanValue(value.checksReported);
      const requiredCheckCount = unavailableOrInteger(value.requiredCheckCount);
      const requiredChecksSatisfied = unavailableOrBoolean(value.requiredChecksSatisfied);
      if (
        (!value.checksReported &&
          (requiredCheckCount !== 'unavailable' || requiredChecksSatisfied !== 'unavailable')) ||
        (value.checksReported && requiredCheckCount === 'unavailable') ||
        (value.checksReported && requiredChecksSatisfied === 'unavailable')
      ) {
        fail('INVALID_PAYLOAD');
      }
    }
    return value;
  });
}

function escapedRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function temporaryIdentity(name, generationId) {
  const match = new RegExp(
    `^\\.tmp-([a-z0-9-]+)-${escapedRegExp(generationId)}-([A-Za-z0-9_-]{32,128})-([A-Za-z0-9_-]{16})$`,
  ).exec(name);
  if (match === null) fail('INCOMPLETE_EVIDENCE');
  return { operation: match[1], ownerNonce: match[2] };
}

async function evidenceInventory(context, generationId) {
  const { root, state } = await loadState(context, generationId);
  const expectedDirectories = new Set([
    'records',
    'traces',
    'gate-observations',
    'summaries',
    'locks',
  ]);
  const expectedRootFiles = new Set([
    'state.json',
    'suspension.json',
    'suspension-transition.json',
  ]);
  for (const entry of await safeEntries(root)) {
    if (entry.isDirectory() && expectedDirectories.has(entry.name)) continue;
    if (entry.isFile() && (expectedRootFiles.has(entry.name) || entry.name.startsWith('.tmp-'))) {
      continue;
    }
    fail('INCOMPLETE_EVIDENCE');
  }
  for (const name of expectedDirectories) {
    if (!(await directoryState(path.join(root, name)))) fail('UNSAFE_STORAGE');
  }

  const locks = [];
  const locksByNonce = new Map();
  for (const entry of await safeEntries(path.join(root, 'locks'))) {
    if (entry.name.startsWith('.tmp-')) continue;
    if (
      !entry.isFile() ||
      (entry.name !== 'lifecycle.lock' && !/^packet-[A-Za-z0-9_-]{32,128}\.lock$/.test(entry.name))
    ) {
      fail('UNSAFE_STORAGE');
    }
    const target = path.join(root, 'locks', entry.name);
    const lock = await readJson(target);
    incompleteStoredValue(() => validateLockRecord(lock, generationId, entry.name));
    const metadata = { name: entry.name, digest: await fileDigest(target), nonce: lock.nonce };
    if (locksByNonce.has(lock.nonce)) fail('UNSAFE_STORAGE');
    locksByNonce.set(lock.nonce, metadata);
    locks.push(metadata);
  }

  const members = [];
  const invalidMembers = [];
  const orphanTemporaries = [];
  let bytes = 0;
  async function addMember(memberClass, name, target) {
    const raw = await rawFileDigest(
      target,
      PILOT_MEASUREMENT_PROTOCOL.limits.maxRawGenerationBytes - bytes,
    );
    bytes += raw.bytes;
    members.push({ class: memberClass, name, bytes: raw.bytes, digest: raw.digest });
    return raw;
  }
  async function addTemporary(memberClass, entry) {
    if (!entry.isFile()) fail('UNSAFE_STORAGE');
    const identity = temporaryIdentity(entry.name, generationId);
    const target = path.join(root, memberClass === 'root' ? '' : memberClass, entry.name);
    const raw = await addMember('temporary', `${memberClass}/${entry.name}`, target);
    orphanTemporaries.push({
      directory: memberClass,
      temporaryName: entry.name,
      digest: raw.digest,
      ownerNonce: identity.ownerNonce,
    });
  }

  for (const entry of await safeEntries(root)) {
    if (entry.isFile() && entry.name.startsWith('.tmp-')) await addTemporary('root', entry);
  }

  const workflows = [];
  const timings = [];
  const recordEntries = await safeEntries(path.join(root, 'records'));
  for (const entry of recordEntries) {
    if (entry.name.startsWith('.tmp-')) {
      await addTemporary('records', entry);
      continue;
    }
    if (!entry.isFile()) fail('INCOMPLETE_EVIDENCE');
    const timingMatch = /^([A-Za-z0-9_-]{32,128})\.([A-Za-z0-9_-]{32,128})\.timing\.json$/.exec(
      entry.name,
    );
    const workflowMatch = /^([A-Za-z0-9_-]{32,128})\.json$/.exec(entry.name);
    const target = path.join(root, 'records', entry.name);
    await addMember('records', entry.name, target);
    if (timingMatch === null && workflowMatch === null) {
      invalidMembers.push(`records/${entry.name}`);
      continue;
    }
    const value = await readEvidenceJson(target, {
      maximum: PILOT_MEASUREMENT_PROTOCOL.limits.maxWorkflowRecordBytes,
    });
    if (timingMatch !== null) {
      timings.push(validateStoredTiming(value, generationId, timingMatch[1], timingMatch[2]));
    } else {
      workflows.push(validateStoredWorkflow(value, generationId, workflowMatch[1]));
    }
  }

  const workflowById = new Map();
  const workflowOrdinals = new Set();
  const packetIds = new Set();
  if (workflows.length > PILOT_MEASUREMENT_PROTOCOL.limits.maxWorkflowRecordsPerGeneration) {
    fail('CAPACITY_EXHAUSTED');
  }
  for (const workflow of workflows) {
    if (
      workflow.ordinal >= state.nextWorkflowOrdinal ||
      workflowById.has(workflow.runId) ||
      workflowOrdinals.has(workflow.ordinal)
    ) {
      fail('INCOMPLETE_EVIDENCE');
    }
    workflowById.set(workflow.runId, workflow);
    workflowOrdinals.add(workflow.ordinal);
    for (const packet of workflow.packets) {
      if (packetIds.has(packet.packetId)) fail('INCOMPLETE_EVIDENCE');
      packetIds.add(packet.packetId);
    }
  }
  for (const timing of timings) {
    const workflow = workflowById.get(timing.runId);
    const packet = workflow?.packets.find(({ packetId }) => packetId === timing.packetId);
    if (
      workflow?.kind !== 'workflow-reservation' ||
      packet === undefined ||
      packet.packetCapabilityHash !== timing.packetCapabilityHash
    ) {
      fail('INCOMPLETE_EVIDENCE');
    }
  }

  const traceRunIds = new Set();
  for (const entry of await safeEntries(path.join(root, 'traces'))) {
    if (entry.name.startsWith('.tmp-')) {
      await addTemporary('traces', entry);
      continue;
    }
    const match = /^([A-Za-z0-9_-]{32,128})\.json$/.exec(entry.name);
    if (!entry.isFile()) fail('UNSAFE_STORAGE');
    if (match === null) {
      await addMember('traces', entry.name, path.join(root, 'traces', entry.name));
      invalidMembers.push(`traces/${entry.name}`);
      continue;
    }
    const workflow = workflowById.get(match[1]);
    if (workflow?.kind !== 'workflow-record' || !workflow.detailTrace) {
      fail('INCOMPLETE_EVIDENCE');
    }
    const target = path.join(root, 'traces', entry.name);
    await addMember('traces', entry.name, target);
    const value = await readEvidenceJson(target, {
      maximum: PILOT_MEASUREMENT_PROTOCOL.limits.maxDetailedTraceBytes,
    });
    incompleteStoredValue(() => {
      exactObject(value, [
        'schema',
        'kind',
        'runId',
        'generationId',
        'detailOptIn',
        'roles',
        'requirements',
        'checks',
        'findings',
      ]);
      if (
        value.schema !== TRACE_SCHEMA ||
        value.kind !== 'workflow-trace' ||
        value.runId !== workflow.runId ||
        value.generationId !== generationId ||
        value.detailOptIn !== true
      ) {
        fail('INVALID_PAYLOAD');
      }
      validateTrace(
        {
          roles: value.roles,
          requirements: value.requirements,
          checks: value.checks,
          findings: value.findings,
        },
        workflow,
      );
    });
    traceRunIds.add(workflow.runId);
  }
  for (const workflow of workflows) {
    if (
      workflow.kind === 'workflow-record' &&
      workflow.detailTrace !== traceRunIds.has(workflow.runId)
    ) {
      fail('INCOMPLETE_EVIDENCE');
    }
  }

  const observations = [];
  const observationOrdinals = new Set();
  for (const entry of await safeEntries(path.join(root, 'gate-observations'))) {
    if (entry.name.startsWith('.tmp-')) {
      await addTemporary('gate-observations', entry);
      continue;
    }
    const match = /^([A-Za-z0-9_-]{32,128})\.json$/.exec(entry.name);
    if (!entry.isFile()) fail('UNSAFE_STORAGE');
    if (match === null) {
      await addMember(
        'gate-observations',
        entry.name,
        path.join(root, 'gate-observations', entry.name),
      );
      invalidMembers.push(`gate-observations/${entry.name}`);
      continue;
    }
    const target = path.join(root, 'gate-observations', entry.name);
    await addMember('gate-observations', entry.name, target);
    const observation = validateStoredObservation(
      await readEvidenceJson(target),
      generationId,
      match[1],
    );
    if (observationOrdinals.has(observation.ordinal)) fail('INCOMPLETE_EVIDENCE');
    observationOrdinals.add(observation.ordinal);
    observations.push(observation);
  }
  if (observations.length > PILOT_MEASUREMENT_PROTOCOL.limits.maxGateObservationsPerGeneration) {
    fail('CAPACITY_EXHAUSTED');
  }
  if (observations.some(({ ordinal }) => ordinal >= state.nextObservationOrdinal)) {
    fail('INCOMPLETE_EVIDENCE');
  }

  for (const entry of await safeEntries(path.join(root, 'summaries'))) {
    if (entry.name.startsWith('.tmp-')) {
      await addTemporary('summaries', entry);
      continue;
    }
    if (!entry.isFile()) fail('UNSAFE_STORAGE');
    if (!['private.json', 'publication.json', 'review.json'].includes(entry.name)) {
      await addMember('summaries', entry.name, path.join(root, 'summaries', entry.name));
      invalidMembers.push(`summaries/${entry.name}`);
      continue;
    }
    await readEvidenceJson(path.join(root, 'summaries', entry.name));
  }
  for (const entry of await safeEntries(path.join(root, 'locks'))) {
    if (entry.name.startsWith('.tmp-')) await addTemporary('locks', entry);
  }

  for (const name of ['state.json', 'suspension.json', 'suspension-transition.json']) {
    const target = path.join(root, name);
    const value = await readJson(target, { missing: true });
    if (value !== null) await addMember('state', name, target);
  }
  const suspension = await readJson(path.join(root, 'suspension.json'), { missing: true });
  if (suspension !== null) {
    incompleteStoredValue(() => validatePersistedSuspension(suspension, generationId));
  }
  const transition = await transitionMarker(root);
  if (transition !== null && transition.generationId !== generationId) {
    fail('INCOMPLETE_EVIDENCE');
  }
  if ((await rawTreeBytes(root)) > PILOT_MEASUREMENT_PROTOCOL.limits.maxRawGenerationBytes) {
    fail('CAPACITY_EXHAUSTED');
  }

  members.sort((left, right) =>
    `${left.class}/${left.name}`.localeCompare(`${right.class}/${right.name}`),
  );
  const incompleteRecords = workflows
    .filter(({ kind }) => kind === 'workflow-reservation')
    .map(({ runId }) => runId)
    .sort();
  const incompleteTimings = timings.map(({ packetId }) => packetId).sort();
  const incompleteObservations = observations
    .filter(({ kind }) => kind === 'gate-observation-reservation')
    .map(({ observationId }) => observationId)
    .sort();
  const inventory = {
    schema: 1,
    generationId,
    generationState: state.generationState,
    protocolDigest: state.protocolDigest,
    members,
    orphanTemporaries,
    incompleteCounts: {
      workflowRecords: incompleteRecords.length,
      packetTimings: incompleteTimings.length,
      gateObservations: incompleteObservations.length,
      temporaries: orphanTemporaries.length,
    },
    rawBytes: bytes,
    suspensionDigest: suspension === null ? null : canonicalDigest(suspension),
  };
  return {
    root,
    state,
    suspension,
    locks,
    invalidMembers,
    workflows,
    observations,
    packetIds,
    incompleteRecords,
    incompleteTimings,
    incompleteObservations,
    orphanTemporaries,
    inventory,
    inventoryDigest: canonicalDigest(inventory),
  };
}

async function discoverGenerationIds(context) {
  if (!context.exists) return [];
  const entries = await safeEntries(path.join(context.namespace, 'generations'), { missing: true });
  const ids = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !OPAQUE.test(entry.name)) fail('UNSAFE_STORAGE');
    ids.push(entry.name);
  }
  return ids.sort();
}

async function scanTombstones(context, generationId) {
  const entries = await safeEntries(path.join(context.namespace, 'tombstones'), { missing: true });
  const normal = [];
  const discard = [];
  const grammar = /^([A-Za-z0-9_-]{32,128})-(discard-)?sha256-([0-9a-f]{64})$/;
  for (const entry of entries) {
    const match = grammar.exec(entry.name);
    if (!entry.isDirectory() || match === null) fail('UNSAFE_STORAGE');
    if (match[1] === generationId) (match[2] === undefined ? normal : discard).push(entry.name);
  }
  return { normal: normal.sort(), discard: discard.sort() };
}

async function inventoryOperation(input, deps) {
  exactObject(input, ['runtimeStateRoot', 'repositoryIdentity'], ['generationId']);
  stringValue(input.runtimeStateRoot, 4096);
  stringValue(input.repositoryIdentity, 4096);
  if (input.generationId !== undefined) opaque(input.generationId);
  const context = await inspectNamespace(input, deps);
  const discovered = await discoverGenerationIds(context);
  if (input.generationId === undefined && discovered.length > 1) fail('INVALID_STATE');
  const generationId = input.generationId ?? discovered[0] ?? null;
  if (generationId === null) {
    return {
      generationId: null,
      generationStatus: 'absent',
      normalTombstones: 0,
      discardTombstones: 0,
    };
  }
  const tombstones = context.exists
    ? await scanTombstones(context, generationId)
    : { normal: [], discard: [] };
  const normalTombstones = tombstones.normal.length;
  const discardTombstones = tombstones.discard.length;
  if (!context.exists || !(await directoryState(generationPath(context, generationId)))) {
    return {
      generationId,
      generationStatus: 'absent',
      normalTombstones,
      discardTombstones,
    };
  }
  const evidence = await evidenceInventory(context, generationId);
  return {
    generationId,
    generationStatus: 'present',
    generationState: evidence.state.generationState,
    inventoryDigest: evidence.inventoryDigest,
    suspensionDigest: evidence.inventory.suspensionDigest,
    incompleteCounts: evidence.inventory.incompleteCounts,
    orphanTemporaries: evidence.orphanTemporaries,
    rawBytes: evidence.inventory.rawBytes,
    normalTombstones,
    discardTombstones,
  };
}

async function beginBaseline(input, deps) {
  exactObject(input, [
    'runtimeStateRoot',
    'repositoryIdentity',
    'configState',
    'fastEnabled',
    'protocolVersion',
    'protocolDigest',
    'confirmation',
  ]);
  enumValue(input.configState, ['enabled']);
  if (!booleanValue(input.fastEnabled) || !booleanValue(input.confirmation))
    fail('INVALID_PAYLOAD');
  assertProtocol(input.protocolVersion, input.protocolDigest);
  const context = await ensureNamespace(input, deps);
  const recoveredNamespaceLock = await recoverNamespaceLock(context, deps);
  return await withNamespaceLock(context, 'begin-baseline', deps, async () => {
    const recovered = await recoverGenerationInitialization(context, deps);
    if (recovered !== null) {
      if (!recoveredNamespaceLock) fail('INVALID_STATE');
      return {
        generationId: recovered.generationId,
        generationState: recovered.state.generationState,
        protocolVersion: recovered.state.protocolVersion,
        protocolDigest: recovered.state.protocolDigest,
      };
    }
    let generationId;
    let root;
    for (let attempt = 0; attempt < 32 && root === undefined; attempt += 1) {
      const candidate = randomOpaque(deps);
      const created = await ensureGenerationDirectories(context, candidate, deps);
      if (created !== null) {
        generationId = candidate;
        root = created;
      }
    }
    if (root === undefined || generationId === undefined) fail('INVALID_STATE');
    const state = initialGenerationState(generationId, deps);
    await atomicWrite(
      context,
      path.join(root, 'state.json'),
      state,
      'begin-baseline',
      generationId,
      deps,
      undefined,
      { skipCapacity: true },
    );
    await syncDirectory(context, root, deps);
    const published = generationPath(context, generationId);
    await repositoryGuard(context.input, deps, { mutation: true });
    await rename(root, published).catch((error) => fail('WRITE_FAILED', { cause: error }));
    await syncDirectory(context, path.dirname(published), deps);
    return {
      generationId,
      generationState: 'baseline',
      protocolVersion: PILOT_MEASUREMENT_PROTOCOL_VERSION,
      protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
    };
  });
}

async function activate(input, deps) {
  commonInput(input, ['configState', 'protocolVersion', 'protocolDigest', 'confirmation']);
  enumValue(input.configState, ['enabled']);
  if (!booleanValue(input.confirmation)) fail('INVALID_PAYLOAD');
  assertProtocol(input.protocolVersion, input.protocolDigest);
  const context = await ensureNamespace(input, deps);
  return await withLock(context, input.generationId, 'activate', deps, async () => {
    const evidence = await evidenceInventory(context, input.generationId);
    await assertAdmissionOpen(context, evidence);
    if (evidence.state.generationState !== 'baseline') fail('INVALID_STATE');
    const elapsed = nowMs(deps) - Date.parse(evidence.state.baselineStartedAt);
    const records = evidence.workflows.filter(({ kind }) => kind === 'workflow-record');
    const eligiblePackets = records
      .filter((record) => record.cohort === 'baseline' && record.completionStatus === 'completed')
      .flatMap((record) => record.packets)
      .filter((packet) => packet.wouldBeFastEligible).length;
    if (
      elapsed < PILOT_MEASUREMENT_PROTOCOL.aggregation.baselineWindowMinimumDays * 86_400_000 ||
      eligiblePackets < PILOT_MEASUREMENT_PROTOCOL.aggregation.baselineEligiblePacketMinimum
    ) {
      fail('INCOMPLETE_EVIDENCE');
    }
    const next = { ...evidence.state, generationState: 'active', activatedAt: nowIso(deps) };
    await atomicWrite(
      context,
      path.join(evidence.root, 'state.json'),
      next,
      'activate',
      input.generationId,
      deps,
    );
    return { generationId: input.generationId, generationState: 'active' };
  });
}

function validateGate(value) {
  exactObject(value, ['eligibility', 'firstReason']);
  const eligibility = enumValue(value.eligibility, ['eligible', 'excluded']);
  const firstReason =
    value.firstReason === null
      ? null
      : enumValue(value.firstReason, PILOT_MEASUREMENT_POLICY_PROJECTION.gateReasons);
  if ((eligibility === 'eligible') !== (firstReason === null)) fail('INVALID_PAYLOAD');
  return { eligibility, firstReason };
}

function validatePacketReservation(value) {
  exactObject(value, ['selectedProfile', 'wouldBeFastEligible', 'gate']);
  return {
    selectedProfile: enumValue(value.selectedProfile, ['quality', 'fast']),
    wouldBeFastEligible: booleanValue(value.wouldBeFastEligible),
    gate: validateGate(value.gate),
  };
}

function assertPacketPolicy(packet, generationState) {
  const eligible = packet.gate.eligibility === 'eligible';
  if (packet.wouldBeFastEligible !== eligible) fail('INVALID_PAYLOAD');
  if (generationState === 'baseline' && packet.selectedProfile !== 'quality') {
    fail('INVALID_PAYLOAD');
  }
  if (generationState === 'active' && packet.selectedProfile !== (eligible ? 'fast' : 'quality')) {
    fail('INVALID_PAYLOAD');
  }
}

function assertReservationPolicy(reservation) {
  if (
    reservation.configState !== 'enabled' ||
    !['baseline', 'active'].includes(reservation.generationState) ||
    reservation.cohort !== (reservation.generationState === 'baseline' ? 'baseline' : 'pilot')
  ) {
    fail('INVALID_PAYLOAD');
  }
  for (const packet of reservation.packets) {
    assertPacketPolicy(packet, reservation.generationState);
  }
}

async function workflowRecordCount(root) {
  let count = 0;
  for (const entry of await safeEntries(path.join(root, 'records'))) {
    if (entry.isFile() && /^[A-Za-z0-9_-]{32,128}\.json$/.test(entry.name)) count += 1;
  }
  return count;
}

async function readWorkflowRecords(root) {
  const records = [];
  for (const entry of await safeEntries(path.join(root, 'records'))) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.includes('.timing.'))
      continue;
    const value = await readJson(path.join(root, 'records', entry.name));
    if (value.kind === 'workflow-record') records.push(value);
  }
  return records.sort((left, right) => left.ordinal - right.ordinal);
}

async function startWorkflow(input, deps) {
  commonInput(input, ['configState', 'workflow', 'harnessFamily', 'packets']);
  enumValue(input.configState, ['enabled']);
  enumValue(input.workflow, PILOT_MEASUREMENT_PROTOCOL.enums.workflows);
  enumValue(input.harnessFamily, PILOT_MEASUREMENT_PROTOCOL.enums.harnessFamilies);
  if (
    !Array.isArray(input.packets) ||
    input.packets.length === 0 ||
    input.packets.length > PILOT_MEASUREMENT_PROTOCOL.limits.maxPacketsPerWorkflow
  ) {
    if (
      Array.isArray(input.packets) &&
      input.packets.length > PILOT_MEASUREMENT_PROTOCOL.limits.maxPacketsPerWorkflow
    ) {
      fail('CAPACITY_EXHAUSTED');
    }
    fail('INVALID_PAYLOAD');
  }
  const packets = input.packets.map(validatePacketReservation);
  const context = await ensureNamespace(input, deps);
  return await withLock(context, input.generationId, 'start', deps, async () => {
    const evidence = await evidenceInventory(context, input.generationId);
    const { root, state } = evidence;
    await assertAdmissionOpen(context, evidence);
    for (const packet of packets) assertPacketPolicy(packet, state.generationState);
    const count = await workflowRecordCount(root);
    if (count >= PILOT_MEASUREMENT_PROTOCOL.limits.maxWorkflowRecordsPerGeneration) {
      await suspendForCapacity(context, input.generationId, state, deps);
      fail('CAPACITY_EXHAUSTED');
    }
    const runId = await uniqueOpaque(deps, async (candidate) =>
      pathExists(path.join(root, 'records', `${candidate}.json`)),
    );
    const workflowCapability = randomOpaque(deps, 32);
    const packetResults = [];
    const usedPacketIds = new Set(evidence.packetIds);
    for (const packet of packets) {
      const packetId = await uniqueOpaque(deps, async () => false, usedPacketIds);
      packetResults.push({
        packetId,
        packetCapability: randomOpaque(deps, 32),
        ...packet,
      });
    }
    const reservation = {
      schema: RECORD_SCHEMA,
      kind: 'workflow-reservation',
      runId,
      workflowCapabilityHash: hashCapability(workflowCapability),
      generationId: input.generationId,
      protocolDigest: state.protocolDigest,
      cohort: state.generationState === 'baseline' ? 'baseline' : 'pilot',
      configState: input.configState,
      generationState: state.generationState,
      workflow: input.workflow,
      harnessFamily: input.harnessFamily,
      ordinal: state.nextWorkflowOrdinal,
      packets: packetResults.map(({ packetCapability, ...packet }) => ({
        ...packet,
        packetCapabilityHash: hashCapability(packetCapability),
      })),
    };
    const nextState = { ...state, nextWorkflowOrdinal: state.nextWorkflowOrdinal + 1 };
    await atomicWrite(
      context,
      path.join(root, 'state.json'),
      nextState,
      'start',
      input.generationId,
      deps,
    );
    await atomicWrite(
      context,
      path.join(root, 'records', `${runId}.json`),
      reservation,
      'start',
      input.generationId,
      deps,
      PILOT_MEASUREMENT_PROTOCOL.limits.maxWorkflowRecordBytes,
      { noReplace: true },
    );
    return {
      status: 'reserved',
      runId,
      workflowCapability,
      cohort: reservation.cohort,
      generationState: reservation.generationState,
      ordinal: reservation.ordinal,
      packets: packetResults.map(({ packetCapability, packetId }) => ({
        packetId,
        packetCapability,
      })),
    };
  });
}

async function suspensionValue(root) {
  const value = await readJson(path.join(root, 'suspension.json'), { missing: true });
  if (value === null) return null;
  const generationId = path.basename(root);
  try {
    return validatePersistedSuspension(value, generationId);
  } catch (error) {
    fail('UNSAFE_STORAGE', { cause: error });
  }
}

async function suspendForCapacity(context, generationId, state, deps) {
  if (!['baseline', 'active', 'suspended'].includes(state.generationState)) return;
  const root = generationPath(context, generationId);
  const marker = await beginTransition(context, root, generationId, 'capacity-exhausted', deps);
  const existing = await suspensionValue(root);
  const reasons = [...new Set([...(existing?.reasons ?? []), 'capacity-exhausted'])].sort();
  const resumeTo = existing?.resumeTo ?? state.generationState;
  const suspension = {
    schema: 1,
    kind: 'pilot-suspension',
    generationId,
    status: 'suspended',
    resumeTo,
    reasons,
    affectedRecordIds: existing?.affectedRecordIds ?? [],
  };
  await atomicWrite(
    context,
    path.join(root, 'suspension.json'),
    suspension,
    'suspend',
    generationId,
    deps,
  );
  if (state.generationState !== 'suspended') {
    await atomicWrite(
      context,
      path.join(root, 'state.json'),
      { ...state, generationState: 'suspended' },
      'suspend',
      generationId,
      deps,
    );
  }
  await clearTransition(context, root, marker, deps);
}

async function persistPilotControl(input, deps, reason, affectedRecordIds = []) {
  try {
    const context = await ensureNamespace(input, deps);
    return await withLock(context, input.generationId, 'pilot-control', deps, async () => {
      const { root, state } = await loadState(context, input.generationId);
      if (!['baseline', 'active', 'suspended'].includes(state.generationState)) return false;
      const previous = await suspensionValue(root);
      const resumeTo = previous?.resumeTo ?? state.generationState;
      const marker = await beginTransition(context, root, input.generationId, reason, deps);
      const suspension = {
        schema: 1,
        kind: 'pilot-suspension',
        generationId: input.generationId,
        status: 'suspended',
        resumeTo,
        reasons: [...new Set([...(previous?.reasons ?? []), reason])].sort(),
        affectedRecordIds: [
          ...new Set([...(previous?.affectedRecordIds ?? []), ...affectedRecordIds]),
        ].sort(),
      };
      await atomicWrite(
        context,
        path.join(root, 'suspension.json'),
        suspension,
        'suspend',
        input.generationId,
        deps,
      );
      if (state.generationState !== 'suspended') {
        await atomicWrite(
          context,
          path.join(root, 'state.json'),
          { ...state, generationState: 'suspended' },
          'suspend',
          input.generationId,
          deps,
        );
      }
      await clearTransition(context, root, marker, deps);
      return true;
    });
  } catch {
    try {
      const context = await ensureNamespace(input, deps);
      const root = generationPath(context, input.generationId);
      const target = path.join(root, 'suspension-transition.json');
      const existing = await transitionMarker(root);
      if (existing !== null) return true;
      const marker = {
        schema: 1,
        kind: 'suspension-transition',
        generationId: input.generationId,
        operation: reason,
        ownerNonce: randomOpaque(deps, 24),
      };
      await repositoryGuard(input, deps, { mutation: true });
      const handle = await open(target, WRITE_FLAGS, 0o600);
      try {
        await handle.writeFile(`${canonicalizeJson(marker)}\n`, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      return true;
    } catch {
      return false;
    }
  }
}

async function observationFailure(input, deps, error, affectedRecordIds = []) {
  const persisted = await persistPilotControl(input, deps, 'evidence-gap', affectedRecordIds);
  return new PilotMeasurementError(error.code ?? 'WRITE_FAILED', {
    cause: error,
    pilotControlOutcome: persisted ? 'evidence-gap' : 'control-state-unpersistable',
    controlStatePersisted: persisted,
    alert: persisted ? 'none' : 'value-free',
  });
}

async function guardedObservationMutation(input, deps, affectedRecordIds, action) {
  try {
    return await action();
  } catch (error) {
    if (
      error instanceof PilotMeasurementError &&
      ['INVALID_PAYLOAD', 'AUTHENTICATION_FAILED'].includes(error.code)
    ) {
      throw error;
    }
    throw await observationFailure(input, deps, error, affectedRecordIds);
  }
}

async function loadReservation(context, generationId, runId) {
  opaque(runId);
  const { root } = await loadState(context, generationId);
  const target = path.join(root, 'records', `${runId}.json`);
  const record = validateStoredWorkflow(await readJson(target), generationId, runId);
  return { root, target, record };
}

async function startPacket(input, deps) {
  commonInput(input, ['runId', 'packetId', 'workflowCapability', 'packetCapability']);
  opaque(input.runId);
  opaque(input.packetId);
  const context = await ensureNamespace(input, deps);
  return await withPacketLock(
    context,
    input.generationId,
    input.packetId,
    'start-packet',
    deps,
    async () => {
      const { root, record } = await loadReservation(context, input.generationId, input.runId);
      await loadState(context, input.generationId);
      if (record.kind !== 'workflow-reservation') fail('INVALID_STATE');
      authenticate(input.workflowCapability, record.workflowCapabilityHash);
      const packet = record.packets.find(({ packetId }) => packetId === input.packetId);
      if (!packet) fail('AUTHENTICATION_FAILED');
      authenticate(input.packetCapability, packet.packetCapabilityHash);
      const target = path.join(root, 'records', `${input.runId}.${input.packetId}.timing.json`);
      const existing = await readJson(target, { missing: true });
      if (existing !== null) {
        authenticate(input.packetCapability, existing.packetCapabilityHash);
        return { status: existing.status, runId: input.runId, packetId: input.packetId };
      }
      const salt = randomOpaque(deps, 24);
      const wallMs = nowMs(deps);
      const uptimeSeconds = (deps.uptimeSeconds ?? os.uptime)();
      const hostname = (deps.hostname ?? os.hostname)();
      const monotonicNs = String((deps.monotonicNs ?? process.hrtime.bigint)());
      const receipt = {
        schema: 1,
        kind: 'packet-timing-receipt',
        status: 'started',
        generationId: input.generationId,
        runId: input.runId,
        packetId: input.packetId,
        packetCapabilityHash: packet.packetCapabilityHash,
        salt,
        hostFingerprint: canonicalDigest({ salt, hostname }),
        startWallMs: wallMs,
        startMonotonicNs: monotonicNs,
        startBootEstimateMs: Math.round(wallMs - uptimeSeconds * 1000),
      };
      await atomicWrite(
        context,
        target,
        receipt,
        'start-packet',
        input.generationId,
        deps,
        undefined,
        { noReplace: true },
      );
      return { status: 'started', runId: input.runId, packetId: input.packetId };
    },
  );
}

function durationFromReceipt(receipt, deps) {
  const finishWallMs = nowMs(deps);
  const finishMonotonicNs = (deps.monotonicNs ?? process.hrtime.bigint)();
  const finishUptime = (deps.uptimeSeconds ?? os.uptime)();
  const finishHost = (deps.hostname ?? os.hostname)();
  const startMonotonicNs = BigInt(receipt.startMonotonicNs);
  const monotonicDeltaNs = finishMonotonicNs - startMonotonicNs;
  const wallDeltaMs = finishWallMs - receipt.startWallMs;
  const durationMs = monotonicDeltaNs >= 0n ? Number(monotonicDeltaNs / 1_000_000n) : -1;
  const bootEstimate = Math.round(finishWallMs - finishUptime * 1000);
  const continuous =
    canonicalDigest({ salt: receipt.salt, hostname: finishHost }) === receipt.hostFingerprint &&
    monotonicDeltaNs >= 0n &&
    Number.isSafeInteger(durationMs) &&
    durationMs >= 0 &&
    durationMs <= PILOT_MEASUREMENT_PROTOCOL.limits.maxDurationMs &&
    wallDeltaMs >= 0 &&
    Math.abs(wallDeltaMs - durationMs) <=
      PILOT_MEASUREMENT_PROTOCOL.limits.wallMonotonicToleranceMs &&
    Math.abs(bootEstimate - receipt.startBootEstimateMs) <=
      PILOT_MEASUREMENT_PROTOCOL.limits.bootEstimateToleranceMs;
  return {
    duration: continuous
      ? { status: 'available', milliseconds: durationMs }
      : { status: 'unavailable' },
    finishWallMs,
    finishMonotonicNs: String(finishMonotonicNs),
    finishBootEstimateMs: bootEstimate,
  };
}

async function finishPacket(input, deps) {
  commonInput(input, ['runId', 'packetId', 'workflowCapability', 'packetCapability']);
  const context = await ensureNamespace(input, deps);
  return await withPacketLock(
    context,
    input.generationId,
    input.packetId,
    'finish-packet',
    deps,
    async () => {
      const { root, record } = await loadReservation(context, input.generationId, input.runId);
      authenticate(input.workflowCapability, record.workflowCapabilityHash);
      const packet = record.packets.find(({ packetId }) => packetId === input.packetId);
      if (!packet) fail('AUTHENTICATION_FAILED');
      authenticate(input.packetCapability, packet.packetCapabilityHash);
      const target = path.join(root, 'records', `${input.runId}.${input.packetId}.timing.json`);
      const receipt = await readJson(target);
      authenticate(input.packetCapability, receipt.packetCapabilityHash);
      if (receipt.status === 'finished') return { status: 'finished', duration: receipt.duration };
      if (receipt.status !== 'started') fail('INVALID_STATE');
      const closed = { ...receipt, status: 'finished', ...durationFromReceipt(receipt, deps) };
      await atomicWrite(context, target, closed, 'finish-packet', input.generationId, deps);
      return { status: 'finished', duration: closed.duration };
    },
  );
}

function validateCostProxy(value) {
  if (value === null) return null;
  exactObject(value, ['kind', 'unit', 'value']);
  const kind = token(value.kind);
  const unit = token(value.unit);
  if (
    typeof value.value !== 'string' ||
    !/^(?:0|[1-9][0-9]*)$/.test(value.value) ||
    value.value.length > PILOT_MEASUREMENT_PROTOCOL.limits.maxCostValueDigits
  ) {
    fail('INVALID_PAYLOAD');
  }
  return { kind, unit, value: value.value };
}

function validatePacketOutcome(value) {
  exactObject(value, ['packetId', 'packetCapability', 'fallback', 'escalated', 'costProxy']);
  return {
    packetId: opaque(value.packetId),
    packetCapability: stringValue(value.packetCapability, 256),
    fallback: enumValue(value.fallback, PILOT_MEASUREMENT_POLICY_PROJECTION.fallbacks),
    escalated: booleanValue(value.escalated),
    costProxy: validateCostProxy(value.costProxy),
  };
}

function validateValidation(value) {
  exactObject(value, ['status', 'requiredCount', 'totalCount', 'satisfiedCount']);
  const requiredCount = integer(value.requiredCount, 10_000);
  const totalCount = integer(value.totalCount, 10_000);
  const satisfiedCount = integer(value.satisfiedCount, 10_000);
  if (requiredCount > totalCount || satisfiedCount > totalCount) fail('INVALID_PAYLOAD');
  const status = enumValue(value.status, PILOT_MEASUREMENT_PROTOCOL.enums.validationStatuses);
  if (
    (status === 'not-required' && (requiredCount !== 0 || satisfiedCount !== 0)) ||
    (status === 'passed' && (requiredCount === 0 || satisfiedCount < requiredCount)) ||
    (status === 'failed' && (requiredCount === 0 || satisfiedCount >= requiredCount)) ||
    (status === 'unavailable' && satisfiedCount !== 0)
  ) {
    fail('INVALID_PAYLOAD');
  }
  return {
    status,
    requiredCount,
    totalCount,
    satisfiedCount,
  };
}

function validateReview(value) {
  exactObject(value, ['status', 'severityCounts']);
  exactObject(value.severityCounts, ['critical', 'important', 'note']);
  const status = enumValue(value.status, PILOT_MEASUREMENT_PROTOCOL.enums.reviewStatuses);
  const severityCounts = {
    critical: integer(value.severityCounts.critical, 10_000),
    important: integer(value.severityCounts.important, 10_000),
    note: integer(value.severityCounts.note, 10_000),
  };
  if (status !== 'completed' && Object.values(severityCounts).some((count) => count !== 0)) {
    fail('INVALID_PAYLOAD');
  }
  return {
    status,
    severityCounts,
  };
}

function boundedArray(value, maximum) {
  if (!Array.isArray(value)) fail('INVALID_PAYLOAD');
  if (value.length > maximum) fail('CAPACITY_EXHAUSTED');
  return value;
}

async function removeWorkflowTimingReceipts(context, root, input, packetOutcomes, deps) {
  const outcomes =
    packetOutcomes === null
      ? null
      : new Map(packetOutcomes.map((outcome) => [outcome.packetId, outcome]));
  for (const entry of await safeEntries(path.join(root, 'records'))) {
    const match = new RegExp(`^${input.runId}\\.([A-Za-z0-9_-]{32,128})\\.timing\\.json$`).exec(
      entry.name,
    );
    if (!entry.isFile() || match === null) continue;
    const receipt = await readJson(path.join(root, 'records', entry.name));
    if (
      receipt.kind !== 'packet-timing-receipt' ||
      receipt.generationId !== input.generationId ||
      receipt.runId !== input.runId ||
      receipt.packetId !== match[1]
    ) {
      fail('UNSAFE_STORAGE');
    }
    if (outcomes !== null) {
      const outcome = outcomes.get(receipt.packetId);
      if (!outcome) fail('AUTHENTICATION_FAILED');
      authenticate(outcome.packetCapability, receipt.packetCapabilityHash);
    }
    await repositoryGuard(input, deps, { mutation: true });
    await unlink(path.join(root, 'records', entry.name)).catch((error) =>
      fail('WRITE_FAILED', { cause: error }),
    );
  }
}

function validateTrace(trace, reservation) {
  exactObject(trace, ['roles', 'requirements', 'checks', 'findings']);
  const roles = boundedArray(trace.roles, 256).map((item) => {
    exactObject(item, ['role', 'profile']);
    return { role: token(item.role), profile: enumValue(item.profile, ['quality', 'fast']) };
  });
  const requirements = boundedArray(
    trace.requirements,
    PILOT_MEASUREMENT_PROTOCOL.limits.maxRequirementsPerTrace,
  ).map((item) => {
    exactObject(item, ['id', 'status'], ['path']);
    return {
      id: token(item.id),
      status: enumValue(item.status, PILOT_MEASUREMENT_PROTOCOL.enums.requirementStatuses),
      ...(item.path === undefined ? {} : { path: validateRelativePath(item.path) }),
    };
  });
  const checks = boundedArray(
    trace.checks,
    PILOT_MEASUREMENT_PROTOCOL.limits.maxChecksPerTrace,
  ).map((item) => {
    exactObject(item, ['id', 'outcome', 'durationMs']);
    return {
      id: token(item.id),
      outcome: enumValue(item.outcome, PILOT_MEASUREMENT_PROTOCOL.enums.checkOutcomes),
      durationMs: item.durationMs === null ? null : integer(item.durationMs, 86_400_000),
    };
  });
  const findings = boundedArray(
    trace.findings,
    PILOT_MEASUREMENT_PROTOCOL.limits.maxFindingsPerTrace,
  ).map((item) => {
    exactObject(item, ['id', 'severity', 'status', 'category', 'path', 'line']);
    return {
      id: token(item.id),
      severity: enumValue(item.severity, PILOT_MEASUREMENT_PROTOCOL.enums.findingSeverities),
      status: enumValue(item.status, PILOT_MEASUREMENT_PROTOCOL.enums.findingStatuses),
      category: token(item.category),
      path: validateRelativePath(item.path),
      line: integer(item.line, 10_000_000),
    };
  });
  return {
    schema: TRACE_SCHEMA,
    kind: 'workflow-trace',
    runId: reservation.runId,
    generationId: reservation.generationId,
    detailOptIn: true,
    roles,
    requirements,
    checks,
    findings,
  };
}

async function finalizeWorkflow(input, deps) {
  commonInput(input, [
    'runId',
    'workflowCapability',
    'packets',
    'validation',
    'review',
    'completionStatus',
    'qualityCorrectionRounds',
    'detailOptIn',
    'trace',
  ]);
  opaque(input.runId);
  if (!Array.isArray(input.packets)) fail('INVALID_PAYLOAD');
  const packetOutcomes = input.packets.map(validatePacketOutcome);
  const validation = validateValidation(input.validation);
  const review = validateReview(input.review);
  const completionStatus = enumValue(
    input.completionStatus,
    PILOT_MEASUREMENT_PROTOCOL.enums.completionStatuses.filter((value) => value !== 'abandoned'),
  );
  const qualityCorrectionRounds = integer(input.qualityCorrectionRounds, 10_000);
  const detailOptIn = booleanValue(input.detailOptIn);
  if (detailOptIn !== (input.trace !== null)) fail('INVALID_PAYLOAD');
  const context = await ensureNamespace(input, deps);
  return await withLock(context, input.generationId, 'finalize', deps, async () => {
    const {
      root,
      target,
      record: reservation,
    } = await loadReservation(context, input.generationId, input.runId);
    authenticate(input.workflowCapability, reservation.workflowCapabilityHash);
    if (reservation.kind === 'workflow-record') {
      if (
        packetOutcomes.length !== reservation.packets.length ||
        new Set(packetOutcomes.map(({ packetId }) => packetId)).size !== packetOutcomes.length
      ) {
        fail('INVALID_PAYLOAD');
      }
      for (const packet of reservation.packets) {
        const outcome = packetOutcomes.find(({ packetId }) => packetId === packet.packetId);
        if (!outcome) fail('INVALID_PAYLOAD');
      }
      await removeWorkflowTimingReceipts(context, root, input, packetOutcomes, deps);
      return { status: 'finalized', runId: input.runId };
    }
    if (reservation.kind !== 'workflow-reservation') fail('INVALID_STATE');
    assertReservationPolicy(reservation);
    if (
      packetOutcomes.length !== reservation.packets.length ||
      new Set(packetOutcomes.map(({ packetId }) => packetId)).size !== packetOutcomes.length
    ) {
      fail('INVALID_PAYLOAD');
    }
    const packets = [];
    const timingTargets = [];
    for (const reserved of reservation.packets) {
      const outcome = packetOutcomes.find(({ packetId }) => packetId === reserved.packetId);
      if (!outcome) fail('INVALID_PAYLOAD');
      authenticate(outcome.packetCapability, reserved.packetCapabilityHash);
      if (
        (outcome.fallback === 'none') !== !outcome.escalated ||
        (reservation.generationState === 'baseline' &&
          (outcome.fallback !== 'none' || outcome.escalated)) ||
        (reserved.selectedProfile === 'quality' &&
          (outcome.fallback !== 'none' || outcome.escalated))
      ) {
        fail('INVALID_PAYLOAD');
      }
      const timingTarget = path.join(
        root,
        'records',
        `${input.runId}.${reserved.packetId}.timing.json`,
      );
      const receipt = await readJson(timingTarget);
      authenticate(outcome.packetCapability, receipt.packetCapabilityHash);
      if (receipt.status !== 'finished') fail('INCOMPLETE_EVIDENCE');
      timingTargets.push(timingTarget);
      packets.push({
        packetId: reserved.packetId,
        selectedProfile: reserved.selectedProfile,
        wouldBeFastEligible: reserved.wouldBeFastEligible,
        firstGateReason: reserved.gate.firstReason,
        implementationDuration: receipt.duration,
        fallback: outcome.fallback,
        escalated: outcome.escalated,
        costProxy:
          outcome.costProxy === null
            ? { status: 'unavailable' }
            : { status: 'available', ...outcome.costProxy },
      });
    }
    const finalized = {
      schema: RECORD_SCHEMA,
      kind: 'workflow-record',
      runId: reservation.runId,
      workflowCapabilityHash: reservation.workflowCapabilityHash,
      generationId: reservation.generationId,
      protocolDigest: reservation.protocolDigest,
      cohort: reservation.cohort,
      configState: reservation.configState,
      generationState: reservation.generationState,
      workflow: reservation.workflow,
      harnessFamily: reservation.harnessFamily,
      ordinal: reservation.ordinal,
      packets,
      validation,
      review,
      completionStatus,
      qualityCorrectionRounds,
      detailTrace: detailOptIn,
    };
    if (detailOptIn) {
      const trace = validateTrace(input.trace, reservation);
      await atomicWrite(
        context,
        path.join(root, 'traces', `${input.runId}.json`),
        trace,
        'finalize',
        input.generationId,
        deps,
        PILOT_MEASUREMENT_PROTOCOL.limits.maxDetailedTraceBytes,
      );
    }
    await atomicWrite(
      context,
      target,
      finalized,
      'finalize',
      input.generationId,
      deps,
      PILOT_MEASUREMENT_PROTOCOL.limits.maxWorkflowRecordBytes,
    );
    for (const timingTarget of timingTargets) {
      await repositoryGuard(input, deps, { mutation: true });
      await unlink(timingTarget).catch((error) => fail('WRITE_FAILED', { cause: error }));
    }
    return { status: 'finalized', runId: input.runId, packetCount: packets.length };
  });
}

async function startGateObservation(input, deps) {
  commonInput(input, ['configState', 'generationState', 'mode', 'harnessFamily']);
  enumValue(input.configState, PILOT_MEASUREMENT_POLICY_PROJECTION.configStates);
  enumValue(input.generationState, PILOT_MEASUREMENT_POLICY_PROJECTION.generationStates);
  enumValue(input.mode, PILOT_MEASUREMENT_PROTOCOL.enums.observationModes);
  enumValue(input.harnessFamily, PILOT_MEASUREMENT_PROTOCOL.enums.harnessFamilies);
  const context = await inspectNamespace(input, deps);
  if (!context.exists) {
    return { status: 'not-recorded', reason: 'no-generation', pilotControlOutcome: 'none' };
  }
  const { state } = await loadState(context, input.generationId);
  if (
    input.configState !== 'enabled' ||
    !['baseline', 'active'].includes(state.generationState) ||
    input.generationState !== state.generationState
  ) {
    return { status: 'not-recorded', reason: 'admission-closed', pilotControlOutcome: 'none' };
  }
  return await guardedObservationMutation(input, deps, [], async () => {
    const mutable = await ensureNamespace(input, deps);
    return await withLock(mutable, input.generationId, 'start-gate-observation', deps, async () => {
      const evidence = await evidenceInventory(mutable, input.generationId);
      const { root, state: current } = evidence;
      await assertAdmissionOpen(mutable, evidence);
      if (current.generationState !== input.generationState) fail('INVALID_STATE');
      const count = countBySuffix(await safeEntries(path.join(root, 'gate-observations')), '.json');
      if (count >= PILOT_MEASUREMENT_PROTOCOL.limits.maxGateObservationsPerGeneration) {
        await suspendForCapacity(mutable, input.generationId, current, deps);
        fail('CAPACITY_EXHAUSTED');
      }
      const observationIds = new Set(
        evidence.observations.map(({ observationId }) => observationId),
      );
      const observationId = await uniqueOpaque(
        deps,
        async (candidate) => pathExists(path.join(root, 'gate-observations', `${candidate}.json`)),
        observationIds,
      );
      const capability = randomOpaque(deps, 32);
      const reservation = {
        schema: OBSERVATION_SCHEMA,
        kind: 'gate-observation-reservation',
        observationId,
        capabilityHash: hashCapability(capability),
        generationId: input.generationId,
        protocolDigest: current.protocolDigest,
        cohort: current.generationState === 'baseline' ? 'baseline' : 'pilot',
        mode: input.mode,
        harnessFamily: input.harnessFamily,
        ordinal: current.nextObservationOrdinal,
      };
      await atomicWrite(
        mutable,
        path.join(root, 'state.json'),
        { ...current, nextObservationOrdinal: current.nextObservationOrdinal + 1 },
        'start-gate-observation',
        input.generationId,
        deps,
      );
      await atomicWrite(
        mutable,
        path.join(root, 'gate-observations', `${observationId}.json`),
        reservation,
        'start-gate-observation',
        input.generationId,
        deps,
        undefined,
        { noReplace: true },
      );
      return {
        status: 'reserved',
        observationId,
        capability,
        cohort: reservation.cohort,
        ordinal: reservation.ordinal,
      };
    });
  });
}

function unavailableOrInteger(value, maximum = 10_000) {
  return value === 'unavailable' ? 'unavailable' : integer(value, maximum);
}

function unavailableOrBoolean(value) {
  return value === 'unavailable' ? 'unavailable' : booleanValue(value);
}

async function finalizeGateObservation(input, deps) {
  commonInput(input, [
    'observationId',
    'capability',
    'terminalOutcome',
    'ciRepairCorrections',
    'reviewerCorrections',
    'conflictCorrections',
    'checksReported',
    'requiredCheckCount',
    'requiredChecksSatisfied',
  ]);
  opaque(input.observationId);
  enumValue(input.terminalOutcome, PILOT_MEASUREMENT_PROTOCOL.enums.observationOutcomes);
  const corrections = {
    ciRepair: integer(input.ciRepairCorrections, 10_000),
    configuredReviewer: integer(input.reviewerCorrections, 10_000),
    conflictResolution: integer(input.conflictCorrections, 10_000),
  };
  booleanValue(input.checksReported);
  const requiredCheckCount = unavailableOrInteger(input.requiredCheckCount);
  const requiredChecksSatisfied = unavailableOrBoolean(input.requiredChecksSatisfied);
  if (
    !input.checksReported &&
    (requiredCheckCount !== 'unavailable' || requiredChecksSatisfied !== 'unavailable')
  ) {
    fail('INVALID_PAYLOAD');
  }
  return await guardedObservationMutation(input, deps, [input.observationId], async () => {
    const context = await ensureNamespace(input, deps);
    return await withLock(
      context,
      input.generationId,
      'finalize-gate-observation',
      deps,
      async () => {
        const { root } = await loadState(context, input.generationId);
        const target = path.join(root, 'gate-observations', `${input.observationId}.json`);
        const reservation = await readJson(target);
        authenticate(input.capability, reservation.capabilityHash);
        if (reservation.kind === 'gate-observation') {
          return { status: 'finalized', observationId: input.observationId };
        }
        if (reservation.kind !== 'gate-observation-reservation') fail('INVALID_STATE');
        const observation = {
          ...reservation,
          kind: 'gate-observation',
          terminalOutcome: input.terminalOutcome,
          corrections,
          checksReported: input.checksReported,
          requiredCheckCount,
          requiredChecksSatisfied,
        };
        await atomicWrite(
          context,
          target,
          observation,
          'finalize-gate-observation',
          input.generationId,
          deps,
        );
        return { status: 'finalized', observationId: input.observationId };
      },
    );
  });
}

async function suspendGeneration(input, deps) {
  commonInput(input, ['pilotControlOutcome', 'affectedRecordIds']);
  const mapping = PILOT_MEASUREMENT_POLICY_PROJECTION.pilotControlMappings.find(
    ({ outcome }) => outcome === input.pilotControlOutcome,
  );
  if (!mapping || mapping.suspensionReason === 'none') fail('INVALID_PAYLOAD');
  const affectedRecordIds = boundedArray(input.affectedRecordIds, 256).map(opaque).sort();
  const context = await ensureNamespace(input, deps);
  return await withLock(context, input.generationId, 'suspend', deps, async () => {
    const { root, state } = await loadState(context, input.generationId);
    if (!['baseline', 'active', 'suspended'].includes(state.generationState)) fail('INVALID_STATE');
    const previous = await suspensionValue(root);
    const marker = await beginTransition(context, root, input.generationId, 'suspend', deps);
    const suspension = {
      schema: 1,
      kind: 'pilot-suspension',
      generationId: input.generationId,
      status: 'suspended',
      resumeTo: previous?.resumeTo ?? state.generationState,
      reasons: [...new Set([...(previous?.reasons ?? []), mapping.suspensionReason])].sort(),
      affectedRecordIds: [
        ...new Set([...(previous?.affectedRecordIds ?? []), ...affectedRecordIds]),
      ].sort(),
    };
    await atomicWrite(
      context,
      path.join(root, 'suspension.json'),
      suspension,
      'suspend',
      input.generationId,
      deps,
    );
    if (state.generationState !== 'suspended') {
      await atomicWrite(
        context,
        path.join(root, 'state.json'),
        { ...state, generationState: 'suspended' },
        'suspend',
        input.generationId,
        deps,
      );
    }
    await clearTransition(context, root, marker, deps);
    return {
      generationState: 'suspended',
      suspensionDigest: canonicalDigest(suspension),
      pilotControlOutcome: input.pilotControlOutcome,
    };
  });
}

async function beginReview(input, deps) {
  commonInput(input, ['configState', 'expectedInventoryDigest', 'confirmation']);
  enumValue(input.configState, PILOT_MEASUREMENT_POLICY_PROJECTION.configStates);
  digestValue(input.expectedInventoryDigest);
  if (!booleanValue(input.confirmation)) fail('INVALID_PAYLOAD');
  const context = await ensureNamespace(input, deps);
  return await withLock(context, input.generationId, 'begin-review', deps, async () => {
    const evidence = await evidenceInventory(context, input.generationId);
    if (!['baseline', 'active', 'suspended'].includes(evidence.state.generationState))
      fail('INVALID_STATE');
    if (evidence.inventoryDigest !== input.expectedInventoryDigest) fail('STALE_REVIEW');
    const state = { ...evidence.state, generationState: 'review', reviewStartedAt: nowIso(deps) };
    await atomicWrite(
      context,
      path.join(evidence.root, 'state.json'),
      state,
      'begin-review',
      input.generationId,
      deps,
    );
    return {
      generationState: 'review',
      preservedSuspension: evidence.suspension !== null,
      incompleteCounts: evidence.inventory.incompleteCounts,
    };
  });
}

async function resumeGeneration(input, deps) {
  commonInput(input, [
    'configState',
    'expectedSuspensionDigest',
    'expectedInventoryDigest',
    'confirmation',
  ]);
  enumValue(input.configState, ['enabled']);
  digestValue(input.expectedSuspensionDigest);
  digestValue(input.expectedInventoryDigest);
  if (!booleanValue(input.confirmation)) fail('INVALID_PAYLOAD');
  const context = await ensureNamespace(input, deps);
  return await withLock(context, input.generationId, 'resume', deps, async () => {
    const { root, state } = await loadState(context, input.generationId);
    const pending = await transitionMarker(root);
    const suspension = await suspensionValue(root);
    let resumeTo;
    if (pending !== null) {
      if (
        pending.operation !== 'resume' ||
        pending.expectedInventoryDigest !== input.expectedInventoryDigest ||
        pending.expectedSuspensionDigest !== input.expectedSuspensionDigest
      ) {
        fail('INVALID_STATE');
      }
      resumeTo = pending.resumeTo;
      if (suspension !== null && canonicalDigest(suspension) !== input.expectedSuspensionDigest) {
        fail('STALE_REVIEW');
      }
    } else {
      const evidence = await evidenceInventory(context, input.generationId);
      if (state.generationState !== 'suspended' || suspension === null) fail('INVALID_STATE');
      if (
        evidence.inventoryDigest !== input.expectedInventoryDigest ||
        canonicalDigest(suspension) !== input.expectedSuspensionDigest
      ) {
        fail('STALE_REVIEW');
      }
      resumeTo = suspension.resumeTo;
    }
    const evidence = await evidenceInventory(context, input.generationId);
    assertEvidenceHealthy(context, evidence);
    if (!['baseline', 'active'].includes(resumeTo)) fail('INCOMPLETE_EVIDENCE');
    const marker =
      pending ??
      (await beginTransition(context, root, input.generationId, 'resume', deps, {
        expectedInventoryDigest: input.expectedInventoryDigest,
        expectedSuspensionDigest: input.expectedSuspensionDigest,
        resumeTo,
      }));
    if (suspension !== null) {
      await repositoryGuard(input, deps, { mutation: true });
      await unlink(path.join(root, 'suspension.json')).catch((error) =>
        fail('WRITE_FAILED', { cause: error }),
      );
    }
    if (
      ![state.generationState, resumeTo].includes('suspended') &&
      state.generationState !== resumeTo
    ) {
      fail('INVALID_STATE');
    }
    const nextState = { ...state, generationState: resumeTo };
    await atomicWrite(
      context,
      path.join(root, 'state.json'),
      nextState,
      'resume',
      input.generationId,
      deps,
    );
    await clearTransition(context, root, marker, deps);
    return { generationState: nextState.generationState };
  });
}

async function reconcileRecord(input, deps) {
  commonInput(input, ['runId', 'workflowCapability', 'expectedInventoryDigest', 'confirmation']);
  opaque(input.runId);
  digestValue(input.expectedInventoryDigest);
  if (!booleanValue(input.confirmation)) fail('INVALID_PAYLOAD');
  const context = await ensureNamespace(input, deps);
  return await withLock(context, input.generationId, 'reconcile-record', deps, async () => {
    const evidence = await evidenceInventory(context, input.generationId);
    if (evidence.inventoryDigest !== input.expectedInventoryDigest) fail('STALE_REVIEW');
    const { target, record } = await loadReservation(context, input.generationId, input.runId);
    authenticate(input.workflowCapability, record.workflowCapabilityHash);
    if (record.kind === 'workflow-record') {
      await removeWorkflowTimingReceipts(context, evidence.root, input, null, deps);
      return { status: record.completionStatus, runId: input.runId };
    }
    if (record.kind !== 'workflow-reservation') fail('INVALID_STATE');
    assertReservationPolicy(record);
    const abandoned = {
      schema: RECORD_SCHEMA,
      kind: 'workflow-record',
      runId: record.runId,
      workflowCapabilityHash: record.workflowCapabilityHash,
      generationId: record.generationId,
      protocolDigest: record.protocolDigest,
      cohort: record.cohort,
      configState: record.configState,
      generationState: record.generationState,
      workflow: record.workflow,
      harnessFamily: record.harnessFamily,
      ordinal: record.ordinal,
      packets: record.packets.map((packet) => ({
        packetId: packet.packetId,
        selectedProfile: packet.selectedProfile,
        wouldBeFastEligible: packet.wouldBeFastEligible,
        firstGateReason: packet.gate.firstReason,
        implementationDuration: { status: 'unavailable' },
        fallback: 'none',
        escalated: false,
        costProxy: { status: 'unavailable' },
      })),
      validation: { status: 'unavailable', requiredCount: 0, totalCount: 0, satisfiedCount: 0 },
      review: {
        status: 'unavailable',
        severityCounts: { critical: 0, important: 0, note: 0 },
      },
      completionStatus: 'abandoned',
      qualityCorrectionRounds: 0,
      detailTrace: false,
    };
    await atomicWrite(context, target, abandoned, 'reconcile-record', input.generationId, deps);
    await removeWorkflowTimingReceipts(context, evidence.root, input, null, deps);
    return { status: 'abandoned', runId: input.runId };
  });
}

function probePid(pid, deps) {
  try {
    (deps.kill ?? process.kill)(pid, 0);
    return 'live-or-unknown';
  } catch (error) {
    return error?.code === 'ESRCH' ? 'stale-provable' : 'live-or-unknown';
  }
}

async function reconcileLock(input, deps) {
  commonInput(input, ['expectedLockDigest', 'confirmation'], ['lockName']);
  digestValue(input.expectedLockDigest);
  if (!booleanValue(input.confirmation)) fail('INVALID_PAYLOAD');
  const lockName = input.lockName ?? 'lifecycle.lock';
  if (lockName !== 'lifecycle.lock' && !/^packet-[A-Za-z0-9_-]{32,128}\.lock$/.test(lockName)) {
    fail('INVALID_PAYLOAD');
  }
  const context = await ensureNamespace(input, deps);
  const target = path.join(generationPath(context, input.generationId), 'locks', lockName);
  const identity = await lstat(target).catch((error) =>
    error?.code === 'ENOENT' ? fail('STALE_REVIEW') : Promise.reject(error),
  );
  if (!identity.isFile() || identity.isSymbolicLink()) fail('UNSAFE_STORAGE');
  const lock = validateLockRecord(await readJson(target), input.generationId, lockName);
  if (canonicalDigest(lock) !== input.expectedLockDigest) fail('STALE_REVIEW');
  if (probePid(lock.ownerPid, deps) !== 'stale-provable') fail('LOCKED');
  await repositoryGuard(input, deps, { mutation: true });
  const checked = await lstat(target).catch((error) =>
    error?.code === 'ENOENT' ? fail('STALE_REVIEW') : Promise.reject(error),
  );
  const current = validateLockRecord(await readJson(target), input.generationId, lockName);
  if (
    checked.dev !== identity.dev ||
    checked.ino !== identity.ino ||
    canonicalDigest(current) !== input.expectedLockDigest
  ) {
    fail('STALE_REVIEW');
  }
  await unlink(target).catch((error) => fail('WRITE_FAILED', { cause: error }));
  return { status: 'removed', lockDigest: input.expectedLockDigest };
}

async function reconcileTemporary(input, deps) {
  commonInput(input, ['temporaryName', 'ownerNonce', 'expectedDigest', 'confirmation']);
  const temporaryName = stringValue(input.temporaryName, 256);
  const ownerNonce = opaque(input.ownerNonce);
  digestValue(input.expectedDigest);
  if (!booleanValue(input.confirmation)) fail('INVALID_PAYLOAD');
  if (
    !new RegExp(`^\\.tmp-[a-z0-9-]+-${input.generationId}-${ownerNonce}-[A-Za-z0-9_-]{16}$`).test(
      temporaryName,
    )
  ) {
    fail('INVALID_PAYLOAD');
  }
  const context = await ensureNamespace(input, deps);
  const root = generationPath(context, input.generationId);
  let target = null;
  for (const directory of ['', 'records', 'traces', 'gate-observations', 'summaries', 'locks']) {
    const candidate = path.join(root, directory, temporaryName);
    if ((await readRegular(candidate, { missing: true })) !== null) {
      if (target !== null) fail('UNSAFE_STORAGE');
      target = candidate;
    }
  }
  if (target === null || (await fileDigest(target)) !== input.expectedDigest) fail('STALE_REVIEW');
  const identity = await lstat(target);
  let ownerLock = null;
  for (const entry of await safeEntries(path.join(root, 'locks'))) {
    if (entry.isFile() && entry.name.startsWith('.tmp-')) continue;
    if (
      !entry.isFile() ||
      (entry.name !== 'lifecycle.lock' && !/^packet-[A-Za-z0-9_-]{32,128}\.lock$/.test(entry.name))
    ) {
      fail('UNSAFE_STORAGE');
    }
    const lock = validateLockRecord(
      await readJson(path.join(root, 'locks', entry.name)),
      input.generationId,
      entry.name,
    );
    if (lock.nonce === ownerNonce) {
      if (ownerLock !== null) fail('UNSAFE_STORAGE');
      ownerLock = lock;
    }
  }
  if (ownerLock === null || probePid(ownerLock.ownerPid, deps) !== 'stale-provable') fail('LOCKED');
  await repositoryGuard(input, deps, { mutation: true });
  const checked = await lstat(target).catch((error) =>
    error?.code === 'ENOENT' ? fail('STALE_REVIEW') : Promise.reject(error),
  );
  if (
    checked.dev !== identity.dev ||
    checked.ino !== identity.ino ||
    (await fileDigest(target)) !== input.expectedDigest
  ) {
    fail('STALE_REVIEW');
  }
  await unlink(target).catch((error) => fail('WRITE_FAILED', { cause: error }));
  return { status: 'removed', temporaryDigest: input.expectedDigest };
}

function rational(numerator, denominator = 1n) {
  if (denominator === 0n) return null;
  let a = BigInt(numerator);
  let b = BigInt(denominator);
  if (b < 0n) {
    a = -a;
    b = -b;
  }
  let x = a < 0n ? -a : a;
  let y = b;
  while (y !== 0n) [x, y] = [y, x % y];
  return { numerator: String(a / x), denominator: String(b / x) };
}

function median(values) {
  if (values.length === 0) return null;
  const ordered = values
    .map(BigInt)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? rational(ordered[middle])
    : rational(ordered[middle - 1] + ordered[middle], 2n);
}

function addRational(left, right, sign = 1n) {
  if (left === null || right === null) return null;
  return rational(
    BigInt(left.numerator) * BigInt(right.denominator) +
      sign * BigInt(right.numerator) * BigInt(left.denominator),
    BigInt(left.denominator) * BigInt(right.denominator),
  );
}

function compareRational(left, comparison, right) {
  if (left === null) return 'unavailable';
  const a = BigInt(left.numerator) * BigInt(right.denominator);
  const b = BigInt(right.numerator) * BigInt(left.denominator);
  const pass = comparison === 'gte' ? a >= b : comparison === 'lte' ? a <= b : a < b;
  return pass ? 'pass' : 'fail';
}

function sumCost(packet) {
  return packet.costProxy?.status === 'available' ? BigInt(packet.costProxy.value) : null;
}

function ordinalHalves(records) {
  const ordered = [...records].sort((left, right) => left.ordinal - right.ordinal);
  const split = Math.floor(ordered.length / 2);
  const minimum = PILOT_MEASUREMENT_PROTOCOL.aggregation.ordinalHalfMinimum;
  const first = ordered.slice(0, split);
  const second = ordered.slice(split);
  return {
    first: { count: first.length, minimumMet: first.length >= minimum },
    second: { count: second.length, minimumMet: second.length >= minimum },
    minimumMet: first.length >= minimum && second.length >= minimum,
  };
}

function costGroups(packets) {
  const groups = new Map();
  for (const packet of packets) {
    if (packet.costProxy?.status !== 'available') continue;
    const key = `${packet.costProxy.kind}:${packet.costProxy.unit}`;
    const current = groups.get(key) ?? [];
    current.push(BigInt(packet.costProxy.value));
    groups.set(key, current);
  }
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => [key, { count: values.length, median: median(values) }]),
  );
}

function closedCounts(values, allowedValues) {
  const counts = Object.fromEntries(allowedValues.map((value) => [value, 0]));
  for (const value of values) counts[value] += 1;
  return counts;
}

function integerDistribution(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left - right));
}

function cohortMetrics(records, cohort) {
  const selected = records.filter((record) => record.cohort === cohort);
  const completed = selected.filter((record) => record.completionStatus === 'completed');
  const packets = selected.flatMap((record) => record.packets);
  const attemptedFast = packets.filter(
    (packet) => packet.selectedProfile === 'fast' || packet.fallback !== 'none',
  );
  const eligible = packets.filter((packet) => packet.wouldBeFastEligible);
  const costPackets =
    cohort === 'baseline'
      ? packets.filter(
          (packet) => packet.selectedProfile === 'quality' && packet.wouldBeFastEligible,
        )
      : attemptedFast;
  const requiredValidation = selected.filter((record) => record.validation.requiredCount > 0);
  const completedReview = selected.filter((record) => record.review.status === 'completed');
  const availableDurations = packets.filter(
    (packet) => packet.implementationDuration.status === 'available',
  );
  const halves = ordinalHalves(selected);
  return {
    workflowCount: selected.length,
    completedCount: completed.length,
    packetCount: packets.length,
    eligiblePacketCount: eligible.length,
    attemptedFastCount: attemptedFast.length,
    validationContributorCount: requiredValidation.length,
    reviewContributorCount: completedReview.length,
    durationContributorCount: availableDurations.length,
    ordinalHalves: halves,
    cohortMinimumMet: selected.length >= PILOT_MEASUREMENT_PROTOCOL.aggregation.cohortMinimum,
    completionOutcomes: closedCounts(
      selected.map(({ completionStatus }) => completionStatus),
      PILOT_MEASUREMENT_PROTOCOL.enums.completionStatuses,
    ),
    fallbackOutcomes: closedCounts(
      packets.map(({ fallback }) => fallback),
      PILOT_MEASUREMENT_POLICY_PROJECTION.fallbacks,
    ),
    durationOutcomes: closedCounts(
      packets.map((packet) => packet.implementationDuration.status),
      ['available', 'unavailable'],
    ),
    validationOutcomes: closedCounts(
      selected.map((record) => record.validation.status),
      PILOT_MEASUREMENT_PROTOCOL.enums.validationStatuses,
    ),
    reviewOutcomes: closedCounts(
      selected.map((record) => record.review.status),
      PILOT_MEASUREMENT_PROTOCOL.enums.reviewStatuses,
    ),
    fallbackOccurrences: attemptedFast.filter((packet) => packet.fallback !== 'none').length,
    fastWithoutEscalation: rational(
      BigInt(attemptedFast.filter((packet) => !packet.escalated).length),
      BigInt(attemptedFast.length),
    ),
    workflowCompletion: rational(BigInt(completed.length), BigInt(selected.length)),
    validationSuccess: rational(
      BigInt(requiredValidation.filter((record) => record.validation.status === 'passed').length),
      BigInt(requiredValidation.length),
    ),
    criticalFindingsPerCompleted: rational(
      BigInt(completed.reduce((sum, record) => sum + record.review.severityCounts.critical, 0)),
      BigInt(completed.length),
    ),
    qualityCorrectionMedian: median(
      completed.map((record) => BigInt(record.qualityCorrectionRounds)),
    ),
    durationMedianMs: median(
      availableDurations.map((packet) => BigInt(packet.implementationDuration.milliseconds)),
    ),
    costGroups: costGroups(costPackets),
    costUnavailableCount: costPackets.filter((packet) => sumCost(packet) === null).length,
  };
}

async function readObservations(root) {
  const observations = [];
  for (const entry of await safeEntries(path.join(root, 'gate-observations'))) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) fail('INCOMPLETE_EVIDENCE');
    const value = await readJson(path.join(root, 'gate-observations', entry.name));
    if (value.kind === 'gate-observation-reservation') fail('INCOMPLETE_EVIDENCE');
    if (value.kind !== 'gate-observation') fail('UNSAFE_STORAGE');
    observations.push(value);
  }
  return observations.sort((left, right) => left.ordinal - right.ordinal);
}

function observationMetrics(observations, cohort) {
  const selected = observations.filter((item) => item.cohort === cohort);
  const groups = {};
  for (const observation of selected) {
    const key = `${observation.mode}:${observation.harnessFamily}`;
    const group = (groups[key] ??= []);
    group.push(observation);
  }
  const grouped = Object.fromEntries(
    Object.entries(groups)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => {
        const checkContributors = values.filter(
          (item) => item.requiredChecksSatisfied !== 'unavailable',
        );
        return [
          key,
          {
            observationCount: values.length,
            checkContributorCount: checkContributors.length,
            minimumMet:
              values.length >= PILOT_MEASUREMENT_PROTOCOL.aggregation.periodObservationMinimum,
            terminalOutcomes: closedCounts(
              values.map(({ terminalOutcome }) => terminalOutcome),
              PILOT_MEASUREMENT_PROTOCOL.enums.observationOutcomes,
            ),
            corrections: {
              ciRepair: integerDistribution(values.map((item) => item.corrections.ciRepair)),
              configuredReviewer: integerDistribution(
                values.map((item) => item.corrections.configuredReviewer),
              ),
              conflictResolution: integerDistribution(
                values.map((item) => item.corrections.conflictResolution),
              ),
            },
            correctionMedian: median(
              values.map(
                (item) =>
                  BigInt(item.corrections.ciRepair) +
                  BigInt(item.corrections.configuredReviewer) +
                  BigInt(item.corrections.conflictResolution),
              ),
            ),
            checksSatisfied: rational(
              BigInt(
                checkContributors.filter((item) => item.requiredChecksSatisfied === true).length,
              ),
              BigInt(checkContributors.length),
            ),
          },
        ];
      }),
  );
  return {
    observationCount: selected.length,
    groups: grouped,
  };
}

function compatibleCostRatio(baseline, pilot) {
  const minimum = PILOT_MEASUREMENT_PROTOCOL.aggregation.metricStratumMinimum;
  const common = Object.keys(baseline.costGroups).filter((key) =>
    Object.hasOwn(pilot.costGroups, key),
  );
  if (
    common.length !== 1 ||
    baseline.costUnavailableCount !== 0 ||
    pilot.costUnavailableCount !== 0
  ) {
    return null;
  }
  const baselineGroup = baseline.costGroups[common[0]];
  const pilotGroup = pilot.costGroups[common[0]];
  if (baselineGroup.count < minimum || pilotGroup.count < minimum) return null;
  return rational(
    BigInt(pilotGroup.median.numerator) * BigInt(baselineGroup.median.denominator),
    BigInt(pilotGroup.median.denominator) * BigInt(baselineGroup.median.numerator),
  );
}

function groupedObservationDelta(baseline, pilot) {
  const keys = [...new Set([...Object.keys(baseline.groups), ...Object.keys(pilot.groups)])].sort();
  if (keys.length === 0) return null;
  const deltas = [];
  for (const key of keys) {
    const before = baseline.groups[key];
    const after = pilot.groups[key];
    if (!before?.minimumMet || !after?.minimumMet) return null;
    deltas.push(addRational(after.correctionMedian, before.correctionMedian, -1n));
  }
  if (deltas.some((value) => value === null)) return null;
  return deltas.reduce((worst, value) =>
    compareRational(value, 'gte', worst) === 'pass' ? value : worst,
  );
}

function evaluationInputs(baseline, pilot, baselineObservations, pilotObservations) {
  const minimum = PILOT_MEASUREMENT_PROTOCOL.aggregation.metricStratumMinimum;
  const cohortsReady =
    baseline.cohortMinimumMet &&
    pilot.cohortMinimumMet &&
    baseline.ordinalHalves.minimumMet &&
    pilot.ordinalHalves.minimumMet;
  return {
    eligibleBaselinePackets:
      baseline.eligiblePacketCount >= minimum
        ? rational(BigInt(baseline.eligiblePacketCount))
        : null,
    fastWithoutEscalation:
      cohortsReady && pilot.attemptedFastCount >= minimum ? pilot.fastWithoutEscalation : null,
    fallbackOccurrences:
      cohortsReady && pilot.attemptedFastCount >= minimum
        ? rational(BigInt(pilot.fallbackOccurrences))
        : null,
    workflowCompletionDelta: cohortsReady
      ? addRational(pilot.workflowCompletion, baseline.workflowCompletion, -1n)
      : null,
    validationSuccessDelta:
      cohortsReady &&
      baseline.validationContributorCount >= minimum &&
      pilot.validationContributorCount >= minimum &&
      baseline.validationSuccess !== null &&
      pilot.validationSuccess !== null
        ? addRational(pilot.validationSuccess, baseline.validationSuccess, -1n)
        : null,
    criticalReviewFindingDelta:
      cohortsReady && baseline.completedCount >= minimum && pilot.completedCount >= minimum
        ? addRational(
            pilot.criticalFindingsPerCompleted,
            baseline.criticalFindingsPerCompleted,
            -1n,
          )
        : null,
    qualityCorrectionMedianDelta:
      cohortsReady && baseline.completedCount >= minimum && pilot.completedCount >= minimum
        ? addRational(pilot.qualityCorrectionMedian, baseline.qualityCorrectionMedian, -1n)
        : null,
    mergeGateCorrectionMedianDelta: groupedObservationDelta(
      baselineObservations,
      pilotObservations,
    ),
    compatibleCostMedianRatio: cohortsReady ? compatibleCostRatio(baseline, pilot) : null,
  };
}

function publicationCell(value, sampleSize) {
  return sampleSize < PILOT_MEASUREMENT_PROTOCOL.aggregation.suppressionMinimum
    ? { suppressed: true }
    : value;
}

function publicationDistribution(distribution) {
  const minimum = PILOT_MEASUREMENT_PROTOCOL.aggregation.suppressionMinimum;
  return Object.values(distribution).some((count) => count < minimum)
    ? { suppressed: true }
    : { ...distribution };
}

function publicationDynamicDistribution(distribution) {
  return publicationDistribution(distribution);
}

function publicationCohort(metrics) {
  const allSuppressed =
    metrics.workflowCount < PILOT_MEASUREMENT_PROTOCOL.aggregation.suppressionMinimum;
  if (allSuppressed) return { suppressed: true };
  const completionOutcomes = publicationDistribution(metrics.completionOutcomes);
  const fallbackOutcomes = publicationDistribution(metrics.fallbackOutcomes);
  const durationOutcomes = publicationDistribution(metrics.durationOutcomes);
  const validationOutcomes = publicationDistribution(metrics.validationOutcomes);
  const reviewOutcomes = publicationDistribution(metrics.reviewOutcomes);
  return {
    suppressed: false,
    workflowCount: publicationCell(metrics.workflowCount, metrics.workflowCount),
    completedCount: completionOutcomes.suppressed
      ? { suppressed: true }
      : publicationCell(metrics.completedCount, metrics.completedCount),
    packetCount: publicationCell(metrics.packetCount, metrics.packetCount),
    eligiblePacketCount: publicationCell(metrics.eligiblePacketCount, metrics.eligiblePacketCount),
    attemptedFastCount: publicationCell(metrics.attemptedFastCount, metrics.attemptedFastCount),
    completionOutcomes,
    fallbackOutcomes,
    durationOutcomes,
    validationOutcomes,
    reviewOutcomes,
    fallbackOccurrences: fallbackOutcomes.suppressed
      ? { suppressed: true }
      : publicationCell(metrics.fallbackOccurrences, metrics.attemptedFastCount),
    fastWithoutEscalation: fallbackOutcomes.suppressed
      ? { suppressed: true }
      : publicationCell(metrics.fastWithoutEscalation, metrics.attemptedFastCount),
    workflowCompletion: completionOutcomes.suppressed
      ? { suppressed: true }
      : publicationCell(metrics.workflowCompletion, metrics.workflowCount),
    validationSuccess: validationOutcomes.suppressed
      ? { suppressed: true }
      : publicationCell(metrics.validationSuccess, metrics.validationContributorCount),
    criticalFindingsPerCompleted: completionOutcomes.suppressed
      ? { suppressed: true }
      : publicationCell(metrics.criticalFindingsPerCompleted, metrics.completedCount),
    qualityCorrectionMedian: publicationCell(
      metrics.qualityCorrectionMedian,
      metrics.completedCount,
    ),
    durationMedianMs: publicationCell(metrics.durationMedianMs, metrics.durationContributorCount),
  };
}

function publicationObservations(metrics) {
  const suppressGroups = Object.values(metrics.groups).some(
    (group) => group.observationCount < PILOT_MEASUREMENT_PROTOCOL.aggregation.suppressionMinimum,
  );
  const groups = Object.fromEntries(
    Object.entries(metrics.groups).map(([key, group]) => [
      key,
      suppressGroups
        ? { suppressed: true }
        : {
            suppressed: false,
            observationCount: group.observationCount,
            terminalOutcomes: publicationDistribution(group.terminalOutcomes),
            corrections: Object.fromEntries(
              Object.entries(group.corrections).map(([correction, distribution]) => [
                correction,
                publicationDynamicDistribution(distribution),
              ]),
            ),
            correctionMedian: group.correctionMedian,
            checksSatisfied: publicationCell(group.checksSatisfied, group.checkContributorCount),
          },
    ]),
  );
  return {
    observationCount: publicationCell(metrics.observationCount, metrics.observationCount),
    groups,
  };
}

async function aggregateGeneration(input, deps) {
  commonInput(input, ['expectedInventoryDigest']);
  digestValue(input.expectedInventoryDigest);
  const context = await ensureNamespace(input, deps);
  return await withLock(context, input.generationId, 'aggregate', deps, async () => {
    const evidence = await evidenceInventory(context, input.generationId);
    if (evidence.state.generationState !== 'review') fail('INVALID_STATE');
    if (evidence.inventoryDigest !== input.expectedInventoryDigest) fail('STALE_REVIEW');
    if (
      evidence.invalidMembers.length > 0 ||
      evidence.incompleteRecords.length > 0 ||
      evidence.incompleteTimings.length > 0 ||
      evidence.incompleteObservations.length > 0 ||
      evidence.orphanTemporaries.length > 0
    ) {
      fail('INCOMPLETE_EVIDENCE');
    }
    const records = evidence.workflows.filter(({ kind }) => kind === 'workflow-record');
    const observations = evidence.observations.filter(({ kind }) => kind === 'gate-observation');
    const baseline = cohortMetrics(records, 'baseline');
    const pilot = cohortMetrics(records, 'pilot');
    const baselineObservations = observationMetrics(observations, 'baseline');
    const pilotObservations = observationMetrics(observations, 'pilot');
    const privateView = {
      schema: 1,
      kind: 'pilot-private-decision',
      protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
      algorithmVersion: PILOT_MEASUREMENT_PROTOCOL.aggregation.algorithmVersion,
      groupingVersion: PILOT_MEASUREMENT_PROTOCOL.aggregation.groupingVersion,
      caveat: PILOT_MEASUREMENT_PROTOCOL.aggregation.caveat,
      cohorts: { baseline, pilot },
      observations: { baseline: baselineObservations, pilot: pilotObservations },
      evaluationInputs: evaluationInputs(baseline, pilot, baselineObservations, pilotObservations),
    };
    const decisionDigest = canonicalDigest(privateView);
    const minimum = PILOT_MEASUREMENT_PROTOCOL.aggregation.suppressionMinimum;
    const publication = {
      schema: 1,
      kind: 'pilot-publication-candidate',
      protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
      caveat: PILOT_MEASUREMENT_PROTOCOL.aggregation.caveat,
      cohorts: {
        baseline: publicationCohort(baseline),
        pilot: publicationCohort(pilot),
      },
      observations: {
        baseline: publicationObservations(baselineObservations),
        pilot: publicationObservations(pilotObservations),
      },
    };
    const publicationDigest = canonicalDigest(publication);
    const reviewBinding = {
      schema: 1,
      generationId: input.generationId,
      protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
      decisionDigest,
      publicationDigest,
      evidenceInventoryDigest: evidence.inventoryDigest,
      memberDigests: evidence.inventory.members.map(({ class: memberClass, digest }) => ({
        class: memberClass,
        digest,
      })),
      aggregationVersion: PILOT_MEASUREMENT_PROTOCOL.aggregation.algorithmVersion,
      groupingVersion: PILOT_MEASUREMENT_PROTOCOL.aggregation.groupingVersion,
      suppressionMinimum: minimum,
    };
    const reviewDigest = canonicalDigest(reviewBinding);
    await atomicWrite(
      context,
      path.join(evidence.root, 'summaries', 'private.json'),
      privateView,
      'aggregate',
      input.generationId,
      deps,
    );
    await atomicWrite(
      context,
      path.join(evidence.root, 'summaries', 'publication.json'),
      publication,
      'aggregate',
      input.generationId,
      deps,
    );
    await atomicWrite(
      context,
      path.join(evidence.root, 'summaries', 'review.json'),
      { ...reviewBinding, reviewDigest },
      'aggregate',
      input.generationId,
      deps,
    );
    return { generationId: input.generationId, decisionDigest, publicationDigest, reviewDigest };
  });
}

async function validateReviewBinding(context, generationId, expected = {}) {
  const root = generationPath(context, generationId);
  const privateView = await readJson(path.join(root, 'summaries', 'private.json'));
  const publication = await readJson(path.join(root, 'summaries', 'publication.json'));
  const review = await readJson(path.join(root, 'summaries', 'review.json'));
  exactObject(privateView, [
    'schema',
    'kind',
    'protocolDigest',
    'algorithmVersion',
    'groupingVersion',
    'caveat',
    'cohorts',
    'observations',
    'evaluationInputs',
  ]);
  exactObject(publication, [
    'schema',
    'kind',
    'protocolDigest',
    'caveat',
    'cohorts',
    'observations',
  ]);
  exactObject(review, [
    'schema',
    'generationId',
    'protocolDigest',
    'decisionDigest',
    'publicationDigest',
    'evidenceInventoryDigest',
    'memberDigests',
    'aggregationVersion',
    'groupingVersion',
    'suppressionMinimum',
    'reviewDigest',
  ]);
  const reviewBody = Object.fromEntries(
    Object.entries(review).filter(([key]) => key !== 'reviewDigest'),
  );
  const evidence = await evidenceInventory(context, generationId);
  const invalid =
    privateView.schema !== 1 ||
    privateView.kind !== 'pilot-private-decision' ||
    publication.schema !== 1 ||
    publication.kind !== 'pilot-publication-candidate' ||
    review.schema !== 1 ||
    review.generationId !== generationId ||
    evidence.state.generationState !== 'review' ||
    privateView.protocolDigest !== PILOT_MEASUREMENT_PROTOCOL_DIGEST ||
    publication.protocolDigest !== PILOT_MEASUREMENT_PROTOCOL_DIGEST ||
    review.protocolDigest !== PILOT_MEASUREMENT_PROTOCOL_DIGEST ||
    privateView.algorithmVersion !== PILOT_MEASUREMENT_PROTOCOL.aggregation.algorithmVersion ||
    privateView.groupingVersion !== PILOT_MEASUREMENT_PROTOCOL.aggregation.groupingVersion ||
    review.aggregationVersion !== PILOT_MEASUREMENT_PROTOCOL.aggregation.algorithmVersion ||
    review.groupingVersion !== PILOT_MEASUREMENT_PROTOCOL.aggregation.groupingVersion ||
    review.suppressionMinimum !== PILOT_MEASUREMENT_PROTOCOL.aggregation.suppressionMinimum ||
    review.decisionDigest !== canonicalDigest(privateView) ||
    review.publicationDigest !== canonicalDigest(publication) ||
    review.reviewDigest !== canonicalDigest(reviewBody) ||
    review.evidenceInventoryDigest !== evidence.inventoryDigest ||
    (expected.decisionDigest !== undefined && review.decisionDigest !== expected.decisionDigest) ||
    (expected.reviewDigest !== undefined && review.reviewDigest !== expected.reviewDigest);
  if (invalid) fail('STALE_REVIEW');
  return { root, privateView, publication, review, evidence };
}

async function evaluateGeneration(input, deps) {
  commonInput(input, ['decisionDigest', 'reviewDigest', 'protocolDigest']);
  digestValue(input.decisionDigest);
  digestValue(input.reviewDigest);
  assertProtocol(PILOT_MEASUREMENT_PROTOCOL_VERSION, input.protocolDigest);
  const context = await inspectNamespace(input, deps);
  if (!context.exists) fail('NOT_FOUND');
  const { privateView } = await validateReviewBinding(context, input.generationId, {
    decisionDigest: input.decisionDigest,
    reviewDigest: input.reviewDigest,
  });
  const gates = PILOT_MEASUREMENT_PROTOCOL.adoptionGates.map((gate) => ({
    gate: gate.gate,
    result: compareRational(
      privateView.evaluationInputs[gate.metric],
      gate.comparison,
      gate.threshold,
    ),
  }));
  return {
    generationId: input.generationId,
    decisionDigest: input.decisionDigest,
    reviewDigest: input.reviewDigest,
    gates,
    keepEligible: gates.every(({ result }) => result === 'pass'),
  };
}

async function assertKnownGenerationTree(root) {
  const allowed = new Set([
    'records',
    'traces',
    'gate-observations',
    'summaries',
    'locks',
    'state.json',
    'suspension.json',
    'suspension-transition.json',
  ]);
  for (const entry of await safeEntries(root)) {
    if (!allowed.has(entry.name)) fail('UNSAFE_STORAGE');
  }
  for (const directory of ['records', 'traces', 'gate-observations', 'summaries', 'locks']) {
    for (const entry of await safeEntries(path.join(root, directory))) {
      if (!entry.isFile() || entry.name.startsWith('.tmp-')) fail('UNSAFE_STORAGE');
      await readRegular(path.join(root, directory, entry.name));
    }
  }
}

async function removeTombstone(context, target, input, deps) {
  const parent = path.join(context.namespace, 'tombstones');
  if (
    path.dirname(target) !== parent ||
    !path.basename(target).startsWith(`${input.generationId}-`)
  ) {
    fail('UNSAFE_STORAGE');
  }
  const info = await lstat(target).catch((error) =>
    error?.code === 'ENOENT' ? null : Promise.reject(error),
  );
  if (info === null) return;
  if (info.isSymbolicLink() || !info.isDirectory()) fail('UNSAFE_STORAGE');
  await repositoryGuard(input, deps, { mutation: true });
  await rm(target, { recursive: true, force: false }).catch((error) =>
    fail('WRITE_FAILED', { cause: error }),
  );
}

async function purgeGeneration(input, deps) {
  commonInput(input, ['dryRun'], ['reviewDigest', 'confirmation']);
  booleanValue(input.dryRun);
  const context = input.dryRun
    ? await inspectNamespace(input, deps)
    : await ensureNamespace(input, deps);
  if (!context.exists) {
    return { generationId: input.generationId, generationStatus: 'absent', normalTombstones: 0 };
  }
  const root = generationPath(context, input.generationId);
  if (!(await directoryState(root))) {
    const tombstones = await scanTombstones(context, input.generationId);
    if (!input.dryRun) {
      digestValue(input.reviewDigest);
      if (!booleanValue(input.confirmation)) fail('INVALID_PAYLOAD');
      const target = path.join(
        context.namespace,
        'tombstones',
        `${input.generationId}-${input.reviewDigest.replace(':', '-')}`,
      );
      if (
        tombstones.discard.length > 0 ||
        tombstones.normal.some((name) => name !== path.basename(target))
      ) {
        fail('STALE_REVIEW');
      }
      await removeTombstone(context, target, input, deps);
    }
    const remaining = await scanTombstones(context, input.generationId);
    return {
      generationId: input.generationId,
      generationStatus: 'absent',
      normalTombstones: remaining.normal.length,
    };
  }
  await assertKnownGenerationTree(root);
  const { review } = await validateReviewBinding(context, input.generationId);
  const reviewDigest = review.reviewDigest;
  if (input.dryRun) {
    return {
      generationId: input.generationId,
      generationStatus: 'present',
      reviewDigest,
      inventory: await inventoryOperation(input, deps),
    };
  }
  exactObject(input, [
    'runtimeStateRoot',
    'repositoryIdentity',
    'generationId',
    'dryRun',
    'reviewDigest',
    'confirmation',
  ]);
  digestValue(input.reviewDigest);
  if (!booleanValue(input.confirmation) || input.reviewDigest !== reviewDigest)
    fail('STALE_REVIEW');
  return await withLock(context, input.generationId, 'purge', deps, async () => {
    await assertKnownGenerationTree(root);
    await validateReviewBinding(context, input.generationId, {
      reviewDigest: input.reviewDigest,
    });
    const target = path.join(
      context.namespace,
      'tombstones',
      `${input.generationId}-${input.reviewDigest.replace(':', '-')}`,
    );
    await repositoryGuard(input, deps, { mutation: true });
    await rename(root, target).catch((error) => fail('WRITE_FAILED', { cause: error }));
    await removeTombstone(context, target, input, deps);
    if (await directoryState(root)) {
      await assertKnownGenerationTree(root);
      await repositoryGuard(input, deps, { mutation: true });
      await rm(root, { recursive: true, force: false }).catch((error) =>
        fail('WRITE_FAILED', { cause: error }),
      );
    }
    const remaining = await scanTombstones(context, input.generationId);
    return {
      generationId: input.generationId,
      generationStatus: 'absent',
      normalTombstones: remaining.normal.length,
    };
  });
}

async function opaqueFullInventory(root) {
  return await opaqueInventory(root, null);
}

async function opaqueInventory(root, excluded) {
  const members = [];
  const counts = { regularFiles: 0, directories: 0 };
  let totalBytes = 0;
  async function visit(directory, relative) {
    for (const entry of await safeEntries(directory)) {
      const child = path.join(directory, entry.name);
      const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (childRelative === excluded) continue;
      if (entry.isDirectory()) {
        counts.directories += 1;
        members.push({ type: 'directory', nameDigest: canonicalDigest({ path: childRelative }) });
        await visit(child, childRelative);
      } else if (entry.isFile()) {
        const raw = await rawFileDigest(
          child,
          PILOT_MEASUREMENT_PROTOCOL.limits.maxRawGenerationBytes - totalBytes,
        );
        counts.regularFiles += 1;
        totalBytes += raw.bytes;
        if (totalBytes > PILOT_MEASUREMENT_PROTOCOL.limits.maxRawGenerationBytes) {
          fail('CAPACITY_EXHAUSTED');
        }
        members.push({
          type: 'regular-file',
          nameDigest: canonicalDigest({ path: childRelative }),
          bytes: raw.bytes,
          contentDigest: raw.digest,
        });
      } else fail('UNSAFE_STORAGE');
    }
  }
  await visit(root, '');
  members.sort((left, right) => left.nameDigest.localeCompare(right.nameDigest));
  return {
    schema: 1,
    counts,
    totalBytes,
    members,
    fullInventoryDigest: canonicalDigest({ counts, totalBytes, members }),
  };
}

async function discardGeneration(input, deps) {
  commonInput(
    input,
    ['configState', 'dryRun'],
    ['fullInventoryDigest', 'decision', 'confirmation'],
  );
  enumValue(input.configState, ['disabled']);
  booleanValue(input.dryRun);
  const context = input.dryRun
    ? await inspectNamespace(input, deps)
    : await ensureNamespace(input, deps);
  if (!context.exists) {
    return { generationId: input.generationId, generationStatus: 'absent', discardTombstones: 0 };
  }
  const root = generationPath(context, input.generationId);
  if (!(await directoryState(root))) {
    const tombstones = await scanTombstones(context, input.generationId);
    if (!input.dryRun) {
      digestValue(input.fullInventoryDigest);
      enumValue(input.decision, PILOT_MEASUREMENT_PROTOCOL.enums.discardDecisions);
      if (!booleanValue(input.confirmation)) fail('INVALID_PAYLOAD');
      const target = path.join(
        context.namespace,
        'tombstones',
        `${input.generationId}-discard-${input.fullInventoryDigest.replace(':', '-')}`,
      );
      if (
        tombstones.normal.length > 0 ||
        tombstones.discard.some((name) => name !== path.basename(target))
      ) {
        fail('STALE_REVIEW');
      }
      await removeTombstone(context, target, input, deps);
    }
    const remaining = await scanTombstones(context, input.generationId);
    return {
      generationId: input.generationId,
      generationStatus: 'absent',
      discardTombstones: remaining.discard.length,
    };
  }
  const state = await readJson(path.join(root, 'state.json'));
  if (state.generationState !== 'review') fail('INVALID_STATE');
  await assertNoGenerationLocks(root, input.generationId);
  const inventory = await opaqueFullInventory(root);
  await assertNoGenerationLocks(root, input.generationId);
  if (input.dryRun) {
    return {
      generationId: input.generationId,
      generationStatus: 'present',
      counts: inventory.counts,
      totalBytes: inventory.totalBytes,
      fullInventoryDigest: inventory.fullInventoryDigest,
      keepEligible: false,
    };
  }
  exactObject(input, [
    'runtimeStateRoot',
    'repositoryIdentity',
    'generationId',
    'configState',
    'dryRun',
    'fullInventoryDigest',
    'decision',
    'confirmation',
  ]);
  digestValue(input.fullInventoryDigest);
  enumValue(input.decision, PILOT_MEASUREMENT_PROTOCOL.enums.discardDecisions);
  if (
    !booleanValue(input.confirmation) ||
    input.fullInventoryDigest !== inventory.fullInventoryDigest
  ) {
    fail('STALE_REVIEW');
  }
  return await withLock(context, input.generationId, 'discard-generation', deps, async () => {
    // The lock itself is excluded because it is owned by this confirmed discard operation.
    const lockPath = path.join(root, 'locks', 'lifecycle.lock');
    const lockInfo = await lstat(lockPath);
    if (!lockInfo.isFile()) fail('LOCKED');
    const reviewed = await opaqueFullInventoryExcluding(root, 'locks/lifecycle.lock');
    if (reviewed.fullInventoryDigest !== input.fullInventoryDigest || lockInfo.size <= 0) {
      fail('STALE_REVIEW');
    }
    const target = path.join(
      context.namespace,
      'tombstones',
      `${input.generationId}-discard-${input.fullInventoryDigest.replace(':', '-')}`,
    );
    await repositoryGuard(input, deps, { mutation: true });
    await rename(root, target).catch((error) => fail('WRITE_FAILED', { cause: error }));
    await removeTombstone(context, target, input, deps);
    if (await directoryState(root)) {
      await repositoryGuard(input, deps, { mutation: true });
      await rm(root, { recursive: true, force: false }).catch((error) =>
        fail('WRITE_FAILED', { cause: error }),
      );
    }
    const remaining = await scanTombstones(context, input.generationId);
    return {
      generationId: input.generationId,
      generationStatus: 'absent',
      discardTombstones: remaining.discard.length,
      keepEligible: false,
    };
  });
}

async function opaqueFullInventoryExcluding(root, excluded) {
  return await opaqueInventory(root, excluded);
}

async function executeOperationUnchecked(operation, input, deps) {
  if (!PILOT_MEASUREMENT_OPERATIONS.includes(operation)) fail('INVALID_OPERATION');
  if (!isObject(input)) fail('INVALID_PAYLOAD');
  if (
    Buffer.byteLength(JSON.stringify(input)) > PILOT_MEASUREMENT_PROTOCOL.limits.maxCliInputBytes
  ) {
    fail('CAPACITY_EXHAUSTED');
  }
  let result;
  switch (operation) {
    case 'protocol':
      exactObject(input, []);
      result = protocolProjection();
      break;
    case 'inventory':
      result = await inventoryOperation(input, deps);
      break;
    case 'begin-baseline':
      result = await beginBaseline(input, deps);
      break;
    case 'activate':
      result = await activate(input, deps);
      break;
    case 'start':
      result = await startWorkflow(input, deps);
      break;
    case 'start-packet':
      result = await startPacket(input, deps);
      break;
    case 'finish-packet':
      result = await finishPacket(input, deps);
      break;
    case 'finalize':
      result = await finalizeWorkflow(input, deps);
      break;
    case 'start-gate-observation':
      result = await startGateObservation(input, deps);
      break;
    case 'finalize-gate-observation':
      result = await finalizeGateObservation(input, deps);
      break;
    case 'suspend':
      result = await suspendGeneration(input, deps);
      break;
    case 'resume':
      result = await resumeGeneration(input, deps);
      break;
    case 'reconcile-record':
      result = await reconcileRecord(input, deps);
      break;
    case 'reconcile-lock':
      result = await reconcileLock(input, deps);
      break;
    case 'reconcile-temporary':
      result = await reconcileTemporary(input, deps);
      break;
    case 'begin-review':
      result = await beginReview(input, deps);
      break;
    case 'aggregate':
      result = await aggregateGeneration(input, deps);
      break;
    case 'evaluate':
      result = await evaluateGeneration(input, deps);
      break;
    case 'purge':
      result = await purgeGeneration(input, deps);
      break;
    case 'discard-generation':
      result = await discardGeneration(input, deps);
      break;
  }
  return baseResult(operation, result);
}

export async function executeOperation(operation, input, deps = {}) {
  try {
    return await executeOperationUnchecked(operation, input, deps);
  } catch (error) {
    if (!(error instanceof PilotMeasurementError) || error.code !== 'CAPACITY_EXHAUSTED') {
      throw error;
    }
    let persisted = false;
    if (
      isObject(input) &&
      typeof input.runtimeStateRoot === 'string' &&
      typeof input.repositoryIdentity === 'string' &&
      typeof input.generationId === 'string' &&
      OPAQUE.test(input.generationId)
    ) {
      persisted = await persistPilotControl(input, deps, 'capacity-exhausted');
    }
    throw new PilotMeasurementError('CAPACITY_EXHAUSTED', {
      cause: error,
      pilotControlOutcome: 'capacity-exhausted',
      controlStatePersisted: persisted,
      alert: persisted ? 'none' : 'value-free',
    });
  }
}
