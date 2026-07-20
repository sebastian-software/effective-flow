import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
};

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    env: GIT_ENV,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function canonical(path) {
  return realpathSync(path);
}

function canonicalGitPath(root, command) {
  const value = git(root, ...command);
  return canonical(resolve(root, value));
}

function createRepository(t, { commits = 1 } = {}) {
  const container = canonical(mkdtempSync(join(tmpdir(), 'effective-flow-location-')));
  const root = join(container, 'repository');
  mkdirSync(root);
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.name', 'Effective Flow Test');
  git(root, 'config', 'user.email', 'effective-flow@example.invalid');
  writeFileSync(join(root, '.gitignore'), '.effective-flow/\n');
  git(root, 'add', '.gitignore');

  for (let index = 1; index <= commits; index += 1) {
    writeFileSync(join(root, 'history.txt'), `revision ${index}\n`);
    git(root, 'add', 'history.txt');
    git(root, 'commit', '-m', `history ${index}`);
  }

  t.after(() => rmSync(container, { recursive: true, force: true }));
  return { container, root: canonical(root) };
}

function worktreeEntries(root) {
  return git(root, 'worktree', 'list', '--porcelain')
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      const worktree = lines.find((line) => line.startsWith('worktree '))?.slice(9);
      const branch = lines.find((line) => line.startsWith('branch '))?.slice(7);
      const head = lines.find((line) => line.startsWith('HEAD '))?.slice(5);
      return {
        root: canonical(worktree),
        branch: branch?.replace(/^refs\/heads\//, '') ?? '',
        detached: lines.includes('detached'),
        head,
      };
    });
}

function captureReceipt(root, { origin, owner, purpose, setupStatus = 'pending' }) {
  const executionRoot = canonicalGitPath(root, ['rev-parse', '--show-toplevel']);
  const branch = git(executionRoot, 'branch', '--show-current');
  const receipt = {
    repositoryIdentity: canonicalGitPath(executionRoot, ['rev-parse', '--git-common-dir']),
    executionRoot,
    checkout: branch
      ? { type: 'branch', branch }
      : { type: 'detached', oid: git(executionRoot, 'rev-parse', 'HEAD') },
    origin,
    owner,
    purpose,
    setupStatus,
  };
  return { ...receipt, runtimeStateRoot: resolveRuntimeStateRoot(executionRoot, receipt) };
}

function resolveRuntimeStateRoot(executionRoot, receipt, { porcelain } = {}) {
  const listing = porcelain ?? git(executionRoot, 'worktree', 'list', '--porcelain');
  const firstRecord = listing.split(/\n\n/)[0] ?? '';
  const lines = firstRecord.split('\n').filter(Boolean);
  if (!lines[0]?.startsWith('worktree ') || lines.includes('bare')) {
    throw new Error('unusable main runtime-state worktree record');
  }

  const rawRoot = lines[0].slice('worktree '.length);
  let runtimeStateRoot;
  try {
    runtimeStateRoot = canonical(rawRoot);
  } catch {
    throw new Error('missing or moved runtime-state root');
  }

  assert.equal(
    canonicalGitPath(runtimeStateRoot, ['rev-parse', '--show-toplevel']),
    runtimeStateRoot,
    'runtime-state root mismatch',
  );
  assert.equal(
    canonicalGitPath(runtimeStateRoot, ['rev-parse', '--git-common-dir']),
    receipt.repositoryIdentity,
    'runtime-state common Git directory mismatch',
  );
  return runtimeStateRoot;
}

function verifyRuntimeStateRoot(receipt) {
  assert.equal(
    resolveRuntimeStateRoot(receipt.executionRoot, receipt),
    receipt.runtimeStateRoot,
    'runtime-state root moved',
  );
}

