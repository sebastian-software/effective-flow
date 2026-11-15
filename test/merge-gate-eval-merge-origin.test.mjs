import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { writeProject } from '../evals/_scaffold/scaffold.mjs';
import {
  HEAD_CHANGE_PATH,
  HEAD_CHANGE_TEXT,
  MERGE_ORIGIN_SCENARIOS,
} from '../evals/merge-gate/_scaffold/merge-origin.mjs';
import suite from '../evals/merge-gate/suite.config.mjs';

// Every merge-gate Phase 4 fetches `develop` and `refs/pull/<N>/head` from `origin` and runs
// `conflict-validation.mjs quick-marker-scan` over the pull request's range, and a failed fetch or
// scan counts as a found marker and blocks the merge. A scenario whose expected outcome is a merge
// therefore needs a checkout on which that scan runs and finds nothing; otherwise its expected merge
// is unreachable for a reason about the bench. This file provisions every such scenario exactly as a
// slot does and runs the gate's two fetches and the shipped scan on it.

const REPOSITORY = resolve(import.meta.dirname, '..');
const SUITE_ROOT = resolve(REPOSITORY, 'evals', 'merge-gate');
const FIXTURE_DIR = resolve(SUITE_ROOT, 'fixtures');
const CONFLICT_VALIDATION = resolve(REPOSITORY, 'src', 'scripts', 'conflict-validation.mjs');
const CONFIG_RESOLVE = resolve(REPOSITORY, 'src', 'scripts', 'config-resolve.mjs');

function childEnv() {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv(),
  }).trim();
}

