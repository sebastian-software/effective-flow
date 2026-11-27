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

import {
  PilotMeasurementError,
  UNSAFE_RUNTIME_ROOT_REASONS,
  errorEnvelope,
  executeOperation,
} from '../src/scripts/pilot-measurement-core.mjs';
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

const UNSAFE_MESSAGE = 'pilot measurement runtime guard rejected the target';
const GIT_SUBCOMMANDS = ['rev-parse', 'ls-files', 'check-ignore'];
const STDOUT_MARKER = 'stdout-marker-do-not-echo';
const STDERR_MARKER = 'stderr-marker-do-not-echo';

function inventoryInput({ root, repositoryIdentity }) {
  return { runtimeStateRoot: root, repositoryIdentity };
}

// Wraps the real runner: every call carries a stderr marker, and a faked result for the named
// subcommand also carries a stdout marker, so a leak of either stream is detectable.
function markedRunner(override = () => undefined) {
  return async (call) => {
    const faked = override(call.args[2]);
    if (faked !== undefined) {
      return { stdout: STDOUT_MARKER, stderr: STDERR_MARKER, ...faked };
    }
    const result = await runner(call);
    return {
      ...result,
      stderr: Buffer.concat([result.stderr ?? Buffer.alloc(0), Buffer.from(STDERR_MARKER)]),
    };
  };
}

function failingSubcommand(subcommand, result) {
  return markedRunner((name) => (name === subcommand ? result : undefined));
}

// Each case returns the inventory input, its dependencies, and the fixture paths it used.
const ROOT_CASES = [
  {
    label: 'a missing runner',
    reason: 'git-unavailable',
    arrange: (t) => {
      const fixture = repository(t);
      return { input: inventoryInput(fixture), deps: {}, paths: [fixture.root] };
    },
  },
  {
    label: 'a runner spawn error',
    reason: 'git-unavailable',
    arrange: (t) => {
      const fixture = repository(t);
      const spawnError = markedRunner(() => ({ error: new Error(STDERR_MARKER), status: 0 }));
      return {
        input: inventoryInput(fixture),
        deps: { runner: spawnError },
        paths: [fixture.root],
      };
    },
  },
  {
    label: 'a directory outside any repository',
    reason: 'git-failed',
    subcommand: 'rev-parse',
    arrange: (t) => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-pilot-bare-')));
      t.after(() => rmSync(root, { recursive: true, force: true }));
      const fixture = repository(t);
      return {
        input: { runtimeStateRoot: root, repositoryIdentity: fixture.repositoryIdentity },
        deps: { runner: markedRunner() },
        paths: [root, fixture.root],
      };
    },
  },
  {
    label: 'a signal-killed rev-parse',
    reason: 'git-failed',
    subcommand: 'rev-parse',
    arrange: (t) => {
      const fixture = repository(t);
      return {
        input: inventoryInput(fixture),
        deps: { runner: failingSubcommand('rev-parse', { status: null }) },
        paths: [fixture.root],
      };
    },
  },
  {
    label: 'a failing ls-files',
    reason: 'git-failed',
    subcommand: 'ls-files',
    arrange: (t) => {
      const fixture = repository(t);
      return {
        input: inventoryInput(fixture),
        deps: { runner: failingSubcommand('ls-files', { status: 128 }) },
        paths: [fixture.root],
      };
    },
  },
  {
    label: 'a failing check-ignore',
    reason: 'git-failed',
    subcommand: 'check-ignore',
    arrange: (t) => {
      const fixture = repository(t);
      return {
        input: inventoryInput(fixture),
        deps: { runner: failingSubcommand('check-ignore', { status: 128 }) },
        paths: [fixture.root],
      };
    },
  },
  {
    label: 'a regular file as root',
    reason: 'not-directory',
    arrange: (t) => {
      const fixture = repository(t);
      const file = join(fixture.root, 'source.txt');
      writeFileSync(file, 'fixture\n');
      return {
        input: { runtimeStateRoot: file, repositoryIdentity: fixture.repositoryIdentity },
        deps: { runner: markedRunner() },
        paths: [fixture.root, file],
      };
    },
  },
  {
    label: 'a nested execution root',
    reason: 'toplevel-mismatch',
    arrange: (t) => {
      const fixture = repository(t);
      const nested = join(fixture.root, 'nested');
      mkdirSync(nested);
      return {
        input: { runtimeStateRoot: nested, repositoryIdentity: fixture.repositoryIdentity },
        deps: { runner: markedRunner() },
        paths: [fixture.root, nested],
      };
    },
  },
  {
    label: 'a foreign repository identity',
    reason: 'identity-mismatch',
    arrange: (t) => {
      const fixture = repository(t);
      const foreign = repository(t, 'effective-flow-pilot-foreign-');
      return {
        input: { runtimeStateRoot: fixture.root, repositoryIdentity: foreign.repositoryIdentity },
        deps: { runner: markedRunner() },
        paths: [fixture.root, foreign.root],
      };
    },
  },
  {
    label: 'a root that does not exist',
    reason: 'path-resolution',
    arrange: (t) => {
      const fixture = repository(t);
      const missing = join(fixture.root, 'missing');
      return {
        input: { runtimeStateRoot: missing, repositoryIdentity: fixture.repositoryIdentity },
        deps: { runner: markedRunner() },
        paths: [fixture.root, missing],
      };
    },
  },
  {
    label: 'tracked runtime state',
    reason: 'tracked-runtime-state',
    arrange: (t) => {
      const fixture = repository(t);
      writeFileSync(join(fixture.root, '.effective-flow', 'tracked.txt'), 'tracked\n');
      git(fixture.root, 'add', '-f', '.effective-flow/tracked.txt');
      return {
        input: inventoryInput(fixture),
        deps: { runner: markedRunner() },
        paths: [fixture.root],
      };
    },
  },
  {
    label: 'a runtime path that is not ignored',
    reason: 'not-ignored',
    arrange: (t) => {
      const fixture = repository(t);
      rmSync(join(fixture.root, '.gitignore'));
      return {
        input: inventoryInput(fixture),
        deps: { runner: markedRunner() },
        paths: [fixture.root],
      };
    },
  },
];

