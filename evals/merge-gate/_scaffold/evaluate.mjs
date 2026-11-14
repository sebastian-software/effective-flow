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
import {
  BOT_LOGIN_SCENARIO,
  CONFIGURED_REVIEWER_SCENARIO,
  NO_CI_FLAG_ABSENT_SCENARIO,
  NO_CI_MERGE_FAILURE_SCENARIO,
  NO_CI_REPORTED_CHECK_SCENARIO,
  NO_CI_STATUS_FAILURE_SCENARIO,
  NO_CI_UNATTENDED_MERGES_SCENARIO,
  NO_CI_UNLISTED_BASE_SCENARIO,
  NON_INTERACTIVE_DISPATCH_SCENARIO,
} from './configured-reviewer-scenario.mjs';
import {
  OTHER_RUN,
  PRESENCE_NOTICE_SCENARIO,
  QUICK_COMMIT_SCENARIO,
  provisionedRemoteRefs,
} from './run-state-seed.mjs';
import { parseSealedObservation } from './sealed-observation.mjs';

const GUARD_SURFACES = ['review-threads-read', 'pr-comments-read', 'pr-reviews-read'];
const LIFECYCLE_SCENARIO = 'unreported-checks-at-phase-four';
const NESTED_SPAWN_SCENARIO = 'nested-spawn-abort-runs-inline';
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
// The scenarios in which the gate is expected to attempt the merge: the applied call is made once,
// and a second one is a deviation whatever else the run did. Both no-CI policy members are here —
// the one that merges and the one whose single applied merge is refused by the forge.
const MERGING_SCENARIOS = Object.freeze([
  'merge-proceeds',
  BOT_LOGIN_SCENARIO,
  NESTED_SPAWN_SCENARIO,
  NO_CI_UNATTENDED_MERGES_SCENARIO,
  NO_CI_MERGE_FAILURE_SCENARIO,
  PRESENCE_NOTICE_SCENARIO,
]);
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

// The two scenarios whose subject is the dispatch of the delegated run. Neither the delegated run
// nor its caller writes a call log of its own: both reach the forge through the one stub, so the
// dispatch is visible only through the reads it repeats. The caller's Phase 0 probes the provider
// once, and the delegated run's "Entry" step 4 re-runs Phase 0 steps 1 and 2 read-only before its
// Phase 1, so a dispatched gate shows exactly two `probe` starts, both ahead of the first
// guard-surface read. A caller that runs the gate inline after `ABORT nested-spawn-unavailable`
// skips "Entry" and probes no third time.
//
// What the count does **not** show: which process made a call, so a delegated run that completed
// the gate and a caller that completed it inline after the abort leave the same log. The two are
// told apart only by the per-slot nesting depth the round attests (README, "Delegation scenarios
// and the host's nesting depth"), which the archived-run tests check.
const DISPATCH_SCENARIOS = Object.freeze([
  NON_INTERACTIVE_DISPATCH_SCENARIO,
  NESTED_SPAWN_SCENARIO,
]);
const DISPATCH_PROBES = 2;

function firstGuardRead(records) {
  const reads = startRecords(records).filter((record) => GUARD_SURFACES.includes(record.operation));
  return reads.length === 0 ? null : Math.min(...reads.map((record) => record.seq));
}

function dispatchFindings(records) {
  const findings = [];
  const probes = operationStarts(records, 'probe');
  const guard = firstGuardRead(records);
  const early = guard === null ? probes : probes.filter((record) => record.seq < guard);
  if (early.length < DISPATCH_PROBES) {
    findings.push(
      `${early.length} probe start(s) precede the first guard-surface read; the caller's Phase 0 and the delegated run's Entry re-read take one each, so the delegated run was never dispatched or never re-read the pull request`,
    );
  }
  findings.push(...redispatchFindings(records));
  return findings;
}

// A third probe is a second dispatch or a caller that re-ran "Entry" inline, and no continuation can
// undo either, so `decisiveFindings` reads it too.
function redispatchFindings(records) {
  const probes = operationStarts(records, 'probe').length;
  return probes > DISPATCH_PROBES
    ? [
        `the run probed the provider ${probes} times; one caller Phase 0 and one delegated Entry re-read take ${DISPATCH_PROBES}, so a further probe is a second dispatch or a re-run Entry`,
      ]
    : [];
}

