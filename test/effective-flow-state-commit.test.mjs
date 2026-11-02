// Unit tests of the runtime-state helper's `commit create` against temporary Git repositories: the
// one allowlisted call that stages an `iterate` item's listed paths, commits them with the
// repository's hooks and verifies the result under `iterate-commit.lock`.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';

import {
  COMMIT_SIGNALS,
  FILTER_BUDGET_MS,
  HOOK_CONFIG,
  HUSKY_GENERATED_SHA256,
  MAX_STDERR_CHARS,
  SANDBOX_STDERR_PATTERNS,
  changedPackageKeys,
  gitDirWriteDenied,
  hookConfigClass,
  isSandboxDenial,
  reportedStderr,
} from '../src/scripts/effective-flow-state-commit-core.mjs';
import {
  acquireOwned,
  executeOperation,
  makeContext,
  resolveRoot,
} from '../src/scripts/effective-flow-state-core.mjs';
import { gitCommitEnv } from '../src/scripts/runtime-state-guard.mjs';
import {
  createProcessRunner,
  terminateActiveProcessGroups,
} from '../src/scripts/process-runner.mjs';

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
};
const OWNER = Object.freeze({
  workflow: 'iterate',
  runId: 'iterate-0123456789abcdef',
  item: 'PRRT_kwDOAB=+1',
  delegation: 'iterate-0123456789abcdef/1',
});
const LOCK_DIR = ['.effective-flow', 'iterate-commit.lock'];

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { env: GIT_ENV });
  assert.equal(result.status, 0, String(result.stderr));
  return String(result.stdout).trim();
}

function repository(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-commit-')));
  t.after(() => {
    spawnSync('chmod', ['-R', 'u+w', root]);
    rmSync(root, { recursive: true, force: true });
  });
  git(root, 'init', '-q', '--initial-branch=main');
  writeFileSync(join(root, '.gitignore'), '.effective-flow/\n*.log\n');
  writeFileSync(join(root, 'tracked.txt'), 'tracked\n');
  writeFileSync(join(root, 'other.txt'), 'other\n');
  writeFileSync(join(root, 'old-name.txt'), 'renamed content\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'fixture');
  return root;
}

function head(root) {
  return git(root, 'rev-parse', 'HEAD');
}

function blob(root, relative) {
  return git(root, 'hash-object', '--', relative);
}

function staged(root) {
  return git(root, 'diff', '--cached', '--name-only').split('\n').filter(Boolean);
}

function hook(root, name, body) {
  const target = join(root, '.git', 'hooks', name);
  writeFileSync(target, `#!/bin/sh\n${body}\n`);
  chmodSync(target, 0o755);
}

function lockPresent(root) {
  return existsSync(join(root, ...LOCK_DIR));
}

function deps(extra = {}) {
  return { runner: createProcessRunner(), env: GIT_ENV, ...extra };
}

function input(root, overrides = {}) {
  return {
    cwd: root,
    worktree: root,
    lock: 'iterate-commit',
    owner: OWNER,
    paths: ['tracked.txt'],
    expect: { 'tracked.txt': blob(root, 'tracked.txt') },
    hookBase: head(root),
    sameRepository: true,
    message: "fix: apply the item's change",
    ...overrides,
  };
}

function commitCreate(value, extra) {
  return executeOperation('commit create', value, deps(extra));
}

function expectOutcome(envelope, code) {
  assert.equal(envelope.ok, false, JSON.stringify(envelope));
  assert.equal(envelope.outcome?.code, code, JSON.stringify(envelope));
  return envelope.outcome;
}

function expectResult(envelope) {
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  return envelope.result;
}

async function waitForFile(target) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (existsSync(target)) return;
    await delay(25);
  }
  throw new Error(`${target} never appeared`);
}

// ---------------------------------------------------------------------------------------------
// Success

// Invariant: modified, added, deleted and renamed paths (both sides of a rename listed) are
// committed exactly, the index is left clean, the lock is released and the SHA returned.
test('commit create commits modified, added, deleted and renamed paths', async (t) => {
  const root = repository(t);
  const before = head(root);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  writeFileSync(join(root, 'added.txt'), 'new\n');
  unlinkSync(join(root, 'other.txt'));
  unlinkSync(join(root, 'old-name.txt'));
  writeFileSync(join(root, 'new-name.txt'), 'renamed content\n');
  const paths = ['tracked.txt', 'added.txt', 'other.txt', 'old-name.txt', 'new-name.txt'];
  const expect = {
    'tracked.txt': blob(root, 'tracked.txt'),
    'added.txt': blob(root, 'added.txt'),
    'other.txt': null,
    'old-name.txt': null,
    'new-name.txt': blob(root, 'new-name.txt'),
  };
  const result = expectResult(await commitCreate(input(root, { paths, expect })));
  assert.equal(result.commit, head(root));
  assert.deepEqual(result.paths, paths);
  assert.equal(git(root, 'rev-parse', 'HEAD^'), before);
  assert.equal(git(root, 'log', '-1', '--format=%s'), "fix: apply the item's change");
  assert.deepEqual(
    git(root, 'diff', '--name-only', '--no-renames', before, 'HEAD').split('\n').sort(),
    [...paths].sort(),
  );
  assert.deepEqual(staged(root), []);
  assert.equal(lockPresent(root), false);
  assert.equal(result.heldLock, undefined);
});

// Invariant: `worktree` may be a linked worktree of the same repository while the lock stays below
// `cwd`, the main checkout.
test('commit create commits in a linked worktree with the lock in the runtime root', async (t) => {
  const root = repository(t);
  const linked = join(root, '.effective-flow', '.worktrees', 'item');
  mkdirSync(join(root, '.effective-flow', '.worktrees'), { recursive: true });
  git(root, 'worktree', 'add', '-q', '-b', 'item', linked);
  writeFileSync(join(linked, 'tracked.txt'), 'linked change\n');
  const result = expectResult(
    await commitCreate(
      input(root, {
        worktree: linked,
        expect: { 'tracked.txt': blob(linked, 'tracked.txt') },
        hookBase: head(linked),
      }),
    ),
  );
  assert.equal(result.commit, head(linked));
  assert.notEqual(head(root), head(linked));
  assert.equal(lockPresent(root), false);
});

// ---------------------------------------------------------------------------------------------
// Validation before the lock

// Invariant: a bad path, a runtime-state path, a mismatched `expect`, a foreign or unregistered
// worktree and a bad hook base are INVALID_INPUT before the lock is taken.
test('commit create rejects invalid, runtime-state and foreign-worktree input before the lock', async (t) => {
  const root = repository(t);
  const other = repository(t);
  const unregistered = join(root, 'sub');
  mkdirSync(unregistered);
  const expectFor = (paths) => Object.fromEntries(paths.map((entry) => [entry, null]));
  const cases = [
    { paths: ['/etc/passwd'], expect: expectFor(['/etc/passwd']) },
    { paths: ['../escape.txt'], expect: expectFor(['../escape.txt']) },
    { paths: ['a/../tracked.txt'], expect: expectFor(['a/../tracked.txt']) },
    { paths: ['./tracked.txt'], expect: expectFor(['./tracked.txt']) },
    { paths: ['.effective-flow/memory.json'], expect: expectFor(['.effective-flow/memory.json']) },
    { paths: ['.git/config'], expect: expectFor(['.git/config']) },
    { paths: ['tracked.txt', 'tracked.txt'], expect: expectFor(['tracked.txt']) },
    { paths: [], expect: {} },
    { expect: {} },
    { expect: { 'tracked.txt': 'not-an-oid' } },
    { expect: { 'tracked.txt': null, 'other.txt': null } },
    { worktree: other },
    { worktree: unregistered },
    { worktree: `${root}/` },
    { hookBase: 'main' },
    { hookBase: '0'.repeat(40) },
    { sameRepository: 'yes' },
    { message: '   ' },
    { lock: 'apply-review-commit' },
    { extra: true },
  ];
  for (const overrides of cases) {
    const envelope = await commitCreate(input(root, overrides));
    assert.equal(envelope.ok, false, JSON.stringify(overrides));
    assert.equal(envelope.error?.code, 'INVALID_INPUT', JSON.stringify([overrides, envelope]));
    assert.equal(lockPresent(root), false, JSON.stringify(overrides));
  }

  // A symlinked directory inside the worktree that points outside it.
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-outside-')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  spawnSync('ln', ['-s', outside, join(root, 'linkdir')]);
  const escaped = await commitCreate(
    input(root, { paths: ['linkdir/file.txt'], expect: { 'linkdir/file.txt': null } }),
  );
  assert.equal(escaped.error?.code, 'INVALID_INPUT');
  assert.match(escaped.error.message, /outside worktree/);
});

// ---------------------------------------------------------------------------------------------
// Hook trust

// The hook-relevant classes and one path of each, committed between `hookBase` and HEAD.
const HOOK_CLASS_CASES = Object.freeze([
  ['husky', '.husky/pre-commit', 'npx lint\n'],
  ['githooks', '.githooks/pre-commit', 'exit 0\n'],
  ['pre-commit', '.pre-commit-config.yaml', 'repos: []\n'],
  ['lefthook', 'lefthook.yml', 'pre-commit: {}\n'],
  ['lint-staged', '.lintstagedrc.json', '{}\n'],
  ['simple-git-hooks', '.simple-git-hooks.json', '{}\n'],
]);

// Invariant: a fork head is HOOKS_UNTRUSTED before anything is staged or locked.
test('commit create refuses a fork head with HOOKS_UNTRUSTED', async (t) => {
  const root = repository(t);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const outcome = expectOutcome(
    await commitCreate(
      input(root, {
        sameRepository: false,
        expect: { 'tracked.txt': blob(root, 'tracked.txt') },
      }),
    ),
    'HOOKS_UNTRUSTED',
  );
  assert.equal(outcome.reason, 'fork-head');
  assert.deepEqual(staged(root), []);
  assert.equal(lockPresent(root), false);
});

