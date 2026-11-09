// Tests of the runtime-state helper's worktree-lifecycle and cleanup operations: the closed key
// sets, the record schema, the pure eligibility evaluator, item digests and decisions, every
// lifecycle transition, `record-init` per purpose, claim-remove-reconcile with injected runner,
// filesystem, clock and signals, and `cleanup plan` / `cleanup apply` selection by digest. Git-backed
// cases that need real branch histories (the patch-id proof, legacy guards) live in
// `effective-flow-state-git.test.mjs`.

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { open as openPath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import {
  SESSION,
  addWorktree,
  call,
  expectError,
  expectOk,
  expectOutcome,
  git,
  initialized,
  lockFile,
  makeRecord,
  moveTo,
  readRecord,
  recordFile,
  repository,
  requiredPath,
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
  for (const purpose of ['delivery', 'partial-diff', 'plan-publication', 'apply-review']) {
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
    ['afterClaim', 'r1'],
    ['afterRemove', 'r1'],
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
  assert.deepEqual([orphan?.kind, orphan?.reason], ['orphanLock', 'orphan-lock']);
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
