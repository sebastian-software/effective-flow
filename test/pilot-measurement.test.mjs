import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import {
  PILOT_MEASUREMENT_ERROR_CODES,
  PILOT_MEASUREMENT_OPERATIONS,
  PilotMeasurementError,
  canonicalDigest,
  containsCredentialMaterial,
  errorEnvelope,
  executeOperation,
  validateRelativePath,
} from '../src/scripts/pilot-measurement-core.mjs';
import {
  PILOT_MEASUREMENT_PROTOCOL,
  PILOT_MEASUREMENT_PROTOCOL_DIGEST,
  PILOT_MEASUREMENT_PROTOCOL_VERSION,
  PILOT_MEASUREMENT_POLICY_PROJECTION,
  canonicalizeJson,
  protocolProjection,
} from '../src/scripts/pilot-measurement-protocol.mjs';

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
};

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env: GIT_ENV });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'effective-flow-pilot-core-'));
  git(root, 'init', '--initial-branch=main');
  writeFileSync(join(root, '.gitignore'), '.effective-flow/\n');
  writeFileSync(join(root, 'source.txt'), 'fixture\n');
  git(root, 'add', '.gitignore', 'source.txt');
  git(root, 'commit', '-m', 'fixture');
  mkdirSync(join(root, '.effective-flow'), { mode: 0o700 });
  writeFileSync(
    join(root, '.effective-flow', 'memory.json'),
    `${JSON.stringify({ runtimeMigration: { directory: { version: 1 } } })}\n`,
    { mode: 0o600 },
  );
  const repositoryIdentity = realpathSync(join(root, '.git'));
  let random = 1;
  const clock = { wallMs: 1_800_000_000_000, monotonicNs: 10_000_000_000n, uptime: 1000 };
  const deps = {
    runner: ({ executable, args, cwd }) => {
      const result = spawnSync(executable, args, { cwd, encoding: 'utf8', env: GIT_ENV });
      return {
        status: result.status,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        error: result.error,
      };
    },
    randomBytes: (bytes) => Buffer.alloc(bytes, random++),
    nowMs: () => clock.wallMs,
    monotonicNs: () => clock.monotonicNs,
    uptimeSeconds: () => clock.uptime,
    hostname: () => 'fixture-host',
    ownerPid: 4242,
    ownerPidStartTime: 77,
    // No installed qualification unless a test provides one: portable Fast is unavailable.
    harnessQualificationPath: join(root, 'absent-fast-harness-qualification.json'),
  };
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return {
    root,
    repositoryIdentity,
    deps,
    clock,
    common: { runtimeStateRoot: root, repositoryIdentity },
  };
}

async function beginBaseline(fx) {
  return (
    await executeOperation(
      'begin-baseline',
      {
        ...fx.common,
        configState: 'enabled',
        fastEnabled: true,
        protocolVersion: PILOT_MEASUREMENT_PROTOCOL_VERSION,
        protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
        confirmation: true,
      },
      fx.deps,
    )
  ).result;
}

function packetReservation(selectedProfile = 'quality') {
  return {
    selectedProfile,
    wouldBeFastEligible: true,
    gate: { eligibility: 'eligible', firstReason: null },
  };
}

function generationRoot(fx, generationId) {
  return join(fx.root, '.effective-flow/model-tiering-pilot/generations', generationId);
}

function handleDirectory(fx, generationId) {
  return join(fx.root, '.effective-flow/pilot-observation-handles', generationId);
}

function handlePath(fx, generationId, observationId) {
  return join(handleDirectory(fx, generationId), `${observationId}.json`);
}

function readHandle(fx, generationId, observationId) {
  return JSON.parse(readFileSync(handlePath(fx, generationId, observationId), 'utf8'));
}

function opaqueId(namespace, ordinal) {
  const bytes = Buffer.alloc(24, namespace);
  bytes.writeUInt32BE(ordinal, 20);
  return bytes.toString('base64url');
}

async function startWorkflow(fx, generationId, packets = [packetReservation()]) {
  return (
    await executeOperation(
      'start',
      {
        ...fx.common,
        generationId,
        configState: 'enabled',
        workflow: 'build',
        harnessFamily: 'codex',
        installKind: 'native',
        packets,
      },
      fx.deps,
    )
  ).result;
}

function packetIdentity(fx, generationId, reservation, packet = reservation.packets[0]) {
  return {
    ...fx.common,
    generationId,
    runId: reservation.runId,
    packetId: packet.packetId,
    workflowCapability: reservation.workflowCapability,
    packetCapability: packet.packetCapability,
  };
}

function terminalPayload(reservation, overrides = {}) {
  return {
    runId: reservation.runId,
    workflowCapability: reservation.workflowCapability,
    packets: reservation.packets.map((packet) => ({
      packetId: packet.packetId,
      packetCapability: packet.packetCapability,
      fallback: 'none',
      escalated: false,
      costProxy: { kind: 'executor-unit', unit: 'microcredit', value: '10' },
    })),
    validation: { status: 'passed', requiredCount: 1, totalCount: 1, satisfiedCount: 1 },
    review: {
      status: 'completed',
      severityCounts: { critical: 0, important: 0, note: 0 },
    },
    completionStatus: 'completed',
    qualityCorrectionRounds: 0,
    detailOptIn: false,
    trace: null,
    ...overrides,
  };
}

async function reserveAndFinish(fx, generationId, selectedProfile = 'quality') {
  const reservation = (
    await executeOperation(
      'start',
      {
        ...fx.common,
        generationId,
        configState: 'enabled',
        workflow: 'build',
        harnessFamily: 'codex',
        installKind: 'native',
        packets: [packetReservation(selectedProfile)],
      },
      fx.deps,
    )
  ).result;
  const packet = reservation.packets[0];
  const identity = {
    ...fx.common,
    generationId,
    runId: reservation.runId,
    packetId: packet.packetId,
    workflowCapability: reservation.workflowCapability,
    packetCapability: packet.packetCapability,
  };
  await executeOperation('start-packet', identity, fx.deps);
  fx.clock.wallMs += 125;
  fx.clock.monotonicNs += 125_000_000n;
  fx.clock.uptime += 0.125;
  // A native Fast spawn's sidecar model is never observed, so it can only report unverified.
  const finish = await executeOperation(
    'finish-packet',
    { ...identity, modelCompliance: selectedProfile === 'fast' ? 'unverified' : 'not-applicable' },
    fx.deps,
  );
  assert.deepEqual(finish.result.duration, { status: 'available', milliseconds: 125 });
  return reservation;
}

async function finalizeOne(fx, generationId, overrides = {}) {
  const reservation = await reserveAndFinish(fx, generationId);
  await executeOperation(
    'finalize',
    { ...fx.common, generationId, ...terminalPayload(reservation, overrides) },
    fx.deps,
  );
  return reservation;
}

test('protocol and error contracts are closed, canonical, and value-free', async () => {
  assert.deepEqual(await executeOperation('protocol', {}), {
    ok: true,
    operation: 'protocol',
    protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
    result: protocolProjection(),
  });
  assert.equal(canonicalizeJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  assert.equal(canonicalDigest({ a: 1 }), canonicalDigest({ a: 1 }));
  assert.equal(PILOT_MEASUREMENT_PROTOCOL.digest, PILOT_MEASUREMENT_PROTOCOL_DIGEST);
  assert.equal(new Set(PILOT_MEASUREMENT_OPERATIONS).size, PILOT_MEASUREMENT_OPERATIONS.length);
  assert.equal(new Set(PILOT_MEASUREMENT_ERROR_CODES).size, PILOT_MEASUREMENT_ERROR_CODES.length);

  const rejected = 'Bearer highly-sensitive-value';
  const envelope = errorEnvelope('start', new PilotMeasurementError('INVALID_PAYLOAD'));
  assert.deepEqual(envelope, {
    ok: false,
    operation: 'start',
    error: {
      code: 'INVALID_PAYLOAD',
      message: 'pilot measurement input does not match the closed schema',
      exitCode: 2,
    },
  });
  assert.doesNotMatch(JSON.stringify(envelope), new RegExp(rejected));
  assert.equal(containsCredentialMaterial(rejected), true);
  assert.equal(containsCredentialMaterial('https://user:password@example.invalid/path'), true);
  assert.equal(containsCredentialMaterial('safe-category'), false);
  assert.equal(
    validateRelativePath('src/scripts/pilot-measurement.mjs'),
    'src/scripts/pilot-measurement.mjs',
  );
  for (const unsafe of [
    '../secret',
    '/tmp/file',
    '~/file',
    'https://example.invalid/x',
    'src\\x',
    'src/café.mjs',
    'src/tab\tname.mjs',
    'src/control\u0001name.mjs',
    'src/delete\u007fname.mjs',
  ]) {
    assert.throws(() => validateRelativePath(unsafe), { code: 'INVALID_PAYLOAD' });
  }
  await assert.rejects(() => executeOperation('protocol', { extra: rejected }), {
    code: 'INVALID_PAYLOAD',
  });
});

test('inventory discovers zero or one current generation and rejects ambiguity', async (t) => {
  const fx = fixture(t);
  assert.deepEqual((await executeOperation('inventory', fx.common, fx.deps)).result, {
    generationId: null,
    generationStatus: 'absent',
    normalTombstones: 0,
    discardTombstones: 0,
    qualification: { installed: { status: 'unavailable' }, snapshot: null },
  });

  const baseline = await beginBaseline(fx);
  const discovered = (await executeOperation('inventory', fx.common, fx.deps)).result;
  assert.equal(discovered.generationId, baseline.generationId);
  assert.equal(discovered.generationStatus, 'present');
  await assert.rejects(() => beginBaseline(fx), { code: 'INVALID_STATE' });

  mkdirSync(
    join(
      fx.root,
      '.effective-flow/model-tiering-pilot/generations',
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ),
  );
  await assert.rejects(() => executeOperation('inventory', fx.common, fx.deps), {
    code: 'INVALID_STATE',
  });
});

test('baseline initialization recovers only validated staged namespace and generation states', async (t) => {
  await t.test('namespace staging interrupted before owner publication', async (t) => {
    const fx = fixture(t);
    const staging = join(
      fx.root,
      '.effective-flow',
      `.model-tiering-pilot-staging-${opaqueId(41, 1)}`,
    );
    mkdirSync(staging);

    const baseline = await beginBaseline(fx);
    assert.equal(existsSync(staging), false);
    assert.equal(
      JSON.parse(readFileSync(join(generationRoot(fx, baseline.generationId), 'state.json')))
        .generationState,
      'baseline',
    );
  });

  await t.test('partial published generation and truncated namespace lock', async (t) => {
    const fx = fixture(t);
    const first = await beginBaseline(fx);
    const namespace = join(fx.root, '.effective-flow/model-tiering-pilot');
    rmSync(generationRoot(fx, first.generationId), { recursive: true });
    const partial = generationRoot(fx, first.generationId);
    mkdirSync(partial);
    mkdirSync(join(partial, 'records'));
    writeFileSync(join(namespace, 'generation.lock'), '{"schema":');

    const recovered = await beginBaseline(fx);
    assert.notEqual(recovered.generationId, first.generationId);
    assert.equal(existsSync(partial), false);
    assert.equal(existsSync(join(namespace, 'generation.lock')), false);
  });

  await t.test('state temporary without publication is removed before retry', async (t) => {
    const fx = fixture(t);
    const first = await beginBaseline(fx);
    const root = generationRoot(fx, first.generationId);
    const state = readFileSync(join(root, 'state.json'));
    const ownerNonce = opaqueId(42, 2);
    renameSync(
      join(root, 'state.json'),
      join(root, `.tmp-begin-baseline-${first.generationId}-${ownerNonce}-${'x'.repeat(16)}`),
    );
    assert.equal(state.length > 0, true);
    writeFileSync(join(fx.root, '.effective-flow/model-tiering-pilot/generation.lock'), '{');

    const recovered = await beginBaseline(fx);
    assert.notEqual(recovered.generationId, first.generationId);
    assert.equal(existsSync(root), false);
  });

  await t.test('complete staged generation is published after a stale lock', async (t) => {
    const fx = fixture(t);
    const first = await beginBaseline(fx);
    const root = generationRoot(fx, first.generationId);
    const ownerNonce = opaqueId(43, 3);
    const staged = join(dirname(root), `.staging-${first.generationId}-${ownerNonce}`);
    renameSync(root, staged);
    writeFileSync(
      join(fx.root, '.effective-flow/model-tiering-pilot/generation.lock'),
      `${canonicalizeJson({
        schema: 1,
        operation: 'begin-baseline',
        generationId: 'namespace',
        ownerPid: 999_999,
        nonce: ownerNonce,
      })}\n`,
    );
    const staleDeps = {
      ...fx.deps,
      kill: () => {
        const error = new Error('stale');
        error.code = 'ESRCH';
        throw error;
      },
    };

    const recovered = (
      await executeOperation(
        'begin-baseline',
        {
          ...fx.common,
          configState: 'enabled',
          fastEnabled: true,
          protocolVersion: PILOT_MEASUREMENT_PROTOCOL_VERSION,
          protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
          confirmation: true,
        },
        staleDeps,
      )
    ).result;
    assert.equal(recovered.generationId, first.generationId);
    assert.equal(existsSync(staged), false);
    assert.equal(existsSync(root), true);
  });

  await t.test(
    'published state stays locked while the owner is live and retries idempotently once stale',
    async (t) => {
      const fx = fixture(t);
      const first = await beginBaseline(fx);
      const namespace = join(fx.root, '.effective-flow/model-tiering-pilot');
      const ownerNonce = opaqueId(44, 4);
      const lock = {
        schema: 1,
        operation: 'begin-baseline',
        generationId: 'namespace',
        ownerPid: process.pid,
        nonce: ownerNonce,
      };
      writeFileSync(join(namespace, 'generation.lock'), `${canonicalizeJson(lock)}\n`);
      await assert.rejects(() => beginBaseline(fx), { code: 'LOCKED' });

      const staleDeps = {
        ...fx.deps,
        kill: () => {
          const error = new Error('stale');
          error.code = 'ESRCH';
          throw error;
        },
      };
      const recovered = (
        await executeOperation(
          'begin-baseline',
          {
            ...fx.common,
            configState: 'enabled',
            fastEnabled: true,
            protocolVersion: PILOT_MEASUREMENT_PROTOCOL_VERSION,
            protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
            confirmation: true,
          },
          staleDeps,
        )
      ).result;
      assert.equal(recovered.generationId, first.generationId);
      assert.equal(existsSync(join(namespace, 'generation.lock')), false);
    },
  );

  await t.test('concurrent initialization publishes exactly one baseline', async (t) => {
    const fx = fixture(t);
    const results = await Promise.allSettled([beginBaseline(fx), beginBaseline(fx)]);
    const fulfilled = results.filter(({ status }) => status === 'fulfilled');
    const rejected = results.filter(({ status }) => status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'LOCKED');
    assert.deepEqual(
      readdirSync(join(fx.root, '.effective-flow/model-tiering-pilot/generations')),
      [fulfilled[0].value.generationId],
    );
  });
});

test('gate observations retain only anonymous grouping axes and finalize exactly once', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reserved = (
    await executeOperation(
      'start-gate-observation',
      {
        ...fx.common,
        generationId,
        configState: 'enabled',
        generationState: 'baseline',
        mode: 'report',
        harnessFamily: 'codex',
        installKind: 'native',
      },
      fx.deps,
    )
  ).result;
  assert.equal(Object.hasOwn(reserved, 'capability'), false);
  const capability = readHandle(fx, generationId, reserved.observationId).capability;
  const finalizeInput = {
    ...fx.common,
    generationId,
    observationId: reserved.observationId,
    terminalOutcome: 'reported-ready',
    ciRepairCorrections: 1,
    reviewerCorrections: 2,
    conflictCorrections: 3,
    checksReported: true,
    requiredCheckCount: 2,
    requiredChecksSatisfied: true,
  };
  assert.equal(
    (await executeOperation('finalize-gate-observation', finalizeInput, fx.deps)).result.status,
    'finalized',
  );
  assert.equal(
    (await executeOperation('finalize-gate-observation', finalizeInput, fx.deps)).result.status,
    'finalized',
  );
  const observationPath = join(
    fx.root,
    '.effective-flow/model-tiering-pilot/generations',
    generationId,
    'gate-observations',
    `${reserved.observationId}.json`,
  );
  const observation = JSON.parse(readFileSync(observationPath, 'utf8'));
  assert.equal(observation.mode, 'report');
  assert.equal(observation.harnessFamily, 'codex');
  assert.equal(Object.hasOwn(observation, 'runId'), false);
  assert.equal(Object.hasOwn(observation, 'pullRequest'), false);
  assert.doesNotMatch(readFileSync(observationPath, 'utf8'), new RegExp(capability));
  assert.doesNotMatch(
    readFileSync(handlePath(fx, generationId, reserved.observationId), 'utf8'),
    new RegExp(capability),
  );
});

