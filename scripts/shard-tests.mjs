#!/usr/bin/env node

// Runs one CI shard of the files a bare `node --test` discovers, balanced by the checked-in
// weight table `scripts/shard-weights.json`. Repository tooling only; never shipped.
// Logic lives in `shard-tests-core.mjs`; this entry wires the filesystem, process and spawn.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  DEFAULT_WEIGHTS_PATH,
  ShardUsageError,
  USAGE,
  defaultConcurrency,
  describeShards,
  discoverTestFiles,
  formatListing,
  measureFiles,
  parseArguments,
  runShard,
  serializeWeights,
  validateWeights,
} from './shard-tests-core.mjs';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..');

function loadWeights() {
  const file = path.join(REPOSITORY_ROOT, DEFAULT_WEIGHTS_PATH);
  return validateWeights(JSON.parse(readFileSync(file, 'utf8')));
}

async function main(argv) {
  const options = parseArguments(argv);
  if (options.mode === 'help') {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const discovered = discoverTestFiles(REPOSITORY_ROOT);

  if (options.mode === 'measure') {
    const unknown = options.files.filter((file) => !discovered.includes(file));
    if (unknown.length > 0) {
      throw new ShardUsageError(`not a discovered test file: ${unknown.join(', ')}`);
    }
    const files = options.files.length > 0 ? options.files : discovered;
    const now = () => Number(process.hrtime.bigint() / 1_000_000n);
    const { weights, failed } = await measureFiles({
      files,
      spawn,
      execPath: process.execPath,
      cwd: REPOSITORY_ROOT,
      // A child inheriting NODE_TEST_CONTEXT would report to a parent runner instead of failing.
      env: Object.fromEntries(
        Object.entries(process.env).filter(([name]) => name !== 'NODE_TEST_CONTEXT'),
      ),
      now,
      onProgress: (file, seconds, code) =>
        process.stderr.write(
          `${seconds.toFixed(1).padStart(7)} s  ${file}${code ? ` (exit ${code})` : ''}\n`,
        ),
    });
    const out = path.resolve(REPOSITORY_ROOT, options.out ?? DEFAULT_WEIGHTS_PATH);
    writeFileSync(out, serializeWeights(weights));
    process.stderr.write(`wrote ${Object.keys(weights).length} weights to ${out}\n`);
    if (failed.length > 0) {
      process.stderr.write(`failing files while measuring: ${failed.join(', ')}\n`);
      return 1;
    }
    return 0;
  }

  const weights = loadWeights();
  const slots = options.concurrency ?? defaultConcurrency(os.availableParallelism());
  const shards = describeShards(discovered, weights, options.shard.count, slots);
  const current = shards[options.shard.index - 1];

  if (options.mode === 'list') {
    process.stdout.write(
      formatListing({
        shard: options.shard,
        shards,
        discovered: discovered.length,
        slots,
        weights,
      }),
    );
  }
  if (current.files.length === 0) {
    process.stderr.write(
      `shard-tests: shard ${options.shard.index}/${options.shard.count} has no test files; refusing to run a bare node --test\n`,
    );
    return 1;
  }
  if (options.mode === 'list') return 0;

  return runShard({
    files: current.files,
    forwarded: options.forwarded,
    spawn,
    execPath: process.execPath,
    cwd: REPOSITORY_ROOT,
    signals: process,
  });
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`shard-tests: ${error.message}\n`);
  if (error instanceof ShardUsageError) process.stderr.write(`${USAGE}\n`);
  process.exitCode = error instanceof ShardUsageError ? 2 : 1;
}
