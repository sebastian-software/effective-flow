import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { rename as renamePath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { LOCKS, LOCK_NAMES, executeOperation } from '../src/scripts/effective-flow-state-core.mjs';
import { createProcessRunner } from '../src/scripts/process-runner.mjs';

const CLI = fileURLToPath(new URL('../src/scripts/effective-flow-state.mjs', import.meta.url));
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
};
const OWNERS = Object.freeze({
  memory: { workflow: 'plan' },
  'iterate-commit': {
    workflow: 'iterate',
    runId: 'iterate-0123456789abcdef',
    item: 'PRRT_kwDOAB=+1',
    delegation: 'iterate-0123456789abcdef/1',
  },
  'apply-review-commit': {
    workflow: 'apply-review',
    runId: 'apply-review-0123456789abcdef',
    purpose: 'finding',
    findingId: 'R-0000001',
    component: 'web',
  },
});
// What the current prose writes: a memory owner with its own token and pid, and the free-text
// owners of the two commit locks, which have no token at all.
const PROSE_OWNERS = Object.freeze({
  memory: `${JSON.stringify({
    token: 'prose-session-token-1',
    workflow: 'plan',
    acquiredAt: '2026-10-29T12:00:00Z',
    host: 'box',
    pid: 4242,
  })}\n`,
  'iterate-commit': 'item PRRT_1 delegation 3 token 9f86d081 at 2026-10-29T12:00:00Z\n',
  'apply-review-commit': 'R-0000001 web 2026-10-29T12:00:00Z\n',
});

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { env: GIT_ENV });
  assert.equal(result.status, 0, String(result.stderr));
  return String(result.stdout).trim();
}

function repository(t, { ignore = '.effective-flow/\n', stateDir = false } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-state-git-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q', '--initial-branch=main');
  writeFileSync(join(root, '.gitignore'), ignore);
  writeFileSync(join(root, 'tracked.txt'), 'tracked\n');
  git(root, 'add', '.gitignore', 'tracked.txt');
  git(root, 'commit', '-q', '-m', 'fixture');
  if (stateDir) mkdirSync(join(root, '.effective-flow'), { mode: 0o700 });
  return root;
}

function deps(extra = {}) {
  return { runner: createProcessRunner(), env: GIT_ENV, ...extra };
}

function run(operation, input, extra) {
  return executeOperation(`lock ${operation}`, input, deps(extra));
}

async function acquire(root, lock, extra = {}) {
  const envelope = await run('acquire', { cwd: root, lock, owner: OWNERS[lock], ...extra });
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  return envelope.result;
}

async function inspect(root, lock) {
  const envelope = await run('inspect', { cwd: root, lock });
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  return envelope.result;
}

function lockDir(root, lock) {
  return join(root, '.effective-flow', LOCKS[lock].directory);
}

function errorCode(envelope) {
  assert.equal(envelope.ok, false, JSON.stringify(envelope));
  return envelope.error?.code ?? envelope.outcome?.code;
}

// Creates a lock exactly as the current prose does: `mkdir`, then the owner file.
function proseLock(root, lock) {
  mkdirSync(join(root, '.effective-flow'), { recursive: true, mode: 0o700 });
  mkdirSync(lockDir(root, lock));
  writeFileSync(join(lockDir(root, lock), LOCKS[lock].ownerFile), PROSE_OWNERS[lock]);
}

// ---------------------------------------------------------------------------------------------
// Root verification

// Invariant: only the main checkout's own canonical toplevel is a runtime-state root; a linked
// worktree, a symlinked alias, a subdirectory and a non-repository are INVALID_ROOT.
test('root verification accepts only the main checkout toplevel', async (t) => {
  const root = repository(t, { stateDir: true });
  assert.equal((await run('inspect', { cwd: root, lock: 'memory' })).ok, true);

  const linked = join(root, '.effective-flow', 'worktrees', 'linked');
  git(root, 'worktree', 'add', '-q', linked);
  const linkedEnvelope = await run('inspect', { cwd: realpathSync(linked), lock: 'memory' });
  assert.equal(errorCode(linkedEnvelope), 'INVALID_ROOT');
  assert.match(linkedEnvelope.error.message, /linked worktree/);

  const alias = `${root}-alias`;
  symlinkSync(root, alias);
  t.after(() => rmSync(alias, { force: true }));
  assert.equal(errorCode(await run('inspect', { cwd: alias, lock: 'memory' })), 'INVALID_ROOT');

  mkdirSync(join(root, 'sub'));
  const sub = await run('inspect', { cwd: join(root, 'sub'), lock: 'memory' });
  assert.equal(errorCode(sub), 'INVALID_ROOT');

  const plain = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-state-plain-')));
  t.after(() => rmSync(plain, { recursive: true, force: true }));
  assert.equal(errorCode(await run('inspect', { cwd: plain, lock: 'memory' })), 'INVALID_ROOT');
});