// Invariant: every class of hook-relevant configuration changed between `hookBase` and HEAD makes
// the head's hooks untrusted, and so does a `core.hooksPath` directory inside the worktree.
test('commit create refuses each class of hook configuration changed against the base', async (t) => {
  for (const [kind, relative, content] of HOOK_CLASS_CASES) {
    const root = repository(t);
    const base = head(root);
    mkdirSync(join(root, relative, '..'), { recursive: true });
    writeFileSync(join(root, relative), content);
    git(root, 'add', '--', relative);
    git(root, 'commit', '-q', '-m', `add ${relative}`);
    writeFileSync(join(root, 'tracked.txt'), 'changed\n');
    const outcome = expectOutcome(
      await commitCreate(
        input(root, { hookBase: base, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
      ),
      'HOOKS_UNTRUSTED',
    );
    assert.equal(outcome.reason, 'changed-against-base', kind);
    assert.deepEqual(outcome.changed, [{ path: relative, class: kind }], kind);
    assert.equal(lockPresent(root), false);
  }

  const root = repository(t);
  const base = head(root);
  git(root, 'config', 'core.hooksPath', 'tools/hooks');
  mkdirSync(join(root, 'tools', 'hooks'), { recursive: true });
  writeFileSync(join(root, 'tools', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 0\n');
  git(root, 'add', '--', 'tools/hooks/pre-commit');
  git(root, 'commit', '-q', '-m', 'hooks path');
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const outcome = expectOutcome(
    await commitCreate(
      input(root, { hookBase: base, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
    ),
    'HOOKS_UNTRUSTED',
  );
  assert.deepEqual(outcome.changed, [{ path: 'tools/hooks/pre-commit', class: 'hooks-path' }]);
});

// Invariant: each hook-relevant `package.json` key changed against the base is untrusted; a change
// to any other key is not.
test('commit create judges package.json by its hook-relevant keys only', async (t) => {
  const keys = {
    husky: { husky: { hooks: { 'pre-commit': 'x' } } },
    'lint-staged': { 'lint-staged': { '*.js': 'x' } },
    'simple-git-hooks': { 'simple-git-hooks': { 'pre-commit': 'x' } },
    'scripts.prepare': { scripts: { prepare: 'x' } },
    'scripts.postinstall': { scripts: { postinstall: 'x' } },
  };
  for (const [key, value] of Object.entries(keys)) {
    const root = repository(t);
    writeFileSync(join(root, 'package.json'), '{"name":"fixture","scripts":{"test":"x"}}\n');
    git(root, 'add', 'package.json');
    git(root, 'commit', '-q', '-m', 'package');
    const base = head(root);
    writeFileSync(
      join(root, 'package.json'),
      `${JSON.stringify({ name: 'fixture', ...value, scripts: { test: 'x', ...value.scripts } })}\n`,
    );
    git(root, 'commit', '-q', '-am', `change ${key}`);
    writeFileSync(join(root, 'tracked.txt'), 'changed\n');
    const outcome = expectOutcome(
      await commitCreate(
        input(root, { hookBase: base, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
      ),
      'HOOKS_UNTRUSTED',
    );
    assert.deepEqual(outcome.changed, [
      { path: 'package.json', class: 'package-json', keys: [key] },
    ]);
  }

  const root = repository(t);
  writeFileSync(join(root, 'package.json'), '{"scripts":{"test":"a"}}\n');
  git(root, 'add', 'package.json');
  git(root, 'commit', '-q', '-m', 'package');
  const base = head(root);
  writeFileSync(join(root, 'package.json'), '{"scripts":{"test":"b"},"version":"2.0.0"}\n');
  git(root, 'commit', '-q', '-am', 'unrelated keys');
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  expectResult(
    await commitCreate(
      input(root, { hookBase: base, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
    ),
  );
});

// Invariant: a working-tree change to hook configuration, including one the item's own paths make,
// is untrusted, tracked or untracked.
test('commit create refuses a working-tree change to hook configuration', async (t) => {
  const root = repository(t);
  mkdirSync(join(root, '.husky'));
  writeFileSync(join(root, '.husky', 'pre-commit'), 'exit 0\n');
  const outcome = expectOutcome(
    await commitCreate(
      input(root, {
        paths: ['.husky/pre-commit'],
        expect: { '.husky/pre-commit': blob(root, '.husky/pre-commit') },
      }),
    ),
    'HOOKS_UNTRUSTED',
  );
  assert.equal(outcome.reason, 'changed-in-worktree');
  assert.deepEqual(outcome.changed, [{ path: '.husky/pre-commit', class: 'husky' }]);
  assert.equal(lockPresent(root), false);

  const tracked = repository(t);
  writeFileSync(join(tracked, 'package.json'), '{}\n');
  git(tracked, 'add', 'package.json');
  git(tracked, 'commit', '-q', '-m', 'package');
  writeFileSync(join(tracked, 'package.json'), '{"scripts":{"prepare":"husky"}}\n');
  writeFileSync(join(tracked, 'tracked.txt'), 'changed\n');
  const viaPackage = expectOutcome(
    await commitCreate(
      input(tracked, {
        hookBase: head(tracked),
        expect: { 'tracked.txt': blob(tracked, 'tracked.txt') },
      }),
    ),
    'HOOKS_UNTRUSTED',
  );
  assert.deepEqual(viaPackage.changed, [
    { path: 'package.json', class: 'package-json', keys: ['scripts.prepare'] },
  ]);
});

// Invariant: the closed classifier names every listed class and nothing else.
test('hookConfigClass and changedPackageKeys classify the closed list', () => {
  for (const [kind, relative] of HOOK_CLASS_CASES) assert.equal(hookConfigClass(relative), kind);
  assert.equal(hookConfigClass('pkg/.lintstagedrc'), 'lint-staged');
  assert.equal(hookConfigClass('lint-staged.config.mjs'), 'lint-staged');
  assert.equal(hookConfigClass('.lefthook/pre-commit/x.sh'), 'lefthook');
  assert.equal(hookConfigClass('simple-git-hooks.cjs'), 'simple-git-hooks');
  assert.equal(hookConfigClass('apps/web/package.json'), 'package-json');
  assert.equal(hookConfigClass('tools/hooks/x', { hooksPath: 'tools/hooks' }), 'hooks-path');
  for (const relative of ['src/index.js', 'husky.md', 'docs/.husky.md', 'tools/hooks/x']) {
    assert.equal(hookConfigClass(relative), null, relative);
  }
  assert.deepEqual(changedPackageKeys('{"a":1}', '{"a":2}'), []);
  assert.deepEqual(changedPackageKeys(null, '{"husky":{}}'), ['husky']);
  assert.deepEqual(changedPackageKeys('{', '{}').length, HOOK_CONFIG.packageKeys.length);
});

// ---------------------------------------------------------------------------------------------
// Under the lock

// Invariant: foreign staged state before the call is INDEX_NOT_CLEAN; nothing is touched.
test('commit create refuses a non-empty index and leaves it as it was', async (t) => {
  const root = repository(t);
  writeFileSync(join(root, 'other.txt'), 'foreign\n');
  git(root, 'add', 'other.txt');
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } })),
    'INDEX_NOT_CLEAN',
  );
  assert.deepEqual(outcome.staged, ['other.txt']);
  assert.deepEqual(staged(root), ['other.txt']);
  assert.equal(lockPresent(root), false);
});

// Invariant: a failed `git add` (an ignored path, a deleted path that was never tracked) is
// STAGE_FAILED with the listed paths unstaged.
test('commit create reports STAGE_FAILED for an ignored or never-tracked path', async (t) => {
  const root = repository(t);
  writeFileSync(join(root, 'debug.log'), 'ignored\n');
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const ignored = expectOutcome(
    await commitCreate(
      input(root, {
        paths: ['tracked.txt', 'debug.log'],
        expect: { 'tracked.txt': blob(root, 'tracked.txt'), 'debug.log': blob(root, 'debug.log') },
      }),
    ),
    'STAGE_FAILED',
  );
  assert.match(ignored.stderr, /ignored/);
  assert.deepEqual(staged(root), []);
  assert.equal(lockPresent(root), false);

  const never = expectOutcome(
    await commitCreate(input(root, { paths: ['never.txt'], expect: { 'never.txt': null } })),
    'STAGE_FAILED',
  );
  assert.match(never.stderr, /did not match/);
  assert.deepEqual(staged(root), []);
});

// Invariant: a listed path without a change misses from the staged set, and a foreign change that
// appears during the call shows up in it; either is STAGED_SET_MISMATCH, only the listed paths are
// unstaged and the foreign change stays staged.
test('commit create reports STAGED_SET_MISMATCH and unstages only the listed paths', async (t) => {
  const root = repository(t);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const unchanged = expectOutcome(
    await commitCreate(
      input(root, {
        paths: ['tracked.txt', 'other.txt'],
        expect: { 'tracked.txt': blob(root, 'tracked.txt'), 'other.txt': blob(root, 'other.txt') },
      }),
    ),
    'STAGED_SET_MISMATCH',
  );
  assert.deepEqual(unchanged.staged, ['tracked.txt']);
  assert.deepEqual(unchanged.stillStaged, []);
  assert.deepEqual(staged(root), []);

  writeFileSync(join(root, 'other.txt'), 'foreign\n');
  const runner = createProcessRunner();
  const racing = async (call) => {
    const result = await runner(call);
    if (call.args.includes('add') && call.args.includes('tracked.txt'))
      git(root, 'add', 'other.txt');
    return result;
  };
  const foreign = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }), {
      runner: racing,
    }),
    'STAGED_SET_MISMATCH',
  );
  assert.deepEqual(foreign.staged.sort(), ['other.txt', 'tracked.txt']);
  assert.deepEqual(foreign.stillStaged, ['other.txt']);
  assert.deepEqual(staged(root), ['other.txt']);
  assert.equal(lockPresent(root), false);
});

// Invariant: a file that changed after its `expect` OID was taken is STAGED_CONTENT_CHANGED and
// nothing is committed; a null `expect` for a path that still exists is a mismatch as well.
test('commit create reports STAGED_CONTENT_CHANGED for content changed after inspection', async (t) => {
  const root = repository(t);
  const before = head(root);
  writeFileSync(join(root, 'tracked.txt'), 'inspected\n');
  const inspected = blob(root, 'tracked.txt');
  writeFileSync(join(root, 'tracked.txt'), 'changed by a sibling\n');
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': inspected } })),
    'STAGED_CONTENT_CHANGED',
  );
  assert.deepEqual(outcome.paths, ['tracked.txt']);
  assert.equal(head(root), before);
  assert.deepEqual(staged(root), []);

  const notDeleted = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': null } })),
    'STAGED_CONTENT_CHANGED',
  );
  assert.deepEqual(notDeleted.paths, ['tracked.txt']);
  assert.equal(lockPresent(root), false);
});

// Invariant: a failing pre-commit hook and a hook past the commit bound are COMMIT_FAILED with the
// listed paths unstaged.
test('commit create reports COMMIT_FAILED for a failing hook and for the timeout', async (t) => {
  const root = repository(t);
  const before = head(root);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const request = input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } });
  hook(root, 'pre-commit', 'echo "lint failed" >&2\nexit 1');
  const failed = expectOutcome(await commitCreate(request), 'COMMIT_FAILED');
  assert.equal(failed.status, 1);
  assert.equal(failed.timedOut, false);
  assert.match(failed.stderr, /lint failed/);
  assert.deepEqual(staged(root), []);
  assert.equal(head(root), before);

  hook(root, 'pre-commit', 'sleep 30');
  const slow = expectOutcome(
    await commitCreate(request, { commitTimeoutMs: 300 }),
    'COMMIT_FAILED',
  );
  assert.equal(slow.timedOut, true);
  assert.deepEqual(staged(root), []);
  assert.equal(head(root), before);
  assert.equal(lockPresent(root), false);
});

// Invariant: a hook that changes the committed set leaves a commit that is reported, with its SHA,
// as COMMIT_UNVERIFIED; nothing is amended or reset.
test('commit create reports COMMIT_UNVERIFIED when a hook changes the committed set', async (t) => {
  const root = repository(t);
  const before = head(root);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  hook(root, 'pre-commit', 'echo hook >> other.txt\ngit add other.txt');
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } })),
    'COMMIT_UNVERIFIED',
  );
  assert.equal(outcome.commit, head(root));
  assert.notEqual(outcome.commit, before);
  assert.deepEqual(outcome.committed.sort(), ['other.txt', 'tracked.txt']);
  assert.equal(git(root, 'rev-parse', 'HEAD^'), before);
  assert.equal(lockPresent(root), false);
});

// Invariant: a hook that rewrites a listed file and restages it keeps the committed path set intact
// but changes its content; the commit is reported with its SHA as COMMIT_UNVERIFIED naming the
// differing path, and nothing is amended or reset.
test('commit create reports COMMIT_UNVERIFIED when a hook rewrites a listed file', async (t) => {
  const root = repository(t);
  const before = head(root);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const request = input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } });
  hook(root, 'pre-commit', "printf 'rewritten\\n' > tracked.txt\ngit add tracked.txt");
  const outcome = expectOutcome(await commitCreate(request), 'COMMIT_UNVERIFIED');
  assert.equal(outcome.commit, head(root));
  assert.notEqual(outcome.commit, before);
  assert.deepEqual(outcome.differing, ['tracked.txt']);
  assert.equal(git(root, 'rev-parse', 'HEAD^'), before);
  assert.equal(lockPresent(root), false);
});

// Invariant: a deletion expectation (`null`) is verified against the commit's tree; a hook that
// recreates the deleted file with other content is COMMIT_UNVERIFIED naming that path.
test('commit create reports COMMIT_UNVERIFIED when a hook recreates an expected deletion', async (t) => {
  const root = repository(t);
  const before = head(root);
  const request = input(root, { expect: { 'tracked.txt': null } });
  unlinkSync(join(root, 'tracked.txt'));
  hook(root, 'pre-commit', "printf 'recreated\\n' > tracked.txt\ngit add tracked.txt");
  const outcome = expectOutcome(await commitCreate(request), 'COMMIT_UNVERIFIED');
  assert.equal(outcome.commit, head(root));
  assert.notEqual(outcome.commit, before);
  assert.deepEqual(outcome.differing, ['tracked.txt']);
  assert.equal(git(root, 'rev-parse', 'HEAD^'), before);
  assert.equal(lockPresent(root), false);
});

// Invariant: a denied write below `.git` is SANDBOX_DENIED, releases the lock (so it carries
// `lockRelease` but no `heldLock`) and leaves nothing staged; the classifier covers errno and the closed stderr patterns.
test(
  'commit create reports SANDBOX_DENIED for a read-only .git',
  { skip: process.getuid?.() === 0 },
  async (t) => {
    const root = repository(t);
    writeFileSync(join(root, 'tracked.txt'), 'changed\n');
    const request = input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } });
    chmodSync(join(root, '.git'), 0o555);
    let outcome;
    try {
      outcome = expectOutcome(await commitCreate(request), 'SANDBOX_DENIED');
    } finally {
      chmodSync(join(root, '.git'), 0o755);
    }
    assert.equal(outcome.step, 'stage');
    assert.match(outcome.stderr, /index\.lock/);
    assert.equal(outcome.heldLock, undefined, 'a released lock carries no heldLock');
    assert.equal(outcome.lockRelease.released, true);
    assert.equal(lockPresent(root), false);
    assert.deepEqual(staged(root), []);
  },
);

// A runner whose `git commit` fails with a translated stderr no SANDBOX_STDERR_PATTERNS entry
// matches; `onCommit` runs first, `onRestore` before the unstage.
function translatedCommitRunner({ onCommit = () => {}, onRestore = () => {} } = {}) {
  const real = createProcessRunner();
  return async (call) => {
    if (call.args.includes('restore')) onRestore();
    if (call.args[2] !== 'commit') return real(call);
    onCommit();
    return {
      status: 128,
      stdout: Buffer.alloc(0),
      stderr: Buffer.from("fatal: Konnte '.git/index.lock' nicht erstellen: Keine Berechtigung\n"),
    };
  };
}

function probeLeftovers(root) {
  return [join(root, '.git'), join(root, '.git', 'objects')].flatMap((directory) =>
    readdirSync(directory).filter((name) => name.includes('write-probe')),
  );
}

// Invariant: the caller's locale is kept for `git commit`, so a sandbox denial with a translated
// stderr is still SANDBOX_DENIED through the git-dir write probe, which leaves no file behind.
test(
  'commit create classifies a translated denied commit by the git-dir write probe',
  { skip: process.getuid?.() === 0 },
  async (t) => {
    const root = repository(t);
    const before = head(root);
    writeFileSync(join(root, 'tracked.txt'), 'changed\n');
    const gitDir = join(root, '.git');
    const runner = translatedCommitRunner({
      onCommit: () => chmodSync(gitDir, 0o555),
      onRestore: () => chmodSync(gitDir, 0o755),
    });
    let outcome;
    try {
      outcome = expectOutcome(
        await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }), {
          runner,
        }),
        'SANDBOX_DENIED',
      );
    } finally {
      chmodSync(gitDir, 0o755);
    }
    assert.equal(outcome.step, 'commit');
    assert.match(outcome.stderr, /Keine Berechtigung/);
    assert.equal(outcome.unstage, undefined, 'the listed path was unstaged');
    assert.deepEqual(staged(root), []);
    assert.equal(head(root), before);
    assert.equal(lockPresent(root), false);
    assert.deepEqual(probeLeftovers(root), []);
  },
);

// Invariant: a translated commit failure in a writable repository stays COMMIT_FAILED, and the
// probe removes its file from the git dir and the object store.
test('commit create keeps a translated commit failure in a writable git dir COMMIT_FAILED', async (t) => {
  const root = repository(t);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }), {
      runner: translatedCommitRunner(),
    }),
    'COMMIT_FAILED',
  );
  assert.equal(outcome.status, 128);
  assert.deepEqual(staged(root), []);
  assert.deepEqual(probeLeftovers(root), []);
});

