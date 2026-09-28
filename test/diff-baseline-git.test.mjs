import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { createProcessRunner, executeOperation } from '../src/scripts/diff-baseline-core.mjs';

const CLI = fileURLToPath(new URL('../src/scripts/diff-baseline.mjs', import.meta.url));
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
};
const SESSION = '20260929-005956';

// ---------------------------------------------------------------------------------------------
// Fixtures

function gitRaw(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { env: GIT_ENV });
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}

function git(root, ...args) {
  return gitRaw(root, ...args)
    .toString('utf8')
    .trim();
}

function repository(t, { commit = true, ignore = '.effective-flow/\n*.log\n' } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-diff-baseline-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '--initial-branch=main');
  writeFileSync(join(root, '.gitignore'), ignore);
  if (commit) {
    writeFileSync(join(root, 'tracked.txt'), 'tracked\n');
    git(root, 'add', '.gitignore', 'tracked.txt');
    git(root, 'commit', '-m', 'fixture');
  }
  mkdirSync(join(root, '.effective-flow'), { mode: 0o700 });
  return { root, repositoryIdentity: realpathSync(join(root, '.git')) };
}

function commitFiles(root, files) {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  git(root, 'add', '--', ...Object.keys(files));
  git(root, 'commit', '-m', 'more fixture');
}

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(relative(directory, full));
    }
  };
  walk(directory);
  return found.sort();
}

function readIfPresent(file) {
  return existsSync(file) ? readFileSync(file).toString('hex') : null;
}

// Everything capture, render and discard must leave untouched in the real repository.
function repositoryState(root, extraIndexes = []) {
  const head = spawnSync('git', ['-C', root, 'rev-parse', '--verify', '-q', 'HEAD'], {
    env: GIT_ENV,
  });
  return {
    status: gitRaw(
      root,
      '--no-optional-locks',
      'status',
      '--porcelain=v2',
      '-z',
      '--untracked-files=all',
    ).toString('hex'),
    index: readIfPresent(join(root, '.git/index')),
    extraIndexes: extraIndexes.map(readIfPresent),
    stash: git(root, 'stash', 'list'),
    refs: git(root, 'for-each-ref'),
    head: head.stdout.toString('utf8').trim(),
    symbolicHead: readFileSync(join(root, '.git/HEAD'), 'utf8'),
    objects: listFiles(join(root, '.git/objects')),
  };
}

function recordingRunner() {
  const inner = createProcessRunner();
  const calls = [];
  const runner = (call) => {
    calls.push(call);
    return inner(call);
  };
  return { runner, calls };
}

// Runs one operation and asserts that the real repository state is byte-identical afterwards
// and that every git call ran without optional locks.
async function operate(root, operation, input, { extraIndexes = [] } = {}) {
  const before = repositoryState(root, extraIndexes);
  const { runner, calls } = recordingRunner();
  const envelope = await executeOperation(operation, input, { runner, env: GIT_ENV });
  assert.deepEqual(repositoryState(root, extraIndexes), before, `${operation} changed the repo`);
  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.equal(call.executable, 'git');
    assert.equal(call.env.GIT_OPTIONAL_LOCKS, '0', call.args.join(' '));
    if (call.env.GIT_INDEX_FILE) {
      assert.match(
        call.env.GIT_OBJECT_DIRECTORY,
        /\/\.effective-flow\/runs\/[^/]+\/diff-baseline\/objects$/,
      );
      assert.ok(call.env.GIT_INDEX_FILE.startsWith(call.env.GIT_OBJECT_DIRECTORY.slice(0, -8)));
      assert.equal(
        call.env.GIT_ALTERNATE_OBJECT_DIRECTORIES,
        realpathSync(join(root, '.git/objects')),
      );
    }
  }
  return envelope;
}

async function ok(root, operation, input, options) {
  const envelope = await operate(root, operation, input, options);
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  return envelope.result;
}

