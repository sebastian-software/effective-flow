import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseExecutionProfileContract,
  assertExecutionProfileContract,
  EXECUTION_PROFILE_GATE_REASONS,
  EXECUTION_PROFILE_FALLBACKS,
  EXECUTION_PROFILE_PILOT_CONTROL_OUTCOMES,
  EXECUTION_PROFILE_TRANSFER_FIELDS,
} from '../build-lib.mjs';

const ROOT = new URL('..', import.meta.url);
const CONTEXT = 'src/shared/execution-profiles.md';
const executionProfileSource = readFileSync(
  new URL('src/shared/execution-profiles.md', ROOT),
  'utf8',
);
const executionProfileContract = parseExecutionProfileContract(executionProfileSource, {
  context: CONTEXT,
});

const EXPECTED_GATE_EVIDENCE = [
  'Native target, complete profile mapping, available spawn mechanism, and no host override that erases the distinction',
  'Approved affected-domain evidence shows no authentication, authorization, or trust-boundary change',
  'Approved scope contains no destructive data operation',
  'Approved scope contains no data, schema, or compatibility migration',
  'Affected paths and approved source show no concurrency or shared-ownership change',
  'Affected paths and approved source show no unsafe-language or unsafe-runtime surface',
  'No public compatibility contract changes',
  'No unresolved merge conflict',
  'Exact allowed paths and one owner per path',
  'Cross-packet and cross-domain dependencies are resolved',
  'The source passed the owning workflow approval gate; completion and repository-native validation are measurable; required decisions are closed',
  'Every preceding row passed',
];

const EXPECTED_DECISION_MAPPINGS = [
  ['gate-selected-quality', 'first-exclusion', 'quality', 'none', 'false'],
  ['profile-unavailable-before-spawn', 'profile-unavailable', 'quality', 'none', 'false'],
  ['fast-spawn-rejected-after-attempt', 'eligible', 'quality', 'spawn-rejected', 'true'],
  ['fast-worker-abort-after-attempt', 'eligible', 'quality', 'worker-abort', 'true'],
  ['fast-missing-context-escalation', 'eligible', 'quality', 'missing-context', 'true'],
  ['fast-scope-growth-escalation', 'eligible', 'quality', 'scope-growth', 'true'],
  ['fast-new-decision-escalation', 'eligible', 'quality', 'new-decision', 'true'],
  ['fast-requirements-mismatch-escalation', 'eligible', 'quality', 'requirements-mismatch', 'true'],
  ['fast-keywordless-resume-exhausted', 'eligible', 'quality', 'keywordless-exhausted', 'true'],
  ['fast-scope-incident-escalation', 'eligible', 'quality', 'scope-incident', 'true'],
].map(([event, gateDecision, selectedProfile, fallback, fastAttemptConsumed]) => ({
  event,
  gateDecision,
  selectedProfile,
  fallback,
  fastAttemptConsumed,
}));

const PROHIBITED_FAST_ACTIVATION_PATTERNS = [
  /\b(?:spawn_agent|spawn|delegate)\b[^\n]{0,120}\bfast\b/i,
  /\b(?:request|route)\b[^\n]{0,120}\bfast\s+(?:profile|worker|model|implementation)\b/i,
  /\b(?:request|route)\b[^\n]{0,120}\b(?:profile|model)\s*[:=]\s*["'`]?fast\b/i,
  /^\s*(?:model|execution_profile|executionProfile|selectedProfile|implementationProfile|profile)\s*[:=]\s*["'`]?fast\b/im,
  /\{\{AGENT:[^}\n]*fast[^}\n]*\}\}/i,
  /\beffective-flow-[\w-]*fast[\w-]*\b/i,
];

const EXPECTED_WORKERS = [
  'code-documenter',
  'code-validator',
  'docs-writer',
  'e2e-tester',
  'frontend-reviewer',
  'generic-implementer',
  'generic-product-implementer',
  'generic-product-reviewer',
  'marketing-writer',
  'merge-conflict-resolver',
  'nodejs-implementer',
  'nodejs-reviewer',
  'rust-implementer',
  'rust-reviewer',
  'test-writer',
  'ui-implementer',
];

const EXPECTED_FAST_WORKERS = [
  'generic-implementer',
  'generic-product-implementer',
  'nodejs-implementer',
  'rust-implementer',
  'ui-implementer',
];

