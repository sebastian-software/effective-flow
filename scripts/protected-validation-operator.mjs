// Trusted maintenance operator. Run outside the admitted worker and never from its helper.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  PROTECTED_VALIDATION_PROTOCOL,
  WORKFLOW_PATH,
  VALIDATION_COMMANDS,
  REQUIRED_NATIVE_CASES,
  canonicalJSON,
  validationDigest,
  assertExact,
  validateReference,
  validateBootstrap,
  validateExportManifest,
  validatePreparation,
  validateResult,
} from '../src/scripts/protected-validation-protocol.mjs';
import {
  protectedValidationRoot,
  protectedDirectory,
  safeValidationRead,
  parseValidationJSON,
  projectManifest,
} from '../src/scripts/protected-validation-core.mjs';
import {
  sourceBasis,
  createTransport,
  verifyExecutionFile,
} from './protected-validation-projection.mjs';
import { CLOSURE_PATHS, ghRead, observeBackend } from './protected-validation-backend.mjs';
const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (a, b) => canonicalJSON(a) === canonicalJSON(b);
const git = (root, ...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
async function readReference(ref) {
  validateReference(ref);
  const bytes = await safeValidationRead(resolve(ref.root, ref.path));
  ensure(validationDigest(bytes) === ref.digest, 'referenced bytes changed');
  return parseValidationJSON(bytes);
}
function publish(root, path, value) {
  const bytes =
    typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalJSON(value) + '\n';
  const target = resolve(root, path);
  ensure(target.startsWith(root + '/'), 'publication escaped protected root');
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
  return { root, path, digest: validationDigest(bytes) };
}
async function operatorContext(requestRef) {
  const request = await readReference(requestRef),
    bootstrapRef = request.bootstrapRef;
  const bootstrap = validateBootstrap(await readReference(bootstrapRef));
  const root = protectedValidationRoot(bootstrap.admission.runtimeStateRoot);
  await protectedDirectory(root);
  ensure(
    root === bootstrap.physicalMailboxRoot &&
      bootstrapRef.root === root &&
      bootstrapRef.path === `bootstraps/${bootstrap.bootstrapId}.json`,
    'operator requires fixed protected host bootstrap',
  );
  ensure(
    request.runId === bootstrap.admission.runId &&
      request.requestDigest === bootstrap.admission.requestDigest &&
      request.validatorHandle === bootstrap.admission.validatorHandle &&
      request.gate === bootstrap.admission.gate &&
      request.policyDigest === validationDigest(bootstrap.policy),
    'request admission differs',
  );
  assertExact(request.execution, ['executionRoot', 'branch', 'head', 'origin', 'owner']);
  ensure(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(request.validationId), 'invalid validation ID');
  ensure(
    same(request.commands, VALIDATION_COMMANDS) && same(request.nativeCases, REQUIRED_NATIVE_CASES),
    'request execution policy differs',
  );
  return { root, request, bootstrap, policy: bootstrap.policy, bootstrapRef, requestRef };
}
export async function prepareValidation({ requestRef, sourceRoot }) {
  const context = await operatorContext(requestRef),
    { root, request, bootstrap, policy } = context;
  sourceRoot = realpathSync(sourceRoot);
  ensure(
    realpathSync(resolve(sourceRoot, git(sourceRoot, 'rev-parse', '--git-common-dir'))) ===
      bootstrap.admission.repositoryIdentity,
    'operator source repository differs',
  );
  const before = sourceBasis(sourceRoot);
  ensure(
    sourceRoot === request.execution.executionRoot && before.branch === request.execution.branch,
    'operator execution root or branch differs from admitted execution',
  );
  ensure(same(before.snapshot, request.snapshot), 'source snapshot differs from admitted request');
  const manifest = validateExportManifest(await readReference(request.exportManifestRef));
  const projected = projectManifest(before.files, {
    trackedPaths: before.trackedPaths,
    snapshot: before.snapshot,
  });
  ensure(same(manifest, projected), 'export classification differs from exact source snapshot');
  for (const [key, path] of Object.entries(CLOSURE_PATHS)) {
    const entry = manifest.files.find((e) => e.path === path);
    ensure(
      entry?.digest === policy.executionClosure[key] && entry.mode === '100644',
      'unapproved execution closure: ' + path,
    );
    verifyExecutionFile(sourceRoot, entry);
  }
  const yaml = readFileSync(resolve(sourceRoot, WORKFLOW_PATH), 'utf8');
  const actionPins = [...yaml.matchAll(/uses: ([^@\s]+)@([a-f0-9]{40}) # ([^\n]+)/g)];
  ensure(
    actionPins.length === 3 &&
      yaml.match(/uses:/g)?.length === 3 &&
      actionPins.every(
        ([_, name, sha]) =>
          ({
            'actions/checkout': policy.executionClosure.actions.checkout,
            'pnpm/action-setup': policy.executionClosure.actions.pnpm,
            'actions/setup-node': policy.executionClosure.actions.node,
          })[name] === sha,
      ),
    'workflow action closure differs',
  );
  const folder = `private/preparations/${request.validationId}`;
  ensure(!existsSync(resolve(root, folder)), 'preparation exists; never overwrite or retry');
  mkdirSync(resolve(root, folder), { recursive: true, mode: 0o700 });
  const transportRoot = resolve(root, folder, 'transport');
  const mapping = createTransport({ source: sourceRoot, destination: transportRoot, manifest });
  const transportManifestRef = publish(
    root,
    `manifests/${request.validationId}-transport.json`,
    mapping.transport,
  );
  const materializationManifestRef = publish(
    root,
    `manifests/${request.validationId}-materialization.json`,
    mapping.materialization,
  );
  ensure(same(before, sourceBasis(sourceRoot)), 'source changed during preparation');
  const preparation = validatePreparation({
    protocol: PROTECTED_VALIDATION_PROTOCOL,
    requestRef,
    bootstrapRef: context.bootstrapRef,
    localSnapshot: before.snapshot,
    exportManifestRef: request.exportManifestRef,
    transportManifestRef,
    materializationManifestRef,
    executionTree: mapping.executionTree,
    executionClosureDigest: validationDigest(policy.executionClosure),
    repository: policy.repository,
    snapshotBranch: `effective-flow/validation/${request.validationId}`,
    snapshotCommit: mapping.snapshotCommit,
    snapshotTree: mapping.snapshotTree,
  });
  publish(root, folder + '/context.json', { sourceRoot, basis: before, transportRoot });
  const preparationRef = publish(root, `preparations/${request.validationId}.json`, preparation);
  return { state: 'prepared', preparationRef, preparation };
}
async function preparedContext(preparationRef) {
  const preparation = validatePreparation(await readReference(preparationRef));
  const context = await operatorContext(preparation.requestRef);
  ensure(
    preparationRef.root === context.root &&
      preparationRef.path === `preparations/${context.request.validationId}.json` &&
      same(preparation.bootstrapRef, context.bootstrapRef),
    'foreign operator preparation',
  );
  const local = parseValidationJSON(
    await safeValidationRead(
      resolve(context.root, `private/preparations/${context.request.validationId}/context.json`),
    ),
  );
  ensure(same(local.basis, sourceBasis(local.sourceRoot)), 'source drift invalidated preparation');
  ensure(
    git(local.transportRoot, 'rev-parse', preparation.snapshotCommit + '^{tree}') ===
      preparation.snapshotTree && git(local.transportRoot, 'status', '--porcelain') === '',
    'transport commit/worktree changed',
  );
  return { ...context, preparation, preparationRef, local };
}
export async function submitValidation({ preparationRef }) {
  const context = await preparedContext(preparationRef),
    { root, request, preparation, local } = context;
  // The exclusive intent precedes every network side effect. Unknown completion is never retried.
  const submission = {
    preparationRef,
    repository: preparation.repository,
    snapshotBranch: preparation.snapshotBranch,
    snapshotCommit: preparation.snapshotCommit,
    submittedAt: new Date().toISOString(),
  };
  const intentRef = publish(
    root,
    `private/submissions/${request.validationId}-intent.json`,
    submission,
  );
  const target = `https://github.com/${preparation.repository}.git`;
  const args = [
    '-c',
    'credential.helper=',
    '-c',
    'credential.helper=!gh auth git-credential',
    'push',
    '--porcelain',
    `--force-with-lease=refs/heads/${preparation.snapshotBranch}:`,
    target,
    `${preparation.snapshotCommit}:refs/heads/${preparation.snapshotBranch}`,
  ];
  publish(root, `private/submissions/${request.validationId}-create-only-command.json`, {
    semantic: 'create-only-empty-expected-ref',
    executable: 'git',
    args,
  });
  const output = spawnSync('git', args, {
    cwd: local.transportRoot,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const receiptRef = publish(root, `private/submissions/${request.validationId}-outcome.json`, {
    intentRef,
    exitCode: output.status,
    error: output.error?.code ?? null,
    stdout: output.stdout ?? '',
    stderr: output.stderr ?? '',
    finishedAt: new Date().toISOString(),
  });
  ensure(
    !output.error && output.status === 0 && /^\*\t.*\[new branch\]$/m.test(output.stdout),
    'submission failed or completion is unknown; preserve intent and do not retry',
  );
  ensure(same(local.basis, sourceBasis(local.sourceRoot)), 'source changed during submission');
  const submissionRef = publish(root, `submissions/${request.validationId}.json`, submission);
  return { state: 'submitted', submissionRef, receiptRef };
}
export async function observeValidation(
  { preparationRef, runId, runAttempt },
  { read = ghRead } = {},
) {
  const context = await preparedContext(preparationRef),
    { root, request, preparation, policy } = context;
  const submission = parseValidationJSON(
    await safeValidationRead(resolve(root, `submissions/${request.validationId}.json`)),
  );
  ensure(same(submission.preparationRef, preparationRef), 'submission association differs');
  const observationId = randomBytes(12).toString('hex');
  const prefix = `private/observations/${request.validationId}-${runId}-${runAttempt}-${observationId}`;
  let responseIndex = 0;
  const archivalRead = (endpoint) => {
    const bytes = read(endpoint);
    publish(root, prefix + '-response-' + ++responseIndex + '.bin', bytes);
    publish(root, prefix + '-response-' + responseIndex + '-identity.json', {
      endpoint,
      digest: validationDigest(bytes),
    });
    return bytes;
  };
  const observed = observeBackend({
    read: archivalRead,
    request,
    preparation,
    policy,
    runId,
    runAttempt,
  });
  publish(root, prefix + '-metadata.json', observed.rawMetadata);
  publish(root, prefix + '-jobs.json', observed.rawJobs);
  if (observed.state === 'pending')
    return { state: observed.state, diagnostic: observed.diagnostic ?? 'Actions attempt pending' };
  const evidenceRef = publish(
    root,
    `evidence/${request.validationId}-${runId}-${runAttempt}.json`,
    observed.evidence,
  );
  const rawLogsRef = publish(
    root,
    `evidence/${request.validationId}-${runId}-${runAttempt}.zip`,
    observed.rawLogs,
  );
  const m = observed.evidence.metadata;
  const timing = {
    requestedAt: request.requestedAt,
    submittedAt: submission.submittedAt,
    startedAt: observed.evidence.jobs[0].startedAt,
    completedAt: observed.evidence.jobs[0].completedAt,
    queueMs: Math.max(0, Date.parse(observed.evidence.jobs[0].startedAt) - Date.parse(m.createdAt)),
    computeMs:
      Date.parse(observed.evidence.jobs[0].completedAt) -
      Date.parse(observed.evidence.jobs[0].startedAt),
  };
  const result = validateResult({
    protocol: PROTECTED_VALIDATION_PROTOCOL,
    requestRef: context.requestRef,
    bootstrapRef: context.bootstrapRef,
    preparationRef,
    runId,
    runAttempt,
    repository: policy.repository,
    event: 'push',
    snapshotCommit: preparation.snapshotCommit,
    snapshotTree: preparation.snapshotTree,
    executionTree: preparation.executionTree,
    materializationManifestRef: preparation.materializationManifestRef,
    workflowPath: policy.workflowPath,
    workflowDigest: policy.executionClosure.workflowDigest,
    executionClosureDigest: preparation.executionClosureDigest,
    environment: policy.environment,
    jobsRef: evidenceRef,
    rawLogsRef,
    commands: observed.evidence.logs.commands,
    nativeCases: observed.evidence.logs.nativeCases,
    timing,
    resources: { attempts: 1, runnerMinutes: timing.computeMs / 60000 },
    outcome: observed.state === 'verified' ? 'verified' : 'failed',
    diagnostic: observed.diagnostic,
  });
  ensure(
    same(context.local.basis, sourceBasis(context.local.sourceRoot)),
    'source drift before result publication',
  );
  const resultRef = publish(root, `results/${request.validationId}.json`, result);
  return { state: result.outcome, resultRef };
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  try {
    ensure(process.argv.length === 3, 'one prepare, submit or observe operation required');
    const bytes = readFileSync(0);
    ensure(bytes.length <= 64 * 1024, 'operator input too large');
    const input = parseValidationJSON(bytes);
    let output;
    if (process.argv[2] === 'prepare') {
      assertExact(input, ['requestRef', 'sourceRoot']);
      output = await prepareValidation(input);
    } else if (process.argv[2] === 'submit') {
      assertExact(input, ['preparationRef']);
      output = await submitValidation(input);
    } else if (process.argv[2] === 'observe') {
      assertExact(input, ['preparationRef', 'runId', 'runAttempt']);
      output = await observeValidation(input);
    } else throw new Error('unknown operator operation');
    process.stdout.write(JSON.stringify(output) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ state: 'refused', diagnostic: error.message }) + '\n');
    process.exitCode = 1;
  }
}
