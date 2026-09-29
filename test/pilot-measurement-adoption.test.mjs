import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
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
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';

import {
  PILOT_MEASUREMENT_OPERATIONS,
  canonicalDigest,
  errorEnvelope,
  executeOperation,
} from '../src/scripts/pilot-measurement-core.mjs';
import {
  PILOT_MEASUREMENT_POLICY_PROJECTION,
  PILOT_MEASUREMENT_PROTOCOL,
  PILOT_MEASUREMENT_PROTOCOL_DIGEST,
  PILOT_MEASUREMENT_PROTOCOL_VERSION,
  canonicalizeJson,
} from '../src/scripts/pilot-measurement-protocol.mjs';

// Adoption-readiness contract of the pilot measurement helper: automatic activation, incident
// recording, transition-marker recovery, failure classification, packet attempts, and the metric
// inclusion rules. The fixture helpers mirror test/pilot-measurement.test.mjs.

const DAY_MS = 86_400_000;
const PREVIOUS_PROTOCOL_DIGEST =
  'sha256:4b3ed3440cf1641086497a281b3def740c8893405d72f05b638c69bf5902f5e4';
const INCIDENTS = [
  ['safety', 'critical-safety-incident'],
  ['data-integrity', 'critical-data-integrity-incident'],
  ['authorization', 'critical-authorization-incident'],
  ['scope', 'critical-scope-incident'],
];
const SUSPENSION_REASONS = [
  ...new Set(
    PILOT_MEASUREMENT_POLICY_PROJECTION.pilotControlMappings
      .map(({ suspensionReason }) => suspensionReason)
      .filter((reason) => reason !== 'none'),
  ),
];
const NEUTRAL = ['none', false, 'none'];
// Read-only directory permissions do not stop root, so permission-based write faults are skipped.
const RUNS_AS_ROOT = process.getuid?.() === 0;

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
  const root = mkdtempSync(join(tmpdir(), 'effective-flow-pilot-adoption-'));
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

