// Git evidence about a pull request's delivery, read from the local repository only: whether a plan
// pull request's head carries anything beyond its plan, and whether its head merges into the base
// without a conflict. The remote tracker's `pr-draft-classify` and `merge-proof-local` operations are
// its callers; `autopilot-core.mjs` takes the archive-path rule from here. It lives apart from
// `conflict-validation-core.mjs`, whose subject is CI detection, and imports no tracker or autopilot
// module, so every one of those can import it without a cycle.
//
// - `archivePathFor(P)` is the one archive path plan archival produces: `<dir>/archive/<file>`.
// - `planOnlyEvidence` lists the paths that differ between the merge base of `origin/<baseRef>` and
//   the head and the head itself (`--no-renames`), and reports `planOnly: true` when no path other
//   than the plan path `P` and its archive path `A` is among them, whatever the archive state.
// - `localMergeProof` runs `git merge-tree --write-tree` for the head against `origin/<baseRef>`.
//   It needs Git 2.38 or newer. Because `--write-tree` writes the merged tree and blob objects, it
//   runs against a temporary private object directory (`GIT_OBJECT_DIRECTORY`) with the repository's
//   own object directory as an alternate, the pattern of `diff-baseline-core.mjs`, and removes that
//   directory afterwards (a failed removal leaves it behind and keeps the proof's result); the
//   repository's object set is unchanged. Git may still freshen (touch the
//   mtime of) an object it finds through the alternate. Every failure that keeps the proof from
//   running is `unavailable` with a named reason, never `clean`.
//
// Nothing here fetches, writes a ref, the index or the working tree, or runs a hook (`merge-tree`
// runs none). Every call goes through the injected runner without a shell, under an environment
// stripped of inherited `GIT_*` variables, with optional locks, terminal prompts, lazy fetch and
// replace objects disabled. The caller fetches the refs beforehand.

import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { isSafeBaseRef } from './config-resolve-core.mjs';
import { asBuffer, errorDetail, gitBaseEnv, runGit } from './runtime-state-guard.mjs';

// `merge-tree --write-tree` exists from Git 2.38 on.
export const MERGE_PROOF_MINIMUM_GIT_VERSION = Object.freeze([2, 38]);
export const MERGE_PROOF_STATUSES = Object.freeze(['clean', 'conflict', 'unavailable']);
// The reasons an `unavailable` proof names. Stable strings, so a caller can report them.
export const MERGE_PROOF_UNAVAILABLE_REASONS = Object.freeze([
  'git-version',
  'git-version-unreadable',
  'not-a-repository',
  'shallow-repository',
  'base-ref-missing',
  'head-missing',
  'object-directory-unresolved',
  'temporary-directory-failed',
  'no-merge-base',
  'merge-tree-failed',
  'timeout',
  'unexpected-output',
]);
export const PR_DELIVERY_GIT_ERROR_CODES = Object.freeze([
  'INVALID_INPUT',
  'GIT_FAILED',
  'SHALLOW_REPOSITORY',
  'BASE_REF_MISSING',
  'HEAD_MISSING',
  'NO_MERGE_BASE',
]);

// A merge of a large tree is bounded, so a stuck Git cannot hold the caller's run open.
export const MERGE_PROOF_TIMEOUT_MS = 120_000;

const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const ORIGIN_REF_PREFIX = 'refs/remotes/origin/';
const TEMP_PREFIX = 'effective-flow-merge-proof-';

export class PrDeliveryGitError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PrDeliveryGitError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new PrDeliveryGitError(code, message, details);
}

// The one archive path plan archival produces for a plan: `<dir>/archive/<file>`.
export function archivePathFor(planPath) {
  return path.posix.join(path.posix.dirname(planPath), 'archive', path.posix.basename(planPath));
}

