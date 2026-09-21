// Scenario-local setup for the one configured-reviewer scenario. Every other scenario keeps the
// shared no-reviewer project configuration and the production `iterate` tool; this module is the
// single place that decides which scenario receives the reviewer rows, the `iterate` echo overlay,
// and the paired `run-<n>.iterate.jsonl` evidence file.

import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const CONFIGURED_REVIEWER_SCENARIO = 'configured-reviewer-set-aside-blocks';

export const CONFIGURED_REVIEWER_ROWS = [
  ['mergeGate.bots', 'recensor'],
  ['mergeGate.bots.recensor.trigger', '@recensor review'],
  ['mergeGate.bots.recensor.check', 'recensor'],
];

// The echo and the trace helper it executes, and the path the helper is copied to inside the
// slot's skill tree. Neither is an instrument file: both are hashed as part of `skill`, at the
// sandbox paths the run executes, which is the membership rule stated in `build-identity.mjs`.
const ITERATE_ECHO_SOURCE = resolve(import.meta.dirname, 'iterate-echo.md');
const ITERATE_TRACE_SOURCE = resolve(import.meta.dirname, 'iterate-trace.mjs');
export const ITERATE_TRACE_SKILL_PATH = 'scripts/iterate-trace.mjs';

export function scenarioSetup(scenario) {
  if (scenario !== CONFIGURED_REVIEWER_SCENARIO) {
    return { projectSetupRows: [], iterateEcho: false };
  }
  const projectSetupRows = CONFIGURED_REVIEWER_ROWS.map(([key, value]) => [key, value]);
  if (!projectSetupRows.some(([key]) => key === 'mergeGate.bots')) {
    throw new Error(`${scenario}: configured-reviewer setup has no resolved mergeGate.bots row`);
  }
  return { projectSetupRows, iterateEcho: true };
}

// A configured-reviewer run is one indivisible evidence unit: its call log, its build stamp, and
// its `iterate` echo trace. Every other scenario's unit carries no echo trace, and one that appears
// there is an orphan rather than extra evidence.
export function requiresIterateTrace(scenario) {
  return scenarioSetup(scenario).iterateEcho;
}

// The overlay half of the same decision, in the shape `build-identity.mjs` consumes: whether a
// scenario is overlaid at all, how the overlay is applied to a copied skill tree, and which further
// load-set seeds the overlay introduces. The echo replaces the production `tools/iterate.md` seed
// rather than being added beside it, so only the trace helper is an extra seed.
export function overlayApplies(scenario) {
  return scenarioSetup(scenario).iterateEcho;
}

export function applyOverlay(scenario, skillRoot) {
  if (!overlayApplies(scenario)) return;
  for (const source of [ITERATE_ECHO_SOURCE, ITERATE_TRACE_SOURCE]) {
    if (!existsSync(source))
      throw new Error(`${scenario}: iterate echo source missing at ${source}`);
  }
  copyFileSync(ITERATE_ECHO_SOURCE, resolve(skillRoot, 'tools', 'iterate.md'));
  copyFileSync(ITERATE_TRACE_SOURCE, resolve(skillRoot, ITERATE_TRACE_SKILL_PATH));
}

export function overlayExtraSeeds(scenario) {
  return overlayApplies(scenario) ? [ITERATE_TRACE_SKILL_PATH] : [];
}
