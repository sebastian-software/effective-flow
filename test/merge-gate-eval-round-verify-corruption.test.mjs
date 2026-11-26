import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { canonicalDigest, digestOf } from '../evals/_scaffold/build-identity.mjs';
import { supportedTrackerOperations } from '../evals/_scaffold/evaluate.mjs';
import { verifyFreshness } from '../evals/_scaffold/round-core.mjs';
import { REQUIRED_RUNS } from '../evals/_scaffold/suite.mjs';
import suite from '../evals/merge-gate/suite.config.mjs';
import { copyRestampedResults } from './support/merge-gate-round-fixtures.mjs';
import { runVerify } from './support/merge-gate-round-helpers.mjs';

test(
  'verification retains short/stale corruption and stale valid negatives independently',
  { timeout: 120_000 },
  () => {
    // Invariant: no coverage/source rollup can turn malformed provenance into report success or
    // discard a valid recorded negative. All edits are confined to temporary verifier fixtures.
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-mixed-verdict-'));
    try {
      const resultsDir = resolve(temporary, 'results');
      copyRestampedResults(resultsDir);
      const scenario = 'guard-blocks-merge';
      const directory = resolve(resultsDir, scenario);
      for (const name of readdirSync(directory).filter((name) => /^run-[2-5]\./.test(name)))
        rmSync(resolve(directory, name));
      const log = resolve(directory, 'run-1.jsonl');
      const original = readFileSync(log, 'utf8');
      writeFileSync(log, 'malformed json\n');
      const short = verifyFreshness(suite, { resultsDir });
      assert.equal(short.scenarios.find((row) => row.scenario === scenario).state, 'short');
      assert.equal(short.failsReport, true);
      assert.equal(
        short.scenarios.find((row) => row.scenario === scenario).runs[0].integrity,
        'invalid',
      );

      const stampPath = resolve(directory, 'run-1.build.json');
      const stamp = JSON.parse(readFileSync(stampPath, 'utf8'));
      stamp.skill.files['tools/merge-gate.md'] = digestOf('different source');
      stamp.skill.digest = canonicalDigest(stamp.skill.files);
      stamp.skill.versionNeutralDigest = digestOf('different neutral source');
      stamp.digest = digestOf(
        [stamp.skill.digest, stamp.instrument.digest, stamp.scenario_inputs.digest].join('\n'),
      );
      writeFileSync(stampPath, JSON.stringify(stamp));
      const metadataPath = resolve(directory, 'run-1.metadata.json');
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
      metadata.buildDigest = stamp.digest;
      writeFileSync(metadataPath, JSON.stringify(metadata));
      const staleCorrupt = verifyFreshness(suite, { resultsDir });
      const corruptRun = staleCorrupt.scenarios.find((row) => row.scenario === scenario).runs[0];
      assert.equal(corruptRun.freshness, 'stale');
      assert.equal(corruptRun.integrity, 'invalid');
      assert.equal(staleCorrupt.failsReport, true);

      const records = original
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const fixture = JSON.parse(
        readFileSync(resolve(suite.root, 'fixtures', `${scenario}.json`), 'utf8'),
      );
      const undefinedOperation = [...supportedTrackerOperations()].find(
        (operation) => !Object.hasOwn(fixture.operations, operation) && operation !== 'pr-merge',
      );
      assert.ok(undefinedOperation);
      const undefinedRecords = [
        ...records,
        { ...records.at(-1), seq: records.at(-1).seq + 1, operation: undefinedOperation },
      ];
      writeFileSync(log, undefinedRecords.map((row) => JSON.stringify(row)).join('\n') + '\n');
      const undefinedVerdict = verifyFreshness(suite, { resultsDir });
      const undefinedScenario = undefinedVerdict.scenarios.find((row) => row.scenario === scenario);
      assert.equal(undefinedScenario.state, 'short');
      assert.equal(undefinedScenario.runs[0].freshness, 'stale');
      assert.equal(undefinedScenario.runs[0].integrity, 'invalid');
      assert.ok(
        undefinedScenario.runs[0].validityProblems.includes(
          `fixture leaves supported operation ${undefinedOperation} undefined`,
        ),
      );
      assert.equal(undefinedVerdict.failsReport, true);
      assert.equal(undefinedVerdict.failsStrict, true);
      records.push({
        ...records.at(-1),
        seq: records.at(-1).seq + 1,
        operation: 'pr-merge',
        apply: true,
      });
      writeFileSync(log, records.map((row) => JSON.stringify(row)).join('\n') + '\n');
      const negative = verifyFreshness(suite, { resultsDir });
      const negativeRun = negative.scenarios.find((row) => row.scenario === scenario).runs[0];
      assert.equal(negativeRun.freshness, 'stale');
      assert.equal(negativeRun.integrity, 'valid');
      assert.ok(negativeRun.findings.length > 0);
      assert.equal(negative.failsReport, false);
      assert.equal(negative.failsStrict, true);
      const fixtureKey = `evals/${suite.name}/fixtures/${scenario}.json`;
      stamp.scenario_inputs.files[fixtureKey] = digestOf('historical fixture bytes');
      stamp.scenario_inputs.digest = canonicalDigest(stamp.scenario_inputs.files);
      stamp.digest = digestOf(
        [stamp.skill.digest, stamp.instrument.digest, stamp.scenario_inputs.digest].join('\n'),
      );
      metadata.fixtureDigest = stamp.scenario_inputs.files[fixtureKey];
      metadata.buildDigest = stamp.digest;
      writeFileSync(stampPath, JSON.stringify(stamp));
      writeFileSync(metadataPath, JSON.stringify(metadata));
      writeFileSync(log, undefinedRecords.map((row) => JSON.stringify(row)).join('\n') + '\n');
      const fixtureDrift = verifyFreshness(suite, { resultsDir });
      const driftRun = fixtureDrift.scenarios.find((row) => row.scenario === scenario).runs[0];
      assert.equal(driftRun.freshness, 'stale');
      assert.equal(driftRun.integrity, 'valid');
      assert.equal(driftRun.fixtureCompatible, false);
      assert.match(driftRun.fixtureEvaluation, /unproven/);
      assert.equal(fixtureDrift.failsReport, false);
      assert.equal(fixtureDrift.failsStrict, true);
      const driftReport = runVerify(resultsDir);
      assert.equal(driftReport.status, 0, driftReport.stderr);
      assert.match(driftReport.stdout, /unproven: archived fixture differs/);
      assert.equal(runVerify(resultsDir, ['--mode', 'strict']).status, 1);
      metadata.fixtureDigest = digestOf('corrupt fixture binding');
      writeFileSync(metadataPath, JSON.stringify(metadata));
      assert.equal(verifyFreshness(suite, { resultsDir }).failsReport, true);
      metadata.fixtureDigest = stamp.scenario_inputs.files[fixtureKey];
      writeFileSync(metadataPath, JSON.stringify(metadata));
      writeFileSync(log, 'malformed json\n');
      assert.equal(
        runVerify(resultsDir).status,
        1,
        'CLI report mode must propagate mixed invalidity',
      );
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);

// The third state, kept in its own case because it is the one the neighbour above cannot hold: its
// three scenarios are already spoken for as stale, absent and current, and a short round has to be
// a fourth, independent one or the four verdicts stop being separable.
//
// **A short round fails strict even though every run it does have is current.** That is the whole
// point of the state: the archived runs are fresh, the stamps match, nothing drifted — the round
// was simply never finished, and at a release point "nothing was observed" is not an acceptable
// answer. Dropping `short` from `failsStrict` would leave every other assertion in this file green
// while the gate waved through a release backed by a partial round, which is the failure the gate
// exists to prevent. Report mode still exits 0, because an unfinished round is a verdict and not a
// failure to produce one.
//
// Short is also asserted apart from absent on purpose: an interrupted round and a round nobody
// started need different remedies, and a report that collapsed them would send an operator to
// re-record work that is mostly already recorded.
test(
  'verify fails strict on a short round whose archived runs are all current',
  { timeout: 120_000 },
  () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-verify-short-'));
    try {
      // Re-stamped first, so every remaining run is current and the verdict below can only come
      // from the run count. Without that, a drifted working tree would reach `short` through
      // `stale` and the test would pass for the wrong reason.
      const resultsDir = resolve(temporary, 'results');
      copyRestampedResults(resultsDir);
      const shortScenario = 'unreported-checks-block-merge';
      const directory = resolve(resultsDir, shortScenario);
      // One slot removed, not all of them: the boundary this protects is "fewer than required", and
      // deleting the directory would only re-assert the absent case the neighbour already covers.
      for (const name of readdirSync(directory).filter((entry) =>
        entry.startsWith(`run-${REQUIRED_RUNS}.`),
      )) {
        rmSync(resolve(directory, name));
      }

      const report = runVerify(resultsDir);
      assert.equal(report.status, 0, `report mode must not fail on a verdict: ${report.stderr}`);
      assert.match(
        report.stdout,
        new RegExp(
          `^${shortScenario}\\tshort\\t${REQUIRED_RUNS - 1}/${REQUIRED_RUNS} run\\(s\\)`,
          'm',
        ),
        report.stdout,
      );

      const strict = runVerify(resultsDir, ['--mode', 'strict']);
      assert.equal(strict.status, 1, `a short round must fail strict: ${strict.stdout}`);
      // The first stderr line lists every scenario strict rejected, so asserting it in full also
      // asserts that the short verdict stayed scoped to the scenario this test shortened.
      assert.equal(strict.stderr.split('\n')[0], `${shortScenario} is short`);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);

// The count wrong in the other direction, and its own state rather than a flavour of `short`. A
// single `runs.length !== REQUIRED_RUNS` test reports six archived runs as `short 6/5 run(s)` and
// sends an operator to finish a round that is already over-complete, when the actual question is
// what put a sixth slot in a published directory — a hand copy, an interrupted publication, two
// rounds merged by hand. `ensureCanonicalGeneration` refuses the same shape at publication as
// unexpected files, so the report names it too instead of calling it something else.
//
// Like `short` it fails strict while every run it holds is current: a directory of an unexpected
// size is not evidence anybody can read as five of five, whichever side of five it is on.
test(
  'verify reports a surplus round apart from a short one and fails strict on it',
  { timeout: 120_000 },
  () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-verify-surplus-'));
    try {
      // Re-stamped first, for the same reason as the short case: the verdict below has to come
      // from the run count and not from a drifted working tree.
      const resultsDir = resolve(temporary, 'results');
      copyRestampedResults(resultsDir);
      const surplusScenario = 'unreported-checks-block-merge';
      const directory = resolve(resultsDir, surplusScenario);
      const extra = REQUIRED_RUNS + 1;
      for (const name of readdirSync(directory).filter((entry) =>
        entry.startsWith(`run-${REQUIRED_RUNS}.`),
      )) {
        cpSync(
          resolve(directory, name),
          resolve(directory, name.replace(`run-${REQUIRED_RUNS}.`, `run-${extra}.`)),
        );
      }

      const report = runVerify(resultsDir);
      assert.equal(report.status, 1, `surplus must fail report mode: ${report.stderr}`);
      assert.match(
        report.stdout,
        new RegExp(`^${surplusScenario}\\tsurplus\\t${extra}/${REQUIRED_RUNS} run\\(s\\)`, 'm'),
        report.stdout,
      );
      assert.doesNotMatch(report.stdout, new RegExp(`^${surplusScenario}\\tshort\\t`, 'm'));

      const strict = runVerify(resultsDir, ['--mode', 'strict']);
      assert.equal(strict.status, 1, `a surplus round must fail strict: ${strict.stdout}`);
      assert.match(strict.stderr, new RegExp(`${surplusScenario} is surplus`));
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);
