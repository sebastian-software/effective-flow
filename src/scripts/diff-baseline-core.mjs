// Diff baseline for `build`, `fix` and `refactor`: records what the working tree looked like
// before a run's first implementation write, and later renders only the delta the run produced.
//
// `capture` allocates `<cwd>/.effective-flow/runs/<sessionId>[-N]/diff-baseline/` exclusively and
// snapshots the execution root into a tree object. `render` snapshots the execution root again
// with the identical procedure and writes the tree-to-tree delta as `diff.patch` plus
// `paths.json`. `discard` removes the `diff-baseline/` directory and its now empty run parent.
//
// A snapshot never touches the real index, stash, refs, HEAD or object store: every snapshot git
// call runs against a private temporary index (`GIT_INDEX_FILE`) and a private object directory
// (`GIT_OBJECT_DIRECTORY`) inside the run's `diff-baseline/` directory, with the real object store
// attached read-only as an alternate. Every git call carries `GIT_OPTIONAL_LOCKS=0`, so none takes
// the real `index.lock` while a sibling run commits.
//
// Every mkdir, write, rename and delete below `.effective-flow/` is preceded by the runtime-state
// guard, run from `cwd`: `.effective-flow/` must be ignored and untracked, and no component of the
// target's path below `cwd` may be a symlink. Any other result fails closed before the mutation.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, rm, rmdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export const DIFF_BASELINE_VERSION = 1;

export const DIFF_BASELINE_OPERATIONS = Object.freeze(['capture', 'render', 'discard']);

export const DIFF_BASELINE_ERROR_CODES = Object.freeze([
  'INVALID_INPUT',
  'UNSAFE_TARGET',
  'RUNTIME_STATE_UNSAFE',
  'GIT_FAILED',
  'MISSING_OBJECT',
  'WRITE_FAILED',
  'INTERNAL_ERROR',
]);

const EXIT_CODES = Object.freeze({
  INVALID_INPUT: 2,
  UNSAFE_TARGET: 3,
  RUNTIME_STATE_UNSAFE: 3,
  // An I/O fault aborts the run exactly as an unsafe target does, so it keeps that exit code and
  // only the error code tells the operator which of the two happened.
  WRITE_FAILED: 3,
});

export const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
// A run id is a session id, optionally followed by the `-N` collision suffix.
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,131}$/;
const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
export const MAX_RUN_ID_ATTEMPTS = 99;
export const MAX_SCOPE_ENTRIES = 10000;
export const MAX_STDIN_BYTES = 4 * 1024 * 1024;

const STATE_DIR = '.effective-flow';
const RUNS_DIR = 'runs';
const BASELINE_DIR = 'diff-baseline';
const OBJECTS_DIR = 'objects';
const BASELINE_FILE = 'baseline.json';
const PATCH_FILE = 'diff.patch';
const PATHS_FILE = 'paths.json';

// Inherited variables that would redirect git to another repository, index or object store, or
// reinterpret pathspecs and diff output. The helper sets the ones it needs itself.
const STRIPPED_GIT_ENV = Object.freeze([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_QUARANTINE_PATH',
  'GIT_NAMESPACE',
  'GIT_PREFIX',
  'GIT_LITERAL_PATHSPECS',
  'GIT_GLOB_PATHSPECS',
  'GIT_NOGLOB_PATHSPECS',
  'GIT_ICASE_PATHSPECS',
  'GIT_EXTERNAL_DIFF',
  'GIT_DIFF_OPTS',
  'GIT_OPTIONAL_LOCKS',
]);

// Snapshot calls pin the two settings that would otherwise let git start a daemon or cache
// extension on behalf of the private index. The same flags run for baseline and current snapshots,
// so they cannot introduce a delta.
const SNAPSHOT_CONFIG = Object.freeze([
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.untrackedCache=false',
]);

export class DiffBaselineError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'DiffBaselineError';
    this.code = code;
    this.exitCode = EXIT_CODES[code] ?? 1;
  }
}

function fail(code, message, cause) {
  throw new DiffBaselineError(code, message, cause === undefined ? undefined : { cause });
}

// ---------------------------------------------------------------------------------------------
// Process runner

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

export function gitBaseEnv(source = process.env) {
  const env = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    if (!STRIPPED_GIT_ENV.includes(key) && value !== undefined) env[key] = value;
  }
  env.GIT_OPTIONAL_LOCKS = '0';
  env.GIT_TERMINAL_PROMPT = '0';
  return env;
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value ?? ''), 'utf8');
}

