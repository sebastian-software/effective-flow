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
import { nonTerminalBuildRunBranches } from '../src/scripts/build-run-core.mjs';
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

test('cleanup preservation: migrated memory must still contain every source value', async (testContext) => {
  const root = wf.repository(testContext);
  const original = { counters: { plan: 7 }, labels: ['a', 'b'] };
  legacyFiles(root, '.firmo', { 'memory.json': `${JSON.stringify(original)}\n` });
  await migrateLegacy(root);
  const migrated = await cleanupPlan(root);
  assert.ok(migrated.items.some((entry) => entry.itemId === 'legacy:.firmo'));
  const { record } = await component(root, 'c1');
  const selected = await cleanupPlan(root);
  legacyFiles(root, '.firmo', {
    'memory.json': `${JSON.stringify({ ...original, counters: { plan: 7, review: 9 } })}\n`,
  });
  const blocked = await cleanupPlan(root);
  assert.deepEqual(blockedCodes(blocked, 'legacy:.firmo'), ['CARRY_OVER_OPEN']);
  assert.equal(blocked.blocked[0].carryOver.open[0].path, '.firmo/memory.json');
  wf.expectOutcome(
    await apply(root, selected, ['worktree:c1', 'legacy:.firmo']),
    'PREVIEW_MISMATCH',
  );
  assert.ok(existsSync(record.worktreePath));
  assert.ok(existsSync(wf.recordFile(root, 'c1')));
  const decisions = { discard: ['.firmo/memory.json'] };
  const discarded = await cleanupPlan(root, decisions);
  const result = wf.expectOk(await apply(root, discarded, ['legacy:.firmo'], decisions));
  assert.equal(result.items[0].ok, true, JSON.stringify(result));
  assert.equal(existsSync(join(root, '.firmo')), false);
});

test('cleanup preservation: target-wins memory conflicts require explicit discard', async (testContext) => {
  const root = wf.repository(testContext);
  legacyFiles(root, '.effective-flow', {
    'memory.json': '{"counters":{"plan":10},"labels":["b","a"]}\n',
  });
  legacyFiles(root, '.firmo', {
    'memory.json': '{"counters":{"plan":7},"labels":["a","b"]}\n',
  });
  await migrateLegacy(root);
  const memory = JSON.parse(readFileSync(join(root, '.effective-flow', 'memory.json'), 'utf8'));
  assert.equal(memory.counters.plan, 10);
  assert.deepEqual(memory.labels, ['b', 'a']);
  assert.deepEqual(blockedCodes(await cleanupPlan(root), 'legacy:.firmo'), ['CARRY_OVER_OPEN']);
  const decisions = { discard: ['.firmo/memory.json'] };
  const planned = await cleanupPlan(root, decisions);
  const result = wf.expectOk(await apply(root, planned, ['legacy:.firmo'], decisions));
  assert.equal(result.items[0].ok, true, JSON.stringify(result));
  assert.equal(existsSync(join(root, '.firmo')), false);
});

test('cleanup preservation: ordinary .worktrees data requires a copy or explicit discard', async (testContext) => {
  for (const discard of [false, true]) {
    const root = wf.repository(testContext);
    legacyFiles(root, '.firmo', { '.worktrees/notes.txt': 'not a Git checkout\n' });
    await migrateLegacy(root);
    assert.deepEqual(blockedCodes(await cleanupPlan(root), 'legacy:.firmo'), ['CARRY_OVER_OPEN']);
    const decisions = discard ? { discard: ['.firmo/.worktrees/notes.txt'] } : undefined;
    if (!discard)
      legacyFiles(root, '.effective-flow', { '.worktrees/notes.txt': 'not a Git checkout\n' });
    const planned = await cleanupPlan(root, decisions);
    const result = wf.expectOk(await apply(root, planned, ['legacy:.firmo'], decisions));
    assert.equal(result.items[0].ok, true, JSON.stringify(result));
    assert.equal(existsSync(join(root, '.firmo')), false);
    if (!discard)
      assert.equal(
        readFileSync(join(root, '.effective-flow', '.worktrees', 'notes.txt'), 'utf8'),
        'not a Git checkout\n',
      );
  }
});

test('cleanup preservation: worktree removal cannot invalidate a later legacy preservation proof', async (testContext) => {
  for (const mutation of ['missing', 'different', 'marker', 'discard']) {
    const root = wf.repository(testContext);
    legacyFiles(root, '.firmo', { 'cache.json': '{"a":1}\n' });
    await migrateLegacy(root);
    const { record } = await component(root, 'c1');
    const decisions = mutation === 'discard' ? { discardAll: ['.firmo'] } : undefined;
    const planned = await cleanupPlan(root, decisions);
    let changed = false;
    const result = wf.expectOk(
      await apply(root, planned, ['worktree:c1', 'legacy:.firmo'], decisions, {
        onPhase: (phase, { recordId }) => {
          if (phase !== 'afterRemove' || recordId !== 'c1') return;
          changed = true;
          if (mutation === 'marker')
            writeFileSync(join(root, '.effective-flow', 'memory.json'), '{}\n');
          else if (mutation === 'different')
            writeFileSync(join(root, '.effective-flow', 'cache.json'), '{"a":2}\n');
          else unlinkSync(join(root, '.effective-flow', 'cache.json'));
        },
      }),
    );
    assert.equal(changed, true);
    assert.equal(result.items[0].ok, true, JSON.stringify(result));
    assert.equal(result.items[0].removed, true);
    assert.equal(existsSync(record.worktreePath), false);
    assert.equal(existsSync(wf.recordFile(root, 'c1')), false);
    if (mutation === 'discard') {
      assert.equal(result.items[1].ok, true, JSON.stringify(result));
      assert.equal(existsSync(join(root, '.firmo')), false);
    } else {
      assert.equal(result.items[1].ok, false, `${mutation}: ${JSON.stringify(result)}`);
      assert.equal(result.items[1].code, 'LEGACY_CHANGED');
      assert.equal(result.items[1].removedEntries, 0);
      assert.equal(
        result.items[1].failures[0].code,
        mutation === 'marker' ? 'LEGACY_UNMIGRATED' : 'CARRY_OVER_OPEN',
      );
      assert.equal(readFileSync(join(root, '.firmo', 'cache.json'), 'utf8'), '{"a":1}\n');
    }
  }
});

test('cleanup preservation: a configuration made live by earlier removal is never discarded', async (testContext) => {
  for (const kind of ['legacy', 'config']) {
    const root = wf.repository(testContext);
    legacyFiles(root, '.firmo', { 'config.json': '{"worktree":{"enabled":true}}\n' });
    await migrateLegacy(root);
    setupAdr(root);
    const { record } = await component(root, 'c1');
    const decisions = {
      discardAll: ['.firmo'],
      config: { '.firmo/config.json': 'discarded', '.effective-flow/config.json': 'discarded' },
    };
    const itemId = kind === 'legacy' ? 'legacy:.firmo' : 'config:.effective-flow/config.json';
    const planned = await cleanupPlan(root, decisions);
    const result = wf.expectOk(
      await apply(root, planned, ['worktree:c1', itemId], decisions, {
        onPhase: (phase) => {
          if (phase === 'afterRemove')
            unlinkSync(join(root, 'docs', 'adr', 'effective-flow-project-setup.md'));
        },
      }),
    );
    assert.equal(result.items[0].ok, true, JSON.stringify(result));
    assert.equal(existsSync(record.worktreePath), false);
    assert.equal(result.items[1].code, 'LEGACY_CHANGED', JSON.stringify(result));
    assert.equal(result.items[1].removedEntries, 0);
    assert.equal(
      kind === 'legacy'
        ? result.items[1].failures[0].open[0].reason
        : result.items[1].failures[0].reason,
      'live-configuration',
    );
    assert.ok(
      existsSync(join(root, kind === 'legacy' ? '.firmo' : '.effective-flow', 'config.json')),
    );
  }
});

test('cleanup preservation: each source rechecks surviving copies after earlier entries are removed', async (testContext) => {
  const root = wf.repository(testContext);
  legacyFiles(root, '.firmo', { 'z.txt': 'first\n', 'a.txt': 'retain me\n' });
  await migrateLegacy(root);
  const planned = await cleanupPlan(root);
  const result = wf.expectOk(
    await apply(root, planned, ['legacy:.firmo'], undefined, {
      onLegacyEntry: (relative) => {
        if (relative !== 'a.txt') return;
        assert.equal(existsSync(join(root, '.firmo', 'z.txt')), false);
        unlinkSync(join(root, '.effective-flow', 'a.txt'));
      },
    }),
  );
  assert.equal(result.items[0].code, 'LEGACY_CHANGED', JSON.stringify(result));
  assert.equal(result.items[0].removedEntries, 1);
  assert.equal(result.items[0].stoppedAt, 'a.txt');
  assert.equal(result.items[0].failures[0].code, 'CARRY_OVER_OPEN');
  assert.equal(readFileSync(join(root, '.firmo', 'a.txt'), 'utf8'), 'retain me\n');
  assert.equal(readFileSync(join(root, '.effective-flow', 'z.txt'), 'utf8'), 'first\n');
});

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

