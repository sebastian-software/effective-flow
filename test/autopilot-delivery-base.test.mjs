// Real-Git scenarios of autopilot's delivery-base step: `delivery-base-check` against a moved or
// unmoved `origin/<base>`, `delivery-base-record` verifying the delivery checkout with Git (the
// recorded branch, one merge commit on the unrebased head after a resolved conflict, an unchanged
// branch after an unresolved one), the quick-mode merge commit the fragment prescribes, and
// `delivery-confirm` requiring the pushed head to contain a resolved merge commit. The schema and
// appendix cases live in `autopilot-core.test.mjs`. A base that moves during the check is not
// covered: no deterministic point exists between the check's base read and its merge proof.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { AUTOPILOT_DIR, executeOperation } from '../src/scripts/autopilot-core.mjs';
import { hasQuickMarker, scanQuickMarkers } from '../src/scripts/conflict-validation-core.mjs';
import { readGitVersion, meetsGitVersion } from '../src/scripts/pr-delivery-git-core.mjs';
import { createProcessRunner } from '../src/scripts/process-runner.mjs';

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
};
const INSTANT = Date.parse('2026-11-25T08:30:00Z');
const REPOSITORY = 'github.com/example/project';

function gitRun(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], { env: GIT_ENV });
}

function git(cwd, ...args) {
  const result = gitRun(cwd, args);
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return String(result.stdout).trim();
}

function write(root, file, content) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), content);
}

function commit(cwd, message, files = {}) {
  for (const [file, content] of Object.entries(files)) write(cwd, file, content);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '--allow-empty', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

let counter = 0;
const deps = () => ({
  runner: createProcessRunner(),
  env: GIT_ENV,
  now: () => INSTANT,
  randomHex: () => (counter++).toString(16).padStart(8, '0'),
});
const op = (operation, input) => executeOperation(operation, input, deps());

// Git older than 2.38 has no `merge-tree --write-tree`, so the moved-base proof is unavailable.
async function gitMeetsMinimum() {
  return meetsGitVersion(
    await readGitVersion({ runner: createProcessRunner(), env: process.env }, tmpdir()),
  );
}

// A primary checkout `root` on `main` whose `origin/main` is published as a ref, a run ledger, and a
// linked worktree `checkout` on branch `feature` at `head` (one commit past the original base).
// `conflicting` decides whether the head and the moved base change the same line of `shared.txt`.
async function scenario(
  t,
  { conflicting = true, moveBase = true, branch = 'feature', source = undefined } = {},
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-delivery-base-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q', '--initial-branch=main');
  const original = commit(root, 'base', {
    '.gitignore': '.effective-flow/\n',
    'shared.txt': 'one\ntwo\nthree\n',
  });
  git(root, 'update-ref', 'refs/remotes/origin/main', original);
  const checkout = join(root, '..', `${root.split('/').at(-1)}-checkout`);
  t.after(() => rmSync(checkout, { recursive: true, force: true }));
  git(root, 'worktree', 'add', '-q', '-b', branch, checkout, original);
  const head = commit(
    checkout,
    'head change',
    conflicting ? { 'shared.txt': 'one\nHEAD\nthree\n' } : { 'head.txt': 'h\n' },
  );
  let moved = original;
  if (moveBase) {
    moved = commit(
      root,
      'base change',
      conflicting ? { 'shared.txt': 'one\nBASE\nthree\n' } : { 'base.txt': 'b\n' },
    );
    git(root, 'update-ref', 'refs/remotes/origin/main', moved);
  }
  const init = await op('run-init', {
    cwd: root,
    source: source ?? { kind: 'issue', issue: 42, repository: REPOSITORY },
    visibility: 'private',
    language: 'en',
  });
  assert.equal(init.ok, true, JSON.stringify(init));
  return { root, checkout, branch, original, head, moved, runId: init.data.runId };
}

const ledger = (root, runId) =>
  JSON.parse(readFileSync(join(root, AUTOPILOT_DIR, runId, 'run.json'), 'utf8'));
const check = (s) =>
  op('delivery-base-check', { cwd: s.root, runId: s.runId, headOid: s.head, baseRef: 'main' });

// The record input of a conflict result; `extra` overrides single fields.
function recordInput(s, extra = {}) {
  return {
    cwd: s.root,
    runId: s.runId,
    mergeBaseOid: s.original,
    baseOid: s.moved,
    commitCount: 1,
    result: 'resolved',
    reason: null,
    conflictResolution: 'auto',
    validationMode: 'full',
    conflictCount: 1,
    conflictedPaths: ['shared.txt'],
    headOid: s.head,
    mergeOid: null,
    checkout: s.checkout,
    branch: s.branch,
    ...extra,
  };
}

// Merges the checked base OID into the checkout the way the attempt does and stops at the conflict.
function startConflictingMerge(s) {
  const merge = gitRun(s.checkout, ['merge', '--no-ff', '--no-commit', s.moved]);
  assert.equal(merge.status, 1, String(merge.stdout));
}

// Resolves and completes the one merge commit the attempt makes.
function completeMerge(s) {
  write(s.checkout, 'shared.txt', 'one\nHEAD and BASE\nthree\n');
  git(s.checkout, 'add', 'shared.txt');
  git(s.checkout, 'commit', '-q', '--no-edit');
  return git(s.checkout, 'rev-parse', 'HEAD');
}

// Invariant: an `origin/<base>` that is an ancestor of the head is no move: the check reports
// `moved: false` with equal merge base and base, a zero commit count and no proof, and records
// nothing.
test('no base move reports moved false', async (t) => {
  const s = await scenario(t, { moveBase: false });
  const result = await check(s);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.data, {
    moved: false,
    mergeBaseOid: s.original,
    baseOid: s.original,
    commitCount: 0,
    proof: null,
    reason: null,
    conflictCount: null,
    conflictedPaths: null,
  });
  assert.equal(Object.hasOwn(ledger(s.root, s.runId), 'deliveryBase'), false);

  const missing = await op('delivery-base-check', {
    cwd: s.root,
    runId: s.runId,
    headOid: s.head,
    baseRef: 'absent',
  });
  assert.equal(missing.error.code, 'GIT_FAILED');
});

