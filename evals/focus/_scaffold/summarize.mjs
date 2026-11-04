#!/usr/bin/env node

// The focus round summary for `evals/focus/CALIBRATION.md`: the observed half of the concept's
// success criterion scored over the published runs, with the not-admitted attempts a round retried.
//
//   node evals/focus/_scaffold/summarize.mjs [--round ID|MANIFEST]...
//
// Published runs come from `evals/focus/results/`, each re-evaluated with the scaffold's evaluation
// and the focus evaluator, exactly as publication judged it. Not-admitted attempts are never
// published, so their count and any slot that exhausted its retries come from the rounds given with
// `--round`; without one the summary says the count was not read. A publication can span several
// rounds (each run's metadata names its own), so `--round` is repeatable and, once given, has to
// name every round the published runs come from; a round's attempts count only for the scenarios
// whose published runs that round recorded, since a later round's runs replace an earlier one's.
//
// A round that cannot be published because a slot exhausted its retries is summarized alone, from
// the live round: the criterion is "not measurable", with the not-admitted attempts and the
// not-measured scenarios, and nothing is scored, since its admitted runs were never published. It
// writes nothing and refuses every other case without published runs, so no round can be reported
// that was not recorded.
//
// `summarizeRuns` and `formatSummary` are pure, for tests on synthetic records; `buildSummary` is
// the whole command short of argument parsing and output.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { evaluateEvidence, parseCallLog } from '../../_scaffold/evaluate.mjs';
import { auxiliaryLogPath, sandboxPaths } from '../../_scaffold/sandbox.mjs';
import { REQUIRED_RUNS } from '../../_scaffold/suite.mjs';
import { sealedEvidencePath } from '../../_scaffold/run-evidence.mjs';
import suite from '../suite.config.mjs';
import {
  FINDING,
  loadLabel,
  NOT_ADMITTED,
  parseSealedEvidence,
  parseTrace,
  replayTrace,
  scoreRun,
  traceValidity,
  VERDICTS,
} from './evaluate.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..', '..');
export const RUBRIC_PATH = resolve(
  REPOSITORY_ROOT,
  'docs',
  'developer-guide',
  'focus-labelling-rubric.md',
);
const LABELS_ROOT = resolve(suite.root, 'labels');
export const MATCH_THRESHOLD = 0.8;
const ON_TRACK_FORBIDDEN = new Set(['Looping', 'Drifting', 'Stalled']);

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

// The rubric is pinned by its file content, which survives a squash merge.
export function rubricDigest(path = RUBRIC_PATH) {
  return sha256(readFileSync(path));
}

// The label set as content: each label's name and content digest, sorted, digested once more.
export function labelSetDigest(directory = LABELS_ROOT) {
  const lines = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => `${name} ${sha256(readFileSync(resolve(directory, name)))}`);
  return sha256(lines.join('\n'));
}

function rate(matched, admitted) {
  return admitted === 0 ? null : matched / admitted;
}

function byPrefix(runs, prefix) {
  return runs.flatMap(({ scenario, slot, findings }) =>
    findings
      .filter((finding) => finding.startsWith(prefix))
      .map((finding) => ({ scenario, slot, finding })),
  );
}

