// Worker-side protected mailbox reads and explicit source projection. No network or credentials.
import { constants } from 'node:fs';
import { chmod, lstat, open, realpath, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import {
  PROTECTED_VALIDATION_PROTOCOL,
  CLOSURE_PATHS,
  MAX_VALIDATION_LOG_BYTES,
  canonicalJSON,
  validationDigest,
  reject,
  assertExact,
  validateBootstrap,
  validateReference,
  validateExportManifest,
  validateMaterializationManifest,
  validatePreparation,
  validateResult,
  validateBackendEvidence,
  validateRelative,
  equalValidation,
  validateDigest,
} from './protected-validation-protocol.mjs';
const READ = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
export function protectedValidationRoot(runtimeStateRoot) {
  return path.join(runtimeStateRoot, '.effective-flow', 'protected-validation');
}
export async function protectedDirectory(target) {
  if (!path.isAbsolute(target) || path.normalize(target) !== target)
    reject('UNSAFE_PATH', 'expected canonical physical directory');
  let current = path.parse(target).root;
  for (const part of target.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink())
      reject('UNSAFE_PATH', 'protected directory has an unsafe component');
  }
  if ((await realpath(target)) !== target)
    reject('UNSAFE_PATH', 'protected directory identity differs');
  return target;
}
export async function safeValidationRead(file, maximum = 16 * 1024 * 1024) {
  await protectedDirectory(path.dirname(file));
  const named = await lstat(file);
  if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1 || named.size > maximum)
    reject('UNSAFE_PATH', 'unsafe or oversized protected evidence');
  const handle = await open(file, READ);
  try {
    const before = await handle.stat();
    if (before.dev !== named.dev || before.ino !== named.ino || before.nlink !== 1)
      reject('CONTENT_DRIFT', 'protected file changed');
    const bytes = await handle.readFile();
    const after = await handle.stat(),
      final = await lstat(file);
    if (
      bytes.length > maximum ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      final.dev !== before.dev ||
      final.ino !== before.ino
    )
      reject('CONTENT_DRIFT', 'protected evidence changed during read');
    return bytes;
  } finally {
    await handle.close();
  }
}
export function parseValidationJSON(bytes) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(text);
  } catch (cause) {
    reject('INVALID_VALIDATION', 'malformed protected UTF-8 JSON');
  }
}
export async function readProtectedReference(ref, root, maximum) {
  validateReference(ref);
  if (ref.root !== root)
    reject('FOREIGN_VALIDATION', 'evidence is outside the fixed protected mailbox');
  const bytes = await safeValidationRead(path.join(root, ref.path), maximum);
  if (validationDigest(bytes) !== ref.digest)
    reject('DIGEST_MISMATCH', 'protected evidence bytes changed');
  return bytes;
}
async function denied(operation) {
  try {
    await operation();
    return false;
  } catch (error) {
    if (['EPERM', 'EACCES', 'EROFS'].includes(error.code)) return true;
    throw error;
  }
}
// This is a runtime check of actual denial, never a caller-provided trust flag. The host owns
// this disposable canary; probing it cannot replace or corrupt a bootstrap/result record.
export async function verifyProtectedBootstrap(input) {
  const root = protectedValidationRoot(input.runtimeStateRoot);
  await protectedDirectory(root);
  if (process.platform !== 'darwin')
    reject(
      'UNSUPPORTED_VALIDATION',
      'protected validation requires the admitted macOS native host',
    );
  validateReference(input.bootstrapRef);
  if (
    input.bootstrapRef.root !== root ||
    !/^bootstraps\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}\.json$/.test(input.bootstrapRef.path)
  )
    reject('UNPROTECTED_VALIDATION', 'bootstrap is not in the fixed host prefix');
  const bootstrap = validateBootstrap(
    parseValidationJSON(await readProtectedReference(input.bootstrapRef, root, 16 * 1024)),
  );
  if (
    input.bootstrapRef.path !== `bootstraps/${bootstrap.bootstrapId}.json` ||
    bootstrap.physicalMailboxRoot !== root
  )
    reject('UNPROTECTED_VALIDATION', 'bootstrap physical identity differs');
  const admission = Object.fromEntries(
    [
      'runtimeStateRoot',
      'repositoryIdentity',
      'runId',
      'requestDigest',
      'validatorHandle',
      'gate',
    ].map((key) => [key, input[key]]),
  );
  if (!equalValidation(bootstrap.admission, admission))
    reject('FOREIGN_VALIDATION', 'host admission does not bind this exact validator/gate/run');
  const ref = bootstrap.guardEvidence.canaryRef;
  if (ref.root !== root || ref.path !== `canaries/${bootstrap.bootstrapId}.txt`)
    reject('UNPROTECTED_VALIDATION', 'host guard canary path differs');
  await readProtectedReference(ref, root, 1024);
  const file = path.join(root, ref.path),
    stat = await lstat(file);
  if (typeof process.getuid !== 'function' || stat.uid !== process.getuid())
    reject('UNPROTECTED_VALIDATION', 'foreign-owner mode bits cannot prove native denial');
  if (!(await denied(() => chmod(file, stat.mode & 0o7777))))
    reject('UNPROTECTED_VALIDATION', 'native guard does not deny canary metadata mutation');
  const probe = path.join(root, `.worker-probe-${randomBytes(16).toString('hex')}`);
  let handle;
  try {
    handle = await open(probe, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'EROFS'].includes(error.code)) throw error;
  }
  if (handle) {
    await handle.close();
    await unlink(probe);
    reject('UNPROTECTED_VALIDATION', 'mailbox permits worker record creation');
  }
  // Re-read after the probes so swaps cannot turn checked bytes into a different admission.
  if (
    !equalValidation(
      bootstrap,
      parseValidationJSON(await readProtectedReference(input.bootstrapRef, root, 16 * 1024)),
    )
  )
    reject('CONTENT_DRIFT', 'bootstrap changed during admission');
  return bootstrap;
}
const ROOT_FILES = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'local-common.sh',
  'mdtheme.yaml',
  'mise.lock',
  '.prettierignore',
  'README.md',
  'README.md.src',
  'CHANGELOG.md',
  'LICENSE',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'build.mjs',
  'build-lib.mjs',
  'mise.toml',
  '.mise.toml',
  '.gitignore',
  '.gitattributes',
  '.npmrc',
  '.oxfmtrc.json',
  '.oxfmtrc.jsonc',
  '.oxlintrc.json',
  '.release-please-manifest.json',
  'release-please-config.json',
  'install-skill.sh',
  'local-link.sh',
]);
const SOURCE_DIRS = new Set(['src', 'test', 'scripts', 'evals', 'docs', '.github', 'site']);
function classify(name, tracked) {
  validateRelative(name);
  const parts = name.split('/');
  if (
    parts.some((part) =>
      [
        '.git',
        '.effective-flow',
        'node_modules',
        'dist',
        '.codex',
        '.agents',
        '.aws',
        '.ssh',
      ].includes(part),
    ) ||
    /(?:^|\/)(?:\.env(?:\..*)?|auth\.json|credentials[^/]*)$/i.test(name) ||
    (!tracked && /(?:^|\/)[^/]*(?:transcript|journal)[^/]*\.(?:jsonl?|log|txt)$/i.test(name))
  )
    return 'private-or-generated';
  if (
    !tracked &&
    name.startsWith('evals/') &&
    /(?:^|\/)(?:results|rounds|recordings|archive)(?:\/|$)/.test(name)
  )
    return 'retained-evidence';
  if (!tracked && name.startsWith('docs/plan/')) return 'unrelated-untracked-plan';
  if ((tracked && parts[0] === '.claude') || ROOT_FILES.has(name) || SOURCE_DIRS.has(parts[0]))
    return null;
  if (
    tracked &&
    parts.length === 1 &&
    /^(?:\.github|\.renovate|renovate|\.prettier|\.editor|\.node|\.tool|\.release)/.test(name)
  )
    return null;
  reject('AMBIGUOUS_PROJECTION', `source path has no approved export classification: ${name}`);
}
export function projectManifest(manifest, { trackedPaths = [], snapshot } = {}) {
  if (!Array.isArray(manifest)) reject('INVALID_VALIDATION', 'source manifest must be an array');
  const tracked = new Set(trackedPaths),
    files = [],
    deletions = [],
    excluded = [],
    seen = new Set();
  for (const entry of manifest) {
    if (!Array.isArray(entry) || ![2, 3].includes(entry.length))
      reject('INVALID_VALIDATION', 'invalid source manifest entry');
    const [name, mode, digest] = entry;
    if (seen.has(name)) reject('INVALID_VALIDATION', 'duplicate source path');
    seen.add(name);
    const reason = classify(name, tracked.has(name));
    if (reason) {
      excluded.push({ path: name, reason });
      continue;
    }
    if (mode === 'missing') {
      deletions.push(name);
      continue;
    }
    if (!['100644', '100755'].includes(mode))
      reject('UNSAFE_PATH', 'symlinks and special source modes are not exportable');
    validateDigest(digest);
    files.push({ path: name, mode, digest });
  }
  const sorted = (a, b) => a.path.localeCompare(b.path, 'en');
  return validateExportManifest({
    protocol: PROTECTED_VALIDATION_PROTOCOL,
    files: files.sort(sorted),
    deletions: deletions.sort(),
    excluded: excluded.sort(sorted),
    sourceSnapshot: snapshot,
  });
}
export async function projectSource({ executionRoot, manifest, trackedPaths, snapshot }) {
  const projected = projectManifest(manifest, { trackedPaths, snapshot });
  for (const file of projected.files) {
    const bytes = await safeValidationRead(path.join(executionRoot, file.path));
    if (validationDigest(bytes) !== file.digest)
      reject('CONTENT_DRIFT', 'source changed during projection');
    const stat = await lstat(path.join(executionRoot, file.path));
    if ((stat.mode & 0o111 ? '100755' : '100644') !== file.mode)
      reject('CONTENT_DRIFT', 'source mode changed during projection');
  }
  return projected;
}
export async function verifyProtectedResult({ request, requestRef, bootstrap, bootstrapRef }) {
  const root = bootstrap.physicalMailboxRoot,
    resultPath = `results/${request.validationId}.json`;
  let bytes;
  try {
    bytes = await safeValidationRead(path.join(root, resultPath), 16 * 1024);
  } catch (error) {
    if (error.code === 'ENOENT')
      return {
        state: 'pending',
        requestRef,
        resultRef: null,
        evidenceRefs: [],
        diagnostic: 'Trusted operator result is not yet present',
      };
    throw error;
  }
  const result = validateResult(parseValidationJSON(bytes)),
    resultRef = { root, path: resultPath, digest: validationDigest(bytes) };
  if (
    !equalValidation(result.requestRef, requestRef) ||
    !equalValidation(result.bootstrapRef, bootstrapRef)
  )
    reject('FOREIGN_VALIDATION', 'result belongs to another request/bootstrap');
  const preparation = validatePreparation(
    parseValidationJSON(await readProtectedReference(result.preparationRef, root)),
  );
  for (const key of ['requestRef', 'bootstrapRef', 'exportManifestRef'])
    if (
      !equalValidation(
        preparation[key],
        key === 'requestRef'
          ? requestRef
          : key === 'bootstrapRef'
            ? bootstrapRef
            : request.exportManifestRef,
      )
    )
      reject('FOREIGN_VALIDATION', 'preparation association differs');
  if (
    !equalValidation(preparation.localSnapshot, request.snapshot) ||
    preparation.snapshotBranch !== `effective-flow/validation/${request.validationId}` ||
    preparation.repository !== bootstrap.policy.repository
  )
    reject('FOREIGN_VALIDATION', 'preparation source identity differs');
  const materialization = validateMaterializationManifest(
    parseValidationJSON(await readProtectedReference(preparation.materializationManifestRef, root)),
  );
  const transport = validateMaterializationManifest(
    parseValidationJSON(await readProtectedReference(preparation.transportManifestRef, root)),
  );
  if (!equalValidation(materialization, transport))
    reject('DIGEST_MISMATCH', 'transport/materialization mapping differs');
  validateReference(request.exportManifestRef);
  if (
    request.exportManifestRef.root !== requestRef.root ||
    path.dirname(request.exportManifestRef.path) !== path.dirname(requestRef.path) ||
    path.basename(request.exportManifestRef.path) !==
      `validation-export-${request.validationId}.txt`
  )
    reject('FOREIGN_VALIDATION', 'export manifest is outside the original request run');
  const exportBytes = await safeValidationRead(
    path.join(request.exportManifestRef.root, request.exportManifestRef.path),
  );
  if (validationDigest(exportBytes) !== request.exportManifestRef.digest)
    reject('DIGEST_MISMATCH', 'source export manifest bytes differ');
  const exported = validateExportManifest(parseValidationJSON(exportBytes));
  if (
    !equalValidation(exported.sourceSnapshot, request.snapshot) ||
    !equalValidation(exported.files, materialization.executionFiles)
  )
    reject('DIGEST_MISMATCH', 'execution files differ from exact approved source projection');
  for (const [key, file] of Object.entries(CLOSURE_PATHS))
    if (
      !exported.files.some(
        (entry) =>
          entry.path === file &&
          entry.mode === '100644' &&
          entry.digest === bootstrap.policy.executionClosure[key],
      )
    )
      reject('DIGEST_MISMATCH', 'exported executable closure differs from host-approved policy');
  if (materialization.executionTree !== preparation.executionTree)
    reject('DIGEST_MISMATCH', 'execution materialization differs');
  if (
    !equalValidation(result.materializationManifestRef, preparation.materializationManifestRef) ||
    result.repository !== preparation.repository ||
    result.snapshotCommit !== preparation.snapshotCommit ||
    result.snapshotTree !== preparation.snapshotTree ||
    result.executionTree !== preparation.executionTree ||
    result.executionClosureDigest !== preparation.executionClosureDigest ||
    result.workflowDigest !== bootstrap.policy.executionClosure.workflowDigest ||
    result.executionClosureDigest !== validationDigest(bootstrap.policy.executionClosure)
  )
    reject('DIGEST_MISMATCH', 'result immutable execution closure differs');
  const backend = parseValidationJSON(await readProtectedReference(result.jobsRef, root));
  const raw = await readProtectedReference(result.rawLogsRef, root, MAX_VALIDATION_LOG_BYTES);
  if (
    backend.logs?.rawDigest !== validationDigest(raw) ||
    backend.metadata?.runId !== result.runId ||
    backend.metadata?.runAttempt !== result.runAttempt
  )
    reject('FOREIGN_VALIDATION', 'backend logs/attempt differ');
  if (
    result.timing.requestedAt !== request.requestedAt ||
    result.timing.startedAt !== backend.jobs?.[0]?.startedAt ||
    result.timing.completedAt !== backend.jobs?.[0]?.completedAt ||
    result.timing.computeMs !==
      Date.parse(result.timing.completedAt) - Date.parse(result.timing.startedAt) ||
    result.timing.queueMs !==
      Math.max(0, Date.parse(result.timing.startedAt) - Date.parse(backend.metadata.createdAt))
  )
    reject('INVALID_VALIDATION', 'result resource timing does not match actual backend job');
  const verified = validateBackendEvidence(backend, request, preparation, bootstrap.policy);
  if (
    verified.state === 'failed' &&
    (result.outcome !== 'failed' ||
      !equalValidation(result.commands, backend.logs.commands) ||
      !equalValidation(result.nativeCases, backend.logs.nativeCases))
  )
    reject('INCOMPLETE_VALIDATION', 'failed result contradicts actual backend evidence');
  if (
    verified.state === 'verified' &&
    (result.outcome !== 'verified' ||
      !equalValidation(result.commands, backend.logs.commands) ||
      !equalValidation(result.nativeCases, backend.logs.nativeCases))
  )
    reject('INCOMPLETE_VALIDATION', 'result contradicts actual backend evidence');
  return {
    state: verified.state,
    requestRef,
    resultRef,
    evidenceRefs: [
      result.preparationRef,
      result.jobsRef,
      result.rawLogsRef,
      result.materializationManifestRef,
    ],
    diagnostic: verified.diagnostic,
  };
}
