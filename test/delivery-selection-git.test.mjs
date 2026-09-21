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
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  bindSelectionManifest,
  fastForwardUpstream,
  inventoryRepository,
  nonInteractiveFetchEnv,
  reconcileDelivery,
  transferSelection,
  upstreamStatus,
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

test('mixed staged modification and working rename bind to their actual endpoints', async (t) => {
  const { sourceRoot } = createRepository(t);
  git(sourceRoot, 'config', 'status.renames', 'true');
  write(sourceRoot, 'rename.txt', 'staged before working rename\n');
  git(sourceRoot, 'add', '--', 'rename.txt');
  const stagedOid = git(sourceRoot, 'rev-parse', ':rename.txt');
  renameSync(join(sourceRoot, 'rename.txt'), join(sourceRoot, 'renamed.txt'));
  // Intent-to-add exposes the destination to Git's worktree rename detection without staging it.
  git(sourceRoot, 'add', '--intent-to-add', '--', 'renamed.txt');

  const inventory = await inventoryRepository({ root: sourceRoot }, { runner: processRunner });
  const stagedModification = inventory.entries.find((entry) => entry.path === 'rename.txt');
  assert.equal(stagedModification.kind, 'ordinary');
  assert.equal(stagedModification.indexStatus, 'M');
  assert.equal(stagedModification.worktreeStatus, '.');
  const workingRename = inventory.entries.find((entry) => entry.path === 'renamed.txt');
  assert.equal(workingRename.kind, 'rename');
  assert.equal(workingRename.indexStatus, '.');
  assert.equal(workingRename.worktreeStatus, 'R');
  assert.equal(workingRename.renameFrom, 'rename.txt');

  const staged = await bind(sourceRoot, [{ path: 'rename.txt', state: 'staged' }]);
  assert.equal(staged.entries[0].path, 'rename.txt');
  assert.equal(staged.entries[0].renameFrom, null);
  assert.equal(staged.entries[0].selected.kind, 'blob');
  assert.equal(staged.entries[0].selected.oid, stagedOid);

  const working = await bind(sourceRoot, [{ path: 'renamed.txt', state: 'working' }]);
  assert.equal(working.entries[0].path, 'renamed.txt');
  assert.equal(working.entries[0].renameFrom, 'rename.txt');

  await assert.rejects(
    bind(sourceRoot, [{ path: 'renamed.txt', state: 'staged' }]),
    (error) => error.code === 'INVALID_PATH',
  );

  const [headMode, , headOid] = git(sourceRoot, 'ls-tree', 'HEAD', '--', 'rename.txt').split(/\s+/);
  const [indexMode, stagedIndexOid] = git(
    sourceRoot,
    'ls-files',
    '--stage',
    '--',
    'rename.txt',
  ).split(/\s+/);
  const aggregateStatus = Buffer.from(
    `2 MR N... ${headMode} ${indexMode} ${indexMode} ${headOid} ${stagedIndexOid} R100 renamed.txt\0rename.txt\0`,
  );
  const porcelainArgs = [
    '-C',
    sourceRoot,
    'status',
    '--porcelain=v2',
    '-z',
    '--untracked-files=all',
    '--ignored=matching',
  ];
  const aggregateRunner = (call) => {
    if (
      call.executable === 'git' &&
      call.args.length === porcelainArgs.length &&
      call.args.every((arg, index) => arg === porcelainArgs[index])
    ) {
      return {
        status: 0,
        stdout: aggregateStatus,
        stderr: Buffer.alloc(0),
        error: undefined,
      };
    }
    return processRunner(call);
  };
  const aggregateBind = async (selection) =>
    await bindSelectionManifest({ sourceRoot, selection }, { runner: aggregateRunner });

  const aggregateStaged = await aggregateBind([{ path: 'rename.txt', state: 'staged' }]);
  assert.equal(aggregateStaged.entries[0].inventory.kind, 'ordinary');
  assert.equal(aggregateStaged.entries[0].path, 'rename.txt');
  assert.equal(aggregateStaged.entries[0].renameFrom, null);
  assert.equal(aggregateStaged.entries[0].selected.oid, stagedIndexOid);

  const aggregateWorking = await aggregateBind([{ path: 'renamed.txt', state: 'working' }]);
  assert.equal(aggregateWorking.entries[0].inventory.kind, 'rename');
  assert.equal(aggregateWorking.entries[0].path, 'renamed.txt');
  assert.equal(aggregateWorking.entries[0].renameFrom, 'rename.txt');

  await assert.rejects(
    aggregateBind([{ path: 'renamed.txt', state: 'staged' }]),
    (error) => error.code === 'INVALID_PATH',
  );
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

// --- Pre-selection upstream status and fast-forward ---
//
// These fixtures run with no global or XDG Git configuration, so a developer's global
// `core.hooksPath`, excludes file, or `pull.rebase` cannot leak into the source checkout under test.

const UPSTREAM_GIT_ENV = {
  ...GIT_ENV,
  GIT_CONFIG_GLOBAL: '/dev/null',
  XDG_CONFIG_HOME: join(tmpdir(), 'effective-flow-upstream-no-xdg-config'),
};

// Asynchronous like the shipped CLI runner: the fast-forward merge call chains on the promise.
async function upstreamRunner({ executable, args = [], stdin, cwd, env, timeout }) {
  const result = spawnSync(executable, args, {
    cwd,
    env: env === undefined ? UPSTREAM_GIT_ENV : { ...UPSTREAM_GIT_ENV, ...env },
    input: stdin,
    timeout,
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

function ugit(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], {
    env: UPSTREAM_GIT_ENV,
    encoding: null,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr?.toString('utf8'));
  return result.stdout.toString('utf8').trim();
}

function configureClone(root) {
  ugit(root, 'config', 'user.name', 'Effective Flow Test');
  ugit(root, 'config', 'user.email', 'effective-flow@example.invalid');
  ugit(root, 'config', 'core.hooksPath', join(root, '.git', 'hooks'));
}

// A bare remote plus two clones: `seed` publishes upstream commits, `local` is the source checkout.
function createUpstreamFixture(t) {
  const container = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-upstream-')));
  t.after(() => rmSync(container, { recursive: true, force: true }));
  const remote = join(container, 'remote.git');
  const seed = join(container, 'seed');
  const local = join(container, 'local');
  mkdirSync(remote);
  ugit(remote, 'init', '--bare', '--initial-branch=main');
  mkdirSync(seed);
  ugit(seed, 'init', '--initial-branch=main');
  configureClone(seed);
  ugit(seed, 'remote', 'add', 'origin', remote);
  write(seed, '.gitignore', '*.log\nignored-dir/\n');
  write(seed, 'shared.txt', 'shared base\n');
  write(seed, 'staged.txt', 'staged base\n');
  write(seed, 'working.txt', 'working base\n');
  write(seed, 'old.txt', 'rename source\n');
  ugit(seed, 'add', '.');
  ugit(seed, 'commit', '-m', 'seed');
  ugit(seed, 'push', '-u', 'origin', 'main');
  ugit(container, 'clone', '--quiet', remote, local);
  configureClone(local);
  return { container, remote, seed, local };
}

// Publishes one upstream commit from `seed` and returns its object id. A change that stages its
// own index entries returns `'staged'`, so `add -A` cannot undo an entry with no worktree file.
function publish(seed, message, change) {
  if (change(seed) !== 'staged') ugit(seed, 'add', '-A');
  ugit(seed, 'commit', '-m', message);
  ugit(seed, 'push', '--quiet', 'origin', 'HEAD');
  return ugit(seed, 'rev-parse', 'HEAD');
}

function localCommit(root, relativePath, content) {
  write(root, relativePath, content);
  ugit(root, 'add', '--', relativePath);
  ugit(root, 'commit', '-m', `local ${relativePath}`);
  return ugit(root, 'rev-parse', 'HEAD');
}

// The status helper pins an empty inherited environment so a developer's own GIT_SSH_COMMAND,
// GIT_SSH, or GIT_SSH_VARIANT cannot change the fetch environment under test.
async function status(root, fetch = true, runner = upstreamRunner, env = {}) {
  return await upstreamStatus({ root, fetch }, { runner, env });
}

const IDLE_FETCH = { attempted: false, ok: null, stale: null, error: null, skipped: null };
const FETCHED = { attempted: true, ok: true, stale: false, error: null, skipped: null };

function fastForwardPayload(root, result) {
  return {
    root,
    expectedBranch: result.branch,
    expectedHeadOid: result.headOid,
    expectedUpstreamOid: result.upstreamOid,
  };
}

async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail('expected the operation to be rejected');
}

function checkoutSnapshot(root, paths) {
  const run = (...args) =>
    spawnSync('git', ['-C', root, ...args], { env: UPSTREAM_GIT_ENV, encoding: null }).stdout;
  return {
    head: ugit(root, 'rev-parse', 'HEAD'),
    branch: ugit(root, 'symbolic-ref', '-q', 'HEAD'),
    index: run('ls-files', '--stage', '-z'),
    stagedDiff: run('diff', '--cached', '--binary'),
    workingDiff: run('diff', '--binary'),
    files: Object.fromEntries(
      paths.map((relativePath) => {
        const target = join(root, relativePath);
        if (!existsSync(target)) return [relativePath, null];
        return [
          relativePath,
          { bytes: readFileSync(target).toString('base64'), mode: statSync(target).mode },
        ];
      }),
    ),
  };
}

test('upstream status reports detached, no-upstream, upstream-gone, and up-to-date states', async (t) => {
  const { local } = createUpstreamFixture(t);
  const head = ugit(local, 'rev-parse', 'HEAD');

  const upToDate = await status(local);
  assert.equal(upToDate.state, 'up-to-date');
  assert.equal(upToDate.branch, 'main');
  assert.equal(upToDate.upstream, 'origin/main');
  assert.equal(upToDate.headOid, head);
  assert.equal(upToDate.upstreamOid, head);
  assert.equal(upToDate.mergeBaseOid, head);
  assert.deepEqual([upToDate.ahead, upToDate.behind], [0, 0]);
  assert.deepEqual(upToDate.fetch, FETCHED);

  ugit(local, 'checkout', '--quiet', '-b', 'feature');
  const noUpstream = await status(local);
  assert.equal(noUpstream.state, 'no-upstream');
  assert.equal(noUpstream.branch, 'feature');
  assert.equal(noUpstream.fetch.attempted, false);

  ugit(local, 'config', 'branch.feature.remote', 'origin');
  ugit(local, 'config', 'branch.feature.merge', 'refs/heads/missing');
  const gone = await status(local, false);
  assert.equal(gone.state, 'upstream-gone');
  assert.equal(gone.upstreamOid, null);
  assert.equal(gone.fetch.attempted, false);

  ugit(local, 'checkout', '--quiet', '--detach');
  const detached = await status(local);
  assert.equal(detached.state, 'detached');
  assert.equal(detached.branch, null);
  assert.equal(detached.headOid, head);
  assert.equal(detached.fetch.attempted, false);
});

test('upstream status reports ahead, behind, behind-overlap, and diverged states', async (t) => {
  const { seed, local } = createUpstreamFixture(t);

  localCommit(local, 'local-only.txt', 'ahead\n');
  const ahead = await status(local);
  assert.equal(ahead.state, 'ahead');
  assert.deepEqual([ahead.ahead, ahead.behind], [1, 0]);
  ugit(local, 'reset', '--quiet', '--hard', 'origin/main');

  const upstreamOid = publish(seed, 'incoming', (root) => write(root, 'incoming.txt', 'new\n'));
  const behind = await status(local);
  assert.equal(behind.state, 'behind');
  assert.deepEqual([behind.ahead, behind.behind], [0, 1]);
  assert.equal(behind.upstreamOid, upstreamOid);
  assert.deepEqual(behind.incomingPaths, ['incoming.txt']);
  assert.deepEqual(behind.overlappingPaths, []);

  write(local, 'incoming.txt', 'local untracked copy\n');
  const overlap = await status(local);
  assert.equal(overlap.state, 'behind-overlap');
  assert.deepEqual(overlap.overlappingPaths, ['incoming.txt']);
  rmSync(join(local, 'incoming.txt'));

  localCommit(local, 'local-only.txt', 'diverged\n');
  const diverged = await status(local);
  assert.equal(diverged.state, 'diverged');
  assert.deepEqual([diverged.ahead, diverged.behind], [1, 1]);
});

test('upstream status fetches only on request, with hooks disabled and a non-interactive environment', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  const upstreamOid = publish(seed, 'incoming', (root) => write(root, 'incoming.txt', 'new\n'));
  const calls = [];
  const recording = (call) => {
    calls.push(call);
    return upstreamRunner(call);
  };

  const unfetched = await status(local, false, recording);
  assert.equal(unfetched.state, 'up-to-date');
  assert.deepEqual(unfetched.fetch, IDLE_FETCH);
  assert.equal(
    calls.some((call) => call.args.includes('fetch')),
    false,
  );

  const fetched = await status(local, true, recording);
  assert.equal(fetched.state, 'behind');
  assert.equal(fetched.upstreamOid, upstreamOid);
  assert.deepEqual(fetched.fetch, FETCHED);
  const fetchCall = calls.find((call) => call.args.includes('fetch'));
  assert.ok(fetchCall.args.includes('core.hooksPath=/dev/null'));
  assert.deepEqual(fetchCall.args.slice(-3), ['--', 'origin', 'refs/heads/main']);
  assert.deepEqual(fetchCall.env, nonInteractiveFetchEnv({ inheritedEnvironment: process.env }));
  assert.equal(fetchCall.env.GIT_SSH_COMMAND, 'ssh -o BatchMode=yes');
  assert.equal(fetchCall.timeout, 60000);
});

test('the upstream fetch leaves a user-configured SSH setup untouched', async (t) => {
  const { local } = createUpstreamFixture(t);
  const calls = [];
  const recording = (call) => {
    calls.push(call);
    return upstreamRunner(call);
  };
  const fetchEnv = async (env) => {
    calls.length = 0;
    await status(local, true, recording, env);
    return calls.find((call) => call.args.includes('fetch')).env;
  };
  const assertUntouched = (env, label) => {
    assert.equal('GIT_SSH_COMMAND' in env, false, label);
    assert.equal(env.GIT_TERMINAL_PROMPT, '0', label);
    assert.equal(env.GCM_INTERACTIVE, 'never', label);
  };

  ugit(local, 'config', 'core.sshCommand', 'ssh -i /nonexistent/deploy-key -F /dev/null');
  assertUntouched(await fetchEnv(), 'core.sshCommand');
  ugit(local, 'config', '--unset', 'core.sshCommand');

  ugit(local, 'config', 'ssh.variant', 'ssh');
  assertUntouched(await fetchEnv(), 'ssh.variant');
  ugit(local, 'config', '--unset', 'ssh.variant');

  assertUntouched(await fetchEnv({ GIT_SSH_COMMAND: 'ssh -p 2222' }), 'GIT_SSH_COMMAND');
  assertUntouched(await fetchEnv({ GIT_SSH: '/usr/bin/plink' }), 'GIT_SSH');
  assertUntouched(await fetchEnv({ GIT_SSH_VARIANT: 'ssh' }), 'GIT_SSH_VARIANT');

  // With every setting gone again, the default ssh is back in batch mode.
  assert.equal((await fetchEnv()).GIT_SSH_COMMAND, 'ssh -o BatchMode=yes');

  // An inherited Git trace is removed for the fetch, so it cannot echo the SSH command.
  const traced = await fetchEnv({ GIT_TRACE: '1', GIT_TRACE_PACKFILE: '2', GIT_CURL_VERBOSE: '1' });
  for (const key of ['GIT_TRACE', 'GIT_TRACE_PACKFILE', 'GIT_CURL_VERBOSE']) {
    assert.ok(Object.hasOwn(traced, key), key);
    assert.equal(traced[key], undefined, key);
  }
});

test('an inherited GIT_TRACE_PACKFILE never writes the fetched pack to the fetch stderr', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  const inherited = { GIT_TRACE_PACKFILE: '2', GIT_TRACE: '2' };
  // The runner inherits the trace the way the shipped one inherits `process.env`.
  const fetchStderr = [];
  const runner = async ({ executable, args = [], stdin, cwd, env, timeout }) => {
    const result = spawnSync(executable, args, {
      cwd,
      env: { ...UPSTREAM_GIT_ENV, ...inherited, ...env },
      input: stdin,
      timeout,
      encoding: null,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (args.includes('fetch')) fetchStderr.push(result.stderr);
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error,
    };
  };

  // Control: the same inherited trace makes a plain fetch write the pack to stderr.
  publish(seed, 'control', (root) => write(root, 'control.txt', 'control\n'));
  const control = spawnSync('git', ['-C', local, 'fetch', '--quiet', 'origin'], {
    env: { ...UPSTREAM_GIT_ENV, ...inherited },
    encoding: null,
  });
  assert.equal(control.status, 0, control.stderr?.toString('utf8'));
  assert.ok(control.stderr.includes('PACK'));

  const upstreamOid = publish(seed, 'incoming', (root) => write(root, 'incoming.txt', 'new\n'));
  const result = await status(local, true, runner, inherited);
  assert.deepEqual(result.fetch, FETCHED);
  assert.equal(result.upstreamOid, upstreamOid);
  assert.equal(fetchStderr.length, 1);
  assert.equal(fetchStderr[0].length, 0, fetchStderr[0].toString('latin1').slice(0, 200));
});

test('the ssh program Git runs receives the configured command unchanged', async (t) => {
  const { container, local } = createUpstreamFixture(t);
  // A stub named ssh, under a directory with a space, records its argv and refuses the connection.
  const binDir = join(container, 'stub bin');
  mkdirSync(binDir);
  const argvLog = join(container, 'ssh-argv.log');
  const stub = join(binDir, 'ssh');
  writeFileSync(
    stub,
    `#!/bin/sh\nfor arg in "$@"; do printf '%s\\n' "$arg"; done > '${argvLog}'\nexit 1\n`,
  );
  chmodSync(stub, 0o755);
  ugit(local, 'remote', 'set-url', 'origin', 'ssh://git@example.invalid/repo.git');
  ugit(local, 'config', 'core.sshCommand', `'${stub}' -o BatchMode=no -p 2222`);

  const result = await status(local);
  assert.equal(result.fetch.attempted, true);
  assert.equal(result.fetch.ok, false);
  const argv = readFileSync(argvLog, 'utf8').split('\n');
  assert.deepEqual(argv.slice(0, 4), ['-o', 'BatchMode=no', '-p', '2222'], argv.join(' '));
  assert.equal(argv.includes('BatchMode=yes'), false, argv.join(' '));
});

test('a fetch that times out is reported as fetch.error timeout without failing the status', async (t) => {
  const { local } = createUpstreamFixture(t);
  const runner = (call) =>
    call.args.includes('fetch')
      ? {
          status: null,
          signal: 'SIGKILL',
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
          error: { code: 'ETIMEDOUT' },
        }
      : upstreamRunner(call);

  const result = await status(local, true, runner);
  assert.equal(result.state, 'up-to-date');
  assert.deepEqual(result.fetch, {
    attempted: true,
    ok: false,
    stale: null,
    error: 'timeout',
    skipped: null,
  });
});

test('unrelated histories are reported as diverged with no merge base', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  ugit(seed, 'checkout', '--quiet', '--orphan', 'replacement');
  ugit(seed, 'rm', '-r', '-q', '--cached', '.');
  write(seed, 'unrelated.txt', 'unrelated history\n');
  ugit(seed, 'add', '--', 'unrelated.txt');
  ugit(seed, 'commit', '-q', '-m', 'unrelated root');
  ugit(seed, 'push', '--quiet', '--force', 'origin', 'replacement:main');

  const result = await status(local);
  assert.equal(result.state, 'diverged');
  assert.equal(result.mergeBaseOid, null);
  assert.ok(result.ahead > 0);
  assert.ok(result.behind > 0);
  assert.deepEqual(result.incomingPaths, []);
  assert.deepEqual(result.fetch, FETCHED);
});

test('upstream status reports a failed fetch without failing the operation', async (t) => {
  const { local } = createUpstreamFixture(t);
  ugit(local, 'remote', 'set-url', 'origin', join(local, 'no-such-remote.git'));

  const result = await status(local);
  assert.equal(result.state, 'up-to-date');
  assert.equal(result.fetch.attempted, true);
  assert.equal(result.fetch.ok, false);
  assert.equal(result.fetch.stale, null);
  assert.equal(result.fetch.skipped, null);
  assert.equal(typeof result.fetch.error, 'string');
  assert.ok(result.fetch.error.length > 0);
  assert.ok(result.fetch.error.length <= 2000);
});

test('a failed fetch reports no credential from the remote URL', async (t) => {
  const { local } = createUpstreamFixture(t);
  const missing = join(local, 'no-such-remote.git');
  const runner = async (call) =>
    call.args.includes('fetch')
      ? {
          status: 128,
          stdout: Buffer.alloc(0),
          stderr: Buffer.from(
            `fatal: unable to access 'https://user:pa55@example.invalid/r.git/?private_token=q5ecret#t0ken': 401\n`,
          ),
          error: undefined,
        }
      : upstreamRunner(call);
  ugit(local, 'remote', 'set-url', 'origin', missing);

  const result = await status(local, true, runner);
  assert.equal(result.fetch.ok, false);
  assert.equal(
    result.fetch.error,
    "fatal: unable to access 'https://***@example.invalid/r.git/?***': 401",
  );
  for (const secret of ['pa55', 'q5ecret', 't0ken']) {
    assert.equal(result.fetch.error.includes(secret), false);
  }
});

test('a local-dot upstream is compared without any fetch', async (t) => {
  const { local } = createUpstreamFixture(t);
  ugit(local, 'checkout', '--quiet', '-b', 'topic');
  ugit(local, 'branch', '--quiet', '--set-upstream-to=main');
  assert.equal(ugit(local, 'config', 'branch.topic.remote'), '.');
  ugit(local, 'checkout', '--quiet', 'main');
  const mainOid = localCommit(local, 'main-only.txt', 'moved main\n');
  ugit(local, 'checkout', '--quiet', 'topic');
  const calls = [];

  const result = await status(local, true, (call) => {
    calls.push(call);
    return upstreamRunner(call);
  });
  assert.equal(result.state, 'behind');
  assert.equal(result.upstreamOid, mainOid);
  assert.equal(result.upstream, 'main');
  assert.deepEqual(result.fetch, IDLE_FETCH);
  assert.equal(
    calls.some((call) => call.args.includes('fetch')),
    false,
  );
});

test('a merge ref that differs from the branch name is fetched and compared', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  ugit(local, 'checkout', '--quiet', '-b', 'work', '--track', 'origin/main');
  assert.equal(ugit(local, 'config', 'branch.work.merge'), 'refs/heads/main');
  const upstreamOid = publish(seed, 'incoming', (root) => write(root, 'incoming.txt', 'new\n'));

  const result = await status(local);
  assert.equal(result.state, 'behind');
  assert.equal(result.branch, 'work');
  assert.equal(result.upstream, 'origin/main');
  assert.equal(result.upstreamOid, upstreamOid);
  assert.deepEqual(result.fetch, FETCHED);
});

