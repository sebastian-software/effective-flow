// Session-title runtime helper - deterministic core.
//
// The pair mirrors `remote-tracker.mjs` / `remote-tracker-core.mjs`: this module owns every
// decision, and `session-title.mjs` owns only process spawning, standard input and the exit code.
// The whole contract is therefore reachable from a unit test without spawning anything.
//
// Two operations, split along the Codex sandbox boundary:
//
// - `request` runs inside the sandbox, where a nested `codex app-server` cannot open its state
//   runtime under `~/.codex`. It performs no RPC at all; it only records what should be renamed,
//   into `<cwd>/.effective-flow/session-title.json`.
// - `apply` runs from a `Stop` hook, which Codex spawns outside that sandbox. It performs the
//   rename, and its standard input is the hook payload Codex supplies - not workspace data.
//
// That split is also the reason for the guards below. The request file sits in the workspace, so
// anything running there can write it, and `apply` feeds its contents into a command the sandbox
// was meant to constrain. `apply` therefore refuses rather than trusts: the thread identity comes
// from the hook payload alone and the file only corroborates it, the request expires, it is
// single-use, and a title that breaks the contract is rejected instead of reshaped.
//
// `request` additionally reports whether the applying half is live, because the run stays silent
// only on that signal and otherwise emits its suggestion line. See `probeHookLiveness` for what
// that signal can and cannot establish.

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
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import process from 'node:process';

// Reused from the remote-tracker vocabulary where it fits, plus the two codes this helper needs
// and that one does not have: a Codex thread identity that never arrived, and a sandbox that
// refused the app-server rather than a command that failed inside it.
export const ERROR_CODES = Object.freeze([
  'INVALID_PAYLOAD',
  'NO_THREAD_ID',
  'SANDBOX_DENIED',
  'CLI_MISSING',
  'COMMAND_FAILED',
]);

// An `apply` run that renames nothing is the common case, not a fault: no request was pending, the
// pending one belongs to a different thread sharing the checkout, or it sat unconsumed until it
// expired. All three are predicted by the design, so they report a completed run with `applied:
// false` and a stable reason rather than a nonzero exit that a `Stop` hook would surface as a
// broken hook. A malformed request, a non-regular file at the request path and a failed RPC stay
// errors, because those a user has to see and fix.
// `unusable-request` covers the fourth predicted case, and it is predicted for the same reason as
// the other three: a symlink, a directory, or an oversized document at the request path is not
// removed by anything, so treating it as an error would leave the user with a `Stop` hook that
// fails on every turn for good. The writing side still reports it as an error, because that is
// where a workflow is listening and can tell the user what to remove.
export const SKIP_REASONS = Object.freeze([
  'no-request',
  'thread-mismatch',
  'expired-request',
  'unusable-request',
]);

// What a receipt can say about the hook run that wrote it.
//
// - `started`   written on entry; survives only a hook that never reached a verdict.
// - `applied`   the rename was acknowledged.
// - `skipped`   the hook ran and no request was pending at all. It proves the hook fires and says
//               nothing about the rename path, so it preserves an earlier verdict.
// - `unapplied` the hook ran, something of ours was pending, and it was not renamed.
// - `failed`    the run itself failed on something that indicts the installation.
//
// The split between `skipped` and `unapplied` is the whole point: an expired or unusable request
// is evidence **against** the path, and pooling it with "nothing to do" let a run that requested a
// title, watched it expire, and then found a `skipped` receipt conclude the path was live - and so
// stay silent, forever, while nothing was ever renamed.
export const HOOK_OUTCOMES = Object.freeze([
  'started',
  'applied',
  'skipped',
  'unapplied',
  'failed',
]);

// A skip that means "this request was not applied" rather than "there was nothing of ours".
//
// `thread-mismatch` belongs here despite reading like the benign two-runs-one-checkout case,
// because that reading assumes the plan's A1' - that the hook payload's `session_id` is the same
// string as the `CODEX_THREAD_ID` the request recorded - and A1' is explicitly never executed. If
// it is false, every request mismatches forever: the first run suggests a title and records a
// verdict, and if that verdict were neutral every later run would read it as liveness and go
// silent, renaming nothing and saying nothing. Treating it as a verdict costs the genuine
// shared-checkout case one redundant suggestion line for the thread whose request another thread's
// hook consumed - its own next request still applies - and converts a permanent silent failure
// into a visible one.
const PATH_VERDICT_SKIPS = new Set(['thread-mismatch', 'expired-request', 'unusable-request']);

// The error codes that indict the installation rather than the request. `INVALID_PAYLOAD` is
// deliberately absent: anything with workspace write access can plant a request with a newline in
// its title, and that must not be able to claim the user's Codex setup is broken.
const PATH_VERDICT_CODES = new Set([
  'CLI_MISSING',
  'SANDBOX_DENIED',
  'COMMAND_FAILED',
  // A payload without `session_id` is a statement about the harness, not about anything the
  // workspace can reach, and it is the failure the plan's A1' predicts if that field is not what
  // the design assumes. It stays a path verdict so the run can name it instead of falling silent.
  'NO_THREAD_ID',
]);