// ---------------------------------------------------------------------------------------------
// The `branch:` class of cleanup plan and cleanup apply

async function cleanupPlanOf(root, extra) {
  return wf.expectOk(await wf.call('cleanup plan', { cwd: root, executionRoot: root }, extra));
}

function branchItem(planned, branch) {
  return planned.items.find((item) => item.itemId === `branch:${branch}`);
}

function retainedOf(planned) {
  return Object.fromEntries(planned.retainedBranches.map((entry) => [entry.branch, entry.reason]));
}

async function applyBranches(root, items, extra) {
  return wf.call(
    'cleanup apply',
    {
      cwd: root,
      executionRoot: root,
      items: Object.fromEntries(items.map((item) => [item.itemId, wf.applyValue(item)])),
    },
    extra,
  );
}

// A repository whose `main` squash-merged `effective-flow/build/landed`, so `origin/main` holds its
// content as one commit; returns the branch's tip and the squash commit.
function squashMerged(t) {
  const root = wf.repository(t);
  const branch = 'effective-flow/build/landed';
  const tip = wf.commitOnBranch(root, branch, { 'feature.txt': 'feature\n' });
  wf.commitOnBranch(root, branch, { 'feature.txt': 'feature\nmore\n' }, { message: 'more' });
  const squash = wf.squashIntoMain(root, branch);
  wf.publishMain(root);
  return { root, branch, tip: wf.git(root, 'rev-parse', branch), first: tip, squash };
}

// Invariant: a squash-merged orphan delivery branch is offered as a `branch:` item with its proof,
// and `cleanup apply` deletes it by compare-and-delete with its restore line; nothing else changes.
test('cleanup branch: a squash-merged orphan branch is proven, offered and deleted', async (t) => {
  const { root, branch, tip } = squashMerged(t);
  const base = wf.git(root, 'rev-parse', 'main');
  const planned = await cleanupPlanOf(root);
  const item = branchItem(planned, branch);
  assert.ok(item, JSON.stringify(planned.retainedBranches));
  assert.deepEqual(
    [item.proof, item.proofCommit, item.source, item.dependsOn, item.tip, item.baseRef],
    ['tip-tree', base, 'orphan', null, tip, 'main'],
  );
  assert.equal(planned.branchProof.baseCommit, base);
  const { runner, calls } = recordingRunner();
  const result = wf.expectOk(await applyBranches(root, [item], { runner }));
  assert.deepEqual(
    [result.items[0].ok, result.items[0].deleted, result.items[0].restore],
    [true, true, `git branch '${branch}' ${tip}`],
    JSON.stringify(result),
  );
  assert.equal(branchExists(root, branch), false);
  assert.ok(!calls.some((args) => args.includes('fetch') || args.includes('push')));
  assert.ok(!calls.some((args) => args[0] === 'branch'), 'never git branch -D');
  assert.equal(wf.git(root, 'rev-parse', 'refs/remotes/origin/main'), base);
});

function recordingRunner() {
  const real = createProcessRunner();
  const calls = [];
  return {
    calls,
    runner: async (request) => {
      calls.push(request.args.slice(2).filter((arg) => arg !== '--no-replace-objects'));
      return real(request);
    },
  };
}

// Invariant: a zero-commit branch is proven `ancestor`; a branch with commits the base lacks, an
// unsafe name, a checked-out branch, a branch outside the prefix and the base branch itself are
// never offered; each retained branch under the prefix carries exactly one reason, and an
// unproven one the fetch hint.
test('cleanup branch: unproven and excluded branches are retained with one reason', async (t) => {
  const root = wf.repository(t);
  wf.git(root, 'branch', 'effective-flow/build/zero');
  wf.commitOnBranch(root, 'effective-flow/build/open', { 'open.txt': 'open\n' });
  wf.git(root, 'branch', 'effective-flow/fix(x)');
  wf.git(root, 'branch', 'user/own-work');
  const held = join(root, '.effective-flow', 'held');
  wf.git(root, 'worktree', 'add', '-q', '-b', 'effective-flow/build/held', held);
  wf.publishMain(root);
  const planned = await cleanupPlanOf(root);
  assert.deepEqual(
    planned.items.filter((item) => item.kind === 'branch').map((item) => [item.branch, item.proof]),
    [['effective-flow/build/zero', 'ancestor']],
  );
  assert.deepEqual(retainedOf(planned), {
    'effective-flow/build/held': 'checked-out',
    'effective-flow/build/open': 'not-proven',
    'effective-flow/fix(x)': 'unsafe-name',
  });
  const open = planned.retainedBranches.find((entry) => entry.reason === 'not-proven');
  assert.equal(open.fetchHint, 'git fetch origin main');
});

// Invariant: a record-bound branch is offered only together with its actionable worktree item and
// is deleted only after that item removed the worktree in the same call; selected alone it is kept
// as `worktree-not-removed`.
test('cleanup branch: a record-bound branch follows its worktree item', async (t) => {
  const root = wf.repository(t);
  const { record } = await wf.initialized(root);
  await wf.moveTo(root, record, 'cleanup-ready');
  wf.publishMain(root);
  const planned = await cleanupPlanOf(root);
  const item = branchItem(planned, record.branch);
  assert.deepEqual(
    [item?.source, item?.dependsOn, item?.proof],
    ['record', `worktree:${record.recordId}`, 'ancestor'],
    JSON.stringify(planned),
  );
  const alone = wf.expectOk(await applyBranches(root, [item]));
  assert.deepEqual(
    [alone.items[0].code, alone.items[0].reason],
    ['BRANCH_RETAINED', 'worktree-not-removed'],
  );
  assert.ok(branchExists(root, record.branch));
  const both = wf.expectOk(
    await applyBranches(root, [planned.items.find((entry) => entry.kind === 'worktree'), item]),
  );
  assert.deepEqual(
    both.items.map((entry) => [entry.itemId, entry.ok]),
    [
      [`worktree:${record.recordId}`, true],
      [`branch:${record.branch}`, true],
    ],
    JSON.stringify(both),
  );
  assert.equal(branchExists(root, record.branch), false);
});

// Invariant: a record that is not actionable binds its branch (`recorded`), and so does a
// non-terminal build run; an unparsable record file suppresses every orphan item
// (`record-unreadable`) while a terminal build run binds nothing.
test('cleanup branch: records and build runs bind branches, unreadable records suppress orphans', async (t) => {
  const root = wf.repository(t);
  const { record } = await wf.initialized(root);
  wf.git(root, 'branch', 'effective-flow/build/run-bound');
  wf.git(root, 'branch', 'effective-flow/build/finished');
  const head = wf.git(root, 'rev-parse', 'main');
  wf.writeBuildRun(root, 'run-1', { branch: 'effective-flow/build/run-bound', head });
  wf.writeBuildRun(root, 'run-2', {
    branch: 'effective-flow/build/finished',
    head,
    terminal: true,
  });
  wf.publishMain(root);
  const planned = await cleanupPlanOf(root);
  assert.equal(retainedOf(planned)[record.branch], 'recorded');
  assert.equal(retainedOf(planned)['effective-flow/build/run-bound'], 'recorded');
  assert.ok(branchItem(planned, 'effective-flow/build/finished'));
  wf.writeRecordFile(root, 'broken', '{not json');
  const suppressed = await cleanupPlanOf(root);
  assert.equal(branchItem(suppressed, 'effective-flow/build/finished'), undefined);
  assert.equal(retainedOf(suppressed)['effective-flow/build/finished'], 'record-unreadable');
});

// Invariant: `cleanup apply` checks a `branch:` value by shape (INVALID_INPUT), resolves
// `proofCommit` (`proof-commit-missing`), re-derives candidacy (an out-of-prefix branch is
// `unknown-item` whatever digest it carries) and the digest over the claimed proof (a forged proof
// is `digest`); every refusal ends the call before any write.
test('cleanup branch: tampered or forged branch values are refused before any write', async (t) => {
  const { root, branch } = squashMerged(t);
  wf.git(root, 'branch', 'user/own-work', 'main');
  const planned = await cleanupPlanOf(root);
  const item = branchItem(planned, branch);
  const value = wf.applyValue(item);
  const apply = (items) => wf.call('cleanup apply', { cwd: root, executionRoot: root, items });
  wf.expectError(await apply({ [item.itemId]: item.itemDigest }), 'INVALID_INPUT');
  wf.expectError(await apply({ [item.itemId]: { ...value, extra: 1 } }), 'INVALID_INPUT');
  wf.expectError(await apply({ [item.itemId]: { ...value, proof: 'forced' } }), 'INVALID_INPUT');
  wf.expectError(await apply({ 'branch:fix(x)': value }), 'INVALID_INPUT');
  const missing = wf.expectOutcome(
    await apply({ [item.itemId]: { ...value, proofCommit: 'f'.repeat(40) } }),
    'PREVIEW_MISMATCH',
  );
  assert.equal(missing.reason, 'proof-commit-missing');
  const forged = wf.expectOutcome(
    await apply({ [item.itemId]: { ...value, proof: 'squash-tree' } }),
    'PREVIEW_MISMATCH',
  );
  assert.equal(forged.reason, 'digest');
  const { branchDigestInput, itemDigest } =
    await import('../src/scripts/effective-flow-state-worktree-core.mjs');
  const outside = {
    branch: 'user/own-work',
    tip: wf.git(root, 'rev-parse', 'user/own-work'),
    baseRef: 'main',
    proof: 'ancestor',
    proofCommit: item.proofCommit,
    source: 'orphan',
    dependsOn: null,
  };
  const selfComputed = wf.expectOutcome(
    await apply({
      'branch:user/own-work': {
        itemDigest: itemDigest(branchDigestInput(outside)),
        proof: 'ancestor',
        proofCommit: item.proofCommit,
      },
    }),
    'PREVIEW_MISMATCH',
  );
  assert.equal(selfComputed.reason, 'unknown-item');
  assert.ok(branchExists(root, branch));
  assert.ok(branchExists(root, 'user/own-work'));
});