async function refused(root, operation, input, code) {
  const envelope = await operate(root, operation, input);
  assert.equal(envelope.ok, false, JSON.stringify(envelope));
  assert.equal(envelope.error.code, code, envelope.error.message);
  return envelope.error;
}

function captureInput(fixture, overrides = {}) {
  return {
    cwd: fixture.root,
    executionRoot: fixture.root,
    sessionId: SESSION,
    repositoryIdentity: fixture.repositoryIdentity,
    ...overrides,
  };
}

function renderInput(fixture, baseline, overrides = {}) {
  return {
    cwd: fixture.root,
    executionRoot: fixture.root,
    dir: baseline.dir,
    baselineTree: baseline.baselineTree,
    ...overrides,
  };
}

function mode(file) {
  return statSync(file).mode & 0o777;
}

function byPath(entries) {
  return Object.fromEntries(entries.map((entry) => [entry.path, entry]));
}

// ---------------------------------------------------------------------------------------------
// Render semantics

test('render reports only what changed since capture', async (t) => {
  const fixture = repository(t);
  const { root } = fixture;
  commitFiles(root, {
    'edited.txt': 'edited\n',
    'further.txt': 'line one\n',
    'moved.txt': 'moved content that stays identical\n',
    'deleted.txt': 'deleted\n',
  });
  // Pre-existing state the run did not produce.
  writeFileSync(join(root, 'edited.txt'), 'edited before capture\n');
  writeFileSync(join(root, 'further.txt'), 'line one\npre-existing line\n');
  writeFileSync(join(root, 'untracked-before.txt'), 'untracked before capture\n');

  const baseline = await ok(root, 'capture', captureInput(fixture));
  assert.equal(baseline.runId, SESSION);
  assert.equal(baseline.dir, join(root, '.effective-flow/runs', SESSION, 'diff-baseline'));
  assert.equal(baseline.baselineHead, git(root, 'rev-parse', 'HEAD'));
  assert.match(baseline.baselineTree, /^[0-9a-f]{40}$/);

  // The untracked file's blob lives only in the private object store.
  const untrackedBlob = git(root, 'hash-object', 'untracked-before.txt');
  const probe = spawnSync('git', ['-C', root, 'cat-file', '-e', untrackedBlob], { env: GIT_ENV });
  assert.notEqual(probe.status, 0, 'snapshot blob leaked into the real object store');
  assert.ok(listFiles(join(baseline.dir, 'objects')).length > 0);

  const record = JSON.parse(readFileSync(join(baseline.dir, 'baseline.json'), 'utf8'));
  assert.deepEqual(record, {
    version: 1,
    runId: SESSION,
    baselineHead: baseline.baselineHead,
    baselineTree: baseline.baselineTree,
    executionRoot: root,
  });

  // The run's own changes.
  writeFileSync(join(root, 'further.txt'), 'line one\npre-existing line\nrun line\n');
  writeFileSync(join(root, 'created.txt'), 'created by the run\n');
  writeFileSync(join(root, 'ignored.log'), 'ignored\n');
  writeFileSync(join(root, '.effective-flow/scratch.txt'), 'runtime state\n');
  renameSync(join(root, 'moved.txt'), join(root, 'renamed.txt'));
  unlinkSync(join(root, 'deleted.txt'));
  writeFileSync(join(root, 'image.bin'), Buffer.from([0, 1, 2, 0, 255, 254, 0, 3]));

  const rendered = await ok(root, 'render', renderInput(fixture, baseline));
  assert.deepEqual(Object.keys(rendered), ['diffPath', 'pathsPath', 'currentTree', 'entries']);
  assert.equal(rendered.diffPath, join(baseline.dir, 'diff.patch'));
  assert.equal(rendered.pathsPath, join(baseline.dir, 'paths.json'));
  assert.deepEqual(byPath(rendered.entries), {
    'created.txt': { status: 'A', path: 'created.txt' },
    'deleted.txt': { status: 'D', path: 'deleted.txt' },
    'further.txt': { status: 'M', path: 'further.txt' },
    'image.bin': { status: 'A', path: 'image.bin' },
    'renamed.txt': { status: 'R', path: 'renamed.txt', oldPath: 'moved.txt' },
  });

  const patch = readFileSync(rendered.diffPath, 'utf8');
  assert.match(patch, /^\+run line$/m);
  assert.doesNotMatch(patch, /^\+pre-existing line$/m, 'pre-existing edit leaked into the delta');
  assert.match(patch, /^rename from moved\.txt$/m);
  assert.match(patch, /^rename to renamed\.txt$/m);
  assert.match(patch, /^Binary files \/dev\/null and b\/image\.bin differ$/m);
  for (const absent of ['edited.txt', 'untracked-before.txt', 'ignored.log', '.effective-flow']) {
    assert.ok(!patch.includes(absent), `${absent} must not appear in the delta`);
  }

  const paths = JSON.parse(readFileSync(rendered.pathsPath, 'utf8'));
  assert.deepEqual(paths, {
    version: 1,
    baselineTree: baseline.baselineTree,
    currentTree: rendered.currentTree,
    scope: null,
    entries: rendered.entries,
  });

  for (const directory of [
    join(root, '.effective-flow/runs'),
    join(root, '.effective-flow/runs', SESSION),
    baseline.dir,
    join(baseline.dir, 'objects'),
  ]) {
    assert.equal(mode(directory), 0o700, directory);
  }
  for (const file of ['baseline.json', 'diff.patch', 'paths.json']) {
    assert.equal(mode(join(baseline.dir, file)), 0o600, file);
  }
  // No temporary index or write temp file survives.
  assert.deepEqual(readdirSync(baseline.dir).sort(), [
    'baseline.json',
    'diff.patch',
    'objects',
    'paths.json',
  ]);

  // A second render replaces both files atomically with the new delta.
  writeFileSync(join(root, 'created.txt'), 'created by the run, then edited\n');
  unlinkSync(join(root, 'image.bin'));
  const second = await ok(root, 'render', renderInput(fixture, baseline));
  assert.equal(byPath(second.entries)['image.bin'], undefined);
  assert.match(readFileSync(second.diffPath, 'utf8'), /^\+created by the run, then edited$/m);

  const discarded = await ok(root, 'discard', { cwd: root, dir: baseline.dir });
  assert.deepEqual(discarded, { removed: true, parentRemoved: true });
  assert.ok(!existsSync(join(root, '.effective-flow/runs', SESSION)));
  assert.ok(existsSync(join(root, '.effective-flow/runs')));
});