test('a narrowed fetch refspec leaves the upstream untracked rather than gone', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  ugit(local, 'config', 'remote.origin.fetch', '+refs/heads/other:refs/remotes/origin/other');
  publish(seed, 'incoming', (root) => write(root, 'incoming.txt', 'new\n'));

  const result = await status(local);
  assert.equal(result.fetch.attempted, true);
  assert.equal(result.fetch.ok, true);
  // Staleness compares the fetched commit against the tracking ref. There is none, so the fetch is
  // not reported as stale: it succeeded and brought the upstream commit in.
  assert.equal(result.fetch.stale, null);
  // The narrowed refspec maps no tracking ref for `main`, so the fetched commit never becomes
  // `@{u}` and the status cannot claim `behind` from it. The upstream is untracked, not gone.
  assert.equal(result.state, 'untracked-upstream');
  assert.equal(result.upstream, null);
  assert.equal(result.upstreamOid, null);
});

test('a branch whose remote is a URL reports untracked-upstream, not upstream-gone', async (t) => {
  const { remote, seed, local } = createUpstreamFixture(t);
  publish(seed, 'incoming', (root) => write(root, 'incoming.txt', 'new\n'));
  // A URL in place of a remote name fetches fine but resolves no tracking ref at all.
  ugit(local, 'config', '--replace-all', 'branch.main.remote', `file://${remote}`);

  const result = await status(local);
  assert.equal(result.fetch.attempted, true);
  assert.equal(result.fetch.ok, true);
  assert.equal(result.fetch.stale, null);
  assert.equal(result.fetch.error, null);
  assert.equal(result.state, 'untracked-upstream');
  assert.equal(result.upstream, null);
  assert.equal(result.upstreamOid, null);
});

