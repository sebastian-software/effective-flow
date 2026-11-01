import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkoutBasis, sourceMembership } from '../evals/build-context/_scaffold/basis.mjs';
import { observeDrift } from '../evals/build-context/_scaffold/drift.mjs';
import { digest } from '../evals/build-context/_scaffold/transcript.mjs';
import { executeOperation, REQUIRED_GATES } from '../src/scripts/build-run-core.mjs';

function fixture(t, source = 'nested/old/source.mjs') {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'flow-source-membership-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
  git('init', '--quiet');
  mkdirSync(path.dirname(path.join(root, source)), { recursive: true });
  writeFileSync(path.join(root, source), 'export const source = true;\n');
  git('add', source);
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  );
  return root;
}

for (const operation of ['delete', 'rename'])
  test(`source membership records an unstaged tracked-directory ${operation} without losing the deletion`, (t) => {
    const root = fixture(t);
    const before = checkoutBasis(root);
    if (operation === 'rename') renameSync(path.join(root, 'nested'), path.join(root, 'renamed'));
    else rmSync(path.join(root, 'nested'), { recursive: true });
    const membership = sourceMembership(root);
    assert.deepEqual(membership['nested/old/source.mjs'], ['missing']);
    assert.notEqual(checkoutBasis(root).workingTree, before.workingTree);
    assert.equal(checkoutBasis(root).index, before.index);
    assert.deepEqual(sourceMembership(root), membership);
    if (operation === 'rename') {
      assert.equal(membership['renamed/old/source.mjs'][0], 'file');
      assert.ok(readFileSync(path.join(root, 'renamed/old/source.mjs')).length > 0);
    }
  });

