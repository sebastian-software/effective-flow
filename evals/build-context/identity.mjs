#!/usr/bin/env node
// Read-only identity preparation. The baseline has its own built file set and never loads the
// candidate helper; the candidate uses the shared scaffold's authoritative normalization.
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  builtSkillIdentity,
  instrumentIdentity,
  pristineScenarioBuildIdentity,
} from '../_scaffold/build-identity.mjs';
import suite from './suite.config.mjs';
import { digest } from './_scaffold/transcript.mjs';
const walk = (root, prefix = '') =>
  readdirSync(root, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(resolve(root, e.name), prefix + e.name + '/') : [prefix + e.name],
  );
try {
  const [baselineRoot, candidateRoot, ...rest] = process.argv.slice(2);
  if (!baselineRoot || !candidateRoot || rest.length)
    throw Error(
      'usage: node evals/build-context/identity.mjs BASELINE_PORTABLE_SKILL CANDIDATE_PORTABLE_SKILL',
    );
  const candidate = pristineScenarioBuildIdentity(
    suite,
    'approved-single-module',
    resolve(candidateRoot),
  );
  const instrument = instrumentIdentity(suite);
  const seed = walk(resolve(baselineRoot))
    .filter((p) => p.endsWith('.md') || p.startsWith('scripts/'))
    .filter((p) => !p.startsWith('scripts/remote-tracker'));
  const skill = builtSkillIdentity(resolve(baselineRoot), seed);
  const scenario_inputs = candidate.scenario_inputs;
  const baseline = {
    scenario: 'approved-single-module',
    digest: digest([skill.digest, instrument.digest, scenario_inputs.digest].join('\n')),
    skill,
    instrument,
    scenario_inputs,
  };
  process.stdout.write(
    JSON.stringify(
      {
        baselineIdentity: baseline,
        candidateIdentity: candidate,
        instrumentDigest: instrument.digest,
      },
      null,
      2,
    ) + '\n',
  );
} catch (error) {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
}
