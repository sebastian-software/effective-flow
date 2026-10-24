import { randomUUID } from 'node:crypto';
import { readdirSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  CACHE_PATHS,
  RECEIPT,
  guard,
  readJson,
  readRecord,
  stat,
  writeJson,
} from './host-profile-storage.mjs';

export function processState(pid) {
  try {
    process.kill(pid, 0);
    return 'live';
  } catch (error) {
    return error.code === 'ESRCH' ? 'gone' : 'unknown';
  }
}

const CLAIM = /^host-profile-cleaner-[0-9]+-[0-9a-f-]{36}\.json$/;

function claims(profile) {
  return readdirSync(profile)
    .filter((name) => CLAIM.test(name))
    .map((name) => {
      let claim;
      try {
        claim = readJson(join(profile, name));
      } catch (error) {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      }
      if (
        !Number.isSafeInteger(claim.pid) ||
        claim.pid <= 0 ||
        !(claim.ticket === null || (Number.isSafeInteger(claim.ticket) && claim.ticket > 0))
      ) {
        throw new Error('unrecognized cleanup claim');
      }
      return { ...claim, name };
    })
    .filter(Boolean);
}

// A small bakery lock avoids the empty-lock crash gap and stale-lock unlink race: each
// contender owns one unique, atomically published claim. Dead contenders cannot block later
// recovery. A live/reused/unknown PID remains conservative; no age decides ownership.
async function claimCleanup(root, profile, record) {
  const name = `host-profile-cleaner-${process.pid}-${randomUUID()}.json`;
  const path = join(profile, name);
  guard(root, profile, record);
  writeJson(path, { pid: process.pid, ticket: null });
  try {
    const ticket = Math.max(0, ...claims(profile).map((claim) => claim.ticket ?? 0)) + 1;
    writeJson(path, { pid: process.pid, ticket });
    const deadline = Date.now() + 2000;
    while (true) {
      guard(root, profile, record);
      const ahead = claims(profile).some(
        (claim) =>
          claim.name !== name &&
          processState(claim.pid) !== 'gone' &&
          (claim.ticket === null ||
            claim.ticket < ticket ||
            (claim.ticket === ticket && claim.name < name)),
      );
      if (!ahead)
        return () => {
          guard(root, profile, record);
          unlinkSync(path);
        };
      if (Date.now() >= deadline) break;
      await delay(25);
    }
  } catch (error) {
    guard(root, profile, record);
    unlinkSync(path);
    throw error;
  }
  guard(root, profile, record);
  unlinkSync(path);
  return undefined;
}

function cacheSafe(root, profile, record, parts) {
  guard(root, profile, record);
  let path = profile;
  for (const part of parts) {
    path = join(path, part);
    const value = stat(path);
    if (value === undefined) return 'absent';
    if (!value.isDirectory() || value.uid !== process.getuid()) return 'unsafe';
  }
  return 'safe';
}

export async function cleanupProfile(root, profile, { own = false } = {}) {
  const record = readRecord(root, profile);
  if ((!own || record.ownerPid !== process.pid) && processState(record.ownerPid) !== 'gone')
    return false;
  if (record.childPgid !== null && processState(-record.childPgid) !== 'gone') return false;
  const release = await claimCleanup(root, profile, record);
  if (release === undefined) return false;
  try {
    // Recheck after obtaining the claim: a previous cleaner may have been killed mid-delete.
    guard(root, profile, record);
    if (record.childPgid !== null && processState(-record.childPgid) !== 'gone') return false;
    const caches = [];
    for (const parts of CACHE_PATHS) {
      const safety = cacheSafe(root, profile, record, parts);
      if (safety === 'safe') rmSync(join(profile, ...parts), { recursive: true, force: true });
      caches.push({
        path: parts.join('/'),
        status: safety === 'unsafe' ? 'retained-unsafe' : 'removed',
      });
    }
    guard(root, profile, record);
    writeJson(join(profile, RECEIPT), {
      schema: 1,
      profileId: record.id,
      cleanedAt: new Date().toISOString(),
      caches,
    });
    return caches.every((cache) => cache.status === 'removed');
  } finally {
    release();
  }
}

export async function recoverProfiles(root, warn = () => {}) {
  for (const entry of readdirSync(root.path, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^profile-[0-9a-f-]{36}$/.test(entry.name)) continue;
    const profile = join(root.path, entry.name);
    try {
      await cleanupProfile(root, profile);
    } catch (error) {
      warn(`retained ${entry.name}: ${error.message}`);
    }
  }
}
