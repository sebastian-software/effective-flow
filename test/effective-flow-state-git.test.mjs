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
  renameSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { open as openPath, rename as renamePath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { LOCKS, LOCK_NAMES, executeOperation } from '../src/scripts/effective-flow-state-core.mjs';
import { createProcessRunner } from '../src/scripts/process-runner.mjs';
import { RULE_ENTRIES } from '../src/scripts/claude-settings-core.mjs';
import { writeHelperScripts } from './support/state-helper-fixtures.mjs';
import * as wf from './support/worktree-fixtures.mjs';

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

// Invariant: a release and re-acquire outside the helper, which its guard cannot serialize, that
// lands between the break's last observation and its rename, even on the reused inode with the
// observed mtime, is caught by the tombstone check and renamed back, so the new holder's lock
// survives.
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

// ---------------------------------------------------------------------------------------------
// Memory operations against prose-protocol state (both directions)

const MARKED_MEMORY = Object.freeze({ runtimeMigration: { directory: { version: 1 } } });

function memoryOp(operation, input, extra) {
  return executeOperation(
    `memory ${operation}`,
    { owner: OWNERS.memory, waitSeconds: 0, ...input },
    deps(extra),
  );
}

// Writes memory exactly as the prose protocol does: lock directory plus owner, a temporary sibling,
// a rename over memory.json, then the lock removed again.
function proseMemoryWrite(root, object, owner = PROSE_OWNERS.memory) {
  proseLock(root, 'memory');
  writeFileSync(join(lockDir(root, 'memory'), LOCKS.memory.ownerFile), owner);
  const temporary = join(root, '.effective-flow', '.memory.json.prose-session.1.tmp');
  writeFileSync(temporary, JSON.stringify(object));
  renameSync(temporary, join(root, '.effective-flow', 'memory.json'));
  rmSync(lockDir(root, 'memory'), { recursive: true });
}

// Invariant (mixed-version operation, prose to helper): a helper reservation continues the counter
// a prose writer persisted, keeps its unknown fields, and is blocked by a lock a prose writer holds.
test('conformance: a helper reservation on prose-written memory and lock state', async (t) => {
  const root = repository(t, { stateDir: true });
  const prose = { ...MARKED_MEMORY, lastFindingNumber: 41, prose: { note: 'unknown' } };
  proseMemoryWrite(root, prose);
  const memoryFile = join(root, '.effective-flow', 'memory.json');

  proseLock(root, 'memory');
  const held = await memoryOp('reserve', { cwd: root, count: 2 });
  assert.equal(held.outcome?.code, 'LOCK_HELD', JSON.stringify(held));
  assert.equal(held.outcome.owner.state, 'invalid', 'a prose owner is foreign to the helper');
  assert.equal(readFileSync(memoryFile, 'utf8'), JSON.stringify(prose));
  rmSync(lockDir(root, 'memory'), { recursive: true });

  const reserved = await memoryOp('reserve', { cwd: root, count: 2 });
  assert.equal(reserved.ok, true, JSON.stringify(reserved));
  assert.deepEqual([reserved.result.firstId, reserved.result.lastId], ['R-0000042', 'R-0000043']);
  assert.deepEqual(JSON.parse(readFileSync(memoryFile, 'utf8')), {
    ...prose,
    lastFindingNumber: 43,
  });
});

// Invariant (mixed-version operation, helper to prose): after a helper write a prose reader finds
// the full object with the same JSON meaning and a trailing newline; while a helper transaction
// runs, the lock sits at the prose path `memory.lock/owner.json` in the WP2 owner format, so a
// prose `mkdir` is excluded; afterwards the lock path is free for the prose protocol again.
test('conformance: prose-protocol state after a helper write', async (t) => {
  const root = repository(t, { stateDir: true });
  proseMemoryWrite(root, { ...MARKED_MEMORY, lastFindingNumber: 3, other: [1, { a: null }] });
  const memoryFile = join(root, '.effective-flow', 'memory.json');
  let observed;
  const fs = {
    open: async (target, ...rest) => {
      if (target === memoryFile && !observed) {
        const ownerPath = join(lockDir(root, 'memory'), 'owner.json');
        observed = JSON.parse(readFileSync(ownerPath, 'utf8'));
        assert.throws(() => mkdirSync(lockDir(root, 'memory')), { code: 'EEXIST' });
      }
      return openPath(target, ...rest);
    },
  };
  const reserved = await memoryOp('reserve', { cwd: root, count: 1 }, { fs });
  assert.equal(reserved.ok, true, JSON.stringify(reserved));
  assert.deepEqual(Object.keys(observed).sort(), [
    'acquiredAt',
    'host',
    'pid',
    'token',
    'workflow',
  ]);
  assert.equal(observed.workflow, OWNERS.memory.workflow);
  assert.equal(observed.pid, null);

  const text = readFileSync(memoryFile, 'utf8');
  assert.ok(text.endsWith('\n'));
  assert.deepEqual(JSON.parse(text), {
    ...MARKED_MEMORY,
    lastFindingNumber: 4,
    other: [1, { a: null }],
  });
  assert.equal(existsSync(lockDir(root, 'memory')), false);
  proseMemoryWrite(root, { ...JSON.parse(text), lastFindingNumber: 5 });
  assert.equal(JSON.parse(readFileSync(memoryFile, 'utf8')).lastFindingNumber, 5);
});

// Invariant (legacy-memory class): `.sf-memory.json` needs no ignore entry to be adopted and
// removed, but a tracked one is never unlinked: the adoption reports `legacyRemoval` and keeps it.
test('legacy-memory class: untracked is removed without an ignore entry; tracked is kept', async (t) => {
  const untracked = repository(t);
  writeFileSync(join(untracked, '.sf-memory.json'), JSON.stringify({ lastFindingNumber: 7 }));
  assert.equal(
    spawnSync('git', ['-C', untracked, 'check-ignore', '-q', '.sf-memory.json'], { env: GIT_ENV })
      .status,
    1,
    'the fixture leaves .sf-memory.json unignored',
  );
  const migrated = await memoryOp('migrate-directory', { cwd: untracked });
  assert.equal(migrated.ok, true, JSON.stringify(migrated));
  assert.equal(existsSync(join(untracked, '.sf-memory.json')), false);

  const tracked = repository(t);
  writeFileSync(join(tracked, '.sf-memory.json'), JSON.stringify({ lastFindingNumber: 7 }));
  git(tracked, 'add', '.sf-memory.json');
  git(tracked, 'commit', '-q', '-m', 'tracked legacy memory');
  const adopted = await memoryOp('migrate-directory', { cwd: tracked });
  assert.equal(adopted.ok, true, JSON.stringify(adopted));
  assert.match(adopted.result.legacyRemoval.error, /tracked/);
  assert.ok(existsSync(join(tracked, '.sf-memory.json')));
  assert.equal(
    JSON.parse(readFileSync(join(tracked, '.effective-flow', 'memory.json'), 'utf8'))
      .lastFindingNumber,
    7,
  );
});

// Invariant: the batched copy guard runs one `check-ignore --stdin` against real Git, so a legacy
// tree copies when every target is ignored, and a single target outside the ignore rules stops the
// copy with MIGRATION_INCOMPLETE before any file is written, naming that file.
test('migrate-directory: the batched copy guard decides per target in a real repository', async (t) => {
  const ignored = repository(t);
  mkdirSync(join(ignored, '.firmo', 'nested'), { recursive: true });
  writeFileSync(join(ignored, '.firmo', 'a.txt'), 'a\n');
  writeFileSync(join(ignored, '.firmo', 'nested', 'b.txt'), 'b\n');
  const migrated = await memoryOp('migrate-directory', { cwd: ignored });
  assert.equal(migrated.ok, true, JSON.stringify(migrated));
  assert.deepEqual(migrated.result.copied.sort(), ['.firmo/a.txt', '.firmo/nested/b.txt']);
  assert.equal(readFileSync(join(ignored, '.effective-flow', 'nested', 'b.txt'), 'utf8'), 'b\n');

  const partial = repository(t, { ignore: '.effective-flow/*\n!.effective-flow/keep.txt\n' });
  mkdirSync(join(partial, '.firmo'));
  writeFileSync(join(partial, '.firmo', 'a.txt'), 'a\n');
  writeFileSync(join(partial, '.firmo', 'keep.txt'), 'keep\n');
  const refused = await memoryOp('migrate-directory', { cwd: partial });
  assert.equal(refused.outcome?.code, 'MIGRATION_INCOMPLETE', JSON.stringify(refused));
  assert.equal(refused.outcome.failed.path, '.firmo/keep.txt');
  assert.equal(refused.outcome.failed.code, 'RUNTIME_STATE_UNSAFE');
  assert.deepEqual(refused.outcome.copied, []);
  assert.equal(existsSync(join(partial, '.effective-flow', 'a.txt')), false);
});

// ---------------------------------------------------------------------------------------------
// Harness settings class and `harness allow-rules`

const ISOLATED_GIT_HOME = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-state-home-')));
process.on('exit', () => rmSync(ISOLATED_GIT_HOME, { recursive: true, force: true }));
// Claude Code's own marker plus an empty global Git configuration, so `check-ignore` decides from
// the fixture and the explicitly set global excludes file alone.
const HARNESS_ENV = {
  ...GIT_ENV,
  HOME: ISOLATED_GIT_HOME,
  XDG_CONFIG_HOME: ISOLATED_GIT_HOME,
  GIT_CONFIG_GLOBAL: join(ISOLATED_GIT_HOME, 'gitconfig'),
  CLAUDECODE: '1',
};

// A skill install outside the repository: `<base>/skills/effective-flow` is a symlink into
// `<base>/<checkout>/<inner>`, the DALO layout for `inner = effective-flow` and the local-link
// layout for `inner = dist/claude/effective-flow`. `git` makes the checkout a Git clone.
function install(t, { checkout = 'clone', inner = 'effective-flow', gitInit = true } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-install-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const real = join(base, checkout, inner);
  mkdirSync(join(real, 'scripts'), { recursive: true });
  writeHelperScripts(join(real, 'scripts'));
  if (gitInit) git(join(base, checkout), 'init', '-q');
  mkdirSync(join(base, 'skills'));
  symlinkSync(real, join(base, 'skills', 'effective-flow'));
  return {
    skillRoot: join(base, 'skills', 'effective-flow'),
    helperPath: join(real, 'scripts', 'effective-flow-state.mjs'),
  };
}

function allowRules(root, installed, input = {}, env = HARNESS_ENV) {
  return executeOperation(
    'harness allow-rules',
    { cwd: root, skillRoot: installed.skillRoot, mode: 'preview', ...input },
    { runner: createProcessRunner(), env, helperPath: installed.helperPath },
  );
}

// Invariant (harness-settings class): the settings file must be ignored by `.gitignore`,
// `info/exclude` or the global `core.excludesFile`, and untracked; otherwise nothing is written.
test('harness-settings class: ignore sources and tracked refusal in a real repository', async (t) => {
  const installed = install(t);
  const unignored = repository(t);
  assert.equal((await allowRules(unignored, installed)).outcome?.code, 'SETTINGS_NOT_IGNORED');

  const viaGitignore = repository(t, { ignore: '.effective-flow/\n.claude/settings.local.json\n' });
  assert.equal((await allowRules(viaGitignore, installed)).ok, true);

  const viaExclude = repository(t);
  writeFileSync(join(viaExclude, '.git', 'info', 'exclude'), '.claude/settings.local.json\n');
  assert.equal((await allowRules(viaExclude, installed)).ok, true);

  const viaGlobal = repository(t);
  const excludes = join(ISOLATED_GIT_HOME, 'excludes');
  writeFileSync(excludes, '.claude/settings.local.json\n');
  writeFileSync(HARNESS_ENV.GIT_CONFIG_GLOBAL, `[core]\n\texcludesFile = ${excludes}\n`);
  t.after(() => rmSync(HARNESS_ENV.GIT_CONFIG_GLOBAL, { force: true }));
  assert.equal((await allowRules(viaGlobal, installed)).ok, true);
  rmSync(HARNESS_ENV.GIT_CONFIG_GLOBAL, { force: true });

  const tracked = repository(t, { ignore: '.effective-flow/\n.claude/settings.local.json\n' });
  mkdirSync(join(tracked, '.claude'));
  writeFileSync(join(tracked, '.claude', 'settings.local.json'), '{}\n');
  git(tracked, 'add', '-f', '.claude/settings.local.json');
  const refused = await allowRules(tracked, installed);
  assert.equal(refused.outcome?.code, 'SETTINGS_TRACKED');
  assert.equal(readFileSync(join(tracked, '.claude', 'settings.local.json'), 'utf8'), '{}\n');
});

// Invariant: a preview, then the apply with its digest, writes exactly the rule set of the three
// helpers through the real Git guard and creates `.claude/` on apply only.
test('harness allow-rules: preview then apply in a real repository', async (t) => {
  const installed = install(t);
  const root = repository(t, { ignore: '.effective-flow/\n.claude/settings.local.json\n' });
  const preview = await allowRules(root, installed);
  assert.equal(preview.ok, true, JSON.stringify(preview));
  assert.equal(existsSync(join(root, '.claude')), false);
  const applied = await allowRules(root, installed, {
    mode: 'apply',
    digest: preview.result.digest,
  });
  assert.equal(applied.ok, true, JSON.stringify(applied));
  const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.local.json'), 'utf8'));
  assert.deepEqual(settings.permissions.allow, preview.result.rules);
  assert.equal(settings.permissions.allow.length, RULE_ENTRIES.length);
});

// Invariant: an install inside a worktree of the current repository is refused, while an install
// in another clone (DALO layout, local-link layout) is accepted.
test('harness allow-rules: worktree of the current repository versus another clone', async (t) => {
  const root = repository(t, { ignore: '.effective-flow/\n.claude/settings.local.json\n' });
  const linked = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-linked-')));
  rmSync(linked, { recursive: true });
  git(root, 'worktree', 'add', '-q', linked);
  t.after(() => rmSync(linked, { recursive: true, force: true }));
  mkdirSync(join(linked, 'dist', 'scripts'), { recursive: true });
  writeHelperScripts(join(linked, 'dist', 'scripts'));
  const inWorktree = {
    skillRoot: join(linked, 'dist'),
    helperPath: join(linked, 'dist', 'scripts', 'effective-flow-state.mjs'),
  };
  const refused = await allowRules(root, inWorktree);
  assert.equal(refused.outcome?.code, 'UNSUPPORTED_PATH');
  assert.equal(refused.outcome.reason, 'inside-repository-worktree');
  assert.equal(refused.outcome.path, linked);

  mkdirSync(join(root, 'vendor', 'scripts'), { recursive: true });
  writeHelperScripts(join(root, 'vendor', 'scripts'));
  const inRoot = await allowRules(root, {
    skillRoot: join(root, 'vendor'),
    helperPath: join(root, 'vendor', 'scripts', 'effective-flow-state.mjs'),
  });
  assert.equal(inRoot.outcome?.reason, 'inside-runtime-root');

  for (const layout of [
    { checkout: 'dalo-source', inner: 'effective-flow' },
    { checkout: 'other-checkout', inner: 'dist/claude/effective-flow' },
  ]) {
    const accepted = await allowRules(root, install(t, layout));
    assert.equal(accepted.ok, true, JSON.stringify(accepted));
  }
});

// ---------------------------------------------------------------------------------------------
// Worktree lifecycle against real linked worktrees

// A cleanup-ready apply-review component whose one commit `change(worktreePath)` makes.
async function component(root, name, change, recordId = name) {
  const { worktree, record } = await wf.initialized(root, {
    purpose: 'apply-review',
    component: name,
    recordId,
  });
  if (change) {
    change(worktree.worktreePath);
    wf.git(worktree.worktreePath, 'add', '-A');
    wf.git(worktree.worktreePath, 'commit', '-q', '-m', `component ${name}`);
  }
  await wf.moveTo(root, record, 'cleanup-ready');
  return { worktree, record, tip: wf.git(worktree.worktreePath, 'rev-parse', 'HEAD') };
}

function removeComponents(root, recordIds, extra = {}, integrationRoot = root) {
  return wf.call(
    'worktree remove',
    {
      cwd: root,
      executionRoot: root,
      sessionId: wf.SESSION,
      recordIds,
      ...(integrationRoot ? { integrationRoot } : {}),
    },
    extra,
  );
}

// Integrates `commit` onto `main` the way a real integration lands: after an unrelated commit, so
// the cherry-pick is a new commit object with an equal patch, never the same object.
function integrate(root, commit) {
  writeFileSync(join(root, 'unrelated.txt'), `${commit}\n`);
  wf.git(root, 'add', 'unrelated.txt');
  wf.git(root, 'commit', '-q', '-m', 'unrelated');
  wf.git(root, 'cherry-pick', commit);
}

function branchExists(root, branch) {
  return wf.git(root, 'branch', '--list', branch) !== '';
}

// Invariant: a real linked worktree of every purpose is created, claimed and removed; only the
// temporary apply-review branch is deleted.
test('worktree lifecycle: every purpose is initialized, claimed and removed', async (t) => {
  for (const purpose of ['delivery', 'partial-diff', 'plan-publication', 'apply-review']) {
    const root = wf.repository(t);
    const { worktree, record } = await wf.initialized(root, { purpose });
    const result = wf.expectOk(await removeComponents(root, [record.recordId], {}, null));
    assert.equal(result.items[0].ok, true, `${purpose}: ${JSON.stringify(result)}`);
    assert.equal(existsSync(worktree.worktreePath), false);
    assert.equal(existsSync(wf.recordFile(root)), false);
    assert.equal(branchExists(root, record.branch), purpose !== 'apply-review', purpose);
  }
});

// Invariant: a dirty worktree is refused by condition 7 before the claim, and by Git itself when
// it turns dirty after the claim: `cleanup-failed` with Git's own error, never `--force`.
test('worktree lifecycle: a dirty worktree is refused by condition 7 and by Git', async (t) => {
  const root = wf.repository(t);
  const { worktree } = await component(root, 'c1');
  writeFileSync(join(worktree.worktreePath, 'dirty.txt'), 'dirty\n');
  const refused = wf.expectOk(await removeComponents(root, ['c1'], {}, null));
  assert.equal(refused.items[0].code, 'NOT_ELIGIBLE');
  assert.deepEqual(refused.items[0].conditions, [7]);
  unlinkSync(join(worktree.worktreePath, 'dirty.txt'));
  const byGit = wf.expectOk(
    await removeComponents(
      root,
      ['c1'],
      {
        onPhase: (name) => {
          if (name === 'afterClaim') writeFileSync(join(worktree.worktreePath, 'late.txt'), 'x\n');
        },
      },
      null,
    ),
  );
  assert.equal(byGit.items[0].code, 'REMOVE_FAILED');
  assert.match(byGit.items[0].reason, /untracked|modified/);
  const record = wf.readRecord(root, 'c1');
  assert.equal(record.status, 'cleanup-failed');
  assert.equal(record.reason, byGit.items[0].reason);
  assert.ok(existsSync(join(worktree.worktreePath, 'late.txt')));
});

// Invariant: a locked or prunable registration and a branch that no longer contains `creationOid`
// are ineligible (conditions 4 and 6) in `worktree inspect`.
test('worktree lifecycle: locked, prunable and rewritten registrations are ineligible', async (t) => {
  const root = wf.repository(t);
  const locked = await component(root, 'c1');
  const prunable = await component(root, 'c2');
  const rewritten = await component(root, 'c3');
  wf.git(root, 'worktree', 'lock', locked.worktree.worktreePath);
  rmSync(prunable.worktree.worktreePath, { recursive: true, force: true });
  const tree = wf.git(rewritten.worktree.worktreePath, 'rev-parse', 'HEAD^{tree}');
  const orphan = wf.git(rewritten.worktree.worktreePath, 'commit-tree', tree, '-m', 'rewritten');
  wf.git(rewritten.worktree.worktreePath, 'reset', '-q', '--hard', orphan);
  const result = wf.expectOk(await wf.call('worktree inspect', { cwd: root, executionRoot: root }));
  const conditions = Object.fromEntries(
    result.records.map((record) => [record.recordId, record.conditions]),
  );
  assert.deepEqual(conditions.c1, [4]);
  assert.ok(conditions.c2.includes(4), JSON.stringify(conditions.c2));
  assert.deepEqual(conditions.c3, [6]);
});

// Invariant: inside `apply-review`, a branch whose every commit has an exact `--verbatim` patch-id
// match on the integration target is deleted with a compare-and-delete after `git branch -d`
// refuses it.
test('integration proof: a cherry-picked component branch is deleted after the proof', async (t) => {
  const root = wf.repository(t);
  const { record, tip } = await component(root, 'c1', (wt) =>
    writeFileSync(join(wt, 'feature.txt'), 'feature line\n'),
  );
  integrate(root, tip);
  const result = wf.expectOk(await removeComponents(root, ['c1']));
  assert.equal(result.items[0].ok, true, JSON.stringify(result));
  assert.equal(result.items[0].branch.outcome, 'deleted-after-proof');
  assert.equal(branchExists(root, record.branch), false);
  assert.equal(existsSync(wf.recordFile(root, 'c1')), false);
});

// Invariant: without `integrationRoot` (the `cleanup` path) the same unmerged branch is retained
// as BRANCH_RETAINED with its unproven commits, and the record is still deleted.
test('integration proof: without integrationRoot the branch is BRANCH_RETAINED', async (t) => {
  const root = wf.repository(t);
  const { record, tip } = await component(root, 'c1', (wt) =>
    writeFileSync(join(wt, 'feature.txt'), 'feature line\n'),
  );
  integrate(root, tip);
  const result = wf.expectOk(await removeComponents(root, ['c1'], {}, null));
  const item = result.items[0];
  assert.equal(item.code, 'BRANCH_RETAINED');
  assert.equal(item.removed, true);
  assert.equal(item.branch.branch, record.branch);
  assert.deepEqual(item.branch.unproven, [tip]);
  assert.ok(branchExists(root, record.branch));
  assert.equal(existsSync(wf.recordFile(root, 'c1')), false);
});

// Invariant: the proof refuses a merge commit, a whitespace-only difference, a target equal to a
// component branch, a tip moved between proof and deletion, and a branch still checked out; each
// keeps the branch as BRANCH_RETAINED with its reason.
test('integration proof: each refusal keeps the branch', async (t) => {
  const cases = [
    [
      'merge-commit',
      async (root) => {
        const { worktree, record } = await wf.initialized(root, {
          purpose: 'apply-review',
          component: 'c1',
          recordId: 'c1',
        });
        const wt = worktree.worktreePath;
        wf.git(wt, 'switch', '-q', '-c', 'side');
        writeFileSync(join(wt, 'side.txt'), 'side\n');
        wf.git(wt, 'add', 'side.txt');
        wf.git(wt, 'commit', '-q', '-m', 'side');
        wf.git(wt, 'switch', '-q', record.branch);
        writeFileSync(join(wt, 'main-side.txt'), 'main side\n');
        wf.git(wt, 'add', 'main-side.txt');
        wf.git(wt, 'commit', '-q', '-m', 'component');
        wf.git(wt, 'merge', '-q', '--no-ff', '--no-edit', 'side');
        wf.git(root, 'branch', '-D', 'side');
        await wf.moveTo(root, record, 'cleanup-ready');
        wf.git(root, 'merge', '-q', '--squash', record.branch);
        wf.git(root, 'commit', '-q', '-m', 'squashed');
        return { recordIds: ['c1'], branch: record.branch };
      },
    ],
    [
      'patch-id-mismatch',
      async (root) => {
        const { record } = await component(root, 'c1', (wt) =>
          writeFileSync(join(wt, 'feature.txt'), 'a b\n'),
        );
        writeFileSync(join(root, 'feature.txt'), 'a  b\n');
        wf.git(root, 'add', 'feature.txt');
        wf.git(root, 'commit', '-q', '-m', 'whitespace variant');
        return { recordIds: ['c1'], branch: record.branch };
      },
    ],
    [
      'target-is-component',
      async (root) => {
        const first = await component(root, 'c1', (wt) =>
          writeFileSync(join(wt, 'one.txt'), 'one\n'),
        );
        const second = await component(root, 'c2');
        return {
          recordIds: ['c1', 'c2'],
          branch: first.record.branch,
          integrationRoot: second.worktree.worktreePath,
        };
      },
    ],
    [
      'ref-moved',
      async (root) => {
        const { record, tip } = await component(root, 'c1', (wt) =>
          writeFileSync(join(wt, 'feature.txt'), 'feature\n'),
        );
        integrate(root, tip);
        return {
          recordIds: ['c1'],
          branch: record.branch,
          onPhase: (name) => {
            if (name === 'beforeBranchDelete') {
              wf.git(root, 'update-ref', `refs/heads/${record.branch}`, `${tip}~1`);
            }
          },
        };
      },
    ],
    [
      'checked-out',
      async (root) => {
        const { record, tip } = await component(root, 'c1', (wt) =>
          writeFileSync(join(wt, 'feature.txt'), 'feature\n'),
        );
        integrate(root, tip);
        const elsewhere = join(root, '.effective-flow', 'elsewhere');
        return {
          recordIds: ['c1'],
          branch: record.branch,
          onPhase: (name) => {
            if (name === 'afterRemove')
              wf.git(root, 'worktree', 'add', '-q', elsewhere, record.branch);
          },
        };
      },
    ],
  ];
  for (const [reason, prepare] of cases) {
    const root = wf.repository(t);
    const scenario = await prepare(root);
    const result = wf.expectOk(
      await removeComponents(
        root,
        scenario.recordIds,
        { onPhase: scenario.onPhase },
        scenario.integrationRoot ?? root,
      ),
    );
    const item = result.items[0];
    assert.equal(item.code, 'BRANCH_RETAINED', `${reason}: ${JSON.stringify(result)}`);
    assert.equal(item.branch.reason, reason, `${reason}: ${JSON.stringify(item)}`);
    assert.ok(branchExists(root, scenario.branch), `${reason} keeps the branch`);
    assert.equal(existsSync(wf.recordFile(root, 'c1')), false, `${reason} deletes the record`);
  }
});

// ---------------------------------------------------------------------------------------------
// Legacy guards through cleanup plan and cleanup apply

const MIGRATE_OWNER = Object.freeze({ workflow: 'cleanup' });

async function migrateLegacy(root) {
  wf.expectOk(
    await wf.call('memory migrate-directory', { cwd: root, owner: MIGRATE_OWNER, waitSeconds: 0 }),
  );
}

function legacyFiles(root, name, files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, name, relative);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }
}

