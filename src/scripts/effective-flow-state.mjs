#!/usr/bin/env node

// Thin JSON CLI over effective-flow-state-core.mjs:
//   node effective-flow-state.mjs lock <acquire|release|inspect|break> <<< '<json>'
//   node effective-flow-state.mjs memory <reserve|set-marker|migrate-directory> <<< '<json>'
//   node effective-flow-state.mjs harness allow-rules <<< '<json>'
//   node effective-flow-state.mjs commit create <<< '<json>'
//   node effective-flow-state.mjs review <open-report|write-report> <<< '<json>'
//   node effective-flow-state.mjs worktree <record-init|transition|inspect|remove> <<< '<json>'
//   node effective-flow-state.mjs cleanup <plan|apply> <<< '<json>'
//   node effective-flow-state.mjs ledger <init|append> <<< '<json>'
// The operation is exactly these two argv tokens; any other argv, an extra token included, is
// rejected before stdin is read, so an allowlisted command prefix cannot be widened by an extra
// argument and `--help` never blocks on a tty. Stdin carries one JSON object within the bound
// `STDIN_LIMITS` of `effective-flow-state-core.mjs` names for the operation (64 KiB unless listed);
// a larger one is INPUT_TOO_LARGE. `ledger init`, the one listed operation, reads up to
// LEDGER_MAX_BYTES, the ledger's own bound, and drains a larger input up to its `drainBytes`
// (4 x LEDGER_MAX_BYTES) without keeping or parsing it, answered with the non-error size-bound
// result, since a ledger holding that manifest could not stay within the bound either; above
// `drainBytes` it is INPUT_TOO_LARGE as well.
// Writes exactly one JSON envelope line to stdout and `CODE: message` to stderr on failure; the
// exit code is 0 on success, 4 for an outcome, and 1, 2 or 3 for an error.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createProcessRunner, terminateActiveProcessGroups } from './process-runner.mjs';
import {
  STATE_OPERATIONS,
  StateError,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
  stdinLimitFor,
} from './effective-flow-state-core.mjs';

const USAGE = `usage: effective-flow-state.mjs <${STATE_OPERATIONS.join('|')}> (input as one JSON object on stdin)`;

// What `readStdin` returns for an input above its operation's `bytes` and within its
// `drainBytes`: the drained byte count, never the content.
class OverBound {
  constructor(bytes) {
    this.bytes = bytes;
  }
}

