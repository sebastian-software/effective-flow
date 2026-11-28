// `worktree path-resolve` and `worktree path-prepare` against real Git fixtures: the base
// precedence, the trust checks outside `.effective-flow/`, and the record-derived scan roots.

import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';

import {
  GIT_ENV,
  SESSION,
  applyValue,
  branchFor,
  call,
  expectError,
  expectOk,
  git,
  makeRecord,
  publishMain,
  repository,
} from './support/worktree-fixtures.mjs';

const VARIABLE = 'EFFECTIVE_FLOW_WORKTREE_BASE_DIR';

function machineBase(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-machine-base-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return base;
}

function withBase(base, extra = {}) {
  return { env: { ...GIT_ENV, [VARIABLE]: base }, ...extra };
}

function writeSetupAdr(root, rows) {
  const table = Object.entries(rows)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join('\n');
  mkdirSync(join(root, 'docs', 'adr'), { recursive: true });
  writeFileSync(
    join(root, 'docs', 'adr', 'effective-flow-project-setup.md'),
    `# Effective Flow project setup\n\n## Status\n\nActive\n\n## Configuration\n\n| Key | Value |\n| --- | --- |\n${table}\n`,
  );
}

// Creates the worktree at the prepared path and writes its record.
async function addAndRecord(root, prepared, options, extra) {
  const branch = branchFor(options);
  git(root, 'worktree', 'add', '-q', '-b', branch, prepared.worktreePath, 'HEAD');
  const worktree = {
    worktreePath: prepared.worktreePath,
    branch,
    head: git(prepared.worktreePath, 'rev-parse', 'HEAD'),
  };
  const record = makeRecord(root, worktree, options);
  return call('worktree record-init', { cwd: root, executionRoot: root, record }, extra);
}

// Invariant: without the variable the helper keeps today's default path below `.effective-flow/`
// and creates its parents through the runtime-state guard; the result is the exact path
// `record-init` accepts.
test('path-resolve and path-prepare: the default base below .effective-flow/', async (t) => {
  const root = repository(t);
  const input = { cwd: root, purpose: 'delivery', sessionId: SESSION };
  const resolved = expectOk(await call('worktree path-resolve', input));
  const repoDir = join(root, '.effective-flow', '.worktrees', basename(root));
  assert.equal(resolved.worktreePath, join(repoDir, SESSION));
  assert.equal(resolved.source, 'default');
  assert.equal(resolved.guard, 'runtime-state');
  assert.deepEqual(resolved.diagnostics, []);
  assert.deepEqual(resolved.parents, [
    join(root, '.effective-flow'),
    join(root, '.effective-flow', '.worktrees'),
    repoDir,
  ]);
  const prepared = expectOk(await call('worktree path-prepare', input));
  assert.deepEqual(prepared.created, resolved.parents);
  expectOk(await addAndRecord(root, prepared, {}));
  expectError(await call('worktree path-prepare', input), 'WORKTREE_PATH_EXISTS');
});

// Invariant: a set variable wins over the ADR value, the difference is a diagnostic, and the whole
// path through `record-init`, `inspect` and `remove` works under the machine base; after the
// variable changes the worktree stays removable and the scan still sees the old root.
test('path-resolve and path-prepare: the environment base wins and stays removable', async (t) => {
  const root = repository(t);
  writeSetupAdr(root, { 'worktree.baseDir': '.effective-flow/.worktrees' });
  const base = machineBase(t);
  const extra = withBase(base);
  const input = { cwd: root, purpose: 'plan-publication', sessionId: SESSION };
  const resolved = expectOk(await call('worktree path-resolve', input, extra));
  assert.equal(resolved.base, base);
  assert.equal(resolved.source, 'environment');
  assert.equal(resolved.guard, 'path-trust');
  assert.equal(resolved.worktreePath, join(base, basename(root), `${SESSION}-plan-publication`));
  assert.deepEqual(resolved.diagnostics, [
    {
      code: 'configured-base-differs',
      key: 'worktree.baseDir',
      configured: join(root, '.effective-flow', '.worktrees'),
    },
  ]);
  const prepared = expectOk(await call('worktree path-prepare', input, extra));
  assert.deepEqual(prepared.created, [join(base, basename(root))]);
  expectOk(await addAndRecord(root, prepared, { purpose: 'plan-publication' }, extra));

  // An unrecorded worktree of the same session under the machine base, seen without the variable.
  const stray = join(base, basename(root), `${SESSION}-merge-gate`);
  git(root, 'worktree', 'add', '-q', '-b', 'stray/branch', stray, 'HEAD');
  const inspected = expectOk(
    await call('worktree inspect', { cwd: root, executionRoot: root, sessionId: SESSION }),
  );
  assert.deepEqual(
    inspected.unrecorded.map((entry) => entry.path),
    [stray],
  );
  const removed = expectOk(
    await call('worktree remove', {
      cwd: root,
      executionRoot: root,
      sessionId: SESSION,
      recordIds: ['record-1'],
    }),
  );
  assert.equal(removed.items[0].ok, true, JSON.stringify(removed));
});