test('source membership refuses an existing symlink ancestor rather than reading through it', (t) => {
  const root = fixture(t);
  const outside = realpathSync(mkdtempSync(path.join(tmpdir(), 'flow-source-outside-')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  renameSync(path.join(root, 'nested'), path.join(outside, 'nested'));
  symlinkSync(path.join(outside, 'nested'), path.join(root, 'nested'));
  assert.throws(() => sourceMembership(root), /symlink|unsafe|directory/i);
  assert.throws(() => checkoutBasis(root), /symlink|unsafe|directory/i);
});

for (const collector of ['sourceMembership', 'checkoutBasis'])
  test(`${collector} records a tracked-directory replacement by a regular file`, (t) => {
    const root = fixture(t);
    const before = checkoutBasis(root);
    rmSync(path.join(root, 'nested'), { recursive: true });
    writeFileSync(path.join(root, 'nested'), 'replacement file\n');
    if (collector === 'sourceMembership') {
      const membership = sourceMembership(root);
      assert.deepEqual(membership['nested/old/source.mjs'], ['missing']);
      assert.deepEqual(membership.nested, ['file', 0, digest('replacement file\n')]);
      assert.deepEqual(sourceMembership(root), membership);
      writeFileSync(path.join(root, 'nested'), 'changed replacement file\n');
      const changed = sourceMembership(root);
      assert.deepEqual(changed['nested/old/source.mjs'], ['missing']);
      assert.notDeepEqual(changed.nested, membership.nested);
    } else {
      const after = checkoutBasis(root);
      assert.equal(after.head, before.head);
      assert.equal(after.index, before.index);
      assert.equal(
        after.workingTree,
        digest(JSON.stringify([['nested/old/source.mjs', 'missing']])),
      );
      assert.equal(
        after.untracked,
        digest(JSON.stringify([['nested', 0, digest('replacement file\n')]])),
      );
      assert.notEqual(after.workingTree, before.workingTree);
      assert.notEqual(after.untracked, before.untracked);
      assert.deepEqual(checkoutBasis(root), after);
      writeFileSync(path.join(root, 'nested'), 'changed replacement file\n');
      const changed = checkoutBasis(root);
      assert.equal(changed.workingTree, after.workingTree);
      assert.notEqual(changed.untracked, after.untracked);
    }
    assert.equal(checkoutBasis(root).head, before.head);
    assert.equal(checkoutBasis(root).index, before.index);
  });

for (const collector of ['sourceMembership', 'checkoutBasis'])
  test(`${collector} records an unstaged tracked-file replacement by a directory with a new leaf`, (t) => {
    const root = fixture(t, 'src/item');
    const before = checkoutBasis(root);
    rmSync(path.join(root, 'src/item'));
    mkdirSync(path.join(root, 'src/item'));
    const child = 'new child content\n';
    writeFileSync(path.join(root, 'src/item/child'), child);
    if (collector === 'sourceMembership') {
      const after = sourceMembership(root);
      assert.deepEqual(after, {
        'src/item': ['missing'],
        'src/item/child': ['file', 0, digest(child)],
      });
      assert.deepEqual(sourceMembership(root), after);
      writeFileSync(path.join(root, 'src/item/child'), 'changed child content\n');
      assert.notDeepEqual(sourceMembership(root), after);
      assert.deepEqual(sourceMembership(root)['src/item'], ['missing']);
    } else {
      const after = checkoutBasis(root);
      assert.equal(after.head, before.head);
      assert.equal(after.index, before.index);
      assert.equal(after.workingTree, digest(JSON.stringify([['src/item', 'missing']])));
      assert.equal(after.untracked, digest(JSON.stringify([['src/item/child', 0, digest(child)]])));
      assert.notEqual(after.workingTree, before.workingTree);
      assert.notEqual(after.untracked, before.untracked);
      assert.deepEqual(checkoutBasis(root), after);
      writeFileSync(path.join(root, 'src/item/child'), 'changed child content\n');
      const changed = checkoutBasis(root);
      assert.equal(changed.workingTree, after.workingTree);
      assert.notEqual(changed.untracked, after.untracked);
    }
    assert.equal(checkoutBasis(root).head, before.head);
    assert.equal(checkoutBasis(root).index, before.index);
  });

async function driftFixture(t, root) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  writeFileSync(path.join(root, '.git/info/exclude'), '.effective-flow/\n');
  mkdirSync(path.join(root, '.effective-flow'));
  writeFileSync(
    path.join(root, '.effective-flow/memory.json'),
    JSON.stringify({ runtimeMigration: { directory: { version: 1 } } }),
  );
  const plan = '# Approved fixture plan\n';
  writeFileSync(path.join(root, '.effective-flow/plan.md'), plan);
  const deps = {
    runner: (call) =>
      spawnSync(call.executable, call.args, {
        cwd: call.cwd,
        ...(call.stdoutBuffer ? {} : { encoding: 'utf8' }),
      }),
  };
  const call = async (operation, payload) =>
    (await executeOperation(operation, payload, deps)).result;
  const input = {
    runtimeStateRoot: root,
    repositoryIdentity: realpathSync(path.join(root, '.git')),
    runId: 'drift-fixture',
    execution: {
      executionRoot: root,
      branch: git('branch', '--show-current'),
      head: git('rev-parse', 'HEAD'),
      origin: 'current-checkout',
      owner: 'build',
    },
    plan: { root, path: '.effective-flow/plan.md', digest: digest(plan) },
    source: { instruction: 'Observe the approved fixture.', restrictions: ['Local fixture only.'] },
    runMode: 'interactive',
    languages: Object.fromEntries(
      ['source', 'documentation.user', 'documentation.technical', 'workflow', 'forge', 'git'].map(
        (key) => [key, 'en'],
      ),
    ),
    completionCondition: 'Observe the fixture.',
    deliveryRestrictions: ['Do not publish.'],
    sourceAssociation: 'approved-fixture',
    allowedRoots: [root],
  };
  const created = await call('create', input);
  const common = {
    runtimeStateRoot: root,
    repositoryIdentity: input.repositoryIdentity,
    runId: input.runId,
    requestDigest: created.requestDigest,
  };
  await call('bind-agent', { ...common, agentHandle: 'fixture-child' });
  const checkpoint = await call('checkpoint', {
    ...common,
    agentHandle: 'fixture-child',
    checkpointId: 'before-drift',
    completed: [],
    pending: REQUIRED_GATES,
    evidence: [],
  });
  const manifest = { checkout: root, checkpoint };
  const observed = observeDrift(manifest);
  assert.deepEqual(observed.after, observed.before, 'unchanged native checkpoint has no drift');
  return manifest;
}

for (const direction of ['file-to-directory', 'directory-to-file'])
  test(`drift observation records an unstaged ${direction} replacement without losing old or new leaves`, async (t) => {
    const fileToDirectory = direction === 'file-to-directory';
    const root = fixture(t, fileToDirectory ? 'src/item' : 'src/item/child');
    const manifest = await driftFixture(t, root);
    rmSync(path.join(root, 'src/item'), { recursive: true });
    const replacement = 'replacement content\n';
    if (fileToDirectory) {
      mkdirSync(path.join(root, 'src/item'));
      writeFileSync(path.join(root, 'src/item/child'), replacement);
    } else writeFileSync(path.join(root, 'src/item'), replacement);
    const observed = observeDrift(manifest);
    const oldLeaf = fileToDirectory ? 'src/item' : 'src/item/child';
    const newLeaf = fileToDirectory ? 'src/item/child' : 'src/item';
    assert.equal(observed.after.head, observed.before.head);
    assert.equal(observed.after.index, observed.before.index);
    assert.equal(observed.after.workingTree, digest(JSON.stringify([[oldLeaf, 'missing']])));
    assert.equal(
      observed.after.untracked,
      digest(JSON.stringify([[newLeaf, '100644', digest(replacement)]])),
    );
    assert.notEqual(observed.after.workingTree, observed.before.workingTree);
    assert.notEqual(observed.after.untracked, observed.before.untracked);
    assert.deepEqual(observeDrift(manifest), observed);
    writeFileSync(path.join(root, newLeaf), 'changed replacement content\n');
    const changed = observeDrift(manifest);
    assert.equal(changed.after.head, observed.before.head);
    assert.equal(changed.after.index, observed.before.index);
    assert.equal(changed.after.workingTree, observed.after.workingTree);
    assert.notEqual(changed.after.untracked, observed.after.untracked);
  });

test('source readers refuse a present real indexed gitlink rather than treating its directory as a replaced file', async (t) => {
  const root = fixture(t);
  const manifest = await driftFixture(t, root);
  const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  mkdirSync(path.join(root, 'module'));
  execFileSync('git', [
    '-C',
    root,
    'update-index',
    '--add',
    '--cacheinfo',
    `160000,${head},module`,
  ]);
  const index = execFileSync('git', ['-C', root, 'ls-files', '--stage', '-z'], {
    encoding: 'utf8',
  });
  assert.ok(index.split('\0').some((entry) => entry === `160000 ${head} 0\tmodule`));
  assert.throws(() => sourceMembership(root), /unsupported|gitlink|submodule/i);
  assert.throws(() => checkoutBasis(root), /unsupported|gitlink|submodule/i);
  assert.throws(() => observeDrift(manifest), /unsupported|gitlink|submodule/i);
});

for (const obstruction of [
  'symlink-ancestor',
  'dangling-symlink-ancestor',
  'special-ancestor',
  'special-leaf',
])
  test(`source readers refuse a ${obstruction} without classifying it as a missing tracked leaf`, async (t) => {
    const root = fixture(t, 'src/item/child');
    const manifest = await driftFixture(t, root);
    if (obstruction === 'special-leaf') {
      rmSync(path.join(root, 'src/item/child'));
      execFileSync('mkfifo', [path.join(root, 'src/item/child')]);
    } else {
      const original = path.join(root, '.effective-flow/original');
      renameSync(path.join(root, 'src/item'), original);
      if (obstruction === 'special-ancestor') execFileSync('mkfifo', [path.join(root, 'src/item')]);
      else
        symlinkSync(
          obstruction === 'dangling-symlink-ancestor' ? original + '-absent' : original,
          path.join(root, 'src/item'),
        );
    }
    const rejection = obstruction === 'special-leaf' ? /unsupported|special/i : /unsafe.*ancestor/i;
    assert.throws(() => sourceMembership(root), rejection);
    assert.throws(() => checkoutBasis(root), rejection);
    assert.throws(() => observeDrift(manifest), rejection);
  });

test('source readers retain full spaced and tabbed indexed filenames during a file-to-directory replacement', async (t) => {
  const source = 'src/spaced item\tname';
  const root = fixture(t, source);
  const manifest = await driftFixture(t, root);
  const before = checkoutBasis(root);
  rmSync(path.join(root, source));
  mkdirSync(path.join(root, source));
  const child = source + '/child with space';
  const text = 'spaced child content\n';
  writeFileSync(path.join(root, child), text);
  assert.deepEqual(sourceMembership(root), {
    [source]: ['missing'],
    [child]: ['file', 0, digest(text)],
  });
  const basis = checkoutBasis(root);
  assert.equal(basis.head, before.head);
  assert.equal(basis.index, before.index);
  assert.equal(basis.workingTree, digest(JSON.stringify([[source, 'missing']])));
  assert.equal(basis.untracked, digest(JSON.stringify([[child, 0, digest(text)]])));
  const drift = observeDrift(manifest);
  assert.equal(drift.after.workingTree, basis.workingTree);
  assert.equal(drift.after.untracked, digest(JSON.stringify([[child, '100644', digest(text)]])));
  assert.equal(drift.after.head, drift.before.head);
  assert.equal(drift.after.index, drift.before.index);
  assert.deepEqual(observeDrift(manifest), drift);
});
