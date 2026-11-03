// Unit tests of the runtime-state helper's `review open-report` and `review write-report` against
// temporary Git repositories. `open-report` guards and creates `.effective-flow/review/`, allocates
// the local report path and reserves the report's finding IDs, reserving nothing when an earlier
// step fails. `write-report` additionally runs a missing directory migration in the same call,
// renders and creates the report and returns its summary; a failing migration reserves nothing,
// and after its reservation every failure is REPORT_WRITE_FAILED with the range and no report file.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import nodeFs from 'node:fs';
import { link as fsLink, mkdir as fsMkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';

import { executeOperation as mechanics } from '../src/scripts/effective-flow-mechanics-core.mjs';
import {
  LOCKS,
  MAX_STDIN_BYTES,
  executeOperation,
} from '../src/scripts/effective-flow-state-core.mjs';
import { MAX_REPORT_REALLOCATIONS } from '../src/scripts/effective-flow-state-review-core.mjs';
import { main } from '../src/scripts/effective-flow-state.mjs';
import { createProcessRunner } from '../src/scripts/process-runner.mjs';
import {
  LABELS,
  normaliseReportInput,
  renderReport,
} from '../src/scripts/review-report-render.mjs';

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
};
const OWNER = Object.freeze({ workflow: 'review' });
const INSTANT = Date.parse('2026-10-29T23:30:00Z');

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { env: GIT_ENV });
  assert.equal(result.status, 0, String(result.stderr));
  return String(result.stdout).trim();
}

function repository(t, { ignore = '.effective-flow/\n' } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-review-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q', '--initial-branch=main');
  writeFileSync(join(root, '.gitignore'), ignore);
  git(root, 'add', '.gitignore');
  git(root, 'commit', '-q', '-m', 'fixture');
  return root;
}

function deps(extra = {}) {
  return { runner: createProcessRunner(), env: GIT_ENV, now: () => INSTANT, ...extra };
}

async function migrate(root) {
  const envelope = await executeOperation(
    'memory migrate-directory',
    { cwd: root, owner: OWNER },
    deps(),
  );
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
}

function openReport(root, extra = {}, input = {}) {
  return executeOperation(
    'review open-report',
    { cwd: root, owner: OWNER, count: 3, ...input },
    deps(extra),
  );
}

function lastFindingNumber(root) {
  const target = join(root, '.effective-flow', 'memory.json');
  if (!existsSync(target)) return undefined;
  return JSON.parse(readFileSync(target, 'utf8')).lastFindingNumber;
}

// Invariant: in a fresh repository without `.effective-flow/review/`, one call creates the
// directory, returns a guarded absent report path and reserves the IDs; it writes no report.
test('open-report reserves IDs and returns a guarded path in a fresh repository', async (t) => {
  const root = repository(t);
  await migrate(root);
  assert.equal(existsSync(join(root, '.effective-flow', 'review')), false);
  const envelope = await openReport(root, { timeZone: 'UTC' });
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  const result = envelope.result;
  assert.equal(result.first, 1);
  assert.equal(result.last, 3);
  assert.equal(result.firstId, 'R-0000001');
  assert.equal(result.lastId, 'R-0000003');
  assert.equal(result.reportDate, '2026-10-29');
  assert.equal(result.reportName, 'review-report-2026-10-29.md');
  assert.equal(
    result.reportPath,
    join(root, '.effective-flow', 'review', 'review-report-2026-10-29.md'),
  );
  assert.ok(lstatSync(join(root, '.effective-flow', 'review')).isDirectory());
  assert.equal(existsSync(result.reportPath), false, 'the report itself is the caller’s to write');
  assert.equal(lastFindingNumber(root), 3);

  // A second report the same day takes the collision suffix and the next range.
  writeFileSync(result.reportPath, '# report\n');
  const second = (await openReport(root, { timeZone: 'UTC' }, { count: 1 })).result;
  assert.equal(second.reportName, 'review-report-2026-10-29-1.md');
  assert.equal(second.firstId, 'R-0000004');
});

// Invariant: the report date and name equal what `mechanics name-allocate` computes for the same
// clock and time zone, so prose and helper never disagree about a report's date.
test('open-report matches the mechanics allocation for the same clock and time zone', async (t) => {
  for (const timeZone of ['Pacific/Kiritimati', 'Etc/GMT+12', 'Europe/Berlin', undefined]) {
    const root = repository(t);
    await migrate(root);
    const allocated = await mechanics(
      'name-allocate',
      { cwd: root, dir: '.effective-flow/review', family: 'review-report-local' },
      { now: () => new Date(INSTANT), timeZone },
    );
    assert.equal(allocated.ok, true, JSON.stringify(allocated));
    const opened = await openReport(root, { timeZone });
    assert.equal(opened.ok, true, JSON.stringify(opened));
    assert.equal(opened.result.reportDate, allocated.data.date, String(timeZone));
    assert.equal(opened.result.reportName, allocated.data.name, String(timeZone));
    assert.equal(opened.result.reportPath, join(root, allocated.data.path));
  }
});

