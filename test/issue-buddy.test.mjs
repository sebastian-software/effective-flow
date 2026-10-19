import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, createConnection } from 'node:net';
import { EventEmitter, once } from 'node:events';
import {
  executeOperation,
  fingerprint,
  stableAttemptId,
  validatePassReport,
  SKIP_REASONS,
} from '../src/scripts/issue-buddy-core.mjs';
import { main } from '../src/scripts/issue-buddy.mjs';

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
async function fixture(t, values = {}) {
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
    calls.push(call);
    assert.equal(call.cwd, root);
    const args = call.args;
    const key = args.join(' ');
    const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
    if (call.executable === 'git') {
      if (args.includes('--show-toplevel')) return ok(root);
      if (args.includes('--git-common-dir') || args.includes('--git-dir'))
        return ok(path.join(root, '.git'));
      if (args.includes('--is-inside-work-tree')) return ok('true');
      if (key === 'remote get-url origin')
        return ok(state.origin ?? 'https://github.com/example/flow.git');
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
  const options = { runner, clock: () => NOW };
  const run = (operation, input = {}, overrides = {}) =>
    executeOperation(operation, { cwd: root, ...input }, { ...options, ...overrides });
  const acquired = await run('pass-lock-acquire');
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
    assert.equal((await run('pass-lock-release', { passId })).ok, true);
    const lock = await run('pass-lock-acquire');
    passId = lock.data.passId;
    return passId;
  };
  const record = (collected, verdict = 'failed', extra = {}) =>
    run('verdict-record', {
      passId,
      mode: collected.mode,
      issue: 1,
      fingerprint:
        collected.eligible.find((entry) => (entry.issue ?? 1) === 1)?.fingerprint ??
        collected.authorizedRecovery?.find((entry) => entry.issue === 1)?.fingerprint,
      verdict,
      reason: 'Bounded reason',
      ...extra,
    });
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
    run,
    collect,
    collectInput,
    next,
    record,
    report,
    get passId() {
      return passId;
    },
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

test('lock ownership, stale lock diagnostics and explicit release never break another pass', async (t) => {
  const f = await fixture(t);
  const old = await f.run('pass-lock-acquire', {}, { clock: () => '2026-10-19T15:00:01.000Z' });
  assert.equal(old.error.code, 'LOCKED');
  assert.equal(old.error.details.stale, true);
  assert.equal(old.error.details.passId, f.passId);
  assert.equal(
    (await f.run('pass-lock-release', { passId: 'foreign' })).error.code,
    'LOCK_MISMATCH',
  );
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
    assert.equal((await f.run(operation, input)).error.code, 'LOCKED');
  assert.equal((await f.run('pass-lock-release', { passId: f.passId })).ok, true);
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
  await fresh.run('pass-lock-release', { passId: fresh.passId });
  assert.equal((await fresh.run('pass-collect', fresh.collectInput())).error.code, 'LOCKED');
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
  const interrupted = {
    ...fs,
    rename: async (from, to) => {
      if (to.endsWith('/pass.lock') && ++passWrites >= 2)
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
      const lockPath = path.join(f.root, '.effective-flow/issue-buddy/pass.lock');
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

test('malformed stored lock acquisition time is reported clearly and never removed or assigned an invented age', async (t) => {
  for (const acquiredAt of [
    '2026-02-30T12:00:00Z',
    '2025-02-29T12:00:00Z',
    '2026-10-19T24:00:00Z',
    'not-a-date',
    null,
  ])
    await t.test(String(acquiredAt), async (t) => {
      const f = await fixture(t);
      const target = path.join(f.root, '.effective-flow/issue-buddy/pass.lock');
      const lock = JSON.parse(await fs.readFile(target, 'utf8'));
      lock.acquiredAt = acquiredAt;
      const original = JSON.stringify(lock);
      await fs.writeFile(target, original);
      const refused = await f.run('pass-lock-acquire');
      assert.equal(refused.ok, false);
      assert.equal(refused.error.code, 'LOCKED');
      assert.match(refused.error.message, /invalid.*acquiredAt/i);
      assert.equal(refused.error.details.passId, f.passId);
      assert.equal(refused.error.details.ageMs, undefined);
      assert.equal(refused.error.details.stale, undefined);
      assert.equal(await fs.readFile(target, 'utf8'), original);
      assert.equal((await f.run('pass-lock-release', { passId: f.passId })).ok, true);
    });
});

async function populatedReport(t) {
  const f = await fixture(t, {
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
      const f = await fixture(t, { issues: [issue(1), issue(2)] });
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
      const lock = JSON.parse(
        await fs.readFile(path.join(f.root, '.effective-flow/issue-buddy/pass.lock'), 'utf8'),
      );
      assert.deepEqual(Object.keys(lock.collection.outcomes), expectedIssues);
      assert.deepEqual(await f.run('verdict-record', verdictInput(f, c, 1)), firstResult);
      await noOperationLock(f);
    });
});

test('serializes collection accounting and replay without losing or repeating historical attempts', async (t) => {
  const f = await fixture(t);
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
  const f = await fixture(t, { issues: [issue(1), issue(2)] });
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
      f.run('pass-lock-release', { passId: f.passId }),
      f.run('pass-lock-acquire'),
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
      const f = await fixture(t, { issues: [issue(1), issue(2)] });
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
      const lock = JSON.parse(
        await fs.readFile(path.join(f.root, '.effective-flow/issue-buddy/pass.lock'), 'utf8'),
      );
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
process.once('message', async ({ root, operation, input, boundary, crashExit }) => {
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
  const runner = async ({ executable, args }) => {
    if (executable !== 'git') throw Error('unexpected non-Git call');
    if (args.includes('--show-toplevel')) return ok(root);
    if (args.includes('--git-common-dir') || args.includes('--git-dir')) return ok(path.join(root, '.git'));
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
  const result = await executeOperation(operation, { cwd: root, ...input }, { runner, fs: observed, clock: () => ${JSON.stringify(NOW)} });
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
        const f = await fixture(t, { issues: [issue(1), issue(2)] });
        const c = await collected(f, { limits: { plans } });
        const first = mutationChild(t, f, 'verdict-record', verdictInput(f, c, 1), {
          boundary: { method: 'rename', targetIndex: 1, suffix: '/verdicts.json' },
        });
        await first.boundary;
        const denied = await childResult(
          mutationChild(t, f, 'verdict-record', verdictInput(f, c, 2)),
        );
        assert.equal(denied.error.code, 'LOCKED');
        assert.equal(denied.error.details.passId, f.passId);
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
        const lock = JSON.parse(
          await fs.readFile(path.join(f.root, '.effective-flow/issue-buddy/pass.lock'), 'utf8'),
        );
        assert.deepEqual(Object.keys(lock.collection.outcomes), expected);
        assert.deepEqual(
          await childResult(mutationChild(t, f, 'verdict-record', verdictInput(f, c, 1))),
          committed,
        );
      });
  },
);

test(
  'SIGKILL before and after create-only pass publication leaves an acquirable or explicitly releasable pass',
  { timeout: 30000 },
  async (t) => {
    for (const after of [false, true])
      await t.test(`after publication=${after}`, async (t) => {
        const f = await fixture(t);
        await f.run('pass-lock-release', { passId: f.passId });
        await fs.rm(path.join(f.root, '.effective-flow'), { recursive: true });
        const actor = mutationChild(
          t,
          f,
          'pass-lock-acquire',
          {},
          {
            boundary: { method: 'link', targetIndex: 1, suffix: '/pass.lock', after },
          },
        );
        await actor.boundary;
        actor.child.kill('SIGKILL');
        assert.equal((await actor.done).signal, 'SIGKILL');
        if (after) {
          const held = await f.run('pass-lock-acquire');
          assert.equal(held.error.code, 'LOCKED');
          assert.match(held.error.details.passId, /^[a-f0-9-]{36}$/);
          assert.equal(held.error.details.ageMs, 0);
          const bytes = await runtimeSnapshot(f);
          assert.equal(
            (await f.run('pass-lock-release', { passId: 'wrong' })).error.code,
            'LOCK_MISMATCH',
          );
          assert.deepEqual(await runtimeSnapshot(f), bytes);
          assert.equal(
            (await f.run('pass-lock-release', { passId: held.error.details.passId })).ok,
            true,
          );
        } else
          await assert.rejects(
            fs.stat(path.join(f.root, '.effective-flow/issue-buddy/pass.lock')),
            { code: 'ENOENT' },
          );
        const acquired = await f.run('pass-lock-acquire');
        assert.equal(acquired.ok, true, JSON.stringify(acquired));
        await noOperationLock(f);
      });
  },
);

test(
  'SIGKILL at an actual cache persistence boundary frees TCP while preserving holder release and next acquire',
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t);
    const c = await collected(f);
    const actor = mutationChild(t, f, 'verdict-record', verdictInput(f, c, 1), {
      boundary: { method: 'rename', targetIndex: 1, suffix: '/verdicts.json', after: true },
    });
    await actor.boundary;
    actor.child.kill('SIGKILL');
    assert.equal((await actor.done).signal, 'SIGKILL');
    assert.equal((await f.cache()).records[1].verdict, 'published');
    const held = await f.run('pass-lock-acquire');
    assert.equal(held.error.details.passId, f.passId);
    assert.equal(
      (await f.run('pass-lock-release', { passId: 'wrong' })).error.code,
      'LOCK_MISMATCH',
    );
    assert.equal((await f.run('pass-lock-release', { passId: f.passId })).ok, true);
    assert.equal((await f.run('pass-lock-acquire')).ok, true);
    await noOperationLock(f);
  },
);

test(
  'operation TCP ownership is released on a thrown persistence error and explicit process exit',
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t);
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
    assert.equal((await f.run('pass-lock-release', { passId: f.passId })).ok, true);
    assert.equal((await f.run('pass-lock-acquire')).ok, true);
  },
);

test('denied loopback bind and an unrelated occupied endpoint fail closed before first runtime mkdir', async (t) => {
  const f = await fixture(t);
  const captured = [];
  await f.run(
    'pass-lock-release',
    { passId: f.passId },
    { createServer: observeEndpoint(captured) },
  );
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
  const denied = await f.run('pass-lock-acquire', {}, { fs: observed, createServer: deniedServer });
  assert.equal(denied.error.code, 'UNSAFE_RUNTIME_STATE');
  assert.match(denied.error.message, /loopback TCP.*local-listen permission.*sandbox/);
  const blocker = createServer((socket) => socket.destroy());
  blocker.listen(captured[0]);
  await once(blocker, 'listening');
  try {
    const occupied = await f.run('pass-lock-acquire', {}, { fs: observed });
    assert.equal(occupied.error.code, 'LOCKED');
    assert.deepEqual(occupied.error.details, {});
    assert.equal(mutations, 0);
    await assert.rejects(fs.stat(path.join(f.root, '.effective-flow')), { code: 'ENOENT' });
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
  assert.equal((await f.run('pass-lock-acquire')).ok, true);
});

test('legacy operation and per-write locks retain all bytes and unrelated temporary evidence', async (t) => {
  for (const relative of [
    'operation.lock',
    'verdicts.json.lock',
    'pass.lock.lock',
    'reports/unknown.lock',
  ])
    await t.test(relative, async (t) => {
      const f = await fixture(t);
      await collected(f);
      const directory = path.join(f.root, '.effective-flow/issue-buddy');
      const target = path.join(directory, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, 'unknown holder');
      await fs.writeFile(path.join(directory, 'unrelated.tmp'), 'operator evidence');
      const snapshot = await runtimeSnapshot(f);
      const refused = await f.run('pass-lock-release', { passId: f.passId });
      assert.equal(refused.error.code, 'LOCKED');
      assert.match(refused.error.message, /operator inspection/);
      assert.deepEqual(await runtimeSnapshot(f), snapshot);
      await fs.unlink(target);
      assert.equal((await f.run('pass-lock-release', { passId: f.passId })).ok, true);
      assert.equal(
        await fs.readFile(path.join(directory, 'unrelated.tmp'), 'utf8'),
        'operator evidence',
      );
    });
});

test(
  'mutex listener destroys incoming sockets and remains held until guarded retention finishes',
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t);
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
      assert.equal((await f.run('pass-lock-release', { passId: f.passId })).error.code, 'LOCKED');
    } finally {
      proceed.release();
    }
    assert.equal((await pending).ok, true);
    assert.equal((await fs.readdir(reports)).length, 20);
    assert.equal((await f.run('pass-lock-release', { passId: f.passId })).ok, true);
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
  return JSON.parse(
    await fs.readFile(path.join(f.root, '.effective-flow/issue-buddy/pass.lock'), 'utf8'),
  );
}

