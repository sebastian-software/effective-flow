import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';

import {
  BUILD_OUTPUT_DIRECTORIES,
  COPY_EXCLUDED_ENTRIES,
  copyRepository,
} from './support/repository-copy.mjs';

const BUILD_SOURCE = readFileSync(new URL('../build.mjs', import.meta.url), 'utf8');

function writeFixtureFile(root, path) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${path}\n`);
}

function listFiles(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(root, path) : [relative(root, path)];
    })
    .sort();
}

test('copyRepository skips top-level build output and private entries but keeps nested names', (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), 'effective-flow-repository-copy-'));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const source = join(sandbox, 'source');
  const destination = join(sandbox, 'destination');
  const kept = ['src/a.md', 'src/nested/dist.tmp/keep.md'];
  const skipped = ['dist', 'dist.tmp', 'dist.bak', 'node_modules', '.git', '.effective-flow'];
  for (const path of kept) writeFixtureFile(source, path);
  writeFixtureFile(source, 'dist/x');
  writeFixtureFile(source, 'dist.tmp/portable/x');
  writeFixtureFile(source, 'dist.bak/x');
  writeFixtureFile(source, 'node_modules/x');
  writeFixtureFile(source, '.git/x');
  writeFixtureFile(source, '.effective-flow/x');

  copyRepository(source, destination);

  assert.deepEqual(listFiles(destination), kept);
  const copiedTopLevel = readdirSync(destination);
  for (const name of skipped) {
    assert.equal(copiedTopLevel.includes(name), false, `${name} must not be copied`);
  }
});

// Invariant: every directory build.mjs creates under its output root must be excluded from the
// checkout copy, because an in-place build in a concurrently running test file (node --test runs
// files in parallel) rewrites, renames and deletes them mid-copy, which fails cpSync with ENOENT.
test('every build output directory under OUTPUT_ROOT is excluded from the repository copy', () => {
  const declared = [...BUILD_SOURCE.matchAll(/join\(OUTPUT_ROOT, '([^']+)'\)/g)].map(
    ([, name]) => name,
  );
  assert.ok(declared.length > 0, 'build.mjs must derive its output directories from OUTPUT_ROOT');

  assert.deepEqual([...new Set(declared)].sort(), [...new Set(BUILD_OUTPUT_DIRECTORIES)].sort());
  for (const name of BUILD_OUTPUT_DIRECTORIES) {
    assert.ok(COPY_EXCLUDED_ENTRIES.includes(name), `${name} must be excluded from the copy`);
  }
});
