// The hidden-mode processed-thread ledger of the `remote-tracker` helper.
//
// In standard mode `iterate` recognizes a review thread it has already answered by the
// `<!-- effective-flow-iterate -->` marker its reply opens with. Hidden mode (`visibility: hidden`)
// writes no marker, so that record moves here: one local JSON file below
// `<cwd>/.effective-flow/merge-gate/`, keyed by repository, pull-request number, and thread or
// comment ID. The file is runtime state, never tracked and never published.
//
// The module is split the same way the rest of the helper is. Key derivation, parsing, merging and
// lookup are pure functions over plain values; only `readThreadLedger`, `writeThreadLedger` and the
// two `*File` operations touch the file system. It imports from `remote-tracker-shared-core.mjs`
// only, and `remote-tracker-core.mjs` imports it, so the layering stays acyclic.
//
// Two failure directions are deliberate. A **missing** ledger is not an error: a first hidden-mode
// run has none yet, and a lost one is reported by the lookup as a degradation, never guessed away.
// A **corrupt** ledger is never overwritten: the lookup reports it and treats it as empty, and a
// record refuses with `LEDGER_CORRUPT`, so the evidence stays on disk for the user to inspect.
//
// Every record runs under an exclusive lock file beside the ledger, so two runs recording on the
// same checkout — for the same pull request or different ones — never lose each other's additions
// in the read-merge-rename. A lock that is already held fails the record with `LEDGER_LOCKED`; it is
// never broken, not by age and not by guessing that its owner died.

import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  fail,
  normalizeHost,
  requireNumber,
  requireObject,
  requireString,
} from './remote-tracker-shared-core.mjs';

export const THREAD_LEDGER_VERSION = 1;
export const THREAD_LEDGER_FILE = 'thread-ledger.json';
export const THREAD_LEDGER_LOCK_FILE = 'thread-ledger.lock';
export const THREAD_LEDGER_KINDS = Object.freeze(['thread', 'comment']);

// A ledger larger than this is not one this helper wrote; reading it whole would be the only
// unbounded read in the helper, so it is reported as corrupt instead.
const MAX_LEDGER_BYTES = 8 * 1024 * 1024;
const MAX_IDENTIFIER_LENGTH = 256;

// --- Pure functions ------------------------------------------------------------------------------

