// The `merge-gate` half of the evaluation: everything that names a scenario, a guard surface, or a
// merge decision. The generic half — parsing the call log, pinning record shape and runtime root,
// binding a run to its build identity — is `evals/_scaffold/evaluate.mjs`, which reaches this
// module through the suite configuration and knows nothing about the gate.
//
// Like the generic evaluator, this file is deliberately not an instrument file: it reads archived
// evidence and never takes part in a run, so a change here cannot change what any run did.

import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
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
  REPAIR_AFTER_BASE_MERGE_SCENARIO,
  REPAIR_SCENARIOS,
  REPEATED_INEFFECTIVE_REPAIR_SCENARIO,
} from './configured-reviewer-scenario.mjs';
import { REMOTE_DIRECTORY, REPAIRED_PATH } from './repair-origin.mjs';

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
// The repair scenarios' trace: one schema, two record kinds — a delegation the echo answered and a
// push the bare `origin` received — each with exactly its own keys.
const REPAIR_TRACE_SCHEMA = 'effective-flow/merge-gate-repair-trace/v1';
const REPAIR_TRACE_KEYS = Object.freeze({
  dispatch: [
    'at',
    'baseAdvanced',
    'body',
    'controls',
    'cwd',
    'headAfter',
    'headBefore',
    'itemFilter',
    'items',
    'kind',
    'outcomes',
    'planned',
    'pullRequest',
    'schema',
    'scope',
    'seq',
  ],
  push: [
    'at',
    'cwd',
    'firstParent',
    'kind',
    'label',
    'merge',
    'ref',
    'schema',
    'secondParentIsBase',
    'seq',
  ],
});
// The scenarios in which the gate is expected to attempt the merge: the applied call is made once,
// and a second one is a deviation whatever else the run did. Both no-CI policy members are here —
// the one that merges and the one whose single applied merge is refused by the forge.
const MERGING_SCENARIOS = Object.freeze([
  'merge-proceeds',
  REPAIR_AFTER_BASE_MERGE_SCENARIO,
  BOT_LOGIN_SCENARIO,
  NESTED_SPAWN_SCENARIO,
  NO_CI_UNATTENDED_MERGES_SCENARIO,
  NO_CI_MERGE_FAILURE_SCENARIO,
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
  const remote = normalizedPath(resolve(dirname(projectRoot), REMOTE_DIRECTORY));
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
    const repair = record.schema === REPAIR_TRACE_SCHEMA;
    const keys = repair ? REPAIR_TRACE_KEYS[record.kind] : ITERATE_TRACE_KEYS;
    if (!keys || !isDeepStrictEqual(Object.keys(record).sort(), keys)) {
      problems.push(`${label} does not carry exactly the echo record keys`);
    }
    if (!repair && record.schema !== ITERATE_TRACE_SCHEMA) {
      problems.push(`${label} has an unknown schema`);
    }
    if (records.length > 0 && records[0].schema !== record.schema) {
      problems.push(`${label} mixes the echo trace schemas`);
    }
    if (record.seq !== records.length + 1) {
      problems.push(`${label} has seq ${record.seq}, expected ${records.length + 1}`);
    }
    // A push record is written by the bare `origin`'s receive hook, which runs in that repository.
    const where = repair && record.kind === 'push' ? remote : expected;
    if (typeof record.cwd !== 'string' || normalizedPath(record.cwd) !== where) {
      problems.push(`${label} ran from ${record.cwd}, expected ${where}`);
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

// The two repair-accounting scenarios (#662), as the paired trace records them: which thread each
// delegation carried, which head it started from and landed, the authorized scope it carried, and
// every push the bare `origin` received. The thread and the heads are the scenario's composition:
//
//   * `repair-after-base-merge-merges` — the first delegation repairs the seeded finding; the forge
//     then reports the repaired head `BEHIND`, the gate pushes exactly one base merge onto it, and
//     the second delegation, from that base-merge head, repairs the re-reported finding;
//   * `repeated-ineffective-repair-stops` — two delegations, the second from the first repair's
//     head, and nothing after it: no third delegation and no push.
//
// What a trace cannot show is why the gate stopped or why it went on: the chat report, where the
// repair-progress block stands, is captured nowhere, so those halves are contract tests.
export const REPAIR_THREADS = Object.freeze({
  first: 'PRRT_kwDOrepairCauseOne',
  second: 'PRRT_kwDOrepairCauseTwo',
});
const REPAIR_EXPECTATIONS = Object.freeze({
  [REPAIR_AFTER_BASE_MERGE_SCENARIO]: {
    dispatches: [
      { thread: REPAIR_THREADS.first, headBefore: 'seed', headAfter: 'repair-1' },
      { thread: REPAIR_THREADS.second, headBefore: 'base-merge', headAfter: 'repair-2' },
    ],
    // One gate base merge, between the two delegations.
    pushes: [{ afterDispatch: 1, firstParent: 'repair-1', label: 'base-merge' }],
  },
  [REPEATED_INEFFECTIVE_REPAIR_SCENARIO]: {
    dispatches: [
      { thread: REPAIR_THREADS.first, headBefore: 'seed', headAfter: 'repair-1' },
      { thread: REPAIR_THREADS.second, headBefore: 'repair-1', headAfter: 'repair-2' },
    ],
    pushes: [],
  },
});
const REPAIR_SCOPE = Object.freeze({
  valid: true,
  paths: [REPAIRED_PATH],
  head: 'seed',
  mergeBase: 'seed-base',
});

function dispatchRecordFindings(record, position, expected) {
  const findings = [];
  const label = `delegation ${position}`;
  if (record.pullRequest !== 42) findings.push(`${label} names pull request ${record.pullRequest}`);
  if (
    !isDeepStrictEqual(record.controls, {
      summaryComment: 'suppressed',
      nextSteps: 'suppressed',
      reviewGuard: 'established',
    })
  ) {
    findings.push(`${label} does not carry the suppressed-summary and review-guard controls`);
  }
  if (!expected) return findings;
  if (record.itemFilter !== `threads=${expected.thread}`) {
    findings.push(`${label} carries item filter ${JSON.stringify(record.itemFilter)}`);
  }
  const items = Array.isArray(record.items) ? record.items : [];
  if (items.length !== 1 || items[0]?.kind !== 'thread' || items[0]?.threadId !== expected.thread) {
    findings.push(`${label} does not carry exactly the one thread item ${expected.thread}`);
  }
  if (!isDeepStrictEqual(record.scope, REPAIR_SCOPE)) {
    findings.push(
      `${label} carries authorized scope ${JSON.stringify(record.scope)}; the pull request's one path, read once at the seeded head before the first delegation, is expected`,
    );
  }
  if (record.headBefore !== expected.headBefore) {
    findings.push(
      `${label} started from head ${record.headBefore}, expected ${expected.headBefore}`,
    );
  }
  if (record.planned !== true || record.headAfter !== expected.headAfter) {
    findings.push(`${label} did not land the planned repair head ${expected.headAfter}`);
  }
  return findings;
}

function pushRecordFindings(record, expected, dispatches, branch) {
  const findings = [];
  if (!expected) return findings;
  const after = dispatches[expected.afterDispatch - 1];
  const before = dispatches[expected.afterDispatch];
  if (
    after === undefined ||
    record.seq < after.seq ||
    (before !== undefined && record.seq > before.seq)
  ) {
    findings.push(`the gate base merge was not pushed after delegation ${expected.afterDispatch}`);
  }
  if (
    record.ref !== `refs/heads/${branch}` ||
    record.merge !== true ||
    record.secondParentIsBase !== true ||
    record.firstParent !== expected.firstParent ||
    record.label !== expected.label
  ) {
    findings.push(
      `the gate push to ${record.ref} is not one merge of the base into head ${expected.firstParent}`,
    );
  }
  return findings;
}

// `decisive` keeps only what a stopped run already showed and no continuation could undo: a
// delegation or a push beyond the composition, and a recorded one that is wrong. A missing one is
// what a stopped run is expected to lack.
export function repairTraceFindings(scenario, records, fixture, { decisive = false } = {}) {
  const findings = [];
  const expected = REPAIR_EXPECTATIONS[scenario];
  const branch = fixture?.originHeads?.branch;
  if (records.some((record) => record.schema !== REPAIR_TRACE_SCHEMA)) {
    findings.push('the iterate trace is not the repair echo trace');
    return findings;
  }
  const dispatches = records.filter((record) => record.kind === 'dispatch');
  const pushes = records.filter((record) => record.kind === 'push');
  if (dispatches.length > expected.dispatches.length) {
    findings.push(
      `the gate delegated ${dispatches.length} times; the composition holds exactly ${expected.dispatches.length} delegations, and a further one is a repair the gate should not have dispatched`,
    );
  } else if (!decisive && dispatches.length < expected.dispatches.length) {
    findings.push(
      `the gate delegated ${dispatches.length} time(s); ${expected.dispatches.length} delegations are expected`,
    );
  }
  dispatches.forEach((record, index) => {
    findings.push(...dispatchRecordFindings(record, index + 1, expected.dispatches[index]));
  });
  if (pushes.length > expected.pushes.length) {
    findings.push(
      `the origin received ${pushes.length} push(es); the composition holds exactly ${expected.pushes.length}`,
    );
  } else if (!decisive && pushes.length < expected.pushes.length) {
    findings.push(
      `the origin received ${pushes.length} push(es); the gate base merge was never pushed`,
    );
  }
  pushes.forEach((record, index) => {
    findings.push(...pushRecordFindings(record, expected.pushes[index], dispatches, branch));
  });
  return findings;
}

// The halves that need both evidence files: the merge comes after the last delegation, and the stop
// comes after the gate read the threads of the second repair's head. The two files are ordered only
// by wall clock, which the echo and the stub take from the same host.
function repairOrderingFindings(scenario, records, auxiliaryRecords) {
  const dispatches = auxiliaryRecords.filter((record) => record.kind === 'dispatch');
  const last = dispatches[REPAIR_EXPECTATIONS[scenario].dispatches.length - 1];
  if (!last) return [];
  if (scenario === REPAIR_AFTER_BASE_MERGE_SCENARIO) {
    const merges = operationStarts(records, 'pr-merge').filter((record) => record.apply === true);
    return merges.some((record) => record.at <= last.at)
      ? ['the gate applied pr-merge before the second repair landed']
      : [];
  }
  return operationStarts(records, 'review-threads-read').some((record) => record.at > last.at)
    ? []
    : [
        'the gate never read the review threads after the second repair landed, so no stop it made rests on fresh evidence',
      ];
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
  [REPEATED_INEFFECTIVE_REPAIR_SCENARIO]:
    'the gate requested pr-merge although the second repair of the same reviewer cause was re-reported',
});

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
  } else if (scenario === REPAIR_AFTER_BASE_MERGE_SCENARIO) {
    // The positive control of the pair: the gate base merge used no repair attempt, so the
    // re-reported finding gets its second repair, which resolves it, and the merge proceeds.
    if (merges.length === 0) {
      findings.push(
        'the gate did not request pr-merge although the second repair resolved the finding and the gate base merge used no repair attempt',
      );
    }
    const applied = appliedMergeCount(records);
    if (applied !== 1) findings.push(appliedMergeFinding(applied));
  } else if (scenario === REPEATED_INEFFECTIVE_REPAIR_SCENARIO) {
    findings.push(...mergeRefusalFindings(scenario, records));
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
  REPAIR_AFTER_BASE_MERGE_SCENARIO,
  REPEATED_INEFFECTIVE_REPAIR_SCENARIO,
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

// The sequenced Phase-4 scenario and the two repair scenarios, whose head-indexed fixtures are
// sequenced too, need correlated start/complete records; every other scenario's stub writes the
// legacy single-record form.
export function usesLifecycleSchema(scenario) {
  return scenario === LIFECYCLE_SCENARIO || REPAIR_SCENARIOS.includes(scenario);
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

function traceFindings(scenario, records, auxiliaryRecords, fixture) {
  if (!REPAIR_SCENARIOS.includes(scenario)) return iterateTraceFindings(auxiliaryRecords, fixture);
  return [
    ...repairTraceFindings(scenario, auxiliaryRecords, fixture),
    ...repairOrderingFindings(scenario, records, auxiliaryRecords),
  ];
}

export function findings({ scenario, records, fixture, auxiliaryRecords, requiresAuxiliary }) {
  return [
    ...outcomeFindings(scenario, records, fixture),
    ...(requiresAuxiliary ? traceFindings(scenario, records, auxiliaryRecords, fixture) : []),
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
  if (requiresAuxiliary && auxiliaryRecords.length > 0) {
    findings.push(
      ...(REPAIR_SCENARIOS.includes(scenario)
        ? repairTraceFindings(scenario, auxiliaryRecords, fixture, { decisive: true })
        : iterateTraceFindings(auxiliaryRecords, fixture)),
    );
  }
  return findings;
}