// Invariant: the tip moving after the dry run is a whole-call PREVIEW_MISMATCH; a branch checked
// out or recorded between the pre-write pass and its deletion is kept by its own step.
test('cleanup branch: changes after the plan keep the branch', async (t) => {
  const moved = squashMerged(t);
  const movedPlan = await cleanupPlanOf(moved.root);
  wf.commitOnBranch(moved.root, moved.branch, { 'late.txt': 'late\n' });
  const mismatch = wf.expectOutcome(
    await applyBranches(moved.root, [branchItem(movedPlan, moved.branch)]),
    'PREVIEW_MISMATCH',
  );
  assert.equal(mismatch.reason, 'digest');

  const late = squashMerged(t);
  const latePlan = await cleanupPlanOf(late.root);
  const elsewhere = join(late.root, '.effective-flow', 'elsewhere');
  const checkedOut = wf.expectOk(
    await applyBranches(late.root, [branchItem(latePlan, late.branch)], {
      onPhase: (name) => {
        if (name === 'beforeBranchItem')
          wf.git(late.root, 'worktree', 'add', '-q', elsewhere, late.branch);
      },
    }),
  );
  assert.deepEqual(
    [checkedOut.items[0].code, checkedOut.items[0].reason],
    ['BRANCH_RETAINED', 'checked-out'],
  );
  assert.ok(branchExists(late.root, late.branch));

  const recorded = squashMerged(t);
  const recordedPlan = await cleanupPlanOf(recorded.root);
  const head = wf.git(recorded.root, 'rev-parse', 'main');
  const result = wf.expectOk(
    await applyBranches(recorded.root, [branchItem(recordedPlan, recorded.branch)], {
      onPhase: (name) => {
        if (name === 'beforeBranchItem') {
          wf.writeBuildRun(recorded.root, 'run-late', { branch: recorded.branch, head });
        }
      },
    }),
  );
  assert.deepEqual([result.items[0].code, result.items[0].reason], ['BRANCH_RETAINED', 'recorded']);
  assert.ok(branchExists(recorded.root, recorded.branch));
});

// Invariant: a branch a rebase or bisect uses is never offered (`in-use`), and an exhausted plan
// budget retains the remaining candidates as `timeout` without touching the other plan output.
test('cleanup branch: in-use branches and an exhausted proof budget are retained', async (t) => {
  const { root, branch } = squashMerged(t);
  writeFileSync(join(root, '.git', 'BISECT_START'), `${branch}\n`);
  assert.equal(retainedOf(await cleanupPlanOf(root))[branch], 'in-use');
  unlinkSync(join(root, '.git', 'BISECT_START'));
  const exhausted = await cleanupPlanOf(root, { branchProofBudgetMs: 0 });
  assert.equal(retainedOf(exhausted)[branch], 'timeout');
  assert.deepEqual(
    exhausted.items.filter((item) => item.kind === 'branch'),
    [],
  );
});

// Invariant: deleting a branch removes exactly its own `branch.<name>.*` configuration and reports
// the removed entries; a neighbouring branch's section whose name shares the prefix stays.
test('cleanup branch: exactly the deleted branch configuration is removed', async (t) => {
  const { root, branch } = squashMerged(t);
  wf.git(root, 'config', `branch.${branch}.remote`, 'origin');
  wf.git(root, 'config', `branch.${branch}.description`, 'landed work');
  wf.git(root, 'config', `branch.${branch}.x.remote`, 'origin');
  const item = branchItem(await cleanupPlanOf(root), branch);
  const result = wf.expectOk(await applyBranches(root, [item]));
  assert.deepEqual(result.items[0].configRemoved.map((entry) => entry.key).sort(), [
    `branch.${branch}.description`,
    `branch.${branch}.remote`,
  ]);
  assert.equal(wf.git(root, 'config', '--get', `branch.${branch}.x.remote`), 'origin');
});

// ---------------------------------------------------------------------------------------------
// The `branch:` class: delete-time races, in-use signals, candidacy and bounds

const FAILED_GIT = Object.freeze({
  status: 1,
  signal: null,
  stdout: Buffer.alloc(0),
  stderr: Buffer.from('injected failure'),
  timedOut: false,
});

// A runner that answers the Git calls `matches(args)` selects with a failure once `armed()` holds.
function failingRunner(matches, armed) {
  const real = createProcessRunner();
  return (request) => (armed() && matches(request.args) ? FAILED_GIT : real(request));
}

function hasArgs(args, ...needles) {
  return needles.every((needle) => args.includes(needle));
}

function writeUnderGit(root, relative, content = '') {
  const target = join(root, '.git', relative);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, content);
}

async function digestFor(fields) {
  const { branchDigestInput, itemDigest } =
    await import('../src/scripts/effective-flow-state-worktree-core.mjs');
  return itemDigest(branchDigestInput(fields));
}

// A self-consistent apply value a caller could compute alone: the digest over `fields`.
async function selfComputed(root, branch, proof, proofCommit, source = 'orphan') {
  return {
    itemDigest: await digestFor({
      branch,
      tip: wf.git(root, 'rev-parse', `refs/heads/${branch}`),
      baseRef: 'main',
      proof,
      proofCommit,
      source,
      dependsOn: null,
    }),
    proof,
    proofCommit,
  };
}

function applyRaw(root, items, extra) {
  return wf.call('cleanup apply', { cwd: root, executionRoot: root, items }, extra);
}

// Invariant: a worktree that checks the branch out between the delete-time check and the deletion
// gets its ref back at the proven tip (recreated only while absent) and the item is `checked-out`.
test('cleanup branch: a checkout racing the deletion restores the ref and keeps the branch', async (t) => {
  const { root, branch, tip } = squashMerged(t);
  const item = branchItem(await cleanupPlanOf(root), branch);
  const held = join(root, '.effective-flow', 'racing');
  const result = wf.expectOk(
    await applyBranches(root, [item], {
      onPhase: (name) => {
        if (name === 'beforeBranchDelete') wf.git(root, 'worktree', 'add', '-q', held, branch);
      },
    }),
  );
  assert.deepEqual(
    [result.items[0].ok, result.items[0].code, result.items[0].reason],
    [false, 'BRANCH_RETAINED', 'checked-out'],
    JSON.stringify(result),
  );
  assert.equal(wf.git(root, 'rev-parse', `refs/heads/${branch}`), tip);
});

// Invariant: a failed relist after the deletion cannot prove no worktree took the branch, so the
// ref is recreated at the tip (`checked-out`); when that recreate fails too, the item is
// `ref-recreate-failed` carrying the tip and the restore command, and nothing else is claimed.
test('cleanup branch: a failed relist recreates the ref, a failed recreate names the restore command', async (t) => {
  const relist = squashMerged(t);
  let deleted = false;
  const relistItem = branchItem(await cleanupPlanOf(relist.root), relist.branch);
  const relisted = wf.expectOk(
    await applyBranches(relist.root, [relistItem], {
      runner: failingRunner(
        (args) => hasArgs(args, 'worktree', 'list'),
        () => deleted,
      ),
      onPhase: (name) => {
        if (name === 'afterBranchDelete') deleted = true;
      },
    }),
  );
  assert.deepEqual(
    [relisted.items[0].code, relisted.items[0].reason],
    ['BRANCH_RETAINED', 'checked-out'],
    JSON.stringify(relisted),
  );
  assert.equal(wf.git(relist.root, 'rev-parse', `refs/heads/${relist.branch}`), relist.tip);

  const failed = squashMerged(t);
  let armed = false;
  const failedItem = branchItem(await cleanupPlanOf(failed.root), failed.branch);
  const lost = wf.expectOk(
    await applyBranches(failed.root, [failedItem], {
      runner: failingRunner(
        (args) => hasArgs(args, 'worktree', 'list') || hasArgs(args, 'update-ref', ''),
        () => armed,
      ),
      onPhase: (name) => {
        if (name === 'afterBranchDelete') armed = true;
      },
    }),
  );
  assert.deepEqual(
    [lost.items[0].code, lost.items[0].reason, lost.items[0].tip, lost.items[0].restore],
    [
      'BRANCH_RETAINED',
      'ref-recreate-failed',
      failed.tip,
      `git branch '${failed.branch}' ${failed.tip}`,
    ],
    JSON.stringify(lost),
  );
  assert.equal(branchExists(failed.root, failed.branch), false);
});

