import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { cleanupProfile } from '../evals/_scaffold/host-profile-cleanup.mjs';
import {
  CACHE_PATHS,
  RECEIPT,
  RECORD,
  createProfile,
  openRoot,
} from '../evals/_scaffold/host-profile-storage.mjs';

// This child is deliberately ignorant of the host-run record format. It only reports the two
// homes it was given and creates the cache locations whose lifetime is the public contract.
const CHILD_SOURCE = String.raw`
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const [mode, evidence, code = '0'] = process.argv.slice(2);
const home = process.env.HOME;
const codexHome = process.env.CODEX_HOME;
const run = dirname(home);
const cachePaths = [
  join(home, '.codex', 'cache'),
  join(home, '.codex', 'plugins', 'cache'),
  join(codexHome, 'cache'),
  join(codexHome, 'plugins', 'cache'),
];
for (const path of cachePaths) { mkdirSync(path, { recursive: true }); writeFileSync(join(path, 'fixture.cache'), 'cache'); }
mkdirSync(join(run, 'state'), { recursive: true });
writeFileSync(join(run, 'state', 'retained.log'), 'must survive cleanup');
const record = { home, codexHome, pid: process.pid };
if (mode === 'grandchild') {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: false, stdio: 'ignore' });
  record.childPid = child.pid;
}
if (mode === 'stubborn-grandchild') {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { detached: false, stdio: 'ignore' });
  record.childPid = child.pid;
}
if (mode === 'replace-cache') {
  const cache = join(codexHome, 'cache');
  rmSync(cache, { recursive: true, force: true });
  symlinkSync(code, cache);
}
process.on('SIGTERM', () => process.exit(143));
process.on('SIGINT', () => process.exit(130));
// Evidence is the readiness signal: publish it only after setup is complete.
writeFileSync(evidence + '.tmp', JSON.stringify(record));
renameSync(evidence + '.tmp', evidence);
if (mode === 'exit') process.exit(Number(code));
if (mode === 'replace-cache' || mode === 'stubborn-grandchild') process.exit(0);
if (mode === 'barrier-exit') setInterval(() => { if (existsSync(code)) process.exit(0); }, 20);
setInterval(() => {}, 1000);
`;

function makeCase() {
  const root = mkdtempSync(join(tmpdir(), 'effective-flow-host-profile-'));
  const profiles = join(root, 'profiles');
  mkdirSync(profiles);
  const fixture = join(root, 'child.mjs');
  const evidence = join(root, 'evidence.json');
  writeFileSync(fixture, CHILD_SOURCE);
  return { root, profiles, fixture, evidence };
}

function hostArgs(c, mode, code) {
  return [
    'evals/host-run.mjs',
    '--profiles-root',
    c.profiles,
    '--',
    process.execPath,
    c.fixture,
    mode,
    c.evidence,
    ...(code === undefined ? [] : [String(code)]),
  ];
}

function runHost(c, mode, code) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, hostArgs(c, mode, code), {
      cwd: resolve(import.meta.dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (status, signal) =>
      resolveResult({ child, status, signal, stdout, stderr }),
    );
  });
}

function runRecovery(c) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      ['evals/host-run.mjs', '--profiles-root', c.profiles, '--recover'],
      {
        cwd: resolve(import.meta.dirname, '..'),
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (status, signal) => resolveResult({ status, signal, stderr }));
  });
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolveResult) => setTimeout(resolveResult, 20));
  }
  assert.fail(message);
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stop(pid, signal = 'SIGKILL') {
  if (pid && isAlive(pid)) process.kill(pid, signal);
}

function evidence(c) {
  return JSON.parse(readFileSync(c.evidence, 'utf8'));
}

function profileDirs(c) {
  return readdirSync(c.profiles, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(c.profiles, entry.name));
}

function assertCachesGone(record) {
  for (const path of [
    join(record.home, '.codex', 'cache'),
    join(record.home, '.codex', 'plugins', 'cache'),
    join(record.codexHome, 'cache'),
    join(record.codexHome, 'plugins', 'cache'),
  ])
    assert.equal(existsSync(path), false, `cache was retained: ${path}`);
}

