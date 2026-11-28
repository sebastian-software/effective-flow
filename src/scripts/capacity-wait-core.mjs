// Capacity wait: the deterministic rules behind a validation command that the execution
// environment refused to start for temporary lack of capacity (`shared/capacity-refusal-retry.md`
// owns the contract this module implements).
//
// - `schedule` decides, for one refused command, whether the next attempt may start and after which
//   delay: 1, 2, 5, then 10 minutes, each bounded by the time left before the deadline and by the
//   host's longest safe wait. The deadline is anchored at the first refusal and never moves; no
//   attempt starts at or after it, with a zero budget, or after cancellation. It only computes: the
//   check executor still launches the command and owns its timing.
// - `bind` reads the identity of a checkout whose validation gate is waiting for capacity (root,
//   branch, HEAD, an in-progress merge, the index, tracked changes and untracked files) and returns
//   it as one resume binding. `verify` recomputes that identity and names every field that drifted,
//   so a later explicit resume reruns the interrupted gate only on unchanged input.
// - `forge-line` renders the only capacity detail a forge text or publishable evidence may carry.
//
// The canonical `Capacity wait:` line value travels in validator handoffs and nested workflow
// delegations; `formatCapacityWait` and `parseCapacityWait` are its only writer and reader.
//
// Git access is read-only and goes through the injected runner without a shell, with an
// environment stripped of inherited `GIT_*` variables: `rev-parse`, `symbolic-ref`, `ls-files` and
// `diff`. Untracked files are read through the injected file system, a symbolic link by its target
// text. Nothing is written, fetched or staged.

import { createHash } from 'node:crypto';
import nodeFs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { MAX_CAPACITY_BUDGET_MINUTES, gitBaseEnv } from './config-resolve-core.mjs';

export const CAPACITY_WAIT_OPERATIONS = Object.freeze(['schedule', 'bind', 'verify', 'forge-line']);

export const CAPACITY_WAIT_ERROR_CODES = Object.freeze([
  'INVALID_INPUT',
  'GIT_FAILED',
  'INTERNAL_ERROR',
]);

const EXIT_CODES = Object.freeze({ INVALID_INPUT: 2, GIT_FAILED: 1, INTERNAL_ERROR: 1 });

export const MAX_STDIN_BYTES = 64 * 1024;

// The check state of a command whose non-start for lack of capacity the environment attested, and
// the run-level result of a gate that is still waiting for capacity.
export const CAPACITY_STATE = 'not executed (capacity)';
export const WAITING_RESULT = 'waiting for capacity';

export const CAPACITY_WAIT_KEYWORD = 'Capacity wait';
export const CAPACITY_RESUME_KEYWORD = 'Capacity resume';

// The budget an omitted or invalid `validation.capacityWaitBudgetMinutes` falls back to.
export const DEFAULT_BUDGET_MINUTES = 120;
// The largest budget a line or a schedule accepts, the configuration resolver's own bound.
export const MAX_BUDGET_MINUTES = MAX_CAPACITY_BUDGET_MINUTES;

// The delay before attempt n + 1 after n refused attempts; the last entry repeats.
export const RETRY_DELAYS_SECONDS = Object.freeze([60, 120, 300, 600]);

// Why `schedule` starts no further attempt.
export const STOP_REASONS = Object.freeze(['cancelled', 'budget-zero', 'deadline', 'host-limit']);

// The fields `verify` compares, in report order.
export const BINDING_FIELDS = Object.freeze(['root', 'branch', 'head', 'input']);
const BINDING_KEYS = Object.freeze(['version', 'workflow', 'runId', 'gate', ...BINDING_FIELDS]);

const INSTANT_FORMAT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;
const LINE_FORMAT = /^budget=(0|[1-9]\d{0,5})m; deadline=(unanchored|\S+)$/;
const OBJECT_ID_FORMAT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const DIGEST_FORMAT = /^[0-9a-f]{64}$/;
const NAME_FORMAT = /^[a-z][a-z0-9-]{0,63}$/;
const RUN_ID_FORMAT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export class CapacityWaitError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CapacityWaitError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new CapacityWaitError(code, message, details);
}

// ---------------------------------------------------------------------------------------------
// Instants and the canonical line

// Parses a UTC instant of the exact form `YYYY-MM-DDTHH:MM:SSZ` into epoch seconds, or null.
export function parseInstant(value) {
  if (typeof value !== 'string') return null;
  const match = INSTANT_FORMAT.exec(value);
  if (!match) return null;
  const millis = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
  if (!Number.isFinite(millis)) return null;
  const seconds = millis / 1000;
  // A calendar overflow (February 30th, hour 24) normalizes to another instant; refuse it.
  return formatInstant(seconds) === value ? seconds : null;
}

