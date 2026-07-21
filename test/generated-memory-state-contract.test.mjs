import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));

function generatedRoot(target) {
  return target === 'portable'
    ? join(ROOT_DIR, 'dist', 'portable', 'effective-flow')
    : join(ROOT_DIR, 'dist', target, 'effective-flow');
}

function collectTextFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectTextFiles(path));
    else if (/\.(?:md|toml)$/.test(entry.name)) files.push(path);
  }
  return files;
}

test('actual eager and lazy consumers ship the nested memory contract in every target', () => {
  const build = spawnSync(process.execPath, ['build.mjs'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  for (const target of ['claude', 'codex', 'portable']) {
    const root = generatedRoot(target);
    for (const eagerConsumer of ['cleanup', 'investigate']) {
      const generated = readFileSync(join(root, 'tools', `${eagerConsumer}.md`), 'utf8');
      assert.match(generated, /## Shared memory-state mutation/);
      assert.doesNotMatch(generated, /^```include\s*$/m);
    }

    const lazyOwner = readFileSync(join(root, 'shared', 'effective-flow-dir-migration.md'), 'utf8');
    assert.match(lazyOwner, /## Shared memory-state mutation/);
    assert.doesNotMatch(lazyOwner, /^```include\s*$/m);

    const lazyConsumer = readFileSync(join(root, 'tools', 'fix.md'), 'utf8');
    assert.match(lazyConsumer, /shared\/effective-flow-dir-migration\.md/);
    for (const file of collectTextFiles(root)) {
      assert.doesNotMatch(
        readFileSync(file, 'utf8'),
        /^```include\s*$/m,
        `${target} output retained an eager include in ${file}`,
      );
    }
  }
});
