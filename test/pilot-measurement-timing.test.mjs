import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import { executeOperation } from '../src/scripts/pilot-measurement-core.mjs';
import {
  PILOT_MEASUREMENT_PROTOCOL,
  PILOT_MEASUREMENT_PROTOCOL_DIGEST,
  PILOT_MEASUREMENT_PROTOCOL_VERSION,
} from '../src/scripts/pilot-measurement-protocol.mjs';

const CORE_URL = pathToFileURL(resolve('src/scripts/pilot-measurement-core.mjs')).href;
const PROCESS_PROBE = `
  import { spawnSync } from 'node:child_process';
  import { readFileSync } from 'node:fs';
  import { executeOperation, errorEnvelope } from ${JSON.stringify(CORE_URL)};
  const request = JSON.parse(readFileSync(0, 'utf8'));
  const runner = async ({ executable, args, cwd }) => spawnSync(executable, args, { cwd, encoding: null });
  const deps = {
    runner,
    nowMs: () => request.clock.wallMs,
    uptimeSeconds: () => request.clock.uptimeSeconds,
    monotonicNs: () => BigInt(request.clock.monotonicNs),
    hostname: () => request.clock.hostname,
  };
  try {
    process.stdout.write(JSON.stringify(await executeOperation(request.operation, request.input, deps)));
  } catch (error) {
    process.stdout.write(JSON.stringify(errorEnvelope(request.operation, error)));
  }
`;

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

async function realRunner({ executable, args, cwd }) {
  return spawnSync(executable, args, { cwd, encoding: null });
}