test('a tracking ref that is known but no longer resolves stays upstream-gone', async (t) => {
  const { local } = createUpstreamFixture(t);
  // `origin/missing` is the tracking ref Git resolves; it simply names no commit.
  ugit(local, 'config', 'branch.main.merge', 'refs/heads/missing');

  const result = await status(local, false);
  assert.equal(result.state, 'upstream-gone');
  assert.equal(result.upstream, 'origin/missing');
  assert.equal(result.upstreamOid, null);
});

test('core.ignorecase makes the overlap check case-insensitive', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  publish(seed, 'incoming', (root) => write(root, 'Notes.txt', 'upstream\n'));
  write(local, 'NOTES.txt', 'local untracked\n');

  ugit(local, 'config', 'core.ignorecase', 'true');
  const folded = await status(local);
  assert.equal(folded.state, 'behind-overlap');
  assert.deepEqual(folded.overlappingPaths, ['NOTES.txt']);
});

test('core.precomposeunicode alone also folds the overlap check', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  publish(seed, 'incoming', (root) => write(root, 'Notes.txt', 'upstream\n'));
  write(local, 'NOTES.txt', 'local untracked\n');

  // A checkout that folds the Unicode normalization form folds path spellings too, so the overlap
  // check must run folded there as well, not only where `core.ignorecase` is set.
  ugit(local, 'config', 'core.ignorecase', 'false');
  ugit(local, 'config', 'core.precomposeunicode', 'true');
  const folded = await status(local);
  assert.equal(folded.state, 'behind-overlap');
  assert.deepEqual(folded.overlappingPaths, ['NOTES.txt']);
});

