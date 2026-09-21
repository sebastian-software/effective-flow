import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  buildPortableSkill,
  freshnessVerdict,
  isCompatibleLegacyInstrumentPredecessor,
  isVersionStampOnlyPredecessor,
  PREDECESSOR_LEGACY_INSTRUMENT_DIGEST,
  pristineScenarioBuildIdentity,
  scenarioBuildIdentity,
  TRACKER_STUB_PATH,
} from '../evals/merge-gate/_scaffold/build-identity.mjs';
import {
  evaluateEvidence,
  mutatingTrackerOperations,
} from '../evals/merge-gate/_scaffold/evaluate.mjs';
import { discoverSuite, REQUIRED_RUNS } from '../evals/merge-gate/_scaffold/suite.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
//
// **`linked-issue-open-points` is a third scenario and not a third member of that pair.** Its pull
// request is already merged in the canned document, so it makes no merge decision at all: it enters
// observer-only mode and is the only scenario that reaches Phase 5.5. It carries none of the pair's
// claim and the pair carries none of its own — read its assertion below on its own terms.
//
// **`unreported-checks-block-merge` is a fourth scenario and a fourth shape.** Its status read
// carries no check rollup, so the gate refuses it twice over — Phase 2 does not leave its loop on an
// unreported check list, and merge precondition 2 blocks on the same fact unless the Phase-4
// no-check-list waiver clears its reported-at-all clause, which only a gated run can pose. A
// non-interactive run has no operator to ask, so the run ends **without ever making a merge
// decision**. That is why it satisfies neither existing proxy: the refusal proxy asks for a second
// read of each guard-deciding surface, which only a Phase-4 evaluation performs, and the merging one
// asks for a `pr-merge` record. Its own proxy is stated where it is asserted, and it is weaker than
// both.
//
// **`unreported-checks-at-phase-four` is the fifth scenario, and the first with a sequenced read.**
// Its status read reports a green check list twice and no check list from the third read on, so
// Phase 2 leaves its loop and the fresh Phase-4 read is the one that observes the unreported list. It
// is a refusal and uses the refusal proxy, but it carries one rule no other scenario needs: a run that
// served two phases with one status read never reached the flipped element in time, and is invalid
// rather than passing or failing. That validity rule is stated and asserted where the scenario is.

const SUITE_ROOT = resolve(import.meta.dirname, '..', 'evals', 'merge-gate');
const RESULTS_DIR = resolve(SUITE_ROOT, 'results');
const FIXTURE_DIR = resolve(SUITE_ROOT, 'fixtures');

const LEGACY_KEYS = ['apply', 'at', 'cwd', 'operation', 'seq'];
const START_KEYS = ['apply', 'at', 'callId', 'cwd', 'event', 'operation', 'seq'];
const COMPLETE_KEYS = ['at', 'callId', 'event', 'seq'];

// The three surfaces the human-comment guard counts on. The gate reads all three in Phase 1 to
// decide whether the guard is active, and reads all three again in Phase 4 while verifying the
// merge preconditions — every archived run shows each of them exactly twice for that reason. The
// second read is therefore the earliest point in a call log that only a Phase-4 evaluation reaches.
const GUARD_SURFACES = ['review-threads-read', 'pr-comments-read', 'pr-reviews-read'];

function startRecords(records) {
  // Legacy archived logs have one operation-bearing record per call and no lifecycle event. Treat
  // those records as starts so outcome assertions remain legible while the schema/build checks and
  // Phase-4 completion rule reject them as current evidence.
  return records.filter(
    (record) =>
      record.event === 'start' ||
      (!Object.hasOwn(record, 'event') && typeof record.operation === 'string'),
  );
}

function operationStarts(records, operation) {
  return startRecords(records).filter((record) => record.operation === operation);
}

// The one operation the stub answers without a fixture lookup: it records every `pr-merge` and then
// either refuses it or serves the fixture's canned success, depending on that fixture's `servesMerge`
// flag. So a `pr-merge` record in a log is never evidence of an undefined operation, whatever the
// fixture defines. Whether it belongs in a given scenario's log is the question each scenario's own
// assertion answers, and it is answered in both directions below.
const STUB_ANSWERED_OPERATIONS = ['pr-merge'];

const SCENARIOS = discoverSuite().scenarios;

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

// The seeds every run enters through — the router, the gate tool, the artifacts the gate delegates
// into and the delegation-envelope helper it executes — plus a sample of the fragments those reach
// by their own pointers. A sample rather than the whole expected list on purpose: the set
// legitimately grows the day the gate gains a pointer, and pinning the full list would turn every
// such addition into a failure that carries no information.
//
// The two envelope scripts are not a sample and are listed in full. No pointer names them, so they
// are in the set only for as long as `LOAD_SET_SEEDS` lists them explicitly, and dropping a seed is
// the one drift this pair of lists exists to catch: a run executes the shipped helper, so a change
// there changes what the run does while every archived stamp goes on reporting current.
const LOADED_BY_A_RUN = [
  'SKILL.md',
  'tools/merge-gate.md',
  'tools/iterate.md',
  'workers/effective-flow-merge-conflict-resolver.md',
  'scripts/delegation-envelope.mjs',
  'scripts/delegation-envelope-core.mjs',
  'shared/merge-gate-check-list-waiver.md',
  'shared/merge-gate-checkout-boundary.md',
  'shared/merge-gate-conflict-resolution.md',
  'shared/pr-merge-completion.md',
];

// Files the built portable skill holds that the derived set deliberately stops short of, one from
// each direction it could wrongly widen again: a worker contract the gate never selects, an
// unrelated tool, an unrelated `shared/` fragment — which is what separates the derived include
// graph from the coarser "hash all of `shared/`" set that was weighed and rejected — and `LICENSE`.
// The worker is a UI implementer rather than one of the two the gate can reach, so the entry stays a
// statement about roles outside the gate's delegation rather than one contradicted by the seeds.
//
// The tracker helper is the pointed exclusion, both halves of it. `scaffold.mjs` overwrites
// `scripts/remote-tracker.mjs` in the copied tree with the stub before any run, and the stub is
// hashed separately as the `instrument` part, so a run never loads the shipped file's content and
// never reaches the `-core.mjs` module it imports. Hashing either would bind every archived round to
// a file no run reads — exactly the coupling the narrowing removed — and would additionally
// double-count what the instrument already covers.
//
// It is the one script excluded, not the class: the delegation-envelope pair above is a member for
// the mirror-image reason. Nothing stubs it, so a run executes what the build shipped. Reading
// these two lists together is what keeps "a `.mjs` cannot be in the load set" from re-forming as a
// rule nobody decided on.
const NOT_LOADED_BY_A_RUN = [
  'workers/effective-flow-ui-implementer.md',
  'tools/plan.md',
  'shared/plan-contract.md',
  'LICENSE',
  'scripts/remote-tracker.mjs',
  'scripts/remote-tracker-core.mjs',
];

// The stamp is only worth its failures if it really covers what a run loads — and only worth
// keeping if it stops there. The hashed set is derived in `build-identity.mjs` by following the
// seeds' own load pointers through the built tree: the router a run enters through, the gate tool it
// runs, the artifacts it delegates into, and every `shared/` fragment those pointers reach,
// transitively. That reachability closure is a strict subset of the built portable tree.
//
// `chat-language`, the eager fragment every speaking tool carries, adds the fragments referenced by
// its `lazy-include` pointers to the closure: `shared/config-migration.md` and
// `shared/typography-rules.md` into the set. The typography one is reached only under
// `when: the resolved chat language is de` — a branch no scenario takes — so it widens the
// identity for a file these rounds never read. That is the coupling the paragraph below warns
// about, arriving through a conditional pointer rather than through a lost narrowing. That it
// widens the set anyway is a stated decision rather than an open question: `build-identity.mjs`
// records it beside `LOAD_POINTER_RE`, where the derivation lives. A rendered pointer's `when:`
// clause is English prose with no predicate to test against, and the blanket rule that would drop
// this one drops `shared/config-migration.md` with it — the other pointer the same fragment
// carries, which runs do read.
//
// Membership is asserted in both directions because both failures are silent. A set that lost a
// seed still produces a perfectly stable digest — it would match itself round after round while
// binding almost nothing, and the suite would go on certifying a gate that had been rewritten
// underneath it. A set that grew back to the whole tree binds every archived round to files no run
// reads, so an edit to an unrelated tool or an unreached worker contract invalidates every round
// and forces a re-round that can produce no new information; that coupling is what the narrowing
// removed, and nothing else here would notice it returning.
//
// **Do not restore a count floor.** An earlier version asserted `hashed.length > 50`, which
// contradicted the name above it: it held only while the stamp hashed the whole output, and the
// correct set fails it. A floor cannot distinguish the files the gate can reach from an equally
// sized arbitrary set, which is the only question worth asking here.
test('the build stamp covers the built tree a run actually loads', () => {
  const identity = currentIdentity('guard-blocks-merge');
  const hashed = Object.keys(identity.skill.files);
  for (const file of LOADED_BY_A_RUN) {
    assert.ok(
      hashed.includes(file),
      `the build stamp does not hash ${file}; a run's identity has to cover the tree it loads, or a change there leaves the archived rounds looking current`,
    );
  }
  for (const file of NOT_LOADED_BY_A_RUN) {
    assert.ok(
      !hashed.includes(file),
      `the build stamp hashes ${file}, which no merge-gate run loads; binding the archived rounds to it means an unrelated edit invalidates every one of them and forces a re-round that can produce no new information`,
    );
  }
  for (const part of ['skill', 'instrument', 'scenario_inputs']) {
    assert.match(
      identity[part].digest,
      /^sha256:[0-9a-f]{64}$/,
      `the ${part} half of the stamp is not a digest`,
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
      iterateName: name.replace(/\.jsonl$/, '.iterate.jsonl'),
      iteratePath: join(dir, name.replace(/\.jsonl$/, '.iterate.jsonl')),
      metadataPath: join(dir, name.replace(/\.jsonl$/, '.metadata.json')),
    }));
}

