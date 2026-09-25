// Sender-side builder and validator for the message `merge-gate` hands to `iterate`.
//
// `build` turns structured input into the canonical envelope (six control lines, an optional
// CI-repair instruction, the boundary token, the manifest, the delimiter, the body spans), checks
// its own output with the same structural validator `validate` uses, and writes it to a fresh file
// below `<cwd>/.effective-flow/merge-gate/` together with a snapshot of the expected structure.
// `validate` re-reads that file, binds it to the digest `build` returned, and re-runs the text-only
// structural checks against the snapshot. Neither operation ever scans the caller-supplied region
// below the delimiter for keywords; that region is only split on the boundary token and counted.
//
// The receiver rules stated in `src/tools/iterate.md` stay the authoritative contract; this module
// implements the sender half of them and nothing more. It is deterministic apart from the injected
// randomness, so a failure is never retried and never repaired best-effort.

import { createHash, randomBytes as cryptoRandomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, realpath, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

export const DELEGATION_ENVELOPE_VERSION = 1;

export const DELEGATION_ENVELOPE_OPERATIONS = Object.freeze(['build', 'validate']);

export const DELEGATION_ENVELOPE_ERROR_CODES = Object.freeze([
  'INVALID_PAYLOAD',
  'INVALID_CWD',
  'UNSAFE_MANIFEST_VALUE',
  'UNSAFE_TARGET',
  'WRITE_FAILED',
  'DIGEST_MISMATCH',
  'SNAPSHOT_INVALID',
  'DELIMITER_MISSING',
  'CONTROL_LINE_MISSING',
  'CONTROL_LINE_DUPLICATED',
  'CONTROL_LINE_MISMATCH',
  'TOKEN_MISMATCH',
  'FILTER_MISMATCH',
  'MANIFEST_MISMATCH',
  'HEADER_MISMATCH',
  'SPAN_COUNT_MISMATCH',
  'REGION_NOT_EMPTY',
  'SELF_CHECK_FAILED',
  'INTERNAL_ERROR',
]);

const EXIT_CODES = Object.freeze({
  INVALID_PAYLOAD: 2,
  INVALID_CWD: 2,
  UNSAFE_MANIFEST_VALUE: 2,
  UNSAFE_TARGET: 3,
  // An I/O fault aborts the run exactly as an unsafe target does, so it keeps that exit code and
  // only the error code tells the operator which of the two happened.
  WRITE_FAILED: 3,
});

export const DELIMITER = '--- caller-supplied item text follows ---';

// The six control keywords in their canonical serialization order.
export const CONTROL_KEYWORDS = Object.freeze([
  'Item filter',
  'Summary comment',
  'Review guard',
  'Next steps',
  'Run state',
  'Language context',
]);

// Line prefixes an instruction line may not start with (after trimming), because each would be
// read as a control, manifest or token line above the delimiter.
export const INSTRUCTION_FORBIDDEN_PREFIXES = Object.freeze([
  'Item filter:',
  'Summary comment:',
  'Review guard:',
  'Next steps:',
  'Run state:',
  'Language context:',
  'Item:',
  'Thread item:',
  'Boundary token:',
]);

export const LANGUAGE_CONTEXT_KEYS = Object.freeze([
  'source',
  'documentation.user',
  'documentation.technical',
  'workflow',
  'forge',
  'git',
]);

const LANGUAGE_VALUES = new Set(['de', 'en']);
const RUN_STATES = new Set(['gated', 'non-interactive']);
const FIXED_CONTROL_VALUES = Object.freeze({
  summaryComment: 'suppressed',
  reviewGuard: 'established',
  nextSteps: 'suppressed',
});

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const TOKEN_LENGTH = 40;
const MAX_DRAWS = 1000;

// Every character a reader might treat as ending a line: LF, CR (alone or in CRLF), VT (U+000B),
// FF (U+000C), the information separators FS, GS and RS (U+001C-U+001E, which Python's
// `str.splitlines` breaks on), NEL (U+0085), LINE SEPARATOR (U+2028) and PARAGRAPH SEPARATOR
// (U+2029).
const LINE_SPLIT = /\r\n|[\n\r\v\f\u001c-\u001e\u0085\u2028\u2029]/;
// Characters a manifest value may not contain, exactly: every C0 and C1 control character and DEL
// (`\p{Cc}`: U+0000-U+001F, U+007F-U+009F, which covers NUL, TAB, LF, VT, FF, CR, ESC, FS/GS/RS
// and NEL), LINE SEPARATOR and PARAGRAPH SEPARATOR (U+2028, U+2029), and the invisible
// zero-width and bidirectional format characters U+200B-U+200F, U+202A-U+202E, U+2060-U+2064,
// U+2066-U+2069 and U+FEFF.
const UNSAFE_MANIFEST_CHARS =
  /[\p{Cc}\u2028\u2029\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/u;
// A thread ID is an opaque forge token: GitHub GraphQL node IDs (`PRRT_kwDO…`) and Forgejo/Gitea
// numeric IDs both fit. Whitespace, `,` (the Item filter separator) and `|` never do.
const THREAD_ID_FORMAT = /^[A-Za-z0-9_\-:.=/+]+$/;
const DIGITS = /^[0-9]+$/;
const MESSAGE_NAME = /^[1-9]\d*-round[1-9]\d*-[0-9a-f]{32}\.txt$/;
const DIGEST_FORMAT = /^sha256:[0-9a-f]{64}$/;

export class DelegationEnvelopeError extends Error {
  constructor(code, message, position) {
    super(message);
    this.name = 'DelegationEnvelopeError';
    this.code = code;
    this.position = position;
    this.exitCode = EXIT_CODES[code] ?? 1;
  }
}

function fail(code, message, position) {
  throw new DelegationEnvelopeError(code, message, position);
}

// ---------------------------------------------------------------------------------------------
// Input validation

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_PAYLOAD', `${label} must be a JSON object`);
  }
  return value;
}