// Invariant: a layout that still needs `memory migrate-directory` is MIGRATION_REQUIRED before any
// directory is created or anything reserved.
test('open-report inherits MIGRATION_REQUIRED and creates nothing on an unmigrated layout', async (t) => {
  const root = repository(t);
  const outcome = await openReport(root);
  assert.equal(outcome.outcome?.code, 'MIGRATION_REQUIRED', JSON.stringify(outcome));
  assert.equal(existsSync(join(root, '.effective-flow')), false);
});

// Invariant: a held memory lock is the inherited LOCK_HELD outcome, and nothing is reserved.
test('open-report inherits LOCK_HELD and reserves nothing', async (t) => {
  const root = repository(t);
  await migrate(root);
  const held = await executeOperation(
    'lock acquire',
    { cwd: root, lock: 'memory', owner: { workflow: 'plan' } },
    deps(),
  );
  assert.equal(held.ok, true, JSON.stringify(held));
  const outcome = await openReport(root, {}, { waitSeconds: 0 });
  assert.equal(outcome.outcome?.code, 'LOCK_HELD', JSON.stringify(outcome));
  assert.equal(outcome.outcome.lock, 'memory');
  assert.equal(lastFindingNumber(root), undefined);
});

// Invariant: a failing directory guard or allocation reserves nothing, because the path is computed
// and guarded before the reserve transaction runs.
test('open-report reserves nothing when the directory guard or the allocation fails', async (t) => {
  const symlinked = repository(t);
  await migrate(symlinked);
  const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-elsewhere-')));
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }));
  symlinkSync(elsewhere, join(symlinked, '.effective-flow', 'review'));
  const unsafe = await openReport(symlinked);
  assert.equal(unsafe.error?.code, 'UNSAFE_TARGET', JSON.stringify(unsafe));
  assert.equal(lastFindingNumber(symlinked), undefined);

  const unignored = repository(t, { ignore: '.effective-flow/*\n!.effective-flow/review/\n' });
  await migrate(unignored);
  const refused = await openReport(unignored);
  assert.equal(refused.error?.code, 'RUNTIME_STATE_UNSAFE', JSON.stringify(refused));
  assert.equal(lastFindingNumber(unignored), undefined);

  const failing = repository(t);
  await migrate(failing);
  mkdirSync(join(failing, '.effective-flow', 'review'));
  const allocationFs = {
    ...nodeFs,
    lstatSync: () => {
      throw Object.assign(new Error('injected EIO'), { code: 'EIO' });
    },
  };
  const broken = await openReport(failing, { allocationFs });
  assert.equal(broken.ok, false, JSON.stringify(broken));
  assert.equal(lastFindingNumber(failing), undefined);
});

// Invariant: the input keys are closed, the owner is the `review` workflow, and the count is
// bounded, all before any Git call.
test('open-report rejects foreign keys, another workflow and a bad count', async (t) => {
  const root = repository(t);
  for (const input of [
    { dir: '.effective-flow/elsewhere' },
    { owner: { workflow: 'plan' } },
    { owner: { workflow: 'review', runId: 'x' } },
    { count: 0 },
    { count: 10_001 },
    { waitSeconds: 31 },
  ]) {
    const envelope = await openReport(root, {}, input);
    assert.equal(envelope.error?.code, 'INVALID_INPUT', JSON.stringify([input, envelope]));
  }
  assert.equal(existsSync(join(root, '.effective-flow')), false);
});

// ---------------------------------------------------------------------------------------------
// review write-report

function finding(extra = {}) {
  return {
    title: 'Unchecked null in parser',
    severity: 'Critical',
    complexity: 'Low',
    area: 'Backend',
    file: 'src/parse.js:42',
    problem: 'The parser dereferences a missing node.',
    recommendation: 'Check the node before use.',
    action: 'fix',
    admissionReason: 'material-harm',
    evidence: 'test reproduction',
    evidenceDigest: 'sha256:abc',
    currentReachability: 'any caller with empty input',
    rootCauseSignature: 'parse-null-deref',
    scopeAndContainment: 'outside the current scope',
    whyNow: 'crashes the CLI today',
    completionCondition: 'parse("") returns an empty tree',
    security: 'none',
    ...extra,
  };
}

