// Unit tests of the runtime-state helper's `review open-report` and `review write-report` against
// temporary Git repositories. `open-report` guards and creates `.effective-flow/review/`, allocates
// the local report path and reserves the report's finding IDs, reserving nothing when an earlier
// step fails. `write-report` additionally renders and creates the report and returns its summary;
// after its reservation every failure is REPORT_WRITE_FAILED with the range and no report file.

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
import { link as fsLink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';

import { executeOperation as mechanics } from '../src/scripts/effective-flow-mechanics-core.mjs';
import { MAX_STDIN_BYTES, executeOperation } from '../src/scripts/effective-flow-state-core.mjs';
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

  // A German report the same day takes the next name and range, in the complete German form.
  const second = await writeReport(root, {}, { language: 'de', findings: [finding()] });
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(second.result.reportName, 'review-report-2026-10-29-1.md');
  assert.deepEqual(second.result.ids, ['R-0000003']);
  assert.ok(readFileSync(second.result.reportPath, 'utf8').startsWith('# Code-Review-Bericht\n'));
  assert.ok(second.result.summary.startsWith(`**${LABELS.de.summaryFindings}:** 1 `));
});

// Invariant: a layout that still needs `memory migrate-directory` is MIGRATION_REQUIRED before any
// directory is created, anything reserved or any report written.
test('write-report returns MIGRATION_REQUIRED before any write', async (t) => {
  const root = repository(t);
  const outcome = await writeReport(root);
  assert.equal(outcome.outcome?.code, 'MIGRATION_REQUIRED', JSON.stringify(outcome));
  assert.equal(existsSync(join(root, '.effective-flow')), false);
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
