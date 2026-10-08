// Configuration resolver: the deterministic part of reading a project's Effective Flow
// configuration. `resolve` locates the configuration source through the five locator steps,
// decodes its key/value table, applies the hidden-mode forced values, validates the few keys whose
// rules this resolver owns, and classifies every retired row for the calling tool.
//
// Locator steps (the first matching step wins):
//   0. `<RUNTIME_STATE_ROOT>/.effective-flow/project-setup.md` declaring `visibility | hidden`
//   1. the setup marker in `AGENTS.md`, then `CLAUDE.md`, naming the project-setup ADR
//   2. a scan of the first existing ADR directory for the project-setup ADR stem
//   3. the transitional `<RUNTIME_STATE_ROOT>/.effective-flow/config.json`, else `.firmo/config.json`
//   4. nothing: the calling tools apply their own defaults
//
// Steps 1 and 2 read only below the checkout root of `cwd`; steps 0 and 3 read only below the
// verified runtime-state root (the main checkout), and only inside a Git checkout. The resolver
// never writes, never touches the network, and carries no default value of any key: a key it does
// not report is unset, and the owning tool decides what that means.
//
// The resolver is the only source of the root verification, the stem tolerance and ranking, the
// hidden-mode forced values, the retired-row successor map and the per-tool successor sets. Prose
// consumers act on its diagnostics and never restate those rules.

import { spawn } from 'node:child_process';
import nodeFs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export const CONFIG_RESOLVE_OPERATIONS = Object.freeze(['resolve']);

export const CONFIG_RESOLVE_ERROR_CODES = Object.freeze([
  'INVALID_INPUT',
  'RUNTIME_ROOT_UNVERIFIED',
  'RUNTIME_STATE_UNSAFE',
  'GIT_FAILED',
  'INTERNAL_ERROR',
]);

const EXIT_CODES = Object.freeze({
  INVALID_INPUT: 2,
  RUNTIME_ROOT_UNVERIFIED: 3,
  RUNTIME_STATE_UNSAFE: 3,
  GIT_FAILED: 1,
  INTERNAL_ERROR: 1,
});

// The closed set of diagnostic codes a successful resolution can carry.
export const DIAGNOSTIC_CODES = Object.freeze([
  'local-file-not-hidden',
  'ignored-linked-root-file',
  'shadowed-tracked-config',
  'tracked-hidden-ignored',
  'forced-value-override',
  'dead-marker',
  'legacy-marker',
  'marker-divergence',
  'legacy-slug',
  'several-match',
  'candidate-outside-root',
  'transitional-fallback',
  'invalid-source',
  'duplicate-envelope',
  'adr-superseded',
  'legacy-empty-token',
  'ambiguous-key',
  'invalid-value',
  'unrepresentable-row',
  'unknown-tool',
]);

// `details.check` of a RUNTIME_ROOT_UNVERIFIED error.
export const ROOT_CHECKS = Object.freeze([
  'porcelain-failed',
  'missing-path',
  'bare',
  'moved',
  'toplevel-mismatch',
  'common-dir-mismatch',
]);

// `details.reason` of a RUNTIME_STATE_UNSAFE error.
export const UNSAFE_REASONS = Object.freeze([
  'symlink',
  'not-regular-file',
  'escapes-root',
  'unreadable',
  'hidden-file-multiple-envelopes',
  'ambiguous-visibility-row',
  'malformed-visibility-row',
  'unparseable-hidden-declaration',
]);

export const MAX_STDIN_BYTES = 1024 * 1024;

const STATE_DIR = '.effective-flow';
const LOCAL_SETUP_FILE = path.join(STATE_DIR, 'project-setup.md');
const TRANSITIONAL_FILES = Object.freeze([
  path.join(STATE_DIR, 'config.json'),
  path.join('.firmo', 'config.json'),
]);
const CONVENTION_FILES = Object.freeze(['AGENTS.md', 'CLAUDE.md']);
const ADR_DIRECTORIES = Object.freeze([
  path.join('docs', 'adr'),
  path.join('docs', 'decisions'),
  'adr',
]);

const MARKER_PREFIX = '**Effective Flow project setup:**';
const LEGACY_MARKER_PREFIX = '**Firmo project setup:**';
const CURRENT_SLUG = 'effective-flow-project-setup';
const LEGACY_SLUG = 'firmo-project-setup';
const NUMERIC_PREFIX = /^\d+[-_]/;

// The two canonical configuration envelopes: a level-2 heading and the header row of the table
// that follows it. A mixed pair is no envelope.
const ENVELOPES = Object.freeze([
  Object.freeze({
    language: 'en',
    heading: 'Configuration',
    header: Object.freeze(['Key', 'Value']),
  }),
  Object.freeze({
    language: 'de',
    heading: 'Konfiguration',
    header: Object.freeze(['Schlüssel', 'Wert']),
  }),
]);

const FAST_PROFILE_KEY = 'executionProfiles.fast.enabled';
const PR_REVIEW_KEY = 'delivery.prReview';
const PR_REVIEW_VALUES = Object.freeze(['ask', 'always', 'off']);
const VISIBILITY_KEY = 'visibility';
const VISIBILITY_VALUES = Object.freeze(['hidden', 'standard']);

// ---------------------------------------------------------------------------------------------
// Retired rows and successor sets

// Retired rows whose successor is a fixed key. Any key beginning with `prReview.` is retired too;
// its successor is the same trailing key under `mergeGate.` (see `successorOf`).
export const RETIRED_KEYS = Object.freeze({
  'worktree.baseBranch': 'delivery.baseBranch',
  'worktree.branchPrefix': 'delivery.branchPrefix',
  'worktree.completion': 'delivery.completion',
});
const RETIRED_PREFIX = 'prReview.';
const SUCCESSOR_PREFIX = 'mergeGate.';
const LOGIN_KEYED = /^prReview\.bots\.(.+)\.(trigger|check)$/;

const DELIVERY_BASE = 'delivery.baseBranch';
const DELIVERY_PREFIX = 'delivery.branchPrefix';
const DELIVERY_COMPLETION = 'delivery.completion';

