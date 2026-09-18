import { isDeepStrictEqual } from 'node:util';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { OUTCOME_EVALUATORS } from './suite.mjs';

const LEGACY_KEYS = ['apply', 'at', 'cwd', 'operation', 'seq'];
const START_KEYS = ['apply', 'at', 'callId', 'cwd', 'event', 'operation', 'seq'];
const COMPLETE_KEYS = ['at', 'callId', 'event', 'seq'];
const GUARD_SURFACES = ['review-threads-read', 'pr-comments-read', 'pr-reviews-read'];
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

function outcomeFindings(scenario, records, fixture) {
  const findings = [];
  const merges = operationStarts(records, 'pr-merge');
  const guardReadFindings = () => {
    for (const surface of GUARD_SURFACES) {
      const count = operationStarts(records, surface).length;
      if (count < 2) findings.push(`${surface} appears ${count} time(s); Phase 4 was not observed`);
    }
  };
  if (scenario === 'merge-proceeds') {
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
}) {
  if (!OUTCOME_EVALUATORS.includes(scenario)) throw new Error(`no evaluator for ${scenario}`);
  const parsed = parseCallLog(logText);
  const validityProblems = [...parsed.problems];
  if (parsed.problems.length === 0) {
    validityProblems.push(...schemaProblems(scenario, parsed.records));
    validityProblems.push(...runtimeRootProblems(parsed.records, projectRoot));
  }
  if (expectedBuildIdentity && !isDeepStrictEqual(buildIdentity, expectedBuildIdentity)) {
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
  const findings =
    validityProblems.length === 0 ? outcomeFindings(scenario, parsed.records, fixture) : [];
  return { records: parsed.records, validityProblems, findings };
}
