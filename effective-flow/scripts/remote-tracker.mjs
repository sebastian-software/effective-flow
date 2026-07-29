#!/usr/bin/env node

import process from 'node:process';
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { errorEnvelope, executeOperation, RemoteTrackerError } from './remote-tracker-core.mjs';

// A spawn against a missing working directory and a spawn of a missing executable both surface as
// ENOENT with the executable in `error.path`, so the core could not tell them apart. Detect the
// unusable directory here, at the single I/O boundary, and report it under its own code.
function isUsableDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// A bounded spawn is stopped with SIGTERM so the child can still flush and exit cleanly. SIGTERM is
// catchable and ignorable, though, so a child that swallows it would keep the run open — exactly the
// hang the bound exists to prevent. After this grace period the stop is forced with SIGKILL, which
// no process can refuse. One second is ample for a CLI that holds no state worth flushing.
const FORCED_KILL_GRACE_MS = 1000;

function createProcessRunner() {
  return ({ executable, args = [], stdin, cwd, env, timeoutMs }) =>
    new Promise((resolve) => {
      if (cwd !== undefined && !isUsableDirectory(cwd)) {
        resolve({
          status: null,
          stdout: '',
          stderr: '',
          error: { code: 'INVALID_CWD', path: cwd },
        });
        return;
      }
      const child = spawn(executable, args, {
        cwd,
        env: env ? { ...process.env, ...env } : process.env,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        // Only a plan that carries its own bound is bounded. A blocking provider watch has no
        // timeout flag of its own, so the limit travels with the plan and is enforced here, at the
        // single process boundary; every other spawn stays unbounded exactly as before.
        ...(timeoutMs === undefined ? {} : { timeout: timeoutMs, killSignal: 'SIGTERM' }),
      });
      let stdout = '';
      let stderr = '';
      let forcedKill = false;
      // Armed only for a bounded spawn, so an unbounded one creates no timer at all. It fires once,
      // after the bound plus the grace period, and is cleared as soon as the child is gone — a
      // child that stops on its own never sees it.
      const escalation =
        timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              if (child.exitCode === null && child.signalCode === null) {
                forcedKill = true;
                child.kill('SIGKILL');
              }
            }, timeoutMs + FORCED_KILL_GRACE_MS);
      const settle = (result) => {
        if (escalation !== undefined) clearTimeout(escalation);
        resolve(forcedKill ? { ...result, forcedKill: true } : result);
      };
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.on('error', (error) => settle({ status: null, stdout, stderr, error }));
      // The terminating signal travels with the result: a child killed on its bound exits with a
      // null status, and only the signal distinguishes that bounded stop from a crash.
      child.on('close', (status, signal) => settle({ status, signal, stdout, stderr }));
      child.stdin.end(stdin);
    });
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
