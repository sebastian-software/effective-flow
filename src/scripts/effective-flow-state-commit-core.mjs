// Runtime-state helper: `commit create`, one item commit of `iterate` under `iterate-commit.lock`
// in one call, replacing the prose sequence of lock, staging, commit, verification and release.
//
//   commit create  {cwd, worktree, lock, owner, paths, expect, hookBase, sameRepository, message,
//                   waitSeconds?}
//
// `cwd` is the RUNTIME_STATE_ROOT that holds the lock; `worktree` the execution worktree the commit
// lands in, a registered worktree of the same repository (it may be `cwd` itself). `paths` are the
// item's repository-relative paths, both sides of a rename included; `expect` maps each of them to
// the blob OID the caller inspected, or null for a deletion. `hookBase` is the commit the hook
// configuration is compared against, `sameRepository` whether the head comes from this repository.
//
// Before the lock (INVALID_INPUT for a bad request; HOOKS_UNTRUSTED for an untrusted head):
//   - the request shape, `worktree` and every path are validated; a path below `.effective-flow/`
//     or `.git/`, absolute, unnormalized, with `..`, or resolving outside `worktree` is refused;
//   - the hook trust check: a fork head, or a hook-relevant configuration (HOOK_CONFIG below) that
//     differs between `hookBase` and HEAD or between HEAD and the working tree, ignored files
//     included, is HOOKS_UNTRUSTED. The hooks a trusted call runs are then the repository's own,
//     the ones a plain `git commit` on the base would run. `core.hooksPath` is read with the
//     commit's environment; a read failing with a status other than 0 or 1 is GIT_FAILED. This
//     check is the early exit; it runs again under the lock, after acquisition and immediately
//     before step 5.
//
// Under the lock, which is taken with the `lock acquire` protocol (LOCK_HELD after `waitSeconds`,
// with the same owner and identity details):
//   1. an empty index is required (INDEX_NOT_CLEAN, nothing touched);
//   2. exactly the listed paths are staged with literal pathspecs (STAGE_FAILED);
//   3. the staged set must equal the listed set (STAGED_SET_MISMATCH);
//   4. every staged blob must equal its `expect` entry, a null one a staged deletion
//      (STAGED_CONTENT_CHANGED);
//   5. `git commit --message=<message>` runs as an argument through the process runner, never a
//      shell, with the repository's hooks and the environment a plain `git commit` would see
//      (`gitCommitEnv`: identity, signing, `GIT_CONFIG_*` and locale kept, only the
//      repository-redirecting variables removed), bounded by COMMIT_TIMEOUT_MS (COMMIT_FAILED);
//   6. the commit's parent, its changed paths, each committed entry against its `expect` entry and
//      the clean index are verified (COMMIT_UNVERIFIED, carrying the SHA and the differing paths;
//      nothing is amended, reset or rebased).
// Every failing step unstages only the listed paths it staged, never the whole index, so foreign
// staged changes stay staged. A denied write below `.git` (a sandbox) is SANDBOX_DENIED, detected by
// errno and SANDBOX_STDERR_PATTERNS; a failed `git commit` that neither classifies, whose stderr
// may be translated because the caller's locale is kept, is classified by `gitDirWriteDenied`, an
// exclusive create and removal of a uniquely named file in the git dir and the object store. The
// helper never works around a denial. On SIGINT, SIGTERM or SIGHUP
// it stops a running Git child, waits for it, reads HEAD and returns INTERRUPTED, with the SHA when
// the commit landed (nothing unstaged) and without it otherwise (the listed paths unstaged). A
// SIGKILL leaves the lock to the orphan-break path, because the owner carries `pid: null`.
//
// Ownership (the lock present with this call's token and, where observed, its identity) is
// verified immediately before step 2, immediately before step 5 and before every unstage; an
// observation that fails counts as lost. Lost ownership is NOT_OWNER with `reason:
// 'ownership-lost'`, `phase` (`before-stage`, `before-commit` or `cleanup`, the latter with the
// failure it was cleaning up), no commit and the index untouched. A landed commit is never turned
// into NOT_OWNER: a final release that finds the lock gone or foreign (NOT_HELD, NOT_OWNER) makes a
// verified commit COMMIT_UNVERIFIED with the SHA and `reason: 'ownership-lost'`.
//
// The lock is released on every path this call still owns it. An envelope whose internal release
// failed for a reason other than lost ownership, and only that one, carries `heldLock` with the
// lock's path, identity and `token`: its presence means the lock may still be held, so the caller
// retries `lock release` once without a break. INTERRUPTED and
// SANDBOX_DENIED, and every failed release, also carry `lockRelease`, the internal release's result.
// An unexpected error under the lock whose release failed carries both in its `error` object,
// beside `code` and `message`. Git and hook stderr pass through the
// tracker's redactor and are capped at MAX_STDERR_CHARS. The result is `{commit, paths}`, plus
// `leftoverTombstone` from the internal release where present.

