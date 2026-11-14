// Unit tests of the runtime-state helper's `presence` operations: the merge-gate run-presence
// markers below `.effective-flow/merge-gate-presence/`, their ownership by token, the strict
// schema, the 24-hour `possiblyStale` flag, and the cleanup-only `prune` under the wisdom-file
// proof.

import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { OPERATION_KEYS, executeOperation } from '../src/scripts/effective-flow-state-core.mjs';
import {
  MARKER_KEYS,
  MAX_MARKER_BYTES,
  STALE_AFTER_MS,
} from '../src/scripts/effective-flow-state-presence-core.mjs';
import { main } from '../src/scripts/effective-flow-state.mjs';
import {
  expectError,
  expectOk,
  expectOutcome,
  fakeGit,
  fakeRoot,
  unreachableRunner,
} from './support/state-helper-fixtures.mjs';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const HEAD = 'a'.repeat(40);
const HEAD_SHA256 = 'b'.repeat(64);
const OWN = '20261114100000';
const OTHER = '20261114090000';

function presenceDir(root) {
  return join(root, '.effective-flow', 'merge-gate-presence');
}

function markerPath(root, sessionId) {
  return join(presenceDir(root), `${sessionId}.json`);
}

function wisdomPath(root, sessionId) {
  return join(root, '.effective-flow', `.wisdom-accumulation-${sessionId}.tmp.md`);
}

function deps(root, { now = NOW, git, ...extra } = {}) {
  return { runner: fakeGit(root, git).runner, env: {}, now: () => now, ...extra };
}

function call(operation, root, input, extra) {
  return executeOperation(`presence ${operation}`, { cwd: root, ...input }, deps(root, extra));
}

async function register(root, sessionId, extra, input = {}) {
  return expectOk(
    await call(
      'register',
      root,
      { sessionId, prNumber: 42, head: HEAD, base: 'main', ...input },
      extra,
    ),
  );
}

function readMarker(root, sessionId) {
  return JSON.parse(readFileSync(markerPath(root, sessionId), 'utf8'));
}

function writeWisdom(root, sessionId) {
  mkdirSync(join(root, '.effective-flow'), { recursive: true });
  writeFileSync(wisdomPath(root, sessionId), '# wisdom\n');
}

// ---------------------------------------------------------------------------------------------
// Closed input

// Invariant: the presence operations take exactly their closed key sets; `prune` takes an explicit
// list of session IDs, never a filter or an age.
test('the presence operations have closed key sets', () => {
  assert.deepEqual(
    Object.fromEntries(
      ['register', 'refresh', 'list', 'release', 'prune'].map((name) => [
        name,
        [...OPERATION_KEYS[`presence ${name}`]],
      ]),
    ),
    {
      register: ['cwd', 'sessionId', 'prNumber', 'head', 'base'],
      refresh: ['cwd', 'sessionId', 'token', 'head'],
      list: ['cwd', 'sessionId'],
      release: ['cwd', 'sessionId', 'token'],
      prune: ['cwd', 'sessionIds'],
    },
  );
});

// Invariant: an untrusted PR number, object name, base or session ID is refused before any git
// call, so a malformed value never reaches the filesystem or a later Git command.
test('register rejects malformed fields before any git call', async (t) => {
  const root = fakeRoot(t);
  const valid = { cwd: root, sessionId: OWN, prNumber: 42, head: HEAD, base: 'main' };
  const cases = [
    { sessionId: '../escape' },
    { sessionId: '.hidden' },
    { sessionId: 'a/b' },
    { prNumber: 0 },
    { prNumber: -1 },
    { prNumber: 1.5 },
    { prNumber: '42' },
    { head: 'abc123' },
    { head: 'A'.repeat(40) },
    { head: `${HEAD}0` },
    { base: '-main' },
    { base: 'main..x' },
    { base: 'HEAD' },
    { base: 'feature/x.lock' },
    { base: `x${'y'.repeat(255)}` },
    { extra: true },
  ];
  for (const override of cases) {
    const envelope = await executeOperation(
      'presence register',
      { ...valid, ...override },
      { runner: unreachableRunner(), env: {} },
    );
    expectError(envelope, 'INVALID_INPUT');
  }
  assert.equal(existsSync(join(root, '.effective-flow')), false);
});

// ---------------------------------------------------------------------------------------------
// Register, refresh, release

