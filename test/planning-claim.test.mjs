// Unit tests of the runtime-state helper's `planning-claim` operations: the shared per-issue
// planning claims below `.effective-flow/planning-claims/`, their one key derivation, create-only
// acquisition, token-bound release, the token-free `list` with age, stale flag and liveness, the
// cleanup-only `prune` under a verified orphan proof or confirmed staleness, and the refusal while
// a legacy Issue Buddy `pass.lock` exists.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  OPERATION_KEYS,
  STATE_OPERATION_CLASSES,
  executeOperation,
} from '../src/scripts/effective-flow-state-core.mjs';
import {
  AUTOPILOT_RUN_ID_PATTERN,
  CLAIM_KEYS,
  ISSUE_KEY_PATTERN,
  LEDGER_GRACE_MS,
  OPTIONAL_CLAIM_KEYS,
  STALE_AFTER_MS,
  TARGET_KEY_PATTERN,
  claimLiveness,
  planningClaimKey,
  processStartTime,
  readPlanningClaim,
  sessionOwner,
  sessionPid,
} from '../src/scripts/effective-flow-state-planning-claim-core.mjs';
import { RUN_ID } from '../src/scripts/autopilot-core.mjs';
import { main } from '../src/scripts/effective-flow-state.mjs';
import {
  expectError,
  expectOk,
  expectOutcome,
  fakeGit,
  fakeRoot,
  unreachableRunner,
} from './support/state-helper-fixtures.mjs';

const NOW = Date.parse('2026-11-20T10:00:00.000Z');
const HOST = 'planner-host';
const OWNER_PID = 4242;
const FORGE = Object.freeze({
  kind: 'forge',
  host: 'github.com',
  owner: 'sebastian-software',
  repository: 'effective-flow',
});
const EXTERNAL = Object.freeze({ kind: 'external', id: 'linear:team-ENG' });
const PASS_ID = '3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f';
const RUN = 'ap-20261120T095900Z-0a1b2c3d';

// A `kill` that reports every pid in `alive` as running and every other one as gone.
function killFor(alive = []) {
  return (pid) => {
    if (alive.includes(pid)) return true;
    const error = new Error('no such process');
    error.code = 'ESRCH';
    throw error;
  };
}

function deps(root, { now = NOW, alive = [OWNER_PID], ...extra } = {}) {
  return {
    runner: fakeGit(root).runner,
    env: {},
    now: () => now,
    hostname: () => HOST,
    ownerPid: OWNER_PID,
    kill: killFor(alive),
    ...extra,
  };
}

function call(operation, root, input, extra) {
  return executeOperation(
    `planning-claim ${operation}`,
    { cwd: root, ...input },
    deps(root, extra),
  );
}

async function acquire(root, input = {}, extra) {
  return expectOk(
    await call(
      'acquire',
      root,
      { target: FORGE, issue: 693, workflow: 'issue-buddy', passId: PASS_ID, ...input },
      extra,
    ),
  );
}

function recordPath(root, target = FORGE, issue = 693) {
  return join(root, planningClaimKey({ target, issue }).path);
}

function readRecord(root, target, issue) {
  return JSON.parse(readFileSync(recordPath(root, target, issue), 'utf8'));
}

async function list(root, extra, input = {}) {
  return expectOk(await call('list', root, input, extra));
}

function prune(root, claims, extra) {
  return call('prune', root, { claims }, extra);
}

// ---------------------------------------------------------------------------------------------
// Operation surface

// Invariant: the operations take exactly their closed key sets; `prune` takes explicit claims, each
// with the observed `acquiredAt` and one proof or stale confirmation, never a filter or an age.
// Like the presence markers, the own-claim operations get an allow rule (unattended autopilot must
// not prompt); `prune`, which removes other runs' claims, never does.
test('the planning-claim operations have closed key sets and only prune stays unallowlisted', () => {
  assert.deepEqual(
    Object.fromEntries(
      ['key', 'acquire', 'release', 'list', 'prune'].map((name) => [
        name,
        [...OPERATION_KEYS[`planning-claim ${name}`]],
      ]),
    ),
    {
      key: ['target', 'issue'],
      acquire: ['cwd', 'target', 'issue', 'workflow', 'runId', 'passId'],
      release: ['cwd', 'target', 'issue', 'claimId'],
      list: ['cwd', 'target'],
      prune: ['cwd', 'claims'],
    },
  );
  for (const name of ['key', 'acquire', 'release', 'list']) {
    assert.equal(STATE_OPERATION_CLASSES[`planning-claim ${name}`], 'allowlisted');
  }
  assert.equal(STATE_OPERATION_CLASSES['planning-claim prune'], 'not-allowlisted');
});

// Invariant: the local autopilot run-id shape is exactly autopilot-core's RUN_ID, so a claim and
// its ledger can never disagree about which run ids exist.
test('the autopilot run-id shape equals autopilot-core RUN_ID', () => {
  assert.equal(AUTOPILOT_RUN_ID_PATTERN.source, RUN_ID.source);
});

// ---------------------------------------------------------------------------------------------
// Key derivation

