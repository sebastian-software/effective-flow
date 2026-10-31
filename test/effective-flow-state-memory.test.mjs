import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import {
  link as linkPath,
  lstat as lstatPath,
  mkdir as mkdirPath,
  open as openPath,
} from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import { LOCKS, executeOperation } from '../src/scripts/effective-flow-state-core.mjs';
import {
  CONFIG_MIGRATION_ADR_VERSIONS,
  MAX_FINDING_NUMBER,
  MAX_MEMORY_BYTES,
  MAX_RESERVE_COUNT,
  MEMORY_MARKERS,
  formatFindingId,
} from '../src/scripts/effective-flow-state-memory-core.mjs';
import { main } from '../src/scripts/effective-flow-state.mjs';
import {
  expectError,
  expectOk,
  expectOutcome,
  fakeClock,
  fakeGit,
  fakeRoot,
  unreachableRunner,
} from './support/state-helper-fixtures.mjs';

const OWNER = Object.freeze({ workflow: 'review' });
const MARKED = Object.freeze({ runtimeMigration: { directory: { version: 1 } } });
const NOW = Date.parse('2026-10-30T12:34:56.789Z');
const TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;

function stateDir(root) {
  return join(root, '.effective-flow');
}

function memoryPath(root) {
  return join(stateDir(root), 'memory.json');
}

function legacyPath(root) {
  return join(root, '.sf-memory.json');
}

function lockDir(root) {
  return join(stateDir(root), LOCKS.memory.directory);
}

// A fake main checkout with optional canonical memory (an object is written with a trailing
// newline, a string verbatim) and an optional root legacy file.
function checkout(t, { memory, legacy } = {}) {
  const root = fakeRoot(t, 'effective-flow-memory-unit-');
  const write = (target, value) =>
    writeFileSync(target, typeof value === 'string' ? value : `${JSON.stringify(value)}\n`);
  if (memory !== undefined) {
    mkdirSync(stateDir(root), { mode: 0o700 });
    write(memoryPath(root), memory);
  }
  if (legacy !== undefined) write(legacyPath(root), legacy);
  return root;
}

function deps(root, { git, ...extra } = {}) {
  return { runner: fakeGit(root, git).runner, env: {}, now: () => NOW, ...extra };
}

function reserve(root, count, extra = {}, input = {}) {
  return executeOperation(
    'memory reserve',
    { cwd: root, owner: OWNER, count, waitSeconds: 0, ...input },
    deps(root, extra),
  );
}

function setMarker(root, marker, version, extra = {}) {
  return executeOperation(
    'memory set-marker',
    { cwd: root, owner: OWNER, marker, waitSeconds: 0, ...(version ? { version } : {}) },
    deps(root, extra),
  );
}

function migrate(root, extra = {}) {
  return executeOperation(
    'memory migrate-directory',
    { cwd: root, owner: OWNER, waitSeconds: 0 },
    deps(root, extra),
  );
}

function readMemory(root) {
  return JSON.parse(readFileSync(memoryPath(root), 'utf8'));
}

function assertUnlocked(root) {
  assert.equal(existsSync(lockDir(root)), false, 'the memory lock must be released');
  assert.equal(existsSync(`${lockDir(root)}.guard`), false, 'the lock guard must be released');
}