function preflight(receipt, runtimeRoot = receipt.executionRoot) {
  const actualRoot = canonicalGitPath(runtimeRoot, ['rev-parse', '--show-toplevel']);
  assert.equal(actualRoot, receipt.executionRoot, 'execution root mismatch');
  assert.equal(
    canonicalGitPath(runtimeRoot, ['rev-parse', '--git-common-dir']),
    receipt.repositoryIdentity,
    'common Git directory mismatch',
  );

  const actualBranch = git(runtimeRoot, 'branch', '--show-current');
  if (receipt.checkout.type === 'branch') {
    assert.equal(actualBranch, receipt.checkout.branch, 'branch mismatch');
  } else {
    assert.equal(actualBranch, '', 'detached checkout expected');
    assert.equal(
      git(runtimeRoot, 'rev-parse', 'HEAD'),
      receipt.checkout.oid,
      'detached OID mismatch',
    );
  }

  const entry = worktreeEntries(runtimeRoot).find(({ root }) => root === receipt.executionRoot);
  assert.ok(entry, 'worktree registration missing');
  if (receipt.checkout.type === 'branch') {
    assert.equal(entry.branch, receipt.checkout.branch, 'registered worktree branch mismatch');
  } else {
    assert.equal(entry.detached, true, 'registered worktree must be detached');
    assert.equal(entry.head, receipt.checkout.oid, 'registered worktree OID mismatch');
  }
  verifyRuntimeStateRoot(receipt);
}

function selectExecutionLocation(currentRoot, { worktreeRoot, branch, owner, purpose, setup }) {
  const currentReceipt = captureReceipt(currentRoot, {
    origin: 'in-place',
    owner,
    purpose,
  });
  const mainRoot = currentReceipt.runtimeStateRoot;

  if (currentReceipt.executionRoot !== mainRoot) {
    return captureReceipt(currentRoot, {
      origin: 'harness-managed',
      owner,
      purpose,
      setupStatus: 'externally managed',
    });
  }

  git(currentRoot, 'worktree', 'add', worktreeRoot, '-b', branch, 'HEAD');
  const receipt = captureReceipt(worktreeRoot, {
    origin: 'effective-flow-created',
    owner,
    purpose,
  });
  preflight(receipt);
  setup(receipt);
  return { ...receipt, setupStatus: 'complete' };
}

function writeAfterPreflight(receipt, runtimeRoot, relativePath, content) {
  preflight(receipt, runtimeRoot);
  writeFileSync(join(receipt.executionRoot, relativePath), content);
}

function canonicalizeProspectivePath(path) {
  const missing = [];
  let ancestor = path;
  while (!existsSync(ancestor)) {
    missing.unshift(basename(ancestor));
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error('no usable existing ancestor');
    ancestor = parent;
  }
  return join(canonical(ancestor), ...missing);
}

function resolveReviewHandle(receipt, argument) {
  verifyRuntimeStateRoot(receipt);
  const reviewRoot = canonicalizeProspectivePath(
    join(receipt.runtimeStateRoot, '.effective-flow', 'review'),
  );
  const reviewRootContainment = relative(receipt.runtimeStateRoot, reviewRoot);
  if (
    reviewRootContainment === '..' ||
    reviewRootContainment.startsWith(`..${sep}`) ||
    isAbsolute(reviewRootContainment)
  ) {
    throw new Error('review report path escapes the runtime-state review directory');
  }
  const candidate = isAbsolute(argument)
    ? argument
    : argument.includes('/')
      ? resolve(receipt.runtimeStateRoot, argument)
      : join(reviewRoot, argument);
  const handle = canonicalizeProspectivePath(candidate);
  const containment = relative(reviewRoot, handle);
  if (containment === '..' || containment.startsWith(`..${sep}`) || isAbsolute(containment)) {
    throw new Error('review report path escapes the runtime-state review directory');
  }
  return handle;
}

function writeRuntimeState(receipt, handle, content) {
  verifyRuntimeStateRoot(receipt);
  const runtimePrefix = `${receipt.runtimeStateRoot}${sep}`;
  assert.ok(handle.startsWith(runtimePrefix), 'runtime-state handle mismatch');
  const target = relative(receipt.runtimeStateRoot, handle);
  assert.ok(target.startsWith('.effective-flow/'), 'runtime-state target mismatch');
  assert.equal(git(receipt.runtimeStateRoot, 'check-ignore', '--no-index', '--', target), target);
  assert.equal(git(receipt.runtimeStateRoot, 'ls-files', '--', '.effective-flow/'), '');
  mkdirSync(dirname(handle), { recursive: true });
  writeFileSync(handle, content);
}

function appendRuntimeState(receipt, handle, content) {
  writeRuntimeState(receipt, handle, `${readFileSync(handle, 'utf8')}${content}`);
}

function nextReportHandle(receipt, stem) {
  let suffix = 0;
  while (true) {
    const file = `${stem}${suffix === 0 ? '' : `-${suffix}`}.md`;
    const handle = resolveReviewHandle(receipt, file);
    if (!existsSync(handle)) return handle;
    suffix += 1;
  }
}