async function rootRejection(input, deps) {
  let envelope;
  await assert.rejects(executeOperation('inventory', input, deps), (error) => {
    assert.ok(error instanceof PilotMeasurementError);
    envelope = errorEnvelope('inventory', error);
    return true;
  });
  return envelope;
}

function stringValues(value) {
  if (typeof value === 'string') return [value];
  if (value === null || typeof value !== 'object') return [];
  return Object.values(value).flatMap(stringValues);
}

// Invariant: every reason in the closed list is reachable, and the envelope names it with the
// unchanged code, exit status and message.
for (const reason of UNSAFE_RUNTIME_ROOT_REASONS) {
  test(`UNSAFE_RUNTIME_ROOT names the failed check ${reason}`, async (t) => {
    const cases = ROOT_CASES.filter((entry) => entry.reason === reason);
    assert.ok(cases.length > 0, `no case produces ${reason}`);
    for (const entry of cases) {
      const { input, deps } = entry.arrange(t);
      const envelope = await rootRejection(input, deps);
      assert.equal(envelope.error.code, 'UNSAFE_RUNTIME_ROOT', entry.label);
      assert.equal(envelope.error.exitCode, 3, entry.label);
      assert.equal(envelope.error.message, UNSAFE_MESSAGE, entry.label);
      assert.deepEqual(
        envelope.error.details,
        entry.subcommand === undefined ? { reason } : { reason, subcommand: entry.subcommand },
        entry.label,
      );
    }
  });
}

