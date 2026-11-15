#!/usr/bin/env node

// Thin JSON CLI over repair-attempt-core.mjs:
//   node repair-attempt.mjs <scope-read|scope-check|attribute|post-check|record|evaluate>
//   (one JSON object on stdin)
// Writes exactly one `{ ok, operation, data }` envelope line to stdout and exits non-zero on
// failure. Input never travels as command-line arguments; only the operation name does. The
// ref-only git reads run through the shared process runner without a shell; this entry never
// fetches, so the base ref is as fresh as the gate's own ancestry-check fetch left it.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createProcessRunner } from './process-runner.mjs';
import {
  MAX_STDIN_BYTES,
  REPAIR_ATTEMPT_OPERATIONS,
  RepairAttemptError,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
} from './repair-attempt-core.mjs';

const USAGE = `usage: repair-attempt.mjs <${REPAIR_ATTEMPT_OPERATIONS.join('|')}> (input as one JSON object on stdin)`;

async function readStdin(stream = process.stdin) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_STDIN_BYTES) {
      throw new RepairAttemptError('INVALID_INPUT', `stdin exceeds ${MAX_STDIN_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw new RepairAttemptError('INVALID_INPUT', `invalid JSON input: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RepairAttemptError('INVALID_INPUT', 'stdin JSON must be an object');
  }
  return parsed;
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const operation = argv[0];
  let envelope;
  try {
    // Reject an unknown operation before waiting on stdin, so `--help` cannot block on a tty.
    if (argv.length !== 1 || !REPAIR_ATTEMPT_OPERATIONS.includes(operation)) {
      throw new RepairAttemptError('INVALID_INPUT', USAGE);
    }
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    envelope = await executeOperation(operation, input, {
      runner: io.runner ?? createProcessRunner(),
    });
  } catch (error) {
    envelope = errorEnvelope(operation, error);
  }
  stdout.write(`${JSON.stringify(envelope)}\n`);
  if (!envelope.ok) {
    stderr.write(`${envelope.error.code}: ${envelope.error.message}\n`);
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