async function cleanupPlan(root, decisions) {
  return wf.expectOk(
    await wf.call('cleanup plan', {
      cwd: root,
      executionRoot: root,
      ...(decisions ? { decisions } : {}),
    }),
  );
}

function blockedCodes(planned, itemId) {
  const item = planned.blocked.find((entry) => entry.itemId === itemId);
  assert.ok(item, `${itemId} is blocked: ${JSON.stringify(planned)}`);
  return item.failures.map((failure) => failure.code);
}

function apply(root, planned, itemIds, decisions, extra) {
  return wf.call(
    'cleanup apply',
    {
      cwd: root,
      executionRoot: root,
      ...(decisions ? { decisions } : {}),
      items: Object.fromEntries(
        planned.items
          .filter((item) => itemIds.includes(item.itemId))
          .map((item) => [item.itemId, item.itemDigest]),
      ),
    },
    extra,
  );
}

// A migrated `.firmo/` with a symlink inside that points at a file outside it.
async function migratedFirmo(t) {
  const root = wf.repository(t);
  legacyFiles(root, '.firmo', { 'cache.json': '{"a":1}\n', 'review/a.md': 'report\n' });
  writeFileSync(join(root, 'outside.txt'), 'outside\n');
  symlinkSync(join(root, 'outside.txt'), join(root, '.firmo', 'link.txt'));
  await migrateLegacy(root);
  return root;
}

