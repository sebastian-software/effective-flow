import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateEvidence, evidenceDisposition } from '../evals/_scaffold/evaluate.mjs';
import * as iterateEvaluator from '../evals/iterate/_scaffold/evaluate.mjs';

test('fixture drift preserves iterate findings that do not depend on the current fixture', () => {
  const report = JSON.stringify({
    schema: 'effective-flow/iterate-report-channel/v1',
    seq: 1,
    text: 'ABORT: duplicated control line',
    bytes: 30,
    digest: `sha256:${'0'.repeat(64)}`,
    bound: 32768,
    truncated: false,
    malformed: false,
    raw: null,
  });
  const parsed = iterateEvaluator.parseReportChannel(report);
  const findings = iterateEvaluator.fixtureIndependentFindings({
    scenario: 'duplicated-control-line-aborts',
    records: [
      {
        operation: 'pr-merge',
        apply: false,
        at: '2026-11-04T00:00:00.000Z',
        cwd: '/fixture',
        seq: 1,
      },
    ],
    auxiliaryRecords: parsed.records,
  });
  assert.match(findings.join('\n'), /forge call/);
});

test('fixture drift defers fixture-dependent judgment but preserves independent archive corruption', () => {
  const suite = {
    name: 'fixture-drift',
    scenarios: ['drift'],
    alwaysAllowedOperations: [],
    auxiliaryEvidence: { required: () => true, missingMessage: 'missing trace' },
    sealedEvidence: { required: () => true, missingMessage: 'missing state' },
    evaluator: {
      usesLifecycleSchema: () => false,
      validityProblems: () => ['current fixture is incompatible'],
      findings: () => ['current fixture cannot judge archived behaviour'],
      parseAuxiliary: (text) => ({ records: [], problems: text === '{}' ? [] : ['corrupt trace'] }),
      parseSealedEvidence: (text) => ({
        state: {},
        problems: text === '{}' ? [] : ['corrupt state'],
      }),
    },
  };
  const input = {
    scenario: 'drift',
    logText: JSON.stringify({
      seq: 1,
      at: '2026-11-04T00:00:00.000Z',
      cwd: '/fixture',
      operation: 'read',
      apply: false,
    }),
    projectRoot: '/fixture',
    fixture: {},
    answerableOperations: new Set(),
    supportedOperations: new Set(['read']),
    auxiliaryText: '{}',
    sealedEvidenceText: '{}',
  };
  const current = evaluateEvidence(suite, input);
  assert.ok(current.validityProblems.includes('fixture leaves supported operation read undefined'));
  assert.ok(current.validityProblems.includes('current fixture is incompatible'));
  const drift = { ...input, fixtureCompatible: false };
  assert.deepEqual(evaluateEvidence(suite, drift).validityProblems, []);
  assert.deepEqual(evaluateEvidence(suite, drift).findings, []);
  for (const [field, value, expected] of [
    ['logText', 'not-json', /JSON/],
    ['auxiliaryText', 'bad', /corrupt trace/],
    ['sealedEvidenceText', 'bad', /corrupt state/],
    ['projectRoot', '/foreign', /expected \/foreign/],
  ]) {
    const result = evaluateEvidence(suite, { ...drift, [field]: value });
    assert.match(result.validityProblems.join('\n'), expected);
    assert.equal(
      evidenceDisposition([
        { state: 'stale', integrity: 'invalid', validityProblems: result.validityProblems },
      ]).failsReport,
      true,
    );
  }
});

test('package evidence distinguishes debt, integrity and valid negatives for every suite', () => {
  // Invariant: freshness/coverage is not acceptance and cannot hide a subordinate corruption or
  // negative finding. These are verifier fixtures, never archived model evidence.
  for (const scenario of ['merge-gate', 'iterate', 'next-steps', 'build-context', 'focus']) {
    for (const state of [
      'current',
      'stale',
      'absent',
      'short',
      'waived',
      'missing-stamp',
      'unproven',
      'surplus',
      'invalid',
    ]) {
      const report = evidenceDisposition([{ scenario, state, integrity: 'valid', runs: [] }]);
      assert.equal(
        report.failsReport,
        ['surplus', 'invalid'].includes(state),
        `${scenario}: ${state}`,
      );
      assert.equal(report.debt.length > 0, !['current', 'waived'].includes(state));
    }
    for (const state of ['short', 'stale']) {
      const corrupt = evidenceDisposition([
        {
          scenario,
          state,
          runs: [
            {
              slot: 1,
              state: 'invalid',
              freshness: 'stale',
              integrity: 'invalid',
              validityProblems: ['corrupt receipt'],
            },
          ],
        },
      ]);
      assert.equal(corrupt.failsReport, true, `${scenario}: ${state} plus corrupt`);
      assert.ok(corrupt.debt.some((s) => s.includes(state)));
    }
    const negative = evidenceDisposition([
      {
        scenario,
        state: 'stale',
        runs: [
          { slot: 1, state: 'stale', integrity: 'valid', findings: ['recorded unsafe action'] },
        ],
      },
    ]);
    assert.equal(negative.failsReport, false);
    assert.equal(negative.findings.length, 1);
    assert.match(negative.findings[0], /recorded unsafe action/);
    const staleLane = evidenceDisposition([
      {
        scenario,
        state: 'stale',
        integrity: 'invalid',
        validityProblems: ['bad seal'],
        findings: ['failed native lane'],
        runs: [],
      },
    ]);
    assert.equal(staleLane.failsReport, true);
    assert.equal(staleLane.findings.length, 1);
    assert.equal(
      evidenceDisposition([{ scenario, state: 'unproven', integrity: 'invalid', runs: [] }])
        .failsReport,
      true,
    );
  }
});

test('unknown, missing and malformed evidence dispositions fail closed', () => {
  // Invariant: a verifier cannot convert an unclassifiable or unchecked result into report success.
  for (const rows of [
    [],
    null,
    [{ state: 'unknown' }],
    [{ state: 'unproven' }],
    [{ state: 'current', findings: 'bad' }],
    [{ state: 'current', integrity: 'unchecked' }],
    [{ state: 'stale', runs: [{}] }],
  ])
    assert.throws(
      () => evidenceDisposition(rows),
      /missing|unclassifiable|malformed|independent integrity/,
    );
});