// `deps.runner` is the injected process runner (`process-runner.mjs` in the CLI, a fake in tests);
// `deps.env` replaces `process.env` as the source the Git environment is derived from;
// `deps.tmpdir` replaces the system temporary directory the merge proof's object directory lives in.
function makeContext(deps = {}) {
  if (typeof deps.runner !== 'function') {
    fail('INVALID_INPUT', 'a process runner is required');
  }
  return {
    runner: deps.runner,
    env: { ...gitBaseEnv(deps.env ?? process.env), GIT_NO_LAZY_FETCH: '1' },
    tmpdir: deps.tmpdir ?? tmpdir(),
    removeDirectory:
      deps.removeDirectory ?? ((directory) => rm(directory, { recursive: true, force: true })),
  };
}

function requireCwd(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    fail('INVALID_INPUT', 'cwd must be an absolute path', { field: 'cwd' });
  }
  return value;
}

function requireHeadSha(value) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value.toLowerCase())) {
    fail('INVALID_INPUT', 'headSha must be a full commit object id', { field: 'headSha' });
  }
  return value.toLowerCase();
}

// The base branch name as the forge states it (`main`), never `origin/main` or a full ref: the
// helpers read `refs/remotes/origin/<baseRef>`, the ref the caller's fetch updated.
function requireBaseRef(value) {
  if (!isSafeBaseRef(value)) {
    fail('INVALID_INPUT', 'baseRef must be a safe base branch name', { field: 'baseRef' });
  }
  return value;
}

function requireRepositoryPath(value, field) {
  if (
    typeof value !== 'string' ||
    value === '' ||
    value.startsWith('/') ||
    value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    fail('INVALID_INPUT', `${field} must be a repository-relative path`, { field });
  }
  return value;
}

function stdoutText(result) {
  return asBuffer(result?.stdout).toString('utf8').trim();
}

function failed(result) {
  return Boolean(result?.error) || typeof result?.status !== 'number';
}