// Invariant: an empty variable counts as unset; a relative or missing one fails closed with a
// named error and never falls back to the configured or default base. A relative value is refused
// by every operation that resolves a base; a missing directory only by the path operations.
test('path-resolve: empty, relative and missing environment bases', async (t) => {
  const root = repository(t);
  const input = { cwd: root, purpose: 'delivery', sessionId: SESSION };
  const scan = { cwd: root, executionRoot: root, sessionId: SESSION };
  assert.equal(
    expectOk(await call('worktree path-resolve', input, withBase(''))).source,
    'default',
  );
  assert.equal(
    expectOk(await call('worktree path-resolve', input, withBase('  '))).source,
    'default',
  );
  const relative = withBase('relative/base');
  for (const [operation, shaped] of [
    ['worktree path-resolve', input],
    ['worktree path-prepare', input],
    ['worktree inspect', scan],
  ]) {
    assert.equal(
      expectError(await call(operation, shaped, relative), 'WORKTREE_BASE_INVALID').reason,
      'not-absolute',
    );
  }
  const missing = withBase(join(machineBase(t), 'missing'));
  for (const operation of ['worktree path-resolve', 'worktree path-prepare']) {
    assert.equal(
      expectError(await call(operation, input, missing), 'WORKTREE_BASE_INVALID').reason,
      'missing',
    );
  }
});

// Invariant: outside `.effective-flow/`, a base writable by others, a symbolic link below the base
// and a group-writable segment of a shared group stop before anything is created; a
// group-writable segment of the user's private group (umask 002) passes.
test('path-prepare: the trust checks of an environment base', async (t) => {
  const root = repository(t);
  const input = { cwd: root, purpose: 'delivery', sessionId: SESSION };

  const open = machineBase(t);
  chmodSync(open, 0o777);
  const refused = expectError(
    await call('worktree path-prepare', input, withBase(open)),
    'WORKTREE_PATH_UNTRUSTED',
  );
  assert.equal(refused.reason, 'world-writable');
  assert.equal(refused.path, open);

  const linked = machineBase(t);
  const elsewhere = machineBase(t);
  symlinkSync(elsewhere, join(linked, basename(root)));
  assert.equal(
    expectError(
      await call('worktree path-prepare', input, withBase(linked)),
      'WORKTREE_PATH_UNTRUSTED',
    ).reason,
    'symlink',
  );

  const shared = machineBase(t);
  mkdirSync(join(shared, basename(root)));
  chmodSync(join(shared, basename(root)), 0o775);
  const privateGroup = { isPrivateGroup: async () => true };
  const sharedGroup = { isPrivateGroup: async () => false };
  assert.equal(
    expectError(
      await call('worktree path-prepare', input, withBase(shared, { accounts: sharedGroup })),
      'WORKTREE_PATH_UNTRUSTED',
    ).reason,
    'group-writable',
  );
  const prepared = expectOk(
    await call('worktree path-prepare', input, withBase(shared, { accounts: privateGroup })),
  );
  assert.deepEqual(prepared.created, []);
});

