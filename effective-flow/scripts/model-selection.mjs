#!/usr/bin/env node

// One JSON request on stdin, one envelope on stdout. This helper never writes runtime state.
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  MAX_STDIN_BYTES,
  MODEL_SELECTION_OPERATIONS,
  ModelSelectionError,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
} from './model-selection-core.mjs';

async function readStdin(stream) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_STDIN_BYTES)
      throw new ModelSelectionError('INVALID_INPUT', 'stdin exceeds the input size bound');
    chunks.push(buffer);
  }
  let input;
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    throw new ModelSelectionError(
      'INVALID_INPUT',
      'stdin must contain exactly one valid JSON object',
    );
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ModelSelectionError('INVALID_INPUT', 'stdin JSON must be an object');
  }
  return input;
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const operation = argv[0];
  let envelope;
  try {
    if (argv.length !== 1 || !MODEL_SELECTION_OPERATIONS.includes(operation)) {
      throw new ModelSelectionError(
        'INVALID_INPUT',
        'usage: model-selection.mjs <select|verify> (one JSON object on stdin)',
      );
    }
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    envelope = await executeOperation(operation, input, io.deps ?? {});
  } catch (error) {
    envelope = errorEnvelope(operation, error);
  }
  (io.stdout ?? process.stdout).write(`${JSON.stringify(envelope)}\n`);
  if (!envelope.ok)
    (io.stderr ?? process.stderr).write(`${envelope.error.code}: ${envelope.error.message}\n`);
  const exitCode = exitCodeFor(envelope);
  if (io.setExitCode) io.setExitCode(exitCode);
  else process.exitCode = exitCode;
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
