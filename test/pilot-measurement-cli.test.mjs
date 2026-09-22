import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  PILOT_MEASUREMENT_PROTOCOL_DIGEST,
  PILOT_MEASUREMENT_PROTOCOL_VERSION,
} from '../src/scripts/pilot-measurement-protocol.mjs';

const CLI = new URL('../src/scripts/pilot-measurement.mjs', import.meta.url);
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
};

function runCli(operation, input, options = {}) {
  return spawnSync(process.execPath, [CLI.pathname, ...operation], {
    cwd: options.cwd,
    env: GIT_ENV,
    encoding: 'utf8',
    input: typeof input === 'string' ? input : JSON.stringify(input),
  });
}

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env: GIT_ENV });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'effective-flow-pilot-cli-'));
  git(root, 'init', '--initial-branch=main');
  writeFileSync(join(root, '.gitignore'), '.effective-flow/\n');
  writeFileSync(join(root, 'source.txt'), 'fixture\n');
  git(root, 'add', '.gitignore', 'source.txt');
  git(root, 'commit', '-m', 'fixture');
  mkdirSync(join(root, '.effective-flow'), { mode: 0o700 });
  writeFileSync(
    join(root, '.effective-flow/memory.json'),
    `${JSON.stringify({ runtimeMigration: { directory: { version: 1 } } })}\n`,
    { mode: 0o600 },
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, repositoryIdentity: realpathSync(join(root, '.git')) };
}

function parseSingleEnvelope(result) {
  const lines = result.stdout.trimEnd().split('\n');
  assert.equal(lines.length, 1, `expected one stdout envelope, got ${result.stdout}`);
  return JSON.parse(lines[0]);
}

test('protocol is a positional read-only operation with one stdout envelope', () => {
  const result = runCli(['protocol'], '{}');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const envelope = parseSingleEnvelope(result);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.operation, 'protocol');
  assert.equal(envelope.protocolDigest, PILOT_MEASUREMENT_PROTOCOL_DIGEST);
  assert.equal(envelope.result.version, PILOT_MEASUREMENT_PROTOCOL_VERSION);
  assert.equal(envelope.result.digest, PILOT_MEASUREMENT_PROTOCOL_DIGEST);
});

test('operation arity and JSON shape failures use stable nonzero envelopes', () => {
  for (const [args, input, code] of [
    [[], '{}', 'INVALID_OPERATION'],
    [['protocol', 'extra'], '{}', 'INVALID_OPERATION'],
    [['unknown'], '{}', 'INVALID_OPERATION'],
    [['protocol'], '{', 'INVALID_PAYLOAD'],
    [['protocol'], '[]', 'INVALID_PAYLOAD'],
  ]) {
    const result = runCli(args, input);
    assert.equal(result.status, 2, `${args.join(' ')}: ${result.stderr}`);
    const envelope = parseSingleEnvelope(result);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, code);
    assert.equal(envelope.error.exitCode, 2);
    assert.equal(result.stderr, `${code}: ${envelope.error.message}\n`);
  }
});

test('closed-schema failures never echo rejected credentials to either stream', () => {
  const secret = 'Bearer do-not-echo-super-secret';
  const result = runCli(['protocol'], { unexpected: secret });
  assert.equal(result.status, 2);
  const envelope = parseSingleEnvelope(result);
  assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
  assert.doesNotMatch(result.stdout, /do-not-echo|Bearer|super-secret/);
  assert.doesNotMatch(result.stderr, /do-not-echo|Bearer|super-secret/);
});

test('oversized stdin is rejected before JSON processing with the capacity exit code', () => {
  const oversized = JSON.stringify({ value: 'x'.repeat(4 * 1024 * 1024) });
  const result = runCli(['protocol'], oversized);
  assert.equal(result.status, 6);
  const envelope = parseSingleEnvelope(result);
  assert.deepEqual(envelope.error, {
    code: 'CAPACITY_EXHAUSTED',
    message: 'pilot measurement capacity is exhausted',
    exitCode: 6,
  });
  assert.equal(result.stderr, 'CAPACITY_EXHAUSTED: pilot measurement capacity is exhausted\n');
});

