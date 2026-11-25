// The git-only evidence of a pull request's delivery, against real temporary repositories: the
// plan-only evidence, the local merge proof and the branch tree proofs cleanup deletes squash-merged
// delivery branches on. The runner is the shipped process runner, except where a test injects a Git
// version, a stalling call or a call recorder.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { createProcessRunner } from '../src/scripts/process-runner.mjs';
import {
  BRANCH_PROOF_REASONS,
  MERGE_PROOF_MINIMUM_GIT_VERSION,
  MERGE_PROOF_TIMEOUT_MS,
  PrDeliveryGitError,
  SQUASH_TREE_CANDIDATE_LIMIT,
  archivePathFor,
  branchProofRepository,
  branchSquashProof,
  branchTipProof,
  localMergeProof,
  meetsGitVersion,
  parseRangeInput,
  planOnlyEvidence,
  readGitVersion,
  verifyBranchProof,
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

// ---------------------------------------------------------------------------------------------
// Branch tree proofs

const LATER = () => Date.now() + 60_000;
const TWO = 'one\nTWO\nthree\n';

function publish(root) {
  const head = git(root, 'rev-parse', 'HEAD');
  git(root, 'update-ref', 'refs/remotes/origin/develop', head);
  return head;
}

// What a forge's squash merge leaves on the base: one commit with the branch's merged content.
function squashMerge(root, branch, message = `squash ${branch}`) {
  git(root, 'checkout', '-q', 'develop');
  git(root, 'merge', '-q', '--squash', branch);
  git(root, 'commit', '-q', '-m', message);
  return publish(root);
}

// The two passes cleanup runs for one branch: the cheap proofs, then the squash search only after
// `not-proven`.
async function proveBranch(root, tip, deps = { runner }) {
  const repository = await branchProofRepository(
    { cwd: root, baseRef: 'develop', deadline: LATER() },
    deps,
  );
  assert.equal(repository.reason, null, `repository state: ${repository.reason}`);
  const first = await branchTipProof({ cwd: root, tip, repository, deadline: LATER() }, deps);
  if (first.reason !== 'not-proven') return { repository, first, result: first };
  const result = await branchSquashProof({ cwd: root, tip, repository, deadline: LATER() }, deps);
  return { repository, first, result };
}

function recordingRunner(calls) {
  return (call) => {
    calls.push(call);
    return runner(call);
  };
}

function gitArgs(call) {
  return call.args.slice(2).filter((argument) => argument !== '--no-replace-objects');
}

// A feature branch changing `shared.txt`, squash-merged onto develop; `before`/`after` add base
// commits around the squash.
function squashedFeature(t, { files, before, after } = {}) {
  const { root, base } = repository(t, files ? { files } : undefined);
  branchFrom(root, base, 'feature');
  commit(root, 'feature one', { 'shared.txt': TWO });
  const tip = commit(root, 'feature two', { 'feature.txt': 'f\n' });
  git(root, 'checkout', '-q', 'develop');
  if (before) commit(root, 'base before', before);
  const squash = squashMerge(root, 'feature');
  if (after) commit(root, 'base after', after);
  return { root, base, tip, squash, head: publish(root) };
}

async function skipWithoutTreeProofs(t) {
  if (!(await realGitMeetsMinimum())) {
    t.skip('Git older than 2.38');
    return true;
  }
  return false;
}

test('a plain squash merge is proven by tip-tree against the base commit', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, tip, squash } = squashedFeature(t);
  const { result } = await proveBranch(root, tip);
  assert.deepEqual(result, { proof: 'tip-tree', proofCommit: squash, reason: null, detail: null });
});

test('a squash merge between other base commits is still proven by tip-tree', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, tip, head } = squashedFeature(t, {
    before: { 'other.txt': 'o\n' },
    after: { 'later.txt': 'l\n' },
  });
  const { result } = await proveBranch(root, tip);
  assert.equal(result.proof, 'tip-tree');
  assert.equal(result.proofCommit, head);
});

test('a squash the base later reverted is proven only by squash-tree, naming the squash commit', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, tip, squash } = squashedFeature(t);
  git(root, 'revert', '--no-edit', 'HEAD');
  publish(root);
  const { first, result } = await proveBranch(root, tip);
  assert.equal(first.reason, 'not-proven');
  assert.deepEqual(result, {
    proof: 'squash-tree',
    proofCommit: squash,
    reason: null,
    detail: null,
  });
});