// A receipt is read back into run-facing prose, so it may only carry vocabulary the fragment can
// map. An unexpected code - a stray Node errno reaching the catch - is dropped rather than
// forwarded.
function clampReceiptCode(code) {
  if (typeof code !== 'string') return null;
  return ERROR_CODES.includes(code) || SKIP_REASONS.includes(code) ? code : null;
}

// Why `request` reports a liveness signal at all: the run stays silent only where the rename path
// is live, and prints its suggestion line otherwise. A hook that is absent, not yet trusted, or
// re-gated after an edit consumes nothing, so without this the run would fall silent and leave the
// session unnamed - the one outcome the contract rules out.
export const LIVENESS_REASONS = Object.freeze([
  'no-hook',
  'untrusted',
  'managed-hooks-only',
  'hook-failed',
  'hook-stale',
  'undeterminable',
]);

export const OPERATIONS = Object.freeze(['request', 'apply']);

export const RUNTIME_DIR_NAME = '.effective-flow';
export const REQUEST_FILE_NAME = 'session-title.json';
// Written by `apply` and read by `request`. It records that the hook ran, which is the only
// evidence of liveness this helper can obtain first-hand; see `probeHookLiveness`.
export const HOOK_RECEIPT_FILE_NAME = 'session-title-hook.json';

// `src/shared/session-title.md` owns the wording rule ("at most 60 characters, cut at a word
// boundary"). The producer cuts, this helper only validates - one authority for the rule, and a
// caller that ignores it still fails loudly instead of shipping a reshaped title.
export const TITLE_MAX_LENGTH = 60;

// A request is consumed by the `Stop` hook of the very turn that wrote it, so the useful lifetime
// is seconds. Five minutes is generous for a long turn and still short enough that a request left
// behind by a crashed run, or by a hook that was not trusted yet, can never be applied later to a
// title that has since become wrong.
export const REQUEST_MAX_AGE_MS = 5 * 60 * 1000;

// How long an observed hook run keeps vouching for the installation. A session can idle for hours
// between turns, so a short window would report a working hook as absent; a long one would keep
// vouching for a hook the user removed. A day errs toward the harmless side: a stale receipt costs
// at most one silent run, and a receipt that expired too early costs one redundant suggestion line
// next to a rename that still happens.
export const HOOK_RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const INITIALIZE_REQUEST_ID = 1;
export const SET_NAME_REQUEST_ID = 2;

const APP_SERVER_EXECUTABLE = 'codex';
const APP_SERVER_ARGS = Object.freeze(['app-server', '--stdio']);
const DEFAULT_RPC_TIMEOUT_MS = 15000;
const CLIENT_INFO = Object.freeze({ name: 'effective-flow', version: '1.0.0' });

// V9: a sandboxed app-server dies with exactly this signature. It is the one failure worth its own
// code, because the remedy is the hook setup rather than anything about the request.
const SANDBOX_DENIED_SIGNATURE = /failed to initialize sqlite state runtime/i;

// `\p{Cc}` covers the C0 and C1 controls, and with them every newline, carriage return and tab;
// U+2028 and U+2029 are the two line separators outside that block. Bidi marks are deliberately
// not rejected: they are not control characters and a right-to-left title legitimately carries
// them, so banning them would silently drop valid titles instead of catching a malformed one.
const CONTROL_CHARACTERS = /[\p{Cc}\u2028\u2029]/u;

const THREAD_ID_MAX_LENGTH = 200;
const THREAD_ID_PATTERN = /^\S+$/u;

const STDERR_EXCERPT_LIMIT = 2000;

// Every read this helper performs is bounded, and the runtime files most of all: the request is
// the one file the design declares workspace-writable, and the privileged `apply` reads it at the
// end of every turn. A document that holds a thread id, a 60-character title and a timestamp has
// no business approaching this bound; anything that does is hostile or broken, and either way it
// is refused rather than loaded.
const RUNTIME_FILE_MAX_BYTES = 16 * 1024;
const CONFIG_SOURCE_MAX_BYTES = 512 * 1024;

// The hook command Effective Flow asks the user to install names the shipped script, so its file
// name is the signature to look for. This is a text match, not an understanding of the hook
// schema: a wrapper script that invokes the helper indirectly is not recognized, which is why a
// scan that finds nothing never overrides an observed hook run - see `probeHookLiveness`.
const HOOK_COMMAND_SIGNATURE = /session-title\.mjs/;
// H6: this suppresses user, project and plugin hooks entirely, so the path is unavailable by
// policy rather than broken. It is a plain boolean and the one config fact worth reading directly.
const MANAGED_HOOKS_ONLY_SIGNATURE = /^[^\S\n]*allow_managed_hooks_only[^\S\n]*=[^\S\n]*true\b/m;
// H6 again: a reviewed hook records `{enabled, trusted_hash}` under `hooks.state`. The hash itself
// is unusable here (see `probeHookLiveness`); its mere presence still separates "this installation
// has trusted something" from "nothing has ever been reviewed".
const TRUST_STATE_SIGNATURE = /trusted_hash/;

