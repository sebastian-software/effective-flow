import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  DEFAULT_WEIGHT_SECONDS,
  DEFAULT_WEIGHTS_PATH,
  NODE_TEST_DEFAULT_PATTERNS,
  NODE_TEST_DISCOVERY_NODE_MAJOR,
  ShardUsageError,
  assignShards,
  childArguments,
  chooseShard,
  compareNodeOrder,
  defaultConcurrency,
  describeShards,
  discoverTestFiles,
  exitCodeFromChild,
  matchesDefaultTestPattern,
  measureFiles,
  parseArguments,
  runShard,
  serializeWeights,
  simulateDuration,
  validateWeights,
  weightOf,
} from '../scripts/shard-tests-core.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts/shard-tests.mjs');

function runCli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
}

function fakeChild() {
  const child = new EventEmitter();
  child.killed = [];
  child.kill = (signal) => child.killed.push(signal);
  return child;
}

function recordingSpawn(child) {
  const calls = [];
  const spawnFake = (command, argv, options) => {
    calls.push({ command, argv, options });
    return child;
  };
  return { calls, spawnFake };
}

// Invariant: the shard script runs exactly the population of a bare `node --test`. The list is
// copied from https://nodejs.org/docs/latest-v24.x/api/test.html#running-tests-from-the-command-line
// (JavaScript forms plus the type-stripping TypeScript forms); a change must re-check that page.
test('the discovery patterns are the Node 24 default `node --test` patterns', () => {
  assert.equal(NODE_TEST_DISCOVERY_NODE_MAJOR, 24);
  assert.deepEqual(NODE_TEST_DEFAULT_PATTERNS, [
    '**/*.test.{cjs,mjs,js}',
    '**/*-test.{cjs,mjs,js}',
    '**/*_test.{cjs,mjs,js}',
    '**/test-*.{cjs,mjs,js}',
    '**/test.{cjs,mjs,js}',
    '**/test/**/*.{cjs,mjs,js}',
    '**/*.test.{cts,mts,ts}',
    '**/*-test.{cts,mts,ts}',
    '**/*_test.{cts,mts,ts}',
    '**/test-*.{cts,mts,ts}',
    '**/test.{cts,mts,ts}',
    '**/test/**/*.{cts,mts,ts}',
  ]);
});