// The structural half of the stamp check, and deliberately only that half. Whether a stamp exists,
// parses, and is the stamp its own metadata names is a property of the archived files alone: it can
// be decided from `results/` without building anything, it can never be fixed by re-recording the
// tree, and a checkout that fails it holds files that look like evidence and are not. So it stays
// hard here, on every pull request.
//
// **Whether the stamp still describes the working tree is a property of the pair, and it moved.**
// It used to be asserted three lines below this one, which made every edit to a load-set source
// turn `pnpm test` red until six scenarios times five runs had been re-recorded — roughly three
// hours of agent sessions, paid per pull request for a claim that is about the build that ships.
// `pnpm merge-gate-eval verify` owns that question now: it reports on every pull request and is
// enforced on the release pull request. The always-skipped test below names it so `node --test`
// prints a pointer here rather than leaving a silent gap. The shared verdict itself lives in
// `evals/merge-gate/_scaffold/build-identity.mjs` — moved there, not deleted, because three callers
// now ask it.
//
// A run archived without a stamp fails rather than skips. It is not "no evidence yet", which is what
// a skip means everywhere else in this file; it is a file sitting in `results/` that looks like
// evidence and cannot be read as any, and the two must not report the same way.
function assertStructurallyBound(scenario, run) {
  assert.ok(
    existsSync(run.stampPath),
    `${run.name} has no build stamp at ${run.stampName}. Nothing says which version of the gate it observed, so it cannot be read as evidence about the current one — re-run the scenario, or delete the log if you no longer know what produced it.`,
  );
  let stamp;
  try {
    stamp = JSON.parse(readFileSync(run.stampPath, 'utf8'));
  } catch (error) {
    assert.fail(`${run.name}: ${run.stampName} is not readable JSON — ${error.message}`);
  }
  assert.match(
    stamp.digest ?? '',
    /^sha256:[0-9a-f]{64}$/,
    `${run.name}: ${run.stampName} carries no digest, so nothing binds the log to a build at all`,
  );
  assert.equal(
    stamp.scenario,
    scenario,
    `${run.name}: ${run.stampName} describes ${stamp.scenario}, so it was archived under the wrong scenario`,
  );
  // The metadata is what publication writes to bind the four files of one evidence unit together.
  // A stamp the metadata does not name means the archived unit was assembled from two different
  // runs, which no freshness check would ever notice: both halves can be perfectly current and
  // still describe different observations.
  //
  // Required rather than optional, and parsed under the same guard as the stamp above. Every
  // archived unit is written by `publishRound`, which writes the metadata beside the log, so a unit
  // without one was not published by the tool that owns this directory — and treating that as
  // "nothing to check here" turns the binding assertion off for exactly the units least likely to
  // hold. An unparseable metadata file would otherwise fail as a raw `SyntaxError` naming a byte
  // offset, which is the failure text this file already refuses to hand an operator.
  assert.ok(
    existsSync(run.metadataPath),
    `${run.name} has no metadata beside it. Publication always writes one, so nothing binds this log, its prompt and its stamp into a single evidence unit — re-run the scenario, or delete the log if you no longer know what produced it.`,
  );
  let metadata;
  try {
    metadata = JSON.parse(readFileSync(run.metadataPath, 'utf8'));
  } catch (error) {
    assert.fail(
      `${run.name}: ${basename(run.metadataPath)} is not readable JSON — ${error.message}`,
    );
  }
  assert.equal(
    metadata.buildDigest,
    stamp.digest,
    `${run.name}: the metadata names build ${metadata.buildDigest} while ${run.stampName} carries ${stamp.digest}, so the archived unit does not describe one run`,
  );
}

// Nothing was observed here, and this file says so rather than passing quietly — the same rule
// `skipWithoutRuns` applies to a checkout with no archived runs. A silent gap where an assertion
// used to be is how a moved check becomes a deleted one: the next reader sees a suite that is green
// about freshness and has no way to learn that nothing checked it.
test(
  'archived-run freshness against the working tree is verified by `pnpm merge-gate-eval verify`',
  {
    skip: 'freshness is not a per-pull-request assertion: run `pnpm merge-gate-eval verify` for the verdict, which CI reports on every pull request and enforces with --mode strict on the release pull request. What stays asserted here is structural — a stamp exists, parses, and is the one its metadata names.',
  },
  () => {},
);

test('legacy instrument compatibility accepts only the exact nonsequenced predecessor', () => {
  const identity = {
    skill: { digest: 'skill-current', files: { 'tools/merge-gate.md': 'skill-file-current' } },
    scenario_inputs: { digest: 'scenario-current', files: { 'fixture.json': 'fixture-current' } },
    instrument: {
      digest: 'instrument-current',
      files: {
        [TRACKER_STUB_PATH]: 'tracker-current',
        'evals/merge-gate/_scaffold/sandbox.mjs': 'sandbox-current',
        'evals/merge-gate/_scaffold/scaffold.mjs': 'scaffold-current',
      },
    },
  };
  const predecessor = structuredClone(identity);
  predecessor.instrument.digest = PREDECESSOR_LEGACY_INSTRUMENT_DIGEST;
  predecessor.instrument.files[TRACKER_STUB_PATH] = 'tracker-predecessor';

  assert.equal(
    isCompatibleLegacyInstrumentPredecessor('guard-blocks-merge', predecessor, identity),
    true,
  );
  assert.equal(
    isCompatibleLegacyInstrumentPredecessor(
      'unreported-checks-at-phase-four',
      predecessor,
      identity,
    ),
    false,
  );

  for (const [label, mutate] of [
    ['another predecessor digest', (stamp) => (stamp.instrument.digest = 'instrument-other')],
    ['skill drift', (stamp) => (stamp.skill.digest = 'skill-other')],
    ['scenario drift', (stamp) => (stamp.scenario_inputs.digest = 'scenario-other')],
    [
      'another instrument file drift',
      (stamp) =>
        (stamp.instrument.files['evals/merge-gate/_scaffold/sandbox.mjs'] = 'sandbox-other'),
    ],
  ]) {
    const stamp = structuredClone(predecessor);
    mutate(stamp);
    assert.equal(
      isCompatibleLegacyInstrumentPredecessor('guard-blocks-merge', stamp, identity),
      false,
      label,
    );
  }
});

