import { resolve } from 'node:path';
import { sandboxPaths } from './sandbox.mjs';

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

export function iterateTracePath(scenario) {
  return resolve(sandboxPaths(scenario).traceDir, 'iterate-calls.jsonl');
}
