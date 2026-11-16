// Verification evidence for `pr`: builds, parses and renders the compact record that carries the
// checks a producer workflow (`build`, `fix`, `refactor`, `deliver`) actually ran into a new pull
// request.
//
// A record binds its results to content, not to a commit: `contentDigest` is the SHA-256 over the
// sorted `git ls-tree -r` entries of the verified tree, with the run's own plan paths excluded.
// `evidence-build` computes it over the verified tree, optionally read from a private object store
// such as the diff-baseline one (`objectDirectory`, with the real store as alternate).
// `evidence-render` recomputes it over `<head>^{tree}`, which it resolves itself, so a stale
// result can never be rendered as current. Only an equal digest renders the results table; any
// other difference renders one notice line and no results.
//
// The record is a closed, versioned schema, travels as base64url of canonical JSON and is limited
// in size, count and text. Text fields fail closed: a forbidden token rejects the record, it is
// never redacted. A content problem is a `rejected` result with a structured reason that never
// carries the offending value. Only these are error envelopes: a malformed call (`INVALID_INPUT`),
// a git failure (`GIT_FAILED`), an object that is missing or of the wrong type
// (`MISSING_OBJECT`) and any unexpected failure (`INTERNAL`).
//
// The helper is read-only: every git call carries `GIT_OPTIONAL_LOCKS=0` and only reads objects.
// Every git call also runs with `--no-replace-objects` and `GIT_NO_REPLACE_OBJECTS=1`, so a
// `refs/replace/*` ref cannot make another tree read as the verified one, and with
// `GIT_NO_LAZY_FETCH=1`, so reading a missing object never fetches it from a promisor remote.
// No `-core.mjs` module imports `process-runner.mjs`; the CLI injects the runner.

import { createHash } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  RuntimeStateError,
  asBuffer,
  errorDetail,
  gitBaseEnv,
  runGit,
} from './runtime-state-guard.mjs';

export const VERIFICATION_EVIDENCE_OPERATIONS = Object.freeze([
  'evidence-build',
  'evidence-parse',
  'evidence-render',
]);

export const VERIFICATION_EVIDENCE_VERSION = 1;

export const LIMITS = Object.freeze({
  checkChars: 80,
  scopeChars: 160,
  limitationChars: 160,
  maxChecks: 20,
  encodedBytes: 6144,
});

export const PRODUCERS = Object.freeze(['build', 'fix', 'refactor', 'deliver']);

export const OUTCOMES = Object.freeze([
  'passed',
  'failed',
  'skipped',
  'unavailable',
  'baseline-failure',
]);

export const PROVENANCES = Object.freeze(['executed', 'baseline-compared', 'not-run']);

const VISIBILITIES = Object.freeze(['standard', 'hidden']);
const LANGUAGES = Object.freeze(['en', 'de']);

// The provenance each outcome requires.
const OUTCOME_PROVENANCE = Object.freeze({
  passed: 'executed',
  failed: 'executed',
  skipped: 'not-run',
  unavailable: 'not-run',
  'baseline-failure': 'baseline-compared',
});

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// The fixed label table of the rendered section; free-text fields are never translated.
export const LABELS = deepFreeze({
  en: {
    heading: 'Verification',
    verifiedOn: 'Verified on',
    columns: ['Check', 'Outcome', 'Scope', 'Limitation'],
    passed: 'passed',
    failed: 'failed',
    skipped: 'skipped',
    unavailable: 'unavailable',
    'baseline-failure': 'baseline failure',
  },
  de: {
    heading: 'Verifikation',
    verifiedOn: 'Verifiziert auf',
    columns: ['Prüfung', 'Ergebnis', 'Umfang', 'Einschränkung'],
    passed: 'bestanden',
    failed: 'fehlgeschlagen',
    skipped: 'übersprungen',
    unavailable: 'nicht verfügbar',
    'baseline-failure': 'Basisfehler',
  },
});

// The comparison text of a `baseline-failure` row and the single stale notice line.
const PHRASES = deepFreeze({
  en: {
    unchangedAgainstBase: 'unchanged against base',
    stale: (shortHead) =>
      `**Verification:** the recorded results do not match the content of \`${shortHead}\` and are not reported.`,
  },
  de: {
    unchangedAgainstBase: 'unverändert gegenüber Basis',
    stale: (shortHead) =>
      `**Verifikation:** Die erfassten Ergebnisse passen nicht zum Inhalt von \`${shortHead}\` und werden nicht berichtet.`,
  },
});

const EMPTY_CELL = '—';

export const VERIFICATION_EVIDENCE_ERROR_CODES = Object.freeze([
  'INVALID_INPUT',
  'GIT_FAILED',
  'MISSING_OBJECT',
  'INTERNAL',
]);