// Invariant: an `apply-review` component path needs a filesystem-safe group, every other purpose
// refuses one, and the component lands below its session directory.
test('path-resolve: the apply-review group', async (t) => {
  const root = repository(t);
  const input = { cwd: root, purpose: 'apply-review', sessionId: SESSION };
  expectError(await call('worktree path-resolve', input), 'INVALID_INPUT');
  expectError(await call('worktree path-resolve', { ...input, group: '../x' }), 'INVALID_INPUT');
  expectError(
    await call('worktree path-resolve', { ...input, purpose: 'delivery', group: 'component-1' }),
    'INVALID_INPUT',
  );
  const resolved = expectOk(
    await call('worktree path-resolve', { ...input, group: 'component-1' }),
  );
  assert.equal(
    resolved.worktreePath,
    join(root, '.effective-flow', '.worktrees', basename(root), SESSION, 'component-1'),
  );
});

// Invariant (acceptance: `record-init` under an environment base for every purpose): each leaf the
// prose sites build through `path-resolve` is the exact path `record-init` proves, including the
// plan-publication and plan-PR-continuation leaves (a `delivery` record on the plan branch).
test('record-init accepts every purpose leaf under an environment base', async (t) => {
  const root = repository(t);
  const base = machineBase(t);
  const extra = withBase(base);
  const cases = [
    { purpose: 'plan-publication', recordId: 'r-plan-publication' },
    { purpose: 'delivery', recordId: 'r-plan-pr-continuation', plan: 'plan/continued' },
    { purpose: 'merge-gate', recordId: 'r-merge-gate' },
    { purpose: 'partial-diff', recordId: 'r-partial-diff' },
  ];
  for (const { purpose, recordId, plan } of cases) {
    const options = { purpose, recordId, session: `${SESSION}-${recordId}` };
    const input = { cwd: root, purpose, sessionId: options.session };
    const prepared = expectOk(await call('worktree path-prepare', input, extra));
    const branch = plan ?? branchFor(options);
    git(root, 'worktree', 'add', '-q', '-b', branch, prepared.worktreePath, 'HEAD');
    const worktree = {
      worktreePath: prepared.worktreePath,
      branch,
      head: git(prepared.worktreePath, 'rev-parse', 'HEAD'),
    };
    const record = makeRecord(root, worktree, options);
    expectOk(await call('worktree record-init', { cwd: root, executionRoot: root, record }, extra));
  }
  // A worktree under the machine base but at a path the helper would not compute is refused.
  const stray = join(base, basename(root), 'elsewhere');
  git(root, 'worktree', 'add', '-q', '-b', 'stray/elsewhere', stray, 'HEAD');
  const record = makeRecord(
    root,
    { worktreePath: stray, branch: 'stray/elsewhere', head: git(stray, 'rev-parse', 'HEAD') },
    { recordId: 'r-stray' },
  );
  const refused = await call(
    'worktree record-init',
    { cwd: root, executionRoot: root, record },
    extra,
  );
  assert.equal(refused.ok, false, JSON.stringify(refused));
});

// Invariant: an `apply-review` component lands below the environment base too and `record-init`
// accepts it; the group separates components of one session.
test('apply-review components resolve and record under an environment base', async (t) => {
  const root = repository(t);
  const base = machineBase(t);
  const extra = withBase(base);
  const input = { cwd: root, purpose: 'apply-review', sessionId: SESSION, group: 'component-1' };
  const prepared = expectOk(await call('worktree path-prepare', input, extra));
  assert.equal(prepared.worktreePath, join(base, basename(root), SESSION, 'component-1'));
  assert.equal(prepared.source, 'environment');
  const options = { purpose: 'apply-review' };
  const branch = branchFor(options);
  git(root, 'worktree', 'add', '-q', '-b', branch, prepared.worktreePath, 'HEAD');
  const worktree = {
    worktreePath: prepared.worktreePath,
    branch,
    head: git(prepared.worktreePath, 'rev-parse', 'HEAD'),
  };
  expectOk(
    await call(
      'worktree record-init',
      { cwd: root, executionRoot: root, record: makeRecord(root, worktree, options) },
      extra,
    ),
  );
});