test('a pre-existing untracked file changed by the run shows only its delta', async (t) => {
  const fixture = repository(t);
  const { root } = fixture;
  writeFileSync(join(root, 'notes.txt'), 'untracked before capture\n');
  const baseline = await ok(root, 'capture', captureInput(fixture));
  writeFileSync(join(root, 'notes.txt'), 'untracked before capture\nadded by the run\n');
  const rendered = await ok(root, 'render', renderInput(fixture, baseline));
  // Modified against the snapshot, never "added": the file existed when the baseline was taken.
  assert.deepEqual(rendered.entries, [{ status: 'M', path: 'notes.txt' }]);
  const patch = readFileSync(rendered.diffPath, 'utf8');
  assert.match(patch, /^\+added by the run$/m);
  assert.doesNotMatch(patch, /^\+untracked before capture$/m);
});

test('a submodule change appears as a gitlink change only', async (t) => {
  const fixture = repository(t);
  const { root } = fixture;
  const inner = join(root, 'vendor/inner');
  mkdirSync(inner, { recursive: true });
  git(inner, 'init', '--initial-branch=main');
  writeFileSync(join(inner, 'inside.txt'), 'inside\n');
  git(inner, 'add', 'inside.txt');
  git(inner, 'commit', '-m', 'inner');
  git(root, 'add', 'vendor/inner');
  git(root, 'commit', '-m', 'gitlink');

  const baseline = await ok(root, 'capture', captureInput(fixture));
  writeFileSync(join(inner, 'inside.txt'), 'inside, changed and committed\n');
  writeFileSync(join(inner, 'secret.txt'), 'never diffed\n');
  git(inner, 'add', 'inside.txt', 'secret.txt');
  git(inner, 'commit', '-m', 'inner moves');

  const rendered = await ok(root, 'render', renderInput(fixture, baseline));
  assert.deepEqual(rendered.entries, [{ status: 'M', path: 'vendor/inner' }]);
  const patch = readFileSync(rendered.diffPath, 'utf8');
  assert.match(patch, /^\+Subproject commit [0-9a-f]{40}$/m);
  for (const absent of ['inside.txt', 'secret.txt', 'never diffed']) {
    assert.ok(!patch.includes(absent), `submodule content ${absent} must not be diffed`);
  }
});