export class SessionTitleError extends Error {
  constructor(code, message, details = {}, retryable = false) {
    super(message);
    this.name = 'SessionTitleError';
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

function fail(code, message, details = {}, retryable = false) {
  throw new SessionTitleError(code, message, details, retryable);
}

function requireObject(value, label = 'input') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_PAYLOAD', `${label} must be a JSON object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('INVALID_PAYLOAD', `${label} must be a non-empty string`, { field: label });
  }
  return value;
}

// `O_NOFOLLOW` refuses a symlink in the same syscall that opens the file, and the `fstat` that
// follows describes exactly the handle that is then read - an `lstat` on the path would leave a
// window in which the path could be swapped for one. `O_NONBLOCK` keeps a planted FIFO from
// blocking the open forever. Windows has neither flag; the `fstat` check alone still holds there.
const SAFE_OPEN_FLAGS =
  constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/**
 * Reads a bounded regular file and never throws, classifying instead of failing: `absent` for a
 * path that is not there, `unusable` with a short detail for one this helper refuses to read, and
 * `read` with the text. Both callers need that distinction rather than an exception - the liveness
 * probe because a source the sandbox denied is an absence of evidence rather than a fault, and
 * `apply` because a file it cannot use must not turn the user's `Stop` hook into a broken one.
 */
function readTextIfRegular(path, maxBytes) {
  let descriptor;
  try {
    descriptor = openSync(path, SAFE_OPEN_FLAGS);
  } catch (error) {
    if (error.code === 'ENOENT') return { status: 'absent' };
    const symlink = error.code === 'ELOOP' || error.code === 'EMLINK';
    return { status: 'unusable', detail: symlink ? 'symlink' : 'unreadable' };
  }
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile()) return { status: 'unusable', detail: 'not-regular' };
    if (stats.size > maxBytes) return { status: 'unusable', detail: 'too-large' };
    return { status: 'read', text: readFileSync(descriptor, 'utf8') };
  } catch {
    return { status: 'unusable', detail: 'unreadable' };
  } finally {
    closeSync(descriptor);
  }
}

function stderrExcerpt(text) {
  const value = typeof text === 'string' ? text.trim() : '';
  return value.length <= STDERR_EXCERPT_LIMIT ? value : value.slice(-STDERR_EXCERPT_LIMIT);
}

/**
 * Rule 5 of the request-file contract: the title is opaque text. Every violation is rejected and
 * none is repaired, so a producer that ignores the wording rule sees its mistake instead of
 * shipping a title nobody wrote.
 */
export function assertTitle(title) {
  const value = requireString(title, 'title');
  if (CONTROL_CHARACTERS.test(value)) {
    fail('INVALID_PAYLOAD', 'title must not contain newlines or control characters', {
      field: 'title',
    });
  }
  // Counted in code points rather than UTF-16 units, so the limit means what a reader of the
  // wording rule means by "characters" and an astral character costs one, not two.
  const length = [...value].length;
  if (length > TITLE_MAX_LENGTH) {
    fail('INVALID_PAYLOAD', `title must be at most ${TITLE_MAX_LENGTH} characters`, {
      field: 'title',
      length,
    });
  }
  return value;
}

/**
 * A thread id travels into a JSON file and from there into an RPC parameter, so it is checked for
 * shape but never for format: guessing at Codex's identifier grammar would reject valid ids the
 * day it changes. Whitespace and control characters are all that is refused.
 */
export function assertThreadId(value, label, code = 'INVALID_PAYLOAD') {
  if (typeof value !== 'string' || value === '') {
    fail(code, `${label} must be a non-empty string`, { field: label });
  }
  if (value.length > THREAD_ID_MAX_LENGTH || !THREAD_ID_PATTERN.test(value)) {
    fail(code, `${label} is not a usable thread id`, { field: label });
  }
  return value;
}

/**
 * The single place that decides where runtime state lives. Both operations derive it from an
 * absolute workspace root - `request` from the caller's verified `RUNTIME_STATE_ROOT`, `apply`
 * from the `cwd` in its own hook payload - so the two sides meet without any configured path.
 */
export function runtimeFilePath(cwd, name) {
  const root = requireString(cwd, 'cwd');
  if (!isAbsolute(root)) {
    fail('INVALID_PAYLOAD', 'cwd must be an absolute path', { field: 'cwd', cwd: root });
  }
  return join(root, RUNTIME_DIR_NAME, name);
}

export function requestFilePath(cwd) {
  return runtimeFilePath(cwd, REQUEST_FILE_NAME);
}

export function hookReceiptPath(cwd) {
  return runtimeFilePath(cwd, HOOK_RECEIPT_FILE_NAME);
}

export function buildRequestDocument({ threadId, title, now = Date.now() }) {
  return {
    threadId: assertThreadId(threadId, 'threadId'),
    title: assertTitle(title),
    requestedAt: new Date(now).toISOString(),
  };
}

/**
 * Parses a request file into its object form and nothing more. `threadId` is compared as it
 * stands, and `title` is validated only after that comparison proved the request belongs to this
 * thread: a foreign run's malformed title must be skipped quietly, not reported as this run's
 * fault.
 */
export function parseRequestFile(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail('INVALID_PAYLOAD', `the session-title request is not valid JSON: ${error.message}`);
  }
  return requireObject(parsed, 'session-title request');
}

