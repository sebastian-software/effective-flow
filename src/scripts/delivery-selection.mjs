#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import process from 'node:process';
import {
  DeliverySelectionError,
  errorEnvelope,
  executeOperation,
  isDryRun,
} from './delivery-selection-core.mjs';

function isUsableDirectory(value) {
  try {
    return statSync(value).isDirectory();
  } catch {
    return false;
  }
}

const TIMEOUT_KILL_SIGNAL = 'SIGKILL';

function createProcessRunner() {
  return ({ executable, args = [], stdin, cwd, env, timeout }) =>
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
      const startedAt = Date.now();
      const child = spawn(executable, args, {
        cwd,
        // Extra variables extend the inherited environment so Git keeps HOME, PATH and friends.
        env: env === undefined ? process.env : { ...process.env, ...env },
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        // A bounded call (the upstream fetch) is killed outright once its budget is spent.
        ...(timeout === undefined ? {} : { timeout, killSignal: TIMEOUT_KILL_SIGNAL }),
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
          // Same shape as `spawnSync`: a call killed by its own timeout reports `ETIMEDOUT`.
          ...(timeout !== undefined &&
          signal === TIMEOUT_KILL_SIGNAL &&
          Date.now() - startedAt >= timeout
            ? { timedOut: true, error: { code: 'ETIMEDOUT' } }
            : {}),
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
        'usage: delivery-selection.mjs <inventory|bind-manifest|verify-source|transfer|reconcile|upstream-status|fast-forward> [--apply]',
      );
    }
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    envelope = await executeOperation(operation, input, {
      runner: io.runner ?? createProcessRunner(),
      apply,
    });
  } catch (error) {
    envelope = errorEnvelope(operation, error, isDryRun(operation, apply));
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