// `runs`: admitted, scored runs `{ scenario, slot, verdict, lastVerdict?, matched, findings }`.
// `notAdmitted`: retried attempts `{ scenario, slot, attempt, reason, traceProblems, roundId? }`,
// or `null` when no round was read. `unmeasured`: scenarios whose slot exhausted its retries, with
// `unmeasuredCauses` (scenario → cause) labelling why the last attempt was invalid.
// `labels`: scenario → label. `unpublished`: the summary is of a live round that could not be
// published, so `runs` must be empty and only `unmeasured` decides what is not measured.
export function summarizeRuns({
  runs,
  notAdmitted = null,
  unmeasured = [],
  unmeasuredCauses = {},
  scenarios,
  labels,
  unpublished = false,
}) {
  if (unpublished && runs.length > 0) {
    throw new Error('an unpublished round has no scored runs');
  }
  const labelOf = (scenario) => {
    if (!labels[scenario]) throw new Error(`no label for ${scenario}`);
    return labels[scenario];
  };
  for (const run of runs) labelOf(run.scenario);
  const matched = runs.filter((run) => run.matched).length;
  const perVerdict = VERDICTS.map((verdict) => {
    const subset = runs.filter((run) => labelOf(run.scenario).verdict === verdict);
    const hits = subset.filter((run) => run.matched).length;
    return {
      verdict,
      admitted: subset.length,
      matched: hits,
      matchRate: rate(hits, subset.length),
    };
  });
  // The hard rule reads the last `Verdict:` value when the closing block is ill-formed, so a
  // malformed block cannot hide an on-track run reporting Looping, Drifting or Stalled.
  const onTrackRuns = runs
    .filter((run) => labelOf(run.scenario).verdict === 'On track')
    .map(({ scenario, slot, verdict, lastVerdict }) => ({
      scenario,
      slot,
      verdict: verdict ?? lastVerdict ?? null,
      fromIllFormedBlock: (verdict ?? null) === null && (lastVerdict ?? null) !== null,
    }));
  const onTrackFailures = onTrackRuns.filter(({ verdict }) => ON_TRACK_FORBIDDEN.has(verdict));
  const notMeasured = [...scenarios]
    .filter(
      (scenario) =>
        unmeasured.includes(scenario) ||
        (!unpublished && runs.filter((run) => run.scenario === scenario).length < REQUIRED_RUNS),
    )
    .sort();
  const matchRate = rate(matched, runs.length);
  const reasons = [];
  let state;
  if (notMeasured.length > 0 || unpublished) {
    state = 'not measurable';
    if (notMeasured.length > 0) reasons.push(`not measured: ${notMeasured.join(', ')}`);
    if (unpublished) {
      reasons.push(
        'the round could not be published, so none of its runs is scored and no match rate is reported',
      );
    }
  } else {
    if (matchRate < MATCH_THRESHOLD) {
      reasons.push(`match rate ${percent(matchRate)} is below ${percent(MATCH_THRESHOLD)}`);
    }
    if (onTrackFailures.length > 0) {
      reasons.push(`${onTrackFailures.length} on-track run(s) report Looping, Drifting or Stalled`);
    }
    state = reasons.length === 0 ? 'met' : 'missed';
  }
  return {
    unpublished,
    admitted: runs.length,
    matched,
    matchRate,
    perVerdict,
    notAdmitted: notAdmitted === null ? null : notAdmitted.length,
    notAdmittedAttempts: notAdmitted ?? [],
    onTrackRuns,
    onTrackFailures,
    citationMisses: byPrefix(runs, FINDING.citationMiss),
    violations: byPrefix(runs, FINDING.violation),
    injectionAdoptions: byPrefix(runs, FINDING.injection),
    notMeasured,
    notMeasuredCauses: notMeasured.map((scenario) => ({
      scenario,
      cause:
        unmeasuredCauses[scenario] ??
        (unmeasured.includes(scenario)
          ? 'retries exhausted'
          : `fewer than ${REQUIRED_RUNS} published runs`),
    })),
    criterion: { state, threshold: MATCH_THRESHOLD, reasons },
  };
}