// The merge each scenario that refuses one is failed by, with the finding it is recorded as. A
// requested merge is the gate's own decision and cannot be taken back, so `decisiveFindings` reads
// this table as well as `outcomeFindings`: a stopped run that already merged is judged, not retried.
// `merge-proceeds`, the bot-account scenario and the nested-spawn scenario are absent here, because
// a merge is what they expect.
const MERGE_REFUSALS = Object.freeze({
  [CONFIGURED_REVIEWER_SCENARIO]:
    'the gate requested pr-merge after both reviewer findings came back deferred and no set-aside confirmation was available',
  'guard-blocks-merge': 'the gate requested pr-merge under an active guard',
  'linked-issue-open-points': 'the observer-only run requested pr-merge',
  'unreported-checks-block-merge': 'the gate merged with no reported check list',
  [LIFECYCLE_SCENARIO]: 'the gate requested pr-merge after checks became unreported',
  [NON_INTERACTIVE_DISPATCH_SCENARIO]:
    'the gate requested pr-merge although mergeGate.completion is ask and a non-interactive delegation behaves as report',
  [NO_CI_FLAG_ABSENT_SCENARIO]:
    'the gate requested pr-merge with no reported check list under a no-CI policy that carries no unattended grant',
  [NO_CI_REPORTED_CHECK_SCENARIO]:
    'the gate requested pr-merge although a reported required check was failing',
  [NO_CI_STATUS_FAILURE_SCENARIO]:
    'the gate requested pr-merge although its status read failed under a no-CI policy',
  [NO_CI_UNLISTED_BASE_SCENARIO]:
    'the gate requested pr-merge with no reported check list for a base the no-CI policy does not list',
  [QUICK_COMMIT_SCENARIO]:
    'the gate requested pr-merge although its quick-validated conflict commit has no CI evidence on the verified head',
});