// Invariant: the probe classifies EPERM, EACCES and EROFS only, from either probe directory.
test('gitDirWriteDenied classifies a denied exclusive create by errno', async (t) => {
  const root = repository(t);
  const context = (open) => makeContext(deps({ fs: { open } }));
  for (const code of ['EPERM', 'EACCES', 'EROFS']) {
    const open = async () => {
      throw Object.assign(new Error(code), { code });
    };
    assert.equal(await gitDirWriteDenied(context(open), root), true, code);
  }
  const objectsOnly = async (target, ...rest) => {
    if (target.includes(join('.git', 'objects'))) {
      throw Object.assign(new Error('EROFS'), { code: 'EROFS' });
    }
    const { open } = await import('node:fs/promises');
    return open(target, ...rest);
  };
  assert.equal(await gitDirWriteDenied(context(objectsOnly), root), true, 'object store');
  const missing = async () => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  };
  assert.equal(await gitDirWriteDenied(context(missing), root), false);
  assert.deepEqual(probeLeftovers(root), []);
});

test('isSandboxDenial recognises errno and the closed stderr patterns only', () => {
  for (const code of ['EPERM', 'EACCES', 'EROFS']) {
    assert.equal(isSandboxDenial({ status: null, error: { code } }), true, code);
  }
  for (const stderr of [
    "fatal: Unable to create '/w/.git/index.lock': Read-only file system",
    "fatal: Unable to create '/w/.git/worktrees/x/index.lock': Operation not permitted",
    'error: could not lock config file /w/.git/config: Permission denied',
    'error: insufficient permission for adding an object to repository database .git/objects',
    'fatal: unable to create temporary file: Read-only file system',
  ]) {
    assert.equal(isSandboxDenial({ status: 128, stderr }), true, stderr);
  }
  for (const stderr of ['error: pathspec did not match', 'husky - pre-commit hook exited with 1']) {
    assert.equal(isSandboxDenial({ status: 1, stderr }), false, stderr);
  }
  assert.equal(SANDBOX_STDERR_PATTERNS.length, 4);
});

// ---------------------------------------------------------------------------------------------
// Signals

function signalDeps(target, extra = {}) {
  return { signalTarget: target, terminateChildren: terminateActiveProcessGroups, ...extra };
}

// Invariant: a signal before the commit unstages the listed paths, releases the lock and returns
// INTERRUPTED without a SHA; with the lock released it carries `lockRelease` but no `heldLock`.
test('commit create is INTERRUPTED before the commit without a SHA', async (t) => {
  const root = repository(t);
  const before = head(root);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const target = new EventEmitter();
  const outcome = expectOutcome(
    await commitCreate(
      input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
      signalDeps(target, {
        onPhase: (name) => {
          if (name === 'beforeCommit') target.emit('SIGTERM');
        },
      }),
    ),
    'INTERRUPTED',
  );
  assert.equal(outcome.signal, 'SIGTERM');
  assert.equal(outcome.commit, null);
  assert.equal(outcome.heldLock, undefined, 'a released lock carries no heldLock');
  assert.equal(outcome.lockRelease.released, true);
  assert.equal(head(root), before);
  assert.deepEqual(staged(root), []);
  assert.equal(lockPresent(root), false);
  for (const signal of COMMIT_SIGNALS) assert.equal(target.listenerCount(signal), 0);
});

// Invariant: a signal while a hook runs stops the Git child; when the commit has not landed the
// listed paths are unstaged and INTERRUPTED carries no SHA.
test('commit create is INTERRUPTED during a running pre-commit hook', async (t) => {
  const root = repository(t);
  const before = head(root);
  const marker = join(root, '.effective-flow', 'hook-started');
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  hook(root, 'pre-commit', `touch '${marker}'\nsleep 30`);
  const target = new EventEmitter();
  const pending = commitCreate(
    input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
    signalDeps(target),
  );
  await waitForFile(marker);
  target.emit('SIGTERM');
  const outcome = expectOutcome(await pending, 'INTERRUPTED');
  assert.equal(outcome.commit, null);
  assert.equal(head(root), before);
  assert.deepEqual(staged(root), []);
  assert.equal(lockPresent(root), false);
});

// Invariant: a signal after the commit landed (a running post-commit hook) returns INTERRUPTED
// with the SHA, unstages nothing and releases the lock.
test('commit create is INTERRUPTED with the SHA when the commit landed', async (t) => {
  const root = repository(t);
  const before = head(root);
  const marker = join(root, '.effective-flow', 'post-commit-started');
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  hook(root, 'post-commit', `touch '${marker}'\nsleep 30`);
  const target = new EventEmitter();
  const pending = commitCreate(
    input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
    signalDeps(target),
  );
  await waitForFile(marker);
  target.emit('SIGHUP');
  const outcome = expectOutcome(await pending, 'INTERRUPTED');
  assert.equal(outcome.signal, 'SIGHUP');
  assert.equal(outcome.commit, head(root));
  assert.notEqual(outcome.commit, before);
  assert.equal(outcome.unstage, undefined);
  assert.equal(lockPresent(root), false);
});

// A runner that emits `signal` on `target` the first time a Git call matches `predicate`.
function signallingRunner(target, signal, predicate) {
  const runner = createProcessRunner();
  let sent = false;
  return (request) => {
    if (!sent && predicate(request.args)) {
      sent = true;
      target.emit(signal);
    }
    return runner(request);
  };
}

// Invariant: a signal during the pre-lock hook trust check returns INTERRUPTED without taking the
// lock or staging anything.
test('commit create is INTERRUPTED by a signal before the lock', async (t) => {
  const root = repository(t);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const target = new EventEmitter();
  const outcome = expectOutcome(
    await commitCreate(
      input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
      signalDeps(target, {
        runner: signallingRunner(target, 'SIGINT', (args) => args.includes('--others')),
      }),
    ),
    'INTERRUPTED',
  );
  assert.equal(outcome.signal, 'SIGINT');
  assert.equal(outcome.commit, null);
  assert.equal(outcome.heldLock, undefined);
  assert.equal(lockPresent(root), false);
  assert.deepEqual(staged(root), []);
});

// Invariant: a signal during the wait for a held lock ends the wait promptly as INTERRUPTED and
// leaves the foreign lock in place.
test('commit create is INTERRUPTED by a signal during the lock wait', async (t) => {
  const root = repository(t);
  const held = await executeOperation(
    'lock acquire',
    { cwd: root, lock: 'iterate-commit', owner: { ...OWNER, item: 'PRRT_other' } },
    deps(),
  );
  assert.equal(held.ok, true, JSON.stringify(held));
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const target = new EventEmitter();
  const started = Date.now();
  const pending = commitCreate(
    input(root, { waitSeconds: 30, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
    signalDeps(target),
  );
  await delay(300);
  target.emit('SIGTERM');
  const outcome = expectOutcome(await pending, 'INTERRUPTED');
  assert.ok(Date.now() - started < 10_000, 'the wait ends at the signal');
  assert.equal(outcome.commit, null);
  assert.equal(lockPresent(root), true, 'the foreign lock stays');
  assert.deepEqual(staged(root), []);
});

// A `.gitattributes` routing `*.bin` through the clean filter `slow`, and a definition of `slow`
// that marks its start in an ignored file and then stalls, as a hung Git LFS filter would. A
// filter driver without a definition is ignored, so `defineSlowFilter` may follow later.
function slowFilterAttributes(root) {
  writeFileSync(join(root, '.gitattributes'), '*.bin filter=slow\n');
}

function defineSlowFilter(root) {
  const marker = join(root, 'filter-started.log');
  git(root, 'config', 'filter.slow.clean', `touch '${marker}'; sleep 30`);
  return marker;
}

// Invariant: every call that can run a clean filter, the staging and each working-tree
// comparison of the trust check, runs in its own process group under a bound, so a signal or the
// bound reaches the filter; tree-to-tree and index comparisons, which run none, stay unbounded.
test('commit create bounds the filter-running Git calls in process groups', async (t) => {
  const root = repository(t);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const calls = [];
  const real = createProcessRunner();
  expectResult(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }), {
      runner: (request) => {
        calls.push(request);
        return real(request);
      },
    }),
  );
  const isAdd = (args) => args.includes('add');
  const isWorkingTreeDiff = (args) =>
    args.includes('diff') && args.at(-2) === 'HEAD' && args.at(-3) === '-z';
  const filtering = calls.filter(({ args }) => isAdd(args) || isWorkingTreeDiff(args));
  assert.equal(filtering.filter(({ args }) => isAdd(args)).length, 1);
  assert.equal(filtering.filter(({ args }) => isWorkingTreeDiff(args)).length, 3);
  for (const call of filtering) {
    assert.equal(call.processGroup, true, call.args.join(' '));
    assert.ok(call.timeoutMs > 0 && call.timeoutMs <= FILTER_BUDGET_MS, call.args.join(' '));
  }
  const cached = calls.find(({ args }) => args.includes('--cached'));
  assert.equal(cached.processGroup, undefined);
});

// Invariant: a signal while `git add` waits on a stalled clean filter stops the filter's group,
// so the call returns INTERRUPTED without a SHA, the listed paths unstaged, the lock released.
test('commit create is INTERRUPTED during a stalled clean filter in git add', async (t) => {
  const root = repository(t);
  const before = head(root);
  writeFileSync(join(root, 'data.bin'), 'payload\n');
  const expected = blob(root, 'data.bin');
  slowFilterAttributes(root);
  const marker = defineSlowFilter(root);
  const target = new EventEmitter();
  const started = Date.now();
  const pending = commitCreate(
    input(root, { paths: ['data.bin'], expect: { 'data.bin': expected } }),
    signalDeps(target),
  );
  await waitForFile(marker);
  target.emit('SIGTERM');
  const outcome = expectOutcome(await pending, 'INTERRUPTED');
  assert.ok(Date.now() - started < 10_000, 'the signal stops the stalled filter');
  assert.equal(outcome.signal, 'SIGTERM');
  assert.equal(outcome.commit, null);
  assert.equal(outcome.lockRelease.released, true);
  assert.equal(head(root), before);
  assert.deepEqual(staged(root), []);
  assert.equal(lockPresent(root), false);
});

// Invariant: a signal while the trust check's working-tree comparison waits on a stalled clean
// filter under the lock returns INTERRUPTED, not GIT_FAILED, and releases the lock.
test('commit create is INTERRUPTED during a stalled clean filter in the trust check', async (t) => {
  const root = repository(t);
  slowFilterAttributes(root);
  writeFileSync(join(root, 'data.bin'), 'payload\n');
  git(root, 'add', '.gitattributes', 'data.bin');
  git(root, 'commit', '-q', '-m', 'filtered fixture');
  const before = head(root);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  let marker;
  const target = new EventEmitter();
  const started = Date.now();
  const pending = commitCreate(
    input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
    signalDeps(target, {
      // Defined only under the lock, so the comparison before the lock runs no filter.
      onPhase: (phase) => {
        if (phase !== 'locked') return;
        marker = defineSlowFilter(root);
        writeFileSync(join(root, 'data.bin'), 'changed payload\n');
      },
    }),
  );
  while (marker === undefined) await delay(10);
  await waitForFile(marker);
  target.emit('SIGINT');
  const outcome = expectOutcome(await pending, 'INTERRUPTED');
  assert.ok(Date.now() - started < 10_000, 'the signal stops the stalled filter');
  assert.equal(outcome.signal, 'SIGINT');
  assert.equal(outcome.commit, null);
  assert.equal(outcome.lockRelease.released, true);
  assert.equal(head(root), before);
  assert.deepEqual(staged(root), []);
  assert.equal(lockPresent(root), false);
});

// Invariant: a `git add` whose clean filter outlasts FILTER_BUDGET_MS fails closed as
// STAGE_FAILED with `timedOut: true`, nothing staged or committed and the lock released.
test('commit create reports STAGE_FAILED when a clean filter exceeds its bound', async (t) => {
  const root = repository(t);
  const before = head(root);
  writeFileSync(join(root, 'data.bin'), 'payload\n');
  const expected = blob(root, 'data.bin');
  slowFilterAttributes(root);
  defineSlowFilter(root);
  const outcome = expectOutcome(
    await commitCreate(input(root, { paths: ['data.bin'], expect: { 'data.bin': expected } }), {
      filterBudgetMs: 1000,
    }),
    'STAGE_FAILED',
  );
  assert.equal(outcome.timedOut, true);
  assert.equal(head(root), before);
  assert.deepEqual(staged(root), []);
  assert.equal(lockPresent(root), false);
});

// Invariant: a lock wait whose clock already reads +Infinity when the deadline is taken (a signal
// before the wait) ends after one attempt instead of spinning on a NaN remainder.
test('acquireOwned ends a wait whose clock jumped before the deadline', async (t) => {
  const root = repository(t);
  const held = await executeOperation(
    'lock acquire',
    { cwd: root, lock: 'iterate-commit', owner: OWNER },
    deps(),
  );
  assert.equal(held.ok, true, JSON.stringify(held));
  const context = makeContext(deps());
  await resolveRoot(context, root);
  let sleeps = 0;
  const outcome = await acquireOwned(context, 'iterate-commit', OWNER, 60, {
    ...deps(),
    monotonicNow: () => Number.POSITIVE_INFINITY,
    sleep: async () => {
      sleeps += 1;
      if (sleeps > 5) throw new Error('the wait did not end');
    },
  });
  assert.equal(outcome.code, 'LOCK_HELD');
  assert.equal(outcome.details.attempts, 1);
  assert.equal(sleeps, 0);
});

// ---------------------------------------------------------------------------------------------
// Lock