test('gate observation check evidence rejects unavailable fields without consuming reservations', async (t) => {
  for (const [label, evidence] of [
    [
      'required check count unavailable',
      { requiredCheckCount: 'unavailable', requiredChecksSatisfied: true },
    ],
    [
      'required check satisfaction unavailable',
      { requiredCheckCount: 2, requiredChecksSatisfied: 'unavailable' },
    ],
  ]) {
    await t.test(label, async (t) => {
      const fx = fixture(t);
      const { generationId } = await beginBaseline(fx);
      const reserved = (
        await executeOperation(
          'start-gate-observation',
          {
            ...fx.common,
            generationId,
            configState: 'enabled',
            generationState: 'baseline',
            mode: 'report',
            harnessFamily: 'codex',
            installKind: 'native',
          },
          fx.deps,
        )
      ).result;
      const observationPath = join(
        generationRoot(fx, generationId),
        'gate-observations',
        `${reserved.observationId}.json`,
      );
      const reservation = readFileSync(observationPath, 'utf8');
      const finalizeInput = {
        ...fx.common,
        generationId,
        observationId: reserved.observationId,
        terminalOutcome: 'reported-ready',
        ciRepairCorrections: 0,
        reviewerCorrections: 0,
        conflictCorrections: 0,
        checksReported: true,
      };

      await assert.rejects(
        () =>
          executeOperation('finalize-gate-observation', { ...finalizeInput, ...evidence }, fx.deps),
        { code: 'INVALID_PAYLOAD' },
      );
      assert.equal(readFileSync(observationPath, 'utf8'), reservation);

      await assert.doesNotReject(() =>
        executeOperation(
          'finalize-gate-observation',
          {
            ...finalizeInput,
            requiredCheckCount: 2,
            requiredChecksSatisfied: true,
          },
          fx.deps,
        ),
      );
      const observation = JSON.parse(readFileSync(observationPath, 'utf8'));
      assert.equal(observation.kind, 'gate-observation');
      assert.equal(observation.requiredCheckCount, 2);
      assert.equal(observation.requiredChecksSatisfied, true);
    });
  }
});

// Invariant: a delegated merge-gate run that returns BLOCKED-USER after its reservation ends it as a
// controlled `reported-blocked` stop with unavailable check evidence in either mode, without a
// blocker field in the closed payload, and each re-dispatch reserves a separate observation.
for (const mode of ['merge', 'report'])
  test(`a BLOCKED-USER return finalizes a ${mode}-mode reservation as reported-blocked and a re-dispatch reserves afresh`, async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const reserve = async () =>
      (
        await executeOperation(
          'start-gate-observation',
          {
            ...fx.common,
            generationId,
            configState: 'enabled',
            generationState: 'baseline',
            mode,
            harnessFamily: 'claude',
            installKind: 'native',
          },
          fx.deps,
        )
      ).result;
    const observationPath = (observationId) =>
      join(generationRoot(fx, generationId), 'gate-observations', `${observationId}.json`);
    const blockedUser = (reserved) => ({
      ...fx.common,
      generationId,
      observationId: reserved.observationId,
      terminalOutcome: 'reported-blocked',
      ciRepairCorrections: 1,
      reviewerCorrections: 0,
      conflictCorrections: 0,
      checksReported: false,
      requiredCheckCount: 'unavailable',
      requiredChecksSatisfied: 'unavailable',
    });

    const first = await reserve();
    await assert.rejects(
      () =>
        executeOperation(
          'finalize-gate-observation',
          { ...blockedUser(first), blocker: 'relayed-user-decision' },
          fx.deps,
        ),
      { code: 'INVALID_PAYLOAD' },
    );
    assert.equal(
      (await executeOperation('finalize-gate-observation', blockedUser(first), fx.deps)).result
        .status,
      'finalized',
    );
    const finalized = JSON.parse(readFileSync(observationPath(first.observationId), 'utf8'));
    assert.equal(finalized.kind, 'gate-observation');
    assert.equal(finalized.mode, mode);
    assert.equal(finalized.terminalOutcome, 'reported-blocked');
    assert.deepEqual(finalized.corrections, {
      ciRepair: 1,
      configuredReviewer: 0,
      conflictResolution: 0,
    });
    assert.equal(finalized.checksReported, false);
    assert.equal(finalized.requiredCheckCount, 'unavailable');
    assert.equal(finalized.requiredChecksSatisfied, 'unavailable');

    const redispatch = await reserve();
    assert.notEqual(redispatch.observationId, first.observationId);
    assert.ok(redispatch.ordinal > first.ordinal);
    assert.equal(
      JSON.parse(readFileSync(observationPath(redispatch.observationId), 'utf8')).kind,
      'gate-observation-reservation',
    );
    await assert.rejects(
      () =>
        executeOperation(
          'finalize-gate-observation',
          {
            ...blockedUser(redispatch),
            capability: readHandle(fx, generationId, redispatch.observationId).capability,
          },
          fx.deps,
        ),
      { code: 'INVALID_PAYLOAD' },
    );
    assert.equal(
      (await executeOperation('finalize-gate-observation', blockedUser(redispatch), fx.deps)).result
        .status,
      'finalized',
    );
    assert.equal(
      JSON.parse(readFileSync(observationPath(first.observationId), 'utf8')).terminalOutcome,
      'reported-blocked',
    );
  });

function gateReservationInput(fx, generationId) {
  return {
    ...fx.common,
    generationId,
    configState: 'enabled',
    generationState: 'baseline',
    mode: 'merge',
    harnessFamily: 'codex',
    installKind: 'native',
  };
}

function gateFinalizationInput(fx, generationId, observationId) {
  return {
    ...fx.common,
    generationId,
    observationId,
    terminalOutcome: 'merged',
    ciRepairCorrections: 0,
    reviewerCorrections: 0,
    conflictCorrections: 0,
    checksReported: false,
    requiredCheckCount: 'unavailable',
    requiredChecksSatisfied: 'unavailable',
  };
}

async function reserveGateObservation(fx, generationId, deps = fx.deps) {
  return (
    await executeOperation('start-gate-observation', gateReservationInput(fx, generationId), deps)
  ).result;
}

function observationRecordPath(fx, generationId, observationId) {
  return join(generationRoot(fx, generationId), 'gate-observations', `${observationId}.json`);
}

function nextObservationOrdinal(fx, generationId) {
  return JSON.parse(readFileSync(join(generationRoot(fx, generationId), 'state.json'), 'utf8'))
    .nextObservationOrdinal;
}

// Wraps the fixture runner so that the first Git call matching `trigger` throws once.
function failingOnce(fx, trigger) {
  let fired = false;
  return {
    ...fx.deps,
    runner: (call) => {
      if (!fired && trigger(call)) {
        fired = true;
        throw new Error('injected runner failure');
      }
      return fx.deps.runner(call);
    },
  };
}

const HANDLE_ROOT_ARG = '.effective-flow/pilot-observation-handles';

// Invariant: the helper keeps the raw capability in a 0600 capability file below 0700 directories
// outside the pilot namespace, returns none of it, and finalization replaces it by a consumed
// marker holding only the capability hash, so a repeat finalization is a mutation-free `finalized`.
test('a gate observation keeps its capability in a helper-owned file that finalization consumes', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  assert.equal(existsSync(join(fx.root, HANDLE_ROOT_ARG)), false);
  const reserved = await reserveGateObservation(fx, generationId);
  assert.deepEqual(Object.keys(reserved).sort(), ['cohort', 'observationId', 'ordinal', 'status']);
  const target = handlePath(fx, generationId, reserved.observationId);
  assert.equal(statSync(target).mode & 0o777, 0o600);
  assert.equal(statSync(handleDirectory(fx, generationId)).mode & 0o777, 0o700);
  assert.equal(statSync(join(fx.root, HANDLE_ROOT_ARG)).mode & 0o777, 0o700);
  const raw = readHandle(fx, generationId, reserved.observationId);
  assert.deepEqual(Object.keys(raw).sort(), [
    'capability',
    'generationId',
    'kind',
    'observationId',
    'schema',
  ]);
  assert.equal(raw.kind, 'gate-observation-handle');
  const record = observationRecordPath(fx, generationId, reserved.observationId);
  const reservation = JSON.parse(readFileSync(record, 'utf8'));
  assert.equal(reservation.capabilityHash, canonicalDigest({ capability: raw.capability }));

  const input = gateFinalizationInput(fx, generationId, reserved.observationId);
  assert.equal(
    (await executeOperation('finalize-gate-observation', input, fx.deps)).result.status,
    'finalized',
  );
  const consumed = readHandle(fx, generationId, reserved.observationId);
  assert.deepEqual(consumed, {
    schema: 1,
    kind: 'gate-observation-handle-consumed',
    generationId,
    observationId: reserved.observationId,
    capabilityHash: reservation.capabilityHash,
  });
  assert.doesNotMatch(readFileSync(target, 'utf8'), new RegExp(raw.capability));
  const finalizedRecord = readFileSync(record, 'utf8');
  assert.equal(
    (await executeOperation('finalize-gate-observation', input, fx.deps)).result.status,
    'finalized',
  );
  assert.equal(readFileSync(record, 'utf8'), finalizedRecord);
  assert.deepEqual(readHandle(fx, generationId, reserved.observationId), consumed);
  await assert.rejects(
    () =>
      executeOperation(
        'finalize-gate-observation',
        { ...input, capability: raw.capability },
        fx.deps,
      ),
    { code: 'INVALID_PAYLOAD' },
  );
});