function receiptSnapshot(profile) {
  const path = join(profile, RECEIPT);
  const bytes = readFileSync(path);
  const value = lstatSync(path, { bigint: true });
  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    cleanedAt: JSON.parse(bytes).cleanedAt,
    dev: value.dev,
    ino: value.ino,
    mtimeNs: value.mtimeNs,
  };
}

test('completed receipts remain immutable across sequential and concurrent wrapper recovery', async (t) => {
  const c = makeCase();
  t.after(() => rmSync(c.root, { recursive: true, force: true }));
  const first = await runHost(c, 'exit', 0);
  assert.equal(first.status, 0, first.stderr);
  const original = evidence(c);
  const profile = profileDirs(c)[0];
  const pinned = receiptSnapshot(profile);
  const sequential = { ...c, evidence: join(c.root, 'sequential.json') };
  const next = await runHost(sequential, 'exit', 0);
  assert.equal(next.status, 0, next.stderr);
  assert.deepEqual(receiptSnapshot(profile), pinned, 'sequential wrapper rewrote old receipt');
  const gate = join(c.root, 'release-barrier');
  const concurrent = [1, 2].map((id) => ({ ...c, evidence: join(c.root, `parallel-${id}.json`) }));
  const wrappers = concurrent.map((item) => runHost(item, 'barrier-exit', gate));
  // Keep both real wrappers alive until recovery has observed their live profiles.
  // Release them even on an assertion failure so the fixture cannot leave a process behind.
  try {
    await waitFor(
      () => concurrent.every((item) => existsSync(item.evidence)),
      'concurrent wrappers did not reach the barrier',
    );
    const recoveries = await Promise.all([runRecovery(c), runRecovery(c)]);
    for (const recovery of recoveries) assert.equal(recovery.status, 0, recovery.stderr);
    assert.deepEqual(receiptSnapshot(profile), pinned, 'concurrent recovery rewrote old receipt');
  } finally {
    writeFileSync(gate, 'release');
    for (const result of await Promise.all(wrappers)) assert.equal(result.status, 0, result.stderr);
  }
  const final = await runRecovery(c);
  assert.equal(final.status, 0, final.stderr);
  assert.deepEqual(receiptSnapshot(profile), pinned, 'completed wrappers rewrote old receipt');
  for (const record of [original, evidence(sequential), ...concurrent.map(evidence)])
    assertCachesGone(record);
  assert.equal(profileDirs(c).length, 4);
});

test('missing, malformed and incomplete receipts never authorize completed cleanup', async (t) => {
  const c = makeCase();
  t.after(() => rmSync(c.root, { recursive: true, force: true }));
  assert.equal((await runHost(c, 'exit', 0)).status, 0);
  const profile = profileDirs(c)[0];
  const receiptPath = join(profile, RECEIPT);
  const valid = JSON.parse(readFileSync(receiptPath));
  const invalidReceipts = [
    ['missing', undefined],
    ['malformed', '{'],
    ['null', 'null'],
    ['wrong schema', { ...valid, schema: 2 }],
    ['wrong profile', { ...valid, profileId: 'foreign' }],
    ['missing timestamp', { ...valid, cleanedAt: undefined }],
    ['invalid timestamp', { ...valid, cleanedAt: 'invalid' }],
    ['incomplete caches', { ...valid, caches: valid.caches.slice(1) }],
    ['duplicate cache', { ...valid, caches: valid.caches.map(() => valid.caches[0]) }],
    [
      'unsafe status',
      { ...valid, caches: valid.caches.map((cache) => ({ ...cache, status: 'retained-unsafe' })) },
    ],
  ];
  for (const [label, value] of invalidReceipts) {
    rmSync(receiptPath);
    if (value !== undefined)
      writeFileSync(receiptPath, typeof value === 'string' ? value : JSON.stringify(value));
    const recovery = await runRecovery(c);
    assert.equal(recovery.status, 0, `${label}: ${recovery.stderr}`);
    const repaired = JSON.parse(readFileSync(receiptPath));
    assert.equal(repaired.schema, 1, label);
    assert.equal(repaired.profileId, valid.profileId, label);
    assert.ok(Number.isFinite(Date.parse(repaired.cleanedAt)), label);
    assert.deepEqual(repaired.caches, valid.caches, label);
  }
  const external = join(c.root, 'external-receipt');
  writeFileSync(external, JSON.stringify(valid));
  rmSync(receiptPath);
  symlinkSync(external, receiptPath);
  const recovery = await runRecovery(c);
  assert.equal(recovery.status, 0, recovery.stderr);
  assert.equal(lstatSync(receiptPath).isSymbolicLink(), false);
  assert.equal(readFileSync(external, 'utf8'), JSON.stringify(valid));
});

