#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { resolve } from 'node:path';

const [tool, scenario] = process.argv.slice(2);
if (!tool || !scenario || process.argv.length !== 4) {
  process.stderr.write('usage: node evals/prepare.mjs <tool> <scenario>\n');
  process.exit(1);
}

process.stderr.write(
  'DEPRECATED: `prepare:eval` now prepares a five-slot round. Use `pnpm eval <tool> prepare --scenario <name>` directly.\n',
);
const result = spawnSync(
  process.execPath,
  [resolve(import.meta.dirname, 'eval.mjs'), tool, 'prepare', '--scenario', scenario],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
