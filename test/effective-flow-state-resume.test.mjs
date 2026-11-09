// Git-backed tests of the resume of a retained `partial-diff` delivery: the resume adoption
// (`worktree transition` with `adoption: "partial-diff-resume"`), its tip recovery, the read-only
// `worktree resume-check`, and the resume-mode `ledger reconcile`. The fixtures are those of the
// ledger tests: a real main checkout as the delivery source and a `partial-diff` worktree that
// received the bound selection.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { lstat as fsLstat, unlink as fsUnlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  bindSelectionManifest,
  transferSelection,
} from '../src/scripts/delivery-selection-core.mjs';
import { OPERATION_KEYS } from '../src/scripts/effective-flow-state-core.mjs';
import {
  RESUME_OPERATION_PROOFS,
  RESUME_PROOFS,
} from '../src/scripts/effective-flow-state-recovery-core.mjs';
import { itemDigest } from '../src/scripts/effective-flow-state-worktree-core.mjs';
import {
  GIT_ENV,
  SESSION,
  addWorktree,
  call,
  commonDir,
  expectError,
  expectOk,
  expectOutcome,
  git,
  lockFile,
  makeRecord,
  readRecord,
  recordFile,
  repository,
} from './support/worktree-fixtures.mjs';
import {
  OTHER_SESSION,
  append,
  commitGroup,
  delivery,
  failRecord,
  initInput,
  ledgerFile,
  processRunner,
  readLedgerFile,
  release,
  releaseInput,
  selectionRunner,
  snapshot,
  status,
  write,
} from './support/ledger-fixtures.mjs';

function resumeInput(fixture, overrides = {}) {
  return {
    cwd: fixture.root,
    executionRoot: fixture.root,
    recordId: fixture.record.recordId,
    from: 'failed',
    to: 'active',
    reason: null,
    sessionId: OTHER_SESSION,
    branch: fixture.worktree.branch,
    workflow: 'deliver',
    adoption: 'partial-diff-resume',
    visibility: 'visible',
    ...overrides,
  };
}

function resume(fixture, overrides = {}, extra) {
  return call('worktree transition', resumeInput(fixture, overrides), extra);
}

function resumeCheck(fixture, overrides = {}, extra) {
  return call(
    'worktree resume-check',
    {
      cwd: fixture.root,
      executionRoot: fixture.root,
      recordId: fixture.record.recordId,
      visibility: 'visible',
      ...overrides,
    },
    extra,
  );
}

function reconcile(fixture, sessionId = OTHER_SESSION, extra) {
  return call(
    'ledger reconcile',
    {
      cwd: fixture.root,
      executionRoot: fixture.root,
      recordId: fixture.record.recordId,
      sessionId,
    },
    extra,
  );
}

// The issue's scenario up to the failure: two groups (`a.txt`, `b.txt`), group 1 committed and
// recorded, then the run fails and the record is `failed` with group 2 still in the worktree.
async function failedAfterGroupOne(t) {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  const first = commitGroup(fixture, ['a.txt']);
  expectOk(await append(fixture, first));
  await failRecord(fixture);
  return { ...fixture, first };
}

// The bytes of everything a refused or read-only call must leave alone: record, ledger, lock
// owner (null without a lock), and the worktree's dirty set, staged entries and index file bytes
// (`snapshot`, whose Git calls run with `GIT_OPTIONAL_LOCKS=0`).
function stateBytes(fixture) {
  const lock = lockFile(fixture.root);
  return {
    ...snapshot(fixture),
    lock: existsSync(lock) ? readFileSync(join(lock, 'owner'), 'utf8') : null,
  };
}

function assertUntouched(fixture, before, label = '') {
  assert.deepEqual(stateBytes(fixture), before, `record, ledger, lock and worktree ${label}`);
}

// ---------------------------------------------------------------------------------------------
// Closed input

// Invariant: the resume operations take exactly their closed key sets; neither takes ledger
// content, and `worktree transition` carries the adoption discriminator and the visibility.
test('the resume operations have closed key sets without ledger content', () => {
  assert.deepEqual(
    [...OPERATION_KEYS['worktree resume-check']],
    ['cwd', 'executionRoot', 'recordId', 'visibility'],
  );
  assert.deepEqual(
    [...OPERATION_KEYS['ledger reconcile']],
    ['cwd', 'executionRoot', 'recordId', 'sessionId'],
  );
  assert.ok(OPERATION_KEYS['worktree transition'].includes('adoption'));
  assert.ok(OPERATION_KEYS['worktree transition'].includes('visibility'));
  assert.deepEqual(
    [...RESUME_PROOFS],
    [
      'condition-1',
      'purpose',
      'workflow',
      'branch',
      'condition-2',
      'condition-3',
      'condition-4',
      'condition-5',
      'condition-6',
      'condition-9',
      'visibility',
      'ledger',
      'history',
      'committed-count',
      'index',
      'residual',
      'source',
    ],
  );
});

// Invariant (adoption discriminator): `adoption` is valid only with `to: "active"`; an unknown
// value is refused; `partial-diff-resume` forbids `fetchedHeadOid` and requires `visibility`,
// `branch` and `workflow`; `visibility` is forbidden elsewhere. Each refusal is INVALID_INPUT and
// writes nothing.
test('the adoption discriminator rules', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const before = stateBytes(fixture);
  const refusals = [
    { adoption: 'other' },
    { fetchedHeadOid: fixture.worktree.head },
    { visibility: undefined },
    { visibility: 'public' },
    { branch: undefined },
    { workflow: undefined },
    { from: 'active', to: 'failed', reason: 'x', visibility: undefined },
    { from: 'active', to: 'failed', reason: 'x', adoption: undefined },
  ];
  for (const overrides of refusals) {
    const input = resumeInput(fixture, overrides);
    for (const key of Object.keys(input)) if (input[key] === undefined) delete input[key];
    expectError(await call('worktree transition', input), 'INVALID_INPUT');
  }
  // A plan-PR continuation adoption may not carry the resume visibility.
  expectError(
    await resume(fixture, {
      adoption: 'plan-pr-continuation',
      fetchedHeadOid: fixture.worktree.head,
    }),
    'INVALID_INPUT',
  );
  assertUntouched(fixture, before, 'after the input refusals');
  assert.equal(existsSync(lockFile(fixture.root)), false);
});

// Invariant: a `partial-diff` record adopted without the discriminator still takes the plan-PR
// continuation proofs and is refused with `purpose`, exactly as before.
test('a partial-diff record without the discriminator is still refused as purpose', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const before = stateBytes(fixture);
  const input = resumeInput(fixture, { fetchedHeadOid: fixture.worktree.head });
  delete input.adoption;
  delete input.visibility;
  const refused = expectOutcome(await call('worktree transition', input), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['purpose']);
  assertUntouched(fixture, before);
});

// ---------------------------------------------------------------------------------------------
// Resume adoption

// Invariant (the issue's scenario): after a failure following group 1 of 2, a new session adopts
// the record with every proof passing; only `status`, `reason`, `updatedAt` and `sessionId`
// change, the ledger is unchanged, and the result names what the delivery continues from. The
// resume reconcile is then exact, and group 2 is committed and recorded by the new session.
test('resume after a failure following group 1 of 2, reconcile, and group 2', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const ledgerBefore = readFileSync(ledgerFile(fixture), 'utf8');
  const recordBefore = readRecord(fixture.root);
  const resumed = expectOk(await resume(fixture));
  assert.equal(resumed.status, 'active');
  assert.equal(resumed.sessionId, OTHER_SESSION);
  assert.deepEqual(resumed.resume, {
    recovered: null,
    committed: [{ group: 0, oid: fixture.first }],
    next: 1,
    remaining: 1,
    remainingGroups: [{ group: 1, paths: ['b.txt'] }],
    tip: fixture.first,
    hookStaged: false,
    hookStagedEntries: [],
    base: { branch: 'main', oid: fixture.worktree.head },
    language: { git: 'en', forge: 'de' },
    visibility: 'visible',
    sourceRoot: fixture.root,
    groups: [
      { group: 0, paths: ['a.txt'], oid: fixture.first },
      { group: 1, paths: ['b.txt'], oid: null },
    ],
    selection: [
      { path: 'a.txt', selectionOrigin: 'working', renameFrom: null },
      { path: 'b.txt', selectionOrigin: 'working', renameFrom: null },
    ],
  });
  const record = readRecord(fixture.root);
  assert.equal(record.status, 'active');
  assert.equal(record.reason, null);
  assert.equal(record.sessionId, OTHER_SESSION);
  const strip = ({ status: _s, reason: _r, updatedAt: _u, sessionId: _i, ...rest }) => rest;
  assert.deepEqual(strip(record), strip(recordBefore));
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), ledgerBefore, 'the ledger is unchanged');
  assert.equal(existsSync(lockFile(fixture.root)), false);
  // The failed session no longer owns the record; the new one reconciles it.
  expectOutcome(await reconcile(fixture, SESSION), 'NOT_OWNER');
  const reconciled = expectOk(await reconcile(fixture));
  assert.equal(reconciled.exact, true, JSON.stringify(reconciled));
  assert.equal(reconciled.next, 1);
  assert.equal(reconciled.remaining, 1);
  assert.equal(reconciled.tip, fixture.first);
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), ledgerBefore, 'reconcile writes nothing');
  const second = commitGroup(fixture, ['b.txt']);
  const appended = expectOk(await append(fixture, second, OTHER_SESSION));
  assert.equal(appended.group, 1);
  assert.equal(appended.remaining, 0);
  assert.deepEqual(readLedgerFile(fixture).commits, [
    { group: 0, oid: fixture.first },
    { group: 1, oid: second },
  ]);
  assert.equal(status(fixture.worktree.worktreePath), '');
});

// Invariant (tip recovery): a group commit the failed run created but never recorded (zero ledger
// entries) is proven by the tip-recovery checks and appended to the ledger before the record is
// written; the next reconcile is exact and a repeated `ledger append` of it is idempotent.
test('resume recovers one unrecorded tip commit with zero ledger entries', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  const first = commitGroup(fixture, ['a.txt']);
  await failRecord(fixture);
  const { commits: _c, ...immutableBefore } = readLedgerFile(fixture);
  const check = expectOk(await resumeCheck(fixture));
  assert.equal(check.resumable, true, JSON.stringify(check));
  assert.equal(check.recoveredTip, first);
  assert.equal(check.committed, 1);
  assert.equal(readLedgerFile(fixture).commits.length, 0, 'resume-check recorded nothing');
  const resumed = expectOk(await resume(fixture));
  assert.equal(resumed.resume.recovered, first);
  assert.deepEqual(resumed.resume.committed, [{ group: 0, oid: first }]);
  assert.equal(resumed.resume.next, 1);
  assert.deepEqual(resumed.resume.groups, [
    { group: 0, paths: ['a.txt'], oid: first },
    { group: 1, paths: ['b.txt'], oid: null },
  ]);
  const ledger = readLedgerFile(fixture);
  assert.deepEqual(ledger.commits, [{ group: 0, oid: first }]);
  const { commits: _a, ...immutableAfter } = ledger;
  assert.deepEqual(immutableAfter, immutableBefore, 'the immutable part never changes');
  assert.equal(expectOk(await reconcile(fixture)).exact, true);
  assert.equal(expectOk(await append(fixture, first, OTHER_SESSION)).appended, false);
});

// Invariant: a recovered entry left by an adoption whose record write did not land is the
// ledger's own commit for the next resume, which recovers nothing and succeeds; a failure before
// the first commit (nothing committed, no tip) is refused as `committed-count` alone.
test('a leftover recovered entry is idempotent; nothing committed is committed-count', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  await failRecord(fixture);
  const before = stateBytes(fixture);
  const nothing = expectOutcome(await resume(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(nothing.proofs, ['committed-count']);
  assertUntouched(fixture, before);
  // The recovered entry of an adoption whose record write failed: the ledger records the tip
  // while the record is still `failed`.
  const ledger = readLedgerFile(fixture);
  const first = commitGroup(fixture, ['a.txt']);
  writeFileSync(
    ledgerFile(fixture),
    `${JSON.stringify({ ...ledger, commits: [{ group: 0, oid: first }] })}\n`,
  );
  const resumed = expectOk(await resume(fixture));
  assert.equal(resumed.resume.recovered, null);
  assert.deepEqual(resumed.resume.committed, [{ group: 0, oid: first }]);
});

// Invariant (visibility): a ledger written `visible` refuses a resume in a run whose current
// visibility is `hidden`, with `visibility` alone and nothing changed; resume-check reports the
// same refusal and still offers the release.
test('a visibility downgrade refuses the resume and keeps the release', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const before = stateBytes(fixture);
  const refused = expectOutcome(await resume(fixture, { visibility: 'hidden' }), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['visibility']);
  assertUntouched(fixture, before);
  const check = expectOk(await resumeCheck(fixture, { visibility: 'hidden' }));
  assert.equal(check.resumable, false);
  assert.deepEqual(check.resumeProofs, ['visibility']);
  assert.equal(check.releasable, true);
  assert.equal(check.releaseRoute, 'ledger');
});

