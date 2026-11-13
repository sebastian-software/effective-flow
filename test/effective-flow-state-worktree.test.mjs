// Tests of the runtime-state helper's worktree-lifecycle and cleanup operations: the closed key
// sets, the record schema, the pure eligibility evaluator, item digests and decisions, every
// lifecycle transition, `record-init` per purpose, claim-remove-reconcile with injected runner,
// filesystem, clock and signals, and `cleanup plan` / `cleanup apply` selection by digest. Git-backed
// cases that need real branch histories (the patch-id proof, legacy guards) live in
// `effective-flow-state-git.test.mjs`.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { mkdir as makeDirectory, open as openPath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import {
  OPERATION_KEYS,
  STATE_OPERATIONS,
  exitCodeFor,
} from '../src/scripts/effective-flow-state-core.mjs';
import {
  CLAIM_KEYS,
  DEFAULT_DEADLINE_MS,
  ELIGIBILITY_CONDITIONS,
  ITEM_FLOOR_MS,
  PROSE_BASH_TIMEOUT_MS,
  RECONCILE_RESERVE_MS,
  RECORD_KEYS,
  RECORD_STATUSES,
  TRANSITIONS,
  BLOCKERS,
  CLAIMABLE_STATUSES,
  INVALID_RECORD_TERMINAL_STATUSES,
  MAX_RECORD_IDS,
  MERGE_GATE_RELEASE_STATUSES,
  assessEligibility,
  canonicalJson,
  evaluateEligibility,
  itemDigest,
  parseWorktreeList,
  recordProblem,
  requireDecisions,
} from '../src/scripts/effective-flow-state-worktree-core.mjs';
import { main } from '../src/scripts/effective-flow-state.mjs';
import { createProcessRunner } from '../src/scripts/process-runner.mjs';
import { unreachableRunner } from './support/state-helper-fixtures.mjs';
import { RELEASE_QUARANTINE_PREFIX } from '../src/scripts/effective-flow-state-ledger-core.mjs';
import {
  SESSION,
  addWorktree,
  baseDir,
  call,
  expectError,
  expectOk,
  expectOutcome,
  git,
  initialized,
  legacyRecord,
  lockFile,
  makeRecord,
  moveTo,
  readRecord,
  recordFile,
  repository,
  requiredPath,
  writeRecordFile,
} from './support/worktree-fixtures.mjs';

const WORKTREE_OPERATIONS = Object.freeze([
  'worktree record-init',
  'worktree transition',
  'worktree inspect',
  'worktree remove',
  'cleanup plan',
  'cleanup apply',
]);

// A runner that answers one git call itself when `intercept(args)` returns a result.
function interceptingRunner(intercept) {
  const real = createProcessRunner();
  const calls = [];
  const runner = async (request) => {
    const args = request.args.slice(2);
    calls.push(args);
    const answer = await intercept(args, request);
    return answer ?? real(request);
  };
  return { runner, calls };
}

function lockDirs(root) {
  const dir = join(root, '.effective-flow', 'worktree-runs');
  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.lock')) : [];
}

// ---------------------------------------------------------------------------------------------
// Closed key sets

// Invariant: the six operations take exactly the key sets of the plan, `cwd` included, and an
// unknown key is refused before any git call.
test('the six operations have the planned closed key sets and refuse unknown keys before git', async () => {
  assert.deepEqual(
    STATE_OPERATIONS.filter((operation) => WORKTREE_OPERATIONS.includes(operation)),
    [...WORKTREE_OPERATIONS],
  );
  assert.deepEqual(
    Object.fromEntries(
      WORKTREE_OPERATIONS.map((operation) => [operation, [...OPERATION_KEYS[operation]]]),
    ),
    {
      'worktree record-init': ['cwd', 'executionRoot', 'record'],
      'worktree transition': [
        'cwd',
        'executionRoot',
        'recordId',
        'from',
        'to',
        'reason',
        'sessionId',
        'branch',
        'workflow',
        'fetchedHeadOid',
        'release',
        'adoption',
        'visibility',
      ],
      'worktree inspect': ['cwd', 'executionRoot', 'sessionId'],
      'worktree remove': ['cwd', 'executionRoot', 'sessionId', 'recordIds', 'integrationRoot'],
      'cleanup plan': ['cwd', 'executionRoot', 'decisions'],
      'cleanup apply': ['cwd', 'executionRoot', 'decisions', 'items'],
    },
  );
  for (const operation of WORKTREE_OPERATIONS) {
    const { executeOperation } = await import('../src/scripts/effective-flow-state-core.mjs');
    const envelope = await executeOperation(
      operation,
      { cwd: '/tmp', executionRoot: '/tmp', extra: true },
      { runner: unreachableRunner() },
    );
    assert.equal(
      envelope.error?.code,
      'INVALID_INPUT',
      `${operation}: ${JSON.stringify(envelope)}`,
    );
    assert.match(envelope.error.message, /unknown input field: extra/);
  }
});

// Invariant: an extra argv token is refused before stdin is read, so an allowlisted prefix cannot
// be widened into a destructive call.
test('CLI: a worktree or cleanup operation with an extra argv token never reads stdin', async () => {
  for (const argv of [
    ['worktree', 'remove', 'x'],
    ['cleanup', 'apply', '--force'],
    ['worktree', 'inspect', '{}'],
  ]) {
    const io = {
      stdout: { write: () => {} },
      stderr: { write: () => {} },
      stdin: {
        [Symbol.asyncIterator]() {
          throw new Error('stdin must not be read');
        },
      },
      setExitCode: (code) => (io.exitCode = code),
    };
    const envelope = await main(argv, io);
    assert.equal(envelope.error.code, 'INVALID_INPUT');
    assert.equal(io.exitCode, 2);
  }
});

// Invariant: every new outcome is an outcome (exit 4) and has a CLI message line.
test('CLI: a worktree outcome prints its message and exits 4', async (t) => {
  const root = repository(t);
  const lines = [];
  const io = {
    stdout: { write: () => {} },
    stderr: { write: (line) => lines.push(line) },
    input: {
      cwd: root,
      executionRoot: root,
      recordId: 'record-1',
      from: 'cleanup-ready',
      to: 'active',
      reason: null,
      sessionId: SESSION,
      branch: 'x',
      workflow: 'build',
      fetchedHeadOid: '0'.repeat(40),
    },
    setExitCode: (code) => (io.exitCode = code),
  };
  const envelope = await main(['worktree', 'transition'], io);
  assert.equal(envelope.outcome.code, 'TRANSITION_INVALID');
  assert.equal(io.exitCode, 4);
  assert.match(lines.join(''), /^TRANSITION_INVALID: cleanup-ready -> active is not a valid/);
});

// ---------------------------------------------------------------------------------------------
// Record schema

// Invariant: the helper accepts exactly the version 1 key set `build-run-core.mjs` checks with
// `exact()`, plus the two claim keys only during `cleanup-in-progress`.
test('recordProblem accepts the exact v1 key set and refuses unknown, missing and claim keys', (t) => {
  const root = repository(t);
  const record = makeRecord(root, {
    worktreePath: requiredPath(root),
    branch: 'effective-flow/delivery/x',
    head: 'a'.repeat(40),
  });
  assert.deepEqual(Object.keys(record), [...RECORD_KEYS]);
  assert.equal(recordProblem(record), null);
  assert.equal(recordProblem({ ...record, extra: 1 }), 'unknown-key');
  const { reason, ...missing } = record;
  assert.equal(recordProblem(missing), 'missing-key');
  assert.equal(
    recordProblem({ ...record, cleanupRunId: 'x', claimedAt: record.createdAt }),
    'unknown-key',
  );
  assert.equal(
    recordProblem({
      ...record,
      status: 'cleanup-in-progress',
      cleanupRunId: 'cleanup-1',
      claimedAt: '2026-11-03T10:00:00Z',
    }),
    null,
  );
  assert.equal(recordProblem({ ...record, status: 'cleanup-in-progress' }), 'missing-key');
  assert.equal(recordProblem(record, 'other-id'), 'record-id-file-mismatch');
  assert.deepEqual(CLAIM_KEYS, ['cleanupRunId', 'claimedAt']);
});

// Invariant: `reason` is null for `active` and `cleanup-ready` and a non-empty string for
// `aborted`, `failed` and `cleanup-failed`; the policy is bound to the purpose.
test('recordProblem enforces reason per status and the purpose-policy binding', (t) => {
  const root = repository(t);
  const record = makeRecord(root, {
    worktreePath: requiredPath(root),
    branch: 'b',
    head: 'a'.repeat(40),
  });
  for (const status of ['active', 'cleanup-ready']) {
    assert.equal(recordProblem({ ...record, status, reason: null }), null);
    assert.equal(recordProblem({ ...record, status, reason: 'x' }), 'reason');
  }
  for (const status of ['aborted', 'failed', 'cleanup-failed']) {
    assert.equal(recordProblem({ ...record, status, reason: 'why' }), null);
    assert.equal(recordProblem({ ...record, status, reason: null }), 'reason');
    assert.equal(recordProblem({ ...record, status, reason: '  ' }), 'reason');
  }
  assert.equal(
    recordProblem({ ...record, branchPolicy: 'delete-after-integration' }),
    'branch-policy-purpose',
  );
  assert.equal(
    recordProblem({
      ...record,
      purpose: 'apply-review',
      receipt: { ...record.receipt, purpose: 'apply-review' },
    }),
    'branch-policy-purpose',
  );
  assert.equal(recordProblem({ ...record, ownership: 'harness-managed' }), 'ownership');
  assert.equal(recordProblem({ ...record, branch: '-x' }), 'branch');
  assert.equal(recordProblem({ ...record, schemaVersion: 2 }), 'schema-version');
});

// ---------------------------------------------------------------------------------------------
// Eligibility evaluator

const PASSING_FACTS = Object.freeze({
  schemaValid: true,
  ownershipCreated: true,
  status: 'cleanup-ready',
  receiptMatches: true,
  registrationCount: 1,
  linked: true,
  locked: false,
  prunable: false,
  directoryExists: true,
  commonDirMatches: true,
  headOnBranch: true,
  registrationOnBranch: true,
  branchTip: 'a'.repeat(40),
  registeredHead: 'a'.repeat(40),
  creationIsCommit: true,
  creationAncestor: true,
  clean: true,
  isMain: false,
  isExecutionRoot: false,
  foreignLock: false,
  foreignClaim: false,
});

// Invariant: the evaluator is one pure function over helper-derived facts that returns every
// failed condition; each of the nine conditions fails alone.
test('evaluateEligibility: each of the nine conditions fails alone', () => {
  assert.deepEqual(ELIGIBILITY_CONDITIONS, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(evaluateEligibility(PASSING_FACTS), []);
  assert.deepEqual(evaluateEligibility({ ...PASSING_FACTS, status: 'cleanup-failed' }), []);
  const table = [
    [1, { schemaValid: false }],
    [1, { ownershipCreated: false }],
    [1, { status: 'active' }],
    [1, { status: 'cleanup-in-progress' }],
    [2, { receiptMatches: false }],
    [3, { registrationCount: 0 }],
    [3, { registrationCount: 2 }],
    [3, { linked: false }],
    [4, { locked: true }],
    [4, { prunable: true }],
    [4, { directoryExists: false }],
    [4, { commonDirMatches: false }],
    [5, { headOnBranch: false }],
    [5, { registrationOnBranch: false }],
    [5, { branchTip: null, registeredHead: null }],
    [5, { registeredHead: 'b'.repeat(40) }],
    [6, { creationIsCommit: false }],
    [6, { creationAncestor: false }],
    [7, { clean: false }],
    [8, { isMain: true }],
    [8, { isExecutionRoot: true }],
    [9, { foreignLock: true }],
    [9, { foreignClaim: true }],
  ];
  for (const [condition, change] of table) {
    assert.deepEqual(
      evaluateEligibility({ ...PASSING_FACTS, ...change }),
      [condition],
      JSON.stringify(change),
    );
  }
  assert.deepEqual(
    evaluateEligibility({ ...PASSING_FACTS, status: 'active' }, { statuses: ['active'] }),
    [],
  );
  assert.deepEqual(
    evaluateEligibility({ ...PASSING_FACTS, clean: false, locked: true, isMain: true }),
    [4, 7, 8],
  );
});

// Invariant: for the removing callers only, condition 7 also fails on a skip-worktree or
// assume-unchanged index entry hiding bytes neither its index nor HEAD holds, and on such entries
// that cannot be established (`hiddenChanges` null); the other callers keep the clean status alone.
test('evaluateEligibility: hidden changes fail condition 7 of the removing callers only', () => {
  const passing = { ...PASSING_FACTS, quarantineRetained: false, ignoredEndpoints: [] };
  assert.deepEqual(evaluateEligibility({ ...passing, hiddenChanges: [] }, { removal: true }), []);
  for (const hiddenChanges of [['a.txt'], null]) {
    const facts = { ...passing, hiddenChanges };
    assert.deepEqual(evaluateEligibility(facts, { removal: true }), [7], String(hiddenChanges));
    assert.deepEqual(evaluateEligibility(facts), [], String(hiddenChanges));
  }
});

// ---------------------------------------------------------------------------------------------
// Digests and decisions

// Invariant: an item digest is stable under key order and sensitive to every bound field.
test('itemDigest is stable under key order and changes with every bound field', () => {
  const item = {
    kind: 'worktree',
    recordId: 'r',
    worktreePath: '/w',
    branch: 'b',
    tip: 'a'.repeat(40),
    branchPolicy: 'retain',
  };
  const reversed = Object.fromEntries(Object.entries(item).reverse());
  assert.equal(itemDigest(item), itemDigest(reversed));
  assert.equal(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] }), '{"a":[{"c":2,"d":1}],"b":1}');
  for (const key of Object.keys(item)) {
    assert.notEqual(itemDigest({ ...item, [key]: 'changed' }), itemDigest(item), key);
  }
  const legacy = { kind: 'legacyRuntimeDirectory', path: '.firmo', listing: [], decisions: {} };
  assert.notEqual(
    itemDigest(legacy),
    itemDigest({ ...legacy, decisions: { discardAll: true } }),
    'the decisions are part of the digest',
  );
});

// Invariant: decisions are a closed, validated, normalized shape.
test('requireDecisions validates and normalizes the carry-over decisions', () => {
  assert.deepEqual(requireDecisions(undefined), { discardAll: [], discard: [], config: {} });
  assert.deepEqual(
    requireDecisions({
      discardAll: ['.firmo', '.firmo'],
      discard: ['.sf-plugin/b', '.sf-plugin/a'],
      config: { '.effective-flow/config.json': 'complete' },
    }),
    {
      discardAll: ['.firmo'],
      discard: ['.sf-plugin/a', '.sf-plugin/b'],
      config: { '.effective-flow/config.json': 'complete' },
    },
  );
  for (const bad of [
    { other: [] },
    { discardAll: ['.effective-flow'] },
    { discard: ['.firmo'] },
    { discard: ['.firmo/../x'] },
    { discard: ['elsewhere/x'] },
    { config: { 'config.json': 'complete' } },
    { config: { '.firmo/config.json': 'kept' } },
  ]) {
    assert.throws(() => requireDecisions(bad), { code: 'INVALID_INPUT' }, JSON.stringify(bad));
  }
});

// Invariant: the porcelain list is parsed from NUL-delimited fields with every attribute.
test('parseWorktreeList reads NUL-delimited records with every attribute', () => {
  const list = parseWorktreeList(
    Buffer.from(
      'worktree /main\0HEAD aaa\0branch refs/heads/main\0\0' +
        'worktree /w one\0HEAD bbb\0detached\0locked reason here\0\0' +
        'worktree /w2\0HEAD ccc\0branch refs/heads/x\0prunable gitdir file points to non-existent location\0\0',
    ),
  );
  assert.deepEqual(
    list.map(({ path, head, branch, detached, locked, prunable }) => ({
      path,
      head,
      branch,
      detached,
      locked,
      prunable,
    })),
    [
      {
        path: '/main',
        head: 'aaa',
        branch: 'refs/heads/main',
        detached: false,
        locked: false,
        prunable: false,
      },
      { path: '/w one', head: 'bbb', branch: null, detached: true, locked: true, prunable: false },
      {
        path: '/w2',
        head: 'ccc',
        branch: 'refs/heads/x',
        detached: false,
        locked: false,
        prunable: true,
      },
    ],
  );
});

// ---------------------------------------------------------------------------------------------
// worktree transition

// Invariant: exactly the lifecycle table's transitions are accepted; each writes the status, the
// reason and `updatedAt` under the record lock and releases it.
test('transition: every valid transition writes and releases the lock', async (t) => {
  for (const [from, targets] of Object.entries(TRANSITIONS)) {
    for (const to of targets) {
      if (from !== 'active') continue;
      const root = repository(t);
      const { record } = await initialized(root);
      const reason = to === 'cleanup-ready' ? null : `stopped: ${to}`;
      const result = expectOk(
        await call(
          'worktree transition',
          {
            cwd: root,
            executionRoot: root,
            recordId: record.recordId,
            from,
            to,
            reason,
            sessionId: SESSION,
          },
          { now: () => Date.parse('2026-11-03T12:00:00Z') },
        ),
      );
      assert.equal(result.status, to);
      const written = readRecord(root);
      assert.equal(written.status, to);
      assert.equal(written.reason, reason);
      assert.equal(written.updatedAt, '2026-11-03T12:00:00Z');
      assert.equal(written.createdAt, record.createdAt);
      assert.deepEqual(lockDirs(root), []);
    }
  }
  assert.deepEqual(TRANSITIONS, {
    active: ['cleanup-ready', 'aborted', 'failed'],
    aborted: ['active'],
    failed: ['active'],
  });
});

// Invariant: a transition outside the table is TRANSITION_INVALID from every status, and a wrong
// reason per target status is INVALID_INPUT; neither reads or writes the record.
test('transition: a rejected transition from each status and a wrong reason per status', async () => {
  const deps = { runner: unreachableRunner() };
  const { executeOperation } = await import('../src/scripts/effective-flow-state-core.mjs');
  const base = {
    cwd: '/nonexistent',
    executionRoot: '/nonexistent',
    recordId: 'r',
    sessionId: SESSION,
  };
  for (const from of RECORD_STATUSES) {
    const to = from === 'cleanup-in-progress' ? 'cleanup-failed' : 'cleanup-in-progress';
    const reason = to === 'cleanup-failed' ? 'x' : null;
    const extra = {};
    const envelope = await executeOperation(
      'worktree transition',
      { ...base, from, to, reason, ...extra },
      deps,
    );
    assert.equal(
      envelope.outcome?.code,
      'TRANSITION_INVALID',
      `${from}: ${JSON.stringify(envelope)}`,
    );
    assert.equal(exitCodeFor(envelope), 4);
  }
  for (const [to, reason] of [
    ['cleanup-ready', 'not null'],
    ['aborted', null],
    ['failed', ''],
  ]) {
    const envelope = await executeOperation(
      'worktree transition',
      { ...base, from: 'active', to, reason },
      deps,
    );
    assert.equal(envelope.error?.code, 'INVALID_INPUT', `${to}: ${JSON.stringify(envelope)}`);
  }
  const adoptionWithReason = await executeOperation(
    'worktree transition',
    {
      ...base,
      from: 'failed',
      to: 'active',
      reason: 'x',
      branch: 'b',
      workflow: 'build',
      fetchedHeadOid: 'a'.repeat(40),
    },
    deps,
  );
  assert.equal(adoptionWithReason.error?.code, 'INVALID_INPUT');
  const fetchedOutsideAdoption = await executeOperation(
    'worktree transition',
    { ...base, from: 'active', to: 'failed', reason: 'x', fetchedHeadOid: 'a'.repeat(40) },
    deps,
  );
  assert.equal(fetchedOutsideAdoption.error?.code, 'INVALID_INPUT');
});

