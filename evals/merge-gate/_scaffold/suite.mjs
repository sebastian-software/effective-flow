import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateScenarioName } from './sandbox.mjs';

export const SUITE_ROOT = resolve(import.meta.dirname, '..');
export const REQUIRED_RUNS = 5;
export const OUTCOME_EVALUATORS = Object.freeze([
  'configured-reviewer-set-aside-blocks',
  'guard-blocks-merge',
  'linked-issue-open-points',
  'merge-proceeds',
  'unreported-checks-at-phase-four',
  'unreported-checks-block-merge',
]);

function basenames(directory, extension) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(extension))
    .map((name) => name.slice(0, -extension.length))
    .sort();
}

export function discoverSuite(root = SUITE_ROOT) {
  const scenarios = basenames(resolve(root, 'scenarios'), '.md');
  const fixtures = basenames(resolve(root, 'fixtures'), '.json');
  for (const name of [...scenarios, ...fixtures]) validateScenarioName(name);
  const evaluators = [...OUTCOME_EVALUATORS].sort();
  const sets = { scenarios, fixtures, evaluators };
  const all = [...new Set([...scenarios, ...fixtures, ...evaluators])].sort();
  const mismatches = all
    .map((name) => ({
      name,
      missing: Object.entries(sets)
        .filter(([, names]) => !names.includes(name))
        .map(([kind]) => kind),
    }))
    .filter(({ missing }) => missing.length > 0);
  if (mismatches.length > 0) {
    throw new Error(
      `merge-gate eval corpus is out of parity: ${mismatches.map(({ name, missing }) => `${name} missing ${missing.join(', ')}`).join('; ')}`,
    );
  }
  if (scenarios.length === 0)
    throw new Error(`no scenarios found under ${resolve(root, 'scenarios')}`);
  return { root: resolve(root), scenarios };
}

export function selectScenarios(requested = [], root = SUITE_ROOT) {
  const suite = discoverSuite(root);
  if (requested.length === 0) return suite.scenarios;
  const selected = [...new Set(requested)];
  const unknown = selected.filter((name) => !suite.scenarios.includes(name));
  if (unknown.length > 0) throw new Error(`unknown scenario(s): ${unknown.join(', ')}`);
  return selected.sort();
}