function terminalPayload(reservation, overrides = {}, packetOverrides = []) {
  return {
    runId: reservation.runId,
    workflowCapability: reservation.workflowCapability,
    packets: reservation.packets.map((packet, index) => ({
      packetId: packet.packetId,
      packetCapability: packet.packetCapability,
      fallback: 'none',
      escalated: false,
      costProxy: { kind: 'executor-unit', unit: 'microcredit', value: '10' },
      ...packetOverrides[index],
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

async function timePacket(fx, generationId, reservation, packet = reservation.packets[0]) {
  const identity = packetIdentity(fx, generationId, reservation, packet);
  await executeOperation('start-packet', identity, fx.deps);
  fx.clock.wallMs += 125;
  fx.clock.monotonicNs += 125_000_000n;
  fx.clock.uptime += 0.125;
  await executeOperation('finish-packet', identity, fx.deps);
}

async function reserveAndFinish(fx, generationId, selectedProfile = 'quality') {
  const reservation = await startWorkflow(fx, generationId, [packetReservation(selectedProfile)]);
  await timePacket(fx, generationId, reservation);
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

function finalizeInput(fx, generationId, reservation, overrides, packetOverrides) {
  return {
    ...fx.common,
    generationId,
    ...terminalPayload(reservation, overrides, packetOverrides),
  };
}

function activateInput(fx, generationId) {
  return {
    ...fx.common,
    generationId,
    configState: 'enabled',
    protocolVersion: PILOT_MEASUREMENT_PROTOCOL_VERSION,
    protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
  };
}

function gateInput(fx, generationId, generationState = 'baseline') {
  return {
    ...fx.common,
    generationId,
    configState: 'enabled',
    generationState,
    mode: 'merge',
    harnessFamily: 'codex',
  };
}

function finalizeGateInput(fx, generationId, reservation, overrides = {}) {
  return {
    ...fx.common,
    generationId,
    observationId: reservation.observationId,
    capability: reservation.capability,
    terminalOutcome: 'merged',
    ciRepairCorrections: 0,
    reviewerCorrections: 0,
    conflictCorrections: 0,
    checksReported: false,
    requiredCheckCount: 'unavailable',
    requiredChecksSatisfied: 'unavailable',
    ...overrides,
  };
}

async function rejection(operation, input, deps) {
  let envelope = null;
  try {
    await executeOperation(operation, input, deps);
  } catch (error) {
    envelope = errorEnvelope(operation, error);
  }
  assert.notEqual(envelope, null, `${operation} was expected to fail`);
  return envelope;
}

function control(envelope) {
  return [envelope.pilotControlOutcome, envelope.controlStatePersisted, envelope.alert];
}

function readJsonFile(target) {
  return JSON.parse(readFileSync(target, 'utf8'));
}

function readState(fx, generationId) {
  return readJsonFile(join(generationRoot(fx, generationId), 'state.json'));
}

function writeState(fx, generationId, overrides) {
  const target = join(generationRoot(fx, generationId), 'state.json');
  writeFileSync(target, `${canonicalizeJson({ ...readJsonFile(target), ...overrides })}\n`);
}

function readSuspension(fx, generationId) {
  const target = join(generationRoot(fx, generationId), 'suspension.json');
  return existsSync(target) ? readJsonFile(target) : null;
}

function markerPath(fx, generationId) {
  return join(generationRoot(fx, generationId), 'suspension-transition.json');
}

function writeMarker(fx, generationId, operation) {
  writeFileSync(
    markerPath(fx, generationId),
    `${canonicalizeJson({
      schema: 1,
      kind: 'suspension-transition',
      generationId,
      operation,
      ownerNonce: 'M'.repeat(32),
    })}\n`,
  );
}

function holdLifecycleLock(fx, generationId) {
  const target = join(generationRoot(fx, generationId), 'locks', 'lifecycle.lock');
  writeFileSync(
    target,
    canonicalizeJson({
      schema: 1,
      operation: 'aggregate',
      generationId,
      ownerPid: process.pid,
      nonce: 'N'.repeat(32),
    }),
  );
  return () => rmSync(target);
}

// Every file below the generation with its bytes, so "persists nothing" is a byte-level claim.
function snapshot(fx, generationId) {
  const root = generationRoot(fx, generationId);
  const walk = (directory) =>
    readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
      .flatMap((entry) => {
        const target = join(directory, entry.name);
        return entry.isDirectory()
          ? walk(target)
          : [[relative(root, target), readFileSync(target, 'utf8')]];
      });
  return walk(root);
}

async function inventory(fx, generationId) {
  return (await executeOperation('inventory', { ...fx.common, generationId }, fx.deps)).result;
}

function storedPacket(ordinal, index, options = {}) {
  const {
    selectedProfile = 'quality',
    eligible = true,
    attempt = 'started',
    duration = 100,
    cost = '10',
    fallback = 'none',
  } = options;
  return {
    packetId: opaqueId(150, ordinal * 1000 + index),
    selectedProfile,
    wouldBeFastEligible: eligible,
    firstGateReason: eligible ? null : 'profile-unavailable',
    implementationDuration:
      duration === null
        ? { status: 'unavailable' }
        : { status: 'available', milliseconds: duration },
    fallback,
    escalated: fallback !== 'none',
    costProxy:
      cost === null
        ? { status: 'unavailable' }
        : { status: 'available', kind: 'executor-unit', unit: 'microcredit', value: cost },
    attempt,
  };
}

function storedRecord(generationId, ordinal, packets, options = {}) {
  const { cohort = 'baseline', completionStatus = 'completed' } = options;
  return {
    schema: 2,
    kind: 'workflow-record',
    runId: opaqueId(200, ordinal),
    workflowCapabilityHash: canonicalDigest({ capability: `adoption-${ordinal}` }),
    generationId,
    protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
    cohort,
    configState: 'enabled',
    generationState: cohort === 'baseline' ? 'baseline' : 'active',
    workflow: 'build',
    harnessFamily: 'codex',
    ordinal,
    packets,
    validation: { status: 'passed', requiredCount: 1, totalCount: 1, satisfiedCount: 1 },
    review: { status: 'completed', severityCounts: { critical: 0, important: 0, note: 0 } },
    completionStatus,
    qualityCorrectionRounds: 0,
    detailTrace: false,
  };
}

function writeRecords(fx, generationId, records, stateOverrides = {}) {
  for (const record of records) {
    writeFileSync(
      join(generationRoot(fx, generationId), 'records', `${record.runId}.json`),
      `${canonicalizeJson(record)}\n`,
    );
  }
  writeState(fx, generationId, {
    nextWorkflowOrdinal: Math.max(...records.map(({ ordinal }) => ordinal)) + 1,
    ...stateOverrides,
  });
}

function orphanTemporary(fx, generationId) {
  return join(
    generationRoot(fx, generationId),
    'records',
    `.tmp-start-${generationId}-${'O'.repeat(32)}-${'0'.repeat(16)}`,
  );
}

function treeBytes(root) {
  return readdirSync(root, { withFileTypes: true }).reduce((total, entry) => {
    const target = join(root, entry.name);
    return total + (entry.isDirectory() ? treeBytes(target) : statSync(target).size);
  }, 0);
}

test('protocol versions move to 1.1.0 with a new aggregation algorithm and digest', async (t) => {
  assert.equal(PILOT_MEASUREMENT_PROTOCOL_VERSION, '1.1.0');
  assert.equal(PILOT_MEASUREMENT_PROTOCOL.version, '1.1.0');
  assert.equal(PILOT_MEASUREMENT_PROTOCOL.aggregation.algorithmVersion, 2);
  assert.notEqual(PILOT_MEASUREMENT_PROTOCOL_DIGEST, PREVIOUS_PROTOCOL_DIGEST);
  assert.match(PILOT_MEASUREMENT_PROTOCOL_DIGEST, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(PILOT_MEASUREMENT_PROTOCOL.enums.packetAttempts, [
    'started',
    'not-started',
    'unknown',
  ]);
  assert.ok(Object.hasOwn(PILOT_MEASUREMENT_PROTOCOL.metricRegistry, 'packetInclusion'));
  assert.ok(Object.hasOwn(PILOT_MEASUREMENT_PROTOCOL.metricRegistry, 'attemptOutcomes'));
  assert.deepEqual(
    PILOT_MEASUREMENT_OPERATIONS.slice(
      PILOT_MEASUREMENT_OPERATIONS.indexOf('suspend'),
      PILOT_MEASUREMENT_OPERATIONS.indexOf('resume') + 1,
    ),
    ['suspend', 'record-incident', 'resume'],
  );

  // RECORD_SCHEMA is internal, so the incremented schema is pinned on persisted reservations and
  // records instead.
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await reserveAndFinish(fx, generationId);
  const target = join(generationRoot(fx, generationId), 'records', `${reservation.runId}.json`);
  assert.equal(readJsonFile(target).schema, 2);
  await executeOperation('finalize', finalizeInput(fx, generationId, reservation), fx.deps);
  const record = readJsonFile(target);
  assert.equal(record.schema, 2);
  assert.equal(record.packets[0].attempt, 'started');
});

test('activate needs no confirmation and reports exactly the unmet window and sample', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const input = activateInput(fx, generationId);
  const notReady = (unmet) => ({
    status: 'not-ready',
    generationId,
    generationState: 'baseline',
    unmet,
  });

  const before = snapshot(fx, generationId);
  const confirmed = await rejection('activate', { ...input, confirmation: true }, fx.deps);
  assert.equal(confirmed.error.code, 'INVALID_PAYLOAD');
  assert.deepEqual(snapshot(fx, generationId), before);

  assert.deepEqual(
    (await executeOperation('activate', input, fx.deps)).result,
    notReady(['window', 'sample']),
  );
  fx.clock.wallMs += 7 * DAY_MS - 1;
  assert.deepEqual(
    (await executeOperation('activate', input, fx.deps)).result,
    notReady(['window', 'sample']),
  );
  fx.clock.wallMs += 1;
  assert.deepEqual(
    (await executeOperation('activate', input, fx.deps)).result,
    notReady(['sample']),
  );

  // Only wouldBeFastEligible packets of completed baseline records count toward the sample.
  writeRecords(fx, generationId, [
    storedRecord(
      generationId,
      1,
      Array.from({ length: 19 }, (_, index) => storedPacket(1, index)).concat(
        storedPacket(1, 19, { eligible: false }),
      ),
    ),
    storedRecord(generationId, 2, [storedPacket(2, 0)], { completionStatus: 'failed' }),
  ]);
  assert.deepEqual(
    (await executeOperation('activate', input, fx.deps)).result,
    notReady(['sample']),
  );
  assert.deepEqual(snapshot(fx, generationId).length, before.length + 2);

  writeRecords(fx, generationId, [storedRecord(generationId, 3, [storedPacket(3, 0)])]);
  assert.deepEqual((await executeOperation('activate', input, fx.deps)).result, {
    status: 'activated',
    generationId,
    generationState: 'active',
  });
  const state = readState(fx, generationId);
  assert.equal(state.generationState, 'active');
  assert.equal(state.activatedAt, new Date(fx.clock.wallMs).toISOString());
  assert.equal((await rejection('activate', input, fx.deps)).error.code, 'INVALID_STATE');
});

test('activate reports busy alone while a reservation, packet timing, or observation is open', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const input = activateInput(fx, generationId);
  const busy = {
    status: 'not-ready',
    generationId,
    generationState: 'baseline',
    unmet: ['busy'],
  };
  writeRecords(fx, generationId, [
    storedRecord(
      generationId,
      1,
      Array.from({ length: 20 }, (_, index) => storedPacket(1, index)),
    ),
  ]);
  assert.deepEqual((await executeOperation('activate', input, fx.deps)).result.unmet, ['window']);

  // An open reservation is busy, and busy is never combined with window or sample.
  const reservation = await startWorkflow(fx, generationId);
  assert.deepEqual((await executeOperation('activate', input, fx.deps)).result, busy);
  await executeOperation('start-packet', packetIdentity(fx, generationId, reservation), fx.deps);
  assert.equal((await inventory(fx, generationId)).incompleteCounts.packetTimings, 1);
  assert.deepEqual((await executeOperation('activate', input, fx.deps)).result, busy);
  await executeOperation('finish-packet', packetIdentity(fx, generationId, reservation), fx.deps);
  await executeOperation('finalize', finalizeInput(fx, generationId, reservation), fx.deps);
  assert.deepEqual((await executeOperation('activate', input, fx.deps)).result.unmet, ['window']);

  fx.clock.wallMs += 7 * DAY_MS;
  const observation = (
    await executeOperation('start-gate-observation', gateInput(fx, generationId), fx.deps)
  ).result;
  assert.equal(observation.status, 'reserved');
  const before = snapshot(fx, generationId);
  assert.deepEqual((await executeOperation('activate', input, fx.deps)).result, busy);
  assert.deepEqual(snapshot(fx, generationId), before);
  await executeOperation(
    'finalize-gate-observation',
    finalizeGateInput(fx, generationId, observation),
    fx.deps,
  );
  assert.deepEqual((await executeOperation('activate', input, fx.deps)).result, {
    status: 'activated',
    generationId,
    generationState: 'active',
  });
});

test('activate keeps genuine evidence faults and closed admission as errors', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const input = activateInput(fx, generationId);
  // Invalid members and orphan temporaries are faults even while a run is open, never busy.
  await startWorkflow(fx, generationId);
  const temporary = orphanTemporary(fx, generationId);
  writeFileSync(temporary, 'x');
  assert.equal((await rejection('activate', input, fx.deps)).error.code, 'INCOMPLETE_EVIDENCE');
  rmSync(temporary);
  const invalid = join(generationRoot(fx, generationId), 'records', 'unknown.json');
  writeFileSync(invalid, '{}\n');
  assert.equal((await rejection('activate', input, fx.deps)).error.code, 'INCOMPLETE_EVIDENCE');
  rmSync(invalid);
  assert.deepEqual((await executeOperation('activate', input, fx.deps)).result.unmet, ['busy']);
  assert.equal(readSuspension(fx, generationId), null);

  writeMarker(fx, generationId, 'suspend');
  assert.equal((await rejection('activate', input, fx.deps)).error.code, 'INVALID_STATE');
});

test('record-incident maps every category to its critical outcome and preserves resumeTo', async (t) => {
  for (const [category, outcome] of INCIDENTS) {
    await t.test(category, async (t) => {
      const fx = fixture(t);
      const { generationId } = await beginBaseline(fx);
      writeState(fx, generationId, {
        generationState: 'active',
        activatedAt: new Date(fx.clock.wallMs).toISOString(),
      });
      const affectedRecordIds = [opaqueId(90, 2), opaqueId(90, 1)];
      const result = (
        await executeOperation(
          'record-incident',
          { ...fx.common, generationId, category, affectedRecordIds },
          fx.deps,
        )
      ).result;
      const suspension = readSuspension(fx, generationId);
      assert.deepEqual(result, {
        generationState: 'suspended',
        suspensionDigest: canonicalDigest(suspension),
        pilotControlOutcome: outcome,
        controlStatePersisted: true,
        alert: 'none',
      });
      assert.deepEqual(suspension, {
        schema: 1,
        kind: 'pilot-suspension',
        generationId,
        status: 'suspended',
        resumeTo: 'active',
        reasons: [outcome],
        affectedRecordIds: [opaqueId(90, 1), opaqueId(90, 2)],
      });
      assert.equal(readState(fx, generationId).generationState, 'suspended');
      assert.equal(existsSync(markerPath(fx, generationId)), false);

      // A re-suspension from suspended keeps the stored resume target.
      const [otherCategory, otherOutcome] = INCIDENTS.find(
        ([name]) => name === (category === 'scope' ? 'safety' : 'scope'),
      );
      const again = await executeOperation(
        'record-incident',
        { ...fx.common, generationId, category: otherCategory, affectedRecordIds: [] },
        fx.deps,
      );
      assert.equal(again.result.pilotControlOutcome, otherOutcome);
      const resuspended = readSuspension(fx, generationId);
      assert.equal(resuspended.resumeTo, 'active');
      assert.deepEqual(resuspended.reasons, [outcome, otherOutcome].sort());
      assert.deepEqual(resuspended.affectedRecordIds, suspension.affectedRecordIds);
    });
  }
});

test('record-incident rejects bad input, a held lock, and review without persisting anything', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const input = { ...fx.common, generationId, category: 'safety', affectedRecordIds: [] };
  const before = snapshot(fx, generationId);

  for (const [label, rejected, code] of [
    ['unknown category', { ...input, category: 'privacy' }, 'INVALID_PAYLOAD'],
    [
      'named outcome',
      { ...input, pilotControlOutcome: 'critical-safety-incident' },
      'INVALID_PAYLOAD',
    ],
    ['non-opaque record', { ...input, affectedRecordIds: ['short'] }, 'INVALID_PAYLOAD'],
    ['missing generation', { ...input, generationId: 'Z'.repeat(32) }, 'NOT_FOUND'],
  ]) {
    const envelope = await rejection('record-incident', rejected, fx.deps);
    assert.equal(envelope.error.code, code, label);
    assert.deepEqual(control(envelope), NEUTRAL, label);
    assert.deepEqual(snapshot(fx, generationId), before, label);
  }

  // A held lock stays a retryable LOCKED; no unlocked marker is written behind it.
  const release = holdLifecycleLock(fx, generationId);
  const locked = await rejection('record-incident', input, fx.deps);
  assert.equal(locked.error.code, 'LOCKED');
  assert.deepEqual(control(locked), NEUTRAL);
  assert.equal(existsSync(markerPath(fx, generationId)), false);
  release();
  assert.deepEqual(snapshot(fx, generationId), before);

  writeState(fx, generationId, {
    generationState: 'review',
    reviewStartedAt: new Date(fx.clock.wallMs).toISOString(),
  });
  const reviewSnapshot = snapshot(fx, generationId);
  const review = await rejection('record-incident', input, fx.deps);
  assert.equal(review.error.code, 'INVALID_STATE');
  assert.deepEqual(control(review), NEUTRAL);
  assert.deepEqual(snapshot(fx, generationId), reviewSnapshot);
});

test(
  'record-incident reports an unpersistable control state when its write fails',
  { skip: RUNS_AS_ROOT },
  async (t) => {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const root = generationRoot(fx, generationId);
    chmodSync(root, 0o500);
    t.after(() => existsSync(root) && chmodSync(root, 0o700));
    const failed = await rejection(
      'record-incident',
      { ...fx.common, generationId, category: 'safety', affectedRecordIds: [] },
      fx.deps,
    );
    chmodSync(root, 0o700);
    assert.equal(failed.error.code, 'WRITE_FAILED');
    assert.deepEqual(control(failed), ['control-state-unpersistable', false, 'value-free']);
    assert.equal(readSuspension(fx, generationId), null);
    assert.equal(existsSync(markerPath(fx, generationId)), false);
    assert.equal(readState(fx, generationId).generationState, 'baseline');
  },
);

test('suspend rejects every incident outcome and still records evidence-gap', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const before = snapshot(fx, generationId);
  for (const [, outcome] of INCIDENTS) {
    const envelope = await rejection(
      'suspend',
      { ...fx.common, generationId, pilotControlOutcome: outcome, affectedRecordIds: [] },
      fx.deps,
    );
    assert.equal(envelope.error.code, 'INVALID_PAYLOAD', outcome);
    assert.deepEqual(snapshot(fx, generationId), before, outcome);
  }
  const result = await executeOperation(
    'suspend',
    { ...fx.common, generationId, pilotControlOutcome: 'evidence-gap', affectedRecordIds: [] },
    fx.deps,
  );
  assert.deepEqual(result.result, {
    generationState: 'suspended',
    suspensionDigest: canonicalDigest(readSuspension(fx, generationId)),
    pilotControlOutcome: 'evidence-gap',
  });
  assert.deepEqual(readSuspension(fx, generationId).reasons, ['evidence-gap']);
});

test('leftover transition markers stay readable and the next control operation rolls them forward', async (t) => {
  assert.deepEqual([...SUSPENSION_REASONS].sort(), [
    'capacity-exhausted',
    'critical-authorization-incident',
    'critical-data-integrity-incident',
    'critical-safety-incident',
    'critical-scope-incident',
    'evidence-gap',
    'finalization-failed',
  ]);
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  // A run reserved before the crash still finalizes, so its fault path can meet a marker.
  const reservation = await startWorkflow(fx, generationId);

  // The allowlist is derived from the protocol mappings plus suspend and resume.
  for (const operation of [...SUSPENSION_REASONS, 'suspend']) {
    writeMarker(fx, generationId, operation);
    const pending = await inventory(fx, generationId);
    assert.equal(pending.generationState, 'baseline', operation);
    assert.equal(pending.transitionPending, true, operation);
    assert.deepEqual(
      (await executeOperation('start-gate-observation', gateInput(fx, generationId), fx.deps))
        .result,
      { status: 'not-recorded', reason: 'admission-closed', pilotControlOutcome: 'none' },
      operation,
    );
    rmSync(markerPath(fx, generationId));
  }
  writeMarker(fx, generationId, 'activate');
  assert.equal(
    (await rejection('inventory', { ...fx.common, generationId }, fx.deps)).error.code,
    'UNSAFE_STORAGE',
  );
  rmSync(markerPath(fx, generationId));
  assert.equal((await inventory(fx, generationId)).transitionPending, false);

  const expected = [];
  const rolledForward = async (label, marker, added) => {
    expected.push(marker, ...added);
    const suspension = readSuspension(fx, generationId);
    assert.deepEqual(suspension.reasons, [...new Set(expected)].sort(), label);
    assert.equal(suspension.resumeTo, 'baseline', label);
    assert.equal(readState(fx, generationId).generationState, 'suspended', label);
    assert.equal(existsSync(markerPath(fx, generationId)), false, label);
    assert.equal((await inventory(fx, generationId)).transitionPending, false, label);
  };

  // persistPilotControl, reached through a finalize fault (the packet never started).
  writeMarker(fx, generationId, 'critical-authorization-incident');
  const failed = await rejection('finalize', finalizeInput(fx, generationId, reservation), fx.deps);
  assert.equal(failed.error.code, 'NOT_FOUND');
  assert.deepEqual(control(failed), ['finalization-failed', true, 'none']);
  await rolledForward('finalize', 'critical-authorization-incident', ['finalization-failed']);

  writeMarker(fx, generationId, 'critical-safety-incident');
  await executeOperation(
    'suspend',
    { ...fx.common, generationId, pilotControlOutcome: 'evidence-gap', affectedRecordIds: [] },
    fx.deps,
  );
  await rolledForward('suspend', 'critical-safety-incident', ['evidence-gap']);

  writeMarker(fx, generationId, 'capacity-exhausted');
  await executeOperation(
    'record-incident',
    { ...fx.common, generationId, category: 'scope', affectedRecordIds: [] },
    fx.deps,
  );
  await rolledForward('record-incident', 'capacity-exhausted', ['critical-scope-incident']);

  // resume completes the marker before its own checks; the digests read before the roll-forward
  // are then stale, and the roll-forward stays persisted.
  const current = await inventory(fx, generationId);
  writeMarker(fx, generationId, 'critical-data-integrity-incident');
  const resumed = await rejection(
    'resume',
    {
      ...fx.common,
      generationId,
      configState: 'enabled',
      expectedSuspensionDigest: current.suspensionDigest,
      expectedInventoryDigest: current.inventoryDigest,
      confirmation: true,
    },
    fx.deps,
  );
  assert.equal(resumed.error.code, 'STALE_REVIEW');
  await rolledForward('resume', 'critical-data-integrity-incident', []);
});

test('finalization-failed and evidence-gap markers roll forward and a suspend marker completes', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  writeMarker(fx, generationId, 'finalization-failed');
  await executeOperation(
    'record-incident',
    { ...fx.common, generationId, category: 'safety', affectedRecordIds: [] },
    fx.deps,
  );
  assert.deepEqual(readSuspension(fx, generationId).reasons, [
    'critical-safety-incident',
    'finalization-failed',
  ]);
  writeMarker(fx, generationId, 'evidence-gap');
  await executeOperation(
    'record-incident',
    { ...fx.common, generationId, category: 'data-integrity', affectedRecordIds: [] },
    fx.deps,
  );
  assert.deepEqual(readSuspension(fx, generationId).reasons, [
    'critical-data-integrity-incident',
    'critical-safety-incident',
    'evidence-gap',
    'finalization-failed',
  ]);
  assert.equal((await inventory(fx, generationId)).transitionPending, false);

  // A leftover suspend marker keeps its own handling: the next suspend reuses and completes it.
  const other = fixture(t);
  const second = (await beginBaseline(other)).generationId;
  writeMarker(other, second, 'suspend');
  assert.equal((await inventory(other, second)).transitionPending, true);
  await executeOperation(
    'suspend',
    {
      ...other.common,
      generationId: second,
      pilotControlOutcome: 'evidence-gap',
      affectedRecordIds: [],
    },
    other.deps,
  );
  assert.deepEqual(readSuspension(other, second).reasons, ['evidence-gap']);
  assert.equal(existsSync(markerPath(other, second)), false);
  assert.equal((await inventory(other, second)).transitionPending, false);
});

test('the unlocked control fallback reports persisted only for a marker of the exact reason', async (t) => {
  // A suspension.json that is a directory makes every locked control write fail, so the fallback
  // runs after the finalize fault (the reserved packet never started).
  async function faultedFinalize(t, marker) {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const reservation = await startWorkflow(fx, generationId);
    mkdirSync(join(generationRoot(fx, generationId), 'suspension.json'));
    if (marker !== null) writeMarker(fx, generationId, marker);
    const envelope = await rejection(
      'finalize',
      finalizeInput(fx, generationId, reservation),
      fx.deps,
    );
    assert.equal(envelope.error.code, 'NOT_FOUND');
    return { envelope, marker: readJsonFile(markerPath(fx, generationId)) };
  }

  const fresh = await faultedFinalize(t, null);
  assert.deepEqual(control(fresh.envelope), ['finalization-failed', true, 'none']);
  assert.equal(fresh.marker.operation, 'finalization-failed');

  const exact = await faultedFinalize(t, 'finalization-failed');
  assert.deepEqual(control(exact.envelope), ['finalization-failed', true, 'none']);
  assert.equal(exact.marker.ownerNonce, 'M'.repeat(32));

  const different = await faultedFinalize(t, 'evidence-gap');
  assert.deepEqual(control(different.envelope), [
    'control-state-unpersistable',
    false,
    'value-free',
  ]);
  assert.equal(different.marker.operation, 'evidence-gap');
});

test('a locked marker write never replaces a marker the unlocked fallback published meanwhile', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const root = generationRoot(fx, generationId);
  const suspended = await executeOperation(
    'suspend',
    { ...fx.common, generationId, pilotControlOutcome: 'evidence-gap', affectedRecordIds: [] },
    fx.deps,
  );
  const before = await inventory(fx, generationId);
  // Once resume has staged its own marker (it read "no marker" before), a concurrent unlocked
  // fallback publishes a finalization-failed marker ahead of resume's publication.
  let injected = false;
  const racingDeps = {
    ...fx.deps,
    runner: (call) => {
      if (!injected && readdirSync(root).some((name) => name.startsWith('.tmp-resume-'))) {
        injected = true;
        writeMarker(fx, generationId, 'finalization-failed');
      }
      return fx.deps.runner(call);
    },
  };
  const resumed = await rejection(
    'resume',
    {
      ...fx.common,
      generationId,
      configState: 'enabled',
      expectedSuspensionDigest: suspended.result.suspensionDigest,
      expectedInventoryDigest: before.inventoryDigest,
      confirmation: true,
    },
    racingDeps,
  );
  assert.equal(injected, true);
  assert.equal(resumed.error.code, 'INVALID_STATE');
  assert.equal(readJsonFile(markerPath(fx, generationId)).operation, 'finalization-failed');
  assert.equal(readJsonFile(markerPath(fx, generationId)).ownerNonce, 'M'.repeat(32));
  assert.deepEqual(readSuspension(fx, generationId).reasons, ['evidence-gap']);
  assert.equal(readState(fx, generationId).generationState, 'suspended');
  assert.equal(
    readdirSync(root).some((name) => name.startsWith('.tmp-')),
    false,
  );
  assert.equal((await inventory(fx, generationId)).transitionPending, true);

  await executeOperation(
    'record-incident',
    { ...fx.common, generationId, category: 'scope', affectedRecordIds: [] },
    fx.deps,
  );
  assert.deepEqual(readSuspension(fx, generationId).reasons, [
    'critical-scope-incident',
    'evidence-gap',
    'finalization-failed',
  ]);
  assert.equal(existsSync(markerPath(fx, generationId)), false);
  assert.equal((await inventory(fx, generationId)).transitionPending, false);
});