function reportInput(root, extra = {}) {
  return {
    cwd: root,
    owner: OWNER,
    language: 'en',
    invocationPrefix: '/effective-flow',
    scope: 'Entire code',
    projectType: 'CLI',
    findings: [
      finding(),
      finding({ title: 'Token leak', file: 'src/auth.js:9', security: 'external' }),
    ],
    ...extra,
  };
}

function writeReport(root, extra = {}, input = {}) {
  return executeOperation(
    'review write-report',
    reportInput(root, input),
    deps({ timeZone: 'UTC', ...extra }),
  );
}

function reviewEntries(root) {
  const directory = join(root, '.effective-flow', 'review');
  return existsSync(directory) ? readdirSync(directory).sort() : [];
}

// The content the renderer produces for `input` with the given IDs, for a byte comparison.
function expectedReport(root, input, ids, date = '2026-10-29') {
  const { cwd: _cwd, owner: _owner, waitSeconds: _wait, ...content } = reportInput(root, input);
  return renderReport(normaliseReportInput(content), { ids, date });
}

// Invariant: in a fresh repository one call creates the report directory, reserves exactly one ID
// per finding, creates the rendered report byte for byte under the allocated name, and returns the
// reserve result with the path, name, date, IDs and a summary of every ID; no temporary file stays.
test('write-report reserves, renders and writes the report in a fresh repository', async (t) => {
  const root = repository(t);
  await migrate(root);
  const envelope = await writeReport(root);
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  const result = envelope.result;
  assert.equal(result.first, 1);
  assert.equal(result.last, 2);
  assert.equal(result.firstId, 'R-0000001');
  assert.equal(result.lastId, 'R-0000002');
  assert.deepEqual(result.ids, ['R-0000001', 'R-0000002']);
  assert.equal(result.reportDate, '2026-10-29');
  assert.equal(result.reportName, 'review-report-2026-10-29.md');
  assert.equal(result.reportPath, join(root, '.effective-flow', 'review', result.reportName));
  assert.equal(readFileSync(result.reportPath, 'utf8'), expectedReport(root, {}, result.ids));
  assert.equal(lstatSync(result.reportPath).mode & 0o777, 0o600);
  assert.deepEqual(reviewEntries(root), [result.reportName]);
  assert.equal(lastFindingNumber(root), 2);
  for (const id of result.ids) assert.ok(result.summary.includes(`[${id}]`), id);
  assert.ok(result.summary.includes(LABELS.en.withheld));
  assert.ok(!result.summary.includes('src/auth.js'), 'a local-only location stays out of chat');
  assert.ok(result.summary.includes(result.reportPath));
  assert.deepEqual(result.migration, { performed: false });

  // A German report the same day takes the next name and range, in the complete German form.
  const second = await writeReport(root, {}, { language: 'de', findings: [finding()] });
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(second.result.reportName, 'review-report-2026-10-29-1.md');
  assert.deepEqual(second.result.ids, ['R-0000003']);
  assert.ok(readFileSync(second.result.reportPath, 'utf8').startsWith('# Code-Review-Bericht\n'));
  assert.ok(second.result.summary.startsWith(`**${LABELS.de.summaryFindings}:** 1 `));
});

function readMemoryFile(root) {
  return JSON.parse(readFileSync(join(root, '.effective-flow', 'memory.json'), 'utf8'));
}

function legacyTree(root, files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, '.firmo', ...relative.split('/'));
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }
}

// Invariant (in-call migration, fresh repository): without the `runtimeMigration.directory`
// marker, one `write-report` call runs the migration, sets the marker, reserves and writes the
// report, and reports `migration.performed: true` with the migration result; no
// MIGRATION_REQUIRED round trip remains.
test('write-report migrates a fresh repository in the same call', async (t) => {
  const root = repository(t);
  const envelope = await writeReport(root);
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  const { result } = envelope;
  assert.equal(result.migration.performed, true);
  assert.equal(result.migration.source, null);
  assert.equal(result.migration.copiedCount, 0);
  assert.equal(result.migration.keptCount, 0);
  assert.deepEqual(result.migration.skipped, []);
  assert.deepEqual(readMemoryFile(root).runtimeMigration, {
    directory: { version: 1, source: null },
  });
  assert.deepEqual(result.ids, ['R-0000001', 'R-0000002']);
  assert.equal(readFileSync(result.reportPath, 'utf8'), expectedReport(root, {}, result.ids));

  // The marker now exists, so the next call performs no migration.
  const second = await writeReport(root, {}, { findings: [finding()] });
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.deepEqual(second.result.migration, { performed: false });
});

