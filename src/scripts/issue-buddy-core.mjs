// Deterministic Issue Buddy pass protocol. Forge reads use the tracker; the injected runner
// executes Git only here. All persisted authorization is scoped to the primary runtime root.
//
// Passes run in parallel. Each pass keeps its own record at
// `.effective-flow/issue-buddy/passes/<passId>.json` (`pass-open` creates it with the session pid
// the claim core records, `pass-close` deletes it) and plans only issues it holds a per-issue
// planning claim for (`effective-flow-state-planning-claim-core.mjs`, workflow `issue-buddy`,
// holder the pass id); each claim enters the pass record as soon as it is taken. A single-issue
// pass of an autopilot run (`autopilotRunId`) adopts that run's claim instead, after verifying the
// claim's holder and the run's open ledger, exclusively (`adoptions/<runId>.json` names the one
// adopting pass); it never releases an adopted claim and never authorizes recovery. A claim token
// never leaves the claim record: releases re-read it helper-internally.
//
// Cleanup works from `pass-list` (read-only: pass records with liveness, and trusted text no pass
// record lists) and removes leftovers only through `pass-prune` (a pass record under a re-verified
// `process-dead` proof or confirmed staleness) and `trusted-prune` (unlisted trusted text).
//
// The loopback TCP mutation mutex serializes only local reads and writes of the shared runtime
// state; no fetch, `ls-remote` or tracker call ever runs while it is held. A contended mutex is
// retried with a bounded jitter for at most `mutexWaitMs` (10 s) before LOCKED. `pass-collect`
// therefore runs in four steps: an unlocked read phase, a locked claim step, an unlocked re-check of
// the claimed issues and a locked finalization. Every cache writer re-reads `verdicts.json` under
// the mutex and patches only records of issues its pass holds a claim for (closed-PR observations
// are exempt), and the pending-verdict journal binds one issue's record and attempt, so parallel
// passes never invalidate each other's journal.
import { createHash, randomUUID } from 'node:crypto';
import * as filesystem from 'node:fs/promises';
import { createServer } from 'node:net';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { executeOperation as trackerOperation } from './remote-tracker-core.mjs';
import { ledgerRepository } from './remote-tracker-ledger-core.mjs';
import {
  BASE_MOVE_REASONS,
  BASE_MOVE_VERDICTS,
  MAX_BASE_MOVE_PATHS,
  baseMoveRepublishes,
  planBranchName,
  parsePlanBranch,
  parseIssueHeader,
} from './plan-publication-core.mjs';
import { StateOutcome } from './effective-flow-state-core.mjs';
import {
  AUTOPILOT_RUN_ID_PATTERN,
  claimLiveness,
  localHost,
  planningClaimAcquire,
  planningClaimRelease,
  readPlanningClaim,
  sessionOwner,
  STALE_AFTER_MS,
} from './effective-flow-state-planning-claim-core.mjs';