// Invariant (index): a hook-rejected group 2, staged exactly, is accepted and reported as
// `hookStaged`; any other staged content, and a recovered tip combined with a staged group, is
// refused as `index` alone with nothing changed.
test('the index proof: exactly the next group staged, nothing else', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const worktree = fixture.worktree.worktreePath;
  git(worktree, 'add', '--', 'b.txt');
  const staged = expectOk(await resumeCheck(fixture));
  assert.equal(staged.resumable, true, JSON.stringify(staged));
  assert.equal(staged.hookStaged, true);
  // Group 2's path staged with other bytes, its working tree back at the descriptor's bytes.
  write(worktree, 'b.txt', 'staged other\n');
  git(worktree, 'add', '--', 'b.txt');
  write(worktree, 'b.txt', 'b changed\n');
  const before = stateBytes(fixture);
  const refused = expectOutcome(await resume(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['index']);
  assert.deepEqual(refused.stagedPaths, ['b.txt']);
  assertUntouched(fixture, before);

  const recovered = await delivery(t);
  expectOk(await call('ledger init', initInput(recovered)));
  commitGroup(recovered, ['a.txt']);
  await failRecord(recovered);
  git(recovered.worktree.worktreePath, 'add', '--', 'b.txt');
  const beforeRecovered = stateBytes(recovered);
  const both = expectOutcome(await resume(recovered), 'NOT_ELIGIBLE');
  assert.deepEqual(both.proofs, ['index']);
  assertUntouched(recovered, beforeRecovered);
});

// Invariant (residual and source): extra dirt, a changed residual file and a changed selected
// source entry each refuse alone, with nothing changed.
test('the residual and source proofs refuse drift alone', async (t) => {
  const cases = [
    ['residual', (fixture) => write(fixture.worktree.worktreePath, 'extra.txt', 'x\n')],
    ['residual', (fixture) => write(fixture.worktree.worktreePath, 'b.txt', 'edited\n')],
    ['source', (fixture) => write(fixture.root, 'b.txt', 'source edited\n')],
  ];
  for (const [proof, change] of cases) {
    const fixture = await failedAfterGroupOne(t);
    change(fixture);
    const before = stateBytes(fixture);
    const refused = expectOutcome(await resume(fixture), 'NOT_ELIGIBLE');
    assert.deepEqual(refused.proofs, [proof], JSON.stringify(refused));
    assertUntouched(fixture, before, proof);
  }
});

// Invariant (history and ledger): an amended group commit refuses `history` alone; a missing
// ledger refuses `ledger` and reports the ledger proofs as unevaluated.
test('the history and ledger proofs', async (t) => {
  const amended = await failedAfterGroupOne(t);
  git(amended.worktree.worktreePath, 'commit', '-q', '--amend', '-m', 'amended');
  const before = stateBytes(amended);
  const history = expectOutcome(await resume(amended), 'NOT_ELIGIBLE');
  assert.deepEqual(history.proofs, ['history']);
  assertUntouched(amended, before, 'history');

  const missing = await delivery(t);
  commitGroup(missing, ['a.txt']);
  await failRecord(missing);
  const refused = expectOutcome(await resume(missing), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['ledger']);
  assert.equal(refused.ledger, 'missing');
  assert.deepEqual(refused.unevaluated, [
    'visibility',
    'history',
    'committed-count',
    'index',
    'residual',
    'source',
  ]);
  assert.equal(existsSync(ledgerFile(missing)), false);
});

// ---------------------------------------------------------------------------------------------
// worktree resume-check

// Invariant (read-only): `worktree resume-check` evaluates the resume and release proofs without
// taking the lock or writing anything: record, ledger, lock and worktree bytes are unchanged, and
// no lock directory is left. A lock held by another actor is condition-9 of both proof sets and
// stays exactly as it was.
test('resume-check is read-only and reports a held lock as a refusal', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const before = stateBytes(fixture);
  const check = expectOk(await resumeCheck(fixture));
  assert.deepEqual(
    {
      valid: check.valid,
      status: check.status,
      purpose: check.purpose,
      resumable: check.resumable,
      resumeProofs: check.resumeProofs,
      releasable: check.releasable,
      releaseRoute: check.releaseRoute,
      releaseProofs: check.releaseProofs,
      hasLedger: check.hasLedger,
      ledger: check.ledger,
      source: check.source,
      committed: check.committed,
      remaining: check.remaining,
      recoveredTip: check.recoveredTip,
      lock: check.lock,
    },
    {
      valid: true,
      status: 'failed',
      purpose: 'partial-diff',
      resumable: true,
      resumeProofs: [],
      releasable: true,
      releaseRoute: 'ledger',
      releaseProofs: [],
      hasLedger: true,
      ledger: 'ok',
      source: { root: fixture.root },
      committed: 1,
      remaining: 1,
      recoveredTip: null,
      lock: { present: false },
    },
  );
  assert.deepEqual(stateBytes(fixture), before, 'resume-check changed nothing');
  assert.equal(existsSync(lockFile(fixture.root)), false, 'no lock was taken');

  // A lock another actor holds.
  mkdirSync(lockFile(fixture.root), { mode: 0o700 });
  writeFileSync(
    join(lockFile(fixture.root), 'owner'),
    `${JSON.stringify({ token: 'f'.repeat(32), operation: 'worktree transition' })}\n`,
  );
  const locked = stateBytes(fixture);
  const held = expectOk(await resumeCheck(fixture));
  assert.equal(held.resumable, false);
  assert.deepEqual(held.resumeProofs, ['condition-9']);
  assert.equal(held.releasable, false);
  assert.deepEqual(held.releaseProofs, ['condition-9']);
  assert.equal(held.lock.present, true);
  assert.deepEqual(stateBytes(fixture), locked, 'the held lock is untouched');
  // The adoption itself never breaks it.
  expectOutcome(await resume(fixture), 'LOCK_HELD');
  assert.deepEqual(stateBytes(fixture), locked);
});

// Invariant: a record without a ledger is reported for release only (its route and residual),
// with `source: null`; a missing record is RECORD_NOT_FOUND.
test('resume-check of a ledger-less record and of a missing record', async (t) => {
  const fixture = await delivery(t);
  await failRecord(fixture);
  const check = expectOk(await resumeCheck(fixture));
  assert.equal(check.hasLedger, false);
  assert.equal(check.ledger, 'missing');
  assert.equal(check.source, null);
  assert.equal(check.resumable, false);
  assert.deepEqual(check.resumeProofs, ['ledger']);
  assert.equal(check.releasable, false);
  assert.equal(check.releaseRoute, 'no-ledger');
  assert.deepEqual(check.details.release.residualPaths, ['a.txt', 'b.txt']);
  expectOutcome(await resumeCheck(fixture, { recordId: 'record-9' }), 'RECORD_NOT_FOUND');
  assert.equal(existsSync(recordFile(fixture.root, 'record-9')), false);
});

// ---------------------------------------------------------------------------------------------
// In-worktree Git safety

// Invariant (in-worktree Git safety): for the resume adoption, `worktree resume-check` and
// `ledger reconcile`, the first Git call inside the recorded worktree is the common-directory
// probe, and every other call inside it, the reused selection functions included, carries
// `-c core.fsmonitor=false`; so does every history call in the main checkout.
test('every in-worktree Git call of the resume operations is guarded and follows the proof', async (t) => {
  const probe = ['rev-parse', '--path-format=absolute', '--git-common-dir'];
  const fixture = await failedAfterGroupOne(t);
  const worktree = fixture.worktree.worktreePath;
  const recorder = () => {
    const calls = [];
    return {
      calls,
      runner: async (request) => {
        calls.push(request.args);
        return processRunner(request);
      },
    };
  };
  const assertGuarded = (calls, label) => {
    const inside = calls.filter((args) => args[0] === '-C' && args[1] === worktree);
    const isProbe = (args) => args.slice(2).join(' ') === probe.join(' ');
    assert.ok(inside.filter((args) => !isProbe(args)).length > 0, `${label} ran Git inside`);
    assert.deepEqual(inside[0].slice(2), probe, `${label}: the first call is the probe`);
    for (const args of inside) {
      if (!isProbe(args)) {
        assert.deepEqual(args.slice(2, 4), ['-c', 'core.fsmonitor=false'], args.join(' '));
      }
    }
    for (const args of calls.filter((a) => a.includes('rev-list') || a.includes('diff-index'))) {
      assert.deepEqual(args.slice(2, 4), ['-c', 'core.fsmonitor=false'], args.join(' '));
    }
  };
  const check = recorder();
  expectOk(await resumeCheck(fixture, {}, { runner: check.runner }));
  assertGuarded(check.calls, 'resume-check');
  assert.ok(
    check.calls.some((args) => args.includes('ls-files')),
    'inspectResidual ran',
  );
  const adoption = recorder();
  expectOk(await resume(fixture, {}, { runner: adoption.runner }));
  assertGuarded(adoption.calls, 'resume adoption');
  const reconciled = recorder();
  expectOk(await reconcile(fixture, OTHER_SESSION, { runner: reconciled.runner }));
  assertGuarded(reconciled.calls, 'ledger reconcile');
});

// =============================================================================================
// Group 2 acceptance tests. Each test names the invariant it protects.

const PINNED = Date.parse('2026-11-06T19:00:00Z');
const PINNED_ISO = '2026-11-06T19:00:00Z';
const THIRD_SESSION = 'deliver-0011223344556677';
const MULTILINE = ['one', 'two', 'three', 'four', 'five'].map((line) => `${line}\n`).join('');
const RENAME_BASE = 'one\ntwo\nthree\nfour\n';

// The input of a resume transition with the keys set to `undefined` removed.
function bareResume(fixture, overrides) {
  const input = resumeInput(fixture, overrides);
  for (const key of Object.keys(input)) if (input[key] === undefined) delete input[key];
  return input;
}

// Rewrites the record file (and, when a ledger exists, its receipt digest and `ledgerPatch`) the
// way a record with one changed fact looks: used to make exactly one proof fail.
function rewriteRecord(fixture, mutate, ledgerPatch = {}) {
  const file = recordFile(fixture.root);
  const record = JSON.parse(readFileSync(file, 'utf8'));
  mutate(record);
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  if (existsSync(ledgerFile(fixture))) {
    const ledger = { ...readLedgerFile(fixture), ...ledgerPatch };
    ledger.receiptDigest = itemDigest(record.receipt);
    writeFileSync(ledgerFile(fixture), `${JSON.stringify(ledger)}\n`);
  }
  return record;
}

function rewriteLedger(fixture, mutate) {
  const ledger = readLedgerFile(fixture);
  mutate(ledger);
  writeFileSync(ledgerFile(fixture), `${JSON.stringify(ledger)}\n`);
}

async function failBy(fixture, sessionId, reason = 'failed again') {
  expectOk(
    await call('worktree transition', {
      cwd: fixture.root,
      executionRoot: fixture.root,
      recordId: fixture.record.recordId,
      from: 'active',
      to: 'failed',
      reason,
      sessionId,
    }),
  );
}

