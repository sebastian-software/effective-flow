import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, parse, resolve, sep } from 'node:path';

export const RECORD = 'host-profile.json';
export const RECEIPT = 'host-profile-cleanup.json';
export const CACHE_PATHS = [
  ['home', '.codex', 'cache'],
  ['home', '.codex', 'plugins', 'cache'],
  ['codex-home', 'cache'],
  ['codex-home', 'plugins', 'cache'],
];
const PROFILE_NAME = /^profile-[0-9a-f-]{36}$/;

export function stat(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

export function identity(path) {
  const value = stat(path);
  if (!value?.isDirectory() || value.uid !== process.getuid()) {
    throw new Error(`not an owned directory: ${path}`);
  }
  return { dev: value.dev, ino: value.ino };
}

function sameIdentity(path, expected) {
  const actual = identity(path);
  return actual.dev === expected?.dev && actual.ino === expected?.ino;
}

// Check every canonical ancestor again before a mutation. In particular, lstat never accepts
// a home/plugins/profile symlink as a directory, even if its target happens to be inside root.
export function directories(path) {
  let current = parse(path).root;
  for (const part of path.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    if (!stat(current)?.isDirectory()) throw new Error(`unsafe directory: ${current}`);
  }
}

export function openRoot(input) {
  const requested = resolve(input);
  // macOS has two system-owned temporary-directory aliases. Accept those exact aliases,
  // but never resolve a caller-injected symlink elsewhere in the selected root's ancestry.
  let parent = parse(requested).root;
  for (const part of dirname(requested).slice(parent.length).split(sep).filter(Boolean)) {
    parent = join(parent, part);
    if (stat(parent)?.isSymbolicLink()) {
      if (
        process.platform !== 'darwin' ||
        !['/tmp', '/var'].includes(parent) ||
        realpathSync(parent) !== `/private${parent}`
      )
        throw new Error(`unsafe directory: ${parent}`);
      parent = realpathSync(parent);
    }
    if (!stat(parent)?.isDirectory()) throw new Error(`unsafe directory: ${parent}`);
  }
  if (stat(requested)?.isSymbolicLink()) throw new Error('profiles root must not be a symlink');
  const root = join(parent, basename(requested));
  directories(parent);
  try {
    mkdirSync(root, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return { path: root, identity: identity(root) };
}

export function guard(root, profile, record) {
  directories(profile);
  if (
    dirname(profile) !== root.path ||
    !PROFILE_NAME.test(basename(profile)) ||
    !sameIdentity(root.path, root.identity) ||
    !sameIdentity(root.path, record.root) ||
    !sameIdentity(profile, record.directory)
  )
    throw new Error('profile ownership changed');
}

export function readJson(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const value = fstatSync(fd);
    if (
      !value.isFile() ||
      value.uid !== process.getuid() ||
      value.nlink !== 1 ||
      value.size > 16384
    ) {
      throw new Error(`unsafe metadata: ${path}`);
    }
    try {
      return JSON.parse(readFileSync(fd, 'utf8'));
    } catch {
      throw new Error('invalid host profile metadata');
    }
  } finally {
    closeSync(fd);
  }
}

export function writeJson(path, value) {
  directories(dirname(path));
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(value)}\n`, { flag: 'wx', mode: 0o600 });
    renameSync(temp, path);
  } finally {
    try {
      unlinkSync(temp);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

export function readRecord(root, profile) {
  directories(profile);
  if (dirname(profile) !== root.path || !sameIdentity(root.path, root.identity)) {
    throw new Error('profile root changed');
  }
  const record = readJson(join(profile, RECORD));
  if (
    record.schema !== 1 ||
    record.kind !== 'effective-flow-host-profile' ||
    record.id !== basename(profile).slice(8) ||
    !Number.isSafeInteger(record.ownerPid) ||
    record.ownerPid <= 0 ||
    !['prepared', 'armed'].includes(record.phase) ||
    (record.phase === 'prepared'
      ? record.childPgid !== null
      : !Number.isSafeInteger(record.childPgid) || record.childPgid <= 0)
  ) {
    throw new Error('unrecognized host profile record');
  }
  guard(root, profile, record);
  return record;
}

export function createProfile(root, authFile) {
  directories(root.path);
  if (!sameIdentity(root.path, root.identity)) throw new Error('profiles root changed');
  const id = randomUUID();
  const profile = join(root.path, `profile-${id}`);
  mkdirSync(profile, { mode: 0o700 });
  for (const parts of [['home'], ['home', '.codex'], ['codex-home']]) {
    mkdirSync(join(profile, ...parts), { mode: 0o700 });
  }
  const record = {
    schema: 1,
    kind: 'effective-flow-host-profile',
    id,
    ownerPid: process.pid,
    root: root.identity,
    directory: identity(profile),
    phase: 'prepared',
    childPgid: null,
  };
  writeJson(join(profile, RECORD), record);
  if (authFile !== undefined) {
    // Explicit reference only: do not read, copy, or discover any credential/configuration.
    for (const home of [join(profile, 'home', '.codex'), join(profile, 'codex-home')]) {
      symlinkSync(resolve(authFile), join(home, 'auth.json'));
    }
  }
  return { path: profile, record };
}