const EXPECTED_TOOLS = [
  'apply',
  'apply-issues',
  'apply-plan',
  'apply-review',
  'apply-review-commit-mechanics',
  'apply-review-remote',
  'build',
  'cleanup',
  'commit',
  'concept',
  'concept-review',
  'deliver',
  'docs',
  'fix',
  'investigate',
  'iterate',
  'maintain',
  'merge-gate',
  'open-plans',
  'plan',
  'plan-issue',
  'plan-review',
  'pr',
  'pr-review',
  'refactor',
  'review',
  'setup',
  'version',
];

const EXPECTED_RUNTIME_SCRIPTS = [
  'delegation-envelope-core.mjs',
  'delegation-envelope.mjs',
  'delivery-selection-core.mjs',
  'delivery-selection.mjs',
  'remote-tracker-core.mjs',
  'remote-tracker-decomposition-core.mjs',
  'remote-tracker-forgejo-core.mjs',
  'remote-tracker-github-core.mjs',
  'remote-tracker-shared-core.mjs',
  'remote-tracker.mjs',
];

function cloneContract() {
  return structuredClone(executionProfileContract);
}

function assertContractMutation(mutate, expected) {
  const mutated = cloneContract();
  mutate(mutated);
  assert.throws(
    () => assertExecutionProfileContract(mutated, { context: 'mutated-contract.md' }),
    expected,
  );
}

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

function findProhibitedFastActivations(source) {
  return PROHIBITED_FAST_ACTIVATION_PATTERNS.filter((pattern) => pattern.test(source)).map(
    (pattern) => pattern.source,
  );
}

test('the canonical execution-profile contract parses and validates as one closed policy', () => {
  assert.doesNotThrow(() =>
    assertExecutionProfileContract(executionProfileContract, { context: CONTEXT }),
  );
  assert.deepEqual(Object.keys(executionProfileContract), [
    'profiles',
    'configCases',
    'gate',
    'states',
    'decisionMappings',
    'transitions',
    'rules',
    'fallbacks',
    'controls',
    'transferFields',
  ]);
  assert.throws(
    () => assertExecutionProfileContract(null, { context: 'null.md' }),
    /contract must be an object.*null\.md/,
  );
  const missing = cloneContract();
  delete missing.controls;
  assert.throws(
    () => assertExecutionProfileContract(missing, { context: 'missing.md' }),
    /missing parsed tables: controls.*missing\.md/,
  );
});

test('profiles are provider-neutral and keep Quality as the safe default', () => {
  assert.deepEqual(executionProfileContract.profiles, [
    {
      profile: 'quality',
      intent: 'strongest-available-configured-implementation-capability',
    },
    {
      profile: 'fast',
      intent: 'distinct-native-lower-cost-lower-latency-capability',
    },
  ]);
  assert.doesNotMatch(
    executionProfileContract.profiles.map(({ intent }) => intent).join('\n'),
    /claude|codex|model[- ]?(?:id|name)|opus|sonnet|haiku|gpt/i,
  );
  assertContractMutation((contract) => {
    contract.profiles[0].profile = 'default';
  }, /profile vocabulary row 1 must use profile "quality"/);
});

test('the eligibility gate pins exact positive evidence in priority order through its terminal', () => {
  assert.deepEqual(EXECUTION_PROFILE_GATE_REASONS, [
    'profile-unavailable',
    'trust-boundary',
    'destructive-data',
    'migration',
    'concurrency',
    'unsafe-code',
    'public-compatibility',
    'merge-conflict',
    'unclear-ownership',
    'cross-domain-dependency',
    'unknown-evidence',
  ]);
  assert.ok(Object.isFrozen(EXECUTION_PROFILE_GATE_REASONS));
  assert.deepEqual(executionProfileContract.gate, [
    ...EXECUTION_PROFILE_GATE_REASONS.map((decision, index) => ({
      priority: String(index + 1),
      decision,
      evidence: EXPECTED_GATE_EVIDENCE[index],
    })),
    { priority: 'Terminal', decision: 'eligible', evidence: EXPECTED_GATE_EVIDENCE.at(-1) },
  ]);
  assert.ok(
    executionProfileContract.gate.every(({ evidence }) => evidence.length > 0),
    'every gate row must state positive evidence',
  );
});

