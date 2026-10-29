// The shared runtime-state guard of the shipped runtime-state helpers.
//
// It holds the one root check and the one guard every mutation below `<cwd>/.effective-flow/`
// passes first, plus the write primitives built on it:
//
// - `resolveRuntimeRoot` proves that `cwd` is the main checkout's toplevel, never a linked
//   worktree, and stores the canonical root on the context.
// - `guardTarget` runs from that root immediately before a mutation, in this order: containment
//   below `.effective-flow/` and a symlink-free directory chain; `git ls-files -- .effective-flow/`
//   must list nothing; `git check-ignore --no-index` must report `.effective-flow/config.json`
//   and then the concrete target as ignored. Every predicate must pass, so the order never changes
//   the outcome.
// - `guardedMkdir`, `ensureGuardedDirectory`, `atomicWrite`, `guardedUnlink` and `guardedRmdir`
//   each run the guard on their exact target before touching the filesystem.
//
// A context is `{ runner, env, cwd }`: `runner` is either a helper's own runner or the shared
// `process-runner.mjs` runner, `env` comes from `gitBaseEnv`, and `cwd` is set by
// `resolveRuntimeRoot`. Every refusal is a `RuntimeStateError`; each helper maps its code to its
// own exit code.

import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, rmdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export const RUNTIME_STATE_DIR = '.effective-flow';

export class RuntimeStateError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'RuntimeStateError';
    this.code = code;
  }
}

function fail(code, message, cause) {
  throw new RuntimeStateError(code, message, cause === undefined ? undefined : { cause });
}

// ---------------------------------------------------------------------------------------------
// Git

// Inherited variables that would redirect git to another repository, index or object store,
// inject configuration, swap attributes, replace or graft objects, or reinterpret pathspecs and
// diff output. A helper sets the ones it needs itself.
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
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_ATTR_SOURCE',
  'GIT_REPLACE_REF_BASE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_SHALLOW_FILE',
]);
// `GIT_CONFIG_COUNT` pairs with any number of numbered key and value variables.
const STRIPPED_GIT_ENV_PATTERN = /^GIT_CONFIG_(?:KEY|VALUE)_/;

function isStrippedGitKey(key) {
  return STRIPPED_GIT_ENV.includes(key) || STRIPPED_GIT_ENV_PATTERN.test(key);
}

export function gitBaseEnv(source = process.env) {
  const env = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    if (value === undefined || isStrippedGitKey(key)) continue;
    env[key] = value;
  }
  env.GIT_OPTIONAL_LOCKS = '0';
  env.GIT_TERMINAL_PROMPT = '0';
  // Untranslated messages keep the reported detail and the error parsing below locale-independent.
  env.LC_ALL = 'C';
  return env;
}

// The shared `process-runner.mjs` merges a call's `env` over `process.env`, so a stripped variable
// the helper process inherited would come back. Masking every such key with `undefined` keeps it
// out of the child for both runners: `spawn` skips an undefined value.
function maskInheritedGitEnv(env) {
  const masked = { ...env };
  for (const key of Object.keys(process.env)) {
    if (isStrippedGitKey(key) && !Object.hasOwn(env, key)) masked[key] = undefined;
  }
  return masked;
}

export function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value ?? ''), 'utf8');
}