// Invariant: a moved base that merges cleanly reports a clean proof with no conflicted path, and
// the record `none` names no checkout and leaves the branch alone.
test('a moved base without conflict reports a clean proof and records none', async (t) => {
  if (!(await gitMeetsMinimum())) return t.skip('Git older than 2.38');
  const s = await scenario(t, { conflicting: false });
  const result = await check(s);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.data, {
    moved: true,
    mergeBaseOid: s.original,
    baseOid: s.moved,
    commitCount: 1,
    proof: 'clean',
    reason: null,
    conflictCount: 0,
    conflictedPaths: [],
  });
  const recorded = await op('delivery-base-record', {
    cwd: s.root,
    runId: s.runId,
    mergeBaseOid: result.data.mergeBaseOid,
    baseOid: result.data.baseOid,
    commitCount: result.data.commitCount,
    result: 'none',
    reason: null,
    conflictResolution: null,
    validationMode: null,
    conflictCount: 0,
    conflictedPaths: [],
    headOid: s.head,
    mergeOid: null,
    checkout: null,
    branch: null,
  });
  assert.equal(recorded.ok, true, JSON.stringify(recorded));
  assert.equal(ledger(s.root, s.runId).deliveryBase.result, 'none');
  assert.equal(git(s.checkout, 'rev-parse', 'HEAD'), s.head);
});

