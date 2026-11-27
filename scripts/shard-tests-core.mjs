// Pure core of `scripts/shard-tests.mjs`: discovery that mirrors a bare `node --test`, shard
// assignment by simulated duration, argument parsing, child argv and exit-code mapping, and the
// per-file measurement that writes `scripts/shard-weights.json`. Repository tooling only; it is not
// listed in `RUNTIME_SCRIPT_FILES` and is never shipped. Neither this file's name nor the CLI's may
// match a default test pattern below, or every bare `node --test` would run it as a test.

import { readdirSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import path from 'node:path';

// Node major the discovery patterns were copied for. `test/shard-tests.test.mjs` pins it against
// the `node-version` in `.github/workflows/ci.yml`, so a Node upgrade forces a population check.
export const NODE_TEST_DISCOVERY_NODE_MAJOR = 24;

// Default `node --test` discovery patterns, copied from the Node 24 documentation
// (https://nodejs.org/docs/latest-v24.x/api/test.html#running-tests-from-the-command-line):
// the JavaScript forms, then the type-stripping TypeScript forms that Node 24 adds by default.
// `node_modules` and dot directories or dot files are never matched.
export const NODE_TEST_DEFAULT_PATTERNS = Object.freeze([
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

// Weight in seconds for a discovered file that has no entry in the weight table, so a new test
// file never breaks CI. It is roughly the wall time of a typical mid-sized test file; the balance
// degrades slightly until `--measure` refreshes the table.
export const DEFAULT_WEIGHT_SECONDS = 5;

export const DEFAULT_WEIGHTS_PATH = 'scripts/shard-weights.json';

// Characters Node's test runner would read as glob syntax in a positional file argument.
const GLOB_MAGIC = /[*?[\]{}!()]/;

export class ShardUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ShardUsageError';
  }
}

export const USAGE = [
  'Usage:',
  '  node scripts/shard-tests.mjs <i>/<n> [--test-concurrency=<k>] [--test-reporter=<name>]',
  '  node scripts/shard-tests.mjs --list <i>/<n> [--test-concurrency=<k>]',
  `  node scripts/shard-tests.mjs --measure [--out <path>] [<file>...]   (default out: ${DEFAULT_WEIGHTS_PATH}; files require --out)`,
  '',
  'Runs shard <i> of <n> of the files a bare `node --test` discovers, balanced by the weight table.',
  'Only --test-concurrency=<k> and --test-reporter=<name> are forwarded to `node --test`.',
].join('\n');

function globToRegExp(pattern) {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (pattern.startsWith('**/', index)) {
      source += '(?:[^/]+/)*';
      index += 2;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '{') {
      const end = pattern.indexOf('}', index);
      const options = pattern.slice(index + 1, end).split(',');
      source += `(?:${options.map((option) => option.replace(/[.]/g, '\\.')).join('|')})`;
      index = end;
    } else {
      source += char.replace(/[.\\^$+?()|[\]]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

const PATTERN_EXPRESSIONS = NODE_TEST_DEFAULT_PATTERNS.map(globToRegExp);

// True when a repository-relative POSIX path is one a bare `node --test` would run.
// Matching is case-sensitive as on Linux CI; on macOS and Windows Node matches case-insensitively.
export function matchesDefaultTestPattern(relativePath) {
  const segments = relativePath.split('/');
  if (segments.some((segment) => segment.startsWith('.') || segment === 'node_modules')) {
    return false;
  }
  return PATTERN_EXPRESSIONS.some((expression) => expression.test(relativePath));
}

// Node's start order for test files: the default JavaScript string sort (UTF-16 code units),
// whatever order the files are passed in. Verified by probe on Node 24.
export function compareNodeOrder(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function discoverTestFiles(root, { readdir = readdirSync } = {}) {
  const found = [];
  const walk = (relativeDirectory) => {
    const absolute = relativeDirectory ? path.join(root, relativeDirectory) : root;
    for (const entry of readdir(absolute, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(relative);
      else if (entry.isFile() && matchesDefaultTestPattern(relative)) found.push(relative);
    }
  };
  walk('');
  return found.sort(compareNodeOrder);
}

export function weightOf(weights, file) {
  return Object.hasOwn(weights, file) ? weights[file] : DEFAULT_WEIGHT_SECONDS;
}

export function validateWeights(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('weight table must be a JSON object of path to seconds');
  }
  for (const [file, seconds] of Object.entries(value)) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
      throw new Error(`weight table entry ${file} must be a non-negative number of seconds`);
    }
  }
  return value;
}

// Simulated wall time of `node --test` over `files` on `slots` parallel slots: files start in
// Node's order, each on the slot that frees first (ties: lowest slot), and the run ends when the
// last slot ends.
export function simulateDuration(files, weights, slots) {
  const ends = new Array(slots).fill(0);
  for (const file of [...files].sort(compareNodeOrder)) {
    let slot = 0;
    for (let index = 1; index < slots; index += 1) {
      if (ends[index] < ends[slot]) slot = index;
    }
    ends[slot] += weightOf(weights, file);
  }
  return Math.max(0, ...ends);
}

// Index of the shard that should take `file`: the one whose simulated finish time with the file
// added is lowest; ties go to the smaller growth of that finish time, then to the lowest index.
// Minimising the growth alone would degenerate: a shard with an idle slot grows by 0, so the
// heaviest files would all pile onto the first shard.
export function chooseShard(shards, weights, file, slots) {
  let best = -1;
  let bestDuration = 0;
  let bestGrowth = 0;
  shards.forEach((shardFiles, index) => {
    const duration = simulateDuration([...shardFiles, file], weights, slots);
    const growth = duration - simulateDuration(shardFiles, weights, slots);
    if (
      best === -1 ||
      duration < bestDuration ||
      (duration === bestDuration && growth < bestGrowth)
    ) {
      best = index;
      bestDuration = duration;
      bestGrowth = growth;
    }
  });
  return best;
}

// Places files heaviest first (ties: Node's order), each via `chooseShard`. Because the
// simulation starts files in Node's order, a heavy file that sorts late is not placed behind a
// queue of earlier files. Deterministic for a given table, file set, shard count and slot count.
export function assignShards(files, weights, shardCount, slots) {
  const shards = Array.from({ length: shardCount }, () => []);
  const ordered = [...files].sort(
    (left, right) =>
      weightOf(weights, right) - weightOf(weights, left) || compareNodeOrder(left, right),
  );
  for (const file of ordered) {
    shards[chooseShard(shards, weights, file, slots)].push(file);
  }
  return shards.map((shard) => shard.sort(compareNodeOrder));
}

export function defaultConcurrency(availableParallelism) {
  return Math.max(1, availableParallelism - 1);
}

function parseShard(token) {
  const match = /^(\d+)\/(\d+)$/.exec(token);
  if (!match) throw new ShardUsageError(`invalid shard "${token}": expected <i>/<n>`);
  const index = Number(match[1]);
  const count = Number(match[2]);
  if (count < 1 || index < 1 || index > count) {
    throw new ShardUsageError(`invalid shard "${token}": need 1 <= i <= n`);
  }
  return { index, count };
}

// Parses the CLI arguments. Only `--test-concurrency=<k>` and `--test-reporter=<name>` are
// forwarded to `node --test`; every other argument is rejected, because a forwarded filter or
// `--test-shard` would silently drop tests from the shard.
export function parseArguments(argv) {
  const args = [...argv];
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) return { mode: 'help' };
  let mode = 'run';
  if (args[0] === '--list' || args[0] === '--measure') mode = args.shift().slice(2);
  const parsed = { mode, forwarded: [], concurrency: undefined, reporter: undefined };
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (mode !== 'measure' && arg.startsWith('--test-concurrency=')) {
      const value = arg.slice('--test-concurrency='.length);
      if (!/^[1-9]\d*$/.test(value)) {
        throw new ShardUsageError(`invalid ${arg}: expected a positive integer`);
      }
      if (parsed.concurrency !== undefined) throw new ShardUsageError(`duplicate ${arg}`);
      parsed.concurrency = Number(value);
      parsed.forwarded.push(arg);
    } else if (mode === 'run' && arg.startsWith('--test-reporter=')) {
      if (arg === '--test-reporter=') throw new ShardUsageError('empty --test-reporter=');
      if (parsed.reporter !== undefined) throw new ShardUsageError(`duplicate ${arg}`);
      parsed.reporter = arg.slice('--test-reporter='.length);
      parsed.forwarded.push(arg);
    } else if (mode === 'measure' && (arg === '--out' || arg.startsWith('--out='))) {
      const value = arg === '--out' ? args[++index] : arg.slice('--out='.length);
      if (!value) throw new ShardUsageError('--out needs a path');
      if (parsed.out !== undefined) throw new ShardUsageError('duplicate --out');
      parsed.out = value;
    } else if (arg.startsWith('-')) {
      throw new ShardUsageError(`argument not allowed: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }
  if (mode === 'measure') {
    if (positionals.length > 0 && parsed.out === undefined) {
      throw new ShardUsageError('--measure with selected files requires --out');
    }
    parsed.files = positionals;
    return parsed;
  }
  if (positionals.length === 0) throw new ShardUsageError('missing shard <i>/<n>');
  if (positionals.length > 1) {
    throw new ShardUsageError(`argument not allowed: ${positionals[1]}`);
  }
  parsed.shard = parseShard(positionals[0]);
  return parsed;
}

export function childArguments(forwarded, files) {
  for (const file of files) {
    if (GLOB_MAGIC.test(file)) {
      throw new Error(`test file path would be read as a glob by node --test: ${file}`);
    }
  }
  return ['--test', ...forwarded, ...files];
}

// Exit code of this script for a child that ended with `code` or by `signal`.
export function exitCodeFromChild(code, signal) {
  if (signal) {
    const number = osConstants.signals[signal];
    return number ? 128 + number : 1;
  }
  return Number.isInteger(code) ? code : 1;
}

// Spawns `node --test <forwarded> <files>` (options before files: `node --test` ignores options
// after the file list) and resolves to the exit code this script must return. An empty shard
// fails instead of spawning a bare `node --test`, which would run the whole suite.
export function runShard({ files, forwarded, spawn, execPath, cwd, signals }) {
  if (files.length === 0) {
    return Promise.reject(new Error('shard has no test files; refusing to run a bare node --test'));
  }
  const argv = childArguments(forwarded, files);
  return new Promise((resolve, reject) => {
    const child = spawn(execPath, argv, { cwd, stdio: 'inherit' });
    const forward = (signal) => child.kill(signal);
    const handled = ['SIGINT', 'SIGTERM'];
    if (signals) for (const signal of handled) signals.on(signal, forward);
    const detach = () => {
      if (signals) for (const signal of handled) signals.off(signal, forward);
    };
    child.once('error', (error) => {
      detach();
      reject(error);
    });
    child.once('close', (code, signal) => {
      detach();
      resolve(exitCodeFromChild(code, signal));
    });
  });
}

export function describeShards(files, weights, shardCount, slots) {
  const shards = assignShards(files, weights, shardCount, slots);
  return shards.map((shardFiles) => ({
    files: shardFiles,
    weight: shardFiles.reduce((sum, file) => sum + weightOf(weights, file), 0),
    duration: simulateDuration(shardFiles, weights, slots),
  }));
}

export function formatListing({ shard, shards, discovered, slots, weights }) {
  const seconds = (value) => `${value.toFixed(1)} s`;
  const current = shards[shard.index - 1];
  const lines = [
    `shard ${shard.index}/${shard.count}: ${current.files.length} files, summed weight ${seconds(current.weight)}, simulated duration ${seconds(current.duration)}`,
    `discovered test files: ${discovered}; slots per shard (k): ${slots}`,
    `simulated durations: ${shards.map((entry, index) => `${index + 1}/${shard.count} ${seconds(entry.duration)}`).join(', ')}`,
    '',
  ];
  for (const file of current.files) {
    const known = Object.hasOwn(weights, file) ? '' : ' (default weight)';
    lines.push(`${weightOf(weights, file).toFixed(1).padStart(7)}  ${file}${known}`);
  }
  return `${lines.join('\n')}\n`;
}

export function roundSeconds(milliseconds) {
  return Math.round(milliseconds / 100) / 10;
}

// Times each file alone with `node --test <file>`, sequentially, and resolves to the sorted
// weight table plus the files whose run failed. `env` is passed to the child only when given.
export async function measureFiles({
  files,
  spawn,
  execPath,
  cwd,
  env,
  now,
  onProgress = () => {},
}) {
  const weights = {};
  const failed = [];
  for (const file of [...files].sort(compareNodeOrder)) {
    const argv = childArguments([], [file]);
    const start = now();
    const code = await new Promise((resolve, reject) => {
      const child = spawn(execPath, argv, { cwd, stdio: 'ignore', ...(env ? { env } : {}) });
      child.once('error', reject);
      child.once('close', (exitCode, signal) => resolve(exitCodeFromChild(exitCode, signal)));
    });
    weights[file] = roundSeconds(now() - start);
    if (code !== 0) failed.push(file);
    onProgress(file, weights[file], code);
  }
  return { weights: sortWeights(weights), failed };
}

export function sortWeights(weights) {
  return Object.fromEntries(
    Object.keys(weights)
      .sort(compareNodeOrder)
      .map((file) => [file, weights[file]]),
  );
}

export function serializeWeights(weights) {
  return `${JSON.stringify(sortWeights(weights), null, 2)}\n`;
}