export const ISSUE_BUDDY_OPERATIONS = Object.freeze([
  'pass-open',
  'pass-close',
  'pass-prune',
  'pass-list',
  'trusted-prune',
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
  // Another run (Issue Buddy pass, autopilot run or `plan-issue`) holds the issue's planning claim.
  // Distinct from the lifecycle label `effective-flow-issue-in-progress` (`lifecycle-label`).
  'issue-in-progress',
]);
// The orphan proof `pass-prune` accepts besides `confirmStale` (re-verified by the helper).
export const PASS_PRUNE_PROOFS = Object.freeze(['process-dead']);
export const PASS_PRUNE_RESULTS = Object.freeze([
  'removed',
  'missing',
  'invalid',
  'changed',
  'not-stale',
  'proof-refused',
]);
export const TRUSTED_PRUNE_RESULTS = Object.freeze([
  'removed',
  'missing',
  'claimed',
  'not-regular',
  'unverifiable',
]);
// The bound of `pass-list` entries per list and of `trusted-prune` issues per call.
export const MAX_INVENTORY_ENTRIES = 200;
// The bound of one mutex acquisition, and the jittered pause between two bind attempts.
export const MUTEX_WAIT_MS = 10000;
const MUTEX_RETRY_MIN_MS = 20;
const MUTEX_RETRY_JITTER_MS = 80;
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
// Backlog-audit artifacts carry text derived from authors this pass never vetted, so they are
// excluded by consumer: a goal epic or an obsolete mark is reported under `lifecycle-label`, and a
// split hand-off, which belongs to `plan-issue`, under `plan-issue-comment`.
const GOAL_AUDIT_LABELS = ['effective-flow-goal-epic', 'effective-flow-goal-obsolete'];
const BACKLOG_AUDIT_SPLIT_MARKER = '<!-- effective-flow-backlog-audit-split ';
// Triage artifacts are excluded the same way: a reject or needs-work verdict label, or a trusted
// security notice, skips the issue under `lifecycle-label`; any other trusted triage comment carries
// text derived from unvetted authors under the runner's identity, so only that comment is dropped
// from trusted text. The security check therefore reads the comments before the drop.
const TRIAGE_SKIP_LABELS = ['effective-flow-triage-reject', 'effective-flow-triage-needs-work'];
const TRIAGE_MARKER = '<!-- effective-flow-triage ';
const TRIAGE_SECURITY_MARKER = '<!-- effective-flow-triage security ';
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
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const BASE_MOVE_KEYS = [
  'issue',
  'fromBaseOid',
  'toBaseOid',
  'verdict',
  'reason',
  'commitCount',
  'changedPathCount',
  'citedPathCount',
  'citedPaths',
  'overlappingPaths',
];
function nonNegative(value) {
  if (!Number.isSafeInteger(value) || value < 0) invalid('expected a non-negative safe integer');
  return value;
}
// A path list of a base move: at most MAX_BASE_MOVE_PATHS safe repository-relative entries that a
// ledger and a pull-request appendix can carry (no C1 control, line separator or backtick).
function baseMovePaths(value) {
  if (!Array.isArray(value) || value.length > MAX_BASE_MOVE_PATHS)
    invalid(`base-move paths must be an array of at most ${MAX_BASE_MOVE_PATHS} entries`);
  for (const entry of value) {
    safePath(entry);
    if (entry.length > 512 || /[\u0080-\u009f\u2028\u2029`]/.test(entry))
      invalid('unsafe base-move path');
  }
  return value;
}
// The optional v2 `baseMoves` field: one `assess-base-move` result per issue, at most one entry per
// issue, with the closed verdict and reason enum of `plan-publication`. A `fits` entry lists no
// overlapping path; an overlap may list none when every path was unsafe to report.
function baseMoves(value) {
  if (!Array.isArray(value)) invalid('baseMoves must be an array');
  for (const entry of value) {
    exact(entry, BASE_MOVE_KEYS);
    positive(entry.issue);
    match(entry.fromBaseOid, OBJECT_ID);
    match(entry.toBaseOid, OBJECT_ID);
    enumeration(entry.verdict, BASE_MOVE_VERDICTS);
    if (!BASE_MOVE_REASONS[entry.verdict].includes(entry.reason))
      invalid('base-move reason does not belong to its verdict');
    nonNegative(entry.commitCount);
    nonNegative(entry.changedPathCount);
    nonNegative(entry.citedPathCount);
    baseMovePaths(entry.citedPaths);
    baseMovePaths(entry.overlappingPaths);
    if (entry.citedPaths.length > entry.citedPathCount) invalid('base-move cited count mismatch');
    if (entry.verdict === 'fits' && entry.overlappingPaths.length > 0)
      invalid('a fitting base move lists no overlapping path');
  }
  uniqueEntries(value, (entry) => entry.issue);
  return value;
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
    'pass-open': [[], []],
    'pass-close': [['passId'], []],
    'pass-prune': [
      ['passId', 'acquiredAt'],
      ['proof', 'confirmStale'],
    ],
    'pass-list': [[], []],
    'trusted-prune': [['issues'], []],
    'pass-collect': [
      ['passId', 'mode', 'baseBranch', 'planDir', 'branchPrefix', 'visibility'],
      [
        'limits',
        'staleAttempts',
        'repositoryVisibility',
        'leftoverPlanFiles',
        'issue',
        'autopilotRunId',
      ],
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
        'baseMoves',
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
  if (operation === 'pass-prune') {
    timestamp(input.acquiredAt);
    if (input.confirmStale !== undefined && input.confirmStale !== true)
      invalid('confirmStale may only be true');
    if ((input.proof !== undefined) === (input.confirmStale === true))
      invalid('pass-prune needs exactly one of proof and confirmStale');
    if (input.proof !== undefined) enumeration(input.proof, PASS_PRUNE_PROOFS);
  }
  if (operation === 'trusted-prune') {
    if (
      !Array.isArray(input.issues) ||
      input.issues.length === 0 ||
      input.issues.length > MAX_INVENTORY_ENTRIES
    )
      invalid(`issues must hold 1 to ${MAX_INVENTORY_ENTRIES} issue numbers`);
    input.issues.forEach(positive);
    if (new Set(input.issues).size !== input.issues.length) invalid('issues must be unique');
  }
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
    if (input.issue !== undefined) positive(input.issue);
    // The `Autopilot run:` caller line of a single-issue pass: the pass adopts that run's claim.
    if (input.autopilotRunId !== undefined) {
      match(input.autopilotRunId, AUTOPILOT_RUN_ID_PATTERN);
      if (input.issue === undefined) invalid('autopilotRunId requires the issue selector');
    }
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
      (input.repositoryVisibility !== undefined ||
        input.leftoverPlanFiles !== undefined ||
        input.baseMoves !== undefined)
    )
      invalid('report metadata requires version 2');
    if (version === 2) {
      repositoryVisibility(input.repositoryVisibility);
      leftoverPlanFiles(input.leftoverPlanFiles, undefined, { deduplicate: true });
      if (input.baseMoves !== undefined) baseMoves(input.baseMoves);
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

// Network and forge reads are refused while the mutation mutex is held.
function assertUnlocked(context) {
  if (context.mutexHeld) fail('UNSAFE_RUNTIME_STATE', 'network read under the mutation mutex');
}
async function git(context, args, code = 'UNSAFE_RUNTIME_STATE') {
  if (args[0] === 'fetch' || args[0] === 'ls-remote') assertUnlocked(context);
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
    // Mutex retry timing; injectable so tests can bound or observe contention.
    mutexWaitMs: options.mutexWaitMs ?? MUTEX_WAIT_MS,
    sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    random: options.random ?? Math.random,
    monotonic: options.monotonicNow ?? (() => performance.now()),
  };
  if (typeof context.runner !== 'function') invalid('an injected runner is required');
  if (!Number.isFinite(context.mutexWaitMs) || context.mutexWaitMs < 0)
    invalid('mutexWaitMs must be a non-negative number');
  // The planning-claim core runs its own guarded Git reads through the same runner and clock.
  context.claimDeps = {
    runner: context.runner,
    now: () => Date.parse(context.now()),
    ...(options.claimDeps ?? {}),
  };
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
// The whole-pass lock of earlier releases. Its presence means a pass of an older protocol may
// still be running, so every operation refuses until an operator inspected and removed it.
function legacyPassLockPath(context) {
  return path.join(context.directory, 'pass.lock');
}
// The subdirectories the legacy-lock scan also lists: the bounded pass records and reports. The
// unbounded `trusted/` and `adoptions/` never held a lock, so their entries are never walked.
const LEGACY_LOCK_SUBDIRECTORIES = Object.freeze(['passes', 'reports']);
// Refuses while a `*.lock` entry lies at the top level of the Issue Buddy directory or directly in
// LEGACY_LOCK_SUBDIRECTORIES. The directory passes the runtime guard once; entries are only listed
// (a symlink is never followed), so the scan costs no Git call per entry.
async function rejectLegacyLocks(context) {
  await guard(context, context.directory, { directory: true });
  const list = async (directory) => {
    try {
      return await context.fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  };
  const entries = (await list(context.directory)).map((entry) => ({ directory: '', entry }));
  for (const name of LEGACY_LOCK_SUBDIRECTORIES) {
    const top = entries.find(({ entry }) => entry.name === name);
    if (top?.entry.isDirectory())
      for (const entry of await list(path.join(context.directory, name)))
        entries.push({ directory: name, entry });
  }
  for (const { directory, entry } of entries) {
    const target = path.join(context.directory, directory, entry.name);
    if (target === legacyPassLockPath(context))
      fail(
        'LEGACY_PASS_LOCK',
        'a legacy Issue Buddy pass lock requires operator inspection; it was not removed',
        { path: path.relative(context.root, target) },
      );
  }
  for (const { directory, entry } of entries)
    if (entry.name.endsWith('.lock'))
      fail('LOCKED', 'legacy runtime lock requires operator inspection; it was not removed', {
        path: path.relative(context.root, path.join(context.directory, directory, entry.name)),
      });
}
function listen(server, port) {
  return new Promise((resolve, reject) => {
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
}
// Binds the operation endpoint. An occupied endpoint is retried after a jittered pause until
// `mutexWaitMs` has elapsed, then refused as LOCKED; the mutex never names a holder.
async function bindMutex(context, port) {
  const started = context.monotonic();
  for (;;) {
    let server;
    try {
      server = context.createServer((socket) => socket.destroy());
      await listen(server, port);
      return server;
    } catch (error) {
      if (error?.code !== 'EADDRINUSE')
        fail(
          'UNSAFE_RUNTIME_STATE',
          'cannot bind the loopback TCP operation mutex; allow local-listen permission in the sandbox and use a shared host/network namespace',
        );
      const remaining = context.mutexWaitMs - (context.monotonic() - started);
      if (remaining <= 0)
        fail(
          'LOCKED',
          'operation endpoint stayed occupied; retry after the active operation or local listener exits',
          {},
        );
      await context.sleep(
        Math.min(remaining, MUTEX_RETRY_MIN_MS + context.random() * MUTEX_RETRY_JITTER_MS),
      );
    }
  }
}
// Kernel ownership spans one short local read/check/write/cleanup step. All state-sharing
// callers must use the same host/network namespace. Hash collisions deny access, never grant it.
// The physical common Git directory is immutable across cwd, worktree and origin URL changes.
// Only local Git reads of the runtime guard run inside; network and forge calls never do.
async function withMutationLock(context, action) {
  const port =
    49152 + (createHash('sha256').update(context.identity).digest().readUInt32BE(0) % 16384);
  const server = await bindMutex(context, port);
  context.mutexHeld = true;
  try {
    await rejectLegacyLocks(context);
    return await action();
  } finally {
    context.mutexHeld = false;
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Pass records

function passPath(context, passId) {
  return path.join(context.directory, 'passes', `${match(passId, PASS_ID)}.json`);
}
// Reads the record of `passId`: PASS_NOT_FOUND when it is absent, UNSAFE_RUNTIME_STATE when it is
// unreadable, belongs to another pass or (unless `lenient`, as for `pass-close`) carries an invalid
// acquisition time. A record is never removed except by `pass-close`.
async function readPass(context, passId, { lenient = false } = {}) {
  let pass;
  try {
    pass = await readJson(context, passPath(context, passId));
  } catch (error) {
    if (error instanceof IssueBuddyError) throw error;
    fail('UNSAFE_RUNTIME_STATE', 'pass record is unreadable');
  }
  if (pass === undefined) fail('PASS_NOT_FOUND', 'no open pass record for this passId');
  if (!object(pass) || pass.passId !== passId)
    fail('UNSAFE_RUNTIME_STATE', 'pass record identity mismatch');
  if (lenient) return pass;
  try {
    timestamp(pass.acquiredAt);
  } catch {
    fail('UNSAFE_RUNTIME_STATE', 'pass record has an invalid acquiredAt timestamp', { passId });
  }
  if (pass.claims !== undefined) {
    if (!Array.isArray(pass.claims) || !object(pass.claimTarget))
      fail('UNSAFE_RUNTIME_STATE', 'pass record has invalid claims');
    for (const entry of pass.claims)
      try {
        exact(entry, ['issue'], ['adoptedRunId']);
        positive(entry.issue);
        if (entry.adoptedRunId !== undefined) match(entry.adoptedRunId, AUTOPILOT_RUN_ID_PATTERN);
      } catch {
        fail('UNSAFE_RUNTIME_STATE', 'pass record has invalid claims');
      }
  }
  return pass;
}
async function writePass(context, pass) {
  await atomic(context, passPath(context, pass.passId), pass);
}
// The pass record names the session process exactly as a planning claim does (`sessionOwner` of
// the claim core: the session that invoked the helper, never the short-lived helper, with its
// start time `pidStartTime`), so both liveness probes agree and a live pass is never `dead`.
async function openPass(context) {
  await mkdir(context, path.join(context.directory, 'passes'));
  const owner = await sessionOwner({ runner: context.runner }, context.claimDeps);
  const pass = {
    passId: randomUUID(),
    acquiredAt: context.now(),
    pid: owner.pid,
    pidStartTime: owner.pidStartTime,
    hostname: localHost(context.claimDeps),
  };
  try {
    // Create-only publication exposes fully written holder metadata and never replaces a record.
    await atomic(context, passPath(context, pass.passId), pass, { createOnly: true });
  } catch (error) {
    if (error.code === 'EEXIST')
      fail('UNSAFE_RUNTIME_STATE', 'a pass record with the new passId already exists');
    throw error;
  }
  return { passId: pass.passId };
}
// Releases every claim the pass still owns (an adopted claim only loses its trusted text) and
// deletes the record. A claim that is gone or now held by another run is left untouched.
async function closePass(context, passId) {
  const pass = await readPass(context, passId, { lenient: true });
  const released = await releasePassClaims(context, pass);
  const target = passPath(context, passId);
  await guard(context, target);
  await context.fs.unlink(target);
  return { passId, closed: true, releasedClaims: released };
}
// Ends a pass's hold on its issues: releases the claims it still owns (an adopted claim only loses
// its trusted text) and removes its adoption markers. Returns the released issues, ascending.
async function releasePassClaims(context, pass) {
  const released = [];
  if (Array.isArray(pass.claims) && object(pass.claimTarget))
    for (const entry of pass.claims)
      if (await releaseIssueClaim(context, pass, entry)) released.push(entry.issue);
  await removeAdoptions(context, pass.passId);
  return released.sort((a, b) => a - b);
}
// The liveness of a pass record's session process (`claimLiveness` of the claim core): `alive`,
// `dead` or `unknown`; a record without a usable pid or from another host is `unknown`. A record
// without a usable `pidStartTime` (an older record, or none could be read) is probed by pid alone.
function passLiveness(context, pass) {
  const pid = Number.isSafeInteger(pass.pid) && pass.pid > 1 ? pass.pid : null;
  const pidStartTime =
    pid !== null && Number.isSafeInteger(pass.pidStartTime) && pass.pidStartTime >= 0
      ? pass.pidStartTime
      : null;
  const host = typeof pass.hostname === 'string' ? pass.hostname : '';
  return claimLiveness(
    { pid, pidStartTime, hostname: host },
    localHost(context.claimDeps),
    context.claimDeps,
  );
}
// `pass-prune`: the confirmed cleanup path for the record of a pass that no longer runs, never for
// the owning run (which uses `pass-close`). Under the mutex it re-reads the record and requires its
// identity (`passId`, the `acquiredAt` the caller observed) and either a re-verified orphan proof
// (`process-dead`: the recorded session process, identified by pid and start time, is provably
// gone on this host) or `confirmStale: true` for a record older than STALE_AFTER_MS. Only then it
// releases the pass's own claims (an adopted claim is never released), removes its adoption
// markers and deletes the record, while it is still byte-identical to the one checked.
async function prunePass(context, input) {
  const target = passPath(context, input.passId);
  const result = (value, extra = {}) => ({ passId: input.passId, result: value, ...extra });
  await guard(context, target);
  let bytes;
  try {
    bytes = await context.fs.readFile(target);
  } catch (error) {
    if (error.code === 'ENOENT') return result('missing');
    return result('invalid', { reason: 'unreadable' });
  }
  let pass;
  try {
    pass = await readPass(context, input.passId);
  } catch (error) {
    if (error.code === 'PASS_NOT_FOUND') return result('missing');
    if (!(error instanceof IssueBuddyError)) throw error;
    return result('invalid', { reason: 'record' });
  }
  if (pass.acquiredAt !== input.acquiredAt) return result('changed');
  if (input.confirmStale === true) {
    if (Date.parse(context.now()) - Date.parse(pass.acquiredAt) <= STALE_AFTER_MS)
      return result('not-stale');
  } else {
    const liveness = passLiveness(context, pass);
    if (liveness !== 'dead') return result('proof-refused', { reason: `process-${liveness}` });
  }
  const released = await releasePassClaims(context, pass);
  await guard(context, target);
  let again;
  try {
    again = await context.fs.readFile(target);
  } catch {
    return result('changed', { releasedClaims: released });
  }
  if (!again.equals(bytes)) return result('changed', { releasedClaims: released });
  await context.fs.unlink(target);
  return result('removed', {
    ...(input.proof === undefined ? { confirmStale: true } : { proof: input.proof }),
    releasedClaims: released,
  });
}
// Lists the regular files of one runtime directory below the guarded Issue Buddy directory,
// sorted; a missing directory is empty. Names only: nothing is followed or read.
async function listFiles(context, directory) {
  await guard(context, directory, { directory: true });
  try {
    return (await context.fs.readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
// Every pass record: `{valid: [{pass}], invalid: [passId]}`. A file that is no `<passId>.json`
// (a write temporary) is no record.
async function passRecords(context) {
  const valid = [];
  const invalidIds = [];
  for (const name of await listFiles(context, path.join(context.directory, 'passes'))) {
    const passId = name.endsWith('.json') ? name.slice(0, -5) : '';
    if (!PASS_ID.test(passId)) continue;
    try {
      valid.push(await readPass(context, passId));
    } catch (error) {
      if (!(error instanceof IssueBuddyError)) throw error;
      // A record closed since the listing is simply gone; any other refusal makes it invalid.
      if (error.code !== 'PASS_NOT_FOUND') invalidIds.push(passId);
    }
  }
  return { valid, invalid: invalidIds };
}
// The trusted-text files `trusted/issue-<N>.json`: their issue numbers, ascending.
async function trustedIssues(context) {
  const issues = [];
  for (const name of await listFiles(context, path.join(context.directory, 'trusted'))) {
    const found = /^issue-([1-9][0-9]{0,15})\.json$/.exec(name);
    if (found && Number.isSafeInteger(Number(found[1]))) issues.push(Number(found[1]));
  }
  return issues.sort((a, b) => a - b);
}
// The issues any pass record still lists in its claims; null when a record is unreadable, so no
// trusted text can be proven unclaimed.
function listedIssues(records) {
  if (records.invalid.length) return null;
  return new Set(records.valid.flatMap((pass) => (pass.claims ?? []).map((entry) => entry.issue)));
}
// `pass-list` (read-only): the inventory a cleanup step works from. `passes` holds each pass record
// with its age, stale flag (older than STALE_AFTER_MS), session pid, host, liveness, claims and
// collection status, or `{passId, state: 'invalid'}`; `unclaimedTrusted` the trusted-text files of
// issues no pass record lists (null while a pass record is unreadable). Never a claim token.
async function listPasses(context) {
  const now = Date.parse(context.now());
  const records = await passRecords(context);
  const passes = [
    ...records.valid.map((pass) => {
      const ageMs = Math.max(0, now - Date.parse(pass.acquiredAt));
      return {
        passId: pass.passId,
        state: 'valid',
        acquiredAt: pass.acquiredAt,
        ageMs,
        stale: ageMs > STALE_AFTER_MS,
        pid: Number.isSafeInteger(pass.pid) ? pass.pid : null,
        hostname: typeof pass.hostname === 'string' ? pass.hostname : null,
        liveness: passLiveness(context, pass),
        claims: (pass.claims ?? []).map((entry) => ({ ...entry })),
        collection: pass.collection?.status ?? null,
      };
    }),
    ...records.invalid.map((passId) => ({ passId, state: 'invalid' })),
  ].sort((a, b) => (a.passId < b.passId ? -1 : a.passId > b.passId ? 1 : 0));
  const listed = listedIssues(records);
  const unclaimed =
    listed === null
      ? null
      : (await trustedIssues(context))
          .filter((issue) => !listed.has(issue))
          .map((issue) => ({
            issue,
            path: path.relative(context.root, trustedPath(context, issue)),
          }));
  return {
    staleAfterHours: STALE_AFTER_MS / 3_600_000,
    passes: passes.slice(0, MAX_INVENTORY_ENTRIES),
    unclaimedTrusted: unclaimed === null ? null : unclaimed.slice(0, MAX_INVENTORY_ENTRIES),
    truncated:
      passes.length > MAX_INVENTORY_ENTRIES ||
      (unclaimed !== null && unclaimed.length > MAX_INVENTORY_ENTRIES),
  };
}
// `trusted-prune`: removes the trusted text of each given issue only while, re-verified under the
// mutex, no pass record lists the issue in its claims. Per issue `removed`, `missing`, `claimed`,
// `not-regular` or, while a pass record is unreadable, `unverifiable`.
async function pruneTrusted(context, input) {
  const listed = listedIssues(await passRecords(context));
  const items = [];
  for (const issue of input.issues) {
    if (listed === null) {
      items.push({ issue, result: 'unverifiable' });
      continue;
    }
    if (listed.has(issue)) {
      items.push({ issue, result: 'claimed' });
      continue;
    }
    const target = trustedPath(context, issue);
    await guard(context, target);
    let info;
    try {
      info = await context.fs.lstat(target);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      items.push({ issue, result: 'missing' });
      continue;
    }
    if (!info.isFile()) {
      items.push({ issue, result: 'not-regular' });
      continue;
    }
    await context.fs.unlink(target);
    items.push({ issue, result: 'removed' });
  }
  return { items };
}

// ---------------------------------------------------------------------------------------------
// Planning claims

// The planning-claim target of a repository key `<host>/<owner>/<name>`; autopilot derives the
// same target from its ledger source, so both derive one claim key for one issue.
function claimTargetOf(repositoryKey) {
  const [host, owner, repository] = repositoryKey.split('/');
  return { kind: 'forge', host, owner, repository };
}
async function claimCall(action) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof IssueBuddyError) throw error;
    fail('UNSAFE_RUNTIME_STATE', 'planning claim operation failed', {
      claimCode: typeof error?.code === 'string' ? error.code : 'UNKNOWN',
    });
  }
}
// The holder a refusal names, never its token.
function claimHolder(details) {
  if (details.state !== 'valid') return { state: 'invalid', reason: details.reason };
  const holder = { workflow: details.workflow };
  for (const key of ['runId', 'passId']) if (details[key] !== undefined) holder[key] = details[key];
  return {
    ...holder,
    acquiredAt: details.acquiredAt,
    ageMs: details.ageMs,
    stale: details.stale,
    liveness: details.liveness,
  };
}
function holderOf(context, claim) {
  const ageMs = Math.max(0, Date.parse(context.now()) - Date.parse(claim.acquiredAt));
  return claimHolder({
    state: 'valid',
    workflow: claim.workflow,
    runId: claim.runId,
    passId: claim.passId,
    acquiredAt: claim.acquiredAt,
    ageMs,
    stale: ageMs > STALE_AFTER_MS,
    liveness: claimLiveness(claim, localHost(context.claimDeps), context.claimDeps),
  });
}
function readIssueClaim(context, target, issue) {
  return claimCall(() =>
    readPlanningClaim({ cwd: context.root, target, issue }, context.claimDeps),
  );
}
// `{acquired: true}` or `{holder}` for a claim another run holds.
async function acquireIssueClaim(context, target, issue, passId) {
  const result = await claimCall(() =>
    planningClaimAcquire(
      { cwd: context.root, target, issue, workflow: 'issue-buddy', passId },
      context.claimDeps,
    ),
  );
  if (result instanceof StateOutcome) {
    if (result.code === 'LEGACY_PASS_LOCK')
      fail(
        'LEGACY_PASS_LOCK',
        'a legacy Issue Buddy pass lock requires operator inspection; it was not removed',
        { path: result.details.path },
      );
    return { holder: claimHolder(result.details) };
  }
  return { acquired: true };
}
function ownsClaim(read, pass, entry) {
  if (read.state !== 'valid') return false;
  return entry.adoptedRunId !== undefined
    ? read.claim.workflow === 'autopilot' && read.claim.runId === entry.adoptedRunId
    : read.claim.workflow === 'issue-buddy' && read.claim.passId === pass.passId;
}
// The live claim check of every authority-bearing write for one issue.
async function requireClaim(context, pass, issue) {
  const entry = (pass.claims ?? []).find((item) => item.issue === issue);
  if (!entry || !ownsClaim(await readIssueClaim(context, pass.claimTarget, issue), pass, entry))
    fail('ISSUE_NOT_CLAIMED', 'this pass holds no planning claim for the issue', { issue });
}
function trustedPath(context, issue) {
  return path.join(context.directory, 'trusted', `issue-${positive(issue)}.json`);
}
async function removeTrusted(context, issue) {
  const target = trustedPath(context, issue);
  await guard(context, target);
  let info;
  try {
    info = await context.fs.lstat(target);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (!info.isFile()) fail('UNSAFE_RUNTIME_STATE', 'trusted text is not a regular file');
  await context.fs.unlink(target);
}
// While the pass still owns the claim: removes the issue's trusted text, then releases the claim
// by the token read back from the claim record. An adopted claim is never released. Returns
// whether a claim was released.
async function releaseIssueClaim(context, pass, entry) {
  const read = await readIssueClaim(context, pass.claimTarget, entry.issue);
  if (!ownsClaim(read, pass, entry)) return false;
  await removeTrusted(context, entry.issue);
  if (entry.adoptedRunId !== undefined) return false;
  const result = await claimCall(() =>
    planningClaimRelease(
      {
        cwd: context.root,
        target: pass.claimTarget,
        issue: entry.issue,
        claimId: read.claim.claimId,
      },
      context.claimDeps,
    ),
  );
  return !(result instanceof StateOutcome) && result.released === true;
}
// A final verdict ends the pass's interest in the issue. A failed release leaves the claim to
// `pass-close`, so the durable verdict is never reported as failed.
async function settleClaim(context, pass, issue) {
  const entry = (pass.claims ?? []).find((item) => item.issue === issue);
  if (!entry) return;
  try {
    await releaseIssueClaim(context, pass, entry);
  } catch (error) {
    if (!(error instanceof IssueBuddyError)) throw error;
  }
}
// The adoption marker of an autopilot run: `adoptions/<runId>.json`, `{runId, issue, passId,
// adoptedAt}`, naming the one pass that adopted the run's claim.
function adoptionPath(context, runId) {
  return path.join(
    context.directory,
    'adoptions',
    `${match(runId, AUTOPILOT_RUN_ID_PATTERN)}.json`,
  );
}
async function passRecordPresent(context, passId) {
  const target = passPath(context, passId);
  await guard(context, target);
  try {
    await context.fs.lstat(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
// Removes every adoption marker that names `passId` (one per open autopilot run at most).
async function removeAdoptions(context, passId) {
  const directory = path.join(context.directory, 'adoptions');
  for (const name of await listFiles(context, directory)) {
    const runId = name.endsWith('.json') ? name.slice(0, -5) : '';
    if (!AUTOPILOT_RUN_ID_PATTERN.test(runId)) continue;
    const target = adoptionPath(context, runId);
    let marker;
    try {
      marker = await readJson(context, target);
    } catch (error) {
      if (error instanceof IssueBuddyError) throw error;
      continue;
    }
    if (object(marker) && marker.passId === passId) await context.fs.unlink(target);
  }
}
// Adopts the claim of an issue-sourced autopilot run: the claim must be that run's, its ledger must
// be open with this issue of this repository as its source (as `consent-check`), and no other
// pass may hold the adoption. Adoption is exclusive per run: the adopting pass is recorded in the
// run's adoption marker, and a second pass is refused `already-adopted` while the earlier
// adopter's pass record exists. A marker whose pass record is gone is taken over.
async function adoptClaim(context, target, repositoryKey, issue, runId, passId) {
  const refuse = (reason, extra = {}) =>
    fail('CLAIM_ADOPTION_REFUSED', 'the autopilot run claim cannot be adopted', {
      issue,
      runId,
      reason,
      ...extra,
    });
  const read = await readIssueClaim(context, target, issue);
  if (read.state === 'missing') refuse('claim-missing');
  if (read.state !== 'valid') refuse('claim-invalid');
  if (read.claim.workflow !== 'autopilot' || read.claim.runId !== runId)
    fail('ISSUE_CLAIMED', `issue #${issue} is already claimed for planning`, {
      issue,
      repository: repositoryKey,
      holder: holderOf(context, read.claim),
    });
  let ledger;
  try {
    ledger = await readJson(
      context,
      path.join(context.root, '.effective-flow', 'autopilot', runId, 'run.json'),
    );
  } catch (error) {
    if (error instanceof IssueBuddyError) throw error;
    refuse('ledger-invalid');
  }
  if (ledger === undefined) refuse('no-ledger');
  if (!object(ledger) || ledger.runId !== runId) refuse('ledger-invalid');
  if (ledger.status !== 'open') refuse('run-closed');
  if (
    ledger.source?.kind !== 'issue' ||
    ledger.source.issue !== issue ||
    ledger.source.repository !== repositoryKey
  )
    refuse('wrong-source');
  const marker = adoptionPath(context, runId);
  let existing;
  try {
    existing = await readJson(context, marker);
  } catch (error) {
    if (error instanceof IssueBuddyError) throw error;
    refuse('adoption-invalid');
  }
  if (existing !== undefined) {
    if (!object(existing) || existing.runId !== runId || !PASS_ID.test(existing.passId ?? ''))
      refuse('adoption-invalid');
    if (existing.passId === passId) return;
    if (await passRecordPresent(context, existing.passId))
      refuse('already-adopted', { adopterPassId: existing.passId });
  }
  await atomic(
    context,
    marker,
    { runId, issue, passId, adoptedAt: context.now() },
    { createOnly: existing === undefined },
  );
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
function emptyPatch() {
  return { records: {}, attempts: {}, observations: {} };
}
function patchEmpty(patch) {
  return (
    !Object.keys(patch.records).length &&
    !Object.keys(patch.attempts).length &&
    !Object.keys(patch.observations).length
  );
}
// The one cache writer. Under the mutex it re-reads `verdicts.json` and applies `patch`: verdict
// records and attempt identities only of `claimed` issues, closed-PR observations of any issue
// (an observation only ever adds a first-seen baseline). Everything else in the file is kept.
async function commitCache(context, repository, patch, claimed) {
  if (patchEmpty(patch)) return;
  for (const issue of [
    ...Object.keys(patch.records).map(Number),
    ...Object.values(patch.attempts).map((identity) => identity.issue),
  ])
    if (!claimed.has(issue))
      fail('UNSAFE_RUNTIME_STATE', 'cache write for an issue this pass holds no claim for');
  const cache = await loadCache(context, repository);
  if (cache.degradation) fail(cache.degradation.code, 'degraded cache is preserved');
  Object.assign(cache.value.records, patch.records);
  Object.assign(cache.value.attempts, patch.attempts);
  for (const [issue, observations] of Object.entries(patch.observations)) {
    const current = cache.value.closedPlanPrObservations[issue] ?? {};
    for (const [number, fp] of Object.entries(observations)) current[number] ??= fp;
    cache.value.closedPlanPrObservations[issue] = current;
  }
  validateCache(cache.value);
  await atomic(context, path.join(context.directory, 'verdicts.json'), cache.value);
}
// The pending-verdict journal binds the state of one issue's record and attempt, so writes of
// other passes for other issues never invalidate it.
function issueDigest(cache, issue, stableAttemptId) {
  return hash({
    issue,
    record: cache.records[issue] ?? null,
    attempt: stableAttemptId === undefined ? null : (cache.attempts[stableAttemptId] ?? null),
  });
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
  assertUnlocked(context);
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
// Network reads; never called while the mutation mutex is held.
async function planBranches(context, input) {
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
  return branches;
}
async function openPulls(context, repository) {
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
  return pulls;
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
  const branches = await planBranches(context, input);
  const issues = array(await remote(context, 'issue-list', { state: 'open' }, repository));
  const pulls = await openPulls(context, repository);
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
    // A single-issue selector (`--issue <N>`) restricts trust reads, candidates and therefore
    // recovery authority to that issue; the complete listing is still validated above.
    if (input.issue !== undefined && issue.number !== input.issue) continue;
    if (!(await trusted(issue.author))) {
      candidates.push({ issue: issue.number, skip: 'untrusted-author' });
      continue;
    }
    validOrdering(issue);
    const comments = [];
    let securityNotice = false;
    for (const comment of array(
      await remote(context, 'issue-comments-read', { number: issue.number }, repository),
    )) {
      if (!(await trusted(comment.author))) continue;
      const entry = {
        id: positive(comment.id),
        author: requiredLogin(comment.author.login),
        body: text(comment.body),
      };
      if (entry.body.startsWith(TRIAGE_SECURITY_MARKER)) securityNotice = true;
      if (!entry.body.startsWith(TRIAGE_MARKER)) comments.push(entry);
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
    if (
      securityNotice ||
      issue.labels.some(
        (label) =>
          LIFECYCLE.includes(label) ||
          GOAL_AUDIT_LABELS.includes(label) ||
          TRIAGE_SKIP_LABELS.includes(label),
      )
    )
      candidate.skip = 'lifecycle-label';
    else if (
      comments.some(
        (comment) =>
          comment.body.startsWith('<!-- effective-flow-plan-issues -->') ||
          comment.body.startsWith(BACKLOG_AUDIT_SPLIT_MARKER),
      )
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
  // A selected issue that is absent from the open listing (closed or missing) is its own stop
  // result, distinct from every skip reason, so a caller can tell it apart from a pass failure.
  if (input.issue !== undefined && !numbers.has(input.issue))
    fail('ISSUE_NOT_OPEN', 'selected issue is not in the open issue listing', {
      issue: input.issue,
    });
  const closedIssuePulls = [];
  for (const pr of pulls) {
    const parsed = parsePlanBranch(pr.head);
    if (
      (input.issue === undefined || parsed?.issue === input.issue) &&
      parsed?.branchPrefix === input.branchPrefix &&
      !numbers.has(parsed.issue) &&
      pr.sameRepository === true
    )
      closedIssuePulls.push(prIdentity(pr, parsed.issue, pr.head, repository));
  }
  return { oid, candidates, closedIssuePulls };
}
function collectRequest(input) {
  return {
    mode: input.mode,
    baseBranch: input.baseBranch,
    planDir: input.planDir,
    branchPrefix: input.branchPrefix,
    visibility: input.visibility,
    limits: limits(input.limits),
    staleAttempts: input.staleAttempts ?? [],
    repositoryVisibility: repositoryVisibility(input.repositoryVisibility),
    leftoverPlanFiles: leftoverPlanFiles(input.leftoverPlanFiles, input.planDir),
    ...(input.issue !== undefined ? { issue: input.issue } : {}),
    ...(input.autopilotRunId !== undefined ? { autopilotRunId: input.autopilotRunId } : {}),
  };
}
// Step 0 (locked): replay a finished collection, or persist the intent of a new attempt before
// any read or accounting. A killed or failed attempt can never replay into current authority.
async function beginCollection(context, input, state) {
  const pass = await readPass(context, input.passId);
  await reconcileVerdict(context, pass, 'pass-collect', input);
  if (pass.collection) {
    if (pass.collection.requestDigest !== state.requestDigest)
      invalid('conflicting collection replay');
    if (pass.collection.status === 'collecting') {
      // An attempt still in flight loses its authority; its later steps fail closed.
      const { attempt: _attempt, ...collection } = pass.collection;
      pass.collection = {
        ...collection,
        status: 'failed',
        failure: { code: 'UNSAFE_RUNTIME_STATE' },
      };
      await writePass(context, pass);
    }
    if (pass.collection.status === 'failed')
      fail(pass.collection.failure.code, 'previous collection failed');
    return { replay: pass.collection.result };
  }
  pass.collection = {
    status: 'collecting',
    attempt: state.attempt,
    requestDigest: state.requestDigest,
    planDir: state.request.planDir,
    repositoryVisibility: state.request.repositoryVisibility,
    leftoverPlanFiles: state.request.leftoverPlanFiles,
    mode: input.mode,
    limits: state.request.limits,
    repository: null,
  };
  await writePass(context, pass);
  return {};
}
async function readCollecting(context, input, state) {
  const pass = await readPass(context, input.passId);
  if (pass.collection?.status !== 'collecting' || pass.collection.attempt !== state.attempt)
    fail('UNSAFE_RUNTIME_STATE', 'the collection attempt was superseded; release this pass');
  return pass;
}
// Validates historical attempt evidence against the cache and itself before any accounting.
function validateStaleAttempts(input, cache) {
  if (input.mode !== 'publish') return;
  const seen = new Map();
  for (const attempt of input.staleAttempts ?? []) {
    const identity = attemptIdentity(
      attempt.stableAttemptId,
      attempt.issue,
      attempt.originalFingerprint,
    );
    if (identity.passId === input.passId)
      invalid('historical attempt must come from an earlier pass');
    const known = cache.attempts[attempt.stableAttemptId] ?? seen.get(attempt.stableAttemptId);
    if (known && !same(known, identity)) invalid('attempt identity reused with different evidence');
    seen.set(attempt.stableAttemptId, identity);
  }
}
// Historical accounting of one claimed candidate, after every current read succeeded and before
// its eligibility is decided. Only a claim holder ever writes an issue's failed record.
function applyStaleAttempts(context, input, candidate, cache, patch, excluded) {
  if (input.mode !== 'publish') return;
  for (const attempt of input.staleAttempts ?? []) {
    if (attempt.issue !== candidate.issue) continue;
    const identity = attemptIdentity(
      attempt.stableAttemptId,
      attempt.issue,
      attempt.originalFingerprint,
    );
    if (cache.attempts[attempt.stableAttemptId]) continue;
    if (
      excluded.has(candidate.issue) ||
      candidate.skip ||
      candidate.fingerprint !== attempt.originalFingerprint ||
      cacheSkip(cache, candidate.issue, candidate.fingerprint, input.mode)
    )
      continue;
    const failed = transition(
      cache,
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
    cache.records[attempt.issue] = failed;
    cache.attempts[attempt.stableAttemptId] = identity;
    patch.records[attempt.issue] = failed;
    patch.attempts[attempt.stableAttemptId] = identity;
  }
}
// Step 2 (locked): claim the selected and recovery candidates, re-read the cache, apply cache
// skips and accounting, and persist the claims. A batch pass replaces a candidate another run
// holds (`issue-in-progress`) by the next eligible one; a single-issue pass stops ISSUE_CLAIMED.
async function claimCandidates(context, input, state, reads) {
  const pass = await readCollecting(context, input, state);
  const { request, repository, repositoryKey } = state;
  const target = claimTargetOf(repositoryKey);
  const self = { passId: input.passId, claimTarget: target };
  const cache = await loadCache(context, repositoryKey);
  const patch = emptyPatch();
  const excluded = new Set(request.leftoverPlanFiles.map((entry) => entry.issue));
  validateStaleAttempts(input, cache.value);
  // Independent closed-PR observations survive every later verdict and input reset.
  for (const candidate of reads.candidates) {
    if (candidate.skip) continue;
    const observations = cache.value.closedPlanPrObservations[candidate.issue] ?? {};
    for (const pr of candidate.history.filter((pr) => pr.state === 'closed' && !pr.mergedAt)) {
      const key = String(positive(pr.number));
      if (!observations[key]) {
        observations[key] = candidate.fingerprint;
        (patch.observations[candidate.issue] ??= {})[key] = candidate.fingerprint;
      }
      if (observations[key] === candidate.fingerprint) candidate.skip = 'closed-without-merge';
    }
    if (Object.keys(observations).length)
      cache.value.closedPlanPrObservations[candidate.issue] = observations;
  }
  const claims = state.claims;
  // Every claim is persisted in the pass record as soon as it is taken, so a pass killed in the
  // middle of this step still names every claim it holds for `pass-close` and `pass-prune`.
  let persisted = false;
  const persistClaims = async () => {
    persisted = true;
    pass.claimTarget = target;
    pass.claims = [...claims.values()].sort((a, b) => a.issue - b.issue);
    pass.collection.repository = repositoryKey;
    await writePass(context, pass);
  };
  if (input.autopilotRunId !== undefined) {
    await adoptClaim(
      context,
      target,
      repositoryKey,
      input.issue,
      input.autopilotRunId,
      input.passId,
    );
    claims.set(input.issue, { issue: input.issue, adoptedRunId: input.autopilotRunId });
    await persistClaims();
  }
  // Whether this pass holds (or now takes) the issue's claim. `acquire: false` only probes.
  const contend = async (issue, acquire) => {
    if (claims.has(issue)) return true;
    let holder;
    if (acquire) {
      const result = await acquireIssueClaim(context, target, issue, input.passId);
      if (result.acquired) {
        claims.set(issue, { issue });
        await persistClaims();
        return true;
      }
      holder = result.holder;
    } else {
      const read = await readIssueClaim(context, target, issue);
      if (read.state === 'missing') return true;
      holder =
        read.state === 'valid'
          ? holderOf(context, read.claim)
          : { state: 'invalid', reason: read.reason };
    }
    if (input.issue !== undefined)
      fail('ISSUE_CLAIMED', `issue #${issue} is already claimed for planning`, {
        issue,
        repository: repositoryKey,
        holder,
      });
    return false;
  };
  const reasons = new Map();
  const recovery = { orphanBranches: [], unrecordedPullRequests: [] };
  const authorizedRecovery = [];
  const pool = [];
  for (const candidate of reads.candidates) {
    const cachedSkip =
      candidate.fingerprint &&
      cacheSkip(cache.value, candidate.issue, candidate.fingerprint, input.mode);
    if (candidate.skip) {
      const found = [];
      if (candidate.orphan)
        found.push({
          kind: 'orphan-branch',
          list: recovery.orphanBranches,
          entry: { issue: candidate.issue, headRef: candidate.headRef },
        });
      for (const pr of candidate.ownedPulls ?? []) {
        const record = cache.value.records[candidate.issue];
        if (record?.verdict === 'published' && record.pullRequest === pr.number) continue;
        found.push({
          kind: 'unrecorded-pull-request',
          list: recovery.unrecordedPullRequests,
          entry: prIdentity(pr, candidate.issue, candidate.headRef, repository),
        });
      }
      let reason = candidate.skip;
      if (found.length) {
        // Recovery is authorized only under a claim this pass holds, so another live run's
        // in-flight branch or pull request is never treated as orphaned. A pass of an autopilot
        // run never recovers: autopilot stops on an issue that already has a pull request or plan
        // branch (its skip reason) instead of continuing on it.
        const authorizable =
          !excluded.has(candidate.issue) &&
          !cachedSkip &&
          input.mode === 'publish' &&
          input.autopilotRunId === undefined;
        if (await contend(candidate.issue, authorizable))
          for (const { kind, list, entry } of found) {
            list.push(entry);
            if (authorizable)
              authorizedRecovery.push({
                ...entry,
                fingerprint: candidate.fingerprint,
                issueAuthor: candidate.issueAuthor,
                kind,
              });
          }
        else reason = 'issue-in-progress';
      }
      reasons.set(candidate.issue, reason);
    } else if (cachedSkip) reasons.set(candidate.issue, cachedSkip);
    else if (!excluded.has(candidate.issue)) pool.push(candidate);
  }
  pool.sort(
    (a, b) =>
      Number(b.priority) - Number(a.priority) ||
      a.updatedAt.localeCompare(b.updatedAt) ||
      a.issue - b.issue,
  );
  const selected = [];
  const settled = [];
  let unclaimed = 0;
  for (const candidate of pool) {
    if (selected.length >= request.limits.judgments) {
      unclaimed++;
      continue;
    }
    if (!(await contend(candidate.issue, true))) {
      reasons.set(candidate.issue, 'issue-in-progress');
      continue;
    }
    applyStaleAttempts(context, input, candidate, cache.value, patch, excluded);
    const skip = cacheSkip(cache.value, candidate.issue, candidate.fingerprint, input.mode);
    if (skip) {
      reasons.set(candidate.issue, skip);
      settled.push(candidate.issue);
    } else selected.push(candidate);
  }
  // Without any claim taken, the claim target and repository still enter the record once.
  if (!persisted) await persistClaims();
  // Atomic accounting is durable even if the subsequent handoff persistence fails.
  if (!patchEmpty(patch)) {
    if (cache.degradation) fail(cache.degradation.code, 'degraded cache is preserved');
    await commitCache(context, repositoryKey, patch, new Set(claims.keys()));
  }
  for (const issue of settled) {
    await releaseIssueClaim(context, self, claims.get(issue));
    if (!claims.get(issue).adoptedRunId) claims.delete(issue);
  }
  return {
    selected,
    reasons,
    recovery,
    authorizedRecovery,
    unclaimed,
    cacheDegradation: cache.degradation,
  };
}
// Step 3 (unlocked): another run may have published between the read phase and the claim. A
// claimed candidate whose plan branch or open pull request now exists is dropped, as is a
// recovery whose orphan gained a pull request or whose unrecorded pull request is gone.
async function recheckClaimed(context, input, state, claimed) {
  const dropped = { candidates: new Map(), recoveries: new Set() };
  if (!claimed.selected.length && !claimed.authorizedRecovery.length) return dropped;
  const branches = await planBranches(context, input);
  const pulls = await openPulls(context, state.repository);
  const referenced = (issue, headRef) =>
    pulls.some((pr) => prReference(pr, issue, state.repository, headRef));
  for (const candidate of claimed.selected) {
    if (branches.has(candidate.headRef))
      dropped.candidates.set(candidate.issue, 'plan-branch-exists');
    else if (referenced(candidate.issue, candidate.headRef))
      dropped.candidates.set(candidate.issue, 'open-pull-request');
  }
  for (const entry of claimed.authorizedRecovery) {
    const current =
      entry.kind === 'orphan-branch'
        ? branches.has(entry.headRef) && !referenced(entry.issue, entry.headRef)
        : pulls.some((pr) => pr.number === entry.number && pr.head === entry.headRef);
    if (!current) dropped.recoveries.add(entry.issue);
  }
  return dropped;
}
// Step 4 (locked): release the claims of dropped candidates, replace the trusted text of the
// claimed issues and persist the collection result as the pass's authority.
async function finalizeCollection(context, input, state, reads, claimed, dropped) {
  const pass = await readCollecting(context, input, state);
  const { request, repositoryKey } = state;
  const claims = state.claims;
  const self = { passId: input.passId, claimTarget: claimTargetOf(repositoryKey) };
  const drop = async (issue) => {
    const entry = claims.get(issue);
    if (!entry || entry.adoptedRunId) return;
    await releaseIssueClaim(context, self, entry);
    claims.delete(issue);
  };
  for (const [issue, reason] of dropped.candidates) {
    claimed.reasons.set(issue, reason);
    await drop(issue);
  }
  for (const issue of dropped.recoveries) await drop(issue);
  const authorizedRecovery = claimed.authorizedRecovery.filter(
    (entry) => !dropped.recoveries.has(entry.issue),
  );
  const selected = claimed.selected.filter((candidate) => !dropped.candidates.has(candidate.issue));
  // Trusted text is replaced only for issues this pass holds a claim for; another pass's
  // readiness or plan run keeps reading its own file at the fixed path.
  for (const issue of claims.keys()) await removeTrusted(context, issue);
  const slice = [];
  for (const candidate of selected) {
    const trustedTextPath = trustedPath(context, candidate.issue);
    await atomic(context, trustedTextPath, candidate.text);
    slice.push({
      issue: candidate.issue,
      fingerprint: candidate.fingerprint,
      issueAuthor: candidate.issueAuthor,
      headRef: candidate.headRef,
      trustedTextPath,
    });
  }
  const skipped = reads.candidates
    .filter((candidate) => claimed.reasons.has(candidate.issue))
    .map((candidate) => ({ issue: candidate.issue, reason: claimed.reasons.get(candidate.issue) }));
  const result = {
    passId: input.passId,
    mode: input.mode,
    repositoryVisibility: request.repositoryVisibility,
    leftoverPlanFiles: request.leftoverPlanFiles,
    repository: repositoryKey,
    limits: request.limits,
    ...(request.issue !== undefined ? { issue: request.issue } : {}),
    baseOid: reads.oid,
    eligible: slice,
    eligibleCount: slice.length + claimed.unclaimed,
    skipped,
    recovery: claimed.recovery,
    authorizedRecovery,
    issueClosedPlanPrOpen: reads.closedIssuePulls,
    cacheDegradation: claimed.cacheDegradation,
  };
  pass.claimTarget = self.claimTarget;
  pass.claims = [...claims.values()].sort((a, b) => a.issue - b.issue);
  pass.collection = {
    status: 'collected',
    requestDigest: state.requestDigest,
    planDir: request.planDir,
    result,
    outcomes: {},
  };
  await writePass(context, pass);
  return result;
}
// Records a failed attempt (locked) and releases the claims it took; adopted claims stay. A
// superseded attempt leaves the record to whoever superseded it.
async function failCollection(context, input, state, error) {
  const pass = await readPass(context, input.passId);
  if (pass.collection?.status !== 'collecting' || pass.collection.attempt !== state.attempt) return;
  if (state.repositoryKey) {
    const self = { passId: input.passId, claimTarget: claimTargetOf(state.repositoryKey) };
    const entries = new Map(state.claims);
    for (const entry of pass.claims ?? []) entries.set(entry.issue, entry);
    for (const entry of entries.values())
      if (!entry.adoptedRunId) await releaseIssueClaim(context, self, entry);
    pass.claimTarget = self.claimTarget;
    pass.claims = [...entries.values()]
      .filter((entry) => entry.adoptedRunId)
      .sort((a, b) => a.issue - b.issue);
  }
  pass.collection = {
    status: 'failed',
    requestDigest: state.requestDigest,
    planDir: state.request.planDir,
    repositoryVisibility: state.request.repositoryVisibility,
    leftoverPlanFiles: state.request.leftoverPlanFiles,
    mode: input.mode,
    limits: state.request.limits,
    repository: state.repositoryKey,
    failure: { code: error instanceof IssueBuddyError ? error.code : 'UNSAFE_RUNTIME_STATE' },
  };
  await writePass(context, pass);
}
async function collect(context, input) {
  const request = collectRequest(input);
  const state = {
    attempt: randomUUID(),
    request,
    requestDigest: hash(request),
    repository: null,
    repositoryKey: null,
    claims: new Map(),
    recorded: false,
  };
  const begun = await withMutationLock(context, () => beginCollection(context, input, state));
  if (begun.replay) return begun.replay;
  // A failure inside a locked step is recorded within that same step.
  const locked = (step) =>
    withMutationLock(context, async () => {
      try {
        return await step();
      } catch (error) {
        state.recorded = true;
        await failCollection(context, input, state, error).catch(() => {});
        throw error;
      }
    });
  try {
    // Step 1 (unlocked): fetch, forge and trust reads, selection inputs, recovery candidates.
    const repository = await remote(context, 'repository-resolve');
    if (repository.provider !== 'github')
      fail('UNSUPPORTED_PROVIDER', 'Issue Buddy supports GitHub only');
    state.repository = repository;
    state.repositoryKey = ledgerRepository(repository);
    const reads = await currentReads(context, input, repository);
    const claimed = await locked(() => claimCandidates(context, input, state, reads));
    const dropped = await recheckClaimed(context, input, state, claimed);
    return await locked(() => finalizeCollection(context, input, state, reads, claimed, dropped));
  } catch (error) {
    if (!state.recorded && error?.code !== 'LOCKED')
      await withMutationLock(context, () => failCollection(context, input, state, error)).catch(
        () => {},
      );
    if (error instanceof IssueBuddyError) throw error;
    fail('UNSAFE_RUNTIME_STATE', 'collection persistence failed');
  }
}
function authorizedOutcome(input, pass) {
  const collection = pass.collection;
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
function outcomeInput(context, pass, outcome) {
  exact(outcome, ['issue', 'verdict', 'reason', 'fingerprint'], ['pullRequest', 'stableAttemptId']);
  const input = {
    cwd: context.root,
    passId: pass.passId,
    mode: pass.collection.result.mode,
    ...outcome,
  };
  validateInput('verdict-record', input);
  if (!same(authorizedOutcome(input, pass), outcome)) invalid('invalid persisted verdict outcome');
  return input;
}
function cachedOutcomeMatches(record, outcome, pass) {
  return (
    record &&
    record.issue === outcome.issue &&
    record.recordedPassId === pass.passId &&
    record.mode === pass.collection.result.mode &&
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
function applyIntendedCache(context, cache, pass, pending) {
  const input = outcomeInput(context, pass, pending.outcome);
  const expected = transition(cache, input, pending.record.recordedAt);
  if (!same(expected, pending.record)) invalid('pending verdict transition differs from cache');
  const patch = emptyPatch();
  cache.records[input.issue] = pending.record;
  patch.records[input.issue] = pending.record;
  if (input.stableAttemptId) {
    const identity = attemptIdentity(
      input.stableAttemptId,
      input.issue,
      input.fingerprint,
      pass.passId,
    );
    cache.attempts[input.stableAttemptId] = identity;
    patch.attempts[input.stableAttemptId] = identity;
  }
  if (issueDigest(cache, input.issue, input.stableAttemptId) !== pending.afterDigest)
    invalid('pending verdict cache digest mismatch');
  return patch;
}
async function finalizeVerdict(context, pass, pending) {
  pass.collection.outcomes[pending.outcome.issue] = pending.outcome;
  delete pass.collection.pendingVerdict;
  await writePass(context, pass);
}
function claimedIssues(pass) {
  return new Set((pass.claims ?? []).map((entry) => entry.issue));
}
// A durable intent binds the complete outcome and the issue's record and attempt before and after
// the cache change. Only a proven committed cache may complete it automatically. A failed cache
// write requires the identical verdict retry; other work cannot turn an uncommitted intent into
// authority. Writes of other passes to other issues leave the issue digest unchanged.
async function reconcileVerdict(context, pass, operation, input) {
  const collection = pass.collection;
  if (collection?.status !== 'collected') return;
  const cache = await loadCache(context, collection.result.repository);
  const pending = collection.pendingVerdict;
  if (pending !== undefined) {
    exact(pending, ['outcome', 'record', 'beforeDigest', 'afterDigest']);
    const intendedInput = outcomeInput(context, pass, pending.outcome);
    match(pending.beforeDigest, /^[a-f0-9]{64}$/);
    match(pending.afterDigest, /^[a-f0-9]{64}$/);
    if (pending.beforeDigest === pending.afterDigest)
      invalid('pending verdict has no cache transition');
    validateCache({
      ...emptyCache(collection.result.repository),
      records: { [pending.outcome.issue]: pending.record },
    });
    if (
      !cachedOutcomeMatches(pending.record, pending.outcome, pass) ||
      collection.outcomes[pending.outcome.issue]
    )
      invalid('pending verdict conflicts with pass authority');
    assertPublicationLimit(collection, pending.outcome);
    if (cache.degradation)
      fail(
        cache.degradation.code,
        'pending verdict cache is unavailable; release this pass or repair its cache',
      );
    const digest = issueDigest(cache.value, pending.outcome.issue, intendedInput.stableAttemptId);
    if (digest === pending.beforeDigest) {
      if (operation !== 'verdict-record' || input.issue !== pending.outcome.issue)
        fail(
          'UNSAFE_RUNTIME_STATE',
          'verdict cache commit is incomplete; retry the identical verdict-record or explicitly release this pass',
        );
      if (!same(authorizedOutcome(input, pass), pending.outcome))
        invalid('conflicting pending verdict replay');
      const patch = applyIntendedCache(context, cache.value, pass, pending);
      await commitCache(context, collection.result.repository, patch, claimedIssues(pass));
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
          pass.passId,
        ),
      )
    )
      invalid('pending cache attempt differs');
    await finalizeVerdict(context, pass, pending);
    await settleClaim(context, pass, pending.outcome.issue);
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
      record.recordedPassId === pass.passId &&
      !cachedOutcomeMatches(record, collection.outcomes[record.issue] ?? {}, pass)
    )
      fail(
        'UNSAFE_RUNTIME_STATE',
        'cached verdict lacks a proven pass outcome; explicitly release this pass',
      );
  }
  for (const outcome of Object.values(collection.outcomes)) {
    const known = outcomeInput(context, pass, outcome);
    const record = cache.value.records[outcome.issue];
    // A later run that claimed the issue after this pass settled it may supersede the record;
    // only the record itself proves that, never its absence.
    const superseded = record !== undefined && record.recordedPassId !== pass.passId;
    if (
      (!superseded && !cachedOutcomeMatches(record, outcome, pass)) ||
      (known.stableAttemptId &&
        !same(
          cache.value.attempts[known.stableAttemptId],
          attemptIdentity(known.stableAttemptId, known.issue, known.fingerprint, pass.passId),
        ))
    )
      fail(
        'UNSAFE_RUNTIME_STATE',
        'pass outcome differs from committed cache; explicitly release this pass',
      );
  }
}
async function record(context, input, pass) {
  const collection = pass.collection;
  const outcome = authorizedOutcome(input, pass);
  const result = collection.result;
  const previousOutcome = collection.outcomes[input.issue];
  if (previousOutcome) {
    if (!same(previousOutcome, outcome)) invalid('conflicting verdict replay');
    return previousOutcome;
  }
  assertPublicationLimit(collection, outcome);
  // A verdict is written only under the live claim this pass holds for the issue.
  await requireClaim(context, pass, input.issue);
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
  const beforeDigest = issueDigest(cache.value, input.issue, input.stableAttemptId);
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
  const patch = emptyPatch();
  patch.records[input.issue] = cache.value.records[input.issue];
  if (identity) {
    cache.value.attempts[input.stableAttemptId] = identity;
    patch.attempts[input.stableAttemptId] = identity;
  }
  const pending = {
    outcome,
    record: cache.value.records[input.issue],
    beforeDigest,
    afterDigest: issueDigest(cache.value, input.issue, input.stableAttemptId),
  };
  collection.pendingVerdict = pending;
  await writePass(context, pass);
  await commitCache(context, result.repository, patch, claimedIssues(pass));
  await finalizeVerdict(context, pass, pending);
  await settleClaim(context, pass, input.issue);
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
    version === 1 ? [] : ['baseMoves'],
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
  if (report.baseMoves !== undefined) baseMoveOutcomes(report);
  return report;
}
// Each base move is bound to the pass outcome by its reason, through `plan-publication`'s
// `BASE_MOVE_STOPPING_REASONS`: a re-publishing move (`fits`, or an unresolved one published with
// its flag) to its issue's confirmed PR, its `failed` verdict or a failed pass; a stopping move to a
// failed pass with the null `publish`/`BASE_CHANGED` failure. A dry run publishes nothing, so it
// carries no base move.
function baseMoveOutcomes(report) {
  baseMoves(report.baseMoves);
  if (report.mode !== 'publish') invalid('dry-run base move');
  const stopped =
    report.outcome === 'failed' &&
    report.failures.some(
      (entry) => entry.issue === null && entry.stage === 'publish' && entry.code === 'BASE_CHANGED',
    );
  for (const entry of report.baseMoves) {
    const bound = baseMoveRepublishes(entry.reason)
      ? report.outcome === 'failed' ||
        report.pullRequestsOpened.some((pr) => pr.issue === entry.issue) ||
        report.verdicts.some((item) => item.issue === entry.issue && item.verdict === 'failed')
      : stopped;
    if (!bound) invalid('base move does not match the pass outcome');
  }
}
async function report(context, input, pass, resolved) {
  const collection = pass.collection;
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
    // The repository was resolved before the mutex was taken; no forge call runs under it.
    if (!repository) {
      if (resolved === undefined)
        fail('UNSAFE_RUNTIME_STATE', 'the pass changed during its report; retry the report');
      repository = ledgerRepository(resolved);
    }
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
    // A base move is assessed from the collected base, for an issue this pass collected.
    if (input.baseMoves !== undefined) {
      if (
        !collected ||
        input.baseMoves.some(
          (entry) =>
            entry.fromBaseOid !== collected.baseOid ||
            !collected.eligible.some((candidate) => candidate.issue === entry.issue),
        )
      )
        invalid('base move differs from persisted collection');
      metadata.baseMoves = input.baseMoves;
    }
  }
  const value = validatePassReport({
    schemaVersion: version,
    ...metadata,
    passId: input.passId,
    mode: currentMode,
    outcome: input.outcome,
    repository,
    startedAt: pass.acquiredAt,
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
// Whether a report of this pass has to resolve its repository through the tracker.
function reportNeedsRepository(pass) {
  return !(
    pass.collection?.status === 'collected' ||
    (pass.collection?.status === 'failed' && pass.collection.repository)
  );
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
    } else if (operation === 'pass-collect') data = await collect(context, input);
    else if (operation === 'pass-list') data = await listPasses(context);
    else if (operation === 'pass-report') {
      // Read-only peek outside the mutex: a forge read, if needed, happens before it is taken.
      const peek = await readPass(context, input.passId);
      const resolved = reportNeedsRepository(peek)
        ? await remote(context, 'repository-resolve')
        : undefined;
      data = await withMutationLock(context, async () => {
        const pass = await readPass(context, input.passId);
        await reconcileVerdict(context, pass, operation, input);
        return report(context, input, pass, resolved);
      });
    } else
      data = await withMutationLock(context, async () => {
        if (operation === 'pass-open') return openPass(context);
        if (operation === 'pass-close') return closePass(context, input.passId);
        if (operation === 'pass-prune') return prunePass(context, input);
        if (operation === 'trusted-prune') return pruneTrusted(context, input);
        const pass = await readPass(context, input.passId);
        await reconcileVerdict(context, pass, operation, input);
        return record(context, input, pass);
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