test('a locked marker write adopts an identical marker published meanwhile and completes it', async (t) => {
  // Two writers suspending for the same reason race: the lock holder has staged its marker when
  // the other writer's identical fallback marker appears, so the holder completes that transition.
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const root = generationRoot(fx, generationId);
  let injected = false;
  const racingDeps = {
    ...fx.deps,
    runner: (call) => {
      if (!injected && readdirSync(root).some((name) => name.startsWith('.tmp-suspend-'))) {
        injected = true;
        writeMarker(fx, generationId, 'suspend');
      }
      return fx.deps.runner(call);
    },
  };
  const suspended = await executeOperation(
    'suspend',
    { ...fx.common, generationId, pilotControlOutcome: 'evidence-gap', affectedRecordIds: [] },
    racingDeps,
  );
  assert.equal(injected, true);
  assert.equal(suspended.result.generationState, 'suspended');
  assert.deepEqual(readSuspension(fx, generationId).reasons, ['evidence-gap']);
  assert.equal(readState(fx, generationId).generationState, 'suspended');
  assert.equal(existsSync(markerPath(fx, generationId)), false);
  assert.equal(
    readdirSync(root).some((name) => name.startsWith('.tmp-')),
    false,
  );
});

test('a locked control write adopts a same-reason fallback marker published meanwhile', async (t) => {
  // A finalize mid-write fault persists finalization-failed under the lock. While that write has
  // staged its marker, a concurrent writer's unlocked fallback publishes the same reason.
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const root = generationRoot(fx, generationId);
  const reservation = await startWorkflow(fx, generationId);
  const reason = 'finalization-failed';
  let injected = false;
  const racingDeps = {
    ...fx.deps,
    runner: (call) => {
      if (!injected && readdirSync(root).some((name) => name.startsWith(`.tmp-${reason}-`))) {
        injected = true;
        writeFileSync(
          markerPath(fx, generationId),
          `${canonicalizeJson({
            schema: 1,
            kind: 'suspension-transition',
            generationId,
            operation: reason,
            ownerNonce: 'P'.repeat(32),
            ownerPid: 2_147_483_647,
          })}\n`,
        );
      }
      return fx.deps.runner(call);
    },
  };
  const envelope = await rejection(
    'finalize',
    finalizeInput(fx, generationId, reservation),
    racingDeps,
  );
  assert.equal(injected, true);
  assert.equal(envelope.error.code, 'NOT_FOUND');
  assert.deepEqual(control(envelope), [reason, true, 'none']);
  const suspension = readSuspension(fx, generationId);
  assert.equal(suspension.reasons.filter((value) => value === reason).length, 1);
  assert.deepEqual(suspension.reasons, [reason]);
  assert.equal(readState(fx, generationId).generationState, 'suspended');
  assert.equal(existsSync(markerPath(fx, generationId)), false);
  assert.equal(
    readdirSync(root).some((name) => name.startsWith('.tmp-')),
    false,
  );
});

