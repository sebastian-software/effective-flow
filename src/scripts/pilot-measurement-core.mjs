import { createHash, randomBytes as cryptoRandomBytes, timingSafeEqual } from 'node:crypto';
import { constants as fsConstants, readFileSync, readdirSync, readlinkSync } from 'node:fs';
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
  rmdir,
  stat,
  unlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { UNKNOWN_HOST } from './effective-flow-state-core.mjs';
import {
  localHost,
  procStatFields,
  processStartTime,
  sessionOwner,
} from './effective-flow-state-planning-claim-core.mjs';
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
  'record-incident',
  'resume',
  'reconcile-record',
  'reconcile-lock',
  'reconcile-temporary',
  'list-reservations',
  'abandon-reservation',
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
  'ADMISSION_CHANGED',
  'PROFILE_UNAVAILABLE',
]);

// Closed, value-free reasons an UNSAFE_RUNTIME_ROOT error names in `details.reason`; a
// `git-failed` reason also names its bare Git subcommand. Neither ever carries a path or Git output.
export const UNSAFE_RUNTIME_ROOT_REASONS = Object.freeze([
  'git-unavailable',
  'git-failed',
  'not-directory',
  'toplevel-mismatch',
  'identity-mismatch',
  'path-resolution',
  'tracked-runtime-state',
  'not-ignored',
]);
const GIT_SUBCOMMANDS = Object.freeze(['rev-parse', 'ls-files', 'check-ignore']);
const ROOT_DETAILS = Object.freeze(
  Object.fromEntries(
    UNSAFE_RUNTIME_ROOT_REASONS.map((reason) => [reason, Object.freeze({ reason })]),
  ),
);
const GIT_FAILED_DETAILS = Object.freeze(
  Object.fromEntries(
    GIT_SUBCOMMANDS.map((subcommand) => [
      subcommand,
      Object.freeze({ reason: 'git-failed', subcommand }),
    ]),
  ),
);

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
  ADMISSION_CHANGED: 12,
  PROFILE_UNAVAILABLE: 13,
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
  ADMISSION_CHANGED: 'pilot measurement admission closed before the Fast spawn',
  PROFILE_UNAVAILABLE: 'the Fast profile is unavailable for this installation and harness',
});

const OWNER = Object.freeze({ schema: 1, owner: 'effective-flow-model-tiering-pilot' });
// Schemas of the current protocol's evidence. A generation bound to a prior protocol keeps the
// LEGACY_* shapes: its state has no qualification snapshot, its records no `installKind`,
// `overlapped` or `modelCompliance`, its reservations no transient owner or overlap fields, and its
// observations and timing receipts none of the 1.3.0 fields.
const STATE_SCHEMA = 2;
const RECORD_SCHEMA = 3;
const TRACE_SCHEMA = 1;
const OBSERVATION_SCHEMA = 2;
const TIMING_SCHEMA = 2;
const LEGACY_STATE_SCHEMA = 1;
const LEGACY_RECORD_SCHEMA = 2;
const LEGACY_OBSERVATION_SCHEMA = 1;
const LEGACY_TIMING_SCHEMA = 1;
const QUALIFICATION_MAX_BYTES = 64 * 1024;
const HOST_VERSION = /^(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})$/;
const PROBE_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const MAPPING_IDENTITY = /^[0-9a-f]{64}$/;
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
  'record-incident',
  'begin-review',
  'resume',
  'reconcile-record',
  'aggregate',
  'purge',
  'discard-generation',
]);
// The one-step migration suspends a generation recorded under a prior protocol with the reason of
// its digest; its evidence never continues under the current protocol.
const QUALITY_MAPPING_CHANGED = 'quality-mapping-changed';
const PROTOCOL_PARAMETERS_CHANGED = 'protocol-parameters-changed';
// Every earlier protocol a release persisted generations under, by digest. Each digest was derived
// by importing src/scripts/pilot-measurement-protocol.mjs at a release tag and reading
// PILOT_MEASUREMENT_PROTOCOL_DIGEST: 1.1.0 shipped in releases 1.66.0 through 1.67.1 (the
// Quality-mapping identity changed after it), 1.2.0 in releases 1.68.0 through 1.76.0 (the
// baseline, cohort, workflow, and record parameters changed after it).
const PRIOR_PROTOCOLS = new Map([
  [
    'sha256:18ff022103e4ff0f5d5aebb492f58e738fdabbbfe367f6594b8dad2c80f15e3d',
    Object.freeze({ version: '1.1.0', reason: QUALITY_MAPPING_CHANGED }),
  ],
  [
    'sha256:a39232140a24ffcfb95f1165cea2343e4593c32dc3594ef81a6d9295505b099c',
    Object.freeze({ version: '1.2.0', reason: PROTOCOL_PARAMETERS_CHANGED }),
  ],
]);
function priorProtocol(digest) {
  return PRIOR_PROTOCOLS.get(digest) ?? null;
}
function isLegacyDigest(digest) {
  return PRIOR_PROTOCOLS.has(digest);
}
// Every suspension reason the protocol defines, plus the migrations', may leave a transition marker
// behind, and each of them bypasses the raw-capacity check so a suspension can still be written at
// the capacity limit.
const SUSPENSION_REASONS = Object.freeze([
  ...new Set([
    ...PILOT_MEASUREMENT_POLICY_PROJECTION.pilotControlMappings
      .map(({ suspensionReason }) => suspensionReason)
      .filter((reason) => reason !== 'none'),
    ...[...PRIOR_PROTOCOLS.values()].map(({ reason }) => reason),
  ]),
]);
const TRANSITION_MARKER_OPERATIONS = new Set([...SUSPENSION_REASONS, 'suspend', 'resume']);
// The review exit skips the migration: begin-review closes admission and keeps the stored binding,
// so the inventory digest a caller read before the lock still matches, and discard needs review.
const MIGRATION_EXEMPT_OPERATIONS = new Set(['begin-review', 'discard-generation']);
const CAPACITY_EXEMPT_OPERATIONS = new Set([...SUSPENSION_REASONS, 'suspend']);
// Temporary file names embed the writing operation. These names are fixed by the helper and the
// protocol rather than supplied by a caller, so they are checked against this closed set instead
// of the credential screen that applies to caller tokens: `critical-authorization-incident` would
// otherwise read as credential material.
const WRITE_OPERATIONS = new Set([
  ...LIFECYCLE_LOCK_OPERATIONS,
  ...TRANSITION_MARKER_OPERATIONS,
  'begin-baseline',
  'start-packet',
  'finish-packet',
  'namespace-lock',
  'namespace-init-lock',
]);
// Incident categories map to their protocol outcome here, so no caller ever names the outcome.
const INCIDENT_OUTCOMES = Object.freeze({
  safety: 'critical-safety-incident',
  'data-integrity': 'critical-data-integrity-incident',
  authorization: 'critical-authorization-incident',
  scope: 'critical-scope-incident',
});
const INCIDENT_OUTCOME_SET = new Set(Object.values(INCIDENT_OUTCOMES));
for (const outcome of INCIDENT_OUTCOME_SET) {
  if (!SUSPENSION_REASONS.includes(outcome)) {
    throw new Error(`incident outcome ${outcome} is not a protocol suspension reason`);
  }
}
// Codes that leave the pilot untouched when finalization or a gate observation fails: caller
// errors, lock contention, location and version faults, and a missing generation or record.
const CONTROL_NEUTRAL_CODES = new Set([
  'INVALID_PAYLOAD',
  'AUTHENTICATION_FAILED',
  'LOCKED',
  'UNSAFE_RUNTIME_ROOT',
  'MIGRATION_REQUIRED',
  'PROTOCOL_DRIFT',
  'NOT_FOUND',
]);
const RECEIPT_FAULT = Symbol('pilot-measurement-receipt-fault');
// The helper keeps each gate observation's raw capability in a capability file of its own below
// `.effective-flow/pilot-observation-handles/<generationId>/`, a sibling of the pilot namespace, so
// no generation tree, closed name set, or evidence inventory sees it. Finalization replaces the
// file by a consumed marker that holds only the capability hash.
const HANDLE_ROOT = 'pilot-observation-handles';
const HANDLE_SCHEMA = 1;
const HANDLE_MAX_BYTES = 4 * 1024;
const HANDLE_KIND = 'gate-observation-handle';
const CONSUMED_HANDLE_KIND = 'gate-observation-handle-consumed';
const HANDLE_FILE = /^[A-Za-z0-9_-]{32,128}\.json$/;

// A programming error in a `details` shape; never mapped to a runtime-root reason.
class InvalidErrorDetails extends Error {}

function validDetails(code, details) {
  if (code !== 'UNSAFE_RUNTIME_ROOT' || !isObject(details)) return false;
  const keys = Object.keys(details);
  if (!UNSAFE_RUNTIME_ROOT_REASONS.includes(details.reason)) return false;
  if (details.reason === 'git-failed') {
    return (
      keys.length === 2 &&
      keys.includes('subcommand') &&
      GIT_SUBCOMMANDS.includes(details.subcommand)
    );
  }
  return keys.length === 1;
}

export class PilotMeasurementError extends Error {
  constructor(code, options = {}) {
    // This module is the only raiser of UNSAFE_RUNTIME_ROOT, so every one must name its check.
    const needsDetails = options.details !== undefined || code === 'UNSAFE_RUNTIME_ROOT';
    if (needsDetails && !validDetails(code, options.details)) {
      throw new InvalidErrorDetails('pilot measurement error details are outside the closed set');
    }
    super(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.WRITE_FAILED, { cause: options.cause });
    this.name = 'PilotMeasurementError';
    this.code = code;
    this.exitCode = EXIT_CODES[code] ?? 1;
    if (options.details !== undefined) {
      this.details =
        options.details.reason === 'git-failed'
          ? GIT_FAILED_DETAILS[options.details.subcommand]
          : ROOT_DETAILS[options.details.reason];
    }
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

function writeOperationName(value) {
  if (!WRITE_OPERATIONS.has(value) || !/^[a-z0-9-]+$/.test(value)) fail('INVALID_PAYLOAD');
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

function unsafeRoot(reason, cause) {
  fail('UNSAFE_RUNTIME_ROOT', { details: ROOT_DETAILS[reason], cause });
}

// A rejecting runner stays uncaught here; `statusReasons` maps a non-allowed exit status to a
// caller-named reason. The status is only compared, never reported.
async function gitCall(runner, cwd, args, allowed = [0], statusReasons = {}) {
  if (typeof runner !== 'function') unsafeRoot('git-unavailable');
  const result = await runner({ executable: 'git', args: ['-C', cwd, ...args], cwd });
  if (result?.error) unsafeRoot('git-unavailable');
  if (!allowed.includes(result?.status)) {
    if (Object.hasOwn(statusReasons, result?.status)) unsafeRoot(statusReasons[result.status]);
    fail('UNSAFE_RUNTIME_ROOT', { details: GIT_FAILED_DETAILS[args[0]] });
  }
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
    if (!(await stat(root)).isDirectory()) unsafeRoot('not-directory');
    const top = await realpath(await gitCall(deps.runner, root, ['rev-parse', '--show-toplevel']));
    if (top !== root) unsafeRoot('toplevel-mismatch');
    const common = await gitCall(deps.runner, root, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]);
    identity = await realpath(common);
    if (identity !== (await realpath(input.repositoryIdentity))) unsafeRoot('identity-mismatch');
  } catch (error) {
    if (error instanceof PilotMeasurementError || error instanceof InvalidErrorDetails) throw error;
    unsafeRoot('path-resolution', error);
  }
  const tracked = await gitCall(deps.runner, root, ['ls-files', '--', '.effective-flow/']);
  if (tracked !== '') unsafeRoot('tracked-runtime-state');
  for (const target of ['.effective-flow', '.effective-flow/model-tiering-pilot']) {
    // `check-ignore -q` exits 1 for a path that is not ignored; any other failure is `git-failed`.
    await gitCall(deps.runner, root, ['check-ignore', '--no-index', '-q', '--', target], [0], {
      1: 'not-ignored',
    });
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

function observationHandleRoot(context) {
  return path.join(context.runtimeDirectory, HANDLE_ROOT);
}

function observationHandleDirectory(context, generationId) {
  return path.join(observationHandleRoot(context), opaque(generationId));
}

function observationHandlePath(context, generationId, observationId) {
  return path.join(
    observationHandleDirectory(context, generationId),
    `${opaque(observationId)}.json`,
  );
}

// Capability files live outside the pilot namespace, so their root carries its own ignore check;
// `repositoryGuard` already proves all of `.effective-flow/` untracked.
async function observationHandleGuard(context, deps, { mutation = true } = {}) {
  await repositoryGuard(context.input, deps, { mutation });
  await gitCall(
    deps.runner,
    context.root,
    ['check-ignore', '--no-index', '-q', '--', `.effective-flow/${HANDLE_ROOT}`],
    [0],
    { 1: 'not-ignored' },
  );
}

// Whether every directory on the way to the generation's capability files exists; a symlinked or
// non-directory component is unsafe storage.
async function observationHandleDirectoryExists(context, generationId) {
  for (const target of [
    context.runtimeDirectory,
    observationHandleRoot(context),
    observationHandleDirectory(context, generationId),
  ]) {
    if (!(await directoryState(target))) return false;
  }
  return true;
}

async function removeObservationHandle(context, target, deps) {
  try {
    await observationHandleGuard(context, deps);
    await unlink(target);
    await syncDirectory(context, path.dirname(target), deps);
  } catch {}
}

async function writeObservationHandle(context, generationId, observationId, capability, deps) {
  await observationHandleGuard(context, deps);
  if (!(await directoryState(context.runtimeDirectory))) fail('UNSAFE_STORAGE');
  for (const target of [
    observationHandleRoot(context),
    observationHandleDirectory(context, generationId),
  ]) {
    if (await directoryState(target)) continue;
    await guardedMkdir(context, target, deps);
    await syncDirectory(context, path.dirname(target), deps);
  }
  const target = observationHandlePath(context, generationId, observationId);
  const value = {
    schema: HANDLE_SCHEMA,
    kind: HANDLE_KIND,
    generationId,
    observationId,
    capability,
  };
  try {
    await writeExclusiveJson(context, target, value, deps);
  } catch (error) {
    // An existing file was never this call's own; any other failure may have left a partial one.
    if (!(error instanceof PilotMeasurementError && error.code === 'INVALID_STATE')) {
      await removeObservationHandle(context, target, deps);
    }
    throw error;
  }
  return target;
}

function validateObservationHandle(value, generationId, observationId) {
  if (!isObject(value)) fail('UNSAFE_STORAGE');
  const secret =
    value.kind === HANDLE_KIND
      ? 'capability'
      : value.kind === CONSUMED_HANDLE_KIND
        ? 'capabilityHash'
        : null;
  const keys = ['schema', 'kind', 'generationId', 'observationId', secret];
  if (
    secret === null ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key)) ||
    value.schema !== HANDLE_SCHEMA ||
    typeof value.generationId !== 'string' ||
    !OPAQUE.test(value.generationId) ||
    typeof value.observationId !== 'string' ||
    !OPAQUE.test(value.observationId) ||
    typeof value[secret] !== 'string' ||
    !(secret === 'capability' ? OPAQUE : DIGEST).test(value[secret])
  ) {
    fail('UNSAFE_STORAGE');
  }
  // A well-formed file bound to another observation authenticates nothing.
  if (value.generationId !== generationId || value.observationId !== observationId) {
    fail('AUTHENTICATION_FAILED');
  }
  return value;
}

// Returns the observation's capability file, raw or consumed, or null when none exists.
async function readObservationHandle(context, generationId, observationId, deps) {
  await observationHandleGuard(context, deps);
  if (!(await observationHandleDirectoryExists(context, generationId))) return null;
  const source = await readRegular(observationHandlePath(context, generationId, observationId), {
    missing: true,
    maximum: HANDLE_MAX_BYTES,
  });
  if (source === null) return null;
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    fail('UNSAFE_STORAGE', { cause: error });
  }
  return validateObservationHandle(value, generationId, observationId);
}

