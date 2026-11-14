#!/usr/bin/env node

// Thin JSON CLI over verification-evidence-core.mjs:
//   node verification-evidence.mjs <evidence-build|evidence-parse|evidence-render>
//   (one JSON object on stdin)
// Writes exactly one JSON envelope line to stdout and exits non-zero when `ok` is false: 2 for
// `INVALID_INPUT` (a wrong call, an unknown operation, stdin that is not one JSON object or that
// exceeds `MAX_STDIN_BYTES`), 1 for `GIT_FAILED`, `MISSING_OBJECT` and `INTERNAL`. A rejected
// record is `ok: true` with `data.status: 'rejected'`. Input never travels as command-line
// arguments; only the operation name does. Git runs through the injected shared process runner
// without a shell, and only reads.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createProcessRunner } from './process-runner.mjs';
import {
  MAX_STDIN_BYTES,
  VERIFICATION_EVIDENCE_OPERATIONS,
  VerificationEvidenceError,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
} from './verification-evidence-core.mjs';

async function readStdin(stream = process.stdin) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_STDIN_BYTES) {
      throw new VerificationEvidenceError(
        'INVALID_INPUT',
        `stdin exceeds ${MAX_STDIN_BYTES} bytes`,
      );
    }
    chunks.push(buffer);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new VerificationEvidenceError('INVALID_INPUT', 'stdin is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new VerificationEvidenceError('INVALID_INPUT', 'stdin JSON must be an object');
  }
  return parsed;
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const operation = argv[0];
  let envelope;
  try {
    // Reject a wrong call or an unknown operation before waiting on stdin, so `--help` cannot
    // block on a tty.
    if (argv.length !== 1 || !VERIFICATION_EVIDENCE_OPERATIONS.includes(operation)) {
      throw new VerificationEvidenceError(
        'INVALID_INPUT',
        `usage: verification-evidence.mjs <${VERIFICATION_EVIDENCE_OPERATIONS.join('|')}> (input as one JSON object on stdin)`,
      );
    }
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    envelope = await executeOperation(operation, input, {
      runner: io.runner ?? createProcessRunner(),
      env: process.env,
      ...io.deps,
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