// Invariant: a transition out of `active` needs the record's own session; a `from` mismatch, a
// missing record, and a held lock are outcomes that write nothing.
test('transition: wrong session, status mismatch, missing record and held lock write nothing', async (t) => {
  const root = repository(t);
  const { record } = await initialized(root);
  const before = readFileSync(recordFile(root));
  const input = {
    cwd: root,
    executionRoot: root,
    recordId: record.recordId,
    from: 'active',
    to: 'failed',
    reason: 'x',
    sessionId: SESSION,
  };
  expectOutcome(
    await call('worktree transition', { ...input, sessionId: 'build-ffffffffffffffff' }),
    'NOT_OWNER',
  );
  const mismatch = expectOutcome(
    await call('worktree transition', {
      ...input,
      from: 'aborted',
      to: 'active',
      reason: null,
      branch: record.branch,
      workflow: 'build',
      fetchedHeadOid: record.creationOid,
    }),
    'STATUS_MISMATCH',
  );
  assert.equal(mismatch.status, 'active');
  expectOutcome(
    await call('worktree transition', { ...input, recordId: 'missing-record' }),
    'RECORD_NOT_FOUND',
  );
  mkdirSync(lockFile(root));
  writeFileSync(join(lockFile(root), 'owner'), 'prose owner 2026-11-03\n');
  const held = expectOutcome(await call('worktree transition', input), 'LOCK_HELD');
  assert.equal(held.owner.state, 'invalid');
  assert.ok(existsSync(join(lockFile(root), 'owner')), 'a foreign lock is never broken');
  assert.deepEqual(readFileSync(recordFile(root)), before);
});

// Invariant (compatibility): the helper transitions a prose-era record (compact JSON, written by
// hand), and refuses a record with an unknown key without rewriting it.
test('transition: a prose-era record is transitioned; an unknown key is INVALID_STATE untouched', async (t) => {
  const root = repository(t);
  const worktree = addWorktree(root);
  const record = makeRecord(root, worktree);
  mkdirSync(join(root, '.effective-flow', 'worktree-runs'), { recursive: true });
  writeFileSync(recordFile(root), JSON.stringify(record));
  const input = {
    cwd: root,
    executionRoot: root,
    recordId: record.recordId,
    from: 'active',
    to: 'cleanup-ready',
    reason: null,
    sessionId: SESSION,
  };
  expectOk(await call('worktree transition', input));
  assert.equal(readRecord(root).status, 'cleanup-ready');
  const unknown = { ...record, recordId: 'record-2', extra: true };
  writeFileSync(recordFile(root, 'record-2'), JSON.stringify(unknown));
  const before = readFileSync(recordFile(root, 'record-2'));
  expectError(
    await call('worktree transition', { ...input, recordId: 'record-2' }),
    'INVALID_STATE',
  );
  assert.deepEqual(readFileSync(recordFile(root, 'record-2')), before);
  assert.deepEqual(lockDirs(root), []);
});

// Invariant: adoption needs every proof; each failing alone refuses with NOT_ELIGIBLE and leaves
// the record unchanged; all passing rewrites status, reason and sessionId only.
test('transition: adoption with each proof failing alone', async (t) => {
  const NEW_SESSION = 'build-fedcba9876543210';
  const scenario = async (prepare) => {
    const root = repository(t);
    const options = prepare.options ?? {};
    const { worktree, record } = await initialized(root, options);
    await moveTo(root, record, 'failed', 'validation failed');
    const input = {
      cwd: root,
      executionRoot: root,
      recordId: record.recordId,
      from: 'failed',
      to: 'active',
      reason: null,
      sessionId: NEW_SESSION,
      branch: record.branch,
      workflow: record.workflow,
      fetchedHeadOid: record.creationOid,
    };
    await prepare.change?.(root, worktree, input);
    const before = readFileSync(recordFile(root));
    return { root, envelope: await call('worktree transition', input), before };
  };
  const refusals = [
    ['purpose', { options: { purpose: 'partial-diff' } }],
    ['branch', { change: (root, wt, input) => (input.branch = 'other') }],
    ['workflow', { change: (root, wt, input) => (input.workflow = 'fix') }],
    ['fetched-head', { change: (root, wt, input) => (input.fetchedHeadOid = 'f'.repeat(40)) }],
    [
      6,
      {
        change: (root, wt) => {
          const tree = git(wt.worktreePath, 'rev-parse', 'HEAD^{tree}');
          const orphan = git(wt.worktreePath, 'commit-tree', tree, '-m', 'rewritten');
          git(wt.worktreePath, 'reset', '-q', '--hard', orphan);
        },
      },
    ],
    [7, { change: (root, wt) => writeFileSync(join(wt.worktreePath, 'dirty.txt'), 'x\n') }],
    [4, { change: (root, wt) => git(root, 'worktree', 'lock', wt.worktreePath) }],
  ];
  for (const [proof, prepare] of refusals) {
    const { root, envelope, before } = await scenario(prepare);
    const outcome = expectOutcome(envelope, 'NOT_ELIGIBLE');
    if (typeof proof === 'number') assert.deepEqual(outcome.conditions, [proof], String(proof));
    else assert.deepEqual(outcome.proofs, [proof], proof);
    assert.deepEqual(readFileSync(recordFile(root)), before, `${proof} wrote nothing`);
    assert.deepEqual(lockDirs(root), []);
  }
  const { root, envelope } = await scenario({});
  expectOk(envelope);
  const adopted = readRecord(root);
  assert.equal(adopted.status, 'active');
  assert.equal(adopted.reason, null);
  assert.equal(adopted.sessionId, NEW_SESSION);
});

// ---------------------------------------------------------------------------------------------
// worktree record-init

// Invariant: `record-init` accepts each purpose at exactly its required path and policy and writes
// the record no-clobber; a second call is RECORD_EXISTS.
test('record-init: each purpose at its required path', async (t) => {
  for (const purpose of [
    'delivery',
    'partial-diff',
    'plan-publication',
    'apply-review',
    'merge-gate',
  ]) {
    const root = repository(t);
    const worktree = addWorktree(root, { purpose });
    const record = makeRecord(root, worktree, { purpose });
    const input = { cwd: root, executionRoot: root, record };
    expectOk(await call('worktree record-init', input));
    assert.deepEqual(readRecord(root), record, purpose);
    expectOutcome(await call('worktree record-init', input), 'RECORD_EXISTS');
    assert.deepEqual(lockDirs(root), []);
  }
});

// Invariant: every "newly registered" criterion fails alone with its own proof, and nothing is
// written.
test('record-init: each newly-registered criterion failing alone', async (t) => {
  const cases = [
    [
      'not-registered',
      (root) => {
        git(root, 'branch', 'unregistered');
        const record = makeRecord(root, {
          worktreePath: requiredPath(root),
          branch: 'unregistered',
          head: git(root, 'rev-parse', 'HEAD'),
        });
        mkdirSync(requiredPath(root), { recursive: true });
        return record;
      },
    ],
    [
      'locked',
      (root) => {
        const wt = addWorktree(root);
        git(root, 'worktree', 'lock', wt.worktreePath);
        return makeRecord(root, wt);
      },
    ],
    [
      'head-not-on-branch',
      (root) => {
        const wt = addWorktree(root);
        git(wt.worktreePath, 'switch', '-q', '-c', 'elsewhere');
        return makeRecord(root, wt);
      },
    ],
    [
      'tip-not-creation-oid',
      (root) => {
        const wt = addWorktree(root);
        git(wt.worktreePath, 'commit', '-q', '--allow-empty', '-m', 'later');
        return makeRecord(root, wt);
      },
    ],
    [
      'path',
      (root) => {
        const wt = addWorktree(root, {
          path: join(root, '.effective-flow', '.worktrees', 'elsewhere'),
        });
        return makeRecord(root, wt);
      },
    ],
    [
      'already-recorded',
      (root) => {
        const wt = addWorktree(root);
        mkdirSync(join(root, '.effective-flow', 'worktree-runs'), { recursive: true });
        writeFileSync(
          recordFile(root, 'record-0'),
          JSON.stringify(makeRecord(root, wt, { recordId: 'record-0' })),
        );
        return makeRecord(root, wt);
      },
    ],
  ];
  for (const [proof, prepare] of cases) {
    const root = repository(t);
    const record = prepare(root);
    const outcome = expectOutcome(
      await call('worktree record-init', { cwd: root, executionRoot: root, record }),
      'NOT_ELIGIBLE',
    );
    assert.deepEqual(outcome.proofs, [proof], `${proof}: ${JSON.stringify(outcome)}`);
    assert.equal(existsSync(recordFile(root)), false, proof);
    assert.deepEqual(lockDirs(root), []);
  }
});

// Invariant: a policy, purpose or branch that does not fit the purpose table, a non-active record,
// and a receipt that disagrees with the record are INVALID_INPUT before any git call.
test('record-init: policy, purpose and branch mismatches are INVALID_INPUT', async (t) => {
  const root = repository(t);
  const worktree = {
    worktreePath: requiredPath(root),
    branch: 'effective-flow/x',
    head: 'a'.repeat(40),
  };
  const delivery = makeRecord(root, worktree);
  const review = makeRecord(
    root,
    { ...worktree, branch: `apply-review/${SESSION}/c` },
    { purpose: 'apply-review' },
  );
  const { executeOperation } = await import('../src/scripts/effective-flow-state-core.mjs');
  for (const [label, record] of [
    ['policy', { ...delivery, branchPolicy: 'delete-after-integration' }],
    [
      'purpose',
      { ...delivery, purpose: 'other', receipt: { ...delivery.receipt, purpose: 'other' } },
    ],
    [
      'branch',
      {
        ...review,
        branch: 'apply-review/other/c',
        receipt: {
          ...review.receipt,
          checkout: { kind: 'branch', branch: 'apply-review/other/c' },
        },
      },
    ],
    ['status', { ...delivery, status: 'failed', reason: 'x' }],
    ['receipt', { ...delivery, receipt: { ...delivery.receipt, executionRoot: root } }],
    ['session', { ...delivery, sessionId: 'a/b' }],
  ]) {
    const envelope = await executeOperation(
      'worktree record-init',
      { cwd: root, executionRoot: root, record },
      { runner: unreachableRunner() },
    );
    assert.equal(envelope.error?.code, 'INVALID_INPUT', `${label}: ${JSON.stringify(envelope)}`);
  }
});

// ---------------------------------------------------------------------------------------------
// worktree remove: claim-remove-reconcile

// Invariant: one call removes several records of one session, each under its own lock hold; an
// `active` record goes active → cleanup-ready → claimed → removed; a `retain` branch stays.
test('remove: a multi-record call removes every record and keeps retain branches', async (t) => {
  const root = repository(t);
  const first = await initialized(root, {
    purpose: 'apply-review',
    component: 'c1',
    recordId: 'r1',
  });
  const second = await initialized(root, {
    purpose: 'apply-review',
    component: 'c2',
    recordId: 'r2',
  });
  await moveTo(root, second.record, 'cleanup-ready');
  const phases = [];
  const result = expectOk(
    await call(
      'worktree remove',
      { cwd: root, executionRoot: root, sessionId: SESSION, recordIds: ['r1', 'r2'] },
      { onPhase: (name, detail) => phases.push([name, detail?.recordId]) },
    ),
  );
  assert.deepEqual(
    result.items.map(({ recordId, ok, branch }) => [recordId, ok, branch.outcome]),
    [
      ['r1', true, 'deleted'],
      ['r2', true, 'deleted'],
    ],
  );
  // One lock hold per record: claim and removal of r1 finish before r2 is claimed.
  assert.deepEqual(phases, [
    ['underLock', 'r1'],
    ['afterClaim', 'r1'],
    ['afterRemove', 'r1'],
    ['underLock', 'r2'],
    ['afterClaim', 'r2'],
    ['afterRemove', 'r2'],
  ]);
  for (const { worktree, record } of [first, second]) {
    assert.equal(existsSync(worktree.worktreePath), false);
    assert.equal(existsSync(recordFile(root, record.recordId)), false);
  }
  assert.equal(git(root, 'branch', '--list', 'apply-review/*'), '');
  assert.deepEqual(lockDirs(root), []);

  const delivery = repository(t);
  const kept = await initialized(delivery);
  const removed = expectOk(
    await call('worktree remove', {
      cwd: delivery,
      executionRoot: delivery,
      sessionId: SESSION,
      recordIds: ['record-1'],
    }),
  );
  assert.deepEqual(removed.items[0].branch, {
    outcome: 'retained',
    branch: kept.record.branch,
    reason: 'retain-policy',
  });
  assert.equal(git(delivery, 'branch', '--list', kept.record.branch), kept.record.branch);
});

// Invariant: removal needs the record's own session; another session's record is NOT_OWNER for
// that item only.
test('remove: another session is NOT_OWNER per item and the other items continue', async (t) => {
  const root = repository(t);
  await initialized(root, { purpose: 'apply-review', component: 'c1', recordId: 'r1' });
  await initialized(root, {
    purpose: 'apply-review',
    session: 'build-1111111111111111',
    component: 'c2',
    recordId: 'r2',
  });
  const result = expectOk(
    await call('worktree remove', {
      cwd: root,
      executionRoot: root,
      sessionId: SESSION,
      recordIds: ['r2', 'r1', 'missing'],
    }),
  );
  assert.deepEqual(
    result.items.map(({ recordId, ok, code }) => [recordId, ok, code]),
    [
      ['r2', false, 'NOT_OWNER'],
      ['r1', true, undefined],
      ['missing', false, 'RECORD_NOT_FOUND'],
    ],
  );
  assert.equal(readRecord(root, 'r2').status, 'active');
});

// Invariant: a failed `git worktree remove` persists `cleanup-failed` with the exact Git error,
// clears the claim fields and releases the lock; the worktree stays.
test('remove: a removal failure becomes cleanup-failed with the exact error', async (t) => {
  const root = repository(t);
  const { worktree } = await initialized(root);
  const { runner } = interceptingRunner((args) =>
    args[0] === 'worktree' && args[1] === 'remove'
      ? { status: 128, stdout: '', stderr: 'fatal: injected refusal\n' }
      : undefined,
  );
  const result = expectOk(
    await call(
      'worktree remove',
      { cwd: root, executionRoot: root, sessionId: SESSION, recordIds: ['record-1'] },
      { runner },
    ),
  );
  assert.equal(result.items[0].code, 'REMOVE_FAILED');
  assert.equal(result.items[0].reason, 'fatal: injected refusal');
  const record = readRecord(root);
  assert.equal(record.status, 'cleanup-failed');
  assert.equal(record.reason, 'fatal: injected refusal');
  assert.equal(Object.hasOwn(record, 'cleanupRunId'), false);
  assert.ok(existsSync(worktree.worktreePath));
  assert.deepEqual(lockDirs(root), []);
});

// Invariant: a worktree already gone after this actor's own claim is reconciled under that lock
// and claim, without a Git removal and without a prune.
test('remove: an absent worktree is reconciled only under the own claim', async (t) => {
  const root = repository(t);
  const { worktree } = await initialized(root);
  await moveTo(root, { recordId: 'record-1', sessionId: SESSION }, 'cleanup-ready');
  const { runner, calls } = interceptingRunner(() => undefined);
  const result = expectOk(
    await call(
      'worktree remove',
      { cwd: root, executionRoot: root, sessionId: SESSION, recordIds: ['record-1'] },
      {
        runner,
        onPhase: (name) => {
          if (name !== 'afterClaim') return;
          assert.equal(readRecord(root).status, 'cleanup-in-progress');
          git(root, 'worktree', 'remove', worktree.worktreePath);
        },
      },
    ),
  );
  assert.equal(result.items[0].ok, true);
  assert.equal(result.items[0].reconciledAbsent, true);
  assert.equal(existsSync(recordFile(root)), false);
  assert.ok(!calls.some((args) => args[0] === 'worktree' && ['remove', 'prune'].includes(args[1])));
});

// Invariant: a worktree whose directory vanished before the claim is not eligible (condition 4 via
// the prunable registration) and is reported, never pruned.
test('remove: a hand-deleted worktree directory is NOT_ELIGIBLE and never pruned', async (t) => {
  const root = repository(t);
  const { worktree } = await initialized(root);
  rmSync(worktree.worktreePath, { recursive: true, force: true });
  const { runner, calls } = interceptingRunner(() => undefined);
  const result = expectOk(
    await call(
      'worktree remove',
      { cwd: root, executionRoot: root, sessionId: SESSION, recordIds: ['record-1'] },
      { runner },
    ),
  );
  assert.equal(result.items[0].code, 'NOT_ELIGIBLE');
  assert.ok(result.items[0].conditions.includes(4));
  assert.equal(readRecord(root).status, 'active');
  assert.ok(!calls.some((args) => args[0] === 'worktree' && args[1] === 'prune'));
});

// Invariant: a denied probe in any Git-written directory is SANDBOX_DENIED with nothing touched: no
// lock, no claim, no record change, the worktree in place.
test('remove: the sandbox preflight touches nothing on a denial', async (t) => {
  const root = repository(t);
  const { worktree } = await initialized(root);
  const before = readFileSync(recordFile(root));
  const common = join(root, '.git');
  const fs = {
    open: async (target, ...rest) => {
      if (target.startsWith(`${common}/.effective-flow-probe-`)) {
        throw Object.assign(new Error('denied'), { code: 'EPERM' });
      }
      return openPath(target, ...rest);
    },
  };
  const result = expectOk(
    await call(
      'worktree remove',
      { cwd: root, executionRoot: root, sessionId: SESSION, recordIds: ['record-1'] },
      { fs },
    ),
  );
  assert.equal(result.items[0].code, 'SANDBOX_DENIED');
  assert.equal(result.items[0].directory, common);
  assert.deepEqual(readFileSync(recordFile(root)), before);
  assert.deepEqual(lockDirs(root), []);
  assert.ok(existsSync(worktree.worktreePath));
  assert.deepEqual(
    readdirSync(common).filter((name) => name.startsWith('.effective-flow-probe-')),
    [],
  );
});

// Invariant: a signal between the claim and the removal reconciles the in-flight claim to
// `cleanup-failed`, releases the lock, and reports the remaining items as INTERRUPTED.
test('remove: a signal after the claim reconciles it and stops the remaining items', async (t) => {
  const root = repository(t);
  const first = await initialized(root, {
    purpose: 'apply-review',
    component: 'c1',
    recordId: 'r1',
  });
  await initialized(root, { purpose: 'apply-review', component: 'c2', recordId: 'r2' });
  const signalTarget = new EventEmitter();
  const result = expectOk(
    await call(
      'worktree remove',
      { cwd: root, executionRoot: root, sessionId: SESSION, recordIds: ['r1', 'r2'] },
      {
        signalTarget,
        onPhase: (name) => {
          if (name === 'afterClaim') signalTarget.emit('SIGTERM');
        },
      },
    ),
  );
  assert.deepEqual(
    result.items.map(({ recordId, code }) => [recordId, code]),
    [
      ['r1', 'INTERRUPTED'],
      ['r2', 'INTERRUPTED'],
    ],
  );
  const reconciled = readRecord(root, 'r1');
  assert.equal(reconciled.status, 'cleanup-failed');
  assert.match(reconciled.reason, /interrupted by SIGTERM/);
  assert.equal(readRecord(root, 'r2').status, 'active');
  assert.ok(existsSync(first.worktree.worktreePath));
  assert.deepEqual(lockDirs(root), []);
  assert.equal(signalTarget.listenerCount('SIGTERM'), 0, 'the signal handlers are removed');
});

// Invariant: no item starts once less than the per-item floor of the deadline is left; the item in
// flight finishes within the remaining budget, the rest are DEADLINE_REACHED, and no lock is left.
test('remove: the deadline stops starting new items and leaves no lock', async (t) => {
  const root = repository(t);
  await initialized(root, { purpose: 'apply-review', component: 'c1', recordId: 'r1' });
  await initialized(root, { purpose: 'apply-review', component: 'c2', recordId: 'r2' });
  let time = 0;
  const result = expectOk(
    await call(
      'worktree remove',
      { cwd: root, executionRoot: root, sessionId: SESSION, recordIds: ['r1', 'r2'] },
      {
        monotonicNow: () => time,
        onPhase: (name) => {
          // 10 s left: enough for the item in flight, below the 15 s floor for a new one.
          if (name === 'afterClaim') time += DEFAULT_DEADLINE_MS - 10_000;
        },
      },
    ),
  );
  assert.deepEqual(
    result.items.map(({ recordId, ok, code }) => [recordId, ok, code]),
    [
      ['r1', true, undefined],
      ['r2', false, 'DEADLINE_REACHED'],
    ],
  );
  assert.equal(result.items[1].itemFloorMs, ITEM_FLOOR_MS);
  assert.equal(result.items[1].remainingMs, 10_000);
  assert.equal(readRecord(root, 'r2').status, 'active');
  assert.deepEqual(lockDirs(root), []);
});