function ledgerSegment(value, label) {
  const text = requireString(value, label).trim();
  if (text.length > MAX_IDENTIFIER_LENGTH || /[\s#/\p{Cc}]/u.test(text)) {
    fail('INVALID_PAYLOAD', `${label} is not a usable ledger key segment`, { field: label });
  }
  return text;
}

// Accepts the `repository-resolve` result (`host`, `owner`, `repository`) or an equivalent object.
// Host, owner and name are compared case-insensitively by every forge this helper serves, so the
// key folds them to lower case; two spellings of one repository must never yield two records.
export function ledgerRepository(value) {
  requireObject(value, 'repository');
  const host = ledgerSegment(normalizeHost(value.host), 'repository.host').toLowerCase();
  const owner = ledgerSegment(value.owner, 'repository.owner').toLowerCase();
  const name = ledgerSegment(value.repository ?? value.name, 'repository.repository')
    .toLowerCase()
    .replace(/\.git$/, '');
  return `${host}/${owner}/${name}`;
}

// Thread and comment IDs are opaque and case-sensitive (GitHub node IDs), so they are kept verbatim.
// A numeric ID (a Forgejo comment ID) is accepted as a number and keyed as its decimal string.
function ledgerIdentifier(value, label) {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  return ledgerSegment(text, label);
}

function ledgerKind(value) {
  if (!THREAD_LEDGER_KINDS.includes(value)) {
    fail('INVALID_PAYLOAD', `kind must be one of ${THREAD_LEDGER_KINDS.join(', ')}`, {
      field: 'kind',
      value,
    });
  }
  return value;
}

// The one key shape of the ledger: `<host>/<owner>/<repository>#<pr>/<kind>/<id>`. No segment may
// contain `#`, `/` or whitespace, so a key never parses two ways.
export function threadLedgerKey({ repository, pr, kind, id }) {
  const scope = typeof repository === 'string' ? repository : ledgerRepository(repository);
  return `${scope}#${requireNumber(pr, 'pr')}/${ledgerKind(kind)}/${ledgerIdentifier(id, `${kind} id`)}`;
}

export function emptyThreadLedger() {
  return { version: THREAD_LEDGER_VERSION, entries: {} };
}

// Returns `{ state: 'ok', ledger }` or `{ state: 'corrupt', reason }`; it never throws on content,
// because a damaged file is a reportable state rather than a helper failure.
export function parseThreadLedger(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { state: 'corrupt', reason: 'not valid JSON' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { state: 'corrupt', reason: 'not a JSON object' };
  }
  if (parsed.version !== THREAD_LEDGER_VERSION) {
    return { state: 'corrupt', reason: `unsupported version ${JSON.stringify(parsed.version)}` };
  }
  const { entries } = parsed;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    return { state: 'corrupt', reason: 'entries is not an object' };
  }
  for (const [key, entry] of Object.entries(entries)) {
    if (!/^[^\s#/]+\/[^\s#/]+\/[^\s#/]+#[1-9]\d*\/(?:thread|comment)\/[^\s#/]+$/u.test(key)) {
      return { state: 'corrupt', reason: 'an entry key has an unexpected shape' };
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { state: 'corrupt', reason: 'an entry is not an object' };
    }
  }
  return { state: 'ok', ledger: { version: THREAD_LEDGER_VERSION, entries: { ...entries } } };
}

function recordTargets(input) {
  const repository = ledgerRepository(input.repository);
  const pr = requireNumber(input.pr, 'pr');
  const threads = input.threads ?? [];
  const comments = input.comments ?? [];
  if (!Array.isArray(threads) || !Array.isArray(comments)) {
    fail('INVALID_PAYLOAD', 'threads and comments must be arrays of IDs', {
      field: Array.isArray(threads) ? 'comments' : 'threads',
    });
  }
  if (threads.length + comments.length === 0) {
    fail('INVALID_PAYLOAD', 'a record needs at least one thread or comment ID', {
      field: 'threads',
    });
  }
  return [
    ...threads.map((id) => threadLedgerKey({ repository, pr, kind: 'thread', id })),
    ...comments.map((id) => threadLedgerKey({ repository, pr, kind: 'comment', id })),
  ];
}

// Adds the given IDs without mutating `ledger`. An entry already present keeps its first
// `recordedAt`, so recording twice is idempotent and the file keeps the moment of first handling.
export function recordThreadLedgerEntries(ledger, input, recordedAt) {
  requireObject(input, 'input');
  const keys = recordTargets(input);
  const entries = { ...ledger.entries };
  const added = [];
  const present = [];
  for (const key of new Set(keys)) {
    if (Object.hasOwn(entries, key)) {
      present.push(key);
      continue;
    }
    entries[key] = { recordedAt };
    added.push(key);
  }
  return { ledger: { version: THREAD_LEDGER_VERSION, entries }, added, present };
}

function threadCommentIds(thread, label) {
  const comments = thread.comments ?? [];
  if (!Array.isArray(comments)) {
    fail('INVALID_PAYLOAD', `${label}.comments must be an array`, { field: `${label}.comments` });
  }
  return comments.map((comment, index) => {
    requireObject(comment, `${label}.comments[${index}]`);
    return comment;
  });
}

function authorLogin(comment) {
  const author = comment.author;
  const login = typeof author === 'string' ? author : author?.login;
  return typeof login === 'string' && login.trim() !== '' ? login.trim().toLowerCase() : undefined;
}

// The ledger keys a comment under whichever ID the caller recorded: GitHub's GraphQL node `id` or
// its numeric REST `databaseId` (which a posted reply's result states), or a Forgejo comment ID. A
// normalized thread comment carries both GitHub forms, so the lookup tries each one it has.
function commentLedgerIds(comment) {
  return [comment.id, comment.databaseId].filter((id) => id !== undefined && id !== null);
}

// Classifies the threads of one `review-threads-read` result against a ledger.
//
// - `resolved`: skipped whatever the ledger says, exactly as in standard mode. This is what keeps a
//   lost ledger from reopening work anybody already closed.
// - `recorded`: skipped because the thread, or one of its comments, is in the ledger.
// - `pending`: to be classified.
//
// With `viewer` (the authenticated login) the lookup also names every pending thread that already
// holds a comment by that login. Such a thread was probably answered by an earlier run whose record
// is gone; it is **not** skipped — authorship alone cannot say the reply finished the thread — but
// it marks the result `degraded`, so the loss is reported rather than silently answered twice.
export function lookupThreadLedger(ledger, input) {
  requireObject(input, 'input');
  const repository = ledgerRepository(input.repository);
  const pr = requireNumber(input.pr, 'pr');
  if (!Array.isArray(input.threads)) {
    fail('INVALID_PAYLOAD', 'threads must be an array', { field: 'threads' });
  }
  const viewer =
    input.viewer === undefined || input.viewer === null
      ? undefined
      : requireString(input.viewer, 'viewer').trim().toLowerCase();
  const entries = ledger?.entries ?? {};
  const results = input.threads.map((thread, index) => {
    const label = `threads[${index}]`;
    requireObject(thread, label);
    const id = ledgerIdentifier(thread.id, `${label}.id`);
    const comments = threadCommentIds(thread, label);
    const recorded =
      Object.hasOwn(entries, threadLedgerKey({ repository, pr, kind: 'thread', id })) ||
      comments.some((comment) =>
        commentLedgerIds(comment).some((commentId) =>
          Object.hasOwn(
            entries,
            threadLedgerKey({ repository, pr, kind: 'comment', id: commentId }),
          ),
        ),
      );
    const isResolved = thread.isResolved === true;
    const status = isResolved ? 'resolved' : recorded ? 'recorded' : 'pending';
    const viewerReplied =
      viewer !== undefined && comments.some((comment) => authorLogin(comment) === viewer);
    return {
      id,
      status,
      skip: status !== 'pending',
      ...(status === 'pending' && viewerReplied ? { unrecordedViewerReply: true } : {}),
    };
  });
  return {
    skipped: results.filter((result) => result.skip).map((result) => result.id),
    pending: results.filter((result) => !result.skip).map((result) => result.id),
    unrecordedViewerReplies: results
      .filter((result) => result.unrecordedViewerReply)
      .map((result) => result.id),
    threads: results,
  };
}

// --- File system ---------------------------------------------------------------------------------
//
// Residual risk, the same one `delegation-envelope-core.mjs` states: the checks below narrow, but
// cannot close, the window in which another process with write access to the checkout swaps
// `.effective-flow/` or `merge-gate/` for a symlink. Concurrent records are serialized by the
// ledger lock (see `withLedgerLock`), so they cannot lose each other's additions; a direct
// `writeThreadLedger` call bypasses that lock and is for callers that already hold it. The helper
// fails closed whenever it can observe a runtime directory that is not what it created.

const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const WRITE_FLAGS = fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | O_NOFOLLOW;
const READ_FLAGS = fsConstants.O_RDONLY | O_NOFOLLOW | (fsConstants.O_NONBLOCK ?? 0);

async function resolveRoot(cwd) {
  const value = requireString(cwd, 'cwd');
  if (!path.isAbsolute(value)) {
    fail('INVALID_PAYLOAD', 'cwd must be the absolute runtime-state root', { field: 'cwd' });
  }
  try {
    const canonical = await realpath(value);
    if ((await stat(canonical)).isDirectory()) return canonical;
  } catch {
    // Reported below with the same shape as every other unusable working directory.
  }
  fail('INVALID_PAYLOAD', 'working directory is not an existing directory', { cwd: value });
}

// One runtime directory level: absent (`null`, or created non-recursively when `create` is set) or
// a real directory. A symlink or any other file type is an unsafe target.
async function directoryLevel(directory, create) {
  let info;
  try {
    info = await lstat(directory);
  } catch (error) {
    if (error?.code !== 'ENOENT') fail('UNSAFE_TARGET', `cannot inspect ${directory}`);
    if (!create) return null;
    try {
      await mkdir(directory, { mode: 0o700 });
    } catch (mkdirError) {
      if (mkdirError?.code !== 'EEXIST') fail('UNSAFE_TARGET', `cannot create ${directory}`);
    }
    try {
      info = await lstat(directory);
    } catch {
      fail('UNSAFE_TARGET', `cannot inspect ${directory} after creating it`);
    }
  }
  if (info.isSymbolicLink()) fail('UNSAFE_TARGET', `${directory} is a symlink`);
  if (!info.isDirectory()) fail('UNSAFE_TARGET', `${directory} is not a directory`);
  return directory;
}

async function ledgerDirectory(root, create) {
  const stateDir = await directoryLevel(path.join(root, '.effective-flow'), create);
  if (stateDir === null) return null;
  return directoryLevel(path.join(stateDir, 'merge-gate'), create);
}

// Returns `{ state: 'missing' | 'ok' | 'corrupt', path, ledger?, reason? }`. Reading creates
// nothing: a lookup in a checkout without runtime state leaves it without runtime state.
export async function readThreadLedger(cwd) {
  const root = await resolveRoot(cwd);
  const directory = await ledgerDirectory(root, false);
  const target = path.join(root, '.effective-flow', 'merge-gate', THREAD_LEDGER_FILE);
  if (directory === null) return { state: 'missing', path: target };
  let handle;
  try {
    handle = await open(target, READ_FLAGS);
  } catch (error) {
    if (error?.code === 'ENOENT') return { state: 'missing', path: target };
    if (error?.code === 'ELOOP') fail('UNSAFE_TARGET', `${target} is a symlink`);
    fail('UNSAFE_TARGET', `${target} cannot be opened: ${error?.code ?? error?.message}`);
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) fail('UNSAFE_TARGET', `${target} is not a regular file`);
    if (info.size > MAX_LEDGER_BYTES) {
      return {
        state: 'corrupt',
        path: target,
        reason: 'larger than any ledger this helper writes',
      };
    }
    const parsed = parseThreadLedger(await handle.readFile('utf8'));
    return { ...parsed, path: target };
  } finally {
    await handle.close();
  }
}

