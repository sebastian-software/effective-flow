// Shared closed protocol. Digests identify bytes; only the protected host grants authority.
import { createHash } from 'node:crypto';
import path from 'node:path';
export const PROTECTED_VALIDATION_PROTOCOL = 'effective-flow.protected-validation/1';
export const WORKFLOW_PATH = '.github/workflows/protected-macos-validation.yml';
export const RUNNER_PATH = 'scripts/protected-macos-validation.mjs';
export const TRANSPORT_ROOT = '.protected-validation';
export const VALIDATION_HISTORY_DEPTH = 4096;
export const MAX_VALIDATION_LOG_BYTES = 80 * 1024 * 1024;
export const CLOSURE_PATHS = Object.freeze({
  workflowDigest: WORKFLOW_PATH,
  runnerDigest: RUNNER_PATH,
  protocolDigest: 'src/scripts/protected-validation-protocol.mjs',
  coreDigest: 'src/scripts/protected-validation-core.mjs',
  operatorDigest: 'scripts/protected-validation-operator.mjs',
  projectionDigest: 'scripts/protected-validation-projection.mjs',
  backendDigest: 'scripts/protected-validation-backend.mjs',
  runnerHelperDigest: 'scripts/protected-validation-runner.mjs',
  watchdogDigest: 'scripts/protected-validation-watchdog.mjs',
});
export const REQUIRED_BACKEND_STEPS = Object.freeze([
  'Checkout immutable validation transport',
  'Set up pinned pnpm',
  'Set up pinned Node',
  'Materialize and validate protected source',
]);
export const VALIDATION_COMMANDS = Object.freeze([
  'pnpm test:preflight',
  'pnpm agent:check',
  'pnpm test',
  'node build.mjs',
  'pnpm test:distribution',
]);
export const REQUIRED_NATIVE_CASES = Object.freeze([
  'actual Codex native guard permits fixture Git push and missing stub ledger while denying host writes in descendants',
  'production coordinator initializes native trust before capture and preserves raw outcomes before postcheck failure',
  'E2 actual launch wrapper checks a realpath write denial inherited by its child process',
  'production probeHelper captures actual subprocess start/completion and oversized rejection without a model',
  'macOS sandbox probe observes an outer seatbelt denial',
]);
export const VALIDATION_ENVIRONMENT = Object.freeze({
  runner: 'macos-15',
  platform: 'darwin',
  arch: 'arm64',
  nodeMajor: 24,
  codexVersion: '0.163.0',
  codexArchive: 'codex-package-aarch64-apple-darwin.tar.gz',
  codexArchiveDigest: 'sha256:b0344fc2e41f15e0071147e5869008047b8ff4bf2c4a8897975d3bae3f103b34',
});
export class ProtectedValidationError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'ProtectedValidationError';
    this.code = code;
  }
}
export function reject(code, message) {
  throw new ProtectedValidationError(code, message);
}
export function canonicalJSON(value) {
  return JSON.stringify(value, (_key, item) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
}
export function validationDigest(value) {
  return (
    'sha256:' +
    createHash('sha256')
      .update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalJSON(value))
      .digest('hex')
  );
}
export function assertExact(value, required, optional = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => ![...required, ...optional].includes(key))
  )
    reject('INVALID_VALIDATION', 'missing or unknown validation field');
  return value;
}
export function validationText(value) {
  if (typeof value !== 'string' || !value.trim() || !value.isWellFormed() || value.includes('\0'))
    reject('INVALID_VALIDATION', 'invalid validation text');
  return value;
}
export function validationId(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(validationText(value)))
    reject('INVALID_VALIDATION', 'invalid validation identifier');
  return value;
}
export function validateDigest(value) {
  if (!/^sha256:[a-f0-9]{64}$/.test(validationText(value)))
    reject('INVALID_VALIDATION', 'invalid validation digest');
  return value;
}
export function validateOid(value) {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(validationText(value)))
    reject('INVALID_VALIDATION', 'invalid Git object');
  return value;
}
export function validateRelative(value) {
  validationText(value);
  if (
    value.includes('\\') ||
    path.isAbsolute(value) ||
    value.split('/').some((p) => ['', '.', '..'].includes(p))
  )
    reject('UNSAFE_PATH', 'unsafe projection path');
  return value;
}
export function validateReference(ref) {
  assertExact(ref, ['root', 'path', 'digest']);
  if (!path.isAbsolute(validationText(ref.root)) || path.normalize(ref.root) !== ref.root)
    reject('UNSAFE_PATH', 'invalid reference root');
  validateRelative(ref.path);
  validateDigest(ref.digest);
  return ref;
}
export function equalValidation(a, b) {
  return canonicalJSON(a) === canonicalJSON(b);
}
function equalRequired(actual, expected, label) {
  if (!equalValidation(actual, expected))
    reject('VALIDATION_POLICY_MISMATCH', label + ' differs from approved policy');
}
function protocol(value) {
  if (value.protocol !== PROTECTED_VALIDATION_PROTOCOL)
    reject('INVALID_VALIDATION', 'unsupported validation protocol');
}
export function validateSnapshot(value) {
  assertExact(value, ['head', 'index', 'workingTree', 'untracked']);
  validateOid(value.head);
  ['index', 'workingTree', 'untracked'].forEach((key) => validateDigest(value[key]));
  return value;
}
export function validatePolicy(value) {
  assertExact(value, [
    'protocol',
    'repository',
    'workflowPath',
    'executionClosure',
    'commands',
    'nativeCases',
    'environment',
  ]);
  protocol(value);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(validationText(value.repository)))
    reject('INVALID_VALIDATION', 'invalid repository');
  equalRequired(value.workflowPath, WORKFLOW_PATH, 'workflow path');
  equalRequired(value.commands, VALIDATION_COMMANDS, 'commands');
  equalRequired(value.nativeCases, REQUIRED_NATIVE_CASES, 'native cases');
  equalRequired(value.environment, VALIDATION_ENVIRONMENT, 'environment');
  assertExact(value.executionClosure, [
    'workflowDigest',
    'runnerDigest',
    'protocolDigest',
    'coreDigest',
    'operatorDigest',
    'projectionDigest',
    'backendDigest',
    'runnerHelperDigest',
    'watchdogDigest',
    'materializationAlgorithm',
    'actions',
  ]);
  for (const key of Object.keys(CLOSURE_PATHS)) validateDigest(value.executionClosure[key]);
  equalRequired(
    value.executionClosure.materializationAlgorithm,
    'git-tree-v1',
    'materialization algorithm',
  );
  assertExact(value.executionClosure.actions, ['checkout', 'pnpm', 'node']);
  Object.values(value.executionClosure.actions).forEach((v) => {
    if (!/^[a-f0-9]{40}$/.test(v))
      reject('INVALID_VALIDATION', 'actions must be pinned to commit SHAs');
  });
  return value;
}
export function validateBootstrap(value) {
  assertExact(value, [
    'protocol',
    'bootstrapId',
    'physicalMailboxRoot',
    'policyDigest',
    'initialInputDigest',
    'nativePolicyDigest',
    'guardEvidence',
    'admission',
    'policy',
  ]);
  protocol(value);
  validationId(value.bootstrapId);
  validatePolicy(value.policy);
  ['policyDigest', 'initialInputDigest', 'nativePolicyDigest'].forEach((k) =>
    validateDigest(value[k]),
  );
  if (value.policyDigest !== validationDigest(value.policy))
    reject('DIGEST_MISMATCH', 'bootstrap policy changed');
  if (!path.isAbsolute(validationText(value.physicalMailboxRoot)))
    reject('UNSAFE_PATH', 'mailbox root must be absolute');
  assertExact(value.admission, [
    'runtimeStateRoot',
    'repositoryIdentity',
    'runId',
    'requestDigest',
    'validatorHandle',
    'gate',
  ]);
  ['runtimeStateRoot', 'repositoryIdentity', 'validatorHandle'].forEach((k) =>
    validationText(value.admission[k]),
  );
  validationId(value.admission.runId);
  validateDigest(value.admission.requestDigest);
  if (!['validation', 'final-validation'].includes(value.admission.gate))
    reject('INVALID_VALIDATION', 'invalid remote gate');
  assertExact(value.guardEvidence, [
    'kind',
    'workerDenied',
    'descendantDenied',
    'privateReadDenied',
    'anchorDigest',
    'canaryRef',
  ]);
  equalRequired(value.guardEvidence.kind, 'native-macos-seatbelt', 'native guard');
  for (const k of ['workerDenied', 'descendantDenied', 'privateReadDenied'])
    if (value.guardEvidence[k] !== true)
      reject('UNPROTECTED_VALIDATION', 'native guard proof is incomplete');
  validateDigest(value.guardEvidence.anchorDigest);
  validateReference(value.guardEvidence.canaryRef);
  return value;
}
export function validateFileEntry(value) {
  assertExact(value, ['path', 'mode', 'digest']);
  validateRelative(value.path);
  if (!['100644', '100755'].includes(value.mode))
    reject('UNSAFE_PATH', 'unsupported exported mode');
  validateDigest(value.digest);
  return value;
}
function uniquePaths(values) {
  if (
    !Array.isArray(values) ||
    new Set(values.map((v) => (typeof v === 'string' ? v : v?.path))).size !== values.length
  )
    reject('INVALID_VALIDATION', 'duplicate or invalid manifest membership');
}
export function validateExportManifest(value) {
  assertExact(value, ['protocol', 'files', 'deletions', 'excluded', 'sourceSnapshot']);
  protocol(value);
  validateSnapshot(value.sourceSnapshot);
  uniquePaths(value.files);
  value.files.forEach(validateFileEntry);
  uniquePaths(value.deletions);
  value.deletions.forEach(validateRelative);
  uniquePaths(value.excluded);
  value.excluded.forEach((v) => {
    assertExact(v, ['path', 'reason']);
    validateRelative(v.path);
    validationText(v.reason);
  });
  const all = [
    ...value.files.map((v) => v.path),
    ...value.deletions,
    ...value.excluded.map((v) => v.path),
  ];
  if (new Set(all).size !== all.length)
    reject('INVALID_VALIDATION', 'overlapping projection classification');
  return value;
}
export function workflowPayloadPath(digest) {
  return TRANSPORT_ROOT + '/workflows/' + validateDigest(digest).slice(7) + '.yml';
}
export function validateMaterializationManifest(value) {
  assertExact(value, [
    'protocol',
    'executionFiles',
    'relocations',
    'transportOnly',
    'executionTree',
  ]);
  protocol(value);
  validateOid(value.executionTree);
  uniquePaths(value.executionFiles);
  value.executionFiles.forEach(validateFileEntry);
  uniquePaths(value.transportOnly);
  value.transportOnly.forEach(validateFileEntry);
  uniquePaths(value.relocations);
  for (const entry of value.relocations) {
    assertExact(entry, ['path', 'payloadPath', 'mode', 'digest']);
    validateFileEntry({ path: entry.path, mode: entry.mode, digest: entry.digest });
    if (
      !entry.path.startsWith('.github/workflows/') ||
      entry.path === WORKFLOW_PATH ||
      entry.payloadPath !== workflowPayloadPath(entry.digest)
    )
      reject('UNSAFE_PATH', 'invalid inert workflow relocation');
    if (
      !value.executionFiles.some((f) =>
        equalValidation(f, { path: entry.path, mode: entry.mode, digest: entry.digest }),
      )
    )
      reject('INVALID_VALIDATION', 'relocation is not an execution input');
  }
  const expectedPayloads = new Map(
    value.relocations.map((entry) => [
      entry.payloadPath,
      { path: entry.payloadPath, mode: entry.mode, digest: entry.digest },
    ]),
  );
  if (
    value.transportOnly.length !== expectedPayloads.size ||
    value.transportOnly.some((entry) => !equalValidation(entry, expectedPayloads.get(entry.path)))
  )
    reject('INVALID_VALIDATION', 'transport payload membership differs from relocation mapping');
  for (const entry of value.executionFiles) {
    if (entry.path.startsWith(TRANSPORT_ROOT + '/'))
      reject('UNSAFE_PATH', 'transport metadata cannot be an execution input');
    if (
      entry.path.startsWith('.github/workflows/') &&
      entry.path !== WORKFLOW_PATH &&
      !value.relocations.some((relocation) => relocation.path === entry.path)
    )
      reject('INVALID_VALIDATION', 'original workflow was not made inert');
  }
  return value;
}
export const validateTransportManifest = validateMaterializationManifest;
export function validatePreparation(value) {
  assertExact(value, [
    'protocol',
    'requestRef',
    'bootstrapRef',
    'localSnapshot',
    'exportManifestRef',
    'transportManifestRef',
    'materializationManifestRef',
    'executionTree',
    'executionClosureDigest',
    'repository',
    'snapshotBranch',
    'snapshotCommit',
    'snapshotTree',
  ]);
  protocol(value);
  [
    'requestRef',
    'bootstrapRef',
    'exportManifestRef',
    'transportManifestRef',
    'materializationManifestRef',
  ].forEach((k) => validateReference(value[k]));
  validateSnapshot(value.localSnapshot);
  ['executionTree', 'snapshotCommit', 'snapshotTree'].forEach((k) => validateOid(value[k]));
  validateDigest(value.executionClosureDigest);
  validationText(value.repository);
  if (!/^effective-flow\/validation\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value.snapshotBranch))
    reject('INVALID_VALIDATION', 'invalid snapshot branch');
  return value;
}
export function validateResult(value) {
  assertExact(value, [
    'protocol',
    'requestRef',
    'bootstrapRef',
    'preparationRef',
    'runId',
    'runAttempt',
    'repository',
    'event',
    'snapshotCommit',
    'snapshotTree',
    'executionTree',
    'materializationManifestRef',
    'workflowPath',
    'workflowDigest',
    'executionClosureDigest',
    'environment',
    'jobsRef',
    'rawLogsRef',
    'commands',
    'nativeCases',
    'timing',
    'resources',
    'outcome',
    'diagnostic',
  ]);
  protocol(value);
  [
    'requestRef',
    'bootstrapRef',
    'preparationRef',
    'materializationManifestRef',
    'jobsRef',
    'rawLogsRef',
  ].forEach((k) => validateReference(value[k]));
  for (const k of ['runId', 'runAttempt'])
    if (!Number.isSafeInteger(value[k]) || value[k] < 1 || (k === 'runAttempt' && value[k] !== 1))
      reject('INVALID_VALIDATION', 'invalid Actions attempt');
  ['snapshotCommit', 'snapshotTree', 'executionTree'].forEach((k) => validateOid(value[k]));
  ['workflowDigest', 'executionClosureDigest'].forEach((k) => validateDigest(value[k]));
  if (!['verified', 'failed'].includes(value.outcome))
    reject('INVALID_VALIDATION', 'invalid result outcome');
  validationText(value.diagnostic);
  equalRequired(value.event, 'push', 'event');
  equalRequired(value.workflowPath, WORKFLOW_PATH, 'workflow');
  equalRequired(value.environment, VALIDATION_ENVIRONMENT, 'environment');
  assertExact(value.timing, [
    'requestedAt',
    'submittedAt',
    'startedAt',
    'completedAt',
    'queueMs',
    'computeMs',
  ]);
  for (const k of ['requestedAt', 'submittedAt', 'startedAt', 'completedAt'])
    if (!Number.isFinite(Date.parse(value.timing[k])))
      reject('INVALID_VALIDATION', 'invalid backend time');
  for (const k of ['queueMs', 'computeMs'])
    if (!Number.isFinite(value.timing[k]) || value.timing[k] < 0)
      reject('INVALID_VALIDATION', 'invalid duration');
  assertExact(value.resources, ['attempts', 'runnerMinutes']);
  if (
    value.resources.attempts !== 1 ||
    !Number.isFinite(value.resources.runnerMinutes) ||
    value.resources.runnerMinutes < 0
  )
    reject('INVALID_VALIDATION', 'invalid resource accounting');
  validateExecutionObservations(value.commands, value.nativeCases, value.outcome === 'verified');
  return value;
}

