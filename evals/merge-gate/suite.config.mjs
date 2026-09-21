// Everything the shared eval scaffold needs to know about this suite, in one place. The scaffold
// under `evals/_scaffold/` names no tool: it reads the seeds, the registry, the evaluator, the
// tracker stub, the overlay policy and the sandbox namespace from here.
//
// **This file is deliberately not one of `instrumentFiles`.** The membership rule for the
// instrument is "would a change here change what the run did" (see `build-identity.mjs`), and a
// scenario registry is a list of names no run ever reads. While the registry lived in
// `_scaffold/suite.mjs`, which is hashed, adding a single scenario moved the instrument digest and
// staled every archived round of every other scenario — thirty re-recorded runs for a change that
// altered nothing any of them observed. Everything else declared here is covered elsewhere: the
// seeds and the overlay show up in `skill.files`, the stub and the modules below are hashed by
// name in `instrumentFiles`, and the sandbox base is a scratch path no run reads.

import { resolve } from 'node:path';
import {
  applyOverlay,
  overlayApplies,
  overlayExtraSeeds,
  requiresIterateTrace,
  scenarioSetup,
} from './_scaffold/configured-reviewer-scenario.mjs';
import { projectDocuments } from './_scaffold/project-setup.mjs';
import * as evaluator from './_scaffold/evaluate.mjs';

const SUITE_ROOT = resolve(import.meta.dirname);
const SCAFFOLD = resolve(SUITE_ROOT, '_scaffold');
const SHARED_SCAFFOLD = resolve(SUITE_ROOT, '..', '_scaffold');

// The scenario registry: the third parity member beside `scenarios/` and `fixtures/`, and the one
// place a scenario is declared to have an evaluator branch at all.
const SCENARIOS = Object.freeze([
  'configured-reviewer-set-aside-blocks',
  'guard-blocks-merge',
  'linked-issue-open-points',
  'merge-proceeds',
  'unreported-checks-at-phase-four',
  'unreported-checks-block-merge',
]);

// The seeds of the load set: the router that dispatches the invocation, the tool body that is the
// gate itself, the three artifacts the gate delegates into — the `iterate` workflow it hands a
// review round to, and the two worker contracts it can select — and the delegation-envelope helper
// the gate runs to build and validate every one of those handoffs, together with the `-core.mjs`
// half that helper imports.
//
// **The envelope helper is seeded rather than reached, and it has to be.** A sandbox run executes
// the shipped `scripts/delegation-envelope.mjs`, so a change to it changes what the run does; but a
// `.mjs` file carries no load pointer, and the tool body names it as a shell command, which is
// ordinary prose to the load-pointer pattern. Nothing in the derivation can therefore find it, and
// left unseeded it was the one piece of executed text a run could change underneath the archived
// stamps while every one of them went on reporting current.
//
// `scripts/remote-tracker.mjs` stays deliberately absent, together with its `-core.mjs` half, and
// the contrast with the envelope helper is the membership rule rather than an inconsistency:
// `scaffold.mjs` replaces that path in the copied tree with the stub below, which is hashed as the
// `instrument` part instead, so a run loads neither the shipped helper nor the module it imports.
// Nothing replaces the envelope helper, so a run loads exactly what the build shipped.
const LOAD_SET_SEEDS = Object.freeze([
  'SKILL.md',
  'tools/merge-gate.md',
  'tools/iterate.md',
  'workers/effective-flow-merge-conflict-resolver.md',
  'workers/effective-flow-code-validator.md',
  'scripts/delegation-envelope.mjs',
  'scripts/delegation-envelope-core.mjs',
]);

// The stub that answers the run and the scaffold that configures it: what turns the built tree into
// a measurement. The round coordinator, the identity code and the evaluators are absent, because
// none of them is read during a run.
// The stub file itself, declared once and referenced twice below: as the file `scaffold.mjs` copies
// into each slot, and as the instrument entry that hashes it. Two literals could name two different
// files, and the one that is hashed would then not be the one that answers the run.
const TRACKER_STUB_SOURCE = resolve(SCAFFOLD, 'remote-tracker.mjs');

const INSTRUMENT_FILES = Object.freeze([
  TRACKER_STUB_SOURCE,
  resolve(SHARED_SCAFFOLD, 'sandbox.mjs'),
  resolve(SHARED_SCAFFOLD, 'scaffold.mjs'),
  resolve(SHARED_SCAFFOLD, 'prompt.mjs'),
  resolve(SHARED_SCAFFOLD, 'suite.mjs'),
  resolve(SCAFFOLD, 'configured-reviewer-scenario.mjs'),
  resolve(SCAFFOLD, 'project-setup.mjs'),
]);

const suite = {
  name: 'merge-gate',
  root: SUITE_ROOT,
  // The scratch tree every round is provisioned into. It is outside the checkout on purpose, and
  // its name is the suite's own so two suites' rounds can never share a slot path.
  sandboxBase: resolve('/tmp', 'effective-flow-merge-gate-eval', 'rounds'),
  // The directory under `.effective-flow/` that holds this suite's publication locks.
  runtimeStateDir: 'merge-gate-eval',
  scenarios: SCENARIOS,
  loadSetSeeds: LOAD_SET_SEEDS,
  instrumentFiles: INSTRUMENT_FILES,
  // Operations a run may legitimately attempt without the fixture answering them. `pr-merge` is the
  // gate's own merge decision: a scenario in which no merge is offered still has to be able to
  // record the attempt, which is the observation that scenario exists to make.
  alwaysAllowedOperations: Object.freeze(['pr-merge']),
  // Where it lands inside a slot's skill tree is not declared here: `TRACKER_STUB_SKILL_PATH` in
  // the shared `scaffold.mjs` owns that, so the destination is covered by an instrument hash
  // instead of by this unhashed file.
  trackerStub: { source: TRACKER_STUB_SOURCE },
  // The one generation of accepted difference between an archived stamp and a fresh identity, and
  // the only waiver besides the release-version one. It has no subject in the corpus that ships;
  // see `isCompatibleLegacyInstrumentPredecessor` for when to delete it rather than extend it.
  legacyInstrumentWaiver: {
    predecessorInstrumentDigest:
      'sha256:208fd4fb943e321cce20f4e7143a4602171c332507976cb6cf9abe93c7122040',
    trackerStubPath: 'evals/merge-gate/_scaffold/remote-tracker.mjs',
    // The sequenced Phase-4 scenario needs completion evidence and can never use this exception.
    excludedScenarios: Object.freeze(['unreported-checks-at-phase-four']),
  },
  overlay: {
    applies: overlayApplies,
    apply: applyOverlay,
    extraSeeds: overlayExtraSeeds,
  },
  // The second evidence file this suite pairs with the call log: the `iterate` echo's trace.
  auxiliaryEvidence: {
    fileName: 'iterate-calls.jsonl',
    archiveSuffix: 'iterate.jsonl',
    sealDigestKey: 'iterateLog',
    required: requiresIterateTrace,
    missingMessage: 'the run has no paired iterate trace',
    orphanMessage: 'an iterate trace is orphaned in a scenario without an echo',
  },
  scenarioSetup,
  projectDocuments,
  evaluator,
  // Five discarded attempts on the sequenced Phase-4 scenario is a signal to stop and investigate
  // rather than to keep spending runs; every other scenario has no cap.
  retryDiscardLimit(scenario) {
    return scenario === 'unreported-checks-at-phase-four' ? 5 : Number.POSITIVE_INFINITY;
  },
};

export default suite;
