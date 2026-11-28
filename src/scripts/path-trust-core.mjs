// Path trust checks shared by the runtime-state helper cores: whether a principal other than the
// running user and root can write a directory a helper relies on, and which directories resolving a
// path consults. `effective-flow-state-harness-core.mjs` applies them to the install path an allow
// rule names, `effective-flow-state-worktree-core.mjs` to a worktree base outside
// `.effective-flow/` (`worktree path-prepare`). This leaf module imports only Node.js built-ins, so
// both cores import it without an import cycle.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_LINK_HOPS = 40;

// Every directory consulted while resolving `target`, link targets included, and the resolved
// target itself. A link's own directory is consulted to read the link, so whoever can write it can
// re-point the link: both the symlinked and the resolved chain are therefore covered. A relative
// link resolves against the link's directory; more than MAX_LINK_HOPS links is an error. `fs`
// supplies `lstat` and `readlink`.
export async function resolutionChain(fs, target) {
  const consulted = new Set(['/']);
  let pending = target.split('/').filter(Boolean);
  let current = '/';
  let hops = 0;
  while (pending.length > 0) {
    const name = pending.shift();
    if (name === '.') continue;
    if (name === '..') {
      current = path.dirname(current);
      continue;
    }
    consulted.add(current);
    const next = path.join(current, name);
    const info = await fs.lstat(next);
    if (info.isSymbolicLink()) {
      hops += 1;
      if (hops > MAX_LINK_HOPS) throw new Error(`too many links resolving ${target}`);
      const link = await fs.readlink(next);
      if (path.isAbsolute(link)) current = '/';
      pending = [...link.split('/').filter(Boolean), ...pending];
      continue;
    }
    current = next;
  }
  return { directories: [...consulted], resolved: current };
}

function parseAccounts(text) {
  return text
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.split(':'));
}

// Whether `gid` is the private group of the user `uid`, given the parsed `/etc/passwd` and
// `/etc/group` records: the user's primary group, with no other user having it as primary group
// and no other user listed as a member.
export function isPrivateGroupIn(users, groups, gid, uid) {
  const owner = users.find((fields) => Number(fields[2]) === uid);
  if (!owner || Number(owner[3]) !== gid) return false;
  if (users.some((fields) => Number(fields[3]) === gid && Number(fields[2]) !== uid)) {
    return false;
  }
  const group = groups.find((fields) => Number(fields[2]) === gid);
  const members = (group?.[3] ?? '').split(',').filter((name) => name !== '');
  return members.every((name) => name === owner[0]);
}

// The default account lookup over `/etc/passwd` and `/etc/group`; `read` (a `readFile`-shaped
// function) is injectable. Unreadable files make every group count as shared, so a group-writable
// directory is refused (fail closed).
export function systemAccounts({ read = readFile } = {}) {
  let cache;
  const load = async () => {
    cache ??= Promise.all([
      read('/etc/passwd', 'utf8').then(parseAccounts),
      read('/etc/group', 'utf8').then(parseAccounts),
    ]).catch(() => null);
    return cache;
  };
  return {
    async isPrivateGroup(gid, uid) {
      const loaded = await load();
      return loaded ? isPrivateGroupIn(loaded[0], loaded[1], gid, uid) : false;
    },
  };
}

// Whether a principal other than the owner and root can write the node. World-writable is accepted
// only for a sticky directory owned by root (as `/tmp`); group-writable only for the owner's
// private group.
export async function foreignWriter(info, accounts) {
  const mode = Number(info.mode);
  if (mode & 0o002) {
    if (info.isDirectory() && mode & 0o1000 && Number(info.uid) === 0) return null;
    return 'world-writable';
  }
  if (mode & 0o020 && !(await accounts.isPrivateGroup(Number(info.gid), Number(info.uid)))) {
    return 'group-writable';
  }
  return null;
}

// `foreignWriter` plus the owner itself: a node owned by neither `uid` nor root is writable by that
// other owner. `uid` null (a platform without `process.getuid`) skips the owner check only.
export async function untrustedNode(info, accounts, uid) {
  if (uid !== null && Number(info.uid) !== uid && Number(info.uid) !== 0) return 'foreign-owner';
  return foreignWriter(info, accounts);
}
