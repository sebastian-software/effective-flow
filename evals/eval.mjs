#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import {
  createRound,
  publishRound,
  recoverPublication,
  retryAborted,
  retryInvalid,
  roundStatus,
  sealAttempt,
  verifyFreshness,
} from './_scaffold/round-core.mjs';
import { loadSuite } from './_scaffold/suite-loader.mjs';

const COMMAND_OPTIONS = Object.freeze({
  prepare: new Set([
    'scenario',
    'harness',
    'model',
    'reasoning-effort',
    'reported-version',
    'tool-policy',
  ]),
  status: new Set(['round']),
  seal: new Set(['round', 'scenario', 'slot', 'receipt']),
  'retry-aborted': new Set(['round', 'scenario', 'slot', 'receipt']),
  'retry-invalid': new Set(['round', 'scenario', 'slot', 'reason']),
  publish: new Set(['round']),
  recover: new Set(),
  // `--mode` takes a value rather than being a bare `--strict` flag: the parser below requires a
  // value for every flag, so a boolean concept would have to special-case one option and would
  // reach the CLI rejection test for no gain. Two named modes also read better in a workflow step
  // than a flag whose absence is the interesting half.
  verify: new Set(['mode']),
});
const ALL_OPTIONS = new Set(Object.values(COMMAND_OPTIONS).flatMap((flags) => [...flags]));

function usage() {
  return `usage: node evals/eval.mjs <tool> <command> [options]

<tool> names a suite directory under evals/ that carries a suite.config.mjs (e.g. merge-gate).

commands:
  prepare [--scenario NAME ...] [profile flags]
  status --round ID|MANIFEST
  seal --round ID|MANIFEST --scenario NAME --slot N --receipt FILE
  retry-aborted --round ... --scenario ... --slot N --receipt FILE
  retry-invalid --round ... --scenario ... --slot N [--reason TEXT]
  publish --round ID|MANIFEST
  recover
  verify [--mode report|strict]

profile flags: --harness, --model, --reasoning-effort, --reported-version, --tool-policy
Omitted profile values are recorded explicitly as "unknown". A suite may pin profile values:
prepare then rejects any deviation, an omitted pinned flag included, and publish rejects a
generation whose archived profile deviates. No command launches a model.
verify reads the archived corpus and writes nothing: report (the default) prints the verdict and
exits 0 even when a scenario is stale, strict additionally exits 1 on any scenario that is not
current. Only a failure to reach a verdict at all — a build that fails, an unreadable archived
file — exits nonzero in report mode.
`;
}

