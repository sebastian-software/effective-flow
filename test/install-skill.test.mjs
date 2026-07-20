import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const USAGE = 'Usage: install-skill.sh [local|-h|--help]\n';

async function runInstaller(root, args) {
  const fixture = await mkdtemp(join(root, 'case-'));
  const installer = join(fixture, 'install-skill.sh');
  const sentinel = join(fixture, 'dispatch.log');
  await copyFile(join(ROOT_DIR, 'install-skill.sh'), installer);
  await writeFile(
    join(fixture, 'local-common.sh'),
    [
      'printf \'sourced\\n\' >> "$EFFECTIVE_FLOW_TEST_SENTINEL"',
      'effective_flow_deploy() {',
      '  printf \'local\\n\' >> "$EFFECTIVE_FLOW_TEST_SENTINEL"',
      '}',
      'effective_flow_install_latest_release() {',
      '  printf \'release\\n\' >> "$EFFECTIVE_FLOW_TEST_SENTINEL"',
      '}',
      '',
    ].join('\n'),
  );

  const result = spawnSync('/bin/sh', [installer, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: join(fixture, 'home'),
      CLAUDE_HOME: join(fixture, 'claude'),
      CODEX_HOME: join(fixture, 'codex'),
      EFFECTIVE_FLOW_TEST_SENTINEL: sentinel,
    },
  });
  let dispatch = '';
  try {
    dispatch = await readFile(sentinel, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { ...result, dispatch };
}

test('installer dispatches only the exact release and local invocations', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-installer-dispatch-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  for (const [name, args, dispatch] of [
    ['latest release', [], 'sourced\nrelease\n'],
    ['local checkout', ['local'], 'sourced\nlocal\n'],
  ]) {
    await t.test(name, async () => {
      const result = await runInstaller(sandbox, args);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
      assert.equal(result.dispatch, dispatch);
    });
  }
});

test('installer help is successful and has no installer side effects', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-installer-help-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  for (const flag of ['-h', '--help']) {
    await t.test(flag, async () => {
      const result = await runInstaller(sandbox, [flag]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, USAGE);
      assert.equal(result.stderr, '');
      assert.equal(result.dispatch, '');
    });
  }
});

test('installer rejects invalid argument vectors before sourcing deployment helpers', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-installer-invalid-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const cases = [
    ['unknown argument', ['unknown']],
    ['option terminator', ['--']],
    ['case-mismatched local mode', ['Local']],
    ['empty argument', ['']],
    ['local mode with extra argument', ['local', 'extra']],
    ['short help with extra argument', ['-h', 'extra']],
    ['long help with extra argument', ['--help', 'extra']],
    ['multiple unknown arguments', ['unknown', 'extra']],
  ];
  for (const [name, args] of cases) {
    await t.test(name, async () => {
      const result = await runInstaller(sandbox, args);
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, `Invalid arguments.\n${USAGE}`);
      assert.equal(result.dispatch, '');
    });
  }
});
