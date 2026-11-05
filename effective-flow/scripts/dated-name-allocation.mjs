// Dated name allocation with per-family collision suffixes, the part of `name-allocate` that
// needs no other core: the error class and codes, the local date, the containment walk of a
// cwd-relative directory and the first-free-name search. `effective-flow-mechanics-core.mjs`
// builds every family on it, and the runtime-state helper's `review open-report` allocates the
// `review-report-local` name through it, so both compute the same name for the same clock and
// time zone without the state helper loading the mechanics core's imports. It imports `node:`
// built-ins only and reads the filesystem through the injected synchronous `fs`.

import path from 'node:path';

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

// A suffix search that never ends would mean a directory listing that keeps growing; stop instead.
export const MAX_SUFFIX = 10_000;

// The local review report: `review-report-<date>.md`, `-1`, `-2`, … on a collision.
export const REVIEW_REPORT_LOCAL_FAMILY = Object.freeze({
  inputs: Object.freeze([]),
  start: 1,
  stem: (v) => `review-report-${v.date}`,
});

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

export function requireString(value, field, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value === '')) {
    fail('INVALID_INPUT', `${field} must be a${allowEmpty ? '' : ' non-empty'} string`, { field });
  }
  if (value.includes('\0'))
    fail('INVALID_INPUT', `${field} must not contain a NUL byte`, { field });
  return value;
}

export function lexicalProblem(value) {
  if (path.isAbsolute(value) || path.win32.isAbsolute(value)) return 'must be relative to cwd';
  if (value.replace(/\\/g, '/').split('/').includes('..')) return 'must not contain ".."';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Containment for ADR and runtime-report directories (until a shared path guard exists)

export function isInside(root, candidate) {
  return (
    candidate === root || candidate.startsWith(root.endsWith(path.sep) ? root : root + path.sep)
  );
}

export function lstatOrNull(fs, target) {
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
export function containedDirectory(fs, cwdReal, relative, field, { reportEscape = false } = {}) {
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

export function entryExists(fs, target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export function posixJoin(...parts) {
  return path.posix.normalize(parts.map((part) => part.replace(/\\/g, '/')).join('/'));
}

// ---------------------------------------------------------------------------------------------
// First free name

// The first `<stem>.md`, `<stem>-<start>.md`, `<stem>-<start + 1>.md`, … that exists in none of
// `directories`: `{ name, path, suffix }` with `path` below `dir` and `suffix` null for the bare
// name. `check(name)`, when given, may throw for a composed name its family refuses.
export function firstFreeName(fs, { directories, dir, stem, start, check }) {
  for (let suffix = null; suffix === null || suffix < MAX_SUFFIX;) {
    const name = suffix === null ? `${stem}.md` : `${stem}-${suffix}.md`;
    if (name.includes('/') || name.includes('\\') || name === '.md') {
      fail('INVALID_INPUT', 'the composed name is not a single path segment');
    }
    check?.(name);
    if (!directories.some((directory) => entryExists(fs, path.join(directory, name)))) {
      return { name, path: posixJoin(dir, name), suffix };
    }
    suffix = suffix === null ? start : suffix + 1;
  }
  fail('INTERNAL', 'no free name below the suffix bound');
}

// The `review-report-local` allocation of `name-allocate` for the canonical root `cwdReal` and
// the cwd-relative report directory `dir`: `{ name, path, date, suffix }`, the date taken from
// `now` (a Date) in `timeZone` (the process zone when undefined).
export function allocateReviewReportLocal(fs, { cwdReal, dir, now, timeZone }) {
  const date = localDate(now, timeZone);
  const { real } = containedDirectory(fs, cwdReal, dir, 'dir');
  const allocated = firstFreeName(fs, {
    directories: real ? [real] : [],
    dir,
    stem: REVIEW_REPORT_LOCAL_FAMILY.stem({ date }),
    start: REVIEW_REPORT_LOCAL_FAMILY.start,
  });
  return { name: allocated.name, path: allocated.path, date, suffix: allocated.suffix };
}
