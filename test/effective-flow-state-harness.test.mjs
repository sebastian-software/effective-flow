import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import {
  lstat as lstatPath,
  readlink as readlinkPath,
  realpath as realpathPath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  ALLOWLISTED_OPERATIONS,
  NEVER_ALLOWLISTED_OPERATIONS,
  helperRule,
  parseHelperRule,
  parseSettings,
  widenedRuleReason,
} from '../src/scripts/claude-settings-core.mjs';
import {
  STATE_OPERATIONS,
  STATE_OPERATION_CLASSES,
  executeOperation,
} from '../src/scripts/effective-flow-state-core.mjs';
import {
  UNSUPPORTED_PATH_REASONS,
  WIDENED_RULE_WARNINGS,
  isPrivateGroupIn,
  resolutionChain,
  systemAccounts,
} from '../src/scripts/effective-flow-state-harness-core.mjs';
import {
  expectError,
  expectOk,
  expectOutcome,
  fakeGit,
  fakeRoot,
  unreachableRunner,
} from './support/state-helper-fixtures.mjs';

const CLAUDE_ENV = Object.freeze({ CLAUDECODE: '1' });
const PRIVATE_GROUPS = Object.freeze({ isPrivateGroup: async () => true });
const SHARED_GROUPS = Object.freeze({ isPrivateGroup: async () => false });

function settingsPath(root) {
  return join(root, '.claude', 'settings.local.json');
}

// A skill install outside the repository: `<base>/skills/effective-flow` links to
// `<base>/real/effective-flow`, which holds the helper.
function install(t, name = 'install') {
  const base = realpathSync(mkdtempSync(join(tmpdir(), `effective-flow-${name}-`)));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const real = join(base, 'real', 'effective-flow');
  mkdirSync(join(real, 'scripts'), { recursive: true });
  writeFileSync(join(real, 'scripts', 'effective-flow-state.mjs'), '// helper\n');
  mkdirSync(join(base, 'skills'));
  symlinkSync(real, join(base, 'skills', 'effective-flow'));
  return {
    base,
    real,
    skillRoot: join(base, 'skills', 'effective-flow'),
    helperPath: join(real, 'scripts', 'effective-flow-state.mjs'),
  };
}

