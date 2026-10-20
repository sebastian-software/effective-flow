import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { supportedTrackerOperations } from '../_scaffold/evaluate.mjs';
import { SCENARIOS } from './scenario-registry.mjs';
import { captureState, STATE_FILE } from './_scaffold/capture.mjs';
import { prepareCheckout, projectDocuments } from './_scaffold/setup.mjs';
import { verifyArchivedScenario } from './_scaffold/archive.mjs';
import { verifyAdditionalEvidence } from './_scaffold/evidence.mjs';
import * as evaluator from './_scaffold/evaluate.mjs';
const root = resolve(import.meta.dirname),
  shared = resolve(root, '../_scaffold'),
  tracker = resolve(shared, 'remote-tracker.mjs');
// Entire actual workflow/worker/runtime load set: no model call may accidentally depend on an
// unbound source. Native lanes carry a separately declared target and are never portable evidence.
const sourceRoot = resolve(root, '../../src');
const walk = (dir, prefix = '') =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(resolve(dir, e.name), prefix + e.name + '/') : [prefix + e.name],
  );
const seeds = walk(sourceRoot)
  .filter((p) => p === 'SKILL.md' || p.startsWith('tools/') || p.startsWith('scripts/'))
  .filter((p) => !p.startsWith('scripts/remote-tracker'))
  .map((p) => p);
// Agents become portable workers in the built target.
for (const name of readdirSync(resolve(sourceRoot, 'agents')))
  seeds.push('workers/effective-flow-' + name);
const suite = {
  name: 'build-context',
  root,
  sandboxBase: '/tmp/effective-flow-build-context-eval/rounds',
  runtimeStateDir: 'build-context-eval',
  scenarios: SCENARIOS,
  scenarioRegistry: resolve(root, 'scenario-registry.mjs'),
  loadSetSeeds: seeds,
  instrumentFiles: [
    resolve(root, 'suite.config.mjs'),
    resolve(root, 'profiles.json'),
    resolve(root, 'record.mjs'),
    resolve(root, 'identity.mjs'),
    resolve(root, 'coordinator.mjs'),
    tracker,
    ...['sandbox.mjs', 'scaffold.mjs', 'prompt.mjs', 'suite.mjs'].map((n) => resolve(shared, n)),
    ...readdirSync(resolve(root, '_scaffold'))
      .filter((n) => n.endsWith('.mjs'))
      .map((n) => resolve(root, '_scaffold', n)),
  ],
  alwaysAllowedOperations: Object.freeze([...supportedTrackerOperations()].sort()),
  trackerStub: { source: tracker },
  legacyInstrumentWaiver: null,
  overlay: { applies: () => false, apply: () => {}, extraSeeds: () => [] },
  auxiliaryEvidence: null,
  sealedEvidence: {
    fileName: STATE_FILE,
    archiveSuffix: STATE_FILE,
    sealDigestKey: 'buildContext',
    required: () => true,
    capture: captureState,
    missingMessage: 'missing actual build-context observations',
    orphanMessage: 'orphan build-context observations',
  },
  scenarioSetup: () => ({ projectSetupRows: [] }),
  projectDocuments,
  prepareCheckout,
  evaluator,
  retryDiscardLimit: () => 5,
  // Two harnesses run the same portable Quality source; the immutable auxiliary profile pin binds
  // each pair before recording. An operator declaration alone cannot attest actual descendants.
  expectedProfile: null,
  verifyArchivedScenario: (input) => verifyArchivedScenario(suite, input),
  verifyAdditionalEvidence: (input) => verifyAdditionalEvidence(suite, input),
};
export default suite;