// Invariant: a foreign record lock makes the record ineligible for this item only and is never
// broken; a non-registered `executionRoot` is a whole-call INVALID_ROOT.
test('remove: a foreign lock is per-item LOCK_HELD; a bad root is a whole-call error', async (t) => {
  const root = repository(t);
  await initialized(root);
  mkdirSync(lockFile(root));
  const result = expectOk(
    await call('worktree remove', {
      cwd: root,
      executionRoot: root,
      sessionId: SESSION,
      recordIds: ['record-1'],
    }),
  );
  assert.equal(result.items[0].code, 'LOCK_HELD');
  assert.ok(existsSync(lockFile(root)));
  const error = expectError(
    await call('worktree remove', {
      cwd: root,
      executionRoot: join(root, '.effective-flow'),
      sessionId: SESSION,
      recordIds: ['record-1'],
    }),
    'INVALID_ROOT',
  );
  assert.match(error.message, /executionRoot/);
});

// Invariant (a hidden edit is never removed): a tracked file whose skip-worktree or
// assume-unchanged bit hides newer bytes keeps `git status` clean, yet `git worktree remove` would
// delete the only copy of them. `worktree remove` and `cleanup plan` refuse with condition 7, and an
// item planned before the edit is refused by `cleanup apply`, which re-checks under the lock; the
// worktree, record and bytes survive. Content is compared, not the bit: entries holding their
// index bytes or absent (a sparse-checkout entry) remove normally.
for (const flag of ['--skip-worktree', '--assume-unchanged']) {
  test(`removal condition 7 refuses newer bytes hidden by ${flag}`, async (t) => {
    const root = repository(t);
    const { worktree, record } = await initialized(root);
    await moveTo(root, record, 'cleanup-ready');
    const planned = await plan(root);
    assert.ok(planned.items.some((item) => item.itemId === 'worktree:record-1'));
    const file = join(worktree.worktreePath, 'base.txt');
    git(worktree.worktreePath, 'update-index', flag, '--', 'base.txt');
    writeFileSync(file, 'hidden edit\n');
    assert.equal(git(worktree.worktreePath, 'status', '--porcelain', '--untracked-files=all'), '');

    const applied = expectOutcome(
      await call('cleanup apply', {
        cwd: root,
        executionRoot: root,
        items: selection(planned, ['worktree:record-1']),
      }),
      'PREVIEW_MISMATCH',
    );
    assert.deepEqual([applied.reason, applied.conditions], ['not-actionable', [7]]);
    const blocked = (await plan(root)).blocked.find(
      (entry) => entry.itemId === 'worktree:record-1',
    );
    assert.deepEqual(blocked?.conditions, [7]);
    const removed = expectOk(
      await call('worktree remove', {
        cwd: root,
        executionRoot: root,
        sessionId: SESSION,
        recordIds: ['record-1'],
      }),
    );
    assert.equal(removed.items[0].code, 'NOT_ELIGIBLE', JSON.stringify(removed));
    assert.deepEqual(removed.items[0].conditions, [7]);
    assert.equal(readFileSync(file, 'utf8'), 'hidden edit\n', 'the hidden bytes survive');
    assert.equal(readRecord(root).status, 'cleanup-ready');

    // The same entry holding its index bytes, beside a hidden entry absent from the worktree.
    writeFileSync(file, 'base\n');
    writeFileSync(join(worktree.worktreePath, 'sparse.txt'), 'sparse\n');
    git(worktree.worktreePath, 'add', '--', 'sparse.txt');
    git(worktree.worktreePath, 'commit', '-q', '-m', 'sparse');
    git(worktree.worktreePath, 'update-index', '--skip-worktree', '--', 'sparse.txt');
    rmSync(join(worktree.worktreePath, 'sparse.txt'));
    const passed = expectOk(
      await call('worktree remove', {
        cwd: root,
        executionRoot: root,
        sessionId: SESSION,
        recordIds: ['record-1'],
      }),
    );
    assert.equal(passed.items[0].ok, true, JSON.stringify(passed));
    assert.equal(existsSync(worktree.worktreePath), false);
  });
}

// ---------------------------------------------------------------------------------------------
// worktree inspect

// Invariant: inspect is read-only and returns each record with every failed condition, plus the
// registered worktrees under a session path that no record names.
test('inspect: records with their failed conditions and unrecorded session worktrees', async (t) => {
  const root = repository(t);
  const { worktree } = await initialized(root, {
    purpose: 'apply-review',
    component: 'c1',
    recordId: 'r1',
  });
  addWorktree(root, { purpose: 'apply-review', component: 'c2' });
  writeFileSync(join(worktree.worktreePath, 'dirty.txt'), 'x\n');
  const result = expectOk(
    await call('worktree inspect', { cwd: root, executionRoot: root, sessionId: SESSION }),
  );
  assert.deepEqual(
    result.records.map(({ recordId, status, conditions }) => ({ recordId, status, conditions })),
    [{ recordId: 'r1', status: 'active', conditions: [1, 7] }],
  );
  assert.deepEqual(
    result.unrecorded.map((entry) => entry.path),
    [requiredPath(root, { purpose: 'apply-review', component: 'c2' })],
  );
  const other = expectOk(
    await call('worktree inspect', {
      cwd: root,
      executionRoot: root,
      sessionId: 'build-2222222222222222',
    }),
  );
  assert.deepEqual(other.records, []);
  assert.deepEqual(other.unrecorded, []);
  assert.deepEqual(lockDirs(root), []);
});

// ---------------------------------------------------------------------------------------------
// cleanup plan and cleanup apply

async function readyWorktrees(t, count) {
  const root = repository(t);
  const records = [];
  for (let index = 1; index <= count; index += 1) {
    const { record } = await initialized(root, {
      purpose: 'apply-review',
      component: `c${index}`,
      recordId: `r${index}`,
    });
    await moveTo(root, record, 'cleanup-ready');
    records.push(record);
  }
  return { root, records };
}

async function plan(root, decisions) {
  return expectOk(
    await call('cleanup plan', {
      cwd: root,
      executionRoot: root,
      ...(decisions ? { decisions } : {}),
    }),
  );
}

function selection(planned, ids) {
  return Object.fromEntries(
    planned.items
      .filter((item) => ids.includes(item.itemId))
      .map((item) => [item.itemId, item.itemDigest]),
  );
}

// Invariant: apply executes only the selected items.
test('cleanup apply executes only the selected items', async (t) => {
  const { root } = await readyWorktrees(t, 2);
  const planned = await plan(root);
  assert.deepEqual(
    planned.items.map((item) => item.itemId),
    ['worktree:r1', 'worktree:r2'],
  );
  const result = expectOk(
    await call('cleanup apply', {
      cwd: root,
      executionRoot: root,
      items: selection(planned, ['worktree:r2']),
    }),
  );
  assert.deepEqual(
    result.items.map(({ itemId, ok }) => [itemId, ok]),
    [['worktree:r2', true]],
  );
  assert.equal(readRecord(root, 'r1').status, 'cleanup-ready');
  assert.equal(existsSync(recordFile(root, 'r2')), false);
});

// Invariant: a selected item that changed after the dry run (a moved tip) is PREVIEW_MISMATCH
// before the first write; an itemId outside the plan is refused the same way.
test('cleanup apply refuses a changed selected item and an itemId outside the plan', async (t) => {
  const { root } = await readyWorktrees(t, 2);
  const planned = await plan(root);
  const before = [readFileSync(recordFile(root, 'r1')), readFileSync(recordFile(root, 'r2'))];
  git(
    requiredPath(root, { purpose: 'apply-review', component: 'c2' }),
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'moved tip',
  );
  const changed = expectOutcome(
    await call('cleanup apply', {
      cwd: root,
      executionRoot: root,
      items: selection(planned, ['worktree:r1', 'worktree:r2']),
    }),
    'PREVIEW_MISMATCH',
  );
  assert.deepEqual([changed.itemId, changed.reason], ['worktree:r2', 'digest']);
  assert.deepEqual(
    [readFileSync(recordFile(root, 'r1')), readFileSync(recordFile(root, 'r2'))],
    before,
    'no write before the refusal',
  );
  const outside = expectOutcome(
    await call('cleanup apply', {
      cwd: root,
      executionRoot: root,
      items: { 'worktree:r9': 'a'.repeat(64) },
    }),
    'PREVIEW_MISMATCH',
  );
  assert.equal(outside.reason, 'unknown-item');
  expectError(
    await call('cleanup apply', {
      cwd: root,
      executionRoot: root,
      items: { 'other:x': 'a'.repeat(64) },
    }),
    'INVALID_INPUT',
  );
  assert.deepEqual(lockDirs(root), []);
});

// Invariant: an unrelated record turning cleanup-ready after the dry run never invalidates the
// selection; the result is unchanged.
test('cleanup apply is unaffected by an unrelated record turning cleanup-ready', async (t) => {
  const root = repository(t);
  const { record: first } = await initialized(root, {
    purpose: 'apply-review',
    component: 'c1',
    recordId: 'r1',
  });
  await moveTo(root, first, 'cleanup-ready');
  const { record: second } = await initialized(root, {
    purpose: 'apply-review',
    component: 'c2',
    recordId: 'r2',
  });
  const planned = await plan(root);
  assert.deepEqual(
    planned.items.map((item) => item.itemId),
    ['worktree:r1'],
  );
  await moveTo(root, second, 'cleanup-ready');
  const result = expectOk(
    await call('cleanup apply', {
      cwd: root,
      executionRoot: root,
      items: selection(planned, ['worktree:r1']),
    }),
  );
  assert.deepEqual(
    result.items.map(({ itemId, ok }) => [itemId, ok]),
    [['worktree:r1', true]],
  );
  assert.equal(readRecord(root, 'r2').status, 'cleanup-ready');
});

// Invariant: `cleanup apply` never touches an `active` record, even when selected by a matching
// digest: an item that recomputes as not actionable ends the whole call as PREVIEW_MISMATCH
// (`not-actionable`, with its failed conditions) before any write.
test('cleanup apply refuses an active record as a not-actionable PREVIEW_MISMATCH', async (t) => {
  const root = repository(t);
  const { record } = await initialized(root);
  const planned = await plan(root);
  assert.deepEqual(planned.items, []);
  assert.deepEqual(
    planned.blocked.map((item) => [item.itemId, item.conditions]),
    [['worktree:record-1', [1]]],
  );
  const { itemDigest: digestOf } =
    await import('../src/scripts/effective-flow-state-worktree-core.mjs');
  const digest = digestOf({
    kind: 'worktree',
    recordId: record.recordId,
    worktreePath: record.worktreePath,
    branch: record.branch,
    tip: record.creationOid,
    branchPolicy: record.branchPolicy,
  });
  const before = readFileSync(recordFile(root));
  const refused = expectOutcome(
    await call('cleanup apply', {
      cwd: root,
      executionRoot: root,
      items: { 'worktree:record-1': digest },
    }),
    'PREVIEW_MISMATCH',
  );
  assert.deepEqual(
    [refused.itemId, refused.reason, refused.conditions],
    ['worktree:record-1', 'not-actionable', [1]],
  );
  assert.deepEqual(readFileSync(recordFile(root)), before, 'nothing was written');
  assert.deepEqual(lockDirs(root), []);
});

// ---------------------------------------------------------------------------------------------
// Signals and deadline across the removal paths

// Invariant: every handled signal (SIGINT and SIGHUP as well as SIGTERM) reconciles the in-flight
// claim to `cleanup-failed`, names the signal in the reason, leaves the worktree, releases the
// lock and removes its handlers.
for (const signal of ['SIGINT', 'SIGHUP']) {
  test(`remove: ${signal} after the claim reconciles it to cleanup-failed`, async (t) => {
    const root = repository(t);
    const { worktree } = await initialized(root);
    const signalTarget = new EventEmitter();
    const result = expectOk(
      await call(
        'worktree remove',
        { cwd: root, executionRoot: root, sessionId: SESSION, recordIds: ['record-1'] },
        {
          signalTarget,
          onPhase: (name) => {
            if (name === 'afterClaim') signalTarget.emit(signal);
          },
        },
      ),
    );
    assert.equal(result.items[0].code, 'INTERRUPTED');
    assert.equal(result.items[0].signal, signal);
    const record = readRecord(root);
    assert.equal(record.status, 'cleanup-failed');
    assert.match(record.reason, new RegExp(`interrupted by ${signal}`));
    assert.ok(existsSync(worktree.worktreePath));
    assert.deepEqual(lockDirs(root), []);
    for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      assert.equal(signalTarget.listenerCount(name), 0, `${name} handler removed`);
    }
  });
}

// Invariant: a signal after the worktree is gone does not undo the finished item; the item that
// has not started is INTERRUPTED and untouched (no claim, no lock).
test('remove: a signal after the removal keeps the finished item and spares the next one', async (t) => {
  const root = repository(t);
  const first = await initialized(root, {
    purpose: 'apply-review',
    component: 'c1',
    recordId: 'r1',
  });
  const second = await initialized(root, {
    purpose: 'apply-review',
    component: 'c2',
    recordId: 'r2',
  });
  const signalTarget = new EventEmitter();
  const result = expectOk(
    await call(
      'worktree remove',
      { cwd: root, executionRoot: root, sessionId: SESSION, recordIds: ['r1', 'r2'] },
      {
        signalTarget,
        onPhase: (name, detail) => {
          if (name === 'afterRemove' && detail.recordId === 'r1') signalTarget.emit('SIGHUP');
        },
      },
    ),
  );
  assert.deepEqual(
    result.items.map(({ recordId, ok, code }) => [recordId, ok, code]),
    [
      ['r1', true, undefined],
      ['r2', false, 'INTERRUPTED'],
    ],
  );
  assert.equal(existsSync(first.worktree.worktreePath), false);
  assert.equal(existsSync(recordFile(root, 'r1')), false);
  assert.ok(existsSync(second.worktree.worktreePath));
  assert.equal(readRecord(root, 'r2').status, 'active');
  assert.deepEqual(lockDirs(root), []);
});

// Invariant: `cleanup apply` shares the deadline and signal handling: the finished selected item
// stays finished, the remaining ones are reported, and no lock is left.
test('cleanup apply: the deadline and a signal stop the remaining selected items', async (t) => {
  for (const stop of ['deadline', 'signal']) {
    const { root } = await readyWorktrees(t, 2);
    const planned = await plan(root);
    const signalTarget = new EventEmitter();
    let time = 0;
    const result = expectOk(
      await call(
        'cleanup apply',
        {
          cwd: root,
          executionRoot: root,
          items: selection(planned, ['worktree:r1', 'worktree:r2']),
        },
        {
          signalTarget,
          monotonicNow: () => time,
          onPhase: (name, detail) => {
            if (name !== 'afterRemove' || detail.recordId !== 'r1') return;
            if (stop === 'deadline') time += DEFAULT_DEADLINE_MS - 10_000;
            else signalTarget.emit('SIGINT');
          },
        },
      ),
    );
    assert.deepEqual(
      result.items.map(({ itemId, ok, code }) => [itemId, ok, code]),
      [
        ['worktree:r1', true, undefined],
        ['worktree:r2', false, stop === 'deadline' ? 'DEADLINE_REACHED' : 'INTERRUPTED'],
      ],
      stop,
    );
    assert.equal(existsSync(recordFile(root, 'r1')), false);
    assert.equal(readRecord(root, 'r2').status, 'cleanup-ready');
    assert.deepEqual(lockDirs(root), [], stop);
  }
});

// ---------------------------------------------------------------------------------------------
// Review incorporation: reconciliation, time bound, signals under a lock, foreign worktrees,
// lock release, orphan locks and plan/apply consistency

// Invariant: any error after the claim (here `git worktree list` failing once the worktree was
// removed) reconciles the record to `cleanup-failed` with the error under the held lock before the
// item is reported, so no record stays `cleanup-in-progress` and no lock is left.
test('remove: a Git failure after the claim is reconciled to cleanup-failed', async (t) => {
  const root = repository(t);
  const { worktree } = await initialized(root);
  let removed = false;
  const { runner } = interceptingRunner((args) => {
    if (args[0] === 'worktree' && args[1] === 'remove') removed = true;
    else if (removed && args[0] === 'worktree' && args[1] === 'list') {
      return { status: 128, stdout: Buffer.alloc(0), stderr: 'fatal: injected list failure\n' };
    }
    return undefined;
  });
  const result = expectOk(
    await call(
      'worktree remove',
      { cwd: root, executionRoot: root, sessionId: SESSION, recordIds: ['record-1'] },
      { runner },
    ),
  );
  assert.equal(result.items[0].code, 'GIT_FAILED', JSON.stringify(result));
  assert.equal(result.items[0].status, 'cleanup-failed');
  assert.equal(result.items[0].persisted.persisted, true);
  const record = readRecord(root);
  assert.equal(record.status, 'cleanup-failed');
  assert.match(
    record.reason,
    /^GIT_FAILED: git worktree list failed: fatal: injected list failure/,
  );
  assert.equal(Object.hasOwn(record, 'cleanupRunId'), false);
  assert.equal(existsSync(worktree.worktreePath), false, 'the removal itself had succeeded');
  assert.deepEqual(lockDirs(root), []);
});

// Invariant: the time bound stays below the prose's explicit Bash timeout of 120000 ms: the item
// deadline plus the reconciliation reserve plus the process runner's SIGKILL grace for two
// sequential bounded calls, and the per-item floor leaves room inside the deadline.
test('the worktree time bound stays below the prose Bash timeout', () => {
  assert.equal(PROSE_BASH_TIMEOUT_MS, 120_000);
  assert.ok(ITEM_FLOOR_MS > 0 && ITEM_FLOOR_MS < DEFAULT_DEADLINE_MS);
  assert.ok(DEFAULT_DEADLINE_MS + RECONCILE_RESERVE_MS + 2 * 1000 < PROSE_BASH_TIMEOUT_MS);
});

// Invariant: every Git call of `worktree remove` runs in its own process group bounded by the
// remaining budget; a removal that times out is reconciled to `cleanup-failed` within the reserve,
// and no further item starts.
test('remove: an in-flight Git call gets the remaining budget and a timeout reconciles', async (t) => {
  const root = repository(t);
  const first = await initialized(root, {
    purpose: 'apply-review',
    component: 'c1',
    recordId: 'r1',
  });
  await initialized(root, { purpose: 'apply-review', component: 'c2', recordId: 'r2' });
  let time = 0;
  const requests = [];
  const { runner } = interceptingRunner((args, request) => {
    requests.push({ args, time, timeoutMs: request.timeoutMs, processGroup: request.processGroup });
    if (args[0] === 'worktree' && args[1] === 'remove') {
      time = DEFAULT_DEADLINE_MS + 1;
      return {
        status: null,
        signal: 'SIGTERM',
        timedOut: true,
        stdout: Buffer.alloc(0),
        stderr: '',
      };
    }
    return undefined;
  });
  const result = expectOk(
    await call(
      'worktree remove',
      { cwd: root, executionRoot: root, sessionId: SESSION, recordIds: ['r1', 'r2'] },
      {
        runner,
        monotonicNow: () => time,
        onPhase: (name) => {
          if (name === 'afterClaim') time = DEFAULT_DEADLINE_MS - 5_000;
        },
      },
    ),
  );
  assert.ok(requests.length > 0);
  for (const request of requests) {
    assert.equal(request.processGroup, true, request.args.join(' '));
    assert.ok(request.timeoutMs >= 1 && request.timeoutMs <= DEFAULT_DEADLINE_MS);
  }
  const removal = requests.find(({ args }) => args[0] === 'worktree' && args[1] === 'remove');
  assert.equal(removal.timeoutMs, 5_000);
  const reconcile = requests.filter(({ time: at }) => at > DEFAULT_DEADLINE_MS);
  assert.ok(reconcile.length > 0, 'the reconciliation write ran its guard');
  for (const request of reconcile) assert.ok(request.timeoutMs <= RECONCILE_RESERVE_MS);
  assert.deepEqual(
    result.items.map(({ recordId, code }) => [recordId, code]),
    [
      ['r1', 'REMOVE_FAILED'],
      ['r2', 'DEADLINE_REACHED'],
    ],
  );
  assert.match(result.items[0].reason, /timed out after 5000 ms/);
  const record = readRecord(root, 'r1');
  assert.equal(record.status, 'cleanup-failed');
  assert.match(record.reason, /timed out after 5000 ms/);
  assert.ok(existsSync(first.worktree.worktreePath));
  assert.equal(readRecord(root, 'r2').status, 'active');
  assert.deepEqual(lockDirs(root), []);
});