// Replaces the ledger atomically: a fresh temporary file beside the target, created exclusively
// and never through a symlink, flushed, then renamed over the target. A reader therefore sees the
// old ledger or the new one, never a torn write. `deps.write` is a test seam for the write step.
export async function writeThreadLedger(cwd, ledger, deps = {}) {
  const root = await resolveRoot(cwd);
  const directory = await ledgerDirectory(root, true);
  const target = path.join(directory, THREAD_LEDGER_FILE);
  const existing = await lstat(target).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    fail('UNSAFE_TARGET', `cannot inspect ${target}`);
  });
  if (existing && !existing.isFile()) fail('UNSAFE_TARGET', `${target} is not a regular file`);
  const body = `${JSON.stringify(ledger, null, 2)}\n`;
  const temporary = path.join(
    directory,
    `.${THREAD_LEDGER_FILE}.tmp-${(deps.randomBytes ?? randomBytes)(12).toString('hex')}`,
  );
  let handle;
  try {
    handle = await open(temporary, WRITE_FLAGS, 0o600);
  } catch (error) {
    fail('UNSAFE_TARGET', `cannot create ${temporary}: ${error?.code ?? error?.message}`);
  }
  try {
    await (deps.write ?? ((file, text) => file.writeFile(text, 'utf8')))(handle, body);
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    fail('WRITE_FAILED', `cannot write ${temporary}`, { cause: error?.code ?? error?.message });
  }
  await handle.close();
  try {
    // Re-check both levels right before the rename: a level swapped for a symlink, or removed,
    // while writing fails the record instead of landing the ledger somewhere else.
    const current = await ledgerDirectory(root, false);
    const resolved = await realpath(directory).catch(() => null);
    if (current !== directory || resolved !== directory) {
      fail('UNSAFE_TARGET', `${directory} no longer resolves to itself`);
    }
    try {
      await rename(temporary, target);
    } catch (error) {
      fail('WRITE_FAILED', `cannot replace ${target}`, { cause: error?.code ?? error?.message });
    }
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  return target;
}

