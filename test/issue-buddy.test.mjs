import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, createConnection } from 'node:net';
import { EventEmitter, once } from 'node:events';
import { createHash } from 'node:crypto';
import {
  executeOperation,
  fingerprint,
  stableAttemptId,
  validatePassReport,
  SKIP_REASONS,
  MUTEX_WAIT_MS,
} from '../src/scripts/issue-buddy-core.mjs';
import {
  planningClaimAcquire,
  planningClaimKey,
} from '../src/scripts/effective-flow-state-planning-claim-core.mjs';
import { main } from '../src/scripts/issue-buddy.mjs';
import { executeOperation as autopilotOperation } from '../src/scripts/autopilot-core.mjs';
import { createProcessRunner } from '../src/scripts/process-runner.mjs';

const NOW = '2026-10-19T12:00:00.000Z';
const OID = 'a'.repeat(40);
const branch = (issue, prefix = 'effective-flow') =>
  `${prefix ? `${prefix}/` : ''}plan/issue-${issue}`;
const issue = (number = 1, overrides = {}) => ({
  number,
  title: `Issue ${number}`,
  body: 'Trusted body',
  state: 'open',
  user: { login: 'Owner', type: 'User' },
  labels: [],
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});
const pull = (number = 30, n = 1, overrides = {}) => ({
  number,
  title: 'Plan',
  body: '',
  state: 'open',
  html_url: `https://github.com/example/flow/pull/${number}`,
  head: { ref: branch(n), repo: { id: 1, full_name: 'example/flow' } },
  base: { ref: 'develop', repo: { id: 1, full_name: 'example/flow' } },
  ...overrides,
});
// Synthetic, fixture-local ownership for logic tests only; no kernel evidence is inferred.
function controlledFixtureServer() {
  let occupied = false;
  return () => {
    const server = new EventEmitter();
    let held = false;
    server.listen = () => {
      queueMicrotask(() => {
        if (occupied)
          server.emit(
            'error',
            Object.assign(new Error('synthetic fixture occupied'), { code: 'EADDRINUSE' }),
          );
        else {
          occupied = true;
          held = true;
          server.emit('listening');
        }
      });
      return server;
    };
    server.close = (callback) => {
      assert.equal(held, true);
      held = false;
      occupied = false;
      queueMicrotask(callback);
      return server;
    };
    return server;
  };
}
async function fixture(t, values = {}, fixtureOptions = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'issue-buddy-')));
  await fs.mkdir(path.join(root, '.git'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const state = {
    issues: [issue()],
    pulls: [],
    comments: {},
    permission: {},
    history: {},
    branches: [],
    plans: {},
    ...values,
  };
  const calls = [];
  const runner = async (call) => {
    // The planning-claim core addresses Git as `git -C <root> ...`; both forms are one call.
    const args = call.args[0] === '-C' ? call.args.slice(2) : call.args;
    calls.push({ ...call, args });
    fixtureOptions.onCall?.({ ...call, args });
    assert.equal(call.cwd, root);
    const key = args.join(' ');
    const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
    if (call.executable === 'git') {
      if (args.includes('--show-toplevel')) return ok(root);
      if (args.includes('--git-common-dir') || args.includes('--git-dir'))
        return ok(path.join(root, '.git'));
      if (args.includes('--is-inside-work-tree')) return ok('true');
      if (key === 'remote get-url origin')
        return ok(state.origin ?? 'https://github.com/example/flow.git');
      // The batched guard form reports every ignored path back on stdout.
      if (args[0] === 'check-ignore' && args.includes('--stdin'))
        return state.ignored === false
          ? { status: 1, stdout: '', stderr: '' }
          : ok(String(call.stdin ?? ''));
      if (args[0] === 'check-ignore')
        return { status: state.ignored === false ? 1 : 0, stdout: '', stderr: '' };
      if (args[0] === 'ls-files') return ok(state.tracked ?? '');
      if (args[0] === 'fetch')
        return { status: state.fetchFailure ? 1 : 0, stdout: '', stderr: '' };
      if (args[0] === 'rev-parse' && args[1] === '--verify') return ok(state.oid ?? OID);
      if (args[0] === 'ls-tree') {
        assert.equal(args[2], state.oid ?? OID);
        return ok(
          Object.keys(state.plans)
            .map(
              (file, i) =>
                `${state.planModes?.[file] ?? '100644'} blob ${String(i + 1).padStart(40, '0')}\t${file}\0`,
            )
            .join(''),
        );
      }
      if (args[0] === 'cat-file') return ok(Object.values(state.plans)[Number(args[2]) - 1]);
      if (args[0] === 'ls-remote')
        return ok(state.branches.map((ref) => `${OID}\trefs/heads/${ref}`).join('\n'));
      if (args[0] === 'check-ref-format') return ok();
      throw new Error(`unexpected git ${key}`);
    }
    assert.equal(call.executable, 'gh');
    if (args[0] === '--version') return ok('gh version 2.90.0');
    if (args[0] === 'auth') return ok();
    assert.equal(args[0], 'api');
    if (state.forgeFailure && key.includes(state.forgeFailure))
      return { status: 1, stdout: '', stderr: 'fixture failed' };
    const endpoint = args.at(-1);
    const url = new URL(endpoint, 'https://api.github.com/');
    let value;
    if (url.pathname.endsWith('/issues')) value = state.issues;
    else if (url.pathname.endsWith('/pulls'))
      value = url.searchParams.get('head')
        ? (state.history[url.searchParams.get('head')] ?? [])
        : state.pulls;
    else if (/\/issues\/\d+\/comments$/.test(url.pathname))
      value = state.comments[Number(url.pathname.split('/').at(-2))] ?? [];
    else if (url.pathname.endsWith('/permission')) {
      const user = url.pathname.split('/').at(-2);
      value = { permission: state.permission[user] ?? 'write', role_name: 'maintain' };
    } else throw new Error(`unexpected forge ${endpoint}`);
    return ok(JSON.stringify(value));
  };
  // Contention fails fast here; the bounded mutex retry has its own tests.
  const options = {
    runner,
    clock: () => NOW,
    createServer: fixtureOptions.createServer ?? controlledFixtureServer(),
    mutexWaitMs: 0,
  };
  const run = (operation, input = {}, overrides = {}) =>
    executeOperation(operation, { cwd: root, ...input }, { ...options, ...overrides });
  await fixtureOptions.beforeAcquire?.(root);
  const acquired = await run('pass-open');
  assert.equal(acquired.ok, true, JSON.stringify(acquired));
  let passId = acquired.data.passId;
  const collectInput = (extra = {}) => ({
    passId,
    mode: 'publish',
    baseBranch: 'origin/develop',
    planDir: 'docs/plan',
    branchPrefix: 'effective-flow',
    visibility: 'standard',
    ...extra,
  });
  const collect = (extra = {}, overrides) => run('pass-collect', collectInput(extra), overrides);
  const next = async () => {
    assert.equal((await run('pass-close', { passId })).ok, true);
    const opened = await run('pass-open');
    passId = opened.data.passId;
    return passId;
  };
  const record = (collected, verdict = 'failed', extra = {}, overrides) =>
    run(
      'verdict-record',
      {
        passId,
        mode: collected.mode,
        issue: 1,
        fingerprint:
          collected.eligible.find((entry) => (entry.issue ?? 1) === 1)?.fingerprint ??
          collected.authorizedRecovery?.find((entry) => entry.issue === 1)?.fingerprint,
        verdict,
        reason: 'Bounded reason',
        ...extra,
      },
      overrides,
    );
  const report = (collected, extra = {}, overrides) =>
    run(
      'pass-report',
      {
        passId,
        ...(collected ? { collect: collected } : { mode: 'publish' }),
        outcome: 'completed',
        cutOff: 'none',
        verdicts: [],
        pullRequestsOpened: [],
        pullRequestsRecovered: [],
        failures: [],
        ...extra,
      },
      overrides,
    );
  return {
    root,
    state,
    calls,
    options,
    run,
    collect,
    collectInput,
    next,
    record,
    report,
    get passId() {
      return passId;
    },
    passPath: (id = passId) => path.join(root, '.effective-flow/issue-buddy/passes', `${id}.json`),
    cache: async () =>
      JSON.parse(
        await fs.readFile(path.join(root, '.effective-flow/issue-buddy/verdicts.json'), 'utf8'),
      ),
  };
}
async function collected(f, extra) {
  const result = await f.collect(extra);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.data;
}
async function skip(t, name, values, prepare) {
  const f = await fixture(t, values);
  if (prepare) await prepare(f);
  const c = await collected(f);
  assert.deepEqual(c.skipped, [{ issue: 1, reason: name }]);
  return { f, c };
}

// These cases exercise actual kernel ownership; pure logic fixtures use a controlled server.
async function nativeFixture(t, values = {}) {
  return fixture(t, values, { createServer });
}

test('independent logical fixtures collect trust precedence while their native endpoints are occupied', async (t) => {
  const blockers = new Map();
  t.after(async () => {
    for (const blocker of blockers.values()) await new Promise((resolve) => blocker.close(resolve));
  });
  const beforeAcquire = async (root) => {
    const port =
      49152 +
      (createHash('sha256').update(path.join(root, '.git')).digest().readUInt32BE(0) % 16384);
    if (blockers.has(port)) return;
    const blocker = createServer((socket) => socket.destroy());
    blocker.listen({ host: '127.0.0.1', port, exclusive: true });
    await once(blocker, 'listening');
    blockers.set(port, blocker);
  };
  const fixtures = [];
  for (let i = 0; i < 2; i++) {
    const f = await fixture(
      t,
      { issues: [issue(1, { user: { login: 'stranger' } })], permission: { stranger: 'read' } },
      { beforeAcquire },
    );
    fixtures.push(f);
    const c = await collected(f);
    assert.deepEqual(c.skipped, [{ issue: 1, reason: 'untrusted-author' }]);
    assert.equal((await persistedPass(f)).passId, f.passId);
    for (const blocker of blockers.values()) assert.equal(blocker.listening, true);
  }
  assert.notEqual(fixtures[0].root, fixtures[1].root);
  assert.notEqual(fixtures[0].passId, fixtures[1].passId);
});

for (const reason of SKIP_REASONS.slice(0, 7))
  test(`skip ${reason} follows fixed first-match precedence`, async (t) => {
    const states = {
      'untrusted-author': {
        issues: [
          issue(1, {
            user: { login: 'stranger' },
            labels: ['effective-flow-issue-done'],
            body: 'SECRET',
          }),
        ],
        permission: { stranger: 'read' },
      },
      'lifecycle-label': {
        issues: [issue(1, { labels: ['effective-flow-issue-in-progress'] })],
        comments: {
          1: [{ id: 1, body: '<!-- effective-flow-plan-issues -->', user: { login: 'owner' } }],
        },
      },
      'plan-issue-comment': {
        comments: {
          1: [{ id: 1, body: '<!-- effective-flow-plan-issues -->', user: { login: 'owner' } }],
        },
      },
      'open-pull-request': { pulls: [pull()] },
      'plan-on-base': {
        plans: { 'docs/plan/archive/2026-10-19-issue-1-plan.md': '# Plan\n**Issue:** #1\n' },
      },
      'plan-branch-exists': { branches: [branch(1)] },
      'closed-without-merge': {
        history: { [`example:${branch(1)}`]: [pull(30, 1, { state: 'closed', closed_at: NOW })] },
      },
    };
    await skip(t, reason, states[reason]);
  });
// Invariant: backlog-audit artifacts never reach the unattended pass. Goal epics and obsolete
// marks skip as lifecycle labels; a split hand-off skips like a plan-issues comment.
for (const [name, values, reason] of [
  [
    'goal epic',
    { issues: [issue(1, { labels: ['effective-flow-goal-epic'] })] },
    'lifecycle-label',
  ],
  [
    'obsolete mark',
    { issues: [issue(1, { labels: ['effective-flow-goal-obsolete'] })] },
    'lifecycle-label',
  ],
  [
    'split marker',
    {
      comments: {
        1: [
          {
            id: 1,
            body: `<!-- effective-flow-backlog-audit-split date=2026-11-13 body=${'a'.repeat(64)} -->\nSplit.`,
            user: { login: 'owner' },
          },
        ],
      },
    },
    'plan-issue-comment',
  ],
])
  test(`a backlog-audit ${name} skips the issue as ${reason}`, async (t) => {
    await skip(t, reason, values);
  });

const triageNotice = (login = 'owner') => ({
  id: 1,
  body: `<!-- effective-flow-triage security fp=${'a'.repeat(64)} -->\nMaintainers are handling this separately.`,
  user: { login },
});
// Invariant: a triage verdict that rejects an issue or leaves questions open, and a trusted
// security notice, never reach the unattended pass; the notice is read before triage comments are
// dropped from trusted text, so the drop cannot hide it.
for (const [name, values] of [
  ['reject label', { issues: [issue(1, { labels: ['effective-flow-triage-reject'] })] }],
  ['needs-work label', { issues: [issue(1, { labels: ['effective-flow-triage-needs-work'] })] }],
  ['security notice', { comments: { 1: [triageNotice()] } }],
])
  test(`a triage ${name} skips the issue as lifecycle-label`, async (t) => {
    const { c } = await skip(t, 'lifecycle-label', values);
    assert.doesNotMatch(JSON.stringify(c), /Maintainers/);
  });

// Invariant: a trusted triage comment carries text derived from unvetted authors under the
// runner's identity, so only that comment leaves trusted text and fingerprint; an implement verdict,
// an untrusted author's pasted security notice and a lookalike `effective-flow-triaged` marker
// (the marker ends in a space) skip and drop nothing.
test('trusted triage comments are dropped from trusted text and only verdict labels skip', async (t) => {
  const f = await fixture(t, {
    issues: [issue(1, { labels: ['effective-flow-triage-implement'] })],
    permission: { stranger: 'read' },
    comments: {
      1: [
        { ...triageNotice('stranger'), id: 1 },
        {
          id: 2,
          body: `<!-- effective-flow-triage fp=${'b'.repeat(64)} -->\nTRIAGE_RATIONALE`,
          user: { login: 'Owner' },
        },
        {
          id: 4,
          body: `<!-- effective-flow-triaged fp=${'c'.repeat(64)} -->\nNot a triage marker`,
          user: { login: 'Owner' },
        },
        { id: 3, body: 'Kept', user: { login: 'Owner' } },
      ],
    },
  });
  const c = await collected(f);
  assert.deepEqual(c.skipped, []);
  assert.equal(c.eligible.length, 1);
  const trusted = await fs.readFile(c.eligible[0].trustedTextPath, 'utf8');
  assert.doesNotMatch(trusted, /TRIAGE_RATIONALE|effective-flow-triage |Maintainers/);
  assert.deepEqual(
    JSON.parse(trusted).comments.map((comment) => comment.id),
    [4, 3],
  );
  const digest = await f.run('fingerprint', {
    trustedTextPath: c.eligible[0].trustedTextPath,
    issueAuthor: c.eligible[0].issueAuthor,
  });
  assert.equal(digest.data.fingerprint, c.eligible[0].fingerprint);
});
// Invariant: a trusted triage comment never enters the fingerprint, so posting or editing one
// cannot make an unchanged issue look changed to the unattended pass.
test('a trusted triage comment leaves the fingerprint unchanged', async (t) => {
  const kept = { id: 3, body: 'Kept', user: { login: 'Owner' } };
  const triage = (body) => ({
    id: 2,
    body: `<!-- effective-flow-triage fp=x -->\n${body}`,
    user: { login: 'Owner' },
  });
  const prints = [];
  for (const comments of [[kept], [triage('one'), kept], [triage('two'), kept]]) {
    const f = await fixture(t, { issues: [issue(1)], comments: { 1: comments } });
    const c = await collected(f);
    assert.equal(c.eligible.length, 1);
    prints.push(c.eligible[0].fingerprint);
  }
  assert.equal(new Set(prints).size, 1);
});
for (const [reason, verdict, currentMode] of [
  ['failed-exhausted', 'failed', 'publish'],
  ['unchanged-not-ready', 'not-ready', 'publish'],
  ['already-published', 'published', 'publish'],
  ['unchanged-would-publish', 'would-publish', 'dry-run'],
])
  test(`skip ${reason} preserves fingerprint-bound cache semantics`, async (t) => {
    const f = await fixture(t);
    let c = await collected(f, { mode: currentMode });
    const extra =
      verdict === 'published'
        ? { pullRequest: { number: 30, url: 'https://github.com/example/flow/pull/30' } }
        : {};
    assert.equal((await f.record(c, verdict, extra)).ok, true);
    await f.next();
    if (verdict === 'failed') {
      c = await collected(f);
      assert.equal((await f.record(c)).ok, true);
      await f.next();
    }
    c = await collected(f, { mode: currentMode });
    assert.equal(c.skipped[0].reason, reason);
  });

// Invariant: passes no longer exclude each other. Each pass owns only its own record; a foreign
// passId names no record, and closing one pass never touches another pass's record.
test('pass records are independent; a foreign passId is PASS_NOT_FOUND and close removes only its own record', async (t) => {
  const f = await nativeFixture(t);
  const other = await f.run('pass-open');
  assert.equal(other.ok, true, JSON.stringify(other));
  assert.notEqual(other.data.passId, f.passId);
  assert.equal((await f.run('pass-close', { passId: 'foreign' })).error.code, 'PASS_NOT_FOUND');
  for (const [operation, input] of [
    ['pass-collect', f.collectInput({ passId: 'foreign' })],
    [
      'verdict-record',
      {
        passId: 'foreign',
        mode: 'publish',
        issue: 1,
        fingerprint: `ibfp1:sha256:${'b'.repeat(64)}`,
        verdict: 'failed',
        reason: '',
      },
    ],
    [
      'pass-report',
      {
        passId: 'foreign',
        outcome: 'failed',
        cutOff: 'none',
        verdicts: [],
        pullRequestsOpened: [],
        pullRequestsRecovered: [],
        failures: [{ issue: null, stage: 'preflight', code: 'STOPPED' }],
      },
    ],
  ])
    assert.equal((await f.run(operation, input)).error.code, 'PASS_NOT_FOUND');
  assert.equal(
    f.calls.some((call) => call.executable === 'gh'),
    false,
  );
  const bytes = await fs.readFile(f.passPath(other.data.passId), 'utf8');
  assert.deepEqual((await f.run('pass-close', { passId: f.passId })).data, {
    passId: f.passId,
    closed: true,
    releasedClaims: [],
  });
  await assert.rejects(fs.stat(f.passPath()), { code: 'ENOENT' });
  assert.equal(await fs.readFile(f.passPath(other.data.passId), 'utf8'), bytes);
  assert.equal((await f.run('pass-close', { passId: other.data.passId })).ok, true);
});

test('trust filtering removes untrusted text and markers before files, fingerprints and reports', async (t) => {
  const f = await fixture(t, {
    issues: [
      issue(),
      issue(2, { user: { login: 'stranger' }, title: 'UNTRUSTED_ISSUE', body: 'UNTRUSTED_BODY' }),
    ],
    permission: { stranger: 'read', ghost: 'triage' },
    comments: {
      1: [
        {
          id: 2,
          body: '<!-- effective-flow-plan-issues --> UNTRUSTED_COMMENT',
          user: { login: 'stranger' },
        },
        { id: 3, body: 'Kept', user: { login: 'Owner' } },
        { id: 4, body: 'GHOST', user: null },
      ],
    },
  });
  const c = await collected(f);
  assert.equal(c.eligible.length, 1);
  const trusted = await fs.readFile(c.eligible[0].trustedTextPath, 'utf8');
  const r = await f.report(c);
  assert.equal(r.ok, true, JSON.stringify(r));
  for (const output of [JSON.stringify(c), trusted, JSON.stringify(r)])
    assert.doesNotMatch(output, /UNTRUSTED|GHOST/);
  assert.equal(
    f.calls.filter(
      (call) =>
        call.executable === 'gh' && call.args.at(-1)?.includes('collaborators/owner/permission'),
    ).length,
    1,
  );
  assert.equal(
    f.calls.some((call) => call.args.at(-1)?.includes('issues/2/comments')),
    false,
  );
  assert.deepEqual(JSON.parse(trusted).comments, [{ id: 3, author: 'owner', body: 'Kept' }]);
  const digest = await f.run('fingerprint', {
    trustedTextPath: c.eligible[0].trustedTextPath,
    issueAuthor: c.eligible[0].issueAuthor,
  });
  assert.equal(digest.data.fingerprint, c.eligible[0].fingerprint);
  for (const call of f.calls.filter((call) => call.executable === 'gh')) {
    assert.equal(call.args.includes('sf-label-migrate'), false);
    for (const flag of ['-X', '--method'])
      if (call.args.includes(flag)) assert.equal(call.args[call.args.indexOf(flag) + 1], 'GET');
  }
  assert.equal(
    f.calls.some((call) => call.args.some((arg) => String(arg).includes('memory.json'))),
    false,
  );
});

test('fingerprint canonicalization covers title/body/comments/authors and rejects ambiguous IDs', () => {
  const value = {
    schemaVersion: 1,
    issue: 1,
    title: 'Title\r\n',
    body: 'Body\r',
    comments: [
      { id: 2, author: 'TWO', body: 'Two' },
      { id: 1, author: 'One', body: 'One' },
    ],
  };
  const digest = fingerprint(value, 'Owner');
  assert.equal(
    digest,
    fingerprint(
      { ...value, comments: [...value.comments].reverse(), title: 'Title\n', body: 'Body\n' },
      'OWNER',
    ),
  );
  for (const changed of [
    { ...value, title: 'Other' },
    { ...value, body: 'Other' },
    { ...value, comments: [{ ...value.comments[0], body: 'Other' }] },
  ])
    assert.notEqual(digest, fingerprint(changed, 'owner'));
  assert.notEqual(digest, fingerprint(value, 'different'));
  assert.throws(() =>
    fingerprint({ ...value, comments: [value.comments[0], value.comments[0]] }, 'owner'),
  );
  assert.throws(() =>
    fingerprint({ ...value, comments: [{ id: 0, author: 'owner', body: '' }] }, 'owner'),
  );
});

test('ordering, positive limits, collection replay and stale trusted-text cleanup bind one snapshot', async (t) => {
  const f = await fixture(t, {
    issues: [
      issue(4),
      issue(3),
      issue(2, { labels: ['firmo-needs-planning'] }),
      issue(1, { updated_at: '2026-10-18T12:00:00Z' }),
    ],
  });
  const c = await collected(f);
  assert.deepEqual(
    c.eligible.map((entry) => entry.issue),
    [2, 1, 3],
  );
  assert.equal(c.eligibleCount, 4);
  const forgeCount = f.calls.filter((call) => call.executable === 'gh').length;
  assert.deepEqual((await f.collect()).data, c);
  assert.equal(f.calls.filter((call) => call.executable === 'gh').length, forgeCount);
  assert.equal((await f.collect({ mode: 'dry-run' })).error.code, 'INVALID_PAYLOAD');
  await f.next();
  f.state.issues = [issue(4)];
  const next = await collected(f);
  assert.deepEqual(await fs.readdir(path.dirname(next.eligible[0].trustedTextPath)), [
    'issue-4.json',
  ]);
  const baseCalls = f.calls.filter((call) => call.args[0] === 'ls-tree');
  assert.ok(baseCalls.every((call) => call.args[2] === OID));
});

test('closed payloads reject malformed values before forge reads and hidden mode is refused', async (t) => {
  const f = await fixture(t);
  const start = f.calls.length;
  for (const extra of [
    { unknown: true },
    { limits: { judgments: 0 } },
    { limits: { judgments: 1.5 } },
    { limits: { plans: 1, other: 1 } },
    { planDir: '../plans' },
    { baseBranch: '--all' },
    { branchPrefix: 'bad..prefix' },
    { visibility: 'hidden' },
    { staleAttempts: [{ issue: 1 }] },
  ])
    assert.equal((await f.collect(extra)).error.code, 'INVALID_PAYLOAD');
  assert.equal(f.calls.length, start);
  assert.equal(
    (
      await f.run('pass-report', {
        passId: f.passId,
        outcome: 'completed',
        cutOff: 'none',
        verdicts: 'bad',
        pullRequestsOpened: [],
        pullRequestsRecovered: [],
        failures: [],
      })
    ).error.code,
    'INVALID_PAYLOAD',
  );
});

test('v2 collection binds visibility and leftovers before eligibility and preserves them in reports', async (t) => {
  const f = await fixture(t);
  const leftover = {
    issue: 1,
    path: 'docs/plan/2026-10-19-issue-1-plan.md',
    action: 'remove',
  };
  const c = await collected(f, { repositoryVisibility: 'public', leftoverPlanFiles: [leftover] });
  assert.equal(c.repositoryVisibility, 'public');
  assert.deepEqual(c.leftoverPlanFiles, [leftover]);
  assert.deepEqual(c.eligible, []);
  assert.deepEqual(c.skipped, []);

  const report = await f.report(c, {
    reportVersion: 2,
    repositoryVisibility: 'private',
    leftoverPlanFiles: [leftover],
  });
  assert.equal(report.ok, false);
  assert.equal(report.error.code, 'INVALID_PAYLOAD');
  const accepted = await f.report(c, {
    reportVersion: 2,
    repositoryVisibility: 'public',
    leftoverPlanFiles: [leftover],
  });
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  assert.equal(accepted.data.schemaVersion, 2);
  assert.equal(accepted.data.repositoryVisibility, 'public');
  assert.deepEqual(accepted.data.leftoverPlanFiles, [leftover]);
});

test('leftover exclusion precedes recovery authorization and replay binds metadata', async (t) => {
  const f = await fixture(t, { branches: [branch(1)] });
  const leftover = {
    issue: 1,
    path: 'docs/plan/2026-10-19-issue-1-plan.md',
    action: 'remove',
  };
  const c = await collected(f, { repositoryVisibility: 'public', leftoverPlanFiles: [leftover] });
  assert.deepEqual(c.authorizedRecovery, []);
  assert.deepEqual(c.eligible, []);
  assert.deepEqual(c.leftoverPlanFiles, [leftover]);
  assert.equal(
    (await f.collect({ repositoryVisibility: 'private', leftoverPlanFiles: [leftover] })).error
      .code,
    'INVALID_PAYLOAD',
  );
  assert.equal(
    (
      await f.collect({
        repositoryVisibility: 'public',
        leftoverPlanFiles: [{ ...leftover, path: 'docs/plan/2026-10-19-issue-1-other.md' }],
      })
    ).error.code,
    'INVALID_PAYLOAD',
  );
});

test('report schema version is immutable within a pass and v2 keeps a pass-level failure separate', async (t) => {
  const f = await fixture(t);
  const c = await collected(f);
  const v1 = await f.report(c);
  assert.equal(v1.ok, true, JSON.stringify(v1));
  const conflict = await f.report(c, {
    reportVersion: 2,
    repositoryVisibility: 'unknown',
    leftoverPlanFiles: [],
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, 'REPORT_VERSION_CONFLICT');

  await f.next();
  const c2 = await collected(f);
  assert.equal((await f.record(c2, 'failed')).ok, true);
  const partial = await f.report(c2, {
    reportVersion: 2,
    outcome: 'failed',
    repositoryVisibility: 'unknown',
    leftoverPlanFiles: [],
    verdicts: [{ issue: 1, verdict: 'failed', reason: 'Bounded reason' }],
    failures: [
      { issue: 1, stage: 'judgment', code: 'MODEL_FAILED' },
      { issue: null, stage: 'handoff', code: 'NESTED_SPAWN_UNAVAILABLE' },
    ],
  });
  assert.equal(partial.ok, true, JSON.stringify(partial));
  assert.equal(partial.data.outcome, 'failed');
  assert.deepEqual(partial.data.failures, [
    { issue: 1, stage: 'judgment', code: 'MODEL_FAILED' },
    { issue: null, stage: 'handoff', code: 'NESTED_SPAWN_UNAVAILABLE' },
  ]);
  assert.equal(partial.data.cutOff, 'none');
});

test('v2 failed report retains reconciled published and failed outcomes with one null failure', async (t) => {
  const f = await fixture(t, { issues: [issue(1), issue(2)] });
  const c = await collected(f);
  const first = c.eligible.find((entry) => entry.issue === 1);
  const second = c.eligible.find((entry) => entry.issue === 2);
  assert.ok(first && second);
  assert.equal(
    (
      await f.record(c, 'published', {
        issue: 1,
        fingerprint: first.fingerprint,
        pullRequest: { number: 30, url: 'https://github.com/example/flow/pull/30' },
        headRef: first.headRef,
      })
    ).ok,
    true,
  );
  assert.equal(
    (await f.record(c, 'failed', { issue: 2, fingerprint: second.fingerprint })).ok,
    true,
  );
  const before = await f.cache();
  const report = await f.report(c, {
    reportVersion: 2,
    outcome: 'failed',
    repositoryVisibility: 'unknown',
    leftoverPlanFiles: [],
    verdicts: [
      { issue: 1, verdict: 'published', reason: 'Bounded reason' },
      { issue: 2, verdict: 'failed', reason: 'Bounded reason' },
    ],
    pullRequestsOpened: [
      {
        issue: 1,
        number: 30,
        headRef: first.headRef,
        url: 'https://github.com/example/flow/pull/30',
      },
    ],
    failures: [
      { issue: 2, stage: 'judgment', code: 'MODEL_FAILED' },
      { issue: null, stage: 'handoff', code: 'NESTED_SPAWN_UNAVAILABLE' },
    ],
  });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.data.outcome, 'failed');
  assert.deepEqual(report.data.pullRequestsOpened[0].issue, 1);
  assert.deepEqual(report.data.failures, [
    { issue: 2, stage: 'judgment', code: 'MODEL_FAILED' },
    { issue: null, stage: 'handoff', code: 'NESTED_SPAWN_UNAVAILABLE' },
  ]);
  assert.deepEqual(
    await f.cache(),
    before,
    'reporting null failure does not alter retry/cache state',
  );
  for (const mutation of [
    { verdicts: [{ issue: 1, verdict: 'published', reason: 'Bounded reason' }] },
    { pullRequestsOpened: [] },
    { failures: [{ issue: null, stage: 'handoff', code: 'NESTED_SPAWN_UNAVAILABLE' }] },
  ]) {
    const refused = await f.report(c, {
      reportVersion: 2,
      outcome: 'failed',
      repositoryVisibility: 'unknown',
      leftoverPlanFiles: [],
      verdicts: mutation.verdicts ?? [
        { issue: 1, verdict: 'published', reason: 'Bounded reason' },
        { issue: 2, verdict: 'failed', reason: 'Bounded reason' },
      ],
      pullRequestsOpened: mutation.pullRequestsOpened ?? [
        {
          issue: 1,
          number: 30,
          headRef: first.headRef,
          url: 'https://github.com/example/flow/pull/30',
        },
      ],
      failures: mutation.failures ?? [
        { issue: 2, stage: 'judgment', code: 'MODEL_FAILED' },
        { issue: null, stage: 'handoff', code: 'NESTED_SPAWN_UNAVAILABLE' },
      ],
    });
    assert.equal(refused.ok, false);
    assert.equal(refused.error.code, 'INVALID_PAYLOAD');
  }
});

test('permission failures and invalid/ghost logins are untrusted, incomplete pagination stops collection', async (t) => {
  const f = await fixture(t, {
    issues: [
      issue(1, { user: null }),
      issue(2, { user: { login: 'bad/login' } }),
      issue(3, { user: { login: 'denied' } }),
    ],
    forgeFailure: 'collaborators/denied',
  });
  const c = await collected(f);
  assert.deepEqual(
    c.skipped.map((entry) => entry.reason),
    Array(3).fill('untrusted-author'),
  );
  await f.next();
  f.state.issues = { total_count: 5, incomplete_results: true };
  assert.equal((await f.collect()).error.code, 'FORGE_READ_FAILED');
});

test('retry once, same-pass replay, conflicting replay, mode/issue binding and reset on changed input', async (t) => {
  const f = await fixture(t);
  let c = await collected(f);
  const first = await f.record(c);
  assert.equal(first.ok, true);
  assert.deepEqual(await f.record(c), first);
  assert.equal((await f.cache()).records[1].retryCount, 0);
  assert.equal((await f.record(c, 'not-ready')).error.code, 'INVALID_PAYLOAD');
  assert.equal((await f.record(c, 'failed', { issue: 99 })).error.code, 'INVALID_PAYLOAD');
  assert.equal((await f.record(c, 'failed', { mode: 'dry-run' })).error.code, 'INVALID_PAYLOAD');
  await f.next();
  c = await collected(f);
  await f.record(c);
  assert.equal((await f.cache()).records[1].retryCount, 1);
  await f.next();
  assert.equal((await collected(f)).skipped[0].reason, 'failed-exhausted');
  await f.next();
  f.state.issues[0].body = 'Changed';
  c = await collected(f);
  await f.record(c);
  assert.equal((await f.cache()).records[1].retryCount, 0);
});

test('D1 dry-run would-publish is skipped only by dry runs and publication is mode restricted', async (t) => {
  const f = await fixture(t);
  const dry = await collected(f, { mode: 'dry-run' });
  assert.equal(
    (
      await f.record(dry, 'published', {
        pullRequest: { number: 30, url: 'https://github.com/example/flow/pull/30' },
      })
    ).error.code,
    'INVALID_PAYLOAD',
  );
  assert.equal((await f.record(dry, 'would-publish')).ok, true);
  const r = await f.report(dry, {
    verdicts: [{ issue: 1, verdict: 'would-publish', reason: 'Bounded reason' }],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.pullRequestsOpened, []);
  assert.deepEqual(r.data.pullRequestsRecovered, []);
  await f.next();
  const publish = await collected(f);
  assert.equal(publish.eligible.length, 1);
  assert.equal((await f.record(publish, 'would-publish')).error.code, 'INVALID_PAYLOAD');
});

test('orphan recovery remains reason 6, is authorized outside slice and stops before a third attempt', async (t) => {
  const f = await fixture(t, {
    branches: [branch(1), 'effective-flow/plan/issue-abc', 'effective-flow/plan/issue-01'],
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const c = await collected(f);
    assert.equal(c.eligible.length, 0);
    assert.equal(c.authorizedRecovery.length, 1);
    assert.deepEqual(c.recovery.orphanBranches, [{ issue: 1, headRef: branch(1) }]);
    assert.equal((await f.record(c)).ok, true);
    const r = await f.report(c, {
      verdicts: [{ issue: 1, verdict: 'failed', reason: 'Bounded reason' }],
      failures: [{ issue: 1, stage: 'recovery', code: 'RECOVERY_FAILED' }],
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.counts['plan-branch-exists'], 1);
    assert.equal(r.data.counts['orphan-branch'], undefined);
    await f.next();
  }
  const exhausted = await collected(f);
  assert.equal(exhausted.authorizedRecovery.length, 0);
  assert.equal(exhausted.skipped[0].reason, 'plan-branch-exists');
});

test('owned unrecorded PR recovery excludes foreign/missing identities and preserves earlier lifecycle gates', async (t) => {
  const f = await fixture(t, {
    issues: [
      issue(),
      issue(2),
      issue(3),
      issue(4, { labels: ['effective-flow-issue-done'] }),
      issue(5),
    ],
    pulls: [
      pull(),
      pull(31, 2, { head: { ref: branch(2), repo: { id: 2, full_name: 'stranger/flow' } } }),
      pull(32, 3, { head: { ref: branch(3) } }),
      pull(33, 4),
      pull(34, 9),
    ],
  });
  const c = await collected(f);
  assert.deepEqual(
    c.recovery.unrecordedPullRequests.map((entry) => entry.issue),
    [1],
  );
  assert.deepEqual(
    c.issueClosedPlanPrOpen.map((entry) => entry.issue),
    [9],
  );
  assert.equal(
    (
      await f.record(c, 'published', {
        pullRequest: { number: 30, url: 'https://github.com/example/flow/pull/30' },
      })
    ).ok,
    true,
  );
  assert.equal(
    (
      await f.record(c, 'published', {
        issue: 5,
        fingerprint: c.eligible.find((entry) => entry.issue === 5).fingerprint,
        pullRequest: { number: 35, url: 'https://github.com/example/flow/pull/35' },
      })
    ).error.code,
    'INVALID_PAYLOAD',
  );
  const r = await f.report(c, {
    verdicts: [{ issue: 1, verdict: 'published', reason: 'Bounded reason' }],
    pullRequestsRecovered: [c.recovery.unrecordedPullRequests[0]],
  });
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('a former PR prevents orphan classification and history is read once; empty prefixes stay canonical', async (t) => {
  const f = await fixture(t, {
    branches: [branch(1, '')],
    history: {
      'example:plan/issue-1': [
        pull(30, 1, {
          state: 'closed',
          head: { ref: branch(1, ''), repo: { full_name: 'example/flow' } },
        }),
      ],
    },
  });
  const c = await collected(f, { branchPrefix: '' });
  assert.equal(c.skipped[0].reason, 'plan-branch-exists');
  assert.deepEqual(c.recovery.orphanBranches, []);
  assert.equal(
    f.calls.filter((call) => call.executable === 'gh' && call.args.at(-1)?.includes('head='))
      .length,
    1,
  );
});

test('closed-PR baselines survive edited input, failed verdicts and retries; a different PR gets its own baseline', async (t) => {
  const closed = pull(30, 1, { state: 'closed', closed_at: NOW });
  const f = await fixture(t, { history: { [`example:${branch(1)}`]: [closed] } });
  assert.equal((await collected(f)).skipped[0].reason, 'closed-without-merge');
  await f.next();
  assert.equal((await collected(f)).skipped[0].reason, 'closed-without-merge');
  await f.next();
  f.state.issues[0].body = 'Edited';
  let c = await collected(f);
  assert.equal(c.eligible.length, 1);
  await f.record(c);
  await f.next();
  c = await collected(f);
  assert.equal(c.eligible.length, 1);
  await f.record(c);
  await f.next();
  f.state.issues[0].body = 'Edited again';
  f.state.history[`example:${branch(1)}`].push(pull(31, 1, { state: 'closed', closed_at: NOW }));
  assert.equal((await collected(f)).skipped[0].reason, 'closed-without-merge');
  assert.equal(Object.keys((await f.cache()).closedPlanPrObservations[1]).length, 2);
});

async function evidenceFor(f, count = 1) {
  const c = await collected(f);
  const fp = c.eligible[0].fingerprint;
  await f.next();
  return Array.from({ length: count }, (_, index) => ({
    issue: 1,
    originalFingerprint: fp,
    stableAttemptId: stableAttemptId(`old-pass-${index}`, 1),
  }));
}
test('WP5 captures evidence before collection; one old failure permits current success as the sole current outcome', async (t) => {
  const f = await fixture(t);
  const evidence = await evidenceFor(f);
  // Captured lifecycle evidence is supplied to collection, never as a pre-collection verdict.
  assert.equal(
    (
      await f.record({
        mode: 'publish',
        eligible: [{ fingerprint: evidence[0].originalFingerprint }],
      })
    ).error.code,
    'INVALID_PAYLOAD',
  );
  const c = await collected(f, { staleAttempts: evidence });
  assert.equal(c.eligible.length, 1);
  assert.equal((await f.cache()).records[1].recordedPassId, 'old-pass-0');
  assert.equal(
    (
      await f.record(c, 'published', {
        stableAttemptId: stableAttemptId(f.passId, 1),
        pullRequest: { number: 30, url: 'https://github.com/example/flow/pull/30' },
      })
    ).ok,
    true,
  );
  const r = await f.report(c, {
    verdicts: [{ issue: 1, verdict: 'published', reason: 'Bounded reason' }],
    pullRequestsOpened: [
      { issue: 1, number: 30, headRef: branch(1), url: 'https://github.com/example/flow/pull/30' },
    ],
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.verdicts.length, 1);
  assert.equal(r.data.counts.failed, undefined);
});

test('two distinct historical failures exhaust budget before slice; repeats and collection replay count once', async (t) => {
  const f = await fixture(t);
  const evidence = await evidenceFor(f, 2);
  const attempts = [...evidence, evidence[0]];
  const c = await collected(f, { staleAttempts: attempts });
  assert.equal(c.eligible.length, 0);
  assert.equal(c.skipped[0].reason, 'failed-exhausted');
  const bytes = JSON.stringify(await f.cache());
  assert.deepEqual((await f.collect({ staleAttempts: attempts })).data, c);
  assert.equal(JSON.stringify(await f.cache()), bytes);
  await f.next();
  assert.equal((await collected(f, { staleAttempts: attempts })).eligible.length, 0);
  assert.equal(Object.keys((await f.cache()).attempts).length, 2);
});

test('dedup survives a kill after normal verdict, later outcomes and fingerprint resets', async (t) => {
  const f = await fixture(t);
  let c = await collected(f);
  const original = c.eligible[0].fingerprint;
  const id = stableAttemptId(f.passId, 1);
  assert.equal((await f.record(c, 'failed', { stableAttemptId: id })).ok, true);
  await f.next();
  c = await collected(f, {
    staleAttempts: [{ issue: 1, originalFingerprint: original, stableAttemptId: id }],
  });
  assert.equal((await f.cache()).records[1].retryCount, 0);
  f.state.issues[0].body = 'Changed';
  await f.next();
  c = await collected(f);
  await f.record(c, 'not-ready');
  await f.next();
  f.state.issues[0].body = 'Trusted body';
  c = await collected(f, {
    staleAttempts: [{ issue: 1, originalFingerprint: original, stableAttemptId: id }],
  });
  assert.equal(c.eligible.length, 1);
  assert.equal((await f.cache()).records[1].verdict, 'not-ready');
  assert.equal(Object.keys((await f.cache()).attempts).length, 1);
  await f.next();
  assert.equal(
    (
      await f.collect({
        staleAttempts: [
          { issue: 1, originalFingerprint: `ibfp1:sha256:${'b'.repeat(64)}`, stableAttemptId: id },
        ],
      })
    ).error.code,
    'INVALID_PAYLOAD',
  );
});

test('unproven, changed, closed, untrusted, blocked and recovery attempts consume no historical budget; dry runs only diagnose', async (t) => {
  for (const variant of [
    'missing',
    'changed',
    'closed',
    'untrusted',
    'blocked',
    'recovery',
    'dry-run',
  ]) {
    const f = await fixture(t);
    const evidence = await evidenceFor(f);
    if (variant === 'changed') f.state.issues[0].body = 'Changed';
    if (variant === 'closed') f.state.issues = [];
    if (variant === 'untrusted') f.state.permission.owner = 'read';
    if (variant === 'blocked') f.state.issues[0].labels = ['effective-flow-issue-done'];
    if (variant === 'recovery') f.state.branches = [branch(1)];
    await collected(f, {
      staleAttempts: variant === 'missing' ? [] : evidence,
      mode: variant === 'dry-run' ? 'dry-run' : 'publish',
    });
    await assert.rejects(fs.stat(path.join(f.root, '.effective-flow/issue-buddy/verdicts.json')), {
      code: 'ENOENT',
    });
  }
});

test('read failure and cache-write failure preserve prior accounting; late handoff failure retains atomic dedup with no authority', async (t) => {
  const f = await fixture(t);
  const evidence = await evidenceFor(f);
  f.state.forgeFailure = '/pulls?';
  assert.equal((await f.collect({ staleAttempts: evidence })).error.code, 'FORGE_READ_FAILED');
  await assert.rejects(f.cache(), { code: 'ENOENT' });
  assert.equal((await f.collect({ staleAttempts: evidence })).error.code, 'FORGE_READ_FAILED');
  await f.next();
  f.state.forgeFailure = null;
  const badCache = {
    ...fs,
    rename: async (from, to) => {
      if (to.endsWith('verdicts.json')) throw new Error('cache write');
      return fs.rename(from, to);
    },
  };
  assert.equal((await f.collect({ staleAttempts: evidence }, { fs: badCache })).ok, false);
  await assert.rejects(f.cache(), { code: 'ENOENT' });
  await f.next();
  const badTrusted = {
    ...fs,
    rename: async (from, to) => {
      if (to.endsWith('issue-1.json')) throw new Error('handoff write');
      return fs.rename(from, to);
    },
  };
  assert.equal((await f.collect({ staleAttempts: evidence }, { fs: badTrusted })).ok, false);
  assert.equal(Object.keys((await f.cache()).attempts).length, 1);
  assert.equal(
    (
      await f.record({
        mode: 'publish',
        eligible: [{ fingerprint: evidence[0].originalFingerprint }],
      })
    ).error.code,
    'INVALID_PAYLOAD',
  );
  await f.next();
  assert.equal((await collected(f, { staleAttempts: evidence })).eligible.length, 1);
  assert.equal((await f.cache()).records[1].retryCount, 0);
});

test('reports have a complete closed schema, matching bytes and counts; duplicate or mismatched outcomes fail', async (t) => {
  const f = await fixture(t);
  const c = await collected(f);
  const r = await f.report(c);
  assert.equal(r.ok, true, JSON.stringify(r));
  const directory = path.join(f.root, '.effective-flow/issue-buddy');
  assert.equal(
    await fs.readFile(path.join(directory, 'last-pass.json'), 'utf8'),
    await fs.readFile(path.join(directory, 'reports', `${f.passId}.json`), 'utf8'),
  );
  assert.deepEqual(validatePassReport(r.data), r.data);
  for (const changed of [
    { ...r.data, unknown: true },
    { ...r.data, counts: { failed: 1 } },
    { ...r.data, limits: { judgments: 3, plans: 1, other: 1 } },
    {
      ...r.data,
      verdicts: [
        { issue: 1, verdict: 'failed', reason: '' },
        { issue: 1, verdict: 'failed', reason: '' },
      ],
      counts: { failed: 2 },
    },
    { ...r.data, finishedAt: 'bad' },
  ])
    assert.throws(() => validatePassReport(changed));
  assert.equal((await f.report(c, { counts: { failed: 9 } })).error.code, 'INVALID_PAYLOAD');
  assert.equal(
    (await f.report(c, { collect: { ...c, mode: 'dry-run' } })).error.code,
    'INVALID_PAYLOAD',
  );
});

test('preflight and collect failures produce failed reports with no partial outcomes', async (t) => {
  const f = await fixture(t);
  let r = await f.report(null, {
    outcome: 'failed',
    failures: [{ issue: null, stage: 'preflight', code: 'PREFLIGHT_FAILED' }],
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.outcome, 'failed');
  await f.next();
  f.state.fetchFailure = true;
  assert.equal((await f.collect()).error.code, 'FETCH_FAILED');
  r = await f.report(null, {
    outcome: 'failed',
    failures: [{ issue: null, stage: 'collect', code: 'FETCH_FAILED' }],
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.data.verdicts, []);
  assert.deepEqual(r.data.pullRequestsOpened, []);
});

test('failed current-report write keeps matching history and never reports success; fresh clone cannot inherit a report', async (t) => {
  const f = await fixture(t);
  const c = await collected(f);
  const broken = {
    ...fs,
    rename: async (from, to) => {
      if (to.endsWith('last-pass.json')) throw new Error('report write');
      return fs.rename(from, to);
    },
  };
  assert.equal((await f.report(c, {}, { fs: broken })).ok, false);
  const historical = JSON.parse(
    await fs.readFile(
      path.join(f.root, '.effective-flow/issue-buddy/reports', `${f.passId}.json`),
      'utf8',
    ),
  );
  assert.equal(historical.passId, f.passId);
  validatePassReport(historical);
  const fresh = await fixture(t);
  const output = path.join(fresh.root, '.effective-flow/issue-buddy/last-pass.json');
  assert.equal(historical.outcome, 'completed');
  await assert.rejects(fs.stat(output), { code: 'ENOENT' });
  await fresh.run('pass-close', { passId: fresh.passId });
  assert.equal(
    (await fresh.run('pass-collect', fresh.collectInput())).error.code,
    'PASS_NOT_FOUND',
  );
  await assert.rejects(fs.stat(output), { code: 'ENOENT' });
});

test('thin CLI emits one envelope and nonzero status for malformed stdin and unknown operations', async () => {
  const result = spawnSync(process.execPath, ['src/scripts/issue-buddy.mjs', 'pass-collect'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    input: '{',
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).error.code, 'INVALID_PAYLOAD');
  assert.match(result.stderr, /INVALID_PAYLOAD/);
  let stdout = '';
  let exit;
  await main(['unknown'], {
    stdout: {
      write: (value) => {
        stdout += value;
      },
    },
    stderr: { write() {} },
    setExitCode: (code) => {
      exit = code;
    },
  });
  assert.equal(stdout.trim().split('\n').length, 1);
  assert.equal(exit, 1);
});

test('non-GitHub origins are refused before any forge read', async (t) => {
  const f = await fixture(t, { origin: 'https://codeberg.org/example/flow.git' });
  const result = await f.collect();
  assert.equal(result.error.code, 'UNSUPPORTED_PROVIDER', JSON.stringify(result));
  assert.equal(
    f.calls.some((call) => call.executable === 'gh'),
    false,
  );
});

test('interrupted final pass-record persistence retains accounting and fails closed on replay', async (t) => {
  const f = await fixture(t);
  const evidence = await evidenceFor(f);
  let passWrites = 0;
  // Writes of the pass record: the intent, the claims, then the final collection result.
  const interrupted = {
    ...fs,
    rename: async (from, to) => {
      if (to === f.passPath() && ++passWrites >= 3)
        throw new Error('pass-record persistence unavailable');
      return fs.rename(from, to);
    },
  };
  assert.equal((await f.collect({ staleAttempts: evidence }, { fs: interrupted })).ok, false);
  assert.equal(Object.keys((await f.cache()).attempts).length, 1);
  assert.equal((await f.collect({ staleAttempts: evidence })).error.code, 'UNSAFE_RUNTIME_STATE');
  assert.equal((await f.cache()).records[1].retryCount, 0);
  const r = await f.report(null, {
    outcome: 'failed',
    failures: [{ issue: null, stage: 'collect', code: 'UNSAFE_RUNTIME_STATE' }],
  });
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('labels and dropped comments do not alter the collection fingerprint', async (t) => {
  const f = await fixture(t);
  const first = await collected(f);
  await f.next();
  f.state.issues[0].labels = ['unrelated'];
  f.state.permission.stranger = 'read';
  f.state.comments[1] = [{ id: 1, body: 'Untrusted', user: { login: 'stranger' } }];
  const second = await collected(f);
  assert.equal(first.eligible[0].fingerprint, second.eligible[0].fingerprint);
});

test('missing and ghost issue authors stay untrusted after JSON-safe normalization', async (t) => {
  const f = await fixture(t, {
    issues: [
      issue(1, { user: undefined, body: 'GHOST_SECRET_ONE' }),
      issue(2, { user: null, body: 'GHOST_SECRET_TWO' }),
      issue(3, { user: {}, body: 'GHOST_SECRET_THREE' }),
    ],
  });
  const c = await collected(f);
  assert.deepEqual(
    c.skipped,
    [1, 2, 3].map((issue) => ({ issue, reason: 'untrusted-author' })),
  );
  assert.deepEqual(c.eligible, []);
  assert.doesNotMatch(JSON.stringify(c), /GHOST_SECRET/);
  assert.equal(
    f.calls.some(
      (call) => call.executable === 'gh' && /collaborators\/|\/comments$/.test(call.args.at(-1)),
    ),
    false,
  );
});

async function runtimeSnapshot(f) {
  const directory = path.join(f.root, '.effective-flow/issue-buddy');
  const read = async (file) => {
    try {
      return await fs.readFile(path.join(directory, file), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };
  const contents = {
    cache: await read('verdicts.json'),
    lastPass: await read('last-pass.json'),
    trusted: {},
    reports: {},
  };
  for (const name of ['trusted', 'reports']) {
    let entries;
    try {
      entries = await fs.readdir(path.join(directory, name));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries.sort()) contents[name][entry] = await read(`${name}/${entry}`);
  }
  return contents;
}

test('impossible current ordering dates fail before historical accounting and preserve earlier cache, trusted text and reports', async (t) => {
  for (const [field, value] of [
    ['updated_at', '2026-02-30T12:00:00Z'],
    ['updated_at', '2025-02-29T12:00:00Z'],
    ['updated_at', '2026-10-19T24:00:00Z'],
    ['created_at', '2026-02-30T12:00:00Z'],
  ])
    await t.test(`${field}=${value}`, async (t) => {
      const f = await fixture(t, { issues: [issue(1), issue(2)] });
      const first = await collected(f);
      const originalFingerprint = first.eligible.find((entry) => entry.issue === 1).fingerprint;
      assert.equal(
        (await f.record(first, 'failed', { stableAttemptId: stableAttemptId(f.passId, 1) })).ok,
        true,
      );
      const prior = await f.report(first, {
        verdicts: [{ issue: 1, verdict: 'failed', reason: 'Bounded reason' }],
        failures: [{ issue: 1, stage: 'judgment', code: 'ATTEMPT_FAILED' }],
      });
      assert.equal(prior.ok, true, JSON.stringify(prior));
      await f.next();
      const lockPath = f.passPath();
      const identity = JSON.parse(await fs.readFile(lockPath, 'utf8'));
      const before = await runtimeSnapshot(f);
      f.state.issues[1][field] = value;
      const evidence = [
        {
          issue: 1,
          originalFingerprint,
          stableAttemptId: stableAttemptId('unrecorded-old-attempt', 1),
        },
      ];
      const failed = await f.collect({ staleAttempts: evidence });
      assert.equal(failed.ok, false, JSON.stringify(failed));
      assert.equal(failed.error.code, 'FORGE_READ_FAILED');
      assert.deepEqual(await runtimeSnapshot(f), before);
      const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'));
      assert.equal(lock.passId, identity.passId);
      assert.equal(lock.acquiredAt, identity.acquiredAt);
      assert.equal(lock.collection.status, 'failed');
      assert.equal(lock.collection.result, undefined);
      assert.equal(lock.collection.outcomes, undefined);
      assert.equal((await f.cache()).records[1].retryCount, 0);
      assert.equal(Object.keys((await f.cache()).attempts).length, 1);
      assert.equal((await f.record(first)).error.code, 'INVALID_PAYLOAD');
      const forgeCalls = f.calls.filter((call) => call.executable === 'gh').length;
      assert.equal((await f.collect({ staleAttempts: evidence })).error.code, 'FORGE_READ_FAILED');
      assert.equal(f.calls.filter((call) => call.executable === 'gh').length, forgeCalls);
      assert.deepEqual(await runtimeSnapshot(f), before);
      const report = await f.report(null, {
        outcome: 'failed',
        failures: [{ issue: null, stage: 'collect', code: 'FORGE_READ_FAILED' }],
      });
      assert.equal(report.ok, true, JSON.stringify(report));
      assert.deepEqual(report.data.verdicts, []);
      assert.deepEqual(report.data.counts, {});
      assert.equal((await runtimeSnapshot(f)).cache, before.cache);
      assert.deepEqual((await runtimeSnapshot(f)).trusted, before.trusted);
    });
});

test('valid leap and offset ordering timestamps still authorize collection', async (t) => {
  const f = await fixture(t, {
    issues: [
      issue(1, { created_at: '2024-02-29T12:00:00Z', updated_at: '2024-02-29T23:30:00-02:00' }),
    ],
  });
  assert.equal((await collected(f)).eligible.length, 1);
});

// Invariant: a pass record with a malformed acquisition time grants no authority, is never
// rewritten or removed by another operation and still closes by its own passId.
test('malformed stored pass acquisition time is reported clearly and never removed or rewritten', async (t) => {
  for (const acquiredAt of [
    '2026-02-30T12:00:00Z',
    '2025-02-29T12:00:00Z',
    '2026-10-19T24:00:00Z',
    'not-a-date',
    null,
  ])
    await t.test(String(acquiredAt), async (t) => {
      const f = await nativeFixture(t);
      const target = f.passPath();
      const record = JSON.parse(await fs.readFile(target, 'utf8'));
      record.acquiredAt = acquiredAt;
      const original = JSON.stringify(record);
      await fs.writeFile(target, original);
      const refused = await f.collect();
      assert.equal(refused.ok, false);
      assert.equal(refused.error.code, 'UNSAFE_RUNTIME_STATE');
      assert.match(refused.error.message, /invalid.*acquiredAt/i);
      assert.equal(refused.error.details.passId, f.passId);
      assert.equal(await fs.readFile(target, 'utf8'), original);
      assert.equal(
        f.calls.some((call) => call.executable === 'gh'),
        false,
      );
      assert.equal((await f.run('pass-close', { passId: f.passId })).ok, true);
    });
});

async function populatedReport(t) {
  const f = await nativeFixture(t, {
    issues: [
      issue(1),
      issue(2),
      issue(3),
      issue(4),
      issue(5, { labels: ['effective-flow-issue-done'] }),
    ],
    pulls: [pull(30, 2), pull(39, 9)],
    branches: [branch(3)],
  });
  const c = await collected(f, { limits: { judgments: 3, plans: 3 } });
  for (const [number, verdict, pullRequest] of [
    [1, 'published', { number: 31, url: 'https://github.com/example/flow/pull/31' }],
    [2, 'published', { number: 30, url: 'https://github.com/example/flow/pull/30' }],
    [3, 'failed'],
    [4, 'failed'],
  ]) {
    const authority = [...c.eligible, ...c.authorizedRecovery].find(
      (entry) => entry.issue === number,
    );
    const result = await f.run('verdict-record', {
      passId: f.passId,
      issue: number,
      fingerprint: authority.fingerprint,
      verdict,
      mode: 'publish',
      reason: `Issue ${number} outcome`,
      ...(pullRequest ? { pullRequest } : {}),
    });
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  const outcomes = {
    verdicts: [1, 2, 3, 4].map((issue) => ({
      issue,
      verdict: issue < 3 ? 'published' : 'failed',
      reason: `Issue ${issue} outcome`,
    })),
    pullRequestsOpened: [
      { issue: 1, number: 31, headRef: branch(1), url: 'https://github.com/example/flow/pull/31' },
    ],
    pullRequestsRecovered: [
      { issue: 2, number: 30, headRef: branch(2), url: 'https://github.com/example/flow/pull/30' },
    ],
    failures: [3, 4].map((issue) => ({
      issue,
      stage: issue === 3 ? 'recovery' : 'judgment',
      code: 'ATTEMPT_FAILED',
    })),
  };
  const written = await f.report(c, outcomes);
  assert.equal(written.ok, true, JSON.stringify(written));
  assert.deepEqual(written.data.orphanBranches, [{ issue: 3, headRef: branch(3) }]);
  assert.deepEqual(written.data.issueClosedPlanPrOpen, [
    { issue: 9, number: 39, headRef: branch(9), url: 'https://github.com/example/flow/pull/39' },
  ]);
  return { f, c, outcomes, report: written.data };
}
function rejectsReport(report, mutate) {
  const changed = structuredClone(report);
  mutate(changed);
  assert.throws(
    () => validatePassReport(changed),
    (error) => error.code === 'INVALID_PAYLOAD',
  );
}

test('consumer report validation rejects unknown nested metadata in populated producer reports', async (t) => {
  const { report } = await populatedReport(t);
  assert.equal(validatePassReport(report), report);
  for (const field of [
    'limits',
    'verdicts',
    'pullRequestsOpened',
    'pullRequestsRecovered',
    'failures',
    'orphanBranches',
    'issueClosedPlanPrOpen',
  ])
    await t.test(field, () => {
      rejectsReport(report, (value) => {
        const entry = Array.isArray(value[field]) ? value[field][0] : value[field];
        entry.unrecognized = 'external metadata';
      });
    });
  const degraded = await fixture(t);
  await fs.writeFile(
    path.join(degraded.root, '.effective-flow/issue-buddy/verdicts.json'),
    '{corrupt',
  );
  const c = await collected(degraded);
  const result = await degraded.report(c);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.cacheDegradation, { code: 'CACHE_CORRUPT' });
  await t.test('cacheDegradation', () =>
    rejectsReport(result.data, (value) => {
      value.cacheDegradation.unrecognized = true;
    }),
  );
});

test('consumer report validation checks positive identities, nested types, repository URLs and branch ownership', async (t) => {
  const { report } = await populatedReport(t);
  const cases = [
    [
      'fractional judgment limit',
      (r) => {
        r.limits.judgments = 1.5;
      },
    ],
    [
      'zero plan limit',
      (r) => {
        r.limits.plans = 0;
      },
    ],
    [
      'verdict issue zero',
      (r) => {
        r.verdicts[0].issue = 0;
      },
    ],
    [
      'verdict reason object',
      (r) => {
        r.verdicts[0].reason = {};
      },
    ],
    [
      'opened PR number string',
      (r) => {
        r.pullRequestsOpened[0].number = '31';
      },
    ],
    [
      'recovered PR number unsafe',
      (r) => {
        r.pullRequestsRecovered[0].number = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'failure issue negative',
      (r) => {
        r.failures[0].issue = -1;
      },
    ],
    [
      'failure stage object',
      (r) => {
        r.failures[0].stage = {};
      },
    ],
    [
      'failure code lowercase',
      (r) => {
        r.failures[0].code = 'attempt_failed';
      },
    ],
    [
      'orphan issue zero',
      (r) => {
        r.orphanBranches[0].issue = 0;
      },
    ],
    [
      'orphan head names another issue',
      (r) => {
        r.orphanBranches[0].headRef = branch(999);
      },
    ],
    [
      'closed-issue PR number fraction',
      (r) => {
        r.issueClosedPlanPrOpen[0].number = 39.5;
      },
    ],
    [
      'closed-issue PR head names another issue',
      (r) => {
        r.issueClosedPlanPrOpen[0].headRef = branch(999);
      },
    ],
    [
      'closed-issue PR URL is foreign',
      (r) => {
        r.issueClosedPlanPrOpen[0].url = 'https://github.com/stranger/flow/pull/39';
      },
    ],
    [
      'opened PR URL is foreign',
      (r) => {
        r.pullRequestsOpened[0].url = 'https://github.com/stranger/flow/pull/31';
      },
    ],
    [
      'recovered PR URL is foreign',
      (r) => {
        r.pullRequestsRecovered[0].url = 'https://github.com/stranger/flow/pull/30';
      },
    ],
    [
      'opened PR URL uses HTTP',
      (r) => {
        r.pullRequestsOpened[0].url = 'http://github.com/example/flow/pull/31';
      },
    ],
    [
      'opened PR head names another issue',
      (r) => {
        r.pullRequestsOpened[0].headRef = branch(999);
      },
    ],
    [
      'recovered PR head names another issue',
      (r) => {
        r.pullRequestsRecovered[0].headRef = branch(999);
      },
    ],
    [
      'nested verdicts is an object',
      (r) => {
        r.verdicts = {};
      },
    ],
    [
      'cache degradation code invalid',
      (r) => {
        r.cacheDegradation = { code: 'OTHER_ERROR' };
      },
    ],
    [
      'cache degradation code has wrong type',
      (r) => {
        r.cacheDegradation = { code: [] };
      },
    ],
  ];
  for (const [name, mutate] of cases) await t.test(name, () => rejectsReport(report, mutate));
});

test('consumer report validation rejects duplicate outcomes and inconsistent populated counts', async (t) => {
  const { report } = await populatedReport(t);
  for (const [name, mutate] of [
    [
      'duplicate verdict',
      (r) => {
        r.verdicts.push(structuredClone(r.verdicts[0]));
      },
    ],
    [
      'duplicate publication',
      (r) => {
        r.pullRequestsRecovered.push(structuredClone(r.pullRequestsOpened[0]));
      },
    ],
    [
      'duplicate failure outcome',
      (r) => {
        r.failures.push(structuredClone(r.failures[0]));
      },
    ],
    [
      'duplicate orphan',
      (r) => {
        r.orphanBranches.push(structuredClone(r.orphanBranches[0]));
      },
    ],
    [
      'duplicate closed-issue PR',
      (r) => {
        r.issueClosedPlanPrOpen.push(structuredClone(r.issueClosedPlanPrOpen[0]));
      },
    ],
    [
      'published count mismatch',
      (r) => {
        r.counts.published++;
      },
    ],
    [
      'failed count mismatch',
      (r) => {
        r.counts.failed--;
      },
    ],
    [
      'missing PR for published outcome',
      (r) => {
        r.pullRequestsOpened = [];
      },
    ],
    [
      'orphan count exceeds branch skip count',
      (r) => {
        r.counts['plan-branch-exists'] = 0;
      },
    ],
  ])
    await t.test(name, () => rejectsReport(report, mutate));
});

test('invalid report submissions preserve existing current and historical report bytes', async (t) => {
  const { f, c, outcomes } = await populatedReport(t);
  const before = await runtimeSnapshot(f);
  const cases = [
    [
      'unknown limit key',
      () => ({ ...structuredClone(outcomes), limits: { judgments: 3, plans: 3, extra: true } }),
    ],
    [
      'unknown verdict key',
      () => {
        const value = structuredClone(outcomes);
        value.verdicts[0].extra = true;
        return value;
      },
    ],
    [
      'unknown opened PR key',
      () => {
        const value = structuredClone(outcomes);
        value.pullRequestsOpened[0].extra = true;
        return value;
      },
    ],
    [
      'unknown recovered PR key',
      () => {
        const value = structuredClone(outcomes);
        value.pullRequestsRecovered[0].extra = true;
        return value;
      },
    ],
    [
      'unknown failure key',
      () => {
        const value = structuredClone(outcomes);
        value.failures[0].extra = true;
        return value;
      },
    ],
    [
      'duplicate recorded verdict',
      () => {
        const value = structuredClone(outcomes);
        value.verdicts.push(structuredClone(value.verdicts[0]));
        return value;
      },
    ],
    ['caller count mismatch', () => ({ ...structuredClone(outcomes), counts: { published: 99 } })],
    [
      'caller foreign PR identity',
      () => {
        const value = structuredClone(outcomes);
        value.pullRequestsRecovered[0].url = 'https://github.com/stranger/flow/pull/30';
        return value;
      },
    ],
    [
      'caller wrong branch identity',
      () => {
        const value = structuredClone(outcomes);
        value.pullRequestsOpened[0].headRef = branch(999);
        return value;
      },
    ],
    [
      'forged orphan metadata',
      () => {
        const copy = structuredClone(c);
        copy.recovery.orphanBranches[0].extra = true;
        return { ...structuredClone(outcomes), collect: copy };
      },
    ],
    [
      'forged closed-issue PR metadata',
      () => {
        const copy = structuredClone(c);
        copy.issueClosedPlanPrOpen[0].extra = true;
        return { ...structuredClone(outcomes), collect: copy };
      },
    ],
    [
      'forged cache degradation metadata',
      () => {
        const copy = structuredClone(c);
        copy.cacheDegradation = { code: 'CACHE_CORRUPT', extra: true };
        return { ...structuredClone(outcomes), collect: copy };
      },
    ],
  ];
  for (const [name, input] of cases)
    await t.test(name, async () => {
      const refused = await f.report(c, input());
      assert.equal(refused.ok, false);
      assert.equal(refused.error.code, 'INVALID_PAYLOAD');
      assert.deepEqual(await runtimeSnapshot(f), before);
    });
});

test('owned recovery verdicts reject a wrong PR number, foreign URL or wrong head before any state change', async (t) => {
  const f = await fixture(t, { pulls: [pull(30, 1)] });
  const c = await collected(f);
  assert.equal(c.eligible.length, 0);
  assert.equal(c.authorizedRecovery.length, 1);
  const before = await runtimeSnapshot(f);
  const correct = {
    pullRequest: { number: 30, url: 'https://github.com/example/flow/pull/30' },
    headRef: branch(1),
  };
  for (const [name, override] of [
    [
      'wrong PR number',
      { pullRequest: { number: 31, url: 'https://github.com/example/flow/pull/31' } },
    ],
    [
      'foreign URL',
      { pullRequest: { number: 30, url: 'https://github.com/stranger/flow/pull/30' } },
    ],
    ['wrong head', { headRef: branch(2) }],
  ])
    await t.test(name, async () => {
      const refused = await f.record(c, 'published', { ...correct, ...override });
      assert.equal(refused.error.code, 'INVALID_PAYLOAD');
      assert.deepEqual(await runtimeSnapshot(f), before);
    });
  assert.equal((await f.record(c, 'published', correct)).ok, true);
});

test('a foreign-fork PR cannot gain recovery authority through caller-supplied issue, fingerprint or branch metadata', async (t) => {
  const f = await fixture(t, {
    pulls: [pull(30, 1, { head: { ref: branch(1), repo: { id: 2, full_name: 'stranger/flow' } } })],
  });
  const c = await collected(f);
  assert.deepEqual(c.authorizedRecovery, []);
  assert.deepEqual(c.recovery.unrecordedPullRequests, []);
  const before = await runtimeSnapshot(f);
  const guessedFingerprint = fingerprint(
    { schemaVersion: 1, issue: 1, title: 'Issue 1', body: 'Trusted body', comments: [] },
    'owner',
  );
  const refused = await f.run('verdict-record', {
    passId: f.passId,
    issue: 1,
    fingerprint: guessedFingerprint,
    verdict: 'published',
    mode: 'publish',
    reason: 'Claimed recovery',
    headRef: branch(1),
    pullRequest: { number: 30, url: 'https://github.com/example/flow/pull/30' },
  });
  assert.equal(refused.error.code, 'INVALID_PAYLOAD');
  assert.deepEqual(await runtimeSnapshot(f), before);
});

function barrier() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function verdictInput(f, c, number, verdict = 'published') {
  const authority = [...c.eligible, ...c.authorizedRecovery].find(
    (entry) => entry.issue === number,
  );
  return {
    passId: f.passId,
    issue: number,
    fingerprint: authority.fingerprint,
    verdict,
    mode: 'publish',
    reason: `Issue ${number} outcome`,
    stableAttemptId: stableAttemptId(f.passId, number),
    ...(verdict === 'published'
      ? {
          pullRequest: {
            number: number + 40,
            url: `https://github.com/example/flow/pull/${number + 40}`,
          },
        }
      : {}),
  };
}
async function noOperationLock(f) {
  await assert.rejects(fs.stat(path.join(f.root, '.effective-flow/issue-buddy/operation.lock')), {
    code: 'ENOENT',
  });
}

test('serializes same-pass verdict transitions before publication limits or cache snapshots are read', async (t) => {
  for (const plans of [1, 2])
    await t.test(`plans=${plans}`, async (t) => {
      const f = await nativeFixture(t, { issues: [issue(1), issue(2)] });
      const c = await collected(f, { limits: { plans } });
      const entered = barrier();
      const proceed = barrier();
      let first = true;
      const paused = {
        ...fs,
        writeFile: async (target, ...args) => {
          if (path.basename(target).startsWith('verdicts.json.') && first) {
            first = false;
            entered.release();
            await proceed.promise;
          }
          return fs.writeFile(target, ...args);
        },
      };
      const one = f.run('verdict-record', verdictInput(f, c, 1), { fs: paused });
      await entered.promise;
      let two;
      try {
        two = await f.run('verdict-record', verdictInput(f, c, 2));
      } finally {
        proceed.release();
      }
      const firstResult = await one;
      assert.equal(firstResult.ok, true, JSON.stringify(firstResult));
      assert.equal(two.ok, false, JSON.stringify(two));
      assert.equal(two.error.code, 'LOCKED');
      const retry = await f.run('verdict-record', verdictInput(f, c, 2));
      if (plans === 1) {
        assert.equal(retry.error.code, 'INVALID_PAYLOAD');
      } else assert.equal(retry.ok, true, JSON.stringify(retry));
      const expectedIssues = plans === 1 ? ['1'] : ['1', '2'];
      const cache = await f.cache();
      assert.deepEqual(Object.keys(cache.records), expectedIssues);
      assert.deepEqual(
        Object.values(cache.attempts)
          .map((attempt) => attempt.issue)
          .sort(),
        expectedIssues.map(Number),
      );
      const lock = JSON.parse(await fs.readFile(f.passPath(), 'utf8'));
      assert.deepEqual(Object.keys(lock.collection.outcomes), expectedIssues);
      assert.deepEqual(await f.run('verdict-record', verdictInput(f, c, 1)), firstResult);
      await noOperationLock(f);
    });
});

test('serializes collection accounting and replay without losing or repeating historical attempts', async (t) => {
  const f = await nativeFixture(t);
  const evidence = await evidenceFor(f);
  const entered = barrier();
  const proceed = barrier();
  let first = true;
  const paused = {
    ...fs,
    rename: async (from, to) => {
      if (to.endsWith('/verdicts.json') && first) {
        first = false;
        entered.release();
        await proceed.promise;
      }
      return fs.rename(from, to);
    },
  };
  const pending = f.collect({ staleAttempts: evidence }, { fs: paused });
  await entered.promise;
  let competing;
  try {
    competing = await f.collect({ staleAttempts: evidence });
  } finally {
    proceed.release();
  }
  const result = await pending;
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(competing.error.code, 'LOCKED');
  const cache = await f.cache();
  const snapshot = await runtimeSnapshot(f);
  const forgeCalls = f.calls.filter((call) => call.executable === 'gh').length;
  const replay = await f.collect({ staleAttempts: evidence });
  assert.deepEqual(replay, result);
  assert.deepEqual(await f.cache(), cache);
  assert.equal(Object.keys(cache.attempts).length, 1);
  assert.equal(cache.records[1].retryCount, 0);
  assert.equal(f.calls.filter((call) => call.executable === 'gh').length, forgeCalls);
  assert.deepEqual(await runtimeSnapshot(f), snapshot);
  assert.equal(
    (await f.collect({ staleAttempts: evidence, limits: { plans: 2 } })).error.code,
    'INVALID_PAYLOAD',
  );
  assert.deepEqual(await f.cache(), cache);
  await noOperationLock(f);
});

test('report publication serializes competing reports, verdicts, collection replays and pass release', async (t) => {
  const f = await nativeFixture(t, { issues: [issue(1), issue(2)] });
  const c = await collected(f);
  assert.equal((await f.run('verdict-record', verdictInput(f, c, 1))).ok, true);
  const outcomes = {
    verdicts: [{ issue: 1, verdict: 'published', reason: 'Issue 1 outcome' }],
    pullRequestsOpened: [
      { issue: 1, number: 41, headRef: branch(1), url: 'https://github.com/example/flow/pull/41' },
    ],
  };
  const entered = barrier();
  const proceed = barrier();
  let first = true;
  const paused = {
    ...fs,
    rename: async (from, to) => {
      if (to.endsWith('/last-pass.json') && first) {
        first = false;
        entered.release();
        await proceed.promise;
      }
      return fs.rename(from, to);
    },
  };
  const pending = f.report(c, outcomes, { fs: paused });
  await entered.promise;
  let competitors;
  try {
    competitors = await Promise.all([
      f.report(c, outcomes),
      f.run('verdict-record', verdictInput(f, c, 2)),
      f.collect(),
      f.run('pass-close', { passId: f.passId }),
      f.run('pass-open'),
    ]);
  } finally {
    proceed.release();
  }
  const published = await pending;
  assert.equal(published.ok, true, JSON.stringify(published));
  for (const competitor of competitors) assert.equal(competitor.error.code, 'LOCKED');
  const before = await runtimeSnapshot(f);
  const repeated = await f.report(c, outcomes);
  assert.deepEqual(repeated, published);
  assert.deepEqual(await runtimeSnapshot(f), before);
  assert.equal((await f.report(c)).error.code, 'INVALID_PAYLOAD');
  assert.deepEqual(await runtimeSnapshot(f), before);
  await noOperationLock(f);
});

test('rejects non-provider timestamp spellings before current authority or historical accounting', async (t) => {
  for (const value of [
    'February 30, 2026 12:00:00 GMT',
    '2026/02/30 12:00:00 GMT',
    '0',
    '2026-02-28T12:00:00Z trailing',
    '2026-02-28T12:00:00',
    '2026-02-28',
  ])
    await t.test(value, async (t) => {
      const f = await fixture(t);
      const evidence = await evidenceFor(f);
      const before = await runtimeSnapshot(f);
      f.state.issues[0].updated_at = value;
      const result = await f.collect({ staleAttempts: evidence });
      assert.equal(result.error.code, 'FORGE_READ_FAILED');
      assert.deepEqual(await runtimeSnapshot(f), before);
      assert.equal(
        (
          await f.record({
            mode: 'publish',
            eligible: [{ fingerprint: evidence[0].originalFingerprint }],
          })
        ).error.code,
        'INVALID_PAYLOAD',
      );
      await noOperationLock(f);
    });
});

test('historical PR reads reject absent or unknown classification states before accounting or authority', async (t) => {
  for (const state of [undefined, '', 'unknown', 'merged'])
    await t.test(String(state), async (t) => {
      const f = await nativeFixture(t, { issues: [issue(1), issue(2)] });
      const first = await collected(f);
      const evidence = [
        {
          issue: 1,
          originalFingerprint: first.eligible[0].fingerprint,
          stableAttemptId: stableAttemptId('old-history-attempt', 1),
        },
      ];
      assert.equal((await f.record(first)).ok, true);
      await f.next();
      const before = await runtimeSnapshot(f);
      f.state.history[`example:${branch(2)}`] = [pull(32, 2, { state })];
      const result = await f.collect({ staleAttempts: evidence });
      assert.equal(result.error.code, 'FORGE_READ_FAILED');
      assert.deepEqual(await runtimeSnapshot(f), before);
      const lock = JSON.parse(await fs.readFile(f.passPath(), 'utf8'));
      assert.equal(lock.collection.status, 'failed');
      assert.equal(lock.collection.result, undefined);
      assert.equal((await f.cache()).records[1].retryCount, 0);
      assert.deepEqual((await f.cache()).attempts, {});
      assert.equal((await f.record(first)).error.code, 'INVALID_PAYLOAD');
      await noOperationLock(f);
    });
});

// IPC controls the persistence boundary while each actor owns a real kernel TCP endpoint.
const mutationChildSource = `
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { executeOperation } from ${JSON.stringify(new URL('../src/scripts/issue-buddy-core.mjs', import.meta.url).href)};
process.once('message', async ({ root, operation, input, boundary, crashExit, mutexWaitMs = 0 }) => {
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
  const runner = async ({ executable, args: raw, stdin }) => {
    const args = raw[0] === '-C' ? raw.slice(2) : raw;
    if (executable !== 'git') throw Error('unexpected non-Git call');
    if (args.includes('--show-toplevel')) return ok(root);
    if (args.includes('--git-common-dir') || args.includes('--git-dir')) return ok(path.join(root, '.git'));
    if (args[0] === 'check-ignore' && args.includes('--stdin')) return ok(String(stdin ?? ''));
    if (args[0] === 'check-ignore' || args[0] === 'ls-files') return ok();
    throw Error('unexpected Git call ' + args.join(' '));
  };
  const observed = { ...fs };
  if (boundary) {
    let occurrence = 0;
    observed[boundary.method] = async (...args) => {
      const target = args[boundary.targetIndex ?? 0];
      if (!target.endsWith(boundary.suffix) || ++occurrence !== (boundary.occurrence ?? 1)) return fs[boundary.method](...args);
      let result;
      if (boundary.after) result = await fs[boundary.method](...args);
      process.send({ kind: 'boundary', target });
      if (crashExit) process.exit(17);
      await new Promise((resolve) => process.once('message', resolve));
      return boundary.after ? result : fs[boundary.method](...args);
    };
  }
  const result = await executeOperation(operation, { cwd: root, ...input }, { runner, fs: observed, clock: () => ${JSON.stringify(NOW)}, mutexWaitMs });
  process.stdout.write(JSON.stringify(result));
  process.disconnect();
});
`;
function mutationChild(t, f, operation, input = {}, extra = {}) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', mutationChildSource], {
    cwd: extra.cwd ?? f.root,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '';
  let errors = '';
  child.stdout.on('data', (bytes) => {
    output += bytes;
  });
  child.stderr.on('data', (bytes) => {
    errors += bytes;
  });
  let entered;
  let rejectEntered;
  const boundary = new Promise((resolve, reject) => {
    entered = resolve;
    rejectEntered = reject;
  });
  // Some actors never pause; attach a handler without hiding failures from boundary waiters.
  boundary.catch(() => {});
  child.on('message', (message) => {
    if (message.kind === 'boundary') entered(message);
  });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 20000);
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      rejectEntered(
        new Error(`child exited before persistence boundary: ${code}/${signal}: ${errors}`),
      );
      resolve({ code, signal, result: output ? JSON.parse(output) : undefined, errors });
    });
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await done;
  });
  child.send({ root: f.root, operation, input, ...extra });
  return { child, boundary, done, proceed: () => child.send({ kind: 'continue' }) };
}
async function childResult(actor) {
  const completed = await actor.done;
  assert.equal(completed.signal, null, completed.errors);
  assert.equal(completed.code, 0, completed.errors);
  return completed.result;
}
function observeEndpoint(captured) {
  return (listener) => {
    const server = createServer(listener);
    const listen = server.listen.bind(server);
    server.listen = (endpoint) => {
      captured.push(endpoint);
      return listen(endpoint);
    };
    return server;
  };
}

test(
  'real processes serialize publication caps and retain every committed cache and pass outcome',
  { timeout: 30000 },
  async (t) => {
    for (const plans of [1, 2])
      await t.test(`plans=${plans}`, async (t) => {
        const f = await nativeFixture(t, { issues: [issue(1), issue(2)] });
        const c = await collected(f, { limits: { plans } });
        const first = mutationChild(t, f, 'verdict-record', verdictInput(f, c, 1), {
          boundary: { method: 'rename', targetIndex: 1, suffix: '/verdicts.json' },
        });
        await first.boundary;
        const denied = await childResult(
          mutationChild(t, f, 'verdict-record', verdictInput(f, c, 2)),
        );
        assert.equal(denied.error.code, 'LOCKED');
        assert.deepEqual(denied.error.details, {});
        first.proceed();
        const committed = await childResult(first);
        assert.equal(committed.ok, true, JSON.stringify(committed));
        const retry = await childResult(
          mutationChild(t, f, 'verdict-record', verdictInput(f, c, 2)),
        );
        if (plans === 1) assert.equal(retry.error.code, 'INVALID_PAYLOAD');
        else assert.equal(retry.ok, true, JSON.stringify(retry));
        const expected = plans === 1 ? ['1'] : ['1', '2'];
        assert.deepEqual(Object.keys((await f.cache()).records), expected);
        const lock = JSON.parse(await fs.readFile(f.passPath(), 'utf8'));
        assert.deepEqual(Object.keys(lock.collection.outcomes), expected);
        assert.deepEqual(
          await childResult(mutationChild(t, f, 'verdict-record', verdictInput(f, c, 1))),
          committed,
        );
      });
  },
);

test(
  'SIGKILL before and after create-only pass publication leaves no record or an explicitly closable one',
  { timeout: 30000 },
  async (t) => {
    for (const after of [false, true])
      await t.test(`after publication=${after}`, async (t) => {
        const f = await nativeFixture(t);
        await f.run('pass-close', { passId: f.passId });
        await fs.rm(path.join(f.root, '.effective-flow'), { recursive: true });
        const actor = mutationChild(
          t,
          f,
          'pass-open',
          {},
          {
            boundary: { method: 'link', targetIndex: 1, suffix: '.json', after },
          },
        );
        await actor.boundary;
        actor.child.kill('SIGKILL');
        assert.equal((await actor.done).signal, 'SIGKILL');
        const passes = path.join(f.root, '.effective-flow/issue-buddy/passes');
        const records = (await fs.readdir(passes)).filter((name) => name.endsWith('.json'));
        // A killed pass never blocks another one: a new pass opens beside its record.
        const opened = await f.run('pass-open');
        assert.equal(opened.ok, true, JSON.stringify(opened));
        if (after) {
          assert.equal(records.length, 1);
          const orphan = records[0].replace(/\.json$/, '');
          assert.match(orphan, /^[a-f0-9-]{36}$/);
          const bytes = await runtimeSnapshot(f);
          assert.equal(
            (await f.run('pass-close', { passId: 'wrong' })).error.code,
            'PASS_NOT_FOUND',
          );
          assert.deepEqual(await runtimeSnapshot(f), bytes);
          assert.equal((await f.run('pass-close', { passId: orphan })).ok, true);
        } else assert.deepEqual(records, []);
        assert.equal((await f.run('pass-close', { passId: opened.data.passId })).ok, true);
        await noOperationLock(f);
      });
  },
);

test(
  'SIGKILL at an actual cache persistence boundary frees TCP while preserving holder release and next acquire',
  { timeout: 30000 },
  async (t) => {
    const f = await nativeFixture(t);
    const c = await collected(f);
    const actor = mutationChild(t, f, 'verdict-record', verdictInput(f, c, 1), {
      boundary: { method: 'rename', targetIndex: 1, suffix: '/verdicts.json', after: true },
    });
    await actor.boundary;
    actor.child.kill('SIGKILL');
    assert.equal((await actor.done).signal, 'SIGKILL');
    assert.equal((await f.cache()).records[1].verdict, 'published');
    // The killed operation freed the TCP endpoint; its pass record stays until explicit close.
    assert.equal((await fs.stat(f.passPath())).isFile(), true);
    assert.equal((await f.run('pass-close', { passId: 'wrong' })).error.code, 'PASS_NOT_FOUND');
    assert.equal((await f.run('pass-close', { passId: f.passId })).ok, true);
    assert.equal((await f.run('pass-open')).ok, true);
    await noOperationLock(f);
  },
);

test(
  'operation TCP ownership is released on a thrown persistence error and explicit process exit',
  { timeout: 30000 },
  async (t) => {
    const f = await nativeFixture(t);
    const c = await collected(f);
    const refused = await f.run('verdict-record', verdictInput(f, c, 1), {
      fs: {
        ...fs,
        rename: async () => {
          throw Object.assign(new Error('write denied'), { code: 'EACCES' });
        },
      },
    });
    assert.equal(refused.error.code, 'UNSAFE_RUNTIME_STATE');
    const actor = mutationChild(t, f, 'verdict-record', verdictInput(f, c, 1), {
      boundary: { method: 'rename', targetIndex: 1, suffix: '/verdicts.json' },
      crashExit: true,
    });
    await actor.boundary;
    assert.equal((await actor.done).code, 17);
    assert.equal((await f.run('pass-close', { passId: f.passId })).ok, true);
    assert.equal((await f.run('pass-open')).ok, true);
  },
);

test('denied loopback bind and an unrelated occupied endpoint fail closed before first runtime mkdir', async (t) => {
  const f = await nativeFixture(t);
  const captured = [];
  await f.run('pass-close', { passId: f.passId }, { createServer: observeEndpoint(captured) });
  await fs.rm(path.join(f.root, '.effective-flow'), { recursive: true });
  let mutations = 0;
  const observed = { ...fs };
  for (const name of ['mkdir', 'writeFile', 'link', 'rename', 'unlink', 'open'])
    observed[name] = async (...args) => {
      mutations++;
      return fs[name](...args);
    };
  const deniedServer = () => {
    const server = new EventEmitter();
    server.listen = () => {
      queueMicrotask(() =>
        server.emit('error', Object.assign(new Error('sandbox denied'), { code: 'EPERM' })),
      );
    };
    return server;
  };
  const denied = await f.run('pass-open', {}, { fs: observed, createServer: deniedServer });
  assert.equal(denied.error.code, 'UNSAFE_RUNTIME_STATE');
  assert.match(denied.error.message, /loopback TCP.*local-listen permission.*sandbox/);
  const blocker = createServer((socket) => socket.destroy());
  blocker.listen(captured[0]);
  await once(blocker, 'listening');
  try {
    const occupied = await f.run('pass-open', {}, { fs: observed });
    assert.equal(occupied.error.code, 'LOCKED');
    assert.deepEqual(occupied.error.details, {});
    assert.equal(mutations, 0);
    await assert.rejects(fs.stat(path.join(f.root, '.effective-flow')), { code: 'ENOENT' });
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
  assert.equal((await f.run('pass-open')).ok, true);
});

test('legacy operation and per-write locks retain all bytes and unrelated temporary evidence', async (t) => {
  for (const relative of [
    'operation.lock',
    'verdicts.json.lock',
    'pass.lock.lock',
    'reports/unknown.lock',
  ])
    await t.test(relative, async (t) => {
      const f = await nativeFixture(t);
      await collected(f);
      const directory = path.join(f.root, '.effective-flow/issue-buddy');
      const target = path.join(directory, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, 'unknown holder');
      await fs.writeFile(path.join(directory, 'unrelated.tmp'), 'operator evidence');
      const snapshot = await runtimeSnapshot(f);
      const refused = await f.run('pass-close', { passId: f.passId });
      assert.equal(refused.error.code, 'LOCKED');
      assert.match(refused.error.message, /operator inspection/);
      assert.deepEqual(await runtimeSnapshot(f), snapshot);
      await fs.unlink(target);
      assert.equal((await f.run('pass-close', { passId: f.passId })).ok, true);
      assert.equal(
        await fs.readFile(path.join(directory, 'unrelated.tmp'), 'utf8'),
        'operator evidence',
      );
    });
});

// Invariant: the whole-pass lock of earlier releases is never deleted or ignored. While it
// exists every operation refuses with LEGACY_PASS_LOCK and leaves all runtime bytes unchanged.
test('a legacy pass.lock refuses every operation for operator inspection and is never removed', async (t) => {
  const f = await nativeFixture(t);
  const target = path.join(f.root, '.effective-flow/issue-buddy/pass.lock');
  await fs.writeFile(target, JSON.stringify({ passId: 'older-protocol', acquiredAt: NOW }));
  const snapshot = await runtimeSnapshot(f);
  const record = await fs.readFile(f.passPath(), 'utf8');
  for (const [operation, input] of [
    ['pass-open', {}],
    ['pass-collect', f.collectInput()],
    ['pass-close', { passId: f.passId }],
  ]) {
    const refused = await f.run(operation, input);
    assert.equal(refused.error.code, 'LEGACY_PASS_LOCK', operation);
    assert.match(refused.error.message, /operator inspection/);
    assert.deepEqual(refused.error.details, { path: '.effective-flow/issue-buddy/pass.lock' });
  }
  assert.equal(
    f.calls.some((call) => call.executable === 'gh'),
    false,
  );
  assert.deepEqual(await runtimeSnapshot(f), snapshot);
  assert.equal(await fs.readFile(f.passPath(), 'utf8'), record);
  assert.equal(
    await fs.readFile(target, 'utf8'),
    JSON.stringify({ passId: 'older-protocol', acquiredAt: NOW }),
  );
  await fs.unlink(target);
  assert.equal((await f.run('pass-close', { passId: f.passId })).ok, true);
});

test(
  'mutex listener destroys incoming sockets and remains held until guarded retention finishes',
  { timeout: 30000 },
  async (t) => {
    const f = await nativeFixture(t);
    const c = await collected(f);
    const reports = path.join(f.root, '.effective-flow/issue-buddy/reports');
    await fs.mkdir(reports, { recursive: true });
    for (let i = 0; i < 21; i++) await fs.writeFile(path.join(reports, `old-${i}.json`), '{}');
    const entered = barrier();
    const proceed = barrier();
    const captured = [];
    let paused = false;
    const pending = f.report(
      c,
      {},
      {
        createServer: observeEndpoint(captured),
        fs: {
          ...fs,
          unlink: async (target) => {
            if (target.includes('/reports/old-') && !paused) {
              paused = true;
              entered.release();
              await proceed.promise;
            }
            return fs.unlink(target);
          },
        },
      },
    );
    await entered.promise;
    try {
      const connection = createConnection(captured[0]);
      const closed = once(connection, 'close');
      connection.on('error', () => {});
      await closed;
      assert.equal(connection.destroyed, true);
      assert.equal((await f.run('pass-close', { passId: f.passId })).error.code, 'LOCKED');
    } finally {
      proceed.release();
    }
    assert.equal((await pending).ok, true);
    assert.equal((await fs.readdir(reports)).length, 20);
    assert.equal((await f.run('pass-close', { passId: f.passId })).ok, true);
  },
);

function reportOutcomes(c, inputs) {
  return {
    verdicts: inputs.map(({ issue, verdict, reason }) => ({ issue, verdict, reason })),
    pullRequestsOpened: inputs
      .filter((entry) => entry.verdict === 'published')
      .map((entry) => ({
        issue: entry.issue,
        headRef: branch(entry.issue),
        ...entry.pullRequest,
      })),
    failures: inputs
      .filter((entry) => entry.verdict === 'failed')
      .map((entry) => ({
        issue: entry.issue,
        stage: 'planning',
        code: 'PLAN_FAILED',
      })),
  };
}
async function persistedPass(f) {
  return JSON.parse(await fs.readFile(f.passPath(), 'utf8'));
}

test(
  'killed cache commit reconciles the same pass before publication caps, conflicting replays or reports',
  { timeout: 30000 },
  async (t) => {
    for (const plans of [1, 2])
      await t.test(`plans=${plans}`, async (t) => {
        const f = await nativeFixture(t, { issues: [issue(1), issue(2)] });
        const c = await collected(f, { limits: { plans } });
        const one = verdictInput(f, c, 1);
        const two = verdictInput(f, c, 2);
        const actor = mutationChild(t, f, 'verdict-record', one, {
          boundary: { method: 'rename', targetIndex: 1, suffix: '/verdicts.json', after: true },
        });
        await actor.boundary;
        actor.child.kill('SIGKILL');
        assert.equal((await actor.done).signal, 'SIGKILL');
        assert.deepEqual((await persistedPass(f)).collection.outcomes, {});
        assert.ok((await persistedPass(f)).collection.pendingVerdict);
        // The next operation is a different issue, exactly as in the killed-process regression.
        const resumed = await f.run('verdict-record', two);
        if (plans === 1) assert.equal(resumed.error.code, 'INVALID_PAYLOAD');
        else assert.equal(resumed.ok, true, JSON.stringify(resumed));
        // An omitted committed outcome cannot become a completed report after restart.
        assert.equal((await f.report(c)).error.code, 'INVALID_PAYLOAD');
        assert.deepEqual(
          Object.keys((await persistedPass(f)).collection.outcomes),
          plans === 1 ? ['1'] : ['1', '2'],
        );
        assert.deepEqual((await f.collect({ limits: { plans } })).data, c);
        assert.equal(
          (await f.run('verdict-record', { ...one, reason: 'Conflicting retry' })).error.code,
          'INVALID_PAYLOAD',
        );
        assert.equal(
          (await f.run('verdict-record', { ...one, stableAttemptId: undefined })).error.code,
          'INVALID_PAYLOAD',
        );
        const inputs = plans === 1 ? [one] : [one, two];
        const complete = await f.report(c, reportOutcomes(c, inputs));
        assert.equal(complete.ok, true, JSON.stringify(complete));
        const beforeReplay = await runtimeSnapshot(f);
        assert.equal((await f.run('verdict-record', one)).ok, true);
        assert.deepEqual(await runtimeSnapshot(f), beforeReplay);
        assert.equal(Object.keys((await f.cache()).attempts).length, inputs.length);
        assert.equal((await persistedPass(f)).collection.pendingVerdict, undefined);
      });
  },
);

test(
  'durable verdict intent without cache commit authorizes only an identical retry and preserves attempt dedup',
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t, { issues: [issue(1), issue(2)] });
    const c = await collected(f, { limits: { plans: 2 } });
    const one = verdictInput(f, c, 1, 'failed');
    const beforeCache = await fs
      .readFile(path.join(f.root, '.effective-flow/issue-buddy/verdicts.json'), 'utf8')
      .catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      });
    const refused = await f.run('verdict-record', one, {
      fs: {
        ...fs,
        rename: async (from, to) => {
          if (to.endsWith('/verdicts.json')) throw new Error('cache commit refused');
          return fs.rename(from, to);
        },
      },
    });
    assert.equal(refused.error.code, 'UNSAFE_RUNTIME_STATE');
    const pending = await persistedPass(f);
    assert.ok(pending.collection.pendingVerdict);
    assert.deepEqual(pending.collection.outcomes, {});
    const afterCache = await fs
      .readFile(path.join(f.root, '.effective-flow/issue-buddy/verdicts.json'), 'utf8')
      .catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      });
    assert.equal(afterCache, beforeCache);
    const before = await runtimeSnapshot(f);
    assert.equal((await f.collect()).error.code, 'UNSAFE_RUNTIME_STATE');
    assert.equal((await f.report(c)).error.code, 'UNSAFE_RUNTIME_STATE');
    assert.equal(
      (await f.run('verdict-record', verdictInput(f, c, 2))).error.code,
      'UNSAFE_RUNTIME_STATE',
    );
    assert.equal(
      (await f.run('verdict-record', { ...one, reason: 'Changed' })).error.code,
      'INVALID_PAYLOAD',
    );
    assert.deepEqual(await runtimeSnapshot(f), before);
    assert.equal((await f.run('verdict-record', one)).ok, true);
    assert.equal((await f.cache()).records[1].retryCount, 0);
    assert.equal(Object.keys((await f.cache()).attempts).length, 1);
    const stable = await runtimeSnapshot(f);
    assert.equal((await f.run('verdict-record', one)).ok, true);
    assert.deepEqual(await runtimeSnapshot(f), stable);
    assert.equal((await f.report(c, reportOutcomes(c, [one]))).ok, true);
  },
);

test('a cache outcome from an older incomplete protocol grants no same-pass authority without an intent', async (t) => {
  const f = await fixture(t, { issues: [issue(1), issue(2)] });
  const c = await collected(f);
  assert.equal((await f.run('verdict-record', verdictInput(f, c, 1))).ok, true);
  const target = f.passPath();
  const lock = await persistedPass(f);
  lock.collection.outcomes = {};
  delete lock.collection.pendingVerdict;
  await fs.writeFile(target, JSON.stringify(lock));
  const before = await runtimeSnapshot(f);
  assert.equal((await f.collect()).error.code, 'UNSAFE_RUNTIME_STATE');
  assert.equal((await f.report(c)).error.code, 'UNSAFE_RUNTIME_STATE');
  assert.equal(
    (await f.run('verdict-record', verdictInput(f, c, 2))).error.code,
    'UNSAFE_RUNTIME_STATE',
  );
  assert.deepEqual(await runtimeSnapshot(f), before);
  assert.equal((await f.run('pass-close', { passId: 'wrong' })).error.code, 'PASS_NOT_FOUND');
  assert.equal((await f.run('pass-close', { passId: f.passId })).ok, true);
  assert.equal((await f.run('pass-open')).ok, true);
});

test(
  'each verdict intent and final pass persistence kill boundary resumes with one original transition',
  { timeout: 30000 },
  async (t) => {
    for (const occurrence of [1, 2])
      for (const after of [false, true])
        await t.test(`pass rename ${occurrence}, after=${after}`, async (t) => {
          const f = await nativeFixture(t);
          const c = await collected(f);
          const one = verdictInput(f, c, 1, 'failed');
          const actor = mutationChild(t, f, 'verdict-record', one, {
            boundary: {
              method: 'rename',
              targetIndex: 1,
              suffix: `/passes/${f.passId}.json`,
              occurrence,
              after,
            },
          });
          await actor.boundary;
          actor.child.kill('SIGKILL');
          assert.equal((await actor.done).signal, 'SIGKILL');
          const durable = await persistedPass(f);
          if (occurrence === 1 && after) {
            const before = await runtimeSnapshot(f);
            assert.equal((await f.collect()).error.code, 'UNSAFE_RUNTIME_STATE');
            assert.equal((await f.report(c)).error.code, 'UNSAFE_RUNTIME_STATE');
            assert.deepEqual(await runtimeSnapshot(f), before);
          }
          // A changed clock cannot change the already intended record or increment its retry.
          const retried = await f.run('verdict-record', one, {
            clock: () => '2026-10-19T13:00:00.000Z',
          });
          assert.equal(retried.ok, true, JSON.stringify(retried));
          const cache = await f.cache();
          assert.equal(cache.records[1].retryCount, 0);
          assert.equal(
            cache.records[1].recordedAt,
            occurrence === 1 && !after ? '2026-10-19T13:00:00.000Z' : NOW,
          );
          assert.equal(Object.keys(cache.attempts).length, 1);
          const pass = await persistedPass(f);
          assert.equal(pass.collection.pendingVerdict, undefined);
          assert.equal(Object.keys(pass.collection.outcomes).length, 1);
          if (durable.collection.pendingVerdict)
            assert.deepEqual(cache.records[1], durable.collection.pendingVerdict.record);
          assert.equal((await f.report(c, reportOutcomes(c, [one]))).ok, true);
          await f.next();
          const oldAttempt = {
            issue: 1,
            originalFingerprint: one.fingerprint,
            stableAttemptId: one.stableAttemptId,
          };
          await collected(f, { staleAttempts: [oldAttempt] });
          assert.equal((await f.cache()).records[1].retryCount, 0);
          assert.equal(Object.keys((await f.cache()).attempts).length, 1);
        });
  },
);

test('intent persistence failure before publication leaves cache and pass unchanged and remains retryable', async (t) => {
  const f = await fixture(t);
  const c = await collected(f);
  const one = verdictInput(f, c, 1);
  const before = await runtimeSnapshot(f);
  const refused = await f.run('verdict-record', one, {
    fs: {
      ...fs,
      rename: async (from, to) => {
        if (to === f.passPath()) throw new Error('intent publication refused');
        return fs.rename(from, to);
      },
    },
  });
  assert.equal(refused.error.code, 'UNSAFE_RUNTIME_STATE');
  assert.deepEqual(await runtimeSnapshot(f), before);
  assert.equal((await f.run('verdict-record', one)).ok, true);
});

test('unproven or malformed pending verdict evidence preserves bytes and retains matching operator release', async (t) => {
  for (const variant of [
    'foreign-pass',
    'foreign-attempt',
    'extra-key',
    'missing-record',
    'wrong-before',
    'wrong-after',
    'cache-changed',
  ])
    await t.test(variant, async (t) => {
      const f = await fixture(t);
      const c = await collected(f);
      const one = verdictInput(f, c, 1);
      const failed = await f.run('verdict-record', one, {
        fs: {
          ...fs,
          rename: async (from, to) => {
            if (to.endsWith('/verdicts.json')) throw new Error('cache refused');
            return fs.rename(from, to);
          },
        },
      });
      assert.equal(failed.error.code, 'UNSAFE_RUNTIME_STATE');
      const lock = await persistedPass(f);
      const intent = lock.collection.pendingVerdict;
      assert.ok(intent);
      if (variant === 'foreign-pass') intent.record.recordedPassId = 'foreign';
      if (variant === 'foreign-attempt')
        intent.outcome.stableAttemptId = stableAttemptId('foreign', 1);
      if (variant === 'extra-key') intent.extra = true;
      if (variant === 'missing-record') delete intent.record;
      if (variant === 'wrong-before') intent.beforeDigest = '0'.repeat(64);
      if (variant === 'wrong-after') intent.afterDigest = '0'.repeat(64);
      if (variant === 'cache-changed') {
        // The journal binds this issue's record: a foreign record for it is unproven evidence.
        const other = {
          schemaVersion: 1,
          repository: c.repository,
          records: {
            1: {
              issue: 1,
              fingerprint: one.fingerprint,
              verdict: 'not-ready',
              mode: 'publish',
              reason: 'Foreign',
              retryCount: 0,
              recordedPassId: 'foreign-pass',
              recordedAt: NOW,
            },
          },
          attempts: {},
          closedPlanPrObservations: { 3: { 9: one.fingerprint } },
        };
        await fs.writeFile(
          path.join(f.root, '.effective-flow/issue-buddy/verdicts.json'),
          JSON.stringify(other),
        );
      }
      await fs.writeFile(f.passPath(), JSON.stringify(lock));
      const before = await runtimeSnapshot(f);
      const refused = await f.run('verdict-record', one);
      assert.equal(refused.ok, false, JSON.stringify(refused));
      assert.ok(['INVALID_PAYLOAD', 'UNSAFE_RUNTIME_STATE'].includes(refused.error.code));
      assert.deepEqual(await runtimeSnapshot(f), before);
      assert.equal((await f.run('pass-close', { passId: 'wrong' })).error.code, 'PASS_NOT_FOUND');
      assert.equal((await f.run('pass-close', { passId: f.passId })).ok, true);
      assert.equal((await f.run('pass-open')).ok, true);
    });
});

// ---------------------------------------------------------------------------------------------
// Single-issue selector (`--issue <N>`) and the autopilot private-publication consent binding.

const callsFor = (f, pattern) =>
  f.calls.filter((call) => call.executable === 'gh' && pattern.test(call.args.at(-1)));

// Invariant: the selector restricts collection, trust reads and recovery authority to the one
// selected issue; every other open issue yields no candidate, skip, recovery or verdict authority.
test('the issue selector collects and recovers only the selected issue', async (t) => {
  const f = await fixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    branches: [branch(2), branch(3)],
  });
  const orphan = await collected(f, { issue: 2 });
  assert.equal(orphan.issue, 2);
  assert.deepEqual(orphan.eligible, []);
  assert.deepEqual(orphan.skipped, [{ issue: 2, reason: 'plan-branch-exists' }]);
  assert.deepEqual(
    orphan.authorizedRecovery.map((entry) => [entry.issue, entry.kind]),
    [[2, 'orphan-branch']],
  );
  assert.deepEqual(orphan.recovery.orphanBranches, [{ issue: 2, headRef: branch(2) }]);
  assert.deepEqual(
    callsFor(f, /\/issues\/\d+\/comments/).map(
      (call) => call.args.at(-1).match(/issues\/(\d+)/)[1],
    ),
    ['2'],
  );
  // The selector is part of the collection request: a replay with another issue is refused.
  assert.equal((await f.collect({ issue: 1 })).error.code, 'INVALID_PAYLOAD');

  await f.next();
  const ready = await collected(f, { issue: 1 });
  assert.deepEqual(
    ready.eligible.map((entry) => entry.issue),
    [1],
  );
  assert.equal(ready.eligibleCount, 1);
  assert.deepEqual(ready.skipped, []);
  assert.deepEqual(ready.authorizedRecovery, []);
  const foreign = await f.record(ready, 'not-ready', {
    issue: 3,
    fingerprint: orphan.authorizedRecovery[0].fingerprint,
  });
  assert.equal(foreign.error.code, 'INVALID_PAYLOAD');
  assert.equal((await f.record(ready, 'not-ready')).ok, true);
});

// Invariant: without the selector the collection result keeps its exact pre-selector shape.
test('a collection without the selector carries no issue field', async (t) => {
  const f = await fixture(t, { issues: [issue(1), issue(2)] });
  const c = await collected(f);
  assert.equal(Object.hasOwn(c, 'issue'), false);
  assert.deepEqual(
    c.eligible.map((entry) => entry.issue),
    [1, 2],
  );
});

// Invariant: the selector keeps the trust filter; an untrusted author's selected issue is
// skipped and never becomes a candidate or recovery.
test('a selected issue by an untrusted author is skipped', async (t) => {
  const f = await fixture(t, {
    issues: [issue(1, { user: { login: 'stranger' } }), issue(2)],
    permission: { stranger: 'read' },
    branches: [branch(1)],
  });
  const c = await collected(f, { issue: 1 });
  assert.deepEqual(c.skipped, [{ issue: 1, reason: 'untrusted-author' }]);
  assert.deepEqual(c.eligible, []);
  assert.deepEqual(c.authorizedRecovery, []);
});

// Invariant: a selected issue that is not in the open listing (closed or missing) is its own
// stop result, `ISSUE_NOT_OPEN`, distinct from every skip reason; it grants no authority and
// reports as the pass's collection failure.
test('a missing or closed selected issue yields the ISSUE_NOT_OPEN stop result', async (t) => {
  const f = await fixture(t, { issues: [issue(1)] });
  const stopped = await f.collect({ issue: 7 });
  assert.equal(stopped.ok, false);
  assert.equal(stopped.error.code, 'ISSUE_NOT_OPEN');
  assert.deepEqual(stopped.error.details, { issue: 7 });
  assert.equal(SKIP_REASONS.includes('ISSUE_NOT_OPEN'), false);
  assert.deepEqual(callsFor(f, /\/issues\/\d+\/comments/), []);
  const r = await f.report(null, {
    outcome: 'failed',
    failures: [{ issue: null, stage: 'collect', code: 'ISSUE_NOT_OPEN' }],
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.data.verdicts, []);
  assert.deepEqual(r.data.pullRequestsOpened, []);
});

// Invariant: the selector is a positive safe integer; anything else fails before forge reads.
test('an invalid issue selector is rejected before any forge read', async (t) => {
  const f = await fixture(t);
  for (const value of [0, -1, 1.5, '1', null]) {
    assert.equal((await f.collect({ issue: value })).error.code, 'INVALID_PAYLOAD', String(value));
  }
  assert.deepEqual(callsFor(f, /./), []);
});

// Invariant: the consent Issue Buddy requires before a private publication binds the received
// run id to the selected issue in the repository its own collection resolved: the persisted
// `collect.repository` is a valid `consent-check` source, and another issue is refused.
test('the collected repository and selected issue bind the autopilot consent-check', async (t) => {
  const f = await fixture(t, { issues: [issue(5)] });
  const c = await collected(f, { issue: 5, repositoryVisibility: 'private' });
  const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'issue-buddy-consent-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Effective Flow Test',
    GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
    GIT_COMMITTER_NAME: 'Effective Flow Test',
    GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
  };
  for (const args of [
    ['init', '-q', '--initial-branch=main'],
    ['commit', '-q', '--allow-empty', '-m', 'fixture'],
  ])
    assert.equal(spawnSync('git', args, { cwd: root, env }).status, 0);
  await fs.writeFile(path.join(root, '.gitignore'), '.effective-flow/\n');
  const deps = { runner: createProcessRunner(), env, now: () => Date.parse(NOW) };
  const ledger = await autopilotOperation(
    'run-init',
    {
      cwd: root,
      source: { kind: 'issue', issue: c.issue, repository: c.repository },
      visibility: 'private',
      language: 'en',
    },
    deps,
  );
  assert.equal(ledger.ok, true, JSON.stringify(ledger));
  const runId = ledger.data.runId;
  const check = (extra) =>
    autopilotOperation(
      'consent-check',
      { cwd: root, runId, issue: c.issue, repository: c.repository, ...extra },
      deps,
    );
  assert.deepEqual((await check({})).data, { consent: 'granted', runId });
  assert.equal((await check({ issue: 6 })).data.reason, 'wrong-source');
  await autopilotOperation('run-close', { cwd: root, runId, outcome: 'no-pull-request' }, deps);
  assert.equal((await check({})).data.reason, 'run-closed');
});

// ---------------------------------------------------------------------------------------------
// Parallel passes: per-issue planning claims, claim-scoped authority, merge-only cache, bounded
// mutex, and the adoption of an issue-sourced autopilot run's claim.

const FIXTURE_TARGET = { kind: 'forge', host: 'github.com', owner: 'example', repository: 'flow' };
function claimFile(f, issueNumber) {
  return path.join(f.root, planningClaimKey({ target: FIXTURE_TARGET, issue: issueNumber }).path);
}
async function readClaim(f, issueNumber) {
  try {
    return JSON.parse(await fs.readFile(claimFile(f, issueNumber), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}
// A second pass in the same fixture: its own passId, collect, record and report.
async function otherPass(f) {
  const opened = await f.run('pass-open');
  assert.equal(opened.ok, true, JSON.stringify(opened));
  const passId = opened.data.passId;
  return {
    passId,
    collect: (extra = {}, overrides) =>
      f.run('pass-collect', f.collectInput({ passId, ...extra }), overrides),
    record: (c, number, verdict = 'failed', overrides) =>
      f.run(
        'verdict-record',
        {
          passId,
          mode: c.mode,
          issue: number,
          fingerprint: [...c.eligible, ...c.authorizedRecovery].find(
            (entry) => entry.issue === number,
          ).fingerprint,
          verdict,
          reason: `Issue ${number} outcome`,
        },
        overrides,
      ),
    close: () => f.run('pass-close', { passId }),
  };
}

// Invariant (acceptance "Same issue, single mode"): a second pass for an issue another pass
// holds fails ISSUE_CLAIMED with the holder, never its token, and changes nothing outside its own
// pass record.
test('a second single-issue pass for a claimed issue fails ISSUE_CLAIMED with the holder and no side effects', async (t) => {
  const f = await fixture(t, { issues: [issue(1), issue(2)] });
  const first = await collected(f, { issue: 1 });
  assert.deepEqual(
    first.eligible.map((entry) => entry.issue),
    [1],
  );
  const held = await readClaim(f, 1);
  assert.equal(held.workflow, 'issue-buddy');
  assert.equal(held.passId, f.passId);
  const second = await otherPass(f);
  const before = await runtimeSnapshot(f);
  const refused = await second.collect({ issue: 1 });
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'ISSUE_CLAIMED');
  assert.deepEqual(refused.error.details, {
    issue: 1,
    repository: 'github.com/example/flow',
    holder: {
      workflow: 'issue-buddy',
      passId: f.passId,
      acquiredAt: NOW,
      ageMs: 0,
      stale: false,
      liveness: refused.error.details.holder.liveness,
    },
  });
  assert.doesNotMatch(JSON.stringify(refused), new RegExp(held.claimId));
  assert.deepEqual(await runtimeSnapshot(f), before);
  assert.deepEqual(await readClaim(f, 1), held);
  const record = JSON.parse(await fs.readFile(f.passPath(second.passId), 'utf8'));
  assert.equal(record.collection.status, 'failed');
  assert.deepEqual(record.collection.failure, { code: 'ISSUE_CLAIMED' });
  assert.deepEqual(record.claims, []);
  const report = await f.run('pass-report', {
    passId: second.passId,
    outcome: 'failed',
    cutOff: 'none',
    verdicts: [],
    pullRequestsOpened: [],
    pullRequestsRecovered: [],
    failures: [{ issue: null, stage: 'collect', code: 'ISSUE_CLAIMED' }],
  });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.deepEqual((await second.close()).data.releasedClaims, []);
  assert.deepEqual(await readClaim(f, 1), held);
  assert.equal((await f.record(first, 'not-ready')).ok, true);
  // The final verdict settles the issue: its claim and trusted text are released.
  assert.equal(await readClaim(f, 1), undefined);
  await assert.rejects(fs.stat(first.eligible[0].trustedTextPath), { code: 'ENOENT' });
});

// Invariant (acceptance "Same issue, batch mode"): a batch pass skips an issue another run holds
// as `issue-in-progress` and fills the judgment slot with the next eligible issue.
test('a batch pass skips a claimed issue as issue-in-progress and judges the next eligible one', async (t) => {
  const f = await fixture(t, { issues: [issue(1), issue(2), issue(3)] });
  await collected(f, { issue: 1 });
  const batch = await otherPass(f);
  const c = (await batch.collect({ limits: { judgments: 1 } })).data;
  assert.deepEqual(c.skipped, [{ issue: 1, reason: 'issue-in-progress' }]);
  assert.deepEqual(
    c.eligible.map((entry) => entry.issue),
    [2],
  );
  assert.equal(c.eligibleCount, 2);
  assert.equal((await readClaim(f, 2)).passId, batch.passId);
  assert.equal(await readClaim(f, 3), undefined, 'an issue beyond the slice is not claimed');
  assert.equal((await readClaim(f, 1)).passId, f.passId);
  assert.ok(SKIP_REASONS.includes('issue-in-progress'));
  const report = await f.run('pass-report', {
    passId: batch.passId,
    collect: c,
    outcome: 'completed',
    cutOff: 'judgment-limit',
    verdicts: [],
    pullRequestsOpened: [],
    pullRequestsRecovered: [],
    failures: [],
  });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.deepEqual(report.data.counts, { 'issue-in-progress': 1 });
  assert.deepEqual((await batch.close()).data.releasedClaims, [2]);
  assert.equal(await readClaim(f, 2), undefined);
});

// Invariant (acceptance "Claim scope"): a pass never authorizes recovery for, writes a
// stale-attempt record for, or deletes the trusted text of an issue another pass holds.
test('recovery authorization, stale-attempt accounting and trusted text stay within the claims a pass holds', async (t) => {
  for (const variant of ['orphan-branch', 'unrecorded-pull-request', 'stale-attempt', 'dry-run'])
    await t.test(variant, async (t) => {
      const f = await fixture(t, { issues: [issue(1), issue(2)] });
      const first = await collected(f, { issue: 1 });
      const trusted = await fs.readFile(first.eligible[0].trustedTextPath, 'utf8');
      // The first pass is in flight: its branch is pushed or its PR is open, not yet recorded.
      if (variant === 'orphan-branch' || variant === 'dry-run') f.state.branches = [branch(1)];
      if (variant === 'unrecorded-pull-request') f.state.pulls = [pull(30, 1)];
      const staleAttempts =
        variant === 'stale-attempt'
          ? [
              {
                issue: 1,
                originalFingerprint: first.eligible[0].fingerprint,
                stableAttemptId: stableAttemptId('older-pass', 1),
              },
            ]
          : [];
      const other = await otherPass(f);
      const c = (
        await other.collect({ staleAttempts, mode: variant === 'dry-run' ? 'dry-run' : 'publish' })
      ).data;
      assert.deepEqual(
        c.skipped.filter((entry) => entry.issue === 1),
        [{ issue: 1, reason: 'issue-in-progress' }],
      );
      assert.deepEqual(c.authorizedRecovery, []);
      assert.deepEqual(c.recovery, { orphanBranches: [], unrecordedPullRequests: [] });
      assert.deepEqual(
        c.eligible.map((entry) => entry.issue),
        [2],
      );
      await assert.rejects(
        fs.stat(path.join(f.root, '.effective-flow/issue-buddy/verdicts.json')),
        {
          code: 'ENOENT',
        },
      );
      assert.equal(await fs.readFile(first.eligible[0].trustedTextPath, 'utf8'), trusted);
      assert.equal((await readClaim(f, 1)).passId, f.passId);
      await other.close();
      assert.equal(await fs.readFile(first.eligible[0].trustedTextPath, 'utf8'), trusted);
    });
});

// Invariant (acceptance "Cache and journal"): concurrent verdicts of two passes for different
// issues keep both records, and one pass's pending journal survives another pass's cache write.
test('concurrent verdicts of parallel passes keep both records and a pending journal survives the other write', async (t) => {
  const f = await nativeFixture(t, { issues: [issue(1), issue(2)] });
  const one = await collected(f, { issue: 1 });
  const other = await otherPass(f);
  const two = (await other.collect({ issue: 2 })).data;
  const wait = { mutexWaitMs: MUTEX_WAIT_MS };
  const results = await Promise.all([
    f.record(one, 'not-ready', {}, wait),
    other.record(two, 2, 'not-ready', wait),
  ]);
  for (const result of results) assert.equal(result.ok, true, JSON.stringify(result));
  const cache = await f.cache();
  assert.deepEqual(Object.keys(cache.records).sort(), ['1', '2']);
  assert.equal(cache.records[1].recordedPassId, f.passId);
  assert.equal(cache.records[2].recordedPassId, other.passId);
});

test('a pending verdict journal survives a parallel pass writing another issue and completes on the identical retry', async (t) => {
  const f = await fixture(t, { issues: [issue(1), issue(2)] });
  const one = await collected(f, { issue: 1 });
  const other = await otherPass(f);
  const two = (await other.collect({ issue: 2 })).data;
  const input = {
    passId: f.passId,
    mode: 'publish',
    issue: 1,
    fingerprint: one.eligible[0].fingerprint,
    verdict: 'failed',
    reason: 'Bounded reason',
    stableAttemptId: stableAttemptId(f.passId, 1),
  };
  const refused = await f.run('verdict-record', input, {
    fs: {
      ...fs,
      rename: async (from, to) => {
        if (to.endsWith('/verdicts.json')) throw new Error('cache commit refused');
        return fs.rename(from, to);
      },
    },
  });
  assert.equal(refused.error.code, 'UNSAFE_RUNTIME_STATE');
  assert.ok(JSON.parse(await fs.readFile(f.passPath(), 'utf8')).collection.pendingVerdict);
  assert.equal((await other.record(two, 2, 'not-ready')).ok, true);
  const retried = await f.run('verdict-record', input);
  assert.equal(retried.ok, true, JSON.stringify(retried));
  const cache = await f.cache();
  assert.deepEqual(Object.keys(cache.records).sort(), ['1', '2']);
  assert.equal(cache.records[1].verdict, 'failed');
  assert.equal(cache.records[2].verdict, 'not-ready');
  const record = JSON.parse(await fs.readFile(f.passPath(), 'utf8'));
  assert.equal(record.collection.pendingVerdict, undefined);
  assert.deepEqual(Object.keys(record.collection.outcomes), ['1']);
  const report = await f.report(one, {
    verdicts: [{ issue: 1, verdict: 'failed', reason: 'Bounded reason' }],
    failures: [{ issue: 1, stage: 'judgment', code: 'ATTEMPT_FAILED' }],
  });
  assert.equal(report.ok, true, JSON.stringify(report));
});

// A synthetic mutex whose holder state the runner can observe.
function observedFixtureServer() {
  const factory = controlledFixtureServer();
  let held = false;
  return {
    held: () => held,
    factory: (listener) => {
      const server = factory(listener);
      const listen = server.listen;
      server.listen = (...args) => {
        server.once('listening', () => {
          held = true;
        });
        return listen(...args);
      };
      const close = server.close;
      server.close = (callback) => {
        held = false;
        return close(callback);
      };
      return server;
    },
  };
}
const networkCall = (call) =>
  call.executable === 'gh' ||
  (call.executable === 'git' && ['fetch', 'ls-remote'].includes(call.args[0]));

// Invariant (acceptance "Mutex scope"): no fetch, ls-remote or tracker call runs while the mutation
// mutex is held, across a whole pass: collection with recovery, verdicts, reports and close.
test('no network or tracker call runs while the mutation mutex is held', async (t) => {
  const mutex = observedFixtureServer();
  const underMutex = [];
  let localUnderMutex = 0;
  const f = await fixture(
    t,
    { issues: [issue(1), issue(2), issue(3)], branches: [branch(3)] },
    {
      createServer: mutex.factory,
      onCall: (call) => {
        if (!mutex.held()) return;
        if (networkCall(call)) underMutex.push(call.args.join(' '));
        else localUnderMutex++;
      },
    },
  );
  const c = await collected(f);
  assert.deepEqual(
    c.authorizedRecovery.map((entry) => entry.issue),
    [3],
  );
  assert.equal((await f.record(c)).ok, true);
  assert.equal(
    (
      await f.report(c, {
        verdicts: [{ issue: 1, verdict: 'failed', reason: 'Bounded reason' }],
        failures: [{ issue: 1, stage: 'judgment', code: 'ATTEMPT_FAILED' }],
      })
    ).ok,
    true,
  );
  // A precollection report resolves its repository through the tracker before the mutex.
  const preflight = await otherPass(f);
  const stopped = await f.run('pass-report', {
    passId: preflight.passId,
    mode: 'publish',
    outcome: 'failed',
    cutOff: 'none',
    verdicts: [],
    pullRequestsOpened: [],
    pullRequestsRecovered: [],
    failures: [{ issue: null, stage: 'preflight', code: 'PREFLIGHT_FAILED' }],
  });
  assert.equal(stopped.ok, true, JSON.stringify(stopped));
  await preflight.close();
  await f.run('pass-close', { passId: f.passId });
  assert.deepEqual(underMutex, []);
  assert.ok(f.calls.filter(networkCall).length > 0);
  assert.ok(localUnderMutex > 0, 'local guard reads still run under the mutex');
});

// Invariant (acceptance "Mutex scope"): contention shorter than the 10 s bound waits through
// jittered retries instead of LOCKED; only a mutex still occupied at the bound is LOCKED.
test('mutex contention below the bound is retried with jitter; an endpoint still occupied at 10 s is LOCKED', async (t) => {
  const f = await fixture(t);
  const blocker = f.options.createServer();
  blocker.listen();
  await once(blocker, 'listening');
  const sleeps = [];
  const sleep = (ms) => {
    sleeps.push(ms);
    return new Promise((resolve) => setTimeout(resolve, ms));
  };
  setTimeout(() => blocker.close(() => {}), 250);
  const started = performance.now();
  const opened = await f.run('pass-open', {}, { mutexWaitMs: MUTEX_WAIT_MS, sleep });
  assert.equal(opened.ok, true, JSON.stringify(opened));
  assert.ok(performance.now() - started < MUTEX_WAIT_MS);
  assert.ok(sleeps.length > 0);
  for (const ms of sleeps) assert.ok(ms >= 20 && ms <= 100, String(ms));

  const held = f.options.createServer();
  held.listen();
  await once(held, 'listening');
  let now = 0;
  const waited = [];
  const refused = await f.run(
    'pass-open',
    {},
    {
      mutexWaitMs: MUTEX_WAIT_MS,
      monotonicNow: () => now,
      random: () => 0.5,
      sleep: async (ms) => {
        waited.push(ms);
        now += ms;
      },
    },
  );
  held.close(() => {});
  assert.equal(refused.error.code, 'LOCKED');
  assert.deepEqual(refused.error.details, {});
  assert.equal(
    waited.reduce((sum, ms) => sum + ms, 0),
    MUTEX_WAIT_MS,
  );
  assert.ok(waited.slice(0, -1).every((ms) => ms === 60));
});

// Invariant: with `--issue <N>` and the caller's `Autopilot run:` value, the pass adopts that
// run's claim only after verifying helper-internally that the claim is the run's and the run's
// ledger is open with this issue as its source; it never releases the adopted claim, and no
// output carries the claim token.
const RUN_ID = 'ap-20261019T120000Z-0123abcd';
const OTHER_RUN_ID = 'ap-20261019T120000Z-89abcdef';
async function autopilotRun(f, { runId = RUN_ID, claim = true, ledger = {} } = {}) {
  let claimed;
  if (claim) {
    claimed = await planningClaimAcquire(
      { cwd: f.root, target: FIXTURE_TARGET, issue: 1, workflow: 'autopilot', runId },
      { runner: f.options.runner, now: () => Date.parse(NOW) },
    );
    assert.equal(typeof claimed.claimId, 'string', JSON.stringify(claimed));
  }
  if (ledger !== null) {
    const directory = path.join(f.root, '.effective-flow/autopilot', ledger.runId ?? runId);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, 'run.json'),
      JSON.stringify({
        runId: ledger.runId ?? runId,
        status: ledger.status ?? 'open',
        source: {
          kind: 'issue',
          issue: ledger.issue ?? 1,
          repository: 'github.com/example/flow',
        },
      }),
    );
  }
  return claimed;
}

test('a single-issue pass adopts the verified claim of its autopilot run and never releases it', async (t) => {
  const f = await fixture(t);
  const claimed = await autopilotRun(f);
  const outputs = [];
  const c = await collected(f, { issue: 1, autopilotRunId: RUN_ID });
  outputs.push(c);
  assert.deepEqual(
    c.eligible.map((entry) => entry.issue),
    [1],
  );
  const record = JSON.parse(await fs.readFile(f.passPath(), 'utf8'));
  assert.deepEqual(record.claims, [{ issue: 1, adoptedRunId: RUN_ID }]);
  const verdict = await f.record(c, 'not-ready');
  assert.equal(verdict.ok, true, JSON.stringify(verdict));
  outputs.push(verdict);
  const stored = await readClaim(f, 1);
  assert.equal(stored.workflow, 'autopilot');
  assert.equal(stored.claimId, claimed.claimId);
  const report = await f.report(c, {
    verdicts: [{ issue: 1, verdict: 'not-ready', reason: 'Bounded reason' }],
  });
  assert.equal(report.ok, true, JSON.stringify(report));
  outputs.push(report);
  const closed = await f.run('pass-close', { passId: f.passId });
  outputs.push(closed);
  assert.deepEqual(closed.data.releasedClaims, []);
  assert.deepEqual(await readClaim(f, 1), stored);
  for (const output of outputs)
    assert.doesNotMatch(JSON.stringify(output), new RegExp(claimed.claimId));
});

test('claim adoption is refused for a missing, foreign or unverifiable autopilot claim', async (t) => {
  for (const [variant, setup, code, reason] of [
    ['no claim', { claim: false }, 'CLAIM_ADOPTION_REFUSED', 'claim-missing'],
    ['another run', { runId: OTHER_RUN_ID }, 'ISSUE_CLAIMED'],
    ['no ledger', { ledger: null }, 'CLAIM_ADOPTION_REFUSED', 'no-ledger'],
    ['closed run', { ledger: { status: 'closed' } }, 'CLAIM_ADOPTION_REFUSED', 'run-closed'],
    ['other source', { ledger: { issue: 2 } }, 'CLAIM_ADOPTION_REFUSED', 'wrong-source'],
  ])
    await t.test(variant, async (t) => {
      const f = await fixture(t, { issues: [issue(1), issue(2)] });
      const claimed = await autopilotRun(f, setup);
      const before = await runtimeSnapshot(f);
      const refused = await f.collect({ issue: 1, autopilotRunId: RUN_ID });
      assert.equal(refused.ok, false);
      assert.equal(refused.error.code, code, JSON.stringify(refused));
      if (reason) assert.equal(refused.error.details.reason, reason);
      else {
        assert.equal(refused.error.details.holder.workflow, 'autopilot');
        assert.equal(refused.error.details.holder.runId, OTHER_RUN_ID);
      }
      if (claimed) assert.doesNotMatch(JSON.stringify(refused), new RegExp(claimed.claimId));
      assert.deepEqual(await runtimeSnapshot(f), before);
      const stored = await readClaim(f, 1);
      assert.equal(stored?.claimId, claimed?.claimId);
      assert.deepEqual(JSON.parse(await fs.readFile(f.passPath(), 'utf8')).claims ?? [], []);
      assert.equal((await f.run('pass-close', { passId: f.passId })).ok, true);
      assert.equal((await readClaim(f, 1))?.claimId, claimed?.claimId);
    });
  const f = await fixture(t);
  assert.equal((await f.collect({ autopilotRunId: RUN_ID })).error.code, 'INVALID_PAYLOAD');
  assert.equal(
    (await f.collect({ issue: 1, autopilotRunId: 'run-1' })).error.code,
    'INVALID_PAYLOAD',
  );
});

// ---------------------------------------------------------------------------------------------
// Orphan pass records, exclusive adoption, per-claim persistence and the cleanup inventory.

const OWNER_PID = 4242;
const BUDDY_HOST = 'buddy-host';
// Claim-core dependencies with a controlled session pid, host and process table.
function sessionDeps(alive) {
  return {
    claimDeps: {
      ownerPid: OWNER_PID,
      hostname: () => BUDDY_HOST,
      kill: (pid) => {
        if (alive.has(pid)) return true;
        throw Object.assign(new Error('no such process'), { code: 'ESRCH' });
      },
    },
  };
}
const trustedFile = (f, number) =>
  path.join(f.root, '.effective-flow/issue-buddy/trusted', `issue-${number}.json`);
const exists = async (target) =>
  fs.lstat(target).then(
    () => true,
    (error) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    },
  );