// Invariant: the same GitHub issue yields the same key whatever spelling the caller passes (the
// Issue Buddy, autopilot and plan-issue paths all pass the repository-resolve identity, possibly
// with different case, a `.git` suffix or a numeric string), and the key is filesystem-safe.
test('key derivation is deterministic for one forge issue across callers', async () => {
  const issueBuddy = planningClaimKey({ target: FORGE, issue: 693 });
  const autopilot = planningClaimKey({
    target: {
      kind: 'forge',
      host: 'GitHub.com.',
      owner: 'Sebastian-Software',
      repository: 'effective-flow.git',
    },
    issue: 693,
  });
  const planIssue = expectOk(
    await executeOperation(
      'planning-claim key',
      { target: { ...FORGE, host: ' github.com ' }, issue: '693' },
      { runner: unreachableRunner() },
    ),
  );
  assert.deepEqual(autopilot, issueBuddy);
  assert.deepEqual(planIssue, issueBuddy);
  assert.equal(issueBuddy.target, 'forge:github.com/sebastian-software/effective-flow');
  assert.equal(issueBuddy.issue, 693);
  assert.equal(issueBuddy.issueKey, 'issue-693');
  assert.match(issueBuddy.targetKey, TARGET_KEY_PATTERN);
  assert.match(
    issueBuddy.targetKey,
    /^forge-github\.com-sebastian-software-effective-flow-[0-9a-f]{16}$/,
  );
  assert.equal(
    issueBuddy.path,
    `.effective-flow/planning-claims/${issueBuddy.targetKey}/issue-693.json`,
  );
});

// Invariant: different repositories, hosts, external targets and issues never share a key; an
// external target id is opaque (kept verbatim) while an external issue key folds case.
test('key derivation separates repositories, targets and issues', () => {
  const keys = [
    { target: FORGE, issue: 693 },
    { target: FORGE, issue: 694 },
    { target: { ...FORGE, repository: 'effective-flow-2' }, issue: 693 },
    { target: { ...FORGE, owner: 'other' }, issue: 693 },
    { target: { ...FORGE, host: 'codeberg.org' }, issue: 693 },
    // Slug-equal but different identities: only the digest tells them apart.
    { target: { ...FORGE, owner: 'sebastian', repository: 'software-effective-flow' }, issue: 693 },
    { target: EXTERNAL, issue: 'ENG-693' },
    { target: { kind: 'external', id: 'linear:team-eng' }, issue: 'ENG-693' },
    { target: EXTERNAL, issue: 'ENG-694' },
    {
      target: { kind: 'external', id: 'github.com/sebastian-software/effective-flow' },
      issue: '693',
    },
  ].map((input) => planningClaimKey(input));
  const pairs = keys.map(({ targetKey, issueKey }) => `${targetKey}/${issueKey}`);
  assert.equal(new Set(pairs).size, pairs.length, pairs.join('\n'));
  for (const { targetKey, issueKey } of keys) {
    assert.match(targetKey, TARGET_KEY_PATTERN);
    assert.match(issueKey, ISSUE_KEY_PATTERN);
    assert.equal(targetKey, targetKey.toLowerCase());
    assert.equal(issueKey, issueKey.toLowerCase());
  }
  assert.deepEqual(
    planningClaimKey({ target: EXTERNAL, issue: 'eng-693' }),
    planningClaimKey({ target: EXTERNAL, issue: 'ENG-693' }),
  );
  assert.match(keys[6].issueKey, /^issue-eng-693-[0-9a-f]{16}$/);
});

// Invariant: an unusable target or issue is INVALID_INPUT before any git call.
test('key derivation refuses unusable identities', async () => {
  for (const input of [
    { target: { kind: 'forge', host: 'github.com', owner: 'a' }, issue: 1 },
    { target: { ...FORGE, extra: true }, issue: 1 },
    { target: { ...FORGE, repository: 'a/b' }, issue: 1 },
    { target: { ...FORGE, owner: '../x' }, issue: 1 },
    { target: { ...FORGE, host: 'git hub' }, issue: 1 },
    { target: FORGE, issue: 0 },
    { target: FORGE, issue: 1.5 },
    { target: FORGE, issue: 'ENG-1' },
    { target: { kind: 'external', id: '' }, issue: 'ENG-1' },
    { target: EXTERNAL, issue: 'ENG 1' },
    { target: EXTERNAL, issue: 7 },
    { target: { kind: 'jira' }, issue: 1 },
  ]) {
    expectError(
      await executeOperation('planning-claim key', input, { runner: unreachableRunner() }),
      'INVALID_INPUT',
    );
  }
});

// ---------------------------------------------------------------------------------------------
// Acquire and release