test('an unchanged tree renders an empty patch and no entries', async (t) => {
  const fixture = repository(t);
  writeFileSync(join(fixture.root, 'dirty.txt'), 'untracked\n');
  const baseline = await ok(fixture.root, 'capture', captureInput(fixture));
  const rendered = await ok(fixture.root, 'render', renderInput(fixture, baseline));
  assert.deepEqual(rendered.entries, []);
  assert.equal(rendered.currentTree, baseline.baselineTree);
  assert.equal(readFileSync(rendered.diffPath).length, 0);
});

test('an unborn HEAD captures a null baselineHead', async (t) => {
  const fixture = repository(t, { commit: false });
  const { root } = fixture;
  writeFileSync(join(root, 'before.txt'), 'before\n');
  const baseline = await ok(root, 'capture', captureInput(fixture));
  assert.equal(baseline.baselineHead, null);
  writeFileSync(join(root, 'after.txt'), 'after\n');
  const rendered = await ok(root, 'render', renderInput(fixture, baseline));
  assert.deepEqual(rendered.entries, [{ status: 'A', path: 'after.txt' }]);
});

test('special-character paths survive byte-exactly', async (t) => {
  const fixture = repository(t);
  const { root } = fixture;
  const baseline = await ok(root, 'capture', captureInput(fixture));
  const names = ['with space.txt', 'quote"d.txt', 'new\nline.txt', 'tab\there.txt', 'ümlaut.txt'];
  for (const name of names) writeFileSync(join(root, name), `${name}\n`);
  const invalid = Buffer.from([0x62, 0x61, 0x64, 0xff, 0x2e, 0x74, 0x78, 0x74]);
  let invalidWritten = true;
  try {
    writeFileSync(Buffer.concat([Buffer.from(`${root}/`), invalid]), 'bytes\n');
  } catch (error) {
    invalidWritten = false;
    t.diagnostic(`filesystem rejects non-UTF-8 names (${error.code}); that case is skipped`);
  }
  const rendered = await ok(root, 'render', renderInput(fixture, baseline));
  const paths = rendered.entries.map((entry) => entry.path);
  for (const name of names) assert.ok(paths.includes(name), `missing ${JSON.stringify(name)}`);
  if (invalidWritten) {
    const entry = rendered.entries.find((candidate) => candidate.pathBase64);
    assert.ok(entry, 'non-UTF-8 path must carry pathBase64');
    assert.equal(Buffer.from(entry.pathBase64, 'base64').compare(invalid), 0);
    assert.equal(rendered.entries.length, names.length + 1);
  } else {
    assert.equal(rendered.entries.length, names.length);
  }
});

