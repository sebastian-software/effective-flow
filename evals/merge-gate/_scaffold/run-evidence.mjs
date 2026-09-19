// Run-evidence pairing shared by round publication and its focused tests. A configured-reviewer
// run is one three-file unit — call log, build stamp, and `iterate` echo trace; every other run
// remains the established call-log/build pair. Publication additionally requires each slot's
// rendered prompt and metadata, and checks the exact file set itself; this check runs first so a
// broken unit is reported as the pairing it breaks.

import { existsSync, readdirSync } from 'node:fs';

export function validateArchivedPairing(scenarioResults, requiresIterateTrace) {
  if (!existsSync(scenarioResults)) return;
  const names = readdirSync(scenarioResults);
  const logs = new Set(
    names.filter((name) => /^run-\d+\.jsonl$/.test(name)).map((name) => name.match(/\d+/)[0]),
  );
  const builds = new Set(
    names.filter((name) => /^run-\d+\.build\.json$/.test(name)).map((name) => name.match(/\d+/)[0]),
  );
  const iterate = new Set(
    names
      .filter((name) => /^run-\d+\.iterate\.jsonl$/.test(name))
      .map((name) => name.match(/\d+/)[0]),
  );
  const all = new Set([...logs, ...builds, ...iterate]);
  for (const run of all) {
    const missing = [];
    if (!logs.has(run)) missing.push(`run-${run}.jsonl`);
    if (!builds.has(run)) missing.push(`run-${run}.build.json`);
    if (requiresIterateTrace && !iterate.has(run)) missing.push(`run-${run}.iterate.jsonl`);
    if (!requiresIterateTrace && iterate.has(run)) {
      throw new Error(
        `${scenarioResults}: run-${run}.iterate.jsonl is orphaned in a scenario without an echo`,
      );
    }
    if (missing.length > 0) {
      throw new Error(
        `${scenarioResults}: run ${run} has incomplete evidence; missing ${missing.join(', ')}`,
      );
    }
  }
}
