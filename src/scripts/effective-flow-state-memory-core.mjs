// Runtime-state helper: the typed `memory` operations on `<RUNTIME_STATE_ROOT>/.effective-flow/
// memory.json`. No generic write or merge exists; a new key family needs a new operation.
//
//   memory reserve            {cwd, owner, waitSeconds?, count}
//   memory set-marker         {cwd, owner, waitSeconds?, marker, version?}
//   memory migrate-directory  {cwd, owner, waitSeconds?}
//
// `owner` is `{workflow}`, the memory-lock owner of `lock acquire`. Each operation is one complete
// transaction under the `memory` lock, taken internally with the `lock acquire` wait semantics:
//
//   1. take the lock (LOCK_HELD after `waitSeconds`);
//   2. re-read canonical memory: a regular file holding one JSON object of at most
//      MAX_MEMORY_BYTES whose `lastFindingNumber`, when present, is a nonnegative safe integer,
//      else INVALID_STATE;
//   3. when canonical memory is absent, adopt the whole root `.sf-memory.json` as the base
//      (LEGACY_MEMORY_INVALID when it is unreadable or invalid), recording its identity and digest;
//   4. apply only the operation's own field;
//   5. immediately before the rename, re-inspect the lock and require the retained owner token
//      (NOT_OWNER otherwise) and, for an adopted legacy file, its unchanged identity and digest
//      (LEGACY_CHANGED otherwise); neither writes nor reserves anything;
//   6. write the full object with a trailing newline through the shared `atomicWrite`, keeping
//      every other field;
//   7. after an adoption, re-check the legacy file and remove it through its own guard class, or
//      report `legacyConflict` / `legacyRemoval` without a rollback;
//   8. release the lock in a `finally`.
//
// The on-disk protocol stays that of the prose writers: the same lock directory and owner format,
// a temp-plus-rename write of the full object, a counter that is never decremented, and the marker
// shapes below. `memory reserve` and `memory set-marker` require the `runtimeMigration.directory`
// marker (MIGRATION_REQUIRED otherwise); `memory migrate-directory` is what writes it.

import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import {
  LEGACY_MEMORY_ENTRY,
  LEGACY_MEMORY_FILE,
  O_NOFOLLOW,
  RUNTIME_STATE_DIR,
  RuntimeStateError,
  assertDirectoryChain,
  atomicWrite,
  ensureGuardedDirectory,
  guardTargets,
  guardedMkdir,
  guardedUnlinkLegacyMemory,
  selectLegacySource,
  walkLegacySource,
} from './runtime-state-guard.mjs';
import {
  MAX_REPORTED_ENTRIES,
  StateError,
  StateOutcome,
  acquireOwned,
  fail,
  makeContext,
  observeLock,
  releaseOwned,
  requireClosedKeys,
  requireObject,
  requireOwnerInput,
  requireRootSyntax,
  requireWaitSeconds,
  resolveRoot,
} from './effective-flow-state-core.mjs';
import { isObject, readBoundedFile, sameFileRead, setOwn } from './runtime-file-primitives.mjs';

export const MEMORY_FILE = 'memory.json';
export const MAX_MEMORY_BYTES = 1024 * 1024;
export const MAX_RESERVE_COUNT = 10_000;
export const MAX_FINDING_NUMBER = 9_999_999;
export const MEMORY_MARKERS = Object.freeze(['config-migration-adr', 'label-migration-sf']);
export const CONFIG_MIGRATION_ADR_VERSIONS = Object.freeze(['config-to-adr-v1']);
export const DIRECTORY_MIGRATION_VERSION = 1;

const MEMORY_KEYS = Object.freeze({
  'memory reserve': Object.freeze(['cwd', 'owner', 'waitSeconds', 'count']),
  'memory set-marker': Object.freeze(['cwd', 'owner', 'waitSeconds', 'marker', 'version']),
  'memory migrate-directory': Object.freeze(['cwd', 'owner', 'waitSeconds']),
});