test('a base edit after the squash that conflicts with the tip falls back to squash-tree', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, tip, squash } = squashedFeature(t, {
    after: { 'shared.txt': 'one\nTWO!\nthree\n' },
  });
  const { first, result } = await proveBranch(root, tip);
  assert.equal(first.reason, 'not-proven');
  assert.equal(result.proof, 'squash-tree');
  assert.equal(result.proofCommit, squash);
});

test('a squash a maintainer edited before committing is not proven', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, base } = repository(t);
  branchFrom(root, base, 'feature');
  const tip = commit(root, 'feature', { 'shared.txt': TWO });
  git(root, 'checkout', '-q', 'develop');
  git(root, 'merge', '-q', '--squash', 'feature');
  commit(root, 'edited squash', { 'shared.txt': 'one\nTWO edited\nthree\n' });
  publish(root);
  const { result } = await proveBranch(root, tip);
  assert.deepEqual(result, { proof: null, proofCommit: null, reason: 'not-proven', detail: null });
});

test('a branch with commits after its squash is not proven', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root } = squashedFeature(t);
  git(root, 'checkout', '-q', 'feature');
  const tip = commit(root, 'after the squash', { 'feature.txt': 'f\nmore\n' });
  const { result } = await proveBranch(root, tip);
  assert.equal(result.proof, null);
  assert.equal(result.reason, 'not-proven');
});

test('a net-zero branch against an empty base commit is empty-diff, never proven', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, base } = repository(t);
  branchFrom(root, base, 'feature');
  commit(root, 'change', { 'shared.txt': TWO });
  const tip = commit(root, 'revert', { 'shared.txt': 'one\ntwo\nthree\n' });
  git(root, 'checkout', '-q', 'develop');
  commit(root, 'empty base commit');
  publish(root);
  // Without the guard, merging the net-zero tip leaves the base tree unchanged.
  const { result } = await proveBranch(root, tip);
  assert.deepEqual(result, { proof: null, proofCommit: null, reason: 'empty-diff', detail: null });
});

test('a zero-commit branch is proven as an ancestor of the base', async (t) => {
  const { root, base } = repository(t);
  commit(root, 'base moved on', { 'other.txt': 'o\n' });
  const head = publish(root);
  const { result } = await proveBranch(root, base);
  assert.deepEqual(result, { proof: 'ancestor', proofCommit: head, reason: null, detail: null });
});

test('a squash candidate whose first parent does not contain the merge base is rejected', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, base } = repository(t);
  branchFrom(root, base, 'side');
  const mergeBase = commit(root, 'side', { 'other.txt': 'o\n' });
  branchFrom(root, mergeBase, 'feature');
  const tip = commit(root, 'feature', { 'shared.txt': TWO });
  git(root, 'checkout', '-q', 'develop');
  // The same change lands before the merge base is part of the base, then the base reaches the
  // merge base only through the later merge's second parent.
  commit(root, 'early equal change', { 'shared.txt': TWO });
  git(root, 'merge', '-q', '--no-ff', '-m', 'merge side', 'side');
  commit(root, 'undo the line', { 'shared.txt': 'one\ntwo\nthree\n' });
  publish(root);
  const calls = [];
  const { result } = await proveBranch(root, tip, { runner: recordingRunner(calls) });
  assert.equal(result.reason, 'not-proven');
  const ancestorChecks = calls
    .map(gitArgs)
    .filter((args) => args[0] === 'merge-base' && args[1] === '--is-ancestor');
  assert.ok(
    ancestorChecks.some((args) => args[2] === mergeBase && args[3] === base),
    'the early commit was a candidate and failed the merge-base ancestry guard',
  );
  assert.ok(
    !calls.map(gitArgs).some((args) => args.includes('merge-tree') && args.includes(base)),
    'no merge ran against the rejected candidate',
  );
});

test('a branch that merged the base before its squash is proven', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, base } = repository(t);
  branchFrom(root, base, 'feature');
  commit(root, 'feature one', { 'shared.txt': TWO });
  git(root, 'checkout', '-q', 'develop');
  commit(root, 'base moves', { 'other.txt': 'o\n' });
  git(root, 'checkout', '-q', 'feature');
  git(root, 'merge', '-q', '--no-ff', '-m', 'update branch', 'develop');
  const tip = commit(root, 'feature two', { 'feature.txt': 'f\n' });
  const squash = squashMerge(root, 'feature');
  const { result } = await proveBranch(root, tip);
  assert.equal(result.proof, 'tip-tree');
  assert.equal(result.proofCommit, squash);
});

