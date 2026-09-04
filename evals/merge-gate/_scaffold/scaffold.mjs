#!/usr/bin/env node

// Provisions the sandbox one `merge-gate` eval scenario runs against. It is invoked by
// `evals/merge-gate/prepare.mjs`, which an operator runs deliberately before handing a scenario's
// prompt to a fresh agent. Nothing runs it automatically, and it is not on the `pnpm test` path.
//
// It builds `dist/` first, so the skill root it copies is the one the current sources produce
// rather than whatever an earlier build left behind, and then provisions four things:
//
//   <sandbox>/skill/    a copy of the built portable skill root, with the shipped
//                       `scripts/remote-tracker.mjs` replaced by the canned-envelope stub
//   <sandbox>/project/  a temp Git repository standing in for the target project, carrying the
//                       AGENTS.md config marker and the project-setup ADR the scenario needs
//   <sandbox>/fixture.json  the scenario's envelope set, where the stub looks for it
//   <sandbox>/trace/    where the stub appends its call log
//
// The layout itself, and why its base is a fixed absolute path, is `sandbox.mjs`.

import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sandboxPaths } from './sandbox.mjs';
import { scenarioBuildIdentity } from './build-identity.mjs';

const SUITE_ROOT = resolve(import.meta.dirname, '..');
const REPOSITORY_ROOT = resolve(SUITE_ROOT, '..', '..');
const BUILT_SKILL_ROOT = resolve(REPOSITORY_ROOT, 'dist', 'portable', 'effective-flow');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// The scenario's identity is its name, passed through by `prepare.mjs`. It selects the fixture, the
// scenario file and the sandbox, so one suite can hold several scenarios without their sandboxes
// colliding.
const caseName = process.argv[2];
if (!caseName || !/^[a-z0-9][a-z0-9-]*$/.test(caseName)) {
  fail('usage: scaffold.mjs <scenario-name>   (lowercase, digits and hyphens)');
}

const fixturePath = resolve(SUITE_ROOT, 'fixtures', `${caseName}.json`);
if (!existsSync(fixturePath)) fail(`no fixture for case "${caseName}" at ${fixturePath}`);

// A stale build would scaffold a skill root that does not match the source under test, which is the
// one way this suite could report a green result about code nobody is running. So the scaffold
// builds rather than checks: an existence check cannot tell a current `dist/` from a stale one —
// `dist/` is gitignored, so its presence says only that somebody built at some point, on some
// revision — and a staleness check would have to model every input `build.mjs` reads and would be
// wrong the moment one moved. Building removes the failure mode instead of detecting it, and costs
// the operator a step they were performing by hand anyway.
try {
  execFileSync(process.execPath, ['build.mjs'], {
    cwd: REPOSITORY_ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
} catch {
  fail(
    `\`node build.mjs\` failed in ${REPOSITORY_ROOT}; nothing was scaffolded.\nFix the build first — a sandbox provisioned from the previous build would validate instructions the current sources do not contain.`,
  );
}
if (!existsSync(BUILT_SKILL_ROOT)) {
  fail(`\`node build.mjs\` succeeded but produced no skill root at ${BUILT_SKILL_ROOT}`);
}

const {
  sandbox,
  skillRoot,
  projectRoot,
  fixture: sandboxFixture,
  traceDir,
  callLog,
  buildIdentity: buildIdentityPath,
} = sandboxPaths(caseName);

rmSync(sandbox, { recursive: true, force: true });
mkdirSync(traceDir, { recursive: true });

cpSync(BUILT_SKILL_ROOT, skillRoot, { recursive: true });
// The whole point of the sandbox: the gate resolves `<skill-root>/scripts/remote-tracker.mjs` from
// the skill it loaded, so replacing that one file replaces the entire forge input surface of the
// run. `remote-tracker-core.mjs` stays beside it untouched — nothing imports it any more, and
// removing it would make the copied skill root differ from the shipped one for no reason.
cpSync(
  resolve(import.meta.dirname, 'remote-tracker.mjs'),
  resolve(skillRoot, 'scripts', 'remote-tracker.mjs'),
);
cpSync(fixturePath, sandboxFixture);

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

// `merge-gate` reads its configuration from the project-setup ADR, which it locates through the
// canonical marker line in AGENTS.md. Both are written here so the scenario's configuration is
// stated where the gate actually looks for it rather than in the prompt.
const agentsMarkdown = `# AGENTS.md

**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md

This checkout exists only as the target of a \`merge-gate\` behavioural eval run.
`;

// `mergeGate.bots` is deliberately absent. An empty reviewer list satisfies merge preconditions 5,
// 7 and 10 by construction, so the human-comment guard is the only condition a scenario in this
// suite can differ on — which is what lets one scenario isolate that guard and its counterpart
// isolate the merge that follows when nothing holds it.
//
// This table is therefore identical for every scenario, and deliberately so: the scenarios differ
// in their fixtures, in exactly one fact each, and never in their configuration. Only the Context
// prose below names the scenario, because a reader of the sandbox needs to know which one they are
// looking at.
const setupAdr = `# Effective Flow project setup

## Status

Active

## Context

Scenario configuration for the \`${caseName}\` behavioural eval scenario. Every value here exists to
make the human-comment guard the run's single deciding condition; what the scenario's fixture then
decides is whether that guard is active.

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

// `.effective-flow/` must be ignored, or the runtime-state write guard fails closed and the gate
// takes a documented fallback instead of writing its wisdom file. That fallback is correct
// behaviour, but a scenario should exercise the normal path: a run that reports a deviation every
// time trains its reader to skip the deviation section, which is where a real one would appear.
writeFileSync(resolve(projectRoot, '.gitignore'), '.effective-flow/\n');
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

// The run's provenance, written before the run rather than inferred after it. `prepare.mjs`
// archives this beside the call log, and `test/merge-gate-eval.test.mjs` refuses to read a log
// whose stamp no longer matches a fresh build — which is what stops a round observed against one
// version of the gate from going on reporting green against the next one.
//
// It is computed here, after the build above and while the copied tree is still exactly what that
// build produced, because that is the only point where what the run is about to load and what the
// sources currently produce are the same thing by construction. Recomputing it afterwards would be
// reconstruction, and reconstructed provenance is exactly as good as no provenance.
const identity = scenarioBuildIdentity(caseName, BUILT_SKILL_ROOT);
writeFileSync(buildIdentityPath, `${JSON.stringify(identity, null, 2)}\n`);

process.stdout.write(
  [
    `scaffolded ${caseName}`,
    `  skill root: ${skillRoot}`,
    `  project:    ${projectRoot}`,
    `  fixture:    ${sandboxFixture}`,
    `  call log:   ${callLog}`,
    `  build:      ${identity.digest}`,
    '',
  ].join('\n'),
);