test('the unlocked fallback publishes its marker atomically and a staged marker is reconcilable', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const root = generationRoot(fx, generationId);
  const reservation = await startWorkflow(fx, generationId);
  // A suspension.json directory makes the locked control write fail, so the fallback runs.
  mkdirSync(join(root, 'suspension.json'));
  const envelope = await rejection(
    'finalize',
    finalizeInput(fx, generationId, reservation),
    fx.deps,
  );
  assert.deepEqual(control(envelope), ['finalization-failed', true, 'none']);
  const published = readJsonFile(markerPath(fx, generationId));
  assert.equal(published.operation, 'finalization-failed');
  assert.equal(published.ownerPid, process.pid);
  assert.equal(
    readdirSync(root).some((name) => name.startsWith('.tmp-')),
    false,
  );

  // A crash between staging and publication leaves only the staged temporary, which keeps the
  // inventory readable and is removed once its writer is proved stale.
  const other = fixture(t);
  const id = (await beginBaseline(other)).generationId;
  const ownerNonce = 'F'.repeat(32);
  const temporaryName = `.tmp-finalization-failed-${id}-${ownerNonce}-${'7'.repeat(16)}`;
  const contents = `${canonicalizeJson({
    schema: 1,
    kind: 'suspension-transition',
    generationId: id,
    operation: 'finalization-failed',
    ownerNonce,
    ownerPid: 2_147_483_647,
  })}\n`;
  const staged = join(generationRoot(other, id), temporaryName);
  writeFileSync(staged, contents);
  const listed = await inventory(other, id);
  assert.equal(listed.transitionPending, false);
  assert.deepEqual(
    listed.orphanTemporaries.map(({ directory, temporaryName: name }) => [directory, name]),
    [['root', temporaryName]],
  );
  const input = {
    ...other.common,
    generationId: id,
    temporaryName,
    ownerNonce,
    expectedDigest: listed.orphanTemporaries[0].digest,
    confirmation: true,
  };
  const live = await rejection('reconcile-temporary', input, { ...other.deps, kill: () => {} });
  assert.equal(live.error.code, 'LOCKED');
  assert.equal(existsSync(staged), true);
  const removed = await executeOperation('reconcile-temporary', input, {
    ...other.deps,
    kill: () => {
      const error = new Error('stale owner');
      error.code = 'ESRCH';
      throw error;
    },
  });
  assert.equal(removed.result.status, 'removed');
  assert.equal(existsSync(staged), false);

  // A locked marker write stages a reason-named temporary without a pid. Once its lock is gone,
  // the content cannot prove its writer stale, so reconcile fails closed as a storage mismatch.
  const locked = fixture(t);
  const lockedId = (await beginBaseline(locked)).generationId;
  const lockedNonce = 'L'.repeat(32);
  const lockedName = `.tmp-evidence-gap-${lockedId}-${lockedNonce}-${'8'.repeat(16)}`;
  const lockedContents = `${canonicalizeJson({
    schema: 1,
    kind: 'suspension-transition',
    generationId: lockedId,
    operation: 'evidence-gap',
    ownerNonce: lockedNonce,
  })}\n`;
  const lockedStaged = join(generationRoot(locked, lockedId), lockedName);
  writeFileSync(lockedStaged, lockedContents);
  const lockedListed = await inventory(locked, lockedId);
  const mismatch = await rejection(
    'reconcile-temporary',
    {
      ...locked.common,
      generationId: lockedId,
      temporaryName: lockedName,
      ownerNonce: lockedNonce,
      expectedDigest: lockedListed.orphanTemporaries[0].digest,
      confirmation: true,
    },
    {
      ...locked.deps,
      kill: () => {
        const error = new Error('stale owner');
        error.code = 'ESRCH';
        throw error;
      },
    },
  );
  assert.equal(mismatch.error.code, 'UNSAFE_STORAGE');
  assert.equal(readFileSync(lockedStaged, 'utf8'), lockedContents);
});