const READ_FLAGS = fsConstants.O_RDONLY | O_NOFOLLOW | (fsConstants.O_NONBLOCK ?? 0);
const WRITE_FLAGS = fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | O_NOFOLLOW;
const COPY_CHUNK_BYTES = 64 * 1024;

// `YYYY-MM-DDTHH:mm:ssZ`, UTC without milliseconds.
function timestamp(deps) {
  return new Date((deps.now ?? Date.now)()).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function formatFindingId(number) {
  return `R-${String(number).padStart(7, '0')}`;
}

// ---------------------------------------------------------------------------------------------
// Reading memory files

// Reads one memory file through the shared bounded read (see `readBoundedFile`).
function readBounded(fs, target) {
  return readBoundedFile(fs, target, MAX_MEMORY_BYTES);
}

function sameRead(left, right) {
  return left.state === 'ok' && right.state === 'ok' && sameFileRead(left, right);
}

// Parses memory content: `{ value }` for a JSON object with a valid counter, else `{ reason }`.
function parseMemory(content) {
  let value;
  try {
    value = JSON.parse(content.toString('utf8'));
  } catch {
    return { reason: 'invalid-json' };
  }
  if (!isObject(value)) return { reason: 'not-an-object' };
  if (value.lastFindingNumber !== undefined) {
    const counter = value.lastFindingNumber;
    if (!Number.isSafeInteger(counter) || counter < 0) return { reason: 'invalid-counter' };
  }
  return { value };
}

function hasDirectoryMarker(memory) {
  const migration = memory?.runtimeMigration;
  return isObject(migration) && isObject(migration.directory)
    ? migration.directory.version === DIRECTORY_MIGRATION_VERSION
    : false;
}

function memoryPaths(cwd) {
  const stateDir = path.join(cwd, RUNTIME_STATE_DIR);
  return {
    stateDir,
    memory: path.join(stateDir, MEMORY_FILE),
    legacy: path.join(cwd, LEGACY_MEMORY_FILE),
  };
}

function legacyInvalid(target, read, reason) {
  return new StateOutcome('LEGACY_MEMORY_INVALID', {
    path: target,
    reason: reason ?? read.state,
    ...(read?.detail ? { detail: read.detail } : {}),
  });
}

// The base of a transaction: canonical memory, or the adopted root legacy file when canonical
// memory is absent, or an empty object. Runs under the memory lock.
async function loadBase(context, paths) {
  const canonical = await readBounded(context.fs, paths.memory);
  if (canonical.state === 'ok') {
    const parsed = parseMemory(canonical.content);
    if (!parsed.value) fail('INVALID_STATE', `${paths.memory} is invalid: ${parsed.reason}`);
    return { memory: parsed.value, legacy: null };
  }
  if (canonical.state === 'oversized') {
    fail('INVALID_STATE', `${paths.memory} is ${canonical.detail}`);
  }
  if (canonical.state !== 'missing') {
    fail('UNSAFE_TARGET', `cannot read ${paths.memory}: ${canonical.detail}`);
  }
  const legacy = await readBounded(context.fs, paths.legacy);
  if (legacy.state === 'missing') return { memory: {}, legacy: null };
  if (legacy.state !== 'ok') return legacyInvalid(paths.legacy, legacy);
  const parsed = parseMemory(legacy.content);
  if (!parsed.value) return legacyInvalid(paths.legacy, legacy, parsed.reason);
  return { memory: parsed.value, legacy };
}

// ---------------------------------------------------------------------------------------------
// The transaction

async function prepareMemory(operation, input, deps) {
  requireObject(input, 'input');
  requireClosedKeys(input, MEMORY_KEYS[operation], 'input');
  const fields = requireOwnerInput('memory', input.owner);
  const waitSeconds = requireWaitSeconds(input.waitSeconds);
  return { fields, waitSeconds, context: makeContext(deps) };
}

async function openRoot(context, cwd) {
  await requireRootSyntax(cwd);
  await resolveRoot(context, cwd);
  const paths = memoryPaths(context.cwd);
  await ensureGuardedDirectory(context, paths.stateDir);
  return paths;
}

// Releases the transaction's lock. Returns null after a clean release, otherwise a diagnostic the
// transaction's result or outcome carries as `lockRelease` and an error appends to its message; a
// release failure never hides the transaction's own result or error.
async function releaseQuietly(context, token, deps) {
  try {
    const released = await releaseOwned(context, 'memory', token, deps);
    if (released instanceof StateOutcome) {
      return { released: false, code: released.code, reason: released.details.reason ?? null };
    }
    return released.leftoverTombstone
      ? { released: true, leftoverTombstone: released.leftoverTombstone }
      : null;
  } catch (error) {
    return {
      released: false,
      code: error instanceof RuntimeStateError ? error.code : 'INTERNAL_ERROR',
      message: error?.message ?? 'release failed',
    };
  }
}

function describeRelease(release) {
  if (release.released) return `lock released, leftover tombstone ${release.leftoverTombstone}`;
  return `lock release failed: ${release.code}${release.reason ? ` (${release.reason})` : ''}${
    release.message ? `: ${release.message}` : ''
  }`;
}

// Runs `apply(memory, base)` under the memory lock. `apply` mutates `memory` in place and returns
// an outcome, `{ write: false, result }` or `{ write: true, result }`.
async function memoryTransaction(context, paths, { fields, waitSeconds, deps }, apply) {
  const acquired = await acquireOwned(context, 'memory', fields, waitSeconds, deps);
  if (acquired instanceof StateOutcome) return acquired;
  const { token } = acquired.owner;
  let value;
  let failure;
  try {
    value = await commitUnderLock(context, paths, token, apply, deps);
  } catch (error) {
    failure = error;
  }
  const release = await releaseQuietly(context, token, deps);
  if (failure) {
    if (release && failure instanceof Error) {
      failure.message = `${failure.message}; ${describeRelease(release)}`;
    }
    throw failure;
  }
  if (!release) return value;
  if (value instanceof StateOutcome) {
    return new StateOutcome(value.code, { ...value.details, lockRelease: release });
  }
  return { ...value, lockRelease: release };
}

// `deps.onPhase(name)`, when given, runs at the named points of a transaction, so a test can race
// one exact step: `beforeRename` (the temporary file is complete, before the owner and legacy
// re-checks) and `afterRename` (the canonical write is committed, before the legacy removal).
async function phase(deps, name) {
  await deps.onPhase?.(name);
}

async function commitUnderLock(context, paths, token, apply, deps) {
  const base = await loadBase(context, paths);
  if (base instanceof StateOutcome) return base;
  const change = await apply(base.memory, base);
  if (change instanceof StateOutcome) return change;
  if (!change.write) return change.result;
  const written = await atomicWrite(
    context,
    paths.memory,
    `${JSON.stringify(base.memory, null, 2)}\n`,
    {
      beforeRename: async () => {
        await phase(deps, 'beforeRename');
        const observed = await observeLock(context, 'memory');
        if (
          !observed.present ||
          observed.owner.state !== 'valid' ||
          observed.owner.fields.token !== token
        ) {
          return new StateOutcome('NOT_OWNER', { reason: 'token-mismatch', ...observed });
        }
        if (base.legacy && !sameRead(await readBounded(context.fs, paths.legacy), base.legacy)) {
          fail(
            'LEGACY_CHANGED',
            `${paths.legacy} changed while it was adopted; nothing was written or reserved`,
          );
        }
        return null;
      },
    },
  );
  if (!written.written) return written.aborted;
  if (!base.legacy) return change.result;
  await phase(deps, 'afterRename');
  return { ...change.result, legacyAdopted: true, ...(await removeLegacy(context, paths, base)) };
}

// After the canonical rename: remove the adopted legacy file only when it is still exactly the
// adopted one. A change is `legacyConflict`, a failed removal `legacyRemoval`; neither rolls back.
async function removeLegacy(context, paths, base) {
  const again = await readBounded(context.fs, paths.legacy);
  if (again.state === 'missing') return {};
  if (!sameRead(again, base.legacy)) return { legacyConflict: { path: paths.legacy } };
  try {
    await guardedUnlinkLegacyMemory(context, paths.legacy);
    return {};
  } catch (error) {
    return { legacyRemoval: { path: paths.legacy, error: error?.message ?? String(error) } };
  }
}

function ensureObject(container, key, label) {
  const existing = container[key];
  if (existing === undefined) {
    const created = {};
    setOwn(container, key, created);
    return created;
  }
  if (!isObject(existing)) fail('INVALID_STATE', `${label} is not a JSON object`);
  return existing;
}

function migrationRequired(paths) {
  return new StateOutcome('MIGRATION_REQUIRED', {
    path: paths.memory,
    marker: 'runtimeMigration.directory',
  });
}

// ---------------------------------------------------------------------------------------------
// memory reserve

function requireCount(value) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_RESERVE_COUNT) {
    fail('INVALID_INPUT', `count must be an integer from 1 to ${MAX_RESERVE_COUNT}`);
  }
  return value;
}