// Invariant: a migrated `.firmo/` whose open entries (here a symlink) are discarded is deleted
// through its digested listing; the symlink is unlinked and its target untouched.
test('legacy guard: a migrated .firmo with a symlink is removed once its open entries are discarded', async (t) => {
  const root = await migratedFirmo(t);
  const open = await cleanupPlan(root);
  assert.deepEqual(blockedCodes(open, 'legacy:.firmo'), ['CARRY_OVER_OPEN']);
  const decisions = { discardAll: ['.firmo'] };
  const planned = await cleanupPlan(root, decisions);
  const item = planned.items.find((entry) => entry.itemId === 'legacy:.firmo');
  assert.equal(item.carryOver.carried, 2);
  assert.deepEqual(
    item.carryOver.discarded.map((entry) => entry.path),
    ['.firmo/link.txt'],
  );
  const result = wf.expectOk(await apply(root, planned, ['legacy:.firmo'], decisions));
  assert.equal(result.items[0].ok, true, JSON.stringify(result));
  assert.equal(existsSync(join(root, '.firmo')), false);
  assert.equal(readFileSync(join(root, 'outside.txt'), 'utf8'), 'outside\n');
  assert.equal(readFileSync(join(root, '.effective-flow', 'cache.json'), 'utf8'), '{"a":1}\n');
});

