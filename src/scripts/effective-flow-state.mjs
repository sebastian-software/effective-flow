#!/usr/bin/env node

// Thin JSON CLI over effective-flow-state-core.mjs:
//   node effective-flow-state.mjs lock <acquire|release|inspect|break> <<< '<json>'
//   node effective-flow-state.mjs memory <reserve|set-marker|migrate-directory> <<< '<json>'
//   node effective-flow-state.mjs harness allow-rules <<< '<json>'
// The operation is exactly these two argv tokens; any other argv, an extra token included, is
// rejected before stdin is read, so an allowlisted command prefix cannot be widened by an extra
// argument and `--help` never blocks on a tty. Stdin carries one JSON object of at most 64 KiB.
// Writes exactly one JSON envelope line to stdout and `CODE: message` to stderr on failure; the
// exit code is 0 on success, 4 for an outcome, and 1, 2 or 3 for an error.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createProcessRunner } from './process-runner.mjs';
import {
  MAX_STDIN_BYTES,
  STATE_OPERATIONS,
  StateError,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
} from './effective-flow-state-core.mjs';

const USAGE = `usage: effective-flow-state.mjs <${STATE_OPERATIONS.join('|')}> (input as one JSON object on stdin)`;

async function readStdin(stream = process.stdin) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_STDIN_BYTES) {
      throw new StateError('INVALID_INPUT', `stdin exceeds ${MAX_STDIN_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
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
    `the settings changed since the preview (${outcome.reason}); nothing was written`,
});

function outcomeLine({ outcome, error }) {
  if (!outcome) return `${error.code}: ${error.message}`;
  if (LOCK_MESSAGES[outcome.code]) {
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
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    envelope = await executeOperation(operation, input, {
      runner: io.runner ?? createProcessRunner(),
      env: process.env,
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
