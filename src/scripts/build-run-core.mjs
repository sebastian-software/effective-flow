// Build-owned artifact transport. The caller remains the authority for gate judgments and user
// channel provenance; byte digests establish identity, never consent or substantive correctness.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, readlink, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { resolveConfiguration } from './config-resolve-core.mjs';

export const BUILD_RUN_VERSION = 1;
export const MAX_DISPATCH_BYTES = 8 * 1024;
export const MAX_CONTROL_BYTES = 16 * 1024;
export const MAX_RETAINED_EVIDENCE_BYTES = 1024 * 1024;
export const BUILD_RUN_OPERATIONS = Object.freeze([
  'create',
  'validate',
  'bind-agent',
  'authorize-execution',
  'transition-execution',
  'prepare-completion',
  'seal-delivery',
  'handoff',
  'record-return',
  'retain-evidence',
  'checkpoint',
  'question',
  'reply',
  'resume',
  'receipt',
  'terminal',
  'verify-terminal',
  'continuation',
  'verify-continuation',
]);
export const REQUIRED_GATES = Object.freeze([
  'implementation',
  'documentation',
  'tests',
  'validation',
  'independent-review',
  'final-validation',
  'delivery',
  'plan-archival',
  'pilot-finalization',
  'cleanup',
  'completion',
]);
export const QUESTION_ORIGINS = Object.freeze([
  'delivery-choice',
  'residual-findings',
  'completion-recovery',
  'design-scope',
  'pr-review-publication',
]);
const COMMON = ['runtimeStateRoot', 'repositoryIdentity', 'runId', 'requestDigest'];
const LANGUAGES = [
  'source',
  'documentation.user',
  'documentation.technical',
  'workflow',
  'forge',
  'git',
];
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const OID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const READ = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
const WRITE =
  constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);

