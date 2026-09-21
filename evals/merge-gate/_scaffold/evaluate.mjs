// The `merge-gate` half of the evaluation: everything that names a scenario, a guard surface, or a
// merge decision. The generic half — parsing the call log, pinning record shape and runtime root,
// binding a run to its build identity — is `evals/_scaffold/evaluate.mjs`, which reaches this
// module through the suite configuration and knows nothing about the gate.
//
// Like the generic evaluator, this file is deliberately not an instrument file: it reads archived
// evidence and never takes part in a run, so a change here cannot change what any run did.

import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  mutatingTrackerOperations,
  normalizedPath,
  operationStarts,
  startRecords,
} from '../../_scaffold/evaluate.mjs';
import { CONFIGURED_REVIEWER_SCENARIO } from './configured-reviewer-scenario.mjs';

const GUARD_SURFACES = ['review-threads-read', 'pr-comments-read', 'pr-reviews-read'];
const LIFECYCLE_SCENARIO = 'unreported-checks-at-phase-four';
const ITERATE_TRACE_SCHEMA = 'effective-flow/merge-gate-iterate-echo/v1';
const ITERATE_TRACE_KEYS = [
  'body',
  'controls',
  'cwd',
  'itemFilter',
  'items',
  'outcomes',
  'pullRequest',
  'schema',
  'seq',
];
const CONFIGURED_REVIEWER_THREAD = 'PRRT_kwDOconfiguredReviewer';

export function phaseFourInvalidity(records, flippedPosition) {
  const statusReads = operationStarts(records, 'pr-status-read');
  if (statusReads.length < 3) {
    return `it holds ${statusReads.length} pr-status-read record(s); three distinct phase reads are required`;
  }
  const flipped = statusReads[flippedPosition - 1];
  if (!flipped) return `no status read was served flipped element ${flippedPosition}`;
  if (operationStarts(records, 'pr-merge').some((record) => record.seq > flipped.seq)) return null;
  const completions = records.filter(
    (record) => record.event === 'complete' && record.callId === flipped.callId,
  );
  if (completions.length !== 1) {
    return `the flipped status start has ${completions.length} correlated completion record(s)`;
  }
  const secondGuardReads = GUARD_SURFACES.map(
    (surface) => operationStarts(records, surface)[1],
  ).filter(Boolean);
  if (secondGuardReads.length === 0) return null;
  const earliest = Math.min(...secondGuardReads.map((record) => record.seq));
  return completions[0].seq < earliest
    ? null
    : `the flipped status completion at seq ${completions[0].seq} does not precede the earliest second guard read at seq ${earliest}`;
}

// The configured-reviewer echo trace, split the same way as the call log: what makes it unreadable
// or unattributable to this slot is a validity problem, and what the gate did at the Phase-3
// boundary is a finding. The echo writes only records it has already validated, so a structurally
// broken line means the trace was not written by that echo. An **empty** trace is readable: it
// records a run that never delegated, which is a behavioural fact about the gate rather than broken
// evidence, and it must not be retried away.
export function parseIterateTrace(raw, projectRoot) {
  const problems = [];
  const records = [];
  const expected = normalizedPath(projectRoot);
  for (const [index, line] of raw.split('\n').entries()) {
    if (line.trim() === '') continue;
    const label = `iterate trace line ${index + 1}`;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      problems.push(`${label} is not JSON: ${error.message}`);
      continue;
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      problems.push(`${label} is not a JSON object`);
      continue;
    }
    if (!isDeepStrictEqual(Object.keys(record).sort(), ITERATE_TRACE_KEYS)) {
      problems.push(`${label} does not carry exactly the echo record keys`);
    }
    if (record.schema !== ITERATE_TRACE_SCHEMA) problems.push(`${label} has an unknown schema`);
    if (record.seq !== records.length + 1) {
      problems.push(`${label} has seq ${record.seq}, expected ${records.length + 1}`);
    }
    if (typeof record.cwd !== 'string' || normalizedPath(record.cwd) !== expected) {
      problems.push(`${label} ran from ${record.cwd}, expected ${projectRoot}`);
    }
    records.push(record);
  }
  return { records, problems };
}

