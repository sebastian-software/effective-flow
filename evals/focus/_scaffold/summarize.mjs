#!/usr/bin/env node

// The focus round summary for `evals/focus/CALIBRATION.md`: the observed half of the concept's
// success criterion scored over the published runs, with the not-admitted attempts a round retried.
//
//   node evals/focus/_scaffold/summarize.mjs [--round ID|MANIFEST]
//
// Published runs come from `evals/focus/results/`, each re-evaluated with the scaffold's evaluation
// and the focus evaluator, exactly as publication judged it. Not-admitted attempts are never
// published, so their count and any slot that exhausted its retries come from the round given with
// `--round`; without it the summary says the count was not read. It writes nothing and refuses to
// summarize when nothing is published, so no round can be reported that was not recorded.
//
// `summarizeRuns` and `formatSummary` are pure, for tests on synthetic records.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { evaluateEvidence } from '../../_scaffold/evaluate.mjs';
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

// `runs`: admitted, scored runs `{ scenario, slot, verdict, matched, findings }`. `notAdmitted`:
// retried attempts `{ scenario, slot, attempt, reason, violations }`, or `null` when no round was
// read. `unmeasured`: scenarios whose slot exhausted its retries. `labels`: scenario → label.
export function summarizeRuns({ runs, notAdmitted = null, unmeasured = [], scenarios, labels }) {
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
  const onTrackRuns = runs
    .filter((run) => labelOf(run.scenario).verdict === 'On track')
    .map(({ scenario, slot, verdict }) => ({ scenario, slot, verdict }));
  const onTrackFailures = onTrackRuns.filter(({ verdict }) => ON_TRACK_FORBIDDEN.has(verdict));
  const notMeasured = [...scenarios]
    .filter(
      (scenario) =>
        unmeasured.includes(scenario) ||
        runs.filter((run) => run.scenario === scenario).length < REQUIRED_RUNS,
    )
    .sort();
  const matchRate = rate(matched, runs.length);
  const reasons = [];
  let state;
  if (notMeasured.length > 0) {
    state = 'not measurable';
    reasons.push(`not measured: ${notMeasured.join(', ')}`);
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
  const lines = [
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
      ({ scenario, slot, verdict }) => `${scenario}/run-${slot}: ${verdict ?? 'no verdict'}`,
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
    '### Not-admitted attempts',
    '',
    ...list(
      summary.notAdmittedAttempts,
      ({ scenario, slot, attempt, reason, violations }) =>
        `${scenario}/slot-${slot}/attempt-${attempt}: ${reason}${violations.length ? `; trace violations: ${violations.join('; ')}` : ''}`,
    ),
    '',
    '### Not measured',
    '',
    ...list(summary.notMeasured, (scenario) => scenario),
    '',
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
      runs.push({ ...score, slot });
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
// violation counts as a scored run, not as not admitted.
function notAdmittedReason(sealedText, context) {
  if (typeof sealedText !== 'string') return null;
  const problem = parseSealedEvidence(sealedText, context).problems.find((entry) =>
    entry.startsWith(NOT_ADMITTED),
  );
  return problem ?? null;
}

function attemptEvidence(scenario, attemptRoot) {
  const paths = { traceDir: resolve(attemptRoot, 'trace') };
  const sealedPath = sealedEvidencePath(suite, paths);
  const tracePath = auxiliaryLogPath(suite, paths);
  const sealedText = existsSync(sealedPath) ? readFileSync(sealedPath, 'utf8') : null;
  const traceText = existsSync(tracePath) ? readFileSync(tracePath, 'utf8') : '';
  const trace = parseTrace(traceText);
  const fixture = json(resolve(suite.root, 'fixtures', `${scenario}.json`));
  const replay = trace.problems.length > 0 ? null : replayTrace(trace.records, fixture.session);
  const violations =
    replay === null ? trace.problems : replay.violations.map(({ message }) => message);
  const auxiliaryProblems =
    replay === null ? trace.problems : replay.instrumentGaps.map(({ message }) => message);
  const context = { scenario, fixture, auxiliaryRecords: trace.records, auxiliaryProblems };
  return { reason: notAdmittedReason(sealedText, context), violations };
}

// Every not-admitted attempt of a round — quarantined retries and a current attempt whose seal
// reads as not admitted — and the scenarios whose slots exhausted the retry limit on one.
export function readRoundDiscards(handle) {
  const manifestPath = handle.includes(sep)
    ? resolve(handle)
    : resolve(suite.sandboxBase, handle, 'manifest.json');
  const manifest = json(manifestPath);
  const roundRoot = dirname(manifestPath);
  const notAdmitted = [];
  const unmeasured = new Set();
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
          scenario,
          slot,
          attempt: Number(match[1]),
          reason,
          violations: evidence.violations,
        });
      }
    }
    const state = json(first.state);
    const current = sandboxPaths(roundRoot, scenario, slot, state.currentAttempt);
    if (!existsSync(current.sealReceipt)) continue;
    const evidence = attemptEvidence(scenario, current.attemptRoot);
    if (evidence.reason === null) continue;
    notAdmitted.push({
      scenario,
      slot,
      attempt: state.currentAttempt,
      reason: evidence.reason,
      violations: evidence.violations,
    });
    if (state.discardedAttempts >= suite.retryDiscardLimit(scenario)) unmeasured.add(scenario);
  }
  return {
    roundId: manifest.roundId,
    date: typeof manifest.createdAt === 'string' ? manifest.createdAt.slice(0, 10) : null,
    notAdmitted,
    unmeasured: [...unmeasured].sort(),
  };
}

function main(args) {
  let handle = null;
  if (args.length === 2 && args[0] === '--round') handle = args[1];
  else if (args.length !== 0) throw new Error('usage: summarize.mjs [--round ID|MANIFEST]');
  const published = loadPublishedRuns();
  if (published.runs.length === 0) {
    throw new Error('no published focus runs to summarize: record and publish a round first');
  }
  const round = handle === null ? null : readRoundDiscards(handle);
  const labels = Object.fromEntries(
    suite.scenarios.map((scenario) => [scenario, loadLabel(scenario)]),
  );
  const summary = summarizeRuns({
    runs: published.runs,
    notAdmitted: round?.notAdmitted ?? null,
    unmeasured: round?.unmeasured ?? [],
    scenarios: suite.scenarios,
    labels,
  });
  const rounds = published.rounds.map((entry) =>
    entry.roundId === round?.roundId ? { ...entry, date: round.date ?? entry.date } : entry,
  );
  process.stdout.write(
    formatSummary(summary, {
      rounds,
      rubricDigest: rubricDigest(),
      labelSetDigest: labelSetDigest(),
      instrumentDigests: published.instrumentDigests,
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