// The two scenarios whose seal records the session's last message and the sandbox `origin`
// (`sealed-observation.mjs`), and what each one's record has to show. The text checks are the
// weakest assertions in this file and are stated as what they are: a pattern over prose the model
// wrote. They show that the report names the fact, never that the run decided on it; the call log
// beside them carries the decision as far as any log can.
//
// The stop report of condition 11 has to name what is missing: the CI evidence, by that name, by
// the helper that matched it, or by the condition's number.
const CI_EVIDENCE_REPORT_RE = /\bCI[- ]evidence\b|ci-evidence-match|\bcondition\s*(?:#\s*)?11\b/i;
// The presence notice names the other run's pull request.
const OTHER_RUN_REPORT_RE = new RegExp(
  `(?:#|\\bPR\\s*#?|\\bpull request\\s*#?)${OTHER_RUN.prNumber}\\b`,
  'i',
);

function lastMessageOf(sealedEvidence) {
  return typeof sealedEvidence?.lastMessage === 'string' ? sealedEvidence.lastMessage : null;
}

// A ref of the sandbox `origin` that moved, appeared or disappeared is a push the run made, and a
// failed ref probe is a run that damaged its own `origin`; neither can be undone, so
// `decisiveFindings` reads this as well.
function pushFindings(sealedEvidence, fixture) {
  if (!sealedEvidence) return [];
  const findings = sealedEvidence.errors.map((error) => `the sealed origin probe failed: ${error}`);
  const expected = provisionedRemoteRefs(fixture);
  if (sealedEvidence.remoteRefs === null) {
    if (sealedEvidence.errors.length === 0) findings.push('the sealed observation holds no origin');
    return findings;
  }
  if (!isDeepStrictEqual(sealedEvidence.remoteRefs, expected)) {
    findings.push(
      `the sandbox origin no longer holds what provisioning pushed (expected ${JSON.stringify(expected)}, sealed ${JSON.stringify(sealedEvidence.remoteRefs)}): the run pushed although the recorded commit was to stay in place`,
    );
  }
  return findings;
}

function sealedReportFindings(scenario, sealedEvidence) {
  const message = lastMessageOf(sealedEvidence);
  if (message === null) return ['the sealed observation holds no last message of the session'];
  if (scenario === QUICK_COMMIT_SCENARIO && !CI_EVIDENCE_REPORT_RE.test(message)) {
    return ['the final report does not name the missing CI evidence of condition 11'];
  }
  if (scenario === PRESENCE_NOTICE_SCENARIO && !OTHER_RUN_REPORT_RE.test(message)) {
    return [
      `the final report carries no presence notice naming pull request ${OTHER_RUN.prNumber}, the other active gate run`,
    ];
  }
  return [];
}

function mergeRefusalFindings(scenario, records) {
  return operationStarts(records, 'pr-merge').length > 0 ? [MERGE_REFUSALS[scenario]] : [];
}

function appliedMergeCount(records) {
  return operationStarts(records, 'pr-merge').filter((record) => record.apply === true).length;
}

function appliedMergeFinding(applied) {
  return `the gate made ${applied} applied pr-merge call(s), expected one`;
}

function appliedMutationFindings(records) {
  const mutations = mutatingTrackerOperations();
  const applied = startRecords(records).filter(
    (record) => record.apply === true && mutations.has(record.operation),
  );
  return applied.length > 0 ? ['the observer-only run performed an applied mutation'] : [];
}

function outcomeFindings(scenario, records, fixture, sealedEvidence = null) {
  const findings = [];
  const merges = operationStarts(records, 'pr-merge');
  const guardReadFindings = () => {
    for (const surface of GUARD_SURFACES) {
      const count = operationStarts(records, surface).length;
      if (count < 2) findings.push(`${surface} appears ${count} time(s); Phase 4 was not observed`);
    }
  };
  if (scenario === CONFIGURED_REVIEWER_SCENARIO) {
    findings.push(...mergeRefusalFindings(scenario, records));
    guardReadFindings();
  } else if (scenario === NON_INTERACTIVE_DISPATCH_SCENARIO) {
    findings.push(...mergeRefusalFindings(scenario, records));
    guardReadFindings();
    findings.push(...dispatchFindings(records));
  } else if (scenario === NESTED_SPAWN_SCENARIO) {
    if (merges.length === 0) findings.push('the gate did not request pr-merge after the abort');
    const applied = appliedMergeCount(records);
    if (applied !== 1) findings.push(appliedMergeFinding(applied));
    findings.push(...dispatchFindings(records));
  } else if (scenario === 'merge-proceeds') {
    if (merges.length === 0) findings.push('the gate did not request pr-merge');
    const applied = appliedMergeCount(records);
    if (applied !== 1) findings.push(appliedMergeFinding(applied));
  } else if (scenario === BOT_LOGIN_SCENARIO) {
    // The log shows that the merge was applied, never why: the chat report, where the per-login
    // `mergeGate.botAccounts` line stands, is captured nowhere, so that line is left to contract
    // tests. `merge-proceeds` is the control that differs from this fixture in the one comment.
    if (merges.length === 0) {
      findings.push(
        'the gate did not request pr-merge although the only other comment is from a mergeGate.botAccounts login',
      );
    }
    const applied = appliedMergeCount(records);
    if (applied !== 1) findings.push(appliedMergeFinding(applied));
    // A merge without a comment read never saw the listed login, so it proves nothing about the key.
    const starts = startRecords(records);
    const firstMerge = starts.findIndex((record) => record.operation === 'pr-merge');
    const readBefore = starts
      .slice(0, firstMerge < 0 ? starts.length : firstMerge)
      .some((record) => record.operation === 'pr-comments-read');
    if (!readBefore) findings.push('pr-comments-read was not observed before the first pr-merge');
  } else if (scenario === 'guard-blocks-merge') {
    findings.push(...mergeRefusalFindings(scenario, records));
    guardReadFindings();
  } else if (scenario === NO_CI_UNATTENDED_MERGES_SCENARIO) {
    // The log shows that the merge was applied, never why the gate took the policy as its answer: the
    // chat report, where the Phase 6 policy line stands, is captured nowhere. The refusal scenarios
    // beside this one differ from it in exactly one fact each, which is what makes the merge here
    // attributable to the policy rather than to a gate that merges unreported check lists.
    if (merges.length === 0) {
      findings.push(
        'the gate did not request pr-merge although the declared no-CI policy was active and granted for an unattended run',
      );
    }
    const applied = appliedMergeCount(records);
    if (applied !== 1) findings.push(appliedMergeFinding(applied));
  } else if (scenario === NO_CI_MERGE_FAILURE_SCENARIO) {
    // The applied merge fails with COMMAND_FAILED (mutationMayHaveSucceeded: true), so the gate is expected to report and not to
    // retry: exactly one applied `pr-merge` record. The preview call that precedes it is a record of
    // its own and is not counted.
    if (merges.length === 0) findings.push('the gate did not request pr-merge');
    const applied = appliedMergeCount(records);
    if (applied !== 1) findings.push(appliedMergeFinding(applied));
  } else if (
    scenario === NO_CI_FLAG_ABSENT_SCENARIO ||
    scenario === NO_CI_UNLISTED_BASE_SCENARIO ||
    scenario === NO_CI_REPORTED_CHECK_SCENARIO
  ) {
    // The fourth shape of the README: a run that ends before any merge decision, asserted by the
    // absence of `pr-merge` plus the one read that carries the deciding fact.
    findings.push(...mergeRefusalFindings(scenario, records));
    if (operationStarts(records, 'pr-status-read').length === 0) {
      findings.push('the run never read the status that carries the check list');
    }
  } else if (scenario === NO_CI_STATUS_FAILURE_SCENARIO) {
    findings.push(...mergeRefusalFindings(scenario, records));
    // The first read succeeds and every later one fails, so fewer than two reads means the failing
    // element was never served and the run proved nothing about a failed read.
    const reads = operationStarts(records, 'pr-status-read').length;
    if (reads < 2)
      findings.push(`pr-status-read appears ${reads} time(s); the failing read was not observed`);
  } else if (scenario === 'linked-issue-open-points') {
    const reads = operationStarts(records, 'issue-comments-read').length;
    if (reads !== 1) findings.push(`issue-comments-read appears ${reads} time(s), expected one`);
    findings.push(...mergeRefusalFindings(scenario, records));
    findings.push(...appliedMutationFindings(records));
  } else if (scenario === 'unreported-checks-block-merge') {
    findings.push(...mergeRefusalFindings(scenario, records));
    if (operationStarts(records, 'pr-status-read').length === 0) {
      findings.push('the run never read the unreported check list');
    }
  } else if (scenario === QUICK_COMMIT_SCENARIO) {
    // A re-dispatched run continues the guard state its record holds, so it need not repeat Phase
    // 1's reads; Phase 4 reads every guard surface fresh. One read of each is therefore the Phase-4
    // proxy here, not two, and it shows only that the reads happened. That the decision fell on
    // condition 11 is carried by the merge-proceeds control — the same forge with no record merges —
    // and, as prose, by the stop report the seal recorded.
    findings.push(...mergeRefusalFindings(scenario, records));
    for (const surface of GUARD_SURFACES) {
      if (operationStarts(records, surface).length === 0) {
        findings.push(`${surface} was never read; Phase 4 was not observed`);
      }
    }
    if (operationStarts(records, 'pr-status-read').length === 0) {
      findings.push('the run never read the status that carries the check identity');
    }
    findings.push(...pushFindings(sealedEvidence, fixture));
    findings.push(...sealedReportFindings(scenario, sealedEvidence));
  } else if (scenario === PRESENCE_NOTICE_SCENARIO) {
    // merge-proceeds' ending, unchanged: the notice changes no gate decision. The presence calls go
    // to the state helper, never to the forge, so the log carries no trace of them either way.
    if (merges.length === 0) {
      findings.push(
        'the gate did not request pr-merge although the presence notice decides nothing',
      );
    }
    const applied = appliedMergeCount(records);
    if (applied !== 1) findings.push(appliedMergeFinding(applied));
    findings.push(...sealedReportFindings(scenario, sealedEvidence));
  } else if (scenario === LIFECYCLE_SCENARIO) {
    const sequence = fixture.operations?.['pr-status-read']?.sequence ?? [];
    const flipped =
      sequence.findIndex((entry) => entry.envelope?.data?.result?.checksReported === false) + 1;
    if (flipped < 1) findings.push('the fixture defines no flipped checksReported:false element');
    findings.push(...mergeRefusalFindings(scenario, records));
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
  BOT_LOGIN_SCENARIO,
  CONFIGURED_REVIEWER_SCENARIO,
  'guard-blocks-merge',
  'linked-issue-open-points',
  'merge-proceeds',
  NESTED_SPAWN_SCENARIO,
  PRESENCE_NOTICE_SCENARIO,
  QUICK_COMMIT_SCENARIO,
  NON_INTERACTIVE_DISPATCH_SCENARIO,
  NO_CI_FLAG_ABSENT_SCENARIO,
  NO_CI_MERGE_FAILURE_SCENARIO,
  NO_CI_REPORTED_CHECK_SCENARIO,
  NO_CI_STATUS_FAILURE_SCENARIO,
  NO_CI_UNATTENDED_MERGES_SCENARIO,
  NO_CI_UNLISTED_BASE_SCENARIO,
  'unreported-checks-block-merge',
  LIFECYCLE_SCENARIO,
]);

// The evaluator contract the generic half calls, in the order it calls it.

// Only the sequenced Phase-4 scenario needs correlated start/complete records; every other
// scenario's stub writes the legacy single-record form.
export function usesLifecycleSchema(scenario) {
  return scenario === LIFECYCLE_SCENARIO;
}

// Never, for any gate scenario. Every one of them reads the forge before it can decide anything, so
// a call log with no record is a run that never started — invalid evidence to be redone, not a
// behavioural result. The `iterate` suite answers this differently because its refusals happen
// before the first forge read; this suite keeps the rule it has always had.
export function permitsEmptyCallLog() {
  return false;
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

// The sealed observation of the two scenarios that declare one; see `sealed-observation.mjs`.
export function parseSealedEvidence(text) {
  return parseSealedObservation(text);
}

export function findings({
  scenario,
  records,
  fixture,
  auxiliaryRecords,
  requiresAuxiliary,
  sealedEvidence = null,
}) {
  return [
    ...outcomeFindings(scenario, records, fixture, sealedEvidence),
    ...(requiresAuxiliary ? iterateTraceFindings(auxiliaryRecords, fixture) : []),
  ];
}

export function fixtureIndependentFindings({ scenario, records }) {
  const findings = [];
  if (MERGING_SCENARIOS.includes(scenario)) {
    const applied = appliedMergeCount(records);
    if (applied > 1) findings.push(appliedMergeFinding(applied));
  }
  if (scenario === 'linked-issue-open-points') {
    findings.push(...mergeRefusalFindings(scenario, records), ...appliedMutationFindings(records));
  }
  if (DISPATCH_SCENARIOS.includes(scenario)) findings.push(...redispatchFindings(records));
  return findings;
}

// The findings a run the host stopped has already earned, which `retry-aborted` asks for before it
// discards an attempt that left a call (see `assessAbortedEvidence` in the shared evaluator). Only
// what no continuation could undo counts: a merge the scenario refuses, a second applied merge where
// one is expected, an applied mutation by the observer, a second dispatch in a dispatch scenario,
// and a configured-reviewer handoff the echo recorded wrong. A correct recorded handoff is a pass,
// and discarding a pass hides no deviation.
// Missing guard reads, an absent merge or an absent delegation are not decisive — a stopped run is
// expected to be missing things — so a run whose deviation is an omission is distinguished from a
// capacity abort only by the host's error line on the stop receipt.
export function decisiveFindings({
  scenario,
  records,
  fixture,
  auxiliaryRecords,
  requiresAuxiliary,
  sealedEvidence = null,
}) {
  const findings = [];
  if (MERGING_SCENARIOS.includes(scenario)) {
    const applied = appliedMergeCount(records);
    if (applied > 1) findings.push(appliedMergeFinding(applied));
  } else if (Object.hasOwn(MERGE_REFUSALS, scenario)) {
    findings.push(...mergeRefusalFindings(scenario, records));
  } else {
    throw new Error(`${scenario} is registered as branched but reaches no outcome branch`);
  }
  if (scenario === 'linked-issue-open-points') findings.push(...appliedMutationFindings(records));
  if (DISPATCH_SCENARIOS.includes(scenario)) findings.push(...redispatchFindings(records));
  if (scenario === QUICK_COMMIT_SCENARIO) findings.push(...pushFindings(sealedEvidence, fixture));
  if (requiresAuxiliary && auxiliaryRecords.length > 0) {
    findings.push(...iterateTraceFindings(auxiliaryRecords, fixture));
  }
  return findings;
}
