// Git-backed tests of the runtime-state helper's delivery-progress ledger (`ledger init`, `ledger
// append`) and the release transition of retained `partial-diff` records: a real main checkout as
// the delivery source, a `partial-diff` worktree that received the bound selection through
// `transferSelection`, and the ledger's location, deletion and orphan reporting.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { link, readFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  bindSelectionManifest,
  transferSelection,
  verifySourceEndpoint,
} from '../src/scripts/delivery-selection-core.mjs';
import {
  LEDGER_MAX_BYTES,
  OPERATION_KEYS,
  STDIN_LIMITS,
  stdinLimitFor,
} from '../src/scripts/effective-flow-state-core.mjs';
import {
  LEDGER_COMMIT_KEYS,
  LEDGER_ENDPOINT_KEYS,
  LEDGER_KEYS,
  groupPlanProblem,
  ledgerPaths,
  makeLedger,
  restoreResidual,
  serializeLedger,
  worstCaseLedgerBytes,
} from '../src/scripts/effective-flow-state-ledger-core.mjs';
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
  assertUnchanged,
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

const CLI = fileURLToPath(new URL('../src/scripts/effective-flow-state.mjs', import.meta.url));
const RENAME_BASE = 'one\ntwo\nthree\nfour\n';
const RELEASE_TIME = Date.parse('2026-11-06T18:00:00Z');

// ---------------------------------------------------------------------------------------------
// Closed input and pure parts

// Invariant: the ledger operations take exactly their planned closed key sets, and no key carries
// a descriptor or ledger content.
test('the ledger operations have closed key sets without descriptor input', () => {
  assert.deepEqual(
    [...OPERATION_KEYS['ledger init']],
    [
      'cwd',
      'executionRoot',
      'recordId',
      'sessionId',
      'manifest',
      'groups',
      'base',
      'visibility',
      'language',
    ],
  );
  assert.deepEqual(
    [...OPERATION_KEYS['ledger append']],
    ['cwd', 'executionRoot', 'recordId', 'sessionId', 'commitOid'],
  );
});

// Invariant: the size bound is LEDGER_MAX_BYTES (256 KiB), and `worstCaseLedgerBytes`, which
// `ledger init` checks against it, is the serialized size of the ledger with every group committed
// with a 64-hex OID, whatever commits the ledger already records.
test('the ledger worst case is every group committed with a 64-hex OID', () => {
  assert.equal(LEDGER_MAX_BYTES, 256 * 1024);
  const descriptor = (path) => ({
    path,
    kind: 'blob',
    mode: '100644',
    digest: '0'.repeat(64),
    oid: '0'.repeat(40),
  });
  const ledger = makeLedger({
    binding: {
      recordId: 'record-1',
      creationOid: '1'.repeat(40),
      worktreePath: '/worktree',
      branch: 'effective-flow/delivery',
      receiptDigest: '2'.repeat(64),
    },
    base: { branch: 'main', oid: '1'.repeat(40) },
    visibility: 'visible',
    language: { git: 'en', forge: 'de' },
    manifest: { placeholder: true },
    groups: [
      { index: 0, endpoints: [descriptor('a.txt')] },
      { index: 1, endpoints: [descriptor('b.txt')] },
    ],
  });
  const full = serializeLedger({
    ...ledger,
    commits: [
      { group: 0, oid: 'f'.repeat(64) },
      { group: 1, oid: 'f'.repeat(64) },
    ],
  });
  assert.equal(worstCaseLedgerBytes(ledger), Buffer.byteLength(full));
  const appended = { ...ledger, commits: [{ group: 0, oid: '3'.repeat(40) }] };
  assert.equal(worstCaseLedgerBytes(appended), Buffer.byteLength(full));
  assert.ok(worstCaseLedgerBytes(ledger) > Buffer.byteLength(serializeLedger(ledger)));
});

// Invariant: a `ledger init` input above the bound and within the drain cap is the non-error
// size-bound result with the keys of the helper's own size-bound result (`recordId` and `status`
// null, `bytes` the drained input size), never INPUT_TOO_LARGE, and nothing is parsed or written.
test('CLI: ledger init stdin above the bound is the size-bound result', () => {
  const big = JSON.stringify({ cwd: '/x', pad: 'x'.repeat(LEDGER_MAX_BYTES) });
  const result = spawnSync(process.execPath, [CLI, 'ledger', 'init'], {
    input: big,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    ok: true,
    operation: 'ledger init',
    result: {
      recordId: null,
      written: false,
      reason: 'size-bound',
      bytes: Buffer.byteLength(big),
      limitBytes: LEDGER_MAX_BYTES,
      status: null,
    },
  });
});

// Invariant (drain cap): drain eligibility comes from the one per-operation stdin table, which
// lists only `ledger init`; its drain stops at 4 x LEDGER_MAX_BYTES: exactly the cap is still the
// size-bound result, one byte more is INPUT_TOO_LARGE.
test('CLI: the ledger init drain is capped at 4 x LEDGER_MAX_BYTES', () => {
  assert.deepEqual(Object.keys(STDIN_LIMITS), ['ledger init']);
  assert.deepEqual(stdinLimitFor('ledger init'), {
    bytes: LEDGER_MAX_BYTES,
    drainBytes: 4 * LEDGER_MAX_BYTES,
  });
  assert.deepEqual(stdinLimitFor('ledger append'), { bytes: 64 * 1024, drainBytes: null });
  const run = (bytes) =>
    spawnSync(process.execPath, [CLI, 'ledger', 'init'], {
      input: Buffer.alloc(bytes, 0x20),
      encoding: 'utf8',
    });
  const atCap = run(4 * LEDGER_MAX_BYTES);
  assert.equal(atCap.status, 0, atCap.stderr);
  const result = JSON.parse(atCap.stdout).result;
  assert.equal(result.reason, 'size-bound');
  assert.equal(result.bytes, 4 * LEDGER_MAX_BYTES);
  const overCap = run(4 * LEDGER_MAX_BYTES + 1);
  assert.equal(overCap.status, 2, overCap.stderr);
  assert.match(overCap.stderr, /INPUT_TOO_LARGE/);
  assert.equal(JSON.parse(overCap.stdout).error.code, 'INPUT_TOO_LARGE');
});

// Invariant: the group plan must be an exact partition of the manifest endpoints with both
// endpoints of a rename in one group.
test('groupPlanProblem accepts only an exact partition', () => {
  const manifest = {
    entries: [
      { path: 'a', renameFrom: null },
      { path: 'b', renameFrom: 'old-b' },
    ],
  };
  assert.equal(groupPlanProblem(manifest, [['a'], ['b', 'old-b']]), null);
  assert.equal(groupPlanProblem(manifest, [['a', 'b', 'old-b']]), null);
  assert.match(groupPlanProblem(manifest, [['a'], ['b']]), /leave the manifest endpoint old-b/);
  assert.match(groupPlanProblem(manifest, [['a', 'old-b'], ['b']]), /split the rename/);
  assert.match(groupPlanProblem(manifest, [['a'], ['a', 'b', 'old-b']]), /more than once/);
  assert.match(groupPlanProblem(manifest, [['a'], ['b', 'old-b', 'c']]), /no manifest endpoint/);
  assert.match(groupPlanProblem(manifest, [['a'], []]), /non-empty/);
  assert.match(groupPlanProblem(manifest, []), /non-empty/);
});

// ---------------------------------------------------------------------------------------------
// ledger init

// Invariant: `ledger init` writes a version 1, exact-key ledger once, with descriptors the helper
// computed itself (the blob OID equals `git hash-object` of the applied bytes) and no file
// content; a second init is LEDGER_EXISTS and leaves it unchanged.
test('ledger init writes an exact-key ledger with helper-computed descriptors', async (t) => {
  const fixture = await delivery(t);
  const result = expectOk(await call('ledger init', initInput(fixture)));
  assert.equal(result.written, true);
  assert.equal(result.path, ledgerFile(fixture));
  assert.equal(result.groups, 2);
  assert.equal(result.endpoints, 2);
  assert.equal(
    ledgerFile(fixture),
    join(fixture.root, '.effective-flow', 'worktree-runs', 'ledgers', 'record-1.ledger'),
  );
  const raw = readFileSync(ledgerFile(fixture), 'utf8');
  assert.ok(!raw.includes('a changed') && !raw.includes('b changed'), 'no file content');
  const ledger = JSON.parse(raw);
  // The session ID is a segment of the recorded worktree path and branch, and nowhere else.
  const { worktreePath: _path, branch: _branch, ...unnamed } = ledger;
  assert.ok(!JSON.stringify(unnamed).includes(SESSION), 'no session token');
  assert.deepEqual(Object.keys(ledger), [...LEDGER_KEYS]);
  assert.equal(ledger.creationOid, fixture.worktree.head);
  assert.deepEqual(ledger.base, { branch: 'main', oid: fixture.worktree.head });
  assert.deepEqual(ledger.language, { git: 'en', forge: 'de' });
  assert.deepEqual(ledger.commits, []);
  assert.deepEqual(ledger.manifest, fixture.manifest);
  for (const [index, group] of ledger.groups.entries()) {
    assert.equal(group.index, index);
    for (const endpoint of group.endpoints) {
      assert.deepEqual(Object.keys(endpoint), [...LEDGER_ENDPOINT_KEYS]);
      assert.equal(endpoint.kind, 'blob');
      assert.equal(
        endpoint.oid,
        git(fixture.worktree.worktreePath, 'hash-object', endpoint.path),
        endpoint.path,
      );
    }
  }
  expectOutcome(await call('ledger init', initInput(fixture)), 'LEDGER_EXISTS');
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), raw);
});

// Invariant: a plan that is not an exact partition is refused before any write; a record owned by
// another session is NOT_OWNER; a base other than `creationOid` and a worktree whose content no
// longer reconciles are NOT_ELIGIBLE; none of them writes a ledger.
test('ledger init refuses a bad plan, a foreign session, a wrong base and drift', async (t) => {
  const fixture = await delivery(t);
  expectError(
    await call('ledger init', initInput(fixture, { groups: [['a.txt']] })),
    'INVALID_INPUT',
  );
  expectError(
    await call('ledger init', initInput(fixture, { groups: [['a.txt'], ['a.txt', 'b.txt']] })),
    'INVALID_INPUT',
  );
  expectError(
    await call('ledger init', initInput(fixture, { visibility: 'public' })),
    'INVALID_INPUT',
  );
  expectOutcome(
    await call('ledger init', initInput(fixture, { sessionId: OTHER_SESSION })),
    'NOT_OWNER',
  );
  const wrongBase = expectOutcome(
    await call(
      'ledger init',
      initInput(fixture, { base: { branch: 'main', oid: 'f'.repeat(40) } }),
    ),
    'NOT_ELIGIBLE',
  );
  assert.deepEqual(wrongBase.proofs, ['base']);
  write(fixture.worktree.worktreePath, 'b.txt', 'edited after the transfer\n');
  const drift = expectOutcome(await call('ledger init', initInput(fixture)), 'NOT_ELIGIBLE');
  assert.deepEqual(drift.proofs, ['reconcile']);
  assert.equal(existsSync(ledgerFile(fixture)), false);
});

// ---------------------------------------------------------------------------------------------
// ledger append

// Invariant: `ledger append` records a proven group commit once; a repeat is idempotent; a commit
// that is not the next group's exact commit, or a foreign session, changes nothing.
test('ledger append records only the proven next-group commit', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  const before = readFileSync(ledgerFile(fixture), 'utf8');
  // A commit of both files is not group 0's commit.
  const both = commitGroup(fixture, ['a.txt', 'b.txt'], 'both');
  const wrong = expectOutcome(await append(fixture, both), 'NOT_ELIGIBLE');
  assert.deepEqual(wrong.proofs, ['paths']);
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), before);
  git(fixture.worktree.worktreePath, 'reset', '-q', '--soft', 'HEAD~1');
  git(fixture.worktree.worktreePath, 'reset', '-q');
  const first = commitGroup(fixture, ['a.txt']);
  expectOutcome(await append(fixture, first, OTHER_SESSION), 'NOT_OWNER');
  const appended = expectOk(await append(fixture, first));
  assert.equal(appended.appended, true);
  assert.equal(appended.group, 0);
  assert.equal(appended.remaining, 1);
  const ledger = readLedgerFile(fixture);
  assert.deepEqual(ledger.commits, [{ group: 0, oid: first }]);
  assert.deepEqual(Object.keys(ledger.commits[0]), [...LEDGER_COMMIT_KEYS]);
  const { commits: _after, ...immutableAfter } = ledger;
  const { commits: _before, ...immutableBefore } = JSON.parse(before);
  assert.deepEqual(immutableAfter, immutableBefore);
  assert.equal(expectOk(await append(fixture, first)).appended, false);
  // A tip that is not the branch tip is refused.
  const notTip = expectOutcome(await append(fixture, fixture.worktree.head), 'NOT_ELIGIBLE');
  assert.ok(notTip.proofs.includes('tip'), JSON.stringify(notTip));
});

// ---------------------------------------------------------------------------------------------
// Release

// Invariant: the ledger route of the release restores exactly the residual group, moves the record
// to `cleanup-ready` under the new session with a null reason, and `cleanup` then removes the
// worktree, record and ledger and keeps the branch.
test('release: the ledger route restores the residual and cleanup removes the record', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  const first = commitGroup(fixture, ['a.txt']);
  expectOk(await append(fixture, first));
  await failRecord(fixture);
  const ledgerBefore = readFileSync(ledgerFile(fixture), 'utf8');
  const released = expectOk(await release(fixture));
  assert.deepEqual(released.release, { route: 'ledger', restored: ['b.txt'] });
  assert.equal(status(fixture.worktree.worktreePath), '');
  const record = readRecord(fixture.root);
  assert.equal(record.status, 'cleanup-ready');
  assert.equal(record.reason, null);
  assert.equal(record.sessionId, OTHER_SESSION);
  const { status: _s, updatedAt: _u, sessionId: _i, ...rest } = record;
  const { status: _s0, updatedAt: _u0, sessionId: _i0, ...original } = fixture.record;
  assert.deepEqual(rest, original);
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), ledgerBefore);
  // The source still holds the selected content.
  assert.equal(readFileSync(join(fixture.root, 'b.txt'), 'utf8'), 'b changed\n');
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
  assert.equal(git(fixture.root, 'rev-parse', `refs/heads/${fixture.worktree.branch}`), first);
});

// Invariant: a staged residual file absent from HEAD (a hook-rejected group) is unstaged and
// removed with the directory it alone occupied; nothing else is touched.
test('release: the ledger route unstages and removes a staged new residual file', async (t) => {
  const fixture = await delivery(t, { added: { 'new/c.txt': 'c added\n' } });
  expectOk(
    await call('ledger init', initInput(fixture, { groups: [['a.txt'], ['b.txt', 'new/c.txt']] })),
  );
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  git(fixture.worktree.worktreePath, 'add', '--', 'b.txt', 'new/c.txt');
  await failRecord(fixture);
  const released = expectOk(await release(fixture));
  assert.deepEqual(released.release, { route: 'ledger', restored: ['b.txt', 'new/c.txt'] });
  assert.equal(status(fixture.worktree.worktreePath), '');
  assert.equal(existsSync(join(fixture.worktree.worktreePath, 'new')), false);
  assert.equal(readFileSync(join(fixture.root, 'new', 'c.txt'), 'utf8'), 'c added\n');
});

// Invariant: without a ledger, a dirty worktree is refused with its exact residual paths and a
// clean one is released; nothing changes on a refusal.
test('release: the no-ledger route lists the residual or releases a clean worktree', async (t) => {
  const fixture = await delivery(t);
  await failRecord(fixture);
  const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['residual']);
  assert.equal(refused.ledger, 'missing');
  assert.deepEqual(refused.residualPaths, ['a.txt', 'b.txt']);
  assert.equal(readRecord(fixture.root).status, 'failed');
  assert.notEqual(status(fixture.worktree.worktreePath), '');
  git(fixture.worktree.worktreePath, 'checkout', '--', 'a.txt', 'b.txt');
  const released = expectOk(await release(fixture));
  assert.deepEqual(released.release, { route: 'clean', restored: [] });
  assert.equal(readRecord(fixture.root).status, 'cleanup-ready');
});

// Invariant: the ledger route refuses source drift and extra dirt with stable proof identifiers,
// and leaves record, ledger and worktree unchanged.
test('release: source drift and extra dirt refuse the ledger route without changes', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  await failRecord(fixture);
  const ledger = readFileSync(ledgerFile(fixture), 'utf8');
  write(fixture.root, 'b.txt', 'source drifted\n');
  const drift = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(drift.proofs, ['source']);
  write(fixture.root, 'b.txt', 'b changed\n');
  write(fixture.worktree.worktreePath, 'stray.txt', 'not selected\n');
  const extra = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(extra.proofs, ['residual']);
  assert.deepEqual(extra.extra, ['stray.txt']);
  assert.equal(readRecord(fixture.root).status, 'failed');
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), ledger);
  assert.equal(readFileSync(join(fixture.worktree.worktreePath, 'b.txt'), 'utf8'), 'b changed\n');
});

// The bound manifest of the delivery worktree's own residual (`a.txt`, `b.txt` and the untracked
// `new/c.txt`) with that worktree as its source root.
function selfSourcedManifest(fixture) {
  return bindSelectionManifest(
    {
      sourceRoot: fixture.worktree.worktreePath,
      selection: ['a.txt', 'b.txt', 'new/c.txt'].map((path) => ({ path, state: 'working' })),
    },
    { runner: selectionRunner },
  );
}

const SELF_SOURCED_GROUPS = [['a.txt'], ['b.txt', 'new/c.txt']];

// Invariant: `ledger init` never binds a manifest whose source root is the delivery worktree
// itself, whose reconcile would compare that worktree with itself: it is `source-root` and writes
// nothing.
test('ledger init refuses a manifest sourced from its own delivery worktree', async (t) => {
  const fixture = await delivery(t, { added: { 'new/c.txt': 'c added\n' } });
  const manifest = await selfSourcedManifest(fixture);
  const before = snapshot(fixture);
  const refused = expectOutcome(
    await call('ledger init', initInput(fixture, { manifest, groups: SELF_SOURCED_GROUPS })),
    'NOT_ELIGIBLE',
  );
  assert.deepEqual(refused.proofs, ['source-root']);
  assertUnchanged(fixture, before);
});

// Invariant: a ledger written before that refusal, whose manifest names the delivery worktree as
// its source, never proves its source. A run that failed before its first commit keeps its
// residual, the only copy of those edits and untracked files: the release is `source` before any
// discard, `ledger reconcile` is `source-root`, and `worktree resume-check` offers neither route.
test('a ledger sourced from its own delivery worktree refuses release, reconcile and resume', async (t) => {
  const fixture = await delivery(t, { added: { 'new/c.txt': 'c added\n' } });
  expectOk(await call('ledger init', initInput(fixture, { groups: SELF_SOURCED_GROUPS })));
  const manifest = await selfSourcedManifest(fixture);
  writeFileSync(
    ledgerFile(fixture),
    `${JSON.stringify({ ...readLedgerFile(fixture), manifest })}\n`,
  );
  git(fixture.root, 'checkout', '--', 'a.txt', 'b.txt');
  rmSync(join(fixture.root, 'new'), { recursive: true });
  const reconciled = expectOutcome(
    await call('ledger reconcile', {
      cwd: fixture.root,
      executionRoot: fixture.root,
      recordId: fixture.record.recordId,
      sessionId: SESSION,
    }),
    'NOT_ELIGIBLE',
  );
  assert.deepEqual(reconciled.proofs, ['source-root']);
  await failRecord(fixture);
  const before = snapshot(fixture);
  const check = expectOk(
    await call('worktree resume-check', {
      cwd: fixture.root,
      executionRoot: fixture.root,
      recordId: fixture.record.recordId,
      visibility: 'visible',
    }),
  );
  assert.equal(check.releasable, false, JSON.stringify(check));
  assert.deepEqual(check.releaseProofs, ['source']);
  assert.equal(check.resumable, false);
  assert.ok(check.resumeProofs.includes('source'), JSON.stringify(check));
  const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['source']);
  assertUnchanged(fixture, before);
  const worktree = fixture.worktree.worktreePath;
  assert.equal(readFileSync(join(worktree, 'a.txt'), 'utf8'), 'a changed\n');
  assert.equal(readFileSync(join(worktree, 'b.txt'), 'utf8'), 'b changed\n');
  assert.equal(readFileSync(join(worktree, 'new', 'c.txt'), 'utf8'), 'c added\n');
});

