import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { buildPortableSkill } from '../evals/_scaffold/build-identity.mjs';
import {
  prepare,
  record,
  verify,
  STEPS,
} from '../evals/next-steps/_scaffold/continuation-exercise.mjs';
import { initialSource, PLAN } from '../evals/next-steps/_scaffold/continuation-fixtures.mjs';
import { executeOfflineOperation } from '../evals/next-steps/_scaffold/continuation-tracker.mjs';
import suite from '../evals/next-steps/suite.config.mjs';
import { bodyHash } from '../src/scripts/remote-tracker-core.mjs';

// Everything created here is synthetic UNIT-ONLY evidence below a unique temporary directory.
// These receipts/transcripts never attest a model launch and are never saved to eval results.
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const text = (path) => readFileSync(path, 'utf8');
let unitRoot, builtSkillRoot;
before(() => {
  unitRoot = realpathSync(mkdtempSync(join('/private/tmp', 'outcome-exercise-unit-only-')));
  builtSkillRoot = buildPortableSkill(join(unitRoot, 'build'));
});
after(() => rmSync(unitRoot, { recursive: true, force: true }));

function fixture(t) {
  const root = mkdtempSync(join(unitRoot, 'case-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const projectRoot = join(root, 'project');
  mkdirSync(projectRoot);
  const statePath = join(root, 'issue-state.json');
  const logPath = join(root, 'tracker-calls.jsonl');
  const state = {
    issue: { number: 37, body: 'Original P1/P2 requirement.', state: 'open' },
    comments: [{ id: 730, body: initialSource('canonical'), user: { login: 'fixture-owner' } }],
  };
  writeFileSync(statePath, JSON.stringify(state));
  writeFileSync(logPath, '');
  const options = {
    projectRoot,
    statePath,
    logPath,
    corePath: resolve(import.meta.dirname, '../src/scripts/remote-tracker-core.mjs'),
    apply: true,
  };
  const input = (body, expected = state.comments[0].body) => ({
    cwd: projectRoot,
    issue: 37,
    commentId: 730,
    expectedBodyHash: bodyHash(expected),
    payload: { body },
  });
  return { root, state, options, input };
}
function logs(path) {
  return text(path).trim().split('\n').filter(Boolean).map(JSON.parse);
}
function prepareUnit(t, step = 'local-child') {
  const exerciseRoot = mkdtempSync(join(unitRoot, 'prepared-'));
  t.after(() => rmSync(exerciseRoot, { recursive: true, force: true }));
  const p = prepare({ exerciseRoot, builtSkillRoot, profile: suite.expectedProfile, step });
  return { exerciseRoot, ...p };
}
function unitRecord(p, overrides = {}) {
  const outputPath = join(p.attemptRoot, 'unit-only-final-input.txt');
  const transcriptPath = join(p.attemptRoot, 'unit-only-transcript-input.jsonl');
  writeFileSync(
    outputPath,
    'UNIT ONLY: deliberately not a real semantic assessment or model result.\n',
  );
  writeFileSync(transcriptPath, '{"type":"turn.completed"}\n');
  return record({
    exerciseRoot: p.exerciseRoot,
    step: p.step,
    outputPath,
    transcriptPath,
    hostReceipt: {
      schemaVersion: 1,
      completed: true,
      initialWorkingRoot: p.projectRoot,
      nonForked: true,
      profile: suite.expectedProfile,
      taskInput: 'rendered-prompt-only',
    },
    ...overrides,
  });
}

test('offline tracker persists and reads back an incorrect actual submitted body verbatim instead of manufacturing the correct checkpoint', async (t) => {
  const f = fixture(t);
  const wrongBody = 'WRONG submitted checkpoint\r\n**No-progress count:** 99\r\nUnicode: ü — α\n';
  const result = await executeOfflineOperation(
    'issue-comment-update',
    f.input(wrongBody),
    f.options,
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.result.body, wrongBody);
  assert.equal(json(f.options.statePath).comments[0].body, wrongBody);
  const readback = await executeOfflineOperation(
    'issue-comments-read',
    { cwd: f.options.projectRoot, issue: 37 },
    f.options,
  );
  assert.equal(readback.ok, true);
  assert.equal(readback.data.result[0].body, wrongBody);
  const applied = logs(f.options.logPath).filter((entry) => entry.event === 'applied');
  assert.equal(applied.length, 1);
  assert.equal(applied[0].before, f.state.comments[0].body);
  assert.equal(applied[0].submittedBody, wrongBody);
  assert.equal(applied[0].persistedBody, wrongBody);
  assert.notEqual(
    wrongBody,
    initialSource('canonical').replace('**No-progress count:** 0', '**No-progress count:** 1'),
  );
  assert.equal(json(f.options.statePath).issue.body, f.state.issue.body);
});

test('the production expectedBodyHash guard refuses a stale exercise update without changing any stored state', async (t) => {
  const f = fixture(t);
  const current = structuredClone(f.state);
  current.comments[0].body += '\nConcurrent source-owner evidence.\n';
  writeFileSync(f.options.statePath, JSON.stringify(current));
  const before = text(f.options.statePath);
  const result = await executeOfflineOperation(
    'issue-comment-update',
    f.input('Stale overwrite proposal.'),
    f.options,
  );
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'STALE_WRITE');
  assert.equal(text(f.options.statePath), before);
  assert.equal(
    logs(f.options.logPath).some((entry) => entry.event === 'applied'),
    false,
  );
  const readback = await executeOfflineOperation(
    'issue-comments-read',
    { cwd: f.options.projectRoot, issue: 37 },
    f.options,
  );
  assert.equal(readback.data.result[0].body, current.comments[0].body);
});

test('dry-run and duplicate updates retain production no-write and idempotent semantics', async (t) => {
  const f = fixture(t);
  const proposed = f.state.comments[0].body + '\nActual bounded return.\n';
  const before = text(f.options.statePath);
  const dry = await executeOfflineOperation('issue-comment-update', f.input(proposed), {
    ...f.options,
    apply: false,
  });
  assert.equal(dry.ok, true);
  assert.equal(dry.dryRun, true);
  assert.equal(text(f.options.statePath), before);
  assert.equal(
    (await executeOfflineOperation('issue-comment-update', f.input(proposed), f.options)).ok,
    true,
  );
  const once = text(f.options.statePath);
  const duplicate = await executeOfflineOperation(
    'issue-comment-update',
    f.input(proposed),
    f.options,
  );
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.data.unchanged, true);
  assert.equal(text(f.options.statePath), once);
  assert.equal(logs(f.options.logPath).filter((entry) => entry.event === 'applied').length, 1);
});

