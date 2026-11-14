// Repair-attempt accounting for `merge-gate`: authorized scope, commit attribution, the
// same/new/uncertain match rule per configured reviewer, reviewer and CI attempt counts, and the
// second-ineffective-repair stop rule.
//
// The core is pure: every git read goes through the read functions `createGitReads(runner, cwd)`
// builds over an injected process runner, which only the CLI entry `repair-attempt.mjs` creates.
// Every read runs with `--no-replace-objects` and with every inherited variable that would redirect
// git, inject configuration or replace objects masked (`gitReadEnv`). A failed read is never an
// error: it surfaces as an `undetermined` code with the outcome the operation states for it. Repair
// state is in-run data the gate keeps in its wisdom file and passes back on every call; the helper
// is stateless, and every operation is deterministic for the same input and the same read results.
//
// Operations (input is one JSON object; `cwd` is the absolute checkout path, `base` the PR's base
// branch name, every SHA a full lowercase object id):
//
// - `scope-read` `{ cwd, base, head, stored? }` -> `{ status: 'stored' | 'read', scope }` or
//   `{ status: 'undetermined', code, delegation: 'blocked' }`. With a valid `stored` scope record it
//   returns that record and reads nothing (resume and re-dispatch). Otherwise it reads
//   `git merge-base origin/<base> <head>` and `git diff --name-status -z -M <merge-base> <head>`
//   (both paths of every rename or copy entry). A scope record is
//   `{ mergeBase, head, paths }` with sorted, de-duplicated paths. An undetermined read blocks
//   delegation only; it never stops a run.
// - `scope-check` `{ scope, changes: [{ status, path, from? }], cwd? }` -> `{ status: 'in-scope' |
//   'expansion', outside: [path], undetermined: [{ path, code }] }`. `status` is a git name-status
//   letter (`A`, `M`, `D`, `T`, `R`, `C`); a caller checking planned paths states `A` for a path that
//   does not exist yet and `M` otherwise. Both sides of `R` and `C` are checked. A path that is not
//   canonical (empty, `.` or `..` segments, a leading or trailing `/`) is outside. A path outside
//   the scope passes only when it matches the fixed test globs `**/test/**`, `**/tests/**`,
//   `**/__tests__/**`, `**/*.test.*`, `**/*.spec.*` and is added, or is modified or deleted and was
//   added by the run itself: absent from the tree of `scope.head`
//   (`git ls-tree -r -z --name-only --full-tree <scope.head> -- <path>`), `scope.head` an ancestor
//   of the tip (`git merge-base --is-ancestor`), and the latest commit adding it on the first-parent
//   chain (`git log -m --first-parent --diff-filter=A --format=%H%x20%P -n 1 <scope.head>..<tip> --
//   <path>`, literal pathspecs) a single-parent commit – so a test a base merge brought in is not
//   the run's. The tip is `HEAD` of `cwd`, and the checked commit in `post-check`. These reads run
//   only with `cwd`; a call without it is an expansion for such a path, and a failed read lists the
//   path under `undetermined` with its code, which makes the status `expansion` too.
// - `attribute` `{ cwd, base, before, after, gateMerges?, shas? }` -> `{ status: 'attributed' |
//   'uncertain' | 'undetermined', range, foreign, outsideRange, code? }`. Reads
//   `git rev-list <before>..<after> --not origin/<base>` (no read when `before` equals `after`). The
//   range may hold only `gateMerges` (the gate's own pushed base-merge SHAs) and `shas` (returned
//   SHAs); anything else is foreign.
// - `post-check` `{ cwd, scope, shas }` -> `{ status: 'pass' | 'stop', reason, commits, outside,
//   mergeCommits, undetermined }`. Per SHA it reads `git rev-list --parents -n 1 <sha>` and, for a
//   single-parent commit, `git diff-tree --no-commit-id --name-status -r -z -M <sha>`, then runs
//   `scope-check` with its reads and `<sha>` as the tip. Not exactly one parent, a path outside the
//   scope, or any undetermined read (`{ sha, path?, code }`) stops.
// - `record` `{ cwd, base, state, scope, round, before, after, gateMerges?, minted, ciChecks?,
//   returned?, scopeExpansion?, scopeLineMissing? }` -> `{ state, decision, stop, round,
//   replayed?, rerecorded?, counts, report }`.
//   Records one delegated round: `minted` is `{ items: [{ identifier, key, reviewer, outcome }],
//   freeText, correction }` as `delegation-envelope build` minted it and the gate mapped the
//   trusted outcomes;
//   `returned` is iterate's `[{ identifier, shas }]`; `scopeExpansion` its `[{ identifier, paths }]`;
//   `ciChecks` the failing check names of the free-text instruction. It applies the receiver rule –
//   an entry under an unminted identifier is inert whatever its shape, listed by at most
//   `MAX_INERT_LISTED` identifiers of at most `MAX_INERT_IDENTIFIER` characters with `inertCount`
//   for all –, runs `attribute`, then `post-check` over the returned SHAs and, separately, over the
//   foreign ones, so every commit actually made but the gate merges is checked once; it reads the
//   hunks of every counted attempt (`git diff-tree -p -U0 -M <sha>`) and counts at most one attempt
//   per cause per round, however many items alias it; that attempt lists every aliasing identifier
//   and key. A foreign commit that passes leaves the round `uncertain` only; one that fails the
//   post-check stops (`foreign-commit-unverified`, the stop carrying its `outside`, `mergeCommits`
//   and `undetermined`). `scopeLineMissing: true` – the return carried no parseable
//   `Scope expansion:` line – records the round and then stops it (`scope-line-missing`). A `round`
//   already recorded with the same `before` and `after` returns that stored record with the state
//   unchanged and reads nothing, so a replayed call never counts twice. The latest round, when it
//   is `uncertain` solely by `returned-outside-range` and nothing was recorded after it, may be
//   recorded again with the same `before` and a later `after` (a lagging forge head): when the
//   stored `after` is an ancestor of the new one it is replaced (`rerecorded: true`) and runs the
//   same full post-check, otherwise – or on an unreadable ancestry – the stored record is returned
//   unchanged and the round stays `uncertain`. The same `round` with any other heads is refused as
//   INVALID_INPUT.
// - `evaluate` `{ cwd, state, head, observations, events? }` -> `{ state, decision, stop,
//   classifications, causes, counts, report }`. `observations` is `[{ reviewer, head, findings:
//   [{ key, anchor }] }]` for each configured reviewer that has run; only an observation whose
//   `head` equals `head` is evidence. `anchor` is `null` for a body finding or `{ path, line,
//   startLine?, lineOutdated }` from the normalized thread read. `events` are `{ type, sha? }` with
//   `type` one of `ci-wait`, `bot-wait`, `review-wait`, `review-resubmission`, `base-merge`, kept
//   for the report. It classifies, resolves and evaluates the stop rule; the path-change read is
//   `git diff --name-only --no-renames <from> <head> -- <path>` and the freshness read
//   `git merge-base --is-ancestor <after> <head>`.
//
// `decision` is `continue` or `stop`; a stop is sticky in `state.stop`, so every later `record` or
// `evaluate` returns it again before any read. `counts` is `{ reviewer: [{ cause, reviewer,
// attempts, ineffective, status }], ci: [{ check, attempts }] }`; `report` is `null` until a stop
// and then carries the repair-progress data (stop, attempts, timeline, foreign commits, out-of-scope
// paths, the maintainer decision code).