function cleanupOwnedWorktree(receipt, administrativeRoot, { deleteBranch = false } = {}) {
  if (receipt.origin !== 'effective-flow-created') return false;

  try {
    preflight(receipt);
  } catch {
    return false;
  }

  if (git(receipt.executionRoot, 'status', '--porcelain') !== '') return false;

  git(administrativeRoot, 'worktree', 'remove', receipt.executionRoot);
  if (deleteBranch && receipt.checkout.type === 'branch') {
    git(administrativeRoot, 'branch', '-d', receipt.checkout.branch);
  }
  return true;
}

test('main checkout work stays in an owned worktree through verified cleanup', (t) => {
  const { container, root } = createRepository(t);
  const worktreeRoot = join(container, 'worktrees', 'delivery');
  mkdirSync(dirname(worktreeRoot), { recursive: true });
  let setupRuns = 0;
  const receipt = selectExecutionLocation(root, {
    worktreeRoot,
    branch: 'effective-flow/fix/location',
    owner: 'fix',
    purpose: 'issue-162',
    setup: ({ executionRoot }) => {
      setupRuns += 1;
      writeFileSync(join(executionRoot, '.setup-complete'), 'yes\n');
      git(executionRoot, 'add', '.setup-complete');
      git(executionRoot, 'commit', '-m', 'prepare worktree');
    },
  });

  assert.equal(receipt.origin, 'effective-flow-created');
  assert.equal(receipt.runtimeStateRoot, root);
  assert.notEqual(receipt.executionRoot, receipt.runtimeStateRoot);
  assert.equal(receipt.setupStatus, 'complete');
  assert.equal(setupRuns, 1);
  writeAfterPreflight(receipt, receipt.executionRoot, 'feature.txt', 'fixed\n');
  assert.equal(git(receipt.executionRoot, 'diff', '--check'), '');
  git(receipt.executionRoot, 'add', 'feature.txt');
  git(receipt.executionRoot, 'commit', '-m', 'fix execution location');
  const reportHandle = resolveReviewHandle(receipt, 'review-report-worktree.md');
  writeRuntimeState(receipt, reportHandle, 'finding\n');
  const executionReport = join(
    receipt.executionRoot,
    '.effective-flow',
    'review',
    basename(reportHandle),
  );
  mkdirSync(dirname(executionReport), { recursive: true });
  writeFileSync(executionReport, 'disposable duplicate\n');
  appendRuntimeState(receipt, reportHandle, '✅ Implemented via fix\n');
  assert.equal(readFileSync(executionReport, 'utf8'), 'disposable duplicate\n');
  const memoryHandle = join(receipt.runtimeStateRoot, '.effective-flow', 'memory.json');
  writeRuntimeState(receipt, memoryHandle, '{"lastFindingNumber":43}\n');
  assert.equal(readFileSync(join(receipt.executionRoot, 'feature.txt'), 'utf8'), 'fixed\n');
  assert.equal(existsSync(join(root, 'feature.txt')), false);

  assert.equal(cleanupOwnedWorktree(receipt, root), true);
  assert.equal(existsSync(receipt.executionRoot), false);
  assert.equal(readFileSync(reportHandle, 'utf8'), 'finding\n✅ Implemented via fix\n');
  assert.equal(readFileSync(memoryHandle, 'utf8'), '{"lastFindingNumber":43}\n');
  assert.equal(
    worktreeEntries(root).some(({ root: entryRoot }) => entryRoot === receipt.executionRoot),
    false,
  );
});

test('a pre-existing linked worktree is reused without nested setup or cleanup', (t) => {
  const { container, root } = createRepository(t);
  const nativeRoot = join(container, 'native-worktree');
  git(root, 'worktree', 'add', nativeRoot, '-b', 'native/task', 'HEAD');
  git(nativeRoot, 'switch', '--detach', 'HEAD');
  const worktreeCount = worktreeEntries(root).length;
  let setupRuns = 0;

  const receipt = selectExecutionLocation(nativeRoot, {
    worktreeRoot: join(nativeRoot, '.effective-flow', 'nested'),
    branch: 'must-not-exist',
    owner: 'fix',
    purpose: 'issue-162',
    setup: () => {
      setupRuns += 1;
    },
  });

  assert.equal(receipt.origin, 'harness-managed');
  assert.equal(receipt.executionRoot, canonical(nativeRoot));
  assert.equal(receipt.runtimeStateRoot, root);
  assert.equal(receipt.checkout.type, 'detached');
  assert.equal(receipt.setupStatus, 'externally managed');
  assert.equal(setupRuns, 0);
  assert.equal(worktreeEntries(root).length, worktreeCount);
  assert.equal(cleanupOwnedWorktree(receipt, root), false);
  assert.equal(existsSync(nativeRoot), true);
});