test('an option-like or malformed remote or merge ref skips the fetch and still classifies', async (t) => {
  const { local } = createUpstreamFixture(t);
  const head = ugit(local, 'rev-parse', 'HEAD');
  for (const [key, value] of [
    ['branch.main.remote', '--upload-pack=touch pwned'],
    ['branch.main.merge', '--upload-pack=touch pwned'],
    ['branch.main.merge', 'main'],
    ['branch.main.merge', 'refs/heads/main:refs/heads/other'],
    ['branch.main.merge', '+refs/heads/main'],
    ['branch.main.merge', 'refs/heads/*'],
    ['branch.main.merge', 'refs/heads/ma^in'],
    ['branch.main.merge', 'refs/heads/ma in'],
    ['branch.main.merge', 'refs/heads/main..x'],
  ]) {
    const label = `${key}=${value}`;
    const original = ugit(local, 'config', key);
    ugit(local, 'config', key, value);
    const calls = [];
    const result = await status(local, true, (call) => {
      calls.push(call);
      return upstreamRunner(call);
    });
    assert.deepEqual(
      result.fetch,
      { attempted: false, ok: null, stale: null, error: null, skipped: 'invalid-config' },
      label,
    );
    assert.equal(result.headOid, head, label);
    assert.ok(
      ['untracked-upstream', 'upstream-gone', 'up-to-date'].includes(result.state),
      `${label}: ${result.state}`,
    );
    assert.equal(
      calls.some((call) => call.args.includes('fetch')),
      false,
      label,
    );
    ugit(local, 'config', key, original);
  }
  assert.equal(existsSync(join(local, 'pwned')), false);
});