test('gate mutations reject missing, reordered, duplicate, mis-prioritized, and invalid terminal rows', () => {
  const cases = [
    {
      mutate: (contract) => contract.gate.splice(3, 1),
      expected: /must contain 11 exclusions and one terminal decision/,
    },
    {
      mutate: (contract) => {
        [contract.gate[2], contract.gate[3]] = [contract.gate[3], contract.gate[2]];
      },
      expected: /gate row 3 must be priority 3, decision "destructive-data"/,
    },
    {
      mutate: (contract) => {
        contract.gate[1].priority = contract.gate[0].priority;
      },
      expected: /Duplicate execution-profile gate priority "1"/,
    },
    {
      mutate: (contract) => {
        contract.gate[1].decision = contract.gate[0].decision;
      },
      expected: /Duplicate execution-profile gate decision "profile-unavailable"/,
    },
    {
      mutate: (contract) => {
        contract.gate[4].priority = '12';
      },
      expected: /gate row 5 must be priority 5, decision "concurrency"/,
    },
    {
      mutate: (contract) => {
        contract.gate.at(-1).decision = 'allowed';
      },
      expected: /must end with the distinct terminal eligible decision/,
    },
  ];
  for (const { mutate, expected } of cases) assertContractMutation(mutate, expected);
});

test('every reversed gate safety statement is rejected, including the terminal prerequisite', () => {
  const reversedEvidence = [
    'Native profile mapping or the spawn mechanism may be unavailable',
    'Authentication, authorization, or trust-boundary changes are allowed',
    'Approved scope contains a destructive data operation',
    'Approved scope contains a data, schema, or compatibility migration',
    'Affected paths may include concurrency or shared-ownership changes',
    'Affected paths may include unsafe-language or unsafe-runtime surfaces',
    'Public compatibility contract changes are allowed',
    'An unresolved merge conflict is present',
    'Allowed paths or their owner may remain unclear',
    'Cross-packet and cross-domain dependencies may remain unresolved',
    'The source may bypass approval and leave validation or decisions unknown',
    'A preceding row may have failed',
  ];
  assert.equal(reversedEvidence.length, executionProfileContract.gate.length);
  for (const [index, evidence] of reversedEvidence.entries()) {
    assertContractMutation(
      (contract) => {
        contract.gate[index].evidence = evidence;
      },
      new RegExp(`ordered gate evidence row ${index + 1} must use evidence`),
    );
  }
});

test('configuration input is exhaustive and fails closed unless explicitly enabled', () => {
  assert.deepEqual(executionProfileContract.configCases, [
    {
      input: 'missing',
      configState: 'disabled',
      measurement: 'stopped',
      selection: 'quality',
    },
    {
      input: 'false',
      configState: 'disabled',
      measurement: 'stopped',
      selection: 'quality',
    },
    {
      input: 'true',
      configState: 'enabled',
      measurement: 'lifecycle-gated',
      selection: 'quality-until-active-gate',
    },
    {
      input: 'malformed',
      configState: 'invalid',
      measurement: 'stopped',
      selection: 'quality',
    },
    {
      input: 'ambiguous',
      configState: 'invalid',
      measurement: 'stopped',
      selection: 'quality',
    },
    {
      input: 'unreadable',
      configState: 'invalid',
      measurement: 'stopped',
      selection: 'quality',
    },
  ]);
  for (const input of ['missing', 'false', 'malformed', 'ambiguous', 'unreadable']) {
    const row = executionProfileContract.configCases.find((candidate) => candidate.input === input);
    assert.equal(row.selection, 'quality', `${input} must select Quality`);
    assert.equal(row.measurement, 'stopped', `${input} must stop measurement`);
  }
  assertContractMutation((contract) => {
    contract.configCases.find(({ input }) => input === 'unreadable').selection = 'fast';
  }, /configuration fail-closed mapping row 6 must use selection "quality"/);
});