// Invariant: a held lock is LOCK_HELD with the same owner and identity details as `lock acquire`.
test('commit create reports LOCK_HELD with owner and identity details', async (t) => {
  const root = repository(t);
  const held = await executeOperation(
    'lock acquire',
    { cwd: root, lock: 'iterate-commit', owner: { ...OWNER, item: 'PRRT_other' } },
    deps(),
  );
  assert.equal(held.ok, true, JSON.stringify(held));
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const outcome = expectOutcome(
    await commitCreate(
      input(root, { waitSeconds: 0, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
    ),
    'LOCK_HELD',
  );
  assert.equal(outcome.lock, 'iterate-commit');
  assert.equal(outcome.owner.state, 'valid');
  assert.equal(outcome.owner.fields.item, 'PRRT_other');
  assert.deepEqual(Object.keys(outcome.identity).sort(), ['dev', 'ino', 'mtimeNs']);
  assert.deepEqual(staged(root), []);
  assert.equal(lockPresent(root), true, 'the foreign lock stays');
});

// Invariant: when the internal release fails after a successful commit, the result still carries
// the SHA plus the lock identity and token, and a later `lock release` with that token succeeds.
test('commit create returns the token when the release fails after the commit', async (t) => {
  const root = repository(t);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const failingRename = {
    rename: async () => {
      throw Object.assign(new Error('injected EACCES'), { code: 'EACCES' });
    },
  };
  const result = expectResult(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }), {
      fs: failingRename,
    }),
  );
  assert.equal(result.commit, head(root));
  assert.equal(result.lockRelease.released, false);
  assert.match(result.heldLock.token, /^[0-9a-f]{32}$/);
  assert.equal(result.heldLock.path, join(root, ...LOCK_DIR));
  assert.deepEqual(Object.keys(result.heldLock.identity).sort(), ['dev', 'ino', 'mtimeNs']);
  assert.equal(lockPresent(root), true);
  const released = await executeOperation(
    'lock release',
    { cwd: root, lock: 'iterate-commit', token: result.heldLock.token },
    deps(),
  );
  assert.equal(released.ok, true, JSON.stringify(released));
  assert.equal(lockPresent(root), false);
});

// Invariant: an unexpected error under the lock whose internal release also failed carries
// `heldLock` and `lockRelease` in its `error` object, so the one `lock release` retry has a token.
test('commit create carries heldLock on an error envelope when the release fails', async (t) => {
  const root = repository(t);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const real = createProcessRunner();
  const runner = async (call) => {
    // The staged-set read under the lock, not the trust check's `ls-files --cached` before it.
    if (call.args.includes('diff') && call.args.includes('--cached')) {
      throw new TypeError('injected runner failure');
    }
    return real(call);
  };
  const envelope = await commitCreate(
    input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
    {
      runner,
      fs: {
        rename: async () => {
          throw Object.assign(new Error('injected EACCES'), { code: 'EACCES' });
        },
      },
    },
  );
  assert.equal(envelope.ok, false, JSON.stringify(envelope));
  assert.equal(envelope.outcome, undefined);
  assert.equal(envelope.error.code, 'INTERNAL_ERROR');
  assert.match(envelope.error.message, /injected runner failure; lock release failed/);
  assert.equal(envelope.error.lockRelease.released, false);
  assert.match(envelope.error.heldLock.token, /^[0-9a-f]{32}$/);
  assert.equal(envelope.error.heldLock.lock, 'iterate-commit');
  assert.equal(envelope.error.heldLock.path, join(root, ...LOCK_DIR));
  assert.deepEqual(Object.keys(envelope.error.heldLock.identity).sort(), ['dev', 'ino', 'mtimeNs']);
  assert.equal(lockPresent(root), true);
  const released = await executeOperation(
    'lock release',
    { cwd: root, lock: 'iterate-commit', token: envelope.error.heldLock.token },
    deps(),
  );
  assert.equal(released.ok, true, JSON.stringify(released));
  assert.equal(lockPresent(root), false);
});

// Invariant: an error whose release succeeded carries no `heldLock`.
test('commit create carries no heldLock on an error envelope after a clean release', async (t) => {
  const root = repository(t);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const real = createProcessRunner();
  const runner = async (call) => {
    if (call.args.includes('diff') && call.args.includes('--cached')) {
      throw new TypeError('injected runner failure');
    }
    return real(call);
  };
  const envelope = await commitCreate(
    input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
    { runner },
  );
  assert.equal(envelope.error.code, 'INTERNAL_ERROR', JSON.stringify(envelope));
  assert.equal(envelope.error.heldLock, undefined);
  assert.equal(envelope.error.lockRelease, undefined);
  assert.equal(lockPresent(root), false);
});

// ---------------------------------------------------------------------------------------------
// Commit environment and recovery

// Invariant: the commit runs with the caller's Git environment, so `GIT_CONFIG_*` identity reaches
// it; only repository-redirecting variables are removed and no locale is forced.
test('gitCommitEnv keeps configuration and locale and strips only repository redirects', () => {
  const env = gitCommitEnv({
    LANG: 'de_DE.UTF-8',
    LC_ALL: 'de_DE.UTF-8',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'user.signingkey',
    GIT_CONFIG_VALUE_0: 'ABC',
    GIT_CONFIG_PARAMETERS: "'commit.gpgsign'='true'",
    GIT_DIR: '/elsewhere/.git',
    GIT_WORK_TREE: '/elsewhere',
    GIT_INDEX_FILE: '/elsewhere/index',
    GIT_OBJECT_DIRECTORY: '/elsewhere/objects',
    GIT_ALTERNATE_OBJECT_DIRECTORIES: '/elsewhere/alt',
    GIT_COMMON_DIR: '/elsewhere/common',
    GIT_NAMESPACE: 'other',
  });
  assert.equal(env.LANG, 'de_DE.UTF-8');
  assert.equal(env.LC_ALL, 'de_DE.UTF-8');
  assert.equal(env.GIT_CONFIG_COUNT, '1');
  assert.equal(env.GIT_CONFIG_KEY_0, 'user.signingkey');
  assert.equal(env.GIT_CONFIG_VALUE_0, 'ABC');
  assert.equal(env.GIT_CONFIG_PARAMETERS, "'commit.gpgsign'='true'");
  assert.equal(env.GIT_OPTIONAL_LOCKS, undefined);
  for (const key of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_COMMON_DIR',
    'GIT_NAMESPACE',
  ]) {
    assert.equal(Object.hasOwn(env, key), false, key);
  }
});

test(
  'commit create uses identity from GIT_CONFIG_COUNT for the commit',
  { skip: ['GIT_AUTHOR_NAME', 'GIT_COMMITTER_NAME'].some((key) => key in process.env) },
  async (t) => {
    const root = repository(t);
    writeFileSync(join(root, 'tracked.txt'), 'changed\n');
    const env = { ...GIT_ENV };
    for (const key of [
      'GIT_AUTHOR_NAME',
      'GIT_AUTHOR_EMAIL',
      'GIT_COMMITTER_NAME',
      'GIT_COMMITTER_EMAIL',
    ]) {
      delete env[key];
    }
    Object.assign(env, {
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'user.name',
      GIT_CONFIG_VALUE_0: 'Config Count Identity',
      GIT_CONFIG_KEY_1: 'user.email',
      GIT_CONFIG_VALUE_1: 'config-count@example.invalid',
    });
    const result = expectResult(
      await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }), {
        env,
      }),
    );
    assert.equal(result.commit, head(root));
    assert.equal(
      git(root, 'log', '-1', '--format=%an <%ae>'),
      'Config Count Identity <config-count@example.invalid>',
    );
  },
);

// A runner that fails the first Git call matching `predicate` with status 128.
function failingRunner(predicate) {
  const runner = createProcessRunner();
  let failed = false;
  return async (request) => {
    if (!failed && predicate(request.args)) {
      failed = true;
      return { status: 128, stdout: Buffer.alloc(0), stderr: Buffer.from('fatal: injected\n') };
    }
    return runner(request);
  };
}

// Invariant: an unexpected Git failure after staging, before the commit, unstages exactly the
// listed paths, releases the lock and propagates as an error.
test('commit create unstages the listed paths on an unexpected failure after staging', async (t) => {
  const root = repository(t);
  const before = head(root);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const envelope = await commitCreate(
    input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
    { runner: failingRunner((args) => args.includes('ls-files') && args.includes('--stage')) },
  );
  assert.equal(envelope.ok, false, JSON.stringify(envelope));
  assert.equal(envelope.error?.code, 'GIT_FAILED', JSON.stringify(envelope));
  assert.equal(head(root), before);
  assert.deepEqual(staged(root), []);
  assert.equal(lockPresent(root), false);
});

// Invariant: an unexpected Git failure in verification after the commit landed is
// COMMIT_UNVERIFIED carrying the SHA, never an error without it.
test('commit create returns the SHA when verification fails after the commit', async (t) => {
  const root = repository(t);
  const before = head(root);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  // The hook trust check diffs against the same base, so only a diff after the commit fails.
  let committed = false;
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }), {
      runner: failingRunner((args) => {
        if (args.includes('commit')) committed = true;
        return committed && args.includes('diff') && !args.includes('--cached');
      }),
    }),
    'COMMIT_UNVERIFIED',
  );
  assert.equal(outcome.commit, head(root));
  assert.notEqual(outcome.commit, before);
  assert.equal(outcome.expectedParent, before);
  assert.equal(outcome.error.code, 'GIT_FAILED');
  assert.equal(lockPresent(root), false);
});

// What `husky` 9.1.7 writes into `.husky/_/` on install, byte for byte: `h` is the package's
// `husky` file, every hook name gets the wrapper, `husky.sh` the deprecation notice.
const HUSKY_9_1_7 = Object.freeze({
  h: [
    '#!/usr/bin/env sh',
    '[ "$HUSKY" = "2" ] && set -x',
    'n=$(basename "$0")',
    's=$(dirname "$(dirname "$0")")/$n',
    '',
    '[ ! -f "$s" ] && exit 0',
    '',
    'if [ -f "$HOME/.huskyrc" ]; then',
    '\techo "husky - \'~/.huskyrc\' is DEPRECATED, please move your code to ~/.config/husky/init.sh"',
    'fi',
    'i="${XDG_CONFIG_HOME:-$HOME/.config}/husky/init.sh"',
    '[ -f "$i" ] && . "$i"',
    '',
    '[ "${HUSKY-}" = "0" ] && exit 0',
    '',
    'export PATH="node_modules/.bin:$PATH"',
    'sh -e "$s" "$@"',
    'c=$?',
    '',
    '[ $c != 0 ] && echo "husky - $n script failed (code $c)"',
    '[ $c = 127 ] && echo "husky - command not found in PATH=$PATH"',
    'exit $c',
    '',
  ].join('\n'),
  wrapper: '#!/usr/bin/env sh\n. "$(dirname "$0")/h"',
  huskySh:
    'echo "husky - DEPRECATED\n\nPlease remove the following two lines from $0:\n\n#!/usr/bin/env sh\n. \\"\\$(dirname -- \\"\\$0\\")/_/husky.sh\\"\n\nThey WILL FAIL in v10.0.0\n"',
  hooks: ['pre-commit', 'pre-merge-commit', 'commit-msg', 'post-commit', 'pre-push'],
});

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

// Installs husky 9.1.7's generated `.husky/_/` as `husky` does, `core.hooksPath` included, with
// the tracked `.husky/pre-commit` it runs.
function installHusky(t, root) {
  mkdirSync(join(root, '.husky', '_'), { recursive: true });
  writeFileSync(join(root, '.husky', 'pre-commit'), 'exit 0\n');
  git(root, 'add', '.husky/pre-commit');
  git(root, 'commit', '-q', '-m', 'husky');
  git(root, 'config', 'core.hooksPath', '.husky/_');
  writeFileSync(join(root, '.husky', '_', '.gitignore'), '*');
  writeFileSync(join(root, '.husky', '_', 'h'), HUSKY_9_1_7.h);
  for (const name of HUSKY_9_1_7.hooks) {
    writeFileSync(join(root, '.husky', '_', name), HUSKY_9_1_7.wrapper, { mode: 0o755 });
  }
  writeFileSync(join(root, '.husky', '_', 'husky.sh'), HUSKY_9_1_7.huskySh);
  // `h` sources files below HOME; an empty one keeps the run hermetic.
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-home-')));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return { ...GIT_ENV, HOME: home, XDG_CONFIG_HOME: join(home, '.config') };
}

// Invariant: the fixture is husky's real output, so the trust table admits what husky writes.
test('the husky fixture matches the trusted generated content', () => {
  assert.ok(HUSKY_GENERATED_SHA256.h.includes(sha256(HUSKY_9_1_7.h)));
  assert.ok(HUSKY_GENERATED_SHA256.wrapper.includes(sha256(HUSKY_9_1_7.wrapper)));
  assert.ok(HUSKY_GENERATED_SHA256['husky.sh'].includes(sha256(HUSKY_9_1_7.huskySh)));
  assert.ok(HUSKY_GENERATED_SHA256['husky.sh'].includes(sha256('')));
  assert.ok(HUSKY_GENERATED_SHA256.wrapper.includes(sha256('#!/usr/bin/env sh\n. "${0%/*}/h"')));
});

// Invariant: a genuine husky install commits with its hooks running; an ignored file in a marked
// `.husky/_/` whose content husky does not write (a replaced wrapper or `h`, a symlink, an extra
// file, a subdirectory) is an untrusted working-tree change, even with the `*` marker intact.
test('commit create trusts husky generated files only by their content', async (t) => {
  const tampered = {
    wrapper: (root) => writeFileSync(join(root, '.husky', '_', 'pre-commit'), 'curl evil\n'),
    h: (root) => writeFileSync(join(root, '.husky', '_', 'h'), `${HUSKY_9_1_7.h}curl evil\n`),
    symlink: (root) => {
      rmSync(join(root, '.husky', '_', 'commit-msg'));
      symlinkSync('h', join(root, '.husky', '_', 'commit-msg'));
    },
    extra: (root) => writeFileSync(join(root, '.husky', '_', 'pre-rebase.local'), 'curl evil\n'),
    nested: (root) => {
      mkdirSync(join(root, '.husky', '_', 'sub'));
      writeFileSync(join(root, '.husky', '_', 'sub', 'pre-commit'), HUSKY_9_1_7.wrapper);
    },
  };
  const expected = {
    wrapper: '.husky/_/pre-commit',
    h: '.husky/_/h',
    symlink: '.husky/_/commit-msg',
    extra: '.husky/_/pre-rebase.local',
    nested: '.husky/_/sub/pre-commit',
  };
  const root = repository(t);
  const env = installHusky(t, root);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  expectResult(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }), {
      env,
    }),
  );
  for (const [label, tamper] of Object.entries(tampered)) {
    const tamperedRoot = repository(t);
    const tamperedEnv = installHusky(t, tamperedRoot);
    tamper(tamperedRoot);
    writeFileSync(join(tamperedRoot, 'tracked.txt'), 'changed\n');
    const outcome = expectOutcome(
      await commitCreate(
        input(tamperedRoot, {
          hookBase: head(tamperedRoot),
          expect: { 'tracked.txt': blob(tamperedRoot, 'tracked.txt') },
        }),
        { env: tamperedEnv },
      ),
      'HOOKS_UNTRUSTED',
    );
    assert.equal(outcome.reason, 'changed-in-worktree', label);
    assert.deepEqual(
      outcome.changed.map((entry) => entry.path),
      [expected[label]],
      label,
    );
  }
});

