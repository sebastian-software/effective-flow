#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { resolve } from 'node:path';

const scenario = process.argv[2];
if (!scenario || process.argv.length !== 3) {
  process.stderr.write('usage: node evals/merge-gate/prepare.mjs <scenario>\n');
  process.exit(1);
}

process.stderr.write(
  'DEPRECATED: `prepare:merge-gate-eval` now prepares a five-slot round. Use `pnpm merge-gate-eval prepare --scenario <name>` directly.\n',
);
const result = spawnSync(
  process.execPath,
  [resolve(import.meta.dirname, 'round.mjs'), 'prepare', '--scenario', scenario],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
