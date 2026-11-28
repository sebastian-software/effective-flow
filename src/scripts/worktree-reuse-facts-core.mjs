// Reuse facts of a harness-managed checkout: what decides whether a reused linked or harness-native
// worktree adopts its host branch as the delivery branch, gets an Effective Flow-created one at the
// first commit, or keeps the behaviour before this rule existed. `effective-flow-state-worktree-core.mjs`
// serves them as `worktree reuse-facts`, which fetches first; `build-run-core.mjs` re-derives them
// in `authorize-execution` from the refs that fetch left, without a fetch of its own, and accepts
// the `branchSource` `reuse-facts` reported only where the re-derivation agrees, an `existing`
// always: a skipped fetch cannot see the failure that made it `existing`. Both cores
// import this leaf module, so neither imports the other for it (worktree-core already imports
// build-run-core). Its own imports are leaf modules too: the fetch hardening of
// `delivery-selection-core.mjs` and the disclosure patterns of `remote-tracker-shared-core.mjs`,
// which `delivery-branch-name` applies to a composed name in hidden mode.
//
// It spawns nothing itself. The caller injects `git(args, options)`, which runs `git -C <root>
// <args>` through that core's own runner and returns the runner's raw result
// (`{status, stdout, stderr, error, timedOut?}`); `options.env` is an overlay for the fetch.
//
// The derivation, all from Git:
//
// - `clean`: no staged or unstaged change to a tracked path (`git status --untracked-files=no`);
// - `untracked`: the number of untracked paths outside the ignore rules (`--exclude-standard`);
// - `commitsBeyondBase` and `behindBase`: the counts of `<base>..HEAD` and `HEAD..<base>`, so
//   `headAncestorOfBase` is `commitsBeyondBase === 0`;
// - `upstream`: for a branch with an upstream, its tracking ref and OID, `missing` (upstream
//   commits absent from HEAD) and `foreign` (those also absent from the base, which a fast-forward
//   to the base cannot bring in);
// - `detached` and `headIsBaseBranch` (HEAD is the resolved local base branch);
// - `nameDiscloses`: in hidden mode, whether the HEAD branch name names the tool, the check
//   `delivery-branch-name` answers with `prefix-discloses`.
//
// `branchSource` is the closed classification REUSE_BRANCH_SOURCES:
//
// - `adopted`: HEAD is a branch that is not the base branch, the tree and index are clean, no
//   untracked file, no commit beyond the base, no foreign upstream commit, no disclosing name, and
//   every fetch succeeded. `fastForward` says HEAD is strictly behind the base.
// - `created`: HEAD is detached or the base branch, with the same cleanliness, untracked and
//   commit conditions and successful fetches. The delivery branch is created at the fresh base,
//   `creationOid`; a HEAD strictly behind it (`behindBase > 0`) moves there detached first.
// - `existing`: every other case, with the failed conditions in `reasons` (REUSE_REASONS).

import process from 'node:process';
import {
  HOOKS_DISABLED,
  UPSTREAM_FETCH_TIMEOUT_MS,
  diagnosticText,
  fetchableUpstream,
  nonInteractiveFetchEnv,
} from './delivery-selection-core.mjs';
import {
  RemoteTrackerError,
  VISIBILITY_VALUES,
  assertUndisclosed,
} from './remote-tracker-shared-core.mjs';

export const REUSE_BRANCH_SOURCES = Object.freeze(['adopted', 'created', 'existing']);
// Why a checkout keeps today's behaviour; listed in this order.
export const REUSE_REASONS = Object.freeze([
  'fetch-failed',
  'dirty',
  'untracked',
  'ahead-of-base',
  'foreign-upstream',
  'name-discloses',
]);
// How each fetch ended: `fetched`; `local` (nothing to fetch: the local-only base arm, or an
// upstream on the repository itself); `none` (no upstream); `skipped` (a re-derivation without a
// fetch, which reads the refs an earlier fetch left); `failed`.
export const REUSE_FETCH_OUTCOMES = Object.freeze([
  'fetched',
  'local',
  'none',
  'skipped',
  'failed',
]);

const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export class ReuseFactsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReuseFactsError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ReuseFactsError(code, message);
}

function stdoutText(result) {
  const value = result?.stdout;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8');
  return String(value ?? '');
}

function succeeded(result) {
  return !result?.error && result?.status === 0;
}

async function run(git, args, allowed = [0]) {
  const result = await git(args);
  if (result?.error || !allowed.includes(result?.status)) {
    fail('GIT_FAILED', `git ${args[0]} failed while deriving the reuse facts`);
  }
  return result;
}

async function text(git, args) {
  return stdoutText(await run(git, args)).trim();
}

async function count(git, range) {
  const value = Number.parseInt(await text(git, ['rev-list', '--count', ...range]), 10);
  if (!Number.isSafeInteger(value) || value < 0)
    fail('GIT_FAILED', 'git returned an invalid count');
  return value;
}

async function commitAt(git, ref) {
  const result = await run(git, ['rev-parse', '--verify', '-q', `${ref}^{commit}`], [0, 1, 128]);
  if (result.status !== 0) return null;
  const oid = stdoutText(result).trim();
  return OBJECT_ID.test(oid) ? oid : null;
}

