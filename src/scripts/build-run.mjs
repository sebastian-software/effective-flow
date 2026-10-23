#!/usr/bin/env node
// One JSON request on stdin; one JSON envelope on stdout. Only the operation travels in argv.
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  BUILD_RUN_OPERATIONS,
  MAX_CONTROL_BYTES,
  BuildRunError,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
} from './build-run-core.mjs';
import { createProcessRunner } from './process-runner.mjs';

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  let envelope;
  try {
    if (argv.length !== 1 || !BUILD_RUN_OPERATIONS.includes(argv[0]))
      throw new BuildRunError(
        'INVALID_OPERATION',
        `usage: build-run.mjs <${BUILD_RUN_OPERATIONS.join('|')}> (one JSON object on stdin)`,
      );
    let input = io.input;
    if (input === undefined) {
      const chunks = [];
      const boundedValidation = [
        'validation-await-admission',
        'validation-request',
        'validation-result',
      ].includes(argv[0]);
      let byteLength = 0;
      for await (const chunk of io.stdin ?? process.stdin) {
        const bytes = Buffer.from(chunk);
        byteLength += bytes.length;
        if (boundedValidation && byteLength > MAX_CONTROL_BYTES)
          throw new BuildRunError('TOO_LARGE', 'validation control exceeds 16384 UTF-8 bytes');
        chunks.push(bytes);
      }
      try {
        const bytes = Buffer.concat(chunks);
        input = JSON.parse(
          boundedValidation
            ? new TextDecoder('utf-8', { fatal: true }).decode(bytes)
            : bytes.toString('utf8'),
        );
      } catch {
        throw new BuildRunError('INVALID_PAYLOAD', 'stdin must contain one valid JSON object');
      }
    }
    envelope = await executeOperation(argv[0], input, {
      runner: createProcessRunner(),
      ...io.deps,
    });
  } catch (error) {
    envelope = errorEnvelope(argv[0], error);
  }
  stdout.write(`${JSON.stringify(envelope)}\n`);
  if (!envelope.ok) {
    stderr.write(`${envelope.error.code}: ${envelope.error.message}\n`);
    if (io.setExitCode) io.setExitCode(exitCodeFor(envelope));
    else process.exitCode = exitCodeFor(envelope);
  }
  return envelope;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
