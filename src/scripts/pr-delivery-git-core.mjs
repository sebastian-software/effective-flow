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
// - The branch tree proofs show that a local branch tip `T` has landed in the base `B` =
//   `origin/<baseRef>`, for cleanup's deletion of squash-merged delivery branches.
//   `branchProofRepository` reads the repository-wide facts once (`info/grafts`, shallow, Git
//   version, `B`); `branchTipProof` tries `ancestor` (`T` is an ancestor of `B`, no Git version
//   floor), then `tip-tree` (exactly one merge base `M`, a non-empty `M..T`, and a conflict-free
//   `merge-tree --write-tree B T` equal to `tree(B)`); `branchSquashProof`, only after `tip-tree`
//   was `not-proven`, searches the first-parent commits `S` of `M..B` for one whose conflict-free
//   `merge-tree --write-tree S^1 T` equals `tree(S)` (at most SQUASH_TREE_CANDIDATE_LIMIT
//   candidates); `verifyBranchProof` re-runs one fixed proof at delete time without a search. Each
//   merge runs in a private object directory like `localMergeProof`, under
//   `-c merge.renormalize=false -c merge.default=text`, after an attribute pre-check that refuses
//   any merge driver or text/eol conversion on a changed path, so no configured driver runs. Every
//   proof Git call runs with `GIT_NO_REPLACE_OBJECTS=1`, no inherited `GIT_GRAFT_FILE`, and a bound
//   from the caller's deadline; anything unproven is a stable reason, never a proof.
//
// Nothing here fetches, writes a ref, the index or the working tree, or runs a hook (`merge-tree`
// runs none; `check-attr`, the one call that reads the index, runs with `core.fsmonitor=false`). Every call goes through the injected runner without a shell, under an environment
// stripped of inherited `GIT_*` variables, with optional locks, terminal prompts, lazy fetch and
// replace objects disabled. The caller fetches the refs beforehand.