// Invariant: a resolved conflict is exactly one merge commit at the branch tip whose parents are
// the unrebased head and the base; the helper accepts it and stores the record.
test('a conflict that is resolved records exactly one merge commit on the unrebased head', async (t) => {
  if (!(await gitMeetsMinimum())) return t.skip('Git older than 2.38');
  const s = await scenario(t);
  const result = await check(s);
  assert.equal(result.data.proof, 'conflict');
  assert.equal(result.data.conflictCount, 1);
  assert.deepEqual(result.data.conflictedPaths, ['shared.txt']);
  startConflictingMerge(s);
  const mergeOid = completeMerge(s);
  assert.equal(
    git(s.checkout, 'rev-list', '--parents', '-n', '1', mergeOid),
    `${mergeOid} ${s.head} ${s.moved}`,
  );
  const recorded = await op('delivery-base-record', recordInput(s, { mergeOid }));
  assert.equal(recorded.ok, true, JSON.stringify(recorded));
  assert.equal(recorded.data.recorded, true);
  assert.equal(recorded.data.deliveryBase.mergeOid, mergeOid);
  assert.equal(ledger(s.root, s.runId).deliveryBase.result, 'resolved');
  const closed = await op('run-close', { cwd: s.root, runId: s.runId, outcome: 'no-pull-request' });
  assert.equal(closed.data.deliveryBase.mergeOid, mergeOid);
});

// Invariant: an aborted attempt leaves the branch at the head with no merge in progress, and the
// helper records `unresolved`; a merge still in progress, a moved branch tip and a detached head
// are refused with the failed invariant named and nothing is written.
test('an unresolved conflict leaves the branch unchanged and records unresolved', async (t) => {
  if (!(await gitMeetsMinimum())) return t.skip('Git older than 2.38');
  const s = await scenario(t);
  startConflictingMerge(s);
  const input = recordInput(s, {
    result: 'unresolved',
    reason: 'resolver-abort',
    validationMode: null,
  });

  const merging = await op('delivery-base-record', input);
  assert.equal(merging.error.code, 'INVARIANT_FAILED');
  assert.equal(merging.error.details.invariant, 'merge-in-progress');

  git(s.checkout, 'merge', '--abort');
  const advanced = commit(s.checkout, 'extra', { 'extra.txt': 'e\n' });
  const moved = await op('delivery-base-record', input);
  assert.equal(moved.error.code, 'INVARIANT_FAILED');
  assert.equal(moved.error.details.invariant, 'branch-tip');
  git(s.checkout, 'reset', '-q', '--hard', s.head);
  assert.notEqual(advanced, s.head);

  git(s.checkout, 'checkout', '-q', '--detach');
  const detached = await op('delivery-base-record', input);
  assert.equal(detached.error.details.invariant, 'detached-head');
  git(s.checkout, 'checkout', '-q', 'feature');
  assert.equal(Object.hasOwn(ledger(s.root, s.runId), 'deliveryBase'), false);

  const recorded = await op('delivery-base-record', input);
  assert.equal(recorded.ok, true, JSON.stringify(recorded));
  assert.equal(git(s.checkout, 'rev-parse', 'HEAD'), s.head);
  assert.equal(ledger(s.root, s.runId).deliveryBase.result, 'unresolved');
  assert.equal(ledger(s.root, s.runId).deliveryBase.reason, 'resolver-abort');
});

// Invariant: the checkout a record names must be clean after the commit or abort: an untracked
// file a resolver or validator left behind fails `dirty-checkout` for `unresolved` and `resolved`
// alike, and no record is stored.
test('a record naming a checkout with untracked leftovers is refused as dirty', async (t) => {
  if (!(await gitMeetsMinimum())) return t.skip('Git older than 2.38');
  const s = await scenario(t);
  const refused = async (input, label) => {
    const result = await op('delivery-base-record', input);
    assert.equal(result.error?.code, 'INVARIANT_FAILED', label);
    assert.equal(result.error.details.invariant, 'dirty-checkout', label);
    assert.equal(Object.hasOwn(ledger(s.root, s.runId), 'deliveryBase'), false, label);
  };

  startConflictingMerge(s);
  git(s.checkout, 'merge', '--abort');
  write(s.checkout, 'leftover/validator.log', 'x\n');
  await refused(
    recordInput(s, { result: 'unresolved', reason: 'resolver-abort', validationMode: null }),
    'unresolved',
  );
  rmSync(join(s.checkout, 'leftover'), { recursive: true });

  startConflictingMerge(s);
  const mergeOid = completeMerge(s);
  write(s.checkout, 'leftover.txt', 'x\n');
  await refused(recordInput(s, { mergeOid }), 'resolved');
});

