// Scenario-local setup for the one configured-reviewer scenario, the two repair-accounting
// scenarios, the one configuration row the non-interactive dispatch scenario changes, the one row
// the bot-account scenario appends, and the rows of the six declared no-CI policy scenarios.
// Every other scenario keeps the shared no-reviewer project configuration and the production
// `iterate` tool; this module is the single place that
// decides which scenario receives the reviewer rows, the `iterate` echo overlay, the paired
// `run-<n>.iterate.jsonl` evidence file, a changed base row, and an appended row.

import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const CONFIGURED_REVIEWER_SCENARIO = 'configured-reviewer-set-aside-blocks';

export const CONFIGURED_REVIEWER_ROWS = [
  ['mergeGate.bots', 'recensor'],
  ['mergeGate.bots.recensor.trigger', '@recensor review'],
  ['mergeGate.bots.recensor.check', 'recensor'],
];

// The scenario in which a non-interactive caller dispatches the delegated run under
// `mergeGate.completion: ask`. Its one row replaces the base `merge` row in place (see
// `project-setup.mjs`): a non-interactive delegation cannot pose the completion question, so the
// delegated run has to behave as `report`, and the caller has to pass it no completion answer.
export const NON_INTERACTIVE_DISPATCH_SCENARIO = 'non-interactive-dispatch-reports';

export const NON_INTERACTIVE_DISPATCH_ROWS = [['mergeGate.completion', 'ask']];

// The scenario in which a user-typed automated account comments on the pull request and the project
// declares it a non-reviewer bot. Its one row is appended, since the base table carries no
// `mergeGate.botAccounts` row; `mergeGate.bots` stays absent, so the comment is excluded by guard
// rule 1's `mergeGate.botAccounts` case alone.
export const BOT_LOGIN_SCENARIO = 'bot-login-excluded';

export const BOT_ACCOUNT_ROWS = [['mergeGate.botAccounts', 'coverage-reporter']];

// The six scenarios of the declared no-CI policy (`mergeGate.noCiPolicy.*`). Each is a non-interactive
// run over a pull request whose head reports no checks, observed as the presence or absence of
// `pr-merge`. All six share the two rows that make the policy reachable at all —
// `mergeGate.requireAllChecks: false`, which is what a GitHub repository without any required check
// needs, and a `mergeGate.noCiPolicy.bases` row — and differ in the single fact each one is about:
// the `unattended` grant, the listed base, a reported check, a failing status read, a failing merge.
// The rows live in the setup ADR of the checkout, and `no-ci-checkout.mjs` gives the sandbox the
// `origin/<base>` copy of that same ADR the resolver's base-blob guard compares it with.
export const NO_CI_UNATTENDED_MERGES_SCENARIO = 'no-ci-policy-unattended-merges';
export const NO_CI_FLAG_ABSENT_SCENARIO = 'no-ci-policy-flag-absent-blocks';
export const NO_CI_REPORTED_CHECK_SCENARIO = 'no-ci-policy-reported-check-blocks';
export const NO_CI_STATUS_FAILURE_SCENARIO = 'no-ci-policy-status-read-failure-blocks';
export const NO_CI_UNLISTED_BASE_SCENARIO = 'no-ci-policy-unlisted-base-blocks';
export const NO_CI_MERGE_FAILURE_SCENARIO = 'no-ci-policy-merge-failure-reports';

// The pull request every fixture of this suite targets is based on `develop`.
const NO_CI_POLICY_ROWS = Object.freeze({
  [NO_CI_UNATTENDED_MERGES_SCENARIO]: [['mergeGate.noCiPolicy.unattended', 'true']],
  [NO_CI_FLAG_ABSENT_SCENARIO]: [],
  [NO_CI_REPORTED_CHECK_SCENARIO]: [['mergeGate.noCiPolicy.unattended', 'true']],
  [NO_CI_STATUS_FAILURE_SCENARIO]: [['mergeGate.noCiPolicy.unattended', 'true']],
  [NO_CI_UNLISTED_BASE_SCENARIO]: [['mergeGate.noCiPolicy.unattended', 'true']],
  [NO_CI_MERGE_FAILURE_SCENARIO]: [['mergeGate.noCiPolicy.unattended', 'true']],
});