test('unsupported mutations, foreign identities and malformed payloads cannot escape the offline transport', async (t) => {
  const f = fixture(t);
  const before = text(f.options.statePath);
  for (const operation of [
    'issue-comment',
    'pr-merge',
    'issue-update',
    'repository-resolve',
    'pr-read',
  ]) {
    const response = await executeOfflineOperation(
      operation,
      f.input('Forbidden body.'),
      f.options,
    );
    assert.equal(response.ok, false, operation);
    assert.equal(response.error.code, 'UNSUPPORTED_OPERATION', operation);
  }
  for (const changed of [
    { issue: 38 },
    { cwd: join(f.root, 'elsewhere') },
    {
      repository: {
        host: 'attacker.example',
        owner: 'example',
        repository: 'flow',
        provider: 'github',
      },
    },
  ])
    await assert.rejects(
      executeOfflineOperation(
        'issue-comment-update',
        { ...f.input('Forbidden body.'), ...changed },
        f.options,
      ),
      /exact project and issue identity/,
    );
  const invalid = await executeOfflineOperation(
    'issue-comment-update',
    { ...f.input('Forbidden body.'), payload: { body: { invalid: true } } },
    f.options,
  );
  assert.equal(invalid.ok, false);
  const missing = await executeOfflineOperation(
    'issue-comment-update',
    { ...f.input('Forbidden body.'), commentId: 999 },
    f.options,
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'TARGET_NOT_FOUND');
  assert.equal(text(f.options.statePath), before);
  assert.equal(
    logs(f.options.logPath).some((entry) => entry.event === 'applied'),
    false,
  );
});