export async function reserveMemory(input, deps) {
  const prepared = await prepareMemory('memory reserve', input, deps);
  const count = requireCount(input.count);
  const paths = await openRoot(prepared.context, input.cwd);
  return memoryTransaction(prepared.context, paths, { ...prepared, deps }, (memory) => {
    if (!hasDirectoryMarker(memory)) return migrationRequired(paths);
    const previous = memory.lastFindingNumber ?? 0;
    const last = previous + count;
    if (last > MAX_FINDING_NUMBER) {
      fail(
        'INVALID_STATE',
        `reserving ${count} after ${formatFindingId(previous)} would pass ${formatFindingId(MAX_FINDING_NUMBER)}; nothing was reserved`,
      );
    }
    setOwn(memory, 'lastFindingNumber', last);
    const first = previous + 1;
    return {
      write: true,
      result: {
        path: paths.memory,
        count,
        first,
        last,
        firstId: formatFindingId(first),
        lastId: formatFindingId(last),
      },
    };
  });
}

// ---------------------------------------------------------------------------------------------
// memory set-marker

function requireMarker(input) {
  if (!MEMORY_MARKERS.includes(input.marker)) {
    fail('INVALID_INPUT', `marker must be one of ${MEMORY_MARKERS.join(', ')}`);
  }
  if (input.marker === 'config-migration-adr') {
    if (!CONFIG_MIGRATION_ADR_VERSIONS.includes(input.version)) {
      fail('INVALID_INPUT', `version must be one of ${CONFIG_MIGRATION_ADR_VERSIONS.join(', ')}`);
    }
  } else if (input.version !== undefined) {
    fail('INVALID_INPUT', 'version is only valid for marker config-migration-adr');
  }
  return { marker: input.marker, version: input.version };
}