// Invariant: `register` writes exactly the schema fields no-clobber and returns the token once; a
// second register of the same session never overwrites the marker.
test('register writes one strict marker no-clobber and returns its token', async (t) => {
  const root = fakeRoot(t);
  const result = await register(root, OWN, { randomToken: () => 'c'.repeat(32) });
  assert.deepEqual(result, {
    sessionId: OWN,
    token: 'c'.repeat(32),
    startedAt: '2026-11-14T10:00:00.000Z',
    lastActiveAt: '2026-11-14T10:00:00.000Z',
  });
  const marker = readMarker(root, OWN);
  assert.deepEqual(Object.keys(marker), [...MARKER_KEYS]);
  assert.deepEqual(marker, {
    schemaVersion: 1,
    sessionId: OWN,
    token: 'c'.repeat(32),
    prNumber: 42,
    head: HEAD,
    base: 'main',
    startedAt: '2026-11-14T10:00:00.000Z',
    lastActiveAt: '2026-11-14T10:00:00.000Z',
  });
  assert.ok(readFileSync(markerPath(root, OWN)).length <= MAX_MARKER_BYTES);
  const before = readFileSync(markerPath(root, OWN), 'utf8');
  const again = await call('register', root, {
    sessionId: OWN,
    prNumber: 7,
    head: HEAD_SHA256,
    base: 'develop',
  });
  assert.deepEqual(expectOutcome(again, 'MARKER_EXISTS'), {
    code: 'MARKER_EXISTS',
    sessionId: OWN,
  });
  assert.equal(readFileSync(markerPath(root, OWN), 'utf8'), before);
  assert.deepEqual(readdirSync(presenceDir(root)), [`${OWN}.json`]);
});

// Invariant: `refresh` updates only `lastActiveAt` and, when given, `head` of the caller's own
// marker; every other field stays, except `startedAt` when the clock stepped back behind it.
test('refresh updates lastActiveAt and head of the own marker only', async (t) => {
  const root = fakeRoot(t);
  const { token } = await register(root, OWN);
  const later = NOW + 60_000;
  const result = expectOk(
    await call('refresh', root, { sessionId: OWN, token, head: HEAD_SHA256 }, { now: later }),
  );
  assert.deepEqual(result, {
    sessionId: OWN,
    head: HEAD_SHA256,
    lastActiveAt: new Date(later).toISOString(),
  });
  const marker = readMarker(root, OWN);
  assert.equal(marker.head, HEAD_SHA256);
  assert.equal(marker.startedAt, new Date(NOW).toISOString());
  assert.equal(marker.lastActiveAt, new Date(later).toISOString());
  assert.equal(marker.token, token);
  assert.equal(marker.prNumber, 42);
  assert.deepEqual(readdirSync(presenceDir(root)), [`${OWN}.json`]);
  // A clock that stepped back between two refreshes, but not behind `startedAt`, moves
  // `lastActiveAt` back to it and leaves `startedAt` alone.
  const earlier = NOW + 30_000;
  const back = expectOk(await call('refresh', root, { sessionId: OWN, token }, { now: earlier }));
  assert.equal(back.lastActiveAt, new Date(earlier).toISOString());
  const stepped = readMarker(root, OWN);
  assert.equal(stepped.lastActiveAt, new Date(earlier).toISOString());
  assert.equal(stepped.startedAt, new Date(NOW).toISOString());
  assert.equal(stepped.head, HEAD_SHA256);
});

// Invariant: a run never refreshes or releases a marker it does not own: without the marker's
// token the call is NOT_OWNER and the other run's marker stays byte-identical.
test('another session cannot refresh or release a marker it does not own', async (t) => {
  const root = fakeRoot(t);
  await register(root, OTHER, { randomToken: () => 'd'.repeat(32) });
  const own = await register(root, OWN, { randomToken: () => 'e'.repeat(32) });
  const before = readFileSync(markerPath(root, OTHER), 'utf8');
  for (const operation of ['refresh', 'release']) {
    const outcome = expectOutcome(
      await call(operation, root, { sessionId: OTHER, token: own.token }),
      'NOT_OWNER',
    );
    assert.equal(outcome.reason, 'token-mismatch');
  }
  assert.equal(readFileSync(markerPath(root, OTHER), 'utf8'), before);
  // The caller's own session ID only ever names its own file.
  expectOk(await call('release', root, { sessionId: OWN, token: own.token }));
  assert.equal(readFileSync(markerPath(root, OTHER), 'utf8'), before);
});

