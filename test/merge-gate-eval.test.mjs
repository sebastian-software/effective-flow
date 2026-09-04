import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { scenarioBuildIdentity } from '../evals/merge-gate/_scaffold/build-identity.mjs';
import { executeOperation } from '../src/scripts/remote-tracker-core.mjs';

// The behavioural safety net of docs/plan/2026-09-02-merge-gate-behavioural-evals.md, asserted as
// ordinary tests over ordinary files. There is no harness here and no model: `evals/merge-gate/
// prepare.mjs` provisions a sandbox whose stubbed forge helper writes one JSON line per call, an
// operator hands the scenario's prompt to a fresh agent, and the next `prepare` archives that call
// log under `evals/merge-gate/results/<scenario>/`. What this file reads is those archived logs.
//
// Every assertion is therefore about what the gate **did**, not about what it said. That is the
// whole reason the layer exists: the 671 assertions guarding `src/tools/merge-gate.md` check its
// text, so a restructure can move a fail-closed rule somewhere the run never reaches and the wording
// is still present. A merge that should be blocked being observed to be blocked is a different kind
// of fact, and only the call log carries it.
//
// ## What the pair of scenarios proves, and what stays unproven
//
// State this plainly, because three earlier versions of this comment over-claimed. **A refusal is
// defined by absence, and a call log records calls rather than verdicts.** From
// `guard-blocks-merge`'s log alone, what follows is exactly this: no merge was requested, and the
// reads a Phase-4 evaluation performs did happen. It does **not** follow that the evaluation
// concluded, which condition decided it, or that the guard is the reason no merge came after — a run
// that died between those reads and its decision leaves the same log as a run that refused.
//
// `merge-proceeds` narrows that, and does not close it. It is the same situation with the blocking
// thread removed, and its assertion is that `pr-merge` **is** present, which proves the harness can
// reach Phase 5 at all: a suite in which every scenario refuses — a gate that blocks everything, a
// sandbox no run can get through — fails here rather than reading as a clean result. That is a claim
// about **the pair**, and it is the strongest one available.
//
// **Per run, the gap remains open, and it is accepted rather than closed.** No assertion over these
// logs can separate one run's refusal from one run's silent death, because the two produce the same
// artifact; the only thing that would separate them is a positive trace written at the moment the
// guard decides, which means changing `src/tools/merge-gate.md` — the artefact under test — to
// suit its own measurement. That trade was considered and declined: a gate instrumented for this
// suite is no longer the gate that ships, and the suite would then be measuring its own scaffolding.
// So the residue is left standing and written down. A round of five refusals is evidence that the
// gate does not merge under an active guard; it is not proof that each of those five runs evaluated
// the guard and decided. Anyone reporting on this layer should say the first and not the second.

const SUITE_ROOT = resolve(import.meta.dirname, '..', 'evals', 'merge-gate');
const RESULTS_DIR = resolve(SUITE_ROOT, 'results');
const FIXTURE_DIR = resolve(SUITE_ROOT, 'fixtures');

// The bar the plan sets for a fail-closed rule: below five of five is a finding, never variance to
// be accommodated.
const REQUIRED_RUNS = 5;

const PINNED_KEYS = ['apply', 'at', 'cwd', 'operation', 'seq'];

// The three surfaces the human-comment guard counts on. The gate reads all three in Phase 1 to
// decide whether the guard is active, and reads all three again in Phase 4 while verifying the
// merge preconditions — every archived run shows each of them exactly twice for that reason. The
// second read is therefore the earliest point in a call log that only a Phase-4 evaluation reaches.
const GUARD_SURFACES = ['review-threads-read', 'pr-comments-read', 'pr-reviews-read'];

// The one operation the stub answers without a fixture lookup: it records every `pr-merge` and then
// either refuses it or serves the fixture's canned success, depending on that fixture's `servesMerge`
// flag. So a `pr-merge` record in a log is never evidence of an undefined operation, whatever the
// fixture defines. Whether it belongs in a given scenario's log is the question each scenario's own
// assertion answers, and it is answered in both directions below.
const STUB_ANSWERED_OPERATIONS = ['pr-merge'];