// Invariant: changed decisions or a new file after the dry run refuse the selection with
// PREVIEW_MISMATCH and remove nothing.
test('legacy guard: changed decisions or a new file are PREVIEW_MISMATCH', async (t) => {
  const root = await migratedFirmo(t);
  const planned = await cleanupPlan(root, { discardAll: ['.firmo'] });
  const changedDecisions = wf.expectOutcome(
    await apply(root, planned, ['legacy:.firmo'], { discard: ['.firmo/link.txt'] }),
    'PREVIEW_MISMATCH',
  );
  assert.equal(changedDecisions.itemId, 'legacy:.firmo');
  writeFileSync(join(root, '.firmo', 'new.txt'), 'new\n');
  wf.expectOutcome(
    await apply(root, planned, ['legacy:.firmo'], { discardAll: ['.firmo'] }),
    'PREVIEW_MISMATCH',
  );
  assert.ok(existsSync(join(root, '.firmo', 'cache.json')));
});

// Invariant: each refusal of the legacyRuntimeDirectory class holds alone.
test('legacy guard: missing marker, other-source marker, open carry-over, nested .git, tracked content and a symlinked name refuse', async (t) => {
  const missing = wf.repository(t);
  legacyFiles(missing, '.firmo', { 'cache.json': '{}\n' });
  assert.deepEqual(
    blockedCodes(await cleanupPlan(missing, { discardAll: ['.firmo'] }), 'legacy:.firmo'),
    ['LEGACY_UNMIGRATED'],
  );

  const twoRun = wf.repository(t);
  legacyFiles(twoRun, '.firmo', { 'cache.json': '{}\n' });
  legacyFiles(twoRun, '.sf-plugin', { 'old.txt': 'old\n' });
  await migrateLegacy(twoRun);
  rmSync(join(twoRun, '.firmo'), { recursive: true });
  assert.deepEqual(
    blockedCodes(await cleanupPlan(twoRun, { discardAll: ['.sf-plugin'] }), 'legacy:.sf-plugin'),
    ['LEGACY_UNMIGRATED'],
  );

  const open = wf.repository(t);
  legacyFiles(open, '.firmo', { 'cache.json': '{}\n' });
  await migrateLegacy(open);
  writeFileSync(join(open, '.effective-flow', 'cache.json'), '{"changed":true}\n');
  const openPlan = await cleanupPlan(open);
  assert.deepEqual(blockedCodes(openPlan, 'legacy:.firmo'), ['CARRY_OVER_OPEN']);
  assert.deepEqual(
    openPlan.blocked[0].carryOver.open.map((entry) => [entry.path, entry.reason]),
    [['.firmo/cache.json', 'missing-or-different']],
  );

  const nested = wf.repository(t);
  legacyFiles(nested, '.firmo', { 'cache.json': '{}\n', '.worktrees/wt/.git': 'gitdir: x\n' });
  await migrateLegacy(nested);
  const nestedPlan = await cleanupPlan(nested, { discardAll: ['.firmo'] });
  assert.deepEqual(blockedCodes(nestedPlan, 'legacy:.firmo'), ['NOT_ELIGIBLE']);
  assert.equal(nestedPlan.blocked[0].failures[0].reason, 'nested-git');

  const tracked = wf.repository(t);
  legacyFiles(tracked, '.firmo', { 'cache.json': '{}\n' });
  wf.git(tracked, 'add', '-f', '.firmo/cache.json');
  wf.git(tracked, 'commit', '-q', '-m', 'tracked legacy');
  await migrateLegacy(tracked);
  assert.deepEqual(blockedCodes(await cleanupPlan(tracked), 'legacy:.firmo'), ['LEGACY_TRACKED']);

  const linked = wf.repository(t);
  legacyFiles(linked, 'real-dir', { 'cache.json': '{}\n' });
  symlinkSync(join(linked, 'real-dir'), join(linked, '.firmo'));
  await migrateLegacy(linked);
  assert.deepEqual(
    blockedCodes(await cleanupPlan(linked, { discardAll: ['.firmo'] }), 'legacy:.firmo'),
    ['UNSAFE_TARGET'],
  );
  assert.ok(existsSync(join(linked, 'real-dir', 'cache.json')));
});

