#!/usr/bin/env node

// Thin JSON CLI over conflict-validation-core.mjs:
//   node conflict-validation.mjs ci-detect           (stdin: { cwd, baseRef, base? })
//   node conflict-validation.mjs ci-integrity        (stdin: { cwd, baseRef, tree })
//   node conflict-validation.mjs ci-evidence-match   (stdin: { detection, checks, headSha })
//   node conflict-validation.mjs quick-marker-scan   (stdin: { cwd, baseRef, headSha })
// `baseRef` is the pull request's base branch name without a remote prefix; every Git operation
// reads the commit of `refs/remotes/origin/<baseRef>` and never fetches. `tree` is a full commit or
// tree object id, or `index` for the staged merge tree. `ci-evidence-match` reads no Git at all.
// `quick-marker-scan` lists the commits in `<merge base>..headSha` that carry the quick trailer.
// Writes exactly one JSON envelope line to stdout and exits 2 for invalid input and 1 for any other
// failure. Input never travels as command-line arguments; only the operation name does. Git runs
// through the injected runner without a shell and only reads objects; nothing is written. The
// runner is config-resolve's, which passes the core's stripped Git environment exactly; the shared
// `process-runner.mjs` would merge the inherited `GIT_*` variables back in.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createProcessRunner } from './config-resolve-core.mjs';
import {
  CONFLICT_VALIDATION_OPERATIONS,
  ConflictValidationError,
  MAX_STDIN_BYTES,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
} from './conflict-validation-core.mjs';

async function readStdin(stream = process.stdin) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_STDIN_BYTES) {
      throw new ConflictValidationError('INVALID_INPUT', `stdin exceeds ${MAX_STDIN_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw new ConflictValidationError('INVALID_INPUT', `invalid JSON input: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConflictValidationError('INVALID_INPUT', 'stdin JSON must be an object');
  }
  return parsed;
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const operation = argv[0];
  let envelope;
  try {
    // Reject bad usage before waiting on stdin, so `--help` cannot block on a tty.
    if (argv.length !== 1 || !CONFLICT_VALIDATION_OPERATIONS.includes(operation)) {
      throw new ConflictValidationError(
        'INVALID_INPUT',
        `usage: conflict-validation.mjs <${CONFLICT_VALIDATION_OPERATIONS.join('|')}> (input as one JSON object on stdin)`,
      );
    }
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    const deps = { runner: createProcessRunner(), env: process.env, ...(io.deps ?? {}) };
    envelope = await executeOperation(operation, input, deps);
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

if (invokedDirectly()) await main();