function currentTimestamp(clock) {
  const read =
    typeof clock === 'function'
      ? clock
      : clock && typeof clock.now === 'function'
        ? () => clock.now()
        : () => Date.now();
  const value = read();
  if (!Number.isFinite(value)) fail('INVALID_PAYLOAD', 'thread-ledger clock returned no time');
  return new Date(value).toISOString();
}

// `thread-ledger-lookup`. Input: `cwd`, `repository`, `pr`, `threads` (the normalized
// `review-threads-read` result), optional `viewer`. A corrupt ledger is treated as empty and
// reported; nothing is written either way.
export async function lookupThreadLedgerFile(input) {
  requireObject(input, 'input');
  const read = await readThreadLedger(input.cwd);
  const lookup = lookupThreadLedger(read.state === 'ok' ? read.ledger : null, input);
  const ledger = {
    state: read.state,
    path: read.path,
    ...(read.reason === undefined ? {} : { reason: read.reason }),
  };
  const degraded = read.state === 'corrupt' || lookup.unrecordedViewerReplies.length > 0;
  return { ledger, degraded, ...lookup };
}

// The record lock: one file created exclusively (and never through a symlink) beside the ledger,
// holding its owner's PID and a random nonce. It is released only by the holder that still finds
// its own nonce in it. A lock that already exists — a concurrent record, or one a crashed run left
// behind — fails the record with `LEDGER_LOCKED` and is left in place: telling a live holder from a
// dead one would mean guessing, and a guess that breaks a live lock loses exactly the record the
// lock exists to protect. The user removes a stale lock once no run is active.
async function acquireLedgerLock(directory, deps) {
  const target = path.join(directory, THREAD_LEDGER_LOCK_FILE);
  const nonce = (deps.randomBytes ?? randomBytes)(16).toString('hex');
  let handle;
  try {
    handle = await open(target, WRITE_FLAGS, 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      fail('LEDGER_LOCKED', 'another record holds the processed-thread ledger lock', {
        path: target,
      });
    }
    fail('UNSAFE_TARGET', `cannot create ${target}: ${error?.code ?? error?.message}`);
  }
  try {
    await handle.writeFile(`${JSON.stringify({ ownerPid: process.pid, nonce })}\n`, 'utf8');
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(target).catch(() => {});
    fail('WRITE_FAILED', `cannot write ${target}`, { cause: error?.code ?? error?.message });
  }
  await handle.close();
  return { target, nonce };
}