test('a fast-forward dry run previews the update without changing the checkout', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  publish(seed, 'incoming', (root) => write(root, 'incoming.txt', 'new\n'));
  write(local, 'working.txt', 'unstaged edit\n');
  const result = await status(local);
  assert.equal(result.state, 'behind');
  const before = checkoutSnapshot(local, ['working.txt', 'incoming.txt']);

  const preview = await fastForwardUpstream(fastForwardPayload(local, result), {
    runner: upstreamRunner,
  });
  assert.deepEqual(preview, {
    branch: 'main',
    fromOid: result.headOid,
    toOid: result.upstreamOid,
    incomingPaths: ['incoming.txt'],
    hooksSkipped: true,
    applied: false,
  });
  assert.deepEqual(checkoutSnapshot(local, ['working.txt', 'incoming.txt']), before);
});

test('an applied fast-forward preserves unrelated staged, unstaged, untracked, and ignored state', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  const upstreamOid = publish(seed, 'incoming', (root) => {
    write(root, 'incoming.txt', 'new\n');
    write(root, 'shared.txt', 'shared upstream\n');
  });
  write(local, 'staged.txt', 'staged local edit\n');
  ugit(local, 'add', '--', 'staged.txt');
  write(local, 'working.txt', 'unstaged local edit\n');
  write(local, 'untracked.sh', '#!/bin/sh\nexit 0\n');
  chmodSync(join(local, 'untracked.sh'), 0o755);
  write(local, 'build.log', 'ignored local bytes\n');
  write(local, 'ignored-dir/nested.bin', Buffer.from([0, 1, 2, 3]));
  const localPaths = [
    'staged.txt',
    'working.txt',
    'untracked.sh',
    'build.log',
    'ignored-dir/nested.bin',
  ];
  const result = await status(local);
  assert.equal(result.state, 'behind');
  const before = checkoutSnapshot(local, localPaths);

  const applied = await fastForwardUpstream(fastForwardPayload(local, result), {
    runner: upstreamRunner,
    apply: true,
  });
  assert.equal(applied.applied, true);
  assert.equal(applied.newHeadOid, upstreamOid);
  assert.equal(applied.fromOid, result.headOid);
  assert.equal(applied.hooksSkipped, true);
  assert.ok(applied.verifiedPathCount >= localPaths.length);

  const after = checkoutSnapshot(local, localPaths);
  assert.equal(after.head, upstreamOid);
  assert.equal(after.branch, 'refs/heads/main');
  assert.deepEqual(after.files, before.files);
  assert.deepEqual(after.stagedDiff, before.stagedDiff);
  assert.deepEqual(after.workingDiff, before.workingDiff);
  assert.equal(readFileSync(join(local, 'incoming.txt'), 'utf8'), 'new\n');
  assert.equal(readFileSync(join(local, 'shared.txt'), 'utf8'), 'shared upstream\n');
  assert.equal(statSync(join(local, 'untracked.sh')).mode & 0o777, 0o755);
});

