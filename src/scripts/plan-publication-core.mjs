// Deterministic plan publication: the core behind `plan-publication.mjs`.
//
// Six operations, each with a closed input schema and one JSON envelope:
// - `scan` (read-only, no network): the one content scan of a plan file and the texts published
//   with it. Interactive publication (`shared/plan-publication.md`) and the unattended path share
//   it, so both apply one class table.
// - `branch-name` (read-only): the plan branch `<branchPrefix>/plan/issue-<N>`.
// - `assert-changeset` (read-only): a commit adds exactly one plan file and nothing else.
// - `inspect-branch` (read-only): bounded recovery metadata from a verified plan branch.
// - `publish` and `complete-branch` (mutations, dry run unless `apply`): an unattended pass commits
//   the plan with plumbing in a temporary index, pushes it without force so the remote branch is
//   the lock, and opens a draft pull request carrying the shipped plan marker and `Refs #<N>`.
//
// Model judgment stays outside: callers pass the plan file, the title, body and commit message,
// and the run state. This module spawns nothing itself; every process goes through the injected
// runner, which only a CLI entry creates (`process-runner.mjs`).
//
// `cwd` rule: `scan` and `branch-name` accept any existing directory as `cwd` and need no
// repository, deliberately — `scan` judges files only (the distribution smoke runs it outside a
// repository), and `branch-name` only asks `git check-ref-format`. The other four operations
// require `cwd` to be the repository root.
//
// Every caller-supplied text is size-bounded before any scan (`INPUT_TOO_LARGE`; the plan file
// keeps its `INVALID_CONTENT`/`oversized` refusal), so no scan pattern ever sees unbounded input.

import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  executeOperation as executeTrackerOperation,
  inspectPlanPrMarker,
} from './remote-tracker-core.mjs';
import { assertPublishable } from './remote-tracker-shared-core.mjs';
import { publicationMetadataFromText, PlanLintError } from './plan-lint-core.mjs';
import {
  SENSITIVE_CHILD_ASSIGNMENT,
  isLegitimateCredentialProse,
} from './remote-tracker-decomposition-core.mjs';
import {
  UPSTREAM_FETCH_TIMEOUT_MS,
  diagnosticText,
  nonInteractiveFetchEnv,
} from './delivery-selection-core.mjs';

