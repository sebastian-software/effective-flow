// `worktree reuse-facts` and the derivation of `worktree-reuse-facts-core.mjs` against real Git
// fixtures: a main checkout with an `origin` remote whose `develop` is the base, and harness
// checkouts in every reuse case. Invariant: only a clean checkout with nothing beyond the fresh base
// adopts its host branch (`adopted`) or gets a created one (`created`); everything else keeps
// today's behaviour (`existing`) and names why.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  branchNameDiscloses,
  creatableBranch,
  deriveReuseFacts,
} from '../src/scripts/worktree-reuse-facts-core.mjs';
import {
  GIT_ENV,
  call,
  expectError,
  expectOk,
  git,
  repository,
} from './support/worktree-fixtures.mjs';

const BASE = { baseRef: 'origin/develop', localBaseBranch: 'develop' };

// A main checkout on `main` whose `origin` (a bare repository) carries `develop`.
function remoteRepository(t) {
  const root = repository(t, 'effective-flow-reuse-facts-');
  const origin = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-reuse-origin-')));
  t.after(() => rmSync(origin, { recursive: true, force: true }));
  git(origin, 'init', '-q', '--bare');
  git(root, 'remote', 'add', 'origin', origin);
  git(root, 'push', '-q', 'origin', 'main:develop');
  git(root, 'fetch', '-q', 'origin');
  return { root, origin };
}

// Advances `branch` on the remote from a separate clone, so only a fetch brings it in.
function pushRemote(t, origin, branch, file, start = 'develop') {
  const clone = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-reuse-clone-')));
  t.after(() => rmSync(clone, { recursive: true, force: true }));
  git(clone, 'clone', '-q', origin, '.');
  git(clone, 'switch', '-q', '-C', branch, `origin/${start}`);
  writeFileSync(join(clone, file), `${file}\n`);
  git(clone, 'add', file);
  git(clone, 'commit', '-q', '-m', file);
  git(clone, 'push', '-q', 'origin', `${branch}:${branch}`);
  return git(clone, 'rev-parse', 'HEAD');
}

function harness(root, name, ...args) {
  const path = join(root, '.effective-flow', name);
  git(root, 'worktree', 'add', '-q', ...args.flatMap((arg) => (arg === '@' ? [path] : [arg])));
  return realpathSync(path);
}

function facts(root, executionRoot, extra = {}) {
  return call('worktree reuse-facts', {
    cwd: root,
    executionRoot,
    ...BASE,
    visibility: 'standard',
    ...extra,
  });
}

test('a clean host branch at the base is adopted without a fast-forward', async (t) => {
  const { root } = remoteRepository(t);
  const linked = harness(root, 'thread', '-b', 't3code/thread', '@', 'origin/develop');
  const result = expectOk(await facts(root, linked));
  assert.equal(result.branchSource, 'adopted');
  assert.equal(result.branch, 't3code/thread');
  assert.equal(result.fastForward, false);
  assert.equal(result.baseOid, git(root, 'rev-parse', 'origin/develop'));
  assert.equal(result.head, result.baseOid);
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.fetch, { base: 'fetched', upstream: 'fetched', error: null });
  assert.equal(result.upstream.ref, 'refs/remotes/origin/develop');
});

test('a host branch behind the fresh base is adopted with a fast-forward', async (t) => {
  const { root, origin } = remoteRepository(t);
  const linked = harness(root, 'thread', '-b', 't3code/thread', '@', 'origin/develop');
  const before = git(linked, 'rev-parse', 'HEAD');
  const advanced = pushRemote(t, origin, 'develop', 'next.txt');
  const result = expectOk(await facts(root, linked));
  assert.equal(result.branchSource, 'adopted');
  assert.equal(result.fastForward, true);
  assert.equal(result.head, before);
  assert.equal(result.baseOid, advanced, 'the fetch brought the base in');
  assert.equal(result.behindBase, 1);
  // The upstream is the base itself: its commits are missing from HEAD but not foreign.
  assert.equal(result.upstream.missing, 1);
  assert.equal(result.upstream.foreign, 0);
});