// An `fs` override that runs `hook(target, count)` before the given call, counting calls per path.
function hookFs(name, hook) {
  const counts = new Map();
  const original = { lstat: lstatPath, open: openPath, link: linkPath }[name];
  return {
    [name]: async (target, ...rest) => {
      const count = (counts.get(target) ?? 0) + 1;
      counts.set(target, count);
      await hook(target, count);
      return original(target, ...rest);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Closed key sets

// Invariant: each memory operation takes exactly its own closed key set, validated before any git
// call, so no generic write can be smuggled in through an extra field.
test('memory operations reject unknown keys and out-of-range values before git', async () => {
  const runner = unreachableRunner();
  const base = { cwd: '/nonexistent', owner: OWNER };
  const cases = [
    ['memory reserve', { ...base, count: 1, field: 'lastFindingNumber' }],
    ['memory reserve', { ...base, count: 1, value: 3 }],
    ['memory reserve', { ...base }],
    ['memory reserve', { ...base, count: 0 }],
    ['memory reserve', { ...base, count: MAX_RESERVE_COUNT + 1 }],
    ['memory reserve', { ...base, count: 1.5 }],
    ['memory reserve', { ...base, count: '2' }],
    ['memory reserve', { ...base, count: 1, waitSeconds: 31 }],
    ['memory reserve', { cwd: '/nonexistent', count: 1 }],
    ['memory reserve', { ...base, owner: { workflow: 'review', runId: 'x' }, count: 1 }],
    ['memory set-marker', { ...base, marker: 'runtime-migration-directory' }],
    ['memory set-marker', { ...base, marker: 'config-migration-adr' }],
    ['memory set-marker', { ...base, marker: 'config-migration-adr', version: 'v2' }],
    ['memory set-marker', { ...base, marker: 'label-migration-sf', version: 'config-to-adr-v1' }],
    ['memory set-marker', { ...base, marker: 'label-migration-sf', value: true }],
    ['memory migrate-directory', { ...base, source: '.firmo' }],
    ['memory migrate-directory', { ...base, count: 1 }],
  ];
  for (const [operation, input] of cases) {
    expectError(await executeOperation(operation, input, { runner }), 'INVALID_INPUT');
  }
  assert.deepEqual([...MEMORY_MARKERS], ['config-migration-adr', 'label-migration-sf']);
  assert.deepEqual([...CONFIG_MIGRATION_ADR_VERSIONS], ['config-to-adr-v1']);
  assert.equal(MAX_RESERVE_COUNT, 10_000);
});

// Invariant: the memory operations share the `cwd` refusal of the lock operations.
test('memory operations refuse an aliased or metacharacter cwd', async (t) => {
  const root = checkout(t, { memory: MARKED });
  for (const cwd of ["/tmp/it's", '/tmp/$HOME', 'relative/path', `${root}/.`]) {
    const envelope = await executeOperation(
      'memory reserve',
      { cwd, owner: OWNER, count: 1 },
      { runner: unreachableRunner() },
    );
    expectError(envelope, 'INVALID_ROOT');
  }
});

// Invariant: the CLI rejects an extra token after a memory operation before it reads stdin, so the
// allowlisted `memory <operation> *` prefix cannot be widened.
test('CLI: a memory operation with an extra argv token is rejected without reading stdin', async () => {
  let out = '';
  let exitCode;
  const stdin = {
    [Symbol.asyncIterator]() {
      throw new Error('stdin must not be read');
    },
  };
  const envelope = await main(['memory', 'reserve', '{"count":1}'], {
    stdin,
    stdout: { write: (chunk) => (out += chunk) },
    stderr: { write: () => {} },
    setExitCode: (code) => (exitCode = code),
    runner: unreachableRunner(),
  });
  assert.equal(envelope.error.code, 'INVALID_INPUT');
  assert.match(
    envelope.error.message,
    /memory reserve\|memory set-marker\|memory migrate-directory/,
  );
  assert.equal(exitCode, 2);
  assert.equal(out.split('\n').filter(Boolean).length, 1);
});

// ---------------------------------------------------------------------------------------------
// memory reserve

// Invariant (today's reservation arithmetic): the range is `lastFindingNumber + 1` through
// `lastFindingNumber + count`, the upper bound is persisted, and the IDs are `R-<7 digits>`.
test('reserve: 41 plus two gives R-0000042 to R-0000043 and persists 43', async (t) => {
  const root = checkout(t, { memory: { ...MARKED, lastFindingNumber: 41 } });
  const result = expectOk(await reserve(root, 2));
  assert.deepEqual(result, {
    path: memoryPath(root),
    count: 2,
    first: 42,
    last: 43,
    firstId: 'R-0000042',
    lastId: 'R-0000043',
  });
  assert.equal(readMemory(root).lastFindingNumber, 43);
  assert.ok(readFileSync(memoryPath(root), 'utf8').endsWith('}\n'));
  assertUnlocked(root);
});

// Invariant: a missing counter starts at 0.
test('reserve: a missing counter starts at R-0000001', async (t) => {
  const root = checkout(t, { memory: MARKED });
  const result = expectOk(await reserve(root, 3));
  assert.equal(result.firstId, 'R-0000001');
  assert.equal(result.lastId, 'R-0000003');
  assert.equal(readMemory(root).lastFindingNumber, 3);
});

// Invariant: the last ID is R-9999999; a range past it reserves nothing and leaves the file as it
// was.
test('reserve: the boundary at R-9999999 is reachable and never passed', async (t) => {
  const root = checkout(t, { memory: { ...MARKED, lastFindingNumber: MAX_FINDING_NUMBER - 1 } });
  const before = readFileSync(memoryPath(root));
  expectError(await reserve(root, 2), 'INVALID_STATE');
  assert.deepEqual(readFileSync(memoryPath(root)), before);
  assertUnlocked(root);
  const result = expectOk(await reserve(root, 1));
  assert.equal(result.lastId, 'R-9999999');
  expectError(await reserve(root, 1), 'INVALID_STATE');
  assert.equal(readMemory(root).lastFindingNumber, MAX_FINDING_NUMBER);
  assert.equal(formatFindingId(7), 'R-0000007');
});

// Invariant: an invalid counter or memory is never defaulted or repaired: INVALID_STATE, no write,
// and the lock is released.
test('reserve: an invalid counter or memory file is INVALID_STATE without a write', async (t) => {
  const cases = [
    { ...MARKED, lastFindingNumber: 1.5 },
    { ...MARKED, lastFindingNumber: -1 },
    { ...MARKED, lastFindingNumber: '3' },
    { ...MARKED, lastFindingNumber: 2 ** 53 },
    '[1,2]\n',
    '"text"\n',
    '{"lastFindingNumber": 4,\n',
    `{"pad":"${'x'.repeat(MAX_MEMORY_BYTES)}"}\n`,
  ];
  for (const memory of cases) {
    const root = checkout(t, { memory });
    const before = readFileSync(memoryPath(root));
    expectError(await reserve(root, 1), 'INVALID_STATE');
    assert.deepEqual(readFileSync(memoryPath(root)), before);
    assertUnlocked(root);
  }
});

// Invariant: a symlinked or non-regular memory.json is never followed.
test('reserve: a symlinked memory.json is UNSAFE_TARGET', async (t) => {
  const root = checkout(t, { memory: MARKED });
  const elsewhere = join(root, 'elsewhere.json');
  writeFileSync(elsewhere, `${JSON.stringify(MARKED)}\n`);
  unlinkSync(memoryPath(root));
  symlinkSync(elsewhere, memoryPath(root));
  expectError(await reserve(root, 1), 'UNSAFE_TARGET');
  assert.equal(JSON.parse(readFileSync(elsewhere, 'utf8')).lastFindingNumber, undefined);
  assertUnlocked(root);
});

// Invariant (migration defence): without the runtimeMigration.directory marker no reservation or
// marker is written, whether or not a legacy directory exists.
test('reserve and set-marker: MIGRATION_REQUIRED without the marker, with or without a legacy dir', async (t) => {
  for (const legacyDir of [null, '.firmo', '.sf-plugin']) {
    const root = checkout(t, { memory: { lastFindingNumber: 4 } });
    if (legacyDir) mkdirSync(join(root, legacyDir));
    const before = readFileSync(memoryPath(root));
    const outcome = expectOutcome(await reserve(root, 1), 'MIGRATION_REQUIRED');
    assert.equal(outcome.path, memoryPath(root));
    assert.equal(outcome.marker, 'runtimeMigration.directory');
    expectOutcome(await setMarker(root, 'label-migration-sf'), 'MIGRATION_REQUIRED');
    assert.deepEqual(readFileSync(memoryPath(root)), before);
    assertUnlocked(root);
  }
  const fresh = checkout(t);
  expectOutcome(await reserve(fresh, 1), 'MIGRATION_REQUIRED');
  assert.equal(existsSync(memoryPath(fresh)), false);
});

// Invariant: unknown fields keep their JSON meaning, `__proto__` included, and only the counter
// changes.
test('reserve: unknown fields are preserved with the same JSON meaning', async (t) => {
  const memory = `{"zeta":{"nested":[1,{"a":null}]},"runtimeMigration":{"directory":{"version":1,"by":"prose"}},"__proto__":{"polluted":true},"lastFindingNumber":9,"configMigration":{"review":{"version":"review-speed-profiles-v1"}}}`;
  const root = checkout(t, { memory });
  expectOk(await reserve(root, 1));
  const expected = JSON.parse(memory);
  expected.lastFindingNumber = 10;
  assert.deepEqual(readMemory(root), expected);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.keys(readMemory(root)).join(','), Object.keys(expected).join(','));
});

// Invariant: a held lock is reported as LOCK_HELD with the observed owner after the bounded wait,
// and the holder's lock is left untouched.
test('reserve: LOCK_HELD after waitSeconds leaves the holder and memory untouched', async (t) => {
  const root = checkout(t, { memory: MARKED });
  const held = expectOk(
    await executeOperation(
      'lock acquire',
      { cwd: root, lock: 'memory', owner: { workflow: 'plan' }, waitSeconds: 0 },
      deps(root),
    ),
  );
  const clock = fakeClock();
  const outcome = expectOutcome(
    await reserve(
      root,
      1,
      { sleep: clock.sleep, monotonicNow: clock.monotonicNow },
      { waitSeconds: 1 },
    ),
    'LOCK_HELD',
  );
  assert.equal(outcome.lock, 'memory');
  assert.equal(outcome.waitSeconds, 1);
  assert.ok(outcome.attempts > 1);
  assert.equal(outcome.owner.fields.token, held.owner.token);
  assert.equal(outcome.owner.fields.workflow, 'plan');
  assert.equal(readMemory(root).lastFindingNumber, undefined);
  assert.ok(existsSync(join(lockDir(root), 'owner.json')));
});

// Invariant: the transaction checks its owner token right before the rename; a lock broken and
// re-acquired by another session in between gets NOT_OWNER, no write and no reservation, and the
// other session's lock is never released.
test('reserve: a lock broken and re-acquired before the rename is NOT_OWNER with no write', async (t) => {
  const root = checkout(t, { memory: { ...MARKED, lastFindingNumber: 5 } });
  const before = readFileSync(memoryPath(root));
  const foreign = {
    token: 'f'.repeat(32),
    acquiredAt: '2026-10-30T12:00:00.000Z',
    host: 'other-host',
    pid: null,
    workflow: 'plan',
  };
  const onPhase = (name) => {
    if (name !== 'beforeRename') return;
    rmSync(lockDir(root), { recursive: true });
    mkdirSync(lockDir(root));
    writeFileSync(join(lockDir(root), 'owner.json'), `${JSON.stringify(foreign)}\n`);
  };
  const outcome = expectOutcome(await reserve(root, 2, { onPhase }), 'NOT_OWNER');
  assert.equal(outcome.reason, 'token-mismatch');
  assert.equal(outcome.owner.fields.token, foreign.token);
  // The foreign lock is not released either, and the outcome says so.
  assert.deepEqual(outcome.lockRelease, {
    released: false,
    code: 'NOT_OWNER',
    reason: 'token-mismatch',
  });
  assert.deepEqual(readFileSync(memoryPath(root)), before);
  assert.deepEqual(JSON.parse(readFileSync(join(lockDir(root), 'owner.json'), 'utf8')), foreign);
  assert.deepEqual(
    readdirSync(stateDir(root)).filter((name) => name.endsWith('.tmp')),
    [],
    'the temporary memory file is removed',
  );
});

// Invariant: a lock release that fails after the transaction is reported on every path: as
// `lockRelease` on a result and on an outcome (above), and appended to an error's message.
test('reserve: a failed lock release is reported on the result and on an error', async (t) => {
  const stray = (root) => writeFileSync(join(lockDir(root), 'stray'), '');

  const committed = checkout(t, { legacy: { ...MARKED, lastFindingNumber: 1 } });
  const onCommitted = (name) => name === 'afterRename' && stray(committed);
  const result = expectOk(await reserve(committed, 1, { onPhase: onCommitted }));
  assert.equal(result.firstId, 'R-0000002');
  assert.deepEqual(result.lockRelease, {
    released: false,
    code: 'NOT_OWNER',
    reason: 'unexpected-entries',
  });

  const failed = checkout(t, { legacy: { ...MARKED, lastFindingNumber: 1 } });
  const onFailed = (name) => {
    if (name !== 'beforeRename') return;
    stray(failed);
    writeFileSync(legacyPath(failed), `${JSON.stringify({ ...MARKED, lastFindingNumber: 9 })}\n`);
  };
  const error = expectError(await reserve(failed, 1, { onPhase: onFailed }), 'LEGACY_CHANGED');
  assert.match(error.message, /changed while it was adopted/);
  assert.match(error.message, /lock release failed: NOT_OWNER \(unexpected-entries\)/);
});

// Invariant: the lock is released on every error path of the transaction: a validation failure
// before the write, a guard refusal of the temporary file, and a failed rename.
test('the memory lock is released after every error', async (t) => {
  const tmpNotIgnored = {
    'check-ignore': (args) =>
      args.at(-1).endsWith('.tmp') ? { status: 1, stdout: '', stderr: '' } : undefined,
  };
  const invalid = checkout(t, { memory: { ...MARKED, lastFindingNumber: MAX_FINDING_NUMBER } });
  expectError(await reserve(invalid, 1), 'INVALID_STATE');
  assertUnlocked(invalid);

  const unsafe = checkout(t, { memory: { ...MARKED, lastFindingNumber: 1 } });
  expectError(await reserve(unsafe, 1, { git: tmpNotIgnored }), 'RUNTIME_STATE_UNSAFE');
  assert.equal(readMemory(unsafe).lastFindingNumber, 1);
  assertUnlocked(unsafe);

  const blocked = checkout(t, { memory: { ...MARKED, lastFindingNumber: 1 } });
  unlinkSync(memoryPath(blocked));
  mkdirSync(memoryPath(blocked));
  expectError(await reserve(blocked, 1), 'UNSAFE_TARGET');
  assertUnlocked(blocked);
});

// ---------------------------------------------------------------------------------------------
// Legacy adoption of `.sf-memory.json`

// Invariant: with canonical memory absent, the whole legacy object plus the mutation becomes
// canonical memory in one write, and the legacy file is removed only afterwards.
test('legacy adoption: the whole legacy object plus the reservation becomes canonical', async (t) => {
  const legacy = { ...MARKED, lastFindingNumber: 41, labelMigration: { sf: { done: true } } };
  const root = checkout(t, { legacy });
  const result = expectOk(await reserve(root, 2));
  assert.equal(result.firstId, 'R-0000042');
  assert.equal(result.legacyAdopted, true);
  assert.equal(result.legacyConflict, undefined);
  assert.deepEqual(readMemory(root), { ...legacy, lastFindingNumber: 43 });
  assert.equal(existsSync(legacyPath(root)), false);
  assertUnlocked(root);
});

// Invariant: a legacy change before the rename is LEGACY_CHANGED: nothing canonical is written,
// nothing is reserved, and the changed legacy file stays.
test('legacy adoption: a change before the rename is LEGACY_CHANGED with no write', async (t) => {
  const root = checkout(t, { legacy: { ...MARKED, lastFindingNumber: 41 } });
  const changed = `${JSON.stringify({ ...MARKED, lastFindingNumber: 50 })}\n`;
  const onPhase = (name) => {
    if (name === 'beforeRename') writeFileSync(legacyPath(root), changed);
  };
  expectError(await reserve(root, 2, { onPhase }), 'LEGACY_CHANGED');
  assert.equal(existsSync(memoryPath(root)), false);
  assert.equal(readFileSync(legacyPath(root), 'utf8'), changed);
  assertUnlocked(root);
});

// Invariant: a legacy change after the rename keeps the committed canonical write, keeps the legacy
// file, and reports `legacyConflict`.
test('legacy adoption: a change after the rename keeps the legacy file as legacyConflict', async (t) => {
  const root = checkout(t, { legacy: { ...MARKED, lastFindingNumber: 41 } });
  const changed = `${JSON.stringify({ ...MARKED, lastFindingNumber: 50 })}\n`;
  const onPhase = (name) => {
    if (name === 'afterRename') writeFileSync(legacyPath(root), changed);
  };
  const result = expectOk(await reserve(root, 2, { onPhase }));
  assert.deepEqual(result.legacyConflict, { path: legacyPath(root) });
  assert.equal(readMemory(root).lastFindingNumber, 43);
  assert.equal(readFileSync(legacyPath(root), 'utf8'), changed);
});

// Invariant: a failed legacy removal is reported as `legacyRemoval` and never rolls back the
// canonical write; the removal passes the legacy-memory guard (here: refused because tracked).
test('legacy adoption: a failed removal is legacyRemoval without a rollback', async (t) => {
  const root = checkout(t, { legacy: { ...MARKED, lastFindingNumber: 1 } });
  const git = {
    'ls-files': (args) =>
      args.at(-1) === '.sf-memory.json'
        ? { status: 0, stdout: '.sf-memory.json\0', stderr: '' }
        : undefined,
  };
  const result = expectOk(await reserve(root, 1, { git }));
  assert.equal(result.legacyRemoval.path, legacyPath(root));
  assert.match(result.legacyRemoval.error, /tracked/);
  assert.equal(readMemory(root).lastFindingNumber, 2);
  assert.ok(existsSync(legacyPath(root)));
});

// Invariant: canonical memory that appears inside the lock wins and the legacy file stays
// untouched.
test('legacy adoption: canonical memory appearing inside the lock wins', async (t) => {
  const legacyContent = `${JSON.stringify({ ...MARKED, lastFindingNumber: 41 })}\n`;
  const root = checkout(t, { legacy: legacyContent });
  mkdirSync(stateDir(root), { mode: 0o700 });
  const fs = hookFs('lstat', async (target) => {
    if (target === memoryPath(root) && !existsSync(target)) {
      writeFileSync(target, `${JSON.stringify({ ...MARKED, lastFindingNumber: 7 })}\n`);
    }
  });
  const result = expectOk(await reserve(root, 1, { fs }));
  assert.equal(result.firstId, 'R-0000008');
  assert.equal(result.legacyAdopted, undefined);
  assert.equal(readFileSync(legacyPath(root), 'utf8'), legacyContent);
});

// Invariant: an invalid or unreadable legacy memory is LEGACY_MEMORY_INVALID in every operation and
// is never replaced by an empty object.
test('legacy adoption: an invalid legacy file is LEGACY_MEMORY_INVALID in every operation', async (t) => {
  const invalid = ['{"lastFindingNumber":', '[]', '{"lastFindingNumber":-2}'];
  for (const legacy of invalid) {
    for (const call of [
      (root) => reserve(root, 1),
      (root) => setMarker(root, 'label-migration-sf'),
      (root) => migrate(root),
    ]) {
      const root = checkout(t, { legacy });
      const outcome = expectOutcome(await call(root), 'LEGACY_MEMORY_INVALID');
      assert.equal(outcome.path, legacyPath(root));
      assert.equal(readFileSync(legacyPath(root), 'utf8'), legacy);
      assert.equal(existsSync(memoryPath(root)), false);
      assertUnlocked(root);
    }
  }
  const linked = checkout(t);
  writeFileSync(join(linked, 'target.json'), '{}');
  symlinkSync(join(linked, 'target.json'), legacyPath(linked));
  const outcome = expectOutcome(await migrate(linked), 'LEGACY_MEMORY_INVALID');
  assert.equal(outcome.reason, 'not-regular');
});

// ---------------------------------------------------------------------------------------------
// memory set-marker

// Invariant (marker shapes): `configMigration.adr = {version, appliedAt}` and
// `labelMigration.sf = {done: true, completedAt}`, timestamps UTC without milliseconds, siblings
// kept.
test('set-marker writes the fixed marker shapes and keeps siblings', async (t) => {
  const root = checkout(t, {
    memory: { ...MARKED, configMigration: { review: { version: 'review-speed-profiles-v1' } } },
  });
  const adr = expectOk(await setMarker(root, 'config-migration-adr', 'config-to-adr-v1'));
  assert.equal(adr.changed, true);
  assert.deepEqual(adr.value, { version: 'config-to-adr-v1', appliedAt: '2026-10-30T12:34:56Z' });
  const label = expectOk(await setMarker(root, 'label-migration-sf'));
  assert.deepEqual(label.value, { done: true, completedAt: '2026-10-30T12:34:56Z' });
  assert.match(label.value.completedAt, TIMESTAMP);
  assert.deepEqual(readMemory(root), {
    ...MARKED,
    configMigration: {
      review: { version: 'review-speed-profiles-v1' },
      adr: { version: 'config-to-adr-v1', appliedAt: '2026-10-30T12:34:56Z' },
    },
    labelMigration: { sf: { done: true, completedAt: '2026-10-30T12:34:56Z' } },
  });
});

// Invariant (presence test): a prose-written marker with extra fields counts as present and is not
// rewritten; a different version or `done` other than true is set while extra fields stay.
test('set-marker: prose-written markers with extra fields are present and never rewritten', async (t) => {
  const prose = {
    ...MARKED,
    configMigration: {
      adr: { version: 'config-to-adr-v1', appliedAt: '2026-01-01T00:00:00Z', addedKeys: ['a'] },
    },
    labelMigration: { sf: { done: true, completedAt: '2026-01-01T00:00:00Z', moved: 3 } },
  };
  const root = checkout(t, { memory: prose });
  const before = readFileSync(memoryPath(root));
  const adr = expectOk(await setMarker(root, 'config-migration-adr', 'config-to-adr-v1'));
  assert.equal(adr.changed, false);
  assert.deepEqual(adr.value, prose.configMigration.adr);
  assert.equal(expectOk(await setMarker(root, 'label-migration-sf')).changed, false);
  assert.deepEqual(readFileSync(memoryPath(root)), before);

  const other = checkout(t, {
    memory: {
      ...MARKED,
      configMigration: { adr: { version: 'config-to-adr-v0', note: 'kept' } },
      labelMigration: { sf: { done: 'yes', note: 'kept' } },
    },
  });
  expectOk(await setMarker(other, 'config-migration-adr', 'config-to-adr-v1'));
  expectOk(await setMarker(other, 'label-migration-sf'));
  const memory = readMemory(other);
  assert.deepEqual(memory.configMigration.adr, {
    version: 'config-to-adr-v1',
    note: 'kept',
    appliedAt: '2026-10-30T12:34:56Z',
  });
  assert.deepEqual(memory.labelMigration.sf, {
    done: true,
    note: 'kept',
    completedAt: '2026-10-30T12:34:56Z',
  });
});

// Invariant: a marker parent that is not an object is never overwritten.
test('set-marker: a non-object marker parent is INVALID_STATE', async (t) => {
  for (const memory of [
    { ...MARKED, configMigration: 'done' },
    { ...MARKED, configMigration: { adr: [] } },
  ]) {
    const root = checkout(t, { memory });
    const before = readFileSync(memoryPath(root));
    expectError(await setMarker(root, 'config-migration-adr', 'config-to-adr-v1'), 'INVALID_STATE');
    assert.deepEqual(readFileSync(memoryPath(root)), before);
    assertUnlocked(root);
  }
});

// ---------------------------------------------------------------------------------------------
// memory migrate-directory

function legacyTree(root, name, files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, name, relative);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }
}