// Invariant: a Node major bump in CI fails here and forces a fresh population check of the
// pattern list above, because default discovery can change between majors.
test('ci.yml runs the Node major the discovery patterns were copied for', () => {
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  const versions = [...workflow.matchAll(/^\s*node-version:\s*['"]?([^'"\s#]+)/gm)].map(
    (match) => match[1],
  );
  assert.ok(versions.length > 0, 'ci.yml names a node-version');
  for (const version of versions) {
    assert.equal(version, String(NODE_TEST_DISCOVERY_NODE_MAJOR));
  }
});

test('the matcher follows Node default discovery, dot and node_modules exclusions included', () => {
  for (const file of [
    'a.test.mjs',
    'x/a-test.cjs',
    'x/a_test.js',
    'test-a.mts',
    'test-.mjs',
    'test.ts',
    'sub/test.cts',
    'test/support/helper.mjs',
    'x/test/y/z.js',
    'test/x.d.ts',
    'scripts/test-capabilities.mjs',
  ]) {
    assert.equal(matchesDefaultTestPattern(file), true, file);
  }
  for (const file of [
    'a.spec.mjs',
    'mytest.mjs',
    'tests/q.mjs',
    'test/x.json',
    'A.TEST.mjs',
    'Test/u.mjs',
    'a.test.jsx',
    'a.test.node.mjs',
    'x/test-b/c.mjs',
    '.hidden/a.test.mjs',
    '.x.test.mjs',
    'test/.dot/x.mjs',
    'test/.hidden.mjs',
    'node_modules/a.test.mjs',
    'test/node_modules/n.mjs',
  ]) {
    assert.equal(matchesDefaultTestPattern(file), false, file);
  }
});

// Invariant: the core's discovery equals what a bare `node --test` on Linux runs. The runner globs
// the default patterns with `node_modules` excluded and minimatch's default of skipping dot entries;
// `fs.globSync` uses the same internal glob, so a mismatch means the copied patterns drifted.
test('discovery matches the Node test runner glob over the repository', () => {
  const runner = globSync([...NODE_TEST_DEFAULT_PATTERNS], {
    cwd: ROOT,
    exclude: (entry) => path.basename(String(entry)) === 'node_modules',
  })
    .map((file) => file.split(path.sep).join('/'))
    .sort(compareNodeOrder);
  assert.deepEqual(discoverTestFiles(ROOT), runner);
});

// Invariant: neither the shard script nor its core is ever run as a test by a bare `node --test`,
// so `pnpm test` cannot execute the shard CLI without arguments.
test('the shard script and its core are not discovered as tests', () => {
  const discovered = discoverTestFiles(ROOT);
  for (const file of ['scripts/shard-tests.mjs', 'scripts/shard-tests-core.mjs']) {
    assert.equal(matchesDefaultTestPattern(file), false, file);
    assert.equal(discovered.includes(file), false, file);
  }
  assert.ok(discovered.includes('test/shard-tests.test.mjs'));
  assert.ok(discovered.includes('scripts/test-capabilities.mjs'));
  assert.deepEqual(discovered, [...discovered].sort(compareNodeOrder));
});

test('the partition of the real repository is disjoint, complete and deterministic', () => {
  const discovered = discoverTestFiles(ROOT);
  const weights = validateWeights(JSON.parse(readFileSync(path.join(ROOT, DEFAULT_WEIGHTS_PATH))));
  for (const slots of [1, 3, 4, 11]) {
    const shards = assignShards(discovered, weights, 3, slots);
    const flat = shards.flat();
    assert.equal(new Set(flat).size, flat.length, `disjoint for k=${slots}`);
    assert.deepEqual([...flat].sort(compareNodeOrder), discovered, `complete for k=${slots}`);
    for (const shard of shards) assert.ok(shard.length > 0, `non-empty for k=${slots}`);
    assert.deepEqual(assignShards(discovered, weights, 3, slots), shards, `stable for k=${slots}`);
    assert.deepEqual(
      assignShards([...discovered].reverse(), weights, 3, slots),
      shards,
      `input order is irrelevant for k=${slots}`,
    );
  }
});

test('the simulation starts files in Node order, so a heavy file sorting late ends late', () => {
  const early = { 'a.mjs': 30, 'b.mjs': 10, 'c.mjs': 10, 'd.mjs': 10 };
  const late = { 'a.mjs': 10, 'b.mjs': 10, 'c.mjs': 10, 'z.mjs': 30 };
  assert.equal(simulateDuration(Object.keys(early), early, 2), 30);
  assert.equal(simulateDuration(Object.keys(late), late, 2), 40);
  assert.equal(simulateDuration(Object.keys(late).reverse(), late, 2), 40);
  assert.equal(simulateDuration(Object.keys(late), late, 1), 60);
  assert.equal(simulateDuration([], late, 4), 0);
});

test('a file goes to the shard whose simulated finish stays lowest, start order included', () => {
  const weights = { 'a.mjs': 3, 'b.mjs': 3, 'y.mjs': 7, 'z.mjs': 6, '0.mjs': 6, 'q.mjs': 4 };
  const shards = [['a.mjs', 'b.mjs'], ['y.mjs']];
  // Summed weights (6 against 7) would put z on the first shard, but z sorts after a and b, starts
  // only when a slot frees at 3 and would end at 9; beside y it ends at 7.
  assert.equal(chooseShard(shards, weights, 'z.mjs', 2), 1);
  // The same weight sorting first starts at 0 and ends at 6, below y's 7.
  assert.equal(chooseShard(shards, weights, '0.mjs', 2), 0);
  // Equal finish times prefer the smaller growth, then the lowest index.
  // Both shards end at 7 with a: beside y it grows by 0, after b and q by 3.
  assert.equal(chooseShard([['y.mjs'], ['b.mjs', 'q.mjs']], weights, 'a.mjs', 2), 0);
  assert.equal(chooseShard([['b.mjs', 'q.mjs'], ['y.mjs']], weights, 'a.mjs', 2), 1);
  assert.equal(chooseShard([[], []], weights, 'z.mjs', 2), 0);
});

test('assignment places heaviest first and balances the simulated finish times', () => {
  const weights = { 'a.mjs': 10, 'b.mjs': 10, 'c.mjs': 10, 'd.mjs': 10, 'z.mjs': 30 };
  const shards = assignShards(Object.keys(weights), weights, 2, 2);
  assert.deepEqual(shards, [['z.mjs'], ['a.mjs', 'b.mjs', 'c.mjs', 'd.mjs']]);
  assert.deepEqual(
    shards.map((files) => simulateDuration(files, weights, 2)),
    [30, 20],
  );
  assert.deepEqual(assignShards(['b.mjs', 'a.mjs'], { 'a.mjs': 5, 'b.mjs': 5 }, 2, 1), [
    ['a.mjs'],
    ['b.mjs'],
  ]);
  const many = Object.fromEntries(
    Array.from({ length: 30 }, (_, index) => [`t${String(index).padStart(2, '0')}.mjs`, index + 1]),
  );
  const durations = assignShards(Object.keys(many), many, 3, 4).map((files) =>
    simulateDuration(files, many, 4),
  );
  const mean = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  for (const duration of durations)
    assert.ok(Math.abs(duration - mean) <= mean * 0.15, `${durations}`);
});

test('a file missing from the weight table gets the documented default weight', () => {
  assert.equal(weightOf({}, 'test/new.test.mjs'), DEFAULT_WEIGHT_SECONDS);
  assert.equal(weightOf({ 'test/new.test.mjs': 0 }, 'test/new.test.mjs'), 0);
  const [only] = describeShards(['test/new.test.mjs'], {}, 1, 1);
  assert.equal(only.weight, DEFAULT_WEIGHT_SECONDS);
  assert.throws(() => validateWeights({ 'a.mjs': -1 }), /non-negative/);
  assert.throws(() => validateWeights([]), /JSON object/);
});

// Invariant: a renamed or deleted test file forces a table update instead of leaving a stale
// weight behind, and the table keeps the sorted, generated form `--measure` writes.
test('every weight table entry names an existing discovered test file', () => {
  const text = readFileSync(path.join(ROOT, DEFAULT_WEIGHTS_PATH), 'utf8');
  const weights = validateWeights(JSON.parse(text));
  const discovered = new Set(discoverTestFiles(ROOT));
  for (const file of Object.keys(weights)) {
    assert.ok(existsSync(path.join(ROOT, file)), `stale weight table entry: ${file}`);
    assert.ok(discovered.has(file), `weight table entry is not a discovered test file: ${file}`);
  }
  assert.equal(serializeWeights(weights), text);
});

test('the child argv puts forwarded options before the shard files', async () => {
  const child = fakeChild();
  const { calls, spawnFake } = recordingSpawn(child);
  const result = runShard({
    files: ['test/a.test.mjs', 'test/b.test.mjs'],
    forwarded: ['--test-concurrency=4', '--test-reporter=dot'],
    spawn: spawnFake,
    execPath: '/node',
    cwd: '/repo',
  });
  child.emit('close', 0, null);
  assert.equal(await result, 0);
  assert.deepEqual(calls, [
    {
      command: '/node',
      argv: [
        '--test',
        '--test-concurrency=4',
        '--test-reporter=dot',
        'test/a.test.mjs',
        'test/b.test.mjs',
      ],
      options: { cwd: '/repo', stdio: 'inherit' },
    },
  ]);
  assert.throws(() => childArguments([], ['test/[x].test.mjs']), /glob/);
});

test('the exit code and a terminating signal of the child propagate', async () => {
  for (const [code, signal, expected] of [
    [0, null, 0],
    [1, null, 1],
    [7, null, 7],
    [null, 'SIGTERM', 143],
    [null, 'SIGKILL', 137],
    [null, null, 1],
  ]) {
    const child = fakeChild();
    const { spawnFake } = recordingSpawn(child);
    const result = runShard({ files: ['t.mjs'], forwarded: [], spawn: spawnFake, execPath: 'n' });
    child.emit('close', code, signal);
    assert.equal(await result, expected, `${code}/${signal}`);
  }
  assert.equal(exitCodeFromChild(null, 'SIGINT'), 130);

  const child = fakeChild();
  const signals = new EventEmitter();
  const { spawnFake } = recordingSpawn(child);
  const result = runShard({
    files: ['t.mjs'],
    forwarded: [],
    spawn: spawnFake,
    execPath: 'n',
    signals,
  });
  signals.emit('SIGTERM', 'SIGTERM');
  assert.deepEqual(child.killed, ['SIGTERM']);
  child.emit('close', null, 'SIGTERM');
  assert.equal(await result, 143);
  assert.equal(signals.listenerCount('SIGTERM'), 0);

  const failing = fakeChild();
  const pending = runShard({
    files: ['t.mjs'],
    forwarded: [],
    spawn: recordingSpawn(failing).spawnFake,
    execPath: 'n',
  });
  failing.emit('error', new Error('spawn failed'));
  await assert.rejects(pending, /spawn failed/);
});

test('an empty shard fails and never spawns a bare node --test', async () => {
  const { calls, spawnFake } = recordingSpawn(fakeChild());
  await assert.rejects(
    runShard({ files: [], forwarded: [], spawn: spawnFake, execPath: 'n' }),
    /no test files/,
  );
  assert.equal(calls.length, 0);
  const result = runCli(['--list', '999/999']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /has no test files/);
});

test('only --test-concurrency=<n> and --test-reporter=<x> are forwarded', () => {
  assert.deepEqual(parseArguments(['2/3', '--test-concurrency=4', '--test-reporter=spec']), {
    mode: 'run',
    forwarded: ['--test-concurrency=4', '--test-reporter=spec'],
    concurrency: 4,
    reporter: 'spec',
    shard: { index: 2, count: 3 },
  });
  for (const argv of [
    ['1/3', '--test-shard=1/2'],
    ['1/3', '--test-only'],
    ['1/3', '--test-name-pattern=x'],
    ['1/3', '--test-skip-pattern=x'],
    ['1/3', '--test-reporter-destination=out.txt'],
    ['1/3', '--test-concurrency'],
    ['1/3', '--test-concurrency=0'],
    ['1/3', '--test-concurrency=two'],
    ['1/3', '--test-concurrency=4', '--test-concurrency=2'],
    ['1/3', '--test-reporter='],
    ['1/3', '--watch'],
    ['1/3', '--'],
    ['1/3', 'test/extra.test.mjs'],
    ['--list', '1/3', '--test-reporter=spec'],
    ['--measure', 'test/a.test.mjs'],
    ['--measure', '--test-concurrency=2'],
  ]) {
    assert.throws(() => parseArguments(argv), ShardUsageError, argv.join(' '));
  }
});

test('a missing or invalid shard argument prints usage and exits non-zero', () => {
  for (const argv of [[], ['0/3'], ['4/3'], ['1/0'], ['a/b'], ['1-3']]) {
    assert.throws(() => parseArguments(argv), ShardUsageError, argv.join(' '));
  }
  const missing = runCli([]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /missing shard/);
  assert.match(missing.stderr, /Usage:/);
  const rejected = runCli(['1/3', '--test-only']);
  assert.equal(rejected.status, 2);
  assert.match(rejected.stderr, /argument not allowed: --test-only/);
  assert.equal(rejected.stdout, '');
});

test('--list prints the shard files, weights, simulated durations and discovered count', () => {
  const result = runCli(['--list', '1/3', '--test-concurrency=4']);
  assert.equal(result.status, 0, result.stderr);
  const discovered = discoverTestFiles(ROOT).length;
  assert.match(result.stdout, /^shard 1\/3: \d+ files, summed weight [\d.]+ s, simulated duration/);
  assert.match(
    result.stdout,
    new RegExp(`discovered test files: ${discovered}; slots per shard \\(k\\): 4`),
  );
  assert.match(result.stdout, /simulated durations: 1\/3 [\d.]+ s, 2\/3 [\d.]+ s, 3\/3 [\d.]+ s/);
  assert.equal(defaultConcurrency(12), 11);
  assert.equal(defaultConcurrency(1), 1);
});

test('--measure times each file alone and writes a sorted table', async () => {
  let clock = 0;
  const calls = [];
  const spawnFake = (command, argv) => {
    calls.push(argv);
    const child = fakeChild();
    clock += argv[1] === 'b.test.mjs' ? 1234 : 49;
    queueMicrotask(() => child.emit('close', argv[1] === 'b.test.mjs' ? 1 : 0, null));
    return child;
  };
  const { weights, failed } = await measureFiles({
    files: ['b.test.mjs', 'a.test.mjs'],
    spawn: spawnFake,
    execPath: 'n',
    cwd: '/repo',
    now: () => clock,
  });
  assert.deepEqual(calls, [
    ['--test', 'a.test.mjs'],
    ['--test', 'b.test.mjs'],
  ]);
  assert.deepEqual(weights, { 'a.test.mjs': 0, 'b.test.mjs': 1.2 });
  assert.deepEqual(Object.keys(weights), ['a.test.mjs', 'b.test.mjs']);
  assert.deepEqual(failed, ['b.test.mjs']);
  assert.equal(serializeWeights(weights), '{\n  "a.test.mjs": 0,\n  "b.test.mjs": 1.2\n}\n');

  const directory = mkdtempSync(path.join(os.tmpdir(), 'shard-measure-'));
  try {
    writeFileSync(path.join(directory, 'one.test.mjs'), "import 'node:test';\n");
    writeFileSync(path.join(directory, 'two.test.mjs'), 'throw new Error("red");\n');
    const real = await measureFiles({
      files: ['two.test.mjs', 'one.test.mjs'],
      spawn,
      execPath: process.execPath,
      cwd: directory,
      // A child of `node --test` inherits NODE_TEST_CONTEXT and would report instead of failing.
      env: Object.fromEntries(
        Object.entries(process.env).filter(([name]) => name !== 'NODE_TEST_CONTEXT'),
      ),
      now: () => performance.now(),
    });
    assert.deepEqual(Object.keys(real.weights), ['one.test.mjs', 'two.test.mjs']);
    for (const seconds of Object.values(real.weights)) assert.ok(seconds >= 0);
    assert.deepEqual(real.failed, ['two.test.mjs']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
