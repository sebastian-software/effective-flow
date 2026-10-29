import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import * as guard from '../src/scripts/runtime-state-guard.mjs';
import * as diffBaseline from '../src/scripts/diff-baseline-core.mjs';
import { createProcessRunner as createSharedRunner } from '../src/scripts/process-runner.mjs';

const {
  RuntimeStateError,
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
    'O_NOFOLLOW',
    'RUNTIME_STATE_DIR',
    'RuntimeStateError',
    'asBuffer',
    'assertDirectoryChain',
    'atomicWrite',
    'commonDir',
    'ensureGuardedDirectory',
    'errorDetail',
    'git',
    'gitBaseEnv',
    'gitText',
    'guardTarget',
    'guardedMkdir',
    'guardedRmdir',
    'guardedUnlink',
    'relativeToRoot',
    'requireToplevel',
    'resolveDirectory',
    'resolveRuntimeRoot',
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
