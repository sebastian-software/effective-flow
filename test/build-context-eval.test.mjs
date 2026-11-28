import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  CASES,
  CELL_NAMES,
  GATES,
  REQUIRED_ROLES,
  SCHEMA,
  digestValue,
  requireThat,
} from '../evals/build-context/_scaffold/protocol.mjs';
import {
  captureHostEvidence,
  digest,
  validateSpawnObservations,
} from '../evals/build-context/_scaffold/transcript.mjs';
import {
  median,
  nearestRank,
  nativeProblems,
  readSealedRecord,
  summarizeMatrix,
  verifyAdditionalEvidence,
} from '../evals/build-context/_scaffold/evidence.mjs';
import { parseState } from '../evals/build-context/_scaffold/capture.mjs';
import suite from '../evals/build-context/suite.config.mjs';
import { discoverSuite } from '../evals/_scaffold/suite.mjs';
import {
  FORBIDDING_RULE,
  HARNESS_BRANCH,
  MACHINE_BASE,
  prepareVariantFixture,
} from '../evals/build-context/_scaffold/setup.mjs';
import {
  helperInvocation,
  observedHelperEvent,
} from '../evals/build-context/_scaffold/helper-observation.mjs';
import { BASELINE_COMMIT, envelope } from '../evals/build-context/_scaffold/host-receipt.mjs';
import { claudeUserInput } from '../evals/build-context/_scaffold/claude-process.mjs';
import { runtimePin } from '../evals/build-context/_scaffold/claude-runtime.mjs';
import {
  buildPortableSkill,
  canonicalDigest,
  digestOf,
  pristineScenarioBuildIdentity,
} from '../evals/_scaffold/build-identity.mjs';
import { evidenceDisposition } from '../evals/_scaffold/evaluate.mjs';