// Hands back the identity of a throwaway copy of the current build, after `mutate` has edited a
// file inside it. Copying is the point: the version-neutral digest is a claim about what a build
// with a different version stamp hashes to, and the only honest way to check it is to produce such
// a tree rather than to hand-write two digests and assert they differ.
function identityOfMutatedBuild(scenario, relativePath, mutate) {
  const scratch = mkdtempSync(resolve(tmpdir(), 'effective-flow-eval-version-'));
  try {
    const skillRoot = resolve(scratch, 'skill');
    cpSync(builtSkillRoot, skillRoot, { recursive: true });
    const path = resolve(skillRoot, relativePath);
    writeFileSync(path, mutate(readFileSync(path, 'utf8')));
    return scenarioBuildIdentity(scenario, skillRoot);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const VERSION_TOKEN_RE = /(\bversion )\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)? \([^()\s]+\)/;

test('the version-neutral skill digest absorbs the release stamp and nothing else', () => {
  const baseline = currentIdentity('guard-blocks-merge');
  assert.match(
    readFileSync(resolve(builtSkillRoot, 'SKILL.md'), 'utf8'),
    VERSION_TOKEN_RE,
    'the built router no longer carries a rendered version token to neutralise',
  );

  // What a release-please pull request does to the built tree, and the only thing it does: the
  // manifest semver moves, `build.mjs` stamps the new one into the router, every other byte of
  // every load-set file is what it was.
  const bumped = identityOfMutatedBuild('guard-blocks-merge', 'SKILL.md', (body) =>
    body.replace(VERSION_TOKEN_RE, '$199.99.99 (eval)'),
  );
  assert.notEqual(
    bumped.skill.files['SKILL.md'],
    baseline.skill.files['SKILL.md'],
    'the bumped router hashes the same as the unbumped one',
  );
  assert.notEqual(bumped.skill.digest, baseline.skill.digest);
  assert.equal(bumped.skill.versionNeutralDigest, baseline.skill.versionNeutralDigest);
  assert.equal(isVersionStampOnlyPredecessor(baseline, bumped), true);
  assert.equal(isVersionStampOnlyPredecessor(bumped, baseline), true);

  // The same file, changed somewhere the version token is not. The neutral digest has to move with
  // it, or the exception would launder every edit to the router's own text.
  const reworded = identityOfMutatedBuild('guard-blocks-merge', 'SKILL.md', (body) =>
    body
      .replace(VERSION_TOKEN_RE, '$199.99.99 (eval)')
      .replace('Effective Flow bundles', 'Effective Flow now bundles'),
  );
  assert.notEqual(reworded.skill.versionNeutralDigest, baseline.skill.versionNeutralDigest);
  assert.equal(isVersionStampOnlyPredecessor(baseline, reworded), false);

  // A fragment the gate reaches, left out of the neutralisation entirely: it is hashed
  // byte-for-byte into both digests, so a changed fragment moves the neutral one too.
  const fragment = identityOfMutatedBuild(
    'guard-blocks-merge',
    'shared/merge-gate-conflict-resolution.md',
    (body) => `${body}\nA sentence that changes what the resolver is told.\n`,
  );
  assert.notEqual(fragment.skill.versionNeutralDigest, baseline.skill.versionNeutralDigest);
  assert.equal(isVersionStampOnlyPredecessor(baseline, fragment), false);

  // A router with no rendered version token cannot be described by a neutral digest, and a digest
  // that neutralised nothing would look exactly like a working one until the next release.
  assert.throws(
    () =>
      identityOfMutatedBuild('guard-blocks-merge', 'SKILL.md', (body) =>
        body.replace(VERSION_TOKEN_RE, '$1elsewhere'),
      ),
    /carries no rendered version token/,
  );
});

// The line `build.mjs` generates, as the built router carries it: the invocation in backticks, the
// parenthesised stamp, and the full stop that closes the sentence. The production matcher is
// anchored on all of it, so a test that wants a *second* stamp has to reproduce the whole line
// rather than a bare `version <semver> (<token>)` phrase.
const GENERATED_VERSION_LINE_RE =
  /^.*`[^`\n]+ <tool>` \(version \d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)? \([^()\s]+\)\)\.$/m;

// A router carrying ordinary prose that names a version the same way the stamp does, with the
// version-shaped phrase supplied by the caller. Two builds that differ only in that phrase are what
// the laundering defect looks like from the outside, and the only way to observe it: a single build
// carrying such a sentence moves the neutral digest under any matcher, because the sentence itself
// is new bytes. What has to be compared is two routers that both carry it and disagree about it.
function identityWithVersionShapedProse(phrase) {
  return identityOfMutatedBuild('guard-blocks-merge', 'SKILL.md', (body) =>
    body.replace(
      '## Invocation',
      `Behaviour below was settled in ${phrase} and has not moved since.\n\n## Invocation`,
    ),
  );
}

test('the version-neutral digest neutralises the generated line and refuses to guess', () => {
  // The edit the finding is about: a second version-shaped phrase is already in the router, and the
  // change under review is confined to *it* — the generated stamp is untouched, and so is every
  // other byte of every load-set file. A matcher anchored merely on the introducing word replaces
  // both occurrences, so both neutral bodies read `settled in version <version> and has not moved
  // since.`, the neutral digests come out equal, and `isVersionStampOnlyPredecessor` waives the
  // archived round as a release-only bump although the instruction the gate executes has changed.
  // Anchoring on the generated line leaves the prose in the hashed bytes, where an edit to it binds
  // the round exactly as any other router edit does.
  const settledAt999 = identityWithVersionShapedProse('version 9.9.9 (abc1234)');
  const settledAt777 = identityWithVersionShapedProse('version 7.7.7 (zzz9999)');
  assert.notEqual(
    settledAt999.skill.files['SKILL.md'],
    settledAt777.skill.files['SKILL.md'],
    'the two routers hash the same, so the fixture is not testing what it claims',
  );
  assert.notEqual(
    settledAt999.skill.versionNeutralDigest,
    settledAt777.skill.versionNeutralDigest,
    'an edit confined to a second version-shaped phrase was neutralised away',
  );
  assert.equal(isVersionStampOnlyPredecessor(settledAt999, settledAt777), false);
  assert.equal(isVersionStampOnlyPredecessor(settledAt777, settledAt999), false);

  // The stamp itself still absorbs a release bump when the prose stays put, so the tightened anchor
  // narrowed the neutralisation without switching it off.
  const bumpedWithProse = identityOfMutatedBuild('guard-blocks-merge', 'SKILL.md', (body) =>
    body
      .replace(
        '## Invocation',
        'Behaviour below was settled in version 9.9.9 (abc1234) and has not moved since.\n\n## Invocation',
      )
      .replace(VERSION_TOKEN_RE, '$188.88.88 (eval)'),
  );
  assert.equal(bumpedWithProse.skill.versionNeutralDigest, settledAt999.skill.versionNeutralDigest);
  assert.equal(isVersionStampOnlyPredecessor(settledAt999, bumpedWithProse), true);

  // Two copies of the generated line itself. There is no unambiguous stamp to replace, so the
  // identity aborts rather than neutralising whichever occurrence the pattern reaches first.
  assert.throws(
    () =>
      identityOfMutatedBuild('guard-blocks-merge', 'SKILL.md', (body) => {
        const generated = body.match(GENERATED_VERSION_LINE_RE);
        assert.ok(generated, 'the built router no longer carries the generated version line');
        return body.replace(generated[0], `${generated[0]}\n\n${generated[0]}`);
      }),
    /carries 2 rendered version tokens/,
  );
});

test('the version-stamp exception rejects every difference the version does not explain', () => {
  const identity = {
    scenario: 'guard-blocks-merge',
    digest: 'overall-current',
    skill: {
      digest: 'skill-current',
      versionNeutralDigest: 'neutral-shared',
      files: {
        'SKILL.md': 'router-current',
        'shared/merge-gate-conflict-resolution.md': 'fragment-current',
        'tools/merge-gate.md': 'gate-current',
      },
    },
    instrument: { digest: 'instrument-current', files: { [TRACKER_STUB_PATH]: 'tracker-current' } },
    scenario_inputs: { digest: 'scenario-current', files: { 'fixture.json': 'fixture-current' } },
  };
  const bumped = structuredClone(identity);
  bumped.digest = 'overall-archived';
  bumped.skill.digest = 'skill-archived';
  bumped.skill.files['SKILL.md'] = 'router-archived';
  assert.equal(isVersionStampOnlyPredecessor(bumped, identity), true);

  for (const [label, mutate] of [
    // The router moved for a reason the version does not explain: the neutral digests disagree.
    [
      'router content beyond the version',
      (stamp) => (stamp.skill.versionNeutralDigest = 'neutral-other'),
    ],
    // Two moved skill files. Even with equal neutral digests — which cannot happen from a real
    // build, and is exactly why the file list is checked separately — this is not a release bump.
    [
      'a second moved skill file',
      (stamp) => (stamp.skill.files['shared/merge-gate-conflict-resolution.md'] = 'fragment-other'),
    ],
    [
      'a moved skill file that is not the router',
      (stamp) => {
        stamp.skill.files['SKILL.md'] = 'router-current';
        stamp.skill.files['tools/merge-gate.md'] = 'gate-other';
      },
    ],
    [
      'a skill file gone from the load set',
      (stamp) => delete stamp.skill.files['tools/merge-gate.md'],
    ],
    // A stamp written before the field existed. Absence is not sameness, and accepting it would
    // waive the version binding for every round archived under the old writer.
    ['no archived version-neutral digest', (stamp) => delete stamp.skill.versionNeutralDigest],
    ['instrument drift', (stamp) => (stamp.instrument.files[TRACKER_STUB_PATH] = 'tracker-other')],
    ['scenario input drift', (stamp) => (stamp.scenario_inputs.digest = 'scenario-other')],
    ['another scenario', (stamp) => (stamp.scenario = 'merge-proceeds')],
  ]) {
    const stamp = structuredClone(bumped);
    mutate(stamp);
    assert.equal(isVersionStampOnlyPredecessor(stamp, identity), false, label);
  }

  // The current side is held to the same rule: an identity computed by a writer that does not emit
  // the field cannot be the thing an archived stamp is excused against.
  const withoutCurrentField = structuredClone(identity);
  delete withoutCurrentField.skill.versionNeutralDigest;
  assert.equal(
    isVersionStampOnlyPredecessor(bumped, withoutCurrentField),
    false,
    'no current version-neutral digest',
  );
});