export const PLAN_PUBLICATION_OPERATIONS = Object.freeze([
  'scan',
  'branch-name',
  'assert-changeset',
  'publish',
  'complete-branch',
  'inspect-branch',
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
// GitHub's pull-request body limit. It bounds the caller's prose and, separately, the final body
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
      'title',
      'body',
      'commitMessage',
    ],
    optional: ['expectedBaseOid', 'expectedBlobOid'],
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
      'title',
      'body',
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

// In-process ref-name rule for a branch prefix or a branch name: no empty segment (so no leading,
// trailing or doubled `/`), no segment starting or ending with `.`, no `..`, no `.lock` segment
// suffix, no `@{`, and no control, space or `~^:?*[\` character. `git check-ref-format` stays the
// authority; this rule only keeps an unsafe name from reaching any command.
const REF_FORBIDDEN = /[\u0000- \u007f~^:?*[\\]/;

function refPathProblem(value) {
  if (typeof value !== 'string' || value === '') return 'empty';
  if (REF_FORBIDDEN.test(value) || value.includes('..') || value.includes('@{') || value === '@') {
    return 'forbidden-character';
  }
  for (const segment of value.split('/')) {
    if (segment === '') return 'empty-segment';
    if (segment.startsWith('.') || segment.endsWith('.')) return 'dot-segment';
    if (segment.endsWith('.lock')) return 'lock-suffix';
  }
  return null;
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

const ISSUE_HEADER = /^\*\*Issue:\*\*/;
const ISSUE_HEADER_EXACT = /^\*\*Issue:\*\* #([1-9]\d*)[ \t]*$/;

// The `**Issue:** #<N>` line of the plan's header block (the lines before the first `##` heading),
// or null when there is none. A malformed or repeated header line is refused, never guessed.
export function parseIssueHeader(text) {
  const lines = splitLines(text);
  const end = lines.findIndex((line) => /^#{2,6}\s/.test(line));
  const header = end === -1 ? lines : lines.slice(0, end);
  const values = [];
  for (const line of header) {
    if (!ISSUE_HEADER.test(line)) continue;
    const match = line.match(ISSUE_HEADER_EXACT);
    if (!match) fail('ISSUE_HEADER_INVALID', 'the **Issue:** header is not `#<positive integer>`');
    values.push(Number(match[1]));
  }
  if (values.length > 1)
    fail('ISSUE_HEADER_INVALID', 'the **Issue:** header appears more than once');
  return values[0] ?? null;
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

// The caller's prose, then the marker line, then `Refs #<N>` as the final line. The caller's body
// must not carry a marker line or a marker comment of its own, and the body must round-trip
// through the shipped marker parser to exactly `planPath`. Because the prose holds no opener, the
// parser's verdict on the complete body is its verdict on the appended tail, so only the tail is
// parsed: the parser trims every line with a pattern that is quadratic in a long inner whitespace
// run, and the caller's prose never reaches it.
export function buildPullRequestBody(prose, planPath, issue) {
  callerBody(prose);
  const tail = bodyTail(planPath, issue);
  const body = `${prose.trimEnd()}\n\n${tail}`;
  requireFinalBodyFits(body.length);
  const marker = inspectPlanPrMarker(tail);
  if (marker.status !== 'valid' || marker.plan !== planPath) {
    fail('MARKER_INVALID', 'the plan marker does not round-trip', {
      reason: marker.error ?? marker.status,
    });
  }
  return body;
}

function bodyTail(planPath, issue) {
  return `${buildPlanPrMarkerLine(planPath)}\nRefs #${issue}`;
}

// The limit applies to the body the forge receives, not only to the caller's part of it.
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

// `YYYY-MM-DD-issue-<N>-<slug>.md`, with the plan-numbering slug alphabet.
const UNATTENDED_PLAN_NAME =
  /^\d{4}-\d{2}-\d{2}-issue-([1-9]\d*)-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.md$/;

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

// The checks both mutating operations share before any Git or forge access.
function mutatingInput(operation, input) {
  closedSchema(operation, input);
  unattendedRules(input);
  expectedOids(input);
  const checked = {
    issue: normalizeIssueNumber(input.issue),
    planDir: requireRelativePath(input.planDir, 'planDir'),
    remote: requireRemoteName(input.remote),
    baseBranch: requireRefPath(input.baseBranch, 'baseBranch'),
    title: validateTitle(input.title),
    body: callerBody(input.body),
  };
  // `complete-branch` learns the plan path only from the fetched branch, so its exact final body
  // is checked later; the prose plus the shortest possible tail is a lower bound known now, and a
  // body that cannot fit is refused before any Git call.
  requireFinalBodyFits(checked.body.trimEnd().length + 2 + bodyTail('', checked.issue).length);
  return checked;
}

// The caller's body prose before anything is read: no closing keyword, no marker of its own.
function callerBody(prose) {
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
        stderr: diagnosticText(result?.stderr ?? ''),
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
      stderr: diagnosticText(result?.stderr ?? result?.error?.code ?? ''),
    });
  }
}

async function publishOperation(input, context) {
  const base = mutatingInput('publish', input);
  const commitMessage = validateCommitMessage(input.commitMessage);
  const cwdReal = resolveCwd(input.cwd, context.fs);
  const planPath = requirePlanFilePath(input.planFile);
  const body = buildPullRequestBody(base.body, planPath, base.issue);
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
  const baseOid = await fetchBase(git, base.remote, base.baseBranch, network);
  requireExpectedOid(input.expectedBaseOid, baseOid, 'BASE_CHANGED', 'base');
  const tracked = await git.run(['cat-file', '-e', `${baseOid}:${planPath}`]);
  if (tracked?.status === 0) {
    fail('CHANGESET_INVALID', 'the base already tracks the plan path', {
      violations: [{ violation: 'modification', path: planPath }],
    });
  }

  const scan = scanEntries(
    [
      { field: 'plan', text: planText },
      { field: 'title', text: base.title },
      { field: 'body', text: body },
      { field: 'commitMessage', text: commitMessage },
    ],
    'unattended',
  );
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
      title: base.title,
      body,
      findings: scan.findings,
      ignoredPullRequests,
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

  const finalMessage = await runCommitMsgHook(git, commitMessage, context);
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
    { planPath, branch, baseBranch: base.baseBranch, title: base.title, body },
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
  const body = buildPullRequestBody(base.body, planPath, base.issue);
  const scan = scanEntries(
    [
      { field: 'plan', bytes: blobBytes },
      { field: 'title', text: base.title },
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
      title: base.title,
      body,
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
    { planPath, branch, baseBranch: base.baseBranch, title: base.title, body },
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