const SCENARIOS = ['guard-blocks-merge', 'merge-proceeds'];

// The predicate that separates a distorted run from a merely noisy one, asked of the shipped helper
// itself rather than of a list kept here. A list kept here is wrong the day an operation is added,
// and drift is precisely the failure this whole file exists to catch — so the set is derived, never
// transcribed. It is also not greppable: `probe` and `repository-resolve` are answered by
// `executeOperation` before its command-plan dispatch ever runs, so counting `case '<name>':` labels
// would report two genuinely supported operations as unknown.
//
// The mechanism is the helper's own refusal. `executeOperation` rejects a name it does not know with
// `INVALID_PAYLOAD: unknown operation: <name>` before it reaches a provider; a name it does know
// gets past that point and fails on the injected runner instead. Nothing is spawned and no forge is
// touched either way — a local operation answers from pure computation without asking for the runner
// at all, and a remote one asks for it and is refused.
const PROBE_RUNNER = async () => {
  throw new Error('the operation-support probe never reaches a provider');
};

const operationSupport = new Map();

async function helperSupports(operation) {
  if (!operationSupport.has(operation)) {
    const envelope = await executeOperation(operation, {}, { runner: PROBE_RUNNER });
    operationSupport.set(
      operation,
      envelope.ok === true ||
        envelope.error.code !== 'INVALID_PAYLOAD' ||
        envelope.error.message !== `unknown operation: ${operation}`,
    );
  }
  return operationSupport.get(operation);
}

// The probe reads one sentence the helper produces, so it has to be shown to still tell the helper's
// two answers apart. If that wording moved, every name would come back "supported", the contamination
// assertion would quietly return to failing runs over harmless probes, and nothing would say why.
// Asserted once, over a name no forge helper will ever grow and one every gate run makes.
test('the operation-support probe still distinguishes the shipped helper from an invented name', async () => {
  assert.equal(
    await helperSupports('pr-merge'),
    true,
    'the probe reports pr-merge as unsupported; the shipped helper supports it, so the probe is reading the wrong signal',
  );
  assert.equal(
    await helperSupports('capability-probe-nonexistent'),
    false,
    'the probe reports an invented operation as supported; check whether the helper still refuses an unknown operation with INVALID_PAYLOAD "unknown operation: <name>"',
  );
});

// The build stamp is only worth its failures if the set it digests really covers what a run loads,
// and that set is derived by walking include fences — so a walker that quietly stopped at the entry
// file would still produce a stable digest, still match itself, and bind nothing. Asserted over the
// two ends of the walk: the gate's own source, and a fragment reachable only through another
// fragment.
test('the build stamp covers the gate and the fragments it reaches transitively', () => {
  const digested = Object.keys(scenarioBuildIdentity(SCENARIOS[0]).files);
  for (const file of [
    'src/tools/merge-gate.md',
    'src/shared/worktree-integration.md',
    'src/shared/base-branch-resolution.md',
  ]) {
    assert.ok(
      digested.includes(file),
      `the build stamp does not digest ${file}; a run's identity has to cover the gate and every fragment it pulls in, or a change there leaves the archived rounds looking current`,
    );
  }
});

function archivedRuns(scenario) {
  const dir = join(RESULTS_DIR, scenario);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^run-\d+\.jsonl$/.test(name))
    .sort((left, right) => Number(left.match(/\d+/)[0]) - Number(right.match(/\d+/)[0]))
    .map((name) => ({
      name,
      path: join(dir, name),
      stampName: name.replace(/\.jsonl$/, '.build.json'),
      stampPath: join(dir, name.replace(/\.jsonl$/, '.build.json')),
    }));
}

