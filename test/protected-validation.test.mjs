import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  PROTECTED_VALIDATION_PROTOCOL,
  REQUIRED_NATIVE_CASES,
  VALIDATION_COMMANDS,
  VALIDATION_ENVIRONMENT,
  validateBackendEvidence,
  validateExportManifest,
  validatePolicy,
  validateResult,
  validationDigest,
} from '../src/scripts/protected-validation-protocol.mjs';
import {
  projectManifest,
  protectedValidationRoot,
  verifyProtectedBootstrap,
} from '../src/scripts/protected-validation-core.mjs';
import { executeOperation } from '../src/scripts/build-run-core.mjs';

const digest = (value) => validationDigest(value);
const oid = 'a'.repeat(40);
const ref = (name, value = name) => ({
  root: '/private/tmp/protected-validation',
  path: name,
  digest: digest(value),
});
const snapshot = {
  head: oid,
  index: digest('index'),
  workingTree: digest('tree'),
  untracked: digest('untracked'),
};
const closure = {
  workflowDigest: digest('workflow'),
  runnerDigest: digest('runner'),
  protocolDigest: digest('protocol'),
  coreDigest: digest('core'),
  operatorDigest: digest('operator'),
  projectionDigest: digest('projection'),
  backendDigest: digest('backend'),
  materializationAlgorithm: 'git-tree-v1',
  actions: { checkout: 'a'.repeat(40), pnpm: 'b'.repeat(40), node: 'c'.repeat(40) },
};
const policy = {
  protocol: PROTECTED_VALIDATION_PROTOCOL,
  repository: 'sebastian-software/effective-flow',
  workflowPath: '.github/workflows/protected-macos-validation.yml',
  executionClosure: closure,
  commands: [...VALIDATION_COMMANDS],
  nativeCases: [...REQUIRED_NATIVE_CASES],
  environment: VALIDATION_ENVIRONMENT,
};
const preparation = {
  protocol: PROTECTED_VALIDATION_PROTOCOL,
  requestRef: ref('validation-request-v004.json'),
  bootstrapRef: ref('bootstraps/boot-v004.json'),
  localSnapshot: snapshot,
  exportManifestRef: ref('exports/v004.json'),
  transportManifestRef: ref('manifests/transport-v004.json'),
  materializationManifestRef: ref('manifests/materialization-v004.json'),
  executionTree: oid,
  executionClosureDigest: digest(closure),
  repository: policy.repository,
  snapshotBranch: 'effective-flow/validation/v004',
  snapshotCommit: oid,
  snapshotTree: oid,
};
const request = {
  policyDigest: digest(policy),
  snapshot,
};
const backend = (overrides = {}) => ({
  metadata: {
    repository: policy.repository,
    runId: 42,
    runAttempt: 1,
    event: 'push',
    headBranch: preparation.snapshotBranch,
    headSha: preparation.snapshotCommit,
    workflowPath: policy.workflowPath,
    status: 'completed',
    conclusion: 'success',
    createdAt: '2026-10-22T10:00:00Z',
    runStartedAt: '2026-10-22T10:00:01Z',
    updatedAt: '2026-10-22T10:01:00Z',
  },
  jobs: [
    {
      runId: 42,
      runAttempt: 1,
      id: 7,
      name: 'protected-validation',
      status: 'completed',
      conclusion: 'success',
      startedAt: '2026-10-22T10:00:02Z',
      completedAt: '2026-10-22T10:01:00Z',
      runnerName: 'GitHub Actions 1',
      runnerGroupName: null,
      labels: ['macos-15'],
      steps: [
        'Checkout immutable validation transport',
        'Set up pinned pnpm',
        'Set up pinned Node',
        'Materialize and validate protected source',
      ].map((name, number) => ({
        name,
        number: number + 1,
        status: 'completed',
        conclusion: 'success',
        startedAt: '2026-10-22T10:00:02Z',
        completedAt: '2026-10-22T10:01:00Z',
      })),
    },
  ],
  logs: {
    runId: 42,
    runAttempt: 1,
    complete: true,
    rawDigest: digest('raw logs'),
    environment: VALIDATION_ENVIRONMENT,
    executionTree: preparation.executionTree,
    executionClosureDigest: preparation.executionClosureDigest,
    commands: VALIDATION_COMMANDS.map((command) => ({ command, exitCode: 0 })),
    nativeCases: REQUIRED_NATIVE_CASES.map((name) => ({ name, outcome: 'passed' })),
    materialized: true,
    codexBinaryDigest: digest('codex binary'),
    runnerImage: 'macos-15-arm64',
  },
  ...overrides,
});

test('validation policy rejects unknown fields and drift from the approved command/native closure', () => {
  assert.deepEqual(validatePolicy(policy), policy);
  assert.throws(
    () => validatePolicy({ ...policy, unexpected: true }),
    /missing or unknown validation field/,
  );
  assert.throws(
    () => validatePolicy({ ...policy, commands: [...VALIDATION_COMMANDS, 'echo bypass'] }),
    /commands differs/,
  );
  assert.throws(
    () => validatePolicy({ ...policy, nativeCases: REQUIRED_NATIVE_CASES.slice(0, -1) }),
    /native cases differs/,
  );
});