// Invariant (in-call migration, legacy `.firmo/`): the legacy tree is copied and its memory merged
// before the reservation, so the IDs continue after the legacy counter.
test('write-report migrates a legacy .firmo layout and continues its counter', async (t) => {
  const root = repository(t, { ignore: '.effective-flow/\n.firmo/\n' });
  legacyTree(root, {
    'memory.json': JSON.stringify({ lastFindingNumber: 41, labelMigration: { sf: { done: 1 } } }),
    'cache.json': '{}\n',
  });
  const envelope = await writeReport(root);
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  const { migration, ids } = envelope.result;
  assert.equal(migration.performed, true);
  assert.equal(migration.source, '.firmo');
  assert.deepEqual(migration.copied, ['.firmo/cache.json']);
  assert.equal(migration.copiedCount, 1);
  assert.deepEqual(ids, ['R-0000042', 'R-0000043']);
  const memory = readMemoryFile(root);
  assert.equal(memory.lastFindingNumber, 43);
  assert.deepEqual(memory.labelMigration, { sf: { done: 1 } });
  assert.equal(readFileSync(join(root, '.effective-flow', 'cache.json'), 'utf8'), '{}\n');
  // The legacy directory stays unchanged: the migration copies and never moves or rewrites.
  assert.deepEqual(readdirSync(join(root, '.firmo')).sort(), ['cache.json', 'memory.json']);
  assert.equal(readFileSync(join(root, '.firmo', 'cache.json'), 'utf8'), '{}\n');
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.firmo', 'memory.json'), 'utf8')), {
    lastFindingNumber: 41,
    labelMigration: { sf: { done: 1 } },
  });
});

// Invariant (in-call migration, race): when another writer sets the marker between the precheck
// and the migration transaction, MIGRATION_NOT_NEEDED counts as done: the call continues and
// reports `migration: {performed: false, raced: true}`.
test('write-report treats a MIGRATION_NOT_NEEDED race as done', async (t) => {
  const root = repository(t);
  const guard = join(root, '.effective-flow', `${LOCKS.memory.directory}.guard`);
  let raced = false;
  const fs = {
    mkdir: async (target, options) => {
      if (!raced && target === guard) {
        raced = true;
        writeFileSync(
          join(root, '.effective-flow', 'memory.json'),
          `${JSON.stringify({ runtimeMigration: { directory: { version: 1 } } })}\n`,
        );
      }
      return fsMkdir(target, options);
    },
  };
  const envelope = await writeReport(root, { fs });
  assert.equal(raced, true);
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  assert.deepEqual(envelope.result.migration, { performed: false, raced: true });
  assert.deepEqual(envelope.result.ids, ['R-0000001', 'R-0000002']);
  assert.ok(existsSync(envelope.result.reportPath));
});

// Invariant (in-call migration, race with a lock-release diagnostic): a MIGRATION_NOT_NEEDED whose
// lock release left a tombstone keeps that `lockRelease` on `migration` next to `raced: true`.
test('write-report keeps the lockRelease of a raced migration', async (t) => {
  const root = repository(t);
  const guard = join(root, '.effective-flow', `${LOCKS.memory.directory}.guard`);
  let raced = false;
  let failedRmdir = null;
  const fs = {
    mkdir: async (target, options) => {
      if (!raced && target === guard) {
        raced = true;
        writeFileSync(
          join(root, '.effective-flow', 'memory.json'),
          `${JSON.stringify({ runtimeMigration: { directory: { version: 1 } } })}\n`,
        );
      }
      return fsMkdir(target, options);
    },
    rmdir: async (target) => {
      if (!failedRmdir && /\.release-[0-9a-f]+$/.test(target)) {
        failedRmdir = target;
        throw Object.assign(new Error('injected'), { code: 'EBUSY' });
      }
      return nodeFs.promises.rmdir(target);
    },
  };
  const envelope = await writeReport(root, { fs });
  assert.equal(raced, true);
  assert.ok(failedRmdir, 'the release tombstone delete was injected');
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  assert.deepEqual(envelope.result.migration, {
    performed: false,
    raced: true,
    lockRelease: { released: true, leftoverTombstone: failedRmdir },
  });
  assert.deepEqual(envelope.result.ids, ['R-0000001', 'R-0000002']);
});