const EXIT_CODES = Object.freeze({ INVALID_INPUT: 2 });

// Bounds the CLI's stdin read; a build input with twenty full checks stays far below it.
export const MAX_STDIN_BYTES = 1024 * 1024;

const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const LS_TREE_META_PATTERN = /^([0-7]{6}) (blob|tree|commit) ([0-9a-f]{40}|[0-9a-f]{64})$/;

// A subclass of the shared `RuntimeStateError`, so a git failure raised by the shared wrapper keeps
// its code here.
export class VerificationEvidenceError extends RuntimeStateError {
  constructor(code, message, options) {
    super(code, message, options);
    this.name = 'VerificationEvidenceError';
    this.exitCode = EXIT_CODES[code] ?? 1;
  }
}

function fail(code, message) {
  throw new VerificationEvidenceError(code, message);
}

// ---------------------------------------------------------------------------------------------
// Call parameters (envelope errors)

const OPERATION_KEYS = Object.freeze({
  'evidence-build': Object.freeze({
    required: Object.freeze([
      'cwd',
      'tree',
      'planDir',
      'planPaths',
      'visibility',
      'producer',
      'checks',
    ]),
    optional: Object.freeze(['objectDirectory']),
  }),
  'evidence-parse': Object.freeze({
    required: Object.freeze(['record', 'planDir', 'visibility']),
    optional: Object.freeze([]),
  }),
  'evidence-render': Object.freeze({
    required: Object.freeze(['cwd', 'record', 'head', 'planDir', 'visibility', 'language']),
    optional: Object.freeze([]),
  }),
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// A call key is echoed only when it is a short identifier; anything else could carry caller text.
function describeKey(key) {
  return /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(key) ? `: ${key}` : '';
}

function requireCallShape(input, operation) {
  if (!isPlainObject(input)) fail('INVALID_INPUT', 'input must be a JSON object');
  const { required, optional } = OPERATION_KEYS[operation];
  for (const key of Object.keys(input)) {
    if (!required.includes(key) && !optional.includes(key)) {
      fail('INVALID_INPUT', `unknown input field${describeKey(key)}`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(input, key) || input[key] === undefined) {
      fail('INVALID_INPUT', `missing input field: ${key}`);
    }
  }
}

function requireAbsolutePath(value, label) {
  if (
    typeof value !== 'string' ||
    value === '' ||
    value.includes('\0') ||
    !path.isAbsolute(value)
  ) {
    fail('INVALID_INPUT', `${label} must be an absolute path`);
  }
  return value;
}

function requireObjectId(value, label) {
  if (typeof value !== 'string' || !OBJECT_ID_PATTERN.test(value)) {
    fail('INVALID_INPUT', `${label} must be a 40 or 64 character lowercase hex object id`);
  }
  return value;
}

function requireEnum(value, label, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    fail('INVALID_INPUT', `${label} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

// `planDir` is a relative POSIX path: non-empty, no leading or trailing `/`, no backslash, no
// empty, `.` or `..` segment and no control character.
export function isValidPlanDir(value) {
  if (typeof value !== 'string' || value === '') return false;
  if (value.startsWith('/') || value.endsWith('/') || value.includes('\\')) return false;
  if (CONTROL_PATTERN.test(value) || !value.isWellFormed()) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function requirePlanDir(value) {
  if (!isValidPlanDir(value)) fail('INVALID_INPUT', 'planDir must be a relative POSIX path');
  return value;
}

// The canonical path of an existing directory, or null.
async function requireDirectory(value) {
  try {
    const canonical = await realpath(value);
    if ((await stat(canonical)).isDirectory()) return canonical;
  } catch {
    // Reported below without the filesystem detail.
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Canonical encoding

// Canonical JSON: object keys sorted recursively by UTF-16 code unit, no whitespace, every scalar
// through `JSON.stringify`. Keys are written as they are, so a decoded `__proto__` own key
// round-trips instead of becoming a prototype.
export function canonicalJson(value) {
  // As in `JSON.stringify`, an `undefined` array item is `null` and an `undefined` property is
  // left out.
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  const scalar = JSON.stringify(value);
  if (scalar === undefined) throw new TypeError('value is not JSON-serializable');
  return scalar;
}

// The transport form of a record: base64url without padding of the UTF-8 canonical JSON. No
// validation happens here.
export function encodeRecord(value) {
  return Buffer.from(canonicalJson(value), 'utf8').toString('base64url');
}

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

// Decodes and fully validates one transport string. Returns `{ record }` or `{ reason }`.
export function decodeRecord(encoded, { planDir, visibility }) {
  if (encoded.length > LIMITS.encodedBytes) return { reason: { code: 'oversized' } };
  // Strict alphabet; a length of 1 mod 4 is no base64 encoding at all.
  if (!BASE64URL_PATTERN.test(encoded) || encoded.length % 4 === 1) {
    return { reason: { code: 'malformed-encoding' } };
  }
  let decoded;
  try {
    decoded = JSON.parse(UTF8.decode(Buffer.from(encoded, 'base64url')));
  } catch {
    return { reason: { code: 'malformed-encoding' } };
  }
  if (!isPlainObject(decoded)) return { reason: { code: 'malformed-encoding' } };
  // Re-encoding must reproduce the input exactly: this rejects padding bits, whitespace, key
  // order, duplicate keys and number spellings that decode to the same value.
  if (encodeRecord(decoded) !== encoded) return { reason: { code: 'non-canonical' } };
  const reason = validateRecord(decoded, { planDir, visibility });
  return reason ? { reason } : { record: decoded };
}

// ---------------------------------------------------------------------------------------------
// Record validation (rejections)

const RECORD_KEYS = Object.freeze(['version', 'producer', 'contentDigest', 'planPaths', 'checks']);
const CHECK_KEYS = Object.freeze([
  'check',
  'outcome',
  'provenance',
  'scope',
  'limitation',
  'comparison',
]);
const COMPARISON_KEYS = Object.freeze(['base', 'unchanged']);
const REQUIRED_CHECK_FIELDS = Object.freeze(['check', 'outcome', 'provenance', 'scope']);
const TEXT_FIELDS = Object.freeze(['check', 'scope', 'limitation']);
const TEXT_LIMITS = Object.freeze({
  check: LIMITS.checkChars,
  scope: LIMITS.scopeChars,
  limitation: LIMITS.limitationChars,
});

// Any C0 control character, DEL, NEL and the Unicode line and paragraph separators.
const CONTROL_PATTERN = /[\u0000-\u001F\u007F\u0085\u2028\u2029]/u;

// The characters after which a `/` or `~` starts a path token, besides the field start:
// whitespace, opening, closing and initial or final quotation punctuation (`(`, `]`, `„`, `“`, …),
// the ASCII quotes and `= : , ; * _ - ! ? < > \`. Any other character, such as a letter, digit,
// `.`, `/`, `+` or `#`, keeps it inside a word such as `unit/integration`, `C++/Rust` or `C#/F#`.
// Format characters never reach this rule: `invisible-char` rejects them first.
const PATH_TOKEN_START = String.raw`[\s\p{Ps}\p{Pe}\p{Pi}\p{Pf}"'=:,;*_\-!?<>\\]`;
// The characters that make a `/` after a token start an absolute path: a path segment begins
// with one of them, so `(unit)/(e2e)` and `+/-5%` stay plain text.
const PATH_SEGMENT_START = String.raw`[\p{L}\p{N}._~]`;

// The forbidden-token rules in evaluation order; the first match names the rule. A `/` directly
// after `:` counts as an absolute path, except the `://` of a URL authority, so the URL rules
// below stay reachable.
export const FORBIDDEN_TOKEN_RULES = Object.freeze([
  // Format characters (zero-width spaces and joiners, bidirectional overrides, the soft hyphen,
  // the byte order mark), private-use code points and every other default-ignorable code point
  // (fillers, variation selectors, the combining grapheme joiner) can hide or reorder text in the
  // rendered section. The text and emoji presentation selectors U+FE0E and U+FE0F stay allowed,
  // so `✔️` is valid. Unassigned code points are not rejected: which ones are unassigned depends
  // on the Unicode version of the Node runtime.
  ['invisible-char', /(?![\uFE0E\uFE0F])[\p{Cf}\p{Co}\p{Default_Ignorable_Code_Point}]/u],
  [
    'absolute-path',
    new RegExp(
      String.raw`(?:^|${PATH_TOKEN_START})\/(?=${PATH_SEGMENT_START})|:\/(?!\/[^\/\s])|(?:^|[^A-Za-z0-9])[A-Za-z]:[\\\/]`,
      'u',
    ),
  ],
  ['home-path', new RegExp(String.raw`(?:^|${PATH_TOKEN_START})~[\p{L}\p{N}._-]*\/`, 'u')],
  ['file-url', /file:/iu],
  ['credential-url', /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/\s@]+@/u],
  ['mention', /(?:^|[^A-Za-z0-9._%+-])@[A-Za-z0-9]/u],
  ['release-as', /release-as:/iu],
  [
    'issue-keyword',
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b[:\s]*(?:#\d+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#\d+|https?:\/\/\S*\/(?:issues|pull)\/\d+)/iu,
  ],
  ['breaking-change', /BREAKING[ -]CHANGE *:/iu],
  ['html', /<!--|<[A-Za-z/!?]/u],
  ['table-breaker', /\|/u],
  ['backtick', /`/u],
  ['heading', /^\s*#/u],
  [
    'attribution',
    /co-authored-by|generated\s+(?:with|by)|claude\.ai\/|chatgpt\.com\/|noreply@anthropic\.com|\u{1F916}/iu,
  ],
  ['finding-id', /\bR-\d{7}\b/u],
  [
    'secret',
    /(?<![A-Za-z0-9])(?:(?:ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|glpat-|sk-|xox[abprs]-|AIza|eyJ)[A-Za-z0-9_-]+|(?:AKIA|ASIA)[0-9A-Z]{16})|-----BEGIN/u,
  ],
  ['assignment', /[A-Za-z_][A-Za-z0-9_]*=\S/u],
  ['timestamp', /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}|\b\d{2}:\d{2}:\d{2}\b/u],
  [
    'stack-frame',
    /:\d+:\d+|^at \S+ ?\([^()]*(?::\d+|Native Method|Unknown Source)\)|^at \S+:\d+|File "[^"]*", line \d+|panicked at/u,
  ],
]);

// The comparison form of the hidden-mode rules: NFKC (so fullwidth letters and the non-breaking
// hyphen fold to their plain forms), lowercase, and every whitespace run, the no-break space
// included, collapsed to one space.
function hiddenComparisonForm(text) {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ');
}

function escapeRegExp(text) {
  return text.replace(/[\\^$.*+?()[\]{}|/]/gu, '\\$&');
}

// Hidden mode only, evaluated after the rules above on the comparison form of the field. The plan
// directory is compared in the same form as a whole path token: not preceded by a letter, digit,
// `.`, `_` or `-`, and not followed by a letter, digit, `_` or `-`, so `docs/plan`, `docs/plan/x`
// and `docs/plan.` match while `docs/planning` and, for the directory `plan`, `explanation` do
// not. The name rule allows up to three characters that are neither letters nor digits between
// the two words.
function hiddenRules(planDir) {
  const plan = new RegExp(
    String.raw`(?:^|[^\p{L}\p{N}._-])${escapeRegExp(hiddenComparisonForm(planDir))}(?=$|[^\p{L}\p{N}_-])`,
    'u',
  );
  return [
    ['hidden-runtime-path', (text) => text.includes('.effective-flow')],
    ['hidden-plan-path', (text) => plan.test(text)],
    ['hidden-name', (text) => /effective[^\p{L}\p{N}]{0,3}flow/u.test(text)],
  ];
}

function codePoints(text) {
  return [...text].length;
}

// The first text rule a well-typed field breaks, as a reason without the value, or null.
function textReason(text, field, index, { planDir, visibility }) {
  const at = { check: index, field };
  if (codePoints(text) > TEXT_LIMITS[field]) return { code: 'field-too-long', ...at };
  if (CONTROL_PATTERN.test(text)) return { code: 'multi-line', ...at };
  for (const [rule, pattern] of FORBIDDEN_TOKEN_RULES) {
    if (pattern.test(text)) return { code: 'forbidden-token', rule, ...at };
  }
  if (visibility === 'hidden') {
    const comparable = hiddenComparisonForm(text);
    for (const [rule, matches] of hiddenRules(planDir)) {
      if (matches(comparable)) return { code: 'forbidden-token', rule, ...at };
    }
  }
  return null;
}

// The single plan file name `<f>.md` that a path names below `planDir` or its `archive/`, or null.
function planFileName(entry, planDir) {
  const prefix = `${planDir}/`;
  if (!entry.startsWith(prefix)) return null;
  let rest = entry.slice(prefix.length);
  if (rest.startsWith('archive/')) rest = rest.slice('archive/'.length);
  const valid =
    rest.length > '.md'.length &&
    rest.endsWith('.md') &&
    !rest.includes('/') &&
    !rest.includes('\\') &&
    !CONTROL_PATTERN.test(rest);
  return valid ? rest : null;
}

// `planPaths` is a sorted, duplicate-free subset of `[<planDir>/<f>.md, <planDir>/archive/<f>.md]`
// for one file name; hidden mode requires `[]`.
export function planPathsReason(planPaths, { planDir, visibility }) {
  const reason = (code) => ({ code, field: 'planPaths' });
  if (!Array.isArray(planPaths)) return reason('invalid-plan-paths');
  if (visibility === 'hidden' && planPaths.length > 0) return reason('hidden-plan-paths');
  if (planPaths.length > 2) return reason('invalid-plan-paths');
  let name = null;
  for (const [index, entry] of planPaths.entries()) {
    if (typeof entry !== 'string' || !entry.isWellFormed()) return reason('invalid-plan-paths');
    // Strictly ascending by code unit: sorted and unique in one comparison.
    if (index > 0 && !(planPaths[index - 1] < entry)) return reason('invalid-plan-paths');
    const file = planFileName(entry, planDir);
    if (file === null || (name !== null && file !== name)) return reason('invalid-plan-paths');
    name = file;
  }
  return null;
}

function checkReason(entry, index, options) {
  const at = (field, code) => ({ code, check: index, field });
  if (!isPlainObject(entry)) return { code: 'invalid-field', check: index, field: 'checks' };
  if (Object.keys(entry).some((key) => !CHECK_KEYS.includes(key))) {
    return { code: 'unknown-field', check: index };
  }
  // Required fields: absent or empty.
  for (const field of REQUIRED_CHECK_FIELDS) {
    if (entry[field] === undefined || entry[field] === '') return at(field, 'missing-field');
  }
  // An optional limitation that is present must not be empty either: absence is its only "none".
  if (entry.limitation === '') return at('limitation', 'missing-field');
  // Types.
  for (const field of TEXT_FIELDS) {
    if (field === 'limitation' && entry.limitation === undefined) continue;
    if (typeof entry[field] !== 'string' || !entry[field].isWellFormed()) {
      return at(field, 'invalid-field');
    }
  }
  if (!OUTCOMES.includes(entry.outcome)) return at('outcome', 'invalid-field');
  if (!PROVENANCES.includes(entry.provenance)) return at('provenance', 'invalid-field');
  // Pairing.
  if (OUTCOME_PROVENANCE[entry.outcome] !== entry.provenance) {
    return at('provenance', 'outcome-provenance-mismatch');
  }
  // Comparison: required for a baseline failure, forbidden otherwise.
  if (entry.outcome === 'baseline-failure') {
    const { comparison } = entry;
    if (comparison === undefined) return at('comparison', 'missing-field');
    if (!isPlainObject(comparison)) return at('comparison', 'invalid-field');
    if (Object.keys(comparison).some((key) => !COMPARISON_KEYS.includes(key))) {
      return at('comparison', 'unknown-field');
    }
    if (comparison.base === undefined || comparison.unchanged === undefined) {
      return at('comparison', 'missing-field');
    }
    if (typeof comparison.base !== 'string' || !OBJECT_ID_PATTERN.test(comparison.base)) {
      return at('comparison', 'invalid-field');
    }
    if (comparison.unchanged !== true) return at('comparison', 'invalid-field');
  } else if (entry.comparison !== undefined) {
    return at('comparison', 'invalid-field');
  }
  // Text rules, field by field.
  for (const field of TEXT_FIELDS) {
    if (entry[field] === undefined) continue;
    const reason = textReason(entry[field], field, index, options);
    if (reason) return reason;
  }
  return null;
}

// The first rule a decoded record breaks, in the documented order, or null. The reason never
// carries the offending value.
export function validateRecord(record, { planDir, visibility }) {
  const options = { planDir, visibility };
  if (!isPlainObject(record)) return { code: 'malformed-encoding' };
  if (record.version !== VERIFICATION_EVIDENCE_VERSION) return { code: 'unknown-version' };
  if (Object.keys(record).some((key) => !RECORD_KEYS.includes(key))) {
    return { code: 'unknown-field' };
  }
  if (record.producer === undefined) return { code: 'missing-field', field: 'producer' };
  if (!PRODUCERS.includes(record.producer)) return { code: 'invalid-field', field: 'producer' };
  if (record.contentDigest === undefined) {
    return { code: 'missing-field', field: 'contentDigest' };
  }
  if (typeof record.contentDigest !== 'string' || !DIGEST_PATTERN.test(record.contentDigest)) {
    return { code: 'invalid-field', field: 'contentDigest' };
  }
  if (record.planPaths === undefined) return { code: 'missing-field', field: 'planPaths' };
  const planPaths = planPathsReason(record.planPaths, options);
  if (planPaths) return planPaths;
  if (record.checks === undefined) return { code: 'missing-field', field: 'checks' };
  if (!Array.isArray(record.checks)) return { code: 'invalid-field', field: 'checks' };
  if (record.checks.length === 0) return { code: 'no-checks', field: 'checks' };
  if (record.checks.length > LIMITS.maxChecks) {
    return { code: 'too-many-checks', field: 'checks' };
  }
  for (const [index, entry] of record.checks.entries()) {
    const reason = checkReason(entry, index, options);
    if (reason) return reason;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Content digest

// Parses `git ls-tree -r -z --full-tree` output into `{ mode, type, oid, path }` entries, with
// `path` as the raw byte Buffer.
export function parseLsTree(output) {
  const bytes = Buffer.isBuffer(output) ? output : Buffer.from(output);
  const entries = [];
  let start = 0;
  while (start < bytes.length) {
    const end = bytes.indexOf(0, start);
    if (end === -1) fail('GIT_FAILED', 'git ls-tree output is not NUL-terminated');
    const record = bytes.subarray(start, end);
    const tab = record.indexOf(0x09);
    const meta = tab === -1 ? null : LS_TREE_META_PATTERN.exec(record.subarray(0, tab).toString());
    if (!meta || tab === record.length - 1) fail('GIT_FAILED', 'unexpected git ls-tree entry');
    entries.push({
      mode: meta[1],
      type: meta[2],
      oid: meta[3],
      path: Buffer.from(record.subarray(tab + 1)),
    });
    start = end + 1;
  }
  return entries;
}

// Lowercase hex SHA-256 over `<mode> <type> <oid>\t<path>\0` for every entry whose path bytes
// differ from the UTF-8 bytes of each `planPaths` element, sorted by raw path bytes.
export function contentDigest(entries, planPaths = []) {
  const excluded = planPaths.map((entry) => Buffer.from(entry, 'utf8'));
  const kept = entries
    .filter((entry) => !excluded.some((bytes) => bytes.equals(entry.path)))
    .sort((left, right) => Buffer.compare(left.path, right.path));
  const hash = createHash('sha256');
  for (const entry of kept) {
    hash.update(`${entry.mode} ${entry.type} ${entry.oid}\t`);
    hash.update(entry.path);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function makeContext(deps) {
  if (typeof deps.runner !== 'function') fail('INTERNAL', 'no process runner was injected');
  const env = gitBaseEnv(deps.env ?? process.env);
  // `gitBaseEnv` strips any inherited replace-object setting; this one is set on purpose.
  env.GIT_NO_REPLACE_OBJECTS = '1';
  env.GIT_NO_LAZY_FETCH = '1';
  return { runner: deps.runner, env, cwd: null };
}

async function resolveCwd(value) {
  const cwd = await requireDirectory(value);
  if (!cwd) fail('INVALID_INPUT', 'cwd must be an existing directory');
  return cwd;
}

// Runs `git -C <cwd> --no-replace-objects <args>` and returns the raw result for a caller that
// classifies a nonzero status itself. Only a process that could not be started fails here.
async function runEvidenceGit(context, cwd, args, env = context.env) {
  const result = await runGit(context, cwd, ['--no-replace-objects', ...args], { env });
  if (!result || result.error) fail('GIT_FAILED', `git ${args[0]} could not be started`);
  return result;
}

// As `runEvidenceGit`, with any nonzero status a GIT_FAILED error carrying one stderr line.
// Returns stdout as a Buffer.
async function evidenceGit(context, cwd, args, env = context.env) {
  const result = await runEvidenceGit(context, cwd, args, env);
  if (result.status !== 0) {
    const detail = errorDetail(result.stderr);
    fail('GIT_FAILED', `git ${args[0]} failed${detail ? `: ${detail}` : ''}`);
  }
  return asBuffer(result.stdout);
}

async function evidenceGitText(context, cwd, args, env) {
  return (await evidenceGit(context, cwd, args, env)).toString('utf8').trim();
}

const OBJECT_ID_LENGTHS = Object.freeze({ sha1: 40, sha256: 64 });

// Requires `cwd` to be inside a repository (otherwise GIT_FAILED) and returns the object id
// length of its object format.
async function repositoryObjectIdLength(context, cwd) {
  const lines = (
    await evidenceGitText(context, cwd, ['rev-parse', '--git-dir', '--show-object-format'])
  ).split('\n');
  // The format is the last line; the git directory before it is not needed.
  const length = OBJECT_ID_LENGTHS[lines.at(-1).trim()];
  if (length === undefined) {
    fail('GIT_FAILED', 'git rev-parse reported an unknown object format');
  }
  return length;
}

// The canonical real object directory of the repository at `cwd`, resolved without any object
// directory override.
async function realObjectDirectory(context, cwd) {
  const value = await evidenceGitText(context, cwd, [
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'objects',
  ]);
  const resolved = await requireDirectory(value);
  if (!resolved) fail('GIT_FAILED', 'cannot resolve the repository object directory');
  return resolved;
}

// Requires `oid` to name an object of `type` in the store `env` reads. An id of the other object
// format, an absent object (`cat-file -e` status 1) and an object of another type are
// MISSING_OBJECT; any other git failure is GIT_FAILED.
async function requireObject(context, cwd, { oid, type, idLength, env, label }) {
  if (oid.length !== idLength)
    fail('MISSING_OBJECT', `${label} is not readable in the object store`);
  const exists = await runEvidenceGit(context, cwd, ['cat-file', '-e', oid], env);
  if (exists.status === 1) fail('MISSING_OBJECT', `${label} is not readable in the object store`);
  if (exists.status !== 0) {
    const detail = errorDetail(exists.stderr);
    fail('GIT_FAILED', `git cat-file failed${detail ? `: ${detail}` : ''}`);
  }
  const actual = await evidenceGitText(context, cwd, ['cat-file', '-t', oid], env);
  if (actual !== type) fail('MISSING_OBJECT', `${label} is not a ${type} object`);
}

// The content digest of a tree that `requireObject` has already found readable.
async function treeDigest(context, cwd, tree, planPaths, env) {
  const listing = await evidenceGit(
    context,
    cwd,
    ['ls-tree', '-r', '-z', '--full-tree', tree],
    env,
  );
  return contentDigest(parseLsTree(listing), planPaths);
}

// ---------------------------------------------------------------------------------------------
// Rendering

function limitationCell(entry, language) {
  if (entry.outcome === 'baseline-failure') {
    const base = `${PHRASES[language].unchangedAgainstBase} ${entry.comparison.base.slice(0, 7)}`;
    return entry.limitation === undefined ? base : `${base}; ${entry.limitation}`;
  }
  return entry.limitation ?? EMPTY_CELL;
}

// The section for a current record: lines joined with `\n`, no trailing newline. Free-text fields
// pass through unchanged; the text rules already forbid every table and Markdown breaker.
export function renderSection(record, shortHead, language) {
  const labels = LABELS[language];
  const row = (cells) => `| ${cells.join(' | ')} |`;
  return [
    `## ${labels.heading}`,
    '',
    `${labels.verifiedOn} \`${shortHead}\`.`,
    '',
    row(labels.columns),
    row(labels.columns.map(() => '---')),
    ...record.checks.map((entry) =>
      row([entry.check, labels[entry.outcome], entry.scope, limitationCell(entry, language)]),
    ),
  ].join('\n');
}

export function renderStaleNotice(shortHead, language) {
  return PHRASES[language].stale(shortHead);
}

// ---------------------------------------------------------------------------------------------
// Operations

export async function buildEvidence(input, deps = {}) {
  requireCallShape(input, 'evidence-build');
  const cwdInput = requireAbsolutePath(input.cwd, 'cwd');
  const tree = requireObjectId(input.tree, 'tree');
  const objectDirectoryInput =
    input.objectDirectory === undefined
      ? null
      : requireAbsolutePath(input.objectDirectory, 'objectDirectory');
  const planDir = requirePlanDir(input.planDir);
  const visibility = requireEnum(input.visibility, 'visibility', VISIBILITIES);
  const options = { planDir, visibility };

  // A producer may list its plan paths in any order; the record carries them sorted, the only
  // form that parse and render accept. Sorting keeps duplicates adjacent, so they are still
  // rejected below.
  const planPaths = sortedPlanPaths(input.planPaths);
  // Content first, with a placeholder digest of the final length: a rejection needs no git, and
  // the encoded size does not depend on the digest value.
  const draft = {
    version: VERIFICATION_EVIDENCE_VERSION,
    producer: input.producer,
    contentDigest: '0'.repeat(64),
    planPaths,
    checks: input.checks,
  };
  const reason = validateRecord(draft, options);
  if (reason) return { status: 'rejected', reason };
  const checks = input.checks.map((entry) => {
    const copy = {
      check: entry.check,
      outcome: entry.outcome,
      provenance: entry.provenance,
      scope: entry.scope,
    };
    if (entry.limitation !== undefined) copy.limitation = entry.limitation;
    if (entry.comparison !== undefined) {
      copy.comparison = { base: entry.comparison.base, unchanged: true };
    }
    return copy;
  });
  if (encodeRecord({ ...draft, checks }).length > LIMITS.encodedBytes) {
    return { status: 'rejected', reason: { code: 'oversized' } };
  }

  const context = makeContext(deps);
  const cwd = await resolveCwd(cwdInput);
  // A cwd outside any repository is a git failure, not a missing object.
  const idLength = await repositoryObjectIdLength(context, cwd);
  let env = context.env;
  if (objectDirectoryInput !== null) {
    const objectDirectory = await requireDirectory(objectDirectoryInput);
    if (!objectDirectory) fail('MISSING_OBJECT', 'objectDirectory is not an existing directory');
    env = {
      ...context.env,
      GIT_OBJECT_DIRECTORY: objectDirectory,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: await realObjectDirectory(context, cwd),
    };
  }
  await requireObject(context, cwd, { oid: tree, type: 'tree', idLength, env, label: 'the tree' });
  const digest = await treeDigest(context, cwd, tree, planPaths, env);
  const record = encodeRecord({ ...draft, contentDigest: digest, checks });
  return { status: 'built', record, contentDigest: digest, checkCount: checks.length };
}

// A copy of a build's `planPaths` sorted by code unit, the order `planPathsReason` requires. Any
// value that is not an array of strings stays as it is, for the validation to reject.
function sortedPlanPaths(value) {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) return value;
  return [...value].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function requireRecordString(value) {
  if (typeof value !== 'string') fail('INVALID_INPUT', 'record must be a string');
  return value;
}

export function parseEvidence(input) {
  requireCallShape(input, 'evidence-parse');
  const encoded = requireRecordString(input.record);
  const planDir = requirePlanDir(input.planDir);
  const visibility = requireEnum(input.visibility, 'visibility', VISIBILITIES);
  const decoded = decodeRecord(encoded, { planDir, visibility });
  if (decoded.reason) return { status: 'rejected', reason: decoded.reason };
  return { status: 'valid', record: decoded.record };
}

// Requires `head` to be a commit object itself, so a tree or tag id cannot stand in for it, then
// resolves `<head>^{tree}` and requires that tree to be readable.
async function resolveHeadTree(context, cwd, head, idLength) {
  await requireObject(context, cwd, {
    oid: head,
    type: 'commit',
    idLength,
    env: context.env,
    label: 'head',
  });
  const result = await runEvidenceGit(context, cwd, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${head}^{tree}`,
  ]);
  const tree = asBuffer(result.stdout).toString('utf8').trim();
  if (result.status !== 0 || !OBJECT_ID_PATTERN.test(tree)) {
    fail('MISSING_OBJECT', 'the tree of head is not readable');
  }
  await requireObject(context, cwd, {
    oid: tree,
    type: 'tree',
    idLength,
    env: context.env,
    label: 'the tree of head',
  });
  return tree;
}

export async function renderEvidence(input, deps = {}) {
  requireCallShape(input, 'evidence-render');
  const cwdInput = requireAbsolutePath(input.cwd, 'cwd');
  const encoded = requireRecordString(input.record);
  const head = requireObjectId(input.head, 'head');
  const planDir = requirePlanDir(input.planDir);
  const visibility = requireEnum(input.visibility, 'visibility', VISIBILITIES);
  const language = requireEnum(input.language, 'language', LANGUAGES);

  const decoded = decodeRecord(encoded, { planDir, visibility });
  if (decoded.reason) return { status: 'rejected', reason: decoded.reason, markdown: null };
  const { record } = decoded;

  const context = makeContext(deps);
  const cwd = await resolveCwd(cwdInput);
  // A cwd outside any repository is a git failure, not a missing object.
  const idLength = await repositoryObjectIdLength(context, cwd);
  const tree = await resolveHeadTree(context, cwd, head, idLength);
  const digest = await treeDigest(context, cwd, tree, record.planPaths, context.env);
  const shortHead = head.slice(0, 7);
  if (digest !== record.contentDigest) {
    return { status: 'stale', markdown: renderStaleNotice(shortHead, language), shortHead };
  }
  return { status: 'current', markdown: renderSection(record, shortHead, language), shortHead };
}

// ---------------------------------------------------------------------------------------------
// Envelope

const HANDLERS = Object.freeze({
  'evidence-build': buildEvidence,
  'evidence-parse': parseEvidence,
  'evidence-render': renderEvidence,
});

export async function executeOperation(operation, input = {}, deps = {}) {
  try {
    if (!VERIFICATION_EVIDENCE_OPERATIONS.includes(operation)) {
      fail('INVALID_INPUT', 'unknown operation');
    }
    const data = await HANDLERS[operation](input, deps);
    return { ok: true, operation, data };
  } catch (error) {
    return errorEnvelope(operation, error);
  }
}

export function errorEnvelope(operation, error) {
  const known =
    error instanceof RuntimeStateError && VERIFICATION_EVIDENCE_ERROR_CODES.includes(error.code);
  return {
    ok: false,
    operation: VERIFICATION_EVIDENCE_OPERATIONS.includes(operation) ? operation : null,
    error: known
      ? { code: error.code, message: error.message }
      : { code: 'INTERNAL', message: 'unexpected verification-evidence failure' },
  };
}

export function exitCodeFor(envelope) {
  if (envelope.ok) return 0;
  return EXIT_CODES[envelope.error.code] ?? 1;
}