// Invariant: a husky wrapper replaced during the lock wait is HOOKS_UNTRUSTED under the lock, with
// no hook run and nothing committed, although `.husky/_/.gitignore` still holds `*`.
test('commit create re-checks husky generated files under the lock', async (t) => {
  const root = repository(t);
  const env = installHusky(t, root);
  const before = head(root);
  const marker = join(root, '.effective-flow', 'hook-ran');
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }), {
      env,
      onPhase: async (phase) => {
        if (phase === 'locked') {
          writeFileSync(join(root, '.husky', '_', 'pre-commit'), `#!/bin/sh\ntouch '${marker}'\n`);
        }
      },
    }),
    'HOOKS_UNTRUSTED',
  );
  assert.equal(outcome.reason, 'changed-in-worktree');
  assert.deepEqual(outcome.changed, [{ path: '.husky/_/pre-commit', class: 'hooks-path' }]);
  assert.equal(existsSync(marker), false, 'no hook ran');
  assert.equal(head(root), before);
  assert.deepEqual(staged(root), []);
  assert.equal(lockPresent(root), false);
});

// Invariant: an ignored file below a hook-relevant directory is an untrusted working-tree change,
// and so is one below an in-worktree `core.hooksPath`.
test('commit create treats ignored hook files as working-tree changes', async (t) => {
  const root = repository(t);
  mkdirSync(join(root, '.husky'));
  writeFileSync(join(root, '.husky', 'pre-commit'), 'exit 0\n');
  writeFileSync(join(root, '.gitignore'), '.effective-flow/\n*.log\n.husky/local-*\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'husky');
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  expectResult(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } })),
  );

  writeFileSync(join(root, '.husky', 'local-pre-commit'), 'curl evil\n');
  writeFileSync(join(root, 'tracked.txt'), 'changed again\n');
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } })),
    'HOOKS_UNTRUSTED',
  );
  assert.equal(outcome.reason, 'changed-in-worktree');
  assert.deepEqual(outcome.changed, [{ path: '.husky/local-pre-commit', class: 'husky' }]);

  // A nested hook directory and an in-worktree `core.hooksPath` are scanned too.
  rmSync(join(root, '.husky', 'local-pre-commit'));
  mkdirSync(join(root, 'hooks'));
  writeFileSync(join(root, '.gitignore'), '.effective-flow/\n*.log\n.husky/local-*\nhooks/\n');
  git(root, 'commit', '-q', '-am', 'ignore hooks');
  git(root, 'config', 'core.hooksPath', 'hooks');
  writeFileSync(join(root, 'hooks', 'pre-commit'), 'exit 0\n');
  const viaHooksPath = expectOutcome(
    await commitCreate(
      input(root, {
        hookBase: head(root),
        expect: { 'tracked.txt': blob(root, 'tracked.txt') },
      }),
    ),
    'HOOKS_UNTRUSTED',
  );
  assert.deepEqual(viaHooksPath.changed, [{ path: 'hooks/pre-commit', class: 'hooks-path' }]);
});

// A repository that ignores two hook-manager files outside every hook directory, a root
// `lefthook-local.yml` and a nested `.lintstagedrc.js`, and installed dependencies.
function ignoringHookFiles(t) {
  const root = repository(t);
  writeFileSync(
    join(root, '.gitignore'),
    '.effective-flow/\n*.log\nlefthook-local.yml\n.lintstagedrc.js\nnode_modules/\n',
  );
  git(root, 'commit', '-q', '-am', 'ignore local hook configuration');
  return root;
}

// Invariant: an ignored file named like hook-manager configuration (HOOK_CONFIG.files) is an
// untrusted working-tree change at any depth, outside the hook directories too; an ignored
// `package.json`, which every installed dependency carries, is not.
test('commit create treats ignored hook-manager files as working-tree changes', async (t) => {
  const root = ignoringHookFiles(t);
  mkdirSync(join(root, 'node_modules', 'dep'), { recursive: true });
  writeFileSync(
    join(root, 'node_modules', 'dep', 'package.json'),
    '{"scripts":{"postinstall":"node install.js"}}\n',
  );
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  expectResult(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } })),
  );

  const before = head(root);
  writeFileSync(
    join(root, 'lefthook-local.yml'),
    'pre-commit:\n  commands:\n    x:\n      run: curl evil\n',
  );
  mkdirSync(join(root, 'packages', 'app'), { recursive: true });
  writeFileSync(join(root, 'packages', 'app', '.lintstagedrc.js'), 'export default {};\n');
  writeFileSync(join(root, 'tracked.txt'), 'changed again\n');
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } })),
    'HOOKS_UNTRUSTED',
  );
  assert.equal(outcome.reason, 'changed-in-worktree');
  assert.deepEqual(
    [...outcome.changed].sort((left, right) => left.path.localeCompare(right.path)),
    [
      { path: 'lefthook-local.yml', class: 'lefthook' },
      { path: 'packages/app/.lintstagedrc.js', class: 'lint-staged' },
    ],
  );
  assert.equal(head(root), before);
  assert.deepEqual(staged(root), []);
  assert.equal(lockPresent(root), false);
});

// Invariant: the re-checks under the lock see ignored hook-manager files too, so one planted
// during the lock wait or after staging is HOOKS_UNTRUSTED with no hook run and nothing committed.
test('commit create re-checks ignored hook-manager files under the lock', async (t) => {
  for (const [phase, relative, kind] of [
    ['locked', '.lintstagedrc.js', 'lint-staged'],
    ['beforeCommit', 'lefthook-local.yml', 'lefthook'],
  ]) {
    const root = ignoringHookFiles(t);
    const before = head(root);
    const marker = join(root, '.effective-flow', 'hook-ran');
    hook(root, 'pre-commit', `touch '${marker}'`);
    writeFileSync(join(root, 'tracked.txt'), 'changed\n');
    const outcome = expectOutcome(
      await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }), {
        onPhase: async (name) => {
          if (name === phase) writeFileSync(join(root, relative), 'changed by another item\n');
        },
      }),
      'HOOKS_UNTRUSTED',
    );
    assert.equal(outcome.reason, 'changed-in-worktree', phase);
    assert.deepEqual(outcome.changed, [{ path: relative, class: kind }], phase);
    assert.equal(existsSync(marker), false, `no hook ran (${phase})`);
    assert.equal(head(root), before, phase);
    assert.deepEqual(staged(root), [], phase);
    assert.equal(lockPresent(root), false, phase);
  }
});

// Writes an untracked `.husky/pre-commit` into the worktree, as a hook-configuration change made
// while `commit create` already waits on or holds the lock.
function plantHusky(root) {
  mkdirSync(join(root, '.husky'), { recursive: true });
  writeFileSync(join(root, '.husky', 'pre-commit'), 'exit 0\n');
}

// Invariant: hook trust is re-checked right after the lock is acquired, so a hook-configuration
// change made during the lock wait is HOOKS_UNTRUSTED with nothing staged, committed or locked.
test('commit create re-checks hook trust after acquiring the lock', async (t) => {
  const root = repository(t);
  const before = head(root);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }), {
      onPhase: async (phase) => {
        if (phase === 'locked') plantHusky(root);
      },
    }),
    'HOOKS_UNTRUSTED',
  );
  assert.equal(outcome.reason, 'changed-in-worktree');
  assert.deepEqual(outcome.changed, [{ path: '.husky/pre-commit', class: 'husky' }]);
  assert.equal(head(root), before);
  assert.deepEqual(staged(root), []);
  assert.equal(lockPresent(root), false);
});

// Invariant: hook trust is re-checked immediately before `git commit`; a change made after staging
// is HOOKS_UNTRUSTED, unstages the listed paths, runs no hook and releases the lock.
test('commit create re-checks hook trust immediately before the commit', async (t) => {
  const root = repository(t);
  const before = head(root);
  const marker = join(root, '.effective-flow', 'hook-ran');
  hook(root, 'pre-commit', `touch '${marker}'`);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }), {
      onPhase: async (phase) => {
        if (phase === 'beforeCommit') plantHusky(root);
      },
    }),
    'HOOKS_UNTRUSTED',
  );
  assert.equal(outcome.reason, 'changed-in-worktree');
  assert.deepEqual(outcome.changed, [{ path: '.husky/pre-commit', class: 'husky' }]);
  assert.equal(existsSync(marker), false, 'no hook ran');
  assert.equal(head(root), before);
  assert.deepEqual(staged(root), []);
  assert.equal(lockPresent(root), false);
});

// Invariant: a `core.hooksPath` selected through the commit's environment (GIT_CONFIG_COUNT) is
// read by the trust check, so an in-worktree hooks directory it names is untrusted.
test('commit create judges a core.hooksPath supplied through the environment', async (t) => {
  const root = repository(t);
  const before = head(root);
  const marker = join(root, '.effective-flow', 'hook-ran');
  mkdirSync(join(root, 'custom-hooks'));
  const target = join(root, 'custom-hooks', 'pre-commit');
  writeFileSync(target, `#!/bin/sh\ntouch '${marker}'\n`);
  chmodSync(target, 0o755);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }), {
      env: {
        ...GIT_ENV,
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'core.hooksPath',
        GIT_CONFIG_VALUE_0: 'custom-hooks',
      },
    }),
    'HOOKS_UNTRUSTED',
  );
  assert.equal(outcome.reason, 'changed-in-worktree');
  assert.deepEqual(outcome.changed, [{ path: 'custom-hooks/pre-commit', class: 'hooks-path' }]);
  assert.equal(existsSync(marker), false, 'no hook ran');
  assert.equal(head(root), before);
  assert.equal(lockPresent(root), false);
});

// Writes an executable hook script that touches `marker` when it runs.
function hookScript(target, marker) {
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, `#!/bin/sh\ntouch '${marker}'\n`);
  chmodSync(target, 0o755);
}