// Invariant (in-call migration, pre-existing target): a target that already exists is kept and
// counted, not a failure; the call succeeds and writes the report.
test('write-report keeps a pre-existing migration target and succeeds', async (t) => {
  const root = repository(t, { ignore: '.effective-flow/\n.firmo/\n' });
  legacyTree(root, { 'a.txt': 'legacy\n', 'b.txt': 'b\n' });
  mkdirSync(join(root, '.effective-flow'), { mode: 0o700 });
  writeFileSync(join(root, '.effective-flow', 'a.txt'), 'current\n');
  const envelope = await writeReport(root);
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  const { migration } = envelope.result;
  assert.equal(migration.performed, true);
  assert.ok(migration.keptCount > 0);
  assert.deepEqual(migration.kept, ['.firmo/a.txt']);
  assert.equal(readFileSync(join(root, '.effective-flow', 'a.txt'), 'utf8'), 'current\n');
  assert.ok(existsSync(envelope.result.reportPath));
});

// Invariant (in-call migration, root `.sf-memory.json`): the root legacy memory is adopted and
// removed by the migration, so the IDs continue after its counter.
test('write-report adopts and removes a root .sf-memory.json and continues its counter', async (t) => {
  const root = repository(t);
  writeFileSync(join(root, '.sf-memory.json'), `${JSON.stringify({ lastFindingNumber: 41 })}\n`);
  const envelope = await writeReport(root);
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  assert.equal(envelope.result.migration.performed, true);
  assert.equal(envelope.result.migration.legacyAdopted, true);
  assert.equal(existsSync(join(root, '.sf-memory.json')), false);
  assert.deepEqual(envelope.result.ids, ['R-0000042', 'R-0000043']);
  assert.equal(lastFindingNumber(root), 43);
});

// Invariant: a migration performed in the call stays visible on a later outcome of the same call:
// a reservation LOCK_HELD carries `migration.performed: true` and reserves and writes nothing.
test('write-report attaches the performed migration to a later reservation LOCK_HELD', async (t) => {
  const root = repository(t);
  const plain = createProcessRunner();
  let held = null;
  const marked = () =>
    existsSync(join(root, '.effective-flow', 'memory.json')) &&
    readMemoryFile(root).runtimeMigration?.directory?.version === 1;
  // Injected at the first guard check of the report directory once the marker is on disk: after
  // the migration transaction released its lock and before the reservation takes it.
  const runner = async (call) => {
    if (
      !held &&
      JSON.stringify([call.args, call.stdin ?? '']).includes('.effective-flow/review') &&
      marked()
    ) {
      held = await executeOperation(
        'lock acquire',
        { cwd: root, lock: 'memory', owner: { workflow: 'plan' } },
        deps(),
      );
    }
    return plain(call);
  };
  const outcome = await writeReport(root, { runner }, { waitSeconds: 0 });
  assert.equal(held?.ok, true, JSON.stringify(held));
  assert.equal(outcome.outcome?.code, 'LOCK_HELD', JSON.stringify(outcome));
  assert.equal(outcome.outcome.migration.performed, true);
  assert.equal(outcome.outcome.migration.source, null);
  assert.deepEqual(readMemoryFile(root).runtimeMigration, {
    directory: { version: 1, source: null },
  });
  assert.equal(lastFindingNumber(root), undefined);
  assert.deepEqual(reviewEntries(root), []);
});