// The one stderr line worth reporting: the first `fatal:` or `error:` line, because warnings
// such as a line-ending notice can precede the actual cause; otherwise the first non-empty line.
export function errorDetail(buffer) {
  const lines = asBuffer(buffer)
    .toString('utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return lines.find((line) => /^(?:fatal|error):/.test(line)) ?? lines[0] ?? '';
}

// Runs `git -C <cwd> <args>` and returns the raw result when its status is allowed. Any other
// outcome is a GIT_FAILED error carrying one stderr line, never the full output; `explain` may
// turn stderr into a more actionable message. The call requests `stdoutBuffer` and normalises
// both streams through `asBuffer`, so a runner returning strings and one returning Buffers give
// the same result.
export async function git(context, cwd, args, { env = context.env, allowed = [0], explain } = {}) {
  const result = await context.runner({
    executable: 'git',
    args: ['-C', cwd, ...args],
    cwd,
    env: maskInheritedGitEnv(env),
    stdoutBuffer: true,
  });
  if (result?.error || !allowed.includes(result?.status)) {
    const detail = result?.error?.message ?? errorDetail(result?.stderr);
    const command = args.find((arg, index) => arg !== '-c' && args[index - 1] !== '-c');
    const explained = result?.error
      ? undefined
      : explain?.(asBuffer(result?.stderr).toString('utf8'));
    fail('GIT_FAILED', explained ?? `git ${command} failed${detail ? `: ${detail}` : ''}`);
  }
  return {
    status: result.status,
    stdout: asBuffer(result.stdout),
    stderr: asBuffer(result.stderr),
  };
}

export async function gitText(context, cwd, args, options) {
  return (await git(context, cwd, args, options)).stdout.toString('utf8').trim();
}

// ---------------------------------------------------------------------------------------------
// Root resolution

export async function resolveDirectory(value, label) {
  let canonical;
  try {
    canonical = await realpath(value);
    if (!(await stat(canonical)).isDirectory()) throw new Error('not a directory');
  } catch {
    fail('INVALID_INPUT', `${label} must be an existing directory`);
  }
  return canonical;
}

export async function commonDir(context, root) {
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

export async function requireToplevel(context, root, label) {
  let top;
  try {
    top = await realpath(await gitText(context, root, ['rev-parse', '--show-toplevel']));
  } catch (error) {
    if (error instanceof RuntimeStateError && error.code === 'GIT_FAILED') {
      fail('UNSAFE_TARGET', `${label} is not inside a git working tree`);
    }
    if (error instanceof RuntimeStateError) throw error;
    fail('UNSAFE_TARGET', `cannot resolve the toplevel of ${label}`);
  }
  if (top !== root) fail('UNSAFE_TARGET', `${label} is not the toplevel of its working tree`);
}

// `cwd` must be the main checkout's toplevel: its git directory is the repository's common
// directory, so it is never a linked worktree.
export async function resolveRuntimeRoot(context, value) {
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

// ---------------------------------------------------------------------------------------------
// Filesystem containment

export function relativeToRoot(root, target) {
  const relative = path.relative(root, target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('UNSAFE_TARGET', `${target} is not below ${root}`);
  }
  return relative.split(path.sep).join('/');
}

// Proves that every existing component from `root` (exclusive) down to `target` (inclusive) is a
// real directory; `target === root` is an empty chain. Returns false at the first missing
// component when `allowMissing` is set.
export async function assertDirectoryChain(root, target, { allowMissing = false } = {}) {
  if (target === root) return true;
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
// ignored, and the target's parent chain must hold no symlink. The state directory itself is
// probed as `.effective-flow/`, because a directory pattern matches a missing path only with its
// trailing slash.
export async function guardTarget(context, target) {
  const { cwd } = context;
  const relative = relativeToRoot(cwd, target);
  if (relative !== RUNTIME_STATE_DIR && !relative.startsWith(`${RUNTIME_STATE_DIR}/`)) {
    fail('UNSAFE_TARGET', `${target} is not below ${path.join(cwd, RUNTIME_STATE_DIR)}`);
  }
  await assertDirectoryChain(cwd, path.dirname(target));
  const tracked = await git(context, cwd, ['ls-files', '-z', '--', `${RUNTIME_STATE_DIR}/`]);
  if (tracked.stdout.length !== 0) {
    fail('RUNTIME_STATE_UNSAFE', `${RUNTIME_STATE_DIR}/ contains tracked files`);
  }
  const targetProbe = relative === RUNTIME_STATE_DIR ? `${RUNTIME_STATE_DIR}/` : relative;
  for (const probe of [`${RUNTIME_STATE_DIR}/config.json`, targetProbe]) {
    const result = await git(context, cwd, ['check-ignore', '--no-index', '-q', '--', probe], {
      allowed: [0, 1],
    });
    if (result.status !== 0) fail('RUNTIME_STATE_UNSAFE', `${probe} is not ignored`);
  }
}

// ---------------------------------------------------------------------------------------------
// Guarded mutations

// Creates one directory (mode 0700). Returns false when it already exists.
export async function guardedMkdir(context, target) {
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

export async function ensureGuardedDirectory(context, target) {
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

export const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const WRITE_FLAGS = fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | O_NOFOLLOW;

// Writes `content` to a fresh temporary sibling (exclusive, never following a symlink, mode 0600)
// and renames it over `target`, so a reader sees either the previous or the new file.
export async function atomicWrite(context, target, content) {
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
    if (error instanceof RuntimeStateError) throw error;
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

// Removes one file; an already missing file is not an error.
export async function guardedUnlink(context, target) {
  await guardTarget(context, target);
  try {
    await unlink(target);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      fail('WRITE_FAILED', `cannot remove ${target}: ${error?.code ?? error?.message}`);
    }
  }
}

// Removes one empty directory; a non-empty or missing directory is a WRITE_FAILED.
export async function guardedRmdir(context, target) {
  await guardTarget(context, target);
  try {
    await rmdir(target);
  } catch (error) {
    fail('WRITE_FAILED', `cannot remove ${target}: ${error?.code ?? error?.message}`);
  }
}