// Invariant: a hook file that is a symlink makes its in-worktree target hook configuration of the
// same class, so a change to the target, committed against the base or made in the working tree,
// is HOOKS_UNTRUSTED with no hook run; this holds in an in-worktree `core.hooksPath`, in `.husky/`
// and in the default `.git/hooks`.
test('commit create compares the in-worktree targets of hook symlinks', async (t) => {
  const layouts = [
    [
      'hooks-path',
      'hooks/pre-commit',
      '../scripts/run-hook',
      (root) => git(root, 'config', 'core.hooksPath', 'hooks'),
    ],
    ['husky', '.husky/pre-commit', '../scripts/run-hook', () => {}],
    ['hooks-path', '.git/hooks/pre-commit', '../../scripts/run-hook', () => {}],
  ];
  for (const [kind, link, target, configure] of layouts) {
    for (const where of ['against-base', 'in-worktree']) {
      const label = `${link} ${where}`;
      const root = repository(t);
      const marker = join(root, '.effective-flow', 'hook-ran');
      hookScript(join(root, 'scripts', 'run-hook'), join(root, '.effective-flow', 'unrelated'));
      mkdirSync(join(root, link, '..'), { recursive: true });
      symlinkSync(target, join(root, link));
      git(root, 'add', '--', 'scripts/run-hook', ...(link.startsWith('.git/') ? [] : [link]));
      git(root, 'commit', '-q', '--no-verify', '-m', 'linked hook');
      configure(root);
      const base = head(root);
      hookScript(join(root, 'scripts', 'run-hook'), marker);
      if (where === 'against-base') {
        git(root, 'commit', '-q', '--no-verify', '-am', 'change the hook target');
      }
      writeFileSync(join(root, 'tracked.txt'), 'changed\n');
      const before = head(root);
      const outcome = expectOutcome(
        await commitCreate(
          input(root, { hookBase: base, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
        ),
        'HOOKS_UNTRUSTED',
      );
      assert.equal(outcome.reason, `changed-${where}`, label);
      assert.deepEqual(outcome.changed, [{ path: 'scripts/run-hook', class: kind }], label);
      assert.equal(existsSync(marker), false, `no hook ran (${label})`);
      assert.equal(head(root), before, label);
      assert.equal(lockPresent(root), false, label);
    }
  }
});

// Invariant: every in-worktree symlink on the way from a hook symlink to its target, a chained link
// or a symlinked directory, is hook configuration of the hook's class, so retargeting only that
// intermediate link, against the base or in the working tree, is HOOKS_UNTRUSTED with no hook run;
// this holds in an in-worktree `core.hooksPath`, in `.husky/` and in the default `.git/hooks`.
test('commit create compares every symlink on the way to a hook target', async (t) => {
  const layouts = [
    [
      'hooks-path',
      'hooks/pre-commit',
      '../scripts',
      (root) => git(root, 'config', 'core.hooksPath', 'hooks'),
    ],
    ['husky', '.husky/pre-commit', '../scripts', () => {}],
    ['hooks-path', '.git/hooks/pre-commit', '../../scripts', () => {}],
  ];
  // [intermediate link, its base target, its changed target, the hook link's target below scripts/]
  const chains = [
    ['scripts/selected', 'run-hook', 'other-hook', 'selected'],
    ['scripts/current', 'v1', 'v2', 'current/hook'],
  ];
  for (const [kind, link, prefix, configure] of layouts) {
    for (const [intermediate, from, to, via] of chains) {
      for (const where of ['against-base', 'in-worktree']) {
        const label = `${link} via ${intermediate} ${where}`;
        const root = repository(t);
        const marker = join(root, '.effective-flow', 'hook-ran');
        const unrelated = join(root, '.effective-flow', 'unrelated');
        hookScript(join(root, 'scripts', 'run-hook'), unrelated);
        hookScript(join(root, 'scripts', 'other-hook'), marker);
        hookScript(join(root, 'scripts', 'v1', 'hook'), unrelated);
        hookScript(join(root, 'scripts', 'v2', 'hook'), marker);
        symlinkSync(from, join(root, intermediate));
        mkdirSync(join(root, link, '..'), { recursive: true });
        symlinkSync(`${prefix}/${via}`, join(root, link));
        git(root, 'add', '--', 'scripts', ...(link.startsWith('.git/') ? [] : [link]));
        git(root, 'commit', '-q', '--no-verify', '-m', 'chained hook');
        configure(root);
        const base = head(root);
        rmSync(join(root, intermediate));
        symlinkSync(to, join(root, intermediate));
        if (where === 'against-base') {
          git(root, 'commit', '-q', '--no-verify', '-am', 'retarget the intermediate link');
        }
        writeFileSync(join(root, 'tracked.txt'), 'changed\n');
        const before = head(root);
        const outcome = expectOutcome(
          await commitCreate(
            input(root, { hookBase: base, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
          ),
          'HOOKS_UNTRUSTED',
        );
        assert.equal(outcome.reason, `changed-${where}`, label);
        assert.deepEqual(outcome.changed, [{ path: intermediate, class: kind }], label);
        assert.equal(existsSync(marker), false, `no hook ran (${label})`);
        assert.equal(head(root), before, label);
        assert.equal(lockPresent(root), false, label);
      }
    }
  }
});

// Invariant: the target of a symlinked `package.json`, and every in-worktree link on its way, is
// package configuration, so a hook-relevant key changed in the target, against the base or in the
// working tree, is HOOKS_UNTRUSTED, while a change to any other key is not.
test('commit create judges the target of a symlinked package.json', async (t) => {
  const prepare = () => {
    const root = repository(t);
    mkdirSync(join(root, 'config'));
    writeFileSync(join(root, 'config', 'package.json5'), '{"name":"fixture"}\n');
    symlinkSync('package.json5', join(root, 'config', 'current'));
    symlinkSync('config/current', join(root, 'package.json'));
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'linked package');
    return { root, base: head(root) };
  };
  for (const where of ['against-base', 'in-worktree']) {
    const { root, base } = prepare();
    writeFileSync(
      join(root, 'config', 'package.json5'),
      '{"name":"fixture","scripts":{"prepare":"x"}}\n',
    );
    if (where === 'against-base') git(root, 'commit', '-q', '-am', 'change the target');
    writeFileSync(join(root, 'tracked.txt'), 'changed\n');
    const outcome = expectOutcome(
      await commitCreate(
        input(root, { hookBase: base, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
      ),
      'HOOKS_UNTRUSTED',
    );
    assert.equal(outcome.reason, `changed-${where}`, where);
    assert.deepEqual(
      outcome.changed,
      [{ path: 'config/package.json5', class: 'package-json', keys: ['scripts.prepare'] }],
      where,
    );
  }

  const retargeted = prepare();
  writeFileSync(
    join(retargeted.root, 'config', 'other.json5'),
    '{"name":"fixture","scripts":{"prepare":"x"}}\n',
  );
  rmSync(join(retargeted.root, 'config', 'current'));
  symlinkSync('other.json5', join(retargeted.root, 'config', 'current'));
  git(retargeted.root, 'add', '.');
  git(retargeted.root, 'commit', '-q', '-m', 'retarget the intermediate link');
  writeFileSync(join(retargeted.root, 'tracked.txt'), 'changed\n');
  const viaLink = expectOutcome(
    await commitCreate(
      input(retargeted.root, {
        hookBase: retargeted.base,
        expect: { 'tracked.txt': blob(retargeted.root, 'tracked.txt') },
      }),
    ),
    'HOOKS_UNTRUSTED',
  );
  assert.equal(viaLink.reason, 'changed-against-base');
  assert.ok(
    viaLink.changed.some((entry) => entry.path === 'config/current'),
    JSON.stringify(viaLink.changed),
  );

  const unrelated = prepare();
  writeFileSync(
    join(unrelated.root, 'config', 'package.json5'),
    '{"name":"fixture","version":"2.0.0"}\n',
  );
  git(unrelated.root, 'commit', '-q', '-am', 'unrelated key');
  writeFileSync(join(unrelated.root, 'tracked.txt'), 'changed\n');
  expectResult(
    await commitCreate(
      input(unrelated.root, {
        hookBase: unrelated.base,
        expect: { 'tracked.txt': blob(unrelated.root, 'tracked.txt') },
      }),
    ),
  );
});

// Invariant: a symlinked `core.hooksPath` directory is judged at its physical location inside the
// worktree, and the symlink itself is hook configuration, so a change to a hook in the real
// directory or a retargeted link is HOOKS_UNTRUSTED.
test('commit create resolves a symlinked core.hooksPath physically', async (t) => {
  const prepare = () => {
    const root = repository(t);
    hookScript(join(root, 'tools', 'real-hooks', 'pre-commit'), join(root, '.effective-flow', 'x'));
    hookScript(
      join(root, 'tools', 'other-hooks', 'pre-commit'),
      join(root, '.effective-flow', 'x'),
    );
    symlinkSync('tools/real-hooks', join(root, 'hooks'));
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'linked hooks path');
    git(root, 'config', 'core.hooksPath', 'hooks');
    return { root, base: head(root), marker: join(root, '.effective-flow', 'hook-ran') };
  };

  const viaTarget = prepare();
  hookScript(join(viaTarget.root, 'tools', 'real-hooks', 'pre-commit'), viaTarget.marker);
  git(viaTarget.root, 'commit', '-q', '--no-verify', '-am', 'change the real hook');
  writeFileSync(join(viaTarget.root, 'tracked.txt'), 'changed\n');
  const changedTarget = expectOutcome(
    await commitCreate(
      input(viaTarget.root, {
        hookBase: viaTarget.base,
        expect: { 'tracked.txt': blob(viaTarget.root, 'tracked.txt') },
      }),
    ),
    'HOOKS_UNTRUSTED',
  );
  assert.equal(changedTarget.reason, 'changed-against-base');
  assert.deepEqual(changedTarget.changed, [
    { path: 'tools/real-hooks/pre-commit', class: 'hooks-path' },
  ]);
  assert.equal(existsSync(viaTarget.marker), false, 'no hook ran');

  const viaLink = prepare();
  rmSync(join(viaLink.root, 'hooks'));
  symlinkSync('tools/other-hooks', join(viaLink.root, 'hooks'));
  writeFileSync(join(viaLink.root, 'tracked.txt'), 'changed\n');
  const changedLink = expectOutcome(
    await commitCreate(
      input(viaLink.root, {
        hookBase: viaLink.base,
        expect: { 'tracked.txt': blob(viaLink.root, 'tracked.txt') },
      }),
    ),
    'HOOKS_UNTRUSTED',
  );
  assert.equal(changedLink.reason, 'changed-in-worktree');
  assert.deepEqual(changedLink.changed, [{ path: 'hooks', class: 'hooks-path' }]);

  // Unchanged, the linked hooks path runs the repository's own hooks.
  const unchanged = prepare();
  writeFileSync(join(unchanged.root, 'tracked.txt'), 'changed\n');
  expectResult(
    await commitCreate(
      input(unchanged.root, {
        hookBase: unchanged.base,
        expect: { 'tracked.txt': blob(unchanged.root, 'tracked.txt') },
      }),
    ),
  );
  assert.equal(existsSync(join(unchanged.root, '.effective-flow', 'x')), true, 'the hook ran');
});

// Invariant: an in-worktree hook symlink, or an in-worktree symlink on the way to `core.hooksPath`,
// that dangles, leaves the worktree or reaches below `.git` cannot be compared and fails closed
// as `unverifiable-hook-link` before the lock.
test('commit create refuses hook symlinks it cannot verify', async (t) => {
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-outside-')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  hookScript(join(outside, 'pre-commit'), join(outside, 'ran'));
  const cases = [
    ['.husky/pre-commit', join(outside, 'pre-commit'), join(outside, 'pre-commit'), () => {}],
    ['.githooks/pre-commit', '../missing-hook', null, () => {}],
    ['.husky/pre-push', '../.git/config', '.git/config', () => {}],
    ['hooks', outside, outside, (root) => git(root, 'config', 'core.hooksPath', 'hooks')],
  ];
  for (const [link, target, reported, configure] of cases) {
    const root = repository(t);
    mkdirSync(join(root, link, '..'), { recursive: true });
    symlinkSync(target, join(root, link));
    configure(root);
    writeFileSync(join(root, 'tracked.txt'), 'changed\n');
    const outcome = expectOutcome(
      await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } })),
      'HOOKS_UNTRUSTED',
    );
    assert.equal(outcome.reason, 'unverifiable-hook-link', link);
    assert.deepEqual(outcome.links, [{ path: link, target: reported }], link);
    assert.equal(existsSync(join(outside, 'ran')), false, `no hook ran (${link})`);
    assert.equal(lockPresent(root), false, link);
  }
});