// Invariant: a missing or mismatching capability file is a neutral AUTHENTICATION_FAILED that keeps
// the reservation open, while a symlinked file or a consumed marker beside an open reservation is
// unsafe storage that persists an evidence-gap suspension.
test('finalization classifies missing, mismatching, and unsafe capability files', async (t) => {
  const otherId = 'Q'.repeat(32);
  for (const [label, arrange, code, pilotControlOutcome] of [
    ['missing file', (target) => rmSync(target), 'AUTHENTICATION_FAILED', 'none'],
    [
      'wrong capability',
      (target, raw) =>
        writeFileSync(target, `${canonicalizeJson({ ...raw, capability: 'W'.repeat(43) })}\n`),
      'AUTHENTICATION_FAILED',
      'none',
    ],
    [
      'mismatched observation identifier',
      (target, raw) =>
        writeFileSync(target, `${canonicalizeJson({ ...raw, observationId: otherId })}\n`),
      'AUTHENTICATION_FAILED',
      'none',
    ],
    [
      'mismatched generation identifier',
      (target, raw) =>
        writeFileSync(target, `${canonicalizeJson({ ...raw, generationId: otherId })}\n`),
      'AUTHENTICATION_FAILED',
      'none',
    ],
    [
      'symlinked file',
      (target, raw, fx) => {
        const elsewhere = join(fx.root, 'elsewhere.json');
        writeFileSync(elsewhere, `${canonicalizeJson(raw)}\n`);
        rmSync(target);
        symlinkSync(elsewhere, target);
      },
      'UNSAFE_STORAGE',
      'evidence-gap',
    ],
    [
      'extra key',
      (target, raw) => writeFileSync(target, `${canonicalizeJson({ ...raw, extra: true })}\n`),
      'UNSAFE_STORAGE',
      'evidence-gap',
    ],
    [
      'consumed marker on an open reservation',
      (target, raw) =>
        writeFileSync(
          target,
          `${canonicalizeJson({
            schema: 1,
            kind: 'gate-observation-handle-consumed',
            generationId: raw.generationId,
            observationId: raw.observationId,
            capabilityHash: canonicalDigest({ capability: raw.capability }),
          })}\n`,
        ),
      'UNSAFE_STORAGE',
      'evidence-gap',
    ],
  ]) {
    await t.test(label, async (t) => {
      const fx = fixture(t);
      const { generationId } = await beginBaseline(fx);
      const reserved = await reserveGateObservation(fx, generationId);
      const target = handlePath(fx, generationId, reserved.observationId);
      arrange(target, readHandle(fx, generationId, reserved.observationId), fx);
      const record = observationRecordPath(fx, generationId, reserved.observationId);
      const before = readFileSync(record, 'utf8');
      await assert.rejects(
        () =>
          executeOperation(
            'finalize-gate-observation',
            gateFinalizationInput(fx, generationId, reserved.observationId),
            fx.deps,
          ),
        { code, pilotControlOutcome },
      );
      assert.equal(readFileSync(record, 'utf8'), before);
      assert.equal(JSON.parse(before).kind, 'gate-observation-reservation');
      assert.equal(
        existsSync(join(generationRoot(fx, generationId), 'suspension.json')),
        pilotControlOutcome === 'evidence-gap',
      );
    });
  }
});

// Invariant: a reservation whose capability file cannot be written records nothing: no file, no
// reservation, and no consumed ordinal; a symlinked component is unsafe storage, an ignore-check
// failure of the handle root a neutral UNSAFE_RUNTIME_ROOT.
test('a failed capability-file write reserves nothing and consumes no ordinal', async (t) => {
  await t.test('symlinked handle root', async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const elsewhere = join(fx.root, 'elsewhere');
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(fx.root, HANDLE_ROOT_ARG));
    const ordinal = nextObservationOrdinal(fx, generationId);
    await assert.rejects(() => reserveGateObservation(fx, generationId), {
      code: 'UNSAFE_STORAGE',
      pilotControlOutcome: 'evidence-gap',
      controlStatePersisted: true,
    });
    assert.deepEqual(readdirSync(elsewhere), []);
    assert.deepEqual(readdirSync(join(generationRoot(fx, generationId), 'gate-observations')), []);
    assert.equal(nextObservationOrdinal(fx, generationId), ordinal);
  });

  await t.test('handle root not ignored', async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const deps = {
      ...fx.deps,
      runner: (call) =>
        call.args.includes(HANDLE_ROOT_ARG)
          ? { status: 1, stdout: '', stderr: '' }
          : fx.deps.runner(call),
    };
    const ordinal = nextObservationOrdinal(fx, generationId);
    await assert.rejects(
      () => reserveGateObservation(fx, generationId, deps),
      (error) => {
        assert.equal(error.code, 'UNSAFE_RUNTIME_ROOT');
        assert.deepEqual(error.details, { reason: 'not-ignored' });
        assert.equal(error.pilotControlOutcome, 'none');
        return true;
      },
    );
    assert.equal(existsSync(join(fx.root, HANDLE_ROOT_ARG)), false);
    assert.deepEqual(readdirSync(join(generationRoot(fx, generationId), 'gate-observations')), []);
    assert.equal(nextObservationOrdinal(fx, generationId), ordinal);
    assert.equal(existsSync(join(generationRoot(fx, generationId), 'suspension.json')), false);
  });
});

// Invariant: a reservation never stays without its record: a failed state or reservation write
// removes the capability file it just wrote.
test('a failed state or reservation write rolls the capability file back', async (t) => {
  for (const [label, directory] of [
    ['state write', (root) => root],
    ['reservation write', (root) => join(root, 'gate-observations')],
  ]) {
    await t.test(label, async (t) => {
      const fx = fixture(t);
      const { generationId } = await beginBaseline(fx);
      const root = generationRoot(fx, generationId);
      // The write's temporary exists only between its creation and its publication.
      const deps = failingOnce(
        fx,
        ({ args }) =>
          args.includes('ls-files') &&
          readdirSync(directory(root)).some((name) =>
            name.startsWith('.tmp-start-gate-observation-'),
          ),
      );
      await assert.rejects(() => reserveGateObservation(fx, generationId, deps));
      const handles = handleDirectory(fx, generationId);
      assert.deepEqual(existsSync(handles) ? readdirSync(handles) : [], []);
      assert.deepEqual(
        readdirSync(join(root, 'gate-observations')).filter((name) => !name.startsWith('.tmp-')),
        [],
      );
    });
  }
});

// Invariant: once the finalized record is durable, a failing consumed-marker write is swallowed:
// finalization still succeeds without a suspension, and a repeat call finishes the marker.
test('a failed consumed-marker write still finalizes and a repeat call completes the marker', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reserved = await reserveGateObservation(fx, generationId);
  const record = observationRecordPath(fx, generationId, reserved.observationId);
  const statePath = join(generationRoot(fx, generationId), 'state.json');
  const state = readFileSync(statePath, 'utf8');
  const deps = failingOnce(
    fx,
    ({ args }) =>
      args.includes(HANDLE_ROOT_ARG) &&
      JSON.parse(readFileSync(record, 'utf8')).kind === 'gate-observation',
  );
  const input = gateFinalizationInput(fx, generationId, reserved.observationId);
  const envelope = await executeOperation('finalize-gate-observation', input, deps);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.result.status, 'finalized');
  assert.equal(existsSync(join(generationRoot(fx, generationId), 'suspension.json')), false);
  assert.equal(readFileSync(statePath, 'utf8'), state);
  const finalized = readFileSync(record, 'utf8');
  assert.equal(JSON.parse(finalized).kind, 'gate-observation');
  // The raw file remains, as after a crash between the record write and the marker.
  assert.equal(
    readHandle(fx, generationId, reserved.observationId).kind,
    'gate-observation-handle',
  );

  assert.equal(
    (await executeOperation('finalize-gate-observation', input, fx.deps)).result.status,
    'finalized',
  );
  assert.equal(readFileSync(record, 'utf8'), finalized);
  assert.equal(
    readHandle(fx, generationId, reserved.observationId).kind,
    'gate-observation-handle-consumed',
  );
});

function writeLeftoverHandles(fx, generationId, name = `${'H'.repeat(32)}.json`) {
  const directory = handleDirectory(fx, generationId);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(join(directory, name), 'leftover\n');
  return directory;
}

async function reviewedGeneration(fx) {
  const { generationId } = await beginBaseline(fx);
  const reserved = await reserveGateObservation(fx, generationId);
  await executeOperation(
    'finalize-gate-observation',
    gateFinalizationInput(fx, generationId, reserved.observationId),
    fx.deps,
  );
  const statePath = join(generationRoot(fx, generationId), 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  writeFileSync(statePath, `${canonicalizeJson({ ...state, generationState: 'review' })}\n`);
  return generationId;
}

// Invariant: purge and discard remove the requested generation's capability-file directory and
// never another generation's; an absent generation's leftovers go only when the confirmed run
// echoes the dry run's `observationHandlesDigest`, and an unexpected entry is unsafe storage.
test('purge and discard remove only the requested generation capability files', async (t) => {
  const foreignId = 'F'.repeat(32);

  await t.test('purge of a present generation', async (t) => {
    const fx = fixture(t);
    const generationId = await reviewedGeneration(fx);
    const foreign = writeLeftoverHandles(fx, foreignId);
    const inventory = await executeOperation('inventory', { ...fx.common, generationId }, fx.deps);
    const aggregated = await executeOperation(
      'aggregate',
      { ...fx.common, generationId, expectedInventoryDigest: inventory.result.inventoryDigest },
      fx.deps,
    );
    const dryRun = await executeOperation(
      'purge',
      { ...fx.common, generationId, dryRun: true },
      fx.deps,
    );
    assert.equal(dryRun.result.generationStatus, 'present');
    assert.equal(dryRun.result.observationHandles, 1);
    await executeOperation(
      'purge',
      {
        ...fx.common,
        generationId,
        dryRun: false,
        reviewDigest: aggregated.result.reviewDigest,
        confirmation: true,
      },
      fx.deps,
    );
    assert.equal(existsSync(handleDirectory(fx, generationId)), false);
    assert.deepEqual(readdirSync(foreign), [`${'H'.repeat(32)}.json`]);
  });

  await t.test('discard of a present generation', async (t) => {
    const fx = fixture(t);
    const generationId = await reviewedGeneration(fx);
    const foreign = writeLeftoverHandles(fx, foreignId);
    const dryRun = await executeOperation(
      'discard-generation',
      { ...fx.common, generationId, configState: 'disabled', dryRun: true },
      fx.deps,
    );
    assert.equal(dryRun.result.observationHandles, 1);
    await executeOperation(
      'discard-generation',
      {
        ...fx.common,
        generationId,
        configState: 'disabled',
        dryRun: false,
        fullInventoryDigest: dryRun.result.fullInventoryDigest,
        decision: 'stop',
        confirmation: true,
      },
      fx.deps,
    );
    assert.equal(existsSync(handleDirectory(fx, generationId)), false);
    assert.deepEqual(readdirSync(foreign), [`${'H'.repeat(32)}.json`]);
  });

  await t.test('purge of an absent generation is bound to the dry-run digest', async (t) => {
    const fx = fixture(t);
    await beginBaseline(fx);
    const generationId = 'A'.repeat(32);
    const directory = writeLeftoverHandles(fx, generationId);
    const foreign = writeLeftoverHandles(fx, foreignId);
    const dryRun = (
      await executeOperation('purge', { ...fx.common, generationId, dryRun: true }, fx.deps)
    ).result;
    assert.equal(dryRun.generationStatus, 'absent');
    assert.equal(dryRun.observationHandles, 1);
    const confirmed = {
      ...fx.common,
      generationId,
      dryRun: false,
      reviewDigest: `sha256:${'0'.repeat(64)}`,
      confirmation: true,
    };
    for (const echoed of [undefined, `sha256:${'9'.repeat(64)}`]) {
      await assert.rejects(
        () =>
          executeOperation(
            'purge',
            echoed === undefined ? confirmed : { ...confirmed, observationHandlesDigest: echoed },
            fx.deps,
          ),
        { code: 'STALE_REVIEW' },
      );
      assert.equal(existsSync(directory), true);
    }
    await executeOperation(
      'purge',
      { ...confirmed, observationHandlesDigest: dryRun.observationHandlesDigest },
      fx.deps,
    );
    assert.equal(existsSync(directory), false);
    assert.deepEqual(readdirSync(foreign), [`${'H'.repeat(32)}.json`]);
  });

  await t.test('discard with an absent namespace validates, then removes', async (t) => {
    const fx = fixture(t);
    const generationId = 'A'.repeat(32);
    const directory = writeLeftoverHandles(fx, generationId);
    const dryRun = (
      await executeOperation(
        'discard-generation',
        { ...fx.common, generationId, configState: 'disabled', dryRun: true },
        fx.deps,
      )
    ).result;
    assert.equal(existsSync(join(fx.root, '.effective-flow/model-tiering-pilot')), false);
    assert.equal(dryRun.observationHandles, 1);
    assert.equal(existsSync(directory), true);
    const confirmed = {
      ...fx.common,
      generationId,
      configState: 'disabled',
      dryRun: false,
      fullInventoryDigest: `sha256:${'0'.repeat(64)}`,
      decision: 'stop',
      confirmation: true,
    };
    await assert.rejects(() => executeOperation('discard-generation', confirmed, fx.deps), {
      code: 'STALE_REVIEW',
    });
    assert.equal(existsSync(directory), true);
    await executeOperation(
      'discard-generation',
      { ...confirmed, observationHandlesDigest: dryRun.observationHandlesDigest },
      fx.deps,
    );
    assert.equal(existsSync(directory), false);
  });

  await t.test('an unexpected entry is unsafe storage', async (t) => {
    const fx = fixture(t);
    await beginBaseline(fx);
    const generationId = 'A'.repeat(32);
    writeLeftoverHandles(fx, generationId, 'notes.txt');
    await assert.rejects(
      () => executeOperation('purge', { ...fx.common, generationId, dryRun: true }, fx.deps),
      { code: 'UNSAFE_STORAGE' },
    );
  });
});

test('inventory binds unknown evidence as raw bytes while admission rejects it', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const target = join(
    fx.root,
    '.effective-flow/model-tiering-pilot/generations',
    generationId,
    'records',
    'opaque.bin',
  );
  writeFileSync(target, Buffer.from([0xff]));
  const first = (await executeOperation('inventory', { ...fx.common, generationId }, fx.deps))
    .result;
  writeFileSync(target, Buffer.from([0xfe]));
  const second = (await executeOperation('inventory', { ...fx.common, generationId }, fx.deps))
    .result;
  assert.notEqual(first.inventoryDigest, second.inventoryDigest);
  assert.equal(first.rawBytes, second.rawBytes);
  await assert.rejects(() => startWorkflow(fx, generationId), { code: 'INCOMPLETE_EVIDENCE' });
});

