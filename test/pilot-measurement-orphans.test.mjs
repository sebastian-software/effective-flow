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
  writeFileSync,
} from 'node:fs';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  PILOT_MEASUREMENT_OPERATIONS,
  canonicalDigest,
  executeOperation,
} from '../src/scripts/pilot-measurement-core.mjs';
import {
  PILOT_MEASUREMENT_PROTOCOL_DIGEST,
  PILOT_MEASUREMENT_PROTOCOL_VERSION,
  canonicalizeJson,
} from '../src/scripts/pilot-measurement-protocol.mjs';

// Orphaned-reservation contract of the pilot measurement helper: a later cleanup session, which
// holds no run capability, lists open workflow reservations with their owner's liveness and age and
// abandons one only after confirmation, while its record is unchanged and its process is proven
// gone or the reservation is older than 24 hours.

const HOUR_MS = 3_600_000;
const OWNER_PID = 4242;
const OWNER_START = 77;
const BOOT_ID = '0f3c5a5e-7d2b-4c1e-9a8b-1234567890ab';
const PID_NAMESPACE = 'pid:[4026531836]';
const PROTOCOL_1_2_DIGEST =
  'sha256:a39232140a24ffcfb95f1165cea2343e4593c32dc3594ef81a6d9295505b099c';
// The exact reservation shape protocol 1.3.0 shipped with (release 1.77.0): a helper of that
// release rejects any other key, so the orphan check adds none.
const PACKAGE_A_RESERVATION_KEYS = [
  'cohort',
  'configState',
  'generationId',
  'generationState',
  'harnessFamily',
  'installKind',
  'kind',
  'ordinal',
  'overlapFlag',
  'ownerDigest',
  'ownerSalt',
  'packets',
  'protocolDigest',
  'reservedAt',
  'runId',
  'schema',
  'workflow',
  'workflowCapabilityHash',
];
// The lifecycle-lock operations a 1.77.0 helper accepts in a lock record or a staged lock.
const PACKAGE_A_LOCK_OPERATIONS = [
  'activate',
  'start',
  'pilot-control',
  'finalize',
  'start-gate-observation',
  'finalize-gate-observation',
  'suspend',
  'record-incident',
  'begin-review',
  'resume',
  'reconcile-record',
  'aggregate',
  'purge',
  'discard-generation',
];

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

// A `/proc/<pid>/stat` line whose field 4 is the parent pid `parent` and field 22 the start time
// `start`.
function procStat(pid, start, parent = 0) {
  const fields = Array.from({ length: 30 }, () => '0');
  fields[0] = 'S';
  fields[1] = String(parent);
  fields[19] = String(start);
  return `${pid} (node) ${fields.join(' ')}`;
}

// A process table: pid → start time, with optional parents: pid → parent pid. Pid 1 is always
// visible, as on an unhidden procfs.
function processes(table, parents = {}) {
  const all = { 1: 1, ...table };
  return {
    listProcessIds: () => Object.keys(all),
    readProcStat: (pid) => {
      if (!Object.hasOwn(all, pid)) throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      return procStat(pid, all[pid], parents[pid] ?? 0);
    },
    kill: (pid) => {
      if (!Object.hasOwn(all, pid)) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
    },
  };
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'effective-flow-pilot-orphans-'));
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
    // One kernel boot and one pid namespace, shared by the reserving and the cleanup session.
    readBootId: () => `${BOOT_ID}\n`,
    readPidNamespace: () => PID_NAMESPACE,
    // procfs is this helper's own: `/proc/self` names its pid.
    readProcSelf: () => String(process.pid),
    ownerPid: OWNER_PID,
    ownerPidStartTime: OWNER_START,
    harnessQualificationPath: join(root, 'absent-fast-harness-qualification.json'),
    // The owning session is live unless a test replaces the process table.
    ...processes({ [OWNER_PID]: OWNER_START }),
  };
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, deps, clock, common: { runtimeStateRoot: root, repositoryIdentity } };
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

async function startWorkflow(fx, generationId, deps = fx.deps) {
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
        packets: [
          {
            selectedProfile: 'quality',
            wouldBeFastEligible: true,
            gate: { eligibility: 'eligible', firstReason: null },
          },
        ],
      },
      deps,
    )
  ).result;
}

function recordsDirectory(fx, generationId) {
  return join(fx.root, '.effective-flow/model-tiering-pilot/generations', generationId, 'records');
}

function readRecord(fx, generationId, runId) {
  return JSON.parse(
    readFileSync(join(recordsDirectory(fx, generationId), `${runId}.json`), 'utf8'),
  );
}

async function list(fx, deps = fx.deps) {
  return (await executeOperation('list-reservations', fx.common, deps)).result;
}

function abandonInput(fx, generationId, item, basis = { proof: 'process-dead' }) {
  return {
    ...fx.common,
    generationId,
    itemId: item.itemId,
    recordDigest: item.recordDigest,
    confirmation: true,
    ...basis,
  };
}

async function rejectionCode(operation, input, deps) {
  try {
    await executeOperation(operation, input, deps);
  } catch (error) {
    return error.code;
  }
  assert.fail(`${operation} was expected to fail`);
}

async function inventory(fx, generationId) {
  return (await executeOperation('inventory', { ...fx.common, generationId }, fx.deps)).result;
}

async function activateUnmet(fx, generationId) {
  const result = (
    await executeOperation(
      'activate',
      {
        ...fx.common,
        generationId,
        configState: 'enabled',
        protocolVersion: PILOT_MEASUREMENT_PROTOCOL_VERSION,
        protocolDigest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
      },
      fx.deps,
    )
  ).result;
  return result.unmet ?? [];
}

function generationRoot(fx, generationId) {
  return join(fx.root, '.effective-flow/model-tiering-pilot/generations', generationId);
}

