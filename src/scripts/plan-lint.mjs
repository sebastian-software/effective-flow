#!/usr/bin/env node

// Thin JSON CLI over plan-lint-core.mjs:
//   node plan-lint.mjs lint   (one JSON object on stdin: { cwd, planDir, files? })
// Writes exactly one JSON envelope line to stdout and exits non-zero on failure. Input never
// travels as command-line arguments; only the operation name does.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  PLAN_LINT_OPERATIONS,
  PlanLintError,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
} from './plan-lint-core.mjs';

async function readStdin(stream = process.stdin) {
  let value = '';
  stream.setEncoding('utf8');
  for await (const chunk of stream) value += chunk;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new PlanLintError('INVALID_PAYLOAD', `invalid JSON input: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PlanLintError('INVALID_PAYLOAD', 'stdin JSON must be an object');
  }
  return parsed;
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const operation = argv[0];
  let envelope;
  try {
    if (argv.length !== 1 || !operation) {
      throw new PlanLintError(
        'INVALID_PAYLOAD',
        'usage: plan-lint.mjs lint (input as one JSON object on stdin)',
      );
    }
    // Reject an unknown operation before waiting on stdin, so `--help` cannot block on a tty.
    if (!PLAN_LINT_OPERATIONS.includes(operation)) {
      throw new PlanLintError('INVALID_PAYLOAD', `unknown operation: ${operation}`);
    }
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    envelope = executeOperation(operation, input, io.deps ?? {});
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