// Invariant: `acquire` creates the record create-only with exactly the documented fields and
// returns the claimId once; a second acquire for the same issue is CLAIMED with the holder, age,
// stale flag and liveness, never waits, and never returns the first claimId.
test('acquire is create-only and reports the holder on contention', async (t) => {
  const root = fakeRoot(t);
  const first = await acquire(root, {}, { randomToken: () => 'a'.repeat(32) });
  assert.equal(first.claimId, 'a'.repeat(32));
  assert.equal(first.passId, PASS_ID);
  const record = readRecord(root);
  assert.deepEqual(
    Object.keys(record).sort(),
    [...CLAIM_KEYS, ...OPTIONAL_CLAIM_KEYS, 'passId'].sort(),
  );
  assert.deepEqual(
    { ...record },
    {
      schemaVersion: 1,
      claimId: 'a'.repeat(32),
      workflow: 'issue-buddy',
      passId: PASS_ID,
      target: 'forge:github.com/sebastian-software/effective-flow',
      issue: 693,
      targetKey: first.targetKey,
      issueKey: 'issue-693',
      acquiredAt: new Date(NOW).toISOString(),
      pid: OWNER_PID,
      pidStartTime: null,
      hostname: HOST,
    },
  );

  const later = NOW + 30 * 60 * 1000;
  const envelope = await call(
    'acquire',
    root,
    { target: FORGE, issue: 693, workflow: 'autopilot', runId: RUN },
    { now: later },
  );
  const outcome = expectOutcome(envelope, 'CLAIMED');
  assert.equal(outcome.workflow, 'issue-buddy');
  assert.equal(outcome.passId, PASS_ID);
  assert.equal(outcome.ageMs, 30 * 60 * 1000);
  assert.equal(outcome.stale, false);
  assert.equal(outcome.liveness, 'alive');
  assert.equal(JSON.stringify(envelope).includes('a'.repeat(32)), false, 'the token never leaks');
  assert.equal(readRecord(root).claimId, 'a'.repeat(32), 'the holder is untouched');

  // A different issue of the same repository is claimed independently.
  const other = await acquire(root, {
    issue: 694,
    workflow: 'autopilot',
    runId: RUN,
    passId: undefined,
  });
  assert.equal(other.runId, RUN);
});

// Invariant: a claim older than two hours is reported stale; an exactly two-hour-old one is not.
test('CLAIMED reports a stale holder after two hours', async (t) => {
  const root = fakeRoot(t);
  await acquire(root);
  const stale = expectOutcome(
    await call(
      'acquire',
      root,
      { target: FORGE, issue: 693, workflow: 'plan-issue', runId: 'pi-1' },
      {
        now: NOW + STALE_AFTER_MS + 1,
        alive: [],
      },
    ),
    'CLAIMED',
  );
  assert.deepEqual([stale.stale, stale.liveness], [true, 'dead']);
  const edge = expectOutcome(
    await call(
      'acquire',
      root,
      { target: FORGE, issue: 693, workflow: 'plan-issue', runId: 'pi-1' },
      {
        now: NOW + STALE_AFTER_MS,
      },
    ),
    'CLAIMED',
  );
  assert.equal(edge.stale, false);
});

// Invariant: a workflow carries exactly its own holder id, in its own shape.
test('acquire validates the workflow and its holder id', async (t) => {
  const root = fakeRoot(t);
  for (const input of [
    { workflow: 'build', runId: 'x-1' },
    { workflow: 'issue-buddy' },
    { workflow: 'issue-buddy', runId: RUN },
    { workflow: 'issue-buddy', passId: PASS_ID, runId: RUN },
    { workflow: 'autopilot', runId: 'not-a-run-id' },
    { workflow: 'autopilot', passId: PASS_ID },
    { workflow: 'plan-issue', runId: '../x' },
  ]) {
    expectError(
      await executeOperation(
        'planning-claim acquire',
        { cwd: root, target: FORGE, issue: 1, ...input },
        { runner: unreachableRunner() },
      ),
      'INVALID_INPUT',
    );
  }
});

// Invariant: `release` removes the record only with its claimId; a wrong token is NOT_OWNER and
// leaves it, and an already absent record is a non-error `released: false`.
test('release requires the matching claimId', async (t) => {
  const root = fakeRoot(t);
  const { claimId } = await acquire(root);
  const refused = expectOutcome(
    await call('release', root, { target: FORGE, issue: 693, claimId: 'b'.repeat(32) }),
    'NOT_OWNER',
  );
  assert.equal(refused.reason, 'token-mismatch');
  assert.equal(existsSync(recordPath(root)), true);

  const released = expectOk(await call('release', root, { target: FORGE, issue: 693, claimId }));
  assert.equal(released.released, true);
  assert.equal(existsSync(recordPath(root)), false);
  const again = expectOk(await call('release', root, { target: FORGE, issue: 693, claimId }));
  assert.deepEqual([again.released, again.reason], [false, 'missing']);

  // Released, the issue is claimable again.
  await acquire(root, { workflow: 'plan-issue', runId: 'plan-issue-1', passId: undefined });
});

// Invariant: an invalid record blocks acquisition (CLAIMED with the reason, never overwritten) and
// cannot be released through a token.
test('an invalid record blocks acquire and release and is kept', async (t) => {
  const root = fakeRoot(t);
  const target = recordPath(root);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, '{"schemaVersion":1}\n');
  const outcome = expectOutcome(
    await call('acquire', root, {
      target: FORGE,
      issue: 693,
      workflow: 'issue-buddy',
      passId: PASS_ID,
    }),
    'CLAIMED',
  );
  assert.deepEqual([outcome.state, outcome.reason], ['invalid', 'workflow']);
  expectOutcome(
    await call('release', root, { target: FORGE, issue: 693, claimId: 'a'.repeat(32) }),
    'NOT_OWNER',
  );
  assert.equal(readFileSync(target, 'utf8'), '{"schemaVersion":1}\n');
});