function readJson(target) {
  return JSON.parse(readFileSync(target, 'utf8'));
}

function writeJson(target, value) {
  writeFileSync(target, `${canonicalizeJson(value)}\n`);
}

// Rewrites a generation's state and records as protocol 1.2.0 (releases 1.68.0 through 1.76.0)
// persisted them: no qualification snapshot, install kind, owner, or overlap fields.
function persistUnderProtocol12(fx, generationId) {
  const root = generationRoot(fx, generationId);
  const legacy = (value) => {
    const {
      harnessQualification,
      installKind,
      overlapped,
      ownerSalt,
      ownerDigest,
      reservedAt,
      overlapFlag,
      ...rest
    } = value;
    return { ...rest, schema: value.kind === 'pilot-generation-state' ? 1 : 2 };
  };
  writeJson(join(root, 'state.json'), {
    ...legacy(readJson(join(root, 'state.json'))),
    protocolVersion: '1.2.0',
    protocolDigest: PROTOCOL_1_2_DIGEST,
  });
  for (const name of readdirSync(join(root, 'records'))) {
    const target = join(root, 'records', name);
    writeJson(target, { ...legacy(readJson(target)), protocolDigest: PROTOCOL_1_2_DIGEST });
  }
}

function packetInput(fx, generationId, reservation, packet = reservation.packets[0]) {
  return {
    ...fx.common,
    generationId,
    runId: reservation.runId,
    packetId: packet.packetId,
    workflowCapability: reservation.workflowCapability,
    packetCapability: packet.packetCapability,
  };
}

function timingReceipts(fx, generationId) {
  return readdirSync(recordsDirectory(fx, generationId)).filter((name) =>
    name.endsWith('.timing.json'),
  );
}

test('the helper exposes the read-only listing and the confirmed abandonment', () => {
  assert.ok(PILOT_MEASUREMENT_OPERATIONS.includes('list-reservations'));
  assert.ok(PILOT_MEASUREMENT_OPERATIONS.includes('abandon-reservation'));
});

test('the listing classifies liveness and staleness and exposes no run identity', async (t) => {
  const fx = fixture(t);
  assert.deepEqual(await list(fx), {
    generationId: null,
    generationStatus: 'absent',
    staleAfterHours: 24,
    reservations: [],
  });
  const { generationId } = await beginBaseline(fx);
  const reservation = await startWorkflow(fx, generationId);
  const stored = readRecord(fx, generationId, reservation.runId);
  // The stored reservation keeps exactly the 1.3.0 shape; the host binding lives in the salt, which
  // keeps the opaque form a 1.77.0 helper validates. This owner has no readable parent, so the salt
  // binds no ancestor.
  assert.deepEqual(Object.keys(stored).sort(), PACKAGE_A_RESERVATION_KEYS);
  assert.match(stored.ownerSalt, /^[A-Za-z0-9_-]{32,128}$/);
  assert.equal(stored.ownerSalt.length, 54);
  assert.equal(
    stored.ownerDigest,
    canonicalDigest({
      salt: stored.ownerSalt,
      hostname: 'fixture-host',
      pid: OWNER_PID,
      pidStartTime: OWNER_START,
    }),
  );
  assert.equal(JSON.stringify(stored).includes(BOOT_ID), false);
  assert.equal(JSON.stringify(stored).includes('4026531836'), false);

  const live = await list(fx);
  assert.equal(live.generationStatus, 'present');
  assert.equal(live.protocolCurrent, true);
  assert.equal(live.reservations.length, 1);
  const [item] = live.reservations;
  assert.deepEqual(Object.keys(item).sort(), [
    'ageMs',
    'itemId',
    'liveness',
    'proof',
    'recordDigest',
    'reservedAt',
    'stale',
    'state',
    'workflow',
  ]);
  assert.equal(item.state, 'open');
  assert.match(item.itemId, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(
    [item.workflow, item.ageMs, item.stale, item.liveness, item.proof],
    ['build', 0, false, 'alive', null],
  );
  const serialized = JSON.stringify(live);
  for (const secret of [
    reservation.runId,
    reservation.workflowCapability,
    reservation.packets[0].packetId,
    reservation.packets[0].packetCapability,
  ]) {
    assert.equal(serialized.includes(secret), false);
  }

  const liveness = async (deps) => (await list(fx, { ...fx.deps, ...deps })).reservations[0];
  // Gone from the process table, or its pid now names a process with another start time.
  assert.deepEqual(
    [(await liveness(processes({ 999: 5 }))).liveness, (await liveness(processes({}))).proof],
    ['dead', 'process-dead'],
  );
  assert.equal((await liveness(processes({ [OWNER_PID]: OWNER_START + 1 }))).liveness, 'dead');
  // Another host, an unlisting or hiding procfs, and an unreadable live process prove nothing.
  assert.equal((await liveness({ hostname: () => 'other-host' })).liveness, 'unknown');
  assert.equal((await liveness({ hostname: () => 'bad host!' })).liveness, 'unknown');
  // A session sharing the host name but not the kernel boot (another machine of the same name, or
  // a reboot) or the pid namespace (a container) is another host: its pids name other processes,
  // so even an empty process table proves nothing.
  const elsewhere = [
    { readBootId: () => 'ffffffff-7d2b-4c1e-9a8b-1234567890ab' },
    { readPidNamespace: () => 'pid:[4026532999]' },
    {
      readBootId: () => {
        throw Object.assign(new Error('no procfs'), { code: 'ENOENT' });
      },
    },
    {
      readPidNamespace: () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
      },
    },
    { readBootId: () => 'not-a-boot-id' },
    { readPidNamespace: () => 'net:[4026531836]' },
    // A procfs whose `/proc/self` is not this helper belongs to another pid namespace.
    { readProcSelf: () => String(process.pid + 1) },
    {
      readProcSelf: () => {
        throw Object.assign(new Error('no procfs'), { code: 'ENOENT' });
      },
    },
  ];
  for (const deps of elsewhere) {
    const other = await liveness({ ...processes({}), ...deps });
    assert.deepEqual([other.liveness, other.proof], ['unknown', null]);
  }
  assert.equal(
    (
      await liveness({
        listProcessIds: () => {
          throw new Error('no procfs');
        },
      })
    ).liveness,
    'unknown',
  );
  assert.equal((await liveness({ listProcessIds: () => ['999'] })).liveness, 'unknown');
  assert.equal(
    (
      await liveness({
        listProcessIds: () => ['1', '999'],
        readProcStat: (pid) => (pid === 1 ? procStat(1, 1) : null),
        kill: () => {
          throw Object.assign(new Error('denied'), { code: 'EPERM' });
        },
      })
    ).liveness,
    'unknown',
  );

  fx.clock.wallMs += 24 * HOUR_MS;
  assert.equal((await list(fx)).reservations[0].stale, false);
  fx.clock.wallMs += 1;
  const stale = (await list(fx)).reservations[0];
  assert.deepEqual([stale.stale, stale.liveness, stale.ageMs], [true, 'alive', 24 * HOUR_MS + 1]);
  assert.equal(stale.itemId, item.itemId);
});

