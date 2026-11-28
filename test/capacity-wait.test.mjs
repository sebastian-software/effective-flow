// Invariants protected (issue #829): `schedule` is a pure clock-driven decision (delays 60/120/300/600 s,
// the last repeating, capped one second before the deadline anchored at the first refusal and never
// moved, no attempt at or after the deadline, with a zero budget, after cancellation or at a zero
// host cap); the `Capacity wait:` line is parsed and written strictly; `forge-line` renders only the
// redacted `not executed (capacity); attempts: <n>`; `bind` and `verify` report the checkout identity
// and name every drifted field; the CLI answers every failure with one error envelope.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createProcessRunner } from '../src/scripts/config-resolve-core.mjs';
import {
  CAPACITY_STATE,
  executeOperation,
  exitCodeFor,
  forgeLine,
  formatCapacityWait,
  parseCapacityWait,
  parseInstant,
  schedule,
} from '../src/scripts/capacity-wait-core.mjs';
import { main } from '../src/scripts/capacity-wait.mjs';

const T0 = '2026-11-27T12:00:00Z';
const at = (seconds) => new Date(Date.parse(T0) + seconds * 1000).toISOString().slice(0, 19) + 'Z';

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

function repository(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-capacity-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '--quiet', '--initial-branch=main');
  writeFileSync(join(root, 'tracked.txt'), 'tracked\n');
  git(root, 'add', 'tracked.txt');
  git(root, 'commit', '--quiet', '-m', 'fixture');
  return root;
}

const deps = { runner: createProcessRunner(), env: GIT_ENV };

// ---------------------------------------------------------------------------------------------
// schedule

test('schedule: delays follow 60/120/300/600 s and the last repeats', () => {
  const delays = [1, 2, 3, 4, 5, 9].map(
    (attempts) =>
      schedule({ budgetMinutes: 600, attempts, firstRefusalAt: T0, now: T0 }).delaySeconds,
  );
  assert.deepEqual(delays, [60, 120, 300, 600, 600, 600]);
  const first = schedule({ budgetMinutes: 120, attempts: 1, firstRefusalAt: T0, now: T0 });
  assert.equal(first.action, 'retry');
  assert.equal(first.retryAt, at(60));
});

test('schedule: the deadline is the first refusal plus the budget and is kept when handed', () => {
  const anchored = schedule({ budgetMinutes: 30, attempts: 1, firstRefusalAt: T0, now: at(10) });
  assert.equal(anchored.deadline, at(1800));
  assert.equal(anchored.elapsedSeconds, 10);
  assert.equal(anchored.line, `budget=30m; deadline=${at(1800)}`);
  // A later call with the handed deadline never moves it, whatever the budget says.
  const handed = schedule({
    budgetMinutes: 500,
    attempts: 2,
    deadline: at(1800),
    firstRefusalAt: T0,
    now: at(100),
  });
  assert.equal(handed.deadline, at(1800));
  // Without a first refusal time, now anchors it.
  const unanchored = schedule({ budgetMinutes: 1, attempts: 1, now: T0 });
  assert.equal(unanchored.firstRefusalAt, T0);
  assert.equal(unanchored.deadline, at(60));
});

test('schedule: the delay is capped one second before the deadline', () => {
  const result = schedule({
    budgetMinutes: 10,
    attempts: 4,
    deadline: at(100),
    firstRefusalAt: T0,
    now: at(20),
  });
  assert.equal(result.action, 'retry');
  assert.equal(result.delaySeconds, 79);
  assert.equal(result.retryAt, at(99));
});

test('schedule: stops at or after the deadline, one second before it included', () => {
  for (const now of [at(100), at(99), at(150)]) {
    const result = schedule({
      budgetMinutes: 10,
      attempts: 1,
      deadline: at(100),
      firstRefusalAt: T0,
      now,
    });
    assert.equal(result.action, 'stop');
    assert.equal(result.stop, 'deadline');
  }
  const last = schedule({
    budgetMinutes: 10,
    attempts: 1,
    deadline: at(100),
    firstRefusalAt: T0,
    now: at(98),
  });
  assert.equal(last.action, 'retry');
  assert.equal(last.delaySeconds, 1);
});

