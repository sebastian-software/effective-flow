// Unit tests of the shared liveness-aware marker wait in `test/support/marker-wait.mjs`: it
// resolves on the marker, fails promptly with the writer's outcome once the writer settles without
// it, and falls back to its backstop only for a writer that neither writes nor settles.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';

import { waitForMarker } from './support/marker-wait.mjs';

function scratch(t) {
  const directory = mkdtempSync(join(tmpdir(), 'effective-flow-marker-wait-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function exited(child) {
  return new Promise((resolveResult) => {
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code, signal) => resolveResult({ code, signal, stderr }));
  });
}

// Invariant: the wait resolves once the marker exists, while its writer is still running.
test('waitForMarker resolves once the marker appears', async (t) => {
  const marker = join(scratch(t), 'marker');
  setTimeout(() => writeFileSync(marker, ''), 50);
  await waitForMarker(marker, { settled: new Promise(() => {}) });
});

// Invariant: a writer that exits without the marker fails the wait promptly, under the default
// backstop, and the message carries the marker, the exit code and the stderr.
test('waitForMarker rejects promptly with the outcome when the writer exits first', async (t) => {
  const marker = join(scratch(t), 'marker');
  const child = spawn(
    process.execPath,
    ['--eval', 'process.stderr.write("writer crashed before its marker"); process.exit(1)'],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  // Measured from the writer's exit, so a slow child start on a loaded host cannot skew it.
  let exitedAt;
  const settled = exited(child).then((result) => ((exitedAt = Date.now()), result));
  await assert.rejects(
    waitForMarker(marker, {
      settled,
      describe: ({ code, stderr }) => `code ${code}: ${stderr}`,
    }),
    (error) => {
      assert.match(error.message, /marker never appeared/);
      assert.ok(error.message.includes(marker), error.message);
      assert.match(error.message, /code 1: writer crashed before its marker/);
      return true;
    },
  );
  assert.ok(Date.now() - exitedAt < 2000, 'the wait fails as soon as the writer settles');
});

// Invariant: the default `describe` renders the settled value as JSON.
test('waitForMarker describes a settled value as JSON by default', async (t) => {
  const marker = join(scratch(t), 'marker');
  await assert.rejects(
    waitForMarker(marker, { settled: Promise.resolve({ ok: false, code: 'GIT_FAILED' }) }),
    /settled first with \{"ok":false,"code":"GIT_FAILED"\}/,
  );
});

// Invariant: a writer that rejects first fails the wait with the rejection reason.
test('waitForMarker rejects with the reason when the writer rejects first', async (t) => {
  const marker = join(scratch(t), 'marker');
  const reason = new Error('writer threw');
  await assert.rejects(waitForMarker(marker, { settled: Promise.reject(reason) }), (error) => {
    assert.ok(error.message.includes(marker), error.message);
    assert.match(error.message, /rejected first: Error: writer threw/);
    assert.equal(error.cause, reason);
    return true;
  });
});

// Invariant: a marker written immediately before the writer settles is no false failure.
test('waitForMarker resolves when the marker lands right before the writer settles', async (t) => {
  const marker = join(scratch(t), 'marker');
  const settled = Promise.resolve().then(() => {
    writeFileSync(marker, '');
    return { code: 0 };
  });
  await waitForMarker(marker, { settled });
});

// Invariant: a path getter that never yields a path fails promptly once the writer settles,
// instead of waiting for a path that will never be known.
test('waitForMarker fails promptly when the path is still unknown as the writer settles', async () => {
  const started = Date.now();
  await assert.rejects(
    waitForMarker(() => undefined, { settled: delay(50).then(() => 'done') }),
    /a marker whose path was never known never appeared: its writer settled first with "done"/,
  );
  assert.ok(Date.now() - started < 2000);
});

// Invariant: a path getter resolves once the path becomes known and the marker exists.
test('waitForMarker follows a path getter once the path is known', async (t) => {
  const directory = scratch(t);
  let marker;
  setTimeout(() => {
    marker = join(directory, 'marker');
    writeFileSync(marker, '');
  }, 50);
  await waitForMarker(() => marker, { settled: new Promise(() => {}) });
});

// Invariant: the backstop fails a wait whose writer neither writes the marker nor settles.
test('waitForMarker times out at its backstop', async (t) => {
  const marker = join(scratch(t), 'marker');
  await assert.rejects(waitForMarker(marker, { settled: new Promise(() => {}), timeoutMs: 100 }), {
    message: `timed out after 100 ms waiting for ${marker}`,
  });
});

// Invariant: a writer rejecting after the wait has resolved causes no unhandled rejection.
test('waitForMarker leaves no unhandled rejection after a late writer rejection', async (t) => {
  const marker = join(scratch(t), 'marker');
  writeFileSync(marker, '');
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  t.after(() => process.off('unhandledRejection', onUnhandled));
  let rejectWriter;
  const settled = new Promise((_, reject) => (rejectWriter = reject));
  await waitForMarker(marker, { settled });
  rejectWriter(new Error('late writer failure'));
  await delay(50);
  assert.deepEqual(unhandled, []);
});