// Invariant: a repository without legacy state gets the marker alone, so later operations succeed.
test('migrate-directory writes the marker when no legacy source exists', async (t) => {
  const root = checkout(t);
  const result = expectOk(await migrate(root));
  assert.equal(result.source, null);
  assert.deepEqual(result.marker, { version: 1 });
  assert.deepEqual(readMemory(root), MARKED);
  assert.equal(expectOk(await reserve(root, 1)).firstId, 'R-0000001');
  assertUnlocked(root);
});

// Invariant: a repeat call is MIGRATION_NOT_NEEDED and changes nothing.
test('migrate-directory: a repeat call is MIGRATION_NOT_NEEDED', async (t) => {
  const root = checkout(t);
  expectOk(await migrate(root));
  const before = readFileSync(memoryPath(root));
  const outcome = expectOutcome(await migrate(root), 'MIGRATION_NOT_NEEDED');
  assert.deepEqual(outcome.marker, { version: 1 });
  assert.deepEqual(readFileSync(memoryPath(root)), before);
  assertUnlocked(root);
});

// Invariant: `.firmo/` wins over `.sf-plugin/`, never both; `.worktrees/` is excluded; both legacy
// directories are preserved.
test('migrate-directory: .firmo over .sf-plugin, .worktrees excluded, legacy kept', async (t) => {
  const root = checkout(t);
  legacyTree(root, '.firmo', {
    'cache.json': '{"a":1}\n',
    'review/2026/report.md': 'report\n',
    '.worktrees/wt/file.txt': 'worktree\n',
    'nested/.worktrees/kept.txt': 'nested\n',
  });
  legacyTree(root, '.sf-plugin', { 'old.txt': 'old\n' });
  const result = expectOk(await migrate(root));
  assert.equal(result.source, '.firmo');
  assert.deepEqual(result.copied.sort(), [
    '.firmo/cache.json',
    '.firmo/nested/.worktrees/kept.txt',
    '.firmo/review/2026/report.md',
  ]);
  assert.equal(result.copiedCount, 3);
  assert.equal(readFileSync(join(stateDir(root), 'review/2026/report.md'), 'utf8'), 'report\n');
  assert.equal(existsSync(join(stateDir(root), '.worktrees')), false);
  assert.equal(existsSync(join(stateDir(root), 'old.txt')), false);
  assert.ok(existsSync(join(root, '.firmo', 'cache.json')));
  assert.ok(existsSync(join(root, '.sf-plugin', 'old.txt')));
  assert.equal(readMemory(root).runtimeMigration.directory.version, 1);
});