test(
  'killed cache commit reconciles the same pass before publication caps, conflicting replays or reports',
  { timeout: 30000 },
  async (t) => {
    for (const plans of [1, 2])
      await t.test(`plans=${plans}`, async (t) => {
        const f = await fixture(t, { issues: [issue(1), issue(2)] });
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
  const target = path.join(f.root, '.effective-flow/issue-buddy/pass.lock');
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
  assert.equal((await f.run('pass-lock-release', { passId: 'wrong' })).error.code, 'LOCK_MISMATCH');
  assert.equal((await f.run('pass-lock-release', { passId: f.passId })).ok, true);
  assert.equal((await f.run('pass-lock-acquire')).ok, true);
});

test(
  'each verdict intent and final pass persistence kill boundary resumes with one original transition',
  { timeout: 30000 },
  async (t) => {
    for (const occurrence of [1, 2])
      for (const after of [false, true])
        await t.test(`pass rename ${occurrence}, after=${after}`, async (t) => {
          const f = await fixture(t);
          const c = await collected(f);
          const one = verdictInput(f, c, 1, 'failed');
          const actor = mutationChild(t, f, 'verdict-record', one, {
            boundary: { method: 'rename', targetIndex: 1, suffix: '/pass.lock', occurrence, after },
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
        if (to.endsWith('/pass.lock')) throw new Error('intent publication refused');
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
        const other = {
          schemaVersion: 1,
          repository: c.repository,
          records: {},
          attempts: {},
          closedPlanPrObservations: { 3: { 9: one.fingerprint } },
        };
        await fs.writeFile(
          path.join(f.root, '.effective-flow/issue-buddy/verdicts.json'),
          JSON.stringify(other),
        );
      }
      await fs.writeFile(
        path.join(f.root, '.effective-flow/issue-buddy/pass.lock'),
        JSON.stringify(lock),
      );
      const before = await runtimeSnapshot(f);
      const refused = await f.run('verdict-record', one);
      assert.equal(refused.ok, false, JSON.stringify(refused));
      assert.ok(['INVALID_PAYLOAD', 'UNSAFE_RUNTIME_STATE'].includes(refused.error.code));
      assert.deepEqual(await runtimeSnapshot(f), before);
      assert.equal(
        (await f.run('pass-lock-release', { passId: 'wrong' })).error.code,
        'LOCK_MISMATCH',
      );
      assert.equal((await f.run('pass-lock-release', { passId: f.passId })).ok, true);
      assert.equal((await f.run('pass-lock-acquire')).ok, true);
    });
});
