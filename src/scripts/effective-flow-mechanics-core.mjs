// Deterministic mechanics of five procedures that used to exist only as prose:
//
// - base-branch resolution (`base-branch-resolve`, `base-branch-fetch`),
// - dated name allocation with per-family collision suffixes (`name-allocate`),
// - delivery branch naming with hidden-mode disclosure stripping (`delivery-branch-name`),
// - ADR numbering (`adr-observe`, `adr-allocate`),
// - plan-reference resolution (`plan-reference-resolve`).
//
// The owning fragments keep the judgment and the outcome handling; this module computes only what
// they make mechanical. It imports the code that owns a rule instead of copying it, and only from
// leaf cores whose own imports are `node:` built-ins: `plan-lint-core` (plan-file contract, plan
// roots, safe reader), `delivery-selection-core` (fetch hardening), `remote-tracker-shared-core`
// (disclosure patterns). It spawns nothing: Git runs through the injected runner, which the CLI
// takes from `process-runner.mjs`. Every operation is a computation or a read, except that
// `base-branch-fetch` updates remote-tracking refs through `git fetch`.

import nodeFs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  PlanLintError,
  UNATTENDED_PLAN_NAME,
  classifyPlanText,
  listTopLevel,
  readPlanFile,
  refPathProblem,
  resolveFileEntry,
  resolveRoots,
} from './plan-lint-core.mjs';
import {
  DeliverySelectionError,
  HOOKS_DISABLED,
  UPSTREAM_FETCH_TIMEOUT_MS,
  diagnosticText,
  fetchableUpstream,
  nonInteractiveFetchEnv,
} from './delivery-selection-core.mjs';
import {
  PRODUCT_NAME_PATTERNS,
  RemoteTrackerError,
  assertUndisclosed,
} from './remote-tracker-shared-core.mjs';

export const MECHANICS_OPERATIONS = Object.freeze([
  'base-branch-resolve',
  'base-branch-fetch',
  'name-allocate',
  'delivery-branch-name',
  'adr-observe',
  'adr-allocate',
  'plan-reference-resolve',
]);

// The CLI reads at most this much stdin, like `setup-status.mjs`.
export const MAX_STDIN_BYTES = 64 * 1024;

// The tools that name a delivery branch: every tool embedding `worktree-integration`, plus
// `deliver`, which names `<prefix>/deliver/<slug>` itself. A test compares this list with the tool
// sources, so a new branch-producing tool fails until it is listed here.
export const BRANCH_SKILLS = Object.freeze([
  'build',
  'deliver',
  'docs',
  'fix',
  'iterate',
  'maintain',
  'refactor',
]);

// The workflows that write a `review-report-YYYY-MM-DD-<workflow>` report: every tool embedding
// `unresolved-review-report`. Guarded against the tool sources like `BRANCH_SKILLS`.
export const REPORT_WORKFLOWS = Object.freeze(['build', 'fix', 'maintain', 'refactor']);

// One row per name family: its required inputs, the suffix the first collision takes, and the
// name stem. A suffixed name is `<stem>-<N>.md`, an unsuffixed one `<stem>.md`.
const FAMILIES = Object.freeze({
  plan: { inputs: ['text'], start: 2, planRoots: true, stem: (v) => `${v.date}-${v.slug}` },
  concept: { inputs: ['text'], start: 2, stem: (v) => `${v.date}-${v.slug}` },
  'unattended-plan': {
    inputs: ['text', 'issue'],
    start: 2,
    planRoots: true,
    stem: (v) => `${v.date}-issue-${v.issue}-${v.slug}`,
  },
  'review-report-plan': {
    inputs: ['planSlug'],
    start: 1,
    stem: (v) => `review-report-${v.date}-plan-${v.planSlug}`,
  },
  'review-report-workflow': {
    inputs: ['workflow'],
    start: 1,
    stem: (v) => `review-report-${v.date}-${v.workflow}`,
  },
  'review-report-security': {
    inputs: [],
    start: 1,
    stem: (v) => `review-report-${v.date}-security`,
  },
  'review-report-local': { inputs: [], start: 1, stem: (v) => `review-report-${v.date}` },
  investigation: { inputs: ['text'], start: 1, stem: (v) => `investigation-${v.date}-${v.slug}` },
});

export const NAME_FAMILIES = Object.freeze(Object.keys(FAMILIES));

const NAME_INPUTS = ['text', 'issue', 'workflow', 'planSlug'];

// The plan-numbering slug alphabet: `a–z`, `0–9`, inner hyphens.
const SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const SLUG_MAX_LENGTH = 80;

// A suffix search that never ends would mean a directory listing that keeps growing; stop instead.
const MAX_SUFFIX = 10_000;

const EXIT_CODES = Object.freeze({ INVALID_INPUT: 2, UNSAFE_PATH: 3 });

export class MechanicsError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'MechanicsError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new MechanicsError(code, message, details);
}

// ---------------------------------------------------------------------------------------------
// Error re-coding at the core boundary

