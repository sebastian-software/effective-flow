#!/usr/bin/env node

// Thin JSON CLI over capacity-wait-core.mjs:
//   node capacity-wait.mjs schedule     (stdin: { budgetMinutes, attempts, deadline?, firstRefusalAt?,
//                                                 now?, hostMaxWaitSeconds?, cancelled? })
//   node capacity-wait.mjs bind         (stdin: { cwd, workflow, runId, gate })
//   node capacity-wait.mjs verify       (stdin: { cwd, binding })
//   node capacity-wait.mjs forge-line   (stdin: { attempts })
// `schedule` and `forge-line` only compute. `bind` and `verify` read the checkout's identity through
// Git and the file system and write nothing. Writes exactly one JSON envelope line to stdout and
// exits 2 for invalid input and 1 for any other failure. Input never travels as command-line
// arguments; only the operation name does. The runner is config-resolve's, which passes the core's
// stripped Git environment exactly.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createProcessRunner } from './config-resolve-core.mjs';
import {
  CAPACITY_WAIT_OPERATIONS,
  CapacityWaitError,
  MAX_STDIN_BYTES,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
} from './capacity-wait-core.mjs';

async function readStdin(stream = process.stdin) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_STDIN_BYTES) {
      throw new CapacityWaitError('INVALID_INPUT', `stdin exceeds ${MAX_STDIN_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw new CapacityWaitError('INVALID_INPUT', `invalid JSON input: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CapacityWaitError('INVALID_INPUT', 'stdin JSON must be an object');
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
    if (argv.length !== 1 || !CAPACITY_WAIT_OPERATIONS.includes(operation)) {
      throw new CapacityWaitError(
        'INVALID_INPUT',
        `usage: capacity-wait.mjs <${CAPACITY_WAIT_OPERATIONS.join('|')}> (input as one JSON object on stdin)`,
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
