#!/usr/bin/env node

// Thin JSON CLI over config-resolve-core.mjs:
//   node config-resolve.mjs resolve   (one JSON object on stdin: { cwd, tool, mode? })
//   `mode` is required for iterate (local|pr) and apply-review (local|remote); setup accepts
//   `standard`, which resolves through locator steps 1 to 4 only.
// Writes exactly one JSON envelope line to stdout and exits non-zero on failure: 2 for invalid
// input, 3 for an unverifiable or unsafe runtime-state root, 1 otherwise. Input never travels as
// command-line arguments; only the operation name does. Git runs through an injected runner
// without a shell, and nothing is written.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  CONFIG_RESOLVE_OPERATIONS,
  ConfigResolveError,
  MAX_STDIN_BYTES,
  createProcessRunner,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
} from './config-resolve-core.mjs';

async function readStdin(stream = process.stdin) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_STDIN_BYTES) {
      throw new ConfigResolveError('INVALID_INPUT', `stdin exceeds ${MAX_STDIN_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw new ConfigResolveError('INVALID_INPUT', `invalid JSON input: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigResolveError('INVALID_INPUT', 'stdin JSON must be an object');
  }
  return parsed;
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const operation = argv[0];
  let envelope;
  try {
    // Reject bad usage before waiting on stdin, so `--help` cannot block on a tty.
    if (argv.length !== 1 || !CONFIG_RESOLVE_OPERATIONS.includes(operation)) {
      throw new ConfigResolveError(
        'INVALID_INPUT',
        `usage: config-resolve.mjs <${CONFIG_RESOLVE_OPERATIONS.join('|')}> (input as one JSON object on stdin)`,
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

// Runs only as the invoked script, so a test can import `main` and drive it with injected io.
function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) await main();