// Invariant (no-clobber): an existing target always wins, whatever its type.
test('migrate-directory: an existing target is kept', async (t) => {
  const root = checkout(t, { memory: {} });
  legacyTree(root, '.sf-plugin', { 'cache.json': 'legacy\n', 'review/a.md': 'legacy\n' });
  writeFileSync(join(stateDir(root), 'cache.json'), 'current\n');
  writeFileSync(join(stateDir(root), 'review'), 'a file where the legacy tree has a directory\n');
  const result = expectOk(await migrate(root));
  assert.equal(result.source, '.sf-plugin');
  assert.deepEqual(result.kept.sort(), ['.sf-plugin/cache.json', '.sf-plugin/review']);
  assert.equal(readFileSync(join(stateDir(root), 'cache.json'), 'utf8'), 'current\n');
  assert.equal(result.copiedCount, 0);
});

// Invariant: non-regular legacy entries are never followed or copied; they are reported in
// `skipped` with their path and the migration completes.
test('migrate-directory: a symlink and a FIFO are skipped and reported', async (t) => {
  const root = checkout(t);
  legacyTree(root, '.firmo', { 'file.txt': 'file\n' });
  writeFileSync(join(root, 'secret.txt'), 'secret\n');
  symlinkSync(join(root, 'secret.txt'), join(root, '.firmo', 'link.txt'));
  const fifo = spawnSync('mkfifo', [join(root, '.firmo', 'pipe')]);
  assert.equal(fifo.status, 0, String(fifo.stderr));
  const result = expectOk(await migrate(root));
  assert.deepEqual(result.skipped, [
    { path: '.firmo/link.txt', type: 'symlink' },
    { path: '.firmo/pipe', type: 'fifo' },
  ]);
  assert.equal(result.skippedCount, 2);
  assert.equal(existsSync(join(stateDir(root), 'link.txt')), false);
  assert.equal(existsSync(join(stateDir(root), 'pipe')), false);
  assert.equal(readMemory(root).runtimeMigration.directory.version, 1);
});