// Errors from the imported cores keep their message and take this helper's code.
export function recodeError(error) {
  if (error instanceof MechanicsError) return error;
  if (error instanceof PlanLintError) {
    if (error.code === 'INVALID_PAYLOAD' || error.code === 'INVALID_CWD') {
      return new MechanicsError('INVALID_INPUT', error.message);
    }
    if (error.code === 'UNSAFE_PATH') return new MechanicsError('UNSAFE_PATH', error.message);
    // NOT_FOUND reaches here only from root resolution (a dangling, looping or non-directory
    // planDir) or a plan file that vanished after listing; `details.sourceCode` keeps the origin.
    // A single entry that is not found is handled where it is resolved, as no candidate.
    if (error.code === 'NOT_FOUND') {
      return new MechanicsError('UNSAFE_PATH', error.message, { sourceCode: 'NOT_FOUND' });
    }
    if (error.code === 'COMMAND_FAILED') return new MechanicsError('COMMAND_FAILED', error.message);
    return new MechanicsError('INTERNAL', error.message);
  }
  if (error instanceof DeliverySelectionError || error instanceof RemoteTrackerError) {
    if (String(error.code).startsWith('INVALID_')) {
      return new MechanicsError('INVALID_INPUT', error.message);
    }
    if (error.code === 'COMMAND_FAILED') {
      return new MechanicsError('COMMAND_FAILED', error.message);
    }
    return new MechanicsError('INTERNAL', error.message);
  }
  return new MechanicsError('INTERNAL', error?.message ?? 'unexpected mechanics failure');
}

// ---------------------------------------------------------------------------------------------
// Slug and date

const DIGRAPHS = Object.freeze({
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
  ẞ: 'SS',
});

// NFC, German digraphs, lowercase, NFKD without combining marks, non-`[a-z0-9]` runs to one
// hyphen, edge hyphens trimmed, then capped at 80 characters at the last hyphen at or before the
// cap (a hard cut when the head has none) and trimmed again.
export function slugify(text) {
  let slug = String(text)
    .normalize('NFC')
    .replace(/[äöüßÄÖÜẞ]/g, (character) => DIGRAPHS[character])
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length > SLUG_MAX_LENGTH) {
    const cut = slug.lastIndexOf('-', SLUG_MAX_LENGTH);
    slug = (cut > 0 ? slug.slice(0, cut) : slug.slice(0, SLUG_MAX_LENGTH)).replace(/^-+|-+$/g, '');
  }
  return slug;
}

// The local calendar date in the given time zone (the process zone by default), as `date +%F`.
export function localDate(instant = new Date(), timeZone = undefined) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type) => parts.find((entry) => entry.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// ---------------------------------------------------------------------------------------------
// Input validation

function requireInput(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('INVALID_INPUT', 'the input must be a JSON object');
  }
  const unknown = Object.keys(input).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    fail('INVALID_INPUT', `unknown input keys: ${unknown.join(', ')}`, { keys: unknown });
  }
  return input;
}

function requireString(value, field, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value === '')) {
    fail('INVALID_INPUT', `${field} must be a${allowEmpty ? '' : ' non-empty'} string`, { field });
  }
  if (value.includes('\0'))
    fail('INVALID_INPUT', `${field} must not contain a NUL byte`, { field });
  return value;
}

function requireEnum(value, field, allowed) {
  if (!allowed.includes(value)) {
    fail('INVALID_INPUT', `${field} must be one of ${allowed.join(', ')}`, { field });
  }
  return value;
}

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') fail('INVALID_INPUT', `${field} must be a boolean`, { field });
  return value;
}

// `cwd` is the verified absolute root of the run; its canonical path anchors every containment.
function requireCwd(input, fs) {
  const cwd = requireString(input.cwd, 'cwd');
  if (!path.isAbsolute(cwd))
    fail('INVALID_INPUT', 'cwd must be an absolute path', { field: 'cwd' });
  let stat;
  try {
    stat = fs.statSync(cwd);
  } catch {
    stat = null;
  }
  if (!stat?.isDirectory()) {
    fail('INVALID_INPUT', 'cwd is not an existing directory', { field: 'cwd' });
  }
  return fs.realpathSync(cwd);
}

// A branch name never starts with `-`, so it can never be read as an option. This is a rule
// about branch names; the fetch guard and `--` stay in force on top of it.
function requireBranchName(value, field) {
  requireString(value, field);
  if (value.startsWith('-')) {
    fail('INVALID_INPUT', `${field} must not start with "-"`, { field });
  }
  return value;
}

function lexicalProblem(value) {
  if (path.isAbsolute(value) || path.win32.isAbsolute(value)) return 'must be relative to cwd';
  if (value.replace(/\\/g, '/').split('/').includes('..')) return 'must not contain ".."';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Containment for ADR and runtime-report directories (until a shared path guard exists)

function isInside(root, candidate) {
  return (
    candidate === root || candidate.startsWith(root.endsWith(path.sep) ? root : root + path.sep)
  );
}

function lstatOrNull(fs, target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error.code === 'ENOTDIR' || error.code === 'ELOOP') {
      fail('UNSAFE_PATH', 'a directory component is not a directory');
    }
    throw error;
  }
}

