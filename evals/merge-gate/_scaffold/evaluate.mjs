import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { isVersionStampOnlyPredecessor } from './build-identity.mjs';
import {
  CONFIGURED_REVIEWER_SCENARIO,
  requiresIterateTrace,
} from './configured-reviewer-scenario.mjs';
import { OUTCOME_EVALUATORS } from './suite.mjs';

const LEGACY_KEYS = ['apply', 'at', 'cwd', 'operation', 'seq'];
const START_KEYS = ['apply', 'at', 'callId', 'cwd', 'event', 'operation', 'seq'];
const COMPLETE_KEYS = ['at', 'callId', 'event', 'seq'];
const GUARD_SURFACES = ['review-threads-read', 'pr-comments-read', 'pr-reviews-read'];
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
let supportedOperationsCache = null;
let mutatingOperationsCache = null;

function quotedValues(source) {
  return [...source.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function declaredSet(source, name) {
  const declaration = source.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!declaration) throw new Error(`cannot derive ${name} from the shipped tracker helper`);
  return quotedValues(declaration[1]);
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`cannot derive ${name} from the shipped tracker helper`);
  const opening = source.indexOf('{', start);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(opening + 1, index);
    }
  }
  throw new Error(`cannot find the end of ${name} in the shipped tracker helper`);
}

// Derive the vocabulary from the shipped helper's operation registry plus its pure local-operation
// dispatcher. Reading the registry is important: composite operations such as `sf-label-migrate`
// are supported without appearing as a provider command-plan switch case. This set classifies
// contamination only and executes nothing.
export function supportedTrackerOperations() {
  if (supportedOperationsCache !== null) return supportedOperationsCache;
  const helper = readFileSync(
    resolve(import.meta.dirname, '..', '..', '..', 'src', 'scripts', 'remote-tracker-core.mjs'),
    'utf8',
  );
  supportedOperationsCache = new Set(declaredSet(helper, 'REMOTE_OPERATIONS'));
  for (const match of functionBody(helper, 'localOperation').matchAll(/case '([^']+)':/g))
    supportedOperationsCache.add(match[1]);
  return supportedOperationsCache;
}

// `apply` in the call log records the raw presence of the CLI flag. The shipped helper gives that
// flag write semantics only for operations in MUTATIONS; reads run immediately in either spelling.
// Derive the same set here so an agent that redundantly passes `--apply` to a read does not turn a
// read-only observation into a mutation in the evaluator's evidence model.
export function mutatingTrackerOperations() {
  if (mutatingOperationsCache !== null) return mutatingOperationsCache;
  const helper = readFileSync(
    resolve(import.meta.dirname, '..', '..', '..', 'src', 'scripts', 'remote-tracker-core.mjs'),
    'utf8',
  );
  mutatingOperationsCache = new Set(declaredSet(helper, 'MUTATIONS'));
  return mutatingOperationsCache;
}

export function parseCallLog(raw) {
  const problems = [];
  const records = [];
  for (const [index, line] of raw.split('\n').entries()) {
    if (line.trim() === '') continue;
    try {
      const record = JSON.parse(line);
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        problems.push(`line ${index + 1} is not a JSON object`);
      } else records.push(record);
    } catch (error) {
      problems.push(`line ${index + 1} is not JSON: ${error.message}`);
    }
  }
  if (records.length === 0) problems.push('the call log contains no records');
  return { records, problems };
}

export function startRecords(records) {
  return records.filter(
    (record) =>
      record.event === 'start' ||
      (!Object.hasOwn(record, 'event') && typeof record.operation === 'string'),
  );
}

export function operationStarts(records, operation) {
  return startRecords(records).filter((record) => record.operation === operation);
}

function schemaProblems(scenario, records) {
  const problems = [];
  const lifecycle = scenario === 'unreported-checks-at-phase-four';
  const starts = new Map();
  const completions = new Map();
  records.forEach((record, index) => {
    const label = `record ${index + 1}`;
    if (record.seq !== index + 1)
      problems.push(`${label} has seq ${record.seq}, expected ${index + 1}`);
    if (!lifecycle) {
      if (!isDeepStrictEqual(Object.keys(record).sort(), LEGACY_KEYS)) {
        problems.push(`${label} does not carry exactly the legacy keys`);
      }
      if (typeof record.operation !== 'string') problems.push(`${label} has no operation`);
      if (typeof record.apply !== 'boolean') problems.push(`${label} has no boolean apply`);
      if (typeof record.at !== 'string' || Number.isNaN(Date.parse(record.at))) {
        problems.push(`${label} has no parseable timestamp`);
      }
      if (record.cwd !== null && typeof record.cwd !== 'string') {
        problems.push(`${label} has an invalid cwd`);
      }
      return;
    }
    const expected = record.event === 'start' ? START_KEYS : COMPLETE_KEYS;
    if (!isDeepStrictEqual(Object.keys(record).sort(), expected)) {
      problems.push(`${label} does not carry the lifecycle keys for ${record.event ?? 'unknown'}`);
    }
    if (typeof record.callId !== 'string' || record.callId === '') {
      problems.push(`${label} has no callId`);
    }
    if (typeof record.at !== 'string' || Number.isNaN(Date.parse(record.at))) {
      problems.push(`${label} has no parseable timestamp`);
    }
    if (record.event === 'start') {
      if (typeof record.operation !== 'string' || record.operation === '') {
        problems.push(`${label} has no operation`);
      }
      if (typeof record.apply !== 'boolean') problems.push(`${label} has no boolean apply`);
      if (record.cwd !== null && typeof record.cwd !== 'string') {
        problems.push(`${label} has an invalid cwd`);
      }
      if (starts.has(record.callId)) problems.push(`${label} duplicates start ${record.callId}`);
      starts.set(record.callId, record);
    } else if (record.event === 'complete') {
      if (completions.has(record.callId))
        problems.push(`${label} duplicates completion ${record.callId}`);
      completions.set(record.callId, record);
    } else problems.push(`${label} has unknown event ${JSON.stringify(record.event)}`);
  });
  if (lifecycle) {
    for (const [callId, start] of starts) {
      const completion = completions.get(callId);
      if (!completion) problems.push(`start ${callId} has no completion`);
      else if (completion.seq <= start.seq)
        problems.push(`completion ${callId} precedes its start`);
    }
    for (const callId of completions.keys()) {
      if (!starts.has(callId)) problems.push(`completion ${callId} has no start`);
    }
  }
  return problems;
}