test('scope restricts the delta to literal repository paths', async (t) => {
  const fixture = repository(t);
  const { root } = fixture;
  commitFiles(root, { 'src/a.txt': 'a\n', 'docs/b.txt': 'b\n', 'g1.txt': '1\n' });
  const baseline = await ok(root, 'capture', captureInput(fixture));
  writeFileSync(join(root, 'src/a.txt'), 'a changed\n');
  writeFileSync(join(root, 'src/new.txt'), 'new\n');
  writeFileSync(join(root, 'docs/b.txt'), 'b changed\n');
  writeFileSync(join(root, 'g1.txt'), '1 changed\n');

  const scoped = await ok(root, 'render', renderInput(fixture, baseline, { scope: ['src/'] }));
  assert.deepEqual(scoped.entries, [
    { status: 'M', path: 'src/a.txt' },
    { status: 'A', path: 'src/new.txt' },
  ]);
  assert.ok(!readFileSync(scoped.diffPath, 'utf8').includes('docs/b.txt'));
  assert.deepEqual(JSON.parse(readFileSync(scoped.pathsPath, 'utf8')).scope, ['src']);

  const literal = await ok(root, 'render', renderInput(fixture, baseline, { scope: ['g*.txt'] }));
  assert.deepEqual(literal.entries, [], 'a scope entry is a literal path, never a glob');

  const exact = await ok(
    root,
    'render',
    renderInput(fixture, baseline, { scope: ['docs/b.txt', 'g1.txt'] }),
  );
  assert.deepEqual(
    exact.entries.map((entry) => entry.path),
    ['docs/b.txt', 'g1.txt'],
  );
});

test('a linked worktree is snapshotted against the main checkout runtime root', async (t) => {
  const fixture = repository(t);
  const { root } = fixture;
  const worktree = join(root, '.effective-flow/.worktrees/run');
  git(root, 'worktree', 'add', '--detach', worktree);
  writeFileSync(join(worktree, 'pre.txt'), 'pre-existing\n');
  const worktreeIndex = join(root, '.git/worktrees/run/index');
  const options = { extraIndexes: [worktreeIndex] };

  const baseline = await ok(
    root,
    'capture',
    captureInput(fixture, { executionRoot: worktree }),
    options,
  );
  assert.equal(baseline.baselineHead, git(worktree, 'rev-parse', 'HEAD'));
  writeFileSync(join(worktree, 'tracked.txt'), 'changed in the worktree\n');
  writeFileSync(join(root, 'main-only.txt'), 'main checkout edit\n');
  const rendered = await ok(
    root,
    'render',
    renderInput(fixture, baseline, { executionRoot: worktree }),
    options,
  );
  assert.deepEqual(rendered.entries, [{ status: 'M', path: 'tracked.txt' }]);

  await refused(root, 'capture', captureInput(fixture, { cwd: worktree }), 'UNSAFE_TARGET');
});

// ---------------------------------------------------------------------------------------------
// Run directory allocation and refusals

test('run ids are allocated exclusively with a -N suffix', async (t) => {
  const fixture = repository(t);
  const first = await ok(fixture.root, 'capture', captureInput(fixture));
  const second = await ok(fixture.root, 'capture', captureInput(fixture));
  mkdirSync(join(fixture.root, '.effective-flow/runs', `${SESSION}-3`));
  const fourth = await ok(fixture.root, 'capture', captureInput(fixture));
  assert.equal(first.runId, SESSION);
  assert.equal(second.runId, `${SESSION}-2`);
  assert.equal(fourth.runId, `${SESSION}-4`);
  assert.equal(
    second.dir,
    join(fixture.root, '.effective-flow/runs', `${SESSION}-2/diff-baseline`),
  );
});

test('capture refuses a symlinked .effective-flow before writing', async (t) => {
  const fixture = repository(t);
  const { root } = fixture;
  const elsewhere = mkdtempSync(join(tmpdir(), 'effective-flow-diff-baseline-target-'));
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }));
  rmSync(join(root, '.effective-flow'), { recursive: true });
  symlinkSync(elsewhere, join(root, '.effective-flow'));
  await refused(root, 'capture', captureInput(fixture), 'UNSAFE_TARGET');
  assert.deepEqual(readdirSync(elsewhere), []);
});