test('the capacity walk skips entries that vanish mid-walk and maps every other fs fault', async (t) => {
  // A concurrent packet writer publishes its temporary (link, then unlink) between another
  // writer's directory listing and its lstat. The injected fs calls reproduce that window.
  async function plant(t) {
    const fx = fixture(t);
    const { generationId } = await beginBaseline(fx);
    const reservation = await startWorkflow(fx, generationId);
    const root = generationRoot(fx, generationId);
    const file = join(
      root,
      'records',
      `.tmp-start-packet-${generationId}-${'V'.repeat(32)}-${'9'.repeat(16)}`,
    );
    writeFileSync(file, 'published by a concurrent writer\n');
    const directory = join(root, 'summaries', 'vanishing');
    mkdirSync(directory);
    writeFileSync(join(directory, 'member'), 'removed with its directory\n');
    // The helper walks the realpath of the runtime root, so match by the root-relative suffix.
    const matches = (target, planted) => target.endsWith(relative(fx.root, planted));
    return { fx, generationId, reservation, root, file, directory, matches };
  }

  await t.test('vanished file and directory', async (t) => {
    const { fx, generationId, reservation, root, file, directory, matches } = await plant(t);
    const seen = { file: false, directory: false };
    const racingDeps = {
      ...fx.deps,
      lstat: async (target, ...rest) => {
        if (matches(target, file) && existsSync(target)) {
          seen.file = true;
          rmSync(target);
        }
        return lstat(target, ...rest);
      },
      readdir: async (target, ...rest) => {
        if (matches(target, directory) && existsSync(target)) {
          seen.directory = true;
          rmSync(target, { recursive: true });
        }
        return readdir(target, ...rest);
      },
    };
    const started = await executeOperation(
      'start-packet',
      packetIdentity(fx, generationId, reservation),
      racingDeps,
    );
    assert.equal(started.result.status, 'started');
    assert.deepEqual(seen, { file: true, directory: true });
    const records = readdirSync(join(root, 'records'));
    assert.equal(
      records.includes(`${reservation.runId}.${reservation.packets[0].packetId}.timing.json`),
      true,
    );
    assert.equal(
      records.some((name) => name.startsWith('.tmp-')),
      false,
    );
  });

  await t.test('unexpected fs fault', async (t) => {
    const { fx, generationId, reservation, root, file, matches } = await plant(t);
    const faultingDeps = {
      ...fx.deps,
      lstat: async (target, ...rest) => {
        if (matches(target, file)) {
          const error = new Error('permission denied');
          error.code = 'EACCES';
          throw error;
        }
        return lstat(target, ...rest);
      },
    };
    const failed = await rejection(
      'start-packet',
      packetIdentity(fx, generationId, reservation),
      faultingDeps,
    );
    assert.equal(failed.error.code, 'UNSAFE_STORAGE');
    // The staged receipt temporary is removed; only the planted entry remains.
    assert.deepEqual(
      readdirSync(join(root, 'records')).filter((name) => name.startsWith('.tmp-')),
      [relative(join(root, 'records'), file)],
    );
    assert.equal(
      readdirSync(join(root, 'records')).some((name) => name.endsWith('.timing.json')),
      false,
    );
  });
});