// Invariant: an inherited GIT_DIR or GIT_WORK_TREE never redirects the guard to another
// repository, neither through the env the core receives nor through the CLI process env.
test('inherited GIT_DIR and GIT_WORK_TREE are stripped before every git predicate', async (t) => {
  const root = repository(t);
  const foreign = repository(t, { ignore: '' });
  const redirect = { GIT_DIR: join(foreign, '.git'), GIT_WORK_TREE: foreign };
  const result = await acquire(root, 'memory');
  await run('release', { cwd: root, lock: 'memory', token: result.owner.token });

  const envelope = await executeOperation(
    'lock acquire',
    { cwd: root, lock: 'memory', owner: OWNERS.memory },
    { runner: createProcessRunner(), env: { ...GIT_ENV, ...redirect } },
  );
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  await run('release', { cwd: root, lock: 'memory', token: envelope.result.owner.token });

  const cli = spawnSync(process.execPath, [CLI, 'lock', 'acquire'], {
    input: JSON.stringify({ cwd: root, lock: 'memory', owner: OWNERS.memory }),
    encoding: 'utf8',
    env: { ...GIT_ENV, ...redirect },
  });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.equal(JSON.parse(cli.stdout).ok, true);
  assert.equal(existsSync(join(foreign, '.effective-flow')), false);
});

// ---------------------------------------------------------------------------------------------
// Guard refusals

// Invariant: a missing `.effective-flow/` is created on acquire through the guarded ensure step.
test('acquire creates a missing .effective-flow in a real repository', async (t) => {
  const root = repository(t);
  assert.equal(existsSync(join(root, '.effective-flow')), false);
  await acquire(root, 'memory');
  assert.ok(lstatSync(join(root, '.effective-flow')).isDirectory());
  assert.equal(git(root, 'status', '--porcelain'), '');
});

// Invariant: `.effective-flow/` that is not ignored, or holds tracked files, is refused before any
// mutation, and a missing one is not created.
test('an unignored or tracked .effective-flow is RUNTIME_STATE_UNSAFE', async (t) => {
  const unignored = repository(t, { ignore: '' });
  const envelope = await run('acquire', { cwd: unignored, lock: 'memory', owner: OWNERS.memory });
  assert.equal(errorCode(envelope), 'RUNTIME_STATE_UNSAFE');
  assert.equal(existsSync(join(unignored, '.effective-flow')), false);

  const tracked = repository(t, { stateDir: true });
  writeFileSync(join(tracked, '.effective-flow', 'config.json'), '{}\n');
  git(tracked, 'add', '-f', '.effective-flow/config.json');
  git(tracked, 'commit', '-q', '-m', 'tracked state');
  const trackedEnvelope = await run('acquire', {
    cwd: tracked,
    lock: 'memory',
    owner: OWNERS.memory,
  });
  assert.equal(errorCode(trackedEnvelope), 'RUNTIME_STATE_UNSAFE');
  assert.equal(existsSync(lockDir(tracked, 'memory')), false);
});

// Invariant: a symlink on the lock path is UNSAFE_TARGET, and nothing is created through it.
test('a symlink at the lock path is UNSAFE_TARGET for every operation', async (t) => {
  const root = repository(t, { stateDir: true });
  const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-state-target-')));
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }));
  symlinkSync(elsewhere, lockDir(root, 'memory'));
  const token = 'a'.repeat(32);
  for (const [operation, input] of [
    ['acquire', { owner: OWNERS.memory, waitSeconds: 0 }],
    ['release', { token }],
    ['inspect', {}],
    ['break', { token }],
  ]) {
    const envelope = await run(operation, { cwd: root, lock: 'memory', ...input });
    assert.equal(errorCode(envelope), 'UNSAFE_TARGET', operation);
  }
  assert.deepEqual(readdirSync(elsewhere), []);
  assert.ok(lstatSync(lockDir(root, 'memory')).isSymbolicLink());
});

// ---------------------------------------------------------------------------------------------
// Conformance with the prose protocol