test('capture refuses a symlinked runs directory before writing', async (t) => {
  const fixture = repository(t);
  const elsewhere = mkdtempSync(join(tmpdir(), 'effective-flow-diff-baseline-target-'));
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }));
  symlinkSync(elsewhere, join(fixture.root, '.effective-flow/runs'));
  await refused(fixture.root, 'capture', captureInput(fixture), 'UNSAFE_TARGET');
  assert.deepEqual(readdirSync(elsewhere), []);
});

test('capture refuses a .effective-flow that is not ignored', async (t) => {
  const fixture = repository(t, { ignore: '*.log\n' });
  await refused(fixture.root, 'capture', captureInput(fixture), 'RUNTIME_STATE_UNSAFE');
  assert.deepEqual(readdirSync(join(fixture.root, '.effective-flow')), []);
});

test('capture refuses a .effective-flow with tracked content', async (t) => {
  const fixture = repository(t);
  const { root } = fixture;
  writeFileSync(join(root, '.effective-flow/tracked.json'), '{}\n');
  git(root, 'add', '-f', '.effective-flow/tracked.json');
  git(root, 'commit', '-m', 'track runtime state');
  await refused(root, 'capture', captureInput(fixture), 'RUNTIME_STATE_UNSAFE');
  assert.deepEqual(readdirSync(join(root, '.effective-flow')), ['tracked.json']);
});

test('capture refuses a missing .effective-flow and a foreign repository identity', async (t) => {
  const fixture = repository(t);
  const other = repository(t);
  await refused(
    fixture.root,
    'capture',
    captureInput(fixture, { repositoryIdentity: other.repositoryIdentity }),
    'UNSAFE_TARGET',
  );
  await refused(
    fixture.root,
    'capture',
    captureInput(fixture, { executionRoot: other.root }),
    'UNSAFE_TARGET',
  );
  mkdirSync(join(fixture.root, 'sub'));
  await refused(
    fixture.root,
    'capture',
    captureInput(fixture, { executionRoot: join(fixture.root, 'sub') }),
    'UNSAFE_TARGET',
  );
  rmSync(join(fixture.root, '.effective-flow'), { recursive: true });
  await refused(fixture.root, 'capture', captureInput(fixture), 'RUNTIME_STATE_UNSAFE');
  assert.ok(!existsSync(join(fixture.root, '.effective-flow')));
});

test('render and discard refuse handles outside the run layout or through symlinks', async (t) => {
  const fixture = repository(t);
  const { root } = fixture;
  const baseline = await ok(root, 'capture', captureInput(fixture));
  const wrongLayout = join(root, '.effective-flow/other', SESSION, 'diff-baseline');
  await refused(
    root,
    'render',
    renderInput(fixture, baseline, { dir: wrongLayout }),
    'UNSAFE_TARGET',
  );
  await refused(root, 'discard', { cwd: root, dir: wrongLayout }, 'UNSAFE_TARGET');
  const foreign = repository(t);
  await refused(
    root,
    'discard',
    { cwd: root, dir: join(foreign.root, '.effective-flow/runs', SESSION, 'diff-baseline') },
    'UNSAFE_TARGET',
  );

  const aliasRun = join(root, '.effective-flow/runs/alias');
  symlinkSync(join(root, '.effective-flow/runs', SESSION), aliasRun);
  const aliased = join(aliasRun, 'diff-baseline');
  await refused(root, 'render', renderInput(fixture, baseline, { dir: aliased }), 'UNSAFE_TARGET');
  await refused(root, 'discard', { cwd: root, dir: aliased }, 'UNSAFE_TARGET');
  assert.ok(existsSync(join(baseline.dir, 'baseline.json')));
  assert.ok(!existsSync(join(baseline.dir, 'diff.patch')));
});

// ---------------------------------------------------------------------------------------------
// Lifecycle and fail-closed render

