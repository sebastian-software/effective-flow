// Unit tests of the runtime-state helper's `review open-report` against temporary Git
// repositories: the one call that guards and creates `.effective-flow/review/`, allocates the local
// report path and reserves the report's finding IDs, reserving nothing when an earlier step fails.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import nodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { executeOperation as mechanics } from '../src/scripts/effective-flow-mechanics-core.mjs';
import { executeOperation } from '../src/scripts/effective-flow-state-core.mjs';
import { createProcessRunner } from '../src/scripts/process-runner.mjs';

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