test('persisted state rejects unknown fields and identity mismatches', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const statePath = join(
    fx.root,
    '.effective-flow/model-tiering-pilot/generations',
    generationId,
    'state.json',
  );
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  writeFileSync(statePath, `${canonicalizeJson({ ...state, unexpected: true })}\n`);
  await assert.rejects(
    () => executeOperation('inventory', { ...fx.common, generationId }, fx.deps),
    { code: 'UNSAFE_STORAGE' },
  );
  writeFileSync(
    statePath,
    `${canonicalizeJson({ ...state, generationId: 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ' })}\n`,
  );
  await assert.rejects(
    () => executeOperation('inventory', { ...fx.common, generationId }, fx.deps),
    { code: 'UNSAFE_STORAGE' },
  );
});

test('semantic summary combinations and duplicate packet outcomes fail closed', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await reserveAndFinish(fx, generationId);
  await assert.rejects(
    () =>
      executeOperation(
        'finalize',
        {
          ...fx.common,
          generationId,
          ...terminalPayload(reservation, {
            validation: {
              status: 'not-required',
              requiredCount: 1,
              totalCount: 1,
              satisfiedCount: 1,
            },
          }),
        },
        fx.deps,
      ),
    { code: 'INVALID_PAYLOAD' },
  );
  const duplicate = terminalPayload(reservation);
  duplicate.packets = [duplicate.packets[0], duplicate.packets[0]];
  await assert.rejects(
    () => executeOperation('finalize', { ...fx.common, generationId, ...duplicate }, fx.deps),
    { code: 'INVALID_PAYLOAD' },
  );
});

// Invariant: open records and observations of other runs overlap instead of blocking a new
// reservation, which flags itself; residual, unknown, and malformed evidence still blocks it.
test('every invalid evidence class blocks new admission while open runs overlap', async (t) => {
  async function assertAdmissionBlocked(fx, generationId, code) {
    const root = generationRoot(fx, generationId);
    const records = join(root, 'records');
    const before = readdirSync(records).sort();
    await assert.rejects(() => startWorkflow(fx, generationId), { code });
    assert.deepEqual(readdirSync(records).sort(), before);
    assert.equal(existsSync(join(root, 'suspension.json')), false);
  }

  function storedRecord(fx, generationId, runId) {
    return JSON.parse(
      readFileSync(join(generationRoot(fx, generationId), 'records', `${runId}.json`), 'utf8'),
    );
  }

  await t.test('workflow reservation', async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const first = await startWorkflow(fx, generationId);
    assert.equal(storedRecord(fx, generationId, first.runId).overlapFlag, false);
    const second = await startWorkflow(fx, generationId);
    assert.equal(second.status, 'reserved');
    // Both reservations carry the flag; neither stores a reference to the other.
    const stored = [first, second].map(({ runId }) => storedRecord(fx, generationId, runId));
    assert.deepEqual(
      stored.map(({ overlapFlag }) => overlapFlag),
      [true, true],
    );
    assert.doesNotMatch(JSON.stringify(stored[0]), new RegExp(second.runId));
    assert.doesNotMatch(JSON.stringify(stored[1]), new RegExp(first.runId));
  });

  await t.test('packet timing receipt', async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const reservation = await reserveAndFinish(fx, generationId);
    const root = generationRoot(fx, generationId);
    const timingPath = join(
      root,
      'records',
      `${reservation.runId}.${reservation.packets[0].packetId}.timing.json`,
    );
    const receipt = readFileSync(timingPath, 'utf8');
    await executeOperation(
      'finalize',
      { ...fx.common, generationId, ...terminalPayload(reservation) },
      fx.deps,
    );
    writeFileSync(timingPath, receipt);
    await assertAdmissionBlocked(fx, generationId, 'INCOMPLETE_EVIDENCE');
  });

  await t.test('gate-observation reservation', async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    await executeOperation(
      'start-gate-observation',
      {
        ...fx.common,
        generationId,
        configState: 'enabled',
        generationState: 'baseline',
        mode: 'merge',
        harnessFamily: 'codex',
        installKind: 'native',
      },
      fx.deps,
    );
    const reservation = await startWorkflow(fx, generationId);
    assert.equal(storedRecord(fx, generationId, reservation.runId).overlapFlag, true);
  });

  for (const [label, name, contents, code] of [
    ['unknown member', 'unknown.json', '{}\n', 'INCOMPLETE_EVIDENCE'],
    ['malformed member', `${'M'.repeat(32)}.json`, '{\n', 'INCOMPLETE_EVIDENCE'],
  ]) {
    await t.test(label, async (t) => {
      const fx = fixture(t);
      const { generationId } = await beginBaseline(fx);
      writeFileSync(join(generationRoot(fx, generationId), 'records', name), contents);
      await assertAdmissionBlocked(fx, generationId, code);
    });
  }
});

test('authenticated reservations drain after suspension and after review while new admission stays closed', async (t) => {
  async function drain(fx, generationId, reservation) {
    const identity = packetIdentity(fx, generationId, reservation);
    await executeOperation('start-packet', identity, fx.deps);
    fx.clock.wallMs += 25;
    fx.clock.monotonicNs += 25_000_000n;
    fx.clock.uptime += 0.025;
    await executeOperation(
      'finish-packet',
      { ...identity, modelCompliance: 'not-applicable' },
      fx.deps,
    );
    await executeOperation(
      'finalize',
      { ...fx.common, generationId, ...terminalPayload(reservation) },
      fx.deps,
    );
    assert.equal(
      JSON.parse(
        readFileSync(
          join(generationRoot(fx, generationId), 'records', `${reservation.runId}.json`),
        ),
      ).kind,
      'workflow-record',
    );
  }

  await t.test('suspended generation', async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const reservation = await startWorkflow(fx, generationId);
    await executeOperation(
      'suspend',
      {
        ...fx.common,
        generationId,
        pilotControlOutcome: 'evidence-gap',
        affectedRecordIds: [reservation.runId],
      },
      fx.deps,
    );
    await drain(fx, generationId, reservation);
    await assert.rejects(() => startWorkflow(fx, generationId), { code: 'INVALID_STATE' });
  });

  await t.test('review generation', async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const reservation = await startWorkflow(fx, generationId);
    const inventory = await executeOperation('inventory', { ...fx.common, generationId }, fx.deps);
    await executeOperation(
      'begin-review',
      {
        ...fx.common,
        generationId,
        configState: 'disabled',
        expectedInventoryDigest: inventory.result.inventoryDigest,
        confirmation: true,
      },
      fx.deps,
    );
    await drain(fx, generationId, reservation);
    await assert.rejects(() => startWorkflow(fx, generationId), { code: 'INVALID_STATE' });
  });
});

test('resume rejects every invalid or incomplete evidence class and preserves suspension', async (t) => {
  async function exercise(t, prepare, mutate) {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const prepared = await prepare(fx, generationId);
    const suspended = await executeOperation(
      'suspend',
      {
        ...fx.common,
        generationId,
        pilotControlOutcome: 'evidence-gap',
        affectedRecordIds: [],
      },
      fx.deps,
    );
    const beforeMutation = await executeOperation(
      'inventory',
      { ...fx.common, generationId },
      fx.deps,
    );
    await mutate(fx, generationId, prepared);
    const currentInventory = await executeOperation(
      'inventory',
      { ...fx.common, generationId },
      fx.deps,
    ).catch(() => null);
    await assert.rejects(
      () =>
        executeOperation(
          'resume',
          {
            ...fx.common,
            generationId,
            configState: 'enabled',
            expectedSuspensionDigest: suspended.result.suspensionDigest,
            expectedInventoryDigest:
              currentInventory?.result.inventoryDigest ?? beforeMutation.result.inventoryDigest,
            confirmation: true,
          },
          fx.deps,
        ),
      { code: 'INCOMPLETE_EVIDENCE' },
    );
    const state = JSON.parse(readFileSync(join(generationRoot(fx, generationId), 'state.json')));
    assert.equal(state.generationState, 'suspended');
    assert.equal(existsSync(join(generationRoot(fx, generationId), 'suspension.json')), true);
  }

  await t.test('unknown member', (t) =>
    exercise(
      t,
      async () => null,
      async (fx, generationId) =>
        writeFileSync(join(generationRoot(fx, generationId), 'records', 'unknown.json'), '{}\n'),
    ),
  );
  await t.test('malformed recognized member', (t) =>
    exercise(
      t,
      async () => null,
      async (fx, generationId) =>
        writeFileSync(
          join(generationRoot(fx, generationId), 'records', `${'M'.repeat(32)}.json`),
          '{\n',
        ),
    ),
  );
  await t.test('workflow reservation', (t) =>
    exercise(
      t,
      (fx, generationId) => startWorkflow(fx, generationId),
      async () => {},
    ),
  );
  await t.test('residual timing receipt', (t) =>
    exercise(
      t,
      async (fx, generationId) => {
        const reservation = await reserveAndFinish(fx, generationId);
        const timingPath = join(
          generationRoot(fx, generationId),
          'records',
          `${reservation.runId}.${reservation.packets[0].packetId}.timing.json`,
        );
        const timing = readFileSync(timingPath);
        await executeOperation(
          'finalize',
          { ...fx.common, generationId, ...terminalPayload(reservation) },
          fx.deps,
        );
        return { timing, timingPath };
      },
      async (_fx, _generationId, { timing, timingPath }) => writeFileSync(timingPath, timing),
    ),
  );
  await t.test('owned orphan temporary', (t) =>
    exercise(
      t,
      async () => null,
      async (fx, generationId) => {
        const ownerNonce = 'O'.repeat(32);
        writeFileSync(
          join(
            generationRoot(fx, generationId),
            'records',
            `.tmp-resume-${generationId}-${ownerNonce}-${'0'.repeat(16)}`,
          ),
          'orphan\n',
        );
      },
    ),
  );
});

test('persisted evidence validation binds filenames, schemas, identities, ordinals, and cross-file links', async (t) => {
  async function mutateRecord(t, mutate) {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const reservation = await finalizeOne(fx, generationId);
    const target = join(generationRoot(fx, generationId), 'records', `${reservation.runId}.json`);
    const record = JSON.parse(readFileSync(target, 'utf8'));
    await mutate({ fx, generationId, reservation, target, record });
    await assert.rejects(
      () => executeOperation('inventory', { ...fx.common, generationId }, fx.deps),
      { code: 'INCOMPLETE_EVIDENCE' },
    );
  }

  for (const [label, mutate] of [
    [
      'filename identity',
      ({ target }) => renameSync(target, join(dirname(target), `${'F'.repeat(32)}.json`)),
    ],
    [
      'schema',
      ({ target, record }) =>
        writeFileSync(target, `${canonicalizeJson({ ...record, schema: 1 })}\n`),
    ],
    [
      'generation identity',
      ({ target, record }) =>
        writeFileSync(target, `${canonicalizeJson({ ...record, generationId: 'G'.repeat(32) })}\n`),
    ],
    [
      'protocol identity',
      ({ target, record }) =>
        writeFileSync(
          target,
          `${canonicalizeJson({ ...record, protocolDigest: `sha256:${'0'.repeat(64)}` })}\n`,
        ),
    ],
    [
      'run identity',
      ({ target, record }) =>
        writeFileSync(target, `${canonicalizeJson({ ...record, runId: 'R'.repeat(32) })}\n`),
    ],
    [
      'ordinal domain',
      ({ target, record }) =>
        writeFileSync(target, `${canonicalizeJson({ ...record, ordinal: 0 })}\n`),
    ],
    [
      'unknown key',
      ({ target, record }) =>
        writeFileSync(target, `${canonicalizeJson({ ...record, unexpected: true })}\n`),
    ],
  ]) {
    await t.test(label, (t) => mutateRecord(t, mutate));
  }

  await t.test('duplicate ordinals and packet IDs across records', async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const first = await finalizeOne(fx, generationId);
    const second = await finalizeOne(fx, generationId);
    const records = join(generationRoot(fx, generationId), 'records');
    const firstRecord = JSON.parse(readFileSync(join(records, `${first.runId}.json`), 'utf8'));
    const secondPath = join(records, `${second.runId}.json`);
    const secondRecord = JSON.parse(readFileSync(secondPath, 'utf8'));
    writeFileSync(
      secondPath,
      `${canonicalizeJson({
        ...secondRecord,
        ordinal: firstRecord.ordinal,
        packets: [{ ...secondRecord.packets[0], packetId: firstRecord.packets[0].packetId }],
      })}\n`,
    );
    await assert.rejects(
      () => executeOperation('inventory', { ...fx.common, generationId }, fx.deps),
      { code: 'INCOMPLETE_EVIDENCE' },
    );
  });

  await t.test('trace schema and record linkage', async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const trace = {
      roles: [{ role: 'nodejs-implementer', profile: 'quality' }],
      requirements: [{ id: 'requirement-1', status: 'completed', path: 'src/index.mjs' }],
      checks: [{ id: 'unit', outcome: 'passed', durationMs: 10 }],
      findings: [],
    };
    const reservation = await finalizeOne(fx, generationId, { detailOptIn: true, trace });
    const target = join(generationRoot(fx, generationId), 'traces', `${reservation.runId}.json`);
    const persisted = JSON.parse(readFileSync(target, 'utf8'));
    writeFileSync(
      target,
      `${canonicalizeJson({ ...persisted, schema: 2, runId: 'T'.repeat(32) })}\n`,
    );
    await assert.rejects(
      () => executeOperation('inventory', { ...fx.common, generationId }, fx.deps),
      { code: 'INCOMPLETE_EVIDENCE' },
    );
  });
});