// Walks a cwd-relative directory one component at a time with `lstat`. A symlinked component is
// resolved and must stay a directory inside cwd; a dangling link or a non-directory is
// `UNSAFE_PATH`. The first absent component makes the directory truly absent (`real: null`).
// With `reportEscape`, an escape returns `{ escaped: true, resolvedPath }` instead of failing.
function containedDirectory(fs, cwdReal, relative, field, { reportEscape = false } = {}) {
  requireString(relative, field);
  const problem = lexicalProblem(relative);
  if (problem) fail('UNSAFE_PATH', `${field} ${problem}`, { field });
  const segments = path.posix
    .normalize(relative.replace(/\\/g, '/'))
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.');
  let current = cwdReal;
  for (const segment of segments) {
    const next = path.join(current, segment);
    const stat = lstatOrNull(fs, next);
    if (!stat) return { real: null, escaped: false };
    if (stat.isSymbolicLink()) {
      let real;
      try {
        real = fs.realpathSync(next);
      } catch {
        fail('UNSAFE_PATH', `${field} contains a symbolic link that does not resolve`, { field });
      }
      if (!fs.statSync(real).isDirectory()) {
        fail('UNSAFE_PATH', `${field} contains a component that is not a directory`, { field });
      }
      if (!isInside(cwdReal, real)) {
        if (reportEscape) return { real: null, escaped: true, resolvedPath: real };
        fail('UNSAFE_PATH', `${field} escapes cwd`, { field });
      }
      current = real;
      continue;
    }
    if (!stat.isDirectory()) {
      fail('UNSAFE_PATH', `${field} contains a component that is not a directory`, { field });
    }
    current = next;
  }
  return { real: current, escaped: false };
}