// Invariant: while a legacy `.effective-flow/issue-buddy/pass.lock` exists, every acquire refuses
// with LEGACY_PASS_LOCK naming it for operator inspection, writes no claim and never removes it.
test('acquire refuses while a legacy pass.lock exists and keeps it', async (t) => {
  const root = fakeRoot(t);
  const lock = join(root, '.effective-flow', 'issue-buddy', 'pass.lock');
  mkdirSync(join(lock, '..'), { recursive: true });
  writeFileSync(lock, '{"passId":"old"}\n');
  for (const input of [
    { workflow: 'issue-buddy', passId: PASS_ID },
    { workflow: 'autopilot', runId: RUN },
    { workflow: 'plan-issue', runId: 'plan-issue-1' },
  ]) {
    const outcome = expectOutcome(
      await call('acquire', root, { target: FORGE, issue: 693, ...input }),
      'LEGACY_PASS_LOCK',
    );
    assert.equal(outcome.path, '.effective-flow/issue-buddy/pass.lock');
  }
  assert.equal(existsSync(lock), true);
  assert.equal(existsSync(join(root, '.effective-flow', 'planning-claims')), false);
});

// Invariant: the CLI writes one envelope line, exit 4 for CLAIMED and LEGACY_PASS_LOCK, with an
// operator-readable stderr line that carries neither token.
test('the CLI reports CLAIMED and LEGACY_PASS_LOCK as outcomes', async (t) => {
  const root = fakeRoot(t);
  await acquire(root, {}, { randomToken: () => 'c'.repeat(32) });
  const io = () => {
    const out = { stdout: '', stderr: '', code: 0 };
    return {
      out,
      stdout: { write: (text) => (out.stdout += text) },
      stderr: { write: (text) => (out.stderr += text) },
      setExitCode: (code) => (out.code = code),
    };
  };
  const claimed = io();
  await main(['planning-claim', 'acquire'], {
    ...claimed,
    input: { cwd: root, target: FORGE, issue: 693, workflow: 'plan-issue', runId: 'plan-issue-1' },
    deps: deps(root),
  });
  assert.equal(claimed.out.code, 4);
  assert.match(claimed.out.stderr, /^CLAIMED: issue 693 is being planned by issue-buddy /);
  assert.equal(claimed.out.stdout.includes('c'.repeat(32)), false);

  const lock = join(root, '.effective-flow', 'issue-buddy', 'pass.lock');
  mkdirSync(join(lock, '..'), { recursive: true });
  writeFileSync(lock, '{}');
  const legacy = io();
  await main(['planning-claim', 'acquire'], {
    ...legacy,
    input: { cwd: root, target: FORGE, issue: 1, workflow: 'plan-issue', runId: 'plan-issue-1' },
    deps: deps(root),
  });
  assert.equal(legacy.out.code, 4);
  assert.match(
    legacy.out.stderr,
    /^LEGACY_PASS_LOCK: .*requires operator inspection; it was not removed/,
  );
});

// ---------------------------------------------------------------------------------------------
// List

// Invariant: `list` reports every claim's holder, age, stale flag and liveness but never a claimId,
// marks an invalid record, digests an unexpected name, and filters by target on request.
test('list reports holders without tokens, with stale flag and liveness', async (t) => {
  const root = fakeRoot(t);
  await acquire(root, {}, { randomToken: () => 'd'.repeat(32) });
  await acquire(
    root,
    { target: EXTERNAL, issue: 'ENG-7', workflow: 'autopilot', runId: RUN, passId: undefined },
    { randomToken: () => 'e'.repeat(32), now: NOW - STALE_AFTER_MS - 1, ownerPid: 5151 },
  );
  await acquire(
    root,
    { issue: 700, workflow: 'plan-issue', runId: 'plan-issue-1', passId: undefined },
    { randomToken: () => 'f'.repeat(32), hostname: () => 'elsewhere' },
  );
  const invalid = recordPath(root, FORGE, 701);
  writeFileSync(invalid, 'not json');
  writeFileSync(join(invalid, '..', 'stray.txt'), '');

  const result = await list(root, { alive: [OWNER_PID] });
  const text = JSON.stringify(result);
  for (const token of ['d', 'e', 'f']) assert.equal(text.includes(token.repeat(32)), false);
  assert.equal(text.includes('claimId'), false);
  const byIssue = Object.fromEntries(
    result.claims.map((claim) => [String(claim.issue ?? claim.issueKey), claim]),
  );
  assert.deepEqual(
    [byIssue['693'].workflow, byIssue['693'].stale, byIssue['693'].liveness],
    ['issue-buddy', false, 'alive'],
  );
  assert.deepEqual(
    [byIssue['eng-7'].runId, byIssue['eng-7'].stale, byIssue['eng-7'].liveness],
    [RUN, true, 'dead'],
  );
  assert.equal(byIssue['700'].liveness, 'unknown', 'another host is never probed');
  assert.deepEqual(
    [byIssue['issue-701'].state, byIssue['issue-701'].reason],
    ['invalid', 'invalid-json'],
  );
  assert.equal(result.unexpected.length, 1);
  assert.match(result.unexpected[0].fileNameSha256, /^[0-9a-f]{64}$/);
  assert.equal(result.staleAfterHours, 2);

  const filtered = await list(root, {}, { target: EXTERNAL });
  assert.deepEqual(
    filtered.claims.map((claim) => claim.issue),
    ['eng-7'],
  );
});