// Invariant (in-call migration failure): every outcome of the migration step is returned with
// `migration: {performed: false, failed: true}`, nothing reserved, no marker and no report:
// LEGACY_MEMORY_INVALID from `.firmo/memory.json` inside the migration, from the root
// `.sf-memory.json` in the precheck, MIGRATION_INCOMPLETE, and a migration-lock LOCK_HELD.
test('write-report returns a failing migration with failed: true and writes nothing', async (t) => {
  const assertNothing = (root, outcome, code) => {
    assert.equal(outcome.outcome?.code, code, JSON.stringify(outcome));
    assert.deepEqual(outcome.outcome.migration, { performed: false, failed: true });
    assert.equal(lastFindingNumber(root), undefined);
    assert.deepEqual(reviewEntries(root), []);
  };

  const legacyDir = repository(t, { ignore: '.effective-flow/\n.firmo/\n' });
  legacyTree(legacyDir, { 'memory.json': '{"lastFindingNumber": "x"}', 'cache.json': '{}' });
  const insideMigration = await writeReport(legacyDir);
  assertNothing(legacyDir, insideMigration, 'LEGACY_MEMORY_INVALID');
  assert.equal(insideMigration.outcome.path, join(legacyDir, '.firmo', 'memory.json'));
  assert.equal(existsSync(join(legacyDir, '.effective-flow', 'memory.json')), false);

  const rootLegacy = repository(t);
  writeFileSync(join(rootLegacy, '.sf-memory.json'), '[]');
  const inPrecheck = await writeReport(rootLegacy);
  assertNothing(rootLegacy, inPrecheck, 'LEGACY_MEMORY_INVALID');
  assert.equal(inPrecheck.outcome.path, join(rootLegacy, '.sf-memory.json'));
  assert.ok(existsSync(join(rootLegacy, '.sf-memory.json')));

  const copyFails = repository(t, { ignore: '.effective-flow/\n.firmo/\n' });
  legacyTree(copyFails, { 'a.txt': 'a\n' });
  const fs = {
    link: async (from, to) => {
      if (to.endsWith('a.txt')) throw Object.assign(new Error('injected EIO'), { code: 'EIO' });
      return fsLink(from, to);
    },
  };
  const incomplete = await writeReport(copyFails, { fs });
  assertNothing(copyFails, incomplete, 'MIGRATION_INCOMPLETE');
  assert.equal(incomplete.outcome.reason, 'copy-failed');
  assert.equal(existsSync(join(copyFails, '.effective-flow', 'memory.json')), false);

  const locked = repository(t);
  const held = await executeOperation(
    'lock acquire',
    { cwd: locked, lock: 'memory', owner: { workflow: 'plan' } },
    deps(),
  );
  assert.equal(held.ok, true, JSON.stringify(held));
  const lockHeld = await writeReport(locked, {}, { waitSeconds: 0 });
  assertNothing(locked, lockHeld, 'LOCK_HELD');
  assert.equal(lockHeld.outcome.lock, 'memory');
  assert.equal(existsSync(join(locked, '.effective-flow', 'memory.json')), false);
});

// Invariant: a held memory lock is the inherited LOCK_HELD outcome; nothing is reserved and no
// report is written.
test('write-report inherits LOCK_HELD and reserves and writes nothing', async (t) => {
  const root = repository(t);
  await migrate(root);
  const held = await executeOperation(
    'lock acquire',
    { cwd: root, lock: 'memory', owner: { workflow: 'plan' } },
    deps(),
  );
  assert.equal(held.ok, true, JSON.stringify(held));
  const outcome = await writeReport(root, {}, { waitSeconds: 0 });
  assert.equal(outcome.outcome?.code, 'LOCK_HELD', JSON.stringify(outcome));
  assert.equal(lastFindingNumber(root), undefined);
  assert.deepEqual(reviewEntries(root), []);
});

// Invariant: the whole input is validated before any Git call; a refusal is INVALID_INPUT naming
// the key and, for a finding field, the finding index, and nothing is created or reserved.
test('write-report rejects invalid input naming the key and finding index', async (t) => {
  const root = repository(t);
  const missing = finding();
  delete missing.whyNow;
  const unclassified = finding();
  delete unclassified.security;
  const cases = [
    [{ findings: [finding(), missing] }, 'findings[1].whyNow', 1],
    [{ findings: [unclassified] }, 'findings[0].security', 0],
    [{ findings: [finding({ security: 'local-only' })] }, 'findings[0].security', 0],
    [{ findings: [finding({ title: 'a\nb' })] }, 'findings[0].title', 0],
    [{ findings: [finding({ severity: 'Kritisch' })] }, 'findings[0].severity', 0],
    [{ invocationPrefix: '{{FLOW}}' }, 'invocationPrefix', undefined],
    [{ language: 'fr' }, 'language', undefined],
    [{ findings: [] }, 'findings', undefined],
  ];
  for (const [input, key, findingIndex] of cases) {
    const envelope = await writeReport(root, {}, input);
    assert.equal(envelope.error?.code, 'INVALID_INPUT', JSON.stringify([input, envelope]));
    assert.equal(envelope.error.key, key);
    assert.equal(envelope.error.findingIndex, findingIndex);
  }
  for (const input of [
    { count: 2 },
    { handle: 'x' },
    { owner: { workflow: 'plan' } },
    { waitSeconds: 31 },
  ]) {
    const envelope = await writeReport(root, {}, input);
    assert.equal(envelope.error?.code, 'INVALID_INPUT', JSON.stringify([input, envelope]));
  }
  assert.equal(existsSync(join(root, '.effective-flow')), false);
});

