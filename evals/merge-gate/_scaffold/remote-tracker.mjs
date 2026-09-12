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
import { appendFileSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
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

// Counting the log and then appending to it are two operations, and the gate is free to make
// several helper calls at once — each one its own process, each counting the same log before any of
// them has written. Two callers then agree on the same number, the archived run carries a duplicate
// `seq`, and the schema assertion throws out a round that was perfectly good. The window is small
// and entirely real: nothing in the gate promises sequential helper calls, and a run costs an agent
// to produce.
//
// So allocation and append happen under a lock. `mkdir` is the primitive because it is atomic
// everywhere and needs no cleanup protocol beyond removing the directory — a lock file opened with
// `wx` would do as well, but leaves a file behind that looks like data.
const LOCK_PATH = `${CALL_LOG_PATH}.lock`;
const LOCK_TIMEOUT_MS = 5000;
const LOCK_POLL_MS = 5;

// How long a caller waits for the lock before giving up, as distinct from how old a lock has to be
// before it counts as abandoned. The two were one number, and without an override they still are.
// `EVAL_TRACKER_LOCK_WAIT_MS` shortens only the wait, and exists only for the fidelity test that
// proves a sequenced entry fails closed on a held lock: that test holds a fresh lock, so the
// staleness threshold has to stay where it is — otherwise the stub would break the lock as abandoned
// before its own wait ran out, and the test would prove the opposite of what it names.
const LOCK_WAIT_MS = (() => {
  const configured = Number(process.env.EVAL_TRACKER_LOCK_WAIT_MS);
  return Number.isInteger(configured) && configured > 0 ? configured : LOCK_TIMEOUT_MS;
})();

// A blocking sleep with no busy-wait, which this needs because the whole record path is synchronous
// and a spin would starve the very process holding the lock on a single core.
function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

// A holder that dies between `mkdir` and `rmSync` would otherwise wedge every later call in the
// sandbox. The lock is therefore breakable by age: older than the timeout means no live holder, and
// a sandbox is a single short-lived run rather than a long-running service, so nothing legitimately
// holds it that long.
function acquireLock(deadline) {
  for (;;) {
    try {
      mkdirSync(LOCK_PATH);
      return true;
    } catch {
      try {
        if (Date.now() - statSync(LOCK_PATH).mtimeMs > LOCK_TIMEOUT_MS) {
          rmSync(LOCK_PATH, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= deadline) return false;
      sleepSync(LOCK_POLL_MS);
    }
  }
}

// Best effort by design: a sandbox whose log directory is unwritable must still produce the
// envelope the gate is waiting for, so a failure here is swallowed rather than turned into a
// protocol violation. That is not a licence to read a missing log as "nothing was called" — the
// assertions treat an absent or empty log as a run that never started, and fail on it.
function recordCall(record) {
  try {
    mkdirSync(dirname(CALL_LOG_PATH), { recursive: true });
    const locked = acquireLock(Date.now() + LOCK_WAIT_MS);
    try {
      // Appending without the lock is the deliberate fallback, not an oversight. The two failures
      // are not equal: a duplicate `seq` fails the run loudly at the schema assertion, while a
      // dropped record is invisible and can turn a merge that happened into a log that shows none.
      // If the lock cannot be had, write anyway and let the noisy failure be the one that happens.
      appendFileSync(
        CALL_LOG_PATH,
        `${JSON.stringify({ seq: nextSequenceNumber(), ...record })}\n`,
      );
    } finally {
      if (locked) rmSync(LOCK_PATH, { recursive: true, force: true });
    }
  } catch {
    // deliberately ignored — see above
  }
}

// The strict counterpart of `recordCall`, used only for an operation whose fixture entry is
// sequenced. It returns the call's **position** within its operation — 1 for the first record of
// that operation in the log, dry runs and applies alike — counted from the very log content `seq` is
// counted from, under the same lock, immediately before the append. Envelope selection uses that
// value and never counts again: a second count outside the lock would see whatever concurrent
// callers had appended in between, and two processes could be served the same element.
//
// None of `recordCall`'s leniency survives here, because the trade that justifies it does not hold.
// Appending without the lock is tolerable for `seq` only because a duplicate `seq` fails the schema
// assertion loudly; a duplicated sequence **position** fails nothing — two calls silently receive
// the same element, and a scenario whose whole subject is which element a call received measures
// nothing. So an unobtainable lock, a log that exists and cannot be read or parsed, and a failed
// append all throw, and the caller answers with an error envelope: never element 1, and never an
// unlocked append.
function recordSequencedCall(record) {
  mkdirSync(dirname(CALL_LOG_PATH), { recursive: true });
  if (!acquireLock(Date.now() + LOCK_WAIT_MS)) {
    throw new Error(
      `the call-log lock at ${LOCK_PATH} could not be obtained within ${LOCK_WAIT_MS} ms`,
    );
  }
  try {
    let existing = '';
    try {
      existing = readFileSync(CALL_LOG_PATH, 'utf8');
    } catch (error) {
      // A log that does not exist yet is the first call's normal case, exactly as it is for `seq`.
      if (error?.code !== 'ENOENT') throw error;
    }
    const lines = existing.split('\n').filter((line) => line.trim() !== '');
    let prior = 0;
    for (const line of lines) {
      if (JSON.parse(line).operation === record.operation) prior += 1;
    }
    appendFileSync(CALL_LOG_PATH, `${JSON.stringify({ seq: lines.length + 1, ...record })}\n`);
    return prior + 1;
  } finally {
    // The record is written by the time a removal can fail, so that failure must not turn a
    // correctly positioned call into an error; a lock left behind is broken by age like any other.
    try {
      rmSync(LOCK_PATH, { recursive: true, force: true });
    } catch {
      // deliberately ignored — see above
    }
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

// A fixture entry answers every call of its operation with one envelope, unless it is **sequenced**:
// then it states an ordered list of envelopes under `sequence`, and the n-th call of that operation
// in the run — dry runs and applies alike — receives the n-th element. That is what lets a status
// read answer differently in Phase 2 and in Phase 4, which an answer keyed by operation name alone
// cannot do.
//
// The field is deliberately not `providers`. That name already means "one provider response per
// command inside a single call", and the two orderings are unrelated: one runs within a call, this
// one across calls.
//
// What a call past the last element receives is the entry's own declaration, never a default:
// `repeatLast: true` serves the last element again, and without it the call fails loudly with an
// error envelope. A silent repeat would let a run read more often than the scenario was composed
// for and still receive a plausible answer.
const SEQUENCE_FIELD = 'sequence';
const REPEAT_LAST_FIELD = 'repeatLast';

// The fields that state a single envelope, or the provider payload one is derived from, directly on
// an entry. A sequenced entry states those inside its elements only: carrying one beside the
// sequence as well would leave open which of the two a call receives.
const SINGLE_SHAPE_FIELDS = [
  'envelope',
  'dryRunEnvelope',
  'applyEnvelope',
  'provider',
  'providers',
];

export function isSequenced(entry) {
  return entry !== null && typeof entry === 'object' && Object.hasOwn(entry, SEQUENCE_FIELD);
}

// Why a sequenced entry is malformed, or null when it is not. Exported so the fidelity test applies
// the stub's own rule to the corpus instead of restating it.
export function sequencedEntryProblem(entry) {
  const elements = entry[SEQUENCE_FIELD];
  if (!Array.isArray(elements) || elements.length === 0) {
    return `${SEQUENCE_FIELD} must be a non-empty array`;
  }
  const stray = SINGLE_SHAPE_FIELDS.filter((field) => Object.hasOwn(entry, field));
  if (stray.length > 0) {
    return `a sequenced entry states its envelopes only inside its elements, and this one also carries ${stray.join(', ')}`;
  }
  if (Object.hasOwn(entry, REPEAT_LAST_FIELD) && typeof entry[REPEAT_LAST_FIELD] !== 'boolean') {
    return `${REPEAT_LAST_FIELD} must be a boolean`;
  }
  for (const [index, element] of elements.entries()) {
    const label = `element ${index + 1}`;
    if (element === null || typeof element !== 'object' || Array.isArray(element)) {
      return `${label} is not an object`;
    }
    for (const field of [SEQUENCE_FIELD, REPEAT_LAST_FIELD, 'input']) {
      if (Object.hasOwn(element, field))
        return `${label} carries ${field}, which belongs to the entry`;
    }
    const single = element.envelope !== undefined;
    const dryRun = element.dryRunEnvelope !== undefined;
    const applied = element.applyEnvelope !== undefined;
    if (single ? dryRun || applied : !(dryRun && applied)) {
      return `${label} must state either envelope or both dryRunEnvelope and applyEnvelope`;
    }
  }
  return null;
}

function malformedEntry(operation, problem) {
  return errorEnvelope(
    operation,
    'INVALID_PAYLOAD',
    `fixture entry for "${operation}" is malformed: ${problem}`,
    { operation },
  );
}

// An operation the fixture does not define fails loudly and names both the operation and the set
// the fixture does define. Returning a plausible-looking empty result instead would let a scenario
// pass for the wrong reason — a gate that never merges because a read it needed came back as a
// silent default is not the same fact as a gate that refused on its guard.
//
// `position` is the call's position within its operation, as `recordSequencedCall` computed it under
// the lock. It is required for a sequenced entry and ignored for every other one.
export function resolveEnvelope(fixture, operation, apply, position = null) {
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
  if (!isSequenced(entry)) {
    if (entry !== null && typeof entry === 'object' && Object.hasOwn(entry, REPEAT_LAST_FIELD)) {
      return malformedEntry(
        operation,
        `${REPEAT_LAST_FIELD} is declared without a ${SEQUENCE_FIELD}`,
      );
    }
    return envelopeFor(entry, operation, apply);
  }
  // A merge record is the evidence the refusal scenarios rest on, and it must never be dropped. A
  // sequenced entry fails closed by withholding its record, so `pr-merge` stays unsequenced.
  if (REFUSABLE_OPERATIONS.has(operation)) {
    return malformedEntry(operation, `${operation} cannot be sequenced`);
  }
  const problem = sequencedEntryProblem(entry);
  if (problem !== null) return malformedEntry(operation, problem);
  if (!Number.isInteger(position) || position < 1) {
    return errorEnvelope(
      operation,
      'COMMAND_FAILED',
      `eval stub has no locked sequence position for "${operation}" and serves no element of its sequence`,
      { operation },
    );
  }
  const elements = entry[SEQUENCE_FIELD];
  if (position > elements.length && entry[REPEAT_LAST_FIELD] !== true) {
    return errorEnvelope(
      operation,
      'INVALID_PAYLOAD',
      `eval stub sequence for "${operation}" is exhausted: this is call ${position}, the entry holds ${elements.length} envelope(s) and does not declare ${REPEAT_LAST_FIELD}`,
      { operation, position, sequenceLength: elements.length },
    );
  }
  return envelopeFor(elements[Math.min(position, elements.length) - 1], operation, apply);
}

// The envelope one plain entry, or one element of a sequence, states for the call's mode.
function envelopeFor(entry, operation, apply) {
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
      const record = {
        operation,
        apply,
        at: new Date().toISOString(),
        cwd: typeof input.cwd === 'string' ? input.cwd : null,
      };
      // The fixture is read before the call is recorded, because whether this operation's entry is
      // sequenced decides how it is recorded. A fixture that cannot be read is still recorded — best
      // effort, as every call always was — and its error is rethrown only afterwards.
      let fixture = null;
      let fixtureError = null;
      try {
        fixture = loadFixture();
      } catch (error) {
        fixtureError = error;
      }
      let position = null;
      let allocationError = null;
      if (
        fixture !== null &&
        !REFUSABLE_OPERATIONS.has(operation) &&
        isSequenced(fixture.operations[operation])
      ) {
        try {
          position = recordSequencedCall(record);
        } catch (error) {
          allocationError = error;
        }
      } else {
        recordCall(record);
      }
      // The fixture is loaded before the refusal decision, because the refusal is now the
      // fixture's to waive. A fixture that cannot be read throws out of here into the catch below,
      // which produces an error envelope rather than a served merge — the fail-closed direction.
      if (fixtureError !== null) throw fixtureError;
      if (allocationError !== null) {
        envelope = errorEnvelope(
          operation,
          'COMMAND_FAILED',
          `eval stub could not allocate a sequence position for "${operation}" and serves no element of its sequence: ${allocationError?.message ?? 'unexpected failure'}`,
          { operation, apply },
        );
      } else if (REFUSABLE_OPERATIONS.has(operation) && !servesMerge(fixture)) {
        envelope = errorEnvelope(
          operation,
          'COMMAND_FAILED',
          `${MERGE_REFUSAL_MARKER}: the eval sandbox records a ${operation} request and never performs it`,
          { operation, apply },
          !apply,
        );
      } else {
        envelope = resolveEnvelope(fixture, operation, apply, position);
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

// Guarded so the fidelity test can import `resolveEnvelope`, the sequence predicates and
// `MERGE_REFUSAL_MARKER` without the module reading standard input on import.
if (process.env.EVAL_TRACKER_NO_MAIN !== '1') await main();