test('dirty, untracked and ahead checkouts keep today behaviour', async (t) => {
  const { root } = remoteRepository(t);
  const dirty = harness(root, 'dirty', '-b', 'dirty', '@', 'origin/develop');
  writeFileSync(join(dirty, 'base.txt'), 'changed\n');
  assert.deepEqual(expectOk(await facts(root, dirty)).reasons, ['dirty']);

  const untracked = harness(root, 'untracked', '-b', 'untracked', '@', 'origin/develop');
  writeFileSync(join(untracked, 'notes.txt'), 'notes\n');
  const loose = expectOk(await facts(root, untracked));
  assert.equal(loose.branchSource, 'existing');
  assert.equal(loose.untracked, 1);
  assert.deepEqual(loose.reasons, ['untracked']);

  const ahead = harness(root, 'ahead', '-b', 'ahead', '@', 'origin/develop');
  writeFileSync(join(ahead, 'work.txt'), 'work\n');
  git(ahead, 'add', 'work.txt');
  git(ahead, 'commit', '-q', '-m', 'work');
  const beyond = expectOk(await facts(root, ahead));
  assert.equal(beyond.branchSource, 'existing');
  assert.equal(beyond.commitsBeyondBase, 1);
  assert.equal(beyond.headAncestorOfBase, false);
  assert.deepEqual(beyond.reasons, ['ahead-of-base']);
});

test('an upstream commit absent from HEAD and the base keeps today behaviour', async (t) => {
  const { root, origin } = remoteRepository(t);
  const linked = harness(root, 'thread', '-b', 'feature-x', '@', 'origin/develop');
  pushRemote(t, origin, 'feature-x', 'foreign.txt');
  git(root, 'fetch', '-q', 'origin');
  git(linked, 'branch', '-q', '--set-upstream-to=origin/feature-x', 'feature-x');
  const result = expectOk(await facts(root, linked));
  assert.equal(result.branchSource, 'existing');
  assert.equal(result.upstream.foreign, 1);
  assert.deepEqual(result.reasons, ['foreign-upstream']);
});

test('a detached checkout and a clean base-branch checkout get a created branch', async (t) => {
  const { root } = remoteRepository(t);
  const detached = harness(root, 'task', '--detach', '@', 'origin/develop');
  const task = expectOk(await facts(root, detached));
  assert.equal(task.branchSource, 'created');
  assert.equal(task.detached, true);
  assert.equal(task.branch, null);
  assert.equal(task.upstream, null);
  assert.equal(task.creationOid, task.baseOid);

  const onBase = harness(root, 'base', '-b', 'develop', '@', 'origin/develop');
  const base = expectOk(await facts(root, onBase));
  assert.equal(base.branchSource, 'created');
  assert.equal(base.headIsBaseBranch, true);

  // The same base-branch checkout with an untracked file keeps today's behaviour.
  writeFileSync(join(onBase, 'notes.txt'), 'notes\n');
  assert.deepEqual(expectOk(await facts(root, onBase)).reasons, ['untracked']);
});

test('in hidden mode a host branch name that names the tool keeps today behaviour', async (t) => {
  const { root } = remoteRepository(t);
  const linked = harness(root, 'thread', '-b', 'effective-flow/build/x', '@', 'origin/develop');
  assert.equal(expectOk(await facts(root, linked)).branchSource, 'adopted');
  const hidden = expectOk(await facts(root, linked, { visibility: 'hidden' }));
  assert.equal(hidden.branchSource, 'existing');
  assert.equal(hidden.nameDiscloses, true);
  assert.deepEqual(hidden.reasons, ['name-discloses']);
  assert.equal(branchNameDiscloses('t3code/thread', 'hidden'), false);
  assert.equal(branchNameDiscloses('effective-flow/x', 'standard'), false);
});

test('a failed fetch keeps today behaviour and reports a redacted diagnostic', async (t) => {
  const { root, origin } = remoteRepository(t);
  const linked = harness(root, 'thread', '-b', 't3code/thread', '@', 'origin/develop');
  rmSync(origin, { recursive: true, force: true });
  const result = expectOk(await facts(root, linked));
  assert.equal(result.branchSource, 'existing');
  assert.equal(result.fetch.base, 'failed');
  assert.equal(typeof result.fetch.error, 'string');
  assert.deepEqual(result.reasons, ['fetch-failed']);
});

test('reuse-facts refuses the main checkout and a base ref outside the recorded pair', async (t) => {
  const { root } = remoteRepository(t);
  const linked = harness(root, 'thread', '-b', 't3code/thread', '@', 'origin/develop');
  expectError(await facts(root, root), 'INVALID_ROOT');
  expectError(await facts(root, linked, { baseRef: 'origin/main' }), 'INVALID_INPUT');
  expectError(await facts(root, linked, { baseRef: 'elsewhere/develop' }), 'INVALID_INPUT');
  expectError(await facts(root, linked, { visibility: 'secret' }), 'INVALID_INPUT');
});