// The running Git's `[major, minor]`, or null when `git --version` states none.
export async function readGitVersion(context, cwd) {
  const result = await runGit(context, cwd, ['--version']);
  if (failed(result) || result.status !== 0) return null;
  const match = stdoutText(result).match(/^git version (\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

export function meetsGitVersion(version, minimum = MERGE_PROOF_MINIMUM_GIT_VERSION) {
  if (!Array.isArray(version)) return false;
  const [major, minor] = version;
  return major > minimum[0] || (major === minimum[0] && minor >= minimum[1]);
}

// `true`/`false` for a readable repository, null when `cwd` is none.
async function isShallowRepository(context, cwd) {
  const result = await runGit(context, cwd, ['rev-parse', '--is-shallow-repository']);
  if (failed(result) || result.status !== 0) return null;
  return stdoutText(result) === 'true';
}

// The commit `rev` names, or null when it names none (`rev-parse --verify -q` status 1). Any other
// failure is GIT_FAILED.
async function resolveCommit(context, cwd, rev) {
  const result = await runGit(context, cwd, [
    '--no-replace-objects',
    'rev-parse',
    '--verify',
    '-q',
    `${rev}^{commit}`,
  ]);
  if (failed(result)) fail('GIT_FAILED', 'git rev-parse could not run');
  if (result.status === 1) return null;
  if (result.status !== 0) {
    fail('GIT_FAILED', `git rev-parse failed: ${errorDetail(result.stderr)}`);
  }
  const commit = stdoutText(result).toLowerCase();
  if (!OBJECT_ID.test(commit)) fail('GIT_FAILED', 'git rev-parse printed no commit');
  return commit;
}

// The base commit and the verified head, or a PrDeliveryGitError naming the missing one.
async function resolveRange(context, cwd, baseRef, headSha) {
  const shallow = await isShallowRepository(context, cwd);
  if (shallow === null) fail('GIT_FAILED', 'cwd is not inside a readable Git repository');
  if (shallow) fail('SHALLOW_REPOSITORY', 'the repository is shallow, so no merge base is proven');
  const baseCommit = await resolveCommit(context, cwd, `${ORIGIN_REF_PREFIX}${baseRef}`);
  if (baseCommit === null) {
    fail('BASE_REF_MISSING', `${ORIGIN_REF_PREFIX}${baseRef} names no commit`, { baseRef });
  }
  const head = await resolveCommit(context, cwd, headSha);
  if (head !== headSha) fail('HEAD_MISSING', 'headSha names no commit in the repository');
  return { baseCommit, head };
}

// The validated `{ cwd, headSha, baseRef }` both helpers take, for a caller that checks its input
// before it reads anything else. Throws PrDeliveryGitError INVALID_INPUT.
export function parseRangeInput(input) {
  return {
    cwd: requireCwd(input?.cwd),
    headSha: requireHeadSha(input?.headSha),
    baseRef: requireBaseRef(input?.baseRef),
  };
}

// Whether the head's merge-base diff against `origin/<baseRef>` touches only the plan path `P` and
// its archive path `A` (`A` defaults to `archivePathFor(P)`). Returns
// `{ planOnly, changedPathCount, baseCommit, mergeBase }`; an empty diff is plan-only too, because it
// carries no delivery. Throws PrDeliveryGitError on invalid input and on every Git failure: a shallow
// repository, a missing base ref or head, no merge base, or a failed diff.
export async function planOnlyEvidence(input, deps = {}) {
  const cwd = requireCwd(input?.cwd);
  const headSha = requireHeadSha(input?.headSha);
  const baseRef = requireBaseRef(input?.baseRef);
  const planPath = requireRepositoryPath(input?.planPath, 'planPath');
  const archivePath =
    input?.archivePath === undefined
      ? archivePathFor(planPath)
      : requireRepositoryPath(input.archivePath, 'archivePath');
  const context = makeContext(deps);
  const { baseCommit } = await resolveRange(context, cwd, baseRef, headSha);
  const base = await runGit(context, cwd, [
    '--no-replace-objects',
    'merge-base',
    baseCommit,
    headSha,
  ]);
  if (failed(base)) fail('GIT_FAILED', 'git merge-base could not run');
  if (base.status === 1) fail('NO_MERGE_BASE', 'the head shares no history with the base');
  if (base.status !== 0) fail('GIT_FAILED', `git merge-base failed: ${errorDetail(base.stderr)}`);
  const mergeBase = stdoutText(base).toLowerCase();
  if (!OBJECT_ID.test(mergeBase)) fail('GIT_FAILED', 'git merge-base printed no commit');
  const diff = await runGit(context, cwd, [
    '--no-replace-objects',
    'diff',
    '--name-only',
    '-z',
    '--no-renames',
    '--no-ext-diff',
    '--no-textconv',
    mergeBase,
    headSha,
    '--',
  ]);
  if (failed(diff) || diff.status !== 0) {
    fail('GIT_FAILED', `git diff failed: ${errorDetail(diff?.stderr)}`);
  }
  const paths = asBuffer(diff.stdout).toString('utf8').split('\0').filter(Boolean);
  return {
    planOnly: paths.every((entry) => entry === planPath || entry === archivePath),
    changedPathCount: paths.length,
    baseCommit,
    mergeBase,
  };
}

function unavailable(reason, extra = {}) {
  return { status: 'unavailable', reason, ...extra };
}

async function realObjectDirectory(context, cwd) {
  const result = await runGit(context, cwd, [
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'objects',
  ]);
  if (failed(result) || result.status !== 0) return null;
  try {
    return await realpath(stdoutText(result));
  } catch {
    return null;
  }
}

// Whether the merge-tree run was stopped by its bound. The process runner reports that as
// `timedOut: true` for a process-group call, the mode the proof requests; on a platform without
// process groups it falls back to a direct bounded spawn, whose stop shows only as a null status
// with the bound's SIGTERM, or with `forcedKill` once it had to escalate to SIGKILL.
function stoppedByBound(result) {
  if (result?.timedOut === true) return true;
  return (
    result?.status === null &&
    !result.error &&
    (result.signal === 'SIGTERM' || result.forcedKill === true)
  );
}

// Classifies one `merge-tree --write-tree -z --name-only --no-messages` run: status 0 with exactly
// the merged tree id is clean, status 1 with the tree id and the conflicted paths is a conflict, and
// anything else proves nothing.
function mergeTreeOutcome(result) {
  if (stoppedByBound(result)) return unavailable('timeout');
  if (failed(result)) return unavailable('merge-tree-failed');
  const fields = asBuffer(result.stdout).toString('utf8').split('\0').filter(Boolean);
  if (result.status === 0) {
    return fields.length === 1 && OBJECT_ID.test(fields[0])
      ? { status: 'clean', reason: null, conflictCount: 0 }
      : unavailable('unexpected-output');
  }
  if (result.status === 1 && fields.length >= 1 && OBJECT_ID.test(fields[0])) {
    const conflictCount = new Set(fields.slice(1)).size;
    return conflictCount > 0
      ? { status: 'conflict', reason: null, conflictCount }
      : unavailable('unexpected-output');
  }
  const detail = asBuffer(result.stderr).toString('utf8');
  if (/unrelated histories/i.test(detail)) return unavailable('no-merge-base');
  return unavailable('merge-tree-failed');
}

// The local merge proof: `{ status, reason, gitVersion, baseCommit, headSha, conflictCount }`, where
// `status` is `clean`, `conflict` or `unavailable` and `reason` names why an `unavailable` proof
// could not run (one of MERGE_PROOF_UNAVAILABLE_REASONS; null otherwise). Fields a proof did not
// reach are null. Only invalid input throws (PrDeliveryGitError INVALID_INPUT); every Git failure is
// `unavailable`.
export async function localMergeProof(input, deps = {}) {
  const cwd = requireCwd(input?.cwd);
  const headSha = requireHeadSha(input?.headSha);
  const baseRef = requireBaseRef(input?.baseRef);
  const context = makeContext(deps);
  const report = { gitVersion: null, baseCommit: null, headSha, conflictCount: null };
  const version = await readGitVersion(context, cwd);
  if (version === null) return unavailable('git-version-unreadable', report);
  report.gitVersion = version.join('.');
  if (!meetsGitVersion(version)) {
    return unavailable('git-version', {
      ...report,
      minimumGitVersion: MERGE_PROOF_MINIMUM_GIT_VERSION.join('.'),
    });
  }
  let range;
  try {
    range = await resolveRange(context, cwd, baseRef, headSha);
  } catch (error) {
    if (!(error instanceof PrDeliveryGitError)) throw error;
    const reason = {
      SHALLOW_REPOSITORY: 'shallow-repository',
      BASE_REF_MISSING: 'base-ref-missing',
      HEAD_MISSING: 'head-missing',
    }[error.code];
    return unavailable(reason ?? 'not-a-repository', report);
  }
  report.baseCommit = range.baseCommit;
  const objects = await realObjectDirectory(context, cwd);
  if (objects === null) return unavailable('object-directory-unresolved', report);
  let directory;
  try {
    directory = await mkdtemp(path.join(context.tmpdir, TEMP_PREFIX));
  } catch {
    return unavailable('temporary-directory-failed', report);
  }
  try {
    const privateObjects = path.join(directory, 'objects');
    try {
      await mkdir(privateObjects, { mode: 0o700 });
    } catch {
      return unavailable('temporary-directory-failed', report);
    }
    const result = await runGit(
      context,
      cwd,
      [
        '--no-replace-objects',
        'merge-tree',
        '--write-tree',
        '-z',
        '--name-only',
        '--no-messages',
        range.baseCommit,
        headSha,
      ],
      {
        env: {
          ...context.env,
          GIT_OBJECT_DIRECTORY: privateObjects,
          GIT_ALTERNATE_OBJECT_DIRECTORIES: objects,
        },
        timeoutMs: MERGE_PROOF_TIMEOUT_MS,
        // The bound stops the whole process group, so a helper Git started cannot outlive it, and
        // the runner states the stop as `timedOut`.
        processGroup: true,
      },
    );
    const outcome = mergeTreeOutcome(result);
    return {
      ...report,
      ...outcome,
      conflictCount: outcome.status === 'unavailable' ? null : outcome.conflictCount,
    };
  } finally {
    // The proof is already decided when the cleanup runs, and a directory left behind does not
    // change it: the repository's own object set was never written. A failed removal therefore
    // never replaces the result (or the error) the proof produced.
    try {
      await context.removeDirectory(directory);
    } catch {
      // The proof result stands.
    }
  }
}
