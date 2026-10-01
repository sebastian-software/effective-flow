// `build` adopts the execution-profile policy in Phase 2 and records it through the pilot
// workflow-record fragment. Neither is executable code, so this suite pins the adoption three
// times: a small reference model, derived from the parsed policy tables, replays the fixture
// scenarios under test/fixtures/execution-profiles/build/; every replayable scenario's operations
// then run against the shipped helper in a temporary runtime root, with payloads built from the
// keys the fragment documents; and prose assertions pin the workflow text that tells an
// orchestrator to behave like that model.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { parseExecutionProfileContract } from '../build-lib.mjs';
import { executeOperation } from '../src/scripts/pilot-measurement-core.mjs';
import {
  PILOT_MEASUREMENT_POLICY_PROJECTION,
  PILOT_MEASUREMENT_PROTOCOL,
  PILOT_MEASUREMENT_PROTOCOL_DIGEST,
  PILOT_MEASUREMENT_PROTOCOL_VERSION,
} from '../src/scripts/pilot-measurement-protocol.mjs';
import { FAST_CAPABLE_ROUTE_IDS } from './support/native-profile-config.mjs';
import {
  pilotOperationKeys,
  pilotOperationOptionalKeys,
} from './support/pilot-helper-contract.mjs';

const ROOT = new URL('..', import.meta.url);
const source = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');

const contract = parseExecutionProfileContract(source('src/shared/execution-profiles.md'), {
  context: 'src/shared/execution-profiles.md',
});
const build = source('src/tools/build.md');
const fragment = source('src/shared/pilot-measurement-workflow.md');

function section(text, start, end) {
  const from = text.indexOf(start);
  assert.notEqual(from, -1, `missing section start: ${start}`);
  const to = end === undefined ? text.length : text.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return text.slice(from, to);
}

function ordered(text, ...needles) {
  let previous = -1;
  for (const needle of needles) {
    const current = text.indexOf(needle, previous + 1);
    assert.notEqual(current, -1, `missing ordered text: ${needle}`);
    previous = current;
  }
}

const phase2 = section(build, '### Phase 2: Implementation', '### Phase 3: Documentation');

// --- Documented payload keys ----------------------------------------------------------------

const jsonBlocks = (text) =>
  [...text.matchAll(/```json\n([\s\S]*?)```/g)].map((match) =>
    JSON.parse(match[1].replace(/^ {3}/gm, '')),
  );