test('a successful receipt cannot hide recreated or unsafe caches', async (t) => {
  const c = makeCase();
  t.after(() => rmSync(c.root, { recursive: true, force: true }));
  assert.equal((await runHost(c, 'exit', 0)).status, 0);
  const profile = profileDirs(c)[0];
  const cache = join(profile, ...CACHE_PATHS[2]);
  const pinned = receiptSnapshot(profile);
  mkdirSync(cache);
  writeFileSync(join(cache, 'recreated.cache'), 'remove');
  assert.equal((await runRecovery(c)).status, 0);
  assertCachesGone(evidence(c));
  assert.notEqual(receiptSnapshot(profile).ino, pinned.ino);
  const external = join(c.root, 'external-cache');
  mkdirSync(external);
  writeFileSync(join(external, 'sentinel'), 'keep');
  symlinkSync(external, cache);
  assert.equal((await runRecovery(c)).status, 0);
  const receipt = JSON.parse(readFileSync(join(profile, RECEIPT)));
  assert.equal(receipt.caches[2].status, 'retained-unsafe');
  assert.equal(readFileSync(join(external, 'sentinel'), 'utf8'), 'keep');
  assert.equal(lstatSync(cache).isSymbolicLink(), true);
});

test('successful receipts do not bypass live or unknown process and identity guards', async (t) => {
  const c = makeCase();
  t.after(() => rmSync(c.root, { recursive: true, force: true }));
  const root = openRoot(c.profiles);
  const profile = createProfile(root);
  const receiptPath = join(profile.path, RECEIPT);
  writeFileSync(
    receiptPath,
    JSON.stringify({
      schema: 1,
      profileId: profile.record.id,
      cleanedAt: '2020-01-01T00:00:00.000Z',
      caches: CACHE_PATHS.map((parts) => ({ path: parts.join('/'), status: 'removed' })),
    }),
  );
  const pinned = receiptSnapshot(profile.path);
  assert.equal(await cleanupProfile(root, profile.path), false, 'live owner');
  const kill = process.kill;
  const unknownPid = 2147483647;
  const mockedKill = t.mock.method(process, 'kill', (pid, signal) => {
    if (Math.abs(pid) === unknownPid) throw Object.assign(new Error('unknown'), { code: 'EPERM' });
    return kill.call(process, pid === -process.pid ? process.pid : pid, signal);
  });
  try {
    writeFileSync(
      join(profile.path, RECORD),
      JSON.stringify({ ...profile.record, ownerPid: unknownPid }),
    );
    assert.equal(await cleanupProfile(root, profile.path), false, 'unknown owner');
    for (const childPgid of [process.pid, unknownPid]) {
      writeFileSync(
        join(profile.path, RECORD),
        JSON.stringify({ ...profile.record, phase: 'armed', childPgid }),
      );
      assert.equal(
        await cleanupProfile(root, profile.path, { own: true }),
        false,
        'live/unknown group',
      );
    }
  } finally {
    mockedKill.mock.restore();
  }
  assert.deepEqual(receiptSnapshot(profile.path), pinned);
  for (const states of [
    ['gone', 'live'],
    ['gone', 'gone', 'unknown'],
  ]) {
    let probes = 0;
    const changingOwner = t.mock.method(process, 'kill', (_pid, _signal) => {
      const state = states[Math.min(probes++, states.length - 1)];
      if (state !== 'live')
        throw Object.assign(new Error(state), { code: state === 'gone' ? 'ESRCH' : 'EPERM' });
      return true;
    });
    try {
      writeFileSync(
        join(profile.path, RECORD),
        JSON.stringify({ ...profile.record, ownerPid: unknownPid }),
      );
      assert.equal(
        await cleanupProfile(root, profile.path),
        false,
        `owner became ${states.at(-1)}`,
      );
      assert.equal(probes, states.length);
      assert.deepEqual(receiptSnapshot(profile.path), pinned);
    } finally {
      changingOwner.mock.restore();
    }
  }
  writeFileSync(join(profile.path, RECORD), JSON.stringify(profile.record));
  const moved = `${profile.path}-replaced`;
  renameSync(profile.path, moved);
  mkdirSync(profile.path);
  writeFileSync(join(profile.path, RECORD), JSON.stringify(profile.record));
  await assert.rejects(cleanupProfile(root, profile.path, { own: true }), /ownership changed/);
  assert.deepEqual(receiptSnapshot(moved), pinned);
});

