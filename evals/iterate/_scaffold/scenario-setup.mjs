// Scenario-local setup for the `iterate` suite: which project-setup rows a slot's configuration
// carries, and the one overlay every slot receives. It is an instrument file because both decide
// what a run sees.
//
// **The overlay adds and never replaces.** The `merge-gate` suite's overlay swaps `tools/iterate.md`
// for an echo; this one copies the exit-channel helper into the slot's skill tree beside the
// unmodified production tool and changes no shipped file. `applyOverlay` refuses to write over a
// file the build already ships, so a future build that happened to ship a file at the helper's path
// fails provisioning instead of being silently shadowed.

import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const REVIEW_IN_FLIGHT_SCENARIO = 'review-in-flight-aborts';

// The one scenario with a configured automatic reviewer. `recensor` carries a check context, so the
// shared "Automatic reviewer state" resolves it through its primary signal — the only signal that
// can establish **running** — against the pending `recensor` check the scenario's status read
// reports.
export const REVIEWER_ROWS = Object.freeze([
  Object.freeze(['mergeGate.bots', 'recensor']),
  Object.freeze(['mergeGate.bots.recensor.check', 'recensor']),
]);

const REPORT_CHANNEL_SOURCE = resolve(import.meta.dirname, 'report-channel.mjs');
// Where the helper lands inside a slot's skill tree, and therefore the load-set seed it is hashed
// under as part of `skill`. The prompt names the same path.
export const REPORT_CHANNEL_SKILL_PATH = 'scripts/report-channel.mjs';

export function scenarioSetup(scenario) {
  const projectSetupRows =
    scenario === REVIEW_IN_FLIGHT_SCENARIO ? REVIEWER_ROWS.map(([key, value]) => [key, value]) : [];
  return { projectSetupRows };
}

// Every scenario of this suite reports through the exit channel, so every run pairs a report record
// with its call log.
export function requiresReportChannel() {
  return true;
}

export function overlayApplies() {
  return true;
}

export function applyOverlay(scenario, skillRoot) {
  if (!existsSync(REPORT_CHANNEL_SOURCE)) {
    throw new Error(`${scenario}: report channel source missing at ${REPORT_CHANNEL_SOURCE}`);
  }
  const destination = resolve(skillRoot, REPORT_CHANNEL_SKILL_PATH);
  if (existsSync(destination)) {
    throw new Error(
      `${scenario}: the built skill already ships ${REPORT_CHANNEL_SKILL_PATH}; the report channel adds a file and never replaces one`,
    );
  }
  copyFileSync(REPORT_CHANNEL_SOURCE, destination);
}

export function overlayExtraSeeds() {
  return [REPORT_CHANNEL_SKILL_PATH];
}
