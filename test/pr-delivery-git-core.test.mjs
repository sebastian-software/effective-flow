// The git-only evidence of a pull request's delivery, against real temporary repositories: the
// plan-only evidence and the local merge proof. The runner is the shipped process runner, except
// where a test injects a Git version.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { createProcessRunner } from '../src/scripts/process-runner.mjs';
import {
  MAX_CONFLICTED_PATHS,
  MERGE_PROOF_MINIMUM_GIT_VERSION,
  PrDeliveryGitError,
  archivePathFor,
  localMergeProof,
  meetsGitVersion,
  parseRangeInput,
  planOnlyEvidence,
  readGitVersion,
} from '../src/scripts/pr-delivery-git-core.mjs';

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
};
const PLAN = 'docs/plan/2026-08-20-plan.md';
const ARCHIVE = 'docs/plan/archive/2026-08-20-plan.md';

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { env: GIT_ENV });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.toString('utf8').trim();
}

function write(root, file, content) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), content);
}

function commit(root, message, files = {}, removed = []) {
  for (const [file, content] of Object.entries(files)) write(root, file, content);
  git(root, 'add', '-A');
  for (const file of removed) git(root, 'rm', '-q', '--', file);
  git(root, 'commit', '-q', '--allow-empty', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

// A repository whose `base` commit is published as `refs/remotes/origin/develop`, the ref the helpers
// read. `build(root)` makes the head on top of `base` or of a later base commit.
function repository(
  t,
  { files = { 'shared.txt': 'one\ntwo\nthree\n', [ARCHIVE]: 'archived\n' } } = {},
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-pr-delivery-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q', '--initial-branch=develop');
  const base = commit(root, 'base', files);
  git(root, 'update-ref', 'refs/remotes/origin/develop', base);
  return { root, base };
}

function branchFrom(root, commitish, name) {
  git(root, 'checkout', '-q', '-b', name, commitish);
}

const runner = createProcessRunner();
const ROOT_INPUT = (root, headSha) => ({ cwd: root, headSha, baseRef: 'develop' });

async function evidence(root, headSha, extra = {}) {
  return planOnlyEvidence({ ...ROOT_INPUT(root, headSha), planPath: PLAN, ...extra }, { runner });
}

function objectSet(root) {
  return git(root, 'cat-file', '--batch-all-objects', '--batch-check')
    .split('\n')
    .filter(Boolean)
    .sort();
}

test('archivePathFor places the plan in the archive directory beside it', () => {
  assert.equal(archivePathFor(PLAN), ARCHIVE);
  assert.equal(archivePathFor('plan.md'), 'archive/plan.md');
  assert.equal(archivePathFor('.effective-flow/plan/x.md'), '.effective-flow/plan/archive/x.md');
});

test('parseRangeInput accepts a full object id and a bare branch, and rejects everything else', () => {
  const ok = { cwd: '/work', headSha: 'A'.repeat(40), baseRef: 'develop' };
  assert.deepEqual(parseRangeInput(ok), {
    cwd: '/work',
    headSha: 'a'.repeat(40),
    baseRef: 'develop',
  });
  for (const bad of [
    { ...ok, cwd: 'relative' },
    { ...ok, headSha: 'main' },
    { ...ok, headSha: 'abc123' },
    { ...ok, baseRef: '--upload-pack=x' },
    { ...ok, baseRef: '' },
    undefined,
  ]) {
    assert.throws(
      () => parseRangeInput(bad),
      (error) => error.code === 'INVALID_INPUT',
    );
  }
});

test('planOnlyEvidence reports a delivery when the head changes anything beyond the plan and its archive', async (t) => {
  const { root, base } = repository(t);
  branchFrom(root, base, 'feature');
  const head = commit(root, 'feature', { 'src/feature.txt': 'x\n' });
  const result = await evidence(root, head);
  assert.equal(result.planOnly, false);
  assert.equal(result.changedPathCount, 1);
  assert.equal(result.baseCommit, base);
  assert.equal(result.mergeBase, base);
});

test('planOnlyEvidence reports plan-only for the plan, its archive and an empty diff', async (t) => {
  const { root, base } = repository(t);
  branchFrom(root, base, 'plan');
  const planned = commit(root, 'plan', { [PLAN]: 'plan\n' });
  assert.deepEqual(
    { ...(await evidence(root, planned)), baseCommit: undefined, mergeBase: undefined },
    { planOnly: true, changedPathCount: 1, baseCommit: undefined, mergeBase: undefined },
  );
  // Archival moves the plan: with renames off, the old path is a deletion and the new one an add.
  const archived = commit(root, 'archive', { [ARCHIVE]: 'plan\n' }, [PLAN]);
  const moved = await evidence(root, archived);
  assert.equal(moved.planOnly, true);
  // An empty diff carries no delivery either.
  branchFrom(root, base, 'empty');
  const empty = commit(root, 'empty');
  const none = await evidence(root, empty);
  assert.equal(none.planOnly, true);
  assert.equal(none.changedPathCount, 0);
});

test('planOnlyEvidence counts the deletion of the archive path as plan-only', async (t) => {
  const { root, base } = repository(t);
  branchFrom(root, base, 'drop');
  const head = commit(root, 'drop archive', {}, [ARCHIVE]);
  const result = await evidence(root, head);
  assert.equal(result.planOnly, true);
  assert.equal(result.changedPathCount, 1);
  // The same deletion beside any other path is a delivery.
  const more = commit(root, 'more', { 'src/a.txt': 'a\n' });
  assert.equal((await evidence(root, more)).planOnly, false);
});

test('planOnlyEvidence treats an unarchived delivery, the plan still present beside other paths, as a delivery', async (t) => {
  const { root, base } = repository(t);
  branchFrom(root, base, 'unarchived');
  const head = commit(root, 'plan and code', { [PLAN]: 'plan\n', 'src/feature.txt': 'x\n' });
  const result = await evidence(root, head);
  assert.equal(result.planOnly, false);
  assert.equal(result.changedPathCount, 2);
  // An explicit archive path replaces the derived one.
  const custom = await evidence(root, head, { archivePath: 'src/feature.txt' });
  assert.equal(custom.planOnly, true);
});

test("planOnlyEvidence diffs from the merge base, so base-only commits are not the head's changes", async (t) => {
  const { root, base } = repository(t);
  branchFrom(root, base, 'plan');
  const head = commit(root, 'plan', { [PLAN]: 'plan\n' });
  git(root, 'checkout', '-q', 'develop');
  const moved = commit(root, 'base moved on', { 'src/other.txt': 'o\n' });
  git(root, 'update-ref', 'refs/remotes/origin/develop', moved);
  const result = await evidence(root, head);
  assert.equal(result.planOnly, true);
  assert.equal(result.baseCommit, moved);
  assert.equal(result.mergeBase, base);
});

test('planOnlyEvidence names a missing ref, a missing head, bad input and a missing repository', async (t) => {
  const { root, base } = repository(t);
  const code = async (call) => {
    try {
      await call();
    } catch (error) {
      assert.ok(error instanceof PrDeliveryGitError);
      return error.code;
    }
    return 'none';
  };
  assert.equal(await code(() => evidence(root, base, { baseRef: 'missing' })), 'BASE_REF_MISSING');
  assert.equal(await code(() => evidence(root, 'e'.repeat(40))), 'HEAD_MISSING');
  assert.equal(await code(() => evidence(root, base, { planPath: '/abs.md' })), 'INVALID_INPUT');
  assert.equal(await code(() => evidence(root, base, { planPath: 'a/../b.md' })), 'INVALID_INPUT');
  assert.equal(
    await code(() => planOnlyEvidence({ ...ROOT_INPUT(root, base), planPath: PLAN }, {})),
    'INVALID_INPUT',
  );
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-no-repo-')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const result = spawnSync('git', ['-C', outside, 'rev-parse', '--git-dir'], { env: GIT_ENV });
  if (result.status !== 0) {
    assert.equal(await code(() => evidence(outside, base)), 'GIT_FAILED');
  }
});

test('planOnlyEvidence refuses a shallow repository', async (t) => {
  const { root, base } = repository(t);
  commit(root, 'second', { 'second.txt': '2\n' });
  const shallow = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-shallow-')));
  t.after(() => rmSync(shallow, { recursive: true, force: true }));
  git(shallow, 'init', '-q', '--initial-branch=develop');
  git(shallow, 'fetch', '-q', '--depth=1', `file://${root}`, 'develop:refs/remotes/origin/develop');
  await assert.rejects(
    () => evidence(shallow, git(shallow, 'rev-parse', 'refs/remotes/origin/develop')),
    (error) => error.code === 'SHALLOW_REPOSITORY',
  );
  assert.ok(base);
});

test('readGitVersion and meetsGitVersion compare against the 2.38 minimum', async () => {
  assert.deepEqual(MERGE_PROOF_MINIMUM_GIT_VERSION, [2, 38]);
  assert.equal(meetsGitVersion([2, 38]), true);
  assert.equal(meetsGitVersion([2, 37]), false);
  assert.equal(meetsGitVersion([3, 0]), true);
  assert.equal(meetsGitVersion([1, 99]), false);
  assert.equal(meetsGitVersion(null), false);
  const fake = (stdout, status = 0) => ({
    runner: async () => ({ status, stdout, stderr: '' }),
    env: {},
  });
  assert.deepEqual(await readGitVersion(fake('git version 2.43.0\n'), '/work'), [2, 43]);
  assert.deepEqual(
    await readGitVersion(fake('git version 2.39.5 (Apple Git-154)\n'), '/work'),
    [2, 39],
  );
  assert.equal(await readGitVersion(fake('nonsense'), '/work'), null);
  assert.equal(await readGitVersion(fake('', 127), '/work'), null);
});

// The merge proof needs a Git that has `merge-tree --write-tree`; the injected-version test below
// covers an older one, so the real-repository cases are skipped on a host with an old Git.
async function realGitMeetsMinimum() {
  const version = await readGitVersion({ runner, env: process.env }, tmpdir());
  return meetsGitVersion(version);
}

function conflictingRepository(t) {
  const { root, base } = repository(t);
  branchFrom(root, base, 'head');
  const head = commit(root, 'head change', { 'shared.txt': 'one\nHEAD\nthree\n' });
  git(root, 'checkout', '-q', 'develop');
  const moved = commit(root, 'base change', { 'shared.txt': 'one\nBASE\nthree\n' });
  git(root, 'update-ref', 'refs/remotes/origin/develop', moved);
  return { root, head, moved };
}

test('localMergeProof reports clean for a head that merges without a conflict', async (t) => {
  if (!(await realGitMeetsMinimum())) return t.skip('Git older than 2.38');
  const { root, base } = repository(t);
  branchFrom(root, base, 'head');
  const head = commit(root, 'head change', { 'head.txt': 'h\n' });
  git(root, 'checkout', '-q', 'develop');
  const moved = commit(root, 'base change', { 'base.txt': 'b\n' });
  git(root, 'update-ref', 'refs/remotes/origin/develop', moved);
  const proof = await localMergeProof(ROOT_INPUT(root, head), { runner });
  assert.equal(proof.status, 'clean');
  assert.equal(proof.reason, null);
  assert.equal(proof.conflictCount, 0);
  assert.equal(proof.baseCommit, moved);
  assert.equal(proof.headSha, head);
  assert.match(proof.gitVersion, /^\d+\.\d+$/);
});

test('localMergeProof reports a conflict with the count of conflicted paths', async (t) => {
  if (!(await realGitMeetsMinimum())) return t.skip('Git older than 2.38');
  const { root, head, moved } = conflictingRepository(t);
  const proof = await localMergeProof(ROOT_INPUT(root, head), { runner });
  assert.equal(proof.status, 'conflict');
  assert.equal(proof.reason, null);
  assert.equal(proof.conflictCount, 1);
  assert.equal(proof.baseCommit, moved);
});

// Invariant: `conflictedPaths` is `[]` for a clean proof, null for an unavailable one, and for a
// conflict the unique reportable names sorted and cut at MAX_CONFLICTED_PATHS, while
// `conflictCount` keeps counting every unique name.
test('localMergeProof lists the conflicted paths, bounded', async (t) => {
  if (!(await realGitMeetsMinimum())) return t.skip('Git older than 2.38');
  assert.equal(MAX_CONFLICTED_PATHS, 20);
  const names = Array.from(
    { length: 25 },
    (_, i) => `conflict/f${String(24 - i).padStart(2, '0')}.txt`,
  );
  const files = Object.fromEntries(names.map((name) => [name, 'one\ntwo\nthree\n']));
  const { root, base } = repository(t, { files });
  branchFrom(root, base, 'head');
  const head = commit(
    root,
    'head change',
    Object.fromEntries(names.map((name) => [name, 'one\nHEAD\nthree\n'])),
  );
  git(root, 'checkout', '-q', 'develop');
  const moved = commit(
    root,
    'base change',
    Object.fromEntries(names.map((name) => [name, 'one\nBASE\nthree\n'])),
  );
  git(root, 'update-ref', 'refs/remotes/origin/develop', moved);
  const proof = await localMergeProof(ROOT_INPUT(root, head), { runner });
  assert.equal(proof.status, 'conflict');
  assert.equal(proof.conflictCount, 25);
  assert.equal(proof.conflictedPaths.length, 20);
  assert.deepEqual(proof.conflictedPaths, [...names].sort().slice(0, 20));

  const single = conflictingRepository(t);
  const one = await localMergeProof(ROOT_INPUT(single.root, single.head), { runner });
  assert.deepEqual(one.conflictedPaths, ['shared.txt']);

  const clean = repository(t);
  branchFrom(clean.root, clean.base, 'head');
  const cleanHead = commit(clean.root, 'head change', { 'head.txt': 'h\n' });
  const cleanProof = await localMergeProof(ROOT_INPUT(clean.root, cleanHead), { runner });
  assert.equal(cleanProof.status, 'clean');
  assert.deepEqual(cleanProof.conflictedPaths, []);

  const missing = await localMergeProof(ROOT_INPUT(clean.root, 'f'.repeat(40)), { runner });
  assert.equal(missing.status, 'unavailable');
  assert.equal(missing.conflictedPaths, null);
});

test("localMergeProof leaves the repository's object set, refs and working tree unchanged", async (t) => {
  if (!(await realGitMeetsMinimum())) return t.skip('Git older than 2.38');
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-proof-tmp-')));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  for (const clean of [true, false]) {
    const { root, base } = repository(t);
    branchFrom(root, base, 'head');
    const head = commit(root, 'head', {
      [clean ? 'head.txt' : 'shared.txt']: 'one\nHEAD\nthree\n',
    });
    git(root, 'checkout', '-q', 'develop');
    const moved = commit(root, 'base', { 'shared.txt': 'one\nBASE\nthree\n' });
    git(root, 'update-ref', 'refs/remotes/origin/develop', moved);
    // A merge writes new trees and blobs, so the objects they would be are listed before and after.
    const objectsBefore = objectSet(root);
    const refsBefore = git(root, 'for-each-ref');
    const statusBefore = git(root, 'status', '--porcelain');
    const proof = await localMergeProof(ROOT_INPUT(root, head), { runner, tmpdir: scratch });
    assert.equal(proof.status, clean ? 'clean' : 'conflict');
    assert.deepEqual(objectSet(root), objectsBefore, 'the object set is unchanged');
    assert.equal(git(root, 'for-each-ref'), refsBefore);
    assert.equal(git(root, 'status', '--porcelain'), statusBefore);
    assert.deepEqual(readdirSync(scratch), [], 'the private object directory is removed');
  }
});

test('localMergeProof is unavailable, never clean, when its ref or commit is missing', async (t) => {
  if (!(await realGitMeetsMinimum())) return t.skip('Git older than 2.38');
  const { root, base } = repository(t);
  const missingBase = await localMergeProof(
    { ...ROOT_INPUT(root, base), baseRef: 'gone' },
    { runner },
  );
  assert.equal(missingBase.status, 'unavailable');
  assert.equal(missingBase.reason, 'base-ref-missing');
  assert.equal(missingBase.conflictCount, null);
  const missingHead = await localMergeProof(ROOT_INPUT(root, 'f'.repeat(40)), { runner });
  assert.equal(missingHead.status, 'unavailable');
  assert.equal(missingHead.reason, 'head-missing');
  assert.equal(missingHead.baseCommit, null);
  await assert.rejects(
    () => localMergeProof({ ...ROOT_INPUT(root, base), headSha: 'main' }, { runner }),
    (error) => error.code === 'INVALID_INPUT',
  );
});

test('localMergeProof is unavailable with the git-version reason below Git 2.38 and runs no merge', async (t) => {
  const { root, base } = repository(t);
  const calls = [];
  const old = async (call) => {
    calls.push(call.args.slice(2));
    if (call.args.includes('--version'))
      return { status: 0, stdout: 'git version 2.37.1\n', stderr: '' };
    throw new Error('no other git call is expected');
  };
  const proof = await localMergeProof(ROOT_INPUT(root, base), { runner: old });
  assert.equal(proof.status, 'unavailable');
  assert.equal(proof.reason, 'git-version');
  assert.equal(proof.gitVersion, '2.37');
  assert.equal(proof.minimumGitVersion, '2.38');
  assert.deepEqual(calls, [['--version']]);

  const unreadable = await localMergeProof(ROOT_INPUT(root, base), {
    runner: async () => ({ status: 0, stdout: 'not git\n', stderr: '' }),
  });
  assert.equal(unreadable.status, 'unavailable');
  assert.equal(unreadable.reason, 'git-version-unreadable');
});

test('localMergeProof reads an unexpected merge-tree outcome as unavailable', async (t) => {
  const { root, base } = repository(t);
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-proof-tmp-')));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const withMergeTree = (mergeTree) => async (call) => {
    const args = call.args.slice(2).filter((argument) => argument !== '--no-replace-objects');
    if (args[0] === '--version') return { status: 0, stdout: 'git version 2.45.0\n', stderr: '' };
    if (args.includes('--is-shallow-repository'))
      return { status: 0, stdout: 'false\n', stderr: '' };
    if (args[0] === 'rev-parse' && args.includes('--git-path')) {
      return { status: 0, stdout: `${join(root, '.git', 'objects')}\n`, stderr: '' };
    }
    if (args[0] === 'rev-parse') return { status: 0, stdout: `${base}\n`, stderr: '' };
    if (args[0] === 'merge-tree') return mergeTree;
    throw new Error(`unexpected: ${args.join(' ')}`);
  };
  const cases = [
    [{ status: 0, stdout: 'nonsense\0', stderr: '' }, 'unexpected-output'],
    [{ status: 1, stdout: `${base}\0`, stderr: '' }, 'unexpected-output'],
    [
      { status: 128, stdout: '', stderr: 'fatal: refusing to merge unrelated histories' },
      'no-merge-base',
    ],
    [{ status: 128, stdout: '', stderr: 'fatal: boom' }, 'merge-tree-failed'],
    // A crash by another signal is no timeout.
    [{ status: null, signal: 'SIGSEGV', stdout: '', stderr: '' }, 'merge-tree-failed'],
  ];
  for (const [mergeTree, reason] of cases) {
    const proof = await localMergeProof(ROOT_INPUT(root, base), {
      runner: withMergeTree(mergeTree),
      tmpdir: scratch,
    });
    assert.equal(proof.status, 'unavailable', reason);
    assert.equal(proof.reason, reason);
    assert.deepEqual(readdirSync(scratch), [], 'the temporary directory is removed on every path');
  }
  // A conflict lists the conflicted paths once each, after the merged tree id.
  const conflict = await localMergeProof(ROOT_INPUT(root, base), {
    runner: withMergeTree({ status: 1, stdout: `${base}\0a.txt\0b.txt\0a.txt\0`, stderr: '' }),
    tmpdir: scratch,
  });
  assert.equal(conflict.status, 'conflict');
  assert.equal(conflict.conflictCount, 2);
  assert.deepEqual(conflict.conflictedPaths, ['a.txt', 'b.txt']);
});

