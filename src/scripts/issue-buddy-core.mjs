// Deterministic Issue Buddy pass protocol. Forge reads use the tracker; the injected runner
// executes Git only here. All persisted authorization is scoped to the primary runtime root.
import { createHash, randomUUID } from 'node:crypto';
import * as filesystem from 'node:fs/promises';
import { hostname } from 'node:os';
import { createServer } from 'node:net';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { executeOperation as trackerOperation } from './remote-tracker-core.mjs';
import { ledgerRepository } from './remote-tracker-ledger-core.mjs';
import { planBranchName, parsePlanBranch, parseIssueHeader } from './plan-publication-core.mjs';

export const ISSUE_BUDDY_OPERATIONS = Object.freeze([
  'pass-lock-acquire',
  'pass-lock-release',
  'pass-collect',
  'verdict-record',
  'pass-report',
  'fingerprint',
]);
export const SKIP_REASONS = Object.freeze([
  'untrusted-author',
  'lifecycle-label',
  'plan-issue-comment',
  'open-pull-request',
  'plan-on-base',
  'plan-branch-exists',
  'closed-without-merge',
  'failed-exhausted',
  'unchanged-not-ready',
  'already-published',
  'unchanged-would-publish',
]);
const VERDICTS = ['not-ready', 'would-publish', 'published', 'failed'];
const FINGERPRINT = /^ibfp1:sha256:[a-f0-9]{64}$/;
const PASS_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const REPOSITORY = /^[a-z0-9.-]+\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/;
const NAME = /^[a-z][a-z0-9-]{0,47}$/;
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const LIFECYCLE = [
  'effective-flow-issue-in-progress',
  'effective-flow-issue-done',
  'firmo-issue-done',
];
const NEEDS_PLANNING = ['effective-flow-needs-planning', 'firmo-needs-planning'];
const reportKeys = [
  'schemaVersion',
  'passId',
  'mode',
  'outcome',
  'repository',
  'startedAt',
  'finishedAt',
  'limits',
  'cutOff',
  'counts',
  'verdicts',
  'pullRequestsOpened',
  'pullRequestsRecovered',
  'failures',
  'orphanBranches',
  'issueClosedPlanPrOpen',
  'cacheDegradation',
];
export class IssueBuddyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'IssueBuddyError';
    this.code = code;
    this.details = details;
  }
}
function fail(code, message, details) {
  throw new IssueBuddyError(code, message, details);
}
function invalid(message) {
  fail('INVALID_PAYLOAD', message);
}
function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value, required, optional = []) {
  if (
    !object(value) ||
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => ![...required, ...optional].includes(key))
  )
    invalid('unexpected or missing object keys');
}
function positive(value) {
  if (!Number.isSafeInteger(value) || value < 1) invalid('expected a positive safe integer');
  return value;
}
function text(value) {
  if (typeof value !== 'string') invalid('expected a string');
  return value;
}
function enumeration(value, values) {
  if (!values.includes(value)) invalid('unsupported enum value');
  return value;
}
function match(value, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) invalid('invalid identifier');
  return value;
}
function timestamp(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    invalid('invalid UTC timestamp');
  if (new Date(value).toISOString() !== (value.includes('.') ? value : value.replace('Z', '.000Z')))
    invalid('invalid UTC calendar timestamp');
  return value;
}
function login(value) {
  return typeof value === 'string' &&
    /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(value) &&
    !value.includes('--')
    ? value.toLowerCase()
    : null;
}
function requiredLogin(value) {
  const result = login(value);
  if (!result) invalid('invalid issue author');
  return result;
}
function lf(value) {
  return text(value).replace(/\r\n?/g, '\n');
}
export function sanitizeReason(value) {
  return text(value)
    .replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029]/g, ' ')
    .slice(0, 200);
}
function validateReason(value) {
  if (sanitizeReason(value) !== value) invalid('reason must be a sanitized single line');
}
function limits(value = {}) {
  exact(value, [], ['judgments', 'plans']);
  return { judgments: positive(value.judgments ?? 3), plans: positive(value.plans ?? 1) };
}
function safePath(value) {
  text(value);
  if (
    !value ||
    path.isAbsolute(value) ||
    value.includes('\\') ||
    value.split('/').some((part) => !part || part === '.' || part === '..') ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    invalid('unsafe relative path');
  return value;
}
function safeRef(value) {
  text(value);
  if (
    !value ||
    value.startsWith('-') ||
    /[\s~^:?*\[\\\x00-\x1f\x7f]/.test(value) ||
    value.includes('..') ||
    value.includes('@{') ||
    value.includes('//') ||
    value
      .split('/')
      .some(
        (part) => !part || part.startsWith('.') || part.endsWith('.') || part.endsWith('.lock'),
      ) ||
    value === '@'
  )
    invalid('unsafe branch ref');
  return value;
}
function baseBranch(value) {
  text(value);
  return safeRef(value.replace(/^refs\/heads\//, '').replace(/^origin\//, ''));
}
function mode(value) {
  return enumeration(value, ['dry-run', 'publish']);
}
function repositoryVisibility(value = 'unknown') {
  return enumeration(value, ['public', 'private', 'unknown']);
}
function leftoverPlanFiles(value = [], planDir, { deduplicate = false } = {}) {
  if (!Array.isArray(value)) invalid('leftoverPlanFiles must be an array');
  const entries = new Map();
  for (const entry of value) {
    exact(entry, ['issue', 'path', 'action']);
    positive(entry.issue);
    safePath(entry.path);
    enumeration(entry.action, ['remove']);
    const filename = path.posix
      .basename(entry.path)
      .match(/^\d{4}-\d{2}-\d{2}-issue-([1-9]\d*)-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.md$/);
    if (
      !filename ||
      Number(filename[1]) !== entry.issue ||
      (planDir !== undefined && path.posix.dirname(entry.path) !== planDir)
    )
      invalid('leftover path does not match its plan directory and issue');
    const previous = entries.get(entry.path);
    if (previous && (!deduplicate || !same(previous, entry)))
      invalid('duplicate or conflicting leftover path');
    entries.set(entry.path, { issue: entry.issue, path: entry.path, action: entry.action });
  }
  return [...entries.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
function reportVersion(value = 1) {
  return enumeration(value, [1, 2]);
}
function same(a, b) {
  return isDeepStrictEqual(a, b);
}
function hash(value) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}
function trustedText(value) {
  exact(value, ['schemaVersion', 'issue', 'title', 'body', 'comments']);
  if (value.schemaVersion !== 1 || !Array.isArray(value.comments)) invalid('invalid trusted text');
  positive(value.issue);
  text(value.title);
  text(value.body);
  const seen = new Set();
  for (const comment of value.comments) {
    exact(comment, ['id', 'author', 'body']);
    positive(comment.id);
    requiredLogin(comment.author);
    text(comment.body);
    if (seen.has(comment.id)) invalid('duplicate comment id');
    seen.add(comment.id);
  }
  return value;
}
// ibfp1 uses UTF-8 JSON with keys title, body, comments, authors in that order. Comments
// sort by numeric id and use id, author, body; unique lowercase authors sort lexically.
// Only line endings and login case normalize. Issue number, labels and time never enter it.
export function fingerprint(value, issueAuthor) {
  trustedText(value);
  const comments = value.comments
    .map((comment) => ({
      id: comment.id,
      author: requiredLogin(comment.author),
      body: lf(comment.body),
    }))
    .sort((a, b) => a.id - b.id);
  const authors = [
    ...new Set([requiredLogin(issueAuthor), ...comments.map((comment) => comment.author)]),
  ].sort();
  return `ibfp1:sha256:${hash({ title: lf(value.title), body: lf(value.body), comments, authors })}`;
}
export function stableAttemptId(passId, issue) {
  return JSON.stringify([match(passId, PASS_ID), positive(issue)]);
}
function attemptIdentity(id, issue, fp, currentPass) {
  let tuple;
  try {
    tuple = JSON.parse(id);
  } catch {
    invalid('invalid stable attempt id');
  }
  if (
    !Array.isArray(tuple) ||
    tuple.length !== 2 ||
    tuple[1] !== issue ||
    stableAttemptId(tuple[0], tuple[1]) !== id ||
    (currentPass && tuple[0] !== currentPass)
  )
    invalid('stable attempt identity mismatch');
  return { passId: tuple[0], issue: positive(issue), fingerprint: match(fp, FINGERPRINT) };
}
function validateInput(operation, input) {
  const fields = {
    'pass-lock-acquire': [[], []],
    'pass-lock-release': [['passId'], []],
    'pass-collect': [
      ['passId', 'mode', 'baseBranch', 'planDir', 'branchPrefix', 'visibility'],
      ['limits', 'staleAttempts', 'repositoryVisibility', 'leftoverPlanFiles'],
    ],
    'verdict-record': [
      ['passId', 'issue', 'fingerprint', 'verdict', 'mode', 'reason'],
      ['pullRequest', 'stableAttemptId', 'headRef'],
    ],
    'pass-report': [
      [
        'passId',
        'outcome',
        'cutOff',
        'verdicts',
        'pullRequestsOpened',
        'pullRequestsRecovered',
        'failures',
      ],
      [
        'collect',
        'mode',
        'limits',
        'counts',
        'reportVersion',
        'repositoryVisibility',
        'leftoverPlanFiles',
      ],
    ],
    fingerprint: [['trustedTextPath', 'issueAuthor'], []],
  }[operation];
  if (!fields) invalid('unknown operation');
  exact(input, ['cwd', ...fields[0]], fields[1]);
  if (!path.isAbsolute(text(input.cwd))) invalid('cwd must be absolute');
  if (input.passId !== undefined) match(input.passId, PASS_ID);
  if (input.mode !== undefined) mode(input.mode);
  if (input.limits !== undefined) limits(input.limits);
  if (operation === 'pass-collect') {
    baseBranch(input.baseBranch);
    safePath(input.planDir);
    text(input.branchPrefix);
    try {
      safeRef(planBranchName({ branchPrefix: input.branchPrefix, issue: 1 }));
    } catch {
      invalid('invalid plan branch prefix');
    }
    repositoryVisibility(input.repositoryVisibility);
    leftoverPlanFiles(input.leftoverPlanFiles, input.planDir);
    if (input.visibility !== 'standard') invalid('Issue Buddy requires standard visibility');
    if (input.staleAttempts !== undefined && !Array.isArray(input.staleAttempts))
      invalid('staleAttempts must be an array');
    for (const attempt of input.staleAttempts ?? []) {
      exact(attempt, ['issue', 'originalFingerprint', 'stableAttemptId']);
      attemptIdentity(attempt.stableAttemptId, attempt.issue, attempt.originalFingerprint);
    }
  }
  if (operation === 'verdict-record') {
    positive(input.issue);
    match(input.fingerprint, FINGERPRINT);
    enumeration(input.verdict, VERDICTS);
    text(input.reason);
    if (input.pullRequest !== undefined) {
      exact(input.pullRequest, ['number', 'url']);
      positive(input.pullRequest.number);
      text(input.pullRequest.url);
    }
    if (input.stableAttemptId !== undefined)
      attemptIdentity(input.stableAttemptId, input.issue, input.fingerprint, input.passId);
    if (input.headRef !== undefined) safeRef(input.headRef);
    if (
      (input.verdict === 'published' && input.mode !== 'publish') ||
      (input.verdict === 'would-publish' && input.mode !== 'dry-run') ||
      (input.verdict === 'published') !== (input.pullRequest !== undefined)
    )
      invalid('verdict and publication mode mismatch');
  }
  if (operation === 'pass-report') {
    const version = reportVersion(input.reportVersion);
    if (
      version === 1 &&
      (input.repositoryVisibility !== undefined || input.leftoverPlanFiles !== undefined)
    )
      invalid('report metadata requires version 2');
    if (version === 2) {
      repositoryVisibility(input.repositoryVisibility);
      leftoverPlanFiles(input.leftoverPlanFiles, undefined, { deduplicate: true });
    }
    enumeration(input.outcome, ['completed', 'failed']);
    enumeration(input.cutOff, ['none', 'judgment-limit', 'publish-limit']);
    for (const field of ['verdicts', 'pullRequestsOpened', 'pullRequestsRecovered', 'failures'])
      if (!Array.isArray(input[field])) invalid('invalid outcome array');
    for (const entry of input.verdicts) {
      exact(entry, ['issue', 'verdict', 'reason']);
      positive(entry.issue);
      enumeration(entry.verdict, VERDICTS);
      validateReason(entry.reason);
    }
    for (const entry of [...input.pullRequestsOpened, ...input.pullRequestsRecovered]) {
      exact(entry, ['issue', 'number', 'headRef', 'url']);
      positive(entry.issue);
      positive(entry.number);
      safeRef(entry.headRef);
      text(entry.url);
    }
    for (const entry of input.failures) {
      exact(entry, ['issue', 'stage', 'code']);
      if (entry.issue !== null) positive(entry.issue);
      match(entry.stage, NAME);
      match(entry.code, CODE);
    }
    if (input.collect !== undefined && !object(input.collect)) invalid('invalid collection');
    if (input.counts !== undefined && !object(input.counts)) invalid('invalid counts');
  }
  if (operation === 'fingerprint') {
    requiredLogin(input.issueAuthor);
    text(input.trustedTextPath);
  }
}

async function git(context, args, code = 'UNSAFE_RUNTIME_STATE') {
  const result = await context.runner({
    executable: 'git',
    args,
    cwd: context.root,
    timeoutMs: 60000,
    processGroup: true,
  });
  if (!result || result.error || result.status !== 0) fail(code, 'Git read failed');
  return String(result.stdout ?? '').trim();
}
async function contextFor(input, options) {
  const fs = options.fs ?? filesystem;
  const root = await fs.realpath(input.cwd);
  const context = {
    root,
    fs,
    runner: options.runner,
    createServer: options.createServer ?? createServer,
    now: () => new Date((options.clock ?? (() => new Date()))()).toISOString(),
  };
  if (typeof context.runner !== 'function') invalid('an injected runner is required');
  try {
    const top = await fs.realpath(await git(context, ['rev-parse', '--show-toplevel']));
    const common = await fs.realpath(
      await git(context, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
    );
    const own = await fs.realpath(
      await git(context, ['rev-parse', '--path-format=absolute', '--git-dir']),
    );
    // A linked checkout must never allocate a second runtime-state namespace.
    if (top !== root || common !== own || path.dirname(common) !== root)
      fail('UNSAFE_RUNTIME_STATE', 'cwd must be the primary repository runtime root');
    context.identity = common;
  } catch (error) {
    if (error instanceof IssueBuddyError) throw error;
    fail('UNSAFE_RUNTIME_STATE', 'invalid runtime root');
  }
  context.directory = path.join(root, '.effective-flow', 'issue-buddy');
  return context;
}
async function guard(context, target, { directory = false } = {}) {
  const relative = path.relative(context.root, target);
  if (
    (relative !== '.effective-flow' && !relative.startsWith('.effective-flow' + path.sep)) ||
    relative.split(path.sep).includes('..')
  )
    fail('UNSAFE_RUNTIME_STATE', 'runtime target escapes root');
  if ((await git(context, ['ls-files', '--', '.effective-flow/'])) !== '')
    fail('UNSAFE_RUNTIME_STATE', 'runtime state is tracked');
  await git(context, ['check-ignore', '--no-index', '-q', '--', '.effective-flow/config.json']);
  await git(context, [
    'check-ignore',
    '--no-index',
    '-q',
    '--',
    directory ? `${relative}/` : relative,
  ]);
  let current = context.root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      if ((await context.fs.lstat(current)).isSymbolicLink())
        fail('UNSAFE_RUNTIME_STATE', 'symlink in runtime state');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}
async function mkdir(context, target) {
  await guard(context, target, { directory: true });
  const missing = [];
  let current = target;
  while (current !== context.root) {
    try {
      if (!(await context.fs.lstat(current)).isDirectory())
        fail('UNSAFE_RUNTIME_STATE', 'runtime parent is not a directory');
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    missing.unshift(current);
    current = path.dirname(current);
  }
  // Check each concrete directory, with a trailing slash for Git's directory-only ignore
  // rules, immediately before creating it. A child ignore rule cannot authorize its parent.
  for (const directory of missing) {
    await guard(context, directory, { directory: true });
    try {
      await context.fs.mkdir(directory, { mode: 0o700 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      await guard(context, directory, { directory: true });
      if (!(await context.fs.lstat(directory)).isDirectory())
        fail('UNSAFE_RUNTIME_STATE', 'runtime parent is not a directory');
    }
  }
}
async function readJson(context, target) {
  await guard(context, target);
  try {
    return JSON.parse(await context.fs.readFile(target, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}
async function atomic(context, target, value, { createOnly = false } = {}) {
  const bytes = typeof value === 'string' ? value : `${JSON.stringify(value)}\n`;
  await mkdir(context, path.dirname(target));
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    await guard(context, temp);
    await context.fs.writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
    await guard(context, target);
    await guard(context, temp);
    // Initial pass publication is create-only and exposes fully written holder metadata.
    if (createOnly) await context.fs.link(temp, target);
    else await context.fs.rename(temp, target);
  } finally {
    await guard(context, temp);
    await context.fs.unlink(temp).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
async function rejectLegacyLocks(context, directory = context.directory) {
  await guard(context, directory, { directory: true });
  let entries;
  try {
    entries = await context.fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    await guard(context, target, { directory: entry.isDirectory() });
    if (entry.name.endsWith('.lock') && target !== lockPath(context))
      fail('LOCKED', 'legacy runtime lock requires operator inspection; it was not removed', {
        path: path.relative(context.root, target),
      });
    if (entry.isDirectory()) await rejectLegacyLocks(context, target);
  }
}
async function holderDetails(context) {
  try {
    const lock = await readJson(context, lockPath(context));
    match(lock?.passId, PASS_ID);
    timestamp(lock.acquiredAt);
    positive(lock.pid);
    if (!text(lock.hostname).trim()) invalid('invalid holder hostname');
    const ageMs = Math.max(0, Date.parse(context.now()) - Date.parse(lock.acquiredAt));
    return { passId: lock.passId, ageMs, stale: ageMs > 7200000 };
  } catch {
    // An occupied port identifies no holder. Only a valid durable pass record does.
    return {};
  }
}
// Kernel ownership spans the complete read/check/write/cleanup operation. All state-sharing
// callers must use the same host/network namespace. Hash collisions deny access, never grant it.
// The physical common Git directory is immutable across cwd, worktree and origin URL changes.
async function withMutationLock(context, action) {
  const port =
    49152 + (createHash('sha256').update(context.identity).digest().readUInt32BE(0) % 16384);
  let server;
  try {
    server = context.createServer((socket) => socket.destroy());
    await new Promise((resolve, reject) => {
      const failed = (error) => {
        server.removeListener('listening', listening);
        reject(error);
      };
      const listening = () => {
        server.removeListener('error', failed);
        resolve();
      };
      server.once('error', failed);
      server.once('listening', listening);
      server.listen({ host: '127.0.0.1', port, exclusive: true });
    });
  } catch (error) {
    if (error.code === 'EADDRINUSE')
      fail(
        'LOCKED',
        'operation endpoint is occupied; retry after the active operation or local listener exits',
        await holderDetails(context),
      );
    fail(
      'UNSAFE_RUNTIME_STATE',
      'cannot bind the loopback TCP operation mutex; allow local-listen permission in the sandbox and use a shared host/network namespace',
    );
  }
  try {
    await rejectLegacyLocks(context);
    return await action();
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
function lockPath(context) {
  return path.join(context.directory, 'pass.lock');
}
async function readLock(context, passId) {
  let lock;
  try {
    lock = await readJson(context, lockPath(context));
  } catch {
    fail('LOCKED', 'pass lock is unreadable');
  }
  if (!lock || lock.passId !== passId) fail('LOCKED', 'pass lock does not hold this passId');
  return lock;
}
async function acquire(context) {
  const target = lockPath(context);
  await mkdir(context, context.directory);
  await guard(context, target);
  const lock = {
    passId: randomUUID(),
    acquiredAt: context.now(),
    pid: process.pid,
    hostname: hostname(),
  };
  try {
    await atomic(context, target, lock, { createOnly: true });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let existing;
    try {
      existing = await readJson(context, target);
    } catch {
      fail('LOCKED', 'pass lock is unreadable');
    }
    try {
      timestamp(existing?.acquiredAt);
    } catch {
      fail('LOCKED', 'pass lock has an invalid acquiredAt timestamp', { passId: existing?.passId });
    }
    try {
      match(existing.passId, PASS_ID);
      positive(existing.pid);
      if (!text(existing.hostname).trim()) invalid('invalid holder hostname');
    } catch {
      fail('LOCKED', 'pass lock has invalid holder metadata');
    }
    const ageMs = Math.max(0, Date.parse(context.now()) - Date.parse(existing.acquiredAt));
    fail('LOCKED', 'pass lock is held', {
      passId: existing.passId,
      ageMs,
      stale: Number.isFinite(ageMs) && ageMs > 7200000,
    });
  }
  return { passId: lock.passId };
}
function emptyCache(repository) {
  return { schemaVersion: 1, repository, records: {}, attempts: {}, closedPlanPrObservations: {} };
}
function validateCache(value) {
  exact(value, ['schemaVersion', 'repository', 'records', 'attempts', 'closedPlanPrObservations']);
  if (value.schemaVersion !== 1) invalid('cache schema version');
  match(value.repository, REPOSITORY);
  for (const field of ['records', 'attempts', 'closedPlanPrObservations'])
    if (!object(value[field])) invalid('invalid cache map');
  for (const [key, record] of Object.entries(value.records)) {
    exact(
      record,
      [
        'issue',
        'fingerprint',
        'verdict',
        'mode',
        'reason',
        'retryCount',
        'recordedPassId',
        'recordedAt',
      ],
      ['pullRequest'],
    );
    if (String(positive(record.issue)) !== key) invalid('cache issue identity');
    match(record.fingerprint, FINGERPRINT);
    enumeration(record.verdict, [...VERDICTS, 'closed-without-merge']);
    mode(record.mode);
    validateReason(record.reason);
    if (!Number.isSafeInteger(record.retryCount) || record.retryCount < 0 || record.retryCount > 1)
      invalid('invalid retry count');
    match(record.recordedPassId, PASS_ID);
    timestamp(record.recordedAt);
    if ((record.verdict === 'published') !== (record.pullRequest !== undefined))
      invalid('cache publication identity');
    if (record.pullRequest !== undefined) positive(record.pullRequest);
  }
  for (const [id, identity] of Object.entries(value.attempts)) {
    exact(identity, ['passId', 'issue', 'fingerprint']);
    if (!same(identity, attemptIdentity(id, identity.issue, identity.fingerprint)))
      invalid('cache attempt identity');
  }
  for (const [issue, observations] of Object.entries(value.closedPlanPrObservations)) {
    if (String(positive(Number(issue))) !== issue || !object(observations))
      invalid('invalid observation');
    for (const [number, fp] of Object.entries(observations)) {
      if (String(positive(Number(number))) !== number) invalid('invalid PR identity');
      match(fp, FINGERPRINT);
    }
  }
}
async function loadCache(context, repository) {
  const target = path.join(context.directory, 'verdicts.json');
  try {
    const value = await readJson(context, target);
    if (value === undefined) return { value: emptyCache(repository), degradation: null };
    validateCache(value);
    if (value.repository !== repository)
      return { value: emptyCache(repository), degradation: { code: 'CACHE_REPOSITORY_MISMATCH' } };
    return { value, degradation: null };
  } catch (error) {
    if (error.code === 'UNSAFE_RUNTIME_STATE') throw error;
    return { value: emptyCache(repository), degradation: { code: 'CACHE_CORRUPT' } };
  }
}
async function saveCache(context, cache, degradation) {
  if (degradation) fail(degradation.code, 'degraded cache is preserved');
  await atomic(context, path.join(context.directory, 'verdicts.json'), cache);
}
function transition(
  cache,
  { issue, fingerprint: fp, verdict, mode: currentMode, reason, passId, pullRequest },
  now,
) {
  const previous = cache.records[issue];
  const retryCount =
    verdict === 'failed' && previous?.fingerprint === fp && previous.verdict === 'failed'
      ? previous.retryCount + 1
      : 0;
  if (retryCount > 1) invalid('failure retry budget exhausted');
  return {
    issue,
    fingerprint: fp,
    verdict,
    mode: currentMode,
    reason: sanitizeReason(reason),
    retryCount,
    recordedPassId: passId,
    recordedAt: now,
    ...(pullRequest ? { pullRequest: pullRequest.number } : {}),
  };
}
async function remote(context, operation, input = {}, repository) {
  // Resolve the explicit origin through the tracker without its optional Forgejo-login probe.
  // An unknown/non-GitHub provider is refused before any provider executable is consulted.
  const resolvedInput =
    operation === 'repository-resolve'
      ? { remote: await git(context, ['remote', 'get-url', 'origin']), ...input }
      : input;
  const envelope = await trackerOperation(
    operation,
    { cwd: context.root, ...resolvedInput, ...(repository ? { repository } : {}) },
    { runner: context.runner },
  );
  if (!envelope.ok)
    fail(
      operation === 'repository-resolve' && envelope.error.code === 'AMBIGUOUS_HOST'
        ? 'UNSUPPORTED_PROVIDER'
        : 'FORGE_READ_FAILED',
      'forge read failed',
      { trackerCode: envelope.error.code },
    );
  return operation === 'repository-resolve' ? envelope.data : envelope.data.result;
}
function array(value) {
  if (!Array.isArray(value)) fail('FORGE_READ_FAILED', 'incomplete forge list');
  return value;
}
function validOrdering(issue) {
  try {
    positive(issue.number);
    timestamp(issue.createdAt);
    timestamp(issue.updatedAt);
    text(issue.title);
    text(issue.body);
  } catch {
    fail('FORGE_READ_FAILED', 'invalid issue identity or ordering metadata');
  }
}
function prReference(pr, issue, repository, headRef) {
  if (pr.head === headRef) return true;
  const escaped = `${repository.owner}/${repository.repository}`.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
  const content = `${pr.title}\n${pr.body}`;
  return new RegExp(
    `(?:^|[^a-zA-Z0-9_/#])#${issue}(?![a-zA-Z0-9_])|(?:^|[^a-zA-Z0-9_/-])${escaped}#${issue}(?![a-zA-Z0-9_])|https://${repository.host}/${escaped}/issues/${issue}(?![a-zA-Z0-9_])`,
    'i',
  ).test(content);
}
function prIdentity(pr, issue, headRef, repository) {
  positive(pr.number);
  safeRef(headRef);
  validatePrUrl(pr.url, repository, pr.number);
  return { issue, number: pr.number, headRef, url: pr.url };
}
function validatePrUrl(value, repository, number) {
  const expected =
    typeof repository === 'string'
      ? repository.split('/')
      : [repository.host, repository.owner, repository.repository];
  let url;
  try {
    url = new URL(value);
  } catch {
    invalid('invalid pull request URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.host.toLowerCase() !== expected[0].toLowerCase() ||
    url.pathname.toLowerCase() !== `/${expected[1]}/${expected[2]}/pull/${number}`.toLowerCase()
  )
    invalid('pull request URL belongs to another repository');
}
function cacheSkip(cache, issue, fp, currentMode) {
  const record = cache.records[issue];
  if (record?.fingerprint !== fp) return null;
  if (record.verdict === 'failed' && record.retryCount >= 1) return 'failed-exhausted';
  if (record.verdict === 'not-ready') return 'unchanged-not-ready';
  if (record.verdict === 'published') return 'already-published';
  if (record.verdict === 'would-publish' && currentMode === 'dry-run')
    return 'unchanged-would-publish';
  return null;
}
async function scanBase(context, oid, planDir) {
  const output = await git(context, ['ls-tree', '-rz', oid, '--', planDir], 'FETCH_FAILED');
  const issues = new Set();
  for (const entry of output.split('\0').filter(Boolean)) {
    const match = entry.match(/^(\d+) blob ([a-f0-9]+)\t(.+)$/s);
    if (!match || !['100644', '100755'].includes(match[1])) continue;
    const relative = path.posix.relative(planDir, match[3]);
    if (!/^(?:archive\/)?[^/]+\.md$/.test(relative)) continue;
    const contents = await git(context, ['cat-file', 'blob', match[2]], 'FETCH_FAILED');
    let header;
    try {
      header = parseIssueHeader(contents);
    } catch {
      fail('FORGE_READ_FAILED', 'malformed plan identity');
    }
    const filename = path.posix
      .basename(relative)
      .match(/^\d{4}-\d{2}-\d{2}-issue-([1-9]\d*)-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.md$/);
    const fallback = filename ? Number(filename[1]) : null;
    if (header !== null && fallback !== null && header !== fallback)
      fail('FORGE_READ_FAILED', 'conflicting plan identity');
    if (header !== null || fallback !== null) issues.add(positive(header ?? fallback));
  }
  return issues;
}
async function currentReads(context, input, repository) {
  const branch = baseBranch(input.baseBranch);
  await git(
    context,
    [
      'check-ref-format',
      '--branch',
      planBranchName({ branchPrefix: input.branchPrefix, issue: 1 }),
    ],
    'INVALID_PAYLOAD',
  );
  await git(
    context,
    ['fetch', '--no-tags', 'origin', `refs/heads/${branch}:refs/remotes/origin/${branch}`],
    'FETCH_FAILED',
  );
  const oid = await git(
    context,
    ['rev-parse', '--verify', `refs/remotes/origin/${branch}^{commit}`],
    'FETCH_FAILED',
  );
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid))
    fail('FETCH_FAILED', 'missing fetched base commit');
  const plans = await scanBase(context, oid, input.planDir);
  const listing = await git(
    context,
    [
      'ls-remote',
      '--heads',
      'origin',
      `refs/heads/${planBranchName({ branchPrefix: input.branchPrefix, issue: 1 }).replace(/1$/, '')}*`,
    ],
    'FETCH_FAILED',
  );
  const branches = new Set();
  for (const line of listing.split('\n').filter(Boolean)) {
    const found = line.match(/^[a-f0-9]{40,64}\s+refs\/heads\/(.+)$/);
    const parsed = found && parsePlanBranch(found[1]);
    if (parsed && parsed.branchPrefix === input.branchPrefix) branches.add(found[1]);
  }
  const issues = array(await remote(context, 'issue-list', { state: 'open' }, repository));
  const pulls = array(await remote(context, 'pr-list', { state: 'open' }, repository));
  for (const pr of pulls) {
    try {
      positive(pr.number);
      text(pr.title);
      text(pr.body);
      safeRef(pr.head);
      enumeration(pr.state, ['open']);
    } catch {
      fail('FORGE_READ_FAILED', 'incomplete pull request listing');
    }
  }
  const permissions = new Map();
  async function trusted(author) {
    const name = login(author?.login);
    if (!name) return false;
    if (!permissions.has(name)) {
      let allowed = false;
      try {
        const permission = await remote(
          context,
          'collaborator-permission-read',
          { login: name },
          repository,
        );
        allowed = ['write', 'admin'].includes(permission.permission);
      } catch {
        /* Unknown permission never grants trust. */
      }
      permissions.set(name, allowed);
    }
    return permissions.get(name);
  }
  const candidates = [];
  const numbers = new Set();
  for (const issue of issues) {
    positive(issue.number);
    if (numbers.has(issue.number) || issue.state !== 'open')
      fail('FORGE_READ_FAILED', 'incomplete issue listing');
    numbers.add(issue.number);
    if (!(await trusted(issue.author))) {
      candidates.push({ issue: issue.number, skip: 'untrusted-author' });
      continue;
    }
    validOrdering(issue);
    const comments = [];
    for (const comment of array(
      await remote(context, 'issue-comments-read', { number: issue.number }, repository),
    )) {
      if (await trusted(comment.author))
        comments.push({
          id: positive(comment.id),
          author: requiredLogin(comment.author.login),
          body: text(comment.body),
        });
    }
    const value = {
      schemaVersion: 1,
      issue: issue.number,
      title: issue.title,
      body: issue.body,
      comments,
    };
    let fp;
    try {
      fp = fingerprint(value, issue.author.login);
    } catch {
      fail('FORGE_READ_FAILED', 'invalid trusted comments');
    }
    const headRef = planBranchName({ branchPrefix: input.branchPrefix, issue: issue.number });
    const candidate = {
      issue: issue.number,
      fingerprint: fp,
      issueAuthor: requiredLogin(issue.author.login),
      headRef,
      text: value,
      updatedAt: issue.updatedAt,
      priority: issue.labels.some((label) => NEEDS_PLANNING.includes(label)),
      history: [],
    };
    const matching = pulls.filter(
      (pr) => pr.state === 'open' && prReference(pr, issue.number, repository, headRef),
    );
    if (issue.labels.some((label) => LIFECYCLE.includes(label))) candidate.skip = 'lifecycle-label';
    else if (
      comments.some((comment) => comment.body.startsWith('<!-- effective-flow-plan-issues -->'))
    )
      candidate.skip = 'plan-issue-comment';
    else if (matching.length) {
      candidate.skip = 'open-pull-request';
      candidate.ownedPulls = plans.has(issue.number)
        ? []
        : matching.filter((pr) => pr.head === headRef && pr.sameRepository === true);
    } else if (plans.has(issue.number)) candidate.skip = 'plan-on-base';
    else {
      candidate.history = array(
        await remote(
          context,
          'pr-list',
          { state: 'all', head: `${repository.owner}:${headRef}` },
          repository,
        ),
      );
      const historicalNumbers = new Set();
      for (const pr of candidate.history) {
        try {
          positive(pr.number);
          enumeration(pr.state, ['open', 'closed']);
          safeRef(pr.head);
          if (
            pr.head !== headRef ||
            typeof pr.headRepository !== 'string' ||
            pr.headRepository.split('/')[0].toLowerCase() !== repository.owner.toLowerCase() ||
            historicalNumbers.has(pr.number)
          )
            invalid('invalid historical PR identity');
          historicalNumbers.add(pr.number);
        } catch {
          fail('FORGE_READ_FAILED', 'incomplete historical pull request classification');
        }
      }
      if (branches.has(headRef)) {
        candidate.skip = 'plan-branch-exists';
        candidate.orphan = candidate.history.length === 0;
      }
    }
    candidates.push(candidate);
  }
  const closedIssuePulls = [];
  for (const pr of pulls) {
    const parsed = parsePlanBranch(pr.head);
    if (
      parsed?.branchPrefix === input.branchPrefix &&
      !numbers.has(parsed.issue) &&
      pr.sameRepository === true
    )
      closedIssuePulls.push(prIdentity(pr, parsed.issue, pr.head, repository));
  }
  return { oid, candidates, closedIssuePulls };
}
async function clearTrusted(context) {
  const directory = path.join(context.directory, 'trusted');
  await guard(context, path.join(directory, '.guard'));
  let entries;
  try {
    entries = await context.fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (!/^issue-[1-9]\d*\.json$/.test(entry.name)) continue;
    const target = path.join(directory, entry.name);
    await guard(context, target);
    if (!entry.isFile()) fail('UNSAFE_RUNTIME_STATE', 'trusted text is not a regular file');
    await context.fs.unlink(target);
  }
}
async function collect(context, input, lock) {
  const request = {
    mode: input.mode,
    baseBranch: input.baseBranch,
    planDir: input.planDir,
    branchPrefix: input.branchPrefix,
    visibility: input.visibility,
    limits: limits(input.limits),
    staleAttempts: input.staleAttempts ?? [],
    repositoryVisibility: repositoryVisibility(input.repositoryVisibility),
    leftoverPlanFiles: leftoverPlanFiles(input.leftoverPlanFiles, input.planDir),
  };
  const requestDigest = hash(request);
  if (lock.collection) {
    if (lock.collection.requestDigest !== requestDigest) invalid('conflicting collection replay');
    if (lock.collection.status === 'collecting') {
      lock.collection.status = 'failed';
      lock.collection.failure = { code: 'UNSAFE_RUNTIME_STATE' };
      await atomic(context, lockPath(context), lock);
    }
    if (lock.collection.status === 'failed')
      fail(lock.collection.failure.code, 'previous collection failed');
    return lock.collection.result;
  }
  // Persist an intent before reads/accounting. A killed or failed final handoff can never
  // replay into current authority merely because its final pass-record replacement failed.
  lock.collection = {
    status: 'collecting',
    requestDigest,
    planDir: request.planDir,
    repositoryVisibility: request.repositoryVisibility,
    leftoverPlanFiles: request.leftoverPlanFiles,
    mode: input.mode,
    limits: request.limits,
    repository: null,
  };
  await atomic(context, lockPath(context), lock);
  let repository;
  try {
    repository = await remote(context, 'repository-resolve');
    if (repository.provider !== 'github')
      fail('UNSUPPORTED_PROVIDER', 'Issue Buddy supports GitHub only');
    const repositoryKey = ledgerRepository(repository);
    const cache = await loadCache(context, repositoryKey);
    const before = JSON.stringify(cache.value);
    const excluded = new Set(request.leftoverPlanFiles.map((entry) => entry.issue));
    const reads = await currentReads(context, input, repository);
    // Independent closed-PR observations survive every later verdict and input reset.
    for (const candidate of reads.candidates) {
      if (candidate.skip) continue;
      const observations = cache.value.closedPlanPrObservations[candidate.issue] ?? {};
      for (const pr of candidate.history.filter((pr) => pr.state === 'closed' && !pr.mergedAt)) {
        const key = String(positive(pr.number));
        if (!observations[key]) observations[key] = candidate.fingerprint;
        if (observations[key] === candidate.fingerprint) candidate.skip = 'closed-without-merge';
      }
      if (Object.keys(observations).length)
        cache.value.closedPlanPrObservations[candidate.issue] = observations;
    }
    // Historical accounting happens only after every current read succeeds and before slicing.
    if (input.mode === 'publish')
      for (const attempt of input.staleAttempts ?? []) {
        const identity = attemptIdentity(
          attempt.stableAttemptId,
          attempt.issue,
          attempt.originalFingerprint,
        );
        if (identity.passId === input.passId)
          invalid('historical attempt must come from an earlier pass');
        const known = cache.value.attempts[attempt.stableAttemptId];
        if (known && !same(known, identity))
          invalid('attempt identity reused with different evidence');
        if (known) continue;
        const candidate = reads.candidates.find((item) => item.issue === attempt.issue);
        if (
          !candidate ||
          excluded.has(candidate.issue) ||
          candidate.skip ||
          candidate.fingerprint !== attempt.originalFingerprint ||
          cacheSkip(cache.value, candidate.issue, candidate.fingerprint, input.mode)
        )
          continue;
        cache.value.records[attempt.issue] = transition(
          cache.value,
          {
            issue: attempt.issue,
            fingerprint: attempt.originalFingerprint,
            verdict: 'failed',
            mode: 'publish',
            reason: 'Stale worktree attempt',
            passId: identity.passId,
          },
          context.now(),
        );
        cache.value.attempts[attempt.stableAttemptId] = identity;
      }
    const recovery = { orphanBranches: [], unrecordedPullRequests: [] };
    const authorizedRecovery = [];
    const skipped = [];
    const eligible = [];
    for (const candidate of reads.candidates) {
      const cachedSkip =
        candidate.fingerprint &&
        cacheSkip(cache.value, candidate.issue, candidate.fingerprint, input.mode);
      if (candidate.orphan) {
        const entry = { issue: candidate.issue, headRef: candidate.headRef };
        recovery.orphanBranches.push(entry);
        if (!excluded.has(candidate.issue) && !cachedSkip && input.mode === 'publish')
          authorizedRecovery.push({
            ...entry,
            fingerprint: candidate.fingerprint,
            issueAuthor: candidate.issueAuthor,
            kind: 'orphan-branch',
          });
      }
      for (const pr of candidate.ownedPulls ?? []) {
        const record = cache.value.records[candidate.issue];
        if (record?.verdict === 'published' && record.pullRequest === pr.number) continue;
        const entry = prIdentity(pr, candidate.issue, candidate.headRef, repository);
        recovery.unrecordedPullRequests.push(entry);
        if (!excluded.has(candidate.issue) && !cachedSkip && input.mode === 'publish')
          authorizedRecovery.push({
            ...entry,
            fingerprint: candidate.fingerprint,
            issueAuthor: candidate.issueAuthor,
            kind: 'unrecorded-pull-request',
          });
      }
      const reason = candidate.skip ?? cachedSkip;
      if (reason) skipped.push({ issue: candidate.issue, reason });
      else if (!excluded.has(candidate.issue)) eligible.push(candidate);
    }
    eligible.sort(
      (a, b) =>
        Number(b.priority) - Number(a.priority) ||
        a.updatedAt.localeCompare(b.updatedAt) ||
        a.issue - b.issue,
    );
    const selected = eligible.slice(0, request.limits.judgments);
    // Atomic accounting is durable even if the subsequent handoff persistence fails.
    if (JSON.stringify(cache.value) !== before)
      await saveCache(context, cache.value, cache.degradation);
    await clearTrusted(context);
    const slice = [];
    for (const candidate of selected) {
      const trustedTextPath = path.join(
        context.directory,
        'trusted',
        `issue-${candidate.issue}.json`,
      );
      await atomic(context, trustedTextPath, candidate.text);
      slice.push({
        issue: candidate.issue,
        fingerprint: candidate.fingerprint,
        issueAuthor: candidate.issueAuthor,
        headRef: candidate.headRef,
        trustedTextPath,
      });
    }
    const result = {
      passId: input.passId,
      mode: input.mode,
      repositoryVisibility: request.repositoryVisibility,
      leftoverPlanFiles: request.leftoverPlanFiles,
      repository: repositoryKey,
      limits: request.limits,
      baseOid: reads.oid,
      eligible: slice,
      eligibleCount: eligible.length,
      skipped,
      recovery,
      authorizedRecovery,
      issueClosedPlanPrOpen: reads.closedIssuePulls,
      cacheDegradation: cache.degradation,
    };
    lock.collection = {
      status: 'collected',
      requestDigest,
      planDir: request.planDir,
      result,
      outcomes: {},
    };
    await atomic(context, lockPath(context), lock);
    return result;
  } catch (error) {
    const failure = {
      code: error instanceof IssueBuddyError ? error.code : 'UNSAFE_RUNTIME_STATE',
    };
    lock.collection = {
      status: 'failed',
      requestDigest,
      planDir: request.planDir,
      repositoryVisibility: request.repositoryVisibility,
      leftoverPlanFiles: request.leftoverPlanFiles,
      mode: input.mode,
      limits: request.limits,
      repository: repository ? ledgerRepository(repository) : null,
      failure,
    };
    await atomic(context, lockPath(context), lock);
    if (error instanceof IssueBuddyError) throw error;
    fail(failure.code, 'collection persistence failed');
  }
}
function authorizedOutcome(input, lock) {
  const collection = lock.collection;
  if (collection?.status !== 'collected' || collection.result.mode !== input.mode)
    invalid('pass has no matching collection authority');
  const result = collection.result;
  const candidate =
    result.eligible.find((entry) => entry.issue === input.issue) ??
    result.authorizedRecovery.find((entry) => entry.issue === input.issue);
  if (!candidate || candidate.fingerprint !== input.fingerprint)
    invalid('issue/fingerprint not authorized by this pass');
  if (input.headRef !== undefined && input.headRef !== candidate.headRef)
    invalid('recovery branch mismatch');
  if (
    candidate.number &&
    input.pullRequest &&
    (candidate.number !== input.pullRequest.number || candidate.url !== input.pullRequest.url)
  )
    invalid('recovery PR mismatch');
  if (input.pullRequest)
    validatePrUrl(input.pullRequest.url, result.repository, input.pullRequest.number);
  return {
    issue: input.issue,
    verdict: input.verdict,
    reason: sanitizeReason(input.reason),
    fingerprint: input.fingerprint,
    ...(input.pullRequest ? { pullRequest: input.pullRequest } : {}),
    ...(input.stableAttemptId ? { stableAttemptId: input.stableAttemptId } : {}),
  };
}
function outcomeInput(context, lock, outcome) {
  exact(outcome, ['issue', 'verdict', 'reason', 'fingerprint'], ['pullRequest', 'stableAttemptId']);
  const input = {
    cwd: context.root,
    passId: lock.passId,
    mode: lock.collection.result.mode,
    ...outcome,
  };
  validateInput('verdict-record', input);
  if (!same(authorizedOutcome(input, lock), outcome)) invalid('invalid persisted verdict outcome');
  return input;
}
function cachedOutcomeMatches(record, outcome, lock) {
  return (
    record &&
    record.issue === outcome.issue &&
    record.recordedPassId === lock.passId &&
    record.mode === lock.collection.result.mode &&
    record.fingerprint === outcome.fingerprint &&
    record.verdict === outcome.verdict &&
    record.reason === outcome.reason &&
    record.pullRequest === outcome.pullRequest?.number
  );
}
function assertPublicationLimit(collection, outcome) {
  const publications = Object.values(collection.outcomes).filter(
    (entry) => entry.verdict === 'published' || entry.verdict === 'would-publish',
  ).length;
  if (
    ['published', 'would-publish'].includes(outcome.verdict) &&
    publications >= collection.result.limits.plans
  )
    invalid('publication limit exceeded');
}
function applyIntendedCache(context, cache, lock, pending) {
  const input = outcomeInput(context, lock, pending.outcome);
  const expected = transition(cache, input, pending.record.recordedAt);
  if (!same(expected, pending.record)) invalid('pending verdict transition differs from cache');
  cache.records[input.issue] = pending.record;
  if (input.stableAttemptId)
    cache.attempts[input.stableAttemptId] = attemptIdentity(
      input.stableAttemptId,
      input.issue,
      input.fingerprint,
      lock.passId,
    );
  if (hash(cache) !== pending.afterDigest) invalid('pending verdict cache digest mismatch');
}
async function finalizeVerdict(context, lock, pending) {
  lock.collection.outcomes[pending.outcome.issue] = pending.outcome;
  delete lock.collection.pendingVerdict;
  await atomic(context, lockPath(context), lock);
}
// A durable intent binds the complete outcome and both cache states before the cache changes.
// Only a proven committed cache may complete it automatically. A failed cache write requires
// the identical verdict retry; other work cannot turn an uncommitted intent into authority.
async function reconcileVerdict(context, lock, operation, input) {
  const collection = lock.collection;
  if (collection?.status !== 'collected') return;
  const cache = await loadCache(context, collection.result.repository);
  const pending = collection.pendingVerdict;
  if (pending !== undefined) {
    exact(pending, ['outcome', 'record', 'beforeDigest', 'afterDigest']);
    const intendedInput = outcomeInput(context, lock, pending.outcome);
    match(pending.beforeDigest, /^[a-f0-9]{64}$/);
    match(pending.afterDigest, /^[a-f0-9]{64}$/);
    if (pending.beforeDigest === pending.afterDigest)
      invalid('pending verdict has no cache transition');
    validateCache({
      ...emptyCache(collection.result.repository),
      records: { [pending.outcome.issue]: pending.record },
    });
    if (
      !cachedOutcomeMatches(pending.record, pending.outcome, lock) ||
      collection.outcomes[pending.outcome.issue]
    )
      invalid('pending verdict conflicts with pass authority');
    assertPublicationLimit(collection, pending.outcome);
    if (cache.degradation)
      fail(
        cache.degradation.code,
        'pending verdict cache is unavailable; release this pass or repair its cache',
      );
    const digest = hash(cache.value);
    if (digest === pending.beforeDigest) {
      if (operation !== 'verdict-record' || input.issue !== pending.outcome.issue)
        fail(
          'UNSAFE_RUNTIME_STATE',
          'verdict cache commit is incomplete; retry the identical verdict-record or explicitly release this pass',
        );
      if (!same(authorizedOutcome(input, lock), pending.outcome))
        invalid('conflicting pending verdict replay');
      applyIntendedCache(context, cache.value, lock, pending);
      await saveCache(context, cache.value, null);
    } else if (digest !== pending.afterDigest)
      fail(
        'UNSAFE_RUNTIME_STATE',
        'pending verdict cache state differs; explicitly release this pass before further work',
      );
    if (!same(cache.value.records[pending.outcome.issue], pending.record))
      invalid('pending cache record differs');
    if (
      intendedInput.stableAttemptId &&
      !same(
        cache.value.attempts[intendedInput.stableAttemptId],
        attemptIdentity(
          intendedInput.stableAttemptId,
          intendedInput.issue,
          intendedInput.fingerprint,
          lock.passId,
        ),
      )
    )
      invalid('pending cache attempt differs');
    await finalizeVerdict(context, lock, pending);
  }
  if (cache.degradation) {
    // A cache already reported degraded by collection may still produce its empty report.
    if (
      !Object.keys(collection.outcomes).length &&
      same(cache.degradation, collection.result.cacheDegradation)
    )
      return;
    fail(cache.degradation.code, 'cache authority changed after collection');
  }
  for (const record of Object.values(cache.value.records)) {
    if (
      record.recordedPassId === lock.passId &&
      !cachedOutcomeMatches(record, collection.outcomes[record.issue] ?? {}, lock)
    )
      fail(
        'UNSAFE_RUNTIME_STATE',
        'cached verdict lacks a proven pass outcome; explicitly release this pass',
      );
  }
  for (const outcome of Object.values(collection.outcomes)) {
    const known = outcomeInput(context, lock, outcome);
    if (
      !cachedOutcomeMatches(cache.value.records[outcome.issue], outcome, lock) ||
      (known.stableAttemptId &&
        !same(
          cache.value.attempts[known.stableAttemptId],
          attemptIdentity(known.stableAttemptId, known.issue, known.fingerprint, lock.passId),
        ))
    )
      fail(
        'UNSAFE_RUNTIME_STATE',
        'pass outcome differs from committed cache; explicitly release this pass',
      );
  }
}
async function record(context, input, lock) {
  const collection = lock.collection;
  const outcome = authorizedOutcome(input, lock);
  const result = collection.result;
  const previousOutcome = collection.outcomes[input.issue];
  if (previousOutcome) {
    if (!same(previousOutcome, outcome)) invalid('conflicting verdict replay');
    return previousOutcome;
  }
  assertPublicationLimit(collection, outcome);
  const cache = await loadCache(context, result.repository);
  const identity =
    input.stableAttemptId &&
    attemptIdentity(input.stableAttemptId, input.issue, input.fingerprint, input.passId);
  if (
    identity &&
    cache.value.attempts[input.stableAttemptId] &&
    !same(cache.value.attempts[input.stableAttemptId], identity)
  )
    invalid('attempt identity conflict');
  if (cache.degradation) fail(cache.degradation.code, 'degraded cache is preserved');
  const beforeDigest = hash(cache.value);
  const previous = cache.value.records[input.issue];
  if (previous?.recordedPassId === input.passId) {
    if (
      previous.fingerprint !== input.fingerprint ||
      previous.verdict !== input.verdict ||
      previous.reason !== outcome.reason ||
      previous.pullRequest !== input.pullRequest?.number
    )
      invalid('conflicting cached verdict replay');
  } else cache.value.records[input.issue] = transition(cache.value, input, context.now());
  if (identity) cache.value.attempts[input.stableAttemptId] = identity;
  const pending = {
    outcome,
    record: cache.value.records[input.issue],
    beforeDigest,
    afterDigest: hash(cache.value),
  };
  collection.pendingVerdict = pending;
  await atomic(context, lockPath(context), lock);
  await saveCache(context, cache.value, null);
  await finalizeVerdict(context, lock, pending);
  return outcome;
}

function uniqueEntries(entries, key) {
  const seen = new Set();
  for (const entry of entries) {
    const identity = key(entry);
    if (seen.has(identity)) invalid('duplicate outcome identity');
    seen.add(identity);
  }
}
export function validatePassReport(report) {
  const version = enumeration(report?.schemaVersion, [1, 2]);
  exact(
    report,
    version === 1 ? reportKeys : [...reportKeys, 'repositoryVisibility', 'leftoverPlanFiles'],
  );
  if (version === 2) {
    enumeration(report.repositoryVisibility, ['public', 'private', 'unknown']);
    if (!same(leftoverPlanFiles(report.leftoverPlanFiles), report.leftoverPlanFiles))
      invalid('report leftovers must be normalized');
  }
  match(report.passId, PASS_ID);
  mode(report.mode);
  match(report.repository, REPOSITORY);
  timestamp(report.startedAt);
  timestamp(report.finishedAt);
  if (Date.parse(report.finishedAt) < Date.parse(report.startedAt))
    invalid('report finishes before it starts');
  enumeration(report.outcome, ['completed', 'failed']);
  enumeration(report.cutOff, ['none', 'judgment-limit', 'publish-limit']);
  exact(report.limits, ['judgments', 'plans']);
  limits(report.limits);
  if (!object(report.counts)) invalid('invalid report counts');
  for (const [key, count] of Object.entries(report.counts)) {
    match(key, NAME);
    if (![...SKIP_REASONS, ...VERDICTS].includes(key) || !Number.isSafeInteger(count) || count < 0)
      invalid('invalid count');
  }
  for (const field of [
    'verdicts',
    'pullRequestsOpened',
    'pullRequestsRecovered',
    'failures',
    'orphanBranches',
    'issueClosedPlanPrOpen',
  ])
    if (!Array.isArray(report[field])) invalid('invalid report array');
  for (const entry of report.verdicts) {
    exact(entry, ['issue', 'verdict', 'reason']);
    positive(entry.issue);
    enumeration(entry.verdict, VERDICTS);
    validateReason(entry.reason);
  }
  uniqueEntries(report.verdicts, (entry) => entry.issue);
  const prs = [...report.pullRequestsOpened, ...report.pullRequestsRecovered];
  for (const entry of [...prs, ...report.issueClosedPlanPrOpen]) {
    exact(entry, ['issue', 'number', 'headRef', 'url']);
    positive(entry.issue);
    positive(entry.number);
    safeRef(entry.headRef);
    const parsed = parsePlanBranch(entry.headRef);
    if (!parsed || parsed.issue !== entry.issue) invalid('PR head identity mismatch');
    validatePrUrl(entry.url, report.repository, entry.number);
  }
  uniqueEntries(prs, (entry) => entry.number);
  uniqueEntries(prs, (entry) => entry.issue);
  const published = report.verdicts.filter((entry) => entry.verdict === 'published');
  if (
    !same(
      published.map((entry) => entry.issue).sort((a, b) => a - b),
      prs.map((entry) => entry.issue).sort((a, b) => a - b),
    )
  )
    invalid('publication entries do not match verdicts');
  uniqueEntries(report.issueClosedPlanPrOpen, (entry) => entry.number);
  for (const entry of report.orphanBranches) {
    exact(entry, ['issue', 'headRef']);
    positive(entry.issue);
    const parsed = parsePlanBranch(entry.headRef);
    if (!parsed || parsed.issue !== entry.issue) invalid('orphan identity mismatch');
  }
  uniqueEntries(report.orphanBranches, (entry) => entry.issue);
  if (report.orphanBranches.length > (report.counts['plan-branch-exists'] ?? 0))
    invalid('orphan count exceeds branch skips');
  for (const entry of report.failures) {
    exact(entry, ['issue', 'stage', 'code']);
    if (entry.issue !== null) positive(entry.issue);
    match(entry.stage, NAME);
    match(entry.code, CODE);
  }
  uniqueEntries(report.failures, (entry) => entry.issue);
  if (
    (report.outcome === 'completed' || version === 2) &&
    !same(
      report.failures
        .filter((entry) => version === 1 || entry.issue !== null)
        .map((entry) => entry.issue)
        .sort((a, b) => a - b),
      report.verdicts
        .filter((entry) => entry.verdict === 'failed')
        .map((entry) => entry.issue)
        .sort((a, b) => a - b),
    )
  )
    invalid('failure entries do not match verdicts');
  if (report.cacheDegradation !== null) {
    exact(report.cacheDegradation, ['code']);
    enumeration(report.cacheDegradation.code, ['CACHE_CORRUPT', 'CACHE_REPOSITORY_MISMATCH']);
  }
  for (const verdict of VERDICTS)
    if (
      (report.counts[verdict] ?? 0) !==
      report.verdicts.filter((entry) => entry.verdict === verdict).length
    )
      invalid('verdict count mismatch');
  if (
    report.mode === 'dry-run' &&
    (prs.length || report.verdicts.some((entry) => entry.verdict === 'published'))
  )
    invalid('dry-run publication');
  if (
    report.mode === 'publish' &&
    report.verdicts.some((entry) => entry.verdict === 'would-publish')
  )
    invalid('publish would-publish verdict');
  if (
    prs.length > report.limits.plans ||
    report.verdicts.filter((entry) => ['published', 'would-publish'].includes(entry.verdict))
      .length > report.limits.plans
  )
    invalid('publication limit exceeded');
  if (report.outcome === 'failed') {
    if (
      (version === 1 &&
        (report.verdicts.length ||
          prs.length ||
          report.failures.length !== 1 ||
          report.failures[0].issue !== null ||
          !['preflight', 'collect'].includes(report.failures[0].stage))) ||
      (version === 2 && report.failures.filter((entry) => entry.issue === null).length !== 1) ||
      report.cutOff !== 'none'
    )
      invalid('invalid failed-pass report');
  } else if (report.failures.some((entry) => entry.issue === null))
    invalid('completed report has pass-level failure');
  return report;
}
async function report(context, input, lock) {
  const collection = lock.collection;
  const version = reportVersion(input.reportVersion);
  let repository;
  let currentMode;
  let currentLimits;
  let collected;
  if (collection?.status === 'collected') {
    collected = collection.result;
    repository = collected.repository;
    currentMode = collected.mode;
    currentLimits = collected.limits;
    if (!input.collect || !same(input.collect, collected))
      invalid('report collection differs from persisted authority');
    if (version === 1 && input.outcome !== 'completed')
      invalid('collected pass must report issue failures individually');
    const expected = Object.values(collection.outcomes)
      .map(({ issue, verdict, reason }) => ({ issue, verdict, reason }))
      .sort((a, b) => a.issue - b.issue);
    if (
      !same(
        [...input.verdicts].sort((a, b) => a.issue - b.issue),
        expected,
      )
    )
      invalid('report outcomes differ from recorded verdicts');
    if (
      input.verdicts.filter((entry) =>
        collected.eligible.some((candidate) => candidate.issue === entry.issue),
      ).length > currentLimits.judgments
    )
      invalid('judgment limit exceeded');
    const opened = input.pullRequestsOpened;
    const recovered = input.pullRequestsRecovered;
    for (const [entries, recovery] of [
      [opened, false],
      [recovered, true],
    ])
      for (const entry of entries) {
        const outcome = collection.outcomes[entry.issue];
        const candidate = (recovery ? collected.authorizedRecovery : collected.eligible).find(
          (item) => item.issue === entry.issue,
        );
        if (
          !candidate ||
          candidate.headRef !== entry.headRef ||
          outcome?.verdict !== 'published' ||
          outcome.pullRequest?.number !== entry.number ||
          outcome.pullRequest.url !== entry.url
        )
          invalid('PR entry is not a recorded authorized publication');
      }
    if (
      [...opened, ...recovered].length !==
      expected.filter((entry) => entry.verdict === 'published').length
    )
      invalid('published verdict lacks PR entry');
    const failed = input.verdicts
      .filter((entry) => entry.verdict === 'failed')
      .map((entry) => entry.issue)
      .sort((a, b) => a - b);
    if (
      !same(
        input.failures
          .filter((entry) => version === 1 || entry.issue !== null)
          .map((entry) => entry.issue)
          .sort((a, b) => a - b),
        failed,
      )
    )
      invalid('issue failures do not match verdicts');
  } else {
    if (
      input.collect !== undefined ||
      input.outcome !== 'failed' ||
      input.verdicts.length ||
      input.pullRequestsOpened.length ||
      input.pullRequestsRecovered.length
    )
      invalid('pass has no successful collection');
    if (collection?.status === 'failed') {
      repository = collection.repository;
      currentMode = collection.mode;
      currentLimits = collection.limits;
      if (
        input.failures.length !== 1 ||
        input.failures[0].stage !== 'collect' ||
        input.failures[0].code !== collection.failure.code
      )
        invalid('collect failure mismatch');
    } else {
      currentMode = mode(input.mode);
      currentLimits = limits(input.limits);
      if (input.failures.length !== 1 || input.failures[0].stage !== 'preflight')
        invalid('missing preflight failure');
    }
    if (!repository) repository = ledgerRepository(await remote(context, 'repository-resolve'));
  }
  if (
    (input.mode !== undefined && input.mode !== currentMode) ||
    (input.limits !== undefined && !same(limits(input.limits), currentLimits))
  )
    invalid('report mode or limits mismatch');
  const counts = {};
  for (const skip of collected?.skipped ?? []) counts[skip.reason] = (counts[skip.reason] ?? 0) + 1;
  for (const verdict of input.verdicts)
    counts[verdict.verdict] = (counts[verdict.verdict] ?? 0) + 1;
  if (input.counts !== undefined && !same(input.counts, counts)) invalid('report counts mismatch');
  let metadata = {};
  if (version === 2) {
    const initialVisibility = repositoryVisibility(collected?.repositoryVisibility);
    if (
      collected &&
      input.repositoryVisibility !== undefined &&
      input.repositoryVisibility !== initialVisibility
    )
      invalid('report visibility differs from persisted collection');
    const initial = leftoverPlanFiles(collected?.leftoverPlanFiles, collection?.planDir);
    const final =
      input.leftoverPlanFiles === undefined
        ? initial
        : leftoverPlanFiles(input.leftoverPlanFiles, collected ? collection.planDir : undefined, {
            deduplicate: true,
          });
    if (initial.some((entry) => !final.some((item) => same(item, entry))))
      invalid('report must preserve initial leftovers');
    metadata = {
      repositoryVisibility: collected
        ? initialVisibility
        : repositoryVisibility(input.repositoryVisibility),
      leftoverPlanFiles: final,
    };
  }
  const value = validatePassReport({
    schemaVersion: version,
    ...metadata,
    passId: input.passId,
    mode: currentMode,
    outcome: input.outcome,
    repository,
    startedAt: lock.acquiredAt,
    finishedAt: context.now(),
    limits: currentLimits,
    cutOff: input.cutOff,
    counts,
    verdicts: input.verdicts,
    pullRequestsOpened: input.pullRequestsOpened,
    pullRequestsRecovered: input.pullRequestsRecovered,
    failures: input.failures,
    orphanBranches: collected?.recovery.orphanBranches ?? [],
    issueClosedPlanPrOpen: collected?.issueClosedPlanPrOpen ?? [],
    cacheDegradation: collected?.cacheDegradation ?? null,
  });
  const target = path.join(context.directory, 'reports', `${input.passId}.json`);
  const previous = await readJson(context, target);
  if (previous !== undefined && previous?.schemaVersion !== version)
    fail('REPORT_VERSION_CONFLICT', 'stored report version cannot change within a pass');
  const bytes = `${JSON.stringify(value)}\n`;
  await atomic(context, target, bytes);
  await atomic(context, path.join(context.directory, 'last-pass.json'), bytes);
  const entries = await context.fs.readdir(path.join(context.directory, 'reports'), {
    withFileTypes: true,
  });
  const reports = [];
  for (const entry of entries)
    if (entry.isFile() && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.json$/.test(entry.name)) {
      const target = path.join(context.directory, 'reports', entry.name);
      await guard(context, target);
      reports.push({ target, modified: (await context.fs.stat(target)).mtimeMs });
    }
  reports.sort((a, b) => b.modified - a.modified || a.target.localeCompare(b.target));
  for (const entry of reports.slice(20)) {
    await guard(context, entry.target);
    await context.fs.unlink(entry.target);
  }
  return value;
}
export async function executeOperation(operation, input = {}, options = {}) {
  try {
    validateInput(operation, input);
    const context = await contextFor(input, options);
    let data;
    if (operation === 'fingerprint') {
      const target = path.resolve(context.root, input.trustedTextPath);
      if (!target.startsWith(path.join(context.directory, 'trusted') + path.sep))
        invalid('fingerprint path must be trusted runtime text');
      data = { fingerprint: fingerprint(await readJson(context, target), input.issueAuthor) };
    } else
      data = await withMutationLock(context, async () => {
        if (operation === 'pass-lock-acquire') return acquire(context);
        if (operation === 'pass-lock-release') {
          let lock;
          try {
            lock = await readJson(context, lockPath(context));
          } catch {
            fail('LOCK_MISMATCH', 'lock is unreadable');
          }
          if (!lock || lock.passId !== input.passId)
            fail('LOCK_MISMATCH', 'pass lock identity mismatch');
          await guard(context, lockPath(context));
          await context.fs.unlink(lockPath(context));
          return { passId: input.passId, released: true };
        }
        const lock = await readLock(context, input.passId);
        await reconcileVerdict(context, lock, operation, input);
        if (operation === 'pass-collect') return collect(context, input, lock);
        if (operation === 'verdict-record') return record(context, input, lock);
        return report(context, input, lock);
      });
    return { ok: true, operation, data };
  } catch (error) {
    return errorEnvelope(operation, error);
  }
}
export function errorEnvelope(operation, error) {
  return {
    ok: false,
    operation,
    error: {
      code: error instanceof IssueBuddyError ? error.code : 'UNSAFE_RUNTIME_STATE',
      message: error instanceof IssueBuddyError ? error.message : 'runtime state operation failed',
      details: error instanceof IssueBuddyError ? error.details : {},
    },
  };
}
