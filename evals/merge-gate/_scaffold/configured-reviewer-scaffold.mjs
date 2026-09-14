#!/usr/bin/env node

// Additive wrapper for the sole configured-reviewer scenario. Keeping the established scaffold
// byte-for-byte unchanged preserves the existing five scenarios' scaffold behavior and
// instrumentation membership.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { CONFIGURED_REVIEWER_SCENARIO, scenarioSetup } from './configured-reviewer-scenario.mjs';
import { scenarioBuildIdentity } from './build-identity.mjs';
import { sandboxPaths } from './sandbox.mjs';

const scenario = process.argv[2];
if (scenario !== CONFIGURED_REVIEWER_SCENARIO) {
  process.stderr.write(
    `configured-reviewer scaffold only accepts ${CONFIGURED_REVIEWER_SCENARIO}\n`,
  );
  process.exit(1);
}

execFileSync(process.execPath, [resolve(import.meta.dirname, 'scaffold.mjs'), scenario], {
  stdio: ['ignore', 'inherit', 'inherit'],
});

const { projectRoot, skillRoot, buildIdentity } = sandboxPaths(scenario);
const adr = resolve(projectRoot, 'docs', 'adr', 'effective-flow-project-setup.md');
const setup = scenarioSetup(scenario);
const rows = setup.projectSetupRows
  .map(([key, value]) => `| ${key.padEnd(30)} | ${value.padEnd(14)} |`)
  .join('\n');
const current = readFileSync(adr, 'utf8');
writeFileSync(adr, `${current.trimEnd()}\n${rows}\n`);
execFileSync('git', ['add', 'docs/adr/effective-flow-project-setup.md'], { cwd: projectRoot });
execFileSync('git', ['commit', '--quiet', '--amend', '--no-edit'], { cwd: projectRoot });

// The base scaffold copied production iterate before it stamped the pristine build. Apply the
// scenario overlay to the actual sandbox tree, then replace that stamp with the identity of the
// bytes the run will load.
const identity = scenarioBuildIdentity(scenario, skillRoot);
writeFileSync(buildIdentity, `${JSON.stringify(identity, null, 2)}\n`);