// The real runner's result of a bounded stop, for both of its modes: the merge-tree call is swapped
// for a Node child that never exits, under a short bound, and everything else is the real Git.
test('localMergeProof reports a merge-tree stopped by its bound as timeout, in the shape the runner returns', async (t) => {
  if (!(await realGitMeetsMinimum())) return t.skip('Git older than 2.38');
  const { root, head } = conflictingRepository(t);
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-proof-tmp-')));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  for (const processGroup of [true, false]) {
    const mergeTreeCalls = [];
    const stalling = (call) => {
      if (!call.args.includes('merge-tree')) return runner(call);
      mergeTreeCalls.push(call);
      return runner({
        ...call,
        executable: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000)'],
        timeoutMs: 200,
        ...(processGroup ? {} : { processGroup: false }),
      });
    };
    const proof = await localMergeProof(ROOT_INPUT(root, head), {
      runner: stalling,
      tmpdir: scratch,
    });
    assert.equal(proof.status, 'unavailable', `processGroup ${processGroup}`);
    assert.equal(proof.reason, 'timeout', `processGroup ${processGroup}`);
    assert.equal(proof.conflictCount, null);
    assert.equal(mergeTreeCalls.length, 1);
    assert.equal(mergeTreeCalls[0].processGroup, true, 'the proof requests a process-group bound');
    assert.ok(mergeTreeCalls[0].timeoutMs > 0);
    assert.deepEqual(readdirSync(scratch), [], 'the temporary directory is removed');
  }
});

test('a failed removal of the temporary directory keeps the proof result', async (t) => {
  if (!(await realGitMeetsMinimum())) return t.skip('Git older than 2.38');
  const { root, head } = conflictingRepository(t);
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-proof-tmp-')));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const removed = [];
  const proof = await localMergeProof(ROOT_INPUT(root, head), {
    runner,
    tmpdir: scratch,
    removeDirectory: async (directory) => {
      removed.push(directory);
      throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' });
    },
  });
  assert.equal(proof.status, 'conflict');
  assert.equal(proof.conflictCount, 1);
  assert.equal(removed.length, 1);
  assert.ok(removed[0].startsWith(scratch));
});