// Invariant: every file a rebase (`--update-refs` included), a rebase-apply or a bisect writes names
// a branch in use, in the main checkout or a linked worktree, read as a file; an unreadable entry
// puts every branch in use. `cleanup plan` retains such a branch as `in-use`.
test('cleanup branch: rebase, update-refs, rebase-apply and bisect entries mark the branch in-use', async (t) => {
  const { root, branch } = squashMerged(t);
  const linked = join(root, '.effective-flow', 'linked');
  wf.git(root, 'worktree', 'add', '-q', '--detach', linked);
  const linkedId = readdirSync(join(root, '.git', 'worktrees'))[0];
  const signals = {
    'rebase-merge/head-name': `refs/heads/${branch}\n`,
    'rebase-merge/update-refs': `refs/heads/other\nrefs/heads/${branch}\n`,
    'rebase-apply/head-name': `refs/heads/${branch}\n`,
    BISECT_START: `${branch}\n`,
    [`worktrees/${linkedId}/BISECT_START`]: `${branch}\n`,
    [`worktrees/${linkedId}/rebase-merge/update-refs`]: `refs/heads/${branch}\n`,
  };
  for (const [file, content] of Object.entries(signals)) {
    writeUnderGit(root, file, content);
    assert.equal(retainedOf(await cleanupPlanOf(root))[branch], 'in-use', file);
    unlinkSync(join(root, '.git', file));
  }
  assert.ok(branchItem(await cleanupPlanOf(root), branch), 'no signal left, offered again');
  // A signal naming another branch leaves this one alone.
  writeUnderGit(root, 'rebase-merge/update-refs', 'refs/heads/unrelated\n');
  assert.ok(branchItem(await cleanupPlanOf(root), branch));
  unlinkSync(join(root, '.git', 'rebase-merge', 'update-refs'));
  // An entry that exists but is not a readable regular file counts as in use for every branch.
  mkdirSync(join(root, '.git', 'rebase-merge', 'head-name'), { recursive: true });
  assert.equal(retainedOf(await cleanupPlanOf(root))[branch], 'in-use');
});

// Invariant: the in-use scan runs again in the item's own step, so a rebase (`--update-refs`) that
// starts after the dry run keeps the branch (`in-use`).
test('cleanup branch: a rebase starting after the plan keeps the branch at delete time', async (t) => {
  const { root, branch } = squashMerged(t);
  const item = branchItem(await cleanupPlanOf(root), branch);
  const result = wf.expectOk(
    await applyBranches(root, [item], {
      onPhase: (name) => {
        if (name === 'beforeBranchItem') {
          writeUnderGit(root, 'rebase-merge/update-refs', `refs/heads/${branch}\n`);
        }
      },
    }),
  );
  assert.deepEqual([result.items[0].code, result.items[0].reason], ['BRANCH_RETAINED', 'in-use']);
  assert.ok(branchExists(root, branch));
});

// Invariant: a denied write probe in the ref directory or its reflog directory ends only that item
// as SANDBOX_DENIED with the branch and every probe file left untouched.
test('cleanup branch: a denied ref directory is SANDBOX_DENIED for the item and touches nothing', async (t) => {
  for (const area of ['refs/heads', 'logs/refs/heads']) {
    const { root, branch } = squashMerged(t);
    assert.ok(existsSync(join(root, '.git', area, 'effective-flow')), `${area} exists`);
    const item = branchItem(await cleanupPlanOf(root), branch);
    const fs = {
      open: async (target, ...rest) => {
        if (target.includes(`/.git/${area}/`) && target.includes('.effective-flow-probe-')) {
          throw Object.assign(new Error('denied'), { code: 'EPERM' });
        }
        return openPath(target, ...rest);
      },
    };
    const result = wf.expectOk(await applyBranches(root, [item], { fs }));
    assert.deepEqual(
      [result.items[0].code, result.items[0].errno, result.items[0].directory.includes(area)],
      ['SANDBOX_DENIED', 'EPERM', true],
      `${area}: ${JSON.stringify(result)}`,
    );
    assert.ok(branchExists(root, branch));
  }
});

// Invariant: grafts and a shallow boundary that appear after the dry run are re-checked in the
// item's own step; either keeps the branch (`grafts`, `shallow-repository`).
test('cleanup branch: grafts or a shallow boundary added after the plan keep the branch', async (t) => {
  const grafted = squashMerged(t);
  const graftedItem = branchItem(await cleanupPlanOf(grafted.root), grafted.branch);
  const graftResult = wf.expectOk(
    await applyBranches(grafted.root, [graftedItem], {
      onPhase: (name) => {
        if (name === 'beforeBranchItem') writeUnderGit(grafted.root, 'info/grafts', '');
      },
    }),
  );
  assert.deepEqual(
    [graftResult.items[0].code, graftResult.items[0].reason],
    ['BRANCH_RETAINED', 'grafts'],
  );
  assert.ok(branchExists(grafted.root, grafted.branch));

  const shallow = squashMerged(t);
  const shallowItem = branchItem(await cleanupPlanOf(shallow.root), shallow.branch);
  const shallowResult = wf.expectOk(
    await applyBranches(shallow.root, [shallowItem], {
      onPhase: (name) => {
        if (name === 'beforeBranchItem') {
          writeUnderGit(shallow.root, 'shallow', `${wf.git(shallow.root, 'rev-parse', 'main')}\n`);
        }
      },
    }),
  );
  assert.deepEqual(
    [shallowResult.items[0].code, shallowResult.items[0].reason],
    ['BRANCH_RETAINED', 'shallow-repository'],
  );
  assert.ok(branchExists(shallow.root, shallow.branch));
});

// Invariant: a merge attribute added after the dry run is caught by the delete-time attribute
// pre-check before any merge runs; the branch stays (`merge-attribute`).
test('cleanup branch: a merge attribute added after the plan keeps the branch', async (t) => {
  const { root, branch } = squashMerged(t);
  const item = branchItem(await cleanupPlanOf(root), branch);
  const result = wf.expectOk(
    await applyBranches(root, [item], {
      onPhase: (name) => {
        if (name === 'beforeBranchItem') {
          writeFileSync(join(root, '.gitattributes'), 'feature.txt merge=ours\n');
        }
      },
    }),
  );
  assert.deepEqual(
    [result.items[0].code, result.items[0].reason],
    ['BRANCH_RETAINED', 'merge-attribute'],
    JSON.stringify(result),
  );
  assert.ok(branchExists(root, branch));
});

// Invariant: a branch item value is checked by shape alone before anything is read: a missing
// key, a null or array value, a short, upper-case or non-string proofCommit and a malformed
// itemDigest are each INVALID_INPUT.
test('cleanup branch: malformed branch values are INVALID_INPUT', async (t) => {
  const { root, branch } = squashMerged(t);
  const value = wf.applyValue(branchItem(await cleanupPlanOf(root), branch));
  const id = `branch:${branch}`;
  const { proofCommit, ...withoutCommit } = value;
  const malformed = [
    withoutCommit,
    null,
    [value.itemDigest, value.proof, value.proofCommit],
    { ...value, proofCommit: proofCommit.slice(0, 12) },
    { ...value, proofCommit: proofCommit.toUpperCase() },
    { ...value, proofCommit: 7 },
    { ...value, itemDigest: value.itemDigest.toUpperCase() },
    { ...value, itemDigest: 'a'.repeat(63) },
    { ...value, proof: undefined },
  ];
  for (const bad of malformed) {
    wf.expectError(await applyRaw(root, { [id]: bad }), 'INVALID_INPUT');
  }
  for (const name of ['fix(x)', 'a b', '-x', 'a//b', 'x/../y']) {
    wf.expectError(await applyRaw(root, { [`branch:${name}`]: value }), 'INVALID_INPUT');
  }
  assert.ok(branchExists(root, branch));
});

// Invariant: `requireItems` bounds the call: at most MAX_BRANCH_ITEMS branch items, and the total
// cap is MAX_RECORD_IDS + 3 + MAX_BRANCH_ITEMS, which a full selection of every class still meets.
test('cleanup branch: the apply cap counts branch items beside records and the legacy items', async (t) => {
  const { MAX_BRANCH_ITEMS, MAX_RECORD_IDS } =
    await import('../src/scripts/effective-flow-state-worktree-core.mjs');
  assert.deepEqual([MAX_BRANCH_ITEMS, MAX_RECORD_IDS], [32, 64]);
  const root = wf.repository(t);
  const digest = createHash('sha256').update('x').digest('hex');
  const value = { itemDigest: digest, proof: 'ancestor', proofCommit: 'b'.repeat(40) };
  const branches = (count) =>
    Object.fromEntries(
      Array.from({ length: count }, (_, index) => [`branch:effective-flow/b${index}`, value]),
    );
  wf.expectError(await applyRaw(root, branches(MAX_BRANCH_ITEMS + 1)), 'INVALID_INPUT');
  const full = {
    ...branches(MAX_BRANCH_ITEMS),
    ...Object.fromEntries(
      Array.from({ length: MAX_RECORD_IDS }, (_, index) => [`worktree:r${index}`, digest]),
    ),
    'legacy:.firmo': digest,
    'legacy:.sf-plugin': digest,
    'config:.effective-flow/config.json': digest,
  };
  assert.equal(Object.keys(full).length, MAX_RECORD_IDS + 3 + MAX_BRANCH_ITEMS);
  const envelope = await applyRaw(root, full);
  assert.notEqual(envelope.error?.code, 'INVALID_INPUT', JSON.stringify(envelope));
  wf.expectError(
    await applyRaw(root, { ...full, [`worktree:r${MAX_RECORD_IDS}`]: digest }),
    'INVALID_INPUT',
  );
});

