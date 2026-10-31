// Dependency-free primitives shared by the runtime-state helper's memory core and the Claude Code
// settings core: a bounded, symlink-refusing file read with its identity and digest, the
// comparison of two such reads, and the two JSON-object helpers both parsers need. This module
// imports no other script, so the settings core can use it without reaching the state core.

import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';

// Never follows a final symlink and never blocks on a FIFO that replaced the file after `lstat`.
const READ_FLAGS =
  fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0);

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Sets an own data property without ever reaching a setter, so a `__proto__` key from parsed JSON
// stays plain data. An existing key keeps its position.
export function setOwn(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

// Reads one file without following a symlink and within `maxBytes`. `fs` provides `lstat` and
// `open` (promise API). Returns one of:
//
//   { state: 'missing' }
//   { state: 'ok', identity: { dev, ino, mtimeNs }, bytes, sha256, content }
//   { state: 'not-regular', detail }          not a regular file, or swapped while it was opened
//   { state: 'oversized', detail }            larger than `maxBytes`
//   { state: 'unreadable', stage, detail }    `stage` is `inspect` (lstat) or `read` (open/read)
//
// It never throws for a filesystem failure; the caller maps each state to its own codes.
export async function readBoundedFile(fs, target, maxBytes) {
  let info;
  try {
    info = await fs.lstat(target, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return { state: 'missing' };
    return { state: 'unreadable', stage: 'inspect', detail: error?.code ?? error?.message };
  }
  if (!info.isFile()) return { state: 'not-regular', detail: 'not a regular file' };
  if (info.size > BigInt(maxBytes)) {
    return { state: 'oversized', detail: `larger than ${maxBytes} bytes` };
  }
  let handle;
  try {
    handle = await fs.open(target, READ_FLAGS);
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.ino !== info.ino || opened.dev !== info.dev) {
      return { state: 'not-regular', detail: 'changed while it was opened' };
    }
    const content = await handle.readFile();
    if (content.length > maxBytes) {
      return { state: 'oversized', detail: `larger than ${maxBytes} bytes` };
    }
    return {
      state: 'ok',
      identity: {
        dev: String(opened.dev),
        ino: String(opened.ino),
        mtimeNs: String(opened.mtimeNs),
      },
      bytes: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
      content,
    };
  } catch (error) {
    return { state: 'unreadable', stage: 'read', detail: error?.code ?? error?.message };
  } finally {
    await handle?.close().catch(() => {});
  }
}

// Whether two successful reads saw the same file: the same identity, size and digest.
export function sameFileRead(left, right) {
  return (
    left.identity.dev === right.identity.dev &&
    left.identity.ino === right.identity.ino &&
    left.identity.mtimeNs === right.identity.mtimeNs &&
    left.bytes === right.bytes &&
    left.sha256 === right.sha256
  );
}
