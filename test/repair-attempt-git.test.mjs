// Invariant protected (plan 2026-11-13-merge-gate-repair-attempts, decision 5): against real git,
// the authorized scope lets a repair modify a test file the run itself added, while a test file the
// gate's base merge brought in after the scope was read stays an expansion, in iterate's pre-edit
// `scope-check` (tip `HEAD`) and in the `post-check` of a returned commit (tip that commit).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/scripts/repair-attempt.mjs', import.meta.url));
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
};

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { env: GIT_ENV, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function commitFile(root, path, content, message) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
  git(root, 'add', '--', path);
  git(root, 'commit', '-q', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

function cli(operation, input) {
  const result = spawnSync(process.execPath, [CLI, operation], {
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.ok, true, result.stdout);
  return envelope.data;
}

test('a run-added test stays editable while a base-merged test is an expansion', (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-repair-attempt-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q', '--initial-branch=main');
  const mergeBase = commitFile(root, 'test/existing.test.mjs', 'existing\n', 'base');
  git(root, 'switch', '-q', '-c', 'pr');
  const head = commitFile(root, 'src/a.mjs', 'pr\n', 'pr change');
  const scope = { mergeBase, head, paths: ['src/a.mjs'] };
  // After the scope was read: the base gains a test, a repair adds its own, and the gate merges.
  git(root, 'switch', '-q', 'main');
  commitFile(root, 'test/base-new.test.mjs', 'base\n', 'base test');
  git(root, 'switch', '-q', 'pr');
  commitFile(root, 'test/run.test.mjs', 'run\n', 'repair adds a test');
  git(root, 'merge', '-q', '--no-ff', '--no-edit', 'main');

  const check = (path) =>
    cli('scope-check', { cwd: root, scope, changes: [{ status: 'M', path }] });
  assert.deepEqual(check('test/run.test.mjs'), {
    status: 'in-scope',
    outside: [],
    undetermined: [],
  });
  for (const path of ['test/base-new.test.mjs', 'test/existing.test.mjs']) {
    assert.deepEqual(check(path), { status: 'expansion', outside: [path], undetermined: [] }, path);
  }

  const adjusted = commitFile(root, 'test/run.test.mjs', 'run 2\n', 'repair adjusts its test');
  assert.equal(cli('post-check', { cwd: root, scope, shas: [adjusted] }).status, 'pass');
  const edited = commitFile(root, 'test/base-new.test.mjs', 'edited\n', 'repair edits base test');
  const stopped = cli('post-check', { cwd: root, scope, shas: [edited] });
  assert.equal(stopped.reason, 'scope-expansion-committed');
  assert.deepEqual(stopped.outside, [{ sha: edited, path: 'test/base-new.test.mjs' }]);
});

// Invariant (plan decision 3): against real git, `record` post-checks the commits actually made in
// the attributed range, not only the returned ones; the gate's own base merge and the base commit
// it brought in stay out of the check.
test('an unreturned out-of-scope commit stops the round while a gate merge is excluded', (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-repair-attempt-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q', '--initial-branch=main');
  const mergeBase = commitFile(root, 'README.md', 'base\n', 'base');
  git(root, 'switch', '-q', '-c', 'pr');
  const head = commitFile(root, 'src/a.mjs', 'pr\n', 'pr change');
  const scope = { mergeBase, head, paths: ['src/a.mjs'] };
  git(root, 'switch', '-q', 'main');
  commitFile(root, 'docs/base.md', 'base\n', 'base moves on');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'main');
  git(root, 'switch', '-q', 'pr');
  git(root, 'merge', '-q', '--no-ff', '--no-edit', 'main');
  const gateMerge = git(root, 'rev-parse', 'HEAD');
  const returned = commitFile(root, 'src/a.mjs', 'repair\n', 'returned repair');
  const unreturned = commitFile(root, 'package.json', '{}\n', 'unreturned expansion');

  const result = cli('record', {
    cwd: root,
    base: 'main',
    state: null,
    scope,
    round: 1,
    before: head,
    after: unreturned,
    gateMerges: [gateMerge],
    minted: { items: [], freeText: 'free-text', correction: 'correction' },
    returned: [{ identifier: 'free-text', shas: [returned] }],
    scopeExpansion: [],
  });
  assert.deepEqual(result.round.attribution.foreign, [unreturned]);
  assert.equal(result.round.postCheck.status, 'pass');
  assert.deepEqual(result.stop, {
    reason: 'foreign-commit-unverified',
    round: 1,
    outside: [{ sha: unreturned, path: 'package.json' }],
    mergeCommits: [],
    undetermined: [],
  });
});