import process from 'node:process';
import { gitBaseEnv } from './runtime-state-guard.mjs';

export const REPAIR_ATTEMPT_VERSION = 1;

export const REPAIR_ATTEMPT_OPERATIONS = Object.freeze([
  'scope-read',
  'scope-check',
  'attribute',
  'post-check',
  'record',
  'evaluate',
]);

export const REPAIR_ATTEMPT_ERROR_CODES = Object.freeze(['INVALID_INPUT', 'INTERNAL_ERROR']);

// Every failed git read surfaces under one of these codes; each operation states its outcome.
export const UNDETERMINED_CODES = Object.freeze([
  'merge-base-unreadable',
  'scope-diff-unreadable',
  'attribution-unreadable',
  'parents-unreadable',
  'commit-paths-unreadable',
  'hunks-unreadable',
  'path-change-unreadable',
  'ancestry-unreadable',
  'tree-unreadable',
  'addition-unreadable',
]);

// Why a recorded round is `uncertain`; a stored round carries only these.
export const ROUND_REASONS = Object.freeze([
  'attribution-undetermined',
  'conflicting-repeat',
  'duplicate-sha',
  'foreign-commits',
  'returned-outside-range',
]);

export const TEST_GLOBS = Object.freeze([
  '**/test/**',
  '**/tests/**',
  '**/__tests__/**',
  '**/*.test.*',
  '**/*.spec.*',
]);

export const EVENT_TYPES = Object.freeze([
  'ci-wait',
  'bot-wait',
  'review-wait',
  'review-resubmission',
  'base-merge',
]);

export const MAINTAINER_DECISIONS = Object.freeze({
  'ineffective-repairs': 'choose-repair-approach',
  'scope-expansion-declared': 'authorize-scope-expansion',
  'scope-expansion-committed': 'authorize-scope-expansion',
  'merge-commit': 'review-returned-merge-commit',
  'post-check-undetermined': 'verify-returned-commits',
  'foreign-commit-unverified': 'verify-returned-commits',
  'scope-line-missing': 'verify-returned-commits',
});

// A stop of a reviewer cause needs this many verified attempts and fresh evidence after the last.
export const STOP_AFTER_ATTEMPTS = 2;

export const MAX_STDIN_BYTES = 4 * 1024 * 1024;

const EXIT_CODES = Object.freeze({ INVALID_INPUT: 2 });
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const BASE_NAME = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*\/$)(?!.*\.lock$)[A-Za-z0-9._/-]+$/;
const NAME_STATUS = /^[AMDTRCUXB][0-9]*$/;
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
const TEST_DIRECTORIES = new Set(['test', 'tests', '__tests__']);
const STATUSES = Object.freeze(['A', 'M', 'D', 'T', 'R', 'C']);
const ITEM_OUTCOMES = Object.freeze(['implemented', 'deferred', 'rejected', 'unassessed']);
const GIT_ENV = Object.freeze({ GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' });
export const MAX_INERT_LISTED = 10;
export const MAX_INERT_IDENTIFIER = 128;

// The env of every git read. The shared process runner merges a call's env over `process.env`, so
// each inherited variable `gitBaseEnv` strips (repository, index and object redirection, injected
// configuration, replace refs, pathspec and diff overrides) is masked with `undefined`, which
// `spawn` drops.
export function gitReadEnv(source = process.env) {
  const kept = gitBaseEnv(source);
  const env = { ...GIT_ENV };
  for (const key of Object.keys(source ?? {})) {
    if (!Object.hasOwn(kept, key)) env[key] = undefined;
  }
  return env;
}

export class RepairAttemptError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RepairAttemptError';
    this.code = code;
    this.exitCode = EXIT_CODES[code] ?? 1;
  }
}

function fail(message) {
  throw new RepairAttemptError('INVALID_INPUT', message);
}

// ---------------------------------------------------------------------------------------------
// Input validation

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be a JSON object`);
  }
  return value;
}

function requireArray(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value === '') fail(`${label} must be a non-empty string`);
  return value;
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    fail(`${label} must be a full lowercase object id`);
  }
  return value;
}

function requireShas(value, label) {
  return [
    ...new Set(requireArray(value, label).map((sha, i) => requireSha(sha, `${label}[${i}]`))),
  ];
}

function requireCwd(value) {
  const cwd = requireString(value, 'cwd');
  if (!cwd.startsWith('/')) fail('cwd must be an absolute path');
  return cwd;
}

function requireBase(value) {
  const base = requireString(value, 'base');
  if (!BASE_NAME.test(base)) fail('base must be a plain branch name');
  return base;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${label} must be a positive integer`);
  return value;
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

export function normalizeScope(value, label = 'scope') {
  requireObject(value, label);
  const paths = requireArray(value.paths, `${label}.paths`).map((entry, i) =>
    requireString(entry, `${label}.paths[${i}]`),
  );
  return {
    mergeBase: requireSha(value.mergeBase, `${label}.mergeBase`),
    head: requireSha(value.head, `${label}.head`),
    paths: sortedUnique(paths),
  };
}

function normalizeChanges(value) {
  return requireArray(value, 'changes').map((change, i) => {
    const label = `changes[${i}]`;
    requireObject(change, label);
    if (!STATUSES.includes(change.status)) fail(`${label}.status must be ${STATUSES.join(', ')}`);
    const path = requireString(change.path, `${label}.path`);
    if (change.status === 'R' || change.status === 'C') {
      return { status: change.status, from: requireString(change.from, `${label}.from`), path };
    }
    return { status: change.status, path };
  });
}

// ---------------------------------------------------------------------------------------------
// Git reads over the injected runner. Each returns `{ ok: true, value }` or `{ ok: false, code }`.

async function runGit(runner, cwd, env, args) {
  try {
    const result = await runner({
      executable: 'git',
      args: ['--no-replace-objects', ...args],
      cwd,
      env,
    });
    return result ?? { status: null, stdout: '' };
  } catch {
    return { status: null, stdout: '' };
  }
}