// Invariant: `pass-open` records the session pid the claim core records (never the short-lived
// helper's own pid), so a live pass is `alive` and `pass-prune` refuses its `process-dead` proof;
// only a re-verified dead session, or confirmed staleness, prunes the record together with the
// claims the pass still owns and its trusted text. The record identity (`acquiredAt`) must match.
test('pass-prune never prunes a live pass as process-dead and prunes a dead one with its claims', async (t) => {
  const f = await fixture(t, { issues: [issue(1), issue(2)] });
  const alive = new Set([OWNER_PID]);
  const session = sessionDeps(alive);
  const opened = await f.run('pass-open', {}, session);
  assert.equal(opened.ok, true, JSON.stringify(opened));
  const passId = opened.data.passId;
  const stored = JSON.parse(await fs.readFile(f.passPath(passId), 'utf8'));
  assert.deepEqual([stored.pid, stored.hostname], [OWNER_PID, BUDDY_HOST]);
  const c = await f.run('pass-collect', f.collectInput({ passId, issue: 2 }), session);
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal((await readClaim(f, 2)).passId, passId);
  assert.equal(await exists(trustedFile(f, 2)), true);

  const listed = await f.run('pass-list', {}, session);
  assert.equal(listed.ok, true, JSON.stringify(listed));
  const entry = listed.data.passes.find((item) => item.passId === passId);
  assert.deepEqual(
    [entry.state, entry.liveness, entry.pid, entry.claims, entry.collection],
    ['valid', 'alive', OWNER_PID, [{ issue: 2 }], 'collected'],
  );
  assert.doesNotMatch(JSON.stringify(listed), /claimId/);

  const prune = (extra, overrides = session) =>
    f.run('pass-prune', { passId, acquiredAt: stored.acquiredAt, ...extra }, overrides);
  assert.deepEqual((await prune({ proof: 'process-dead' })).data, {
    passId,
    result: 'proof-refused',
    reason: 'process-alive',
  });
  assert.deepEqual((await prune({ confirmStale: true })).data, { passId, result: 'not-stale' });
  assert.deepEqual(
    (
      await f.run(
        'pass-prune',
        { passId, acquiredAt: '2026-10-19T11:00:00.000Z', proof: 'process-dead' },
        session,
      )
    ).data,
    { passId, result: 'changed' },
  );
  assert.equal(await exists(f.passPath(passId)), true);
  assert.equal((await readClaim(f, 2)).passId, passId);
  for (const shape of [{}, { proof: 'process-dead', confirmStale: true }, { proof: 'gone' }])
    assert.equal((await prune(shape)).error.code, 'INVALID_PAYLOAD', JSON.stringify(shape));

  alive.delete(OWNER_PID);
  assert.deepEqual((await prune({ proof: 'process-dead' })).data, {
    passId,
    result: 'removed',
    proof: 'process-dead',
    releasedClaims: [2],
  });
  assert.equal(await exists(f.passPath(passId)), false);
  assert.equal(await readClaim(f, 2), undefined);
  assert.equal(await exists(trustedFile(f, 2)), false);
  assert.deepEqual((await prune({ proof: 'process-dead' })).data, { passId, result: 'missing' });

  // Confirmed staleness prunes a pass older than 2 h whatever its liveness.
  const own = JSON.parse(await fs.readFile(f.passPath(), 'utf8'));
  const later = { clock: () => '2026-10-19T14:00:01.000Z' };
  assert.deepEqual(
    (
      await f.run(
        'pass-prune',
        { passId: f.passId, acquiredAt: own.acquiredAt, confirmStale: true },
        later,
      )
    ).data,
    { passId: f.passId, result: 'removed', confirmStale: true, releasedClaims: [] },
  );
});