test('a reservation whose process is proven gone is abandoned after confirmation and blocks nothing', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await startWorkflow(fx, generationId);
  const other = await startWorkflow(fx, generationId, { ...fx.deps, ownerPid: 5151 });
  // The crashed run started its packet, so a timing receipt is left behind.
  const [packet] = reservation.packets;
  await executeOperation(
    'start-packet',
    {
      ...fx.common,
      generationId,
      runId: reservation.runId,
      packetId: packet.packetId,
      workflowCapability: reservation.workflowCapability,
      packetCapability: packet.packetCapability,
    },
    fx.deps,
  );
  const otherBefore = readRecord(fx, generationId, other.runId);
  const crashed = { ...fx.deps, ...processes({ 5151: OWNER_START }) };
  const listing = await list(fx, crashed);
  const item = listing.reservations.find(({ liveness }) => liveness === 'dead');
  assert.equal(listing.reservations.length, 2);
  assert.equal(item.proof, 'process-dead');

  const missing = abandonInput(fx, generationId, item);
  delete missing.confirmation;
  assert.equal(await rejectionCode('abandon-reservation', missing, crashed), 'INVALID_PAYLOAD');
  for (const changed of [
    { confirmation: false },
    { confirmStale: true },
    { proof: undefined },
    { proof: 'process-alive' },
    { recordDigest: 'not-a-digest' },
  ]) {
    const input = { ...abandonInput(fx, generationId, item), ...changed };
    if (input.proof === undefined) delete input.proof;
    assert.equal(await rejectionCode('abandon-reservation', input, crashed), 'INVALID_PAYLOAD');
  }

  const abandoned = await executeOperation(
    'abandon-reservation',
    abandonInput(fx, generationId, item),
    crashed,
  );
  assert.deepEqual(abandoned.result, {
    status: 'abandoned',
    itemId: item.itemId,
    basis: 'process-dead',
  });
  const record = readRecord(fx, generationId, reservation.runId);
  assert.equal(record.kind, 'workflow-record');
  assert.equal(record.completionStatus, 'abandoned');
  assert.deepEqual(
    record.packets.map(({ attempt }) => attempt),
    ['unknown'],
  );
  for (const field of ['ownerSalt', 'ownerDigest', 'reservedAt', 'overlapFlag']) {
    assert.equal(Object.hasOwn(record, field), false, field);
  }
  assert.deepEqual(
    readdirSync(recordsDirectory(fx, generationId)).filter((name) => name.endsWith('.timing.json')),
    [],
  );
  // The other run's reservation and the product files stay untouched.
  assert.deepEqual(readRecord(fx, generationId, other.runId), otherBefore);
  assert.equal(readFileSync(join(fx.root, 'source.txt'), 'utf8'), 'fixture\n');
  assert.equal(git(fx.root, 'status', '--porcelain'), '');

  // The drained abandoned record no longer lists, a repeated abandonment is idempotent and
  // changes nothing, and it no longer blocks.
  assert.deepEqual(
    (await list(fx, crashed)).reservations.map(({ itemId }) => itemId),
    listing.reservations.filter(({ itemId }) => itemId !== item.itemId).map(({ itemId }) => itemId),
  );
  const repeated = readRecord(fx, generationId, reservation.runId);
  assert.deepEqual(
    (await executeOperation('abandon-reservation', abandonInput(fx, generationId, item), crashed))
      .result,
    { status: 'abandoned', itemId: item.itemId, basis: 'already-abandoned' },
  );
  assert.deepEqual(readRecord(fx, generationId, reservation.runId), repeated);
  assert.equal((await inventory(fx, generationId)).busyCause, 'open-reservations');
  const [otherItem] = (await list(fx, crashed)).reservations;
  fx.clock.wallMs += 25 * HOUR_MS;
  const staleOther = (await list(fx, crashed)).reservations[0];
  assert.equal(staleOther.itemId, otherItem.itemId);
  await executeOperation(
    'abandon-reservation',
    abandonInput(fx, generationId, staleOther, { confirmStale: true }),
    crashed,
  );
  const afterward = await inventory(fx, generationId);
  assert.equal(afterward.busyCause, null);
  assert.equal(afterward.incompleteCounts.workflowRecords, 0);
  assert.equal(afterward.incompleteCounts.packetTimings, 0);
  assert.equal((await activateUnmet(fx, generationId)).includes('busy'), false);
});