// Replaces a raw capability file by its consumed marker once the finalized record is durable. A
// failure is swallowed: the remaining raw file only lets a repeat call answer `finalized` again,
// until its generation is removed.
async function consumeObservationHandle(
  context,
  generationId,
  observationId,
  capabilityHash,
  deps,
) {
  try {
    await observationHandleGuard(context, deps);
    const target = observationHandlePath(context, generationId, observationId);
    await atomicWrite(
      context,
      target,
      {
        schema: HANDLE_SCHEMA,
        kind: CONSUMED_HANDLE_KIND,
        generationId,
        observationId,
        capabilityHash,
      },
      'finalize-gate-observation',
      generationId,
      deps,
      HANDLE_MAX_BYTES,
      { skipCapacity: true },
    );
    await syncDirectory(context, path.dirname(target), deps);
  } catch {}
}

// The requested generation's capability-file names, or null without a directory. Only
// `<opaque>.json` regular files and `.tmp-*` leftovers belong there.
async function observationHandleNames(context, generationId) {
  if (!(await observationHandleDirectoryExists(context, generationId))) return null;
  const entries = await safeEntries(observationHandleDirectory(context, generationId));
  for (const entry of entries) {
    if (!entry.isFile() || !(HANDLE_FILE.test(entry.name) || entry.name.startsWith('.tmp-'))) {
      fail('UNSAFE_STORAGE');
    }
  }
  return entries.map(({ name }) => name).sort();
}

const EMPTY_OBSERVATION_HANDLES_DIGEST = canonicalDigest({
  counts: { regularFiles: 0, directories: 0 },
  totalBytes: 0,
  members: [],
});

// The value-free view purge and discard show of one generation's capability files; the digest is
// the opaque inventory a confirmed run for an absent generation must echo.
async function observationHandleInventory(context, generationId, deps, { mutation = false } = {}) {
  await observationHandleGuard(context, deps, { mutation });
  const names = await observationHandleNames(context, generationId);
  if (names === null) {
    return { exists: false, count: 0, digest: EMPTY_OBSERVATION_HANDLES_DIGEST };
  }
  const inventory = await opaqueInventory(observationHandleDirectory(context, generationId), null);
  return {
    exists: true,
    count: names.filter((name) => HANDLE_FILE.test(name)).length,
    digest: inventory.fullInventoryDigest,
  };
}

// Removes only the requested generation's capability files: each regular file by `unlink`, then
// the emptied directory by `rmdir`, never recursively and never another generation's directory.
async function removeObservationHandles(context, generationId, deps) {
  await observationHandleGuard(context, deps);
  const names = await observationHandleNames(context, generationId);
  if (names === null) return;
  const directory = observationHandleDirectory(context, generationId);
  for (const name of names) {
    await unlink(path.join(directory, name)).catch((error) => {
      if (error?.code !== 'ENOENT') fail('WRITE_FAILED', { cause: error });
    });
  }
  await rmdir(directory).catch((error) => {
    if (error?.code === 'ENOTEMPTY') fail('UNSAFE_STORAGE', { cause: error });
    if (error?.code !== 'ENOENT') fail('WRITE_FAILED', { cause: error });
  });
  await syncDirectory(context, observationHandleRoot(context), deps);
}

async function regularFileSize(target, { missing = false } = {}, deps = {}) {
  let info;
  try {
    info = await (deps.lstat ?? lstat)(target);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      if (missing) return null;
      fail('NOT_FOUND', { cause: error });
    }
    fail('UNSAFE_STORAGE', { cause: error });
  }
  if (info.isSymbolicLink() || !info.isFile()) fail('UNSAFE_STORAGE');
  return info.size;
}

// Sums the raw bytes below a generation. Packet writers publish their temporaries concurrently
// (link, then unlink), so an entry that vanishes between listing and lstat, or a nested directory
// that vanishes before it is listed, contributes nothing; every entry that still exists is counted.
async function rawTreeBytes(root, deps = {}) {
  let total = 0;
  async function visit(directory, nested) {
    if (!(await directoryState(directory))) {
      if (nested) return;
      fail('NOT_FOUND');
    }
    let entries;
    try {
      entries = await (deps.readdir ?? readdir)(directory, { withFileTypes: true });
    } catch (error) {
      if (nested && error?.code === 'ENOENT') return;
      fail(error?.code === 'ENOENT' ? 'NOT_FOUND' : 'UNSAFE_STORAGE', { cause: error });
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
        fail('UNSAFE_STORAGE');
      }
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target, true);
      else {
        total += (await regularFileSize(target, { missing: true }, deps)) ?? 0;
        if (!Number.isSafeInteger(total)) fail('CAPACITY_EXHAUSTED');
      }
    }
  }
  await visit(root, false);
  return total;
}