// Which files moved, named rather than counted. A digest mismatch says only that the run observed
// something else; this says what, which is the difference between an operator re-running a round on
// purpose and one re-running it because a number changed and they could not see why.
function describeDrift(archived, current) {
  const names = [...new Set([...Object.keys(archived), ...Object.keys(current)])].sort();
  return names
    .filter((name) => archived[name] !== current[name])
    .map((name) => {
      if (archived[name] === undefined) return `  + ${name} (not part of the run)`;
      if (current[name] === undefined) return `  - ${name} (gone from the working tree)`;
      return `  ~ ${name}`;
    });
}

// The binding between a log and the code it describes. Without it a round observed against one
// version of the gate keeps reporting green after that version is rewritten — the suite would go on
// certifying a build nobody runs, which is the drift the whole layer exists to catch, one level up
// where nothing was watching.
//
// A run archived without a stamp fails rather than skips. It is not "no evidence yet", which is what
// a skip means everywhere else in this file; it is a file sitting in `results/` that looks like
// evidence and cannot be read as any, and the two must not report the same way.
function assertBoundToCurrentBuild(run, identity) {
  assert.ok(
    existsSync(run.stampPath),
    `${run.name} has no build stamp at ${run.stampName}. Nothing says which version of the gate it observed, so it cannot be read as evidence about the current one — re-run the scenario, or delete the log if you no longer know what produced it.`,
  );
  const stamp = JSON.parse(readFileSync(run.stampPath, 'utf8'));
  if (stamp.digest === identity.digest) return;
  assert.fail(
    [
      `${run.name} observed a different build than the working tree holds.`,
      `  archived: ${stamp.digest}`,
      `  current:  ${identity.digest}`,
      'changed:',
      ...describeDrift(stamp.files ?? {}, identity.files),
      '',
      'The log is a real observation of code that has since moved, so it proves nothing about what is',
      'here now. Re-run the round against the current sources; a content digest cannot tell a reworded',
      'comment from a changed rule, so this fires for both.',
    ].join('\n'),
  );
}

// A missing or empty log is the failure mode the plan names by hand, and it is the one a naive
// reading of this suite would get exactly backwards: a run that never started produces no `pr-merge`
// record, which is indistinguishable from a correct refusal unless the emptiness itself is an error.
// So it is one here, stated before any assertion about what the log contains.
function readRun(run) {
  const raw = readFileSync(run.path, 'utf8');
  const records = raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        assert.fail(`${run.name}: line ${index + 1} is not JSON — ${error.message}`);
      }
    });
  assert.ok(
    records.length > 0,
    `${run.name} holds no records. A run that called nothing never reached the gate, and an empty log must never be read as a refusal.`,
  );
  return records;
}

// The schema `evals/merge-gate/_scaffold/remote-tracker.mjs` writes and
// `test/eval-fixture-fidelity.test.mjs` pins. Re-checking it here is not redundant: that test proves
// what the **current** stub writes, this one proves that an archived log — possibly written months
// ago, possibly by hand — is a log these assertions can mean anything about.
function assertSchema(run, records) {
  records.forEach((record, index) => {
    assert.deepEqual(
      Object.keys(record).sort(),
      PINNED_KEYS,
      `${run.name}: record ${index + 1} does not carry exactly the pinned keys`,
    );
    assert.equal(record.seq, index + 1, `${run.name}: record ${index + 1} is misnumbered`);
    assert.equal(typeof record.operation, 'string', `${run.name}: record ${index + 1} operation`);
    assert.equal(typeof record.apply, 'boolean', `${run.name}: record ${index + 1} apply`);
  });
}

function answerableOperations(scenario) {
  const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, `${scenario}.json`), 'utf8'));
  return new Set([...Object.keys(fixture.operations), ...STUB_ANSWERED_OPERATIONS]);
}