test('begin-baseline performs the guarded filesystem effect and returns no raw local data', (t) => {
  const fixture = repository(t);
  const input = {
    runtimeStateRoot: fixture.root,
    repositoryIdentity: fixture.repositoryIdentity,
    configState: 'enabled',
    fastEnabled: true,
    protocolVersion: PILOT_MEASUREMENT_PROTOCOL_VERSION,
    protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
    confirmation: true,
  };
  const result = runCli(['begin-baseline'], input, { cwd: fixture.root });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const envelope = parseSingleEnvelope(result);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.result.generationState, 'baseline');
  assert.equal(envelope.result.protocolDigest, PILOT_MEASUREMENT_PROTOCOL_DIGEST);
  assert.doesNotMatch(
    result.stdout,
    new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
  const state = join(
    fixture.root,
    '.effective-flow/model-tiering-pilot/generations',
    envelope.result.generationId,
    'state.json',
  );
  assert.equal(existsSync(state), true);
  assert.equal(JSON.parse(readFileSync(state, 'utf8')).generationState, 'baseline');
  assert.equal(git(fixture.root, 'status', '--porcelain'), '');
});

test('the spawned CLI discovers and completes one anonymous gate observation', (t) => {
  const fixture = repository(t);
  const common = {
    runtimeStateRoot: fixture.root,
    repositoryIdentity: fixture.repositoryIdentity,
  };
  const baseline = parseSingleEnvelope(
    runCli(
      ['begin-baseline'],
      {
        ...common,
        configState: 'enabled',
        fastEnabled: true,
        protocolVersion: PILOT_MEASUREMENT_PROTOCOL_VERSION,
        protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
        confirmation: true,
      },
      { cwd: fixture.root },
    ),
  ).result;
  const inventory = runCli(['inventory'], common, { cwd: fixture.root });
  assert.equal(inventory.status, 0, inventory.stderr);
  assert.equal(parseSingleEnvelope(inventory).result.generationId, baseline.generationId);

  const reservationResult = runCli(
    ['start-gate-observation'],
    {
      ...common,
      generationId: baseline.generationId,
      configState: 'enabled',
      generationState: 'baseline',
      mode: 'merge',
      harnessFamily: 'codex',
    },
    { cwd: fixture.root },
  );
  assert.equal(reservationResult.status, 0, reservationResult.stderr);
  const reservation = parseSingleEnvelope(reservationResult).result;
  const finalized = runCli(
    ['finalize-gate-observation'],
    {
      ...common,
      generationId: baseline.generationId,
      observationId: reservation.observationId,
      capability: reservation.capability,
      terminalOutcome: 'failed',
      ciRepairCorrections: 0,
      reviewerCorrections: 0,
      conflictCorrections: 0,
      checksReported: false,
      requiredCheckCount: 'unavailable',
      requiredChecksSatisfied: 'unavailable',
    },
    { cwd: fixture.root },
  );
  assert.equal(finalized.status, 0, finalized.stderr);
  assert.equal(parseSingleEnvelope(finalized).result.status, 'finalized');
  assert.doesNotMatch(finalized.stdout, new RegExp(reservation.capability));
});

test('a failed mutation leaves no namespace behind', (t) => {
  const fixture = repository(t);
  const result = runCli(
    ['begin-baseline'],
    {
      runtimeStateRoot: fixture.root,
      repositoryIdentity: fixture.repositoryIdentity,
      configState: 'enabled',
      fastEnabled: true,
      protocolVersion: PILOT_MEASUREMENT_PROTOCOL_VERSION,
      protocolDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      confirmation: true,
    },
    { cwd: fixture.root },
  );
  assert.equal(result.status, 4);
  assert.equal(parseSingleEnvelope(result).error.code, 'PROTOCOL_DRIFT');
  assert.equal(existsSync(join(fixture.root, '.effective-flow/model-tiering-pilot')), false);
});