// A string with a lone surrogate has no UTF-8 encoding: writing it would silently substitute
// U+FFFD, so the file would no longer carry what the caller supplied.
function requireWellFormed(value, label) {
  if (!value.isWellFormed()) {
    fail('INVALID_PAYLOAD', `${label} is not well-formed Unicode (lone surrogate)`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string') fail('INVALID_PAYLOAD', `${label} must be a string`);
  return requireWellFormed(value, label);
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('INVALID_PAYLOAD', `${label} must be a non-empty string`);
  }
  return requireWellFormed(value, label);
}

// Accepts a safe positive integer or a digit-only string (forge numbers arrive either way) and
// returns the number.
function requirePositiveInteger(value, label) {
  const number = typeof value === 'string' && DIGITS.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < 1) {
    fail('INVALID_PAYLOAD', `${label} must be a positive integer or a digit-only string`);
  }
  return number;
}

// Forge IDs arrive as JSON numbers (GitHub REST review `id`, Forgejo/Gitea IDs) or as strings. A
// safe positive integer is normalized to its decimal string before any check or serialization.
function normalizeForgeId(value) {
  return Number.isSafeInteger(value) && value >= 1 ? String(value) : value;
}

// A manifest value must survive the round trip through one `key=value` field of a single manifest
// line: no control, line-terminating or invisible format character, no `|` (the field separator),
// no leading or trailing whitespace.
function requireManifestValue(value, label, { threadId = false } = {}) {
  requireString(value, label);
  if (value.trim() === '') {
    fail('UNSAFE_MANIFEST_VALUE', `${label} must not be empty or whitespace-only`);
  }
  if (UNSAFE_MANIFEST_CHARS.test(value)) {
    fail(
      'UNSAFE_MANIFEST_VALUE',
      `${label} contains a control, line-terminating or invisible format character`,
    );
  }
  if (value !== value.trim()) {
    fail('UNSAFE_MANIFEST_VALUE', `${label} has leading or trailing whitespace`);
  }
  if (value.includes('|')) {
    fail('UNSAFE_MANIFEST_VALUE', `${label} contains the manifest separator "|"`);
  }
  if (threadId && !THREAD_ID_FORMAT.test(value)) {
    fail('UNSAFE_MANIFEST_VALUE', `${label} must be a single token of [A-Za-z0-9_\\-:.=/+]`);
  }
  return value;
}

function normalizeLanguageContext(value) {
  requireObject(value, 'languageContext');
  const keys = Object.keys(value);
  if (
    keys.length !== LANGUAGE_CONTEXT_KEYS.length ||
    keys.some((key) => !LANGUAGE_CONTEXT_KEYS.includes(key))
  ) {
    fail(
      'INVALID_PAYLOAD',
      `languageContext must contain exactly ${LANGUAGE_CONTEXT_KEYS.join(', ')}`,
    );
  }
  for (const key of LANGUAGE_CONTEXT_KEYS) {
    if (!LANGUAGE_VALUES.has(value[key])) {
      fail('INVALID_PAYLOAD', `languageContext.${key} must be de or en`);
    }
  }
  return Object.fromEntries(LANGUAGE_CONTEXT_KEYS.map((key) => [key, value[key]]));
}