// Invariant: a `resolved` record is refused unless the branch tip is one merge commit of exactly
// `[headOid, baseOid]`: a rebased head, a plain commit on the head, a merge of the wrong parents
// and a tip other than `mergeOid` each fail, and no record is stored.
test('a resolved record with a rebased or non-merge tip is refused', async (t) => {
  if (!(await gitMeetsMinimum())) return t.skip('Git older than 2.38');
  const s = await scenario(t, { conflicting: false });
  const refused = async (mergeOid, invariant, label) => {
    const result = await op('delivery-base-record', recordInput(s, { mergeOid }));
    assert.equal(result.error?.code, 'INVARIANT_FAILED', label);
    assert.equal(result.error.details.invariant, invariant, label);
    assert.equal(Object.hasOwn(ledger(s.root, s.runId), 'deliveryBase'), false, label);
  };

  // A plain commit on the head: one parent.
  const plain = commit(s.checkout, 'plain', { 'plain.txt': 'p\n' });
  await refused(plain, 'merge-parents', 'non-merge tip');
  // The tip is not the named merge commit.
  await refused(s.head, 'branch-tip', 'stale mergeOid');
  git(s.checkout, 'reset', '-q', '--hard', s.head);

  // A merge with the right second parent but a different first parent.
  git(s.checkout, 'checkout', '-q', '-b', 'side', s.original);
  const side = commit(s.checkout, 'side', { 'side.txt': 's\n' });
  git(s.checkout, 'checkout', '-q', 'feature');
  git(s.checkout, 'reset', '-q', '--hard', s.moved);
  git(s.checkout, 'merge', '-q', '--no-ff', '-m', 'wrong parents', side);
  await refused(git(s.checkout, 'rev-parse', 'HEAD'), 'merge-parents', 'wrong parents');

  // A rebased head: the commit sits on the new base and has the base as its only parent.
  git(s.checkout, 'reset', '-q', '--hard', s.head);
  git(s.checkout, 'rebase', '-q', s.moved);
  const rebased = git(s.checkout, 'rev-parse', 'HEAD');
  assert.notEqual(rebased, s.head);
  await refused(rebased, 'merge-parents', 'rebased tip');
});

// Invariant: a `checkout-unavailable` record names no checkout and no branch: one that sets a
// checkout (an existing one or a path that does not exist) is refused as invalid input before any
// Git read of that checkout, never as a Git invariant, and no record is stored.
test('a checkout-unavailable record naming a checkout is refused as invalid input', async (t) => {
  const s = await scenario(t);
  const base = { result: 'unresolved', reason: 'checkout-unavailable', validationMode: null };
  for (const [label, extra] of [
    ['existing checkout', {}],
    ['missing checkout', { checkout: join(s.root, 'missing'), branch: s.branch }],
    ['branch only', { checkout: null }],
  ]) {
    const result = await op('delivery-base-record', recordInput(s, { ...base, ...extra }));
    assert.equal(result.error?.code, 'INVALID_INPUT', label);
    assert.equal(Object.hasOwn(ledger(s.root, s.runId), 'deliveryBase'), false, label);
  }
  const recorded = await op(
    'delivery-base-record',
    recordInput(s, { ...base, checkout: null, branch: null }),
  );
  assert.equal(recorded.ok, true, JSON.stringify(recorded));
  assert.equal(ledger(s.root, s.runId).deliveryBase.reason, 'checkout-unavailable');
});