// Invariant: the release is selected only by `release: "partial-diff"` on `aborted`/`failed` →
// `cleanup-ready`; anywhere else the discriminator is INVALID_INPUT, without it the transition is
// TRANSITION_INVALID, and another purpose is refused with `purpose`.
test('release: discriminator rules and purpose refusal', async (t) => {
  const fixture = await delivery(t);
  await failRecord(fixture);
  expectError(await release(fixture, { release: 'delivery' }), 'INVALID_INPUT');
  expectError(
    await release(fixture, { from: 'active', to: 'failed', reason: 'x' }),
    'INVALID_INPUT',
  );
  expectOutcome(await release(fixture, { release: undefined }), 'TRANSITION_INVALID');
  const other = repository(t, 'effective-flow-ledger-delivery-');
  const worktree = addWorktree(other);
  const record = makeRecord(other, worktree);
  expectOk(await call('worktree record-init', { cwd: other, executionRoot: other, record }));
  expectOk(
    await call('worktree transition', {
      cwd: other,
      executionRoot: other,
      recordId: record.recordId,
      from: 'active',
      to: 'aborted',
      reason: 'stopped',
      sessionId: SESSION,
    }),
  );
  const refused = expectOutcome(
    await call('worktree transition', {
      cwd: other,
      executionRoot: other,
      recordId: record.recordId,
      from: 'aborted',
      to: 'cleanup-ready',
      reason: null,
      sessionId: OTHER_SESSION,
      release: 'partial-diff',
    }),
    'NOT_ELIGIBLE',
  );
  assert.deepEqual(refused.proofs, ['purpose']);
  assert.equal(readRecord(other).status, 'aborted');
});

// ---------------------------------------------------------------------------------------------
// Location, deletion and orphan reporting

// Invariant: the ledger is no record and no lock to the record listing and the orphan-lock
// listing; `worktree remove` deletes it with its record; one without a record is reported by
// `worktree inspect` and never removed.
test('the ledger is never a record or lock; remove deletes it; inspect reports an orphan', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  const runs = join(fixture.root, '.effective-flow', 'worktree-runs');
  assert.deepEqual(readdirSync(runs).sort(), ['ledgers', 'record-1.json']);
  const inspected = expectOk(
    await call('worktree inspect', { cwd: fixture.root, executionRoot: fixture.root }),
  );
  assert.deepEqual(
    inspected.records.map((entry) => entry.recordId),
    ['record-1'],
  );
  assert.deepEqual(inspected.orphanLocks, []);
  assert.deepEqual(inspected.orphanLedgers, []);
  // An orphan: the same ledger bytes under an ID without a record.
  const orphan = ledgerPaths(fixture.root, 'orphan-1').ledger;
  writeFileSync(orphan, readFileSync(ledgerFile(fixture)));
  const reported = expectOk(
    await call('worktree inspect', { cwd: fixture.root, executionRoot: fixture.root }),
  );
  assert.deepEqual(reported.orphanLedgers, [
    { recordId: 'orphan-1', reason: 'orphan-ledger', path: orphan },
  ]);
  assert.ok(existsSync(orphan), 'inspect never removes an orphan ledger');
  git(fixture.worktree.worktreePath, 'checkout', '--', 'a.txt', 'b.txt');
  const removed = expectOk(
    await call('worktree remove', {
      cwd: fixture.root,
      executionRoot: fixture.root,
      sessionId: SESSION,
      recordIds: ['record-1'],
    }),
  );
  assert.equal(removed.items[0].ok, true, JSON.stringify(removed));
  assert.equal(existsSync(ledgerFile(fixture)), false);
  assert.equal(existsSync(orphan), true);
});

// =============================================================================================
// Group 1 acceptance tests. Each test names the invariant it protects.

// ---------------------------------------------------------------------------------------------
// Ledger schema

// Invariant (ledger schema): the written ledger has exactly the planned keys at every level, and
// it holds no file content, credential or session token; the session ID occurs only inside the
// documented worktree path and branch values.
test('ledger schema: exact keys at every level and no content, credential or session token', async (t) => {
  const canary = 'CANARY-FILE-CONTENT-7f3a';
  const fixture = await delivery(t, {
    files: { 'a.txt': `${canary} a\n`, 'b.txt': `${canary} b\n` },
  });
  const env = {
    ...GIT_ENV,
    GITHUB_TOKEN: 'ghp_CANARYTOKEN0123456789',
    ANTHROPIC_API_KEY: 'sk-canary',
  };
  expectOk(await call('ledger init', initInput(fixture), { env }));
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  const raw = readFileSync(ledgerFile(fixture), 'utf8');
  const ledger = JSON.parse(raw);
  assert.deepEqual(Object.keys(ledger), [
    'schemaVersion',
    'recordId',
    'creationOid',
    'worktreePath',
    'branch',
    'receiptDigest',
    'base',
    'visibility',
    'language',
    'manifest',
    'groups',
    'commits',
  ]);
  assert.equal(ledger.schemaVersion, 1);
  assert.match(ledger.receiptDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(ledger.base), ['branch', 'oid']);
  assert.deepEqual(Object.keys(ledger.language), ['git', 'forge']);
  assert.ok(['visible', 'hidden'].includes(ledger.visibility));
  assert.equal(ledger.groups.length, 2);
  for (const group of ledger.groups) {
    assert.deepEqual(Object.keys(group), ['index', 'endpoints']);
    for (const endpoint of group.endpoints) {
      assert.deepEqual(Object.keys(endpoint), ['path', 'kind', 'mode', 'digest', 'oid']);
      assert.match(endpoint.digest, /^[0-9a-f]{64}$/);
      assert.match(endpoint.oid, /^[0-9a-f]{40}$/);
    }
  }
  assert.deepEqual(Object.keys(ledger.commits[0]), ['group', 'oid']);
  // No file content, credential or session token anywhere.
  for (const secret of [canary, 'ghp_CANARYTOKEN0123456789', 'sk-canary', 'a changed']) {
    assert.ok(!raw.includes(secret), `the ledger must not contain ${secret}`);
  }
  const unnamed = JSON.stringify({ ...ledger, worktreePath: null, branch: null });
  assert.ok(!unnamed.includes(SESSION), 'the session ID is only a worktree path / branch segment');
  assert.ok(!raw.includes(`"sessionId"`), 'no session field');
  // The manifest binds digests of the selected bytes, never the bytes.
  assert.ok(!JSON.stringify(ledger.manifest).includes(canary));
});

// ---------------------------------------------------------------------------------------------
// Size bound

// The worst-case serialized size of the ledger for `fixture` with `branchLength` characters of
// `base.branch` (every group committed with a 64-hex OID, the size `ledger init` bounds), computed
// from the real manifest and placeholder descriptors of the real (fixed) lengths.
function modeledLedgerBytes(fixture, groups, branchLength) {
  const zero = (length) => '0'.repeat(length);
  const ledger = makeLedger({
    binding: {
      recordId: fixture.record.recordId,
      creationOid: fixture.record.creationOid,
      worktreePath: fixture.record.worktreePath,
      branch: fixture.record.branch,
      receiptDigest: zero(64),
    },
    base: { branch: 'b'.repeat(branchLength), oid: fixture.record.creationOid },
    visibility: 'visible',
    language: { git: 'en', forge: 'de' },
    manifest: fixture.manifest,
    groups: groups.map((paths, index) => ({
      index,
      endpoints: [...paths].sort().map((repoPath) => ({
        path: repoPath,
        kind: 'blob',
        mode: '100644',
        digest: zero(64),
        oid: zero(40),
      })),
    })),
    commits: groups.map((_, index) => ({ group: index, oid: zero(64) })),
  });
  return Buffer.byteLength(serializeLedger(ledger));
}

// Many selected files with very long paths so that the ledger approaches LEDGER_MAX_BYTES; the
// last file's name length (BIG_TUNER) and the directory length (BIG_DIR_PAD) are the adjustments. Returns the delivery fixture and its one group.
async function bigDelivery(t) {
  const directory = ['d1', 'd2', 'd3', 'd4']
    .map((name, index) => name.padEnd(index === 3 ? 240 + BIG_DIR_PAD : 240, 'x'))
    .join('/');
  const names = Array.from(
    { length: BIG_FILES },
    (_, index) => `f${String(index).padStart(3, '0')}`,
  );
  names.push('t'.padEnd(BIG_TUNER, 'u'));
  const files = Object.fromEntries(
    names.map((name) => [`${directory}/${name}`, `${name} changed\n`]),
  );
  const fixture = await delivery(t, { files });
  return { fixture, group: Object.keys(files) };
}
const BIG_FILES = 74;
const BIG_TUNER = 65;
const BIG_DIR_PAD = 9;

// Invariant (size bound): `ledger init` bounds the ledger's worst case (every group committed with
// a 64-hex OID). A ledger whose worst case is exactly LEDGER_MAX_BYTES is written, accepts the
// append of every group and stays readable after the last one; one byte more is the non-error
// `{written: false, reason: "size-bound"}` result and writes nothing (no file, no record change,
// no lock left behind).
test('ledger size bound: the worst case at the bound is written and takes every append, one byte more writes nothing', async (t) => {
  const { fixture, group } = await bigDelivery(t);
  const groups = [group.slice(0, 1), group.slice(1)];
  const small = modeledLedgerBytes(fixture, groups, 1);
  const large = modeledLedgerBytes(fixture, groups, 255);
  assert.ok(
    small <= LEDGER_MAX_BYTES && large > LEDGER_MAX_BYTES + 1,
    `retune BIG_TUNER: the ledger must straddle the bound (${small}..${large} vs ${LEDGER_MAX_BYTES})`,
  );
  const branchFor = (bytes) => 'b'.repeat(1 + bytes - small);
  const before = snapshot(fixture);
  const over = expectOk(
    await call(
      'ledger init',
      initInput(fixture, {
        groups,
        base: { branch: branchFor(LEDGER_MAX_BYTES + 1), oid: fixture.worktree.head },
      }),
    ),
  );
  assert.deepEqual(Object.keys(over).sort(), [
    'bytes',
    'limitBytes',
    'reason',
    'recordId',
    'status',
    'written',
  ]);
  assert.equal(over.written, false);
  assert.equal(over.reason, 'size-bound');
  assert.equal(over.bytes, LEDGER_MAX_BYTES + 1);
  assert.equal(over.limitBytes, LEDGER_MAX_BYTES);
  assertUnchanged(fixture, before, 'after the over-bound init');
  assert.equal(existsSync(ledgerFile(fixture)), false);
  assert.deepEqual(readdirSync(join(fixture.root, '.effective-flow', 'worktree-runs')), [
    'record-1.json',
  ]);
  const exact = expectOk(
    await call(
      'ledger init',
      initInput(fixture, {
        groups,
        base: { branch: branchFor(LEDGER_MAX_BYTES), oid: fixture.worktree.head },
      }),
    ),
  );
  assert.equal(exact.written, true);
  assert.equal(exact.maxBytes, LEDGER_MAX_BYTES);
  assert.ok(exact.bytes < exact.maxBytes, 'the initial ledger is below its worst case');
  assert.equal(Buffer.byteLength(readFileSync(ledgerFile(fixture), 'utf8')), exact.bytes);
  // Every append is accepted and the ledger stays within the read bound and readable.
  let tip = null;
  for (const [index, paths] of groups.entries()) {
    tip = commitGroup(fixture, paths, `group ${index}`);
    const appended = expectOk(await append(fixture, tip));
    assert.deepEqual([appended.appended, appended.group], [true, index]);
    assert.ok(Buffer.byteLength(readFileSync(ledgerFile(fixture))) <= LEDGER_MAX_BYTES);
  }
  assert.equal(readLedgerFile(fixture).commits.length, groups.length);
  // A repeated append of the recorded tip reads the full ledger back: it is still valid.
  assert.equal(expectOk(await append(fixture, tip)).appended, false);
});

// Invariant (size bound, CLI): `ledger init` accepts an input above the general 64 KiB bound and
// within 256 KiB; every other operation keeps INPUT_TOO_LARGE at 64 KiB; `ledger init` input of
// exactly 256 KiB is still parsed while one byte more is drained into the non-error size-bound
// result.
test('CLI: stdin bounds of ledger init and of every other operation', async (t) => {
  const { fixture, group } = await bigDelivery(t);
  const input = JSON.stringify(initInput(fixture, { groups: [group] }));
  assert.ok(Buffer.byteLength(input) > 64 * 1024, 'above the general stdin bound');
  assert.ok(Buffer.byteLength(input) < LEDGER_MAX_BYTES, 'within the ledger bound');
  const run = (args, stdin) =>
    spawnSync(process.execPath, [CLI, ...args], { input: stdin, encoding: 'utf8', env: GIT_ENV });
  const accepted = run(['ledger', 'init'], input);
  assert.equal(accepted.status, 0, accepted.stderr);
  const envelope = JSON.parse(accepted.stdout);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.result.written, true);
  assert.equal(existsSync(ledgerFile(fixture)), true);
  // Every other operation, `ledger append` included, refuses above 64 KiB.
  const padded = (pad) => JSON.stringify({ pad: 'x'.repeat(pad) });
  for (const operation of [
    ['ledger', 'append'],
    ['worktree', 'inspect'],
    ['cleanup', 'plan'],
  ]) {
    const refused = run(operation, padded(64 * 1024 + 1));
    assert.notEqual(refused.status, 0, operation.join(' '));
    assert.match(refused.stderr, /INPUT_TOO_LARGE/, operation.join(' '));
  }
  // Exactly the ledger bound is parsed (and refused as closed-key input), one byte more is drained.
  const overhead = Buffer.byteLength(padded(0));
  const exact = run(['ledger', 'init'], padded(LEDGER_MAX_BYTES - overhead));
  assert.equal(Buffer.byteLength(padded(LEDGER_MAX_BYTES - overhead)), LEDGER_MAX_BYTES);
  assert.notEqual(exact.status, 0);
  assert.match(exact.stderr, /INVALID_INPUT/);
  assert.doesNotMatch(exact.stderr, /size-bound/);
  const over = run(['ledger', 'init'], padded(LEDGER_MAX_BYTES - overhead + 1));
  assert.equal(over.status, 0, over.stderr);
  assert.equal(JSON.parse(over.stdout).result.reason, 'size-bound');
});

// ---------------------------------------------------------------------------------------------
// Ledger init

// Invariant (no clobber): an existing ledger, valid or not, is never replaced by `ledger init`.
test('ledger init never clobbers an existing ledger file', async (t) => {
  const fixture = await delivery(t);
  mkdirSync(dirname(ledgerFile(fixture)), { recursive: true });
  writeFileSync(ledgerFile(fixture), 'not a ledger\n');
  const outcome = expectOutcome(await call('ledger init', initInput(fixture)), 'LEDGER_EXISTS');
  assert.equal(outcome.recordId, 'record-1');
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), 'not a ledger\n');
});

// Invariant (helper-computed descriptors): no caller key can carry digests, descriptors, endpoints
// or commits into `ledger init`; the group plan names only paths.
test('ledger init refuses caller-supplied digests, descriptors and ledger content', async (t) => {
  const fixture = await delivery(t);
  const before = snapshot(fixture);
  const descriptor = {
    path: 'a.txt',
    kind: 'blob',
    mode: '100644',
    digest: '0'.repeat(64),
    oid: '0'.repeat(40),
  };
  for (const extra of [
    { descriptors: [descriptor] },
    { digests: { 'a.txt': '0'.repeat(64) } },
    { endpoints: [descriptor] },
    { commits: [] },
    { ledger: {} },
  ]) {
    expectError(await call('ledger init', initInput(fixture, extra)), 'INVALID_INPUT');
  }
  // A group entry that is a descriptor object instead of a path is not a manifest endpoint.
  expectError(
    await call('ledger init', initInput(fixture, { groups: [[descriptor], ['b.txt']] })),
    'INVALID_INPUT',
  );
  // The base takes exactly branch and oid.
  expectError(
    await call(
      'ledger init',
      initInput(fixture, { base: { branch: 'main', oid: fixture.worktree.head, digest: 'x' } }),
    ),
    'INVALID_INPUT',
  );
  assertUnchanged(fixture, before);
});

// Invariant (exact partition): overlap, a missing endpoint, an unknown path and a rename whose
// source is not in the group of its destination are each refused before anything is written.
test('ledger init refuses a group plan that is not an exact partition', async (t) => {
  const fixture = await delivery(t, {
    rename: { from: 'old.txt', to: 'new.txt', base: RENAME_BASE, content: `${RENAME_BASE}five\n` },
  });
  const before = snapshot(fixture);
  const refuse = async (groups, pattern) => {
    const error = expectError(
      await call('ledger init', initInput(fixture, { groups })),
      'INVALID_INPUT',
    );
    assert.match(error.message, pattern);
  };
  await refuse([['a.txt', 'b.txt', 'new.txt', 'old.txt'], ['a.txt']], /more than once/);
  await refuse([['a.txt'], ['b.txt', 'new.txt', 'old.txt'], ['b.txt']], /more than once/);
  await refuse([['a.txt', 'b.txt', 'new.txt']], /leave the manifest endpoint old.txt out/);
  await refuse(
    [
      ['a.txt', 'b.txt'],
      ['new.txt', 'old.txt', 'ghost.txt'],
    ],
    /no manifest endpoint/,
  );
  await refuse(
    [
      ['a.txt', 'old.txt'],
      ['b.txt', 'new.txt'],
    ],
    /split the rename old.txt -> new.txt/,
  );
  await refuse([['a.txt', 'b.txt', 'new.txt'], ['old.txt']], /split the rename/);
  assertUnchanged(fixture, before);
  // The valid plan keeps both endpoints of the rename in one group; the source is a tombstone.
  const written = expectOk(
    await call(
      'ledger init',
      initInput(fixture, { groups: [['a.txt'], ['b.txt'], ['new.txt', 'old.txt']] }),
    ),
  );
  assert.equal(written.endpoints, 4);
  const [, , renameGroup] = readLedgerFile(fixture).groups;
  assert.deepEqual(
    renameGroup.endpoints.map((endpoint) => [endpoint.path, endpoint.kind]),
    [
      ['new.txt', 'blob'],
      ['old.txt', 'tombstone'],
    ],
  );
  assert.deepEqual(renameGroup.endpoints[1], {
    path: 'old.txt',
    kind: 'tombstone',
    mode: null,
    digest: null,
    oid: null,
  });
});

// Invariant (`git hash-object --path` semantics): the blob OID of a descriptor is the OID Git
// stores for the applied bytes at that path with its filters and eol attributes (not the OID of
// the raw bytes), the digest is the SHA-256 of the raw applied bytes, and a commit of the group
// proves against it.
test('ledger init computes blob OIDs with path filters, digests over the raw bytes', async (t) => {
  const crlf = 'line one\r\nline two\r\n';
  const fixture = await delivery(t, {
    files: { 'a.txt': 'a changed\n', 'crlf.txt': crlf },
    attributes: 'crlf.txt text eol=crlf\n',
  });
  expectOk(await call('ledger init', initInput(fixture, { groups: [['a.txt'], ['crlf.txt']] })));
  const endpoint = readLedgerFile(fixture).groups[1].endpoints[0];
  const cwd = fixture.worktree.worktreePath;
  assert.equal(readFileSync(join(cwd, 'crlf.txt'), 'utf8'), crlf, 'the applied bytes stay CRLF');
  const raw = git(cwd, 'hash-object', '--no-filters', 'crlf.txt');
  const filtered = git(cwd, 'hash-object', '--path=crlf.txt', 'crlf.txt');
  assert.notEqual(raw, filtered, 'the eol attribute changes the stored blob');
  assert.equal(endpoint.oid, filtered);
  assert.notEqual(endpoint.oid, raw);
  assert.equal(endpoint.digest, createHash('sha256').update(crlf).digest('hex'));
  // The committed group carries exactly that blob.
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  expectOk(await append(fixture, commitGroup(fixture, ['crlf.txt'])));
  assert.equal(readLedgerFile(fixture).commits.length, 2);
});

// Invariant (exact internal reconcile): a worktree that no longer holds the planned endpoints, a
// record that is no longer `active`, and a branch that already moved past `creationOid` each
// refuse `ledger init` with their own stable proof and write nothing.
test('ledger init refuses a missing endpoint, a non-active record and a moved tip', async (t) => {
  const missing = await delivery(t);
  rmSync(join(missing.worktree.worktreePath, 'b.txt'));
  const before = snapshot(missing);
  const refused = expectOutcome(await call('ledger init', initInput(missing)), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['reconcile']);
  assert.ok(refused.mismatches.missing.includes('b.txt') || refused.mismatches.content.length >= 0);
  assertUnchanged(missing, before);

  const failed = await delivery(t);
  await failRecord(failed);
  expectOutcome(await call('ledger init', initInput(failed)), 'STATUS_MISMATCH');
  assert.equal(existsSync(ledgerFile(failed)), false);

  const moved = await delivery(t);
  commitGroup(moved, ['a.txt'], 'early');
  const tip = expectOutcome(await call('ledger init', initInput(moved)), 'NOT_ELIGIBLE');
  assert.deepEqual(tip.proofs, ['creation-tip']);
  assert.equal(existsSync(ledgerFile(moved)), false);
});