// The keys a prose sentence lists after `marker`, up to `end`; parenthetical remarks are skipped.
function proseKeys(text, marker, end) {
  const sentence = section(flat(text), marker, end).replace(/\([^)]*\)/g, '');
  return [...sentence.matchAll(/`([A-Za-z]+)(?:: [^`]+)?`/g)].map(([, key]) => key);
}

// The exact stdin keys the fragment documents for each of the six operations `build` calls.
const FRAGMENT_KEYS = (() => {
  const preflight = section(fragment, '### Preflight', '### Reservation');
  const reservation = section(fragment, '### Reservation', '### Packet timing');
  const timing = section(fragment, '### Packet timing', '### Finalization');
  const finalization = section(fragment, '### Finalization', '### Incidents and pilot control');
  const incidents = section(
    fragment,
    '### Incidents and pilot control',
    '### Finalization failure',
  );
  const failure = section(fragment, '### Finalization failure');
  const packetKeys = Object.keys(jsonBlocks(timing)[0]);
  return {
    inventory: Object.keys(jsonBlocks(preflight)[0]),
    start: Object.keys(jsonBlocks(reservation)[1]),
    'start-packet': packetKeys,
    'finish-packet': packetKeys,
    finalize: Object.keys(jsonBlocks(finalization)[0]),
    suspend: proseKeys(incidents, 'payload has exactly', ', which holds'),
    'reconcile-record': proseKeys(failure, 'call `reconcile-record` with exactly', '. A declined'),
  };
})();

// --- Reference model ------------------------------------------------------------------------

const FAST_CAPABLE_ROUTES = new Set(FAST_CAPABLE_ROUTE_IDS);
const GATE_ORDER = contract.gate
  .filter(({ decision }) => decision !== 'eligible')
  .sort((left, right) => Number(left.priority) - Number(right.priority))
  .map(({ decision }) => decision);
const POST_ATTEMPT_FALLBACKS = contract.decisionMappings
  .filter(({ fastAttemptConsumed }) => fastAttemptConsumed === 'true')
  .map(({ fallback }) => fallback);
const INSPECTING_FALLBACKS = new Set(['missing-context', 'scope-growth', 'new-decision']);
const INCIDENT_OUTCOMES = new Map([
  ['safety', 'critical-safety-incident'],
  ['data integrity', 'critical-data-integrity-incident'],
  ['authorization', 'critical-authorization-incident'],
  ['scope boundary', 'critical-scope-incident'],
  ['failed finalization', 'finalization-failed'],
]);
const MEASURED_STATES = new Set(['baseline', 'active']);
const SUSPENDABLE_STATES = new Set(['baseline', 'active', 'suspended']);

function configStateOf(input) {
  const row = contract.configCases.find((candidate) => candidate.input === input);
  assert.ok(row, `unknown configuration input: ${input}`);
  return row.configState;
}

function legalRow(configState, generationState, eligibility) {
  const tag = eligibility.startsWith('excluded(') ? 'excluded(reason)' : eligibility;
  return contract.states.find(
    (row) =>
      row.configState === configState &&
      (row.generationState === '*' || row.generationState === generationState) &&
      row.eligibility === tag,
  );
}

function unrecorded() {
  return {
    eligibility: 'not-evaluated',
    selectedProfile: 'quality',
    recorded: false,
    wire: null,
    attempts: ['quality'],
    fallback: 'none',
    fastAttemptConsumed: false,
  };
}

function classify(packet, fixture, groupSizes) {
  const capability = {
    nativeMapping: true,
    spawnMechanism: true,
    forceOverridePresent: false,
    ...fixture.capability,
  };
  const failed = new Set(packet.failedEvidence ?? []);
  if (
    !FAST_CAPABLE_ROUTES.has(packet.bucket) ||
    !capability.nativeMapping ||
    !capability.spawnMechanism ||
    capability.forceOverridePresent
  ) {
    failed.add('profile-unavailable');
  }
  if (packet.preExistingDirtyInFastPath) failed.add('unclear-ownership');
  if (packet.couplingGroup && groupSizes.get(packet.couplingGroup) > 1) {
    failed.add('cross-domain-dependency');
  }
  for (const reason of failed) assert.ok(GATE_ORDER.includes(reason), `unknown gate: ${reason}`);
  const first = GATE_ORDER.find((decision) => failed.has(decision));
  return first === undefined ? 'eligible' : `excluded(${first})`;
}

function wireOf(eligibility, selectedProfile) {
  const eligible = eligibility === 'eligible';
  return {
    selectedProfile,
    wouldBeFastEligible: eligible,
    gate: {
      eligibility: eligible ? 'eligible' : 'excluded',
      firstReason: eligible ? null : eligibility.slice('excluded('.length, -1),
    },
  };
}

// What the orchestrator may say about a helper error envelope: a persisted control state, only the
// value-free alert, or nothing.
function controlEvent(operation, control) {
  assert.deepEqual(Object.keys(control).sort(), [
    'alert',
    'controlStatePersisted',
    'pilotControlOutcome',
  ]);
  const row = contract.controls.find(({ outcome }) => outcome === control.pilotControlOutcome);
  assert.ok(row, `unknown pilot-control outcome: ${control.pilotControlOutcome}`);
  return {
    kind: 'control',
    operation,
    pilotControlOutcome: control.pilotControlOutcome,
    report: control.controlStatePersisted
      ? 'persisted'
      : control.alert === 'value-free'
        ? 'value-free-alert'
        : 'none',
  };
}

// Returns the fixture's expected-shape result plus the detailed step list the replay executes.
// `generationState` is the run's effective envelope; `persistedGenerationState` is the state an
// inventory proved (`null` when none was read), which an incident suspends even when the run itself
// is unmeasured.
function runScenario(fixture) {
  const configState = configStateOf(fixture.config);
  const steps = [];
  const events = [];
  let persistedGenerationState = null;
  const shape = (generationState, packets, finalize = null) => ({
    configState,
    generationState,
    persistedGenerationState,
    operations: steps.map(({ operation }) => operation),
    packets,
    suspend: steps
      .filter(({ operation }) => operation === 'suspend')
      .map(({ pilotControlOutcome }) => pilotControlOutcome),
    finalize,
    events,
  });
  // A critical incident suspends only an inventory-proven baseline, active, or suspended
  // generation, whether or not the run holds a record.
  const incident = (packet) => {
    if (packet.incident === undefined) return;
    assert.ok(INCIDENT_OUTCOMES.has(packet.incident), `unknown incident: ${packet.incident}`);
    if (!SUSPENDABLE_STATES.has(persistedGenerationState)) return;
    const suspendResult = packet.suspendResult ?? 'persisted';
    assert.ok(['persisted', 'failed'].includes(suspendResult));
    steps.push({
      operation: 'suspend',
      pilotControlOutcome: INCIDENT_OUTCOMES.get(packet.incident),
      result: suspendResult,
    });
    if (suspendResult === 'failed') {
      events.push({ kind: 'alert', operation: 'suspend', report: 'value-free-alert' });
    }
  };
  // Disabled and invalid keep their own fail-closed rows; every other unrecorded run is either a
  // proven none/suspended/review generation or an unmeasured run, which takes the `none` row.
  const quiet = (generationState) => {
    for (const packet of fixture.packets) incident(packet);
    return {
      steps,
      result: shape(
        generationState,
        fixture.packets.map(() => unrecorded()),
      ),
    };
  };
  if (configState !== 'enabled') return quiet(null);
  if (fixture.harness === 'portable') return quiet('none');
  assert.ok(['claude', 'codex'].includes(fixture.harness));
  steps.push({ operation: 'inventory' });
  if (fixture.inventory === 'failed') return quiet('none');
  const generationState = fixture.inventory === 'absent' ? 'none' : fixture.inventory;
  persistedGenerationState = generationState;
  if (!MEASURED_STATES.has(generationState)) return quiet(generationState);

  const groupSizes = new Map();
  for (const { couplingGroup } of fixture.packets) {
    if (couplingGroup) groupSizes.set(couplingGroup, (groupSizes.get(couplingGroup) ?? 0) + 1);
  }
  const classified = fixture.packets.map((packet) => {
    const eligibility = classify(packet, fixture, groupSizes);
    const row = legalRow(configState, generationState, eligibility);
    assert.ok(row, `no legal envelope for ${generationState}/${eligibility}`);
    return { packet, eligibility, selectedProfile: row.selectedProfile };
  });
  const wires = classified.map(({ eligibility, selectedProfile }) =>
    wireOf(eligibility, selectedProfile),
  );
  steps.push({ operation: 'start', wires, result: fixture.startResult ?? 'reserved' });
  if ((fixture.startResult ?? 'reserved') !== 'reserved') {
    if (fixture.startControl) events.push(controlEvent('start', fixture.startControl));
    return quiet('none');
  }

  let unfinalizable = false;
  const deferred = [];
  const packets = classified.map(({ packet, eligibility, selectedProfile }, index) => {
    const outcome = packet.initialOutcome ?? 'none';
    const result = {
      eligibility,
      selectedProfile,
      recorded: true,
      wire: wires[index],
      attempts: [],
      fallback: 'none',
      fastAttemptConsumed: false,
    };
    if (outcome === 'never-spawned') {
      deferred.push(index);
      return result;
    }
    if (!unfinalizable) steps.push({ operation: 'start-packet', packet: index });
    // A helper failure after `start` blocks every later Fast attempt in the run.
    if (selectedProfile === 'fast' && !unfinalizable) {
      result.fastAttemptConsumed = true;
      result.attempts.push('fast');
      if (outcome !== 'none') {
        assert.ok(POST_ATTEMPT_FALLBACKS.includes(outcome), `unknown fallback: ${outcome}`);
        result.fallback = outcome;
        result.attempts.push('quality');
      }
    } else {
      assert.equal(outcome, 'none', 'a packet without a Fast attempt has no post-attempt fallback');
      result.attempts.push('quality');
    }
    if (packet.scopeGrowth !== undefined) {
      assert.ok(
        INSPECTING_FALLBACKS.has(result.fallback),
        'growth surfaces in an inspecting fallback',
      );
      assert.ok(['authorized', 'independent'].includes(packet.scopeGrowth));
      // Authorized growth stays in this packet; independent new work is never appended.
      if (packet.scopeGrowth === 'independent') {
        events.push({ kind: 'ask', topic: 'capture-independent-new-work' });
      }
    }
    incident(packet);
    if (packet.finishFailure !== undefined) {
      steps.push({ operation: 'finish-packet', packet: index, result: 'failed' });
      events.push(controlEvent('finish-packet', packet.finishFailure));
      unfinalizable = true;
    } else if (!unfinalizable) {
      steps.push({ operation: 'finish-packet', packet: index });
    }
    return result;
  });
  for (const index of deferred) {
    assert.notEqual(fixture.completion, 'completed', 'an unspawned packet cannot complete');
    if (!unfinalizable) {
      steps.push({ operation: 'start-packet', packet: index });
      steps.push({ operation: 'finish-packet', packet: index });
    }
  }

  const finalize = {
    completionStatus: fixture.completion ?? 'failed',
    qualityCorrectionRounds: (fixture.corrections ?? []).length,
    packets: packets.map(({ fallback }) => ({ fallback, escalated: fallback !== 'none' })),
  };
  const finalizeResult = fixture.finalizeResult ?? 'finalized';
  assert.ok(['finalized', 'lost-response', 'failed'].includes(finalizeResult));
  let failed = unfinalizable;
  if (!unfinalizable) {
    if (finalizeResult === 'lost-response') {
      steps.push({ operation: 'finalize', result: 'response-lost' });
      steps.push({ operation: 'finalize', result: 'finalized' });
    } else {
      steps.push({ operation: 'finalize', result: finalizeResult });
    }
    if (finalizeResult === 'failed') {
      if (fixture.finalizeControl) events.push(controlEvent('finalize', fixture.finalizeControl));
      failed = true;
    }
  }
  if (failed) {
    steps.push({
      operation: 'suspend',
      pilotControlOutcome: INCIDENT_OUTCOMES.get('failed finalization'),
      result: 'persisted',
    });
    if (fixture.reconcileAnswer === 'Reconcile') {
      steps.push({ operation: 'inventory', withGeneration: true });
      steps.push({ operation: 'reconcile-record' });
    }
  }
  return { steps, result: shape(generationState, packets, unfinalizable ? null : finalize) };
}

// --- Helper replay --------------------------------------------------------------------------

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
};
const DAY_MS = 86_400_000;
const sandbox = mkdtempSync(join(tmpdir(), 'effective-flow-build-pilot-replay-'));
after(() => rmSync(sandbox, { recursive: true, force: true }));

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env: GIT_ENV });
  assert.equal(result.status, 0, result.stderr);
}

function runtime(root, clock) {
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
    nowMs: () => clock.wallMs,
    monotonicNs: () => clock.monotonicNs,
    uptimeSeconds: () => clock.uptime,
    hostname: () => 'replay-host',
  };
  const common = { runtimeStateRoot: root, repositoryIdentity: realpathSync(join(root, '.git')) };
  const call = (operation, input) => executeOperation(operation, input, deps);
  const advance = (milliseconds) => {
    clock.wallMs += milliseconds;
    clock.monotonicNs += BigInt(milliseconds) * 1_000_000n;
    clock.uptime += milliseconds / 1000;
  };
  return { root, clock, common, call, advance };
}

function freshRepository(name) {
  const root = join(sandbox, name);
  mkdirSync(root);
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
  return runtime(root, { wallMs: 1_800_000_000_000, monotonicNs: 10_000_000_000n, uptime: 1000 });
}

const quality = (eligible) => ({
  selectedProfile: 'quality',
  wouldBeFastEligible: eligible,
  gate: eligible
    ? { eligibility: 'eligible', firstReason: null }
    : { eligibility: 'excluded', firstReason: 'unknown-evidence' },
});

// Each generation state is prepared once, by the helper's own operations, and copied per scenario.
const templates = new Map();
function template(state) {
  if (!templates.has(state)) templates.set(state, prepareTemplate(state));
  return templates.get(state);
}

async function prepareTemplate(state) {
  const rt = freshRepository(`template-${state}`);
  if (state === 'absent') return { root: rt.root, clock: { ...rt.clock }, generationId: null };
  const baseline = await rt.call('begin-baseline', {
    ...rt.common,
    configState: 'enabled',
    fastEnabled: true,
    protocolVersion: PILOT_MEASUREMENT_PROTOCOL_VERSION,
    protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
    confirmation: true,
  });
  const { generationId } = baseline.result;
  const scoped = { ...rt.common, generationId };
  if (state === 'active') {
    const sample = PILOT_MEASUREMENT_PROTOCOL.aggregation.baselineEligiblePacketMinimum;
    const reservation = (
      await rt.call('start', {
        ...scoped,
        configState: 'enabled',
        workflow: 'build',
        harnessFamily: 'codex',
        packets: Array.from({ length: sample }, () => quality(true)),
      })
    ).result;
    const packets = [];
    for (const packet of reservation.packets) {
      const identity = {
        ...scoped,
        runId: reservation.runId,
        packetId: packet.packetId,
        workflowCapability: reservation.workflowCapability,
        packetCapability: packet.packetCapability,
      };
      await rt.call('start-packet', identity);
      rt.advance(10);
      await rt.call('finish-packet', identity);
      packets.push({
        packetId: packet.packetId,
        packetCapability: packet.packetCapability,
        fallback: 'none',
        escalated: false,
        costProxy: null,
      });
    }
    await rt.call('finalize', {
      ...scoped,
      runId: reservation.runId,
      workflowCapability: reservation.workflowCapability,
      packets,
      validation: { status: 'passed', requiredCount: 1, totalCount: 1, satisfiedCount: 1 },
      review: { status: 'completed', severityCounts: { critical: 0, important: 0, note: 0 } },
      completionStatus: 'completed',
      qualityCorrectionRounds: 0,
      detailOptIn: false,
      trace: null,
    });
    rt.advance(PILOT_MEASUREMENT_PROTOCOL.aggregation.baselineWindowMinimumDays * DAY_MS);
    await rt.call('activate', {
      ...scoped,
      configState: 'enabled',
      protocolVersion: PILOT_MEASUREMENT_PROTOCOL_VERSION,
      protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
      confirmation: true,
    });
  } else if (state === 'suspended') {
    await rt.call('suspend', {
      ...scoped,
      pilotControlOutcome: 'critical-safety-incident',
      affectedRecordIds: [],
    });
  } else if (state === 'review') {
    await beginReview(rt, generationId);
  } else {
    assert.equal(state, 'baseline');
  }
  return { root: rt.root, clock: { ...rt.clock }, generationId };
}

async function beginReview(rt, generationId) {
  const { inventoryDigest } = (await rt.call('inventory', { ...rt.common, generationId })).result;
  await rt.call('begin-review', {
    ...rt.common,
    generationId,
    configState: 'enabled',
    expectedInventoryDigest: inventoryDigest,
    confirmation: true,
  });
}

let clones = 0;
async function cloneTemplate(state) {
  const prepared = await template(state);
  const root = join(sandbox, `scenario-${(clones += 1)}`);
  cpSync(prepared.root, root, { recursive: true });
  return { ...runtime(root, { ...prepared.clock }), generationId: prepared.generationId };
}

// Builds an operation payload from exactly the keys the fragment documents, so a documented key the
// orchestrator cannot fill, or one the helper refuses, fails here.
function payload(operation, values) {
  const keys = FRAGMENT_KEYS[operation];
  const missing = keys.filter((key) => !(key in values));
  assert.deepEqual(missing, [], `${operation}: the replay has no value for a documented key`);
  return Object.fromEntries(keys.map((key) => [key, values[key]]));
}

async function expectFailure(promise, code, message) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, message);
    return true;
  });
}

async function replay(fixture, scenario) {
  const rt = await cloneTemplate(fixture.inventory);
  const external = (at) => (fixture.external ?? []).filter((action) => action.at === at);
  const runExternal = async (at) => {
    for (const { operation } of external(at)) {
      if (operation === 'begin-review') await beginReview(rt, rt.generationId);
      else {
        assert.equal(operation, 'start', `unknown external action: ${operation}`);
        await rt.call('start', {
          ...rt.common,
          generationId: rt.generationId,
          configState: 'enabled',
          workflow: 'build',
          harnessFamily: 'codex',
          packets: [quality(false)],
        });
      }
    }
  };
  const values = {
    ...rt.common,
    generationId: rt.generationId,
    configState: 'enabled',
    workflow: 'build',
    harnessFamily: fixture.harness,
    confirmation: true,
  };
  let reservation = null;
  let inventoryDigest = null;
  const packetValues = (index) => ({
    ...values,
    runId: reservation.runId,
    workflowCapability: reservation.workflowCapability,
    packetId: reservation.packets[index].packetId,
    packetCapability: reservation.packets[index].packetCapability,
  });
  for (const step of scenario.steps) {
    switch (step.operation) {
      case 'inventory': {
        const input = payload('inventory', values);
        if (step.withGeneration) input.generationId = rt.generationId;
        const { result } = await rt.call('inventory', input);
        if (fixture.inventory === 'absent') assert.equal(result.generationStatus, 'absent');
        else if (!step.withGeneration) assert.equal(result.generationState, fixture.inventory);
        inventoryDigest = result.inventoryDigest ?? null;
        break;
      }
      case 'start': {
        await runExternal('before-start');
        const call = rt.call('start', payload('start', { ...values, packets: step.wires }));
        if (step.result === 'reserved') {
          reservation = (await call).result;
          assert.equal(reservation.packets.length, step.wires.length);
        } else {
          await expectFailure(call, step.result, 'start must fail as the fixture states');
        }
        await runExternal('after-start');
        break;
      }
      case 'start-packet':
        await rt.call('start-packet', payload('start-packet', packetValues(step.packet)));
        rt.advance(25);
        break;
      case 'finish-packet': {
        const { result } = await rt.call(
          'finish-packet',
          payload('finish-packet', packetValues(step.packet)),
        );
        assert.equal(result.duration.status, 'available');
        break;
      }
      case 'suspend': {
        const call = rt.call(
          'suspend',
          payload('suspend', {
            ...values,
            pilotControlOutcome: step.pilotControlOutcome,
            affectedRecordIds: reservation === null ? [] : [reservation.runId],
          }),
        );
        if (step.result === 'failed') await expectFailure(call, 'INVALID_STATE', 'suspend fails');
        else assert.equal((await call).result.generationState, 'suspended');
        break;
      }
      case 'finalize': {
        const outcome = scenario.result.finalize;
        const completed = outcome.completionStatus === 'completed';
        const input = payload('finalize', {
          ...values,
          runId: reservation.runId,
          workflowCapability: reservation.workflowCapability,
          packets: reservation.packets.map(({ packetId, packetCapability }, index) => ({
            packetId,
            packetCapability,
            ...outcome.packets[index],
            costProxy: null,
          })),
          validation: completed
            ? { status: 'passed', requiredCount: 2, totalCount: 3, satisfiedCount: 2 }
            : { status: 'unavailable', requiredCount: 0, totalCount: 0, satisfiedCount: 0 },
          review: completed
            ? { status: 'completed', severityCounts: { critical: 0, important: 1, note: 2 } }
            : { status: 'unavailable', severityCounts: { critical: 0, important: 0, note: 0 } },
          completionStatus: outcome.completionStatus,
          qualityCorrectionRounds: outcome.qualityCorrectionRounds,
          detailOptIn: false,
          trace: null,
        });
        if (step.result === 'failed') {
          // A genuine failure: the helper refuses a capability it never issued.
          const forged = { ...input, workflowCapability: `${'A'.repeat(42)}forged` };
          await expectFailure(rt.call('finalize', forged), 'AUTHENTICATION_FAILED');
        } else {
          assert.equal((await rt.call('finalize', input)).result.status, 'finalized');
        }
        break;
      }
      case 'reconcile-record': {
        const { result } = await rt.call(
          'reconcile-record',
          payload('reconcile-record', {
            ...values,
            runId: reservation.runId,
            workflowCapability: reservation.workflowCapability,
            expectedInventoryDigest: inventoryDigest,
          }),
        );
        assert.equal(result.status, 'abandoned');
        break;
      }
      default:
        assert.fail(`the replay has no mapping for ${step.operation}`);
    }
  }
}

// --- Fixture replay -------------------------------------------------------------------------

const FIXTURE_DIRECTORY = new URL('fixtures/execution-profiles/build/', import.meta.url);
const fixtures = readdirSync(FIXTURE_DIRECTORY)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((file) => ({ file, ...JSON.parse(readFileSync(new URL(file, FIXTURE_DIRECTORY), 'utf8')) }));

for (const fixture of fixtures) {
  test(`build execution-profile fixture: ${fixture.name}`, () => {
    const { result } = runScenario(fixture);
    assert.deepEqual(result, fixture.expected, fixture.file);

    const operations = result.operations;
    for (const forbidden of ['begin-baseline', 'activate', 'resume', 'begin-review']) {
      assert.ok(!operations.includes(forbidden), `build never calls ${forbidden}`);
    }
    assert.ok(operations.filter((operation) => operation === 'start').length <= 1);
    assert.ok(
      operations.filter((operation) => operation === 'finalize').length <=
        (fixture.finalizeResult === 'lost-response' ? 2 : 1),
      'finalize is sent once, re-sent only after a lost response',
    );
    if (operations.includes('finalize')) {
      const starts = operations.filter((operation) => operation === 'start-packet').length;
      const finishes = operations.filter((operation) => operation === 'finish-packet').length;
      assert.equal(starts, fixture.packets.length, 'every reserved packet starts its timer');
      assert.equal(finishes, fixture.packets.length, 'every reserved packet is closed');
      assert.ok(operations.lastIndexOf('finish-packet') < operations.indexOf('finalize'));
    }
    if (result.configState !== 'enabled' || fixture.harness === 'portable') {
      assert.deepEqual(operations, [], 'disabled, invalid, and portable runs call no operation');
    }
    // The effective envelope never overwrites the inventory-proven persisted state, and only that
    // persisted state decides whether an incident suspends.
    if (!operations.includes('inventory')) assert.equal(result.persistedGenerationState, null);
    if (result.suspend.length > 0) {
      assert.ok(SUSPENDABLE_STATES.has(result.persistedGenerationState), 'suspend needs a target');
    }
    if (MEASURED_STATES.has(result.generationState)) {
      assert.equal(result.persistedGenerationState, result.generationState);
    }
    for (const packet of result.packets) {
      assert.ok(packet.attempts.filter((profile) => profile === 'fast').length <= 1);
      assert.ok(packet.attempts.indexOf('fast') <= 0, 'Fast is only ever the first attempt');
      assert.ok(packet.attempts.length <= 2, 'one Fast to Quality transition at most');
      assert.equal(packet.fastAttemptConsumed, packet.attempts.includes('fast'));
      if (packet.fallback !== 'none') {
        const row = contract.decisionMappings.find(({ fallback }) => fallback === packet.fallback);
        assert.equal(row.fastAttemptConsumed, 'true');
        assert.deepEqual(packet.attempts, ['fast', 'quality']);
      }
      // Every envelope, recorded or not, is a legal row of the state table.
      const row = legalRow(result.configState, result.generationState, packet.eligibility);
      assert.ok(row, `${packet.eligibility} under ${result.generationState} is no legal row`);
      assert.equal(row.selectedProfile, packet.selectedProfile, 'the envelope is a legal row');
      if (!packet.recorded) {
        assert.ok(!packet.attempts.includes('fast'), 'an unrecorded packet never runs Fast');
      }
    }
    if (result.finalize !== null) {
      assert.ok(['completed', 'aborted', 'failed'].includes(result.finalize.completionStatus));
      if (result.generationState === 'baseline') {
        assert.ok(result.finalize.packets.every(({ fallback }) => fallback === 'none'));
      }
    }
  });
}

// Invariant: every scenario that reaches the helper runs its operations, in order, against the
// shipped helper with payloads built from the fragment's documented keys. A scenario the helper
// cannot produce for `build` states why and stays model-only.
const replayable = (fixture) =>
  configStateOf(fixture.config) === 'enabled' &&
  fixture.harness !== 'portable' &&
  fixture.inventory !== 'failed' &&
  fixture.replay !== false;

test('every replayable fixture runs against the shipped helper', { concurrency: 4 }, async (t) => {
  for (const fixture of fixtures.filter((candidate) => candidate.replay === false)) {
    assert.match(fixture.replayReason ?? '', /\S/, `${fixture.file} must say why it is model-only`);
  }
  await Promise.all(
    fixtures
      .filter(replayable)
      .map((fixture) => t.test(fixture.name, () => replay(fixture, runScenario(fixture)))),
  );
});

// Invariant: the fragment documents, for each of the six operations `build` calls, exactly the
// stdin keys the helper validates; `inventory` also accepts the `generationId` its reconciliation
// read adds.
test('the fragment documents exactly the helper keys of every build operation', () => {
  for (const [operation, keys] of Object.entries(FRAGMENT_KEYS)) {
    assert.deepEqual([...keys].sort(), [...pilotOperationKeys(operation)].sort(), operation);
  }
  assert.deepEqual(pilotOperationOptionalKeys('inventory'), ['generationId']);
  assert.match(
    flat(fragment),
    /On \*\*Reconcile\*\*, read a fresh `inventory` with the `generationId`/,
  );
});

// Invariant: the fixtures together exercise every configuration state, generation state, gate
// reason, fallback, suspending outcome, and helper-envelope path, so a shrunk fixture set cannot
// hide a vocabulary.
test('the fixture set covers the configuration, generation, gate, and fallback matrix', () => {
  const seen = (select) => new Set(fixtures.flatMap(select));
  assert.deepEqual([...seen((fixture) => [configStateOf(fixture.config)])].sort(), [
    'disabled',
    'enabled',
    'invalid',
  ]);
  assert.deepEqual(
    [...seen((fixture) => [fixture.expected.generationState])].filter(Boolean).sort(),
    ['active', 'baseline', 'none', 'review', 'suspended'],
  );
  assert.deepEqual(
    [...seen((fixture) => fixture.expected.packets.map(({ eligibility }) => eligibility))]
      .filter((eligibility) => eligibility.startsWith('excluded('))
      .map((eligibility) => eligibility.slice('excluded('.length, -1))
      .sort(),
    [...PILOT_MEASUREMENT_POLICY_PROJECTION.gateReasons].sort(),
  );
  assert.deepEqual(
    [...seen((fixture) => fixture.expected.packets.map(({ fallback }) => fallback))].sort(),
    [...PILOT_MEASUREMENT_POLICY_PROJECTION.fallbacks].sort(),
  );
  assert.deepEqual(
    [...seen((fixture) => fixture.expected.suspend)].sort(),
    [...INCIDENT_OUTCOMES.values()].sort(),
  );
  for (const harness of ['claude', 'codex', 'portable']) {
    assert.ok(
      fixtures.some((fixture) => fixture.harness === harness),
      `no ${harness} fixture`,
    );
  }
  const events = [
    ...seen((fixture) => fixture.expected.events.map((event) => JSON.stringify(event))),
  ];
  for (const outcome of ['capacity-exhausted', 'evidence-gap', 'control-state-unpersistable']) {
    assert.ok(
      events.some((event) => event.includes(`"pilotControlOutcome":"${outcome}"`)),
      `no fixture exercises a ${outcome} envelope`,
    );
  }
  for (const needle of ['"operation":"suspend"', '"capture-independent-new-work"']) {
    assert.ok(
      events.some((event) => event.includes(needle)),
      `no fixture emits ${needle}`,
    );
  }
  assert.ok(fixtures.some((fixture) => fixture.finalizeResult === 'lost-response'));
  assert.ok(
    fixtures.some(
      (fixture) =>
        fixture.expected.generationState === 'none' &&
        MEASURED_STATES.has(fixture.expected.persistedGenerationState) &&
        fixture.expected.operations.includes('start') &&
        fixture.expected.suspend.length > 0,
    ),
    'no fixture suspends the inventory-proven generation after a failed start',
  );
  assert.ok(
    fixtures.some((fixture) => fixture.packets.some((p) => p.scopeGrowth === 'authorized')),
  );
  for (const operation of ['start', 'begin-review']) {
    assert.ok(
      fixtures.some((fixture) => (fixture.external ?? []).some((a) => a.operation === operation)),
      `no fixture replays a concurrent ${operation}`,
    );
  }
});

// --- Workflow text --------------------------------------------------------------------------

// Invariant: the run-level diff baseline stays the last act of step 0, and everything the pilot
// adds (pointers, per-packet state, packet snapshot) follows it. The packet snapshot is a
// separate artifact, so no Phase 2 text after step 0 may call anything a diff baseline.
test('build keeps step 0 intact and places the per-packet state and pointers after it', () => {
  const step0 = section(phase2, '0. Read the deferred `worktree-integration`', '\n```lazy-include');
  assert.match(flat(step0), /Last, capture the diff baseline per "Diff baseline"\.\s*$/);
  ordered(
    phase2,
    'Last, capture the',
    '```lazy-include\nexecution-profiles\n',
    '```lazy-include\npilot-measurement-workflow\n',
    '**Per-packet state.**',
    '1. Start the appropriate implementer skill',
    '2. Check for the done protocol',
    '3. Check the result against the requirements',
    '4. **Fast→Quality transition.**',
  );
  const state = flat(section(phase2, '**Per-packet state.**', '\n1. Start'));
  for (const clause of [
    'packet-to-path ownership map',
    'native profile-capability result',
    'coupling group',
    'four-field decision envelope',
    'decision-map `fallback`',
    '`fastAttemptConsumed`',
    '`pilotControlOutcome`',
    'never select a profile per file',
    'Run the workflow-record preflight before the first implementation spawn; a reserved selection never changes',
    'Only when the preflight proves a `baseline` or `active` generation, capture a freshly rooted **packet snapshot**',
    'for attribution and retained-state transfer only',
    "every exit applies the fragment's finalization",
  ]) {
    assert.ok(state.includes(clause), `per-packet state is missing: ${clause}`);
  }
  // The classification order and its gates are fragment policy; the always-loaded body keeps only
  // the state it must hold and the pointers, so it restates neither.
  for (const moved of [
    'Coupled packets share Quality',
    '`unclear-ownership`',
    'ordered exclusion gate',
  ]) {
    assert.ok(!state.includes(moved), `per-packet state must not restate: ${moved}`);
  }
  const reservation = flat(section(fragment, '### Reservation', '### Packet timing'));
  for (const clause of [
    'Classify every initial packet completely before `start`, in this order: the native capability check, the packet snapshot gate, coupling, and the ordered exclusion gate',
    'pre-existing unattributable dirtiness in an allowed Fast path is `unclear-ownership`',
    'Coupled packets share Quality; disjoint packets may mix profiles only with explicit nonoverlapping ownership and resolved dependencies',
  ]) {
    assert.ok(reservation.includes(clause), `the fragment reservation is missing: ${clause}`);
  }
  assert.doesNotMatch(
    section(phase2, '**Per-packet state.**'),
    /diff baseline/i,
    'the packet snapshot is never called a diff baseline',
  );
});