import { randomBytes } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { redact } from './remote-tracker-shared-core.mjs';
import {
  FORBIDDEN_ROOT_CHARACTERS,
  OPERATION_KEYS,
  StateOutcome,
  acquireOwned,
  fail,
  makeContext,
  observeLock,
  releaseOwned,
  requireClosedKeys,
  requireObject,
  requireOwnerInput,
  requireRootSyntax,
  requireWaitSeconds,
  resolveRoot,
  sameIdentity,
} from './effective-flow-state-core.mjs';
import {
  RUNTIME_STATE_DIR,
  RuntimeStateError,
  asBuffer,
  commonDir,
  git,
  gitCommitEnv,
  runGit,
} from './runtime-state-guard.mjs';

// The locks `commit create` may take: `iterate` adopts it in this release.
export const COMMIT_LOCKS = Object.freeze(['iterate-commit']);
// The bound of the commit subprocess, hooks included. A caller's own tool timeout must exceed it,
// so the helper reports COMMIT_FAILED before the harness kills it.
export const COMMIT_TIMEOUT_MS = 300_000;
export const MAX_COMMIT_PATHS = 512;
export const MAX_MESSAGE_BYTES = 16 * 1024;
export const MAX_STDERR_CHARS = 4096;
export const COMMIT_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);
const OID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

// Hook-relevant configuration, a closed list: a change to any of it makes the head's hooks
// untrusted. Directories and file names match at any depth, which refuses more rather than less.
// A hook manager it does not name runs unprompted when its configuration changes; extending the
// list is a code change with a test. Ignored files below these directories or with these file
// names count as working-tree changes too, except the content husky itself generates
// (HUSKY_GENERATED); an ignored `package.json` does not, since every installed dependency carries
// one and no Git hook reads it. A `core.hooksPath` inside the worktree is hook configuration as
// well; one outside it is the user's own configuration, which no pull request controls, so it is
// not compared.
export const HOOK_CONFIG = Object.freeze({
  directories: Object.freeze({
    '.husky': 'husky',
    '.githooks': 'githooks',
    '.lefthook': 'lefthook',
    '.lefthook-local': 'lefthook',
  }),
  files: Object.freeze({
    '.pre-commit-config.yaml': 'pre-commit',
    ...Object.fromEntries(
      ['lefthook', '.lefthook', 'lefthook-local', '.lefthook-local'].flatMap((stem) =>
        ['yml', 'yaml', 'json', 'jsonc', 'toml'].map((extension) => [
          `${stem}.${extension}`,
          'lefthook',
        ]),
      ),
    ),
    '.lintstagedrc': 'lint-staged',
    ...Object.fromEntries(
      ['json', 'yaml', 'yml', 'js', 'mjs', 'cjs', 'ts', 'mts', 'cts'].map((extension) => [
        `.lintstagedrc.${extension}`,
        'lint-staged',
      ]),
    ),
    ...Object.fromEntries(
      ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'].map((extension) => [
        `lint-staged.config.${extension}`,
        'lint-staged',
      ]),
    ),
    ...Object.fromEntries(
      ['.simple-git-hooks', 'simple-git-hooks'].flatMap((stem) =>
        ['js', 'mjs', 'cjs', 'json'].map((extension) => [
          `${stem}.${extension}`,
          'simple-git-hooks',
        ]),
      ),
    ),
  }),
  // The `package.json` keys that configure or install hooks.
  packageKeys: Object.freeze([
    Object.freeze(['husky']),
    Object.freeze(['lint-staged']),
    Object.freeze(['simple-git-hooks']),
    Object.freeze(['scripts', 'prepare']),
    Object.freeze(['scripts', 'postinstall']),
  ]),
});

// The directory husky (v9) regenerates on every install, marked by its own `.gitignore` of `*`:
// its ignored wrappers only call the tracked hooks beside it, which the trust check compares.
const HUSKY_GENERATED = /(?:^|\/)\.husky\/_\//;

// The stderr of a write below `.git` that a sandbox, or a read-only filesystem, denied.
export const SANDBOX_STDERR_PATTERNS = Object.freeze([
  /Unable to create '[^'\n]*\.git\/[^'\n]*': (?:Read-only file system|Operation not permitted|Permission denied)/,
  /could not (?:lock|write|create|open)[^\n]*\.git\/[^\n]*(?:Read-only file system|Operation not permitted|Permission denied)/i,
  /insufficient permission for adding an object to repository database/,
  /unable to create temporary file: (?:Read-only file system|Operation not permitted|Permission denied)/,
]);
const SANDBOX_ERRNOS = Object.freeze(['EPERM', 'EACCES', 'EROFS']);

// ---------------------------------------------------------------------------------------------
// Classification helpers (exported for the unit tests)

// The hook-configuration class of a repository-relative path, or null. `hooksPath` is the
// worktree-relative `core.hooksPath` directory when it points inside the worktree.
export function hookConfigClass(relative, { hooksPath = null } = {}) {
  const segments = relative.split('/');
  if (hooksPath && (relative === hooksPath || relative.startsWith(`${hooksPath}/`))) {
    return 'hooks-path';
  }
  for (const segment of segments.slice(0, -1)) {
    if (Object.hasOwn(HOOK_CONFIG.directories, segment)) return HOOK_CONFIG.directories[segment];
  }
  const name = segments.at(-1);
  if (Object.hasOwn(HOOK_CONFIG.directories, name)) return HOOK_CONFIG.directories[name];
  if (Object.hasOwn(HOOK_CONFIG.files, name)) return HOOK_CONFIG.files[name];
  if (name === 'package.json') return 'package-json';
  return null;
}

