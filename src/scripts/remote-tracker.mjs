#!/usr/bin/env node

import process from 'node:process';
import { createProcessRunner } from './process-runner.mjs';
import { errorEnvelope, executeOperation, RemoteTrackerError } from './remote-tracker-core.mjs';

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

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const operation = argv.find((argument) => !argument.startsWith('-'));
  const apply = argv.includes('--apply');
  let envelope;
  try {
    if (!operation) {
      const error = new Error('usage: remote-tracker.mjs <operation> [--apply]');
      error.code = 'INVALID_PAYLOAD';
      throw error;
    }
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    envelope = await executeOperation(operation, input, {
      apply,
      runner: io.runner ?? createProcessRunner(),
      sleeper: io.sleeper,
      clock: io.clock,
      skipProbe: io.skipProbe,
    });
  } catch (error) {
    envelope = errorEnvelope(
      operation ?? null,
      new RemoteTrackerError(error.code ?? 'INVALID_PAYLOAD', error.message),
    );
  }
  stdout.write(`${JSON.stringify(envelope)}\n`);
  if (!envelope.ok) {
    if (io.setExitCode) io.setExitCode(1);
    else process.exitCode = 1;
    if (io.debug === true) stderr.write(`${envelope.error.message}\n`);
  }
  return envelope;
}

await main();
