import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';

import {
  createProcessRunner,
  terminateActiveProcessGroups,
} from '../src/scripts/process-runner.mjs';

// POSIX process groups are the subject of most tests here; Windows falls back to the direct mode.
const POSIX = process.platform !== 'win32';

// A Node child fixture. `leader <exit|hang> <none|group|escaped>`: the leader prints its pid, starts
// an optional stdout holder and then either ends on its own or runs until it is stopped. A `group`
// holder stays in the leader's process group; an `escaped` one is spawned detached (its own
// session) and unreferenced, so it leaves the group but still holds the inherited stdout.
const FIXTURE = `
const { spawn } = require('node:child_process');
const [mode, holder] = process.argv.slice(2);
process.stdout.write('leader ' + process.pid + '\\n');
if (holder !== 'none') {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: holder === 'escaped',
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  process.stdout.write('holder ' + child.pid + '\\n');
  child.unref();
}
if (mode === 'hang') setInterval(() => {}, 1000);
`;

function fixture(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-process-runner-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'leader.cjs');
  writeFileSync(file, FIXTURE);
  return { directory, file };
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function pidOf(stdout, role) {
  const match = String(stdout).match(new RegExp(`^${role} (\\d+)$`, 'm'));
  return match ? Number(match[1]) : null;
}

// Every holder is killed after its test, whatever the runner did, so no process outlives the suite.
function reapHolder(t, stdout) {
  const pid = pidOf(stdout, 'holder');
  if (pid !== null) {
    t.after(() => {
      if (processAlive(pid)) process.kill(pid, 'SIGKILL');
    });
  }
  return pid;
}

