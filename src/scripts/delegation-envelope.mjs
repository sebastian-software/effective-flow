#!/usr/bin/env node

// Thin JSON CLI over delegation-envelope-core.mjs:
//   node delegation-envelope.mjs <build|validate>   (one JSON object on stdin)
// Writes exactly one JSON envelope line to stdout and exits non-zero on failure. Input never
// travels as command-line arguments; only the operation name does.

import process from 'node:process';
import {
  DelegationEnvelopeError,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
} from './delegation-envelope-core.mjs';

async function readStdin(stream = process.stdin) {
  let value = '';
  stream.setEncoding('utf8');
  for await (const chunk of stream) value += chunk;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new DelegationEnvelopeError('INVALID_PAYLOAD', `invalid JSON input: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DelegationEnvelopeError('INVALID_PAYLOAD', 'stdin JSON must be an object');
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
      throw new DelegationEnvelopeError(
        'INVALID_PAYLOAD',
        'usage: delegation-envelope.mjs <build|validate> (input as one JSON object on stdin)',
      );
    }
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    envelope = await executeOperation(operation, input, io.deps ?? {});
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