// Invariant: Fast is requested only for a packet's first attempted spawn, pre-spawn
// unavailability is a gate exclusion rather than a fallback, and a consumed Fast attempt makes
// exactly one retained-state Quality continuation that never resets packet identity or scope.
test('build selects Fast only for the first attempt and transitions to Quality exactly once', () => {
  const step1 = flat(section(phase2, '1. Start the appropriate implementer skill', '\n2. Check'));
  assert.match(step1, /The Quality selector is the default/);
  assert.match(
    step1,
    /only the first attempted spawn of a packet whose envelope selects `fast`, and `fastAttemptConsumed` is set immediately before that call/,
  );
  // Pre-spawn unavailability and the force variable are execution-profile policy, loaded on demand
  // by the same step; the always-loaded body does not repeat them.
  assert.doesNotMatch(phase2, /CLAUDE_CODE_SUBAGENT_MODEL_FORCE|excluded\(profile-unavailable\)/);
  const policy = flat(source('src/shared/execution-profiles.md'));
  assert.match(
    policy,
    /`CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is present: detect presence only and never read, relay, or persist its value/,
  );
  assert.match(
    policy,
    /A Fast spawn that was actually attempted but rejected consumes the sole attempt, records `spawn-rejected`/,
  );
  assert.match(
    policy,
    /Portable is Quality-only and unmeasured in V1: it evaluates no gate and records no reason/,
  );

  assert.match(
    flat(section(phase2, '2. Check for the done protocol', '\n3. ')),
    /One keyword-less resume is the same delegation; every retry is a new Quality spawn/,
  );
  assert.match(
    flat(section(phase2, '3. Check the result', '\n4. ')),
    /For a packet whose Fast attempt returned without a fallback, repairing a mismatch is its single `requirements-mismatch` transition of step 4, before `finish-packet`\. Every other mismatch, including one after a fallback's Quality continuation, is a Quality correction round through the routed Quality implementer after `finish-packet`; each packet has at most one Fast→Quality transition/,
  );

  const transition = flat(section(phase2, '4. **Fast→Quality transition.**'));
  for (const clause of [
    'Each of the eight post-attempt fallbacks consumes Fast and causes exactly one transition',
    'revalidate the receipt',
    'routed Quality implementer in the same checkout from the retained dirty state',
    'The worktree stays `active`',
    'packet identity, scope, receipt, and Fast-consumed state never reset',
    'a Quality failure never returns to Fast',
    'After `missing-context`, `scope-growth`, or `new-decision` the continuation first only inspects',
    'waits for orchestrator or user approval',
    'authorized growth stays in that packet',
    'Never append genuinely independent new work',
    'future-work issue, or as a new plan without an issue tracker',
    '`Fast consumed; no second Fast attempt`',
    'it carries no pilot capability',
    'moves an owned `active` worktree to `failed` only while receipt and runtime guards pass',
    'report that no safe transition was possible',
  ]) {
    assert.ok(transition.includes(clause), `the transition is missing: ${clause}`);
  }
});

// Invariant: no correction seam after Phase 2 (validator, review, final validator, conflict,
// retry, completion) can reach a Fast worker; each names the routed Quality implementer.
test('every correction seam after the initial phase is Quality-only', () => {
  const phase5 = flat(section(build, '### Phase 5: Validation', '### Phase 6: Review'));
  assert.doesNotMatch(phase5, /fix them directly/);
  assert.match(
    phase5,
    /If errors are found: delegate the repair to the routed Quality implementer/,
  );

  const phase6 = flat(section(build, '### Phase 6: Review', '### Phase 7: Completion'));
  assert.match(phase6, /one automatic incorporation pass through the routed Quality implementer/);
  assert.match(
    phase6,
    /`current-scope`: correct or safely contain it now through the routed Quality implementer/,
  );

  const phase7 = flat(section(build, '### Phase 7: Completion', '\n## Rules'));
  assert.match(
    phase7,
    /one last time as a final check; repair a failure through the routed Quality implementer/,
  );

  const rules = flat(section(build, '\n## Rules'));
  assert.match(
    rules,
    /Every correction after the initial implementation phase – requirements, validator, review, final-validator, conflict-resolution, retry, and bounded completion corrections – is Quality-only/,
  );
  for (const later of [phase5, phase6, phase7, rules]) {
    assert.doesNotMatch(later, /AGENT_PROFILE|\bfast\b/i, 'no later phase may request Fast');
  }
});

// Invariant: a reserved pilot record is finalized exactly once before the completion report, and
// build never calls the confirmed Guided lifecycle operations itself.
test('build finalizes a reserved record once and never drives the generation lifecycle', () => {
  const phase7 = section(build, '### Phase 7: Completion', '\n## Rules');
  ordered(
    phase7,
    'Run the worktree-record exit self-check.',
    '8. If Phase 2 reserved a pilot record, finalize it exactly once per the loaded `pilot-measurement-workflow` fragment',
    '9. Summarize what was implemented',
    '10. Emit the next-step block',
  );
  for (const operation of ['begin-baseline', 'activate', 'resume']) {
    assert.doesNotMatch(build, new RegExp(`\`${operation}\``), `build must not name ${operation}`);
  }
  assert.match(
    flat(fragment),
    /A workflow run never calls `begin-baseline`, `activate`, or `resume`\. Those three are confirmed Guided setup actions\./,
  );
  assert.equal(
    fragment.match(/`(?:begin-baseline|activate|resume)`/g).length,
    4,
    'the fragment names the lifecycle operations only to exclude them, plus the Guided resume',
  );
});