function firstLine(buffer) {
  return asBuffer(buffer).toString('utf8').trim().split('\n')[0] ?? '';
}

// Runs `git -C <cwd> <args>` and returns the raw result when its status is allowed. Any other
// outcome is a GIT_FAILED error carrying the first stderr line, never the full output.
async function git(context, cwd, args, { env = context.env, allowed = [0] } = {}) {
  const result = await context.runner({ executable: 'git', args: ['-C', cwd, ...args], cwd, env });
  if (result?.error || !allowed.includes(result?.status)) {
    const detail = result?.error?.message ?? firstLine(result?.stderr);
    const command = args.find((arg, index) => arg !== '-c' && args[index - 1] !== '-c');
    fail('GIT_FAILED', `git ${command} failed${detail ? `: ${detail}` : ''}`);
  }
  return {
    status: result.status,
    stdout: asBuffer(result.stdout),
    stderr: asBuffer(result.stderr),
  };
}

async function gitText(context, cwd, args, options) {
  return (await git(context, cwd, args, options)).stdout.toString('utf8').trim();
}

// ---------------------------------------------------------------------------------------------
// Input validation

const OPERATION_KEYS = Object.freeze({
  capture: Object.freeze(['cwd', 'executionRoot', 'sessionId', 'repositoryIdentity']),
  render: Object.freeze(['cwd', 'executionRoot', 'dir', 'baselineTree', 'scope']),
  discard: Object.freeze(['cwd', 'dir']),
});

function requireInputObject(input, operation) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('INVALID_INPUT', 'input must be a JSON object');
  }
  const allowed = OPERATION_KEYS[operation];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) fail('INVALID_INPUT', `unknown input field: ${key}`);
  }
}

function isWellFormed(value) {
  return typeof value.isWellFormed === 'function' ? value.isWellFormed() : true;
}

function requireAbsolutePath(value, label) {
  if (typeof value !== 'string' || value === '') fail('INVALID_INPUT', `${label} must be a string`);
  if (!isWellFormed(value) || value.includes('\0')) {
    fail('INVALID_INPUT', `${label} must be a well-formed path`);
  }
  if (!path.isAbsolute(value)) fail('INVALID_INPUT', `${label} must be an absolute path`);
  return value;
}

function requireSessionId(value) {
  if (typeof value !== 'string' || !SESSION_ID_PATTERN.test(value)) {
    fail('INVALID_INPUT', `sessionId must match ${SESSION_ID_PATTERN.source}`);
  }
  return value;
}

function requireObjectId(value, label) {
  if (typeof value !== 'string' || !OBJECT_ID_PATTERN.test(value)) {
    fail('INVALID_INPUT', `${label} must be a lowercase hexadecimal object id`);
  }
  return value;
}

// Validates an optional path scope and returns it normalized, deduplicated and in input order, or
// null for the whole tree. Every entry is repository-relative and may not leave the repository.
export function normalizeScope(scope) {
  if (scope === undefined || scope === null) return null;
  if (!Array.isArray(scope)) fail('INVALID_INPUT', 'scope must be an array of paths');
  if (scope.length > MAX_SCOPE_ENTRIES) {
    fail('INVALID_INPUT', `scope may list at most ${MAX_SCOPE_ENTRIES} paths`);
  }
  const normalized = [];
  for (const [index, entry] of scope.entries()) {
    const label = `scope[${index}]`;
    if (typeof entry !== 'string' || entry === '') fail('INVALID_INPUT', `${label} must be a path`);
    if (!isWellFormed(entry) || entry.includes('\0')) {
      fail('INVALID_INPUT', `${label} must be a well-formed path`);
    }
    if (path.posix.isAbsolute(entry) || path.win32.isAbsolute(entry)) {
      fail('INVALID_INPUT', `${label} must be repository-relative`);
    }
    const clean = path.posix.normalize(entry).replace(/\/+$/, '');
    if (clean === '..' || clean.startsWith('../')) {
      fail('INVALID_INPUT', `${label} escapes the repository`);
    }
    const value = clean === '' ? '.' : clean;
    if (!normalized.includes(value)) normalized.push(value);
  }
  return normalized.length === 0 ? null : normalized;
}

// ---------------------------------------------------------------------------------------------
// Filesystem containment

