import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'flow-source-membership-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
  git('init', '--quiet');
  mkdirSync(path.join(root, 'nested/old'), { recursive: true });
  writeFileSync(path.join(root, 'nested/old/source.mjs'), 'export const source = true;\n');
  git('add', 'nested');
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
});