test('a merge=ours path on a changed path is merge-attribute, and no squash search runs', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, tip } = squashedFeature(t, {
    files: { 'shared.txt': 'one\ntwo\nthree\n', '.gitattributes': 'shared.txt merge=ours\n' },
  });
  const { first, result } = await proveBranch(root, tip);
  assert.equal(first.reason, 'merge-attribute');
  assert.equal(result, first);
});

test('a base rename onto a merge-driver path, beside a branch edit, is merge-attribute and runs no driver', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, base } = repository(t, {
    files: { 'orig.txt': 'a\nb\nc\n', '.gitattributes': 'renamed.txt merge=drv\n' },
  });
  const marker = join(root, '..', `${root.split('/').pop()}-driver-ran`);
  t.after(() => rmSync(marker, { force: true }));
  git(root, 'config', 'merge.drv.driver', `touch '${marker}'`);
  branchFrom(root, base, 'feature');
  const tip = commit(root, 'edit', { 'orig.txt': 'a\nB\nc\n' });
  git(root, 'checkout', '-q', 'develop');
  commit(root, 'rename', { 'renamed.txt': 'a\nb\nc\n' }, ['orig.txt']);
  publish(root);
  const { result } = await proveBranch(root, tip);
  assert.equal(result.reason, 'merge-attribute');
  assert.equal(existsSync(marker), false, 'the merge driver never ran');
});

test('a configured merge.default driver never runs; the proof uses the text merge', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const lines = (second, ninth) =>
    ['1', second, '3', '4', '5', '6', '7', '8', ninth, '10'].join('\n') + '\n';
  const { root, base } = repository(t, { files: { 'lines.txt': lines('2', '9') } });
  const marker = join(root, '..', `${root.split('/').pop()}-default-driver-ran`);
  t.after(() => rmSync(marker, { force: true }));
  git(root, 'config', 'merge.default', 'evil');
  git(root, 'config', 'merge.evil.driver', `touch '${marker}'`);
  branchFrom(root, base, 'feature');
  const tip = commit(root, 'feature', { 'lines.txt': lines('TWO', '9') });
  squashMerge(root, 'feature');
  // A later base edit in another hunk of the same file makes the tip-tree merge a content merge.
  commit(root, 'base edit', { 'lines.txt': lines('TWO', 'NINE') });
  const head = publish(root);
  const { result } = await proveBranch(root, tip);
  assert.equal(result.proof, 'tip-tree');
  assert.equal(result.proofCommit, head);
  assert.equal(existsSync(marker), false, 'the merge.default driver never ran');
});

// A content merge of `lines.txt` (the base edited another hunk after the squash), so a merge driver
// named `text` would run on the tip-tree merge if the proof let it.
function contentMergeRepository(t, attributes) {
  const lines = (second, ninth) =>
    ['1', second, '3', '4', '5', '6', '7', '8', ninth, '10'].join('\n') + '\n';
  const files = { 'lines.txt': lines('2', '9') };
  if (attributes) files['.gitattributes'] = attributes;
  const { root, base } = repository(t, { files });
  const marker = join(root, '..', `${root.split('/').pop()}-text-driver-ran`);
  t.after(() => rmSync(marker, { force: true }));
  branchFrom(root, base, 'feature');
  const tip = commit(root, 'feature', { 'lines.txt': lines('TWO', '9') });
  const squash = squashMerge(root, 'feature');
  commit(root, 'base edit', { 'lines.txt': lines('TWO', 'NINE') });
  return { root, tip, squash, marker, head: publish(root) };
}