// Invariant: an apply value computed from scratch cannot widen what the proof allows: a net-zero
// branch with a forged `tip-tree`, an unproven branch with a forged `ancestor`, `tip-tree` or
// `squash-tree` value passes the shape and digest checks and is still kept by the delete-time proof.
test('cleanup branch: forged proof claims with a self-computed digest are retained, never deleted', async (t) => {
  const root = wf.repository(t);
  wf.commitOnBranch(root, 'effective-flow/build/netzero', { 'base.txt': 'changed\n' });
  wf.commitOnBranch(root, 'effective-flow/build/netzero', { 'base.txt': 'base\n' });
  wf.commitOnBranch(root, 'effective-flow/build/open', { 'open.txt': 'open\n' });
  wf.commitOnBranch(root, 'main', { 'second.txt': 'second\n' });
  const base = wf.publishMain(root);
  const planned = await cleanupPlanOf(root);
  assert.deepEqual(
    planned.items.filter((item) => item.kind === 'branch'),
    [],
  );
  assert.equal(retainedOf(planned)['effective-flow/build/netzero'], 'empty-diff');
  assert.equal(retainedOf(planned)['effective-flow/build/open'], 'not-proven');
  const forged = [
    ['effective-flow/build/netzero', 'tip-tree', base, 'empty-diff'],
    ['effective-flow/build/open', 'ancestor', base, 'not-proven'],
    ['effective-flow/build/open', 'tip-tree', base, 'not-proven'],
    ['effective-flow/build/open', 'squash-tree', base, 'not-proven'],
  ];
  for (const [branch, proof, proofCommit, reason] of forged) {
    const result = wf.expectOk(
      await applyRaw(root, {
        [`branch:${branch}`]: await selfComputed(root, branch, proof, proofCommit),
      }),
    );
    assert.deepEqual(
      [result.items[0].code, result.items[0].reason],
      ['BRANCH_RETAINED', reason],
      `${branch} ${proof}: ${JSON.stringify(result)}`,
    );
    assert.ok(branchExists(root, branch));
  }
});

// Invariant: the base ref rewound between the pre-write pass and the deletion drops `proofCommit`
// from it, so the item's own step retains the branch (`not-proven`); a fetch that only advances
// the base keeps `proofCommit` in it, so the same plan still deletes.
test('cleanup branch: a rewound base keeps the branch, an advanced base still deletes it', async (t) => {
  const rewound = squashMerged(t);
  const rewoundItem = branchItem(await cleanupPlanOf(rewound.root), rewound.branch);
  const kept = wf.expectOk(
    await applyBranches(rewound.root, [rewoundItem], {
      onPhase: (name) => {
        if (name === 'beforeBranchItem') {
          wf.git(
            rewound.root,
            'update-ref',
            'refs/remotes/origin/main',
            wf.git(rewound.root, 'rev-parse', 'main~1'),
          );
        }
      },
    }),
  );
  assert.deepEqual([kept.items[0].code, kept.items[0].reason], ['BRANCH_RETAINED', 'not-proven']);
  assert.ok(branchExists(rewound.root, rewound.branch));

  const advanced = squashMerged(t);
  const advancedPlan = await cleanupPlanOf(advanced.root);
  const advancedItem = branchItem(advancedPlan, advanced.branch);
  wf.commitOnBranch(advanced.root, 'main', { 'later.txt': 'later\n' });
  const moved = wf.publishMain(advanced.root);
  assert.notEqual(moved, advancedItem.proofCommit);
  const deleted = wf.expectOk(await applyBranches(advanced.root, [advancedItem]));
  assert.deepEqual([deleted.items[0].ok, deleted.items[0].deleted], [true, true]);
  assert.equal(branchExists(advanced.root, advanced.branch), false);
});

// Invariant: a record that becomes unreadable, or build-run state that does, between the pre-write
// pass and the deletion keeps an orphan branch (`record-unreadable`); a foreign file in the records
// directory does the same at plan time.
test('cleanup branch: record or build-run state turning unreadable keeps the orphan', async (t) => {
  const records = squashMerged(t);
  const recordItem = branchItem(await cleanupPlanOf(records.root), records.branch);
  const recordResult = wf.expectOk(
    await applyBranches(records.root, [recordItem], {
      onPhase: (name) => {
        if (name === 'beforeBranchItem') wf.writeRecordFile(records.root, 'broken', '{not json');
      },
    }),
  );
  assert.deepEqual(
    [recordResult.items[0].code, recordResult.items[0].reason],
    ['BRANCH_RETAINED', 'record-unreadable'],
  );
  assert.ok(branchExists(records.root, records.branch));

  const runs = squashMerged(t);
  const runItem = branchItem(await cleanupPlanOf(runs.root), runs.branch);
  const runResult = wf.expectOk(
    await applyBranches(runs.root, [runItem], {
      onPhase: (name) => {
        if (name === 'beforeBranchItem') {
          mkdirSync(join(runs.root, '.effective-flow', 'build-runs', 'not a run id'), {
            recursive: true,
          });
        }
      },
    }),
  );
  assert.deepEqual(
    [runResult.items[0].code, runResult.items[0].reason],
    ['BRANCH_RETAINED', 'record-unreadable'],
  );
  assert.ok(branchExists(runs.root, runs.branch));

  const foreign = squashMerged(t);
  wf.writeRecordFile(foreign.root, 'not a record id', '{}');
  assert.equal(retainedOf(await cleanupPlanOf(foreign.root))[foreign.branch], 'record-unreadable');
  const objectless = squashMerged(t);
  wf.writeRecordFile(objectless.root, 'objectless', { schemaVersion: 1 });
  assert.equal(
    retainedOf(await cleanupPlanOf(objectless.root))[objectless.branch],
    'record-unreadable',
  );
  const unreadableRuns = squashMerged(t);
  mkdirSync(join(unreadableRuns.root, '.effective-flow', 'build-runs', 'not a run id'), {
    recursive: true,
  });
  assert.equal(
    retainedOf(await cleanupPlanOf(unreadableRuns.root))[unreadableRuns.branch],
    'record-unreadable',
  );
});

// Invariant: an invalid record that still carries a validated `branch` binds that branch
// (`recorded`) without suppressing the other orphans.
test('cleanup branch: an invalid record with a branch binds it and suppresses no other orphan', async (t) => {
  const root = wf.repository(t);
  wf.git(root, 'branch', 'effective-flow/build/bound');
  wf.git(root, 'branch', 'effective-flow/build/free');
  wf.publishMain(root);
  const worktree = {
    worktreePath: join(root, '.effective-flow', 'gone'),
    branch: 'effective-flow/build/bound',
    head: wf.git(root, 'rev-parse', 'main'),
  };
  wf.writeRecordFile(root, 'inv', {
    ...wf.makeRecord(root, worktree, { recordId: 'inv' }),
    status: 'bogus-status',
  });
  const planned = await cleanupPlanOf(root);
  assert.equal(retainedOf(planned)['effective-flow/build/bound'], 'recorded');
  assert.ok(branchItem(planned, 'effective-flow/build/free'));
});

// Invariant: a `merge-gate` record's branch is never a candidate while the record exists (it may be
// a contributor's branch); once the record is gone it is an ordinary orphan under the prefix.
test('cleanup branch: a merge-gate record branch is never offered while its record exists', async (t) => {
  const root = wf.repository(t);
  const options = { purpose: 'merge-gate', workflow: 'merge-gate' };
  const { worktree, record } = await wf.initialized(root, options);
  wf.git(root, 'update-ref', `refs/remotes/origin/${worktree.branch}`, worktree.head);
  await wf.moveTo(root, record, 'aborted', 'stopped');
  wf.publishMain(root);
  const planned = await cleanupPlanOf(root);
  assert.ok(planned.items.some((item) => item.itemId === `worktree:${record.recordId}`));
  assert.equal(branchItem(planned, worktree.branch), undefined);
  assert.equal(retainedOf(planned)[worktree.branch], 'recorded');
  wf.expectOk(
    await wf.call('cleanup apply', {
      cwd: root,
      executionRoot: root,
      items: { [`worktree:${record.recordId}`]: wf.applyValue(planned.items[0]) },
    }),
  );
  const after = branchItem(await cleanupPlanOf(root), worktree.branch);
  assert.deepEqual([after?.source, after?.dependsOn], ['orphan', null]);
});

