#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { resolve } from 'node:path';
import {
  applyScenarioSkillOverlay,
  digestFile,
  pristineScenarioBuildIdentity,
  scenarioBuildIdentity,
} from './build-identity.mjs';
import { digestText, promptTemplate, renderPrompt } from './prompt.mjs';
import { auxiliaryLogPath, sandboxPaths } from './sandbox.mjs';

// The one destination a tracker stub is ever copied to inside a slot's skill tree: the shipped
// helper's own path, so the copy overwrites it.
//
// **It is a constant in this instrument file rather than a suite-declared value, and that is the
// point.** Every scenario prompt drives `node <skill root>/scripts/remote-tracker.mjs` by hand, and
// the load set excludes that path together with its `-core.mjs` half precisely because the stub
// replaces it — see the exclusion rationale in a suite's seed declaration. A destination a suite
// could set would make both of those conditional on an unhashed value: point it one file sideways
// and the stub lands somewhere nothing reads, the shipped helper survives in the copied tree, and
// every prompt drives the real helper against a real forge — with no digest moving, because the
// exclusion assumed the replacement that no longer happens. Declared here, it is covered by this
// file's own instrument hash, and there is no second copy to diverge from.
export const TRACKER_STUB_SKILL_PATH = 'scripts/remote-tracker.mjs';

// The two sandbox documents come from the suite: their rows are statements about what the tool
// under test sees, and only the suite knows which tool that is. Everything below them — the seeded
// README, the ignore file and the git history the checkout needs to look like a checkout — is the
// same for any suite and stays here.
function writeProject(suite, projectRoot, scenario, fixture, projectSetupRows) {
  const { agents, setupAdr } = suite.projectDocuments({ scenario, rows: projectSetupRows });

  mkdirSync(resolve(projectRoot, 'docs', 'adr'), { recursive: true });
  writeFileSync(resolve(projectRoot, 'AGENTS.md'), agents);
  writeFileSync(resolve(projectRoot, 'docs', 'adr', 'effective-flow-project-setup.md'), setupAdr);
  writeFileSync(resolve(projectRoot, '.gitignore'), '.effective-flow/\n');
  writeFileSync(
    resolve(projectRoot, 'README.md'),
    `# ${fixture.repository.owner}/${fixture.repository.repository}\n\nEval sandbox checkout.\n`,
  );

  const git = (...args) =>
    execFileSync('git', args, { cwd: projectRoot, stdio: ['ignore', 'ignore', 'inherit'] });
  git('init', '--quiet', '--initial-branch=develop');
  git('config', 'user.email', 'eval@example.invalid');
  git('config', 'user.name', 'Effective Flow Eval');
  git('config', 'commit.gpgsign', 'false');
  git(
    'remote',
    'add',
    'origin',
    `https://${fixture.repository.host}/${fixture.repository.owner}/${fixture.repository.repository}.git`,
  );
  git('add', '--all');
  git('commit', '--quiet', '--message', 'chore: seed the eval sandbox checkout');
}

export function provisionSlot(
  suite,
  { roundRoot, scenario, slot, attempt, builtSkillRoot, profile, identity },
) {
  const paths = sandboxPaths(roundRoot, scenario, slot, attempt);
  const resolvedIdentity =
    identity ?? pristineScenarioBuildIdentity(suite, scenario, builtSkillRoot);
  const fixturePath = resolve(suite.root, 'fixtures', `${scenario}.json`);
  const scenarioPath = resolve(suite.root, 'scenarios', `${scenario}.md`);
  if (!existsSync(fixturePath)) throw new Error(`no fixture for ${scenario} at ${fixturePath}`);

  rmSync(paths.attemptRoot, { recursive: true, force: true });
  mkdirSync(paths.traceDir, { recursive: true });
  cpSync(builtSkillRoot, paths.skillRoot, { recursive: true });
  cpSync(suite.trackerStub.source, resolve(paths.skillRoot, TRACKER_STUB_SKILL_PATH));
  cpSync(fixturePath, paths.fixture);
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  // A suite decides per scenario which project-setup rows and which skill overlay a slot receives.
  // For `merge-gate` the configured-reviewer scenario alone receives the reviewer rows and replaces
  // this slot's copy of `tools/iterate.md` with the echo; every other scenario keeps the base
  // configuration and production `iterate`. The overlay lands in the slot's own skill copy, never in
  // the round's shared build. An overlaid scenario's auxiliary trace starts empty so that a run
  // which never delegates still leaves the paired evidence file, and the absence of an echo record
  // reads as the finding it is.
  const setup = suite.scenarioSetup(scenario);
  applyScenarioSkillOverlay(suite, scenario, paths.skillRoot);
  const auxiliaryLog = auxiliaryLogPath(suite, paths);
  if (auxiliaryLog && suite.auxiliaryEvidence.required(scenario)) writeFileSync(auxiliaryLog, '');
  writeProject(suite, paths.projectRoot, scenario, fixture, setup.projectSetupRows);
  const provisionedIdentity = scenarioBuildIdentity(suite, scenario, paths.skillRoot);
  if (JSON.stringify(provisionedIdentity) !== JSON.stringify(resolvedIdentity)) {
    throw new Error(
      `${scenario}/${slot}: provisioned skill does not match the round build identity`,
    );
  }

  const prompt = renderPrompt(promptTemplate(scenarioPath), paths);
  writeFileSync(paths.prompt, prompt);
  writeFileSync(paths.buildIdentity, `${JSON.stringify(resolvedIdentity, null, 2)}\n`);
  const metadata = {
    schemaVersion: 1,
    scenario,
    slot,
    attempt,
    projectRoot: paths.projectRoot,
    skillRoot: paths.skillRoot,
    promptDigest: digestText(prompt),
    fixtureDigest: digestFile(paths.fixture),
    profile,
  };
  writeFileSync(paths.runMetadata, `${JSON.stringify(metadata, null, 2)}\n`);
  const preparedDigests = {
    fixture: digestFile(paths.fixture),
    projectAgents: digestFile(resolve(paths.projectRoot, 'AGENTS.md')),
    projectConfig: digestFile(
      resolve(paths.projectRoot, 'docs', 'adr', 'effective-flow-project-setup.md'),
    ),
    prompt: digestFile(paths.prompt),
    runMetadata: digestFile(paths.runMetadata),
    trackerStub: digestFile(resolve(paths.skillRoot, TRACKER_STUB_SKILL_PATH)),
    buildIdentity: digestFile(paths.buildIdentity),
  };
  return { paths, prompt, metadata, identity: resolvedIdentity, preparedDigests };
}

// The coordinator imports `provisionSlot`; this small CLI seam is retained for deterministic
// local diagnostics and never launches a model.
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  process.stderr.write(
    'scaffold.mjs is an internal provisioner; use `pnpm eval <tool> prepare` instead.\n',
  );
  process.exitCode = 2;
}