test('persisted cardinality and ordinal bounds use next counters without requiring contiguous ordinals', async (t) => {
  function workflowRecord(generationId, ordinal) {
    return {
      schema: 3,
      kind: 'workflow-record',
      runId: opaqueId(1, ordinal),
      workflowCapabilityHash: canonicalDigest({ capability: `workflow-${ordinal}` }),
      generationId,
      protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
      cohort: 'baseline',
      configState: 'enabled',
      generationState: 'baseline',
      workflow: 'build',
      harnessFamily: 'codex',
      installKind: 'native',
      ordinal,
      packets: [
        {
          packetId: opaqueId(2, ordinal),
          selectedProfile: 'quality',
          wouldBeFastEligible: true,
          firstGateReason: null,
          implementationDuration: { status: 'unavailable' },
          fallback: 'none',
          escalated: false,
          costProxy: { status: 'unavailable' },
          attempt: 'started',
          modelCompliance: 'not-applicable',
        },
      ],
      validation: { status: 'not-required', requiredCount: 0, totalCount: 0, satisfiedCount: 0 },
      review: {
        status: 'unavailable',
        severityCounts: { critical: 0, important: 0, note: 0 },
      },
      completionStatus: 'completed',
      qualityCorrectionRounds: 0,
      detailTrace: false,
      overlapped: false,
    };
  }

  function gateObservation(generationId, ordinal) {
    return {
      schema: 2,
      kind: 'gate-observation',
      observationId: opaqueId(3, ordinal),
      capabilityHash: canonicalDigest({ capability: `observation-${ordinal}` }),
      generationId,
      protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
      cohort: 'baseline',
      mode: 'merge',
      harnessFamily: 'codex',
      installKind: 'native',
      ordinal,
      terminalOutcome: 'merged',
      corrections: { ciRepair: 0, configuredReviewer: 0, conflictResolution: 0 },
      checksReported: false,
      requiredCheckCount: 'unavailable',
      requiredChecksSatisfied: 'unavailable',
    };
  }

  await t.test('gaps are allowed but an ordinal must remain below its next counter', async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const root = generationRoot(fx, generationId);
    const workflow = workflowRecord(generationId, 7);
    const observation = gateObservation(generationId, 9);
    const workflowPath = join(root, 'records', `${workflow.runId}.json`);
    const observationPath = join(root, 'gate-observations', `${observation.observationId}.json`);
    writeFileSync(workflowPath, `${canonicalizeJson(workflow)}\n`);
    writeFileSync(observationPath, `${canonicalizeJson(observation)}\n`);
    const statePath = join(root, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const nextWorkflowOrdinal =
      PILOT_MEASUREMENT_PROTOCOL.limits.maxWorkflowRecordsPerGeneration + 2;
    const nextObservationOrdinal =
      PILOT_MEASUREMENT_PROTOCOL.limits.maxGateObservationsPerGeneration + 2;
    writeFileSync(
      statePath,
      `${canonicalizeJson({ ...state, nextWorkflowOrdinal, nextObservationOrdinal })}\n`,
    );
    await assert.doesNotReject(() =>
      executeOperation('inventory', { ...fx.common, generationId }, fx.deps),
    );

    writeFileSync(
      workflowPath,
      `${canonicalizeJson({ ...workflow, ordinal: nextWorkflowOrdinal })}\n`,
    );
    await assert.rejects(
      () => executeOperation('inventory', { ...fx.common, generationId }, fx.deps),
      { code: 'INCOMPLETE_EVIDENCE' },
    );
    writeFileSync(workflowPath, `${canonicalizeJson(workflow)}\n`);
    writeFileSync(
      observationPath,
      `${canonicalizeJson({ ...observation, ordinal: nextObservationOrdinal })}\n`,
    );
    await assert.rejects(
      () => executeOperation('inventory', { ...fx.common, generationId }, fx.deps),
      { code: 'INCOMPLETE_EVIDENCE' },
    );
  });

  await t.test('workflow record count cannot exceed its protocol cap', async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const root = generationRoot(fx, generationId);
    const maximum = PILOT_MEASUREMENT_PROTOCOL.limits.maxWorkflowRecordsPerGeneration;
    const statePath = join(root, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    writeFileSync(
      statePath,
      `${canonicalizeJson({ ...state, nextWorkflowOrdinal: maximum + 2 })}\n`,
    );
    for (let ordinal = 1; ordinal <= maximum + 1; ordinal += 1) {
      const record = workflowRecord(generationId, ordinal);
      writeFileSync(join(root, 'records', `${record.runId}.json`), `${canonicalizeJson(record)}\n`);
    }
    await assert.rejects(() =>
      executeOperation('inventory', { ...fx.common, generationId }, fx.deps),
    );
  });

  await t.test('gate observation count cannot exceed its protocol cap', async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const root = generationRoot(fx, generationId);
    const maximum = PILOT_MEASUREMENT_PROTOCOL.limits.maxGateObservationsPerGeneration;
    const statePath = join(root, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    writeFileSync(
      statePath,
      `${canonicalizeJson({ ...state, nextObservationOrdinal: maximum + 2 })}\n`,
    );
    for (let ordinal = 1; ordinal <= maximum + 1; ordinal += 1) {
      const observation = gateObservation(generationId, ordinal);
      writeFileSync(
        join(root, 'gate-observations', `${observation.observationId}.json`),
        `${canonicalizeJson(observation)}\n`,
      );
    }
    await assert.rejects(() =>
      executeOperation('inventory', { ...fx.common, generationId }, fx.deps),
    );
  });
});

test('deterministic identifier collisions reject without overwriting accepted evidence', async (t) => {
  await t.test('run ID collision', async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const accepted = await startWorkflow(fx, generationId);
    const target = join(generationRoot(fx, generationId), 'records', `${accepted.runId}.json`);
    const before = readFileSync(target);
    let nonce = 90;
    const deps = {
      ...fx.deps,
      randomBytes: (bytes) =>
        bytes === 24 ? Buffer.from(accepted.runId, 'base64url') : Buffer.alloc(bytes, nonce++),
    };
    await assert.rejects(() =>
      executeOperation(
        'start',
        {
          ...fx.common,
          generationId,
          configState: 'enabled',
          workflow: 'build',
          harnessFamily: 'codex',
          installKind: 'native',
          packets: [packetReservation()],
        },
        deps,
      ),
    );
    assert.deepEqual(readFileSync(target), before);
  });

  await t.test('packet ID collision within a reservation', async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    let nonce = 120;
    const deps = {
      ...fx.deps,
      randomBytes: (bytes) => (bytes === 24 ? Buffer.alloc(24, 42) : Buffer.alloc(bytes, nonce++)),
    };
    const records = join(generationRoot(fx, generationId), 'records');
    await assert.rejects(() =>
      executeOperation(
        'start',
        {
          ...fx.common,
          generationId,
          configState: 'enabled',
          workflow: 'build',
          harnessFamily: 'codex',
          installKind: 'native',
          packets: [packetReservation(), packetReservation()],
        },
        deps,
      ),
    );
    assert.deepEqual(readdirSync(records), []);
  });

  await t.test('gate-observation ID collision', async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const input = {
      ...fx.common,
      generationId,
      configState: 'enabled',
      generationState: 'baseline',
      mode: 'merge',
      harnessFamily: 'codex',
      installKind: 'native',
    };
    const accepted = (await executeOperation('start-gate-observation', input, fx.deps)).result;
    // An open observation makes the next start report busy, so close it before colliding.
    await executeOperation(
      'finalize-gate-observation',
      {
        ...fx.common,
        generationId,
        observationId: accepted.observationId,
        terminalOutcome: 'merged',
        ciRepairCorrections: 0,
        reviewerCorrections: 0,
        conflictCorrections: 0,
        checksReported: false,
        requiredCheckCount: 'unavailable',
        requiredChecksSatisfied: 'unavailable',
      },
      fx.deps,
    );
    const target = join(
      generationRoot(fx, generationId),
      'gate-observations',
      `${accepted.observationId}.json`,
    );
    const before = readFileSync(target);
    let nonce = 150;
    const deps = {
      ...fx.deps,
      randomBytes: (bytes) =>
        bytes === 24
          ? Buffer.from(accepted.observationId, 'base64url')
          : Buffer.alloc(bytes, nonce++),
    };
    await assert.rejects(() => executeOperation('start-gate-observation', input, deps));
    assert.deepEqual(readFileSync(target), before);
  });
});

test('inventory exposes recovery metadata for owned temporaries in every owned directory', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const root = generationRoot(fx, generationId);
  const ownerNonce = 'O'.repeat(32);
  writeFileSync(
    join(root, 'locks', 'lifecycle.lock'),
    `${canonicalizeJson({
      schema: 1,
      operation: 'aggregate',
      generationId,
      ownerPid: 2_147_483_647,
      nonce: ownerNonce,
    })}\n`,
  );
  const expected = [];
  for (const [index, directory] of [
    [0, 'root'],
    [1, 'records'],
    [2, 'traces'],
    [3, 'gate-observations'],
    [4, 'summaries'],
    [5, 'locks'],
  ]) {
    const temporaryName = `.tmp-aggregate-${generationId}-${ownerNonce}-${String(index).padStart(16, '0')}`;
    const contents = `orphan-${directory}\n`;
    writeFileSync(join(root, directory === 'root' ? '' : directory, temporaryName), contents);
    expected.push({
      directory,
      temporaryName,
      ownerNonce,
      digest: `sha256:${createHash('sha256').update(contents).digest('hex')}`,
    });
  }

  const inventory = await executeOperation('inventory', { ...fx.common, generationId }, fx.deps);
  assert.deepEqual(inventory.result.orphanTemporaries, expected);
  assert.equal(inventory.result.incompleteCounts.temporaries, expected.length);
  rmSync(join(root, 'locks', 'lifecycle.lock'));
  await assert.rejects(() => startWorkflow(fx, generationId), { code: 'INCOMPLETE_EVIDENCE' });
  const statePath = join(root, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  writeFileSync(statePath, `${canonicalizeJson({ ...state, generationState: 'review' })}\n`);
  const reviewInventory = await executeOperation(
    'inventory',
    { ...fx.common, generationId },
    fx.deps,
  );
  await assert.rejects(
    () =>
      executeOperation(
        'aggregate',
        {
          ...fx.common,
          generationId,
          expectedInventoryDigest: reviewInventory.result.inventoryDigest,
        },
        fx.deps,
      ),
    { code: 'INCOMPLETE_EVIDENCE' },
  );
});

test('lock-directory temporaries require exact stale-owner recovery authority', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const root = generationRoot(fx, generationId);
  const ownerNonce = 'O'.repeat(32);
  const temporaryName = `.tmp-aggregate-${generationId}-${ownerNonce}-${'9'.repeat(16)}`;
  const contents = 'interrupted lock write\n';
  const target = join(root, 'locks', temporaryName);
  writeFileSync(target, contents);
  writeFileSync(
    join(root, 'locks', 'lifecycle.lock'),
    `${canonicalizeJson({
      schema: 1,
      operation: 'aggregate',
      generationId,
      ownerPid: 2_147_483_647,
      nonce: ownerNonce,
    })}\n`,
  );
  const expectedDigest = `sha256:${createHash('sha256').update(contents).digest('hex')}`;
  const input = {
    ...fx.common,
    generationId,
    temporaryName,
    ownerNonce,
    expectedDigest,
    confirmation: true,
  };

  await assert.rejects(
    () =>
      executeOperation(
        'reconcile-temporary',
        { ...input, expectedDigest: `sha256:${'0'.repeat(64)}` },
        fx.deps,
      ),
    { code: 'STALE_REVIEW' },
  );
  await assert.rejects(
    () =>
      executeOperation(
        'reconcile-temporary',
        {
          ...input,
          ownerNonce: 'N'.repeat(32),
        },
        fx.deps,
      ),
    { code: 'INVALID_PAYLOAD' },
  );
  await assert.rejects(
    () =>
      executeOperation('reconcile-temporary', input, {
        ...fx.deps,
        kill: () => {},
      }),
    { code: 'LOCKED' },
  );
  assert.equal(readFileSync(target, 'utf8'), contents);

  const reconciled = await executeOperation('reconcile-temporary', input, {
    ...fx.deps,
    kill: () => {
      const error = new Error('stale owner');
      error.code = 'ESRCH';
      throw error;
    },
  });
  assert.deepEqual(reconciled.result, { status: 'removed', temporaryDigest: expectedDigest });
  assert.equal(existsSync(target), false);
});