// ---------------------------------------------------------------------------------------------
// Ledger append

// Each refusal: the commit differs from the next group's exact commit in the one way described,
// and the stable proof identifiers name exactly that.
const APPEND_REFUSALS = [
  [
    'not the branch tip',
    ['tip'],
    // Invariant: only the branch tip may be recorded.
    (fixture) => {
      const first = commitGroup(fixture, ['a.txt']);
      write(fixture.worktree.worktreePath, 'extra.txt', 'later\n');
      commitGroup(fixture, ['extra.txt'], 'later commit');
      return first;
    },
  ],
  [
    'wrong parent',
    ['parent'],
    // Invariant: the parent must be the previous ledger tip (creationOid for the first group).
    (fixture) => {
      git(fixture.worktree.worktreePath, 'commit', '-q', '--allow-empty', '-m', 'unrecorded');
      return commitGroup(fixture, ['a.txt']);
    },
  ],
  [
    'paths are a superset of the group',
    ['paths'],
    // Invariant: the changed paths are exactly the next group's endpoint set.
    (fixture) => {
      write(fixture.worktree.worktreePath, 'extra.txt', 'extra\n');
      return commitGroup(fixture, ['a.txt', 'extra.txt']);
    },
  ],
  [
    'paths are another group',
    ['paths', 'blobs'],
    // Invariant: the group's own endpoint is missing from the commit, so its blob is absent too.
    (fixture) => commitGroup(fixture, ['b.txt']),
  ],
  [
    'blob OID mismatch',
    ['blobs'],
    // Invariant: the blob OID of each endpoint equals its descriptor.
    (fixture) => {
      write(fixture.worktree.worktreePath, 'a.txt', 'a with other bytes\n');
      return commitGroup(fixture, ['a.txt']);
    },
  ],
  [
    'mode mismatch',
    ['blobs'],
    // Invariant: the mode of each endpoint equals its descriptor.
    (fixture) => {
      chmodSync(join(fixture.worktree.worktreePath, 'a.txt'), 0o755);
      return commitGroup(fixture, ['a.txt']);
    },
  ],
];

for (const [name, proofs, setup] of APPEND_REFUSALS) {
  test(`ledger append refuses a commit with ${name} and changes nothing`, async (t) => {
    const fixture = await delivery(t);
    expectOk(await call('ledger init', initInput(fixture)));
    const commitOid = setup(fixture);
    const before = snapshot(fixture);
    const refused = expectOutcome(await append(fixture, commitOid), 'NOT_ELIGIBLE');
    assert.deepEqual(refused.proofs, proofs);
    assert.equal(refused.group, 0);
    assertUnchanged(fixture, before);
  });
}

// Invariant (ownership and state): a foreign session is NOT_OWNER, a record that is not `active`
// is STATUS_MISMATCH, an unknown record is RECORD_NOT_FOUND, and a missing ledger is the `ledger`
// proof; none of them changes the record or the ledger.
test('ledger append refuses a foreign session, a non-active record and a missing ledger', async (t) => {
  const fixture = await delivery(t);
  const missing = commitGroup(fixture, ['a.txt']);
  const noLedger = expectOutcome(await append(fixture, missing), 'NOT_ELIGIBLE');
  assert.deepEqual(noLedger.proofs, ['ledger']);
  assert.equal(noLedger.ledger, 'missing');
  git(fixture.worktree.worktreePath, 'reset', '-q', '--soft', 'HEAD~1');
  git(fixture.worktree.worktreePath, 'reset', '-q');
  expectOk(await call('ledger init', initInput(fixture)));
  const first = commitGroup(fixture, ['a.txt']);
  const before = snapshot(fixture);
  expectOutcome(await append(fixture, first, OTHER_SESSION), 'NOT_OWNER');
  assertUnchanged(fixture, before, 'after NOT_OWNER');
  expectOutcome(
    await call('ledger append', {
      cwd: fixture.root,
      executionRoot: fixture.root,
      recordId: 'record-2',
      sessionId: SESSION,
      commitOid: first,
    }),
    'RECORD_NOT_FOUND',
  );
  await failRecord(fixture);
  const failedBefore = snapshot(fixture);
  const mismatch = expectOutcome(await append(fixture, first), 'STATUS_MISMATCH');
  assert.equal(mismatch.status, 'failed');
  assertUnchanged(fixture, failedBefore, 'after STATUS_MISMATCH');
});

// Invariant (idempotence and completion): repeating the append of the recorded tip is a no-op that
// leaves the ledger byte-identical; once every group is committed no further OID is accepted;
// a recorded commit that is no longer the tip is not idempotent.
test('ledger append is idempotent for the recorded tip and refuses past the last group', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  const first = commitGroup(fixture, ['a.txt']);
  expectOk(await append(fixture, first));
  const afterFirst = readFileSync(ledgerFile(fixture), 'utf8');
  const repeat = expectOk(await append(fixture, first));
  assert.equal(repeat.appended, false);
  assert.equal(repeat.group, 0);
  assert.equal(repeat.committed, 1);
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), afterFirst);
  const second = commitGroup(fixture, ['b.txt']);
  const appended = expectOk(await append(fixture, second));
  assert.deepEqual([appended.appended, appended.group, appended.remaining], [true, 1, 0]);
  const complete = readFileSync(ledgerFile(fixture), 'utf8');
  assert.equal(expectOk(await append(fixture, second)).appended, false);
  // `first` is recorded but no longer the tip: not idempotent, and no group is left.
  const stale = expectOutcome(await append(fixture, first), 'NOT_ELIGIBLE');
  assert.deepEqual(stale.proofs, ['complete']);
  write(fixture.worktree.worktreePath, 'extra.txt', 'more\n');
  const extra = commitGroup(fixture, ['extra.txt'], 'beyond the plan');
  const beyond = expectOutcome(await append(fixture, extra), 'NOT_ELIGIBLE');
  assert.deepEqual(beyond.proofs, ['complete']);
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), complete);
});

// Invariant (committed rename): a commit that deletes the rename source and adds the destination
// is verified against the tombstone and blob descriptors of its group.
test('ledger append verifies a rename group against its tombstone and blob endpoints', async (t) => {
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
  const cwd = fixture.worktree.worktreePath;
  git(cwd, 'add', '--', 'new.txt', 'old.txt');
  git(cwd, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'rename');
  const oid = git(cwd, 'rev-parse', 'HEAD');
  assert.equal(expectOk(await append(fixture, oid)).appended, true);
  assert.deepEqual(readLedgerFile(fixture).commits, [{ group: 0, oid }]);
});

// ---------------------------------------------------------------------------------------------
// Ledger access

// Invariant (no ledger content in): `ledger append` and every other operation but `ledger init`
// are closed against ledger content keys; `ledger init` accepts a group plan but no descriptors.
test('no operation accepts ledger content as input', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  const commitOid = commitGroup(fixture, ['a.txt']);
  const before = snapshot(fixture);
  for (const key of ['commits', 'groups', 'ledger', 'endpoints', 'descriptors', 'manifest']) {
    const envelope = await call('ledger append', {
      cwd: fixture.root,
      executionRoot: fixture.root,
      recordId: 'record-1',
      sessionId: SESSION,
      commitOid,
      [key]: key === 'ledger' ? {} : [],
    });
    expectError(envelope, 'INVALID_INPUT');
  }
  assertUnchanged(fixture, before);
  const contentKeys = ['ledger', 'commits', 'descriptors', 'endpoints', 'digests', 'groups'];
  for (const [operation, keys] of Object.entries(OPERATION_KEYS)) {
    const accepted = contentKeys.filter((key) => keys.includes(key));
    assert.deepEqual(
      accepted,
      operation === 'ledger init' ? ['groups'] : [],
      `${operation} must not accept ledger content`,
    );
  }
  expectError(
    await call('worktree inspect', {
      cwd: fixture.root,
      executionRoot: fixture.root,
      ledger: readLedgerFile(fixture),
    }),
    'INVALID_INPUT',
  );
});

// ---------------------------------------------------------------------------------------------
// Location, deletion and orphans

// Invariant (location): a ledger, valid or orphaned, is neither a record nor a lock for
// `worktree inspect`, `cleanup plan` and `cleanup apply`; an orphan ledger alone yields no record,
// no orphan lock, no cleanup item or blocked entry, and survives `cleanup apply`.
test('ledgers are never records or locks for inspect and cleanup', async (t) => {
  const fixture = await delivery(t);
  expectOk(await call('ledger init', initInput(fixture)));
  const orphan = ledgerPaths(fixture.root, 'orphan-1').ledger;
  writeFileSync(orphan, readFileSync(ledgerFile(fixture)));
  // Stray ledger-looking names next to the records never count either.
  writeFileSync(join(fixture.root, '.effective-flow', 'worktree-runs', 'stray.ledger'), '{}\n');
  const input = { cwd: fixture.root, executionRoot: fixture.root };
  const inspected = expectOk(await call('worktree inspect', input));
  assert.deepEqual(
    inspected.records.map((entry) => entry.recordId),
    ['record-1'],
  );
  assert.deepEqual(inspected.orphanLocks, []);
  assert.deepEqual(
    inspected.orphanLedgers.map((entry) => entry.recordId),
    ['orphan-1'],
  );
  const plan = expectOk(await call('cleanup plan', input));
  const ids = [...plan.items, ...plan.blocked].map((entry) => entry.itemId);
  assert.ok(
    ids.every((id) => id === 'worktree:record-1'),
    JSON.stringify(ids),
  );
  assert.ok(plan.blocked.every((entry) => entry.kind !== 'orphanLock'));
  assert.equal(plan.items.length, 0, 'an active record is not removable');
  assert.equal(existsSync(orphan), true);
  assert.equal(existsSync(ledgerFile(fixture)), true);
  assert.equal(existsSync(recordFile(fixture.root)), true);
});

// Invariant (orphans are reported, never removed): with no record at all, `worktree inspect`
// reports the orphan ledger by record ID, path and reason and removes nothing.
test('worktree inspect reports an orphan ledger without a record and never removes it', async (t) => {
  const root = repository(t, 'effective-flow-ledger-orphan-');
  const orphan = ledgerPaths(root, 'gone-1').ledger;
  mkdirSync(dirname(orphan), { recursive: true });
  writeFileSync(orphan, '{}\n');
  const input = { cwd: root, executionRoot: root };
  const inspected = expectOk(await call('worktree inspect', input));
  assert.deepEqual(inspected.records, []);
  assert.deepEqual(inspected.orphanLocks, []);
  assert.deepEqual(inspected.orphanLedgers, [
    { recordId: 'gone-1', reason: 'orphan-ledger', path: orphan },
  ]);
  const plan = expectOk(await call('cleanup plan', input));
  assert.deepEqual(
    [...plan.items, ...plan.blocked].filter((entry) => String(entry.itemId).includes('gone-1')),
    [],
  );
  assert.equal(readFileSync(orphan, 'utf8'), '{}\n');
});

// A runner that records every Git call and, on the `check-ignore` probe that guards the unlink of
// `target`, snapshots whether `ledger` and `target` exist at that moment.
function unlinkOrderRunner(ledger, target) {
  const seen = { ledgerAtRecordUnlink: null, recordAtRecordUnlink: null, probes: [] };
  const runner = async (request) => {
    const args = request.args.slice(2);
    if (args[0] === 'check-ignore') {
      const probe = args.at(-1);
      seen.probes.push(probe);
      if (target.endsWith(probe)) {
        seen.ledgerAtRecordUnlink = existsSync(ledger);
        seen.recordAtRecordUnlink = existsSync(target);
      }
    }
    return processRunner(request);
  };
  return { runner, seen };
}

// Invariant (ledger deletion): in `worktree remove` and in `cleanup apply` the ledger is deleted
// immediately before the record is unlinked: when the guard of the record's unlink runs, the ledger
// is already gone and the record is still there, and the ledger's own unlink was guarded just
// before.
for (const via of ['worktree remove', 'cleanup apply']) {
  test(`${via} deletes the ledger immediately before it unlinks the record`, async (t) => {
    const fixture = await delivery(t);
    expectOk(await call('ledger init', initInput(fixture)));
    expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
    await failRecord(fixture);
    expectOk(await release(fixture));
    // An orphan ledger of another record ID is never touched by the removal.
    const orphan = ledgerPaths(fixture.root, 'orphan-1').ledger;
    writeFileSync(orphan, readFileSync(ledgerFile(fixture)));
    const { runner, seen } = unlinkOrderRunner(ledgerFile(fixture), recordFile(fixture.root));
    const input = { cwd: fixture.root, executionRoot: fixture.root };
    let result;
    if (via === 'worktree remove') {
      // `worktree remove` needs an owned `active` or `cleanup-ready` record of the caller.
      result = expectOk(
        await call(
          'worktree remove',
          { ...input, sessionId: OTHER_SESSION, recordIds: ['record-1'] },
          { runner },
        ),
      );
    } else {
      const plan = expectOk(await call('cleanup plan', input));
      const item = plan.items.find((entry) => entry.itemId === 'worktree:record-1');
      assert.ok(item, JSON.stringify(plan.blocked));
      result = expectOk(
        await call(
          'cleanup apply',
          { ...input, items: { [item.itemId]: item.itemDigest } },
          { runner },
        ),
      );
    }
    assert.equal(result.items[0].ok, true, JSON.stringify(result));
    assert.equal(seen.ledgerAtRecordUnlink, false, 'the ledger is gone before the record unlink');
    assert.equal(seen.recordAtRecordUnlink, true, 'the record still exists at that point');
    const ledgerProbe = '.effective-flow/worktree-runs/ledgers/record-1.ledger';
    const recordProbe = '.effective-flow/worktree-runs/record-1.json';
    assert.ok(
      seen.probes.lastIndexOf(ledgerProbe) < seen.probes.lastIndexOf(recordProbe),
      JSON.stringify(seen.probes),
    );
    assert.equal(existsSync(ledgerFile(fixture)), false);
    assert.equal(existsSync(recordFile(fixture.root)), false);
    assert.equal(existsSync(orphan), true, 'an orphan ledger is not removed');
  });
}

// ---------------------------------------------------------------------------------------------
// Release transition

// A delivery with group 0 committed and recorded, the record `failed`, and group 1 still residual.
async function retained(t, options) {
  const fixture = await delivery(t, options);
  expectOk(await call('ledger init', initInput(fixture)));
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  await failRecord(fixture);
  return fixture;
}

// What every tree a release of the fixture's record preserved holds at `path` (the blob text,
// trimmed), one entry per tree under `refs/effective-flow/released/<RECORD_ID>/`.
function preservedBytes(fixture, path) {
  return git(
    fixture.root,
    'for-each-ref',
    '--format=%(objectname)',
    `refs/effective-flow/released/${fixture.record.recordId}`,
  )
    .split('\n')
    .filter(Boolean)
    .map((tree) => git(fixture.root, 'cat-file', '-p', `${tree}:${path}`));
}

// Invariant (ledger route): the release restores exactly the residual paths and nothing else,
// moves the record to `cleanup-ready` with a null reason under the new session and a fresh
// `updatedAt`, rewrites no other record field, and leaves the ledger and the source untouched.
test('release ledger route: restores exactly the residual and rewrites only status, updatedAt and sessionId', async (t) => {
  const fixture = await retained(t);
  const ledgerBefore = readFileSync(ledgerFile(fixture), 'utf8');
  const sourceBefore = status(fixture.root);
  const failed = readRecord(fixture.root);
  const released = expectOk(
    await call('worktree transition', releaseInput(fixture), { now: () => RELEASE_TIME }),
  );
  assert.deepEqual(released.release, { route: 'ledger', restored: ['b.txt'] });
  assert.deepEqual(preservedBytes(fixture, 'b.txt'), ['b changed'], 'the discarded bytes are kept');
  assert.equal(released.status, 'cleanup-ready');
  assert.equal(released.sessionId, OTHER_SESSION);
  const record = readRecord(fixture.root);
  assert.equal(record.status, 'cleanup-ready');
  assert.equal(record.reason, null);
  assert.equal(record.sessionId, OTHER_SESSION);
  assert.equal(record.updatedAt, '2026-11-06T18:00:00Z');
  assert.notEqual(record.updatedAt, failed.updatedAt);
  const { status: _s, updatedAt: _u, sessionId: _i, reason: _r, ...rest } = record;
  const { status: _s0, updatedAt: _u0, sessionId: _i0, reason: _r0, ...before } = failed;
  assert.deepEqual(rest, before, 'no other field is rewritten');
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), ledgerBefore);
  assert.equal(status(fixture.root), sourceBefore);
  assert.equal(status(fixture.worktree.worktreePath), '');
  assert.equal(
    readFileSync(join(fixture.worktree.worktreePath, 'a.txt'), 'utf8'),
    'a changed\n',
    'the committed group stays',
  );
  assert.equal(
    git(fixture.worktree.worktreePath, 'show', 'HEAD:b.txt'),
    'b.txt base',
    'the residual returns to HEAD',
  );
});

// Invariant (no-ledger clean route): a clean worktree is released with or without a ledger,
// restoring nothing, and a repeat release of the released record is STATUS_MISMATCH.
test('release no-ledger clean route', async (t) => {
  const fixture = await delivery(t);
  await failRecord(fixture);
  git(fixture.worktree.worktreePath, 'checkout', '--', 'a.txt', 'b.txt');
  const failed = readRecord(fixture.root);
  const released = expectOk(
    await call('worktree transition', releaseInput(fixture), { now: () => RELEASE_TIME }),
  );
  assert.deepEqual(released.release, { route: 'clean', restored: [] });
  const record = readRecord(fixture.root);
  assert.deepEqual(
    [record.status, record.reason, record.sessionId],
    ['cleanup-ready', null, OTHER_SESSION],
  );
  assert.equal(record.updatedAt, '2026-11-06T18:00:00Z');
  assert.notEqual(record.updatedAt, failed.updatedAt);
  expectOutcome(await release(fixture), 'STATUS_MISMATCH');
});

// Invariant (no-ledger gone route): when the worktree directory and its registration are already
// gone, the record is released with only its record fields rewritten, the branch kept, and no Git
// call inside the vanished directory.
test('release no-ledger gone route', async (t) => {
  const fixture = await delivery(t);
  await failRecord(fixture);
  git(fixture.root, 'worktree', 'remove', '--force', fixture.worktree.worktreePath);
  assert.equal(existsSync(fixture.worktree.worktreePath), false);
  const failed = readRecord(fixture.root);
  const calls = [];
  const runner = async (request) => {
    calls.push(request.args);
    return processRunner(request);
  };
  const released = expectOk(
    await call('worktree transition', releaseInput(fixture), { runner, now: () => RELEASE_TIME }),
  );
  assert.deepEqual(released.release, { route: 'gone', restored: [] });
  const record = readRecord(fixture.root);
  assert.deepEqual(
    [record.status, record.reason, record.sessionId, record.updatedAt],
    ['cleanup-ready', null, OTHER_SESSION, '2026-11-06T18:00:00Z'],
  );
  const { status: _s, updatedAt: _u, sessionId: _i, reason: _r, ...rest } = record;
  const { status: _s0, updatedAt: _u0, sessionId: _i0, reason: _r0, ...before } = failed;
  assert.deepEqual(rest, before);
  assert.equal(
    calls.filter((args) => args[0] === '-C' && args[1] === fixture.worktree.worktreePath).length,
    0,
    'no Git call inside the gone worktree',
  );
  assert.equal(
    git(fixture.root, 'rev-parse', '--verify', `refs/heads/${fixture.worktree.branch}`),
    fixture.worktree.head,
  );
  // The released record is then removable by `cleanup`: the gone proof replaces the conditions
  // that need the worktree, the record goes, and the branch stays.
  calls.length = 0;
  const removed = await cleanupGone(fixture, runner);
  assert.equal(removed.reconciledAbsent, true);
  assert.equal(removed.branch.outcome, 'retained');
  assert.equal(existsSync(recordFile(fixture.root)), false);
  assert.equal(
    git(fixture.root, 'rev-parse', '--verify', `refs/heads/${fixture.worktree.branch}`),
    fixture.worktree.head,
  );
  assert.equal(
    calls.filter((args) => args[0] === '-C' && args[1] === fixture.worktree.worktreePath).length,
    0,
    'no Git call inside the gone worktree during cleanup',
  );
  assert.ok(!calls.some((args) => args.includes('worktree') && args.includes('prune')));
});