// Invariant: with `core.hooksPath` unset, a `.git/hooks` that is a symlink into the worktree is
// judged at its physical location, so a changed regular hook file in it, against the base or in
// the working tree, is HOOKS_UNTRUSTED with no hook run.
test('commit create resolves a symlinked default hooks directory physically', async (t) => {
  for (const where of ['against-base', 'in-worktree']) {
    const root = repository(t);
    const marker = join(root, '.effective-flow', 'hook-ran');
    hookScript(join(root, 'custom-hooks', 'pre-commit'), join(root, '.effective-flow', 'x'));
    git(root, 'add', 'custom-hooks');
    git(root, 'commit', '-q', '--no-verify', '-m', 'custom hooks');
    rmSync(join(root, '.git', 'hooks'), { recursive: true, force: true });
    symlinkSync('../custom-hooks', join(root, '.git', 'hooks'));
    const base = head(root);
    hookScript(join(root, 'custom-hooks', 'pre-commit'), marker);
    if (where === 'against-base') {
      git(root, 'commit', '-q', '--no-verify', '-am', 'change the hook');
    }
    writeFileSync(join(root, 'tracked.txt'), 'changed\n');
    const before = head(root);
    const outcome = expectOutcome(
      await commitCreate(
        input(root, { hookBase: base, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
      ),
      'HOOKS_UNTRUSTED',
    );
    assert.equal(outcome.reason, `changed-${where}`, where);
    assert.deepEqual(outcome.changed, [{ path: 'custom-hooks/pre-commit', class: 'hooks-path' }]);
    assert.equal(existsSync(marker), false, `no hook ran (${where})`);
    assert.equal(head(root), before, where);
    assert.equal(lockPresent(root), false, where);
  }
});

// Invariant: `core.hooksPath` is the directory Git interpolates, a leading `~/` expanded against
// HOME and trailing whitespace kept, so a changed hook in that in-worktree directory is
// HOOKS_UNTRUSTED with no hook run.
test('commit create resolves core.hooksPath as Git interpolates it', async (t) => {
  const cases = [
    ['~/hooks', 'hooks', (root) => ({ ...GIT_ENV, HOME: root })],
    ['hooks ', 'hooks ', () => GIT_ENV],
  ];
  for (const [value, directory, environment] of cases) {
    const root = repository(t);
    const marker = join(root, '.effective-flow', 'hook-ran');
    hookScript(join(root, directory, 'pre-commit'), join(root, '.effective-flow', 'x'));
    git(root, 'add', '--', directory);
    git(root, 'commit', '-q', '--no-verify', '-m', 'hooks');
    git(root, 'config', 'core.hooksPath', value);
    const base = head(root);
    hookScript(join(root, directory, 'pre-commit'), marker);
    git(root, 'commit', '-q', '--no-verify', '-am', 'change the hook');
    writeFileSync(join(root, 'tracked.txt'), 'changed\n');
    const before = head(root);
    const outcome = expectOutcome(
      await commitCreate(
        input(root, { hookBase: base, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
        { env: environment(root) },
      ),
      'HOOKS_UNTRUSTED',
    );
    assert.equal(outcome.reason, 'changed-against-base', value);
    assert.deepEqual(
      outcome.changed,
      [{ path: `${directory}/pre-commit`, class: 'hooks-path' }],
      value,
    );
    assert.equal(existsSync(marker), false, `no hook ran (${value})`);
    assert.equal(head(root), before, value);
    assert.equal(lockPresent(root), false, value);
  }
});

// Invariant: a hook symlink in a hooks directory outside the worktree that passes an in-worktree
// link before ending outside the worktree again makes that link hook configuration, so the hook
// is HOOKS_UNTRUSTED with no hook run, its link retargeted or not.
test('commit create watches the in-worktree links of an outside hook ending outside', async (t) => {
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-outside-')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const hooks = join(outside, 'hooks');
  mkdirSync(hooks);
  hookScript(join(outside, 'v1', 'hook'), join(outside, 'unrelated'));
  hookScript(join(outside, 'v2', 'hook'), join(outside, 'ran'));
  for (const retarget of [false, true]) {
    const root = repository(t);
    mkdirSync(join(root, 'scripts'));
    symlinkSync(join(outside, 'v1'), join(root, 'scripts', 'current'));
    git(root, 'add', 'scripts');
    git(root, 'commit', '-q', '--no-verify', '-m', 'linked scripts');
    rmSync(join(hooks, 'pre-commit'), { force: true });
    symlinkSync(join(root, 'scripts', 'current', 'hook'), join(hooks, 'pre-commit'));
    git(root, 'config', 'core.hooksPath', hooks);
    const base = head(root);
    if (retarget) {
      rmSync(join(root, 'scripts', 'current'));
      symlinkSync(join(outside, 'v2'), join(root, 'scripts', 'current'));
      git(root, 'commit', '-q', '--no-verify', '-am', 'retarget the link');
    }
    writeFileSync(join(root, 'tracked.txt'), 'changed\n');
    const before = head(root);
    const outcome = expectOutcome(
      await commitCreate(
        input(root, { hookBase: base, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
      ),
      'HOOKS_UNTRUSTED',
    );
    const label = retarget ? 'retargeted' : 'unchanged';
    assert.equal(outcome.reason, 'unverifiable-hook-link', label);
    assert.deepEqual(
      outcome.links,
      [{ path: 'scripts/current', target: join(outside, retarget ? 'v2' : 'v1') }],
      label,
    );
    assert.equal(existsSync(join(outside, 'ran')), false, `no hook ran (${label})`);
    assert.equal(head(root), before, label);
    assert.equal(lockPresent(root), false, label);
  }
});

// Invariant: a full-file hook configuration symlinked to a `package.json` makes that target hook
// configuration of its own class, not one compared by the hook-relevant package keys only, so a
// changed glob command in it is HOOKS_UNTRUSTED.
test('commit create compares a package.json reached as full-file hook configuration', async (t) => {
  for (const where of ['against-base', 'in-worktree']) {
    const root = repository(t);
    mkdirSync(join(root, 'config'));
    writeFileSync(join(root, 'config', 'package.json'), '{"*.js":"node lint.js"}\n');
    symlinkSync('config/package.json', join(root, '.lintstagedrc.json'));
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'linked lint-staged configuration');
    const base = head(root);
    writeFileSync(join(root, 'config', 'package.json'), '{"*.js":"node evil.js"}\n');
    if (where === 'against-base') git(root, 'commit', '-q', '-am', 'change the glob command');
    writeFileSync(join(root, 'tracked.txt'), 'changed\n');
    const before = head(root);
    const outcome = expectOutcome(
      await commitCreate(
        input(root, { hookBase: base, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
      ),
      'HOOKS_UNTRUSTED',
    );
    assert.equal(outcome.reason, `changed-${where}`, where);
    assert.deepEqual(
      outcome.changed,
      [{ path: 'config/package.json', class: 'lint-staged' }],
      where,
    );
    assert.equal(head(root), before, where);
    assert.equal(lockPresent(root), false, where);
  }
});

// Invariant: the hooks directory read (`git rev-parse --git-path hooks`) accepts only status 0; any
// other status or a runner error fails closed as GIT_FAILED before the lock is taken.
test('commit create fails closed when the hooks directory read fails', async (t) => {
  const isHooksPathRead = (args) =>
    args.includes('rev-parse') && args.includes('--git-path') && args.includes('hooks');
  const failures = {
    'status 128': () => ({
      status: 128,
      stdout: Buffer.alloc(0),
      stderr: Buffer.from('fatal: injected\n'),
    }),
    'runner error': () => ({ error: new Error('spawn failed') }),
  };
  for (const [label, failure] of Object.entries(failures)) {
    const root = repository(t);
    const before = head(root);
    const real = createProcessRunner();
    writeFileSync(join(root, 'tracked.txt'), 'changed\n');
    const envelope = await commitCreate(
      input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
      { runner: async (request) => (isHooksPathRead(request.args) ? failure() : real(request)) },
    );
    assert.equal(envelope.ok, false, `${label}: ${JSON.stringify(envelope)}`);
    assert.equal(envelope.error?.code, 'GIT_FAILED', `${label}: ${JSON.stringify(envelope)}`);
    assert.equal(head(root), before, label);
    assert.equal(lockPresent(root), false, label);
  }
});

// Adds the submodule `<at>` to `root`, cloned from a fresh repository whose `hooks/pre-commit`
// touches `unrelated`, and commits it without hooks; returns the submodule's path in `root`.
function addSubmodule(t, root, at, unrelated) {
  const upstream = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-submodule-')));
  t.after(() => rmSync(upstream, { recursive: true, force: true }));
  git(upstream, 'init', '-q', '--initial-branch=main');
  hookScript(join(upstream, 'hooks', 'pre-commit'), unrelated);
  git(upstream, 'add', '.');
  git(upstream, 'commit', '-q', '-m', 'hooks');
  git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', upstream, at);
  git(root, 'commit', '-q', '--no-verify', '-m', `add ${at}`);
  return join(root, at);
}

// Invariant: Git compares a submodule only as its gitlink and lists none of its files, so a watched
// hook path inside one (`core.hooksPath`, a default `.git/hooks` linked into it, or a hook symlink
// targeting it) is HOOKS_UNTRUSTED (`hook-config-in-submodule`) before the lock with no hook run,
// whether the gitlink changed against the base, the submodule's worktree changed, or neither.
test('commit create refuses hook configuration inside a submodule', async (t) => {
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-outside-')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const configurations = {
    'core.hooksPath': [
      'vendor/hooks',
      (root) => git(root, 'config', 'core.hooksPath', 'vendor/hooks'),
    ],
    'linked .git/hooks': [
      'vendor/hooks',
      (root) => {
        rmSync(join(root, '.git', 'hooks'), { recursive: true, force: true });
        symlinkSync('../vendor/hooks', join(root, '.git', 'hooks'));
      },
    ],
    'hook symlink': [
      'vendor/hooks/pre-commit',
      (root) => {
        mkdirSync(join(root, '.husky'));
        symlinkSync('../vendor/hooks/pre-commit', join(root, '.husky', 'pre-commit'));
        git(root, 'add', '.husky');
        git(root, 'commit', '-q', '--no-verify', '-m', 'linked hook');
        git(root, 'config', 'core.hooksPath', '.husky');
      },
    ],
  };
  for (const [label, [watched, configure]] of Object.entries(configurations)) {
    for (const where of ['against-base', 'in-worktree', 'unchanged']) {
      const name = `${label}, ${where}`;
      const root = repository(t);
      const vendor = addSubmodule(t, root, 'vendor', join(outside, 'unrelated'));
      configure(root);
      const base = head(root);
      const marker = join(outside, 'ran');
      if (where !== 'unchanged') hookScript(join(vendor, 'hooks', 'pre-commit'), marker);
      if (where === 'against-base') {
        git(vendor, 'commit', '-q', '-am', 'change the hook');
        git(root, 'add', 'vendor');
        git(root, 'commit', '-q', '--no-verify', '-m', 'bump vendor');
      }
      writeFileSync(join(root, 'tracked.txt'), 'changed\n');
      const before = head(root);
      const outcome = expectOutcome(
        await commitCreate(
          input(root, { hookBase: base, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
        ),
        'HOOKS_UNTRUSTED',
      );
      assert.equal(outcome.reason, 'hook-config-in-submodule', name);
      assert.deepEqual(outcome.paths, [{ path: watched, submodule: 'vendor' }], name);
      assert.equal(existsSync(marker), false, `no hook ran (${name})`);
      assert.equal(head(root), before, name);
      assert.equal(lockPresent(root), false, name);
    }
  }
});

// Invariant: a hooks directory inside a nested repository that is no submodule (an untracked
// repository in the worktree, whose files Git does not list either) is refused the same way.
test('commit create refuses a hooks directory inside a nested repository', async (t) => {
  const root = repository(t);
  const nested = join(root, 'nested');
  mkdirSync(nested);
  git(nested, 'init', '-q', '--initial-branch=main');
  hookScript(join(nested, 'hooks', 'pre-commit'), join(nested, 'ran'));
  git(root, 'config', 'core.hooksPath', 'nested/hooks');
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } })),
    'HOOKS_UNTRUSTED',
  );
  assert.equal(outcome.reason, 'hook-config-in-submodule');
  assert.deepEqual(outcome.paths, [{ path: 'nested/hooks', submodule: 'nested' }]);
  assert.equal(existsSync(join(nested, 'ran')), false, 'no hook ran');
  assert.equal(lockPresent(root), false);
});

// Invariant: Git compares a submodule only as its gitlink and dirty state and lists none of its
// files, ignored ones included, so a submodule below an in-worktree hooks directory is
// HOOKS_UNTRUSTED (`hook-config-in-submodule`, the watched path with the submodule) before the
// lock with no hook run, whatever `submodule.<name>.ignore` says: whether its gitlink changed
// against the base, its worktree is dirty, or only an ignored file a hook sources changed.
test('commit create refuses a submodule below a hooks directory', async (t) => {
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-outside-')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  for (const where of ['against-base', 'in-worktree', 'ignored']) {
    const root = repository(t);
    const lib = addSubmodule(t, root, 'tools/lib', join(outside, 'unrelated'));
    const marker = join(outside, `ran-${where}`);
    writeFileSync(
      join(root, 'tools', 'pre-commit'),
      '#!/bin/sh\n. "$(dirname "$0")/lib/hidden-hook"\n',
    );
    chmodSync(join(root, 'tools', 'pre-commit'), 0o755);
    git(root, 'add', '--', 'tools/pre-commit');
    git(root, 'commit', '-q', '--no-verify', '-m', 'hooks path');
    git(root, 'config', 'core.hooksPath', 'tools');
    git(root, 'config', 'submodule.tools/lib.ignore', 'all');
    const exclude = join(git(lib, 'rev-parse', '--absolute-git-dir'), 'info');
    mkdirSync(exclude, { recursive: true });
    writeFileSync(join(exclude, 'exclude'), 'hidden-hook\n');
    writeFileSync(join(lib, 'hidden-hook'), 'true\n');
    const base = head(root);
    if (where === 'ignored') writeFileSync(join(lib, 'hidden-hook'), `touch '${marker}'\n`);
    else hookScript(join(lib, 'hooks', 'pre-commit'), marker);
    if (where === 'against-base') {
      git(lib, 'commit', '-q', '-am', 'change the library');
      git(root, 'add', 'tools/lib');
      git(root, 'commit', '-q', '--no-verify', '-m', 'bump the library');
    }
    writeFileSync(join(root, 'tracked.txt'), 'changed\n');
    const before = head(root);
    const outcome = expectOutcome(
      await commitCreate(
        input(root, { hookBase: base, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
      ),
      'HOOKS_UNTRUSTED',
    );
    assert.equal(outcome.reason, 'hook-config-in-submodule', where);
    assert.deepEqual(outcome.paths, [{ path: 'tools', submodule: 'tools/lib' }], where);
    assert.equal(existsSync(marker), false, `no hook ran (${where})`);
    assert.equal(head(root), before, where);
    assert.equal(lockPresent(root), false, where);
  }
});

// Invariant: a hook directory of the closed list that is itself a submodule (`.husky`) or holds a
// submodule or another nested repository, ignored or not, hides its files from both comparisons, so
// it is HOOKS_UNTRUSTED (`hook-config-in-submodule`, the hook directory with the repository) before
// the lock with no hook run, though neither comparison sees a change and no hooks path names it.
test('commit create refuses a hook directory of the closed list that is or holds a submodule', async (t) => {
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-outside-')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const layouts = {
    'submodule .husky': [
      { path: '.husky', submodule: '.husky' },
      (root) => addSubmodule(t, root, '.husky', join(outside, 'unrelated')),
    ],
    'submodule in .githooks': [
      { path: 'app/.githooks', submodule: 'app/.githooks/lib' },
      (root) => addSubmodule(t, root, 'app/.githooks/lib', join(outside, 'unrelated')),
    ],
    'ignored nested repository in .lefthook': [
      { path: '.lefthook', submodule: '.lefthook/cache' },
      (root) => {
        mkdirSync(join(root, '.lefthook', 'cache'), { recursive: true });
        git(join(root, '.lefthook', 'cache'), 'init', '-q', '--initial-branch=main');
        writeFileSync(join(root, '.gitignore'), '.effective-flow/\n*.log\n.lefthook/cache/\n');
        git(root, 'commit', '-q', '--no-verify', '-am', 'ignore the cache');
      },
    ],
  };
  for (const [label, [reported, configure]] of Object.entries(layouts)) {
    const root = repository(t);
    configure(root);
    const marker = join(outside, `ran-${label}`);
    hookScript(join(root, '.git', 'hooks', 'pre-commit'), marker);
    writeFileSync(join(root, 'tracked.txt'), 'changed\n');
    const before = head(root);
    const outcome = expectOutcome(
      await commitCreate(
        input(root, { hookBase: before, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
      ),
      'HOOKS_UNTRUSTED',
    );
    assert.equal(outcome.reason, 'hook-config-in-submodule', label);
    assert.deepEqual(outcome.paths, [reported], label);
    assert.equal(existsSync(marker), false, `no hook ran (${label})`);
    assert.equal(head(root), before, label);
    assert.equal(lockPresent(root), false, label);
  }
});

// Invariant: Git lists nothing below an in-worktree hook directory it cannot open (execute-only,
// mode 0111, from which it still runs hooks), warns and exits 0; that incomplete listing is
// unverifiable, never an empty directory: HOOKS_UNTRUSTED (`unverifiable-hook-link`, the directory
// `unreadable` with its errno) before the lock with no hook run, for the hooks directory and for a
// subdirectory of it.
test(
  'commit create fails closed on an unreadable in-worktree hook directory',
  { skip: process.getuid?.() === 0 },
  async (t) => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-outside-')));
    t.after(() => rmSync(outside, { recursive: true, force: true }));
    for (const unreadable of ['tools/hooks', 'tools/hooks/lib']) {
      const root = repository(t);
      const marker = join(outside, `ran-${unreadable.replaceAll('/', '-')}`);
      hookScript(join(root, 'tools', 'hooks', 'pre-commit'), marker);
      mkdirSync(join(root, 'tools', 'hooks', 'lib'));
      writeFileSync(join(root, 'tools', 'hooks', 'lib', 'helper'), 'true\n');
      git(root, 'add', 'tools');
      git(root, 'commit', '-q', '--no-verify', '-m', 'hooks path');
      git(root, 'config', 'core.hooksPath', 'tools/hooks');
      writeFileSync(join(root, 'tracked.txt'), 'changed\n');
      const before = head(root);
      const request = input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } });
      chmodSync(join(root, unreadable), 0o111);
      let envelope;
      try {
        envelope = await commitCreate(request);
      } finally {
        chmodSync(join(root, unreadable), 0o755);
      }
      const outcome = expectOutcome(envelope, 'HOOKS_UNTRUSTED');
      assert.equal(outcome.reason, 'unverifiable-hook-link', unreadable);
      assert.deepEqual(
        outcome.links,
        [{ path: unreadable, target: null, reason: 'unreadable', code: 'EACCES' }],
        unreadable,
      );
      assert.equal(existsSync(marker), false, `no hook ran (${unreadable})`);
      assert.equal(head(root), before, unreadable);
      assert.equal(lockPresent(root), false, unreadable);
    }
  },
);

// Builds an outside hooks directory whose `pre-commit` links to the in-worktree `scripts/hook`,
// selects it with `core.hooksPath`, then changes that hook in a commit against the returned base.
function outsideLinkedHook(t, outside) {
  const hooks = join(outside, 'hooks');
  mkdirSync(hooks, { recursive: true });
  const root = repository(t);
  hookScript(join(root, 'scripts', 'hook'), join(outside, 'unrelated'));
  git(root, 'add', 'scripts');
  git(root, 'commit', '-q', '--no-verify', '-m', 'hook script');
  rmSync(join(hooks, 'pre-commit'), { force: true });
  symlinkSync(join(root, 'scripts', 'hook'), join(hooks, 'pre-commit'));
  git(root, 'config', 'core.hooksPath', hooks);
  const base = head(root);
  hookScript(join(root, 'scripts', 'hook'), join(outside, 'ran'));
  git(root, 'commit', '-q', '--no-verify', '-am', 'change the hook');
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  return { root, hooks, base };
}

// Invariant: an outside hooks directory that cannot be listed (execute-only, mode 0111, from which
// Git still runs `pre-commit`) is unverifiable, never an empty directory, so its links into the
// worktree cannot escape the comparison: HOOKS_UNTRUSTED before the lock with no hook run.
test(
  'commit create fails closed on an unreadable outside hooks directory',
  { skip: process.getuid?.() === 0 },
  async (t) => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-outside-')));
    t.after(() => rmSync(outside, { recursive: true, force: true }));
    const { root, hooks, base } = outsideLinkedHook(t, outside);
    const before = head(root);
    chmodSync(hooks, 0o111);
    let envelope;
    try {
      envelope = await commitCreate(
        input(root, { hookBase: base, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
      );
    } finally {
      chmodSync(hooks, 0o755);
    }
    const outcome = expectOutcome(envelope, 'HOOKS_UNTRUSTED');
    assert.equal(outcome.reason, 'unverifiable-hook-link');
    assert.deepEqual(outcome.links, [
      { path: hooks, target: null, reason: 'unreadable', code: 'EACCES' },
    ]);
    assert.equal(existsSync(join(outside, 'ran')), false, 'no hook ran');
    assert.equal(head(root), before);
    assert.equal(lockPresent(root), false);
  },
);

// Invariant: hook discovery treats only ENOENT and ENOTDIR as a missing path; any other `lstat` or
// `readlink` failure on a hook link, outside the worktree or listed inside it, is unverifiable and
// HOOKS_UNTRUSTED before the lock with no hook run, never a dangling link that is skipped.
test('commit create fails closed when resolving a hook link fails', async (t) => {
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-outside-')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const injected = (name, target, code) => ({
    [name]: async (value, ...rest) => {
      if (value === target) throw Object.assign(new Error(`injected ${code}`), { code });
      return fsPromises[name](value, ...rest);
    },
  });
  const cases = [
    ['outside readlink', 'readlink', 'EIO'],
    ['outside lstat', 'lstat', 'EACCES'],
    ['listed lstat', 'lstat', 'EIO'],
  ];
  for (const [label, name, code] of cases) {
    let root;
    let base;
    let failing;
    let reported;
    if (label === 'listed lstat') {
      root = repository(t);
      hookScript(join(root, 'scripts', 'hook'), join(outside, 'unrelated'));
      mkdirSync(join(root, '.husky'));
      symlinkSync('../scripts/hook', join(root, '.husky', 'pre-commit'));
      git(root, 'add', '.');
      git(root, 'commit', '-q', '--no-verify', '-m', 'linked hook');
      git(root, 'config', 'core.hooksPath', '.husky');
      base = head(root);
      hookScript(join(root, 'scripts', 'hook'), join(outside, 'ran'));
      git(root, 'commit', '-q', '--no-verify', '-am', 'change the hook');
      writeFileSync(join(root, 'tracked.txt'), 'changed\n');
      failing = join(root, '.husky', 'pre-commit');
      reported = '.husky/pre-commit';
    } else {
      const fixture = outsideLinkedHook(t, outside);
      ({ root, base } = fixture);
      failing = join(fixture.hooks, 'pre-commit');
      reported = failing;
    }
    const before = head(root);
    const outcome = expectOutcome(
      await commitCreate(
        input(root, { hookBase: base, expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
        { fs: injected(name, failing, code) },
      ),
      'HOOKS_UNTRUSTED',
    );
    assert.equal(outcome.reason, 'unverifiable-hook-link', label);
    assert.deepEqual(
      outcome.links,
      [{ path: reported, target: null, reason: 'unreadable', code }],
      label,
    );
    assert.equal(existsSync(join(outside, 'ran')), false, `no hook ran (${label})`);
    assert.equal(head(root), before, label);
    assert.equal(lockPresent(root), false, label);
  }
});

// ---------------------------------------------------------------------------------------------
// Redaction

// Invariant: hook stderr passes the tracker's redactor and is capped to its last MAX_STDERR_CHARS
// characters.
test('commit create redacts and caps hook stderr', async (t) => {
  const root = repository(t);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  hook(
    root,
    'pre-commit',
    `head -c 20000 /dev/zero | tr '\\0' 'x' >&2\necho >&2\necho "push https://bot:ghp_abcdefghijklmnopqrstuvwxyz0123456789@github.com/x failed" >&2\nexit 1`,
  );
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } })),
    'COMMIT_FAILED',
  );
  assert.equal(outcome.stderrTruncated, true);
  assert.ok(outcome.stderr.length <= MAX_STDERR_CHARS);
  assert.doesNotMatch(outcome.stderr, /ghp_/);
  assert.match(outcome.stderr, /\[REDACTED\]@github\.com/);

  assert.deepEqual(reportedStderr('short'), { stderr: 'short', stderrTruncated: false });
});