test('the staged tracker CLI handles reads and writes entirely offline without executing a provider binary', (t) => {
  const p = prepareUnit(t, 'canonical-first');
  const bin = join(p.attemptRoot, 'bin');
  mkdirSync(bin);
  const marker = join(p.attemptRoot, 'provider-executed');
  const gh = join(bin, 'gh');
  writeFileSync(gh, '#!/bin/sh\n: > "$PROVIDER_EXECUTION_MARKER"\nexit 91\n');
  chmodSync(gh, 0o755);
  const store = json(join(p.attemptRoot, 'issue-state.json'));
  const body = store.comments[0].body + '\nUNIT ONLY actual CLI body.\n';
  const input = {
    cwd: p.projectRoot,
    issue: 37,
    commentId: 730,
    expectedBodyHash: bodyHash(store.comments[0].body),
    payload: { body },
  };
  for (const [operation, expectedStatus] of [
    ['issue-comment-update', 0],
    ['issue-comments-read', 0],
    ['pr-merge', 1],
  ]) {
    const process = spawnSync(
      globalThis.process.execPath,
      [join(p.skillRoot, 'scripts/remote-tracker.mjs'), operation, '--apply'],
      {
        cwd: p.projectRoot,
        input: JSON.stringify(
          operation === 'issue-comments-read' ? { cwd: p.projectRoot, issue: 37 } : input,
        ),
        encoding: 'utf8',
        env: { ...globalThis.process.env, PATH: bin, PROVIDER_EXECUTION_MARKER: marker },
      },
    );
    assert.equal(process.status, expectedStatus, process.stderr);
    const response = JSON.parse(process.stdout);
    assert.equal(response.ok, expectedStatus === 0);
    if (operation === 'issue-comments-read') assert.equal(response.data.result[0].body, body);
  }
  assert.equal(existsSync(marker), false, 'the real provider executable must never be invoked');
});

test('prepare uses the actual built contract and records a bounded uncompleted evidence set', (t) => {
  const p = prepareUnit(t);
  const state = verify({ exerciseRoot: p.exerciseRoot, builtSkillRoot });
  assert.equal(STEPS.length, 22);
  assert.equal(state.fidelity, 'incomplete');
  assert.equal(state.pending.length, 22);
  assert.deepEqual(state.problems, []);
  const prepared = json(join(p.attemptRoot, 'prepared.json'));
  assert.ok(Object.keys(prepared.inputs).includes('prompt.txt'));
  assert.ok(
    Object.keys(prepared.skillState).some((path) => path === 'shared/outcome-continuation.md'),
  );
  assert.ok(Object.keys(prepared.skillState).includes('tools/build.md'));
  assert.equal(
    text(join(p.skillRoot, 'shared/outcome-continuation.md')),
    text(join(builtSkillRoot, 'shared/outcome-continuation.md')),
  );
  assert.throws(
    () =>
      prepare({
        exerciseRoot: p.exerciseRoot,
        builtSkillRoot,
        profile: suite.expectedProfile,
        step: p.step,
      }),
    /already prepared/,
  );
});

test('prepared input or built-contract tampering fails before any unit record can be sealed', (t) => {
  for (const name of ['prompt.txt', 'source-before.md', 'skill/shared/outcome-continuation.md']) {
    const p = prepareUnit(t);
    appendFileSync(join(p.attemptRoot, name), '\nUNIT ONLY tampering.\n');
    assert.throws(() => unitRecord(p), /prepared input changed|built skill or adapter changed/);
    assert.equal(existsSync(join(p.attemptRoot, 'seal.json')), false);
    assert.equal(existsSync(join(p.attemptRoot, 'record.json')), false);
  }
});

test('malformed host attestation and incomplete transcript fail closed instead of becoming model evidence', (t) => {
  const p = prepareUnit(t);
  for (const receipt of [
    null,
    { schemaVersion: 1 },
    {
      schemaVersion: 1,
      completed: true,
      initialWorkingRoot: p.projectRoot,
      nonForked: false,
      profile: suite.expectedProfile,
      taskInput: 'rendered-prompt-only',
    },
  ])
    assert.throws(() => unitRecord(p, { hostReceipt: receipt }), /host receipt must attest/);
  const badTranscript = join(p.attemptRoot, 'unit-only-incomplete.jsonl');
  writeFileSync(badTranscript, '{"type":"turn.started"}\n');
  assert.throws(
    () => unitRecord(p, { transcriptPath: badTranscript }),
    /completed host JSON transcript/,
  );
  assert.equal(existsSync(join(p.attemptRoot, 'seal.json')), false);
});

test('sealed fidelity never claims semantic acceptance from a synthetic unit receipt or matching count alone', (t) => {
  const p = prepareUnit(t);
  const result = unitRecord(p);
  assert.equal(result.sealed, true);
  assert.match(result.semanticVerdict, /requires independent qualitative reading/);
  const verified = verify({ exerciseRoot: p.exerciseRoot, builtSkillRoot });
  assert.equal(verified.fidelity, 'incomplete');
  assert.deepEqual(verified.problems, []);
  assert.equal(verified.checks.length, 1);
  assert.equal(verified.checks[0].fidelity, 'pass');
  assert.match(verified.semanticVerdict, /not established by helper/);
  assert.match(verified.limits, /not semantic truth/);
  assert.match(json(join(p.attemptRoot, 'record.json')).output, /^UNIT ONLY:/);
});

