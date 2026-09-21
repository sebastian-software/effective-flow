import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
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
  buildPortableSkill,
  pristineScenarioBuildIdentity,
} from '../evals/merge-gate/_scaffold/build-identity.mjs';
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

const REPOSITORY_RESULTS = resolve(import.meta.dirname, '..', 'evals', 'merge-gate', 'results');

// The repository's archived corpus, copied into a temporary publication root so `publishRound` has
// standing evidence to carry forward, re-stamped to the identity of the tree the test is running
// against.
//
// Without the re-stamp the publication assertions depend on something they are not about.
// `ensureCanonicalGeneration` re-evaluates **every** carried-forward scenario against a freshly
// built tree, so one uncommitted edit to any load-set source — the ordinary state of a branch that
// touches `src/` — makes the publication fail for a reason that has nothing to do with sealing,
// locking, journalling or promotion, and the lifecycle coverage disappears exactly when drift is
// most common. Gating the test instead would drop that coverage the same way, more quietly.
//
// Only the stamp and the `buildDigest` its metadata pins are rewritten. The behavioural `.jsonl`
// logs are left exactly as recorded, because they are what `evaluateEvidence` judges: rewriting
// those would turn the fixture into evidence of nothing.
//
// The rejection path this removes from the lifecycle test is restored deliberately below, in
// `publishRound refuses a carried-forward run whose stamp describes another build`. That case is
// stronger than the coverage it replaces: it names the drifted run instead of depending on whoever
// runs the suite happening to have a dirty working tree.
function copyRestampedResults(resultsDir) {
  rmSync(resultsDir, { recursive: true, force: true });
  cpSync(REPOSITORY_RESULTS, resultsDir, { recursive: true });
  // The copied generation marker pins a content digest of the bytes as archived, and re-stamping
  // moves those bytes. Removing it leaves the tree as an unmarked — "legacy" — generation, which
  // the publication path handles explicitly; leaving a stale marker in place would fail the very
  // next `generationInfo` read with an integrity error the test is not about.
  //
  // It does change which publication branch the first publish onto this copy takes: from a marked
  // predecessor to an unmarked one. That is a deliberate trade and not a gap — the unmarked branch
  // is the one a checkout that has never published takes, the marked branch is exercised by every
  // later publish in the same test, and a caller that needs the marked branch on the *first*
  // publish has to write the marker itself rather than expect this helper to carry one.
  rmSync(resolve(resultsDir, '.generation.json'), { force: true });
  const outputRoot = mkdtempSync(join(tmpdir(), 'effective-flow-round-restamp-'));
  try {
    const skillRoot = buildPortableSkill(outputRoot);
    for (const scenario of discoverSuite().scenarios) {
      const directory = resolve(resultsDir, scenario);
      if (!existsSync(directory)) continue;
      const identity = pristineScenarioBuildIdentity(scenario, skillRoot);
      for (const name of readdirSync(directory).filter((entry) =>
        /^run-\d+\.build\.json$/.test(entry),
      )) {
        const stampPath = resolve(directory, name);
        writeFileSync(stampPath, `${JSON.stringify(identity, null, 2)}\n`);
        const metadataPath = stampPath.replace(/\.build\.json$/, '.metadata.json');
        const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
        metadata.buildDigest = identity.digest;
        writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
      }
    }
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
}

test('prompt rendering is strict and slot paths cannot collide', () => {
  const source = `<!-- prompt:start -->\n\n\`\`\`text\nUse {{SKILL_ROOT}} and {{SKILL_ROOT}} plus {{SKILL_ROOT}} from {{PROJECT_ROOT}} with cwd {{PROJECT_ROOT}}.\n\`\`\`\n\n<!-- prompt:end -->`;
  const template = extractPrompt(source);
  assert.equal(
    renderPrompt(template, { skillRoot: '/round/a/skill', projectRoot: '/round/a/project' }),
    'Use /round/a/skill and /round/a/skill plus /round/a/skill from /round/a/project with cwd /round/a/project.',
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
      renderPrompt('{{SKILL_ROOT}} {{SKILL_ROOT}} {{SKILL_ROOT}} {{PROJECT_ROOT}}', {
        skillRoot: '/s',
        projectRoot: '/p',
      }),
    /PROJECT_ROOT.*exactly 2.*found 1/,
  );
  assert.throws(
    () =>
      renderPrompt(
        '{{SKILL_ROOT}} {{SKILL_ROOT}} {{SKILL_ROOT}} {{PROJECT_ROOT}} {{PROJECT_ROOT}} {{PROJECT_ROOT}}',
        { skillRoot: '/s', projectRoot: '/p' },
      ),
    /PROJECT_ROOT.*exactly 2.*found 3/,
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
    // Release sentinels live beside `temporary`, never inside it: the `finally` removes `temporary`
    // with `rmSync`, which would race a parked child's 20 ms poll and could delete a release before
    // it was ever observed. Both this directory and the registry below are declared before the
    // `try` so they are in scope in the `finally`, following `driveVerifyWalk`.
    const gate = mkdtempSync(join(tmpdir(), 'effective-flow-round-gate-'));
    // Every long-lived child spawned inside the `try` — the ones that park at a boundary and any
    // other whose lifetime outlives the statement that spawned it — as `{ child, release, result }`,
    // the result promise captured once at the spawn site, because `childResult` attaches its `exit`
    // listener at call time and `exit` fires once: a second call on an exited child returns a
    // promise that never settles. The teardown kills and awaits these, so a failed assertion
    // reports instead of hanging on a parked child's still-open pipes.
    const parked = [];
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
      const interruptedSealResult = childResult(interruptedSeal);
      parked.push({ child: interruptedSeal, release: null, result: interruptedSealResult });
      await waitForFile(sealMarker);
      interruptedSeal.kill('SIGKILL');
      assert.equal((await interruptedSealResult).signal, 'SIGKILL');
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
      const interruptedRetryResult = childResult(interruptedRetry);
      parked.push({ child: interruptedRetry, release: null, result: interruptedRetryResult });
      await waitForFile(retryMarker);
      const pendingRetry = roundStatus(prepared.manifestPath, { base }).find(
        ({ slot: number }) => number === 3,
      );
      assert.equal(pendingRetry.status, 'retry-pending');
      assert.equal(pendingRetry.attempt, 2);
      interruptedRetry.kill('SIGKILL');
      assert.equal((await interruptedRetryResult).signal, 'SIGKILL');
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
      mkdirSync(resultsDir, { recursive: true });
      cpSync(
        resolve(REPOSITORY_RESULTS, 'guard-blocks-merge'),
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

      copyRestampedResults(resultsDir);
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
      const blockingRecoveryRelease = resolve(gate, 'release-blocking-recovery');
      const blockingRecovery = runCoreChild(
        'recoverPublication',
        { resultsDir, publicationRoot },
        {
          env: {
            EFFECTIVE_FLOW_EVAL_PAUSE_AT: 'publication-lock-held',
            EFFECTIVE_FLOW_EVAL_PAUSE_MARKER: blockingRecoveryMarker,
            EFFECTIVE_FLOW_EVAL_PAUSE_RELEASE: blockingRecoveryRelease,
          },
        },
      );
      const blockingRecoveryResult = childResult(blockingRecovery);
      parked.push({
        child: blockingRecovery,
        release: blockingRecoveryRelease,
        result: blockingRecoveryResult,
      });
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
      // The holder leaves the lock only now, so the waiting publisher's own budget has to cover
      // two synchronous parent-side file operations rather than another process's startup.
      writeFileSync(blockingRecoveryRelease, 'release');
      assert.equal((await blockingRecoveryResult).code, 0);
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
      const predecessorResultPromise = childResult(predecessor);
      parked.push({ child: predecessor, release: releaseSignal, result: predecessorResultPromise });
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
      const predecessorResult = await predecessorResultPromise;
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
      const serializationRelease = resolve(gate, 'release-publisher-holds-lock');
      const firstPublisher = runCoreChild('publishRound', publicationArguments, {
        env: {
          EFFECTIVE_FLOW_EVAL_PAUSE_AT: 'publication-lock-held',
          EFFECTIVE_FLOW_EVAL_PAUSE_MARKER: serializationMarker,
          EFFECTIVE_FLOW_EVAL_PAUSE_RELEASE: serializationRelease,
        },
      });
      const firstPublisherResult = childResult(firstPublisher);
      parked.push({
        child: firstPublisher,
        release: serializationRelease,
        result: firstPublisherResult,
      });
      await waitForFile(serializationMarker);
      const refusedLiveRecovery = runCoreChild('recoverPublication', {
        resultsDir,
        publicationRoot,
      });
      const refusedLiveRecoveryResult = await childResult(refusedLiveRecovery);
      assert.notEqual(refusedLiveRecoveryResult.code, 0);
      assert.match(refusedLiveRecoveryResult.stderr, /timed out waiting for live publication lock/);
      // Releasing before spawning `secondPublisher` would make the assertion below trivially true:
      // the first publisher might already be finished, and two publications that never overlapped
      // prove nothing about serialization. Instead the second one is spawned into the held lock and
      // observed waiting on it, so the contention is proven rather than timed. Its wait now has to
      // cover the first publisher's entire in-lock publication — a second full `buildPortableSkill`
      // among the rest — so it gets the validator's own ceiling rather than the 10 s default that
      // was sized for a parked hold.
      const secondPublisherMarker = resolve(temporary, 'second-publisher-is-waiting');
      const secondPublisher = runCoreChild('publishRound', publicationArguments, {
        env: {
          EFFECTIVE_FLOW_EVAL_LOCK_WAIT_MARKER: secondPublisherMarker,
          EFFECTIVE_FLOW_EVAL_PUBLICATION_LOCK_WAIT_MS: '30000',
        },
      });
      const secondPublisherResult = childResult(secondPublisher);
      parked.push({ child: secondPublisher, release: null, result: secondPublisherResult });
      await waitForFile(secondPublisherMarker);
      writeFileSync(serializationRelease, 'release');
      const serializedResults = await Promise.all([firstPublisherResult, secondPublisherResult]);
      assert.ok(
        serializedResults.every(({ code }) => code === 0),
        JSON.stringify(serializedResults),
      );

      const recoverySerializationMarker = resolve(temporary, 'recovery-holds-lock');
      const recoverySerializationRelease = resolve(gate, 'release-recovery-holds-lock');
      const firstRecovery = runCoreChild(
        'recoverPublication',
        { resultsDir, publicationRoot },
        {
          env: {
            EFFECTIVE_FLOW_EVAL_PAUSE_AT: 'publication-lock-held',
            EFFECTIVE_FLOW_EVAL_PAUSE_MARKER: recoverySerializationMarker,
            EFFECTIVE_FLOW_EVAL_PAUSE_RELEASE: recoverySerializationRelease,
          },
        },
      );
      const firstRecoveryResult = childResult(firstRecovery);
      parked.push({
        child: firstRecovery,
        release: recoverySerializationRelease,
        result: firstRecoveryResult,
      });
      await waitForFile(recoverySerializationMarker);
      const secondRecovery = runCoreChild('recoverPublication', { resultsDir, publicationRoot });
      const secondRecoveryResult = await childResult(secondRecovery);
      assert.notEqual(secondRecoveryResult.code, 0);
      assert.match(secondRecoveryResult.stderr, /timed out waiting for live publication lock/);
      writeFileSync(recoverySerializationRelease, 'release');
      assert.equal((await firstRecoveryResult).code, 0);

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
      const finalBuildPublisherResultPromise = childResult(finalBuildPublisher);
      parked.push({
        child: finalBuildPublisher,
        release: finalBuildRelease,
        result: finalBuildPublisherResultPromise,
      });
      await waitForFile(finalBuildMarker);
      const finalBuildSealedLog = readFileSync(slot(5).callLog);
      appendFileSync(slot(5).callLog, '\nmutation after final build\n');
      writeFileSync(finalBuildRelease, 'release');
      const finalBuildPublisherResult = await finalBuildPublisherResultPromise;
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
        // The promotion pause has no release path at all; the registry is what keeps this child
        // from stranding the run when an assertion below its marker fails.
        const publisherResult = childResult(publisher);
        parked.push({ child: publisher, release: null, result: publisherResult });
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
        const killed = await publisherResult;
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
      const corruptPublisherResult = childResult(corruptPublisher);
      parked.push({ child: corruptPublisher, release: null, result: corruptPublisherResult });
      await waitForFile(corruptMarker);
      const journalPath = resolve(publicationRoot, '.results-publication.json');
      const corruptJournal = JSON.parse(readFileSync(journalPath, 'utf8'));
      appendFileSync(
        resolve(corruptJournal.candidate, 'guard-blocks-merge', 'run-1.jsonl'),
        '\n{"tampered":true}\n',
      );
      corruptPublisher.kill('SIGKILL');
      await corruptPublisherResult;
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
      // This stays first: a read-only manifest blocks the removals below.
      const manifest = resolve(base, 'round-one', 'manifest.json');
      if (existsSync(manifest)) chmodSync(manifest, 0o644);
      // Kill every registered child and then await its recorded result, so no parked child's pipes
      // hold `node --test` open after a failed assertion. Deliberately no release is written here:
      // a released child would resume into a real publication — a `renameSync` of the canonical
      // results directory — racing both this kill and the removals below.
      for (const { child } of parked) child.kill('SIGKILL');
      for (const { result } of parked) await result;
      rmSync(temporary, { recursive: true, force: true });
      rmSync(gate, { recursive: true, force: true });
    }
  },
);

// The one property the lifecycle test above stopped proving the moment its carried-forward evidence
// began being re-stamped: publication refuses a standing run whose stamp describes a build that is
// not the one being published. That used to be covered incidentally, by whoever ran the suite
// happening to have a modified working tree — a coverage that appeared and disappeared with the
// checkout's cleanliness, and that took the surrounding lifecycle assertions down with it whenever
// it did appear. Asserted on purpose it is both stronger and readable: the drifted run is named
// here, and the case fails for one reason only.
//
// The metadata's `buildDigest` is moved along with the stamp deliberately. Leaving the two
// inconsistent would fail one step earlier, on the binding check, and would prove only that two
// files disagree. What is under test is the comparison against the freshly built identity, and a
// unit that does not bind itself correctly never reaches it.
test(
  'publishRound refuses a carried-forward run whose stamp describes another build',
  { timeout: 120_000 },
  () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-round-drift-'));
    const base = resolve(temporary, 'rounds');
    const publicationRoot = resolve(temporary, 'publication');
    const resultsDir = resolve(publicationRoot, 'results');
    try {
      const prepared = createRound({
        scenarios: ['guard-blocks-merge'],
        profile: PROFILE,
        base,
        roundId: 'drifted-carry-forward',
      });
      for (let slot = 1; slot <= REQUIRED_RUNS; slot += 1) {
        const paths = sandboxPaths(prepared.roundRoot, 'guard-blocks-merge', slot, 1);
        writeFileSync(paths.callLog, legacyLog(paths.projectRoot));
        sealAttempt({
          handle: prepared.manifestPath,
          scenario: 'guard-blocks-merge',
          slot,
          hostReceipt: hostReceipt(paths.projectRoot),
          base,
        });
      }

      mkdirSync(publicationRoot, { recursive: true });
      copyRestampedResults(resultsDir);
      const drifted = resolve(resultsDir, 'merge-proceeds', 'run-1');
      const stamp = JSON.parse(readFileSync(`${drifted}.build.json`, 'utf8'));
      // A moved gate tool, not merely a different top-level digest: the version-stamp waiver
      // accepts a stamp whose only moved skill file is the router, so a fixture that moved nothing
      // identifiable would be waived and this case would pass for the wrong reason.
      stamp.skill.files['tools/merge-gate.md'] = `sha256:${'a'.repeat(64)}`;
      stamp.skill.digest = `sha256:${'b'.repeat(64)}`;
      stamp.skill.versionNeutralDigest = `sha256:${'c'.repeat(64)}`;
      stamp.digest = `sha256:${'d'.repeat(64)}`;
      writeFileSync(`${drifted}.build.json`, `${JSON.stringify(stamp, null, 2)}\n`);
      const metadata = JSON.parse(readFileSync(`${drifted}.metadata.json`, 'utf8'));
      metadata.buildDigest = stamp.digest;
      writeFileSync(`${drifted}.metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`);

      assert.throws(
        () => publishRound({ handle: prepared.manifestPath, base, resultsDir, publicationRoot }),
        /merge-proceeds\/run-1 is invalid evidence: the build identity does not match the round manifest/,
      );
      // A refused publication leaves the standing corpus exactly as it found it: no generation
      // marker, and no candidate or backup tree left behind to be recovered into place later.
      assert.equal(existsSync(resolve(resultsDir, '.generation.json')), false);
      assert.deepEqual(
        readdirSync(publicationRoot).filter((name) =>
          /^\.results-(?:candidate|backup)-/.test(name),
        ),
        [],
      );
    } finally {
      const manifest = resolve(base, 'drifted-carry-forward', 'manifest.json');
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

const ROUND_CLI = resolve(import.meta.dirname, '..', 'evals', 'merge-gate', 'round.mjs');

function runVerify(resultsDir, args = []) {
  return spawnSync(process.execPath, [ROUND_CLI, 'verify', ...args], {
    encoding: 'utf8',
    env: { ...process.env, EFFECTIVE_FLOW_EVAL_VERIFY_RESULTS_DIR: resultsDir },
  });
}

test('verify rejects an inapplicable flag and an unknown mode value', () => {
  for (const [args, expected] of [
    [['--round', 'some-round'], /verify does not accept --round/],
    [['--mode', 'quiet'], /--mode accepts report or strict, not quiet/],
    // The empty-ish forms the parser already refuses, asserted for `verify` too: `--mode` without
    // a value must not read as "default to report".
    [['--mode'], /--mode requires a value/],
  ]) {
    const result = spawnSync(process.execPath, [ROUND_CLI, 'verify', ...args], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, args.join(' '));
    assert.match(result.stderr, expected, args.join(' '));
  }
});

// The split the release gate rests on, asserted through the process exit code because that is the
// only thing a workflow step reads.
//
// **A verdict and a failure to produce one must not arrive the same way.** Report mode exits 0 for
// every state it can reach, stale included, so the step this work adds cannot turn an ordinary
// pull request red; it exits nonzero only when no verdict exists at all. Without that split the
// CLI's shared error path — which exits 1 for any thrown error — would make a broken build red on
// every pull request through the very step introduced to prevent that.
test(
  'verify separates a stale or absent verdict from a failure to reach one',
  { timeout: 120_000 },
  () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-verify-'));
    try {
      // Re-stamped first, so the corpus is current whatever the working tree holds and the states
      // below are the ones this test put there rather than ones it inherited.
      const resultsDir = resolve(temporary, 'results');
      copyRestampedResults(resultsDir);
      const drifted = resolve(resultsDir, 'merge-proceeds', 'run-1.build.json');
      const stamp = JSON.parse(readFileSync(drifted, 'utf8'));
      stamp.skill.files['tools/merge-gate.md'] = `sha256:${'a'.repeat(64)}`;
      stamp.skill.digest = `sha256:${'b'.repeat(64)}`;
      stamp.skill.versionNeutralDigest = `sha256:${'c'.repeat(64)}`;
      stamp.digest = `sha256:${'d'.repeat(64)}`;
      writeFileSync(drifted, `${JSON.stringify(stamp, null, 2)}\n`);
      rmSync(resolve(resultsDir, 'linked-issue-open-points'), { recursive: true, force: true });

      const report = runVerify(resultsDir);
      assert.equal(report.status, 0, `report mode must not fail on a verdict: ${report.stderr}`);
      assert.match(report.stdout, /merge-proceeds\tstale\t/);
      assert.match(report.stdout, /linked-issue-open-points\tabsent\t/);
      assert.match(report.stdout, /guard-blocks-merge\tcurrent\t/);
      // The moved file, named. This is the bisect list a stale report exists to hand over, and a
      // report that only said "stale" would send an operator to re-record a round blind.
      assert.match(report.stdout, /~ tools\/merge-gate\.md/);
      // And the pair of digests the moved file explains. The list says what changed; these two say
      // which builds are being compared, which is what lets an operator match a stale run against
      // a round manifest or against the stamps beside it instead of taking the verdict on trust.
      assert.match(
        report.stdout,
        new RegExp(`^ {4}archived: ${stamp.digest}$`, 'm'),
        report.stdout,
      );
      assert.match(report.stdout, /^ {4}current: {2}sha256:[0-9a-f]{64}$/m, report.stdout);

      const strict = runVerify(resultsDir, ['--mode', 'strict']);
      assert.equal(strict.status, 1);
      assert.match(strict.stderr, /merge-proceeds is stale/);
      assert.match(strict.stderr, /linked-issue-open-points is absent/);

      // The other direction: an archived file that cannot be read is not a verdict about the gate,
      // so both modes fail — and the message names the run rather than a byte offset.
      const unreadable = resolve(temporary, 'unreadable-results');
      cpSync(REPOSITORY_RESULTS, unreadable, { recursive: true });
      // The copied generation marker pins a digest of the bytes as archived, and the tamper below
      // moves them. Left in place it would fail the generation read `verify` now pins its walk
      // with — an integrity error about the marker, raised before the walk this case is about ever
      // ran — and the assertion would pass for a different reason than the one it names. Removing
      // it leaves an unmarked ("legacy") corpus, which is exactly what `copyRestampedResults`
      // hands its own callers and a state both reads tolerate.
      rmSync(resolve(unreadable, '.generation.json'), { force: true });
      writeFileSync(resolve(unreadable, 'merge-proceeds', 'run-1.build.json'), 'not json\n');
      const operational = runVerify(unreadable);
      assert.notEqual(operational.status, 0);
      assert.match(operational.stderr, /merge-proceeds\/run-1\.build\.json is unreadable/);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);

// The third state, kept in its own case because it is the one the neighbour above cannot hold: its
// three scenarios are already spoken for as stale, absent and current, and a short round has to be
// a fourth, independent one or the four verdicts stop being separable.
//
// **A short round fails strict even though every run it does have is current.** That is the whole
// point of the state: the archived runs are fresh, the stamps match, nothing drifted — the round
// was simply never finished, and at a release point "nothing was observed" is not an acceptable
// answer. Dropping `short` from `failsStrict` would leave every other assertion in this file green
// while the gate waved through a release backed by a partial round, which is the failure the gate
// exists to prevent. Report mode still exits 0, because an unfinished round is a verdict and not a
// failure to produce one.
//
// Short is also asserted apart from absent on purpose: an interrupted round and a round nobody
// started need different remedies, and a report that collapsed them would send an operator to
// re-record work that is mostly already recorded.
test(
  'verify fails strict on a short round whose archived runs are all current',
  { timeout: 120_000 },
  () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-verify-short-'));
    try {
      // Re-stamped first, so every remaining run is current and the verdict below can only come
      // from the run count. Without that, a drifted working tree would reach `short` through
      // `stale` and the test would pass for the wrong reason.
      const resultsDir = resolve(temporary, 'results');
      copyRestampedResults(resultsDir);
      const shortScenario = 'unreported-checks-block-merge';
      const directory = resolve(resultsDir, shortScenario);
      // One slot removed, not all of them: the boundary this protects is "fewer than required", and
      // deleting the directory would only re-assert the absent case the neighbour already covers.
      for (const name of readdirSync(directory).filter((entry) =>
        entry.startsWith(`run-${REQUIRED_RUNS}.`),
      )) {
        rmSync(resolve(directory, name));
      }

      const report = runVerify(resultsDir);
      assert.equal(report.status, 0, `report mode must not fail on a verdict: ${report.stderr}`);
      assert.match(
        report.stdout,
        new RegExp(
          `^${shortScenario}\\tshort\\t${REQUIRED_RUNS - 1}/${REQUIRED_RUNS} run\\(s\\)`,
          'm',
        ),
        report.stdout,
      );

      const strict = runVerify(resultsDir, ['--mode', 'strict']);
      assert.equal(strict.status, 1, `a short round must fail strict: ${strict.stdout}`);
      // The first stderr line lists every scenario strict rejected, so asserting it in full also
      // asserts that the short verdict stayed scoped to the scenario this test shortened.
      assert.equal(strict.stderr.split('\n')[0], `${shortScenario} is short`);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);

// The count wrong in the other direction, and its own state rather than a flavour of `short`. A
// single `runs.length !== REQUIRED_RUNS` test reports six archived runs as `short 6/5 run(s)` and
// sends an operator to finish a round that is already over-complete, when the actual question is
// what put a sixth slot in a published directory — a hand copy, an interrupted publication, two
// rounds merged by hand. `ensureCanonicalGeneration` refuses the same shape at publication as
// unexpected files, so the report names it too instead of calling it something else.
//
// Like `short` it fails strict while every run it holds is current: a directory of an unexpected
// size is not evidence anybody can read as five of five, whichever side of five it is on.
test(
  'verify reports a surplus round apart from a short one and fails strict on it',
  { timeout: 120_000 },
  () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-verify-surplus-'));
    try {
      // Re-stamped first, for the same reason as the short case: the verdict below has to come
      // from the run count and not from a drifted working tree.
      const resultsDir = resolve(temporary, 'results');
      copyRestampedResults(resultsDir);
      const surplusScenario = 'unreported-checks-block-merge';
      const directory = resolve(resultsDir, surplusScenario);
      const extra = REQUIRED_RUNS + 1;
      for (const name of readdirSync(directory).filter((entry) =>
        entry.startsWith(`run-${REQUIRED_RUNS}.`),
      )) {
        cpSync(
          resolve(directory, name),
          resolve(directory, name.replace(`run-${REQUIRED_RUNS}.`, `run-${extra}.`)),
        );
      }

      const report = runVerify(resultsDir);
      assert.equal(report.status, 0, `report mode must not fail on a verdict: ${report.stderr}`);
      assert.match(
        report.stdout,
        new RegExp(`^${surplusScenario}\\tsurplus\\t${extra}/${REQUIRED_RUNS} run\\(s\\)`, 'm'),
        report.stdout,
      );
      assert.doesNotMatch(report.stdout, new RegExp(`^${surplusScenario}\\tshort\\t`, 'm'));

      const strict = runVerify(resultsDir, ['--mode', 'strict']);
      assert.equal(strict.status, 1, `a surplus round must fail strict: ${strict.stdout}`);
      assert.equal(strict.stderr.split('\n')[0], `${surplusScenario} is surplus`);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);

// Every file under a tree, by content rather than by name. A name listing catches an added or a
// deleted file and nothing else, and the write a command that claims to be read-only is most likely
// to make by accident is an in-place rewrite: a re-stamp, a normalised JSON file, a generation
// marker refreshed in place. All three leave the listing identical.
function treeDigests(root) {
  return Object.fromEntries(
    readdirSync(root, { recursive: true })
      .filter((name) => statSync(resolve(root, name)).isFile())
      .sort()
      .map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(resolve(root, name)))
          .digest('hex'),
      ]),
  );
}

test('verify reports the repository corpus without writing to it', { timeout: 120_000 }, () => {
  const before = treeDigests(REPOSITORY_RESULTS);
  const result = spawnSync(process.execPath, [ROUND_CLI, 'verify'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  // The corpus the verdict is about, named in the output. A report that says six scenarios are
  // current without saying what it read cannot be told apart from one about some other directory.
  assert.equal(result.stdout.split('\n')[0], `corpus: ${REPOSITORY_RESULTS}`);
  for (const scenario of discoverSuite().scenarios) {
    assert.match(
      result.stdout,
      new RegExp(`^${scenario}\t\\w+\t`, 'm'),
      `verify reported nothing about ${scenario}`,
    );
  }
  assert.deepEqual(treeDigests(REPOSITORY_RESULTS), before);
});

// The seam's empty form, which is the ordinary shape of an unset workflow input: a value that is
// set and empty must read as unset, not as a path. The empty string resolves against the process
// working directory, so without the fallback every scenario would report `absent`, report mode
// would exit 0, and a CI step would look like it had verified a corpus it never opened. Asserted
// through the printed corpus line, because the path is the only thing that separates the two
// readings from outside the process.
test(
  'verify falls back to the repository corpus when the seam is set but empty',
  { timeout: 120_000 },
  () => {
    const result = spawnSync(process.execPath, [ROUND_CLI, 'verify'], {
      encoding: 'utf8',
      env: { ...process.env, EFFECTIVE_FLOW_EVAL_VERIFY_RESULTS_DIR: '' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.split('\n')[0], `corpus: ${REPOSITORY_RESULTS}`);
    for (const scenario of discoverSuite().scenarios) {
      assert.doesNotMatch(
        result.stdout,
        new RegExp(`^${scenario}\tabsent\t`, 'm'),
        `${scenario} read as absent, so the empty value was taken as a path`,
      );
    }
  },
);

// Runs `verify` with its walk stopped at every scenario, so the corpus can be moved underneath a
// read that is already in progress. `publishRound` renames the canonical directory away and the
// candidate into its place, and this reproduces what a walk sees while those renames happen —
// without a publication, which would need a three-hour round's worth of evidence to reach the same
// two instants.
//
// The loop deletes the marker **before** it writes the release, and the boundary in `round-core`
// consumes the release, so the next marker this sees can only be the next pause. That is what lets
// a single controller drive both the first walk and the retry: a gate that stayed open would let
// the retry read a settled corpus and report an ordinary verdict, and the error this test exists
// to assert would never be raised.
//
// `grants` is the count of pauses answered, and it is the only thing that says from outside the
// process how many walks ran: one walk pauses once per scenario, a walk plus its retry twice that.
async function driveVerifyWalk(resultsDir, { tear = false } = {}) {
  const gate = mkdtempSync(join(tmpdir(), 'effective-flow-verify-gate-'));
  const marker = resolve(gate, 'paused');
  const release = resolve(gate, 'release');
  const child = spawn(process.execPath, [ROUND_CLI, 'verify'], {
    env: {
      ...process.env,
      EFFECTIVE_FLOW_EVAL_VERIFY_RESULTS_DIR: resultsDir,
      EFFECTIVE_FLOW_EVAL_PAUSE_AT: 'verify-scenario-read',
      EFFECTIVE_FLOW_EVAL_PAUSE_MARKER: marker,
      EFFECTIVE_FLOW_EVAL_PAUSE_RELEASE: release,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const finished = childResult(child);
  let running = true;
  finished.then(() => (running = false));
  let grants = 0;
  try {
    while (running) {
      if (!existsSync(marker)) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 10));
        continue;
      }
      rmSync(marker, { force: true });
      // One file per pause, at the top level of the corpus: `scenarioFreshness` never looks at it,
      // so the per-scenario verdicts stay what they were, while the generation's content digest
      // moves — which is precisely a corpus that changed under a walk and not one whose evidence
      // changed.
      if (tear) writeFileSync(resolve(resultsDir, `torn-${grants}.txt`), `${grants}\n`);
      grants += 1;
      writeFileSync(release, 'go');
    }
    return { ...(await finished), grants };
  } finally {
    rmSync(gate, { recursive: true, force: true });
  }
}

// The window `verify` has to survive, and the reason it survives it without a lock. Between
// `publishRound`'s two renames the canonical results directory is briefly absent and then briefly
// the *other* generation, so a concurrent walk can report every scenario `absent` or mix one
// scenario from each side. `verify` is documented as safe beside a round and beside a publication
// and is run in CI on every pull request, so it cannot take the publication lock to close that
// window: it would block behind the publication that ends a three-hour round and wait out a lock
// left by a killed one. It pins the generation instead — read before the walk, read again after —
// and a walk that does not stay on one generation produced no verdict at all.
//
// **A torn read has to leave through the error path, not the verdict path.** Both modes exit
// nonzero for it, exactly as they do for an unreadable stamp: a fabricated verdict about a corpus
// nobody managed to read is the one answer a release gate must never give.
test(
  'verify fails rather than reporting a verdict when the corpus moves under both walks',
  { timeout: 240_000 },
  async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-verify-torn-'));
    try {
      const resultsDir = resolve(temporary, 'results');
      cpSync(REPOSITORY_RESULTS, resultsDir, { recursive: true });
      // Unmarked, so the tear below is read as a corpus that moved rather than as a marker whose
      // digest no longer describes its directory. Both are operational errors and neither is a
      // verdict, but only the first is the race this test is about.
      rmSync(resolve(resultsDir, '.generation.json'), { force: true });

      const torn = await driveVerifyWalk(resultsDir, { tear: true });
      assert.notEqual(torn.code, 0, `a torn read must not produce a verdict: ${torn.stdout}`);
      assert.match(torn.stderr, /the archived corpus changed while it was being read, twice over/);
      assert.match(torn.stderr, new RegExp(resultsDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      // No scenario line was printed: the CLI prints the report only after `verifyFreshness`
      // returns, and a run that threw has nothing to print.
      assert.doesNotMatch(torn.stdout, /\tcurrent\t|\tstale\t|\tabsent\t/);
      // Two walks, one retry, and no third attempt. Retrying until the corpus settles would turn a
      // fast failure into an open-ended one in a CI step that holds a runner.
      assert.equal(torn.grants, discoverSuite().scenarios.length * 2);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);

// The other direction, and the half that keeps the guard from being free to get wrong: a corpus
// nobody touches is walked once and reported once. A retry that fired on every run would double
// the cost of the step on every pull request and, worse, would hide a real tear behind a second
// walk nobody asked for.
test('verify walks a settled corpus once and does not retry it', { timeout: 240_000 }, async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-verify-settled-'));
  try {
    const resultsDir = resolve(temporary, 'results');
    // Copied with its generation marker, so the settled walk goes through the marked branch of
    // `generationInfo` rather than the unmarked one its neighbour above uses.
    cpSync(REPOSITORY_RESULTS, resultsDir, { recursive: true });

    const settled = await driveVerifyWalk(resultsDir);
    assert.equal(settled.code, 0, `a settled corpus must reach a verdict: ${settled.stderr}`);
    assert.equal(settled.grants, discoverSuite().scenarios.length);
    for (const scenario of discoverSuite().scenarios) {
      assert.match(
        settled.stdout,
        new RegExp(`^${scenario}\t\\w+\t`, 'm'),
        `verify reported nothing about ${scenario}`,
      );
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

// The configured-reviewer scenario is the one scenario whose slots differ from the shared build:
// its own skill copy carries the `iterate` echo, its own project carries the reviewer rows, and its
// evidence unit carries a third file. None of that may leak into the round's shared build or into
// another scenario's slot, and the echo trace has to be sealed, evaluated, and retried like the
// call log it is paired with.
const CONFIGURED = 'configured-reviewer-set-aside-blocks';
const ECHO_SOURCE = resolve(
  import.meta.dirname,
  '..',
  'evals',
  'merge-gate',
  '_scaffold',
  'iterate-echo.md',
);

function configuredHandoff(fixture) {
  const [review] = fixture.operations['pr-reviews-read'].envelope.data.result;
  return [
    'Item filter: threads=PRRT_kwDOconfiguredReviewer',
    `Boundary token: ${'C'.repeat(32)}`,
    `Thread item: ${'A'.repeat(32)} | thread=PRRT_kwDOconfiguredReviewer`,
    `Item: ${'B'.repeat(32)} | review=${review.id} | author=${review.author.login} | url=${review.url}`,
    'Summary comment: suppressed',
    'Next steps: suppressed',
    'Review guard: established',
    '--- caller-supplied item text follows ---',
    review.body,
  ].join('\n');
}

test(
  'the configured-reviewer slots carry their overlay and a sealed, evaluated echo trace',
  { timeout: 120_000 },
  () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-round-configured-'));
    const base = resolve(temporary, 'rounds');
    try {
      const prepared = createRound({
        scenarios: [CONFIGURED, 'guard-blocks-merge'],
        profile: PROFILE,
        base,
        roundId: 'configured-round',
      });
      const echo = readFileSync(ECHO_SOURCE, 'utf8');
      const shared = prepared.manifest.builtSkillRoot;
      assert.notEqual(
        readFileSync(resolve(shared, 'tools', 'iterate.md'), 'utf8'),
        echo,
        'the echo overlay leaked into the shared round build',
      );
      assert.equal(existsSync(resolve(shared, 'scripts', 'iterate-trace.mjs')), false);

      const guard = sandboxPaths(prepared.roundRoot, 'guard-blocks-merge', 1, 1);
      assert.notEqual(readFileSync(resolve(guard.skillRoot, 'tools', 'iterate.md'), 'utf8'), echo);
      assert.equal(existsSync(guard.iterateLog), false);
      assert.doesNotMatch(
        readFileSync(
          resolve(guard.projectRoot, 'docs', 'adr', 'effective-flow-project-setup.md'),
          'utf8',
        ),
        /mergeGate\.bots/,
      );

      const fixture = JSON.parse(
        readFileSync(
          resolve(
            import.meta.dirname,
            '..',
            'evals',
            'merge-gate',
            'fixtures',
            `${CONFIGURED}.json`,
          ),
          'utf8',
        ),
      );
      const delegated = sandboxPaths(prepared.roundRoot, CONFIGURED, 1, 1);
      assert.equal(readFileSync(resolve(delegated.skillRoot, 'tools', 'iterate.md'), 'utf8'), echo);
      assert.ok(existsSync(resolve(delegated.skillRoot, 'scripts', 'iterate-trace.mjs')));
      assert.equal(readFileSync(delegated.iterateLog, 'utf8'), '');
      assert.match(
        readFileSync(
          resolve(delegated.projectRoot, 'docs', 'adr', 'effective-flow-project-setup.md'),
          'utf8',
        ),
        /\| mergeGate\.bots +\| recensor +\|/,
      );
      const rendered = readFileSync(delegated.prompt, 'utf8');
      assert.ok(rendered.includes(`"cwd":"${delegated.projectRoot}"`));
      assert.ok(!rendered.includes('{{'));

      const echoRun = spawnSync(
        process.execPath,
        [resolve(delegated.skillRoot, 'scripts', 'iterate-trace.mjs'), '42'],
        { cwd: delegated.projectRoot, input: configuredHandoff(fixture), encoding: 'utf8' },
      );
      assert.equal(echoRun.status, 0, echoRun.stderr);
      writeFileSync(delegated.callLog, legacyLog(delegated.projectRoot));
      sealAttempt({
        handle: prepared.manifestPath,
        scenario: CONFIGURED,
        slot: 1,
        hostReceipt: hostReceipt(delegated.projectRoot),
        base,
      });
      const statusOf = (slot) =>
        roundStatus(prepared.manifestPath, { base }).find(
          (row) => row.scenario === CONFIGURED && row.slot === slot,
        ).status;
      assert.equal(statusOf(1), 'sealed');
      const evaluated = evaluateEvidence({
        scenario: CONFIGURED,
        logText: readFileSync(delegated.callLog, 'utf8'),
        fixture,
        projectRoot: delegated.projectRoot,
        answerableOperations: new Set(Object.keys(fixture.operations)),
        iterateTraceText: readFileSync(delegated.iterateLog, 'utf8'),
      });
      assert.deepEqual(evaluated.validityProblems, []);
      assert.deepEqual(evaluated.findings, []);

      appendFileSync(delegated.iterateLog, '\n');
      assert.equal(statusOf(1), 'changed-after-seal', 'a post-seal echo-trace write went unseen');

      // A run that never delegated leaves an empty trace: valid evidence of a behavioural deviation,
      // which is published as a finding and may not be retried away.
      const silent = sandboxPaths(prepared.roundRoot, CONFIGURED, 2, 1);
      writeFileSync(silent.callLog, legacyLog(silent.projectRoot));
      sealAttempt({
        handle: prepared.manifestPath,
        scenario: CONFIGURED,
        slot: 2,
        hostReceipt: hostReceipt(silent.projectRoot),
        base,
      });
      assert.equal(statusOf(2), 'sealed');
      assert.throws(
        () => retryInvalid({ handle: prepared.manifestPath, scenario: CONFIGURED, slot: 2, base }),
        /valid behavioural findings/,
      );

      // A missing trace cannot be sealed at all.
      const missing = sandboxPaths(prepared.roundRoot, CONFIGURED, 3, 1);
      writeFileSync(missing.callLog, legacyLog(missing.projectRoot));
      rmSync(missing.iterateLog);
      assert.throws(
        () =>
          sealAttempt({
            handle: prepared.manifestPath,
            scenario: CONFIGURED,
            slot: 3,
            hostReceipt: hostReceipt(missing.projectRoot),
            base,
          }),
        /no paired iterate trace/,
      );
    } finally {
      const manifest = resolve(base, 'configured-round', 'manifest.json');
      if (existsSync(manifest)) chmodSync(manifest, 0o644);
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);

test('the evaluator requires the echo trace for the configured scenario and forbids it elsewhere', () => {
  const projectRoot = '/tmp/round/project';
  const fixture = JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, '..', 'evals', 'merge-gate', 'fixtures', `${CONFIGURED}.json`),
      'utf8',
    ),
  );
  const common = {
    logText: legacyLog(projectRoot),
    fixture,
    projectRoot,
    answerableOperations: new Set(Object.keys(fixture.operations)),
  };
  assert.ok(
    evaluateEvidence({ ...common, scenario: CONFIGURED }).validityProblems.includes(
      'the run has no paired iterate trace',
    ),
  );
  assert.ok(
    evaluateEvidence({
      ...common,
      scenario: CONFIGURED,
      iterateTraceText: '{not json\n',
    }).validityProblems.some((problem) => /iterate trace line 1 is not JSON/.test(problem)),
  );
  const empty = evaluateEvidence({ ...common, scenario: CONFIGURED, iterateTraceText: '' });
  assert.deepEqual(empty.validityProblems, []);
  assert.ok(empty.findings.some((finding) => /invoked the iterate echo 0 time/.test(finding)));
  assert.ok(
    evaluateEvidence({
      ...common,
      scenario: 'guard-blocks-merge',
      iterateTraceText: '',
    }).validityProblems.includes('an iterate trace is orphaned in a scenario without an echo'),
  );
});