async function configValue(git, key) {
  const result = await run(git, ['config', '--get', key], [0, 1]);
  const value = result.status === 0 ? stdoutText(result).trim() : '';
  return value === '' ? null : value;
}

// `check-ref-format --branch` expands `@{-N}` and `@{upstream}` to another branch's name, so a name
// with `@{` is refused before Git reads it.
async function validBranchName(git, name) {
  if (typeof name !== 'string' || name === '' || name.startsWith('-') || name.includes('@{'))
    return false;
  return (await run(git, ['check-ref-format', '--branch', name], [0, 1, 128])).status === 0;
}

// Whether `name` names the tool where hidden mode forbids it, exactly as `delivery-branch-name`
// decides `prefix-discloses` for a composed name.
export function branchNameDiscloses(name, visibility) {
  if (visibility !== 'hidden') return false;
  try {
    assertUndisclosed(name, 'branch');
    return false;
  } catch (error) {
    if (error instanceof RemoteTrackerError) return true;
    throw error;
  }
}

// The base of the two recorded base-branch results: the remote arm's `<remote>/<branch>` with the
// local base branch as `<branch>`, or the local-only arm, whose two results are equal.
async function baseTarget(git, baseRef, localBaseBranch) {
  if (!(await validBranchName(git, localBaseBranch))) {
    fail('INVALID_INPUT', 'localBaseBranch is not a valid branch name');
  }
  if (baseRef === localBaseBranch) return { remote: null, ref: `refs/heads/${localBaseBranch}` };
  const slash = typeof baseRef === 'string' ? baseRef.indexOf('/') : -1;
  const remote = slash > 0 ? baseRef.slice(0, slash) : '';
  if (remote === '' || baseRef.slice(slash + 1) !== localBaseBranch) {
    fail('INVALID_INPUT', 'baseRef must be <remote>/<localBaseBranch> or equal localBaseBranch');
  }
  const remotes = (await text(git, ['remote'])).split('\n').filter(Boolean);
  if (!remotes.includes(remote)) fail('INVALID_INPUT', 'baseRef names no configured remote');
  return { remote, ref: `refs/remotes/${baseRef}` };
}

// `fetchableUpstream` of `delivery-selection-core.mjs`, which owns that rule, over the injected
// runner: a remote or merge ref that could be read as an option or as more than one full ref name
// is never fetched.
async function fetchable(git, remote, mergeRef) {
  try {
    return await fetchableUpstream('', remote, mergeRef, async (call) => git(call.args.slice(2)));
  } catch {
    return false;
  }
}

// One hardened fetch of `<remote> <mergeRef>`: `fetched` or `failed` with a redacted diagnostic.
// A fetch that leaves `tracking` behind FETCH_HEAD (a narrowed refspec, a single-branch clone)
// is `failed` too: the facts would read a stale ref.
async function fetchRef(git, remote, mergeRef, tracking, environment) {
  const env = nonInteractiveFetchEnv({
    environment,
    inheritedEnvironment: process.env,
    configuredSshCommand: await configValue(git, 'core.sshCommand'),
    configuredSshVariant: await configValue(git, 'ssh.variant'),
  });
  const result = await git(
    [...HOOKS_DISABLED, 'fetch', '--no-tags', '--quiet', '--', remote, mergeRef],
    { env, timeoutMs: UPSTREAM_FETCH_TIMEOUT_MS, processGroup: true },
  );
  if (result?.forcedKill === true || result?.timedOut === true) {
    return { outcome: 'failed', error: 'timeout' };
  }
  if (!succeeded(result)) {
    return {
      outcome: 'failed',
      error:
        diagnosticText(result?.error?.code ?? result?.stderr) ||
        `exit status ${result?.status ?? 'unknown'}`,
    };
  }
  const fetched = await commitAt(git, 'FETCH_HEAD');
  if (fetched === null || tracking === null || (await commitAt(git, tracking)) !== fetched) {
    return { outcome: 'failed', error: 'tracking-stale' };
  }
  return { outcome: 'fetched', error: null };
}

// The HEAD branch's upstream as Git configures it: `{remote, mergeRef}` or null.
async function upstreamConfig(git, branch) {
  const remote = await configValue(git, `branch.${branch}.remote`);
  const mergeRef = await configValue(git, `branch.${branch}.merge`);
  return remote === null || mergeRef === null ? null : { remote, mergeRef };
}

async function trackingRef(git, branch) {
  const value = await text(git, ['for-each-ref', '--format=%(upstream)', `refs/heads/${branch}`]);
  return value === '' ? null : value;
}

