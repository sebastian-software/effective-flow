#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { resolve } from 'node:path';
import { digestFile, scenarioBuildIdentity } from './build-identity.mjs';
import { digestText, promptTemplate, renderPrompt } from './prompt.mjs';
import { sandboxPaths } from './sandbox.mjs';
import { SUITE_ROOT } from './suite.mjs';

const TRACKER_STUB = resolve(import.meta.dirname, 'remote-tracker.mjs');

function writeProject(projectRoot, scenario, fixture) {
  const agentsMarkdown = `# AGENTS.md

**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md

This checkout exists only as the target of a \`merge-gate\` behavioural eval run.
`;
  const setupAdr = `# Effective Flow project setup

## Status

Active

## Context

Scenario configuration for the \`${scenario}\` behavioural eval scenario.

## Configuration

| Key                              | Value          |
| -------------------------------- | -------------- |
| language.project                 | en             |
| language.source                  | en             |
| language.documentation.technical | en            |
| language.workflow                | en             |
| language.forge                   | en             |
| language.git                     | en             |
| plan.dir                         | docs/plan      |
| tracker.mode                     | remote         |
| worktree.enabled                 | false          |
| delivery.baseBranch              | origin/develop |
| delivery.mergeMethod             | squash         |
| mergeGate.completion             | merge          |
| mergeGate.requireAllChecks       | true           |
| mergeGate.conflictResolution     | off            |
| mergeGate.maxRounds              | 2              |
`;

  mkdirSync(resolve(projectRoot, 'docs', 'adr'), { recursive: true });
  writeFileSync(resolve(projectRoot, 'AGENTS.md'), agentsMarkdown);
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

export function provisionSlot({
  roundRoot,
  scenario,
  slot,
  attempt,
  builtSkillRoot,
  profile,
  identity = scenarioBuildIdentity(scenario, builtSkillRoot),
}) {
  const paths = sandboxPaths(roundRoot, scenario, slot, attempt);
  const fixturePath = resolve(SUITE_ROOT, 'fixtures', `${scenario}.json`);
  const scenarioPath = resolve(SUITE_ROOT, 'scenarios', `${scenario}.md`);
  if (!existsSync(fixturePath)) throw new Error(`no fixture for ${scenario} at ${fixturePath}`);

  rmSync(paths.attemptRoot, { recursive: true, force: true });
  mkdirSync(paths.traceDir, { recursive: true });
  cpSync(builtSkillRoot, paths.skillRoot, { recursive: true });
  cpSync(TRACKER_STUB, resolve(paths.skillRoot, 'scripts', 'remote-tracker.mjs'));
  cpSync(fixturePath, paths.fixture);
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  writeProject(paths.projectRoot, scenario, fixture);

  const prompt = renderPrompt(promptTemplate(scenarioPath), paths);
  writeFileSync(paths.prompt, prompt);
  writeFileSync(paths.buildIdentity, `${JSON.stringify(identity, null, 2)}\n`);
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
    trackerStub: digestFile(resolve(paths.skillRoot, 'scripts', 'remote-tracker.mjs')),
    buildIdentity: digestFile(paths.buildIdentity),
  };
  return { paths, prompt, metadata, identity, preparedDigests };
}

// The coordinator imports `provisionSlot`; this small CLI seam is retained for deterministic
// local diagnostics and never launches a model.
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  process.stderr.write(
    'scaffold.mjs is an internal provisioner; use `pnpm merge-gate-eval prepare` instead.\n',
  );
  process.exitCode = 2;
}
