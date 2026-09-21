// The half of the evaluation that is the same whatever tool a suite measures: reading an archived
// call log, deciding whether it is evidence at all, and binding it to the build identity and the
// fixture it was recorded against. What a particular run *should* have done is the other half, and
// it lives in the suite's own evaluator, reached here through `suite.evaluator`.
//
// The split follows the same line the rest of this scaffold does. A record's shape, its sequence,
// the runtime root it ran from and the fixture's answerable surface are properties of the bench; a
// scenario name, a guard surface and a merge decision are properties of the tool under test.

import { isDeepStrictEqual } from 'node:util';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { isVersionStampOnlyPredecessor } from './build-identity.mjs';

const LEGACY_KEYS = ['apply', 'at', 'cwd', 'operation', 'seq'];
const START_KEYS = ['apply', 'at', 'callId', 'cwd', 'event', 'operation', 'seq'];
const COMPLETE_KEYS = ['at', 'callId', 'event', 'seq'];
const TRACKER_CORE = resolve(
  import.meta.dirname,
  '..',
  '..',
  'src',
  'scripts',
  'remote-tracker-core.mjs',
);
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
  const helper = readFileSync(TRACKER_CORE, 'utf8');
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
  const helper = readFileSync(TRACKER_CORE, 'utf8');
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

// The two record schemas the stub can write, chosen by the suite rather than inferred: a scenario
// that needs correlated start/complete pairs says so, and every other scenario keeps the legacy
// single-record form. Which scenarios are which is a property of the tool under test, so the
// predicate comes from the suite's evaluator.
export function schemaProblems(records, lifecycle) {
  const problems = [];
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

export function normalizedPath(path) {
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

export function evaluateEvidence(
  suite,
  {
    scenario,
    logText,
    fixture,
    projectRoot,
    buildIdentity,
    expectedBuildIdentity,
    answerableOperations,
    supportedOperations = null,
    auxiliaryText = null,
  },
) {
  if (!suite.scenarios.includes(scenario)) throw new Error(`no evaluator for ${scenario}`);
  const evaluator = suite.evaluator;
  const parsed = parseCallLog(logText);
  const validityProblems = [...parsed.problems];
  if (parsed.problems.length === 0) {
    validityProblems.push(
      ...schemaProblems(parsed.records, evaluator.usesLifecycleSchema(scenario)),
    );
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
    // The fixture's own surface, plus whatever the suite declares a run may legitimately attempt
    // without the fixture answering it. For `merge-gate` that is `pr-merge`: the gate's merge
    // decision is the thing under test, and a scenario in which no merge is offered still has to be
    // able to record the attempt. Which operation that is, is a property of the tool under test, so
    // the suite names it rather than this module.
    const allowed = new Set([...answerableOperations, ...suite.alwaysAllowedOperations]);
    for (const operation of new Set(
      startRecords(parsed.records).map((record) => record.operation),
    )) {
      if (!allowed.has(operation) && supported.has(operation)) {
        validityProblems.push(`fixture leaves supported operation ${operation} undefined`);
      }
    }
  }
  if (parsed.problems.length === 0) {
    validityProblems.push(
      ...evaluator.validityProblems({ scenario, records: parsed.records, fixture, projectRoot }),
    );
  }
  const auxiliary = suite.auxiliaryEvidence;
  const requiresAuxiliary = auxiliary ? auxiliary.required(scenario) : false;
  let auxiliaryRecords = [];
  if (requiresAuxiliary) {
    if (typeof auxiliaryText !== 'string') {
      validityProblems.push(auxiliary.missingMessage);
    } else {
      const parsedAuxiliary = evaluator.parseAuxiliary(auxiliaryText, projectRoot);
      validityProblems.push(...parsedAuxiliary.problems);
      auxiliaryRecords = parsedAuxiliary.records;
    }
  } else if (auxiliaryText !== null && auxiliaryText !== undefined) {
    validityProblems.push(auxiliary ? auxiliary.orphanMessage : 'an auxiliary trace is orphaned');
  }
  const findings =
    validityProblems.length === 0
      ? evaluator.findings({
          scenario,
          records: parsed.records,
          fixture,
          auxiliaryRecords,
          // Passed rather than recomputed on the other side: two predicates for "does this scenario
          // pair a second evidence file" can disagree, and the one that decided whether the records
          // above were parsed at all is the one the findings have to be read against.
          requiresAuxiliary,
        })
      : [];
  return { records: parsed.records, validityProblems, findings };
}