// A delivery whose selection source is a separate linked worktree. `threeWay`: the main branch
// moved (line 1 of `a.txt`) before the delivery worktree was created, so the transfer merged the
// selected change (line 5) three-way into the refreshed base. The record is `active`.
async function linkedDelivery(t, { threeWay = false } = {}) {
  const root = repository(t, 'effective-flow-resume-');
  write(root, 'a.txt', MULTILINE);
  write(root, 'b.txt', 'b base\n');
  git(root, 'add', 'a.txt', 'b.txt');
  git(root, 'commit', '-q', '-m', 'files');
  const sourcePath = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-resume-source-')));
  t.after(() => rmSync(sourcePath, { recursive: true, force: true }));
  const source = addWorktree(root, { path: sourcePath, branch: 'source-work' });
  if (threeWay) {
    write(root, 'a.txt', MULTILINE.replace('one', 'ONE'));
    git(root, 'add', 'a.txt');
    git(root, 'commit', '-q', '-m', 'refreshed base');
  }
  const worktree = addWorktree(root, { purpose: 'partial-diff' });
  write(source.worktreePath, 'a.txt', MULTILINE.replace('five', 'FIVE'));
  write(source.worktreePath, 'b.txt', 'b changed\n');
  const manifest = await bindSelectionManifest(
    {
      sourceRoot: source.worktreePath,
      selection: ['a.txt', 'b.txt'].map((path) => ({ path, state: 'working' })),
    },
    { runner: selectionRunner },
  );
  const record = makeRecord(root, worktree, { purpose: 'partial-diff', workflow: 'deliver' });
  expectOk(await call('worktree record-init', { cwd: root, executionRoot: root, record }));
  await transferSelection(
    {
      manifest,
      sourceRoot: source.worktreePath,
      deliveryRoot: worktree.worktreePath,
      deliveryReceipt: {
        repositoryIdentity: commonDir(root),
        executionRoot: worktree.worktreePath,
        headOid: worktree.head,
      },
    },
    { runner: selectionRunner, apply: true },
  );
  return { root, worktree, record, manifest, source: source.worktreePath };
}

// A commit attempt of the staged index that a pre-commit hook rejects: the index stays staged.
function rejectedCommit(t, worktree) {
  const hooks = mkdtempSync(join(tmpdir(), 'effective-flow-hooks-'));
  t.after(() => rmSync(hooks, { recursive: true, force: true }));
  writeFileSync(join(hooks, 'pre-commit'), '#!/bin/sh\nexit 1\n');
  chmodSync(join(hooks, 'pre-commit'), 0o755);
  const result = spawnSync(
    'git',
    [
      '-C',
      worktree,
      '-c',
      `core.hooksPath=${hooks}`,
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-q',
      '-m',
      'g',
    ],
    { env: GIT_ENV },
  );
  assert.notEqual(result.status, 0, 'the hook rejected the commit');
}

// Reports a lock that vanishes at the `loseAt`th observation of the record lock after the
// proofs ended (phase `resumeProven`): every `lockStillOwned` check from then on is one count.
function lockLoss(fixture, loseAt) {
  const lock = lockFile(fixture.root);
  const state = { armed: false, seen: 0 };
  return {
    state,
    extra: {
      onPhase: (name) => {
        if (name === 'resumeProven') state.armed = true;
      },
      fs: {
        lstat: async (target, options) => {
          if (state.armed && target === lock && ++state.seen === loseAt) {
            throw Object.assign(new Error('lock gone'), { code: 'ENOENT' });
          }
          return fsLstat(target, options);
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Adoption discriminator

// Invariant (adoption discriminator): `adoption` is valid only with `to: "active"`, whichever of
// its two values it carries; every refusal is INVALID_INPUT and writes nothing.
test('adoption is forbidden outside a transition to active', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const before = stateBytes(fixture);
  for (const adoption of ['partial-diff-resume', 'plan-pr-continuation']) {
    for (const to of ['cleanup-ready', 'aborted', 'failed']) {
      const reason = to === 'cleanup-ready' ? null : 'x';
      expectError(
        await call(
          'worktree transition',
          bareResume(fixture, { from: 'failed', to, reason, adoption, visibility: undefined }),
        ),
        'INVALID_INPUT',
      );
    }
    expectError(
      await call(
        'worktree transition',
        bareResume(fixture, {
          from: 'active',
          to: 'failed',
          reason: 'x',
          adoption,
          visibility: undefined,
        }),
      ),
      'INVALID_INPUT',
    );
  }
  assertUntouched(fixture, before, 'after the adoption refusals');
});

// Invariant: an unknown, empty or non-string `adoption` value is refused; the two documented
// values are the only ones.
test('an unknown adoption value is refused', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const before = stateBytes(fixture);
  for (const adoption of [
    'resume',
    'partial-diff',
    'plan-pr',
    '',
    null,
    1,
    ['partial-diff-resume'],
  ]) {
    expectError(
      await call('worktree transition', bareResume(fixture, { adoption })),
      'INVALID_INPUT',
    );
  }
  assertUntouched(fixture, before, 'after the unknown values');
});

// Invariant: `partial-diff-resume` forbids `fetchedHeadOid` (the plan-PR continuation proof).
test('the resume adoption forbids fetchedHeadOid', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const before = stateBytes(fixture);
  expectError(
    await call(
      'worktree transition',
      bareResume(fixture, { fetchedHeadOid: fixture.worktree.head }),
    ),
    'INVALID_INPUT',
  );
  assertUntouched(fixture, before);
});

// Invariant: `partial-diff-resume` requires `branch`, `workflow` and `visibility`, each of them.
for (const key of ['branch', 'workflow', 'visibility']) {
  test(`the resume adoption requires ${key}`, async (t) => {
    const fixture = await failedAfterGroupOne(t);
    const before = stateBytes(fixture);
    expectError(
      await call('worktree transition', bareResume(fixture, { [key]: undefined })),
      'INVALID_INPUT',
    );
    assertUntouched(fixture, before);
  });
}

// Invariant: `visibility` exists only with the resume adoption: forbidden with the plan-PR
// continuation (explicit or default), with a release and with a plain transition; a value outside
// `visible`/`hidden` is refused.
test('visibility is forbidden outside the resume adoption', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const before = stateBytes(fixture);
  const head = fixture.worktree.head;
  const inputs = [
    bareResume(fixture, { adoption: 'plan-pr-continuation', fetchedHeadOid: head }),
    bareResume(fixture, { adoption: undefined, fetchedHeadOid: head }),
    bareResume(fixture, { adoption: undefined, to: 'cleanup-ready', visibility: 'visible' }),
    { ...releaseInput(fixture), visibility: 'visible' },
    bareResume(fixture, { adoption: undefined, from: 'active', to: 'failed', reason: 'x' }),
    bareResume(fixture, { visibility: 'public' }),
    bareResume(fixture, { visibility: true }),
  ];
  for (const input of inputs) {
    expectError(await call('worktree transition', input), 'INVALID_INPUT');
  }
  assertUntouched(fixture, before);
});

// Invariant (default behavior): without `adoption`, and with the explicit default, a
// `partial-diff` record is judged by the plan-PR continuation proofs and refused as `purpose`
// alone; the resume proofs never run and nothing changes.
test('the default adoption is the plan-PR continuation and refuses partial-diff as purpose', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const before = stateBytes(fixture);
  for (const adoption of [undefined, 'plan-pr-continuation']) {
    const input = bareResume(fixture, {
      adoption,
      visibility: undefined,
      fetchedHeadOid: fixture.worktree.head,
    });
    const refused = expectOutcome(await call('worktree transition', input), 'NOT_ELIGIBLE');
    assert.deepEqual(refused.proofs, ['purpose']);
    assert.equal(refused.unevaluated, undefined);
  }
  assertUntouched(fixture, before);
});

// ---------------------------------------------------------------------------------------------
// Single-proof tests: every identifier of RESUME_PROOFS failing alone

// Each scenario makes exactly one resume proof fail and says which proofs the failed prerequisite
// leaves unevaluated. `setup` returns the transition overrides it needs.
const LEDGER_PROOFS_OPEN = [
  'visibility',
  'history',
  'committed-count',
  'index',
  'residual',
  'source',
];
const SINGLE_PROOF = [
  {
    id: 'purpose',
    setup: (fixture) => {
      rewriteRecord(fixture, (record) => {
        record.purpose = 'delivery';
        record.receipt.purpose = 'delivery';
      });
    },
  },
  {
    id: 'workflow',
    name: 'the input names another workflow',
    inputOnly: true,
    setup: () => ({ workflow: 'build' }),
  },
  {
    id: 'workflow',
    name: 'the record belongs to another workflow',
    setup: (fixture) => {
      rewriteRecord(fixture, (record) => {
        record.workflow = 'build';
        record.receipt.workflow = 'build';
      });
    },
  },
  {
    id: 'branch',
    inputOnly: true,
    setup: () => ({ branch: 'effective-flow/partial-diff/another' }),
  },
  {
    id: 'condition-2',
    setup: (fixture) => {
      rewriteRecord(fixture, (record) => {
        record.receipt.executionRoot = join(fixture.root, 'elsewhere');
      });
    },
  },
  {
    id: 'condition-4',
    name: 'the worktree is locked',
    unevaluated: ['index', 'residual'],
    setup: (fixture) => {
      git(fixture.root, 'worktree', 'lock', fixture.worktree.worktreePath);
    },
  },
  {
    id: 'condition-5',
    name: 'HEAD is detached from the branch',
    setup: (fixture) => {
      git(fixture.worktree.worktreePath, 'checkout', '-q', '--detach');
    },
  },
  {
    id: 'condition-6',
    name: 'the creation OID is a commit that is no ancestor of the tip',
    unevaluated: ['history'],
    setup: (fixture) => {
      const tree = git(fixture.root, 'rev-parse', 'HEAD^{tree}');
      const orphan = git(fixture.root, 'commit-tree', tree, '-m', 'unrelated');
      rewriteRecord(
        fixture,
        (record) => {
          record.creationOid = orphan;
        },
        {
          creationOid: orphan,
          base: { ...readLedgerFile(fixture).base, oid: orphan },
        },
      );
    },
  },
  {
    id: 'visibility',
    setup: () => ({ visibility: 'hidden' }),
  },
  {
    id: 'ledger',
    name: 'no ledger is bound',
    unevaluated: LEDGER_PROOFS_OPEN,
    setup: (fixture) => {
      rmSync(ledgerFile(fixture));
    },
  },
  {
    id: 'ledger',
    name: 'the ledger is bound to another record',
    unevaluated: LEDGER_PROOFS_OPEN,
    setup: (fixture) => {
      rewriteLedger(fixture, (ledger) => {
        ledger.recordId = 'record-9';
      });
    },
  },
  {
    id: 'history',
    name: 'an extra commit follows the recorded one',
    setup: (fixture) => {
      git(
        fixture.worktree.worktreePath,
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        'stray',
      );
    },
  },
  {
    id: 'history',
    name: 'the recorded commit was amended',
    setup: (fixture) => {
      git(fixture.worktree.worktreePath, 'commit', '-q', '--amend', '-m', 'amended');
    },
  },
  {
    id: 'committed-count',
    name: 'no group is provably on the branch',
    fresh: async (t) => {
      const fixture = await delivery(t);
      expectOk(await call('ledger init', initInput(fixture)));
      await failRecord(fixture);
      return fixture;
    },
    setup: () => {},
  },
  {
    id: 'index',
    setup: (fixture) => {
      const worktree = fixture.worktree.worktreePath;
      write(worktree, 'b.txt', 'staged other\n');
      git(worktree, 'add', '--', 'b.txt');
      write(worktree, 'b.txt', 'b changed\n');
    },
  },
  {
    id: 'residual',
    setup: (fixture) => {
      write(fixture.worktree.worktreePath, 'b.txt', 'edited\n');
    },
  },
  {
    id: 'source',
    setup: (fixture) => {
      write(fixture.root, 'b.txt', 'source edited\n');
    },
  },
];