for (const lock of LOCK_NAMES) {
  // Invariant: a lock taken by the current prose blocks the helper and is never released by it;
  // only a confirmed break against the observed identity and digest removes it.
  test(`conformance: a prose-created ${lock} lock blocks acquire and resists release`, async (t) => {
    const root = repository(t);
    proseLock(root, lock);
    const held = await run('acquire', { cwd: root, lock, owner: OWNERS[lock], waitSeconds: 0 });
    assert.equal(errorCode(held), 'LOCK_HELD');
    assert.equal(held.outcome.owner.state, 'invalid');
    assert.equal(held.outcome.owner.bytes, Buffer.byteLength(PROSE_OWNERS[lock]));
    assert.equal(
      held.outcome.owner.sha256,
      createHash('sha256').update(PROSE_OWNERS[lock]).digest('hex'),
    );

    for (const token of ['a'.repeat(32), '9f86d081'.padEnd(32, '0')]) {
      const release = await run('release', { cwd: root, lock, token });
      assert.equal(errorCode(release), 'NOT_OWNER');
    }
    assert.equal(
      readFileSync(join(lockDir(root, lock), LOCKS[lock].ownerFile), 'utf8'),
      PROSE_OWNERS[lock],
    );

    const seen = await inspect(root, lock);
    const broken = await run('break', {
      cwd: root,
      lock,
      identity: seen.identity,
      ownerDigest: seen.owner.sha256,
    });
    assert.equal(broken.ok, true, JSON.stringify(broken));
    assert.equal(existsSync(lockDir(root, lock)), false);
  });

  // Invariant: a helper lock sits where the prose looks and blocks the prose's own `mkdir`, with
  // the owner file name the prose reads.
  test(`conformance: a helper-created ${lock} lock matches the prose layout`, async (t) => {
    const root = repository(t);
    const { owner, path } = await acquire(root, lock);
    assert.equal(path, join(root, '.effective-flow', `${lock}.lock`));
    assert.deepEqual(readdirSync(path), [lock === 'memory' ? 'owner.json' : 'owner']);
    const stored = JSON.parse(readFileSync(join(path, LOCKS[lock].ownerFile), 'utf8'));
    assert.equal(stored.token, owner.token);
    assert.equal(stored.pid, null);
    assert.throws(() => mkdirSync(path), { code: 'EEXIST' });
  });
}

// ---------------------------------------------------------------------------------------------
// The break race

// Removes and re-creates `dir` until the filesystem hands back the same inode, within a bound.
function recreateWithSameInode(dir, ino, create) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    create();
    if (String(lstatSync(dir, { bigint: true }).ino) === ino) return true;
    for (const entry of readdirSync(dir)) unlinkSync(join(dir, entry));
    rmdirSync(dir);
  }
  create();
  return false;
}

// Moves the directory mtime away from the observed one when the filesystem's timestamp
// granularity would otherwise let the re-created directory carry the same value.
function ensureNewMtime(dir, observedNs) {
  if (String(lstatSync(dir, { bigint: true }).mtimeNs) !== observedNs) return;
  const later = new Date(Number(BigInt(observedNs) / 1_000_000n) + 5000);
  utimesSync(dir, later, later);
}

// Invariant: a release and re-acquire between inspect and break, even with the inode reused, is
// detected through the token, so the break removes nothing.
test('race: a token break after release and re-acquire is BREAK_MISMATCH', async (t) => {
  const root = repository(t);
  const first = await acquire(root, 'iterate-commit');
  const seen = await inspect(root, 'iterate-commit');
  assert.equal(
    (await run('release', { cwd: root, lock: 'iterate-commit', token: first.owner.token })).ok,
    true,
  );
  const second = await acquire(root, 'iterate-commit');
  t.diagnostic(
    `inode reused: ${(await inspect(root, 'iterate-commit')).identity.ino === seen.identity.ino}`,
  );

  const envelope = await run('break', {
    cwd: root,
    lock: 'iterate-commit',
    token: first.owner.token,
  });
  assert.equal(errorCode(envelope), 'BREAK_MISMATCH');
  assert.equal(envelope.outcome.reason, 'token-mismatch');
  const now = await inspect(root, 'iterate-commit');
  assert.equal(now.owner.fields.token, second.owner.token);
});

// Invariant: an orphan removed and re-created between inspect and break with identical owner
// bytes and, where the filesystem allows, the same inode is still told apart by the nanosecond
// mtime, so the identity break refuses and removes nothing.
test('race: an identity break after the orphan was re-created is BREAK_MISMATCH', async (t) => {
  const root = repository(t);
  const lock = 'apply-review-commit';
  proseLock(root, lock);
  const dir = lockDir(root, lock);
  const seen = await inspect(root, lock);
  unlinkSync(join(dir, 'owner'));
  rmdirSync(dir);
  const reused = recreateWithSameInode(dir, seen.identity.ino, () => {
    mkdirSync(dir);
    writeFileSync(join(dir, 'owner'), PROSE_OWNERS[lock]);
  });
  ensureNewMtime(dir, seen.identity.mtimeNs);
  t.diagnostic(`inode reused: ${reused}`);
  const now = await inspect(root, lock);
  assert.equal(now.owner.sha256, seen.owner.sha256, 'the owner bytes are identical');
  assert.notEqual(now.identity.mtimeNs, seen.identity.mtimeNs);

  const envelope = await run('break', {
    cwd: root,
    lock,
    identity: seen.identity,
    ownerDigest: seen.owner.sha256,
  });
  assert.equal(errorCode(envelope), 'BREAK_MISMATCH');
  assert.equal(envelope.outcome.reason, 'identity-mismatch');

  // The reuse case itself, independent of whether this filesystem reused the inode: the current
  // device and inode with the observed mtime still refuse.
  const reusedIdentity = {
    dev: now.identity.dev,
    ino: now.identity.ino,
    mtimeNs: seen.identity.mtimeNs,
  };
  const forced = await run('break', {
    cwd: root,
    lock,
    identity: reusedIdentity,
    ownerDigest: seen.owner.sha256,
  });
  assert.equal(errorCode(forced), 'BREAK_MISMATCH');
  assert.equal(forced.outcome.reason, 'identity-mismatch');
  assert.deepEqual(readdirSync(dir), ['owner']);
});