import { lstat, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
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
// `deps.tmpdir` replaces the system temporary directory the merge proof's object directory lives in;
// `deps.now` replaces `Date.now` as the clock a branch proof's deadline is read against.
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

// The repository's real object directory as `{ directory }`, or `{ failure }` naming why it is
// unknown: `timeout` when a branch proof's bounded call was stopped, `object-directory-unresolved`
// otherwise.
async function realObjectDirectory(context, cwd) {
  const result = await runGit(context, cwd, [
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'objects',
  ]);
  if (context.bounded === true && stoppedByBound(result)) return { failure: 'timeout' };
  if (failed(result) || result.status !== 0) return { failure: 'object-directory-unresolved' };
  try {
    return { directory: await realpath(stdoutText(result)) };
  } catch {
    return { failure: 'object-directory-unresolved' };
  }
}

// Runs `run(env)` once with an environment whose object directory is a fresh private temporary one
// that has the repository's own object directory as its alternate, so every object the call writes
// lands outside the repository, and removes that directory afterwards. Returns `{ value }` with
// what `run` returned, or `{ failure }` (`object-directory-unresolved`, `temporary-directory-failed`
// or `timeout`) when the directory could not be set up and `run` never ran.
async function withPrivateObjectDirectory(context, cwd, run) {
  const objects = await realObjectDirectory(context, cwd);
  if (objects.failure) return { failure: objects.failure };
  let directory;
  try {
    directory = await mkdtemp(path.join(context.tmpdir, TEMP_PREFIX));
  } catch {
    return { failure: 'temporary-directory-failed' };
  }
  try {
    const privateObjects = path.join(directory, 'objects');
    try {
      await mkdir(privateObjects, { mode: 0o700 });
    } catch {
      return { failure: 'temporary-directory-failed' };
    }
    return {
      value: await run({
        ...context.env,
        GIT_OBJECT_DIRECTORY: privateObjects,
        GIT_ALTERNATE_OBJECT_DIRECTORIES: objects.directory,
      }),
    };
  } finally {
    // The result is already decided when the cleanup runs, and a directory left behind does not
    // change it: the repository's own object set was never written. A failed removal therefore
    // never replaces the result (or the error) the call produced.
    try {
      await context.removeDirectory(directory);
    } catch {
      // The result stands.
    }
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
// anything else proves nothing. A clean outcome also carries the merged `tree`.
function mergeTreeOutcome(result) {
  if (stoppedByBound(result)) return unavailable('timeout');
  if (failed(result)) return unavailable('merge-tree-failed');
  const fields = asBuffer(result.stdout).toString('utf8').split('\0').filter(Boolean);
  if (result.status === 0) {
    return fields.length === 1 && OBJECT_ID.test(fields[0])
      ? { status: 'clean', reason: null, conflictCount: 0, tree: fields[0].toLowerCase() }
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
  const scoped = await withPrivateObjectDirectory(context, cwd, (env) =>
    runGit(
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
        env,
        timeoutMs: MERGE_PROOF_TIMEOUT_MS,
        // The bound stops the whole process group, so a helper Git started cannot outlive it, and
        // the runner states the stop as `timedOut`.
        processGroup: true,
      },
    ),
  );
  if (scoped.failure) return unavailable(scoped.failure, report);
  const { tree: _tree, ...outcome } = mergeTreeOutcome(scoped.value);
  return {
    ...report,
    ...outcome,
    conflictCount: outcome.status === 'unavailable' ? null : outcome.conflictCount,
  };
}

// ---------------------------------------------------------------------------------------------
// Branch tree proofs: whether a local branch's content has demonstrably landed in the base.

export const BRANCH_PROOFS = Object.freeze(['ancestor', 'tip-tree', 'squash-tree']);
// The reasons a branch proof that proves nothing names. Stable strings, so a caller can report them.
export const BRANCH_PROOF_REASONS = Object.freeze([
  'not-proven',
  'base-ref-missing',
  'empty-diff',
  'no-merge-base',
  'multiple-merge-bases',
  'merge-attribute',
  'grafts',
  'candidate-limit',
  'git-version',
  'shallow-repository',
  'timeout',
  'proof-unavailable',
]);
// The `detail` a `proof-unavailable` result names: the reused merge-proof failures plus a Git call
// that failed outright, unexpected Git output, an unreadable grafts path, and `invalid-input`, which
// a caller names for a proof call these functions refused (PrDeliveryGitError INVALID_INPUT).
export const BRANCH_PROOF_UNAVAILABLE_DETAILS = Object.freeze([
  'git-version-unreadable',
  'object-directory-unresolved',
  'temporary-directory-failed',
  'merge-tree-failed',
  'unexpected-output',
  'git-failed',
  'grafts-unreadable',
  'invalid-input',
]);
// At most this many first-parent base commits are tried as a branch's squash commit.
export const SQUASH_TREE_CANDIDATE_LIMIT = 64;

// The attribute values under which a merge-tree run uses Git's own text merge and converts nothing.
const MERGE_SAFE_ATTRIBUTES = Object.freeze({
  merge: new Set(['unspecified', 'text']),
  text: new Set(['unspecified', 'unset']),
  eol: new Set(['unspecified']),
});
const MERGE_TREE_CONFIG = Object.freeze([
  '-c',
  'merge.renormalize=false',
  '-c',
  'merge.default=text',
]);

// Ends a branch proof with a stable reason; caught at each entry point and turned into its result.
class BranchProofStop extends Error {
  constructor(reason, detail = null) {
    super(reason);
    this.reason = reason;
    this.detail = detail;
  }
}

function stopProof(reason, detail = null) {
  throw new BranchProofStop(reason, detail);
}

function requireObjectId(value, field) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value.toLowerCase())) {
    fail('INVALID_INPUT', `${field} must be a full object id`, { field });
  }
  return value.toLowerCase();
}

function requireDeadline(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('INVALID_INPUT', 'deadline must be a finite epoch time in milliseconds', {
      field: 'deadline',
    });
  }
  return value;
}

// The state `branchProofRepository` returned, handed back to a proof; only a usable one is accepted.
function requireRepositoryState(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    value.reason !== null ||
    typeof value.attributePathPrefix !== 'string' ||
    !(value.treeProofReason === null || typeof value.treeProofReason === 'string')
  ) {
    fail('INVALID_INPUT', 'repository must be a usable branchProofRepository result', {
      field: 'repository',
    });
  }
  return { ...value, baseCommit: requireObjectId(value.baseCommit, 'repository.baseCommit') };
}