// Invariant: a legacy source that is itself a symlink is never followed.
test('migrate-directory: a symlinked legacy source is skipped', async (t) => {
  const root = checkout(t);
  legacyTree(root, 'elsewhere', { 'cache.json': '{}\n', 'memory.json': '{"lastFindingNumber":9}' });
  symlinkSync(join(root, 'elsewhere'), join(root, '.firmo'));
  const result = expectOk(await migrate(root));
  assert.deepEqual(result.skipped, [{ path: '.firmo', type: 'symlink' }]);
  assert.equal(existsSync(join(stateDir(root), 'cache.json')), false);
  assert.deepEqual(readMemory(root), MARKED);
});

// Invariant (base wins, marker last): the legacy memory is merged recursively adding absent keys
// only, the base (canonical or `.sf-memory.json`) wins every conflict, and the marker lands in the
// same write.
test('migrate-directory: memory merge adds absent keys only and the base wins', async (t) => {
  const root = checkout(t, {
    memory: { lastFindingNumber: 5, a: { x: 1 }, list: [1], kind: 'object' },
  });
  legacyTree(root, '.firmo', {
    'memory.json': JSON.stringify({
      lastFindingNumber: 41,
      a: { x: 2, y: 3 },
      list: [9, 9],
      kind: { nested: true },
      labelMigration: { sf: { done: true } },
    }),
  });
  expectOk(await migrate(root));
  assert.deepEqual(readMemory(root), {
    lastFindingNumber: 5,
    a: { x: 1, y: 3 },
    list: [1],
    kind: 'object',
    labelMigration: { sf: { done: true } },
    runtimeMigration: { directory: { version: 1 } },
  });
});