// Invariant: `transition` and `record-init` hold the signal handlers while the record lock is held,
// so a signal cannot end the process with the lock in place: the write is skipped, the lock is
// released, and the call returns INTERRUPTED with the handlers removed.
test('transition and record-init: a signal under the held lock is deferred to INTERRUPTED', async (t) => {
  const root = repository(t);
  const { record } = await initialized(root);
  const before = readFileSync(recordFile(root));
  const signalTarget = new EventEmitter();
  const onPhase = (name) => {
    if (name !== 'underLock') return;
    assert.ok(lockDirs(root).length === 1, 'the lock is held');
    assert.equal(signalTarget.listenerCount('SIGTERM'), 1, 'termination is deferred');
    signalTarget.emit('SIGTERM');
  };
  const interrupted = expectOutcome(
    await call(
      'worktree transition',
      {
        cwd: root,
        executionRoot: root,
        recordId: record.recordId,
        from: 'active',
        to: 'cleanup-ready',
        reason: null,
        sessionId: SESSION,
      },
      { signalTarget, onPhase },
    ),
    'INTERRUPTED',
  );
  assert.deepEqual(
    [interrupted.signal, interrupted.written, interrupted.status],
    ['SIGTERM', false, 'active'],
  );
  assert.deepEqual(readFileSync(recordFile(root)), before, 'nothing was written');
  assert.deepEqual(lockDirs(root), []);

  const worktree = addWorktree(root, { purpose: 'apply-review', component: 'c9' });
  const fresh = makeRecord(root, worktree, {
    purpose: 'apply-review',
    component: 'c9',
    recordId: 'r9',
  });
  const initInterrupted = expectOutcome(
    await call(
      'worktree record-init',
      { cwd: root, executionRoot: root, record: fresh },
      { signalTarget, onPhase },
    ),
    'INTERRUPTED',
  );
  assert.deepEqual([initInterrupted.recordId, initInterrupted.written], ['r9', false]);
  assert.equal(existsSync(recordFile(root, 'r9')), false);
  assert.deepEqual(lockDirs(root), []);
  for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    assert.equal(signalTarget.listenerCount(name), 0, `${name} handler removed`);
  }
});

