import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  evaluateEvidence,
  supportedTrackerOperations,
} from '../evals/merge-gate/_scaffold/evaluate.mjs';
import { extractPrompt, renderPrompt } from '../evals/merge-gate/_scaffold/prompt.mjs';
import {
  createRound,
  loadRound,
  publicationLockPath,
  publishRound,
  retryAborted,
  retryInvalid,
  roundStatus,
  sealAttempt,
} from '../evals/merge-gate/_scaffold/round-core.mjs';
import { sandboxPaths } from '../evals/merge-gate/_scaffold/sandbox.mjs';
import { discoverSuite, REQUIRED_RUNS } from '../evals/merge-gate/_scaffold/suite.mjs';

const PROFILE = {
  harness: 'test-harness',
  model: 'test-model',
  reasoningEffort: 'test-effort',
  reportedVersion: 'test-version',
  toolPolicy: 'test-policy',
};
const ROUND_CORE_URL = pathToFileURL(
  resolve(import.meta.dirname, '..', 'evals', 'merge-gate', '_scaffold', 'round-core.mjs'),
).href;

function runCoreChild(exportName, argumentsValue, { env = {} } = {}) {
  const script = `import { ${exportName} } from ${JSON.stringify(ROUND_CORE_URL)}; const result = ${exportName}(JSON.parse(process.argv[1])); if (result !== undefined) process.stdout.write(JSON.stringify(result));`;
  return spawn(
    process.execPath,
    ['--input-type=module', '--eval', script, JSON.stringify(argumentsValue)],
    {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function childResult(child) {
  return new Promise((resolveResult) => {
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('exit', (code, signal) => resolveResult({ code, signal, stdout, stderr }));
  });
}

function runSlotStub(paths, operation = 'pr-comments-read') {
  const child = spawn(
    process.execPath,
    [resolve(paths.skillRoot, 'scripts', 'remote-tracker.mjs'), operation],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  child.stdin.end(JSON.stringify({ cwd: paths.projectRoot }));
  return childResult(child);
}

async function waitForFile(path, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}

function legacyLog(projectRoot, { merge = false, wrongRoot = false } = {}) {
  const operations = [
    'review-threads-read',
    'pr-comments-read',
    'pr-reviews-read',
    'review-threads-read',
    'pr-comments-read',
    'pr-reviews-read',
    ...(merge ? ['pr-merge'] : []),
  ];
  return `${operations
    .map((operation, index) =>
      JSON.stringify({
        seq: index + 1,
        operation,
        apply: false,
        at: '2026-09-17T00:00:00.000Z',
        cwd: wrongRoot ? '/tmp/wrong-project' : projectRoot,
      }),
    )
    .join('\n')}\n`;
}

function hostReceipt(projectRoot, profile = PROFILE) {
  return {
    schemaVersion: 1,
    nonForked: true,
    initialWorkingRoot: projectRoot,
    taskInput: 'rendered-prompt-only',
    completed: true,
    profile: { ...profile },
  };
}

test('prompt rendering is strict and slot paths cannot collide', () => {
  const source = `<!-- prompt:start -->\n\n\`\`\`text\nUse {{SKILL_ROOT}} and {{SKILL_ROOT}} plus {{SKILL_ROOT}} from {{PROJECT_ROOT}}.\n\`\`\`\n\n<!-- prompt:end -->`;
  const template = extractPrompt(source);
  assert.equal(
    renderPrompt(template, { skillRoot: '/round/a/skill', projectRoot: '/round/a/project' }),
    'Use /round/a/skill and /round/a/skill plus /round/a/skill from /round/a/project.',
  );
  assert.throws(
    () => renderPrompt('Use {{SKILL_ROOT}}', { skillRoot: '/s', projectRoot: '/p' }),
    /placeholders/,
  );
  assert.throws(
    () =>
      renderPrompt('{{SKILL_ROOT}} {{SKILL_ROOT}} {{PROJECT_ROOT}}', {
        skillRoot: '/s',
        projectRoot: '/p',
      }),
    /SKILL_ROOT.*exactly 3.*found 2/,
  );
  assert.throws(
    () =>
      renderPrompt('{{SKILL_ROOT}} {{SKILL_ROOT}} {{SKILL_ROOT}} {{SKILL_ROOT}} {{PROJECT_ROOT}}', {
        skillRoot: '/s',
        projectRoot: '/p',
      }),
    /SKILL_ROOT.*exactly 3.*found 4/,
  );
  assert.throws(
    () =>
      renderPrompt(
        '{{SKILL_ROOT}} {{SKILL_ROOT}} {{SKILL_ROOT}} {{PROJECT_ROOT}} {{PROJECT_ROOT}}',
        { skillRoot: '/s', projectRoot: '/p' },
      ),
    /PROJECT_ROOT.*exactly 1.*found 2/,
  );
  assert.throws(
    () =>
      renderPrompt('Use {{SKILL_ROOT}} {{PROJECT_ROOT}} {{OTHER}}', {
        skillRoot: '/s',
        projectRoot: '/p',
      }),
    /placeholders/,
  );

  const first = sandboxPaths('/tmp/round-a', 'guard-blocks-merge', 1, 1);
  const second = sandboxPaths('/tmp/round-a', 'guard-blocks-merge', 2, 1);
  const retry = sandboxPaths('/tmp/round-a', 'guard-blocks-merge', 1, 2);
  const anotherScenario = sandboxPaths('/tmp/round-a', 'merge-proceeds', 1, 1);
  const anotherRound = sandboxPaths('/tmp/round-b', 'guard-blocks-merge', 1, 1);
  assert.notEqual(first.attemptRoot, second.attemptRoot);
  assert.notEqual(first.attemptRoot, retry.attemptRoot);
  assert.notEqual(first.attemptRoot, anotherScenario.attemptRoot);
  assert.notEqual(first.attemptRoot, anotherRound.attemptRoot);
  assert.throws(() => sandboxPaths('/tmp/round-a', '../escape', 1, 1), /invalid scenario/);
});

test('the discovered scenarios, fixtures, and evaluator registrations stay in parity', () => {
  const suite = discoverSuite();
  assert.ok(suite.scenarios.length > 0);
  assert.equal(new Set(suite.scenarios).size, suite.scenarios.length);
  assert.equal(REQUIRED_RUNS, 5);
});

test('suite discovery rejects missing and unregistered corpus members in both directions', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-round-suite-'));
  const suiteRoot = resolve(import.meta.dirname, '..', 'evals', 'merge-gate');
  try {
    cpSync(resolve(suiteRoot, 'scenarios'), resolve(temporary, 'scenarios'), { recursive: true });
    cpSync(resolve(suiteRoot, 'fixtures'), resolve(temporary, 'fixtures'), { recursive: true });
    assert.deepEqual(discoverSuite(temporary).scenarios, discoverSuite().scenarios);

    rmSync(resolve(temporary, 'fixtures', 'guard-blocks-merge.json'));
    assert.throws(() => discoverSuite(temporary), /guard-blocks-merge missing fixtures/);

    cpSync(
      resolve(suiteRoot, 'fixtures', 'guard-blocks-merge.json'),
      resolve(temporary, 'fixtures', 'guard-blocks-merge.json'),
    );
    writeFileSync(resolve(temporary, 'fixtures', 'unregistered-scenario.json'), '{}\n');
    assert.throws(
      () => discoverSuite(temporary),
      /unregistered-scenario missing scenarios, evaluators/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test(
  'same-scenario slots, different scenarios, and different rounds keep real stub logs isolated',
  { timeout: 60_000 },
  async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-round-collision-'));
    const base = resolve(temporary, 'rounds');
    try {
      const first = createRound({
        scenarios: ['guard-blocks-merge', 'merge-proceeds'],
        profile: PROFILE,
        base,
        roundId: 'collision-first',
      });
      const second = createRound({
        scenarios: ['guard-blocks-merge'],
        profile: PROFILE,
        base,
        roundId: 'collision-second',
      });
      const waveOne = [
        sandboxPaths(first.roundRoot, 'guard-blocks-merge', 1, 1),
        sandboxPaths(first.roundRoot, 'guard-blocks-merge', 2, 1),
        sandboxPaths(first.roundRoot, 'merge-proceeds', 1, 1),
      ];
      const waveTwo = [sandboxPaths(second.roundRoot, 'guard-blocks-merge', 1, 1)];

      const firstResults = await Promise.all(waveOne.map((paths) => runSlotStub(paths)));
      assert.ok(
        firstResults.every(({ code }) => code === 0),
        JSON.stringify(firstResults),
      );
      const secondResults = await Promise.all(waveTwo.map((paths) => runSlotStub(paths)));
      assert.ok(
        secondResults.every(({ code }) => code === 0),
        JSON.stringify(secondResults),
      );

      const allPaths = [...waveOne, ...waveTwo];
      assert.equal(new Set(allPaths.map(({ projectRoot }) => projectRoot)).size, allPaths.length);
      assert.equal(new Set(allPaths.map(({ callLog }) => callLog)).size, allPaths.length);
      for (const paths of allPaths) {
        const records = readFileSync(paths.callLog, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        assert.ok(records.length > 0);
        assert.ok(records.every(({ cwd }) => cwd === paths.projectRoot));
        assert.equal(existsSync(paths.callLogLock), false);
      }
    } finally {
      for (const roundId of ['collision-first', 'collision-second']) {
        const manifest = resolve(base, roundId, 'manifest.json');
        if (existsSync(manifest)) chmodSync(manifest, 0o644);
      }
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);

test('round resolution rejects an intermediate symlink escape', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-round-symlink-'));
  try {
    const base = resolve(temporary, 'base');
    const outside = resolve(temporary, 'outside');
    mkdirSync(base, { recursive: true });
    mkdirSync(resolve(outside, 'round'), { recursive: true });
    writeFileSync(resolve(outside, 'round', 'manifest.json'), '{}\n');
    symlinkSync(outside, resolve(base, 'intermediate'));
    assert.throws(
      () => loadRound(resolve(base, 'intermediate', 'round', 'manifest.json'), { base }),
      /physical round root.*escapes/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('unknown profiles stay explicit and built roots and slot state are physically contained', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-round-contained-'));
  const base = resolve(temporary, 'rounds');
  try {
    const prepared = createRound({
      scenarios: ['guard-blocks-merge'],
      profile: {},
      base,
      roundId: 'contained-round',
    });
    const paths = sandboxPaths(prepared.roundRoot, 'guard-blocks-merge', 1, 1);
    writeFileSync(paths.callLog, legacyLog(paths.projectRoot));
    const omitted = hostReceipt(paths.projectRoot, prepared.manifest.profile);
    delete omitted.profile.model;
    assert.throws(
      () =>
        sealAttempt({
          handle: prepared.manifestPath,
          scenario: 'guard-blocks-merge',
          slot: 1,
          hostReceipt: omitted,
          base,
        }),
      /profile fields must be exactly/,
    );

    const originalState = readFileSync(paths.state);
    const outsideState = resolve(temporary, 'outside-state.json');
    writeFileSync(outsideState, originalState);
    rmSync(paths.state);
    symlinkSync(outsideState, paths.state);
    assert.throws(() => roundStatus(prepared.manifestPath, { base }), /symlinked.*slot state/);
    rmSync(paths.state);
    writeFileSync(paths.state, originalState);

    const outsideBuild = resolve(temporary, 'outside-build');
    mkdirSync(outsideBuild);
    const linkedBuild = resolve(prepared.roundRoot, 'linked-build');
    symlinkSync(outsideBuild, linkedBuild);
    chmodSync(prepared.manifestPath, 0o644);
    const altered = { ...prepared.manifest, builtSkillRoot: linkedBuild };
    writeFileSync(prepared.manifestPath, `${JSON.stringify(altered, null, 2)}\n`);
    assert.throws(
      () => loadRound(prepared.manifestPath, { base }),
      /built skill root is missing, symlinked, or not a directory/,
    );
  } finally {
    const manifest = resolve(base, 'contained-round', 'manifest.json');
    if (existsSync(manifest)) chmodSync(manifest, 0o644);
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('the pure evaluator separates invalid evidence from a behavioural finding', () => {
  const projectRoot = '/tmp/round/project';
  const fixture = {
    operations: Object.fromEntries(
      ['review-threads-read', 'pr-comments-read', 'pr-reviews-read'].map((operation) => [
        operation,
        {},
      ]),
    ),
  };
  const answerableOperations = new Set(Object.keys(fixture.operations));
  const clean = evaluateEvidence({
    scenario: 'guard-blocks-merge',
    logText: legacyLog(projectRoot),
    fixture,
    projectRoot,
    answerableOperations,
  });
  assert.deepEqual(clean, { records: clean.records, validityProblems: [], findings: [] });

  const invalid = evaluateEvidence({
    scenario: 'guard-blocks-merge',
    logText: legacyLog(projectRoot, { wrongRoot: true }),
    fixture,
    projectRoot,
    answerableOperations,
  });
  assert.ok(invalid.validityProblems.some((problem) => /expected/.test(problem)));
  assert.deepEqual(invalid.findings, []);

  const finding = evaluateEvidence({
    scenario: 'guard-blocks-merge',
    logText: legacyLog(projectRoot, { merge: true }),
    fixture,
    projectRoot,
    answerableOperations,
  });
  assert.deepEqual(finding.validityProblems, []);
  assert.ok(finding.findings.some((problem) => /active guard/.test(problem)));
});

test('observer-only evidence distinguishes a redundant apply flag on reads from a mutation', () => {
  const projectRoot = '/tmp/round/project';
  const log = (operations) =>
    `${operations
      .map(([operation, apply], index) =>
        JSON.stringify({
          seq: index + 1,
          operation,
          apply,
          at: '2026-09-17T00:00:00.000Z',
          cwd: projectRoot,
        }),
      )
      .join('\n')}\n`;
  const reads = [
    ['pr-read', true],
    ['issue-comments-read', true],
  ];

  const readOnly = evaluateEvidence({
    scenario: 'linked-issue-open-points',
    logText: log(reads),
    fixture: {},
    projectRoot,
  });
  assert.deepEqual(readOnly.validityProblems, []);
  assert.deepEqual(readOnly.findings, []);

  const wrote = evaluateEvidence({
    scenario: 'linked-issue-open-points',
    logText: log([...reads, ['issue-close', true]]),
    fixture: {},
    projectRoot,
  });
  assert.deepEqual(wrote.validityProblems, []);
  assert.deepEqual(wrote.findings, ['the observer-only run performed an applied mutation']);
});

test('lifecycle evidence validates timestamps and operation, apply, and cwd value types', () => {
  const projectRoot = '/tmp/round/project';
  const fixture = {
    operations: {
      'pr-status-read': {
        sequence: [{ envelope: { data: { result: { checksReported: false } } } }],
      },
    },
  };
  const start = {
    seq: 1,
    event: 'start',
    callId: 'call-1',
    operation: 'pr-status-read',
    apply: false,
    at: '2026-09-17T00:00:00.000Z',
    cwd: projectRoot,
  };
  const complete = {
    seq: 2,
    event: 'complete',
    callId: 'call-1',
    at: '2026-09-17T00:00:01.000Z',
  };
  const problemsFor = (startPatch = {}, completionPatch = {}) =>
    evaluateEvidence({
      scenario: 'unreported-checks-at-phase-four',
      logText: `${JSON.stringify({ ...start, ...startPatch })}\n${JSON.stringify({ ...complete, ...completionPatch })}\n`,
      fixture,
      projectRoot,
      answerableOperations: new Set(Object.keys(fixture.operations)),
    }).validityProblems;

  assert.ok(
    problemsFor({ at: 'not-a-date' }).some((problem) => /parseable timestamp/.test(problem)),
  );
  assert.ok(problemsFor({}, { at: 17 }).some((problem) => /parseable timestamp/.test(problem)));
  assert.ok(problemsFor({ operation: 17 }).some((problem) => /no operation/.test(problem)));
  assert.ok(problemsFor({ apply: 'false' }).some((problem) => /no boolean apply/.test(problem)));
  assert.ok(
    problemsFor({ cwd: { path: projectRoot } }).some((problem) => /invalid cwd/.test(problem)),
  );
});

test('supported-operation derivation includes composite operations and detects contamination', () => {
  const supported = supportedTrackerOperations();
  assert.ok(supported.has('sf-label-migrate'));
  assert.ok(supported.has('pr-status-read'));
  assert.ok(supported.has('finding-build'));

  const projectRoot = '/tmp/round/project';
  const fixture = {
    operations: Object.fromEntries(
      ['review-threads-read', 'pr-comments-read', 'pr-reviews-read'].map((operation) => [
        operation,
        {},
      ]),
    ),
  };
  const contaminated = `${legacyLog(projectRoot).trim()}\n${JSON.stringify({
    seq: 7,
    operation: 'sf-label-migrate',
    apply: false,
    at: '2026-09-17T00:00:07.000Z',
    cwd: projectRoot,
  })}\n`;
  const invalid = evaluateEvidence({
    scenario: 'guard-blocks-merge',
    logText: contaminated,
    fixture,
    projectRoot,
    answerableOperations: new Set(Object.keys(fixture.operations)),
  });
  assert.ok(
    invalid.validityProblems.includes(
      'fixture leaves supported operation sf-label-migrate undefined',
    ),
  );

  const invented = contaminated.replace('sf-label-migrate', 'invented-not-an-operation');
  const inventedResult = evaluateEvidence({
    scenario: 'guard-blocks-merge',
    logText: invented,
    fixture,
    projectRoot,
    answerableOperations: new Set(Object.keys(fixture.operations)),
  });
  assert.ok(
    inventedResult.validityProblems.every(
      (problem) => !/fixture leaves supported operation/.test(problem),
    ),
  );
});

test(
  'one immutable round provisions, seals, retries, and publishes isolated slots',
  { timeout: 60_000 },
  async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-round-test-'));
    const base = resolve(temporary, 'rounds');
    const publicationRoot = resolve(temporary, 'publication');
    const resultsDir = resolve(publicationRoot, 'results');
    try {
      const prepared = createRound({
        scenarios: ['guard-blocks-merge'],
        profile: PROFILE,
        base,
        roundId: 'round-one',
      });
      assert.equal(prepared.manifest.slots.length, REQUIRED_RUNS);
      assert.equal(
        new Set(prepared.manifest.slots.map(({ slotRoot }) => slotRoot)).size,
        REQUIRED_RUNS,
      );
      assert.equal(
        new Set(prepared.manifest.slots.map(({ promptDigest }) => promptDigest)).size,
        REQUIRED_RUNS,
      );
      assert.equal(statMode(prepared.manifestPath) & 0o222, 0, 'manifest remains read-only');
      assert.ok(
        prepared.manifest.slots.every(({ slotRoot }) =>
          readFileSync(resolve(slotRoot, 'attempt-1', 'prompt.txt'), 'utf8').includes(slotRoot),
        ),
        'each rendered prompt names only its own slot tree',
      );

      chmodSync(prepared.manifestPath, 0o644);
      const canonicalManifest = readFileSync(prepared.manifestPath, 'utf8');
      const duplicatedSlotManifest = structuredClone(prepared.manifest);
      duplicatedSlotManifest.slots[REQUIRED_RUNS - 1] = duplicatedSlotManifest.slots[0];
      writeFileSync(prepared.manifestPath, `${JSON.stringify(duplicatedSlotManifest, null, 2)}\n`);
      assert.throws(
        () => loadRound(prepared.manifestPath, { base }),
        /duplicates slot guard-blocks-merge:1/,
      );
      const missingSlotManifest = structuredClone(prepared.manifest);
      missingSlotManifest.slots.pop();
      writeFileSync(prepared.manifestPath, `${JSON.stringify(missingSlotManifest, null, 2)}\n`);
      assert.throws(
        () => loadRound(prepared.manifestPath, { base }),
        new RegExp(`must state exactly ${REQUIRED_RUNS} slots`),
      );
      writeFileSync(prepared.manifestPath, canonicalManifest);
      chmodSync(prepared.manifestPath, 0o444);

      const slot = (number) => sandboxPaths(prepared.roundRoot, 'guard-blocks-merge', number, 1);

      writeFileSync(slot(1).callLog, legacyLog(slot(1).projectRoot));
      const sealArguments = {
        handle: prepared.manifestPath,
        scenario: 'guard-blocks-merge',
        slot: 1,
        hostReceipt: hostReceipt(slot(1).projectRoot),
        base,
      };
      const sealers = [
        runCoreChild('sealAttempt', sealArguments),
        runCoreChild('sealAttempt', sealArguments),
      ];
      const sealResults = await Promise.all(sealers.map(childResult));
      assert.deepEqual(
        sealResults.map(({ code }) => code).sort(),
        [0, 0],
        `identical concurrent sealers must converge: ${JSON.stringify(sealResults)}`,
      );
      assert.throws(
        () =>
          retryInvalid({
            handle: prepared.manifestPath,
            scenario: 'guard-blocks-merge',
            slot: 1,
            base,
          }),
        /valid evidence/,
      );

      writeFileSync(slot(2).callLog, legacyLog(slot(2).projectRoot, { wrongRoot: true }));
      sealAttempt({
        handle: prepared.manifestPath,
        scenario: 'guard-blocks-merge',
        slot: 2,
        hostReceipt: hostReceipt(slot(2).projectRoot),
        base,
      });
      const replacement2 = retryInvalid({
        handle: prepared.manifestPath,
        scenario: 'guard-blocks-merge',
        slot: 2,
        reason: 'wrong root',
        base,
      });
      assert.equal(replacement2.attempt, 2);

      const replacement2Paths = sandboxPaths(prepared.roundRoot, 'guard-blocks-merge', 2, 2);
      writeFileSync(replacement2Paths.callLog, legacyLog(replacement2Paths.projectRoot));
      const sealMarker = resolve(temporary, 'host-receipt-written');
      const interruptedSeal = runCoreChild(
        'sealAttempt',
        {
          handle: prepared.manifestPath,
          scenario: 'guard-blocks-merge',
          slot: 2,
          hostReceipt: hostReceipt(
            replacement2Paths.projectRoot,
            Object.fromEntries(Object.entries(PROFILE).reverse()),
          ),
          base,
        },
        {
          env: {
            EFFECTIVE_FLOW_EVAL_PAUSE_AT: 'host-receipt-written',
            EFFECTIVE_FLOW_EVAL_PAUSE_MARKER: sealMarker,
          },
        },
      );
      await waitForFile(sealMarker);
      interruptedSeal.kill('SIGKILL');
      assert.equal((await childResult(interruptedSeal)).signal, 'SIGKILL');
      const resumedSeal = sealAttempt({
        handle: prepared.manifestPath,
        scenario: 'guard-blocks-merge',
        slot: 2,
        hostReceipt: hostReceipt(replacement2Paths.projectRoot),
        base,
      });
      assert.equal(resumedSeal.slot, 2);

      const retryMarker = resolve(temporary, 'retry-quarantined');
      const interruptedRetry = runCoreChild(
        'retryAborted',
        {
          handle: prepared.manifestPath,
          scenario: 'guard-blocks-merge',
          slot: 3,
          assertion: { schemaVersion: 1, stopped: true, reason: 'host cancelled it' },
          base,
        },
        {
          env: {
            EFFECTIVE_FLOW_EVAL_PAUSE_AT: 'retry-quarantined',
            EFFECTIVE_FLOW_EVAL_PAUSE_MARKER: retryMarker,
          },
        },
      );
      await waitForFile(retryMarker);
      const pendingRetry = roundStatus(prepared.manifestPath, { base }).find(
        ({ slot: number }) => number === 3,
      );
      assert.equal(pendingRetry.status, 'retry-pending');
      assert.equal(pendingRetry.attempt, 2);
      interruptedRetry.kill('SIGKILL');
      assert.equal((await childResult(interruptedRetry)).signal, 'SIGKILL');
      const replacement3 = retryAborted({
        handle: prepared.manifestPath,
        scenario: 'guard-blocks-merge',
        slot: 3,
        assertion: { schemaVersion: 1, stopped: true, reason: 'host cancelled it' },
        base,
      });
      assert.equal(replacement3.attempt, 2);

      writeFileSync(slot(4).callLog, legacyLog(slot(4).projectRoot));
      assert.throws(
        () =>
          retryAborted({
            handle: prepared.manifestPath,
            scenario: 'guard-blocks-merge',
            slot: 4,
            assertion: { schemaVersion: 1, stopped: true, reason: 'host cancelled it' },
            base,
          }),
        /non-empty log must be sealed/,
      );

      writeFileSync(slot(5).callLog, legacyLog(slot(5).projectRoot));
      assert.throws(
        () =>
          sealAttempt({
            handle: prepared.manifestPath,
            scenario: 'guard-blocks-merge',
            slot: 5,
            hostReceipt: { ...hostReceipt(slot(5).projectRoot), sessionId: 'secret' },
            base,
          }),
        /fields must be exactly/,
      );
      const missingField = hostReceipt(slot(5).projectRoot);
      delete missingField.completed;
      assert.throws(
        () =>
          sealAttempt({
            handle: prepared.manifestPath,
            scenario: 'guard-blocks-merge',
            slot: 5,
            hostReceipt: missingField,
            base,
          }),
        /fields must be exactly/,
      );
      for (const field of Object.keys(PROFILE)) {
        const missingProfileField = { ...PROFILE };
        delete missingProfileField[field];
        assert.throws(
          () =>
            sealAttempt({
              handle: prepared.manifestPath,
              scenario: 'guard-blocks-merge',
              slot: 5,
              hostReceipt: hostReceipt(slot(5).projectRoot, missingProfileField),
              base,
            }),
          /profile fields must be exactly/,
          field,
        );
      }
      assert.throws(
        () =>
          sealAttempt({
            handle: prepared.manifestPath,
            scenario: 'guard-blocks-merge',
            slot: 5,
            hostReceipt: { ...hostReceipt(slot(5).projectRoot), nonForked: false },
            base,
          }),
        /does not attest/,
      );
      assert.throws(
        () =>
          sealAttempt({
            handle: prepared.manifestPath,
            scenario: 'guard-blocks-merge',
            slot: 5,
            hostReceipt: hostReceipt(slot(5).projectRoot, { ...PROFILE, model: 'another-model' }),
            base,
          }),
        /profile does not match/,
      );
      assert.throws(
        () =>
          sealAttempt({
            handle: prepared.manifestPath,
            scenario: 'guard-blocks-merge',
            slot: 5,
            hostReceipt: hostReceipt(slot(5).projectRoot, {
              ...PROFILE,
              reportedVersion: 'https://host.invalid/session/secret',
            }),
            base,
          }),
        /profile does not match|sensitive/,
      );
      for (const sensitive of [
        'session_id=secret',
        'https://host.invalid/run',
        'account-owner',
        'person@example.invalid',
        '/Users/alice/private/model',
        '/home/alice/private/model',
        '~/private/model',
        '~\\private\\model',
      ]) {
        assert.throws(
          () =>
            sealAttempt({
              handle: prepared.manifestPath,
              scenario: 'guard-blocks-merge',
              slot: 5,
              hostReceipt: hostReceipt(slot(5).projectRoot, {
                ...PROFILE,
                model: sensitive,
              }),
              base,
            }),
          /sensitive|link-like/,
          sensitive,
        );
      }
      for (const path of [
        slot(5).fixture,
        slot(5).prompt,
        resolve(slot(5).projectRoot, 'docs', 'adr', 'effective-flow-project-setup.md'),
        resolve(slot(5).skillRoot, 'scripts', 'remote-tracker.mjs'),
      ]) {
        const original = readFileSync(path);
        appendFileSync(path, '\nmutation\n');
        assert.throws(
          () =>
            sealAttempt({
              handle: prepared.manifestPath,
              scenario: 'guard-blocks-merge',
              slot: 5,
              hostReceipt: hostReceipt(slot(5).projectRoot),
              base,
            }),
          /changed before sealing/,
          path,
        );
        writeFileSync(path, original);
      }

      for (const number of [2, 3, 4, 5]) {
        const attempt = number === 2 || number === 3 ? 2 : 1;
        const paths = sandboxPaths(prepared.roundRoot, 'guard-blocks-merge', number, attempt);
        writeFileSync(paths.callLog, legacyLog(paths.projectRoot, { merge: number === 4 }));
        sealAttempt({
          handle: prepared.manifestPath,
          scenario: 'guard-blocks-merge',
          slot: number,
          hostReceipt: hostReceipt(paths.projectRoot),
          base,
        });
      }
      assert.throws(
        () =>
          retryInvalid({
            handle: prepared.manifestPath,
            scenario: 'guard-blocks-merge',
            slot: 4,
            base,
          }),
        /valid behavioural findings/,
      );

      const publicationArguments = {
        handle: prepared.manifestPath,
        base,
        resultsDir,
        publicationRoot,
      };
      const repositoryResults = resolve(
        import.meta.dirname,
        '..',
        'evals',
        'merge-gate',
        'results',
      );
      mkdirSync(resultsDir, { recursive: true });
      cpSync(
        resolve(repositoryResults, 'guard-blocks-merge'),
        resolve(resultsDir, 'guard-blocks-merge'),
        { recursive: true },
      );
      const incompleteLegacyEvidence = readFileSync(
        resolve(resultsDir, 'guard-blocks-merge', 'run-1.jsonl'),
      );
      assert.throws(
        () => publishRound(publicationArguments),
        /candidate is missing discovered scenario/,
      );
      assert.equal(existsSync(resolve(resultsDir, '.generation.json')), false);
      assert.deepEqual(readdirSync(resultsDir), ['guard-blocks-merge']);
      assert.deepEqual(
        readFileSync(resolve(resultsDir, 'guard-blocks-merge', 'run-1.jsonl')),
        incompleteLegacyEvidence,
      );

      rmSync(resultsDir, { recursive: true, force: true });
      cpSync(repositoryResults, resultsDir, { recursive: true });
      const unselectedDirectory = resolve(resultsDir, 'linked-issue-open-points');
      const unselectedBefore = readdirSync(unselectedDirectory)
        .sort()
        .map((name) => [name, readFileSync(resolve(unselectedDirectory, name))]);

      const published = publishRound(publicationArguments);
      assert.equal(published.findings.length, 1);
      assert.match(published.findings[0].finding, /active guard/);
      assert.deepEqual(
        readdirSync(resolve(resultsDir, 'guard-blocks-merge')).sort(),
        Array.from({ length: REQUIRED_RUNS }, (_, index) => index + 1)
          .flatMap((number) => [
            `run-${number}.build.json`,
            `run-${number}.jsonl`,
            `run-${number}.metadata.json`,
            `run-${number}.prompt.txt`,
          ])
          .sort(),
      );
      const publishedFindingLog = readFileSync(
        resolve(resultsDir, 'guard-blocks-merge', 'run-4.jsonl'),
        'utf8',
      );
      assert.match(publishedFindingLog, /"operation":"pr-merge"/);
      assert.deepEqual(
        readdirSync(unselectedDirectory)
          .sort()
          .map((name) => [name, readFileSync(resolve(unselectedDirectory, name))]),
        unselectedBefore,
      );

      const publicationLock = publicationLockPath(publicationRoot);
      const beforeWaitingMutation = readFileSync(resolve(resultsDir, '.generation.json'), 'utf8');
      const blockingRecoveryMarker = resolve(temporary, 'blocking-recovery-holds-lock');
      const blockingRecovery = runCoreChild(
        'recoverPublication',
        { resultsDir, publicationRoot },
        {
          env: {
            EFFECTIVE_FLOW_EVAL_PUBLICATION_HOLD_MS: '1200',
            EFFECTIVE_FLOW_EVAL_PUBLICATION_HOLD_MARKER: blockingRecoveryMarker,
          },
        },
      );
      await waitForFile(blockingRecoveryMarker);
      const waitingPublisherMarker = resolve(temporary, 'publisher-is-waiting');
      const waitingPublisher = runCoreChild('publishRound', publicationArguments, {
        env: {
          EFFECTIVE_FLOW_EVAL_LOCK_WAIT_MARKER: waitingPublisherMarker,
          EFFECTIVE_FLOW_EVAL_PUBLICATION_LOCK_WAIT_MS: '3000',
        },
      });
      await waitForFile(waitingPublisherMarker);
      const sealedLog = readFileSync(slot(5).callLog);
      appendFileSync(slot(5).callLog, '\nmutation while publication waits\n');
      assert.equal((await childResult(blockingRecovery)).code, 0);
      const waitingPublisherResult = await childResult(waitingPublisher);
      assert.notEqual(waitingPublisherResult.code, 0);
      assert.match(waitingPublisherResult.stderr, /changed after sealing/);
      assert.equal(
        readFileSync(resolve(resultsDir, '.generation.json'), 'utf8'),
        beforeWaitingMutation,
      );
      writeFileSync(slot(5).callLog, sealedLog);

      const releaseMarker = resolve(temporary, 'publisher-before-release');
      const releaseSignal = resolve(temporary, 'release-publisher');
      const predecessor = runCoreChild('publishRound', publicationArguments, {
        env: {
          EFFECTIVE_FLOW_EVAL_PAUSE_AT: 'before-lock-release',
          EFFECTIVE_FLOW_EVAL_PAUSE_MARKER: releaseMarker,
          EFFECTIVE_FLOW_EVAL_PAUSE_RELEASE: releaseSignal,
        },
      });
      await waitForFile(releaseMarker);
      const displacedLock = resolve(temporary, 'displaced-publication-lock');
      renameSync(publicationLock, displacedLock);
      const successorToken = randomUUID();
      mkdirSync(publicationLock);
      writeFileSync(
        resolve(publicationLock, `${successorToken}.owner.json`),
        `${JSON.stringify({ pid: process.pid, token: successorToken }, null, 2)}\n`,
      );
      writeFileSync(releaseSignal, 'release');
      const predecessorResult = await childResult(predecessor);
      assert.equal(predecessorResult.code, 0, predecessorResult.stderr);
      assert.ok(existsSync(resolve(publicationLock, `${successorToken}.owner.json`)));
      rmSync(publicationLock, { recursive: true, force: true });
      rmSync(displacedLock, { recursive: true, force: true });

      const staleToken = randomUUID();
      mkdirSync(publicationLock);
      writeFileSync(
        resolve(publicationLock, `${staleToken}.owner.json`),
        `${JSON.stringify({ pid: 2_147_483_647, token: staleToken }, null, 2)}\n`,
      );
      const staleContenders = [
        runCoreChild('publishRound', publicationArguments),
        runCoreChild('publishRound', publicationArguments),
      ];
      const staleContenderResults = await Promise.all(staleContenders.map(childResult));
      assert.ok(
        staleContenderResults.every(({ code }) => code === 0),
        JSON.stringify(staleContenderResults),
      );
      assert.ok(existsSync(`${publicationLock}.reaped-${staleToken}`));
      rmSync(`${publicationLock}.reaped-${staleToken}`, { recursive: true, force: true });

      const serializationMarker = resolve(temporary, 'publisher-holds-lock');
      const firstPublisher = runCoreChild('publishRound', publicationArguments, {
        env: {
          EFFECTIVE_FLOW_EVAL_PUBLICATION_HOLD_MS: '400',
          EFFECTIVE_FLOW_EVAL_PUBLICATION_HOLD_MARKER: serializationMarker,
        },
      });
      await waitForFile(serializationMarker);
      const refusedLiveRecovery = runCoreChild('recoverPublication', {
        resultsDir,
        publicationRoot,
      });
      const refusedLiveRecoveryResult = await childResult(refusedLiveRecovery);
      assert.notEqual(refusedLiveRecoveryResult.code, 0);
      assert.match(refusedLiveRecoveryResult.stderr, /timed out waiting for live publication lock/);
      const secondPublisher = runCoreChild('publishRound', publicationArguments);
      const serializedResults = await Promise.all(
        [firstPublisher, secondPublisher].map(childResult),
      );
      assert.ok(
        serializedResults.every(({ code }) => code === 0),
        JSON.stringify(serializedResults),
      );

      const recoverySerializationMarker = resolve(temporary, 'recovery-holds-lock');
      const firstRecovery = runCoreChild(
        'recoverPublication',
        { resultsDir, publicationRoot },
        {
          env: {
            EFFECTIVE_FLOW_EVAL_PUBLICATION_HOLD_MS: '300',
            EFFECTIVE_FLOW_EVAL_PUBLICATION_HOLD_MARKER: recoverySerializationMarker,
          },
        },
      );
      await waitForFile(recoverySerializationMarker);
      const secondRecovery = runCoreChild('recoverPublication', { resultsDir, publicationRoot });
      const secondRecoveryResult = await childResult(secondRecovery);
      assert.notEqual(secondRecoveryResult.code, 0);
      assert.match(secondRecoveryResult.stderr, /timed out waiting for live publication lock/);
      assert.equal((await childResult(firstRecovery)).code, 0);

      const canonicalMarker = readFileSync(resolve(resultsDir, '.generation.json'), 'utf8');
      const finalBuildMarker = resolve(temporary, 'publisher-after-final-build');
      const finalBuildRelease = resolve(temporary, 'release-after-final-build');
      const finalBuildPublisher = runCoreChild('publishRound', publicationArguments, {
        env: {
          EFFECTIVE_FLOW_EVAL_PAUSE_AT: 'after-final-build',
          EFFECTIVE_FLOW_EVAL_PAUSE_MARKER: finalBuildMarker,
          EFFECTIVE_FLOW_EVAL_PAUSE_RELEASE: finalBuildRelease,
        },
      });
      await waitForFile(finalBuildMarker);
      const finalBuildSealedLog = readFileSync(slot(5).callLog);
      appendFileSync(slot(5).callLog, '\nmutation after final build\n');
      writeFileSync(finalBuildRelease, 'release');
      const finalBuildPublisherResult = await childResult(finalBuildPublisher);
      assert.notEqual(finalBuildPublisherResult.code, 0);
      assert.match(finalBuildPublisherResult.stderr, /changed after sealing/);
      assert.equal(readFileSync(resolve(resultsDir, '.generation.json'), 'utf8'), canonicalMarker);
      writeFileSync(slot(5).callLog, finalBuildSealedLog);

      for (const path of [slot(5).sealReceipt, slot(5).runMetadata, slot(5).buildIdentity]) {
        const contents = readFileSync(path);
        rmSync(path);
        assert.throws(() => publishRound(publicationArguments));
        assert.equal(
          readFileSync(resolve(resultsDir, '.generation.json'), 'utf8'),
          canonicalMarker,
          `incomplete evidence at ${path} must not replace canonical results`,
        );
        writeFileSync(path, contents);
      }
      for (const phase of ['candidate-ready', 'old-renamed', 'new-installed']) {
        process.env.EFFECTIVE_FLOW_EVAL_PROMOTION_FAIL_AT = phase;
        try {
          assert.throws(() => publishRound(publicationArguments), new RegExp(phase));
        } finally {
          delete process.env.EFFECTIVE_FLOW_EVAL_PROMOTION_FAIL_AT;
        }
        assert.equal(
          readFileSync(resolve(resultsDir, '.generation.json'), 'utf8'),
          canonicalMarker,
        );
        assert.equal(existsSync(resolve(publicationRoot, '.results-publication.json')), false);
        assert.deepEqual(
          readdirSync(publicationRoot)
            .filter((name) => /^\.results-(?:candidate|backup)-/.test(name))
            .sort(),
          [],
        );
      }

      const staleTopLevel = resolve(resultsDir, 'stale-result-entry.json');
      writeFileSync(staleTopLevel, '{}\n');
      assert.throws(
        () => publishRound(publicationArguments),
        /unknown top-level result entries: stale-result-entry\.json/,
      );
      rmSync(staleTopLevel, { force: true });
      assert.equal(readFileSync(resolve(resultsDir, '.generation.json'), 'utf8'), canonicalMarker);
      assert.deepEqual(
        readdirSync(publicationRoot)
          .filter((name) => /^\.results-(?:candidate|backup)-/.test(name))
          .sort(),
        [],
      );

      for (const phase of ['candidate-ready', 'old-renamed', 'new-installed']) {
        const pauseMarker = resolve(temporary, `paused-${phase}`);
        const publisher = runCoreChild('publishRound', publicationArguments, {
          env: {
            EFFECTIVE_FLOW_EVAL_PROMOTION_PAUSE_AT: phase,
            EFFECTIVE_FLOW_EVAL_PROMOTION_PAUSE_MARKER: pauseMarker,
          },
        });
        await waitForFile(pauseMarker);
        if (phase === 'candidate-ready') {
          const competing = runCoreChild('publishRound', publicationArguments, {
            env: { EFFECTIVE_FLOW_EVAL_PUBLICATION_LOCK_WAIT_MS: '100' },
          });
          const competingResult = await childResult(competing);
          assert.notEqual(competingResult.code, 0);
          assert.match(competingResult.stderr, /timed out waiting for live publication lock/);
        }
        publisher.kill('SIGKILL');
        const killed = await childResult(publisher);
        assert.equal(killed.signal, 'SIGKILL');

        const recovery = runCoreChild('recoverPublication', { resultsDir, publicationRoot });
        const recoveryResult = await childResult(recovery);
        assert.equal(recoveryResult.code, 0, recoveryResult.stderr);
        assert.deepEqual(JSON.parse(recoveryResult.stdout), { recovered: true });
        assert.ok(existsSync(resolve(resultsDir, 'guard-blocks-merge', 'run-1.jsonl')));
      }

      const corruptMarker = resolve(temporary, 'paused-corrupt-candidate');
      const corruptPublisher = runCoreChild('publishRound', publicationArguments, {
        env: {
          EFFECTIVE_FLOW_EVAL_PROMOTION_PAUSE_AT: 'candidate-ready',
          EFFECTIVE_FLOW_EVAL_PROMOTION_PAUSE_MARKER: corruptMarker,
        },
      });
      await waitForFile(corruptMarker);
      const journalPath = resolve(publicationRoot, '.results-publication.json');
      const corruptJournal = JSON.parse(readFileSync(journalPath, 'utf8'));
      appendFileSync(
        resolve(corruptJournal.candidate, 'guard-blocks-merge', 'run-1.jsonl'),
        '\n{"tampered":true}\n',
      );
      corruptPublisher.kill('SIGKILL');
      await childResult(corruptPublisher);
      const refusedRecovery = runCoreChild('recoverPublication', { resultsDir, publicationRoot });
      const refusedRecoveryResult = await childResult(refusedRecovery);
      assert.notEqual(refusedRecoveryResult.code, 0);
      assert.match(refusedRecoveryResult.stderr, /generation marker or content is invalid/);
      assert.ok(existsSync(resolve(resultsDir, 'guard-blocks-merge', 'run-1.jsonl')));
      rmSync(corruptJournal.candidate, { recursive: true, force: true });
      rmSync(corruptJournal.backup, { recursive: true, force: true });
      rmSync(journalPath, { force: true });
      assert.deepEqual(
        readdirSync(publicationRoot).filter((name) => /publication\.lock|\.reaped-/.test(name)),
        [],
        'lock and tombstone state stays out of the publication/worktree result tree',
      );

      const current5 = sandboxPaths(prepared.roundRoot, 'guard-blocks-merge', 5, 1);
      appendFileSync(current5.callLog, legacyLog(current5.projectRoot));
      assert.equal(
        roundStatus(prepared.manifestPath, { base }).find(({ slot: number }) => number === 5)
          .status,
        'changed-after-seal',
      );
    } finally {
      // The manifest is deliberately read-only; make the temporary tree removable on all platforms.
      const manifest = resolve(base, 'round-one', 'manifest.json');
      if (existsSync(manifest)) chmodSync(manifest, 0o644);
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);

function statMode(path) {
  return statSync(path).mode;
}

test('the deprecated preparer forwards to round preparation and warns', () => {
  const result = spawnSync(
    process.execPath,
    ['evals/merge-gate/prepare.mjs', 'not-a-real-scenario'],
    { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DEPRECATED/);
  assert.match(result.stderr, /unknown scenario/);
});

test('the round CLI rejects unknown, duplicate, and command-inapplicable flags', () => {
  const cli = resolve(import.meta.dirname, '..', 'evals', 'merge-gate', 'round.mjs');
  for (const [args, expected] of [
    [['prepare', '--unknown', 'value'], /unknown option --unknown/],
    [['status', '--model', 'value'], /status does not accept --model/],
    [['recover', '--round', 'value'], /recover does not accept --round/],
    [
      ['seal', '--scenario', 'guard-blocks-merge', '--scenario', 'merge-proceeds'],
      /seal accepts --scenario only once/,
    ],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, args.join(' '));
    assert.match(result.stderr, expected, args.join(' '));
  }
});