export function parseRequestedAt(value) {
  const text = requireString(value, 'requestedAt');
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) {
    fail('INVALID_PAYLOAD', 'requestedAt must be an ISO 8601 timestamp', {
      field: 'requestedAt',
      requestedAt: text,
    });
  }
  return timestamp;
}

/**
 * Rule 2 of the request-file contract. Both sides read the same wall clock on the same machine,
 * so a timestamp in the future is not clock skew - it is a request this run did not write, and it
 * is refused without a tolerance window.
 */
export function isFreshRequest(requestedAt, now = Date.now()) {
  return requestedAt <= now && now - requestedAt <= REQUEST_MAX_AGE_MS;
}

/**
 * Reports whether `<root>/.effective-flow` is the real directory it claims to be. `O_NOFOLLOW`
 * guards only the final path component, so without this a symlinked runtime **directory** would
 * still redirect every read, unlink and write below it - an arbitrary read of any file named
 * `session-title.json`, whose parse failure quotes part of its content back into an error message,
 * and a matching arbitrary delete.
 *
 * Comparing the two resolved paths settles it in one step and stays correct when the workspace
 * root is itself reached through a symlink, because both sides are resolved. It is check-then-use
 * and not atomic: a directory swapped between this check and the operation that follows would slip
 * through. Closing that needs `openat`-style directory handles, which Node does not expose; what
 * this does buy is that the persistent case - a planted symlink sitting in the workspace - is
 * refused every time rather than followed.
 */
export function runtimeDirectoryState(root) {
  const directory = join(root, RUNTIME_DIR_NAME);
  try {
    return realpathSync(directory) === join(realpathSync(root), RUNTIME_DIR_NAME)
      ? 'contained'
      : 'escaped';
  } catch (error) {
    // A runtime directory that is not there yet is the ordinary state of a fresh checkout. Any
    // other resolution failure is treated as an escape, because a check that cannot complete must
    // not read as a pass.
    return error.code === 'ENOENT' ? 'absent' : 'escaped';
  }
}

function assertContainedRuntimeDir(root) {
  const state = runtimeDirectoryState(root);
  if (state !== 'contained') {
    fail('INVALID_PAYLOAD', 'the runtime directory escapes the workspace root', {
      path: join(root, RUNTIME_DIR_NAME),
      state,
    });
  }
}

function assertReplaceableTarget(path) {
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    fail('COMMAND_FAILED', `could not inspect the session-title request: ${error.message}`, {
      path,
    });
  }
  // The rename below replaces a symlink rather than writing through it, so the write is already
  // safe without this. What it adds is a report: a planted object at the request path is a fact
  // the workflow can surface to the user, and the writing side is where someone is listening. The
  // reading side deliberately does not mirror it - see the `unusable-request` skip.
  if (!stats.isFile()) {
    fail('INVALID_PAYLOAD', 'refusing to replace a non-regular file at the request path', { path });
  }
}

/**
 * Writes the request through a temporary file and one rename, so a reader never observes a partial
 * document and a crashed write leaves the previous request untouched rather than a truncated one.
 */
export function writeRequestFile(path, document) {
  const directory = dirname(path);
  const root = dirname(directory);
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  } catch (error) {
    fail('COMMAND_FAILED', `could not create the runtime directory: ${error.message}`, {
      path: directory,
    });
  }
  assertContainedRuntimeDir(root);
  assertReplaceableTarget(path);
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary file may never have been created; the write error below is the real result.
    }
    fail('COMMAND_FAILED', `could not write the session-title request: ${error.message}`, { path });
  }
  return path;
}

/**
 * Rule 3 of the request-file contract, and the read that follows it. Reports `absent` when no
 * request is pending - the ordinary state of a checkout - and `unusable` for a symlink, a
 * non-regular file, or a document past the runtime bound, none of which it reads.
 */
export function readRequestFile(path) {
  return readTextIfRegular(path, RUNTIME_FILE_MAX_BYTES);
}

/**
 * Rule 4 of the request-file contract. The request is single-use, and it is consumed before the
 * RPC and before any validation that could throw, so a crash, a rejected title, or a second hook
 * firing can never replay it.
 */
export function consumeRequestFile(path) {
  try {
    unlinkSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    fail('COMMAND_FAILED', `could not remove the session-title request: ${error.message}`, {
      path,
    });
  }
  return true;
}

/**
 * Records what the hook did. `apply` writes it twice: once on entry with `started`, which proves
 * the hook process ran at all, and once on the way out with the terminal outcome.
 *
 * Both halves are needed. The entry write survives a hook that is killed mid-flight and would
 * otherwise leave no trace; the terminal write is what separates an installation that renames from
 * one that fires the hook faithfully and fails the RPC every single time - `codex` missing from the
 * login shell's `PATH`, a sandboxed app server, a protocol change on an experimental surface. The
 * hook's own stdout reaches nobody, so this file is the only channel by which the next run can
 * learn that the path it is about to trust is broken.
 *
 * Best-effort by construction: a hook must never fail because a receipt could not be written, and
 * it must not create runtime state in a workspace that never asked for any, so a missing runtime
 * directory means no receipt rather than a new directory.
 */
