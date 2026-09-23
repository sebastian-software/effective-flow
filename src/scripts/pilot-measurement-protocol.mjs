import { createHash } from 'node:crypto';

export const PILOT_MEASUREMENT_PROTOCOL_VERSION = '1.0.0';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function canonicalizeJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`)
    .join(',')}}`;
}

const statePrecedence = [
  ['disabled', '*', 'not-evaluated', 'quality', 'fail-closed'],
  ['invalid', '*', 'not-evaluated', 'quality', 'fail-closed'],
  ['enabled', 'none', 'not-evaluated', 'quality', 'no-generation'],
  ['enabled', 'suspended', 'not-evaluated', 'quality', 'admission-frozen'],
  ['enabled', 'review', 'not-evaluated', 'quality', 'admission-frozen'],
  ['enabled', 'baseline', 'excluded(reason)', 'quality', 'gate-excluded'],
  ['enabled', 'baseline', 'eligible', 'quality', 'baseline-comparator'],
  ['enabled', 'active', 'excluded(reason)', 'quality', 'gate-excluded'],
  ['enabled', 'active', 'eligible', 'fast', 'fast-admission'],
].map(([configState, generationState, eligibility, selectedProfile, decision], index) => ({
  precedence: index + 1,
  configState,
  generationState,
  eligibility,
  selectedProfile,
  decision,
}));

const fallbackMappings = [
  ['gate-selected-quality', 'first-exclusion', 'quality', 'none', false],
  ['profile-unavailable-before-spawn', 'profile-unavailable', 'quality', 'none', false],
  ['fast-spawn-rejected-after-attempt', 'eligible', 'quality', 'spawn-rejected', true],
  ['fast-worker-abort-after-attempt', 'eligible', 'quality', 'worker-abort', true],
  ['fast-missing-context-escalation', 'eligible', 'quality', 'missing-context', true],
  ['fast-scope-growth-escalation', 'eligible', 'quality', 'scope-growth', true],
  ['fast-new-decision-escalation', 'eligible', 'quality', 'new-decision', true],
  ['fast-requirements-mismatch-escalation', 'eligible', 'quality', 'requirements-mismatch', true],
  ['fast-keywordless-resume-exhausted', 'eligible', 'quality', 'keywordless-exhausted', true],
  ['fast-scope-incident-escalation', 'eligible', 'quality', 'scope-incident', true],
].map(([event, gateDecision, selectedProfile, fallback, fastAttemptConsumed]) => ({
  event,
  gateDecision,
  selectedProfile,
  fallback,
  fastAttemptConsumed,
}));

const pilotControlMappings = [
  ['none', 'none', false, 'none'],
  ['finalization-failed', 'finalization-failed', true, 'none'],
  ['critical-safety-incident', 'critical-safety-incident', false, 'none'],
  ['critical-data-integrity-incident', 'critical-data-integrity-incident', false, 'none'],
  ['critical-authorization-incident', 'critical-authorization-incident', false, 'none'],
  ['critical-scope-incident', 'critical-scope-incident', false, 'none'],
  ['evidence-gap', 'evidence-gap', true, 'none'],
  ['incomplete-record', 'none', true, 'none'],
  ['capacity-exhausted', 'capacity-exhausted', false, 'none'],
  ['control-state-unpersistable', 'none', false, 'value-free'],
].map(([outcome, suspensionReason, incompleteInventory, alert]) => ({
  outcome,
  suspensionReason,
  incompleteInventory,
  alert,
  implementationFallback: 'none',
  productDiff: 'unchanged',
}));