test('normal and nonzero host runs clean only caches and retain evidence/state', async (t) => {
  for (const code of [0, 17]) {
    const c = makeCase();
    t.after(() => rmSync(c.root, { recursive: true, force: true }));
    const result = await runHost(c, 'exit', code);
    assert.equal(result.status, code, result.stderr);
    const record = evidence(c);
    assertCachesGone(record);
    assert.equal(profileDirs(c).length, 1);
    assert.equal(existsSync(join(profileDirs(c)[0], 'state', 'retained.log')), true);
  }
});

test('SIGINT terminates the child and still performs bounded cache cleanup', async (t) => {
  const c = makeCase();
  t.after(() => rmSync(c.root, { recursive: true, force: true }));
  const running = spawn(process.execPath, hostArgs(c, 'wait'), {
    cwd: resolve(import.meta.dirname, '..'),
    stdio: 'ignore',
  });
  t.after(() => stop(running.pid));
  await waitFor(() => existsSync(c.evidence), 'child did not start');
  running.kill('SIGINT');
  const [status] = await once(running, 'close');
  assert.ok(status !== 0);
  assertCachesGone(evidence(c));
});

test('a SIGKILLed host is recovered after its child process group is gone', async (t) => {
  const c = makeCase();
  t.after(() => rmSync(c.root, { recursive: true, force: true }));
  const running = spawn(process.execPath, hostArgs(c, 'grandchild'), {
    cwd: resolve(import.meta.dirname, '..'),
    stdio: 'ignore',
  });
  t.after(() => {
    const record = existsSync(c.evidence) ? evidence(c) : {};
    stop(record.pid);
    stop(record.childPid);
    stop(running.pid);
  });
  await waitFor(() => existsSync(c.evidence), 'child did not start');
  const record = evidence(c);
  running.kill('SIGKILL');
  await once(running, 'close');
  const live = await runRecovery(c);
  assert.equal(live.status, 0, live.stderr);
  assert.equal(existsSync(join(record.home, '.codex', 'cache')), true);
  stop(record.pid);
  stop(record.childPid);
  await waitFor(
    () => !isAlive(record.pid) && !isAlive(record.childPid),
    'fixture process group did not terminate',
  );
  const recovered = await runRecovery(c);
  assert.equal(recovered.status, 0, recovered.stderr);
  await waitFor(
    () => !existsSync(join(record.home, '.codex', 'cache')),
    'abandoned cache was not recovered',
  );
});

test('a successful run escalates group termination for a SIGTERM-ignoring descendant', async (t) => {
  const c = makeCase();
  t.after(() => rmSync(c.root, { recursive: true, force: true }));
  const result = await runHost(c, 'stubborn-grandchild');
  const record = evidence(c);
  t.after(() => stop(record.childPid));
  assert.equal(result.status, 0, result.stderr);
  await waitFor(
    () => !isAlive(record.childPid),
    'stubborn descendant survived bounded termination',
  );
  assertCachesGone(record);
  assert.equal(existsSync(join(profileDirs(c)[0], 'state', 'retained.log')), true);
});