// Invariant: the re-derivation of `authorize-execution` fetches nothing and reads the refs an
// earlier fetch left.
test('without a fetch the derivation reads the existing refs only', async (t) => {
  const { root, origin } = remoteRepository(t);
  const linked = harness(root, 'thread', '-b', 't3code/thread', '@', 'origin/develop');
  pushRemote(t, origin, 'develop', 'next.txt');
  const calls = [];
  const gitAt = (args) => {
    calls.push(args);
    const result = spawnSync('git', ['-C', linked, ...args], { env: GIT_ENV, encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };
  const result = await deriveReuseFacts(
    { ...BASE, visibility: 'standard', fetch: false },
    { git: gitAt },
  );
  assert.equal(result.fastForward, false, 'the unfetched base is the old one');
  assert.deepEqual(result.fetch, { base: 'skipped', upstream: 'skipped', error: null });
  assert.equal(
    calls.some((args) => args.includes('fetch')),
    false,
  );
});

// Invariant: a clean detached checkout strictly behind the fresh base is still `created`, and
// its delivery branch starts at the fresh base, not at HEAD.
test('a detached checkout behind the fresh base is created at the fresh base', async (t) => {
  const { root, origin } = remoteRepository(t);
  const detached = harness(root, 'task', '--detach', '@', 'origin/develop');
  const before = git(detached, 'rev-parse', 'HEAD');
  const advanced = pushRemote(t, origin, 'develop', 'next.txt');
  const result = expectOk(await facts(root, detached));
  assert.equal(result.branchSource, 'created');
  assert.equal(result.head, before);
  assert.equal(result.behindBase, 1);
  assert.equal(result.creationOid, advanced);
  assert.equal(result.fastForward, false);
});

// Invariant: a fetch that leaves the tracking ref behind FETCH_HEAD (a refspec that does not
// map the branch) is `failed` with `tracking-stale`, so the facts never read a stale base.
test('a fetch that leaves the tracking ref stale keeps today behaviour', async (t) => {
  const { root, origin } = remoteRepository(t);
  const linked = harness(root, 'thread', '-b', 't3code/thread', '@', 'origin/develop');
  git(root, 'config', 'remote.origin.fetch', '+refs/heads/main:refs/remotes/origin/main');
  const stale = git(root, 'rev-parse', 'origin/develop');
  pushRemote(t, origin, 'develop', 'next.txt');
  const result = expectOk(await facts(root, linked));
  assert.equal(result.fetch.base, 'failed');
  assert.equal(result.fetch.error, 'tracking-stale');
  assert.equal(result.baseOid, stale);
  assert.equal(result.branchSource, 'existing');
  assert.deepEqual(result.reasons, ['fetch-failed']);
});

// Invariant: `check-ref-format --branch` expands `@{-N}` to the previously checked-out branch,
// so a name with `@{` is never a valid base or created branch, even where that expansion would name
// a free branch.
test('a branch name with @{ is refused', async (t) => {
  const { root } = remoteRepository(t);
  const linked = harness(root, 'thread', '-b', 't3code/thread', '@', 'origin/develop');
  git(linked, 'switch', '-q', '-c', 'gone');
  git(linked, 'switch', '-q', 't3code/thread');
  git(linked, 'branch', '-q', '-D', 'gone');
  const gitAt = (args) => {
    const result = spawnSync('git', ['-C', linked, ...args], { env: GIT_ENV, encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };
  assert.equal(
    spawnSync('git', ['-C', linked, 'check-ref-format', '--branch', '@{-1}'], {
      env: GIT_ENV,
      encoding: 'utf8',
    }).stdout.trim(),
    'gone',
    'Git itself expands the name',
  );
  assert.equal(await creatableBranch(gitAt, '@{-1}', 'standard'), false);
  assert.equal(await creatableBranch(gitAt, 'feature@{x}', 'standard'), false);
  assert.equal(await creatableBranch(gitAt, 'feature', 'standard'), true);
  expectError(
    await facts(root, linked, { baseRef: 'origin/@{-1}', localBaseBranch: '@{-1}' }),
    'INVALID_INPUT',
  );
});
