import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  errorEnvelope,
  executeOperation,
  RemoteTrackerError,
} from '../src/scripts/remote-tracker-core.mjs';

// The stub's own predicate for the merge opt-in, imported rather than restated so this file cannot
// drift from the rule it is asserting. The import has to be dynamic and the flag has to be set
// first: the stub is a CLI that runs `main()` on load, and `EVAL_TRACKER_NO_MAIN` is the switch it
// ships for exactly this — a static import would have it read standard input as a side effect of
// asking what the predicate is.
process.env.EVAL_TRACKER_NO_MAIN = '1';
const { isSequenced, resolveEnvelope, sequencedEntryProblem, servesMerge } =
  await import('../evals/merge-gate/_scaffold/remote-tracker.mjs');

// WP2 of docs/plan/2026-09-02-merge-gate-behavioural-evals.md. The eval suite stubs the whole forge
// input surface of a `merge-gate` run at one subprocess, which is only worth something while the
// canned envelopes are ones the real helper could produce. Otherwise the suite tests the gate
// against a forge that does not exist, and a green result says nothing.
//
// This file is the thing that keeps the two from drifting: it pipes each fixture's provider payload
// through the **real** `executeOperation` normalizer and compares the result against the envelope
// the stub hands out. It runs in the ordinary `pnpm test`, never in the eval harness, and it costs
// nothing.

const SUITE_ROOT = resolve(import.meta.dirname, '..', 'evals', 'merge-gate');
const FIXTURE_DIR = resolve(SUITE_ROOT, 'fixtures');
const STUB_PATH = resolve(SUITE_ROOT, '_scaffold', 'remote-tracker.mjs');

function fixtureFiles() {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
}

// A fixture entry states its provider side one of two ways, and this resolves both into a runner.
//
// `provider` is one canned response delivered on whichever call the operation makes. Every **read**
// this corpus covers is a single command on GitHub, so a runner that answers identically is exact
// rather than merely sufficient; a read that grew a second command would surface here as a
// normalizer failure instead of passing quietly.
//
// `providers` is an ordered list, one response per command, for an operation that genuinely issues
// several. `pr-merge` is the first: its apply path reads the pull-request status to check the head
// has not moved, and only then merges — two commands whose responses have nothing in common, so a
// single repeated response cannot stand in for them.
//
// A response stated as a **string** is delivered as raw stdout; anything else is JSON-encoded. That
// distinction is the provider's, not this file's: `gh pr merge` prints a line of prose, and encoding
// it as JSON would hand the normalizer a document no forge produces.
// A monotonic clock that jumps a whole minute per reading. `issue-state-wait` takes one reading
// before its wait and one after, and clamps the difference to its own fixed grace period, so a step
// larger than that period always yields the clamped value — the same number a real wait emits, with
// no dependence on how long this suite actually took. Each envelope gets a fresh instance, so an
// operation replayed twice (dry run and apply) does not inherit the first replay's offset.
function steppingClock() {
  let elapsed = 0;
  return () => (elapsed += 60_000);
}

function runnerFor(entry) {
  const responses = Array.isArray(entry.providers) ? entry.providers : [entry.provider];
  const repeat = !Array.isArray(entry.providers);
  let index = 0;
  const runner = async () => {
    const payload = repeat ? responses[0] : responses[index];
    index += 1;
    return {
      status: 0,
      stdout: typeof payload === 'string' ? payload : JSON.stringify(payload),
      stderr: '',
    };
  };
  // A stated response nobody consumed is a fixture describing commands the operation no longer
  // issues, which is the same kind of drift the envelope comparison exists to catch.
  runner.assertDrained = (label) => {
    if (repeat) return;
    assert.equal(
      index,
      responses.length,
      `${label}: stated ${responses.length} provider response(s), the operation issued ${index} command(s)`,
    );
  };
  return runner;
}

// The envelope or envelopes an entry states, paired with the mode each was derived under. A read
// states one `envelope`, which serves a dry run and an applied call alike. A mutation states
// `dryRunEnvelope` and `applyEnvelope`, because the real helper genuinely answers the two modes
// differently — a preview of the command it would run, then the result of having run it.
function statedEnvelopes(file, operation, entry) {
  if (entry.envelope !== undefined) return [{ apply: false, envelope: entry.envelope }];
  assert.ok(
    entry.dryRunEnvelope !== undefined && entry.applyEnvelope !== undefined,
    `${file}: the entry for "${operation}" states neither an envelope nor both of dryRunEnvelope and applyEnvelope`,
  );
  return [
    { apply: false, envelope: entry.dryRunEnvelope },
    { apply: true, envelope: entry.applyEnvelope },
  ];
}

// A sequenced entry is proven element by element. Each element is a complete single-envelope shape —
// its own provider payload and its own envelope — under the entry's shared `input`, so it faces
// exactly the check a plain entry does; a plain entry is its own one element. The stub's own rules
// for a well-formed entry are applied first, so a malformed one fails here with the stub's reason
// rather than as a confusing normalizer mismatch.
function fixtureElements(file, fixture) {
  const elements = [];
  for (const [operation, entry] of Object.entries(fixture.operations)) {
    const resolved = resolveEnvelope(fixture, operation, false, 1);
    assert.doesNotMatch(
      resolved.error?.message ?? '',
      /is malformed/,
      `${file}: the stub rejects the entry for "${operation}"`,
    );
    if (!isSequenced(entry)) {
      elements.push({ operation, label: '', entry, element: entry });
      continue;
    }
    const problem = sequencedEntryProblem(entry);
    assert.equal(problem, null, `${file}: the sequenced entry for "${operation}" is malformed`);
    entry.sequence.forEach((element, index) => {
      elements.push({ operation, label: ` (sequence element ${index + 1})`, entry, element });
    });
  }
  return elements;
}