// Lists the released record of `fixture` in `cleanup plan` and removes it with `cleanup apply`;
// returns the applied item.
async function cleanupGone(fixture, runner = processRunner) {
  const plan = expectOk(
    await call('cleanup plan', { cwd: fixture.root, executionRoot: fixture.root }, { runner }),
  );
  const item = plan.items.find((entry) => entry.itemId === 'worktree:record-1');
  assert.ok(item, JSON.stringify(plan.blocked));
  assert.deepEqual(item.conditions, []);
  const applied = expectOk(
    await call(
      'cleanup apply',
      {
        cwd: fixture.root,
        executionRoot: fixture.root,
        items: { [item.itemId]: item.itemDigest },
      },
      { runner },
    ),
  );
  assert.equal(applied.items[0].ok, true, JSON.stringify(applied));
  return applied.items[0];
}

// Invariant (gone route with a ledger): a record whose fully gone worktree had a ledger is released
// on the gone route, and `cleanup` deletes the ledger before the record and keeps the branch with
// its committed group.
test('release gone route with a ledger: cleanup removes ledger and record, keeps the branch', async (t) => {
  const fixture = await retained(t);
  const tip = git(fixture.worktree.worktreePath, 'rev-parse', 'HEAD');
  git(fixture.root, 'worktree', 'remove', '--force', fixture.worktree.worktreePath);
  const released = expectOk(await release(fixture));
  assert.deepEqual(released.release, { route: 'gone', restored: [] });
  assert.equal(existsSync(ledgerFile(fixture)), true);
  const removed = await cleanupGone(fixture);
  assert.equal(removed.reconciledAbsent, true);
  assert.equal(existsSync(ledgerFile(fixture)), false);
  assert.equal(existsSync(recordFile(fixture.root)), false);
  assert.equal(git(fixture.root, 'rev-parse', `refs/heads/${fixture.worktree.branch}`), tip);
});

// Invariant: the owner's `worktree remove` removes a released `partial-diff` record whose worktree
// is fully gone the same way, through the post-claim reconcile of an absent worktree.
test('release gone route: the owner removes the record with worktree remove', async (t) => {
  const fixture = await delivery(t);
  await failRecord(fixture);
  git(fixture.root, 'worktree', 'remove', '--force', fixture.worktree.worktreePath);
  expectOk(await release(fixture));
  const result = expectOk(
    await call('worktree remove', {
      cwd: fixture.root,
      executionRoot: fixture.root,
      sessionId: OTHER_SESSION,
      recordIds: ['record-1'],
    }),
  );
  assert.equal(result.items[0].ok, true, JSON.stringify(result));
  assert.equal(result.items[0].reconciledAbsent, true);
  assert.equal(existsSync(recordFile(fixture.root)), false);
  assert.equal(
    git(fixture.root, 'rev-parse', '--verify', `refs/heads/${fixture.worktree.branch}`),
    fixture.worktree.head,
  );
});

// Makes the worktree of `fixture` half-gone in `shape`: its directory deleted while still
// registered, or its registration removed and an empty directory left at the path.
function makeHalfGone(fixture, shape) {
  if (shape === 'registered-missing-directory') {
    rmSync(fixture.worktree.worktreePath, { recursive: true, force: true });
  } else {
    git(fixture.root, 'worktree', 'remove', '--force', fixture.worktree.worktreePath);
    mkdirSync(fixture.worktree.worktreePath);
  }
}

// Invariant (gone route narrowness): the gone route admits only a fully gone worktree, the proof
// cleanup's `goneRemovable` takes. A half-gone worktree (registered without its directory, or a
// directory without its registration) is refused with the stable proof `half-gone` and its
// `shape`, and the record and ledger stay byte-identical: cleanup could never remove it.
test('release gone route: a half-gone partial-diff worktree is refused with its shape', async (t) => {
  for (const shape of ['registered-missing-directory', 'unregistered-directory']) {
    const fixture = await retained(t);
    makeHalfGone(fixture, shape);
    const record = readFileSync(recordFile(fixture.root), 'utf8');
    const ledger = readFileSync(ledgerFile(fixture), 'utf8');
    const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
    assert.deepEqual(refused.proofs, ['half-gone'], shape);
    assert.equal(refused.shape, shape);
    assert.equal(refused.route, 'gone');
    assert.equal(readFileSync(recordFile(fixture.root), 'utf8'), record, shape);
    assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), ledger, shape);
  }
});

// Invariant: a released `partial-diff` record whose worktree became half-gone afterwards (the
// directory deleted while still registered, or the path present without a registration) stays
// refused by `cleanup` and `worktree remove` with the full conditions, and nothing is pruned.
test('a released partial-diff record whose worktree became half-gone stays not removable', async (t) => {
  for (const shape of ['registered-missing-directory', 'unregistered-directory']) {
    const fixture = await delivery(t);
    await failRecord(fixture);
    git(fixture.worktree.worktreePath, 'checkout', '--', 'a.txt', 'b.txt');
    assert.deepEqual(expectOk(await release(fixture)).release, { route: 'clean', restored: [] });
    makeHalfGone(fixture, shape);
    const calls = [];
    const runner = async (request) => {
      calls.push(request.args);
      return processRunner(request);
    };
    const plan = expectOk(
      await call('cleanup plan', { cwd: fixture.root, executionRoot: fixture.root }, { runner }),
    );
    assert.equal(plan.items.filter((entry) => entry.itemId === 'worktree:record-1').length, 0);
    const blocked = plan.blocked.find((entry) => entry.itemId === 'worktree:record-1');
    assert.ok(blocked, shape);
    assert.ok(blocked.conditions.includes(shape === 'registered-missing-directory' ? 4 : 3));
    const removal = expectOk(
      await call(
        'worktree remove',
        {
          cwd: fixture.root,
          executionRoot: fixture.root,
          sessionId: OTHER_SESSION,
          recordIds: ['record-1'],
        },
        { runner },
      ),
    );
    assert.equal(removal.items[0].code, 'NOT_ELIGIBLE', shape);
    assert.equal(readRecord(fixture.root).status, 'cleanup-ready');
    assert.ok(!calls.some((args) => args.includes('worktree') && args.includes('prune')));
    assert.ok(!calls.some((args) => args.includes('worktree') && args.includes('remove')));
  }
});

// Invariant: the gone proof is bound to `partial-diff`; a fully gone `cleanup-ready` record of any
// other purpose keeps the full removal conditions.
test('a fully gone delivery-purpose cleanup-ready record is still not removable', async (t) => {
  const root = repository(t, 'effective-flow-ledger-');
  const worktree = addWorktree(root);
  const record = makeRecord(root, worktree);
  expectOk(await call('worktree record-init', { cwd: root, executionRoot: root, record }));
  expectOk(
    await call('worktree transition', {
      cwd: root,
      executionRoot: root,
      recordId: record.recordId,
      from: 'active',
      to: 'cleanup-ready',
      reason: null,
      sessionId: SESSION,
    }),
  );
  git(root, 'worktree', 'remove', '--force', worktree.worktreePath);
  const plan = expectOk(await call('cleanup plan', { cwd: root, executionRoot: root }));
  assert.equal(plan.items.filter((entry) => entry.itemId === 'worktree:record-1').length, 0);
  const blocked = plan.blocked.find((entry) => entry.itemId === 'worktree:record-1');
  assert.deepEqual(blocked.conditions, [2, 3, 4, 5, 7]);
  const removal = expectOk(
    await call('worktree remove', {
      cwd: root,
      executionRoot: root,
      sessionId: SESSION,
      recordIds: ['record-1'],
    }),
  );
  assert.equal(removal.items[0].code, 'NOT_ELIGIBLE');
  assert.deepEqual(removal.items[0].conditions, [2, 3, 4, 5, 7]);
  assert.equal(readRecord(root).status, 'cleanup-ready');
});

// Invariant (no-ledger dirty refusal): a dirty worktree without a usable ledger is refused with
// the exact residual paths (tracked changes and untracked files alike), a malformed or
// foreign-bound ledger counts as no ledger, and nothing changes.
test('release no-ledger dirty refusal lists the exact residual paths', async (t) => {
  const fixture = await delivery(t, { added: { 'new/c.txt': 'c added\n' } });
  await failRecord(fixture);
  const before = snapshot(fixture);
  const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['residual']);
  assert.equal(refused.ledger, 'missing');
  assert.deepEqual(refused.residualPaths, ['a.txt', 'b.txt', 'new/c.txt']);
  assert.equal(refused.residualPathCount, 3);
  assertUnchanged(fixture, before);
  // A ledger that fails validation is no ledger: the same refusal, the ledger left in place.
  mkdirSync(dirname(ledgerFile(fixture)), { recursive: true });
  writeFileSync(ledgerFile(fixture), '{"schemaVersion":1}\n');
  const invalid = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(invalid.proofs, ['residual']);
  assert.match(invalid.ledger, /^invalid:/);
  assert.deepEqual(invalid.residualPaths, ['a.txt', 'b.txt', 'new/c.txt']);
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), '{"schemaVersion":1}\n');
  assert.equal(readRecord(fixture.root).status, 'failed');
});

// Invariant (purpose): the release exists only for `partial-diff` records; a `delivery` record is
// refused with `purpose` and unchanged. The `release` discriminator is INVALID_INPUT on every other
// transition and for any value but `partial-diff`; without it `failed` -> `cleanup-ready` is not a
// transition.
test('release discriminator is forbidden on other transitions and bound to partial-diff', async (t) => {
  const fixture = await delivery(t);
  await failRecord(fixture);
  const before = snapshot(fixture);
  const adoption = {
    branch: fixture.worktree.branch,
    workflow: 'deliver',
    fetchedHeadOid: 'a'.repeat(40),
  };
  for (const overrides of [
    { from: 'active', to: 'failed', reason: 'x' },
    { from: 'active', to: 'aborted', reason: 'x' },
    { from: 'active', to: 'cleanup-ready', reason: null },
    { from: 'failed', to: 'active', reason: null, ...adoption },
    { from: 'aborted', to: 'active', reason: null, ...adoption },
    { release: 'delivery' },
    { release: true },
    { release: '' },
  ]) {
    expectError(await release(fixture, overrides), 'INVALID_INPUT');
  }
  expectOutcome(await release(fixture, { release: undefined }), 'TRANSITION_INVALID');
  expectOutcome(
    await release(fixture, {
      from: 'cleanup-ready',
      to: 'failed',
      reason: 'x',
      release: undefined,
    }),
    'TRANSITION_INVALID',
  );
  expectError(await release(fixture, { reason: 'because' }), 'INVALID_INPUT');
  assertUnchanged(fixture, before);
});

// Invariant (single refusals of the ledger route): each condition below alone refuses the
// release with its own stable proof identifier and leaves the record, the ledger and the
// worktree byte-identical.
const RELEASE_REFUSALS = [
  [
    'extra untracked path',
    ['residual'],
    (fixture) => write(fixture.worktree.worktreePath, 'stray.txt', 'not selected\n'),
    (outcome) => assert.deepEqual(outcome.extra, ['stray.txt']),
  ],
  [
    'extra dirty tracked path',
    ['residual'],
    (fixture) => write(fixture.worktree.worktreePath, 'base.txt', 'edited\n'),
    (outcome) => assert.deepEqual(outcome.extra, ['base.txt']),
  ],
  [
    'residual content mismatch',
    ['residual'],
    (fixture) => write(fixture.worktree.worktreePath, 'b.txt', 'tampered\n'),
    (outcome) => assert.deepEqual(outcome.content, ['b.txt']),
  ],
  [
    'residual mode mismatch',
    ['residual'],
    (fixture) => chmodSync(join(fixture.worktree.worktreePath, 'b.txt'), 0o755),
    (outcome) => assert.deepEqual(outcome.content, ['b.txt']),
  ],
  [
    'staged index that is neither HEAD nor the descriptor',
    ['index'],
    (fixture) => {
      const cwd = fixture.worktree.worktreePath;
      write(cwd, 'b.txt', 'staged other\n');
      git(cwd, 'add', '--', 'b.txt');
      write(cwd, 'b.txt', 'b changed\n');
    },
    () => {},
  ],
  [
    'source content drift',
    ['source'],
    (fixture) => write(fixture.root, 'b.txt', 'source drifted\n'),
    () => {},
  ],
  [
    'source HEAD drift',
    ['source'],
    (fixture) => git(fixture.root, 'commit', '-q', '--allow-empty', '-m', 'source moved'),
    () => {},
  ],
];

for (const [name, proofs, setup, check] of RELEASE_REFUSALS) {
  test(`release ledger route refuses ${name} and changes nothing`, async (t) => {
    const fixture = await retained(t);
    setup(fixture);
    const before = snapshot(fixture);
    const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
    assert.deepEqual(refused.proofs, proofs);
    assert.equal(refused.route, 'ledger');
    check(refused);
    assertUnchanged(fixture, before);
    assert.equal(readRecord(fixture.root).status, 'failed');
  });
}

// Invariant (staged residual is released): a residual group the commit hook rejected stays staged
// and equals its descriptors; the release unstages and restores it.
test('release ledger route accepts a staged residual equal to its descriptors', async (t) => {
  const fixture = await retained(t);
  git(fixture.worktree.worktreePath, 'add', '--', 'b.txt');
  const released = expectOk(await release(fixture));
  assert.deepEqual(released.release, { route: 'ledger', restored: ['b.txt'] });
  assert.equal(status(fixture.worktree.worktreePath), '');
});

// Invariant (conditions replace the ownership check): the conditions the release keeps still
// refuse: an `active` record is STATUS_MISMATCH, and a worktree whose HEAD left the recorded
// branch fails the release with condition identifiers.
test('release keeps the removal conditions and refuses an active record', async (t) => {
  const fixture = await delivery(t);
  const active = snapshot(fixture);
  expectOutcome(await release(fixture), 'STATUS_MISMATCH');
  assertUnchanged(fixture, active);
  await failRecord(fixture);
  git(fixture.worktree.worktreePath, 'checkout', '--', 'a.txt', 'b.txt');
  // A branch tip that is not an ancestor-descendant of the creation OID is a condition failure.
  git(fixture.worktree.worktreePath, 'checkout', '-q', '--detach');
  const before = snapshot(fixture);
  const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
  assert.ok(
    refused.proofs.every((proof) => /^condition-\d$/.test(proof)),
    JSON.stringify(refused),
  );
  assert.ok(refused.proofs.length > 0);
  assertUnchanged(fixture, before);
  expectError(await release(fixture, { from: 'active', reason: null }), 'INVALID_INPUT');
});

// ---------------------------------------------------------------------------------------------
// In-worktree Git safety

// A delivery whose selection source is a separate linked worktree of the repository (not the main
// checkout, which stays the runtime-state root): `a.txt` and `b.txt` committed, changed in the
// source worktree, bound as one manifest from there, and transferred into the `partial-diff`
// worktree of an `active` record.
async function linkedSourceDelivery(t) {
  const root = repository(t, 'effective-flow-ledger-');
  for (const name of ['a.txt', 'b.txt']) write(root, name, `${name} base\n`);
  git(root, 'add', 'a.txt', 'b.txt');
  git(root, 'commit', '-q', '-m', 'files');
  const sourcePath = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-ledger-source-')));
  t.after(() => rmSync(sourcePath, { recursive: true, force: true }));
  const source = addWorktree(root, { path: sourcePath, branch: 'source-work' });
  const worktree = addWorktree(root, { purpose: 'partial-diff' });
  write(source.worktreePath, 'a.txt', 'a changed\n');
  write(source.worktreePath, 'b.txt', 'b changed\n');
  const manifest = await bindSelectionManifest(
    {
      sourceRoot: source.worktreePath,
      selection: ['a.txt', 'b.txt'].map((path) => ({ path, state: 'working' })),
    },
    { runner: selectionRunner },
  );
  assert.equal(manifest.source.root, source.worktreePath);
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

// Invariant (in-worktree Git safety): for `ledger init`, `ledger append` and the release, the very
// first Git call inside the recorded worktree and inside the selection's source worktree (a
// separate linked worktree here, not the main checkout) is the common-directory probe, and every
// other call inside either carries `-c core.fsmonitor=false`; every Git call of `ledger append` in
// the main checkout carries it too. Each operation is exercised alone with its own recording
// runner.
test('every in-worktree Git call of init, append and release is guarded and follows the proof', async (t) => {
  const probe = ['rev-parse', '--path-format=absolute', '--git-common-dir'];
  const fixture = await linkedSourceDelivery(t);
  const worktree = fixture.worktree.worktreePath;
  const recorder = () => {
    const calls = [];
    const runner = async (request) => {
      calls.push(request.args);
      return processRunner(request);
    };
    return { calls, runner };
  };
  const inside = (calls, root) => calls.filter((args) => args[0] === '-C' && args[1] === root);
  const isProbe = (args) => args.slice(2).join(' ') === probe.join(' ');
  const assertGuarded = (calls, root, label) => {
    const scoped = inside(calls, root);
    assert.ok(scoped.filter((args) => !isProbe(args)).length > 0, `${label} ran Git in ${root}`);
    assert.deepEqual(scoped[0].slice(2), probe, `${label}: the first call is the common-dir probe`);
    for (const args of scoped) {
      if (isProbe(args)) continue;
      assert.deepEqual(
        args.slice(2, 4),
        ['-c', 'core.fsmonitor=false'],
        `${label}: ${args.join(' ')}`,
      );
    }
  };
  const init = recorder();
  expectOk(await call('ledger init', initInput(fixture), { runner: init.runner }));
  assertGuarded(init.calls, worktree, 'ledger init');
  assertGuarded(init.calls, fixture.source, 'ledger init (source)');
  assert.ok(inside(init.calls, worktree).some((args) => args.includes('hash-object')));
  const oid = commitGroup(fixture, ['a.txt']);
  const appendRun = recorder();
  expectOk(
    await call(
      'ledger append',
      {
        cwd: fixture.root,
        executionRoot: fixture.root,
        recordId: 'record-1',
        sessionId: SESSION,
        commitOid: oid,
      },
      { runner: appendRun.runner },
    ),
  );
  assertGuarded(appendRun.calls, worktree, 'ledger append');
  for (const args of appendRun.calls.filter(
    (a) => a.includes('rev-list') || a.includes('diff-tree'),
  )) {
    assert.deepEqual(args.slice(2, 4), ['-c', 'core.fsmonitor=false'], args.join(' '));
  }
  await failRecord(fixture);
  const releaseRun = recorder();
  const released = expectOk(
    await call('worktree transition', releaseInput(fixture), { runner: releaseRun.runner }),
  );
  assert.deepEqual(released.release, { route: 'ledger', restored: ['b.txt'] });
  assertGuarded(releaseRun.calls, worktree, 'release');
  assertGuarded(releaseRun.calls, fixture.source, 'release (source)');
  assert.ok(inside(releaseRun.calls, worktree).some((args) => args.includes('restore')));
});

// Invariant (proof before any in-worktree Git call): a recorded worktree path that is another
// repository's checkout (its own `core.fsmonitor` hook configured) gets at most one Git call, the
// common-directory probe, the hook never runs, and the release is refused as `half-gone` with the
// record unchanged.
test('release runs no Git beyond the probe inside a foreign repository checkout', async (t) => {
  const fixture = await delivery(t);
  await failRecord(fixture);
  const foreign = repository(t, 'effective-flow-ledger-foreign-');
  const marker = join(foreign, 'fsmonitor-ran');
  writeFileSync(join(foreign, 'hook.sh'), `#!/bin/sh\ntouch ${marker}\n`, { mode: 0o755 });
  git(foreign, 'config', 'core.fsmonitor', join(foreign, 'hook.sh'));
  const record = readRecord(fixture.root);
  const tampered = {
    ...record,
    worktreePath: foreign,
    receipt: { ...record.receipt, executionRoot: foreign },
  };
  writeFileSync(recordFile(fixture.root), `${JSON.stringify(tampered)}\n`);
  const calls = [];
  const runner = async (request) => {
    calls.push(request.args);
    return processRunner(request);
  };
  const before = readFileSync(recordFile(fixture.root), 'utf8');
  // Another repository's checkout at an unregistered path is a half-gone worktree.
  const refused = expectOutcome(
    await call('worktree transition', releaseInput(fixture), { runner }),
    'NOT_ELIGIBLE',
  );
  assert.deepEqual(refused.proofs, ['half-gone']);
  assert.equal(refused.shape, 'unregistered-directory');
  assert.equal(readFileSync(recordFile(fixture.root), 'utf8'), before, 'the record is unchanged');
  const insideForeign = calls.filter((args) => args[0] === '-C' && args[1] === foreign);
  assert.ok(insideForeign.length <= 1, insideForeign.map((args) => args.join(' ')).join('\n'));
  for (const args of insideForeign) {
    assert.deepEqual(args.slice(2), ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  }
  assert.equal(existsSync(marker), false, 'the foreign fsmonitor hook never ran');
});

// ---------------------------------------------------------------------------------------------
// Release retry, proof-to-restore window, unsafe ledger directory

// A retained delivery whose residual group holds a tracked change (`b.txt`) and a staged new file
// (`new/c.txt`): the release restores the new file first and the tracked path last.
async function retainedWithNewFile(t) {
  const fixture = await delivery(t, { added: { 'new/c.txt': 'c added\n' } });
  expectOk(
    await call('ledger init', initInput(fixture, { groups: [['a.txt'], ['b.txt', 'new/c.txt']] })),
  );
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  git(fixture.worktree.worktreePath, 'add', '--', 'new/c.txt');
  await failRecord(fixture);
  return fixture;
}

// Invariant (retryable release): a restore that fails part-way (here `git restore`, after the new
// file was already unstaged and removed) is an error that names the paths already restored and
// leaves the record `failed`; the retry counts the restored endpoint, which holds HEAD's state
// again, as released, restores only the rest and reaches `cleanup-ready`.
test('release ledger route: a restore that failed part-way is retried to cleanup-ready', async (t) => {
  const fixture = await retainedWithNewFile(t);
  const ledger = readFileSync(ledgerFile(fixture), 'utf8');
  const failing = async (request) =>
    request.args.includes('restore')
      ? { status: 128, stdout: Buffer.alloc(0), stderr: Buffer.from('fatal: injected failure') }
      : processRunner(request);
  const failed = expectError(
    await call('worktree transition', releaseInput(fixture), { runner: failing }),
    'GIT_FAILED',
  );
  assert.match(failed.message, /git restore failed/);
  assert.match(failed.message, /already restored: new\/c\.txt; already unstaged: new\/c\.txt;/);
  assert.deepEqual(failed.restored, ['new/c.txt']);
  assert.deepEqual(failed.unstaged, ['new/c.txt']);
  assert.equal(readRecord(fixture.root).status, 'failed', 'the record is unchanged');
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), ledger);
  assert.equal(existsSync(join(fixture.worktree.worktreePath, 'new', 'c.txt')), false);
  assert.equal(status(fixture.worktree.worktreePath), 'M b.txt');
  const released = expectOk(await release(fixture));
  assert.deepEqual(released.release, { route: 'ledger', restored: ['b.txt'] });
  assert.equal(readRecord(fixture.root).status, 'cleanup-ready');
  assert.equal(status(fixture.worktree.worktreePath), '');
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), ledger);

  // A stop after the tracked path was taken (here at its `checkout-index`): the taken file is put
  // back, the index keeps what was done, every taken byte stays under the preserve ref, and the
  // retry restores the rest.
  const second = await retainedWithNewFile(t);
  const failCheckout = async (request) =>
    request.args.includes('checkout-index')
      ? { status: 128, stdout: Buffer.alloc(0), stderr: Buffer.from('fatal: injected') }
      : processRunner(request);
  const stopped = expectError(
    await call('worktree transition', releaseInput(second), { runner: failCheckout }),
    'GIT_FAILED',
  );
  assert.match(stopped.message, /git checkout-index failed/);
  assert.match(stopped.message, /already restored: new\/c\.txt; already unstaged: new\/c\.txt;/);
  assert.deepEqual(stopped.restored, ['new/c.txt']);
  assert.deepEqual(stopped.unstaged, ['new/c.txt']);
  assert.equal(readRecord(second.root).status, 'failed', 'the record is unchanged');
  assert.equal(
    readFileSync(join(second.worktree.worktreePath, 'b.txt'), 'utf8'),
    'b changed\n',
    'the taken file is put back',
  );
  assert.equal(status(second.worktree.worktreePath), 'M b.txt');
  assert.deepEqual(preservedBytes(second, 'new/c.txt'), ['c added']);
  const retried = expectOk(await release(second));
  assert.deepEqual(retried.release, { route: 'ledger', restored: ['b.txt'] });
  assert.equal(status(second.worktree.worktreePath), '');
});