test('release removes the own marker and is idempotent once it is gone', async (t) => {
  const root = fakeRoot(t);
  const { token } = await register(root, OWN);
  assert.deepEqual(expectOk(await call('release', root, { sessionId: OWN, token })), {
    sessionId: OWN,
    released: true,
  });
  assert.equal(existsSync(markerPath(root, OWN)), false);
  assert.deepEqual(expectOk(await call('release', root, { sessionId: OWN, token })), {
    sessionId: OWN,
    released: false,
    reason: 'missing',
  });
  expectOutcome(await call('refresh', root, { sessionId: OWN, token }), 'MARKER_NOT_FOUND');
});

// Invariant: a malformed marker is reported, never rewritten: refresh and release refuse it with
// MARKER_INVALID and leave its bytes unchanged.
test('refresh and release refuse a malformed own marker and never rewrite it', async (t) => {
  const root = fakeRoot(t);
  const { token } = await register(root, OWN);
  const valid = readMarker(root, OWN);
  const cases = [
    ['invalid-json', '{not json'],
    ['keys', { ...valid, extra: 1 }],
    ['schema-version', { ...valid, schemaVersion: 2 }],
    ['session-id', { ...valid, sessionId: OTHER }],
    ['pr-number', { ...valid, prNumber: 0 }],
    ['head', { ...valid, head: 'abc' }],
    ['base', { ...valid, base: '--upload-pack=x' }],
    ['started-at', { ...valid, startedAt: '2026-02-31T00:00:00.000Z' }],
    ['timestamp-order', { ...valid, startedAt: '2026-11-14T11:00:00.000Z' }],
  ];
  for (const [reason, content] of cases) {
    const text = typeof content === 'string' ? content : `${JSON.stringify(content)}\n`;
    writeFileSync(markerPath(root, OWN), text);
    for (const operation of ['refresh', 'release']) {
      const outcome = expectOutcome(
        await call(operation, root, { sessionId: OWN, token }),
        'MARKER_INVALID',
      );
      assert.equal(outcome.reason, reason, `${operation}: ${reason}`);
      assert.equal(readFileSync(markerPath(root, OWN), 'utf8'), text);
    }
  }
});

// Invariant: the clock-skew check guards against other runs' markers only. A run whose clock
// stepped back still refreshes and releases its own token-proven marker, whose `lastActiveAt` lies
// ahead of the clock; another run's `list` reports that marker as `future-timestamp` until the
// refresh writes the helper's own clock time back – `startedAt` clamped with it, so the order
// holds – and the marker is valid for other runs again.
test('refresh and release accept the own marker with a future lastActiveAt', async (t) => {
  const root = fakeRoot(t);
  const ahead = NOW + 24 * 60 * 60 * 1000;
  const { token } = await register(root, OWN, { now: ahead });
  const listed = expectOk(await call('list', root, { sessionId: OTHER }));
  assert.deepEqual(
    listed.markers.map(({ sessionId, state, reason }) => ({ sessionId, state, reason })),
    [{ sessionId: OWN, state: 'invalid', reason: 'future-timestamp' }],
  );
  const refreshed = expectOk(
    await call('refresh', root, { sessionId: OWN, token, head: HEAD_SHA256 }),
  );
  // `lastActiveAt` is the helper's clock even behind the stored time, and `startedAt` follows it.
  assert.equal(refreshed.lastActiveAt, new Date(NOW).toISOString());
  const stored = readMarker(root, OWN);
  assert.equal(stored.head, HEAD_SHA256);
  assert.equal(stored.lastActiveAt, new Date(NOW).toISOString());
  assert.equal(stored.startedAt, new Date(NOW).toISOString());
  const relisted = expectOk(await call('list', root, { sessionId: OTHER }));
  assert.deepEqual(
    relisted.markers.map(({ sessionId, state, lastActiveAt }) => ({
      sessionId,
      state,
      lastActiveAt,
    })),
    [{ sessionId: OWN, state: 'valid', lastActiveAt: new Date(NOW).toISOString() }],
  );
  assert.deepEqual(expectOk(await call('release', root, { sessionId: OWN, token })), {
    sessionId: OWN,
    released: true,
  });
  assert.equal(existsSync(markerPath(root, OWN)), false);
});