// Invariant: an environment base that names a file, an existing leaf (also a link) and a base owned
// by another user each stop with a named error before anything is created.
test('path-prepare: file base, existing leaf and foreign owner', async (t) => {
  const root = repository(t);
  const input = { cwd: root, purpose: 'delivery', sessionId: SESSION };

  const holder = machineBase(t);
  const file = join(holder, 'file');
  writeFileSync(file, 'x');
  for (const operation of ['worktree path-resolve', 'worktree path-prepare']) {
    assert.equal(
      expectError(await call(operation, input, withBase(file)), 'WORKTREE_BASE_INVALID').reason,
      'not-a-directory',
    );
  }

  const occupied = machineBase(t);
  mkdirSync(join(occupied, basename(root), SESSION), { recursive: true });
  const exists = expectError(
    await call('worktree path-prepare', input, withBase(occupied)),
    'WORKTREE_PATH_EXISTS',
  );
  assert.equal(exists.path, join(occupied, basename(root), SESSION));

  const linked = machineBase(t);
  mkdirSync(join(linked, basename(root)));
  symlinkSync(machineBase(t), join(linked, basename(root), SESSION));
  expectError(await call('worktree path-prepare', input, withBase(linked)), 'WORKTREE_PATH_EXISTS');

  const foreign = machineBase(t);
  const refused = expectError(
    await call('worktree path-prepare', input, withBase(foreign, { uid: process.getuid() + 1 })),
    'WORKTREE_PATH_UNTRUSTED',
  );
  assert.equal(refused.reason, 'foreign-owner');
});

// Invariant: with `umask 002` the segments the helper creates itself stay private (mode 0700) and
// pass the trust check, and a group-writable base of the user's private group passes while the same
// base of a shared group stops before anything is created.
test('path-prepare: umask 002 own segments pass and a shared-group base stops', async (t) => {
  const root = repository(t);
  const input = { cwd: root, purpose: 'delivery', sessionId: SESSION };
  const base = machineBase(t);
  chmodSync(base, 0o775);
  const previous = process.umask(0o002);
  let created;
  try {
    created = expectOk(
      await call(
        'worktree path-prepare',
        input,
        withBase(base, { accounts: { isPrivateGroup: async () => true } }),
      ),
    );
  } finally {
    process.umask(previous);
  }
  assert.deepEqual(created.created, [join(base, basename(root))]);
  assert.equal(statSync(join(base, basename(root))).mode & 0o777, 0o700);

  const shared = machineBase(t);
  chmodSync(shared, 0o775);
  const refused = expectError(
    await call(
      'worktree path-prepare',
      input,
      withBase(shared, { accounts: { isPrivateGroup: async () => false } }),
    ),
    'WORKTREE_PATH_UNTRUSTED',
  );
  assert.equal(refused.reason, 'group-writable');
  assert.equal(existsSync(join(shared, basename(root))), false, 'nothing was created');
});

// Invariant: a denied directory creation (a sandbox without the writable root) fails closed with
// the named WORKTREE_SANDBOX_DENIED, naming the variable and the base, creates nothing and never
// falls back to the configured or default base.
test('path-prepare: a sandbox that denies the creation is named and falls back to nothing', async (t) => {
  const root = repository(t);
  writeSetupAdr(root, { 'worktree.baseDir': '.effective-flow/.worktrees' });
  const base = machineBase(t);
  const input = { cwd: root, purpose: 'delivery', sessionId: SESSION };
  for (const code of ['EACCES', 'EPERM', 'EROFS']) {
    const denying = {
      ...fsPromises,
      mkdir: async (target, ...rest) => {
        if (String(target).startsWith(base)) throw Object.assign(new Error(code), { code });
        return fsPromises.mkdir(target, ...rest);
      },
    };
    const denied = expectError(
      await call('worktree path-prepare', input, withBase(base, { fs: denying })),
      'WORKTREE_SANDBOX_DENIED',
    );
    assert.equal(denied.reason, code);
    assert.equal(denied.base, base);
    assert.match(denied.message, /EFFECTIVE_FLOW_WORKTREE_BASE_DIR/);
    assert.match(denied.message, /configuration guide/);
  }
  assert.equal(existsSync(join(base, basename(root))), false);
  assert.equal(existsSync(join(root, '.effective-flow', '.worktrees')), false, 'no fallback');
});