test('a configured merge.text driver is merge-attribute for an unspecified and a merge=text path, and never runs', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  for (const attributes of [undefined, 'lines.txt merge=text\n']) {
    const { root, tip, head, marker } = contentMergeRepository(t, attributes);
    // Without the driver the same history is proven, so the driver alone decides the outcome.
    assert.equal((await proveBranch(root, tip)).result.proof, 'tip-tree');
    git(root, 'config', 'merge.text.driver', `touch '${marker}'; true`);
    const calls = [];
    const { first, result } = await proveBranch(root, tip, { runner: recordingRunner(calls) });
    assert.equal(first.reason, 'merge-attribute', String(attributes));
    assert.equal(result, first);
    assert.equal(calls.filter((call) => gitArgs(call).includes('merge-tree')).length, 0);
    const searchCalls = [];
    const squashSearch = await branchSquashProof(
      {
        cwd: root,
        tip,
        repository: await branchProofRepository(
          { cwd: root, baseRef: 'develop', deadline: LATER() },
          { runner },
        ),
        deadline: LATER(),
      },
      { runner: recordingRunner(searchCalls) },
    );
    assert.equal(squashSearch.reason, 'merge-attribute');
    // A configured text driver refuses every candidate alike, so it ends the search at once: no
    // candidate's merge-base, attribute pre-check or merge follows the driver lookup.
    const searchArgs = searchCalls.map(gitArgs);
    const driverLookup = searchArgs.findIndex(
      (args) => args.includes('config') && args.includes('^merge\\.text\\.'),
    );
    assert.notEqual(driverLookup, -1, 'the squash search looks the text driver up');
    assert.deepEqual(
      searchArgs
        .slice(driverLookup + 1)
        .filter((args) => ['merge-base', 'check-attr', 'merge-tree'].some((c) => args.includes(c))),
      [],
    );
    const verified = await verifyBranchProof(
      {
        cwd: root,
        tip,
        baseRef: 'develop',
        proof: 'tip-tree',
        proofCommit: head,
        deadline: LATER(),
      },
      { runner },
    );
    assert.equal(verified.reason, 'merge-attribute', 'the delete-time re-check reads it again');
    assert.equal(existsSync(marker), false, 'the merge.text driver never ran');
  }
});

// The proofs run no hook: `check-attr` reads the index, which would otherwise run a configured
// `core.fsmonitor` hook at plan and at delete time.
test('a configured core.fsmonitor hook never runs during the proof or its re-verification', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, tip, head } = squashedFeature(t);
  const marker = join(root, '..', `${root.split('/').pop()}-fsmonitor-ran`);
  const hook = join(root, '..', `${root.split('/').pop()}-fsmonitor.sh`);
  t.after(() => rmSync(marker, { force: true }));
  t.after(() => rmSync(hook, { force: true }));
  writeFileSync(hook, `#!/bin/sh\ntouch '${marker}'\nprintf '\\0'\n`);
  chmodSync(hook, 0o755);
  git(root, 'config', 'core.fsmonitor', hook);
  const calls = [];
  const deps = { runner: recordingRunner(calls) };
  const { first } = await proveBranch(root, tip, deps);
  assert.equal(first.proof, 'tip-tree');
  const verified = await verifyBranchProof(
    { cwd: root, tip, baseRef: 'develop', proof: 'tip-tree', proofCommit: head, deadline: LATER() },
    deps,
  );
  assert.equal(verified.proof, 'tip-tree');
  assert.ok(
    calls.filter((call) => gitArgs(call).includes('check-attr')).length >= 2,
    'both attribute pre-checks read the index',
  );
  assert.equal(existsSync(marker), false, 'the fsmonitor hook never ran');
});

test('a text or eol conversion on a changed path is merge-attribute', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  for (const attributes of ['shared.txt text\n', 'shared.txt eol=lf\n', '* text=auto\n']) {
    const { root, tip } = squashedFeature(t, {
      files: { 'shared.txt': 'one\ntwo\nthree\n', '.gitattributes': attributes },
    });
    const { first } = await proveBranch(root, tip);
    assert.equal(first.reason, 'merge-attribute', attributes);
  }
});

