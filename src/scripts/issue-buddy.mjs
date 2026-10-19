#!/usr/bin/env node
// One stdin JSON object, one stdout envelope; the core owns validation and local state.
// Operations: pass-lock-acquire, pass-lock-release, pass-collect, verdict-record, pass-report,
// and fingerprint. `pass-collect` accepts optional repository visibility and leftover-plan
// metadata; `pass-report` emits those fields only when the caller opts into `reportVersion: 2`.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createProcessRunner, terminateActiveProcessGroups } from './process-runner.mjs';
import {
  ISSUE_BUDDY_OPERATIONS,
  IssueBuddyError,
  errorEnvelope,
  executeOperation,
} from './issue-buddy-core.mjs';
export async function main(argv = process.argv.slice(2), io = {}) {
  const operation = argv[0];
  let envelope;
  try {
    if (argv.length !== 1 || !ISSUE_BUDDY_OPERATIONS.includes(operation))
      throw new IssueBuddyError(
        'INVALID_PAYLOAD',
        `usage: issue-buddy.mjs <${ISSUE_BUDDY_OPERATIONS.join('|')}> (one JSON object on stdin)`,
      );
    let input = io.input;
    if (input === undefined) {
      let bytes = '';
      const stdin = io.stdin ?? process.stdin;
      stdin.setEncoding('utf8');
      for await (const chunk of stdin) bytes += chunk;
      try {
        input = JSON.parse(bytes);
      } catch {
        throw new IssueBuddyError('INVALID_PAYLOAD', 'stdin must contain one JSON object');
      }
    }
    envelope = await executeOperation(operation, input, {
      runner: io.runner ?? createProcessRunner(),
      ...(io.options ?? {}),
    });
  } catch (error) {
    envelope = errorEnvelope(operation ?? null, error);
  }
  (io.stdout ?? process.stdout).write(`${JSON.stringify(envelope)}\n`);
  if (!envelope.ok) {
    (io.stderr ?? process.stderr).write(`${envelope.error.code}: ${envelope.error.message}\n`);
    if (io.setExitCode) io.setExitCode(1);
    else process.exitCode = 1;
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
if (invokedDirectly()) {
  process.on('exit', () => terminateActiveProcessGroups('SIGKILL'));
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ])
    process.once(signal, () => {
      terminateActiveProcessGroups('SIGKILL');
      process.exit(code);
    });
  await main();
}