// Invariant: a legacy directory is blocked by a `.git` entry or a porcelain-registered worktree
// anywhere in it, not only below its `.worktrees/`, and nothing in it is removed.
test('legacy guard: a .git entry or a registered worktree outside .worktrees blocks the directory', async (t) => {
  const nested = wf.repository(t);
  legacyFiles(nested, '.firmo', { 'cache.json': '{}\n' });
  await migrateLegacy(nested);
  legacyFiles(nested, '.firmo', { 'vendor/repo/.git': 'gitdir: elsewhere\n' });
  const nestedPlan = await cleanupPlan(nested, { discardAll: ['.firmo'] });
  const nestedItem = nestedPlan.blocked.find((entry) => entry.itemId === 'legacy:.firmo');
  assert.deepEqual(
    nestedItem?.failures.map(({ code, reason, paths }) => [code, reason, paths]),
    [['NOT_ELIGIBLE', 'nested-git', ['vendor/repo/.git']]],
    JSON.stringify(nestedPlan),
  );

  // A registered worktree whose `.git` file is gone is found through the porcelain list alone.
  const registered = wf.repository(t);
  legacyFiles(registered, '.firmo', { 'cache.json': '{}\n' });
  await migrateLegacy(registered);
  const checkout = join(registered, '.firmo', 'checkout');
  wf.git(registered, 'worktree', 'add', '-q', '-b', 'legacy-checkout', checkout, 'HEAD');
  rmSync(join(checkout, '.git'));
  const registeredPlan = await cleanupPlan(registered, { discardAll: ['.firmo'] });
  const registeredItem = registeredPlan.blocked.find((entry) => entry.itemId === 'legacy:.firmo');
  assert.ok(registeredItem, JSON.stringify(registeredPlan));
  const failure = registeredItem.failures.find((entry) => entry.reason === 'registered-worktree');
  assert.ok(failure, JSON.stringify(registeredItem));
  assert.deepEqual(
    failure.registrations.map((entry) => entry.path),
    [realpathSync(checkout)],
  );
  assert.ok(existsSync(join(checkout, 'base.txt')), 'nothing below the directory was removed');
});