// Invariant (single-proof): each stable proof identifier, failing alone, is NOT_ELIGIBLE with
// exactly that identifier in `proofs` (plus the documented `unevaluated` prerequisites it leaves
// open), and the record, ledger, lock and worktree bytes are unchanged; `worktree resume-check`
// reports the same proofs without writing anything.
for (const scenario of SINGLE_PROOF) {
  const label = scenario.name ? ` (${scenario.name})` : '';
  test(`single proof ${scenario.id}${label} refuses alone and writes nothing`, async (t) => {
    const fixture = scenario.fresh ? await scenario.fresh(t) : await failedAfterGroupOne(t);
    const overrides = (await scenario.setup(fixture)) ?? {};
    const before = stateBytes(fixture);
    const refused = expectOutcome(await resume(fixture, overrides), 'NOT_ELIGIBLE');
    assert.deepEqual(refused.proofs, [scenario.id], JSON.stringify(refused));
    assert.deepEqual(
      refused.unevaluated ?? [],
      scenario.unevaluated ?? [],
      JSON.stringify(refused),
    );
    assertUntouched(fixture, before, scenario.id);
    const check = expectOk(
      await resumeCheck(fixture, { visibility: overrides.visibility ?? 'visible' }),
    );
    if (scenario.inputOnly) {
      // `resume-check` takes no branch or workflow input: the proof exists only for the adoption.
      assert.equal(check.resumable, true, JSON.stringify(check));
    } else {
      assert.equal(check.resumable, false);
      assert.deepEqual(check.resumeProofs, [scenario.id]);
      assert.deepEqual(check.unevaluated, scenario.unevaluated ?? []);
    }
    assertUntouched(fixture, before, `${scenario.id} (resume-check)`);
    assert.equal(existsSync(lockFile(fixture.root)), false, 'no lock is left behind');
  });
}

// Invariant: an extra tip commit after the recorded one is a tip-recovery candidate; when it fails
// the tip-recovery subset of the append checks, `history` refuses and `recovery` names the failed
// subset (an empty commit changes none of group 2's endpoints: `paths` and `blobs`). With group 1
// already recorded, `committed-count` holds and is not reported.
test('single proof history reports the tip-recovery subset that failed', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  git(
    fixture.worktree.worktreePath,
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'stray',
  );
  const refused = expectOutcome(await resume(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['history']);
  assert.deepEqual(refused.recovery, ['paths', 'blobs'], JSON.stringify(refused));
});

// Invariant (condition-1): the record's status gate is condition-1. A record that is not
// `aborted`/`failed` (here `active`) fails condition-1 alone in `resume-check`; the adoption
// itself refuses it earlier as STATUS_MISMATCH. A record without `effective-flow-created`
// ownership is not a valid record: `resume-check` reports it as `valid: false` with condition-1
// and the adoption is INVALID_STATE; none of them writes.
test('single proof condition-1: an active record and a foreign-ownership record', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  expectOk(await resume(fixture));
  const active = stateBytes(fixture);
  const check = expectOk(await resumeCheck(fixture));
  assert.equal(check.status, 'active');
  assert.deepEqual(check.resumeProofs, ['condition-1']);
  assert.deepEqual(check.unevaluated, []);
  assert.equal(check.resumable, false);
  assert.deepEqual(check.releaseProofs, ['condition-1']);
  assert.deepEqual(stateBytes(fixture), active);
  expectOutcome(await resume(fixture, { sessionId: THIRD_SESSION }), 'STATUS_MISMATCH');
  assert.deepEqual(stateBytes(fixture), active);

  const foreign = await failedAfterGroupOne(t);
  rewriteRecord(foreign, (record) => {
    record.ownership = 'adopted';
  });
  const before = stateBytes(foreign);
  const invalid = expectOk(await resumeCheck(foreign));
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.resumeProofs, ['condition-1']);
  assert.deepEqual(invalid.releaseProofs, ['condition-1']);
  assert.equal(invalid.resumable, false);
  expectError(await resume(foreign), 'INVALID_STATE');
  assert.deepEqual(stateBytes(foreign), before);
});

// Invariant (condition-3): registration and linkage cannot fail alone. A worktree whose
// registration is gone has no linked checkout to prove: its common directory (condition-4) and
// its registered HEAD (condition-5) fail with it, as does the checkout proof of condition-2. The
// minimal set is asserted exactly, with the worktree
// proofs `index` and `residual` left unevaluated and nothing written.
test('single proof condition-3: a lost registration fails its dependent conditions with it', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const admin = join(commonDir(fixture.root), 'worktrees');
  for (const name of readdirNames(admin))
    rmSync(join(admin, name), { recursive: true, force: true });
  const before = {
    record: readFileSync(recordFile(fixture.root), 'utf8'),
    ledger: readFileSync(ledgerFile(fixture), 'utf8'),
  };
  const refused = expectOutcome(await resume(fixture), 'NOT_ELIGIBLE');
  assert.ok(refused.proofs.includes('condition-3'), JSON.stringify(refused));
  assert.deepEqual(
    refused.proofs,
    ['condition-2', 'condition-3', 'condition-4', 'condition-5'],
    JSON.stringify(refused),
  );
  assert.deepEqual(
    refused.proofs.filter((proof) => !proof.startsWith('condition-')),
    [],
    'no other family of proof fails with it',
  );
  assert.ok(['index', 'residual'].every((proof) => refused.unevaluated.includes(proof)));
  assert.equal(readFileSync(recordFile(fixture.root), 'utf8'), before.record);
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), before.ledger);
  assert.equal(existsSync(lockFile(fixture.root)), false);
});

function readdirNames(directory) {
  return spawnSync('ls', ['-1', directory]).stdout.toString().split('\n').filter(Boolean);
}

// Invariant (condition-9): a record lock held by another actor is condition-9 alone in
// `resume-check` (the adoption never reaches the proofs: LOCK_HELD, the lock never broken).
test('single proof condition-9: a foreign lock is condition-9 alone and never broken', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  mkdirSync(lockFile(fixture.root), { mode: 0o700 });
  writeFileSync(
    join(lockFile(fixture.root), 'owner'),
    `${JSON.stringify({ token: 'e'.repeat(32), operation: 'worktree transition' })}\n`,
  );
  const before = stateBytes(fixture);
  const check = expectOk(await resumeCheck(fixture));
  assert.deepEqual(check.resumeProofs, ['condition-9']);
  assert.deepEqual(check.unevaluated, []);
  assert.deepEqual(stateBytes(fixture), before);
  expectOutcome(await resume(fixture), 'LOCK_HELD');
  assert.deepEqual(stateBytes(fixture), before);
});

// ---------------------------------------------------------------------------------------------
// Adoption writes

// Invariant (adoption writes): the adoption rewrites exactly `status`, `reason`, `updatedAt`
// (pinned clock) and `sessionId`; `creationOid`, the receipt and the ledger do not change, and
// nothing is written before every proof passed (at `resumeProven` the ledger and record are
// still the failed run's). An `aborted` record resumes the same way.
for (const via of ['failed', 'aborted']) {
  test(`resume of a ${via} record rewrites only status, reason, updatedAt and sessionId`, async (t) => {
    const fixture = await delivery(t);
    expectOk(await call('ledger init', initInput(fixture)));
    expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
    if (via === 'failed') await failRecord(fixture);
    else {
      await failBy(fixture, SESSION);
      rewriteRecord(fixture, (record) => {
        record.status = 'aborted';
      });
    }
    const recordBefore = readRecord(fixture.root);
    const ledgerBefore = readFileSync(ledgerFile(fixture), 'utf8');
    let atProven = null;
    const resumed = expectOk(
      await resume(
        fixture,
        { from: via },
        {
          now: () => PINNED,
          onPhase: (name) => {
            if (name === 'resumeProven') {
              atProven = {
                record: readRecord(fixture.root),
                ledger: readFileSync(ledgerFile(fixture), 'utf8'),
              };
            }
          },
        },
      ),
    );
    assert.deepEqual(atProven, { record: recordBefore, ledger: ledgerBefore });
    assert.equal(resumed.from, via);
    const record = readRecord(fixture.root);
    assert.equal(record.updatedAt, PINNED_ISO);
    const changed = Object.keys(record).filter(
      (key) => JSON.stringify(record[key]) !== JSON.stringify(recordBefore[key]),
    );
    assert.deepEqual(changed.sort(), ['reason', 'sessionId', 'status', 'updatedAt']);
    assert.equal(record.status, 'active');
    assert.equal(record.reason, null);
    assert.equal(record.sessionId, OTHER_SESSION);
    assert.deepEqual(record.receipt, recordBefore.receipt);
    assert.equal(record.creationOid, recordBefore.creationOid);
    assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), ledgerBefore);
  });
}

// Invariant (write order and lock check): a recovered tip is appended to the ledger before the
// record is written, and `lockStillOwned` is checked before each write: with three checks in a
// recovering adoption (before the ledger write, at its rename, at the record's rename) and one in
// a plain adoption (the record's rename), each followed by the observation of the lock's release.
// A lock lost at any of them writes nothing after it.
test('a recovering adoption checks the lock before the ledger write and before the record write', async (t) => {
  const counted = await delivery(t);
  expectOk(await call('ledger init', initInput(counted)));
  commitGroup(counted, ['a.txt']);
  await failRecord(counted);
  const probe = lockLoss(counted, Number.POSITIVE_INFINITY);
  expectOk(await resume(counted, {}, probe.extra));
  assert.ok(probe.state.seen >= 3, `three write checks after the proofs, saw ${probe.state.seen}`);
  assert.equal(readLedgerFile(counted).commits.length, 1);

  for (const loseAt of [1, 2, 3]) {
    const fixture = await delivery(t);
    expectOk(await call('ledger init', initInput(fixture)));
    const first = commitGroup(fixture, ['a.txt']);
    await failRecord(fixture);
    const recordBefore = readFileSync(recordFile(fixture.root), 'utf8');
    const ledgerBefore = readFileSync(ledgerFile(fixture), 'utf8');
    const loss = lockLoss(fixture, loseAt);
    expectError(await resume(fixture, {}, loss.extra), 'WRITE_FAILED');
    assert.equal(
      readFileSync(recordFile(fixture.root), 'utf8'),
      recordBefore,
      `record, lost at ${loseAt}`,
    );
    if (loseAt < 3) {
      assert.equal(
        readFileSync(ledgerFile(fixture), 'utf8'),
        ledgerBefore,
        `ledger, lost at ${loseAt}`,
      );
    } else {
      // The ledger append landed first; the record write did not.
      assert.deepEqual(readLedgerFile(fixture).commits, [{ group: 0, oid: first }]);
      // Idempotent: the next resume finds the ledger equal to the history and succeeds.
      const again = expectOk(await resume(fixture));
      assert.equal(again.resume.recovered, null);
      assert.deepEqual(again.resume.committed, [{ group: 0, oid: first }]);
      assert.equal(readRecord(fixture.root).status, 'active');
      assert.deepEqual(readLedgerFile(fixture).commits, [{ group: 0, oid: first }]);
    }
  }
});

// Invariant: with nothing to recover, the one write is the record, behind its own lock check.
test('a plain adoption checks the lock before the record write', async (t) => {
  const counted = await failedAfterGroupOne(t);
  const probe = lockLoss(counted, Number.POSITIVE_INFINITY);
  expectOk(await resume(counted, {}, probe.extra));
  assert.ok(probe.state.seen >= 1, `a write check after the proofs, saw ${probe.state.seen}`);
  const fixture = await failedAfterGroupOne(t);
  const before = stateBytes(fixture);
  expectError(await resume(fixture, {}, lockLoss(fixture, 1).extra), 'WRITE_FAILED');
  assert.equal(stateBytes(fixture).record, before.record);
  assert.equal(stateBytes(fixture).ledger, before.ledger);
});

// ---------------------------------------------------------------------------------------------
// Resume check, further

// Invariant (read-only, tip recovery): with an unrecorded tip commit, `resume-check` evaluates
// the recovery and every release proof and reports `recoveredTip`, while the record, ledger, lock
// owner and worktree stay byte-identical; a foreign lock stays and is condition-9 of both proof
// sets without hiding the recovery.
test('resume-check of an unrecorded tip is read-only, with and without a foreign lock', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  const first = commitGroup(fixture, ['a.txt']);
  await failRecord(fixture);
  const before = stateBytes(fixture);
  const check = expectOk(await resumeCheck(fixture));
  assert.equal(check.resumable, true, JSON.stringify(check));
  assert.equal(check.recoveredTip, first);
  assert.equal(check.committed, 1);
  assert.equal(check.next, 1);
  assert.equal(check.remaining, 1);
  assert.equal(check.releasable, true);
  assert.equal(check.releaseRoute, 'ledger');
  assert.deepEqual(stateBytes(fixture), before);

  mkdirSync(lockFile(fixture.root), { mode: 0o700 });
  writeFileSync(
    join(lockFile(fixture.root), 'owner'),
    `${JSON.stringify({ token: 'd'.repeat(32), operation: 'worktree transition' })}\n`,
  );
  const locked = stateBytes(fixture);
  const held = expectOk(await resumeCheck(fixture));
  assert.deepEqual(held.resumeProofs, ['condition-9']);
  assert.deepEqual(held.releaseProofs, ['condition-9']);
  assert.equal(held.recoveredTip, first);
  assert.deepEqual(stateBytes(fixture), locked);
});