// The successors each tool (in a mode, where its set depends on one) resolves at any point of its
// run. `mergeGate.*` stands for every `mergeGate.` key; `<login>` stands for any reviewer login.
// This table is the only source of the per-tool successor sets.
export const SUCCESSOR_SETS = deepFreeze([
  { tool: 'build', mode: null, successors: [DELIVERY_BASE, DELIVERY_PREFIX, DELIVERY_COMPLETION] },
  { tool: 'fix', mode: null, successors: [DELIVERY_BASE, DELIVERY_PREFIX, DELIVERY_COMPLETION] },
  { tool: 'docs', mode: null, successors: [DELIVERY_BASE, DELIVERY_PREFIX, DELIVERY_COMPLETION] },
  {
    tool: 'refactor',
    mode: null,
    successors: [DELIVERY_BASE, DELIVERY_PREFIX, DELIVERY_COMPLETION],
  },
  {
    tool: 'maintain',
    mode: null,
    successors: [DELIVERY_BASE, DELIVERY_PREFIX, DELIVERY_COMPLETION],
  },
  { tool: 'deliver', mode: null, successors: [DELIVERY_BASE, DELIVERY_PREFIX] },
  { tool: 'apply-issues', mode: null, successors: [DELIVERY_BASE, DELIVERY_PREFIX] },
  { tool: 'apply-review', mode: 'remote', successors: [DELIVERY_BASE, DELIVERY_PREFIX] },
  { tool: 'apply-review', mode: 'local', successors: [] },
  { tool: 'pr', mode: null, successors: [DELIVERY_BASE] },
  { tool: 'iterate', mode: 'local', successors: [DELIVERY_BASE] },
  {
    tool: 'iterate',
    mode: 'pr',
    successors: [
      'mergeGate.bots',
      'mergeGate.bots.<login>.trigger',
      'mergeGate.bots.<login>.check',
      'mergeGate.botWaitMinutes',
    ],
  },
  { tool: 'merge-gate', mode: null, successors: ['mergeGate.*'] },
]);

// The repair path: it reads every retired row's raw value and original line to carry it over.
export const RETIRED_EXEMPT_TOOLS = Object.freeze(['setup']);

// Tools whose successor set depends on a mode, with the modes each accepts.
export const MODE_TOOLS = deepFreeze(
  SUCCESSOR_SETS.reduce((modes, entry) => {
    if (entry.mode !== null) (modes[entry.tool] ??= []).push(entry.mode);
    return modes;
  }, {}),
);

// Every tool the successor sets or the exemption name; the build checks each is a real tool.
export const SUCCESSOR_SET_TOOLS = Object.freeze([
  ...new Set([...SUCCESSOR_SETS.map((entry) => entry.tool), ...RETIRED_EXEMPT_TOOLS]),
]);

// Deprecated tool names and the tool each forwards to. A forwarding alias runs its target's source
// verbatim, so it resolves its target's successor set; without this map it would resolve none and
// silently lose the target's retired-row stops. The build checks this map equals its own
// `DEPRECATED_TOOL_ALIASES` in both directions (see `toolAliasDivergence`).
export const TOOL_ALIASES = Object.freeze({
  'pr-review': 'merge-gate',
});