test('the state table closes the legal precedence algebra and admits Fast only once', () => {
  assert.deepEqual(executionProfileContract.states, [
    {
      precedence: 1,
      configState: 'disabled',
      generationState: '*',
      eligibility: 'not-evaluated',
      selectedProfile: 'quality',
      decision: 'fail-closed',
    },
    {
      precedence: 2,
      configState: 'invalid',
      generationState: '*',
      eligibility: 'not-evaluated',
      selectedProfile: 'quality',
      decision: 'fail-closed',
    },
    {
      precedence: 3,
      configState: 'enabled',
      generationState: 'none',
      eligibility: 'not-evaluated',
      selectedProfile: 'quality',
      decision: 'no-generation',
    },
    {
      precedence: 4,
      configState: 'enabled',
      generationState: 'suspended',
      eligibility: 'not-evaluated',
      selectedProfile: 'quality',
      decision: 'admission-frozen',
    },
    {
      precedence: 5,
      configState: 'enabled',
      generationState: 'review',
      eligibility: 'not-evaluated',
      selectedProfile: 'quality',
      decision: 'admission-frozen',
    },
    {
      precedence: 6,
      configState: 'enabled',
      generationState: 'baseline',
      eligibility: 'excluded(reason)',
      selectedProfile: 'quality',
      decision: 'gate-excluded',
    },
    {
      precedence: 7,
      configState: 'enabled',
      generationState: 'baseline',
      eligibility: 'eligible',
      selectedProfile: 'quality',
      decision: 'baseline-comparator',
    },
    {
      precedence: 8,
      configState: 'enabled',
      generationState: 'active',
      eligibility: 'excluded(reason)',
      selectedProfile: 'quality',
      decision: 'gate-excluded',
    },
    {
      precedence: 9,
      configState: 'enabled',
      generationState: 'active',
      eligibility: 'eligible',
      selectedProfile: 'fast',
      decision: 'fast-admission',
    },
  ]);
  assert.deepEqual(
    executionProfileContract.states.filter(({ selectedProfile }) => selectedProfile === 'fast'),
    [executionProfileContract.states.at(-1)],
  );
  for (const generationState of ['baseline', 'active']) {
    assert.equal(
      executionProfileContract.states.find(
        (row) => row.generationState === generationState && row.eligibility === 'excluded(reason)',
      ).selectedProfile,
      'quality',
      `unknown-evidence excludes ${generationState} to Quality`,
    );
  }
});

test('state mutations reject unknown vocabulary, duplicate precedence, illegal Fast, and incomplete algebra', () => {
  const cases = [
    [
      'config state',
      (row) => (row.configState = 'unknown'),
      /Unknown execution-profile config state/,
    ],
    [
      'generation state',
      (row) => (row.generationState = 'unavailable'),
      /Unknown execution-profile generation state/,
    ],
    [
      'eligibility',
      (row) => (row.eligibility = 'unknown'),
      /Unknown execution-profile eligibility/,
    ],
    ['profile', (row) => (row.selectedProfile = 'turbo'), /Unknown execution profile/],
  ];
  for (const [, mutateRow, expected] of cases) {
    assertContractMutation((contract) => mutateRow(contract.states[2]), expected);
  }
  assertContractMutation((contract) => {
    contract.states[1].precedence = contract.states[0].precedence;
  }, /Duplicate execution-profile state precedence "1"/);
  assertContractMutation((contract) => {
    contract.states[6].selectedProfile = 'fast';
  }, /Fast requires enabled \+ active \+ eligible/);
  assertContractMutation((contract) => {
    contract.states.pop();
  }, /state precedence table must contain exactly 9 rows/);
  assertContractMutation((contract) => {
    [contract.states[3], contract.states[4]] = [contract.states[4], contract.states[3]];
  }, /state precedence table row 4 must use precedence "4"/);
});

test('lifecycle transitions freeze review and keep resume owned and guarded', () => {
  assert.deepEqual(
    executionProfileContract.transitions.map(({ operation, from, to, owner }) => ({
      operation,
      from,
      to,
      owner,
    })),
    [
      { operation: 'begin-baseline', from: 'none', to: 'baseline', owner: 'work-package-3' },
      { operation: 'activate', from: 'baseline', to: 'active', owner: 'work-package-3' },
      {
        operation: 'suspend',
        from: 'baseline; active',
        to: 'suspended',
        owner: 'work-package-3',
      },
      { operation: 'resume', from: 'suspended', to: 'resumeTo', owner: 'work-package-3' },
      {
        operation: 'begin-review',
        from: 'baseline; active; suspended',
        to: 'review',
        owner: 'work-package-3',
      },
      { operation: 'reconcile-review', from: 'review', to: 'review', owner: 'work-package-3' },
    ],
  );
  const resume = executionProfileContract.transitions.find(
    ({ operation }) => operation === 'resume',
  );
  assert.match(resume.guard, /Explicit confirmation and digest-bound clear/);
  assert.match(resume.guard, /stored resumeTo/);
  const review = executionProfileContract.transitions.find(
    ({ operation }) => operation === 'begin-review',
  );
  assert.match(review.guard, /reject reservations/);
  assert.match(review.guard, /preserve suspension and incomplete inventory/);
  assertContractMutation((contract) => {
    contract.transitions.find(({ operation }) => operation === 'resume').from = 'review';
  }, /lifecycle transition interface row 4 must use from "suspended"/);
});

