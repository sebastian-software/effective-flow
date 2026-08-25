import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';

import {
  bindSelectionManifest,
  inventoryRepository,
  reconcileDelivery,
  transferSelection,
  verifySourceManifest,
} from '../src/scripts/delivery-selection-core.mjs';

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
};

function runGit(root, args, { input } = {}) {
  return spawnSync('git', ['-C', root, ...args], {
    env: GIT_ENV,
    input,
    encoding: null,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function git(root, ...args) {
  const result = runGit(root, args);
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr?.toString('utf8'));
  return result.stdout.toString('utf8').trim();
}

function processRunner({ executable, args = [], stdin, cwd }) {
  const result = spawnSync(executable, args, {
    cwd,
    env: GIT_ENV,
    input: stdin,
    encoding: null,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    status: result.status,
    stdout: result.stdout ?? Buffer.alloc(0),
    stderr: result.stderr ?? Buffer.alloc(0),
    error: result.error,
  };
}

function write(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function createRepository(t) {
  const container = mkdtempSync(join(tmpdir(), 'effective-flow-delivery-selection-'));
  const sourceRoot = join(container, 'source');
  const deliveryRoot = join(container, 'delivery');
  mkdirSync(sourceRoot);
  git(sourceRoot, 'init', '--initial-branch=main');
  write(sourceRoot, '.gitignore', 'ignored.txt\n');
  write(sourceRoot, 'partial.txt', 'base\n');
  write(sourceRoot, 'working.txt', 'base first\nmiddle\nbase last\n');
  write(sourceRoot, 'delete.txt', 'delete me\n');
  write(sourceRoot, 'gone.txt', 'delete on source\n');
  write(sourceRoot, 'rename.txt', 'rename me\n');
  write(sourceRoot, 'mode.txt', '#!/bin/sh\nexit 0\n');
  write(sourceRoot, 'file-shape', 'becomes a directory\n');
  write(sourceRoot, 'dir-shape/child.txt', 'becomes a file\n');
  symlinkSync('partial.txt', join(sourceRoot, 'link.txt'));
  git(sourceRoot, 'add', '.');
  git(sourceRoot, 'commit', '-m', 'fixture');
  git(sourceRoot, 'worktree', 'add', '-b', 'delivery', deliveryRoot, 'HEAD');
  t.after(() => rmSync(container, { recursive: true, force: true }));
  return { container, sourceRoot, deliveryRoot };
}

function repositoryIdentity(root) {
  return realpathSync(resolve(root, git(root, 'rev-parse', '--git-common-dir')));
}

function deliveryReceipt(root) {
  return {
    repositoryIdentity: repositoryIdentity(root),
    executionRoot: realpathSync(root),
    headOid: git(root, 'rev-parse', 'HEAD'),
  };
}

function sourceSnapshot(root) {
  const index = runGit(root, ['ls-files', '--stage', '-z']);
  const status = runGit(root, [
    'status',
    '--porcelain=v2',
    '-z',
    '--untracked-files=all',
    '--ignored=matching',
  ]);
  assert.equal(index.status, 0, index.stderr?.toString('utf8'));
  assert.equal(status.status, 0, status.stderr?.toString('utf8'));
  return {
    head: git(root, 'rev-parse', 'HEAD'),
    index: index.stdout,
    status: status.stdout,
    workingDiff: runGit(root, ['diff', '--binary']).stdout,
    stagedDiff: runGit(root, ['diff', '--cached', '--binary']).stdout,
    partial: readFileSync(join(root, 'partial.txt')),
    working: readFileSync(join(root, 'working.txt')),
  };
}

async function bind(sourceRoot, selection) {
  return await bindSelectionManifest({ sourceRoot, selection }, { runner: processRunner });
}

async function transferPayload(sourceRoot, deliveryRoot, manifest) {
  return {
    manifest,
    sourceRoot,
    deliveryRoot,
    deliveryReceipt: deliveryReceipt(deliveryRoot),
  };
}

test('selection transfers staged, working, untracked, and partial states without touching source', async (t) => {
  const { sourceRoot, deliveryRoot } = createRepository(t);
  write(sourceRoot, 'partial.txt', 'staged\n');
  git(sourceRoot, 'add', '--', 'partial.txt');
  write(sourceRoot, 'partial.txt', 'working after staged\n');
  write(sourceRoot, 'working.txt', 'working selected\n');
  write(sourceRoot, 'untracked.txt', 'new selected\n');
  write(sourceRoot, 'ignored.txt', 'must stay ignored\n');

  const inventory = await inventoryRepository({ root: sourceRoot }, { runner: processRunner });
  const partial = inventory.entries.find((entry) => entry.path === 'partial.txt');
  assert.equal(partial.staged, true);
  assert.equal(partial.unstaged, true);
  assert.equal(partial.partiallyStaged, true);
  assert.ok(inventory.entries.some((entry) => entry.path === 'untracked.txt' && entry.untracked));
  assert.deepEqual(inventory.ignored, ['ignored.txt']);

  const stagedPartial = await bind(sourceRoot, [{ path: 'partial.txt', state: 'staged' }]);
  const workingPartial = await bind(sourceRoot, [{ path: 'partial.txt', state: 'working' }]);
  assert.equal(stagedPartial.entries[0].selectionOrigin, 'staged');
  assert.equal(workingPartial.entries[0].selectionOrigin, 'working');
  assert.notEqual(
    stagedPartial.entries[0].selected.digest,
    workingPartial.entries[0].selected.digest,
  );

  const manifest = await bind(sourceRoot, [
    { path: 'partial.txt', state: 'staged' },
    { path: 'working.txt', state: 'working' },
    { path: 'untracked.txt', state: 'working' },
  ]);
  const before = sourceSnapshot(sourceRoot);
  const payload = await transferPayload(sourceRoot, deliveryRoot, manifest);

  const preview = await transferSelection(payload, { runner: processRunner });
  assert.equal(preview.applied, false);
  assert.deepEqual(
    preview.actions.map(({ path, action, strategy }) => ({ path, action, strategy })),
    [
      { path: 'partial.txt', action: 'write', strategy: 'direct' },
      { path: 'working.txt', action: 'write', strategy: 'direct' },
      { path: 'untracked.txt', action: 'write', strategy: 'direct' },
    ],
  );
  assert.doesNotMatch(
    JSON.stringify(preview),
    /working selected|new selected|working after staged/,
  );

  const applied = await transferSelection(payload, { runner: processRunner, apply: true });
  assert.equal(applied.applied, true);
  assert.equal(applied.reconciliation.exact, true);
  assert.equal(readFileSync(join(deliveryRoot, 'partial.txt'), 'utf8'), 'staged\n');
  assert.equal(readFileSync(join(deliveryRoot, 'working.txt'), 'utf8'), 'working selected\n');
  assert.equal(readFileSync(join(deliveryRoot, 'untracked.txt'), 'utf8'), 'new selected\n');
  assert.deepEqual(sourceSnapshot(sourceRoot), before);

  write(deliveryRoot, 'extra.txt', 'validation side effect\n');
  const mismatch = await reconcileDelivery(
    { manifest, sourceRoot, deliveryRoot },
    { runner: processRunner },
  );
  assert.equal(mismatch.exact, false);
  assert.deepEqual(mismatch.mismatches.extra, ['extra.txt']);
});

test('selection preserves renames, deletions, executable modes, and tracked symlink blobs', async (t) => {
  const { sourceRoot, deliveryRoot } = createRepository(t);
  renameSync(join(sourceRoot, 'rename.txt'), join(sourceRoot, 'renamed.txt'));
  unlinkSync(join(sourceRoot, 'delete.txt'));
  chmodSync(join(sourceRoot, 'mode.txt'), 0o755);
  unlinkSync(join(sourceRoot, 'link.txt'));
  symlinkSync('working.txt', join(sourceRoot, 'link.txt'));
  git(
    sourceRoot,
    'add',
    '-A',
    '--',
    'rename.txt',
    'renamed.txt',
    'delete.txt',
    'mode.txt',
    'link.txt',
  );

  const manifest = await bind(sourceRoot, [
    { path: 'renamed.txt', state: 'staged' },
    { path: 'delete.txt', state: 'staged' },
    { path: 'mode.txt', state: 'staged' },
    { path: 'link.txt', state: 'staged' },
  ]);
  const payload = await transferPayload(sourceRoot, deliveryRoot, manifest);
  const result = await transferSelection(payload, { runner: processRunner, apply: true });

  assert.equal(result.reconciliation.exact, true);
  assert.equal(readFileSync(join(deliveryRoot, 'renamed.txt'), 'utf8'), 'rename me\n');
  assert.equal(
    runGit(deliveryRoot, ['status', '--short']).stdout.toString('utf8').includes('rename.txt'),
    true,
  );
  assert.equal(runGit(deliveryRoot, ['ls-files', '--error-unmatch', 'delete.txt']).status, 0);
  assert.equal(existsSync(join(deliveryRoot, 'delete.txt')), false);
  assert.equal(
    runGit(deliveryRoot, ['diff', '--name-status'])
      .stdout.toString('utf8')
      .includes('D\tdelete.txt'),
    true,
  );
  assert.equal(
    git(deliveryRoot, 'diff', '--summary').includes('mode change 100644 => 100755 mode.txt'),
    true,
  );
  assert.equal(readlinkSync(join(deliveryRoot, 'link.txt')), 'working.txt');
});

test('ignored paths and untracked symlinks fail closed', async (t) => {
  const { sourceRoot } = createRepository(t);
  write(sourceRoot, 'ignored.txt', 'ignored\n');
  symlinkSync('working.txt', join(sourceRoot, 'untracked-link'));

  await assert.rejects(
    bind(sourceRoot, [{ path: 'ignored.txt', state: 'working' }]),
    (error) => error.code === 'IGNORED_PATH',
  );
  await assert.rejects(
    bind(sourceRoot, [{ path: 'untracked-link', state: 'working' }]),
    (error) => error.code === 'UNSUPPORTED_PATH',
  );
});

test('source drift is observable and blocks transfer after confirmation', async (t) => {
  const { sourceRoot, deliveryRoot } = createRepository(t);
  write(sourceRoot, 'working.txt', 'confirmed\n');
  const manifest = await bind(sourceRoot, [{ path: 'working.txt', state: 'working' }]);
  write(sourceRoot, 'working.txt', 'drifted\n');

  const verification = await verifySourceManifest(
    { manifest, sourceRoot },
    { runner: processRunner },
  );
  assert.equal(verification.exact, false);
  assert.deepEqual(
    verification.drift.map(({ kind }) => kind),
    ['selected-state'],
  );

  const payload = await transferPayload(sourceRoot, deliveryRoot, manifest);
  await assert.rejects(
    transferSelection(payload, { runner: processRunner, apply: true }),
    (error) => error.code === 'SOURCE_DRIFT',
  );
  assert.equal(git(deliveryRoot, 'status', '--porcelain'), '');
});

test('refreshed base drift uses a deterministic three-way merge when edits do not overlap', async (t) => {
  const { sourceRoot, deliveryRoot } = createRepository(t);
  write(sourceRoot, 'working.txt', 'selected first\nmiddle\nbase last\n');
  git(sourceRoot, 'show', 'HEAD:working.txt');
  const manifest = await bind(sourceRoot, [{ path: 'working.txt', state: 'working' }]);

  write(deliveryRoot, 'working.txt', 'base first\nmiddle\nrefreshed last\n');
  git(deliveryRoot, 'add', '--', 'working.txt');
  git(deliveryRoot, 'commit', '-m', 'refresh base');
  const payload = await transferPayload(sourceRoot, deliveryRoot, manifest);
  const preview = await transferSelection(payload, { runner: processRunner });
  assert.equal(preview.actions[0].strategy, 'three-way');

  const applied = await transferSelection(payload, { runner: processRunner, apply: true });
  assert.equal(applied.reconciliation.exact, true);
  assert.equal(
    readFileSync(join(deliveryRoot, 'working.txt'), 'utf8'),
    'selected first\nmiddle\nrefreshed last\n',
  );
});

test('overlapping refreshed-base edits report a transfer conflict without mutation', async (t) => {
  const { sourceRoot, deliveryRoot } = createRepository(t);
  write(sourceRoot, 'working.txt', 'selected\n');
  const manifest = await bind(sourceRoot, [{ path: 'working.txt', state: 'working' }]);

  write(deliveryRoot, 'working.txt', 'refreshed\n');
  git(deliveryRoot, 'add', '--', 'working.txt');
  git(deliveryRoot, 'commit', '-m', 'refresh base');
  const payload = await transferPayload(sourceRoot, deliveryRoot, manifest);

  await assert.rejects(
    transferSelection(payload, { runner: processRunner, apply: true }),
    (error) => error.code === 'TRANSFER_CONFLICT',
  );
  assert.equal(readFileSync(join(deliveryRoot, 'working.txt'), 'utf8'), 'refreshed\n');
  assert.equal(git(deliveryRoot, 'status', '--porcelain'), '');
});

test('delivery receipt and clean-checkout guards reject stale or dirty targets', async (t) => {
  const { sourceRoot, deliveryRoot } = createRepository(t);
  write(sourceRoot, 'working.txt', 'selected\n');
  const manifest = await bind(sourceRoot, [{ path: 'working.txt', state: 'working' }]);
  const receipt = deliveryReceipt(deliveryRoot);
  const payload = { manifest, sourceRoot, deliveryRoot, deliveryReceipt: receipt };

  write(deliveryRoot, 'dirty.txt', 'dirty\n');
  await assert.rejects(
    transferSelection(payload, { runner: processRunner }),
    (error) => error.code === 'UNSAFE_DELIVERY_CHECKOUT',
  );
  unlinkSync(join(deliveryRoot, 'dirty.txt'));

  write(deliveryRoot, 'base-only.txt', 'new head\n');
  git(deliveryRoot, 'add', '--', 'base-only.txt');
  git(deliveryRoot, 'commit', '-m', 'move head');
  await assert.rejects(
    transferSelection(payload, { runner: processRunner }),
    (error) => error.code === 'UNSAFE_DELIVERY_CHECKOUT',
  );
});

test('selection replaces a tracked file with selected child paths without touching source', async (t) => {
  const { sourceRoot, deliveryRoot } = createRepository(t);
  unlinkSync(join(sourceRoot, 'file-shape'));
  write(sourceRoot, 'file-shape/child.txt', 'selected child\n');
  const manifest = await bind(sourceRoot, [
    { path: 'file-shape/child.txt', state: 'working' },
    { path: 'file-shape', state: 'working' },
  ]);
  assert.equal(manifest.entries[1].selected.kind, 'tombstone');
  const before = sourceSnapshot(sourceRoot);
  const selectedChild = readFileSync(join(sourceRoot, 'file-shape/child.txt'));

  const result = await transferSelection(
    await transferPayload(sourceRoot, deliveryRoot, manifest),
    { runner: processRunner, apply: true },
  );

  assert.equal(result.reconciliation.exact, true);
  assert.equal(
    readFileSync(join(deliveryRoot, 'file-shape/child.txt'), 'utf8'),
    'selected child\n',
  );
  assert.deepEqual(sourceSnapshot(sourceRoot), before);
  assert.deepEqual(readFileSync(join(sourceRoot, 'file-shape/child.txt')), selectedChild);
});

test('selection replaces a tracked directory shape with a file without touching source', async (t) => {
  const { sourceRoot, deliveryRoot } = createRepository(t);
  rmSync(join(sourceRoot, 'dir-shape'), { recursive: true });
  write(sourceRoot, 'dir-shape', 'selected replacement\n');
  const manifest = await bind(sourceRoot, [
    { path: 'dir-shape', state: 'working' },
    { path: 'dir-shape/child.txt', state: 'working' },
  ]);
  assert.equal(manifest.entries[0].sourceHead.to.oid, null);
  assert.equal(manifest.entries[1].selected.kind, 'tombstone');
  const before = sourceSnapshot(sourceRoot);
  const selectedFile = readFileSync(join(sourceRoot, 'dir-shape'));

  const result = await transferSelection(
    await transferPayload(sourceRoot, deliveryRoot, manifest),
    { runner: processRunner, apply: true },
  );

  assert.equal(result.reconciliation.exact, true);
  assert.equal(readFileSync(join(deliveryRoot, 'dir-shape'), 'utf8'), 'selected replacement\n');
  assert.equal(existsSync(join(deliveryRoot, 'dir-shape/child.txt')), false);
  assert.deepEqual(sourceSnapshot(sourceRoot), before);
  assert.deepEqual(readFileSync(join(sourceRoot, 'dir-shape')), selectedFile);
});

test('directory-to-file selection conflicts with an added refreshed-base descendant before mutation', async (t) => {
  const { sourceRoot, deliveryRoot } = createRepository(t);
  rmSync(join(sourceRoot, 'dir-shape'), { recursive: true });
  write(sourceRoot, 'dir-shape', 'selected replacement\n');
  const manifest = await bind(sourceRoot, [
    { path: 'dir-shape', state: 'working' },
    { path: 'dir-shape/child.txt', state: 'working' },
  ]);

  write(deliveryRoot, 'dir-shape/refreshed.txt', 'refreshed base\n');
  git(deliveryRoot, 'add', '--', 'dir-shape/refreshed.txt');
  git(deliveryRoot, 'commit', '-m', 'add refreshed descendant');
  const before = sourceSnapshot(sourceRoot);
  const payload = await transferPayload(sourceRoot, deliveryRoot, manifest);

  await assert.rejects(
    transferSelection(payload, { runner: processRunner, apply: true }),
    (error) => error.code === 'TRANSFER_CONFLICT',
  );
  assert.equal(readFileSync(join(deliveryRoot, 'dir-shape/child.txt'), 'utf8'), 'becomes a file\n');
  assert.equal(
    readFileSync(join(deliveryRoot, 'dir-shape/refreshed.txt'), 'utf8'),
    'refreshed base\n',
  );
  assert.equal(git(deliveryRoot, 'status', '--porcelain'), '');
  assert.deepEqual(sourceSnapshot(sourceRoot), before);
});

test('already-applied tombstone never owns an ignored delivery artifact', async (t) => {
  const { sourceRoot, deliveryRoot } = createRepository(t);
  unlinkSync(join(sourceRoot, 'gone.txt'));
  write(sourceRoot, 'working.txt', 'active selected write\n');
  const manifest = await bind(sourceRoot, [
    { path: 'gone.txt', state: 'working' },
    { path: 'working.txt', state: 'working' },
  ]);
  const sourceBefore = sourceSnapshot(sourceRoot);

  unlinkSync(join(deliveryRoot, 'gone.txt'));
  write(deliveryRoot, '.gitignore', 'ignored.txt\ngone.txt\n');
  git(deliveryRoot, 'add', '-A', '--', '.gitignore', 'gone.txt');
  git(deliveryRoot, 'commit', '-m', 'delete and ignore selected path');
  const payload = await transferPayload(sourceRoot, deliveryRoot, manifest);
  const preview = await transferSelection(payload, { runner: processRunner });
  assert.deepEqual(
    preview.actions.map(({ path, action, strategy }) => ({ path, action, strategy })),
    [
      { path: 'gone.txt', action: 'unchanged', strategy: 'already-applied' },
      { path: 'working.txt', action: 'write', strategy: 'direct' },
    ],
  );

  write(deliveryRoot, 'gone.txt', 'ignored setup artifact\n');
  for (const apply of [false, true]) {
    await assert.rejects(
      transferSelection(payload, { runner: processRunner, ...(apply ? { apply: true } : {}) }),
      (error) => error.code === 'TRANSFER_CONFLICT',
    );
    assert.equal(readFileSync(join(deliveryRoot, 'gone.txt'), 'utf8'), 'ignored setup artifact\n');
    assert.equal(
      readFileSync(join(deliveryRoot, 'working.txt'), 'utf8'),
      'base first\nmiddle\nbase last\n',
    );
  }
  assert.equal(git(deliveryRoot, 'status', '--porcelain'), '');
  assert.deepEqual(sourceSnapshot(sourceRoot), sourceBefore);
});

test('fully already-applied file-to-directory selection reconciles as exact file endpoints', async (t) => {
  const { sourceRoot, deliveryRoot } = createRepository(t);
  unlinkSync(join(sourceRoot, 'file-shape'));
  write(sourceRoot, 'file-shape/child.txt', 'already applied child\n');
  const manifest = await bind(sourceRoot, [
    { path: 'file-shape/child.txt', state: 'working' },
    { path: 'file-shape', state: 'working' },
  ]);
  const sourceBefore = sourceSnapshot(sourceRoot);

  unlinkSync(join(deliveryRoot, 'file-shape'));
  write(deliveryRoot, 'file-shape/child.txt', 'already applied child\n');
  git(deliveryRoot, 'add', '-A', '--', 'file-shape', 'file-shape/child.txt');
  git(deliveryRoot, 'commit', '-m', 'apply file to directory shape');
  const payload = await transferPayload(sourceRoot, deliveryRoot, manifest);

  const preview = await transferSelection(payload, { runner: processRunner });
  assert.deepEqual(
    preview.actions.map(({ path, action, strategy }) => ({ path, action, strategy })),
    [
      { path: 'file-shape/child.txt', action: 'unchanged', strategy: 'already-applied' },
      { path: 'file-shape', action: 'unchanged', strategy: 'already-applied' },
    ],
  );
  const applied = await transferSelection(payload, { runner: processRunner, apply: true });
  assert.equal(applied.reconciliation.exact, true);
  const reconciled = await reconcileDelivery(
    { manifest, sourceRoot, deliveryRoot },
    { runner: processRunner },
  );
  assert.equal(reconciled.exact, true);
  assert.equal(git(deliveryRoot, 'status', '--porcelain'), '');
  assert.deepEqual(sourceSnapshot(sourceRoot), sourceBefore);
});

test('mixed already-applied file-to-directory selection reconciles after an active write', async (t) => {
  const { sourceRoot, deliveryRoot } = createRepository(t);
  unlinkSync(join(sourceRoot, 'file-shape'));
  write(sourceRoot, 'file-shape/child.txt', 'already applied child\n');
  write(sourceRoot, 'working.txt', 'mixed active write\n');
  const manifest = await bind(sourceRoot, [
    { path: 'file-shape/child.txt', state: 'working' },
    { path: 'file-shape', state: 'working' },
    { path: 'working.txt', state: 'working' },
  ]);
  const sourceBefore = sourceSnapshot(sourceRoot);

  unlinkSync(join(deliveryRoot, 'file-shape'));
  write(deliveryRoot, 'file-shape/child.txt', 'already applied child\n');
  git(deliveryRoot, 'add', '-A', '--', 'file-shape', 'file-shape/child.txt');
  git(deliveryRoot, 'commit', '-m', 'apply file to directory shape');
  const payload = await transferPayload(sourceRoot, deliveryRoot, manifest);

  const preview = await transferSelection(payload, { runner: processRunner });
  assert.deepEqual(
    preview.actions.map(({ path, action, strategy }) => ({ path, action, strategy })),
    [
      { path: 'file-shape/child.txt', action: 'unchanged', strategy: 'already-applied' },
      { path: 'file-shape', action: 'unchanged', strategy: 'already-applied' },
      { path: 'working.txt', action: 'write', strategy: 'direct' },
    ],
  );
  const applied = await transferSelection(payload, { runner: processRunner, apply: true });
  assert.equal(applied.reconciliation.exact, true);
  assert.equal(readFileSync(join(deliveryRoot, 'working.txt'), 'utf8'), 'mixed active write\n');
  const reconciled = await reconcileDelivery(
    { manifest, sourceRoot, deliveryRoot },
    { runner: processRunner },
  );
  assert.equal(reconciled.exact, true);
  assert.deepEqual(sourceSnapshot(sourceRoot), sourceBefore);
});