export function validateExecutionObservations(commands, nativeCases, verified = false) {
  if (
    !Array.isArray(commands) ||
    commands.length > VALIDATION_COMMANDS.length ||
    (verified && commands.length !== VALIDATION_COMMANDS.length)
  )
    reject('INVALID_VALIDATION', 'incomplete command observations');
  commands.forEach((entry, index) => {
    assertExact(entry, ['command', 'exitCode']);
    equalRequired(entry.command, VALIDATION_COMMANDS[index], 'command order');
    if (
      !Number.isSafeInteger(entry.exitCode) ||
      (index < commands.length - 1 && entry.exitCode !== 0)
    )
      reject('INVALID_VALIDATION', 'invalid observed exit sequence');
  });
  if (
    !Array.isArray(nativeCases) ||
    nativeCases.length > REQUIRED_NATIVE_CASES.length ||
    (verified && nativeCases.length !== REQUIRED_NATIVE_CASES.length)
  )
    reject('INVALID_VALIDATION', 'incomplete native observations');
  let previous = -1;
  for (const entry of nativeCases) {
    assertExact(entry, ['name', 'outcome']);
    const index = REQUIRED_NATIVE_CASES.indexOf(entry.name);
    if (index < 0 || index <= previous || !['passed', 'failed', 'skipped'].includes(entry.outcome))
      reject('INVALID_VALIDATION', 'invalid native observation');
    previous = index;
  }
  if (
    verified &&
    (commands.some((entry) => entry.exitCode !== 0) ||
      nativeCases.some((entry) => entry.outcome !== 'passed'))
  )
    reject('INCOMPLETE_VALIDATION', 'failed/skipped observations cannot verify');
}
function validateFailedBackend(value, m) {
  if (!Array.isArray(value.jobs) || value.jobs.length !== 1)
    reject('INCOMPLETE_VALIDATION', 'failed attempt must retain its actual job');
  const job = value.jobs[0];
  assertExact(job, [
    'runId',
    'runAttempt',
    'id',
    'name',
    'status',
    'conclusion',
    'startedAt',
    'completedAt',
    'runnerName',
    'runnerGroupName',
    'labels',
    'steps',
  ]);
  if (
    job.runId !== m.runId ||
    job.runAttempt !== m.runAttempt ||
    job.name !== 'protected-validation' ||
    job.status !== 'completed' ||
    job.conclusion === 'success'
  )
    reject('FOREIGN_VALIDATION', 'failed job belongs to another attempt or contradicts run');
  for (const key of ['startedAt', 'completedAt'])
    if (!Number.isFinite(Date.parse(job[key])))
      reject('INVALID_VALIDATION', 'failed job timing missing');
  if (!Array.isArray(job.steps)) reject('INVALID_VALIDATION', 'failed job steps missing');
  for (const step of job.steps)
    assertExact(step, ['name', 'number', 'status', 'conclusion', 'startedAt', 'completedAt']);
  const logs = value.logs;
  assertExact(logs, [
    'runId',
    'runAttempt',
    'complete',
    'rawDigest',
    'environment',
    'executionTree',
    'executionClosureDigest',
    'commands',
    'nativeCases',
    'materialized',
    'codexBinaryDigest',
    'runnerImage',
  ]);
  if (
    logs.runId !== m.runId ||
    logs.runAttempt !== m.runAttempt ||
    logs.complete !== true ||
    typeof logs.materialized !== 'boolean'
  )
    reject('FOREIGN_VALIDATION', 'failed logs do not bind the complete actual attempt');
  validateDigest(logs.rawDigest);
  if (logs.environment !== null)
    equalRequired(logs.environment, VALIDATION_ENVIRONMENT, 'failed observed environment');
  if (logs.executionTree !== null) validateOid(logs.executionTree);
  if (logs.executionClosureDigest !== null) validateDigest(logs.executionClosureDigest);
  if (logs.codexBinaryDigest !== null) validateDigest(logs.codexBinaryDigest);
  if (logs.runnerImage !== null) validationText(logs.runnerImage);
  validateExecutionObservations(logs.commands, logs.nativeCases);
  return { state: 'failed', diagnostic: 'Actual Actions attempt concluded ' + m.conclusion };
}