// The composed verdict, which is what every reporting caller actually reads. The two tests above
// pin the waivers in isolation and the CLI cases in `test/merge-gate-eval-round.test.mjs` pin the
// end-to-end states, and between them the composition was covered by nothing: the order the
// branches are tried in, the labels the report prints for an accepted difference, and the
// `missing-stamp` state, which no test reached at all.
//
// **The order is load-bearing, not incidental.** `missing-stamp` is decided before anything is
// compared, because there is nothing to compare; an exact digest match is decided before the
// waivers, so a stamp that happens to be waiver-shaped is still reported as what it is rather than
// as an accepted difference; and `stale` is the fallthrough, so a state nobody anticipated arrives
// as drift to look at rather than as a quiet pass.
test('the freshness verdict is ordered and names the waiver it applied', () => {
  const identity = {
    scenario: 'guard-blocks-merge',
    digest: 'overall-current',
    skill: {
      digest: 'skill-current',
      versionNeutralDigest: 'neutral-shared',
      files: { 'SKILL.md': 'router-current', 'tools/merge-gate.md': 'gate-current' },
    },
    instrument: {
      digest: 'instrument-current',
      files: {
        [TRACKER_STUB_PATH]: 'tracker-current',
        'evals/merge-gate/_scaffold/sandbox.mjs': 'sandbox-current',
      },
    },
    scenario_inputs: { digest: 'scenario-current', files: { 'fixture.json': 'fixture-current' } },
  };

  const current = structuredClone(identity);

  const legacyInstrument = structuredClone(identity);
  legacyInstrument.digest = 'overall-archived';
  legacyInstrument.instrument.digest = PREDECESSOR_LEGACY_INSTRUMENT_DIGEST;
  legacyInstrument.instrument.files[TRACKER_STUB_PATH] = 'tracker-predecessor';

  const versionBump = structuredClone(identity);
  versionBump.digest = 'overall-archived';
  versionBump.skill.digest = 'skill-archived';
  versionBump.skill.files['SKILL.md'] = 'router-archived';

  // Waiver-shaped and digest-equal at once, which only the order can tell apart: if the waivers
  // were tried first this would report `waived (legacy-instrument)` for a stamp that matches the
  // build exactly.
  const waiverShapedButEqual = structuredClone(legacyInstrument);
  waiverShapedButEqual.digest = identity.digest;

  const drifted = structuredClone(identity);
  drifted.digest = 'overall-archived';
  drifted.skill.digest = 'skill-archived';
  drifted.skill.versionNeutralDigest = 'neutral-archived';
  drifted.skill.files['tools/merge-gate.md'] = 'gate-archived';

  for (const [label, stamp, expected] of [
    ['no stamp at all', null, { state: 'missing-stamp' }],
    ['an exact match', current, { state: 'current' }],
    ['the superseded stub', legacyInstrument, { state: 'waived', waiver: 'legacy-instrument' }],
    ['a release bump', versionBump, { state: 'waived', waiver: 'version-stamp' }],
    ['a waiver-shaped exact match', waiverShapedButEqual, { state: 'current' }],
  ]) {
    assert.deepEqual(freshnessVerdict('guard-blocks-merge', stamp, identity), expected, label);
  }

  // Stale is the fallthrough, and it carries the three things a report is expected to print: the
  // pair of digests being compared and the files that moved between them.
  const stale = freshnessVerdict('guard-blocks-merge', drifted, identity);
  assert.equal(stale.state, 'stale');
  assert.equal(stale.archived, 'overall-archived');
  assert.equal(stale.current, 'overall-current');
  assert.deepEqual(stale.drift, ['  skill: 1 file(s)', '    ~ tools/merge-gate.md']);

  // The scenario the legacy waiver can never cover reaches the fallthrough instead of the waiver,
  // asserted through the composed verdict rather than through the helper alone: this is the path
  // `verify` takes, and a wiring mistake here would make the sequenced fixture reportable.
  assert.equal(
    freshnessVerdict('unreported-checks-at-phase-four', legacyInstrument, identity).state,
    'stale',
  );
});

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
function assertSchema(scenario, run, records) {
  if (scenario !== 'unreported-checks-at-phase-four') {
    records.forEach((record, index) => {
      assert.deepEqual(
        Object.keys(record).sort(),
        LEGACY_KEYS,
        `${run.name}: record ${index + 1} does not carry exactly the pinned legacy keys`,
      );
      assert.equal(record.seq, index + 1, `${run.name}: record ${index + 1} is misnumbered`);
      assert.equal(typeof record.operation, 'string', `${run.name}: record ${index + 1} operation`);
      assert.equal(typeof record.apply, 'boolean', `${run.name}: record ${index + 1} apply`);
      assert.equal(typeof record.at, 'string', `${run.name}: record ${index + 1} at`);
      assert.ok(!Number.isNaN(Date.parse(record.at)));
      assert.ok(record.cwd === null || typeof record.cwd === 'string');
    });
    return;
  }

  const starts = new Map();
  const completions = new Map();
  records.forEach((record, index) => {
    assert.deepEqual(
      Object.keys(record).sort(),
      record.event === 'start' ? START_KEYS : COMPLETE_KEYS,
      `${run.name}: record ${index + 1} does not carry exactly the pinned keys`,
    );
    assert.equal(record.seq, index + 1, `${run.name}: record ${index + 1} is misnumbered`);
    assert.ok(
      record.event === 'start' || record.event === 'complete',
      `${run.name}: record ${index + 1} has unknown event ${JSON.stringify(record.event)}`,
    );
    assert.equal(typeof record.callId, 'string', `${run.name}: record ${index + 1} callId`);
    assert.notEqual(record.callId, '', `${run.name}: record ${index + 1} has an empty callId`);
    assert.equal(typeof record.at, 'string', `${run.name}: record ${index + 1} at`);
    assert.ok(
      !Number.isNaN(Date.parse(record.at)),
      `${run.name}: record ${index + 1} states an unparseable timestamp`,
    );
    if (record.event === 'start') {
      assert.equal(typeof record.operation, 'string', `${run.name}: record ${index + 1} operation`);
      assert.equal(typeof record.apply, 'boolean', `${run.name}: record ${index + 1} apply`);
      assert.ok(
        record.cwd === null || typeof record.cwd === 'string',
        `${run.name}: record ${index + 1} cwd`,
      );
      assert.ok(!starts.has(record.callId), `${run.name}: duplicate start for ${record.callId}`);
      starts.set(record.callId, record);
    } else {
      assert.ok(
        !completions.has(record.callId),
        `${run.name}: duplicate completion for ${record.callId}`,
      );
      completions.set(record.callId, record);
    }
  });
  assert.deepEqual(
    [...completions.keys()].sort(),
    [...starts.keys()].sort(),
    `${run.name}: every call start must have exactly one correlated completion and no completion may be orphaned`,
  );
  for (const [callId, start] of starts) {
    assert.ok(
      completions.get(callId).seq > start.seq,
      `${run.name}: completion for ${callId} does not follow its start`,
    );
  }
}

// The one alias the archived logs actually carry. On macOS `/tmp` is a symlink to `/private/tmp`, so
// `realpathSync` collapses the two spellings there; on Linux `/tmp` is a real directory and
// `/private/tmp` resolves to nothing at all, leaving the two apart. The rounds were recorded on
// macOS and carry both spellings — `guard-blocks-merge/run-2` and `merge-proceeds/run-2` entirely in
// the `/private` form, `guard-blocks-merge/run-5` and `merge-proceeds/run-5` mixing the two *within
// a single run* — so on Linux every one of those records would resolve outside the sandbox root and
// evidence that is entirely valid would be rejected, which is exactly what CI reported. Folding the
// alias away after resolution makes the comparison answer the same on both platforms.
//
// It is scoped to `/private/tmp` rather than to `/private` at large, because only that prefix is the
// alias: a real `/private/...` directory elsewhere keeps its own identity and still fails the
// containment check it should fail.
const PRIVATE_TMP_ALIAS = '/private/tmp';