export function writeHookReceipt(path, receipt) {
  const directory = dirname(path);
  try {
    if (!statSync(directory).isDirectory()) return false;
    assertContainedRuntimeDir(dirname(directory));
    assertReplaceableTarget(path);
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {
        mode: 0o600,
        flag: 'wx',
      });
      renameSync(temporary, path);
    } catch (error) {
      try {
        unlinkSync(temporary);
      } catch {
        // The temporary file may never have been created.
      }
      throw error;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads a hook receipt, or `null` when there is none to read. A forged receipt is worth noting and
 * not worth guarding: the worst it buys is a run that stays silent and therefore suggests no
 * title, which withholds a convenience rather than granting anything.
 */
export function readHookReceipt(path) {
  const source = readTextIfRegular(path, RUNTIME_FILE_MAX_BYTES);
  if (source.status !== 'read') return null;
  try {
    const parsed = JSON.parse(source.text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const appliedAt =
      typeof parsed.appliedAt === 'string' ? Date.parse(parsed.appliedAt) : Number.NaN;
    if (!Number.isFinite(appliedAt)) return null;
    // An outcome is required. Nothing has shipped that writes a receipt without one, so a document
    // missing it is malformed rather than old, and treating it as usable would let a regression in
    // the outcome plumbing read as the benign case.
    if (!HOOK_OUTCOMES.includes(parsed.outcome)) return null;
    return {
      appliedAt,
      threadId: typeof parsed.threadId === 'string' ? parsed.threadId : null,
      outcome: parsed.outcome,
      // Clamped here rather than only where a code is produced, because this is the trust
      // boundary: the file is workspace-writable, and the run names this code in its own output.
      // Without the clamp any string up to the runtime size bound would be injected into that.
      code: clampReceiptCode(parsed.code),
    };
  } catch {
    return null;
  }
}

/**
 * Writes the terminal half of the receipt. A skip carries no verdict about the rename path, so it
 * refreshes the timestamp but leaves an earlier verdict standing: without that, one ordinary turn
 * that requested no title would erase the record of a broken hook and hand the next run a `live`
 * it has no evidence for. `outcome` therefore means "the newest verdict this installation
 * produced" and `appliedAt` means "when the hook last ran".
 *
 * `prior` must be captured **before** the entry write, and is passed in rather than read back
 * here: by the time this runs, the receipt on disk is this same invocation's `started` marker, so
 * a read-back would only ever find that and the preservation would never fire in production.
 */
export function finalizeHookReceipt(path, { appliedAt, threadId, outcome, code = null }, prior) {
  const carried =
    outcome === 'skipped' && prior !== null && prior !== undefined && prior.outcome !== 'started'
      ? prior
      : null;
  return writeHookReceipt(
    path,
    carried === null
      ? { appliedAt, threadId, outcome, code }
      : { appliedAt, threadId, outcome: carried.outcome, code: carried.code },
  );
}

// Only whole-line comments are dropped. A `#` inside a quoted command is not a comment, and
// telling the two apart needs the TOML parser this helper deliberately does not have; a
// commented-out example hook is the case worth catching and it occupies its own line.
function stripCommentLines(text) {
  return text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
}

/**
 * Reads the four hook configuration layers (H5) and reports what they rule **out**. It is a text
 * scan, not a parser, and it is written to be wrong only in the harmless direction - see
 * `probeHookLiveness` for which of its verdicts are allowed to decide anything.
 *
 * Never throws: every source may be missing, denied by the sandbox, or unparseable, and none of
 * that is a failure of the run that asked.
 */
export function scanHookConfiguration({ cwd, env = process.env, homeDir } = {}) {
  const codexHome = env.CODEX_HOME ?? join(homeDir ?? homedir(), '.codex');
  const sources = [
    { path: join(cwd, '.codex', 'hooks.json'), toml: false, userConfig: false },
    { path: join(cwd, '.codex', 'config.toml'), toml: true, userConfig: false },
    { path: join(codexHome, 'hooks.json'), toml: false, userConfig: false },
    { path: join(codexHome, 'config.toml'), toml: true, userConfig: true },
  ];
  const scan = {
    read: 0,
    unreadable: 0,
    hookDeclared: false,
    trustStateRecorded: false,
    managedHooksOnly: false,
    // H2: the app writes `hooks.state` into the user's `config.toml`, so "nothing was ever
    // trusted" is only a statement worth making once that file's status is known.
    userConfigKnown: false,
  };
  for (const source of sources) {
    const result = readTextIfRegular(source.path, CONFIG_SOURCE_MAX_BYTES);
    if (result.status === 'unusable') {
      scan.unreadable += 1;
      continue;
    }
    if (source.userConfig) scan.userConfigKnown = true;
    if (result.status === 'absent') continue;
    scan.read += 1;
    const text = source.toml ? stripCommentLines(result.text) : result.text;
    if (HOOK_COMMAND_SIGNATURE.test(text)) scan.hookDeclared = true;
    if (TRUST_STATE_SIGNATURE.test(text)) scan.trustStateRecorded = true;
    if (source.toml && MANAGED_HOOKS_ONLY_SIGNATURE.test(text)) scan.managedHooksOnly = true;
  }
  if (scan.managedHooksOnly) return { ...scan, verdict: 'managed-hooks-only' };
  if (scan.hookDeclared) {
    return {
      ...scan,
      verdict: scan.trustStateRecorded || !scan.userConfigKnown ? 'hook-declared' : 'untrusted',
    };
  }
  // "No hook" is only claimed where the scan is complete and demonstrably able to read: at least
  // one source was genuinely read, and none was denied. Otherwise the absence of a hook mention is
  // an absence of evidence, which is a different statement.
  if (scan.read > 0 && scan.unreadable === 0) return { ...scan, verdict: 'no-hook' };
  return { ...scan, verdict: 'undeterminable' };
}

/**
 * Decides whether the applying half of the rename path is live, and it is deliberately not a
 * configuration check.
 *
 * A hook only runs once its content hash has been reviewed, and editing the hook re-gates it
 * (H6). Verifying that from configuration would mean recomputing Codex's hash, but neither the
 * digest nor the value it covers nor the key format of the `hooks.state` map was ever established
 * - H6 records that the mechanism exists, not how it is encoded. A `live: true` derived from "an
 * entry is present" would therefore be a guess, and a wrong guess here produces exactly the
 * outcome the plan calls out as critical: a run that renames nothing and says nothing.
 *
 * So the two signals are used for what each can carry:
 *
 * - The **receipt** is first-hand evidence, and the only thing that can make this report `live`.
 *   That it exists proves the hook fires; its recorded outcome is what proves the rename works.
 *   A `failed` receipt is therefore not merely "no evidence" - it is evidence against, and it
 *   reports `hook-failed` together with the code the hook recorded, which is the only way the
 *   run can name a `SANDBOX_DENIED` or `CLI_MISSING` that happened in a process it never saw.
 *   A receipt still stuck at `started` proves only that a hook died mid-flight and is not live
 *   either.
 * - The **configuration scan** can only rule the path out, and only two of its verdicts are
 *   trusted to override the receipt: an explicit `allow_managed_hooks_only`, and a complete scan
 *   of readable sources that declares no hook. `untrusted` and `undeterminable` never override
 *   it, because a narrow text scan that missed a hook is likelier than a receipt that lies.
 *
 * The known cost is one suggestion line too many: the first run on a fresh installation has no
 * receipt yet and reports `undeterminable`, so it suggests a title while the hook renames the
 * session anyway. That is the harmless direction, and it self-corrects from the next turn on.
 *
 * The shape is stable across every outcome - `live`, `reason`, `code`, `observedAt`, with `null`
 * where a field does not apply - so a caller reads the same keys whatever the verdict.
 */
export function probeHookLiveness({ cwd, env = process.env, now = Date.now(), homeDir } = {}) {
  const verdict = (live, reason = null, code = null, observedAt = null) => ({
    live,
    reason,
    code,
    observedAt,
  });
  try {
    const scan = scanHookConfiguration({ cwd, env, homeDir });
    if (scan.verdict === 'managed-hooks-only') return verdict(false, 'managed-hooks-only');
    if (scan.verdict === 'no-hook') return verdict(false, 'no-hook');
    const receipt = readHookReceipt(hookReceiptPath(cwd));
    const observed =
      receipt !== null &&
      receipt.appliedAt <= now &&
      now - receipt.appliedAt <= HOOK_RECEIPT_MAX_AGE_MS;
    if (observed) {
      const observedAt = new Date(receipt.appliedAt).toISOString();
      if (receipt.outcome === 'failed') {
        return verdict(false, 'hook-failed', receipt.code, observedAt);
      }
      // The hook ran and something of ours was not renamed - an expired or unusable request, or a
      // request the hook refused. Distinct from `hook-failed` because the remedy is different, and
      // never pooled with a plain skip because it is evidence against the path rather than for it.
      if (receipt.outcome === 'unapplied') {
        return verdict(false, 'hook-stale', receipt.code, observedAt);
      }
      if (receipt.outcome !== 'started') return verdict(true, null, null, observedAt);
    }
    if (scan.verdict === 'untrusted') return verdict(false, 'untrusted');
    return verdict(false, 'undeterminable');
  } catch {
    // The probe decides whether one line is printed. Nothing about it is worth failing a run over.
    return verdict(false, 'undeterminable');
  }
}

/**
 * The complete app-server exchange, in order: the `initialize` request, the `initialized`
 * notification that answers its response, and the rename itself. Ids are fixed because the
 * exchange is fixed - there is exactly one of each request per run.
 */
export function buildRenameFrames({ threadId, title }) {
  return [
    {
      jsonrpc: '2.0',
      id: INITIALIZE_REQUEST_ID,
      method: 'initialize',
      params: { clientInfo: { ...CLIENT_INFO } },
    },
    { jsonrpc: '2.0', method: 'initialized' },
    {
      jsonrpc: '2.0',
      id: SET_NAME_REQUEST_ID,
      method: 'thread/name/set',
      params: { threadId, name: title },
    },
  ];
}

function failLaunch(outcome) {
  const stderr = stderrExcerpt(outcome?.stderr);
  if (outcome?.error?.code === 'ENOENT') {
    fail('CLI_MISSING', 'codex is not installed or not on PATH', {
      executable: APP_SERVER_EXECUTABLE,
    });
  }
  if (SANDBOX_DENIED_SIGNATURE.test(stderr)) {
    fail(
      'SANDBOX_DENIED',
      'codex app-server could not open its state runtime under ~/.codex; the sandbox denied it',
      { stderr },
    );
  }
  fail(
    'COMMAND_FAILED',
    'codex app-server closed before answering the rename request',
    { status: outcome?.status ?? null, signal: outcome?.signal ?? null, stderr },
    true,
  );
}

function failRpc(step, message) {
  fail(
    'COMMAND_FAILED',
    `codex app-server rejected ${step}: ${message?.error?.message ?? 'no result'}`,
    {
      step,
      rpc: message?.error ?? null,
    },
  );
}

/**
 * Drives the exchange over an injected session runner. The runner owns the process; this owns the
 * order, and it holds the session open until the response for `thread/name/set` has arrived -
 * closing standard input earlier races the server's own reply.
 *
 * The runner contract, implemented by `session-title.mjs` and by any test double:
 *
 * - `runner({ executable, args, cwd, timeoutMs })` returns a session (may be a promise).
 * - `session.send(frame)` writes one JSON-RPC object as one line.
 * - `session.waitFor(id)` resolves with the response carrying that id, or with `null` when the
 *   server exited or the bound elapsed first.
 * - `session.close()` ends standard input, stops the child and resolves with
 *   `{ status, signal, stderr, error }`. It is idempotent.
 */
export async function renameThread({ threadId, title, cwd, runner, timeoutMs }) {
  if (typeof runner !== 'function') {
    fail('INVALID_PAYLOAD', 'renameThread requires an injected process runner');
  }
  const [initialize, initialized, setName] = buildRenameFrames({ threadId, title });
  const session = await runner({
    executable: APP_SERVER_EXECUTABLE,
    args: [...APP_SERVER_ARGS],
    cwd,
    timeoutMs: timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
  });
  try {
    session.send(initialize);
    const ready = await session.waitFor(INITIALIZE_REQUEST_ID);
    if (ready === null) failLaunch(await session.close());
    if (ready.error) failRpc('initialize', ready);
    // The notification only becomes correct once `initialize` has been answered, which is why the
    // three frames are not written in one burst.
    session.send(initialized);
    session.send(setName);
    const response = await session.waitFor(SET_NAME_REQUEST_ID);
    if (response === null) failLaunch(await session.close());
    if (response.error) failRpc('thread/name/set', response);
    return { result: response.result ?? null };
  } finally {
    await session.close();
  }
}

function successEnvelope(operation, data) {
  return { ok: true, operation, data };
}

async function executeRequest(input, options) {
  const path = requestFilePath(input.cwd);
  // The title is the caller's own data and is checked first, so a producer bug stays visible on a
  // host that has no `CODEX_THREAD_ID` at all instead of hiding behind the missing identity.
  const title = assertTitle(input.title);
  const env = options.env ?? process.env;
  // V7: Codex sets this in every shell call it issues. There is no second source - deriving the
  // id from the newest rollout filename would be a guess, and a guess renames a stranger's thread.
  const threadId = assertThreadId(env.CODEX_THREAD_ID, 'CODEX_THREAD_ID', 'NO_THREAD_ID');
  const now = options.now ?? Date.now();
  const document = buildRequestDocument({ threadId, title, now });
  // The request is written before the path is probed, and regardless of what the probe concludes:
  // a hook that gets trusted between this write and the end of the turn still consumes it, and a
  // probe that misjudges the installation must never be the reason a rename was not even offered.
  writeRequestFile(path, document);
  const liveness = probeHookLiveness({ cwd: input.cwd, env, now, homeDir: options.homeDir });
  // One shape for every outcome: a caller reads `live`, `reason`, `code` and `observedAt` from
  // every successful request envelope rather than testing which keys this particular run produced.
  return successEnvelope('request', { requested: true, path, ...document, ...liveness });
}

function skipped(reason, data) {
  return successEnvelope('apply', { applied: false, reason, ...data });
}

async function applyRequest(input, options, { path, now }) {
  // H4: a hook receives no `CODEX_THREAD_ID`, because one Codex process serves many threads. The
  // identity arrives as `session_id` in this payload, supplied by Codex itself, and that makes it
  // the only source `apply` trusts. Every other field of the payload is ignored on purpose.
  const sessionId = assertThreadId(input.session_id, 'session_id', 'NO_THREAD_ID');
  // `O_NOFOLLOW` on the file guards only its last path component, so the directory that holds it
  // is checked before anything below it is read or unlinked.
  const containment = runtimeDirectoryState(input.cwd);
  if (containment === 'absent') return skipped('no-request', { path });
  if (containment === 'escaped') {
    return skipped('unusable-request', { path, detail: 'runtime-dir-escape' });
  }
  const source = readRequestFile(path);
  if (source.status === 'absent') return skipped('no-request', { path });
  if (source.status === 'unusable') {
    return skipped('unusable-request', { path, detail: source.detail });
  }
  consumeRequestFile(path);
  const document = parseRequestFile(source.text);
  // Rule 1: byte-identical or nothing. A non-string `threadId` fails this comparison as well, so
  // the file can corroborate the identity but never supply it.
  if (document.threadId !== sessionId) return skipped('thread-mismatch', { path });
  // Past this point the request is provably this thread's own, so every remaining violation is
  // this run's fault and is reported rather than skipped - except expiry, which the design uses
  // as the safety net for a hook that never fired.
  const requestedAt = parseRequestedAt(document.requestedAt);
  if (!isFreshRequest(requestedAt, now)) {
    return skipped('expired-request', { path, requestedAt: document.requestedAt });
  }
  const title = assertTitle(document.title);
  const rpc = await renameThread({
    threadId: sessionId,
    title,
    cwd: input.cwd,
    runner: options.runner,
    timeoutMs: options.timeoutMs,
  });
  // `applied` states what the protocol supports and no more: the app server accepted the rename
  // request and answered without an error member. V8 established that such a call reaches the
  // shared store, but the response itself carries no confirmation to inspect, so this is an
  // acknowledgement rather than an observation of the renamed thread.
  return successEnvelope('apply', {
    applied: true,
    threadId: sessionId,
    title,
    result: rpc.result,
  });
}

function optionalRuntimePath(cwd, name) {
  try {
    return runtimeFilePath(cwd, name);
  } catch {
    // A payload whose `cwd` this helper cannot use leaves nowhere to record anything. That is a
    // real blind spot and it is the honest one: guessing a workspace would put runtime state in a
    // directory nobody asked about.
    return null;
  }
}

function outcomeOfSkip(reason) {
  return PATH_VERDICT_SKIPS.has(reason)
    ? { outcome: 'unapplied', code: reason }
    : { outcome: 'skipped', code: null };
}

function outcomeOfFailure(error) {
  const code = clampReceiptCode(error?.code);
  if (code !== null && PATH_VERDICT_CODES.has(code)) return { outcome: 'failed', code };
  // Everything else says the hook ran and nothing was renamed, without claiming the installation
  // is at fault - a rejected title indicts the request that carried it, not the user's Codex.
  return { outcome: 'unapplied', code: code ?? 'COMMAND_FAILED' };
}

async function executeApply(input, options) {
  const now = options.now ?? Date.now();
  const appliedAt = new Date(now).toISOString();
  const threadId = typeof input.session_id === 'string' ? input.session_id : null;
  // Everything about the receipt is settled before the first check that can refuse this run, which
  // is what makes a hook that fails identically every turn diagnosable at all - `NO_THREAD_ID`
  // above all, the failure the plan's A1' predicts.
  //
  // The derivation tolerates no more than `requestFilePath` does: both reject the same inputs, so
  // a `cwd` bad enough to have no receipt path has no request path either and this run leaves no
  // trace at all. That blind spot is real and is not closed here, because inventing a workspace
  // would put runtime state somewhere nobody asked about. What the non-throwing form does buy is
  // that the receipt bookkeeping cannot itself throw past the entry write.
  const receiptPath = optionalRuntimePath(input.cwd, HOOK_RECEIPT_FILE_NAME);
  // Captured before the entry write, because that write is what the finalizer would otherwise read
  // back - and it would find its own `started` marker rather than the verdict it must preserve.
  const prior = receiptPath === null ? null : readHookReceipt(receiptPath);
  const record = (outcome, code) => {
    if (receiptPath === null) return;
    finalizeHookReceipt(receiptPath, { appliedAt, threadId, outcome, code }, prior);
  };
  if (receiptPath !== null) {
    writeHookReceipt(receiptPath, { appliedAt, threadId, outcome: 'started', code: null });
  }
  try {
    const path = requestFilePath(input.cwd);
    const envelope = await applyRequest(input, options, { path, now });
    const { outcome, code } = envelope.data.applied
      ? { outcome: 'applied', code: null }
      : outcomeOfSkip(envelope.data.reason);
    record(outcome, code);
    return envelope;
  } catch (error) {
    // The failure is recorded where the next run can see it. Nothing else can: this envelope goes
    // to the hook's standard output, which no one reads.
    const { outcome, code } = outcomeOfFailure(error);
    record(outcome, code);
    throw error;
  }
}

export async function executeOperation(operation, input = {}, options = {}) {
  requireString(operation, 'operation');
  requireObject(input);
  try {
    if (operation === 'request') return await executeRequest(input, options);
    if (operation === 'apply') return await executeApply(input, options);
    fail('INVALID_PAYLOAD', `unknown operation: ${operation}`, { operation });
  } catch (error) {
    return errorEnvelope(operation, error);
  }
}

export function errorEnvelope(operation, error) {
  const normalized =
    error instanceof SessionTitleError
      ? error
      : new SessionTitleError('COMMAND_FAILED', error?.message ?? 'unexpected failure');
  return {
    ok: false,
    operation,
    data: null,
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
      retryable: normalized.retryable,
    },
  };
}