test('criss-cross and unrelated histories are decided before any merge-tree call', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, base } = repository(t);
  branchFrom(root, base, 'feature');
  const branchSide = commit(root, 'feature side', { 'feature.txt': 'f\n' });
  git(root, 'checkout', '-q', 'develop');
  const baseSide = commit(root, 'base side', { 'base.txt': 'b\n' });
  git(root, 'merge', '-q', '--no-edit', branchSide);
  publish(root);
  git(root, 'checkout', '-q', 'feature');
  git(root, 'merge', '-q', '--no-edit', baseSide);
  const crissCross = commit(root, 'feature later', { 'feature.txt': 'f2\n' });
  git(root, 'checkout', '-q', '--orphan', 'unrelated');
  const unrelated = commit(root, 'unrelated root', { 'other.txt': 'o\n' });
  for (const [tip, reason] of [
    [crissCross, 'multiple-merge-bases'],
    [unrelated, 'no-merge-base'],
  ]) {
    const calls = [];
    const deps = { runner: recordingRunner(calls) };
    const { first, result } = await proveBranch(root, tip, deps);
    assert.equal(first.reason, reason);
    assert.equal(result, first, 'no squash search follows');
    const repositoryState = await branchProofRepository(
      { cwd: root, baseRef: 'develop', deadline: LATER() },
      deps,
    );
    const searched = await branchSquashProof(
      { cwd: root, tip, repository: repositoryState, deadline: LATER() },
      deps,
    );
    assert.equal(searched.reason, reason);
    assert.equal(
      calls.filter((call) => gitArgs(call).includes('merge-tree')).length,
      0,
      `${reason}: no merge-tree ran`,
    );
  }
});

test('a replace ref that would make the tip an ancestor of the base is ignored', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, base } = repository(t);
  branchFrom(root, base, 'feature');
  const tip = commit(root, 'feature', { 'shared.txt': TWO });
  git(root, 'checkout', '-q', 'develop');
  const head = commit(root, 'base', { 'base.txt': 'b\n' });
  publish(root);
  const tree = git(root, 'rev-parse', `${head}^{tree}`);
  const fake = git(root, 'commit-tree', tree, '-p', base, '-p', tip, '-m', 'fake merge');
  git(root, 'replace', head, fake);
  const honoured = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', tip, head], {
    env: GIT_ENV,
  });
  assert.equal(honoured.status, 0, 'plain Git follows the replace ref');
  const { first, result } = await proveBranch(root, tip);
  assert.equal(first.reason, 'not-proven');
  assert.equal(result.proof, null);
  const verified = await verifyBranchProof(
    { cwd: root, tip, baseRef: 'develop', proof: 'ancestor', proofCommit: head, deadline: LATER() },
    { runner },
  );
  assert.equal(verified.reason, 'not-proven');
});

test('from a subdirectory cwd the attribute pre-check reads the top-level paths', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  for (const [attributes, expected] of [
    [undefined, 'tip-tree'],
    ['shared.txt merge=ours\n', 'merge-attribute'],
  ]) {
    const files = { 'shared.txt': 'one\ntwo\nthree\n', 'sub/keep.txt': 'k\n' };
    if (attributes) files['.gitattributes'] = attributes;
    const { root, tip } = squashedFeature(t, { files });
    const { first } = await proveBranch(join(root, 'sub'), tip);
    assert.equal(first.proof ?? first.reason, expected, String(attributes));
  }
});

test('a squash candidate refused by its attributes is skipped, and the search goes on', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  for (const exact of [true, false]) {
    const { root, base } = repository(t, {
      files: {
        'shared.txt': 'one\ntwo\nthree\n',
        'other.txt': 'o\n',
        '.gitattributes': 'other.txt merge=ours\n',
      },
    });
    branchFrom(root, base, 'feature');
    const tip = commit(root, 'feature', { 'shared.txt': TWO });
    git(root, 'checkout', '-q', 'develop');
    git(root, 'merge', '-q', '--squash', 'feature');
    if (!exact) write(root, 'shared.txt', 'one\nTWO edited\nthree\n');
    const squash = commit(root, 'squash feature');
    // `other.txt` changes and changes back, so only the newer candidate's merge touches it.
    commit(root, 'other', { 'other.txt': 'o2\n' });
    commit(root, 'revert squash', { 'shared.txt': 'one\ntwo\nthree\n' });
    commit(root, 'other back', { 'other.txt': 'o\n' });
    publish(root);
    const { first, result } = await proveBranch(root, tip);
    assert.equal(first.reason, 'not-proven');
    if (exact) {
      assert.equal(result.proof, 'squash-tree');
      assert.equal(result.proofCommit, squash);
    } else {
      assert.equal(result.reason, 'merge-attribute', 'reported only when no candidate proves');
    }
  }
});

test('an info/grafts file retains every branch as grafts, at plan and at delete time', async (t) => {
  const { root, tip, squash } = squashedFeature(t);
  write(root, '.git/info/grafts', `${tip}\n`);
  const repositoryState = await branchProofRepository(
    { cwd: root, baseRef: 'develop', deadline: LATER() },
    { runner },
  );
  assert.equal(repositoryState.reason, 'grafts');
  const verified = await verifyBranchProof(
    {
      cwd: root,
      tip,
      baseRef: 'develop',
      proof: 'tip-tree',
      proofCommit: squash,
      deadline: LATER(),
    },
    { runner },
  );
  assert.equal(verified.reason, 'grafts');
  assert.equal(verified.proof, null);
});