test('a reservation older than 24 hours is abandoned after confirmed staleness even while live', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await startWorkflow(fx, generationId);
  fx.clock.wallMs += 24 * HOUR_MS + 1;
  const [item] = (await list(fx)).reservations;
  assert.deepEqual([item.liveness, item.stale, item.proof], ['alive', true, null]);
  assert.equal(
    await rejectionCode('abandon-reservation', abandonInput(fx, generationId, item), fx.deps),
    'INVALID_STATE',
  );
  const result = await executeOperation(
    'abandon-reservation',
    abandonInput(fx, generationId, item, { confirmStale: true }),
    fx.deps,
  );
  assert.equal(result.result.basis, 'stale');
  const record = readRecord(fx, generationId, reservation.runId);
  assert.equal(record.completionStatus, 'abandoned');
  assert.equal(Object.hasOwn(record, 'reservedAt'), false);
  // The still-live run finds its record terminal. Its packet operations fail NOT_FOUND, which names
  // a reservation that no longer exists, after its capability authenticated; finalize then
  // deduplicates and changes nothing.
  const packet = packetInput(fx, generationId, reservation);
  const closed = readRecord(fx, generationId, reservation.runId);
  assert.equal(await rejectionCode('start-packet', packet, fx.deps), 'NOT_FOUND');
  assert.equal(
    await rejectionCode('finish-packet', { ...packet, modelCompliance: 'not-applicable' }, fx.deps),
    'NOT_FOUND',
  );
  assert.equal(
    await rejectionCode(
      'start-packet',
      {
        ...packet,
        workflowCapability: `${reservation.workflowCapability.slice(0, -1)}${
          reservation.workflowCapability.endsWith('A') ? 'B' : 'A'
        }`,
      },
      fx.deps,
    ),
    'AUTHENTICATION_FAILED',
  );
  assert.deepEqual(readRecord(fx, generationId, reservation.runId), closed);
  assert.deepEqual(timingReceipts(fx, generationId), []);
  const finalized = await executeOperation(
    'finalize',
    {
      ...fx.common,
      generationId,
      runId: reservation.runId,
      workflowCapability: reservation.workflowCapability,
      packets: reservation.packets.map(({ packetId, packetCapability }) => ({
        packetId,
        packetCapability,
        fallback: 'none',
        escalated: false,
        costProxy: null,
      })),
      validation: { status: 'passed', requiredCount: 1, totalCount: 1, satisfiedCount: 1 },
      review: { status: 'completed', severityCounts: { critical: 0, important: 0, note: 0 } },
      completionStatus: 'completed',
      qualityCorrectionRounds: 0,
      detailOptIn: false,
      trace: null,
    },
    fx.deps,
  );
  // It reports the stored status: a cleanup session closed the run as stale, so its own outcome
  // was not recorded.
  assert.equal(finalized.result.status, 'abandoned');
  assert.equal(readRecord(fx, generationId, reservation.runId).completionStatus, 'abandoned');
});

test('abandonment refuses a live fresh reservation, a changed record, an unknown id, and a held lock', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await startWorkflow(fx, generationId);
  const before = readRecord(fx, generationId, reservation.runId);
  const [item] = (await list(fx)).reservations;
  // An `already-abandoned` proof never closes a still-open reservation either.
  for (const basis of [
    { proof: 'process-dead' },
    { confirmStale: true },
    { proof: 'already-abandoned' },
  ]) {
    assert.equal(
      await rejectionCode(
        'abandon-reservation',
        abandonInput(fx, generationId, item, basis),
        fx.deps,
      ),
      'INVALID_STATE',
    );
  }
  // An unknown owner is no proof either.
  assert.equal(
    await rejectionCode('abandon-reservation', abandonInput(fx, generationId, item), {
      ...fx.deps,
      hostname: () => 'other-host',
    }),
    'INVALID_STATE',
  );
  assert.equal(
    await rejectionCode(
      'abandon-reservation',
      { ...abandonInput(fx, generationId, item), itemId: `sha256:${'0'.repeat(64)}` },
      { ...fx.deps, ...processes({}) },
    ),
    'NOT_FOUND',
  );
  assert.deepEqual(readRecord(fx, generationId, reservation.runId), before);

  // A later start flags the overlap on the open reservation, which changes its record.
  const gone = { ...fx.deps, ...processes({ 5151: 1 }) };
  await startWorkflow(fx, generationId, { ...fx.deps, ownerPid: 5151, ownerPidStartTime: 1 });
  assert.equal(readRecord(fx, generationId, reservation.runId).overlapFlag, true);
  assert.equal(
    await rejectionCode('abandon-reservation', abandonInput(fx, generationId, item), gone),
    'STALE_REVIEW',
  );
  const fresh = (await list(fx, gone)).reservations.find(({ itemId }) => itemId === item.itemId);
  assert.equal(fresh.liveness, 'dead');

  const lock = join(
    fx.root,
    '.effective-flow/model-tiering-pilot/generations',
    generationId,
    'locks',
    'lifecycle.lock',
  );
  writeFileSync(
    lock,
    `${canonicalizeJson({
      schema: 1,
      operation: 'finalize',
      generationId,
      ownerPid: process.pid,
      nonce: 'N'.repeat(32),
    })}\n`,
  );
  assert.equal(
    await rejectionCode('abandon-reservation', abandonInput(fx, generationId, fresh), gone),
    'LOCKED',
  );
  rmSync(lock);
  await executeOperation('abandon-reservation', abandonInput(fx, generationId, fresh), gone);
  assert.equal(readRecord(fx, generationId, reservation.runId).completionStatus, 'abandoned');
});