// Invariant (legacy example): root legacy 41 plus the migration keeps 41 and adds the marker in one
// object; a following two-finding reservation gives R-0000042 to R-0000043 and persists 43.
test('migrate-directory adopts .sf-memory.json so the legacy counter survives', async (t) => {
  const root = checkout(t, { legacy: { lastFindingNumber: 41 } });
  const result = expectOk(await migrate(root));
  assert.equal(result.legacyAdopted, true);
  assert.deepEqual(readMemory(root), { lastFindingNumber: 41, ...MARKED });
  assert.equal(existsSync(legacyPath(root)), false);
  const reserved = expectOk(await reserve(root, 2));
  assert.deepEqual([reserved.firstId, reserved.lastId], ['R-0000042', 'R-0000043']);
  assert.equal(readMemory(root).lastFindingNumber, 43);
});

// Invariant: an invalid legacy directory memory leaves no marker and copies nothing.
test('migrate-directory: an invalid legacy memory.json leaves no marker', async (t) => {
  const root = checkout(t);
  legacyTree(root, '.firmo', { 'memory.json': '{"lastFindingNumber": "x"}', 'cache.json': '{}' });
  const outcome = expectOutcome(await migrate(root), 'LEGACY_MEMORY_INVALID');
  assert.equal(outcome.path, join(root, '.firmo', 'memory.json'));
  assert.equal(outcome.reason, 'invalid-counter');
  assert.equal(existsSync(memoryPath(root)), false);
  assert.equal(existsSync(join(stateDir(root), 'cache.json')), false);
  assertUnlocked(root);
});

