import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { forwardTermination, main } from '../src/scripts/remote-tracker.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = join(ROOT, 'src/scripts/remote-tracker.mjs');
const POSIX_ONLY =
  process.platform === 'win32'
    ? 'POSIX process-group termination is unavailable on Windows'
    : false;
const HEAD = 'a'.repeat(40);
const REPOSITORY = {
  host: 'code.example.test',
  owner: 'team',
  repository: 'flow',
  provider: 'forgejo',
  login: 'work',
};
const PULL = {
  number: 12,
  title: 'feat: bounded polling',
  state: 'open',
  draft: false,
  head: { sha: HEAD, ref: 'topic' },
  base: { ref: 'develop' },
};

// These executable fixtures preserve the real CLI/process boundary without using a forge or Git.
// Both hanging processes ignore TERM, so merely stopping the leader cannot satisfy cleanup.
const PROVIDER = `#!${process.execPath}
const { appendFileSync } = require('node:fs');
const { basename } = require('node:path');
const { spawn } = require('node:child_process');
const args = process.argv.slice(2);
const record = (event) => appendFileSync(process.env.FIXTURE_EVENTS, JSON.stringify(event) + '\\n');
if (args[0] === 'holder') {
  process.on('SIGTERM', () => {});
  record({ event: 'holder', pid: process.pid });
  process.send('ready');
  setInterval(() => {}, 1000);
} else if (basename(process.argv[1]) === 'git') {
  if (args[0] === 'rev-parse') console.log('true');
  else if (args[0] === 'remote') console.log('https://code.example.test/team/flow.git');
  else process.exitCode = 1;
} else if ((process.env.FIXTURE_MODE === 'probe-hang' && args[0] === '--version') ||
           (process.env.FIXTURE_MODE === 'api-hang' && args[0] === 'api' && !args.includes('--help'))) {
  process.on('SIGTERM', () => {});
  record({ event: 'leader', pid: process.pid });
  const holder = spawn(process.execPath, [__filename, 'holder'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  holder.once('message', () => record({ event: 'active' }));
  setInterval(() => {}, 1000);
} else if (args[0] === '--version') console.log('Version: 0.14.2');
else if (args[0] === 'logins') console.log(JSON.stringify([{ name: 'work', url: 'https://code.example.test' }]));
else if (args.includes('--help')) console.log('--output --comments --title --description --add-labels --remove-labels --head --base --draft --method --data --name --exclude-org --page --limit --include');
else if (args[0] === 'api') {
  const endpoint = args[1];
  let body;
  if (endpoint.includes('/pulls/')) body = ${JSON.stringify(PULL)};
  else if (endpoint.includes('/status?')) body = { state: 'pending', sha: '${HEAD}', statuses: [{ context: 'unit', status: 'pending' }] };
  else if (endpoint.includes('/git/commits/')) body = { sha: '${HEAD}', commit: { committer: { date: '2026-10-19T10:00:00Z' } } };
  else { console.error('unexpected endpoint: ' + endpoint); process.exit(1); }
  process.stderr.write('HTTP/1.1 200 OK\\r\\nContent-Type: application/json\\r\\n\\r\\n');
  console.log(JSON.stringify(body));
} else { console.error('unexpected fixture command: ' + args.join(' ')); process.exitCode = 1; }
`;

// Observe the actual polling timer without replacing its callback or changing its duration.
const OBSERVE_SLEEP = `
const { appendFileSync } = require('node:fs');
const original = global.setTimeout;
global.setTimeout = function(callback, duration, ...args) {
  if (duration === 20000) appendFileSync(process.env.FIXTURE_EVENTS, JSON.stringify({ event: 'sleep' }) + '\\n');
  return original(callback, duration, ...args);
};
`;