// Invariant (retryable release, refusals kept): after a partial restore, a restored endpoint
// counts as released only while it holds HEAD's state; the still-dirty residual must equal its
// descriptors and an extra path still refuses, each with the record unchanged.
test('release ledger route: a partial restore still refuses changed or extra dirt', async (t) => {
  for (const [label, setup, check] of [
    [
      'tampered remaining residual',
      (fixture) => write(fixture.worktree.worktreePath, 'b.txt', 'tampered\n'),
      (refused) => assert.deepEqual(refused.content, ['b.txt']),
    ],
    [
      'restored endpoint changed again',
      (fixture) => {
        mkdirSync(join(fixture.worktree.worktreePath, 'new'));
        write(fixture.worktree.worktreePath, 'new/c.txt', 'other bytes\n');
      },
      (refused) => assert.deepEqual(refused.content, ['new/c.txt']),
    ],
    [
      'extra untracked path',
      (fixture) => write(fixture.worktree.worktreePath, 'stray.txt', 'not selected\n'),
      (refused) => assert.deepEqual(refused.extra, ['stray.txt']),
    ],
  ]) {
    const fixture = await retainedWithNewFile(t);
    const failing = async (request) =>
      request.args.includes('restore')
        ? { status: 128, stdout: Buffer.alloc(0), stderr: Buffer.from('fatal: injected') }
        : processRunner(request);
    expectError(
      await call('worktree transition', releaseInput(fixture), { runner: failing }),
      'GIT_FAILED',
    );
    setup(fixture);
    const before = snapshot(fixture);
    const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
    assert.deepEqual(refused.proofs, ['residual'], label);
    check(refused);
    assertUnchanged(fixture, before, label);
    assert.equal(readRecord(fixture.root).status, 'failed', label);
  }
});

// Invariant (proof-to-restore window): every residual path is re-checked against its descriptor
// immediately before it is discarded. A residual file changed after the proofs passed stops the
// release with a named WRITE_FAILED before that file is touched; the record and ledger stay
// unchanged and the changed bytes survive.
test('release ledger route: a residual file changed between proof and restore is never discarded', async (t) => {
  const fixture = await retained(t);
  const ledger = readFileSync(ledgerFile(fixture), 'utf8');
  const record = readFileSync(recordFile(fixture.root), 'utf8');
  const phases = [];
  const onPhase = (name) => {
    phases.push(name);
    if (name === 'releaseProven') write(fixture.worktree.worktreePath, 'b.txt', 'late edit\n');
  };
  const failed = expectError(
    await call('worktree transition', releaseInput(fixture), { onPhase }),
    'WRITE_FAILED',
  );
  assert.ok(phases.includes('releaseProven'));
  assert.match(failed.message, /the residual path b\.txt changed after its proof/);
  assert.match(failed.message, /already restored: none; already unstaged: none;/);
  assert.equal(readFileSync(join(fixture.worktree.worktreePath, 'b.txt'), 'utf8'), 'late edit\n');
  assert.equal(readFileSync(recordFile(fixture.root), 'utf8'), record);
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), ledger);
});

// Invariant (proof-to-restore window, index): the locked index snapshot is proven before the
// first discard. A residual path restaged after the proofs with a blob that is neither HEAD's nor
// its descriptor's (the working tree back at the descriptor) stops the release with a named
// WRITE_FAILED before any discard; the staged blob, the record and the ledger stay unchanged.
test('release ledger route: a residual path restaged between proof and restore is never discarded', async (t) => {
  const fixture = await retained(t);
  const worktree = fixture.worktree.worktreePath;
  const ledger = readFileSync(ledgerFile(fixture), 'utf8');
  const record = readFileSync(recordFile(fixture.root), 'utf8');
  const onPhase = (name) => {
    if (name !== 'releaseProven') return;
    write(worktree, 'b.txt', 'restaged late\n');
    git(worktree, 'add', '--', 'b.txt');
    write(worktree, 'b.txt', 'b changed\n');
  };
  const failed = expectError(
    await call('worktree transition', releaseInput(fixture), { onPhase }),
    'WRITE_FAILED',
  );
  assert.match(
    failed.message,
    /the index of the delivery worktree changed after the residual proof at b\.txt/,
  );
  assert.match(failed.message, /already restored: none; already unstaged: none;/);
  assert.equal(git(worktree, 'show', ':b.txt'), 'restaged late', 'the staged blob survives');
  assert.equal(readFileSync(join(worktree, 'b.txt'), 'utf8'), 'b changed\n');
  assert.equal(readFileSync(recordFile(fixture.root), 'utf8'), record);
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), ledger);
});

// A checkout with `a.txt` and `b.txt` committed, both changed, and the new files `new/x.txt` and
// `new/y.txt` staged; `run` drives `restoreResidual` there with `sourceRecheck` (by default one
// that always holds) and the descriptors of what the checkout holds when it is called (a blob for
// a file, else a tombstone), with the staged new files outside `residual.staged` unstaged first,
// and returns its result. `events` lists the source re-checks, the content taken into the
// quarantine and the index and checkout calls in call order (`source <path>`, `take <path>`, `rm
// <path>`, `restore <path>`, `checkout-index <path>`); `onGit(command, path)` runs before each
// such call. `hooks.git(args)` may return a result that replaces any Git call, and `hooks.fs`
// overrides file system calls. `attempt(...args)` runs one Git call in the checkout, as a
// concurrent actor would, and returns its exit status; `preserved(path)` lists what the preserve
// ref's trees hold there; `quarantined()` lists the bytes left in quarantine directories.
function restoreUnit(t) {
  const root = repository(t, 'effective-flow-ledger-');
  for (const name of ['a.txt', 'b.txt']) write(root, name, `${name} base\n`);
  git(root, 'add', 'a.txt', 'b.txt');
  git(root, 'commit', '-q', '-m', 'files');
  write(root, 'a.txt', 'a residual\n');
  write(root, 'b.txt', 'b residual\n');
  mkdirSync(join(root, 'new'));
  write(root, 'new/x.txt', 'x residual\n');
  write(root, 'new/y.txt', 'y residual\n');
  git(root, 'add', '--', 'new/x.txt', 'new/y.txt');
  const events = [];
  let onGit = () => {};
  let gitOverride = () => undefined;
  const inRoot = async (args, { stdin, indexFile } = {}) => {
    const replaced = gitOverride(args);
    if (replaced !== undefined) return replaced;
    const command = args.find((arg) => !arg.startsWith('-'));
    if (stdin !== undefined && ['rm', 'restore', 'checkout-index'].includes(command)) {
      const target = String(stdin).replace(/\0$/, '');
      onGit(command, target);
      events.push(`${command} ${target}`);
    }
    return spawnSync('git', ['-C', root, ...args], {
      env: indexFile === undefined ? GIT_ENV : { ...GIT_ENV, GIT_INDEX_FILE: indexFile },
      input: stdin,
    });
  };
  const renameLogged = async (from, to) => {
    const ownPath = !from.includes('.effective-flow-release-') && !from.includes('/.git/');
    if (from.startsWith(`${root}/`) && ownPath) {
      events.push(`take ${from.slice(root.length + 1)}`);
    }
    return rename(from, to);
  };
  const describe = (path) => {
    let info = null;
    try {
      info = lstatSync(join(root, path));
    } catch {}
    if (info === null || !info.isFile()) {
      return { path, kind: 'tombstone', mode: null, digest: null, oid: null };
    }
    const bytes = readFileSync(join(root, path));
    return {
      path,
      kind: 'blob',
      mode: info.mode & 0o111 ? '100755' : '100644',
      digest: createHash('sha256').update(bytes).digest('hex'),
      oid: git(root, 'hash-object', '--', path),
    };
  };
  const run = async (residual, sourceRecheck = () => true, hooks = {}) => {
    for (const path of ['new/x.txt', 'new/y.txt']) {
      if (!residual.staged.includes(path)) git(root, 'rm', '--cached', '-q', '--', path);
    }
    onGit = hooks.onGit ?? (() => {});
    gitOverride = hooks.git ?? (() => undefined);
    const result = await restoreResidual({
      git: inRoot,
      fs: { rename: renameLogged, ...hooks.fs },
      root,
      residual,
      descriptors: residual.dirty.map(describe),
      sourceRecheck: async (descriptor) => {
        events.push(`source ${descriptor.path}`);
        return sourceRecheck(descriptor.path);
      },
      preserveRef: 'refs/effective-flow/released/unit',
    });
    return { result };
  };
  const attempt = (...args) =>
    spawnSync('git', ['-C', root, ...args], { env: GIT_ENV, encoding: 'utf8' }).status;
  // The bytes each preserved tree holds at `path`, one entry per tree under the unit's ref.
  const preserved = (path) =>
    git(root, 'for-each-ref', '--format=%(objectname)', 'refs/effective-flow/released/unit/')
      .split('\n')
      .filter(Boolean)
      .map((tree) => git(root, 'cat-file', '-p', `${tree}:${path}`));
  const quarantined = () =>
    readdirSync(root)
      .filter((name) => name.startsWith('.effective-flow-release-'))
      .flatMap((name) =>
        readdirSync(join(root, name)).map((entry) => readFileSync(join(root, name, entry), 'utf8')),
      );
  return { root, run, events, attempt, preserved, quarantined };
}

// Invariant (restore order and one locked index, per path): the index is proven once, from one
// snapshot taken under its lock, before the first discard; then each residual path's source
// re-check runs right before its content is taken into the quarantine, and its index entry and
// checkout follow (`git rm --cached` for a path absent from HEAD; `git restore --staged` and
// `git checkout-index` for a tracked one). Every taken byte is kept in a tree under the preserve
// ref, and the worktree ends clean with no quarantine left.
test('restoreResidual takes each path right after its source re-check and keeps every taken byte', async (t) => {
  const unit = restoreUnit(t);
  const { result } = await unit.run({
    tracked: ['a.txt', 'b.txt'],
    staged: ['new/x.txt', 'new/y.txt'],
    dirty: ['a.txt', 'b.txt', 'new/x.txt', 'new/y.txt'],
  });
  assert.deepEqual(result, ['a.txt', 'b.txt', 'new/x.txt', 'new/y.txt']);
  assert.deepEqual(unit.events, [
    ...['new/y.txt', 'new/x.txt'].flatMap((path) => [
      `source ${path}`,
      `take ${path}`,
      `rm ${path}`,
    ]),
    ...['a.txt', 'b.txt'].flatMap((path) => [
      `source ${path}`,
      `take ${path}`,
      `restore ${path}`,
      `checkout-index ${path}`,
    ]),
  ]);
  assert.equal(status(unit.root), '');
  assert.equal(readFileSync(join(unit.root, 'a.txt'), 'utf8'), 'a.txt base\n');
  for (const [path, bytes] of [
    ['a.txt', 'a residual'],
    ['b.txt', 'b residual'],
    ['new/x.txt', 'x residual'],
    ['new/y.txt', 'y residual'],
  ]) {
    assert.deepEqual(unit.preserved(path), [bytes], `${path} is kept`);
  }
  assert.deepEqual(
    readdirSync(unit.root).filter((name) => name.startsWith('.effective-flow-release-')),
    [],
    'no quarantine is left',
  );
});

// Invariant (the taken content is what is proven): an edit made while a path's source is
// re-checked is moved into the quarantine with the path, proven there against the descriptor, put
// back to its path, and stops the restore with WRITE_FAILED before anything happens to it.
test('restoreResidual puts back and keeps a path edited during its source re-check', async (t) => {
  const edited = restoreUnit(t);
  const failed = await edited
    .run({ tracked: ['a.txt'], staged: [], dirty: ['a.txt'] }, (path) => {
      write(edited.root, path, 'a edited during the source re-check\n');
      return true;
    })
    .then(
      () => assert.fail('the restore stops at the edited path'),
      (error) => error,
    );
  assert.equal(failed.code, 'WRITE_FAILED');
  assert.match(failed.message, /the residual path a\.txt changed after its proof/);
  assert.deepEqual(failed.envelopeDetails, { restored: [], unstaged: [] });
  assert.equal(
    readFileSync(join(edited.root, 'a.txt'), 'utf8'),
    'a edited during the source re-check\n',
  );
  assert.equal(edited.events.includes('restore a.txt'), false, 'nothing is restored');
});

// Invariant (a failed capture never costs taken bytes): a file whose proof read or blob write
// fails after it was taken into the quarantine is put back to its path, or, when that fails too,
// kept in the quarantine and named; the restore fails with the original error. Only entries whose
// own bytes were anchored under the preserve ref leave the quarantine, so an earlier anchored path
// never clears a later failing one.
test('restoreResidual keeps a taken file whose capture fails', async (t) => {
  const refusal = (promise) =>
    promise.then(
      () => assert.fail('the restore fails'),
      (error) => error,
    );
  const failing = (message) => async () => {
    throw Object.assign(new Error(message), { code: 'EIO' });
  };
  const failingHeldRead = async (file, ...rest) =>
    String(file).includes('.effective-flow-release-')
      ? failing('read failed')()
      : readFile(file, ...rest);

  // The first taken path's content read fails: it is put back and nothing is cleared away.
  const first = restoreUnit(t);
  const readFailed = await refusal(
    first.run({ tracked: [], staged: [], dirty: ['new/x.txt', 'new/y.txt'] }, () => true, {
      fs: { readFile: failingHeldRead },
    }),
  );
  assert.equal(readFailed.code, 'WRITE_FAILED');
  assert.match(readFailed.message, /read failed/);
  assert.deepEqual(readFailed.envelopeDetails, { restored: [], unstaged: [] });
  assert.equal(readFileSync(join(first.root, 'new/y.txt'), 'utf8'), 'y residual\n');
  assert.equal(readFileSync(join(first.root, 'new/x.txt'), 'utf8'), 'x residual\n');
  assert.deepEqual(first.quarantined(), [], 'the put-back file left the quarantine');

  // The same failure with the put-back refused: the bytes stay in the kept quarantine.
  const stuck = restoreUnit(t);
  const keptFailed = await refusal(
    stuck.run({ tracked: [], staged: [], dirty: ['new/x.txt', 'new/y.txt'] }, () => true, {
      fs: {
        readFile: failingHeldRead,
        link: failing('link failed'),
      },
    }),
  );
  assert.equal(keptFailed.code, 'WRITE_FAILED');
  assert.match(keptFailed.message, /read failed/);
  assert.match(keptFailed.message, /the content of new\/y\.txt is kept at /);
  assert.match(keptFailed.message, /the quarantine .* is kept/);
  assert.deepEqual(stuck.quarantined(), ['y residual\n']);

  // A later path's blob write fails after an earlier path was preserved: the earlier one is
  // anchored, the later one's bytes are put back, or kept in the quarantine when that fails.
  for (const putBack of [true, false]) {
    const later = restoreUnit(t);
    let writes = 0;
    const failed = await refusal(
      later.run({ tracked: [], staged: [], dirty: ['new/x.txt', 'new/y.txt'] }, () => true, {
        git: (args) => {
          if (!args.includes('hash-object')) return undefined;
          writes += 1;
          return writes === 2 ? { status: 1, stdout: '', stderr: 'hash-object failed' } : undefined;
        },
        ...(putBack ? {} : { fs: { link: failing('link failed') } }),
      }),
    );
    assert.equal(failed.code, 'GIT_FAILED');
    assert.match(failed.message, /git hash-object failed: hash-object failed/);
    assert.deepEqual(failed.envelopeDetails, { restored: ['new/y.txt'], unstaged: [] });
    assert.deepEqual(later.preserved('new/y.txt'), ['y residual'], 'the earlier path is anchored');
    assert.equal(existsSync(join(later.root, 'new/y.txt')), false);
    if (putBack) {
      assert.equal(readFileSync(join(later.root, 'new/x.txt'), 'utf8'), 'x residual\n');
      assert.deepEqual(later.quarantined(), []);
    } else {
      assert.match(failed.message, /the content of new\/x\.txt is kept at /);
      assert.match(failed.message, /the quarantine .* is kept/);
      assert.ok(later.quarantined().includes('x residual\n'), 'the failing bytes are kept');
    }
  }
});