function repository(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-pilot-timing-')));
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

async function workflowFixture(t, packetCount = 1) {
  const receipt = repository(t);
  const baseline = await executeOperation(
    'begin-baseline',
    {
      runtimeStateRoot: receipt.root,
      repositoryIdentity: receipt.repositoryIdentity,
      configState: 'enabled',
      fastEnabled: true,
      protocolVersion: PILOT_MEASUREMENT_PROTOCOL_VERSION,
      protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
      confirmation: true,
    },
    { runner: realRunner },
  );
  const generationId = baseline.result.generationId;
  const started = await executeOperation(
    'start',
    {
      runtimeStateRoot: receipt.root,
      repositoryIdentity: receipt.repositoryIdentity,
      generationId,
      configState: 'enabled',
      workflow: 'build',
      harnessFamily: 'codex',
      installKind: 'native',
      packets: Array.from({ length: packetCount }, () => ({
        selectedProfile: 'quality',
        wouldBeFastEligible: true,
        gate: { eligibility: 'eligible', firstReason: null },
      })),
    },
    { runner: realRunner },
  );
  return { ...receipt, generationId, ...started.result };
}

function timingInput(fixture, packet, overrides = {}) {
  return {
    runtimeStateRoot: fixture.root,
    repositoryIdentity: fixture.repositoryIdentity,
    generationId: fixture.generationId,
    runId: fixture.runId,
    packetId: packet.packetId,
    workflowCapability: fixture.workflowCapability,
    packetCapability: packet.packetCapability,
    ...overrides,
  };
}

function clock(wallMs, uptimeSeconds, monotonicNs, hostname = 'pilot-host') {
  return { wallMs, uptimeSeconds, monotonicNs: String(monotonicNs), hostname };
}

function processOperation(operation, input, currentClock) {
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', PROCESS_PROBE], {
    cwd: resolve('.'),
    encoding: 'utf8',
    input: JSON.stringify({ operation, input, clock: currentClock }),
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  assert.equal(child.stderr, '');
  return JSON.parse(child.stdout);
}

function finishWorkflowInput(fixture, packet) {
  return {
    runtimeStateRoot: fixture.root,
    repositoryIdentity: fixture.repositoryIdentity,
    generationId: fixture.generationId,
    runId: fixture.runId,
    workflowCapability: fixture.workflowCapability,
    packets: [
      {
        packetId: packet.packetId,
        packetCapability: packet.packetCapability,
        fallback: 'none',
        escalated: false,
        costProxy: null,
      },
    ],
    validation: { status: 'passed', requiredCount: 1, totalCount: 1, satisfiedCount: 1 },
    review: {
      status: 'completed',
      severityCounts: { critical: 0, important: 0, note: 0 },
    },
    completionStatus: 'completed',
    qualityCorrectionRounds: 0,
    detailOptIn: false,
    trace: null,
  };
}

function controlledDeps(currentClock, runner = realRunner) {
  return {
    runner,
    nowMs: () => currentClock.wallMs,
    uptimeSeconds: () => currentClock.uptimeSeconds,
    monotonicNs: () => BigInt(currentClock.monotonicNs),
    hostname: () => currentClock.hostname,
  };
}

function treeBytes(root) {
  return readdirSync(root, { withFileTypes: true }).reduce((total, entry) => {
    const target = join(root, entry.name);
    return total + (entry.isDirectory() ? treeBytes(target) : statSync(target).size);
  }, 0);
}

test('packet timing is capability-bound and parallel packets keep independent receipts', async (t) => {
  const fixture = await workflowFixture(t, 2);
  const [first, second] = fixture.packets;

  await assert.rejects(
    executeOperation(
      'start-packet',
      timingInput(fixture, second, { packetCapability: first.packetCapability }),
      controlledDeps(clock(1_000_000, 500, 10_000_000_000n)),
    ),
    (error) => error.code === 'AUTHENTICATION_FAILED',
  );

  let reached = 0;
  let release;
  const gate = new Promise((resolveGate) => {
    release = resolveGate;
  });
  function synchronizedRunner() {
    let namespaceChecks = 0;
    return async (call) => {
      const result = await realRunner(call);
      if (call.args.at(-1) === '.effective-flow/model-tiering-pilot' && ++namespaceChecks === 2) {
        reached += 1;
        if (reached === 2) release();
        await gate;
      }
      return result;
    };
  }

  const starts = await Promise.allSettled([
    executeOperation(
      'start-packet',
      timingInput(fixture, first),
      controlledDeps(clock(1_000_000, 500, 10_000_000_000n), synchronizedRunner()),
    ),
    executeOperation(
      'start-packet',
      timingInput(fixture, second),
      controlledDeps(clock(1_000_000, 500, 10_000_000_000n), synchronizedRunner()),
    ),
  ]);
  assert.deepEqual(
    starts.map((result) => result.status),
    ['fulfilled', 'fulfilled'],
    `parallel packet starts must not contend on a generation-wide lock: ${starts
      .map((result) => (result.status === 'rejected' ? result.reason?.code : 'ok'))
      .join(', ')}`,
  );

  const timingFiles = readdirSync(
    join(
      fixture.root,
      '.effective-flow',
      'model-tiering-pilot',
      'generations',
      fixture.generationId,
      'records',
    ),
  ).filter((name) => name.endsWith('.timing.json'));
  assert.equal(timingFiles.length, 2);
});

test('a timing receipt remains continuous across separate processes', async (t) => {
  const fixture = await workflowFixture(t);
  const packet = fixture.packets[0];
  const started = processOperation(
    'start-packet',
    timingInput(fixture, packet),
    clock(2_000_000, 1_000, 50_000_000_000n),
  );
  assert.equal(started.ok, true);

  const finished = processOperation(
    'finish-packet',
    timingInput(fixture, packet, { modelCompliance: 'not-applicable' }),
    clock(2_001_250, 1_001.25, 51_250_000_000n),
  );
  assert.equal(finished.ok, true);
  assert.deepEqual(finished.result.duration, { status: 'available', milliseconds: 1250 });
});

test('reboot and epoch drift close packet duration as unavailable', async (t) => {
  const reboot = await workflowFixture(t);
  const rebootPacket = reboot.packets[0];
  await executeOperation(
    'start-packet',
    timingInput(reboot, rebootPacket),
    controlledDeps(clock(3_000_000, 1_000, 60_000_000_000n)),
  );
  const afterReboot = await executeOperation(
    'finish-packet',
    timingInput(reboot, rebootPacket, { modelCompliance: 'not-applicable' }),
    controlledDeps(clock(3_000_500, 100, 60_500_000_000n)),
  );
  assert.deepEqual(afterReboot.result.duration, { status: 'unavailable' });

  const drift = await workflowFixture(t);
  const driftPacket = drift.packets[0];
  await executeOperation(
    'start-packet',
    timingInput(drift, driftPacket),
    controlledDeps(clock(4_000_000, 2_000, 70_000_000_000n)),
  );
  const afterDrift = await executeOperation(
    'finish-packet',
    timingInput(drift, driftPacket, { modelCompliance: 'not-applicable' }),
    controlledDeps(clock(4_010_000, 2_010, 71_000_000_000n)),
  );
  assert.deepEqual(afterDrift.result.duration, { status: 'unavailable' });
});

test('a crash leaves incomplete evidence, then unavailable timing can be reconciled and finalized', async (t) => {
  const fixture = await workflowFixture(t);
  const packet = fixture.packets[0];
  await executeOperation(
    'start-packet',
    timingInput(fixture, packet),
    controlledDeps(clock(5_000_000, 2_500, 80_000_000_000n)),
  );

  // A completed run whose receipt is still started is a mid-write fault: it persists
  // finalization-failed for this run instead of failing silently.
  await assert.rejects(
    executeOperation('finalize', finishWorkflowInput(fixture, packet), { runner: realRunner }),
    (error) =>
      error.code === 'INCOMPLETE_EVIDENCE' &&
      error.pilotControlOutcome === 'finalization-failed' &&
      error.controlStatePersisted === true &&
      error.alert === 'none',
  );
  const generation = join(
    fixture.root,
    '.effective-flow',
    'model-tiering-pilot',
    'generations',
    fixture.generationId,
  );
  const suspension = JSON.parse(readFileSync(join(generation, 'suspension.json'), 'utf8'));
  assert.deepEqual(suspension.reasons, ['finalization-failed']);
  assert.deepEqual(suspension.affectedRecordIds, [fixture.runId]);
  assert.equal(
    JSON.parse(readFileSync(join(generation, 'state.json'), 'utf8')).generationState,
    'suspended',
  );

  const closed = await executeOperation(
    'finish-packet',
    timingInput(fixture, packet, { modelCompliance: 'not-applicable' }),
    controlledDeps(clock(5_000_500, 100, 80_500_000_000n)),
  );
  assert.deepEqual(closed.result.duration, { status: 'unavailable' });
  await executeOperation('finalize', finishWorkflowInput(fixture, packet), { runner: realRunner });
  // The retry drains the record, but the generation stays suspended until an explicit resume.
  assert.equal(
    JSON.parse(readFileSync(join(generation, 'state.json'), 'utf8')).generationState,
    'suspended',
  );
  assert.deepEqual(
    JSON.parse(readFileSync(join(generation, 'suspension.json'), 'utf8')),
    suspension,
  );

  const recordPath = join(generation, 'records', `${fixture.runId}.json`);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.deepEqual(record.packets[0].implementationDuration, { status: 'unavailable' });
  assert.equal(
    readdirSync(join(recordPath, '..')).some((name) => name.endsWith('.timing.json')),
    false,
  );
});

function generationDirectory(fixture) {
  return join(
    fixture.root,
    '.effective-flow',
    'model-tiering-pilot',
    'generations',
    fixture.generationId,
  );
}

function allPacketsInput(fixture, completionStatus) {
  return {
    ...finishWorkflowInput(fixture, fixture.packets[0]),
    packets: fixture.packets.map((packet) => ({
      packetId: packet.packetId,
      packetCapability: packet.packetCapability,
      fallback: 'none',
      escalated: false,
      costProxy: null,
    })),
    completionStatus,
  };
}

function timingNames(records) {
  return readdirSync(records)
    .filter((name) => name.endsWith('.timing.json'))
    .sort();
}

async function inventoryOf(fixture) {
  return (
    await executeOperation(
      'inventory',
      {
        runtimeStateRoot: fixture.root,
        repositoryIdentity: fixture.repositoryIdentity,
        generationId: fixture.generationId,
      },
      { runner: realRunner },
    )
  ).result;
}

// Invariant: a timing receipt a terminal record kept because its finalize faulted after persisting
// the record stays readable as an open packet timing, so the documented recovery is reachable:
// a fresh inventory, then reconcile-record drains the receipt and keeps the stored record.
test('reconcile-record drains the timing receipts a faulted finalize left behind a terminal record', async (t) => {
  const fixture = await workflowFixture(t, 2);
  for (const [index, packet] of fixture.packets.entries()) {
    const offset = BigInt(index);
    await executeOperation(
      'start-packet',
      timingInput(fixture, packet),
      controlledDeps(clock(9_000_000, 4_500, 120_000_000_000n + offset)),
    );
    await executeOperation(
      'finish-packet',
      timingInput(fixture, packet, { modelCompliance: 'not-applicable' }),
      controlledDeps(clock(9_000_100, 4_500.1, 120_100_000_000n + offset)),
    );
  }
  const generation = generationDirectory(fixture);
  const records = join(generation, 'records');
  const recordPath = join(records, `${fixture.runId}.json`);

  // The fault strikes in the receipt-removal loop, after the terminal record is persisted and its
  // first receipt removed.
  let armed = true;
  async function faultingRunner(request) {
    if (
      armed &&
      request.args.includes('ls-files') &&
      JSON.parse(readFileSync(recordPath, 'utf8')).kind === 'workflow-record' &&
      timingNames(records).length === 1
    ) {
      armed = false;
      throw new Error('injected receipt removal fault');
    }
    return realRunner(request);
  }
  await assert.rejects(
    executeOperation('finalize', allPacketsInput(fixture, 'completed'), {
      runner: faultingRunner,
    }),
    (error) =>
      error.pilotControlOutcome === 'finalization-failed' && error.controlStatePersisted === true,
  );
  assert.equal(armed, false);
  const recordBytes = readFileSync(recordPath, 'utf8');
  assert.equal(JSON.parse(recordBytes).kind, 'workflow-record');
  assert.equal(JSON.parse(recordBytes).completionStatus, 'completed');
  assert.equal(timingNames(records).length, 1);

  const leftover = await inventoryOf(fixture);
  assert.equal(leftover.incompleteCounts.packetTimings, 1);
  assert.equal(leftover.incompleteCounts.workflowRecords, 0);
  assert.equal(leftover.busyCause, 'open-reservations');

  const reconcileInput = {
    runtimeStateRoot: fixture.root,
    repositoryIdentity: fixture.repositoryIdentity,
    generationId: fixture.generationId,
    runId: fixture.runId,
    workflowCapability: fixture.workflowCapability,
    expectedInventoryDigest: leftover.inventoryDigest,
    confirmation: true,
  };
  await assert.rejects(
    executeOperation(
      'reconcile-record',
      { ...reconcileInput, workflowCapability: fixture.packets[0].packetCapability },
      { runner: realRunner },
    ),
    (error) => error.code === 'AUTHENTICATION_FAILED',
  );
  assert.equal(timingNames(records).length, 1);
  assert.deepEqual(
    (await executeOperation('reconcile-record', reconcileInput, { runner: realRunner })).result,
    { status: 'completed', runId: fixture.runId },
  );
  assert.equal(readFileSync(recordPath, 'utf8'), recordBytes);
  assert.deepEqual(timingNames(records), []);
  const drained = await inventoryOf(fixture);
  assert.equal(drained.incompleteCounts.packetTimings, 0);
  assert.equal(drained.busyCause, null);
});

// Invariant: an open receipt binds only by its reservation's packet capability hash, and a leftover
// receipt only to a packet of a terminal record that started (or is unknown); a receipt of an
// unknown run, an unknown packet, a packet that never started, or a mismatched reservation fails
// the inventory closed. A bound leftover keeps new admission closed until reconcile-record drains it.
test('a timing receipt no terminal record binds still fails the inventory closed', async (t) => {
  const fixture = await workflowFixture(t, 2);
  const [missing, started] = fixture.packets;
  await executeOperation(
    'start-packet',
    timingInput(fixture, started),
    controlledDeps(clock(9_500_000, 4_750, 130_000_000_000n)),
  );
  const records = join(generationDirectory(fixture), 'records');
  const receiptPath = join(records, `${fixture.runId}.${started.packetId}.timing.json`);
  const receiptBytes = readFileSync(receiptPath, 'utf8');
  const receipt = JSON.parse(receiptBytes);
  const reservation = JSON.parse(readFileSync(join(records, `${fixture.runId}.json`), 'utf8'));
  const otherHash = reservation.packets.find(
    ({ packetId }) => packetId === missing.packetId,
  ).packetCapabilityHash;
  assert.notEqual(otherHash, receipt.packetCapabilityHash);
  writeFileSync(
    receiptPath,
    `${JSON.stringify({ ...receipt, packetCapabilityHash: otherHash })}\n`,
    {
      mode: 0o600,
    },
  );
  await assert.rejects(
    inventoryOf(fixture),
    (error) => error.code === 'INCOMPLETE_EVIDENCE',
    'mismatched reservation',
  );
  writeFileSync(receiptPath, receiptBytes, { mode: 0o600 });
  await executeOperation('finalize', allPacketsInput(fixture, 'aborted'), { runner: realRunner });
  const record = JSON.parse(readFileSync(join(records, `${fixture.runId}.json`), 'utf8'));
  assert.deepEqual(
    record.packets.map(({ attempt }) => attempt),
    ['not-started', 'started'],
  );
  assert.deepEqual(timingNames(records), []);

  const plant = (runId, packetId) => {
    const target = join(records, `${runId}.${packetId}.timing.json`);
    writeFileSync(target, `${JSON.stringify({ ...receipt, runId, packetId })}\n`, {
      mode: 0o600,
    });
    return target;
  };
  for (const [label, runId, packetId] of [
    ['unknown run', 'U'.repeat(32), started.packetId],
    ['unknown packet', fixture.runId, 'Q'.repeat(32)],
    ['packet that never started', fixture.runId, missing.packetId],
  ]) {
    const target = plant(runId, packetId);
    await assert.rejects(
      inventoryOf(fixture),
      (error) => error.code === 'INCOMPLETE_EVIDENCE',
      label,
    );
    rmSync(target);
  }
  // The started packet's own receipt is the leftover a faulted finalize keeps.
  plant(fixture.runId, started.packetId);
  const leftover = await inventoryOf(fixture);
  assert.equal(leftover.incompleteCounts.packetTimings, 1);
  assert.equal(leftover.busyCause, 'open-reservations');
  const startInput = {
    runtimeStateRoot: fixture.root,
    repositoryIdentity: fixture.repositoryIdentity,
    generationId: fixture.generationId,
    configState: 'enabled',
    workflow: 'build',
    harnessFamily: 'codex',
    installKind: 'native',
    packets: [
      {
        selectedProfile: 'quality',
        wouldBeFastEligible: true,
        gate: { eligibility: 'eligible', firstReason: null },
      },
    ],
  };
  await assert.rejects(
    executeOperation('start', startInput, { runner: realRunner }),
    (error) => error.code === 'INCOMPLETE_EVIDENCE',
  );
  assert.deepEqual(
    (
      await executeOperation(
        'reconcile-record',
        {
          runtimeStateRoot: fixture.root,
          repositoryIdentity: fixture.repositoryIdentity,
          generationId: fixture.generationId,
          runId: fixture.runId,
          workflowCapability: fixture.workflowCapability,
          expectedInventoryDigest: leftover.inventoryDigest,
          confirmation: true,
        },
        { runner: realRunner },
      )
    ).result,
    { status: 'aborted', runId: fixture.runId },
  );
  assert.deepEqual(timingNames(records), []);
  assert.equal(
    (await executeOperation('start', startInput, { runner: realRunner })).result.status,
    'reserved',
  );
});

test('an aborted or failed run records each packet attempt from its receipt', async (t) => {
  for (const completionStatus of ['aborted', 'failed']) {
    await t.test(completionStatus, async (t) => {
      const fixture = await workflowFixture(t, 3);
      const [missing, started, finished] = fixture.packets;
      await executeOperation(
        'start-packet',
        timingInput(fixture, started),
        controlledDeps(clock(7_000_000, 3_500, 100_000_000_000n)),
      );
      await executeOperation(
        'start-packet',
        timingInput(fixture, finished),
        controlledDeps(clock(7_000_000, 3_500, 100_000_000_001n)),
      );
      await executeOperation(
        'finish-packet',
        timingInput(fixture, finished, { modelCompliance: 'not-applicable' }),
        controlledDeps(clock(7_000_250, 3_500.25, 100_250_000_001n)),
      );
      const input = {
        ...finishWorkflowInput(fixture, missing),
        packets: fixture.packets.map((packet) => ({
          packetId: packet.packetId,
          packetCapability: packet.packetCapability,
          fallback: 'none',
          escalated: false,
          costProxy: null,
        })),
        completionStatus,
      };
      const generation = join(
        fixture.root,
        '.effective-flow',
        'model-tiering-pilot',
        'generations',
        fixture.generationId,
      );
      const records = join(generation, 'records');

      // A caller outcome for a packet that never started is a caller error and never suspends.
      await assert.rejects(
        executeOperation(
          'finalize',
          {
            ...input,
            packets: input.packets.map((packet, index) =>
              index === 0
                ? {
                    ...packet,
                    costProxy: { kind: 'executor-unit', unit: 'microcredit', value: '1' },
                  }
                : packet,
            ),
          },
          { runner: realRunner },
        ),
        (error) =>
          error.code === 'INVALID_PAYLOAD' &&
          error.pilotControlOutcome === 'none' &&
          error.controlStatePersisted === false,
      );
      assert.equal(existsSync(join(generation, 'suspension.json')), false);
      assert.equal(readdirSync(records).filter((name) => name.endsWith('.timing.json')).length, 2);

      await executeOperation('finalize', input, { runner: realRunner });
      const record = JSON.parse(readFileSync(join(records, `${fixture.runId}.json`), 'utf8'));
      assert.equal(record.completionStatus, completionStatus);
      assert.deepEqual(
        record.packets.map(({ attempt, implementationDuration, costProxy }) => ({
          attempt,
          implementationDuration,
          costProxy,
        })),
        [
          {
            attempt: 'not-started',
            implementationDuration: { status: 'unavailable' },
            costProxy: { status: 'unavailable' },
          },
          {
            attempt: 'started',
            implementationDuration: { status: 'unavailable' },
            costProxy: { status: 'unavailable' },
          },
          {
            attempt: 'started',
            implementationDuration: { status: 'available', milliseconds: 250 },
            costProxy: { status: 'unavailable' },
          },
        ],
      );
      assert.deepEqual(
        readdirSync(records).filter((name) => name.endsWith('.timing.json')),
        [],
      );
      assert.equal(existsSync(join(generation, 'suspension.json')), false);
    });
  }
});

test('a completed run without a receipt fails as a mid-write fault and suspends', async (t) => {
  const fixture = await workflowFixture(t);
  const packet = fixture.packets[0];
  await assert.rejects(
    executeOperation('finalize', finishWorkflowInput(fixture, packet), { runner: realRunner }),
    (error) =>
      error.code === 'NOT_FOUND' &&
      error.pilotControlOutcome === 'finalization-failed' &&
      error.controlStatePersisted === true,
  );
  const generation = join(
    fixture.root,
    '.effective-flow',
    'model-tiering-pilot',
    'generations',
    fixture.generationId,
  );
  const suspension = JSON.parse(readFileSync(join(generation, 'suspension.json'), 'utf8'));
  assert.deepEqual(suspension.reasons, ['finalization-failed']);
  assert.equal(
    JSON.parse(readFileSync(join(generation, 'records', `${fixture.runId}.json`), 'utf8')).kind,
    'workflow-reservation',
  );
});

test('concurrent packet writers enforce prospective total capacity and persist durable control', async (t) => {
  const fixture = await workflowFixture(t, 2);
  const generation = join(
    fixture.root,
    '.effective-flow',
    'model-tiering-pilot',
    'generations',
    fixture.generationId,
  );
  const padding = join(generation, 'summaries', 'capacity-padding');
  writeFileSync(padding, '');
  truncateSync(
    padding,
    PILOT_MEASUREMENT_PROTOCOL.limits.maxRawGenerationBytes - treeBytes(generation),
  );
  assert.equal(treeBytes(generation), PILOT_MEASUREMENT_PROTOCOL.limits.maxRawGenerationBytes);

  const settled = await Promise.allSettled(
    fixture.packets.map((packet, index) =>
      executeOperation(
        'start-packet',
        timingInput(fixture, packet),
        controlledDeps(clock(6_000_000, 3_000, 90_000_000_000n + BigInt(index))),
      ),
    ),
  );
  assert.deepEqual(
    settled.map((result) => result.status),
    ['rejected', 'rejected'],
  );
  for (const result of settled) {
    assert.equal(result.reason.code, 'CAPACITY_EXHAUSTED');
    assert.equal(result.reason.pilotControlOutcome, 'capacity-exhausted');
  }
  assert.ok(settled.some((result) => result.reason.controlStatePersisted === true));
  assert.equal(
    readdirSync(join(generation, 'records')).some(
      (name) => name.endsWith('.timing.json') || name.startsWith('.tmp-'),
    ),
    false,
  );
  const suspension = JSON.parse(readFileSync(join(generation, 'suspension.json'), 'utf8'));
  assert.ok(suspension.reasons.includes('capacity-exhausted'));
  assert.equal(
    JSON.parse(readFileSync(join(generation, 'state.json'), 'utf8')).generationState,
    'suspended',
  );
  assert.equal(existsSync(padding), true);
});
