#!/usr/bin/env node

// Thin JSON CLI over plan-publication-core.mjs:
//   node plan-publication.mjs <operation> [--apply]   (one JSON object on stdin)
// Operations: scan, branch-name, assert-changeset, publish, complete-branch, inspect-branch. `inspect-branch`
// is read-only and may bind its result to `expectedBaseOid`; `publish` accepts `expectedBaseOid`
// and `expectedBlobOid`, while `complete-branch` accepts `expectedBaseOid` and `expectedTipOid`.
// `publish` and `complete-branch` stay a dry run unless `--apply` is passed. Writes exactly one JSON envelope
// line to stdout and exits non-zero on failure. Input never travels as command-line arguments;
// only the operation name and `--apply` do.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createProcessRunner, terminateActiveProcessGroups } from './process-runner.mjs';
import {
  MUTATING_PLAN_PUBLICATION_OPERATIONS,
  PLAN_PUBLICATION_OPERATIONS,
  PlanPublicationError,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
} from './plan-publication-core.mjs';

const USAGE =
  'usage: plan-publication.mjs <scan|branch-name|assert-changeset|publish|complete-branch|inspect-branch> [--apply] (input as one JSON object on stdin)';

async function readStdin(stream = process.stdin) {
  let value = '';
  stream.setEncoding('utf8');
  for await (const chunk of stream) value += chunk;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new PlanPublicationError('INVALID_INPUT', `invalid JSON input: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PlanPublicationError('INVALID_INPUT', 'stdin JSON must be an object');
  }
  return parsed;
}

// The run in flight, as far as a signal handler must know it: the operation, its `dryRun` flag,
// and whether the run's one envelope line was already written.
const cliRun = { operation: null, dryRun: false, envelopeWritten: false };

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const run = io.run ?? cliRun;
  const operation = argv[0];
  const flags = argv.slice(1);
  const apply = flags.includes('--apply');
  run.operation = PLAN_PUBLICATION_OPERATIONS.includes(operation) ? operation : null;
  run.dryRun = MUTATING_PLAN_PUBLICATION_OPERATIONS.includes(operation) && !apply;
  run.envelopeWritten = false;
  let envelope;
  try {
    if (!operation || flags.some((flag) => flag !== '--apply') || flags.length > 1) {
      throw new PlanPublicationError('INVALID_INPUT', USAGE);
    }
    // Reject an unknown operation before waiting on stdin, so `--help` cannot block on a tty.
    if (!PLAN_PUBLICATION_OPERATIONS.includes(operation)) {
      throw new PlanPublicationError('INVALID_INPUT', `unknown operation: ${operation}`);
    }
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    envelope = await executeOperation(operation, input, {
      apply,
      runner: io.runner ?? createProcessRunner(),
    });
  } catch (error) {
    envelope = errorEnvelope(operation, error, false);
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

// A bounded Git call runs detached in its own process group, so a signal that stops this CLI does
// not reach it. Stopping the CLI therefore stops every group still in flight first. Unless the run
// already wrote its envelope, it then writes one `INTERRUPTED` envelope with state `unknown`, since
// a stopped push or pull-request create may or may not have landed; SIGINT and SIGTERM exit with the
// conventional 128 + signal number once that line is flushed, or after a short bound if it is not.
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
        new PlanPublicationError('INTERRUPTED', `stopped by ${signal}`, { state: 'unknown' }),
        run.dryRun,
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