test('unpublished staged lock temporaries require complete stale-owner self-proof', async (t) => {
  function staleOwnerDeps(fx, beforeProbe = () => {}) {
    return {
      ...fx.deps,
      kill: () => {
        beforeProbe();
        const error = new Error('stale owner');
        error.code = 'ESRCH';
        throw error;
      },
    };
  }

  async function stagedLock(
    t,
    {
      operation = 'aggregate',
      ownerNonce = 'R'.repeat(32),
      suffix = '2'.repeat(16),
      directory = 'locks',
      recordSource = (base) => base,
    } = {},
  ) {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const locks = join(generationRoot(fx, generationId), 'locks');
    const temporaryName = `.tmp-${operation}-${generationId}-${ownerNonce}-${suffix}`;
    const base = {
      schema: 1,
      operation,
      generationId,
      ownerPid: 2_147_483_647,
      nonce: ownerNonce,
    };
    const record = recordSource(base);
    const contents = typeof record === 'string' ? record : `${canonicalizeJson(record)}\n`;
    const target = join(generationRoot(fx, generationId), directory, temporaryName);
    writeFileSync(target, contents);
    const expectedDigest = `sha256:${createHash('sha256').update(contents).digest('hex')}`;
    return {
      fx,
      locks,
      target,
      contents,
      input: {
        ...fx.common,
        generationId,
        temporaryName,
        ownerNonce,
        expectedDigest,
        confirmation: true,
      },
    };
  }

  for (const [label, operation, ownerNonce] of [
    ['lifecycle operation', 'aggregate', 'L'.repeat(32)],
    ['packet operation', 'start-packet', 'P'.repeat(32)],
  ]) {
    await t.test(`inventories and removes a complete ${label}`, async (t) => {
      const { fx, locks, target, contents, input } = await stagedLock(t, {
        operation,
        ownerNonce,
        suffix: '1'.repeat(16),
      });

      assert.deepEqual(readdirSync(locks), [input.temporaryName]);
      const inventory = await executeOperation(
        'inventory',
        { ...fx.common, generationId: input.generationId },
        fx.deps,
      );
      assert.deepEqual(inventory.result.orphanTemporaries, [
        {
          directory: 'locks',
          temporaryName: input.temporaryName,
          digest: input.expectedDigest,
          ownerNonce,
        },
      ]);

      await assert.rejects(
        () =>
          executeOperation(
            'reconcile-temporary',
            { ...input, expectedDigest: `sha256:${'0'.repeat(64)}` },
            staleOwnerDeps(fx),
          ),
        { code: 'STALE_REVIEW' },
      );
      assert.equal(readFileSync(target, 'utf8'), contents);

      const reconciled = await executeOperation('reconcile-temporary', input, staleOwnerDeps(fx));
      assert.deepEqual(reconciled.result, {
        status: 'removed',
        temporaryDigest: input.expectedDigest,
      });
      assert.equal(existsSync(target), false);
      assert.deepEqual(readdirSync(locks), []);
    });
  }

  for (const [label, directory, recordSource, expectedCode, depsFor] of [
    [
      'live embedded owner',
      'locks',
      (base) => ({ ...base, ownerPid: process.pid }),
      'LOCKED',
      (fx) => ({ ...fx.deps, kill: () => {} }),
    ],
    [
      'filename and record operation mismatch',
      'locks',
      (base) => ({ ...base, operation: 'start' }),
      'UNSAFE_STORAGE',
      staleOwnerDeps,
    ],
    [
      'filename and record nonce mismatch',
      'locks',
      (base) => ({ ...base, nonce: 'N'.repeat(32) }),
      'UNSAFE_STORAGE',
      staleOwnerDeps,
    ],
    [
      'filename and record generation mismatch',
      'locks',
      (base) => ({ ...base, generationId: 'G'.repeat(32) }),
      'UNSAFE_STORAGE',
      staleOwnerDeps,
    ],
    [
      'non-exact record schema',
      'locks',
      (base) => ({ ...base, extra: true }),
      'INVALID_PAYLOAD',
      staleOwnerDeps,
    ],
    ['malformed record', 'locks', () => '{\n', 'UNSAFE_STORAGE', staleOwnerDeps],
    ['self-proof outside the lock directory', 'records', (base) => base, 'LOCKED', staleOwnerDeps],
  ]) {
    await t.test(`refuses ${label}`, async (t) => {
      const { fx, target, contents, input } = await stagedLock(t, { directory, recordSource });

      await assert.rejects(() => executeOperation('reconcile-temporary', input, depsFor(fx)), {
        code: expectedCode,
      });
      assert.equal(readFileSync(target, 'utf8'), contents);
    });
  }

  await t.test('refuses a same-content replacement after stale-owner review', async (t) => {
    const { fx, locks, target, contents, input } = await stagedLock(t, {
      ownerNonce: 'S'.repeat(32),
      suffix: '3'.repeat(16),
    });

    await assert.rejects(
      () =>
        executeOperation(
          'reconcile-temporary',
          input,
          staleOwnerDeps(fx, () => {
            const replacement = join(locks, '.replacement');
            writeFileSync(replacement, contents);
            renameSync(replacement, target);
          }),
        ),
      { code: 'STALE_REVIEW' },
    );
    assert.equal(readFileSync(target, 'utf8'), contents);
  });
});

test('minimal lifecycle reserves, times, and finalizes exactly once without retaining capabilities', async (t) => {
  const fx = fixture(t);
  const baseline = await beginBaseline(fx);
  const reservation = await reserveAndFinish(fx, baseline.generationId);
  const input = {
    ...fx.common,
    generationId: baseline.generationId,
    ...terminalPayload(reservation),
  };
  const finalized = await executeOperation('finalize', input, fx.deps);
  assert.equal(finalized.result.status, 'finalized');
  assert.equal((await executeOperation('finalize', input, fx.deps)).result.status, 'finalized');

  const generation = join(
    fx.root,
    '.effective-flow/model-tiering-pilot/generations',
    baseline.generationId,
  );
  const record = JSON.parse(readFileSync(join(generation, 'records', `${reservation.runId}.json`)));
  assert.equal(record.kind, 'workflow-record');
  assert.equal(record.cohort, 'baseline');
  assert.equal(record.configState, 'enabled');
  assert.equal(record.generationState, 'baseline');
  assert.deepEqual(record.packets[0].implementationDuration, {
    status: 'available',
    milliseconds: 125,
  });
  assert.equal(readdirSync(join(generation, 'traces')).length, 0);
  assert.equal(
    readdirSync(join(generation, 'records')).some((name) => name.includes('.timing.')),
    false,
  );
  const persisted = readFileSync(join(generation, 'records', `${reservation.runId}.json`), 'utf8');
  assert.doesNotMatch(persisted, new RegExp(reservation.workflowCapability));
  assert.doesNotMatch(persisted, new RegExp(reservation.packets[0].packetCapability));
});

test('detailed trace is closed and requires current-run opt-in before any trace write', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await reserveAndFinish(fx, generationId);
  const trace = {
    roles: [{ role: 'nodejs-implementer', profile: 'quality' }],
    requirements: [{ id: 'requirement-1', status: 'completed', path: 'src/index.mjs' }],
    checks: [{ id: 'unit', outcome: 'passed', durationMs: 10 }],
    findings: [],
  };
  await assert.rejects(
    () =>
      executeOperation(
        'finalize',
        {
          ...fx.common,
          generationId,
          ...terminalPayload(reservation, { detailOptIn: false, trace }),
        },
        fx.deps,
      ),
    { code: 'INVALID_PAYLOAD' },
  );
  const traceDir = join(
    fx.root,
    '.effective-flow/model-tiering-pilot/generations',
    generationId,
    'traces',
  );
  assert.deepEqual(readdirSync(traceDir), []);

  const poisoned = structuredClone(trace);
  poisoned.requirements[0].path = '../private.key';
  await assert.rejects(
    () =>
      executeOperation(
        'finalize',
        {
          ...fx.common,
          generationId,
          ...terminalPayload(reservation, { detailOptIn: true, trace: poisoned }),
        },
        fx.deps,
      ),
    { code: 'INVALID_PAYLOAD' },
  );
  assert.deepEqual(readdirSync(traceDir), []);
});

test('review freezes admission, preserves suspension causes, and cannot resume', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const suspended = await executeOperation(
    'suspend',
    {
      ...fx.common,
      generationId,
      pilotControlOutcome: 'evidence-gap',
      affectedRecordIds: [],
    },
    fx.deps,
  );
  const beforeReview = await executeOperation('inventory', { ...fx.common, generationId }, fx.deps);
  const review = await executeOperation(
    'begin-review',
    {
      ...fx.common,
      generationId,
      configState: 'disabled',
      expectedInventoryDigest: beforeReview.result.inventoryDigest,
      confirmation: true,
    },
    fx.deps,
  );
  assert.equal(review.result.generationState, 'review');
  assert.equal(review.result.preservedSuspension, true);
  await assert.rejects(
    () =>
      executeOperation(
        'resume',
        {
          ...fx.common,
          generationId,
          configState: 'enabled',
          expectedSuspensionDigest: suspended.result.suspensionDigest,
          expectedInventoryDigest: beforeReview.result.inventoryDigest,
          confirmation: true,
        },
        fx.deps,
      ),
    { code: 'INVALID_STATE' },
  );
  await assert.rejects(
    () =>
      executeOperation(
        'start',
        {
          ...fx.common,
          generationId,
          configState: 'enabled',
          workflow: 'build',
          harnessFamily: 'codex',
          installKind: 'native',
          packets: [packetReservation()],
        },
        fx.deps,
      ),
    { code: 'INVALID_STATE' },
  );
});

test('aggregate keeps private rational evidence while suppressing small public cells and evaluate is read-only', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const generation = join(fx.root, '.effective-flow/model-tiering-pilot/generations', generationId);
  const statePath = join(generation, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  writeFileSync(
    statePath,
    `${canonicalizeJson({ ...state, generationState: 'review', nextWorkflowOrdinal: 4 })}\n`,
  );
  const record = (cohort, ordinal, duration, corrections) => ({
    schema: 3,
    kind: 'workflow-record',
    runId: Buffer.alloc(24, ordinal).toString('base64url'),
    workflowCapabilityHash: canonicalDigest({ capability: `cap-${ordinal}` }),
    generationId,
    protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
    cohort,
    configState: 'enabled',
    generationState: cohort === 'baseline' ? 'baseline' : 'active',
    workflow: 'build',
    harnessFamily: 'codex',
    installKind: 'native',
    ordinal,
    packets: [
      {
        packetId: Buffer.alloc(24, ordinal + 20).toString('base64url'),
        selectedProfile: cohort === 'baseline' ? 'quality' : 'fast',
        wouldBeFastEligible: true,
        firstGateReason: null,
        implementationDuration: { status: 'available', milliseconds: duration },
        fallback: 'none',
        escalated: false,
        costProxy: { status: 'available', kind: 'executor-unit', unit: 'microcredit', value: '10' },
        attempt: 'started',
        modelCompliance: cohort === 'baseline' ? 'not-applicable' : 'unverified',
      },
    ],
    validation: { status: 'passed', requiredCount: 1, totalCount: 1, satisfiedCount: 1 },
    review: { status: 'completed', severityCounts: { critical: 0, important: 0, note: 0 } },
    completionStatus: 'completed',
    qualityCorrectionRounds: corrections,
    detailTrace: false,
    overlapped: false,
  });
  for (const value of [
    record('baseline', 1, 100, 1),
    record('baseline', 2, 200, 2),
    record('pilot', 3, 50, 0),
  ]) {
    writeFileSync(
      join(generation, 'records', `${value.runId}.json`),
      `${canonicalizeJson(value)}\n`,
    );
  }
  const inventory = await executeOperation('inventory', { ...fx.common, generationId }, fx.deps);
  const aggregate = await executeOperation(
    'aggregate',
    { ...fx.common, generationId, expectedInventoryDigest: inventory.result.inventoryDigest },
    fx.deps,
  );
  const privateView = JSON.parse(readFileSync(join(generation, 'summaries/private.json')));
  const publication = JSON.parse(readFileSync(join(generation, 'summaries/publication.json')));
  assert.deepEqual(privateView.cohorts.baseline.durationMedianMs, {
    numerator: '150',
    denominator: '1',
  });
  assert.deepEqual(privateView.cohorts.baseline.qualityCorrectionMedian, {
    numerator: '3',
    denominator: '2',
  });
  assert.deepEqual(publication.cohorts.baseline, { suppressed: true });
  assert.deepEqual(publication.cohorts.pilot, { suppressed: true });
  assert.equal(Object.hasOwn(privateView, 'generationId'), false);
  assert.equal(Object.hasOwn(publication, 'generationId'), false);

  const before = readdirSync(join(generation, 'summaries')).map((name) => [
    name,
    readFileSync(join(generation, 'summaries', name), 'utf8'),
  ]);
  const evaluation = await executeOperation(
    'evaluate',
    {
      ...fx.common,
      generationId,
      decisionDigest: aggregate.result.decisionDigest,
      reviewDigest: aggregate.result.reviewDigest,
      protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
    },
    fx.deps,
  );
  assert.equal(evaluation.result.keepEligible, false);
  assert.deepEqual(
    readdirSync(join(generation, 'summaries')).map((name) => [
      name,
      readFileSync(join(generation, 'summaries', name), 'utf8'),
    ]),
    before,
  );
  const publicationPath = join(generation, 'summaries/publication.json');
  writeFileSync(publicationPath, `${canonicalizeJson({ ...publication, caveat: 'drifted' })}\n`);
  const reviewInput = {
    ...fx.common,
    generationId,
    decisionDigest: aggregate.result.decisionDigest,
    reviewDigest: aggregate.result.reviewDigest,
    protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
  };
  await assert.rejects(() => executeOperation('evaluate', reviewInput, fx.deps), {
    code: 'STALE_REVIEW',
  });
  await assert.rejects(
    () =>
      executeOperation(
        'purge',
        {
          ...fx.common,
          generationId,
          dryRun: false,
          reviewDigest: aggregate.result.reviewDigest,
          confirmation: true,
        },
        fx.deps,
      ),
    { code: 'STALE_REVIEW' },
  );
});