export function formatInstant(seconds) {
  return `${new Date(seconds * 1000).toISOString().slice(0, 19)}Z`;
}

function isBudget(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_BUDGET_MINUTES;
}

// The value of a `Capacity wait:` line: `budget=<minutes>m; deadline=<instant|unanchored>`.
export function formatCapacityWait({ budgetMinutes, deadline }) {
  if (!isBudget(budgetMinutes)) fail('INVALID_INPUT', 'budgetMinutes is out of range');
  if (deadline !== null && parseInstant(deadline) === null) {
    fail('INVALID_INPUT', 'deadline must be a UTC instant or null');
  }
  return `budget=${budgetMinutes}m; deadline=${deadline ?? 'unanchored'}`;
}

// Parses one `Capacity wait:` line value strictly: `{budgetMinutes, deadline}` (deadline null while
// unanchored), or null for any other form.
export function parseCapacityWait(value) {
  if (typeof value !== 'string') return null;
  const match = LINE_FORMAT.exec(value);
  if (!match) return null;
  const budgetMinutes = Number(match[1]);
  if (!isBudget(budgetMinutes)) return null;
  if (match[2] === 'unanchored') return { budgetMinutes, deadline: null };
  return parseInstant(match[2]) === null ? null : { budgetMinutes, deadline: match[2] };
}

// ---------------------------------------------------------------------------------------------
// schedule

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_INPUT', `${label} must be a JSON object`);
  }
}