test('a reservation a 1.77.0 helper wrote lists, and is abandonable only as stale', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await startWorkflow(fx, generationId);
  const target = join(recordsDirectory(fx, generationId), `${reservation.runId}.json`);
  // Release 1.77.0 stored a 24-byte salt without a host binding and the same owner digest.
  const ownerSalt = Buffer.alloc(24, 200).toString('base64url');
  const earlier = {
    ...readRecord(fx, generationId, reservation.runId),
    ownerSalt,
    ownerDigest: canonicalDigest({
      salt: ownerSalt,
      hostname: 'fixture-host',
      pid: OWNER_PID,
      pidStartTime: OWNER_START,
    }),
  };
  assert.deepEqual(Object.keys(earlier).sort(), PACKAGE_A_RESERVATION_KEYS);
  assert.equal(ownerSalt.length, 32);
  writeFileSync(target, `${canonicalizeJson(earlier)}\n`);
  const gone = { ...fx.deps, ...processes({}) };
  const [item] = (await list(fx, gone)).reservations;
  assert.deepEqual([item.state, item.liveness, item.stale], ['open', 'unknown', false]);
  assert.equal(
    await rejectionCode('abandon-reservation', abandonInput(fx, generationId, item), gone),
    'INVALID_STATE',
  );
  fx.clock.wallMs += 25 * HOUR_MS;
  const [stale] = (await list(fx, gone)).reservations;
  await executeOperation(
    'abandon-reservation',
    abandonInput(fx, generationId, stale, { confirmStale: true }),
    gone,
  );
  assert.equal(readRecord(fx, generationId, reservation.runId).completionStatus, 'abandoned');
  assert.equal(existsSync(target), true);
});

test('abandonment needs an existing namespace and generation and creates none', async (t) => {
  const fx = fixture(t);
  const input = {
    ...fx.common,
    generationId: 'G'.repeat(32),
    itemId: `sha256:${'1'.repeat(64)}`,
    recordDigest: `sha256:${'2'.repeat(64)}`,
    confirmation: true,
    proof: 'process-dead',
  };
  assert.equal(await rejectionCode('abandon-reservation', input, fx.deps), 'NOT_FOUND');
  assert.equal(existsSync(join(fx.root, '.effective-flow/model-tiering-pilot')), false);
  await beginBaseline(fx);
  assert.equal(await rejectionCode('abandon-reservation', input, fx.deps), 'NOT_FOUND');
});

test('staleness begins strictly after 24 hours: a confirmation at exactly 24 hours is refused', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await startWorkflow(fx, generationId);
  const before = readRecord(fx, generationId, reservation.runId);
  fx.clock.wallMs += 24 * HOUR_MS;
  const [item] = (await list(fx)).reservations;
  assert.deepEqual([item.ageMs, item.stale], [24 * HOUR_MS, false]);
  assert.equal(
    await rejectionCode(
      'abandon-reservation',
      abandonInput(fx, generationId, item, { confirmStale: true }),
      fx.deps,
    ),
    'INVALID_STATE',
  );
  // Nor does an unknown owner turn the boundary into proof.
  const unknown = { ...fx.deps, hostname: () => 'other-host' };
  assert.equal(
    await rejectionCode(
      'abandon-reservation',
      abandonInput(fx, generationId, item, { confirmStale: true }),
      unknown,
    ),
    'INVALID_STATE',
  );
  assert.deepEqual(readRecord(fx, generationId, reservation.runId), before);
  assert.equal((await activateUnmet(fx, generationId)).includes('busy'), true);
});

test('an owner recorded without a start time is alive while its pid exists and dead once gone', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await startWorkflow(fx, generationId, {
    ...fx.deps,
    ownerPidStartTime: undefined,
  });
  assert.equal(
    readRecord(fx, generationId, reservation.runId).ownerDigest,
    canonicalDigest({
      salt: readRecord(fx, generationId, reservation.runId).ownerSalt,
      hostname: 'fixture-host',
      pid: OWNER_PID,
      pidStartTime: null,
    }),
  );
  const liveness = async (deps) => (await list(fx, { ...fx.deps, ...deps })).reservations[0];
  // Without a recorded start time a reused pid cannot be told apart: any process there is alive.
  assert.equal((await liveness(processes({ [OWNER_PID]: OWNER_START + 9 }))).liveness, 'alive');
  const gone = await liveness(processes({ 999: 5 }));
  assert.deepEqual([gone.liveness, gone.proof], ['dead', 'process-dead']);
  // Only on the owner's host: another pid namespace proves nothing.
  assert.equal(
    (await liveness({ ...processes({}), readPidNamespace: () => 'pid:[4026532999]' })).liveness,
    'unknown',
  );
  await executeOperation('abandon-reservation', abandonInput(fx, generationId, gone), {
    ...fx.deps,
    ...processes({ 999: 5 }),
  });
  assert.equal(readRecord(fx, generationId, reservation.runId).completionStatus, 'abandoned');
});

test('a reservation whose host identity was unreadable when it was written is never dead', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  for (const unreadable of [
    {
      readPidNamespace: () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
      },
    },
    { readBootId: () => '' },
    { ownerPid: null },
    { readProcSelf: () => '1' },
  ]) {
    await startWorkflow(fx, generationId, { ...fx.deps, ...unreadable });
  }
  const { reservations } = await list(fx, { ...fx.deps, ...processes({}) });
  assert.equal(reservations.length, 4);
  for (const item of reservations) {
    assert.deepEqual([item.liveness, item.proof], ['unknown', null]);
    assert.equal(
      await rejectionCode('abandon-reservation', abandonInput(fx, generationId, item), {
        ...fx.deps,
        ...processes({}),
      }),
      'INVALID_STATE',
    );
  }
});