async function releaseLedgerLock({ target, nonce }) {
  let owner;
  try {
    const handle = await open(target, READ_FLAGS);
    try {
      owner = JSON.parse(await handle.readFile('utf8'));
    } finally {
      await handle.close();
    }
  } catch {
    owner = undefined;
  }
  if (owner?.nonce !== nonce) {
    fail('LEDGER_LOCKED', 'the processed-thread ledger lock changed hands while recording', {
      path: target,
    });
  }
  try {
    await unlink(target);
  } catch (error) {
    fail('WRITE_FAILED', `cannot release ${target}`, { cause: error?.code ?? error?.message });
  }
}

async function withLedgerLock(directory, deps, action) {
  const lock = await acquireLedgerLock(directory, deps);
  let result;
  try {
    result = await action();
  } catch (error) {
    // The action's failure is the one to report; a release that fails too must not mask it.
    await releaseLedgerLock(lock).catch(() => {});
    throw error;
  }
  await releaseLedgerLock(lock);
  return result;
}

// `thread-ledger-record`. Input: `cwd`, `repository`, `pr`, and `threads` and/or `comments` as ID
// arrays. Refuses on a corrupt ledger rather than replacing the evidence, and on a held lock
// (`LEDGER_LOCKED`) rather than racing its holder. The read, merge and write all happen under the
// lock, so a concurrent record either completes before this one reads or fails.
export async function recordThreadLedgerFile(input, options = {}) {
  requireObject(input, 'input');
  // Validate the IDs before creating anything: a malformed record leaves the checkout untouched.
  recordThreadLedgerEntries(emptyThreadLedger(), input, 'validation');
  const root = await resolveRoot(input.cwd);
  const directory = await ledgerDirectory(root, true);
  return withLedgerLock(directory, options, async () => {
    const read = await readThreadLedger(root);
    if (read.state === 'corrupt') {
      fail('LEDGER_CORRUPT', 'the processed-thread ledger is corrupt and is left untouched', {
        path: read.path,
        reason: read.reason,
      });
    }
    const recordedAt = currentTimestamp(options.clock);
    const base = read.state === 'ok' ? read.ledger : emptyThreadLedger();
    const { ledger, added, present } = recordThreadLedgerEntries(base, input, recordedAt);
    // Recording only IDs that are already present changes nothing, so it writes nothing either.
    const written = added.length > 0;
    const target = written ? await writeThreadLedger(root, ledger, options) : read.path;
    return { path: target, written, added, present };
  });
}