// Invariant: the fragment's documented payloads are exactly the shapes the shipped helper accepts,
// preflight fails closed without mutation, and no capability or identifier leaves transient state.
test('the workflow-record fragment pins the helper contract, wire mapping, and privacy', () => {
  const text = flat(fragment);
  assert.match(
    text,
    /with the operation as the sole positional argument and exactly one JSON object/,
  );
  assert.match(text, /Never scrape standard error, never interpolate operational prose/);
  assert.match(
    text,
    /Never write them to the wisdom file, chat, a worker handoff, a retained-state continuation, a commit, a pull request, or any tracked artifact/,
  );
  assert.match(text, /Every report about the pilot is value-free/);

  const preflight = flat(section(fragment, '### Preflight', '### Reservation'));
  assert.match(
    preflight,
    /Disabled or invalid selects `eligibility=not-evaluated \+ selectedProfile=quality` for every packet and calls no pilot operation/,
  );
  assert.match(
    preflight,
    /With `configState=enabled`, an \*\*unmeasured run\*\* holds no usable generation: every packet takes `generationState=none` with `not-evaluated \+ quality`, the legal `no-generation` row, runs Quality without Fast, and is never recorded\. A portable build, an ambiguous or failed inventory, and a failed `start` each make the run unmeasured/,
  );
  assert.match(
    preflight,
    /That `generationState=none` is the run's effective envelope, not a claim about the persisted generation: the orchestrator keeps an inventory-proven persisted state separately as the target of an incident's `suspend`/,
  );
  assert.match(
    flat(source('src/shared/execution-profiles.md')),
    /An unmeasured run takes `generationState=none` as its effective envelope, not as a claim about the persisted generation; the orchestrator keeps an inventory-proven persisted state separately as the incident suspension target/,
  );
  assert.match(
    preflight,
    /This installation is the `\{\{BUILD_TARGET\}\}` build, fixed when it was built\. `claude` and `codex` are the harness family\. A `portable` build is an unmeasured run whatever host executes it: it calls no pilot operation, reads no inventory, and records nothing/,
  );
  assert.match(
    preflight,
    /`none`, `suspended`, and `review` select `not-evaluated \+ quality` and reserve nothing/,
  );
  assert.match(
    preflight,
    /An ambiguous or failed inventory is an unmeasured run and calls no mutating operation/,
  );

  const reservation = section(fragment, '### Reservation', '### Packet timing');
  const blocks = jsonBlocks(reservation);
  assert.equal(blocks.length, 2);
  // The documented wire example is exactly the model's mapping, whose wires the helper replay sends.
  assert.deepEqual(blocks[0], wireOf('excluded(unclear-ownership)', 'quality'));
  assert.deepEqual(Object.keys(blocks[1]).sort(), [
    'configState',
    'generationId',
    'harnessFamily',
    'packets',
    'repositoryIdentity',
    'runtimeStateRoot',
    'workflow',
  ]);
  assert.equal(blocks[1].configState, 'enabled');
  assert.equal(blocks[1].workflow, 'build');
  assert.match(flat(reservation), /`firstReason` is `null` exactly for `eligible`/);
  assert.match(flat(reservation), /`not-evaluated` is never sent/);
  assert.match(flat(reservation), /Classify every initial packet completely before `start`/);
  assert.match(flat(reservation), /Never re-send `start`/);
  assert.match(
    flat(reservation),
    /makes `start` fail with `INCOMPLETE_EVIDENCE`, so admission is serialized/,
  );
  assert.match(
    flat(reservation),
    /Any failure creates no usable record: the run becomes an unmeasured run, the classification is discarded/,
  );
  assert.match(
    flat(reservation),
    /The inventory-proven persisted state stays known and remains the incident `suspend` target/,
  );

  const timing = section(fragment, '### Packet timing', '### Finalization');
  assert.deepEqual(Object.keys(JSON.parse(timing.match(/```json\n([\s\S]*?)```/)[1])).sort(), [
    'generationId',
    'packetCapability',
    'packetId',
    'repositoryIdentity',
    'runId',
    'runtimeStateRoot',
    'workflowCapability',
  ]);
  ordered(flat(timing), 'Call `start-packet` immediately before', 'Call `finish-packet` once');
  assert.match(
    flat(timing),
    /Never finish or restart the timer between the Fast attempt and that continuation/,
  );
  assert.match(flat(timing), /Close every reserved packet on every exit path/);
  assert.match(flat(timing), /Missing or incompatible data stays unavailable, never zero/);
  assert.match(
    flat(timing),
    /Known bias, awaiting a helper follow-up: the helper records that near-zero interval as an available duration, and counts such a packet reserved as `fast` as an attempted Fast packet without escalation/,
  );

  const finalization = section(fragment, '### Finalization', '### Incidents and pilot control');
  const payload = JSON.parse(finalization.match(/```json\n([\s\S]*?)```/)[1]);
  assert.deepEqual(Object.keys(payload).sort(), [
    'completionStatus',
    'detailOptIn',
    'generationId',
    'packets',
    'qualityCorrectionRounds',
    'repositoryIdentity',
    'review',
    'runId',
    'runtimeStateRoot',
    'trace',
    'validation',
    'workflowCapability',
  ]);
  assert.deepEqual(Object.keys(payload.packets[0]).sort(), [
    'costProxy',
    'escalated',
    'fallback',
    'packetCapability',
    'packetId',
  ]);
  assert.equal(payload.packets[0].costProxy, null);
  assert.equal(payload.detailOptIn, payload.trace !== null);
  const rules = flat(finalization);
  assert.match(rules, /`escalated` equals `fallback != "none"`/);
  assert.match(rules, /Never invent a cost source/);
  // The closed finalize values, as the helper validates them.
  assert.match(
    rules,
    /`value` is a canonical unsigned decimal string \(`0` or no leading zero, at most 39 digits\)/,
  );
  assert.equal(PILOT_MEASUREMENT_PROTOCOL.limits.maxCostValueDigits, 39);
  assert.match(
    rules,
    /`passed` needs `requiredCount > 0` and `satisfiedCount >= requiredCount`; `failed` needs `requiredCount > 0` and `satisfiedCount < requiredCount`; `not-required` needs `requiredCount` and `satisfiedCount` of `0`; `unavailable`, for a validation never reached, needs `satisfiedCount` of `0`/,
  );
  assert.match(rules, /with neither `requiredCount` nor `satisfiedCount` above `totalCount`/);
  assert.match(
    rules,
    /`review\.status` is `completed` with the aggregated severity counts, `not-run` when no reviewer started, or `unavailable` when not reached\. A status other than `completed` sends all three severity counts as `0`/,
  );
  const statuses = (name) => [...rules.matchAll(new RegExp(`\`(${name})\``, 'g'))];
  for (const value of PILOT_MEASUREMENT_PROTOCOL.enums.validationStatuses) {
    assert.ok(statuses(value).length > 0, `validation status ${value} is documented`);
  }
  for (const value of PILOT_MEASUREMENT_PROTOCOL.enums.reviewStatuses) {
    assert.ok(statuses(value).length > 0, `review status ${value} is documented`);
  }
  assert.match(
    rules,
    /a missing outcome maps to `failed`, and `abandoned` is reserved to reconciliation/,
  );
  assert.match(rules, /only with the user's explicit detailed-trace consent in the current run/);
  assert.match(rules, /Diffs, escalation detail, and handoff prose never enter it/);
  assert.match(rules, /A lost response may be re-sent once with the identical payload/);
});

// Invariant: each critical incident class maps to exactly one suspending pilot-control outcome,
// and a failed finalize can be reconciled only in the same run, by explicit confirmation.
test('incidents suspend one to one and a failed finalize offers one same-run reconciliation', () => {
  const incidents = section(
    fragment,
    '### Incidents and pilot control',
    '### Finalization failure',
  );
  const rows = [...incidents.matchAll(/^\| ([a-z ]+?)\s+\| `([a-z-]+)`\s+\|$/gm)].map(
    ([, incident, outcome]) => [incident, outcome],
  );
  assert.deepEqual(rows, [...INCIDENT_OUTCOMES]);
  for (const [, outcome] of rows) {
    const control = contract.controls.find((row) => row.outcome === outcome);
    assert.ok(control, `${outcome} must be a pilot-control outcome`);
    assert.notEqual(control.suspensionReason, 'none', `${outcome} must persist a suspension`);
    assert.equal(control.implementationFallback, 'none');
  }
  const text = flat(incidents);
  assert.match(text, /never reverts potentially user- or sibling-owned work automatically/);
  assert.match(text, /holds the current `runId` when a record exists and is empty otherwise/);
  assert.match(
    text,
    /Only an inventory-proven `baseline`, `active`, or `suspended` generation is suspended, also in an unmeasured run after a failed `start`/,
  );
  assert.match(
    text,
    /If `suspend` fails, report only a stable value-free alert, claim no persisted suspension/,
  );
  assert.match(
    text,
    /a scope incident may set both `scope-incident` and `critical-scope-incident`/,
  );
  assert.match(
    text,
    /report a suspension or incomplete evidence only when `controlStatePersisted` is `true`/,
  );
  assert.match(text, /never start a worker, and never change a successful product diff/);

  const failure = section(fragment, '### Finalization failure');
  const failureText = flat(failure);
  assert.match(
    failureText,
    /keeps every product change and calls `suspend` with `finalization-failed` and `\[runId\]`/,
  );
  assert.match(failureText, /It never becomes an implementation fallback/);
  const asks = [...failure.matchAll(/```ask\n([\s\S]*?)```/g)];
  assert.equal(asks.length, 1, 'reconciliation is offered by exactly one ask');
  assert.doesNotMatch(asks[0][1], /type: scored/, 'an irreversible choice stays unscored');
  ordered(
    failureText,
    'On **Reconcile**, read a fresh `inventory`',
    '`reconcile-record`',
    '`confirmation: true`',
  );
  assert.match(
    failureText,
    /A declined, unanswered, non-interactive, or failed reconciliation leaves the incomplete record in place/,
  );
  assert.match(failureText, /only through `discard-generation` or `purge`/);
  assert.match(failureText, /a reviewed generation never resumes/);
});

// Invariant: the token rule the fragment states is the rule the shipped helper enforces for every
// token slot of `finalize`: `costProxy.kind` and `unit`, and the trace's `role`, `id`, and
// `category`. Each sample carries the verdict the stated rule gives it.
test('the fragment token rule matches the helper for every token slot', async () => {
  const rule = flat(section(fragment, '### Finalization', '### Incidents and pilot control'));
  assert.match(
    rule,
    /A token is lowercase `\[a-z0-9\._-\]`, starts and ends alphanumeric, has at most 128 characters, and holds no credential-like material\. The rule covers `costProxy\.kind` and `unit` and the trace's `role`, `id`, and `category`/,
  );
  assert.equal(PILOT_MEASUREMENT_PROTOCOL.limits.maxTokenBytes, 128);
  const samples = [
    ['usd', true],
    ['7', true],
    ['input.tokens_v2-total', true],
    ['a'.repeat(128), true],
    ['USD', false],
    ['Usd', false],
    ['-usd', false],
    ['usd.', false],
    ['us d', false],
    ['a'.repeat(129), false],
    ['api-key', false],
    ['', false],
  ];
  const accepted = samples.filter(([, ok]) => ok).map(([value]) => value);
  const rejected = samples.filter(([, ok]) => !ok).map(([value]) => value);

  const rt = await cloneTemplate('baseline');
  const scoped = { ...rt.common, generationId: rt.generationId };
  const reservation = (
    await rt.call('start', {
      ...scoped,
      configState: 'enabled',
      workflow: 'build',
      harnessFamily: 'claude',
      packets: accepted.map(() => quality(true)),
    })
  ).result;
  for (const packet of reservation.packets) {
    const identity = {
      ...scoped,
      runId: reservation.runId,
      workflowCapability: reservation.workflowCapability,
      packetId: packet.packetId,
      packetCapability: packet.packetCapability,
    };
    await rt.call('start-packet', identity);
    rt.advance(10);
    await rt.call('finish-packet', identity);
  }
  const trace = (value) => ({
    roles: [{ role: value, profile: 'quality' }],
    requirements: [{ id: value, status: 'completed' }],
    checks: [{ id: value, outcome: 'passed', durationMs: 5 }],
    findings: [
      { id: value, severity: 'note', status: 'resolved', category: value, path: 'a.mjs', line: 1 },
    ],
  });
  const finalize = (costProxies, detail) => ({
    ...scoped,
    runId: reservation.runId,
    workflowCapability: reservation.workflowCapability,
    packets: reservation.packets.map(({ packetId, packetCapability }, index) => ({
      packetId,
      packetCapability,
      fallback: 'none',
      escalated: false,
      costProxy: costProxies[index],
    })),
    validation: { status: 'passed', requiredCount: 1, totalCount: 1, satisfiedCount: 1 },
    review: { status: 'completed', severityCounts: { critical: 0, important: 0, note: 0 } },
    completionStatus: 'completed',
    qualityCorrectionRounds: 0,
    detailOptIn: true,
    trace: detail,
  });
  const valid = { kind: 'usd', unit: 'usd', value: '1' };
  const costs = (proxy) => accepted.map(() => proxy);
  for (const value of rejected) {
    for (const [slot, input] of [
      ['costProxy.kind', finalize(costs({ ...valid, kind: value }), trace('usd'))],
      ['costProxy.unit', finalize(costs({ ...valid, unit: value }), trace('usd'))],
    ]) {
      await expectFailure(rt.call('finalize', input), 'INVALID_PAYLOAD', `${slot}: ${value}`);
    }
    for (const [slot, [list, field]] of Object.entries({
      'trace role': ['roles', 'role'],
      'trace requirement id': ['requirements', 'id'],
      'trace check id': ['checks', 'id'],
      'trace finding id': ['findings', 'id'],
      'trace finding category': ['findings', 'category'],
    })) {
      const detail = trace('usd');
      detail[list][0][field] = value;
      await expectFailure(
        rt.call('finalize', finalize(costs(valid), detail)),
        'INVALID_PAYLOAD',
        `${slot}: ${value}`,
      );
    }
  }
  const detail = {
    roles: accepted.map((value) => ({ role: value, profile: 'quality' })),
    requirements: accepted.map((value) => ({ id: value, status: 'completed' })),
    checks: accepted.map((value) => ({ id: value, outcome: 'passed', durationMs: 5 })),
    findings: accepted.map((value, index) => ({
      id: value,
      severity: 'note',
      status: 'resolved',
      category: value,
      path: 'a.mjs',
      line: index + 1,
    })),
  };
  const proxies = accepted.map((value) => ({ kind: value, unit: value, value: '0' }));
  const { result } = await rt.call('finalize', finalize(proxies, detail));
  assert.equal(result.status, 'finalized');
});
