import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
import { BASELINE_COMMIT, envelope } from '../evals/build-context/_scaffold/host-receipt.mjs';

test('build-context evidence protocol declares the complete behavioural and compatibility matrix', () => {
  assert.equal(SCHEMA, 'effective-flow.build-context/1');
  assert.deepEqual(CELL_NAMES, [
    'codex-cli:simple',
    'codex-cli:review-correction',
    'claude-code:simple',
    'claude-code:review-correction',
  ]);
  assert.equal(Object.keys(CASES).length, 6);
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

function validRun(metrics, baseline = false, timing = 200) {
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
  const settings = { harness: 'codex-cli', model: 'root', effort: 'medium' };
  const prepared = envelope('prepared', {
    preparedAt: 100,
    condition: baseline ? 'baseline' : 'candidate',
    slot: metrics.slot ?? 1,
    harness: 'codex-cli',
    complexity: metrics.complexity ?? 'simple',
    settings,
    settingsDigest: digest(JSON.stringify(settings)),
    transcriptDestinationWasEmpty: true,
    fixture: { head: digest('fixture') },
    promptDigest: digest('prompt'),
    reviewBasis: { criteriaDigest: digest('criteria'), assignmentDigest: digest('assignment') },
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
        settingsObservationDigest: prepared.payload.settingsDigest,
        startedAt: timing,
        finishedAt: timing + 300,
        exitCode: 0,
        guard: { writeDenied: true, wrapperDigest: digest('wrapper') },
        policyDigest: digest('policy'),
        stdoutDigest: digest('stdout'),
      },
    ],
  });
  const body = {
    harness: 'codex-cli',
    profile: { harness: 'codex-cli', model: 'root', reasoningEffort: 'medium' },
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
        ),
      });
    }
  }
  const summary = summarizeMatrix(records);
  assert.equal(summary.cells[0].state, 'current');
  assert.equal(summary.cells[0].metrics.parentPeakRatio, 0.2);
  assert.equal(summary.cells[0].metrics.cumulativeInputRatio, 0.3);
  assert.equal(summary.cells[0].metrics.p95Estimator, 'nearest-rank; n=5 is maximum');
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
  assert.ok(
    nativeProblems({ target: 'codex', harness: 'claude-code', run }).includes(
      'native target/harness mismatch',
    ),
  );
});
