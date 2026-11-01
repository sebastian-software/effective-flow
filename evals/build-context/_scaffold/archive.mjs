// Rejudge actual archived behaviour, rather than treating a current build stamp as a pass.
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { evaluateEvidence } from '../../_scaffold/evaluate.mjs';
import { digest, readRegular } from './transcript.mjs';
import { completionProblems, preparedOf } from './host-receipt.mjs';
export function verifyArchivedScenario(suite, { scenario, slot, directory, identity }) {
  const problems = [];
  try {
    const stem = resolve(directory, 'run-' + slot),
      text = (suffix) => readRegular(stem + suffix, 2 * 1024 * 1024),
      metadata = JSON.parse(text('.metadata.json')),
      stateText = text('.build-context-state.json'),
      state = JSON.parse(stateText);
    if (metadata.scenario !== scenario || metadata.slot !== slot)
      problems.push('foreign archived scenario/slot metadata');
    if (metadata.promptDigest !== digest(text('.prompt.txt')))
      problems.push('archived prompt bytes changed');
    const fixture = JSON.parse(
      readRegular(resolve(suite.root, 'fixtures', scenario + '.json'), 256 * 1024),
    );
    if (metadata.fixtureDigest !== digest(JSON.stringify(fixture, null, 2) + '\n'))
      problems.push('archived fixture binding changed');
    const result = evaluateEvidence(suite, {
      scenario,
      logText: text('.jsonl'),
      fixture,
      projectRoot: metadata.projectRoot,
      buildIdentity: JSON.parse(text('.build.json')),
      expectedBuildIdentity: identity,
      sealedEvidenceText: stateText,
    });
    problems.push(...result.validityProblems, ...result.findings);
    for (const run of state.variants ?? []) {
      problems.push(...completionProblems(run));
      const prepared = preparedOf(run);
      if (prepared.scenario !== scenario || prepared.variant !== run.name || prepared.slot !== slot)
        problems.push('host prelaunch scenario/variant/slot differs from archive');
      if (!isDeepStrictEqual(prepared.profile, metadata.profile))
        problems.push('host profile differs from archive root receipt');
    }
  } catch (error) {
    problems.push('unreadable actual archived evidence: ' + error.message);
  }
  return problems;
}
export function archiveReuseProblems(suite, resultsDir) {
  const problems = [],
    sessions = new Set(),
    sources = new Set(),
    launches = new Set();
  for (const scenario of suite.scenarios) {
    const directory = resolve(resultsDir, scenario);
    if (!existsSync(directory)) continue;
    const slots = readdirSync(directory)
      .filter((n) => /^run-\d+\.jsonl$/.test(n))
      .map((n) => Number(n.match(/\d+/)[0]))
      .sort((a, b) => a - b);
    if (JSON.stringify(slots) !== '[1,2,3,4,5]')
      problems.push(scenario + ': exactly five valid archive slots required');
    for (const slot of slots) {
      try {
        const state = JSON.parse(
          readRegular(
            resolve(directory, 'run-' + slot + '.build-context-state.json'),
            2 * 1024 * 1024,
          ),
        );
        for (const run of state.variants ?? []) {
          const id = run.provenance?.payload?.launch?.seal;
          if (!id || launches.has(id))
            problems.push('missing/reused actual launch across behavioural slots');
          launches.add(id);
          for (const observation of run.observations ?? []) {
            if (sessions.has(observation.sessionIdentity) || sources.has(observation.sourceDigest))
              problems.push('actual session/transcript recounted across behavioural recordings');
            sessions.add(observation.sessionIdentity);
            sources.add(observation.sourceDigest);
          }
        }
      } catch (error) {
        problems.push(scenario + ': ' + error.message);
      }
    }
  }
  return problems;
}
