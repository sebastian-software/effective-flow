import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { canonicalDigest, digestOf } from '../evals/_scaffold/build-identity.mjs';
import { discoverSuite } from '../evals/_scaffold/suite.mjs';
import suite from '../evals/merge-gate/suite.config.mjs';
import {
  childResult,
  copyRestampedResults,
  REPOSITORY_RESULTS,
} from './support/merge-gate-round-fixtures.mjs';
import { ROUND_CLI, runVerify, treeDigests } from './support/merge-gate-round-helpers.mjs';

test('verify rejects an inapplicable flag and an unknown mode value', () => {
  for (const [args, expected] of [
    [['--round', 'some-round'], /verify does not accept --round/],
    [['--mode', 'quiet'], /--mode accepts report or strict, not quiet/],
    // The empty-ish forms the parser already refuses, asserted for `verify` too: `--mode` without
    // a value must not read as "default to report".
    [['--mode'], /--mode requires a value/],
  ]) {
    const result = spawnSync(process.execPath, [ROUND_CLI, 'merge-gate', 'verify', ...args], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, args.join(' '));
    assert.match(result.stderr, expected, args.join(' '));
  }
});

// The split the release gate rests on, asserted through the process exit code because that is the
// only thing a workflow step reads.
//
// **A verdict and a failure to produce one must not arrive the same way.** Report mode exits 0 for
// every state it can reach, stale included, so the step this work adds cannot turn an ordinary
// pull request red; it exits nonzero only when no verdict exists at all. Without that split the
// CLI's shared error path — which exits 1 for any thrown error — would make a broken build red on
// every pull request through the very step introduced to prevent that.
test(
  'verify separates a stale or absent verdict from a failure to reach one',
  { timeout: 120_000 },
  () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-verify-'));
    try {
      // Re-stamped first, so the corpus is current whatever the working tree holds and the states
      // below are the ones this test put there rather than ones it inherited.
      const resultsDir = resolve(temporary, 'results');
      copyRestampedResults(resultsDir);
      const drifted = resolve(resultsDir, 'merge-proceeds', 'run-1.build.json');
      const stamp = JSON.parse(readFileSync(drifted, 'utf8'));
      stamp.skill.files['tools/merge-gate.md'] = `sha256:${'a'.repeat(64)}`;
      stamp.skill.digest = `sha256:${'b'.repeat(64)}`;
      stamp.skill.versionNeutralDigest = `sha256:${'c'.repeat(64)}`;
      stamp.skill.digest = canonicalDigest(stamp.skill.files);
      stamp.digest = digestOf(
        [stamp.skill.digest, stamp.instrument.digest, stamp.scenario_inputs.digest].join('\n'),
      );
      writeFileSync(drifted, `${JSON.stringify(stamp, null, 2)}\n`);
      const driftMetadataPath = drifted.replace(/\.build\.json$/, '.metadata.json');
      const driftMetadata = JSON.parse(readFileSync(driftMetadataPath, 'utf8'));
      driftMetadata.buildDigest = stamp.digest;
      writeFileSync(driftMetadataPath, JSON.stringify(driftMetadata));
      rmSync(resolve(resultsDir, 'linked-issue-open-points'), { recursive: true, force: true });

      const report = runVerify(resultsDir);
      assert.equal(report.status, 0, `report mode must not fail on a verdict: ${report.stderr}`);
      assert.match(report.stdout, /merge-proceeds\tstale\t/);
      assert.match(report.stdout, /linked-issue-open-points\tabsent\t/);
      assert.match(report.stdout, /guard-blocks-merge\tcurrent\t/);
      // The moved file, named. This is the bisect list a stale report exists to hand over, and a
      // report that only said "stale" would send an operator to re-record a round blind.
      assert.match(report.stdout, /~ tools\/merge-gate\.md/);
      // And the pair of digests the moved file explains. The list says what changed; these two say
      // which builds are being compared, which is what lets an operator match a stale run against
      // a round manifest or against the stamps beside it instead of taking the verdict on trust.
      assert.match(
        report.stdout,
        new RegExp(`^ {4}archived: ${stamp.digest}$`, 'm'),
        report.stdout,
      );
      assert.match(report.stdout, /^ {4}current: {2}sha256:[0-9a-f]{64}$/m, report.stdout);

      const strict = runVerify(resultsDir, ['--mode', 'strict']);
      assert.equal(strict.status, 1);
      assert.match(strict.stderr, /merge-proceeds is stale/);
      assert.match(strict.stderr, /linked-issue-open-points is absent/);

      // The other direction: an archived file that cannot be read is not a verdict about the gate,
      // so both modes fail — and the message names the run rather than a byte offset.
      const unreadable = resolve(temporary, 'unreadable-results');
      cpSync(REPOSITORY_RESULTS, unreadable, { recursive: true });
      // The copied generation marker pins a digest of the bytes as archived, and the tamper below
      // moves them. Left in place it would fail the generation read `verify` now pins its walk
      // with — an integrity error about the marker, raised before the walk this case is about ever
      // ran — and the assertion would pass for a different reason than the one it names. Removing
      // it leaves an unmarked ("legacy") corpus, which is exactly what `copyRestampedResults`
      // hands its own callers and a state both reads tolerate.
      rmSync(resolve(unreadable, '.generation.json'), { force: true });
      writeFileSync(resolve(unreadable, 'merge-proceeds', 'run-1.build.json'), 'not json\n');
      const operational = runVerify(unreadable);
      assert.notEqual(operational.status, 0);
      assert.match(operational.stderr, /merge-proceeds\/run-1\.build\.json is unreadable/);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);

test('verify reports the repository corpus without writing to it', { timeout: 120_000 }, () => {
  const before = treeDigests(REPOSITORY_RESULTS);
  const result = spawnSync(process.execPath, [ROUND_CLI, 'merge-gate', 'verify'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  // The corpus the verdict is about, named in the output. A report that says six scenarios are
  // current without saying what it read cannot be told apart from one about some other directory.
  assert.equal(result.stdout.split('\n')[0], `corpus: ${REPOSITORY_RESULTS}`);
  for (const scenario of discoverSuite(suite).scenarios) {
    assert.match(
      result.stdout,
      new RegExp(`^${scenario}\t\\w+\t`, 'm'),
      `verify reported nothing about ${scenario}`,
    );
  }
  assert.deepEqual(treeDigests(REPOSITORY_RESULTS), before);
});

// The seam's empty form, which is the ordinary shape of an unset workflow input: a value that is
// set and empty must read as unset, not as a path. The empty string resolves against the process
// working directory, so without the fallback every scenario would report `absent`, report mode
// would exit 0, and a CI step would look like it had verified a corpus it never opened. Asserted
// through the printed corpus line, because the path is the only thing that separates the two
// readings from outside the process.
test(
  'verify falls back to the repository corpus when the seam is set but empty',
  { timeout: 120_000 },
  () => {
    const result = spawnSync(process.execPath, [ROUND_CLI, 'merge-gate', 'verify'], {
      encoding: 'utf8',
      env: { ...process.env, EFFECTIVE_FLOW_EVAL_VERIFY_RESULTS_DIR: '' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.split('\n')[0], `corpus: ${REPOSITORY_RESULTS}`);
    // Only scenarios the repository corpus holds can show the wrong reading; one that landed before
    // its first recorded round is absent under either reading and says nothing about the seam.
    const recorded = discoverSuite(suite).scenarios.filter((scenario) =>
      existsSync(resolve(REPOSITORY_RESULTS, scenario)),
    );
    assert.ok(recorded.length > 0, 'the repository corpus holds no recorded scenario to read');
    for (const scenario of recorded) {
      assert.doesNotMatch(
        result.stdout,
        new RegExp(`^${scenario}\tabsent\t`, 'm'),
        `${scenario} read as absent, so the empty value was taken as a path`,
      );
    }
  },
);

// Runs `verify` with its walk stopped at every scenario, so the corpus can be moved underneath a
// read that is already in progress. `publishRound` renames the canonical directory away and the
// candidate into its place, and this reproduces what a walk sees while those renames happen —
// without a publication, which would need a three-hour round's worth of evidence to reach the same
// two instants.
//
// The loop deletes the marker **before** it writes the release, and the boundary in `round-core`
// consumes the release, so the next marker this sees can only be the next pause. That is what lets
// a single controller drive both the first walk and the retry: a gate that stayed open would let
// the retry read a settled corpus and report an ordinary verdict, and the error this test exists
// to assert would never be raised.
//
// `grants` is the count of pauses answered, and it is the only thing that says from outside the
// process how many walks ran: one walk pauses once per scenario, a walk plus its retry twice that.
async function driveVerifyWalk(resultsDir, { tear = false } = {}) {
  const gate = mkdtempSync(join(tmpdir(), 'effective-flow-verify-gate-'));
  const marker = resolve(gate, 'paused');
  const release = resolve(gate, 'release');
  const child = spawn(process.execPath, [ROUND_CLI, 'merge-gate', 'verify'], {
    env: {
      ...process.env,
      EFFECTIVE_FLOW_EVAL_VERIFY_RESULTS_DIR: resultsDir,
      EFFECTIVE_FLOW_EVAL_PAUSE_AT: 'verify-scenario-read',
      EFFECTIVE_FLOW_EVAL_PAUSE_MARKER: marker,
      EFFECTIVE_FLOW_EVAL_PAUSE_RELEASE: release,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const finished = childResult(child);
  let running = true;
  finished.then(() => (running = false));
  let grants = 0;
  try {
    while (running) {
      if (!existsSync(marker)) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 10));
        continue;
      }
      rmSync(marker, { force: true });
      // One file per pause, at the top level of the corpus: `scenarioFreshness` never looks at it,
      // so the per-scenario verdicts stay what they were, while the generation's content digest
      // moves — which is precisely a corpus that changed under a walk and not one whose evidence
      // changed.
      if (tear) writeFileSync(resolve(resultsDir, `torn-${grants}.txt`), `${grants}\n`);
      grants += 1;
      writeFileSync(release, 'go');
    }
    return { ...(await finished), grants };
  } finally {
    rmSync(gate, { recursive: true, force: true });
  }
}

// The window `verify` has to survive, and the reason it survives it without a lock. Between
// `publishRound`'s two renames the canonical results directory is briefly absent and then briefly
// the *other* generation, so a concurrent walk can report every scenario `absent` or mix one
// scenario from each side. `verify` is documented as safe beside a round and beside a publication
// and is run in CI on every pull request, so it cannot take the publication lock to close that
// window: it would block behind the publication that ends a three-hour round and wait out a lock
// left by a killed one. It pins the generation instead — read before the walk, read again after —
// and a walk that does not stay on one generation produced no verdict at all.
//
// **A torn read has to leave through the error path, not the verdict path.** Both modes exit
// nonzero for it, exactly as they do for an unreadable stamp: a fabricated verdict about a corpus
// nobody managed to read is the one answer a release gate must never give.
test(
  'verify fails rather than reporting a verdict when the corpus moves under both walks',
  { timeout: 240_000 },
  async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-verify-torn-'));
    try {
      const resultsDir = resolve(temporary, 'results');
      cpSync(REPOSITORY_RESULTS, resultsDir, { recursive: true });
      // Unmarked, so the tear below is read as a corpus that moved rather than as a marker whose
      // digest no longer describes its directory. Both are operational errors and neither is a
      // verdict, but only the first is the race this test is about.
      rmSync(resolve(resultsDir, '.generation.json'), { force: true });

      const torn = await driveVerifyWalk(resultsDir, { tear: true });
      assert.notEqual(torn.code, 0, `a torn read must not produce a verdict: ${torn.stdout}`);
      assert.match(torn.stderr, /the archived corpus changed while it was being read, twice over/);
      assert.match(torn.stderr, new RegExp(resultsDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      // No scenario line was printed: the CLI prints the report only after `verifyFreshness`
      // returns, and a run that threw has nothing to print.
      assert.doesNotMatch(torn.stdout, /\tcurrent\t|\tstale\t|\tabsent\t/);
      // Two walks, one retry, and no third attempt. Retrying until the corpus settles would turn a
      // fast failure into an open-ended one in a CI step that holds a runner.
      assert.equal(torn.grants, discoverSuite(suite).scenarios.length * 2);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);

// The other direction, and the half that keeps the guard from being free to get wrong: a corpus
// nobody touches is walked once and reported once. A retry that fired on every run would double
// the cost of the step on every pull request and, worse, would hide a real tear behind a second
// walk nobody asked for.
test('verify walks a settled corpus once and does not retry it', { timeout: 240_000 }, async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-verify-settled-'));
  try {
    const resultsDir = resolve(temporary, 'results');
    // Copied with its generation marker, so the settled walk goes through the marked branch of
    // `generationInfo` rather than the unmarked one its neighbour above uses.
    cpSync(REPOSITORY_RESULTS, resultsDir, { recursive: true });

    const settled = await driveVerifyWalk(resultsDir);
    assert.equal(settled.code, 0, `a settled corpus must reach a verdict: ${settled.stderr}`);
    assert.equal(settled.grants, discoverSuite(suite).scenarios.length);
    for (const scenario of discoverSuite(suite).scenarios) {
      assert.match(
        settled.stdout,
        new RegExp(`^${scenario}\t\\w+\t`, 'm'),
        `verify reported nothing about ${scenario}`,
      );
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