export const NO_CI_POLICY_SCENARIOS = Object.freeze(Object.keys(NO_CI_POLICY_ROWS));

// The two repair-accounting scenarios (#662). Both configure the same reviewer as the
// configured-reviewer scenario, receive the `iterate` echo, and run against the real-commit `origin`
// of `repair-origin.mjs`; the echo lands the planned repair at each delegation. The round cap is
// raised so that it can never be what ends either run: a gate without the repair stop would
// delegate a third time long before eight rounds are used, and that third delegation is the
// observation the stop scenario exists to make.
export const REPAIR_AFTER_BASE_MERGE_SCENARIO = 'repair-after-base-merge-merges';
export const REPEATED_INEFFECTIVE_REPAIR_SCENARIO = 'repeated-ineffective-repair-stops';
export const REPAIR_SCENARIOS = Object.freeze([
  REPAIR_AFTER_BASE_MERGE_SCENARIO,
  REPEATED_INEFFECTIVE_REPAIR_SCENARIO,
]);

export const REPAIR_ROWS = [...CONFIGURED_REVIEWER_ROWS, ['mergeGate.maxRounds', '8']];

export function noCiPolicyRows(scenario) {
  const extra = NO_CI_POLICY_ROWS[scenario];
  if (!extra) return null;
  const bases = scenario === NO_CI_UNLISTED_BASE_SCENARIO ? 'main' : 'develop';
  return [['mergeGate.requireAllChecks', 'false'], ['mergeGate.noCiPolicy.bases', bases], ...extra];
}

// The echo and the trace helper it executes, and the path the helper is copied to inside the
// slot's skill tree. Neither is an instrument file: both are hashed as part of `skill`, at the
// sandbox paths the run executes, which is the membership rule stated in `build-identity.mjs`.
const ITERATE_ECHO_SOURCE = resolve(import.meta.dirname, 'iterate-echo.md');
const ITERATE_TRACE_SOURCE = resolve(import.meta.dirname, 'iterate-trace.mjs');
export const ITERATE_TRACE_SKILL_PATH = 'scripts/iterate-trace.mjs';

export function scenarioSetup(scenario) {
  if (scenario === NON_INTERACTIVE_DISPATCH_SCENARIO) {
    return {
      projectSetupRows: NON_INTERACTIVE_DISPATCH_ROWS.map(([key, value]) => [key, value]),
      iterateEcho: false,
    };
  }
  if (scenario === BOT_LOGIN_SCENARIO) {
    return {
      projectSetupRows: BOT_ACCOUNT_ROWS.map(([key, value]) => [key, value]),
      iterateEcho: false,
    };
  }
  const policyRows = noCiPolicyRows(scenario);
  if (policyRows) return { projectSetupRows: policyRows, iterateEcho: false };
  if (REPAIR_SCENARIOS.includes(scenario)) {
    return { projectSetupRows: REPAIR_ROWS.map(([key, value]) => [key, value]), iterateEcho: true };
  }
  if (scenario !== CONFIGURED_REVIEWER_SCENARIO) {
    return { projectSetupRows: [], iterateEcho: false };
  }
  const projectSetupRows = CONFIGURED_REVIEWER_ROWS.map(([key, value]) => [key, value]);
  if (!projectSetupRows.some(([key]) => key === 'mergeGate.bots')) {
    throw new Error(`${scenario}: configured-reviewer setup has no resolved mergeGate.bots row`);
  }
  return { projectSetupRows, iterateEcho: true };
}

// A configured-reviewer or repair-accounting run is one indivisible evidence unit: its call log, its
// build stamp, and its `iterate` echo trace. Every other scenario's unit carries no echo trace, and
// one that appears there is an orphan rather than extra evidence.
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