test('finalize never suspends on caller errors, contention, location faults, or missing targets', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await reserveAndFinish(fx, generationId);
  const valid = finalizeInput(fx, generationId, reservation);
  const memory = join(fx.root, '.effective-flow', 'memory.json');
  const before = snapshot(fx, generationId);

  for (const [label, input, code, arrange = () => () => {}] of [
    [
      'abandoned is not a caller status',
      { ...valid, completionStatus: 'abandoned' },
      'INVALID_PAYLOAD',
    ],
    [
      'quality fallback',
      finalizeInput(fx, generationId, reservation, {}, [
        { fallback: 'spawn-rejected', escalated: true },
      ]),
      'INVALID_PAYLOAD',
    ],
    [
      'workflow capability',
      { ...valid, workflowCapability: reservation.packets[0].packetCapability },
      'AUTHENTICATION_FAILED',
    ],
    ['lock contention', valid, 'LOCKED', () => holdLifecycleLock(fx, generationId)],
    ['missing generation', { ...valid, generationId: 'Z'.repeat(32) }, 'NOT_FOUND'],
    ['missing record', { ...valid, runId: opaqueId(77, 1) }, 'NOT_FOUND'],
    ['repository identity', { ...valid, repositoryIdentity: fx.root }, 'UNSAFE_RUNTIME_ROOT'],
    [
      'runtime migration',
      valid,
      'MIGRATION_REQUIRED',
      () => {
        const saved = readFileSync(memory);
        writeFileSync(memory, '{}\n');
        return () => writeFileSync(memory, saved);
      },
    ],
  ]) {
    const restore = arrange();
    const envelope = await rejection('finalize', input, fx.deps);
    restore();
    assert.equal(envelope.error.code, code, label);
    assert.deepEqual(control(envelope), NEUTRAL, label);
    assert.deepEqual(snapshot(fx, generationId), before, label);
  }

  // Every neutral failure stays retryable.
  assert.deepEqual((await executeOperation('finalize', valid, fx.deps)).result, {
    status: 'finalized',
    runId: reservation.runId,
    packetCount: 1,
  });
  assert.equal(readState(fx, generationId).generationState, 'baseline');
  assert.equal(readSuspension(fx, generationId), null);
});

test('a mid-write finalize fault persists finalization-failed and the retry keeps the suspension', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  // A completed run whose packet has no receipt is a receipt-tagged NOT_FOUND fault.
  const reservation = await startWorkflow(fx, generationId);
  const input = finalizeInput(fx, generationId, reservation);
  const failed = await rejection('finalize', input, fx.deps);
  assert.deepEqual(failed.error, {
    code: 'NOT_FOUND',
    message: 'pilot measurement target does not exist',
    exitCode: 10,
  });
  assert.deepEqual(control(failed), ['finalization-failed', true, 'none']);
  const suspension = readSuspension(fx, generationId);
  assert.deepEqual(suspension.reasons, ['finalization-failed']);
  assert.deepEqual(suspension.affectedRecordIds, [reservation.runId]);
  assert.equal(suspension.resumeTo, 'baseline');
  assert.equal(readState(fx, generationId).generationState, 'suspended');
  const target = join(generationRoot(fx, generationId), 'records', `${reservation.runId}.json`);
  assert.equal(readJsonFile(target).kind, 'workflow-reservation');

  await timePacket(fx, generationId, reservation);
  assert.equal((await executeOperation('finalize', input, fx.deps)).result.status, 'finalized');
  assert.equal(readJsonFile(target).kind, 'workflow-record');
  assert.equal(readState(fx, generationId).generationState, 'suspended');
  assert.deepEqual(readSuspension(fx, generationId), suspension);

  // Storage and write faults take the same path.
  for (const [label, code, arrange] of [
    [
      'unsafe record entry',
      'UNSAFE_STORAGE',
      (other, id, run) => {
        const record = join(generationRoot(other, id), 'records', `${run.runId}.json`);
        renameSync(record, join(other.root, 'moved.json'));
        symlinkSync(join(other.root, 'moved.json'), record);
        return () => {};
      },
    ],
    [
      'record write',
      'WRITE_FAILED',
      (other, id) => {
        const records = join(generationRoot(other, id), 'records');
        chmodSync(records, 0o500);
        return () => existsSync(records) && chmodSync(records, 0o700);
      },
    ],
  ]) {
    await t.test(label, { skip: code === 'WRITE_FAILED' && RUNS_AS_ROOT }, async (t) => {
      const other = fixture(t);
      const id = (await beginBaseline(other)).generationId;
      const run = await reserveAndFinish(other, id);
      const restore = arrange(other, id, run);
      t.after(restore);
      const envelope = await rejection('finalize', finalizeInput(other, id, run), other.deps);
      restore();
      assert.equal(envelope.error.code, code);
      assert.deepEqual(control(envelope), ['finalization-failed', true, 'none']);
      assert.deepEqual(readSuspension(other, id).reasons, ['finalization-failed']);
      assert.deepEqual(readSuspension(other, id).affectedRecordIds, [run.runId]);
    });
  }
});

test('finalize capacity exhaustion suspends exactly once through the capacity handler', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await reserveAndFinish(fx, generationId);
  const generation = generationRoot(fx, generationId);
  const padding = join(generation, 'summaries', 'capacity-padding');
  writeFileSync(padding, '');
  truncateSync(
    padding,
    PILOT_MEASUREMENT_PROTOCOL.limits.maxRawGenerationBytes - treeBytes(generation),
  );
  const envelope = await rejection(
    'finalize',
    finalizeInput(fx, generationId, reservation),
    fx.deps,
  );
  assert.equal(envelope.error.code, 'CAPACITY_EXHAUSTED');
  assert.deepEqual(control(envelope), ['capacity-exhausted', true, 'none']);
  // Not finalization-failed, and no affected run: the finalize wrapper passed it through.
  const suspension = readSuspension(fx, generationId);
  assert.deepEqual(suspension.reasons, ['capacity-exhausted']);
  assert.deepEqual(suspension.affectedRecordIds, []);
  assert.equal(
    readJsonFile(join(generation, 'records', `${reservation.runId}.json`)).kind,
    'workflow-reservation',
  );
});