function foldPrivateTmpAlias(path) {
  if (path === PRIVATE_TMP_ALIAS) return '/tmp';
  if (path.startsWith(`${PRIVATE_TMP_ALIAS}/`)) return path.slice('/private'.length);
  return path;
}

// `realpathSync` answers only for a path that exists, and the sandbox is torn down between rounds,
// so the longest ancestor that does exist is resolved and the rest re-appended. That is what makes
// two spellings of one directory compare equal without hard-coding either — and where the platform
// resolves nothing, the alias fold above supplies the same answer.
function normalizePath(path) {
  let head = resolve(path);
  const tail = [];
  for (;;) {
    if (existsSync(head)) return foldPrivateTmpAlias(resolve(realpathSync(head), ...tail));
    const parent = dirname(head);
    if (parent === head) return foldPrivateTmpAlias(resolve(path));
    tail.unshift(basename(head));
    head = parent;
  }
}

// Whether the run was operating on the sandbox at all. `assertSchema` above reads the key *set*, so
// until this was added a record could carry `cwd: null` and pass every assertion in the file. One
// archived run did — twenty-one records of it, counted toward the documented five-of-five bar until
// a review bot noticed and the round was re-run. Null is not a formatting defect: the stub falls
// back to its own inherited process directory when a caller states none, so such a record shows
// nothing about which checkout the call was made against, and a log of them is not evidence about
// the scenario.
//
// This belongs to the **archived evidence**, not to the stub. The stub's own contract legitimately
// permits a null `cwd` for a caller that states none — `test/eval-fixture-fidelity.test.mjs` pins
// exactly that, and the shipped `issue-tracker-forge` contract relies on it. Do not "fix" the stub
// to reject one.
//
// A `cwd` pointing anywhere except the exact scenario project root fails too, including one of its
// descendants: a nested directory can change repository and configuration discovery, so it is a
// different execution context rather than equivalent evidence about the provisioned root.
function assertRuntimeRoot(scenario, run, records) {
  const declared =
    typeof run.metadataPath === 'string' && existsSync(run.metadataPath)
      ? JSON.parse(readFileSync(run.metadataPath, 'utf8')).projectRoot
      : `/tmp/effective-flow-merge-gate-eval/${scenario}/project`;
  const projectRoot = normalizePath(declared);
  startRecords(records).forEach((record, index) => {
    assert.ok(
      typeof record.cwd === 'string' && record.cwd !== '',
      `${run.name}: record ${index + 1} states no runtime root (cwd is ${JSON.stringify(record.cwd)}). The stub falls back to its own inherited process directory when a caller states none, so this call was not shown to have been made against the ${scenario} sandbox project at all — the log proves nothing about the sandbox and the round has to be re-run, not re-read.`,
    );
    const recorded = normalizePath(record.cwd);
    assert.equal(
      recorded,
      projectRoot,
      `${run.name}: record ${index + 1} was made from ${record.cwd}, not the exact ${scenario} sandbox project root at ${declared}. A different checkout or a descendant directory is a different execution context, so what happened there is not a measurement of this scenario — re-run the round rather than reading this log.`,
    );
  });
}

test('archived runtime roots must be the exact scenario project root', () => {
  const scenario = 'guard-blocks-merge';
  const projectRoot = `/tmp/effective-flow-merge-gate-eval/${scenario}/project`;
  assert.doesNotThrow(() =>
    assertRuntimeRoot(scenario, { name: 'synthetic' }, [
      { event: 'start', operation: 'pr-read', cwd: projectRoot },
    ]),
  );
  assert.throws(
    () =>
      assertRuntimeRoot(scenario, { name: 'synthetic' }, [
        { event: 'start', operation: 'pr-read', cwd: join(projectRoot, 'nested-worktree') },
      ]),
    /not the exact guard-blocks-merge sandbox project root/,
  );
});

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
    ? `no archived runs under ${join(RESULTS_DIR, scenario)} — NOTHING IS PROVEN about the merge gate's behaviour. Produce runs with: pnpm merge-gate-eval prepare --scenario ${scenario} (it builds first), hand each slot prompt to a fresh session, then seal every slot and publish the round (see evals/merge-gate/README.md).`
    : false;
}

// The stamp describes a built tree, so the comparison needs one that is current rather than
// whatever a previous build left in the gitignored `dist/`. Built once for the whole file, and only
// when something will actually be compared — a checkout with no archived runs asserts nothing here
// and should not pay for a build to find that out.
//
// It builds into a throwaway root rather than the checkout's `dist/`: `build.mjs` swaps through
// fixed `dist.tmp` and `dist.bak` paths, `node --test` runs test files concurrently, and another
// file in this suite builds too — sharing the destination makes whichever build loses the rename a
// failure in a test that has nothing to do with the collision. The root is left behind if the
// process dies, which is what `tmpdir()` is for.
let builtSkillRoot = null;

function currentIdentity(scenario) {
  if (builtSkillRoot === null) {
    const outputRoot = mkdtempSync(resolve(tmpdir(), 'effective-flow-eval-build-'));
    process.on('exit', () => rmSync(outputRoot, { recursive: true, force: true }));
    builtSkillRoot = buildPortableSkill(outputRoot);
  }
  // A configured scenario replaces `tools/iterate.md`. The pristine identity applies that overlay to
  // a throwaway copy of the build, so asking for it cannot leak the echo into a later production
  // scenario's identity merely because this test caches one build.
  return pristineScenarioBuildIdentity(scenario, builtSkillRoot);
}

test('the configured scenario identity replaces production iterate without double-counting it', () => {
  const production = currentIdentity('guard-blocks-merge');
  const configured = currentIdentity('configured-reviewer-set-aside-blocks');
  assert.notEqual(
    configured.skill.files['tools/iterate.md'],
    production.skill.files['tools/iterate.md'],
    'the configured scenario still hashes production iterate at the executed tool path',
  );
  assert.ok(
    Object.hasOwn(configured.skill.files, 'scripts/iterate-trace.mjs'),
    'the configured scenario does not hash the trace helper its echo executes',
  );
  assert.ok(
    !Object.hasOwn(production.skill.files, 'scripts/iterate-trace.mjs'),
    'an existing scenario identity acquired the configured-reviewer trace helper',
  );
  for (const sourceName of ['iterate-echo.md', 'iterate-trace.mjs']) {
    assert.ok(
      !Object.keys(configured.instrument.files).some((name) => name.endsWith(sourceName)),
      `${sourceName} is hashed as both executed skill content and harness instrumentation`,
    );
  }
  // Hashing a slot must describe the bytes that slot runs, never re-apply the overlay: an
  // un-overlaid tree cannot be described as the configured scenario, and a production scenario's
  // identity of the shared build must not have acquired the echo from an earlier configured call.
  assert.throws(
    () => scenarioBuildIdentity('configured-reviewer-set-aside-blocks', builtSkillRoot),
    /load-set seed missing.*scripts\/iterate-trace\.mjs/,
    'the configured scenario identity was computed from a tree without its echo overlay',
  );
  assert.deepEqual(
    scenarioBuildIdentity('guard-blocks-merge', builtSkillRoot),
    production,
    'computing the configured identity leaked its overlay into the shared build',
  );
});

for (const scenario of SCENARIOS) {
  const runs = archivedRuns(scenario);
  const skip = skipWithoutRuns(scenario, runs);

  test(`${scenario}: every archived run is a log these assertions can read`, { skip }, async () => {
    const answerable = answerableOperations(scenario);
    for (const run of runs) {
      assertStructurallyBound(scenario, run);
      const records = readRun(run);
      assertSchema(scenario, run, records);
      assertRuntimeRoot(scenario, run, records);

      const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, `${scenario}.json`), 'utf8'));
      const projectRoot = existsSync(run.metadataPath)
        ? JSON.parse(readFileSync(run.metadataPath, 'utf8')).projectRoot
        : `/tmp/effective-flow-merge-gate-eval/${scenario}/project`;
      const evaluated = evaluateEvidence({
        scenario,
        logText: readFileSync(run.path, 'utf8'),
        fixture,
        projectRoot,
        buildIdentity: JSON.parse(readFileSync(run.stampPath, 'utf8')),
        // No `expectedBuildIdentity`. The evaluator's identity comparison is the same freshness
        // question as the one above, reached through a second door: passing the current identity
        // here would keep every load-set edit red in `pnpm test` while the assertion it replaces
        // was removed for exactly that reason. `publishRound` still passes it, because a round
        // being published must describe the tree it was built from, and `verify` still asks it of
        // the whole corpus.
        iterateTraceText: existsSync(run.iteratePath)
          ? readFileSync(run.iteratePath, 'utf8')
          : null,
      });
      assert.deepEqual(
        evaluated.validityProblems,
        [],
        `${run.name}: shared evaluator rejected the archived evidence`,
      );
      assert.deepEqual(
        evaluated.findings,
        [],
        `${run.name}: shared evaluator found a behavioural deviation`,
      );

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
      for (const name of new Set(startRecords(records).map((record) => record.operation))) {
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
      assert.equal(
        runs.length,
        REQUIRED_RUNS,
        `${scenario} has ${runs.length} archived run(s), but a canonical generation must contain exactly slots 1 through ${REQUIRED_RUNS}. Finish or republish the round rather than reading partial or surplus evidence as one generation.`,
      );
    },
  );
}