test('schedule: budget zero, cancellation and a zero host cap stop with their reason', () => {
  assert.equal(schedule({ budgetMinutes: 0, attempts: 1, now: T0 }).stop, 'budget-zero');
  assert.equal(
    schedule({ budgetMinutes: 60, attempts: 1, now: T0, cancelled: true }).stop,
    'cancelled',
  );
  // Cancellation wins over a zero budget.
  assert.equal(
    schedule({ budgetMinutes: 0, attempts: 1, now: T0, cancelled: true }).stop,
    'cancelled',
  );
  assert.equal(
    schedule({ budgetMinutes: 60, attempts: 1, now: T0, hostMaxWaitSeconds: 0 }).stop,
    'host-limit',
  );
});

test('schedule: the host cap shortens the delay and an unset cap does not', () => {
  const capped = schedule({
    budgetMinutes: 60,
    attempts: 3,
    now: T0,
    hostMaxWaitSeconds: 45,
  });
  assert.equal(capped.action, 'retry');
  assert.equal(capped.delaySeconds, 45);
  const free = schedule({ budgetMinutes: 60, attempts: 3, now: T0, hostMaxWaitSeconds: null });
  assert.equal(free.delaySeconds, 300);
});

test('schedule: an injected clock supplies now when the input carries none', () => {
  const result = schedule({ budgetMinutes: 5, attempts: 1 }, { now: () => Date.parse(T0) });
  assert.equal(result.firstRefusalAt, T0);
});

test('schedule: invalid input is refused', async () => {
  const bad = [
    { attempts: 1 },
    { budgetMinutes: 5 },
    { budgetMinutes: -1, attempts: 1 },
    { budgetMinutes: 1.5, attempts: 1 },
    { budgetMinutes: 525601, attempts: 1 },
    { budgetMinutes: 5, attempts: 0 },
    { budgetMinutes: 5, attempts: 1, now: 'yesterday' },
    { budgetMinutes: 5, attempts: 1, now: T0, firstRefusalAt: at(10) },
    { budgetMinutes: 5, attempts: 1, hostMaxWaitSeconds: -1 },
    { budgetMinutes: 5, attempts: 1, cancelled: 'yes' },
    { budgetMinutes: 5, attempts: 1, extra: true },
  ];
  for (const input of bad) {
    const envelope = await executeOperation('schedule', input, {});
    assert.equal(envelope.ok, false, JSON.stringify(input));
    assert.equal(envelope.error.code, 'INVALID_INPUT', JSON.stringify(input));
    assert.equal(exitCodeFor(envelope), 2);
  }
});

// ---------------------------------------------------------------------------------------------
// The Capacity wait line

test('line: formats and parses the canonical value in both anchored and unanchored form', () => {
  assert.equal(
    formatCapacityWait({ budgetMinutes: 120, deadline: null }),
    'budget=120m; deadline=unanchored',
  );
  assert.equal(formatCapacityWait({ budgetMinutes: 0, deadline: T0 }), `budget=0m; deadline=${T0}`);
  assert.deepEqual(parseCapacityWait('budget=120m; deadline=unanchored'), {
    budgetMinutes: 120,
    deadline: null,
  });
  assert.deepEqual(parseCapacityWait(`budget=5m; deadline=${T0}`), {
    budgetMinutes: 5,
    deadline: T0,
  });
});

test('line: parsing is strict about dates, budgets and shape', () => {
  const invalid = [
    'budget=5m; deadline=2026-02-30T00:00:00Z',
    'budget=5m; deadline=2026-11-27T24:00:00Z',
    'budget=5m; deadline=2026-11-27 12:00:00',
    'budget=5m; deadline=2026-11-27T12:00:00+01:00',
    'budget=-1m; deadline=unanchored',
    'budget=05m; deadline=unanchored',
    'budget=1.5m; deadline=unanchored',
    'budget=525601m; deadline=unanchored',
    'budget=5; deadline=unanchored',
    'budget=5m;deadline=unanchored',
    'budget=5m; deadline=',
    'budget=5m; deadline=unanchored extra',
    '',
    null,
    5,
  ];
  for (const value of invalid) assert.equal(parseCapacityWait(value), null, String(value));
  assert.equal(parseInstant('2026-11-27T12:00:00Z'), Date.parse(T0) / 1000);
  assert.equal(parseInstant('2026-13-01T00:00:00Z'), null);
  assert.throws(() => formatCapacityWait({ budgetMinutes: -1, deadline: null }), /budgetMinutes/);
  assert.throws(() => formatCapacityWait({ budgetMinutes: 5, deadline: 'soon' }), /deadline/);
});

// ---------------------------------------------------------------------------------------------
// forge-line