// A helper started through a wrapper: the recorded owner (OWNER_PID) is the short-lived shell, its
// parent WRAPPED_SHELL, then SESSION, then a process above the two recorded levels.
const WRAPPED_SHELL = 5000;
const SESSION = 6000;
const ABOVE = 7000;
const CHAIN_STARTS = { [OWNER_PID]: OWNER_START, [WRAPPED_SHELL]: 50, [SESSION]: 60, [ABOVE]: 70 };
const CHAIN_PARENTS = { [OWNER_PID]: WRAPPED_SHELL, [WRAPPED_SHELL]: SESSION, [SESSION]: ABOVE };

// The process table of the chain with only the `alive` members still running (each with its own
// start time unless `restarted` gives it another one).
function chain(alive, restarted = {}) {
  const table = {};
  for (const pid of alive) table[pid] = restarted[pid] ?? CHAIN_STARTS[pid];
  return processes(table, CHAIN_PARENTS);
}

test('a reservation made through a wrapper is never dead while a recorded ancestor lives', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reserving = { ...fx.deps, ...chain([OWNER_PID, WRAPPED_SHELL, SESSION, ABOVE]) };
  const reservation = await startWorkflow(fx, generationId, reserving);
  const stored = readRecord(fx, generationId, reservation.runId);
  // Two ancestors are bound: the salt keeps the opaque 1.3.0 form and the exact 1.3.0 shape.
  assert.deepEqual(Object.keys(stored).sort(), PACKAGE_A_RESERVATION_KEYS);
  assert.match(stored.ownerSalt, /^[A-Za-z0-9_-]{32,128}$/);
  assert.equal(stored.ownerSalt.length, 86);
  for (const pid of [WRAPPED_SHELL, SESSION, ABOVE]) {
    assert.equal(JSON.stringify(stored).includes(String(pid)), false);
  }
  const liveness = async (deps) => (await list(fx, { ...fx.deps, ...deps })).reservations[0];
  // Only the owner itself proves the session alive.
  assert.equal((await liveness(chain([OWNER_PID, WRAPPED_SHELL, SESSION]))).liveness, 'alive');
  assert.equal((await liveness(chain([OWNER_PID]))).liveness, 'alive');
  // The wrapper's shell is gone while the session above it runs: never dead, but not proven alive
  // either, since a live ancestor may as well be a long-lived parent of a session that ended.
  for (const alive of [
    [WRAPPED_SHELL, SESSION, ABOVE],
    [SESSION, ABOVE],
    [SESSION],
    [WRAPPED_SHELL],
  ]) {
    const item = await liveness(chain(alive));
    assert.deepEqual([item.liveness, item.proof], ['unknown', null]);
  }
  // A level above the two recorded ones, or a recorded pid that now names another process, proves
  // nothing alive.
  assert.equal((await liveness(chain([ABOVE]))).liveness, 'dead');
  assert.equal(
    (await liveness(chain([WRAPPED_SHELL, SESSION], { [WRAPPED_SHELL]: 51, [SESSION]: 61 })))
      .liveness,
    'dead',
  );
  // An ancestor still running but unreadable proves nothing either way.
  assert.equal(
    (
      await liveness({
        ...chain([SESSION]),
        readProcStat: (pid) => {
          if (pid === SESSION) throw Object.assign(new Error('denied'), { code: 'EACCES' });
          return chain([SESSION]).readProcStat(pid);
        },
        kill: () => {},
      })
    ).liveness,
    'unknown',
  );
  // Abandonment re-checks the whole chain under its lock: refused while an ancestor lives, done
  // once every recorded process is gone. The 24-hour stale path is the usual way out.
  const gone = await liveness(chain([]));
  assert.deepEqual([gone.liveness, gone.proof], ['dead', 'process-dead']);
  assert.equal(
    await rejectionCode('abandon-reservation', abandonInput(fx, generationId, gone), {
      ...fx.deps,
      ...chain([SESSION]),
    }),
    'INVALID_STATE',
  );
  const abandoned = await executeOperation(
    'abandon-reservation',
    abandonInput(fx, generationId, gone),
    { ...fx.deps, ...chain([ABOVE]) },
  );
  assert.equal(abandoned.result.basis, 'process-dead');
});

test('a direct call whose session ended under a long-lived parent reads unknown, never dead', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  // A direct call: the recorded owner is the session itself (SESSION here), its parent ABOVE a
  // long-lived process such as a terminal or a supervisor that outlives the session.
  const parents = { [SESSION]: ABOVE };
  const table = (alive) =>
    processes(Object.fromEntries(alive.map((pid) => [pid, CHAIN_STARTS[pid]])), parents);
  const reservation = await startWorkflow(fx, generationId, {
    ...fx.deps,
    ...table([SESSION, ABOVE]),
    ownerPid: SESSION,
    ownerPidStartTime: CHAIN_STARTS[SESSION],
  });
  const stored = readRecord(fx, generationId, reservation.runId);
  assert.deepEqual(Object.keys(stored).sort(), PACKAGE_A_RESERVATION_KEYS);
  assert.equal(stored.ownerSalt.length, 70);
  const listed = async (alive) => (await list(fx, { ...fx.deps, ...table(alive) })).reservations[0];
  assert.equal((await listed([SESSION, ABOVE])).liveness, 'alive');
  // The session crashed; its parent runs on. That is no proof of a dead session.
  const crashed = await listed([ABOVE]);
  assert.deepEqual([crashed.liveness, crashed.proof, crashed.stale], ['unknown', null, false]);
  assert.equal(
    await rejectionCode('abandon-reservation', abandonInput(fx, generationId, crashed), {
      ...fx.deps,
      ...table([ABOVE]),
    }),
    'INVALID_STATE',
  );
  // After 24 hours the stale path closes it.
  fx.clock.wallMs += 24 * HOUR_MS + 1;
  const stale = await listed([ABOVE]);
  assert.deepEqual([stale.liveness, stale.stale], ['unknown', true]);
  const result = await executeOperation(
    'abandon-reservation',
    abandonInput(fx, generationId, stale, { confirmStale: true }),
    { ...fx.deps, ...table([ABOVE]) },
  );
  assert.equal(result.result.basis, 'stale');
});