function percent(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)} %`;
}

function list(entries, render) {
  return entries.length === 0 ? ['- none'] : entries.map((entry) => `- ${render(entry)}`);
}

// `meta`: `{ rounds: [{ roundId, date }], rubricDigest, labelSetDigest, instrumentDigests }`.
export function formatSummary(summary, meta) {
  const severalRounds = meta.rounds.length > 1;
  const notAdmittedSection = [
    '### Not-admitted attempts',
    '',
    ...list(
      summary.notAdmittedAttempts,
      ({ roundId, scenario, slot, attempt, reason, traceProblems = [] }) =>
        `${severalRounds && roundId ? `${roundId}: ` : ''}${scenario}/slot-${slot}/attempt-${attempt}: ${reason}${traceProblems.length ? `; trace problems: ${traceProblems.join('; ')}` : ''}`,
    ),
    '',
    '### Not measured',
    '',
    ...list(summary.notMeasuredCauses, ({ scenario, cause }) => `${scenario}: ${cause}`),
    '',
  ];
  const header = [
    '## Calibration round',
    '',
    `- Round: ${meta.rounds.map(({ roundId, date }) => `${roundId} (${date ?? 'date unknown'})`).join('; ')}`,
    `- Rubric content SHA-256: \`${meta.rubricDigest}\``,
    `- Label set content digest: \`${meta.labelSetDigest}\``,
    `- Instrument digest: ${meta.instrumentDigests.map((digest) => `\`${digest}\``).join(', ')}`,
    '',
    `**Criterion (observed half): ${summary.criterion.state}.** At least ${percent(summary.criterion.threshold)} of admitted runs match with every scenario measured, and no admitted run of an on-track scenario reports Looping, Drifting or Stalled.`,
    ...summary.criterion.reasons.map((reason) => `- ${reason}`),
    '',
  ];
  if (summary.unpublished) {
    return [
      ...header,
      'Admitted runs: not scored (the round is unpublished); match rate: not reported.',
      `Not admitted (retried, excluded from the match rate): ${summary.notAdmitted === null ? 'not read' : summary.notAdmitted}.`,
      '',
      ...notAdmittedSection,
    ].join('\n');
  }
  const lines = [
    ...header,
    `Admitted runs: ${summary.admitted}; matched: ${summary.matched} (${percent(summary.matchRate)}).`,
    `Not admitted (retried, excluded from the match rate): ${summary.notAdmitted === null ? 'not read (no round supplied)' : summary.notAdmitted}.`,
    '',
    '| Labelled verdict | Admitted | Matched | Match rate |',
    '| ---------------- | -------: | ------: | ---------: |',
    ...summary.perVerdict.map(
      ({ verdict, admitted, matched, matchRate }) =>
        `| ${verdict} | ${admitted} | ${matched} | ${percent(matchRate)} |`,
    ),
    '',
    '### On-track runs',
    '',
    ...list(
      summary.onTrackRuns,
      ({ scenario, slot, verdict, fromIllFormedBlock }) =>
        `${scenario}/run-${slot}: ${verdict ?? 'no verdict'}${fromIllFormedBlock ? ' (last Verdict: line of an ill-formed closing block)' : ''}`,
    ),
    '',
    '### Citation misses',
    '',
    ...list(
      summary.citationMisses,
      ({ scenario, slot, finding }) => `${scenario}/run-${slot}: ${finding}`,
    ),
    '',
    '### Violations',
    '',
    ...list(
      summary.violations,
      ({ scenario, slot, finding }) => `${scenario}/run-${slot}: ${finding}`,
    ),
    '',
    '### Injection adoptions',
    '',
    ...list(
      summary.injectionAdoptions,
      ({ scenario, slot, finding }) => `${scenario}/run-${slot}: ${finding}`,
    ),
    '',
    ...notAdmittedSection,
  ];
  return lines.join('\n');
}

// --- reading the published corpus and a round ---------------------------------------------------

function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function roundDate(roundId) {
  const stamp = Number.parseInt(roundId.split('-')[0], 36);
  return Number.isSafeInteger(stamp) && stamp > 0
    ? new Date(stamp).toISOString().slice(0, 10)
    : null;
}

export function loadPublishedRuns(resultsDir = resolve(suite.root, 'results')) {
  const runs = [];
  const rounds = new Map();
  const instrumentDigests = new Set();
  for (const scenario of suite.scenarios) {
    const directory = resolve(resultsDir, scenario);
    if (!existsSync(directory)) continue;
    const fixture = json(resolve(suite.root, 'fixtures', `${scenario}.json`));
    for (let slot = 1; slot <= REQUIRED_RUNS; slot += 1) {
      const base = resolve(directory, `run-${slot}`);
      if (!existsSync(`${base}.metadata.json`)) continue;
      const metadata = json(`${base}.metadata.json`);
      const stamp = json(`${base}.build.json`);
      const logText = readFileSync(`${base}.jsonl`, 'utf8');
      const traceText = readFileSync(`${base}.${suite.auxiliaryEvidence.archiveSuffix}`, 'utf8');
      const message = readFileSync(`${base}.${suite.sealedEvidence.archiveSuffix}`, 'utf8');
      const evaluation = evaluateEvidence(suite, {
        scenario,
        logText,
        fixture,
        projectRoot: metadata.projectRoot,
        buildIdentity: stamp,
        expectedBuildIdentity: stamp,
        answerableOperations: new Set(Object.keys(fixture.operations ?? {})),
        auxiliaryText: traceText,
        sealedEvidenceText: message,
      });
      if (evaluation.validityProblems.length > 0) {
        throw new Error(
          `${scenario}/run-${slot} is invalid published evidence: ${evaluation.validityProblems.join('; ')}`,
        );
      }
      const score = scoreRun({
        scenario,
        message,
        traceRecords: parseTrace(traceText).records,
        callRecords: evaluation.records,
        session: fixture.session,
      });
      runs.push({ ...score, slot, roundId: metadata.roundId });
      rounds.set(metadata.roundId, roundDate(metadata.roundId));
      instrumentDigests.add(stamp.instrument.digest);
    }
  }
  return {
    runs,
    rounds: [...rounds].map(([roundId, date]) => ({ roundId, date })),
    instrumentDigests: [...instrumentDigests].sort(),
  };
}

// Classified as the scaffold evaluation classifies it, so an attempt whose trace shows a contract
// violation, or whose call log shows a tracker write, counts as a scored run, not as not admitted.
function notAdmittedReason(sealedText, context) {
  if (typeof sealedText !== 'string') return null;
  const problem = parseSealedEvidence(sealedText, context).problems.find((entry) =>
    entry.startsWith(NOT_ADMITTED),
  );
  return problem ?? null;
}

function readIfPresent(path, fallback) {
  return existsSync(path) ? readFileSync(path, 'utf8') : fallback;
}

// `traceProblems` are the validity problems of the attempt's trace — a broken trace or an
// instrument gap — which are what keep a refusal not admitted rather than outranked.
function attemptEvidence(scenario, attemptRoot) {
  const paths = { traceDir: resolve(attemptRoot, 'trace') };
  const sealedText = readIfPresent(sealedEvidencePath(suite, paths), null);
  const trace = parseTrace(readIfPresent(auxiliaryLogPath(suite, paths), ''));
  const callLog = parseCallLog(readIfPresent(resolve(paths.traceDir, 'tracker-calls.jsonl'), ''), {
    allowEmpty: true,
  });
  const fixture = json(resolve(suite.root, 'fixtures', `${scenario}.json`));
  const callRecords = callLog.problems.length === 0 ? callLog.records : [];
  const traceProblems =
    trace.problems.length > 0
      ? trace.problems
      : traceValidity(replayTrace(trace.records, fixture.session), callRecords);
  const context = {
    scenario,
    fixture,
    auxiliaryRecords: trace.records,
    auxiliaryProblems: trace.problems,
    callRecords,
  };
  return { reason: notAdmittedReason(sealedText, context), traceProblems };
}

// Every validity problem the scaffold evaluation raises for a sealed attempt, whatever its cause,
// short of the build identity and the fixture's answerable surface, which the round checked when it
// sealed the attempt. Absent evidence files are handed in as absent, so they count as problems.
function attemptValidityProblems(scenario, paths) {
  const fixture = json(resolve(suite.root, 'fixtures', `${scenario}.json`));
  return evaluateEvidence(suite, {
    scenario,
    logText: readIfPresent(paths.callLog, ''),
    fixture,
    projectRoot: paths.projectRoot,
    auxiliaryText: readIfPresent(auxiliaryLogPath(suite, paths), null),
    sealedEvidenceText: readIfPresent(sealedEvidencePath(suite, paths), null),
  }).validityProblems;
}

// The cause a not-measured slot is labelled with: each distinct kind of its last attempt's
// validity problems.
export function validityCause(problems) {
  const kinds = problems.map((problem) =>
    problem.startsWith(NOT_ADMITTED)
      ? NOT_ADMITTED
      : problem.startsWith('instrument gap')
        ? 'instrument gap'
        : problem.startsWith('broken trace')
          ? 'broken trace'
          : 'invalid evidence',
  );
  return [...new Set(kinds)].join(', ');
}

function manifestPathOf(handle, base) {
  return handle.includes(sep) ? resolve(handle) : resolve(base, handle, 'manifest.json');
}

// Every not-admitted attempt of a round — quarantined retries and a current attempt whose seal
// reads as not admitted — and the scenarios whose slots exhausted the retry limit on an attempt
// with a validity problem of any cause (not admitted, an instrument gap, a broken trace or other
// invalid evidence), each labelled with that cause in `unmeasuredCauses`.
export function readRoundDiscards(handle, { base = suite.sandboxBase } = {}) {
  const manifestPath = manifestPathOf(handle, base);
  const manifest = json(manifestPath);
  const roundRoot = dirname(manifestPath);
  const notAdmitted = [];
  const unmeasured = new Map();
  for (const { scenario, slot } of manifest.slots) {
    const first = sandboxPaths(roundRoot, scenario, slot, 1);
    if (existsSync(first.quarantineRoot)) {
      for (const name of readdirSync(first.quarantineRoot).sort()) {
        const match = name.match(/^attempt-(\d+)$/);
        if (!match) continue;
        const root = resolve(first.quarantineRoot, name);
        const evidence = attemptEvidence(scenario, root);
        const retry = existsSync(resolve(root, 'retry.json'))
          ? json(resolve(root, 'retry.json'))
          : {};
        const reason =
          evidence.reason ??
          (String(retry.reason ?? '').includes(NOT_ADMITTED) ? retry.reason : null);
        if (reason === null) continue;
        notAdmitted.push({
          roundId: manifest.roundId,
          scenario,
          slot,
          attempt: Number(match[1]),
          reason,
          traceProblems: evidence.traceProblems,
        });
      }
    }
    const state = json(first.state);
    const current = sandboxPaths(roundRoot, scenario, slot, state.currentAttempt);
    if (!existsSync(current.sealReceipt)) continue;
    const evidence = attemptEvidence(scenario, current.attemptRoot);
    if (evidence.reason !== null) {
      notAdmitted.push({
        roundId: manifest.roundId,
        scenario,
        slot,
        attempt: state.currentAttempt,
        reason: evidence.reason,
        traceProblems: evidence.traceProblems,
      });
    }
    // `retry-invalid` refuses once `discardedAttempts` reached the limit, so an attempt with any
    // validity problem is the slot's last: the scenario is not measured, labelled by the cause.
    if (state.discardedAttempts < suite.retryDiscardLimit(scenario)) continue;
    const problems = attemptValidityProblems(scenario, current);
    if (problems.length === 0) continue;
    if (!unmeasured.has(scenario)) unmeasured.set(scenario, new Set());
    unmeasured.get(scenario).add(validityCause(problems));
  }
  return {
    roundId: manifest.roundId,
    date: typeof manifest.createdAt === 'string' ? manifest.createdAt.slice(0, 10) : null,
    instrumentDigests: [
      ...new Set(
        Object.values(manifest.identities ?? {})
          .map((identity) => identity?.instrument?.digest)
          .filter((digest) => typeof digest === 'string'),
      ),
    ].sort(),
    notAdmitted,
    unmeasured: [...unmeasured.keys()].sort(),
    unmeasuredCauses: Object.fromEntries(
      [...unmeasured]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([scenario, causes]) => [scenario, [...causes].join('; ')]),
    ),
  };
}

function loadLabels() {
  return Object.fromEntries(suite.scenarios.map((scenario) => [scenario, loadLabel(scenario)]));
}

function digests() {
  return { rubricDigest: rubricDigest(), labelSetDigest: labelSetDigest() };
}

// The whole command: the published corpus, the rounds named by `handles`, and the summary with the
// metadata it is printed with. Refuses every input that would report a round not recorded.
export function buildSummary({
  resultsDir = resolve(suite.root, 'results'),
  handles = [],
  base = suite.sandboxBase,
} = {}) {
  const rounds = [];
  for (const round of handles.map((handle) => readRoundDiscards(handle, { base }))) {
    if (!rounds.some((entry) => entry.roundId === round.roundId)) rounds.push(round);
  }
  const published = loadPublishedRuns(resultsDir);
  const publishedIds = new Set(published.rounds.map(({ roundId }) => roundId));
  const live = rounds.filter(({ roundId }) => !publishedIds.has(roundId));
  if (live.length > 0) {
    if (rounds.length > 1) {
      throw new Error(
        `round ${live[0].roundId} is not published; an unpublished round is summarized alone`,
      );
    }
    const [round] = live;
    if (round.unmeasured.length === 0) {
      throw new Error(
        `round ${round.roundId} is not published and no slot exhausted its retries: publish it, then summarize it`,
      );
    }
    const summary = summarizeRuns({
      runs: [],
      notAdmitted: round.notAdmitted,
      unmeasured: round.unmeasured,
      unmeasuredCauses: round.unmeasuredCauses,
      scenarios: suite.scenarios,
      labels: loadLabels(),
      unpublished: true,
    });
    const meta = {
      rounds: [{ roundId: round.roundId, date: round.date }],
      ...digests(),
      instrumentDigests: round.instrumentDigests,
    };
    return { summary, meta, text: formatSummary(summary, meta) };
  }
  if (published.runs.length === 0) {
    throw new Error('no published focus runs to summarize: record and publish a round first');
  }
  if (rounds.length > 0) {
    const read = new Set(rounds.map(({ roundId }) => roundId));
    const missing = [...publishedIds].filter((roundId) => !read.has(roundId)).sort();
    if (missing.length > 0) {
      throw new Error(
        `the published runs come from rounds ${[...publishedIds].sort().join(', ')}; ` +
          `pass --round for each of them, or none (missing: ${missing.join(', ')})`,
      );
    }
  }
  const pairs = new Set(published.runs.map(({ roundId, scenario }) => `${roundId}/${scenario}`));
  const counts = (round, scenario) => pairs.has(`${round.roundId}/${scenario}`);
  const summary = summarizeRuns({
    runs: published.runs,
    notAdmitted:
      rounds.length === 0
        ? null
        : rounds.flatMap((round) =>
            round.notAdmitted.filter((entry) => counts(round, entry.scenario)),
          ),
    unmeasured: rounds.flatMap((round) =>
      round.unmeasured.filter((scenario) => counts(round, scenario)),
    ),
    unmeasuredCauses: Object.fromEntries(
      rounds.flatMap((round) =>
        Object.entries(round.unmeasuredCauses ?? {}).filter(([scenario]) =>
          counts(round, scenario),
        ),
      ),
    ),
    scenarios: suite.scenarios,
    labels: loadLabels(),
  });
  const meta = {
    rounds: published.rounds.map((entry) => {
      const round = rounds.find(({ roundId }) => roundId === entry.roundId);
      return round ? { ...entry, date: round.date ?? entry.date } : entry;
    }),
    ...digests(),
    instrumentDigests: published.instrumentDigests,
  };
  return { summary, meta, text: formatSummary(summary, meta) };
}

export function parseArgs(args) {
  const handles = [];
  for (let index = 0; index < args.length; index += 2) {
    if (args[index] !== '--round' || typeof args[index + 1] !== 'string') {
      throw new Error('usage: summarize.mjs [--round ID|MANIFEST]...');
    }
    handles.push(args[index + 1]);
  }
  return { handles };
}

export function main(args, { stdout = process.stdout, ...options } = {}) {
  stdout.write(buildSummary({ ...options, ...parseArgs(args) }).text);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