function writeProjectSetup(root, rows) {
  writeFileSync(
    join(root, 'AGENTS.md'),
    '# Agents\n\n**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md\n',
  );
  mkdirSync(join(root, 'docs', 'adr'), { recursive: true });
  const table = Object.entries(rows)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join('\n');
  writeFileSync(
    join(root, 'docs', 'adr', 'effective-flow-project-setup.md'),
    `# Effective Flow project setup\n\n## Status\n\nActive\n\n## Configuration\n\n| Key | Value |\n| --- | --- |\n${table}\n`,
  );
}

// Invariant: with an empty prefix no local branch is an orphan candidate (the prefix only narrows
// what is offered), while a record-bound delivery branch still is; the base branch is never one.
test('cleanup branch: an empty prefix offers no orphan, only record-bound branches', async (t) => {
  const root = wf.repository(t);
  writeProjectSetup(root, { 'delivery.branchPrefix': '' });
  const { record } = await wf.initialized(root);
  await wf.moveTo(root, record, 'cleanup-ready');
  wf.git(root, 'branch', 'effective-flow/build/orphan');
  wf.git(root, 'branch', 'plain-orphan');
  wf.publishMain(root);
  const planned = await cleanupPlanOf(root);
  assert.equal(planned.branchProof.prefix, '');
  assert.deepEqual(
    planned.items
      .filter((item) => item.kind === 'branch')
      .map((item) => [item.branch, item.source]),
    [[record.branch, 'record']],
    JSON.stringify(planned.retainedBranches),
  );
  assert.equal(retainedOf(planned)['plain-orphan'], undefined);
  assert.equal(retainedOf(planned)['effective-flow/build/orphan'], undefined);
});

// Invariant: the local base branch is never offered, even when it is an ancestor of a newer
// `origin/<base>` (its content is trivially "landed"), neither is a configured return branch or a
// branch outside the prefix; none of them appears in the retained list.
test('cleanup branch: base, return and out-of-prefix branches are never offered', async (t) => {
  const root = wf.repository(t);
  writeProjectSetup(root, { 'delivery.returnBranch': 'effective-flow/return' });
  wf.git(root, 'branch', 'effective-flow/return');
  wf.git(root, 'branch', 'user/own-work');
  wf.git(root, 'branch', 'effective-flow/build/inside');
  wf.commitOnBranch(root, 'newer', { 'newer.txt': 'n\n' });
  wf.git(root, 'update-ref', 'refs/remotes/origin/main', wf.git(root, 'rev-parse', 'newer'));
  const planned = await cleanupPlanOf(root);
  assert.deepEqual(
    planned.items.filter((item) => item.kind === 'branch').map((item) => item.branch),
    ['effective-flow/build/inside'],
  );
  assert.deepEqual(retainedOf(planned), {});
});

// Invariant: exactly one retained reason is chosen, always the first of RETAINED_BRANCH_REASONS
// (repository-wide, exclusions, limits, proof result), whatever order the reasons arrive in.
test('cleanup branch: the retained reason is the first in precedence order, independent of input order', async () => {
  const { RETAINED_BRANCH_REASONS, retainedBranchReason } =
    await import('../src/scripts/effective-flow-state-worktree-core.mjs');
  assert.equal(retainedBranchReason([]), null);
  RETAINED_BRANCH_REASONS.forEach((earlier, index) => {
    for (const later of RETAINED_BRANCH_REASONS.slice(index + 1)) {
      assert.equal(retainedBranchReason([later, earlier]), earlier);
      assert.equal(retainedBranchReason([earlier, later]), earlier);
    }
  });
  const group = (from, to) => RETAINED_BRANCH_REASONS.slice(from, to);
  const at = (reason) => RETAINED_BRANCH_REASONS.indexOf(reason);
  assert.ok(at('record-unreadable') < at('unsafe-name'), 'repository-wide before exclusions');
  assert.ok(at('in-use') < at('branch-limit'), 'exclusions before limits');
  assert.ok(at('candidate-limit') < at('no-merge-base'), 'limits before the proof result');
  assert.ok(group(0, at('no-merge-base')).includes('timeout'));
});

// Invariant: the same repository plans the same retained list twice, each branch carrying the one
// reason the precedence picks: a repository-wide reason overrides every exclusion, an exclusion
// beats an unproven result, and `tip-tree`'s reason stands unless the squash search ran.
test('cleanup branch: retained reasons are deterministic and follow the precedence', async (t) => {
  const root = wf.repository(t);
  wf.commitOnBranch(root, 'effective-flow/build/open', { 'open.txt': 'open\n' });
  wf.commitOnBranch(root, 'effective-flow/build/netzero', { 'base.txt': 'x\n' });
  wf.commitOnBranch(root, 'effective-flow/build/netzero', { 'base.txt': 'base\n' });
  wf.git(root, 'branch', 'effective-flow/fix(x)');
  const bothHeld = join(root, '.effective-flow', 'both');
  wf.git(root, 'worktree', 'add', '-q', '-b', 'effective-flow/build/both', bothHeld);
  wf.writeBuildRun(root, 'run-both', {
    branch: 'effective-flow/build/both',
    head: wf.git(root, 'rev-parse', 'main'),
  });
  wf.publishMain(root);
  const calls = [];
  const first = await cleanupPlanOf(root, { runner: recordingRunnerInto(calls) });
  const second = await cleanupPlanOf(root);
  assert.deepEqual(first.retainedBranches, second.retainedBranches);
  assert.deepEqual(retainedOf(first), {
    'effective-flow/build/both': 'recorded',
    'effective-flow/build/netzero': 'empty-diff',
    'effective-flow/build/open': 'not-proven',
    'effective-flow/fix(x)': 'unsafe-name',
  });
  const searches = calls.filter((args) => args.includes('--first-parent'));
  assert.equal(searches.length, 1, 'only the not-proven branch ran the squash search');
  writeUnderGit(root, 'info/grafts', '');
  const repositoryWide = await cleanupPlanOf(root);
  assert.deepEqual(
    Object.values(retainedOf(repositoryWide)),
    ['grafts', 'grafts', 'grafts', 'grafts'],
    'a repository-wide reason overrides every exclusion and proof result',
  );
});

function recordingRunnerInto(calls) {
  const real = createProcessRunner();
  return (request) => {
    calls.push(request.args.slice(2).filter((arg) => arg !== '--no-replace-objects'));
    return real(request);
  };
}

// Invariant: when the base later reverted the squash, `tip-tree` fails and the squash search
// replaces its `not-proven` with a `squash-tree` proof naming the squash commit, offered with that
// proof (the item is distinct for the confirmation).
test('cleanup branch: a reverted squash is offered as squash-tree naming the squash commit', async (t) => {
  const { root, branch, squash } = squashMerged(t);
  wf.git(root, 'rm', '-q', 'feature.txt');
  wf.git(root, 'commit', '-q', '-m', 'revert the feature');
  wf.publishMain(root);
  const item = branchItem(await cleanupPlanOf(root), branch);
  assert.deepEqual([item?.proof, item?.proofCommit], ['squash-tree', squash]);
  const result = wf.expectOk(await applyBranches(root, [item]));
  assert.deepEqual([result.items[0].ok, result.items[0].proof], [true, 'squash-tree']);
});

// Invariant: pass 1 (`ancestor`/`tip-tree`) runs for every candidate before any `squash-tree`
// search, so an unprovable branch sorting first cannot starve a later branch the cheap proof
// handles; the unprovable branch is retained, never offered.
test('cleanup branch: squash searches never starve a later cheap proof', async (t) => {
  const root = wf.repository(t);
  wf.commitOnBranch(root, 'effective-flow/build/a-open', { 'open.txt': 'open\n' });
  wf.commitOnBranch(root, 'effective-flow/build/z-landed', { 'z.txt': 'z\n' });
  wf.squashIntoMain(root, 'effective-flow/build/z-landed');
  wf.publishMain(root);
  let offset = 0;
  const real = createProcessRunner();
  const planned = await cleanupPlanOf(root, {
    runner: async (request) => {
      const result = await real(request);
      // A squash search is one `git log --first-parent`; it consumes the whole budget.
      if (request.args.includes('--first-parent')) offset += 60_000;
      return result;
    },
    now: () => Date.now() + offset,
    branchProofBudgetMs: 30_000,
  });
  assert.deepEqual(
    planned.items.filter((item) => item.kind === 'branch').map((item) => [item.branch, item.proof]),
    [['effective-flow/build/z-landed', 'tip-tree']],
  );
  assert.ok(['timeout', 'not-proven'].includes(retainedOf(planned)['effective-flow/build/a-open']));
});

// Invariant: at most MAX_BRANCH_ITEMS candidates are proven per plan, record-bound branches first,
// then by name; the rest is retained as `branch-limit`, never offered.
test('cleanup branch: more than 32 candidates keep the record-bound one and the first by name', async (t) => {
  const root = wf.repository(t);
  const { record } = await wf.initialized(root);
  await wf.moveTo(root, record, 'cleanup-ready');
  const names = Array.from(
    { length: 33 },
    (_, index) => `effective-flow/aa/b${String(index).padStart(2, '0')}`,
  );
  for (const name of names) wf.git(root, 'branch', name);
  wf.publishMain(root);
  const planned = await cleanupPlanOf(root);
  const offered = planned.items.filter((item) => item.kind === 'branch').map((item) => item.branch);
  assert.equal(offered.length, 32);
  assert.ok(offered.includes(record.branch), 'record-bound branch first');
  assert.deepEqual(offered.filter((name) => name !== record.branch).sort(), names.slice(0, 31));
  assert.deepEqual(
    Object.entries(retainedOf(planned)).sort(),
    names.slice(31).map((name) => [name, 'branch-limit']),
  );
});