// Invariant: the check fails closed on its input before any Git read and on a run that is not
// open: an unsafe base name, an unknown key, an object id that is no commit and a closed run are
// each refused, and nothing is recorded.
test('delivery-base-check refuses unsafe input, a non-commit head and a closed run', async (t) => {
  const s = await scenario(t, { moveBase: false });
  const input = { cwd: s.root, runId: s.runId, headOid: s.head, baseRef: 'main' };
  for (const [label, extra, code] of [
    ['range as base', { baseRef: 'main..feature' }, 'INVALID_INPUT'],
    ['option as base', { baseRef: '-main' }, 'INVALID_INPUT'],
    ['remote-qualified base', { baseRef: 'origin/main:x' }, 'INVALID_INPUT'],
    ['unknown key', { extra: true }, 'INVALID_INPUT'],
    ['abbreviated head', { headOid: s.head.slice(0, 12) }, 'INVALID_INPUT'],
    ['tree as head', { headOid: git(s.root, 'rev-parse', `${s.head}^{tree}`) }, 'GIT_FAILED'],
  ]) {
    const refused = await op('delivery-base-check', { ...input, ...extra });
    assert.equal(refused.error?.code, code, label);
  }
  await op('run-close', { cwd: s.root, runId: s.runId, outcome: 'no-pull-request' });
  const closedRun = await op('delivery-base-check', input);
  assert.equal(closedRun.error?.code, 'RUN_CLOSED');
  assert.equal(Object.hasOwn(ledger(s.root, s.runId), 'deliveryBase'), false);
});

// Invariant: a moved base whose merge proof cannot run is reported as `proof: "unavailable"` with
// the proof's reason and null conflict fields, and that reason is recorded as `unchecked` without a
// checkout, so the run publishes without claiming a clean or conflicting merge.
test('an unavailable merge proof is recorded as unchecked', async (t) => {
  const s = await scenario(t);
  // A temporary directory that cannot be created makes the proof unavailable on every Git version.
  const unavailable = await executeOperation(
    'delivery-base-check',
    { cwd: s.root, runId: s.runId, headOid: s.head, baseRef: 'main' },
    { ...deps(), tmpdir: join(s.root, 'missing', 'tmp') },
  );
  assert.equal(unavailable.ok, true, JSON.stringify(unavailable));
  const { data } = unavailable;
  assert.equal(data.moved, true);
  assert.equal(data.proof, 'unavailable');
  assert.ok(['temporary-directory-failed', 'git-version'].includes(data.reason), data.reason);
  assert.equal(data.conflictCount, null);
  assert.equal(data.conflictedPaths, null);
  const recorded = await op('delivery-base-record', {
    ...recordInput(s),
    result: 'unchecked',
    reason: data.reason,
    conflictResolution: null,
    validationMode: null,
    conflictCount: null,
    conflictedPaths: null,
    checkout: null,
    branch: null,
  });
  assert.equal(recorded.ok, true, JSON.stringify(recorded));
  assert.equal(ledger(s.root, s.runId).deliveryBase.result, 'unchecked');
  assert.equal(ledger(s.root, s.runId).deliveryBase.reason, data.reason);
});

// Invariant: on a plan source the attempt runs in a run-owned linked worktree on the delivery
// branch; the record names that worktree and its branch, a record naming another branch is refused
// as `wrong-branch`, and the resolved merge commit sits on the named branch.
test('a plan source records a resolved conflict in a linked worktree on its plan branch', async (t) => {
  if (!(await gitMeetsMinimum())) return t.skip('Git older than 2.38');
  const s = await scenario(t, {
    branch: 'effective-flow/plan/delivery-base',
    source: { kind: 'plan', planPath: 'docs/plan/x.md', planSha256: 'a'.repeat(64) },
  });
  assert.equal(ledger(s.root, s.runId).source.kind, 'plan');
  assert.equal((await check(s)).data.proof, 'conflict');
  startConflictingMerge(s);
  const mergeOid = completeMerge(s);
  const wrong = await op('delivery-base-record', recordInput(s, { mergeOid, branch: 'main' }));
  assert.equal(wrong.error?.code, 'INVARIANT_FAILED');
  assert.equal(wrong.error.details.invariant, 'wrong-branch');
  assert.equal(Object.hasOwn(ledger(s.root, s.runId), 'deliveryBase'), false);
  const recorded = await op('delivery-base-record', recordInput(s, { mergeOid }));
  assert.equal(recorded.ok, true, JSON.stringify(recorded));
  assert.equal(ledger(s.root, s.runId).deliveryBase.branch, 'effective-flow/plan/delivery-base');
  assert.equal(git(s.root, 'rev-parse', `refs/heads/${s.branch}`), mergeOid);
});