test('attempt and capability rules make Fast first-attempt-only and every continuation Quality-only', () => {
  const rules = Object.fromEntries(
    executionProfileContract.rules.map(({ rule, value }) => [rule, value]),
  );
  assert.equal(rules['fast-request'], 'first-implementation-spawn');
  assert.equal(rules['keywordless-resume'], 'same-attempt');
  for (const rule of [
    'newly-spawned-retry',
    'correction',
    'validation-repair',
    'review-incorporation',
    'conflict-resolution',
    'scope-growth-continuation',
    'portable',
  ]) {
    assert.equal(rules[rule], 'quality-only', `${rule} must remain Quality-only`);
  }
  assert.equal(rules['force-override-detection'], 'presence-only');
  assert.equal(rules['missing-native-capability'], 'profile-unavailable');
  assert.equal(rules['rejected-fast-spawn'], 'spawn-rejected');
  assert.equal(rules['escalation-checkout'], 'same-verified-checkout');
  assert.equal(rules['second-fast-attempt'], 'forbidden');
  assertContractMutation((contract) => {
    contract.rules.find(({ rule }) => rule === 'correction').value = 'fast-allowed';
  }, /attempt and capability rules row 4 must use value "quality-only"/);
});

test('decision events map every fallback exactly once and consume Fast only after an attempt', () => {
  assert.deepEqual(executionProfileContract.decisionMappings, EXPECTED_DECISION_MAPPINGS);
  const counts = Object.fromEntries(
    EXECUTION_PROFILE_FALLBACKS.map((fallback) => [
      fallback,
      executionProfileContract.decisionMappings.filter((row) => row.fallback === fallback).length,
    ]),
  );
  assert.deepEqual(counts, {
    none: 2,
    'spawn-rejected': 1,
    'worker-abort': 1,
    'missing-context': 1,
    'scope-growth': 1,
    'new-decision': 1,
    'requirements-mismatch': 1,
    'keywordless-exhausted': 1,
    'scope-incident': 1,
  });
  for (const row of executionProfileContract.decisionMappings.slice(2)) {
    assert.equal(row.gateDecision, 'eligible');
    assert.equal(row.selectedProfile, 'quality');
    assert.equal(row.fastAttemptConsumed, 'true');
  }
  assert.deepEqual(
    executionProfileContract.decisionMappings
      .slice(0, 2)
      .map(({ fallback, fastAttemptConsumed }) => ({
        fallback,
        fastAttemptConsumed,
      })),
    [
      { fallback: 'none', fastAttemptConsumed: 'false' },
      { fallback: 'none', fastAttemptConsumed: 'false' },
    ],
  );
  assertContractMutation((contract) => {
    contract.decisionMappings.at(-1).fastAttemptConsumed = 'false';
  }, /decision mapping row 10 must use fastAttemptConsumed "true"/);
  assertContractMutation((contract) => {
    contract.decisionMappings[3].event = contract.decisionMappings[2].event;
  }, /Duplicate execution-profile decision event "fast-spawn-rejected-after-attempt"/);
  for (const [index, expected] of EXPECTED_DECISION_MAPPINGS.entries()) {
    if (expected.fallback === 'none') continue;
    assertContractMutation(
      (contract) => {
        contract.decisionMappings[index].fallback = 'none';
      },
      new RegExp(`decision mapping row ${index + 1} must use fallback "${expected.fallback}"`),
    );
  }
});

test('fallbacks are an exact closed vocabulary and gate-selected Quality is not a fallback', () => {
  assert.deepEqual(EXECUTION_PROFILE_FALLBACKS, [
    'none',
    'spawn-rejected',
    'worker-abort',
    'missing-context',
    'scope-growth',
    'new-decision',
    'requirements-mismatch',
    'keywordless-exhausted',
    'scope-incident',
  ]);
  assert.ok(Object.isFrozen(EXECUTION_PROFILE_FALLBACKS));
  assert.deepEqual(
    executionProfileContract.fallbacks.map(({ value }) => value),
    EXECUTION_PROFILE_FALLBACKS,
  );
  assert.equal(executionProfileContract.decisionMappings[0].fallback, 'none');
  assertContractMutation((contract) => {
    contract.fallbacks.push({ value: 'quality-selected' });
  }, /fallback vocabulary must contain exactly 9 rows/);
  assertContractMutation((contract) => {
    contract.fallbacks[2].value = contract.fallbacks[1].value;
  }, /Duplicate execution-profile fallback "spawn-rejected"/);
});