test('source projection classifies runtime, observer and unrelated plans instead of exporting them', () => {
  const projected = projectManifest(
    [
      ['src/main.mjs', '100644', digest('main')],
      ['src/run.sh', '100755', digest('run')],
      ['README.md', 'missing'],
      ['.effective-flow/memory.json', '100644', digest('memory')],
      ['docs/plan/2026-10-22-unrelated.md', '100644', digest('plan')],
      ['observer-journal.json', '100644', digest('journal')],
    ],
    { trackedPaths: ['src/main.mjs', 'src/run.sh', 'README.md'], snapshot },
  );
  assert.deepEqual(
    projected.files.map(({ path: value }) => value),
    ['src/main.mjs', 'src/run.sh'],
  );
  assert.deepEqual(projected.deletions, ['README.md']);
  assert.deepEqual(
    projected.excluded.map(({ path: value }) => value),
    ['.effective-flow/memory.json', 'docs/plan/2026-10-22-unrelated.md', 'observer-journal.json'],
  );
  assert.throws(
    () => projectManifest([['src/link', '120000', digest('link')]], { snapshot }),
    /symlinks and special source modes/,
  );
});

test('backend evidence is pending until the same attempt is complete and fails on incomplete native proof', () => {
  const pending = validateBackendEvidence(
    { ...backend(), metadata: { ...backend().metadata, status: 'in_progress' } },
    request,
    preparation,
    policy,
  );
  assert.deepEqual(pending, { state: 'pending', diagnostic: 'Actions attempt has not completed' });
  const failedFixture = backend();
  failedFixture.metadata.conclusion = 'failure';
  failedFixture.jobs[0].conclusion = 'failure';
  const failed = validateBackendEvidence(failedFixture, request, preparation, policy);
  assert.deepEqual(failed, {
    state: 'failed',
    diagnostic: 'Actual Actions attempt concluded failure',
  });
  const skipped = backend();
  skipped.logs.nativeCases = skipped.logs.nativeCases.map((entry, index) =>
    index === 0 ? { ...entry, outcome: 'skipped' } : entry,
  );
  assert.throws(
    () => validateBackendEvidence(skipped, request, preparation, policy),
    /actual native results differs/,
  );
});

test('backend evidence rejects foreign run attempts and missing required logs', () => {
  const foreign = backend();
  foreign.jobs[0].runAttempt = 2;
  assert.throws(
    () => validateBackendEvidence(foreign, request, preparation, policy),
    /another attempt/,
  );
  const incomplete = backend();
  incomplete.logs.complete = false;
  assert.throws(
    () => validateBackendEvidence(incomplete, request, preparation, policy),
    /missing complete attempt logs/,
  );
  const wrongBranch = backend();
  wrongBranch.metadata.headBranch = 'effective-flow/validation/foreign';
  assert.throws(
    () => validateBackendEvidence(wrongBranch, request, preparation, policy),
    /branch differs/,
  );
});

test('verified results cannot claim success when commands or native cases failed', () => {
  const value = {
    protocol: PROTECTED_VALIDATION_PROTOCOL,
    requestRef: preparation.requestRef,
    bootstrapRef: preparation.bootstrapRef,
    preparationRef: ref('preparation.json'),
    runId: 42,
    runAttempt: 1,
    repository: policy.repository,
    event: 'push',
    snapshotCommit: preparation.snapshotCommit,
    snapshotTree: preparation.snapshotTree,
    executionTree: preparation.executionTree,
    materializationManifestRef: preparation.materializationManifestRef,
    workflowPath: policy.workflowPath,
    workflowDigest: closure.workflowDigest,
    executionClosureDigest: preparation.executionClosureDigest,
    environment: VALIDATION_ENVIRONMENT,
    jobsRef: ref('jobs.json'),
    rawLogsRef: ref('raw.log'),
    commands: VALIDATION_COMMANDS.map((command) => ({ command, exitCode: 0 })),
    nativeCases: REQUIRED_NATIVE_CASES.map((name) => ({ name, outcome: 'passed' })),
    timing: {
      requestedAt: '2026-10-22T10:00:00Z',
      submittedAt: '2026-10-22T10:00:00Z',
      startedAt: '2026-10-22T10:00:00Z',
      completedAt: '2026-10-22T10:01:00Z',
      queueMs: 0,
      computeMs: 60000,
    },
    resources: { attempts: 1, runnerMinutes: 1 },
    outcome: 'verified',
    diagnostic: 'Complete approved attempt verified',
  };
  assert.deepEqual(validateResult(value), value);
  assert.throws(
    () =>
      validateResult({
        ...value,
        nativeCases: value.nativeCases.map((entry, index) =>
          index === 0 ? { ...entry, outcome: 'skipped' } : entry,
        ),
      }),
    /failed\/skipped observations/,
  );
  assert.throws(() => validateResult({ ...value, runAttempt: 0 }), /invalid Actions attempt/);
});

test('build-run has no generic success operation and rejects remote result input without common identity', async () => {
  await assert.rejects(
    executeOperation('remote-success', {}),
    (error) => error.code === 'INVALID_OPERATION',
  );
  await assert.rejects(
    executeOperation('validation-result', {
      requestRef: ref('request.json'),
      validatorHandle: 'validator',
    }),
    (error) => error.code === 'INVALID_PAYLOAD',
  );
});

test('protected bootstrap refuses an ordinary writable mailbox on the host platform', async (t) => {
  if (process.platform !== 'darwin')
    return t.skip('native macOS seatbelt qualification is unavailable on this host');
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'protected-validation-writable-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, '.effective-flow', 'protected-validation', 'bootstraps'), {
    recursive: true,
  });
  assert.equal(
    protectedValidationRoot(root),
    path.join(root, '.effective-flow', 'protected-validation'),
  );
  await assert.rejects(verifyProtectedBootstrap({ runtimeStateRoot: root }), (error) =>
    ['INVALID_VALIDATION', 'UNPROTECTED_VALIDATION'].includes(error.code),
  );
});