// Invariant: the pass record carries the session's start time (`pidStartTime`) beside its pid, and
// `pass-list` and `pass-prune` identify the process by both: a live session with the recorded start
// time is `alive` and refused, a reused pid (another start time) is `dead` and pruned, an
// unreadable start time is `unknown` and refused. A record without the field keeps the pid-only
// probe.
test('pass liveness checks the session identity by pid and start time', async (t) => {
  const f = await fixture(t, { issues: [issue(1)] });
  const startedAt = (ticks) => (pid) => {
    if (pid !== OWNER_PID || ticks === null)
      throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
    return `${pid} (sh) S 1 ${Array.from({ length: 17 }, () => '0').join(' ')} ${ticks} 0 0\n`;
  };
  const session = (ticks) => {
    const base = sessionDeps(new Set([OWNER_PID]));
    return {
      claimDeps: { ...base.claimDeps, ownerPidStartTime: 100, readProcStat: startedAt(ticks) },
    };
  };
  const opened = await f.run('pass-open', {}, session(100));
  assert.equal(opened.ok, true, JSON.stringify(opened));
  const passId = opened.data.passId;
  const stored = JSON.parse(await fs.readFile(f.passPath(passId), 'utf8'));
  assert.deepEqual([stored.pid, stored.pidStartTime], [OWNER_PID, 100]);
  const liveness = async (ticks) =>
    (await f.run('pass-list', {}, session(ticks))).data.passes.find(
      (item) => item.passId === passId,
    ).liveness;
  const prune = (ticks) =>
    f.run(
      'pass-prune',
      { passId, acquiredAt: stored.acquiredAt, proof: 'process-dead' },
      session(ticks),
    );
  assert.equal(await liveness(100), 'alive');
  assert.equal(await liveness(null), 'unknown');
  assert.equal(await liveness(200), 'dead');
  assert.deepEqual((await prune(100)).data, {
    passId,
    result: 'proof-refused',
    reason: 'process-alive',
  });
  assert.deepEqual((await prune(null)).data, {
    passId,
    result: 'proof-refused',
    reason: 'process-unknown',
  });
  assert.equal(await exists(f.passPath(passId)), true);

  // A record written before the field existed: a present pid stays `alive`, never `dead`.
  const { pidStartTime, ...legacy } = stored;
  assert.equal(pidStartTime, 100);
  await fs.writeFile(f.passPath(passId), `${JSON.stringify(legacy)}\n`);
  assert.equal(await liveness(200), 'alive');
  assert.equal((await prune(200)).data.reason, 'process-alive');

  await fs.writeFile(f.passPath(passId), `${JSON.stringify(stored)}\n`);
  assert.deepEqual((await prune(200)).data, {
    passId,
    result: 'removed',
    proof: 'process-dead',
    releasedClaims: [],
  });
});