// Invariant: a configured (ADR) base outside `.effective-flow/` meets the same trust checks, and an
// ADR value the resolver marks invalid (here: an ambiguous key) is INVALID_STATE without the
// variable and only the `configured-base-invalid` diagnostic once the environment base is set.
test('an external configured base is trust checked and an invalid one is a diagnostic', async (t) => {
  const root = repository(t);
  const input = { cwd: root, purpose: 'delivery', sessionId: SESSION };
  const open = machineBase(t);
  chmodSync(open, 0o777);
  writeSetupAdr(root, { 'worktree.baseDir': open });
  const resolved = expectOk(await call('worktree path-resolve', input));
  assert.equal(resolved.source, 'configuration');
  assert.equal(resolved.guard, 'path-trust');
  assert.equal(
    expectError(await call('worktree path-prepare', input), 'WORKTREE_PATH_UNTRUSTED').reason,
    'world-writable',
  );

  const ambiguous = machineBase(t);
  writeSetupAdr(root, { 'worktree.baseDir': ambiguous });
  const adr = join(root, 'docs', 'adr', 'effective-flow-project-setup.md');
  writeFileSync(adr, `${readFileSync(adr, 'utf8')}| worktree.baseDir | ${ambiguous} |\n`);
  expectError(await call('worktree path-resolve', input), 'INVALID_STATE');
  const withEnvironment = expectOk(
    await call('worktree path-resolve', input, withBase(machineBase(t))),
  );
  assert.equal(withEnvironment.source, 'environment');
  assert.deepEqual(withEnvironment.diagnostics, [
    { code: 'configured-base-invalid', key: 'worktree.baseDir' },
  ]);
});

// Invariant: a configured base outside `.effective-flow/` must itself exist, like the
// environment base; the helper creates only the segments below it. A configured base below
// `.effective-flow/` is still created through the runtime-state guard.
test('path-prepare: a missing external configured base is refused, not created', async (t) => {
  const root = repository(t);
  const input = { cwd: root, purpose: 'delivery', sessionId: SESSION };
  const holder = machineBase(t);
  const missing = join(holder, 'missing');
  writeSetupAdr(root, { 'worktree.baseDir': missing });
  for (const operation of ['worktree path-resolve', 'worktree path-prepare']) {
    const refused = expectError(await call(operation, input), 'WORKTREE_BASE_INVALID');
    assert.equal(refused.reason, 'missing');
    assert.equal(refused.key, 'worktree.baseDir');
    assert.equal(refused.path, missing);
  }
  assert.equal(existsSync(missing), false, 'nothing was created');

  mkdirSync(missing);
  const prepared = expectOk(await call('worktree path-prepare', input));
  assert.deepEqual(prepared.created, [join(missing, basename(root))]);

  writeSetupAdr(root, { 'worktree.baseDir': '.effective-flow/elsewhere' });
  const inside = expectOk(await call('worktree path-prepare', input));
  assert.equal(inside.guard, 'runtime-state');
  assert.ok(inside.created.includes(join(root, '.effective-flow', 'elsewhere')));
});

// Invariant: `path-prepare` probes the leaf's parent with a directory it creates and removes,
// so a sandbox that makes existing parents read-only is WORKTREE_SANDBOX_DENIED before `git worktree
// add`, outside and below `.effective-flow/` alike, and the probe leaves nothing behind.
test('path-prepare: a denied write below existing parents is named', async (t) => {
  const root = repository(t);
  const input = { cwd: root, purpose: 'delivery', sessionId: SESSION };
  const base = machineBase(t);
  mkdirSync(join(base, basename(root)));
  const denying = (prefix) => ({
    ...fsPromises,
    mkdir: async (target, ...rest) => {
      if (String(target).startsWith(prefix))
        throw Object.assign(new Error('EROFS'), { code: 'EROFS' });
      return fsPromises.mkdir(target, ...rest);
    },
  });
  const outside = expectError(
    await call('worktree path-prepare', input, withBase(base, { fs: denying(base) })),
    'WORKTREE_SANDBOX_DENIED',
  );
  assert.equal(outside.path, join(base, basename(root)));
  assert.equal(outside.reason, 'EROFS');

  expectOk(await call('worktree path-prepare', input));
  const repoDir = join(root, '.effective-flow', '.worktrees', basename(root));
  const inside = expectError(
    await call('worktree path-prepare', input, { fs: denying(repoDir) }),
    'WORKTREE_SANDBOX_DENIED',
  );
  assert.equal(inside.path, repoDir);
  assert.deepEqual(readdirSync(repoDir), [], 'the probe leaves nothing behind');
  assert.deepEqual(readdirSync(join(base, basename(root))), []);
});