// Each marker: its parent and leaf key, the presence test, and the fields the helper sets. Any
// other field a prose writer added is kept, and a present marker is never rewritten.
const MARKERS = Object.freeze({
  'config-migration-adr': Object.freeze({
    parent: 'configMigration',
    leaf: 'adr',
    present: (node, { version }) => node.version === version,
    fields: ({ version }, deps) => ({ version, appliedAt: timestamp(deps) }),
  }),
  'label-migration-sf': Object.freeze({
    parent: 'labelMigration',
    leaf: 'sf',
    present: (node) => node.done === true,
    fields: (_, deps) => ({ done: true, completedAt: timestamp(deps) }),
  }),
});

export async function setMemoryMarker(input, deps) {
  const prepared = await prepareMemory('memory set-marker', input, deps);
  const request = requireMarker(input);
  const paths = await openRoot(prepared.context, input.cwd);
  const spec = MARKERS[request.marker];
  return memoryTransaction(prepared.context, paths, { ...prepared, deps }, (memory) => {
    if (!hasDirectoryMarker(memory)) return migrationRequired(paths);
    const label = `${spec.parent}.${spec.leaf}`;
    const existingParent = memory[spec.parent];
    if (existingParent !== undefined && !isObject(existingParent)) {
      fail('INVALID_STATE', `${spec.parent} is not a JSON object`);
    }
    const existing = existingParent?.[spec.leaf];
    if (existing !== undefined && !isObject(existing)) {
      fail('INVALID_STATE', `${label} is not a JSON object`);
    }
    if (existing && spec.present(existing, request)) {
      return {
        write: false,
        result: { path: paths.memory, marker: request.marker, changed: false, value: existing },
      };
    }
    const parent = ensureObject(memory, spec.parent, spec.parent);
    const node = ensureObject(parent, spec.leaf, label);
    for (const [key, value] of Object.entries(spec.fields(request, deps))) setOwn(node, key, value);
    return {
      write: true,
      result: { path: paths.memory, marker: request.marker, changed: true, value: node },
    };
  });
}