// Rewrites the migration marker into its pre-`source` shape, as markers written before the marker
// stored its source look.
function dropMarkerSource(root) {
  const target = join(root, '.effective-flow', 'memory.json');
  const memory = JSON.parse(readFileSync(target, 'utf8'));
  assert.equal(memory.runtimeMigration.directory.source, '.firmo', JSON.stringify(memory));
  delete memory.runtimeMigration.directory.source;
  writeFileSync(target, `${JSON.stringify(memory, null, 2)}\n`);
}

// Invariant: a legacy marker (no `source` key) certifies a legacy directory only through a
// carry-over proof with zero open entries after decisions, and the item says `legacyMarker: true`.
test('legacy guard: a legacy marker certifies only a fully carried or discarded directory', async (t) => {
  const carried = wf.repository(t);
  legacyFiles(carried, '.firmo', { 'cache.json': '{"a":1}\n', 'review/a.md': 'report\n' });
  await migrateLegacy(carried);
  dropMarkerSource(carried);
  const planned = await cleanupPlan(carried);
  const item = planned.items.find((entry) => entry.itemId === 'legacy:.firmo');
  assert.ok(item, JSON.stringify(planned));
  assert.equal(item.legacyMarker, true);
  assert.deepEqual(item.carryOver.open, []);
  const result = wf.expectOk(await apply(carried, planned, ['legacy:.firmo']));
  assert.equal(result.items[0].ok, true, JSON.stringify(result));
  assert.equal(existsSync(join(carried, '.firmo')), false);

  const open = wf.repository(t);
  legacyFiles(open, '.firmo', { 'cache.json': '{}\n' });
  await migrateLegacy(open);
  dropMarkerSource(open);
  writeFileSync(join(open, '.effective-flow', 'cache.json'), '{"changed":true}\n');
  const openPlan = await cleanupPlan(open);
  assert.deepEqual(blockedCodes(openPlan, 'legacy:.firmo'), ['CARRY_OVER_OPEN']);
  assert.equal(openPlan.blocked[0].legacyMarker, true);

  const unmigrated = wf.repository(t);
  legacyFiles(unmigrated, '.firmo', { 'cache.json': '{}\n' });
  legacyFiles(unmigrated, '.sf-plugin', { 'old.txt': 'old\n', 'memory.json': '{}\n' });
  await migrateLegacy(unmigrated);
  rmSync(join(unmigrated, '.firmo'), { recursive: true });
  dropMarkerSource(unmigrated);
  const unmigratedPlan = await cleanupPlan(unmigrated);
  assert.deepEqual(blockedCodes(unmigratedPlan, 'legacy:.sf-plugin'), ['CARRY_OVER_OPEN']);
  assert.deepEqual(unmigratedPlan.blocked[0].carryOver.open.map((entry) => entry.path).sort(), [
    '.sf-plugin/memory.json',
    '.sf-plugin/old.txt',
  ]);
  const decisions = { discardAll: ['.sf-plugin'] };
  const discarded = await cleanupPlan(unmigrated, decisions);
  assert.ok(
    discarded.items.some((entry) => entry.itemId === 'legacy:.sf-plugin'),
    JSON.stringify(discarded),
  );
});