// A context whose every Git call is bounded by what is left until the caller's `deadline` (epoch
// ms, read through `deps.now`), stops its whole process group at that bound, and runs without
// replace objects or an inherited grafts file. A call the deadline already passed is not started
// and reads as stopped by its bound.
function makeBoundedContext(deps, deadline) {
  const context = makeContext(deps);
  const now = deps.now ?? Date.now;
  const runner = context.runner;
  return {
    ...context,
    bounded: true,
    env: { ...context.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_GRAFT_FILE: undefined },
    runner: async (call) => {
      const remaining = Math.floor(deadline - now());
      if (remaining <= 0) {
        return { status: null, signal: null, stdout: Buffer.alloc(0), stderr: '', timedOut: true };
      }
      return runner({ ...call, timeoutMs: remaining, processGroup: true });
    },
  };
}

// One bounded proof Git call. A stop by the bound is `timeout`; a failure or a status outside
// `allowed` is `proof-unavailable` (`git-failed`).
async function proofGit(context, cwd, args, { allowed = [0], stdin, env } = {}) {
  const result = await runGit(context, cwd, ['--no-replace-objects', ...args], { env, stdin });
  if (stoppedByBound(result)) stopProof('timeout');
  if (failed(result) || !allowed.includes(result.status)) {
    stopProof('proof-unavailable', 'git-failed');
  }
  return result;
}

// Path bytes survive the round trip from one Git call's output to another's input unchanged.
function pathText(result) {
  return asBuffer(result.stdout).toString('latin1');
}

function objectIdOutput(result) {
  const value = stdoutText(result).toLowerCase();
  if (!OBJECT_ID.test(value)) stopProof('proof-unavailable', 'unexpected-output');
  return value;
}

// The commit `rev` names, or null when it names none.
async function proofCommitOf(context, cwd, rev) {
  const result = await proofGit(context, cwd, ['rev-parse', '--verify', '-q', `${rev}^{commit}`], {
    allowed: [0, 1],
  });
  return result.status === 1 ? null : objectIdOutput(result);
}

async function treeOf(context, cwd, commit) {
  return objectIdOutput(
    await proofGit(context, cwd, ['rev-parse', '--verify', '-q', `${commit}^{tree}`]),
  );
}

async function isAncestor(context, cwd, ancestor, descendant) {
  const result = await proofGit(
    context,
    cwd,
    ['merge-base', '--is-ancestor', ancestor, descendant],
    { allowed: [0, 1] },
  );
  return result.status === 0;
}

// The one merge base of `a` and `b`, or a stop: `no-merge-base` for none, `multiple-merge-bases`
// for more than one.
async function uniqueMergeBase(context, cwd, a, b) {
  const result = await proofGit(context, cwd, ['merge-base', '--all', a, b], { allowed: [0, 1] });
  const bases = stdoutText(result).split('\n').filter(Boolean);
  if (result.status === 1 && bases.length === 0) stopProof('no-merge-base');
  if (result.status !== 0 || bases.length === 0)
    stopProof('proof-unavailable', 'unexpected-output');
  if (bases.length > 1) stopProof('multiple-merge-bases');
  const base = bases[0].toLowerCase();
  if (!OBJECT_ID.test(base)) stopProof('proof-unavailable', 'unexpected-output');
  return base;
}

// Stops with `empty-diff` when the branch changes nothing against its merge base: a net-zero branch
// would otherwise merge into any base unchanged and prove nothing about its content.
async function requireBranchChange(context, cwd, mergeBase, tip) {
  const result = await proofGit(
    context,
    cwd,
    [
      'diff',
      '--quiet',
      '--no-relative',
      '--no-ext-diff',
      '--no-textconv',
      '--no-renames',
      mergeBase,
      tip,
      '--',
    ],
    { allowed: [0, 1] },
  );
  if (result.status === 0) stopProof('empty-diff');
}

async function changedPaths(context, cwd, from, to) {
  const result = await proofGit(context, cwd, [
    'diff',
    '-z',
    '--name-only',
    '--no-renames',
    '--no-relative',
    '--no-ext-diff',
    '--no-textconv',
    from,
    to,
    '--',
  ]);
  return pathText(result).split('\0').filter(Boolean);
}

