import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
const { servesMerge } = await import('../evals/merge-gate/_scaffold/remote-tracker.mjs');

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

    for (const [operation, entry] of Object.entries(fixture.operations)) {
      for (const { apply, envelope } of statedEnvelopes(file, operation, entry)) {
        const runner = runnerFor(entry);
        const produced = await executeOperation(
          operation,
          { repository: fixture.repository, probe: fixture.probe, ...(entry.input ?? {}) },
          {
            runner,
            // The probe is stated by the fixture rather than performed, so the corpus declares the
            // provider capabilities it assumes instead of inheriting whatever a live `gh` reports.
            skipProbe: true,
            ...(apply ? { apply: true } : {}),
          },
        );
        assert.deepEqual(
          produced,
          envelope,
          `${file}: the canned ${apply ? 'apply' : 'dry-run'} envelope for "${operation}" is not what executeOperation emits for its provider payload`,
        );
        // Only the applied call issues every command a mutation has; a dry run returns its preview
        // before the first one, so its unconsumed responses say nothing.
        if (apply) runner.assertDrained(`${file}: "${operation}"`);
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