// Invariant: a chain swapped and an entry added during the removal stop that item (UNSAFE_TARGET,
// LEGACY_CHANGED) with the partial state reported; a symlink in the swapped chain is never followed.
test('legacy guard: a chain swapped or an entry added mid-walk stops the item', async (t) => {
  const swapped = await migratedFirmo(t);
  const decisions = { discardAll: ['.firmo'] };
  let planned = await cleanupPlan(swapped, decisions);
  const decoy = join(swapped, 'decoy');
  legacyFiles(swapped, 'decoy', { 'a.md': 'report\n' });
  const swap = wf.expectOk(
    await apply(swapped, planned, ['legacy:.firmo'], decisions, {
      onLegacyEntry: (relative) => {
        if (relative !== 'review/a.md') return;
        renameSync(join(swapped, '.firmo', 'review'), join(swapped, 'moved-review'));
        symlinkSync(decoy, join(swapped, '.firmo', 'review'));
      },
    }),
  );
  assert.equal(swap.items[0].code, 'UNSAFE_TARGET', JSON.stringify(swap));
  assert.equal(swap.items[0].stoppedAt, 'review/a.md');
  assert.equal(readFileSync(join(decoy, 'a.md'), 'utf8'), 'report\n');

  const added = await migratedFirmo(t);
  planned = await cleanupPlan(added, decisions);
  const grow = wf.expectOk(
    await apply(added, planned, ['legacy:.firmo'], decisions, {
      onLegacyEntry: (relative) => {
        if (relative === 'review') writeFileSync(join(added, '.firmo', 'review', 'new.txt'), 'x\n');
      },
    }),
  );
  assert.equal(grow.items[0].code, 'LEGACY_CHANGED', JSON.stringify(grow));
  assert.equal(grow.items[0].stoppedAt, 'review');
  assert.ok(grow.items[0].removedEntries >= 1);
  assert.ok(existsSync(join(added, '.firmo', 'review', 'new.txt')));
});