function normalizedPath(path) {
  let head = resolve(path);
  const tail = [];
  for (;;) {
    if (existsSync(head)) {
      const physical = resolve(realpathSync(head), ...tail);
      return physical === '/private/tmp' || physical.startsWith('/private/tmp/')
        ? physical.slice('/private'.length)
        : physical;
    }
    const parent = dirname(head);
    if (parent === head) return resolve(path);
    tail.unshift(basename(head));
    head = parent;
  }
}

function runtimeRootProblems(records, projectRoot) {
  const expected = normalizedPath(projectRoot);
  return startRecords(records).flatMap((record, index) => {
    if (typeof record.cwd !== 'string' || record.cwd === '') {
      return [`record ${index + 1} states no runtime root`];
    }
    return normalizedPath(record.cwd) === expected
      ? []
      : [`record ${index + 1} ran from ${record.cwd}, expected ${projectRoot}`];
  });
}

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
  } else if (scenario === 'unreported-checks-at-phase-four') {
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
  }
  return findings;
}

export function evaluateEvidence({
  scenario,
  logText,
  fixture,
  projectRoot,
  buildIdentity,
  expectedBuildIdentity,
  answerableOperations,
  supportedOperations = null,
  iterateTraceText = null,
}) {
  if (!OUTCOME_EVALUATORS.includes(scenario)) throw new Error(`no evaluator for ${scenario}`);
  const parsed = parseCallLog(logText);
  const validityProblems = [...parsed.problems];
  if (parsed.problems.length === 0) {
    validityProblems.push(...schemaProblems(scenario, parsed.records));
    validityProblems.push(...runtimeRootProblems(parsed.records, projectRoot));
  }
  // The same exception the archived-run assertions apply, and it is needed here for the same
  // reason: `publishRound` re-evaluates every already-published scenario against a fresh build, not
  // only the scenarios the round re-ran, so a release bump would otherwise make publishing any
  // round impossible until all thirty were re-recorded. A slot of the round being published
  // matches exactly — it was built from the same manifest moments earlier — so this only ever
  // reaches the standing evidence beside it.
  if (
    expectedBuildIdentity &&
    !isDeepStrictEqual(buildIdentity, expectedBuildIdentity) &&
    !isVersionStampOnlyPredecessor(buildIdentity, expectedBuildIdentity)
  ) {
    validityProblems.push('the build identity does not match the round manifest');
  }
  if (answerableOperations) {
    const supported = supportedOperations ?? supportedTrackerOperations();
    const allowed = new Set([...answerableOperations, 'pr-merge']);
    for (const operation of new Set(
      startRecords(parsed.records).map((record) => record.operation),
    )) {
      if (!allowed.has(operation) && supported.has(operation)) {
        validityProblems.push(`fixture leaves supported operation ${operation} undefined`);
      }
    }
  }
  if (scenario === 'unreported-checks-at-phase-four' && parsed.problems.length === 0) {
    const sequence = fixture.operations?.['pr-status-read']?.sequence ?? [];
    const flipped =
      sequence.findIndex((entry) => entry.envelope?.data?.result?.checksReported === false) + 1;
    if (flipped < 1) validityProblems.push('the fixture has no flipped status element');
    else {
      const problem = phaseFourInvalidity(parsed.records, flipped);
      if (problem) validityProblems.push(problem);
    }
  }
  let iterateRecords = [];
  if (requiresIterateTrace(scenario)) {
    if (typeof iterateTraceText !== 'string') {
      validityProblems.push('the run has no paired iterate trace');
    } else {
      const trace = parseIterateTrace(iterateTraceText, projectRoot);
      validityProblems.push(...trace.problems);
      iterateRecords = trace.records;
    }
  } else if (iterateTraceText !== null && iterateTraceText !== undefined) {
    validityProblems.push('an iterate trace is orphaned in a scenario without an echo');
  }
  const findings =
    validityProblems.length === 0
      ? [
          ...outcomeFindings(scenario, parsed.records, fixture),
          ...(requiresIterateTrace(scenario) ? iterateTraceFindings(iterateRecords, fixture) : []),
        ]
      : [];
  return { records: parsed.records, validityProblems, findings };
}
