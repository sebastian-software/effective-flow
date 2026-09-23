import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { executeOperation } from '../src/scripts/pilot-measurement-core.mjs';
import {
  PILOT_MEASUREMENT_PROTOCOL_DIGEST,
  PILOT_MEASUREMENT_PROTOCOL_VERSION,
} from '../src/scripts/pilot-measurement-protocol.mjs';

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

async function runner({ executable, args, cwd }) {
  return spawnSync(executable, args, { cwd, encoding: null });
}

function repository(t, prefix = 'effective-flow-pilot-git-') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '--quiet');
  writeFileSync(join(root, '.gitignore'), '.effective-flow/\n');
  mkdirSync(join(root, '.effective-flow'), { mode: 0o700 });
  writeFileSync(
    join(root, '.effective-flow', 'memory.json'),
    `${JSON.stringify({ runtimeMigration: { directory: { version: 1 } } })}\n`,
    { mode: 0o600 },
  );
  return { root, repositoryIdentity: realpathSync(join(root, '.git')) };
}

function baselineInput({ root, repositoryIdentity }) {
  return {
    runtimeStateRoot: root,
    repositoryIdentity,
    configState: 'enabled',
    fastEnabled: true,
    protocolVersion: PILOT_MEASUREMENT_PROTOCOL_VERSION,
    protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
    confirmation: true,
  };
}

async function rejectsCode(operation, input, code) {
  await assert.rejects(executeOperation(operation, input, { runner }), (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test('real Git ignore and index guards admit only ignored, untracked pilot state', async (t) => {
  const receipt = repository(t);
  const unrelated = join(receipt.root, '.effective-flow', 'unrelated.json');
  writeFileSync(unrelated, '{"owner":"someone-else"}\n');

  assert.equal(
    git(receipt.root, 'check-ignore', '--no-index', '--', '.effective-flow'),
    '.effective-flow',
  );
  assert.equal(
    git(receipt.root, 'check-ignore', '--no-index', '--', '.effective-flow/model-tiering-pilot'),
    '.effective-flow/model-tiering-pilot',
  );
  assert.equal(git(receipt.root, 'ls-files', '--', '.effective-flow/'), '');

  const created = await executeOperation('begin-baseline', baselineInput(receipt), { runner });
  assert.equal(created.result.generationState, 'baseline');
  assert.equal(readFileSync(unrelated, 'utf8'), '{"owner":"someone-else"}\n');

  const tracked = repository(t, 'effective-flow-pilot-tracked-');
  const trackedPath = join(tracked.root, '.effective-flow', 'tracked.txt');
  writeFileSync(trackedPath, 'tracked runtime state\n');
  git(tracked.root, 'add', '-f', '.effective-flow/tracked.txt');
  await rejectsCode('begin-baseline', baselineInput(tracked), 'UNSAFE_RUNTIME_ROOT');
  assert.equal(readFileSync(trackedPath, 'utf8'), 'tracked runtime state\n');
});

test('repository guard rejects a nested execution root and a mismatched repository identity', async (t) => {
  const receipt = repository(t);
  const nested = join(receipt.root, 'nested');
  mkdirSync(nested);
  await rejectsCode(
    'inventory',
    {
      runtimeStateRoot: nested,
      repositoryIdentity: receipt.repositoryIdentity,
      generationId: 'a'.repeat(32),
    },
    'UNSAFE_RUNTIME_ROOT',
  );

  const foreign = repository(t, 'effective-flow-pilot-foreign-');
  await rejectsCode(
    'inventory',
    {
      runtimeStateRoot: receipt.root,
      repositoryIdentity: foreign.repositoryIdentity,
      generationId: 'b'.repeat(32),
    },
    'UNSAFE_RUNTIME_ROOT',
  );
});

test('pilot namespace symlinks fail closed without touching the link target or unrelated state', async (t) => {
  const receipt = repository(t);
  const external = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-pilot-external-')));
  t.after(() => rmSync(external, { recursive: true, force: true }));
  const externalMarker = join(external, 'keep.txt');
  const unrelated = join(receipt.root, '.effective-flow', 'keep.txt');
  writeFileSync(externalMarker, 'external\n');
  writeFileSync(unrelated, 'unrelated\n');
  symlinkSync(external, join(receipt.root, '.effective-flow', 'model-tiering-pilot'));

  await rejectsCode('begin-baseline', baselineInput(receipt), 'UNSAFE_STORAGE');
  assert.equal(readFileSync(externalMarker, 'utf8'), 'external\n');
  assert.equal(readFileSync(unrelated, 'utf8'), 'unrelated\n');
});

test('pilot namespace file collisions fail closed and preserve the colliding value', async (t) => {
  const receipt = repository(t);
  const collision = join(receipt.root, '.effective-flow', 'model-tiering-pilot');
  const unrelated = join(receipt.root, '.effective-flow', 'keep.txt');
  writeFileSync(collision, 'not a directory\n');
  writeFileSync(unrelated, 'unrelated\n');

  await rejectsCode('begin-baseline', baselineInput(receipt), 'UNSAFE_STORAGE');
  assert.equal(readFileSync(collision, 'utf8'), 'not a directory\n');
  assert.equal(readFileSync(unrelated, 'utf8'), 'unrelated\n');
});

test('pre-existing namespaces without the exact owner are rejected byte-for-byte before initialization', async (t) => {
  for (const [label, owner] of [
    ['absent owner', null],
    ['wrong owner', '{"owner":"another-subsystem","schema":1}\n'],
  ]) {
    await t.test(label, async (t) => {
      const receipt = repository(t);
      const namespace = join(receipt.root, '.effective-flow', 'model-tiering-pilot');
      mkdirSync(namespace);
      writeFileSync(join(namespace, 'keep.bin'), Buffer.from([0x00, 0xff, 0x41]));
      if (owner !== null) writeFileSync(join(namespace, 'owner.json'), owner);
      const before = Object.fromEntries(
        readdirSync(namespace)
          .sort()
          .map((name) => [name, readFileSync(join(namespace, name))]),
      );

      await rejectsCode('begin-baseline', baselineInput(receipt), 'UNSAFE_STORAGE');

      const afterNames = readdirSync(namespace).sort();
      assert.deepEqual(afterNames, Object.keys(before));
      for (const [name, contents] of Object.entries(before)) {
        assert.deepEqual(readFileSync(join(namespace, name)), contents);
      }
    });
  }
});