const OVERLAP_CASES = [
  {
    name: 'a modified tracked file the upstream also changes',
    upstream: (root) => write(root, 'shared.txt', 'shared upstream\n'),
    local: (root) => write(root, 'shared.txt', 'shared local edit\n'),
    overlapping: ['shared.txt'],
    preserved: ['shared.txt'],
  },
  {
    name: 'an untracked file the upstream adds',
    upstream: (root) => write(root, 'added.txt', 'upstream added\n'),
    local: (root) => write(root, 'added.txt', 'local untracked\n'),
    overlapping: ['added.txt'],
    preserved: ['added.txt'],
  },
  {
    name: 'an ignored local file the upstream adds',
    upstream: (root) => {
      write(root, 'release.log', 'upstream tracked log\n');
      ugit(root, 'add', '-f', '--', 'release.log');
    },
    local: (root) => write(root, 'release.log', 'local ignored log\n'),
    overlapping: ['release.log'],
    preserved: ['release.log'],
  },
  {
    name: "a local change to an upstream rename's source path",
    upstream: (root) => renameSync(join(root, 'old.txt'), join(root, 'renamed.txt')),
    local: (root) => write(root, 'old.txt', 'rename source local edit\n'),
    overlapping: ['old.txt'],
    preserved: ['old.txt', 'renamed.txt'],
  },
  {
    name: 'a local rename whose source the upstream modifies',
    upstream: (root) => write(root, 'old.txt', 'rename source upstream edit\n'),
    local: (root) => ugit(root, 'mv', 'old.txt', 'local-renamed.txt'),
    overlapping: ['old.txt'],
    preserved: ['old.txt', 'local-renamed.txt'],
  },
  {
    name: 'a local untracked file where the upstream adds a directory',
    upstream: (root) => write(root, 'clash/child.txt', 'upstream child\n'),
    local: (root) => write(root, 'clash', 'local file\n'),
    overlapping: ['clash'],
    preserved: ['clash'],
  },
  {
    name: 'an incoming gitlink',
    upstream: (root) => {
      const oid = ugit(root, 'rev-parse', 'HEAD');
      ugit(root, 'update-index', '--add', '--cacheinfo', `160000,${oid},vendor/sub`);
      return 'staged';
    },
    local: () => {},
    overlapping: ['vendor/sub'],
    preserved: ['vendor/sub'],
  },
];

for (const overlapCase of OVERLAP_CASES) {
  test(`fast-forward is refused without mutation for ${overlapCase.name}`, async (t) => {
    const { seed, local } = createUpstreamFixture(t);
    publish(seed, overlapCase.name, overlapCase.upstream);
    overlapCase.local(local);
    const result = await status(local);
    assert.equal(result.state, 'behind-overlap');
    assert.deepEqual(result.overlappingPaths, overlapCase.overlapping);
    const before = checkoutSnapshot(local, overlapCase.preserved);

    const error = await rejection(
      fastForwardUpstream(fastForwardPayload(local, result), {
        runner: upstreamRunner,
        apply: true,
      }),
    );
    assert.equal(error.code, 'SOURCE_DRIFT');
    assert.equal(error.details.mutationMayHaveSucceeded, false);
    assert.deepEqual(error.details.overlappingPaths, overlapCase.overlapping);
    assert.deepEqual(checkoutSnapshot(local, overlapCase.preserved), before);
  });
}

