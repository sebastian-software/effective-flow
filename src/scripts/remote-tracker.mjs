#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createProcessRunner, terminateActiveProcessGroups } from './process-runner.mjs';
import {
  errorEnvelope,
  executeOperation,
  isMutationOperation,
  REMOTE_TRACKER_OPERATIONS,
  RemoteTrackerError,
} from './remote-tracker-core.mjs';

// The closed argv: exactly `<operation>` or `<operation> --apply`, the operation first and one of
// REMOTE_TRACKER_OPERATIONS, and `--apply` only for a forge mutation. Anything else is refused
// before stdin is read, so an allow rule's trailing `*` admits only the here-string and never a
// second operation or an `--apply` on a read, a mistyped operation never waits on stdin, and
// `--help` never blocks on a tty.
export const USAGE = 'usage: remote-tracker.mjs <operation> [--apply]';

export function parseArgv(argv) {
  const [operation, flag, ...rest] = argv;
  const usage = (message) => {
    const error = new Error(`${message}; ${USAGE}`);
    error.code = 'INVALID_PAYLOAD';
    throw error;
  };
  if (typeof operation !== 'string' || operation === '' || operation.startsWith('-')) {
    usage('the operation must be the first argument');
  }
  if (!REMOTE_TRACKER_OPERATIONS.includes(operation)) {
    usage(`${operation} is not a remote-tracker operation`);
  }
  if (rest.length > 0 || (flag !== undefined && flag !== '--apply')) {
    usage('only <operation> or <operation> --apply is accepted');
  }
  if (flag === '--apply' && !isMutationOperation(operation)) {
    usage(`--apply is accepted only for a mutation, and ${operation} is none`);
  }
  return { operation, apply: flag === '--apply' };
}

async function readStdin(stream = process.stdin) {
  let input = '';
  stream.setEncoding('utf8');
  for await (const chunk of stream) input += chunk;
  if (input.trim() === '') return {};
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new TypeError('stdin JSON must be an object');
    }
    return parsed;
  } catch (error) {
    const failure = new Error(`invalid JSON input: ${error.message}`);
    failure.code = 'INVALID_PAYLOAD';
    throw failure;
  }
}

// Polling subprocesses run in detached groups so their timeout reaches descendants too. Install
// handlers only once such a call starts, and retain them through sleeps until this operation ends.
// A signal stops the groups and the CLI (including its sleep timer), writing no success envelope.
export function forwardTermination(
  target = process,
  terminate = terminateActiveProcessGroups,
  { stdout = process.stdout, run = { operation: null, envelopeWritten: false } } = {},
) {
  const onExit = () => terminate('SIGKILL');
  const handlers = [];
  target.on('exit', onExit);
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    const handler = () => {
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
      const fallback = setTimeout(exit, 1000);
      fallback.unref?.();
      stdout.write(
        `${JSON.stringify(errorEnvelope(run.operation, new RemoteTrackerError('INTERRUPTED', `stopped by ${signal}`)))}\n`,
        exit,
      );
    };
    target.once(signal, handler);
    handlers.push([signal, handler]);
  }
  return () => {
    target.off('exit', onExit);
    for (const [signal, handler] of handlers) target.off(signal, handler);
  };
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const first = argv[0];
  const operation = typeof first === 'string' && !first.startsWith('-') ? first : undefined;
  const run = { operation: operation ?? null, envelopeWritten: false };
  let removeTermination;
  let envelope;
  try {
    const { apply } = parseArgv(argv);
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    const baseRunner = io.runner ?? createProcessRunner();
    envelope = await executeOperation(operation, input, {
      apply,
      runner: (call) => {
        if (call.processGroup === true && removeTermination === undefined) {
          removeTermination = forwardTermination(process, terminateActiveProcessGroups, {
            stdout,
            run,
          });
        }
        return baseRunner(call);
      },
      sleeper: io.sleeper,
      clock: io.clock,
      skipProbe: io.skipProbe,
    });
  } catch (error) {
    envelope = errorEnvelope(
      operation ?? null,
      new RemoteTrackerError(error.code ?? 'INVALID_PAYLOAD', error.message),
    );
  } finally {
    removeTermination?.();
  }
  if (run.envelopeWritten) return envelope;
  run.envelopeWritten = true;
  stdout.write(`${JSON.stringify(envelope)}\n`);
  if (!envelope.ok) {
    if (io.setExitCode) io.setExitCode(1);
    else process.exitCode = 1;
    if (io.debug === true) stderr.write(`${envelope.error.message}\n`);
  }
  return envelope;
}

function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) await main();