test('stale auxiliary identities cannot hide invalid receipts or native/paired lane findings', (t) => {
  // Invariant: source drift and subordinate lane integrity are independent; a structurally sealed
  // test record is not valid execution evidence merely because its candidate is old.
  const root = mkdtempSync(path.join(tmpdir(), 'build-context-disposition-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const skillRoot = buildPortableSkill(root);
  const resultsDir = path.join(root, 'results');
  mkdirSync(path.join(resultsDir, '_auxiliary'), { recursive: true });
  const current = pristineScenarioBuildIdentity(suite, 'approved-single-module', skillRoot);
  const stale = structuredClone(current);
  stale.skill.files['tools/build.md'] = digestOf('older source');
  stale.skill.digest = canonicalDigest(stale.skill.files);
  stale.skill.versionNeutralDigest = digestOf('older neutral source');
  stale.digest = digestOf(
    [stale.skill.digest, stale.instrument.digest, stale.scenario_inputs.digest].join('\n'),
  );
  const record = {
    schema: SCHEMA,
    kind: 'pair',
    harness: 'codex-cli',
    complexity: 'simple',
    slot: 1,
    baselineRevision: BASELINE_COMMIT,
    baselineIdentity: current,
    candidateIdentity: stale,
    baselineRun: validRun(
      {
        parentPeakInput: 100,
        firstRequestInput: 100,
        cumulativeInput: 100,
        elapsedMs: 100,
        identityKey: 'baseline',
      },
      true,
    ),
    candidateRun: validRun({
      parentPeakInput: 20,
      firstRequestInput: 20,
      cumulativeInput: 30,
      elapsedMs: 100,
      identityKey: 'candidate',
    }),
    instrumentDigest: current.instrument.digest,
  };
  const recordPath = path.join(resultsDir, '_auxiliary', 'fixture.json');
  const write = (value) =>
    writeFileSync(
      recordPath,
      JSON.stringify({ schema: SCHEMA, record: value, seal: digest(JSON.stringify(value)) }),
    );
  write(record);
  const rows = verifyAdditionalEvidence(suite, { skillRoot, resultsDir });
  const paired = rows.find((row) => row.scenario === 'paired:codex-cli:simple');
  assert.equal(paired.state, 'stale');
  assert.equal(paired.integrity, 'invalid');
  assert.ok(paired.validityProblems.length > 0);
  assert.ok(paired.findings.length > 0);
  assert.equal(evidenceDisposition(rows).failsReport, true);
  write({ ...record, kind: 'native', target: 'unknown' });
  const malformed = verifyAdditionalEvidence(suite, { skillRoot, resultsDir });
  assert.equal(evidenceDisposition(malformed).failsReport, true);
  assert.ok(
    malformed.some((row) =>
      row.validityProblems?.includes('malformed native lane or missing execution'),
    ),
  );
  write({
    ...record,
    kind: 'native',
    target: 'codex',
    run: record.candidateRun,
    candidateIdentity: current,
    nativeIdentity: {
      skillDigest: digest('old skill'),
      sidecarsDigest: digest('old sidecars'),
      inventoryDigest: digest('old inventory'),
    },
  });
  const nativeDrift = verifyAdditionalEvidence(suite, { skillRoot, resultsDir });
  assert.equal(nativeDrift.find((row) => row.scenario === 'native:codex').state, 'stale');
  assert.equal(
    evidenceDisposition(nativeDrift).failsReport,
    true,
    'independent bad receipts still block under native drift',
  );
  write({ ...record, kind: 'unknown' });
  assert.throws(
    () => verifyAdditionalEvidence(suite, { skillRoot, resultsDir }),
    /unknown auxiliary record kind/,
  );
});

test('build-context evidence protocol declares the complete behavioural and compatibility matrix', () => {
  assert.equal(SCHEMA, 'effective-flow.build-context/1');
  assert.deepEqual(CELL_NAMES, [
    'codex-cli:simple',
    'codex-cli:review-correction',
    'claude-code:simple',
    'claude-code:review-correction',
  ]);
  assert.equal(Object.keys(CASES).length, 9);
  assert.deepEqual(CASES['harness-branch-adoption'], ['adopted-clean-branch']);
  assert.deepEqual(CASES['worktree-location-conflict'], ['visible-rule-no-variable']);
  assert.deepEqual(CASES['worktree-base-difference'], ['difference-reported-once']);
  assert.deepEqual(REQUIRED_ROLES, [
    'implementer',
    'test-writer',
    'independent-review',
    'validator',
  ]);
  assert.equal(GATES.length, 11);
  for (const [scenario, cases] of Object.entries(CASES)) {
    assert.ok(scenario.length > 0);
    assert.ok(cases.length > 0);
    assert.ok(cases.every((name) => typeof name === 'string' && name.length > 0));
  }
});

// Invariant: the three worktree-location scenarios are registered, defined, fixtured and branched
// on by the evaluator (the corpus parity), and each is recordable: the generated project documents
// and the host-controlled variant setup supply exactly the rule, ADR base, harness worktree and
// machine base the scenario names, and the evaluator fails each variant on its observable breach.
test('the worktree-location scenarios keep the corpus in parity and are recordable', (t) => {
  const names = [
    'harness-branch-adoption',
    'worktree-location-conflict',
    'worktree-base-difference',
  ];
  const { scenarios } = discoverSuite(suite);
  for (const name of names) assert.ok(scenarios.includes(name), name);

  const docs = (scenario) => suite.projectDocuments({ scenario, rows: [] });
  assert.match(docs('approved-single-module').setupAdr, /\| worktree\.enabled \| false \|/);
  for (const name of names) assert.match(docs(name).setupAdr, /\| worktree\.enabled \| true \|/);
  assert.ok(docs('worktree-location-conflict').agents.includes(FORBIDDING_RULE.trim()));
  assert.ok(!docs('approved-single-module').agents.includes('Worktree locations'));
  assert.match(
    docs('worktree-base-difference').setupAdr,
    /\| worktree\.baseDir \| \.effective-flow\/\.configured-worktrees \|/,
  );
  const prompt = readFileSync(
    new URL('../evals/build-context/scenarios/worktree-location-conflict.md', import.meta.url),
    'utf8',
  );
  assert.match(prompt.split('<!-- prompt:end -->')[0], /\nRun state: non-interactive\n/);

  // Variant setup on a fresh fixture root: a clean harness worktree on its own untracked branch
  // at the base, and a private existing machine base the launch environment declares.
  const root = mkdtempSync(path.join(tmpdir(), 'build-context-variant-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = (name) => {
    const project = path.join(root, name, 'project');
    mkdirSync(project, { recursive: true });
    const git = (...args) => execFileSync('git', args, { cwd: project, stdio: 'pipe' });
    git('init', '--quiet', '--initial-branch=develop');
    git('config', 'user.email', 'eval@example.invalid');
    git('config', 'user.name', 'Eval');
    git('config', 'commit.gpgsign', 'false');
    git('remote', 'add', 'origin', 'https://example.invalid/flow.git');
    writeFileSync(path.join(project, 'README.md'), '# fixture\n');
    git('add', '--all');
    git('-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'seed');
    suite.prepareCheckout({
      scenario: name,
      fixture: JSON.parse(
        readFileSync(
          new URL(`../evals/build-context/fixtures/${name}.json`, import.meta.url),
          'utf8',
        ),
      ),
      projectRoot: project,
    });
    return project;
  };
  const harness = fixture('harness-branch-adoption');
  const adoption = prepareVariantFixture({
    scenario: 'harness-branch-adoption',
    fixtureRoot: harness,
  });
  assert.deepEqual(adoption.environment, {});
  const linked = (...args) =>
    execFileSync('git', args, {
      cwd: adoption.executionRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  assert.equal(linked('branch', '--show-current'), HARNESS_BRANCH);
  assert.equal(linked('rev-parse', 'HEAD'), linked('rev-parse', 'refs/remotes/origin/develop'));
  assert.equal(linked('status', '--porcelain'), '');
  assert.throws(() => linked('rev-parse', '--abbrev-ref', '@{upstream}'));
  assert.equal(
    execFileSync('git', ['status', '--porcelain'], { cwd: harness, encoding: 'utf8' }),
    '',
    'the harness worktree stays outside the main checkout status',
  );
  assert.throws(
    () => prepareVariantFixture({ scenario: 'harness-branch-adoption', fixtureRoot: harness }),
    'a started root is never prepared twice',
  );
  const based = fixture('worktree-base-difference');
  const difference = prepareVariantFixture({
    scenario: 'worktree-base-difference',
    fixtureRoot: based,
  });
  const base = difference.environment.EFFECTIVE_FLOW_WORKTREE_BASE_DIR;
  assert.equal(base, realpathSync(path.join(based, MACHINE_BASE)));
  assert.equal(statSync(base).mode & 0o777, 0o700);
  assert.equal(
    execFileSync('git', ['status', '--porcelain'], { cwd: based, encoding: 'utf8' }),
    '',
  );
  assert.deepEqual(
    prepareVariantFixture({ scenario: 'approved-single-module', fixtureRoot: based }),
    { environment: {}, executionRoot: null },
  );

  // The evaluator fails each variant on its observable breach and passes its observable part.
  const findings = (name, run) =>
    suite.evaluator.scenarioFindings(
      name,
      { schema: SCHEMA, scenario: name, errors: [], variants: [run] },
      [],
    );
  const state = (operation, extra = {}) => ({
    family: 'state',
    operation,
    ok: true,
    baseSource: 'default',
    diagnostics: [],
    ...extra,
  });
  const buildRun = (operation, extra = {}) => ({
    family: 'build-run',
    operation,
    ok: true,
    ...extra,
  });
  const conflict = (helperEvents) =>
    findings('worktree-location-conflict', { name: 'visible-rule-no-variable', helperEvents });
  const conflictProblems = (events) =>
    conflict(events).filter((problem) => problem.startsWith('visible-rule-no-variable:'));
  const stopped = [
    state('worktree path-resolve'),
    buildRun('terminal', { conclusionKeyword: 'ABORT: worktree-location-conflict' }),
  ];
  assert.deepEqual(conflictProblems(stopped), []);
  assert.ok(
    conflictProblems([...stopped, state('worktree path-prepare')]).some((p) =>
      /path-prepare ran/.test(p),
    ),
  );
  assert.ok(
    conflictProblems([...stopped, buildRun('transition-execution')]).some((p) =>
      /created its worktree/.test(p),
    ),
  );
  assert.ok(
    conflictProblems([state('worktree path-resolve'), buildRun('terminal')]).some((p) =>
      /no observed ABORT: worktree-location-conflict/.test(p),
    ),
  );
  assert.ok(
    conflictProblems([
      state('worktree path-resolve', { baseSource: 'environment' }),
      stopped[1],
    ]).some((p) => /no path resolved without an environment base/.test(p)),
  );
  const differenceProblems = (helperEvents) =>
    findings('worktree-base-difference', { name: 'difference-reported-once', helperEvents }).filter(
      (problem) => problem.startsWith('difference-reported-once:'),
    );
  const environment = state('worktree path-resolve', {
    baseSource: 'environment',
    diagnostics: ['configured-base-differs'],
  });
  assert.deepEqual(differenceProblems([environment]), []);
  assert.ok(differenceProblems([state('worktree path-resolve')]).length);
  assert.ok(differenceProblems([environment, state('worktree path-resolve')]).length);
  const adoptionProblems = (helperEvents) =>
    findings('harness-branch-adoption', { name: 'adopted-clean-branch', helperEvents }).filter(
      (problem) => problem.startsWith('adopted-clean-branch:'),
    );
  const adopted = [buildRun('authorize-execution', { branchSource: 'adopted' })];
  assert.deepEqual(adoptionProblems(adopted), []);
  assert.ok(adoptionProblems([...adopted, state('worktree path-prepare')]).length);
  assert.ok(adoptionProblems([...adopted, state('worktree record-init')]).length);
});

// Invariant: the instrument observes the runtime-state helper only in its one shipped here-string
// shape, reading the base source and diagnostics but never the path, and a terminal conclusion's
// leading keyword.
test('runtime-state helper calls and terminal keywords are observed without paths', () => {
  const call = helperInvocation({
    cmd: `node /skill/scripts/effective-flow-state.mjs worktree path-resolve <<< '{"cwd":"/repo","purpose":"delivery","sessionId":"it'\\''s"}'`,
  });
  assert.equal(call.family, 'state');
  assert.equal(call.operation, 'worktree path-resolve');
  assert.equal(call.input.sessionId, "it's");
  assert.equal(
    helperInvocation({
      cmd: `node /skill/scripts/effective-flow-state.mjs worktree path-resolve <<< '{}' | cat`,
    }),
    null,
  );
  const tool = {
    callAt: 1,
    at: 2,
    id: 'call-1',
    name: 'exec_command',
    arguments: {
      cmd: `node /skill/scripts/effective-flow-state.mjs worktree path-resolve <<< '{"cwd":"/repo"}'`,
    },
  };
  const event = observedHelperEvent(
    tool,
    {
      ok: true,
      operation: 'worktree path-resolve',
      result: {
        source: 'environment',
        worktreePath: '/machine/base/repo/session',
        diagnostics: [{ code: 'configured-base-differs', key: 'worktree.baseDir' }],
      },
    },
    {
      session: 'root',
      sourceDigest: 'digest',
      alias: (value) => value,
      agentSession: () => null,
      roots: { state: '/skill/scripts/effective-flow-state.mjs' },
    },
  );
  assert.equal(event.baseSource, 'environment');
  assert.deepEqual(event.diagnostics, ['configured-base-differs']);
  assert.ok(!JSON.stringify(event).includes('/machine/base'), 'no machine path is observed');
  const terminal = observedHelperEvent(
    {
      ...tool,
      arguments: {
        cmd: 'node /skill/scripts/build-run.mjs terminal <<\'EOF\'\n{"conclusion":"ABORT: worktree-location-conflict — Worktree provisioning stopped."}\nEOF',
      },
    },
    { ok: true, operation: 'terminal', result: {} },
    {
      session: 'root',
      sourceDigest: 'digest',
      alias: (value) => value,
      agentSession: () => null,
      roots: { 'build-run': '/skill/scripts/build-run.mjs' },
    },
  );
  assert.equal(terminal.conclusionKeyword, 'ABORT: worktree-location-conflict');
});

test('build-context protocol helpers fail closed at the evidence boundary', () => {
  const valid = `sha256:${'a'.repeat(64)}`;
  assert.equal(digestValue(valid), true);
  for (const value of ['', 'sha256:short', `sha256:${'A'.repeat(64)}`, null, 42])
    assert.equal(digestValue(value), false);

  assert.doesNotThrow(() => requireThat(true, 'must pass'));
  assert.throws(() => requireThat(false, 'missing evidence'), /missing evidence/);
});

test('each declared compatibility cell requires five paired slots before gate calculations', () => {
  assert.equal(CELL_NAMES.length, 4);
  const requiredSlotsPerCell = 5;
  const expectedPortablePairs = CELL_NAMES.length * requiredSlotsPerCell;
  assert.equal(expectedPortablePairs, 20);
  assert.equal(REQUIRED_ROLES.includes('test-writer'), true);
});

test('host evidence derives descendant model, effort, role, association and completion from transcripts', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'build-context-transcript-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const rootTranscript = [
    {
      type: 'session_meta',
      id: 'root-thread',
      payload: { id: 'root-thread' },
      timestamp: '2026-10-20T10:00:00Z',
    },
    {
      type: 'turn_context',
      timestamp: '2026-10-20T10:00:00Z',
      payload: { model: 'gpt-root', reasoning_effort: 'medium' },
    },
    {
      type: 'event_msg',
      timestamp: '2026-10-20T10:00:03Z',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: { input_tokens: 100, total_tokens: 120 },
          total_token_usage: { input_tokens: 100, cached_input_tokens: 10 },
        },
      },
    },
    { type: 'event_msg', timestamp: '2026-10-20T10:00:04Z', payload: { type: 'task_complete' } },
  ];
  const rootPath = path.join(root, 'root.jsonl');
  writeFileSync(rootPath, `${rootTranscript.map(JSON.stringify).join('\n')}\n`);
  const evidence = captureHostEvidence({
    harness: 'codex-cli',
    profile: { model: 'gpt-root', reasoningEffort: 'medium' },
    sessions: [{ alias: 'root', path: rootPath, parent: null, target: 'portable' }],
  });
  assert.deepEqual(
    evidence.observations.map(({ session, parent }) => [session, parent]),
    [['root', null]],
  );
  assert.equal(evidence.observations[0].role, 'parent');
  assert.equal(evidence.observations[0].actualModel, 'gpt-root');
  assert.equal(evidence.observations[0].requestedEffort, 'medium');
  assert.equal(evidence.observations[0].complete, true);
  assert.deepEqual(
    validateSpawnObservations(evidence.observations, {
      target: 'portable',
      requiredRoles: [],
    }),
    [],
  );
});

test('spawn validation rejects missing, mismatched and incomplete descendant observations', () => {
  assert.deepEqual(validateSpawnObservations([], { requiredRoles: ['implementer'] }), [
    'missing per-spawn observations',
  ]);
  const observations = [
    {
      session: 'root',
      parent: null,
      role: 'root',
      target: 'portable',
      requestedModel: 'a',
      actualModel: 'b',
      requestedEffort: 'medium',
      actualEffort: 'low',
      complete: false,
      sourceDigest: 'sha256:' + 'a'.repeat(64),
    },
  ];
  const problems = validateSpawnObservations(observations, { requiredRoles: ['implementer'] });
  assert.ok(problems.some((problem) => problem.includes('mismatched actual')));
  assert.ok(problems.some((problem) => problem.includes('missing required implementer')));
});

function validRun(metrics, baseline = false, timing = 200, harness = 'codex-cli') {
  const claude = harness === 'claude-code';
  const policyDigest = digest('native-policy'),
    trackerInitialDigest = digest(''),
    execArgumentsDigest = digest(JSON.stringify(['codex', 'exec', '--ignore-user-config'])),
    wrapperDigest = digest(
      readFileSync(
        new URL(
          claude
            ? '../evals/build-context/_scaffold/claude-process-probe.mjs'
            : '../evals/build-context/_scaffold/native-sandbox-probe.mjs',
          import.meta.url,
        ),
      ),
    ),
    protectedRootDigests = [digest('root'), digest('home'), digest('codex-home')],
    writeRootDigests = [digest('fixture'), digest('git'), digest('ledger')];
  const observations = ['parent', ...REQUIRED_ROLES].map((role, index) => ({
    session: role,
    sessionIdentity: digest('session-' + role + '-' + (metrics.identityKey ?? 'unit')),
    parent: index === 0 ? null : 'parent',
    role,
    target: 'portable',
    requestedModel: `model-${role}`,
    actualModel: `model-${role}`,
    requestedEffort: 'medium',
    actualEffort: 'medium',
    complete: true,
    startedAt: 210 + index,
    completedAt: 220 + index,
    sourceDigest: digest('transcript-' + role + '-' + (metrics.identityKey ?? 'unit')),
    roleEvidence: {
      contractDigest: digest('contract-' + role),
      assignmentDigest: digest('assignment-' + role),
      native: false,
    },
  }));
  const settings = {
    harness,
    model: claude ? 'claude-root' : 'root',
    effort: 'medium',
    reportedVersion: claude ? '2.1.292' : '0.163.0',
    toolPolicy: claude ? 'isolated fixture; provider proxy' : 'isolated fixture',
  };
  const nativeSandbox = {
    kind: claude ? 'claude-process' : 'codex-native',
    policyDigest,
    execArgumentsDigest,
    binaryDigest: digest('codex-binary'),
    writeRootDigests,
    protectedRootDigests,
    ...(claude
      ? {
          runtimeDigest: runtimePin().membershipDigest,
          providerDomainsDigest: digest(JSON.stringify(['api.anthropic.com'])),
        }
      : {}),
  };
  const prepared = envelope('prepared', {
    preparedAt: 100,
    condition: baseline ? 'baseline' : 'candidate',
    slot: metrics.slot ?? 1,
    harness,
    complexity: metrics.complexity ?? 'simple',
    profile: settings,
    settings,
    settingsDigest: digest(JSON.stringify(settings)),
    transcriptDestinationWasEmpty: true,
    fixture: { head: digest('fixture') },
    promptDigest: digest('prompt'),
    ...(claude ? { inputDigest: digest(claudeUserInput('prompt')) } : {}),
    reviewBasis: { criteriaDigest: digest('criteria'), assignmentDigest: digest('assignment') },
    trackerInitialDigest,
    nativeSandbox,
    build: envelope('build', {
      source: { commit: baseline ? BASELINE_COMMIT : digest('candidate-commit'), clean: true },
      membership: { files: { 'SKILL.md': digest('skill') } },
      membershipDigest: digest('membership'),
    }),
  });
  const launch = envelope('launch', {
    prepared,
    preparedSeal: prepared.seal,
    freshRoot: true,
    initialPromptObserved: true,
    firstUserDigest: digest('first-user'),
    rootSourceDigest: observations[0].sourceDigest,
    rootIdentity: observations[0].sessionIdentity,
    firstAt: timing,
    lastAt: timing + 300,
    processes: [
      {
        trackerMirror: {
          sourceDigest: trackerInitialDigest,
          archiveDigest: trackerInitialDigest,
          priorDigest: trackerInitialDigest,
          prefixBytes: 0,
          sourceBytes: 0,
          addedEntries: 0,
        },
        settingsObservationDigest: prepared.payload.settingsDigest,
        startedAt: timing,
        finishedAt: timing + 300,
        exitCode: 0,
        launchArgumentsDigest: execArgumentsDigest,
        ...(!claude
          ? {
              rootIdentity: observations[0].sessionIdentity,
              inputDigest: prepared.payload.promptDigest,
              transcriptBasisDigest: digest('transcript-basis'),
            }
          : {}),
        ...(claude
          ? {
              captureDigest: digest('claude-capture'),
              collectorDigest: digest(
                readFileSync(
                  new URL(
                    '../evals/build-context/_scaffold/claude-stream-worker.mjs',
                    import.meta.url,
                  ),
                ),
              ),
              inputDigest: digest(claudeUserInput('prompt')),
            }
          : {}),
        guard: {
          schema: SCHEMA + '/native-guard',
          kind: claude ? 'claude-process' : 'codex-native',
          writeDenied: true,
          inheritedDenied: true,
          denied: protectedRootDigests.length + 1,
          fixtureRead: true,
          fixtureWrite: true,
          gitCommit: true,
          gitPush: true,
          stubLedger: true,
          wrapperDigest,
          binaryDigest: nativeSandbox.binaryDigest,
          reportedVersion: settings.reportedVersion,
          policyDigest,
          execArgumentsDigest,
          sandboxArgumentsDigest: digest('sandbox-arguments'),
          debugPromptDigest: digest('debug-prompt'),
          stdoutDigest: digest('guard-stdout'),
          startedAt: timing - 20,
          finishedAt: timing - 1,
          protectedRootDigests,
          writeRootDigests,
          ...(claude
            ? {
                fileEditDenied: true,
                fileWriteDenied: true,
                networkDenied: true,
                runtimeDigest: nativeSandbox.runtimeDigest,
                providerDomainsDigest: digest(JSON.stringify(['api.anthropic.com'])),
              }
            : {}),
        },
        policyDigest,
        stdoutDigest: digest('stdout'),
      },
    ],
  });
  const body = {
    harness,
    profile: {
      harness,
      model: settings.model,
      reasoningEffort: 'medium',
      reportedVersion: settings.reportedVersion,
      toolPolicy: settings.toolPolicy,
    },
    observations,
    metrics,
    acceptance: { exitCode: 0, outputDigest: digest('acceptance') },
    review: {
      sourceDigest: observations[3].sourceDigest,
      reviewerSessionIdentity: observations[3].sessionIdentity,
      reviewedContentDigest: digest('reviewed'),
      criteriaDigest: digest('criteria'),
      assignmentDigest: digest('assignment'),
      blinded: true,
      critical: 0,
      important: 0,
      missedSeededBlockers: 0,
      unauthorizedActions: 0,
      falseCompletion: 0,
      skippedValidation: 0,
    },
    reworkRounds: 0,
    correctionRounds: 0,
    helperEvents: baseline
      ? []
      : [
          {
            family: 'build-run',
            operation: 'verify-terminal',
            ok: true,
            status: 'DONE',
            gates: GATES,
          },
        ],
    baselineGates: baseline
      ? GATES.map((gate) => ({ gate, observed: true, sourceDigest: digest('gate-' + gate) }))
      : undefined,
    terminalVerification: baseline
      ? undefined
      : { sourceDigest: digest('terminal'), status: 'DONE' },
    nativePolicyProof: {
      kind: claude ? 'claude-process' : 'codex-native',
      policyDigest,
      sessions: observations.map((observation) =>
        claude
          ? {
              sessionIdentity: observation.sessionIdentity,
              sourceDigest: observation.sourceDigest,
              captures: [{ processIndex: 0, captureDigest: digest('claude-capture') }],
            }
          : {
              sessionIdentity: observation.sessionIdentity,
              sourceDigest: observation.sourceDigest,
              contexts: 1,
              observedPolicyDigest: policyDigest,
            },
      ),
    },
    trackerLedgerProof: {
      initialDigest: trackerInitialDigest,
      finalDigest: trackerInitialDigest,
      actualCalls: 0,
    },
  };
  const completion = envelope('completion', {
    launch,
    protection: 'os-enforced',
    runDigest: digest(JSON.stringify(body)),
  });
  const gates = GATES.map((gate) => ({
    gate,
    observed: true,
    sourceDigest: `sha256:${'b'.repeat(64)}`,
  }));
  return { ...body, provenance: completion };
}

test('matrix uses paired medians and nearest-rank p95, while failed attempts remain counted', () => {
  assert.equal(median([2, 4, 8]), 4);
  assert.equal(nearestRank([120000, 70000, 90000, 110000, 100000], 0.95), 120000);
  const records = [];
  for (const cell of CELL_NAMES) {
    const [harness, complexity] = cell.split(':');
    for (let slot = 1; slot <= 5; slot++) {
      records.push({
        kind: 'pair',
        harness,
        complexity,
        slot,
        order: slot % 2 ? 'baseline-first' : 'candidate-first',
        fixtureHead: `sha256:${'1'.repeat(64)}`,
        userInstructionDigest: `sha256:${'2'.repeat(64)}`,
        profileDigest: `sha256:${'3'.repeat(64)}`,
        freshRoot: true,
        baselineRun: validRun(
          {
            parentPeakInput: 100,
            firstRequestInput: 1000,
            cumulativeInput: 100,
            elapsedMs: 100,
            slot,
            complexity,
            identityKey: `${cell}-${slot}-baseline`,
          },
          true,
          slot % 2 ? 200 : 600,
          harness,
        ),
        candidateRun: validRun(
          {
            parentPeakInput: 20,
            firstRequestInput: 1000,
            cumulativeInput: 30,
            elapsedMs: 100,
            slot,
            complexity,
            identityKey: `${cell}-${slot}-candidate`,
          },
          false,
          slot % 2 ? 600 : 200,
          harness,
        ),
      });
    }
  }
  const summary = summarizeMatrix(records);
  assert.equal(summary.cells.length, CELL_NAMES.length);
  for (const cell of summary.cells) {
    assert.equal(cell.state, 'current', cell.cell);
    assert.equal(cell.pairs, 5, cell.cell);
    assert.equal(cell.metrics.parentPeakRatio, 0.2, cell.cell);
    assert.equal(cell.metrics.cumulativeInputRatio, 0.3, cell.cell);
    assert.equal(cell.metrics.p95Estimator, 'nearest-rank; n=5 is maximum', cell.cell);
  }
  const substituted = records.map((record, index) =>
    index === 10
      ? {
          ...record,
          candidateRun: { ...record.candidateRun, harness: 'codex-cli' },
        }
      : record,
  );
  const substitutedSummary = summarizeMatrix(substituted);
  assert.equal(substitutedSummary.cells[2].state, 'unproven');
  assert.ok(
    substitutedSummary.cells[2].problems.some((problem) =>
      /declared cell differs|run differs from host completion/.test(problem),
    ),
  );
  const failed = summarizeMatrix([
    ...records,
    {
      kind: 'attempt',
      harness: 'codex-cli',
      complexity: 'simple',
      slot: 1,
      outcome: 'failed',
      failure: { code: 'HOST_ERROR' },
    },
  ]);
  assert.equal(failed.cells[0].state, 'unproven');
  assert.equal(failed.failed, 1);
});

test('sealed evidence and state readers reject missing, malformed, and tampered records', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'build-context-sealed-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(parseState('not-json').problems.length, 1);
  assert.deepEqual(
    parseState(
      JSON.stringify({
        schema: SCHEMA,
        scenario: 'approved-single-module',
        variants: [],
        errors: [],
      }),
    ).problems,
    [],
  );
  const sealed = path.join(root, 'record.json');
  writeFileSync(
    sealed,
    JSON.stringify({
      schema: SCHEMA,
      record: { schema: SCHEMA },
      seal: `sha256:${'0'.repeat(64)}`,
    }),
  );
  assert.throws(() => readSealedRecord(sealed), /invalid auxiliary seal/);
  const missing = verifyAdditionalEvidence(suite, { skillRoot: root, resultsDir: root });
  assert.equal(missing[1].state, 'absent');
  assert.match(missing[1].details, /20 pairs/);
});

test('native compatibility validation requires the pinned target, active pilot, Fast consumption, Quality continuation and one same-agent resume', () => {
  const run = validRun({
    parentPeakInput: 100,
    firstRequestInput: 100,
    cumulativeInput: 100,
    elapsedMs: 100,
  });
  run.observations = run.observations.map((observation) => ({
    ...observation,
    target: 'codex',
    role: observation.role === 'parent' ? 'build-runner' : observation.role,
  }));
  run.observations.push({
    session: 'fast',
    parent: 'parent',
    role: 'fast-implementer',
    target: 'codex',
    requestedModel: 'fast-model',
    actualModel: 'fast-model',
    requestedEffort: 'low',
    actualEffort: 'low',
    complete: true,
    sourceDigest: `sha256:${'f'.repeat(64)}`,
  });
  run.helperEvents.push(
    { family: 'pilot', operation: 'start', ok: true, generationState: 'active' },
    { family: 'pilot', operation: 'start-packet', ok: true },
    { family: 'pilot', operation: 'finalize', ok: true },
    { family: 'build-run', operation: 'question', ok: true, session: 'parent' },
    { family: 'build-run', operation: 'reply', ok: true },
    { family: 'build-run', operation: 'resume', ok: true },
  );
  run.agentContinuations = [{ session: 'parent' }];
  run.nativePilot = {
    generationState: 'active',
    completionStatus: 'completed',
    qualityCorrectionRounds: 1,
    packets: [{ selectedProfile: 'fast', attempt: 'started' }],
  };
  const problems = nativeProblems({ target: 'codex', harness: 'codex-cli', run });
  assert.ok(problems.includes('run differs from host completion'));
  assert.ok(problems.includes('native lifecycle chronology is missing or reversed'));
  assert.ok(problems.includes('native event lacks actual closed invocation evidence'));
  const missingReceipt = nativeProblems({
    target: 'codex',
    harness: 'codex-cli',
    run: { ...run, provenance: undefined },
  });
  assert.ok(missingReceipt.includes('missing or changed host completion receipt'));
  for (const field of ['rootIdentity', 'inputDigest', 'transcriptBasisDigest']) {
    const mutated = validRun({
      parentPeakInput: 100,
      firstRequestInput: 100,
      cumulativeInput: 100,
      elapsedMs: 100,
    });
    const launchPayload = mutated.provenance.payload.launch.payload,
      processes = launchPayload.processes.map((process, index) =>
        index === 0
          ? Object.fromEntries(Object.entries(process).filter(([key]) => key !== field))
          : process,
      ),
      launch = envelope('launch', { ...launchPayload, processes }),
      completionPayload = { ...mutated.provenance.payload, launch },
      body = { ...mutated, provenance: undefined };
    mutated.provenance = envelope('completion', {
      ...completionPayload,
      runDigest: digest(JSON.stringify(body)),
    });
    assert.ok(
      nativeProblems({ target: 'codex', harness: 'codex-cli', run: mutated }).includes(
        'actual native turn root/input/prefix binding missing',
      ),
      field,
    );
  }
  assert.ok(
    nativeProblems({ target: 'codex', harness: 'claude-code', run }).includes(
      'native target/harness mismatch',
    ),
  );
});
