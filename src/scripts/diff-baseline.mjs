#!/usr/bin/env node

// Thin JSON CLI over diff-baseline-core.mjs:
//   node diff-baseline.mjs <capture|render|discard>   (one JSON object on stdin)
// Writes exactly one JSON envelope line to stdout and exits non-zero on failure. Input never
// travels as command-line arguments; only the operation name does. Git runs through an injected
// runner without a shell.

import process from 'node:process';
import {
  DIFF_BASELINE_OPERATIONS,
  DiffBaselineError,
  MAX_STDIN_BYTES,
  createProcessRunner,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
} from './diff-baseline-core.mjs';

async function readStdin(stream = process.stdin) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_STDIN_BYTES) {
      throw new DiffBaselineError('INVALID_INPUT', `stdin exceeds ${MAX_STDIN_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw new DiffBaselineError('INVALID_INPUT', `invalid JSON input: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DiffBaselineError('INVALID_INPUT', 'stdin JSON must be an object');
  }
  return parsed;
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const operation = argv[0];
  let envelope;
  try {
    if (argv.length !== 1 || !DIFF_BASELINE_OPERATIONS.includes(operation)) {
      throw new DiffBaselineError(
        'INVALID_INPUT',
        `usage: diff-baseline.mjs <${DIFF_BASELINE_OPERATIONS.join('|')}> (input as one JSON object on stdin)`,
      );
    }
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    const deps = { runner: createProcessRunner(), env: process.env, ...(io.deps ?? {}) };
    envelope = await executeOperation(operation, input, deps);
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

await main();