// Invariant: a hook-staged next group is reported as `hookStaged` and the check leaves the index
// exactly as it found it.
test('resume-check reports a hook-staged group without touching the index', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  git(fixture.worktree.worktreePath, 'add', '--', 'b.txt');
  const before = stateBytes(fixture);
  const indexBefore = git(fixture.worktree.worktreePath, 'ls-files', '--stage');
  const check = expectOk(await resumeCheck(fixture));
  assert.equal(check.hookStaged, true);
  assert.equal(check.resumable, true);
  assert.equal(git(fixture.worktree.worktreePath, 'ls-files', '--stage'), indexBefore);
  assert.deepEqual(stateBytes(fixture), before);
});

// Invariant: a record without a ledger is reported for release only, whatever its source; a clean
// worktree without a ledger releases through the `clean` route, and `source` stays null.
test('resume-check of a clean ledger-less record offers the clean release route only', async (t) => {
  const fixture = await delivery(t);
  await failRecord(fixture);
  git(fixture.worktree.worktreePath, 'checkout', '--', 'a.txt', 'b.txt');
  const before = stateBytes(fixture);
  const check = expectOk(await resumeCheck(fixture));
  assert.equal(check.hasLedger, false);
  assert.equal(check.source, null);
  assert.equal(check.resumable, false);
  assert.deepEqual(check.resumeProofs, ['ledger']);
  assert.equal(check.releasable, true);
  assert.equal(check.releaseRoute, 'clean');
  assert.deepEqual([check.releasePaths, check.releasePathCount], [[], 0]);
  assert.deepEqual(stateBytes(fixture), before);
});

// Invariant (release paths): an eligible `ledger` release route names exactly the residual dirty
// paths a release would discard, read-only; the `gone` route and a refused route name none.
test('resume-check names the paths an eligible ledger release discards', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const before = stateBytes(fixture);
  const check = expectOk(await resumeCheck(fixture));
  assert.equal(check.releaseRoute, 'ledger');
  assert.equal(check.releasable, true);
  assert.deepEqual([check.releasePaths, check.releasePathCount], [['b.txt'], 1]);
  assert.deepEqual(stateBytes(fixture), before, 'resume-check changed nothing');

  write(fixture.worktree.worktreePath, 'extra.txt', 'not selected\n');
  const refused = expectOk(await resumeCheck(fixture));
  assert.equal(refused.releasable, false);
  assert.deepEqual([refused.releasePaths, refused.releasePathCount], [[], 0]);

  git(fixture.root, 'worktree', 'remove', '--force', fixture.worktree.worktreePath);
  const gone = expectOk(await resumeCheck(fixture));
  assert.equal(gone.releaseRoute, 'gone');
  assert.equal(gone.releasable, true);
  assert.deepEqual([gone.releasePaths, gone.releasePathCount], [[], 0]);
});

// Invariant: `source.root` is the ledger manifest's source root, here a linked worktree that is
// not the runtime-state root.
test('resume-check reports the ledger manifest source root of a linked source', async (t) => {
  const fixture = await linkedDelivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  await failRecord(fixture);
  const check = expectOk(await resumeCheck(fixture));
  assert.deepEqual(check.source, { root: fixture.source });
  assert.equal(check.resumable, true, JSON.stringify(check));
  assert.equal(expectOk(await resume(fixture)).resume.sourceRoot, fixture.source);
});

// ---------------------------------------------------------------------------------------------
// ledger reconcile

// An `active` delivery with `a.txt` committed as group 0 but with content (or a mode) other than
// its descriptor, recorded in the ledger by hand: the state `ledger reconcile` must flag.
async function committedDifferently(t, change) {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  change(fixture.worktree.worktreePath);
  const first = commitGroup(fixture, ['a.txt']);
  rewriteLedger(fixture, (ledger) => {
    ledger.commits = [{ group: 0, oid: first }];
  });
  return fixture;
}

// Invariant (reconcile exactness): a freshly initialised active delivery and a resumed one are
// exact; the reconcile writes nothing.
test('ledger reconcile is exact for a fresh delivery and writes nothing', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  const before = stateBytes(fixture);
  const result = expectOk(await reconcile(fixture, SESSION));
  assert.equal(result.exact, true, JSON.stringify(result));
  assert.equal(result.next, 0);
  assert.equal(result.remaining, 2);
  assert.deepEqual(stateBytes(fixture), before);
});

// Invariant (committed endpoints by blob OID and mode): a committed endpoint whose blob differs
// from its descriptor, or whose mode does, is a `committed` mismatch; nothing else is flagged.
test('ledger reconcile detects a committed endpoint mismatch by blob OID and by mode', async (t) => {
  const byBlob = await committedDifferently(t, (worktree) => write(worktree, 'a.txt', 'a other\n'));
  const blob = expectOk(await reconcile(byBlob, SESSION));
  assert.equal(blob.exact, false);
  assert.deepEqual(blob.mismatches.committed, { paths: ['a.txt'], count: 1 });
  assert.deepEqual(
    [
      blob.mismatches.residual.count,
      blob.mismatches.index.count,
      blob.mismatches.extra.count,
      blob.mismatches.sourceDrift,
    ],
    [0, 0, 0, 0],
  );
  const byMode = await committedDifferently(t, (worktree) =>
    chmodSync(join(worktree, 'a.txt'), 0o755),
  );
  const mode = expectOk(await reconcile(byMode, SESSION));
  assert.equal(mode.exact, false);
  assert.deepEqual(mode.mismatches.committed, { paths: ['a.txt'], count: 1 });
});

// Invariant: residual content, the index, extra paths and source drift are each detected, each
// flagged in its own list only.
test('ledger reconcile detects residual, index, extra and source drift separately', async (t) => {
  const cases = [
    ['residual', (fixture) => write(fixture.worktree.worktreePath, 'b.txt', 'edited\n')],
    [
      'index',
      (fixture) => {
        const worktree = fixture.worktree.worktreePath;
        write(worktree, 'b.txt', 'staged other\n');
        git(worktree, 'add', '--', 'b.txt');
        write(worktree, 'b.txt', 'b changed\n');
      },
    ],
    ['extra', (fixture) => write(fixture.worktree.worktreePath, 'extra.txt', 'x\n')],
    ['sourceDrift', (fixture) => write(fixture.root, 'b.txt', 'source edited\n')],
  ];
  for (const [list, change] of cases) {
    const fixture = await delivery(t);
    expectOk(await call('ledger init', initInput(fixture)));
    change(fixture);
    const before = stateBytes(fixture);
    const result = expectOk(await reconcile(fixture, SESSION));
    assert.equal(result.exact, false, list);
    for (const name of ['committed', 'residual', 'index', 'extra']) {
      const expected = name === list ? 1 : 0;
      assert.equal(result.mismatches[name].count, expected, `${list}: ${name}`);
    }
    assert.equal(result.mismatches.sourceDrift, list === 'sourceDrift' ? 1 : 0, list);
    assert.deepEqual(stateBytes(fixture).ledger, before.ledger);
  }
});

// Invariant (ownership and status): only the owning session of an `active` record reconciles.
test('ledger reconcile refuses a non-owner and a non-active record', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  const before = stateBytes(fixture);
  expectOutcome(await reconcile(fixture, OTHER_SESSION), 'NOT_OWNER');
  await failRecord(fixture);
  const failed = stateBytes(fixture);
  expectOutcome(await reconcile(fixture, SESSION), 'STATUS_MISMATCH');
  expectOutcome(await reconcile(fixture, OTHER_SESSION), 'STATUS_MISMATCH');
  assert.deepEqual(stateBytes(fixture).ledger, before.ledger);
  assert.deepEqual(stateBytes(fixture), failed);
});

// Invariant: the reconcile never recovers a tip (only the adoption does): an unrecorded tip commit
// is a `history` refusal, as is a missing ledger.
test('ledger reconcile refuses an unrecorded tip and a missing ledger', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  commitGroup(fixture, ['a.txt']);
  const refused = expectOutcome(await reconcile(fixture, SESSION), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['history']);
  rmSync(ledgerFile(fixture));
  const missing = expectOutcome(await reconcile(fixture, SESSION), 'NOT_ELIGIBLE');
  assert.deepEqual(missing.proofs, ['ledger']);
});

// ---------------------------------------------------------------------------------------------
// In-worktree Git safety, with a separate linked source worktree

// Invariant (in-worktree Git safety): for the resume adoption, `resume-check` and `ledger
// reconcile`, the first Git call inside the recorded worktree and inside the linked source
// worktree is the common-directory probe, and every other call inside either carries `-c
// core.fsmonitor=false`.
test('every in-worktree and source-worktree Git call of the resume operations is guarded', async (t) => {
  const probe = ['rev-parse', '--path-format=absolute', '--git-common-dir'];
  const fixture = await linkedDelivery(t, { threeWay: true });
  expectOk(await call('ledger init', initInput(fixture)));
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  await failRecord(fixture);
  const worktree = fixture.worktree.worktreePath;
  const recorder = () => {
    const calls = [];
    return {
      calls,
      runner: async (request) => {
        calls.push(request.args);
        return processRunner(request);
      },
    };
  };
  const isProbe = (args) => args.slice(2).join(' ') === probe.join(' ');
  const assertGuarded = (calls, root, label) => {
    const scoped = calls.filter((args) => args[0] === '-C' && args[1] === root);
    assert.ok(scoped.filter((args) => !isProbe(args)).length > 0, `${label} ran Git in ${root}`);
    assert.deepEqual(scoped[0].slice(2), probe, `${label}: the first call is the probe`);
    for (const args of scoped) {
      if (isProbe(args)) continue;
      assert.deepEqual(
        args.slice(2, 4),
        ['-c', 'core.fsmonitor=false'],
        `${label}: ${args.join(' ')}`,
      );
    }
  };
  const check = recorder();
  expectOk(await resumeCheck(fixture, {}, { runner: check.runner }));
  assertGuarded(check.calls, worktree, 'resume-check');
  assertGuarded(check.calls, fixture.source, 'resume-check (source)');
  const adoption = recorder();
  expectOk(await resume(fixture, {}, { runner: adoption.runner }));
  assertGuarded(adoption.calls, worktree, 'resume adoption');
  assertGuarded(adoption.calls, fixture.source, 'resume adoption (source)');
  const reconciled = recorder();
  expectOk(await reconcile(fixture, OTHER_SESSION, { runner: reconciled.runner }));
  assertGuarded(reconciled.calls, worktree, 'ledger reconcile');
  assertGuarded(reconciled.calls, fixture.source, 'ledger reconcile (source)');
});

// ---------------------------------------------------------------------------------------------
// End to end

// Completes the delivery after a resume: the second group is committed with plain Git and
// recorded by the resuming session, then the owner removes the clean worktree. The record and the
// ledger are gone and the branch keeps both commits.
async function completeAndRemove(fixture, groupTwo, sessionId = OTHER_SESSION, paths = ['b.txt']) {
  const second = commitGroup(fixture, paths, groupTwo);
  const appended = expectOk(await append(fixture, second, sessionId));
  assert.equal(appended.remaining, 0);
  assert.equal(status(fixture.worktree.worktreePath), '');
  const removed = expectOk(
    await call('worktree remove', {
      cwd: fixture.root,
      executionRoot: fixture.root,
      sessionId,
      recordIds: [fixture.record.recordId],
    }),
  );
  assert.equal(removed.items[0].ok, true, JSON.stringify(removed));
  assert.equal(existsSync(recordFile(fixture.root)), false);
  assert.equal(existsSync(ledgerFile(fixture)), false);
  assert.equal(existsSync(fixture.worktree.worktreePath), false);
  assert.equal(git(fixture.root, 'rev-parse', `refs/heads/${fixture.worktree.branch}`), second);
  return second;
}

// Invariant (the issue's scenario, to completion): group 1 committed and recorded, the run fails,
// a new session adopts, the rerun reconcile is exact, group 2 is committed and recorded, and the
// record completes through `worktree remove` with the ledger deleted and the branch kept.
test('end to end: a failure after group 1, a new session resumes and completes the delivery', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const resumed = expectOk(await resume(fixture, { sessionId: THIRD_SESSION }));
  assert.equal(resumed.resume.next, 1);
  assert.equal(expectOk(await reconcile(fixture, THIRD_SESSION)).exact, true);
  const second = await completeAndRemove(fixture, 'group 2', THIRD_SESSION);
  assert.equal(git(fixture.root, 'rev-parse', `${second}~1`), fixture.first);
});

