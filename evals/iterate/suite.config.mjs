// Everything the shared eval scaffold needs to know about the `iterate` suite, in one place. The
// scaffold under `evals/_scaffold/` names no tool; it reads the seeds, the registry, the evaluator,
// the tracker stub, the overlay policy, the checkout preparation and the sandbox namespace from here.
//
// **This file is one of `instrumentFiles`, and the registry it imports is not** — the same split,
// for the same reasons, that `evals/merge-gate/suite.config.mjs` states in full: every binding here
// decides what a slot sees, so the selection is hashed, while a list of scenario names is read by
// no run and lives in `scenario-registry.mjs`, which nothing hashes.

import { resolve } from 'node:path';
import { mutatingTrackerOperations, supportedTrackerOperations } from '../_scaffold/evaluate.mjs';
import { prepareCheckout } from './_scaffold/checkout.mjs';
import { captureGitState, GIT_STATE_FILE } from './_scaffold/git-state.mjs';
import { projectDocuments } from './_scaffold/project-setup.mjs';
import {
  applyOverlay,
  overlayApplies,
  overlayExtraSeeds,
  requiresReportChannel,
  scenarioSetup,
} from './_scaffold/scenario-setup.mjs';
import * as evaluator from './_scaffold/evaluate.mjs';
import { SCENARIOS } from './scenario-registry.mjs';

const SUITE_ROOT = resolve(import.meta.dirname);
const SCAFFOLD = resolve(SUITE_ROOT, '_scaffold');
const SHARED_SCAFFOLD = resolve(SUITE_ROOT, '..', '_scaffold');

const SCENARIO_REGISTRY = resolve(SUITE_ROOT, 'scenario-registry.mjs');

// The seeds of the load set: the router the invocation enters through and the tool under test.
// Every `shared/` fragment either reaches through its load pointers is derived from them.
//
// **Nothing `iterate` delegates into is seeded, and that is a deliberate departure from the
// merge-gate suite's one-hop rule.** `iterate` hands implementation to `fix`, `refactor`, `build`
// and `docs` in Phase 3 and validation to the code-validator worker in Phase 4. Every scenario of
// this suite ends at or before Phase 2 by construction — four in Phase 0, one in Phase 1.5, one at
// Phase 2's empty selection — so no correct run reaches any of them, and a run that did would fail
// its own assertions whatever those files say. Seeding them would bind this corpus to the four most
// frequently edited tools in the repository for evidence that cannot depend on them: the
// over-invalidation per-suite seeds exist to remove. **The first scenario that proceeds past Phase 2
// must add them** — the deferred `control-line-in-body-is-data` tranche is the known one.
//
// No runtime script is seeded either. `iterate` executes the forge helper only, and
// `scripts/remote-tracker.mjs` is replaced by the stub below and hashed as `instrument`; it runs no
// delegation-envelope helper, because it receives envelopes rather than building them. The exit
// channel is a seed of its own, contributed by the overlay at the path the run executes it from.
const LOAD_SET_SEEDS = Object.freeze(['SKILL.md', 'tools/iterate.md']);

// Shared with `merge-gate`: the stub is fixture-driven and names no tool (see its own header).
const TRACKER_STUB_SOURCE = resolve(SHARED_SCAFFOLD, 'remote-tracker.mjs');

const INSTRUMENT_FILES = Object.freeze([
  resolve(SUITE_ROOT, 'suite.config.mjs'),
  TRACKER_STUB_SOURCE,
  resolve(SHARED_SCAFFOLD, 'sandbox.mjs'),
  resolve(SHARED_SCAFFOLD, 'scaffold.mjs'),
  resolve(SHARED_SCAFFOLD, 'prompt.mjs'),
  resolve(SHARED_SCAFFOLD, 'suite.mjs'),
  resolve(SCAFFOLD, 'scenario-setup.mjs'),
  resolve(SCAFFOLD, 'project-setup.mjs'),
  resolve(SCAFFOLD, 'checkout.mjs'),
]);