// Invariant: no `details` value carries an absolute path or Git output.
test('no details value carries an absolute path or Git output', async (t) => {
  for (const entry of ROOT_CASES) {
    const { input, deps, paths } = entry.arrange(t);
    const envelope = await rootRejection(input, deps);
    const { details } = envelope.error;
    assert.ok(UNSAFE_RUNTIME_ROOT_REASONS.includes(details.reason), entry.label);
    if ('subcommand' in details) {
      assert.equal(details.reason, 'git-failed', entry.label);
      assert.ok(GIT_SUBCOMMANDS.includes(details.subcommand), entry.label);
    }
    for (const value of stringValues(envelope)) {
      assert.doesNotMatch(value, /(?:^|\s)\//, `${entry.label}: rooted path in ${value}`);
      for (const marker of [STDOUT_MARKER, STDERR_MARKER, ...paths]) {
        assert.equal(value.includes(marker), false, `${entry.label}: leaked ${marker}`);
      }
    }
  }
});

// Invariant: a runner that rejects inside the guard's path checks stays `path-resolution`; it is
// never reclassified as a Git failure.
test('a rejecting runner during the toplevel check reports path-resolution', async (t) => {
  const fixture = repository(t);
  const rejecting = async () => {
    throw new Error(STDERR_MARKER);
  };
  const envelope = await rootRejection(inventoryInput(fixture), { runner: rejecting });
  assert.deepEqual(envelope.error.details, { reason: 'path-resolution' });
});

// Invariant: an UNSAFE_RUNTIME_ROOT error always carries closed details; a raise without them is a
// programming error, never an envelope without a reason.
test('an UNSAFE_RUNTIME_ROOT error always carries closed details', () => {
  for (const options of [{}, { details: undefined }, { cause: new Error('cause') }]) {
    assert.throws(
      () => new PilotMeasurementError('UNSAFE_RUNTIME_ROOT', options),
      (error) => !(error instanceof PilotMeasurementError),
    );
  }
  for (const reason of UNSAFE_RUNTIME_ROOT_REASONS.filter((entry) => entry !== 'git-failed')) {
    const error = new PilotMeasurementError('UNSAFE_RUNTIME_ROOT', { details: { reason } });
    assert.deepEqual(errorEnvelope('inventory', error).error.details, { reason });
  }
});

// Invariant: `details` exists only on UNSAFE_RUNTIME_ROOT and only in the closed shape; any other
// shape is a programming error, not a helper error a caller could see as a reason.
test('error details outside the closed shape are rejected at construction', () => {
  for (const [code, details] of [
    ['UNSAFE_RUNTIME_ROOT', { reason: 'unknown' }],
    ['UNSAFE_RUNTIME_ROOT', { reason: 'git-failed' }],
    ['UNSAFE_RUNTIME_ROOT', { reason: 'git-failed', subcommand: 'status' }],
    ['UNSAFE_RUNTIME_ROOT', { reason: 'not-ignored', subcommand: 'check-ignore' }],
    ['UNSAFE_RUNTIME_ROOT', { reason: 'not-ignored', path: '/tmp' }],
    ['UNSAFE_RUNTIME_ROOT', 'not-ignored'],
    ['INVALID_PAYLOAD', { reason: 'not-ignored' }],
  ]) {
    assert.throws(
      () => new PilotMeasurementError(code, { details }),
      (error) => !(error instanceof PilotMeasurementError),
      JSON.stringify(details),
    );
  }
  for (const subcommand of GIT_SUBCOMMANDS) {
    const error = new PilotMeasurementError('UNSAFE_RUNTIME_ROOT', {
      details: { reason: 'git-failed', subcommand },
    });
    assert.deepEqual(errorEnvelope('inventory', error).error.details, {
      reason: 'git-failed',
      subcommand,
    });
  }
  assert.equal(
    'details' in errorEnvelope('inventory', new PilotMeasurementError('LOCKED')).error,
    false,
  );
});