// Invariant: the quick-mode commit command of `autopilot-delivery-conflict` step 10 strips Git's
// conflict comment lines and ends the merge message with the quick marker trailer, so
// `hasQuickMarker` accepts the message and `quick-marker-scan` lists the merge commit, which the
// helper then records as a `quick` resolution.
test('the quick-mode merge commit carries a marker that quick-marker-scan lists', async (t) => {
  if (!(await gitMeetsMinimum())) return t.skip('Git older than 2.38');
  const s = await scenario(t);
  startConflictingMerge(s);
  write(s.checkout, 'shared.txt', 'one\nHEAD and BASE\nthree\n');
  git(s.checkout, 'add', 'shared.txt');
  git(
    s.checkout,
    'commit',
    '--no-edit',
    '--cleanup=strip',
    '--trailer',
    'Effective-Flow-Conflict-Validation: quick',
  );
  const mergeOid = git(s.checkout, 'rev-parse', 'HEAD');
  const message = git(s.checkout, 'log', '-1', '--format=%B', mergeOid);
  assert.equal(message.includes('# Conflicts'), false, message);
  assert.equal(hasQuickMarker(message), true, message);
  const scan = await scanQuickMarkers(
    { cwd: s.checkout, baseRef: 'main', headSha: mergeOid },
    { runner: createProcessRunner(), env: GIT_ENV },
  );
  assert.deepEqual(scan.commits, [mergeOid]);
  const recorded = await op(
    'delivery-base-record',
    recordInput(s, { mergeOid, validationMode: 'quick' }),
  );
  assert.equal(recorded.ok, true, JSON.stringify(recorded));
});

// Invariant: after a `resolved` delivery base, `delivery-confirm` stores only a pushed head that is
// the merge commit or a descendant of it; a head without the merge commit and a head the repository
// does not hold are MERGE_NOT_DELIVERED and leave the confirmed head unrecorded.
test('delivery-confirm requires the pushed head to contain the resolved merge commit', async (t) => {
  if (!(await gitMeetsMinimum())) return t.skip('Git older than 2.38');
  const s = await scenario(t);
  startConflictingMerge(s);
  const mergeOid = completeMerge(s);
  const recorded = await op('delivery-base-record', recordInput(s, { mergeOid }));
  assert.equal(recorded.ok, true, JSON.stringify(recorded));
  const confirm = (headOid) => op('delivery-confirm', { cwd: s.root, runId: s.runId, headOid });

  for (const [label, headOid] of [
    ['unmerged head', s.head],
    ['base only', s.moved],
    ['unknown head', 'f'.repeat(40)],
  ]) {
    const refused = await confirm(headOid);
    assert.equal(refused.error?.code, 'MERGE_NOT_DELIVERED', label);
    assert.equal(ledger(s.root, s.runId).delivery?.headOid, undefined, label);
  }
  assert.equal((await confirm(mergeOid)).ok, true);
  const later = commit(s.checkout, 'after merge', { 'later.txt': 'l\n' });
  const descendant = await confirm(later);
  assert.equal(descendant.ok, true, JSON.stringify(descendant));
  assert.equal(ledger(s.root, s.runId).delivery.headOid, later);
});