// Invariant: an exhausted proof budget retains every branch as `timeout` and leaves every other
// plan item exactly as an unbounded plan reports it.
test('cleanup branch: an exhausted proof budget changes no other plan item', async (t) => {
  const root = wf.repository(t);
  const { record } = await wf.initialized(root);
  await wf.moveTo(root, record, 'cleanup-ready');
  wf.git(root, 'branch', 'effective-flow/build/orphan');
  wf.publishMain(root);
  const normal = await cleanupPlanOf(root);
  const exhausted = await cleanupPlanOf(root, { branchProofBudgetMs: 0 });
  const others = (planned) => planned.items.filter((item) => item.kind !== 'branch');
  assert.ok(others(normal).length > 0);
  assert.deepEqual(others(exhausted), others(normal));
  assert.deepEqual(exhausted.blocked, normal.blocked);
  assert.deepEqual(retainedOf(exhausted), {
    [record.branch]: 'timeout',
    'effective-flow/build/orphan': 'timeout',
  });
});

// Invariant: config entries are matched by their exact `branch.<name>.` subsection: a branch whose
// name is a prefix of, or differs only by a regex metacharacter from, another branch's keeps that
// branch's entries, and a locked configuration file leaves the entries as `configRemaining`
// without failing the deletion.
test("cleanup branch: only the deleted branch's exact config section goes; a locked config is reported", async (t) => {
  const root = wf.repository(t);
  wf.git(root, 'branch', 'effective-flow/a.b');
  wf.publishMain(root);
  const config = (name, key) => `branch.${name}.${key}`;
  wf.git(root, 'config', config('effective-flow/a.b', 'remote'), 'origin');
  wf.git(root, 'config', config('effective-flow/aXb', 'remote'), 'keep-regex');
  wf.git(root, 'config', config('effective-flow/a.b.c', 'remote'), 'keep-longer');
  wf.git(root, 'config', config('effective-flow/a', 'remote'), 'keep-shorter');
  wf.git(root, 'config', config('effective-flow/a.b(x)', 'remote'), 'keep-paren');
  const item = branchItem(await cleanupPlanOf(root), 'effective-flow/a.b');
  const result = wf.expectOk(await applyBranches(root, [item]));
  assert.deepEqual(
    result.items[0].configRemoved.map((entry) => entry.key),
    [config('effective-flow/a.b', 'remote')],
  );
  for (const kept of [
    'effective-flow/aXb',
    'effective-flow/a.b.c',
    'effective-flow/a',
    'effective-flow/a.b(x)',
  ]) {
    assert.ok(wf.git(root, 'config', '--get', config(kept, 'remote')), kept);
  }

  const locked = squashMerged(t);
  wf.git(locked.root, 'config', `branch.${locked.branch}.remote`, 'origin');
  const lockedItem = branchItem(await cleanupPlanOf(locked.root), locked.branch);
  const outcome = wf.expectOk(
    await applyBranches(locked.root, [lockedItem], {
      onPhase: (name) => {
        if (name === 'afterBranchDelete') writeUnderGit(locked.root, 'config.lock', '');
      },
    }),
  );
  assert.deepEqual([outcome.items[0].ok, outcome.items[0].deleted], [true, true]);
  assert.equal(outcome.items[0].configRemaining.entries[0].key, `branch.${locked.branch}.remote`);
  assert.equal(branchExists(locked.root, locked.branch), false);
});

// Invariant: neither plan nor apply fetches, pushes or asks a forge: no Git call names a network
// operation and the remote-tracking ref stays exactly where it was.
test('cleanup branch: plan and apply make no network call', async (t) => {
  const { root, branch } = squashMerged(t);
  const before = wf.git(root, 'rev-parse', 'refs/remotes/origin/main');
  const calls = [];
  const planned = await cleanupPlanOf(root, { runner: recordingRunnerInto(calls) });
  wf.expectOk(
    await applyBranches(root, [branchItem(planned, branch)], {
      runner: recordingRunnerInto(calls),
    }),
  );
  assert.ok(calls.length > 0);
  for (const verb of ['fetch', 'push', 'pull', 'ls-remote', 'remote', 'clone']) {
    assert.ok(!calls.some((args) => args.includes(verb)), verb);
  }
  assert.equal(wf.git(root, 'rev-parse', 'refs/remotes/origin/main'), before);
});

// ---------------------------------------------------------------------------------------------
// The `branch:` class: real build runs, symbolic refs, settled deletes and the other
// compare-and-delete callers

// Invariant: the build-run reader reads what `build-run-core.mjs` itself writes: a transitioned
// run binds its `execution.json` branch, not the request's, a created-only run its request
// branch; `cleanup plan` keeps such a branch as `recorded`. A run directory a crashed `create`
// left without `request.json` makes the build-run state unreadable, so every orphan is
// `record-unreadable`.
test('cleanup branch: the build-run reader follows the real create and transition layout', async (t) => {
  const root = wf.repository(t);
  const branch = 'effective-flow/build/run-bound';
  await wf.createBuildRun(root, 'run-moved', { branch });
  assert.deepEqual(await nonTerminalBuildRunBranches(root), { state: 'ok', branches: [branch] });
  await wf.createBuildRun(root, 'run-created');
  assert.deepEqual(await nonTerminalBuildRunBranches(root), {
    state: 'ok',
    branches: [branch, 'main'],
  });
  wf.git(root, 'branch', 'effective-flow/build/orphan');
  wf.publishMain(root);
  const planned = await cleanupPlanOf(root);
  assert.equal(retainedOf(planned)[branch], 'recorded', JSON.stringify(planned.retainedBranches));
  assert.ok(branchItem(planned, 'effective-flow/build/orphan'));
  const crashed = join(root, '.effective-flow', 'build-runs', 'run-crashed');
  mkdirSync(crashed);
  writeFileSync(join(crashed, 'source.json'), '{}\n');
  assert.equal((await nonTerminalBuildRunBranches(root)).state, 'unreadable');
  const suppressed = await cleanupPlanOf(root);
  assert.equal(retainedOf(suppressed)['effective-flow/build/orphan'], 'record-unreadable');
  assert.equal(branchItem(suppressed, 'effective-flow/build/orphan'), undefined);
});

// Invariant: the pre-write pass re-derives candidacy, so a build run or a record that names the
// branch after the plan is a whole-call PREVIEW_MISMATCH `not-actionable` with `recorded`, and
// nothing is deleted.
test('cleanup branch: a build run or record naming the branch after the plan is not-actionable', async (t) => {
  const { root, branch } = squashMerged(t);
  const item = branchItem(await cleanupPlanOf(root), branch);
  wf.writeBuildRun(root, 'run-late', { branch, head: wf.git(root, 'rev-parse', 'main') });
  const byRun = wf.expectOutcome(await applyBranches(root, [item]), 'PREVIEW_MISMATCH');
  assert.deepEqual([byRun.reason, byRun.blockers], ['not-actionable', ['recorded']]);
  rmSync(join(root, '.effective-flow', 'build-runs'), { recursive: true });
  const worktree = {
    worktreePath: wf.requiredPath(root),
    branch,
    head: wf.git(root, 'rev-parse', branch),
  };
  wf.writeRecordFile(root, 'late', wf.makeRecord(root, worktree, { recordId: 'late' }));
  const byRecord = wf.expectOutcome(await applyBranches(root, [item]), 'PREVIEW_MISMATCH');
  assert.deepEqual([byRecord.reason, byRecord.blockers], ['not-actionable', ['recorded']]);
  assert.ok(branchExists(root, branch));
});