// Invariant (a): a committed rename in group 1 is verified by blob OID and tombstone, stays exact
// after the resume (never re-planned), and the delivery completes.
test('end to end: a committed rename in group 1 resumes and stays exact', async (t) => {
  const fixture = await delivery(t, {
    rename: { from: 'old.txt', to: 'new.txt', base: RENAME_BASE, content: `${RENAME_BASE}five\n` },
  });
  expectOk(
    await call(
      'ledger init',
      initInput(fixture, {
        groups: [
          ['new.txt', 'old.txt'],
          ['a.txt', 'b.txt'],
        ],
      }),
    ),
  );
  expectOk(await append(fixture, commitGroup(fixture, ['new.txt', 'old.txt'], 'rename')));
  await failRecord(fixture);
  const check = expectOk(await resumeCheck(fixture));
  assert.equal(check.resumable, true, JSON.stringify(check));
  const resumed = expectOk(await resume(fixture));
  assert.deepEqual(resumed.resume.remainingGroups, [{ group: 1, paths: ['a.txt', 'b.txt'] }]);
  const reconciled = expectOk(await reconcile(fixture));
  assert.equal(reconciled.exact, true, JSON.stringify(reconciled));
  await completeAndRemove(fixture, 'group 2', OTHER_SESSION, ['a.txt', 'b.txt']);
});

// Invariant (b): when the base moved before the first run's transfer, a residual (and a committed
// entry) merged three-way is accepted from the persisted descriptors; the reconcile stays exact.
test('end to end: three-way base drift resumes and stays exact', async (t) => {
  const fixture = await linkedDelivery(t, { threeWay: true });
  assert.equal(
    readFileSync(join(fixture.worktree.worktreePath, 'a.txt'), 'utf8'),
    MULTILINE.replace('one', 'ONE').replace('five', 'FIVE'),
    'the transfer merged three-way',
  );
  expectOk(await call('ledger init', initInput(fixture, { groups: [['b.txt'], ['a.txt']] })));
  expectOk(await append(fixture, commitGroup(fixture, ['b.txt'])));
  await failRecord(fixture);
  const resumed = expectOk(await resume(fixture));
  assert.deepEqual(resumed.resume.remainingGroups, [{ group: 1, paths: ['a.txt'] }]);
  assert.equal(expectOk(await reconcile(fixture)).exact, true);
  await completeAndRemove(fixture, 'group 2', OTHER_SESSION, ['a.txt']);

  // The merged entry committed in group 1 stays exact the same way.
  const committed = await linkedDelivery(t, { threeWay: true });
  expectOk(await call('ledger init', initInput(committed)));
  expectOk(await append(committed, commitGroup(committed, ['a.txt'])));
  await failRecord(committed);
  expectOk(await resume(committed));
  assert.equal(expectOk(await reconcile(committed)).exact, true);
});

// Invariant (c): a commit rejected by a hook leaves exactly the first uncommitted group staged;
// the resume accepts it as `hookStaged`, unstages exactly that group itself and names the index
// entry each path was proven to hold (`hookStagedEntries`, exactly what `ls-files -s` reported),
// the working tree keeps the group's bytes, the reconcile is exact with nothing staged, and the
// group commits and records. Any other staged content refuses, and so does a recovered tip with
// the next group staged.
test('end to end: a hook-rejected staged group resumes; other staged content is refused', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const worktree = fixture.worktree.worktreePath;
  git(worktree, 'add', '--', 'b.txt');
  rejectedCommit(t, worktree);
  assert.equal(readRecord(fixture.root).status, 'failed', "the record is the failed run's");
  const [mode, oid] = git(worktree, 'ls-files', '-s', '--', 'b.txt').split(/\s+/);
  const resumed = expectOk(await resume(fixture));
  assert.equal(resumed.resume.hookStaged, true);
  assert.equal(resumed.resume.recovered, null);
  assert.deepEqual(resumed.resume.hookStagedEntries, [{ path: 'b.txt', mode, oid }]);
  assert.equal(git(worktree, 'diff', '--cached', '--name-only'), '', 'the group is unstaged');
  assert.equal(readFileSync(join(worktree, 'b.txt'), 'utf8'), 'b changed\n');
  assert.deepEqual(resumed.resume.remainingGroups, [{ group: 1, paths: ['b.txt'] }]);
  const reconciled = expectOk(await reconcile(fixture));
  assert.equal(reconciled.exact, true);
  assert.deepEqual(reconciled.staged, { paths: [], count: 0 });
  await completeAndRemove(fixture, 'group 2');

  // Anything else staged next to the group.
  const other = await failedAfterGroupOne(t);
  const otherTree = other.worktree.worktreePath;
  git(otherTree, 'add', '--', 'b.txt');
  write(otherTree, 'base.txt', 'changed\n');
  git(otherTree, 'add', '--', 'base.txt');
  const before = stateBytes(other);
  const refused = expectOutcome(await resume(other), 'NOT_ELIGIBLE');
  assert.ok(refused.proofs.includes('index'), JSON.stringify(refused));
  assertUntouched(other, before);

  // Only part of the group staged is not "exactly the group" either: a one-file group with a
  // second, unrelated staged path was refused above; a recovered tip with the next group staged:
  const recovered = await delivery(t);
  expectOk(await call('ledger init', initInput(recovered)));
  commitGroup(recovered, ['a.txt']);
  await failRecord(recovered);
  git(recovered.worktree.worktreePath, 'add', '--', 'b.txt');
  const beforeRecovered = stateBytes(recovered);
  const both = expectOutcome(await resume(recovered), 'NOT_ELIGIBLE');
  assert.deepEqual(both.proofs, ['index']);
  assertUntouched(recovered, beforeRecovered);
});

// Invariant (resume unstage on one locked index snapshot): the adoption unstages the hook-staged
// group on the locked index, and only while that snapshot still stages exactly the group. With
// the staged deletion of `dir/c.txt` in the group, a newer `dir` file staged after the proof (and
// removed from disk), which restoring `dir/c.txt` would drop, refuses the adoption with
// WRITE_FAILED: the newer entry, the record and the ledger stay unchanged. A staging attempted
// while the adoption holds the index lock is refused by Git, and the adoption unstages the group.
test('resume adoption: a parent entry staged beside a staged deletion survives the unstage', async (t) => {
  const staged = async () => {
    const fixture = await delivery(t, { deleted: ['dir/c.txt'] });
    expectOk(
      await call(
        'ledger init',
        initInput(fixture, { groups: [['a.txt'], ['b.txt', 'dir/c.txt']] }),
      ),
    );
    expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
    const worktree = fixture.worktree.worktreePath;
    git(worktree, 'add', '-A', '--', 'b.txt', 'dir/c.txt');
    await failRecord(fixture);
    return { fixture, worktree };
  };
  const stageDir = (worktree) => {
    rmSync(join(worktree, 'dir'), { recursive: true, force: true });
    write(worktree, 'dir', 'newer dir\n');
    const added = spawnSync('git', ['-C', worktree, 'add', '--', 'dir'], {
      env: GIT_ENV,
      encoding: 'utf8',
    });
    rmSync(join(worktree, 'dir'));
    return added;
  };

  const late = await staged();
  const ledger = readFileSync(ledgerFile(late.fixture), 'utf8');
  const record = readFileSync(recordFile(late.fixture.root), 'utf8');
  let added = null;
  const failed = expectError(
    await resume(
      late.fixture,
      {},
      {
        onPhase: (name) => {
          if (name === 'resumeProven') added = stageDir(late.worktree);
        },
      },
    ),
    'WRITE_FAILED',
  );
  assert.equal(added?.status, 0, 'the newer entry is staged after the proof');
  assert.match(failed.message, /no longer stages exactly the next group/);
  assert.equal(git(late.worktree, 'show', ':dir'), 'newer dir', 'the newer entry survives');
  assert.equal(readFileSync(recordFile(late.fixture.root), 'utf8'), record);
  assert.equal(readFileSync(ledgerFile(late.fixture), 'utf8'), ledger);

  const locked = await staged();
  let refused = null;
  const resumed = expectOk(
    await resume(
      locked.fixture,
      {},
      {
        runner: async (request) => {
          if (
            refused === null &&
            request.args[1] === locked.worktree &&
            request.args.includes('restore')
          ) {
            refused = stageDir(locked.worktree);
          }
          return processRunner(request);
        },
      },
    ),
  );
  assert.equal(refused?.status, 128, 'Git refuses the staging under the index lock');
  assert.match(refused.stderr, /index\.lock/);
  assert.equal(resumed.resume.hookStaged, true);
  assert.deepEqual(resumed.resume.hookStagedEntries, [
    { path: 'b.txt', mode: '100644', oid: resumed.resume.hookStagedEntries[0].oid },
    { path: 'dir/c.txt', mode: null, oid: null },
  ]);
  assert.equal(git(locked.worktree, 'diff', '--cached', '--name-only'), '');
  assert.equal(git(locked.worktree, 'ls-files', '--', 'dir'), 'dir/c.txt');
  const reconciled = expectOk(await reconcile(locked.fixture));
  assert.equal(reconciled.exact, true, JSON.stringify(reconciled));
  assert.deepEqual(reconciled.staged, { paths: [], count: 0 });
});

// Invariant (d): one unrecorded tip commit with zero ledger entries is recovered and appended,
// `committed-count` holds, the reconcile is exact and the delivery completes.
test('end to end: one unrecorded tip commit with zero ledger entries is recovered and completes', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  const first = commitGroup(fixture, ['a.txt']);
  await failRecord(fixture);
  assert.equal(readLedgerFile(fixture).commits.length, 0);
  const resumed = expectOk(await resume(fixture));
  assert.equal(resumed.resume.recovered, first);
  assert.deepEqual(readLedgerFile(fixture).commits, [{ group: 0, oid: first }]);
  assert.equal(expectOk(await reconcile(fixture)).exact, true);
  const second = await completeAndRemove(fixture, 'group 2');
  assert.equal(git(fixture.root, 'rev-parse', `${second}~1`), first);
});

// Invariant (e): source drift (a changed selected entry, a moved source HEAD) refuses the resume
// as `source` alone and refuses the ledger-route release too, writing nothing; after the resume,
// the reconcile reports the drift.
test('end to end: source drift is refused by resume and by the ledger-route release', async (t) => {
  const drifts = [
    ['a selected entry changed', (fixture) => write(fixture.root, 'b.txt', 'source edited\n')],
    [
      'the source HEAD moved',
      (fixture) => {
        write(fixture.root, 'unrelated.txt', 'u\n');
        git(fixture.root, 'add', 'unrelated.txt');
        git(fixture.root, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'unrelated');
      },
    ],
  ];
  for (const [name, drift] of drifts) {
    const fixture = await failedAfterGroupOne(t);
    drift(fixture);
    const before = stateBytes(fixture);
    const refused = expectOutcome(await resume(fixture), 'NOT_ELIGIBLE');
    assert.deepEqual(refused.proofs, ['source'], name);
    const released = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
    assert.ok(released.proofs.includes('source'), `${name}: ${JSON.stringify(released)}`);
    assert.deepEqual(stateBytes(fixture), before, name);
  }
  const later = await failedAfterGroupOne(t);
  expectOk(await resume(later));
  write(later.root, 'b.txt', 'source edited\n');
  const result = expectOk(await reconcile(later));
  assert.equal(result.exact, false);
  assert.equal(result.mismatches.sourceDrift, 1);
});

// Invariant (f): a ledger written `visible` refuses a hidden current mode, a ledger written
// `hidden` accepts either, and the result carries the ledger's visibility (hidden stays hidden).
test('end to end: a visibility downgrade is refused, a hidden ledger resumes under visible', async (t) => {
  const downgrade = await failedAfterGroupOne(t);
  const before = stateBytes(downgrade);
  const refused = expectOutcome(await resume(downgrade, { visibility: 'hidden' }), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['visibility']);
  assertUntouched(downgrade, before);
  assert.equal(expectOk(await resumeCheck(downgrade, { visibility: 'hidden' })).releasable, true);

  for (const current of ['visible', 'hidden']) {
    const fixture = await delivery(t);
    expectOk(await call('ledger init', initInput(fixture, { visibility: 'hidden' })));
    expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
    await failRecord(fixture);
    const resumed = expectOk(await resume(fixture, { visibility: current }));
    assert.equal(resumed.resume.visibility, 'hidden', `current ${current}`);
  }
});