// Invariant: adoption of an autopilot run's claim is exclusive: the first adopter is recorded in
// the run's adoption marker, a second pass is refused `already-adopted` (naming the adopter) and
// changes nothing, `pass-close` of the adopter ends its adoption, and a marker whose pass record
// is gone is taken over.
test('claim adoption is exclusive per autopilot run while the first adopter pass exists', async (t) => {
  const f = await fixture(t);
  const claimed = await autopilotRun(f);
  const marker = path.join(f.root, '.effective-flow/issue-buddy/adoptions', `${RUN_ID}.json`);
  const first = await collected(f, { issue: 1, autopilotRunId: RUN_ID });
  assert.deepEqual(
    first.eligible.map((entry) => entry.issue),
    [1],
  );
  const adopted = JSON.parse(await fs.readFile(marker, 'utf8'));
  assert.deepEqual([adopted.runId, adopted.issue, adopted.passId], [RUN_ID, 1, f.passId]);

  const second = await otherPass(f);
  const before = await runtimeSnapshot(f);
  const refused = await second.collect({ issue: 1, autopilotRunId: RUN_ID });
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'CLAIM_ADOPTION_REFUSED');
  assert.deepEqual(refused.error.details, {
    issue: 1,
    runId: RUN_ID,
    reason: 'already-adopted',
    adopterPassId: f.passId,
  });
  assert.doesNotMatch(JSON.stringify(refused), new RegExp(claimed.claimId));
  assert.deepEqual(await runtimeSnapshot(f), before);
  assert.deepEqual(JSON.parse(await fs.readFile(f.passPath(second.passId), 'utf8')).claims, []);
  assert.deepEqual((await second.close()).data.releasedClaims, []);
  assert.equal(await exists(first.eligible[0].trustedTextPath), true);
  assert.equal(JSON.parse(await fs.readFile(marker, 'utf8')).passId, f.passId);

  assert.equal((await f.run('pass-close', { passId: f.passId })).ok, true);
  assert.equal(await exists(marker), false);
  const third = await otherPass(f);
  assert.equal((await third.collect({ issue: 1, autopilotRunId: RUN_ID })).ok, true);
  assert.equal(JSON.parse(await fs.readFile(marker, 'utf8')).passId, third.passId);
  // A killed adopter whose pass record is gone leaves a marker the next pass takes over.
  await fs.unlink(f.passPath(third.passId));
  const fourth = await otherPass(f);
  const taken = await fourth.collect({ issue: 1, autopilotRunId: RUN_ID });
  assert.equal(taken.ok, true, JSON.stringify(taken));
  assert.equal(JSON.parse(await fs.readFile(marker, 'utf8')).passId, fourth.passId);
  assert.equal((await readClaim(f, 1)).claimId, claimed.claimId);
});