function loadFixture(scenario) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${scenario}.json`), 'utf8'));
}

function helper(script, operation, input) {
  const result = spawnSync(process.execPath, [script, operation], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: childEnv(),
  });
  return JSON.parse(result.stdout);
}

function provision(scenario) {
  const attempt = mkdtempSync(join(tmpdir(), 'effective-flow-merge-origin-'));
  const projectRoot = join(attempt, 'project');
  mkdirSync(projectRoot);
  const fixture = loadFixture(scenario);
  writeProject(
    suite,
    projectRoot,
    scenario,
    fixture,
    suite.scenarioSetup(scenario).projectSetupRows,
  );
  return { attempt, projectRoot, remote: join(attempt, 'remote.git'), fixture };
}

// The scenarios the gate is expected to attempt the merge in are the ones whose fixture serves it.
const MERGING_SCENARIOS = readdirSync(FIXTURE_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.slice(0, -'.json'.length))
  .filter((scenario) => loadFixture(scenario).servesMerge === true)
  .sort();

test('every merging scenario is provisioned with a history and origin for its Phase-4 scan', () => {
  assert.deepEqual(
    MERGING_SCENARIOS,
    [...MERGE_ORIGIN_SCENARIOS, 'repair-after-base-merge-merges'].sort(),
    'a merging scenario has no provisioning that lets the Phase-4 quick-marker scan run',
  );
});

// The gate's two fetches, then the shipped scan for the head the Phase-4 status read reports. Its
// range must exist and carry no marker, so condition 11 does not apply.
for (const scenario of MERGING_SCENARIOS) {
  test(`${scenario}: the Phase-4 fetches and quick-marker scan succeed and find no marker`, () => {
    const slot = provision(scenario);
    try {
      const { projectRoot, remote, fixture } = slot;
      const pullRef = `refs/pull/${fixture.pullRequest}/head`;
      git(projectRoot, [
        'fetch',
        '--no-write-fetch-head',
        'origin',
        '+refs/heads/develop:refs/remotes/origin/develop',
      ]);
      git(projectRoot, ['fetch', '--no-write-fetch-head', '--refmap=', 'origin', pullRef]);
      // An origin-head fixture serves the head `origin` carries; every other one states it.
      const headSha = fixture.originHeads
        ? git(remote, ['rev-parse', pullRef])
        : fixture.operations['pr-status-read'].envelope.data.result.headSha;
      const scan = helper(CONFLICT_VALIDATION, 'quick-marker-scan', {
        cwd: projectRoot,
        baseRef: 'develop',
        headSha,
      });
      assert.equal(scan.ok, true, JSON.stringify(scan));
      assert.equal(scan.data.found, false);
      assert.deepEqual(scan.data.commits, []);
      assert.equal(scan.data.mergeBase, git(projectRoot, ['rev-parse', 'origin/develop']));
      assert.equal(scan.data.scanned, 1);
    } finally {
      rmSync(slot.attempt, { recursive: true, force: true });
    }
  });
}

test('a merge-origin checkout holds the fixture head on a re-made seed, clean on develop', () => {
  for (const scenario of MERGE_ORIGIN_SCENARIOS) {
    const slot = provision(scenario);
    try {
      const { projectRoot, remote, fixture } = slot;
      const pr = fixture.operations['pr-read'].envelope.data.result;
      const head = fixture.headSha;
      // Every place the forge names the head names the seeded commit.
      assert.equal(fixture.operations['pr-read'].provider.head.sha, head, scenario);
      assert.equal(
        fixture.operations['pr-status-read'].envelope.data.result.headSha,
        head,
        scenario,
      );
      assert.equal(fixture.operations['pr-merge'].input.payload.expectedHeadSha, head, scenario);

      const seed = git(projectRoot, ['rev-parse', 'refs/heads/develop']);
      assert.equal(git(projectRoot, ['rev-parse', `${head}^`]), seed, scenario);
      assert.equal(
        git(projectRoot, ['show', `${head}:${HEAD_CHANGE_PATH}`]),
        HEAD_CHANGE_TEXT.trim(),
      );
      assert.equal(
        Number(git(projectRoot, ['show', '-s', '--format=%ct', head])) * 1000,
        Date.parse(fixture.operations['pr-status-read'].envelope.data.result.headCommittedAt),
        scenario,
      );
      assert.equal(git(remote, ['rev-parse', 'refs/heads/develop']), seed, scenario);
      assert.equal(git(remote, ['rev-parse', `refs/heads/${pr.head}`]), head, scenario);
      assert.equal(git(remote, ['rev-parse', `refs/pull/${fixture.pullRequest}/head`]), head);
      assert.equal(
        git(projectRoot, ['config', 'remote.origin.pushurl']),
        pathToFileURL(remote).href,
        scenario,
      );
      assert.equal(git(projectRoot, ['branch', '--show-current']), 'develop', scenario);
      assert.equal(git(projectRoot, ['status', '--porcelain', '--untracked-files=all']), '');
    } finally {
      rmSync(slot.attempt, { recursive: true, force: true });
    }
  }
});

// The two merging no-CI policy scenarios moved from `no-ci-checkout.mjs` to this origin; the re-made
// seed keeps the tree, so the resolver's base-blob guard still sees an active, unattended policy.
test('the merging no-CI policy scenarios keep an active policy against the merge origin', () => {
  for (const scenario of MERGE_ORIGIN_SCENARIOS.filter((name) => name.startsWith('no-ci-'))) {
    const slot = provision(scenario);
    try {
      const policy = helper(CONFIG_RESOLVE, 'no-ci-policy', {
        cwd: slot.projectRoot,
        tool: 'merge-gate',
        baseRef: 'develop',
      }).data.noCiPolicy;
      assert.equal(policy.baseComparison, 'equal', scenario);
      assert.deepEqual(
        { active: policy.active, unattended: policy.unattended, reason: policy.reason },
        { active: true, unattended: true, reason: 'active' },
        scenario,
      );
    } finally {
      rmSync(slot.attempt, { recursive: true, force: true });
    }
  }
});

test('the merge-origin history is the same on every provisioning', () => {
  const [scenario] = MERGE_ORIGIN_SCENARIOS;
  const first = provision(scenario);
  const second = provision(scenario);
  try {
    for (const ref of ['refs/heads/develop', 'refs/remotes/origin/develop']) {
      assert.equal(
        git(first.projectRoot, ['rev-parse', ref]),
        git(second.projectRoot, ['rev-parse', ref]),
      );
    }
  } finally {
    rmSync(first.attempt, { recursive: true, force: true });
    rmSync(second.attempt, { recursive: true, force: true });
  }
});