async function waitUntilGone(pid, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (processAlive(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return !processAlive(pid);
}

async function timedRun(call) {
  const started = Date.now();
  const result = await createProcessRunner()(call);
  return { result, elapsed: Date.now() - started };
}

function leaderCall(file, mode, holder, timeoutMs) {
  return {
    executable: process.execPath,
    args: [file, mode, holder],
    timeoutMs,
    processGroup: true,
  };
}

test(
  'group mode: a leader that exited 0 before the bound keeps its status and no timedOut when an escaped holder keeps stdout open',
  { skip: !POSIX },
  async (t) => {
    const { file } = fixture(t);
    const { result, elapsed } = await timedRun(leaderCall(file, 'exit', 'escaped', 500));
    const holder = reapHolder(t, result.stdout);
    assert.equal(result.status, 0);
    assert.equal(result.timedOut, undefined, 'the bound is not reported for a finished leader');
    assert.equal(result.forcedKill, undefined);
    assert.ok(pidOf(result.stdout, 'leader') !== null, 'the leader output is kept');
    assert.ok(holder !== null && processAlive(holder), 'the escaped holder is out of reach');
    assert.ok(elapsed < 3000, `settled after ${elapsed} ms`);
  },
);

test(
  'group mode: a leader that exited 0 while a holder stayed in its group keeps its status, and the holder is stopped',
  { skip: !POSIX },
  async (t) => {
    const { file } = fixture(t);
    const { result, elapsed } = await timedRun(leaderCall(file, 'exit', 'group', 500));
    const holder = reapHolder(t, result.stdout);
    assert.equal(result.status, 0);
    assert.equal(result.timedOut, undefined);
    assert.ok(elapsed < 3000, `settled after ${elapsed} ms`);
    assert.ok(holder !== null);
    assert.equal(await waitUntilGone(holder), true, 'the group member was killed');
  },
);

test(
  'group mode: a hanging leader is timedOut and settles after the kill although an escaped holder keeps stdout open',
  { skip: !POSIX },
  async (t) => {
    const { file } = fixture(t);
    const { result, elapsed } = await timedRun(leaderCall(file, 'hang', 'escaped', 500));
    reapHolder(t, result.stdout);
    assert.equal(result.timedOut, true);
    assert.equal(result.status, null);
    assert.equal(result.signal, 'SIGTERM');
    assert.ok(elapsed < 5000, `settled after ${elapsed} ms`);
    const leader = pidOf(result.stdout, 'leader');
    assert.equal(await waitUntilGone(leader), true, 'the leader is gone');
  },
);

test(
  'group mode: a leader that ends on its own without holders settles on close, unflagged',
  { skip: !POSIX },
  async (t) => {
    const { file } = fixture(t);
    const { result, elapsed } = await timedRun(leaderCall(file, 'exit', 'none', 5000));
    assert.equal(result.status, 0);
    assert.equal(result.timedOut, undefined);
    assert.ok(elapsed < 4000, `settled after ${elapsed} ms, before the bound`);
  },
);

test(
  'terminateActiveProcessGroups stops a group-mode call still in flight',
  { skip: !POSIX },
  async (t) => {
    const { file } = fixture(t);
    const pending = timedRun(leaderCall(file, 'hang', 'group', 60_000));
    await new Promise((resolve) => setTimeout(resolve, 300));
    terminateActiveProcessGroups('SIGKILL');
    const { result, elapsed } = await pending;
    const holder = reapHolder(t, result.stdout);
    assert.equal(result.signal, 'SIGKILL');
    assert.ok(elapsed < 5000, `settled after ${elapsed} ms, far below the bound`);
    assert.equal(await waitUntilGone(holder), true, 'the group member was killed too');
    // Nothing is left in flight, so a second call signals nothing.
    terminateActiveProcessGroups('SIGKILL');
  },
);

// Once a reaped leader's group was found empty, its group ID may be reused by an unrelated group,
// so the runner neither probes nor signals it again: not at the bound, and not on a CLI stop.
test(
  'group mode: a group found empty when the leader exited is never probed or signalled again',
  { skip: !POSIX },
  async (t) => {
    const { file } = fixture(t);
    const groupCalls = [];
    const originalKill = process.kill;
    process.kill = function recordingKill(pid, signal) {
      if (pid < 0) {
        try {
          const answer = originalKill.call(process, pid, signal);
          groupCalls.push({ pid, signal, reached: true });
          return answer;
        } catch (error) {
          groupCalls.push({ pid, signal, reached: false });
          throw error;
        }
      }
      return originalKill.call(process, pid, signal);
    };
    t.after(() => {
      process.kill = originalKill;
    });
    // The escaped holder keeps stdout open, so the call stays in flight after the leader exited.
    const pending = timedRun(leaderCall(file, 'exit', 'escaped', 2500));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    terminateActiveProcessGroups('SIGKILL');
    const { result } = await pending;
    process.kill = originalKill;
    reapHolder(t, result.stdout);
    assert.equal(result.status, 0);
    const leader = pidOf(result.stdout, 'leader');
    const calls = groupCalls.filter((call) => call.pid === -leader);
    assert.deepEqual(
      calls,
      [{ pid: -leader, signal: 0, reached: false }],
      'one probe when the leader exited, nothing after it',
    );
  },
);

test('stdoutBuffer: an unusable cwd is INVALID_CWD with an empty Buffer in both modes', async (t) => {
  const { directory } = fixture(t);
  const missing = join(directory, 'missing');
  const runner = createProcessRunner();
  for (const extra of [{}, { timeoutMs: 1000, processGroup: true }]) {
    const result = await runner({
      executable: process.execPath,
      args: ['-e', ''],
      cwd: missing,
      stdoutBuffer: true,
      ...extra,
    });
    assert.equal(result.status, null);
    assert.equal(result.error.code, 'INVALID_CWD');
    assert.ok(Buffer.isBuffer(result.stdout), JSON.stringify(extra));
    assert.equal(result.stdout.length, 0);
  }
  const text = await runner({ executable: process.execPath, args: ['-e', ''], cwd: missing });
  assert.equal(text.stdout, '');
});

test('stdoutBuffer: raw bytes come back unchanged in both modes', async () => {
  const runner = createProcessRunner();
  const script = 'process.stdout.write(Buffer.from([0x61, 0x00, 0xff, 0x62]))';
  for (const extra of [{}, { timeoutMs: 5000, processGroup: true }]) {
    const result = await runner({
      executable: process.execPath,
      args: ['-e', script],
      stdoutBuffer: true,
      ...extra,
    });
    assert.equal(result.status, 0);
    assert.deepEqual([...result.stdout], [0x61, 0x00, 0xff, 0x62], JSON.stringify(extra));
  }
});