// Compares `TOOL_ALIASES` with the build's declared `{ alias, replacement }` list and returns one
// message per divergence, in either direction; an empty list means the two agree.
export function toolAliasDivergence(declared) {
  const problems = [];
  const declaredMap = new Map();
  for (const { alias, replacement } of declared) {
    if (declaredMap.has(alias)) problems.push(`alias "${alias}" is declared more than once`);
    declaredMap.set(alias, replacement);
  }
  for (const [alias, replacement] of declaredMap) {
    if (!Object.hasOwn(TOOL_ALIASES, alias)) {
      problems.push(`alias "${alias}" → "${replacement}" is missing from TOOL_ALIASES`);
    } else if (TOOL_ALIASES[alias] !== replacement) {
      problems.push(
        `alias "${alias}" forwards to "${replacement}", but TOOL_ALIASES maps it to "${TOOL_ALIASES[alias]}"`,
      );
    }
  }
  for (const [alias, target] of Object.entries(TOOL_ALIASES)) {
    if (!declaredMap.has(alias)) {
      problems.push(
        `TOOL_ALIASES maps "${alias}" → "${target}", but no deprecated alias declares it`,
      );
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Hidden-mode forced values

// Applied only in hidden mode. `delivery.branchPrefix` honours a row unless it names
// `effective-flow` in any letter case; every other key is forced whatever the row says.
export const HIDDEN_FORCED_VALUES = Object.freeze({
  'plan.dir': '.effective-flow/plan',
  'concept.dir': '.effective-flow/concept',
  'tracker.mode': 'local',
  'delivery.prReview': 'off',
  'delivery.branchPrefix': '',
});

// ---------------------------------------------------------------------------------------------
// Errors

export class ConfigResolveError extends Error {
  constructor(code, message, details = {}, options) {
    super(message, options);
    this.name = 'ConfigResolveError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new ConfigResolveError(code, message, details);
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------------------------
// Process runner

// Inherited variables are stripped wholesale: any `GIT_*` variable can redirect git to another
// repository, inject configuration or change discovery. The resolver sets the ones it needs.
export function gitBaseEnv(source = process.env) {
  const env = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    if (value === undefined || key.startsWith('GIT_')) continue;
    env[key] = value;
  }
  env.GIT_OPTIONAL_LOCKS = '0';
  env.GIT_TERMINAL_PROMPT = '0';
  // Untranslated messages keep the "not a git repository" detection locale-independent.
  env.LC_ALL = 'C';
  return env;
}

// Runs one executable without a shell and resolves with Buffers, never rejecting: a spawn failure
// is reported through `error`, and the caller decides what a status means.
export function createProcessRunner() {
  return ({ executable, args = [], cwd, env }) =>
    new Promise((resolve) => {
      let child;
      try {
        child = spawn(executable, args, {
          cwd,
          env,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        resolve({ status: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error });
        return;
      }
      const stdout = [];
      const stderr = [];
      child.stdout.on('data', (chunk) => stdout.push(chunk));
      child.stderr.on('data', (chunk) => stderr.push(chunk));
      child.on('error', (error) =>
        resolve({
          status: null,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
          error,
        }),
      );
      child.on('close', (status) =>
        resolve({ status, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }),
      );
    });
}

function asText(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString('utf8');
  }
  return String(value ?? '');
}

// The one stderr line worth reporting: the first `fatal:` or `error:` line, otherwise the first
// non-empty one.
function errorDetail(stderr) {
  const lines = asText(stderr)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return lines.find((line) => /^(?:fatal|error):/.test(line)) ?? lines[0] ?? '';
}

// Runs `git -C <cwd> <args>` and returns `{ status, stdout, stderr, error }` with text output.
async function runGit(context, cwd, args) {
  const result = await context.runner({
    executable: 'git',
    args: ['-C', cwd, ...args],
    cwd,
    env: context.env,
  });
  return {
    status: result?.status ?? null,
    stdout: asText(result?.stdout),
    stderr: asText(result?.stderr),
    error: result?.error,
  };
}

// A path printed by git: only the one line terminator git appends is removed, so leading and
// trailing whitespace that belongs to the path survives.
function gitPathOutput(stdout) {
  return stdout.replace(/\r?\n$/, '');
}

function gitFailure(args, result) {
  const detail = result.error?.message ?? errorDetail(result.stderr);
  return new ConfigResolveError(
    'GIT_FAILED',
    `git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`,
    { command: `git ${args.join(' ')}` },
  );
}

// ---------------------------------------------------------------------------------------------
// Input validation

const INPUT_KEYS = Object.freeze(['cwd', 'tool', 'mode']);
const STANDARD_ONLY_TOOL = 'setup';
const STANDARD_ONLY_MODE = 'standard';

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('INVALID_INPUT', 'input must be a JSON object');
  }
  for (const key of Object.keys(input)) {
    if (!INPUT_KEYS.includes(key)) fail('INVALID_INPUT', `unknown input field: ${key}`, { key });
  }
  const { cwd, tool: requestedTool, mode } = input;
  if (typeof cwd !== 'string' || cwd === '' || cwd.includes('\0')) {
    fail('INVALID_INPUT', 'cwd must be a non-empty path string', { field: 'cwd' });
  }
  if (!path.isAbsolute(cwd)) {
    fail('INVALID_INPUT', 'cwd must be an absolute path', { field: 'cwd' });
  }
  if (typeof requestedTool !== 'string' || requestedTool.trim() === '') {
    fail('INVALID_INPUT', 'tool must be a non-empty string naming the calling tool', {
      field: 'tool',
    });
  }
  // A deprecated alias resolves exactly as the tool it forwards to, mode rules included.
  const tool = Object.hasOwn(TOOL_ALIASES, requestedTool)
    ? TOOL_ALIASES[requestedTool]
    : requestedTool;
  const modes = Object.hasOwn(MODE_TOOLS, tool) ? MODE_TOOLS[tool] : null;
  if (modes && !modes.includes(mode)) {
    fail('INVALID_INPUT', `mode must be one of ${modes.join('|')} for tool ${tool}`, {
      field: 'mode',
      tool,
      allowed: [...modes],
    });
  }
  // Setup's switch from hidden to standard mode resolves the tracked configuration it is about to
  // write through steps 1 to 4 only; `standard` is the one mode setup accepts.
  if (tool === STANDARD_ONLY_TOOL && mode !== undefined) {
    if (mode !== STANDARD_ONLY_MODE) {
      fail('INVALID_INPUT', `mode must be ${STANDARD_ONLY_MODE} or absent for tool ${tool}`, {
        field: 'mode',
        tool,
        allowed: [STANDARD_ONLY_MODE],
      });
    }
    return { cwd, tool, mode };
  }
  // A mode supplied for any other tool is ignored, not an error.
  return { cwd, tool, mode: modes ? mode : null };
}

// ---------------------------------------------------------------------------------------------
// Filesystem containment

function isStrictlyBelow(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function realDirectory(context, value) {
  try {
    const canonical = await context.fs.realpath(value);
    if (!(await context.fs.stat(canonical)).isDirectory()) return null;
    return canonical;
  } catch {
    return null;
  }
}

// Read-only open that refuses a symlink as the final path component.
// O_NONBLOCK keeps a FIFO swapped in after the lstat check from blocking the open, so the handle's
// isFile check below rejects it instead of hanging the run.
const READ_NO_FOLLOW =
  nodeFs.constants.O_RDONLY | nodeFs.constants.O_NOFOLLOW | (nodeFs.constants.O_NONBLOCK ?? 0);

// A runtime-state file below the verified runtime-state root (steps 0 and 3). Absent returns
// null; anything unsafe or unreadable stops the run, because falling through could drop a hidden
// configuration into standard mode.
async function readRuntimeStateFile(context, root, relative, step) {
  const target = path.join(root, relative);
  const unsafe = (reason, message) =>
    fail('RUNTIME_STATE_UNSAFE', `${target}: ${message}`, { step, path: target, reason });
  let info;
  try {
    info = await context.fs.lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    unsafe('unreadable', `cannot inspect (${error?.code ?? error?.message})`);
  }
  if (info.isSymbolicLink()) unsafe('symlink', 'is a symlink');
  if (!info.isFile()) unsafe('not-regular-file', 'is not a regular file');
  let canonical;
  try {
    canonical = await context.fs.realpath(target);
  } catch (error) {
    unsafe('unreadable', `cannot canonicalize (${error?.code ?? error?.message})`);
  }
  if (!isStrictlyBelow(root, canonical)) unsafe('escapes-root', `resolves outside ${root}`);
  // Read the verified canonical path itself, never `target` again: `O_NOFOLLOW` refuses a final
  // component swapped for a symlink after the checks above, and the opened handle must still be a
  // regular file before anything is read from it.
  let handle;
  try {
    handle = await context.fs.open(canonical, READ_NO_FOLLOW);
  } catch (error) {
    if (error?.code === 'ELOOP') unsafe('symlink', 'is a symlink');
    unsafe('unreadable', `cannot open (${error?.code ?? error?.message})`);
  }
  try {
    let opened;
    try {
      opened = await handle.stat();
    } catch (error) {
      unsafe('unreadable', `cannot inspect (${error?.code ?? error?.message})`);
    }
    if (!opened.isFile()) unsafe('not-regular-file', 'is not a regular file');
    try {
      return { path: target, text: await handle.readFile('utf8') };
    } catch (error) {
      unsafe('unreadable', `cannot read (${error?.code ?? error?.message})`);
    }
  } finally {
    await handle.close().catch(() => {});
  }
  return null;
}

// A tracked file below the checkout root (steps 1 and 2). Returns `{ path, text }`, or
// `{ absent: reason }` with reason `missing`, `not-regular-file`, `outside-root` or `unreadable`.
// Symlinks that stay inside the root are followed.
async function readContainedFile(context, root, target) {
  let canonical;
  try {
    canonical = await context.fs.realpath(target);
  } catch {
    return { absent: 'missing' };
  }
  if (!isStrictlyBelow(root, canonical)) return { absent: 'outside-root' };
  try {
    if (!(await context.fs.stat(canonical)).isFile()) return { absent: 'not-regular-file' };
    return { path: target, text: await context.fs.readFile(canonical, 'utf8') };
  } catch {
    return { absent: 'unreadable' };
  }
}

async function exists(context, target) {
  try {
    await context.fs.lstat(target);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Markdown parsing

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*$/;
const COMMENT_OPEN = /^[ \t]*<!--/;
const TABLE_SEPARATOR = /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/;

// Splits text into lines and marks each one inactive that lies inside (or opens/closes) a fenced
// code block or an HTML comment that starts a line. Tolerates a UTF-8 BOM and CRLF line endings.
function scanLines(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const result = [];
  let fence = null;
  let comment = false;
  for (const line of lines) {
    if (fence) {
      const close = line.match(FENCE_OPEN);
      if (
        close &&
        close[1][0] === fence[0] &&
        close[1].length >= fence.length &&
        line.trim() === close[1]
      ) {
        fence = null;
      }
      result.push({ text: line, inactive: true });
      continue;
    }
    if (comment) {
      if (line.includes('-->')) comment = false;
      result.push({ text: line, inactive: true });
      continue;
    }
    const open = line.match(FENCE_OPEN);
    if (open) {
      fence = open[1];
      result.push({ text: line, inactive: true });
      continue;
    }
    const commentOpen = line.match(COMMENT_OPEN);
    if (commentOpen) {
      comment = !line.includes('-->', commentOpen[0].length - 2);
      result.push({ text: line, inactive: true });
      continue;
    }
    result.push({ text: line, inactive: false });
  }
  return result;
}

function headingOf(line) {
  if (line.inactive) return null;
  const match = line.text.match(HEADING);
  return match ? { level: match[1].length, title: match[2] } : null;
}

// Ends a section: the next level-1 or level-2 heading.
function isSectionBoundary(line) {
  const heading = headingOf(line);
  return heading !== null && heading.level <= 2;
}

function isTableLine(line) {
  return !line.inactive && line.text.trim().startsWith('|');
}

// Splits one table row into trimmed cells; `\|` is a literal pipe.
export function splitTableRow(text) {
  let row = text.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  return row.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, '|').trim());
}

// Reads the table that follows a canonical heading at `start`: the first table before the next
// level-1/2 heading. Returns its rows when its header matches the envelope, otherwise null. Each
// row keeps its exact original `line` (and a non-enumerable line `index`); an empty-key row is kept
// with `key: ''`.
function readEnvelopeTable(lines, start, envelope) {
  let index = start + 1;
  while (index < lines.length && !isSectionBoundary(lines[index]) && !isTableLine(lines[index])) {
    index += 1;
  }
  if (index >= lines.length || !isTableLine(lines[index])) return null;
  const header = splitTableRow(lines[index].text);
  const separator = lines[index + 1];
  if (
    header.length !== envelope.header.length ||
    header.some((cell, position) => cell !== envelope.header[position]) ||
    !separator ||
    !isTableLine(separator) ||
    !TABLE_SEPARATOR.test(separator.text.trim())
  ) {
    return null;
  }
  const rows = [];
  for (index += 2; index < lines.length && isTableLine(lines[index]); index += 1) {
    const cells = splitTableRow(lines[index].text);
    const key = cells[0] ?? '';
    const row = {
      key,
      raw: cells.length === 2 ? cells[1] : null,
      cellCount: cells.length,
      line: lines[index].text,
    };
    // Internal only: non-enumerable, so no serialized or compared row ever carries them.
    Object.defineProperty(row, 'index', { value: index });
    Object.defineProperty(row, 'active', { value: !lines[index].inactive });
    rows.push(row);
  }
  return rows;
}

// A hidden declaration candidate is any raw line naming both tokens `visibility` and `hidden`
// (case-insensitive, word-bounded); the line is not parsed. The scan covers every line, fenced code
// and HTML comments included (also the text after a closing `-->`). A prose mention such as
// "visibility: hidden would be set by setup" is deliberately a candidate: the step-0 file is
// setup-written and machine-only, so such a line is a declaration the parser cannot prove. The one
// exemption, applied by `locateHidden`: an active (not commented or fenced) well-formed two-cell row
// of a parsed envelope whose non-empty key is not `visibility` (any case; matched by line index) is
// ordinary configuration, not a candidate.
// Everything else stays a candidate, including every visibility row of any shape.
const HIDDEN_CANDIDATE_TOKENS = Object.freeze([/\bvisibility\b/i, /\bhidden\b/i]);

// Parses a configuration document: the first canonical envelope (and how many there are), every
// parsed envelope in document order, the line indices of every line naming both hidden tokens
// (before the ordinary-row exemption), and whether a `## Status` section marks the record as
// superseded. Envelopes and status ignore fenced code and HTML comments; hidden candidates do not.
export function parseConfigurationDocument(text) {
  const lines = scanLines(text);
  const hiddenCandidates = [];
  lines.forEach((line, index) => {
    if (HIDDEN_CANDIDATE_TOKENS.every((token) => token.test(line.text))) {
      hiddenCandidates.push(index);
    }
  });
  const envelopes = [];
  let superseded = false;
  for (let index = 0; index < lines.length; index += 1) {
    const heading = headingOf(lines[index]);
    if (!heading || heading.level !== 2) continue;
    if (heading.title === 'Status') {
      for (
        let next = index + 1;
        next < lines.length && !isSectionBoundary(lines[next]);
        next += 1
      ) {
        if (!lines[next].inactive && /Superseded|Abgelöst/.test(lines[next].text))
          superseded = true;
      }
      continue;
    }
    const envelope = ENVELOPES.find((candidate) => candidate.heading === heading.title);
    if (!envelope) continue;
    const rows = readEnvelopeTable(lines, index, envelope);
    if (rows) envelopes.push({ language: envelope.language, rows });
  }
  return {
    envelope: envelopes[0] ?? null,
    envelopeCount: envelopes.length,
    envelopes,
    hiddenCandidates,
    superseded,
  };
}

// Reads every setup marker outside fenced code and HTML comments: `{ path, legacy }` in document
// order.
export function parseSetupMarkers(text) {
  const markers = [];
  for (const line of scanLines(text)) {
    if (line.inactive) continue;
    const trimmed = line.text.trim();
    const legacy = trimmed.startsWith(LEGACY_MARKER_PREFIX);
    if (!legacy && !trimmed.startsWith(MARKER_PREFIX)) continue;
    let target = trimmed.slice((legacy ? LEGACY_MARKER_PREFIX : MARKER_PREFIX).length).trim();
    const link = target.match(/^\[[^\]]*\]\(([^)\s]+)\)/);
    if (link) target = link[1];
    else {
      const quoted = target.match(/^`([^`]+)`$/);
      if (quoted) target = quoted[1].trim();
    }
    if (target !== '') markers.push({ path: target, legacy });
  }
  return markers;
}

// ---------------------------------------------------------------------------------------------
// Value decoding

function itemsOf(raw) {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

// Decodes one table cell. `(leer)` is the legacy German empty-list token.
export function decodeCell(raw) {
  if (raw === 'true') return { value: true, items: ['true'] };
  if (raw === 'false') return { value: false, items: ['false'] };
  if (raw === 'null') return { value: null, items: [] };
  if (raw === '(empty)' || raw === '(leer)') return { value: [], items: [] };
  return { value: raw, items: itemsOf(raw) };
}

// Flattens a transitional JSON configuration into table-shaped rows with dotted keys; an empty key
// at any depth yields no value row from its subtree, only `{ key: '', raw: null, pointer }` per
// empty key in it (RFC 6901 JSON Pointer), which the resolver reports as unrepresentable.
export function flattenJsonConfiguration(root) {
  const rows = [];
  const pointerOf = (segments) =>
    `/${segments.map((segment) => segment.replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`;
  const visit = (value, segments, unrepresentable) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) {
        const path = [...segments, key];
        if (key === '') rows.push({ key: '', raw: null, pointer: pointerOf(path) });
        visit(child, path, unrepresentable || key === '');
      }
      return;
    }
    if (segments.length === 0 || unrepresentable) return;
    const prefix = segments.join('.');
    if (Array.isArray(value)) {
      const items = value.map((item) =>
        item !== null && typeof item === 'object' ? JSON.stringify(item) : String(item),
      );
      rows.push({
        key: prefix,
        raw: items.length === 0 ? '(empty)' : items.join(', '),
        decoded: { value: items, items },
      });
    } else if (value === null) {
      rows.push({ key: prefix, raw: 'null', decoded: { value: null, items: [] } });
    } else if (typeof value === 'boolean') {
      rows.push({ key: prefix, raw: String(value), decoded: { value, items: [String(value)] } });
    } else {
      const raw = String(value);
      rows.push({ key: prefix, raw, decoded: { value: raw, items: itemsOf(raw) } });
    }
  };
  visit(root, [], false);
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Root resolution

const NOT_A_REPOSITORY = /fatal: not a git repository \(or any /;

// Resolves the checkout root of `cwd` and, inside Git, the verified runtime-state root: the first
// record of `git worktree list --porcelain -z`, checked against its own toplevel and common dir.
// Any failed check stops the run; nothing falls back to `cwd` or the checkout root.
async function resolveRoots(context, cwd) {
  const toplevelArgs = ['rev-parse', '--show-toplevel'];
  const toplevel = await runGit(context, cwd, toplevelArgs);
  if (toplevel.error) throw gitFailure(toplevelArgs, toplevel);
  if (toplevel.status !== 0) {
    if (NOT_A_REPOSITORY.test(toplevel.stderr)) {
      return { git: false, checkoutRoot: cwd, runtimeStateRoot: null };
    }
    throw gitFailure(toplevelArgs, toplevel);
  }
  const checkoutRoot = await realDirectory(context, gitPathOutput(toplevel.stdout));
  if (!checkoutRoot) {
    fail(
      'GIT_FAILED',
      `git reported a toplevel that is not a directory: ${toplevel.stdout.trim()}`,
    );
  }
  const commonArgs = ['rev-parse', '--path-format=absolute', '--git-common-dir'];
  const common = await runGit(context, cwd, commonArgs);
  if (common.error || common.status !== 0) throw gitFailure(commonArgs, common);
  const commonDir = await realDirectory(context, gitPathOutput(common.stdout));
  if (!commonDir) {
    fail(
      'GIT_FAILED',
      `git reported a common dir that is not a directory: ${common.stdout.trim()}`,
    );
  }

  const unverified = (check, message, details = {}) =>
    fail('RUNTIME_ROOT_UNVERIFIED', `runtime-state root unverified (${check}): ${message}`, {
      check,
      ...details,
    });
  const listArgs = ['worktree', 'list', '--porcelain', '-z'];
  const list = await runGit(context, cwd, listArgs);
  if (list.error || list.status !== 0) {
    unverified('porcelain-failed', errorDetail(list.stderr) || list.error?.message || 'failed');
  }
  // NUL-delimited fields keep a path literal, newlines and trailing whitespace included; an empty
  // field ends the record.
  const record = [];
  for (const field of list.stdout.split('\0')) {
    if (field === '') {
      if (record.length > 0) break;
      continue;
    }
    record.push(field);
  }
  const pathFields = record.filter(
    (field) => field === 'worktree' || field.startsWith('worktree '),
  );
  const recordPath = pathFields.length === 1 ? pathFields[0].slice('worktree '.length) : '';
  if (record.length === 0 || recordPath === '' || !record[0].startsWith('worktree ')) {
    unverified('missing-path', 'the first worktree record has no single non-empty path');
  }
  if (record.includes('bare')) {
    unverified('bare', `the first worktree record is bare: ${recordPath}`, { path: recordPath });
  }
  const runtimeStateRoot = await realDirectory(context, recordPath);
  if (!runtimeStateRoot) {
    unverified('moved', `the main checkout no longer exists as a directory: ${recordPath}`, {
      path: recordPath,
    });
  }
  const mainToplevel = await runGit(context, runtimeStateRoot, toplevelArgs);
  const mainToplevelPath =
    mainToplevel.error || mainToplevel.status !== 0
      ? null
      : await realDirectory(context, gitPathOutput(mainToplevel.stdout));
  if (mainToplevelPath !== runtimeStateRoot) {
    unverified('toplevel-mismatch', `${runtimeStateRoot} is not its own checkout toplevel`, {
      path: runtimeStateRoot,
    });
  }
  const mainCommon = await runGit(context, runtimeStateRoot, commonArgs);
  const mainCommonDir =
    mainCommon.error || mainCommon.status !== 0
      ? null
      : await realDirectory(context, gitPathOutput(mainCommon.stdout));
  if (mainCommonDir !== commonDir) {
    unverified('common-dir-mismatch', `${runtimeStateRoot} belongs to another repository`, {
      path: runtimeStateRoot,
    });
  }
  return { git: true, checkoutRoot, runtimeStateRoot };
}

// ---------------------------------------------------------------------------------------------
// Locator step 0: local hidden configuration

function hasHiddenRow(rows) {
  return rows.some((row) => row.key === VISIBILITY_KEY && row.raw === 'hidden');
}

async function locateHidden(context, roots, diagnostics) {
  const file = await readRuntimeStateFile(context, roots.runtimeStateRoot, LOCAL_SETUP_FILE, 0);
  if (!file) return null;
  const document = parseConfigurationDocument(file.text);
  const hidden = document.envelopes.some((envelope) => hasHiddenRow(envelope.rows));
  if (hidden && document.envelopeCount > 1) {
    fail(
      'RUNTIME_STATE_UNSAFE',
      `${file.path}: declares hidden mode but carries ${document.envelopeCount} configuration envelopes`,
      { step: 0, path: file.path, reason: 'hidden-file-multiple-envelopes' },
    );
  }
  // An ambiguous or malformed visibility row leaves the file's intent unprovable: stop, never fall through.
  const visibilityRows = document.envelopes.flatMap((envelope) =>
    envelope.rows.filter((row) => row.key === VISIBILITY_KEY),
  );
  if (visibilityRows.length > 1) {
    fail(
      'RUNTIME_STATE_UNSAFE',
      `${file.path}: declares ${visibilityRows.length} visibility rows`,
      {
        step: 0,
        path: file.path,
        reason: 'ambiguous-visibility-row',
      },
    );
  }
  if (visibilityRows.length === 1 && visibilityRows[0].raw === null) {
    fail(
      'RUNTIME_STATE_UNSAFE',
      `${file.path}: has a visibility row with ${visibilityRows[0].cellCount} cells instead of 2`,
      { step: 0, path: file.path, reason: 'malformed-visibility-row' },
    );
  }
  // Hidden detection must not depend on successful parsing: any candidate line other than the one
  // well-formed `visibility | hidden` row of the one envelope (matched by line index) stops. The
  // candidate scan covers every line, comments and fences included; only an active, well-formed
  // envelope row whose non-empty key is not `visibility` (any case) is exempt.
  const ordinary = new Set(
    document.envelopes
      .flatMap((envelope) => envelope.rows)
      .filter(
        (row) =>
          row.active &&
          row.raw !== null &&
          row.key !== '' &&
          row.key.toLowerCase() !== VISIBILITY_KEY,
      )
      .map((row) => row.index),
  );
  const candidates = document.hiddenCandidates.filter((index) => !ordinary.has(index));
  const proven =
    document.envelopeCount === 1 &&
    visibilityRows.length === 1 &&
    visibilityRows[0].raw === 'hidden' &&
    candidates.every((index) => index === visibilityRows[0].index);
  if (candidates.length > 0 && !proven) {
    fail(
      'RUNTIME_STATE_UNSAFE',
      `${file.path}: visibly declares hidden mode in a form the parser cannot prove`,
      { step: 0, path: file.path, reason: 'unparseable-hidden-declaration' },
    );
  }
  if (!hidden) {
    diagnostics.push({ code: 'local-file-not-hidden', path: file.path });
    return null;
  }
  return { step: 0, path: file.path, document, source: 'local-hidden' };
}

// Same-named runtime-state files below a linked checkout root are never configuration.
async function reportLinkedRootFiles(context, roots, diagnostics) {
  if (!roots.git || roots.checkoutRoot === roots.runtimeStateRoot) return;
  for (const relative of [LOCAL_SETUP_FILE, ...TRANSITIONAL_FILES]) {
    const target = path.join(roots.checkoutRoot, relative);
    if (await exists(context, target)) {
      diagnostics.push({ code: 'ignored-linked-root-file', path: target });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Locator step 1: setup marker

async function locateByMarker(context, checkoutRoot, diagnostics) {
  const found = [];
  for (const name of CONVENTION_FILES) {
    const file = await readContainedFile(context, checkoutRoot, path.join(checkoutRoot, name));
    if (file.absent) continue;
    for (const marker of parseSetupMarkers(file.text)) found.push({ ...marker, markerFile: name });
  }
  if (found.length === 0) return null;
  const [winner] = found;
  const distinct = [...new Set(found.map((marker) => marker.path))];
  if (distinct.length > 1) diagnostics.push({ code: 'marker-divergence', paths: distinct });
  const markerFile = path.join(checkoutRoot, winner.markerFile);
  if (winner.legacy) diagnostics.push({ code: 'legacy-marker', markerFile });
  const target = path.resolve(checkoutRoot, winner.path);
  const file = await readContainedFile(context, checkoutRoot, target);
  let reason = file.absent === 'unreadable' ? 'missing' : file.absent;
  let document = null;
  if (!reason) {
    document = parseConfigurationDocument(file.text);
    if (!document.envelope) reason = 'no-envelope';
  }
  if (reason) {
    diagnostics.push({ code: 'dead-marker', markerFile, path: target, reason });
    return null;
  }
  return { step: 1, path: target, document, source: 'adr', legacyMarker: winner.legacy };
}

// ---------------------------------------------------------------------------------------------
// Locator step 2: ADR directory scan

// The stem tolerance: one optional numeric prefix, and the legacy slug beside the current one.
export function classifySetupStem(fileName) {
  if (!fileName.endsWith('.md')) return null;
  const stem = fileName.slice(0, -'.md'.length);
  const prefixed = NUMERIC_PREFIX.test(stem);
  const slug = stem.replace(NUMERIC_PREFIX, '');
  if (slug === CURRENT_SLUG) return { legacySlug: false, prefixed };
  if (slug === LEGACY_SLUG) return { legacySlug: true, prefixed };
  return null;
}

// One ordered comparison: the current slug before the legacy slug, and only within one slug an
// unprefixed stem before a prefixed one.
export function compareSetupCandidates(left, right) {
  if (left.legacySlug !== right.legacySlug) return left.legacySlug ? 1 : -1;
  if (left.prefixed !== right.prefixed) return left.prefixed ? 1 : -1;
  return 0;
}

async function adrDirectory(context, checkoutRoot) {
  for (const relative of ADR_DIRECTORIES) {
    const candidate = await realDirectory(context, path.join(checkoutRoot, relative));
    if (candidate && isStrictlyBelow(checkoutRoot, candidate)) {
      return path.join(checkoutRoot, relative);
    }
  }
  return null;
}

async function locateByScan(context, checkoutRoot, diagnostics) {
  const directory = await adrDirectory(context, checkoutRoot);
  if (!directory) return null;
  let names;
  try {
    names = (await context.fs.readdir(directory)).map(String).sort();
  } catch {
    return null;
  }
  const matches = [];
  for (const name of names) {
    const stem = classifySetupStem(name);
    if (!stem) continue;
    const target = path.join(directory, name);
    const file = await readContainedFile(context, checkoutRoot, target);
    if (file.absent === 'outside-root') {
      diagnostics.push({ code: 'candidate-outside-root', path: target });
      continue;
    }
    if (file.absent) continue;
    const document = parseConfigurationDocument(file.text);
    if (!document.envelope) continue;
    matches.push({ ...stem, path: target, document });
  }
  if (matches.length === 0) return null;
  const ranked = [...matches].sort(compareSetupCandidates);
  const top = ranked.filter((match) => compareSetupCandidates(match, ranked[0]) === 0);
  if (top.length > 1) {
    diagnostics.push({
      code: 'several-match',
      paths: matches.map((match) => match.path).sort(),
      writerStop: true,
    });
    return null;
  }
  const [winner] = top;
  if (winner.legacySlug) diagnostics.push({ code: 'legacy-slug', path: winner.path });
  return {
    step: 2,
    path: winner.path,
    document: winner.document,
    source: 'adr',
    legacySlug: winner.legacySlug,
    prefixed: winner.prefixed,
  };
}

// ---------------------------------------------------------------------------------------------
// Locator step 3: transitional JSON

async function locateTransitional(context, runtimeStateRoot, diagnostics) {
  for (const relative of TRANSITIONAL_FILES) {
    const file = await readRuntimeStateFile(context, runtimeStateRoot, relative, 3);
    if (!file) continue;
    let parsed;
    try {
      parsed = JSON.parse(file.text);
    } catch (error) {
      diagnostics.push({
        code: 'invalid-source',
        step: 3,
        path: file.path,
        reason: `invalid JSON: ${error.message}`,
      });
      return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      diagnostics.push({
        code: 'invalid-source',
        step: 3,
        path: file.path,
        reason: 'the JSON root is not an object',
      });
      return null;
    }
    diagnostics.push({ code: 'transitional-fallback', path: file.path });
    return {
      step: 3,
      path: file.path,
      rows: flattenJsonConfiguration(parsed),
      source: 'transitional-json',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Values

function isRetiredKey(key) {
  return Object.hasOwn(RETIRED_KEYS, key) || key.startsWith(RETIRED_PREFIX);
}

export function successorOf(key) {
  if (Object.hasOwn(RETIRED_KEYS, key)) return RETIRED_KEYS[key];
  if (key.startsWith(RETIRED_PREFIX))
    return `${SUCCESSOR_PREFIX}${key.slice(RETIRED_PREFIX.length)}`;
  return null;
}

// Trims exactly one trailing `[bot]`.
export function normalizeLogin(login) {
  return login.endsWith('[bot]') ? login.slice(0, -'[bot]'.length) : login;
}

function rowDecoding(row) {
  if (row.decoded) return row.decoded;
  return decodeCell(row.raw);
}

// Defines an own enumerable entry, so a configuration key such as `__proto__` never reaches a
// prototype setter.
function setOwn(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

// Validates every key structurally, `visibility` and retired keys included: two or more rows of
// one key are ambiguous and no row is chosen, a single row with the wrong cell count is invalid.
// Returns `values` for every non-retired key except `visibility` and `retired`, which maps each
// retired key in first-occurrence order to its single well-formed row, or to null when the key is
// invalid. Empty-key rows must already be removed by the caller.
function buildValues(rows, source, diagnostics) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.key)) grouped.set(row.key, []);
    grouped.get(row.key).push(row);
  }
  const values = {};
  const retired = new Map();
  for (const [key, keyRows] of grouped) {
    const isRetired = isRetiredKey(key);
    const [row] = keyRows;
    let invalid = true;
    if (keyRows.length > 1) {
      diagnostics.push({ code: 'ambiguous-key', key, count: keyRows.length });
    } else if (row.raw === null) {
      diagnostics.push({ code: 'invalid-value', key, raw: null, reason: 'cell-count' });
    } else {
      invalid = false;
    }
    if (key === VISIBILITY_KEY) continue;
    if (isRetired) {
      retired.set(key, invalid ? null : row);
      continue;
    }
    if (invalid) {
      setOwn(values, key, { state: 'invalid', value: null, raw: null, items: [], source });
      continue;
    }
    if (row.raw === '(leer)' && !row.decoded) diagnostics.push({ code: 'legacy-empty-token', key });
    const { value, items } = rowDecoding(row);
    setOwn(values, key, { state: 'set', value, raw: row.raw, items, source });
  }
  return { values, retired };
}

// The strict Boolean of a set fast-flag entry: `true`, `false`, or null when it is neither. A table
// cell counts only as the exact raw `true`/`false`; a transitional JSON value counts only as a JSON
// Boolean, so a JSON string "true" or a one-item list `[true]` (both flattened to raw `true`) is
// invalid rather than enabled.
function strictBoolean(entry) {
  if (entry.source === 'transitional-json') {
    return typeof entry.value === 'boolean' ? entry.value : null;
  }
  if (entry.raw === 'true') return true;
  if (entry.raw === 'false') return false;
  return null;
}

// The keys whose rules this resolver owns. No other key is validated here.
function validateOwnedKeys(values, rows, diagnostics) {
  const fast = values[FAST_PROFILE_KEY];
  const flag = fast?.state === 'set' ? strictBoolean(fast) : null;
  if (!fast) values[FAST_PROFILE_KEY] = { state: 'unset', profile: 'disabled' };
  else if (flag === true) fast.profile = 'enabled';
  else if (flag === false) fast.profile = 'disabled';
  else {
    if (fast.state === 'set') {
      diagnostics.push({ code: 'invalid-value', key: FAST_PROFILE_KEY, raw: fast.raw });
    }
    Object.assign(fast, { state: 'invalid', value: null, items: [], profile: 'invalid' });
  }

  const prReview = values[PR_REVIEW_KEY];
  if (!prReview) values[PR_REVIEW_KEY] = { state: 'unset' };
  else if (prReview.state === 'set' && !PR_REVIEW_VALUES.includes(prReview.raw)) {
    diagnostics.push({ code: 'invalid-value', key: PR_REVIEW_KEY, raw: prReview.raw });
    Object.assign(prReview, { state: 'invalid', value: null, items: [] });
  }

  // The structural `visibility` diagnostics come from `buildValues`; only the domain check is here.
  for (const row of rows) {
    if (row.key !== VISIBILITY_KEY || row.raw === null) continue;
    if (!VISIBILITY_VALUES.includes(row.raw)) {
      diagnostics.push({ code: 'invalid-value', key: VISIBILITY_KEY, raw: row.raw });
    }
  }
}

function forcedEntry(value) {
  return { state: 'set', value, raw: value, items: itemsOf(value), source: 'forced' };
}

// Hidden mode: the forced values win. A contradicting row is reported once per key; a missing row
// takes the forced value silently. `delivery.branchPrefix` keeps a row that does not name
// `effective-flow`.
function applyForcedValues(values, diagnostics) {
  for (const [key, forced] of Object.entries(HIDDEN_FORCED_VALUES)) {
    const current = values[key];
    const present = current && current.state !== 'unset';
    if (
      key === 'delivery.branchPrefix' &&
      present &&
      current.state === 'set' &&
      !/effective-flow/i.test(current.raw)
    ) {
      continue;
    }
    if (present && !(current.state === 'set' && current.raw === forced)) {
      diagnostics.push({ code: 'forced-value-override', key, raw: current.raw, forced });
    }
    values[key] = forcedEntry(forced);
  }
}

// ---------------------------------------------------------------------------------------------
// Retired rows

function successorSetFor(tool, mode) {
  if (RETIRED_EXEMPT_TOOLS.includes(tool)) return { exempt: true, successors: [] };
  const entry = SUCCESSOR_SETS.find(
    (candidate) => candidate.tool === tool && (candidate.mode === null || candidate.mode === mode),
  );
  return entry ? { exempt: false, successors: entry.successors } : null;
}

function successorPattern(pattern) {
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -1);
    return (key) => key.startsWith(prefix);
  }
  if (pattern.includes('<login>')) {
    const [before, after] = pattern.split('<login>');
    return (key) =>
      key.startsWith(before) && key.endsWith(after) && key.length > before.length + after.length;
  }
  return (key) => key === pattern;
}

function inSuccessorSet(successors, key) {
  return successors.some((pattern) => successorPattern(pattern)(key));
}

function successorPresent(rows, successor, login) {
  if (login === null) return rows.some((row) => row.key === successor);
  const sub = successor.slice(successor.lastIndexOf('.') + 1);
  const wanted = normalizeLogin(login);
  return rows.some((row) => {
    const match = row.key.match(/^mergeGate\.bots\.(.+)\.(trigger|check)$/);
    return match !== null && match[2] === sub && normalizeLogin(match[1]) === wanted;
  });
}

// One entry per retired key of the resolved source, in first-occurrence order, with the calling
// tool's action. `retiredKeys` maps each retired key to its single well-formed row, or to null when
// `buildValues` found it invalid. An invalid retired key keeps the action a well-formed one gets:
// the action depends only on the successor, never on the row's value, so invalidity can never
// downgrade a stop to none. The structural diagnostic is reported to every tool; setup receives
// `state: 'invalid'` with no raw value, so it takes its invalid-source path instead of migrating
// the row. Setup also receives the row's original `line` (null for an invalid key or a JSON source)
// so its migration rewrites only the key cell.
function classifyRetiredRows(rows, retiredKeys, tool, mode, diagnostics) {
  const set = successorSetFor(tool, mode);
  if (!set) diagnostics.push({ code: 'unknown-tool', tool });
  const retired = [];
  for (const [key, row] of retiredKeys) {
    const successor = successorOf(key);
    const loginMatch = key.match(LOGIN_KEYED);
    const login = loginMatch ? loginMatch[1] : null;
    const present = successorPresent(rows, successor, login);
    let action = 'none';
    if (set?.exempt) action = 'none';
    else if (tool === 'deliver' && key === 'worktree.completion') action = 'report';
    else if (set && inSuccessorSet(set.successors, successor)) action = present ? 'report' : 'stop';
    const entry = { key, successor, successorPresent: present, action };
    if (row === null) entry.state = 'invalid';
    if (set?.exempt) {
      entry.raw = row === null ? null : row.raw;
      entry.line = row === null ? null : (row.line ?? null);
    }
    if (login !== null) {
      entry.conditional = 'reviewer-resolved';
      entry.login = login;
      entry.normalizedLogin = normalizeLogin(login);
    }
    retired.push(entry);
  }
  return retired;
}

// ---------------------------------------------------------------------------------------------
// Resolution

function makeContext(deps) {
  return {
    runner: deps.runner ?? createProcessRunner(),
    env: gitBaseEnv(deps.env ?? process.env),
    fs: deps.fs ?? nodeFs,
  };
}

function documentDiagnostics(located, diagnostics) {
  const { document } = located;
  if (!document) return;
  if (document.envelopeCount > 1)
    diagnostics.push({ code: 'duplicate-envelope', path: located.path });
  if (document.superseded) diagnostics.push({ code: 'adr-superseded', path: located.path });
}

export async function resolveConfiguration(input, deps = {}) {
  const { cwd: cwdInput, tool, mode } = validateInput(input);
  const context = makeContext(deps);
  const cwd = await realDirectory(context, cwdInput);
  if (!cwd) fail('INVALID_INPUT', 'cwd must be an existing directory', { field: 'cwd' });
  const roots = await resolveRoots(context, cwd);
  const diagnostics = [];

  const standardOnly = tool === STANDARD_ONLY_TOOL && mode === STANDARD_ONLY_MODE;
  let located = roots.git && !standardOnly ? await locateHidden(context, roots, diagnostics) : null;
  await reportLinkedRootFiles(context, roots, diagnostics);
  const hidden = located !== null;

  if (hidden) {
    // A tracked configuration that would resolve is named once as shadowed and never read.
    const ignored = [];
    const tracked =
      (await locateByMarker(context, roots.checkoutRoot, ignored)) ??
      (await locateByScan(context, roots.checkoutRoot, ignored));
    if (tracked) diagnostics.push({ code: 'shadowed-tracked-config', path: tracked.path });
  } else {
    located =
      (await locateByMarker(context, roots.checkoutRoot, diagnostics)) ??
      (await locateByScan(context, roots.checkoutRoot, diagnostics));
    if (!located && roots.git) {
      located = await locateTransitional(context, roots.runtimeStateRoot, diagnostics);
    }
  }

  const allRows = located ? (located.rows ?? located.document.envelope.rows) : [];
  if (located) documentDiagnostics(located, diagnostics);
  // An empty-key row cannot become a value or a retired entry; it is reported (a table row by its
  // line and kept only in `source.rows`, a JSON one by its pointer), and every other check sees
  // the representable rows alone.
  for (const row of allRows) {
    if (row.key === '') {
      diagnostics.push(
        row.pointer === undefined
          ? { code: 'unrepresentable-row', reason: 'empty-key', line: row.line }
          : {
              code: 'unrepresentable-row',
              reason: 'empty-key',
              source: 'json',
              pointer: row.pointer,
            },
      );
    }
  }
  const rows = allRows.filter((row) => row.key !== '');
  if (!hidden && rows.some((row) => row.key === VISIBILITY_KEY && row.raw === 'hidden')) {
    diagnostics.push({ code: 'tracked-hidden-ignored', path: located.path });
  }
  const { values, retired: retiredKeys } = buildValues(rows, located?.source ?? null, diagnostics);
  validateOwnedKeys(values, rows, diagnostics);
  if (hidden) applyForcedValues(values, diagnostics);
  const retired = classifyRetiredRows(rows, retiredKeys, tool, mode, diagnostics);

  return {
    runtimeStateRoot: roots.runtimeStateRoot,
    checkoutRoot: roots.checkoutRoot,
    visibility: hidden ? 'hidden' : 'standard',
    source: {
      step: located?.step ?? 4,
      path: located?.path ?? null,
      language: located?.document?.envelope?.language ?? null,
      legacyMarker: located?.legacyMarker ?? false,
      legacySlug: located?.legacySlug ?? false,
      prefixed: located?.prefixed ?? false,
      // Lossless original table lines of the first envelope, for setup's byte-for-byte carryover.
      rows: located?.document ? allRows.map((row) => ({ key: row.key, line: row.line })) : null,
    },
    values,
    retired,
    diagnostics,
  };
}

// ---------------------------------------------------------------------------------------------
// Envelopes

const HANDLERS = Object.freeze({ resolve: resolveConfiguration });

export async function executeOperation(operation, input = {}, deps = {}) {
  try {
    if (!CONFIG_RESOLVE_OPERATIONS.includes(operation)) {
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
    error instanceof ConfigResolveError
      ? error
      : new ConfigResolveError(
          'INTERNAL_ERROR',
          error?.message ?? 'unexpected config-resolve failure',
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