// Invariant: invalid canonical memory or an invalid root `.sf-memory.json` stops the migration in
// its read-only pre-check, before any legacy file is copied or the lock is taken.
test('migrate-directory validates canonical and root legacy memory before any copy', async (t) => {
  const invalidCanonical = checkout(t, { memory: '{"lastFindingNumber": -1}' });
  legacyTree(invalidCanonical, '.firmo', { 'a.txt': 'a\n' });
  expectError(await migrate(invalidCanonical), 'INVALID_STATE');
  assert.equal(existsSync(join(stateDir(invalidCanonical), 'a.txt')), false);
  assertUnlocked(invalidCanonical);

  const invalidLegacy = checkout(t, { legacy: '[]' });
  legacyTree(invalidLegacy, '.firmo', { 'a.txt': 'a\n' });
  const outcome = expectOutcome(await migrate(invalidLegacy), 'LEGACY_MEMORY_INVALID');
  assert.equal(outcome.path, legacyPath(invalidLegacy));
  assert.equal(existsSync(join(stateDir(invalidLegacy), 'a.txt')), false);
  assertUnlocked(invalidLegacy);
});

// Invariant: the copy guard runs once for the whole tree: one `ls-files` and one batched
// `check-ignore --stdin` for every file target and its temporary sibling, not three git calls per
// file.
test('migrate-directory guards the copied files with one batched git round', async (t) => {
  const root = checkout(t);
  legacyTree(root, '.firmo', { 'a.txt': 'a\n', 'b.txt': 'b\n', 'sub/c.txt': 'c\n' });
  const { runner, calls } = fakeGit(root);
  expectOk(await migrate(root, { runner }));
  const batched = calls.filter((call) => call.args.includes('--stdin'));
  assert.equal(batched.length, 1);
  const probes = batched[0].stdin.split('\0').filter(Boolean);
  assert.equal(probes[0], '.effective-flow/config.json');
  for (const name of ['a.txt', 'b.txt', 'sub/c.txt']) {
    assert.ok(probes.includes(`.effective-flow/${name}`), name);
    assert.ok(
      probes.some((probe) => probe.startsWith(`.effective-flow/${name.replace(/[^/]+$/, '')}.`)),
      `${name} temporary`,
    );
  }
  assert.equal(probes.length, 1 + 2 * 3);
});