const text = (result) =>
  Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8') : String(result.stdout ?? '');

// Parses `--name-status -z` output into changes; null for any malformed record.
export function parseNameStatus(output) {
  const tokens = output.split('\0');
  if (tokens.at(-1) === '') tokens.pop();
  const changes = [];
  for (let i = 0; i < tokens.length;) {
    const status = tokens[i];
    if (!NAME_STATUS.test(status)) return null;
    const letter = status[0];
    if (letter === 'R' || letter === 'C') {
      if (i + 2 >= tokens.length || tokens[i + 1] === '' || tokens[i + 2] === '') return null;
      changes.push({ status: letter, from: tokens[i + 1], path: tokens[i + 2] });
      i += 3;
    } else {
      if (i + 1 >= tokens.length || tokens[i + 1] === '') return null;
      changes.push({ status: letter, path: tokens[i + 1] });
      i += 2;
    }
  }
  return changes;
}

// Parses a `-U0` patch into new-side line ranges per path; null when a path is C-quoted. Only the
// header between `diff --git` and the first hunk is read for paths, so an added line that starts
// with `++ ` is never taken for a file header. Git ends a `+++ ` header with one tab when the path
// contains a space; that tab is no part of the path.
export function parseHunks(output) {
  const files = new Map();
  let path = null;
  let inHeader = false;
  for (const line of output.split('\n')) {
    if (line.startsWith('diff --git ')) {
      inHeader = true;
      path = null;
      continue;
    }
    if (inHeader && line.startsWith('+++ ')) {
      const target = line.slice(4).replace(/\t$/, '');
      if (target === '/dev/null') path = null;
      else if (target.startsWith('b/')) path = target.slice(2);
      else return null;
      continue;
    }
    const hunk = HUNK_HEADER.exec(line);
    if (hunk && (inHeader || path !== null)) {
      inHeader = false;
      if (path === null) continue;
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      // A pure deletion sits between new-side lines `start` and `start + 1`.
      const range = count === 0 ? [Math.max(1, start), start + 1] : [start, start + count - 1];
      if (!files.has(path)) files.set(path, []);
      files.get(path).push(range);
    }
  }
  return [...files.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([file, ranges]) => ({ path: file, ranges }));
}

const shaLines = (output) =>
  output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