// ---------------------------------------------------------------------------------------------
// memory migrate-directory

// Adds every key of `source` absent from `target`, recursing where both hold an object; the
// target wins at every scalar, array, object or type conflict.
function addAbsent(target, source) {
  for (const key of Object.keys(source)) {
    if (!Object.hasOwn(target, key)) setOwn(target, key, source[key]);
    else if (isObject(target[key]) && isObject(source[key])) addAbsent(target[key], source[key]);
  }
}

function capped(list) {
  return list.slice(0, MAX_REPORTED_ENTRIES);
}

function temporaryFor(target, deps) {
  return path.join(
    path.dirname(target),
    `.${path.basename(target)}.${(deps.randomToken ?? (() => randomBytes(8).toString('hex')))()}.tmp`,
  );
}

// Copies one regular file without ever leaving a partial target: the content goes to `temporary`
// first and is then linked exclusively to the target name, so an existing or concurrently created
// target wins. Returns `copied`, `exists`, or `skipped` with the type the source turned out to
// have. Both the temporary path and the target have passed the batched runtime-state guard
// (`guardTargets`); the symlink-free directory chain is re-proven here, right before the writes.
async function copyFileExclusive(context, source, target, temporary) {
  const { fs } = context;
  await assertDirectoryChain(context.cwd, path.dirname(target));
  try {
    await fs.lstat(target);
    return { status: 'exists' };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  let input;
  try {
    input = await fs.open(source, READ_FLAGS);
  } catch (error) {
    if (error?.code === 'ELOOP' || error?.code === 'EMLINK') {
      return { status: 'skipped', type: 'symlink' };
    }
    throw error;
  }
  let output;
  try {
    const info = await input.stat();
    if (!info.isFile()) return { status: 'skipped', type: 'non-regular' };
    output = await fs.open(temporary, WRITE_FLAGS, 0o600);
    const buffer = Buffer.alloc(COPY_CHUNK_BYTES);
    for (;;) {
      const { bytesRead } = await input.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      // A successful write may be short: finish the chunk before the next read, failing on
      // zero progress so a truncated temporary is never linked.
      for (let offset = 0; offset < bytesRead;) {
        const { bytesWritten } = await output.write(buffer, offset, bytesRead - offset);
        if (!(bytesWritten > 0)) {
          throw Object.assign(new Error(`write made no progress: ${temporary}`), { code: 'EIO' });
        }
        offset += bytesWritten;
      }
    }
    await output.sync();
  } catch (error) {
    if (output) await fs.unlink(temporary).catch(() => {});
    throw error;
  } finally {
    await input.close().catch(() => {});
    await output?.close().catch(() => {});
  }
  try {
    await fs.link(temporary, target);
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    if (error?.code === 'EEXIST') return { status: 'exists' };
    throw error;
  }
  await fs.unlink(temporary).catch(() => {});
  return { status: 'copied' };
}

function incomplete(reason, details) {
  return new StateOutcome('MIGRATION_INCOMPLETE', { reason, ...details });
}

function failureOf(relative, error) {
  return {
    path: relative,
    code: error instanceof RuntimeStateError ? error.code : (error?.code ?? 'INTERNAL_ERROR'),
    message: error?.message ?? String(error),
  };
}

// Copies the legacy tree no-clobber into `.effective-flow/`, outside the memory lock. Returns the
// copy record (`copied`, `kept`, `skipped`, `expected`) or MIGRATION_INCOMPLETE at the first
// failure; files already carried over stay.
async function copyLegacyTree(context, source, stateDir, deps) {
  let walk;
  try {
    walk = await walkLegacySource(source.path);
  } catch (error) {
    return incomplete('copy-failed', { failed: failureOf('', error), copied: [] });
  }
  const copied = [];
  const kept = [];
  const skipped = [...walk.skipped];
  const expected = [];
  // Target directories that exist as something else: their subtree is the target's.
  const blocked = [];
  const isBlocked = (relative) => blocked.some((prefix) => relative.startsWith(`${prefix}/`));
  for (const relative of walk.directories) {
    if (isBlocked(relative)) continue;
    const target = path.join(stateDir, relative);
    try {
      if (!(await guardedMkdir(context, target))) {
        const info = await context.fs.lstat(target);
        if (info.isSymbolicLink() || !info.isDirectory()) {
          kept.push(relative);
          blocked.push(relative);
        }
      }
    } catch (error) {
      return incomplete('copy-failed', {
        failed: failureOf(relative, error),
        copied: capped(copied),
      });
    }
  }
  // One guard run for every file target and its temporary sibling, each with its own verdict.
  const files = walk.files
    .filter((relative) => !isBlocked(relative))
    .map((relative) => {
      const target = path.join(stateDir, relative);
      return { relative, target, temporary: temporaryFor(target, deps) };
    });
  try {
    await guardTargets(
      context,
      files.flatMap(({ target, temporary }) => [temporary, target]),
    );
  } catch (error) {
    const named = files.find(({ target, temporary }) =>
      [target, temporary].includes(error?.target),
    );
    return incomplete('copy-failed', {
      failed: failureOf(named?.relative ?? '', error),
      copied: [],
    });
  }
  for (const { relative, target, temporary } of files) {
    try {
      const copy = await copyFileExclusive(
        context,
        path.join(source.path, relative),
        target,
        temporary,
      );
      if (copy.status === 'copied') {
        copied.push(relative);
        expected.push(relative);
      } else if (copy.status === 'skipped') {
        skipped.push({ path: relative, type: copy.type });
      } else {
        kept.push(relative);
        const info = await context.fs.lstat(target);
        if (info.isFile()) expected.push(relative);
      }
    } catch (error) {
      return incomplete('copy-failed', {
        failed: failureOf(relative, error),
        copied: capped(copied),
      });
    }
  }
  return { copied, kept, skipped, expected };
}

// Reads a legacy directory's `memory.json`: null when absent, the parsed object, or a
// LEGACY_MEMORY_INVALID outcome.
async function readLegacyDirectoryMemory(fs, target) {
  const read = await readBounded(fs, target);
  if (read.state === 'missing') return null;
  if (read.state !== 'ok') return legacyInvalid(target, read);
  const parsed = parseMemory(read.content);
  return parsed.value ?? legacyInvalid(target, read, parsed.reason);
}

async function missingTargets(fs, stateDir, expected) {
  const missing = [];
  for (const relative of expected) {
    try {
      if (!(await fs.lstat(path.join(stateDir, relative))).isFile()) missing.push(relative);
    } catch {
      missing.push(relative);
    }
  }
  return missing;
}

// Source-relative record paths, reported relative to `cwd` (`.firmo/<path>`).
function prefixed(name, list) {
  const join = (relative) => (relative === '' ? name : `${name}/${relative}`);
  return list.map((entry) =>
    typeof entry === 'string' ? join(entry) : { ...entry, path: join(entry.path) },
  );
}

export async function migrateDirectory(input, deps) {
  const prepared = await prepareMemory('memory migrate-directory', input, deps);
  const { context } = prepared;
  const paths = await openRoot(context, input.cwd);
  const notNeeded = () =>
    new StateOutcome('MIGRATION_NOT_NEEDED', {
      path: paths.memory,
      marker: { version: DIRECTORY_MIGRATION_VERSION },
    });

  // A read-only look first, so a migrated repository never walks or copies anything, and an
  // invalid canonical memory or root `.sf-memory.json` stops the run before any copy. The
  // transaction re-reads both under the lock.
  const current = await loadBase(context, paths);
  if (current instanceof StateOutcome) return current;
  if (hasDirectoryMarker(current.memory)) return notNeeded();

  const source = await selectLegacySource(context.cwd);
  let record = { copied: [], kept: [], skipped: [], expected: [] };
  let legacyMemoryPath = null;
  if (source && source.type !== 'directory') {
    // A legacy source that is itself a link or special file is never followed.
    record.skipped.push({ path: '', type: source.type });
  } else if (source) {
    legacyMemoryPath = path.join(source.path, LEGACY_MEMORY_ENTRY);
    const legacyMemory = await readLegacyDirectoryMemory(context.fs, legacyMemoryPath);
    if (legacyMemory instanceof StateOutcome) return legacyMemory;
    const copy = await copyLegacyTree(context, source, paths.stateDir, deps);
    if (copy instanceof StateOutcome) {
      return new StateOutcome(copy.code, {
        ...copy.details,
        source: source.name,
        failed: { ...copy.details.failed, ...prefixed(source.name, [copy.details.failed])[0] },
        copied: prefixed(source.name, copy.details.copied),
      });
    }
    record = copy;
  }

  return memoryTransaction(context, paths, { ...prepared, deps }, async (memory) => {
    if (hasDirectoryMarker(memory)) return notNeeded();
    const missing = await missingTargets(context.fs, paths.stateDir, record.expected);
    if (missing.length > 0) {
      return incomplete('target-missing', {
        source: source?.name ?? null,
        missing: capped(missing.map((relative) => `${RUNTIME_STATE_DIR}/${relative}`)),
        missingCount: missing.length,
      });
    }
    if (legacyMemoryPath) {
      const legacyMemory = await readLegacyDirectoryMemory(context.fs, legacyMemoryPath);
      if (legacyMemory instanceof StateOutcome) return legacyMemory;
      if (legacyMemory) addAbsent(memory, legacyMemory);
    }
    const migration = ensureObject(memory, 'runtimeMigration', 'runtimeMigration');
    const directory = ensureObject(migration, 'directory', 'runtimeMigration.directory');
    setOwn(directory, 'version', DIRECTORY_MIGRATION_VERSION);
    const name = source?.name ?? null;
    return {
      write: true,
      result: {
        path: paths.memory,
        source: name,
        marker: { version: DIRECTORY_MIGRATION_VERSION },
        copied: capped(name ? prefixed(name, record.copied) : []),
        copiedCount: record.copied.length,
        kept: capped(name ? prefixed(name, record.kept) : []),
        keptCount: record.kept.length,
        skipped: capped(name ? prefixed(name, record.skipped) : []),
        skippedCount: record.skipped.length,
      },
    };
  });
}