async function resolveDirectory(value, label) {
  let canonical;
  try {
    canonical = await realpath(value);
    if (!(await stat(canonical)).isDirectory()) throw new Error('not a directory');
  } catch {
    fail('INVALID_INPUT', `${label} must be an existing directory`);
  }
  return canonical;
}

function relativeToRoot(root, target) {
  const relative = path.relative(root, target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('UNSAFE_TARGET', `${target} is not below ${root}`);
  }
  return relative.split(path.sep).join('/');
}

// Proves that every existing component from `root` (exclusive) down to `target` (inclusive) is a
// real directory. Returns false at the first missing component when `allowMissing` is set.
async function assertDirectoryChain(root, target, { allowMissing = false } = {}) {
  const parts = relativeToRoot(root, target).split('/');
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error?.code === 'ENOENT' && allowMissing) return false;
      if (error?.code === 'ENOENT') fail('UNSAFE_TARGET', `${current} does not exist`);
      fail('UNSAFE_TARGET', `cannot inspect ${current}: ${error?.code ?? error?.message}`);
    }
    if (info.isSymbolicLink()) fail('UNSAFE_TARGET', `${current} is a symlink`);
    if (!info.isDirectory()) fail('UNSAFE_TARGET', `${current} is not a directory`);
  }
  return true;
}

// The runtime-state guard. It runs from `cwd` immediately before every mutation below
// `.effective-flow/`: the directory must be ignored and untracked, the concrete target must be
// ignored, and the target's parent chain must hold no symlink.
async function guardTarget(context, target) {
  const { cwd } = context;
  const relative = relativeToRoot(cwd, target);
  if (relative !== STATE_DIR && !relative.startsWith(`${STATE_DIR}/`)) {
    fail('UNSAFE_TARGET', `${target} is not below ${path.join(cwd, STATE_DIR)}`);
  }
  await assertDirectoryChain(cwd, path.dirname(target));
  const tracked = await git(context, cwd, ['ls-files', '-z', '--', `${STATE_DIR}/`]);
  if (tracked.stdout.length !== 0) {
    fail('RUNTIME_STATE_UNSAFE', `${STATE_DIR}/ contains tracked files`);
  }
  for (const probe of [`${STATE_DIR}/config.json`, relative]) {
    const result = await git(context, cwd, ['check-ignore', '--no-index', '-q', '--', probe], {
      allowed: [0, 1],
    });
    if (result.status !== 0) fail('RUNTIME_STATE_UNSAFE', `${probe} is not ignored`);
  }
}

async function guardedMkdir(context, target) {
  await guardTarget(context, target);
  try {
    await mkdir(target, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') return false;
    fail('WRITE_FAILED', `cannot create ${target}: ${error?.code ?? error?.message}`);
  }
  const info = await lstat(target);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    fail('UNSAFE_TARGET', `${target} is not a real directory`);
  }
  return true;
}

async function ensureGuardedDirectory(context, target) {
  let info;
  try {
    info = await lstat(target);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      fail('UNSAFE_TARGET', `cannot inspect ${target}: ${error?.code ?? error?.message}`);
    }
    await guardedMkdir(context, target);
    info = await lstat(target);
  }
  if (info.isSymbolicLink()) fail('UNSAFE_TARGET', `${target} is a symlink`);
  if (!info.isDirectory()) fail('UNSAFE_TARGET', `${target} is not a directory`);
}

const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const WRITE_FLAGS = fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | O_NOFOLLOW;