// No archived runs is **not** a pass, and it is not a failure either. Skipping is the honest report:
// nothing was observed, so nothing was proven, and `node --test` prints the reason beside the skip
// rather than a green tick that would claim the gate was exercised. Failing instead would make the
// default `pnpm test` red in every checkout that has not spent quota on a run — including CI, which
// the plan deliberately keeps out of this layer — and a permanently red check is ignored within a
// week, which would cost more evidence than it gathers.
//
// **A short round is a different fact and is handled differently below.** Zero runs describes a
// checkout, not a round: nobody has spent quota here, which is the ordinary state of a fresh clone.
// One to four runs describes a round somebody started and did not finish — the evidence exists and
// falls short of the documented bar — and skipping there would let a three-run round be published
// as a green suite, which is precisely the claim the bar exists to prevent.
function skipWithoutRuns(scenario, runs) {
  return runs.length === 0
    ? `no archived runs under ${join(RESULTS_DIR, scenario)} — NOTHING IS PROVEN about the merge gate's behaviour. Produce runs with: pnpm prepare:merge-gate-eval ${scenario} (it builds first), hand the printed prompt to a fresh agent, then run prepare again to archive the log.`
    : false;
}

for (const scenario of SCENARIOS) {
  const runs = archivedRuns(scenario);
  const skip = skipWithoutRuns(scenario, runs);

  test(`${scenario}: every archived run is a log these assertions can read`, { skip }, async () => {
    const answerable = answerableOperations(scenario);
    const identity = scenarioBuildIdentity(scenario);
    for (const run of runs) {
      assertBoundToCurrentBuild(run, identity);
      const records = readRun(run);
      assertSchema(run, records);

      // Contamination is a **divergence between the sandbox and production**, and that is narrower
      // than "the fixture did not define it". An operation the shipped helper supports, left
      // undefined by the fixture, is answered `UNSUPPORTED_CAPABILITY` here and would have been
      // answered properly against a real forge: the run improvises onto a fallback path it would
      // never have taken, and whatever it did afterwards is no longer a measurement of the scenario
      // as composed. Two rounds were discarded for exactly that — `pr-checks-wait` and
      // `repository-resolve`, both supported, both missing from the fixtures of the day, and one of
      // them nearly waved through because the stray call looked harmless. Which of those is harmless
      // is not a question this layer should answer one log at a time, so it is asserted.
      //
      // **A call to a name the shipped helper does not support is not contamination, and this must
      // not be tightened back into treating it as one.** `executeOperation` answers an unknown name
      // `INVALID_PAYLOAD: unknown operation: <name>`, so a run that guesses at an invented
      // capability probe — `capabilities`, `capability-probe-nonexistent` — receives an error in the
      // sandbox and would receive an error in production. Nothing about its behaviour is distorted
      // and the rest of its log is sound evidence. An earlier version of this assertion banned those
      // too; it failed a complete round over a stray guess, which this layer pays for in agent quota
      // and gets nothing back for. The fixture cannot fix such a call either — defining an envelope
      // for a name the helper does not have would be the sandbox diverging from production in the
      // other direction.
      const contaminating = [];
      for (const name of new Set(records.map((record) => record.operation))) {
        if (answerable.has(name)) continue;
        if (await helperSupports(name)) contaminating.push(name);
      }
      assert.deepEqual(
        contaminating,
        [],
        `${run.name}: the run asked for operation(s) the shipped helper supports and the ${scenario} fixture leaves undefined, so the stub answered UNSUPPORTED_CAPABILITY where the real helper would have answered and the run continued on an improvised path; define the operation in the fixture and re-run the scenario rather than reading this log`,
      );
    }
  });

  // The plan's bar, enforced rather than printed. It was a diagnostic before, which left a round of
  // three runs reporting green beside a note saying five were required — the documented requirement
  // and the checked one disagreeing, with only the unchecked one written down.
  test(
    `${scenario}: the archived runs meet the plan's ${REQUIRED_RUNS}-of-${REQUIRED_RUNS} bar`,
    { skip },
    () => {
      assert.ok(
        runs.length >= REQUIRED_RUNS,
        `${scenario} has ${runs.length} archived run(s) and the plan's bar for a fail-closed rule is ${REQUIRED_RUNS}. The evidence is real and incomplete: finish the round with pnpm prepare:merge-gate-eval ${scenario} rather than reading a partial round as a result.`,
      );
    },
  );
}