function events(directory) {
  const file = join(directory, 'events.jsonl');
  return existsSync(file)
    ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
    : [];
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(predicate, message, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, message);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function startCli(t, mode, timeoutMs = 30000) {
  const directory = mkdtempSync(join(tmpdir(), 'effective-flow-polling-cli-'));
  for (const name of ['git', 'tea'])
    writeFileSync(join(directory, name), PROVIDER, { mode: 0o755 });
  const preload = join(directory, 'observe-sleep.cjs');
  writeFileSync(preload, OBSERVE_SLEEP);
  const child = spawn(process.execPath, ['--require', preload, CLI, 'pr-checks-wait'], {
    cwd: directory,
    env: {
      ...process.env,
      PATH: `${directory}${delimiter}${process.env.PATH}`,
      FIXTURE_EVENTS: join(directory, 'events.jsonl'),
      FIXTURE_MODE: mode,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk) => {
    stderr += chunk;
  });
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  const stop = () => {
    // The group and direct PID fallbacks also run when the behavior under test is broken.
    for (const event of events(directory)) {
      if (!event.pid) continue;
      try {
        process.kill(-event.pid, 'SIGKILL');
      } catch {}
      try {
        process.kill(event.pid, 'SIGKILL');
      } catch {}
    }
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  };
  const watchdog = setTimeout(stop, 8000);
  t.after(async () => {
    clearTimeout(watchdog);
    stop();
    await completed;
    rmSync(directory, { recursive: true, force: true });
  });
  child.stdin.end(
    JSON.stringify({
      cwd: directory,
      provider: 'forgejo',
      number: 12,
      timeoutMs,
      intervalSeconds: 20,
    }),
  );
  return { child, directory, completed };
}

function envelopeOf(result) {
  assert.equal(result.stderr, '');
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 1, 'the CLI emits exactly one envelope');
  return JSON.parse(lines[0]);
}

async function assertNoProvider(directory, requireDescendant = true) {
  const pids = events(directory).filter((event) => event.pid);
  if (requireDescendant)
    assert.deepEqual(pids.map((event) => event.event).sort(), ['holder', 'leader']);
  for (const { event, pid } of pids)
    await until(() => !alive(pid), `${event} ${pid} survived CLI completion`);
}

test(
  'Forgejo CLI deadline kills a hanging probe and its TERM-resistant descendant',
  { skip: POSIX_ONLY },
  async (t) => {
    const started = Date.now();
    const fixture = startCli(t, 'probe-hang', 1500);
    const result = await fixture.completed;
    assert.ok(Date.now() - started < 7000, 'deadline plus bounded cleanup must stop the CLI');
    assert.equal(result.code, 0);
    assert.equal(result.signal, null);
    const envelope = envelopeOf(result);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.result.timedOut, true);
    assert.equal(envelope.data.result.complete, false);
    assert.equal(envelope.data.result.forcedKill, true);
    assert.deepEqual(envelope.data.result.checks, []);
    await assertNoProvider(fixture.directory);
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  for (const phase of ['active', 'sleep']) {
    test(
      `Forgejo CLI ${signal} during ${phase} stops without success or a live provider`,
      { skip: POSIX_ONLY },
      async (t) => {
        const fixture = startCli(t, phase === 'active' ? 'api-hang' : 'pending');
        await until(
          () => events(fixture.directory).some((event) => event.event === phase),
          `CLI never reached ${phase}`,
        );
        const started = Date.now();
        assert.equal(fixture.child.kill(signal), true);
        const result = await fixture.completed;
        assert.ok(
          Date.now() - started < 3000,
          `${signal} left the provider or polling timer running`,
        );
        assert.equal(result.code, signal === 'SIGINT' ? 130 : 143);
        assert.equal(result.signal, null);
        const envelope = envelopeOf(result);
        assert.equal(envelope.ok, false);
        assert.equal(envelope.error.code, 'INTERRUPTED');
        assert.equal(envelope.data, null);
        await assertNoProvider(fixture.directory, phase === 'active');
      },
    );
  }
}

test('termination handler disposal preserves caller listeners and uses its supplied run context', () => {
  const target = new EventEmitter();
  const signals = [];
  const exits = [];
  const writes = [];
  const existing = () => {};
  target.exit = (code) => exits.push(code);
  for (const event of ['exit', 'SIGINT', 'SIGTERM']) target.on(event, existing);
  const remove = forwardTermination(target, (signal) => signals.push(signal), {
    stdout: {
      write: (value, callback) => {
        writes.push(JSON.parse(value));
        callback();
      },
    },
    run: { operation: 'pr-checks-wait', envelopeWritten: false },
  });
  target.emit('SIGTERM');
  assert.deepEqual(signals, ['SIGKILL']);
  assert.deepEqual(exits, [143]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].operation, 'pr-checks-wait');
  assert.equal(writes[0].error.code, 'INTERRUPTED');
  remove();
  remove();
  for (const event of ['exit', 'SIGINT', 'SIGTERM'])
    assert.deepEqual(target.listeners(event), [existing]);
});

test('repeated main calls restore signal handlers after completion, provider errors and sleep errors', async () => {
  const signals = ['exit', 'SIGINT', 'SIGTERM'];
  const before = signals.map((signal) => process.listeners(signal));
  for (const mode of ['complete', 'provider-error', 'sleep-error']) {
    const output = [];
    const exitCodes = [];
    const envelope = await main(['pr-checks-wait'], {
      input: { repository: REPOSITORY, number: 12, timeoutMs: 1000 },
      skipProbe: true,
      stdout: { write: (value) => output.push(JSON.parse(value)) },
      setExitCode: (code) => exitCodes.push(code),
      runner: async (call) => {
        for (const [index, signal] of signals.entries())
          assert.equal(process.listenerCount(signal), before[index].length + 1);
        if (mode === 'provider-error') throw new Error('fixture provider failure');
        const endpoint = call.args[1];
        const body = endpoint.includes('/pulls/')
          ? PULL
          : endpoint.includes('/status?')
            ? {
                statuses: [
                  { context: 'unit', status: mode === 'complete' ? 'success' : 'pending' },
                ],
              }
            : { sha: HEAD, commit: { committer: { date: '2026-10-19T10:00:00Z' } } };
        return {
          status: 0,
          stdout: JSON.stringify(body),
          stderr: 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n',
        };
      },
      sleeper: async () => {
        for (const [index, signal] of signals.entries())
          assert.equal(process.listenerCount(signal), before[index].length + 1);
        throw new Error('fixture sleep failure');
      },
    });
    assert.equal(envelope.ok, mode === 'complete');
    assert.deepEqual(exitCodes, mode === 'complete' ? [] : [1]);
    assert.deepEqual(output, [envelope]);
    for (const [index, signal] of signals.entries())
      assert.deepEqual(process.listeners(signal), before[index]);
  }
});