test('an applied fast-forward does not run the post-merge hook', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  const hook = join(local, '.git', 'hooks', 'post-merge');
  write(local, '.git/hooks/post-merge', '#!/bin/sh\necho ran > hook-ran.txt\n');
  chmodSync(hook, 0o755);
  publish(seed, 'first', (root) => write(root, 'first.txt', 'first\n'));
  const result = await status(local);

  await fastForwardUpstream(fastForwardPayload(local, result), {
    runner: upstreamRunner,
    apply: true,
  });
  assert.equal(ugit(local, 'rev-parse', 'HEAD'), result.upstreamOid);
  assert.equal(existsSync(join(local, 'hook-ran.txt')), false);

  // Control: the same hook does run on an ordinary fast-forward merge, so its absence above is the
  // helper's doing and not a hook that could never fire.
  publish(seed, 'second', (root) => write(root, 'second.txt', 'second\n'));
  ugit(local, 'fetch', '--quiet', 'origin');
  ugit(local, 'merge', '--ff-only', '--quiet', 'origin/main');
  assert.equal(existsSync(join(local, 'hook-ran.txt')), true);
});

test('HEAD drift between status and apply fails as SOURCE_DRIFT without mutation', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  publish(seed, 'incoming', (root) => write(root, 'incoming.txt', 'new\n'));
  const result = await status(local);
  assert.equal(result.state, 'behind');
  const driftedHead = localCommit(local, 'drift.txt', 'drift\n');

  const error = await rejection(
    fastForwardUpstream(fastForwardPayload(local, result), {
      runner: upstreamRunner,
      apply: true,
    }),
  );
  assert.equal(error.code, 'SOURCE_DRIFT');
  assert.equal(error.details.mutationMayHaveSucceeded, false);
  assert.equal(ugit(local, 'rev-parse', 'HEAD'), driftedHead);
});

test('fast-forward targets the pinned upstream commit even after the tracking ref moves', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  const pinned = publish(seed, 'first', (root) => write(root, 'first.txt', 'first\n'));
  const result = await status(local);
  assert.equal(result.upstreamOid, pinned);
  const moved = publish(seed, 'second', (root) => write(root, 'second.txt', 'second\n'));
  ugit(local, 'fetch', '--quiet', 'origin');
  assert.equal(ugit(local, 'rev-parse', 'origin/main'), moved);

  const applied = await fastForwardUpstream(fastForwardPayload(local, result), {
    runner: upstreamRunner,
    apply: true,
  });
  assert.equal(applied.newHeadOid, pinned);
  assert.equal(ugit(local, 'rev-parse', 'HEAD'), pinned);
  assert.equal(existsSync(join(local, 'second.txt')), false);
});

function isMergeCall(call) {
  return call.args.includes('merge') && call.args.includes('--ff-only');
}

test('a local change after the merge fails verification with mutationMayHaveSucceeded true', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  const upstreamOid = publish(seed, 'incoming', (root) => write(root, 'incoming.txt', 'new\n'));
  write(local, 'working.txt', 'unstaged local edit\n');
  const result = await status(local);
  const runner = async (call) => {
    const outcome = await upstreamRunner(call);
    if (isMergeCall(call)) write(local, 'working.txt', 'changed during the merge\n');
    return outcome;
  };

  const error = await rejection(
    fastForwardUpstream(fastForwardPayload(local, result), { runner, apply: true }),
  );
  assert.equal(error.code, 'COMMAND_FAILED');
  assert.equal(error.details.mutationMayHaveSucceeded, true);
  assert.equal(error.details.oldHeadOid, result.headOid);
  assert.equal(error.details.newHeadOid, upstreamOid);
  assert.deepEqual(error.details.differingPaths, ['working.txt']);
});

test('a merge Git refuses without writing reports mutationMayHaveSucceeded false', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  publish(seed, 'incoming', (root) => write(root, 'incoming.txt', 'new\n'));
  write(local, 'working.txt', 'unstaged local edit\n');
  const result = await status(local);
  const before = checkoutSnapshot(local, ['working.txt', 'incoming.txt']);
  const runner = async (call) =>
    isMergeCall(call)
      ? {
          status: 128,
          stdout: Buffer.alloc(0),
          stderr: Buffer.from('refused https://u:tok@example.invalid/r.git?token=x'),
          error: undefined,
        }
      : upstreamRunner(call);

  const error = await rejection(
    fastForwardUpstream(fastForwardPayload(local, result), { runner, apply: true }),
  );
  assert.equal(error.code, 'COMMAND_FAILED');
  assert.equal(error.details.mutationMayHaveSucceeded, false);
  assert.equal(error.details.status, 128);
  assert.equal(error.details.stderr, 'refused https://***@example.invalid/r.git?***');
  assert.deepEqual(checkoutSnapshot(local, ['working.txt', 'incoming.txt']), before);
});

test('a real Git refusal on a held index lock reports no mutation and its stderr', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  publish(seed, 'incoming', (root) => write(root, 'incoming.txt', 'new\n'));
  write(local, 'working.txt', 'unstaged local edit\n');
  const result = await status(local);
  assert.equal(result.state, 'behind');
  const lock = join(local, '.git', 'index.lock');
  writeFileSync(lock, '');
  t.after(() => rmSync(lock, { force: true }));
  const before = checkoutSnapshot(local, ['working.txt', 'incoming.txt']);

  const error = await rejection(
    fastForwardUpstream(fastForwardPayload(local, result), {
      runner: upstreamRunner,
      apply: true,
    }),
  );
  assert.equal(error.code, 'COMMAND_FAILED');
  assert.equal(error.message, 'git refused the fast-forward');
  assert.equal(error.details.mutationMayHaveSucceeded, false);
  assert.notEqual(error.details.status, 0);
  assert.match(error.details.stderr, /index\.lock/);
  assert.ok(error.details.stderr.length <= 2000);
  assert.deepEqual(checkoutSnapshot(local, ['working.txt', 'incoming.txt']), before);
});