function writeSettings(root, value) {
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(
    settingsPath(root),
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`,
  );
}

function allowRules(root, installed, input = {}, extra = {}) {
  const { git, ...rest } = extra;
  return executeOperation(
    'harness allow-rules',
    { cwd: root, skillRoot: installed.skillRoot, mode: 'preview', ...input },
    {
      runner: fakeGit(root, git).runner,
      env: CLAUDE_ENV,
      helperPath: installed.helperPath,
      accounts: PRIVATE_GROUPS,
      ...rest,
    },
  );
}

async function previewAndApply(root, installed, extra = {}) {
  const preview = expectOk(await allowRules(root, installed, {}, extra));
  const applied = expectOk(
    await allowRules(root, installed, { mode: 'apply', digest: preview.digest }, extra),
  );
  return { preview, applied };
}

// ---------------------------------------------------------------------------------------------
// Operation classification

// Invariant: every helper operation is classified as allowlisted or not, so a new operation fails
// here until it is classified; the allowlisted set is exactly the six rules `harness allow-rules`
// writes, and `lock break` and `harness allow-rules` are never among them.
test('every STATE_OPERATIONS entry is classified and only non-destructive ones are allowlisted', () => {
  assert.deepEqual(Object.keys(STATE_OPERATION_CLASSES), [...STATE_OPERATIONS]);
  for (const operation of STATE_OPERATIONS) {
    assert.ok(
      ['allowlisted', 'not-allowlisted'].includes(STATE_OPERATION_CLASSES[operation]),
      `${operation} must be classified`,
    );
  }
  const allowlisted = STATE_OPERATIONS.filter(
    (operation) => STATE_OPERATION_CLASSES[operation] === 'allowlisted',
  );
  assert.deepEqual(allowlisted, [...ALLOWLISTED_OPERATIONS]);
  assert.deepEqual(allowlisted, [
    'lock acquire',
    'lock release',
    'lock inspect',
    'memory reserve',
    'memory set-marker',
    'memory migrate-directory',
  ]);
  assert.equal(STATE_OPERATION_CLASSES['lock break'], 'not-allowlisted');
  assert.equal(STATE_OPERATION_CLASSES['harness allow-rules'], 'not-allowlisted');
  assert.deepEqual(
    STATE_OPERATIONS.filter((operation) => STATE_OPERATION_CLASSES[operation] !== 'allowlisted'),
    [...NEVER_ALLOWLISTED_OPERATIONS],
  );
  assert.ok(Object.isFrozen(STATE_OPERATION_CLASSES));
  assert.ok(Object.isFrozen(ALLOWLISTED_OPERATIONS));
});

// ---------------------------------------------------------------------------------------------
// Shared settings module

// Invariant: the rule shape is exactly `Bash(node <skillRoot>/scripts/effective-flow-state.mjs
// <group> <operation> *)`, and the matcher accepts nothing looser.
test('the rule-shape matcher round-trips the helper rule and rejects every variant', () => {
  const rule = helperRule('/home/u/.claude/skills/effective-flow', 'memory reserve');
  assert.equal(
    rule,
    'Bash(node /home/u/.claude/skills/effective-flow/scripts/effective-flow-state.mjs memory reserve *)',
  );
  assert.deepEqual(parseHelperRule(rule), {
    skillRoot: '/home/u/.claude/skills/effective-flow',
    operation: 'memory reserve',
  });
  for (const variant of [
    'Bash(node /x/scripts/effective-flow-state.mjs *)',
    'Bash(node /x/scripts/effective-flow-state.mjs memory *)',
    'Bash(node /x/scripts/effective-flow-state.mjs memory reserve)',
    'Bash(node /x/scripts/effective-flow-state.mjs memory reserve extra *)',
    'Bash(node x/scripts/effective-flow-state.mjs memory reserve *)',
    'Bash(node /a b/scripts/effective-flow-state.mjs memory reserve *)',
    'Bash(node /x/../y/scripts/effective-flow-state.mjs memory reserve *)',
    'Bash(node /x//scripts/effective-flow-state.mjs memory reserve *)',
    'Bash(node /x/scripts/other.mjs memory reserve *)',
    'Bash(nodejs /x/scripts/effective-flow-state.mjs memory reserve *)',
  ]) {
    assert.equal(parseHelperRule(variant), null, variant);
  }
  assert.deepEqual(parseHelperRule('Bash(node /x/scripts/effective-flow-state.mjs lock break *)'), {
    skillRoot: '/x',
    operation: 'lock break',
  });
});

// Invariant: widened rules are recognised so the preview can warn about them.
test('widened rules are classified by reason', () => {
  const cases = {
    Bash: 'any-command',
    'Bash(*)': 'any-command',
    'Bash(node *)': 'any-node-command',
    'Bash(node:*)': 'any-node-command',
    'Bash(node /x/scripts/effective-flow-state.mjs *)': 'helper-wildcard',
    'Bash(node /x/scripts/effective-flow-state.mjs lock *)': 'helper-wildcard',
    'Bash(node /x/scripts/effective-flow-state.mjs lock break *)': 'not-allowlisted',
    'Bash(node /x/scripts/effective-flow-state.mjs harness allow-rules *)': 'not-allowlisted',
    'Bash(node /x/scripts/effective-flow-state.mjs memory reserve *)': null,
    'Bash(git status:*)': null,
    'Read(./**)': null,
  };
  for (const [rule, reason] of Object.entries(cases)) {
    assert.equal(widenedRuleReason(rule), reason, rule);
  }
  for (const reason of ['any-command', 'any-node-command', 'helper-wildcard', 'not-allowlisted']) {
    assert.equal(typeof WIDENED_RULE_WARNINGS[reason], 'string');
  }
});

// Invariant: a pattern that does not name the helper but whose prefix covers its path also admits
// `lock break`, so it is widened, also when it pins the documented `<<< '{…}'` here-string; a `~/`
// prefix is expanded with the home directory first.
test('widened rules include every pattern that matches a never-allowlisted helper call', () => {
  const options = {
    helperPaths: [
      '/home/u/.claude/skills/effective-flow/scripts/effective-flow-state.mjs',
      '/home/u/real/effective-flow/scripts/effective-flow-state.mjs',
    ],
    home: '/home/u',
  };
  for (const rule of [
    'Bash(node /home/u/.claude/skills/effective-flow/scripts/*)',
    'Bash(node /home/u/.claude/skills/*)',
    'Bash(node ~/.claude/skills/*)',
    'Bash(node /home/u/.claude/skills/effective-flow/scripts:*)',
    'Bash(node /home/u/real/*)',
    'Bash(node /home/u/*/effective-flow/scripts/* lock *)',
    'Bash(node /home/u/.claude/skills/* <<< *)',
  ]) {
    assert.equal(widenedRuleReason(rule, options), 'helper-wildcard', rule);
    assert.equal(widenedRuleReason(rule), null, `${rule} without helper paths`);
  }
  for (const rule of [
    'Bash(node /home/u/other/*)',
    'Bash(node ~/other/*)',
    'Bash(node /home/u/.claude/skills/effective-flow/scripts/build.mjs)',
    'Bash(npm run *)',
    'Bash(node /home/u/.claude/skills/effective-flow/scripts/* memory reserve *)',
  ]) {
    assert.equal(widenedRuleReason(rule, options), null, rule);
  }
});

// Invariant: only a JSON object with an object `permissions` and a string-array `allow` parses.
test('parseSettings accepts the settings shape and rejects every other one', () => {
  assert.deepEqual(parseSettings('{}').allow, []);
  assert.deepEqual(parseSettings('{"permissions":{"deny":["x"]}}').allow, []);
  assert.deepEqual(parseSettings('{"permissions":{"allow":["a","b"]}}').allow, ['a', 'b']);
  for (const text of [
    '',
    '{',
    '[]',
    '"x"',
    'null',
    '{"permissions":[]}',
    '{"permissions":{"allow":"Bash"}}',
    '{"permissions":{"allow":[1]}}',
  ]) {
    assert.throws(() => parseSettings(text), { code: 'SETTINGS_INVALID' }, text);
  }
});

// ---------------------------------------------------------------------------------------------
// Input and gates

// Invariant: the input key set is closed, `digest` belongs to `apply` only, and `apply` needs it.
test('allow-rules rejects unknown keys, a bad mode and a misplaced digest before git', async () => {
  const runner = unreachableRunner();
  const base = { cwd: '/nonexistent', skillRoot: '/x' };
  for (const input of [
    { ...base, mode: 'preview', rules: [] },
    { ...base, mode: 'write' },
    { ...base },
    { ...base, mode: 'preview', digest: 'a'.repeat(64) },
    { ...base, mode: 'apply' },
    { ...base, mode: 'apply', digest: 'xyz' },
    { cwd: '/nonexistent', mode: 'preview' },
    { cwd: '/nonexistent', skillRoot: 7, mode: 'preview' },
  ]) {
    expectError(
      await executeOperation('harness allow-rules', input, { runner, env: CLAUDE_ENV }),
      'INVALID_INPUT',
    );
  }
});

// Invariant: outside Claude Code nothing is written and no git call runs: UNSUPPORTED_HARNESS.
test('allow-rules without CLAUDECODE is UNSUPPORTED_HARNESS and writes nothing', async (t) => {
  const root = fakeRoot(t);
  const installed = install(t);
  for (const env of [{}, { CLAUDECODE: '' }]) {
    for (const mode of ['preview', 'apply']) {
      const envelope = await executeOperation(
        'harness allow-rules',
        {
          cwd: root,
          skillRoot: installed.skillRoot,
          mode,
          ...(mode === 'apply' ? { digest: 'a'.repeat(64) } : {}),
        },
        { runner: unreachableRunner(), env, helperPath: installed.helperPath },
      );
      expectOutcome(envelope, 'UNSUPPORTED_HARNESS');
    }
  }
  assert.equal(existsSync(join(root, '.claude')), false);
});

// ---------------------------------------------------------------------------------------------
// Install path checks

// Invariant: a `skillRoot` that is not absolute, not normalized, or carries a metacharacter is
// refused, with no rules to enter by hand.
test('allow-rules refuses relative, unnormalized and metacharacter skill roots', async (t) => {
  const root = fakeRoot(t);
  const installed = install(t);
  const cases = {
    'relative/effective-flow': 'not-absolute',
    [`${installed.skillRoot}/`]: 'not-normalized',
    [`${installed.base}/skills/../skills/effective-flow`]: 'not-normalized',
  };
  for (const character of [
    ...[' ', '\t', "'", '"', '$', '`', '\\', '*', '(', ')', '\u0007'],
    ...['?', '[', ']', '{', '}', '~', ';', '&', '|', '<', '>', '!', '#', '%', ',', '=', 'ü'],
  ]) {
    cases[`${installed.base}/a${character}b`] = 'forbidden-character';
  }
  for (const [skillRoot, reason] of Object.entries(cases)) {
    const outcome = expectOutcome(
      await allowRules(root, { ...installed, skillRoot }),
      'UNSUPPORTED_PATH',
    );
    assert.equal(outcome.reason, reason, skillRoot);
    assert.deepEqual(outcome.rules, []);
  }
  assert.ok(UNSUPPORTED_PATH_REASONS.includes('forbidden-character'));
});

// Invariant: a rule may only name an install whose helper resolves to the running helper.
test('allow-rules refuses a skill root whose helper is not the running helper', async (t) => {
  const root = fakeRoot(t);
  const installed = install(t);
  const other = install(t, 'other');
  const mismatch = expectOutcome(
    await allowRules(root, { ...other, helperPath: installed.helperPath }),
    'UNSUPPORTED_PATH',
  );
  assert.equal(mismatch.reason, 'helper-mismatch');
  assert.equal(mismatch.rules.length, 6, 'the rules are shown for manual entry');
  rmSync(join(other.real, 'scripts', 'effective-flow-state.mjs'));
  const missing = expectOutcome(
    await allowRules(root, { ...other, helperPath: installed.helperPath }),
    'UNSUPPORTED_PATH',
  );
  assert.equal(missing.reason, 'helper-mismatch');
});

// Invariant: an install below the runtime-state root or inside any worktree `git worktree list`
// reports for this repository is refused; an install in another clone is accepted.
test('allow-rules refuses the runtime root and worktrees of the current repository', async (t) => {
  const root = fakeRoot(t);
  const linked = fakeRoot(t, 'effective-flow-linked-');
  const inWorktree = install(t, 'in-worktree');
  const worktreeList = () => ({
    status: 0,
    stdout: `worktree ${root}\0HEAD 0\0\0worktree ${inWorktree.base}\0HEAD 0\0detached\0\0`,
    stderr: '',
  });
  const refused = expectOutcome(
    await allowRules(root, inWorktree, {}, { git: { worktree: worktreeList } }),
    'UNSUPPORTED_PATH',
  );
  assert.equal(refused.reason, 'inside-repository-worktree');
  assert.equal(refused.path, inWorktree.base);

  mkdirSync(join(root, 'vendor', 'scripts'), { recursive: true });
  writeFileSync(join(root, 'vendor', 'scripts', 'effective-flow-state.mjs'), '');
  const inRoot = expectOutcome(
    await allowRules(root, {
      skillRoot: join(root, 'vendor'),
      helperPath: join(root, 'vendor', 'scripts', 'effective-flow-state.mjs'),
    }),
    'UNSUPPORTED_PATH',
  );
  assert.equal(inRoot.reason, 'inside-runtime-root');

  const anotherClone = install(t, 'another-clone');
  mkdirSync(join(anotherClone.base, '.git'));
  expectOk(await allowRules(linked, anotherClone, {}, { git: { worktree: worktreeList } }));
});

// Invariant: an install outside the repository whose `scripts/` or helper file is a link into the
// runtime-state root or a worktree of this repository is refused, because the repository's own
// content would decide what the auto-approved helper runs.
test('allow-rules refuses an install whose helper resolves into the repository', async (t) => {
  const root = fakeRoot(t);
  const inRepo = join(root, 'vendor', 'effective-flow', 'scripts');
  mkdirSync(inRepo, { recursive: true });
  writeFileSync(join(inRepo, 'effective-flow-state.mjs'), '// helper\n');
  const helperInRepo = join(inRepo, 'effective-flow-state.mjs');

  const scriptsLink = install(t, 'scripts-link');
  rmSync(join(scriptsLink.real, 'scripts'), { recursive: true });
  symlinkSync(inRepo, join(scriptsLink.real, 'scripts'));
  const viaScripts = expectOutcome(
    await allowRules(root, { ...scriptsLink, helperPath: helperInRepo }),
    'UNSUPPORTED_PATH',
  );
  assert.equal(viaScripts.reason, 'inside-runtime-root');
  assert.ok(viaScripts.path.startsWith(`${root}/`), viaScripts.path);
  assert.equal(viaScripts.rules.length, 6, 'the rules are shown for manual entry');

  const fileLink = install(t, 'file-link');
  rmSync(join(fileLink.real, 'scripts', 'effective-flow-state.mjs'));
  symlinkSync(helperInRepo, join(fileLink.real, 'scripts', 'effective-flow-state.mjs'));
  const viaFile = expectOutcome(
    await allowRules(root, { ...fileLink, helperPath: helperInRepo }),
    'UNSUPPORTED_PATH',
  );
  assert.equal(viaFile.reason, 'inside-runtime-root');

  // The same link into a linked worktree of this repository, listed by `git worktree list`.
  const linked = fakeRoot(t, 'effective-flow-linked-worktree-');
  const inWorktree = join(linked, 'scripts');
  mkdirSync(inWorktree);
  writeFileSync(join(inWorktree, 'effective-flow-state.mjs'), '// helper\n');
  const worktreeLink = install(t, 'worktree-link');
  rmSync(join(worktreeLink.real, 'scripts'), { recursive: true });
  symlinkSync(inWorktree, join(worktreeLink.real, 'scripts'));
  const worktreeList = () => ({
    status: 0,
    stdout: `worktree ${root}\0HEAD 0\0\0worktree ${linked}\0HEAD 0\0detached\0\0`,
    stderr: '',
  });
  const viaWorktree = expectOutcome(
    await allowRules(
      root,
      { ...worktreeLink, helperPath: join(inWorktree, 'effective-flow-state.mjs') },
      {},
      { git: { worktree: worktreeList } },
    ),
    'UNSUPPORTED_PATH',
  );
  assert.equal(viaWorktree.reason, 'inside-repository-worktree');
  assert.equal(viaWorktree.path, linked);
});

// Invariant: a skill root `realpath` cannot resolve is UNSUPPORTED_PATH `unresolvable`, never an
// INTERNAL_ERROR, and a chain walk that lands somewhere other than the running helper is
// `helper-mismatch`.
test('allow-rules maps an unresolvable root and a diverging chain to UNSUPPORTED_PATH', async (t) => {
  const root = fakeRoot(t);
  const installed = install(t);
  const failingRoot = {
    realpath: async (target, ...rest) => {
      if (target === installed.skillRoot) {
        throw Object.assign(new Error('injected EACCES'), { code: 'EACCES' });
      }
      return realpathPath(target, ...rest);
    },
  };
  const unresolvable = expectOutcome(
    await allowRules(root, installed, {}, { fs: failingRoot }),
    'UNSUPPORTED_PATH',
  );
  assert.equal(unresolvable.reason, 'unresolvable');
  assert.equal(unresolvable.detail, 'EACCES');

  // `realpath` claims the other install's helper is the running one; the walk disagrees.
  const other = install(t, 'diverging');
  const lying = {
    realpath: async (target, ...rest) =>
      target === join(other.skillRoot, 'scripts', 'effective-flow-state.mjs')
        ? installed.helperPath
        : realpathPath(target, ...rest),
  };
  const diverging = expectOutcome(
    await allowRules(root, { ...other, helperPath: installed.helperPath }, {}, { fs: lying }),
    'UNSUPPORTED_PATH',
  );
  assert.equal(diverging.reason, 'helper-mismatch');
  assert.equal(diverging.path, other.helperPath);
});

// Invariant: only a missing helper (ENOENT/ENOTDIR) is `helper-mismatch`; any other `realpath`
// failure on the helper path, such as EACCES, is `unresolvable`.
test('allow-rules maps an EACCES on the helper path to unresolvable', async (t) => {
  const root = fakeRoot(t);
  const installed = install(t);
  const failingHelper = {
    realpath: async (target, ...rest) => {
      if (target === join(installed.skillRoot, 'scripts', 'effective-flow-state.mjs')) {
        throw Object.assign(new Error('injected EACCES'), { code: 'EACCES' });
      }
      return realpathPath(target, ...rest);
    },
  };
  const outcome = expectOutcome(
    await allowRules(root, installed, {}, { fs: failingHelper }),
    'UNSUPPORTED_PATH',
  );
  assert.equal(outcome.reason, 'unresolvable');
  assert.equal(outcome.detail, 'EACCES');
});

// Invariant: the resolution chain follows a relative `../` link against the link's directory and a
// chain of links, records every consulted directory, and stops after the hop limit.
test('resolutionChain resolves relative and chained links and bounds the hops', async (t) => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-chain-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const fs = { lstat: lstatPath, readlink: readlinkPath };
  mkdirSync(join(base, 'real', 'scripts'), { recursive: true });
  writeFileSync(join(base, 'real', 'scripts', 'helper.mjs'), '');
  mkdirSync(join(base, 'links'));
  symlinkSync('../real', join(base, 'links', 'relative'));
  const relative = await resolutionChain(
    fs,
    join(base, 'links', 'relative', 'scripts', 'helper.mjs'),
  );
  assert.equal(relative.resolved, join(base, 'real', 'scripts', 'helper.mjs'));
  for (const directory of [
    join(base, 'links'),
    join(base, 'real'),
    join(base, 'real', 'scripts'),
  ]) {
    assert.ok(relative.directories.includes(directory), directory);
  }

  mkdirSync(join(base, 'hop'));
  symlinkSync(join(base, 'links', 'relative'), join(base, 'hop', 'first'));
  symlinkSync('first', join(base, 'hop', 'second'));
  const chained = await resolutionChain(fs, join(base, 'hop', 'second', 'scripts', 'helper.mjs'));
  assert.equal(chained.resolved, join(base, 'real', 'scripts', 'helper.mjs'));
  assert.ok(chained.directories.includes(join(base, 'hop')));
  assert.ok(chained.directories.includes(join(base, 'links')));

  mkdirSync(join(base, 'loop'));
  symlinkSync('b', join(base, 'loop', 'a'));
  symlinkSync('a', join(base, 'loop', 'b'));
  await assert.rejects(resolutionChain(fs, join(base, 'loop', 'a', 'x')), /too many links/);
});

// Invariant: a group is private only when it is the owner's primary group, no other user has it
// as primary group, and no other user is a listed member; unreadable account files fail closed.
test('isPrivateGroupIn and systemAccounts decide the private group and fail closed', async () => {
  const users = [
    ['root', 'x', '0', '0'],
    ['alice', 'x', '1000', '1000'],
    ['bob', 'x', '1001', '1001'],
    ['carol', 'x', '1002', '1001'],
    ['dave', 'x', '1003', '2000'],
  ];
  const groups = [
    ['alice', 'x', '1000', ''],
    ['bob', 'x', '1001', ''],
    ['dave', 'x', '2000', 'dave,erin'],
    ['staff', 'x', '3000', 'alice'],
  ];
  assert.equal(isPrivateGroupIn(users, groups, 1000, 1000), true, 'own primary, no members');
  assert.equal(isPrivateGroupIn(users, groups, 1001, 1001), false, 'carol shares the primary gid');
  assert.equal(isPrivateGroupIn(users, groups, 2000, 1003), false, 'erin is a listed member');
  assert.equal(isPrivateGroupIn(users, groups, 3000, 1000), false, 'not the primary group');
  assert.equal(isPrivateGroupIn(users, groups, 1000, 4242), false, 'unknown owner');
  const selfListed = [['alice', 'x', '1000', 'alice']];
  assert.equal(isPrivateGroupIn(users, selfListed, 1000, 1000), true, 'the owner may be listed');

  const files = {
    '/etc/passwd': users.map((fields) => fields.join(':')).join('\n'),
    '/etc/group': ['# comment', ...groups.map((fields) => fields.join(':'))].join('\n'),
  };
  const readable = systemAccounts({ read: async (file) => files[file] });
  assert.equal(await readable.isPrivateGroup(1000, 1000), true);
  assert.equal(await readable.isPrivateGroup(1001, 1001), false);
  const unreadable = systemAccounts({
    read: async () => {
      throw Object.assign(new Error('injected EACCES'), { code: 'EACCES' });
    },
  });
  assert.equal(await unreadable.isPrivateGroup(1000, 1000), false);
});

// Invariant: a directory on the symlinked or the resolved chain that a principal other than its
// owner and root can write is refused, because it could re-point or replace the helper.
test('allow-rules refuses a foreign-writable directory on either chain', async (t) => {
  const root = fakeRoot(t);
  const symlinked = install(t, 'symlinked-chain');
  chmodSync(join(symlinked.base, 'skills'), 0o777);
  const onLink = expectOutcome(await allowRules(root, symlinked), 'UNSUPPORTED_PATH');
  assert.equal(onLink.reason, 'foreign-writable');
  assert.equal(onLink.path, join(symlinked.base, 'skills'));
  assert.equal(onLink.detail, 'world-writable');

  const resolved = install(t, 'resolved-chain');
  chmodSync(join(resolved.real, 'scripts'), 0o775);
  const shared = expectOutcome(
    await allowRules(root, resolved, {}, { accounts: SHARED_GROUPS }),
    'UNSUPPORTED_PATH',
  );
  assert.equal(shared.reason, 'foreign-writable');
  assert.equal(shared.path, join(resolved.real, 'scripts'));
  assert.equal(shared.detail, 'group-writable');

  // A private owner group may write.
  expectOk(await allowRules(root, resolved, {}, { accounts: PRIVATE_GROUPS }));
});

// Invariant: the private-group exemption applies to the symlinked chain as to the resolved one: a
// group-writable directory there is accepted for a private owner group and refused for a shared one.
test('allow-rules distinguishes a private group from a shared one on the symlinked chain', async (t) => {
  const root = fakeRoot(t);
  const installed = install(t, 'symlinked-group');
  const linkDir = join(installed.base, 'skills');
  chmodSync(linkDir, 0o775);
  const shared = expectOutcome(
    await allowRules(root, installed, {}, { accounts: SHARED_GROUPS }),
    'UNSUPPORTED_PATH',
  );
  assert.equal(shared.reason, 'foreign-writable');
  assert.equal(shared.path, linkDir);
  assert.equal(shared.detail, 'group-writable');
  expectOk(await allowRules(root, installed, {}, { accounts: PRIVATE_GROUPS }));
});

// Invariant: a world-writable directory is accepted only when it is sticky and owned by root, as
// `/tmp`; the same mode owned by another user is refused.
test('allow-rules accepts a sticky root-owned directory and refuses a sticky user-owned one', async (t) => {
  const root = fakeRoot(t);
  const installed = install(t, 'sticky');
  const sticky = join(installed.base, 'skills');
  const fakeMode = (uid) => ({
    lstat: async (target, ...rest) => {
      const info = await lstatPath(target, ...rest);
      if (target !== sticky) return info;
      return Object.assign(Object.create(Object.getPrototypeOf(info)), info, {
        mode: (info.mode & ~0o7777) | 0o1777,
        uid,
      });
    },
  });
  expectOk(await allowRules(root, installed, {}, { fs: fakeMode(0) }));
  const refused = expectOutcome(
    await allowRules(root, installed, {}, { fs: fakeMode(4242) }),
    'UNSUPPORTED_PATH',
  );
  assert.equal(refused.path, sticky);
});

// ---------------------------------------------------------------------------------------------
// Settings merge

// Invariant: the apply writes exactly the six allowlisted rules and never one for `lock break` or
// `harness allow-rules`; it creates a missing `.claude/` on apply only.
test('apply writes exactly the six allowlisted rules and creates .claude on apply only', async (t) => {
  const root = fakeRoot(t);
  const installed = install(t);
  const preview = expectOk(await allowRules(root, installed));
  assert.equal(existsSync(join(root, '.claude')), false, 'preview creates nothing');
  assert.equal(preview.settingsExists, false);
  assert.deepEqual(
    preview.added,
    ALLOWLISTED_OPERATIONS.map((operation) => helperRule(installed.skillRoot, operation)),
  );
  expectOk(await allowRules(root, installed, { mode: 'apply', digest: preview.digest }));
  const allow = JSON.parse(readFileSync(settingsPath(root), 'utf8')).permissions.allow;
  assert.deepEqual(allow, preview.added);
  assert.ok(!allow.some((rule) => / lock break | harness allow-rules /.test(rule)));
  assert.ok(lstatSync(join(root, '.claude')).isDirectory());
});

// Invariant: every foreign key and rule keeps its place; missing rules are appended idempotently.
test('apply keeps foreign keys and rules in order and is idempotent', async (t) => {
  const root = fakeRoot(t);
  const installed = install(t);
  const own = helperRule(installed.skillRoot, 'lock inspect');
  writeSettings(root, {
    model: 'x',
    permissions: { allow: ['Bash(git status:*)', own, 'Read(./**)'], deny: ['Bash(rm *)'] },
    hooks: { PreToolUse: [] },
  });
  const { preview, applied } = await previewAndApply(root, installed);
  assert.equal(preview.added.length, 5);
  assert.equal(applied.applied, true);
  const settings = JSON.parse(readFileSync(settingsPath(root), 'utf8'));
  assert.deepEqual(Object.keys(settings), ['model', 'permissions', 'hooks']);
  assert.deepEqual(settings.permissions.deny, ['Bash(rm *)']);
  assert.deepEqual(settings.permissions.allow.slice(0, 3), [
    'Bash(git status:*)',
    own,
    'Read(./**)',
  ]);
  assert.equal(settings.permissions.allow.length, 8);

  const before = readFileSync(settingsPath(root));
  const again = await previewAndApply(root, installed);
  assert.equal(again.preview.changed, false);
  assert.deepEqual(again.preview.added, []);
  assert.equal(again.applied.applied, false);
  assert.deepEqual(readFileSync(settingsPath(root)), before);
});

// Invariant: rules of another install whose helper no longer resolves are removed; those of a live
// other install are kept and listed; both appear in the preview.
test('apply removes a dead install and keeps a live other install', async (t) => {
  const root = fakeRoot(t);
  const installed = install(t);
  const live = install(t, 'live-other');
  const dead = helperRule('/nonexistent/old-install/effective-flow', 'memory reserve');
  const deadBreak = helperRule('/nonexistent/old-install/effective-flow', 'lock break');
  const liveRule = helperRule(live.skillRoot, 'lock acquire');
  writeSettings(root, { permissions: { allow: [dead, liveRule, 'Bash(ls)', deadBreak] } });
  const { preview } = await previewAndApply(root, installed);
  assert.deepEqual(preview.removed, [dead, deadBreak]);
  assert.deepEqual(preview.keptOtherInstalls, [{ rule: liveRule, skillRoot: live.skillRoot }]);
  const allow = JSON.parse(readFileSync(settingsPath(root), 'utf8')).permissions.allow;
  assert.deepEqual(allow.slice(0, 2), [liveRule, 'Bash(ls)']);
  assert.ok(!allow.includes(dead));
});

// Invariant: a widened rule is warned about and never removed.
test('preview warns about widened rules and leaves them in place', async (t) => {
  const root = fakeRoot(t);
  const installed = install(t);
  const widened = [
    'Bash(node *)',
    `Bash(node ${installed.skillRoot}/scripts/effective-flow-state.mjs *)`,
    helperRule(installed.skillRoot, 'lock break'),
  ];
  writeSettings(root, { permissions: { allow: widened } });
  const { preview } = await previewAndApply(root, installed);
  assert.deepEqual(
    preview.warnings.map(({ rule, reason }) => [rule, reason]),
    [
      [widened[0], 'any-node-command'],
      [widened[1], 'helper-wildcard'],
      [widened[2], 'not-allowlisted'],
    ],
  );
  for (const warning of preview.warnings) assert.equal(typeof warning.message, 'string');
  const allow = JSON.parse(readFileSync(settingsPath(root), 'utf8')).permissions.allow;
  assert.deepEqual(allow.slice(0, 3), widened);
});

// Invariant: apply applies exactly the previewed change set: another digest, or a change to the
// file since the preview, is PREVIEW_MISMATCH and nothing is written.
test('apply is bound to the preview digest', async (t) => {
  const root = fakeRoot(t);
  const installed = install(t);
  writeSettings(root, { permissions: { allow: [] } });
  const preview = expectOk(await allowRules(root, installed));
  const wrong = expectOutcome(
    await allowRules(root, installed, { mode: 'apply', digest: 'b'.repeat(64) }),
    'PREVIEW_MISMATCH',
  );
  assert.equal(wrong.reason, 'digest-mismatch');
  writeSettings(root, { permissions: { allow: ['Bash(ls)'] } });
  const changed = expectOutcome(
    await allowRules(root, installed, { mode: 'apply', digest: preview.digest }),
    'PREVIEW_MISMATCH',
  );
  assert.equal(changed.reason, 'digest-mismatch');
  assert.deepEqual(JSON.parse(readFileSync(settingsPath(root), 'utf8')).permissions.allow, [
    'Bash(ls)',
  ]);
});

// Invariant: a concurrent write between the read and the rename (Claude Code's own "don't ask
// again") is PREVIEW_MISMATCH and keeps the concurrent content.
test('apply re-checks the settings identity and digest right before the rename', async (t) => {
  const root = fakeRoot(t);
  const installed = install(t);
  writeSettings(root, { permissions: { allow: [] } });
  const preview = expectOk(await allowRules(root, installed));
  const concurrent = `${JSON.stringify({ permissions: { allow: ['Bash(node *)'] } })}\n`;
  const onPhase = (name) => {
    if (name === 'beforeRename') writeFileSync(settingsPath(root), concurrent);
  };
  const outcome = expectOutcome(
    await allowRules(root, installed, { mode: 'apply', digest: preview.digest }, { onPhase }),
    'PREVIEW_MISMATCH',
  );
  assert.equal(outcome.reason, 'changed-before-write');
  assert.equal(readFileSync(settingsPath(root), 'utf8'), concurrent);
});

// Invariant: an unparsable settings file is SETTINGS_INVALID and is never rewritten.
test('an unparsable settings file is SETTINGS_INVALID with no write', async (t) => {
  const installed = install(t);
  for (const content of ['{', '[]', '{"permissions":{"allow":"Bash"}}']) {
    const root = fakeRoot(t);
    writeSettings(root, content);
    expectOutcome(await allowRules(root, installed), 'SETTINGS_INVALID');
    assert.equal(readFileSync(settingsPath(root), 'utf8'), content);
  }
});

// Invariant: a tracked or unignored settings file is refused before anything is written.
test('a tracked or unignored settings file is refused', async (t) => {
  const installed = install(t);
  const notIgnored = fakeRoot(t);
  const outcome = expectOutcome(
    await allowRules(
      notIgnored,
      installed,
      {},
      {
        git: { 'check-ignore': () => ({ status: 1, stdout: '', stderr: '' }) },
      },
    ),
    'SETTINGS_NOT_IGNORED',
  );
  assert.equal(outcome.path, '.claude/settings.local.json');
  const tracked = fakeRoot(t);
  expectOutcome(
    await allowRules(
      tracked,
      installed,
      {},
      {
        git: {
          'ls-files': (args) =>
            args.at(-1) === '.claude/settings.local.json'
              ? { status: 0, stdout: '.claude/settings.local.json\0', stderr: '' }
              : undefined,
        },
      },
    ),
    'SETTINGS_TRACKED',
  );
  assert.equal(existsSync(join(notIgnored, '.claude')), false);
  assert.equal(existsSync(join(tracked, '.claude')), false);
});

// Invariant: a symlinked `.claude/` or settings file is never written through.
test('a symlinked .claude directory or settings file is UNSAFE_TARGET', async (t) => {
  const installed = install(t);
  const root = fakeRoot(t);
  const elsewhere = join(root, 'elsewhere');
  mkdirSync(elsewhere);
  symlinkSync(elsewhere, join(root, '.claude'));
  expectError(await allowRules(root, installed), 'UNSAFE_TARGET');

  const fileLink = fakeRoot(t);
  mkdirSync(join(fileLink, '.claude'));
  writeFileSync(join(fileLink, 'real.json'), '{}');
  symlinkSync(join(fileLink, 'real.json'), settingsPath(fileLink));
  expectError(await allowRules(fileLink, installed), 'UNSAFE_TARGET');
  assert.equal(readFileSync(join(fileLink, 'real.json'), 'utf8'), '{}');
});

// Invariant: the preview warns about a path-prefix rule that covers this install's helper, because
// it auto-approves `lock break` too, and leaves it in place.
test('preview warns about a prefix rule over the install path', async (t) => {
  const root = fakeRoot(t);
  const installed = install(t);
  const prefix = `Bash(node ${installed.base}/skills/*)`;
  const resolvedPrefix = `Bash(node ${installed.real}/scripts/*)`;
  writeSettings(root, {
    permissions: { allow: [prefix, resolvedPrefix, 'Bash(node /elsewhere/*)'] },
  });
  const preview = expectOk(await allowRules(root, installed));
  assert.deepEqual(
    preview.warnings.map(({ rule, reason }) => [rule, reason]),
    [
      [prefix, 'helper-wildcard'],
      [resolvedPrefix, 'helper-wildcard'],
    ],
  );
});

// Invariant: a settings refusal on the write path is the same exit-4 outcome as on the read path,
// never INTERNAL_ERROR, and a first write runs the settings guard exactly twice (read and write).
test('apply maps a write-path settings refusal to its outcome and guards twice', async (t) => {
  const installed = install(t);
  const counted = fakeRoot(t);
  const { runner, calls } = fakeGit(counted);
  const preview = expectOk(await allowRules(counted, installed, {}, { runner }));
  const before = calls.length;
  expectOk(
    await allowRules(counted, installed, { mode: 'apply', digest: preview.digest }, { runner }),
  );
  const settingsProbes = calls
    .slice(before)
    .filter((call) => call.args.at(-1) === '.claude/settings.local.json');
  assert.deepEqual(
    settingsProbes.map((call) => call.args[2]),
    ['ls-files', 'check-ignore', 'ls-files', 'check-ignore'],
  );

  for (const [code, git] of [
    [
      'SETTINGS_NOT_IGNORED',
      (count) => ({
        'check-ignore': () =>
          ++count.value === 2 ? { status: 1, stdout: '', stderr: '' } : undefined,
      }),
    ],
    [
      'SETTINGS_TRACKED',
      (count) => ({
        'ls-files': (args) =>
          args.at(-1) === '.claude/settings.local.json' && ++count.value === 2
            ? { status: 0, stdout: '.claude/settings.local.json\0', stderr: '' }
            : undefined,
      }),
    ],
  ]) {
    const root = fakeRoot(t);
    const fresh = expectOk(await allowRules(root, installed));
    const outcome = expectOutcome(
      await allowRules(
        root,
        installed,
        { mode: 'apply', digest: fresh.digest },
        { git: git({ value: 0 }) },
      ),
      code,
    );
    assert.equal(outcome.path, '.claude/settings.local.json');
    assert.equal(existsSync(settingsPath(root)), false);
  }
});