test('in-place execution and runtime-state roots coincide', (t) => {
  const { root } = createRepository(t);
  const receipt = captureReceipt(root, {
    origin: 'in-place',
    owner: 'review',
    purpose: 'local-report',
  });
  assert.equal(receipt.executionRoot, root);
  assert.equal(receipt.runtimeStateRoot, root);
});

test('report resolution, collisions, and memory stay in the main checkout', (t) => {
  const { container, root } = createRepository(t);
  const linkedRoot = join(container, 'native-worktree');
  git(root, 'worktree', 'add', linkedRoot, '-b', 'native/review', 'HEAD');
  const receipt = captureReceipt(linkedRoot, {
    origin: 'harness-managed',
    owner: 'review',
    purpose: 'local-report',
    setupStatus: 'externally managed',
  });

  const first = nextReportHandle(receipt, 'review-report-2000-01-01');
  writeRuntimeState(receipt, first, 'first\n');
  mkdirSync(join(linkedRoot, '.effective-flow', 'review'), { recursive: true });
  writeFileSync(join(linkedRoot, '.effective-flow', 'review', basename(first)), 'disposable\n');
  const second = nextReportHandle(receipt, 'review-report-2000-01-01');
  writeRuntimeState(receipt, second, 'second\n');
  const memory = join(receipt.runtimeStateRoot, '.effective-flow', 'memory.json');
  writeRuntimeState(receipt, memory, '{"lastFindingNumber":2}\n');
  const configFallback = join(receipt.runtimeStateRoot, '.effective-flow', 'config.json');
  writeRuntimeState(receipt, configFallback, '{"tracker":{"mode":"local"}}\n');
  const cache = join(receipt.runtimeStateRoot, '.effective-flow', 'cache.json');
  writeRuntimeState(receipt, cache, '{"main":true}\n');
  writeFileSync(join(receipt.runtimeStateRoot, '.sf-memory.json'), '{"lastFindingNumber":1}\n');
  writeFileSync(join(linkedRoot, '.effective-flow', 'config.json'), '{"decoy":true}\n');
  writeFileSync(join(linkedRoot, '.effective-flow', 'cache.json'), '{"main":false}\n');
  writeFileSync(join(linkedRoot, '.sf-memory.json'), '{"lastFindingNumber":900}\n');

  assert.equal(second, join(root, '.effective-flow/review/review-report-2000-01-01-1.md'));
  assert.equal(readFileSync(memory, 'utf8'), '{"lastFindingNumber":2}\n');
  assert.equal(readFileSync(configFallback, 'utf8'), '{"tracker":{"mode":"local"}}\n');
  assert.equal(readFileSync(cache, 'utf8'), '{"main":true}\n');
  assert.equal(
    readFileSync(join(receipt.runtimeStateRoot, '.sf-memory.json'), 'utf8'),
    '{"lastFindingNumber":1}\n',
  );
  assert.equal(existsSync(join(linkedRoot, '.effective-flow', 'memory.json')), false);
});

test('linked apply-review roots its mutex and component base in the main checkout', (t) => {
  const { container, root } = createRepository(t);
  const integrationRoot = join(container, 'integration-worktree');
  git(root, 'worktree', 'add', integrationRoot, '-b', 'integration/task', 'HEAD');
  const integrationReceipt = captureReceipt(integrationRoot, {
    origin: 'harness-managed',
    owner: 'apply-review',
    purpose: 'integration-root',
    setupStatus: 'externally managed',
  });
  assert.equal(integrationReceipt.runtimeStateRoot, root);

  const lockHandle = join(root, '.effective-flow', 'apply-review-commit.lock');
  mkdirSync(lockHandle, { recursive: true });
  assert.equal(
    existsSync(join(integrationRoot, '.effective-flow/apply-review-commit.lock')),
    false,
  );

  const componentRoot = join(root, '.effective-flow', '.worktrees', 'component-linked');
  mkdirSync(dirname(componentRoot), { recursive: true });
  git(
    integrationRoot,
    'worktree',
    'add',
    componentRoot,
    '-b',
    'apply-review/linked/component-1',
    'HEAD',
  );
  const componentReceipt = captureReceipt(componentRoot, {
    origin: 'effective-flow-created',
    owner: 'apply-review/component-1',
    purpose: 'apply-review',
    setupStatus: 'skipped',
  });
  assert.equal(componentReceipt.runtimeStateRoot, root);
  assert.equal(componentReceipt.executionRoot, canonical(componentRoot));

  writeAfterPreflight(componentReceipt, componentRoot, 'linked-fix.txt', 'fixed\n');
  git(componentRoot, 'add', 'linked-fix.txt');
  git(componentRoot, 'commit', '-m', 'fix linked component');
  const commit = git(componentRoot, 'rev-parse', 'HEAD');
  preflight(integrationReceipt);
  git(integrationRoot, 'cherry-pick', commit);
  assert.equal(
    cleanupOwnedWorktree(componentReceipt, integrationRoot, { deleteBranch: true }),
    true,
  );
  rmSync(lockHandle, { recursive: true });

  assert.equal(readFileSync(join(integrationRoot, 'linked-fix.txt'), 'utf8'), 'fixed\n');
  assert.equal(existsSync(componentRoot), false);
  assert.equal(existsSync(root), true);
});