test('ancestors unreadable when the reservation is written are bound fewer, never guessed', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const full = chain([OWNER_PID, WRAPPED_SHELL, SESSION, ABOVE]);
  const hidden = (unreadable) => ({
    ...fx.deps,
    ...full,
    readProcStat: (pid) => {
      if (pid === unreadable) throw Object.assign(new Error('denied'), { code: 'EACCES' });
      return full.readProcStat(pid);
    },
  });
  const cases = [
    // The owner's own stat names no parent: nothing above it is bound.
    { deps: hidden(OWNER_PID), length: 54, alive: [] },
    // The parent's stat is unreadable: no start time, so it is not bound and the chain stops.
    { deps: hidden(WRAPPED_SHELL), length: 54, alive: [] },
    // The grandparent is unreadable: only the parent is bound.
    { deps: hidden(SESSION), length: 70, alive: [WRAPPED_SHELL] },
    // The parent runs in another pid namespace: its pid means nothing here.
    {
      deps: {
        ...fx.deps,
        ...full,
        readPidNamespace: (pid) => (pid === WRAPPED_SHELL ? 'pid:[4026532999]' : PID_NAMESPACE),
      },
      length: 54,
      alive: [],
    },
  ];
  for (const { deps, length, alive } of cases) {
    const reservation = await startWorkflow(fx, generationId, deps);
    const { ownerSalt } = readRecord(fx, generationId, reservation.runId);
    assert.equal(ownerSalt.length, length);
    const item = (await list(fx, { ...fx.deps, ...chain([SESSION, ABOVE]) })).reservations.find(
      ({ recordDigest }) =>
        recordDigest === canonicalDigest(readRecord(fx, generationId, reservation.runId)),
    );
    // An unbound process proves nothing alive: with the owner gone the reservation is dead, unless
    // a bound ancestor still runs, which makes it unknown.
    assert.equal(item.liveness, 'dead');
    for (const pid of alive) {
      const kept = (await list(fx, { ...fx.deps, ...chain([pid]) })).reservations.find(
        ({ itemId }) => itemId === item.itemId,
      );
      assert.equal(kept.liveness, 'unknown');
    }
    await executeOperation('abandon-reservation', abandonInput(fx, generationId, item), {
      ...fx.deps,
      ...chain([SESSION, ABOVE]),
    });
  }
  // A salt of any other length, such as a 1.77.0 salt or a truncated one, lists unknown.
  const reservation = await startWorkflow(fx, generationId, { ...fx.deps, ...full });
  const recordPath = join(recordsDirectory(fx, generationId), `${reservation.runId}.json`);
  const stored = readJson(recordPath);
  for (const ownerSalt of [stored.ownerSalt.slice(0, 32), stored.ownerSalt.slice(0, 80)]) {
    writeJson(recordPath, { ...stored, ownerSalt });
    const [item] = (await list(fx, { ...fx.deps, ...processes({}) })).reservations;
    assert.equal(item.liveness, 'unknown');
  }
});

test('a packet that never started cannot finish, and that is not NOT_FOUND', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await startWorkflow(fx, generationId);
  assert.equal(
    await rejectionCode(
      'finish-packet',
      { ...packetInput(fx, generationId, reservation), modelCompliance: 'not-applicable' },
      fx.deps,
    ),
    'INVALID_STATE',
  );
});

test('an abandonment whose receipt drain failed is listed as pending and finished by a repeat', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await startWorkflow(fx, generationId);
  await executeOperation('start-packet', packetInput(fx, generationId, reservation), fx.deps);
  const gone = { ...fx.deps, ...processes({}) };
  const [item] = (await list(fx, gone)).reservations;
  // The repository guard before the receipt unlink fails once the abandoned record is written.
  let armed = true;
  const faulting = {
    ...gone,
    runner: (call) => {
      if (
        armed &&
        call.args.includes('--show-toplevel') &&
        readRecord(fx, generationId, reservation.runId).kind === 'workflow-record'
      ) {
        armed = false;
        return { status: 128, stdout: '', stderr: 'injected', error: undefined };
      }
      return fx.deps.runner(call);
    },
  };
  const code = await rejectionCode(
    'abandon-reservation',
    abandonInput(fx, generationId, item),
    faulting,
  );
  assert.notEqual(code, undefined);
  assert.equal(armed, false);
  const abandoned = readRecord(fx, generationId, reservation.runId);
  assert.equal(abandoned.completionStatus, 'abandoned');
  assert.equal(timingReceipts(fx, generationId).length, 1);
  // The leftover receipt closes admission for every later run.
  assert.equal(
    await rejectionCode(
      'start',
      {
        ...fx.common,
        generationId,
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
      },
      fx.deps,
    ),
    'INCOMPLETE_EVIDENCE',
  );

  // Cleanup lists it as pending drain, with nothing to judge about its owner or age.
  const [pending] = (await list(fx, gone)).reservations;
  assert.deepEqual(pending, {
    itemId: item.itemId,
    state: 'pending-drain',
    workflow: 'build',
    reservedAt: null,
    ageMs: null,
    stale: false,
    liveness: null,
    proof: 'already-abandoned',
    recordDigest: canonicalDigest(abandoned),
  });
  // The listed item finishes the drain; the record itself stays as written.
  assert.deepEqual(
    (
      await executeOperation(
        'abandon-reservation',
        abandonInput(fx, generationId, pending, { proof: 'already-abandoned' }),
        fx.deps,
      )
    ).result,
    { status: 'abandoned', itemId: item.itemId, basis: 'already-abandoned' },
  );
  assert.deepEqual(readRecord(fx, generationId, reservation.runId), abandoned);
  assert.deepEqual(timingReceipts(fx, generationId), []);
  assert.deepEqual((await list(fx, gone)).reservations, []);
  assert.equal((await inventory(fx, generationId)).busyCause, null);
  await startWorkflow(fx, generationId);
});