// Invariant: a missing claims directory lists nothing and creates nothing.
test('list on a fresh root is empty and writes nothing', async (t) => {
  const root = fakeRoot(t);
  const result = await list(root);
  assert.deepEqual(result.claims, []);
  assert.equal(existsSync(join(root, '.effective-flow')), false);
});

// ---------------------------------------------------------------------------------------------
// Prune

function observed(root, target = FORGE, issue = 693) {
  const record = readRecord(root, target, issue);
  return { targetKey: record.targetKey, issueKey: record.issueKey, acquiredAt: record.acquiredAt };
}

// Invariant: without a proof or stale confirmation `prune` refuses the input, and a proof that does
// not hold leaves the claim: a live process, a present pass record, an open ledger.
test('prune refuses without a holding proof', async (t) => {
  const root = fakeRoot(t);
  await acquire(root);
  const item = observed(root);
  expectError(await prune(root, [item]), 'INVALID_INPUT');
  expectError(
    await prune(root, [{ ...item, proof: 'process-dead', confirmStale: true }]),
    'INVALID_INPUT',
  );
  expectError(await prune(root, [{ ...item, proof: 'trust-me' }]), 'INVALID_INPUT');

  const passes = join(root, '.effective-flow', 'issue-buddy', 'passes');
  mkdirSync(passes, { recursive: true });
  writeFileSync(join(passes, `${PASS_ID}.json`), '{}');
  const refused = expectOk(await prune(root, [{ ...item, proof: 'pass-record-absent' }])).items[0];
  assert.deepEqual([refused.result, refused.reason], ['proof-refused', 'pass-record-present']);
  const alive = expectOk(await prune(root, [{ ...item, proof: 'process-dead' }])).items[0];
  assert.deepEqual([alive.result, alive.reason], ['proof-refused', 'process-alive']);
  const notAutopilot = expectOk(await prune(root, [{ ...item, proof: 'run-ledger-closed' }]))
    .items[0];
  assert.deepEqual(
    [notAutopilot.result, notAutopilot.reason],
    ['proof-refused', 'proof-not-applicable'],
  );
  const fresh = expectOk(await prune(root, [{ ...item, confirmStale: true }])).items[0];
  assert.equal(fresh.result, 'not-stale');
  assert.equal(existsSync(recordPath(root)), true);
});

// Invariant: each orphan proof, verified by the helper against the runtime state, removes the claim:
// a gone pass record, a closed or gone autopilot ledger, a dead process on this host; an open
// ledger refuses.
test('prune removes a claim under each verified orphan proof', async (t) => {
  const root = fakeRoot(t);
  await acquire(root);
  const passRemoved = expectOk(
    await prune(root, [{ ...observed(root), proof: 'pass-record-absent' }]),
  ).items[0];
  assert.deepEqual([passRemoved.result, passRemoved.proof], ['removed', 'pass-record-absent']);
  assert.equal(existsSync(recordPath(root)), false);

  const ledgerDir = join(root, '.effective-flow', 'autopilot', RUN);
  mkdirSync(ledgerDir, { recursive: true });
  writeFileSync(join(ledgerDir, 'run.json'), JSON.stringify({ runId: RUN, status: 'open' }));
  await acquire(root, { workflow: 'autopilot', runId: RUN, passId: undefined });
  const open = expectOk(await prune(root, [{ ...observed(root), proof: 'run-ledger-closed' }]))
    .items[0];
  assert.deepEqual([open.result, open.reason], ['proof-refused', 'ledger-open']);
  writeFileSync(join(ledgerDir, 'run.json'), JSON.stringify({ runId: RUN, status: 'closed' }));
  assert.equal(
    expectOk(await prune(root, [{ ...observed(root), proof: 'run-ledger-closed' }])).items[0]
      .result,
    'removed',
  );

  // Invariant: `run-init` claims before it writes the ledger, so a missing ledger proves a closed
  // run only once the claim is older than LEDGER_GRACE_MS; a younger claim is refused and kept.
  const absentRun = 'ap-20261120T095901Z-ffffffff';
  await acquire(root, { workflow: 'autopilot', runId: absentRun, passId: undefined });
  for (const age of [0, LEDGER_GRACE_MS]) {
    const young = expectOk(
      await prune(root, [{ ...observed(root), proof: 'run-ledger-closed' }], { now: NOW + age }),
    ).items[0];
    assert.deepEqual([young.result, young.reason], ['proof-refused', 'ledger-absent-in-grace']);
    assert.equal(existsSync(recordPath(root)), true);
  }
  assert.equal(
    expectOk(
      await prune(root, [{ ...observed(root), proof: 'run-ledger-closed' }], {
        now: NOW + LEDGER_GRACE_MS + 1,
      }),
    ).items[0].result,
    'removed',
  );

  await acquire(root, { workflow: 'plan-issue', runId: 'plan-issue-1', passId: undefined });
  assert.equal(
    expectOk(await prune(root, [{ ...observed(root), proof: 'process-dead' }], { alive: [] }))
      .items[0].result,
    'removed',
  );
});