// Invariant: a failed copy is MIGRATION_INCOMPLETE without a marker, the files already copied stay,
// no partial target is left, and a later call completes the remaining files.
test('migrate-directory: an injected copy failure is MIGRATION_INCOMPLETE and retries', async (t) => {
  const root = checkout(t);
  legacyTree(root, '.firmo', { 'a.txt': 'a\n', 'b.txt': 'b\n', 'c.txt': 'c\n' });
  const failing = {
    link: async (from, to) => {
      if (to.endsWith('b.txt')) throw Object.assign(new Error('injected EIO'), { code: 'EIO' });
      return linkPath(from, to);
    },
  };
  const outcome = expectOutcome(await migrate(root, { fs: failing }), 'MIGRATION_INCOMPLETE');
  assert.equal(outcome.reason, 'copy-failed');
  assert.equal(outcome.failed.path, '.firmo/b.txt');
  assert.equal(outcome.failed.code, 'EIO');
  assert.deepEqual(outcome.copied, ['.firmo/a.txt']);
  assert.equal(existsSync(memoryPath(root)), false);
  assert.deepEqual(readdirSync(stateDir(root)).sort(), ['a.txt']);
  assertUnlocked(root);

  const result = expectOk(await migrate(root));
  assert.deepEqual(result.copied.sort(), ['.firmo/b.txt', '.firmo/c.txt']);
  assert.deepEqual(result.kept, ['.firmo/a.txt']);
  assert.equal(readMemory(root).runtimeMigration.directory.version, 1);
});

// Invariant: the commit step re-verifies the recorded targets; one missing at that point is
// MIGRATION_INCOMPLETE without a marker.
test('migrate-directory: a target missing at re-verification is MIGRATION_INCOMPLETE', async (t) => {
  const root = checkout(t);
  legacyTree(root, '.firmo', { 'a.txt': 'a\n' });
  const fs = {
    mkdir: async (target, options) => {
      if (target === `${lockDir(root)}.guard` && existsSync(join(stateDir(root), 'a.txt'))) {
        unlinkSync(join(stateDir(root), 'a.txt'));
      }
      return mkdirPath(target, options);
    },
  };
  const outcome = expectOutcome(await migrate(root, { fs }), 'MIGRATION_INCOMPLETE');
  assert.equal(outcome.reason, 'target-missing');
  assert.deepEqual(outcome.missing, ['.effective-flow/a.txt']);
  assert.equal(existsSync(memoryPath(root)), false);
  assertUnlocked(root);
});

// Invariant: the copy runs outside the memory lock, so a concurrent memory call during it is never
// LOCK_HELD.
test('migrate-directory: a concurrent memory call during the copy completes within its wait', async (t) => {
  const root = checkout(t);
  legacyTree(root, '.firmo', { 'a.txt': 'a\n' });
  let concurrent;
  const fs = {
    link: async (from, to) => {
      concurrent ??= await reserve(root, 1);
      return linkPath(from, to);
    },
  };
  expectOk(await migrate(root, { fs }));
  expectOutcome(concurrent, 'MIGRATION_REQUIRED');
  assert.equal(expectOk(await reserve(root, 1)).firstId, 'R-0000001');
});