test('unsafe, missing, bare, and repository-mismatched runtime roots fail without mutation', (t) => {
  const fixture = createRepository(t);
  const other = createRepository(t);
  const receipt = captureReceipt(fixture.root, {
    origin: 'in-place',
    owner: 'review',
    purpose: 'unsafe-root',
  });
  const sentinel = join(fixture.root, 'history.txt');
  const before = readFileSync(sentinel, 'utf8');

  assert.throws(
    () => resolveReviewHandle(receipt, '../outside.md'),
    /escapes the runtime-state review directory/,
  );
  const external = join(fixture.container, 'external-review');
  mkdirSync(external);
  mkdirSync(join(fixture.root, '.effective-flow'), { recursive: true });
  symlinkSync(external, join(fixture.root, '.effective-flow', 'review'));
  assert.throws(
    () => resolveReviewHandle(receipt, 'escaped.md'),
    /escapes the runtime-state review directory/,
  );
  assert.throws(
    () =>
      resolveRuntimeStateRoot(fixture.root, receipt, { porcelain: 'worktree /missing\nHEAD 0' }),
    /missing or moved runtime-state root/,
  );
  assert.throws(
    () =>
      resolveRuntimeStateRoot(fixture.root, receipt, { porcelain: 'worktree /bare\nHEAD 0\nbare' }),
    /unusable main runtime-state worktree record/,
  );
  const mismatched = `worktree ${other.root}\nHEAD ${git(other.root, 'rev-parse', 'HEAD')}\nbranch refs/heads/main`;
  assert.throws(
    () => resolveRuntimeStateRoot(fixture.root, receipt, { porcelain: mismatched }),
    /runtime-state common Git directory mismatch/,
  );
  assert.equal(readFileSync(sentinel, 'utf8'), before);
  assert.equal(existsSync(join(external, 'escaped.md')), false);
});

test('root, branch, detached OID, and common-dir mismatches abort before writing', (t) => {
  const rootFixture = createRepository(t);
  const otherFixture = createRepository(t);
  const rootReceipt = captureReceipt(rootFixture.root, {
    origin: 'in-place',
    owner: 'fix',
    purpose: 'wrong-root',
  });
  const wrongRootSentinel = join(otherFixture.root, 'must-not-write.txt');
  assert.throws(
    () => writeAfterPreflight(rootReceipt, otherFixture.root, 'must-not-write.txt', 'bad\n'),
    /execution root mismatch/,
  );
  assert.equal(existsSync(wrongRootSentinel), false);

  const branchFixture = createRepository(t);
  const branchReceipt = captureReceipt(branchFixture.root, {
    origin: 'in-place',
    owner: 'fix',
    purpose: 'wrong-branch',
  });
  git(branchFixture.root, 'switch', '-c', 'unexpected');
  assert.throws(
    () => writeAfterPreflight(branchReceipt, branchFixture.root, 'must-not-write.txt', 'bad\n'),
    /branch mismatch/,
  );
  assert.equal(existsSync(join(branchFixture.root, 'must-not-write.txt')), false);

  const detachedFixture = createRepository(t, { commits: 2 });
  git(detachedFixture.root, 'switch', '--detach', 'HEAD');
  const detachedReceipt = captureReceipt(detachedFixture.root, {
    origin: 'harness-managed',
    owner: 'fix',
    purpose: 'wrong-detached-oid',
    setupStatus: 'externally managed',
  });
  git(detachedFixture.root, 'switch', '--detach', 'HEAD~1');
  assert.throws(
    () => writeAfterPreflight(detachedReceipt, detachedFixture.root, 'must-not-write.txt', 'bad\n'),
    /detached OID mismatch/,
  );
  assert.equal(existsSync(join(detachedFixture.root, 'must-not-write.txt')), false);

  const commonFixture = createRepository(t);
  const commonReceipt = captureReceipt(commonFixture.root, {
    origin: 'in-place',
    owner: 'fix',
    purpose: 'wrong-common-dir',
  });
  const wrongCommonReceipt = {
    ...commonReceipt,
    repositoryIdentity: captureReceipt(otherFixture.root, {
      origin: 'in-place',
      owner: 'fix',
      purpose: 'other-repository',
    }).repositoryIdentity,
  };
  assert.throws(
    () =>
      writeAfterPreflight(wrongCommonReceipt, commonFixture.root, 'must-not-write.txt', 'bad\n'),
    /common Git directory mismatch/,
  );
  assert.equal(existsSync(join(commonFixture.root, 'must-not-write.txt')), false);
});

