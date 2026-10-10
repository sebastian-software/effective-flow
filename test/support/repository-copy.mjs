// Shared test support: copies a repository checkout so a test can mutate sources and build the
// copy in isolation. The copy skips top-level entries that are either repository-private
// (`.git`, runtime state, dependencies) or rewritten by an in-place `node build.mjs`, which a
// concurrently running test file may start at any moment. This module declares no test.
import { cpSync } from 'node:fs';
import { relative } from 'node:path';

// Every directory build.mjs creates directly under its output root (`join(OUTPUT_ROOT, '<name>')`):
// an in-place build creates, renames and deletes `dist.tmp` and `dist.bak` mid-copy (ENOENT).
export const BUILD_OUTPUT_DIRECTORIES = Object.freeze(['dist', 'dist.tmp', 'dist.bak']);

// Top-level entries of the source root that copyRepository never copies.
export const COPY_EXCLUDED_ENTRIES = Object.freeze([
  '.git',
  '.effective-flow',
  ...BUILD_OUTPUT_DIRECTORIES,
  'node_modules',
]);

export function copyRepository(sourceRoot, destination) {
  cpSync(sourceRoot, destination, {
    recursive: true,
    filter(source) {
      const first = relative(sourceRoot, source).split('/')[0];
      return !COPY_EXCLUDED_ENTRIES.includes(first);
    },
  });
}