// The hook-relevant keys whose value differs between two `package.json` texts (null for an absent
// file). A text that does not parse as a JSON object counts as changing every key.
export function changedPackageKeys(before, after) {
  const parse = (text) => {
    if (text === null) return {};
    try {
      const value = JSON.parse(text);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  };
  const left = parse(before);
  const right = parse(after);
  const read = (object, keys) =>
    keys.reduce(
      (value, key) =>
        value && typeof value === 'object' && Object.hasOwn(value, key) ? value[key] : undefined,
      object,
    );
  return HOOK_CONFIG.packageKeys
    .filter((keys) => {
      if (left === null || right === null) return before !== after;
      return JSON.stringify(read(left, keys)) !== JSON.stringify(read(right, keys));
    })
    .map((keys) => keys.join('.'));
}

// Whether a failed Git call is a denied write below `.git`.
export function isSandboxDenial(result) {
  if (SANDBOX_ERRNOS.includes(result?.error?.code)) return true;
  const stderr = asBuffer(result?.stderr).toString('utf8');
  return SANDBOX_STDERR_PATTERNS.some((pattern) => pattern.test(stderr));
}

// Whether a write into the worktree's git dir or the repository's object store is denied with
// EPERM, EACCES or EROFS, the locale-independent check of a failed `git commit`. Each probe is an
// exclusive create of a uniquely named file, removed at once, so nothing is left behind; a probe
// directory that cannot be resolved classifies nothing.
export async function gitDirWriteDenied(context, worktree) {
  let directories;
  try {
    const gitDir = (
      await git(context, worktree, ['rev-parse', '--path-format=absolute', '--git-dir'])
    ).stdout
      .toString('utf8')
      .trim();
    directories = [gitDir, path.join(await commonDir(context, worktree), 'objects')];
  } catch {
    return false;
  }
  for (const directory of directories) {
    const probe = path.join(
      directory,
      `.effective-flow-write-probe-${process.pid}-${randomBytes(8).toString('hex')}`,
    );
    let handle;
    try {
      handle = await context.fs.open(probe, 'wx', 0o600);
    } catch (error) {
      if (SANDBOX_ERRNOS.includes(error?.code)) return true;
      continue;
    }
    try {
      await handle.close();
    } finally {
      await context.fs.unlink(probe).catch(() => {});
    }
  }
  return false;
}

// Redacted and capped stderr: the last MAX_STDERR_CHARS characters, where a hook prints its result.
export function reportedStderr(value) {
  const text = redact(asBuffer(value).toString('utf8'));
  if (text.length <= MAX_STDERR_CHARS) return { stderr: text, stderrTruncated: false };
  return { stderr: text.slice(-MAX_STDERR_CHARS), stderrTruncated: true };
}

// ---------------------------------------------------------------------------------------------
// Input validation

function requirePathShape(value, index) {
  const label = `paths[${index}]`;
  if (typeof value !== 'string' || value === '') fail('INVALID_INPUT', `${label} must be a string`);
  if (/[\u0000-\u001f\u007f\\]/.test(value)) {
    fail('INVALID_INPUT', `${label} must not contain a control character or backslash`);
  }
  if (path.posix.isAbsolute(value)) fail('INVALID_INPUT', `${label} must be relative`);
  const segments = value.split('/');
  if (segments.includes('..')) fail('INVALID_INPUT', `${label} must not contain ..`);
  if (path.posix.normalize(value) !== value || value === '.' || value.endsWith('/')) {
    fail('INVALID_INPUT', `${label} must be a normalized relative path`);
  }
  if (segments[0] === RUNTIME_STATE_DIR) {
    fail('INVALID_INPUT', `${label} is below ${RUNTIME_STATE_DIR}/, which is never committed`);
  }
  if (segments.includes('.git')) fail('INVALID_INPUT', `${label} is below .git`);
  return value;
}

function requireRequest(input) {
  requireObject(input, 'input');
  requireClosedKeys(input, OPERATION_KEYS['commit create'], 'input');
  if (typeof input.lock !== 'string' || !COMMIT_LOCKS.includes(input.lock)) {
    fail('INVALID_INPUT', `lock must be one of ${COMMIT_LOCKS.join(', ')}`);
  }
  const owner = requireOwnerInput(input.lock, input.owner);
  const waitSeconds = requireWaitSeconds(input.waitSeconds);
  if (!Array.isArray(input.paths) || input.paths.length === 0) {
    fail('INVALID_INPUT', 'paths must be a non-empty array');
  }
  if (input.paths.length > MAX_COMMIT_PATHS) {
    fail('INVALID_INPUT', `paths holds more than ${MAX_COMMIT_PATHS} entries`);
  }
  const paths = input.paths.map(requirePathShape);
  if (new Set(paths).size !== paths.length) fail('INVALID_INPUT', 'paths has a duplicate entry');
  const expect = requireObject(input.expect, 'expect');
  const expectKeys = Object.keys(expect);
  if (expectKeys.length !== paths.length || paths.some((entry) => !Object.hasOwn(expect, entry))) {
    fail('INVALID_INPUT', 'expect must name exactly the listed paths');
  }
  for (const entry of paths) {
    const oid = expect[entry];
    if (oid !== null && (typeof oid !== 'string' || !OID_PATTERN.test(oid))) {
      fail('INVALID_INPUT', `expect[${JSON.stringify(entry)}] must be a blob OID or null`);
    }
  }
  if (typeof input.hookBase !== 'string' || !OID_PATTERN.test(input.hookBase)) {
    fail('INVALID_INPUT', 'hookBase must be a full commit SHA');
  }
  if (typeof input.sameRepository !== 'boolean') {
    fail('INVALID_INPUT', 'sameRepository must be a boolean');
  }
  if (typeof input.message !== 'string' || input.message.trim() === '') {
    fail('INVALID_INPUT', 'message must be a non-empty string');
  }
  if (input.message.includes('\u0000')) fail('INVALID_INPUT', 'message must not contain NUL');
  if (Buffer.byteLength(input.message, 'utf8') > MAX_MESSAGE_BYTES) {
    fail('INVALID_INPUT', `message exceeds ${MAX_MESSAGE_BYTES} bytes`);
  }
  if (typeof input.worktree !== 'string' || input.worktree === '') {
    fail('INVALID_INPUT', 'worktree must be a string');
  }
  return {
    worktree: input.worktree,
    lock: input.lock,
    owner,
    waitSeconds,
    paths,
    expect: Object.fromEntries(paths.map((entry) => [entry, expect[entry]])),
    hookBase: input.hookBase,
    sameRepository: input.sameRepository,
    message: input.message,
  };
}

function isWithin(parent, child) {
  return child === parent || child.startsWith(`${parent}${path.sep}`);
}

// `worktree` must be its own canonical toplevel, of the same repository as `cwd`, and listed by
// `git worktree list`. Every refusal is INVALID_INPUT, taken before the lock.
async function requireWorktree(context, worktree, common) {
  if (FORBIDDEN_ROOT_CHARACTERS.test(worktree) || !path.isAbsolute(worktree)) {
    fail('INVALID_INPUT', 'worktree must be an absolute path without shell metacharacters');
  }
  let canonical;
  try {
    canonical = await realpath(worktree);
  } catch {
    fail('INVALID_INPUT', 'worktree must be an existing directory');
  }
  if (canonical !== worktree) fail('INVALID_INPUT', 'worktree must be its own canonical path');
  let top;
  let theirs;
  try {
    top = await realpath(
      (await git(context, worktree, ['rev-parse', '--show-toplevel'])).stdout
        .toString('utf8')
        .trim(),
    );
    theirs = await commonDir(context, worktree);
  } catch (error) {
    if (error instanceof RuntimeStateError) {
      fail('INVALID_INPUT', `worktree is not a working tree of this repository: ${error.message}`);
    }
    fail('INVALID_INPUT', 'worktree is not a working tree of this repository');
  }
  if (top !== worktree) fail('INVALID_INPUT', 'worktree is not the toplevel of its working tree');
  if (theirs !== common) fail('INVALID_INPUT', 'worktree belongs to another repository');
  const listed = (await git(context, context.cwd, ['worktree', 'list', '--porcelain', '-z'])).stdout
    .toString('utf8')
    .split('\0')
    .filter((field) => field.startsWith('worktree '))
    .map((field) => field.slice('worktree '.length));
  for (const entry of listed) {
    let real = entry;
    try {
      real = await realpath(entry);
    } catch {
      // A listed worktree that no longer exists cannot be this existing directory.
    }
    if (real === worktree) return worktree;
  }
  fail('INVALID_INPUT', 'worktree is not a registered worktree of this repository');
}

// Every path's deepest existing ancestor must resolve inside the worktree, outside its runtime
// directory, so no symlinked directory carries a write elsewhere.
async function requirePathsInside(worktree, paths) {
  for (const [index, relative] of paths.entries()) {
    let ancestor = path.dirname(path.join(worktree, relative));
    for (;;) {
      try {
        await lstat(ancestor);
        break;
      } catch {
        ancestor = path.dirname(ancestor);
      }
    }
    let resolved;
    try {
      resolved = await realpath(ancestor);
    } catch {
      fail('INVALID_INPUT', `paths[${index}] has an unresolvable parent directory`);
    }
    if (!isWithin(worktree, resolved)) {
      fail('INVALID_INPUT', `paths[${index}] resolves outside worktree`);
    }
    if (isWithin(path.join(worktree, RUNTIME_STATE_DIR), resolved)) {
      fail('INVALID_INPUT', `paths[${index}] resolves below ${RUNTIME_STATE_DIR}/`);
    }
  }
}

async function requireHookBase(context, worktree, hookBase) {
  const result = await runGit(context, worktree, [
    'rev-parse',
    '--verify',
    '--quiet',
    `${hookBase}^{commit}`,
  ]);
  if (result?.status !== 0) fail('INVALID_INPUT', 'hookBase does not name a commit');
}

// ---------------------------------------------------------------------------------------------
// Hook trust

function nulList(buffer) {
  return asBuffer(buffer)
    .toString('utf8')
    .split('\0')
    .filter((entry) => entry !== '');
}

async function readBlob(context, worktree, revision, relative) {
  const result = await runGit(context, worktree, ['cat-file', 'blob', `${revision}:${relative}`]);
  return result?.status === 0 ? asBuffer(result.stdout).toString('utf8') : null;
}

async function readWorkingFile(worktree, relative) {
  try {
    return await readFile(path.join(worktree, relative), 'utf8');
  } catch {
    return null;
  }
}

// The worktree-relative `core.hooksPath` when it points inside the worktree, otherwise null. It is
// read with the commit's environment, so `GIT_CONFIG_*` counts; status 1 is unset, any other
// failure is GIT_FAILED.
async function insideHooksPath(context, worktree, env) {
  const result = await git(context, worktree, ['config', '--get', 'core.hooksPath'], {
    env,
    allowed: [0, 1],
  });
  if (result.status === 1) return null;
  const value = asBuffer(result.stdout).toString('utf8').trim();
  if (value === '') return null;
  const absolute = path.resolve(worktree, value);
  if (absolute === worktree || !isWithin(worktree, absolute)) {
    return absolute === worktree ? '.' : null;
  }
  return path.relative(worktree, absolute).split(path.sep).join('/');
}

async function changedHookConfig(context, worktree, changed, hooksPath, readBefore, readAfter) {
  const found = [];
  for (const relative of changed) {
    const kind = hooksPath === '.' ? 'hooks-path' : hookConfigClass(relative, { hooksPath });
    if (kind === null) continue;
    if (kind === 'package-json') {
      const keys = changedPackageKeys(await readBefore(relative), await readAfter(relative));
      if (keys.length > 0) found.push({ path: relative, class: kind, keys });
      continue;
    }
    found.push({ path: relative, class: kind });
  }
  return found;
}

// The ignored files below the hook-relevant directories, with a hook-relevant file name, or below
// an in-worktree `core.hooksPath` (only its top level when that is the worktree itself), without
// husky's generated directory.
async function ignoredHookFiles(context, worktree, hooksPath) {
  const pathspecs = [
    ...Object.keys(HOOK_CONFIG.directories).map((directory) => `:(glob)**/${directory}/**`),
    ...Object.keys(HOOK_CONFIG.files).map((name) => `:(glob)**/${name}`),
  ];
  if (hooksPath === '.') pathspecs.push(':(glob)*');
  else if (hooksPath) pathspecs.push(`:(literal)${hooksPath}`);
  const listed = nulList(
    (
      await git(context, worktree, [
        'ls-files',
        '--others',
        '--ignored',
        '--exclude-standard',
        '-z',
        '--',
        ...pathspecs,
      ])
    ).stdout,
  );
  const generated = new Map();
  const isGenerated = async (relative) => {
    const match = HUSKY_GENERATED.exec(relative);
    if (!match) return false;
    const directory = relative.slice(0, match.index + match[0].length);
    if (!generated.has(directory)) {
      const marker = await readWorkingFile(worktree, `${directory}.gitignore`);
      generated.set(directory, marker !== null && marker.trim() === '*');
    }
    return generated.get(directory);
  };
  const found = [];
  for (const relative of listed) {
    if (!(await isGenerated(relative))) found.push(relative);
  }
  return found;
}

// HOOKS_UNTRUSTED details, or null when the head's hooks are the repository's own.
async function hookTrust(context, request, deps) {
  const { worktree, hookBase } = request;
  if (!request.sameRepository) return { reason: 'fork-head' };
  const hooksPath = await insideHooksPath(context, worktree, gitCommitEnv(deps.env ?? process.env));
  const againstBase = nulList(
    (
      await git(context, worktree, [
        'diff',
        '--name-only',
        '--no-renames',
        '-z',
        hookBase,
        'HEAD',
        '--',
      ])
    ).stdout,
  );
  const baseChanges = await changedHookConfig(
    context,
    worktree,
    againstBase,
    hooksPath,
    (relative) => readBlob(context, worktree, hookBase, relative),
    (relative) => readBlob(context, worktree, 'HEAD', relative),
  );
  if (baseChanges.length > 0) {
    return { reason: 'changed-against-base', hookBase, changed: baseChanges };
  }
  const tracked = nulList(
    (await git(context, worktree, ['diff', '--name-only', '--no-renames', '-z', 'HEAD', '--']))
      .stdout,
  );
  const untracked = nulList(
    (await git(context, worktree, ['ls-files', '--others', '--exclude-standard', '-z'])).stdout,
  );
  const ignored = await ignoredHookFiles(context, worktree, hooksPath);
  const treeChanges = await changedHookConfig(
    context,
    worktree,
    [...new Set([...tracked, ...untracked, ...ignored])],
    hooksPath,
    (relative) => readBlob(context, worktree, 'HEAD', relative),
    (relative) => readWorkingFile(worktree, relative),
  );
  if (treeChanges.length > 0) return { reason: 'changed-in-worktree', changed: treeChanges };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Signals

// Watches SIGINT, SIGTERM and SIGHUP on `deps.signalTarget` for the duration of the operation: the
// first one is recorded, stops the running Git child's group, and cuts a lock wait short.
function watchSignals(deps) {
  const target = deps.signalTarget;
  const state = { signal: null, dispose: () => {} };
  let wake = () => {};
  const woken = new Promise((resolve) => {
    wake = resolve;
  });
  if (target && typeof target.on === 'function') {
    const handlers = COMMIT_SIGNALS.map((signal) => {
      const handler = () => {
        if (state.signal !== null) return;
        state.signal = signal;
        deps.terminateChildren?.('SIGTERM');
        wake();
      };
      target.on(signal, handler);
      return [signal, handler];
    });
    state.dispose = () => {
      for (const [signal, handler] of handlers) target.off(signal, handler);
    };
  }
  const sleep = deps.sleep ?? ((ms) => delay(ms));
  state.sleep = (ms) =>
    state.signal !== null ? Promise.resolve() : Promise.race([sleep(ms), woken]);
  // A signal ends the lock wait at its next check: the clock jumps past any deadline.
  const now = deps.monotonicNow ?? (() => performance.now());
  state.monotonicNow = () => (state.signal !== null ? Number.POSITIVE_INFINITY : now());
  return state;
}

// ---------------------------------------------------------------------------------------------
// Under the lock

async function stagedNames(context, worktree) {
  return nulList(
    (
      await git(context, worktree, [
        '--literal-pathspecs',
        'diff',
        '--cached',
        '--name-only',
        '--no-renames',
        '-z',
      ])
    ).stdout,
  );
}

async function headCommit(context, worktree) {
  const result = await runGit(context, worktree, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  return result?.status === 0 ? asBuffer(result.stdout).toString('utf8').trim() : null;
}

function sameSet(left, right) {
  const a = new Set(left);
  return a.size === new Set(right).size && right.every((entry) => a.has(entry));
}

// Unstages the listed paths that are still staged, and only those. Returns the diagnostic of a
// failed unstage, or null.
async function unstageListed(context, worktree, paths) {
  let staged;
  try {
    staged = await stagedNames(context, worktree);
  } catch (error) {
    return { unstaged: false, message: error?.message ?? 'cannot read the staged set' };
  }
  const listed = new Set(paths);
  const own = staged.filter((entry) => listed.has(entry));
  if (own.length === 0) return null;
  const result = await runGit(context, worktree, [
    '--literal-pathspecs',
    'restore',
    '--staged',
    '--',
    ...own,
  ]);
  if (result?.status === 0) return null;
  return { unstaged: false, ...reportedStderr(result?.stderr ?? result?.error?.message) };
}

function withUnstage(details, unstage) {
  return unstage ? { ...details, unstage } : details;
}

// Whether this call still owns the lock: present, a valid owner with its token, and (when it was
// observed after acquisition) the same directory identity. A failed observation counts as lost.
async function ownsLock(context, held) {
  try {
    const observed = await observeLock(context, held.lock);
    return (
      observed.present === true &&
      observed.owner?.state === 'valid' &&
      observed.owner.fields?.token === held.token &&
      (held.identity === null || sameIdentity(observed.identity, held.identity))
    );
  } catch {
    return false;
  }
}

// Lost ownership: nothing is committed and the index is left as it is.
function ownershipLost(request, held, phase, extra = {}) {
  return new StateOutcome('NOT_OWNER', {
    lock: request.lock,
    path: held.path,
    reason: 'ownership-lost',
    phase,
    commit: null,
    unstaged: false,
    ...extra,
  });
}

async function interruptedOutcome(context, request, held, signal, before) {
  const head = before === undefined ? null : await headCommit(context, request.worktree);
  const landed = before !== undefined && head !== null && head !== before;
  if (landed) return new StateOutcome('INTERRUPTED', { signal, commit: head });
  if (before !== undefined && !(await ownsLock(context, held))) {
    return ownershipLost(request, held, 'cleanup', { failed: 'INTERRUPTED', signal });
  }
  const unstage =
    before === undefined ? null : await unstageListed(context, request.worktree, request.paths);
  return new StateOutcome('INTERRUPTED', withUnstage({ signal, commit: null }, unstage));
}

// Runs steps 1 to 6. `signals` is consulted after every step; `before` is HEAD before staging.
// Ownership of `held` is verified before staging, before the commit and before every unstage.
async function commitUnderLock(context, request, signals, deps, held) {
  const { worktree, paths } = request;
  const stop = (before) => interruptedOutcome(context, request, held, signals.signal, before);
  await deps.onPhase?.('locked');
  if (signals.signal) return stop(undefined);
  const untrusted = await hookTrust(context, request, deps);
  if (signals.signal) return stop(undefined);
  if (untrusted) return new StateOutcome('HOOKS_UNTRUSTED', untrusted);

  const foreign = await stagedNames(context, worktree);
  if (foreign.length > 0)
    return new StateOutcome('INDEX_NOT_CLEAN', { staged: foreign.slice(0, 64) });
  const before = await headCommit(context, worktree);
  if (before === null) fail('INVALID_INPUT', 'worktree has no HEAD commit');
  if (signals.signal) return stop(undefined);

  const unstaged = async (code, details) => {
    if (!(await ownsLock(context, held))) {
      return ownershipLost(request, held, 'cleanup', { failed: code, failedDetails: details });
    }
    return new StateOutcome(
      code,
      withUnstage(details, await unstageListed(context, worktree, paths)),
    );
  };
  const denied = async (step, result) =>
    unstaged('SANDBOX_DENIED', {
      step,
      ...reportedStderr(result?.stderr ?? result?.error?.message),
    });

  if (!(await ownsLock(context, held))) return ownershipLost(request, held, 'before-stage');
  const added = await runGit(context, worktree, ['--literal-pathspecs', 'add', '--', ...paths]);
  if (signals.signal) return stop(before);
  if (added?.status !== 0) {
    if (isSandboxDenial(added)) return denied('stage', added);
    return unstaged('STAGE_FAILED', reportedStderr(added?.stderr ?? added?.error?.message));
  }
  try {
    return await afterStaging(context, request, signals, deps, {
      before,
      held,
      stop,
      unstaged,
      denied,
    });
  } catch (error) {
    return recoverAfterStaging(context, request, held, before, error);
  }
}

// An unexpected failure once the listed paths are staged: a commit that landed is reported with
// its SHA as COMMIT_UNVERIFIED (nothing is amended or reset); with the lock lost it is NOT_OWNER
// carrying the error, nothing unstaged; otherwise only the listed paths are unstaged and the
// failure propagates.
async function recoverAfterStaging(context, request, held, before, error) {
  const head = await headCommit(context, request.worktree).catch(() => null);
  const reported = {
    code: error?.code ?? 'INTERNAL_ERROR',
    message: error?.message ?? String(error),
  };
  if (head !== null && head !== before) {
    return new StateOutcome('COMMIT_UNVERIFIED', {
      commit: head,
      expectedParent: before,
      listed: request.paths,
      error: reported,
    });
  }
  if (!(await ownsLock(context, held))) {
    return ownershipLost(request, held, 'cleanup', { failed: reported.code, error: reported });
  }
  const unstage = await unstageListed(context, request.worktree, request.paths).catch(
    (failure) => ({ unstaged: false, message: failure?.message ?? 'unstage failed' }),
  );
  if (unstage && error instanceof Error) {
    error.message = `${error.message}; unstaging the listed paths failed`;
  }
  throw error;
}

// Steps 3 to 6, with the listed paths staged.
async function afterStaging(
  context,
  request,
  signals,
  deps,
  { before, held, stop, unstaged, denied },
) {
  const { worktree, paths } = request;
  const staged = await stagedNames(context, worktree);
  if (!sameSet(staged, paths)) {
    const outcome = await unstaged('STAGED_SET_MISMATCH', {
      listed: paths,
      staged: staged.slice(0, 64),
    });
    if (outcome.code === 'STAGED_SET_MISMATCH') {
      outcome.details.stillStaged = (await stagedNames(context, worktree)).slice(0, 64);
    }
    return outcome;
  }

  const index = nulList(
    (
      await git(context, worktree, [
        '--literal-pathspecs',
        'ls-files',
        '--stage',
        '-z',
        '--',
        ...paths,
      ])
    ).stdout,
  );
  const blobs = new Map();
  for (const line of index) {
    const match = /^\d+ ([0-9a-f]+) \d\t(.*)$/s.exec(line);
    if (match) blobs.set(match[2], match[1]);
  }
  const differing = paths.filter((entry) => {
    const expected = request.expect[entry];
    return expected === null ? blobs.has(entry) : blobs.get(entry) !== expected;
  });
  if (differing.length > 0) return unstaged('STAGED_CONTENT_CHANGED', { paths: differing });

  await deps.onPhase?.('beforeCommit');
  if (signals.signal) return stop(before);
  const untrusted = await hookTrust(context, request, deps);
  if (signals.signal) return stop(before);
  if (untrusted) return unstaged('HOOKS_UNTRUSTED', untrusted);
  if (!(await ownsLock(context, held))) return ownershipLost(request, held, 'before-commit');
  const committed = await runGit(context, worktree, ['commit', `--message=${request.message}`], {
    env: gitCommitEnv(deps.env ?? process.env),
    timeoutMs: deps.commitTimeoutMs ?? COMMIT_TIMEOUT_MS,
    processGroup: true,
  });
  if (signals.signal) return stop(before);
  const head = await headCommit(context, worktree);
  if (committed?.status !== 0 && (head === null || head === before)) {
    if (isSandboxDenial(committed) || (await gitDirWriteDenied(context, worktree))) {
      return denied('commit', committed);
    }
    return unstaged('COMMIT_FAILED', {
      status: committed?.status ?? null,
      timedOut: committed?.timedOut === true,
      ...reportedStderr(committed?.stderr ?? committed?.error?.message),
    });
  }
  return verify(context, request, before, head, committed);
}

async function verify(context, request, before, head, committed) {
  const { worktree, paths } = request;
  const parent = await runGit(context, worktree, ['rev-parse', '--verify', '--quiet', `${head}^`]);
  const parentSha = parent?.status === 0 ? asBuffer(parent.stdout).toString('utf8').trim() : null;
  const changed = nulList(
    (
      await git(context, worktree, [
        'diff',
        '--name-only',
        '--no-renames',
        '-z',
        before,
        head,
        '--',
      ])
    ).stdout,
  );
  // A hook may rewrite and restage a listed file: the committed tree, not the inspected index, is
  // compared with `expect`.
  const tree = nulList(
    (
      await git(context, worktree, [
        '--literal-pathspecs',
        'ls-tree',
        '-z',
        '--full-tree',
        head,
        '--',
        ...paths,
      ])
    ).stdout,
  );
  const entries = new Map();
  for (const line of tree) {
    const match = /^\d+ \w+ ([0-9a-f]+)\t(.*)$/s.exec(line);
    if (match) entries.set(match[2], match[1]);
  }
  const differing = paths.filter((entry) => {
    const expected = request.expect[entry];
    return expected === null ? entries.has(entry) : entries.get(entry) !== expected;
  });
  const staged = await stagedNames(context, worktree);
  if (
    parentSha !== before ||
    !sameSet(changed, paths) ||
    staged.length > 0 ||
    differing.length > 0
  ) {
    return new StateOutcome('COMMIT_UNVERIFIED', {
      commit: head,
      parent: parentSha,
      expectedParent: before,
      listed: paths,
      committed: changed.slice(0, 64),
      staged: staged.slice(0, 64),
      differing: differing.slice(0, 64),
      ...(committed?.status === 0 ? {} : { commitStatus: committed?.status ?? null }),
    });
  }
  return { commit: head, paths };
}

// ---------------------------------------------------------------------------------------------
// commit create

async function releaseHeld(context, held, deps) {
  try {
    const released = await releaseOwned(context, held.lock, held.token, deps);
    if (released instanceof StateOutcome) {
      return { released: false, code: released.code, reason: released.details.reason ?? null };
    }
    return released.leftoverTombstone
      ? { released: true, leftoverTombstone: released.leftoverTombstone }
      : { released: true };
  } catch (error) {
    return {
      released: false,
      code: error instanceof RuntimeStateError ? error.code : 'INTERNAL_ERROR',
      message: error?.message ?? 'release failed',
    };
  }
}

const HELD_LOCK_OUTCOMES = Object.freeze(['INTERRUPTED', 'SANDBOX_DENIED']);

export async function commitCreate(input, deps) {
  const request = requireRequest(input);
  const context = makeContext(deps);
  const signals = watchSignals(deps);
  try {
    await requireRootSyntax(input.cwd);
    const { common } = await resolveRoot(context, input.cwd);
    await requireWorktree(context, request.worktree, common);
    await requirePathsInside(request.worktree, request.paths);
    await requireHookBase(context, request.worktree, request.hookBase);
    if (signals.signal) {
      return new StateOutcome('INTERRUPTED', { signal: signals.signal, commit: null });
    }
    const untrusted = await hookTrust(context, request, deps);
    if (untrusted) return new StateOutcome('HOOKS_UNTRUSTED', untrusted);

    // A signal during the hook trust check ends the call before the lock is touched; one during
    // the lock wait ends the wait at its next check, because the signal clock jumps to +Infinity.
    const interruptedBeforeLock = () =>
      new StateOutcome('INTERRUPTED', { signal: signals.signal, commit: null });
    if (signals.signal) return interruptedBeforeLock();
    const lockDeps = { ...deps, sleep: signals.sleep, monotonicNow: signals.monotonicNow };
    let acquired;
    try {
      acquired = await acquireOwned(
        context,
        request.lock,
        request.owner,
        request.waitSeconds,
        lockDeps,
      );
    } catch (error) {
      // A guard wait cut short by the signal clock fails; the signal is the cause to report.
      if (signals.signal) return interruptedBeforeLock();
      throw error;
    }
    if (acquired instanceof StateOutcome) {
      if (signals.signal) return interruptedBeforeLock();
      return acquired;
    }
    const observed = await observeLock(context, request.lock).catch(() => null);
    const held = {
      lock: request.lock,
      path: acquired.path,
      token: acquired.owner.token,
      identity: observed?.identity ?? null,
    };

    let value;
    let failure;
    try {
      value = await commitUnderLock(context, request, signals, deps, held);
    } catch (error) {
      failure = error;
    }
    const release = await releaseHeld(context, held, deps);
    const releaseFailed = !release.released;
    // A release that finds the lock gone or owned by another is lost ownership: that lock is not
    // this call's to offer or retry. Any other failed release may leave the lock held.
    const lostOwnership =
      releaseFailed && (release.code === 'NOT_OWNER' || release.code === 'NOT_HELD');
    const mayBeHeld = releaseFailed && !lostOwnership;
    const tombstone = release.leftoverTombstone
      ? { leftoverTombstone: release.leftoverTombstone }
      : {};
    if (failure) {
      if (releaseFailed && failure instanceof Error) {
        failure.message = `${failure.message}; lock release failed: ${release.code}${mayBeHeld ? `; token ${held.token}` : ''}`;
        failure.envelopeDetails = mayBeHeld
          ? { heldLock: held, lockRelease: release }
          : { lockRelease: release };
      }
      throw failure;
    }
    if (value instanceof StateOutcome) {
      // `heldLock` is present exactly when the lock may still be held; `lockRelease` reports the
      // internal release on every outcome the lock may outlive.
      const report = releaseFailed || HELD_LOCK_OUTCOMES.includes(value.code);
      return new StateOutcome(value.code, {
        ...value.details,
        ...tombstone,
        ...(mayBeHeld ? { heldLock: held } : {}),
        ...(report ? { lockRelease: release } : {}),
      });
    }
    if (lostOwnership) {
      return new StateOutcome('COMMIT_UNVERIFIED', {
        commit: value.commit,
        listed: value.paths,
        reason: 'ownership-lost',
        lockRelease: release,
        ...tombstone,
      });
    }
    return {
      ...value,
      ...tombstone,
      ...(mayBeHeld ? { heldLock: held, lockRelease: release } : {}),
    };
  } finally {
    signals.dispose();
  }
}