test('aggregation preserves private counts and atomically suppresses public 5+1 distributions', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const generation = generationRoot(fx, generationId);
  const record = (ordinal) => ({
    schema: 3,
    kind: 'workflow-record',
    runId: Buffer.alloc(24, ordinal).toString('base64url'),
    workflowCapabilityHash: canonicalDigest({ capability: `workflow-${ordinal}` }),
    generationId,
    protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
    cohort: 'pilot',
    configState: 'enabled',
    generationState: 'active',
    workflow: 'build',
    harnessFamily: 'codex',
    installKind: 'native',
    ordinal,
    packets: [
      {
        packetId: Buffer.alloc(24, ordinal + 30).toString('base64url'),
        selectedProfile: ordinal === 1 ? 'quality' : 'fast',
        wouldBeFastEligible: ordinal !== 1,
        firstGateReason: ordinal === 1 ? 'profile-unavailable' : null,
        implementationDuration:
          ordinal === 6
            ? { status: 'unavailable' }
            : { status: 'available', milliseconds: ordinal * 100 },
        fallback: ordinal === 6 ? 'spawn-rejected' : 'none',
        escalated: ordinal === 6,
        costProxy: { status: 'available', kind: 'executor-unit', unit: 'microcredit', value: '10' },
        attempt: 'started',
        modelCompliance: ordinal === 1 ? 'not-applicable' : 'unverified',
      },
    ],
    validation:
      ordinal === 6
        ? { status: 'failed', requiredCount: 1, totalCount: 1, satisfiedCount: 0 }
        : { status: 'passed', requiredCount: 1, totalCount: 1, satisfiedCount: 1 },
    review:
      ordinal === 6
        ? { status: 'unavailable', severityCounts: { critical: 0, important: 0, note: 0 } }
        : {
            status: 'completed',
            severityCounts: { critical: ordinal === 1 ? 1 : 0, important: 0, note: 0 },
          },
    completionStatus: ordinal === 6 ? 'failed' : 'completed',
    qualityCorrectionRounds: ordinal % 2,
    detailTrace: false,
    overlapped: false,
  });
  for (let ordinal = 1; ordinal <= 6; ordinal += 1) {
    const value = record(ordinal);
    writeFileSync(
      join(generation, 'records', `${value.runId}.json`),
      `${canonicalizeJson(value)}\n`,
    );
  }

  const collectionStatePath = join(generation, 'state.json');
  const collectionState = JSON.parse(readFileSync(collectionStatePath, 'utf8'));
  writeFileSync(
    collectionStatePath,
    `${canonicalizeJson({ ...collectionState, nextWorkflowOrdinal: 7 })}\n`,
  );

  const outcomes = [
    'reported-ready',
    'reported-ready',
    'reported-ready',
    'reported-ready',
    'reported-ready',
    'failed',
  ];
  for (const [index, terminalOutcome] of outcomes.entries()) {
    const reservation = (
      await executeOperation(
        'start-gate-observation',
        {
          ...fx.common,
          generationId,
          configState: 'enabled',
          generationState: 'baseline',
          mode: 'merge',
          harnessFamily: 'codex',
          installKind: 'native',
        },
        fx.deps,
      )
    ).result;
    await executeOperation(
      'finalize-gate-observation',
      {
        ...fx.common,
        generationId,
        observationId: reservation.observationId,
        terminalOutcome,
        ciRepairCorrections: index === 5 ? 1 : 0,
        reviewerCorrections: index === 5 ? 2 : 0,
        conflictCorrections: index === 5 ? 3 : 0,
        checksReported: index === 0,
        requiredCheckCount: index === 0 ? 1 : 'unavailable',
        requiredChecksSatisfied: index === 0 ? true : 'unavailable',
      },
      fx.deps,
    );
  }
  const statePath = join(generation, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  writeFileSync(statePath, `${canonicalizeJson({ ...state, generationState: 'review' })}\n`);
  const inventory = await executeOperation('inventory', { ...fx.common, generationId }, fx.deps);
  await executeOperation(
    'aggregate',
    { ...fx.common, generationId, expectedInventoryDigest: inventory.result.inventoryDigest },
    fx.deps,
  );
  const privateView = JSON.parse(readFileSync(join(generation, 'summaries/private.json')));
  const publication = JSON.parse(readFileSync(join(generation, 'summaries/publication.json')));
  const cohort = privateView.cohorts.pilot;
  assert.equal(cohort.eligiblePacketCount, 5);
  assert.equal(cohort.attemptedFastCount, 5);
  assert.deepEqual(cohort.completionOutcomes, {
    abandoned: 0,
    aborted: 0,
    completed: 5,
    failed: 1,
  });
  assert.deepEqual(cohort.durationOutcomes, { available: 5, unavailable: 1 });
  assert.deepEqual(cohort.validationOutcomes, {
    failed: 1,
    'not-required': 0,
    passed: 5,
    unavailable: 0,
  });
  assert.deepEqual(cohort.reviewOutcomes, { completed: 5, 'not-run': 0, unavailable: 1 });
  assert.deepEqual(
    Object.keys(cohort.fallbackOutcomes).sort(),
    [...PILOT_MEASUREMENT_POLICY_PROJECTION.fallbacks].sort(),
  );
  assert.equal(cohort.fallbackOutcomes.none, 5);
  assert.equal(cohort.fallbackOutcomes['spawn-rejected'], 1);
  const publicCohort = publication.cohorts.pilot;
  assert.equal(publicCohort.workflowCount, 6);
  assert.equal(publicCohort.packetCount, 6);
  assert.deepEqual(publicCohort.eligiblePacketCount, { suppressed: true });
  assert.deepEqual(publicCohort.attemptedFastCount, { suppressed: true });
  assert.deepEqual(publicCohort.completedCount, { suppressed: true });
  assert.deepEqual(publicCohort.completionOutcomes, { suppressed: true });
  assert.deepEqual(publicCohort.fallbackOutcomes, { suppressed: true });
  assert.deepEqual(publicCohort.durationOutcomes, { suppressed: true });
  assert.deepEqual(publicCohort.validationOutcomes, { suppressed: true });
  assert.deepEqual(publicCohort.reviewOutcomes, { suppressed: true });
  assert.deepEqual(publicCohort.fallbackOccurrences, { suppressed: true });
  assert.deepEqual(publicCohort.fastWithoutEscalation, { suppressed: true });
  assert.deepEqual(publicCohort.workflowCompletion, { suppressed: true });
  assert.deepEqual(publicCohort.validationSuccess, { suppressed: true });
  assert.deepEqual(publicCohort.durationMedianMs, { numerator: '300', denominator: '1' });
  assert.deepEqual(publicCohort.criticalFindingsPerReviewed, { suppressed: true });

  const group = privateView.observations.baseline.groups['merge:codex'];
  assert.deepEqual(group.terminalOutcomes, {
    failed: 1,
    merged: 0,
    'reported-blocked': 0,
    'reported-ready': 5,
  });
  assert.deepEqual(group.corrections, {
    ciRepair: { 0: 5, 1: 1 },
    configuredReviewer: { 0: 5, 2: 1 },
    conflictResolution: { 0: 5, 3: 1 },
  });
  const publicGroup = publication.observations.baseline.groups['merge:codex'];
  assert.equal(publicGroup.observationCount, 6);
  assert.deepEqual(publicGroup.terminalOutcomes, { suppressed: true });
  assert.deepEqual(publicGroup.corrections, {
    ciRepair: { suppressed: true },
    configuredReviewer: { suppressed: true },
    conflictResolution: { suppressed: true },
  });
  assert.equal(Object.hasOwn(publicGroup, 'checkContributorCount'), false);
  assert.deepEqual(publicGroup.checksSatisfied, { suppressed: true });
});

test('publication suppresses sub-threshold ratio cells and publishes protected ratios', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const generation = generationRoot(fx, generationId);
  const completionStatuses = ['completed', 'failed', 'aborted', 'abandoned'];
  let ordinal = 1;

  for (const cohort of ['baseline', 'pilot']) {
    for (const completionStatus of completionStatuses) {
      for (let index = 0; index < 5; index += 1) {
        const subsetMember = completionStatus === 'completed' || completionStatus === 'failed';
        const value = {
          schema: 3,
          kind: 'workflow-record',
          runId: opaqueId(cohort === 'baseline' ? 70 : 71, ordinal),
          workflowCapabilityHash: canonicalDigest({ capability: `ratio-${ordinal}` }),
          generationId,
          protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
          cohort,
          configState: 'enabled',
          generationState: cohort === 'baseline' ? 'baseline' : 'active',
          workflow: 'build',
          harnessFamily: 'codex',
          installKind: 'native',
          ordinal,
          packets: [
            {
              packetId: opaqueId(72, ordinal),
              selectedProfile: cohort === 'baseline' || !subsetMember ? 'quality' : 'fast',
              wouldBeFastEligible: subsetMember,
              firstGateReason: subsetMember ? null : 'profile-unavailable',
              fallback: 'none',
              escalated: false,
              ...(completionStatus === 'abandoned'
                ? {
                    implementationDuration: { status: 'unavailable' },
                    costProxy: { status: 'unavailable' },
                    attempt: 'unknown',
                    modelCompliance: 'not-applicable',
                  }
                : {
                    implementationDuration: { status: 'available', milliseconds: 100 },
                    costProxy: {
                      status: 'available',
                      kind: 'executor-unit',
                      unit: 'microcredit',
                      value: '10',
                    },
                    attempt: 'started',
                    modelCompliance:
                      cohort === 'baseline' || !subsetMember ? 'not-applicable' : 'unverified',
                  }),
            },
          ],
          validation: { status: 'passed', requiredCount: 1, totalCount: 1, satisfiedCount: 1 },
          // Finding rates use the records whose review ran; every review class keeps five members
          // so the review distribution itself stays publishable.
          review: {
            status:
              completionStatus === 'aborted'
                ? 'not-run'
                : completionStatus === 'abandoned'
                  ? 'unavailable'
                  : 'completed',
            severityCounts: {
              critical:
                completionStatus === 'completed' &&
                (cohort === 'pilot' || (cohort === 'baseline' && index === 0))
                  ? 1
                  : 0,
              important: 0,
              note: 0,
            },
          },
          completionStatus,
          qualityCorrectionRounds: 0,
          detailTrace: false,
          overlapped: false,
        };
        writeFileSync(
          join(generation, 'records', `${value.runId}.json`),
          `${canonicalizeJson(value)}\n`,
        );
        ordinal += 1;
      }
    }
  }

  const statePath = join(generation, 'state.json');
  const collectionState = JSON.parse(readFileSync(statePath, 'utf8'));
  writeFileSync(
    statePath,
    `${canonicalizeJson({ ...collectionState, nextWorkflowOrdinal: ordinal })}\n`,
  );

  const observationCases = [
    { mode: 'merge', results: [true, true, true, true, true, false] },
    { mode: 'report', results: [true, true, true, true, true, false, false, false, false, false] },
  ];
  for (const { mode, results } of observationCases) {
    for (const requiredChecksSatisfied of results) {
      const reservation = (
        await executeOperation(
          'start-gate-observation',
          {
            ...fx.common,
            generationId,
            configState: 'enabled',
            generationState: 'baseline',
            mode,
            harnessFamily: 'codex',
            installKind: 'native',
          },
          fx.deps,
        )
      ).result;
      await executeOperation(
        'finalize-gate-observation',
        {
          ...fx.common,
          generationId,
          observationId: reservation.observationId,
          terminalOutcome: 'reported-ready',
          ciRepairCorrections: 0,
          reviewerCorrections: 0,
          conflictCorrections: 0,
          checksReported: true,
          requiredCheckCount: 1,
          requiredChecksSatisfied,
        },
        fx.deps,
      );
    }
  }

  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  writeFileSync(statePath, `${canonicalizeJson({ ...state, generationState: 'review' })}\n`);
  const inventory = await executeOperation('inventory', { ...fx.common, generationId }, fx.deps);
  await executeOperation(
    'aggregate',
    { ...fx.common, generationId, expectedInventoryDigest: inventory.result.inventoryDigest },
    fx.deps,
  );

  const privateView = JSON.parse(readFileSync(join(generation, 'summaries/private.json')));
  const publication = JSON.parse(readFileSync(join(generation, 'summaries/publication.json')));
  assert.deepEqual(privateView.cohorts.baseline.criticalFindingsPerReviewed, {
    numerator: '1',
    denominator: '10',
  });
  assert.deepEqual(publication.cohorts.baseline.criticalFindingsPerReviewed, {
    suppressed: true,
  });
  assert.deepEqual(publication.cohorts.pilot.criticalFindingsPerReviewed, {
    numerator: '1',
    denominator: '2',
  });
  assert.equal(publication.cohorts.baseline.eligiblePacketCount, 10);
  assert.equal(publication.cohorts.pilot.eligiblePacketCount, 10);
  assert.equal(publication.cohorts.pilot.attemptedFastCount, 10);

  const baselineGroups = publication.observations.baseline.groups;
  assert.deepEqual(baselineGroups['merge:codex'].checksSatisfied, { suppressed: true });
  assert.deepEqual(baselineGroups['report:codex'].checksSatisfied, {
    numerator: '1',
    denominator: '2',
  });
});

test('publication suppresses complementary 5+1 observation groups while retaining the total', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const generation = generationRoot(fx, generationId);

  for (let index = 0; index < 6; index += 1) {
    const mode = index < 5 ? 'merge' : 'report';
    const reservation = (
      await executeOperation(
        'start-gate-observation',
        {
          ...fx.common,
          generationId,
          configState: 'enabled',
          generationState: 'baseline',
          mode,
          harnessFamily: 'codex',
          installKind: 'native',
        },
        fx.deps,
      )
    ).result;
    await executeOperation(
      'finalize-gate-observation',
      {
        ...fx.common,
        generationId,
        observationId: reservation.observationId,
        terminalOutcome: 'reported-ready',
        ciRepairCorrections: 0,
        reviewerCorrections: 0,
        conflictCorrections: 0,
        checksReported: false,
        requiredCheckCount: 'unavailable',
        requiredChecksSatisfied: 'unavailable',
      },
      fx.deps,
    );
  }

  const statePath = join(generation, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  writeFileSync(statePath, `${canonicalizeJson({ ...state, generationState: 'review' })}\n`);
  const inventory = await executeOperation('inventory', { ...fx.common, generationId }, fx.deps);
  await executeOperation(
    'aggregate',
    { ...fx.common, generationId, expectedInventoryDigest: inventory.result.inventoryDigest },
    fx.deps,
  );

  const privateView = JSON.parse(readFileSync(join(generation, 'summaries/private.json')));
  const publication = JSON.parse(readFileSync(join(generation, 'summaries/publication.json')));
  assert.equal(privateView.observations.baseline.observationCount, 6);
  assert.equal(privateView.observations.baseline.groups['merge:codex'].observationCount, 5);
  assert.equal(privateView.observations.baseline.groups['report:codex'].observationCount, 1);

  const publicObservations = publication.observations.baseline;
  assert.equal(publicObservations.observationCount, 6);
  assert.deepEqual(publicObservations.groups['merge:codex'], { suppressed: true });
  assert.deepEqual(publicObservations.groups['report:codex'], { suppressed: true });
});