test('pilot controls keep the exact outcome mapping separate from implementation and product effects', () => {
  assert.deepEqual(EXECUTION_PROFILE_PILOT_CONTROL_OUTCOMES, [
    'none',
    'finalization-failed',
    'critical-safety-incident',
    'critical-data-integrity-incident',
    'critical-authorization-incident',
    'critical-scope-incident',
    'evidence-gap',
    'incomplete-record',
    'capacity-exhausted',
    'control-state-unpersistable',
  ]);
  assert.ok(Object.isFrozen(EXECUTION_PROFILE_PILOT_CONTROL_OUTCOMES));
  assert.deepEqual(
    executionProfileContract.controls.map(({ outcome }) => outcome),
    EXECUTION_PROFILE_PILOT_CONTROL_OUTCOMES,
  );
  const unchangedControl = (outcome, suspensionReason, incompleteInventory, alert = 'none') => ({
    outcome,
    suspensionReason,
    incompleteInventory,
    alert,
    implementationFallback: 'none',
    productDiff: 'unchanged',
  });
  assert.deepEqual(executionProfileContract.controls, [
    unchangedControl('none', 'none', 'false'),
    unchangedControl('finalization-failed', 'finalization-failed', 'true'),
    unchangedControl('critical-safety-incident', 'critical-safety-incident', 'false'),
    unchangedControl(
      'critical-data-integrity-incident',
      'critical-data-integrity-incident',
      'false',
    ),
    unchangedControl('critical-authorization-incident', 'critical-authorization-incident', 'false'),
    unchangedControl('critical-scope-incident', 'critical-scope-incident', 'false'),
    unchangedControl('evidence-gap', 'evidence-gap', 'true'),
    unchangedControl('incomplete-record', 'none', 'true'),
    unchangedControl('capacity-exhausted', 'capacity-exhausted', 'false'),
    unchangedControl('control-state-unpersistable', 'none', 'false', 'value-free'),
  ]);
  for (const row of executionProfileContract.controls) {
    assert.equal(row.implementationFallback, 'none', `${row.outcome} cannot start a fallback`);
    assert.equal(row.productDiff, 'unchanged', `${row.outcome} cannot change the product diff`);
  }
  const byOutcome = Object.fromEntries(
    executionProfileContract.controls.map((row) => [row.outcome, row]),
  );
  assert.equal(byOutcome['finalization-failed'].incompleteInventory, 'true');
  assert.equal(byOutcome['evidence-gap'].incompleteInventory, 'true');
  assert.equal(byOutcome['incomplete-record'].suspensionReason, 'none');
  assert.equal(byOutcome['incomplete-record'].incompleteInventory, 'true');
  assert.equal(byOutcome['control-state-unpersistable'].alert, 'value-free');
  assertContractMutation((contract) => {
    contract.controls.find(({ outcome }) => outcome === 'evidence-gap').implementationFallback =
      'worker-abort';
  }, /pilot-control mapping row 7 must use implementationFallback "none"/);
  assertContractMutation((contract) => {
    contract.controls.find(({ outcome }) => outcome === 'capacity-exhausted').productDiff =
      'reverted';
  }, /pilot-control mapping row 9 must use productDiff "unchanged"/);
});

test('the escalation transfer is complete, ordered, and pins authority per field', () => {
  assert.deepEqual(EXECUTION_PROFILE_TRANSFER_FIELDS, [
    'packetOrBucket',
    'originalObjective',
    'allowedScope',
    'changedPaths',
    'completedRequirements',
    'incompleteRequirements',
    'checksAndOutcomes',
    'dirtyStateSummary',
    'escalationReason',
    'executionLocationReceipt',
    'fastAttemptConsumed',
  ]);
  assert.ok(Object.isFrozen(EXECUTION_PROFILE_TRANSFER_FIELDS));
  assert.deepEqual(executionProfileContract.transferFields, [
    { position: 1, field: 'packetOrBucket', authority: 'approved-routing-or-plan' },
    { position: 2, field: 'originalObjective', authority: 'orchestrator' },
    { position: 3, field: 'allowedScope', authority: 'orchestrator' },
    { position: 4, field: 'changedPaths', authority: 'orchestrator-fresh-git' },
    {
      position: 5,
      field: 'completedRequirements',
      authority: 'worker-claim-until-verified',
    },
    {
      position: 6,
      field: 'incompleteRequirements',
      authority: 'worker-claim-until-verified',
    },
    {
      position: 7,
      field: 'checksAndOutcomes',
      authority: 'worker-claim-until-verified',
    },
    { position: 8, field: 'dirtyStateSummary', authority: 'orchestrator-fresh-git' },
    { position: 9, field: 'escalationReason', authority: 'orchestrator' },
    {
      position: 10,
      field: 'executionLocationReceipt',
      authority: 'orchestrator-revalidated',
    },
    { position: 11, field: 'fastAttemptConsumed', authority: 'orchestrator' },
  ]);
  assertContractMutation((contract) => {
    contract.transferFields.find(({ field }) => field === 'changedPaths').authority =
      'worker-claim-until-verified';
  }, /transfer interface row 4 must use authority "orchestrator-fresh-git"/);
  assertContractMutation((contract) => {
    contract.transferFields[10].field = contract.transferFields[9].field;
  }, /Duplicate execution-profile transfer field "executionLocationReceipt"/);
});