function setupAdr(root) {
  writeFileSync(
    join(root, 'AGENTS.md'),
    '# Agents\n\n**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md\n',
  );
  mkdirSync(join(root, 'docs', 'adr'), { recursive: true });
  writeFileSync(
    join(root, 'docs', 'adr', 'effective-flow-project-setup.md'),
    '# Effective Flow project setup\n\n## Configuration\n\n| Key | Value |\n| --- | --- |\n| worktree.enabled | true |\n',
  );
}

// Invariant: the transitional `.effective-flow/config.json` is removable only when the locator
// resolves at steps 0 to 2 (it is not the live configuration) and a decision marks it complete or
// discarded.
test('legacy guard: legacyConfigFile needs a project-setup ADR and a decision', async (t) => {
  const root = wf.repository(t);
  mkdirSync(join(root, '.effective-flow'));
  writeFileSync(join(root, '.effective-flow', 'config.json'), '{"worktree":{"enabled":true}}\n');
  const live = await cleanupPlan(root, {
    config: { '.effective-flow/config.json': 'discarded' },
  });
  const liveItem = live.blocked.find(
    (item) => item.itemId === 'config:.effective-flow/config.json',
  );
  assert.equal(live.locatorStep, 3);
  assert.deepEqual(
    liveItem.failures.map((failure) => [failure.code, failure.reason]),
    [['NOT_ELIGIBLE', 'live-configuration']],
  );
  setupAdr(root);
  const undecided = await cleanupPlan(root);
  assert.ok([0, 1, 2].includes(undecided.locatorStep), String(undecided.locatorStep));
  assert.deepEqual(blockedCodes(undecided, 'config:.effective-flow/config.json'), [
    'CARRY_OVER_OPEN',
  ]);
  const decisions = { config: { '.effective-flow/config.json': 'complete' } };
  const planned = await cleanupPlan(root, decisions);
  const result = wf.expectOk(
    await apply(root, planned, ['config:.effective-flow/config.json'], decisions),
  );
  assert.equal(result.items[0].ok, true, JSON.stringify(result));
  assert.equal(existsSync(join(root, '.effective-flow', 'config.json')), false);
});

// Invariant: per-item guard errors never stop the other selected items: a legacy item stopped
// mid-walk is reported while a selected worktree item is still removed.
test('cleanup apply: a per-item guard error leaves the other items running', async (t) => {
  const root = await migratedFirmo(t);
  const { record } = await component(root, 'c1');
  const decisions = { discardAll: ['.firmo'] };
  const planned = await cleanupPlan(root, decisions);
  const result = wf.expectOk(
    await apply(root, planned, ['worktree:c1', 'legacy:.firmo'], decisions, {
      onLegacyEntry: (relative) => {
        if (relative === 'review') writeFileSync(join(root, '.firmo', 'review', 'x.txt'), 'x\n');
      },
    }),
  );
  assert.deepEqual(
    result.items.map(({ itemId, ok, code }) => [itemId, ok, code]),
    [
      ['worktree:c1', true, undefined],
      ['legacy:.firmo', false, 'LEGACY_CHANGED'],
    ],
  );
  assert.equal(existsSync(record.worktreePath), false);
});
