// Bindings that affect a run belong to the instrument; the name-only registry does not.
import { resolve } from 'node:path';
import { supportedTrackerOperations } from '../_scaffold/evaluate.mjs';
import { SCENARIOS } from './scenario-registry.mjs';
import {
  applyOverlay,
  prepareCheckout,
  projectDocuments,
  REPORT_PATH,
} from './_scaffold/setup.mjs';
import { captureState, STATE_FILE } from './_scaffold/state.mjs';
import * as evaluator from './_scaffold/evaluate.mjs';
const root = resolve(import.meta.dirname);
const shared = resolve(root, '../_scaffold');
const tracker = resolve(shared, 'remote-tracker.mjs');
export default {
  name: 'next-steps',
  root,
  sandboxBase: '/tmp/effective-flow-next-steps-eval/rounds',
  runtimeStateDir: 'next-steps-eval',
  scenarios: SCENARIOS,
  scenarioRegistry: resolve(root, 'scenario-registry.mjs'),
  // Only final reporting executes. No implementation workflow or domain skill is entered.
  loadSetSeeds: ['SKILL.md', 'shared/next-steps.md', 'shared/plan-reference-routing.md'],
  instrumentFiles: [
    resolve(root, 'suite.config.mjs'),
    tracker,
    ...['sandbox.mjs', 'scaffold.mjs', 'prompt.mjs', 'suite.mjs'].map((name) =>
      resolve(shared, name),
    ),
    resolve(root, '_scaffold/setup.mjs'),
    resolve(root, '_scaffold/state.mjs'),
    resolve(root, '../../src/scripts/remote-tracker-shared-core.mjs'),
  ],
  // Unanswered calls are judged, never discarded: the run already has its complete source context.
  alwaysAllowedOperations: Object.freeze([...supportedTrackerOperations()].sort()),
  trackerStub: { source: tracker },
  legacyInstrumentWaiver: null,
  overlay: { applies: () => true, apply: applyOverlay, extraSeeds: () => [REPORT_PATH] },
  auxiliaryEvidence: {
    fileName: 'report-channel.jsonl',
    archiveSuffix: 'report.jsonl',
    sealDigestKey: 'reportChannel',
    required: () => true,
    missingMessage: 'missing final-report channel',
    orphanMessage: 'orphan final-report channel',
  },
  sealedEvidence: {
    fileName: STATE_FILE,
    archiveSuffix: STATE_FILE,
    sealDigestKey: 'recommendationState',
    required: () => true,
    capture: captureState,
    missingMessage: 'missing sealed recommendation state',
    orphanMessage: 'orphan recommendation state',
  },
  scenarioSetup: () => ({ projectSetupRows: [] }),
  projectDocuments,
  prepareCheckout,
  evaluator,
  retryDiscardLimit: () => 5,
  expectedProfile: Object.freeze({
    harness: 'codex-cli',
    model: 'gpt-6.1-sol',
    reasoningEffort: 'high',
    reportedVersion: '0.159.3',
    toolPolicy:
      'workspace-write;approval-never;network-disabled;isolated-home;attempt-root-writable;ignore-user-config;ignore-rules;ephemeral',
  }),
};