test('evaluation applies metric minima to actual validation contributors', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const generation = generationRoot(fx, generationId);
  let ordinal = 1;
  for (const cohort of ['baseline', 'pilot']) {
    for (let index = 0; index < 20; index += 1) {
      const runId = Buffer.alloc(24, ordinal).toString('base64url');
      const record = {
        schema: 3,
        kind: 'workflow-record',
        runId,
        workflowCapabilityHash: canonicalDigest({ capability: `minimum-${ordinal}` }),
        generationId,
        protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
        cohort,
        configState: 'enabled',
        generationState: cohort === 'baseline' ? 'baseline' : 'active',
        workflow: 'build',
        harnessFamily: 'codex',
        installKind: 'native',
        ordinal,
        packets: [
          {
            packetId: Buffer.alloc(24, ordinal + 50).toString('base64url'),
            selectedProfile: cohort === 'baseline' ? 'quality' : 'fast',
            wouldBeFastEligible: true,
            firstGateReason: null,
            implementationDuration: { status: 'available', milliseconds: 100 },
            fallback: 'none',
            escalated: false,
            costProxy: {
              status: 'available',
              kind: 'executor-unit',
              unit: 'microcredit',
              value: '10',
            },
            attempt: 'started',
            modelCompliance: cohort === 'baseline' ? 'not-applicable' : 'unverified',
          },
        ],
        validation:
          index === 0
            ? { status: 'passed', requiredCount: 1, totalCount: 1, satisfiedCount: 1 }
            : { status: 'not-required', requiredCount: 0, totalCount: 0, satisfiedCount: 0 },
        review:
          index === 0
            ? { status: 'completed', severityCounts: { critical: 0, important: 0, note: 0 } }
            : { status: 'unavailable', severityCounts: { critical: 0, important: 0, note: 0 } },
        completionStatus: 'completed',
        qualityCorrectionRounds: 0,
        detailTrace: false,
        overlapped: false,
      };
      writeFileSync(join(generation, 'records', `${runId}.json`), `${canonicalizeJson(record)}\n`);
      ordinal += 1;
    }
  }
  const statePath = join(generation, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  writeFileSync(
    statePath,
    `${canonicalizeJson({
      ...state,
      generationState: 'review',
      nextWorkflowOrdinal: ordinal,
    })}\n`,
  );
  const inventory = await executeOperation('inventory', { ...fx.common, generationId }, fx.deps);
  await executeOperation(
    'aggregate',
    { ...fx.common, generationId, expectedInventoryDigest: inventory.result.inventoryDigest },
    fx.deps,
  );
  const privateView = JSON.parse(readFileSync(join(generation, 'summaries/private.json')));
  assert.equal(privateView.cohorts.baseline.cohortMinimumMet, true);
  assert.equal(privateView.cohorts.pilot.cohortMinimumMet, true);
  assert.deepEqual(privateView.evaluationInputs.compatibleCostMedianRatio, {
    numerator: '1',
    denominator: '1',
  });
  assert.equal(privateView.evaluationInputs.validationSuccessDelta, null);
  // Finding rates count only records whose review ran: one reviewed record per cohort stays below
  // the metric minimum, so the critical-finding delta is unavailable.
  assert.equal(privateView.cohorts.baseline.reviewContributorCount, 1);
  assert.equal(privateView.evaluationInputs.criticalReviewFindingDelta, null);
});

test('evaluation rejects a shared cost group when either cohort has incompatible extras', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const generation = generationRoot(fx, generationId);
  let ordinal = 1;
  for (const cohort of ['baseline', 'pilot']) {
    for (let index = 0; index < 20; index += 1) {
      const runId = Buffer.alloc(24, ordinal).toString('base64url');
      const unit =
        index < 10 ? 'microcredit' : cohort === 'baseline' ? 'baseline-credit' : 'pilot-credit';
      const record = {
        schema: 3,
        kind: 'workflow-record',
        runId,
        workflowCapabilityHash: canonicalDigest({ capability: `cost-group-${ordinal}` }),
        generationId,
        protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
        cohort,
        configState: 'enabled',
        generationState: cohort === 'baseline' ? 'baseline' : 'active',
        workflow: 'build',
        harnessFamily: 'codex',
        installKind: 'native',
        ordinal,
        packets: [
          {
            packetId: Buffer.alloc(24, ordinal + 90).toString('base64url'),
            selectedProfile: cohort === 'baseline' ? 'quality' : 'fast',
            wouldBeFastEligible: true,
            firstGateReason: null,
            implementationDuration: { status: 'available', milliseconds: 100 },
            fallback: 'none',
            escalated: false,
            costProxy: {
              status: 'available',
              kind: 'executor-unit',
              unit,
              value: '10',
            },
            attempt: 'started',
            modelCompliance: cohort === 'baseline' ? 'not-applicable' : 'unverified',
          },
        ],
        validation: { status: 'passed', requiredCount: 1, totalCount: 1, satisfiedCount: 1 },
        review: {
          status: 'completed',
          severityCounts: { critical: 0, important: 0, note: 0 },
        },
        completionStatus: 'completed',
        qualityCorrectionRounds: 0,
        detailTrace: false,
        overlapped: false,
      };
      writeFileSync(join(generation, 'records', `${runId}.json`), `${canonicalizeJson(record)}\n`);
      ordinal += 1;
    }
  }
  const statePath = join(generation, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  writeFileSync(
    statePath,
    `${canonicalizeJson({
      ...state,
      generationState: 'review',
      nextWorkflowOrdinal: ordinal,
    })}\n`,
  );
  const inventory = await executeOperation('inventory', { ...fx.common, generationId }, fx.deps);
  await executeOperation(
    'aggregate',
    { ...fx.common, generationId, expectedInventoryDigest: inventory.result.inventoryDigest },
    fx.deps,
  );
  const privateView = JSON.parse(readFileSync(join(generation, 'summaries/private.json')));
  assert.deepEqual(Object.keys(privateView.cohorts.baseline.costGroups), [
    'executor-unit:baseline-credit',
    'executor-unit:microcredit',
  ]);
  assert.deepEqual(Object.keys(privateView.cohorts.pilot.costGroups), [
    'executor-unit:microcredit',
    'executor-unit:pilot-credit',
  ]);
  assert.equal(privateView.evaluationInputs.compatibleCostMedianRatio, null);
});

test('purge and guarded discard remove only the reviewed generation and are retry-idempotent', async (t) => {
  const fx = fixture(t);
  const unrelated = join(fx.root, '.effective-flow', 'unrelated.json');
  writeFileSync(unrelated, 'preserve\n');

  const normal = await beginBaseline(fx);
  const normalRoot = join(
    fx.root,
    '.effective-flow/model-tiering-pilot/generations',
    normal.generationId,
  );
  const normalState = JSON.parse(readFileSync(join(normalRoot, 'state.json')));
  writeFileSync(
    join(normalRoot, 'state.json'),
    `${canonicalizeJson({ ...normalState, generationState: 'review' })}\n`,
  );
  const normalInventory = await executeOperation(
    'inventory',
    { ...fx.common, generationId: normal.generationId },
    fx.deps,
  );
  const aggregated = await executeOperation(
    'aggregate',
    {
      ...fx.common,
      generationId: normal.generationId,
      expectedInventoryDigest: normalInventory.result.inventoryDigest,
    },
    fx.deps,
  );
  const purgeInput = {
    ...fx.common,
    generationId: normal.generationId,
    dryRun: false,
    reviewDigest: aggregated.result.reviewDigest,
    confirmation: true,
  };
  assert.equal(
    (await executeOperation('purge', purgeInput, fx.deps)).result.generationStatus,
    'absent',
  );
  assert.equal(
    (await executeOperation('purge', purgeInput, fx.deps)).result.generationStatus,
    'absent',
  );
  mkdirSync(
    join(
      fx.root,
      '.effective-flow/model-tiering-pilot/tombstones',
      `${normal.generationId}-sha256-${'0'.repeat(64)}`,
    ),
  );
  await assert.rejects(() => executeOperation('purge', purgeInput, fx.deps), {
    code: 'STALE_REVIEW',
  });

  const discarded = await beginBaseline(fx);
  const discardRoot = join(
    fx.root,
    '.effective-flow/model-tiering-pilot/generations',
    discarded.generationId,
  );
  const discardState = JSON.parse(readFileSync(join(discardRoot, 'state.json')));
  writeFileSync(
    join(discardRoot, 'state.json'),
    `${canonicalizeJson({ ...discardState, generationState: 'review' })}\n`,
  );
  writeFileSync(join(discardRoot, 'unknown.bin'), 'opaque payload\n');
  const dryRun = await executeOperation(
    'discard-generation',
    { ...fx.common, generationId: discarded.generationId, configState: 'disabled', dryRun: true },
    fx.deps,
  );
  assert.equal(dryRun.result.keepEligible, false);
  assert.equal(Object.hasOwn(dryRun.result, 'members'), false);
  const discardInput = {
    ...fx.common,
    generationId: discarded.generationId,
    configState: 'disabled',
    dryRun: false,
    fullInventoryDigest: dryRun.result.fullInventoryDigest,
    decision: 'stop',
    confirmation: true,
  };
  assert.equal(
    (await executeOperation('discard-generation', discardInput, fx.deps)).result.generationStatus,
    'absent',
  );
  assert.equal(
    (await executeOperation('discard-generation', discardInput, fx.deps)).result.generationStatus,
    'absent',
  );
  assert.equal(readFileSync(unrelated, 'utf8'), 'preserve\n');
});

test('hyphenated generation tombstones preserve discard retry identity', async (t) => {
  const fx = fixture(t);
  await beginBaseline(fx);
  const generationId = `generation-id-with-hyphens-${'G'.repeat(32)}`;
  const tombstones = join(fx.root, '.effective-flow/model-tiering-pilot/tombstones');
  const normalDigest = `sha256:${'1'.repeat(64)}`;
  const discardDigest = `sha256:${'2'.repeat(64)}`;
  const normalTombstone = join(tombstones, `${generationId}-${normalDigest.replace(':', '-')}`);
  const discardTombstone = join(
    tombstones,
    `${generationId}-discard-${discardDigest.replace(':', '-')}`,
  );

  mkdirSync(normalTombstone);
  const normalInventory = await executeOperation(
    'inventory',
    { ...fx.common, generationId },
    fx.deps,
  );
  rmSync(normalTombstone, { recursive: true });

  mkdirSync(discardTombstone);
  const discardInventory = await executeOperation(
    'inventory',
    { ...fx.common, generationId },
    fx.deps,
  );
  const discardInput = {
    ...fx.common,
    generationId,
    configState: 'disabled',
    dryRun: false,
    decision: 'stop',
    confirmation: true,
  };
  const mismatchedRetry = await executeOperation(
    'discard-generation',
    { ...discardInput, fullInventoryDigest: `sha256:${'3'.repeat(64)}` },
    fx.deps,
  ).then(
    () => ({ status: 'resolved' }),
    (error) => ({ status: 'rejected', code: error.code }),
  );
  const matchingRetry = await executeOperation(
    'discard-generation',
    { ...discardInput, fullInventoryDigest: discardDigest },
    fx.deps,
  );
  const idempotentRetry = await executeOperation(
    'discard-generation',
    { ...discardInput, fullInventoryDigest: discardDigest },
    fx.deps,
  );

  assert.deepEqual(mismatchedRetry, { status: 'rejected', code: 'STALE_REVIEW' });
  assert.equal(normalInventory.result.normalTombstones, 1);
  assert.equal(normalInventory.result.discardTombstones, 0);
  assert.equal(discardInventory.result.normalTombstones, 0);
  assert.equal(discardInventory.result.discardTombstones, 1);
  assert.equal(matchingRetry.result.generationStatus, 'absent');
  assert.equal(matchingRetry.result.discardTombstones, 0);
  assert.equal(existsSync(discardTombstone), false);
  assert.equal(idempotentRetry.result.generationStatus, 'absent');
  assert.equal(idempotentRetry.result.discardTombstones, 0);
});

test('guarded discard refuses a live packet writer during its read-only review', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const generation = join(fx.root, '.effective-flow/model-tiering-pilot/generations', generationId);
  const statePath = join(generation, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  writeFileSync(statePath, `${canonicalizeJson({ ...state, generationState: 'review' })}\n`);
  const packetId = 'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP';
  writeFileSync(
    join(generation, 'locks', `packet-${packetId}.lock`),
    `${canonicalizeJson({
      schema: 1,
      operation: 'start-packet',
      generationId,
      ownerPid: process.pid,
      nonce: 'NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN',
    })}\n`,
  );
  await assert.rejects(
    () =>
      executeOperation(
        'discard-generation',
        { ...fx.common, generationId, configState: 'disabled', dryRun: true },
        fx.deps,
      ),
    { code: 'LOCKED' },
  );
});
