import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { writeProject } from '../evals/_scaffold/scaffold.mjs';
import {
  ANCHORED_TEXT,
  HEAD_DATE,
  prepareConfiguredReviewerOrigin,
  threadAnchor,
} from '../evals/merge-gate/_scaffold/configured-reviewer-origin.mjs';
import { CONFIGURED_REVIEWER_SCENARIO } from '../evals/merge-gate/_scaffold/configured-reviewer-scenario.mjs';
import suite from '../evals/merge-gate/suite.config.mjs';

// The configured-reviewer scenario delegates, and immediately before its first delegation the gate
// runs the mandatory repair scope read: the ancestry check's base and pull-ref fetches, then
// `repair-attempt.mjs scope-read` for the head the status read reports. This file provisions the
// scenario's checkout exactly as a slot does and proves that read resolves on it — the origin is
// fetchable, the fixture's head is a commit the checkout holds, and its merge base with
// `origin/develop` is the seeded `develop` — so the run can reach the set-aside gate the scenario
// exists to observe instead of stopping at an `undetermined` scope.

const REPOSITORY = resolve(import.meta.dirname, '..');
const SUITE_ROOT = resolve(REPOSITORY, 'evals', 'merge-gate');
const REPAIR_HELPER = resolve(REPOSITORY, 'src', 'scripts', 'repair-attempt.mjs');

function childEnv() {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
}

function loadFixture(scenario = CONFIGURED_REVIEWER_SCENARIO) {
  return JSON.parse(readFileSync(join(SUITE_ROOT, 'fixtures', `${scenario}.json`), 'utf8'));
}

function provision(
  fixture = loadFixture(),
  attempt = mkdtempSync(join(tmpdir(), 'effective-flow-configured-origin-')),
) {
  const projectRoot = join(attempt, 'project');
  mkdirSync(projectRoot);
  writeProject(
    suite,
    projectRoot,
    CONFIGURED_REVIEWER_SCENARIO,
    fixture,
    suite.scenarioSetup(CONFIGURED_REVIEWER_SCENARIO).projectSetupRows,
  );
  return { attempt, projectRoot, remote: join(attempt, 'remote.git'), fixture };
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv(),
  }).trim();
}

test('the configured-reviewer checkout resolves the fixture head against a fetchable origin', () => {
  const slot = provision();
  try {
    const { projectRoot, remote, fixture } = slot;
    const head = fixture.headSha;
    const pr = fixture.operations['pr-read'].envelope.data.result;

    // The ancestry check's two fetches, exactly as the gate makes them.
    git(projectRoot, [
      'fetch',
      '--no-write-fetch-head',
      'origin',
      '+refs/heads/develop:refs/remotes/origin/develop',
    ]);
    git(projectRoot, [
      'fetch',
      '--no-write-fetch-head',
      '--refmap=',
      'origin',
      `refs/pull/${fixture.pullRequest}/head`,
    ]);
    assert.equal(git(projectRoot, ['rev-parse', `${head}^{commit}`]), head);

    const seed = git(projectRoot, ['rev-parse', 'refs/heads/develop']);
    assert.equal(git(projectRoot, ['rev-parse', 'refs/remotes/origin/develop']), seed);
    assert.equal(git(projectRoot, ['merge-base', 'origin/develop', head]), seed);
    assert.equal(git(projectRoot, ['rev-parse', `${head}^`]), seed);
    // The commit date is the one the fixture's status read reports for that head.
    const committed = fixture.operations['pr-status-read'].envelope.data.result.headCommittedAt;
    assert.equal(
      Number(git(projectRoot, ['show', '-s', '--format=%ct', head])) * 1000,
      Date.parse(committed),
    );
    assert.equal(Date.parse(HEAD_DATE), Date.parse(committed));

    // The forge's refs, and nothing that would record a push.
    assert.equal(git(remote, ['rev-parse', `refs/heads/${pr.head}`]), head);
    assert.equal(git(remote, ['rev-parse', `refs/pull/${fixture.pullRequest}/head`]), head);
    assert.equal(git(remote, ['rev-parse', 'refs/heads/develop']), seed);
    assert.equal(existsSync(join(remote, 'hooks', 'post-receive')), false);
    assert.equal(git(projectRoot, ['config', 'remote.origin.pushurl']), pathToFileURL(remote).href);
    assert.equal(
      git(projectRoot, ['config', 'remote.origin.url']),
      `https://${fixture.repository.host}/${fixture.repository.owner}/${fixture.repository.repository}.git`,
    );

    // The checkout stays clean on `develop`, with the seeded tree unchanged.
    assert.equal(git(projectRoot, ['branch', '--show-current']), 'develop');
    assert.equal(git(projectRoot, ['status', '--porcelain', '--untracked-files=all']), '');

    // The pull request carries the line the review thread is anchored on.
    const { path, line } = threadAnchor(fixture);
    const anchored = git(projectRoot, ['show', `${head}:${path}`]).split('\n');
    assert.equal(anchored[line - 1], ANCHORED_TEXT);

    // The shipped scope read resolves to exactly that path.
    const result = spawnSync(process.execPath, [REPAIR_HELPER, 'scope-read'], {
      input: JSON.stringify({ cwd: projectRoot, base: 'develop', head }),
      encoding: 'utf8',
      env: childEnv(),
    });
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, true, result.stdout);
    assert.deepEqual(envelope.data, {
      status: 'read',
      scope: { mergeBase: seed, head, paths: [path] },
    });
  } finally {
    rmSync(slot.attempt, { recursive: true, force: true });
  }
});

test('the configured-reviewer history is the same on every provisioning', () => {
  const first = provision();
  const second = provision();
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

test('a configured-reviewer fixture naming another head fails provisioning', () => {
  const fixture = { ...loadFixture(), headSha: 'f'.repeat(40) };
  const attempt = mkdtempSync(join(tmpdir(), 'effective-flow-configured-origin-'));
  try {
    assert.throws(() => provision(fixture, attempt), /regenerate the fixture's head SHA/);
  } finally {
    rmSync(attempt, { recursive: true, force: true });
  }
});

test('the configured-reviewer origin prepares nothing for any other scenario', () => {
  for (const scenario of suite.scenarios) {
    if (scenario === CONFIGURED_REVIEWER_SCENARIO) continue;
    assert.equal(
      prepareConfiguredReviewerOrigin({ scenario, fixture: {}, projectRoot: '/nonexistent' }),
      null,
      scenario,
    );
  }
});
