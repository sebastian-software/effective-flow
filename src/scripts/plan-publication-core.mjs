// Deterministic plan publication: the core behind `plan-publication.mjs`.
//
// Seven operations, each with a closed input schema and one JSON envelope:
// - `scan` (read-only, no network): the one content scan of a plan file and the texts published
//   with it. Interactive publication (`shared/plan-publication.md`) and the unattended path share
//   it, so both apply one class table.
// - `branch-name` (read-only): the plan branch `<branchPrefix>/plan/issue-<N>`.
// - `assert-changeset` (read-only): a commit adds exactly one plan file and nothing else.
// - `inspect-branch` (read-only): bounded recovery metadata from a verified plan branch.
// - `assess-base-move` (read-only apart from the base fetch): whether a plan still fits after its
//   base moved from `fromBaseOid` to the freshly fetched tip. It compares the changed paths of that
//   range with the paths the plan cites and looks for a plan of the same issue in the range. Its
//   envelope's `republish` is false only for a reason in `BASE_MOVE_STOPPING_REASONS` (a rewritten
//   base or a possible plan of the same issue); otherwise a caller may call `publish` once more with
//   the new tip as `expectedBaseOid` and `allowNewerBase: true`, passing the assessment as
//   `baseMove` unless it `fits`. Without `allowNewerBase`, `publish` keeps its exact base binding.
// - `publish` and `complete-branch` (mutations, dry run unless `apply`): an unattended pass commits
//   the plan with plumbing in a temporary index, pushes it without force so the remote branch is
//   the lock, and opens a draft pull request carrying the shipped plan marker and `Refs #<N>`.
//   `publish` alone takes an optional `baseMove` and renders it as one fixed English paragraph
//   ("Unresolved base move") between the derived prose and the marker. With `allowNewerBase`, a
//   tip that moved past `expectedBaseOid` publishes on that assessed base after the further-range
//   stops, extends or adds the flag, and reports `furtherBaseMove` (null on an unmoved tip).
//
// Model judgment stays outside: callers pass the plan file, the run state and the `languageGit` /
// `languageForge` values, never forge text. `publish` and `complete-branch` derive the title, the
// commit subject and the body prose from the verified plan bytes (`deriveForgeText`), sanitize and
// bound them, and return them to no caller; a dry run reports only their length and digest. Every
// refusal on that derived text carries `details.source: "derived"`, and one on the base-move flag
// `details.source: "base-move-flag"`. This module spawns nothing itself; every process goes through
// the injected runner, which only a CLI entry creates (`process-runner.mjs`).
//
// `cwd` rule: `scan` and `branch-name` accept any existing directory as `cwd` and need no
// repository, deliberately — `scan` judges files only (the distribution smoke runs it outside a
// repository), and `branch-name` only asks `git check-ref-format`. The other five operations
// require `cwd` to be the repository root.
//
// Every caller-supplied text is size-bounded before any scan (`INPUT_TOO_LARGE`; the plan file
// keeps its `INVALID_CONTENT`/`oversized` refusal), and derived text is bounded by construction, so
// no scan pattern ever sees unbounded input.

import { createHash } from 'node:crypto';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  executeOperation as executeTrackerOperation,
  inspectPlanPrMarker,
} from './remote-tracker-core.mjs';
import { assertPublishable } from './remote-tracker-shared-core.mjs';
import {
  planForgeFields,
  publicationMetadataFromText,
  PlanLintError,
  UNATTENDED_PLAN_NAME,
  readIssueHeader,
  refPathProblem,
} from './plan-lint-core.mjs';
import {
  SENSITIVE_CHILD_ASSIGNMENT,
  isLegitimateCredentialProse,
} from './remote-tracker-decomposition-core.mjs';
import {
  UPSTREAM_FETCH_TIMEOUT_MS,
  computeOverlap,
  diagnosticText,
  nonInteractiveFetchEnv,
  pathFold,
  pathFoldingConfig,
  validateLiteralPath,
} from './delivery-selection-core.mjs';

// The unattended plan-name pattern and the in-process ref-path rule are owned by plan-lint-core;
// they are re-exported here so a test can assert that both modules hold the identical objects.
export { UNATTENDED_PLAN_NAME, refPathProblem };

export const PLAN_PUBLICATION_OPERATIONS = Object.freeze([
  'scan',
  'branch-name',
  'assert-changeset',
  'publish',
  'complete-branch',
  'inspect-branch',
  'assess-base-move',
]);

// The operations that stay a dry run without `apply`; the CLI reads this list too, so an envelope it
// writes on its own (an interrupted run) carries the same `dryRun` as the core's.
export const MUTATING_PLAN_PUBLICATION_OPERATIONS = Object.freeze(['publish', 'complete-branch']);
const MUTATING_OPERATIONS = new Set(MUTATING_PLAN_PUBLICATION_OPERATIONS);

export const RUN_STATES = Object.freeze(['interactive', 'unattended']);
export const VISIBILITIES = Object.freeze(['standard', 'hidden']);
export const MAX_PLAN_BYTES = 512 * 1024;
// Hard input limits, checked before any scan pattern runs.
export const MAX_TITLE_CHARS = 256;
// GitHub's pull-request body limit. It bounds the body prose and, separately, the final body
// with the marker line and `Refs #<N>` appended, so a body never fails only after the push.
export const MAX_BODY_CHARS = 65_536;
export const MAX_COMMIT_MESSAGE_BYTES = 65_536;
// A commit object holds its headers (tree, parents, identities, a signature) before the message.
const MAX_COMMIT_HEADER_BYTES = 16_384;
// `git hook run --ignore-missing` and `git fetch --no-auto-maintenance` exist from Git 2.36 on.
export const MINIMUM_GIT_VERSION = Object.freeze([2, 36]);

const EXIT_CODES = Object.freeze({ INVALID_INPUT: 2 });

export class PlanPublicationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PlanPublicationError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new PlanPublicationError(code, message, details);
}

// ---------------------------------------------------------------------------------------------
// Input validation

const SCHEMAS = Object.freeze({
  scan: { required: ['cwd', 'runState', 'planFile'], optional: ['title', 'body', 'commitMessage'] },
  'branch-name': { required: ['cwd', 'branchPrefix'], optional: ['planFile', 'issue'] },
  'assert-changeset': {
    required: ['cwd', 'remote', 'baseBranch', 'head', 'planDir', 'issue'],
    optional: [],
  },
  publish: {
    required: [
      'cwd',
      'runState',
      'visibility',
      'issue',
      'planDir',
      'planFile',
      'branchPrefix',
      'remote',
      'baseBranch',
      'languageGit',
      'languageForge',
    ],
    optional: ['expectedBaseOid', 'expectedBlobOid', 'baseMove', 'allowNewerBase'],
  },
  'complete-branch': {
    required: [
      'cwd',
      'runState',
      'visibility',
      'issue',
      'planDir',
      'branch',
      'branchPrefix',
      'remote',
      'baseBranch',
      'languageGit',
      'languageForge',
    ],
    optional: ['expectedBaseOid', 'expectedTipOid'],
  },
  'inspect-branch': {
    required: [
      'cwd',
      'runState',
      'visibility',
      'issue',
      'planDir',
      'branch',
      'branchPrefix',
      'remote',
      'baseBranch',
    ],
    optional: ['expectedBaseOid'],
  },
  'assess-base-move': {
    required: [
      'cwd',
      'issue',
      'planDir',
      'planFile',
      'remote',
      'baseBranch',
      'fromBaseOid',
      'expectedBlobOid',
    ],
    optional: [],
  },
});

function closedSchema(operation, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('INVALID_INPUT', 'input must be a JSON object');
  }
  const { required, optional } = SCHEMAS[operation];
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    fail('INVALID_INPUT', `unknown input key: ${unknown.join(', ')}`, { keys: unknown });
  }
  const missing = required.filter((key) => input[key] === undefined);
  if (missing.length > 0) {
    fail('INVALID_INPUT', `missing input key: ${missing.join(', ')}`, { keys: missing });
  }
}

function requireText(value, field, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
    fail('INVALID_INPUT', `${field} must be ${allowEmpty ? 'a' : 'a non-empty'} string`, {
      field,
    });
  }
  if (!value.isWellFormed() || value.includes('\0')) {
    fail('INVALID_CONTENT', `${field} contains a NUL or an ill-formed character`, {
      field,
      reason: 'nul-or-ill-formed',
    });
  }
  return value;
}

const TEXT_LIMITS = Object.freeze({
  title: { limit: MAX_TITLE_CHARS, unit: 'characters', measure: (value) => value.length },
  body: { limit: MAX_BODY_CHARS, unit: 'characters', measure: (value) => value.length },
  commitMessage: {
    limit: MAX_COMMIT_MESSAGE_BYTES,
    unit: 'bytes',
    measure: (value) => Buffer.byteLength(value, 'utf8'),
  },
});

// The size bound of a caller-supplied text, checked before its content is examined at all.
function requireBounded(value, field) {
  const { limit, unit, measure } = TEXT_LIMITS[field];
  if (typeof value === 'string' && measure(value) > limit) {
    fail('INPUT_TOO_LARGE', `${field} exceeds ${limit} ${unit}`, { field, limit, unit });
  }
  return value;
}

function requireEnum(value, field, allowed) {
  if (!allowed.includes(value)) {
    fail('INVALID_INPUT', `${field} must be one of ${allowed.join(', ')}`, { field });
  }
  return value;
}

// A positive integer without a leading zero, as a JSON number or a decimal string.
export function normalizeIssueNumber(value, field = 'issue') {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(+value)) {
    return Number(value);
  }
  fail('INVALID_INPUT', `${field} must be a positive integer`, { field });
}

// The unattended rules hold in one place: a mutating operation runs only unattended, with an
// explicit visibility, and never in hidden mode. All of it is decided before any Git or forge call.
function unattendedRules(input) {
  if (input.runState !== 'unattended') {
    fail('INVALID_INPUT', 'runState must be unattended for a mutating operation', {
      field: 'runState',
    });
  }
  requireEnum(input.visibility, 'visibility', VISIBILITIES);
  if (input.visibility === 'hidden') {
    fail(
      'HIDDEN_MODE_UNSUPPORTED',
      'hidden-mode plans stay untracked, and nothing published may name the tool',
    );
  }
}

const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function requireRemoteName(value) {
  if (typeof value !== 'string' || !REMOTE_NAME.test(value) || value.endsWith('.lock')) {
    fail('INVALID_INPUT', 'remote must be a remote name such as origin', { field: 'remote' });
  }
  return value;
}

function requireRefPath(value, field) {
  const problem = refPathProblem(value);
  if (problem) fail('INVALID_INPUT', `${field} is not a valid ref name`, { field, problem });
  return value;
}

function requireOid(value, field) {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value)) {
    fail('INVALID_INPUT', `${field} must be a full lowercase object id`, { field });
  }
  return value;
}

function expectedOids(input) {
  for (const field of ['expectedBaseOid', 'expectedTipOid', 'expectedBlobOid']) {
    if (input[field] !== undefined) requireOid(input[field], field);
  }
}

