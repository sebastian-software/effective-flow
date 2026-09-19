// Scenario-local setup for the one configured-reviewer scenario. Every other scenario keeps the
// shared no-reviewer project configuration and the production `iterate` tool; this module is the
// single place that decides which scenario receives the reviewer rows, the `iterate` echo overlay,
// and the paired `run-<n>.iterate.jsonl` evidence file.

export const CONFIGURED_REVIEWER_SCENARIO = 'configured-reviewer-set-aside-blocks';

export const CONFIGURED_REVIEWER_ROWS = [
  ['mergeGate.bots', 'recensor'],
  ['mergeGate.bots.recensor.trigger', '@recensor review'],
  ['mergeGate.bots.recensor.check', 'recensor'],
];

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
