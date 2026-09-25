#!/usr/bin/env node

import { spawn } from 'node:child_process';
import process from 'node:process';
import {
  PILOT_MEASUREMENT_OPERATIONS,
  PilotMeasurementError,
  errorEnvelope,
  executeOperation,
} from './pilot-measurement-core.mjs';
import { PILOT_MEASUREMENT_PROTOCOL } from './pilot-measurement-protocol.mjs';

function createProcessRunner() {
  return ({ executable, args = [], stdin, cwd }) =>
    new Promise((resolve) => {
      const child = spawn(executable, args, {
        cwd,
        env: process.env,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const stdout = [];
      const stderr = [];
      child.stdout.on('data', (chunk) => stdout.push(chunk));
      child.stderr.on('data', (chunk) => stderr.push(chunk));
      child.on('error', (error) =>
        resolve({
          status: null,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
          error,
        }),
      );
      child.on('close', (status) =>
        resolve({ status, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }),
      );
      child.stdin.on('error', () => {});
      child.stdin.end(stdin);
    });
}

async function readStdin(stream = process.stdin) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > PILOT_MEASUREMENT_PROTOCOL.limits.maxCliInputBytes) {
      throw new PilotMeasurementError('CAPACITY_EXHAUSTED');
    }
    chunks.push(buffer);
  }
  const source = Buffer.concat(chunks).toString('utf8');
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new PilotMeasurementError('INVALID_PAYLOAD', { cause: error });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PilotMeasurementError('INVALID_PAYLOAD');
  }
  return parsed;
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const operation = argv[0];
  let envelope;
  try {
    if (argv.length !== 1 || !PILOT_MEASUREMENT_OPERATIONS.includes(operation)) {
      throw new PilotMeasurementError('INVALID_OPERATION');
    }
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    envelope = await executeOperation(operation, input, {
      runner: io.runner ?? createProcessRunner(),
      randomBytes: io.randomBytes,
      nowMs: io.nowMs,
      monotonicNs: io.monotonicNs,
      uptimeSeconds: io.uptimeSeconds,
      hostname: io.hostname,
      kill: io.kill,
    });
  } catch (error) {
    envelope = errorEnvelope(operation, error);
  }
  stdout.write(`${JSON.stringify(envelope)}\n`);
  if (!envelope.ok) {
    stderr.write(`${envelope.error.code}: ${envelope.error.message}\n`);
    if (io.setExitCode) io.setExitCode(envelope.error.exitCode);
    else process.exitCode = envelope.error.exitCode;
  }
  return envelope;
}

await main();
