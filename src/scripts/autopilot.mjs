#!/usr/bin/env node

// Thin JSON CLI over autopilot-core.mjs:
//   node autopilot.mjs <run-init|decision-classify|decision-extract|decision-record|blocker-record|
//                       fit-record|base-move-record|delivery-base-check|delivery-base-record|
//                       plan-reviewed|delivery-record|delivery-confirm|consent-check|run-check|
//                       pr-appendix|appendix-merge|plan-copy-restore|run-close|ledger-list|
//                       ledger-prune>
//   (one JSON object on stdin; `appendix-merge` takes `{cwd, runId, appendixSha256, body}`,
//   `plan-reviewed` and `plan-copy-restore` take `{cwd, runId, sourceRoot}`,
//   `delivery-base-check` takes `{cwd, runId, headOid, baseRef}`)
// Writes exactly one `{ ok, operation, data | error }` envelope line to stdout and exits non-zero
// on failure: 2 for a rejected input or score set or a run that is not open, 1 otherwise. Input never travels as
// command-line arguments; only the operation name does. The ledger operations run their
// runtime-state guard's git checks, `plan-copy-restore` its git reads and its restore, and
// `delivery-base-check`, `delivery-base-record` and `delivery-confirm` their git reads, through
// the shared process runner without a shell.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createProcessRunner, terminateActiveProcessGroups } from './process-runner.mjs';
import {
  AUTOPILOT_OPERATIONS,
  AutopilotError,
  MAX_STDIN_BYTES,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
} from './autopilot-core.mjs';

const USAGE = `usage: autopilot.mjs <${AUTOPILOT_OPERATIONS.join('|')}> (input as one JSON object on stdin; appendix-merge: {cwd, runId, appendixSha256, body})`;

async function readStdin(stream = process.stdin) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_STDIN_BYTES) {
      throw new AutopilotError('INVALID_INPUT', `stdin exceeds ${MAX_STDIN_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw new AutopilotError('INVALID_INPUT', `invalid JSON input: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AutopilotError('INVALID_INPUT', 'stdin JSON must be an object');
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
    if (argv.length !== 1 || !AUTOPILOT_OPERATIONS.includes(operation)) {
      throw new AutopilotError('INVALID_INPUT', USAGE);
    }
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    envelope = await executeOperation(operation, input, {
      runner: io.runner ?? createProcessRunner(),
      ...(io.options ?? {}),
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
