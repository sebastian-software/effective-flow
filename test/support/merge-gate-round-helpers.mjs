// Helpers shared by the merge-gate eval round test files: the round CLI entry point, the `verify`
// runner over a results directory, and a content digest of a tree.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// This module lives one directory below `test/`, so the repository root is two levels up.
export const ROUND_CLI = resolve(import.meta.dirname, '..', '..', 'evals', 'eval.mjs');

export function runVerify(resultsDir, args = []) {
  return spawnSync(process.execPath, [ROUND_CLI, 'merge-gate', 'verify', ...args], {
    encoding: 'utf8',
    env: { ...process.env, EFFECTIVE_FLOW_EVAL_VERIFY_RESULTS_DIR: resultsDir },
  });
}

// Every file under a tree, by content rather than by name. A name listing catches an added or a
// deleted file and nothing else, and the write a command that claims to be read-only is most likely
// to make by accident is an in-place rewrite: a re-stamp, a normalised JSON file, a generation
// marker refreshed in place. All three leave the listing identical.
export function treeDigests(root) {
  return Object.fromEntries(
    readdirSync(root, { recursive: true })
      .filter((name) => statSync(resolve(root, name)).isFile())
      .sort()
      .map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(resolve(root, name)))
          .digest('hex'),
      ]),
  );
}