test('a shallow repository and a missing base ref are repository-wide reasons', async (t) => {
  const { root } = repository(t);
  commit(root, 'second', { 'second.txt': '2\n' });
  const shallow = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-shallow-')));
  t.after(() => rmSync(shallow, { recursive: true, force: true }));
  git(shallow, 'init', '-q', '--initial-branch=develop');
  git(shallow, 'fetch', '-q', '--depth=1', `file://${root}`, 'develop:refs/remotes/origin/develop');
  const state = (cwd, baseRef = 'develop') =>
    branchProofRepository({ cwd, baseRef, deadline: LATER() }, { runner });
  assert.equal((await state(shallow)).reason, 'shallow-repository');
  assert.equal((await state(root, 'missing')).reason, 'base-ref-missing');
});

test('below Git 2.38 the ancestor proof still runs, and tree proofs are git-version', async (t) => {
  const { root, base, tip } = squashedFeature(t);
  const calls = [];
  const oldGit = async (call) => {
    if (call.args.includes('--version')) {
      return { status: 0, stdout: 'git version 2.37.1\n', stderr: '' };
    }
    calls.push(gitArgs(call));
    return runner(call);
  };
  const ancestor = await proveBranch(root, base, { runner: oldGit });
  assert.equal(ancestor.repository.treeProofReason, 'git-version');
  assert.equal(ancestor.result.proof, 'ancestor');
  const squashed = await proveBranch(root, tip, { runner: oldGit });
  assert.equal(squashed.result.reason, 'git-version');
  const squashSearch = await branchSquashProof(
    { cwd: root, tip, repository: squashed.repository, deadline: LATER() },
    { runner: oldGit },
  );
  assert.equal(squashSearch.reason, 'git-version');
  assert.ok(!calls.some((args) => args.includes('merge-tree')), 'no merge-tree ran');
});

test('a stacked branch on a squash-merged branch is proven once its own squash lands', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, base } = repository(t);
  branchFrom(root, base, 'first');
  const first = commit(root, 'first', { 'shared.txt': TWO });
  branchFrom(root, first, 'second');
  const second = commit(root, 'second', { 'second.txt': 's\n' });
  squashMerge(root, 'first');
  const beforeSecond = await proveBranch(root, second);
  assert.equal(beforeSecond.result.proof, null, 'the stacked branch is not in the base yet');
  const squash = squashMerge(root, 'second');
  const stacked = await proveBranch(root, second);
  assert.equal(stacked.result.proof, 'tip-tree');
  assert.equal(stacked.result.proofCommit, squash);
  assert.equal((await proveBranch(root, first)).result.proof, 'tip-tree');
});

test('more squash candidates than the limit, none proven, is candidate-limit after exactly the limit', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, base } = repository(t);
  branchFrom(root, base, 'feature');
  const tip = commit(root, 'feature', { 'counter.txt': 'branch\n' });
  git(root, 'checkout', '-q', 'develop');
  for (let index = 0; index <= SQUASH_TREE_CANDIDATE_LIMIT; index += 1) {
    commit(root, `counter ${index}`, { 'counter.txt': `value ${index}\n` });
  }
  publish(root);
  const repositoryState = await branchProofRepository(
    { cwd: root, baseRef: 'develop', deadline: LATER() },
    { runner },
  );
  const calls = [];
  const result = await branchSquashProof(
    { cwd: root, tip, repository: repositoryState, deadline: LATER() },
    { runner: recordingRunner(calls) },
  );
  assert.equal(result.reason, 'candidate-limit');
  assert.equal(
    calls.filter((call) => gitArgs(call).includes('merge-tree')).length,
    SQUASH_TREE_CANDIDATE_LIMIT,
  );
  assert.equal(
    calls.filter((call) => gitArgs(call)[0] === 'log').length,
    1,
    'the changed-path pre-filter reads the first-parent range in one git log call',
  );
});