test('an aborted run rejects a caller outcome for a packet that never started', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  writeState(fx, generationId, {
    generationState: 'active',
    activatedAt: new Date(fx.clock.wallMs).toISOString(),
  });
  const reservation = await startWorkflow(fx, generationId, [
    packetReservation('fast'),
    packetReservation('fast'),
  ]);
  await executeOperation(
    'start-packet',
    packetIdentity(fx, generationId, reservation, reservation.packets[1]),
    fx.deps,
  );
  const before = snapshot(fx, generationId);
  for (const [label, packet] of [
    ['fallback', { fallback: 'spawn-rejected', escalated: true, costProxy: null }],
    ['cost', { costProxy: { kind: 'executor-unit', unit: 'microcredit', value: '1' } }],
  ]) {
    const envelope = await rejection(
      'finalize',
      finalizeInput(fx, generationId, reservation, { completionStatus: 'aborted' }, [
        packet,
        { costProxy: null },
      ]),
      fx.deps,
    );
    assert.equal(envelope.error.code, 'INVALID_PAYLOAD', label);
    assert.deepEqual(control(envelope), NEUTRAL, label);
    assert.deepEqual(snapshot(fx, generationId), before, label);
  }

  // The same outcome is legal on the packet that did start.
  await executeOperation(
    'finalize',
    finalizeInput(fx, generationId, reservation, { completionStatus: 'aborted' }, [
      { costProxy: null },
      { fallback: 'spawn-rejected', escalated: true, costProxy: null },
    ]),
    fx.deps,
  );
  const record = readJsonFile(
    join(generationRoot(fx, generationId), 'records', `${reservation.runId}.json`),
  );
  assert.deepEqual(
    record.packets.map(({ attempt, implementationDuration, fallback, escalated, costProxy }) => ({
      attempt,
      implementationDuration,
      fallback,
      escalated,
      costProxy,
    })),
    [
      {
        attempt: 'not-started',
        implementationDuration: { status: 'unavailable' },
        fallback: 'none',
        escalated: false,
        costProxy: { status: 'unavailable' },
      },
      {
        attempt: 'started',
        implementationDuration: { status: 'unavailable' },
        fallback: 'spawn-rejected',
        escalated: true,
        costProxy: { status: 'unavailable' },
      },
    ],
  );
  assert.equal(readSuspension(fx, generationId), null);
  assert.equal((await inventory(fx, generationId)).incompleteCounts.packetTimings, 0);
});

test('reconcile-record records every packet of an abandoned run as unknown', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await startWorkflow(fx, generationId, [
    packetReservation(),
    packetReservation(),
  ]);
  await executeOperation(
    'start-packet',
    packetIdentity(fx, generationId, reservation, reservation.packets[1]),
    fx.deps,
  );
  const current = await inventory(fx, generationId);
  assert.deepEqual(
    (
      await executeOperation(
        'reconcile-record',
        {
          ...fx.common,
          generationId,
          runId: reservation.runId,
          workflowCapability: reservation.workflowCapability,
          expectedInventoryDigest: current.inventoryDigest,
          confirmation: true,
        },
        fx.deps,
      )
    ).result,
    { status: 'abandoned', runId: reservation.runId },
  );
  const record = readJsonFile(
    join(generationRoot(fx, generationId), 'records', `${reservation.runId}.json`),
  );
  assert.equal(record.completionStatus, 'abandoned');
  assert.deepEqual(
    record.packets.map(({ attempt, implementationDuration, costProxy }) => ({
      attempt,
      implementationDuration,
      costProxy,
    })),
    Array.from({ length: 2 }, () => ({
      attempt: 'unknown',
      implementationDuration: { status: 'unavailable' },
      costProxy: { status: 'unavailable' },
    })),
  );
  assert.deepEqual((await inventory(fx, generationId)).incompleteCounts, {
    workflowRecords: 0,
    packetTimings: 0,
    gateObservations: 0,
    temporaries: 0,
  });
});

test('the stored-packet validator enforces attempt invariants per completion status', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await finalizeOne(fx, generationId);
  const target = join(generationRoot(fx, generationId), 'records', `${reservation.runId}.json`);
  const original = readFileSync(target, 'utf8');
  const record = JSON.parse(original);
  const packet = record.packets[0];
  const unstarted = {
    ...packet,
    implementationDuration: { status: 'unavailable' },
    costProxy: { status: 'unavailable' },
  };
  const variant = (completionStatus, packetValue) => ({
    ...record,
    completionStatus,
    packets: [packetValue],
  });
  const withoutAttempt = { ...packet };
  delete withoutAttempt.attempt;

  for (const [label, value, valid] of [
    ['completed started', variant('completed', packet), true],
    ['failed started', variant('failed', packet), true],
    ['aborted started', variant('aborted', packet), true],
    ['aborted not-started', variant('aborted', { ...unstarted, attempt: 'not-started' }), true],
    ['failed not-started', variant('failed', { ...unstarted, attempt: 'not-started' }), true],
    ['abandoned unknown', variant('abandoned', { ...unstarted, attempt: 'unknown' }), true],
    ['missing attempt', variant('completed', withoutAttempt), false],
    ['unknown attempt value', variant('completed', { ...packet, attempt: 'skipped' }), false],
    [
      'completed not-started',
      variant('completed', { ...unstarted, attempt: 'not-started' }),
      false,
    ],
    ['completed unknown', variant('completed', { ...unstarted, attempt: 'unknown' }), false],
    ['aborted unknown', variant('aborted', { ...unstarted, attempt: 'unknown' }), false],
    ['abandoned started', variant('abandoned', packet), false],
    [
      'abandoned not-started',
      variant('abandoned', { ...unstarted, attempt: 'not-started' }),
      false,
    ],
    [
      'not-started with duration',
      variant('aborted', {
        ...unstarted,
        attempt: 'not-started',
        implementationDuration: packet.implementationDuration,
      }),
      false,
    ],
    [
      'not-started with cost',
      variant('aborted', { ...unstarted, attempt: 'not-started', costProxy: packet.costProxy }),
      false,
    ],
    [
      'unknown with duration',
      variant('abandoned', {
        ...unstarted,
        attempt: 'unknown',
        implementationDuration: packet.implementationDuration,
      }),
      false,
    ],
  ]) {
    writeFileSync(target, `${canonicalizeJson(value)}\n`);
    if (valid) {
      assert.equal((await inventory(fx, generationId)).generationStatus, 'present', label);
    } else {
      const envelope = await rejection('inventory', { ...fx.common, generationId }, fx.deps);
      assert.equal(envelope.error.code, 'INCOMPLETE_EVIDENCE', label);
    }
  }
  writeFileSync(target, original);
});