export class BuildRunError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'BuildRunError';
    this.code = code;
  }
}
function fail(code, message) {
  throw new BuildRunError(code, message);
}
function exact(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('INVALID_PAYLOAD', 'expected object');
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => ![...required, ...optional].includes(key))
  ) {
    fail('INVALID_PAYLOAD', 'missing or unknown control field');
  }
}
function text(value, label = 'value') {
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    !value.isWellFormed() ||
    value.includes('\0')
  )
    fail('INVALID_PAYLOAD', `${label} must be nonempty well-formed text`);
  return value;
}
function one(value, values) {
  if (!values.includes(value)) fail('INVALID_PAYLOAD', 'unsupported control value');
  return value;
}
function identifier(value) {
  if (typeof value !== 'string' || !ID.test(value)) fail('INVALID_PAYLOAD', 'invalid identifier');
  return value;
}
function digest(value) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail('INVALID_PAYLOAD', 'invalid digest');
  return value;
}
function oid(value) {
  if (typeof value !== 'string' || !OID.test(value))
    fail('INVALID_PAYLOAD', 'invalid Git object identity');
  return value;
}
function strings(value) {
  if (!Array.isArray(value)) fail('INVALID_PAYLOAD', 'expected string array');
  value.forEach((item) => text(item));
  return value;
}
function absolute(value) {
  text(value);
  if (!path.isAbsolute(value) || path.normalize(value) !== value)
    fail('UNSAFE_PATH', 'expected canonical absolute path');
  return value;
}
function relative(value) {
  text(value);
  if (
    path.isAbsolute(value) ||
    value.split(/[\\/]/).some((part) => ['', '.', '..'].includes(part)) ||
    value.includes('\\')
  )
    fail('UNSAFE_PATH', 'unsafe relative path');
  return value;
}
export function contentDigest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
export function encodeControl(value, maximum = MAX_CONTROL_BYTES) {
  const json = JSON.stringify(value);
  if (typeof json !== 'string' || !json.isWellFormed())
    fail('INVALID_PAYLOAD', 'invalid JSON record');
  const bytes = Buffer.from(`${json}\n`);
  if (bytes.length > maximum) fail('TOO_LARGE', `record exceeds ${maximum} UTF-8 bytes`);
  return bytes;
}
function inside(root, target) {
  return target === root || target.startsWith(`${root}${path.sep}`);
}
async function safeDirectory(target) {
  absolute(target);
  let current = path.parse(target).root;
  for (const part of target.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink())
      fail('UNSAFE_PATH', 'directory contains a symlink or non-directory');
  }
  if ((await realpath(target)) !== target)
    fail('UNSAFE_PATH', 'directory is not physically canonical');
  return target;
}
async function safeRead(target, maximum = Infinity) {
  await safeDirectory(path.dirname(target));
  const before = await lstat(target);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1)
    fail('UNSAFE_PATH', 'artifact must be a singly linked regular file');
  const handle = await open(target, READ);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.dev !== before.dev || info.ino !== before.ino || info.nlink !== 1)
      fail('UNSAFE_PATH', 'artifact identity changed');
    if (info.size > maximum) fail('TOO_LARGE', 'artifact exceeds byte limit');
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const named = await lstat(target);
    if (bytes.length > maximum) fail('TOO_LARGE', 'artifact exceeds byte limit');
    if (
      info.size !== after.size ||
      info.mtimeMs !== after.mtimeMs ||
      info.ctimeMs !== after.ctimeMs ||
      named.ino !== info.ino ||
      named.dev !== info.dev
    )
      fail('CONTENT_DRIFT', 'artifact changed while reading');
    return bytes;
  } finally {
    await handle.close();
  }
}
async function jsonRead(target, maximum = MAX_CONTROL_BYTES) {
  const bytes = await safeRead(target, maximum);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('INVALID_STATE', 'malformed retained JSON');
  }
}
async function exclusive(target, bytes) {
  await safeDirectory(path.dirname(target));
  let handle;
  try {
    handle = await open(target, WRITE, 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (cause) {
    if (cause.code === 'EEXIST') fail('COLLISION', 'immutable record already exists');
    throw cause;
  } finally {
    if (handle) await handle.close();
  }
}
async function ensureDirectory(target) {
  await safeDirectory(path.dirname(target));
  try {
    await mkdir(target, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  await safeDirectory(target);
}
async function git(deps, cwd, args, allowed = [0], binary = false) {
  if (typeof deps.runner !== 'function') fail('INVALID_PAYLOAD', 'process runner is required');
  const result = await deps.runner({
    executable: 'git',
    args: ['-C', cwd, ...args],
    cwd,
    stdoutBuffer: binary,
  });
  if (result.error || !allowed.includes(result.status))
    fail('REPOSITORY_MISMATCH', 'Git identity or evidence check failed');
  return binary ? Buffer.from(result.stdout) : String(result.stdout).trim();
}
async function runtimeGuard(input, deps, mutation, target) {
  const root = await safeDirectory(absolute(input.runtimeStateRoot));
  const identity = await safeDirectory(absolute(input.repositoryIdentity));
  if (
    (await realpath(await git(deps, root, ['rev-parse', '--show-toplevel']))) !== root ||
    (await realpath(
      await git(deps, root, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
    )) !== identity
  )
    fail('REPOSITORY_MISMATCH', 'runtime root does not match repository');
  const records = await worktrees(deps, root);
  if (
    !records[0] ||
    (await realpath(records[0].root)) !== root ||
    records[0].bare ||
    (await git(deps, root, ['rev-parse', '--is-bare-repository'])) !== 'false'
  )
    fail('UNSAFE_RUNTIME_ROOT', 'runtime state must belong to the usable main worktree');
  if ((await git(deps, root, ['ls-files', '--', '.effective-flow/'])) !== '')
    fail('UNSAFE_RUNTIME_ROOT', 'runtime state is tracked');
  for (const target of ['.effective-flow/config.json', '.effective-flow/build-runs'])
    await git(deps, root, ['check-ignore', '--no-index', '-q', '--', target]);
  if (target !== undefined) {
    absolute(target);
    if (!inside(path.join(root, '.effective-flow'), target))
      fail('UNSAFE_PATH', 'runtime mutation escapes verified state directory');
    await git(deps, root, ['check-ignore', '--no-index', '-q', '--', path.relative(root, target)]);
  }
  const runtime = path.join(root, '.effective-flow');
  await safeDirectory(runtime);
  if (mutation) {
    const memory = await jsonRead(path.join(runtime, 'memory.json'), 1024 * 1024);
    if (memory?.runtimeMigration?.directory?.version !== 1)
      fail('MIGRATION_REQUIRED', 'runtime migration must complete before writes');
  }
  return { root, identity, runtime, namespace: path.join(runtime, 'build-runs') };
}
async function worktrees(deps, root) {
  const raw = await git(deps, root, ['worktree', 'list', '--porcelain', '-z'], [0], true);
  return raw
    .toString('utf8')
    .split('\0\0')
    .filter(Boolean)
    .map((block) => {
      const fields = block.split('\0').filter(Boolean);
      const roots = fields.filter((line) => line.startsWith('worktree '));
      if (roots.length !== 1 || !fields[0].startsWith('worktree '))
        fail('REPOSITORY_MISMATCH', 'invalid worktree registration');
      const branch = fields.find((line) => line.startsWith('branch '));
      return {
        root: roots[0].slice(9),
        branch: branch?.slice(18) ?? null,
        head: fields.find((line) => line.startsWith('HEAD '))?.slice(5),
        bare: fields.includes('bare'),
        detached: fields.includes('detached'),
        unusable: fields.some((line) => /^(locked|prunable)( |$)/.test(line)),
      };
    });
}
function executionShape(execution) {
  exact(execution, ['executionRoot', 'branch', 'head', 'origin', 'owner']);
  absolute(execution.executionRoot);
  oid(execution.head);
  if (execution.branch !== null) text(execution.branch);
  one(execution.origin, [
    'effective-flow-created',
    'current-checkout',
    'in-place',
    'harness-managed',
  ]);
  one(execution.owner, ['build']);
}
async function executionGuard(request, deps, expectedHead) {
  const execution = request.execution;
  executionShape(execution);
  const root = await safeDirectory(execution.executionRoot);
  const branch = await git(deps, root, ['branch', '--show-current']);
  if (
    (await realpath(await git(deps, root, ['rev-parse', '--show-toplevel']))) !== root ||
    (await realpath(
      await git(deps, root, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
    )) !== request.repositoryIdentity ||
    branch !== (execution.branch ?? '')
  )
    fail('REPOSITORY_MISMATCH', 'execution checkout identity changed');
  const head = await git(deps, root, ['rev-parse', 'HEAD']);
  const registration = (await worktrees(deps, root)).find((item) => item.root === root);
  if (
    !registration ||
    registration.bare ||
    registration.unusable ||
    registration.head !== head ||
    registration.branch !== execution.branch ||
    (execution.branch === null && (!registration.detached || head !== execution.head))
  )
    fail('REPOSITORY_MISMATCH', 'checkout registration does not match receipt');
  if (expectedHead !== undefined && head !== expectedHead)
    fail('CONTENT_DRIFT', 'checkout HEAD changed');
  return { root, head };
}
function artifactShape(ref) {
  exact(ref, ['root', 'path', 'digest']);
  absolute(ref.root);
  relative(ref.path);
  digest(ref.digest);
}
async function artifact(ref, allowedRoots, maximum = Infinity) {
  artifactShape(ref);
  if (!allowedRoots.includes(ref.root)) fail('UNSAFE_PATH', 'artifact owning root is not allowed');
  await safeDirectory(ref.root);
  let bytes;
  try {
    bytes = await safeRead(path.join(ref.root, ref.path), maximum);
  } catch (error) {
    if (error.code === 'ENOENT') fail('MISSING_EVIDENCE', 'referenced artifact is missing');
    throw error;
  }
  if (contentDigest(bytes) !== ref.digest) fail('DIGEST_MISMATCH', 'artifact digest changed');
  return bytes;
}
function gitRefShape(ref) {
  exact(ref, ['repositoryIdentity', 'commit', 'blob', 'path', 'digest']);
  absolute(ref.repositoryIdentity);
  oid(ref.commit);
  oid(ref.blob);
  relative(ref.path);
  digest(ref.digest);
}
async function gitArtifact(ref, context, deps) {
  gitRefShape(ref);
  if (ref.repositoryIdentity !== context.identity)
    fail('REPOSITORY_MISMATCH', 'foreign Git evidence');
  // Commit and blob IDs, not branch names or rev expressions, are accepted as authority.
  if (
    (await git(deps, context.root, ['cat-file', '-t', ref.commit])) !== 'commit' ||
    (await git(deps, context.root, ['rev-parse', `${ref.commit}:${ref.path}`])) !== ref.blob ||
    (await git(deps, context.root, ['cat-file', '-t', ref.blob])) !== 'blob'
  )
    fail('MISSING_EVIDENCE', 'Git evidence identity does not match');
  const bytes = await git(deps, context.root, ['cat-file', 'blob', ref.blob], [0], true);
  if (contentDigest(bytes) !== ref.digest) fail('DIGEST_MISMATCH', 'Git evidence digest changed');
}
async function evidence(ref, request, context, deps, durable = false) {
  if (Object.hasOwn(ref, 'commit')) return gitArtifact(ref, context, deps);
  if (
    durable &&
    (ref.root !== context.root ||
      !ref.path.startsWith(`.effective-flow/build-runs/${request.runId}/`))
  )
    fail('MISSING_EVIDENCE', 'terminal non-Git evidence must be retained in this runtime run');
  await artifact(ref, request.allowedRoots);
}
function reference(context, file, bytes) {
  return {
    root: context.root,
    path: path.relative(context.root, file),
    digest: contentDigest(bytes),
  };
}
async function retainEvidence(context, input) {
  identifier(input.evidenceId);
  if (Object.hasOwn(input, 'content') === Object.hasOwn(input, 'source'))
    fail('INVALID_PAYLOAD', 'retention requires exactly one content or source');
  const bytes = Object.hasOwn(input, 'source')
    ? await artifact(input.source, context.request.allowedRoots, MAX_RETAINED_EVIDENCE_BYTES)
    : Buffer.from(text(input.content, 'evidence content'), 'utf8');
  if (bytes.length > MAX_RETAINED_EVIDENCE_BYTES)
    fail('TOO_LARGE', 'retained evidence exceeds byte limit');
  const file = path.join(context.run, `evidence-${input.evidenceId}.txt`);
  await runtimeGuard(context.request, context.deps, true, file);
  await exclusive(file, bytes);
  return reference(context, file, bytes);
}
async function record(context, name, value) {
  const bytes = encodeControl(value);
  await runtimeGuard(context.request, context.deps, true, path.join(context.run, name));
  if (!['terminal.json', 'continuation.json'].includes(name) && !context.transportOnly)
    await executionGuard(context.request, context.deps);
  const file = path.join(context.run, name);
  await exclusive(file, bytes);
  return reference(context, file, bytes);
}
async function readRecord(context, ref) {
  artifactShape(ref);
  if (ref.root !== context.root || path.dirname(path.join(ref.root, ref.path)) !== context.run)
    fail('FOREIGN_RECORD', 'record belongs to another run');
  const bytes = await artifact(ref, [context.root]);
  if (bytes.length > MAX_CONTROL_BYTES) fail('TOO_LARGE', 'control record too large');
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('INVALID_STATE', 'malformed control record');
  }
  if (
    value.protocol !== BUILD_RUN_VERSION ||
    value.runId !== context.request.runId ||
    value.requestDigest !== context.requestDigest
  )
    fail('FOREIGN_RECORD', 'record request association does not match');
  return value;
}
function base(context) {
  return {
    protocol: BUILD_RUN_VERSION,
    runId: context.request.runId,
    requestDigest: context.requestDigest,
  };
}
const RECEIPT_FIELDS = [
  'protocol',
  'runId',
  'requestDigest',
  'gate',
  'outcome',
  'reason',
  'snapshot',
  'evidence',
  'manifest',
];
const ACCEPTANCE_GATES = ['independent-review', 'final-validation'];
const POST_HANDOFF_GATES = [
  'delivery',
  'plan-archival',
  'cleanup',
  'pilot-finalization',
  'completion',
];
const MODES = ['owned-worktree', 'reuse-worktree', 'in-place-delivery', 'in-place-no-delivery'];

async function localRecord(context, name) {
  const file = path.join(context.run, name);
  const bytes = await safeRead(file, MAX_CONTROL_BYTES);
  return readRecord(context, reference(context, file, bytes));
}
async function present(context, name) {
  return (await readdir(context.run)).includes(name);
}
async function load(input, deps, mutation = false) {
  identifier(input.runId);
  digest(input.requestDigest);
  const context = {
    ...(await runtimeGuard(input, deps, mutation)),
    deps,
    requestDigest: input.requestDigest,
  };
  context.run = await safeDirectory(path.join(context.namespace, input.runId));
  const bytes = await safeRead(path.join(context.run, 'request.json'), MAX_CONTROL_BYTES);
  if (contentDigest(bytes) !== input.requestDigest)
    fail('DIGEST_MISMATCH', 'request identity changed');
  try {
    context.request = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('INVALID_STATE', 'malformed request');
  }
  validateRequest(context.request);
  if (
    context.request.runId !== input.runId ||
    context.request.runtimeStateRoot !== context.root ||
    context.request.repositoryIdentity !== context.identity
  )
    fail('FOREIGN_RECORD', 'foreign run request');
  context.originalRequest = context.request;
  const sourceBytes = await artifact(context.request.source, [context.root]);
  try {
    context.source = JSON.parse(sourceBytes.toString('utf8'));
  } catch {
    fail('INVALID_STATE', 'malformed original instruction source');
  }
  exact(context.source, ['instruction', 'restrictions']);
  text(context.source.instruction);
  strings(context.source.restrictions);
  if (await present(context, 'execution.json')) {
    const transition = await localRecord(context, 'execution.json');
    exact(transition, [
      'protocol',
      'runId',
      'requestDigest',
      'authorization',
      'execution',
      'ownership',
      'ownershipProof',
    ]);
    executionShape(transition.execution);
    context.transition = transition;
    context.request = {
      ...context.request,
      execution: transition.execution,
      allowedRoots: [
        ...new Set([...context.request.allowedRoots, transition.execution.executionRoot]),
      ],
    };
  }
  if (await present(context, 'authorization.json'))
    context.authorization = await localRecord(context, 'authorization.json');
  if (context.transition) {
    const bound = await readRecord(context, context.transition.authorization);
    if (!same(bound, context.authorization))
      fail('DIGEST_MISMATCH', 'execution authorization changed after transition');
    if (context.transition.ownershipProof !== null)
      await dataRead(context, context.transition.ownershipProof);
  }
  if (await present(context, 'checkout-return.json'))
    context.checkoutReturn = await localRecord(context, 'checkout-return.json');
  if (await present(context, 'handoff.json')) {
    context.handoff = await localRecord(context, 'handoff.json');
    context.transportOnly = true;
  }
  return context;
}
function validateRequest(value) {
  exact(value, [
    'protocol',
    'runId',
    'runtimeStateRoot',
    'repositoryIdentity',
    'execution',
    'plan',
    'source',
    'runMode',
    'languages',
    'completionCondition',
    'deliveryRestrictions',
    'sourceAssociation',
    'allowedRoots',
    'policy',
  ]);
  if (value.protocol !== BUILD_RUN_VERSION) fail('INVALID_STATE', 'unsupported build protocol');
  identifier(value.runId);
  absolute(value.runtimeStateRoot);
  absolute(value.repositoryIdentity);
  executionShape(value.execution);
  exact(value.languages, LANGUAGES);
  Object.values(value.languages).forEach((language) => one(language, ['en', 'de']));
  one(value.runMode, ['interactive', 'non-interactive']);
  text(value.completionCondition);
  strings(value.deliveryRestrictions);
  text(value.sourceAssociation);
  if (
    !Array.isArray(value.allowedRoots) ||
    !value.allowedRoots.includes(value.execution.executionRoot) ||
    !value.allowedRoots.includes(value.runtimeStateRoot)
  )
    fail('INVALID_PAYLOAD', 'missing allowed execution/runtime roots');
  value.allowedRoots.forEach(absolute);
  artifactShape(value.plan);
  artifactShape(value.source);
  exact(value.policy, [
    'visibility',
    'worktreeEnabled',
    'planDirectory',
    'configuration',
    'configurationOrigin',
    'returnBranch',
    'basis',
  ]);
  one(value.policy.visibility, ['standard', 'hidden']);
  if (typeof value.policy.worktreeEnabled !== 'boolean')
    fail('INVALID_STATE', 'invalid worktree policy');
  relative(value.policy.planDirectory);
  if (value.policy.configuration !== null) {
    artifactShape(value.policy.configuration);
    artifactShape(value.policy.configurationOrigin);
  } else if (value.policy.configurationOrigin !== null)
    fail('INVALID_STATE', 'configuration source pairing changed');
  text(value.policy.returnBranch);
  artifactShape(value.policy.basis);
}
// Re-resolve through the owner: a retained file cannot prove that another source has not won.
function configurationBasis(config) {
  const { rows, ...source } = config.source;
  const values = Object.fromEntries(
    Object.entries(config.values).map(([key, entry]) => [
      key,
      Object.fromEntries(
        ['state', 'value', 'items', 'source', 'profile']
          .filter((field) => Object.hasOwn(entry, field))
          .map((field) => [field, entry[field]]),
      ),
    ]),
  );
  const worktree = config.values['worktree.enabled'];
  if (
    worktree &&
    (worktree.state !== 'set' ||
      (worktree.source === 'transitional-json'
        ? typeof worktree.value !== 'boolean'
        : !['true', 'false'].includes(worktree.raw)))
  )
    fail('CONTENT_DRIFT', 'worktree policy cannot be revalidated');
  return {
    diagnostics: config.diagnostics.map((entry) =>
      Object.fromEntries(Object.entries(entry).filter(([key]) => !['line', 'raw'].includes(key))),
    ),
    checkoutRoot: config.checkoutRoot,
    runtimeStateRoot: config.runtimeStateRoot,
    visibility: config.visibility,
    source,
    values,
    retired: config.retired,
  };
}
// Only the resolver-owned global hidden selection is relevant outside the invocation checkout.
// A different main-branch ADR is never adopted as this run's product policy.
function runtimePolicyBasis(config) {
  if (config.visibility !== 'hidden') return { visibility: config.visibility, hidden: null };
  const { checkoutRoot, ...hidden } = configurationBasis(config);
  return { visibility: config.visibility, hidden };
}
async function currentConfiguration(root, runtimeRoot, deps) {
  const config = await resolveConfiguration({ cwd: root, tool: 'build' }, { runner: deps.runner });
  if (config.checkoutRoot !== root || config.runtimeStateRoot !== runtimeRoot)
    fail('REPOSITORY_MISMATCH', 'configuration roots differ from bound scope');
  return config;
}
async function resolvePolicy(input, deps) {
  const config = await resolveConfiguration(
    { cwd: input.execution.executionRoot, tool: 'build' },
    { runner: deps.runner },
  );
  if (
    config.runtimeStateRoot !== input.runtimeStateRoot ||
    config.checkoutRoot !== input.execution.executionRoot
  )
    fail('REPOSITORY_MISMATCH', 'configuration roots differ from request');
  const worktree = config.values['worktree.enabled'];
  if (
    worktree &&
    (worktree.state !== 'set' ||
      (worktree.source === 'transitional-json'
        ? typeof worktree.value !== 'boolean'
        : !['true', 'false'].includes(worktree.raw)))
  )
    fail('INVALID_PAYLOAD', 'invalid worktree.enabled');
  const basis = {
    schema: 1,
    execution: configurationBasis(config),
    runtime: runtimePolicyBasis(config),
  };
  const basisBytes = Buffer.from(`${JSON.stringify(basis)}\n`);
  const policy = {
    basis: {
      root: input.runtimeStateRoot,
      path: `.effective-flow/build-runs/${input.runId}/configuration-basis.txt`,
      digest: contentDigest(basisBytes),
    },
    visibility: config.visibility,
    worktreeEnabled: worktree ? [true, 'true'].includes(worktree.value) : true,
    planDirectory: config.values['plan.dir']?.value ?? 'docs/plan',
    configuration: null,
    configurationOrigin: null,
    returnBranch: config.values['delivery.returnBranch']?.value ?? 'auto',
  };
  relative(policy.planDirectory);
  text(policy.returnBranch);
  if (config.source.path !== null) {
    const root = inside(input.runtimeStateRoot, config.source.path)
      ? input.runtimeStateRoot
      : input.execution.executionRoot;
    const bytes = await safeRead(config.source.path);
    policy.configurationOrigin = {
      root,
      path: path.relative(root, config.source.path),
      digest: contentDigest(bytes),
    };
    policy.configuration = {
      root: input.runtimeStateRoot,
      path: `.effective-flow/build-runs/${input.runId}/configuration-source.txt`,
      digest: contentDigest(bytes),
    };
  }
  if (
    policy.visibility === 'hidden' &&
    (!inside(
      path.join(input.runtimeStateRoot, policy.planDirectory),
      path.join(input.plan.root, input.plan.path),
    ) ||
      input.plan.root !== input.runtimeStateRoot)
  )
    fail('UNSAFE_PATH', 'hidden plan must use the resolver-owned private plan root');
  return { policy, basisBytes };
}
async function policyUnchanged(context) {
  const policy = context.request.policy;
  const bytes = await artifact(policy.basis, [context.root]);
  let basis;
  try {
    basis = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('INVALID_STATE', 'malformed configuration basis');
  }
  exact(basis, ['schema', 'execution', 'runtime']);
  if (basis.schema !== 1) fail('INVALID_STATE', 'unsupported configuration basis');
  if (policy.configuration !== null) await artifact(policy.configuration, [context.root]);
  const originalRoot = context.originalRequest.execution.executionRoot;
  let exists = true;
  try {
    await lstat(originalRoot);
  } catch (error) {
    if (error.code === 'ENOENT') exists = false;
    else throw error;
  }
  try {
    if (exists) {
      const execution = await currentConfiguration(originalRoot, context.root, context.deps);
      if (!same(configurationBasis(execution), basis.execution))
        fail(
          'CONTENT_DRIFT',
          'execution configuration selection or effective policy changed; reconcile the decision basis',
        );
    } else {
      // No product authority survives loss of the original resolver scope. Normal proved owned
      // cleanup permits only the sealed runtime channel and the owner's fresh global hidden view.
      if (!context.handoff || !context.transportOnly)
        fail('CONTENT_DRIFT', 'original configuration scope is unavailable');
      await removedExecution(context);
      const runtime = await currentConfiguration(context.root, context.root, context.deps);
      if (!same(runtimePolicyBasis(runtime), basis.runtime))
        fail(
          'CONTENT_DRIFT',
          'runtime hidden selection or effective policy changed; reconcile the decision basis',
        );
      const origin = policy.configurationOrigin;
      if (origin !== null && !inside(originalRoot, path.join(origin.root, origin.path)))
        await artifact(origin, context.request.allowedRoots);
    }
  } catch (error) {
    if (error instanceof BuildRunError) throw error;
    throw new BuildRunError(
      'CONTENT_DRIFT',
      'owning configuration resolution could not be revalidated',
      { cause: error },
    );
  }
}
async function planUnchanged(context) {
  await artifact(context.request.plan, context.request.allowedRoots);
}
async function active(context) {
  const entries = await readdir(context.run);
  if (entries.includes('terminal.json'))
    fail('TERMINAL_RUN', 'completed run cannot accept more work');
  return entries;
}
async function agent(context, handle) {
  text(handle, 'agent handle');
  const value = await localRecord(context, 'agent.json');
  exact(value, ['protocol', 'runId', 'requestDigest', 'agentHandle']);
  if (value.agentHandle !== handle)
    fail('AGENT_MISMATCH', 'resume must use the original retained agent');
}
async function agentHandle(context) {
  return (await localRecord(context, 'agent.json')).agentHandle;
}

async function inspect(context, execution = context.request.execution) {
  const { root, head } = await executionGuard({ ...context.request, execution }, context.deps);
  const index = await git(context.deps, root, ['ls-files', '--stage', '-z'], [0], true);
  const tracked = await git(context.deps, root, ['ls-files', '-z'], [0], true);
  const untracked = await git(
    context.deps,
    root,
    ['ls-files', '--others', '--exclude-standard', '-z'],
    [0],
    true,
  );
  const files = new Map();
  async function contents(list) {
    const entries = [];
    for (const name of [...new Set(list.toString('utf8').split('\0').filter(Boolean))].sort()) {
      relative(name);
      const file = path.join(root, name);
      await safeDirectory(path.dirname(file));
      let info;
      try {
        info = await lstat(file);
      } catch (error) {
        if (error.code === 'ENOENT') {
          entries.push([name, 'missing']);
          continue;
        }
        throw error;
      }
      let entry;
      if (info.isSymbolicLink()) entry = [name, 'symlink', contentDigest(await readlink(file))];
      else if (info.isFile())
        entry = [
          name,
          info.mode & 0o111 ? '100755' : '100644',
          contentDigest(await safeRead(file)),
        ];
      else
        fail(
          'RECONCILIATION_REQUIRED',
          'tracked directory/submodule snapshot requires reconciliation',
        );
      entries.push(entry);
      files.set(name, entry);
    }
    return contentDigest(JSON.stringify(entries));
  }
  const snapshot = {
    head,
    index: contentDigest(index),
    workingTree: await contents(tracked),
    untracked: await contents(untracked),
  };
  if (
    head !== (await git(context.deps, root, ['rev-parse', 'HEAD'])) ||
    !index.equals(await git(context.deps, root, ['ls-files', '--stage', '-z'], [0], true))
  )
    fail('CONTENT_DRIFT', 'checkout changed during snapshot');
  return { snapshot, manifest: [...files.values()].sort((a, b) => a[0].localeCompare(b[0], 'en')) };
}
async function snapshot(context, execution) {
  return (await inspect(context, execution)).snapshot;
}
function same(a, b) {
  const canonical = (value) =>
    JSON.stringify(value, (_key, item) =>
      item !== null && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, item[key]]),
          )
        : item,
    );
  return canonical(a) === canonical(b);
}
function snapshotShape(value) {
  exact(value, ['head', 'index', 'workingTree', 'untracked']);
  oid(value.head);
  digest(value.index);
  digest(value.workingTree);
  digest(value.untracked);
}
async function data(context, name, value) {
  // Content manifests are referenced evidence, not control messages or retained diffs.
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  await runtimeGuard(context.request, context.deps, true, path.join(context.run, name));
  await exclusive(path.join(context.run, name), bytes);
  return reference(context, path.join(context.run, name), bytes);
}
async function dataRead(context, ref) {
  const bytes = await artifact(ref, [context.root]);
  if (!ref.path.startsWith(`.effective-flow/build-runs/${context.request.runId}/`))
    fail('FOREIGN_RECORD', 'foreign content evidence');
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('INVALID_STATE', 'malformed content manifest');
  }
}
async function gateReceipt(context, ref) {
  const value = await readRecord(context, ref);
  exact(value, RECEIPT_FIELDS);
  one(value.gate, REQUIRED_GATES);
  one(value.outcome, ['passed', 'not-applicable']);
  text(value.reason);
  snapshotShape(value.snapshot);
  if (
    value.outcome === 'not-applicable' &&
    !['delivery', 'pilot-finalization'].includes(value.gate)
  )
    fail('INCOMPLETE_GATES', 'required gate cannot be waived');
  if (!Array.isArray(value.evidence) || value.evidence.length === 0)
    fail('MISSING_EVIDENCE', 'gate evidence is missing');
  for (const item of value.evidence)
    await evidence(item, context.request, context, context.deps, true);
  await dataRead(context, value.manifest);
  return value;
}
async function assertCompleted(context, completed, refs, current) {
  const proven = new Set();
  for (const ref of refs) {
    await evidence(ref, context.request, context, context.deps);
    if (
      ref.root === context.root &&
      path.dirname(path.join(ref.root, ref.path)) === context.run &&
      path.basename(ref.path).startsWith('gate-')
    ) {
      const receipt = await gateReceipt(context, ref);
      if (
        [...ACCEPTANCE_GATES, 'delivery', 'completion'].includes(receipt.gate) &&
        !same(receipt.snapshot, current)
      ) {
        if (!context.handoff || !(await carriedGate(context, ref, context.handoff)))
          fail('CONTENT_DRIFT', 'completed acceptance gate needs renewed evidence');
      }
      proven.add(receipt.gate);
    }
  }
  if (completed.some((gate) => !proven.has(gate)))
    fail(
      'INCOMPLETE_GATES',
      'checkpoint cannot promote pending work without a completed gate receipt',
    );
}
function partition(completed, pending) {
  if (!Array.isArray(completed) || !Array.isArray(pending))
    fail('INVALID_PAYLOAD', 'checkpoint phases must be arrays');
  const all = [...completed, ...pending];
  if (
    all.length !== REQUIRED_GATES.length ||
    new Set(all).size !== REQUIRED_GATES.length ||
    all.some((gate) => !REQUIRED_GATES.includes(gate))
  )
    fail('INVALID_PAYLOAD', 'checkpoint must partition required gates');
}
async function checkpoint(context, ref, current = true) {
  const value = await readRecord(context, ref);
  exact(value, [
    'protocol',
    'runId',
    'requestDigest',
    'checkpointId',
    'agentHandle',
    'snapshot',
    'completed',
    'pending',
    'evidence',
    'authority',
    'handoff',
    'execution',
  ]);
  identifier(value.checkpointId);
  if (!same(value.execution, context.request.execution))
    fail('FOREIGN_RECORD', 'checkpoint execution identity changed');
  snapshotShape(value.snapshot);
  partition(value.completed, value.pending);
  await agent(context, value.agentHandle);
  if (!Array.isArray(value.evidence)) fail('INVALID_STATE', 'invalid checkpoint evidence');
  if (value.authority === 'runtime-only') {
    if (!context.handoff || !same(value.handoff, await handoffReference(context)))
      fail('FOREIGN_RECORD', 'post-handoff checkpoint association changed');
    await verifyHandoff(context, context.handoff);
    if (!same(value.snapshot, context.handoff.snapshot))
      fail('CONTENT_DRIFT', 'post-handoff checkpoint basis changed');
  } else {
    one(value.authority, ['product']);
    if (context.handoff || value.handoff !== null)
      fail('INVALID_STATE', 'product authority ended at handoff');
    if (current) {
      await planUnchanged(context);
      await policyUnchanged(context);
      if (!same(value.snapshot, await snapshot(context)))
        fail(
          'CONTENT_DRIFT',
          'checkpoint basis changed; reconcile and renew affected gates/approvals',
        );
    }
  }
  await assertCompleted(context, value.completed, value.evidence, value.snapshot);
  return value;
}
async function noLifecycleLock(context) {
  if (!context.transition?.ownership) return;
  const owner = context.transition.ownership;
  const lock = path.join(owner.root, owner.path.replace(/\.json$/, '.lock'));
  try {
    await lstat(lock);
    fail('LOCKED', 'release the owning lifecycle lock before a user boundary');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function outstanding(context) {
  const entries = await readdir(context.run);
  const pending = entries.filter(
    (name) =>
      /^question-[a-zA-Z0-9_-]+\.json$/.test(name) &&
      !entries.includes(name.replace('question-', 'resumed-')),
  );
  if (pending.length > 1) fail('INVALID_STATE', 'multiple outstanding questions');
  return pending[0];
}
async function questionRecord(context, ref) {
  const value = await readRecord(context, ref);
  exact(value, [
    'protocol',
    'runId',
    'requestDigest',
    'questionId',
    'revision',
    'origin',
    'agentHandle',
    'checkpoint',
    'snapshot',
    'question',
    'options',
    'responseType',
  ]);
  identifier(value.questionId);
  one(value.origin, QUESTION_ORIGINS);
  text(value.question);
  strings(value.options);
  one(value.responseType, ['option', 'free-text']);
  if (
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    new Set(value.options).size !== value.options.length ||
    (value.responseType === 'option' && value.options.length < 2) ||
    (value.responseType === 'free-text' && value.options.length !== 0)
  )
    fail('INVALID_STATE', 'invalid question response contract');
  const cp = await checkpoint(context, value.checkpoint);
  if (!same(cp.snapshot, value.snapshot) || cp.agentHandle !== value.agentHandle)
    fail('INVALID_STATE', 'question checkpoint association changed');
  const name = `question-${value.questionId}.json`;
  if (path.basename(ref.path) !== name || (await outstanding(context)) !== name)
    fail('STALE_REPLY', 'question is no longer outstanding');
  return value;
}
async function create(input, deps) {
  exact(input, [
    'runtimeStateRoot',
    'repositoryIdentity',
    'runId',
    'execution',
    'plan',
    'source',
    'runMode',
    'languages',
    'completionCondition',
    'deliveryRestrictions',
    'sourceAssociation',
    'allowedRoots',
  ]);
  identifier(input.runId);
  exact(input.source, ['instruction', 'restrictions']);
  text(input.source.instruction);
  strings(input.source.restrictions);
  const context = { ...(await runtimeGuard(input, deps, true)), deps };
  const sourceFile = path.join(context.namespace, input.runId, 'source.json');
  const sourceBytes = Buffer.from(`${JSON.stringify(input.source)}\n`);
  const resolved = await resolvePolicy(input, deps);
  const request = {
    ...input,
    protocol: BUILD_RUN_VERSION,
    source: reference(context, sourceFile, sourceBytes),
    policy: resolved.policy,
  };
  validateRequest(request);
  for (const root of request.allowedRoots) await safeDirectory(root);
  await executionGuard(request, deps, request.execution.head);
  await artifact(request.plan, request.allowedRoots);
  const requestBytes = encodeControl(request);
  const requestDigest = contentDigest(requestBytes);
  const requestRef = reference(
    context,
    path.join(context.namespace, input.runId, 'request.json'),
    requestBytes,
  );
  const dispatch = {
    protocol: BUILD_RUN_VERSION,
    runId: input.runId,
    request: requestRef,
    executionRoot: request.execution.executionRoot,
    runMode: request.runMode,
    completionCondition: request.completionCondition,
  };
  encodeControl(dispatch, MAX_DISPATCH_BYTES);
  await runtimeGuard(input, deps, true, context.namespace);
  await ensureDirectory(context.namespace);
  const run = path.join(context.namespace, input.runId);
  await runtimeGuard(input, deps, true, run);
  try {
    await mkdir(run, { mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST') fail('COLLISION', 'run identity already exists');
    throw error;
  }
  await runtimeGuard(input, deps, true, sourceFile);
  await exclusive(sourceFile, sourceBytes);
  if (request.policy.configuration !== null) {
    const target = path.join(run, 'configuration-source.txt');
    await runtimeGuard(input, deps, true, target);
    await exclusive(
      target,
      await safeRead(
        path.join(request.policy.configurationOrigin.root, request.policy.configurationOrigin.path),
      ),
    );
  }
  await runtimeGuard(input, deps, true, path.join(run, 'configuration-basis.txt'));
  await exclusive(path.join(run, 'configuration-basis.txt'), resolved.basisBytes);
  await runtimeGuard(input, deps, true, path.join(run, 'request.json'));
  await exclusive(path.join(run, 'request.json'), requestBytes);
  return { request: requestRef, requestDigest, dispatch };
}

async function authority(context, value, mode) {
  one(mode, MODES);
  if (value.kind === 'configuration') {
    exact(value, ['kind']);
    if (
      (context.request.execution.executionRoot !== context.root && mode !== 'reuse-worktree') ||
      (context.request.execution.executionRoot === context.root &&
        mode !==
          (context.request.policy.worktreeEnabled ? 'owned-worktree' : 'in-place-no-delivery'))
    )
      fail('AUTHORITY_MISMATCH', 'selected mode is not established by configuration');
    return;
  }
  if (value.kind === 'source') {
    exact(value, ['kind', 'source', 'index', 'quote']);
    text(value.quote);
    one(value.source, ['instruction', 'restriction']);
    const source =
      value.source === 'instruction'
        ? context.source.instruction
        : context.source.restrictions[value.index];
    if (
      (value.source === 'instruction' && value.index !== null) ||
      (value.source === 'restriction' && (!Number.isSafeInteger(value.index) || value.index < 0)) ||
      typeof source !== 'string' ||
      !source.includes(value.quote)
    )
      fail('AUTHORITY_MISMATCH', 'mode provenance is not in the immutable original user source');
    return;
  }
  exact(value, ['kind', 'reply', 'resume']);
  one(value.kind, ['reply']);
  const reply = await readRecord(context, value.reply);
  const resumed = await readRecord(context, value.resume);
  const q = await readRecord(context, reply.question);
  if (
    q.origin !== 'delivery-choice' ||
    reply.trustedUser.channel !== 'current-user' ||
    !same(resumed.reply, value.reply) ||
    resumed.agentHandle !== (await agentHandle(context))
  )
    fail('AUTHORITY_MISMATCH', 'mode decision lacks a consumed trusted delivery-choice reply');
}
// This consumes the existing owner's body-free normalized discovery, not a new approval flag.
// Checks 1–4 remain facts of that owner read; check 5 and local branch/source proofs are Git checks.
async function planContinuation(context, input) {
  const proof = input.planContinuation;
  exact(proof, [
    'discovery',
    'number',
    'resolvedBaseRef',
    'resolvedLocalBaseBranch',
    'fetchedHead',
    'provisioning',
    'ownership',
  ]);
  if (
    context.request.policy.visibility !== 'standard' ||
    context.request.plan.path.split('/').includes('archive')
  )
    fail('AUTHORITY_MISMATCH', 'plan continuation is not available for this source');
  one(proof.provisioning, ['dedicated', 'in-place', 'adopt']);
  oid(proof.fetchedHead);
  if (!Number.isSafeInteger(proof.number) || proof.number < 1)
    fail('INVALID_PAYLOAD', 'invalid plan pull request number');
  text(proof.resolvedLocalBaseBranch);
  text(proof.resolvedBaseRef);
  if (!/^refs\/(heads|remotes)\//.test(proof.resolvedBaseRef))
    fail('INVALID_PAYLOAD', 'plan continuation requires the canonical resolved base ref');
  await evidence(proof.discovery, context.request, context, context.deps, true);
  let discovery;
  try {
    discovery = JSON.parse((await artifact(proof.discovery, [context.root])).toString('utf8'));
  } catch (error) {
    if (error instanceof BuildRunError) throw error;
    fail('INVALID_STATE', 'malformed normalized plan discovery');
  }
  exact(discovery, ['ok', 'operation', 'provider', 'data', 'dryRun']);
  if (
    discovery.ok !== true ||
    discovery.operation !== 'pr-list' ||
    discovery.dryRun !== false ||
    !['github', 'forgejo'].includes(discovery.provider)
  )
    fail(
      'AUTHORITY_MISMATCH',
      'plan continuation needs the existing successful remote-tracker pr-list read',
    );
  exact(
    discovery.data,
    ['result'],
    ['command', 'commands', 'pagesFetched', 'conditionalWriteAvailable'],
  );
  if (!Array.isArray(discovery.data.result))
    fail('INVALID_STATE', 'normalized plan discovery result is not a list');
  const own = discovery.data.result.filter((item) => item?.sameRepository === true);
  if (own.length !== 1)
    fail('AUTHORITY_MISMATCH', 'plan continuation requires exactly one same-repository candidate');
  const candidate = own[0];
  exact(
    candidate,
    ['number', 'url', 'state', 'head', 'base', 'draft', 'sameRepository', 'planPrMarker'],
    [
      'repository',
      'headRepository',
      'title',
      'labels',
      'author',
      'planPrMarkerError',
      'createdAt',
      'updatedAt',
      'mergedAt',
      'closedAt',
      'stateReason',
      'version',
    ],
  );
  for (const field of ['createdAt', 'updatedAt', 'mergedAt', 'closedAt', 'stateReason', 'version'])
    if (Object.hasOwn(candidate, field)) text(candidate[field], field);
  // Exactly the existing owner's verification checks 1–4; no body or comment is admitted.
  if (
    candidate.planPrMarker !== context.request.plan.path ||
    Object.hasOwn(candidate, 'planPrMarkerError') ||
    candidate.state !== 'open' ||
    candidate.draft !== true ||
    candidate.sameRepository !== true ||
    candidate.base !== proof.resolvedLocalBaseBranch ||
    candidate.number !== proof.number ||
    candidate.head !== input.branch
  )
    fail('AUTHORITY_MISMATCH', 'normalized plan candidate fails the existing owner checks');
  text(candidate.url);
  if (
    (await git(context.deps, context.root, ['check-ref-format', '--branch', candidate.head])) !==
    candidate.head
  )
    fail('AUTHORITY_MISMATCH', 'unsafe published plan branch');
  if (
    (await git(context.deps, context.root, [
      'rev-parse',
      '--verify',
      `refs/remotes/origin/${candidate.head}^{commit}`,
    ])) !== proof.fetchedHead
  )
    fail('CONTENT_DRIFT', 'published plan fetched head changed');
  const mergeBase = await git(context.deps, context.root, [
    'merge-base',
    proof.resolvedBaseRef,
    proof.fetchedHead,
  ]);
  const paths = (
    await git(
      context.deps,
      context.root,
      ['diff', '--name-status', '-z', '--no-renames', mergeBase, proof.fetchedHead],
      [0],
      true,
    )
  )
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const planPath = context.request.plan.path;
  const archivePath = path.posix.join(
    path.posix.dirname(planPath),
    'archive',
    path.posix.basename(planPath),
  );
  if (paths.length === 0 || paths.length % 2 !== 0)
    fail('AUTHORITY_MISMATCH', 'published plan head has no proven plan-only changes');
  for (let i = 0; i < paths.length; i += 2)
    if (paths[i + 1] !== planPath && !(paths[i] === 'D' && paths[i + 1] === archivePath))
      fail('AUTHORITY_MISMATCH', 'published plan head changes product or unrelated paths');
  const blob = await git(context.deps, context.root, [
    'rev-parse',
    `${proof.fetchedHead}:${planPath}`,
  ]);
  await gitArtifact(
    {
      repositoryIdentity: context.identity,
      commit: proof.fetchedHead,
      blob,
      path: planPath,
      digest: context.request.plan.digest,
    },
    context,
    context.deps,
  );
  await artifact(context.request.plan, context.request.allowedRoots);
  if (proof.provisioning !== 'adopt' && input.baseHead !== proof.fetchedHead)
    fail('CONTENT_DRIFT', 'plan setup must use the fetched plan head');
  if (proof.provisioning === 'dedicated' && input.mode !== 'owned-worktree')
    fail('AUTHORITY_MISMATCH', 'dedicated plan provisioning requires owned execution');
  if (
    proof.provisioning === 'in-place' &&
    (input.executionRoot !== context.request.execution.executionRoot ||
      !['in-place-delivery', 'reuse-worktree'].includes(input.mode) ||
      context.request.execution.branch !== candidate.head ||
      (await git(context.deps, input.executionRoot, [
        'status',
        '--porcelain',
        '--untracked-files=all',
        '--ignore-submodules=none',
      ])) !== '')
  )
    fail('AUTHORITY_MISMATCH', 'existing plan branch must be clean in the invocation checkout');
  if (proof.provisioning === 'adopt') {
    if (
      input.mode !== 'owned-worktree' ||
      input.executionRoot === context.request.execution.executionRoot ||
      proof.ownership === null
    )
      fail('AUTHORITY_MISMATCH', 'adoption needs the existing owner lifecycle path');
    const execution = {
      executionRoot: input.executionRoot,
      branch: input.branch,
      head: input.baseHead,
      origin: 'effective-flow-created',
      owner: 'build',
    };
    await executionGuard({ ...context.request, execution }, context.deps, input.baseHead);
    await git(context.deps, context.root, [
      'merge-base',
      '--is-ancestor',
      proof.fetchedHead,
      input.baseHead,
    ]);
    if (
      (await git(context.deps, input.executionRoot, [
        'status',
        '--porcelain',
        '--untracked-files=all',
        '--ignore-submodules=none',
      ])) !== ''
    )
      fail('CONTENT_DRIFT', 'adopted plan worktree must be clean');
    const previous = await lifecycleProof(
      context,
      proof.ownership,
      { ...input, planContinuation: proof },
      execution,
      true,
    );
    const directory = path.join(context.root, '.effective-flow', 'worktree-runs');
    let matching = 0;
    for (const name of await readdir(directory))
      if (name.endsWith('.json')) {
        const entry = await jsonRead(path.join(directory, name));
        if (entry.worktreePath === input.executionRoot) matching += 1;
      }
    if (matching !== 1)
      fail('AUTHORITY_MISMATCH', 'adoption requires exactly one matching lifecycle record');
    return { ...proof, beforeOwnership: await data(context, 'adoption-before.txt', previous) };
  }
  if (proof.ownership !== null)
    fail('INVALID_PAYLOAD', 'only existing owner adoption consumes a previous lifecycle record');
  return { ...proof, beforeOwnership: null };
}

async function authorizeExecution(context, input) {
  if (context.authorization || context.transition || context.handoff)
    fail('INVALID_STATE', 'execution setup is already bound');
  await agent(context, input.agentHandle);
  await planUnchanged(context);
  await policyUnchanged(context);
  const original = await executionGuard(
    context.request,
    context.deps,
    context.request.execution.head,
  );
  one(input.mode, MODES);
  absolute(input.executionRoot);
  oid(input.baseHead);
  if (input.branch !== null) text(input.branch);
  const continuation =
    input.planContinuation === undefined ? null : await planContinuation(context, input);
  if (continuation === null || input.authority.kind !== 'configuration')
    await authority(context, input.authority, input.mode);
  else exact(input.authority, ['kind']);
  if (await outstanding(context))
    fail('OUTSTANDING_QUESTION', 'consume the mode decision before authorizing setup');
  const inventory = await worktrees(context.deps, context.root);
  if (input.mode === 'owned-worktree') {
    if (
      (original.root !== context.root && continuation === null) ||
      input.executionRoot === context.root ||
      (inventory.some((item) => item.root === input.executionRoot) &&
        continuation?.provisioning !== 'adopt') ||
      input.branch === null
    )
      fail('AUTHORITY_MISMATCH', 'owned worktree setup must start from main into a new location');
    if (continuation?.provisioning !== 'adopt') {
      try {
        await lstat(input.executionRoot);
        fail('COLLISION', 'delivery worktree location already exists');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    const refs = await git(context.deps, context.root, [
      'for-each-ref',
      '--format=%(refname)',
      `refs/heads/${input.branch}`,
    ]);
    if (refs !== '') {
      if (continuation === null) fail('COLLISION', 'owned delivery branch already exists');
      const local = await git(context.deps, context.root, [
        'rev-parse',
        `refs/heads/${input.branch}`,
      ]);
      if (continuation.provisioning !== 'adopt')
        await git(context.deps, context.root, [
          'merge-base',
          '--is-ancestor',
          local,
          continuation.fetchedHead,
        ]);
    }
  } else if (input.executionRoot !== original.root)
    fail('AUTHORITY_MISMATCH', 'reused/in-place execution cannot adopt another root');
  if (input.mode === 'reuse-worktree' && original.root === context.root)
    fail('AUTHORITY_MISMATCH', 'reuse-worktree requires an existing external linked checkout');
  if (
    input.mode === 'in-place-no-delivery' &&
    (input.branch !== context.request.execution.branch || input.baseHead !== original.head)
  )
    fail('AUTHORITY_MISMATCH', 'in-place execution cannot create delivery artifacts');
  if ((await git(context.deps, context.root, ['cat-file', '-t', input.baseHead])) !== 'commit')
    fail('INVALID_PAYLOAD', 'setup base must be an existing commit');
  const returnBranch =
    input.returnBranch ??
    (context.request.policy.returnBranch === 'auto'
      ? context.request.execution.branch
      : context.request.policy.returnBranch);
  let returnCheckout = null;
  if (input.mode === 'in-place-delivery' && returnBranch !== null) {
    text(returnBranch);
    if (
      context.request.policy.returnBranch !== 'auto' &&
      returnBranch !== context.request.policy.returnBranch
    )
      fail('AUTHORITY_MISMATCH', 'return target differs from configured return branch');
    const returnHead = await git(context.deps, context.root, [
      'rev-parse',
      `refs/heads/${returnBranch}`,
    ]);
    if (
      context.request.policy.returnBranch === 'auto' &&
      returnBranch !== context.request.execution.branch &&
      returnHead !== input.baseHead
    )
      fail(
        'AUTHORITY_MISMATCH',
        'automatic return must name original checkout or verified local base',
      );
    returnCheckout = { branch: returnBranch, head: returnHead };
  }
  return record(context, 'authorization.json', {
    ...base(context),
    agentHandle: input.agentHandle,
    mode: input.mode,
    executionRoot: input.executionRoot,
    branch: input.branch,
    baseHead: input.baseHead,
    authority: input.authority,
    returnCheckout,
    planContinuation: continuation,
    originalSnapshot: await snapshot(context),
  });
}
async function lifecycleProof(context, ref, auth, execution, adopting = false) {
  artifactShape(ref);
  if (
    ref.root !== context.root ||
    !ref.path.startsWith('.effective-flow/worktree-runs/') ||
    path.basename(ref.path) === '.operation.lock'
  )
    fail('AUTHORITY_MISMATCH', 'owned transition needs its runtime lifecycle record');
  const bytes = await artifact(ref, [context.root]);
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('INVALID_STATE', 'malformed lifecycle ownership record');
  }
  exact(value, [
    'schemaVersion',
    'recordId',
    'sessionId',
    'componentId',
    'workflow',
    'purpose',
    'repositoryIdentity',
    'runtimeStateRoot',
    'worktreePath',
    'branch',
    'creationOid',
    'ownership',
    'receipt',
    'branchPolicy',
    'createdAt',
    'updatedAt',
    'status',
    'reason',
  ]);
  if (
    value.schemaVersion !== 1 ||
    (!adopting && value.sessionId !== context.request.runId) ||
    value.componentId !== null ||
    value.workflow !== 'build' ||
    value.purpose !== 'delivery' ||
    value.repositoryIdentity !== context.identity ||
    value.runtimeStateRoot !== context.root ||
    value.worktreePath !== execution.executionRoot ||
    value.branch !== execution.branch ||
    value.creationOid !== (auth.planContinuation?.fetchedHead ?? auth.baseHead) ||
    value.ownership !== 'effective-flow-created' ||
    value.branchPolicy !== 'retain' ||
    (adopting
      ? !['aborted', 'failed'].includes(value.status) || typeof value.reason !== 'string'
      : value.status !== 'active' || value.reason !== null) ||
    path.basename(ref.path) !== `${value.recordId}.json`
  )
    fail('AUTHORITY_MISMATCH', 'lifecycle record is not owned by this logical build');
  identifier(value.recordId);
  text(value.sessionId);
  for (const timestamp of [value.createdAt, value.updatedAt])
    if (
      typeof timestamp !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ||
      !Number.isFinite(Date.parse(timestamp))
    )
      fail('INVALID_STATE', 'lifecycle timestamps are not valid RFC-3339 identities');
  if (adopting) text(value.reason);
  exact(value.receipt, [
    'repositoryIdentity',
    'executionRoot',
    'runtimeStateRoot',
    'checkout',
    'origin',
    'setupOwner',
    'setupStatus',
    'workflow',
    'purpose',
  ]);
  text(value.receipt.setupOwner);
  one(value.receipt.setupStatus, ['pending', 'complete', 'skipped', 'externally managed']);
  exact(value.receipt.checkout, ['kind', 'branch']);
  if (
    value.receipt.repositoryIdentity !== context.identity ||
    value.receipt.executionRoot !== execution.executionRoot ||
    value.receipt.runtimeStateRoot !== context.root ||
    value.receipt.checkout.kind !== 'branch' ||
    value.receipt.checkout.branch !== execution.branch ||
    value.receipt.origin !== 'effective-flow-created' ||
    value.receipt.workflow !== 'build' ||
    value.receipt.purpose !== 'delivery'
  )
    fail('AUTHORITY_MISMATCH', 'lifecycle creation receipt does not match transition');
  try {
    await lstat(
      path.join(context.root, '.effective-flow', 'worktree-runs', `${value.recordId}.lock`),
    );
    fail('LOCKED', 'lifecycle lock must be released before build continuation');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return value;
}
async function transitionExecution(context, input) {
  if (!context.authorization || context.transition || context.handoff)
    fail('INVALID_STATE', 'exactly one authorized setup transition is allowed');
  await agent(context, input.agentHandle);
  const auth = context.authorization;
  const authRef = reference(
    context,
    path.join(context.run, 'authorization.json'),
    await safeRead(path.join(context.run, 'authorization.json')),
  );
  if (!same(input.authorization, authRef))
    fail('FOREIGN_RECORD', 'execution transition has a foreign setup authorization');
  executionShape(input.execution);
  if (
    input.execution.executionRoot !== auth.executionRoot ||
    input.execution.branch !== auth.branch ||
    input.execution.head !== auth.baseHead
  )
    fail('AUTHORITY_MISMATCH', 'execution transition exceeds authorized setup');
  const candidate = { ...context.request, execution: input.execution };
  await executionGuard(candidate, context.deps, auth.baseHead);
  if (auth.mode === 'owned-worktree') {
    if (input.execution.origin !== 'effective-flow-created')
      fail('AUTHORITY_MISMATCH', 'owned transition requires owned receipt');
    await executionGuard(
      context.originalRequest,
      context.deps,
      context.originalRequest.execution.head,
    );
    if (!same(auth.originalSnapshot, await snapshot(context)))
      fail('CONTENT_DRIFT', 'original invocation checkout changed during setup');
    const currentOwner = await lifecycleProof(context, input.ownership, auth, input.execution);
    if (auth.planContinuation?.provisioning === 'adopt') {
      const previous = await dataRead(context, auth.planContinuation.beforeOwnership);
      const expected = {
        ...previous,
        status: 'active',
        reason: null,
        sessionId: context.request.runId,
        updatedAt: currentOwner.updatedAt,
      };
      if (!same(currentOwner, expected))
        fail('AUTHORITY_MISMATCH', 'adoption changed immutable lifecycle creation evidence');
    }
  } else {
    if (input.ownership !== null || input.execution.origin === 'effective-flow-created')
      fail('AUTHORITY_MISMATCH', 'external/in-place checkout cannot claim new worktree ownership');
    if (auth.mode === 'reuse-worktree' && input.execution.origin !== 'harness-managed')
      fail('AUTHORITY_MISMATCH', 'existing linked checkout remains external');
  }
  let ownershipProof = null;
  if (input.ownership !== null)
    ownershipProof = await data(
      context,
      'creation-ownership.txt',
      JSON.parse((await artifact(input.ownership, [context.root])).toString('utf8')),
    );
  context.transportOnly = true;
  return record(context, 'execution.json', {
    ...base(context),
    authorization: input.authorization,
    execution: input.execution,
    ownership: input.ownership,
    ownershipProof,
  });
}

async function acceptanceAt(context, refs, basis, manifest) {
  if (!Array.isArray(refs) || refs.length !== 2)
    fail('INCOMPLETE_GATES', 'both review and final validation are required');
  const seen = new Set();
  for (const ref of refs) {
    const receipt = await gateReceipt(context, ref);
    if (
      !ACCEPTANCE_GATES.includes(receipt.gate) ||
      receipt.outcome !== 'passed' ||
      seen.has(receipt.gate) ||
      !(
        same(receipt.snapshot, basis) ||
        (manifest !== undefined &&
          receipt.snapshot.head === basis.head &&
          same(await dataRead(context, receipt.manifest), manifest))
      )
    )
      fail('CONTENT_DRIFT', 'acceptance receipt does not judge the exact content basis');
    seen.add(receipt.gate);
  }
  return refs;
}
async function prepareCompletion(context, input) {
  await agent(context, input.agentHandle);
  await planUnchanged(context);
  await policyUnchanged(context);
  identifier(input.preparationId);
  if (!Array.isArray(input.gates)) fail('INVALID_PAYLOAD', 'acceptance gate references required');
  const current = await inspect(context);
  const seen = new Set();
  for (const ref of input.gates) {
    const gate = await gateReceipt(context, ref);
    if (
      !ACCEPTANCE_GATES.includes(gate.gate) ||
      seen.has(gate.gate) ||
      gate.outcome !== 'passed' ||
      !same(gate.snapshot, current.snapshot)
    )
      fail('CONTENT_DRIFT', 'pre-completion review/validation must judge current content');
    seen.add(gate.gate);
  }
  if (seen.size !== ACCEPTANCE_GATES.length)
    fail('INCOMPLETE_GATES', 'both existing review and final-validation gates are required');
  const manifest = await data(context, `manifest-${input.preparationId}.txt`, current.manifest);
  const planBytes = await artifact(context.request.plan, context.request.allowedRoots);
  const beforePath = path.join(context.run, `plan-before-${input.preparationId}.md`);
  await runtimeGuard(context.request, context.deps, true, beforePath);
  await exclusive(beforePath, planBytes);
  return record(context, `prepared-${input.preparationId}.json`, {
    ...base(context),
    preparationId: input.preparationId,
    agentHandle: input.agentHandle,
    snapshot: current.snapshot,
    manifest,
    plan: reference(context, beforePath, planBytes),
    gates: input.gates,
  });
}
async function preparation(context, ref) {
  const value = await readRecord(context, ref);
  exact(value, [
    'protocol',
    'runId',
    'requestDigest',
    'preparationId',
    'agentHandle',
    'snapshot',
    'manifest',
    'plan',
    'gates',
  ]);
  await agent(context, value.agentHandle);
  snapshotShape(value.snapshot);
  const gates = new Map();
  for (const item of value.gates) {
    const receipt = await gateReceipt(context, item);
    if (
      !ACCEPTANCE_GATES.includes(receipt.gate) ||
      receipt.outcome !== 'passed' ||
      !same(receipt.snapshot, value.snapshot) ||
      gates.has(receipt.gate)
    )
      fail('INCOMPLETE_GATES', 'prepared acceptance evidence changed');
    gates.set(receipt.gate, item);
  }
  if (gates.size !== 2) fail('INCOMPLETE_GATES', 'prepared acceptance evidence incomplete');
  return value;
}
function normalizedPlan(bytes) {
  const text = bytes.toString('utf8');
  return text.replace(
    /^\*\*(Plan status|Planungsstatus):\*\* (Not implemented|Implemented|Nicht umgesetzt|Umgesetzt)$/gm,
    (_, key) => `**${key}:** <status>`,
  );
}
async function planCompletion(context, prepared, finalPlan, allowOpen = false) {
  artifactShape(finalPlan);
  const source = context.request.plan;
  const archivedPath = source.path.split('/').includes('archive')
    ? source.path
    : path.posix.join(path.posix.dirname(source.path), 'archive', path.posix.basename(source.path));
  const owningRoot =
    context.request.policy.visibility === 'hidden'
      ? context.root
      : context.request.execution.executionRoot;
  if (
    !(finalPlan.root === owningRoot && finalPlan.path === archivedPath) &&
    !(allowOpen && finalPlan.root === source.root && finalPlan.path === source.path)
  )
    fail('AUTHORITY_MISMATCH', 'completion plan is not the owning plan/archive path');
  const before = await artifact(prepared.plan, [context.root]);
  const after = await artifact(finalPlan, context.request.allowedRoots);
  const statuses =
    /^(?:\*\*(?:Plan status|Planungsstatus):\*\* (?:Not implemented|Implemented|Nicht umgesetzt|Umgesetzt))$/gm;
  if (
    (before.toString('utf8').match(statuses) ?? []).length !== 1 ||
    (after.toString('utf8').match(statuses) ?? []).length !== 1
  )
    fail('RECHECK_REQUIRED', 'plan completion requires exactly one canonical status');
  const normalizedBefore = normalizedPlan(before);
  const normalizedAfter = normalizedPlan(after);
  if (
    !normalizedAfter.startsWith(normalizedBefore) ||
    (normalizedAfter.length !== normalizedBefore.length &&
      !/^\s*## (Build completion|Workflow-Abschluss)\s*\n/.test(
        normalizedAfter.slice(normalizedBefore.length),
      ))
  )
    fail(
      'RECHECK_REQUIRED',
      'completion must preserve approved plan text and append only its completion report',
    );
  if (
    !allowOpen &&
    !/^(?:\*\*Plan status:\*\* Implemented|\*\*Planungsstatus:\*\* Umgesetzt)$/m.test(
      after.toString('utf8'),
    )
  )
    fail('RECHECK_REQUIRED', 'archived plan is not canonically implemented');
  return { beforeDigest: contentDigest(before), afterDigest: finalPlan.digest, archivedPath };
}
async function formattingChecks(context, refs, changes) {
  const approved = new Map();
  for (const ref of refs) {
    await evidence(ref, context.request, context, context.deps, true);
    const bytes = await artifact(ref, [context.root]);
    if (bytes.length > MAX_CONTROL_BYTES)
      fail('TOO_LARGE', 'formatting judgment exceeds control bound');
    let judgment;
    try {
      judgment = JSON.parse(bytes.toString('utf8'));
    } catch {
      fail('INVALID_STATE', 'malformed formatting judgment');
    }
    exact(judgment, [
      'protocol',
      'runId',
      'requestDigest',
      'role',
      'agentHandle',
      'outcome',
      'changes',
    ]);
    if (
      judgment.protocol !== BUILD_RUN_VERSION ||
      judgment.runId !== context.request.runId ||
      judgment.requestDigest !== context.requestDigest ||
      judgment.role !== 'code-validator' ||
      judgment.agentHandle === (await agentHandle(context)) ||
      judgment.outcome !== 'formatting-only' ||
      !Array.isArray(judgment.changes)
    )
      fail(
        'RECHECK_REQUIRED',
        'only an independent targeted formatting judgment can preserve acceptance',
      );
    text(judgment.agentHandle);
    for (const item of judgment.changes) {
      exact(item, ['path', 'before', 'after']);
      relative(item.path);
      digest(item.before);
      digest(item.after);
      if (approved.has(item.path)) fail('INVALID_STATE', 'duplicate formatting judgment path');
      approved.set(item.path, item);
    }
  }
  if (approved.size !== changes.length)
    fail(
      'RECHECK_REQUIRED',
      'changed product paths require exact targeted checks or renewed review/validation',
    );
  for (const change of changes) {
    const proof = approved.get(change[0]);
    if (
      !proof ||
      proof.before !== change[1]?.[2] ||
      proof.after !== change[2]?.[2] ||
      change[1]?.[1] !== change[2]?.[1]
    )
      fail('RECHECK_REQUIRED', 'formatting judgment does not cover exact changed bytes/modes');
  }
}
async function stagedTree(context, expectedTree, manifest) {
  oid(expectedTree);
  if ((await git(context.deps, context.root, ['cat-file', '-t', expectedTree])) !== 'tree')
    fail('MISSING_EVIDENCE', 'expected staged tree is missing');
  const stage = await git(
    context.deps,
    context.request.execution.executionRoot,
    ['ls-files', '--stage', '-z'],
    [0],
    true,
  );
  const expectedEntries = [];
  const raw = await git(
    context.deps,
    context.root,
    ['ls-tree', '-r', '-z', expectedTree],
    [0],
    true,
  );
  for (const line of raw.toString('utf8').split('\0').filter(Boolean)) {
    const match = /^(\d+) blob ([a-f0-9]+)\t(.*)$/s.exec(line);
    if (!match) fail('RECHECK_REQUIRED', 'staged submodules/trees require explicit reconciliation');
    expectedEntries.push(`${match[1]} ${match[2]} 0\t${match[3]}`);
  }
  if (!same(stage.toString('utf8').split('\0').filter(Boolean).sort(), expectedEntries.sort()))
    fail('CONTENT_DRIFT', 'declared tree does not match exact staged index');
  const treeManifest = await treeContents(context, expectedTree);
  if (!same(manifest, treeManifest))
    fail('CONTENT_DRIFT', 'staged tree does not contain exactly the sealed output');
}
async function treeContents(context, tree) {
  const raw = await git(context.deps, context.root, ['ls-tree', '-r', '-z', tree], [0], true);
  const entries = [];
  for (const line of raw.toString('utf8').split('\0').filter(Boolean)) {
    const match = /^(\d+) blob ([a-f0-9]+)\t(.*)$/s.exec(line);
    if (!match) fail('RECHECK_REQUIRED', 'unsupported tree entry');
    const bytes = await git(context.deps, context.root, ['cat-file', 'blob', match[2]], [0], true);
    entries.push([match[3], match[1] === '120000' ? 'symlink' : match[1], contentDigest(bytes)]);
  }
  return entries.sort((a, b) => a[0].localeCompare(b[0], 'en'));
}
async function sealDelivery(context, input) {
  await agent(context, input.agentHandle);
  await policyUnchanged(context);
  identifier(input.sealId);
  if (!context.authorization || !context.transition)
    fail('INVALID_STATE', 'delivery mode/execution must be verified before sealing');
  const prepared = await preparation(context, input.basis);
  const current = await inspect(context);
  const oldManifest = await dataRead(context, prepared.manifest);
  if (current.snapshot.head !== prepared.snapshot.head)
    fail('CONTENT_DRIFT', 'unexpected commit before completion seal');
  await planCompletion(context, prepared, input.finalPlan);
  const before = new Map(oldManifest.map((entry) => [entry[0], entry]));
  const after = new Map(current.manifest.map((entry) => [entry[0], entry]));
  if (context.request.plan.path !== input.finalPlan.path && after.has(context.request.plan.path))
    fail('RECHECK_REQUIRED', 'old execution plan remains after archival');
  const allowedPlan = new Set([context.request.plan.path, input.finalPlan.path]);
  const changes = [...new Set([...before.keys(), ...after.keys()])]
    .filter((name) => !allowedPlan.has(name) && !same(before.get(name), after.get(name)))
    .map((name) => [name, before.get(name), after.get(name)]);
  if (!Array.isArray(input.judgments))
    fail('INVALID_PAYLOAD', 'formatting judgments must be an array');
  let acceptedGates = prepared.gates;
  if (input.renewedGates !== undefined) {
    acceptedGates = await acceptanceAt(
      context,
      input.renewedGates,
      current.snapshot,
      current.manifest,
    );
    if (input.judgments.length !== 0)
      fail(
        'INVALID_PAYLOAD',
        'renewed acceptance and preserved formatting checks are separate routes',
      );
  } else await formattingChecks(context, input.judgments, changes);
  if (context.authorization.mode === 'in-place-no-delivery') {
    if (input.expectedTree !== null || current.snapshot.head !== context.authorization.baseHead)
      fail('AUTHORITY_MISMATCH', 'in-place without delivery cannot stage a forced commit');
  } else await stagedTree(context, input.expectedTree, current.manifest);
  const manifest = await data(context, `sealed-manifest-${input.sealId}.txt`, current.manifest);
  return record(context, `sealed-${input.sealId}.json`, {
    ...base(context),
    sealId: input.sealId,
    agentHandle: input.agentHandle,
    basis: input.basis,
    snapshot: current.snapshot,
    manifest,
    finalPlan: input.finalPlan,
    expectedTree: input.expectedTree,
    judgments: input.judgments,
    acceptedGates,
  });
}
async function sealed(context, ref) {
  const value = await readRecord(context, ref);
  exact(value, [
    'protocol',
    'runId',
    'requestDigest',
    'sealId',
    'agentHandle',
    'basis',
    'snapshot',
    'manifest',
    'finalPlan',
    'expectedTree',
    'judgments',
    'acceptedGates',
  ]);
  await agent(context, value.agentHandle);
  snapshotShape(value.snapshot);
  const prepared = await preparation(context, value.basis);
  await artifact(prepared.manifest, [context.root]);
  await artifact(value.manifest, [context.root]);
  for (const item of value.judgments)
    await evidence(item, context.request, context, context.deps, true);
  await acceptanceAt(
    context,
    value.acceptedGates,
    same(value.acceptedGates, prepared.gates) ? prepared.snapshot : value.snapshot,
    await dataRead(
      context,
      same(value.acceptedGates, prepared.gates) ? prepared.manifest : value.manifest,
    ),
  );
  return value;
}
async function handoffReference(context) {
  const file = path.join(context.run, 'handoff.json');
  return reference(context, file, await safeRead(file, MAX_CONTROL_BYTES));
}
async function makeHandoff(context, input) {
  await agent(context, input.agentHandle);
  if (context.handoff) fail('INVALID_STATE', 'product authority already ended');
  const seal = await sealed(context, input.seal);
  const current = await inspect(context);
  const manifest = await dataRead(context, seal.manifest);
  if (!same(manifest, current.manifest))
    fail('CONTENT_DRIFT', 'output changed after the completion seal');
  const mode = context.authorization?.mode;
  if (!mode) fail('INVALID_STATE', 'handoff needs verified delivery mode');
  const head = current.snapshot.head;
  let finalPlan = input.finalPlan;
  if (mode === 'in-place-no-delivery') {
    if (
      !same(current.snapshot, seal.snapshot) ||
      input.head !== context.authorization.baseHead ||
      input.head !== head ||
      Object.hasOwn(finalPlan, 'commit')
    )
      fail('AUTHORITY_MISMATCH', 'in-place output cannot be silently committed');
  } else {
    oid(input.head);
    if (
      input.head !== head ||
      (await git(context.deps, context.root, ['rev-parse', `${head}^{tree}`])) !== seal.expectedTree
    )
      fail('CONTENT_DRIFT', 'committed tree differs from sealed staged output');
    if (
      head !== seal.snapshot.head &&
      (await git(context.deps, context.root, ['rev-parse', `${head}^`])) !== seal.snapshot.head
    )
      fail('CONTENT_DRIFT', 'handoff commit is not the sealed parent child');
    if (
      (await git(context.deps, context.request.execution.executionRoot, [
        'status',
        '--porcelain',
        '--untracked-files=all',
        '--ignore-submodules=none',
      ])) !== ''
    )
      fail('CONTENT_DRIFT', 'committed handoff has unaccounted dirty output');
    if (
      context.request.policy.visibility === 'standard' &&
      (!Object.hasOwn(finalPlan, 'commit') ||
        finalPlan.commit !== head ||
        finalPlan.path !== seal.finalPlan.path ||
        finalPlan.digest !== seal.finalPlan.digest)
    )
      fail('MISSING_EVIDENCE', 'standard delivery requires exact committed archive identity');
  }
  if (context.request.policy.visibility === 'hidden' || mode === 'in-place-no-delivery') {
    if (!same(finalPlan, seal.finalPlan))
      fail('FOREIGN_RECORD', 'private/uncommitted archive changed');
    const bytes = await artifact(finalPlan, context.request.allowedRoots);
    const retained = path.join(context.run, 'final-plan.md');
    await runtimeGuard(context.request, context.deps, true, retained);
    await exclusive(retained, bytes);
    finalPlan = reference(context, retained, bytes);
  } else await gitArtifact(finalPlan, context, context.deps);
  return record(context, 'handoff.json', {
    ...base(context),
    agentHandle: input.agentHandle,
    seal: input.seal,
    mode,
    execution: context.request.execution,
    snapshot: current.snapshot,
    finalPlan,
    planOrigin: seal.finalPlan,
    head,
    dirty:
      mode === 'in-place-no-delivery' &&
      (await git(context.deps, context.request.execution.executionRoot, [
        'status',
        '--porcelain',
        '--untracked-files=all',
      ])) !== '',
  });
}
async function removedExecution(context) {
  const root = context.request.execution.executionRoot;
  let exists = true;
  try {
    await lstat(root);
  } catch (error) {
    if (error.code === 'ENOENT') exists = false;
    else throw error;
  }
  if (exists || (await worktrees(context.deps, context.root)).some((item) => item.root === root))
    fail('CONTENT_DRIFT', 'claimed cleanup did not remove the execution worktree');
}
async function verifyHandoff(context, value, ignoreLive = false) {
  exact(value, [
    'protocol',
    'runId',
    'requestDigest',
    'agentHandle',
    'seal',
    'mode',
    'execution',
    'snapshot',
    'finalPlan',
    'planOrigin',
    'head',
    'dirty',
  ]);
  await agent(context, value.agentHandle);
  one(value.mode, MODES);
  snapshotShape(value.snapshot);
  if (
    !context.authorization ||
    value.mode !== context.authorization.mode ||
    !same(value.execution, context.request.execution) ||
    value.head !== value.snapshot.head ||
    typeof value.dirty !== 'boolean'
  )
    fail('FOREIGN_RECORD', 'handoff identity changed');
  const seal = await sealed(context, value.seal);
  const manifest = await dataRead(context, seal.manifest);
  await evidence(value.finalPlan, context.request, context, context.deps, true);
  if (
    value.mode !== 'in-place-no-delivery' &&
    !same(
      await treeContents(
        context,
        await git(context.deps, context.root, ['rev-parse', `${value.head}^{tree}`]),
      ),
      manifest,
    )
  )
    fail('CONTENT_DRIFT', 'committed handoff content changed');
  if (Object.hasOwn(value.finalPlan, 'commit')) {
    if (value.finalPlan.commit !== value.head) fail('CONTENT_DRIFT', 'committed plan head changed');
  } else {
    await artifact(value.planOrigin, context.request.allowedRoots);
    if (value.finalPlan.digest !== value.planOrigin.digest)
      fail('CONTENT_DRIFT', 'retained private plan changed');
  }
  // A live checkout remains content-bound. A removed owned checkout grants only runtime transport.
  let exists = true;
  try {
    await lstat(value.execution.executionRoot);
  } catch (error) {
    if (error.code === 'ENOENT') exists = false;
    else throw error;
  }
  if (exists && !ignoreLive) {
    if (context.checkoutReturn) {
      const returned = context.checkoutReturn;
      exact(returned, [
        'protocol',
        'runId',
        'requestDigest',
        'handoff',
        'execution',
        'snapshot',
        'delivery',
      ]);
      if (!same(returned.handoff, await handoffReference(context)))
        fail('FOREIGN_RECORD', 'checkout return belongs to another handoff');
      const actual = await snapshot(context, returned.execution);
      if (!same(actual, returned.snapshot)) fail('CONTENT_DRIFT', 'restored checkout changed');
    } else if (!same(value.snapshot, await snapshot(context)))
      fail('CONTENT_DRIFT', 'handoff checkout changed');
  } else if (!exists) {
    if (value.execution.origin !== 'effective-flow-created' || value.mode !== 'owned-worktree')
      fail('AUTHORITY_MISMATCH', 'external or in-place checkout cannot disappear');
    await removedExecution(context);
  }
  if (
    value.execution.branch !== null &&
    (await git(context.deps, context.root, [
      'rev-parse',
      `refs/heads/${value.execution.branch}`,
    ])) !== value.head
  )
    fail('CONTENT_DRIFT', 'delivery branch advanced after handoff');
  await policyUnchanged(context);
  return value;
}
async function recordReturn(context, input) {
  await agent(context, input.agentHandle);
  if (
    !context.handoff ||
    context.handoff.mode !== 'in-place-delivery' ||
    !context.authorization.returnCheckout ||
    context.checkoutReturn
  )
    fail('INVALID_STATE', 'only the configured in-place handback can record one checkout restore');
  await verifyHandoff(context, context.handoff, true);
  const expected = context.authorization.returnCheckout;
  const head = await git(context.deps, context.root, ['rev-parse', 'HEAD']);
  const execution = {
    ...context.request.execution,
    branch: expected.branch,
    head,
    origin: 'in-place',
  };
  await executionGuard({ ...context.request, execution }, context.deps, head);
  if (
    (await git(context.deps, context.root, [
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--ignore-submodules=none',
    ])) !== ''
  )
    fail('CONTENT_DRIFT', 'restored checkout must be clean');
  const delivery = await gateReceipt(context, input.delivery);
  if (
    delivery.gate !== 'delivery' ||
    delivery.outcome !== 'passed' ||
    !same(delivery.snapshot, context.handoff.snapshot)
  )
    fail('MISSING_EVIDENCE', 'checkout restoration needs the actual completed delivery gate');
  if (head !== expected.head) {
    await git(context.deps, context.root, ['merge-base', '--is-ancestor', expected.head, head]);
    await git(context.deps, context.root, [
      'merge-base',
      '--is-ancestor',
      context.handoff.head,
      head,
    ]);
  }
  return record(context, 'checkout-return.json', {
    ...base(context),
    handoff: await handoffReference(context),
    execution,
    snapshot: await snapshot(context, execution),
    delivery: input.delivery,
  });
}
async function carriedGate(context, ref, handoff) {
  const seal = await sealed(context, handoff.seal);
  return seal.acceptedGates.some((item) => same(item, ref));
}

async function terminalRecord(context, ref) {
  return validateTerminalValue(context, await readRecord(context, ref));
}
async function validateTerminalValue(context, value) {
  exact(value, [
    'protocol',
    'runId',
    'requestDigest',
    'status',
    'sourcePlan',
    'finalPlan',
    'finalCheckout',
    'gates',
    'retainedWorktree',
    'pilotStatus',
    'conclusion',
    'nextWorkflow',
    'handoff',
    'checkoutReturn',
  ]);
  one(value.status, ['DONE', 'ABORT']);
  text(value.conclusion);
  text(value.nextWorkflow);
  one(value.pilotStatus, ['not-applicable', 'finalized', 'pending-unproven']);
  if (!same(value.sourcePlan, context.request.plan))
    fail('FOREIGN_RECORD', 'terminal source plan association changed');
  exact(value.finalCheckout, [
    'repositoryIdentity',
    'executionRoot',
    'branch',
    'head',
    'snapshot',
    'worktreeRemoved',
  ]);
  const checkout = value.finalCheckout;
  oid(checkout.head);
  snapshotShape(checkout.snapshot);
  if (checkout.head !== checkout.snapshot.head)
    fail('FOREIGN_RECORD', 'terminal head differs from its snapshot');
  if (
    checkout.repositoryIdentity !== context.identity ||
    checkout.executionRoot !== context.request.execution.executionRoot ||
    checkout.branch !== context.request.execution.branch ||
    typeof checkout.worktreeRemoved !== 'boolean'
  )
    fail('FOREIGN_RECORD', 'terminal checkout is foreign');
  if (!Array.isArray(value.gates)) fail('INVALID_STATE', 'gates must be an array');
  if (value.retainedWorktree !== null) {
    exact(value.retainedWorktree, ['root', 'dirty', 'reason']);
    if (
      value.retainedWorktree.root !== checkout.executionRoot ||
      typeof value.retainedWorktree.dirty !== 'boolean'
    )
      fail('INVALID_STATE', 'invalid retained checkout');
    text(value.retainedWorktree.reason);
  }
  await evidence(value.finalPlan, context.request, context, context.deps, true);
  if (value.status === 'DONE') {
    const returnRef = context.checkoutReturn
      ? reference(
          context,
          path.join(context.run, 'checkout-return.json'),
          await safeRead(path.join(context.run, 'checkout-return.json')),
        )
      : null;
    if (!same(value.checkoutReturn, returnRef))
      fail('FOREIGN_RECORD', 'terminal checkout return association changed');
    if (!context.handoff || !same(value.handoff, await handoffReference(context)))
      fail('MISSING_EVIDENCE', 'success requires a sealed product handoff');
    const handoff = await verifyHandoff(context, context.handoff);
    if (
      !same(value.finalPlan, handoff.finalPlan) ||
      !same(checkout.snapshot, handoff.snapshot) ||
      checkout.head !== handoff.head
    )
      fail('CONTENT_DRIFT', 'terminal does not match verified handoff');
    if (await outstanding(context))
      fail('OUTSTANDING_QUESTION', 'success cannot bypass an unanswered user gate');
    if (value.pilotStatus === 'pending-unproven')
      fail('INCOMPLETE_GATES', 'success cannot hide unproven pilot finalization');
    if (value.gates.length !== REQUIRED_GATES.length)
      fail('INCOMPLETE_GATES', 'success requires every build gate');
    if (
      handoff.dirty &&
      (handoff.mode !== 'in-place-no-delivery' ||
        !value.retainedWorktree?.dirty ||
        checkout.worktreeRemoved)
    )
      fail('INCOMPLETE_GATES', 'authorized uncommitted output must be reported visibly');
    if (!handoff.dirty && value.retainedWorktree?.dirty)
      fail('INCOMPLETE_GATES', 'success cannot hide unexpected dirty retained work');
    if (checkout.worktreeRemoved) await removedExecution(context);
    else if (
      context.request.execution.origin === 'effective-flow-created' &&
      value.retainedWorktree === null
    )
      fail('INCOMPLETE_GATES', 'retained owned checkout must be reported');
  } else {
    if (value.handoff !== null && !same(value.handoff, await handoffReference(context)))
      fail('FOREIGN_RECORD', 'abort handoff association changed');
    await evidence(value.finalPlan, context.request, context, context.deps, true);
  }
  const seen = new Set();
  for (const ref of value.gates) {
    const receipt = await gateReceipt(context, ref);
    if (seen.has(receipt.gate)) fail('INCOMPLETE_GATES', 'duplicate gate receipt');
    seen.add(receipt.gate);
    if (
      [...ACCEPTANCE_GATES, ...POST_HANDOFF_GATES].includes(receipt.gate) &&
      !same(receipt.snapshot, checkout.snapshot) &&
      !(
        context.handoff &&
        ACCEPTANCE_GATES.includes(receipt.gate) &&
        (await carriedGate(context, ref, context.handoff))
      )
    )
      fail('CONTENT_DRIFT', 'final acceptance gate has a stale content basis');
    if (
      receipt.gate === 'pilot-finalization' &&
      (value.pilotStatus === 'not-applicable') !== (receipt.outcome === 'not-applicable')
    )
      fail('INCOMPLETE_GATES', 'pilot outcome contradicts finalization receipt');
  }
  if (value.status === 'DONE' && REQUIRED_GATES.some((gate) => !seen.has(gate)))
    fail('INCOMPLETE_GATES', 'missing required gate');
  return value;
}

const SCHEMAS = {
  validate: [],
  'bind-agent': ['agentHandle'],
  'authorize-execution': [
    'agentHandle',
    'mode',
    'executionRoot',
    'branch',
    'baseHead',
    'authority',
  ],
  'transition-execution': ['agentHandle', 'authorization', 'execution', 'ownership'],
  'prepare-completion': ['agentHandle', 'preparationId', 'gates'],
  'seal-delivery': ['agentHandle', 'sealId', 'basis', 'finalPlan', 'expectedTree', 'judgments'],
  handoff: ['agentHandle', 'seal', 'head', 'finalPlan'],
  'record-return': ['agentHandle', 'delivery'],
  'retain-evidence': ['evidenceId'],
  checkpoint: ['checkpointId', 'agentHandle', 'completed', 'pending', 'evidence'],
  question: [
    'questionId',
    'revision',
    'origin',
    'agentHandle',
    'checkpoint',
    'question',
    'options',
    'responseType',
  ],
  reply: ['question', 'trustedUser'],
  resume: ['question', 'reply', 'agentHandle'],
  receipt: ['gate', 'outcome', 'reason', 'evidence'],
  terminal: [
    'status',
    'finalPlan',
    'finalCheckout',
    'gates',
    'retainedWorktree',
    'pilotStatus',
    'conclusion',
    'nextWorkflow',
  ],
  'verify-terminal': ['terminal'],
  continuation: ['terminal'],
  'verify-continuation': ['continuation'],
};
async function operate(operation, input, context) {
  if (operation === 'validate') {
    if (context.handoff)
      fail('INVALID_STATE', 'dispatch validation cannot restart a handed-back product');
    await planUnchanged(context);
    await policyUnchanged(context);
    await executionGuard(context.request, context.deps, context.request.execution.head);
    const result = {
      request: reference(
        context,
        path.join(context.run, 'request.json'),
        await safeRead(path.join(context.run, 'request.json')),
      ),
      dispatch: {
        protocol: BUILD_RUN_VERSION,
        runId: input.runId,
        requestDigest: input.requestDigest,
        executionRoot: context.request.execution.executionRoot,
      },
    };
    encodeControl(result.dispatch, MAX_DISPATCH_BYTES);
    return result;
  }
  if (operation === 'verify-terminal') {
    const { protocol, runId, requestDigest, ...projection } = await terminalRecord(
      context,
      input.terminal,
    );
    return projection;
  }
  if (operation === 'verify-continuation') {
    const value = await readRecord(context, input.continuation);
    exact(value, [
      'protocol',
      'runId',
      'requestDigest',
      'terminal',
      'source',
      'finalPlan',
      'head',
      'nextWorkflow',
      'restrictions',
    ]);
    const terminal = await terminalRecord(context, value.terminal);
    if (
      !same(value.source, context.request.source) ||
      !same(value.finalPlan, terminal.finalPlan) ||
      value.head !== terminal.finalCheckout.head ||
      value.nextWorkflow !== terminal.nextWorkflow ||
      !same(value.restrictions, context.request.deliveryRestrictions)
    )
      fail('FOREIGN_RECORD', 'continuation does not match terminal');
    const { protocol, runId, requestDigest, ...projection } = value;
    return projection;
  }
  if (operation === 'continuation') {
    const terminal = await terminalRecord(context, input.terminal);
    return record(context, 'continuation.json', {
      ...base(context),
      terminal: input.terminal,
      source: context.request.source,
      finalPlan: terminal.finalPlan,
      head: terminal.finalCheckout.head,
      nextWorkflow: terminal.nextWorkflow,
      restrictions: context.request.deliveryRestrictions,
    });
  }
  await active(context);
  if (operation === 'terminal') {
    const value = {
      ...base(context),
      ...Object.fromEntries(SCHEMAS.terminal.map((key) => [key, input[key]])),
      sourcePlan: context.request.plan,
      handoff: context.handoff ? await handoffReference(context) : null,
      checkoutReturn: context.checkoutReturn
        ? reference(
            context,
            path.join(context.run, 'checkout-return.json'),
            await safeRead(path.join(context.run, 'checkout-return.json')),
          )
        : null,
    };
    encodeControl(value);
    await validateTerminalValue(context, value);
    return record(context, 'terminal.json', value);
  }
  if (context.handoff) {
    if (
      ![
        'checkpoint',
        'question',
        'reply',
        'resume',
        'receipt',
        'record-return',
        'retain-evidence',
      ].includes(operation)
    )
      fail(
        'PRODUCT_AUTHORITY_ENDED',
        'handoff permits only runtime control and remaining gate outcomes',
      );
    if (operation !== 'record-return') await verifyHandoff(context, context.handoff);
  } else if (!['transition-execution'].includes(operation)) {
    await executionGuard(context.request, context.deps);
    if (context.transition?.ownership !== null && context.transition?.ownership !== undefined) {
      const origin = context.transition.ownership;
      const bytes = await safeRead(path.join(origin.root, origin.path));
      await lifecycleProof(
        context,
        { ...origin, digest: contentDigest(bytes) },
        context.authorization,
        context.request.execution,
      );
    }
    if (operation === 'receipt' && input.completionBasis !== undefined) {
      if (!ACCEPTANCE_GATES.includes(input.gate) || input.currentPlan === undefined)
        fail(
          'INVALID_PAYLOAD',
          'completion recheck needs an acceptance gate and exact current plan',
        );
      const prepared = await preparation(context, input.completionBasis);
      await planCompletion(context, prepared, input.currentPlan, true);
    } else if (!['seal-delivery', 'handoff', 'retain-evidence'].includes(operation))
      await planUnchanged(context);
  }
  if (operation === 'retain-evidence') {
    if (!context.handoff) await policyUnchanged(context);
    return retainEvidence(context, input);
  }
  if (operation === 'authorize-execution') return authorizeExecution(context, input);
  if (operation === 'transition-execution') return transitionExecution(context, input);
  if (operation === 'prepare-completion') return prepareCompletion(context, input);
  if (operation === 'seal-delivery') return sealDelivery(context, input);
  if (operation === 'handoff') return makeHandoff(context, input);
  if (operation === 'record-return') return recordReturn(context, input);
  if (operation === 'bind-agent')
    return record(context, 'agent.json', {
      ...base(context),
      agentHandle: text(input.agentHandle),
    });
  if (operation === 'checkpoint') {
    await noLifecycleLock(context);
    identifier(input.checkpointId);
    await agent(context, input.agentHandle);
    partition(input.completed, input.pending);
    if (!Array.isArray(input.evidence))
      fail('INVALID_PAYLOAD', 'checkpoint evidence must be an array');
    const current = context.handoff ? context.handoff.snapshot : await snapshot(context);
    await assertCompleted(context, input.completed, input.evidence, current);
    return record(context, `checkpoint-${input.checkpointId}.json`, {
      ...base(context),
      ...Object.fromEntries(SCHEMAS.checkpoint.map((key) => [key, input[key]])),
      snapshot: current,
      authority: context.handoff ? 'runtime-only' : 'product',
      execution: context.request.execution,
      handoff: context.handoff ? await handoffReference(context) : null,
    });
  }
  if (operation === 'question') {
    await noLifecycleLock(context);
    if (context.request.runMode !== 'interactive')
      fail('NON_INTERACTIVE', 'originating run cannot relay user questions');
    if (await outstanding(context))
      fail('OUTSTANDING_QUESTION', 'only one outstanding question is allowed');
    identifier(input.questionId);
    one(input.origin, QUESTION_ORIGINS);
    text(input.question);
    strings(input.options);
    one(input.responseType, ['option', 'free-text']);
    if (
      !Number.isSafeInteger(input.revision) ||
      input.revision < 1 ||
      new Set(input.options).size !== input.options.length ||
      (input.responseType === 'option' && input.options.length < 2) ||
      (input.responseType === 'free-text' && input.options.length !== 0)
    )
      fail('INVALID_PAYLOAD', 'invalid question');
    const cp = await checkpoint(context, input.checkpoint);
    await agent(context, input.agentHandle);
    if (cp.agentHandle !== input.agentHandle)
      fail('AGENT_MISMATCH', 'checkpoint belongs to another agent');
    return record(context, `question-${input.questionId}.json`, {
      ...base(context),
      ...Object.fromEntries(SCHEMAS.question.map((key) => [key, input[key]])),
      snapshot: cp.snapshot,
    });
  }
  if (operation === 'reply') {
    const q = await questionRecord(context, input.question);
    exact(input.trustedUser, ['channel', 'messageId', 'questionDigest', 'answer']);
    if (
      input.trustedUser.channel !== 'current-user' ||
      input.trustedUser.questionDigest !== input.question.digest
    )
      fail(
        'UNTRUSTED_REPLY',
        'reply requires current trusted user channel and exact question identity',
      );
    text(input.trustedUser.messageId);
    text(input.trustedUser.answer);
    if (q.responseType === 'option' && !q.options.includes(input.trustedUser.answer))
      fail('INVALID_PAYLOAD', 'answer must exactly match a finite option');
    for (const name of (await readdir(context.run)).filter((entry) => entry.startsWith('reply-')))
      if ((await localRecord(context, name)).trustedUser.messageId === input.trustedUser.messageId)
        fail('STALE_REPLY', 'trusted message already consumed');
    return record(context, `reply-${q.questionId}.json`, {
      ...base(context),
      question: input.question,
      checkpoint: q.checkpoint,
      agentHandle: q.agentHandle,
      snapshot: q.snapshot,
      trustedUser: input.trustedUser,
    });
  }
  if (operation === 'resume') {
    const q = await questionRecord(context, input.question);
    await agent(context, input.agentHandle);
    const reply = await readRecord(context, input.reply);
    exact(reply, [
      'protocol',
      'runId',
      'requestDigest',
      'question',
      'checkpoint',
      'agentHandle',
      'snapshot',
      'trustedUser',
    ]);
    if (
      !same(reply.question, input.question) ||
      reply.agentHandle !== input.agentHandle ||
      q.agentHandle !== input.agentHandle ||
      !same(reply.snapshot, q.snapshot) ||
      !same(reply.checkpoint, q.checkpoint) ||
      path.basename(input.reply.path) !== `reply-${q.questionId}.json`
    )
      fail('STALE_REPLY', 'reply does not match outstanding question/checkpoint/agent');
    exact(reply.trustedUser, ['channel', 'messageId', 'questionDigest', 'answer']);
    if (
      reply.trustedUser.channel !== 'current-user' ||
      reply.trustedUser.questionDigest !== input.question.digest
    )
      fail('UNTRUSTED_REPLY', 'invalid user channel association');
    text(reply.trustedUser.messageId);
    text(reply.trustedUser.answer);
    if (q.responseType === 'option' && !q.options.includes(reply.trustedUser.answer))
      fail('UNTRUSTED_REPLY', 'reply broadens the question options');
    const ref = await record(context, `resumed-${q.questionId}.json`, {
      ...base(context),
      question: input.question,
      reply: input.reply,
      agentHandle: input.agentHandle,
      checkpoint: q.checkpoint,
    });
    const cp = await checkpoint(context, q.checkpoint);
    return {
      resume: ref,
      checkpoint: q.checkpoint,
      completed: cp.completed,
      pending: cp.pending,
      answer: reply.trustedUser.answer,
      agentHandle: input.agentHandle,
      authority: cp.authority,
    };
  }
  if (operation === 'receipt') {
    if (!context.transition)
      fail('INVALID_STATE', 'phase completion requires the verified Phase 2 execution transition');
    if (await outstanding(context))
      fail('OUTSTANDING_QUESTION', 'resume the trusted reply before completing gates');
    one(input.gate, REQUIRED_GATES);
    one(input.outcome, ['passed', 'not-applicable']);
    text(input.reason);
    if (
      input.outcome === 'not-applicable' &&
      !['delivery', 'pilot-finalization'].includes(input.gate)
    )
      fail('INCOMPLETE_GATES', 'required gate cannot be waived');
    if (context.handoff && input.gate === 'pilot-finalization')
      await agent(context, input.agentHandle);
    if (
      input.gate === 'delivery' &&
      context.handoff &&
      (input.outcome === 'not-applicable') !== (context.handoff.mode === 'in-place-no-delivery')
    )
      fail('INCOMPLETE_GATES', 'delivery outcome contradicts verified execution mode');
    if (context.handoff && !POST_HANDOFF_GATES.includes(input.gate))
      fail(
        'PRODUCT_AUTHORITY_ENDED',
        'post-handoff receipt cannot invent earlier product gate completion',
      );
    if (!Array.isArray(input.evidence) || input.evidence.length === 0)
      fail('MISSING_EVIDENCE', 'gate needs evidence');
    for (const ref of input.evidence)
      await evidence(ref, context.request, context, context.deps, true);
    if (
      context.handoff &&
      input.gate === 'cleanup' &&
      context.request.execution.origin === 'effective-flow-created'
    )
      await removedExecution(context);
    const observed = context.handoff ? null : await inspect(context);
    const basis = context.handoff ? context.handoff.snapshot : observed.snapshot;
    const name = context.handoff
      ? `gate-${input.gate}-handoff.json`
      : `gate-${input.gate}-${contentDigest(JSON.stringify(basis)).slice(7)}.json`;
    if (await present(context, name)) fail('COLLISION', 'immutable gate outcome already exists');
    const manifest = context.handoff
      ? (await sealed(context, context.handoff.seal)).manifest
      : await data(context, name.replace('.json', '-manifest.txt'), observed.manifest);
    return record(context, name, {
      ...base(context),
      gate: input.gate,
      outcome: input.outcome,
      reason: input.reason,
      snapshot: basis,
      evidence: input.evidence,
      manifest,
    });
  }
  fail('INVALID_OPERATION', 'unsupported build-run operation');
}
export async function executeOperation(operation, input, deps = {}) {
  if (!BUILD_RUN_OPERATIONS.includes(operation))
    fail('INVALID_OPERATION', 'unsupported build-run operation');
  if (operation === 'create') {
    const envelope = { ok: true, operation, result: await create(input, deps) };
    encodeControl(envelope);
    return envelope;
  }
  exact(
    input,
    [...COMMON, ...SCHEMAS[operation]],
    operation === 'receipt'
      ? ['agentHandle', 'completionBasis', 'currentPlan']
      : operation === 'seal-delivery'
        ? ['renewedGates']
        : operation === 'authorize-execution'
          ? ['returnBranch', 'planContinuation']
          : operation === 'retain-evidence'
            ? ['content', 'source']
            : [],
  );
  const mutation = !['validate', 'verify-terminal', 'verify-continuation'].includes(operation);
  const context = await load(input, deps, mutation);
  let lock;
  const lockPath = path.join(context.run, '.operation.lock');
  if (mutation) {
    await runtimeGuard(context.request, deps, true, lockPath);
    try {
      lock = await open(lockPath, WRITE, 0o600);
    } catch (error) {
      if (error.code === 'EEXIST')
        fail('LOCKED', 'run has an active or interrupted operation; reconcile without replay');
      throw error;
    }
  }
  try {
    // Reload mutable associations under the operation lock; request and source stay immutable.
    const current = mutation ? await load(input, deps, true) : context;
    const envelope = { ok: true, operation, result: await operate(operation, input, current) };
    encodeControl(envelope);
    return envelope;
  } finally {
    if (lock) {
      const held = await lock.stat();
      const named = await lstat(lockPath);
      await lock.close();
      if (!named.isFile() || held.dev !== named.dev || held.ino !== named.ino)
        fail('UNSAFE_PATH', 'operation lock identity changed; retain state for reconciliation');
      await runtimeGuard(context.request, deps, true, lockPath);
      await unlink(lockPath);
    }
  }
}
export function errorEnvelope(operation, error) {
  return {
    ok: false,
    operation: BUILD_RUN_OPERATIONS.includes(operation) ? operation : null,
    error: {
      code: error instanceof BuildRunError ? error.code : 'IO_ERROR',
      message:
        error instanceof BuildRunError
          ? error.message
          : 'build-run I/O failed; retain artifacts for reconciliation',
    },
  };
}
export function exitCodeFor(envelope) {
  return envelope.ok
    ? 0
    : ['INVALID_OPERATION', 'INVALID_PAYLOAD', 'TOO_LARGE'].includes(envelope.error.code)
      ? 2
      : 1;
}