export function createGitReads(runner, cwd, envSource = process.env) {
  if (typeof runner !== 'function') {
    return createGitReads(
      async () => {
        throw new Error('no process runner injected');
      },
      cwd,
      envSource,
    );
  }
  const env = gitReadEnv(envSource);
  const git = (args) => runGit(runner, cwd, env, args);
  return {
    async mergeBase(base, head) {
      const result = await git(['merge-base', `origin/${base}`, head]);
      const lines = result.status === 0 ? shaLines(text(result)) : [];
      return lines.length === 1 && OBJECT_ID.test(lines[0])
        ? { ok: true, value: lines[0] }
        : { ok: false, code: 'merge-base-unreadable' };
    },
    async scopeDiff(mergeBase, head) {
      const result = await git(['diff', '--name-status', '-z', '-M', mergeBase, head]);
      const changes = result.status === 0 ? parseNameStatus(text(result)) : null;
      return changes ? { ok: true, value: changes } : { ok: false, code: 'scope-diff-unreadable' };
    },
    async range(base, before, after) {
      const result = await git(['rev-list', `${before}..${after}`, '--not', `origin/${base}`]);
      const lines = result.status === 0 ? shaLines(text(result)) : null;
      return lines && lines.every((line) => OBJECT_ID.test(line))
        ? { ok: true, value: lines }
        : { ok: false, code: 'attribution-unreadable' };
    },
    async parents(sha) {
      const result = await git(['rev-list', '--parents', '-n', '1', sha]);
      const fields = result.status === 0 ? text(result).trim().split(/\s+/) : [];
      return fields[0] === sha && fields.every((field) => OBJECT_ID.test(field))
        ? { ok: true, value: fields.slice(1) }
        : { ok: false, code: 'parents-unreadable' };
    },
    async commitPaths(sha) {
      const result = await git([
        'diff-tree',
        '--no-commit-id',
        '--name-status',
        '-r',
        '-z',
        '-M',
        sha,
      ]);
      const changes = result.status === 0 ? parseNameStatus(text(result)) : null;
      return changes
        ? { ok: true, value: changes }
        : { ok: false, code: 'commit-paths-unreadable' };
    },
    async hunks(sha) {
      const result = await git([
        '-c',
        'core.quotePath=false',
        'diff-tree',
        '-p',
        '-U0',
        '-M',
        '--no-commit-id',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        '--src-prefix=a/',
        '--dst-prefix=b/',
        sha,
      ]);
      const files = result.status === 0 ? parseHunks(text(result)) : null;
      return files ? { ok: true, value: files } : { ok: false, code: 'hunks-unreadable' };
    },
    async pathChanged(from, head, path) {
      const result = await git([
        '--literal-pathspecs',
        'diff',
        '--name-only',
        '--no-renames',
        from,
        head,
        '--',
        path,
      ]);
      return result.status === 0
        ? { ok: true, value: text(result).trim() !== '' }
        : { ok: false, code: 'path-change-unreadable' };
    },
    // Whether `path` is a blob (or a directory) in the tree of `commit`.
    async inTree(commit, path) {
      const result = await git([
        '--literal-pathspecs',
        'ls-tree',
        '-r',
        '-z',
        '--name-only',
        '--full-tree',
        commit,
        '--',
        path,
      ]);
      if (result.status !== 0) return { ok: false, code: 'tree-unreadable' };
      const names = text(result).split('\0');
      return {
        ok: true,
        value: names.some((name) => name === path || name.startsWith(`${path}/`)),
      };
    },
    // The latest commit that added `path` on the first-parent chain of `from..tip`, with its
    // parents, or null when none did. A merge is diffed against its first parent, so a path a merge
    // brought in names that merge.
    async addedBy(from, tip, path) {
      const result = await git([
        '--literal-pathspecs',
        'log',
        '-m',
        '--first-parent',
        '--diff-filter=A',
        '--format=%H%x20%P',
        '-n',
        '1',
        `${from}..${tip}`,
        '--',
        path,
      ]);
      const lines = result.status === 0 ? shaLines(text(result)) : null;
      if (lines === null || lines.length > 1) return { ok: false, code: 'addition-unreadable' };
      if (lines.length === 0) return { ok: true, value: null };
      const fields = lines[0].split(' ');
      return fields.every((field) => OBJECT_ID.test(field))
        ? { ok: true, value: { sha: fields[0], parents: fields.slice(1) } }
        : { ok: false, code: 'addition-unreadable' };
    },
    async isAncestor(ancestor, head) {
      const result = await git(['merge-base', '--is-ancestor', ancestor, head]);
      if (result.status === 0) return { ok: true, value: true };
      if (result.status === 1) return { ok: true, value: false };
      return { ok: false, code: 'ancestry-unreadable' };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Scope

const segmentsOf = (path) => path.split('/');

// A repository-relative path in git's own spelling. Git reads normalize `src/./a`, `src//a`, a
// leading `./` or a trailing `/`, so such a spelling would never match the path a read names.
function isCanonicalPath(path) {
  return segmentsOf(path).every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

// The fixed test globs: a `test`, `tests` or `__tests__` directory at any depth, or a file name
// containing `.test.` or `.spec.`.
export function isTestPath(path) {
  const segments = segmentsOf(path);
  const name = segments.at(-1);
  return (
    segments.slice(0, -1).some((segment) => TEST_DIRECTORIES.has(segment)) ||
    name.includes('.test.') ||
    name.includes('.spec.')
  );
}

function sidesOf(change) {
  if (change.status === 'R' || change.status === 'C') {
    return [
      { path: change.from, added: false },
      { path: change.path, added: true },
    ];
  }
  return [{ path: change.path, added: change.status === 'A' }];
}

// Whether the run itself added `path` after `scope.head`, so a later repair may modify or delete it:
// `{ allowed }` or `{ code }`. A test that a base merge (or any merge) brought in was added by a
// merge commit on the first-parent chain, and is the base's, not the run's.
async function addedByRun(reads, scope, tip, path, ancestry) {
  const tree = await reads.inTree(scope.head, path);
  if (!tree.ok) return { code: tree.code };
  if (tree.value) return { allowed: false };
  const descends = await ancestry();
  if (!descends.ok) return { code: descends.code };
  if (!descends.value) return { allowed: false };
  const adder = await reads.addedBy(scope.head, tip, path);
  if (!adder.ok) return { code: adder.code };
  return { allowed: adder.value !== null && adder.value.parents.length === 1 };
}

// A test file outside the scope may be added, or modified or deleted when the run added it, since
// the scope is read once. Without `reads` a modified or deleted one is an expansion; a failed read
// lists it under `undetermined`.
export async function scopeCheck(scope, changes, reads = null, tip = 'HEAD') {
  const allowed = new Set(scope.paths);
  const outside = [];
  const undetermined = new Map();
  const decided = new Map();
  let ancestry = null;
  const ancestryOnce = () => (ancestry ??= reads.isAncestor(scope.head, tip));
  const runAdded = async (path) => {
    if (reads === null) return { allowed: false };
    if (!decided.has(path))
      decided.set(path, await addedByRun(reads, scope, tip, path, ancestryOnce));
    return decided.get(path);
  };
  for (const change of changes) {
    for (const side of sidesOf(change)) {
      if (allowed.has(side.path)) continue;
      if (isCanonicalPath(side.path) && isTestPath(side.path)) {
        if (side.added) continue;
        const verdict = await runAdded(side.path);
        if (verdict.allowed) continue;
        if (verdict.code) {
          undetermined.set(side.path, verdict.code);
          continue;
        }
      }
      outside.push(side.path);
    }
  }
  const paths = sortedUnique(outside);
  const unread = [...undetermined.keys()]
    .sort()
    .map((path) => ({ path, code: undetermined.get(path) }));
  return {
    status: paths.length === 0 && unread.length === 0 ? 'in-scope' : 'expansion',
    outside: paths,
    undetermined: unread,
  };
}

export async function scopeRead(input, reads) {
  if (input.stored !== undefined && input.stored !== null) {
    return { status: 'stored', scope: normalizeScope(input.stored, 'stored') };
  }
  const base = requireBase(input.base);
  const head = requireSha(input.head, 'head');
  const mergeBase = await reads.mergeBase(base, head);
  if (!mergeBase.ok) return { status: 'undetermined', code: mergeBase.code, delegation: 'blocked' };
  const diff = await reads.scopeDiff(mergeBase.value, head);
  if (!diff.ok) return { status: 'undetermined', code: diff.code, delegation: 'blocked' };
  const paths = diff.value.flatMap((change) =>
    change.from === undefined ? [change.path] : [change.from, change.path],
  );
  return {
    status: 'read',
    scope: { mergeBase: mergeBase.value, head, paths: sortedUnique(paths) },
  };
}

// ---------------------------------------------------------------------------------------------
// Attribution and post-check

export async function attribute(input, reads) {
  const base = requireBase(input.base);
  const before = requireSha(input.before, 'before');
  const after = requireSha(input.after, 'after');
  const gateMerges = requireShas(input.gateMerges, 'gateMerges');
  const shas = requireShas(input.shas, 'shas');
  let range = [];
  if (before !== after) {
    const read = await reads.range(base, before, after);
    if (!read.ok) {
      return {
        status: 'undetermined',
        code: read.code,
        range: [],
        foreign: [],
        outsideRange: shas,
      };
    }
    range = read.value;
  }
  const known = new Set([...gateMerges, ...shas]);
  const inRange = new Set(range);
  const foreign = range.filter((sha) => !known.has(sha));
  const outsideRange = shas.filter((sha) => !inRange.has(sha));
  const status = foreign.length === 0 && outsideRange.length === 0 ? 'attributed' : 'uncertain';
  return { status, range, foreign, outsideRange };
}

export async function postCheck(input, reads) {
  const scope = normalizeScope(input.scope);
  const shas = requireShas(input.shas, 'shas');
  const commits = [];
  const outside = [];
  const mergeCommits = [];
  const undetermined = [];
  for (const sha of shas) {
    const parents = await reads.parents(sha);
    if (!parents.ok) {
      undetermined.push({ sha, code: parents.code });
      continue;
    }
    if (parents.value.length !== 1) {
      mergeCommits.push({ sha, parents: parents.value.length });
      continue;
    }
    const paths = await reads.commitPaths(sha);
    if (!paths.ok) {
      undetermined.push({ sha, code: paths.code });
      continue;
    }
    const check = await scopeCheck(scope, paths.value, reads, sha);
    commits.push({
      sha,
      changes: paths.value,
      outside: check.outside,
      undetermined: check.undetermined,
    });
    for (const path of check.outside) outside.push({ sha, path });
    for (const entry of check.undetermined) undetermined.push({ sha, ...entry });
  }
  const reason =
    undetermined.length > 0
      ? 'post-check-undetermined'
      : mergeCommits.length > 0
        ? 'merge-commit'
        : outside.length > 0
          ? 'scope-expansion-committed'
          : null;
  return { status: reason ? 'stop' : 'pass', reason, commits, outside, mergeCommits, undetermined };
}

// ---------------------------------------------------------------------------------------------
// Repair state

export function freshState() {
  return {
    version: REPAIR_ATTEMPT_VERSION,
    causes: [],
    ci: [],
    rounds: [],
    timeline: [],
    lastRoundUncertain: false,
    stop: null,
  };
}

// Hunk SHAs reach git argv, so every stored hunk keeps the shape `attemptHunks` writes.
function normalizeAttemptHunks(hunks, label) {
  if (!Array.isArray(hunks)) fail(`${label} must be an array or null`);
  for (const hunk of hunks) {
    requireObject(hunk, `${label}[]`);
    requireSha(hunk.sha, `${label}[].sha`);
    if (!Array.isArray(hunk.files)) fail(`${label}[].files must be an array`);
    for (const file of hunk.files) {
      requireObject(file, `${label}[].files[]`);
      requireString(file.path, `${label}[].files[].path`);
      if (!Array.isArray(file.ranges)) fail(`${label}[].files[].ranges must be an array`);
      for (const range of file.ranges) {
        if (
          !Array.isArray(range) ||
          range.length !== 2 ||
          !range.every((line) => Number.isSafeInteger(line) && line > 0) ||
          range[0] > range[1]
        ) {
          fail(`${label}[].files[].ranges[] must be a [start, end] line pair`);
        }
      }
    }
  }
}

// The state is the helper's own output, round-tripped through the wisdom file; a structurally
// foreign state is refused rather than repaired.
export function normalizeState(value) {
  if (value === undefined || value === null) return freshState();
  requireObject(value, 'state');
  if (value.version !== REPAIR_ATTEMPT_VERSION) fail('state.version is not supported');
  for (const field of ['causes', 'ci', 'rounds', 'timeline']) {
    if (!Array.isArray(value[field])) fail(`state.${field} must be an array`);
  }
  if (typeof value.lastRoundUncertain !== 'boolean') {
    fail('state.lastRoundUncertain must be a boolean');
  }
  if (value.stop !== null) requireObject(value.stop, 'state.stop');
  value.causes.forEach((cause, i) => {
    const label = `state.causes[${i}]`;
    requireObject(cause, label);
    requireString(cause.id, `${label}.id`);
    requireString(cause.reviewer, `${label}.reviewer`);
    if (!Array.isArray(cause.keys) || cause.keys.length === 0) fail(`${label}.keys must be set`);
    if (!['open', 'resolved'].includes(cause.status)) fail(`${label}.status is invalid`);
    if (!Array.isArray(cause.attempts) || !Array.isArray(cause.history)) {
      fail(`${label} attempts and history must be arrays`);
    }
    for (const attempt of cause.attempts) {
      requireObject(attempt, `${label}.attempts[]`);
      requireSha(attempt.after, `${label}.attempts[].after`);
      requireShas(attempt.shas, `${label}.attempts[].shas`);
      if (attempt.hunks !== null) normalizeAttemptHunks(attempt.hunks, `${label}.attempts[].hunks`);
    }
  });
  // A stored round's heads reach git argv on a re-record, and its reasons decide whether it may be.
  value.rounds.forEach((round, i) => {
    const label = `state.rounds[${i}]`;
    requireObject(round, label);
    requirePositiveInteger(round.round, `${label}.round`);
    requireSha(round.before, `${label}.before`);
    requireSha(round.after, `${label}.after`);
    if (
      !Array.isArray(round.reasons) ||
      !round.reasons.every((reason) => ROUND_REASONS.includes(reason))
    ) {
      fail(`${label}.reasons must list known round reasons`);
    }
  });
  return structuredClone(value);
}

const reviewerOf = (value, label) => requireString(value, label).toLowerCase();

function findCause(state, reviewer, key) {
  return state.causes.find((cause) => cause.reviewer === reviewer && cause.keys.includes(key));
}

function newCause(state, reviewer, key, head) {
  const cause = {
    id: key,
    reviewer,
    keys: [key],
    status: 'open',
    attempts: [],
    history: [],
    lastReportedHead: head,
  };
  state.causes.push(cause);
  return cause;
}

function addCiAttempt(state, check) {
  const entry = state.ci.find((item) => item.check === check);
  if (entry) entry.attempts += 1;
  else state.ci.push({ check, attempts: 1 });
  state.ci.sort((a, b) => (a.check < b.check ? -1 : a.check > b.check ? 1 : 0));
}

export function countsOf(state) {
  return {
    reviewer: state.causes.map((cause) => ({
      cause: cause.id,
      reviewer: cause.reviewer,
      attempts: cause.attempts.length,
      ineffective: cause.attempts.filter((attempt) => attempt.ineffective === true).length,
      status: cause.status,
    })),
    ci: state.ci.map(({ check, attempts }) => ({ check, attempts })),
  };
}

export function reportOf(state) {
  if (state.stop === null) return null;
  const stop = state.stop;
  const causes =
    stop.reason === 'ineffective-repairs'
      ? state.causes.filter((cause) => cause.id === stop.cause && cause.reviewer === stop.reviewer)
      : state.causes;
  return {
    stop,
    attempts: causes.flatMap((cause) =>
      cause.attempts.map((attempt) => ({
        cause: cause.id,
        reviewer: cause.reviewer,
        round: attempt.round,
        identifiers: attempt.identifiers ?? [attempt.identifier],
        keys: attempt.keys ?? [attempt.key],
        before: attempt.before,
        after: attempt.after,
        shas: attempt.shas,
        outcome: 'implemented',
        ineffective: attempt.ineffective === true,
      })),
    ),
    timeline: state.timeline,
    foreign: state.rounds.flatMap((round) =>
      round.attribution.foreign.map((sha) => ({ round: round.round, sha })),
    ),
    outOfScope: [
      ...state.rounds.flatMap((round) =>
        round.declared.flatMap((entry) =>
          entry.paths.map((path) => ({ round: round.round, identifier: entry.identifier, path })),
        ),
      ),
      ...state.rounds.flatMap((round) =>
        [...round.postCheck.outside, ...(round.foreignCheck?.outside ?? [])].map((entry) => ({
          round: round.round,
          ...entry,
        })),
      ),
    ],
    maintainerDecision: MAINTAINER_DECISIONS[stop.reason] ?? 'review-stop',
  };
}

function stopped(state, extra = {}) {
  return {
    state,
    decision: 'stop',
    stop: state.stop,
    ...extra,
    counts: countsOf(state),
    report: reportOf(state),
  };
}

// ---------------------------------------------------------------------------------------------
// Round recording

function normalizeMinted(value) {
  requireObject(value, 'minted');
  const items = requireArray(value.items, 'minted.items').map((item, i) => {
    const label = `minted.items[${i}]`;
    requireObject(item, label);
    if (!ITEM_OUTCOMES.includes(item.outcome)) fail(`${label}.outcome must be a trusted outcome`);
    return {
      kind: 'item',
      identifier: requireString(item.identifier, `${label}.identifier`),
      key: requireString(item.key, `${label}.key`),
      reviewer: reviewerOf(item.reviewer, `${label}.reviewer`),
      outcome: item.outcome,
    };
  });
  const byId = new Map();
  const claim = (entry) => {
    if (byId.has(entry.identifier)) fail(`minted identifier ${entry.identifier} is not unique`);
    byId.set(entry.identifier, entry);
  };
  items.forEach(claim);
  for (const [field, kind] of [
    ['freeText', 'free-text'],
    ['correction', 'correction'],
  ]) {
    if (value[field] !== undefined && value[field] !== null) {
      claim({ kind, identifier: requireString(value[field], `minted.${field}`) });
    }
  }
  return { items, byId };
}

// The minted identifier an entry names, or null. Minted-ness is decided before any other field is
// read, so an entry under an unminted name is inert whatever its shape.
function mintedIdentifierOf(minted, entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  return typeof entry.identifier === 'string' && minted.byId.has(entry.identifier)
    ? entry.identifier
    : null;
}

// The receiver rule: unminted entries are inert, identical repeats are idempotent, and a
// conflicting repeat or one SHA under two identifiers makes the round uncertain.
function receive(minted, returned, scopeExpansion) {
  const inert = [];
  let inertCount = 0;
  const markInert = (entry) => {
    inertCount += 1;
    const identifier = entry?.identifier;
    if (typeof identifier === 'string' && identifier.length <= MAX_INERT_IDENTIFIER) {
      inert.push(identifier);
    }
  };
  const claims = new Map();
  const reasons = new Set();
  requireArray(returned, 'returned').forEach((entry, i) => {
    const identifier = mintedIdentifierOf(minted, entry);
    if (identifier === null) {
      markInert(entry);
      return;
    }
    const shas = sortedUnique(requireShas(entry.shas, `returned[${i}].shas`));
    const earlier = claims.get(identifier);
    if (earlier && earlier.join() !== shas.join()) reasons.add('conflicting-repeat');
    claims.set(identifier, sortedUnique([...(earlier ?? []), ...shas]));
  });
  const owners = new Map();
  for (const [identifier, shas] of claims) {
    for (const sha of shas) owners.set(sha, [...(owners.get(sha) ?? []), identifier]);
  }
  const duplicates = [...owners].filter(([, ids]) => ids.length > 1).map(([sha]) => sha);
  if (duplicates.length > 0) reasons.add('duplicate-sha');
  const declared = [];
  requireArray(scopeExpansion, 'scopeExpansion').forEach((entry, i) => {
    const identifier = mintedIdentifierOf(minted, entry);
    if (identifier === null) {
      markInert(entry);
      return;
    }
    const paths = requireArray(entry.paths, `scopeExpansion[${i}].paths`).map((path, j) =>
      requireString(path, `scopeExpansion[${i}].paths[${j}]`),
    );
    declared.push({ identifier, paths: sortedUnique(paths) });
  });
  return {
    inert: sortedUnique(inert).slice(0, MAX_INERT_LISTED),
    inertCount,
    claims,
    duplicates: sortedUnique(duplicates),
    reasons,
    declared,
  };
}

async function attemptHunks(reads, shas) {
  const hunks = [];
  for (const sha of shas) {
    const read = await reads.hunks(sha);
    if (!read.ok) return { hunks: null, code: read.code };
    hunks.push({ sha, files: read.value });
  }
  return { hunks, code: null };
}

export async function recordRound(input, reads) {
  const state = normalizeState(input.state);
  if (state.stop !== null) return stopped(state, { round: null });
  const base = requireBase(input.base);
  const scope = normalizeScope(input.scope);
  const round = requirePositiveInteger(input.round, 'round');
  const before = requireSha(input.before, 'before');
  const after = requireSha(input.after, 'after');
  const stored = state.rounds.find((entry) => entry.round === round);
  const replay = () => ({
    state,
    decision: 'continue',
    stop: null,
    round: stored,
    replayed: true,
    counts: countsOf(state),
    report: null,
  });
  let rerecorded = false;
  if (stored) {
    if (stored.before === before && stored.after === after) return replay();
    if (stored.before !== before || !rerecordable(state, stored)) {
      fail(`round ${round} is already recorded with other heads`);
    }
    const descends = await reads.isAncestor(stored.after, after);
    if (!descends.ok || !descends.value) return replay();
    // The uncertain round counted nothing, so dropping its record and timeline entry undoes it.
    state.rounds.pop();
    state.timeline.pop();
    rerecorded = true;
  }
  const scopeLineMissing = input.scopeLineMissing ?? false;
  if (typeof scopeLineMissing !== 'boolean') fail('scopeLineMissing must be a boolean');
  const gateMerges = requireShas(input.gateMerges, 'gateMerges');
  const minted = normalizeMinted(input.minted);
  const ciChecks = sortedUnique(
    requireArray(input.ciChecks, 'ciChecks').map((check, i) =>
      requireString(check, `ciChecks[${i}]`),
    ),
  );
  const received = receive(minted, input.returned, input.scopeExpansion);
  const returnedShas = sortedUnique([...received.claims.values()].flat());

  const attribution = await attribute(
    { base, before, after, gateMerges, shas: returnedShas },
    reads,
  );
  const reasons = received.reasons;
  if (attribution.status === 'undetermined') reasons.add('attribution-undetermined');
  if (attribution.foreign.length > 0) reasons.add('foreign-commits');
  if (attribution.status !== 'undetermined' && attribution.outsideRange.length > 0) {
    reasons.add('returned-outside-range');
  }
  const passed = {
    status: 'pass',
    reason: null,
    commits: [],
    outside: [],
    mergeCommits: [],
    undetermined: [],
  };
  const check =
    returnedShas.length === 0 ? passed : await postCheck({ scope, shas: returnedShas }, reads);
  // A commit nobody returned is checked too, so a run that ignored the scope and left its commit
  // out of `Returned commits:` still fails closed. Foreign excludes returned SHAs and gate merges.
  const foreignCheck =
    attribution.foreign.length === 0
      ? passed
      : await postCheck({ scope, shas: attribution.foreign }, reads);
  const uncertain = reasons.size > 0;

  const attempts = [];
  const ci = [];
  if (!uncertain) {
    // Items aliasing one cause in this round make one attempt with all their SHAs.
    const perCause = new Map();
    for (const item of minted.items) {
      const shas = received.claims.get(item.identifier) ?? [];
      if (item.outcome !== 'implemented' || shas.length === 0) continue;
      const cause =
        findCause(state, item.reviewer, item.key) ?? newCause(state, item.reviewer, item.key, null);
      const entry = perCause.get(cause);
      if (entry) {
        entry.shas = sortedUnique([...entry.shas, ...shas]);
        entry.items.push(item);
      } else perCause.set(cause, { items: [item], shas });
    }
    for (const [cause, { items, shas }] of perCause) {
      cause.status = 'open';
      const { hunks, code } = await attemptHunks(reads, shas);
      const identifiers = items.map((entry) => entry.identifier);
      cause.attempts.push({
        round,
        identifier: identifiers[0],
        identifiers,
        key: items[0].key,
        keys: [...new Set(items.map((entry) => entry.key))],
        before,
        after,
        shas,
        hunks,
        ...(code ? { code } : {}),
        ineffective: false,
      });
      attempts.push({
        cause: cause.id,
        reviewer: cause.reviewer,
        identifiers,
        shas,
        ...(code ? { code } : {}),
      });
    }
    const freeText = [...minted.byId.values()].find((entry) => entry.kind === 'free-text');
    if (freeText && (received.claims.get(freeText.identifier) ?? []).length > 0) {
      for (const name of ciChecks) {
        addCiAttempt(state, name);
        ci.push(name);
      }
    }
  }

  const record = {
    round,
    before,
    after,
    gateMerges,
    uncertain,
    reasons: [...reasons].sort(),
    inert: received.inert,
    inertCount: received.inertCount,
    duplicates: received.duplicates,
    attribution,
    postCheck: {
      status: check.status,
      reason: check.reason,
      outside: check.outside,
      mergeCommits: check.mergeCommits,
      undetermined: check.undetermined,
    },
    foreignCheck: {
      status: foreignCheck.status,
      outside: foreignCheck.outside,
      mergeCommits: foreignCheck.mergeCommits,
      undetermined: foreignCheck.undetermined,
    },
    declared: received.declared,
    attempts,
    ci,
  };
  state.rounds.push(record);
  state.lastRoundUncertain = uncertain;
  state.timeline.push({
    type: 'round',
    round,
    before,
    after,
    uncertain,
    foreign: attribution.foreign,
  });
  if (received.declared.length > 0) {
    state.stop = { reason: 'scope-expansion-declared', round, declared: received.declared };
  } else if (check.reason !== null) {
    state.stop = { reason: check.reason, round };
  } else if (foreignCheck.reason !== null) {
    state.stop = {
      reason: 'foreign-commit-unverified',
      round,
      outside: foreignCheck.outside,
      mergeCommits: foreignCheck.mergeCommits,
      undetermined: foreignCheck.undetermined,
    };
  } else if (scopeLineMissing) {
    state.stop = { reason: 'scope-line-missing', round };
  }
  const flags = rerecorded ? { rerecorded } : {};
  if (state.stop !== null) return stopped(state, { round: record, ...flags });
  return {
    state,
    decision: 'continue',
    stop: null,
    round: record,
    ...flags,
    counts: countsOf(state),
    report: null,
  };
}

// The latest round, uncertain only because a returned SHA lay outside its range, with nothing
// recorded after it: a lagging forge head may have cut that range short.
function rerecordable(state, stored) {
  const last = state.timeline.at(-1);
  return (
    state.rounds.at(-1) === stored &&
    stored.reasons.length === 1 &&
    stored.reasons[0] === 'returned-outside-range' &&
    last?.type === 'round' &&
    last.round === stored.round
  );
}

// ---------------------------------------------------------------------------------------------
// Observation and stop rule

function normalizeAnchor(value) {
  if (value === undefined || value === null) return null;
  requireObject(value, 'anchor');
  return value;
}

function normalizeObservations(value) {
  return requireArray(value, 'observations').map((observation, i) => {
    const label = `observations[${i}]`;
    requireObject(observation, label);
    return {
      reviewer: reviewerOf(observation.reviewer, `${label}.reviewer`),
      head: requireSha(observation.head, `${label}.head`),
      findings: requireArray(observation.findings, `${label}.findings`).map((finding, j) => {
        requireObject(finding, `${label}.findings[${j}]`);
        return {
          key: requireString(finding.key, `${label}.findings[${j}].key`),
          anchor: normalizeAnchor(finding.anchor),
        };
      }),
    };
  });
}

function normalizeEvents(value) {
  return requireArray(value, 'events').map((event, i) => {
    requireObject(event, `events[${i}]`);
    if (!EVENT_TYPES.includes(event.type))
      fail(`events[${i}].type must be ${EVENT_TYPES.join(', ')}`);
    return event.sha === undefined
      ? { type: event.type }
      : { type: event.type, sha: requireSha(event.sha, `events[${i}].sha`) };
  });
}

const positiveLine = (value) => Number.isSafeInteger(value) && value > 0;

// The anchored line span on the observed head, or the reason it is not a current right-side line.
function currentSpan(anchor) {
  if (anchor === null) return { reason: 'no-anchor' };
  if (anchor.lineOutdated !== false) return { reason: 'line-outdated' };
  if (typeof anchor.path !== 'string' || anchor.path === '' || !positiveLine(anchor.line)) {
    return { reason: 'anchor-invalid' };
  }
  const start =
    positiveLine(anchor.startLine) && anchor.startLine <= anchor.line
      ? anchor.startLine
      : anchor.line;
  return { path: anchor.path, start, end: anchor.line };
}

// Whether one attempt's repair hunks overlap the span on `head`: `true`, `false`, or an
// uncertainty reason. Any change of the anchored path after the attempt's after-head, and any
// in-round change after the commit whose hunk is compared, makes the line coordinates incomparable.
async function attemptOverlap(attempt, span, head, reads) {
  if (attempt.hunks === null) return { reason: attempt.code ?? 'hunks-unreadable' };
  if (attempt.after !== head) {
    const changed = await reads.pathChanged(attempt.after, head, span.path);
    if (!changed.ok) return { reason: changed.code };
    if (changed.value) return { reason: 'path-changed' };
  }
  for (const { sha, files } of attempt.hunks) {
    const file = files.find((entry) => entry.path === span.path);
    if (!file) continue;
    if (sha !== attempt.after) {
      const shifted = await reads.pathChanged(sha, attempt.after, span.path);
      if (!shifted.ok) return { reason: shifted.code };
      if (shifted.value) return { reason: 'path-changed' };
    }
    if (file.ranges.some(([start, end]) => start <= span.end && span.start <= end)) {
      return { overlap: true };
    }
  }
  return { overlap: false };
}

async function classify(finding, reviewer, head, state, reads) {
  const own = state.causes.filter((cause) => cause.reviewer === reviewer);
  const byKey = own.find((cause) => cause.keys.includes(finding.key));
  if (byKey) return { key: finding.key, class: 'same', cause: byKey.id, via: 'key' };
  const span = currentSpan(finding.anchor);
  if (span.reason) return { key: finding.key, class: 'uncertain', reason: span.reason };
  // Per open cause: an overlap with any of its attempts, else the first uncertainty among them.
  // A match is `same` only when exactly one cause overlaps and no other cause is uncertain.
  const overlapping = [];
  const uncertain = [];
  for (const cause of own.filter((entry) => entry.status === 'open')) {
    let reason = null;
    let overlap = false;
    for (const attempt of cause.attempts) {
      const result = await attemptOverlap(attempt, span, head, reads);
      if (result.reason) reason ??= result.reason;
      else if (result.overlap) overlap = true;
    }
    if (overlap) overlapping.push(cause.id);
    else if (reason !== null) uncertain.push(reason);
  }
  if (overlapping.length === 1 && uncertain.length === 0) {
    return { key: finding.key, class: 'same', cause: overlapping[0], via: 'overlap' };
  }
  if (overlapping.length > 0) {
    return { key: finding.key, class: 'uncertain', reason: 'ambiguous-overlap' };
  }
  if (uncertain.length > 0) return { key: finding.key, class: 'uncertain', reason: uncertain[0] };
  return { key: finding.key, class: 'new' };
}

async function judgeCause(cause, results, head, reads) {
  const same = results.filter((result) => result.class === 'same' && result.cause === cause.id);
  const anyUncertain = results.some((result) => result.class === 'uncertain');
  const last = cause.attempts.at(-1);
  let fresh;
  if (last) {
    if (last.after === head) fresh = true;
    else {
      const read = await reads.isAncestor(last.after, head);
      if (!read.ok) return { verdict: 'no-evidence', code: read.code };
      fresh = read.value;
    }
  } else {
    fresh = cause.lastReportedHead !== head;
  }
  if (same.length > 0) {
    if (last && !fresh) return { verdict: 'no-evidence' };
    cause.lastReportedHead = head;
    if (last) last.ineffective = true;
    if (cause.attempts.length >= STOP_AFTER_ATTEMPTS)
      return { verdict: 'still-blocking', stop: true };
    return { verdict: 'still-blocking' };
  }
  if (!fresh) return { verdict: 'no-evidence' };
  if (anyUncertain) return { verdict: 'unresolved-uncertain' };
  cause.status = 'resolved';
  cause.history.push({ resolvedAt: head, attempts: cause.attempts });
  cause.attempts = [];
  return { verdict: 'resolved' };
}

export async function evaluate(input, reads) {
  const state = normalizeState(input.state);
  const head = requireSha(input.head, 'head');
  const observations = normalizeObservations(input.observations);
  const events = normalizeEvents(input.events);
  if (state.stop !== null) return stopped(state, { classifications: [], causes: [] });
  state.timeline.push(...events.map((event) => ({ ...event, head })));

  const classifications = [];
  const causes = [];
  for (const observation of observations) {
    if (observation.head !== head) {
      classifications.push({ reviewer: observation.reviewer, stale: true, results: [] });
      continue;
    }
    const reviewer = observation.reviewer;
    const results = [];
    for (const finding of observation.findings) {
      results.push(
        state.lastRoundUncertain
          ? { key: finding.key, class: 'uncertain', reason: 'uncertain-round' }
          : await classify(finding, reviewer, head, state, reads),
      );
    }
    const judged = state.causes.filter((cause) => cause.reviewer === reviewer);
    const reopened = new Set();
    for (const result of results) {
      if (result.class === 'same') {
        const cause = judged.find((entry) => entry.id === result.cause);
        if (cause.status === 'resolved') {
          cause.status = 'open';
          reopened.add(cause.id);
        }
        if (!cause.keys.includes(result.key)) cause.keys.push(result.key);
      }
    }
    for (const cause of judged.filter((entry) => entry.status === 'open')) {
      // A resolved cause re-reported under one of its keys reopens with a counter of zero.
      let verdict;
      if (reopened.has(cause.id)) {
        cause.lastReportedHead = head;
        verdict = { verdict: 'reopened' };
      } else {
        verdict = await judgeCause(cause, results, head, reads);
      }
      causes.push({ cause: cause.id, reviewer, ...verdict });
      if (verdict.stop && state.stop === null) {
        state.stop = {
          reason: 'ineffective-repairs',
          cause: cause.id,
          reviewer,
          attempts: cause.attempts.length,
          head,
        };
      }
    }
    for (const result of results) {
      if (result.class === 'new' && !findCause(state, reviewer, result.key)) {
        newCause(state, reviewer, result.key, head);
      }
    }
    classifications.push({ reviewer, stale: false, results });
  }
  if (state.stop !== null) return stopped(state, { classifications, causes });
  return {
    state,
    decision: 'continue',
    stop: null,
    classifications,
    causes,
    counts: countsOf(state),
    report: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Operations

export async function executeOperation(operation, input = {}, deps = {}) {
  try {
    if (!REPAIR_ATTEMPT_OPERATIONS.includes(operation)) fail(`unknown operation: ${operation}`);
    requireObject(input, 'input');
    let data;
    if (operation === 'scope-check') {
      const scope = normalizeScope(input.scope);
      const changes = normalizeChanges(input.changes);
      const reads =
        input.cwd === undefined
          ? null
          : (deps.reads ?? createGitReads(deps.runner, requireCwd(input.cwd)));
      data = await scopeCheck(scope, changes, reads);
    } else {
      const reads = deps.reads ?? createGitReads(deps.runner, requireCwd(input.cwd));
      if (operation === 'scope-read') data = await scopeRead(input, reads);
      else if (operation === 'attribute') data = await attribute(input, reads);
      else if (operation === 'post-check') data = await postCheck(input, reads);
      else if (operation === 'record') data = await recordRound(input, reads);
      else data = await evaluate(input, reads);
    }
    return { ok: true, operation, data };
  } catch (error) {
    return errorEnvelope(operation, error);
  }
}

export function errorEnvelope(operation, error) {
  const normalized =
    error instanceof RepairAttemptError
      ? error
      : new RepairAttemptError(
          'INTERNAL_ERROR',
          error?.message ?? 'unexpected repair-attempt failure',
        );
  return {
    ok: false,
    operation: operation ?? null,
    error: { code: normalized.code, message: normalized.message },
  };
}

export function exitCodeFor(envelope) {
  if (envelope.ok) return 0;
  return EXIT_CODES[envelope.error.code] ?? 1;
}