function options(args) {
  const parsed = { scenario: [] };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument ${token}`);
    const key = token.slice(2);
    if (!ALL_OPTIONS.has(key)) throw new Error(`unknown option --${key}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`);
    index += 1;
    if (key === 'scenario') parsed.scenario.push(value);
    else if (Object.hasOwn(parsed, key)) throw new Error(`${token} was provided more than once`);
    else parsed[key] = value;
  }
  return parsed;
}

function required(value, flag) {
  if (value === undefined) throw new Error(`${flag} is required`);
  return value;
}

function validateOptions(command, parsed) {
  const allowed = COMMAND_OPTIONS[command];
  if (!allowed) throw new Error(`unknown command ${command}\n${usage()}`);
  const provided = Object.entries(parsed)
    .filter(([key, value]) => (key === 'scenario' ? value.length > 0 : value !== undefined))
    .map(([key]) => key);
  const rejected = provided.filter((key) => !allowed.has(key));
  if (rejected.length > 0) {
    throw new Error(`${command} does not accept ${rejected.map((key) => `--${key}`).join(', ')}`);
  }
  if (command !== 'prepare' && parsed.scenario.length > 1) {
    throw new Error(`${command} accepts --scenario only once`);
  }
}

function readReceipt(path) {
  if (!existsSync(path)) throw new Error(`no receipt at ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function profileFrom(parsed) {
  return {
    harness: parsed.harness,
    model: parsed.model,
    reasoningEffort: parsed['reasoning-effort'],
    reportedVersion: parsed['reported-version'],
    toolPolicy: parsed['tool-policy'],
  };
}

function printStatus(rows) {
  for (const row of rows) {
    process.stdout.write(
      `${row.scenario}\t${row.slot}\tattempt-${row.attempt}\t${row.status}\t${row.prompt}\n`,
    );
  }
}

// A test seam, and the only one this CLI carries. The exit-code mapping — report mode exits 0 on a
// stale verdict, strict mode exits 1, and both exit nonzero when no verdict could be produced — is
// the property the release gate rests on, and the only honest way to observe it is to run this
// process against a corpus that is stale and against one that cannot be read. Neither state can be
// produced in the repository's own `results/` without leaving damaged evidence behind.
//
// It is an environment variable rather than a `--results` flag on purpose. A flag is a supported
// interface, and a supported way to point `verify` at an arbitrary directory would let a workflow
// step report some other corpus as this repository's — the gate would then be green about evidence
// nobody shipped. Nothing else about the run moves: the build is still the working tree's, and the
// verdict is still the shared rule in `build-identity.mjs`.
//
// An empty value reads as unset, and that is not tidiness. `EFFECTIVE_FLOW_EVAL_VERIFY_RESULTS_DIR:
// ${{ ... }}` with nothing behind it is the ordinary shape of an unset workflow input, and the
// empty string resolves against the process working directory rather than against `results/`: every
// scenario would report `absent`, report mode would exit 0, and the step would look like it had
// verified the corpus it never opened. Falling through to the default is the only reading that
// cannot be silently wrong.
function verifyResultsDir() {
  const configured = process.env.EFFECTIVE_FLOW_EVAL_VERIFY_RESULTS_DIR;
  return configured === undefined || configured === '' ? undefined : configured;
}

// The per-run verdicts as one counted summary rather than one line per run. Thirty lines saying
// `waived (version-stamp)` is the ordinary state of the corpus for most of a release cycle, and a
// report whose ordinary output is thirty uniform lines is one nobody reads the day it says
// something else. A waiver still has to be visible — it is a difference that was accepted, not an
// absence of one — so it is counted by name instead of dropped.
function runSummary(runs) {
  const counts = new Map();
  for (const run of runs) {
    const key = run.waiver === undefined ? run.state : `${run.state}: ${run.waiver}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, count]) => `${count} ${key}`).join(', ');
}

function printFreshness(report) {
  // Which corpus produced this verdict, named before the verdict itself. A CI log otherwise says
  // six scenarios are current without ever saying what was read, and the one failure the seam above
  // makes possible — a verdict about some other directory — is exactly the one an operator cannot
  // spot from the scenario lines alone.
  process.stdout.write(`corpus: ${report.resultsDir}\n`);
  for (const { scenario, state, runs, drift } of report.scenarios) {
    const summary = runs.length === 0 ? 'no archived runs' : runSummary(runs);
    process.stdout.write(
      `${scenario}\t${state}\t${runs.length}/${report.requiredRuns} run(s)\t${summary}\n`,
    );
    // Named individually, because these are the runs somebody has to act on: which slots went
    // stale is what decides whether a scenario is re-recorded or the whole round is.
    //
    // A stale run also prints the pair of digests it disagrees on. The named files below say what
    // moved; the digests say which two builds are being compared, which is what an operator needs
    // to look one of them up in a round manifest or in another scenario's stamp and decide whether
    // the whole corpus drifted or only this run did.
    for (const run of runs) {
      if (run.state !== 'stale' && run.state !== 'missing-stamp') continue;
      process.stdout.write(`  run-${run.slot}: ${run.state}\n`);
      if (run.state !== 'stale') continue;
      process.stdout.write(`    archived: ${run.archived}\n    current:  ${run.current}\n`);
    }
    // The moved files, for the first stale run of the scenario. This is the bisect list an operator
    // needs: a digest mismatch says the archived round observed something else, and only these
    // lines say what, which is the difference between re-recording a round on purpose and
    // re-recording it because a number changed and nobody could see why.
    if (drift.length === 0) continue;
    process.stdout.write('  changed since the round was recorded:\n');
    for (const line of drift) process.stdout.write(`${line}\n`);
  }
}

async function main() {
  const [tool, command, ...args] = process.argv.slice(2);
  if (!tool || tool === '--help' || tool === 'help') {
    process.stdout.write(usage());
    return;
  }
  if (!command || command === '--help' || command === 'help') {
    process.stdout.write(usage());
    return;
  }
  const suite = await loadSuite(tool);
  const parsed = options(args);
  validateOptions(command, parsed);
  if (command === 'prepare') {
    const prepared = createRound(suite, {
      scenarios: parsed.scenario,
      profile: profileFrom(parsed),
    });
    process.stdout.write(
      `prepared round ${prepared.manifest.roundId}\nmanifest: ${prepared.manifestPath}\n`,
    );
    printStatus(roundStatus(suite, prepared.manifestPath));
    return;
  }
  if (command === 'status') {
    printStatus(roundStatus(suite, required(parsed.round, '--round')));
    return;
  }
  if (command === 'seal') {
    const receipt = sealAttempt(suite, {
      handle: required(parsed.round, '--round'),
      scenario: required(parsed.scenario[0], '--scenario'),
      slot: Number(required(parsed.slot, '--slot')),
      hostReceipt: readReceipt(required(parsed.receipt, '--receipt')),
    });
    process.stdout.write(`sealed ${receipt.scenario}/${receipt.slot} attempt-${receipt.attempt}\n`);
    return;
  }
  if (command === 'retry-aborted') {
    const result = retryAborted(suite, {
      handle: required(parsed.round, '--round'),
      scenario: required(parsed.scenario[0], '--scenario'),
      slot: Number(required(parsed.slot, '--slot')),
      assertion: readReceipt(required(parsed.receipt, '--receipt')),
    });
    process.stdout.write(`prepared replacement attempt-${result.attempt}: ${result.prompt}\n`);
    return;
  }
  if (command === 'retry-invalid') {
    const result = retryInvalid(suite, {
      handle: required(parsed.round, '--round'),
      scenario: required(parsed.scenario[0], '--scenario'),
      slot: Number(required(parsed.slot, '--slot')),
      reason: parsed.reason,
    });
    process.stdout.write(`prepared replacement attempt-${result.attempt}: ${result.prompt}\n`);
    return;
  }
  if (command === 'publish') {
    const result = publishRound(suite, { handle: required(parsed.round, '--round') });
    process.stdout.write(`published generation ${result.generation}\n`);
    if (result.findings.length > 0) {
      for (const finding of result.findings) {
        process.stderr.write(`${finding.scenario}/${finding.slot}: ${finding.finding}\n`);
      }
      process.exitCode = 1;
    }
    return;
  }
  if (command === 'verify') {
    // Validated before the build runs, so a typo costs a message rather than a build, and
    // rejected rather than falling back to `report`: a workflow step that meant `strict` and
    // mistyped it would otherwise pass silently, which is the one failure this gate cannot have.
    const mode = parsed.mode ?? 'report';
    if (mode !== 'report' && mode !== 'strict') {
      throw new Error(`--mode accepts report or strict, not ${mode}`);
    }
    const report = verifyFreshness(suite, { resultsDir: verifyResultsDir() });
    printFreshness(report);
    // Report mode reaches this line with every verdict it can produce, stale included, and exits 0.
    // Only a thrown error — a build that failed, an archived file that would not parse — reaches
    // the handler below, which is what keeps an ordinary pull request green while still failing
    // loudly when the step could not answer at all.
    if (mode === 'strict' && report.failsStrict) {
      const failing = report.scenarios.filter(({ state }) => state !== 'current');
      process.stderr.write(
        `${failing.map(({ scenario, state }) => `${scenario} is ${state}`).join('; ')}\n` +
          'A release needs a current round: re-record the evidence before releasing ' +
          `(see evals/${suite.name}/README.md).\n`,
      );
      process.exitCode = 1;
    }
    return;
  }
  if (command === 'recover') {
    const result = recoverPublication(suite);
    process.stdout.write(
      result.recovered ? 'recovered interrupted publication\n' : 'nothing to recover\n',
    );
    return;
  }
  throw new Error(`unknown command ${command}\n${usage()}`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