// Invariant (requirement 6): a pass of an autopilot run never recovers. An unrecorded open plan
// pull request of the adopted issue is skipped `open-pull-request` with no recovery authority, so
// autopilot stops instead of continuing on it; without the run the same pull request is
// recoverable.
test('a pass of an autopilot run authorizes no recovery of an open plan pull request', async (t) => {
  const f = await fixture(t, { pulls: [pull()] });
  await autopilotRun(f);
  const c = await collected(f, { issue: 1, autopilotRunId: RUN_ID });
  assert.deepEqual(c.skipped, [{ issue: 1, reason: 'open-pull-request' }]);
  assert.deepEqual(c.eligible, []);
  assert.deepEqual(c.authorizedRecovery, []);
  const recorded = await f.record(c, 'published', {
    fingerprint: 'ibfp1:sha256:' + 'b'.repeat(64),
    pullRequest: { number: 30, url: 'https://github.com/example/flow/pull/30' },
  });
  assert.equal(recorded.error.code, 'INVALID_PAYLOAD');
  const r = await f.report(c, {
    pullRequestsRecovered: [{ issue: 1, number: 30, headRef: branch(1), url: pull().html_url }],
  });
  assert.equal(r.ok, false);

  const plain = await fixture(t, { pulls: [pull()] });
  const recoverable = await collected(plain, { issue: 1 });
  assert.deepEqual(
    recoverable.authorizedRecovery.map((entry) => [entry.issue, entry.kind]),
    [[1, 'unrecorded-pull-request']],
  );
});

