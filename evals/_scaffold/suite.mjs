import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateScenarioName } from './sandbox.mjs';

export const REQUIRED_RUNS = 5;

function basenames(directory, extension) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(extension))
    .map((name) => name.slice(0, -extension.length))
    .sort();
}

// The parity contract, over the four places a scenario has to exist: its prose-and-prompt file, its
// fixture, the suite's own scenario registry, and the set of names its evaluator actually branches
// on. The registry is read from the suite configuration rather than declared here, and that is the
// whole reason it lives there: this file is one of the suite's instrument files, so a registry entry
// added here would move the instrument digest and stale every archived round for a change that
// altered nothing any run did. The configuration is not hashed, so adding a scenario costs the
// scenario's own evidence and no other's.
//
// The evaluator's branch list is the fourth member for the other half of that trade. Registration
// became cheap, so a registered name the evaluator does not recognise became cheap too — and a
// scenario nothing asserts about is worse than a missing one, because it publishes green. Requiring
// the evaluator to name what it branches on turns that into the same loud parity failure a missing
// fixture already is.
export function discoverSuite(suite) {
  const root = resolve(suite.root);
  const scenarios = basenames(resolve(root, 'scenarios'), '.md');
  const fixtures = basenames(resolve(root, 'fixtures'), '.json');
  for (const name of [...scenarios, ...fixtures]) validateScenarioName(name);
  const evaluators = [...suite.scenarios].sort();
  const branches = [...suite.evaluator.BRANCHED_SCENARIOS].sort();
  const sets = { scenarios, fixtures, evaluators, branches };
  const all = [...new Set([...scenarios, ...fixtures, ...evaluators, ...branches])].sort();
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
      `${suite.name} eval corpus is out of parity: ${mismatches.map(({ name, missing }) => `${name} missing ${missing.join(', ')}`).join('; ')}`,
    );
  }
  if (scenarios.length === 0)
    throw new Error(`no scenarios found under ${resolve(root, 'scenarios')}`);
  return { root, scenarios };
}

export function selectScenarios(suite, requested = []) {
  const discovered = discoverSuite(suite);
  if (requested.length === 0) return discovered.scenarios;
  const selected = [...new Set(requested)];
  const unknown = selected.filter((name) => !discovered.scenarios.includes(name));
  if (unknown.length > 0) throw new Error(`unknown scenario(s): ${unknown.join(', ')}`);
  return selected.sort();
}