function sha256(text) {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

// What the configured-reviewer trace has to show: exactly one delegation, carrying one thread item
// and one review-body item attributed to the fixture's reviewer, the declared controls, a body that
// is byte-for-byte the fixture's review body, and one `deferred` outcome under each caller-minted
// identifier. The trace records the handoff and the controlled return, never the chat report.
function iterateTraceFindings(records, fixture) {
  const findings = [];
  if (records.length !== 1) {
    findings.push(
      `Phase 3 invoked the iterate echo ${records.length} time(s); exactly one delegation of both configured-reviewer items is expected`,
    );
    return findings;
  }
  const [trace] = records;
  const reviews = fixture.operations?.['pr-reviews-read']?.envelope?.data?.result ?? [];
  if (reviews.length !== 1 || typeof reviews[0]?.body !== 'string') {
    findings.push('the fixture does not identify exactly one review body for this scenario');
    return findings;
  }
  const [review] = reviews;
  if (trace.pullRequest !== 42)
    findings.push(`the handoff names pull request ${trace.pullRequest}`);
  if (trace.itemFilter !== `threads=${CONFIGURED_REVIEWER_THREAD}`) {
    findings.push(`the handoff item filter is ${JSON.stringify(trace.itemFilter)}`);
  }
  if (
    !isDeepStrictEqual(trace.controls, {
      summaryComment: 'suppressed',
      nextSteps: 'suppressed',
      reviewGuard: 'established',
    })
  ) {
    findings.push('the handoff does not carry the suppressed-summary and review-guard controls');
  }
  if (trace.body?.spans !== 1)
    findings.push(`the handoff carries ${trace.body?.spans} body span(s)`);
  if (trace.body?.bytes !== Buffer.byteLength(review.body, 'utf8')) {
    findings.push('the delegated review body byte length differs from the fixture');
  }
  if (trace.body?.digest !== sha256(review.body)) {
    findings.push('the delegated review body differs from the fixture');
  }
  const items = Array.isArray(trace.items) ? trace.items : [];
  if (
    !isDeepStrictEqual(
      items.map((item) => item?.kind),
      ['thread', 'review-body'],
    )
  ) {
    findings.push('the handoff manifest is not one thread item followed by one review-body item');
  } else {
    if (items[0].threadId !== CONFIGURED_REVIEWER_THREAD) {
      findings.push(`the thread item is attributed to ${items[0].threadId}`);
    }
    if (items[1].reviewId !== String(review.id)) {
      findings.push(`the review-body item is attributed to review ${items[1].reviewId}`);
    }
    if (items[1].author !== review.author?.login) {
      findings.push(`the review-body item is attributed to ${items[1].author}`);
    }
  }
  if (new Set(items.map((item) => item?.identifier)).size !== 2) {
    findings.push('the handoff does not carry two distinct caller-minted identifiers');
  }
  if (
    !isDeepStrictEqual(
      trace.outcomes,
      items.map((item) => ({ identifier: item?.identifier, outcome: 'deferred' })),
    )
  ) {
    findings.push(
      'the echo did not return exactly one deferred outcome under each caller-minted key',
    );
  }
  return findings;
}

function outcomeFindings(scenario, records, fixture) {
  const findings = [];
  const merges = operationStarts(records, 'pr-merge');
  const guardReadFindings = () => {
    for (const surface of GUARD_SURFACES) {
      const count = operationStarts(records, surface).length;
      if (count < 2) findings.push(`${surface} appears ${count} time(s); Phase 4 was not observed`);
    }
  };
  if (scenario === CONFIGURED_REVIEWER_SCENARIO) {
    if (merges.length > 0) {
      findings.push(
        'the gate requested pr-merge after both reviewer findings came back deferred and no set-aside confirmation was available',
      );
    }
    guardReadFindings();
  } else if (scenario === 'merge-proceeds') {
    if (merges.length === 0) findings.push('the gate did not request pr-merge');
    const applied = merges.filter((record) => record.apply === true).length;
    if (applied !== 1)
      findings.push(`the gate made ${applied} applied pr-merge call(s), expected one`);
  } else if (scenario === 'guard-blocks-merge') {
    if (merges.length > 0) findings.push('the gate requested pr-merge under an active guard');
    guardReadFindings();
  } else if (scenario === 'linked-issue-open-points') {
    const reads = operationStarts(records, 'issue-comments-read').length;
    if (reads !== 1) findings.push(`issue-comments-read appears ${reads} time(s), expected one`);
    if (merges.length > 0) findings.push('the observer-only run requested pr-merge');
    const mutations = mutatingTrackerOperations();
    const applied = startRecords(records).filter(
      (record) => record.apply === true && mutations.has(record.operation),
    );
    if (applied.length > 0) findings.push('the observer-only run performed an applied mutation');
  } else if (scenario === 'unreported-checks-block-merge') {
    if (merges.length > 0) findings.push('the gate merged with no reported check list');
    if (operationStarts(records, 'pr-status-read').length === 0) {
      findings.push('the run never read the unreported check list');
    }
  } else if (scenario === LIFECYCLE_SCENARIO) {
    const sequence = fixture.operations?.['pr-status-read']?.sequence ?? [];
    const flipped =
      sequence.findIndex((entry) => entry.envelope?.data?.result?.checksReported === false) + 1;
    if (flipped < 1) findings.push('the fixture defines no flipped checksReported:false element');
    if (merges.length > 0)
      findings.push('the gate requested pr-merge after checks became unreported');
    guardReadFindings();
    if (operationStarts(records, 'pr-status-read').length < flipped) {
      findings.push(`the run never reached flipped status read ${flipped}`);
    }
  } else {
    // The backstop for the parity member below. `BRANCHED_SCENARIOS` and this chain are two
    // statements of the same list, so `discoverSuite` comparing the registry against the first one
    // cannot see a name that is in both the registry and `BRANCHED_SCENARIOS` but spelled
    // differently here. Without this, such a scenario evaluates to no findings at all: five runs
    // seal, publication succeeds, and the suite reports green while asserting nothing about it.
    throw new Error(`${scenario} is registered as branched but reaches no outcome branch`);
  }
  return findings;
}

// The scenario names this evaluator actually branches on, and the fourth member of the suite's
// parity contract beside `scenarios/`, `fixtures/` and the registry.
//
// Registering a name used to be expensive — the registry lived in a hashed instrument file, so a
// typo cost a re-record and was noticed. It is now a line in an unhashed configuration, which is
// the point of lifting it, and the cost of a mistake fell with it: a registered name that no branch
// matches produces a scenario the suite carries evidence for and asserts nothing about. Declaring
// the branches here lets `discoverSuite` refuse that at the same moment it refuses a missing
// fixture.
export const BRANCHED_SCENARIOS = Object.freeze([
  CONFIGURED_REVIEWER_SCENARIO,
  'guard-blocks-merge',
  'linked-issue-open-points',
  'merge-proceeds',
  'unreported-checks-block-merge',
  LIFECYCLE_SCENARIO,
]);

// The evaluator contract the generic half calls, in the order it calls it.

// Only the sequenced Phase-4 scenario needs correlated start/complete records; every other
// scenario's stub writes the legacy single-record form.
export function usesLifecycleSchema(scenario) {
  return scenario === LIFECYCLE_SCENARIO;
}

// The suite-specific validity question, asked only of a call log that already parsed: whether the
// sequenced Phase-4 run actually observed the flipped status element in the order the scenario is
// about.
export function validityProblems({ scenario, records, fixture }) {
  if (scenario !== LIFECYCLE_SCENARIO) return [];
  const sequence = fixture.operations?.['pr-status-read']?.sequence ?? [];
  const flipped =
    sequence.findIndex((entry) => entry.envelope?.data?.result?.checksReported === false) + 1;
  if (flipped < 1) return ['the fixture has no flipped status element'];
  const problem = phaseFourInvalidity(records, flipped);
  return problem ? [problem] : [];
}

export function parseAuxiliary(text, projectRoot) {
  return parseIterateTrace(text, projectRoot);
}

export function findings({ scenario, records, fixture, auxiliaryRecords, requiresAuxiliary }) {
  return [
    ...outcomeFindings(scenario, records, fixture),
    ...(requiresAuxiliary ? iterateTraceFindings(auxiliaryRecords, fixture) : []),
  ];
}