export function normalizeBuildInput(input) {
  requireObject(input, 'input');
  const cwd = requireNonEmptyString(input.cwd, 'cwd');
  const pr = requirePositiveInteger(input.pr, 'pr');
  const round = requirePositiveInteger(input.round, 'round');
  for (const [field, expected] of Object.entries(FIXED_CONTROL_VALUES)) {
    if (input[field] !== expected) fail('INVALID_PAYLOAD', `${field} must be ${expected}`);
  }
  if (!RUN_STATES.has(input.runState)) {
    fail('INVALID_PAYLOAD', 'runState must be gated or non-interactive');
  }
  const languageContext = normalizeLanguageContext(input.languageContext);

  const rawThreads = input.threadItems ?? [];
  const rawBodies = input.bodyItems ?? [];
  if (!Array.isArray(rawThreads)) fail('INVALID_PAYLOAD', 'threadItems must be an array');
  if (!Array.isArray(rawBodies)) fail('INVALID_PAYLOAD', 'bodyItems must be an array');

  const durableKeys = new Set();
  const claimDurableKey = (value, label) => {
    requireNonEmptyString(value, label);
    if (durableKeys.has(value)) fail('INVALID_PAYLOAD', `${label} duplicates another durableKey`);
    durableKeys.add(value);
    return value;
  };

  const threadIds = new Set();
  const threadItems = rawThreads.map((item, index) => {
    const label = `threadItems[${index}]`;
    requireObject(item, label);
    const durableKey = claimDurableKey(item.durableKey, `${label}.durableKey`);
    const threadId = requireManifestValue(normalizeForgeId(item.threadId), `${label}.threadId`, {
      threadId: true,
    });
    if (threadIds.has(threadId)) {
      fail('INVALID_PAYLOAD', `${label}.threadId duplicates another thread item`);
    }
    threadIds.add(threadId);
    return { durableKey, threadId };
  });

  const bodyItems = rawBodies.map((item, index) => {
    const label = `bodyItems[${index}]`;
    requireObject(item, label);
    const durableKey = claimDurableKey(item.durableKey, `${label}.durableKey`);
    if (item.reviewId === undefined || item.reviewId === null || item.reviewId === '') {
      fail('INVALID_PAYLOAD', `${label}.reviewId is required`);
    }
    const reviewId = requireManifestValue(normalizeForgeId(item.reviewId), `${label}.reviewId`);
    // Absent provenance is refused per item later, never synthesized; present but unsafe fails.
    // A whitespace-only value carries no provenance either, so it counts as absent and stays a
    // per-item refusal instead of stopping the whole run as a sender-contract error.
    const provenance = (field) =>
      item[field] === undefined ||
      item[field] === null ||
      (typeof item[field] === 'string' && item[field].trim() === '')
        ? null
        : requireManifestValue(item[field], `${label}.${field}`);
    const author = provenance('author');
    const url = provenance('url');
    const text = requireString(item.text, `${label}.text`);
    return { durableKey, reviewId, author, url, text };
  });

  let instruction = null;
  if (input.instruction !== undefined && input.instruction !== null) {
    instruction = requireNonEmptyString(input.instruction, 'instruction');
  }

  return {
    cwd,
    pr,
    round,
    summaryComment: input.summaryComment,
    reviewGuard: input.reviewGuard,
    nextSteps: input.nextSteps,
    runState: input.runState,
    languageContext,
    threadItems,
    bodyItems,
    instruction,
  };
}

// ---------------------------------------------------------------------------------------------
// Refusals

function splitLines(text) {
  return text.split(LINE_SPLIT);
}

// Returns the 1-based line of the first instruction line the receiver would misread, or null.
export function findInstructionViolation(instruction) {
  const lines = splitLines(instruction);
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed === DELIMITER) return { line: index + 1, reason: 'delimiter' };
    const prefix = INSTRUCTION_FORBIDDEN_PREFIXES.find((candidate) =>
      trimmed.startsWith(candidate),
    );
    if (prefix) return { line: index + 1, reason: 'control-prefix', prefix };
  }
  return null;
}