export const PILOT_MEASUREMENT_POLICY_PROJECTION = deepFreeze({
  schema: 1,
  profiles: [
    {
      profile: 'quality',
      intent: 'strongest-available-configured-implementation-capability',
    },
    {
      profile: 'fast',
      intent: 'distinct-native-lower-cost-lower-latency-capability',
    },
  ],
  configStates: ['disabled', 'invalid', 'enabled'],
  generationStates: ['none', 'baseline', 'active', 'suspended', 'review'],
  eligibilityStates: ['not-evaluated', 'eligible', 'excluded(reason)'],
  selectedProfiles: ['quality', 'fast'],
  gateReasons: [
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
  ],
  statePrecedence,
  fallbackMappings,
  fallbacks: [
    'none',
    'spawn-rejected',
    'worker-abort',
    'missing-context',
    'scope-growth',
    'new-decision',
    'requirements-mismatch',
    'keywordless-exhausted',
    'scope-incident',
  ],
  pilotControlMappings,
  pilotControlOutcomes: pilotControlMappings.map(({ outcome }) => outcome),
});

const limits = {
  maxCliInputBytes: 4 * 1024 * 1024,
  maxWorkflowRecordBytes: 1024 * 1024,
  maxDetailedTraceBytes: 4 * 1024 * 1024,
  maxPacketsPerWorkflow: 128,
  maxRequirementsPerTrace: 256,
  maxChecksPerTrace: 256,
  maxFindingsPerTrace: 256,
  maxWorkflowRecordsPerGeneration: 10_000,
  maxGateObservationsPerGeneration: 10_000,
  maxRawGenerationBytes: 256 * 1024 * 1024,
  maxTokenBytes: 128,
  maxRelativePathBytes: 512,
  maxCostValueDigits: 39,
  maxDurationMs: 24 * 60 * 60 * 1000,
  bootEstimateToleranceMs: 5_000,
  wallMonotonicToleranceMs: 2_000,
};

const aggregation = {
  algorithmVersion: 1,
  groupingVersion: 1,
  exactRationalVersion: 1,
  suppressionMinimum: 5,
  cohortMinimum: 20,
  metricStratumMinimum: 5,
  ordinalHalfMinimum: 5,
  periodObservationMinimum: 5,
  baselineWindowMinimumDays: 7,
  baselineEligiblePacketMinimum: 20,
  caveat: 'observational-unpaired',
};

const metricRegistry = {
  attemptedFastPackets: {
    numerator: 'packets with selectedProfile fast and fallback none',
    denominator: 'all packets with a consumed Fast attempt',
  },
  fastWithoutEscalation: {
    numerator: 'attempted-Fast packets without escalation',
    denominator: 'all attempted-Fast packets',
  },
  fallbackRate: {
    numerator: 'attempted-Fast packets with fallback other than none',
    denominator: 'all attempted-Fast packets',
  },
  workflowCompletion: {
    numerator: 'terminal workflow records completed',
    denominator: 'all terminal workflow records',
  },
  validationSuccess: {
    numerator: 'required-validation records passed',
    denominator: 'all terminal records for which required validation applied',
  },
  reviewFindings: {
    numerator: 'findings by severity',
    denominator: 'completed workflows',
  },
  qualityCorrections: {
    numerator: 'quality correction rounds',
    denominator: 'completed workflows',
  },
  mergeGateCorrections: {
    numerator: 'actual correction attempts by closed counter',
    denominator: 'completed observations grouped by mode and harness',
  },
  duration: {
    value: 'bounded integer milliseconds for continuity-valid packet intervals',
    unavailable: 'closed packet intervals without continuity proof',
  },
  cost: {
    value: 'canonical unsigned decimal totals grouped by compatible kind and unit',
    unavailable: 'missing, incompatible, or unsupported attempt proxy',
  },
};

