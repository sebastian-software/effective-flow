// The closed argv of `remote-tracker.mjs` and of its eval stand-in: exactly `<operation>` or
// `<operation> --apply`, the operation first, `--apply` only for a forge mutation, refused before
// standard input is read. That closure is what makes the trailing `*` of the read-only allow rules
// safe, and the stub mirrors it so an eval run sees the refusal the shipped helper gives.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  MUTATION_OPERATIONS,
  REMOTE_TRACKER_OPERATIONS,
  isMutationOperation,
} from '../src/scripts/remote-tracker-core.mjs';
import { main, parseArgv } from '../src/scripts/remote-tracker.mjs';

const STUB = fileURLToPath(new URL('../evals/_scaffold/remote-tracker.mjs', import.meta.url));
process.env.EVAL_TRACKER_NO_MAIN = '1';
const stub = await import('../evals/_scaffold/remote-tracker.mjs');

const REFUSED_ARGV = Object.freeze([
  [],
  ['--apply'],
  ['--help'],
  ['--apply', 'pr-merge'],
  ['pr-read', '--apply'],
  ['body-hash', '--apply'],
  ['thread-ledger-record', '--apply'],
  ['pr-merge', '--apply', '--apply'],
  ['pr-merge', '--force'],
  ['pr-read', 'pr-merge'],
  ['pr-read', '--apply', 'extra'],
  ['', '--apply'],
]);

// A stdin that fails the test the moment anything iterates it.
function untouchableStdin() {
  return {
    setEncoding() {},
    [Symbol.asyncIterator]() {
      throw new Error('stdin must not be read for a refused argv');
    },
  };
}

function quietIo(extra = {}) {
  const written = [];
  return {
    io: {
      stdout: { write: (line) => written.push(line) },
      stderr: { write: () => {} },
      setExitCode: () => {},
      ...extra,
    },
    written,
  };
}

// Invariant: every argv other than `<operation>` or `<mutation> --apply` is INVALID_PAYLOAD with
// the usage line, before stdin is read.
test('remote-tracker.mjs refuses every other argv before reading stdin', async () => {
  for (const argv of REFUSED_ARGV) {
    const { io } = quietIo({ stdin: untouchableStdin() });
    const envelope = await main(argv, io);
    assert.equal(envelope.ok, false, JSON.stringify(argv));
    assert.equal(envelope.error.code, 'INVALID_PAYLOAD', JSON.stringify(argv));
    assert.match(envelope.error.message, /usage: remote-tracker\.mjs <operation> \[--apply\]/);
    assert.throws(() => parseArgv(argv), { code: 'INVALID_PAYLOAD' }, JSON.stringify(argv));
  }
});

// Invariant: an operation outside REMOTE_TRACKER_OPERATIONS, such as a typo, is INVALID_PAYLOAD
// before stdin is read, so a mistyped call never waits on standard input.
test('remote-tracker.mjs refuses an unknown operation before reading stdin', async () => {
  for (const argv of [['pr-raed'], ['pr-mrege', '--apply'], ['PR-READ']]) {
    const { io } = quietIo({ stdin: untouchableStdin() });
    const envelope = await main(argv, io);
    assert.equal(envelope.ok, false, JSON.stringify(argv));
    assert.equal(envelope.error.code, 'INVALID_PAYLOAD', JSON.stringify(argv));
    assert.match(envelope.error.message, /is not a remote-tracker operation; usage:/);
  }
  for (const operation of REMOTE_TRACKER_OPERATIONS) {
    assert.equal(parseArgv([operation]).operation, operation);
  }
});

// Invariant: `<operation>` and `<mutation> --apply` pass, and an empty stdin still parses as `{}`.
test('remote-tracker.mjs accepts an operation alone and a mutation with --apply', async () => {
  assert.deepEqual(parseArgv(['pr-read']), { operation: 'pr-read', apply: false });
  assert.deepEqual(parseArgv(['pr-merge']), { operation: 'pr-merge', apply: false });
  for (const mutation of MUTATION_OPERATIONS) {
    assert.deepEqual(parseArgv([mutation, '--apply']), { operation: mutation, apply: true });
  }
  const { io } = quietIo({ stdin: Readable.from(['']) });
  const envelope = await main(['body-hash'], io);
  assert.equal(envelope.operation, 'body-hash');
  assert.doesNotMatch(JSON.stringify(envelope), /invalid JSON input|usage:/);
});

// Invariant: the stub's own mutation list equals the core's classification, and the stub refuses
// exactly the argv the shipped helper refuses.
test('the eval stub mirrors the shipped argv check and mutation list', () => {
  assert.deepEqual([...stub.STUB_MUTATION_OPERATIONS].sort(), [...MUTATION_OPERATIONS].sort());
  for (const operation of stub.STUB_MUTATION_OPERATIONS) {
    assert.equal(isMutationOperation(operation), true, operation);
  }
  for (const argv of REFUSED_ARGV) {
    assert.equal(typeof stub.parseStubArgv(argv).refusal, 'string', JSON.stringify(argv));
  }
  assert.deepEqual(stub.parseStubArgv(['pr-read']), { operation: 'pr-read', apply: false });
  assert.deepEqual(stub.parseStubArgv(['pr-merge', '--apply']), {
    operation: 'pr-merge',
    apply: true,
  });
});

// Invariant: the stub process refuses a bad argv with the helper's error envelope, without reading
// its fixture or recording a call.
test('the eval stub process refuses a bad argv before recording anything', () => {
  const logDir = mkdtempSync(join(tmpdir(), 'ef-eval-stub-argv-'));
  try {
    const log = join(logDir, 'tracker-calls.jsonl');
    for (const argv of [['pr-read', '--apply'], ['--apply', 'pr-merge'], []]) {
      const result = spawnSync(process.execPath, [STUB, ...argv], {
        input: '{}',
        encoding: 'utf8',
        env: {
          ...process.env,
          EVAL_TRACKER_NO_MAIN: '0',
          EVAL_TRACKER_FIXTURE: join(logDir, 'missing-fixture.json'),
          EVAL_TRACKER_LOG: log,
        },
      });
      assert.equal(result.status, 1, JSON.stringify(argv));
      const envelope = JSON.parse(result.stdout);
      assert.equal(envelope.ok, false);
      assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
      assert.match(envelope.error.message, /usage: remote-tracker\.mjs/);
    }
    assert.equal(existsSync(log), false, 'a refused argv records no call');
  } finally {
    rmSync(logDir, { recursive: true, force: true });
  }
});