// Invariant: standard input above 64 KiB is INPUT_TOO_LARGE in the exit class of INVALID_INPUT,
// and the operation never starts, so nothing is reserved.
test('write-report refuses oversized standard input as INPUT_TOO_LARGE', async (t) => {
  const root = repository(t);
  await migrate(root);
  const padded = reportInput(root, {
    findings: [finding({ problem: 'x'.repeat(MAX_STDIN_BYTES) })],
  });
  let exitCode;
  const sink = { write() {} };
  const envelope = await main(['review', 'write-report'], {
    stdin: Readable.from([Buffer.from(JSON.stringify(padded))]),
    stdout: sink,
    stderr: sink,
    setExitCode: (code) => {
      exitCode = code;
    },
    deps: deps(),
  });
  assert.equal(envelope.error?.code, 'INPUT_TOO_LARGE', JSON.stringify(envelope));
  assert.equal(envelope.operation, 'review write-report');
  assert.equal(exitCode, 2);
  assert.equal(lastFindingNumber(root), undefined);
  assert.deepEqual(reviewEntries(root), []);
});

// A link that lets another writer take the target name first, `times` times.
function racingLink(times) {
  let raced = 0;
  return async (from, to) => {
    if (raced < times && to.endsWith('.md')) {
      raced += 1;
      writeFileSync(to, 'foreign\n');
    }
    return fsLink(from, to);
  };
}

// Invariant: a report path taken between the allocation and the create is re-allocated inside the
// helper, keeping the reserved IDs, and the foreign file is never touched.
test('write-report re-allocates a taken path internally', async (t) => {
  const root = repository(t);
  await migrate(root);
  const envelope = await writeReport(root, { fs: { link: racingLink(2) } });
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  assert.equal(envelope.result.reportName, 'review-report-2026-10-29-2.md');
  assert.deepEqual(envelope.result.ids, ['R-0000001', 'R-0000002']);
  const directory = join(root, '.effective-flow', 'review');
  assert.equal(readFileSync(join(directory, 'review-report-2026-10-29.md'), 'utf8'), 'foreign\n');
  assert.equal(readFileSync(join(directory, 'review-report-2026-10-29-1.md'), 'utf8'), 'foreign\n');
  assert.deepEqual(reviewEntries(root), [
    'review-report-2026-10-29-1.md',
    'review-report-2026-10-29-2.md',
    'review-report-2026-10-29.md',
  ]);
  assert.equal(lastFindingNumber(root), 2);
});

// Invariant: the re-allocation is bounded; past it the outcome is REPORT_WRITE_FAILED with the
// reserved range, and no file holds this call's report.
test('write-report stops after the bounded re-allocations with REPORT_WRITE_FAILED', async (t) => {
  const root = repository(t);
  await migrate(root);
  const outcome = await writeReport(root, { fs: { link: racingLink(Infinity) } });
  assert.equal(outcome.outcome?.code, 'REPORT_WRITE_FAILED', JSON.stringify(outcome));
  assert.equal(outcome.outcome.step, 'create');
  assert.equal(outcome.outcome.firstId, 'R-0000001');
  assert.equal(outcome.outcome.lastId, 'R-0000002');
  assert.equal(outcome.outcome.guardCode, undefined);
  assert.deepEqual(outcome.outcome.migration, { performed: false });
  const entries = reviewEntries(root);
  assert.equal(entries.length, MAX_REPORT_REALLOCATIONS + 1);
  for (const name of entries) {
    assert.equal(readFileSync(join(root, '.effective-flow', 'review', name), 'utf8'), 'foreign\n');
  }
  assert.equal(lastFindingNumber(root), 2);
});

// Invariant: in a fresh repository the in-call migration stays visible when the bounded
// re-allocation is exhausted: REPORT_WRITE_FAILED carries the reserved range and
// `migration.performed: true`, the marker is set, and no file holds this call's report.
test('write-report reports the performed migration on REPORT_WRITE_FAILED', async (t) => {
  const root = repository(t);
  const outcome = await writeReport(root, { fs: { link: racingLink(Infinity) } });
  assert.equal(outcome.outcome?.code, 'REPORT_WRITE_FAILED', JSON.stringify(outcome));
  assert.equal(outcome.outcome.step, 'create');
  assert.equal(outcome.outcome.firstId, 'R-0000001');
  assert.equal(outcome.outcome.lastId, 'R-0000002');
  assert.equal(outcome.outcome.migration.performed, true);
  assert.equal(outcome.outcome.migration.source, null);
  assert.deepEqual(readMemoryFile(root).runtimeMigration, {
    directory: { version: 1, source: null },
  });
  const entries = reviewEntries(root);
  assert.equal(entries.length, MAX_REPORT_REALLOCATIONS + 1);
  for (const name of entries) {
    assert.equal(readFileSync(join(root, '.effective-flow', 'review', name), 'utf8'), 'foreign\n');
  }
  assert.equal(lastFindingNumber(root), 2);
});