const adoptionGates = [
  {
    gate: 'baseline-sample',
    metric: 'eligibleBaselinePackets',
    comparison: 'gte',
    threshold: { numerator: aggregation.baselineEligiblePacketMinimum, denominator: 1 },
  },
  {
    gate: 'fast-without-escalation',
    metric: 'fastWithoutEscalation',
    comparison: 'gte',
    threshold: { numerator: 4, denominator: 5 },
  },
  {
    gate: 'fallback-frequency',
    metric: 'fallbackOccurrences',
    comparison: 'lt',
    threshold: { numerator: 3, denominator: 1 },
  },
  {
    gate: 'workflow-completion-non-regression',
    metric: 'workflowCompletionDelta',
    comparison: 'gte',
    threshold: { numerator: -1, denominator: 20 },
  },
  {
    gate: 'validation-non-regression',
    metric: 'validationSuccessDelta',
    comparison: 'gte',
    threshold: { numerator: -1, denominator: 20 },
  },
  {
    gate: 'critical-review-non-regression',
    metric: 'criticalReviewFindingDelta',
    comparison: 'lte',
    threshold: { numerator: 0, denominator: 1 },
  },
  {
    gate: 'quality-correction-non-regression',
    metric: 'qualityCorrectionMedianDelta',
    comparison: 'lte',
    threshold: { numerator: 0, denominator: 1 },
  },
  {
    gate: 'merge-gate-non-regression',
    metric: 'mergeGateCorrectionMedianDelta',
    comparison: 'lte',
    threshold: { numerator: 0, denominator: 1 },
  },
  {
    gate: 'cost-benefit',
    metric: 'compatibleCostMedianRatio',
    comparison: 'lte',
    threshold: { numerator: 4, denominator: 5 },
  },
];

const protocolSource = deepFreeze({
  schema: 1,
  version: PILOT_MEASUREMENT_PROTOCOL_VERSION,
  policyProjection: PILOT_MEASUREMENT_POLICY_PROJECTION,
  limits,
  timing: {
    algorithmVersion: 1,
    durationUnit: 'integer-milliseconds',
    hostContinuity: 'packet-salted-sha256-hostname',
    bootContinuity: 'wall-minus-uptime',
    bootEstimateToleranceMs: limits.bootEstimateToleranceMs,
    wallMonotonicToleranceMs: limits.wallMonotonicToleranceMs,
    maxDurationMs: limits.maxDurationMs,
  },
  aggregation,
  metricRegistry,
  adoptionGates,
  enums: {
    cohorts: ['baseline', 'pilot'],
    workflows: ['build', 'refactor'],
    harnessFamilies: ['claude', 'codex'],
    observationModes: ['merge', 'report'],
    observationOutcomes: ['merged', 'reported-ready', 'reported-blocked', 'failed'],
    completionStatuses: ['completed', 'aborted', 'failed', 'abandoned'],
    validationStatuses: ['passed', 'failed', 'not-required', 'unavailable'],
    reviewStatuses: ['completed', 'not-run', 'unavailable'],
    requirementStatuses: ['completed', 'incomplete', 'not-applicable'],
    checkOutcomes: ['passed', 'failed', 'skipped', 'unavailable'],
    findingStatuses: ['open', 'resolved', 'accepted'],
    findingSeverities: ['critical', 'important', 'note'],
    discardDecisions: ['change', 'stop'],
    evaluationResults: ['pass', 'fail', 'unavailable'],
  },
});

export const PILOT_MEASUREMENT_DOCUMENTATION_PROJECTION = deepFreeze(
  Object.fromEntries(
    [
      'schema',
      'version',
      'limits',
      'timing',
      'aggregation',
      'metricRegistry',
      'adoptionGates',
      'enums',
    ].map((field) => [field, protocolSource[field]]),
  ),
);

export const PILOT_MEASUREMENT_PROTOCOL_DIGEST = `sha256:${createHash('sha256')
  .update(canonicalizeJson(protocolSource), 'utf8')
  .digest('hex')}`;

export const PILOT_MEASUREMENT_PROTOCOL = deepFreeze({
  ...protocolSource,
  digest: PILOT_MEASUREMENT_PROTOCOL_DIGEST,
});

export function protocolProjection() {
  return JSON.parse(canonicalizeJson(PILOT_MEASUREMENT_PROTOCOL));
}