test('a runner exception on the post-merge HEAD read reports mutationMayHaveSucceeded true', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  publish(seed, 'incoming', (root) => write(root, 'incoming.txt', 'new\n'));
  const result = await status(local);
  let merged = false;
  const runner = async (call) => {
    if (isMergeCall(call)) {
      merged = true;
      return upstreamRunner(call);
    }
    if (merged && call.args.at(-2) === 'rev-parse' && call.args.at(-1) === 'HEAD') {
      throw Object.assign(new Error('runner lost'), { code: 'EPIPE' });
    }
    return upstreamRunner(call);
  };

  const error = await rejection(
    fastForwardUpstream(fastForwardPayload(local, result), { runner, apply: true }),
  );
  assert.equal(error.code, 'COMMAND_FAILED');
  assert.equal(error.message, 'fast-forward outcome could not be verified');
  assert.equal(error.details.mutationMayHaveSucceeded, true);
  assert.equal(error.details.cause, 'EPIPE');
  assert.equal(error.details.oldHeadOid, result.headOid);
});

for (const [name, drift] of [
  ['a different branch at the same commit', (root) => ugit(root, 'checkout', '-q', '-b', 'other')],
  ['a detached HEAD at the same commit', (root) => ugit(root, 'checkout', '-q', '--detach')],
]) {
  test(`branch drift to ${name} fails as SOURCE_DRIFT without mutation`, async (t) => {
    const { seed, local } = createUpstreamFixture(t);
    publish(seed, 'incoming', (root) => write(root, 'incoming.txt', 'new\n'));
    const result = await status(local);
    assert.equal(result.state, 'behind');
    drift(local);
    const headBefore = ugit(local, 'rev-parse', 'HEAD');
    const merges = [];

    const error = await rejection(
      fastForwardUpstream(fastForwardPayload(local, result), {
        runner: (call) => {
          if (isMergeCall(call)) merges.push(call);
          return upstreamRunner(call);
        },
        apply: true,
      }),
    );
    assert.equal(error.code, 'SOURCE_DRIFT');
    assert.equal(error.details.mutationMayHaveSucceeded, false);
    assert.equal(error.details.expected, 'main');
    assert.deepEqual(merges, []);
    assert.equal(ugit(local, 'rev-parse', 'HEAD'), headBefore);
    assert.equal(existsSync(join(local, 'incoming.txt')), false);
  });
}

test('an ignored tree outside the directories the merge writes is neither read nor verified', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  const upstreamOid = publish(seed, 'incoming', (root) =>
    write(root, 'src/app/incoming.txt', 'new\n'),
  );
  write(local, '.git/info/exclude', 'node_modules/\n');
  for (const name of ['a.js', 'b.js', 'nested/c.js']) {
    write(local, `packages/tool/node_modules/${name}`, `${name}\n`);
  }
  write(local, 'src/app/draft.txt', 'untracked sibling\n');
  write(local, 'working.txt', 'unstaged local edit\n');
  const result = await status(local);
  assert.equal(result.state, 'behind');
  assert.deepEqual(result.incomingPaths, ['src/app/incoming.txt']);
  const runner = async (call) => {
    const outcome = await upstreamRunner(call);
    if (isMergeCall(call)) {
      write(local, 'packages/tool/node_modules/written-during-merge.js', 'late\n');
      writeFileSync(join(local, 'packages/tool/node_modules/a.js'), 'rewritten\n');
    }
    return outcome;
  };

  const applied = await fastForwardUpstream(fastForwardPayload(local, result), {
    runner,
    apply: true,
  });
  assert.equal(applied.applied, true);
  assert.equal(applied.newHeadOid, upstreamOid);
  // Only `working.txt` (in the root, an ancestor) and `src/app/draft.txt` (in the incoming parent)
  // are verified. The ignored `packages/tool/node_modules/` lives in `packages/tool/`, which is
  // neither an incoming parent nor an ancestor of one, so the write into it during the merge is
  // outside the verified scope and does not turn the success into a possible mutation.
  assert.equal(applied.verifiedPathCount, 2);
  assert.equal(readFileSync(join(local, 'src/app/draft.txt'), 'utf8'), 'untracked sibling\n');
});

test('the CLI previews fast-forward by default and applies it only with --apply', async (t) => {
  const { seed, local } = createUpstreamFixture(t);
  const upstreamOid = publish(seed, 'incoming', (root) => write(root, 'incoming.txt', 'new\n'));
  const script = fileURLToPath(new URL('../src/scripts/delivery-selection.mjs', import.meta.url));
  const cli = (args, input) => {
    const outcome = spawnSync(process.execPath, [script, ...args], {
      input: JSON.stringify(input),
      env: UPSTREAM_GIT_ENV,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.equal(outcome.status, 0, outcome.stderr);
    return JSON.parse(outcome.stdout);
  };

  const statusEnvelope = cli(['upstream-status'], { root: local, fetch: true });
  assert.equal(statusEnvelope.ok, true);
  assert.equal(statusEnvelope.dryRun, false);
  assert.equal(statusEnvelope.data.state, 'behind');
  const payload = fastForwardPayload(local, statusEnvelope.data);

  const preview = cli(['fast-forward'], payload);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.data.applied, false);
  assert.equal(ugit(local, 'rev-parse', 'HEAD'), statusEnvelope.data.headOid);

  const applied = cli(['fast-forward', '--apply'], payload);
  assert.equal(applied.dryRun, false);
  assert.equal(applied.data.applied, true);
  assert.equal(ugit(local, 'rev-parse', 'HEAD'), upstreamOid);
});