// Invariant: a process on another host or without a recorded pid is never proven dead.
test('prune never proves a process dead on another host or without a pid', async (t) => {
  const root = fakeRoot(t);
  await acquire(root, {}, { hostname: () => 'elsewhere' });
  const remote = expectOk(
    await prune(root, [{ ...observed(root), proof: 'process-dead' }], { alive: [] }),
  ).items[0];
  assert.deepEqual([remote.result, remote.reason], ['proof-refused', 'process-unknown']);
  await acquire(root, { issue: 2 }, { ownerPid: null });
  assert.equal(readRecord(root, FORGE, 2).pid, null);
  const noPid = expectOk(
    await prune(root, [{ ...observed(root, FORGE, 2), proof: 'process-dead' }], { alive: [] }),
  ).items[0];
  assert.deepEqual([noPid.result, noPid.reason], ['proof-refused', 'process-unknown']);
});

// Invariant: `confirmStale` removes only a claim older than two hours, even a live one, because the
// operator confirmed that exact claim.
test('prune removes a confirmed stale claim', async (t) => {
  const root = fakeRoot(t);
  await acquire(root, {}, { now: NOW - STALE_AFTER_MS - 1 });
  const result = expectOk(await prune(root, [{ ...observed(root), confirmStale: true }])).items[0];
  assert.equal(result.result, 'removed');
  assert.equal(existsSync(recordPath(root)), false);
});

// Invariant: prune acts only on the claim the caller observed: a re-acquired claim (another
// `acquiredAt`) is `changed`, and a record swapped between the proof and the unlink is `changed`.
test('prune re-checks the record identity before the unlink', async (t) => {
  const root = fakeRoot(t);
  await acquire(root, {}, { now: NOW - STALE_AFTER_MS - 1 });
  const stale = observed(root);
  const { claimId } = readRecord(root);
  expectOk(await call('release', root, { target: FORGE, issue: 693, claimId }));
  await acquire(root, {}, { now: NOW - STALE_AFTER_MS - 5 });
  assert.equal(
    expectOk(await prune(root, [{ ...stale, confirmStale: true }])).items[0].result,
    'changed',
  );

  // The proof holds on the record read first; a swap before the unlink is detected.
  const current = observed(root);
  mkdirSync(join(root, '.effective-flow', 'issue-buddy', 'passes'), { recursive: true });
  const swapped = JSON.stringify({ ...readRecord(root), pid: 9999 });
  const result = expectOk(
    await prune(root, [{ ...current, proof: 'pass-record-absent' }], {
      fs: {
        lstat: async (target, options) => {
          const { lstat } = await import('node:fs/promises');
          if (String(target).endsWith(`${PASS_ID}.json`)) {
            writeFileSync(recordPath(root), `${swapped}\n`);
          }
          return lstat(target, options);
        },
      },
    }),
  ).items[0];
  assert.equal(result.result, 'changed');
  assert.equal(readRecord(root).pid, 9999, 'the swapped record is kept');
});

// Invariant: missing claims and invalid records are reported, never removed; duplicates refused.
test('prune reports missing and invalid claims and refuses duplicates', async (t) => {
  const root = fakeRoot(t);
  const key = planningClaimKey({ target: FORGE, issue: 693 });
  const item = {
    targetKey: key.targetKey,
    issueKey: key.issueKey,
    acquiredAt: new Date(NOW).toISOString(),
    confirmStale: true,
  };
  assert.equal(expectOk(await prune(root, [item])).items[0].result, 'missing');
  mkdirSync(join(recordPath(root), '..'), { recursive: true });
  writeFileSync(recordPath(root), '[]');
  const invalid = expectOk(await prune(root, [item])).items[0];
  assert.deepEqual([invalid.result, invalid.reason], ['invalid', 'not-an-object']);
  assert.equal(existsSync(recordPath(root)), true);
  expectError(await prune(root, [item, item]), 'INVALID_INPUT');
  expectError(await prune(root, [{ ...item, targetKey: '../x' }]), 'INVALID_INPUT');
});

// ---------------------------------------------------------------------------------------------
// Helper-internal read

// Invariant: the internal read returns the claimId for helper-internal verification; it is the
// one path that does, and it never writes.
test('readPlanningClaim returns the full record including the claimId', async (t) => {
  const root = fakeRoot(t);
  const before = await readPlanningClaim({ cwd: root, target: FORGE, issue: 693 }, deps(root));
  assert.equal(before.state, 'missing');
  const { claimId } = await acquire(root, { workflow: 'autopilot', runId: RUN, passId: undefined });
  const read = await readPlanningClaim({ cwd: root, target: FORGE, issue: '693' }, deps(root));
  assert.equal(read.state, 'valid');
  assert.deepEqual(
    [read.claim.claimId, read.claim.runId, read.claim.workflow],
    [claimId, RUN, 'autopilot'],
  );
  assert.deepEqual(readdirSync(join(recordPath(root), '..')), ['issue-693.json']);
});