// The envelope one plain entry, or one sequence element, states for a call in the given mode — the
// same choice the stub makes.
function elementEnvelope(element, apply) {
  return apply
    ? (element.applyEnvelope ?? element.envelope)
    : (element.dryRunEnvelope ?? element.envelope);
}

function readCallLog(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

// Synthetic sequences for the stub's own mechanics, written to a temporary directory and never to
// `fixtures/`, so the fidelity corpus is untouched by them. Each element is the positive control's
// real status envelope with its title marked, which is enough to tell the elements apart and is all
// these tests need: what they prove is which element a call received, not that the element is
// realistic — the corpus assertions above prove that.
const SEQUENCED_OPERATION = 'pr-status-read';

function markedStatusElements(count) {
  const { provider, envelope } = loadFixture('merge-proceeds.json').operations[SEQUENCED_OPERATION];
  return Array.from({ length: count }, (_, index) => {
    const marked = structuredClone(envelope);
    marked.data.result.title = `${marked.data.result.title} [element ${index + 1}]`;
    return { provider, envelope: marked };
  });
}

function writeSequencedFixture(dir, elements, declaration = {}) {
  const fixture = loadFixture('merge-proceeds.json');
  fixture.operations[SEQUENCED_OPERATION] = {
    input: fixture.operations[SEQUENCED_OPERATION].input,
    sequence: elements,
    ...declaration,
  };
  const path = join(dir, 'fixture.json');
  writeFileSync(path, `${JSON.stringify(fixture)}\n`);
  return path;
}

function runStub(operation, argv = [], env = {}) {
  // `EVAL_TRACKER_NO_MAIN` is set in this process so the import above stays inert; a child that
  // inherited it would exit without writing an envelope, which is the opposite of what a spawned
  // stub is for. Strip it here rather than at every call site.
  const { EVAL_TRACKER_NO_MAIN: _suppressed, ...inherited } = process.env;
  const result = spawnSync(process.execPath, [STUB_PATH, operation, ...argv], {
    input: JSON.stringify({ cwd: '/tmp/effective-flow-merge-gate-eval/unit' }),
    encoding: 'utf8',
    env: { ...inherited, ...env },
  });
  return { ...result, envelope: JSON.parse(result.stdout) };
}

test('the suite ships at least one fixture', () => {
  assert.ok(fixtureFiles().length > 0, `no fixtures found in ${FIXTURE_DIR}`);
});

test('every fixture envelope is one the real normalizer emits', async () => {
  for (const file of fixtureFiles()) {
    const fixture = loadFixture(file);
    assert.ok(fixture.repository, `${file}: fixture states no repository`);
    assert.ok(fixture.probe, `${file}: fixture states no probe`);

    for (const { operation, label, entry, element } of fixtureElements(file, fixture)) {
      for (const { apply, envelope } of statedEnvelopes(file, `${operation}${label}`, element)) {
        const runner = runnerFor(element);
        const produced = await executeOperation(
          operation,
          { repository: fixture.repository, probe: fixture.probe, ...(entry.input ?? {}) },
          {
            runner,
            // The probe is stated by the fixture rather than performed, so the corpus declares the
            // provider capabilities it assumes instead of inheriting whatever a live `gh` reports.
            skipProbe: true,
            // `issue-state-wait` is the one operation that sleeps: between its two reads it waits
            // the helper's fixed grace period. Replaying that for real costs this suite half a
            // minute per such envelope and makes the emitted `observedWaitMs` depend on the wall
            // clock, which is both slow and a flake. The no-op sleeper and the stepping clock below
            // reproduce the same envelope instantly and deterministically: the helper clamps the
            // observed wait to its fixed period, so any step larger than that period yields exactly
            // the value a real wait produces. Every other operation ignores both options.
            sleeper: async () => {},
            clock: steppingClock(),
            ...(apply ? { apply: true } : {}),
          },
        );
        assert.deepEqual(
          produced,
          envelope,
          `${file}: the canned ${apply ? 'apply' : 'dry-run'} envelope for "${operation}"${label} is not what executeOperation emits for its provider payload`,
        );
        // Only the applied call issues every command a mutation has; a dry run returns its preview
        // before the first one, so its unconsumed responses say nothing.
        if (apply) runner.assertDrained(`${file}: "${operation}"${label}`);
      }
    }
  }
});

// The corpus has to cover the operations a gate run actually performs, or a scenario could pass
// because the run never got far enough to need one — and, worse, because the stub's loud failure on
// an undefined operation pushed the run onto an improvised path. The first probe run showed exactly
// that: the gate opened with `reference-parse`, `probe` and `pr-read`, none of which the fixture
// defined, and worked around all three. A scenario has to exercise the **normal** path, so those
// three are required alongside the five reads WP2 names.
//
// `reference-parse` is a local operation — the normalizer resolves it without touching the provider,
// so its fixture entry states a null provider payload the fake runner never delivers. `probe` is
// piped through `executeOperation` with `skipProbe`, so what the fidelity assertion proves for it is
// the envelope the operation wraps around a probe result rather than the capability detection
// itself; the capabilities are the set this fixture declares at its top level. `repository-resolve`
// is remote by classification but answers from the stated repository without reaching the runner
// either, so it likewise carries a null provider payload.
//
// `pr-checks-wait` and `repository-resolve` were added because runs performed against the earlier
// corpus asked for them and got `UNSUPPORTED_CAPABILITY` back: three of five archived runs took a
// fallback path instead of the normal one, which is precisely the "passed for the wrong reason"
// failure this list exists to prevent. Neither is optional for a scenario whose subject is a merge
// precondition — the gate resolves the repository before it can read anything, and Phase 4 waits on
// the checks before it evaluates them.
test('every fixture covers the operations a gate run performs', () => {
  const required = [
    'repository-resolve',
    'reference-parse',
    'probe',
    'pr-read',
    'viewer-read',
    'pr-status-read',
    'pr-checks-wait',
    'pr-comments-read',
    'pr-reviews-read',
    'review-threads-read',
    // Reached only on the post-merge path, and not by every run even there — which is exactly why it
    // is required rather than left to chance. One archived round had a single run call it while its
    // four siblings did not; the fixture defined nothing, so that run alone took an improvised
    // fallback and had to be discarded. Whether a scenario exercises an operation should not be a
    // lottery decided per run.
    'issue-lifecycle-receipt-parse',
  ];
  for (const file of fixtureFiles()) {
    const fixture = loadFixture(file);
    for (const operation of required) {
      assert.ok(
        Object.hasOwn(fixture.operations, operation),
        `${file}: fixture defines no envelope for the required operation "${operation}"`,
      );
    }
  }
});

test('the stub hands out exactly the fixture envelope for every defined operation', () => {
  for (const file of fixtureFiles()) {
    const fixture = loadFixture(file);
    const fixturePath = join(FIXTURE_DIR, file);
    const logDir = mkdtempSync(join(tmpdir(), 'ef-eval-stub-'));
    try {
      const asked = [];
      for (const [operation, entry] of Object.entries(fixture.operations)) {
        // Walked element by element in the next test: one call here would ask for element 1 only.
        if (isSequenced(entry)) continue;
        for (const { apply, envelope: stated } of statedEnvelopes(file, operation, entry)) {
          asked.push(operation);
          const { status, envelope } = runStub(operation, apply ? ['--apply'] : [], {
            EVAL_TRACKER_FIXTURE: fixturePath,
            EVAL_TRACKER_LOG: join(logDir, 'tracker-calls.jsonl'),
          });
          assert.equal(status, 0, `${file}: the stub exited non-zero for "${operation}"`);
          assert.deepEqual(
            envelope,
            stated,
            `${file}: the stub altered the "${operation}" ${apply ? 'apply' : 'dry-run'} envelope`,
          );
        }
      }
      // The call log is the evidence every scenario assertion reads, so it has to record every
      // operation the run asked for, in order.
      const log = readFileSync(join(logDir, 'tracker-calls.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.deepEqual(
        log.map((record) => record.operation),
        asked,
        `${file}: the stub's call log does not record every operation`,
      );
    } finally {
      rmSync(logDir, { recursive: true, force: true });
    }
  }
});

// The sequenced half of the test above. A sequenced entry is walked rather than called once: the
// n-th call must receive the n-th element, so every element is asked for in order against one log,
// and one call more shows what the entry declared for exhaustion. Positions count dry runs and
// applies alike, which is why each mode the elements state gets a log of its own.
test('the stub walks every element of a sequenced fixture entry in order', () => {
  let walked = 0;
  for (const file of fixtureFiles()) {
    const fixture = loadFixture(file);
    const fixturePath = join(FIXTURE_DIR, file);
    for (const [operation, entry] of Object.entries(fixture.operations)) {
      if (!isSequenced(entry)) continue;
      walked += 1;
      const elements = entry.sequence;
      const modes = elements.some((element) => element.applyEnvelope !== undefined)
        ? [false, true]
        : [false];
      for (const apply of modes) {
        const logDir = mkdtempSync(join(tmpdir(), 'ef-eval-stub-'));
        const logPath = join(logDir, 'tracker-calls.jsonl');
        const env = { EVAL_TRACKER_FIXTURE: fixturePath, EVAL_TRACKER_LOG: logPath };
        const argv = apply ? ['--apply'] : [];
        try {
          elements.forEach((element, index) => {
            const stated = elementEnvelope(element, apply);
            const { status, envelope } = runStub(operation, argv, env);
            assert.equal(
              status,
              stated.ok ? 0 : 1,
              `${file}: call ${index + 1} of "${operation}" exited with the wrong status`,
            );
            assert.deepEqual(
              envelope,
              stated,
              `${file}: call ${index + 1} of "${operation}" was not served sequence element ${index + 1}`,
            );
          });

          const past = runStub(operation, argv, env);
          if (entry.repeatLast === true) {
            assert.deepEqual(
              past.envelope,
              elementEnvelope(elements.at(-1), apply),
              `${file}: "${operation}" declares repeatLast, and a call past its last element did not receive that element again`,
            );
          } else {
            assert.equal(past.status, 1, `${file}: a call past the end of "${operation}" exited 0`);
            assert.equal(past.envelope.ok, false);
            assert.match(past.envelope.error.message, /is exhausted/);
          }

          assert.deepEqual(
            readCallLog(logPath).map((record) => [record.seq, record.operation]),
            Array.from({ length: elements.length + 1 }, (_, index) => [index + 1, operation]),
            `${file}: the stub's call log does not record every call of the sequenced "${operation}"`,
          );
        } finally {
          rmSync(logDir, { recursive: true, force: true });
        }
      }
    }
  }
  assert.ok(
    walked > 0,
    'no fixture declares a sequenced entry, so nothing here exercised sequencing against the corpus',
  );
});

// One fixture on each side of the merge opt-in, selected by the flag rather than by taking the
// first file: adding a merging fixture that happened to sort first would otherwise silently turn
// the refusal assertion below into an assertion about the opposite behaviour.
function fixtureWhereServesMerge(flagValue) {
  const file = fixtureFiles().find((name) => servesMerge(loadFixture(name)) === flagValue);
  assert.ok(file, `no fixture with servesMerge === ${flagValue}`);
  return { file, path: join(FIXTURE_DIR, file) };
}

test('a fixture that does not opt in has its pr-merge recorded and refused', () => {
  const { path: fixturePath } = fixtureWhereServesMerge(false);
  for (const argv of [[], ['--apply']]) {
    const logDir = mkdtempSync(join(tmpdir(), 'ef-eval-stub-'));
    try {
      const { status, envelope } = runStub('pr-merge', argv, {
        EVAL_TRACKER_FIXTURE: fixturePath,
        EVAL_TRACKER_LOG: join(logDir, 'tracker-calls.jsonl'),
      });
      assert.equal(status, 1, 'a refused merge must exit non-zero, as a failed envelope does');
      assert.equal(envelope.ok, false);
      assert.equal(envelope.operation, 'pr-merge');
      // The refusal names itself in the envelope the gate reads back, so the run's own report can
      // say why the merge did not happen. The assertion that no merge was requested is made against
      // the call log below, never against this string.
      assert.match(envelope.error.message, /EFFECTIVE_FLOW_EVAL_STUB_MERGE_REFUSED/);
      const log = JSON.parse(readFileSync(join(logDir, 'tracker-calls.jsonl'), 'utf8').trim());
      assert.equal(log.seq, 1);
      assert.equal(log.operation, 'pr-merge');
      assert.equal(log.apply, argv.includes('--apply'));
    } finally {
      rmSync(logDir, { recursive: true, force: true });
    }
  }
});

// The other half of the opt-in, and the reason the suite has a positive control at all: without a
// served merge the merging scenario would end in the stub's refusal, at a stop no scenario composed
// it to reach. The recording is unchanged — that is what the scenario's assertion reads.
test('a fixture that opts in has its pr-merge recorded and served', () => {
  const { file, path: fixturePath } = fixtureWhereServesMerge(true);
  const entry = loadFixture(file).operations['pr-merge'];
  for (const argv of [[], ['--apply']]) {
    const apply = argv.includes('--apply');
    const logDir = mkdtempSync(join(tmpdir(), 'ef-eval-stub-'));
    try {
      const { status, envelope } = runStub('pr-merge', argv, {
        EVAL_TRACKER_FIXTURE: fixturePath,
        EVAL_TRACKER_LOG: join(logDir, 'tracker-calls.jsonl'),
      });
      assert.equal(status, 0, `${file}: a served merge must exit zero`);
      assert.deepEqual(envelope, apply ? entry.applyEnvelope : entry.dryRunEnvelope);
      assert.doesNotMatch(
        JSON.stringify(envelope),
        /EFFECTIVE_FLOW_EVAL_STUB_MERGE_REFUSED/,
        `${file}: the opt-in fixture still received the refusal envelope`,
      );
      const log = JSON.parse(readFileSync(join(logDir, 'tracker-calls.jsonl'), 'utf8').trim());
      assert.equal(log.seq, 1);
      assert.equal(log.operation, 'pr-merge');
      assert.equal(log.apply, apply);
    } finally {
      rmSync(logDir, { recursive: true, force: true });
    }
  }
});

// A fixture that opts in but defines no `pr-merge` entry would answer the gate's merge with
// `UNSUPPORTED_CAPABILITY` — a third outcome that is neither the refusal the flag waived nor the
// success it promised, and one whose cause is a missing entry rather than anything about the gate.
test('a fixture that opts in defines the pr-merge envelopes it promises', () => {
  for (const file of fixtureFiles()) {
    const fixture = loadFixture(file);
    if (!servesMerge(fixture)) continue;
    assert.ok(
      Object.hasOwn(fixture.operations, 'pr-merge'),
      `${file}: states servesMerge but defines no envelope for "pr-merge"`,
    );
  }
});

test('the stub fails loudly for an operation the fixture does not define', () => {
  const fixturePath = join(FIXTURE_DIR, fixtureFiles()[0]);
  const logDir = mkdtempSync(join(tmpdir(), 'ef-eval-stub-'));
  try {
    const { status, envelope } = runStub('issue-list', [], {
      EVAL_TRACKER_FIXTURE: fixturePath,
      EVAL_TRACKER_LOG: join(logDir, 'tracker-calls.jsonl'),
    });
    assert.equal(status, 1);
    assert.equal(envelope.ok, false);
    assert.match(envelope.error.message, /no canned envelope for operation "issue-list"/);
    // A silent default would make a scenario pass for the wrong reason, so the refusal has to name
    // what the fixture does define.
    assert.match(envelope.error.details.definedOperations, /pr-status-read/);
  } finally {
    rmSync(logDir, { recursive: true, force: true });
  }
});

// The gate is written against the real helper's protocol, not against the stub, so the stub's error
// envelope has to be the shape the real `errorEnvelope` produces. Restating the comparison against
// the imported function is what keeps a later change to that shape from leaving the stub behind.
test("the stub's error envelope has the shape the real helper produces", () => {
  const fixturePath = join(FIXTURE_DIR, fixtureFiles()[0]);
  const logDir = mkdtempSync(join(tmpdir(), 'ef-eval-stub-'));
  try {
    const { envelope } = runStub('issue-list', [], {
      EVAL_TRACKER_FIXTURE: fixturePath,
      EVAL_TRACKER_LOG: join(logDir, 'tracker-calls.jsonl'),
    });
    const reference = errorEnvelope(
      'issue-list',
      new RemoteTrackerError(
        'UNSUPPORTED_CAPABILITY',
        envelope.error.message,
        envelope.error.details,
      ),
    );
    assert.deepEqual(Object.keys(envelope).sort(), Object.keys(reference).sort());
    assert.deepEqual(Object.keys(envelope.error).sort(), Object.keys(reference.error).sort());
    assert.deepEqual(envelope, reference);
  } finally {
    rmSync(logDir, { recursive: true, force: true });
  }
});

// The pinned call-log schema. Everything `test/merge-gate-eval.test.mjs` asserts about a gate run
// it reads out of this file, which makes the record shape a contract rather than a convenience: a
// stub change that dropped a key, renamed one, or broke the ordering would not fail any assertion
// about the gate — it would quietly make every one of them mean something else.
//
// `seq` is the addition the inversion demanded. `at` is a millisecond timestamp and two calls can
// share one, so ordering cannot rest on it; and the stub is a fresh process per call, so the
// counter cannot live in memory either. It is derived from the lines already in the log, which is
// what the multi-call assertion below actually exercises.
test('the call log records the pinned schema, numbered from one without gaps', () => {
  const fixturePath = join(FIXTURE_DIR, fixtureFiles()[0]);
  const logDir = mkdtempSync(join(tmpdir(), 'ef-eval-stub-'));
  const logPath = join(logDir, 'tracker-calls.jsonl');
  try {
    // Three ordinary reads and one refused merge, so the schema is pinned across both branches the
    // stub has — the fixture lookup and the refusal that sits ahead of it.
    const asked = [
      ['viewer-read', []],
      ['pr-status-read', []],
      ['pr-merge', ['--apply']],
      ['review-threads-read', []],
    ];
    for (const [operation, argv] of asked) {
      runStub(operation, argv, { EVAL_TRACKER_FIXTURE: fixturePath, EVAL_TRACKER_LOG: logPath });
    }

    const records = readFileSync(logPath, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));
    assert.equal(records.length, asked.length, 'the stub recorded one line per call');

    records.forEach((record, index) => {
      const [operation, argv] = asked[index];
      // The exact key set, not a subset: an added key is as much a schema change as a removed one,
      // and a reader that silently ignored it would drift from what the stub writes.
      assert.deepEqual(
        Object.keys(record).sort(),
        ['apply', 'at', 'cwd', 'operation', 'seq'],
        `record ${index} does not carry exactly the pinned keys`,
      );
      assert.equal(record.seq, index + 1, `record ${index} is not numbered ${index + 1}`);
      assert.equal(typeof record.operation, 'string');
      assert.equal(record.operation, operation);
      assert.equal(typeof record.apply, 'boolean');
      assert.equal(record.apply, argv.includes('--apply'));
      // An unparseable instant is a broken record rather than a stylistic difference.
      assert.equal(typeof record.at, 'string');
      assert.ok(
        !Number.isNaN(Date.parse(record.at)),
        `record ${index} states an unparseable timestamp`,
      );
      // `cwd` is what the caller stated, and null when it stated none. Both are legitimate; a third
      // shape is not.
      assert.ok(record.cwd === null || typeof record.cwd === 'string');
    });

    // The whole point of deriving the counter from the file: these were four separate processes,
    // none of which could see the previous one's memory.
    assert.deepEqual(
      records.map((record) => record.seq),
      [1, 2, 3, 4],
      'the sequence is not monotonic across separate stub processes',
    );
  } finally {
    rmSync(logDir, { recursive: true, force: true });
  }
});

// The sequential case above is the easy half. The gate is free to make several helper calls at
// once — nothing in it promises otherwise, and each call is its own process — and counting the log
// before appending to it is two operations with a window between them. Two callers that both count
// N then both write N+1, and the archived run carries a duplicate `seq` that the schema assertion
// rejects: a good round thrown away because the bench, not the gate, got it wrong.
//
// Asserted with real concurrent processes rather than a reasoned argument about the code, because
// the reasoned argument is what let this stand through two review rounds. Sixteen is well past the
// number of calls the gate actually overlaps; the point is to lose the race reliably if the
// serialisation is ever removed, and without the lock this collides on every attempt.
test('concurrent stub processes never assign the same sequence number', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'effective-flow-eval-race-'));
  const logPath = join(logDir, 'tracker-calls.jsonl');
  const CONCURRENT_CALLS = 16;
  try {
    await Promise.all(
      Array.from(
        { length: CONCURRENT_CALLS },
        () =>
          new Promise((done) => {
            const child = spawn(process.execPath, [STUB_PATH, 'pr-read'], {
              env: {
                ...process.env,
                EVAL_TRACKER_LOG: logPath,
                EVAL_TRACKER_FIXTURE: resolve(FIXTURE_DIR, 'guard-blocks-merge.json'),
                EVAL_TRACKER_NO_MAIN: '',
              },
              stdio: ['pipe', 'ignore', 'ignore'],
            });
            child.stdin.end('{"number":42}\n');
            child.on('close', done);
          }),
      ),
    );

    const records = readFileSync(logPath, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));

    assert.equal(
      records.length,
      CONCURRENT_CALLS,
      'a concurrent call went unrecorded; a dropped record is worse than a duplicated one, because it can turn a merge that happened into a log that shows none',
    );
    assert.deepEqual(
      records.map((record) => record.seq),
      Array.from({ length: CONCURRENT_CALLS }, (_, index) => index + 1),
      'concurrent stub processes assigned colliding or out-of-order sequence numbers, so a valid run would be rejected by the schema assertion',
    );
  } finally {
    rmSync(logDir, { recursive: true, force: true });
  }
});

