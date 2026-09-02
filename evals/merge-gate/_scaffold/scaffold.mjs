#!/usr/bin/env node

// Provisions the sandbox one `merge-gate` eval case runs against. It is invoked from the case
// directory's `scaffold.sh`, which `case.yaml` names as `context.scaffold_script` — and which the
// harness runs only when the operator passes `--scaffold`. That flag is off by default and its help
// text says it "runs author-supplied bash as you", so read `evals/merge-gate/README.md` before
// enabling it on a case file you did not write.
//
// Four things are provisioned:
//
//   <sandbox>/skill/    a copy of the built portable skill root, with the shipped
//                       `scripts/remote-tracker.mjs` replaced by the canned-envelope stub
//   <sandbox>/project/  a temp Git repository standing in for the target project, carrying the
//                       AGENTS.md config marker and the project-setup ADR the scenario needs
//   <sandbox>/fixture.json  the scenario's envelope set, where the stub looks for it
//   <sandbox>/trace/    where the stub appends its call log
//
// The sandbox path is a fixed absolute location rather than something derived from the run's
// working directory, because the case prompt has to name both the skill root and the project
// checkout literally and cannot know where the harness rooted the run.

import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SUITE_ROOT = resolve(import.meta.dirname, '..');
const REPOSITORY_ROOT = resolve(SUITE_ROOT, '..', '..');
const BUILT_SKILL_ROOT = resolve(REPOSITORY_ROOT, 'dist', 'portable', 'effective-flow');

export const SANDBOX_BASE = '/tmp/effective-flow-merge-gate-eval';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// The scenario's identity is the case directory name, passed through by `scaffold.sh`. It selects
// both the fixture and the sandbox, so one suite can hold several scenarios without their sandboxes
// colliding.
const caseName = process.argv[2];
if (!caseName || !/^[a-z0-9][a-z0-9-]*$/.test(caseName)) {
  fail('usage: scaffold.mjs <case-name>   (lowercase, digits and hyphens)');
}

const fixturePath = resolve(SUITE_ROOT, 'fixtures', `${caseName}.json`);
if (!existsSync(fixturePath)) fail(`no fixture for case "${caseName}" at ${fixturePath}`);

// A stale build would scaffold a skill root that does not match the source under test, which is the
// one way this suite could report a green result about code nobody is running. Refuse rather than
// build silently: the build is the operator's step, and its output is gitignored.
if (!existsSync(BUILT_SKILL_ROOT)) {
  fail(
    `no built skill root at ${BUILT_SKILL_ROOT}\nRun \`node build.mjs\` in ${REPOSITORY_ROOT} first, so the scaffold copies the current sources.`,
  );
}

const sandbox = resolve(SANDBOX_BASE, caseName);
const skillRoot = resolve(sandbox, 'skill');
const projectRoot = resolve(sandbox, 'project');

rmSync(sandbox, { recursive: true, force: true });
mkdirSync(resolve(sandbox, 'trace'), { recursive: true });

cpSync(BUILT_SKILL_ROOT, skillRoot, { recursive: true });
// The whole point of the sandbox: the gate resolves `<skill-root>/scripts/remote-tracker.mjs` from
// the skill it loaded, so replacing that one file replaces the entire forge input surface of the
// run. `remote-tracker-core.mjs` stays beside it untouched — nothing imports it any more, and
// removing it would make the copied skill root differ from the shipped one for no reason.
cpSync(
  resolve(import.meta.dirname, 'remote-tracker.mjs'),
  resolve(skillRoot, 'scripts', 'remote-tracker.mjs'),
);
cpSync(fixturePath, resolve(sandbox, 'fixture.json'));

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

// `merge-gate` reads its configuration from the project-setup ADR, which it locates through the
// canonical marker line in AGENTS.md. Both are written here so the scenario's configuration is
// stated where the gate actually looks for it rather than in the prompt.
const agentsMarkdown = `# AGENTS.md

**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md

This checkout exists only as the target of a \`merge-gate\` behavioural eval run.
`;

// `mergeGate.bots` is deliberately absent. An empty reviewer list satisfies merge preconditions 5
// and 7 by construction, so the only condition this scenario can fail on is condition 4, the
// human-comment guard — which is what makes the assertion an isolation of that guard rather than a
// statement about the gate as a whole.
const setupAdr = `# Effective Flow project setup

## Status

Active

## Context

Scenario configuration for the \`${caseName}\` behavioural eval case. Every value here exists to make
the human-comment guard the single deciding condition of the run.

## Configuration

| Key                            | Value          |
| ------------------------------ | -------------- |
| language.project               | en             |
| language.source                | en             |
| language.documentation.technical | en           |
| language.workflow              | en             |
| language.forge                 | en             |
| language.git                   | en             |
| plan.dir                       | docs/plan      |
| tracker.mode                   | remote         |
| worktree.enabled               | false          |
| delivery.baseBranch            | origin/develop |
| delivery.mergeMethod           | squash         |
| mergeGate.completion           | merge          |
| mergeGate.requireAllChecks     | true           |
| mergeGate.conflictResolution   | off            |
| mergeGate.maxRounds            | 2              |
`;

mkdirSync(resolve(projectRoot, 'docs', 'adr'), { recursive: true });
writeFileSync(resolve(projectRoot, 'AGENTS.md'), agentsMarkdown);
writeFileSync(resolve(projectRoot, 'docs', 'adr', 'effective-flow-project-setup.md'), setupAdr);
writeFileSync(
  resolve(projectRoot, 'README.md'),
  `# ${fixture.repository.owner}/${fixture.repository.repository}\n\nEval sandbox checkout.\n`,
);

const git = (...args) =>
  execFileSync('git', args, { cwd: projectRoot, stdio: ['ignore', 'ignore', 'inherit'] });

// A real repository with a real origin, because the gate's own preflight resolves the provider from
// `origin` before any helper call it could be stubbed at. The origin URL matches the fixture's
// repository so the stubbed envelopes and the checkout describe the same pull request.
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

process.stdout.write(
  [
    `scaffolded ${caseName}`,
    `  skill root: ${skillRoot}`,
    `  project:    ${projectRoot}`,
    `  fixture:    ${resolve(sandbox, 'fixture.json')}`,
    `  call log:   ${resolve(sandbox, 'trace', 'tracker-calls.jsonl')}`,
    '',
  ].join('\n'),
);