test("every proof Git call runs without replace objects, bounded by the caller's deadline", async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, tip } = squashedFeature(t);
  git(root, 'revert', '--no-edit', 'HEAD');
  publish(root);
  const calls = [];
  const { result } = await proveBranch(root, tip, { runner: recordingRunner(calls) });
  assert.equal(result.proof, 'squash-tree');
  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.equal(call.env.GIT_NO_REPLACE_OBJECTS, '1', gitArgs(call).join(' '));
    assert.equal(call.processGroup, true);
    assert.ok(call.timeoutMs > 0 && call.timeoutMs <= 60_000, 'bounded by what is left');
  }
  const merges = calls.filter((call) => gitArgs(call).includes('merge-tree'));
  assert.ok(merges.length >= 2);
  for (const merge of merges) {
    const args = gitArgs(merge);
    assert.deepEqual(args.slice(0, 5), [
      '-c',
      'merge.renormalize=false',
      '-c',
      'merge.default=text',
      'merge-tree',
    ]);
    assert.ok(merge.timeoutMs < MERGE_PROOF_TIMEOUT_MS, 'never the merge-proof timeout');
  }
});

test('a deadline already passed, or reached during the merge, is timeout and removes the private directory', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, tip } = squashedFeature(t, { after: { 'shared.txt': 'one\nTWO!\nthree\n' } });
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-proof-tmp-')));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const past = Date.now() - 1;
  assert.equal(
    (await branchProofRepository({ cwd: root, baseRef: 'develop', deadline: past }, { runner }))
      .reason,
    'timeout',
  );
  const repositoryState = await branchProofRepository(
    { cwd: root, baseRef: 'develop', deadline: LATER() },
    { runner },
  );
  const spawned = [];
  const counting = (call) => {
    spawned.push(call);
    return runner(call);
  };
  const expired = await branchTipProof(
    { cwd: root, tip, repository: repositoryState, deadline: past },
    { runner: counting },
  );
  assert.equal(expired.reason, 'timeout');
  assert.equal(spawned.length, 0, 'no Git call starts after the deadline');
  const stalling = (call) => {
    if (!call.args.includes('merge-tree')) return runner(call);
    return runner({
      ...call,
      executable: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
    });
  };
  for (const prove of [branchTipProof, branchSquashProof]) {
    const stopped = await prove(
      { cwd: root, tip, repository: repositoryState, deadline: Date.now() + 1_500 },
      { runner: stalling, tmpdir: scratch },
    );
    assert.equal(stopped.reason, 'timeout', prove.name);
    assert.equal(stopped.proof, null);
    assert.deepEqual(readdirSync(scratch), [], 'the private object directory is removed');
  }
});

test("the branch proofs leave the repository's object set, refs and working tree unchanged", async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-proof-tmp-')));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const { root, tip } = squashedFeature(t, { after: { 'shared.txt': 'one\nTWO!\nthree\n' } });
  const objectsBefore = objectSet(root);
  const refsBefore = git(root, 'for-each-ref');
  const statusBefore = git(root, 'status', '--porcelain');
  const { first, result } = await proveBranch(root, tip, { runner, tmpdir: scratch });
  assert.equal(first.reason, 'not-proven');
  assert.equal(result.proof, 'squash-tree');
  assert.deepEqual(objectSet(root), objectsBefore, 'the object set is unchanged');
  assert.equal(git(root, 'for-each-ref'), refsBefore);
  assert.equal(git(root, 'status', '--porcelain'), statusBefore);
  assert.deepEqual(readdirSync(scratch), []);
});