// Invariant: a symbolic ref under the prefix is listed with its target's tip but is never offered
// (`unsafe-name`); a branch that turns into a symbolic ref after the plan is refused by the
// pre-write pass, and one that turns into it right before the deletion is `ref-moved`. The target
// branch is never deleted, and the successful delete passes `--no-deref`.
test('cleanup branch: a symbolic ref is never offered and its target is never deleted', async (t) => {
  const { root, branch, tip } = squashMerged(t);
  const alias = 'effective-flow/build/alias';
  wf.git(root, 'symbolic-ref', `refs/heads/${alias}`, 'refs/heads/main');
  const planned = await cleanupPlanOf(root);
  assert.equal(retainedOf(planned)[alias], 'unsafe-name');
  assert.equal(branchItem(planned, alias), undefined);
  const item = branchItem(planned, branch);
  wf.git(root, 'branch', 'keep-target', tip);
  wf.git(root, 'symbolic-ref', `refs/heads/${branch}`, 'refs/heads/keep-target');
  const prepass = wf.expectOutcome(await applyBranches(root, [item]), 'PREVIEW_MISMATCH');
  assert.deepEqual([prepass.reason, prepass.blockers], ['not-actionable', ['unsafe-name']]);
  wf.git(root, 'update-ref', '--no-deref', `refs/heads/${branch}`, tip);
  const racing = wf.expectOk(
    await applyBranches(root, [item], {
      onPhase: (name) => {
        if (name === 'beforeBranchDelete') {
          wf.git(root, 'symbolic-ref', `refs/heads/${branch}`, 'refs/heads/keep-target');
        }
      },
    }),
  );
  assert.deepEqual(
    [racing.items[0].code, racing.items[0].reason],
    ['BRANCH_RETAINED', 'ref-moved'],
    JSON.stringify(racing),
  );
  assert.equal(wf.git(root, 'rev-parse', 'refs/heads/keep-target'), tip);
  assert.ok(branchExists(root, 'main'));
  wf.git(root, 'update-ref', '--no-deref', `refs/heads/${branch}`, tip);
  const { runner, calls } = recordingRunner();
  const deleted = wf.expectOk(await applyBranches(root, [item], { runner }));
  assert.equal(deleted.items[0].ok, true, JSON.stringify(deleted));
  assert.ok(
    calls.some(
      (args) => args[0] === 'update-ref' && args.includes('--no-deref') && args.includes('-d'),
    ),
  );
  assert.equal(wf.git(root, 'rev-parse', 'refs/heads/keep-target'), tip);
  assert.equal(wf.git(root, 'symbolic-ref', `refs/heads/${alias}`), 'refs/heads/main');
});

// Invariant: a delete Git reports as failed or timed out may still have committed (a hook stopped
// after the transaction): the ref is read again, and a ref that is gone counts as deleted, with
// its restore line and the configuration removal; a ref still present is `ref-moved`.
test('cleanup branch: a delete reported failed after it committed counts as deleted', async (t) => {
  for (const report of [
    { status: null, timedOut: true },
    { status: 1, timedOut: false },
  ]) {
    const { root, branch, tip } = squashMerged(t);
    wf.git(root, 'config', `branch.${branch}.remote`, 'origin');
    const item = branchItem(await cleanupPlanOf(root), branch);
    const real = createProcessRunner();
    const result = wf.expectOk(
      await applyBranches(root, [item], {
        runner: async (request) => {
          const outcome = await real(request);
          return hasArgs(request.args, 'update-ref', '-d') ? { ...outcome, ...report } : outcome;
        },
      }),
    );
    const [entry] = result.items;
    assert.deepEqual(
      [entry.ok, entry.deleted, entry.restore],
      [true, true, `git branch '${branch}' ${tip}`],
      JSON.stringify(result),
    );
    assert.deepEqual(
      entry.configRemoved.map((config) => config.key),
      [`branch.${branch}.remote`],
    );
    assert.equal(branchExists(root, branch), false);
  }
  const { root, branch } = squashMerged(t);
  const item = branchItem(await cleanupPlanOf(root), branch);
  const kept = wf.expectOk(
    await applyBranches(root, [item], {
      runner: failingRunner(
        (args) => hasArgs(args, 'update-ref', '-d'),
        () => true,
      ),
    }),
  );
  assert.deepEqual([kept.items[0].code, kept.items[0].reason], ['BRANCH_RETAINED', 'ref-moved']);
  assert.ok(branchExists(root, branch));
});

// Invariant: after a failed delete, only a ref proven absent counts as deleted. `for-each-ref`
// skips a dangling symbolic ref and a broken loose ref, so either one still in place is
// `ref-moved`: never reported deleted, its configuration kept.
test('cleanup branch: a dangling symbolic or broken ref left by a failed delete is ref-moved', async (t) => {
  const corruptions = {
    dangling: (root, branch) =>
      wf.git(root, 'symbolic-ref', `refs/heads/${branch}`, 'refs/heads/nowhere'),
    broken: (root, branch) => writeUnderGit(root, `refs/heads/${branch}`, 'garbage\n'),
  };
  for (const [name, corrupt] of Object.entries(corruptions)) {
    const { root, branch } = squashMerged(t);
    wf.git(root, 'config', `branch.${branch}.remote`, 'origin');
    const item = branchItem(await cleanupPlanOf(root), branch);
    const real = createProcessRunner();
    const result = wf.expectOk(
      await applyBranches(root, [item], {
        runner: async (request) => {
          if (!hasArgs(request.args, 'update-ref', '-d')) return real(request);
          corrupt(root, branch);
          return FAILED_GIT;
        },
      }),
    );
    const [entry] = result.items;
    assert.deepEqual(
      [entry.ok, entry.code, entry.reason, entry.deleted],
      [false, 'BRANCH_RETAINED', 'ref-moved', undefined],
      `${name}: ${JSON.stringify(result)}`,
    );
    assert.equal(wf.git(root, 'config', '--get', `branch.${branch}.remote`), 'origin', name);
  }
});

// A released `issue-planning` record whose temporary branch is still at `creationOid`, which
// `build/baseline` also reaches, so `git branch -d` refuses it and the compare-and-delete runs.
async function unadvancedIssuePlanning(root) {
  const tree = wf.git(root, 'rev-parse', 'HEAD^{tree}');
  const baseline = wf.git(root, 'commit-tree', tree, '-p', 'HEAD', '-m', 'baseline head');
  wf.git(root, 'branch', 'build/baseline', baseline);
  const worktree = wf.addWorktree(root, {
    path: join(wf.baseDir(root), `${wf.SESSION}-issue-planning`),
    branch: `issue-planning/${wf.SESSION}`,
    base: baseline,
  });
  const record = wf.makeRecord(root, worktree, {
    purpose: 'issue-planning',
    overrides: { branchPolicy: 'delete-after-integration' },
  });
  wf.expectOk(await wf.call('worktree record-init', { cwd: root, executionRoot: root, record }));
  return record;
}

// Invariant: the other compare-and-delete callers, the apply-review `integrationRoot` route and
// the unadvanced temporary branch, share its guards: a branch a bisect or rebase uses is `in-use`
// and kept; a deletion passes `--no-deref` and removes exactly the branch's configuration; a ref
// turned symbolic right before the deletion is `ref-moved` and its target stays.
test('compare-and-delete: the apply-review and temporary-branch routes share the guards', async (t) => {
  const routes = {
    'apply-review': async (root) => {
      const { record, tip } = await component(root, 'c1', (wt) =>
        writeFileSync(join(wt, 'feature.txt'), 'feature line\n'),
      );
      integrate(root, tip);
      return {
        branch: record.branch,
        tip,
        remove: (extra) => removeComponents(root, ['c1'], extra),
      };
    },
    'issue-planning': async (root) => {
      const record = await unadvancedIssuePlanning(root);
      return {
        branch: record.branch,
        tip: record.creationOid,
        remove: (extra) =>
          wf.call(
            'worktree remove',
            { cwd: root, executionRoot: root, sessionId: wf.SESSION, recordIds: [record.recordId] },
            extra,
          ),
      };
    },
  };
  for (const [route, prepare] of Object.entries(routes)) {
    const busy = wf.repository(t);
    const inUse = await prepare(busy);
    writeUnderGit(busy, 'rebase-merge/head-name', `refs/heads/${inUse.branch}\n`);
    const refused = wf.expectOk(await inUse.remove({}));
    assert.deepEqual(
      [refused.items[0].code, refused.items[0].branch.reason],
      ['BRANCH_RETAINED', 'in-use'],
      `${route}: ${JSON.stringify(refused)}`,
    );
    assert.ok(branchExists(busy, inUse.branch), route);

    const symbolic = wf.repository(t);
    const aliased = await prepare(symbolic);
    wf.git(symbolic, 'branch', 'keep-target', aliased.tip);
    const moved = wf.expectOk(
      await aliased.remove({
        onPhase: (name) => {
          if (name === 'beforeBranchDelete') {
            wf.git(
              symbolic,
              'symbolic-ref',
              `refs/heads/${aliased.branch}`,
              'refs/heads/keep-target',
            );
          }
        },
      }),
    );
    assert.equal(moved.items[0].branch.reason, 'ref-moved', `${route}: ${JSON.stringify(moved)}`);
    assert.equal(wf.git(symbolic, 'rev-parse', 'refs/heads/keep-target'), aliased.tip, route);

    const clean = wf.repository(t);
    const deleted = await prepare(clean);
    wf.git(clean, 'config', `branch.${deleted.branch}.remote`, 'origin');
    wf.git(clean, 'config', `branch.${deleted.branch}x.remote`, 'origin');
    const { runner, calls } = recordingRunner();
    const result = wf.expectOk(await deleted.remove({ runner }));
    assert.equal(result.items[0].ok, true, `${route}: ${JSON.stringify(result)}`);
    assert.equal(result.items[0].branch.outcome, 'deleted-after-proof', route);
    assert.deepEqual(
      result.items[0].branch.configRemoved.map((entry) => entry.key),
      [`branch.${deleted.branch}.remote`],
      route,
    );
    assert.equal(wf.git(clean, 'config', '--get', `branch.${deleted.branch}x.remote`), 'origin');
    assert.ok(
      calls.some(
        (args) => args[0] === 'update-ref' && args.includes('--no-deref') && args.includes('-d'),
      ),
      route,
    );
    assert.equal(branchExists(clean, deleted.branch), false, route);
  }
});