// The attribute pre-check before one merge-tree call: over every path either side changed against
// the call's merge base (`--no-renames`, so a rename names both paths), any `merge` value other than
// unspecified or `text`, or any text or eol conversion, stops with `merge-attribute`, so no
// configured merge driver ever runs. It reads attributes in the same cwd the merge runs in.
// Git looks a driver name up among the configured `merge.<name>.*` drivers before its built-in
// ones, and both allowed values reach the name `text` (unspecified through the forced
// `merge.default=text`, which a `-c` override wins), so any configured `merge.text.*` key is
// `merge-attribute` too; no other driver name is reachable.
async function requireNoTextDriver(context, cwd) {
  const configured = await proofGit(
    context,
    cwd,
    ['config', '-z', '--get-regexp', '^merge\\.text\\.'],
    { allowed: [0, 1] },
  );
  if (configured.status === 0) stopProof('merge-attribute');
}

async function attributePreCheck(context, cwd, repository, mergeBase, sides) {
  await requireNoTextDriver(context, cwd);
  const paths = new Set();
  for (const side of sides) {
    for (const entry of await changedPaths(context, cwd, mergeBase, side)) paths.add(entry);
  }
  if (paths.size === 0) return;
  const list = [...paths].map((entry) => `${repository.attributePathPrefix}${entry}`);
  const result = await proofGit(
    context,
    cwd,
    // check-attr reads the index, which would run a configured `core.fsmonitor` hook.
    ['-c', 'core.fsmonitor=false', 'check-attr', '-z', '--stdin', 'merge', 'text', 'eol'],
    { stdin: Buffer.from(`${list.join('\0')}\0`, 'latin1') },
  );
  const fields = pathText(result).split('\0');
  if (fields.pop() !== '' || fields.length !== list.length * 9) {
    stopProof('proof-unavailable', 'unexpected-output');
  }
  for (let index = 0; index < fields.length; index += 3) {
    const allowed = MERGE_SAFE_ATTRIBUTES[fields[index + 1]];
    if (!allowed) stopProof('proof-unavailable', 'unexpected-output');
    if (!allowed.has(fields[index + 2])) stopProof('merge-attribute');
  }
}

// Whether a conflict-free `merge-tree --write-tree ours theirs`, written into a private object
// directory, produces exactly `expectedTree`. A conflict or another tree is `false`.
async function mergeTreeProduces(context, cwd, ours, theirs, expectedTree) {
  const scoped = await withPrivateObjectDirectory(context, cwd, (env) =>
    runGit(
      context,
      cwd,
      [
        '--no-replace-objects',
        ...MERGE_TREE_CONFIG,
        'merge-tree',
        '--write-tree',
        '-z',
        '--name-only',
        '--no-messages',
        ours,
        theirs,
      ],
      { env },
    ),
  );
  if (scoped.failure === 'timeout') stopProof('timeout');
  if (scoped.failure) stopProof('proof-unavailable', scoped.failure);
  const outcome = mergeTreeOutcome(scoped.value);
  if (outcome.status === 'unavailable') {
    if (outcome.reason === 'timeout' || outcome.reason === 'no-merge-base') {
      stopProof(outcome.reason);
    }
    stopProof('proof-unavailable', outcome.reason);
  }
  return outcome.status === 'clean' && outcome.tree === expectedTree;
}

function proven(proof, proofCommit) {
  return { proof, proofCommit, reason: null, detail: null };
}

function unproven(reason, detail = null) {
  return { proof: null, proofCommit: null, reason, detail };
}

async function settleProof(work) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof BranchProofStop) return unproven(error.reason, error.detail);
    throw error;
  }
}