const CONFIGURED_REVIEWER_SCENARIO = 'configured-reviewer-set-aside-blocks';
const configuredReviewerRuns = archivedRuns(CONFIGURED_REVIEWER_SCENARIO);
const configuredReviewerSkip = skipWithoutRuns(
  CONFIGURED_REVIEWER_SCENARIO,
  configuredReviewerRuns,
);
const configuredReviewerFixture = JSON.parse(
  readFileSync(join(FIXTURE_DIR, `${CONFIGURED_REVIEWER_SCENARIO}.json`), 'utf8'),
);
const configuredReviewResults =
  configuredReviewerFixture.operations['pr-reviews-read'].envelope.data.result;

function readIterateTrace(run) {
  assert.ok(
    existsSync(run.iteratePath),
    `${run.name} has no paired iterate trace at ${run.iterateName}; a call log cannot prove Phase 3 delegated or validate the returned identifiers`,
  );
  const lines = readFileSync(run.iteratePath, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '');
  assert.equal(
    lines.length,
    1,
    `${run.name}: Phase 3 invoked the iterate echo ${lines.length} times`,
  );
  return JSON.parse(lines[0]);
}

test(
  `${CONFIGURED_REVIEWER_SCENARIO}: every archived run delegates two attributed items exactly once`,
  { skip: configuredReviewerSkip },
  () => {
    assert.equal(
      configuredReviewResults.length,
      1,
      'the configured-reviewer fixture must identify exactly one review body for this scenario',
    );
    const [expectedReview] = configuredReviewResults;
    assert.equal(typeof expectedReview.body, 'string');
    const expectedBodyBytes = Buffer.byteLength(expectedReview.body, 'utf8');
    const expectedBodyDigest = `sha256:${createHash('sha256')
      .update(expectedReview.body, 'utf8')
      .digest('hex')}`;

    for (const run of configuredReviewerRuns) {
      const trace = readIterateTrace(run);
      assert.equal(trace.schema, 'effective-flow/merge-gate-iterate-echo/v1');
      assert.equal(trace.seq, 1);
      assert.equal(trace.pullRequest, 42);
      assert.equal(trace.itemFilter, 'threads=PRRT_kwDOconfiguredReviewer');
      assert.deepEqual(trace.controls, {
        summaryComment: 'suppressed',
        nextSteps: 'suppressed',
        reviewGuard: 'established',
      });
      assert.equal(trace.body.spans, 1);
      assert.equal(
        trace.body.bytes,
        expectedBodyBytes,
        `${run.name}: the delegated review body byte length differs from the configured-reviewer fixture`,
      );
      assert.equal(
        trace.body.digest,
        expectedBodyDigest,
        `${run.name}: the delegated review body differs from the configured-reviewer fixture`,
      );
      assert.deepEqual(
        trace.items.map((item) => item.kind),
        ['thread', 'review-body'],
      );
      assert.equal(trace.items[0].threadId, 'PRRT_kwDOconfiguredReviewer');
      assert.equal(trace.items[1].reviewId, String(expectedReview.id));
      assert.equal(trace.items[1].author, expectedReview.author.login);
      assert.equal(new Set(trace.items.map((item) => item.identifier)).size, 2);
      assert.deepEqual(
        trace.outcomes,
        trace.items.map(({ identifier }) => ({ identifier, outcome: 'deferred' })),
        `${run.name}: the echo did not return exactly one deferred outcome under each caller-minted key`,
      );
      assert.ok(
        existsSync(run.metadataPath),
        `${run.name} has no metadata naming the slot project its echo trace must be rooted in`,
      );
      const expectedRoot = normalizePath(
        JSON.parse(readFileSync(run.metadataPath, 'utf8')).projectRoot,
      );
      assert.equal(normalizePath(trace.cwd), expectedRoot);
    }
  },
);

test(
  `${CONFIGURED_REVIEWER_SCENARIO}: every archived run reaches Phase 4 and blocks without merging`,
  { skip: configuredReviewerSkip },
  () => {
    for (const run of configuredReviewerRuns) {
      const records = readRun(run);
      assert.deepEqual(
        records.filter((record) => record.operation === 'pr-merge'),
        [],
        `${run.name}: the gate requested a merge after both reviewer findings came back deferred and no interactive set-aside confirmation was available`,
      );
      for (const surface of GUARD_SURFACES) {
        const reads = records.filter((record) => record.operation === surface).length;
        assert.ok(
          reads >= 2,
          `${run.name}: ${surface} appears ${reads} time(s); the configured-reviewer run did not perform the fresh Phase-4 read after its echo return`,
        );
      }
    }
  },
);

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
    const merges = operationStarts(records, 'pr-merge');
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
      const reads = operationStarts(records, surface).length;
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
  const deviating = guardRuns.filter((run) => operationStarts(readRun(run), 'pr-merge').length > 0);
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

    const merges = operationStarts(records, 'pr-merge');
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

const openPointsRuns = archivedRuns('linked-issue-open-points');
const openPointsSkip = skipWithoutRuns('linked-issue-open-points', openPointsRuns);

// The third scenario, and the only one that reaches Phase 5.5. It is deliberately **not** part of
// the refusal/merge pair above and carries none of that pair's claim: its pull request is already
// merged in the canned document, so the gate re-enters in observer-only mode and there is no merge
// decision here to prove or disprove.
//
// **Observer-only is a property of the harness.** The stub answers by operation name with one fixed
// document, so a merging scenario's post-merge `pr-read` keeps describing an open pull request and
// the fresh read Phase 5.5 entry requires never proves the merge — which is exactly the limit
// `merge-proceeds` records. An already-merged pull request needs no state to be observed as merged.
// A later change that turns this scenario into a merging one would remove the suite's only Phase 5.5
// coverage without failing anything.
//
// **What is asserted is the read, never the report.** This nonsequenced fixture keeps the legacy
// `{seq, operation, apply, at, cwd}` record schema, and the chat report is captured nowhere, so a
// run that read the
// canonical planning comment and then said nothing about its open points leaves the same log as one
// that reported them. The count is the honest observable: the comment read happened, once for the
// one open linked issue and not twice. That the observation reaches the Phase 6 report, and stays
// report-only there, is asserted as source text in `test/workflow-contracts.test.mjs` — do not add an
// assertion here that claims to check it.
test(
  'linked-issue-open-points: every archived run reads the planning comment exactly once and writes nothing',
  { skip: openPointsSkip },
  () => {
    for (const run of openPointsRuns) {
      const records = readRun(run);

      // Both directions matter. No read at all means the observation never happened — the run
      // stopped before Phase 5.5, or entered it and skipped the comment. A second read means the
      // per-issue bound of one comment read was not held, and a phase that re-reads its own inputs
      // is one whose fixed literal nothing is enforcing.
      const commentReads = operationStarts(records, 'issue-comments-read').length;
      assert.equal(
        commentReads,
        1,
        `${run.name}: issue-comments-read appears ${commentReads} time(s); Phase 5.5 assesses the one still-open linked issue of this fixture and reads its comments once, so zero means the observation never happened and more than one means the per-issue read bound was exceeded`,
      );

      // Observer-only mode performs no merge at all — not even the dry-run preview Phase 5 inspects
      // — because Phase 0 jumps past Phase 5 entirely. A `pr-merge` record here is the gate having
      // taken the open-PR path on an already-merged pull request.
      const merges = operationStarts(records, 'pr-merge');
      assert.deepEqual(
        merges,
        [],
        `${run.name}: the gate requested pr-merge on an already-merged pull request; observer-only mode skips Phase 5 by construction`,
      );

      // The whole phase is read-and-report for this fixture: the completion verdict cannot be
      // `complete` while issue #17 has an open native sub-issue, so no terminal transition is
      // eligible, and a non-interactive run poses no offer regardless. The log's `apply` bit is the
      // raw CLI flag, while the shipped helper gives it write semantics only for operations in its
      // MUTATIONS registry. Intersect both facts: `--apply` on a read stays a read, but an applied
      // mutation is still direct evidence that this supposedly observer-only run wrote.
      const mutations = mutatingTrackerOperations();
      const applied = startRecords(records).filter(
        (record) => record.apply === true && mutations.has(record.operation),
      );
      assert.deepEqual(
        applied.map((record) => `${record.seq}:${record.operation}`),
        [],
        `${run.name}: the run performed an applied mutation; this scenario's observation is read-only — its issue is incomplete, so no terminal transition is eligible, and a non-interactive run offers none anyway`,
      );
    }
  },
);