// Invariant (g): after a resume that itself failed (record back to `failed`, ledger keeping its
// entries, a group possibly committed meanwhile) a later session resumes again and completes.
test('end to end: a second resume after a failed resume', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  expectOk(await resume(fixture));
  await failBy(fixture, OTHER_SESSION, 'the resumed run failed');
  assert.equal(readRecord(fixture.root).status, 'failed');
  assert.deepEqual(readLedgerFile(fixture).commits, [{ group: 0, oid: fixture.first }]);
  const check = expectOk(await resumeCheck(fixture));
  assert.equal(check.resumable, true, JSON.stringify(check));
  const again = expectOk(await resume(fixture, { sessionId: THIRD_SESSION }));
  assert.equal(again.resume.next, 1);
  assert.equal(readRecord(fixture.root).sessionId, THIRD_SESSION);
  assert.equal(expectOk(await reconcile(fixture, THIRD_SESSION)).exact, true);
  await completeAndRemove(fixture, 'group 2', THIRD_SESSION);
});

// Invariant (h): after a resume cycle, the ledger route of the release restores the residual and
// `cleanup plan`/`cleanup apply` remove worktree, record and ledger and keep the branch at the
// recorded commit.
test('end to end: a ledger-route release after a resume cycle is removed by cleanup, branch kept', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  expectOk(await resume(fixture));
  await failBy(fixture, OTHER_SESSION);
  const released = expectOk(
    await call('worktree transition', releaseInput(fixture, { sessionId: THIRD_SESSION })),
  );
  assert.deepEqual(released.release, { route: 'ledger', restored: ['b.txt'] });
  assert.equal(readRecord(fixture.root).status, 'cleanup-ready');
  assert.equal(status(fixture.worktree.worktreePath), '');
  const plan = expectOk(
    await call('cleanup plan', { cwd: fixture.root, executionRoot: fixture.root }),
  );
  const item = plan.items.find((entry) => entry.itemId === 'worktree:record-1');
  assert.ok(item, JSON.stringify(plan.blocked));
  const applied = expectOk(
    await call('cleanup apply', {
      cwd: fixture.root,
      executionRoot: fixture.root,
      items: { [item.itemId]: item.itemDigest },
    }),
  );
  assert.equal(applied.items[0].ok, true, JSON.stringify(applied));
  assert.equal(existsSync(recordFile(fixture.root)), false);
  assert.equal(existsSync(ledgerFile(fixture)), false);
  assert.equal(existsSync(fixture.worktree.worktreePath), false);
  assert.equal(
    git(fixture.root, 'rev-parse', `refs/heads/${fixture.worktree.branch}`),
    fixture.first,
  );
});

// =============================================================================================
// Review incorporation: tip-recovery boundaries, foreign repositories, the unmerged index, signals,
// the shared resume-check evaluation, the reconcile's staged list and the operation proofs.

// Asserts that a resume of `fixture` is refused with exactly `proofs` and `details` (each key of
// it, `undefined` for an absent one), that `resume-check` reports the same proofs, and that
// neither wrote anything.
async function assertRefusedAlone(fixture, proofs, details = {}) {
  const before = stateBytes(fixture);
  const refused = expectOutcome(await resume(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, proofs, JSON.stringify(refused));
  for (const [key, value] of Object.entries(details)) {
    assert.deepEqual(refused[key], value, `${key}: ${JSON.stringify(refused)}`);
  }
  assertUntouched(fixture, before, proofs.join(','));
  const check = expectOk(await resumeCheck(fixture));
  assert.equal(check.resumable, false);
  assert.deepEqual(check.resumeProofs, proofs, JSON.stringify(check));
  assert.equal(check.recoveredTip, null);
  assertUntouched(fixture, before, `${proofs.join(',')} (resume-check)`);
  assert.equal(existsSync(lockFile(fixture.root)), false);
  return refused;
}

// ---------------------------------------------------------------------------------------------
// Tip-recovery boundaries

// Invariant (at most one tip): two valid group commits the failed run never recorded are no
// recoverable tip: `history` refuses without a tip-recovery subset, and with nothing recovered
// `committed-count` fails with it.
test('tip recovery: two unrecorded group commits with zero ledger entries are refused', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  commitGroup(fixture, ['a.txt'], 'group 1');
  commitGroup(fixture, ['b.txt'], 'group 2');
  await failRecord(fixture);
  await assertRefusedAlone(fixture, ['history', 'committed-count'], { recovery: undefined });
  assert.deepEqual(readLedgerFile(fixture).commits, []);
});

// Invariant (`blobs`): an unrecorded tip that changes exactly the next group's paths but with
// other content fails the tip-recovery subset as `blobs` alone; the working tree holds the
// descriptor's bytes, so nothing else fails.
test('tip recovery: the right paths with the wrong content are refused as blobs', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  const worktree = fixture.worktree.worktreePath;
  write(worktree, 'a.txt', 'a other\n');
  commitGroup(fixture, ['a.txt']);
  write(worktree, 'a.txt', 'a changed\n');
  await failRecord(fixture);
  await assertRefusedAlone(fixture, ['history', 'committed-count'], { recovery: ['blobs'] });
});

// Invariant (`parent`): a merge commit at the tip, whose tree and changed paths are exactly the
// next group's, fails the tip-recovery subset as `parent` alone (its parents are not the one
// previous commit).
test('tip recovery: a merge-commit tip is refused as parent', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  const group = commitGroup(fixture, ['a.txt']);
  const creation = fixture.worktree.head;
  const merge = git(
    fixture.root,
    'commit-tree',
    `${group}^{tree}`,
    '-p',
    creation,
    '-p',
    `${creation}~1`,
    '-m',
    'merge',
  );
  git(fixture.root, 'update-ref', `refs/heads/${fixture.worktree.branch}`, merge, group);
  await failRecord(fixture);
  await assertRefusedAlone(fixture, ['history', 'committed-count'], { recovery: ['parent'] });
});

// Invariant (missing commit): a branch reset below a recorded commit no longer contains the
// ledger's commit: `history` refuses alone (the ledger still counts one committed group).
test('tip recovery: a branch reset below a recorded commit is refused as history', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const worktree = fixture.worktree.worktreePath;
  git(worktree, 'reset', '-q', '--hard', fixture.worktree.head);
  write(worktree, 'b.txt', 'b changed\n');
  await assertRefusedAlone(fixture, ['history'], { recovery: undefined });
  assert.deepEqual(readLedgerFile(fixture).commits, [{ group: 0, oid: fixture.first }]);
});

// Invariant (`index`): of a two-path next group, one path staged is not exactly the group: the
// staged set is refused as `index` alone with the staged path reported.
test('the index proof: a two-path next group with one path staged is refused', async (t) => {
  const fixture = await delivery(t, {
    files: { 'a.txt': 'a changed\n', 'b.txt': 'b changed\n', 'c.txt': 'c changed\n' },
  });
  expectOk(
    await call('ledger init', initInput(fixture, { groups: [['a.txt'], ['b.txt', 'c.txt']] })),
  );
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  await failRecord(fixture);
  git(fixture.worktree.worktreePath, 'add', '--', 'b.txt');
  await assertRefusedAlone(fixture, ['index'], { stagedPaths: ['b.txt'], stagedPathCount: 1 });
});

// ---------------------------------------------------------------------------------------------
// The unmerged index entry

// Invariant (`index`, unmerged): an unmerged entry at a tombstone endpoint of the next group is
// listed by `diff-index` with the absent mode and is never taken for the staged tombstone: the
// otherwise exact hook-staged rename group is refused as `index` (and `residual`, whose inspection
// refuses an unmerged path).
test('the index proof: an unmerged entry at a staged tombstone is no match', async (t) => {
  const fixture = await delivery(t, {
    rename: { from: 'old.txt', to: 'new.txt', base: RENAME_BASE, content: `${RENAME_BASE}five\n` },
  });
  expectOk(
    await call(
      'ledger init',
      initInput(fixture, {
        groups: [
          ['a.txt', 'b.txt'],
          ['new.txt', 'old.txt'],
        ],
      }),
    ),
  );
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt', 'b.txt'])));
  await failRecord(fixture);
  const worktree = fixture.worktree.worktreePath;
  // The control: the rename group staged exactly (the hook-rejected case) resumes.
  git(worktree, 'add', '--', 'new.txt', 'old.txt');
  const exact = expectOk(await resumeCheck(fixture));
  assert.equal(exact.resumable, true, JSON.stringify(exact));
  assert.equal(exact.hookStaged, true);
  // The tombstone endpoint as an unmerged entry instead of the staged deletion.
  const blob = git(worktree, 'rev-parse', 'HEAD:old.txt');
  const unmerged = spawnSync('git', ['-C', worktree, 'update-index', '--index-info'], {
    env: GIT_ENV,
    input: [1, 2, 3].map((stage) => `100644 ${blob} ${stage}\told.txt\n`).join(''),
  });
  assert.equal(unmerged.status, 0, String(unmerged.stderr));
  assert.match(git(worktree, 'ls-files', '--unmerged'), /old\.txt/);
  const refused = await assertRefusedAlone(fixture, ['index', 'residual']);
  assert.deepEqual(refused.stagedPaths, ['new.txt', 'old.txt']);
});

// ---------------------------------------------------------------------------------------------
// Foreign repositories: only the common-directory probe runs there

const PROBE = ['rev-parse', '--path-format=absolute', '--git-common-dir'];

// A foreign repository at `path` (created, or a new temporary directory) whose `core.fsmonitor`
// hook appends to a marker file outside it. The control proves the trap: a plain `git status`
// there runs the hook; the marker is removed again before the test goes on.
function trappedRepository(t, path = null) {
  const root = path ?? realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-foreign-')));
  const traps = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-trap-')));
  t.after(() => {
    if (path === null) rmSync(root, { recursive: true, force: true });
    rmSync(traps, { recursive: true, force: true });
  });
  const marker = join(traps, 'marker');
  const hook = join(traps, 'fsmonitor');
  writeFileSync(hook, `#!/bin/sh\necho ran >> '${marker}'\nexit 1\n`);
  chmodSync(hook, 0o755);
  mkdirSync(root, { recursive: true });
  git(root, 'init', '-q', '--initial-branch=main');
  writeFileSync(join(root, 'f.txt'), 'foreign\n');
  git(root, 'add', 'f.txt');
  git(root, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'foreign');
  git(root, 'config', 'core.fsmonitor', hook);
  spawnSync('git', ['-C', root, 'status', '--porcelain'], { env: GIT_ENV });
  assert.equal(existsSync(marker), true, 'the trap is armed: status runs the fsmonitor hook');
  rmSync(marker);
  return { root, marker };
}

function recordingRunner() {
  const calls = [];
  return {
    calls,
    runner: async (request) => {
      calls.push(request);
      return processRunner(request);
    },
  };
}

// Asserts that of `calls`, those in `root` (by `-C` or `cwd`) are only the common-directory probe,
// at least one of them, and that the trap's marker never appeared.
function assertProbeOnly(calls, trap, label) {
  const inside = calls.filter(
    (request) => request.args[1] === trap.root || request.cwd === trap.root,
  );
  assert.ok(inside.length > 0, `${label}: the probe ran in the foreign repository`);
  for (const request of inside) {
    assert.deepEqual(request.args.slice(2), PROBE, `${label}: ${request.args.join(' ')}`);
  }
  assert.equal(existsSync(trap.marker), false, `${label}: the fsmonitor hook never ran`);
}

// Replaces the recorded worktree directory by a trapped foreign repository at the same path.
function foreignWorktree(t, fixture) {
  const worktree = fixture.worktree.worktreePath;
  renameSync(worktree, `${worktree}-moved`);
  return trappedRepository(t, worktree);
}

// Points the ledger manifest's source root at a trapped foreign repository.
function foreignSource(t, fixture) {
  const trap = trappedRepository(t);
  rewriteLedger(fixture, (ledger) => {
    ledger.manifest.source.root = trap.root;
  });
  return trap;
}