async function gitVersionOf(context, cwd) {
  const result = await runGit(context, cwd, ['--version']);
  if (stoppedByBound(result)) stopProof('timeout');
  if (failed(result) || result.status !== 0) return null;
  const match = stdoutText(result).match(/^git version (\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

async function graftsPresent(context, cwd) {
  const result = await proofGit(context, cwd, [
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'info/grafts',
  ]);
  const file = stdoutText(result);
  if (!path.isAbsolute(file)) stopProof('proof-unavailable', 'unexpected-output');
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return false;
    stopProof('proof-unavailable', 'grafts-unreadable');
  }
  return false;
}

async function repositoryState(context, cwd, baseRef) {
  const state = {
    reason: null,
    detail: null,
    baseCommit: null,
    gitVersion: null,
    treeProofReason: null,
    treeProofDetail: null,
    attributePathPrefix: '',
  };
  try {
    if (await graftsPresent(context, cwd)) stopProof('grafts');
    const shallow = await proofGit(context, cwd, ['rev-parse', '--is-shallow-repository']);
    if (stdoutText(shallow) !== 'false') {
      if (stdoutText(shallow) === 'true') stopProof('shallow-repository');
      stopProof('proof-unavailable', 'unexpected-output');
    }
    const version = await gitVersionOf(context, cwd);
    state.gitVersion = version === null ? null : version.join('.');
    if (version === null) {
      state.treeProofReason = 'proof-unavailable';
      state.treeProofDetail = 'git-version-unreadable';
    } else if (!meetsGitVersion(version)) {
      state.treeProofReason = 'git-version';
    }
    // check-attr reads its paths relative to the cwd, diff prints them relative to the top level.
    state.attributePathPrefix = asBuffer(
      (await proofGit(context, cwd, ['rev-parse', '--show-cdup'])).stdout,
    )
      .toString('latin1')
      .replace(/\n$/, '');
    state.baseCommit = await proofCommitOf(context, cwd, `${ORIGIN_REF_PREFIX}${baseRef}`);
    if (state.baseCommit === null) stopProof('base-ref-missing');
  } catch (error) {
    if (!(error instanceof BranchProofStop)) throw error;
    return { ...state, reason: error.reason, detail: error.detail, baseCommit: null };
  }
  return state;
}

// The repository-wide facts every branch proof rests on, read once per run: `{ reason, detail,
// baseCommit, gitVersion, treeProofReason, treeProofDetail, attributePathPrefix }`. `reason` is null
// when proofs can run, else `grafts` (an `info/grafts` file exists), `shallow-repository`,
// `base-ref-missing` (`refs/remotes/origin/<baseRef>` names no commit), `timeout` or
// `proof-unavailable` with its `detail`. `treeProofReason` is null when `tip-tree` and
// `squash-tree` can run, else `git-version` (below 2.38) or `proof-unavailable`
// (`git-version-unreadable`); `ancestor` needs no Git version. Input `{ cwd, baseRef, deadline }`;
// only invalid input throws (PrDeliveryGitError INVALID_INPUT).
export async function branchProofRepository(input, deps = {}) {
  const cwd = requireCwd(input?.cwd);
  const baseRef = requireBaseRef(input?.baseRef);
  const context = makeBoundedContext(deps, requireDeadline(input?.deadline));
  return repositoryState(context, cwd, baseRef);
}

// `tip-tree`: the branch's unique merge base `M` with the base `B` leaves a change in `M..T`, and
// a conflict-free merge of `T` into `B` produces exactly `tree(B)`.
async function tipTreeProof(context, cwd, repository, base, tip) {
  const mergeBase = await uniqueMergeBase(context, cwd, base, tip);
  await requireBranchChange(context, cwd, mergeBase, tip);
  const baseTree = await treeOf(context, cwd, base);
  await attributePreCheck(context, cwd, repository, mergeBase, [base, tip]);
  return (await mergeTreeProduces(context, cwd, base, tip, baseTree))
    ? proven('tip-tree', base)
    : unproven('not-proven');
}

// The cheap proofs of pass 1: `ancestor` (the tip `T` is an ancestor of the base `B`), then
// `tip-tree`. Input `{ cwd, tip, repository, deadline }` with `repository` a usable
// `branchProofRepository` result. Returns `{ proof, proofCommit, reason, detail }`: a proven
// result names `proof` `ancestor` or `tip-tree` and `proofCommit` the base commit it ran against;
// otherwise `proof` and `proofCommit` are null and `reason` is one of BRANCH_PROOF_REASONS (with
// `detail` for `proof-unavailable`). `no-merge-base`, `multiple-merge-bases` and `empty-diff` are
// decided before any merge. Only `not-proven` admits the `squash-tree` search of pass 2.
export async function branchTipProof(input, deps = {}) {
  const cwd = requireCwd(input?.cwd);
  const tip = requireObjectId(input?.tip, 'tip');
  const repository = requireRepositoryState(input?.repository);
  const context = makeBoundedContext(deps, requireDeadline(input?.deadline));
  return settleProof(async () => {
    const base = repository.baseCommit;
    if (await isAncestor(context, cwd, tip, base)) return proven('ancestor', base);
    if (repository.treeProofReason !== null) {
      return unproven(repository.treeProofReason, repository.treeProofDetail);
    }
    return tipTreeProof(context, cwd, repository, base, tip);
  });
}

// The first-parent commits of `M..B`, newest first, as `{ commit, parents, paths }` with `paths`
// the ones the commit changed against its first parent, read in one `git log` call. A header is
// recognised only as the expected next first-parent commit, so no path can pose as one.
function parseFirstParentLog(result, base) {
  const tokens = pathText(result).split('\0');
  const commits = [];
  let expected = base;
  let index = 0;
  const headerFor = (token, commit) => {
    if (commit === null) return null;
    // A root commit prints its header with a trailing space for its empty parent list.
    const fields = token.trimEnd().split(' ');
    if (fields[0] !== commit || !fields.every((field) => OBJECT_ID.test(field))) return null;
    return { commit, parents: fields.slice(1) };
  };
  while (index < tokens.length) {
    if (index === tokens.length - 1 && tokens[index] === '') break;
    const header = headerFor(tokens[index], expected);
    if (header === null) stopProof('proof-unavailable', 'unexpected-output');
    index += 1;
    const paths = [];
    if (index < tokens.length && tokens[index].startsWith('\n')) {
      paths.push(tokens[index].slice(1));
      index += 1;
      while (
        index < tokens.length &&
        !(index === tokens.length - 1 && tokens[index] === '') &&
        headerFor(tokens[index], header.parents[0] ?? null) === null
      ) {
        paths.push(tokens[index]);
        index += 1;
      }
    }
    commits.push({ ...header, paths });
    expected = header.parents[0] ?? null;
  }
  return commits;
}

// Whether `S` is the branch's squash commit: it has a first parent and changes the tree, `M` is an
// ancestor of `S^1`, the merge base of `S^1` and `T` is exactly `M`, and a conflict-free merge of
// `T` into `S^1` produces exactly `tree(S)`. The attribute pre-check runs before that merge.
async function squashCommitProves(context, cwd, repository, mergeBase, tip, squash, parent) {
  const trees = await proofGit(context, cwd, ['rev-parse', `${squash}^{tree}`, `${parent}^{tree}`]);
  const [squashTree, parentTree] = stdoutText(trees).toLowerCase().split('\n');
  if (!OBJECT_ID.test(squashTree ?? '') || !OBJECT_ID.test(parentTree ?? '')) {
    stopProof('proof-unavailable', 'unexpected-output');
  }
  if (squashTree === parentTree) return false;
  if (!(await isAncestor(context, cwd, mergeBase, parent))) return false;
  try {
    if ((await uniqueMergeBase(context, cwd, parent, tip)) !== mergeBase) return false;
  } catch (error) {
    if (error instanceof BranchProofStop && error.reason === 'multiple-merge-bases') return false;
    throw error;
  }
  await attributePreCheck(context, cwd, repository, mergeBase, [parent, tip]);
  return mergeTreeProduces(context, cwd, parent, tip, squashTree);
}

// The `squash-tree` search of pass 2, for a branch whose `branchTipProof` was `not-proven`: the
// first-parent commits `S` of `M..B` whose non-empty changed paths all lie among the paths `M..T`
// changes are tried newest first, at most SQUASH_TREE_CANDIDATE_LIMIT of them. Same input and
// result shape as `branchTipProof`; a proven result names `proof` `squash-tree` and `proofCommit`
// `S`. Unproven reasons: `not-proven`, `candidate-limit` (more candidates than the limit, none
// proven), `merge-attribute` (a configured `text` driver, or at least one candidate refused by its
// attributes and none proven), `proof-unavailable`, `timeout`, and the merge-base and
// `empty-diff` reasons when the branch changed since pass 1.
export async function branchSquashProof(input, deps = {}) {
  const cwd = requireCwd(input?.cwd);
  const tip = requireObjectId(input?.tip, 'tip');
  const repository = requireRepositoryState(input?.repository);
  const context = makeBoundedContext(deps, requireDeadline(input?.deadline));
  return settleProof(async () => {
    if (repository.treeProofReason !== null) {
      return unproven(repository.treeProofReason, repository.treeProofDetail);
    }
    const base = repository.baseCommit;
    const mergeBase = await uniqueMergeBase(context, cwd, base, tip);
    await requireBranchChange(context, cwd, mergeBase, tip);
    const branchPaths = new Set(await changedPaths(context, cwd, mergeBase, tip));
    const log = await proofGit(context, cwd, [
      'log',
      '--first-parent',
      '--diff-merges=first-parent',
      '--name-only',
      '-z',
      '--no-renames',
      '--no-relative',
      '--no-notes',
      '--no-show-signature',
      '--no-color',
      '--format=%H %P',
      `${mergeBase}..${base}`,
      '--',
    ]);
    const candidates = parseFirstParentLog(log, base).filter(
      (entry) =>
        entry.parents.length > 0 &&
        entry.paths.length > 0 &&
        entry.paths.every((changed) => branchPaths.has(changed)),
    );
    // A configured `text` driver refuses every candidate alike, so it ends the search at once.
    await requireNoTextDriver(context, cwd);
    // A candidate whose own changed paths carry a merge attribute is skipped, not the end of the
    // search: a later candidate can still prove the branch. Every other stop ends it.
    let attributeRefused = false;
    for (const candidate of candidates.slice(0, SQUASH_TREE_CANDIDATE_LIMIT)) {
      let proves;
      try {
        proves = await squashCommitProves(
          context,
          cwd,
          repository,
          mergeBase,
          tip,
          candidate.commit,
          candidate.parents[0],
        );
      } catch (error) {
        if (!(error instanceof BranchProofStop) || error.reason !== 'merge-attribute') throw error;
        attributeRefused = true;
        continue;
      }
      if (proves) return proven('squash-tree', candidate.commit);
    }
    if (attributeRefused) return unproven('merge-attribute');
    return unproven(
      candidates.length > SQUASH_TREE_CANDIDATE_LIMIT ? 'candidate-limit' : 'not-proven',
    );
  });
}

// The delete-time re-verification of one proof against its fixed `proofCommit`, never a search:
// the repository has no grafts file and is not shallow, `refs/remotes/origin/<baseRef>` still
// contains `proofCommit`, every search-free precondition of the claimed `proof` holds again, and
// that single proof runs once more (`ancestor`: one `--is-ancestor`; `tip-tree` and
// `squash-tree`: the attribute pre-check plus one merge). Input `{ cwd, tip, baseRef, proof,
// proofCommit, deadline }`; same result shape as `branchTipProof`, with `not-proven` also for a
// `proofCommit` that is gone or no longer in the base. Only invalid input throws.
export async function verifyBranchProof(input, deps = {}) {
  const cwd = requireCwd(input?.cwd);
  const tip = requireObjectId(input?.tip, 'tip');
  const baseRef = requireBaseRef(input?.baseRef);
  if (!BRANCH_PROOFS.includes(input?.proof)) {
    fail('INVALID_INPUT', `proof must be one of ${BRANCH_PROOFS.join(', ')}`, { field: 'proof' });
  }
  const proof = input.proof;
  const proofCommit = requireObjectId(input?.proofCommit, 'proofCommit');
  const context = makeBoundedContext(deps, requireDeadline(input?.deadline));
  const repository = await repositoryState(context, cwd, baseRef);
  if (repository.reason !== null) return unproven(repository.reason, repository.detail);
  return settleProof(async () => {
    if ((await proofCommitOf(context, cwd, proofCommit)) !== proofCommit) {
      return unproven('not-proven');
    }
    if (!(await isAncestor(context, cwd, proofCommit, repository.baseCommit))) {
      return unproven('not-proven');
    }
    if (proof === 'ancestor') {
      return (await isAncestor(context, cwd, tip, proofCommit))
        ? proven('ancestor', proofCommit)
        : unproven('not-proven');
    }
    if (repository.treeProofReason !== null) {
      return unproven(repository.treeProofReason, repository.treeProofDetail);
    }
    if (proof === 'tip-tree') return tipTreeProof(context, cwd, repository, proofCommit, tip);
    const parents = await proofGit(context, cwd, [
      'log',
      '-1',
      '--no-show-signature',
      '--format=%P',
      proofCommit,
    ]);
    const parent = stdoutText(parents).split(' ').filter(Boolean)[0]?.toLowerCase();
    if (parent === undefined) return unproven('not-proven');
    if (!OBJECT_ID.test(parent)) stopProof('proof-unavailable', 'unexpected-output');
    const mergeBase = await uniqueMergeBase(context, cwd, repository.baseCommit, tip);
    await requireBranchChange(context, cwd, mergeBase, tip);
    return (await squashCommitProves(context, cwd, repository, mergeBase, tip, proofCommit, parent))
      ? proven('squash-tree', proofCommit)
      : unproven('not-proven');
  });
}
