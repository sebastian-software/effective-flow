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
//   the outcome. `guardTargets` applies the same predicates to a batch of targets with one
//   `ls-files` and one `check-ignore --stdin` call, for a caller that mutates many targets in a row.
// - `guardedMkdir`, `ensureGuardedDirectory`, `atomicWrite`, `createNoClobber`, `guardedUnlink`
//   and `guardedRmdir` each run the guard on their exact target before touching the filesystem.
// - Two exact-name classes outside `.effective-flow/` (legacy memory and harness settings, see
//   their section below) and the read-only walk of the legacy runtime directories.
// - The `legacyRuntimeDirectory` and `legacyConfigFile` removal classes and their listing-bound
//   remover (see their section at the end).
//
// A context is `{ runner, env, cwd }`: `runner` is either a helper's own runner or the shared
// `process-runner.mjs` runner, `env` comes from `gitBaseEnv`, and `cwd` is set by
// `resolveRuntimeRoot`. Every refusal is a `RuntimeStateError`; each helper maps its code to its
// own exit code.

import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  link,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rmdir,
  stat,
  unlink,
} from 'node:fs/promises';
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

// The variables that point git at another repository, worktree, index or object store. Only these
// are stripped from the environment of a commit the helper makes on the caller's behalf.
const REPOSITORY_REDIRECTING_GIT_ENV = Object.freeze([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_QUARANTINE_PATH',
  'GIT_NAMESPACE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
]);

// The environment of a commit made in the caller's stead: the one a plain `git commit` in that
// worktree would see, so identity, signing, `GIT_CONFIG_*` configuration and the caller's locale
// all stay, with only the repository-redirecting variables removed. `GIT_TERMINAL_PROMPT=0` keeps
// a credential prompt from blocking the bounded call; a commit asks for no credential itself.
export function gitCommitEnv(source = process.env) {
  const env = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    if (value === undefined || REPOSITORY_REDIRECTING_GIT_ENV.includes(key)) continue;
    env[key] = value;
  }
  env.GIT_TERMINAL_PROMPT = '0';
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