// Invariant: each claim enters the pass record right after it is taken, so a pass killed while it
// claims further candidates still names every claim it holds.
test('every acquired claim is persisted in the pass record before the next acquisition', async (t) => {
  let passFile;
  let seen;
  const f = await fixture(
    t,
    { issues: [issue(1), issue(2)] },
    {
      onCall: (call) => {
        if (seen === undefined && passFile && String(call.stdin ?? '').includes('/issue-2.json'))
          seen = JSON.parse(readFileSync(passFile, 'utf8')).claims;
      },
    },
  );
  passFile = f.passPath();
  const c = await collected(f, { limits: { judgments: 2 } });
  assert.deepEqual(
    c.eligible.map((entry) => entry.issue),
    [1, 2],
  );
  assert.deepEqual(seen, [{ issue: 1 }]);
});

// Invariant: `pass-list` reports trusted text no pass record lists (null while a pass record is
// unreadable), `trusted-prune` removes only such text, re-verified under the mutex, and the
// legacy-lock scan lists only the top level, `passes/` and `reports/`: trusted text adds no Git
// call to a locked operation and a `.lock` name inside `trusted/` blocks nothing.
test('the cleanup inventory lists unclaimed trusted text and trusted-prune removes only that', async (t) => {
  const f = await fixture(t, { issues: [issue(1), issue(2)] });
  await collected(f, { issue: 1 });
  const trusted = path.dirname(trustedFile(f, 1));
  const probe = () => f.run('trusted-prune', { issues: [10] });
  const baseline = f.calls.length;
  assert.deepEqual((await probe()).data.items, [{ issue: 10, result: 'missing' }]);
  const cost = f.calls.length - baseline;
  for (let n = 100; n < 130; n++) await fs.writeFile(path.join(trusted, `issue-${n}.json`), '{}');
  await fs.writeFile(path.join(trusted, 'stray.lock'), 'not a lock');
  await fs.writeFile(trustedFile(f, 9), '{}');
  const again = f.calls.length;
  assert.deepEqual((await probe()).data.items, [{ issue: 10, result: 'missing' }]);
  assert.equal(f.calls.length - again, cost);

  const listed = (await f.run('pass-list')).data;
  assert.deepEqual(
    listed.unclaimedTrusted.map((entry) => entry.issue),
    [9, ...Array.from({ length: 30 }, (_, i) => 100 + i)],
  );
  assert.equal(listed.unclaimedTrusted[0].path, '.effective-flow/issue-buddy/trusted/issue-9.json');
  assert.equal(listed.truncated, false);
  assert.deepEqual((await f.run('trusted-prune', { issues: [1, 9] })).data.items, [
    { issue: 1, result: 'claimed' },
    { issue: 9, result: 'removed' },
  ]);
  assert.equal(await exists(trustedFile(f, 1)), true);
  assert.equal(await exists(trustedFile(f, 9)), false);

  await fs.writeFile(path.join(f.root, '.effective-flow/issue-buddy/passes/broken.json'), '{}');
  assert.equal((await f.run('pass-list')).data.unclaimedTrusted, null);
  assert.deepEqual((await f.run('trusted-prune', { issues: [100] })).data.items, [
    { issue: 100, result: 'unverifiable' },
  ]);
  assert.equal(await exists(trustedFile(f, 100)), true);
  for (const issues of [[], [0], [1, 1]])
    assert.equal((await f.run('trusted-prune', { issues })).error.code, 'INVALID_PAYLOAD');
});