// Invariant: every write passes the runtime-state guard; an unignored `.effective-flow/` writes
// nothing.
test('register refuses an unignored runtime directory and writes nothing', async (t) => {
  const root = fakeRoot(t);
  mkdirSync(join(root, '.effective-flow'));
  const envelope = await call(
    'register',
    root,
    { sessionId: OWN, prNumber: 1, head: HEAD, base: 'main' },
    { git: { 'check-ignore': () => ({ status: 1, stdout: '', stderr: '' }) } },
  );
  expectError(envelope, 'RUNTIME_STATE_UNSAFE');
  assert.equal(existsSync(presenceDir(root)), false);
});

test('a symlinked presence directory is UNSAFE_TARGET for every operation', async (t) => {
  const root = fakeRoot(t);
  const elsewhere = fakeRoot(t);
  mkdirSync(join(root, '.effective-flow'));
  symlinkSync(elsewhere, presenceDir(root));
  const token = 'f'.repeat(32);
  for (const [operation, input] of [
    ['register', { sessionId: OWN, prNumber: 1, head: HEAD, base: 'main' }],
    ['refresh', { sessionId: OWN, token }],
    ['release', { sessionId: OWN, token }],
    ['list', {}],
    ['prune', { sessionIds: [OTHER] }],
  ]) {
    expectError(await call(operation, root, input), 'UNSAFE_TARGET');
  }
  assert.deepEqual(readdirSync(elsewhere), ['.git']);
});

// ---------------------------------------------------------------------------------------------
// List

// Invariant: `list` returns the other runs' markers validated, excludes the caller's own, never
// returns a token, flags a marker idle for more than 24 hours as `possiblyStale` (never active),
// reports a malformed one as invalid, and an unexpected name only by its digest.
test('list reports other markers, excludes the own one and flags possibly stale ones', async (t) => {
  const root = fakeRoot(t);
  await register(root, OWN);
  await register(root, OTHER, {}, { prNumber: 7, base: 'release/1.x' });
  const old = '20261112000000';
  await register(root, old, { now: NOW - STALE_AFTER_MS - 1000 });
  writeFileSync(markerPath(root, 'broken'), '{"schemaVersion":1}\n');
  writeFileSync(join(presenceDir(root), 'not a marker'), 'x');
  writeWisdom(root, OTHER);

  const result = expectOk(await call('list', root, { sessionId: OWN }));
  assert.equal(result.directory, '.effective-flow/merge-gate-presence');
  assert.equal(result.staleAfterHours, 24);
  assert.equal(result.truncated, false);
  assert.deepEqual(
    result.markers.map((marker) => marker.sessionId),
    [old, OTHER, 'broken'],
  );
  const [stale, active, broken] = result.markers;
  assert.equal(active.state, 'valid');
  assert.equal(active.possiblyStale, false);
  assert.equal(active.prNumber, 7);
  assert.equal(active.base, 'release/1.x');
  assert.equal(active.wisdomFile, 'present');
  assert.equal(stale.possiblyStale, true);
  assert.equal(stale.ageSeconds, STALE_AFTER_MS / 1000 + 1);
  assert.equal(stale.wisdomFile, 'absent');
  assert.deepEqual(broken, {
    sessionId: 'broken',
    state: 'invalid',
    reason: 'keys',
    wisdomFile: 'absent',
  });
  assert.equal(result.unexpected.length, 1);
  assert.match(result.unexpected[0].fileNameSha256, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(result).includes('token'), false);
  assert.equal(JSON.stringify(result).includes('not a marker'), false);

  const all = expectOk(await call('list', root, {}));
  assert.ok(all.markers.some((marker) => marker.sessionId === OWN));
});

test('list of a missing presence directory is empty and creates nothing', async (t) => {
  const root = fakeRoot(t);
  const result = expectOk(await call('list', root, {}));
  assert.deepEqual(result.markers, []);
  assert.deepEqual(result.unexpected, []);
  assert.equal(existsSync(join(root, '.effective-flow')), false);
});

// ---------------------------------------------------------------------------------------------
// Prune (cleanup only)