function entryExists(fs, target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function posixJoin(...parts) {
  return path.posix.normalize(parts.map((part) => part.replace(/\\/g, '/')).join('/'));
}

// ---------------------------------------------------------------------------------------------
// Git through the injected runner

function requireRunner(runner) {
  if (typeof runner !== 'function') {
    fail('INTERNAL', 'operation requires an injected process runner');
  }
  return runner;
}

function asText(value) {
  if (value === undefined || value === null) return '';
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
}

async function git(runner, cwd, args, allowed = [0]) {
  const result = await requireRunner(runner)({ executable: 'git', args: ['-C', cwd, ...args] });
  if (result?.error) {
    fail('COMMAND_FAILED', 'git could not be started', { args, code: result.error.code ?? null });
  }
  if (!allowed.includes(result?.status)) {
    fail('COMMAND_FAILED', 'git failed', {
      args,
      status: result?.status ?? null,
      stderr: diagnosticText(result?.stderr),
    });
  }
  return { status: result.status, stdout: asText(result.stdout), stderr: asText(result.stderr) };
}

async function remoteNames(runner, cwd) {
  const { stdout } = await git(runner, cwd, ['remote']);
  return stdout.split('\n').filter((line) => line !== '');
}

// Resolves a revision to a commit id, or null. Always `--verify` and `--end-of-options`, so a
// value starting with `-` is a revision that does not resolve, never an option.
async function resolveCommit(runner, cwd, revision) {
  const { status, stdout } = await git(
    runner,
    cwd,
    ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`],
    [0, 1, 128],
  );
  const oid = stdout.trim();
  return status === 0 && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(oid) ? oid : null;
}

async function originHeadBranch(runner, cwd) {
  const { status, stdout } = await git(
    runner,
    cwd,
    ['symbolic-ref', '-q', 'refs/remotes/origin/HEAD'],
    [0, 1, 128],
  );
  const ref = stdout.trim();
  return status === 0 && ref.startsWith('refs/remotes/origin/')
    ? ref.slice('refs/remotes/origin/'.length)
    : null;
}

async function configValue(runner, cwd, key) {
  const { status, stdout } = await git(runner, cwd, ['config', '--get', key], [0, 1]);
  const value = stdout.trim();
  return status === 0 && value !== '' ? value : null;
}

async function branchNameValid(runner, cwd, name) {
  const { status } = await git(runner, cwd, ['check-ref-format', '--branch', name], [0, 1, 128]);
  return status === 0;
}

// ---------------------------------------------------------------------------------------------
// base-branch-resolve

async function baseBranchResolve(input, deps) {
  requireInput(input, ['cwd', 'configured']);
  const cwd = requireCwd(input, deps.fs);
  const configured = input.configured ?? null;
  if (configured !== null) requireString(configured, 'configured');
  const runner = deps.runner;
  const remotes = await remoteNames(runner, cwd);
  const derived = configured === null;
  let value = configured;
  if (derived) {
    const head = await originHeadBranch(runner, cwd);
    value = `origin/${head ?? 'main'}`;
  }
  const slash = value.indexOf('/');
  // Only a leading part that `git remote` lists makes a remote ref; a value without `/` never is.
  if (slash > 0 && remotes.includes(value.slice(0, slash))) {
    const branch = value.slice(slash + 1);
    if (branch === '') return { outcome: 'unresolvable', value, derived };
    return { outcome: 'fetch-required', value, derived, remote: value.slice(0, slash), branch };
  }
  const oid = await resolveCommit(runner, cwd, value);
  if (oid) return { outcome: 'resolved', value, derived, baseRef: value, localBranch: value, oid };
  if (slash > 0) {
    const candidate = value.slice(slash + 1);
    const substitutedOid = candidate === '' ? null : await resolveCommit(runner, cwd, candidate);
    if (substitutedOid) {
      return {
        outcome: 'resolved-substituted',
        value,
        derived,
        baseRef: candidate,
        localBranch: candidate,
        oid: substitutedOid,
      };
    }
  }
  return { outcome: 'unresolvable', value, derived };
}

// ---------------------------------------------------------------------------------------------
// base-branch-fetch

// A refusal escalation can fix: a sandbox network denial, or EPERM/EACCES on a write below `.git`.
// An SSH authentication failure is never one of them, because escalation cannot fix credentials.
const SSH_AUTH_FAILURE = /Permission denied \((?:publickey|password|keyboard-interactive)/i;
// Each pattern tests one local stderr line: a `remote:` line is the server's text, URLs are removed
// first, and `sandbox` must stand alone, so a host or path naming `sandbox` or `….git/` never
// matches.
const DENIAL_PATTERNS = Object.freeze([
  /(?<![\w./-])sandbox(?![\w./-])[^\n]*\b(?:denied|blocked|refused|network)\b/i,
  /\b(?:connect|socket)[^\n]*(?:Operation not permitted|\bEPERM\b)/i,
  /\.git\/[^\n]*(?:Operation not permitted|Permission denied|\bEPERM\b|\bEACCES\b)/i,
]);

function fetchRefused(stderr) {
  if (SSH_AUTH_FAILURE.test(stderr)) return false;
  const lines = stderr
    .split(/\r?\n/)
    .filter((line) => !/^remote:/i.test(line.trim()))
    .map((line) => line.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<url>'));
  return lines.some((line) => DENIAL_PATTERNS.some((pattern) => pattern.test(line)));
}

async function baseBranchFetch(input, deps) {
  requireInput(input, ['cwd', 'remote', 'branch', 'deliberateDivergence']);
  const cwd = requireCwd(input, deps.fs);
  const remote = requireString(input.remote, 'remote');
  const branch = requireBranchName(input.branch, 'branch');
  const deliberateDivergence = requireBoolean(
    input.deliberateDivergence ?? false,
    'deliberateDivergence',
  );
  const runner = deps.runner;
  if (!(await remoteNames(runner, cwd)).includes(remote)) {
    fail('INVALID_INPUT', 'remote is not a configured remote', { field: 'remote' });
  }
  const ref = `refs/heads/${branch}`;
  if (!(await fetchableUpstream(cwd, remote, ref, runner))) {
    fail('INVALID_INPUT', 'branch is not a fetchable branch name', { field: 'branch' });
  }
  const env = nonInteractiveFetchEnv({
    environment: deps.env ?? process.env,
    // The shipped runner spreads the fetch env over `process.env`.
    inheritedEnvironment: process.env,
    configuredSshCommand: await configValue(runner, cwd, 'core.sshCommand'),
    configuredSshVariant: await configValue(runner, cwd, 'ssh.variant'),
  });
  const result = await requireRunner(runner)({
    executable: 'git',
    args: ['-C', cwd, ...HOOKS_DISABLED, 'fetch', '--no-tags', '--quiet', '--', remote, ref],
    env,
    timeoutMs: UPSTREAM_FETCH_TIMEOUT_MS,
    processGroup: true,
  });
  if (
    result?.forcedKill === true ||
    result?.timedOut === true ||
    result?.error?.code === 'ETIMEDOUT'
  ) {
    return { outcome: 'fetch-failed', remote, branch, error: 'timeout' };
  }
  if (result?.error) {
    return {
      outcome: 'fetch-failed',
      remote,
      branch,
      error: diagnosticText(result.error.code ?? 'command could not be started'),
    };
  }
  if (result?.status !== 0) {
    const stderr = asText(result?.stderr);
    return {
      outcome: fetchRefused(stderr) ? 'fetch-denied' : 'fetch-failed',
      remote,
      branch,
      error: diagnosticText(stderr) || `exit status ${result?.status ?? 'unknown'}`,
    };
  }
  const fetchHeadOid = await resolveCommit(runner, cwd, 'FETCH_HEAD');
  if (fetchHeadOid === null) return { outcome: 'unresolvable', remote, branch };
  // A narrowed fetch refspec or a single-branch clone leaves the tracking ref stale or absent.
  const trackingOid = await resolveCommit(runner, cwd, `refs/remotes/${remote}/${branch}`);
  if (trackingOid !== fetchHeadOid) {
    return { outcome: 'tracking-stale', remote, branch, fetchHeadOid, trackingOid };
  }
  let divergence = null;
  if (remote === 'origin' && !deliberateDivergence) {
    const head = await originHeadBranch(runner, cwd);
    if (
      head !== null &&
      head !== branch &&
      (await resolveCommit(runner, cwd, `refs/remotes/origin/${head}`)) !== null
    ) {
      divergence = { originHead: `origin/${head}` };
    }
  }
  return {
    outcome: 'resolved',
    remote,
    branch,
    baseRef: `${remote}/${branch}`,
    localBranch: branch,
    oid: trackingOid,
    divergence,
  };
}

// ---------------------------------------------------------------------------------------------
// name-allocate

function planRoots(fs, cwd, dir) {
  const roots = resolveRoots({ cwd, planDir: dir }, fs);
  // `resolveRoots` treats a dangling or escaping archive as absent; report it instead of
  // allocating a name that could duplicate an archived plan.
  const archiveIgnored =
    roots.planDirReal !== null &&
    roots.archiveReal === null &&
    entryExists(fs, path.join(roots.planDirReal, 'archive'));
  return { roots, archiveIgnored };
}

async function nameAllocate(input, deps) {
  requireInput(input, ['cwd', 'family', 'dir', ...NAME_INPUTS]);
  const { fs } = deps;
  const cwd = requireCwd(input, fs);
  const family = FAMILIES[requireEnum(input.family, 'family', NAME_FAMILIES)];
  const foreign = NAME_INPUTS.filter(
    (key) => input[key] !== undefined && !family.inputs.includes(key),
  );
  if (foreign.length > 0) {
    fail('INVALID_INPUT', `family ${input.family} takes no ${foreign.join(', ')}`, {
      keys: foreign,
    });
  }
  const values = { date: localDate(deps.now(), deps.timeZone) };
  if (family.inputs.includes('text')) {
    values.slug = slugify(requireString(input.text, 'text', { allowEmpty: true }));
    if (values.slug === '') fail('INVALID_INPUT', 'text yields an empty slug', { field: 'text' });
  }
  if (family.inputs.includes('issue')) {
    if (!Number.isSafeInteger(input.issue) || input.issue < 1) {
      fail('INVALID_INPUT', 'issue must be a positive integer', { field: 'issue' });
    }
    values.issue = input.issue;
  }
  if (family.inputs.includes('workflow')) {
    values.workflow = requireEnum(input.workflow, 'workflow', REPORT_WORKFLOWS);
  }
  if (family.inputs.includes('planSlug')) {
    if (typeof input.planSlug !== 'string' || !SLUG.test(input.planSlug)) {
      fail('INVALID_INPUT', 'planSlug must use the slug alphabet', { field: 'planSlug' });
    }
    values.planSlug = input.planSlug;
  }
  const dir = requireString(input.dir, 'dir');

  const directories = [];
  let archiveIgnored = null;
  if (family.planRoots) {
    const resolved = planRoots(fs, cwd, dir);
    archiveIgnored = resolved.archiveIgnored;
    if (archiveIgnored) return { outcome: 'archive-unusable', archiveIgnored: true };
    if (resolved.roots.planDirReal) directories.push(resolved.roots.planDirReal);
    if (resolved.roots.archiveReal) directories.push(resolved.roots.archiveReal);
  } else {
    const { real } = containedDirectory(fs, cwd, dir, 'dir');
    if (real) directories.push(real);
  }

  const stem = family.stem(values);
  for (let suffix = null; suffix === null || suffix < MAX_SUFFIX;) {
    const name = suffix === null ? `${stem}.md` : `${stem}-${suffix}.md`;
    if (name.includes('/') || name.includes('\\') || name === '.md') {
      fail('INVALID_INPUT', 'the composed name is not a single path segment');
    }
    if (input.family === 'unattended-plan' && !UNATTENDED_PLAN_NAME.test(name)) {
      fail('INTERNAL', 'the composed unattended plan name violates its pattern');
    }
    if (!directories.some((directory) => entryExists(fs, path.join(directory, name)))) {
      return {
        outcome: 'allocated',
        name,
        path: posixJoin(dir, name),
        date: values.date,
        suffix,
        ...(archiveIgnored === null ? {} : { archiveIgnored }),
      };
    }
    suffix = suffix === null ? family.start : suffix + 1;
  }
  fail('INTERNAL', 'no free name below the suffix bound');
}

// ---------------------------------------------------------------------------------------------
// delivery-branch-name

const DISCLOSURE_STRIPPERS = PRODUCT_NAME_PATTERNS.map(
  (pattern) =>
    new RegExp(
      `[a-z0-9]*(?:${pattern.source})[a-z0-9]*`,
      pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
    ),
);

function discloses(text) {
  return PRODUCT_NAME_PATTERNS.some((pattern) => pattern.test(text));
}

// Removes every disclosure match with the letters or digits attached to it up to the nearest
// hyphen, collapses hyphens, and repeats until nothing matches.
function stripDisclosure(slug) {
  let result = slug;
  while (discloses(result)) {
    for (const stripper of DISCLOSURE_STRIPPERS) result = result.replace(stripper, '');
    result = result.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  }
  return result;
}

async function deliveryBranchName(input, deps) {
  requireInput(input, ['cwd', 'branchPrefix', 'skill', 'text', 'visibility', 'excludeNames']);
  const cwd = requireCwd(input, deps.fs);
  const prefix = requireString(input.branchPrefix ?? '', 'branchPrefix', { allowEmpty: true });
  if (prefix !== '' && (prefix.startsWith('-') || refPathProblem(prefix) !== null)) {
    fail('INVALID_INPUT', 'branchPrefix is not a valid ref name', { field: 'branchPrefix' });
  }
  const skill = requireEnum(input.skill, 'skill', BRANCH_SKILLS);
  const text = requireString(input.text, 'text', { allowEmpty: true });
  const visibility = requireEnum(input.visibility, 'visibility', ['visible', 'hidden']);
  const excludeNames = input.excludeNames ?? [];
  if (!Array.isArray(excludeNames)) {
    fail('INVALID_INPUT', 'excludeNames must be an array', { field: 'excludeNames' });
  }
  for (const [index, name] of excludeNames.entries()) {
    if (typeof name !== 'string' || name.startsWith('-') || refPathProblem(name) !== null) {
      fail('INVALID_INPUT', `excludeNames entry ${index} is not a valid branch name`, {
        field: 'excludeNames',
        index,
      });
    }
  }
  const runner = deps.runner;
  for (const [index, name] of excludeNames.entries()) {
    if (!(await branchNameValid(runner, cwd, name))) {
      fail('INVALID_INPUT', `excludeNames entry ${index} is not a valid branch name`, {
        field: 'excludeNames',
        index,
      });
    }
  }
  if (visibility === 'hidden' && discloses(prefix)) return { outcome: 'prefix-discloses' };

  const originalSlug = slugify(text);
  const stripped = visibility === 'hidden' ? stripDisclosure(originalSlug) : originalSlug;
  const slug = stripped === '' ? 'change' : stripped;
  const base = prefix === '' ? `${skill}/${slug}` : `${prefix}/${skill}/${slug}`;
  if (visibility === 'hidden') {
    try {
      assertUndisclosed(base, 'branch');
    } catch (error) {
      if (error instanceof RemoteTrackerError) return { outcome: 'prefix-discloses' };
      throw error;
    }
  }

  const remotes = await remoteNames(runner, cwd);
  const { stdout } = await git(runner, cwd, [
    'for-each-ref',
    '--format=%(refname)',
    'refs/heads',
    'refs/remotes',
  ]);
  const refs = new Set(stdout.split('\n').filter((line) => line !== ''));
  const excluded = new Set(excludeNames);
  const taken = (name) =>
    excluded.has(name) ||
    refs.has(`refs/heads/${name}`) ||
    remotes.some((remote) => refs.has(`refs/remotes/${remote}/${name}`));

  for (let suffix = null; suffix === null || suffix < MAX_SUFFIX;) {
    const branch = suffix === null ? base : `${base}-${suffix}`;
    if (!taken(branch)) {
      if (!(await branchNameValid(runner, cwd, branch))) {
        fail('INVALID_INPUT', 'the composed branch name is not a valid branch name', { branch });
      }
      return {
        outcome: 'named',
        branch,
        slug,
        originalSlug,
        sanitized: visibility === 'hidden' && stripped !== originalSlug,
        suffix,
      };
    }
    suffix = suffix === null ? 2 : suffix + 1;
  }
  fail('INTERNAL', 'no free branch name below the suffix bound');
}

// ---------------------------------------------------------------------------------------------
// ADR numbering

const ADR_EXCLUDED_NAMES = new Set(['README.md', 'index.md']);
const ADR_EXCLUDED_STEMS = new Set(['effective-flow-project-setup', 'firmo-project-setup']);
const ADR_NAME = /^(?:\d+-)?[a-z0-9][a-z0-9-]*\.md$/;

function adrDirectory(fs, cwd, adrDir) {
  return containedDirectory(fs, cwd, adrDir, 'adrDir', { reportEscape: true });
}

// Every `*.md` entry name at the top level of the directory (the allocation scan).
function adrNames(fs, directory) {
  if (!directory) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.md'))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

// The observed-evidence set: the allocation scan minus README.md, index.md and the project-setup
// stems after an optional leading numeric prefix.
function evidenceSet(names) {
  return names.filter(
    (name) =>
      !ADR_EXCLUDED_NAMES.has(name) &&
      !ADR_EXCLUDED_STEMS.has(name.slice(0, -'.md'.length).replace(/^\d+[-_]/, '')),
  );
}

function observeConvention(evidence) {
  if (evidence.length === 0) return { convention: 'none', width: null };
  const widths = new Set();
  let numbered = 0;
  let anyPrefix = false;
  for (const name of evidence) {
    if (/^\d+[-_]/.test(name)) anyPrefix = true;
    const match = name.match(/^(\d+)-/);
    if (match) {
      numbered += 1;
      widths.add(match[1].length);
    }
  }
  if (numbered === evidence.length && widths.size === 1) {
    return { convention: 'numbered', width: [...widths][0] };
  }
  if (!anyPrefix) return { convention: 'numberless', width: null };
  return { convention: 'inconclusive', width: null };
}

async function adrObserve(input, deps) {
  requireInput(input, ['cwd', 'adrDir']);
  const cwd = requireCwd(input, deps.fs);
  const directory = adrDirectory(deps.fs, cwd, input.adrDir);
  if (directory.escaped) {
    return { outcome: 'outside-repo-stop', resolvedPath: directory.resolvedPath };
  }
  const names = adrNames(deps.fs, directory.real);
  const evidence = evidenceSet(names);
  const { convention, width } = observeConvention(evidence);
  return { outcome: convention, width, files: evidence, allFiles: names };
}

function nextAdrNumber(names) {
  let highest = 0;
  for (const name of names) {
    const match = name.match(/^(\d+)[-_]/);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  if (!Number.isSafeInteger(highest + 1)) fail('INTERNAL', 'the ADR number exceeds the safe range');
  return highest + 1;
}

async function adrAllocate(input, deps) {
  requireInput(input, ['cwd', 'adrDir', 'convention', 'declaredWidth', 'text', 'previousTarget']);
  const { fs } = deps;
  const cwd = requireCwd(input, fs);
  const convention = requireEnum(input.convention, 'convention', ['numbered', 'numberless']);
  const declaredWidth = input.declaredWidth ?? null;
  if (declaredWidth !== null && !Number.isInteger(declaredWidth)) {
    fail('INVALID_INPUT', 'declaredWidth must be an integer or null', { field: 'declaredWidth' });
  }
  const slug = slugify(requireString(input.text, 'text', { allowEmpty: true }));
  if (slug === '') fail('INVALID_INPUT', 'text yields an empty slug', { field: 'text' });
  const previousTarget = input.previousTarget ?? null;
  if (previousTarget !== null) requireString(previousTarget, 'previousTarget');
  const adrDir = requireString(input.adrDir, 'adrDir');
  // Without trailing slashes, like `resolveRoots`, so the parent test compares equal forms.
  const dirPosix = posixJoin(adrDir).replace(/\/+$/, '') || '.';

  const directory = adrDirectory(fs, cwd, adrDir);
  // The lexical location of the directory; the escape check below decides where it resolves.
  const dirAbs = path.resolve(cwd, dirPosix);

  const allocate = () => {
    const names = adrNames(fs, directory.real);
    if (convention === 'numberless') {
      return { name: `${slug}.md`, number: null, width: null, widened: false };
    }
    const observed = observeConvention(evidenceSet(names));
    const width =
      declaredWidth !== null && declaredWidth >= 1 && declaredWidth <= 10
        ? declaredWidth
        : observed.convention === 'numbered'
          ? observed.width
          : 4;
    const number = nextAdrNumber(names);
    const digits = String(number);
    return {
      name: `${digits.padStart(width, '0')}-${slug}.md`,
      number,
      width,
      widened: digits.length > width,
    };
  };

  // The symlink hard stop first, then the segment and parent tests, then the repository root.
  const containment = (name, relativePath) => {
    if (!directory.escaped && directory.real && fs.existsSync(dirAbs)) {
      const stat = lstatOrNull(fs, path.join(dirAbs, name));
      if (stat?.isSymbolicLink()) return { outcome: 'symlink-stop', path: relativePath };
    }
    if (!ADR_NAME.test(name) || path.posix.dirname(relativePath) !== dirPosix) {
      return { outcome: 'unrecognized', path: relativePath };
    }
    if (directory.escaped) {
      return { outcome: 'outside-repo-stop', resolvedPath: directory.resolvedPath };
    }
    return null;
  };
  const taken = (name) =>
    directory.real !== null && entryExists(fs, path.join(directory.real, name));
  const result = (outcome, allocation, extra = {}) => ({
    outcome,
    convention,
    name: allocation.name,
    path: posixJoin(dirPosix, allocation.name),
    number: allocation.number,
    width: allocation.width,
    widened: allocation.widened,
    ...extra,
  });

  if (previousTarget === null) {
    const allocation = allocate();
    const relativePath = posixJoin(dirPosix, allocation.name);
    const stop = containment(allocation.name, relativePath);
    if (stop) return stop;
    if (taken(allocation.name)) return { outcome: 'collision-stop', paths: [relativePath] };
    return result('allocated', allocation);
  }

  const previousPosix = previousTarget.replace(/\\/g, '/');
  const previousName = path.posix.basename(previousPosix);
  const previousStop = containment(previousName, path.posix.normalize(previousPosix));
  if (previousStop) return previousStop;
  if (!taken(previousName)) {
    const match = previousName.match(/^(\d+)-/);
    const width = convention === 'numbered' && match ? match[1].length : null;
    return result('allocated', {
      name: previousName,
      number: convention === 'numbered' && match ? Number(match[1]) : null,
      width,
      widened: false,
    });
  }
  if (convention === 'numberless') {
    return { outcome: 'collision-stop', paths: [posixJoin(dirPosix, previousName)] };
  }
  const allocation = allocate();
  const relativePath = posixJoin(dirPosix, allocation.name);
  const stop = containment(allocation.name, relativePath);
  if (stop) return stop;
  if (allocation.name === previousName || taken(allocation.name)) {
    return {
      outcome: 'collision-stop',
      paths: [posixJoin(dirPosix, previousName), relativePath],
    };
  }
  return result('reallocated', allocation, { previousTarget: posixJoin(dirPosix, previousName) });
}

// ---------------------------------------------------------------------------------------------
// plan-reference-resolve

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;

// The slug parts a file name answers to: after the date and an optional legacy number, or after
// the legacy number alone for an unmigrated `NNNN-slug.md`.
function slugParts(name) {
  const stem = name.slice(0, -'.md'.length);
  if (DATE_PREFIX.test(stem)) {
    const rest = stem.replace(DATE_PREFIX, '');
    const withoutNumber = rest.replace(/^\d{4}-/, '');
    return new Set([rest, withoutNumber]);
  }
  return new Set([stem.replace(/^\d{4}-/, '')]);
}

// The file-name legacy number: `YYYY-MM-DD-NNNN-…` or an unmigrated `NNNN-…`.
function fileNameNumber(name) {
  const migrated = name.match(/^\d{4}-\d{2}-\d{2}-(\d{4})-/);
  if (migrated) return migrated[1];
  const unmigrated = name.match(/^(\d{4})-(?!\d{2}-\d{2}-)/);
  return unmigrated ? unmigrated[1] : null;
}

function candidate(file) {
  return { path: file.path, location: file.location };
}

function singleEntry(reference, roots, fs) {
  try {
    return resolveFileEntry(reference, roots, fs);
  } catch (error) {
    if (error instanceof PlanLintError && error.code === 'NOT_FOUND') return null;
    throw error;
  }
}

async function planReferenceResolve(input, deps) {
  requireInput(input, ['cwd', 'planDir', 'reference']);
  const { fs } = deps;
  const cwd = requireCwd(input, fs);
  requireString(input.planDir, 'planDir');
  const reference = requireString(input.reference, 'reference').trim();
  if (reference === '')
    fail('INVALID_INPUT', 'reference must not be blank', { field: 'reference' });
  const { roots, archiveIgnored } = planRoots(fs, cwd, input.planDir);

  const resolved = (file, exact) => {
    const classification = classifyPlanText(readPlanFile(file, fs));
    return {
      outcome: 'resolved',
      path: file.path,
      location: file.location,
      status: classification.status,
      statusReason: classification.statusReason,
      exact,
      archiveIgnored,
    };
  };
  const decide = (matches, exact) => {
    if (matches.length === 1) return resolved(matches[0], exact);
    if (matches.length > 1) {
      return { outcome: 'ambiguous', candidates: matches.map(candidate), archiveIgnored };
    }
    return { outcome: 'not-found', archiveIgnored };
  };

  // Path form: relative to cwd or absolute, physically inside the plan directory or its archive.
  // A path that lexically lies elsewhere (outside cwd included) is `outside-plan-dir`, an answer
  // rather than a stop; a symlink or identity failure on a path inside them stays UNSAFE_PATH.
  if (path.isAbsolute(reference) || /[/\\]/.test(reference)) {
    const outside = { outcome: 'outside-plan-dir', archiveIgnored };
    let relative = reference.replace(/\\/g, '/');
    if (path.isAbsolute(reference)) {
      const bases = [cwd, path.resolve(input.cwd)];
      const base = bases.find((root) => isInside(root, path.resolve(reference)));
      if (!base || path.resolve(reference) === base) return outside;
      relative = path.relative(base, path.resolve(reference)).split(path.sep).join('/');
    }
    relative = path.posix.normalize(relative);
    if (relative === '..' || relative.startsWith('../')) return outside;
    if (!relative.endsWith('.md')) relative = `${relative}.md`;
    const directory = path.posix.dirname(relative);
    if (
      directory !== path.posix.normalize(roots.planDirPosix) &&
      directory !== path.posix.join(roots.planDirPosix, 'archive')
    ) {
      return outside;
    }
    // An unusable archive answers an archive path like the name form does: not found, ignored.
    if (directory !== path.posix.normalize(roots.planDirPosix) && archiveIgnored) {
      return { outcome: 'not-found', archiveIgnored };
    }
    const file = singleEntry(relative, roots, fs);
    return file ? resolved(file, true) : { outcome: 'not-found', archiveIgnored };
  }

  const files = [
    ...listTopLevel(roots, fs),
    ...listTopLevel(
      {
        planDirReal: roots.archiveReal,
        planDirPosix: posixJoin(roots.planDirPosix, 'archive'),
      },
      fs,
    ).map((file) => ({ ...file, location: 'archive' })),
  ];

  // File-name form, with or without `.md`: an exact name in either directory.
  const name = reference.endsWith('.md') ? reference : `${reference}.md`;
  const byName = files.filter((file) => file.name === name);
  if (byName.length > 0 || reference.endsWith('.md')) return decide(byName, true);

  // Legacy number: the `# NNNN:` H1 first; the file-name segment only for a file without an H1.
  if (/^\d{4}$/.test(reference)) {
    const heading = new RegExp(`^${reference}:(?:\\s|$)`);
    const matches = files.filter((file) => {
      const { title } = classifyPlanText(readPlanFile(file, fs));
      if (title !== null) return heading.test(title);
      return fileNameNumber(file.name) === reference;
    });
    return decide(matches, false);
  }

  // Title slug: exact equality with a file name's slug part.
  if (!SLUG.test(reference)) return { outcome: 'not-found', archiveIgnored };
  return decide(
    files.filter((file) => slugParts(file.name).has(reference)),
    false,
  );
}

// ---------------------------------------------------------------------------------------------
// Envelope

const HANDLERS = Object.freeze({
  'base-branch-resolve': baseBranchResolve,
  'base-branch-fetch': baseBranchFetch,
  'name-allocate': nameAllocate,
  'delivery-branch-name': deliveryBranchName,
  'adr-observe': adrObserve,
  'adr-allocate': adrAllocate,
  'plan-reference-resolve': planReferenceResolve,
});

// Runs one operation and returns its envelope; never throws. `deps` carries the injected
// `runner`, `fs`, `env`, and the clock (`now`, `timeZone`) the dated names read.
export async function executeOperation(operation, input = {}, deps = {}) {
  try {
    if (!MECHANICS_OPERATIONS.includes(operation)) {
      fail('INVALID_INPUT', `unknown operation: ${operation}`);
    }
    const data = await HANDLERS[operation](input, {
      fs: deps.fs ?? nodeFs,
      runner: deps.runner,
      env: deps.env,
      now: deps.now ?? (() => new Date()),
      timeZone: deps.timeZone,
    });
    return { ok: true, operation, data };
  } catch (error) {
    return errorEnvelope(operation, error);
  }
}

export function errorEnvelope(operation, error) {
  const recoded = recodeError(error);
  return {
    ok: false,
    operation: MECHANICS_OPERATIONS.includes(operation) ? operation : null,
    error: { code: recoded.code, message: recoded.message, details: recoded.details ?? {} },
  };
}

export function exitCodeFor(envelope) {
  if (envelope.ok) return 0;
  return EXIT_CODES[envelope.error.code] ?? 1;
}