// Invariant: a guard refusal after the reservation is REPORT_WRITE_FAILED carrying the range, the
// failing step and the guard code, so the run keeps its setup handling; no report remains.
test('write-report reports a guard refusal after the reservation with its code', async (t) => {
  const root = repository(t);
  await migrate(root);
  const shared = createProcessRunner();
  const runner = (call) => {
    if (call.args.includes('--stdin') && String(call.stdin ?? '').includes('.write-report-')) {
      return { status: 1, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    }
    return shared(call);
  };
  const outcome = await writeReport(root, { runner });
  assert.equal(outcome.outcome?.code, 'REPORT_WRITE_FAILED', JSON.stringify(outcome));
  assert.deepEqual(
    {
      first: outcome.outcome.first,
      last: outcome.outcome.last,
      firstId: outcome.outcome.firstId,
      lastId: outcome.outcome.lastId,
      step: outcome.outcome.step,
      guardCode: outcome.outcome.guardCode,
    },
    {
      first: 1,
      last: 2,
      firstId: 'R-0000001',
      lastId: 'R-0000002',
      step: 'create',
      guardCode: 'RUNTIME_STATE_UNSAFE',
    },
  );
  assert.deepEqual(reviewEntries(root), []);
  assert.equal(lastFindingNumber(root), 2);
});

// Invariant: a failed post-create verification removes the helper's own file, so no partial or
// altered report remains, and the outcome keeps the range.
test('write-report leaves no report when the created file fails verification', async (t) => {
  const root = repository(t);
  await migrate(root);
  const tampering = async (from, to) => {
    await fsLink(from, to);
    appendFileSync(to, 'tampered');
  };
  const outcome = await writeReport(root, { fs: { link: tampering } });
  assert.equal(outcome.outcome?.code, 'REPORT_WRITE_FAILED', JSON.stringify(outcome));
  assert.equal(outcome.outcome.step, 'create');
  assert.equal(outcome.outcome.lastId, 'R-0000002');
  assert.match(outcome.outcome.message, /failed verification/);
  assert.deepEqual(reviewEntries(root), []);
});

// Invariant: when a foreign file takes the report name between the link and its verification,
// the outcome names that path and the foreign file stays; this call's report is not left.
test('write-report names a foreign file that took the report name', async (t) => {
  const root = repository(t);
  await migrate(root);
  const replacing = async (from, to) => {
    await fsLink(from, to);
    unlinkSync(to);
    writeFileSync(to, 'foreign\n');
  };
  const outcome = await writeReport(root, { fs: { link: replacing } });
  assert.equal(outcome.outcome?.code, 'REPORT_WRITE_FAILED', JSON.stringify(outcome));
  assert.match(outcome.outcome.message, /not the file just written/);
  const [name] = reviewEntries(root);
  const foreign = join(root, '.effective-flow', 'review', name);
  assert.equal(outcome.outcome.foreignPath, foreign);
  assert.equal(readFileSync(foreign, 'utf8'), 'foreign\n');
});

// Invariant: through the CLI the success is exit 0 and REPORT_WRITE_FAILED an outcome (exit 4)
// with a one-line stderr naming the step and the unused range.
test('CLI: write-report succeeds with exit 0 and reports REPORT_WRITE_FAILED as an outcome', async (t) => {
  const root = repository(t);
  await migrate(root);
  const sink = { write() {} };
  const ok = await main(['review', 'write-report'], {
    input: reportInput(root),
    stdout: sink,
    stderr: sink,
    setExitCode: () => assert.fail('no exit code on success'),
    deps: deps({ timeZone: 'UTC' }),
  });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  let exitCode;
  let stderr = '';
  const failed = await main(['review', 'write-report'], {
    input: reportInput(root),
    stdout: sink,
    stderr: { write: (text) => (stderr += text) },
    setExitCode: (code) => {
      exitCode = code;
    },
    deps: deps({ timeZone: 'UTC', fs: { link: racingLink(Infinity) } }),
  });
  assert.equal(failed.outcome?.code, 'REPORT_WRITE_FAILED');
  assert.equal(exitCode, 4);
  assert.match(
    stderr,
    /^REPORT_WRITE_FAILED: the report could not be written at step create; R-0000003 to R-0000004 stay reserved and unused, and no report of this call was left\n$/,
  );
});