// Invariant (in-worktree Git safety, negative): with the recorded worktree path holding a foreign
// repository, `resume-check`, the resume adoption and `ledger reconcile` run only the
// common-directory probe there, its `core.fsmonitor` hook never runs, and the refusal is
// condition-4 (with the conditions that need the proven worktree), writing nothing.
test('a foreign repository at the worktree path gets only the probe and fails condition-4', async (t) => {
  const failed = await failedAfterGroupOne(t);
  const trap = foreignWorktree(t, failed);
  const record = readFileSync(recordFile(failed.root), 'utf8');
  const ledger = readFileSync(ledgerFile(failed), 'utf8');
  const worktreeProofs = ['condition-2', 'condition-4', 'condition-5'];
  const check = recordingRunner();
  const checked = expectOk(await resumeCheck(failed, {}, { runner: check.runner }));
  assert.deepEqual(checked.resumeProofs, worktreeProofs, JSON.stringify(checked));
  assert.deepEqual(checked.unevaluated, ['index', 'residual']);
  assert.deepEqual(checked.releaseProofs, worktreeProofs);
  assertProbeOnly(check.calls, trap, 'resume-check');
  const adoption = recordingRunner();
  const refused = expectOutcome(
    await resume(failed, {}, { runner: adoption.runner }),
    'NOT_ELIGIBLE',
  );
  assert.deepEqual(refused.proofs, worktreeProofs, JSON.stringify(refused));
  assert.deepEqual(refused.unevaluated, ['index', 'residual']);
  assertProbeOnly(adoption.calls, trap, 'resume adoption');
  assert.equal(readFileSync(recordFile(failed.root), 'utf8'), record);
  assert.equal(readFileSync(ledgerFile(failed), 'utf8'), ledger);

  const active = await delivery(t);
  expectOk(await call('ledger init', initInput(active)));
  const activeTrap = foreignWorktree(t, active);
  const reconciled = recordingRunner();
  const refusedReconcile = expectOutcome(
    await reconcile(active, SESSION, { runner: reconciled.runner }),
    'NOT_ELIGIBLE',
  );
  assert.deepEqual(refusedReconcile.proofs, worktreeProofs, JSON.stringify(refusedReconcile));
  assertProbeOnly(reconciled.calls, activeTrap, 'ledger reconcile');
});

// Invariant (source Git safety, negative): with the ledger manifest's source root at a foreign
// repository, the three operations run only the common-directory probe there and its hook never
// runs: `resume-check` and the adoption refuse `source` alone (the release `source` too), `ledger
// reconcile` refuses `source-root`, and nothing is written.
test('a foreign repository as the source root gets only the probe and fails source', async (t) => {
  const failed = await failedAfterGroupOne(t);
  const trap = foreignSource(t, failed);
  const before = stateBytes(failed);
  const check = recordingRunner();
  const checked = expectOk(await resumeCheck(failed, {}, { runner: check.runner }));
  assert.deepEqual(checked.resumeProofs, ['source'], JSON.stringify(checked));
  assert.deepEqual(checked.releaseProofs, ['source']);
  assert.deepEqual(checked.source, { root: trap.root });
  assertProbeOnly(check.calls, trap, 'resume-check');
  const adoption = recordingRunner();
  const refused = expectOutcome(
    await resume(failed, {}, { runner: adoption.runner }),
    'NOT_ELIGIBLE',
  );
  assert.deepEqual(refused.proofs, ['source'], JSON.stringify(refused));
  assertProbeOnly(adoption.calls, trap, 'resume adoption');
  assertUntouched(failed, before, 'after the foreign source');

  const active = await delivery(t);
  expectOk(await call('ledger init', initInput(active)));
  const activeTrap = foreignSource(t, active);
  const reconciled = recordingRunner();
  const refusedReconcile = expectOutcome(
    await reconcile(active, SESSION, { runner: reconciled.runner }),
    'NOT_ELIGIBLE',
  );
  assert.deepEqual(refusedReconcile.proofs, ['source-root']);
  assertProbeOnly(reconciled.calls, activeTrap, 'ledger reconcile');
});

// ---------------------------------------------------------------------------------------------
// Signals during the resume adoption

// Invariant (signal after the recovered append): a signal that arrives once the recovered tip is
// in the ledger and before the record write skips the record write and reports INTERRUPTED with
// `written: false`, `ledgerAppended: true` and the appended OID; the next resume finds the entry
// recorded and recovers nothing.
test('a signal after the recovered ledger append reports the append and skips the record', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  const first = commitGroup(fixture, ['a.txt']);
  await failRecord(fixture);
  const record = readFileSync(recordFile(fixture.root), 'utf8');
  const signalTarget = new EventEmitter();
  const onPhase = (name) => {
    if (name === 'resumeLedgerAppended') signalTarget.emit('SIGTERM');
  };
  const interrupted = expectOutcome(
    await resume(fixture, {}, { signalTarget, onPhase }),
    'INTERRUPTED',
  );
  assert.deepEqual(
    {
      signal: interrupted.signal,
      written: interrupted.written,
      status: interrupted.status,
      ledgerAppended: interrupted.ledgerAppended,
      appendedOid: interrupted.appendedOid,
    },
    {
      signal: 'SIGTERM',
      written: false,
      status: 'failed',
      ledgerAppended: true,
      appendedOid: first,
    },
  );
  assert.equal(readFileSync(recordFile(fixture.root), 'utf8'), record, 'the record is unchanged');
  assert.deepEqual(readLedgerFile(fixture).commits, [{ group: 0, oid: first }]);
  assert.equal(existsSync(lockFile(fixture.root)), false);
  assert.equal(signalTarget.listenerCount('SIGTERM'), 0, 'the signal handlers are removed');
  const again = expectOk(await resume(fixture));
  assert.equal(again.resume.recovered, null);
  assert.deepEqual(again.resume.committed, [{ group: 0, oid: first }]);
});

// Invariant (signal after the record write): a signal that arrives once the record is written (at
// the lock release) reports INTERRUPTED with `written: true`, the new status and the `resume`
// summary the adoption returns, for a plain and for a recovering adoption alike.
test('a signal after the record write carries the resume summary', async (t) => {
  for (const recovering of [false, true]) {
    const fixture = recovering ? await delivery(t) : await failedAfterGroupOne(t);
    let first = fixture.first;
    if (recovering) {
      expectOk(await call('ledger init', initInput(fixture)));
      first = commitGroup(fixture, ['a.txt']);
      await failRecord(fixture);
    }
    const owner = join(lockFile(fixture.root), 'owner');
    const signalTarget = new EventEmitter();
    const unlink = async (target) => {
      if (target === owner) signalTarget.emit('SIGTERM');
      return fsUnlink(target);
    };
    const interrupted = expectOutcome(
      await resume(fixture, {}, { signalTarget, fs: { unlink } }),
      'INTERRUPTED',
    );
    const label = recovering ? 'recovering' : 'plain';
    assert.equal(interrupted.written, true, label);
    assert.equal(interrupted.status, 'active', label);
    assert.equal(interrupted.ledgerAppended, undefined, label);
    assert.equal(interrupted.resume.recovered, recovering ? first : null, label);
    assert.deepEqual(interrupted.resume.committed, [{ group: 0, oid: first }], label);
    assert.equal(interrupted.resume.next, 1, label);
    assert.deepEqual(
      interrupted.resume.groups,
      [
        { group: 0, paths: ['a.txt'], oid: first },
        { group: 1, paths: ['b.txt'], oid: null },
      ],
      label,
    );
    assert.equal(readRecord(fixture.root).status, 'active', label);
    assert.equal(readRecord(fixture.root).sessionId, OTHER_SESSION, label);
    assert.equal(existsSync(lockFile(fixture.root)), false, label);
  }
});

// ---------------------------------------------------------------------------------------------
// resume-check evaluates the shared checks once

// Invariant (no double work): `resume-check` evaluates the release proofs from the same residual
// inspection and source check as the resume proofs, so the Git calls it runs in the worktree and
// in a linked source are exactly those of the resume adoption's evaluation, with or without a
// recovered tip; its result is unchanged (resumable, ledger-route releasable).
test('resume-check shares one residual inspection and one source check', async (t) => {
  for (const recovering of [false, true]) {
    const fixture = await linkedDelivery(t);
    expectOk(await call('ledger init', initInput(fixture)));
    const commit = commitGroup(fixture, ['a.txt']);
    if (!recovering) expectOk(await append(fixture, commit));
    await failRecord(fixture);
    const scoped = (calls, root) =>
      calls
        .filter((request) => request.args[1] === root)
        .map((request) => request.args.join(' '))
        .sort();
    const check = recordingRunner();
    const checked = expectOk(await resumeCheck(fixture, {}, { runner: check.runner }));
    assert.equal(checked.resumable, true, JSON.stringify(checked));
    assert.equal(checked.releasable, true);
    assert.equal(checked.releaseRoute, 'ledger');
    const adoption = recordingRunner();
    expectOk(await resume(fixture, {}, { runner: adoption.runner }));
    for (const root of [fixture.worktree.worktreePath, fixture.source]) {
      assert.deepEqual(scoped(check.calls, root), scoped(adoption.calls, root), root);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// ledger reconcile reports the staged residual

// Invariant (provable unstaging): `ledger reconcile` reports the staged residual endpoints as
// `staged` ({paths, count}); a residual group staged exactly is exact and listed there, and once
// it is unstaged again, `staged` is empty and the reconcile is still exact.
test('ledger reconcile reports the staged residual so unstaging is provable', async (t) => {
  const fixture = await failedAfterGroupOne(t);
  const worktree = fixture.worktree.worktreePath;
  expectOk(await resume(fixture));
  git(worktree, 'add', '--', 'b.txt');
  const staged = expectOk(await reconcile(fixture));
  assert.equal(staged.exact, true, JSON.stringify(staged));
  assert.deepEqual(staged.staged, { paths: ['b.txt'], count: 1 });
  git(worktree, 'restore', '--staged', '--', 'b.txt');
  const unstaged = expectOk(await reconcile(fixture));
  assert.equal(unstaged.exact, true, JSON.stringify(unstaged));
  assert.deepEqual(unstaged.staged, { paths: [], count: 0 });
});

// ---------------------------------------------------------------------------------------------
// The identifiers outside RESUME_PROOFS

// Invariant: the operation proofs outside RESUME_PROOFS are exactly `repository`, `source-root`
// and `reconcile`, disjoint from it; `resume-check` of an invalid record lists every resume proof
// but condition-1 as unevaluated, and of a record of another runtime-state root (`repository`)
// every resume proof, writing nothing.
test('resume-check reports the unevaluated proofs of an invalid and of a foreign record', async (t) => {
  assert.deepEqual([...RESUME_OPERATION_PROOFS], ['repository', 'source-root', 'reconcile']);
  assert.ok(RESUME_OPERATION_PROOFS.every((proof) => !RESUME_PROOFS.includes(proof)));

  const invalid = await failedAfterGroupOne(t);
  rewriteRecord(invalid, (record) => {
    record.ownership = 'adopted';
  });
  const invalidBefore = stateBytes(invalid);
  const invalidCheck = expectOk(await resumeCheck(invalid));
  assert.equal(invalidCheck.valid, false);
  assert.deepEqual(invalidCheck.resumeProofs, ['condition-1']);
  assert.deepEqual(
    invalidCheck.unevaluated,
    RESUME_PROOFS.filter((proof) => proof !== 'condition-1'),
  );
  assertUntouched(invalid, invalidBefore, 'invalid record');

  const foreign = await failedAfterGroupOne(t);
  const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-elsewhere-')));
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }));
  rewriteRecord(foreign, (record) => {
    record.runtimeStateRoot = elsewhere;
    record.receipt.runtimeStateRoot = elsewhere;
  });
  const foreignBefore = stateBytes(foreign);
  const foreignCheck = expectOk(await resumeCheck(foreign));
  assert.equal(foreignCheck.valid, true, JSON.stringify(foreignCheck));
  assert.deepEqual(foreignCheck.resumeProofs, ['repository']);
  assert.deepEqual(foreignCheck.releaseProofs, ['repository']);
  assert.deepEqual(foreignCheck.unevaluated, [...RESUME_PROOFS]);
  assert.equal(foreignCheck.resumable, false);
  assertUntouched(foreign, foreignBefore, 'foreign record');
});
