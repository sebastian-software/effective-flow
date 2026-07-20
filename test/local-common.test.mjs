import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const LOCAL_COMMON = join(ROOT_DIR, 'local-common.sh');

function runShell(script, env) {
  return spawnSync('/bin/sh', ['-c', script], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function isolatedEnvironment(root, mode, distRoot) {
  return {
    HOME: join(root, 'home'),
    CLAUDE_HOME: join(root, 'claude'),
    CODEX_HOME: join(root, 'codex'),
    DIST_ROOT: distRoot,
    INSTALL_MODE: mode,
    ROOT_DIR,
  };
}

test('copy and link reports include the complete freshly built version first', async (t) => {
  const build = spawnSync(process.execPath, ['build.mjs'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });
  assert.equal(build.status, 0, build.stderr);

  const distRoot = join(ROOT_DIR, 'dist');
  const router = await readFile(join(distRoot, 'claude/effective-flow/SKILL.md'), 'utf8');
  const marker = router.match(/\(version (.+ \([^)]+\))\)\./);
  assert.ok(marker, 'freshly built Claude router should contain the canonical version marker');
  const expectedVersion = marker[1];
  assert.match(expectedVersion, /\([^)]+\)$/, 'the expected version should retain its short hash');

  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-report-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  for (const [mode, heading] of [
    ['copy', 'Deployed effective-flow skill to:'],
    ['link', 'Linked effective-flow skill to:'],
  ]) {
    await t.test(mode, () => {
      const result = runShell(`. "$ROOT_DIR/local-common.sh"; effective_flow_deploy_from_dist`, {
        ...isolatedEnvironment(join(sandbox, mode), mode, distRoot),
      });

      assert.equal(result.status, 0, result.stderr);
      const lines = result.stdout.trimEnd().split('\n');
      assert.equal(lines[0], `effective-flow ${expectedVersion}`);
      assert.equal(lines[1], heading);
      assert.match(
        result.stdout,
        new RegExp(`${expectedVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n${heading}`),
      );
    });
  }
});

test('missing and malformed routers remain non-fatal', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-report-invalid-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const malformedDist = join(sandbox, 'malformed-dist');
  await mkdir(join(malformedDist, 'claude/effective-flow'), { recursive: true });
  await writeFile(
    join(malformedDist, 'claude/effective-flow/SKILL.md'),
    '# Effective Flow\n\nNo canonical version marker.\n',
  );

  for (const [name, distRoot] of [
    ['missing', join(sandbox, 'missing-dist')],
    ['malformed', malformedDist],
  ]) {
    await t.test(name, () => {
      const result = runShell(`. "$ROOT_DIR/local-common.sh"; effective_flow_report`, {
        ...isolatedEnvironment(join(sandbox, name), 'copy', distRoot),
      });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.split('\n')[0], 'Deployed effective-flow skill to:');
      assert.doesNotMatch(result.stdout, /^effective-flow /m);
    });
  }
});