test('forge-line: renders exactly the redacted state and attempt count', () => {
  assert.equal(CAPACITY_STATE, 'not executed (capacity)');
  assert.deepEqual(forgeLine({ attempts: 3 }), { line: 'not executed (capacity); attempts: 3' });
});

test('forge-line: refuses anything but a positive integer attempt count and extra keys', async () => {
  for (const input of [
    {},
    { attempts: 0 },
    { attempts: -2 },
    { attempts: 1.5 },
    { attempts: '2' },
    { attempts: 2, command: 'npm test' },
    [],
  ]) {
    const envelope = await executeOperation('forge-line', input, {});
    assert.equal(envelope.ok, false, JSON.stringify(input));
    assert.equal(envelope.error.code, 'INVALID_INPUT');
  }
});

// ---------------------------------------------------------------------------------------------
// bind and verify

const BIND = (cwd) => ({ cwd, workflow: 'build', runId: 'run-1', gate: 'validation' });

test('bind then verify matches on an unchanged checkout and renders the resume line', async (t) => {
  const root = repository(t);
  const bound = await executeOperation('bind', BIND(root), deps);
  assert.equal(bound.ok, true, JSON.stringify(bound.error));
  const { binding, line } = bound.data;
  assert.equal(binding.root, root);
  assert.equal(binding.branch, 'refs/heads/main');
  assert.equal(binding.head, git(root, 'rev-parse', 'HEAD'));
  assert.equal(line, `Capacity resume: ${JSON.stringify(binding)}`);
  const checked = await executeOperation('verify', { cwd: root, binding }, deps);
  assert.equal(checked.ok, true, JSON.stringify(checked.error));
  assert.equal(checked.data.match, true);
  assert.deepEqual(checked.data.drift, []);
});

test('verify names the drifted input for tracked, untracked and symlink changes', async (t) => {
  const root = repository(t);
  const { binding } = (await executeOperation('bind', BIND(root), deps)).data;
  const drift = async () => (await executeOperation('verify', { cwd: root, binding }, deps)).data;

  writeFileSync(join(root, 'tracked.txt'), 'changed\n');
  assert.deepEqual((await drift()).drift, ['input']);
  git(root, 'checkout', '--', 'tracked.txt');
  assert.equal((await drift()).match, true);

  writeFileSync(join(root, 'new.txt'), 'new\n');
  assert.deepEqual((await drift()).drift, ['input']);
  rmSync(join(root, 'new.txt'));
  assert.equal((await drift()).match, true);

  symlinkSync('tracked.txt', join(root, 'link'));
  assert.deepEqual((await drift()).drift, ['input']);
});

test('verify rejects an untracked mode change or a file replaced with a link to matching text', async (t) => {
  const root = repository(t);
  const file = join(root, 'check');
  writeFileSync(file, 'link:tracked.txt', { mode: 0o644 });
  const { binding } = (await executeOperation('bind', BIND(root), deps)).data;
  const verify = async () => (await executeOperation('verify', { cwd: root, binding }, deps)).data;

  chmodSync(file, 0o755);
  assert.deepEqual((await verify()).drift, ['input']);
  chmodSync(file, 0o644);
  assert.equal((await verify()).match, true);

  rmSync(file);
  symlinkSync('tracked.txt', file);
  assert.deepEqual((await verify()).drift, ['input']);
});

test('bind and verify keep a staged change and its unstaged trial edit intact', async (t) => {
  const root = repository(t);
  const file = join(root, 'tracked.txt');
  writeFileSync(file, 'staged\n');
  git(root, 'add', 'tracked.txt');
  writeFileSync(file, 'trial edit\n');
  const before = git(root, 'status', '--porcelain');
  const { binding } = (await executeOperation('bind', BIND(root), deps)).data;
  const verify = async () => (await executeOperation('verify', { cwd: root, binding }, deps)).data;

  assert.equal((await verify()).match, true);
  assert.equal(git(root, 'status', '--porcelain'), before);
  assert.equal(git(root, 'show', ':tracked.txt'), 'staged');
  assert.match(git(root, 'diff', '--', 'tracked.txt'), /\+trial edit/);

  git(root, 'add', 'tracked.txt');
  assert.deepEqual((await verify()).drift, ['input']);
});

test('verify names head, branch and input when a commit and a branch switch happened', async (t) => {
  const root = repository(t);
  const { binding } = (await executeOperation('bind', BIND(root), deps)).data;
  git(root, 'checkout', '--quiet', '-b', 'other');
  writeFileSync(join(root, 'tracked.txt'), 'second\n');
  git(root, 'commit', '--quiet', '-am', 'second');
  const result = (await executeOperation('verify', { cwd: root, binding }, deps)).data;
  assert.equal(result.match, false);
  assert.deepEqual(result.drift, ['branch', 'head', 'input']);
});