// Backend projection is parsed from authoritative attempt-specific API responses by the operator.
export function validateBackendEvidence(value, request, preparation, policy) {
  assertExact(value, ['metadata', 'jobs', 'logs']);
  validatePreparation(preparation);
  validatePolicy(policy);
  const m = value.metadata;
  assertExact(m, [
    'repository',
    'runId',
    'runAttempt',
    'event',
    'headBranch',
    'headSha',
    'workflowPath',
    'status',
    'conclusion',
    'createdAt',
    'runStartedAt',
    'updatedAt',
  ]);
  equalRequired(m.repository, policy.repository, 'repository');
  equalRequired(m.event, 'push', 'event');
  equalRequired(m.headBranch, preparation.snapshotBranch, 'branch');
  equalRequired(m.headSha, preparation.snapshotCommit, 'commit');
  equalRequired(m.workflowPath, policy.workflowPath, 'workflow');
  if (
    !Number.isSafeInteger(m.runId) ||
    m.runId < 1 ||
    !Number.isSafeInteger(m.runAttempt) ||
    m.runAttempt !== 1
  )
    reject('INVALID_VALIDATION', 'invalid backend attempt');
  for (const key of ['createdAt', 'updatedAt'])
    if (!Number.isFinite(Date.parse(m[key])))
      reject('INVALID_VALIDATION', 'invalid backend timestamp');
  if (!['queued', 'in_progress', 'waiting', 'pending', 'requested', 'completed'].includes(m.status))
    reject('INVALID_VALIDATION', 'unknown backend status');
  if (m.status !== 'completed')
    return { state: 'pending', diagnostic: 'Actions attempt has not completed' };
  if (!Number.isFinite(Date.parse(m.runStartedAt)))
    reject('INVALID_VALIDATION', 'completed attempt start is missing');
  if (
    Date.parse(m.createdAt) > Date.parse(m.runStartedAt) ||
    Date.parse(m.runStartedAt) > Date.parse(m.updatedAt)
  )
    reject('INVALID_VALIDATION', 'contradictory backend timestamps');
  if (m.conclusion !== 'success') {
    if (
      ![
        'failure',
        'cancelled',
        'timed_out',
        'action_required',
        'neutral',
        'skipped',
        'stale',
        'startup_failure',
      ].includes(m.conclusion)
    )
      reject('INVALID_VALIDATION', 'unknown backend conclusion');
    return validateFailedBackend(value, m);
  }
  if (!Array.isArray(value.jobs) || value.jobs.length !== 1)
    reject('INCOMPLETE_VALIDATION', 'one complete validation job is required');
  const job = value.jobs[0];
  assertExact(job, [
    'runId',
    'runAttempt',
    'id',
    'name',
    'status',
    'conclusion',
    'startedAt',
    'completedAt',
    'runnerName',
    'runnerGroupName',
    'labels',
    'steps',
  ]);
  if (
    job.runId !== m.runId ||
    job.runAttempt !== m.runAttempt ||
    job.name !== 'protected-validation' ||
    job.status !== 'completed' ||
    job.conclusion !== 'success'
  )
    reject('INCOMPLETE_VALIDATION', 'job belongs to another attempt or did not succeed');
  if (
    !Number.isSafeInteger(job.id) ||
    job.id < 1 ||
    !Number.isFinite(Date.parse(job.startedAt)) ||
    !Number.isFinite(Date.parse(job.completedAt)) ||
    Date.parse(job.startedAt) > Date.parse(job.completedAt)
  )
    reject('INVALID_VALIDATION', 'invalid backend job identity/timing');
  validationText(job.runnerName);
  if (job.runnerGroupName !== null) validationText(job.runnerGroupName);
  if (!Array.isArray(job.labels) || !job.labels.includes(VALIDATION_ENVIRONMENT.runner))
    reject('VALIDATION_POLICY_MISMATCH', 'runner label is missing');
  if (
    !Array.isArray(job.steps) ||
    !job.steps.length ||
    job.steps.some((s) => {
      assertExact(s, ['name', 'number', 'status', 'conclusion', 'startedAt', 'completedAt']);
      return (
        s.status !== 'completed' ||
        s.conclusion !== 'success' ||
        !Number.isFinite(Date.parse(s.startedAt)) ||
        !Number.isFinite(Date.parse(s.completedAt))
      );
    })
  )
    reject('INCOMPLETE_VALIDATION', 'missing or unsuccessful backend step');
  for (const required of REQUIRED_BACKEND_STEPS)
    if (job.steps.filter((s) => s.name === required).length !== 1)
      reject('INCOMPLETE_VALIDATION', 'required backend step is missing or duplicated');
  if (
    new Set(job.steps.map((step) => step.number)).size !== job.steps.length ||
    job.steps.some(
      (step, i) =>
        !Number.isSafeInteger(step.number) ||
        step.number < 1 ||
        (i > 0 && step.number <= job.steps[i - 1].number) ||
        Date.parse(step.startedAt) > Date.parse(step.completedAt),
    )
  )
    reject('INVALID_VALIDATION', 'contradictory backend step identity/timing');
  const logs = value.logs;
  assertExact(logs, [
    'runId',
    'runAttempt',
    'complete',
    'rawDigest',
    'environment',
    'executionTree',
    'executionClosureDigest',
    'commands',
    'nativeCases',
    'materialized',
    'codexBinaryDigest',
    'runnerImage',
  ]);
  if (
    logs.runId !== m.runId ||
    logs.runAttempt !== m.runAttempt ||
    logs.complete !== true ||
    logs.materialized !== true
  )
    reject('INCOMPLETE_VALIDATION', 'missing complete attempt logs/materialization');
  validateDigest(logs.rawDigest);
  validateDigest(logs.codexBinaryDigest);
  validationText(logs.runnerImage);
  equalRequired(logs.environment, policy.environment, 'observed environment');
  equalRequired(logs.executionTree, preparation.executionTree, 'execution tree');
  equalRequired(
    logs.executionClosureDigest,
    preparation.executionClosureDigest,
    'execution closure',
  );
  equalRequired(
    logs.commands,
    VALIDATION_COMMANDS.map((command) => ({ command, exitCode: 0 })),
    'actual command results',
  );
  equalRequired(
    logs.nativeCases,
    REQUIRED_NATIVE_CASES.map((name) => ({ name, outcome: 'passed' })),
    'actual native results',
  );
  if (request.policyDigest !== validationDigest(policy))
    reject('DIGEST_MISMATCH', 'request policy differs');
  return { state: 'verified', diagnostic: 'Complete approved attempt verified' };
}

// This original-request descriptor requires a lane; it grants no admission or result authority.
export function validateRemoteRequirement(value) {
  assertExact(value, ['protocol', 'requiredGates', 'policyDigest']);
  protocol(value);
  validateDigest(value.policyDigest);
  if (
    !Array.isArray(value.requiredGates) ||
    value.requiredGates.length < 1 ||
    value.requiredGates.length > 2 ||
    new Set(value.requiredGates).size !== value.requiredGates.length ||
    value.requiredGates.some((gate) => !['validation', 'final-validation'].includes(gate))
  )
    reject('INVALID_VALIDATION', 'invalid required remote gates');
  return value;
}