test('an identical retry of an abandonment whose drain failed finishes it', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await startWorkflow(fx, generationId);
  await executeOperation('start-packet', packetInput(fx, generationId, reservation), fx.deps);
  const gone = { ...fx.deps, ...processes({}) };
  const [item] = (await list(fx, gone)).reservations;
  let armed = true;
  const faulting = {
    ...gone,
    runner: (call) => {
      if (
        armed &&
        call.args.includes('--show-toplevel') &&
        readRecord(fx, generationId, reservation.runId).kind === 'workflow-record'
      ) {
        armed = false;
        return { status: 128, stdout: '', stderr: 'injected', error: undefined };
      }
      return fx.deps.runner(call);
    },
  };
  await rejectionCode('abandon-reservation', abandonInput(fx, generationId, item), faulting);
  assert.equal(timingReceipts(fx, generationId).length, 1);
  const retried = await executeOperation(
    'abandon-reservation',
    abandonInput(fx, generationId, item),
    gone,
  );
  assert.equal(retried.result.basis, 'already-abandoned');
  assert.deepEqual(timingReceipts(fx, generationId), []);
  assert.equal((await inventory(fx, generationId)).incompleteCounts.packetTimings, 0);
});

test('abandon-reservation keeps an admission-changed receipt as that fallback', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const stateTarget = join(generationRoot(fx, generationId), 'state.json');
  writeJson(stateTarget, {
    ...readJson(stateTarget),
    generationState: 'active',
    activatedAt: new Date(fx.clock.wallMs).toISOString(),
  });
  const fast = {
    selectedProfile: 'fast',
    wouldBeFastEligible: true,
    gate: { eligibility: 'eligible', firstReason: null },
  };
  const reservation = (
    await executeOperation(
      'start',
      {
        ...fx.common,
        generationId,
        configState: 'enabled',
        workflow: 'fix',
        harnessFamily: 'codex',
        installKind: 'native',
        packets: [fast, fast],
      },
      fx.deps,
    )
  ).result;
  await executeOperation(
    'start-packet',
    { ...packetInput(fx, generationId, reservation), fallback: 'admission-changed' },
    fx.deps,
  );
  const gone = { ...fx.deps, ...processes({}) };
  const [item] = (await list(fx, gone)).reservations;
  assert.equal(item.workflow, 'fix');
  await executeOperation('abandon-reservation', abandonInput(fx, generationId, item), gone);
  const record = readRecord(fx, generationId, reservation.runId);
  assert.deepEqual(
    record.packets.map(({ attempt, fallback, escalated, modelCompliance }) => ({
      attempt,
      fallback,
      escalated,
      modelCompliance,
    })),
    [
      {
        attempt: 'unknown',
        fallback: 'admission-changed',
        escalated: false,
        modelCompliance: 'not-applicable',
      },
      { attempt: 'unknown', fallback: 'none', escalated: false, modelCompliance: 'unverified' },
    ],
  );
  assert.deepEqual(timingReceipts(fx, generationId), []);
});

test('a prior-protocol generation lists nothing and refuses abandonment with PROTOCOL_DRIFT', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await startWorkflow(fx, generationId);
  const [item] = (await list(fx)).reservations;
  persistUnderProtocol12(fx, generationId);
  const before = readRecord(fx, generationId, reservation.runId);
  const listing = await list(fx, { ...fx.deps, ...processes({}) });
  assert.deepEqual(
    [listing.generationStatus, listing.protocolCurrent, listing.reservations],
    ['present', false, []],
  );
  assert.equal(
    await rejectionCode('abandon-reservation', abandonInput(fx, generationId, item), {
      ...fx.deps,
      ...processes({}),
    }),
    'PROTOCOL_DRIFT',
  );
  assert.deepEqual(readRecord(fx, generationId, reservation.runId), before);
});

test('an abandonment holds its lock and stages its writes under names a 1.77.0 helper accepts', async (t) => {
  const fx = fixture(t);
  const { generationId } = await beginBaseline(fx);
  const reservation = await startWorkflow(fx, generationId);
  await executeOperation('start-packet', packetInput(fx, generationId, reservation), fx.deps);
  const gone = { ...fx.deps, ...processes({}) };
  const [item] = (await list(fx, gone)).reservations;
  const lockOperations = [];
  const temporaries = new Set();
  const observing = {
    ...gone,
    // The process-dead proof is re-verified under the lock, so the held lock is visible here.
    listProcessIds: () => {
      const lock = join(generationRoot(fx, generationId), 'locks', 'lifecycle.lock');
      if (existsSync(lock)) lockOperations.push(readJson(lock).operation);
      return gone.listProcessIds();
    },
    // The capacity check walks the generation tree while the record's temporary is staged.
    readdir: async (directory, options) => {
      const entries = await readdir(directory, options);
      for (const entry of entries) {
        if (entry.name.startsWith('.tmp-')) temporaries.add(entry.name);
      }
      return entries;
    },
  };
  await executeOperation('abandon-reservation', abandonInput(fx, generationId, item), observing);
  assert.deepEqual(lockOperations, ['reconcile-record']);
  assert.ok(PACKAGE_A_LOCK_OPERATIONS.includes(lockOperations[0]));
  assert.ok(temporaries.size > 0);
  for (const name of temporaries) {
    assert.match(name, new RegExp(`^\\.tmp-reconcile-record-${generationId}-`));
  }
});