test('verify names the root when the binding came from another checkout', async (t) => {
  const first = repository(t);
  const second = repository(t);
  const { binding } = (await executeOperation('bind', BIND(first), deps)).data;
  const result = (await executeOperation('verify', { cwd: second, binding }, deps)).data;
  assert.equal(result.match, false);
  assert.ok(result.drift.includes('root'));
});

test('bind and verify refuse invalid input and a directory without a repository', async (t) => {
  const root = repository(t);
  const plain = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-capacity-plain-')));
  t.after(() => rmSync(plain, { recursive: true, force: true }));
  mkdirSync(join(plain, 'x'));
  const bound = (await executeOperation('bind', BIND(root), deps)).data;

  for (const input of [
    { ...BIND(root), cwd: 'relative' },
    { ...BIND(root), workflow: 'Bad Name' },
    { ...BIND(root), runId: '' },
    { ...BIND(root), gate: 'UPPER' },
    { cwd: root, workflow: 'build', runId: 'r' },
    { ...BIND(root), extra: 1 },
  ]) {
    const envelope = await executeOperation('bind', input, deps);
    assert.equal(envelope.ok, false, JSON.stringify(input));
    assert.equal(envelope.error.code, 'INVALID_INPUT');
  }
  for (const binding of [
    { ...bound.binding, head: 'abc' },
    { ...bound.binding, version: 2 },
    { ...bound.binding, input: 'nothex' },
    { ...bound.binding, root: 'relative' },
    { ...bound.binding, extra: true },
  ]) {
    const envelope = await executeOperation('verify', { cwd: root, binding }, deps);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'INVALID_INPUT');
  }
  const outside = await executeOperation('bind', BIND(join(plain, 'x')), deps);
  assert.equal(outside.ok, false);
  assert.equal(outside.error.code, 'GIT_FAILED');
  assert.equal(exitCodeFor(outside), 1);
  const noRunner = await executeOperation('bind', BIND(root), {});
  assert.equal(noRunner.error.code, 'INTERNAL_ERROR');
});

// ---------------------------------------------------------------------------------------------
// CLI envelope

async function cli(argv, input, extra = {}) {
  const out = [];
  const err = [];
  let exitCode = 0;
  await main(argv, {
    input,
    stdout: { write: (text) => out.push(text) },
    stderr: { write: (text) => err.push(text) },
    setExitCode: (code) => {
      exitCode = code;
    },
    ...extra,
  });
  assert.equal(out.length, 1);
  assert.ok(out[0].endsWith('\n'));
  return { envelope: JSON.parse(out[0]), exitCode, stderr: err.join('') };
}

test('CLI: a successful operation writes one ok envelope and exits 0', async () => {
  const { envelope, exitCode } = await cli(['forge-line'], { attempts: 2 });
  assert.deepEqual(envelope, {
    ok: true,
    operation: 'forge-line',
    data: { line: 'not executed (capacity); attempts: 2' },
  });
  assert.equal(exitCode, 0);
});

test('CLI: an unknown operation or wrong argument count is an invalid-input envelope', async () => {
  for (const argv of [['nope'], [], ['schedule', 'extra']]) {
    const { envelope, exitCode, stderr } = await cli(argv, {});
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'INVALID_INPUT');
    assert.equal(envelope.error.retryable, false);
    assert.equal(exitCode, 2);
    assert.match(stderr, /^INVALID_INPUT:/);
  }
});

test('CLI: invalid JSON, a non-object and oversized stdin are invalid-input envelopes', async () => {
  const stdinOf = (text) => ({
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(text);
    },
  });
  for (const text of ['{not json', '[1]', '"x"', 'x'.repeat(70 * 1024)]) {
    const { envelope, exitCode } = await cli(['schedule'], undefined, { stdin: stdinOf(text) });
    assert.equal(envelope.ok, false, text.slice(0, 20));
    assert.equal(envelope.error.code, 'INVALID_INPUT');
    assert.equal(exitCode, 2);
  }
  const ok = await cli(['schedule'], undefined, {
    stdin: stdinOf(JSON.stringify({ budgetMinutes: 5, attempts: 1, now: T0 })),
  });
  assert.equal(ok.envelope.ok, true);
  assert.equal(ok.envelope.data.action, 'retry');
});