// Invariant: a record naming a foreign repository's checkout never runs Git inside it beyond the
// common-directory probe, so the foreign `core.fsmonitor` command never runs; the own worktree's
// `status` disables fsmonitor explicitly.
test('inspect and cleanup plan never run a foreign worktree fsmonitor command', async (t) => {
  const root = repository(t);
  await initialized(root, { purpose: 'apply-review', component: 'c1', recordId: 'own' });
  const foreign = repository(t, 'effective-flow-foreign-');
  const scratch = mkdtempSync(join(tmpdir(), 'effective-flow-fsmonitor-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const marker = join(scratch, 'fsmonitor-ran');
  const hook = join(scratch, 'fsmonitor.sh');
  writeFileSync(hook, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`);
  chmodSync(hook, 0o755);
  git(foreign, 'config', 'core.fsmonitor', hook);
  git(foreign, 'status', '--porcelain');
  assert.ok(existsSync(marker), 'control: a plain status runs the fsmonitor command');
  rmSync(marker);
  const head = git(foreign, 'rev-parse', 'HEAD');
  const record = makeRecord(
    root,
    { worktreePath: foreign, branch: 'main', head },
    { recordId: 'foreign' },
  );
  writeFileSync(recordFile(root, 'foreign'), `${JSON.stringify(record)}\n`);
  const cwds = [];
  const { runner, calls } = interceptingRunner((args, request) => {
    cwds.push({ cwd: request.cwd, args });
    return undefined;
  });
  const inspected = expectOk(
    await call('worktree inspect', { cwd: root, executionRoot: root }, { runner }),
  );
  const planned = expectOk(
    await call('cleanup plan', { cwd: root, executionRoot: root }, { runner }),
  );
  assert.equal(existsSync(marker), false, 'the foreign fsmonitor command never ran');
  const foreignEntry = inspected.records.find((entry) => entry.recordId === 'foreign');
  assert.ok(foreignEntry.conditions.includes(4), JSON.stringify(foreignEntry));
  assert.ok(planned.blocked.some((entry) => entry.itemId === 'worktree:foreign'));
  for (const { args } of cwds.filter(({ cwd }) => cwd === foreign)) {
    assert.deepEqual(args, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  }
  const statuses = calls.filter((args) => args.includes('status'));
  assert.ok(statuses.length > 0, 'the own worktree status ran');
  for (const args of statuses)
    assert.deepEqual(args.slice(0, 3), ['-c', 'core.fsmonitor=false', 'status']);
});

// Invariant: the record lock is released without spawning Git, so a runner that fails every Git
// call once the lock is held cannot leak it.
test('transition: a failing Git runner under the lock does not leak the lock', async (t) => {
  const root = repository(t);
  const { record } = await initialized(root);
  let failing = false;
  const { runner } = interceptingRunner(() =>
    failing ? { status: 128, stdout: Buffer.alloc(0), stderr: 'fatal: injected\n' } : undefined,
  );
  const error = expectError(
    await call(
      'worktree transition',
      {
        cwd: root,
        executionRoot: root,
        recordId: record.recordId,
        from: 'active',
        to: 'cleanup-ready',
        reason: null,
        sessionId: SESSION,
      },
      {
        runner,
        onPhase: (name) => {
          if (name === 'underLock') failing = true;
        },
      },
    ),
    'GIT_FAILED',
  );
  assert.doesNotMatch(error.message, /lock release failed/);
  assert.equal(readRecord(root).status, 'active');
  assert.deepEqual(lockDirs(root), []);
});

// Invariant: a `<RECORD_ID>.lock` without a record is reported by `worktree inspect` and blocked
// as an orphan by `cleanup plan`, and is never removed.
test('inspect and cleanup plan report an orphan lock and never remove it', async (t) => {
  const root = repository(t);
  await initialized(root);
  mkdirSync(lockFile(root, 'orphan-1'));
  const inspected = expectOk(await call('worktree inspect', { cwd: root, executionRoot: root }));
  assert.deepEqual(
    inspected.orphanLocks.map(({ recordId, reason, lock }) => [recordId, reason, lock.present]),
    [['orphan-1', 'orphan-lock', true]],
  );
  const planned = await plan(root);
  const orphan = planned.blocked.find((entry) => entry.itemId === 'worktree:orphan-1');
  assert.deepEqual(
    [orphan?.kind, orphan?.reason, orphan?.blockers],
    ['orphanLock', 'orphan-lock', []],
  );
  assert.ok(!planned.items.some((entry) => entry.itemId === 'worktree:orphan-1'));
  assert.ok(existsSync(lockFile(root, 'orphan-1')), 'the orphan lock is never removed');
});

// Invariant: `cleanup plan` digests the record exactly as its facts were derived and never re-reads
// it, so a record deleted in between neither crashes the plan nor changes its item.
test('cleanup plan reuses the inspected record when it is deleted in between', async (t) => {
  const { root } = await readyWorktrees(t, 1);
  const expected = await plan(root);
  // The first read of the record (by `inspectRecords`) succeeds and deletes the file behind it, so
  // any later read of it would find it missing.
  let opens = 0;
  const racing = {
    open: async (target, ...rest) => {
      const handle = await openPath(target, ...rest);
      if (target !== recordFile(root, 'r1') || ++opens > 1) return handle;
      const content = await handle.readFile();
      const stat = await handle.stat({ bigint: true });
      await handle.close();
      rmSync(target);
      return { stat: async () => stat, readFile: async () => content, close: async () => {} };
    },
  };
  const result = expectOk(
    await call('cleanup plan', { cwd: root, executionRoot: root }, { fs: racing }),
  );
  assert.equal(opens, 1, 'the record was read exactly once');
  assert.equal(existsSync(recordFile(root, 'r1')), false, 'the record was deleted mid-plan');
  assert.deepEqual(
    result.items.map(({ itemId, itemDigest }) => [itemId, itemDigest]),
    expected.items.map(({ itemId, itemDigest }) => [itemId, itemDigest]),
  );
});

// Invariant: `worktree remove` runs no Git command inside a foreign recorded path beyond the
// common-directory probe and writes no sandbox probe near it before that proof, so neither the
// foreign `core.fsmonitor` command nor a probe file ever runs or lands there; nothing is locked.
test('remove: a foreign record path gets no Git call and no probe before the proof', async (t) => {
  const root = repository(t);
  const foreign = repository(t, 'effective-flow-foreign-');
  const scratch = mkdtempSync(join(tmpdir(), 'effective-flow-fsmonitor-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const marker = join(scratch, 'fsmonitor-ran');
  const hook = join(scratch, 'fsmonitor.sh');
  writeFileSync(hook, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`);
  chmodSync(hook, 0o755);
  git(foreign, 'config', 'core.fsmonitor', hook);
  git(foreign, 'status', '--porcelain');
  assert.ok(existsSync(marker), 'control: a plain status runs the fsmonitor command');
  rmSync(marker);
  const record = makeRecord(
    root,
    { worktreePath: foreign, branch: 'main', head: git(foreign, 'rev-parse', 'HEAD') },
    { recordId: 'foreign' },
  );
  mkdirSync(join(root, '.effective-flow', 'worktree-runs'), { recursive: true });
  writeFileSync(recordFile(root, 'foreign'), `${JSON.stringify(record)}\n`);
  const before = readFileSync(recordFile(root, 'foreign'));
  const cwds = [];
  const { runner } = interceptingRunner((args, request) => {
    cwds.push({ cwd: request.cwd, args });
    return undefined;
  });
  const opened = [];
  const fs = {
    open: async (target, ...rest) => {
      opened.push(target);
      return openPath(target, ...rest);
    },
  };
  const result = expectOk(
    await call(
      'worktree remove',
      { cwd: root, executionRoot: root, sessionId: SESSION, recordIds: ['foreign'] },
      { runner, fs },
    ),
  );
  assert.equal(result.items[0].code, 'NOT_ELIGIBLE', JSON.stringify(result));
  assert.ok(result.items[0].conditions.includes(4));
  assert.equal(existsSync(marker), false, 'the foreign fsmonitor command never ran');
  for (const { args } of cwds.filter(({ cwd }) => cwd === foreign)) {
    assert.deepEqual(args, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  }
  assert.deepEqual(
    opened.filter((target) => target.includes('.effective-flow-probe-')),
    [],
    'no sandbox probe was written anywhere',
  );
  assert.deepEqual(readFileSync(recordFile(root, 'foreign')), before);
  assert.deepEqual(lockDirs(root), []);
});

// ---------------------------------------------------------------------------------------------
// merge-gate purpose and its cleanup-only release

// Invariant: `record-init` applies its generic rejections to the merge-gate purpose: a path other
// than `<base>/<repo>/<SESSION_ID>-merge-gate`, a detached checkout and a tip that differs from
// `creationOid` are NOT_ELIGIBLE with their proof, and `delete-after-integration` is INVALID_INPUT.
test('record-init: a merge-gate record keeps the generic rejections', async (t) => {
  const options = { purpose: 'merge-gate', workflow: 'merge-gate' };
  const cases = [
    [
      'path',
      (root) =>
        makeRecord(root, addWorktree(root, { ...options, path: requiredPath(root) }), options),
    ],
    [
      'head-not-on-branch',
      (root) => {
        const wt = addWorktree(root, options);
        git(wt.worktreePath, 'switch', '-q', '--detach');
        return makeRecord(root, wt, options);
      },
    ],
    [
      'tip-not-creation-oid',
      (root) => {
        const wt = addWorktree(root, options);
        git(wt.worktreePath, 'commit', '-q', '--allow-empty', '-m', 'later');
        return makeRecord(root, wt, options);
      },
    ],
  ];
  for (const [proof, prepare] of cases) {
    const root = repository(t);
    const record = prepare(root);
    const outcome = expectOutcome(
      await call('worktree record-init', { cwd: root, executionRoot: root, record }),
      'NOT_ELIGIBLE',
    );
    assert.ok(outcome.proofs.includes(proof), `${proof}: ${JSON.stringify(outcome)}`);
    assert.equal(existsSync(recordFile(root)), false, proof);
  }
  const root = repository(t);
  const record = makeRecord(root, addWorktree(root, options), {
    ...options,
    overrides: { branchPolicy: 'delete-after-integration' },
  });
  expectError(
    await call('worktree record-init', { cwd: root, executionRoot: root, record }),
    'INVALID_INPUT',
  );
});

// Invariant: the release option widens condition 1 and waives condition 6 for purpose merge-gate
// only; the defaults, every other purpose and the claimable set stay as they were, and a missing
// or failed proof is `proof-unavailable`, never an empty result.
test('evaluateEligibility: mergeGateRelease applies to merge-gate only and fails closed', () => {
  const release = { removal: true, mergeGateRelease: true };
  const proven = { inProgress: [], unpushed: [] };
  const gate = {
    ...PASSING_FACTS,
    quarantineRetained: false,
    ignoredEndpoints: [],
    hiddenChanges: [],
    purpose: 'merge-gate',
    releaseProof: proven,
  };
  assert.deepEqual(CLAIMABLE_STATUSES, ['cleanup-ready', 'cleanup-failed']);
  assert.deepEqual(MERGE_GATE_RELEASE_STATUSES, [
    'aborted',
    'failed',
    'cleanup-ready',
    'cleanup-failed',
  ]);
  for (const status of ['aborted', 'failed']) {
    assert.deepEqual(evaluateEligibility({ ...gate, status }, { removal: true }), [1]);
    assert.deepEqual(assessEligibility({ ...gate, status }, release), {
      conditions: [],
      blockers: [],
    });
    const delivery = { ...gate, status, purpose: 'delivery' };
    assert.deepEqual(assessEligibility(delivery, release), { conditions: [1], blockers: [] });
  }
  const diverged = { ...gate, creationAncestor: false };
  assert.deepEqual(evaluateEligibility(diverged, { removal: true }), [6]);
  assert.deepEqual(evaluateEligibility(diverged, release), []);
  assert.deepEqual(evaluateEligibility({ ...diverged, purpose: 'delivery' }, release), [6]);
  assert.deepEqual(evaluateEligibility({ ...gate, status: 'active' }, release), [1]);
  assert.deepEqual(BLOCKERS, [
    'invalid-record-id',
    'invalid-json',
    'no-worktree-path',
    'record-locked',
    'ledger-present',
    'unsafe-ledger-directory',
    'status-not-terminal',
    'recorded-elsewhere',
    'half-gone',
    'outside-base-dir',
    'base-dir-unresolved',
    'main-or-execution-root',
    'not-registered-here',
    'registration-locked',
    'registration-prunable',
    'path-not-canonical',
    'quarantine',
    'dirty',
    'in-progress-operation',
    'unpushed-commits',
    'proof-unavailable',
  ]);
  for (const [releaseProof, blockers] of [
    [undefined, ['proof-unavailable']],
    [null, ['proof-unavailable']],
    [{ inProgress: null, unpushed: [] }, ['proof-unavailable']],
    [{ inProgress: [], unpushed: null }, ['proof-unavailable']],
    [{ inProgress: ['MERGE_HEAD'], unpushed: [] }, ['in-progress-operation']],
    [{ inProgress: [], unpushed: ['a'.repeat(40)] }, ['unpushed-commits']],
  ]) {
    const facts = { ...gate, releaseProof };
    assert.deepEqual(assessEligibility(facts, release).blockers, blockers);
    assert.deepEqual(assessEligibility(facts, { removal: true }).blockers, []);
  }
  // Where the proof does not apply (an `active` record, a half-gone or foreign worktree), the
  // conditions block alone and no blocker is reported.
  for (const change of [
    { status: 'active' },
    { commonDirMatches: false, gone: false },
    { commonDirMatches: false },
  ]) {
    const facts = { ...gate, releaseProof: undefined, ...change };
    assert.deepEqual(assessEligibility(facts, release).blockers, [], JSON.stringify(change));
  }
  assert.deepEqual(
    assessEligibility({ ...gate, commonDirMatches: false, gone: true, releaseProof: null }, release)
      .blockers,
    ['proof-unavailable'],
  );
});

// A merge-gate worktree and record moved to `status`; its branch tip is on a remote-tracking ref
// unless `pushed` is false.
async function mergeGateRecord(t, { status = 'aborted', pushed = true } = {}) {
  const root = repository(t);
  const options = { purpose: 'merge-gate', workflow: 'merge-gate' };
  const { worktree, record } = await initialized(root, options);
  if (pushed) git(root, 'update-ref', `refs/remotes/origin/${worktree.branch}`, worktree.head);
  if (status !== 'active')
    await moveTo(root, record, status, status === 'cleanup-ready' ? null : 'stopped');
  return { root, worktree, record };
}

function planEntry(planned, recordId) {
  const itemId = `worktree:${recordId}`;
  return {
    item: planned.items.find((entry) => entry.itemId === itemId),
    blocked: planned.blocked.find((entry) => entry.itemId === itemId),
  };
}

async function applyPlanned(root, planned, extra) {
  return call(
    'cleanup apply',
    {
      cwd: root,
      executionRoot: root,
      items: selection(
        planned,
        planned.items.map((item) => item.itemId),
      ),
    },
    extra,
  );
}

// Invariant: an aborted or failed merge-gate record whose present worktree is clean and holds no
// unpushed commit is a cleanup candidate; `cleanup apply` removes the worktree without force, keeps
// the head branch and deletes the record.
test('cleanup releases a present aborted or failed merge-gate worktree with nothing unpushed', async (t) => {
  for (const status of ['aborted', 'failed']) {
    const { root, worktree, record } = await mergeGateRecord(t, { status });
    const planned = await plan(root);
    const { item } = planEntry(planned, record.recordId);
    assert.ok(item, `${status}: ${JSON.stringify(planned.blocked)}`);
    assert.deepEqual([item.purpose, item.status, item.blockers], ['merge-gate', status, []]);
    const result = expectOk(await applyPlanned(root, planned));
    assert.deepEqual(
      result.items.map(({ itemId, ok, branch }) => [itemId, ok, branch?.outcome]),
      [[`worktree:${record.recordId}`, true, 'retained']],
    );
    assert.equal(existsSync(worktree.worktreePath), false);
    assert.equal(existsSync(recordFile(root)), false);
    assert.equal(git(root, 'rev-parse', `refs/heads/${worktree.branch}`), worktree.head);
  }
});

// Invariant: only cleanup passes the release option: `worktree remove` refuses an aborted
// merge-gate record with condition 1 and `worktree inspect`, session-scoped or not, reports it.
test('worktree remove and inspect never release an aborted merge-gate record', async (t) => {
  const { root, worktree, record } = await mergeGateRecord(t);
  const removed = expectOk(
    await call('worktree remove', {
      cwd: root,
      executionRoot: root,
      sessionId: SESSION,
      recordIds: [record.recordId],
    }),
  );
  assert.equal(removed.items[0].code, 'NOT_ELIGIBLE', JSON.stringify(removed));
  assert.ok(removed.items[0].conditions.includes(1));
  assert.deepEqual(removed.items[0].blockers, []);
  for (const input of [{}, { sessionId: SESSION }]) {
    const inspected = expectOk(
      await call('worktree inspect', { cwd: root, executionRoot: root, ...input }),
    );
    assert.deepEqual(inspected.records[0].conditions, [1]);
    assert.equal(Object.hasOwn(inspected.records[0], 'blockers'), false);
  }
  assert.ok(existsSync(worktree.worktreePath));
  assert.equal(readRecord(root).status, 'aborted');
});

// Invariant: a fully gone merge-gate worktree (unregistered, path absent) is released whether its
// branch still exists on a pushed tip or was deleted, and passes the pre-lock gone gate of
// `cleanup apply` without a Git call in the vanished path.
test('cleanup releases a fully gone merge-gate worktree whose branch is pushed or deleted', async (t) => {
  for (const deleteBranch of [false, true]) {
    const { root, worktree, record } = await mergeGateRecord(t);
    git(root, 'worktree', 'remove', worktree.worktreePath);
    if (deleteBranch) git(root, 'branch', '-q', '-D', worktree.branch);
    const planned = await plan(root);
    assert.ok(planEntry(planned, record.recordId).item, JSON.stringify(planned.blocked));
    const result = expectOk(await applyPlanned(root, planned));
    assert.deepEqual(
      result.items.map(({ ok, reconciledAbsent }) => [ok, reconciledAbsent]),
      [[true, true]],
      JSON.stringify(result),
    );
    assert.equal(existsSync(recordFile(root)), false);
  }
});

// Invariant: a fully gone merge-gate worktree whose surviving branch holds an unpushed commit stays
// blocked; a half-gone one (directory deleted, still registered) keeps every condition.
test('cleanup keeps a gone merge-gate record with an unpushed branch and a half-gone one', async (t) => {
  const gone = await mergeGateRecord(t, { pushed: false });
  git(gone.root, 'worktree', 'remove', gone.worktree.worktreePath);
  const blocked = planEntry(await plan(gone.root), gone.record.recordId).blocked;
  assert.deepEqual([blocked?.conditions, blocked?.blockers], [[], ['unpushed-commits']]);

  const half = await mergeGateRecord(t);
  rmSync(half.worktree.worktreePath, { recursive: true, force: true });
  const halfBlocked = planEntry(await plan(half.root), half.record.recordId).blocked;
  assert.ok(halfBlocked?.conditions.length > 0, JSON.stringify(halfBlocked));
  assert.deepEqual(halfBlocked?.blockers, [], 'a half-gone worktree gets no proof and no blocker');

  // An `active` merge-gate record is blocked by condition 1 alone: no proof runs for it, so its
  // unpushed commits are not a blocker.
  const active = await mergeGateRecord(t, { status: 'active', pushed: false });
  const activeBlocked = planEntry(await plan(active.root), active.record.recordId).blocked;
  assert.deepEqual([activeBlocked?.conditions, activeBlocked?.blockers], [[1], []]);
});

// Invariant: condition 6 is waived for the release: a branch rewritten off `creationOid` (a
// force-push after the stopped run) is released when nothing on it is unpushed.
test('cleanup releases a merge-gate branch diverged from creationOid with nothing unpushed', async (t) => {
  const { root, worktree, record } = await mergeGateRecord(t, { pushed: false });
  const tree = git(worktree.worktreePath, 'rev-parse', 'HEAD^{tree}');
  const rewritten = git(worktree.worktreePath, 'commit-tree', tree, '-m', 'rewritten');
  git(worktree.worktreePath, 'reset', '-q', '--hard', rewritten);
  git(root, 'update-ref', `refs/remotes/origin/${worktree.branch}`, rewritten);
  const inspected = expectOk(await call('worktree inspect', { cwd: root, executionRoot: root }));
  assert.ok(inspected.records[0].conditions.includes(6));
  const planned = await plan(root);
  assert.ok(planEntry(planned, record.recordId).item, JSON.stringify(planned.blocked));
});

// Invariant: an operation in progress blocks the release with `in-progress-operation`, and a proof
// Git call that fails blocks it with `proof-unavailable`; neither is treated as proven.
test('cleanup blocks a merge-gate release on an in-progress merge or an unavailable proof', async (t) => {
  const merging = await mergeGateRecord(t);
  const mergeHead = git(
    merging.worktree.worktreePath,
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'MERGE_HEAD',
  );
  writeFileSync(mergeHead, `${merging.worktree.head}\n`);
  const inProgress = planEntry(await plan(merging.root), merging.record.recordId).blocked;
  assert.deepEqual([inProgress?.conditions, inProgress?.blockers], [[], ['in-progress-operation']]);

  const failing = await mergeGateRecord(t);
  const { runner } = interceptingRunner((args) =>
    args.includes('rev-list') && args.includes('--remotes')
      ? { status: 128, stdout: '', stderr: 'fatal: injected\n' }
      : undefined,
  );
  const planned = expectOk(
    await call('cleanup plan', { cwd: failing.root, executionRoot: failing.root }, { runner }),
  );
  const unavailable = planEntry(planned, failing.record.recordId).blocked;
  assert.deepEqual([unavailable?.conditions, unavailable?.blockers], [[], ['proof-unavailable']]);
});

// Invariant: the proof is re-derived from fresh evidence: an unpushed commit after the dry run
// makes a fresh plan list the record blocked with `unpushed-commits`, and the earlier digest is a
// whole-call PREVIEW_MISMATCH that carries the blockers.
test('cleanup apply refuses a merge-gate item that gained an unpushed commit', async (t) => {
  const { root, worktree, record } = await mergeGateRecord(t);
  const planned = await plan(root);
  assert.ok(planEntry(planned, record.recordId).item);
  git(worktree.worktreePath, 'commit', '-q', '--allow-empty', '-m', 'local');
  const fresh = planEntry(await plan(root), record.recordId).blocked;
  assert.deepEqual(fresh?.blockers, ['unpushed-commits']);
  const before = readFileSync(recordFile(root));
  const outcome = expectOutcome(await applyPlanned(root, planned), 'PREVIEW_MISMATCH');
  assert.deepEqual([outcome.reason, outcome.blockers], ['not-actionable', ['unpushed-commits']]);
  assert.deepEqual(readFileSync(recordFile(root)), before);
  assert.ok(existsSync(worktree.worktreePath));
});

// Invariant: the proof runs again under the record lock before the claim: a remote-tracking ref
// deleted after the recompute fails the item with NOT_ELIGIBLE and `unpushed-commits`, and neither
// the record nor the worktree changes.
test('cleanup apply re-proves a merge-gate release under the record lock', async (t) => {
  const { root, worktree, record } = await mergeGateRecord(t);
  const planned = await plan(root);
  const before = readFileSync(recordFile(root));
  const result = expectOk(
    await applyPlanned(root, planned, {
      onPhase: (name) => {
        if (name === 'underLock') {
          git(root, 'update-ref', '-d', `refs/remotes/origin/${worktree.branch}`);
        }
      },
    }),
  );
  assert.deepEqual(
    result.items.map(({ code, blockers }) => [code, blockers]),
    [['NOT_ELIGIBLE', ['unpushed-commits']]],
    JSON.stringify(result),
  );
  assert.deepEqual(readFileSync(recordFile(root)), before);
  assert.ok(existsSync(worktree.worktreePath));
  assert.equal(readRecord(root, record.recordId).status, 'aborted');
});

// Invariant: a failed removal of a released merge-gate worktree leaves the record `cleanup-failed`,
// which the next cleanup plan still guards by the proof.
test('a failed merge-gate removal is cleanup-failed and stays guarded by the proof', async (t) => {
  const { root, worktree, record } = await mergeGateRecord(t);
  const planned = await plan(root);
  const { runner } = interceptingRunner((args) =>
    args[0] === 'worktree' && args[1] === 'remove'
      ? { status: 128, stdout: '', stderr: 'fatal: injected refusal\n' }
      : undefined,
  );
  const result = expectOk(await applyPlanned(root, planned, { runner }));
  assert.equal(result.items[0].code, 'REMOVE_FAILED', JSON.stringify(result));
  assert.equal(readRecord(root).status, 'cleanup-failed');
  git(worktree.worktreePath, 'commit', '-q', '--allow-empty', '-m', 'local');
  const blocked = planEntry(await plan(root), record.recordId).blocked;
  assert.deepEqual(blocked?.blockers, ['unpushed-commits']);
});

// Invariant: `adoptionProofs` keeps rejecting every non-`delivery` record: an `aborted` or `failed`
// merge-gate record is never adopted (`purpose` is its only failed proof) and stays untouched.
test('transition: an aborted or failed merge-gate record is never adopted', async (t) => {
  for (const status of ['aborted', 'failed']) {
    const root = repository(t);
    const options = { purpose: 'merge-gate', workflow: 'merge-gate' };
    const { worktree, record } = await initialized(root, options);
    await moveTo(root, record, status, 'stopped');
    const before = readFileSync(recordFile(root));
    const outcome = expectOutcome(
      await call('worktree transition', {
        cwd: root,
        executionRoot: root,
        recordId: record.recordId,
        from: status,
        to: 'active',
        reason: null,
        sessionId: 'build-fedcba9876543210',
        branch: record.branch,
        workflow: record.workflow,
        fetchedHeadOid: record.creationOid,
      }),
      'NOT_ELIGIBLE',
    );
    assert.deepEqual([outcome.proofs, outcome.conditions], [['purpose'], []], status);
    assert.deepEqual(readFileSync(recordFile(root)), before, `${status} wrote nothing`);
    assert.ok(existsSync(worktree.worktreePath));
    assert.deepEqual(lockDirs(root), []);
  }
});

// Invariant: the session roots of `unrecordedWorktrees` include the dedicated
// `<SESSION_ID>-merge-gate` leaf: a registered worktree there that no record names is reported for
// its own session only.
test('inspect: an unrecorded merge-gate worktree is reported for its session', async (t) => {
  const root = repository(t);
  const worktree = addWorktree(root, { purpose: 'merge-gate' });
  const inspected = expectOk(
    await call('worktree inspect', { cwd: root, executionRoot: root, sessionId: SESSION }),
  );
  assert.deepEqual(
    inspected.unrecorded.map((entry) => entry.path),
    [worktree.worktreePath],
  );
  assert.equal(worktree.worktreePath, requiredPath(root, { purpose: 'merge-gate' }));
  const other = expectOk(
    await call('worktree inspect', {
      cwd: root,
      executionRoot: root,
      sessionId: 'build-2222222222222222',
    }),
  );
  assert.deepEqual(other.unrecorded, []);
});

// Invariant: every blocked `cleanup plan` entry carries a `blockers` array, and records of other
// purposes stay blocked by condition 1 exactly as before: an `aborted` or `failed` record of any
// purpose but merge-gate has no blockers, is never selectable, and a forged digest ends the call as
// a not-actionable PREVIEW_MISMATCH whose `blockers` is empty.
test('cleanup plan: blocked entries carry blockers and other purposes keep condition 1', async (t) => {
  const root = repository(t);
  const delivery = await initialized(root, { recordId: 'r-delivery' });
  await moveTo(root, delivery.record, 'aborted', 'stopped');
  const publication = await initialized(root, { purpose: 'plan-publication', recordId: 'r-plan' });
  await moveTo(root, publication.record, 'failed', 'stopped');
  mkdirSync(lockFile(root, 'orphan-1'));
  const planned = await plan(root);
  assert.deepEqual(planned.items, []);
  assert.ok(planned.blocked.length >= 3, JSON.stringify(planned.blocked));
  for (const entry of planned.blocked) {
    assert.ok(Array.isArray(entry.blockers), `${entry.itemId}: ${JSON.stringify(entry)}`);
    assert.deepEqual(entry.blockers, [], entry.itemId);
  }
  for (const id of ['r-delivery', 'r-plan']) {
    assert.deepEqual(planEntry(planned, id).blocked?.conditions, [1], id);
  }
  const digest = itemDigest({
    kind: 'worktree',
    recordId: delivery.record.recordId,
    worktreePath: delivery.record.worktreePath,
    branch: delivery.record.branch,
    tip: delivery.record.creationOid,
    branchPolicy: delivery.record.branchPolicy,
  });
  const before = readFileSync(recordFile(root, 'r-delivery'));
  const refused = expectOutcome(
    await call('cleanup apply', {
      cwd: root,
      executionRoot: root,
      items: { 'worktree:r-delivery': digest },
    }),
    'PREVIEW_MISMATCH',
  );
  assert.deepEqual(
    [refused.reason, refused.conditions, refused.blockers],
    ['not-actionable', [1], []],
  );
  assert.deepEqual(readFileSync(recordFile(root, 'r-delivery')), before);
  assert.ok(existsSync(delivery.worktree.worktreePath));
});

// Invariant: the release runs `git worktree remove` without `--force`, never deletes the branch,
// and runs no fetch: its proof reads only local refs (`refs/remotes/*` as they are).
test('cleanup releases a merge-gate worktree without force, branch deletion or fetch', async (t) => {
  const { root, worktree, record } = await mergeGateRecord(t);
  const { runner, calls } = interceptingRunner(() => undefined);
  const planned = expectOk(
    await call('cleanup plan', { cwd: root, executionRoot: root }, { runner }),
  );
  assert.ok(planEntry(planned, record.recordId).item, JSON.stringify(planned.blocked));
  const result = expectOk(await applyPlanned(root, planned, { runner }));
  assert.equal(result.items[0].ok, true, JSON.stringify(result));
  const removals = calls.filter((args) => args[0] === 'worktree' && args[1] === 'remove');
  assert.equal(removals.length, 1);
  assert.deepEqual(removals[0], ['worktree', 'remove', worktree.worktreePath]);
  assert.ok(!calls.some((args) => args.includes('fetch')), 'no fetch');
  assert.ok(!calls.some((args) => args.some((arg) => arg === '--force' || arg === '-f')));
  assert.ok(!calls.some((args) => args[0] === 'branch' || args[0] === 'push'));
  assert.ok(!calls.some((args) => args[0] === 'update-ref'));
  assert.equal(git(root, 'rev-parse', `refs/heads/${worktree.branch}`), worktree.head);
  assert.equal(existsSync(recordFile(root)), false);
});

// Invariant: the fully gone release runs no Git call in the vanished path: the pre-lock gone gate
// reads the filesystem and the registry from the runtime-state root only.
test('cleanup releases a gone merge-gate worktree without a Git call in the vanished path', async (t) => {
  const { root, worktree, record } = await mergeGateRecord(t);
  git(root, 'worktree', 'remove', worktree.worktreePath);
  const cwds = [];
  const { runner, calls } = interceptingRunner((args, request) => {
    cwds.push(request.cwd);
    return undefined;
  });
  const planned = expectOk(
    await call('cleanup plan', { cwd: root, executionRoot: root }, { runner }),
  );
  assert.ok(planEntry(planned, record.recordId).item, JSON.stringify(planned.blocked));
  const result = expectOk(await applyPlanned(root, planned, { runner }));
  assert.deepEqual([result.items[0].ok, result.items[0].reconciledAbsent], [true, true]);
  assert.ok(!cwds.includes(worktree.worktreePath), 'no Git call ran in the vanished path');
  assert.ok(!calls.some((args) => args.includes('fetch')), 'no fetch');
  assert.equal(existsSync(recordFile(root)), false);
  assert.ok(!calls.some((args) => args[0] === 'branch'), 'the branch is never deleted');
  assert.equal(git(root, 'rev-parse', `refs/heads/${worktree.branch}`), worktree.head);
});

// Invariant: the in-progress detection covers directory markers and fails closed: a `rebase-merge/`
// directory at its `--git-path` location is `in-progress-operation`, and a failed
// `rev-parse --git-path` call is `proof-unavailable`.
test('cleanup blocks a merge-gate release on a rebase directory or a failed git-path lookup', async (t) => {
  const rebasing = await mergeGateRecord(t);
  const marker = git(
    rebasing.worktree.worktreePath,
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'rebase-merge',
  );
  mkdirSync(marker);
  const rebase = planEntry(await plan(rebasing.root), rebasing.record.recordId).blocked;
  assert.deepEqual([rebase?.conditions, rebase?.blockers], [[], ['in-progress-operation']]);

  const failing = await mergeGateRecord(t);
  const { runner } = interceptingRunner((args) =>
    args.includes('rev-parse') && args.includes('--git-path')
      ? { status: 128, stdout: '', stderr: 'fatal: injected\n' }
      : undefined,
  );
  const planned = expectOk(
    await call('cleanup plan', { cwd: failing.root, executionRoot: failing.root }, { runner }),
  );
  const unavailable = planEntry(planned, failing.record.recordId).blocked;
  assert.deepEqual([unavailable?.conditions, unavailable?.blockers], [[], ['proof-unavailable']]);
});

// Invariant: the fully-gone proof fails closed too: a failed branch lookup from the main checkout
// blocks the record with `proof-unavailable`, and `cleanup apply` removes nothing.
test('cleanup blocks a gone merge-gate record whose branch lookup fails', async (t) => {
  const { root, worktree, record } = await mergeGateRecord(t);
  git(root, 'worktree', 'remove', worktree.worktreePath);
  const { runner } = interceptingRunner((args) =>
    args[0] === 'for-each-ref' && args.includes(`refs/heads/${worktree.branch}`)
      ? { status: 128, stdout: '', stderr: 'fatal: injected\n' }
      : undefined,
  );
  const planned = expectOk(
    await call('cleanup plan', { cwd: root, executionRoot: root }, { runner }),
  );
  const blocked = planEntry(planned, record.recordId).blocked;
  assert.deepEqual([blocked?.conditions, blocked?.blockers], [[], ['proof-unavailable']]);
  const before = readFileSync(recordFile(root));
  const clean = await plan(root);
  const outcome = expectOutcome(await applyPlanned(root, clean, { runner }), 'PREVIEW_MISMATCH');
  assert.deepEqual(outcome.blockers, ['proof-unavailable']);
  assert.deepEqual(readFileSync(recordFile(root)), before);
});

// Invariant: a gone merge-gate record whose branch survives is re-proved at apply time: a
// remote-tracking ref deleted after the dry run (tip unchanged) ends the call as PREVIEW_MISMATCH
// with `unpushed-commits`, and the record stays.
test('cleanup apply refuses a gone merge-gate record whose branch lost its remote-tracking ref', async (t) => {
  const { root, worktree, record } = await mergeGateRecord(t);
  git(root, 'worktree', 'remove', worktree.worktreePath);
  const planned = await plan(root);
  assert.ok(planEntry(planned, record.recordId).item, JSON.stringify(planned.blocked));
  git(root, 'update-ref', '-d', `refs/remotes/origin/${worktree.branch}`);
  const before = readFileSync(recordFile(root));
  const outcome = expectOutcome(await applyPlanned(root, planned), 'PREVIEW_MISMATCH');
  assert.deepEqual([outcome.reason, outcome.blockers], ['not-actionable', ['unpushed-commits']]);
  assert.deepEqual(readFileSync(recordFile(root)), before);
});

// Invariant: every blocked `cleanup plan` entry carries a `blockers` array, a blocked legacy
// runtime directory included (empty: its reasons stay in `failures`).
test('cleanup plan gives a blocked legacy entry an empty blockers array', async (t) => {
  const root = repository(t);
  mkdirSync(join(root, '.firmo'));
  writeFileSync(join(root, '.firmo', 'note.txt'), 'not carried over\n');
  const planned = await plan(root);
  const legacy = planned.blocked.find((entry) => entry.itemId === 'legacy:.firmo');
  assert.ok(legacy, JSON.stringify(planned));
  assert.ok(legacy.failures.length > 0);
  assert.deepEqual(legacy.blockers, []);
});

// Invariant: the pre-lock gone gate of `cleanup apply` re-derives the proof itself: when the branch
// lookup passes in the recompute and fails in the gate, the item is NOT_ELIGIBLE with
// `proof-unavailable` before any lock, probe or write.
test('cleanup apply: the pre-lock gone gate refuses a gone merge-gate record whose proof fails', async (t) => {
  const { root, worktree, record } = await mergeGateRecord(t);
  git(root, 'worktree', 'remove', worktree.worktreePath);
  const planned = await plan(root);
  assert.ok(planEntry(planned, record.recordId).item, JSON.stringify(planned.blocked));
  let lookups = 0;
  const { runner } = interceptingRunner((args) => {
    if (args[0] !== 'for-each-ref' || !args.includes(`refs/heads/${worktree.branch}`)) {
      return undefined;
    }
    lookups += 1;
    return lookups === 2 ? { status: 128, stdout: '', stderr: 'fatal: injected\n' } : undefined;
  });
  const before = readFileSync(recordFile(root));
  const result = expectOk(await applyPlanned(root, planned, { runner }));
  assert.equal(lookups, 2, 'one lookup in the recompute, one in the pre-lock gate');
  assert.deepEqual(
    result.items.map(({ code, blockers }) => [code, blockers]),
    [['NOT_ELIGIBLE', ['proof-unavailable']]],
    JSON.stringify(result),
  );
  assert.deepEqual(lockDirs(root), []);
  assert.deepEqual(readFileSync(recordFile(root)), before);
});

// ---------------------------------------------------------------------------------------------
// The `invalid-record` cleanup class

// A linked worktree in the default base directory whose tip is on a remote-tracking ref, so
// nothing on it is unpushed.
function pushedWorktree(root, name = 'pr-123-conflict') {
  const branch = `pr/${name}`;
  const worktree = addWorktree(root, { path: join(baseDir(root), name), branch });
  git(root, 'update-ref', `refs/remotes/origin/${branch}`, worktree.head);
  return worktree;
}

// A worktree-shaped value for a path that never existed.
function absentWorktree(root, name = 'pr-456-base-merge') {
  return {
    worktreePath: join(baseDir(root), name),
    branch: `pr/${name}`,
    head: git(root, 'rev-parse', 'HEAD'),
  };
}

function invalidEntry(planned, recordId) {
  const itemId = `invalid-record:${recordId}`;
  return {
    item: planned.items.find((entry) => entry.itemId === itemId),
    blocked: planned.blocked.find((entry) => entry.itemId === itemId),
  };
}

function applyItems(root, planned, ids, extra) {
  return call(
    'cleanup apply',
    { cwd: root, executionRoot: root, items: selection(planned, ids) },
    extra,
  );
}

// Invariant: the issue's `pr-conflict-resolution` records, `failed` or `aborted`, whose worktree is
// present and clean with nothing unpushed, are `invalid-record` items; `cleanup apply` removes the
// worktree without force, keeps its branch, deletes the record file, and no free-text field of the
// record reaches the plan.
test('cleanup retires a stopped pr-conflict-resolution record whose worktree is present and clean', async (t) => {
  for (const status of ['failed', 'aborted']) {
    const root = repository(t);
    const worktree = pushedWorktree(root);
    const record = legacyRecord(root, worktree, { status });
    writeRecordFile(root, record.recordId, record);
    const { runner, calls } = interceptingRunner(() => undefined);
    const planned = expectOk(
      await call('cleanup plan', { cwd: root, executionRoot: root }, { runner }),
    );
    const { item, blocked } = invalidEntry(planned, record.recordId);
    assert.ok(item, `${status}: ${JSON.stringify(planned.blocked)}`);
    assert.equal(blocked, undefined, 'listed exactly once');
    assert.deepEqual(
      [item.kind, item.recordId, item.schemaReason, item.action],
      ['invalidRecord', record.recordId, 'purpose', 'present-clean'],
    );
    assert.deepEqual(item.evidence, {
      schemaReason: 'purpose',
      worktreePath: worktree.worktreePath,
      registrations: 1,
      present: true,
      head: worktree.head,
      branch: worktree.branch,
    });
    assert.ok(
      !planned.items.concat(planned.blocked).some((e) => e.itemId?.startsWith('worktree:')),
    );
    const shown = JSON.stringify(planned);
    for (const text of [
      record.reason,
      record.workflow,
      record.sessionId,
      'pr-conflict-resolution',
    ]) {
      assert.ok(!shown.includes(text), `the plan never echoes ${text}`);
    }
    assert.ok(
      calls.some((args) => args.includes('status') && args.includes('--ignored')),
      'the clean proof includes ignored files',
    );
    const result = expectOk(await applyItems(root, planned, [item.itemId], { runner }));
    assert.deepEqual(
      result.items.map(({ itemId, ok, action, removed }) => [itemId, ok, action, removed]),
      [[item.itemId, true, 'present-clean', true]],
      JSON.stringify(result),
    );
    assert.equal(existsSync(worktree.worktreePath), false);
    assert.equal(existsSync(recordFile(root, record.recordId)), false);
    assert.equal(git(root, 'rev-parse', `refs/heads/${worktree.branch}`), worktree.head);
    const removals = calls.filter((args) => args[0] === 'worktree' && args[1] === 'remove');
    assert.deepEqual(removals, [['worktree', 'remove', worktree.worktreePath]]);
    assert.ok(!calls.some((args) => args.some((arg) => ['--force', '-f', 'prune'].includes(arg))));
    assert.ok(!calls.some((args) => ['branch', 'update-ref', 'fetch'].includes(args[0])));
    assert.deepEqual(lockDirs(root), []);
  }
});

// Invariant: an invalid record whose path is unregistered and absent (the issue's
// `base-into-head-merge` record, or one whose receipt carries `setupStatus: "completed"`) is an
// `absent` item: `cleanup apply` deletes only the record file and runs no `git worktree remove`.
test('cleanup deletes only the record file of an absent base-into-head-merge or setupStatus record', async (t) => {
  const root = repository(t);
  const merge = legacyRecord(root, absentWorktree(root), {
    recordId: 'legacy-merge',
    purpose: 'base-into-head-merge',
    status: 'aborted',
  });
  writeRecordFile(root, merge.recordId, merge);
  const setup = absentWorktree(root, 'build-setup');
  const completed = makeRecord(root, setup, { recordId: 'legacy-setup' });
  writeRecordFile(root, completed.recordId, {
    ...completed,
    receipt: { ...completed.receipt, setupStatus: 'completed' },
    status: 'cleanup-ready',
  });
  const planned = await plan(root);
  assert.deepEqual(
    ['legacy-merge', 'legacy-setup'].map((id) => {
      const { item } = invalidEntry(planned, id);
      return [id, item?.schemaReason, item?.action, item?.evidence.present];
    }),
    [
      ['legacy-merge', 'purpose', 'absent', false],
      ['legacy-setup', 'receipt-setup-status', 'absent', false],
    ],
    JSON.stringify(planned.blocked),
  );
  const { runner, calls } = interceptingRunner(() => undefined);
  const result = expectOk(
    await applyItems(
      root,
      planned,
      ['invalid-record:legacy-merge', 'invalid-record:legacy-setup'],
      {
        runner,
      },
    ),
  );
  assert.deepEqual(
    result.items.map(({ itemId, ok, action, removed }) => [itemId, ok, action, removed]),
    [
      ['invalid-record:legacy-merge', true, 'absent', false],
      ['invalid-record:legacy-setup', true, 'absent', false],
    ],
  );
  assert.ok(!calls.some((args) => args[0] === 'worktree' && args[1] === 'remove'));
  assert.equal(existsSync(recordFile(root, 'legacy-merge')), false);
  assert.equal(existsSync(recordFile(root, 'legacy-setup')), false);
});

// Invariant: terminal invalid records that name one path never block each other: all are offered,
// the first `present-clean` removal retires one, every other selected one is its own
// PREVIEW_MISMATCH with its file untouched, and the next plan offers them as `absent`.
test('terminal invalid records naming one path are retired one at a time', async (t) => {
  const root = repository(t);
  const worktree = pushedWorktree(root);
  const ids = ['legacy-a', 'legacy-b', 'legacy-c'];
  for (const [index, recordId] of ids.entries()) {
    const status = ['failed', 'aborted', 'cleanup-failed'][index];
    writeRecordFile(root, recordId, legacyRecord(root, worktree, { recordId, status }));
  }
  const planned = await plan(root);
  assert.deepEqual(
    ids.map((id) => invalidEntry(planned, id).item?.action),
    ['present-clean', 'present-clean', 'present-clean'],
    JSON.stringify(planned.blocked),
  );
  const before = ids.slice(1).map((id) => readFileSync(recordFile(root, id)));
  const first = expectOk(
    await applyItems(
      root,
      planned,
      ids.map((id) => `invalid-record:${id}`),
    ),
  );
  assert.deepEqual(
    first.items.map(({ itemId, ok, code, reason }) => [itemId, ok, code, reason]),
    [
      ['invalid-record:legacy-a', true, undefined, undefined],
      ['invalid-record:legacy-b', false, 'PREVIEW_MISMATCH', 'digest'],
      ['invalid-record:legacy-c', false, 'PREVIEW_MISMATCH', 'digest'],
    ],
  );
  assert.equal(existsSync(worktree.worktreePath), false);
  assert.deepEqual(
    ids.slice(1).map((id) => readFileSync(recordFile(root, id))),
    before,
  );
  const again = await plan(root);
  assert.deepEqual(
    ids.slice(1).map((id) => invalidEntry(again, id).item?.action),
    ['absent', 'absent'],
  );
  const second = expectOk(
    await applyItems(root, again, ['invalid-record:legacy-b', 'invalid-record:legacy-c']),
  );
  assert.ok(
    second.items.every((entry) => entry.ok),
    JSON.stringify(second),
  );
  assert.deepEqual(lockDirs(root), []);
});

// Invariant: an invalid record appears exactly once, as an `invalid-record` item or a blocked
// `invalid-record` entry with `schemaReason` and `blockers` but no `reason`, never as a `worktree:`
// entry; a `*.json` name that is no record ID is blocked under the hash of its name, which is never
// echoed; the guard's temporary files are not record files. `worktree inspect` and `worktree remove`
// keep their behavior for an invalid record.
test('cleanup plan lists each invalid record once and never echoes a foreign file name', async (t) => {
  const root = repository(t);
  const live = legacyRecord(root, absentWorktree(root), {
    recordId: 'legacy-live',
    status: 'active',
  });
  writeRecordFile(root, live.recordId, live);
  const foreignName = 'not a record id.json';
  const dir = join(root, '.effective-flow', 'worktree-runs');
  writeFileSync(join(dir, foreignName), '{}\n');
  writeFileSync(join(dir, '.legacy-live.json.0123456789abcdef.tmp'), '{}\n');
  const planned = await plan(root);
  const { item, blocked } = invalidEntry(planned, live.recordId);
  assert.equal(item, undefined);
  assert.deepEqual(blocked, {
    itemId: 'invalid-record:legacy-live',
    kind: 'invalidRecord',
    recordId: 'legacy-live',
    schemaReason: 'purpose',
    action: 'absent',
    evidence: {
      schemaReason: 'purpose',
      worktreePath: live.worktreePath,
      registrations: 0,
      present: false,
      head: null,
      branch: null,
    },
    blockers: ['status-not-terminal'],
  });
  assert.equal(Object.hasOwn(blocked, 'reason'), false);
  const foreign = planned.blocked.filter((entry) => entry.itemId === null);
  assert.deepEqual(foreign, [
    {
      itemId: null,
      kind: 'invalidRecord',
      fileNameSha256: createHash('sha256').update(foreignName).digest('hex'),
      blockers: ['invalid-record-id'],
    },
  ]);
  const shown = JSON.stringify(planned);
  assert.ok(!shown.includes('not a record id'), 'the foreign name is never echoed');
  assert.ok(!planned.blocked.some((entry) => entry.itemId === 'worktree:legacy-live'));
  const inspected = expectOk(await call('worktree inspect', { cwd: root, executionRoot: root }));
  assert.ok(
    inspected.records.some((entry) => entry.recordId === 'legacy-live' && entry.valid === false),
    'worktree inspect still reports the invalid record',
  );
  const removed = expectOk(
    await call('worktree remove', {
      cwd: root,
      executionRoot: root,
      sessionId: SESSION,
      recordIds: ['legacy-live'],
    }),
  );
  assert.equal(removed.items[0].code, 'INVALID_STATE');
  assert.ok(existsSync(recordFile(root, 'legacy-live')));
});

// Invariant: `cleanup plan` reads every record file once, so a record that turns schema-invalid
// mid-plan still lands in exactly one class: the `worktree:` item of the bytes it read, never also
// an `invalid-record:` entry.
test('cleanup plan classifies a record that turns invalid mid-plan exactly once', async (t) => {
  const { root } = await readyWorktrees(t, 1);
  const expected = await plan(root);
  let opens = 0;
  const racing = {
    open: async (target, ...rest) => {
      const handle = await openPath(target, ...rest);
      if (target !== recordFile(root, 'r1') || ++opens > 1) return handle;
      const content = await handle.readFile();
      const stat = await handle.stat({ bigint: true });
      await handle.close();
      // Same inode, new bytes: any later read of the record would find it invalid.
      writeFileSync(target, '{"schemaVersion": 1,');
      return { stat: async () => stat, readFile: async () => content, close: async () => {} };
    },
  };
  const result = expectOk(
    await call('cleanup plan', { cwd: root, executionRoot: root }, { fs: racing }),
  );
  assert.equal(opens, 1, 'the record was read exactly once');
  const listed = [...result.items, ...result.blocked].filter((entry) =>
    ['worktree:r1', 'invalid-record:r1'].includes(entry.itemId),
  );
  assert.deepEqual(
    listed.map(({ itemId, itemDigest }) => [itemId, itemDigest]),
    expected.items
      .filter((entry) => entry.itemId === 'worktree:r1')
      .map(({ itemId, itemDigest }) => [itemId, itemDigest]),
  );
  assert.equal(invalidEntry(await plan(root), 'r1').blocked?.schemaReason, 'invalid-json');
});

// Invariant: only `cleanup plan` (no session) leaves a worktree an invalid record names out of
// `unrecorded`, since its `invalid-record` entry accounts for it; session-scoped `worktree inspect`
// keeps reporting that worktree under `unrecorded`.
test('only cleanup plan leaves a worktree an invalid record names out of unrecorded', async (t) => {
  const root = repository(t);
  const worktree = addWorktree(root);
  writeRecordFile(root, 'legacy-1', legacyRecord(root, worktree, { status: 'active' }));
  const planned = await plan(root);
  assert.deepEqual(planned.unrecorded, []);
  assert.ok(invalidEntry(planned, 'legacy-1').blocked);
  const inspected = expectOk(
    await call('worktree inspect', { cwd: root, executionRoot: root, sessionId: SESSION }),
  );
  assert.deepEqual(
    inspected.unrecorded.map((entry) => entry.path),
    [worktree.worktreePath],
  );
});

// One blocker case: `setup(t)` returns the root, the record ID and optional `extra` deps; the
// plan must list the record blocked with every `blockers` entry in `expected` and `action`.
async function expectBlocked(t, name, setup, expected, action) {
  const { root, recordId, extra } = await setup(t);
  const planned = expectOk(await call('cleanup plan', { cwd: root, executionRoot: root }, extra));
  const { item, blocked } = invalidEntry(planned, recordId);
  assert.equal(item, undefined, `${name}: not an item`);
  assert.ok(blocked, `${name}: ${JSON.stringify(planned)}`);
  for (const blocker of expected) {
    assert.ok(blocked.blockers.includes(blocker), `${name}: ${JSON.stringify(blocked)}`);
  }
  assert.equal(blocked.action, action, `${name}: action`);
  assert.equal(Object.hasOwn(blocked, 'reason'), false, `${name}: no reason`);
  return { root, planned, blocked };
}

// A root with one `failed` legacy record naming `worktree` (default: a pushed present worktree).
async function legacyAt(t, worktreeOf = pushedWorktree, overrides = {}) {
  const root = repository(t);
  const worktree = worktreeOf(root);
  const record = legacyRecord(root, worktree, { overrides });
  writeRecordFile(root, record.recordId, record);
  return { root, recordId: record.recordId, worktree, record };
}

// Invariant: each file- and field-level fact blocks both actions alone: unreadable JSON, a missing
// or unnormalized path, a held record lock, a ledger, an unsafe ledger directory and a status that
// is not terminal (missing and unknown included). Each names the action it was evaluated for.
test('invalid-record blockers that apply to both actions block an absent record', async (t) => {
  for (const [name, setup, expected, action] of [
    [
      'invalid-json',
      async (t2) => {
        const root = repository(t2);
        writeRecordFile(root, 'legacy-1', '{"schemaVersion": 1,');
        return { root, recordId: 'legacy-1' };
      },
      ['invalid-json'],
      undefined,
    ],
    [
      'non-object JSON',
      async (t2) => {
        const root = repository(t2);
        writeRecordFile(root, 'legacy-1', '[]\n');
        return { root, recordId: 'legacy-1' };
      },
      ['invalid-json'],
      undefined,
    ],
    [
      'no-worktree-path',
      async (t2) => legacyAt(t2, absentWorktree, { worktreePath: 'relative/path' }),
      ['no-worktree-path'],
      undefined,
    ],
    [
      'no-worktree-path (not normalized)',
      async (t2) => {
        const fixture = await legacyAt(t2, absentWorktree);
        writeRecordFile(fixture.root, fixture.recordId, {
          ...fixture.record,
          worktreePath: `${fixture.record.worktreePath}/../x/`,
        });
        return fixture;
      },
      ['no-worktree-path'],
      undefined,
    ],
    [
      'record-locked',
      async (t2) => {
        const fixture = await legacyAt(t2, absentWorktree);
        mkdirSync(lockFile(fixture.root, fixture.recordId));
        return fixture;
      },
      ['record-locked'],
      'absent',
    ],
    [
      'ledger-present',
      async (t2) => {
        const fixture = await legacyAt(t2, absentWorktree);
        const ledgers = join(fixture.root, '.effective-flow', 'worktree-runs', 'ledgers');
        mkdirSync(ledgers);
        writeFileSync(join(ledgers, `${fixture.recordId}.ledger`), '{}\n');
        return fixture;
      },
      ['ledger-present'],
      'absent',
    ],
    [
      'unsafe-ledger-directory',
      async (t2) => {
        const fixture = await legacyAt(t2, absentWorktree);
        writeFileSync(join(fixture.root, '.effective-flow', 'worktree-runs', 'ledgers'), 'x\n');
        return fixture;
      },
      ['unsafe-ledger-directory'],
      'absent',
    ],
    [
      'status-not-terminal (missing)',
      async (t2) => {
        const fixture = await legacyAt(t2, absentWorktree);
        const { status, ...rest } = fixture.record;
        writeRecordFile(fixture.root, fixture.recordId, rest);
        return fixture;
      },
      ['status-not-terminal'],
      'absent',
    ],
    [
      'status-not-terminal (unknown)',
      async (t2) => legacyAt(t2, absentWorktree, { status: 'completed' }),
      ['status-not-terminal'],
      'absent',
    ],
  ]) {
    const { blocked } = await expectBlocked(t, name, setup, expected, action);
    if (name.startsWith('status') || name === 'record-locked' || name.startsWith('ledger')) {
      assert.deepEqual(blocked.blockers, expected, `${name}: alone`);
    }
  }
  assert.deepEqual(INVALID_RECORD_TERMINAL_STATUSES, [
    'aborted',
    'failed',
    'cleanup-ready',
    'cleanup-failed',
  ]);
});

// Invariant: `recorded-elsewhere` is computed from the records alone: a valid record's path, a
// non-terminal invalid record's path, or a path in a valid `apply-review` record's session
// directory blocks the item; a fresh worktree is never removed on the strength of an invalid record.
test('an invalid record whose path another record names is recorded-elsewhere', async (t) => {
  // A valid (active) record names the same, present worktree.
  const validRoot = repository(t);
  const { worktree } = await initialized(validRoot);
  writeRecordFile(validRoot, 'legacy-1', legacyRecord(validRoot, worktree));
  const valid = await expectBlocked(
    t,
    'valid record',
    async () => ({ root: validRoot, recordId: 'legacy-1' }),
    ['recorded-elsewhere'],
    'present-clean',
  );
  assert.ok(existsSync(worktree.worktreePath));
  assert.deepEqual(planEntry(valid.planned, 'record-1').blocked?.conditions, [1]);

  // A non-terminal invalid record blocks a terminal one naming its path, not the other way round.
  const sharedRoot = repository(t);
  const absent = absentWorktree(sharedRoot);
  writeRecordFile(
    sharedRoot,
    'legacy-done',
    legacyRecord(sharedRoot, absent, { recordId: 'legacy-done' }),
  );
  writeRecordFile(
    sharedRoot,
    'legacy-live',
    legacyRecord(sharedRoot, absent, { recordId: 'legacy-live', status: 'active' }),
  );
  const shared = await expectBlocked(
    t,
    'non-terminal invalid record',
    async () => ({ root: sharedRoot, recordId: 'legacy-done' }),
    ['recorded-elsewhere'],
    'absent',
  );
  assert.deepEqual(invalidEntry(shared.planned, 'legacy-live').blocked?.blockers, [
    'status-not-terminal',
  ]);

  // The unnormalized path of a non-terminal invalid record (a trailing `/`) still blocks.
  const slashRoot = repository(t);
  const slashed = absentWorktree(slashRoot);
  writeRecordFile(
    slashRoot,
    'legacy-done',
    legacyRecord(slashRoot, slashed, { recordId: 'legacy-done' }),
  );
  writeRecordFile(
    slashRoot,
    'legacy-live',
    legacyRecord(
      slashRoot,
      { ...slashed, worktreePath: `${slashed.worktreePath}/` },
      { recordId: 'legacy-live', status: 'active' },
    ),
  );
  const slash = await expectBlocked(
    t,
    'unnormalized non-terminal path',
    async () => ({ root: slashRoot, recordId: 'legacy-done' }),
    ['recorded-elsewhere'],
    'absent',
  );
  assert.deepEqual(slash.blocked.blockers, ['recorded-elsewhere']);

  // A path below a valid apply-review record's session directory.
  const reviewRoot = repository(t);
  await initialized(reviewRoot, { purpose: 'apply-review', component: 'c1', recordId: 'r1' });
  const sibling = {
    worktreePath: requiredPath(reviewRoot, { purpose: 'apply-review', component: 'c2' }),
    branch: 'pr/sibling',
    head: git(reviewRoot, 'rev-parse', 'HEAD'),
  };
  writeRecordFile(reviewRoot, 'legacy-1', legacyRecord(reviewRoot, sibling));
  const review = await expectBlocked(
    t,
    'apply-review session directory',
    async () => ({ root: reviewRoot, recordId: 'legacy-1' }),
    ['recorded-elsewhere'],
    'absent',
  );
  assert.deepEqual(review.blocked.blockers, ['recorded-elsewhere']);
});

// Invariant: a half-gone worktree (registered without its directory, or a directory without a
// registration) leaves no action and blocks; cleanup never prunes it.
test('an invalid record whose worktree is half gone is blocked without an action', async (t) => {
  await expectBlocked(
    t,
    'registered without directory',
    async (t2) => {
      const fixture = await legacyAt(t2);
      rmSync(fixture.worktree.worktreePath, { recursive: true, force: true });
      return fixture;
    },
    ['half-gone'],
    undefined,
  );
  await expectBlocked(
    t,
    'directory without registration',
    async (t2) => {
      const fixture = await legacyAt(t2, absentWorktree);
      mkdirSync(fixture.record.worktreePath, { recursive: true });
      return fixture;
    },
    ['half-gone'],
    undefined,
  );
});

// Invariant: every `present-clean` fact blocks a present worktree alone: containment in a base
// directory, the main checkout, a foreign repository at the registered path, a locked or prunable
// registration, a non-canonical path, a release quarantine, a dirty checkout (untracked, ignored,
// skip-worktree), an operation in progress, unpushed commits, and a failed proof Git call.
test('invalid-record blockers that apply to present-clean block a present worktree', async (t) => {
  const failing = (predicate) => ({
    runner: interceptingRunner((args, request) =>
      predicate(args, request)
        ? { status: 128, stdout: '', stderr: 'fatal: injected\n' }
        : undefined,
    ).runner,
  });
  // A failing Git call in the fixture's worktree only, for arguments other checks also use.
  const failingIn = (name) => async (t2) => {
    const fixture = await legacyAt(t2);
    const inside = (args, request) =>
      request.cwd === fixture.worktree.worktreePath && args.includes(name);
    return { ...fixture, extra: failing(inside) };
  };
  for (const [name, setup, expected] of [
    [
      'outside-base-dir',
      async (t2) =>
        legacyAt(t2, (root) => {
          const worktree = addWorktree(root, {
            path: join(root, '.effective-flow', 'elsewhere', 'wt'),
            branch: 'pr/elsewhere',
          });
          git(root, 'update-ref', 'refs/remotes/origin/pr/elsewhere', worktree.head);
          return worktree;
        }),
      ['outside-base-dir'],
    ],
    [
      'main-or-execution-root',
      async (t2) =>
        legacyAt(t2, (root) => ({
          worktreePath: root,
          branch: 'main',
          head: git(root, 'rev-parse', 'HEAD'),
        })),
      ['main-or-execution-root'],
    ],
    [
      'not-registered-here',
      async (t2) => {
        const fixture = await legacyAt(t2);
        rmSync(fixture.worktree.worktreePath, { recursive: true, force: true });
        mkdirSync(fixture.worktree.worktreePath);
        git(fixture.worktree.worktreePath, 'init', '-q');
        return fixture;
      },
      ['not-registered-here'],
    ],
    [
      'registration-locked',
      async (t2) => {
        const fixture = await legacyAt(t2);
        git(fixture.root, 'worktree', 'lock', fixture.worktree.worktreePath);
        return fixture;
      },
      ['registration-locked'],
    ],
    [
      'registration-prunable',
      async (t2) => {
        const fixture = await legacyAt(t2);
        rmSync(join(fixture.worktree.worktreePath, '.git'));
        return fixture;
      },
      ['registration-prunable', 'not-registered-here'],
    ],
    [
      'path-not-canonical',
      async (t2) => {
        const fixture = await legacyAt(t2);
        const alias = join(baseDir(fixture.root), 'alias');
        symlinkSync(fixture.worktree.worktreePath, alias);
        writeRecordFile(fixture.root, fixture.recordId, {
          ...fixture.record,
          worktreePath: alias,
        });
        return fixture;
      },
      ['path-not-canonical'],
    ],
    [
      'quarantine',
      async (t2) => {
        const fixture = await legacyAt(t2);
        mkdirSync(join(fixture.worktree.worktreePath, `${RELEASE_QUARANTINE_PREFIX}1`));
        return fixture;
      },
      ['quarantine'],
    ],
    [
      'dirty (untracked)',
      async (t2) => {
        const fixture = await legacyAt(t2);
        writeFileSync(join(fixture.worktree.worktreePath, 'untracked.txt'), 'x\n');
        return fixture;
      },
      ['dirty'],
    ],
    [
      'dirty (ignored)',
      async (t2) => {
        const fixture = await legacyAt(t2);
        mkdirSync(join(fixture.worktree.worktreePath, '.effective-flow'));
        writeFileSync(join(fixture.worktree.worktreePath, '.effective-flow', 'kept'), 'x\n');
        return fixture;
      },
      ['dirty'],
    ],
    [
      'dirty (skip-worktree)',
      async (t2) => {
        const fixture = await legacyAt(t2);
        git(fixture.worktree.worktreePath, 'update-index', '--skip-worktree', 'base.txt');
        return fixture;
      },
      ['dirty'],
    ],
    [
      'in-progress-operation',
      async (t2) => {
        const fixture = await legacyAt(t2);
        const mergeHead = git(
          fixture.worktree.worktreePath,
          'rev-parse',
          '--path-format=absolute',
          '--git-path',
          'MERGE_HEAD',
        );
        writeFileSync(mergeHead, `${fixture.worktree.head}\n`);
        return fixture;
      },
      ['in-progress-operation'],
    ],
    [
      'unpushed-commits',
      async (t2) => {
        const fixture = await legacyAt(t2);
        git(fixture.worktree.worktreePath, 'commit', '-q', '--allow-empty', '-m', 'local');
        return fixture;
      },
      ['unpushed-commits'],
    ],
    [
      'proof-unavailable (rev-list)',
      async (t2) => ({
        ...(await legacyAt(t2)),
        extra: failing((args) => args.includes('rev-list') && args.includes('--remotes')),
      }),
      ['proof-unavailable'],
    ],
    [
      'proof-unavailable (status)',
      async (t2) => ({
        ...(await legacyAt(t2)),
        extra: failing((args) => args.includes('status') && args.includes('--ignored')),
      }),
      ['proof-unavailable'],
    ],
    [
      'proof-unavailable (index flags)',
      async (t2) => ({
        ...(await legacyAt(t2)),
        extra: failing((args) => args.includes('ls-files')),
      }),
      ['proof-unavailable'],
    ],
    ['proof-unavailable (in-progress probe)', failingIn('--git-path'), ['proof-unavailable']],
    ['proof-unavailable (toplevel)', failingIn('--show-toplevel'), ['proof-unavailable']],
  ]) {
    const { blocked } = await expectBlocked(t, name, setup, expected, 'present-clean');
    // Each of these facts is the only one that fails in its fixture.
    const alone = ['outside-base-dir', 'registration-locked', 'quarantine', 'unpushed-commits'];
    if (alone.includes(name) || name.startsWith('dirty') || name.startsWith('proof')) {
      assert.deepEqual(blocked.blockers, expected, `${name}: alone`);
    }
  }
});

// Invariant: a linked worktree that is the call's `executionRoot` is `main-or-execution-root` for an
// invalid record naming it, however clean and pushed: cleanup never removes the checkout it runs in.
test('an invalid record naming the linked execution root is main-or-execution-root', async (t) => {
  const { root, recordId, worktree } = await legacyAt(t);
  assert.ok(
    invalidEntry(await plan(root), recordId).item,
    'control: offered from the main checkout',
  );
  const input = { cwd: root, executionRoot: worktree.worktreePath };
  const planned = expectOk(await call('cleanup plan', input));
  const { item, blocked } = invalidEntry(planned, recordId);
  assert.equal(item, undefined);
  assert.deepEqual(
    [blocked?.action, blocked?.blockers],
    ['present-clean', ['main-or-execution-root']],
    JSON.stringify(planned.blocked),
  );
  const refused = expectOutcome(
    await call('cleanup apply', {
      ...input,
      items: { [`invalid-record:${recordId}`]: 'a'.repeat(64) },
    }),
    'PREVIEW_MISMATCH',
  );
  assert.deepEqual(refused.blockers, ['main-or-execution-root']);
  assert.ok(existsSync(worktree.worktreePath));
  assert.ok(existsSync(recordFile(root, recordId)));
});

// Invariant: when the base directories cannot be resolved, only a `present-clean` candidate is
// blocked (`base-dir-unresolved`); `cleanup plan` still succeeds and an `absent` record stays an
// item.
test('an unresolved base directory blocks only present-clean invalid records', async (t) => {
  const { root } = await expectBlocked(
    t,
    'base-dir-unresolved',
    async (t2) => {
      const fixture = await legacyAt(t2);
      const absent = legacyRecord(fixture.root, absentWorktree(fixture.root), {
        recordId: 'legacy-absent',
      });
      writeRecordFile(fixture.root, absent.recordId, absent);
      writeFileSync(
        join(fixture.root, '.effective-flow', 'project-setup.md'),
        '# Effective Flow project setup\n\n## Status\n\nActive\n\n## Configuration\n\n' +
          '| Key | Value |\n| --- | --- |\n| visibility | hidden |\n' +
          '| worktree.baseDir | one |\n| worktree.baseDir | two |\n',
      );
      return fixture;
    },
    ['base-dir-unresolved'],
    'present-clean',
  );
  const planned = await plan(root);
  assert.equal(planned.locatorStep, null, 'the configuration does not resolve');
  assert.deepEqual(invalidEntry(planned, 'legacy-1').blocked?.blockers, ['base-dir-unresolved']);
  assert.equal(invalidEntry(planned, 'legacy-absent').item?.action, 'absent');
});

// Invariant: the first-pass recompute binds fresh facts and the record file's bytes: a record file
// rewritten or a worktree turned dirty after the dry run ends the whole call as PREVIEW_MISMATCH
// before any write.
test('cleanup apply refuses a changed invalid record before any write', async (t) => {
  const { root, recordId, worktree, record } = await legacyAt(t);
  const planned = await plan(root);
  const itemId = `invalid-record:${recordId}`;
  assert.ok(invalidEntry(planned, recordId).item);
  writeRecordFile(root, recordId, `${JSON.stringify(record)}\n`);
  const rewritten = readFileSync(recordFile(root, recordId));
  const changed = expectOutcome(await applyItems(root, planned, [itemId]), 'PREVIEW_MISMATCH');
  assert.deepEqual([changed.itemId, changed.reason], [itemId, 'digest']);
  assert.deepEqual(readFileSync(recordFile(root, recordId)), rewritten);
  const fresh = await plan(root);
  writeFileSync(join(worktree.worktreePath, 'late.txt'), 'x\n');
  const dirty = expectOutcome(await applyItems(root, fresh, [itemId]), 'PREVIEW_MISMATCH');
  assert.deepEqual([dirty.reason, dirty.blockers], ['not-actionable', ['dirty']]);
  assert.ok(existsSync(worktree.worktreePath));
  assert.deepEqual(readFileSync(recordFile(root, recordId)), rewritten);
  assert.deepEqual(lockDirs(root), []);
});

// Invariant: under the record lock the facts are re-derived once more: a record file rewritten
// after the first pass is that item's own PREVIEW_MISMATCH, and nothing is removed or written.
test('cleanup apply re-checks an invalid record under its lock as an item PREVIEW_MISMATCH', async (t) => {
  const { root, recordId, worktree, record } = await legacyAt(t);
  const planned = await plan(root);
  let rewritten;
  const result = expectOk(
    await applyItems(root, planned, [`invalid-record:${recordId}`], {
      onPhase: (name) => {
        if (name !== 'underLock') return;
        writeRecordFile(root, recordId, `${JSON.stringify(record)}\n`);
        rewritten = readFileSync(recordFile(root, recordId));
      },
    }),
  );
  assert.deepEqual(
    result.items.map(({ code, reason }) => [code, reason]),
    [['PREVIEW_MISMATCH', 'digest']],
    JSON.stringify(result),
  );
  assert.ok(existsSync(worktree.worktreePath));
  assert.deepEqual(readFileSync(recordFile(root, recordId)), rewritten);
  assert.deepEqual(lockDirs(root), []);
});

// Invariant: a failed `git worktree remove` fails only that item: the record file stays byte for
// byte as it was, since an invalid record is never rewritten.
test('a failed invalid-record removal keeps the record file unchanged', async (t) => {
  const { root, recordId, worktree } = await legacyAt(t);
  const planned = await plan(root);
  const before = readFileSync(recordFile(root, recordId));
  const { runner } = interceptingRunner((args) =>
    args[0] === 'worktree' && args[1] === 'remove'
      ? { status: 128, stdout: '', stderr: 'fatal: injected refusal\n' }
      : undefined,
  );
  const result = expectOk(
    await applyItems(root, planned, [`invalid-record:${recordId}`], { runner }),
  );
  assert.deepEqual(
    result.items.map(({ code, recordKept }) => [code, recordKept]),
    [['REMOVE_FAILED', true]],
    JSON.stringify(result),
  );
  assert.match(result.items[0].reason, /injected refusal/);
  assert.deepEqual(readFileSync(recordFile(root, recordId)), before);
  assert.ok(existsSync(worktree.worktreePath));
  assert.deepEqual(lockDirs(root), []);
});

// Invariant: `worktree:` and `invalid-record:` items together are capped at MAX_RECORD_IDS and the
// whole selection at MAX_RECORD_IDS + 3 (the three legacy items), checked before any Git call.
test('cleanup apply caps worktree and invalid-record items together at MAX_RECORD_IDS', async () => {
  const digest = 'a'.repeat(64);
  const select = (worktrees, invalid, legacy) =>
    Object.fromEntries([
      ...Array.from({ length: worktrees }, (_, index) => [`worktree:w${index}`, digest]),
      ...Array.from({ length: invalid }, (_, index) => [`invalid-record:i${index}`, digest]),
      ...['legacy:.firmo', 'legacy:.sf-plugin', 'config:.effective-flow/config.json']
        .slice(0, legacy)
        .map((id) => [id, digest]),
    ]);
  const { executeOperation } = await import('../src/scripts/effective-flow-state-core.mjs');
  const run = (items) =>
    executeOperation(
      'cleanup apply',
      { cwd: '/nonexistent', executionRoot: '/nonexistent', items },
      { runner: unreachableRunner() },
    );
  for (const [worktrees, invalid, legacy] of [
    [MAX_RECORD_IDS / 2, MAX_RECORD_IDS / 2 + 1, 0],
    [0, MAX_RECORD_IDS + 1, 0],
  ]) {
    const envelope = await run(select(worktrees, invalid, legacy));
    const error = expectError(envelope, 'INVALID_INPUT');
    assert.match(error.message, /worktree and invalid-record items/);
  }
  // At the boundary the input is accepted and the call fails only later, at the root.
  for (const [worktrees, invalid] of [
    [MAX_RECORD_IDS / 2, MAX_RECORD_IDS / 2],
    [0, MAX_RECORD_IDS],
  ]) {
    const envelope = await run(select(worktrees, invalid, 3));
    assert.equal(envelope.ok, false);
    assert.notEqual(envelope.error?.code, 'INVALID_INPUT', JSON.stringify(envelope.error));
  }
});

// Invariant: `invalid-record` items share the deadline and signal handling of `cleanup apply`:
// once the item floor is reached or a signal arrived, no further item starts, and a signal seen
// under the lock leaves that record file in place.
test('cleanup apply: the deadline and a signal stop the remaining invalid-record items', async (t) => {
  for (const stop of ['deadline', 'signal']) {
    const root = repository(t);
    for (const recordId of ['legacy-a', 'legacy-b']) {
      const worktree = absentWorktree(root, recordId);
      writeRecordFile(root, recordId, legacyRecord(root, worktree, { recordId }));
    }
    const planned = await plan(root);
    const signalTarget = new EventEmitter();
    let time = 0;
    const result = expectOk(
      await applyItems(root, planned, ['invalid-record:legacy-a', 'invalid-record:legacy-b'], {
        signalTarget,
        monotonicNow: () => time,
        onPhase: (name, detail) => {
          if (name !== 'underLock' || detail.recordId !== 'legacy-a') return;
          if (stop === 'deadline') time += DEFAULT_DEADLINE_MS - 10_000;
          else signalTarget.emit('SIGTERM');
        },
      }),
    );
    assert.deepEqual(
      result.items.map(({ itemId, ok, code }) => [itemId, ok, code]),
      stop === 'deadline'
        ? [
            ['invalid-record:legacy-a', true, undefined],
            ['invalid-record:legacy-b', false, 'DEADLINE_REACHED'],
          ]
        : [
            ['invalid-record:legacy-a', false, 'INTERRUPTED'],
            ['invalid-record:legacy-b', false, 'INTERRUPTED'],
          ],
      stop,
    );
    assert.equal(existsSync(recordFile(root, 'legacy-a')), stop === 'signal');
    assert.ok(existsSync(recordFile(root, 'legacy-b')), stop);
    assert.deepEqual(lockDirs(root), [], stop);
  }
});

// ---------------------------------------------------------------------------------------------
// The `invalid-record` class: blockers, trust and apply-time races

// Applies a selection that bypasses the dry run's items: `itemId` carries a made-up digest, as a
// caller would send for an entry `cleanup plan` listed blocked. The call must end before any write.
function applyBlocked(root, itemId) {
  return call('cleanup apply', {
    cwd: root,
    executionRoot: root,
    items: { [itemId]: 'a'.repeat(64) },
  });
}

// Invariant: a record file that is oversized or a symlink is `invalid-json` and offers no action,
// whatever its content claims: its fields are never consulted, the symlink is never followed, and
// a selection of it ends as PREVIEW_MISMATCH with the link and its target untouched.
test('an oversized or symlinked record file is invalid-json, never selectable and never followed', async (t) => {
  for (const [kind, schemaReason] of [
    ['oversized', 'oversized'],
    ['symlinked', 'not-regular'],
  ]) {
    const root = repository(t);
    const record = legacyRecord(root, absentWorktree(root));
    const file = recordFile(root, record.recordId);
    let target = file;
    if (kind === 'oversized') {
      // Valid JSON that would otherwise be an `absent` item: only its size blocks it.
      writeRecordFile(root, record.recordId, { ...record, reason: 'x'.repeat(70 * 1024) });
    } else {
      mkdirSync(join(root, '.effective-flow', 'worktree-runs'), { recursive: true });
      target = join(root, '.effective-flow', 'elsewhere.json');
      writeFileSync(target, `${JSON.stringify(record)}\n`);
      symlinkSync(target, file);
    }
    const planned = await plan(root);
    const { item, blocked } = invalidEntry(planned, record.recordId);
    assert.equal(item, undefined, `${kind}: not an item`);
    assert.deepEqual(
      [blocked?.schemaReason, blocked?.blockers, Object.hasOwn(blocked ?? {}, 'action')],
      [schemaReason, ['invalid-json'], false],
      `${kind}: ${JSON.stringify(planned.blocked)}`,
    );
    assert.equal(blocked.evidence.worktreePath, null, `${kind}: the path is not read`);
    const before = readFileSync(target);
    const refused = expectOutcome(
      await applyBlocked(root, `invalid-record:${record.recordId}`),
      'PREVIEW_MISMATCH',
    );
    assert.deepEqual([refused.reason, refused.blockers], ['not-actionable', ['invalid-json']]);
    assert.ok(existsSync(file), `${kind}: the record file stays`);
    assert.deepEqual(readFileSync(target), before, `${kind}: the target is unchanged`);
  }
});

// Invariant: a path with several worktree registrations is `not-registered-here` for
// `present-clean`: the helper cannot tell which registration the record means, so it removes none.
test('an invalid record whose path has several registrations is not-registered-here and kept', async (t) => {
  const { root, recordId, worktree } = await legacyAt(t);
  const adminDir = git(worktree.worktreePath, 'rev-parse', '--path-format=absolute', '--git-dir');
  cpSync(adminDir, `${adminDir}-copy`, { recursive: true });
  const registered = git(root, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line === `worktree ${worktree.worktreePath}`);
  assert.equal(registered.length, 2, 'Git lists the path twice');
  const { blocked } = await expectBlocked(
    t,
    'several registrations',
    async () => ({ root, recordId }),
    ['not-registered-here'],
    'present-clean',
  );
  assert.equal(blocked.evidence.registrations, 2);
  const refused = expectOutcome(
    await applyBlocked(root, `invalid-record:${recordId}`),
    'PREVIEW_MISMATCH',
  );
  assert.ok(refused.blockers.includes('not-registered-here'));
  assert.ok(existsSync(worktree.worktreePath));
  assert.ok(existsSync(recordFile(root, recordId)));
});

// Invariant: every operation marker of the in-progress proof and every kind of index flag blocks a
// present worktree on its own, since `git status` alone shows neither an assume-unchanged edit nor
// a finished-looking sequencer directory.
test('present-clean invalid records are blocked by each in-progress marker and by assume-unchanged entries', async (t) => {
  const marker = (name, kind) => async (t2) => {
    const fixture = await legacyAt(t2);
    const location = git(
      fixture.worktree.worktreePath,
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      name,
    );
    if (kind === 'directory') mkdirSync(location, { recursive: true });
    else writeFileSync(location, `${fixture.worktree.head}\n`);
    return fixture;
  };
  for (const [name, setup, expected] of [
    ['CHERRY_PICK_HEAD', marker('CHERRY_PICK_HEAD', 'file'), ['in-progress-operation']],
    ['REVERT_HEAD', marker('REVERT_HEAD', 'file'), ['in-progress-operation']],
    ['rebase-merge', marker('rebase-merge', 'directory'), ['in-progress-operation']],
    ['rebase-apply', marker('rebase-apply', 'directory'), ['in-progress-operation']],
    ['sequencer', marker('sequencer', 'directory'), ['in-progress-operation']],
    [
      'dirty (assume-unchanged)',
      async (t2) => {
        const fixture = await legacyAt(t2);
        git(fixture.worktree.worktreePath, 'update-index', '--assume-unchanged', 'base.txt');
        return fixture;
      },
      ['dirty'],
    ],
  ]) {
    const { blocked } = await expectBlocked(t, name, setup, expected, 'present-clean');
    assert.deepEqual(blocked.blockers, expected, `${name}: alone`);
  }
});

// Invariant: the file- and field-level blockers that apply to both actions also block a present
// worktree and keep its `present-clean` action.
test('invalid-record blockers that apply to both actions also block a present-clean record', async (t) => {
  for (const [name, setup, blocker] of [
    [
      'record-locked',
      async (t2) => {
        const fixture = await legacyAt(t2);
        mkdirSync(lockFile(fixture.root, fixture.recordId));
        return fixture;
      },
      'record-locked',
    ],
    [
      'ledger-present',
      async (t2) => {
        const fixture = await legacyAt(t2);
        const ledgers = join(fixture.root, '.effective-flow', 'worktree-runs', 'ledgers');
        mkdirSync(ledgers);
        writeFileSync(join(ledgers, `${fixture.recordId}.ledger`), '{}\n');
        return fixture;
      },
      'ledger-present',
    ],
    [
      'unsafe-ledger-directory',
      async (t2) => {
        const fixture = await legacyAt(t2);
        writeFileSync(join(fixture.root, '.effective-flow', 'worktree-runs', 'ledgers'), 'x\n');
        return fixture;
      },
      'unsafe-ledger-directory',
    ],
    [
      'status-not-terminal',
      async (t2) => legacyAt(t2, pushedWorktree, { status: 'active' }),
      'status-not-terminal',
    ],
  ]) {
    const { blocked } = await expectBlocked(t, name, setup, [blocker], 'present-clean');
    assert.deepEqual(blocked.blockers, [blocker], `${name}: alone`);
  }
});

// Invariant: a field of an invalid record may only block, never authorize: a record that claims
// `cleanup-ready`, a branch to delete and its own ownership is still blocked by the facts of its
// worktree (dirty, outside the base directories, the main checkout), and a selection of it with a
// made-up digest ends before any write with the worktree and the record in place.
test('an invalid record that claims cleanup-ready authorizes nothing the facts do not prove', async (t) => {
  const claims = {
    status: 'cleanup-ready',
    ownership: 'effective-flow-created',
    branchPolicy: 'delete-after-integration',
  };
  for (const [name, worktreeOf, mutate, blocker] of [
    [
      'dirty',
      pushedWorktree,
      (worktree) => writeFileSync(join(worktree.worktreePath, 'late.txt'), 'x\n'),
      'dirty',
    ],
    [
      'outside the base directories',
      (root) => {
        const worktree = addWorktree(root, {
          path: join(root, '.effective-flow', 'elsewhere', 'wt'),
          branch: 'pr/elsewhere',
        });
        git(root, 'update-ref', 'refs/remotes/origin/pr/elsewhere', worktree.head);
        return worktree;
      },
      () => {},
      'outside-base-dir',
    ],
    [
      'the main checkout',
      (root) => ({
        worktreePath: root,
        branch: 'main',
        head: git(root, 'rev-parse', 'HEAD'),
      }),
      () => {},
      'main-or-execution-root',
    ],
  ]) {
    const fixture = await legacyAt(t, worktreeOf, claims);
    mutate(fixture.worktree);
    const { blocked } = await expectBlocked(
      t,
      name,
      async () => fixture,
      [blocker],
      'present-clean',
    );
    assert.ok(blocked.blockers.includes(blocker), name);
    const before = readFileSync(recordFile(fixture.root, fixture.recordId));
    const refused = expectOutcome(
      await applyBlocked(fixture.root, `invalid-record:${fixture.recordId}`),
      'PREVIEW_MISMATCH',
    );
    assert.deepEqual([refused.reason, refused.blockers], ['not-actionable', blocked.blockers]);
    assert.ok(existsSync(fixture.worktree.worktreePath), `${name}: the worktree stays`);
    assert.deepEqual(readFileSync(recordFile(fixture.root, fixture.recordId)), before);
  }
});

// Invariant: an invalid record never deletes a branch, even when its own `branch` field names a
// branch of the repository and its `branchPolicy` asks for deletion: after either action every
// branch still exists and no Git call writes a ref.
test('retiring an invalid record keeps every branch whatever the record claims', async (t) => {
  for (const [action, worktreeOf] of [
    ['present-clean', pushedWorktree],
    ['absent', absentWorktree],
  ]) {
    const root = repository(t);
    const worktree = worktreeOf(root);
    const record = legacyRecord(root, worktree, {
      overrides: { branch: 'main', branchPolicy: 'delete-after-integration' },
    });
    writeRecordFile(root, record.recordId, record);
    const planned = await plan(root);
    assert.equal(invalidEntry(planned, record.recordId).item?.action, action, action);
    const branches = git(root, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/');
    const { runner, calls } = interceptingRunner(() => undefined);
    const result = expectOk(
      await applyItems(root, planned, [`invalid-record:${record.recordId}`], { runner }),
    );
    assert.equal(result.items[0].ok, true, JSON.stringify(result));
    assert.equal(existsSync(recordFile(root, record.recordId)), false, `${action}: retired`);
    assert.equal(
      git(root, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/'),
      branches,
      `${action}: no ref changed`,
    );
    assert.ok(
      !calls.some((args) => ['branch', 'update-ref', 'push', 'fetch', 'tag'].includes(args[0])),
      `${action}: no Git call writes a ref`,
    );
  }
});

// Invariant: a denied sandbox probe is SANDBOX_DENIED for an `invalid-record` item of either
// action, found before the lock or any write: the record file, the worktree and the lock
// directories are exactly as the dry run saw them.
test('cleanup apply: a denied sandbox probe leaves an invalid record and its worktree untouched', async (t) => {
  for (const [action, worktreeOf] of [
    ['present-clean', pushedWorktree],
    ['absent', absentWorktree],
  ]) {
    const { root, recordId, worktree } = await legacyAt(t, worktreeOf);
    const planned = await plan(root);
    assert.equal(invalidEntry(planned, recordId).item?.action, action, action);
    const before = readFileSync(recordFile(root, recordId));
    const probes = [];
    const fs = {
      open: async (target, ...rest) => {
        if (target.includes('.effective-flow-probe-')) {
          probes.push(target);
          throw Object.assign(new Error('denied'), { code: 'EPERM' });
        }
        return openPath(target, ...rest);
      },
    };
    const result = expectOk(
      await applyItems(root, planned, [`invalid-record:${recordId}`], { fs }),
    );
    assert.deepEqual(
      result.items.map(({ itemId, ok, code, errno }) => [itemId, ok, code, errno]),
      [[`invalid-record:${recordId}`, false, 'SANDBOX_DENIED', 'EPERM']],
      `${action}: ${JSON.stringify(result)}`,
    );
    assert.equal(typeof result.items[0].directory, 'string');
    assert.equal(probes.length, 1, `${action}: the first denial ends the preflight`);
    if (action === 'absent') {
      // `absent` writes only the record directory, so that is the one directory it probes.
      assert.equal(result.items[0].directory, join(root, '.effective-flow', 'worktree-runs'));
    }
    assert.deepEqual(readFileSync(recordFile(root, recordId)), before, `${action}: record`);
    assert.equal(existsSync(worktree.worktreePath), action === 'present-clean', action);
    assert.deepEqual(lockDirs(root), [], `${action}: no lock`);
  }
});

// Invariant: an `absent` item writes only its record directory, so that is the only directory its
// sandbox preflight probes: a record whose path lies below a directory the sandbox denies (here
// every probe outside the record directory fails) is still retired, with no probe anywhere else.
test('cleanup apply probes only the record directory for an absent invalid record', async (t) => {
  const root = repository(t);
  const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-denied-')));
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }));
  const record = legacyRecord(root, {
    worktreePath: join(elsewhere, 'gone', 'wt'),
    branch: 'pr/gone',
    head: git(root, 'rev-parse', 'HEAD'),
  });
  writeRecordFile(root, record.recordId, record);
  const planned = await plan(root);
  assert.equal(
    invalidEntry(planned, record.recordId).item?.action,
    'absent',
    JSON.stringify(planned.blocked),
  );
  const recordDir = join(root, '.effective-flow', 'worktree-runs');
  const probes = [];
  const fs = {
    open: async (target, ...rest) => {
      if (target.includes('.effective-flow-probe-')) {
        probes.push(target);
        if (dirname(target) !== recordDir) {
          throw Object.assign(new Error('denied'), { code: 'EACCES' });
        }
      }
      return openPath(target, ...rest);
    },
  };
  const result = expectOk(
    await applyItems(root, planned, [`invalid-record:${record.recordId}`], { fs }),
  );
  assert.deepEqual(
    result.items.map(({ ok, action }) => [ok, action]),
    [[true, 'absent']],
    JSON.stringify(result),
  );
  assert.deepEqual(
    probes.map((probe) => dirname(probe)),
    [recordDir],
  );
  assert.equal(existsSync(recordFile(root, record.recordId)), false);
  assert.deepEqual(readdirSync(elsewhere), [], 'nothing is written beside the recorded path');
  assert.deepEqual(
    readdirSync(recordDir).filter((name) => name.startsWith('.effective-flow-probe-')),
    [],
  );
});

// Invariant: Git runs in an invalid record's path only once the common-directory proof holds: a
// foreign repository at a registered path gets nothing but that probe from `cleanup plan` and
// `cleanup apply`, so its `core.fsmonitor` hook never runs, and every other Git call in a proven
// `present-clean` worktree, the apply's preflight included, carries `core.fsmonitor=false`.
test('the invalid-record class proves a path before Git runs in it and disables fsmonitor there', async (t) => {
  const probe = ['rev-parse', '--path-format=absolute', '--git-common-dir'].join(' ');
  const recording = (target) => {
    const inside = [];
    const { runner } = interceptingRunner((args, request) => {
      if (request.cwd === target) inside.push(args);
      return undefined;
    });
    return { inside, runner };
  };

  // A foreign repository replaces the registered worktree directory.
  const foreign = await legacyAt(t);
  const target = foreign.worktree.worktreePath;
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target);
  git(target, 'init', '-q', '--initial-branch=main');
  writeFileSync(join(target, 'f.txt'), 'foreign\n');
  git(target, 'add', 'f.txt');
  git(target, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'foreign');
  const scratch = mkdtempSync(join(tmpdir(), 'effective-flow-fsmonitor-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const marker = join(scratch, 'fsmonitor-ran');
  const hook = join(scratch, 'fsmonitor.sh');
  writeFileSync(hook, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`);
  chmodSync(hook, 0o755);
  git(target, 'config', 'core.fsmonitor', hook);
  git(target, 'status', '--porcelain');
  assert.ok(existsSync(marker), 'control: a plain status runs the fsmonitor command');
  rmSync(marker);
  const trapped = recording(target);
  const input = { cwd: foreign.root, executionRoot: foreign.root };
  const planned = expectOk(await call('cleanup plan', input, { runner: trapped.runner }));
  const { blocked } = invalidEntry(planned, foreign.recordId);
  assert.ok(blocked?.blockers.includes('not-registered-here'), JSON.stringify(planned.blocked));
  const refused = expectOutcome(
    await call(
      'cleanup apply',
      { ...input, items: { [`invalid-record:${foreign.recordId}`]: 'a'.repeat(64) } },
      { runner: trapped.runner },
    ),
    'PREVIEW_MISMATCH',
  );
  assert.ok(refused.blockers.includes('not-registered-here'), JSON.stringify(refused));
  assert.equal(existsSync(marker), false, 'the foreign fsmonitor command never ran');
  assert.ok(trapped.inside.length > 0, 'the common-directory probe ran in the foreign path');
  for (const args of trapped.inside) assert.equal(args.join(' '), probe);
  assert.ok(existsSync(join(target, 'f.txt')), 'the foreign repository is untouched');

  // A proven worktree: every Git call in it but the probe disables fsmonitor.
  const own = await legacyAt(t);
  const proven = recording(own.worktree.worktreePath);
  const ownInput = { cwd: own.root, executionRoot: own.root };
  const ownPlan = expectOk(await call('cleanup plan', ownInput, { runner: proven.runner }));
  const { item } = invalidEntry(ownPlan, own.recordId);
  assert.equal(item?.action, 'present-clean', JSON.stringify(ownPlan.blocked));
  const applied = expectOk(
    await call(
      'cleanup apply',
      { ...ownInput, items: { [item.itemId]: item.itemDigest } },
      { runner: proven.runner },
    ),
  );
  assert.equal(applied.items[0].ok, true, JSON.stringify(applied));
  const guarded = proven.inside.filter((args) => args.join(' ') !== probe);
  assert.ok(
    guarded.some((args) => args.includes('status')),
    'the status proof ran',
  );
  assert.ok(
    guarded.some((args) => args.includes('--git-dir')),
    'the preflight probe ran',
  );
  for (const args of guarded) {
    assert.deepEqual(args.slice(0, 2), ['-c', 'core.fsmonitor=false'], args.join(' '));
  }
});

// Invariant: a record lock that exists when `cleanup apply` starts ends the whole call as
// PREVIEW_MISMATCH with `record-locked`, and one that another actor takes between the first pass
// and this item's own lock is that item's LOCK_HELD. Either way nothing is written and the foreign
// lock is never broken.
test('cleanup apply: a held record lock blocks an invalid record and is never broken', async (t) => {
  const first = await legacyAt(t);
  const plannedFirst = await plan(first.root);
  assert.ok(invalidEntry(plannedFirst, first.recordId).item);
  mkdirSync(lockFile(first.root, first.recordId));
  const refused = expectOutcome(
    await applyItems(first.root, plannedFirst, [`invalid-record:${first.recordId}`]),
    'PREVIEW_MISMATCH',
  );
  assert.deepEqual([refused.reason, refused.blockers], ['not-actionable', ['record-locked']]);
  assert.deepEqual(lockDirs(first.root), [`${first.recordId}.lock`], 'the lock stays');
  assert.ok(existsSync(first.worktree.worktreePath));

  const raced = await legacyAt(t);
  const plannedRaced = await plan(raced.root);
  const before = readFileSync(recordFile(raced.root, raced.recordId));
  const fs = {
    // Another actor creates the lock first: the directory exists when this `mkdir` runs.
    mkdir: async (target, ...rest) => {
      if (target === lockFile(raced.root, raced.recordId)) {
        await makeDirectory(target, ...rest);
        throw Object.assign(new Error('exists'), { code: 'EEXIST' });
      }
      return makeDirectory(target, ...rest);
    },
  };
  const result = expectOk(
    await applyItems(raced.root, plannedRaced, [`invalid-record:${raced.recordId}`], { fs }),
  );
  assert.deepEqual(
    result.items.map(({ itemId, ok, code }) => [itemId, ok, code]),
    [[`invalid-record:${raced.recordId}`, false, 'LOCK_HELD']],
    JSON.stringify(result),
  );
  assert.deepEqual(readFileSync(recordFile(raced.root, raced.recordId)), before);
  assert.ok(existsSync(raced.worktree.worktreePath));
  assert.deepEqual(lockDirs(raced.root), [`${raced.recordId}.lock`], 'the lock stays');
});

// Invariant: when the record file cannot be deleted after the worktree was removed, the item
// reports `removed: true` and `recordKept: true` with its reason, the branch stays, and once the
// file is readable again the next plan offers the record as `absent`, which deletes only the file.
test('a record file that cannot be deleted after the removal is reported and then offered as absent', async (t) => {
  const { root, recordId, worktree } = await legacyAt(t);
  const planned = await plan(root);
  const file = recordFile(root, recordId);
  const original = readFileSync(file);
  const result = expectOk(
    await applyItems(root, planned, [`invalid-record:${recordId}`], {
      onPhase: (name) => {
        // A directory in place of the file makes the guarded `unlink` fail after the removal.
        if (name !== 'afterRemove') return;
        rmSync(file);
        mkdirSync(file);
      },
    }),
  );
  assert.deepEqual(
    result.items.map(({ code, action, removed, recordKept }) => [
      code,
      action,
      removed,
      recordKept,
    ]),
    [['REMOVE_FAILED', 'present-clean', true, true]],
    JSON.stringify(result),
  );
  assert.match(result.items[0].reason, /record file could not be deleted/);
  assert.equal(existsSync(worktree.worktreePath), false);
  assert.equal(git(root, 'rev-parse', `refs/heads/${worktree.branch}`), worktree.head);
  assert.deepEqual(lockDirs(root), []);

  rmSync(file, { recursive: true });
  writeFileSync(file, original);
  const again = await plan(root);
  const { item } = invalidEntry(again, recordId);
  assert.deepEqual(
    [item?.action, item?.evidence.registrations, item?.evidence.present],
    ['absent', 0, false],
    JSON.stringify(again.blocked),
  );
  const retired = expectOk(await applyItems(root, again, [`invalid-record:${recordId}`]));
  assert.deepEqual(
    retired.items.map(({ ok, action, removed }) => [ok, action, removed]),
    [[true, 'absent', false]],
  );
  assert.equal(existsSync(file), false);
});

// Invariant: a Git failure that leaves a reported removal unverified (here `git worktree list`
// right after `git worktree remove`) is REMOVE_FAILED with `removed: 'unknown'` and
// `recordKept: true`: the record file stays byte for byte and the next plan assesses it afresh.
test('an unverified invalid-record removal keeps the record file and reports removed unknown', async (t) => {
  const { root, recordId, worktree } = await legacyAt(t);
  const planned = await plan(root);
  const before = readFileSync(recordFile(root, recordId));
  let removing = false;
  const { runner } = interceptingRunner((args) => {
    if (args[0] === 'worktree' && args[1] === 'remove') removing = true;
    else if (removing && args[0] === 'worktree' && args[1] === 'list') {
      return { status: 128, stdout: '', stderr: 'fatal: injected list failure\n' };
    }
    return undefined;
  });
  const result = expectOk(
    await applyItems(root, planned, [`invalid-record:${recordId}`], { runner }),
  );
  assert.deepEqual(
    result.items.map(({ code, action, removed, recordKept }) => [
      code,
      action,
      removed,
      recordKept,
    ]),
    [['REMOVE_FAILED', 'present-clean', 'unknown', true]],
    JSON.stringify(result),
  );
  assert.match(result.items[0].reason, /could not be verified.*injected list failure/);
  assert.deepEqual(readFileSync(recordFile(root, recordId)), before);
  assert.equal(git(root, 'rev-parse', `refs/heads/${worktree.branch}`), worktree.head);
  assert.deepEqual(lockDirs(root), []);
  assert.equal(invalidEntry(await plan(root), recordId).item?.action, 'absent');
});