// ---------------------------------------------------------------------------------------------
// CLI

const CLI = fileURLToPath(new URL('../src/scripts/effective-flow-state.mjs', import.meta.url));

// Invariant: the CLI accepts `commit create` as its two operation tokens, reports an outcome with
// exit 4 and one `CODE: message` stderr line, and a success with exit 0.
test('the CLI runs commit create and reports its outcomes', async (t) => {
  const root = repository(t);
  writeFileSync(join(root, 'other.txt'), 'foreign\n');
  git(root, 'add', 'other.txt');
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const request = JSON.stringify(
    input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }),
  );
  const refused = spawnSync(process.execPath, [CLI, 'commit', 'create'], {
    input: request,
    encoding: 'utf8',
    env: GIT_ENV,
  });
  assert.equal(refused.status, 4, refused.stderr);
  assert.equal(JSON.parse(refused.stdout).outcome.code, 'INDEX_NOT_CLEAN');
  assert.match(refused.stderr, /^INDEX_NOT_CLEAN: /);

  git(root, 'restore', '--staged', 'other.txt');
  const committed = spawnSync(process.execPath, [CLI, 'commit', 'create'], {
    input: request,
    encoding: 'utf8',
    env: GIT_ENV,
  });
  assert.equal(committed.status, 0, committed.stderr);
  assert.equal(JSON.parse(committed.stdout).result.commit, head(root));

  const extra = spawnSync(process.execPath, [CLI, 'commit', 'create', '--amend'], {
    input: request,
    encoding: 'utf8',
    env: GIT_ENV,
  });
  assert.equal(extra.status, 2);
});

// --- Ownership of iterate-commit.lock across the critical section ------------------------------

const OTHER_OWNER = Object.freeze({ ...OWNER, delegation: 'iterate-0123456789abcdef/2' });

// Breaks the held lock by removing its directory and acquires it as another owner; returns its token.
async function takeOver(root) {
  rmSync(join(root, ...LOCK_DIR), { recursive: true, force: true });
  const acquired = await executeOperation(
    'lock acquire',
    { cwd: root, lock: 'iterate-commit', owner: OTHER_OWNER },
    deps(),
  );
  assert.equal(acquired.ok, true, JSON.stringify(acquired));
  return foreignToken(root);
}

async function foreignToken(root) {
  const inspected = await executeOperation(
    'lock inspect',
    { cwd: root, lock: 'iterate-commit' },
    deps(),
  );
  assert.equal(inspected.ok, true, JSON.stringify(inspected));
  assert.equal(inspected.result.present, true);
  return inspected.result.owner.fields.token;
}

function expectOwnershipLost(outcome, phases, lockReleased = false) {
  assert.equal(outcome.reason, 'ownership-lost', JSON.stringify(outcome));
  assert.ok(phases.includes(outcome.phase), `phase ${outcome.phase}`);
  assert.equal(outcome.commit, null);
  assert.equal(outcome.lock, 'iterate-commit');
  assert.equal(outcome.heldLock, undefined, 'the foreign lock is never offered');
  assert.ok(outcome.lockRelease, 'the failed release is reported');
  assert.equal(outcome.lockRelease.released, lockReleased);
  assert.equal(outcome.lockRelease.code, 'NOT_OWNER');
}

// Invariant: ownership is verified before `git add`; a lock taken over right after acquisition
// stages nothing, commits nothing and leaves the foreign lock intact.
test('commit create stops with NOT_OWNER when the lock is taken over before staging', async (t) => {
  const root = repository(t);
  const before = head(root);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  let foreign;
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }), {
      onPhase: async (phase) => {
        if (phase === 'locked') foreign = await takeOver(root);
      },
    }),
    'NOT_OWNER',
  );
  expectOwnershipLost(outcome, ['before-stage']);
  assert.equal(head(root), before);
  assert.deepEqual(staged(root), []);
  assert.equal(lockPresent(root), true);
  assert.equal(await foreignToken(root), foreign);
});

// Invariant: ownership is verified before `git commit`; a takeover after staging commits nothing
// and leaves the index (this call's and the foreign owner's staged paths) and the foreign lock alone.
test('commit create stops with NOT_OWNER when the lock is taken over before the commit', async (t) => {
  const root = repository(t);
  const before = head(root);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  let foreign;
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }), {
      onPhase: async (phase) => {
        if (phase !== 'beforeCommit') return;
        foreign = await takeOver(root);
        writeFileSync(join(root, 'other.txt'), 'foreign change\n');
        git(root, 'add', 'other.txt');
      },
    }),
    'NOT_OWNER',
  );
  expectOwnershipLost(outcome, ['before-commit']);
  assert.equal(head(root), before);
  assert.deepEqual(staged(root).sort(), ['other.txt', 'tracked.txt']);
  assert.equal(lockPresent(root), true);
  assert.equal(await foreignToken(root), foreign);
});

// Invariant: cleanup after a failure never unstages under a lock this call no longer owns; the
// index stays untouched and the foreign lock survives.
test('commit create does not unstage after losing the lock during a failing commit', async (t) => {
  const root = repository(t);
  const before = head(root);
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  let foreign;
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } }), {
      onPhase: async (phase) => {
        if (phase !== 'beforeCommit') return;
        foreign = await takeOver(root);
        plantHusky(root);
      },
    }),
    'NOT_OWNER',
  );
  expectOwnershipLost(outcome, ['cleanup', 'before-commit']);
  assert.equal(head(root), before);
  assert.deepEqual(staged(root), ['tracked.txt']);
  assert.equal(lockPresent(root), true);
  assert.equal(await foreignToken(root), foreign);
});

// Invariant: a commit that landed but whose final release finds the lock gone is COMMIT_UNVERIFIED
// with the SHA and ownership-lost, never ok:true and never a heldLock for a lock not held.
test('commit create reports COMMIT_UNVERIFIED when the lock vanished before the release', async (t) => {
  const root = repository(t);
  const before = head(root);
  hook(root, 'post-commit', 'rm -rf "$PWD/.effective-flow/iterate-commit.lock"');
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } })),
    'COMMIT_UNVERIFIED',
  );
  assert.notEqual(head(root), before);
  assert.equal(outcome.commit, head(root));
  assert.equal(outcome.reason, 'ownership-lost');
  assert.equal(outcome.lockRelease.released, false);
  assert.equal(outcome.lockRelease.code, 'NOT_HELD');
  assert.equal(outcome.heldLock, undefined);
});

// Invariant: a commit that landed but whose final release finds a different owner is
// COMMIT_UNVERIFIED with NOT_OWNER on the release, never ok:true and never a heldLock.
test('commit create reports COMMIT_UNVERIFIED when another owner holds the lock at release', async (t) => {
  const root = repository(t);
  const before = head(root);
  hook(root, 'post-commit', 'printf x > "$PWD/.effective-flow/iterate-commit.lock/owner"');
  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  const outcome = expectOutcome(
    await commitCreate(input(root, { expect: { 'tracked.txt': blob(root, 'tracked.txt') } })),
    'COMMIT_UNVERIFIED',
  );
  assert.notEqual(head(root), before);
  assert.equal(outcome.commit, head(root));
  assert.equal(outcome.reason, 'ownership-lost');
  assert.equal(outcome.lockRelease.released, false);
  assert.equal(outcome.lockRelease.code, 'NOT_OWNER');
  assert.equal(outcome.heldLock, undefined);
});