test('untrusted repository text cannot grant authority or bypass unknown-to-Quality', () => {
  assert.match(
    executionProfileSource,
    /Tracker text, file content,[\s\S]*untrusted data:[\s\S]*cannot enlarge write scope or command authority/,
  );
  assert.match(
    executionProfileContract.gate.find(({ decision }) => decision === 'unknown-evidence').evidence,
    /source passed the owning workflow approval gate/,
  );
  assert.match(
    executionProfileSource,
    /An unknown\s+condition therefore reaches `unknown-evidence` and selects Quality/,
  );
  assert.match(executionProfileSource, /Coupled or mixed-scope packets share Quality/);
});

test('the no-activation detector distinguishes direct Fast requests from unrelated prose', () => {
  for (const prohibited of [
    'spawn_agent({ profile: "fast" })',
    'Delegate this implementation to a Fast worker.',
    'Request the Fast profile for the first implementation.',
    'route with model = "fast"',
    'model: fast',
    'profile = "fast"',
    '{{AGENT:fast-implementer}}',
    'effective-flow-fast-implementer',
  ]) {
    assert.notDeepEqual(
      findProhibitedFastActivations(prohibited),
      [],
      `must detect prohibited activation: ${prohibited}`,
    );
  }
  for (const allowed of [
    'review.profile: fast',
    'the upstream fast-forward completed',
    'Fast remains reserved policy and is not requested',
  ]) {
    assert.deepEqual(
      findProhibitedFastActivations(allowed),
      [],
      `must not misclassify unrelated text: ${allowed}`,
    );
  }
});