test('discard keeps a non-empty run parent and treats an absent handle as done', async (t) => {
  const fixture = repository(t);
  const { root } = fixture;
  const baseline = await ok(root, 'capture', captureInput(fixture));
  const sibling = join(root, '.effective-flow/runs', SESSION, 'results.json');
  writeFileSync(sibling, '{}\n', { mode: 0o600 });
  assert.deepEqual(await ok(root, 'discard', { cwd: root, dir: baseline.dir }), {
    removed: true,
    parentRemoved: false,
  });
  assert.ok(!existsSync(baseline.dir));
  assert.ok(existsSync(sibling));
  assert.deepEqual(await ok(root, 'discard', { cwd: root, dir: baseline.dir }), {
    removed: false,
    parentRemoved: false,
  });
});

test('render fails closed on a missing baseline object and never re-captures', async (t) => {
  const fixture = repository(t);
  const { root } = fixture;
  writeFileSync(join(root, 'private.txt'), 'only in the snapshot store\n');
  const baseline = await ok(root, 'capture', captureInput(fixture));

  const unknown = await refused(
    root,
    'render',
    renderInput(fixture, baseline, { baselineTree: 'b'.repeat(40) }),
    'MISSING_OBJECT',
  );
  assert.match(unknown.message, /b{40}/);

  rmSync(join(baseline.dir, 'objects'), { recursive: true });
  mkdirSync(join(baseline.dir, 'objects'), { mode: 0o700 });
  const emptied = await refused(root, 'render', renderInput(fixture, baseline), 'MISSING_OBJECT');
  assert.ok(emptied.message.includes(baseline.baselineTree));
  assert.ok(!existsSync(join(baseline.dir, 'diff.patch')));
  assert.ok(!existsSync(join(baseline.dir, 'paths.json')));

  rmSync(join(root, '.effective-flow/runs', SESSION), { recursive: true });
  const removed = await refused(root, 'render', renderInput(fixture, baseline), 'MISSING_OBJECT');
  assert.ok(removed.message.includes(baseline.baselineTree));
  assert.ok(!existsSync(join(root, '.effective-flow/runs', SESSION)), 'render must not re-capture');
});

// ---------------------------------------------------------------------------------------------
// CLI end to end

function runCli(operation, input) {
  return spawnSync(process.execPath, [CLI, operation], {
    encoding: 'utf8',
    env: GIT_ENV,
    input: JSON.stringify(input),
  });
}

function cliEnvelope(result) {
  const lines = result.stdout.trimEnd().split('\n');
  assert.equal(lines.length, 1, result.stdout);
  return JSON.parse(lines[0]);
}

test('CLI: capture, render and discard each print one envelope line', (t) => {
  const fixture = repository(t);
  const { root } = fixture;
  const before = repositoryState(root);
  const captured = runCli('capture', captureInput(fixture));
  assert.equal(captured.status, 0, captured.stderr);
  const capture = cliEnvelope(captured);
  assert.equal(capture.ok, true);
  assert.equal(capture.operation, 'capture');
  assert.deepEqual(Object.keys(capture.result), ['runId', 'dir', 'baselineHead', 'baselineTree']);
  assert.deepEqual(repositoryState(root), before);

  writeFileSync(join(root, 'cli.txt'), 'cli\n');
  const afterEdit = repositoryState(root);
  const rendered = runCli('render', renderInput(fixture, capture.result));
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.deepEqual(cliEnvelope(rendered).result.entries, [{ status: 'A', path: 'cli.txt' }]);
  assert.deepEqual(repositoryState(root), afterEdit);

  const discarded = runCli('discard', { cwd: root, dir: capture.result.dir });
  assert.equal(discarded.status, 0, discarded.stderr);
  assert.deepEqual(cliEnvelope(discarded).result, { removed: true, parentRemoved: true });
  assert.deepEqual(repositoryState(root), afterEdit);
});

test('CLI: a refused capture exits 3 with CODE: message on stderr', (t) => {
  const fixture = repository(t, { ignore: '' });
  const result = runCli('capture', captureInput(fixture));
  assert.equal(result.status, 3);
  assert.equal(cliEnvelope(result).error.code, 'RUNTIME_STATE_UNSAFE');
  assert.match(result.stderr, /^RUNTIME_STATE_UNSAFE: /);
});