// Writes `content` to a fresh temporary sibling (exclusive, never following a symlink, mode 0600)
// and renames it over `target`, so a reader sees either the previous or the new file.
async function atomicWrite(context, target, content) {
  const directory = path.dirname(target);
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.${randomBytes(8).toString('hex')}.tmp`,
  );
  await guardTarget(context, temporary);
  await guardTarget(context, target);
  try {
    const existing = await lstat(target);
    if (!existing.isFile()) fail('UNSAFE_TARGET', `${target} is not a regular file`);
  } catch (error) {
    if (error instanceof DiffBaselineError) throw error;
    if (error?.code !== 'ENOENT') {
      fail('UNSAFE_TARGET', `cannot inspect ${target}: ${error?.code ?? error?.message}`);
    }
  }
  let handle;
  try {
    handle = await open(temporary, WRITE_FLAGS, 0o600);
  } catch (error) {
    fail('UNSAFE_TARGET', `cannot create ${temporary}: ${error?.code ?? error?.message}`);
  }
  try {
    await handle.writeFile(content);
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    fail('WRITE_FAILED', `cannot write ${temporary}: ${error?.code ?? error?.message}`);
  }
  await handle.close();
  try {
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    fail('WRITE_FAILED', `cannot replace ${target}: ${error?.code ?? error?.message}`);
  }
}

async function guardedUnlink(context, target) {
  await guardTarget(context, target);
  try {
    await unlink(target);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      fail('WRITE_FAILED', `cannot remove ${target}: ${error?.code ?? error?.message}`);
    }
  }
}

function requireBaselineHandle(value) {
  const dir = requireAbsolutePath(value, 'dir');
  if (path.resolve(dir) !== dir) fail('INVALID_INPUT', 'dir must be a normalized absolute path');
  return dir;
}

// Canonicalizes a `diff-baseline` handle: it must name exactly
// `<cwd>/.effective-flow/runs/<runId>/diff-baseline`, with only the part above `cwd` allowed to be
// spelled through an alias of the same physical directory.
async function resolveBaselineDir(cwd, dir) {
  const runPath = path.dirname(dir);
  const runsPath = path.dirname(runPath);
  const statePath = path.dirname(runsPath);
  const runId = path.basename(runPath);
  if (
    path.basename(dir) !== BASELINE_DIR ||
    path.basename(runsPath) !== RUNS_DIR ||
    path.basename(statePath) !== STATE_DIR ||
    !RUN_ID_PATTERN.test(runId)
  ) {
    fail('UNSAFE_TARGET', `dir must be <cwd>/${STATE_DIR}/${RUNS_DIR}/<runId>/${BASELINE_DIR}`);
  }
  let root;
  try {
    root = await realpath(path.dirname(statePath));
  } catch {
    fail('UNSAFE_TARGET', 'dir is not below cwd');
  }
  if (root !== cwd) fail('UNSAFE_TARGET', 'dir is not below cwd');
  const runCanonical = path.join(cwd, STATE_DIR, RUNS_DIR, runId);
  return { dir: path.join(runCanonical, BASELINE_DIR), runPath: runCanonical, runId };
}

// ---------------------------------------------------------------------------------------------
// Repository identity

async function commonDir(context, root) {
  const value = await gitText(context, root, [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]);
  try {
    return await realpath(value);
  } catch {
    fail('UNSAFE_TARGET', `cannot resolve the git common directory of ${root}`);
  }
}

async function requireToplevel(context, root, label) {
  let top;
  try {
    top = await realpath(await gitText(context, root, ['rev-parse', '--show-toplevel']));
  } catch (error) {
    if (error instanceof DiffBaselineError && error.code === 'GIT_FAILED') {
      fail('UNSAFE_TARGET', `${label} is not inside a git working tree`);
    }
    if (error instanceof DiffBaselineError) throw error;
    fail('UNSAFE_TARGET', `cannot resolve the toplevel of ${label}`);
  }
  if (top !== root) fail('UNSAFE_TARGET', `${label} is not the toplevel of its working tree`);
}

// `cwd` must be the main checkout's toplevel: its git directory is the repository's common
// directory, so it is never a linked worktree.
async function resolveRuntimeRoot(context, value) {
  const cwd = await resolveDirectory(value, 'cwd');
  context.cwd = cwd;
  await requireToplevel(context, cwd, 'cwd');
  const common = await commonDir(context, cwd);
  const gitDirValue = await gitText(context, cwd, [
    'rev-parse',
    '--path-format=absolute',
    '--git-dir',
  ]);
  let gitDir;
  try {
    gitDir = await realpath(gitDirValue);
  } catch {
    fail('UNSAFE_TARGET', 'cannot resolve the git directory of cwd');
  }
  if (gitDir !== common)
    fail('UNSAFE_TARGET', 'cwd must be the main checkout, not a linked worktree');
  return { cwd, common };
}

async function resolveExecutionRoot(context, value, common) {
  const root = await resolveDirectory(value, 'executionRoot');
  await requireToplevel(context, root, 'executionRoot');
  if ((await commonDir(context, root)) !== common) {
    fail('UNSAFE_TARGET', 'executionRoot belongs to a different repository than cwd');
  }
  return root;
}

async function requireStateDirectory(context) {
  const stateDir = path.join(context.cwd, STATE_DIR);
  let info;
  try {
    info = await lstat(stateDir);
  } catch (error) {
    if (error?.code === 'ENOENT') fail('RUNTIME_STATE_UNSAFE', `${stateDir} does not exist`);
    fail('UNSAFE_TARGET', `cannot inspect ${stateDir}: ${error?.code ?? error?.message}`);
  }
  if (info.isSymbolicLink()) fail('UNSAFE_TARGET', `${stateDir} is a symlink`);
  if (!info.isDirectory()) fail('UNSAFE_TARGET', `${stateDir} is not a directory`);
  return stateDir;
}

// ---------------------------------------------------------------------------------------------
// Snapshot

async function realObjectDirectory(context, executionRoot) {
  const value = await gitText(context, executionRoot, [
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'objects',
  ]);
  try {
    return await realpath(value);
  } catch {
    fail('GIT_FAILED', 'cannot resolve the repository object directory');
  }
}

async function snapshotEnv(context, executionRoot, dir, indexFile) {
  const env = {
    ...context.env,
    GIT_OBJECT_DIRECTORY: path.join(dir, OBJECTS_DIR),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: await realObjectDirectory(context, executionRoot),
  };
  if (indexFile) env.GIT_INDEX_FILE = indexFile;
  return env;
}

async function currentHead(context, executionRoot) {
  const result = await git(
    context,
    executionRoot,
    ['rev-parse', '--verify', '-q', 'HEAD^{commit}'],
    {
      allowed: [0, 1],
    },
  );
  if (result.status !== 0) return null;
  const head = result.stdout.toString('utf8').trim();
  if (!OBJECT_ID_PATTERN.test(head)) fail('GIT_FAILED', 'git rev-parse returned no object id');
  return head;
}

// The one snapshot procedure shared by capture and render: seed a private index from HEAD (or an
// empty index for an unborn branch), stage every non-ignored path, write the tree. Snapshot
// objects land only in `<dir>/objects`; the temporary index is removed afterwards.
async function snapshot(context, executionRoot, dir) {
  const head = await currentHead(context, executionRoot);
  const indexFile = path.join(dir, `index-${randomBytes(8).toString('hex')}`);
  await guardTarget(context, indexFile);
  await guardTarget(context, `${indexFile}.lock`);
  const env = await snapshotEnv(context, executionRoot, dir, indexFile);
  try {
    await git(
      context,
      executionRoot,
      [...SNAPSHOT_CONFIG, 'read-tree', ...(head ? [head] : ['--empty'])],
      {
        env,
      },
    );
    await git(context, executionRoot, [...SNAPSHOT_CONFIG, 'add', '-A', '--', '.'], { env });
    const tree = (
      await git(context, executionRoot, [...SNAPSHOT_CONFIG, 'write-tree'], { env })
    ).stdout
      .toString('utf8')
      .trim();
    if (!OBJECT_ID_PATTERN.test(tree)) fail('GIT_FAILED', 'git write-tree returned no object id');
    return { head, tree };
  } finally {
    for (const leftover of [indexFile, `${indexFile}.lock`]) {
      try {
        await lstat(leftover);
      } catch {
        continue;
      }
      await guardedUnlink(context, leftover);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Name-status parsing

const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true });
const LOSSY_UTF8 = new TextDecoder('utf-8');

function decodePath(bytes) {
  try {
    return { text: STRICT_UTF8.decode(bytes) };
  } catch {
    return { text: LOSSY_UTF8.decode(bytes), base64: Buffer.from(bytes).toString('base64') };
  }
}

// Parses `git diff-tree -r -z --name-status -M` output. Each record is a status token followed by
// one path, or two (source, destination) for a rename or copy. The score is dropped. A path that
// is not valid UTF-8 keeps its exact bytes in `pathBase64` / `oldPathBase64`.
export function parseNameStatus(buffer) {
  const bytes = asBuffer(buffer);
  const fields = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0) {
      fields.push(bytes.subarray(start, index));
      start = index + 1;
    }
  }
  if (start !== bytes.length) fail('GIT_FAILED', 'git diff-tree output is not NUL-terminated');
  const entries = [];
  let index = 0;
  while (index < fields.length) {
    const token = fields[index].toString('utf8');
    const status = token.charAt(0);
    if (!/^[A-Z]$/.test(status)) fail('GIT_FAILED', `unexpected git diff-tree status: ${token}`);
    const paired = status === 'R' || status === 'C';
    const needed = paired ? 3 : 2;
    if (index + needed > fields.length) fail('GIT_FAILED', 'truncated git diff-tree output');
    const entry = { status };
    const destination = decodePath(fields[index + needed - 1]);
    entry.path = destination.text;
    if (destination.base64) entry.pathBase64 = destination.base64;
    if (paired) {
      const source = decodePath(fields[index + 1]);
      entry.oldPath = source.text;
      if (source.base64) entry.oldPathBase64 = source.base64;
    }
    entries.push(entry);
    index += needed;
  }
  return entries;
}

function pathspecArgs(scope) {
  return scope ? ['--', ...scope.map((entry) => `:(literal)${entry}`)] : [];
}

// ---------------------------------------------------------------------------------------------
// Operations

function makeContext(deps) {
  return {
    runner: deps.runner ?? createProcessRunner(),
    env: gitBaseEnv(deps.env ?? process.env),
    cwd: null,
  };
}

// Removes a diff-baseline directory and then its run parent when that is left empty.
async function removeBaseline(context, dir, runPath) {
  await guardTarget(context, dir);
  try {
    await rm(dir, { recursive: true, force: false, maxRetries: 0 });
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      fail('WRITE_FAILED', `cannot remove ${dir}: ${error?.code ?? error?.message}`);
    }
  }
  await guardTarget(context, runPath);
  try {
    await rmdir(runPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOTEMPTY' || error?.code === 'EEXIST' || error?.code === 'ENOENT') {
      return false;
    }
    fail('WRITE_FAILED', `cannot remove ${runPath}: ${error?.code ?? error?.message}`);
  }
}

export async function captureBaseline(input, deps = {}) {
  requireInputObject(input, 'capture');
  const context = makeContext(deps);
  const cwdInput = requireAbsolutePath(input.cwd, 'cwd');
  const executionInput = requireAbsolutePath(input.executionRoot, 'executionRoot');
  const sessionId = requireSessionId(input.sessionId);
  const identityPath = requireAbsolutePath(input.repositoryIdentity, 'repositoryIdentity');
  const { cwd, common } = await resolveRuntimeRoot(context, cwdInput);
  let identity;
  try {
    identity = await realpath(identityPath);
  } catch {
    fail('UNSAFE_TARGET', 'repositoryIdentity does not exist');
  }
  if (identity !== common) fail('UNSAFE_TARGET', 'repositoryIdentity does not match cwd');
  const executionRoot = await resolveExecutionRoot(context, executionInput, common);
  const stateDir = await requireStateDirectory(context);

  const runsDir = path.join(stateDir, RUNS_DIR);
  await ensureGuardedDirectory(context, runsDir);
  let runId = null;
  for (let attempt = 1; attempt <= MAX_RUN_ID_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 1 ? sessionId : `${sessionId}-${attempt}`;
    if (await guardedMkdir(context, path.join(runsDir, candidate))) {
      runId = candidate;
      break;
    }
  }
  if (!runId) {
    fail(
      'UNSAFE_TARGET',
      `no free run directory for ${sessionId} after ${MAX_RUN_ID_ATTEMPTS} attempts`,
    );
  }
  const runPath = path.join(runsDir, runId);
  const dir = path.join(runPath, BASELINE_DIR);
  try {
    if (!(await guardedMkdir(context, dir))) fail('UNSAFE_TARGET', `${dir} already exists`);
    if (!(await guardedMkdir(context, path.join(dir, OBJECTS_DIR)))) {
      fail('UNSAFE_TARGET', `${path.join(dir, OBJECTS_DIR)} already exists`);
    }
    const { head, tree } = await snapshot(context, executionRoot, dir);
    const record = {
      version: DIFF_BASELINE_VERSION,
      runId,
      baselineHead: head,
      baselineTree: tree,
      executionRoot,
    };
    await atomicWrite(
      context,
      path.join(dir, BASELINE_FILE),
      `${JSON.stringify(record, null, 2)}\n`,
    );
    return { runId, dir, baselineHead: head, baselineTree: tree };
  } catch (error) {
    // A failed capture leaves no half-built baseline behind; the cleanup is itself guarded and
    // never masks the original failure.
    try {
      await removeBaseline(context, dir, runPath);
    } catch {
      // Keep the original error.
    }
    throw error;
  }
}

async function requireBaselineDirectory(cwd, value) {
  const resolved = await resolveBaselineDir(cwd, value);
  const present = await assertDirectoryChain(cwd, resolved.dir, { allowMissing: true });
  return { ...resolved, present };
}

export async function renderDiff(input, deps = {}) {
  requireInputObject(input, 'render');
  const context = makeContext(deps);
  const cwdInput = requireAbsolutePath(input.cwd, 'cwd');
  const executionInput = requireAbsolutePath(input.executionRoot, 'executionRoot');
  const handle = requireBaselineHandle(input.dir);
  const baselineTree = requireObjectId(input.baselineTree, 'baselineTree');
  const scope = normalizeScope(input.scope);
  const { cwd, common } = await resolveRuntimeRoot(context, cwdInput);
  const executionRoot = await resolveExecutionRoot(context, executionInput, common);
  await requireStateDirectory(context);
  const { dir, present } = await requireBaselineDirectory(cwd, handle);
  if (!present) {
    fail('MISSING_OBJECT', `baseline tree ${baselineTree} is unavailable: ${dir} does not exist`);
  }
  if (!(await assertDirectoryChain(cwd, path.join(dir, OBJECTS_DIR), { allowMissing: true }))) {
    fail(
      'MISSING_OBJECT',
      `baseline tree ${baselineTree} is unavailable: its object store is missing`,
    );
  }

  const lookupEnv = await snapshotEnv(context, executionRoot, dir);
  const kind = await git(context, executionRoot, ['cat-file', '-t', baselineTree], {
    env: lookupEnv,
    allowed: [0, 1, 128],
  });
  if (kind.status !== 0 || kind.stdout.toString('utf8').trim() !== 'tree') {
    fail('MISSING_OBJECT', `baseline tree ${baselineTree} is missing from the snapshot store`);
  }

  const { tree: currentTree } = await snapshot(context, executionRoot, dir);
  const range = [baselineTree, currentTree];
  const spec = pathspecArgs(scope);
  const nameStatus = await git(
    context,
    executionRoot,
    ['diff-tree', '-r', '-z', '--name-status', '-M', '--no-ext-diff', ...range, ...spec],
    { env: lookupEnv },
  );
  const entries = parseNameStatus(nameStatus.stdout);
  const patch = await git(
    context,
    executionRoot,
    [
      'diff-tree',
      '-r',
      '-p',
      '-M',
      '--no-color',
      '--no-ext-diff',
      '--no-textconv',
      '--src-prefix=a/',
      '--dst-prefix=b/',
      ...range,
      ...spec,
    ],
    { env: lookupEnv },
  );

  const diffPath = path.join(dir, PATCH_FILE);
  const pathsPath = path.join(dir, PATHS_FILE);
  await atomicWrite(context, diffPath, patch.stdout);
  await atomicWrite(
    context,
    pathsPath,
    `${JSON.stringify({ version: DIFF_BASELINE_VERSION, baselineTree, currentTree, scope, entries }, null, 2)}\n`,
  );
  return { diffPath, pathsPath, currentTree, entries };
}

export async function discardBaseline(input, deps = {}) {
  requireInputObject(input, 'discard');
  const context = makeContext(deps);
  const cwdInput = requireAbsolutePath(input.cwd, 'cwd');
  const handle = requireBaselineHandle(input.dir);
  const { cwd } = await resolveRuntimeRoot(context, cwdInput);
  await requireStateDirectory(context);
  const { dir, runPath, present } = await requireBaselineDirectory(cwd, handle);
  if (!present) return { removed: false, parentRemoved: false };
  const parentRemoved = await removeBaseline(context, dir, runPath);
  return { removed: true, parentRemoved };
}

const HANDLERS = Object.freeze({
  capture: captureBaseline,
  render: renderDiff,
  discard: discardBaseline,
});

export async function executeOperation(operation, input = {}, deps = {}) {
  try {
    if (!DIFF_BASELINE_OPERATIONS.includes(operation)) {
      fail('INVALID_INPUT', `unknown operation: ${operation}`);
    }
    const result = await HANDLERS[operation](input, deps);
    return { ok: true, operation, result };
  } catch (error) {
    return errorEnvelope(operation, error);
  }
}

export function errorEnvelope(operation, error) {
  const normalized =
    error instanceof DiffBaselineError
      ? error
      : new DiffBaselineError(
          'INTERNAL_ERROR',
          error?.message ?? 'unexpected diff-baseline failure',
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
