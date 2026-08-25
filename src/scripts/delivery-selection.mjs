#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import process from 'node:process';
import {
  DeliverySelectionError,
  errorEnvelope,
  executeOperation,
} from './delivery-selection-core.mjs';

function isUsableDirectory(value) {
  try {
    return statSync(value).isDirectory();
  } catch {
    return false;
  }
}

function createProcessRunner() {
  return ({ executable, args = [], stdin, cwd }) =>
    new Promise((resolve) => {
      if (cwd !== undefined && !isUsableDirectory(cwd)) {
        resolve({
          status: null,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
          error: { code: 'INVALID_CWD', path: cwd },
        });
        return;
      }
      const child = spawn(executable, args, {
        cwd,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const stdout = [];
      const stderr = [];
      child.stdout.on('data', (chunk) => stdout.push(chunk));
      child.stderr.on('data', (chunk) => stderr.push(chunk));
      child.stdin.on('error', () => {});
      child.on('error', (error) =>
        resolve({
          status: null,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
          error,
        }),
      );
      child.on('close', (status, signal) =>
        resolve({
          status,
          signal,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
        }),
      );
      child.stdin.end(stdin);
    });
}

async function readStdin(stream = process.stdin) {
  let value = '';
  stream.setEncoding('utf8');
  for await (const chunk of stream) value += chunk;
  if (value.trim() === '') return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new TypeError('stdin JSON must be an object');
    }
    return parsed;
  } catch (error) {
    throw new DeliverySelectionError('INVALID_PAYLOAD', `invalid JSON input: ${error.message}`);
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
      throw new DeliverySelectionError(
        'INVALID_PAYLOAD',
        'usage: delivery-selection.mjs <inventory|bind-manifest|verify-source|transfer|reconcile> [--apply]',
      );
    }
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    envelope = await executeOperation(operation, input, {
      runner: io.runner ?? createProcessRunner(),
      apply,
    });
  } catch (error) {
    envelope = errorEnvelope(operation, error, operation === 'transfer' && !apply);
  }
  stdout.write(`${JSON.stringify(envelope)}\n`);
  if (!envelope.ok) {
    stderr.write(`${envelope.error.code}: ${envelope.error.message}\n`);
    const exitCode = envelope.error.exitCode ?? 1;
    if (io.setExitCode) io.setExitCode(exitCode);
    else process.exitCode = exitCode;
  }
  return envelope;
}

await main();