// Pass report v2 `baseMoves` (issue #734): one assessed base move per issue, bound to the
// persisted collection and to the pass outcome.
const TO_OID = 'b'.repeat(40);
const baseMove = (overrides = {}) => ({
  issue: 1,
  fromBaseOid: OID,
  toBaseOid: TO_OID,
  verdict: 'fits',
  reason: null,
  commitCount: 2,
  changedPathCount: 3,
  citedPathCount: 1,
  citedPaths: ['src/a.mjs'],
  overlappingPaths: [],
  ...overrides,
});
const overlapMove = (overrides = {}) =>
  baseMove({
    verdict: 'overlap',
    reason: 'cited-path',
    overlappingPaths: ['src/a.mjs'],
    ...overrides,
  });
const BASE_CHANGED_STOP = { issue: null, stage: 'publish', code: 'BASE_CHANGED' };
const moveReport = (f, c, baseMoves, extra = {}) =>
  f.report(c, {
    reportVersion: 2,
    repositoryVisibility: 'unknown',
    leftoverPlanFiles: [],
    baseMoves,
    ...extra,
  });
const stopped = { outcome: 'failed', failures: [BASE_CHANGED_STOP] };

// Invariant: a fitting move that ended in a confirmed PR, and a fitting move whose issue later
// failed, are both reportable, so the continued publication and its failure stay traceable.
test('baseMoves accepts a valid v2 entry for a published issue and a fits entry paired with a failed verdict', async (t) => {
  const f = await fixture(t);
  const c = await collected(f);
  assert.equal(c.baseOid, OID);
  const url = 'https://github.com/example/flow/pull/30';
  const first = c.eligible[0];
  assert.equal(
    (
      await f.record(c, 'published', {
        pullRequest: { number: 30, url },
        headRef: first.headRef,
      })
    ).ok,
    true,
  );
  const accepted = await moveReport(f, c, [baseMove()], {
    verdicts: [{ issue: 1, verdict: 'published', reason: 'Bounded reason' }],
    pullRequestsOpened: [{ issue: 1, number: 30, headRef: first.headRef, url }],
  });
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  assert.deepEqual(accepted.data.baseMoves, [baseMove()]);
  assert.deepEqual(validatePassReport(accepted.data), accepted.data);

  const g = await fixture(t);
  const c2 = await collected(g);
  assert.equal((await g.record(c2, 'failed')).ok, true);
  const failed = await moveReport(g, c2, [baseMove()], {
    verdicts: [{ issue: 1, verdict: 'failed', reason: 'Bounded reason' }],
    failures: [{ issue: 1, stage: 'judgment', code: 'MODEL_FAILED' }],
  });
  assert.equal(failed.ok, true, JSON.stringify(failed));
  assert.deepEqual(failed.data.baseMoves, [baseMove()]);
});