test('cohort metrics exclude not-started packets and never count unknown pilot-Fast as success', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const fast = { selectedProfile: 'fast' };
  const unstarted = { duration: null, cost: null };
  writeRecords(
    fx,
    generationId,
    [
      storedRecord(generationId, 1, [storedPacket(1, 0)]),
      storedRecord(
        generationId,
        2,
        [storedPacket(2, 0, { ...unstarted, attempt: 'not-started' })],
        {
          completionStatus: 'aborted',
        },
      ),
      storedRecord(generationId, 3, [storedPacket(3, 0, { ...unstarted, attempt: 'unknown' })], {
        completionStatus: 'abandoned',
      }),
      storedRecord(generationId, 4, [storedPacket(4, 0, { ...fast, duration: 100, cost: '10' })], {
        cohort: 'pilot',
      }),
      storedRecord(
        generationId,
        5,
        [storedPacket(5, 0, { ...fast, duration: 300, cost: '30', fallback: 'spawn-rejected' })],
        { cohort: 'pilot', completionStatus: 'failed' },
      ),
      storedRecord(
        generationId,
        6,
        [storedPacket(6, 0, { ...fast, ...unstarted, attempt: 'not-started' })],
        { cohort: 'pilot', completionStatus: 'aborted' },
      ),
      storedRecord(
        generationId,
        7,
        [storedPacket(7, 0, { ...fast, ...unstarted, attempt: 'unknown' })],
        { cohort: 'pilot', completionStatus: 'abandoned' },
      ),
      storedRecord(
        generationId,
        8,
        [storedPacket(8, 0, { eligible: false, ...unstarted, attempt: 'not-started' })],
        { cohort: 'pilot', completionStatus: 'aborted' },
      ),
      storedRecord(generationId, 9, [storedPacket(9, 0, { eligible: false, ...unstarted })], {
        cohort: 'pilot',
        completionStatus: 'failed',
      }),
    ],
    {
      generationState: 'review',
      activatedAt: new Date(fx.clock.wallMs).toISOString(),
      reviewStartedAt: new Date(fx.clock.wallMs).toISOString(),
    },
  );
  const current = await inventory(fx, generationId);
  await executeOperation(
    'aggregate',
    { ...fx.common, generationId, expectedInventoryDigest: current.inventoryDigest },
    fx.deps,
  );
  const summaries = join(generationRoot(fx, generationId), 'summaries');
  const privateView = readJsonFile(join(summaries, 'private.json'));
  const publication = readJsonFile(join(summaries, 'publication.json'));
  assert.equal(privateView.algorithmVersion, 2);
  const fallbackOutcomes = (counts) =>
    Object.fromEntries(
      PILOT_MEASUREMENT_POLICY_PROJECTION.fallbacks.map((fallback) => [
        fallback,
        counts[fallback] ?? 0,
      ]),
    );

  const { baseline, pilot } = privateView.cohorts;
  const pick = (metrics) => ({
    attemptOutcomes: metrics.attemptOutcomes,
    packetCount: metrics.packetCount,
    eligiblePacketCount: metrics.eligiblePacketCount,
    attemptedFastCount: metrics.attemptedFastCount,
    fastWithoutEscalation: metrics.fastWithoutEscalation,
    fallbackOccurrences: metrics.fallbackOccurrences,
    fallbackOutcomes: metrics.fallbackOutcomes,
    durationContributorCount: metrics.durationContributorCount,
    durationOutcomes: metrics.durationOutcomes,
    durationMedianMs: metrics.durationMedianMs,
    costGroups: metrics.costGroups,
    costUnavailableCount: metrics.costUnavailableCount,
  });
  // Baseline: record 2 (not-started) leaves every packet field; record 3 (unknown) counts in the
  // packet, eligibility, and cost-unavailable counts but not in duration or cost groups.
  assert.deepEqual(pick(baseline), {
    attemptOutcomes: { started: 1, 'not-started': 1, unknown: 1 },
    packetCount: 2,
    eligiblePacketCount: 2,
    attemptedFastCount: 0,
    fastWithoutEscalation: null,
    fallbackOccurrences: 0,
    fallbackOutcomes: fallbackOutcomes({ none: 2 }),
    durationContributorCount: 1,
    durationOutcomes: { available: 1, unavailable: 0 },
    durationMedianMs: { numerator: '100', denominator: '1' },
    costGroups: {
      'executor-unit:microcredit': { count: 1, median: { numerator: '10', denominator: '1' } },
    },
    costUnavailableCount: 1,
  });
  // Pilot: the unknown Fast packet (record 7) is attempted Fast but never a success, so the rate
  // is 1/3 rather than 2/3; the not-started Fast packet (record 6) and the not-started Quality
  // packet (record 8) are excluded everywhere; record 9 is a started packet without a duration.
  assert.deepEqual(pick(pilot), {
    attemptOutcomes: { started: 3, 'not-started': 2, unknown: 1 },
    packetCount: 4,
    eligiblePacketCount: 3,
    attemptedFastCount: 3,
    fastWithoutEscalation: { numerator: '1', denominator: '3' },
    fallbackOccurrences: 1,
    fallbackOutcomes: fallbackOutcomes({ none: 3, 'spawn-rejected': 1 }),
    durationContributorCount: 2,
    durationOutcomes: { available: 2, unavailable: 1 },
    durationMedianMs: { numerator: '200', denominator: '1' },
    costGroups: {
      'executor-unit:microcredit': { count: 2, median: { numerator: '20', denominator: '1' } },
    },
    costUnavailableCount: 1,
  });

  // attemptOutcomes stays in the private decision view only.
  assert.equal(publication.cohorts.pilot.suppressed, false);
  assert.doesNotMatch(JSON.stringify(publication), /attemptOutcomes/);
});

test('start-gate-observation records nothing when admission is closed', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const closed = {
    status: 'not-recorded',
    reason: 'admission-closed',
    pilotControlOutcome: 'none',
  };
  const before = snapshot(fx, generationId);
  assert.deepEqual(
    (
      await executeOperation(
        'start-gate-observation',
        gateInput(fx, generationId, 'active'),
        fx.deps,
      )
    ).result,
    closed,
  );
  assert.deepEqual(snapshot(fx, generationId), before);

  // A marker is only visible under the lock, as after a concurrent activation or suspension.
  writeMarker(fx, generationId, 'evidence-gap');
  const marked = snapshot(fx, generationId);
  assert.deepEqual(
    (await executeOperation('start-gate-observation', gateInput(fx, generationId), fx.deps)).result,
    closed,
  );
  assert.deepEqual(snapshot(fx, generationId), marked);
  assert.equal(readSuspension(fx, generationId), null);
});

test('start-gate-observation reports busy without persisting and finalize under a lock never suspends', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const busy = { status: 'not-recorded', reason: 'busy', pilotControlOutcome: 'none' };
  const startObservation = () =>
    executeOperation('start-gate-observation', gateInput(fx, generationId), fx.deps);
  const assertBusy = async (label) => {
    const before = snapshot(fx, generationId);
    assert.deepEqual((await startObservation()).result, busy, label);
    assert.deepEqual(snapshot(fx, generationId), before, label);
  };

  const release = holdLifecycleLock(fx, generationId);
  await assertBusy('held lock');
  release();
  const reservation = await startWorkflow(fx, generationId);
  await assertBusy('open reservation');
  await executeOperation('start-packet', packetIdentity(fx, generationId, reservation), fx.deps);
  await assertBusy('open packet timing');
  await executeOperation('finish-packet', packetIdentity(fx, generationId, reservation), fx.deps);
  await executeOperation('finalize', finalizeInput(fx, generationId, reservation), fx.deps);
  const observation = (await startObservation()).result;
  assert.equal(observation.status, 'reserved');
  await assertBusy('open observation');

  const finalizeObservation = finalizeGateInput(fx, generationId, observation);
  const unlock = holdLifecycleLock(fx, generationId);
  const before = snapshot(fx, generationId);
  for (const [label, input, code] of [
    ['lock contention', finalizeObservation, 'LOCKED'],
    [
      'capability',
      { ...finalizeObservation, capability: reservation.workflowCapability },
      'AUTHENTICATION_FAILED',
    ],
    ['payload', { ...finalizeObservation, terminalOutcome: 'unknown-outcome' }, 'INVALID_PAYLOAD'],
    ['missing generation', { ...finalizeObservation, generationId: 'Z'.repeat(32) }, 'NOT_FOUND'],
  ]) {
    if (label === 'capability') unlock();
    const envelope = await rejection('finalize-gate-observation', input, fx.deps);
    assert.equal(envelope.error.code, code, label);
    assert.deepEqual(control(envelope), NEUTRAL, label);
    assert.equal(readSuspension(fx, generationId), null, label);
    assert.equal(existsSync(markerPath(fx, generationId)), false, label);
  }
  assert.deepEqual(
    snapshot(fx, generationId).filter(([name]) => !name.startsWith('locks')),
    before.filter(([name]) => !name.startsWith('locks')),
  );
  assert.equal(
    (await executeOperation('finalize-gate-observation', finalizeObservation, fx.deps)).result
      .status,
    'finalized',
  );
  assert.equal((await startObservation()).result.status, 'reserved');
});

test('invalid members and orphan temporaries still suspend a gate observation with evidence-gap', async (t) => {
  for (const [label, arrange] of [
    [
      'invalid member beside an open run',
      async (fx, generationId) => {
        await startWorkflow(fx, generationId);
        writeFileSync(join(generationRoot(fx, generationId), 'records', 'unknown.json'), '{}\n');
      },
    ],
    [
      'orphan temporary',
      async (fx, generationId) => writeFileSync(orphanTemporary(fx, generationId), 'x'),
    ],
  ]) {
    await t.test(label, async (t) => {
      const fx = fixture(t);
      const { generationId } = await beginBaseline(fx);
      await arrange(fx, generationId);
      const envelope = await rejection(
        'start-gate-observation',
        gateInput(fx, generationId),
        fx.deps,
      );
      assert.equal(envelope.error.code, 'INCOMPLETE_EVIDENCE');
      assert.deepEqual(control(envelope), ['evidence-gap', true, 'none']);
      assert.deepEqual(readSuspension(fx, generationId).reasons, ['evidence-gap']);
      assert.equal(readState(fx, generationId).generationState, 'suspended');
      assert.deepEqual(
        readdirSync(join(generationRoot(fx, generationId), 'gate-observations')),
        [],
      );
    });
  }
});