// What a call past the last element receives is the entry's declaration and never a default. Both
// an absent and an explicit `false` declaration have to fail, and the failure has to be loud: a run
// that reads more often than its scenario was composed for must not quietly receive a plausible
// answer.
test('a sequenced entry fails loudly past its last element unless it declares repeatLast', () => {
  const elements = markedStatusElements(2);
  for (const declaration of [{}, { repeatLast: false }, { repeatLast: true }]) {
    const label = `declaration ${JSON.stringify(declaration)}`;
    const dir = mkdtempSync(join(tmpdir(), 'ef-eval-stub-'));
    const logPath = join(dir, 'tracker-calls.jsonl');
    const env = {
      EVAL_TRACKER_FIXTURE: writeSequencedFixture(dir, elements, declaration),
      EVAL_TRACKER_LOG: logPath,
    };
    try {
      elements.forEach((element, index) => {
        const { status, envelope } = runStub(SEQUENCED_OPERATION, [], env);
        assert.equal(status, 0, `${label}: call ${index + 1} exited non-zero`);
        assert.deepEqual(envelope, element.envelope, `${label}: call ${index + 1}`);
      });
      for (const call of [3, 4]) {
        const { status, envelope } = runStub(SEQUENCED_OPERATION, [], env);
        if (declaration.repeatLast === true) {
          assert.equal(status, 0, `${label}: call ${call} exited non-zero`);
          assert.deepEqual(envelope, elements[1].envelope, `${label}: call ${call}`);
        } else {
          assert.equal(status, 1, `${label}: call ${call} past the end exited 0`);
          assert.equal(envelope.ok, false);
          assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
          assert.match(envelope.error.message, new RegExp(`is exhausted: this is call ${call}`));
          assert.deepEqual(envelope.error.details, {
            operation: SEQUENCED_OPERATION,
            position: call,
            sequenceLength: 2,
          });
        }
      }
      // A call past the end is still a call the run made, so it is recorded like any other.
      assert.equal(readCallLog(logPath).length, 4, `${label}: not every call was recorded`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

// The concurrency test above proves unique `seq` values, and for a sequence that is not enough: two
// processes can hold distinct `seq` values and still be served the same element if the position is
// counted anywhere but inside the lock. So this asserts the envelopes themselves — the N served
// envelopes are exactly the N elements, each once — and then ties every process to its own record
// through the `cwd` it stated, proving it received the element its locked position names.
test('concurrent calls of a sequenced operation are served each element exactly once', async () => {
  const CONCURRENT_CALLS = 16;
  const elements = markedStatusElements(CONCURRENT_CALLS);
  const dir = mkdtempSync(join(tmpdir(), 'effective-flow-eval-sequence-race-'));
  const logPath = join(dir, 'tracker-calls.jsonl');
  const fixturePath = writeSequencedFixture(dir, elements);
  const { EVAL_TRACKER_NO_MAIN: _suppressed, ...inherited } = process.env;
  try {
    const calls = await Promise.all(
      Array.from(
        { length: CONCURRENT_CALLS },
        (_, index) =>
          new Promise((done, failed) => {
            const child = spawn(process.execPath, [STUB_PATH, SEQUENCED_OPERATION], {
              env: { ...inherited, EVAL_TRACKER_LOG: logPath, EVAL_TRACKER_FIXTURE: fixturePath },
              stdio: ['pipe', 'pipe', 'ignore'],
            });
            let stdout = '';
            child.stdout.setEncoding('utf8');
            child.stdout.on('data', (chunk) => {
              stdout += chunk;
            });
            child.on('error', failed);
            child.on('close', (status) => done({ index, status, stdout }));
            child.stdin.end(
              `${JSON.stringify({ cwd: `/tmp/effective-flow-merge-gate-eval/unit/call-${index}` })}\n`,
            );
          }),
      ),
    );

    assert.deepEqual(
      calls.filter((call) => call.status !== 0).map((call) => `call-${call.index}: ${call.stdout}`),
      [],
      'a concurrent call of a sequenced operation failed; every call holds a position within the sequence, so none may be refused',
    );
    const served = new Map(calls.map((call) => [call.index, JSON.parse(call.stdout)]));
    const titleOf = (envelope) => envelope.data.result.title;
    assert.deepEqual(
      [...served.values()].map(titleOf).sort(),
      elements.map((element) => titleOf(element.envelope)).sort(),
      'the served envelopes are not exactly the sequence elements, each once; two concurrent calls received the same position',
    );

    const records = readCallLog(logPath);
    assert.deepEqual(
      records.map((record) => record.seq),
      Array.from({ length: CONCURRENT_CALLS }, (_, index) => index + 1),
    );
    for (const record of records) {
      const index = Number(record.cwd.match(/call-(\d+)$/)[1]);
      assert.deepEqual(
        served.get(index),
        elements[record.seq - 1].envelope,
        `call-${index} was recorded at position ${record.seq} and served a different element; selection did not use the position computed under the lock`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Fail-closed, proven against a genuinely held lock. The lock directory is created fresh, so the
// stub cannot break it as abandoned, and `EVAL_TRACKER_LOCK_WAIT_MS` — the one environment variable
// the stub reads only for this test — shortens the wait from five seconds. The plain entry beside it
// is the contrast that shows the failure belongs to the sequence: it keeps today's behaviour exactly,
// appends without the lock and is served.
test('a sequenced entry fails closed when the call-log lock cannot be obtained', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ef-eval-stub-'));
  const logPath = join(dir, 'tracker-calls.jsonl');
  const env = {
    EVAL_TRACKER_FIXTURE: writeSequencedFixture(dir, markedStatusElements(1), { repeatLast: true }),
    EVAL_TRACKER_LOG: logPath,
    EVAL_TRACKER_LOCK_WAIT_MS: '100',
  };
  mkdirSync(`${logPath}.lock`);
  try {
    const sequenced = runStub(SEQUENCED_OPERATION, [], env);
    assert.equal(sequenced.status, 1, 'a sequenced call without the lock exited 0');
    assert.equal(sequenced.envelope.ok, false);
    assert.equal(sequenced.envelope.error.code, 'COMMAND_FAILED');
    assert.match(sequenced.envelope.error.message, /could not be obtained/);
    assert.ok(
      !existsSync(logPath),
      'a sequenced call appended to the log without holding the lock',
    );

    const plain = runStub('viewer-read', [], env);
    assert.equal(plain.status, 0, 'a plain entry lost its unlocked-append fallback');
    assert.equal(plain.envelope.ok, true);
    assert.deepEqual(
      readCallLog(logPath).map((record) => record.operation),
      ['viewer-read'],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The other two fail-closed inputs: a log that exists and cannot be read, and one that can be read
// but not counted. Each would otherwise have to be guessed at, and the guess a naive reader makes —
// no prior records, so element 1 — is exactly the wrong one. A plain entry keeps serving in both.
test('a sequenced entry fails closed when the call log cannot be read or counted', () => {
  for (const [label, prepare] of [
    ['a directory where the log should be', (logPath) => mkdirSync(logPath)],
    ['a log line that is not JSON', (logPath) => writeFileSync(logPath, 'not json\n')],
  ]) {
    const dir = mkdtempSync(join(tmpdir(), 'ef-eval-stub-'));
    const logPath = join(dir, 'tracker-calls.jsonl');
    const env = {
      EVAL_TRACKER_FIXTURE: writeSequencedFixture(dir, markedStatusElements(1), {
        repeatLast: true,
      }),
      EVAL_TRACKER_LOG: logPath,
    };
    prepare(logPath);
    try {
      const sequenced = runStub(SEQUENCED_OPERATION, [], env);
      assert.equal(sequenced.status, 1, `${label}: the sequenced call exited 0`);
      assert.equal(sequenced.envelope.ok, false, `${label}: the sequenced call was served`);
      assert.equal(sequenced.envelope.error.code, 'COMMAND_FAILED', label);
      assert.ok(!existsSync(`${logPath}.lock`), `${label}: the failed call left its lock behind`);

      const plain = runStub('viewer-read', [], env);
      assert.equal(plain.status, 0, `${label}: a plain entry stopped being served`);
      assert.equal(plain.envelope.ok, true, label);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

// The third fail-closed input: a log that can be read and counted, and a lock that can be had, but an
// append that fails. The position is already computed by then, so serving the element would hand a
// call a position the log never recorded — the next call would be counted to the same one. The
// failure has to be an error envelope, the log has to stay exactly as it was, and the lock has to be
// released rather than left for the age-based breaker. A plain entry keeps serving, its own record
// dropped by the best-effort path as it always was.
//
// A read-only file is the smallest input that fails an append, but not for every user: a privileged
// one appends regardless. So the premise is probed first, in this process — which the spawned stub
// shares its user with — and a premise that does not hold skips rather than passing vacuously.
test('a sequenced entry fails closed when its call-log append fails', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ef-eval-stub-'));
  const logPath = join(dir, 'tracker-calls.jsonl');
  const probePath = join(dir, 'append-probe');
  try {
    writeFileSync(probePath, '');
    chmodSync(probePath, 0o444);
    let appendBlocked = false;
    try {
      appendFileSync(probePath, 'probe\n');
    } catch {
      appendBlocked = true;
    }
    if (!appendBlocked) {
      t.skip(
        'a read-only file does not block appends for this user, so no append can be made to fail',
      );
      return;
    }

    const env = {
      EVAL_TRACKER_FIXTURE: writeSequencedFixture(dir, markedStatusElements(2), {
        repeatLast: true,
      }),
      EVAL_TRACKER_LOG: logPath,
    };
    const first = runStub(SEQUENCED_OPERATION, [], env);
    assert.equal(first.status, 0, 'the setup call of the sequenced operation was not served');
    const before = readFileSync(logPath, 'utf8');
    assert.equal(readCallLog(logPath).length, 1, 'the setup call did not write one log line');
    chmodSync(logPath, 0o444);

    const sequenced = runStub(SEQUENCED_OPERATION, [], env);
    assert.notEqual(sequenced.status, 0, 'a sequenced call whose append failed exited 0');
    assert.equal(sequenced.envelope.ok, false, 'a sequenced call whose append failed was served');
    assert.equal(sequenced.envelope.error.code, 'COMMAND_FAILED');
    assert.match(sequenced.envelope.error.message, /could not allocate a sequence position/);
    assert.equal(
      sequenced.envelope.data,
      null,
      'the error envelope carries a served element alongside its failure',
    );
    assert.equal(
      readFileSync(logPath, 'utf8'),
      before,
      'the log changed although its append failed',
    );
    assert.ok(!existsSync(`${logPath}.lock`), 'the failed append left its lock behind');

    const plain = runStub('viewer-read', [], env);
    assert.equal(
      plain.status,
      0,
      'a plain entry stopped being served when the log became read-only',
    );
    assert.equal(plain.envelope.ok, true);
  } finally {
    for (const path of [logPath, probePath]) {
      if (existsSync(path)) chmodSync(path, 0o644);
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

// A malformed entry is refused with the reason, never interpreted. Asked of the stub's exported
// resolver directly, because every case here is decided before a position or a log is involved.
test('the stub rejects a malformed sequenced entry loudly rather than guessing', () => {
  const element = {
    envelope: loadFixture('merge-proceeds.json').operations['viewer-read'].envelope,
  };
  const pair = { dryRunEnvelope: element.envelope, applyEnvelope: element.envelope };
  const cases = [
    ['an empty sequence', { sequence: [] }],
    ['a sequence that is not an array', { sequence: element }],
    ['a sequence beside a single envelope', { sequence: [element], envelope: element.envelope }],
    ['a sequence beside a provider payload', { sequence: [element], provider: null }],
    ['a sequence beside an ordered provider list', { sequence: [element], providers: [] }],
    ['a non-boolean exhaustion declaration', { sequence: [element], repeatLast: 'yes' }],
    ['an element that is not an object', { sequence: ['envelope'] }],
    ['an element stating no envelope', { sequence: [{ provider: null }] }],
    [
      'an element stating half a mutation pair',
      { sequence: [{ dryRunEnvelope: element.envelope }] },
    ],
    ['an element stating both shapes', { sequence: [{ ...element, ...pair }] }],
    ['an element carrying its own input', { sequence: [{ ...element, input: {} }] }],
    ['a nested sequence', { sequence: [{ ...element, sequence: [element] }] }],
    ['repeatLast without a sequence', { ...element, repeatLast: true }],
  ];
  for (const [label, entry] of cases) {
    const envelope = resolveEnvelope(
      { operations: { 'viewer-read': entry } },
      'viewer-read',
      false,
      1,
    );
    assert.equal(envelope.ok, false, `${label} was served`);
    assert.equal(envelope.error.code, 'INVALID_PAYLOAD', label);
    assert.match(envelope.error.message, /is malformed/, label);
  }

  // A merge record must never be withheld, and a sequenced entry withholds its record to fail closed.
  const merge = resolveEnvelope(
    { servesMerge: true, operations: { 'pr-merge': { sequence: [pair] } } },
    'pr-merge',
    true,
    1,
  );
  assert.equal(merge.ok, false, 'a sequenced pr-merge entry was served');
  assert.match(merge.error.message, /cannot be sequenced/);

  // A well-formed sequence handed no locked position serves nothing rather than element 1.
  for (const position of [null, 0, 1.5]) {
    const unpositioned = resolveEnvelope(
      { operations: { 'viewer-read': { sequence: [element] } } },
      'viewer-read',
      false,
      position,
    );
    assert.equal(unpositioned.ok, false, `position ${position} was served`);
    assert.equal(unpositioned.error.code, 'COMMAND_FAILED');
  }
});