test('concurrent recovery calls converge after a killed host group is gone', async (t) => {
  const c = makeCase();
  t.after(() => rmSync(c.root, { recursive: true, force: true }));
  const running = spawn(process.execPath, hostArgs(c, 'grandchild'), {
    cwd: resolve(import.meta.dirname, '..'),
    stdio: 'ignore',
  });
  t.after(() => {
    const record = existsSync(c.evidence) ? evidence(c) : {};
    stop(record.pid);
    stop(record.childPid);
    stop(running.pid);
  });
  await waitFor(() => existsSync(c.evidence), 'child did not start');
  const record = evidence(c);
  running.kill('SIGKILL');
  await once(running, 'close');
  stop(record.pid);
  stop(record.childPid);
  await waitFor(
    () => !isAlive(record.pid) && !isAlive(record.childPid),
    'fixture group did not terminate',
  );
  const recoveries = await Promise.all([runRecovery(c), runRecovery(c)]);
  for (const recovery of recoveries) assert.equal(recovery.status, 0, recovery.stderr);
  assertCachesGone(record);
  assert.equal(existsSync(join(profileDirs(c)[0], 'state', 'retained.log')), true);
});

test('recovery preserves live profiles and is idempotent', async (t) => {
  const c = makeCase();
  t.after(() => rmSync(c.root, { recursive: true, force: true }));
  const running = spawn(process.execPath, hostArgs(c, 'wait'), {
    cwd: resolve(import.meta.dirname, '..'),
    stdio: 'ignore',
  });
  t.after(() => stop(running.pid));
  await waitFor(() => existsSync(c.evidence), 'child did not start');
  const liveRecord = evidence(c);
  const first = await runHost(c, 'exit', 0);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(existsSync(join(liveRecord.codexHome, 'cache')), true);
  assert.equal(profileDirs(c).length, 2);
  running.kill('SIGTERM');
  await once(running, 'close');
  const second = await runHost(c, 'exit', 0);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(profileDirs(c).length, 3);
  await waitFor(
    () => !existsSync(join(liveRecord.codexHome, 'cache')),
    'closed live profile cache was not removed',
  );
  assert.equal(existsSync(join(profileDirs(c)[0], 'state', 'retained.log')), true);
  assert.equal(existsSync(join(profileDirs(c)[1], 'state', 'retained.log')), true);
  assert.equal(existsSync(join(profileDirs(c)[2], 'state', 'retained.log')), true);
});

test('recovery never follows arbitrary directories or symlinks', async (t) => {
  const c = makeCase();
  t.after(() => rmSync(c.root, { recursive: true, force: true }));
  const foreign = join(c.root, 'foreign');
  mkdirSync(join(foreign, 'cache'), { recursive: true });
  writeFileSync(join(foreign, 'sentinel'), 'keep');
  symlinkSync(foreign, join(c.profiles, 'foreign-link'));
  mkdirSync(join(c.profiles, 'arbitrary'));
  writeFileSync(join(c.profiles, 'arbitrary', 'sentinel'), 'keep');
  const authTarget = join(c.root, 'auth-target');
  writeFileSync(authTarget, 'token');
  const auth = join(c.root, 'auth');
  symlinkSync(authTarget, auth);
  const result = await new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      [
        'evals/host-run.mjs',
        '--profiles-root',
        c.profiles,
        '--auth-file',
        auth,
        '--',
        process.execPath,
        c.fixture,
        'exit',
        c.evidence,
      ],
      { cwd: resolve(import.meta.dirname, '..'), stdio: 'ignore' },
    );
    child.once('error', reject);
    child.once('close', (status) => resolveResult(status));
  });
  assert.equal(result, 0);
  const recovery = await runRecovery(c);
  assert.equal(recovery.status, 0, recovery.stderr);
  assert.equal(readFileSync(join(foreign, 'sentinel'), 'utf8'), 'keep');
  assert.equal(readFileSync(join(c.profiles, 'arbitrary', 'sentinel'), 'utf8'), 'keep');
  assert.equal(lstatSync(auth).isSymbolicLink(), true);
});

test('cleanup preserves an external target when an owned cache becomes a symlink', async (t) => {
  const c = makeCase();
  t.after(() => rmSync(c.root, { recursive: true, force: true }));
  const external = join(c.root, 'external-cache');
  mkdirSync(external);
  writeFileSync(join(external, 'sentinel'), 'keep');
  const result = await runHost(c, 'replace-cache', external);
  assert.ok(Number.isInteger(result.status), result.stderr);
  assert.equal(readFileSync(join(external, 'sentinel'), 'utf8'), 'keep');
  const recovery = await runRecovery(c);
  assert.ok(Number.isInteger(recovery.status), recovery.stderr);
  assert.equal(readFileSync(join(external, 'sentinel'), 'utf8'), 'keep');
});