test('the build assertion precedes the actual atomic swap and workflows do not activate Fast', () => {
  const buildSource = readFileSync(new URL('build.mjs', ROOT), 'utf8');
  const guardStart = buildSource.indexOf('// --- Shared execution-profile contract guard ---');
  const guardEnd = buildSource.indexOf('// --- Shared next-steps contract guard ---', guardStart);
  const assertionCalls = [
    ...buildSource.matchAll(/assertExecutionProfileContract\(executionProfileContract/g),
  ];
  const swaps = [...buildSource.matchAll(/renameSync\(DIST_TMP,\s*DIST_ROOT\)/g)];
  assert.ok(guardStart >= 0, 'build.mjs must contain the execution-profile guard');
  assert.ok(guardEnd > guardStart, 'the execution-profile guard must have a bounded section');
  assert.equal(assertionCalls.length, 1, 'build.mjs must execute the contract assertion once');
  assert.equal(swaps.length, 1, 'build.mjs must execute one DIST_TMP to DIST_ROOT swap');
  assert.ok(
    assertionCalls[0].index < swaps[0].index,
    'the actual contract assertion call must execute before the actual atomic swap',
  );
  const guard = buildSource.slice(guardStart, guardEnd);
  assert.match(guard, /parseExecutionProfileContract\(executionProfileSource/);
  assert.match(guard, /assertExecutionProfileContract\(executionProfileContract/);
  assert.doesNotMatch(
    guard,
    /writeFileSync|copyFileSync|resolveEagerIncludes|resolveLazyIncludes|renderBody|renameSync/,
    'the guard may validate but must not render, copy, or swap the reserved fragment',
  );

  const sourceRoot = fileURLToPath(new URL('src', ROOT));
  const sourceFiles = collectFiles(sourceRoot).filter(
    (path) => !path.endsWith('/src/shared/execution-profiles.md'),
  );
  for (const path of sourceFiles) {
    const source = readFileSync(path, 'utf8');
    assert.deepEqual(
      findProhibitedFastActivations(source),
      [],
      `${path} must not directly request a Fast spawn, model, profile, or worker`,
    );
    assert.doesNotMatch(
      source,
      /```(?:include|lazy-include)\s+execution-profiles\s+```/,
      `${path} must not consume the reserved profile contract`,
    );
  }
  assert.deepEqual(
    readdirSync(new URL('src/agents', ROOT))
      .filter((name) => name.endsWith('.md'))
      .map((name) => name.slice(0, -3))
      .sort(),
    EXPECTED_WORKERS,
    'native capability must not add or remove source worker registrations',
  );
  for (const path of collectFiles(fileURLToPath(new URL('src/tools', ROOT)))) {
    assert.doesNotMatch(
      readFileSync(path, 'utf8'),
      /executionProfiles\.fast\.enabled/,
      `${path} must not expose or activate the reserved key`,
    );
  }
  for (const tool of ['build', 'refactor']) {
    assert.doesNotMatch(
      readFileSync(new URL(`src/tools/${tool}.md`, ROOT), 'utf8'),
      /\{\{AGENT_PROFILE:/,
      `${tool} must remain profile-token-free until its adoption work package`,
    );
  }
});

test('an isolated build emits native capability without workflow activation', (t) => {
  const outputRoot = mkdtempSync(join(tmpdir(), 'effective-flow-execution-profile-build-'));
  t.after(() => rmSync(outputRoot, { recursive: true, force: true }));
  const build = spawnSync(process.execPath, ['build.mjs'], {
    cwd: fileURLToPath(ROOT),
    env: { ...process.env, EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT: outputRoot },
    encoding: 'utf8',
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const dist = join(outputRoot, 'dist');
  const targetRoots = {
    claude: join(dist, 'claude', 'effective-flow'),
    codex: join(dist, 'codex', 'effective-flow'),
    portable: join(dist, 'portable', 'effective-flow'),
  };
  for (const [target, root] of Object.entries(targetRoots)) {
    assert.deepEqual(
      readdirSync(root).sort(),
      target === 'portable'
        ? ['LICENSE', 'SKILL.md', 'scripts', 'shared', 'tools', 'workers']
        : ['LICENSE', 'SKILL.md', 'native-agent-inventory.json', 'scripts', 'shared', 'tools'],
      `${target} top-level artifact inventory changed`,
    );
    assert.deepEqual(
      readdirSync(join(root, 'tools'))
        .filter((name) => name.endsWith('.md'))
        .map((name) => name.slice(0, -3))
        .sort(),
      EXPECTED_TOOLS,
      `${target} tool inventory changed`,
    );
    assert.deepEqual(
      readdirSync(join(root, 'scripts')).sort(),
      EXPECTED_RUNTIME_SCRIPTS,
      `${target} runtime-script inventory changed`,
    );
    assert.ok(
      !readdirSync(join(root, 'shared')).includes('execution-profiles.md'),
      `${target} must not emit the reserved execution-profile fragment`,
    );
  }

  const generatedWorkers = {
    claude: readdirSync(join(dist, 'claude', 'agents')).map((name) =>
      name.slice('effective-flow-'.length, -'.md'.length),
    ),
    codex: readdirSync(join(dist, 'codex', 'agents')).map((name) =>
      name.slice('effective-flow-'.length, -'.toml'.length),
    ),
    portable: readdirSync(join(targetRoots.portable, 'workers')).map((name) =>
      name.slice('effective-flow-'.length, -'.md'.length),
    ),
  };
  assert.deepEqual(
    generatedWorkers.claude.sort(),
    [...EXPECTED_WORKERS, ...EXPECTED_FAST_WORKERS.map((worker) => `${worker}-fast`)].sort(),
    'Claude capability must add only the five sanctioned Fast sidecars',
  );
  assert.deepEqual(
    generatedWorkers.codex.sort(),
    EXPECTED_WORKERS,
    'Codex must retain only independently discoverable Quality workers',
  );
  assert.deepEqual(
    generatedWorkers.portable.sort(),
    EXPECTED_WORKERS,
    'portable membership must remain the source worker set',
  );

  for (const targetRoot of Object.values(targetRoots)) {
    for (const path of collectFiles(targetRoot)) {
      if (!/\.(?:md|mjs|toml)$/.test(path)) continue;
      const output = readFileSync(path, 'utf8');
      assert.doesNotMatch(
        output,
        /<!-- execution-profile-/,
        `${path} emitted reserved policy tables`,
      );
      assert.deepEqual(
        findProhibitedFastActivations(output),
        [],
        `${path} directly requests a Fast spawn, model, profile, or worker`,
      );
      assert.doesNotMatch(output, /\{\{AGENT_PROFILE:/, `${path} retained a profile token`);
    }
  }
});