// Invariant: a changed owner digest under an unchanged directory refuses the identity break.
test('race: an owner rewritten in place is BREAK_MISMATCH', async (t) => {
  const root = repository(t);
  const lock = 'memory';
  proseLock(root, lock);
  const dir = lockDir(root, lock);
  const seen = await inspect(root, lock);
  writeFileSync(join(dir, 'owner.json'), '{"token":"someone-else"}\n');
  const envelope = await run('break', {
    cwd: root,
    lock,
    identity: seen.identity,
    ownerDigest: seen.owner.sha256,
  });
  assert.equal(errorCode(envelope), 'BREAK_MISMATCH');
  assert.ok(['owner-mismatch', 'identity-mismatch'].includes(envelope.outcome.reason));
  assert.ok(existsSync(join(dir, 'owner.json')));
});

// Invariant: a release and re-acquire that lands between the break's last observation and its
// rename, even on the reused inode with the observed mtime, is caught by the tombstone check and
// renamed back, so the new holder's lock survives.
test('race: a re-acquire between the last observation and the rename is restored', async (t) => {
  const root = repository(t);
  const lock = 'iterate-commit';
  const first = await acquire(root, lock);
  const seen = await inspect(root, lock);
  const dir = lockDir(root, lock);
  const intruder = `${JSON.stringify({
    token: 'b'.repeat(32),
    acquiredAt: '2026-10-29T12:00:00.000Z',
    host: 'box',
    pid: null,
    ...OWNERS[lock],
  })}\n`;
  let reused = null;
  const fs = {
    rename: async (from, to) => {
      if (from === dir && reused === null) {
        unlinkSync(join(dir, 'owner'));
        rmdirSync(dir);
        reused = recreateWithSameInode(dir, seen.identity.ino, () => {
          mkdirSync(dir);
          writeFileSync(join(dir, 'owner'), intruder);
        });
        const mtime = new Date(Number(BigInt(seen.identity.mtimeNs) / 1_000_000n));
        utimesSync(dir, mtime, mtime);
      }
      await renamePath(from, to);
    },
  };
  const envelope = await run('break', { cwd: root, lock, token: first.owner.token }, { fs });
  t.diagnostic(`inode reused: ${reused}`);
  assert.equal(errorCode(envelope), 'BREAK_MISMATCH');
  assert.equal(envelope.outcome.reason, 'changed-before-removal');
  const now = await inspect(root, lock);
  assert.equal(now.owner.fields.token, 'b'.repeat(32), 'the new holder keeps its lock');
  assert.deepEqual(readdirSync(join(root, '.effective-flow')), [LOCKS[lock].directory]);
});

// ---------------------------------------------------------------------------------------------
// CLI end to end

// Invariant: the CLI runs the lock cycle through the shared process runner and reports each
// state with its exit code.
test('CLI: acquire, held, release and NOT_HELD against a real repository', (t) => {
  const root = repository(t);
  const call = (operation, input) =>
    spawnSync(process.execPath, [CLI, 'lock', operation], {
      input: JSON.stringify({ cwd: root, lock: 'memory', ...input }),
      encoding: 'utf8',
      env: GIT_ENV,
    });
  const acquired = call('acquire', { owner: OWNERS.memory });
  assert.equal(acquired.status, 0, acquired.stderr);
  const { token } = JSON.parse(acquired.stdout).result.owner;
  const held = call('acquire', { owner: OWNERS.memory, waitSeconds: 0 });
  assert.equal(held.status, 4);
  assert.equal(JSON.parse(held.stdout).outcome.code, 'LOCK_HELD');
  assert.equal(call('release', { token }).status, 0);
  const again = call('release', { token });
  assert.equal(again.status, 4);
  assert.equal(JSON.parse(again.stdout).outcome.code, 'NOT_HELD');
});