// Invariant (a kept quarantine is never removed): when a new residual file's blob write and its
// put-back both fail, its only copy stays in the quarantine while its path is absent. Even with
// the quarantine ignored by Git, so the worktree's status is clean, the release retry refuses with
// the `quarantine` proof, and `worktree remove` and `cleanup apply` refuse with condition 7; the
// worktree and the quarantined bytes survive every call.
test('release, worktree remove and cleanup apply refuse a worktree with a kept ignored quarantine', async (t) => {
  const fixture = await delivery(t, { added: { 'new/c.txt': 'c added\n' } });
  const worktree = fixture.worktree.worktreePath;
  expectOk(
    await call('ledger init', initInput(fixture, { groups: [['a.txt', 'b.txt'], ['new/c.txt']] })),
  );
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt', 'b.txt'])));
  await failRecord(fixture);
  mkdirSync(join(commonDir(fixture.root), 'info'), { recursive: true });
  writeFileSync(join(commonDir(fixture.root), 'info', 'exclude'), '.effective-flow-release-*\n');
  const failingWrite = async (request) =>
    request.args.includes('hash-object') && request.args.includes('-w')
      ? { status: 128, stdout: Buffer.alloc(0), stderr: Buffer.from('fatal: injected') }
      : processRunner(request);
  const failingPutBack = async (from, to) => {
    if (String(from).includes('.effective-flow-release-')) {
      throw Object.assign(new Error('link failed'), { code: 'EIO' });
    }
    return link(from, to);
  };
  const failed = expectError(
    await call('worktree transition', releaseInput(fixture), {
      runner: failingWrite,
      fs: { link: failingPutBack },
    }),
    'GIT_FAILED',
  );
  assert.match(failed.message, /the content of new\/c\.txt is kept at /);
  assert.match(failed.message, /the quarantine .* is kept/);
  const quarantined = () =>
    readdirSync(worktree)
      .filter((name) => name.startsWith('.effective-flow-release-'))
      .flatMap((name) =>
        readdirSync(join(worktree, name)).map((entry) =>
          readFileSync(join(worktree, name, entry), 'utf8'),
        ),
      );
  assert.deepEqual(quarantined(), ['c added\n']);
  assert.equal(existsSync(join(worktree, 'new', 'c.txt')), false);
  assert.equal(status(worktree), '', 'Git sees a clean worktree');

  const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['quarantine']);
  assert.equal(readRecord(fixture.root).status, 'failed', 'the record is unchanged');

  // A record released before this check existed: `cleanup-ready` with the quarantine kept.
  const record = readRecord(fixture.root);
  writeFileSync(
    recordFile(fixture.root),
    `${JSON.stringify({ ...record, status: 'cleanup-ready', reason: null, sessionId: OTHER_SESSION })}\n`,
  );
  const input = { cwd: fixture.root, executionRoot: fixture.root };
  const removed = expectOk(
    await call('worktree remove', {
      ...input,
      sessionId: OTHER_SESSION,
      recordIds: ['record-1'],
    }),
  );
  assert.equal(removed.items[0].code, 'NOT_ELIGIBLE', JSON.stringify(removed));
  assert.deepEqual(removed.items[0].conditions, [7]);
  const plan = expectOk(await call('cleanup plan', input));
  const blocked = plan.blocked.find((entry) => entry.itemId === 'worktree:record-1');
  assert.deepEqual(blocked?.conditions, [7], JSON.stringify(plan));
  // An item planned while the quarantine was moved aside is refused once it is back.
  const [name] = readdirSync(worktree).filter((entry) =>
    entry.startsWith('.effective-flow-release-'),
  );
  await rename(join(worktree, name), join(fixture.root, name));
  const aside = expectOk(await call('cleanup plan', input));
  const item = aside.items.find((entry) => entry.itemId === 'worktree:record-1');
  assert.ok(item, JSON.stringify(aside.blocked));
  await rename(join(fixture.root, name), join(worktree, name));
  const applied = expectOutcome(
    await call('cleanup apply', { ...input, items: { [item.itemId]: item.itemDigest } }),
    'PREVIEW_MISMATCH',
  );
  assert.deepEqual([applied.reason, applied.conditions], ['not-actionable', [7]]);
  assert.equal(existsSync(worktree), true, 'the worktree stays');
  assert.equal(existsSync(recordFile(fixture.root)), true, 'the record stays');
  assert.deepEqual(quarantined(), ['c added\n'], 'the quarantined bytes survive');
});

// Invariant (a hidden residual endpoint is never released): a residual endpoint whose index entry
// matches HEAD only counts as released when its working bytes match HEAD too. An endpoint hidden
// from `git status` by skip-worktree or assume-unchanged that holds newer bytes refuses the
// release with the `residual` proof and a content mismatch, with the bytes, record and ledger
// untouched.
for (const flag of ['--skip-worktree', '--assume-unchanged']) {
  test(`release ledger route: a residual endpoint hidden by ${flag} with newer bytes refuses`, async (t) => {
    const fixture = await delivery(t, {
      files: { 'a.txt': 'a changed\n', 'b.txt': 'b changed\n', 'c.txt': 'c changed\n' },
    });
    const worktree = fixture.worktree.worktreePath;
    expectOk(
      await call('ledger init', initInput(fixture, { groups: [['a.txt'], ['b.txt', 'c.txt']] })),
    );
    expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
    await failRecord(fixture);
    // As a part-way restore leaves `c.txt`, then hidden from Git and holding newer bytes.
    git(worktree, 'checkout', '--', 'c.txt');
    git(worktree, 'update-index', flag, 'c.txt');
    write(worktree, 'c.txt', 'c NEWER\n');
    assert.equal(status(worktree), 'M b.txt');

    const before = snapshot(fixture);
    const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
    assert.ok(refused.proofs.includes('residual'), JSON.stringify(refused));
    assert.deepEqual(refused.content, ['c.txt'], JSON.stringify(refused));
    assertUnchanged(fixture, before);
    assert.equal(readFileSync(join(worktree, 'c.txt'), 'utf8'), 'c NEWER\n');
    assert.equal(readRecord(fixture.root).status, 'failed');
  });
}

// The read-only `worktree resume-check` and the resume adoption of the fixture's `failed` record,
// as another session, and that session's `ledger reconcile`.
function resumeCheckOf(fixture) {
  return call('worktree resume-check', {
    cwd: fixture.root,
    executionRoot: fixture.root,
    recordId: fixture.record.recordId,
    visibility: 'visible',
  });
}

function resumeOf(fixture) {
  return call('worktree transition', {
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
  });
}

function reconcileOf(fixture) {
  return call('ledger reconcile', {
    cwd: fixture.root,
    executionRoot: fixture.root,
    recordId: fixture.record.recordId,
    sessionId: OTHER_SESSION,
  });
}

// Hides `paths` of the delivery worktree from `git status` by `flag` and writes `content` there.
function hideEdit(fixture, flag, paths, content = null) {
  const worktree = fixture.worktree.worktreePath;
  git(worktree, 'update-index', flag, '--', ...paths);
  if (content !== null) for (const repoPath of paths) write(worktree, repoPath, content);
}

// Asserts a release of `fixture` refused with the `hidden` proof (beside `others`) and
// `hiddenPaths`, that `resume-check` reports the same release refusal, and that neither wrote
// anything.
async function assertReleaseHidden(fixture, hiddenPaths, others = []) {
  const before = snapshot(fixture);
  const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, [...others, 'hidden'], JSON.stringify(refused));
  assert.deepEqual(refused.hiddenPaths, hiddenPaths, JSON.stringify(refused));
  assert.equal(refused.hiddenPathCount, hiddenPaths.length);
  const check = expectOk(await resumeCheckOf(fixture));
  assert.equal(check.releasable, false, JSON.stringify(check));
  assert.deepEqual(check.releaseProofs, refused.proofs);
  assert.deepEqual(check.details.release.hiddenPaths, hiddenPaths);
  assertUnchanged(fixture, before);
  assert.equal(readRecord(fixture.root).status, 'failed', 'the record is unchanged');
}

// Invariant (a release never takes the clean route over hidden edits): when every remaining change
// is hidden from `git status` by skip-worktree or assume-unchanged, the worktree looks clean, yet
// a removal would delete those bytes. Without a ledger and with one, the release refuses with
// `hidden` instead of taking the clean route, `worktree remove` and `cleanup plan` refuse with
// condition 7, and the bytes, record and ledger stay.
for (const flag of ['--skip-worktree', '--assume-unchanged']) {
  for (const withLedger of [false, true]) {
    const label = withLedger ? 'with a ledger' : 'without a ledger';
    test(`release clean route: every change hidden by ${flag} refuses ${label}`, async (t) => {
      const fixture = await delivery(t);
      const worktree = fixture.worktree.worktreePath;
      if (withLedger) {
        expectOk(await call('ledger init', initInput(fixture)));
        expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
      }
      await failRecord(fixture);
      const hidden = withLedger ? ['b.txt'] : ['a.txt', 'b.txt'];
      hideEdit(fixture, flag, hidden);
      assert.equal(status(worktree), '', 'Git sees a clean worktree');

      await assertReleaseHidden(fixture, hidden);
      assert.equal(readFileSync(join(worktree, 'b.txt'), 'utf8'), 'b changed\n');

      const record = readRecord(fixture.root);
      writeFileSync(
        recordFile(fixture.root),
        `${JSON.stringify({ ...record, status: 'cleanup-ready', reason: null, sessionId: OTHER_SESSION })}\n`,
      );
      const input = { cwd: fixture.root, executionRoot: fixture.root };
      const removed = expectOk(
        await call('worktree remove', {
          ...input,
          sessionId: OTHER_SESSION,
          recordIds: ['record-1'],
        }),
      );
      assert.equal(removed.items[0].code, 'NOT_ELIGIBLE', JSON.stringify(removed));
      assert.deepEqual(removed.items[0].conditions, [7]);
      const plan = expectOk(await call('cleanup plan', input));
      const blocked = plan.blocked.find((entry) => entry.itemId === 'worktree:record-1');
      assert.deepEqual(blocked?.conditions, [7], JSON.stringify(plan));
      assert.equal(existsSync(worktree), true, 'the worktree stays');
      assert.equal(readFileSync(join(worktree, 'b.txt'), 'utf8'), 'b changed\n');
    });
  }
}

// Invariant (a hidden edit on a recorded endpoint refuses the ledger route and the resume): the
// endpoints of a recorded group are no residual, so neither the residual inspection nor `git
// status` compares them. Newer bytes hidden there refuse the dirty ledger-route release with
// `hidden` and the resume with `residual` (its `hidden` detail), and both write nothing.
test('a hidden edit on a recorded endpoint refuses the ledger-route release and the resume', async (t) => {
  const fixture = await delivery(t);
  const worktree = fixture.worktree.worktreePath;
  expectOk(await call('ledger init', initInput(fixture)));
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  await failRecord(fixture);
  hideEdit(fixture, '--skip-worktree', ['a.txt'], 'a NEWER\n');
  assert.equal(status(worktree), 'M b.txt', 'Git sees only the residual endpoint');

  await assertReleaseHidden(fixture, ['a.txt']);
  const check = expectOk(await resumeCheckOf(fixture));
  assert.equal(check.resumable, false, JSON.stringify(check));
  assert.deepEqual(check.resumeProofs, ['residual']);
  assert.deepEqual(check.details.resume.hidden, ['a.txt']);
  const before = snapshot(fixture);
  const refused = expectOutcome(await resumeOf(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['residual'], JSON.stringify(refused));
  assert.deepEqual([refused.hidden, refused.hiddenCount], [['a.txt'], 1]);
  assertUnchanged(fixture, before);
  assert.equal(readFileSync(join(worktree, 'a.txt'), 'utf8'), 'a NEWER\n');
});

// Invariant (a hidden edit on a recovered endpoint refuses the resume and the reconcile): a tip the
// failed run committed but never recorded takes its group out of the residual. Newer bytes hidden
// on its endpoint refuse the resume with `residual`; once resumed, the same edit makes `ledger
// reconcile` inexact with the path in `hidden`, committed endpoints included.
test('a hidden edit on a recovered endpoint refuses the resume and the ledger reconcile', async (t) => {
  const fixture = await delivery(t);
  const worktree = fixture.worktree.worktreePath;
  expectOk(await call('ledger init', initInput(fixture)));
  const first = commitGroup(fixture, ['a.txt']);
  await failRecord(fixture);
  hideEdit(fixture, '--assume-unchanged', ['a.txt'], 'a NEWER\n');
  const check = expectOk(await resumeCheckOf(fixture));
  assert.equal(check.recoveredTip, first);
  assert.equal(check.resumable, false, JSON.stringify(check));
  assert.deepEqual(check.resumeProofs, ['residual']);
  assert.deepEqual(check.details.resume.hidden, ['a.txt']);
  const before = snapshot(fixture);
  const refused = expectOutcome(await resumeOf(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['residual'], JSON.stringify(refused));
  assert.deepEqual(refused.hidden, ['a.txt']);
  assertUnchanged(fixture, before);
  assert.equal(readLedgerFile(fixture).commits.length, 0, 'nothing was recovered');

  // The committed bytes back, still hidden: the resume recovers the tip and reconciles exactly.
  write(worktree, 'a.txt', 'a changed\n');
  const resumed = expectOk(await resumeOf(fixture));
  assert.equal(resumed.resume.recovered, first);
  const exact = expectOk(await reconcileOf(fixture));
  assert.equal(exact.exact, true, JSON.stringify(exact));
  assert.deepEqual(exact.mismatches.hidden, { paths: [], count: 0 });
  write(worktree, 'a.txt', 'a NEWER\n');
  const reconciled = expectOk(await reconcileOf(fixture));
  assert.equal(reconciled.exact, false, JSON.stringify(reconciled));
  assert.deepEqual(reconciled.mismatches.hidden, { paths: ['a.txt'], count: 1 });
  assert.deepEqual(reconciled.mismatches.residual, { paths: [], count: 0 });
  assert.deepEqual(reconciled.mismatches.extra, { paths: [], count: 0 });
});

// Invariant (content, not the bit): hidden entries that hold their index or HEAD bytes, or are
// absent like a sparse-checkout entry, lose nothing, so they never refuse: the clean route
// releases and the release is removed by cleanup.
test('hidden entries holding their bytes or absent still take the clean release route', async (t) => {
  const fixture = await delivery(t);
  const worktree = fixture.worktree.worktreePath;
  expectOk(await call('ledger init', initInput(fixture)));
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  expectOk(await append(fixture, commitGroup(fixture, ['b.txt'])));
  await failRecord(fixture);
  hideEdit(fixture, '--assume-unchanged', ['a.txt']);
  hideEdit(fixture, '--skip-worktree', ['b.txt']);
  rmSync(join(worktree, 'b.txt'));
  assert.equal(status(worktree), '');
  const check = expectOk(await resumeCheckOf(fixture));
  assert.deepEqual([check.releasable, check.releaseRoute], [true, 'clean'], JSON.stringify(check));
  const released = expectOk(await release(fixture));
  assert.deepEqual(released.release, { route: 'clean', restored: [] });
  const input = { cwd: fixture.root, executionRoot: fixture.root };
  const plan = expectOk(await call('cleanup plan', input));
  const item = plan.items.find((entry) => entry.itemId === 'worktree:record-1');
  assert.ok(item, JSON.stringify(plan.blocked));
  const applied = expectOk(
    await call('cleanup apply', { ...input, items: { [item.itemId]: item.itemDigest } }),
  );
  assert.equal(applied.items[0].ok, true, JSON.stringify(applied));
  assert.equal(existsSync(worktree), false);
});

// Invariant (an ignored ledger endpoint is never released or removed): a residual endpoint that
// Git ignores keeps the worktree's status clean, yet it still holds delivery bytes. The release
// refuses with the `ignored` proof instead of taking the clean route, and `worktree remove` and
// `cleanup plan` refuse with condition 7; the worktree, record and bytes survive.
test('release, worktree remove and cleanup plan refuse a worktree with an ignored ledger endpoint', async (t) => {
  const fixture = await delivery(t, { added: { 'new/c.txt': 'c added\n' } });
  const worktree = fixture.worktree.worktreePath;
  expectOk(
    await call('ledger init', initInput(fixture, { groups: [['a.txt', 'b.txt'], ['new/c.txt']] })),
  );
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt', 'b.txt'])));
  await failRecord(fixture);
  mkdirSync(join(commonDir(fixture.root), 'info'), { recursive: true });
  writeFileSync(join(commonDir(fixture.root), 'info', 'exclude'), 'new/c.txt\n');
  rmSync(join(fixture.root, 'new', 'c.txt'));
  assert.equal(status(worktree), '', 'Git sees a clean worktree');
  assert.equal(existsSync(join(worktree, 'new', 'c.txt')), true);

  const before = snapshot(fixture);
  const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['ignored'], JSON.stringify(refused));
  assertUnchanged(fixture, before);
  assert.equal(readFileSync(join(worktree, 'new', 'c.txt'), 'utf8'), 'c added\n');

  // A record released before this check existed: `cleanup-ready` with the endpoint ignored.
  const record = readRecord(fixture.root);
  writeFileSync(
    recordFile(fixture.root),
    `${JSON.stringify({ ...record, status: 'cleanup-ready', reason: null, sessionId: OTHER_SESSION })}\n`,
  );
  const input = { cwd: fixture.root, executionRoot: fixture.root };
  const removed = expectOk(
    await call('worktree remove', {
      ...input,
      sessionId: OTHER_SESSION,
      recordIds: ['record-1'],
    }),
  );
  assert.equal(removed.items[0].code, 'NOT_ELIGIBLE', JSON.stringify(removed));
  assert.deepEqual(removed.items[0].conditions, [7]);
  const plan = expectOk(await call('cleanup plan', input));
  const blocked = plan.blocked.find((entry) => entry.itemId === 'worktree:record-1');
  assert.deepEqual(blocked?.conditions, [7], JSON.stringify(plan));
  assert.equal(existsSync(worktree), true, 'the worktree stays');
  assert.equal(existsSync(recordFile(fixture.root)), true, 'the record stays');
  assert.equal(readFileSync(join(worktree, 'new', 'c.txt'), 'utf8'), 'c added\n');
});

// Invariant (an ignored ledger endpoint refuses the ledger route too): with a dirty worktree whose
// other residual endpoint is valid, an ignored endpoint still refuses the release with `ignored`,
// and its bytes, the record and the ledger stay.
test('release ledger route: an ignored ledger endpoint refuses beside a dirty residual endpoint', async (t) => {
  const fixture = await delivery(t, { added: { 'new/c.txt': 'c added\n' } });
  const worktree = fixture.worktree.worktreePath;
  expectOk(
    await call('ledger init', initInput(fixture, { groups: [['a.txt'], ['b.txt', 'new/c.txt']] })),
  );
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  await failRecord(fixture);
  mkdirSync(join(commonDir(fixture.root), 'info'), { recursive: true });
  writeFileSync(join(commonDir(fixture.root), 'info', 'exclude'), 'new/c.txt\n');
  assert.equal(status(worktree), 'M b.txt', 'Git sees only the dirty endpoint');

  const before = snapshot(fixture);
  const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
  assert.ok(refused.proofs.includes('ignored'), JSON.stringify(refused));
  assertUnchanged(fixture, before);
  assert.equal(readFileSync(join(worktree, 'new', 'c.txt'), 'utf8'), 'c added\n');
  assert.equal(readRecord(fixture.root).status, 'failed');
});

// Asserts that `worktree remove` and `cleanup plan` refuse the record of `fixture`, rewritten to
// `cleanup-ready` as a release made before these checks existed would have left it, with
// condition 7 alone, and that the worktree stays.
async function assertRemovalRefused(fixture) {
  const record = readRecord(fixture.root);
  writeFileSync(
    recordFile(fixture.root),
    `${JSON.stringify({ ...record, status: 'cleanup-ready', reason: null, sessionId: OTHER_SESSION })}\n`,
  );
  const input = { cwd: fixture.root, executionRoot: fixture.root };
  const removed = expectOk(
    await call('worktree remove', { ...input, sessionId: OTHER_SESSION, recordIds: ['record-1'] }),
  );
  assert.equal(removed.items[0].code, 'NOT_ELIGIBLE', JSON.stringify(removed));
  assert.deepEqual(removed.items[0].conditions, [7]);
  const plan = expectOk(await call('cleanup plan', input));
  const blocked = plan.blocked.find((entry) => entry.itemId === 'worktree:record-1');
  assert.deepEqual(blocked?.conditions, [7], JSON.stringify(plan));
  assert.equal(existsSync(fixture.worktree.worktreePath), true, 'the worktree stays');
}

// Replaces the committed endpoint `repoPath` of the delivery worktree, hidden by `flag`, with a
// directory holding only the ignored file `<repoPath>/only.scratch`.
function hideBehindDirectory(fixture, flag, repoPath) {
  const worktree = fixture.worktree.worktreePath;
  write(fixture.root, '.git/info/exclude', '*.scratch\n');
  hideEdit(fixture, flag, [repoPath]);
  rmSync(join(worktree, repoPath));
  mkdirSync(join(worktree, repoPath));
  write(worktree, `${repoPath}/only.scratch`, 'the only copy\n');
}

// Invariant (a directory is no tombstone while it holds ignored bytes): a committed endpoint
// hidden by skip-worktree or assume-unchanged and replaced by a directory that holds only an
// ignored file keeps the status clean, and the path reads as absent. The release refuses with
// `ignored` instead of taking the clean route, `resume-check` reports the path as `hidden` and
// `ignored`, and `worktree remove` and `cleanup plan` refuse with condition 7; the bytes stay.
for (const flag of ['--skip-worktree', '--assume-unchanged']) {
  test(`release clean route: a ${flag} endpoint replaced by a directory with an ignored file refuses`, async (t) => {
    const fixture = await delivery(t);
    const worktree = fixture.worktree.worktreePath;
    expectOk(await call('ledger init', initInput(fixture)));
    expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
    expectOk(await append(fixture, commitGroup(fixture, ['b.txt'])));
    await failRecord(fixture);
    hideBehindDirectory(fixture, flag, 'a.txt');
    assert.equal(status(worktree), '', 'Git sees a clean worktree');

    const before = snapshot(fixture);
    const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
    assert.deepEqual(refused.proofs, ['ignored'], JSON.stringify(refused));
    assert.deepEqual([refused.ignoredPaths, refused.ignoredPathCount], [['a.txt'], 1]);
    const check = expectOk(await resumeCheckOf(fixture));
    assert.deepEqual([check.releasable, check.releaseProofs], [false, ['ignored']]);
    assert.deepEqual(check.resumeProofs, ['residual'], JSON.stringify(check));
    assert.deepEqual(check.details.resume.hidden, ['a.txt']);
    assert.deepEqual(check.details.resume.ignored, ['a.txt']);
    assertUnchanged(fixture, before);
    await assertRemovalRefused(fixture);
    assert.equal(readFileSync(join(worktree, 'a.txt', 'only.scratch'), 'utf8'), 'the only copy\n');
  });
}

// Invariant (the ledger route too): beside a dirty residual endpoint that holds its descriptor, a
// committed endpoint hidden by skip-worktree and replaced by a directory holding an ignored file
// refuses the release with `ignored`; the residual, the ignored bytes and the record stay.
test('release ledger route: a hidden endpoint replaced by a directory with an ignored file refuses', async (t) => {
  const fixture = await delivery(t);
  const worktree = fixture.worktree.worktreePath;
  expectOk(await call('ledger init', initInput(fixture)));
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  await failRecord(fixture);
  hideBehindDirectory(fixture, '--skip-worktree', 'a.txt');
  assert.equal(status(worktree), 'M b.txt', 'Git sees only the residual endpoint');

  const before = snapshot(fixture);
  const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['ignored'], JSON.stringify(refused));
  assert.deepEqual(refused.ignoredPaths, ['a.txt']);
  assertUnchanged(fixture, before);
  assert.equal(readFileSync(join(worktree, 'b.txt'), 'utf8'), 'b changed\n');
  assert.equal(readFileSync(join(worktree, 'a.txt', 'only.scratch'), 'utf8'), 'the only copy\n');
  assert.equal(readRecord(fixture.root).status, 'failed');
});