// Invariant: without an injected owner pid the record carries the session process, the parent of
// the helper's parent, read from procfs where it exists.
test('acquire records the session process as pid', async (t) => {
  const root = fakeRoot(t);
  await acquire(root, {}, { ownerPid: undefined });
  const { pid, pidStartTime } = readRecord(root);
  if (existsSync(`/proc/${process.ppid}/stat`)) {
    const stat = readFileSync(`/proc/${process.ppid}/stat`, 'utf8');
    const expected = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
    assert.equal(pid, expected > 1 ? expected : null);
    if (pid !== null) assert.equal(pidStartTime, processStartTime(pid));
  } else {
    assert.ok(pid === null || Number.isSafeInteger(pid));
    assert.equal(pidStartTime, null);
  }
});

// ---------------------------------------------------------------------------------------------
// Session owner identity and the start-time liveness rule

// A `/proc/<pid>/stat` line: a command name with a space and a `)`, then fields 3 to 24, with the
// parent pid in field 4 and the start time in field 22.
function statLine(pid, ppid, startTime) {
  const rest = ['S', ppid, ...Array.from({ length: 17 }, () => '0'), startTime, '0', '0'];
  return `${pid} (odd ) name) ${rest.join(' ')}\n`;
}

function procStat(table) {
  return (pid) => {
    if (table[pid] === undefined) {
      throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
    }
    return table[pid];
  };
}

// Invariant: the session owner is the parent of the helper's parent with its start time, read from
// procfs (field 4, then field 22 of the owner); without procfs `ps` names the pid and no start time
// is recorded; an unusable answer is null, never a guess.
test('sessionOwner resolves the session pid and start time from procfs or ps', async () => {
  const unusedRunner = async () => assert.fail('ps is not asked while procfs answers');
  const procfs = {
    parentPid: 500,
    readProcStat: procStat({ 500: statLine(500, 777, 0), 777: statLine(777, 1, 123456) }),
  };
  assert.deepEqual(await sessionOwner({ runner: unusedRunner }, procfs), {
    pid: 777,
    pidStartTime: 123456,
  });
  assert.equal(await sessionPid({ runner: unusedRunner }, procfs), 777);
  // The owner's own stat is gone (it exited): the pid stays, the start time is unknown.
  assert.deepEqual(
    await sessionOwner(
      { runner: unusedRunner },
      { parentPid: 500, readProcStat: procStat({ 500: statLine(500, 777, 0) }) },
    ),
    { pid: 777, pidStartTime: null },
  );
  assert.deepEqual(
    await sessionOwner(
      { runner: unusedRunner },
      { parentPid: 500, readProcStat: procStat({ 500: statLine(500, 1, 0) }) },
    ),
    { pid: null, pidStartTime: null },
  );

  const calls = [];
  const ps = (answer) => async (call) => {
    calls.push(call);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  const noProcfs = { parentPid: 500, readProcStat: procStat({}) };
  assert.deepEqual(await sessionOwner({ runner: ps({ status: 0, stdout: ' 888\n' }) }, noProcfs), {
    pid: 888,
    pidStartTime: null,
  });
  assert.deepEqual(calls[0], {
    executable: 'ps',
    args: ['-o', 'ppid=', '-p', '500'],
    timeoutMs: 5000,
  });
  for (const answer of [
    { status: 1, stdout: '888' },
    { status: 0, stdout: '1' },
    { status: 0, stdout: 'x' },
    new Error('spawn failed'),
  ]) {
    assert.deepEqual(await sessionOwner({ runner: ps(answer) }, noProcfs), {
      pid: null,
      pidStartTime: null,
    });
  }

  // The injected owner carries only an injected start time.
  assert.deepEqual(await sessionOwner({}, { ownerPid: 4242, ownerPidStartTime: 9 }), {
    pid: 4242,
    pidStartTime: 9,
  });
  assert.deepEqual(await sessionOwner({}, { ownerPid: 4242 }), { pid: 4242, pidStartTime: null });
  assert.deepEqual(await sessionOwner({}, { ownerPid: null, ownerPidStartTime: 9 }), {
    pid: null,
    pidStartTime: null,
  });
});

// Invariant: the start time is field 22 of `/proc/<pid>/stat`; where procfs does not answer it is
// null, never a guess.
test('processStartTime reads field 22 of the process stat', () => {
  assert.equal(
    processStartTime(777, { readProcStat: procStat({ 777: statLine(777, 1, 42) }) }),
    42,
  );
  assert.equal(processStartTime(777, { readProcStat: procStat({}) }), null);
  assert.equal(processStartTime(777, { readProcStat: () => '777 (truncated' }), null);
  assert.equal(processStartTime(777, { readProcStat: () => statLine(777, 1, '-3') }), null);
  assert.equal(processStartTime(1, { readProcStat: procStat({ 1: statLine(1, 0, 42) }) }), null);
  if (existsSync('/proc/self/stat')) {
    const stat = readFileSync(`/proc/${process.pid}/stat`, 'utf8');
    const expected = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]);
    assert.equal(processStartTime(process.pid), expected);
  }
});