// Invariant: `prune` removes a marker only while its run's wisdom file is absent and keeps it as
// `possibly-suspended` while that file exists, however old the marker is; a malformed marker of a
// finished run is removable, a missing one is reported, and nothing else is touched.
test('prune removes a marker only when its wisdom file is absent', async (t) => {
  const root = fakeRoot(t);
  await register(root, OTHER, { now: NOW - 10 * STALE_AFTER_MS });
  await register(root, OWN);
  writeFileSync(markerPath(root, 'broken'), 'garbage');
  writeWisdom(root, OTHER);

  const kept = expectOk(await call('prune', root, { sessionIds: [OTHER] }));
  assert.deepEqual(kept.items, [{ sessionId: OTHER, result: 'possibly-suspended' }]);
  assert.equal(existsSync(markerPath(root, OTHER)), true);

  const pruned = expectOk(
    await call('prune', root, { sessionIds: [OWN, 'broken', 'gone', OTHER] }),
  );
  assert.deepEqual(pruned.items, [
    { sessionId: OWN, result: 'removed' },
    { sessionId: 'broken', result: 'removed' },
    { sessionId: 'gone', result: 'missing' },
    { sessionId: OTHER, result: 'possibly-suspended' },
  ]);
  assert.deepEqual(readdirSync(presenceDir(root)), [`${OTHER}.json`]);
  assert.equal(existsSync(wisdomPath(root, OTHER)), true);
});

test('prune keeps a non-regular marker entry and validates its input', async (t) => {
  const root = fakeRoot(t);
  mkdirSync(join(presenceDir(root), `${OTHER}.json`), { recursive: true });
  const result = expectOk(await call('prune', root, { sessionIds: [OTHER] }));
  assert.deepEqual(result.items, [{ sessionId: OTHER, result: 'not-regular' }]);
  assert.equal(existsSync(markerPath(root, OTHER)), true);
  for (const sessionIds of [[], [OTHER, OTHER], ['../x'], 'x', Array(65).fill(OTHER)]) {
    expectError(await call('prune', root, { sessionIds }), 'INVALID_INPUT');
  }
  expectError(
    await call('prune', root, { sessionIds: [OTHER], olderThanHours: 24 }),
    'INVALID_INPUT',
  );
});

// ---------------------------------------------------------------------------------------------
// CLI

test('the CLI dispatches presence operations and prints the outcome line', async (t) => {
  const root = fakeRoot(t);
  await register(root, OWN);
  const out = [];
  const err = [];
  let exitCode = 0;
  const envelope = await main(['presence', 'register'], {
    input: { cwd: root, sessionId: OWN, prNumber: 1, head: HEAD, base: 'main' },
    runner: fakeGit(root).runner,
    stdout: { write: (text) => out.push(text) },
    stderr: { write: (text) => err.push(text) },
    setExitCode: (code) => (exitCode = code),
  });
  assert.equal(envelope.outcome.code, 'MARKER_EXISTS');
  assert.equal(exitCode, 4);
  assert.match(
    err.join(''),
    /^MARKER_EXISTS: the presence marker of 20261114100000 already exists/,
  );
  assert.equal(JSON.parse(out.join('')).operation, 'presence register');
});

// ---------------------------------------------------------------------------------------------
// Cleanup contract

// Invariant: cleanup is the only removal path for another run's presence marker; it names the
// class in its catalog text, lists markers read-only, asks before removal, removes them only
// through `presence prune` under the wisdom-file proof, and never decides by age.
test('cleanup removes presence markers only through presence prune under the wisdom proof', () => {
  const source = readFileSync(new URL('../src/tools/cleanup.md', import.meta.url), 'utf8');
  const [frontmatter] = source.split('\n---\n');
  const flat = source.replace(/\s+/g, ' ');
  assert.match(frontmatter, /merge-gate presence markers whose run's wisdom file is gone/);
  assert.match(frontmatter, /catalogHint: "[^"\n]*finished merge-gate presence markers/);
  assert.match(
    flat,
    /a confirmed merge-gate presence marker removed by `presence prune`; no other active runtime file is a cleanup target/,
  );
  assert.match(
    flat,
    /A marker's run is over only when its wisdom file `\.effective-flow\/\.wisdom-accumulation-<SESSION_ID>\.tmp\.md` is absent/,
  );
  assert.match(flat, /Age, `possiblyStale` included, never decides\./);
  assert.match(
    source,
    /node <skill-root>\/scripts\/effective-flow-state\.mjs presence list <<< '\{"cwd":"<RUNTIME_STATE_ROOT>"\}'/,
  );
  assert.match(
    source,
    /node <skill-root>\/scripts\/effective-flow-state\.mjs presence prune <<< '\{"cwd":"<RUNTIME_STATE_ROOT>","sessionIds":\["<SESSION_ID>"\]\}'/,
  );
  assert.match(source, /header: Markers\n/);
  assert.match(flat, /Remove a presence marker only through `presence prune`\./);
  assert.doesNotMatch(source, /presence (?:release|refresh|register)/);
});