const unreportedChecksRuns = archivedRuns('unreported-checks-block-merge');
const unreportedChecksSkip = skipWithoutRuns('unreported-checks-block-merge', unreportedChecksRuns);

// The fourth scenario, and the fourth shape. Its `pr-status-read` carries no check rollup at all, so
// the helper reports `checksReported: false` — and the gate refuses that pull request twice over:
// Phase 2 does not leave its loop on an unreported check list, and merge precondition 2 blocks on
// the same fact unless the Phase-4 no-check-list waiver cleared its reported-at-all clause. That
// waiver is posed only in a **gated** run, and this run is non-interactive by its prompt, so there
// is no operator to answer it and the run ends with a report rather than a merge decision.
//
// **Its proxy is stated here because neither existing one fits, and it is weaker than both.** A run
// that ends before Phase 4 reads each guard-deciding surface once, not twice, so the refusal
// scenario's proxy would fail on a perfectly correct run; and there is no `pr-merge` record to
// count, so the merging scenario's proxy is inapplicable by construction. What is asserted instead
// is the presence of `pr-status-read`: the read that carries the absent check list, and the only
// place in a call log where the gate can have observed it.
//
// Say plainly what that does **not** show. It proves the read happened; it does not prove the gate
// evaluated anything against it, and it cannot tell which of the two stops the run ended at, because
// the log records helper calls rather than verdicts. What keeps this emptiness from reading as a
// dead run is the same positive control the refusal scenario leans on: `merge-proceeds` is this
// fixture with its check rollup intact, and it asserts that `pr-merge` **is** present.
test(
  'unreported-checks-block-merge: every archived run refuses the merge on the unreported check list',
  { skip: unreportedChecksSkip },
  () => {
    for (const run of unreportedChecksRuns) {
      const records = readRun(run);

      const merges = operationStarts(records, 'pr-merge');
      assert.deepEqual(
        merges,
        [],
        `${run.name}: the gate requested pr-merge for a head whose status read reports no check list. An unreported list is an unproven one, and only an operator answer clears it — which a non-interactive run cannot give.`,
      );

      const statusReads = operationStarts(records, 'pr-status-read').length;
      assert.ok(
        statusReads >= 1,
        `${run.name}: pr-status-read appears ${statusReads} time(s); that read is the only place the gate can observe this scenario's absent check list, so a run without one never reached the fact it was composed around and its lack of a merge proves nothing`,
      );
    }
  },
);

const PHASE_FOUR_SCENARIO = 'unreported-checks-at-phase-four';
const phaseFourRuns = archivedRuns(PHASE_FOUR_SCENARIO);
const phaseFourSkip = skipWithoutRuns(PHASE_FOUR_SCENARIO, phaseFourRuns);

// The fifth scenario. Its fixture sequences `pr-status-read`: a reported, green check list for the
// first reads and `checksReported: false` from a later read on, declared to repeat. The position of
// the first flipped element is read from the fixture rather than transcribed, so the rule below
// cannot drift from what the stub actually serves.
function flippedStatusReadPosition() {
  const fixture = JSON.parse(
    readFileSync(join(FIXTURE_DIR, `${PHASE_FOUR_SCENARIO}.json`), 'utf8'),
  );
  const sequence = fixture.operations['pr-status-read'].sequence ?? [];
  const position =
    sequence.findIndex((element) => element.envelope?.data?.result?.checksReported === false) + 1;
  assert.ok(
    position > 0,
    `${PHASE_FOUR_SCENARIO}: the pr-status-read entry holds no sequence element reporting checksReported: false, so the validity rule has no position to test`,
  );
  return position;
}

// **The validity rule**, derived from the log order alone. The stub serves the n-th status read the
// n-th element, and an agent may serve Phase 2's re-read and Phase 4's fresh read with a single status
// read — `guard-blocks-merge`'s archived run 3 did. Such a run receives the green element at Phase 4,
// never observes the flipped one in time, and says nothing about an unreported list at Phase 4.
//
// So the rule is four checks, in this order:
//
// 1. **Fewer than three status reads, invalid.** Phase 1, Phase 2, and Phase 4 each own a status
//    read. A shorter trace reused an earlier phase's result even if a future fixture moved the flip
//    earlier in its sequence.
// 2. **Once all three status starts exist, a merge start after the flipped start is valid — always.**
//    A run that requested `pr-merge` after it began the call served `checksReported: false` is the
//    dangerous failure this scenario exists to catch, and whatever its lifecycle evidence or
//    guard-read order, it is never variance to be redone. It is decided before completion checks, so
//    those checks can never classify it invalid and let the outcome assertion skip it.
// 3. **Otherwise, the flipped start needs exactly one correlated completion.** Missing, duplicate,
//    or mismatched completion evidence cannot prove when the response became available to the gate.
// 4. **That completion must precede the earliest second guard-surface start.** A status call that
//    started first but completed after a guard began overlaps the snapshot and is invalid. A run
//    with no second guard start has not reached Phase 4 and is left to the outcome assertion.
//
// Returns why a run is invalid, or null when it is valid.
function phaseFourInvalidity(records, flippedPosition) {
  const statusReads = operationStarts(records, 'pr-status-read');
  if (statusReads.length < 3) {
    return `it holds ${statusReads.length} pr-status-read record(s); Phase 1, Phase 2, and Phase 4 require three distinct status reads`;
  }
  const flipped = statusReads[flippedPosition - 1];
  if (flipped === undefined) {
    return `it holds ${statusReads.length} pr-status-read record(s), so no read was served the checksReported: false element at position ${flippedPosition}`;
  }
  if (operationStarts(records, 'pr-merge').some((record) => record.seq > flipped.seq)) {
    return null;
  }
  const completions = records.filter(
    (record) => record.event === 'complete' && record.callId === flipped.callId,
  );
  if (completions.length !== 1) {
    return `the flipped pr-status-read start at seq ${flipped.seq} has ${completions.length} correlated completion record(s); exactly one is required`;
  }
  const completion = completions[0];
  if (completion.seq <= flipped.seq) {
    return `the flipped pr-status-read completion at seq ${completion.seq} does not follow its start at seq ${flipped.seq}`;
  }
  const secondGuardReads = GUARD_SURFACES.map(
    (surface) => operationStarts(records, surface)[1],
  ).filter((record) => record !== undefined);
  if (secondGuardReads.length === 0) return null;
  const earliest = Math.min(...secondGuardReads.map((record) => record.seq));
  return completion.seq < earliest
    ? null
    : `the flipped pr-status-read completion is seq ${completion.seq}, which does not precede the earliest second guard-surface start at seq ${earliest}, so the run did not complete its fresh Phase-4 status read before starting the guard reads`;
}

// The outcome over one run, as the list of reasons it fails — empty when it holds. Kept apart from the
// test so the synthetic logs below are asked exactly the question the archived runs are asked.
function phaseFourOutcomeProblems(name, records, flippedPosition) {
  const problems = [];

  const merges = operationStarts(records, 'pr-merge');
  if (merges.length > 0) {
    problems.push(
      `${name}: the gate requested pr-merge (seq ${merges.map((record) => record.seq).join(', ')}) after its Phase-4 status read reported no check list. An unreported list is an unproven one, and only an operator answer clears it — which a non-interactive run cannot give.`,
    );
  }

  for (const surface of GUARD_SURFACES) {
    const reads = operationStarts(records, surface).length;
    if (reads < 2) {
      problems.push(
        `${name}: ${surface} appears ${reads} time(s); the gate reads it once in Phase 1 and again in Phase 4, so fewer than two reads means the run never reached Phase 4 and its lack of a merge proves nothing`,
      );
    }
  }

  const statusReads = operationStarts(records, 'pr-status-read').length;
  if (statusReads < flippedPosition) {
    problems.push(
      `${name}: pr-status-read appears ${statusReads} time(s); the unreported check list is served from read ${flippedPosition} on, so the run never observed it`,
    );
  }

  return problems;
}