// Invariant: liveness is `dead` only when the recorded process is provably gone: its pid is absent
// (whatever the start time), or present with another start time than recorded (pid reuse). A
// present pid with a matching or no recorded start time is `alive`, as before the field existed;
// a present pid whose current start time cannot be read is `unknown`, never `dead`.
test('liveness checks the process identity by pid and start time', () => {
  const absent = () => {
    throw Object.assign(new Error('no such process'), { code: 'ESRCH' });
  };
  const present = () => true;
  const foreign = () => {
    throw Object.assign(new Error('not permitted'), { code: 'EPERM' });
  };
  const broken = () => {
    throw Object.assign(new Error('odd'), { code: 'EINVAL' });
  };
  const at = (startTime) => procStat({ 4242: statLine(4242, 1, startTime) });
  const gone = procStat({});
  const claim = (extra) => ({ pid: 4242, hostname: HOST, ...extra });
  const cases = [
    ['absent, start recorded', claim({ pidStartTime: 100 }), absent, at(100), 'dead'],
    ['absent, start null', claim({ pidStartTime: null }), absent, gone, 'dead'],
    ['absent, legacy record', claim({}), absent, gone, 'dead'],
    ['present, same start', claim({ pidStartTime: 100 }), present, at(100), 'alive'],
    ['present, other start', claim({ pidStartTime: 100 }), present, at(200), 'dead'],
    ['present, start unreadable', claim({ pidStartTime: 100 }), present, gone, 'unknown'],
    ['present, start null', claim({ pidStartTime: null }), present, at(200), 'alive'],
    ['present, legacy record', claim({}), present, at(200), 'alive'],
    ['foreign owner, same start', claim({ pidStartTime: 100 }), foreign, at(100), 'alive'],
    ['foreign owner, other start', claim({ pidStartTime: 100 }), foreign, at(200), 'dead'],
    ['probe error', claim({ pidStartTime: 100 }), broken, at(200), 'unknown'],
    ['no pid', { pid: null, pidStartTime: null, hostname: HOST }, absent, gone, 'unknown'],
    ['other host', claim({ pidStartTime: 100, hostname: 'elsewhere' }), absent, gone, 'unknown'],
  ];
  for (const [label, value, kill, readProcStat, expected] of cases) {
    assert.equal(claimLiveness(value, HOST, { kill, readProcStat }), expected, label);
  }
});

// Invariant: `prune` accepts `process-dead` only for a provably gone owner: a live owner with the
// recorded start time is refused, a reused pid (another start time) is removed, an unreadable start
// time is refused `process-unknown`. A record written before `pidStartTime` existed stays valid and
// keeps the pid-only probe; a malformed start time makes the record invalid.
test('prune proves a process dead by pid and recorded start time', async (t) => {
  const root = fakeRoot(t);
  await acquire(root, {}, { ownerPidStartTime: 100 });
  assert.equal(readRecord(root).pidStartTime, 100);
  const proof = [{ ...observed(root), proof: 'process-dead' }];
  const same = { readProcStat: procStat({ [OWNER_PID]: statLine(OWNER_PID, 1, 100) }) };
  const live = expectOk(await prune(root, proof, same)).items[0];
  assert.deepEqual([live.result, live.reason], ['proof-refused', 'process-alive']);
  const unreadable = expectOk(await prune(root, proof, { readProcStat: procStat({}) })).items[0];
  assert.deepEqual([unreadable.result, unreadable.reason], ['proof-refused', 'process-unknown']);
  const listed = await list(root, same);
  assert.equal(listed.claims[0].liveness, 'alive');
  const reused = { readProcStat: procStat({ [OWNER_PID]: statLine(OWNER_PID, 1, 200) }) };
  assert.equal((await list(root, reused)).claims[0].liveness, 'dead');
  assert.equal(expectOk(await prune(root, proof, reused)).items[0].result, 'removed');

  // A legacy record without the field: valid, probed by pid alone.
  await acquire(root);
  const { pidStartTime, ...legacy } = readRecord(root);
  assert.equal(pidStartTime, null);
  writeFileSync(recordPath(root), `${JSON.stringify(legacy)}\n`);
  const kept = expectOk(await prune(root, [{ ...observed(root), proof: 'process-dead' }], reused))
    .items[0];
  assert.deepEqual([kept.result, kept.reason], ['proof-refused', 'process-alive']);
  assert.equal(
    expectOk(await prune(root, [{ ...observed(root), proof: 'process-dead' }], { alive: [] }))
      .items[0].result,
    'removed',
  );

  for (const [label, value] of [
    ['string', '100'],
    ['negative', -1],
    ['fraction', 1.5],
  ]) {
    await acquire(root);
    writeFileSync(
      recordPath(root),
      `${JSON.stringify({ ...readRecord(root), pidStartTime: value })}\n`,
    );
    const entry = (await list(root)).claims[0];
    assert.deepEqual([entry.state, entry.reason], ['invalid', 'pid-start-time'], label);
    rmSync(recordPath(root));
  }
  await acquire(root, {}, { ownerPid: null, ownerPidStartTime: 100 });
  assert.equal(readRecord(root).pidStartTime, null, 'no start time without a pid');
});