function requireExactKeys(value, allowed, required, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail('INVALID_INPUT', `${label} has unknown key ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail('INVALID_INPUT', `${label} needs ${key}`);
  }
}

function optionalInstant(input, key) {
  if (input[key] === undefined || input[key] === null) return null;
  const seconds = parseInstant(input[key]);
  if (seconds === null) fail('INVALID_INPUT', `${key} must be a UTC instant YYYY-MM-DDTHH:MM:SSZ`);
  return seconds;
}

function nowSeconds(input, deps) {
  const explicit = optionalInstant(input, 'now');
  if (explicit !== null) return explicit;
  const clock = typeof deps.now === 'function' ? deps.now() : Date.now();
  return Math.floor(clock / 1000);
}

const SCHEDULE_KEYS = Object.freeze([
  'budgetMinutes',
  'deadline',
  'firstRefusalAt',
  'attempts',
  'now',
  'hostMaxWaitSeconds',
  'cancelled',
]);

// Decides the next attempt of one refused command. `attempts` counts the refused launches so far,
// the first refusal included; `deadline` is the handed anchor, or null while no refusal of this run
// has anchored it yet, in which case `firstRefusalAt` (default: now) anchors it.
export function schedule(input, deps = {}) {
  requireObject(input, 'input');
  requireExactKeys(input, SCHEDULE_KEYS, ['budgetMinutes', 'attempts'], 'input');
  if (!isBudget(input.budgetMinutes)) {
    fail('INVALID_INPUT', `budgetMinutes must be an integer from 0 to ${MAX_BUDGET_MINUTES}`);
  }
  if (!Number.isSafeInteger(input.attempts) || input.attempts < 1) {
    fail('INVALID_INPUT', 'attempts must be a positive integer (the first refusal counts)');
  }
  const host = input.hostMaxWaitSeconds ?? null;
  if (host !== null && (!Number.isSafeInteger(host) || host < 0)) {
    fail('INVALID_INPUT', 'hostMaxWaitSeconds must be a non-negative integer or null');
  }
  if (input.cancelled !== undefined && typeof input.cancelled !== 'boolean') {
    fail('INVALID_INPUT', 'cancelled must be a Boolean');
  }
  const now = nowSeconds(input, deps);
  const handedDeadline = optionalInstant(input, 'deadline');
  const firstRefusal = optionalInstant(input, 'firstRefusalAt') ?? now;
  if (firstRefusal > now) fail('INVALID_INPUT', 'firstRefusalAt lies after now');
  const deadline = handedDeadline ?? firstRefusal + input.budgetMinutes * 60;
  const common = {
    attempts: input.attempts,
    firstRefusalAt: formatInstant(firstRefusal),
    deadline: formatInstant(deadline),
    elapsedSeconds: now - firstRefusal,
    line: formatCapacityWait({
      budgetMinutes: input.budgetMinutes,
      deadline: formatInstant(deadline),
    }),
  };
  const stop = (reason) => ({ action: 'stop', stop: reason, ...common });
  if (input.cancelled === true) return stop('cancelled');
  if (input.budgetMinutes === 0) return stop('budget-zero');
  // The latest permitted start is one second before the deadline, so no attempt starts at it.
  const remaining = deadline - now;
  if (remaining <= 1) return stop('deadline');
  const scheduled = RETRY_DELAYS_SECONDS[Math.min(input.attempts, RETRY_DELAYS_SECONDS.length) - 1];
  let delaySeconds = Math.min(scheduled, remaining - 1);
  if (host !== null) {
    if (host === 0) return stop('host-limit');
    delaySeconds = Math.min(delaySeconds, host);
  }
  return {
    action: 'retry',
    stop: null,
    delaySeconds,
    retryAt: formatInstant(now + delaySeconds),
    ...common,
  };
}

// ---------------------------------------------------------------------------------------------
// bind and verify

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  return Buffer.from(typeof value === 'string' ? value : '', 'utf8');
}

function makeContext(deps) {
  if (typeof deps.runner !== 'function') {
    fail('INTERNAL_ERROR', 'capacity-wait needs an injected process runner');
  }
  return { runner: deps.runner, env: gitBaseEnv(deps.env ?? process.env), fs: deps.fs ?? nodeFs };
}

// Runs one read-only Git command; returns stdout as a Buffer, or null for `absentStatus`.
async function git(context, cwd, args, absentStatus = null) {
  const result = await context.runner({
    executable: 'git',
    args: ['-C', cwd, '-c', 'core.fsmonitor=false', '--no-optional-locks', ...args],
    cwd,
    env: context.env,
  });
  if (!result?.error && result?.status === 0) return asBuffer(result.stdout);
  if (!result?.error && absentStatus !== null && result?.status === absentStatus) return null;
  const detail = result?.error?.message ?? asBuffer(result?.stderr).toString('utf8').trim();
  fail('GIT_FAILED', `git ${args[0]} failed${detail ? `: ${detail.split('\n')[0]}` : ''}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function requireCwd(input) {
  if (typeof input.cwd !== 'string' || !path.isAbsolute(input.cwd)) {
    fail('INVALID_INPUT', 'cwd must be an absolute path');
  }
  return input.cwd;
}

// Non-ignored, untracked entries by path, type, mode and content (link target for symlinks).
async function untrackedDigests(context, root) {
  const listing = await git(context, root, ['ls-files', '-z', '--others', '--exclude-standard']);
  const paths = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
    .decode(listing)
    .split('\0')
    .filter(Boolean)
    .sort();
  const entries = [];
  for (const relative of paths) {
    const absolute = path.join(root, relative);
    const stat = await context.fs.lstat(absolute);
    const symlink = stat.isSymbolicLink();
    if (!symlink && !stat.isFile()) {
      fail('GIT_FAILED', `cannot bind a non-file entry: ${relative}`);
    }
    const bytes = symlink
      ? await context.fs.readlink(absolute, { encoding: 'buffer' })
      : await context.fs.readFile(absolute);
    entries.push([relative, symlink ? 'link' : 'file', stat.mode & 0o777, sha256(bytes)]);
  }
  return entries;
}

// The identity of one checkout: its root, branch (null when detached), HEAD, and one digest over an
// in-progress merge, the index with its conflict stages, the tracked changes and the untracked files.
export async function checkoutIdentity(cwd, deps = {}) {
  const context = makeContext(deps);
  const root = (await git(context, cwd, ['rev-parse', '--show-toplevel']))
    .toString('utf8')
    .replace(/\n$/, '');
  const head = (await git(context, root, ['rev-parse', '--verify', '-q', 'HEAD^{commit}'], 1))
    ?.toString('utf8')
    .trim();
  if (!head || !OBJECT_ID_FORMAT.test(head)) {
    fail('GIT_FAILED', 'the checkout has no HEAD commit');
  }
  const branch =
    (await git(context, root, ['symbolic-ref', '-q', 'HEAD'], 1))?.toString('utf8').trim() ?? null;
  const mergeHead =
    (await git(context, root, ['rev-parse', '--verify', '-q', 'MERGE_HEAD'], 1))
      ?.toString('utf8')
      .trim() ?? null;
  const index = await git(context, root, ['ls-files', '-z', '--stage']);
  const diff = await git(context, root, [
    'diff',
    '--binary',
    '--no-ext-diff',
    '--no-textconv',
    '--no-renames',
    '--no-color',
    'HEAD',
    '--',
  ]);
  const untracked = await untrackedDigests(context, root);
  const input = sha256(
    JSON.stringify({
      head,
      branch,
      mergeHead,
      index: sha256(index),
      diff: sha256(diff),
      untracked,
    }),
  );
  return { root, branch, head, input };
}

function requireName(value, label, format = NAME_FORMAT) {
  if (typeof value !== 'string' || !format.test(value))
    fail('INVALID_INPUT', `${label} is invalid`);
  return value;
}

export async function bind(input, deps = {}) {
  requireObject(input, 'input');
  requireExactKeys(
    input,
    ['cwd', 'workflow', 'runId', 'gate'],
    ['cwd', 'workflow', 'runId', 'gate'],
    'input',
  );
  const cwd = requireCwd(input);
  const workflow = requireName(input.workflow, 'workflow');
  const runId = requireName(input.runId, 'runId', RUN_ID_FORMAT);
  const gate = requireName(input.gate, 'gate');
  const identity = await checkoutIdentity(cwd, deps);
  const binding = { version: 1, workflow, runId, gate, ...identity };
  return { binding, line: `${CAPACITY_RESUME_KEYWORD}: ${JSON.stringify(binding)}` };
}

// Validates a resume binding: exactly the keys `bind` writes, in any order.
export function normalizeBinding(value) {
  requireObject(value, 'binding');
  requireExactKeys(value, BINDING_KEYS, BINDING_KEYS, 'binding');
  if (value.version !== 1) fail('INVALID_INPUT', 'binding.version must be 1');
  requireName(value.workflow, 'binding.workflow');
  requireName(value.runId, 'binding.runId', RUN_ID_FORMAT);
  requireName(value.gate, 'binding.gate');
  if (typeof value.root !== 'string' || !path.isAbsolute(value.root)) {
    fail('INVALID_INPUT', 'binding.root must be an absolute path');
  }
  if (value.branch !== null && (typeof value.branch !== 'string' || value.branch === '')) {
    fail('INVALID_INPUT', 'binding.branch must be a ref name or null');
  }
  if (typeof value.head !== 'string' || !OBJECT_ID_FORMAT.test(value.head)) {
    fail('INVALID_INPUT', 'binding.head must be a full object id');
  }
  if (typeof value.input !== 'string' || !DIGEST_FORMAT.test(value.input)) {
    fail('INVALID_INPUT', 'binding.input must be a SHA-256 digest');
  }
  return { ...value };
}

export async function verify(input, deps = {}) {
  requireObject(input, 'input');
  requireExactKeys(input, ['cwd', 'binding'], ['cwd', 'binding'], 'input');
  const cwd = requireCwd(input);
  const binding = normalizeBinding(input.binding);
  const current = await checkoutIdentity(cwd, deps);
  const drift = BINDING_FIELDS.filter((field) => current[field] !== binding[field]);
  return {
    match: drift.length === 0,
    drift,
    workflow: binding.workflow,
    runId: binding.runId,
    gate: binding.gate,
    current,
  };
}

// ---------------------------------------------------------------------------------------------
// forge-line

export function forgeLine(input) {
  requireObject(input, 'input');
  requireExactKeys(input, ['attempts'], ['attempts'], 'input');
  if (!Number.isSafeInteger(input.attempts) || input.attempts < 1) {
    fail('INVALID_INPUT', 'attempts must be a positive integer');
  }
  return { line: `${CAPACITY_STATE}; attempts: ${input.attempts}` };
}

// ---------------------------------------------------------------------------------------------
// Dispatch

const HANDLERS = Object.freeze({
  schedule: async (input, deps) => schedule(input, deps),
  bind,
  verify,
  'forge-line': async (input) => forgeLine(input),
});

export async function executeOperation(operation, input = {}, deps = {}) {
  try {
    if (!CAPACITY_WAIT_OPERATIONS.includes(operation)) {
      fail('INVALID_INPUT', `unknown operation: ${operation}`);
    }
    const data = await HANDLERS[operation](input, deps);
    return { ok: true, operation, data };
  } catch (error) {
    return errorEnvelope(operation, error);
  }
}

export function errorEnvelope(operation, error) {
  const normalized =
    error instanceof CapacityWaitError
      ? error
      : new CapacityWaitError(
          'INTERNAL_ERROR',
          error?.message ?? 'unexpected capacity-wait failure',
        );
  return {
    ok: false,
    operation: operation ?? null,
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details ?? {},
      retryable: false,
    },
  };
}

export function exitCodeFor(envelope) {
  if (envelope.ok) return 0;
  return EXIT_CODES[envelope.error.code] ?? 1;
}
