import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  errorEnvelope,
  executeOperation,
  RemoteTrackerError,
} from '../src/scripts/remote-tracker-core.mjs';

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

// One canned provider response, delivered on whichever call the operation makes. Every read this
// corpus covers is a single command on GitHub, so a runner that answers identically is exact rather
// than merely sufficient; an operation that grew a second command would surface here as a
// normalizer failure instead of passing quietly.
function fakeRunner(stdout) {
  return async () => ({ status: 0, stdout, stderr: '' });
}

function runStub(operation, argv = [], env = {}) {
  const result = spawnSync(process.execPath, [STUB_PATH, operation, ...argv], {
    input: JSON.stringify({ cwd: '/tmp/effective-flow-merge-gate-eval/unit' }),
    encoding: 'utf8',
    env: { ...process.env, ...env },
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
      const produced = await executeOperation(
        operation,
        { repository: fixture.repository, probe: fixture.probe, ...(entry.input ?? {}) },
        {
          runner: fakeRunner(JSON.stringify(entry.provider)),
          // The probe is stated by the fixture rather than performed, so the corpus declares the
          // provider capabilities it assumes instead of inheriting whatever a live `gh` reports.
          skipProbe: true,
        },
      );
      assert.deepEqual(
        produced,
        entry.envelope,
        `${file}: the canned envelope for "${operation}" is not what executeOperation emits for its provider payload`,
      );
    }
  }
});

// The corpus has to cover the reads a gate run actually performs, or a scenario could pass because
// the run never got far enough to need one. These five are the operations WP2 names.
test('every fixture covers the read operations a gate run performs', () => {
  const required = [
    'viewer-read',
    'pr-status-read',
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
      for (const [operation, entry] of Object.entries(fixture.operations)) {
        const { status, envelope } = runStub(operation, [], {
          EVAL_TRACKER_FIXTURE: fixturePath,
          EVAL_TRACKER_LOG: join(logDir, 'tracker-calls.jsonl'),
        });
        assert.equal(status, 0, `${file}: the stub exited non-zero for "${operation}"`);
        assert.deepEqual(
          envelope,
          entry.envelope,
          `${file}: the stub altered the "${operation}" envelope`,
        );
      }
      // The call log is evidence for a human reading the sandbox afterwards, so it has to record
      // every operation the run asked for, in order.
      const log = readFileSync(join(logDir, 'tracker-calls.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.deepEqual(
        log.map((record) => record.operation),
        Object.keys(fixture.operations),
        `${file}: the stub's call log does not record every operation`,
      );
    } finally {
      rmSync(logDir, { recursive: true, force: true });
    }
  }
});

test('the stub records a pr-merge request and refuses to perform it', () => {
  const fixturePath = join(FIXTURE_DIR, fixtureFiles()[0]);
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
      // The marker a `regex` grader matches over the run trace. Its exact spelling is part of the
      // contract between this stub and `graders/no-merge-refused-marker.md`.
      assert.match(envelope.error.message, /EFFECTIVE_FLOW_EVAL_STUB_MERGE_REFUSED/);
      const log = JSON.parse(readFileSync(join(logDir, 'tracker-calls.jsonl'), 'utf8').trim());
      assert.equal(log.operation, 'pr-merge');
      assert.equal(log.apply, argv.includes('--apply'));
    } finally {
      rmSync(logDir, { recursive: true, force: true });
    }
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