// Runs `git -C <cwd> <args>` once and returns the runner's raw result, whatever its status, for a
// caller that classifies a failure itself. `timeoutMs` bounds the call and `processGroup` makes the
// bound, and `terminateActiveProcessGroups`, reach every descendant such as a hook.
export async function runGit(
  context,
  cwd,
  args,
  { env = context.env, stdin, timeoutMs, processGroup = false } = {},
) {
  return context.runner({
    executable: 'git',
    args: ['-C', cwd, ...args],
    cwd,
    env: maskInheritedGitEnv(env),
    stdoutBuffer: true,
    ...(stdin === undefined ? {} : { stdin }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(processGroup ? { processGroup: true } : {}),
  });
}

// Runs `git -C <cwd> <args>` and returns the raw result when its status is allowed. Any other
// outcome is a GIT_FAILED error carrying one stderr line, never the full output; `explain` may
// turn stderr into a more actionable message. The call requests `stdoutBuffer` and normalises
// both streams through `asBuffer`, so a runner returning strings and one returning Buffers give
// the same result.
export async function git(
  context,
  cwd,
  args,
  { env = context.env, allowed = [0], explain, stdin } = {},
) {
  const result = await runGit(context, cwd, args, { env, stdin });
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

// The runtime-state guard for a batch of targets, each with its own verdict: every target passes
// the containment and directory-chain check, `git ls-files -- .effective-flow/` runs once, and one
// `git check-ignore --no-index --stdin -z` call must report `.effective-flow/config.json` and every
// concrete target as ignored. The refusal names the first target that fails, in input order, as
// the error's `target` (absent for a refusal that concerns no single target). A caller still
// re-runs `assertDirectoryChain` immediately before each mutation, which spawns nothing.
export async function guardTargets(context, targets) {
  const { cwd } = context;
  const probes = [];
  for (const target of targets) {
    try {
      const relative = relativeToRoot(cwd, target);
      if (relative !== RUNTIME_STATE_DIR && !relative.startsWith(`${RUNTIME_STATE_DIR}/`)) {
        fail('UNSAFE_TARGET', `${target} is not below ${path.join(cwd, RUNTIME_STATE_DIR)}`);
      }
      await assertDirectoryChain(cwd, path.dirname(target));
      probes.push(relative === RUNTIME_STATE_DIR ? `${RUNTIME_STATE_DIR}/` : relative);
    } catch (error) {
      if (error instanceof RuntimeStateError) error.target = target;
      throw error;
    }
  }
  if (probes.length === 0) return;
  const tracked = await git(context, cwd, ['ls-files', '-z', '--', `${RUNTIME_STATE_DIR}/`]);
  if (tracked.stdout.length !== 0) {
    fail('RUNTIME_STATE_UNSAFE', `${RUNTIME_STATE_DIR}/ contains tracked files`);
  }
  const config = `${RUNTIME_STATE_DIR}/config.json`;
  const result = await git(context, cwd, ['check-ignore', '--no-index', '--stdin', '-z'], {
    allowed: [0, 1],
    stdin: `${[config, ...probes].join('\0')}\0`,
  });
  const ignored = new Set(result.stdout.toString('utf8').split('\0'));
  if (!ignored.has(config)) fail('RUNTIME_STATE_UNSAFE', `${config} is not ignored`);
  for (const [index, probe] of probes.entries()) {
    if (ignored.has(probe)) continue;
    const error = new RuntimeStateError('RUNTIME_STATE_UNSAFE', `${probe} is not ignored`);
    error.target = targets[index];
    throw error;
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
//
// `beforeRename`, when given, runs after the temporary file is complete and immediately before the
// rename, with no git spawn in between. A truthy return value aborts the write: the temporary file
// is removed, `target` stays untouched, and the value is returned as `{ written: false, aborted }`.
// A throw removes the temporary file and propagates. Otherwise the result is `{ written: true }`.
export async function atomicWrite(context, target, content, { beforeRename } = {}) {
  const temporary = temporarySibling(target);
  await guardTarget(context, temporary);
  await guardTarget(context, target);
  return replaceAtomically(temporary, target, content, beforeRename);
}

function temporarySibling(target) {
  return path.join(
    path.dirname(target),
    `.${path.basename(target)}.${randomBytes(8).toString('hex')}.tmp`,
  );
}

async function assertRegularOrMissing(target) {
  try {
    const existing = await lstat(target);
    if (!existing.isFile()) fail('UNSAFE_TARGET', `${target} is not a regular file`);
  } catch (error) {
    if (error instanceof RuntimeStateError) throw error;
    if (error?.code !== 'ENOENT') {
      fail('UNSAFE_TARGET', `cannot inspect ${target}: ${error?.code ?? error?.message}`);
    }
  }
}

async function replaceAtomically(temporary, target, content, beforeRename) {
  await assertRegularOrMissing(target);
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
  if (beforeRename) {
    let aborted;
    try {
      aborted = await beforeRename();
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
    if (aborted) {
      await unlink(temporary).catch(() => {});
      return { written: false, aborted };
    }
  }
  try {
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    fail('WRITE_FAILED', `cannot replace ${target}: ${error?.code ?? error?.message}`);
  }
  return { written: true };
}

// ---------------------------------------------------------------------------------------------
// No-clobber create

// A temporary file of `createNoClobber` older than this is left over by an interrupted call and
// pruned by the next call in the same directory.
export const NO_CLOBBER_TEMP_MAX_AGE_MS = 60 * 60 * 1000;
// The prefix names the temporary family, e.g. `.write-report-`: a leading dot, lowercase letters,
// digits and dashes, ending in a dash. The full temporary name is `<prefix><16 hex>.tmp`, which no
// report-name family and no `*.md` reader glob matches.
const NO_CLOBBER_PREFIX_PATTERN = /^\.[a-z0-9-]+-$/;
const NO_CLOBBER_DEFAULT_FS = Object.freeze({ link, lstat, open, readdir, unlink });

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sameInode(left, right) {
  return Boolean(left && right) && left.dev === right.dev && left.ino === right.ino;
}

async function inodeOf(fs, target) {
  try {
    const info = await fs.lstat(target, { bigint: true });
    return info.isFile() ? { dev: info.dev, ino: info.ino } : null;
  } catch {
    return null;
  }
}

async function entryExists(fs, target) {
  try {
    await fs.lstat(target);
    return true;
  } catch {
    return false;
  }
}

async function readBack(fs, target) {
  const handle = await fs.open(target, fsConstants.O_RDONLY | O_NOFOLLOW);
  try {
    return await handle.readFile();
  } finally {
    await handle.close().catch(() => {});
  }
}

// Writes `bytes` to a new file at `file` (exclusive, never following a symlink, mode 0600), syncs
// it and returns its inode. Returns null when the name is taken (EEXIST). A failed write removes
// the file only while it is still the inode this call created; any failure is a WRITE_FAILED.
async function writeExclusive(fs, file, bytes) {
  let handle;
  try {
    handle = await fs.open(file, WRITE_FLAGS, 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') return null;
    fail('WRITE_FAILED', `cannot create ${file}: ${error?.code ?? error?.message}`);
  }
  let created = null;
  try {
    const info = await handle.stat({ bigint: true });
    created = { dev: info.dev, ino: info.ino };
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => {});
    if (sameInode(await inodeOf(fs, file), created)) await fs.unlink(file).catch(() => {});
    fail('WRITE_FAILED', `cannot write ${file}: ${error?.code ?? error?.message}`);
  }
  await handle.close().catch(() => {});
  return created;
}

// The link() failures that mean the filesystem offers no hard link here, not that the target is
// taken or unsafe: createNoClobber then falls back to an exclusive create of the target itself.
const LINK_UNSUPPORTED_CODES = Object.freeze(['ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'EXDEV', 'ENOSYS']);

// Creates `target` with `content` and never replaces an existing entry: the content goes to a
// fresh temporary sibling `<tempPrefix><random>.tmp` (exclusive, never following a symlink, mode
// 0600), which is then hard-linked to `target`, so an existing or concurrently created target wins,
// and the temporary name is unlinked. On this path the target is never visible partially written.
//
// When link() fails with one of LINK_UNSUPPORTED_CODES (a filesystem without hard links, such as
// some network, FUSE or FAT mounts), the temporary file is removed and `target` itself is created
// exclusively (`O_CREAT | O_EXCL`, never following a symlink, mode 0600) and written. No-clobber
// holds the same way: a taken name is EEXIST. This fallback has a partial-file window: between the
// exclusive create and the end of the write, a concurrent reader can see `target` empty or
// partially written. A failed write removes the target only while it is still the inode this call
// created.
//
// Returns `{ created: true, bytes }`, or `{ created: false, code: 'EEXIST' }` when the target name
// is taken; nothing is left behind in that case. After the create the target is verified: it must
// be the very inode this call wrote, and hold exactly `content`. A failed verification removes the
// target only while it is still that inode, and is a WRITE_FAILED; when a foreign entry holds the
// name instead, that error carries it as `foreignPath`. Every other failure is a WRITE_FAILED (or
// the guard's own refusal) with no target created.
//
// Temporary files of the same prefix older than NO_CLOBBER_TEMP_MAX_AGE_MS are pruned first. The
// temporary file, the target and every pruned file pass one batched runtime-state guard; the
// symlink-free directory chain is re-proven right before the writes. `options.fs` may override the
// filesystem calls (`link`, `lstat`, `open`, `readdir`, `unlink`) and `options.now` the clock.
export async function createNoClobber(context, target, content, options = {}) {
  const { tempPrefix } = options;
  if (typeof tempPrefix !== 'string' || !NO_CLOBBER_PREFIX_PATTERN.test(tempPrefix)) {
    fail('INVALID_INPUT', `tempPrefix must match ${NO_CLOBBER_PREFIX_PATTERN.source}`);
  }
  const fs = { ...NO_CLOBBER_DEFAULT_FS, ...options.fs };
  const now = options.now ?? Date.now;
  const bytes = asBuffer(content);
  const directory = path.dirname(target);
  const temporary = path.join(directory, `${tempPrefix}${randomBytes(8).toString('hex')}.tmp`);
  const stale = await staleTemporaries(fs, directory, tempPrefix, now());
  await guardTargets(context, [temporary, target, ...stale]);
  await assertDirectoryChain(context.cwd, directory);
  for (const leftover of stale) await fs.unlink(leftover).catch(() => {});

  let created = await writeExclusive(fs, temporary, bytes);
  if (!created) fail('WRITE_FAILED', `cannot create ${temporary}: EEXIST`);
  try {
    await fs.link(temporary, target);
    await fs.unlink(temporary).catch(() => {});
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    if (error?.code === 'EEXIST') return { created: false, code: 'EEXIST' };
    if (!LINK_UNSUPPORTED_CODES.includes(error?.code)) {
      fail('WRITE_FAILED', `cannot create ${target}: ${error?.code ?? error?.message}`);
    }
    created = await writeExclusive(fs, target, bytes);
    if (!created) return { created: false, code: 'EEXIST' };
  }

  let problem = null;
  try {
    if (!sameInode(await inodeOf(fs, target), created)) {
      problem = 'it is not the file just written';
    } else if (!(await readBack(fs, target)).equals(bytes)) {
      problem = 'its content differs from the content just written';
    }
  } catch (error) {
    problem = `it cannot be read back (${error?.code ?? error?.message})`;
  }
  if (problem) {
    // Removes only the file this call created, never a foreign one that took its name; a foreign
    // entry left at the name is named as `foreignPath` on the error.
    const own = sameInode(await inodeOf(fs, target), created);
    if (own) await fs.unlink(target).catch(() => {});
    const error = new RuntimeStateError(
      'WRITE_FAILED',
      `${target} failed verification after it was created: ${problem}`,
    );
    if (!own && (await entryExists(fs, target))) error.foreignPath = target;
    throw error;
  }
  return { created: true, bytes: bytes.length };
}

// The regular temporary files of `prefix` in `directory` whose mtime is older than the maximum
// age; a missing or unreadable directory has none.
async function staleTemporaries(fs, directory, prefix, nowMs) {
  const pattern = new RegExp(`^${escapeRegExp(prefix)}[0-9a-f]{16}\\.tmp$`);
  let names;
  try {
    names = await fs.readdir(directory);
  } catch {
    return [];
  }
  const stale = [];
  for (const name of names.filter((entry) => pattern.test(entry)).sort()) {
    const candidate = path.join(directory, name);
    try {
      const info = await fs.lstat(candidate);
      if (info.isFile() && nowMs - info.mtimeMs > NO_CLOBBER_TEMP_MAX_AGE_MS) stale.push(candidate);
    } catch {
      // Gone already.
    }
  }
  return stale;
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

// ---------------------------------------------------------------------------------------------
// Exact-name target classes outside `.effective-flow/`
//
// `guardTarget` above admits only ignored targets below `.effective-flow/` and stays unchanged.
// Two further classes each admit exactly one path below `cwd`, and nothing else:
//
// - Legacy memory: `<cwd>/.sf-memory.json`, a regular file under `lstat`, untracked, and not
//   required to be ignored. Only the legacy adoption of the memory helper unlinks it, through
//   `guardedUnlinkLegacyMemory`.
// - Harness settings: `<cwd>/.claude/settings.local.json`. Its directory chain must pass `lstat`
//   (no symlink, every existing component a directory), an existing target must be a regular file,
//   it must be untracked, and `git check-ignore` must report it ignored (`.gitignore`,
//   `info/exclude` or the global `core.excludesFile`). It is never unlinked.
//
// The harness refusals carry their own codes, `SETTINGS_TRACKED` and `SETTINGS_NOT_IGNORED`, so a
// caller can branch on them; every other refusal is UNSAFE_TARGET or RUNTIME_STATE_UNSAFE.

export const LEGACY_MEMORY_FILE = '.sf-memory.json';
export const HARNESS_SETTINGS_DIR = '.claude';
export const HARNESS_SETTINGS_FILE = '.claude/settings.local.json';

async function isTracked(context, relative) {
  const tracked = await git(context, context.cwd, ['ls-files', '-z', '--', relative]);
  return tracked.stdout.length !== 0;
}

export async function guardLegacyMemory(context, target) {
  const { cwd } = context;
  if (target !== path.join(cwd, LEGACY_MEMORY_FILE)) {
    fail('UNSAFE_TARGET', `${target} is not ${path.join(cwd, LEGACY_MEMORY_FILE)}`);
  }
  let info;
  try {
    info = await lstat(target);
  } catch (error) {
    fail('UNSAFE_TARGET', `cannot inspect ${target}: ${error?.code ?? error?.message}`);
  }
  if (!info.isFile()) fail('UNSAFE_TARGET', `${target} is not a regular file`);
  if (await isTracked(context, LEGACY_MEMORY_FILE)) {
    fail('RUNTIME_STATE_UNSAFE', `${LEGACY_MEMORY_FILE} is tracked`);
  }
}

// Removes the legacy memory file; an already missing file is not an error.
export async function guardedUnlinkLegacyMemory(context, target) {
  try {
    await lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
  }
  await guardLegacyMemory(context, target);
  try {
    await unlink(target);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      fail('WRITE_FAILED', `cannot remove ${target}: ${error?.code ?? error?.message}`);
    }
  }
}

// The harness-settings guard. `allowMissingDirectory` admits a missing `.claude/`, which a read or
// a preview may observe; the write path creates it first through `guardedMkdirHarnessDirectory`.
export async function guardHarnessSettings(
  context,
  target,
  { allowMissingDirectory = false } = {},
) {
  const { cwd } = context;
  if (target !== path.join(cwd, HARNESS_SETTINGS_FILE)) {
    fail('UNSAFE_TARGET', `${target} is not ${path.join(cwd, HARNESS_SETTINGS_FILE)}`);
  }
  const present = await assertDirectoryChain(cwd, path.dirname(target), {
    allowMissing: allowMissingDirectory,
  });
  if (present) await assertRegularOrMissing(target);
  if (await isTracked(context, HARNESS_SETTINGS_FILE)) {
    fail('SETTINGS_TRACKED', `${HARNESS_SETTINGS_FILE} is tracked`);
  }
  const result = await git(
    context,
    cwd,
    ['check-ignore', '--no-index', '-q', '--', HARNESS_SETTINGS_FILE],
    { allowed: [0, 1] },
  );
  if (result.status !== 0) fail('SETTINGS_NOT_IGNORED', `${HARNESS_SETTINGS_FILE} is not ignored`);
}

// Creates `<cwd>/.claude/` (mode 0700) after the settings guard passed. Returns false when it
// already exists as a real directory.
export async function guardedMkdirHarnessDirectory(context) {
  const target = path.join(context.cwd, HARNESS_SETTINGS_FILE);
  await guardHarnessSettings(context, target, { allowMissingDirectory: true });
  return mkdirHarnessDirectory(context.cwd);
}

// The directory step of the two harness writers above and below; only ever after the guard.
async function mkdirHarnessDirectory(cwd) {
  const directory = path.join(cwd, HARNESS_SETTINGS_DIR);
  let created = true;
  try {
    await mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      fail('WRITE_FAILED', `cannot create ${directory}: ${error?.code ?? error?.message}`);
    }
    created = false;
  }
  const info = await lstat(directory);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    fail('UNSAFE_TARGET', `${directory} is not a real directory`);
  }
  return created;
}

// Replaces the harness settings file atomically. The target passes the harness guard once; with
// `createDirectory`, that guard admits a missing `.claude/`, which is then created and verified as
// a real directory before the write, so a first write needs no second guard run. The temporary
// sibling in the same, verified directory is created exclusively without following a symlink.
// `beforeRename` behaves as for `atomicWrite`.
export async function atomicWriteHarnessSettings(
  context,
  content,
  { beforeRename, createDirectory = false } = {},
) {
  const target = path.join(context.cwd, HARNESS_SETTINGS_FILE);
  await guardHarnessSettings(context, target, { allowMissingDirectory: createDirectory });
  if (createDirectory) await mkdirHarnessDirectory(context.cwd);
  return replaceAtomically(temporarySibling(target), target, content, beforeRename);
}

// ---------------------------------------------------------------------------------------------
// Legacy runtime directories (read-only)

export const LEGACY_RUNTIME_DIRS = Object.freeze(['.firmo', '.sf-plugin']);
// Legacy worktrees are path-registered and stay in the legacy directory.
const LEGACY_EXCLUDED_TOP_LEVEL = Object.freeze(['.worktrees']);
// The legacy memory file is merged, never copied.
export const LEGACY_MEMORY_ENTRY = 'memory.json';

function entryType(info) {
  if (info.isSymbolicLink()) return 'symlink';
  if (info.isFIFO()) return 'fifo';
  if (info.isSocket()) return 'socket';
  if (info.isBlockDevice()) return 'block-device';
  if (info.isCharacterDevice()) return 'character-device';
  if (info.isDirectory()) return 'directory';
  if (info.isFile()) return 'file';
  return 'unknown';
}

// Selects the legacy source below `cwd`: `.firmo/` when it exists, otherwise `.sf-plugin/`, never
// both. Returns `{ name, path, type }` or null when neither exists.
export async function selectLegacySource(cwd) {
  for (const name of LEGACY_RUNTIME_DIRS) {
    const source = path.join(cwd, name);
    try {
      return { name, path: source, type: entryType(await lstat(source)) };
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        fail('UNSAFE_TARGET', `cannot inspect ${source}: ${error?.code ?? error?.message}`);
      }
    }
  }
  return null;
}

// Walks a legacy source directory without following any link or mutating anything. Returns the
// relative directories (pre-order) and regular files, and every non-regular entry as
// `{ path, type }` in `skipped`. The top-level `.worktrees/` subtree and the top-level
// `memory.json` are excluded. Paths use `/` and are relative to the source.
export async function walkLegacySource(source) {
  const directories = [];
  const files = [];
  const skipped = [];
  const visit = async (relative) => {
    const absolute = relative === '' ? source : path.join(source, relative);
    let names;
    try {
      names = (await readdir(absolute)).sort();
    } catch (error) {
      fail('UNSAFE_TARGET', `cannot list ${absolute}: ${error?.code ?? error?.message}`);
    }
    for (const name of names) {
      if (relative === '' && LEGACY_EXCLUDED_TOP_LEVEL.includes(name)) continue;
      if (relative === '' && name === LEGACY_MEMORY_ENTRY) continue;
      const child = relative === '' ? name : `${relative}/${name}`;
      let info;
      try {
        info = await lstat(path.join(source, child));
      } catch (error) {
        fail('UNSAFE_TARGET', `cannot inspect ${child}: ${error?.code ?? error?.message}`);
      }
      const type = entryType(info);
      if (type === 'directory') {
        directories.push(child);
        await visit(child);
      } else if (type === 'file') {
        files.push(child);
      } else {
        skipped.push({ path: child, type });
      }
    }
  };
  await visit('');
  return { directories, files, skipped };
}

// ---------------------------------------------------------------------------------------------
// Legacy runtime directories and legacy configuration files (removal)
//
// Two exact-name classes for `cleanup apply`, each admitting only its closed list of names below
// `cwd`:
//
// - `legacyRuntimeDirectory`: `<cwd>/.firmo` or `<cwd>/.sf-plugin`, a real directory under
//   `lstat`. It is removable only when `git ls-files` lists nothing below it (LEGACY_TRACKED
//   otherwise), the `runtimeMigration.directory` marker exists and its stored `source` equals the
//   target name (LEGACY_UNMIGRATED otherwise), no
//   `.git` file or directory exists anywhere in it, the target itself and its `.worktrees/`
//   included (NOT_ELIGIBLE, reason `nested-git`), and no carry-over entry stays open after the caller's decisions
//   (CARRY_OVER_OPEN). A legacy marker, written before markers stored `source` and therefore
//   without that key, names no directory: it certifies a target only through a carry-over proof
//   with zero open entries, the top-level `memory.json` included (CARRY_OVER_OPEN otherwise). A
//   `source` key with any other value certifies nothing. The marker and the carry-over comparison
//   are derived by the caller from fresh evidence and passed in; this module never reads memory or
//   configuration itself.
// - `legacyConfigFile`: `<cwd>/.effective-flow/config.json`, or the `config.json` at the top of a
//   legacy runtime directory, a regular file under `lstat` and untracked. It is removable only when
//   the configuration locator resolves at steps 0 to 2, so the file is not the live configuration
//   (NOT_ELIGIBLE, reason `live-configuration`), and the caller's decision for it is `complete` or
//   `discarded` (CARRY_OVER_OPEN).
//
// `listLegacyTree` produces the listing a removal is bound to: every entry below the target with
// its type, size, device and inode, and a SHA-256 for every regular file, without following any
// link. `removeLegacyListing` removes exactly that listing bottom-up: immediately before each
// `unlink` or `rmdir` it re-proves the symlink-free directory chain from `cwd` and compares the
// entry's `lstat` type, device, inode and (for a non-directory) size against the listing. A
// symlink is unlinked, never followed. A changed or unlisted entry stops the removal with
// LEGACY_CHANGED and a swapped chain with UNSAFE_TARGET; the error carries `removed` (how many
// entries were already removed) and `remaining` (the entry it stopped at), so the partial state
// can be reported.

export const LEGACY_CONFIG_ENTRY = 'config.json';
export const TRANSITIONAL_CONFIG_FILE = `${RUNTIME_STATE_DIR}/config.json`;
export const LEGACY_WORKTREES_ENTRY = '.worktrees';
// The configuration locator steps (config-resolve-core) at which a legacy file is not the live
// configuration.
export const NON_LIVE_LOCATOR_STEPS = Object.freeze([0, 1, 2]);
export const LEGACY_CONFIG_DECISIONS = Object.freeze(['complete', 'discarded']);
const LEGACY_HASH_CHUNK_BYTES = 64 * 1024;

// SHA-256 of a regular file opened without following a final symlink; null when it cannot be
// read as the regular file `expected` (`dev`, `ino` as bigint) names.
export async function hashRegularFile(target, expected) {
  let handle;
  try {
    handle = await open(target, fsConstants.O_RDONLY | O_NOFOLLOW | (fsConstants.O_NONBLOCK ?? 0));
    const info = await handle.stat({ bigint: true });
    if (!info.isFile()) return null;
    if (expected && (info.dev !== expected.dev || info.ino !== expected.ino)) return null;
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(LEGACY_HASH_CHUNK_BYTES);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
    return hash.digest('hex');
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

function listingEntry(relative, info) {
  return {
    path: relative,
    type: entryType(info),
    size: String(info.size),
    dev: String(info.dev),
    ino: String(info.ino),
  };
}

// The listing of one legacy target. For a directory: `{ root, entries, nestedGit }`, `entries`
// sorted by path, `nestedGit` the paths of every `.git` entry anywhere in the tree (a directory
// holding one is a checkout and is not descended further, so the listing is then `incomplete`). For a
// regular file: `{ root, entries: [] }` with the file's SHA-256 on `root`. Any other type at the
// target is UNSAFE_TARGET.
export async function listLegacyTree(target) {
  let rootInfo;
  try {
    rootInfo = await lstat(target, { bigint: true });
  } catch (error) {
    fail('UNSAFE_TARGET', `cannot inspect ${target}: ${error?.code ?? error?.message}`);
  }
  const root = listingEntry('', rootInfo);
  if (root.type === 'file') {
    const sha256 = await hashRegularFile(target, rootInfo);
    if (!sha256) fail('UNSAFE_TARGET', `${target} changed while it was read`);
    return { root: { ...root, sha256 }, entries: [], nestedGit: [], incomplete: false };
  }
  if (root.type !== 'directory') fail('UNSAFE_TARGET', `${target} is a ${root.type}`);
  const entries = [];
  const nestedGit = [];
  let incomplete = false;
  const visit = async (relative) => {
    const absolute = relative === '' ? target : path.join(target, relative);
    let names;
    try {
      names = (await readdir(absolute)).sort();
    } catch (error) {
      fail('UNSAFE_TARGET', `cannot list ${absolute}: ${error?.code ?? error?.message}`);
    }
    if (names.includes('.git')) {
      nestedGit.push(relative === '' ? '.git' : `${relative}/.git`);
      incomplete = true;
      return;
    }
    for (const name of names) {
      const child = relative === '' ? name : `${relative}/${name}`;
      let info;
      try {
        info = await lstat(path.join(target, child), { bigint: true });
      } catch (error) {
        fail('UNSAFE_TARGET', `cannot inspect ${child}: ${error?.code ?? error?.message}`);
      }
      const entry = listingEntry(child, info);
      if (entry.type === 'file') {
        const sha256 = await hashRegularFile(path.join(target, child), info);
        if (!sha256) fail('LEGACY_CHANGED', `${child} changed while it was read`);
        entry.sha256 = sha256;
      }
      entries.push(entry);
      if (entry.type === 'directory') await visit(child);
    }
  };
  await visit('');
  entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return { root, entries, nestedGit, incomplete };
}

function failure(code, details = {}) {
  return { code, ...details };
}

function requireLegacyDirectoryName(cwd, target) {
  const name = path.basename(target);
  if (path.dirname(target) !== cwd || !LEGACY_RUNTIME_DIRS.includes(name)) {
    fail('UNSAFE_TARGET', `${target} is not a legacy runtime directory of ${cwd}`);
  }
  return name;
}

// Whether `marker` is a version-1 `runtimeMigration.directory` marker written before the marker
// stored its `source`: the key is absent, not merely empty.
export function isLegacyMigrationMarker(marker) {
  return (
    marker !== null &&
    typeof marker === 'object' &&
    marker.version === 1 &&
    !Object.hasOwn(marker, 'source')
  );
}

// Every failed `legacyRuntimeDirectory` condition of `target`, as `{code, ...}` entries (empty
// when the target is removable). `marker` is the stored `runtimeMigration.directory` object or
// null; `listing` comes from `listLegacyTree`; `open` lists the carry-over entries still open after
// the caller's decisions. A name outside the closed list is UNSAFE_TARGET (thrown).
export async function checkLegacyRuntimeDirectory(context, target, { marker, listing, open }) {
  const name = requireLegacyDirectoryName(context.cwd, target);
  const failures = [];
  let info;
  try {
    info = await lstat(target);
  } catch (error) {
    fail('UNSAFE_TARGET', `cannot inspect ${target}: ${error?.code ?? error?.message}`);
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    return [failure('UNSAFE_TARGET', { reason: 'not-a-real-directory' })];
  }
  if (await isTracked(context, `${name}/`)) failures.push(failure('LEGACY_TRACKED'));
  if (
    !isLegacyMigrationMarker(marker) &&
    (marker?.version !== 1 || typeof marker.source !== 'string' || marker.source !== name)
  ) {
    failures.push(
      failure('LEGACY_UNMIGRATED', {
        markerSource: typeof marker?.source === 'string' ? marker.source : null,
      }),
    );
  }
  if (listing.nestedGit.length > 0) {
    failures.push(failure('NOT_ELIGIBLE', { reason: 'nested-git', paths: listing.nestedGit }));
  }
  if (open.length > 0) failures.push(failure('CARRY_OVER_OPEN', { open }));
  return failures;
}

function legacyConfigTargets(cwd) {
  return [
    path.join(cwd, TRANSITIONAL_CONFIG_FILE),
    ...LEGACY_RUNTIME_DIRS.map((name) => path.join(cwd, name, LEGACY_CONFIG_ENTRY)),
  ];
}

// Every failed `legacyConfigFile` condition of `target` (see above). `locatorStep` is the step the
// configuration locator resolved at (null when it could not resolve), `decision` the caller's
// decision for this file (undefined when none). A name outside the closed list is UNSAFE_TARGET.
export async function checkLegacyConfigFile(context, target, { locatorStep, decision }) {
  const { cwd } = context;
  if (!legacyConfigTargets(cwd).includes(target)) {
    fail('UNSAFE_TARGET', `${target} is not a legacy configuration file of ${cwd}`);
  }
  try {
    await assertDirectoryChain(cwd, path.dirname(target));
  } catch (error) {
    if (error instanceof RuntimeStateError) {
      return [failure('UNSAFE_TARGET', { reason: 'unsafe-chain' })];
    }
    throw error;
  }
  let info;
  try {
    info = await lstat(target);
  } catch (error) {
    fail('UNSAFE_TARGET', `cannot inspect ${target}: ${error?.code ?? error?.message}`);
  }
  if (!info.isFile()) return [failure('UNSAFE_TARGET', { reason: 'not-a-regular-file' })];
  const failures = [];
  if (await isTracked(context, relativeToRoot(cwd, target))) {
    failures.push(failure('LEGACY_TRACKED'));
  }
  if (!NON_LIVE_LOCATOR_STEPS.includes(locatorStep)) {
    failures.push(failure('NOT_ELIGIBLE', { reason: 'live-configuration', locatorStep }));
  }
  if (!LEGACY_CONFIG_DECISIONS.includes(decision)) {
    failures.push(failure('CARRY_OVER_OPEN', { reason: 'decision-required' }));
  }
  return failures;
}

function changed(message, removed, remaining) {
  const error = new RuntimeStateError('LEGACY_CHANGED', message);
  error.removed = removed;
  error.remaining = remaining;
  return error;
}

function sameListedNode(entry, info, { compareSize }) {
  return (
    entryType(info) === entry.type &&
    String(info.dev) === entry.dev &&
    String(info.ino) === entry.ino &&
    (!compareSize || String(info.size) === entry.size)
  );
}

// Removes exactly the digested `listing` of `target` (see the section header). `options.beforeEntry`
// (a test hook) runs with the relative path of each entry, `''` for the target itself, right
// before its checks. Returns `{ removed }`, the number of entries removed including the target.
export async function removeLegacyListing(context, target, listing, options = {}) {
  const { cwd } = context;
  const isFile = listing.root.type === 'file';
  if (isFile) {
    if (!legacyConfigTargets(cwd).includes(target)) {
      fail('UNSAFE_TARGET', `${target} is not a legacy configuration file of ${cwd}`);
    }
  } else {
    requireLegacyDirectoryName(cwd, target);
  }
  const ordered = [...listing.entries].sort((left, right) => {
    const depth = right.path.split('/').length - left.path.split('/').length;
    if (depth !== 0) return depth;
    return left.path < right.path ? 1 : left.path > right.path ? -1 : 0;
  });
  let removed = 0;
  const removeOne = async (entry) => {
    const absolute = entry.path === '' ? target : path.join(target, entry.path);
    await options.beforeEntry?.(entry.path);
    try {
      await assertDirectoryChain(cwd, path.dirname(absolute));
    } catch (error) {
      if (error instanceof RuntimeStateError) {
        error.removed = removed;
        error.remaining = entry.path;
      }
      throw error;
    }
    let info;
    try {
      info = await lstat(absolute, { bigint: true });
    } catch (error) {
      throw changed(
        `${absolute} cannot be inspected: ${error?.code ?? error?.message}`,
        removed,
        entry.path,
      );
    }
    if (
      !sameListedNode(entry, info, { compareSize: entry.type !== 'directory' }) ||
      (entry.type === 'file' && (await hashRegularFile(absolute, info)) !== entry.sha256)
    ) {
      throw changed(`${absolute} changed after the dry run`, removed, entry.path);
    }
    try {
      if (entry.type === 'directory') await rmdir(absolute);
      else await unlink(absolute);
    } catch (error) {
      const unlisted = error?.code === 'ENOTEMPTY' || error?.code === 'EEXIST';
      throw changed(
        unlisted
          ? `${absolute} holds an entry that was not in the dry run`
          : `cannot remove ${absolute}: ${error?.code ?? error?.message}`,
        removed,
        entry.path,
      );
    }
    removed += 1;
  };
  for (const entry of ordered) await removeOne(entry);
  await removeOne(listing.root);
  return { removed };
}