function capacityControlWrite(operation) {
  return CAPACITY_EXEMPT_OPERATIONS.has(operation);
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
    `.tmp-${writeOperationName(operation)}-${generationId === 'namespace' ? 'namespace' : opaque(generationId)}-${ownerNonce}-${nonce}`,
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
    let projectedBytes;
    try {
      const replacedBytes = (await regularFileSize(target, { missing: true }, deps)) ?? 0;
      projectedBytes = (await rawTreeBytes(root, deps)) - replacedBytes;
    } catch (error) {
      await unlink(temporary).catch(() => {});
      if (error instanceof PilotMeasurementError) throw error;
      fail('UNSAFE_STORAGE', { cause: error });
    }
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
  await atomicWrite(
    { ...context, activeLock: value },
    target,
    value,
    operation,
    generationId,
    deps,
    undefined,
    { noReplace: true, existsCode: 'LOCKED', skipCapacity: true },
  );
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

function validateStagedLockRecord(value, generationId, temporaryName) {
  const identity = temporaryIdentity(temporaryName, generationId);
  exactObject(value, ['schema', 'operation', 'generationId', 'ownerPid', 'nonce']);
  if (
    value.schema !== 1 ||
    value.operation !== identity.operation ||
    value.generationId !== generationId ||
    !Number.isSafeInteger(value.ownerPid) ||
    value.ownerPid <= 0 ||
    value.nonce !== identity.ownerNonce ||
    (!LIFECYCLE_LOCK_OPERATIONS.has(value.operation) &&
      !['start-packet', 'finish-packet'].includes(value.operation))
  ) {
    fail('UNSAFE_STORAGE');
  }
  return value;
}

// An unlocked control fallback stages its marker without a lock record; the staged marker proves
// its own writer through the pid it carries.
function validateStagedMarkerRecord(value, generationId, temporaryName) {
  const identity = temporaryIdentity(temporaryName, generationId);
  // Stored content that is no self-proving marker (such as a locked write's marker without a pid)
  // is a storage mismatch, not a caller error.
  try {
    exactObject(value, ['schema', 'kind', 'generationId', 'operation', 'ownerNonce', 'ownerPid']);
  } catch (error) {
    fail('UNSAFE_STORAGE', { cause: error });
  }
  if (
    value.schema !== 1 ||
    value.kind !== 'suspension-transition' ||
    value.generationId !== generationId ||
    value.operation !== identity.operation ||
    !SUSPENSION_REASONS.includes(value.operation) ||
    value.ownerNonce !== identity.ownerNonce ||
    !Number.isSafeInteger(value.ownerPid) ||
    value.ownerPid <= 0
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
    if (!MIGRATION_EXEMPT_OPERATIONS.has(operation)) {
      await migratePreviousProtocolGeneration(context, generationId, deps);
    }
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

// The closed record of one installed Fast-harness qualification probe.
function validateQualificationRecord(value) {
  exactObject(value, [
    'installKind',
    'harnessFamily',
    'outcome',
    'hostVersion',
    'probedOn',
    'fastMappingIdentity',
  ]);
  enumValue(value.installKind, PILOT_MEASUREMENT_PROTOCOL.enums.installKinds);
  enumValue(value.harnessFamily, PILOT_MEASUREMENT_PROTOCOL.enums.harnessFamilies);
  enumValue(value.outcome, PILOT_MEASUREMENT_PROTOCOL.enums.qualificationOutcomes);
  if (
    (value.hostVersion !== null &&
      (typeof value.hostVersion !== 'string' || !HOST_VERSION.test(value.hostVersion))) ||
    (value.outcome === 'qualified' && value.hostVersion === null) ||
    typeof value.probedOn !== 'string' ||
    !PROBE_DATE.test(value.probedOn) ||
    new Date(`${value.probedOn}T00:00:00.000Z`).toISOString().slice(0, 10) !== value.probedOn ||
    typeof value.fastMappingIdentity !== 'string' ||
    !MAPPING_IDENTITY.test(value.fastMappingIdentity)
  ) {
    fail('INVALID_PAYLOAD');
  }
  return {
    installKind: value.installKind,
    harnessFamily: value.harnessFamily,
    outcome: value.outcome,
    hostVersion: value.hostVersion,
    probedOn: value.probedOn,
    fastMappingIdentity: value.fastMappingIdentity,
  };
}

// The qualification records in canonical order, exactly one per install kind and harness family.
function validateQualificationRecords(records) {
  if (!Array.isArray(records) || records.length > 64) fail('INVALID_PAYLOAD');
  const validated = records.map(validateQualificationRecord);
  const keys = validated.map(({ installKind, harnessFamily }) => `${installKind}:${harnessFamily}`);
  if (new Set(keys).size !== keys.length) fail('INVALID_PAYLOAD');
  return validated.sort((left, right) =>
    `${left.installKind}:${left.harnessFamily}`.localeCompare(
      `${right.installKind}:${right.harnessFamily}`,
    ),
  );
}

// A qualification view, installed or snapshotted: `{status: 'available', schemaVersion, records}`
// or `{status: 'unavailable'}`.
function validateQualificationView(value) {
  if (!isObject(value)) fail('INVALID_PAYLOAD');
  if (value.status === 'unavailable') {
    exactObject(value, ['status']);
    return { status: 'unavailable' };
  }
  exactObject(value, ['status', 'schemaVersion', 'records']);
  if (
    value.status !== 'available' ||
    value.schemaVersion !== PILOT_MEASUREMENT_PROTOCOL.harnessQualification.schemaVersion
  ) {
    fail('INVALID_PAYLOAD');
  }
  const records = validateQualificationRecords(value.records);
  if (canonicalizeJson(records) !== canonicalizeJson(value.records)) fail('INVALID_PAYLOAD');
  return { status: 'available', schemaVersion: value.schemaVersion, records };
}

// The installed qualification file beside the pilot scripts, read only from the installed skill
// root (`deps.harnessQualificationPath` replaces the location in tests). An absent, oversized,
// unreadable, or malformed file is `unavailable`, which makes portable Fast unavailable; this read
// never fails an operation.
async function readInstalledQualification(deps) {
  const location =
    deps.harnessQualificationPath ??
    new URL(`./${PILOT_MEASUREMENT_PROTOCOL.harnessQualification.file}`, import.meta.url);
  let handle;
  try {
    handle = await open(location, fsConstants.O_RDONLY | (fsConstants.O_NONBLOCK ?? 0));
    const info = await handle.stat();
    if (!info.isFile() || info.size > QUALIFICATION_MAX_BYTES) return { status: 'unavailable' };
    const parsed = JSON.parse(await handle.readFile('utf8'));
    exactObject(parsed, ['schemaVersion', 'records']);
    if (parsed.schemaVersion !== PILOT_MEASUREMENT_PROTOCOL.harnessQualification.schemaVersion) {
      return { status: 'unavailable' };
    }
    return {
      status: 'available',
      schemaVersion: parsed.schemaVersion,
      records: validateQualificationRecords(parsed.records),
    };
  } catch {
    return { status: 'unavailable' };
  } finally {
    await handle?.close().catch(() => {});
  }
}

function qualificationRecord(view, installKind, harnessFamily) {
  if (view?.status !== 'available') return null;
  return (
    view.records.find(
      (record) => record.installKind === installKind && record.harnessFamily === harnessFamily,
    ) ?? null
  );
}

// Gate row 1 for a portable Fast selection: the harness is `qualified` in the generation snapshot
// and the snapshot's Fast-mapping identity equals the installed record's. Native installations keep
// their sidecar rule. The host version is checked per packet in verification, not here.
async function assertFastProfileAvailable(state, installKind, harnessFamily, deps) {
  if (installKind !== 'portable') return;
  const snapshotted = qualificationRecord(state.harnessQualification, installKind, harnessFamily);
  if (snapshotted?.outcome !== 'qualified') fail('PROFILE_UNAVAILABLE');
  const installed = qualificationRecord(
    await readInstalledQualification(deps),
    installKind,
    harnessFamily,
  );
  if (installed === null || installed.fastMappingIdentity !== snapshotted.fastMappingIdentity) {
    fail('PROFILE_UNAVAILABLE');
  }
}

const LEGACY_STATE_FIELDS = Object.freeze([
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

// `previousProtocol` also admits a state bound to a prior protocol in PRIOR_PROTOCOLS, in that
// protocol's shape; every other protocol identity stays UNSAFE_STORAGE.
function validatePersistedState(state, generationId, { previousProtocol = false } = {}) {
  const prior = isObject(state) ? priorProtocol(state.protocolDigest) : null;
  const legacy = previousProtocol && prior !== null;
  exactObject(
    state,
    legacy ? LEGACY_STATE_FIELDS : [...LEGACY_STATE_FIELDS, 'harnessQualification'],
  );
  if (!legacy) {
    try {
      validateQualificationView(state.harnessQualification);
    } catch (error) {
      fail('UNSAFE_STORAGE', { cause: error });
    }
  }
  if (
    state.schema !== (legacy ? LEGACY_STATE_SCHEMA : STATE_SCHEMA) ||
    state.kind !== 'pilot-generation-state' ||
    state.generationId !== generationId ||
    !(legacy
      ? state.protocolVersion === prior.version
      : state.protocolVersion === PILOT_MEASUREMENT_PROTOCOL_VERSION &&
        state.protocolDigest === PILOT_MEASUREMENT_PROTOCOL_DIGEST) ||
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
  if (
    value.schema !== 1 ||
    value.kind !== 'pilot-suspension' ||
    value.generationId !== generationId ||
    value.status !== 'suspended' ||
    !['baseline', 'active'].includes(value.resumeTo) ||
    !Array.isArray(value.reasons) ||
    value.reasons.length === 0 ||
    value.reasons.some((reason) => !SUSPENSION_REASONS.includes(reason)) ||
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
    ['expectedInventoryDigest', 'expectedSuspensionDigest', 'resumeTo', 'ownerPid'],
  );
  if (
    marker.schema !== 1 ||
    marker.kind !== 'suspension-transition' ||
    !TRANSITION_MARKER_OPERATIONS.has(marker.operation) ||
    !OPAQUE.test(marker.generationId) ||
    !OPAQUE.test(marker.ownerNonce) ||
    (marker.expectedInventoryDigest !== undefined &&
      !DIGEST.test(marker.expectedInventoryDigest)) ||
    (marker.expectedSuspensionDigest !== undefined &&
      !DIGEST.test(marker.expectedSuspensionDigest)) ||
    (marker.resumeTo !== undefined && !['baseline', 'active'].includes(marker.resumeTo)) ||
    (marker.ownerPid !== undefined &&
      (!Number.isSafeInteger(marker.ownerPid) ||
        marker.ownerPid <= 0 ||
        !SUSPENSION_REASONS.includes(marker.operation)))
  ) {
    fail('UNSAFE_STORAGE');
  }
  return marker;
}

async function beginTransition(context, root, generationId, operation, deps, extra = {}) {
  const requested = {
    schema: 1,
    kind: 'suspension-transition',
    generationId,
    operation,
    ...extra,
  };
  // An existing marker is reused only when it describes this very transition.
  const reuse = (current) => {
    const comparable = { ...current };
    delete comparable.ownerNonce;
    delete comparable.ownerPid;
    if (canonicalizeJson(comparable) !== canonicalizeJson(requested)) fail('INVALID_STATE');
    return current;
  };
  const current = await transitionMarker(root);
  if (current !== null) return reuse(current);
  const marker = {
    ...requested,
    ownerNonce: context.activeLock?.nonce ?? randomOpaque(deps, 24),
  };
  // Publish exclusively: a marker the unlocked fallback created after the read above must survive.
  // An identical one is adopted and completed here; any other fails and is rolled forward later.
  try {
    await atomicWrite(
      context,
      path.join(root, 'suspension-transition.json'),
      marker,
      operation,
      generationId,
      deps,
      undefined,
      { noReplace: true, existsCode: 'INVALID_STATE' },
    );
  } catch (error) {
    if (!(error instanceof PilotMeasurementError) || error.code !== 'INVALID_STATE') throw error;
    const published = await transitionMarker(root);
    if (published === null) throw error;
    return reuse(published);
  }
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

async function admissionClosed(evidence) {
  const transition = await transitionMarker(evidence.root);
  return (
    evidence.suspension !== null ||
    transition !== null ||
    !['baseline', 'active'].includes(evidence.state.generationState)
  );
}

async function assertAdmissionOpen(context, evidence) {
  if (await admissionClosed(evidence)) fail('INVALID_STATE');
  assertEvidenceHealthy(context, evidence);
}

// The admission check for a new reservation or observation: open reservations, packet timings, and
// observations of other runs are allowed (they overlap), while invalid members, orphan temporaries,
// a timing receipt left behind a terminal record, and a foreign lock still fail closed.
function assertEvidenceSound(context, evidence) {
  if (
    evidence.invalidMembers.length > 0 ||
    evidence.orphanTemporaries.length > 0 ||
    evidence.leftoverTimings.length > 0
  ) {
    fail('INCOMPLETE_EVIDENCE');
  }
  if (evidence.locks.some(({ nonce }) => nonce !== context.activeLock?.nonce)) {
    fail('UNSAFE_STORAGE');
  }
}

// Marks overlap without linkage: every open workflow reservation other than `exceptRunId` gets its
// transient overlap flag set. Nothing records which reservation or observation caused it.
async function flagOpenReservations(context, evidence, exceptRunId, operation, deps) {
  for (const workflow of evidence.workflows) {
    if (
      workflow.kind !== 'workflow-reservation' ||
      workflow.runId === exceptRunId ||
      workflow.overlapFlag
    ) {
      continue;
    }
    await atomicWrite(
      context,
      path.join(evidence.root, 'records', `${workflow.runId}.json`),
      { ...workflow, overlapFlag: true },
      operation,
      evidence.inventory.generationId,
      deps,
      PILOT_MEASUREMENT_PROTOCOL.limits.maxWorkflowRecordBytes,
    );
  }
}

// Whether a workflow reservation other than `runId` is open, and (with `observations`) whether a
// gate observation is open. It reads under the caller's lifecycle or packet lock, which excludes
// every writer of reservations and observations.
async function otherReservationOpen(root, generationId, runId, { observations = false } = {}) {
  for (const entry of await safeEntries(path.join(root, 'records'))) {
    const match = /^([A-Za-z0-9_-]{32,128})\.json$/.exec(entry.name);
    if (!entry.isFile() || match === null || match[1] === runId) continue;
    const value = await readEvidenceJson(path.join(root, 'records', entry.name), {
      maximum: PILOT_MEASUREMENT_PROTOCOL.limits.maxWorkflowRecordBytes,
    });
    if (validateStoredWorkflow(value, generationId, match[1]).kind === 'workflow-reservation') {
      return true;
    }
  }
  if (!observations) return false;
  for (const entry of await safeEntries(path.join(root, 'gate-observations'))) {
    const match = /^([A-Za-z0-9_-]{32,128})\.json$/.exec(entry.name);
    if (!entry.isFile() || match === null) continue;
    const value = await readEvidenceJson(path.join(root, 'gate-observations', entry.name));
    if (
      validateStoredObservation(value, generationId, match[1]).kind ===
      'gate-observation-reservation'
    ) {
      return true;
    }
  }
  return false;
}

// Whether a lock staging file in `locks` is a leftover: its writer is provably gone, judged like
// `reconcile-temporary` judges it, by the `ownerPid` of the staged lock record (a reused pid keeps
// a real orphan looking live, the same limit). A stage that vanished meanwhile is none. A stage
// without a valid record also counts, failing safe: a live writer's stage is unparseable only for
// the instant between its exclusive create and its write, and closing Fast admission then costs
// only a Quality start.
async function orphanedLockStaging(target, generationId, deps) {
  let value;
  try {
    value = await readJson(target, { missing: true });
    if (value === null) return false;
    validateStagedLockRecord(value, generationId, path.basename(target));
  } catch {
    return true;
  }
  return probePid(value.ownerPid, deps) === 'stale-provable';
}

// Whether generation evidence other than `runId`'s own holds a leftover that closes Fast admission:
// a packet timing receipt of another run (also one left behind by a terminal record whose finalize
// or reconcile-record faulted before removing it), a records member of no known shape, a temporary
// file without a held owner lock, or a lock staging file whose writer is provably gone. It reads
// under the caller's packet lock: concurrent packet writers stage temporaries under their held
// lock, and a concurrent lock acquisition stages its lock record before any lock exists.
async function foreignEvidenceLeftover(root, generationId, runId, deps) {
  const temporaries = [];
  for (const directory of ['', 'records', 'traces', 'gate-observations', 'summaries', 'locks']) {
    for (const entry of await safeEntries(path.join(root, directory))) {
      if (entry.name.startsWith('.tmp-')) {
        if (directory !== 'locks') {
          temporaries.push(path.join(root, directory, entry.name));
        } else if (
          await orphanedLockStaging(path.join(root, 'locks', entry.name), generationId, deps)
        ) {
          // No held lock vouches for a lock staging file; the staged record names its writer.
          return true;
        }
        continue;
      }
      if (directory !== 'records') continue;
      const timing = /^([A-Za-z0-9_-]{32,128})\.[A-Za-z0-9_-]{32,128}\.timing\.json$/.exec(
        entry.name,
      );
      const workflowName = /^[A-Za-z0-9_-]{32,128}\.json$/.test(entry.name);
      if (
        !entry.isFile() ||
        (timing === null && !workflowName) ||
        (timing !== null && timing[1] !== runId)
      ) {
        return true;
      }
    }
  }
  if (temporaries.length === 0) return false;
  const heldNonces = new Set();
  for (const entry of await safeEntries(path.join(root, 'locks'))) {
    if (!entry.isFile() || entry.name.startsWith('.tmp-')) continue;
    const lock = await readJson(path.join(root, 'locks', entry.name), { missing: true });
    if (lock !== null) heldNonces.add(lock.nonce);
  }
  for (const target of temporaries) {
    let ownerNonce = null;
    try {
      ({ ownerNonce } = temporaryIdentity(path.basename(target), generationId));
    } catch {}
    // A writer removes its temporary before releasing its lock, so a temporary still present after
    // the lock scan found no held owner lock is a leftover.
    if (!heldNonces.has(ownerNonce) && (await pathExists(target))) return true;
  }
  return false;
}

// The host a reservation's owner pid is meaningful on: the host name, the kernel boot id, and the pid
// namespace inode of `pid` (`self` for the calling helper). A host name alone is shared by a
// container with its own pid namespace and by two machines of one name, and either would read
// another host's live session as gone; the boot id separates machines and boots, the namespace
// separates containers. `/proc/self` must name this helper's own pid, or the mounted procfs belongs
// to another pid namespace and its pids name other processes. Null when any part is unreadable.
// `deps.readBootId()`, `deps.readPidNamespace(pid)`, and `deps.readProcSelf()` replace the procfs
// reads.
const BOOT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PID_NAMESPACE = /^pid:\[[1-9][0-9]{0,19}\]$/;
function pidNamespaceOf(pid, deps) {
  try {
    const value = (deps.readPidNamespace ?? ((target) => readlinkSync(`/proc/${target}/ns/pid`)))(
      pid,
    );
    return typeof value === 'string' && PID_NAMESPACE.test(value) ? value : null;
  } catch {
    return null;
  }
}
function hostIdentity(pid, deps) {
  const hostname = localHost(deps);
  if (hostname === UNKNOWN_HOST || (pid !== 'self' && !(Number.isSafeInteger(pid) && pid > 0))) {
    return null;
  }
  let bootId;
  let procSelf;
  try {
    bootId = (deps.readBootId ?? (() => readFileSync('/proc/sys/kernel/random/boot_id', 'utf8')))();
    procSelf = (deps.readProcSelf ?? (() => readlinkSync('/proc/self')))();
  } catch {
    return null;
  }
  if (typeof bootId !== 'string' || procSelf !== String(process.pid)) return null;
  bootId = bootId.trim();
  const pidNamespace = pidNamespaceOf(pid, deps);
  if (!BOOT_ID.test(bootId) || pidNamespace === null) return null;
  return { hostname, bootId, pidNamespace };
}

// The opaque owner salt is 24 random bytes (32 base64url characters), then a host binding of 16
// bytes (22 characters), then up to two ancestor digests of 12 bytes (16 characters) each. The host
// binding digests the random part with the owner's host identity (null when it was unreadable) and
// the ancestor digests. An ancestor digest names, salted by the random part and the host identity,
// one recorded ancestor of the owner by pid and start time: the parent of the owner and its parent
// in turn, while each is readable with its start time and in the owner's pid namespace, so a helper
// started through a wrapper (`timeout`, a subshell, a sandbox launcher) whose short-lived shell is
// the recorded owner is still tied to its live session. The whole salt, 54 to 86 characters, keeps
// the `[A-Za-z0-9_-]{32,128}` form every 1.3.0 helper validates, so the stored reservation keeps
// exactly the 1.3.0 shape, while a later session can test whether it runs on the owner's host and
// whether any recorded process is still live.
const OWNER_SALT_RANDOM_LENGTH = 32;
const OWNER_SALT_BINDING_LENGTH = 22;
const OWNER_ANCESTOR_LENGTH = 16;
const OWNER_ANCESTOR_LIMIT = 2;
function truncatedDigest(value, bytes) {
  const digest = canonicalDigest(value);
  return Buffer.from(digest.slice('sha256:'.length, 'sha256:'.length + bytes * 2), 'hex').toString(
    'base64url',
  );
}
function hostBinding(random, identity, ancestors) {
  return truncatedDigest({ kind: 'reservation-host', random, identity, ancestors }, 16);
}
function ancestorDigest(random, identity, pid, pidStartTime) {
  return truncatedDigest({ kind: 'reservation-ancestor', random, identity, pid, pidStartTime }, 12);
}

// The parent pid of `pid` (`/proc/<pid>/stat` field 4), or null when it is unreadable or init.
// `deps.readProcStat(pid)` replaces the procfs read.
function parentProcessId(pid, deps) {
  const parent = procStatFields(pid, deps)?.[1] ?? '';
  return /^[1-9][0-9]{0,9}$/.test(parent) && Number(parent) > 1 ? Number(parent) : null;
}

// The ancestor digests of a resolved owner: up to OWNER_ANCESTOR_LIMIT levels above it, stopping
// at the first one that is init, whose pid or start time is unreadable, or whose pid namespace is
// unreadable or not the owner's. An unreadable ancestor is never guessed; the salt then binds
// fewer.
function ownerAncestors(ownerPid, identity, random, deps) {
  const ancestors = [];
  let pid = ownerPid;
  while (ancestors.length < OWNER_ANCESTOR_LIMIT) {
    const parent = parentProcessId(pid, deps);
    if (parent === null) break;
    const pidStartTime = processStartTime(parent, deps);
    if (pidStartTime === null || pidNamespaceOf(parent, deps) !== identity.pidNamespace) break;
    ancestors.push(ancestorDigest(random, identity, parent, pidStartTime));
    pid = parent;
  }
  return ancestors;
}

// The parts of a salt in the current layout, or null for any other (a 1.77.0 salt of 32
// characters carries no binding).
function ownerSaltParts(salt) {
  const head = OWNER_SALT_RANDOM_LENGTH + OWNER_SALT_BINDING_LENGTH;
  const tail = salt.length - head;
  if (tail < 0 || tail % OWNER_ANCESTOR_LENGTH !== 0) return null;
  if (tail / OWNER_ANCESTOR_LENGTH > OWNER_ANCESTOR_LIMIT) return null;
  const ancestors = [];
  for (let offset = head; offset < salt.length; offset += OWNER_ANCESTOR_LENGTH) {
    ancestors.push(salt.slice(offset, offset + OWNER_ANCESTOR_LENGTH));
  }
  return {
    random: salt.slice(0, OWNER_SALT_RANDOM_LENGTH),
    binding: salt.slice(OWNER_SALT_RANDOM_LENGTH, head),
    ancestors,
  };
}

// The owning session process of a new reservation, as a reservation-salted digest of host name,
// pid, and pid start time (resolved like the planning claims), with the owner's host and its
// recorded ancestors bound into the salt.
async function reservationOwner(deps) {
  const { pid, pidStartTime } = await sessionOwner({ runner: deps.runner }, deps);
  const random = randomOpaque(deps, 24);
  const identity = pid === null ? null : hostIdentity(pid, deps);
  const ancestors = identity === null ? [] : ownerAncestors(pid, identity, random, deps);
  const ownerSalt = `${random}${hostBinding(random, identity, ancestors)}${ancestors.join('')}`;
  return {
    ownerSalt,
    ownerDigest: canonicalDigest({ salt: ownerSalt, hostname: localHost(deps), pid, pidStartTime }),
  };
}

// Busy means a workflow reservation, packet timing, or gate observation is still open while the
// evidence is otherwise sound. Only its owning run can finalize or reconcile a reservation
// (reconcile-record needs that run's workflow capability); a later cleanup session abandons a
// crashed run's reservation through abandon-reservation once its owner is proven gone or it is
// stale. An orphaned gate observation stays busy until the generation is discarded.
function evidenceBusy(evidence) {
  return busyCause(evidence) !== null;
}

// The busy cause: `open-reservations` while a workflow reservation or packet timing is open, and
// `open-observations` while only gate observations are, such as one a `merge-gate` run keeps open
// across `SUSPENDED host-pr-watch` re-dispatches until that run finalizes it.
function busyCause(evidence) {
  if (evidence.invalidMembers.length > 0 || evidence.orphanTemporaries.length > 0) return null;
  if (evidence.incompleteRecords.length > 0 || evidence.incompleteTimings.length > 0) {
    return 'open-reservations';
  }
  return evidence.incompleteObservations.length > 0 ? 'open-observations' : null;
}

// A generation bound to a prior protocol loads only for callers passing `previousProtocol`
// (inventory, begin-review, the gate-observation admission check, and the suspension writers);
// every other caller gets PROTOCOL_DRIFT, so its evidence is inspected, reviewed, or discarded but
// never extended or resumed. Until the migration persists, a stored baseline or active state reads
// as suspended.
async function loadState(context, generationId, { previousProtocol = false } = {}) {
  const root = generationPath(context, generationId);
  if (!(await directoryState(root))) fail('NOT_FOUND');
  const stored = await readJson(path.join(root, 'state.json'));
  let state;
  try {
    state = validatePersistedState(stored, generationId, { previousProtocol: true });
  } catch (error) {
    if (error instanceof PilotMeasurementError && error.code === 'PROTOCOL_DRIFT') throw error;
    fail('UNSAFE_STORAGE', { cause: error });
  }
  if (!isLegacyDigest(state.protocolDigest)) {
    return { root, state, migrationPending: false };
  }
  if (!previousProtocol) fail('PROTOCOL_DRIFT');
  const migrationPending = await previousProtocolMigrationPending(root, state);
  return {
    root,
    state:
      migrationPending && ['baseline', 'active'].includes(state.generationState)
        ? { ...state, generationState: 'suspended' }
        : state,
    migrationPending,
  };
}

// A prior-protocol generation still needs the migration while it stores baseline or active state,
// its suspension lacks the boundary reason of its digest, or the migration's own marker is pending.
// A review generation is already closed to admission and keeps its state.
async function previousProtocolMigrationPending(root, state) {
  if (state.generationState === 'review') return false;
  const { reason } = priorProtocol(state.protocolDigest);
  if ((await transitionMarker(root))?.operation === reason) return true;
  if (state.generationState !== 'suspended') return true;
  return !(await suspensionValue(root))?.reasons.includes(reason);
}

async function storedPreviousProtocolState(root, generationId) {
  const stored = await readJson(path.join(root, 'state.json'), { missing: true });
  if (!isObject(stored) || !isLegacyDigest(stored.protocolDigest)) return null;
  try {
    return validatePersistedState(stored, generationId, { previousProtocol: true });
  } catch (error) {
    fail('UNSAFE_STORAGE', { cause: error });
  }
}

// One-step migration across a protocol generation boundary. withLock runs it under the lifecycle
// lock before every locked operation except the review exit; it moves a pending prior-protocol
// generation to suspended with the reason of its digest (`quality-mapping-changed` for 1.1.0,
// `protocol-parameters-changed` for 1.2.0) through the marker-guarded suspension write, keeps the stored protocol binding of all its evidence, and is a no-op once that
// state is persisted. A leftover suspension-reason marker is completed first; a leftover suspend or
// resume marker cannot be adopted, so the migration leaves it in place without failing: the read
// view already reports the generation suspended, and only review and discard remain.
async function migratePreviousProtocolGeneration(context, generationId, deps) {
  const root = generationPath(context, generationId);
  if (!(await directoryState(root))) return;
  let state = await storedPreviousProtocolState(root, generationId);
  if (state === null || !(await previousProtocolMigrationPending(root, state))) return;
  const marker = await transitionMarker(root);
  if (marker !== null) {
    if (!SUSPENSION_REASONS.includes(marker.operation)) return;
    await rollForwardTransition(context, generationId, deps, state);
    state = await storedPreviousProtocolState(root, generationId);
    if (!(await previousProtocolMigrationPending(root, state))) return;
  }
  const { reason } = priorProtocol(state.protocolDigest);
  await writeSuspension(context, root, generationId, state, reason, [], deps);
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
  if (normalized.details !== undefined) envelope.error.details = { ...normalized.details };
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

function initialGenerationState(generationId, harnessQualification, deps) {
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
    harnessQualification,
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
      state = validatePersistedState(await readJson(path.join(root, entry.name)), generationId, {
        previousProtocol: true,
      });
      // A prior-protocol generation is never adopted as a new baseline.
      if (isLegacyDigest(state.protocolDigest)) fail('INVALID_STATE');
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
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      if (missing) return [];
      fail('NOT_FOUND', { cause: error });
    }
    fail('UNSAFE_STORAGE', { cause: error });
  }
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

function validateStoredReservationPacket(value, generationState, legacy = false) {
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
  if (legacy && packet.gate.firstReason === 'correction-pass') fail('INVALID_PAYLOAD');
  assertPacketPolicy(packet, generationState);
  return value;
}

// A completed run started every packet; an aborted or failed run started a packet only when its
// receipt existed; a reconciled (abandoned) run cannot tell, so every packet is unknown.
const ATTEMPTS_BY_COMPLETION = Object.freeze({
  completed: ['started'],
  aborted: ['started', 'not-started'],
  failed: ['started', 'not-started'],
  abandoned: ['unknown'],
});

// `admission-changed` is the one fallback that is no escalation: the packet fell back to Quality
// before its implementation started and consumed no attempt of the faster profile. Every other
// fallback other than `none` is an escalation.
function fallbackEscalates(fallback) {
  return fallback !== 'none' && fallback !== 'admission-changed';
}

// The model-compliance values a final packet may carry: a Fast spawn that ran reports its
// verification outcome; a Quality packet, an admission-changed fallback, or a packet that never
// started has nothing to verify. Only a portable Fast spawn has a per-packet verification
// adapter; a native Fast spawn's sidecar model is never observed, so it stays `unverified`.
function allowedModelCompliance(selectedProfile, fallback, attempt, installKind) {
  if (selectedProfile !== 'fast' || fallback === 'admission-changed' || attempt === 'not-started') {
    return ['not-applicable'];
  }
  return installKind === 'portable' ? ['verified', 'mismatch', 'unverified'] : ['unverified'];
}

function validateStoredFinalPacket(
  value,
  generationState,
  completionStatus,
  legacy = false,
  installKind = undefined,
) {
  const fields = [
    'packetId',
    'selectedProfile',
    'wouldBeFastEligible',
    'firstGateReason',
    'implementationDuration',
    'fallback',
    'escalated',
    'costProxy',
    'attempt',
  ];
  exactObject(value, legacy ? fields : [...fields, 'modelCompliance']);
  opaque(value.packetId);
  const attempt = enumValue(value.attempt, PILOT_MEASUREMENT_PROTOCOL.enums.packetAttempts);
  if (!ATTEMPTS_BY_COMPLETION[completionStatus]?.includes(attempt)) fail('INVALID_PAYLOAD');
  const firstReason =
    value.firstGateReason === null
      ? null
      : enumValue(value.firstGateReason, PILOT_MEASUREMENT_POLICY_PROJECTION.gateReasons);
  if (legacy && firstReason === 'correction-pass') fail('INVALID_PAYLOAD');
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
    fallbackEscalates(fallback) !== escalated ||
    (legacy && fallback === 'admission-changed') ||
    (generationState === 'baseline' && (fallback !== 'none' || escalated)) ||
    (selectedProfile === 'quality' && (fallback !== 'none' || escalated))
  ) {
    fail('INVALID_PAYLOAD');
  }
  if (
    !legacy &&
    !allowedModelCompliance(selectedProfile, fallback, attempt, installKind).includes(
      value.modelCompliance,
    )
  ) {
    fail('INVALID_PAYLOAD');
  }
  validateStoredCost(value.costProxy);
  // An abandoned packet keeps the pre-spawn `admission-changed` fallback its receipt proved; it
  // still has no duration, escalation, or cost.
  const unstartedFallbacks = attempt === 'unknown' ? ['none', 'admission-changed'] : ['none'];
  if (
    attempt !== 'started' &&
    (value.implementationDuration.status !== 'unavailable' ||
      !unstartedFallbacks.includes(fallback) ||
      escalated ||
      value.costProxy.status !== 'unavailable')
  ) {
    fail('INVALID_PAYLOAD');
  }
  return value;
}

// A run started by `iterate` records `correction-pass` on every packet (gate priority 0), so a
// record either carries it on all packets or on none.
function assertCorrectionPassUniform(firstReasons) {
  const correction = firstReasons.filter((reason) => reason === 'correction-pass').length;
  if (correction !== 0 && correction !== firstReasons.length) fail('INVALID_PAYLOAD');
}

// The transient reservation fields: the owning session process as a reservation-salted digest of
// host name, pid, and pid start time, the reservation time, and the overlap flag. They live only in
// an open reservation and never reach a terminal record. The shape is fixed by protocol 1.3.0: a
// helper of every release under that protocol reads the same reservation, so the host binding of
// the orphan check lives inside the opaque salt (`reservationOwner`) instead of a field of its own.
const RESERVATION_TRANSIENT_FIELDS = Object.freeze([
  'ownerSalt',
  'ownerDigest',
  'reservedAt',
  'overlapFlag',
]);

function validateStoredWorkflow(
  value,
  generationId,
  runId,
  protocolDigest = PILOT_MEASUREMENT_PROTOCOL_DIGEST,
) {
  return incompleteStoredValue(() => {
    const legacy = isLegacyDigest(protocolDigest);
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
    if (!legacy) common.push('installKind');
    const reservation = value.kind === 'workflow-reservation';
    const terminal = [
      'validation',
      'review',
      'completionStatus',
      'qualityCorrectionRounds',
      'detailTrace',
    ];
    if (!legacy) terminal.push('overlapped');
    exactObject(
      value,
      reservation
        ? legacy
          ? common
          : [...common, ...RESERVATION_TRANSIENT_FIELDS]
        : [...common, ...terminal],
    );
    if (
      value.schema !== (legacy ? LEGACY_RECORD_SCHEMA : RECORD_SCHEMA) ||
      !['workflow-reservation', 'workflow-record'].includes(value.kind) ||
      value.runId !== runId ||
      value.generationId !== generationId ||
      value.protocolDigest !== protocolDigest
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
    if (legacy && value.workflow === 'fix') fail('INVALID_PAYLOAD');
    if (!legacy) {
      enumValue(value.installKind, PILOT_MEASUREMENT_PROTOCOL.enums.installKinds);
      if (reservation) {
        opaque(value.ownerSalt);
        digestValue(value.ownerDigest);
        if (
          typeof value.reservedAt !== 'string' ||
          Number.isNaN(Date.parse(value.reservedAt)) ||
          new Date(value.reservedAt).toISOString() !== value.reservedAt
        ) {
          fail('INVALID_PAYLOAD');
        }
        booleanValue(value.overlapFlag);
      } else {
        booleanValue(value.overlapped);
      }
    }
    integer(value.ordinal);
    if (value.ordinal < 1 || !Array.isArray(value.packets) || value.packets.length === 0) {
      fail('INVALID_PAYLOAD');
    }
    if (value.packets.length > PILOT_MEASUREMENT_PROTOCOL.limits.maxPacketsPerWorkflow) {
      fail('CAPACITY_EXHAUSTED');
    }
    const completionStatus = reservation
      ? null
      : enumValue(value.completionStatus, PILOT_MEASUREMENT_PROTOCOL.enums.completionStatuses);
    for (const packet of value.packets) {
      if (reservation) validateStoredReservationPacket(packet, value.generationState, legacy);
      else {
        validateStoredFinalPacket(
          packet,
          value.generationState,
          completionStatus,
          legacy,
          value.installKind,
        );
      }
    }
    if (!legacy) {
      assertCorrectionPassUniform(
        value.packets.map((packet) =>
          reservation ? packet.gate.firstReason : packet.firstGateReason,
        ),
      );
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
      integer(value.qualityCorrectionRounds, 10_000);
      booleanValue(value.detailTrace);
    }
    return value;
  });
}

function validateStoredTiming(value, generationId, runId, packetId, legacy = false) {
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
    // A 1.3.0 receipt names whether it started the packet's Fast attempt or its pre-spawn
    // `admission-changed` Quality fallback, and its finished form carries the model compliance.
    if (!legacy) common.push('fallback');
    const finished = ['duration', 'finishWallMs', 'finishMonotonicNs', 'finishBootEstimateMs'];
    if (!legacy) finished.push('modelCompliance');
    exactObject(value, value.status === 'finished' ? [...common, ...finished] : common);
    if (
      value.schema !== (legacy ? LEGACY_TIMING_SCHEMA : TIMING_SCHEMA) ||
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
    if (!legacy) enumValue(value.fallback, ['none', 'admission-changed']);
    if (value.status === 'finished') {
      if (!legacy)
        enumValue(value.modelCompliance, PILOT_MEASUREMENT_PROTOCOL.enums.modelCompliance);
      validateStoredDuration(value.duration);
      integer(value.finishWallMs);
      integer(value.finishBootEstimateMs);
      if (!/^(?:0|[1-9][0-9]*)$/.test(value.finishMonotonicNs)) fail('INVALID_PAYLOAD');
    }
    return value;
  });
}

function validateStoredObservation(
  value,
  generationId,
  observationId,
  protocolDigest = PILOT_MEASUREMENT_PROTOCOL_DIGEST,
) {
  return incompleteStoredValue(() => {
    const legacy = isLegacyDigest(protocolDigest);
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
    if (!legacy) common.push('installKind');
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
      value.schema !== (legacy ? LEGACY_OBSERVATION_SCHEMA : OBSERVATION_SCHEMA) ||
      !['gate-observation-reservation', 'gate-observation'].includes(value.kind) ||
      value.observationId !== observationId ||
      value.generationId !== generationId ||
      value.protocolDigest !== protocolDigest
    ) {
      fail('INVALID_PAYLOAD');
    }
    digestValue(value.capabilityHash);
    enumValue(value.cohort, PILOT_MEASUREMENT_PROTOCOL.enums.cohorts);
    enumValue(value.mode, PILOT_MEASUREMENT_PROTOCOL.enums.observationModes);
    enumValue(value.harnessFamily, PILOT_MEASUREMENT_PROTOCOL.enums.harnessFamilies);
    if (!legacy) enumValue(value.installKind, PILOT_MEASUREMENT_PROTOCOL.enums.installKinds);
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

async function evidenceInventory(context, generationId, options) {
  const { root, state, migrationPending } = await loadState(context, generationId, options);
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
      timings.push(
        validateStoredTiming(
          value,
          generationId,
          timingMatch[1],
          timingMatch[2],
          isLegacyDigest(state.protocolDigest),
        ),
      );
    } else {
      workflows.push(
        validateStoredWorkflow(value, generationId, workflowMatch[1], state.protocolDigest),
      );
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
  // A receipt binds to its open reservation by the packet capability hash. A terminal record drops
  // that hash, so a receipt it kept because its finalize or reconcile-record faulted before removing
  // it binds by membership: a packet of that record whose attempt is not `not-started`. Such a
  // leftover stays an open packet timing, which keeps activation and aggregation closed, and closes
  // new admission until reconcile-record (which authenticates the workflow capability) drains it.
  // Any other receipt fails closed.
  const leftoverTimings = [];
  for (const timing of timings) {
    const workflow = workflowById.get(timing.runId);
    const packet = workflow?.packets.find(({ packetId }) => packetId === timing.packetId);
    if (
      packet !== undefined &&
      workflow.kind === 'workflow-reservation' &&
      packet.packetCapabilityHash === timing.packetCapabilityHash
    ) {
      continue;
    }
    if (
      packet === undefined ||
      workflow.kind !== 'workflow-record' ||
      packet.attempt === 'not-started'
    ) {
      fail('INCOMPLETE_EVIDENCE');
    }
    leftoverTimings.push(timing.packetId);
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
      state.protocolDigest,
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
    migrationPending,
    suspension,
    transition,
    locks,
    invalidMembers,
    workflows,
    observations,
    packetIds,
    incompleteRecords,
    incompleteTimings,
    leftoverTimings: leftoverTimings.sort(),
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
  const grammar = /^[A-Za-z0-9_-]{32,128}-(?:discard-)?sha256-[0-9a-f]{64}$/;
  const prefix = `${generationId}-`;
  const relativeGrammar = /^(discard-)?sha256-[0-9a-f]{64}$/;
  for (const entry of entries) {
    if (!entry.isDirectory() || !grammar.test(entry.name)) fail('UNSAFE_STORAGE');
    if (!entry.name.startsWith(prefix)) continue;
    const match = relativeGrammar.exec(entry.name.slice(prefix.length));
    if (match !== null) (match[1] === undefined ? normal : discard).push(entry.name);
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
  const installed = await readInstalledQualification(deps);
  if (generationId === null) {
    return {
      generationId: null,
      generationStatus: 'absent',
      normalTombstones: 0,
      discardTombstones: 0,
      qualification: { installed, snapshot: null },
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
      qualification: { installed, snapshot: null },
    };
  }
  const evidence = await evidenceInventory(context, generationId, { previousProtocol: true });
  const legacy = isLegacyDigest(evidence.state.protocolDigest);
  return {
    generationId,
    generationStatus: 'present',
    generationState: evidence.state.generationState,
    inventoryDigest: evidence.inventoryDigest,
    suspensionDigest: evidence.inventory.suspensionDigest,
    incompleteCounts: evidence.inventory.incompleteCounts,
    orphanTemporaries: evidence.orphanTemporaries,
    rawBytes: evidence.inventory.rawBytes,
    transitionPending: evidence.transition !== null || evidence.migrationPending,
    protocolCurrent: evidence.state.protocolDigest === PILOT_MEASUREMENT_PROTOCOL_DIGEST,
    // Activation needs an idle generation: an open workflow reservation, packet timing, or gate
    // observation blocks it until its own run finalizes it (or reconciles a workflow reservation
    // with `reconcile-record`). An orphaned reservation clears through `abandon-reservation`, an
    // orphaned observation only by discarding the generation; purge needs a complete aggregate and
    // is unreachable while anything is open.
    busyCause: busyCause(evidence),
    normalTombstones,
    discardTombstones,
    qualification: { installed, snapshot: legacy ? null : evidence.state.harnessQualification },
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
  // The generation keeps the qualification it began under; a harness that qualifies later needs a
  // new generation.
  const harnessQualification = await readInstalledQualification(deps);
  return await withNamespaceLock(context, 'begin-baseline', deps, async () => {
    const recovered = await recoverGenerationInitialization(context, deps);
    if (recovered !== null) {
      if (!recoveredNamespaceLock) fail('INVALID_STATE');
      return {
        generationId: recovered.generationId,
        generationState: recovered.state.generationState,
        protocolVersion: recovered.state.protocolVersion,
        protocolDigest: recovered.state.protocolDigest,
        harnessQualification: recovered.state.harnessQualification,
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
    const state = initialGenerationState(generationId, harnessQualification, deps);
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
      harnessQualification,
    };
  });
}

async function activate(input, deps) {
  commonInput(input, ['configState', 'protocolVersion', 'protocolDigest']);
  enumValue(input.configState, ['enabled']);
  assertProtocol(input.protocolVersion, input.protocolDigest);
  const context = await ensureNamespace(input, deps);
  return await withLock(context, input.generationId, 'activate', deps, async () => {
    const evidence = await evidenceInventory(context, input.generationId);
    if ((await admissionClosed(evidence)) || evidence.state.generationState !== 'baseline') {
      fail('INVALID_STATE');
    }
    const notReady = (unmet) => ({
      status: 'not-ready',
      generationId: input.generationId,
      generationState: 'baseline',
      unmet,
    });
    if (evidenceBusy(evidence)) return notReady(['busy']);
    assertEvidenceHealthy(context, evidence);
    const records = evidence.workflows.filter(({ kind }) => kind === 'workflow-record');
    const { eligiblePackets, countedRecords } = baselineProgress(records);
    const { baselineEligiblePacketMinimum, baselineRecordMinimum } =
      PILOT_MEASUREMENT_PROTOCOL.aggregation;
    if (eligiblePackets < baselineEligiblePacketMinimum || countedRecords < baselineRecordMinimum) {
      return notReady(['sample']);
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
    return { status: 'activated', generationId: input.generationId, generationState: 'active' };
  });
}

// A record whose only first gate reason is `correction-pass` (a run `iterate` delegated) counts
// toward no minimum.
function correctionPassOnly(record) {
  return record.packets.every((packet) => packet.firstGateReason === 'correction-pass');
}

// The activation sample: eligible packets of completed baseline records, and completed baseline
// records that count toward the record minimum. No calendar window applies.
function baselineProgress(records) {
  const completed = records.filter(
    (record) => record.cohort === 'baseline' && record.completionStatus === 'completed',
  );
  return {
    eligiblePackets: completed
      .flatMap((record) => record.packets)
      .filter((packet) => packet.wouldBeFastEligible).length,
    countedRecords: completed.filter((record) => !correctionPassOnly(record)).length,
  };
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
  commonInput(input, ['configState', 'workflow', 'harnessFamily', 'installKind', 'packets']);
  enumValue(input.configState, ['enabled']);
  enumValue(input.workflow, PILOT_MEASUREMENT_PROTOCOL.enums.workflows);
  enumValue(input.harnessFamily, PILOT_MEASUREMENT_PROTOCOL.enums.harnessFamilies);
  enumValue(input.installKind, PILOT_MEASUREMENT_PROTOCOL.enums.installKinds);
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
  assertCorrectionPassUniform(packets.map(({ gate }) => gate.firstReason));
  const owner = await reservationOwner(deps);
  const context = await ensureNamespace(input, deps);
  return await withLock(context, input.generationId, 'start', deps, async () => {
    const evidence = await evidenceInventory(context, input.generationId);
    const { root, state } = evidence;
    if (await admissionClosed(evidence)) fail('INVALID_STATE');
    assertEvidenceSound(context, evidence);
    for (const packet of packets) assertPacketPolicy(packet, state.generationState);
    if (packets.some(({ selectedProfile }) => selectedProfile === 'fast')) {
      await assertFastProfileAvailable(state, input.installKind, input.harnessFamily, deps);
    }
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
      installKind: input.installKind,
      ordinal: state.nextWorkflowOrdinal,
      packets: packetResults.map(({ packetCapability, ...packet }) => ({
        ...packet,
        packetCapabilityHash: hashCapability(packetCapability),
      })),
      ...owner,
      reservedAt: nowIso(deps),
      overlapFlag:
        evidence.incompleteRecords.length > 0 || evidence.incompleteObservations.length > 0,
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
    await flagOpenReservations(context, evidence, runId, 'start', deps);
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

async function writeSuspension(
  context,
  root,
  generationId,
  state,
  reason,
  affectedRecordIds,
  deps,
  markerOperation = reason,
) {
  const previous = await suspensionValue(root);
  const resumeTo = previous?.resumeTo ?? state.generationState;
  if (!['baseline', 'active'].includes(resumeTo)) fail('UNSAFE_STORAGE');
  const marker = await beginTransition(context, root, generationId, markerOperation, deps);
  const suspension = {
    schema: 1,
    kind: 'pilot-suspension',
    generationId,
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
  return suspension;
}

// Completes a suspension-reason marker that a crashed or lock-contended control write left behind.
// It runs under the lifecycle lock; a leftover suspend or resume marker keeps its own handling. The
// migration passes the stored state, because the read view masks a pending generation as suspended.
async function rollForwardTransition(context, generationId, deps, storedState) {
  const root = generationPath(context, generationId);
  const marker = await transitionMarker(root);
  if (marker === null || !SUSPENSION_REASONS.includes(marker.operation)) return;
  if (marker.generationId !== generationId) fail('UNSAFE_STORAGE');
  const state =
    storedState ?? (await loadState(context, generationId, { previousProtocol: true })).state;
  if (!['baseline', 'active', 'suspended'].includes(state.generationState)) return;
  await writeSuspension(context, root, generationId, state, marker.operation, [], deps);
}

async function suspendForCapacity(context, generationId, state, deps) {
  if (!['baseline', 'active', 'suspended'].includes(state.generationState)) return;
  const root = generationPath(context, generationId);
  await writeSuspension(context, root, generationId, state, 'capacity-exhausted', [], deps);
}

async function persistPilotControl(input, deps, reason, affectedRecordIds = []) {
  try {
    const context = await ensureNamespace(input, deps);
    return await withLock(context, input.generationId, 'pilot-control', deps, async () => {
      await rollForwardTransition(context, input.generationId, deps);
      const { root, state } = await loadState(context, input.generationId, {
        previousProtocol: true,
      });
      if (!['baseline', 'active', 'suspended'].includes(state.generationState)) return false;
      await writeSuspension(
        context,
        root,
        input.generationId,
        state,
        reason,
        affectedRecordIds,
        deps,
      );
      return true;
    });
  } catch {
    try {
      const context = await ensureNamespace(input, deps);
      const root = generationPath(context, input.generationId);
      const target = path.join(root, 'suspension-transition.json');
      const existing = await transitionMarker(root);
      // Only a marker for this exact reason carries it forward; any other marker loses it.
      if (existing !== null) return existing.operation === reason;
      // The marker carries its writer's pid, so a temporary left by a crash before publication can
      // be proved stale by reconcile-temporary without a lock record of the same nonce.
      const ownerNonce = randomOpaque(deps, 24);
      const marker = {
        schema: 1,
        kind: 'suspension-transition',
        generationId: input.generationId,
        operation: reason,
        ownerNonce,
        ownerPid: process.pid,
      };
      try {
        await atomicWrite(
          { ...context, activeLock: { nonce: ownerNonce } },
          target,
          marker,
          reason,
          input.generationId,
          deps,
          undefined,
          { noReplace: true, existsCode: 'INVALID_STATE' },
        );
      } catch (error) {
        if (!(error instanceof PilotMeasurementError) || error.code !== 'INVALID_STATE')
          throw error;
        return (await transitionMarker(root))?.operation === reason;
      }
      return true;
    } catch {
      return false;
    }
  }
}

function controlError(error, pilotControlOutcome, controlStatePersisted) {
  const normalized =
    error instanceof PilotMeasurementError
      ? error
      : new PilotMeasurementError('WRITE_FAILED', { cause: error });
  return new PilotMeasurementError(normalized.code, {
    cause: normalized,
    details: normalized.details,
    pilotControlOutcome,
    controlStatePersisted,
    alert: pilotControlOutcome === 'control-state-unpersistable' ? 'value-free' : 'none',
  });
}

function receiptNotFound(cause) {
  const error = new PilotMeasurementError('NOT_FOUND', { cause });
  // A missing receipt is a mid-write fault, unlike a missing generation or record.
  error[RECEIPT_FAULT] = true;
  throw error;
}

// Exhaustive failure classification for finalize and both gate-observation operations.
function classifyControlFailure(error) {
  if (!(error instanceof PilotMeasurementError)) return 'fault';
  if (error.code === 'CAPACITY_EXHAUSTED') return 'passthrough';
  if (error.code === 'NOT_FOUND' && error[RECEIPT_FAULT] === true) return 'fault';
  return CONTROL_NEUTRAL_CODES.has(error.code) ? 'neutral' : 'fault';
}

async function controlFailure(input, deps, error, reason, affectedRecordIds) {
  const classification = classifyControlFailure(error);
  if (classification === 'passthrough') return error;
  if (classification === 'neutral') return controlError(error, 'none', false);
  const persisted = await persistPilotControl(input, deps, reason, affectedRecordIds);
  return controlError(error, persisted ? reason : 'control-state-unpersistable', persisted);
}

async function guardedObservationMutation(input, deps, affectedRecordIds, action) {
  try {
    return await action();
  } catch (error) {
    throw await controlFailure(input, deps, error, 'evidence-gap', affectedRecordIds);
  }
}

async function assertGenerationExists(context, generationId) {
  if (!(await directoryState(generationPath(context, generationId)))) fail('NOT_FOUND');
}

async function loadReservation(context, generationId, runId) {
  opaque(runId);
  const { root } = await loadState(context, generationId);
  const target = path.join(root, 'records', `${runId}.json`);
  const record = validateStoredWorkflow(await readJson(target), generationId, runId);
  return { root, target, record };
}

// A packet operation of an authenticated run whose record is already terminal: its reservation no
// longer exists, finalized by the run itself or abandoned by a later cleanup session. NOT_FOUND
// names exactly this, so the run can still call `finalize` once, which reports the stored status
// without writing, instead of reading the record as unfinalizable.
function assertReservationOpen(record) {
  if (record.kind !== 'workflow-reservation') fail('NOT_FOUND');
}

async function startPacket(input, deps) {
  commonInput(input, ['runId', 'packetId', 'workflowCapability', 'packetCapability'], ['fallback']);
  opaque(input.runId);
  opaque(input.packetId);
  const fallback =
    input.fallback === undefined ? 'none' : enumValue(input.fallback, ['admission-changed']);
  const context = await ensureNamespace(input, deps);
  return await withPacketLock(
    context,
    input.generationId,
    input.packetId,
    'start-packet',
    deps,
    async () => {
      const { root, record } = await loadReservation(context, input.generationId, input.runId);
      const { state } = await loadState(context, input.generationId);
      authenticate(input.workflowCapability, record.workflowCapabilityHash);
      assertReservationOpen(record);
      const packet = record.packets.find(({ packetId }) => packetId === input.packetId);
      if (!packet) fail('AUTHENTICATION_FAILED');
      authenticate(input.packetCapability, packet.packetCapabilityHash);
      if (fallback !== 'none' && packet.selectedProfile !== 'fast') fail('INVALID_PAYLOAD');
      const target = path.join(root, 'records', `${input.runId}.${input.packetId}.timing.json`);
      const existing = await readJson(target, { missing: true });
      // A Fast spawn needs open admission at this moment: no suspension, incident, or transition,
      // the reservation's own generation state, no foreign incomplete record, and no foreign
      // leftover evidence: another run's timing receipt, such as one a terminal record kept after
      // its finalize or reconcile-record faulted, an orphan temporary (a lock staging file only
      // once its writer is provably gone), or an invalid member. The run's own reservation and
      // timing receipts and an open gate observation do not close it. A closed admission writes
      // nothing and consumes no Fast attempt; the packet then starts as its `admission-changed`
      // Quality fallback. Admission and the qualification are not re-checked for a first
      // fallback call.
      const admissionClosed = async () =>
        state.generationState !== record.generationState ||
        (await suspensionValue(root)) !== null ||
        (await transitionMarker(root)) !== null ||
        (await otherReservationOpen(root, input.generationId, input.runId)) ||
        (await foreignEvidenceLeftover(root, input.generationId, input.runId, deps));
      const fastCheck = async () => {
        if (await admissionClosed()) fail('ADMISSION_CHANGED');
        await assertFastProfileAvailable(state, record.installKind, record.harnessFamily, deps);
      };
      const timingReceipt = (packetCapabilityHash, receiptFallback) => {
        const salt = randomOpaque(deps, 24);
        const wallMs = nowMs(deps);
        const uptimeSeconds = (deps.uptimeSeconds ?? os.uptime)();
        const hostname = (deps.hostname ?? os.hostname)();
        const monotonicNs = String((deps.monotonicNs ?? process.hrtime.bigint)());
        return {
          schema: TIMING_SCHEMA,
          kind: 'packet-timing-receipt',
          status: 'started',
          generationId: input.generationId,
          runId: input.runId,
          packetId: input.packetId,
          packetCapabilityHash,
          salt,
          hostFingerprint: canonicalDigest({ salt, hostname }),
          startWallMs: wallMs,
          startMonotonicNs: monotonicNs,
          startBootEstimateMs: Math.round(wallMs - uptimeSeconds * 1000),
          fallback: receiptFallback,
        };
      };
      if (existing !== null) {
        authenticate(input.packetCapability, existing.packetCapabilityHash);
        // A start re-sent after a lost response comes before any child exists, so a started
        // Fast receipt acknowledges a Fast start only while the first call's conditions hold.
        const openFastReceipt =
          packet.selectedProfile === 'fast' &&
          existing.status === 'started' &&
          existing.fallback === 'none';
        if (existing.fallback === fallback) {
          if (openFastReceipt) await fastCheck();
          return {
            status: existing.status,
            runId: input.runId,
            packetId: input.packetId,
            fallback,
          };
        }
        // Its `admission-changed` re-send replaces that unspawned Fast receipt: the caller already
        // saw the retry refused, so admission may have reopened since and, as for a first
        // fallback call, is not re-checked. The caller then spawns the packet Quality.
        if (!openFastReceipt || fallback !== 'admission-changed') fail('INVALID_STATE');
        const converted = timingReceipt(existing.packetCapabilityHash, fallback);
        await atomicWrite(context, target, converted, 'start-packet', input.generationId, deps);
        return { status: 'started', runId: input.runId, packetId: input.packetId, fallback };
      }
      if (packet.selectedProfile === 'fast' && fallback === 'none') await fastCheck();
      const receipt = timingReceipt(packet.packetCapabilityHash, fallback);
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
      return { status: 'started', runId: input.runId, packetId: input.packetId, fallback };
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
  commonInput(input, [
    'runId',
    'packetId',
    'workflowCapability',
    'packetCapability',
    'modelCompliance',
  ]);
  const modelCompliance = enumValue(
    input.modelCompliance,
    PILOT_MEASUREMENT_PROTOCOL.enums.modelCompliance,
  );
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
      assertReservationOpen(record);
      const packet = record.packets.find(({ packetId }) => packetId === input.packetId);
      if (!packet) fail('AUTHENTICATION_FAILED');
      authenticate(input.packetCapability, packet.packetCapabilityHash);
      const target = path.join(root, 'records', `${input.runId}.${input.packetId}.timing.json`);
      // A packet without a receipt never started: the lifecycle refuses its finish, and NOT_FOUND
      // stays reserved for a run whose reservation is gone.
      const receipt = await readJson(target, { missing: true });
      if (receipt === null) fail('INVALID_STATE');
      authenticate(input.packetCapability, receipt.packetCapabilityHash);
      // A Fast spawn reports its verification outcome; a Quality packet or an admission-changed
      // fallback has nothing to verify.
      if (
        !allowedModelCompliance(
          packet.selectedProfile,
          receipt.fallback,
          'started',
          record.installKind,
        ).includes(modelCompliance)
      ) {
        fail('INVALID_PAYLOAD');
      }
      if (receipt.status === 'finished') {
        if (receipt.modelCompliance !== modelCompliance) fail('INVALID_STATE');
        return { status: 'finished', duration: receipt.duration, modelCompliance };
      }
      if (receipt.status !== 'started') fail('INVALID_STATE');
      const closed = {
        ...receipt,
        status: 'finished',
        ...durationFromReceipt(receipt, deps),
        modelCompliance,
      };
      await atomicWrite(context, target, closed, 'finish-packet', input.generationId, deps);
      return { status: 'finished', duration: closed.duration, modelCompliance };
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
  await assertGenerationExists(context, input.generationId);
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
      // A record a cleanup session already abandoned reports that status, never `finalized`: this
      // run's own outcome was not recorded. A run's own finalize never stores `abandoned`.
      return {
        status: reservation.completionStatus === 'abandoned' ? 'abandoned' : 'finalized',
        runId: input.runId,
      };
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
        fallbackEscalates(outcome.fallback) !== outcome.escalated ||
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
      // The lifecycle lock held here excludes every packet lock, so no packet writer can change a
      // receipt between this read and its removal below.
      const receipt = await readJson(timingTarget, { missing: true });
      let attempt;
      let implementationDuration;
      let modelCompliance;
      if (receipt === null) {
        // Adopters call start-packet immediately before every implementation spawn, so a missing
        // receipt proves the packet never started. A completed run must have started all of them.
        if (completionStatus === 'completed') receiptNotFound();
        if (outcome.fallback !== 'none' || outcome.escalated || outcome.costProxy !== null) {
          fail('INVALID_PAYLOAD');
        }
        attempt = 'not-started';
        implementationDuration = { status: 'unavailable' };
        modelCompliance = 'not-applicable';
      } else {
        authenticate(outcome.packetCapability, receipt.packetCapabilityHash);
        // The receipt proves whether the packet started its Fast attempt or its pre-spawn
        // admission-changed Quality fallback; the caller's outcome must agree.
        if (
          (receipt.fallback === 'admission-changed') !==
          (outcome.fallback === 'admission-changed')
        ) {
          fail('INVALID_PAYLOAD');
        }
        if (receipt.status === 'finished') {
          implementationDuration = receipt.duration;
          modelCompliance = receipt.modelCompliance;
        } else if (receipt.status === 'started' && completionStatus !== 'completed') {
          implementationDuration = { status: 'unavailable' };
          modelCompliance = allowedModelCompliance(
            reserved.selectedProfile,
            receipt.fallback,
            'started',
            reservation.installKind,
          ).includes('unverified')
            ? 'unverified'
            : 'not-applicable';
        } else {
          fail('INCOMPLETE_EVIDENCE');
        }
        attempt = 'started';
        timingTargets.push(timingTarget);
      }
      packets.push({
        packetId: reserved.packetId,
        selectedProfile: reserved.selectedProfile,
        wouldBeFastEligible: reserved.wouldBeFastEligible,
        firstGateReason: reserved.gate.firstReason,
        implementationDuration,
        fallback: outcome.fallback,
        escalated: outcome.escalated,
        costProxy:
          outcome.costProxy === null
            ? { status: 'unavailable' }
            : { status: 'available', ...outcome.costProxy },
        attempt,
        modelCompliance,
      });
    }
    // An overlap flagged on the reservation, or a reservation or observation still open now, marks
    // the record as overlapped; the transient owner and overlap fields are dropped here.
    const overlapped =
      reservation.overlapFlag ||
      (await otherReservationOpen(root, input.generationId, input.runId, { observations: true }));
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
      installKind: reservation.installKind,
      ordinal: reservation.ordinal,
      packets,
      validation,
      review,
      completionStatus,
      qualityCorrectionRounds,
      detailTrace: detailOptIn,
      overlapped,
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

// Runs after finalize has released its lock, because persisting control state takes the lock.
async function finalizeWorkflowGuarded(input, deps) {
  try {
    return await finalizeWorkflow(input, deps);
  } catch (error) {
    const affectedRecordIds =
      isObject(input) && typeof input.runId === 'string' && OPAQUE.test(input.runId)
        ? [input.runId]
        : [];
    throw await controlFailure(input, deps, error, 'finalization-failed', affectedRecordIds);
  }
}

async function startGateObservation(input, deps) {
  return await guardedObservationMutation(input, deps, [], async () => {
    commonInput(input, ['configState', 'generationState', 'mode', 'harnessFamily', 'installKind']);
    enumValue(input.configState, PILOT_MEASUREMENT_POLICY_PROJECTION.configStates);
    enumValue(input.generationState, PILOT_MEASUREMENT_POLICY_PROJECTION.generationStates);
    enumValue(input.mode, PILOT_MEASUREMENT_PROTOCOL.enums.observationModes);
    enumValue(input.harnessFamily, PILOT_MEASUREMENT_PROTOCOL.enums.harnessFamilies);
    enumValue(input.installKind, PILOT_MEASUREMENT_PROTOCOL.enums.installKinds);
    const notRecorded = (reason) => ({
      status: 'not-recorded',
      reason,
      pilotControlOutcome: 'none',
    });
    const context = await inspectNamespace(input, deps);
    if (!context.exists) return notRecorded('no-generation');
    const { state } = await loadState(context, input.generationId, { previousProtocol: true });
    if (
      input.configState !== 'enabled' ||
      !['baseline', 'active'].includes(state.generationState) ||
      input.generationState !== state.generationState
    ) {
      return notRecorded('admission-closed');
    }
    const mutable = await ensureNamespace(input, deps);
    let locked = false;
    try {
      return await withLock(
        mutable,
        input.generationId,
        'start-gate-observation',
        deps,
        async () => {
          locked = true;
          const evidence = await evidenceInventory(mutable, input.generationId);
          const { root, state: current } = evidence;
          // An admission closed by a concurrent transition, such as an activation, records nothing.
          if (
            (await admissionClosed(evidence)) ||
            current.generationState !== input.generationState
          ) {
            return notRecorded('admission-closed');
          }
          // Open records and observations of other runs overlap instead of blocking.
          assertEvidenceSound(mutable, evidence);
          const count = countBySuffix(
            await safeEntries(path.join(root, 'gate-observations')),
            '.json',
          );
          if (count >= PILOT_MEASUREMENT_PROTOCOL.limits.maxGateObservationsPerGeneration) {
            await suspendForCapacity(mutable, input.generationId, current, deps);
            fail('CAPACITY_EXHAUSTED');
          }
          const observationIds = new Set(
            evidence.observations.map(({ observationId }) => observationId),
          );
          const observationId = await uniqueOpaque(
            deps,
            async (candidate) =>
              pathExists(path.join(root, 'gate-observations', `${candidate}.json`)),
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
            installKind: input.installKind,
            ordinal: current.nextObservationOrdinal,
          };
          // The capability file comes first, so a failed write consumes no ordinal; the raw
          // capability never leaves the helper.
          const handle = await writeObservationHandle(
            mutable,
            input.generationId,
            observationId,
            capability,
            deps,
          );
          const reservationPath = path.join(root, 'gate-observations', `${observationId}.json`);
          try {
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
              reservationPath,
              reservation,
              'start-gate-observation',
              input.generationId,
              deps,
              undefined,
              { noReplace: true },
            );
          } catch (error) {
            // Without a durable reservation the capability file goes too; an unprovable record
            // keeps it, since only the file can finalize that record.
            if (!(await pathExists(reservationPath).catch(() => true))) {
              await removeObservationHandle(mutable, handle, deps);
            }
            throw error;
          }
          // The observation flags every open workflow reservation; it is never flagged itself.
          await flagOpenReservations(mutable, evidence, null, 'start-gate-observation', deps);
          return {
            status: 'reserved',
            observationId,
            cohort: reservation.cohort,
            ordinal: reservation.ordinal,
          };
        },
      );
    } catch (error) {
      // Contention for the lifecycle lock means another run is in flight, not an evidence fault.
      if (!locked && error instanceof PilotMeasurementError && error.code === 'LOCKED') {
        return notRecorded('busy');
      }
      throw error;
    }
  });
}

function unavailableOrInteger(value, maximum = 10_000) {
  return value === 'unavailable' ? 'unavailable' : integer(value, maximum);
}

function unavailableOrBoolean(value) {
  return value === 'unavailable' ? 'unavailable' : booleanValue(value);
}

async function finalizeGateObservation(input, deps) {
  const affectedRecordIds = [];
  return await guardedObservationMutation(input, deps, affectedRecordIds, async () => {
    commonInput(input, [
      'observationId',
      'terminalOutcome',
      'ciRepairCorrections',
      'reviewerCorrections',
      'conflictCorrections',
      'checksReported',
      'requiredCheckCount',
      'requiredChecksSatisfied',
    ]);
    affectedRecordIds.push(opaque(input.observationId));
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
      (!input.checksReported &&
        (requiredCheckCount !== 'unavailable' || requiredChecksSatisfied !== 'unavailable')) ||
      (input.checksReported && requiredCheckCount === 'unavailable') ||
      (input.checksReported && requiredChecksSatisfied === 'unavailable')
    ) {
      fail('INVALID_PAYLOAD');
    }
    const context = await ensureNamespace(input, deps);
    await assertGenerationExists(context, input.generationId);
    return await withLock(
      context,
      input.generationId,
      'finalize-gate-observation',
      deps,
      async () => {
        const { root } = await loadState(context, input.generationId);
        const directory = path.join(root, 'gate-observations');
        const target = path.join(directory, `${input.observationId}.json`);
        const reservation = await readJson(target);
        const finalized = { status: 'finalized', observationId: input.observationId };
        // The helper's own capability file authenticates; a missing one is a caller-side loss.
        const handle = await readObservationHandle(
          context,
          input.generationId,
          input.observationId,
          deps,
        );
        if (handle === null) fail('AUTHENTICATION_FAILED');
        const consume = () =>
          consumeObservationHandle(
            context,
            input.generationId,
            input.observationId,
            reservation.capabilityHash,
            deps,
          );
        if (handle.kind === CONSUMED_HANDLE_KIND) {
          // A consumed marker proves an earlier finalization; beside an open reservation it is
          // corrupt storage.
          if (reservation.kind === 'gate-observation-reservation') fail('UNSAFE_STORAGE');
          if (handle.capabilityHash !== reservation.capabilityHash) fail('AUTHENTICATION_FAILED');
          if (reservation.kind !== 'gate-observation') fail('INVALID_STATE');
          return finalized;
        }
        authenticate(handle.capability, reservation.capabilityHash);
        if (reservation.kind === 'gate-observation') {
          // A crash after the record write left the raw file behind.
          await consume();
          return finalized;
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
        // A surviving consumed marker always implies a durable finalized record.
        await syncDirectory(context, directory, deps);
        await consume();
        return finalized;
      },
    );
  });
}

async function suspendGeneration(input, deps) {
  commonInput(input, ['pilotControlOutcome', 'affectedRecordIds']);
  const mapping = PILOT_MEASUREMENT_POLICY_PROJECTION.pilotControlMappings.find(
    ({ outcome }) => outcome === input.pilotControlOutcome,
  );
  // Incidents are recorded only through record-incident, which maps the category itself.
  if (
    !mapping ||
    mapping.suspensionReason === 'none' ||
    INCIDENT_OUTCOME_SET.has(mapping.outcome)
  ) {
    fail('INVALID_PAYLOAD');
  }
  const affectedRecordIds = boundedArray(input.affectedRecordIds, 256).map(opaque).sort();
  const context = await ensureNamespace(input, deps);
  return await withLock(context, input.generationId, 'suspend', deps, async () => {
    await rollForwardTransition(context, input.generationId, deps);
    const { root, state } = await loadState(context, input.generationId, {
      previousProtocol: true,
    });
    if (!['baseline', 'active', 'suspended'].includes(state.generationState)) fail('INVALID_STATE');
    const suspension = await writeSuspension(
      context,
      root,
      input.generationId,
      state,
      mapping.suspensionReason,
      affectedRecordIds,
      deps,
      'suspend',
    );
    return {
      generationState: 'suspended',
      suspensionDigest: canonicalDigest(suspension),
      pilotControlOutcome: input.pilotControlOutcome,
    };
  });
}

async function recordIncident(input, deps) {
  // 'pending' before the lock, 'locked' while checking state, 'writing' once the suspension write
  // may have started, and 'persisted' after it completed.
  let stage = 'pending';
  let outcome;
  try {
    commonInput(input, ['category', 'affectedRecordIds']);
    outcome = INCIDENT_OUTCOMES[enumValue(input.category, Object.keys(INCIDENT_OUTCOMES))];
    const affectedRecordIds = boundedArray(input.affectedRecordIds, 256).map(opaque).sort();
    const context = await ensureNamespace(input, deps);
    await assertGenerationExists(context, input.generationId);
    return await withLock(context, input.generationId, 'record-incident', deps, async () => {
      stage = 'locked';
      const { state } = await loadState(context, input.generationId, { previousProtocol: true });
      if (!['baseline', 'active', 'suspended'].includes(state.generationState)) {
        fail('INVALID_STATE');
      }
      stage = 'writing';
      await rollForwardTransition(context, input.generationId, deps);
      const { root, state: current } = await loadState(context, input.generationId, {
        previousProtocol: true,
      });
      const suspension = await writeSuspension(
        context,
        root,
        input.generationId,
        current,
        outcome,
        affectedRecordIds,
        deps,
      );
      stage = 'persisted';
      return {
        generationState: 'suspended',
        suspensionDigest: canonicalDigest(suspension),
        pilotControlOutcome: outcome,
        controlStatePersisted: true,
        alert: 'none',
      };
    });
  } catch (error) {
    // No unlocked fallback: a held lock stays a retryable LOCKED so an incident can never be
    // written behind a concurrent resume.
    if (stage === 'persisted') throw controlError(error, outcome, true);
    if (error instanceof PilotMeasurementError && error.code === 'CAPACITY_EXHAUSTED') throw error;
    if (
      (stage === 'pending' && classifyControlFailure(error) === 'neutral') ||
      (stage === 'locked' &&
        error instanceof PilotMeasurementError &&
        error.code === 'INVALID_STATE')
    ) {
      throw controlError(error, 'none', false);
    }
    throw controlError(error, 'control-state-unpersistable', false);
  }
}

async function beginReview(input, deps) {
  commonInput(input, ['configState', 'expectedInventoryDigest', 'confirmation']);
  enumValue(input.configState, PILOT_MEASUREMENT_POLICY_PROJECTION.configStates);
  digestValue(input.expectedInventoryDigest);
  if (!booleanValue(input.confirmation)) fail('INVALID_PAYLOAD');
  const context = await ensureNamespace(input, deps);
  return await withLock(context, input.generationId, 'begin-review', deps, async () => {
    const evidence = await evidenceInventory(context, input.generationId, {
      previousProtocol: true,
    });
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
    await rollForwardTransition(context, input.generationId, deps);
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

// Finalizes an open reservation as `abandoned` under the caller's lifecycle lock: every packet's
// attempt is `unknown`, the transient owner, time, and overlap fields are dropped, and the run's
// timing receipts are drained. `input` carries the guarded roots, `generationId`, and `runId`;
// `operation` is the locked operation that names the write.
async function writeAbandonedRecord(context, root, target, record, input, operation, deps) {
  assertReservationPolicy(record);
  // A receipt that proves the pre-spawn admission-changed fallback keeps that packet out of the
  // Fast attempts; every other packet of an abandoned run stays unknown.
  const receiptFallbacks = new Map();
  for (const packet of record.packets) {
    const receipt = await readJson(
      path.join(root, 'records', `${input.runId}.${packet.packetId}.timing.json`),
      { missing: true },
    );
    if (receipt === null) continue;
    if (
      receipt.kind !== 'packet-timing-receipt' ||
      receipt.generationId !== input.generationId ||
      receipt.runId !== input.runId ||
      receipt.packetId !== packet.packetId ||
      receipt.packetCapabilityHash !== packet.packetCapabilityHash
    ) {
      fail('UNSAFE_STORAGE');
    }
    receiptFallbacks.set(packet.packetId, receipt.fallback);
  }
  const abandonedFallback = (packet) =>
    packet.selectedProfile === 'fast' &&
    receiptFallbacks.get(packet.packetId) === 'admission-changed'
      ? 'admission-changed'
      : 'none';
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
    installKind: record.installKind,
    ordinal: record.ordinal,
    packets: record.packets.map((packet) => ({
      packetId: packet.packetId,
      selectedProfile: packet.selectedProfile,
      wouldBeFastEligible: packet.wouldBeFastEligible,
      firstGateReason: packet.gate.firstReason,
      implementationDuration: { status: 'unavailable' },
      fallback: abandonedFallback(packet),
      escalated: false,
      costProxy: { status: 'unavailable' },
      attempt: 'unknown',
      modelCompliance: allowedModelCompliance(
        packet.selectedProfile,
        abandonedFallback(packet),
        'unknown',
        record.installKind,
      ).includes('unverified')
        ? 'unverified'
        : 'not-applicable',
    })),
    validation: { status: 'unavailable', requiredCount: 0, totalCount: 0, satisfiedCount: 0 },
    review: {
      status: 'unavailable',
      severityCounts: { critical: 0, important: 0, note: 0 },
    },
    completionStatus: 'abandoned',
    qualityCorrectionRounds: 0,
    detailTrace: false,
    overlapped:
      record.overlapFlag ||
      (await otherReservationOpen(root, input.generationId, input.runId, {
        observations: true,
      })),
  };
  await atomicWrite(context, target, abandoned, operation, input.generationId, deps);
  await removeWorkflowTimingReceipts(context, root, input, null, deps);
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
    await writeAbandonedRecord(
      context,
      evidence.root,
      target,
      record,
      input,
      'reconcile-record',
      deps,
    );
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

// An open reservation is stale once it is older than this; the owning session may still be live.
const RESERVATION_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

// The process ids procfs lists, or null where it lists none or hides processes: pid 1 is visible to
// every user unless procfs hides other users' processes, and a hidden owner would read as gone.
// `deps.listProcessIds()` replaces the `/proc` read.
function visibleProcessIds(deps) {
  let names;
  try {
    names = (deps.listProcessIds ?? (() => readdirSync('/proc')))();
  } catch {
    return null;
  }
  if (!Array.isArray(names)) return null;
  const pids = names
    .map((name) =>
      typeof name === 'number' ? name : /^[1-9][0-9]{0,9}$/.test(name) ? Number(name) : null,
    )
    .filter((pid) => Number.isSafeInteger(pid) && pid > 0);
  return pids.includes(1) ? pids : null;
}

// The liveness of the session that owns an open reservation, judged like a planning claim but from
// the salted owner and ancestor digests, so no pid is ever stored: `unknown` unless the salt's host
// binding names this helper's host identity (host name, boot id, and pid namespace, all readable,
// and procfs this helper's own), the owner was resolved, and procfs lists every process with a
// readable start time; then `alive` when some live process hashes to the owner digest, `unknown`
// when the owner is gone but a live process hashes to a recorded ancestor digest (the ancestor may
// be the session a wrapper ran under, or only a long-lived parent of a session that ended), and
// `dead` only when neither does, because the owner and every recorded ancestor are gone or their
// pids now belong to processes with other start times. A salt without a binding (a reservation from
// before the orphan check) or with a binding to an unreadable identity is `unknown`.
function reservationLiveness(reservation, deps) {
  const salt = reservation.ownerSalt;
  const parts = ownerSaltParts(salt);
  if (parts === null) return 'unknown';
  const identity = hostIdentity('self', deps);
  if (identity === null || hostBinding(parts.random, identity, parts.ancestors) !== parts.binding) {
    return 'unknown';
  }
  const { hostname } = identity;
  const owner = (pid, pidStartTime) => canonicalDigest({ salt, hostname, pid, pidStartTime });
  if (owner(null, null) === reservation.ownerDigest) return 'unknown';
  const pids = visibleProcessIds(deps);
  if (pids === null) return 'unknown';
  const ancestors = new Set(parts.ancestors);
  let unreadable = false;
  let ancestorLive = false;
  for (const pid of pids) {
    if (pid === 1) continue;
    // A recorded owner without a start time cannot be told from a reused pid: alive while present.
    if (owner(pid, null) === reservation.ownerDigest) return 'alive';
    const pidStartTime = processStartTime(pid, deps);
    if (pidStartTime === null) {
      if (probePid(pid, deps) !== 'stale-provable') unreadable = true;
      continue;
    }
    if (owner(pid, pidStartTime) === reservation.ownerDigest) return 'alive';
    // A live recorded ancestor without the owner never proves the session alive or dead.
    if (
      ancestors.size > 0 &&
      ancestors.has(ancestorDigest(parts.random, identity, pid, pidStartTime))
    ) {
      ancestorLive = true;
    }
  }
  return unreadable || ancestorLive ? 'unknown' : 'dead';
}

// The opaque handle of one open reservation in the cleanup listing; it names no run.
function reservationItemId(generationId, runId) {
  return canonicalDigest({ kind: 'workflow-reservation', generationId, runId });
}

function reservationAgeMs(reservation, deps) {
  return Math.max(0, nowMs(deps) - Date.parse(reservation.reservedAt));
}

// An abandoned record whose timing receipts were not all drained, because the abandonment faulted
// or crashed after writing it: its leftover receipts close admission for every later run until a
// repeated abandonment drains them.
function pendingDrain(record, leftoverTimings) {
  return (
    record.kind === 'workflow-record' &&
    record.completionStatus === 'abandoned' &&
    record.packets.some(({ packetId }) => leftoverTimings.has(packetId))
  );
}

// Read-only listing of the open workflow reservations of the current-protocol generation for a
// later cleanup session, which holds no run capability. Each item carries an opaque `itemId`, its
// `state` (`open`), the workflow, the age, `stale` (older than 24 hours), the owner's `liveness`,
// the `proof` an abandonment may cite (`process-dead`, or null), and the `recordDigest` the
// abandonment binds to. An abandoned record with leftover timing receipts is listed too, as
// `state: "pending-drain"` with `proof: "already-abandoned"` and no age, staleness, or liveness, so
// cleanup can finish its abandonment. Gate observations carry no owner or time fields and are not
// listed.
async function listReservations(input, deps) {
  exactObject(input, ['runtimeStateRoot', 'repositoryIdentity'], ['generationId']);
  stringValue(input.runtimeStateRoot, 4096);
  stringValue(input.repositoryIdentity, 4096);
  if (input.generationId !== undefined) opaque(input.generationId);
  const context = await inspectNamespace(input, deps);
  const discovered = await discoverGenerationIds(context);
  if (input.generationId === undefined && discovered.length > 1) fail('INVALID_STATE');
  const generationId = input.generationId ?? discovered[0] ?? null;
  const staleAfterHours = RESERVATION_STALE_AFTER_MS / 3_600_000;
  if (
    generationId === null ||
    !context.exists ||
    !(await directoryState(generationPath(context, generationId)))
  ) {
    return { generationId, generationStatus: 'absent', staleAfterHours, reservations: [] };
  }
  const evidence = await evidenceInventory(context, generationId, { previousProtocol: true });
  const protocolCurrent = evidence.state.protocolDigest === PILOT_MEASUREMENT_PROTOCOL_DIGEST;
  const leftoverTimings = new Set(evidence.leftoverTimings);
  const item = (record) => {
    if (record.kind !== 'workflow-reservation') {
      return {
        itemId: reservationItemId(generationId, record.runId),
        state: 'pending-drain',
        workflow: record.workflow,
        reservedAt: null,
        ageMs: null,
        stale: false,
        liveness: null,
        proof: 'already-abandoned',
        recordDigest: canonicalDigest(record),
      };
    }
    const ageMs = reservationAgeMs(record, deps);
    const liveness = reservationLiveness(record, deps);
    return {
      itemId: reservationItemId(generationId, record.runId),
      state: 'open',
      workflow: record.workflow,
      reservedAt: record.reservedAt,
      ageMs,
      stale: ageMs > RESERVATION_STALE_AFTER_MS,
      liveness,
      proof: liveness === 'dead' ? 'process-dead' : null,
      recordDigest: canonicalDigest(record),
    };
  };
  const reservations = protocolCurrent
    ? evidence.workflows
        .filter(
          (record) =>
            record.kind === 'workflow-reservation' || pendingDrain(record, leftoverTimings),
        )
        .map(item)
        .sort((left, right) => left.itemId.localeCompare(right.itemId))
    : [];
  return {
    generationId,
    generationStatus: 'present',
    generationState: evidence.state.generationState,
    protocolCurrent,
    staleAfterHours,
    reservations,
  };
}

// Abandons one open reservation a later session listed, without the run's capability: under the
// lifecycle lock it finds the item again, requires the unchanged record (`recordDigest`) and the
// confirmed basis to hold still, the `process-dead` proof or confirmed staleness, and finalizes the
// reservation as `abandoned`. It writes only that record and drains only that run's receipts.
// It is idempotent for a record it already abandoned: when the receipt drain faulted or crashed
// after the record was written, a repeated call (the identical one, or one citing the listed
// `already-abandoned` proof) drains the remaining receipts by membership, as `reconcile-record` does
// behind a terminal record, and changes nothing else. The lock and every write name the
// `reconcile-record` operation, whose lock and temporary names every 1.3.0 helper accepts, so a
// helper of an earlier release that meets them while the lock is held or after a crash reads them
// as an ordinary reconciliation instead of unsafe storage.
async function abandonReservation(input, deps) {
  commonInput(input, ['itemId', 'recordDigest', 'confirmation'], ['proof', 'confirmStale']);
  digestValue(input.itemId);
  digestValue(input.recordDigest);
  if (!booleanValue(input.confirmation)) fail('INVALID_PAYLOAD');
  if (input.proof !== undefined) enumValue(input.proof, ['process-dead', 'already-abandoned']);
  if (input.confirmStale !== undefined && input.confirmStale !== true) fail('INVALID_PAYLOAD');
  if ((input.proof !== undefined) === (input.confirmStale === true)) fail('INVALID_PAYLOAD');
  if (!(await inspectNamespace(input, deps)).exists) fail('NOT_FOUND');
  const context = await ensureNamespace(input, deps);
  await assertGenerationExists(context, input.generationId);
  return await withLock(context, input.generationId, 'reconcile-record', deps, async () => {
    const evidence = await evidenceInventory(context, input.generationId);
    const record = evidence.workflows.find(
      ({ kind, completionStatus, runId }) =>
        (kind === 'workflow-reservation' ||
          (kind === 'workflow-record' && completionStatus === 'abandoned')) &&
        reservationItemId(input.generationId, runId) === input.itemId,
    );
    if (record === undefined) fail('NOT_FOUND');
    if (record.kind === 'workflow-record') {
      await removeWorkflowTimingReceipts(
        context,
        evidence.root,
        { ...input, runId: record.runId },
        null,
        deps,
      );
      return { status: 'abandoned', itemId: input.itemId, basis: 'already-abandoned' };
    }
    if (input.proof === 'already-abandoned') fail('INVALID_STATE');
    if (canonicalDigest(record) !== input.recordDigest) fail('STALE_REVIEW');
    const holds =
      input.proof === 'process-dead'
        ? reservationLiveness(record, deps) === 'dead'
        : reservationAgeMs(record, deps) > RESERVATION_STALE_AFTER_MS;
    if (!holds) fail('INVALID_STATE');
    await writeAbandonedRecord(
      context,
      evidence.root,
      path.join(evidence.root, 'records', `${record.runId}.json`),
      record,
      { ...input, runId: record.runId },
      'reconcile-record',
      deps,
    );
    return {
      status: 'abandoned',
      itemId: input.itemId,
      basis: input.proof === 'process-dead' ? 'process-dead' : 'stale',
    };
  });
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
  if (ownerLock === null) {
    if (path.dirname(target) === path.join(root, 'locks')) {
      ownerLock = validateStagedLockRecord(
        await readJson(target),
        input.generationId,
        temporaryName,
      );
    } else if (
      path.dirname(target) === root &&
      SUSPENSION_REASONS.includes(temporaryIdentity(temporaryName, input.generationId).operation)
    ) {
      ownerLock = validateStagedMarkerRecord(
        await readJson(target),
        input.generationId,
        temporaryName,
      );
    } else {
      fail('LOCKED');
    }
  }
  if (probePid(ownerLock.ownerPid, deps) !== 'stale-provable') fail('LOCKED');
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
  // Records whose only first gate reason is correction-pass are measured but count toward no
  // minimum.
  const counted = selected.filter((record) => !correctionPassOnly(record));
  const countedCompleted = completed.filter((record) => !correctionPassOnly(record));
  const recordedPackets = selected.flatMap((record) => record.packets);
  // A not-started packet leaves every packet metric; an unknown packet stays in the counts but
  // never counts as a success, has no duration, and keeps the cost gate unavailable.
  const packets = recordedPackets.filter((packet) => packet.attempt !== 'not-started');
  // A packet with modelCompliance mismatch ran on a model other than the selected faster one, so it
  // leaves every Fast metric, duration, and cost and is counted only in modelComplianceOutcomes.
  const startedPackets = packets.filter(
    (packet) => packet.attempt === 'started' && packet.modelCompliance !== 'mismatch',
  );
  // A Fast packet consumed a Fast attempt unless it fell back before its spawn
  // (admission-changed).
  const fastAttemptPackets = packets.filter(
    (packet) => packet.selectedProfile === 'fast' && packet.fallback !== 'admission-changed',
  );
  const attemptedFast = fastAttemptPackets.filter(
    (packet) => packet.modelCompliance !== 'mismatch',
  );
  const eligible = packets.filter((packet) => packet.wouldBeFastEligible);
  const costPackets =
    cohort === 'baseline'
      ? packets.filter(
          (packet) => packet.selectedProfile === 'quality' && packet.wouldBeFastEligible,
        )
      : attemptedFast;
  const requiredValidation = selected.filter((record) => record.validation.requiredCount > 0);
  // Finding rates use the records whose review ran as denominator.
  const completedReview = selected.filter((record) => record.review.status === 'completed');
  const availableDurations = startedPackets.filter(
    (packet) => packet.implementationDuration.status === 'available',
  );
  const halves = ordinalHalves(selected);
  return {
    workflowCount: selected.length,
    completedCount: completed.length,
    countedRecordCount: counted.length,
    countedCompletedRecordCount: countedCompleted.length,
    correctionPassRecordCount: selected.length - counted.length,
    overlappedRecordCount: selected.filter((record) => record.overlapped).length,
    packetCount: packets.length,
    eligiblePacketCount: eligible.length,
    eligibleCompletedPacketCount: completed
      .flatMap((record) => record.packets)
      .filter((packet) => packet.wouldBeFastEligible).length,
    attemptedFastCount: attemptedFast.length,
    validationContributorCount: requiredValidation.length,
    reviewContributorCount: completedReview.length,
    durationContributorCount: availableDurations.length,
    // Informational only: an unavailable split never makes an adoption gate unavailable.
    ordinalHalves: halves,
    cohortMinimumMet: counted.length >= PILOT_MEASUREMENT_PROTOCOL.aggregation.cohortMinimum,
    installKindOutcomes: closedCounts(
      selected.map(({ installKind }) => installKind),
      PILOT_MEASUREMENT_PROTOCOL.enums.installKinds,
    ),
    modelComplianceOutcomes: closedCounts(
      fastAttemptPackets.map(({ modelCompliance }) => modelCompliance),
      PILOT_MEASUREMENT_PROTOCOL.enums.modelCompliance,
    ),
    completionOutcomes: closedCounts(
      selected.map(({ completionStatus }) => completionStatus),
      PILOT_MEASUREMENT_PROTOCOL.enums.completionStatuses,
    ),
    fallbackOutcomes: closedCounts(
      packets.map(({ fallback }) => fallback),
      PILOT_MEASUREMENT_POLICY_PROJECTION.fallbacks,
    ),
    durationOutcomes: closedCounts(
      startedPackets.map((packet) => packet.implementationDuration.status),
      ['available', 'unavailable'],
    ),
    attemptOutcomes: closedCounts(
      recordedPackets.map(({ attempt }) => attempt),
      PILOT_MEASUREMENT_PROTOCOL.enums.packetAttempts,
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
      BigInt(
        attemptedFast.filter((packet) => packet.attempt === 'started' && !packet.escalated).length,
      ),
      BigInt(attemptedFast.length),
    ),
    workflowCompletion: rational(BigInt(completed.length), BigInt(selected.length)),
    validationSuccess: rational(
      BigInt(requiredValidation.filter((record) => record.validation.status === 'passed').length),
      BigInt(requiredValidation.length),
    ),
    criticalFindingsPerReviewed: rational(
      BigInt(
        completedReview.reduce((sum, record) => sum + record.review.severityCounts.critical, 0),
      ),
      BigInt(completedReview.length),
    ),
    importantFindingsPerReviewed: rational(
      BigInt(
        completedReview.reduce((sum, record) => sum + record.review.severityCounts.important, 0),
      ),
      BigInt(completedReview.length),
    ),
    qualityCorrectionMedian: median(
      completed.map((record) => BigInt(record.qualityCorrectionRounds)),
    ),
    durationMedianMs: median(
      availableDurations.map((packet) => BigInt(packet.implementationDuration.milliseconds)),
    ),
    costGroups: costGroups(costPackets.filter((packet) => packet.attempt === 'started')),
    costUnavailableCount: costPackets.filter(
      (packet) => packet.attempt === 'unknown' || sumCost(packet) === null,
    ).length,
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
  const baselineKeys = Object.keys(baseline.costGroups);
  const pilotKeys = Object.keys(pilot.costGroups);
  if (
    baselineKeys.length !== 1 ||
    pilotKeys.length !== 1 ||
    baselineKeys[0] !== pilotKeys[0] ||
    baseline.costUnavailableCount !== 0 ||
    pilot.costUnavailableCount !== 0
  ) {
    return null;
  }
  const baselineGroup = baseline.costGroups[baselineKeys[0]];
  const pilotGroup = pilot.costGroups[pilotKeys[0]];
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
  // The chronological halves are reported but no longer gate readiness.
  const cohortsReady = baseline.cohortMinimumMet && pilot.cohortMinimumMet;
  return {
    // The baseline sample follows the activation minima: eligible packets of completed baseline
    // records, available once enough completed baseline records count.
    eligibleBaselinePackets:
      baseline.countedCompletedRecordCount >=
      PILOT_MEASUREMENT_PROTOCOL.aggregation.baselineRecordMinimum
        ? rational(BigInt(baseline.eligibleCompletedPacketCount))
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
      cohortsReady &&
      baseline.reviewContributorCount >= minimum &&
      pilot.reviewContributorCount >= minimum
        ? addRational(pilot.criticalFindingsPerReviewed, baseline.criticalFindingsPerReviewed, -1n)
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

function publicationSubsetCell(value, total) {
  const minimum = PILOT_MEASUREMENT_PROTOCOL.aggregation.suppressionMinimum;
  return value < minimum || total - value < minimum ? { suppressed: true } : value;
}

function publicationRatioCell(value, sampleSize, { requireComplement = false } = {}) {
  const minimum = BigInt(PILOT_MEASUREMENT_PROTOCOL.aggregation.suppressionMinimum);
  const sample = BigInt(sampleSize);
  if (value === null || sample < minimum) return { suppressed: true };
  const scaledNumerator = BigInt(value.numerator) * sample;
  const denominator = BigInt(value.denominator);
  if (scaledNumerator % denominator !== 0n) return { suppressed: true };
  const numerator = scaledNumerator / denominator;
  return numerator < minimum || (requireComplement && sample - numerator < minimum)
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
    eligiblePacketCount: publicationSubsetCell(metrics.eligiblePacketCount, metrics.packetCount),
    attemptedFastCount: publicationSubsetCell(metrics.attemptedFastCount, metrics.packetCount),
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
    criticalFindingsPerReviewed: reviewOutcomes.suppressed
      ? { suppressed: true }
      : publicationRatioCell(metrics.criticalFindingsPerReviewed, metrics.reviewContributorCount),
    importantFindingsPerReviewed: reviewOutcomes.suppressed
      ? { suppressed: true }
      : publicationRatioCell(metrics.importantFindingsPerReviewed, metrics.reviewContributorCount),
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
            checksSatisfied: publicationRatioCell(
              group.checksSatisfied,
              group.checkContributorCount,
              { requireComplement: true },
            ),
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

// For an absent generation, a confirmed purge or discard removes capability files only when the
// caller echoes the dry run's `observationHandlesDigest`; a missing or different value is stale.
function assertObservationHandlesReviewed(input, handles) {
  if (input.observationHandlesDigest !== undefined) digestValue(input.observationHandlesDigest);
  if (
    (handles.exists || input.observationHandlesDigest !== undefined) &&
    input.observationHandlesDigest !== handles.digest
  ) {
    fail('STALE_REVIEW');
  }
}

function absentHandleView(handles) {
  return { observationHandles: handles.count, observationHandlesDigest: handles.digest };
}

async function purgeGeneration(input, deps) {
  commonInput(input, ['dryRun'], ['reviewDigest', 'confirmation', 'observationHandlesDigest']);
  booleanValue(input.dryRun);
  const context = input.dryRun
    ? await inspectNamespace(input, deps)
    : await ensureNamespace(input, deps);
  if (!context.exists) {
    return {
      generationId: input.generationId,
      generationStatus: 'absent',
      normalTombstones: 0,
      ...absentHandleView(await observationHandleInventory(context, input.generationId, deps)),
    };
  }
  const root = generationPath(context, input.generationId);
  if (!(await directoryState(root))) {
    const tombstones = await scanTombstones(context, input.generationId);
    const handles = await observationHandleInventory(context, input.generationId, deps, {
      mutation: !input.dryRun,
    });
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
      assertObservationHandlesReviewed(input, handles);
      await removeTombstone(context, target, input, deps);
      await removeObservationHandles(context, input.generationId, deps);
    }
    const remaining = await scanTombstones(context, input.generationId);
    return {
      generationId: input.generationId,
      generationStatus: 'absent',
      normalTombstones: remaining.normal.length,
      ...(input.dryRun ? absentHandleView(handles) : {}),
    };
  }
  await assertKnownGenerationTree(root);
  const { review } = await validateReviewBinding(context, input.generationId);
  const reviewDigest = review.reviewDigest;
  if (input.dryRun) {
    const handles = await observationHandleInventory(context, input.generationId, deps);
    return {
      generationId: input.generationId,
      generationStatus: 'present',
      reviewDigest,
      inventory: await inventoryOperation(
        {
          runtimeStateRoot: input.runtimeStateRoot,
          repositoryIdentity: input.repositoryIdentity,
          generationId: input.generationId,
        },
        deps,
      ),
      observationHandles: handles.count,
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
    // A crash after this removal leaves the generation present, so a retry finishes it.
    await removeObservationHandles(context, input.generationId, deps);
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
    ['fullInventoryDigest', 'decision', 'confirmation', 'observationHandlesDigest'],
  );
  enumValue(input.configState, ['disabled']);
  booleanValue(input.dryRun);
  const context = input.dryRun
    ? await inspectNamespace(input, deps)
    : await ensureNamespace(input, deps);
  if (!context.exists) {
    return {
      generationId: input.generationId,
      generationStatus: 'absent',
      discardTombstones: 0,
      ...absentHandleView(await observationHandleInventory(context, input.generationId, deps)),
    };
  }
  const root = generationPath(context, input.generationId);
  if (!(await directoryState(root))) {
    const tombstones = await scanTombstones(context, input.generationId);
    const handles = await observationHandleInventory(context, input.generationId, deps, {
      mutation: !input.dryRun,
    });
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
      assertObservationHandlesReviewed(input, handles);
      await removeTombstone(context, target, input, deps);
      await removeObservationHandles(context, input.generationId, deps);
    }
    const remaining = await scanTombstones(context, input.generationId);
    return {
      generationId: input.generationId,
      generationStatus: 'absent',
      discardTombstones: remaining.discard.length,
      ...(input.dryRun ? absentHandleView(handles) : {}),
    };
  }
  const state = await readJson(path.join(root, 'state.json'));
  if (state.generationState !== 'review') fail('INVALID_STATE');
  await assertNoGenerationLocks(root, input.generationId);
  const inventory = await opaqueFullInventory(root);
  await assertNoGenerationLocks(root, input.generationId);
  if (input.dryRun) {
    const handles = await observationHandleInventory(context, input.generationId, deps);
    return {
      generationId: input.generationId,
      generationStatus: 'present',
      counts: inventory.counts,
      totalBytes: inventory.totalBytes,
      fullInventoryDigest: inventory.fullInventoryDigest,
      keepEligible: false,
      observationHandles: handles.count,
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
    // A crash after this removal leaves the generation present, so a retry finishes it.
    await removeObservationHandles(context, input.generationId, deps);
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
      result = await finalizeWorkflowGuarded(input, deps);
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
    case 'record-incident':
      result = await recordIncident(input, deps);
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
    case 'list-reservations':
      result = await listReservations(input, deps);
      break;
    case 'abandon-reservation':
      result = await abandonReservation(input, deps);
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