function requireExpectedOid(expected, actual, code, field) {
  if (expected !== undefined && expected !== actual) {
    fail(code, `${field} changed since authorization`, {
      expectedOid: expected,
      actualOid: actual,
    });
  }
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

// A path relative to `cwd`: never absolute, never with a `..` segment, POSIX-normalized.
function requireRelativePath(value, field) {
  requireText(value, field);
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes('\\')) {
    fail('UNSAFE_PATH', `${field} must be relative to cwd`, { field });
  }
  const posix = path.posix.normalize(toPosix(value)).replace(/\/+$/, '');
  if (posix === '..' || posix.startsWith('../') || value.split(/[\\/]/).includes('..')) {
    fail('UNSAFE_PATH', `${field} must not contain ".."`, { field });
  }
  return posix === '' ? '.' : posix;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveCwd(value, fs) {
  requireText(value, 'cwd');
  if (!path.isAbsolute(value)) fail('INVALID_INPUT', 'cwd must be an absolute path');
  let stat;
  try {
    stat = fs.statSync(value);
  } catch {
    fail('INVALID_INPUT', 'cwd is not an existing directory');
  }
  if (!stat.isDirectory()) fail('INVALID_INPUT', 'cwd is not an existing directory');
  return fs.realpathSync(value);
}

// The file rules a plan path meets before anything is built from it, the marker included.
function requirePlanFilePath(planFile) {
  const posix = requireRelativePath(planFile, 'planFile');
  if (!posix.endsWith('.md')) fail('UNSAFE_PATH', 'planFile is not a Markdown file');
  return posix;
}

// Reads a plan file as bytes: a regular file (never a symlink) whose real location is inside
// `cwd` — and, when `planDir` is given, directly inside it. The descriptor is opened without
// following a final symlink and re-checked, so a swap after the check is refused too.
function readPlanFile(fs, cwdReal, planFile, planDir) {
  const posix = requirePlanFilePath(planFile);
  if (planDir !== undefined) {
    const directory = path.posix.dirname(posix);
    if (directory !== planDir) {
      const nested = directory.startsWith(`${planDir}/`) || planDir === '.';
      fail(
        'UNSAFE_PATH',
        nested ? 'planFile is nested below planDir' : 'planFile is outside planDir',
        {
          reason: nested ? 'nested-path' : 'outside-plan-dir',
        },
      );
    }
  }
  const absolute = path.resolve(cwdReal, posix);
  let lstat;
  try {
    lstat = fs.lstatSync(absolute);
  } catch {
    fail('NOT_FOUND', `planFile does not exist: ${posix}`);
  }
  if (lstat.isSymbolicLink())
    fail('UNSAFE_PATH', 'planFile is a symbolic link', { reason: 'symlink' });
  if (!lstat.isFile())
    fail('UNSAFE_PATH', 'planFile is not a regular file', { reason: 'not-file' });
  const parentReal = realpathOrFail(fs, path.dirname(absolute), 'planFile');
  if (!isInside(cwdReal, parentReal)) fail('UNSAFE_PATH', 'planFile escapes cwd');
  if (planDir !== undefined) {
    const planDirReal = realpathOrFail(fs, path.resolve(cwdReal, planDir), 'planDir');
    if (!isInside(cwdReal, planDirReal) || parentReal !== planDirReal) {
      fail('UNSAFE_PATH', 'planFile is not physically contained in planDir', {
        reason: 'outside-plan-dir',
      });
    }
  }
  const flags = nodeFs.constants.O_RDONLY | (nodeFs.constants.O_NOFOLLOW ?? 0);
  let descriptor;
  try {
    descriptor = fs.openSync(absolute, flags);
  } catch (error) {
    fsFailure(error, 'planFile');
  }
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.ino !== lstat.ino || opened.dev !== lstat.dev) {
      fail('UNSAFE_PATH', 'planFile changed while it was being read', { reason: 'swapped' });
    }
    // The size is judged before a byte is read, and the read itself stops one byte past the limit,
    // so a file that grows after the check is refused too.
    if (opened.size > MAX_PLAN_BYTES) planTooLarge();
    return {
      path: posix,
      absolute,
      bytes: readBounded(fs, descriptor, MAX_PLAN_BYTES, planTooLarge),
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

function planTooLarge() {
  fail('INVALID_CONTENT', 'the plan file is larger than 512 KiB', { reason: 'oversized' });
}

// Reads at most one byte past `limit` and calls `tooLarge` when that byte exists.
function readBounded(fs, descriptor, limit, tooLarge) {
  const buffer = Buffer.alloc(limit + 1);
  let length = 0;
  while (length < buffer.length) {
    const read = fs.readSync(descriptor, buffer, length, buffer.length - length, null);
    if (read === 0) break;
    length += read;
  }
  if (length > limit) tooLarge();
  return buffer.subarray(0, length);
}

// A raw file-system error never leaves the core: it maps to a named code, and its message names
// only the input field, never an absolute path.
function fsFailure(error, field) {
  if (error instanceof PlanPublicationError) throw error;
  if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
    fail('NOT_FOUND', `${field} does not exist`, { field });
  }
  fail('UNSAFE_PATH', `${field} cannot be opened safely`, {
    field,
    reason: typeof error?.code === 'string' ? error.code.toLowerCase() : 'unreadable',
  });
}

function realpathOrFail(fs, target, field) {
  try {
    return fs.realpathSync(target);
  } catch (error) {
    fsFailure(error, field);
  }
}

// Plan content is judged from its bytes: a NUL or invalid UTF-8 is refused, never decoded into a
// replacement character first. The BOM is kept so the decoded text matches the bytes exactly.
export function decodePlanBytes(bytes, field = 'plan') {
  if (bytes.includes(0)) {
    fail('INVALID_CONTENT', `${field} contains a NUL byte`, { field, reason: 'nul' });
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    fail('INVALID_CONTENT', `${field} is not valid UTF-8`, { field, reason: 'invalid-utf8' });
  }
}

function splitLines(text) {
  return text.split(/\r\n|\n|\r/);
}

// ---------------------------------------------------------------------------------------------
// Scan

// High-confidence classes always block. Lower-confidence classes block on an unattended run and
// are acknowledgeable on an interactive one, where the caller's single question carries the
// acknowledgement. A finding names its class, field and line, never the matched value.
export const SCAN_CLASSES = Object.freeze([
  { class: 'private-key', confidence: 'high' },
  { class: 'provider-token', confidence: 'high' },
  { class: 'jwt', confidence: 'high' },
  { class: 'authorization-value', confidence: 'high' },
  { class: 'url-credential', confidence: 'high' },
  { class: 'attribution', confidence: 'high' },
  { class: 'credential-assignment', confidence: 'lower' },
  { class: 'absolute-local-path', confidence: 'lower' },
]);

const CONFIDENCE = new Map(SCAN_CLASSES.map((entry) => [entry.class, entry.confidence]));
const CLASS_ORDER = new Map(SCAN_CLASSES.map((entry, index) => [entry.class, index]));
export const SCAN_FIELDS = Object.freeze(['plan', 'title', 'body', 'commitMessage']);

// A value that only stands for a secret: `<token>`, `***`, `[REDACTED]`, `${VAR}`, `$VAR`, `{{x}}`,
// a GitHub Actions expression `${{ secrets.X }}`, or one of the generic words below.
const PLACEHOLDER =
  /^(?:<[^<>]*>|\*+|\[REDACTED[^\]]*\]|\$\{[^{}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\$?\{\{[^{}]*\}\})$/;

// A template expression may hold spaces (`${{ secrets.GITHUB_TOKEN }}`), so an unquoted value that
// opens one ends at its closing braces rather than at the first whitespace.
const TEMPLATE_EXPRESSION = /^\$?\{\{[^{}]*\}\}/;

// A linear trim of quote characters at both ends; a `[`"']+$` pattern would rescan a long quote run
// from every start position.
function stripQuotes(value) {
  const isQuote = (character) => character === '`' || character === '"' || character === "'";
  let start = 0;
  let end = value.length;
  while (start < end && isQuote(value[start])) start += 1;
  while (end > start && isQuote(value[end - 1])) end -= 1;
  return value.slice(start, end);
}

// The generic words documentation writes in a secret's place (`user:password@`, `token: token`).
const PLACEHOLDER_WORD = /^(?:password|passwd|pass|pwd|secret|token)$/i;

export function isPlaceholder(value) {
  const bare = stripQuotes(value.trim());
  return PLACEHOLDER.test(bare) || PLACEHOLDER_WORD.test(bare);
}

// Lowercase words joined by `-`, `_`, `.` or `/` — a slug or a path, which no token format yields.
// At least one separator is required, so a run of letters alone still counts.
const WORD_RUN = /^[a-z]+(?:[-_./][a-z]+)+$/;

const NOT_TOKEN_CHARACTER = '(?<![A-Za-z0-9_])';

const PROVIDER_TOKEN_PATTERNS = Object.freeze([
  new RegExp(`${NOT_TOKEN_CHARACTER}gh[opusr]_([A-Za-z0-9]{36,})`, 'g'),
  new RegExp(`${NOT_TOKEN_CHARACTER}github_pat_([A-Za-z0-9_]{22,})`, 'g'),
  new RegExp(`${NOT_TOKEN_CHARACTER}(?:glpat-|gitea_|npm_)([A-Za-z0-9_-]{20,})`, 'g'),
  new RegExp(`${NOT_TOKEN_CHARACTER}xox[abprs]-([A-Za-z0-9-]{10,})`, 'g'),
  new RegExp(`${NOT_TOKEN_CHARACTER}AKIA([A-Z0-9]{16})(?![A-Za-z0-9])`, 'g'),
  new RegExp(`${NOT_TOKEN_CHARACTER}sk-(?!ant-)([A-Za-z0-9_-]{20,})`, 'g'),
  new RegExp(`${NOT_TOKEN_CHARACTER}sk-ant-([A-Za-z0-9_-]{20,})`, 'g'),
]);

const PRIVATE_KEY_HEADER = /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/;
const JWT = /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{7,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;
const AUTHORIZATION_VALUE = /\bAuthorization\s*:\s*(?:Bearer|token|Basic)\s+(\S+)/gi;
const BEARER_VALUE = /(?<![A-Za-z0-9_])Bearer\s+([A-Za-z0-9._~+/=-]{20,})/g;
// The scheme lookbehind keeps the pattern linear, as in `redact`; the user part stops at the first
// `:`, so only a non-empty password before `@` matches.
const URL_CREDENTIAL = /(?<![a-z\d+.-])[a-z][a-z\d+.-]*:\/\/[^\s/@:]*:([^\s/@]+)@/gi;
const ABSOLUTE_LOCAL_PATH =
  /(?<![A-Za-z0-9_.~-])(?:\/(?:Users|home|root|tmp)\/|\/private\/var\/|\/var\/folders\/)|(?<![A-Za-z0-9_])[A-Za-z]:\\/;
// The decomposition sanitizer's own assignment pattern, so both judge one key list the same way.
const CREDENTIAL_ASSIGNMENT = new RegExp(SENSITIVE_CHILD_ASSIGNMENT, 'gi');
// How much of a line after an assignment is judged: the literal and the prose exemption both read
// only this window, so a line with many assignments costs O(assignments × window), not
// O(assignments × line length). A value longer than the window is judged by its start, which can
// only turn an exempt value into a finding, never hide a literal.
const CREDENTIAL_VALUE_WINDOW = 512;

function anyTokenRun(pattern, line, accept) {
  for (const match of line.matchAll(pattern)) {
    if (accept(match[1])) return true;
  }
  return false;
}

function hasProviderToken(line) {
  return PROVIDER_TOKEN_PATTERNS.some((pattern) =>
    anyTokenRun(pattern, line, (run) => !WORD_RUN.test(run)),
  );
}

function hasAuthorizationValue(line) {
  if (
    anyTokenRun(AUTHORIZATION_VALUE, line, (value) => {
      const bare = stripQuotes(value);
      return bare.length >= 8 && !isPlaceholder(bare);
    })
  ) {
    return true;
  }
  return anyTokenRun(BEARER_VALUE, line, (run) => !WORD_RUN.test(run));
}

function hasUrlCredential(line) {
  return anyTokenRun(URL_CREDENTIAL, line, (password) => !isPlaceholder(password));
}

function hasAttribution(line, field) {
  try {
    assertPublishable(line, field);
    return false;
  } catch {
    return true;
  }
}

// The literal a credential key is assigned, or null when the assignment carries none: no value, a
// placeholder, or prose the decomposition sanitizer already exempts (`Token: never store it`).
function assignedLiteral(prefix, rest) {
  const value = rest.trim();
  if (value === '') return null;
  if (/^[|>][+-]?\d*$/.test(value)) return value;
  let literal;
  const quote = value[0];
  if (quote === '"' || quote === "'") {
    const end = value.indexOf(quote, 1);
    literal = end === -1 ? value.slice(1) : value.slice(1, end);
  } else {
    literal = (value.match(TEMPLATE_EXPRESSION)?.[0] ?? value.split(/\s/, 1)[0]).replace(
      /[`,;]+$/,
      '',
    );
  }
  if (literal === '' || isPlaceholder(literal)) return null;
  if (isLegitimateCredentialProse(prefix, value)) return null;
  return literal;
}

function hasCredentialAssignment(line) {
  for (const match of line.matchAll(CREDENTIAL_ASSIGNMENT)) {
    const start = match.index + match[0].length;
    const rest = line.slice(start, start + CREDENTIAL_VALUE_WINDOW);
    if (assignedLiteral(match[0], rest) !== null) return true;
  }
  return false;
}

const LINE_CHECKS = Object.freeze([
  ['private-key', (line) => PRIVATE_KEY_HEADER.test(line)],
  ['provider-token', hasProviderToken],
  ['jwt', (line) => JWT.test(line)],
  ['authorization-value', hasAuthorizationValue],
  ['url-credential', hasUrlCredential],
  ['attribution', hasAttribution],
  ['credential-assignment', hasCredentialAssignment],
  ['absolute-local-path', (line) => ABSOLUTE_LOCAL_PATH.test(line)],
]);

// Every line is scanned the same way; a fenced code block is scanned like prose.
export function scanText(text, field) {
  if (!SCAN_FIELDS.includes(field)) fail('INVALID_INPUT', `unknown scan field: ${field}`);
  const findings = [];
  splitLines(text).forEach((line, index) => {
    for (const [name, check] of LINE_CHECKS) {
      if (check(line, field)) {
        findings.push({
          id: `${name}:${field}:${index + 1}`,
          class: name,
          confidence: CONFIDENCE.get(name),
          field,
          line: index + 1,
        });
      }
    }
  });
  return findings;
}

// Scans several fields at once. An entry is `{ field, text }` or `{ field, bytes }`; bytes are
// decoded strictly first, so blob bytes read back from Git are judged exactly as stored.
export function scanEntries(entries, runState) {
  requireEnum(runState, 'runState', RUN_STATES);
  const findings = [];
  for (const entry of entries) {
    const text = entry.bytes === undefined ? entry.text : decodePlanBytes(entry.bytes, entry.field);
    findings.push(...scanText(text, entry.field));
  }
  findings.sort(
    (left, right) =>
      SCAN_FIELDS.indexOf(left.field) - SCAN_FIELDS.indexOf(right.field) ||
      left.line - right.line ||
      CLASS_ORDER.get(left.class) - CLASS_ORDER.get(right.class),
  );
  const blocking = findings
    .filter((finding) => runState === 'unattended' || finding.confidence === 'high')
    .map((finding) => finding.id);
  const acknowledgeable = findings
    .filter((finding) => runState === 'interactive' && finding.confidence !== 'high')
    .map((finding) => finding.id);
  return { findings, blocking, acknowledgeable };
}

function requireUnblocked(scan, stage) {
  if (scan.blocking.length > 0) {
    fail('SCAN_BLOCKED', `the content scan blocks publication (${stage})`, {
      stage,
      blocking: scan.blocking,
      findings: scan.findings,
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Issue, title, keywords, marker, branch

// The `**Issue:** #<N>` line of the plan's header block (the lines before the first `##` heading),
// or null when there is none. A malformed or repeated header line is refused, never guessed. The
// classification is `readIssueHeader`'s in `plan-lint-core.mjs`; this wrapper only throws.
export function parseIssueHeader(text) {
  const { issue, error } = readIssueHeader(text);
  if (error === 'invalid') {
    fail('ISSUE_HEADER_INVALID', 'the **Issue:** header is not `#<positive integer>`');
  }
  if (error === 'ambiguous') {
    fail('ISSUE_HEADER_INVALID', 'the **Issue:** header appears more than once');
  }
  return issue;
}

function agreeingIssue(inputIssue, headerIssue) {
  if (inputIssue !== null && headerIssue !== null && inputIssue !== headerIssue) {
    fail('ISSUE_MISMATCH', 'the input issue differs from the plan header', {
      issue: inputIssue,
      header: headerIssue,
    });
  }
  const issue = inputIssue ?? headerIssue;
  if (issue === null) fail('ISSUE_REQUIRED', 'an issue number is required');
  return issue;
}

// A closing keyword (GitHub's nine, any case, optional colon) followed by `#<N>`, `owner/repo#<N>`
// or an issue URL. The core owns the issue reference and appends the non-closing `Refs #<N>`.
// Linear by construction: the colon group cannot split one whitespace run between two `\s*`, and
// every reference segment is bounded (GitHub owners stay below 40 and repository names below 101
// characters, a host below 254), so a keyword never rescans the rest of a long line.
const CLOSING_KEYWORD =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b\s*(?::\s*)?(?:#\d+|[\w.-]{1,100}\/[\w.-]{1,100}#\d+|https?:\/\/[^\s/]{1,253}\/[^\s/]{1,100}\/[^\s/]{1,100}\/issues\/\d+)/i;

export function hasClosingKeyword(text) {
  return CLOSING_KEYWORD.test(text);
}

function refuseClosingKeyword(text, field) {
  const lines = splitLines(text);
  const index = lines.findIndex((line) => hasClosingKeyword(line));
  if (index !== -1 || hasClosingKeyword(text)) {
    fail('CLOSING_KEYWORD', `${field} carries a closing issue keyword`, {
      field,
      line: index === -1 ? null : index + 1,
    });
  }
}

const DOCS_SUBJECT = /^docs(?:\([^()\s]+\))?: \S/;

export function validateTitle(title) {
  requireText(requireBounded(title, 'title'), 'title');
  if (/[\r\n]/.test(title) || !DOCS_SUBJECT.test(title)) {
    fail('INVALID_TITLE', 'title must be one line in the Conventional Commit form `docs: …`');
  }
  refuseClosingKeyword(title, 'title');
  return title;
}

export function validateCommitMessage(message) {
  requireText(requireBounded(message, 'commitMessage'), 'commitMessage');
  const subject = splitLines(message)[0];
  if (!DOCS_SUBJECT.test(subject)) {
    fail(
      'INVALID_COMMIT_MESSAGE',
      'commitMessage must start with a Conventional Commit `docs: …` subject line',
    );
  }
  refuseClosingKeyword(message, 'commitMessage');
  return message;
}

// The opener the shipped marker parser (`inspectPlanPrMarker`) looks for. That parser judges only
// lines containing it, and a line that does is never `absent`; a unit test pins this string to the
// parser, so a test fails rather than the two drifting apart.
export const PLAN_PR_MARKER_OPENER = '<!-- effective-flow-plan-pr:';

export function buildPlanPrMarkerLine(planPath) {
  return `${PLAN_PR_MARKER_OPENER}v1 ${JSON.stringify({ plan: planPath })} -->`;
}

// The body prose, then the marker line, then `Refs #<N>` as the final line. The prose must not
// carry a marker line or a marker comment of its own, and the body must round-trip through the
// shipped marker parser to exactly `planPath`. Because the prose holds no opener, the parser's
// verdict on the complete body is its verdict on the appended tail, so only the tail is parsed:
// the parser trims every line with a pattern that is quadratic in a long inner whitespace run, and
// the prose never reaches it.
export function buildPullRequestBody(prose, planPath, issue) {
  requireBodyProse(prose);
  const tail = bodyTail(planPath, issue);
  const body = `${prose.trimEnd()}\n\n${tail}`;
  requireFinalBodyFits(body.length);
  requireMarkerRoundTrip(tail, planPath);
  return body;
}

function requireMarkerRoundTrip(tail, planPath) {
  const marker = inspectPlanPrMarker(tail);
  if (marker.status !== 'valid' || marker.plan !== planPath) {
    fail('MARKER_INVALID', 'the plan marker does not round-trip', {
      reason: marker.error ?? marker.status,
    });
  }
}

function bodyTail(planPath, issue) {
  return `${buildPlanPrMarkerLine(planPath)}\nRefs #${issue}`;
}

// The limit applies to the body the forge receives, not only to its prose.
function requireFinalBodyFits(length) {
  if (length > MAX_BODY_CHARS) {
    fail('INPUT_TOO_LARGE', `the final pull-request body exceeds ${MAX_BODY_CHARS} characters`, {
      field: 'body',
      limit: MAX_BODY_CHARS,
      unit: 'characters',
      length,
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Derived forge text

export const LANGUAGES = Object.freeze(['de', 'en']);
// The whole commit subject stays within common commitlint header limits, which count UTF-16 code
// units.
export const MAX_SUBJECT_CODE_UNITS = 72;
export const MAX_SUMMARY_CODE_POINTS = 600;
// Only this much of a raw value is sanitized, which bounds every pattern and round below; both
// limits above are far smaller.
const MAX_SANITIZED_SOURCE_CODE_POINTS = 4096;
const MAX_SANITIZER_ROUNDS = 5;
const ELLIPSIS = '…';

const TITLE_PREFIX = Object.freeze({ en: 'docs: plan ', de: 'docs: Plan ' });
const BODY_WORDS = Object.freeze({
  en: {
    lead: (issue) =>
      `Plan for issue #${issue}. The implementation follows as further commits on this branch.`,
    workflow: 'Recommended workflow',
    review: (result, count) =>
      `Review result: ${result === 'approved' ? 'approved' : 'revision required'}; open points: ${count}.`,
  },
  de: {
    lead: (issue) =>
      `Plan für Issue #${issue}. Die Umsetzung folgt als weitere Commits auf diesem Branch.`,
    workflow: 'Empfohlener Workflow',
    review: (result, count) =>
      `Review-Ergebnis: ${result === 'approved' ? 'freigegeben' : 'Überarbeitung nötig'}; offene Punkte: ${count}.`,
  },
});

function codePoints(value) {
  return Array.from(value);
}

// The first `limit` code points, read from at most twice as many code units so a long value is
// never split into an array as a whole. A pair cut by the slice lies beyond the kept code points.
function leadingCodePoints(value, limit) {
  return codePoints(value.slice(0, limit * 2))
    .slice(0, limit)
    .join('');
}

// Removes every `<!--` comment, an unterminated one up to the end of the text; linear by
// construction, unlike a lazy pattern restarted at every opener.
function removeHtmlComments(text) {
  let result = '';
  let cursor = 0;
  for (;;) {
    const open = text.indexOf('<!--', cursor);
    if (open === -1) return result + text.slice(cursor);
    result += text.slice(cursor, open);
    const close = text.indexOf('-->', open + 4);
    if (close === -1) return result;
    cursor = close + 3;
  }
}

// A footer token with either separator a release tool reads (`Release-As: 1.0`,
// `BREAKING CHANGE #x`).
const FOOTER_TOKEN = /\b(BREAKING[ -]CHANGE|Release-As)[ \t]*[:#]/gi;
// GitHub links `@name` after any character that is not an ASCII letter or digit, so an `@` after
// a format character, a combining mark, a non-ASCII letter or `_` (Markdown emphasis, rendered
// before the mention filter runs) is a mention too; only an ASCII letter or digit before it (an
// e-mail address) keeps it.
const MENTION_POSITION = /(?<![A-Za-z0-9])@(?=[\p{L}\p{N}])/u;

// Removes every mention `@` run in one linear pass: each run is matched once, whole, and after an
// ASCII letter or digit keeps a single `@`.
function removeMentions(text) {
  return text.replace(/@+/g, (run, offset) => {
    if (!/^[\p{L}\p{N}]/u.test(text.slice(offset + run.length, offset + run.length + 2))) {
      return run;
    }
    return /[A-Za-z0-9]/.test(text[offset - 1] ?? '') ? '@' : '';
  });
}
// A run of three or more backticks or tildes could open a code fence that swallows the body tail.
const FENCE_RUN = /`{3,}|~{3,}/g;

// One round of sanitizer steps 1–6, in their fixed order.
function sanitizeRound(text) {
  // 1. Lines joined, whitespace collapsed.
  let value = text.replace(/\s+/g, ' ').trim();
  // 2. Markup: comments, tags, images, links to their text, character references (either `x`
  //    case) and every remaining `&#`, then every remaining angle bracket, square bracket and
  //    fence run, so no link, image or code fence survives a destination the patterns do not
  //    match. Each bracket class is excluded from its own run, so no pattern rescans a long
  //    unterminated opener.
  value = removeHtmlComments(value)
    .replace(/<\/?[A-Za-z][^<>]*>/g, '')
    .replace(/!\[[^[\]]*\]\([^()]*\)/g, '')
    .replace(/\[([^[\]]*)\]\([^()]*\)/g, '$1')
    .replace(/&(?:#\d{1,8}|#[xX][0-9A-Fa-f]{1,8}|[A-Za-z][A-Za-z0-9]{0,31});/g, '')
    .replace(/&#/g, '')
    .replace(/[<>[\]]/g, '')
    .replace(FENCE_RUN, '');
  // 3. Bare URLs: with a scheme, protocol-relative (`//host`) or a `www.` autolink; like the
  //    `GH-N` reference below, `www.` counts after anything but an ASCII letter or digit, since
  //    `_` is Markdown emphasis that renders away before GitHub links the text.
  value = value.replace(/(?:https?:)?\/\/\S*/gi, '').replace(/(?<![A-Za-z0-9])www\.\S*/gi, '');
  // 4. Commit footers lose their separator.
  value = value.replace(FOOTER_TOKEN, '$1 ');
  // 5. References: `owner/repo#N` → `owner/repo N`, `#N` → `N`, `GH-N` → `GH N`; a run of
  //    `#` goes at once.
  value = value
    .replace(/([\w.-])#+(?=\d)/g, '$1 ')
    .replace(/(?<!#)#+(?=\d)/g, '')
    .replace(/(?<![A-Za-z0-9])(GH)-(?=\d)/gi, '$1 ');
  // 6. Mentions, a run of `@` at once; an e-mail address keeps its `@`.
  return removeMentions(value);
}

function residualToken(text) {
  return (
    /#\d/.test(text) ||
    /&#/.test(text) ||
    MENTION_POSITION.test(text) ||
    /[<>[\]]/.test(text) ||
    /\/\/|(?<![A-Za-z0-9])www\./i.test(text) ||
    new RegExp(FENCE_RUN.source).test(text) ||
    /(?<![A-Za-z0-9])GH-\d/i.test(text) ||
    new RegExp(FOOTER_TOKEN.source, 'i').test(text)
  );
}

// Sanitizer steps 1–7: the rounds repeat until the text is a fixed point, and any reference,
// character reference, mention, bracket, URL, fence run or footer token left after them makes the
// plan text unusable.
export function sanitizeDerivedText(raw, field) {
  let value = leadingCodePoints(raw, MAX_SANITIZED_SOURCE_CODE_POINTS);
  for (let round = 0; round < MAX_SANITIZER_ROUNDS; round += 1) {
    const next = sanitizeRound(value);
    if (next === value) break;
    value = next;
  }
  if (residualToken(value)) {
    fail('PLAN_TEXT_UNUSABLE', `the derived ${field} keeps a reference or markup token`, {
      field,
      reason: 'residual-token',
      source: 'derived',
    });
  }
  return value;
}

// Step 8 for the title description: a hard cut within `limit` UTF-16 code units, never inside a
// surrogate pair, then the one-unit ellipsis.
export function truncateTitleDescription(value, limit) {
  if (value.length <= limit) return value;
  let kept = '';
  for (const point of value) {
    if (kept.length + point.length > limit - ELLIPSIS.length) break;
    kept += point;
  }
  return `${kept.trimEnd()}${ELLIPSIS}`;
}

// Step 8 for the summary: cut at the last sentence end that fits, else at the last word boundary,
// else hard, and always end with the ellipsis.
export function truncateSummary(value, limit = MAX_SUMMARY_CODE_POINTS) {
  const points = codePoints(value);
  if (points.length <= limit) return value;
  // A cut at a space at `index` keeps `index` code points: a word cut adds the ellipsis, a
  // sentence cut a space and the ellipsis.
  let sentence = -1;
  let word = -1;
  for (let index = 1; index <= limit - 1; index += 1) {
    if (points[index] !== ' ') continue;
    word = index;
    const before = points.slice(Math.max(0, index - 2), index).join('');
    if (index <= limit - 2 && /[.!?]["')\]’”»]?$/u.test(before)) sentence = index;
  }
  if (sentence !== -1) return `${points.slice(0, sentence).join('')} ${ELLIPSIS}`;
  if (word !== -1) return `${points.slice(0, word).join('')}${ELLIPSIS}`;
  return `${points.slice(0, limit - 1).join('')}${ELLIPSIS}`;
}

// Re-raises a refusal on helper-derived or flag text with the source Issue Buddy classifies by.
function withSource(source, action) {
  try {
    return action();
  } catch (error) {
    if (error instanceof PlanPublicationError) {
      error.details = { ...error.details, source };
    }
    throw error;
  }
}

// The review result and open points of a plan that satisfies the publication contract; null for
// one that does not, whose body then carries no review paragraph.
function reviewMetadata(planText) {
  try {
    return publicationMetadataFromText(planText);
  } catch (error) {
    if (error instanceof PlanLintError) return null;
    throw error;
  }
}

// The summary is optional: a summary that keeps a token after the rounds is dropped, not refused.
function optionalSummary(raw) {
  try {
    return sanitizeDerivedText(raw, 'summary');
  } catch (error) {
    if (error instanceof PlanPublicationError && error.code === 'PLAN_TEXT_UNUSABLE') return '';
    throw error;
  }
}

// Title, commit subject and body prose derived from the verified plan text alone. Nothing here is
// returned to a caller; the title and body leave the helper only as pull-request fields.
export function deriveForgeText(planText, { planPath, issue, languageGit, languageForge }) {
  const fields = planForgeFields(planText);
  const prefix = TITLE_PREFIX[languageGit];
  const description = fields.title === null ? '' : sanitizeDerivedText(fields.title, 'title');
  if (description === '') {
    fail('PLAN_TEXT_UNUSABLE', 'the plan has no usable H1 title', {
      field: 'title',
      reason: 'empty-title',
      source: 'derived',
    });
  }
  const title = `${prefix}${truncateTitleDescription(
    description,
    MAX_SUBJECT_CODE_UNITS - prefix.length,
  )}`;
  const summary = fields.summary === null ? '' : optionalSummary(fields.summary);
  const metadata = reviewMetadata(planText);
  const words = BODY_WORDS[languageForge];
  const paragraphs = [
    words.lead(issue),
    `Plan: ${planPath}`,
    fields.workflow === null ? null : `${words.workflow}: ${fields.workflow}`,
    summary === '' ? null : truncateSummary(summary),
    metadata === null ? null : words.review(metadata.reviewResult, metadata.openPointCount),
  ].filter((paragraph) => paragraph !== null);
  return { title, commitMessage: title, prose: paragraphs.join('\n\n') };
}

// Validates and scans the derived text on its own, before any base fetch: every refusal carries
// `details.source: "derived"`.
function requireDerivedText(derived, planPath, issue) {
  return withSource('derived', () => {
    validateTitle(derived.title);
    validateCommitMessage(derived.commitMessage);
    buildPullRequestBody(derived.prose, planPath, issue);
    requireUnblocked(
      scanEntries(
        [
          { field: 'title', text: derived.title },
          { field: 'body', text: derived.prose },
          { field: 'commitMessage', text: derived.commitMessage },
        ],
        'unattended',
      ),
      'derived',
    );
    return derived;
  });
}

// The checked forge text of one mutating operation; every refusal names `derived` as its source.
function derivedForgeText(planText, planPath, base) {
  const derived = withSource('derived', () =>
    deriveForgeText(planText, {
      planPath,
      issue: base.issue,
      languageGit: base.languageGit,
      languageForge: base.languageForge,
    }),
  );
  return requireDerivedText(derived, planPath, base.issue);
}

// What a dry run reports of a derived text: its length and digest, never the text.
function textDigest(text) {
  return { length: text.length, sha256: createHash('sha256').update(text, 'utf8').digest('hex') };
}

export function planBranchName({ branchPrefix, issue }) {
  if (typeof branchPrefix !== 'string') {
    fail('INVALID_INPUT', 'branchPrefix must be a string', { field: 'branchPrefix' });
  }
  if (branchPrefix !== '') requireRefPath(branchPrefix, 'branchPrefix');
  const number = normalizeIssueNumber(issue);
  return branchPrefix === '' ? `plan/issue-${number}` : `${branchPrefix}/plan/issue-${number}`;
}

// Accepts exactly `<prefix>/plan/issue-<N>` or `plan/issue-<N>`, where `<N>` is a positive integer
// without a leading zero and the prefix passes the in-process ref rule; anything else is null.
export function parsePlanBranch(name) {
  if (typeof name !== 'string') return null;
  const match = name.match(/^(?:(.+)\/)?plan\/issue-([1-9]\d*)$/);
  if (!match) return null;
  const branchPrefix = match[1] ?? '';
  if (branchPrefix !== '' && refPathProblem(branchPrefix) !== null) return null;
  const issue = Number(match[2]);
  if (!Number.isSafeInteger(issue)) return null;
  return { branchPrefix, issue };
}

function planNameViolation(name, issue) {
  const match = name.match(UNATTENDED_PLAN_NAME);
  if (!match) return 'name-mismatch';
  return Number(match[1]) === issue ? null : 'issue-mismatch';
}

// ---------------------------------------------------------------------------------------------
// Git

function timedOut(result) {
  return (
    result?.timedOut === true ||
    result?.forcedKill === true ||
    (typeof result?.signal === 'string' && result.signal !== '') ||
    result?.error?.code === 'ETIMEDOUT'
  );
}

function createGit(context) {
  const { runner, cwd } = context;
  const run = (args, options = {}) =>
    runner({
      executable: 'git',
      args,
      cwd,
      ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
      ...(options.env === undefined ? {} : { env: options.env }),
      // A bounded call stops its whole process group, so a hook or transport helper that
      // inherited Git's pipes cannot outlive the bound.
      ...(options.timeoutMs === undefined
        ? {}
        : { timeoutMs: options.timeoutMs, processGroup: true }),
      ...(options.stdoutBuffer ? { stdoutBuffer: true } : {}),
    });
  const checked = async (args, options = {}) => {
    const result = await run(args, options);
    if (result?.error || result?.status !== 0) {
      fail(options.code ?? 'COMMAND_FAILED', `git ${args[0]} failed`, {
        command: `git ${args[0]}`,
        status: result?.status ?? null,
        stderr: diagnosticText(result?.stderr ?? result?.error?.code ?? ''),
      });
    }
    return result;
  };
  const text = async (args, options) => String((await checked(args, options)).stdout).trim();
  return { run, checked, text };
}

async function verifyRepositoryRoot(git, cwdReal, fs) {
  const result = await git.run(['rev-parse', '--show-toplevel']);
  if (result?.status !== 0 || typeof result.stdout !== 'string') {
    fail('NOT_GIT_REPOSITORY', 'cwd is not inside a Git repository');
  }
  const top = result.stdout.trim();
  let topReal;
  try {
    topReal = fs.realpathSync(top);
  } catch {
    topReal = top;
  }
  if (topReal !== cwdReal) fail('INVALID_INPUT', 'cwd must be the repository root');
}

async function requireGitVersion(git) {
  const raw = await git.text(['--version']);
  const match = raw.match(/git version (\d+)\.(\d+)/);
  if (!match) fail('GIT_UNSUPPORTED', 'could not read the Git version', { version: raw });
  const [major, minor] = [Number(match[1]), Number(match[2])];
  const [needMajor, needMinor] = MINIMUM_GIT_VERSION;
  if (major < needMajor || (major === needMajor && minor < needMinor)) {
    fail('GIT_UNSUPPORTED', `Git ${needMajor}.${needMinor} or newer is required`, {
      version: `${major}.${minor}`,
    });
  }
  return `${major}.${minor}`;
}

// Git's auto-detected identity does not count: configuration or the `GIT_COMMITTER_*` /
// `GIT_AUTHOR_*` environment must state it.
async function requireIdentity(git) {
  for (const variable of ['GIT_COMMITTER_IDENT', 'GIT_AUTHOR_IDENT']) {
    const result = await git.run(['-c', 'user.useConfigOnly=true', 'var', variable]);
    if (result?.status !== 0) {
      fail('IDENTITY_MISSING', 'no configured Git identity', { variable });
    }
  }
}

async function configValue(git, key) {
  const result = await git.run(['config', '--get', key]);
  return result?.status === 0 ? String(result.stdout).trim() || null : null;
}

async function networkOptions(git, context) {
  return {
    env: nonInteractiveFetchEnv({
      environment: context.environment,
      inheritedEnvironment: process.env,
      configuredSshCommand: await configValue(git, 'core.sshCommand'),
      configuredSshVariant: await configValue(git, 'ssh.variant'),
    }),
    timeoutMs: context.timeoutMs,
  };
}

// The forge is addressed by the fetch URL, but `git push` goes to the push URLs (`pushurl`,
// `pushInsteadOf`, possibly several). Only a remote whose single push URL is its fetch URL is
// accepted, so the branch lock and the pull request can never name two different repositories.
async function remoteUrl(git, remote) {
  const result = await git.run(['remote', 'get-url', remote]);
  const url = typeof result?.stdout === 'string' ? result.stdout.trim() : '';
  if (result?.status !== 0 || url === '') {
    fail('INVALID_INPUT', `remote ${remote} is not configured`, { field: 'remote' });
  }
  const pushResult = await git.run(['remote', 'get-url', '--push', '--all', remote]);
  const pushUrls =
    pushResult?.status === 0 && typeof pushResult.stdout === 'string'
      ? pushResult.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
      : [];
  if (pushUrls.length !== 1 || pushUrls[0] !== url) {
    fail('REMOTE_URL_MISMATCH', `remote ${remote} pushes somewhere other than it fetches from`, {
      remote,
      pushUrlCount: pushUrls.length,
    });
  }
  return url;
}

// Every fetch stays a plain object transfer: no tags, no submodule recursion, and no automatic
// maintenance started behind the bounded call.
const FETCH_FLAGS = Object.freeze([
  '--no-tags',
  '--no-recurse-submodules',
  '--no-auto-maintenance',
  '--quiet',
]);

// A base fetch without `+` refuses a non-fast-forward update, which means the remote base was
// rewritten since the last fetch; that is no connectivity problem and is named as such. Git reports
// the refusal only on stderr and suppresses it under `--quiet`, so this one fetch runs without
// `--quiet` and in the C locale, where the refusal line is the untranslated `[rejected]`.
const NON_FAST_FORWARD = /\[rejected\]|non-fast-forward/;

async function fetchBase(git, remote, baseBranch, network) {
  const destination = `refs/remotes/${remote}/${baseBranch}`;
  const flags = FETCH_FLAGS.filter((flag) => flag !== '--quiet');
  const result = await git.run(
    ['fetch', ...flags, remote, `refs/heads/${baseBranch}:${destination}`],
    { ...network, env: { ...network.env, LC_ALL: 'C' } },
  );
  if (
    !timedOut(result) &&
    result?.status !== 0 &&
    NON_FAST_FORWARD.test(String(result?.stderr ?? ''))
  ) {
    fail('BASE_REWRITTEN', `${baseBranch} on ${remote} was rewritten since the last fetch`, {
      baseBranch,
      stderr: diagnosticText(result?.stderr ?? ''),
    });
  }
  if (timedOut(result) || result?.error || result?.status !== 0) {
    fail('REMOTE_UNREACHABLE', `fetching ${baseBranch} from ${remote} failed`, {
      reason: timedOut(result) ? 'timeout' : 'failed',
      stderr: diagnosticText(result?.stderr ?? ''),
    });
  }
  return resolveBase(git, remote, baseBranch);
}

async function resolveBase(git, remote, baseBranch) {
  const result = await git.run([
    'rev-parse',
    '--verify',
    '--quiet',
    `refs/remotes/${remote}/${baseBranch}^{commit}`,
  ]);
  const oid = typeof result?.stdout === 'string' ? result.stdout.trim() : '';
  if (result?.status !== 0 || oid === '') {
    fail('BASE_UNRESOLVED', `refs/remotes/${remote}/${baseBranch} does not resolve to a commit`);
  }
  return oid;
}

// The lock query. `ls-remote` tail-matches its pattern, so only an output line whose refname is
// exactly `refs/heads/<branch>` counts. Returns the remote OID or null.
async function remoteBranchOid(git, remote, branch, network) {
  const ref = `refs/heads/${branch}`;
  const result = await git.run(['ls-remote', '--exit-code', remote, ref], network);
  if (timedOut(result) || result?.error || (result?.status !== 0 && result?.status !== 2)) {
    fail('REMOTE_UNREACHABLE', `ls-remote against ${remote} failed`, {
      reason: timedOut(result) ? 'timeout' : 'failed',
      stderr: diagnosticText(result?.stderr ?? ''),
    });
  }
  if (result.status === 2) return null;
  for (const line of String(result.stdout).split('\n')) {
    const [oid, name] = line.split('\t');
    if (name === ref && /^[0-9a-f]{40,64}$/.test(oid)) return oid;
  }
  return null;
}

// The lock, read again immediately before `pr-create`: the remote plan branch must still carry
// exactly the verified commit (this run's push, or the tip `complete-branch` checked). A branch that
// moved since — also one fast-forwarded on top of the verified commit, which the earlier presence
// check cannot see — gets no pull request. A query that cannot read the remote leaves it unknown
// whether the branch still carries the commit. The tracker's pull-request read-back states no head
// commit, so this query is the last point where the head is compared.
async function requireLockHeld(git, { remote, branch, commitOid }, network, state) {
  let remoteOid;
  try {
    remoteOid = await remoteBranchOid(git, remote, branch, network);
  } catch (error) {
    if (!(error instanceof PlanPublicationError)) throw error;
    fail(error.code, error.message, { ...error.details, ...state, state: 'unknown' });
  }
  if (remoteOid !== commitOid) {
    fail('LOCK_LOST', 'the remote plan branch does not carry the verified commit', {
      ...state,
      state: 'unknown',
      remoteOid,
    });
  }
}

function parseRawDiff(stdout) {
  const fields = String(stdout).split('\0');
  if (fields.at(-1) === '') fields.pop();
  const records = [];
  for (let index = 0; index < fields.length;) {
    const metadata = fields[index];
    if (!metadata?.startsWith(':')) fail('COMMAND_FAILED', 'git returned an invalid raw diff');
    const [oldMode, newMode, oldOid, newOid, status] = metadata.slice(1).split(' ');
    const paths = /^[RC]/.test(status) ? 2 : 1;
    const recordPaths = fields.slice(index + 1, index + 1 + paths);
    records.push({ oldMode, newMode, oldOid, newOid, status, path: recordPaths.at(-1) });
    index += 1 + paths;
  }
  return records;
}

async function readBlob(git, oid) {
  const result = await git.checked(['cat-file', 'blob', oid], { stdoutBuffer: true });
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(String(result.stdout));
}

// Exactly one commit on the merge base that adds exactly one top-level plan file of the expected
// issue: mode 100644, at most 512 KiB, no NUL, valid UTF-8, and an agreeing `**Issue:**` header.
async function changesetViolations(git, { head, base, planDir, issue }) {
  const violations = [];
  const headOid = await git.text(['rev-parse', '--verify', `${head}^{commit}`], {
    code: 'INVALID_INPUT',
  });
  const mergeBaseResult = await git.run(['merge-base', base, headOid]);
  const mergeBase =
    mergeBaseResult?.status === 0 ? String(mergeBaseResult.stdout).trim() || null : null;
  if (mergeBase === null) {
    return {
      headOid,
      mergeBase,
      planFile: null,
      blobOid: null,
      violations: [{ violation: 'no-merge-base' }],
    };
  }
  const parents = (await git.text(['rev-list', '--parents', '-n', '1', headOid]))
    .split(/\s+/)
    .slice(1);
  if (parents.length !== 1 || parents[0] !== mergeBase) {
    violations.push({ violation: 'not-single-commit' });
  }
  const records = parseRawDiff(
    (await git.checked(['diff-tree', '-r', '-z', '--no-renames', '--raw', mergeBase, headOid]))
      .stdout,
  );
  if (records.length === 0) violations.push({ violation: 'empty' });
  if (records.length > 1) violations.push({ violation: 'multiple-paths', count: records.length });
  const statusViolation = { D: 'deletion', M: 'modification', T: 'type-change' };
  let planFile = null;
  let blobOid = null;
  for (const record of records) {
    const filePath = record.path;
    const statusLetter = record.status[0];
    if (statusLetter !== 'A') {
      violations.push({ violation: statusViolation[statusLetter] ?? 'rename', path: filePath });
      continue;
    }
    const directory = path.posix.dirname(filePath);
    if (directory !== planDir) {
      const nested = planDir === '.' || directory.startsWith(`${planDir}/`);
      violations.push({ violation: nested ? 'nested-path' : 'outside-plan-dir', path: filePath });
      continue;
    }
    if (!filePath.endsWith('.md')) {
      violations.push({ violation: 'name-mismatch', path: filePath });
      continue;
    }
    if (record.newMode !== '100644') {
      violations.push({ violation: 'mode', path: filePath, mode: record.newMode });
      continue;
    }
    const nameProblem = planNameViolation(path.posix.basename(filePath), issue);
    if (nameProblem) violations.push({ violation: nameProblem, path: filePath });
    const size = Number(await git.text(['cat-file', '-s', record.newOid]));
    if (!Number.isSafeInteger(size) || size > MAX_PLAN_BYTES) {
      violations.push({ violation: 'oversized', path: filePath, size });
      continue;
    }
    const bytes = await readBlob(git, record.newOid);
    try {
      const header = parseIssueHeader(decodePlanBytes(bytes, 'plan'));
      if (header !== null && header !== issue) {
        violations.push({ violation: 'issue-mismatch', path: filePath });
      }
    } catch (error) {
      if (!(error instanceof PlanPublicationError)) throw error;
      violations.push({
        violation: error.code === 'INVALID_CONTENT' ? error.details.reason : 'issue-header-invalid',
        path: filePath,
      });
    }
    if (records.length === 1) {
      planFile = filePath;
      blobOid = record.newOid;
    }
  }
  return { headOid, mergeBase, planFile, blobOid, violations };
}

function requireAcceptedChangeset(result) {
  if (result.violations.length > 0) {
    fail('CHANGESET_INVALID', 'the change is not exactly one added plan file', {
      violations: result.violations,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Base-move assessment: cited tokens and the fit verdict (pure; the Git reads are in the operation)

export const BASE_MOVE_VERDICTS = Object.freeze(['fits', 'overlap', 'undecidable']);
// The closed reason enum per verdict. `fits` carries `reason: null`; `no-affected-files` means no
// Affected files table or none with a usable token, `unusable-entry` at least one unusable table
// token.
export const BASE_MOVE_REASONS = Object.freeze({
  fits: Object.freeze([null]),
  overlap: Object.freeze(['same-issue-plan', 'cited-path']),
  undecidable: Object.freeze([
    'not-ancestor',
    'gitlink',
    'no-affected-files',
    'unusable-entry',
    'plan-identity',
  ]),
});
// The bound of each returned path list; the cited total is returned beside it.
export const MAX_BASE_MOVE_PATHS = 20;
// A cited or overlapping path is reported only when it is safe to carry into a pass report, a
// ledger and a pull-request appendix: no control or line-separator character, no backtick, no
// backslash and at most this many characters.
const MAX_REPORTED_PATH_CHARS = 512;
const UNREPORTABLE_PATH = /[\u0000-\u001f\u007f-\u009f\u2028\u2029`\\]/;
const AFFECTED_FILES_HEADINGS = Object.freeze(['## Affected files', '## Betroffene Dateien']);
const FILE_COLUMN = /^(?:file|files|datei|dateien)$/i;
// A segment holding one of these is a wildcard or a placeholder.
const WILDCARD_SEGMENT = /[*?[{<]/;
const FILE_EXTENSION = /\.[A-Za-z0-9_-]+$/;
const GITLINK_MODE = '160000';

function reportablePath(value) {
  return (
    typeof value === 'string' &&
    value.length <= MAX_REPORTED_PATH_CHARS &&
    !UNREPORTABLE_PATH.test(value)
  );
}

// The reasons after which a moved base never re-publishes: a rewritten base (or a vanished
// `fromBaseOid`) is an integrity failure, and a plan of the same issue in the range, or one that may
// be, is a duplicate rather than a conflict review could reconcile. Every other assessed move
// re-publishes once; the pass report, autopilot and `publish` all derive the split from this list.
export const BASE_MOVE_STOPPING_REASONS = Object.freeze([
  'not-ancestor',
  'same-issue-plan',
  'plan-identity',
]);

export function baseMoveRepublishes(reason) {
  return !BASE_MOVE_STOPPING_REASONS.includes(reason);
}

const BASE_MOVE_FLAG_FIELDS = Object.freeze([
  'fromBaseOid',
  'toBaseOid',
  'verdict',
  'reason',
  'commitCount',
  'overlappingPaths',
]);

// `publish`'s optional `baseMove`: an unresolved, publishable move onto exactly the bound base.
// A fitting move carries no flag, and a stopping reason never publishes.
function requireBaseMove(value, expectedBaseOid) {
  const refuse = (message, details = {}) =>
    fail('INVALID_INPUT', `baseMove ${message}`, { field: 'baseMove', ...details });
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse('must be an object');
  const unknown = Object.keys(value).filter((key) => !BASE_MOVE_FLAG_FIELDS.includes(key));
  if (unknown.length > 0) refuse(`has an unknown key: ${unknown.join(', ')}`, { keys: unknown });
  const missing = BASE_MOVE_FLAG_FIELDS.filter((key) => value[key] === undefined);
  if (missing.length > 0) refuse(`misses a key: ${missing.join(', ')}`, { keys: missing });
  const { fromBaseOid, toBaseOid, verdict, reason, commitCount, overlappingPaths } = value;
  requireOid(fromBaseOid, 'baseMove.fromBaseOid');
  requireOid(toBaseOid, 'baseMove.toBaseOid');
  if (fromBaseOid === toBaseOid) refuse('must name two different bases');
  if (toBaseOid !== expectedBaseOid) refuse('must move to expectedBaseOid');
  if (!BASE_MOVE_VERDICTS.includes(verdict) || verdict === 'fits') {
    refuse('verdict must be overlap or undecidable; a fitting move carries no flag');
  }
  if (!BASE_MOVE_REASONS[verdict].includes(reason)) refuse(`reason is not a ${verdict} reason`);
  if (!baseMoveRepublishes(reason)) refuse(`reason ${reason} stops the publication`);
  if (!Number.isSafeInteger(commitCount) || commitCount < 1) {
    refuse('commitCount must be a positive integer');
  }
  if (
    !Array.isArray(overlappingPaths) ||
    overlappingPaths.length > MAX_BASE_MOVE_PATHS ||
    !overlappingPaths.every((entry) => reportablePath(entry) && entry !== '')
  ) {
    refuse(`overlappingPaths must hold at most ${MAX_BASE_MOVE_PATHS} reportable paths`);
  }
  return { fromBaseOid, toBaseOid, verdict, reason, commitCount, overlappingPaths };
}

function commitsText(commitCount) {
  return `${commitCount} commit${commitCount === 1 ? '' : 's'}`;
}

// The fixed English flag a flagged re-publish carries, so reviewers and agents can search for it.
// A list of exactly the bound may have been cut by the assessment, so it says so. An optional
// `furtherBaseMove` (`publish` with `allowNewerBase`) appends one sentence naming the unassessed
// move past the assessed base.
export function buildBaseMoveFlag(
  { fromBaseOid, toBaseOid, reason, commitCount, overlappingPaths },
  furtherBaseMove = null,
) {
  const from = fromBaseOid.slice(0, 7);
  const to = toBaseOid.slice(0, 7);
  const truncated = overlappingPaths.length === MAX_BASE_MOVE_PATHS ? ' (list truncated)' : '';
  const paths =
    overlappingPaths.length === 0
      ? ''
      : ` Overlapping paths: ${overlappingPaths.map((entry) => `\`${entry}\``).join(', ')}${truncated}.`;
  const further =
    furtherBaseMove === null
      ? ''
      : ` The base moved again to \`${furtherBaseMove.toBaseOid.slice(0, 7)}\` ` +
        `(${commitsText(furtherBaseMove.commitCount)}) after this assessment; that move was not ` +
        'assessed.';
  return (
    `**Unresolved base move.** The base moved from \`${from}\` to \`${to}\` while this plan was ` +
    `written (${commitsText(commitCount)}). The plan was published on \`${to}\` without ` +
    `reconciling it. Reason: \`${reason}\`.${paths} Review must reconcile the plan with the new ` +
    `base before it is implemented.${further}`
  );
}

// The standalone flag of a further move after a fitting assessment, which itself carries no flag.
export function buildFurtherBaseMoveFlag({ fromBaseOid, toBaseOid, commitCount }) {
  const from = fromBaseOid.slice(0, 7);
  return (
    `**Unresolved base move.** The base moved again from \`${from}\` to ` +
    `\`${toBaseOid.slice(0, 7)}\` (${commitsText(commitCount)}) after the plan was assessed ` +
    `against it. The plan was published on \`${from}\` without assessing that move. Review must ` +
    'reconcile the plan with the new base before it is implemented.'
  );
}

// The most literal alternatives one pattern segment may expand to; a segment whose `{a,b}`
// alternations multiply past this bound makes the token unusable.
const MAX_SEGMENT_ALTERNATIVES = 64;
// The items of a compiled pattern segment besides its literal characters: `*` and `<…>` (any run
// inside one segment), `?` (one character), and a whole-segment `**` (zero or more segments).
const ANY_RUN = 0;
const ANY_ONE = 1;
const ANY_SEGMENTS = null;

// One pattern segment as its expanded alternatives, each a list of literal characters, `ANY_RUN`
// and `ANY_ONE`. Null when it cannot be built: a `[` class, a stray closer, an unclosed or nested
// placeholder or alternation, a wildcard inside an alternative, or too many alternatives.
function compileSegment(segment) {
  const characters = [...segment];
  let alternatives = [[]];
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    let options;
    if (character === '*') options = [[ANY_RUN]];
    else if (character === '?') options = [[ANY_ONE]];
    else if (character === '<') {
      const end = characters.indexOf('>', index + 1);
      if (end === -1 || characters.slice(index + 1, end).includes('<')) return null;
      options = [[ANY_RUN]];
      index = end;
    } else if (character === '{') {
      const end = characters.indexOf('}', index + 1);
      if (end === -1) return null;
      const parts = characters
        .slice(index + 1, end)
        .join('')
        .split(',');
      if (parts.some((part) => /[*?[\]{}<>]/.test(part))) return null;
      options = parts.map((part) => [...part]);
      index = end;
    } else if ('[]}>'.includes(character)) return null;
    else options = [[character]];
    if (options.length === 1) {
      for (const alternative of alternatives) alternative.push(...options[0]);
      continue;
    }
    if (alternatives.length * options.length > MAX_SEGMENT_ALTERNATIVES) return null;
    alternatives = alternatives.flatMap((prefix) =>
      options.map((option) => [...prefix, ...option]),
    );
  }
  return alternatives;
}

// Whether one compiled alternative matches one path segment (an array of characters): the
// two-pointer wildcard match, which backtracks only to the last `ANY_RUN` and so stays within
// O(items × characters) on any input.
function segmentMatches(items, characters) {
  let item = 0;
  let position = 0;
  let star = -1;
  let resume = 0;
  while (position < characters.length) {
    const current = items[item];
    if (current === ANY_ONE || (typeof current === 'string' && current === characters[position])) {
      item += 1;
      position += 1;
    } else if (current === ANY_RUN) {
      star = item;
      item += 1;
      resume = position;
    } else if (star !== -1) {
      item = star + 1;
      resume += 1;
      position = resume;
    } else return false;
  }
  while (items[item] === ANY_RUN) item += 1;
  return item === items.length;
}

// The matcher a token with a wildcard or placeholder in its first segment stands for, applied to a
// (folded) changed path and matched against its trailing segments: `*` and `<…>` are any text
// inside one segment, `?` one character, `{a,b}` an alternation of literal alternatives and a
// whole-segment `**` zero or more segments. With `directory` the matched segments must be a
// directory on the path. Null when no matcher can be built (see `compileSegment`, or an empty, `.`
// or `..` segment). Matching runs segment by segment over the reachable end positions, so its cost
// is bounded by the product of the token and path lengths, never exponential.
function compileCitedPattern(body, directory, fold = (value) => value) {
  const segments = [];
  for (const segment of fold(body).split('/')) {
    if (segment === '' || segment === '.' || segment === '..') return null;
    if (segment === '**') {
      segments.push(ANY_SEGMENTS);
      continue;
    }
    const alternatives = compileSegment(segment);
    if (alternatives === null) return null;
    segments.push(alternatives);
  }
  return (changedPath) => {
    const parts = changedPath.split('/').map((part) => [...part]);
    // reach[end]: the segments so far match parts[start..end) for some start.
    let reach = new Array(parts.length + 1).fill(true);
    for (const segment of segments) {
      const next = new Array(parts.length + 1).fill(false);
      if (segment === ANY_SEGMENTS) {
        let reached = false;
        for (let end = 0; end <= parts.length; end += 1) {
          reached ||= reach[end];
          next[end] = reached;
        }
      } else {
        for (let end = 0; end < parts.length; end += 1) {
          next[end + 1] = reach[end] && segment.some((items) => segmentMatches(items, parts[end]));
        }
      }
      reach = next;
    }
    return directory ? reach.slice(0, parts.length).includes(true) : reach[parts.length];
  };
}

// One inline-code token of a plan, normalized in the fixed order: strip a `#<anchor>` or
// `:<line>` suffix; keep only a candidate (no whitespace, and a `/` or a file extension); reduce a
// wildcard or placeholder segment after the first to the directory before it, or turn a first-
// segment one into a pattern; mark a trailing `/` as a directory entry; validate the literal with
// the repository-path rule of `validateLiteralPath`. Returns `{kind: 'ignored'}`,
// `{kind: 'unusable'}`, `{kind: 'literal', path, directory}` or `{kind: 'pattern', path,
// directory}`; a token reduced from a wildcard is a directory literal.
export function normalizeCitedToken(raw) {
  if (typeof raw !== 'string') return { kind: 'ignored' };
  const token = raw.replace(/#[^/]*$/, '').replace(/:\d+(?:-\d+)?$/, '');
  if (token === '' || /\s/.test(token)) return { kind: 'ignored' };
  const directory = token.endsWith('/');
  const body = directory ? token.slice(0, -1) : token;
  if (!token.includes('/') && !FILE_EXTENSION.test(body)) return { kind: 'ignored' };
  if (!reportablePath(body)) return { kind: 'unusable' };
  const segments = body.split('/');
  const wildcard = segments.findIndex((segment) => WILDCARD_SEGMENT.test(segment));
  if (wildcard === 0) {
    return compileCitedPattern(body, directory) === null
      ? { kind: 'unusable' }
      : { kind: 'pattern', path: body, directory };
  }
  const literal = wildcard === -1 ? body : segments.slice(0, wildcard).join('/');
  try {
    validateLiteralPath(literal, 'cited path');
  } catch {
    return { kind: 'unusable' };
  }
  return { kind: 'literal', path: literal, directory: wildcard === -1 ? directory : true };
}

// The inline code spans of one line or table cell: a run of n backticks opens a span that the next
// run of exactly n backticks closes, and one space on both sides of a non-blank span is stripped.
// `rest` is the text outside every span, an escaped or unclosed backtick run included.
function splitCodeSpans(line) {
  const spans = [];
  let rest = '';
  let outside = 0;
  let index = 0;
  while (index < line.length) {
    if (line[index] === '\\' && line[index + 1] === '`') {
      index += 2;
      continue;
    }
    if (line[index] !== '`') {
      index += 1;
      continue;
    }
    let open = index;
    while (line[open] === '`') open += 1;
    const length = open - index;
    let search = open;
    let close = -1;
    while (search < line.length) {
      if (line[search] !== '`') {
        search += 1;
        continue;
      }
      let end = search;
      while (line[end] === '`') end += 1;
      if (end - search === length) {
        close = search;
        break;
      }
      search = end;
    }
    if (close === -1) {
      index = open;
      continue;
    }
    let content = line.slice(open, close);
    if (content.length > 1 && content.startsWith(' ') && content.endsWith(' ') && content.trim()) {
      content = content.slice(1, -1);
    }
    spans.push(content);
    rest += line.slice(outside, index);
    index = close + length;
    outside = index;
  }
  return { spans, rest: rest + line.slice(outside) };
}

function codeSpans(line) {
  return splitCodeSpans(line).spans;
}

// Whether the text outside a File cell's code spans names a file itself: a leftover backtick (an
// escaped or unclosed run), a word longer than `MAX_REPORTED_PATH_CHARS`, or a word holding a
// letter or digit whose raw or trimmed form is a path candidate under the same rule as a code span
// (`normalizeCitedToken`). Words split on whitespace, `,`, `;`, brackets, arrows, `×` and `<br>`;
// the trimmed form loses leading `:*_` and quotes and trailing `.:*_`, quotes, `!?…`, dashes and
// arrows, so a leading `.` (`.gitignore`) is kept. The trim is an index loop, linear in the word.
const LEADING_WORD_TRIM = /[:*_"'‘-‟«»]/u;
const TRAILING_WORD_TRIM = /[.:*_"'‘-‟«»!?…–—←-⇿➔-➿⟰-⟿⤀-⥿⬀-⯿]/u;

function trimWord(word) {
  let start = 0;
  let end = word.length;
  while (start < end && LEADING_WORD_TRIM.test(word[start])) start += 1;
  while (end > start && TRAILING_WORD_TRIM.test(word[end - 1])) end -= 1;
  return word.slice(start, end);
}

function namesFileOutsideSpans(text) {
  if (text.includes('`')) return true;
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .split(/[\s,;()[\]<>←-⇿⟵-⟿×]+/u)
    .some(
      (word) =>
        word.length > MAX_REPORTED_PATH_CHARS ||
        (/[\p{L}\p{N}]/u.test(word) &&
          (normalizeCitedToken(word).kind !== 'ignored' ||
            normalizeCitedToken(trimWord(word)).kind !== 'ignored')),
    );
}

// The cells of a pipe-table row, split on every unescaped `|` (inside code spans too, as GitHub
// tables do), with `\|` unescaped in the cell text.
function tableCells(line) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells = [];
  let current = '';
  for (let index = 0; index < row.length; index += 1) {
    if (row[index] === '\\' && row[index + 1] === '|') {
      current += '|';
      index += 1;
    } else if (row[index] === '|') {
      cells.push(current);
      current = '';
    } else current += row[index];
  }
  cells.push(current);
  return cells;
}

const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const FENCE_OPENER = /^ {0,3}(`{3,}|~{3,})/;

// The tokens a plan cites, from its exact bytes decoded once: `table` holds every backticked token
// of the File column of each table under `## Affected files` / `## Betroffene Dateien`, `prose`
// every other inline code span outside fenced blocks (other table columns included). Each entry is
// a normalized token (`normalizeCitedToken`) with its `raw` text; ignored tokens are dropped, and
// so is the plan's own path. A non-empty File cell is also an unusable table entry when it yields no
// token, or when its text outside code spans names a file (`namesFileOutsideSpans`), so a file named
// without a code span (`` `src/a.mjs` and src/b.mjs ``) fails closed instead of being skipped, while
// a note such as `(new)` or an arrow does not. `tableFound` says whether such a table exists.
export function extractCitedTokens(text, { planPath, folding } = {}) {
  const fold = pathFold(folding);
  const ownPath = typeof planPath === 'string' ? fold(planPath) : null;
  const table = [];
  const prose = [];
  let tableFound = false;
  // Whether `raw` is a path candidate; the plan's own path counts as one but is not kept.
  const add = (target, raw) => {
    const token = normalizeCitedToken(raw);
    if (token.kind === 'ignored') return false;
    if (token.kind === 'literal' && !token.directory && fold(token.path) === ownPath) return true;
    target.push({ raw, ...token });
    return true;
  };
  const lines = splitLines(text);
  let fence = null;
  let section = false;
  let rows = false;
  let fileColumn = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence) {
      const closing = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (closing && closing[1][0] === fence.character && closing[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    const opener = line.match(FENCE_OPENER);
    if (opener) {
      fence = { character: opener[1][0], length: opener[1].length };
      rows = false;
      continue;
    }
    if (/^ {0,3}#{1,2}(?:\s|$)/.test(line)) {
      section = AFFECTED_FILES_HEADINGS.includes(line.trim());
      rows = false;
    } else if (section && line.trim().startsWith('|')) {
      if (rows) {
        tableCells(line).forEach((cell, column) => {
          if (column !== fileColumn) {
            for (const span of codeSpans(cell)) add(prose, span);
            return;
          }
          const { spans, rest } = splitCodeSpans(cell);
          const candidates = spans.filter((span) => add(table, span));
          if (cell.trim() !== '' && (candidates.length === 0 || namesFileOutsideSpans(rest))) {
            table.push({ raw: cell.trim(), kind: 'unusable' });
          }
        });
        continue;
      }
      if (TABLE_SEPARATOR.test(lines[index + 1] ?? '')) {
        const header = tableCells(line).map((cell) => cell.trim());
        const named = header.findIndex((cell) => FILE_COLUMN.test(cell));
        fileColumn = named === -1 ? 0 : named;
        tableFound = true;
        rows = true;
        for (const cell of header) for (const span of codeSpans(cell)) add(prose, span);
        index += 1;
        continue;
      }
    } else rows = false;
    for (const span of codeSpans(line)) add(prose, span);
  }
  return { tableFound, table, prose };
}

// Whether a (folded) changed path is a Markdown file directly under the (folded) plan directory or
// its `archive/`, the files collection's plan scan reads.
function planDirectoryMarkdown(changedPath, planDir) {
  let relative = null;
  if (planDir === '.') relative = changedPath;
  else if (changedPath.startsWith(`${planDir}/`)) relative = changedPath.slice(planDir.length + 1);
  return relative !== null && /^(?:archive\/)?[^/]+\.md$/.test(relative);
}

// Which issue a plan file the range adds or modifies belongs to, as collection's plan scan
// identifies it: its `**Issue:**` header, else the `-issue-<N>-` file-name rule or the plan's own
// basename. Returns `same-issue`, `other`, or `invalid` for undecodable bytes, a malformed header
// or a header that conflicts with the file name.
export function planFileIdentity(bytes, filePath, { issue, planPath, folding } = {}) {
  const fold = pathFold(folding);
  let header;
  try {
    header = parseIssueHeader(decodePlanBytes(bytes));
  } catch (error) {
    if (error instanceof PlanPublicationError) return 'invalid';
    throw error;
  }
  const basename = path.posix.basename(filePath);
  const named = basename.match(UNATTENDED_PLAN_NAME);
  const ownName =
    typeof planPath === 'string' && fold(basename) === fold(path.posix.basename(planPath));
  const fallback = named ? Number(named[1]) : ownName ? issue : null;
  if (header !== null && fallback !== null && header !== fallback) return 'invalid';
  return (header ?? fallback) === issue ? 'same-issue' : 'other';
}

function uniquePaths(values) {
  return [...new Set(values)];
}

// The fit verdict of a moved base, deterministic and fail-closed. Input: `ancestor` (whether
// `fromBaseOid` is an ancestor of the new tip), `changes` (`{path, oldMode, newMode}` per changed
// path of the range), `cited` (`extractCitedTokens`), `tracked` (the table literals present in the
// old or new tree), `planFiles` (`{path, identity}` per added or modified plan file of the range),
// `planDir` and the Git `folding` flags. The checks run in the order not-ancestor, plan identity,
// same-issue plan (the stopping reasons, which win over every republishing one), gitlink, no
// affected files, unusable entry, cited path, fits. A changed Markdown file directly under the
// plan directory or its archive is matched only by an exact-file citation, so archive commits for
// other issues keep fitting. A table pattern is compiled from its folded body, since it matches
// folded paths; one that the fold makes uncompilable (such as `<` and a combining U+0338 composing
// to `≮`) is an unusable entry.
export function assessBaseMove({
  ancestor,
  changes = [],
  cited,
  tracked = new Set(),
  planFiles = [],
  planDir = '.',
  folding = {},
}) {
  const fold = pathFold(folding);
  const usable = cited.table.filter((entry) => entry.kind !== 'unusable');
  const patterns = usable
    .filter((entry) => entry.kind === 'pattern')
    .map((entry) => compileCitedPattern(entry.path, entry.directory, fold));
  const proseFiles = cited.prose.filter((entry) => entry.kind === 'literal' && !entry.directory);
  const citedPaths = uniquePaths([...usable, ...proseFiles].map((entry) => entry.path));
  const changedPaths = uniquePaths(changes.map((change) => change.path)).sort();
  const gitlinks = uniquePaths(
    changes
      .filter((change) => change.oldMode === GITLINK_MODE || change.newMode === GITLINK_MODE)
      .map((change) => change.path),
  ).sort();
  const plansOf = (identity) =>
    planFiles.filter((file) => file.identity === identity).map((file) => file.path);
  const decide = () => {
    if (!ancestor) return ['undecidable', 'not-ancestor', []];
    if (plansOf('invalid').length > 0) return ['undecidable', 'plan-identity', plansOf('invalid')];
    if (plansOf('same-issue').length > 0) {
      return ['overlap', 'same-issue-plan', plansOf('same-issue')];
    }
    if (gitlinks.length > 0) return ['undecidable', 'gitlink', gitlinks];
    if (usable.length === 0) return ['undecidable', 'no-affected-files', []];
    if (usable.length !== cited.table.length || patterns.includes(null)) {
      return ['undecidable', 'unusable-entry', []];
    }
    const overlapping = changedPaths.filter(
      citedMatcher(usable, patterns, proseFiles, tracked, planDir, folding),
    );
    return overlapping.length > 0 ? ['overlap', 'cited-path', overlapping] : ['fits', null, []];
  };
  const [verdict, reason, overlappingPaths] = decide();
  return {
    verdict,
    reason,
    changedPathCount: changedPaths.length,
    citedPathCount: citedPaths.length,
    citedPaths: citedPaths.filter(reportablePath).slice(0, MAX_BASE_MOVE_PATHS),
    overlappingPaths: overlappingPaths.filter(reportablePath).slice(0, MAX_BASE_MOVE_PATHS),
  };
}

// Whether a changed path overlaps a citation: tracked table literals through `computeOverlap`,
// table shorthand by suffix, basename or directory infix, table patterns by their matcher, and
// exact files (table literals without a trailing `/` and prose files) by full-path equality; the
// table patterns arrive compiled with the active fold. A literal counts as tracked only when its
// exact spelling is present; any other spelling, such as a differently cased one on a folding
// checkout, is shorthand, which compares folded. A file shorthand also matches as a directory
// shorthand, since an untracked token without a trailing `/` may name a directory.
function citedMatcher(usable, patterns, proseFiles, tracked, planDir, folding) {
  const fold = pathFold(folding);
  const foldedPlanDir = fold(planDir);
  const literals = usable.filter((entry) => entry.kind === 'literal');
  const trackedPaths = literals
    .filter((entry) => tracked.has(entry.path))
    .map((entry) => entry.path);
  const shorthands = literals
    .filter((entry) => !tracked.has(entry.path))
    .map((entry) => ({
      value: fold(entry.path),
      directory: entry.directory,
      bare: !entry.path.includes('/'),
    }));
  const exactFiles = new Set(
    [...literals, ...proseFiles]
      .filter((entry) => !entry.directory)
      .map((entry) => fold(entry.path)),
  );
  const shorthandMatches = (folded) => {
    const basename = path.posix.basename(folded);
    return shorthands.some(
      ({ value, directory, bare }) =>
        folded.startsWith(`${value}/`) ||
        folded.includes(`/${value}/`) ||
        (!directory &&
          (folded === value ||
            folded.endsWith(`/${value}`) ||
            (bare && (basename === value || basename.startsWith(`${value}.`))))),
    );
  };
  return (changedPath) => {
    const folded = fold(changedPath);
    if (planDirectoryMarkdown(folded, foldedPlanDir)) return exactFiles.has(folded);
    return (
      exactFiles.has(folded) ||
      (trackedPaths.length > 0 &&
        computeOverlap(trackedPaths, { paths: [changedPath], gitlinks: [] }, folding).length > 0) ||
      shorthandMatches(folded) ||
      patterns.some((matches) => matches(folded))
    );
  };
}

// ---------------------------------------------------------------------------------------------
// Forge (through the remote tracker, in process)

// The tracker runs its forge CLI calls unbounded by default. Here every call that carries no bound
// of its own gets the run's bound and its own process group, the same as a network Git call; the
// tracker's defaults stay untouched. `observed.timedOut` records whether any call hit the bound.
function boundedTrackerRunner(context, observed) {
  return async (call) => {
    const bounded =
      call?.timeoutMs === undefined
        ? { ...call, timeoutMs: context.timeoutMs, processGroup: true }
        : call;
    const result = await context.runner(bounded);
    if (timedOut(result)) observed.timedOut = true;
    return result;
  };
}

async function tracker(context, operation, input, { apply = false, observed = {} } = {}) {
  return executeTrackerOperation(
    operation,
    { cwd: context.cwd, remote: context.remoteUrl, ...input },
    { apply, runner: boundedTrackerRunner(context, observed) },
  );
}

function trackerFailure(envelope, operation) {
  fail(envelope.error?.code ?? 'COMMAND_FAILED', envelope.error?.message ?? `${operation} failed`, {
    trackerOperation: operation,
    ...(envelope.error?.details ? { trackerDetails: envelope.error.details } : {}),
  });
}

async function requireGithubDraftCapability(context) {
  const resolved = await tracker(context, 'repository-resolve', {});
  // The tracker classifies only github.com by itself; any other host is ambiguous to it. For the
  // GitHub-only unattended path (D3) such a remote is simply not GitHub.
  if (!resolved.ok && resolved.error?.code === 'AMBIGUOUS_HOST') {
    fail('UNSUPPORTED_PROVIDER', 'unattended plan publication supports GitHub only', {
      provider: null,
      host: resolved.error.details?.host ?? null,
    });
  }
  if (!resolved.ok) trackerFailure(resolved, 'repository-resolve');
  if (resolved.provider !== 'github') {
    fail('UNSUPPORTED_PROVIDER', 'unattended plan publication supports GitHub only', {
      provider: resolved.provider,
    });
  }
  const probe = await tracker(context, 'probe', {});
  if (!probe.ok) trackerFailure(probe, 'probe');
  if (probe.data?.capabilities?.pullRequestDraftCreate !== true) {
    fail('UNSUPPORTED_CAPABILITY', 'the forge cannot create a draft pull request', {
      capability: 'pullRequestDraftCreate',
    });
  }
  return resolved.data?.slug ?? null;
}

function pullRequestSummary(item) {
  return { number: item.number, url: item.url };
}

// Every lookup lists without `head` and filters here: only a same-repository pull request on the
// exact head branch and base counts. Others on the same branch name are reported as ignored.
function partitionPullRequests(items, branch, baseBranch) {
  const matches = [];
  const ignored = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (item?.head !== branch) continue;
    if (item.sameRepository === true && item.base === baseBranch) matches.push(item);
    else ignored.push(pullRequestSummary(item));
  }
  return { matches, ignored };
}

async function listPullRequests(context, planPath) {
  const envelope = await tracker(context, 'pr-list', {
    state: 'open',
    ...(planPath === undefined ? {} : { planPath }),
  });
  if (!envelope.ok) trackerFailure(envelope, 'pr-list');
  return envelope.data?.result ?? [];
}

async function requireNoPullRequest(context, branch, baseBranch) {
  const { matches, ignored } = partitionPullRequests(
    await listPullRequests(context),
    branch,
    baseBranch,
  );
  if (matches.length > 0) {
    fail('PR_EXISTS', 'an open pull request already uses the plan branch', {
      pullRequests: matches.map(pullRequestSummary),
    });
  }
  return ignored;
}

// `pr-create` with the draft flag, one lookup after any failure (never a second create), and a
// read-back that must confirm draft, marker, repository and base.
async function openDraftPullRequest(context, request, state) {
  const { planPath, branch, baseBranch, title, body } = request;
  // A create stopped by the bound may still have reached the forge.
  const observed = { timedOut: false };
  const created = await tracker(
    context,
    'pr-create',
    {
      visibility: 'standard',
      payload: { title, body, head: branch, base: baseBranch, draft: true },
    },
    { apply: true, observed },
  );
  let pullRequest;
  if (created.ok) {
    pullRequest = pullRequestSummary(created.data?.result ?? {});
  } else {
    let matches = null;
    try {
      matches = partitionPullRequests(
        await listPullRequests(context, planPath),
        branch,
        baseBranch,
      ).matches;
    } catch {
      matches = null;
    }
    if (matches?.length === 1) {
      pullRequest = pullRequestSummary(matches[0]);
    } else {
      const mayHaveSucceeded =
        created.error?.details?.mutationMayHaveSucceeded === true ||
        observed.timedOut ||
        matches === null;
      const code =
        matches?.length === 0 && !mayHaveSucceeded
          ? (created.error?.code ?? 'PR_UNCONFIRMED')
          : 'PR_UNCONFIRMED';
      fail(code, created.error?.message ?? 'the draft pull request could not be confirmed', {
        ...state,
        state: 'branch-pushed',
        trackerCode: created.error?.code ?? null,
      });
    }
  }
  let confirmed = null;
  try {
    const items = await listPullRequests(context, planPath);
    confirmed = items.find((item) => item?.number === pullRequest.number) ?? null;
  } catch {
    confirmed = null;
  }
  if (
    !confirmed ||
    confirmed.draft !== true ||
    confirmed.sameRepository !== true ||
    confirmed.base !== baseBranch ||
    confirmed.head !== branch ||
    confirmed.planPrMarker !== planPath
  ) {
    fail('DRAFT_UNCONFIRMED', 'the read-back does not confirm the draft plan pull request', {
      ...state,
      state: 'pull-request-opened',
      pullRequest,
    });
  }
  return pullRequest;
}

// ---------------------------------------------------------------------------------------------
// Operations

function scanOperation(input, context) {
  closedSchema('scan', input);
  requireEnum(input.runState, 'runState', RUN_STATES);
  const cwdReal = resolveCwd(input.cwd, context.fs);
  const optional = ['title', 'body', 'commitMessage']
    .filter((field) => input[field] !== undefined)
    .map((field) => ({
      field,
      text: requireText(requireBounded(input[field], field), field, { allowEmpty: true }),
    }));
  const plan = readPlanFile(context.fs, cwdReal, input.planFile);
  const scan = scanEntries([{ field: 'plan', bytes: plan.bytes }, ...optional], input.runState);
  return { planFile: plan.path, runState: input.runState, ...scan };
}

async function branchNameOperation(input, context) {
  closedSchema('branch-name', input);
  const cwdReal = resolveCwd(input.cwd, context.fs);
  const inputIssue = input.issue === undefined ? null : normalizeIssueNumber(input.issue);
  let headerIssue = null;
  if (input.planFile !== undefined) {
    const plan = readPlanFile(context.fs, cwdReal, input.planFile);
    headerIssue = parseIssueHeader(decodePlanBytes(plan.bytes));
  }
  const issue = agreeingIssue(inputIssue, headerIssue);
  const branch = planBranchName({ branchPrefix: input.branchPrefix, issue });
  const git = createGit({ ...context, cwd: cwdReal });
  const checked = await git.run(['check-ref-format', '--branch', branch]);
  if (checked?.status !== 0 || String(checked.stdout).trim() !== branch) {
    fail('BRANCH_INVALID', 'the plan branch name is not a valid branch name', { branch });
  }
  return { branch, issue };
}

async function assertChangesetOperation(input, context) {
  closedSchema('assert-changeset', input);
  const remote = requireRemoteName(input.remote);
  const baseBranch = requireRefPath(input.baseBranch, 'baseBranch');
  const head = requireOid(input.head, 'head');
  const planDir = requireRelativePath(input.planDir, 'planDir');
  const issue = normalizeIssueNumber(input.issue);
  const cwdReal = resolveCwd(input.cwd, context.fs);
  const git = createGit({ ...context, cwd: cwdReal });
  await verifyRepositoryRoot(git, cwdReal, context.fs);
  const base = await resolveBase(git, remote, baseBranch);
  const result = requireAcceptedChangeset(
    await changesetViolations(git, { head, base, planDir, issue }),
  );
  return {
    accepted: true,
    head: result.headOid,
    mergeBase: result.mergeBase,
    planFile: result.planFile,
    blobOid: result.blobOid,
  };
}

// The schema and enum checks both mutating operations share before any Git or forge access. The
// forge text is derived from the plan bytes later and checked before the base fetch (`publish`)
// or before any pull-request call (`complete-branch`).
function mutatingInput(operation, input) {
  closedSchema(operation, input);
  unattendedRules(input);
  expectedOids(input);
  return {
    issue: normalizeIssueNumber(input.issue),
    planDir: requireRelativePath(input.planDir, 'planDir'),
    remote: requireRemoteName(input.remote),
    baseBranch: requireRefPath(input.baseBranch, 'baseBranch'),
    languageGit: requireEnum(input.languageGit, 'languageGit', LANGUAGES),
    languageForge: requireEnum(input.languageForge, 'languageForge', LANGUAGES),
  };
}

// The body prose before the tail is appended: no closing keyword, no marker of its own.
function requireBodyProse(prose) {
  requireText(requireBounded(prose, 'body'), 'body');
  refuseClosingKeyword(prose, 'body');
  // Equivalent to the shipped parser not answering `absent`, without its quadratic line trim.
  if (prose.includes(PLAN_PR_MARKER_OPENER)) {
    fail('MARKER_INVALID', 'body already carries a plan marker', { reason: 'caller-marker' });
  }
  return prose;
}

async function prepareRemote(context, git, remote) {
  const url = await remoteUrl(git, remote);
  const forge = { ...context, remoteUrl: url };
  const repository = await requireGithubDraftCapability(forge);
  return { forge, repository };
}

// A hook, local or on the server, may echo the helper-derived commit message, and the helper
// returns none of that text: a refusal reports the hook's stderr only as its length and digest,
// plus the spawn error code when there is one.
function hookStderr(result) {
  const code = result?.error?.code;
  return {
    stderr: textDigest(String(result?.stderr ?? '')),
    ...(typeof code === 'string' ? { errorCode: diagnosticText(code) } : {}),
  };
}

function messageForCommit(message) {
  return message.endsWith('\n') ? message : `${message}\n`;
}

async function runCommitMsgHook(git, message, context) {
  const directory = context.fs.mkdtempSync(path.join(os.tmpdir(), 'plan-publication-msg-'));
  try {
    const file = path.join(directory, 'COMMIT_EDITMSG');
    context.fs.writeFileSync(file, messageForCommit(message));
    const result = await git.run(['hook', 'run', '--ignore-missing', 'commit-msg', '--', file], {
      timeoutMs: context.timeoutMs,
    });
    if (timedOut(result) || result?.error || result?.status !== 0) {
      fail('COMMIT_MSG_HOOK_REJECTED', 'the commit-msg hook refused the message', {
        reason: timedOut(result) ? 'timeout' : 'rejected',
        ...hookStderr(result),
      });
    }
    return decodePlanBytes(readHookMessage(context.fs, file), 'commitMessage');
  } finally {
    context.fs.rmSync(directory, { recursive: true, force: true });
  }
}

function hookMessageTooLarge() {
  fail(
    'INPUT_TOO_LARGE',
    `the commit-msg hook left a message over ${MAX_COMMIT_MESSAGE_BYTES} bytes`,
    {
      field: 'commitMessage',
      limit: MAX_COMMIT_MESSAGE_BYTES,
      unit: 'bytes',
    },
  );
}

// The message file the hook may have rewritten is judged like a plan file: opened without following
// a symlink, a regular file only, its size taken from fstat before a byte is read, and the read
// itself bounded, so a hook can neither make the run read an unbounded file nor a device.
function readHookMessage(fs, file) {
  const flags = nodeFs.constants.O_RDONLY | (nodeFs.constants.O_NOFOLLOW ?? 0);
  let descriptor;
  try {
    descriptor = fs.openSync(file, flags);
  } catch (error) {
    fsFailure(error, 'commitMessage');
  }
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile()) {
      fail('UNSAFE_PATH', 'the commit-msg hook left no regular message file', {
        field: 'commitMessage',
        reason: 'not-file',
      });
    }
    if (opened.size > MAX_COMMIT_MESSAGE_BYTES) hookMessageTooLarge();
    return readBounded(fs, descriptor, MAX_COMMIT_MESSAGE_BYTES, hookMessageTooLarge);
  } finally {
    fs.closeSync(descriptor);
  }
}

// The plan blob and one commit on `parent`, built in a temporary index. The user's index, working
// tree and checked-out branch stay untouched.
async function buildCommit(git, { parent, planPath, blobOid, message }, context) {
  const directory = context.fs.mkdtempSync(path.join(os.tmpdir(), 'plan-publication-index-'));
  try {
    const env = { GIT_INDEX_FILE: path.join(directory, 'index') };
    await git.checked(['read-tree', parent], { env });
    await git.checked(['update-index', '--add', '--cacheinfo', `100644,${blobOid},${planPath}`], {
      env,
    });
    const tree = await git.text(['write-tree'], { env });
    return await git.text(['-c', 'user.useConfigOnly=true', 'commit-tree', tree, '-p', parent], {
      stdin: messageForCommit(message),
    });
  } finally {
    context.fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function pushBranch(git, { remote, branch, commitOid }, network, state) {
  const result = await git.run(
    ['push', '--quiet', '--no-follow-tags', remote, `${commitOid}:refs/heads/${branch}`],
    network,
  );
  if (timedOut(result)) {
    let remoteOid;
    try {
      remoteOid = await remoteBranchOid(git, remote, branch, network);
    } catch {
      fail('REMOTE_UNREACHABLE', 'the push timed out and the remote could not be read', {
        ...state,
        state: 'unknown',
      });
    }
    if (remoteOid === commitOid) {
      fail('PUSH_UNCONFIRMED', 'the push timed out, but the remote branch carries the commit', {
        ...state,
        state: 'branch-pushed',
      });
    }
    if (remoteOid !== null) {
      fail('LOCK_LOST', 'another publisher holds the plan branch', {
        ...state,
        state: 'unknown',
        remoteOid,
      });
    }
    fail('REMOTE_UNREACHABLE', 'the push timed out and did not reach the remote', {
      ...state,
      state: 'nothing-pushed',
    });
  }
  if (result?.error || result?.status !== 0) {
    fail('PUSH_REJECTED', 'the remote refused the push', {
      ...state,
      ...hookStderr(result),
    });
  }
}

// `allowNewerBase`: the assessed re-publish binds to `expectedBaseOid` behind a newer fetched tip.
// It requires the assessed base to be an ancestor of the tip and runs only the stopping subset on
// the further range (the plan path tracked on the tip, a same-issue or invalid-identity plan file);
// it computes no fit verdict. Returns `{fromBaseOid, toBaseOid, commitCount}`.
async function requireFurtherBaseMove(
  git,
  context,
  { expectedBaseOid, tipOid, issue, planDir, planPath },
) {
  const stop = (reason) =>
    fail('BASE_CHANGED', 'base changed since authorization', {
      expectedOid: expectedBaseOid,
      actualOid: tipOid,
      reason,
    });
  // A spawn error or timeout is a failed command; only a numeric non-zero exit means a missing object.
  const presence = await git.run(['cat-file', '-e', `${expectedBaseOid}^{commit}`]);
  if (presence?.error || typeof presence?.status !== 'number') {
    fail('COMMAND_FAILED', 'git cat-file failed', {
      command: 'git cat-file',
      status: presence?.status ?? null,
      stderr: diagnosticText(presence?.stderr ?? presence?.error?.code ?? ''),
    });
  }
  if (presence.status !== 0) stop('not-ancestor');
  const ancestry = await git.run(['merge-base', '--is-ancestor', expectedBaseOid, tipOid]);
  if (ancestry?.error || ![0, 1].includes(ancestry?.status)) {
    fail('COMMAND_FAILED', 'git merge-base failed', {
      command: 'git merge-base',
      status: ancestry?.status ?? null,
      stderr: diagnosticText(ancestry?.stderr ?? ancestry?.error?.code ?? ''),
    });
  }
  if (ancestry.status !== 0) stop('not-ancestor');
  if ((await git.run(['cat-file', '-e', `${tipOid}:${planPath}`]))?.status === 0) {
    fail('CHANGESET_INVALID', 'the newer base already tracks the plan path', {
      violations: [{ violation: 'modification', path: planPath }],
    });
  }
  const changes = parseRawDiff(
    (
      await git.checked([
        'diff-tree',
        '-r',
        '-z',
        '--no-renames',
        '--no-commit-id',
        '--ignore-submodules=none',
        '--raw',
        expectedBaseOid,
        tipOid,
      ])
    ).stdout,
  );
  const folding = await foldingFlags(context.cwd, context.runner);
  const identities = (
    await rangePlanFiles(git, changes, { issue, planDir, planPath, folding })
  ).map((file) => file.identity);
  if (identities.includes('invalid')) stop('plan-identity');
  if (identities.includes('same-issue')) stop('same-issue-plan');
  const commitCount = Number(
    await git.text(['rev-list', '--count', `${expectedBaseOid}..${tipOid}`]),
  );
  return { fromBaseOid: expectedBaseOid, toBaseOid: tipOid, commitCount };
}

async function publishOperation(input, context) {
  const base = mutatingInput('publish', input);
  const baseMove =
    input.baseMove === undefined ? null : requireBaseMove(input.baseMove, input.expectedBaseOid);
  if (input.allowNewerBase !== undefined && typeof input.allowNewerBase !== 'boolean') {
    fail('INVALID_INPUT', 'allowNewerBase must be a boolean', { field: 'allowNewerBase' });
  }
  const allowNewerBase = input.allowNewerBase === true;
  if (allowNewerBase && input.expectedBaseOid === undefined) {
    fail('INVALID_INPUT', 'allowNewerBase needs expectedBaseOid', { field: 'allowNewerBase' });
  }
  const cwdReal = resolveCwd(input.cwd, context.fs);
  const planPath = requirePlanFilePath(input.planFile);
  // A plan path the marker grammar refuses is refused before any Git call.
  requireMarkerRoundTrip(bodyTail(planPath, base.issue), planPath);
  const branch = planBranchName({ branchPrefix: input.branchPrefix, issue: base.issue });

  const git = createGit({ ...context, cwd: cwdReal });
  await verifyRepositoryRoot(git, cwdReal, context.fs);
  const { forge, repository } = await prepareRemote({ ...context, cwd: cwdReal }, git, base.remote);

  const gitVersion = await requireGitVersion(git);
  await requireIdentity(git);
  const network = await networkOptions(git, context);
  const plan = readPlanFile(context.fs, cwdReal, planPath, base.planDir);
  const planText = decodePlanBytes(plan.bytes);
  agreeingIssue(base.issue, parseIssueHeader(planText));
  const nameProblem = planNameViolation(path.posix.basename(planPath), base.issue);
  if (nameProblem) {
    fail('CHANGESET_INVALID', 'the plan file name does not match the issue', {
      violations: [{ violation: nameProblem, path: planPath }],
    });
  }
  const derived = derivedForgeText(planText, planPath, base);
  // A flag joins the derived prose before the body checks, so it passes them like any prose; a
  // refusal it causes names the flag as its source.
  const composeBody = (furtherBaseMove) => {
    const flag = baseMove
      ? buildBaseMoveFlag(baseMove, furtherBaseMove)
      : furtherBaseMove && buildFurtherBaseMoveFlag(furtherBaseMove);
    if (!flag) return buildPullRequestBody(derived.prose, planPath, base.issue);
    return withSource('base-move-flag', () =>
      buildPullRequestBody(`${derived.prose}\n\n${flag}`, planPath, base.issue),
    );
  };
  let body = composeBody(null);
  const tipOid = await fetchBase(git, base.remote, base.baseBranch, network);
  // `baseOid` is the plan commit's parent: the fetched tip, or the assessed base behind it.
  let baseOid = tipOid;
  let furtherBaseMove = null;
  if (allowNewerBase && tipOid !== input.expectedBaseOid) {
    furtherBaseMove = await requireFurtherBaseMove(
      git,
      { ...context, cwd: cwdReal },
      {
        expectedBaseOid: input.expectedBaseOid,
        tipOid,
        issue: base.issue,
        planDir: base.planDir,
        planPath,
      },
    );
    baseOid = input.expectedBaseOid;
    body = composeBody(furtherBaseMove);
  } else {
    requireExpectedOid(input.expectedBaseOid, tipOid, 'BASE_CHANGED', 'base');
  }
  const tracked = await git.run(['cat-file', '-e', `${baseOid}:${planPath}`]);
  if (tracked?.status === 0) {
    fail('CHANGESET_INVALID', 'the base already tracks the plan path', {
      violations: [{ violation: 'modification', path: planPath }],
    });
  }
  // Only a publish with `allowNewerBase` reports the field, so one without it stays unchanged.
  const further = allowNewerBase ? { furtherBaseMove } : {};

  const scan = scanEntries(
    [
      { field: 'plan', text: planText },
      { field: 'title', text: derived.title },
      { field: 'body', text: body },
      { field: 'commitMessage', text: derived.commitMessage },
    ],
    'unattended',
  );
  // The derived prose already passed this scan, so a body finding here comes from the flag.
  const flagged = baseMove !== null || furtherBaseMove !== null;
  const bodyBlocked = scan.blocking.some((id) => id.split(':')[1] === 'body');
  if (flagged && bodyBlocked) {
    withSource('base-move-flag', () => requireUnblocked(scan, 'pre-publication'));
  }
  requireUnblocked(scan, 'pre-publication');

  const existingOid = await remoteBranchOid(git, base.remote, branch, network);
  if (existingOid !== null) {
    fail('BRANCH_EXISTS', 'the plan branch already exists on the remote', {
      branch,
      remoteOid: existingOid,
    });
  }
  const ignoredPullRequests = await requireNoPullRequest(forge, branch, base.baseBranch);

  if (context.apply !== true) {
    const blobId = await git.text(['hash-object', '--no-filters', '--stdin'], {
      stdin: plan.bytes,
    });
    requireExpectedOid(input.expectedBlobOid, blobId, 'BLOB_CHANGED', 'plan blob');
    return {
      state: 'dry-run',
      repository,
      branch,
      baseBranch: base.baseBranch,
      baseOid,
      planFile: planPath,
      blobId,
      title: textDigest(derived.title),
      body: textDigest(body),
      findings: scan.findings,
      ignoredPullRequests,
      ...further,
      gitVersion,
      plannedCommands: [
        ['git', 'hash-object', '-w', '--no-filters', '--stdin'],
        ['git', 'hook', 'run', '--ignore-missing', 'commit-msg', '--', '<message-file>'],
        ['git', 'commit-tree', '<tree>', '-p', baseOid],
        [
          'git',
          'push',
          '--quiet',
          '--no-follow-tags',
          base.remote,
          `<commit>:refs/heads/${branch}`,
        ],
        ['git', 'ls-remote', '--exit-code', base.remote, `refs/heads/${branch}`],
        ['remote-tracker', 'pr-create', `draft=true base=${base.baseBranch} head=${branch}`],
      ],
    };
  }

  const blobOid = await git.text(['hash-object', '-w', '--no-filters', '--stdin'], {
    stdin: plan.bytes,
  });
  const blobBytes = await readBlob(git, blobOid);
  if (!blobBytes.equals(plan.bytes)) {
    fail('INVALID_CONTENT', 'the written blob differs from the plan file', { reason: 'blob' });
  }
  requireUnblocked(scanEntries([{ field: 'plan', bytes: blobBytes }], 'unattended'), 'blob');

  const finalMessage = await runCommitMsgHook(git, derived.commitMessage, context);
  validateCommitMessage(finalMessage);
  requireUnblocked(
    scanEntries([{ field: 'commitMessage', text: finalMessage }], 'unattended'),
    'commit-msg',
  );

  const commitOid = await buildCommit(
    git,
    { parent: baseOid, planPath, blobOid, message: finalMessage },
    context,
  );
  const changeset = requireAcceptedChangeset(
    await changesetViolations(git, {
      head: commitOid,
      base: baseOid,
      planDir: base.planDir,
      issue: base.issue,
    }),
  );
  if (changeset.planFile !== planPath) {
    fail('CHANGESET_INVALID', 'the commit does not add the plan file', {
      violations: [{ violation: 'name-mismatch', path: changeset.planFile }],
    });
  }

  // The hook and commit construction have finished. Bind the body to the blob actually named
  // by the publication commit, not merely the earlier pathname read or hash-object response.
  requireExpectedOid(input.expectedBlobOid, changeset.blobOid, 'BLOB_CHANGED', 'plan blob');
  const committedBytes = await readBlob(git, changeset.blobOid);
  if (changeset.blobOid !== blobOid || !committedBytes.equals(plan.bytes)) {
    fail('INVALID_CONTENT', 'the committed blob differs from the verified plan', {
      reason: 'blob',
    });
  }
  requireUnblocked(
    scanEntries([{ field: 'plan', bytes: committedBytes }], 'unattended'),
    'commit-blob',
  );

  const state = { branch, baseOid, commitOid };
  await pushBranch(git, { remote: base.remote, branch, commitOid }, network, state);
  // The push succeeded, so from here on every failure carries the run state.
  await requireLockHeld(git, { remote: base.remote, branch, commitOid }, network, state);
  const pullRequest = await openDraftPullRequest(
    forge,
    { planPath, branch, baseBranch: base.baseBranch, title: derived.title, body },
    state,
  );
  return {
    state: 'pull-request-opened',
    repository,
    branch,
    baseBranch: base.baseBranch,
    baseOid,
    commitOid,
    blobOid,
    planFile: planPath,
    pullRequest,
    ignoredPullRequests,
    ...further,
  };
}

function commitMessageOf(raw) {
  const separator = raw.indexOf('\n\n');
  return separator === -1 ? '' : raw.slice(separator + 2);
}

function requirePlanBranch(input, issue) {
  const parsed = parsePlanBranch(input.branch);
  if (!parsed || parsed.branchPrefix !== input.branchPrefix) {
    fail('BRANCH_INVALID', 'branch is not the plan branch of branchPrefix', { field: 'branch' });
  }
  if (parsed.issue !== issue) {
    fail('ISSUE_MISMATCH', 'the branch issue differs from the input issue', {
      issue,
      branch: parsed.issue,
    });
  }
}

// Shared recovery inspection never checks out a branch or writes a local plan copy. Both callers
// scan the same fetched commit and plan bytes before any pull-request operation.
async function inspectBranchContents(input, base, branch, git, network, stage = 'complete-branch') {
  const baseOid = await fetchBase(git, base.remote, base.baseBranch, network);
  requireExpectedOid(input.expectedBaseOid, baseOid, 'BASE_CHANGED', 'base');

  const tipOid = await remoteBranchOid(git, base.remote, branch, network);
  if (tipOid === null)
    fail('BRANCH_MISSING', 'the plan branch does not exist on the remote', { branch });
  requireExpectedOid(input.expectedTipOid, tipOid, 'TIP_CHANGED', 'branch tip');
  const fetched = await git.run(
    ['fetch', ...FETCH_FLAGS, '--refmap=', base.remote, `refs/heads/${branch}`],
    network,
  );
  if (timedOut(fetched) || fetched?.error || fetched?.status !== 0) {
    fail('REMOTE_UNREACHABLE', 'fetching the plan branch failed', {
      reason: timedOut(fetched) ? 'timeout' : 'failed',
      stderr: diagnosticText(fetched?.stderr ?? ''),
    });
  }
  if (input.expectedTipOid !== undefined) {
    // A branch may move during fetch even when its previous commit was already present locally.
    // Reconfirm the remote, then inspect only the exact commit authorized by the earlier metadata.
    const fetchedTip = await remoteBranchOid(git, base.remote, branch, network);
    requireExpectedOid(input.expectedTipOid, fetchedTip, 'TIP_CHANGED', 'branch tip');
  }
  // `FETCH_HEAD` is shared by every fetch in the repository, so it is never read: the commit the
  // lock query named must now exist locally, and everything below works on that OID.
  const present = await git.run(['cat-file', '-e', `${tipOid}^{commit}`]);
  if (present?.status !== 0) {
    fail('LOCK_LOST', 'the plan branch moved while it was being read', {
      branch,
      remoteOid: tipOid,
    });
  }

  const changeset = requireAcceptedChangeset(
    await changesetViolations(git, {
      head: tipOid,
      base: baseOid,
      planDir: base.planDir,
      issue: base.issue,
    }),
  );
  const planPath = changeset.planFile;
  const blobBytes = await readBlob(git, changeset.blobOid);
  const commitSize = Number(await git.text(['cat-file', '-s', tipOid]));
  if (
    !Number.isSafeInteger(commitSize) ||
    commitSize > MAX_COMMIT_MESSAGE_BYTES + MAX_COMMIT_HEADER_BYTES
  ) {
    fail('INPUT_TOO_LARGE', 'the branch commit is too large to be scanned', {
      field: 'commitMessage',
      limit: MAX_COMMIT_MESSAGE_BYTES,
      unit: 'bytes',
    });
  }
  const rawCommit = decodePlanBytes(
    (await git.checked(['cat-file', 'commit', tipOid], { stdoutBuffer: true })).stdout,
    'commitMessage',
  );
  const commitMessage = requireBounded(commitMessageOf(rawCommit), 'commitMessage');
  refuseClosingKeyword(commitMessage, 'commitMessage');
  const scan = scanEntries(
    [
      { field: 'plan', bytes: blobBytes },
      { field: 'commitMessage', text: commitMessage },
    ],
    'unattended',
  );
  requireUnblocked(scan, stage);
  return { baseOid, tipOid, changeset, planPath, blobBytes, commitMessage };
}

async function inspectBranchOperation(input, context) {
  closedSchema('inspect-branch', input);
  unattendedRules(input);
  expectedOids(input);
  const base = {
    issue: normalizeIssueNumber(input.issue),
    planDir: requireRelativePath(input.planDir, 'planDir'),
    remote: requireRemoteName(input.remote),
    baseBranch: requireRefPath(input.baseBranch, 'baseBranch'),
  };
  requirePlanBranch(input, base.issue);
  const cwdReal = resolveCwd(input.cwd, context.fs);
  const git = createGit({ ...context, cwd: cwdReal });
  await verifyRepositoryRoot(git, cwdReal, context.fs);
  await requireGitVersion(git);
  // Validate the remote just as completion does; inspection needs no forge capability or identity.
  await remoteUrl(git, base.remote);
  const network = await networkOptions(git, context);
  const inspected = await inspectBranchContents(
    input,
    base,
    input.branch,
    git,
    network,
    'inspect-branch',
  );
  let metadata;
  try {
    metadata = publicationMetadataFromText(decodePlanBytes(inspected.blobBytes));
  } catch (error) {
    if (!(error instanceof PlanLintError)) throw error;
    fail(error.code, error.message, { field: 'plan' });
  }
  return {
    baseOid: inspected.baseOid,
    branchTip: inspected.tipOid,
    planFile: inspected.planPath,
    blobOid: inspected.changeset.blobOid,
    ...metadata,
  };
}

// The table literals present, as a blob or a tree, in the tree of `oid`: one batch read.
async function presentPaths(git, oid, paths) {
  if (paths.length === 0) return new Set();
  const result = await git.checked(['cat-file', '--batch-check=%(objecttype)'], {
    stdin: `${paths.map((entry) => `${oid}:${entry}`).join('\n')}\n`,
  });
  const types = String(result.stdout).split('\n');
  return new Set(paths.filter((_, index) => ['blob', 'tree'].includes(types[index])));
}

// The identity of every regular Markdown file the range adds or modifies directly under the plan
// directory or its archive; a deletion is no duplicate, and a move is a deletion plus an addition.
async function rangePlanFiles(git, changes, { issue, planDir, planPath, folding }) {
  const fold = pathFold(folding);
  const files = [];
  for (const change of changes) {
    if (change.status.startsWith('D') || !planDirectoryMarkdown(fold(change.path), fold(planDir))) {
      continue;
    }
    if (!['100644', '100755'].includes(change.newMode)) continue;
    const size = Number(await git.text(['cat-file', '-s', change.newOid]));
    const identity =
      Number.isSafeInteger(size) && size <= MAX_PLAN_BYTES
        ? planFileIdentity(await readBlob(git, change.newOid), change.path, {
            issue,
            planPath,
            folding,
          })
        : 'invalid';
    files.push({ path: change.path, identity });
  }
  return files;
}

async function foldingFlags(cwd, runner) {
  try {
    return await pathFoldingConfig(cwd, runner);
  } catch (error) {
    fail('COMMAND_FAILED', 'git config failed', {
      command: 'git config',
      stderr: diagnosticText(error?.message ?? ''),
    });
  }
}

// Read-only apart from the base fetch's remote-tracking ref update, which `publish` performs too:
// no branch, commit, push or forge object. The plan bytes must still hash to `expectedBlobOid`, and
// the cited tokens come from exactly those bytes.
async function assessBaseMoveOperation(input, context) {
  closedSchema('assess-base-move', input);
  const issue = normalizeIssueNumber(input.issue);
  const planDir = requireRelativePath(input.planDir, 'planDir');
  const planPath = requirePlanFilePath(input.planFile);
  const remote = requireRemoteName(input.remote);
  const baseBranch = requireRefPath(input.baseBranch, 'baseBranch');
  const fromBaseOid = requireOid(input.fromBaseOid, 'fromBaseOid');
  const expectedBlobOid = requireOid(input.expectedBlobOid, 'expectedBlobOid');
  const cwdReal = resolveCwd(input.cwd, context.fs);

  const git = createGit({ ...context, cwd: cwdReal });
  await verifyRepositoryRoot(git, cwdReal, context.fs);
  await requireGitVersion(git);
  await remoteUrl(git, remote);
  const network = await networkOptions(git, context);
  const plan = readPlanFile(context.fs, cwdReal, planPath, planDir);
  const planText = decodePlanBytes(plan.bytes);
  agreeingIssue(issue, parseIssueHeader(planText));
  const blobOid = await git.text(['hash-object', '--no-filters', '--stdin'], {
    stdin: plan.bytes,
  });
  requireExpectedOid(expectedBlobOid, blobOid, 'BLOB_CHANGED', 'plan blob');
  const folding = await foldingFlags(cwdReal, context.runner);

  const toBaseOid = await fetchBase(git, remote, baseBranch, network);
  const fromPresent = (await git.run(['cat-file', '-e', `${fromBaseOid}^{commit}`]))?.status === 0;
  let ancestor = false;
  let commitCount = 0;
  let changes = [];
  if (fromPresent) {
    const ancestry = await git.run(['merge-base', '--is-ancestor', fromBaseOid, toBaseOid]);
    if (ancestry?.error || ![0, 1].includes(ancestry?.status)) {
      fail('COMMAND_FAILED', 'git merge-base failed', {
        command: 'git merge-base',
        status: ancestry?.status ?? null,
        stderr: diagnosticText(ancestry?.stderr ?? ancestry?.error?.code ?? ''),
      });
    }
    ancestor = ancestry.status === 0;
    commitCount = Number(await git.text(['rev-list', '--count', `${fromBaseOid}..${toBaseOid}`]));
    changes = parseRawDiff(
      (
        await git.checked([
          'diff-tree',
          '-r',
          '-z',
          '--no-renames',
          '--no-commit-id',
          '--ignore-submodules=none',
          '--raw',
          fromBaseOid,
          toBaseOid,
        ])
      ).stdout,
    );
  }

  const cited = extractCitedTokens(planText, { planPath, folding });
  const literals = cited.table
    .filter((entry) => entry.kind === 'literal')
    .map((entry) => entry.path);
  const tracked = new Set([
    ...(fromPresent ? await presentPaths(git, fromBaseOid, literals) : []),
    ...(await presentPaths(git, toBaseOid, literals)),
  ]);
  const planFiles = await rangePlanFiles(git, changes, { issue, planDir, planPath, folding });
  const assessed = assessBaseMove({
    ancestor,
    changes,
    cited,
    tracked,
    planFiles,
    planDir,
    folding,
  });
  return {
    state: 'assessed',
    fromBaseOid,
    toBaseOid,
    verdict: assessed.verdict,
    reason: assessed.reason,
    republish: baseMoveRepublishes(assessed.reason),
    commitCount,
    changedPathCount: assessed.changedPathCount,
    citedPathCount: assessed.citedPathCount,
    citedPaths: assessed.citedPaths,
    overlappingPaths: assessed.overlappingPaths,
  };
}

async function completeBranchOperation(input, context) {
  const base = mutatingInput('complete-branch', input);
  requirePlanBranch(input, base.issue);
  const branch = input.branch;
  const cwdReal = resolveCwd(input.cwd, context.fs);

  const git = createGit({ ...context, cwd: cwdReal });
  await verifyRepositoryRoot(git, cwdReal, context.fs);
  const { forge, repository } = await prepareRemote({ ...context, cwd: cwdReal }, git, base.remote);
  const gitVersion = await requireGitVersion(git);
  const network = await networkOptions(git, context);
  const { baseOid, tipOid, changeset, planPath, blobBytes, commitMessage } =
    await inspectBranchContents(input, base, branch, git, network);
  // The branch keeps its own commit subject; only the pull request carries the derived text.
  const derived = derivedForgeText(decodePlanBytes(blobBytes), planPath, base);
  const body = buildPullRequestBody(derived.prose, planPath, base.issue);
  const scan = scanEntries(
    [
      { field: 'plan', bytes: blobBytes },
      { field: 'title', text: derived.title },
      { field: 'body', text: body },
      { field: 'commitMessage', text: commitMessage },
    ],
    'unattended',
  );
  requireUnblocked(scan, 'complete-branch');
  const ignoredPullRequests = await requireNoPullRequest(forge, branch, base.baseBranch);

  const state = { branch, baseOid, commitOid: tipOid, mergeBase: changeset.mergeBase };
  if (context.apply !== true) {
    return {
      state: 'dry-run',
      repository,
      ...state,
      baseBranch: base.baseBranch,
      planFile: planPath,
      blobOid: changeset.blobOid,
      title: textDigest(derived.title),
      body: textDigest(body),
      findings: scan.findings,
      ignoredPullRequests,
      gitVersion,
      plannedCommands: [
        ['git', 'ls-remote', '--exit-code', base.remote, `refs/heads/${branch}`],
        ['remote-tracker', 'pr-create', `draft=true base=${base.baseBranch} head=${branch}`],
      ],
    };
  }
  await requireLockHeld(git, { remote: base.remote, branch, commitOid: tipOid }, network, state);
  const pullRequest = await openDraftPullRequest(
    forge,
    { planPath, branch, baseBranch: base.baseBranch, title: derived.title, body },
    state,
  );
  return {
    state: 'pull-request-opened',
    repository,
    ...state,
    baseBranch: base.baseBranch,
    planFile: planPath,
    blobOid: changeset.blobOid,
    pullRequest,
    ignoredPullRequests,
  };
}

const HANDLERS = Object.freeze({
  scan: scanOperation,
  'branch-name': branchNameOperation,
  'assert-changeset': assertChangesetOperation,
  publish: publishOperation,
  'complete-branch': completeBranchOperation,
  'inspect-branch': inspectBranchOperation,
  'assess-base-move': assessBaseMoveOperation,
});

// ---------------------------------------------------------------------------------------------
// Envelope

// `options`: `apply` (mutating operations stay a dry run without it), `runner` (the injected
// process runner), and the core-only test options `timeoutMs` (network and hook bound, default
// `UPSTREAM_FETCH_TIMEOUT_MS`), `environment` and `fs`.
export async function executeOperation(operation, input = {}, options = {}) {
  const dryRun = MUTATING_OPERATIONS.has(operation) && options.apply !== true;
  try {
    if (!PLAN_PUBLICATION_OPERATIONS.includes(operation)) {
      fail('INVALID_INPUT', `unknown operation: ${operation}`);
    }
    const context = {
      apply: options.apply === true,
      runner:
        options.runner ??
        (async () => fail('INVALID_INPUT', 'this operation requires an injected process runner')),
      timeoutMs: options.timeoutMs ?? UPSTREAM_FETCH_TIMEOUT_MS,
      environment: options.environment ?? process.env,
      fs: options.fs ?? nodeFs,
    };
    const data = await HANDLERS[operation](input, context);
    return { ok: true, operation, dryRun, data };
  } catch (error) {
    return errorEnvelope(operation, error, dryRun);
  }
}

export function errorEnvelope(operation, error, dryRun = false) {
  const normalized =
    error instanceof PlanPublicationError
      ? error
      : new PlanPublicationError(
          'INTERNAL',
          diagnosticText(error?.message ?? 'unexpected plan-publication failure'),
        );
  return {
    ok: false,
    operation: PLAN_PUBLICATION_OPERATIONS.includes(operation) ? operation : null,
    dryRun,
    error: { code: normalized.code, message: normalized.message, details: normalized.details },
  };
}

export function exitCodeFor(envelope) {
  if (envelope.ok) return 0;
  return EXIT_CODES[envelope.error.code] ?? 1;
}
