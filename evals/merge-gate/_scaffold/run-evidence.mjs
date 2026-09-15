// Run-evidence transaction shared by the preparation CLI and its focused tests. A configured
// reviewer run is one three-file unit; every other run remains the established call-log/build pair.

import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import process from 'node:process';
import { resolve } from 'node:path';

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

// Stage a run's complete evidence first, then publish the final names under one synchronous archive
// transaction. If a rename fails, every final file from this attempt is rolled back and the sandbox
// originals remain intact. A process crash is detected on the next invocation by the pairing check.
export function archiveEvidence(scenarioResults, runNumber, sources) {
  const staging = resolve(scenarioResults, `.run-${runNumber}.staging-${process.pid}`);
  const finals = [];
  mkdirSync(staging);
  try {
    for (const [suffix, source] of sources) {
      const name = `run-${runNumber}.${suffix}`;
      copyFileSync(source, resolve(staging, name));
      finals.push([resolve(staging, name), resolve(scenarioResults, name)]);
    }
    const published = [];
    try {
      for (const [from, to] of finals) {
        renameSync(from, to);
        published.push(to);
      }
    } catch (error) {
      for (const path of published) rmSync(path, { force: true });
      throw error;
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