test('verifyBranchProof re-runs one fixed proof without a candidate search', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, base, tip, squash } = squashedFeature(t);
  git(root, 'revert', '--no-edit', 'HEAD');
  publish(root);
  const verify = (extra, deps = { runner }) =>
    verifyBranchProof({ cwd: root, tip, baseRef: 'develop', deadline: LATER(), ...extra }, deps);
  const calls = [];
  const squashed = await verify(
    { proof: 'squash-tree', proofCommit: squash },
    { runner: recordingRunner(calls) },
  );
  assert.deepEqual(squashed, {
    proof: 'squash-tree',
    proofCommit: squash,
    reason: null,
    detail: null,
  });
  assert.ok(!calls.some((call) => gitArgs(call).includes('--first-parent')), 'no search ran');
  assert.equal(calls.filter((call) => gitArgs(call).includes('merge-tree')).length, 1);
  // A background fetch that moves the base on keeps the proof as long as it contains proofCommit.
  commit(root, 'fetched later', { 'later.txt': 'l\n' });
  publish(root);
  assert.equal((await verify({ proof: 'squash-tree', proofCommit: squash })).proof, 'squash-tree');
  // The base no longer reverts the squash at `squash` itself, so tip-tree holds against it.
  assert.equal((await verify({ proof: 'tip-tree', proofCommit: squash })).proof, 'tip-tree');
  assert.equal((await verify({ proof: 'ancestor', proofCommit: squash })).reason, 'not-proven');
  assert.equal(
    (await verify({ proof: 'ancestor', proofCommit: squash, tip: base })).proof,
    'ancestor',
  );
  // A proofCommit that is gone, or no longer in the base after a rewind, proves nothing.
  assert.equal(
    (await verify({ proof: 'squash-tree', proofCommit: 'e'.repeat(40) })).reason,
    'not-proven',
  );
  git(root, 'update-ref', 'refs/remotes/origin/develop', base);
  assert.equal((await verify({ proof: 'squash-tree', proofCommit: squash })).reason, 'not-proven');
});

test('verifyBranchProof rejects a forged proof and attributes changed since the plan', async (t) => {
  if (await skipWithoutTreeProofs(t)) return;
  const { root, base } = repository(t);
  branchFrom(root, base, 'net-zero');
  commit(root, 'change', { 'shared.txt': TWO });
  const netZero = commit(root, 'revert', { 'shared.txt': 'one\ntwo\nthree\n' });
  git(root, 'checkout', '-q', 'develop');
  const empty = commit(root, 'empty base commit');
  publish(root);
  const verify = (extra) =>
    verifyBranchProof({ cwd: root, baseRef: 'develop', deadline: LATER(), ...extra }, { runner });
  assert.equal(
    (await verify({ tip: netZero, proof: 'tip-tree', proofCommit: empty })).reason,
    'empty-diff',
  );
  assert.equal(
    (await verify({ tip: netZero, proof: 'squash-tree', proofCommit: empty })).reason,
    'empty-diff',
  );
  const squashed = squashedFeature(t);
  const planned = await proveBranch(squashed.root, squashed.tip);
  assert.equal(planned.result.proof, 'tip-tree');
  write(squashed.root, '.gitattributes', 'shared.txt merge=ours\n');
  const changed = await verifyBranchProof(
    {
      cwd: squashed.root,
      tip: squashed.tip,
      baseRef: 'develop',
      proof: 'tip-tree',
      proofCommit: planned.result.proofCommit,
      deadline: LATER(),
    },
    { runner },
  );
  assert.equal(changed.reason, 'merge-attribute');
});

test('the branch proofs reject invalid input and name only reasons from the closed list', async (t) => {
  const { root, base } = repository(t);
  const repositoryState = await branchProofRepository(
    { cwd: root, baseRef: 'develop', deadline: LATER() },
    { runner },
  );
  const ok = { cwd: root, tip: base, repository: repositoryState, deadline: LATER() };
  for (const bad of [
    { ...ok, deadline: undefined },
    { ...ok, deadline: Number.NaN },
    { ...ok, tip: 'main' },
    { ...ok, repository: { ...repositoryState, reason: 'grafts' } },
    { ...ok, repository: null },
    { ...ok, cwd: 'relative' },
  ]) {
    await assert.rejects(
      () => branchTipProof(bad, { runner }),
      (error) => error.code === 'INVALID_INPUT',
    );
  }
  const verifyInput = {
    cwd: root,
    tip: base,
    baseRef: 'develop',
    proof: 'ancestor',
    proofCommit: base,
    deadline: LATER(),
  };
  for (const bad of [
    { ...verifyInput, proof: 'patch-id' },
    { ...verifyInput, proofCommit: 'HEAD' },
    { ...verifyInput, baseRef: '--upload-pack=x' },
  ]) {
    await assert.rejects(
      () => verifyBranchProof(bad, { runner }),
      (error) => error.code === 'INVALID_INPUT',
    );
  }
  assert.deepEqual(BRANCH_PROOF_REASONS, [
    'not-proven',
    'base-ref-missing',
    'empty-diff',
    'no-merge-base',
    'multiple-merge-bases',
    'merge-attribute',
    'grafts',
    'candidate-limit',
    'git-version',
    'shallow-repository',
    'timeout',
    'proof-unavailable',
  ]);
});