// Invariant: below `.effective-flow/` a parent creation the runtime-state guard's `mkdir`
// reports as denied is WORKTREE_SANDBOX_DENIED too, not a bare WRITE_FAILED.
test(
  'path-prepare: a denied runtime-state parent creation is named',
  { skip: process.getuid?.() === 0 ? 'root ignores directory permissions' : false },
  async (t) => {
    const root = repository(t);
    const input = { cwd: root, purpose: 'delivery', sessionId: SESSION };
    const state = join(root, '.effective-flow');
    mkdirSync(state, { recursive: true });
    chmodSync(state, 0o500);
    let denied;
    try {
      denied = expectError(await call('worktree path-prepare', input), 'WORKTREE_SANDBOX_DENIED');
    } finally {
      chmodSync(state, 0o700);
    }
    assert.equal(denied.path, join(state, '.worktrees'));
    assert.equal(denied.reason, 'EACCES');
  },
);

// Invariant: `cleanup plan` offers and `cleanup apply` removes a worktree under the
// environment base like one under the default base.
test('cleanup plan and apply remove a worktree under an environment base', async (t) => {
  const root = repository(t);
  const base = machineBase(t);
  const extra = withBase(base);
  const input = { cwd: root, purpose: 'delivery', sessionId: SESSION };
  const prepared = expectOk(await call('worktree path-prepare', input, extra));
  expectOk(await addAndRecord(root, prepared, {}, extra));
  expectOk(
    await call(
      'worktree transition',
      {
        cwd: root,
        executionRoot: root,
        recordId: 'record-1',
        from: 'active',
        to: 'cleanup-ready',
        reason: null,
        sessionId: SESSION,
      },
      extra,
    ),
  );
  publishMain(root);
  const planned = expectOk(await call('cleanup plan', { cwd: root, executionRoot: root }, extra));
  const item = planned.items.find((entry) => entry.itemId === 'worktree:record-1');
  assert.ok(item, JSON.stringify(planned));
  const applied = expectOk(
    await call(
      'cleanup apply',
      { cwd: root, executionRoot: root, items: { [item.itemId]: applyValue(item) } },
      extra,
    ),
  );
  assert.equal(applied.items[0].ok, true, JSON.stringify(applied));
  assert.equal(existsSync(prepared.worktreePath), false);
});

// Invariant: when the variable changes to another directory (not only unset), the worktree created
// under the first base stays removable and the scan, run under the second base, still reports an
// unrecorded worktree under the first root.
test('a changed variable keeps the old worktree removable and its root scanned', async (t) => {
  const root = repository(t);
  const first = machineBase(t);
  const second = machineBase(t);
  const input = { cwd: root, purpose: 'delivery', sessionId: SESSION };
  const prepared = expectOk(await call('worktree path-prepare', input, withBase(first)));
  expectOk(await addAndRecord(root, prepared, {}, withBase(first)));
  const stray = join(first, basename(root), `${SESSION}-merge-gate`);
  git(root, 'worktree', 'add', '-q', '-b', 'stray/branch', stray, 'HEAD');
  const inspected = expectOk(
    await call(
      'worktree inspect',
      { cwd: root, executionRoot: root, sessionId: SESSION },
      withBase(second),
    ),
  );
  assert.deepEqual(
    inspected.unrecorded.map((entry) => entry.path),
    [stray],
  );
  const removed = expectOk(
    await call(
      'worktree remove',
      { cwd: root, executionRoot: root, sessionId: SESSION, recordIds: ['record-1'] },
      withBase(second),
    ),
  );
  assert.equal(removed.items[0].ok, true, JSON.stringify(removed));
});