test('recorded output, source diffs, receipts and captured mutation logs are sealed against later alteration', (t) => {
  for (const name of [
    'output.txt',
    'source-after.md',
    'source.diff',
    'host-receipt.json',
    'host-transcript.jsonl',
    'tracker-calls.jsonl',
    'issue-state.json',
  ]) {
    const p = prepareUnit(t);
    unitRecord(p);
    appendFileSync(join(p.attemptRoot, name), '\nUNIT ONLY evidence alteration.\n');
    const result = verify({ exerciseRoot: p.exerciseRoot, builtSkillRoot });
    assert.equal(result.fidelity, 'fail', name);
    assert.ok(
      result.problems.some((problem) => problem.includes(`recorded evidence changed: ${name}`)),
      name,
    );
  }
});

test('fresh prepared re-entry inherits exact sealed parent state and never silently substitutes another checkpoint', (t) => {
  const child = prepareUnit(t);
  unitRecord(child);
  const first = prepare({
    exerciseRoot: child.exerciseRoot,
    builtSkillRoot,
    profile: suite.expectedProfile,
    step: 'local-first',
  });
  const sourcePath = join(first.projectRoot, PLAN);
  const source = text(sourcePath).replace('**No-progress count:** 0', '**No-progress count:** 1');
  writeFileSync(sourcePath, source);
  unitRecord({ ...first, exerciseRoot: child.exerciseRoot });
  const second = prepare({
    exerciseRoot: child.exerciseRoot,
    builtSkillRoot,
    profile: suite.expectedProfile,
    step: 'local-second',
  });
  assert.equal(text(join(second.projectRoot, PLAN)), source);
  assert.equal(text(join(second.attemptRoot, 'source-before.md')), source);
  assert.match(text(second.prompt), /Parent attempt continuation-2/);
  unitRecord({ ...second, exerciseRoot: child.exerciseRoot });
  const wrongCount = verify({ exerciseRoot: child.exerciseRoot, builtSkillRoot });
  assert.equal(wrongCount.fidelity, 'fail');
  assert.ok(
    wrongCount.problems.some((problem) =>
      /expected recorded fixture count 2, observed 1/.test(problem),
    ),
  );
  appendFileSync(
    join(second.attemptRoot, 'source-after.md'),
    '\nUNIT ONLY predecessor tampering.\n',
  );
  assert.throws(
    () =>
      prepare({
        exerciseRoot: child.exerciseRoot,
        builtSkillRoot,
        profile: suite.expectedProfile,
        step: 'local-duplicate',
      }),
    /recorded evidence changed/,
  );
});

test('legacy unknown count accepts the exact raw token or one paired code span without accepting malformed or different counts', (t) => {
  const accepted = [
    'unknown',
    '`unknown`',
    'unknown; earlier history unavailable.',
    '`unknown` — earlier history unavailable.',
  ];
  const rejected = [
    '0',
    '1',
    '2',
    'unknownSuffix',
    '`unknownSuffix`',
    '`unknown',
    'unknown`',
    '``unknown``',
    '`unknown``',
    '``unknown`',
    '```unknown```',
  ];
  for (const count of [...accepted, ...rejected]) {
    const p = prepareUnit(t, 'local-legacy');
    const sourcePath = join(p.projectRoot, PLAN);
    const source = `${text(sourcePath)}\n## Outcome checkpoint\n\n**No-progress count:** ${count}\n`;
    writeFileSync(sourcePath, source);
    unitRecord(p);
    // The unit fixture records exactly its supplied text; the observer may accept formatting, never repair the count.
    assert.equal(text(join(p.attemptRoot, 'source-after.md')), source);
    const result = verify({ exerciseRoot: p.exerciseRoot, builtSkillRoot });
    if (accepted.includes(count)) {
      assert.equal(result.fidelity, 'incomplete', count);
      assert.deepEqual(result.problems, [], count);
      assert.equal(
        result.checks.find((check) => check.step === 'local-legacy')?.fidelity,
        'pass',
        count,
      );
      assert.match(result.semanticVerdict, /not established by helper/);
    } else {
      assert.equal(result.fidelity, 'fail', count);
      assert.ok(
        result.problems.some((problem) =>
          problem.includes(`expected recorded fixture count unknown, observed ${count}`),
        ),
        count,
      );
      assert.equal(
        result.checks.some((check) => check.step === 'local-legacy'),
        false,
        count,
      );
    }
  }
});