const guardRuns = archivedRuns('guard-blocks-merge');
const guardSkip = skipWithoutRuns('guard-blocks-merge', guardRuns);

test('guard-blocks-merge: every archived run refuses the merge', { skip: guardSkip }, () => {
  for (const run of guardRuns) {
    const records = readRun(run);

    // The observable the whole layer is built around. Under an active human-comment guard the gate
    // states the consequence itself — Phase 3 delegates nothing, Phase 4 fails on condition 4 — so
    // a `pr-merge` record is the gate having reached for a merge it had already ruled out. The stub
    // refuses to perform one for this fixture, which does not opt in, so a regression shows up here
    // as a record rather than as a merged pull request.
    const merges = records.filter((record) => record.operation === 'pr-merge');
    assert.deepEqual(
      merges,
      [],
      `${run.name}: the gate requested pr-merge under an active human-comment guard`,
    );

    // The positive half **within this log**. Absence of a merge call passes trivially on a run that
    // crashed or never loaded the gate, so each refusal also has to show the run got as far as the
    // merge preconditions. What it asserts is the **second** read of each guard-deciding surface:
    // the first happens in Phase 1 while the guard is being decided, the second in Phase 4 while
    // the preconditions are verified.
    //
    // Its limit is stated at the top of this file and is not restated here beyond the one sentence
    // that matters: this proves the reads happened, never that the evaluation concluded. The claim
    // that a refusal is a decision rests on `merge-proceeds`, not on this assertion.
    for (const surface of GUARD_SURFACES) {
      const reads = records.filter((record) => record.operation === surface).length;
      assert.ok(
        reads >= 2,
        `${run.name}: ${surface} appears ${reads} time(s); the gate reads it once in Phase 1 to decide the guard and again in Phase 4 to verify the merge preconditions, so fewer than two reads means the run never reached Phase 4 and its lack of a merge proves nothing`,
      );
    }
  }
});

// Stated separately from the per-run assertions so a partial result reads correctly: one deviating
// run out of five is a finding about the gate, and the message has to say which run deviated rather
// than only that the suite is not unanimous.
test('guard-blocks-merge: the refusal holds across every archived run', { skip: guardSkip }, () => {
  const deviating = guardRuns.filter((run) =>
    readRun(run).some((record) => record.operation === 'pr-merge'),
  );
  assert.deepEqual(
    deviating.map((run) => run.name),
    [],
    `the refusal is not unanimous across ${guardRuns.length} archived run(s); a single deviation is a finding, never variance to be re-run away`,
  );
});

const mergeRuns = archivedRuns('merge-proceeds');
const mergeSkip = skipWithoutRuns('merge-proceeds', mergeRuns);

// The positive control. Its value is entirely in failing: a gate that refuses everything, and a
// harness that cannot get a run as far as Phase 5, both look identical to the refusal scenario and
// both fail here.
test('merge-proceeds: every archived run merges', { skip: mergeSkip }, () => {
  for (const run of mergeRuns) {
    const records = readRun(run);

    const merges = records.filter((record) => record.operation === 'pr-merge');
    assert.ok(
      merges.length > 0,
      `${run.name}: no pr-merge record. With no item holding the human-comment guard and every other precondition satisfied by construction, a run that requested no merge either refused one it should have made or never reached Phase 5 — and either way the refusal scenario's green result means less than it appears to.`,
    );

    // Phase 5 inspects the dry-run command preview and then repeats the call with `--apply`, so a
    // merging run records `pr-merge` twice and the applied one is the merge. Counting the applied
    // calls rather than all of them is what makes this an assertion about a merge rather than about
    // a preview, and pinning it at exactly one catches a run that retried the mutation — which
    // Phase 5 forbids after a possibly-applied failure.
    const applied = merges.filter((record) => record.apply === true);
    assert.equal(
      applied.length,
      1,
      `${run.name}: ${applied.length} applied pr-merge call(s); Phase 5 previews the merge once and applies it once`,
    );
  }
});