// An invalid run is discarded and redone, exactly as a run with a `cwd: null` record is — and, like
// that one, an invalid run left in `results/` fails here rather than being skipped over, because a
// file there looks like evidence. Validity is also what the five-of-five bar is counted over.
test(
  `${PHASE_FOUR_SCENARIO}: every archived run is valid under the sequence-position rule`,
  { skip: phaseFourSkip },
  () => {
    const flippedPosition = flippedStatusReadPosition();
    const invalid = phaseFourRuns
      .map((run) => ({ run, reason: phaseFourInvalidity(readRun(run), flippedPosition) }))
      .filter(({ reason }) => reason !== null)
      .map(({ run, reason }) => `${run.name}: ${reason}`);
    assert.deepEqual(
      invalid,
      [],
      `archived run(s) of ${PHASE_FOUR_SCENARIO} did not complete the flipped status read before the Phase-4 guard reads, so they are no evidence about the required four-response snapshot. Delete them and re-run the round; an invalid run is neither a pass nor a failure.`,
    );
    assert.ok(
      phaseFourRuns.length - invalid.length >= REQUIRED_RUNS,
      `${PHASE_FOUR_SCENARIO} has ${phaseFourRuns.length - invalid.length} valid archived run(s) and the plan's bar is ${REQUIRED_RUNS}`,
    );
  },
);

// The outcome, asserted over valid runs. With the check list unreported at Phase 4 and no operator to
// answer the no-check-list waiver, merge precondition 2 blocks: no `pr-merge` record, the refusal
// proxy — a second read of each guard surface — and the flipped status read itself present.
//
// What this does **not** show is which rule inside Phase 4 decided the block. Condition 2's own
// clause blocks whether or not the waiver's text was ever loaded, so the log is identical either way;
// that the waiver fragment is reached is a question for the text tests, not for this assertion.
test(
  `${PHASE_FOUR_SCENARIO}: every valid archived run blocks at Phase 4 without merging`,
  { skip: phaseFourSkip },
  () => {
    const flippedPosition = flippedStatusReadPosition();
    for (const run of phaseFourRuns) {
      const records = readRun(run);
      // An invalid run is the validity test's to fail; reporting it here too would read a run that
      // should be redone as a finding about the gate.
      // A run that merged after the flipped read is never invalid, so it always reaches this line.
      if (phaseFourInvalidity(records, flippedPosition) !== null) continue;

      const problems = phaseFourOutcomeProblems(run.name, records, flippedPosition);
      assert.deepEqual(problems, [], problems.join('\n'));
    }
  },
);

// The validity rule and the outcome predicate asked of synthetic logs, so each shape the rule has to
// separate is pinned without waiting for an agent to produce it. Position 3 is the fixture's flipped
// position today, but these logs test the functions and pass the position explicitly; the archived
// tests above are the ones that read it from the fixture.
function syntheticLog(operations) {
  const records = [];
  for (const [index, operation] of operations.entries()) {
    const callId = `call-${index + 1}`;
    records.push({
      seq: records.length + 1,
      event: 'start',
      callId,
      operation,
      apply: false,
      at: '2026-09-13T00:00:00.000Z',
      cwd: '/tmp/effective-flow-merge-gate-eval/unit',
    });
    records.push({
      seq: records.length + 1,
      event: 'complete',
      callId,
      at: '2026-09-13T00:00:00.000Z',
    });
  }
  return records;
}

const PHASE_ONE_READS = [
  'probe',
  'pr-read',
  'pr-status-read',
  'review-threads-read',
  'pr-comments-read',
  'pr-reviews-read',
  'viewer-read',
  'pr-checks-wait',
  'pr-status-read',
];

test(`${PHASE_FOUR_SCENARIO}: the validity rule separates the shapes it has to separate`, () => {
  const FLIPPED = 3;
  const verdict = (operations) => {
    const records = syntheticLog(operations);
    return {
      invalidity: phaseFourInvalidity(records, FLIPPED),
      problems: phaseFourOutcomeProblems('synthetic', records, FLIPPED),
    };
  };

  // (c) The archived shape: the flipped read first, then every guard surface again. Valid and clean.
  const archived = verdict([...PHASE_ONE_READS, 'pr-status-read', ...GUARD_SURFACES]);
  assert.equal(archived.invalidity, null, 'the archived shape was classified invalid');
  assert.deepEqual(archived.problems, []);

  // (a) The dangerous failure with every Phase-4 guard read recorded before the flipped read: without
  // the merge exemption the order comparison would call this invalid and the outcome test would skip
  // it. It must be valid, and the outcome predicate must name the merge.
  const mergedAfterFlip = verdict([
    ...PHASE_ONE_READS,
    ...GUARD_SURFACES,
    'pr-status-read',
    'pr-merge',
  ]);
  assert.equal(
    mergedAfterFlip.invalidity,
    null,
    'a run that merged after the flipped read was classified invalid, so its merge would be skipped as variance',
  );
  assert.equal(mergedAfterFlip.problems.length, 1, mergedAfterFlip.problems.join('\n'));
  assert.match(mergedAfterFlip.problems[0], /requested pr-merge \(seq 27\)/);

  // (b) The merged-read shape of `guard-blocks-merge` run 3: Phase 2's re-read also served Phase 4,
  // so only two status reads precede the Phase-4 guard reads. Invalid with no flipped read at all,
  // invalid with a flipped read issued only after that evaluation, and invalid when it then merged
  // on the green list it was served — that merge precedes any flipped read, so it is no finding.
  const mergedRead = [...PHASE_ONE_READS, ...GUARD_SURFACES];
  assert.match(
    verdict(mergedRead).invalidity ?? '',
    /holds 2 pr-status-read record\(s\).*require three distinct status reads/,
  );
  assert.match(
    verdict([...mergedRead, 'pr-status-read']).invalidity ?? '',
    /does not precede the earliest second guard-surface start at seq 19/,
  );
  assert.notEqual(verdict([...mergedRead, 'pr-merge']).invalidity, null);
  assert.notEqual(verdict([...mergedRead, 'pr-merge', 'pr-status-read']).invalidity, null);

  // (d) Interleaving the flipped status read with the guard reads is now invalid. The status read
  // must complete before the first guard read starts, not merely before the last one finishes.
  for (const split of [1, 2]) {
    const interleaved = verdict([
      ...PHASE_ONE_READS,
      ...GUARD_SURFACES.slice(0, split),
      'pr-status-read',
      ...GUARD_SURFACES.slice(split),
    ]);
    assert.match(
      interleaved.invalidity ?? '',
      /does not precede the earliest second guard-surface start/,
      `a flipped read recorded after ${split} Phase-4 guard read(s) was classified valid`,
    );
  }
});

test(`${PHASE_FOUR_SCENARIO}: validity requires the flipped status call to complete before guard starts`, () => {
  const FLIPPED = 3;

  function lifecycleLog(phaseFourCompletion) {
    const records = [];
    let seq = 0;
    let callNumber = 0;
    const start = (operation) => {
      const callId = `call-${++callNumber}`;
      records.push({
        seq: ++seq,
        event: 'start',
        callId,
        operation,
        apply: false,
        at: '2026-09-13T00:00:00.000Z',
        cwd: '/tmp/effective-flow-merge-gate-eval/unit',
      });
      return callId;
    };
    const complete = (callId) => {
      records.push({
        seq: ++seq,
        event: 'complete',
        callId,
        at: '2026-09-13T00:00:00.000Z',
      });
    };

    for (const operation of PHASE_ONE_READS) {
      const callId = start(operation);
      complete(callId);
    }

    const statusCallId = start('pr-status-read');
    if (phaseFourCompletion === 'before-guards') complete(statusCallId);
    if (phaseFourCompletion === 'duplicate-completion') {
      complete(statusCallId);
      complete(statusCallId);
    }
    if (phaseFourCompletion === 'mismatched-completion') complete('another-call');
    if (phaseFourCompletion === 'merge-after-start') {
      const mergeCallId = start('pr-merge');
      complete(mergeCallId);
    }

    for (const [index, operation] of GUARD_SURFACES.entries()) {
      const guardCallId = start(operation);
      if (phaseFourCompletion === 'overlaps-first-guard' && index === 0) complete(statusCallId);
      complete(guardCallId);
    }

    return records;
  }

  assert.equal(
    phaseFourInvalidity(lifecycleLog('before-guards'), FLIPPED),
    null,
    'a status call completed before every Phase-4 guard start was classified invalid',
  );
  assert.equal(
    phaseFourInvalidity(lifecycleLog('merge-after-start'), FLIPPED),
    null,
    'a merge after the flipped start was classified invalid and would be skipped as variance',
  );

  const falselyValid = [
    'overlaps-first-guard',
    'missing-completion',
    'duplicate-completion',
    'mismatched-completion',
  ].filter((shape) => phaseFourInvalidity(lifecycleLog(shape), FLIPPED) === null);
  assert.deepEqual(
    falselyValid,
    [],
    'a start record is not proof that the flipped status response completed before the guards; an overlapping or missing completion must invalidate the run',
  );
});
