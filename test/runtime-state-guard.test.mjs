import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { link as fsLink, open as fsOpen } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import * as guard from '../src/scripts/runtime-state-guard.mjs';
import * as diffBaseline from '../src/scripts/diff-baseline-core.mjs';
import { createProcessRunner as createSharedRunner } from '../src/scripts/process-runner.mjs';

const {
  NO_CLOBBER_TEMP_MAX_AGE_MS,
  RuntimeStateError,
  createNoClobber,
  ensureGuardedDirectory,
  git,
  gitBaseEnv,
  gitText,
  guardTarget,
  resolveRuntimeRoot,
} = guard;

const GIT_ENV = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0' };

function repository(t, { ignore = '.effective-flow/\n' } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-runtime-guard-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = spawnSync('git', ['-C', root, 'init', '-q'], { env: GIT_ENV });
  assert.equal(result.status, 0, String(result.stderr));
  writeFileSync(join(root, '.gitignore'), ignore);
  return root;
}

// Sets inherited variables that would redirect git elsewhere for the duration of one test.
function withInheritedGitEnv(t, values) {
  const saved = {};
  for (const [key, value] of Object.entries(values)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

// Invariant: the shared module is the one home of the guard, root check, write primitives and git
// wrapper; a removed or renamed export would silently break a helper importing it.
test('the shared module exports exactly the runtime-state surface', () => {
  assert.deepEqual(Object.keys(guard).sort(), [
    'HARNESS_SETTINGS_DIR',
    'HARNESS_SETTINGS_FILE',
    'LEGACY_CONFIG_DECISIONS',
    'LEGACY_CONFIG_ENTRY',
    'LEGACY_MEMORY_ENTRY',
    'LEGACY_MEMORY_FILE',
    'LEGACY_RUNTIME_DIRS',
    'LEGACY_WORKTREES_ENTRY',
    'NON_LIVE_LOCATOR_STEPS',
    'NO_CLOBBER_TEMP_MAX_AGE_MS',
    'O_NOFOLLOW',
    'RUNTIME_STATE_DIR',
    'RuntimeStateError',
    'TRANSITIONAL_CONFIG_FILE',
    'asBuffer',
    'assertDirectoryChain',
    'atomicWrite',
    'atomicWriteHarnessSettings',
    'checkLegacyConfigFile',
    'checkLegacyRuntimeDirectory',
    'commonDir',
    'createNoClobber',
    'ensureGuardedDirectory',
    'errorDetail',
    'git',
    'gitBaseEnv',
    'gitCommitEnv',
    'gitText',
    'guardHarnessSettings',
    'guardLegacyMemory',
    'guardTarget',
    'guardTargets',
    'guardedMkdir',
    'guardedMkdirHarnessDirectory',
    'guardedRmdir',
    'guardedUnlink',
    'guardedUnlinkLegacyMemory',
    'hashRegularFile',
    'isLegacyMigrationMarker',
    'listLegacyTree',
    'relativeToRoot',
    'removeLegacyListing',
    'requireToplevel',
    'resolveDirectory',
    'resolveRuntimeRoot',
    'runGit',
    'selectLegacySource',
    'walkLegacySource',
  ]);
  assert.equal(guard.RUNTIME_STATE_DIR, '.effective-flow');
});

// Invariant: diff-baseline keeps one guard instead of a copy, and every symbol it exported before
// the extraction is still exported from it, so its importers stay unchanged.
test('diff-baseline re-exports the moved symbols instead of defining copies', () => {
  assert.equal(diffBaseline.gitBaseEnv, guard.gitBaseEnv);
  assert.equal(diffBaseline.errorDetail, guard.errorDetail);
});

// Invariant: a refusal raised by the shared guard keeps its code in a helper's envelope instead of
// collapsing to INTERNAL_ERROR, and DiffBaselineError keeps its own exit code mapping.
test('RuntimeStateError carries its code, and DiffBaselineError is its subclass', () => {
  const cause = new Error('root cause');
  const error = new RuntimeStateError('UNSAFE_TARGET', 'refused', { cause });
  assert.ok(error instanceof Error);
  assert.equal(error.name, 'RuntimeStateError');
  assert.equal(error.code, 'UNSAFE_TARGET');
  assert.equal(error.cause, cause);
  assert.equal(error.exitCode, undefined);

  const subclass = new diffBaseline.DiffBaselineError('WRITE_FAILED', 'x');
  assert.ok(subclass instanceof RuntimeStateError);
  assert.equal(subclass.name, 'DiffBaselineError');
  assert.equal(subclass.exitCode, 3);

  assert.deepEqual(diffBaseline.errorEnvelope('capture', error), {
    ok: false,
    operation: 'capture',
    error: { code: 'UNSAFE_TARGET', message: 'refused' },
  });
  assert.equal(
    diffBaseline.exitCodeFor(diffBaseline.errorEnvelope('capture', error)),
    3,
    'the exit code derives from error.code through the helper map',
  );
});

// Invariant: an inherited GIT_DIR or GIT_WORK_TREE never redirects a guard predicate to another
// repository.
test('gitBaseEnv strips redirecting variables and pins the safe ones', () => {
  const env = gitBaseEnv({
    PATH: '/bin',
    GIT_DIR: '/elsewhere/.git',
    GIT_WORK_TREE: '/elsewhere',
    GIT_INDEX_FILE: '/elsewhere/index',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.hooksPath',
    GIT_CONFIG_VALUE_0: '/evil',
    GIT_OPTIONAL_LOCKS: '1',
    UNSET: undefined,
  });
  assert.deepEqual(env, {
    PATH: '/bin',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    LC_ALL: 'C',
  });
});

// Invariant: the shared process runner merges a call's env over process.env, so the wrapper must
// mask every inherited stripped key itself; it also requests a Buffer stdout for either runner.
test('the git wrapper masks inherited GIT_DIR and normalises string output', async (t) => {
  withInheritedGitEnv(t, { GIT_DIR: '/nowhere/.git', GIT_WORK_TREE: '/nowhere' });
  const calls = [];
  const context = {
    env: gitBaseEnv(process.env),
    runner: async (call) => {
      calls.push(call);
      return { status: 0, stdout: ' value \n', stderr: '' };
    },
  };
  assert.equal(await gitText(context, '/repo', ['rev-parse', '--show-toplevel']), 'value');
  const [call] = calls;
  assert.equal(call.executable, 'git');
  assert.deepEqual(call.args, ['-C', '/repo', 'rev-parse', '--show-toplevel']);
  assert.equal(call.stdoutBuffer, true);
  assert.ok(Object.hasOwn(call.env, 'GIT_DIR') && call.env.GIT_DIR === undefined);
  assert.ok(Object.hasOwn(call.env, 'GIT_WORK_TREE') && call.env.GIT_WORK_TREE === undefined);
  assert.equal(call.env.GIT_OPTIONAL_LOCKS, '0');

  const result = await git(context, '/repo', ['status']);
  assert.ok(Buffer.isBuffer(result.stdout) && Buffer.isBuffer(result.stderr));
});

// Invariant: a git failure is a RuntimeStateError with GIT_FAILED and one stderr line.
test('the git wrapper reports a failing call as GIT_FAILED', async () => {
  const context = {
    env: {},
    runner: async () => ({ status: 128, stdout: '', stderr: 'warning: x\nfatal: not a repo\n' }),
  };
  await assert.rejects(git(context, '/repo', ['ls-files']), (error) => {
    assert.ok(error instanceof RuntimeStateError);
    assert.equal(error.code, 'GIT_FAILED');
    assert.equal(error.message, 'git ls-files failed: fatal: not a repo');
    return true;
  });
});

// Invariant: the one root check and the guard give the same verdict whichever runner a helper
// injects, and an inherited GIT_DIR pointing at another repository changes neither.
for (const [name, createRunner] of [
  ['diff-baseline runner', diffBaseline.createProcessRunner],
  ['shared process-runner', createSharedRunner],
]) {
  test(`root check and guard work through the ${name} despite an inherited GIT_DIR`, async (t) => {
    const root = repository(t);
    const foreign = repository(t, { ignore: '' });
    withInheritedGitEnv(t, { GIT_DIR: join(foreign, '.git'), GIT_WORK_TREE: foreign });
    const context = { runner: createRunner(), env: gitBaseEnv(process.env), cwd: null };
    const { cwd, common } = await resolveRuntimeRoot(context, root);
    assert.equal(cwd, root);
    assert.equal(common, realpathSync(join(root, '.git')));
    const stateDir = join(root, '.effective-flow');
    await ensureGuardedDirectory(context, stateDir);
    assert.ok(existsSync(stateDir));
    await guardTarget(context, join(stateDir, 'memory.lock'));
  });
}

// Invariant: the guard judges `.effective-flow/` itself before it exists through its trailing-slash
// form, so a helper can create the state directory only where it is ignored.
test('guardTarget probes a missing state directory as a directory', async (t) => {
  const ignored = repository(t);
  const context = { runner: createSharedRunner(), env: gitBaseEnv(process.env), cwd: null };
  await resolveRuntimeRoot(context, ignored);
  await guardTarget(context, join(ignored, '.effective-flow'));

  const unignored = repository(t, { ignore: '' });
  const other = { runner: createSharedRunner(), env: gitBaseEnv(process.env), cwd: null };
  await resolveRuntimeRoot(other, unignored);
  await assert.rejects(ensureGuardedDirectory(other, join(unignored, '.effective-flow')), {
    code: 'RUNTIME_STATE_UNSAFE',
  });
  assert.equal(existsSync(join(unignored, '.effective-flow')), false);
});

// Invariant: a linked worktree is never accepted as the runtime-state root.
test('resolveRuntimeRoot refuses a linked worktree', async (t) => {
  const root = repository(t);
  const run = (...args) => {
    const result = spawnSync('git', ['-C', root, ...args], {
      env: {
        ...GIT_ENV,
        GIT_AUTHOR_NAME: 'T',
        GIT_AUTHOR_EMAIL: 't@example.invalid',
        GIT_COMMITTER_NAME: 'T',
        GIT_COMMITTER_EMAIL: 't@example.invalid',
      },
    });
    assert.equal(result.status, 0, String(result.stderr));
  };
  run('add', '.gitignore');
  run('commit', '-q', '-m', 'fixture');
  const linked = join(root, '.effective-flow', 'linked');
  mkdirSync(join(root, '.effective-flow'));
  run('worktree', 'add', '-q', linked);
  const context = { runner: createSharedRunner(), env: gitBaseEnv(process.env), cwd: null };
  await assert.rejects(resolveRuntimeRoot(context, realpathSync(linked)), {
    code: 'UNSAFE_TARGET',
    message: 'cwd must be the main checkout, not a linked worktree',
  });
});

// ---------------------------------------------------------------------------------------------
// createNoClobber

async function reviewDirectory(t, options) {
  const root = repository(t, options);
  const context = { runner: createSharedRunner(), env: gitBaseEnv(process.env), cwd: null };
  await resolveRuntimeRoot(context, root);
  const directory = join(root, '.effective-flow', 'review');
  mkdirSync(directory, { recursive: true });
  return { root, context, directory };
}

const PREFIX = '.write-report-';
const TEMP_NAME = /^\.write-report-[0-9a-f]{16}\.tmp$/;

// Invariant: the create writes the exact content to a new file of mode 0600 and leaves no
// temporary file behind, whose name matches no `review-report-*` family and no `*.md` glob.
test('createNoClobber creates the target exactly and leaves no temporary file', async (t) => {
  const { context, directory } = await reviewDirectory(t);
  const target = join(directory, 'review-report-2026-11-01.md');
  const temporaries = [];
  const open = (file, ...rest) => {
    temporaries.push(file);
    return fsOpen(file, ...rest);
  };
  const result = await createNoClobber(context, target, '# report\n', {
    tempPrefix: PREFIX,
    fs: { open },
  });
  assert.deepEqual(result, { created: true, bytes: 9 });
  assert.equal(readFileSync(target, 'utf8'), '# report\n');
  assert.equal(lstatSync(target).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(directory), ['review-report-2026-11-01.md']);
  const name = temporaries[0].slice(directory.length + 1);
  assert.match(name, TEMP_NAME);
  assert.doesNotMatch(name, /^review-report-/);
  assert.doesNotMatch(name, /\.md$/);
});

// Invariant: an existing target is never replaced; the taken name is reported as EEXIST, distinct
// from a failure, and nothing is left behind.
test('createNoClobber reports a taken name as EEXIST and keeps the existing file', async (t) => {
  const { context, directory } = await reviewDirectory(t);
  const target = join(directory, 'review-report-2026-11-01.md');
  writeFileSync(target, 'foreign\n');
  const result = await createNoClobber(context, target, 'mine\n', { tempPrefix: PREFIX });
  assert.deepEqual(result, { created: false, code: 'EEXIST' });
  assert.equal(readFileSync(target, 'utf8'), 'foreign\n');
  assert.deepEqual(readdirSync(directory), ['review-report-2026-11-01.md']);
});

// Invariant: a post-link verification failure removes the target only while it is still the
// inode this call created; a foreign file that took the name in between stays and is named as
// `foreignPath`.
test('createNoClobber removes only its own inode on a failed verification', async (t) => {
  const { context, directory } = await reviewDirectory(t);
  const own = join(directory, 'own.md');
  const altered = async (from, to) => {
    await fsLink(from, to);
    appendFileSync(to, 'tampered');
  };
  await assert.rejects(
    createNoClobber(context, own, 'content\n', { tempPrefix: PREFIX, fs: { link: altered } }),
    { code: 'WRITE_FAILED', message: /failed verification.*content differs/ },
  );
  assert.equal(existsSync(own), false, 'the own, altered file is removed');
  assert.deepEqual(readdirSync(directory), []);

  const foreign = join(directory, 'foreign.md');
  const replaced = async (from, to) => {
    await fsLink(from, to);
    unlinkSync(to);
    writeFileSync(to, 'foreign\n');
  };
  await assert.rejects(
    createNoClobber(context, foreign, 'content\n', { tempPrefix: PREFIX, fs: { link: replaced } }),
    (error) =>
      error.code === 'WRITE_FAILED' &&
      /not the file just written/.test(error.message) &&
      error.foreignPath === foreign,
  );
  assert.equal(readFileSync(foreign, 'utf8'), 'foreign\n', 'a foreign file is never removed');
  assert.deepEqual(readdirSync(directory), ['foreign.md']);
});

// Invariant: a filesystem without hard links (link() failing with ENOTSUP, EOPNOTSUPP, EPERM,
// EXDEV or ENOSYS) still gets the report through an exclusive create of the target, with the exact
// content, mode 0600 and no temporary file left.
test('createNoClobber falls back to an exclusive create when link is unsupported', async (t) => {
  const { context, directory } = await reviewDirectory(t);
  for (const code of ['ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'EXDEV', 'ENOSYS']) {
    const target = join(directory, `${code}.md`);
    const unsupported = async () => {
      throw Object.assign(new Error(code), { code });
    };
    const result = await createNoClobber(context, target, '# report\n', {
      tempPrefix: PREFIX,
      fs: { link: unsupported },
    });
    assert.deepEqual(result, { created: true, bytes: 9 }, code);
    assert.equal(readFileSync(target, 'utf8'), '# report\n', code);
    assert.equal(lstatSync(target).mode & 0o777, 0o600, code);
    unlinkSync(target);
    assert.deepEqual(readdirSync(directory), [], code);
  }
});

// Invariant: the fallback keeps no-clobber: a name taken before the exclusive create is EEXIST and
// the existing file stays; a failed fallback write removes only its own file; a link() failure
// outside the unsupported set stays a WRITE_FAILED that creates nothing.
test('createNoClobber fallback never replaces a taken name and cleans up a failed write', async (t) => {
  const { context, directory } = await reviewDirectory(t);
  const taken = join(directory, 'taken.md');
  const raced = async (_from, to) => {
    writeFileSync(to, 'foreign\n');
    throw Object.assign(new Error('EXDEV'), { code: 'EXDEV' });
  };
  const result = await createNoClobber(context, taken, 'mine\n', {
    tempPrefix: PREFIX,
    fs: { link: raced },
  });
  assert.deepEqual(result, { created: false, code: 'EEXIST' });
  assert.equal(readFileSync(taken, 'utf8'), 'foreign\n');
  assert.deepEqual(readdirSync(directory), ['taken.md']);
  unlinkSync(taken);

  const failing = join(directory, 'failing.md');
  const unsupported = async () => {
    throw Object.assign(new Error('ENOTSUP'), { code: 'ENOTSUP' });
  };
  const open = async (file, ...rest) => {
    const handle = await fsOpen(file, ...rest);
    if (file !== failing) return handle;
    return {
      stat: (...args) => handle.stat(...args),
      sync: () => handle.sync(),
      close: () => handle.close(),
      writeFile: async () => {
        await handle.writeFile('par');
        throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
      },
    };
  };
  await assert.rejects(
    createNoClobber(context, failing, 'content\n', {
      tempPrefix: PREFIX,
      fs: { link: unsupported, open },
    }),
    { code: 'WRITE_FAILED', message: /cannot write .*failing\.md: ENOSPC/ },
  );
  assert.deepEqual(readdirSync(directory), [], 'the partial fallback file is removed');

  const broken = async () => {
    throw Object.assign(new Error('EIO'), { code: 'EIO' });
  };
  await assert.rejects(
    createNoClobber(context, join(directory, 'eio.md'), 'x\n', {
      tempPrefix: PREFIX,
      fs: { link: broken },
    }),
    { code: 'WRITE_FAILED', message: /cannot create .*eio\.md: EIO/ },
  );
  assert.deepEqual(readdirSync(directory), []);
});

// Invariant: a temporary file of the same family older than one hour is pruned; a fresh one and
// any other name stay.
test('createNoClobber prunes stale temporary files of its own family only', async (t) => {
  const { context, directory } = await reviewDirectory(t);
  const stale = join(directory, `${PREFIX}${'a'.repeat(16)}.tmp`);
  const fresh = join(directory, `${PREFIX}${'b'.repeat(16)}.tmp`);
  const other = join(directory, `.other-${'c'.repeat(16)}.tmp`);
  for (const file of [stale, fresh, other]) writeFileSync(file, 'x');
  const old = (Date.now() - NO_CLOBBER_TEMP_MAX_AGE_MS - 60_000) / 1000;
  utimesSync(stale, old, old);
  utimesSync(other, old, old);
  const result = await createNoClobber(context, join(directory, 'r.md'), 'r\n', {
    tempPrefix: PREFIX,
  });
  assert.equal(result.created, true);
  assert.equal(existsSync(stale), false);
  assert.equal(existsSync(fresh), true);
  assert.equal(existsSync(other), true);
  assert.equal(NO_CLOBBER_TEMP_MAX_AGE_MS, 60 * 60 * 1000);
});

// Invariant: the create passes the runtime-state guard first; a refusal creates nothing, and the
// temporary family is a closed name shape.
test('createNoClobber refuses an unguarded target and a malformed prefix', async (t) => {
  const { context, directory } = await reviewDirectory(t, {
    ignore: '.effective-flow/*\n!.effective-flow/review/\n',
  });
  await assert.rejects(
    createNoClobber(context, join(directory, 'r.md'), 'r\n', { tempPrefix: PREFIX }),
    { code: 'RUNTIME_STATE_UNSAFE' },
  );
  assert.deepEqual(readdirSync(directory), []);
  for (const tempPrefix of [undefined, 'write-report-', '.write-report', '../x-', '.A-']) {
    await assert.rejects(
      createNoClobber(context, join(directory, 'r.md'), 'r\n', { tempPrefix }),
      { code: 'INVALID_INPUT' },
      String(tempPrefix),
    );
  }
  assert.deepEqual(readdirSync(directory), []);
});

// ---------------------------------------------------------------------------------------------
// Legacy removal classes and the listing-bound remover

function legacyContext(root) {
  return { runner: createSharedRunner(), env: gitBaseEnv(GIT_ENV), cwd: root };
}

function legacyDirectory(root) {
  const target = join(root, '.firmo');
  mkdirSync(join(target, 'review'), { recursive: true });
  writeFileSync(join(target, 'cache.json'), '{}\n');
  writeFileSync(join(target, 'review', 'a.md'), 'report\n');
  writeFileSync(join(root, 'outside.txt'), 'outside\n');
  symlinkSync(join(root, 'outside.txt'), join(target, 'link.txt'));
  return target;
}

// Invariant: the listing names every entry with type, size, device and inode and a SHA-256 for
// each regular file, without following a symlink; the remover deletes exactly that listing
// bottom-up and unlinks a symlink without touching its target.
test('removeLegacyListing deletes exactly the listing and never follows a symlink', async (t) => {
  const root = repository(t);
  const target = legacyDirectory(root);
  const listing = await guard.listLegacyTree(target);
  assert.deepEqual(
    listing.entries.map((entry) => [entry.path, entry.type, Boolean(entry.sha256)]),
    [
      ['cache.json', 'file', true],
      ['link.txt', 'symlink', false],
      ['review', 'directory', false],
      ['review/a.md', 'file', true],
    ],
  );
  const order = [];
  const { removed } = await guard.removeLegacyListing(legacyContext(root), target, listing, {
    beforeEntry: (relative) => order.push(relative),
  });
  assert.equal(removed, 5);
  assert.deepEqual(order, ['review/a.md', 'review', 'link.txt', 'cache.json', '']);
  assert.equal(existsSync(target), false);
  assert.equal(readFileSync(join(root, 'outside.txt'), 'utf8'), 'outside\n');
});

// Invariant (remover race): an entry added below a listed directory during the removal stops the
// item with LEGACY_CHANGED and reports how far it got; the unlisted entry survives.
test('removeLegacyListing: an entry added mid-walk is LEGACY_CHANGED with the partial state', async (t) => {
  const root = repository(t);
  const target = legacyDirectory(root);
  const listing = await guard.listLegacyTree(target);
  await assert.rejects(
    guard.removeLegacyListing(legacyContext(root), target, listing, {
      beforeEntry: (relative) => {
        if (relative === 'review') writeFileSync(join(target, 'review', 'new.txt'), 'new\n');
      },
    }),
    (error) =>
      error.code === 'LEGACY_CHANGED' && error.removed === 1 && error.remaining === 'review',
  );
  assert.ok(existsSync(join(target, 'review', 'new.txt')));
  assert.ok(existsSync(join(target, 'cache.json')));
});

test('removeLegacyListing: a same-length in-place legacy edit is preserved with partial progress', async (t) => {
  const root = repository(t);
  const target = legacyDirectory(root);
  const listing = await guard.listLegacyTree(target);
  const edited = join(target, 'cache.json');
  const entry = listing.entries.find((candidate) => candidate.path === 'cache.json');
  await assert.rejects(
    guard.removeLegacyListing(legacyContext(root), target, listing, {
      beforeEntry: (relative) => {
        if (relative !== 'cache.json') return;
        writeFileSync(edited, '[]\n');
        const info = lstatSync(edited, { bigint: true });
        for (const field of ['dev', 'ino', 'size']) {
          assert.equal(String(info[field]), entry[field]);
        }
      },
    }),
    { code: 'LEGACY_CHANGED', removed: 3, remaining: 'cache.json' },
  );
  assert.equal(readFileSync(edited, 'utf8'), '[]\n');
  assert.equal(existsSync(join(target, 'review')), false);
  assert.equal(existsSync(join(target, 'link.txt')), false);
  assert.equal(readFileSync(join(root, 'outside.txt'), 'utf8'), 'outside\n');
});

test('removeLegacyListing: a same-length in-place transitional config edit is preserved', async (t) => {
  const root = repository(t);
  const target = join(root, guard.TRANSITIONAL_CONFIG_FILE);
  mkdirSync(join(root, '.effective-flow'));
  writeFileSync(target, '{"value":1}\n');
  const listing = await guard.listLegacyTree(target);
  await assert.rejects(
    guard.removeLegacyListing(legacyContext(root), target, listing, {
      beforeEntry: (relative) => {
        assert.equal(relative, '');
        writeFileSync(target, '{"value":2}\n');
        const info = lstatSync(target, { bigint: true });
        for (const field of ['dev', 'ino', 'size']) {
          assert.equal(String(info[field]), listing.root[field]);
        }
      },
    }),
    { code: 'LEGACY_CHANGED', removed: 0, remaining: '' },
  );
  assert.equal(readFileSync(target, 'utf8'), '{"value":2}\n');
});

// Invariant (remover race): a directory of the chain swapped for a symlink mid-walk is
// UNSAFE_TARGET before any entry below it is touched, so nothing outside the listing is reached.
test('removeLegacyListing: a chain swapped mid-walk is UNSAFE_TARGET', async (t) => {
  const root = repository(t);
  const target = legacyDirectory(root);
  const listing = await guard.listLegacyTree(target);
  mkdirSync(join(root, 'decoy'));
  writeFileSync(join(root, 'decoy', 'a.md'), 'decoy\n');
  await assert.rejects(
    guard.removeLegacyListing(legacyContext(root), target, listing, {
      beforeEntry: (relative) => {
        if (relative !== 'review/a.md') return;
        renameSync(join(target, 'review'), join(root, 'moved'));
        symlinkSync(join(root, 'decoy'), join(target, 'review'));
      },
    }),
    (error) => error.code === 'UNSAFE_TARGET' && error.remaining === 'review/a.md',
  );
  assert.equal(readFileSync(join(root, 'decoy', 'a.md'), 'utf8'), 'decoy\n');
});

// Invariant: a listed file whose size or inode changed is LEGACY_CHANGED; a target outside the
// closed name list is UNSAFE_TARGET.
test('removeLegacyListing: a changed entry and a foreign name are refused', async (t) => {
  const root = repository(t);
  const target = legacyDirectory(root);
  const listing = await guard.listLegacyTree(target);
  appendFileSync(join(target, 'cache.json'), 'grown\n');
  await assert.rejects(
    guard.removeLegacyListing(legacyContext(root), target, listing),
    (error) => error.code === 'LEGACY_CHANGED' && error.remaining === 'cache.json',
  );
  mkdirSync(join(root, 'elsewhere'));
  await assert.rejects(
    guard.removeLegacyListing(legacyContext(root), join(root, 'elsewhere'), {
      root: { type: 'directory' },
      entries: [],
    }),
    { code: 'UNSAFE_TARGET' },
  );
});

// Invariant: the legacyRuntimeDirectory class reports every failed condition: tracked content,
// a missing marker, a marker for the other source or with a non-string `source`, a nested `.git`,
// and open carry-over. A legacy marker (no `source` key) certifies only a zero-open proof.
test('checkLegacyRuntimeDirectory reports every failed condition', async (t) => {
  const root = repository(t);
  const target = legacyDirectory(root);
  const context = legacyContext(root);
  const listing = await guard.listLegacyTree(target);
  assert.deepEqual(
    await guard.checkLegacyRuntimeDirectory(context, target, {
      marker: { version: 1, source: '.firmo' },
      listing,
      open: [],
    }),
    [],
  );
  for (const marker of [
    null,
    { version: 1, source: null },
    { version: 2 },
    { version: 1, source: '.sf-plugin' },
  ]) {
    assert.deepEqual(
      (await guard.checkLegacyRuntimeDirectory(context, target, { marker, listing, open: [] })).map(
        (failure) => failure.code,
      ),
      ['LEGACY_UNMIGRATED'],
      JSON.stringify(marker),
    );
  }
  assert.equal(guard.isLegacyMigrationMarker({ version: 1 }), true);
  assert.equal(guard.isLegacyMigrationMarker({ version: 1, source: null }), false);
  assert.deepEqual(
    await guard.checkLegacyRuntimeDirectory(context, target, {
      marker: { version: 1 },
      listing,
      open: [],
    }),
    [],
  );
  assert.deepEqual(
    (
      await guard.checkLegacyRuntimeDirectory(context, target, {
        marker: { version: 1 },
        listing,
        open: [{ path: '.firmo/x' }],
      })
    ).map((failure) => failure.code),
    ['CARRY_OVER_OPEN'],
  );
  mkdirSync(join(target, '.worktrees', 'wt'), { recursive: true });
  writeFileSync(join(target, '.worktrees', 'wt', '.git'), 'gitdir: x\n');
  spawnSync('git', ['-C', root, 'add', '-f', '.firmo/cache.json'], { env: GIT_ENV });
  const failures = await guard.checkLegacyRuntimeDirectory(context, target, {
    marker: { version: 1, source: '.firmo' },
    listing: await guard.listLegacyTree(target),
    open: [{ path: '.firmo/x' }],
  });
  assert.deepEqual(
    failures.map((failure) => [failure.code, failure.reason]),
    [
      ['LEGACY_TRACKED', undefined],
      ['NOT_ELIGIBLE', 'nested-git'],
      ['CARRY_OVER_OPEN', undefined],
    ],
  );
  await assert.rejects(
    guard.checkLegacyRuntimeDirectory(context, join(root, '.effective-flow'), {
      marker: null,
      listing,
      open: [],
    }),
    { code: 'UNSAFE_TARGET' },
  );
});

// Invariant: the legacyConfigFile class refuses a live configuration (locator step 3 or 4) and a
// missing decision, and admits only its closed list of names.
test('checkLegacyConfigFile refuses a live configuration and a missing decision', async (t) => {
  const root = repository(t);
  const context = legacyContext(root);
  mkdirSync(join(root, '.effective-flow'));
  const target = join(root, '.effective-flow', 'config.json');
  writeFileSync(target, '{}\n');
  const codes = async (options) =>
    (await guard.checkLegacyConfigFile(context, target, options)).map((failure) => [
      failure.code,
      failure.reason,
    ]);
  assert.deepEqual(await codes({ locatorStep: 1, decision: 'complete' }), []);
  assert.deepEqual(await codes({ locatorStep: 0, decision: 'discarded' }), []);
  assert.deepEqual(await codes({ locatorStep: 3, decision: 'complete' }), [
    ['NOT_ELIGIBLE', 'live-configuration'],
  ]);
  assert.deepEqual(await codes({ locatorStep: 2, decision: undefined }), [
    ['CARRY_OVER_OPEN', 'decision-required'],
  ]);
  await assert.rejects(
    guard.checkLegacyConfigFile(context, join(root, 'config.json'), { locatorStep: 1 }),
    { code: 'UNSAFE_TARGET' },
  );
});
