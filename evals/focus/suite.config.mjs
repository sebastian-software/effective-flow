// The focus suite binding. Bindings that affect a run belong to the instrument; the name-only
// registry does not (see `evals/merge-gate/suite.config.mjs` for the split).
//
// The suite measures focus's trajectory judgment on admitted evidence under a prompt-declared
// measurement override (host simulation, session stub, closing format); it measures no host
// admission. Plan: docs/plan/2026-11-03-focus-observed-eval-suite-and-calibration.md.
import { resolve } from 'node:path';
import { supportedTrackerOperations } from '../_scaffold/evaluate.mjs';
import { SCENARIOS } from './scenario-registry.mjs';
import {
  applyOverlay,
  captureLastMessage,
  LAST_MESSAGE_FILE,
  overlayExtraSeeds,
  prepareCheckout,
  projectDocuments,
} from './_scaffold/setup.mjs';
import * as evaluator from './_scaffold/evaluate.mjs';

const root = resolve(import.meta.dirname);
const shared = resolve(root, '../_scaffold');
const tracker = resolve(shared, 'remote-tracker.mjs');

export default {
  name: 'focus',
  root,
  sandboxBase: '/tmp/effective-flow-focus-eval/rounds',
  runtimeStateDir: 'focus-eval',
  scenarios: SCENARIOS,
  scenarioRegistry: resolve(root, 'scenario-registry.mjs'),
  // The router and the tool; every fragment either reaches through its load pointers is derived
  // from them. The session stub and its shapes module are seeds through the overlay only.
  loadSetSeeds: ['SKILL.md', 'tools/focus.md'],
  // The launch attestation is the suite-local stand-in for a focus mode in the shared verifier,
  // which it imports; both decide which launches may run, so both are hashed here.
  instrumentFiles: [
    resolve(root, 'suite.config.mjs'),
    tracker,
    resolve(shared, 'host-qualification.mjs'),
    ...['sandbox.mjs', 'scaffold.mjs', 'prompt.mjs', 'suite.mjs'].map((name) =>
      resolve(shared, name),
    ),
    resolve(root, '_scaffold/setup.mjs'),
    resolve(root, '_scaffold/launch-attestation.mjs'),
  ],
  // focus needs no tracker; a call is judged (a write is a violation), never discarded.
  alwaysAllowedOperations: Object.freeze([...supportedTrackerOperations()].sort()),
  trackerStub: { source: tracker },
  legacyInstrumentWaiver: null,
  overlay: { applies: () => true, apply: applyOverlay, extraSeeds: overlayExtraSeeds },
  // The read trace the stub writes inside the run-writable sandbox: the read sequence the evaluator
  // replays, and weaker evidence than the seal because the run could rewrite it.
  auxiliaryEvidence: {
    fileName: 'session-calls.jsonl',
    archiveSuffix: 'session.jsonl',
    sealDigestKey: 'sessionTrace',
    required: () => true,
    missingMessage: 'the run has no paired session-stub read trace',
    orphanMessage: 'a session-stub read trace is orphaned',
  },
  // The host's last message, written through `--output-last-message` outside the attempt root and
  // copied by the seal: the source of the scored closing lines. `capturesLastMessage` makes the host
  // receipt carry `lastMessagePath` (outside the attempt root) and hands it to `capture`.
  sealedEvidence: {
    fileName: LAST_MESSAGE_FILE,
    archiveSuffix: LAST_MESSAGE_FILE,
    sealDigestKey: 'lastMessage',
    required: () => true,
    capturesLastMessage: true,
    capture: captureLastMessage,
    missingMessage: 'the run has no sealed last message',
    orphanMessage: 'a sealed last message is orphaned',
  },
  scenarioSetup: () => ({ projectSetupRows: [] }),
  projectDocuments,
  prepareCheckout,
  evaluator,
  // A not-admitted attempt is discarded and retried up to five times, so a slot's sixth attempt
  // still runs; `retry-invalid` refuses once five are discarded, so a slot whose sixth attempt is
  // also not admitted is not measured (`round-core.mjs`, `reprovision`).
  retryDiscardLimit: () => 5,
  // The next-steps profile at implementation time, so the launch is that suite's verified mode.
  expectedProfile: Object.freeze({
    harness: 'codex-cli',
    model: 'gpt-6.1-sol',
    reasoningEffort: 'high',
    reportedVersion: '0.163.0',
    toolPolicy:
      'workspace-write;approval-never;network-disabled;isolated-home;attempt-root-writable;ignore-user-config;ignore-rules;ephemeral',
  }),
};