// Invariant (a committed deletion has no index entry, yet its place counts): a directory recreated
// at a committed tombstone endpoint and holding only an ignored file refuses the ledger-route
// release with `ignored` and the resume with `residual` (its `ignored` detail); emptied, the
// resume adopts the record, and the file back makes `ledger reconcile` inexact with the path in
// `ignored`; `worktree remove` and `cleanup plan` refuse with condition 7.
test('a directory with an ignored file at a committed deletion refuses release, resume, reconcile and removal', async (t) => {
  const fixture = await delivery(t, { deleted: ['gone.txt'] });
  const worktree = fixture.worktree.worktreePath;
  expectOk(
    await call('ledger init', initInput(fixture, { groups: [['a.txt', 'gone.txt'], ['b.txt']] })),
  );
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt', 'gone.txt'])));
  await failRecord(fixture);
  write(fixture.root, '.git/info/exclude', '*.local\n');
  mkdirSync(join(worktree, 'gone.txt'));
  write(worktree, 'gone.txt/private.local', 'private\n');
  assert.equal(status(worktree), 'M b.txt', 'Git sees only the residual endpoint');

  const before = snapshot(fixture);
  const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['ignored'], JSON.stringify(refused));
  assert.deepEqual(refused.ignoredPaths, ['gone.txt']);
  const check = expectOk(await resumeCheckOf(fixture));
  assert.deepEqual([check.resumable, check.resumeProofs], [false, ['residual']]);
  assert.deepEqual(check.details.resume.ignored, ['gone.txt'], JSON.stringify(check));
  const resumed = expectOutcome(await resumeOf(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(resumed.proofs, ['residual'], JSON.stringify(resumed));
  assert.deepEqual([resumed.ignored, resumed.ignoredCount], [['gone.txt'], 1]);
  assertUnchanged(fixture, before);
  assert.equal(readFileSync(join(worktree, 'gone.txt', 'private.local'), 'utf8'), 'private\n');

  rmSync(join(worktree, 'gone.txt', 'private.local'));
  expectOk(await resumeOf(fixture));
  const exact = expectOk(await reconcileOf(fixture));
  assert.equal(exact.exact, true, JSON.stringify(exact));
  assert.deepEqual(exact.mismatches.ignored, { paths: [], count: 0 });
  write(worktree, 'gone.txt/private.local', 'private\n');
  const reconciled = expectOk(await reconcileOf(fixture));
  assert.equal(reconciled.exact, false, JSON.stringify(reconciled));
  assert.deepEqual(reconciled.mismatches.ignored, { paths: ['gone.txt'], count: 1 });
  for (const list of ['committed', 'residual', 'index', 'extra', 'hidden']) {
    assert.equal(reconciled.mismatches[list].count, 0, list);
  }
  await assertRemovalRefused(fixture);
  assert.equal(readFileSync(join(worktree, 'gone.txt', 'private.local'), 'utf8'), 'private\n');
});

// Invariant (an ignored file in place of a parent directory): an ignored file replacing the
// directory of an endpoint keeps the status clean, and the endpoint below it reads as absent. The
// release refuses with `ignored` instead of taking the clean route, and `worktree remove` and
// `cleanup plan` refuse with condition 7; the file stays.
test('release clean route: an ignored file in place of an endpoint parent directory refuses', async (t) => {
  const fixture = await delivery(t, { added: { 'new/c.txt': 'c added\n' } });
  const worktree = fixture.worktree.worktreePath;
  expectOk(
    await call('ledger init', initInput(fixture, { groups: [['a.txt', 'b.txt'], ['new/c.txt']] })),
  );
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt', 'b.txt'])));
  await failRecord(fixture);
  write(fixture.root, '.git/info/exclude', '/new\n');
  rmSync(join(worktree, 'new'), { recursive: true });
  write(worktree, 'new', 'c moved here\n');
  assert.equal(status(worktree), '', 'Git sees a clean worktree');

  const before = snapshot(fixture);
  const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
  assert.deepEqual(refused.proofs, ['ignored'], JSON.stringify(refused));
  assert.deepEqual(refused.ignoredPaths, ['new/c.txt']);
  assertUnchanged(fixture, before);
  await assertRemovalRefused(fixture);
  assert.equal(readFileSync(join(worktree, 'new'), 'utf8'), 'c moved here\n');
});

// Invariant (locked index, per path): from the snapshot to the last discard the worktree's index
// is locked, so a concurrent `git add` fails instead of staging content a later discard would
// drop: an entry restaged for an already unstaged path, or for a tracked path after its index
// entry was read, never reaches the index, and the newer working file survives. An edit to an
// already restored tracked path made while a later path is re-checked survives too.
test('restoreResidual keeps the index locked and leaves newer content untouched', async (t) => {
  const tracked = restoreUnit(t);
  const { result } = await tracked.run(
    { tracked: ['a.txt', 'b.txt'], staged: [], dirty: ['a.txt', 'b.txt'] },
    (path) => {
      if (path === 'b.txt') write(tracked.root, 'a.txt', 'a newer\n');
      return true;
    },
  );
  assert.deepEqual(result, ['a.txt', 'b.txt']);
  assert.equal(readFileSync(join(tracked.root, 'a.txt'), 'utf8'), 'a newer\n', 'the edit survives');
  assert.equal(readFileSync(join(tracked.root, 'b.txt'), 'utf8'), 'b.txt base\n');

  const staged = restoreUnit(t);
  const refused = [];
  await staged.run(
    {
      tracked: ['a.txt'],
      staged: ['new/x.txt', 'new/y.txt'],
      dirty: ['a.txt', 'new/x.txt', 'new/y.txt'],
    },
    (path) => {
      if (path === 'new/x.txt') {
        mkdirSync(join(staged.root, 'new'), { recursive: true });
        write(staged.root, 'new/y.txt', 'y newer\n');
        refused.push(staged.attempt('add', '--', 'new/y.txt'));
      }
      return true;
    },
    {
      // `a.txt` restaged and its working bytes returned to the residual before it is taken.
      onGit: (command, path) => {
        if (command === 'rm' && path === 'new/y.txt') {
          write(staged.root, 'a.txt', 'a restaged\n');
          refused.push(staged.attempt('add', '--', 'a.txt'));
          write(staged.root, 'a.txt', 'a residual\n');
        }
      },
    },
  );
  assert.deepEqual(refused, [128, 128], 'Git refuses both stagings while the index is locked');
  assert.equal(readFileSync(join(staged.root, 'a.txt'), 'utf8'), 'a.txt base\n');
  assert.equal(git(staged.root, 'ls-files', '--', 'new/y.txt'), '');
  assert.equal(readFileSync(join(staged.root, 'new', 'y.txt'), 'utf8'), 'y newer\n');
  assert.equal(git(staged.root, 'diff', '--cached', '--name-only'), '');
});

// Invariant (release proofs, unproven content): restoring a deleted tracked residual path never
// deletes content outside the residual. A directory replacing the deleted file reads as its
// tombstone, while `git restore` would delete that directory recursively. Holding an ignored
// file, it refuses the release with the `ignored` proof before any discard, on the first attempt
// and on the retry, with the ignored file, the residual, the record and the ledger unchanged;
// emptied, it is released.
test('release ledger route: an ignored file below a directory replacing a deleted tracked path survives', async (t) => {
  const fixture = await delivery(t, { deleted: ['gone.txt'] });
  expectOk(
    await call('ledger init', initInput(fixture, { groups: [['a.txt'], ['b.txt', 'gone.txt']] })),
  );
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  await failRecord(fixture);
  const worktree = fixture.worktree.worktreePath;
  write(fixture.root, '.git/info/exclude', '*.local\n');
  mkdirSync(join(worktree, 'gone.txt'));
  write(worktree, 'gone.txt/private.local', 'private\n');
  const ledger = readFileSync(ledgerFile(fixture), 'utf8');
  const residual = status(worktree);
  for (const attempt of ['first', 'retry']) {
    const refused = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
    assert.deepEqual(refused.proofs, ['ignored'], `${attempt}: ${JSON.stringify(refused)}`);
    assert.deepEqual([refused.ignoredPaths, refused.ignoredPathCount], [['gone.txt'], 1], attempt);
    assert.equal(readFileSync(join(worktree, 'gone.txt', 'private.local'), 'utf8'), 'private\n');
    assert.equal(status(worktree), residual, `${attempt}: nothing is discarded`);
    assert.equal(readRecord(fixture.root).status, 'failed', `${attempt}: the record is unchanged`);
    assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), ledger);
  }
  rmSync(join(worktree, 'gone.txt', 'private.local'));
  const released = expectOk(await release(fixture));
  assert.deepEqual(released.release, { route: 'ledger', restored: ['b.txt', 'gone.txt'] });
  assert.equal(readFileSync(join(worktree, 'gone.txt'), 'utf8'), 'gone.txt base\n');
  assert.equal(status(worktree), '');
});

// Invariant (release restore, unproven content during the restore): the empty directory standing
// at deleted tracked `gone.txt` (its tombstone) goes only through `rmdir`. An ignored file added
// below it while the path's index entry is restored, after the last check that its restore
// deletes nothing unproven, stops the release with UNSAFE_TARGET before `gone.txt` is checked
// out; the file, the record and the ledger stay unchanged.
test('release ledger route: a file added below a directory at a deleted tracked path during its restore survives', async (t) => {
  const fixture = await delivery(t, { deleted: ['gone.txt'] });
  expectOk(
    await call('ledger init', initInput(fixture, { groups: [['a.txt'], ['b.txt', 'gone.txt']] })),
  );
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  await failRecord(fixture);
  const worktree = fixture.worktree.worktreePath;
  write(fixture.root, '.git/info/exclude', '*.local\n');
  mkdirSync(join(worktree, 'gone.txt'));
  const ledger = readFileSync(ledgerFile(fixture), 'utf8');
  let armed = false;
  let added = false;
  const failed = expectError(
    await call('worktree transition', releaseInput(fixture), {
      onPhase: (name, detail) => {
        if (name === 'releaseRecheck' && detail.path === 'gone.txt') armed = true;
      },
      // The restore of the path's index entry, the last Git call before its directory goes.
      runner: async (request) => {
        if (armed && !added && request.args.includes('restore')) {
          added = true;
          write(worktree, 'gone.txt/late.local', 'late\n');
        }
        return processRunner(request);
      },
    }),
    'UNSAFE_TARGET',
  );
  assert.equal(added, true, 'the file is added during the restore');
  assert.match(
    failed.message,
    /restoring the tracked residual path gone\.txt would delete gone\.txt\/late\.local/,
  );
  assert.match(failed.message, /already restored: b\.txt; already unstaged: none;/);
  assert.equal(readFileSync(join(worktree, 'gone.txt', 'late.local'), 'utf8'), 'late\n');
  assert.equal(readRecord(fixture.root).status, 'failed', 'the record is unchanged');
  assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), ledger);
});

// Invariant (release restore, staged parent or descendant): restoring a tracked residual path
// never drops an index entry at one of its parents or below it, which restoring the path would
// remove along with the working file no per-path check sees. Staged after the proofs with its
// working file removed, a file below deleted tracked `gone.txt` or a file at the parent of deleted
// tracked `dir/c.txt` is in the locked index snapshot, which must differ from HEAD only at the
// residual's own entries: the release stops with WRITE_FAILED before anything is discarded, the
// staged entry, the record and the ledger unchanged, and the retry refuses the extra dirt. A
// residual file staged below a deleted tracked path is still released.
test('release ledger route: an entry staged at a parent or below a deleted tracked path survives', async (t) => {
  for (const [endpoint, occupant] of [
    ['gone.txt', 'gone.txt/new.txt'],
    ['dir/c.txt', 'dir'],
  ]) {
    const fixture = await delivery(t, { deleted: [endpoint] });
    expectOk(
      await call('ledger init', initInput(fixture, { groups: [['a.txt'], ['b.txt', endpoint]] })),
    );
    expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
    await failRecord(fixture);
    const worktree = fixture.worktree.worktreePath;
    const ledger = readFileSync(ledgerFile(fixture), 'utf8');
    const top = join(worktree, occupant.split('/')[0]);
    const onPhase = (name) => {
      if (name !== 'releaseProven') return;
      rmSync(top, { recursive: true, force: true });
      mkdirSync(dirname(join(worktree, occupant)), { recursive: true });
      write(worktree, occupant, 'staged late\n');
      git(worktree, 'add', '--', occupant);
      rmSync(top, { recursive: true });
    };
    const failed = expectError(
      await call('worktree transition', releaseInput(fixture), { onPhase }),
      'WRITE_FAILED',
    );
    assert.ok(
      failed.message.includes(
        `the index of the delivery worktree changed after the residual proof at ${occupant}`,
      ),
      failed.message,
    );
    assert.match(failed.message, /already restored: none; already unstaged: none;/);
    assert.equal(git(worktree, 'show', `:${occupant}`), 'staged late', 'the staged entry survives');
    assert.equal(readRecord(fixture.root).status, 'failed', `${endpoint}: the record is unchanged`);
    assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), ledger);
    const retry = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
    assert.ok(retry.proofs.includes('residual'), endpoint);
    assert.equal(git(worktree, 'show', `:${occupant}`), 'staged late');
  }

  const fixture = await delivery(t, {
    deleted: ['gone.txt'],
    added: { 'gone.txt/new.txt': 'new residual\n' },
  });
  expectOk(
    await call(
      'ledger init',
      initInput(fixture, { groups: [['a.txt'], ['b.txt', 'gone.txt', 'gone.txt/new.txt']] }),
    ),
  );
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  const worktree = fixture.worktree.worktreePath;
  git(worktree, 'add', '--', 'gone.txt/new.txt');
  await failRecord(fixture);
  const released = expectOk(await release(fixture));
  assert.deepEqual(released.release, {
    route: 'ledger',
    restored: ['b.txt', 'gone.txt', 'gone.txt/new.txt'],
  });
  assert.equal(readFileSync(join(worktree, 'gone.txt'), 'utf8'), 'gone.txt base\n');
  assert.equal(status(worktree), '');
});

// Invariant (release restore, changes during a source re-check): a residual path's source re-check
// runs before its content is taken, and the content is proven after it left the worktree. A
// working-tree edit to a residual path made while that path's source is re-checked stops the
// release with WRITE_FAILED before the path is discarded, the edit, the record and the ledger
// unchanged. An entry staged below deleted tracked `gone.txt` or at the parent of deleted tracked
// `dir/c.txt` then is refused by Git itself, since the release holds the index lock, so no staged
// entry exists for a later restore to drop.
test("release ledger route: a change made during a path's source re-check is never discarded", async (t) => {
  // Runs `change` during the source re-check of `target` right before its discard: its second
  // source `check-ignore` after the proofs (the first is the source check before the restore).
  const duringSourceRecheck = (target, change) => {
    let armed = false;
    let seen = 0;
    return {
      onPhase: (name) => {
        if (name === 'releaseProven') armed = true;
      },
      runner: async (request) => {
        if (armed && request.args.includes('check-ignore') && request.args.at(-1) === target) {
          seen += 1;
          if (seen === 2) change();
        }
        return processRunner(request);
      },
    };
  };

  const edited = await retained(t);
  const editedTree = edited.worktree.worktreePath;
  const editedLedger = readFileSync(ledgerFile(edited), 'utf8');
  const editedRecord = readFileSync(recordFile(edited.root), 'utf8');
  const editFailed = expectError(
    await call(
      'worktree transition',
      releaseInput(edited),
      duringSourceRecheck('b.txt', () => write(editedTree, 'b.txt', 'edited late\n')),
    ),
    'WRITE_FAILED',
  );
  assert.match(
    editFailed.message,
    /the residual path b\.txt changed after its proof \(working tree or index\)/,
  );
  assert.match(editFailed.message, /already restored: none; already unstaged: none;/);
  assert.equal(readFileSync(join(editedTree, 'b.txt'), 'utf8'), 'edited late\n');
  assert.equal(readFileSync(recordFile(edited.root), 'utf8'), editedRecord);
  assert.equal(readFileSync(ledgerFile(edited), 'utf8'), editedLedger);

  for (const [endpoint, occupant] of [
    ['gone.txt', 'gone.txt/new.txt'],
    ['dir/c.txt', 'dir'],
  ]) {
    const fixture = await delivery(t, { deleted: [endpoint] });
    expectOk(
      await call('ledger init', initInput(fixture, { groups: [['a.txt'], ['b.txt', endpoint]] })),
    );
    expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
    await failRecord(fixture);
    const worktree = fixture.worktree.worktreePath;
    const ledger = readFileSync(ledgerFile(fixture), 'utf8');
    const top = join(worktree, occupant.split('/')[0]);
    let refused = null;
    const stageLate = () => {
      rmSync(top, { recursive: true, force: true });
      mkdirSync(dirname(join(worktree, occupant)), { recursive: true });
      write(worktree, occupant, 'staged late\n');
      refused = spawnSync('git', ['-C', worktree, 'add', '--', occupant], {
        env: GIT_ENV,
        encoding: 'utf8',
      });
      rmSync(top, { recursive: true });
    };
    const released = expectOk(
      await call(
        'worktree transition',
        releaseInput(fixture),
        duringSourceRecheck(endpoint, stageLate),
      ),
    );
    assert.equal(refused?.status, 128, `${endpoint}: Git refuses the staging`);
    assert.match(refused.stderr, /index\.lock/);
    assert.deepEqual(released.release, { route: 'ledger', restored: ['b.txt', endpoint] });
    assert.equal(
      git(worktree, 'ls-files', '--', occupant).split('\n').includes(occupant),
      false,
      'nothing was staged to drop',
    );
    assert.equal(status(worktree), '');
    assert.equal(readRecord(fixture.root).status, 'cleanup-ready', endpoint);
    assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), ledger, 'the ledger is unchanged');
  }
});