test('dirty and mismatched cleanup receipts retain their owned worktrees', (t) => {
  const dirtyFixture = createRepository(t);
  const dirtyRoot = join(dirtyFixture.container, 'dirty-worktree');
  git(dirtyFixture.root, 'worktree', 'add', dirtyRoot, '-b', 'cleanup/dirty', 'HEAD');
  const dirtyReceipt = captureReceipt(dirtyRoot, {
    origin: 'effective-flow-created',
    owner: 'fix',
    purpose: 'dirty-cleanup',
    setupStatus: 'complete',
  });
  writeFileSync(join(dirtyRoot, 'uncommitted.txt'), 'retain me\n');
  assert.equal(cleanupOwnedWorktree(dirtyReceipt, dirtyFixture.root), false);
  assert.equal(existsSync(dirtyRoot), true);

  const mismatchFixture = createRepository(t);
  const mismatchRoot = join(mismatchFixture.container, 'mismatch-worktree');
  git(mismatchFixture.root, 'worktree', 'add', mismatchRoot, '-b', 'cleanup/expected', 'HEAD');
  const mismatchReceipt = captureReceipt(mismatchRoot, {
    origin: 'effective-flow-created',
    owner: 'fix',
    purpose: 'mismatched-cleanup',
    setupStatus: 'complete',
  });
  git(mismatchRoot, 'switch', '-c', 'cleanup/unexpected');
  assert.equal(cleanupOwnedWorktree(mismatchReceipt, mismatchFixture.root), false);
  assert.equal(existsSync(mismatchRoot), true);
});

test('apply-review integrates a component commit and cleans up only that component', (t) => {
  const { container, root } = createRepository(t);
  const originalReceipt = captureReceipt(root, {
    origin: 'in-place',
    owner: 'apply-review',
    purpose: 'integration-root',
    setupStatus: 'externally managed',
  });
  const componentRoot = join(container, 'components', 'component-1');
  mkdirSync(dirname(componentRoot), { recursive: true });
  git(root, 'worktree', 'add', componentRoot, '-b', 'apply-review/session/component-1', 'HEAD');
  const componentReceipt = captureReceipt(componentRoot, {
    origin: 'effective-flow-created',
    owner: 'apply-review/component-1',
    purpose: 'apply-review',
    setupStatus: 'skipped',
  });

  writeAfterPreflight(componentReceipt, componentRoot, 'review-fix.txt', 'component fix\n');
  git(componentRoot, 'add', 'review-fix.txt');
  git(componentRoot, 'commit', '-m', 'fix reviewed finding');
  const componentCommit = git(componentRoot, 'rev-parse', 'HEAD');
  assert.equal(existsSync(join(root, 'review-fix.txt')), false);

  preflight(originalReceipt);
  git(root, 'cherry-pick', componentCommit);
  assert.equal(readFileSync(join(root, 'review-fix.txt'), 'utf8'), 'component fix\n');
  assert.equal(git(root, 'branch', '--show-current'), 'main');
  assert.equal(cleanupOwnedWorktree(componentReceipt, root, { deleteBranch: true }), true);
  assert.equal(existsSync(componentRoot), false);
  assert.equal(existsSync(root), true);
  preflight(originalReceipt);
});
