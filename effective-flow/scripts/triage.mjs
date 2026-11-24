#!/usr/bin/env node
// Thin JSON CLI over triage-core.mjs:
//   node triage.mjs <operation> (stdin: one JSON object)
// Operations: permission-prove, inventory-build, verdicts-validate, report-write, write-set-build,
// write-set-apply, snapshot-remove, report-list, report-prune. Writes exactly one
// `{ ok, operation, data }` envelope line to stdout and exits non-zero on failure. Input never
// travels as command-line arguments; only the operation name does. A stdin object whose only key
// is `inputFile` names a runtime-state input file the core reads and removes instead.
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createProcessRunner, terminateActiveProcessGroups } from './process-runner.mjs';
import {
  TRIAGE_OPERATIONS,
  TriageError,
  MAX_INPUT_BYTES,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
} from './triage-core.mjs';

export const MAX_STDIN_BYTES = MAX_INPUT_BYTES;

async function readStdin(stream) {
  let value = '';
  let bytes = 0;
  stream.setEncoding('utf8');
  for await (const chunk of stream) {
    // A running count, so the bound costs one measurement per chunk rather than per buffer.
    bytes += Buffer.byteLength(chunk, 'utf8');
    if (bytes > MAX_STDIN_BYTES)
      throw new TriageError('INVALID_PAYLOAD', 'stdin exceeds the input bound');
    value += chunk;
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new TriageError('INVALID_PAYLOAD', 'stdin must contain one JSON object');
  }
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const operation = argv[0];
  let envelope;
  try {
    // An unknown operation is refused before stdin is read, so `--help` cannot block on a tty.
    if (argv.length !== 1 || !TRIAGE_OPERATIONS.includes(operation))
      throw new TriageError(
        'INVALID_PAYLOAD',
        `usage: triage.mjs <${TRIAGE_OPERATIONS.join('|')}> (one JSON object on stdin)`,
      );
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    envelope = await executeOperation(operation, input, {
      runner: io.runner ?? createProcessRunner(),
      ...io.deps,
    });
  } catch (error) {
    envelope = errorEnvelope(operation ?? null, error);
  }
  (io.stdout ?? process.stdout).write(`${JSON.stringify(envelope)}\n`);
  if (!envelope.ok) {
    (io.stderr ?? process.stderr).write(`${envelope.error.code}: ${envelope.error.message}\n`);
    const code = exitCodeFor(envelope);
    if (io.setExitCode) io.setExitCode(code);
    else process.exitCode = code;
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

if (invokedDirectly()) {
  process.on('exit', () => terminateActiveProcessGroups('SIGKILL'));
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ])
    process.once(signal, () => {
      terminateActiveProcessGroups('SIGKILL');
      process.exit(code);
    });
  await main();
}