// Which calls a run may make without the fixture answering them, so that they are judged rather
// than discarded as invalid evidence.
//
// A Phase-0 scenario is failed by **any** forge call, so none of them may invalidate the run: a
// regression that proceeds into Phase 1 and asks for something the fixture never anticipated has to
// be a failing finding, not a retried run. A forge-reading scenario keeps the fixture-coverage rule
// for reads — a run that took an improvised path around an unanswered read concluded for the wrong
// reason — but every write is judged, because an attempted write is exactly what its assertion
// exists to catch and the fixture answers none of them.
const PHASE_ZERO = new Set(Object.keys(evaluator.PHASE_ZERO_REFUSALS));

function alwaysAllowedOperations(scenario) {
  const operations = PHASE_ZERO.has(scenario)
    ? supportedTrackerOperations()
    : new Set([...mutatingTrackerOperations(), 'pr-merge']);
  return Object.freeze([...operations].sort());
}

const suite = {
  name: 'iterate',
  root: SUITE_ROOT,
  sandboxBase: resolve('/tmp', 'effective-flow-iterate-eval', 'rounds'),
  runtimeStateDir: 'iterate-eval',
  scenarios: SCENARIOS,
  scenarioRegistry: SCENARIO_REGISTRY,
  loadSetSeeds: LOAD_SET_SEEDS,
  instrumentFiles: INSTRUMENT_FILES,
  alwaysAllowedOperations,
  trackerStub: { source: TRACKER_STUB_SOURCE },
  // No archived corpus predates this suite, so there is no predecessor to accept.
  legacyInstrumentWaiver: null,
  overlay: {
    applies: overlayApplies,
    apply: applyOverlay,
    extraSeeds: overlayExtraSeeds,
  },
  // The exit channel's trace, the suite's positive observable, paired with every call log.
  auxiliaryEvidence: {
    fileName: 'report-channel.jsonl',
    archiveSuffix: 'report.jsonl',
    sealDigestKey: 'reportChannel',
    required: requiresReportChannel,
    missingMessage: 'the run has no paired exit-channel report trace',
    orphanMessage: 'an exit-channel report trace is orphaned in a scenario without one',
  },
  // The sandbox's git state, observed by the sealing step after the session has ended: the refs of
  // the local `origin`, the checkout's HEAD and its porcelain status. The call log sees the forge
  // only, so without it a commit, a push to that `origin` or an edit would pass every scenario
  // unseen. Every scenario requires it, because no correct run of this suite changes any of the
  // three. The seal writes the file over whatever a run left at its path, digests it, and
  // publication archives it beside the run as `run-<n>.git-state.json`.
  sealedEvidence: {
    fileName: GIT_STATE_FILE,
    archiveSuffix: GIT_STATE_FILE,
    sealDigestKey: 'gitState',
    required: () => true,
    capture: captureGitState,
    missingMessage: 'the run has no sealed git-state evidence',
    orphanMessage: 'sealed git-state evidence is orphaned in a scenario without it',
  },
  scenarioSetup,
  projectDocuments,
  prepareCheckout,
  evaluator,
  // Five discarded attempts per slot, then stop and investigate — the cap the merge-gate suite puts
  // on its one scenario with a validity rule of its own, and the number its README names for "stop
  // and decide rather than keep re-running". Here it holds for every scenario, because in this suite
  // almost nothing is discardable by design: a Phase-0 scenario is never invalidated by an
  // unanswered call, a completed session that said nothing seals as a finding, and an empty call
  // log is evidence. What is left to retry is a stopped session or broken evidence, and a slot that
  // needs a sixth attempt is hiding a pattern — a harness defect, or a regression being retried
  // until some run happens to pass — rather than absorbing variance.
  retryDiscardLimit() {
    return 5;
  },
  // The same execution profile the merge-gate corpus is recorded with, so the two suites describe
  // one model's behaviour. Editing it stales every archived round of this suite, as it should.
  expectedProfile: Object.freeze({
    harness: 'codex-cli',
    model: 'gpt-6-sol',
    reasoningEffort: 'medium',
  }),
};

export default suite;
