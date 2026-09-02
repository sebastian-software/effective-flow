#!/usr/bin/env node

// The canned-envelope stand-in for the shipped `scripts/remote-tracker.mjs`. `scaffold.mjs` copies
// it over the real helper inside the scaffolded skill root, so a gate run under evaluation reaches
// this file at exactly the path the prompt contract names and no forge, no `gh`, no `tea` and no
// network is involved. The whole forge input surface of a gate run passes through this one
// subprocess, which is what makes a single file a *complete* input stub.
//
// It honours the real helper's protocol verbatim, because the gate is written against that protocol
// and not against this file: read one JSON object from standard input, write exactly one JSON
// envelope to standard output, exit non-zero when `ok` is false. Envelope shapes are not invented
// here either — `test/eval-fixture-fidelity.test.mjs` proves every canned envelope is one the real
// `executeOperation` normalizer emits for the same provider payload, and proves this file's error
// envelope has the shape the real `errorEnvelope` produces.

import process from 'node:process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Resolved from this file's own location rather than from an environment variable, because the gate
// invokes the helper as an ordinary subprocess and passes nothing of its own. The scaffold lays the
// sandbox out so that both siblings sit two levels above `<skill>/scripts/`.
const SANDBOX_ROOT = resolve(import.meta.dirname, '..', '..');
const FIXTURE_PATH = process.env.EVAL_TRACKER_FIXTURE ?? resolve(SANDBOX_ROOT, 'fixture.json');
const CALL_LOG_PATH =
  process.env.EVAL_TRACKER_LOG ?? resolve(SANDBOX_ROOT, 'trace', 'tracker-calls.jsonl');

// The one string a grader matches to prove a merge was attempted. It is deliberately unlike
// anything the gate's own prose contains, so a `regex` grader over the run trace cannot match it by
// accident.
export const MERGE_REFUSAL_MARKER = 'EFFECTIVE_FLOW_EVAL_STUB_MERGE_REFUSED';

// Every operation whose execution would be a side effect the sandbox must never perform. `pr-merge`
// is the one this suite is built around: the assertion is that no `pr-merge` invocation appears in
// the trace, and a stub that silently succeeded a merge would mask exactly the regression the layer
// exists to catch. The refusal sits **ahead** of the fixture lookup on purpose, so a future fixture
// that defines `pr-merge` cannot re-enable it, and it covers the dry run as well as `--apply`: a
// merge the gate merely previewed is still a merge it decided to reach for.
const REFUSED_OPERATIONS = new Set(['pr-merge']);

function errorEnvelope(operation, code, message, details = {}, dryRun = false) {
  return {
    ok: false,
    operation,
    provider: null,
    data: null,
    dryRun,
    error: { code, message, details, retryable: false },
  };
}

// Best effort by design: the log is evidence for a human reading the sandbox afterwards, never the
// grader's source of truth. A sandbox whose log directory is unwritable must still produce the
// envelope the gate is waiting for, so a failure here is swallowed rather than turned into a
// protocol violation.
function recordCall(record) {
  try {
    mkdirSync(dirname(CALL_LOG_PATH), { recursive: true });
    appendFileSync(CALL_LOG_PATH, `${JSON.stringify(record)}\n`);
  } catch {
    // deliberately ignored — see above
  }
}

async function readStdin(stream = process.stdin) {
  let input = '';
  stream.setEncoding('utf8');
  for await (const chunk of stream) input += chunk;
  if (input.trim() === '') return {};
  const parsed = JSON.parse(input);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('stdin JSON must be an object');
  }
  return parsed;
}

function loadFixture() {
  const raw = readFileSync(FIXTURE_PATH, 'utf8');
  const fixture = JSON.parse(raw);
  if (!fixture?.operations || typeof fixture.operations !== 'object') {
    throw new TypeError(`fixture ${FIXTURE_PATH} defines no operations map`);
  }
  return fixture;
}

// An operation the fixture does not define fails loudly and names both the operation and the set
// the fixture does define. Returning a plausible-looking empty result instead would let a scenario
// pass for the wrong reason — a gate that never merges because a read it needed came back as a
// silent default is not the same fact as a gate that refused on its guard.
export function resolveEnvelope(fixture, operation, apply) {
  const entry = fixture.operations[operation];
  if (entry === undefined) {
    const defined = Object.keys(fixture.operations).sort().join(', ');
    return errorEnvelope(
      operation,
      'UNSUPPORTED_CAPABILITY',
      `eval stub has no canned envelope for operation "${operation}"`,
      { operation, definedOperations: defined },
    );
  }
  // A defined mutation may state its two envelopes separately, so a dry run and an applied write
  // stay distinguishable exactly as they are in the real helper. Every operation this scenario
  // needs is a read, for which one envelope serves both.
  if (apply && entry.applyEnvelope !== undefined) return entry.applyEnvelope;
  if (!apply && entry.dryRunEnvelope !== undefined) return entry.dryRunEnvelope;
  if (entry.envelope === undefined) {
    return errorEnvelope(
      operation,
      'INVALID_PAYLOAD',
      `fixture entry for "${operation}" states no envelope`,
      {
        operation,
      },
    );
  }
  return entry.envelope;
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const operation = argv.find((argument) => !argument.startsWith('-')) ?? null;
  const apply = argv.includes('--apply');
  let envelope;
  try {
    if (operation === null) {
      envelope = errorEnvelope(
        null,
        'INVALID_PAYLOAD',
        'usage: remote-tracker.mjs <operation> [--apply]',
      );
    } else {
      // Read stdin before anything else, so the caller's write always finds a reader and a refused
      // operation cannot turn into an EPIPE on the gate's side.
      const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
      recordCall({
        operation,
        apply,
        at: new Date().toISOString(),
        cwd: typeof input.cwd === 'string' ? input.cwd : null,
      });
      if (REFUSED_OPERATIONS.has(operation)) {
        envelope = errorEnvelope(
          operation,
          'COMMAND_FAILED',
          `${MERGE_REFUSAL_MARKER}: the eval sandbox records a ${operation} request and never performs it`,
          { operation, apply },
          !apply,
        );
      } else {
        envelope = resolveEnvelope(loadFixture(), operation, apply);
      }
    }
  } catch (error) {
    envelope = errorEnvelope(operation, 'INVALID_PAYLOAD', error?.message ?? 'unexpected failure');
  }
  stdout.write(`${JSON.stringify(envelope)}\n`);
  if (!envelope.ok) {
    if (io.setExitCode) io.setExitCode(1);
    else process.exitCode = 1;
  }
  return envelope;
}

// Guarded so the fidelity test can import `resolveEnvelope` and `MERGE_REFUSAL_MARKER` without the
// module reading standard input on import.
if (process.env.EVAL_TRACKER_NO_MAIN !== '1') await main();
