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

// The string a refused merge carries back to the gate, so the run's own report names why the merge
// did not happen instead of reporting an unexplained command failure. It is deliberately unlike
// anything the gate's own prose contains, so it cannot be confused with the gate's own wording. The
// assertion that no merge was requested is made against the call log, never against this string.
export const MERGE_REFUSAL_MARKER = 'EFFECTIVE_FLOW_EVAL_STUB_MERGE_REFUSED';

// Every operation whose execution would be a side effect the sandbox must never perform. `pr-merge`
// is the one this suite is built around, and it is the one operation this file decides for itself
// rather than looking up: every call is recorded either way, and what the fixture chooses is only
// whether the recorded call is answered with a refusal or with a canned success.
const REFUSABLE_OPERATIONS = new Set(['pr-merge']);

// The opt-in that turns a refusal into a served merge, read from the fixture's top level.
//
// Refusing was right while refusal was the only outcome any scenario expected. It stopped being
// enough once the suite needed a **positive control**: a scenario in which every precondition holds
// and the gate is supposed to merge, whose whole purpose is to fail if the gate — or this harness —
// refuses everything. That scenario cannot end in a stub refusal, because a refused merge is an
// error the gate then has to report, and the run would stop somewhere no scenario composed it to
// stop.
//
// The opt-in is per fixture and defaults to **off**, which is what keeps the refusal scenarios'
// protection intact: a fixture that does not set it gets the refusal whether or not it defines a
// `pr-merge` envelope, so a `pr-merge` entry added to a refusal fixture by accident cannot quietly
// re-enable the merge. A fixture that does set it must define the envelopes itself, and those are
// proven against the real normalizer by `test/eval-fixture-fidelity.test.mjs` like every other one.
//
// Nothing is merged in either case. The sandbox has no forge, and the served envelope is a canned
// document; what the flag changes is the answer the gate reads back, never a side effect.
export function servesMerge(fixture) {
  return fixture?.servesMerge === true;
}

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

// The log is the **evidence** every assertion in `test/merge-gate-eval.test.mjs` reads: a gate run
// is judged by what it asked this stub to do, not by anything it said. Its record shape is
// therefore a contract, pinned by `test/eval-fixture-fidelity.test.mjs` so a change here cannot
// silently reshape what those assertions consume.
//
// One JSON object per line, in this key set:
//
//   seq        1 for the first call in a log file, then one higher per recorded call
//   operation  the operation name as it arrived in argv
//   apply      whether `--apply` was passed, so a dry run and a write stay distinguishable
//   at         an ISO-8601 instant, for a human reading the sandbox; millisecond collisions make it
//              unusable for ordering, which is exactly why `seq` exists beside it
//   cwd        the working directory the caller stated, or null when it stated none
//
// The stub is a fresh process per call, so the counter cannot live in memory. It is derived from
// the lines already in the log instead: every recorded call appends exactly one line, so the count
// of lines already present is the number of the previous call, and one more is this call's. A log
// file that does not exist yet is the first call's normal case, not an error.
function nextSequenceNumber() {
  let existing;
  try {
    existing = readFileSync(CALL_LOG_PATH, 'utf8');
  } catch {
    return 1;
  }
  return existing.split('\n').filter((line) => line.trim() !== '').length + 1;
}

// Best effort by design: a sandbox whose log directory is unwritable must still produce the
// envelope the gate is waiting for, so a failure here is swallowed rather than turned into a
// protocol violation. That is not a licence to read a missing log as "nothing was called" — the
// assertions treat an absent or empty log as a run that never started, and fail on it.
function recordCall(record) {
  try {
    mkdirSync(dirname(CALL_LOG_PATH), { recursive: true });
    appendFileSync(CALL_LOG_PATH, `${JSON.stringify({ seq: nextSequenceNumber(), ...record })}\n`);
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
      // The fixture is loaded before the refusal decision, because the refusal is now the
      // fixture's to waive. A fixture that cannot be read throws out of here into the catch below,
      // which produces an error envelope rather than a served merge — the fail-closed direction.
      const fixture = loadFixture();
      if (REFUSABLE_OPERATIONS.has(operation) && !servesMerge(fixture)) {
        envelope = errorEnvelope(
          operation,
          'COMMAND_FAILED',
          `${MERGE_REFUSAL_MARKER}: the eval sandbox records a ${operation} request and never performs it`,
          { operation, apply },
          !apply,
        );
      } else {
        envelope = resolveEnvelope(fixture, operation, apply);
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