async function readStdin(stream, operation) {
  const { bytes: limit, drainBytes } = stdinLimitFor(operation);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > limit) {
      if (drainBytes === null || bytes > drainBytes) {
        throw new StateError('INPUT_TOO_LARGE', `stdin exceeds ${drainBytes ?? limit} bytes`);
      }
      // Drained, never kept: the writer of a here-string is not left with a broken pipe.
      chunks.length = 0;
      continue;
    }
    chunks.push(buffer);
  }
  if (bytes > limit) return new OverBound(bytes);
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw new StateError('INVALID_INPUT', `invalid JSON input: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new StateError('INVALID_INPUT', 'stdin JSON must be an object');
  }
  return parsed;
}

const LOCK_MESSAGES = Object.freeze({
  LOCK_HELD: 'is held by another owner',
  NOT_OWNER: 'is not owned by the supplied token',
  NOT_HELD: 'is not held',
  BREAK_MISMATCH: 'changed since it was observed; nothing was removed',
});

const OUTCOME_MESSAGES = Object.freeze({
  MIGRATION_REQUIRED: () =>
    'the runtimeMigration.directory marker is missing; run memory migrate-directory first',
  MIGRATION_NOT_NEEDED: () => 'the runtime directory migration has already completed',
  MIGRATION_INCOMPLETE: (outcome) =>
    `the runtime directory migration is incomplete (${outcome.reason}); no marker was written`,
  LEGACY_MEMORY_INVALID: (outcome) => `${outcome.path} is not valid memory (${outcome.reason})`,
  UNSUPPORTED_HARNESS: () => 'not running inside Claude Code; nothing was written',
  UNSUPPORTED_PATH: (outcome) => `skillRoot is refused (${outcome.reason}); nothing was written`,
  SETTINGS_NOT_IGNORED: (outcome) => `${outcome.path} is not ignored; nothing was written`,
  SETTINGS_TRACKED: (outcome) => `${outcome.path} is tracked; nothing was written`,
  SETTINGS_INVALID: (outcome) => `${outcome.target} is invalid; nothing was written`,
  PREVIEW_MISMATCH: (outcome) =>
    outcome.itemId
      ? `cleanup item ${outcome.itemId} changed since the dry run (${outcome.reason}); nothing was removed`
      : `the settings changed since the preview (${outcome.reason}); nothing was written`,
  HOOKS_UNTRUSTED: (outcome) =>
    `the hooks of this head are not trusted (${outcome.reason}); nothing was staged or committed`,
  INDEX_NOT_CLEAN: () => 'the index already holds staged changes; nothing was staged or committed',
  STAGE_FAILED: () => 'staging the listed paths failed; the listed paths were unstaged',
  STAGED_SET_MISMATCH: () =>
    'the staged set differs from the listed paths; the listed paths were unstaged',
  STAGED_CONTENT_CHANGED: () =>
    'a staged blob differs from its expected object; the listed paths were unstaged',
  COMMIT_FAILED: () => 'the commit failed; the listed paths were unstaged',
  COMMIT_UNVERIFIED: (outcome) =>
    `commit ${outcome.commit} does not match the listed paths or left a staged index; nothing was amended`,
  SANDBOX_DENIED: (outcome) =>
    outcome.directory
      ? `the sandbox denied a write in ${outcome.directory}; nothing was touched`
      : 'the sandbox denied a write below .git; the listed paths were unstaged',
  REPORT_WRITE_FAILED: (outcome) =>
    `the report could not be written at step ${outcome.step}${outcome.guardCode ? ` (${outcome.guardCode})` : ''}; ${outcome.firstId} to ${outcome.lastId} stay reserved and unused, and no report of this call was left${outcome.foreignPath ? `; ${outcome.foreignPath} holds a file this call did not write` : ''}`,
  // `commit create` reports the commit it reached; a worktree item reports the record `status` it
  // was left in (`cleanup-failed` once a claim had to be reconciled).
  // A single-record write (`record-init`, `transition`) reports whether it landed (`written`), and
  // a release transition the residual paths its restore discarded.
  INTERRUPTED: (outcome) =>
    typeof outcome.written === 'boolean'
      ? `stopped by ${outcome.signal}; record ${outcome.recordId} ${outcome.written ? `was written as ${outcome.status}` : 'was not written'}${outcome.release ? ` after the release restored ${outcome.release.restored.length} residual path(s)` : ''}, and its lock was released`
      : outcome.status
        ? `stopped by ${outcome.signal}; record status ${outcome.status}, no further item was started`
        : `stopped by ${outcome.signal}${outcome.commit ? ` after commit ${outcome.commit}` : ' before a commit landed'}`,
  NOT_OWNER: (outcome) =>
    `record ${outcome.recordId} belongs to another session (${outcome.reason}); nothing was changed`,
  RECORD_EXISTS: (outcome) =>
    `record ${outcome.recordId} or its lock already exists; nothing was written`,
  RECORD_NOT_FOUND: (outcome) => `record ${outcome.recordId} does not exist; nothing was written`,
  TRANSITION_INVALID: (outcome) =>
    `${outcome.from} -> ${outcome.to} is not a valid lifecycle transition; nothing was written`,
  STATUS_MISMATCH: (outcome) =>
    `record ${outcome.recordId} is ${outcome.status}, not ${outcome.expected}; nothing was written`,
  NOT_ELIGIBLE: (outcome) =>
    `record ${outcome.recordId} is not eligible (${[
      ...(outcome.conditions ?? []).map((condition) => `condition ${condition}`),
      ...(outcome.proofs ?? []),
    ].join(', ')}); nothing was changed`,
  LEGACY_TRACKED: () =>
    'the legacy path holds tracked files; nothing was removed, remove them with git rm',
  LEGACY_UNMIGRATED: () =>
    'no runtime-migration marker certifies this legacy directory as its source; nothing was removed',
  CARRY_OVER_OPEN: () =>
    'carry-over is still open and no decision discards it; nothing was removed',
  REMOVE_FAILED: (outcome) =>
    `the worktree removal failed: ${outcome.reason}${outcome.removed ? '; the worktree itself was removed' : ''}`,
  BRANCH_RETAINED: (outcome) =>
    `branch ${outcome.branch?.branch ?? outcome.branch} was kept because its integration was not proven; the worktree and record were removed`,
  DEADLINE_REACHED: () =>
    'the deadline was reached before this item started; nothing was touched, rerun for the rest',
  LEDGER_EXISTS: (outcome) =>
    `the ledger of record ${outcome.recordId} already exists; nothing was written`,
});

function outcomeLine({ outcome, error }) {
  if (!outcome) return `${error.code}: ${error.message}`;
  if (LOCK_MESSAGES[outcome.code] && outcome.lock) {
    return `${outcome.code}: ${outcome.lock} lock ${LOCK_MESSAGES[outcome.code]}`;
  }
  return `${outcome.code}: ${OUTCOME_MESSAGES[outcome.code](outcome)}`;
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const operation = argv.length === 2 ? `${argv[0]} ${argv[1]}` : null;
  let envelope;
  try {
    if (!STATE_OPERATIONS.includes(operation)) throw new StateError('INVALID_INPUT', USAGE);
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin, operation));
    // The over-bound input has the keys of the size-bound result of `ledger init` itself, with
    // `bytes` the drained input size; `recordId` and `status` are null because the input was never
    // parsed and no record was read.
    envelope =
      input instanceof OverBound
        ? {
            ok: true,
            operation,
            result: {
              recordId: null,
              written: false,
              reason: 'size-bound',
              bytes: input.bytes,
              limitBytes: stdinLimitFor(operation).bytes,
              status: null,
            },
          }
        : await executeOperation(operation, input, {
            runner: io.runner ?? createProcessRunner(),
            env: process.env,
            signalTarget: process,
            terminateChildren: terminateActiveProcessGroups,
            ...io.deps,
          });
  } catch (error) {
    envelope = errorEnvelope(STATE_OPERATIONS.includes(operation) ? operation : null, error);
  }
  stdout.write(`${JSON.stringify(envelope)}\n`);
  if (!envelope.ok) {
    stderr.write(`${outcomeLine(envelope)}\n`);
    const exitCode = exitCodeFor(envelope);
    if (io.setExitCode) io.setExitCode(exitCode);
    else process.exitCode = exitCode;
  }
  return envelope;
}

// Runs only as the invoked script, so a test can import `main` and drive it with injected io.
function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) await main();
