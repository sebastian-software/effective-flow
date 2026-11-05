#!/usr/bin/env node

// Thin JSON CLI over effective-flow-mechanics-core.mjs:
//   node effective-flow-mechanics.mjs <operation>   (one JSON object on stdin)
// Operations: base-branch-resolve, base-branch-fetch, name-allocate, delivery-branch-name,
// adr-observe, adr-allocate, plan-reference-resolve. Each operation has its own name, so each is
// its own command prefix; only `base-branch-fetch` updates refs (through `git fetch`). Writes
// exactly one JSON envelope line to stdout and exits 2 for invalid input, 3 for an unsafe path,
// and 1 for any other failure. Input never travels as command-line arguments; only the operation
// name does.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createProcessRunner, terminateActiveProcessGroups } from './process-runner.mjs';
import {
  MAX_STDIN_BYTES,
  MECHANICS_OPERATIONS,
  MechanicsError,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
} from './effective-flow-mechanics-core.mjs';

const USAGE = `usage: effective-flow-mechanics.mjs <${MECHANICS_OPERATIONS.join('|')}> (input as one JSON object on stdin)`;

async function readStdin(stream = process.stdin) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_STDIN_BYTES) {
      throw new MechanicsError('INVALID_INPUT', `stdin exceeds ${MAX_STDIN_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw new MechanicsError('INVALID_INPUT', `invalid JSON input: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new MechanicsError('INVALID_INPUT', 'stdin JSON must be an object');
  }
  return parsed;
}

// The run in flight, as far as a signal handler must know it.
const cliRun = { operation: null, envelopeWritten: false };

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const run = io.run ?? cliRun;
  const operation = argv[0];
  run.operation = MECHANICS_OPERATIONS.includes(operation) ? operation : null;
  run.envelopeWritten = false;
  let envelope;
  try {
    // Reject bad usage before waiting on stdin, so `--help` cannot block on a tty.
    if (argv.length !== 1) throw new MechanicsError('INVALID_INPUT', USAGE);
    if (!MECHANICS_OPERATIONS.includes(operation)) {
      throw new MechanicsError('INVALID_INPUT', `unknown operation: ${operation}`);
    }
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    envelope = await executeOperation(operation, input, {
      runner: io.runner ?? createProcessRunner(),
      env: process.env,
      ...(io.deps ?? {}),
    });
  } catch (error) {
    envelope = errorEnvelope(operation, error);
  }
  // A signal handler already answered for this run with its own envelope.
  if (run.envelopeWritten) return envelope;
  run.envelopeWritten = true;
  stdout.write(`${JSON.stringify(envelope)}\n`);
  if (!envelope.ok) {
    stderr.write(`${envelope.error.code}: ${envelope.error.message}\n`);
    const exitCode = exitCodeFor(envelope);
    if (io.setExitCode) io.setExitCode(exitCode);
    else process.exitCode = exitCode;
  }
  return envelope;
}

// The bounded fetch runs detached in its own process group, so a signal that stops this CLI does
// not reach it. Stopping the CLI therefore stops every group still in flight first, then writes
// one `INTERRUPTED` envelope unless the run already wrote one, and exits with 128 + signal number
// once that line is flushed, or after a short bound if it is not.
const INTERRUPT_FLUSH_MS = 1000;

export function forwardTermination(
  target = process,
  terminate = terminateActiveProcessGroups,
  { stdout = process.stdout, run = cliRun } = {},
) {
  target.on('exit', () => terminate('SIGKILL'));
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    target.once(signal, () => {
      terminate('SIGKILL');
      if (run.envelopeWritten) {
        target.exit(code);
        return;
      }
      run.envelopeWritten = true;
      let exited = false;
      const exit = () => {
        if (exited) return;
        exited = true;
        clearTimeout(fallback);
        target.exit(code);
      };
      const fallback = setTimeout(exit, INTERRUPT_FLUSH_MS);
      fallback.unref?.();
      const envelope = errorEnvelope(
        run.operation,
        new MechanicsError('INTERRUPTED', `stopped by ${signal}`),
      );
      stdout.write(`${JSON.stringify(envelope)}\n`, exit);
    });
  }
}

// Runs only as the invoked script, so a test can import `main` and drive it with injected io.
function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  forwardTermination();
  await main();
}
