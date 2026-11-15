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
//
// **One stub for every suite, declared by each.** It started as a `merge-gate` instrument, and the
// commentary below is still written from the gate, where every rule here was decided. It moved to
// the shared scaffold when the `iterate` suite arrived, because nothing in it is about the gate:
// what a call receives is looked up in the slot's fixture by operation name, sequences and the
// call-log schema are properties of the fixture, and an operation the fixture does not define fails
// loudly for any tool. The one rule that names an operation — `pr-merge` is recorded and refused
// unless the fixture opts in — is a sandbox safety default rather than a gate policy, and it holds
// for a suite that never expects a merge exactly as it holds for one that does. Each suite still
// declares this file as its `trackerStub.source` and hashes it among its own `instrumentFiles`, so
// a change here stales every suite that runs it and no other.

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { devNull } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

// Resolved from this file's own location rather than from an environment variable, because the gate
// invokes the helper as an ordinary subprocess and passes nothing of its own. The scaffold lays the
// sandbox out so that both siblings sit two levels above `<skill>/scripts/`.
const SANDBOX_ROOT = resolve(import.meta.dirname, '..', '..');
const FIXTURE_PATH = process.env.EVAL_TRACKER_FIXTURE ?? resolve(SANDBOX_ROOT, 'fixture.json');
const CALL_LOG_PATH =
  process.env.EVAL_TRACKER_LOG ?? resolve(SANDBOX_ROOT, 'trace', 'tracker-calls.jsonl');
// The bare `origin` beside the checkout, read only by a fixture that declares `originHeads`.
// `EVAL_TRACKER_ORIGIN` overrides it for the unit tests, like the two paths above.
const ORIGIN_PATH = process.env.EVAL_TRACKER_ORIGIN ?? resolve(SANDBOX_ROOT, 'remote.git');

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

// The shipped helper's closed argv, mirrored so a run sees the same refusal it would see from the
// real file: exactly `<operation>` or `<operation> --apply`, the operation first, and `--apply` only
// for a forge mutation, refused before stdin is read and before anything is recorded. The stub runs
// beside no core, so the mutation list is its own copy; `test/remote-tracker-argv.test.mjs` pins it
// to the core's MUTATION_OPERATIONS.
export const STUB_MUTATION_OPERATIONS = Object.freeze([
  'label-create',
  'issue-create',
  'issue-sub-issue-create',
  'issue-update-body',
  'issue-close',
  'issue-comment',
  'issue-comment-update',
  'issue-labels',
  'issue-label-add',
  'issue-label-remove',
  'sf-label-migrate',
  'pr-create',
  'pr-update-body',
  'pr-update-title',
  'pr-mark-ready',
  'pr-comment',
  'pr-merge',
  'review-create',
  'review-thread-reply',
  'review-thread-resolve',
]);
const USAGE = 'usage: remote-tracker.mjs <operation> [--apply]';

// Returns `{ operation, apply }`, or `{ refusal }` with the message the shipped helper gives.
export function parseStubArgv(argv) {
  const [operation, flag, ...rest] = argv;
  if (typeof operation !== 'string' || operation === '' || operation.startsWith('-')) {
    return { refusal: `the operation must be the first argument; ${USAGE}` };
  }
  if (rest.length > 0 || (flag !== undefined && flag !== '--apply')) {
    return { refusal: `only <operation> or <operation> --apply is accepted; ${USAGE}` };
  }
  if (flag === '--apply' && !STUB_MUTATION_OPERATIONS.includes(operation)) {
    return {
      refusal: `--apply is accepted only for a mutation, and ${operation} is none; ${USAGE}`,
    };
  }
  return { operation, apply: flag === '--apply' };
}

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
// Fixtures without a well-formed sequenced operation keep the legacy contract: one record per call
// with `seq`, `operation`, `apply`, `at` and `cwd`. A sequenced fixture needs stronger ordering
// evidence, so every call under that fixture writes a full start record followed, after its
// envelope has been flushed to stdout, by a correlated completion record:
//
//   seq        1 for the first event in a log file, then one higher per recorded event
//   event      `start` or `complete`
//   callId     one stable non-empty identity shared by both events of a call
//   operation  the operation name as it arrived in argv (start only)
//   apply      whether `--apply` was passed, so a dry run and a write stay distinguishable (start)
//   at         an ISO-8601 instant, for a human reading the sandbox; millisecond collisions make it
//              unusable for ordering, which is exactly why `seq` exists beside it
//   cwd        the working directory the caller stated, or null when it stated none (start only)
//
// The stub is a fresh process per call, so the counter cannot live in memory. It is derived from
// the lines already in the log instead: every recorded event appends exactly one line, so the count
// of lines already present is the number of the previous event, and one more is this event's. A log
// file that does not exist yet is the first event's normal case, not an error.
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
function recordEvent(record) {
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
      return true;
    } finally {
      if (locked) rmSync(LOCK_PATH, { recursive: true, force: true });
    }
  } catch {
    // deliberately ignored — see above
    return false;
  }
}