// Invariant: `baseMoves` is optional, so a stored v2 report from before the field still validates
// and an empty list is a valid value.
test('baseMoves stays optional: a stored v2 report without it validates, and an empty list is accepted', async (t) => {
  const f = await fixture(t);
  const c = await collected(f);
  const plain = await moveReport(f, c, undefined);
  assert.equal(plain.ok, true, JSON.stringify(plain));
  assert.equal('baseMoves' in plain.data, false);
  assert.deepEqual(validatePassReport(plain.data), plain.data);
  await f.next();
  const c2 = await collected(f);
  const empty = await moveReport(f, c2, []);
  assert.equal(empty.ok, true, JSON.stringify(empty));
  assert.deepEqual(empty.data.baseMoves, []);
});

// A completed v2 report beside the issue's confirmed draft PR, in a fresh fixture.
async function publishedMoveReport(t, entry) {
  const f = await fixture(t);
  const c = await collected(f);
  const url = 'https://github.com/example/flow/pull/30';
  const { headRef } = c.eligible[0];
  assert.equal(
    (await f.record(c, 'published', { pullRequest: { number: 30, url }, headRef })).ok,
    true,
  );
  return moveReport(f, c, [entry], {
    verdicts: [{ issue: 1, verdict: 'published', reason: 'Bounded reason' }],
    pullRequestsOpened: [{ issue: 1, number: 30, headRef, url }],
  });
}

// Invariant (issue #734 follow-up): an unresolved move that re-publishes, `overlap`/`cited-path` or
// an `undecidable` reason outside the stopping list, is a normal success beside its confirmed PR.
test('baseMoves accepts an overlap or a non-stopping undecidable entry beside a confirmed PR', async (t) => {
  for (const entry of [
    overlapMove(),
    baseMove({ verdict: 'undecidable', reason: 'gitlink', overlappingPaths: ['vendor/lib'] }),
  ]) {
    const accepted = await publishedMoveReport(t, entry);
    assert.equal(accepted.ok, true, JSON.stringify(accepted));
    assert.equal(accepted.data.outcome, 'completed');
    assert.deepEqual(accepted.data.baseMoves, [entry]);
  }
});

// Invariant (issue #734 follow-up): a move with a stopping reason (`BASE_MOVE_STOPPING_REASONS`)
// never published, so a completed report beside a PR contradicts it; it is reported only with the
// pass-level null publish/BASE_CHANGED stop.
test('baseMoves binds a stopping reason only to the null publish/BASE_CHANGED failure', async (t) => {
  const stopping = [
    baseMove({ verdict: 'undecidable', reason: 'not-ancestor', citedPaths: [] }),
    overlapMove({ reason: 'same-issue-plan', overlappingPaths: ['docs/plan/x.md'] }),
  ];
  for (const entry of stopping) {
    const refused = await publishedMoveReport(t, entry);
    assert.equal(refused.ok, false, entry.reason);
    assert.match(refused.error.message, /base move does not match the pass outcome/);
  }
  const f = await fixture(t);
  const c = await collected(f);
  const kept = await moveReport(f, c, [stopping[1]], stopped);
  assert.equal(kept.ok, true, JSON.stringify(kept));
  for (const [name, extra] of [
    ['a completed outcome', {}],
    ['a failed outcome without the stop record', { outcome: 'failed', failures: [] }],
    [
      'another pass-level code',
      { outcome: 'failed', failures: [{ ...BASE_CHANGED_STOP, code: 'TIP_CHANGED' }] },
    ],
    [
      'another stage',
      { outcome: 'failed', failures: [{ ...BASE_CHANGED_STOP, stage: 'planning' }] },
    ],
    [
      'an issue-bound BASE_CHANGED failure',
      { outcome: 'failed', failures: [{ ...BASE_CHANGED_STOP, issue: 1 }] },
    ],
  ]) {
    await f.next();
    const c3 = await collected(f);
    const refused = await moveReport(f, c3, [stopping[0]], extra);
    assert.equal(refused.ok, false, name);
    assert.equal(refused.error.code, 'INVALID_PAYLOAD', name);
  }
});

// Invariant: every entry is validated against closed shapes, so no free text or oversized list
// reaches the stored report, the ledger or a pull-request appendix.
test('baseMoves rejects malformed entries: object IDs, enums, counts, paths and unknown keys', async (t) => {
  const f = await fixture(t);
  const c = await collected(f);
  const cases = [
    ['short from id', baseMove({ fromBaseOid: 'abc123' })],
    ['uppercase to id', baseMove({ toBaseOid: 'B'.repeat(40) })],
    ['non-hex to id', baseMove({ toBaseOid: 'g'.repeat(40) })],
    ['unknown verdict', baseMove({ verdict: 'maybe' })],
    ['unknown overlap reason', overlapMove({ reason: 'other' })],
    ['reason of another verdict', overlapMove({ reason: 'gitlink' })],
    ['fits with a reason', baseMove({ reason: 'cited-path' })],
    [
      'undecidable with an overlap reason',
      baseMove({ verdict: 'undecidable', reason: 'cited-path' }),
    ],
    ['negative count', baseMove({ commitCount: -1 })],
    ['fractional count', baseMove({ changedPathCount: 1.5 })],
    ['cited paths exceed their count', baseMove({ citedPathCount: 0 })],
    ['unsafe path', baseMove({ citedPaths: ['../escape'] })],
    ['backtick path', baseMove({ citedPaths: ['a`b'] })],
    ['issue zero', baseMove({ issue: 0 })],
    ['unknown key', { ...baseMove(), extra: true }],
    ['missing key', (({ commitCount: _omitted, ...rest }) => rest)(baseMove())],
  ];
  for (const [name, entry] of cases) {
    const refused = await moveReport(f, c, [entry], stopped);
    assert.equal(refused.ok, false, name);
    assert.equal(refused.error.code, 'INVALID_PAYLOAD', name);
  }
  assert.equal((await moveReport(f, c, baseMove(), stopped)).error.code, 'INVALID_PAYLOAD');
});

// Invariant: `overlappingPaths` is tied to the verdict one way only. A fitting move overlaps
// nothing, so a listed path contradicts it; an overlap may list none, because `assess-base-move`
// drops every path that is unsafe to report.
test('baseMoves refuses a fits entry with an overlapping path and accepts an overlap without one', async (t) => {
  const f = await fixture(t);
  const c = await collected(f);
  // The failed pass binds a fits entry, so only the path rule can refuse it.
  assert.equal((await moveReport(f, c, [baseMove()], stopped)).ok, true);
  await f.next();
  const c2 = await collected(f);
  const refused = await moveReport(f, c2, [baseMove({ overlappingPaths: ['src/a.mjs'] })], stopped);
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'INVALID_PAYLOAD');
  assert.match(refused.error.message, /fitting base move lists no overlapping path/);
  await f.next();
  const c3 = await collected(f);
  const unlisted = await moveReport(f, c3, [overlapMove({ overlappingPaths: [] })], stopped);
  assert.equal(unlisted.ok, true, JSON.stringify(unlisted));
});

// Invariant: a path list is bounded at 20 entries, the same bound `assess-base-move` applies.
test('baseMoves bounds both path lists at 20 entries', async (t) => {
  const f = await fixture(t);
  const c = await collected(f);
  const paths = (count) => Array.from({ length: count }, (_, i) => `src/file-${i}.mjs`);
  const accepted = await moveReport(
    f,
    c,
    [overlapMove({ citedPathCount: 25, citedPaths: paths(20), overlappingPaths: paths(20) })],
    stopped,
  );
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  for (const entry of [
    overlapMove({ citedPathCount: 25, citedPaths: paths(21) }),
    overlapMove({ citedPathCount: 25, overlappingPaths: paths(21) }),
  ]) {
    await f.next();
    const c2 = await collected(f);
    const refused = await moveReport(f, c2, [entry], stopped);
    assert.equal(refused.ok, false);
    assert.equal(refused.error.code, 'INVALID_PAYLOAD');
  }
});

// Invariant: a base move is assessed from the collected base, for an issue this pass collected,
// and at most once per issue.
test('baseMoves binds each entry to the persisted collection: its baseOid, its issues, one entry per issue', async (t) => {
  const f = await fixture(t, { issues: [issue(1), issue(2)] });
  const c = await collected(f);
  assert.equal(c.eligible.length, 2);
  for (const [name, entries] of [
    ['a fromBaseOid other than the collection baseOid', [overlapMove({ fromBaseOid: TO_OID })]],
    ['an issue the pass did not collect', [overlapMove({ issue: 9 })]],
    ['two entries for one issue', [overlapMove(), overlapMove({ toBaseOid: 'c'.repeat(40) })]],
  ]) {
    const refused = await moveReport(f, c, entries, stopped);
    assert.equal(refused.ok, false, name);
    assert.equal(refused.error.code, 'INVALID_PAYLOAD', name);
  }
  const two = await moveReport(f, c, [overlapMove(), overlapMove({ issue: 2 })], stopped);
  assert.equal(two.ok, true, JSON.stringify(two));
  assert.equal(two.data.baseMoves.length, 2);
});

// Invariant: a fits entry must trace to the pass outcome of its own issue: a confirmed PR, a
// failed verdict or a failed pass; a completed pass without any of them is not reportable.
test('baseMoves refuses a fits entry that the pass outcome does not account for', async (t) => {
  const f = await fixture(t, { issues: [issue(1), issue(2)] });
  const c = await collected(f);
  const refused = await moveReport(f, c, [baseMove()]);
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'INVALID_PAYLOAD');
  const stoppedFits = await moveReport(f, c, [baseMove()], stopped);
  assert.equal(stoppedFits.ok, true, JSON.stringify(stoppedFits), 'a failed pass accounts for it');
});

// Invariant: a dry run publishes nothing, so it can carry no base move; version 1 reports carry
// no v2 metadata at all and a stored v1 report is never rewritten.
test('baseMoves is refused in a dry-run report and on a version-1 report', async (t) => {
  const f = await fixture(t);
  const c = await collected(f, { mode: 'dry-run' });
  const dry = await moveReport(f, c, [overlapMove()], stopped);
  assert.equal(dry.ok, false);
  assert.equal(dry.error.code, 'INVALID_PAYLOAD');
  await f.next();
  const c2 = await collected(f);
  const v1 = await f.report(c2, { baseMoves: [overlapMove()], ...stopped });
  assert.equal(v1.ok, false);
  assert.equal(v1.error.code, 'INVALID_PAYLOAD');
  const stored = await moveReport(f, c2, [overlapMove()], stopped);
  assert.equal(stored.ok, true, JSON.stringify(stored));
  assert.throws(() => validatePassReport({ ...stored.data, schemaVersion: 1 }));
  assert.throws(() =>
    validatePassReport({ ...stored.data, mode: 'dry-run', limits: stored.data.limits }),
  );
});