// Returns the refusal reason for one body text, or null when the body can be delegated.
export function bodyRefusalReason(text) {
  if (text.trim() === '') return 'empty-body';
  if (splitLines(text).some((line) => line.trim() === DELIMITER)) return 'delimiter';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Token and identifier minting

// Draws one uppercase-alphanumeric string by rejection sampling, so every character is uniform
// over the 36-symbol alphabet.
export function mintToken(randomBytes = cryptoRandomBytes, length = TOKEN_LENGTH) {
  const limit = 256 - (256 % TOKEN_ALPHABET.length);
  let out = '';
  while (out.length < length) {
    const bytes = randomBytes(length * 2);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

function drawDistinct(randomBytes, collides) {
  for (let attempt = 0; attempt < MAX_DRAWS; attempt += 1) {
    const candidate = mintToken(randomBytes);
    if (!collides(candidate)) return candidate;
  }
  fail('INTERNAL_ERROR', `could not draw a collision-free value in ${MAX_DRAWS} attempts`);
}

function callerValues(normalized) {
  const values = [];
  if (normalized.instruction !== null) values.push(normalized.instruction);
  for (const item of normalized.threadItems) values.push(item.durableKey, item.threadId);
  for (const item of normalized.bodyItems) {
    values.push(item.durableKey, item.reviewId, item.author, item.url, item.text);
  }
  return values.filter((value) => value !== null);
}

// ---------------------------------------------------------------------------------------------
// Serialization

export function itemFilterValue(threadIds) {
  return threadIds.length === 0 ? 'free-text-only' : `threads=${threadIds.join(',')}`;
}

export function languageContextValue(languageContext) {
  return LANGUAGE_CONTEXT_KEYS.map((key) => `${key}=${languageContext[key]}`).join('; ');
}

export function threadItemLine(identifier, threadId) {
  return `Thread item: ${identifier} | thread=${threadId}`;
}

export function bodyItemLine(identifier, { reviewId, author, url }) {
  return `Item: ${identifier} | review=${reviewId} | author=${author} | url=${url}`;
}

// The entries above the delimiter, in order: six control lines, the instruction (one entry, which
// may itself span lines), the token line, the manifest lines.
export function headerLines({ controlValues, instruction, token, manifestLines }) {
  const lines = CONTROL_KEYWORDS.map((keyword) => `${keyword}: ${controlValues[keyword]}`);
  if (instruction !== null && instruction !== undefined) lines.push(instruction);
  lines.push(`Boundary token: ${token}`, ...manifestLines);
  return lines;
}

// Pure serializer: the parts are already validated and minted.
export function serializeEnvelope(parts) {
  const { token, spans } = parts;
  let text = [...headerLines(parts), DELIMITER].join('\n');
  if (spans.length > 0) text += `\n${spans.join(`\n${token}\n`)}`;
  return text;
}

// ---------------------------------------------------------------------------------------------
// Structural validation (text-only)

function requireSnapshot(snapshot) {
  const invalid = (detail) => fail('SNAPSHOT_INVALID', `snapshot is invalid: ${detail}`);
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
    invalid('not an object');
  if (snapshot.version !== DELEGATION_ENVELOPE_VERSION) invalid('unsupported version');
  if (typeof snapshot.token !== 'string' || !/^[A-Z0-9]{32,}$/.test(snapshot.token)) {
    invalid('token');
  }
  const controls = snapshot.controlValues;
  if (!controls || typeof controls !== 'object' || Array.isArray(controls)) {
    invalid('controlValues');
  }
  for (const keyword of CONTROL_KEYWORDS) {
    if (typeof controls[keyword] !== 'string') invalid(`controlValues.${keyword}`);
  }
  if (
    !Array.isArray(snapshot.manifestLines) ||
    snapshot.manifestLines.some((line) => typeof line !== 'string')
  ) {
    invalid('manifestLines');
  }
  if (
    !Array.isArray(snapshot.threadIds) ||
    snapshot.threadIds.some((id) => typeof id !== 'string')
  ) {
    invalid('threadIds');
  }
  if (!Number.isSafeInteger(snapshot.itemCount) || snapshot.itemCount < 0) invalid('itemCount');
  const threadLines = snapshot.manifestLines.filter((line) => line.startsWith('Thread item: '));
  const itemLines = snapshot.manifestLines.filter((line) => line.startsWith('Item: '));
  if (threadLines.length + itemLines.length !== snapshot.manifestLines.length) {
    invalid('manifestLines contain a line that is neither a Thread item nor an Item');
  }
  if (threadLines.length !== snapshot.threadIds.length || itemLines.length !== snapshot.itemCount) {
    invalid('manifest counts disagree with threadIds or itemCount');
  }
  if (snapshot.threadIds.some((id, index) => id !== threadIdOf(threadLines[index]))) {
    invalid('threadIds differ from the Thread item lines');
  }
  if (controls['Item filter'] !== itemFilterValue(snapshot.threadIds)) {
    invalid('controlValues.Item filter disagrees with threadIds');
  }
  // The header must be exactly the control lines, an optional instruction, the token line and the
  // manifest lines the rest of the snapshot declares.
  const header = snapshot.headerLines;
  if (!Array.isArray(header) || header.some((line) => typeof line !== 'string')) {
    invalid('headerLines');
  }
  const instructionCount =
    header.length - CONTROL_KEYWORDS.length - 1 - snapshot.manifestLines.length;
  if (instructionCount !== 0 && instructionCount !== 1) invalid('headerLines length');
  const expected = headerLines({
    controlValues: controls,
    instruction: instructionCount === 1 ? header[CONTROL_KEYWORDS.length] : null,
    token: snapshot.token,
    manifestLines: snapshot.manifestLines,
  });
  if (expected.some((line, index) => line !== header[index])) {
    invalid('headerLines disagree with the control values, token or manifest');
  }
  return snapshot;
}

function threadIdOf(line) {
  const marker = ' | thread=';
  const at = line.lastIndexOf(marker);
  return at === -1 ? null : line.slice(at + marker.length);
}

// Runs the text-only structural checks against a snapshot and returns a summary, or throws a
// DelegationEnvelopeError with a stable code and a 1-based line position. The region below the
// delimiter is split and counted only; it is never scanned for keywords.
export function validateStructure(text, snapshotInput) {
  if (typeof text !== 'string') fail('INVALID_PAYLOAD', 'message text must be a string');
  const snapshot = requireSnapshot(snapshotInput);

  // Find the first line exactly equal to the delimiter (split on \n, the serializer's only
  // joiner), as the receiver does; a padded variant is not the boundary.
  let offset = 0;
  let lineNumber = 0;
  let delimiterStart = -1;
  let delimiterEnd = -1;
  while (offset <= text.length) {
    lineNumber += 1;
    const newline = text.indexOf('\n', offset);
    const end = newline === -1 ? text.length : newline;
    if (text.slice(offset, end) === DELIMITER) {
      delimiterStart = offset;
      delimiterEnd = end;
      break;
    }
    if (newline === -1) break;
    offset = newline + 1;
  }
  if (delimiterStart === -1) fail('DELIMITER_MISSING', 'the message has no delimiter line');
  const delimiterLine = lineNumber;

  const above = delimiterStart === 0 ? '' : text.slice(0, delimiterStart - 1);
  const rest = text.slice(delimiterEnd);
  const aboveLines = splitLines(above);

  // Control lines: each keyword exactly once.
  const seen = new Map();
  aboveLines.forEach((line, index) => {
    const trimmed = line.trimStart();
    for (const keyword of CONTROL_KEYWORDS) {
      if (!trimmed.startsWith(`${keyword}:`)) continue;
      if (seen.has(keyword)) {
        fail('CONTROL_LINE_DUPLICATED', `control line "${keyword}:" appears more than once`, {
          line: index + 1,
        });
      }
      seen.set(keyword, { line: index + 1, value: trimmed.slice(keyword.length + 1).trim() });
    }
  });
  for (const keyword of CONTROL_KEYWORDS) {
    if (!seen.has(keyword)) {
      fail('CONTROL_LINE_MISSING', `control line "${keyword}:" is missing above the delimiter`, {
        line: delimiterLine,
      });
    }
    const { line, value } = seen.get(keyword);
    if (value !== snapshot.controlValues[keyword]) {
      fail('CONTROL_LINE_MISMATCH', `control line "${keyword}:" differs from the snapshot`, {
        line,
      });
    }
  }

  // Boundary token: exactly once and equal to the snapshot's.
  const tokenLines = [];
  aboveLines.forEach((line, index) => {
    if (line.trimStart().startsWith('Boundary token:')) tokenLines.push(index + 1);
  });
  if (tokenLines.length !== 1) {
    fail(
      'TOKEN_MISMATCH',
      `expected exactly one "Boundary token:" line, found ${tokenLines.length}`,
      {
        line: tokenLines[1] ?? delimiterLine,
      },
    );
  }
  if (aboveLines[tokenLines[0] - 1] !== `Boundary token: ${snapshot.token}`) {
    fail('TOKEN_MISMATCH', 'the boundary token differs from the snapshot', {
      line: tokenLines[0],
    });
  }

  // Manifest: Thread item and Item lines above the delimiter, in order.
  const manifest = [];
  aboveLines.forEach((line, index) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('Thread item:') || trimmed.startsWith('Item:')) {
      manifest.push({ line: index + 1, text: line });
    }
  });
  const threadManifest = manifest.filter((entry) =>
    entry.text.trimStart().startsWith('Thread item:'),
  );
  const itemManifest = manifest.filter((entry) => entry.text.trimStart().startsWith('Item:'));

  // Item filter against the Thread item lines, in order.
  const filter = seen.get('Item filter');
  const threadIds = threadManifest.map((entry) => threadIdOf(entry.text));
  if (threadIds.length === 0) {
    if (filter.value !== 'free-text-only') {
      fail('FILTER_MISMATCH', 'Item filter must be free-text-only when there are no thread items', {
        line: filter.line,
      });
    }
  } else {
    const declared = filter.value.startsWith('threads=')
      ? filter.value.slice('threads='.length).split(',')
      : null;
    if (
      !declared ||
      declared.length !== threadIds.length ||
      declared.some((id, index) => id !== threadIds[index])
    ) {
      fail('FILTER_MISMATCH', 'Item filter threads= IDs differ from the Thread item lines', {
        line: filter.line,
      });
    }
  }

  // Manifest equals the snapshot's.
  const expected = snapshot.manifestLines;
  const count = Math.max(expected.length, manifest.length);
  for (let index = 0; index < count; index += 1) {
    if (manifest[index]?.text !== expected[index]) {
      fail('MANIFEST_MISMATCH', 'the manifest differs from the snapshot', {
        line: manifest[index]?.line ?? delimiterLine,
      });
    }
  }

  // Everything above the delimiter equals the snapshot's header, byte for byte, so no extra line
  // (free text or otherwise) survives the checks above.
  const aboveExact = above.split('\n');
  const headerExact = snapshot.headerLines.join('\n').split('\n');
  if (above !== headerExact.join('\n')) {
    const differs = headerExact.findIndex((line, index) => aboveExact[index] !== line);
    fail('HEADER_MISMATCH', 'the lines above the delimiter differ from the snapshot', {
      line: (differs === -1 ? headerExact.length : differs) + 1,
    });
  }

  // Region below the delimiter.
  const itemCount = itemManifest.length;
  if (itemCount === 0) {
    if (rest !== '') {
      fail(
        'REGION_NOT_EMPTY',
        'the region below the delimiter must be empty with zero Item entries',
        {
          line: delimiterLine + 1,
        },
      );
    }
  } else {
    // As in iterate: a whitespace-only region splits into zero spans.
    const spans = rest.trim() === '' ? [] : rest.slice(1).split(`\n${snapshot.token}\n`);
    if (spans.length !== itemCount) {
      fail(
        'SPAN_COUNT_MISMATCH',
        `the region holds ${spans.length} span(s) for ${itemCount} Item entr${itemCount === 1 ? 'y' : 'ies'}`,
        { line: delimiterLine + 1 },
      );
    }
    const blank = spans.findIndex((span) => span.trim() === '');
    if (blank !== -1) {
      fail('SPAN_COUNT_MISMATCH', `span ${blank + 1} is empty or whitespace-only`, {
        line: delimiterLine + 1,
      });
    }
  }

  return { items: itemCount, threadItems: threadManifest.length };
}

// ---------------------------------------------------------------------------------------------
// File system

function sha256(text) {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

async function resolveCwd(cwd) {
  if (!path.isAbsolute(cwd)) fail('INVALID_CWD', 'cwd must be an absolute path');
  let canonical;
  try {
    canonical = await realpath(cwd);
    if (!(await stat(canonical)).isDirectory()) throw new Error('not a directory');
  } catch {
    fail('INVALID_CWD', 'cwd must be an existing directory');
  }
  return canonical;
}

// Verifies one runtime directory level: absent (created when `create` is set, non-recursively),
// or a real directory. A symlink or any other file type is an unsafe target.
async function ensureDirectory(directory, create) {
  let info;
  try {
    info = await lstat(directory);
  } catch (error) {
    if (error?.code !== 'ENOENT') fail('UNSAFE_TARGET', `cannot inspect ${directory}`);
    if (!create) fail('UNSAFE_TARGET', `${directory} does not exist`);
    try {
      await mkdir(directory, { mode: 0o700 });
    } catch (mkdirError) {
      if (mkdirError?.code !== 'EEXIST') fail('UNSAFE_TARGET', `cannot create ${directory}`);
    }
    info = await lstat(directory);
  }
  if (info.isSymbolicLink()) fail('UNSAFE_TARGET', `${directory} is a symlink`);
  if (!info.isDirectory()) fail('UNSAFE_TARGET', `${directory} is not a directory`);
}

// Resolves the runtime directory below an already canonical cwd, checking each level.
async function runtimeDirectory(root, create) {
  const stateDir = path.join(root, '.effective-flow');
  const mergeGateDir = path.join(stateDir, 'merge-gate');
  await ensureDirectory(stateDir, create);
  await ensureDirectory(mergeGateDir, create);
  return { stateDir, mergeGateDir };
}

// Residual risk: these checks narrow, but cannot close, the window in which another process with
// write access to the checkout swaps `.effective-flow/` or `merge-gate/` for a symlink. O_NOFOLLOW
// only covers the final path component, so a parent swapped between the lstat checks and open()
// is caught by the re-check after writing, not prevented; Node offers no openat()-style directory
// handle that would pin the parents. The helper assumes nobody else writes the checkout's runtime
// state concurrently, and fails closed whenever it can observe that assumption breaking.
const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const WRITE_FLAGS = fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | O_NOFOLLOW;
// O_NONBLOCK keeps open() from waiting for a writer when the path names a FIFO; the fstat type
// check on the handle then rejects it. On a regular file the flag has no effect.
const READ_FLAGS = fsConstants.O_RDONLY | O_NOFOLLOW | (fsConstants.O_NONBLOCK ?? 0);

const writeContent = (handle, content) => handle.writeFile(content, 'utf8');

// Creates `target` exclusively (never following a symlink) and returns the identity of the file
// written, so a later cleanup removes that file and nothing else. When writing fails after the
// exclusive open succeeded, the partial file is removed before the error propagates, but only
// while the path still names the file this call created. `write` is a test seam.
async function writeExclusive(target, content, write = writeContent) {
  let handle;
  try {
    handle = await open(target, WRITE_FLAGS, 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') fail('UNSAFE_TARGET', `${target} already exists`);
    fail('UNSAFE_TARGET', `cannot write ${target}: ${error?.code ?? error?.message}`);
  }
  try {
    await write(handle, content);
    const { dev, ino } = await handle.stat();
    return { path: target, dev, ino };
  } catch (error) {
    try {
      const { dev, ino } = await handle.stat();
      await removeWritten([{ path: target, dev, ino }]);
    } catch {
      // The handle no longer yields an identity: remove nothing rather than guess.
    }
    // The exclusive open already proved the target safe, so a failure here is an I/O fault
    // (ENOSPC, EIO, a full quota) and is reported as one rather than as a safety refusal.
    fail('WRITE_FAILED', `cannot write ${target}: ${error?.code ?? error?.message}`);
  } finally {
    await handle.close();
  }
}

// Removes the files this run wrote, but only while the path still names the same file.
async function removeWritten(written) {
  for (const file of written) {
    try {
      const info = await lstat(file.path);
      if (info.isFile() && info.dev === file.dev && info.ino === file.ino) await unlink(file.path);
    } catch {
      // Already gone or no longer reachable: nothing of ours to remove.
    }
  }
}

// Reads a regular file without following a symlink at its final component; the type check runs on
// the open handle, so it describes exactly the file that is read.
async function readRegularFile(target, onMissing) {
  let handle;
  try {
    handle = await open(target, READ_FLAGS);
  } catch (error) {
    if (error?.code === 'ENOENT') onMissing();
    fail('UNSAFE_TARGET', `${target} cannot be opened as a regular file: ${error?.code}`);
  }
  try {
    if (!(await handle.stat()).isFile()) fail('UNSAFE_TARGET', `${target} is not a regular file`);
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

// ---------------------------------------------------------------------------------------------
// Operations

// `deps.randomBytes` injects randomness; `deps.serialize` exists only so a test can reach the
// self-check failure path, which no validated input reaches, and `deps.writeContent` only so a
// test can fail a write after the exclusive open.
export async function buildEnvelope(input, deps = {}) {
  const randomBytes = deps.randomBytes ?? cryptoRandomBytes;
  const serialize = deps.serialize ?? serializeEnvelope;
  const write = deps.writeContent ?? writeContent;
  const normalized = normalizeBuildInput(input);
  const root = await resolveCwd(normalized.cwd);

  const violation =
    normalized.instruction === null ? null : findInstructionViolation(normalized.instruction);
  if (violation) {
    return {
      status: 'instruction-refused',
      position: { line: violation.line },
      reason: violation.reason,
      ...(violation.prefix ? { prefix: violation.prefix } : {}),
    };
  }

  const refused = [];
  const accepted = [];
  for (const item of normalized.bodyItems) {
    // Body refusals take precedence: an empty-bodied review keeps its gate-internal outcome even
    // when its provenance is also absent.
    const reason =
      bodyRefusalReason(item.text) ??
      (item.author === null || item.url === null ? 'missing-provenance' : null);
    if (reason) refused.push({ durableKey: item.durableKey, reason });
    else accepted.push(item);
  }
  if (
    normalized.threadItems.length === 0 &&
    accepted.length === 0 &&
    normalized.instruction === null
  ) {
    return { status: 'nothing-to-delegate', refused };
  }

  // Identifiers first, then the token; each avoids every caller value and every earlier draw.
  const values = callerValues(normalized);
  const minted = [];
  const collides = (candidate) =>
    values.some((value) => value.includes(candidate)) ||
    minted.some((value) => value.includes(candidate) || candidate.includes(value));
  const identifiers = [];
  const manifestLines = [];
  for (const item of normalized.threadItems) {
    const identifier = drawDistinct(randomBytes, collides);
    minted.push(identifier);
    identifiers.push({ identifier, kind: 'thread', durableKey: item.durableKey });
    manifestLines.push(threadItemLine(identifier, item.threadId));
  }
  for (const item of accepted) {
    const identifier = drawDistinct(randomBytes, collides);
    minted.push(identifier);
    identifiers.push({ identifier, kind: 'body', durableKey: item.durableKey });
    manifestLines.push(bodyItemLine(identifier, item));
  }
  const token = drawDistinct(randomBytes, collides);

  const threadIds = normalized.threadItems.map((item) => item.threadId);
  const controlValues = {
    'Item filter': itemFilterValue(threadIds),
    'Summary comment': normalized.summaryComment,
    'Review guard': normalized.reviewGuard,
    'Next steps': normalized.nextSteps,
    'Run state': normalized.runState,
    'Language context': languageContextValue(normalized.languageContext),
  };
  const text = serialize({
    controlValues,
    instruction: normalized.instruction,
    token,
    manifestLines,
    spans: accepted.map((item) => item.text),
  });
  const snapshot = {
    version: DELEGATION_ENVELOPE_VERSION,
    token,
    controlValues,
    headerLines: headerLines({
      controlValues,
      instruction: normalized.instruction,
      token,
      manifestLines,
    }),
    manifestLines,
    threadIds,
    itemCount: accepted.length,
  };

  try {
    validateStructure(text, snapshot);
  } catch (error) {
    if (error instanceof DelegationEnvelopeError) {
      fail(
        'SELF_CHECK_FAILED',
        `built envelope failed its own check: ${error.code}`,
        error.position,
      );
    }
    throw error;
  }

  const { stateDir, mergeGateDir: directory } = await runtimeDirectory(root, true);
  const stem = `${normalized.pr}-round${normalized.round}-${randomBytes(16).toString('hex')}`;
  const messagePath = path.join(directory, `${stem}.txt`);
  const snapshotPath = path.join(directory, `${stem}.json`);
  const written = [];
  try {
    written.push(await writeExclusive(messagePath, text, write));
    written.push(
      await writeExclusive(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, write),
    );
    // Re-check the parents: a level swapped for a symlink while writing fails the build.
    await ensureDirectory(stateDir, false);
    await ensureDirectory(directory, false);
    if ((await realpath(directory)) !== directory) {
      fail('UNSAFE_TARGET', `${directory} no longer resolves to itself`);
    }
  } catch (error) {
    await removeWritten(written);
    throw error;
  }

  return {
    status: 'written',
    path: messagePath,
    snapshotPath,
    digest: sha256(text),
    identifiers,
    refused,
  };
}

export async function validateEnvelope(input) {
  requireObject(input, 'input');
  const cwd = requireNonEmptyString(input.cwd, 'cwd');
  const declaredPath = requireNonEmptyString(input.path, 'path');
  if (typeof input.digest !== 'string' || !DIGEST_FORMAT.test(input.digest)) {
    fail('INVALID_PAYLOAD', 'digest must be sha256:<64 lowercase hex>');
  }

  const root = await resolveCwd(cwd);
  const { mergeGateDir: directory } = await runtimeDirectory(root, false);
  const resolved = path.resolve(root, declaredPath);
  const name = path.basename(resolved);
  let parent;
  try {
    parent = await realpath(path.dirname(resolved));
  } catch {
    fail('UNSAFE_TARGET', 'the message path is not inside the runtime merge-gate directory');
  }
  if (parent !== directory || !MESSAGE_NAME.test(name)) {
    fail(
      'UNSAFE_TARGET',
      'the message path is not a message file of the runtime merge-gate directory',
    );
  }
  const messagePath = path.join(directory, name);
  const snapshotPath = messagePath.replace(/\.txt$/, '.json');
  const text = await readRegularFile(messagePath, () =>
    fail('UNSAFE_TARGET', 'the message file does not exist'),
  );
  const digest = sha256(text);
  if (digest !== input.digest) {
    fail('DIGEST_MISMATCH', 'the message file does not match the digest build returned');
  }
  const snapshotText = await readRegularFile(snapshotPath, () =>
    fail('SNAPSHOT_INVALID', 'the snapshot file is missing'),
  );
  let snapshot;
  try {
    snapshot = JSON.parse(snapshotText);
  } catch {
    fail('SNAPSHOT_INVALID', 'the snapshot file is not valid JSON');
  }
  const summary = validateStructure(text, snapshot);
  return { path: messagePath, digest, ...summary };
}

export async function executeOperation(operation, input = {}, deps = {}) {
  try {
    if (!DELEGATION_ENVELOPE_OPERATIONS.includes(operation)) {
      fail('INVALID_PAYLOAD', `unknown operation: ${operation}`);
    }
    const result =
      operation === 'build' ? await buildEnvelope(input, deps) : await validateEnvelope(input);
    return { ok: true, operation, result };
  } catch (error) {
    return errorEnvelope(operation, error);
  }
}

export function errorEnvelope(operation, error) {
  const normalized =
    error instanceof DelegationEnvelopeError
      ? error
      : new DelegationEnvelopeError(
          'INTERNAL_ERROR',
          error?.message ?? 'unexpected delegation-envelope failure',
        );
  const payload = { code: normalized.code, message: normalized.message };
  if (normalized.position !== undefined) payload.position = normalized.position;
  return { ok: false, operation: operation ?? null, error: payload };
}

export function exitCodeFor(envelope) {
  if (envelope.ok) return 0;
  return EXIT_CODES[envelope.error.code] ?? 1;
}