// The strict counterpart of `recordEvent`, used only for the start of an operation whose fixture
// entry is sequenced. It returns the call's **position** within its operation — 1 for the first
// start of that operation in the log, dry runs and applies alike — by counting only start events
// for that operation. It uses the very log content `seq` is counted from, under the same lock,
// immediately before the append. Envelope selection uses that value and never counts again: a
// second count outside the lock would see whatever concurrent callers had appended in between,
// and two processes could be served the same element.
//
// None of `recordEvent`'s leniency survives here, because the trade that justifies it does not hold.
// Appending without the lock is tolerable for `seq` only because a duplicate `seq` fails the schema
// assertion loudly; a duplicated sequence **position** fails nothing — two calls silently receive
// the same element, and a scenario whose whole subject is which element a call received measures
// nothing. So an unobtainable lock, a log that exists and cannot be read or parsed, and a failed
// append all throw, and the caller answers with an error envelope: never element 1, and never an
// unlocked append.
function recordSequencedStart(record, lifecycleEvents) {
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
      const event = JSON.parse(line);
      if (
        event.operation === record.operation &&
        (lifecycleEvents ? event.event === 'start' : !Object.hasOwn(event, 'event'))
      ) {
        prior += 1;
      }
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

// A Writable's callback runs only after its chunk has been handled. Waiting for it keeps a
// completion event from claiming success while the envelope is still buffered, and a write error
// leaves the start deliberately unmatched for the validity reader to reject.
function writeEnvelope(stdout, envelope) {
  const output = `${JSON.stringify(envelope)}\n`;
  return new Promise((resolveWrite, rejectWrite) => {
    const callbackSupported = stdout.write.length >= 2;
    try {
      stdout.write(output, (error) => {
        if (error) rejectWrite(error);
        else resolveWrite();
      });
      // A small injected writer may expose only `write(chunk)`. Its successful return is the only
      // completion signal that interface provides; real Node writable streams take the callback.
      if (!callbackSupported) resolveWrite();
    } catch (error) {
      rejectWrite(error);
    }
  });
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

function usesLifecycleEvents(fixture) {
  return Object.entries(fixture.operations).some(
    ([operation, entry]) =>
      !REFUSABLE_OPERATIONS.has(operation) &&
      isSequenced(entry) &&
      sequencedEntryProblem(entry) === null,
  );
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
// `position` is the call's position within its operation, as `recordSequencedStart` computed it under
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

// **Origin-head mode: an opt-in for scenarios whose head moves during the run.** A fixture that
// states `originHeads` at its top level is answered from the head a real bare `origin` beside the
// checkout carries, not from the call position. That is what a scenario needs when the head moves
// through real commits — a gate base merge it pushes, a delegated repair the `iterate` echo lands —
// because the number of reads a run makes per head is the run's own business, and only the head
// says which state of the pull request a read is looking at.
//
// The declaration names the head branch and the heads in the order they are expected to appear:
//
//   originHeads: { branch, heads: [{ label, placeholder, source }] }
//
// `source` names what creates the head: `seed` (the provisioning, always and only the first),
// `dispatch` (the `iterate` echo at a delegation) or `gate-merge` (the gate's own pushed base merge).
// Whoever creates a head labels it in the bare repository as `refs/eval/head/<label>`; this stub
// only reads. The current head is `refs/heads/<branch>` there, and it must equal exactly one
// labelled head, or the call fails loudly: an undeclared head is a fact about the run (a push or a
// repair nobody composed), and answering it with some declared state would hide that fact.
//
// A sequenced entry then serves the element at the current head's position, so every sequence holds
// exactly one element per declared head. The real SHAs cannot be known when the fixture is written
// — a gate merge commit carries the run's own commit time — so every envelope states each head as
// its `placeholder`, and the served copy carries the real SHA in its place. The canned envelopes
// stay what the fidelity test proves; the substitution swaps one 40-character hex string for
// another and changes nothing else. A fixture without `originHeads` is served exactly as before.
const ORIGIN_HEADS_FIELD = 'originHeads';
const ORIGIN_HEAD_SOURCES = Object.freeze(['seed', 'dispatch', 'gate-merge']);
export const ORIGIN_HEAD_REF_PREFIX = 'refs/eval/head/';
const OBJECT_ID = /^[0-9a-f]{40}$/;
const HEAD_LABEL = /^[a-z0-9][a-z0-9-]*$/;

export function isOriginHeadFixture(fixture) {
  return (
    fixture !== null && typeof fixture === 'object' && Object.hasOwn(fixture, ORIGIN_HEADS_FIELD)
  );
}

// Why a fixture's `originHeads` declaration is malformed, or null when it is not. Exported so the
// fidelity test and the scenario setup apply the stub's own rule.
export function originHeadsProblem(fixture) {
  const declaration = fixture[ORIGIN_HEADS_FIELD];
  if (declaration === null || typeof declaration !== 'object' || Array.isArray(declaration)) {
    return `${ORIGIN_HEADS_FIELD} must be an object`;
  }
  const { branch, heads } = declaration;
  if (typeof branch !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes('..')) {
    return `${ORIGIN_HEADS_FIELD}.branch must be a plain branch name`;
  }
  if (!Array.isArray(heads) || heads.length === 0) {
    return `${ORIGIN_HEADS_FIELD}.heads must be a non-empty array`;
  }
  const labels = new Set();
  const placeholders = new Set();
  for (const [index, head] of heads.entries()) {
    const label = `${ORIGIN_HEADS_FIELD}.heads[${index}]`;
    if (head === null || typeof head !== 'object' || Array.isArray(head)) {
      return `${label} is not an object`;
    }
    if (Object.keys(head).sort().join(',') !== 'label,placeholder,source') {
      return `${label} must state exactly label, placeholder and source`;
    }
    if (!HEAD_LABEL.test(head.label ?? '')) return `${label}.label is not a plain label`;
    if (!OBJECT_ID.test(head.placeholder ?? '')) return `${label}.placeholder is not an object id`;
    if (!ORIGIN_HEAD_SOURCES.includes(head.source)) return `${label}.source is unknown`;
    if ((index === 0) !== (head.source === 'seed')) {
      return `${label}: the first head and only the first is the seed`;
    }
    if (labels.has(head.label) || placeholders.has(head.placeholder)) {
      return `${label} repeats a label or a placeholder`;
    }
    labels.add(head.label);
    placeholders.add(head.placeholder);
  }
  for (const [operation, entry] of Object.entries(fixture.operations ?? {})) {
    if (isSequenced(entry) && entry[SEQUENCE_FIELD]?.length !== heads.length) {
      return `the sequence of "${operation}" must hold one element per declared head (${heads.length})`;
    }
    if (isSequenced(entry) && Object.hasOwn(entry, REPEAT_LAST_FIELD)) {
      return `the sequence of "${operation}" is indexed by head and cannot declare ${REPEAT_LAST_FIELD}`;
    }
  }
  return null;
}

// Every git read of the bare repository runs without the operator's configuration and without any
// `GIT_*` variable the caller's environment carries, so a hook's or a host's setting cannot point it
// at another repository.
export function isolatedGitEnv() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  );
  return { ...env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
}

function originGit(args) {
  return execFileSync('git', ['--git-dir', ORIGIN_PATH, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: isolatedGitEnv(),
  }).trim();
}

// The current head and the labelled heads, read fresh on every call.
function readOriginHeads(declaration) {
  const current = originGit(['rev-parse', '--verify', `refs/heads/${declaration.branch}^{commit}`]);
  const labelled = new Map();
  const listing = originGit([
    'for-each-ref',
    '--format=%(refname) %(objectname)',
    ORIGIN_HEAD_REF_PREFIX,
  ]);
  for (const line of listing.split('\n').filter(Boolean)) {
    const [ref, sha] = line.split(' ');
    labelled.set(ref.slice(ORIGIN_HEAD_REF_PREFIX.length), sha);
  }
  return { current, labelled };
}

// Replaces each labelled head's placeholder with its real SHA, everywhere in the envelope.
export function substituteOriginHeads(envelope, heads, labelled) {
  let text = JSON.stringify(envelope);
  for (const head of heads) {
    const sha = labelled.get(head.label);
    if (sha !== undefined) text = text.split(head.placeholder).join(sha);
  }
  return JSON.parse(text);
}

export function resolveOriginHeadEnvelope(fixture, operation, apply, read = readOriginHeads) {
  const problem = originHeadsProblem(fixture);
  if (problem !== null) return malformedEntry(operation, problem);
  const { heads } = fixture[ORIGIN_HEADS_FIELD];
  let state;
  try {
    state = read(fixture[ORIGIN_HEADS_FIELD]);
  } catch (error) {
    return errorEnvelope(
      operation,
      'COMMAND_FAILED',
      `eval stub could not read the origin head: ${error?.message ?? 'unexpected failure'}`,
      { operation },
    );
  }
  const position = heads.findIndex((head) => state.labelled.get(head.label) === state.current) + 1;
  if (position < 1) {
    return errorEnvelope(
      operation,
      'COMMAND_FAILED',
      `eval stub: the origin head ${state.current} is no head the fixture declares`,
      { operation, head: state.current },
    );
  }
  const envelope = resolveEnvelope(fixture, operation, apply, position);
  return substituteOriginHeads(envelope, heads, state.labelled);
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const parsed = parseStubArgv(argv);
  const first = argv[0];
  const operation =
    parsed.operation ?? (typeof first === 'string' && !first.startsWith('-') ? first : null);
  const apply = parsed.apply === true;
  let envelope;
  let callId = null;
  let lifecycleEvents = false;
  let startRecorded = false;
  try {
    if (parsed.refusal !== undefined) {
      envelope = errorEnvelope(operation, 'INVALID_PAYLOAD', parsed.refusal);
    } else {
      // Read stdin before anything else, so the caller's write always finds a reader and a refused
      // operation cannot turn into an EPIPE on the gate's side.
      const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
      const callRecord = {
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
      lifecycleEvents = fixture !== null && usesLifecycleEvents(fixture);
      if (lifecycleEvents) callId = randomUUID();
      const record = lifecycleEvents ? { event: 'start', callId, ...callRecord } : callRecord;
      let position = null;
      let allocationError = null;
      if (
        fixture !== null &&
        !REFUSABLE_OPERATIONS.has(operation) &&
        isSequenced(fixture.operations[operation])
      ) {
        try {
          position = recordSequencedStart(record, lifecycleEvents);
          startRecorded = true;
        } catch (error) {
          allocationError = error;
        }
      } else {
        startRecorded = recordEvent(record);
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
        envelope = isOriginHeadFixture(fixture)
          ? resolveOriginHeadEnvelope(fixture, operation, apply)
          : resolveEnvelope(fixture, operation, apply, position);
      }
    }
  } catch (error) {
    envelope = errorEnvelope(operation, 'INVALID_PAYLOAD', error?.message ?? 'unexpected failure');
  }
  await writeEnvelope(stdout, envelope);
  if (lifecycleEvents && startRecorded) {
    recordEvent({
      event: 'complete',
      callId,
      at: new Date().toISOString(),
    });
  }
  if (!envelope.ok) {
    if (io.setExitCode) io.setExitCode(1);
    else process.exitCode = 1;
  }
  return envelope;
}

// Guarded so the fidelity test can import `resolveEnvelope`, the sequence predicates and
// `MERGE_REFUSAL_MARKER` without the module reading standard input on import.
if (process.env.EVAL_TRACKER_NO_MAIN !== '1') await main();
