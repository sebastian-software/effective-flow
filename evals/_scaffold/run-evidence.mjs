// Run-evidence pairing shared by round publication and its focused tests. A run of a scenario the
// suite pairs with auxiliary evidence is one three-file unit — call log, build stamp, and that
// second file; every other run remains the established call-log/build pair. For `merge-gate` the
// second file is the configured-reviewer scenario's `iterate` echo trace. Publication additionally
// requires each slot's rendered prompt and metadata, and checks the exact file set itself; this
// check runs first so a broken unit is reported as the pairing it breaks.

import { existsSync, readdirSync } from 'node:fs';

// `auxiliary` is `null` for a suite that records no second file, and otherwise
// `{ suffix, required }`: the archived suffix, and whether this scenario's runs must carry it.
export function validateArchivedPairing(scenarioResults, auxiliary = null) {
  if (!existsSync(scenarioResults)) return;
  const suffix = auxiliary?.suffix;
  const required = auxiliary?.required === true;
  const names = readdirSync(scenarioResults);
  const logs = new Set(
    names.filter((name) => /^run-\d+\.jsonl$/.test(name)).map((name) => name.match(/\d+/)[0]),
  );
  const builds = new Set(
    names.filter((name) => /^run-\d+\.build\.json$/.test(name)).map((name) => name.match(/\d+/)[0]),
  );
  const auxiliaryPattern =
    suffix === undefined ? null : new RegExp(`^run-(\\d+)\\.${suffix.replaceAll('.', '\\.')}$`);
  const auxiliaryRuns = new Set(
    auxiliaryPattern === null
      ? []
      : names
          .map((name) => auxiliaryPattern.exec(name))
          .filter(Boolean)
          .map((match) => match[1]),
  );
  const all = new Set([...logs, ...builds, ...auxiliaryRuns]);
  for (const run of all) {
    const missing = [];
    if (!logs.has(run)) missing.push(`run-${run}.jsonl`);
    if (!builds.has(run)) missing.push(`run-${run}.build.json`);
    if (required && !auxiliaryRuns.has(run)) missing.push(`run-${run}.${suffix}`);
    if (!required && auxiliaryRuns.has(run)) {
      throw new Error(
        `${scenarioResults}: run-${run}.${suffix} is orphaned in a scenario that records no auxiliary evidence`,
      );
    }
    if (missing.length > 0) {
      throw new Error(
        `${scenarioResults}: run ${run} has incomplete evidence; missing ${missing.join(', ')}`,
      );
    }
  }
}
