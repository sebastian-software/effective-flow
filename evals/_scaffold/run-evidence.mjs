// Run-evidence pairing shared by round publication and its focused tests. A run of a scenario the
// suite pairs with auxiliary evidence is one three-file unit — call log, build stamp, and that
// second file; every other run remains the established call-log/build pair. For `merge-gate` the
// second file is the configured-reviewer scenario's `iterate` echo trace. A suite that also
// declares sealed evidence adds it as one more partner: every `iterate` run is a four-file unit of
// call log, stamp, exit-channel record and sealed git state. Publication additionally
// requires each slot's rendered prompt and metadata, and checks the exact file set itself; this
// check runs first so a broken unit is reported as the pairing it breaks.

import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Where the sealing step writes a suite's sealed evidence inside an attempt, or `null` for a suite
// that declares none. Beside the call log under `trace/`, named by the suite. It lives here rather
// than in `sandbox.mjs` because that module is hashed into every suite's instrument, and a path a
// later hook added must not move the identity of a suite that declares no such hook.
export function sealedEvidencePath(suite, paths) {
  const sealed = suite.sealedEvidence;
  if (!sealed) return null;
  return resolve(paths.traceDir, sealed.fileName);
}

// `auxiliary` is `null` for a suite that records no second file; otherwise one partner
// `{ suffix, required }` or a list of them: each partner's archived suffix, and whether this
// scenario's runs must carry it. A suite with an exit-channel trace and a sealed git state pairs
// both with every run.
export function validateArchivedPairing(scenarioResults, auxiliary = null) {
  if (!existsSync(scenarioResults)) return;
  const partners = auxiliary === null ? [] : Array.isArray(auxiliary) ? auxiliary : [auxiliary];
  const names = readdirSync(scenarioResults);
  const logs = new Set(
    names.filter((name) => /^run-\d+\.jsonl$/.test(name)).map((name) => name.match(/\d+/)[0]),
  );
  const builds = new Set(
    names.filter((name) => /^run-\d+\.build\.json$/.test(name)).map((name) => name.match(/\d+/)[0]),
  );
  const partnerRuns = partners.map(({ suffix, required }) => {
    const pattern = new RegExp(`^run-(\\d+)\\.${suffix.replaceAll('.', '\\.')}$`);
    const runs = new Set(
      names
        .map((name) => pattern.exec(name))
        .filter(Boolean)
        .map((match) => match[1]),
    );
    return { suffix, required: required === true, runs };
  });
  const all = new Set([...logs, ...builds, ...partnerRuns.flatMap(({ runs }) => [...runs])]);
  for (const run of all) {
    const missing = [];
    if (!logs.has(run)) missing.push(`run-${run}.jsonl`);
    if (!builds.has(run)) missing.push(`run-${run}.build.json`);
    for (const { suffix, required, runs } of partnerRuns) {
      if (required && !runs.has(run)) missing.push(`run-${run}.${suffix}`);
      if (!required && runs.has(run)) {
        throw new Error(
          `${scenarioResults}: run-${run}.${suffix} is orphaned in a scenario that records no auxiliary evidence`,
        );
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `${scenarioResults}: run ${run} has incomplete evidence; missing ${missing.join(', ')}`,
      );
    }
  }
}