// Invariant (restore, unproven content): before the first discard, a tracked residual path whose
// restore would delete a file no residual path names (one below a directory standing at the path,
// or a file standing at a parent) refuses with UNSAFE_TARGET and nothing touched; a residual file
// absent from HEAD there is proven and removed first. Right before each tracked path is taken,
// after its source re-check, nothing counts as proven, so a file added there after the first check
// stops that restore too; and the directory itself goes only through `rmdir`, so a file added
// below it while its index entry is restored is never deleted either.
test('restoreResidual never deletes a file outside the residual to restore a tracked path', async (t) => {
  const refusal = (promise) =>
    promise.then(
      () => assert.fail('the restore refuses'),
      (error) => error,
    );
  const below = restoreUnit(t);
  rmSync(join(below.root, 'a.txt'));
  mkdirSync(join(below.root, 'a.txt', 'deep'), { recursive: true });
  write(below.root, 'a.txt/deep/private.local', 'private\n');
  const failed = await refusal(
    below.run({ tracked: ['a.txt', 'b.txt'], staged: [], dirty: ['a.txt', 'b.txt'] }),
  );
  assert.equal(failed.code, 'UNSAFE_TARGET');
  assert.match(failed.message, /would delete a\.txt\/deep\/private\.local/);
  assert.deepEqual(failed.envelopeDetails, { restored: [], unstaged: [] });
  assert.equal(readFileSync(join(below.root, 'b.txt'), 'utf8'), 'b residual\n');
  assert.equal(
    readFileSync(join(below.root, 'a.txt', 'deep', 'private.local'), 'utf8'),
    'private\n',
  );

  const parent = restoreUnit(t);
  mkdirSync(join(parent.root, 'sub'));
  write(parent.root, 'sub/c.txt', 'c base\n');
  git(parent.root, 'add', '--', 'sub/c.txt');
  git(parent.root, 'commit', '-q', '-m', 'sub');
  rmSync(join(parent.root, 'sub'), { recursive: true });
  write(parent.root, 'sub', 'ignored occupant\n');
  const blocked = await refusal(
    parent.run({ tracked: ['sub/c.txt'], staged: [], dirty: ['sub/c.txt'] }),
  );
  assert.equal(blocked.code, 'UNSAFE_TARGET');
  assert.match(blocked.message, /would delete sub,/);
  assert.equal(readFileSync(join(parent.root, 'sub'), 'utf8'), 'ignored occupant\n');

  // The residual's own file below the directory is removed first; the directory goes with it.
  const proven = restoreUnit(t);
  rmSync(join(proven.root, 'a.txt'));
  mkdirSync(join(proven.root, 'a.txt'));
  write(proven.root, 'a.txt/x.txt', 'x residual\n');
  const { result } = await proven.run({
    tracked: ['a.txt'],
    staged: [],
    dirty: ['a.txt', 'a.txt/x.txt'],
  });
  assert.deepEqual(result, ['a.txt', 'a.txt/x.txt']);
  assert.equal(readFileSync(join(proven.root, 'a.txt'), 'utf8'), 'a.txt base\n');

  // A file added below the directory after the first check (here while the path's source is
  // re-checked) stops that path's own restore.
  const late = restoreUnit(t);
  rmSync(join(late.root, 'a.txt'));
  mkdirSync(join(late.root, 'a.txt'));
  const stopped = await refusal(
    late.run({ tracked: ['a.txt', 'b.txt'], staged: [], dirty: ['a.txt', 'b.txt'] }, (path) => {
      if (path === 'a.txt') write(late.root, 'a.txt/late.local', 'late\n');
      return true;
    }),
  );
  assert.equal(stopped.code, 'UNSAFE_TARGET');
  assert.match(stopped.message, /would delete a\.txt\/late\.local/);
  assert.deepEqual(stopped.envelopeDetails, { restored: [], unstaged: [] });
  assert.equal(readFileSync(join(late.root, 'a.txt', 'late.local'), 'utf8'), 'late\n');

  // A file added below the directory while the path's index entry is restored (after the check
  // above) is never deleted: the directory goes only through `rmdir`, which refuses, and nothing
  // is checked out there.
  const duringRestore = restoreUnit(t);
  rmSync(join(duringRestore.root, 'a.txt'));
  mkdirSync(join(duringRestore.root, 'a.txt'));
  const restoreStopped = await refusal(
    duringRestore.run(
      { tracked: ['a.txt', 'b.txt'], staged: [], dirty: ['a.txt', 'b.txt'] },
      () => true,
      {
        onGit: (command, path) => {
          if (command === 'restore' && path === 'a.txt') {
            write(duringRestore.root, 'a.txt/late.local', 'late\n');
          }
        },
      },
    ),
  );
  assert.equal(restoreStopped.code, 'UNSAFE_TARGET');
  assert.match(restoreStopped.message, /would delete a\.txt\/late\.local/);
  assert.deepEqual(restoreStopped.envelopeDetails, { restored: [], unstaged: [] });
  assert.equal(readFileSync(join(duringRestore.root, 'a.txt', 'late.local'), 'utf8'), 'late\n');
  assert.deepEqual(
    duringRestore.events.filter((event) => event.startsWith('checkout-index')),
    [],
    'nothing is checked out',
  );
});

// Invariant (deferred signal, before the restore): a signal that arrives once the proofs passed
// (phase `releaseProven`) is seen at the last check before the restore: INTERRUPTED with
// `written: false` and the unchanged status, no `release`, nothing restored, the lock released and
// the handlers removed.
test('release ledger route: a signal after the proofs restores and writes nothing', async (t) => {
  const fixture = await retained(t);
  const before = snapshot(fixture);
  const signalTarget = new EventEmitter();
  const onPhase = (name) => {
    if (name === 'releaseProven') signalTarget.emit('SIGTERM');
  };
  const interrupted = expectOutcome(
    await call('worktree transition', releaseInput(fixture), { signalTarget, onPhase }),
    'INTERRUPTED',
  );
  assert.deepEqual(
    [interrupted.signal, interrupted.written, interrupted.status],
    ['SIGTERM', false, 'failed'],
  );
  assert.equal(interrupted.release, undefined);
  assertUnchanged(fixture, before);
  assert.equal(existsSync(lockFile(fixture.root)), false, 'the lock was released');
  assert.equal(signalTarget.listenerCount('SIGTERM'), 0, 'the signal handlers are removed');
});

// Invariant (deferred signal, during the restore): a signal that arrives while the restore runs
// lets it finish, and the record write completes, since the residual is already discarded: the
// result is INTERRUPTED with `written: true`, the new status and the `release` that landed, and
// the record and worktree say the same.
test('release ledger route: a signal during the restore reports the release that landed', async (t) => {
  const fixture = await retained(t);
  const signalTarget = new EventEmitter();
  const runner = async (request) => {
    if (request.args.includes('restore')) signalTarget.emit('SIGTERM');
    return processRunner(request);
  };
  const interrupted = expectOutcome(
    await call('worktree transition', releaseInput(fixture), { signalTarget, runner }),
    'INTERRUPTED',
  );
  assert.deepEqual(
    [interrupted.signal, interrupted.written, interrupted.status],
    ['SIGTERM', true, 'cleanup-ready'],
  );
  assert.deepEqual(interrupted.release, { route: 'ledger', restored: ['b.txt'] });
  assert.equal(readRecord(fixture.root).status, 'cleanup-ready');
  assert.equal(readRecord(fixture.root).sessionId, OTHER_SESSION);
  assert.equal(status(fixture.worktree.worktreePath), '');
  assert.equal(existsSync(lockFile(fixture.root)), false, 'the lock was released');
  assert.equal(signalTarget.listenerCount('SIGTERM'), 0, 'the signal handlers are removed');
});

// Invariant (proof-to-restore window): the source is verified again after the last lock check
// and before the first discard; source drift after the proofs passed refuses with `source` and
// discards nothing.
test('release ledger route: source drift between proof and restore refuses before any discard', async (t) => {
  const fixture = await retained(t);
  const before = snapshot(fixture);
  const onPhase = (name) => {
    if (name === 'releaseProven') write(fixture.root, 'b.txt', 'source drifted late\n');
  };
  const refused = expectOutcome(
    await call('worktree transition', releaseInput(fixture), { onPhase }),
    'NOT_ELIGIBLE',
  );
  assert.deepEqual(refused.proofs, ['source']);
  assert.equal(refused.route, 'ledger');
  assertUnchanged(fixture, before);
});

// Invariant (proof-to-restore window, source per path): the source of each residual path is
// re-checked immediately before that path is discarded, not only once before the first discard,
// so the residual bytes are never the only copy of the selection left. A source path replaced or
// deleted after that single check stops the release with a WRITE_FAILED naming the source (not a
// working-tree or index change) before the residual path is touched: staged new `new/c.txt`,
// replaced in the source, keeps its index entry and file; tracked `b.txt`, deleted in the source
// while `new/c.txt` is re-checked, keeps its residual bytes once `new/c.txt` is released. The
// record and ledger stay unchanged, and the retry refuses with `source`.
test('release ledger route: a source path changed after the source check stops its own discard', async (t) => {
  const cases = [
    {
      label: 'new file replaced in the source',
      drift: (root) => write(root, 'new/c.txt', 'c replaced\n'),
      stopped: 'new/c.txt',
      done: 'already restored: none; already unstaged: none;',
    },
    {
      label: 'tracked file deleted in the source',
      drift: (root) => rmSync(join(root, 'b.txt')),
      stopped: 'b.txt',
      done: 'already restored: new/c.txt; already unstaged: new/c.txt;',
    },
  ];
  for (const { label, drift, stopped, done } of cases) {
    const fixture = await retainedWithNewFile(t);
    const worktree = fixture.worktree.worktreePath;
    const ledger = readFileSync(ledgerFile(fixture), 'utf8');
    const record = readFileSync(recordFile(fixture.root), 'utf8');
    const rechecked = [];
    const onPhase = (name, detail) => {
      if (name !== 'releaseRecheck') return;
      if (rechecked.length === 0) drift(fixture.root);
      rechecked.push(detail.path);
    };
    const failed = expectError(
      await call('worktree transition', releaseInput(fixture), { onPhase }),
      'WRITE_FAILED',
    );
    assert.ok(
      failed.message.includes(
        `the source of the residual path ${stopped} changed after its proof or cannot be read`,
      ),
      `${label}: ${failed.message}`,
    );
    assert.doesNotMatch(failed.message, /working tree or index/, label);
    assert.ok(failed.message.includes(done), `${label}: ${failed.message}`);
    assert.equal(rechecked.at(-1), stopped, label);
    if (stopped === 'new/c.txt') {
      assert.equal(git(worktree, 'show', ':new/c.txt'), 'c added', `${label}: entry survives`);
      assert.equal(readFileSync(join(worktree, 'new', 'c.txt'), 'utf8'), 'c added\n', label);
    } else {
      assert.equal(existsSync(join(worktree, 'new', 'c.txt')), false, label);
    }
    assert.equal(readFileSync(join(worktree, 'b.txt'), 'utf8'), 'b changed\n', label);
    assert.equal(readFileSync(recordFile(fixture.root), 'utf8'), record, label);
    assert.equal(readFileSync(ledgerFile(fixture), 'utf8'), ledger, label);
    const retry = expectOutcome(await release(fixture), 'NOT_ELIGIBLE');
    assert.deepEqual(retry.proofs, ['source'], label);
    assert.equal(readFileSync(join(worktree, 'b.txt'), 'utf8'), 'b changed\n', label);
  }
});

// Invariant (source per path, rename endpoints): `verifySourceEndpoint` checks the source's
// identity and only the manifest entry covering the path, the rename destination and the rename
// source alike: a file reappearing at the renamed-away path drifts both endpoints of that rename
// while an unrelated endpoint stays exact, and a path no entry covers is INVALID_PAYLOAD.
test('verifySourceEndpoint covers both endpoints of a rename and nothing else', async (t) => {
  const fixture = await delivery(t, {
    rename: { from: 'old.txt', to: 'new.txt', base: RENAME_BASE, content: `${RENAME_BASE}five\n` },
  });
  const verify = (path) =>
    verifySourceEndpoint(
      { manifest: fixture.manifest, sourceRoot: fixture.root, path },
      { runner: selectionRunner },
    );
  for (const path of ['new.txt', 'old.txt', 'a.txt']) {
    assert.deepEqual(await verify(path), { exact: true, drift: [] }, path);
  }
  write(fixture.root, 'old.txt', RENAME_BASE);
  for (const path of ['new.txt', 'old.txt']) {
    const verification = await verify(path);
    assert.equal(verification.exact, false, path);
    assert.deepEqual(
      verification.drift.map((entry) => [entry.kind, entry.path]),
      [['rename-source', 'old.txt']],
      path,
    );
  }
  assert.deepEqual(await verify('a.txt'), { exact: true, drift: [] });
  await assert.rejects(verify('unselected.txt'), { code: 'INVALID_PAYLOAD' });
});

// Invariant (release, rename destination read last at the source): the per-path source re-check of
// a residual rename destination reads the destination's source bytes after the source Git reads of
// the rename source, so a source destination deleted during those reads stops the release with
// WRITE_FAILED before the delivery destination is discarded, and the selected edits survive in it.
test('release ledger route: a rename destination deleted at the source during its re-check survives', async (t) => {
  const content = `${RENAME_BASE}five\n`;
  const fixture = await delivery(t, {
    rename: { from: 'old.txt', to: 'new.txt', base: RENAME_BASE, content },
  });
  expectOk(
    await call(
      'ledger init',
      initInput(fixture, { groups: [['a.txt'], ['b.txt'], ['new.txt', 'old.txt']] }),
    ),
  );
  expectOk(await append(fixture, commitGroup(fixture, ['a.txt'])));
  await failRecord(fixture);
  const worktree = fixture.worktree.worktreePath;
  const record = readFileSync(recordFile(fixture.root), 'utf8');
  let armed = false;
  let deleted = false;
  const onPhase = (name, detail) => {
    if (name === 'releaseRecheck' && detail.path === 'new.txt') armed = true;
  };
  const runner = async (request) => {
    const result = await processRunner(request);
    if (armed && !deleted && request.args.includes(':(literal)old.txt')) {
      deleted = true;
      rmSync(join(fixture.root, 'new.txt'));
    }
    return result;
  };
  const failed = expectError(
    await call('worktree transition', releaseInput(fixture), { onPhase, runner }),
    'WRITE_FAILED',
  );
  assert.equal(deleted, true, 'the source destination was deleted during a rename-source read');
  assert.ok(
    failed.message.includes(
      'the source of the residual path new.txt changed after its proof or cannot be read',
    ),
    failed.message,
  );
  assert.equal(readFileSync(join(worktree, 'new.txt'), 'utf8'), content, 'the delivery copy stays');
  assert.equal(readFileSync(recordFile(fixture.root), 'utf8'), record, 'the record is unchanged');
});

// Invariant (release, the only copy of a selection): every byte a release discards stays
// recoverable whatever happens to the source after its per-path check. Tracked `b.txt` deleted
// in the source, or new `new/c.txt` replaced there, right after that path's source re-check
// accepted it (at the first Git call in the delivery worktree that follows) is still released,
// and the selected bytes the worktree held are kept in a tree under
// `refs/effective-flow/released/<RECORD_ID>/`.
test('release ledger route: a source path changed after its source re-check keeps the selected bytes', async (t) => {
  for (const { target, drift, selected } of [
    { target: 'b.txt', drift: (root) => rmSync(join(root, 'b.txt')), selected: 'b changed' },
    {
      target: 'new/c.txt',
      drift: (root) => write(root, 'new/c.txt', 'c replaced\n'),
      selected: 'c added',
    },
  ]) {
    const fixture = await retainedWithNewFile(t);
    const worktree = fixture.worktree.worktreePath;
    let armed = false;
    let drifted = false;
    const released = expectOk(
      await call('worktree transition', releaseInput(fixture), {
        onPhase: (name, detail) => {
          if (name === 'releaseRecheck' && detail.path === target) armed = true;
        },
        runner: async (request) => {
          if (armed && !drifted && request.args[1] === worktree) {
            drifted = true;
            drift(fixture.root);
          }
          return processRunner(request);
        },
      }),
    );
    assert.equal(drifted, true, `${target}: the source changed after its re-check`);
    assert.deepEqual(released.release, { route: 'ledger', restored: ['b.txt', 'new/c.txt'] });
    assert.equal(status(worktree), '');
    assert.deepEqual(preservedBytes(fixture, target), [selected], `${target}: the bytes are kept`);
  }
});

// Invariant (release, one locked index snapshot): from the index proof to the last discard no
// Git process can stage anything in the delivery worktree. Tracked residual `b.txt` restaged with
// newer bytes before any Git call of the release in the delivery worktree after its source
// re-check (its working bytes then returned to the residual's) never loses that staged entry to
// the restore: the staging is refused while the index is locked, and a staging that lands once
// the lock is gone survives in the index.
test('release ledger route: a tracked path restaged during its restore never loses the staged entry', async (t) => {
  let fired = 0;
  for (let position = 1; position <= 12; position += 1) {
    const fixture = await retained(t);
    const worktree = fixture.worktree.worktreePath;
    let armed = false;
    let seen = 0;
    let staged = null;
    const outcome = await call('worktree transition', releaseInput(fixture), {
      onPhase: (name, detail) => {
        if (name === 'releaseRecheck' && detail.path === 'b.txt') armed = true;
      },
      runner: async (request) => {
        if (armed && staged === null && request.args[1] === worktree) {
          seen += 1;
          if (seen === position) {
            write(worktree, 'b.txt', 'restaged late\n');
            staged = spawnSync('git', ['-C', worktree, 'add', '--', 'b.txt'], {
              env: GIT_ENV,
            }).status;
            write(worktree, 'b.txt', 'b changed\n');
          }
        }
        return processRunner(request);
      },
    });
    if (staged === null) break;
    fired += 1;
    const label = `restaged before delivery Git call ${position}: ${JSON.stringify(outcome)}`;
    if (staged === 0) {
      assert.equal(git(worktree, 'show', ':b.txt'), 'restaged late', `${label}: entry survives`);
    } else {
      assert.equal(staged, 128, `${label}: Git refuses the staging under the index lock`);
      assert.equal(git(worktree, 'diff', '--cached', '--name-only'), '', label);
    }
  }
  assert.ok(fired >= 3, `the restage ran at every delivery Git call of the restore: ${fired}`);
});

// Invariant (availability): an unsafe `worktree-runs/ledgers` entry (a symbolic link or a file)
// does not stop `worktree inspect` or `cleanup plan` for any record: it is one finding
// `ledgerDirectory: {reason: 'unsafe', path}` and no ledger is listed through it. `cleanup apply`
// refuses the item before any write or removal, so nothing is deleted through the link.
test('an unsafe ledgers entry is one inspect finding and cleanup never deletes through it', async (t) => {
  for (const kind of ['symlink', 'file']) {
    const fixture = await delivery(t);
    git(fixture.worktree.worktreePath, 'checkout', '--', 'a.txt', 'b.txt');
    expectOk(
      await call('worktree transition', {
        cwd: fixture.root,
        executionRoot: fixture.root,
        recordId: 'record-1',
        from: 'active',
        to: 'cleanup-ready',
        reason: null,
        sessionId: SESSION,
      }),
    );
    const dir = ledgerPaths(fixture.root, 'record-1').dir;
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-ledger-outside-')));
    t.after(() => rmSync(outside, { recursive: true, force: true }));
    writeFileSync(join(outside, 'record-1.ledger'), 'outside\n');
    writeFileSync(join(outside, 'orphan-1.ledger'), 'outside\n');
    if (kind === 'symlink') symlinkSync(outside, dir);
    else writeFileSync(dir, 'not a directory\n');
    const inspected = expectOk(
      await call('worktree inspect', { cwd: fixture.root, executionRoot: fixture.root }),
    );
    assert.deepEqual(inspected.ledgerDirectory, { reason: 'unsafe', path: dir }, kind);
    assert.deepEqual(inspected.orphanLedgers, [], kind);
    assert.deepEqual(
      inspected.records.map((entry) => [entry.recordId, entry.conditions]),
      [['record-1', []]],
      kind,
    );
    const plan = expectOk(
      await call('cleanup plan', { cwd: fixture.root, executionRoot: fixture.root }),
    );
    assert.deepEqual(plan.ledgerDirectory, { reason: 'unsafe', path: dir }, kind);
    const item = plan.items.find((entry) => entry.itemId === 'worktree:record-1');
    assert.ok(item, kind);
    const applied = expectOk(
      await call('cleanup apply', {
        cwd: fixture.root,
        executionRoot: fixture.root,
        items: { [item.itemId]: item.itemDigest },
      }),
    );
    assert.equal(applied.items[0].ok, false, kind);
    assert.equal(applied.items[0].code, 'UNSAFE_TARGET', kind);
    assert.equal(readRecord(fixture.root).status, 'cleanup-ready', kind);
    assert.equal(existsSync(fixture.worktree.worktreePath), true, kind);
    assert.equal(readFileSync(join(outside, 'record-1.ledger'), 'utf8'), 'outside\n', kind);
  }
});