// Derives the facts of the checkout `git` runs in. `input`: `{baseRef, localBaseBranch,
// visibility, fetch}`; `options.environment` decides the fetch's SSH hardening.
export async function deriveReuseFacts(input, { git, environment = process.env } = {}) {
  if (typeof git !== 'function') fail('INVALID_INPUT', 'a Git runner is required');
  const { baseRef, localBaseBranch, visibility } = input ?? {};
  if (!VISIBILITY_VALUES.includes(visibility)) {
    fail('INVALID_INPUT', `visibility must be one of ${VISIBILITY_VALUES.join(', ')}`);
  }
  const fetch = input?.fetch === true;
  const base = await baseTarget(git, baseRef, localBaseBranch);
  const fetches = { base: 'local', upstream: 'none', error: null };
  const noteFailure = (outcome) => {
    if (outcome.outcome === 'failed' && fetches.error === null) fetches.error = outcome.error;
  };
  if (base.remote !== null && !fetch) fetches.base = 'skipped';
  if (base.remote !== null && fetch) {
    const mergeRef = `refs/heads/${localBaseBranch}`;
    if (!(await fetchable(git, base.remote, mergeRef))) {
      fail('INVALID_INPUT', 'baseRef is not a fetchable branch');
    }
    const outcome = await fetchRef(git, base.remote, mergeRef, base.ref, environment);
    fetches.base = outcome.outcome;
    noteFailure(outcome);
  }

  const head = await commitAt(git, 'HEAD');
  if (head === null) fail('GIT_FAILED', 'HEAD does not resolve to a commit');
  const symbolic = await run(git, ['symbolic-ref', '-q', 'HEAD'], [0, 1]);
  const ref = symbolic.status === 0 ? stdoutText(symbolic).trim() : '';
  const branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : null;
  const baseOid = await commitAt(git, base.ref);
  if (baseOid === null) fail('INVALID_INPUT', `${base.ref} does not resolve to a commit`);

  let upstream = null;
  if (branch !== null) {
    const configured = await upstreamConfig(git, branch);
    if (configured !== null) {
      const tracking = await trackingRef(git, branch);
      if (configured.remote === '.') fetches.upstream = 'local';
      else if (!fetch) fetches.upstream = 'skipped';
      else if (await fetchable(git, configured.remote, configured.mergeRef)) {
        const outcome = await fetchRef(
          git,
          configured.remote,
          configured.mergeRef,
          tracking,
          environment,
        );
        fetches.upstream = outcome.outcome;
        noteFailure(outcome);
      } else {
        fetches.upstream = 'failed';
        if (fetches.error === null) fetches.error = 'the upstream is not a fetchable ref';
      }
      const upstreamOid = tracking === null ? null : await commitAt(git, tracking);
      if (upstreamOid === null) {
        // An upstream Git cannot resolve proves nothing about missing commits.
        fetches.upstream = 'failed';
        if (fetches.error === null) fetches.error = 'the upstream does not resolve to a commit';
      } else {
        upstream = {
          ref: tracking,
          oid: upstreamOid,
          missing: await count(git, [upstreamOid, `^${head}`]),
          foreign: await count(git, [upstreamOid, `^${head}`, `^${baseOid}`]),
        };
      }
    }
  }

  const tracked = await run(git, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=no',
    '--ignore-submodules=none',
  ]);
  const clean = stdoutText(tracked) === '';
  const untrackedOutput = stdoutText(
    await run(git, ['ls-files', '--others', '--exclude-standard', '-z']),
  );
  const untracked = untrackedOutput.split('\0').filter(Boolean).length;
  const commitsBeyondBase = await count(git, [`${baseOid}..${head}`]);
  const behindBase = await count(git, [`${head}..${baseOid}`]);
  const detached = branch === null;
  const headIsBaseBranch = branch === localBaseBranch;
  const nameDiscloses = branch !== null && branchNameDiscloses(branch, visibility);

  const reasons = [];
  if (fetches.base === 'failed' || fetches.upstream === 'failed') reasons.push('fetch-failed');
  if (!clean) reasons.push('dirty');
  if (untracked > 0) reasons.push('untracked');
  if (commitsBeyondBase > 0) reasons.push('ahead-of-base');
  const creating = detached || headIsBaseBranch;
  if (!creating) {
    if ((upstream?.foreign ?? 0) > 0) reasons.push('foreign-upstream');
    if (nameDiscloses) reasons.push('name-discloses');
  }
  const branchSource = reasons.length > 0 ? 'existing' : creating ? 'created' : 'adopted';
  return {
    head,
    branch,
    detached,
    headIsBaseBranch,
    baseRef,
    localBaseBranch,
    baseOid,
    clean,
    untracked,
    commitsBeyondBase,
    behindBase,
    headAncestorOfBase: commitsBeyondBase === 0,
    upstream,
    nameDiscloses,
    fetch: fetches,
    branchSource,
    fastForward: branchSource === 'adopted' && behindBase > 0,
    creationOid: branchSource === 'created' ? baseOid : null,
    reasons,
  };
}

// Whether `name` may become the Effective Flow-created delivery branch of a `created` checkout: a
// valid branch name that names no existing local branch and, in hidden mode, does not disclose.
export async function creatableBranch(git, name, visibility) {
  if (!(await validBranchName(git, name))) return false;
  if (branchNameDiscloses(name, visibility)) return false;
  const existing = await run(
    git,
    ['show-ref', '--verify', '--quiet', `refs/heads/${name}`],
    [0, 1],
  );
  return existing.status === 1;
}
