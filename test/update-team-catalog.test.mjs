import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { updateTeamCatalog } from '../scripts/update-team-catalog.mjs';

const DELIVERY_COMMIT = 'd'.repeat(40);
const OLD_COMMIT = 'a'.repeat(40);
const MAIN_COMMIT = 'b'.repeat(40);
const REMOTE_COMMIT = 'c'.repeat(40);
const RELEASE_TAG = 'v1.50.0';
const BRANCH = 'automation/effective-flow-v1.50.0';
const GH_TOKEN = 'target-token-value';
const SOURCE_TOKEN = 'source-token-value';
const GH_AUTHORIZATION = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${GH_TOKEN}`).toString('base64')}`;
const SOURCE_AUTHORIZATION = `AUTHORIZATION: basic ${Buffer.from(
  `x-access-token:${SOURCE_TOKEN}`,
).toString('base64')}`;
const MANIFEST = `schema_version = 1\n\n[[catalog]]\nid = "effective-flow"\nversion = "${DELIVERY_COMMIT}"\n`;

function report({
  dryRun,
  candidateCommit = DELIVERY_COMMIT,
  oldCommit = OLD_COMMIT,
  oldVersion = oldCommit,
  outcomes = [],
  audits = [],
  blocking = [],
}) {
  return {
    catalog_id: 'effective-flow',
    from_ref: 'main',
    candidate_commit: candidateCommit,
    old_commit: oldCommit,
    old_version: oldVersion,
    outcomes,
    audits,
    blocking_reasons: blocking,
    dry_run: dryRun,
    updated: !dryRun,
  };
}

function pullRequest(overrides = {}) {
  return {
    number: 42,
    url: 'https://github.com/sebastian-software/skills.sebastian-software.com/pull/42',
    headRefName: BRANCH,
    headRefOid: REMOTE_COMMIT,
    baseRefName: 'main',
    ...overrides,
  };
}

function commandKey(command, args) {
  return `${command} ${args.join(' ')}`;
}

function createRunner({
  dryRun = report({ dryRun: true }),
  update = report({ dryRun: false }),
  changedStatus = ' M dalo.toml',
  remoteBranch = null,
  pulls = [],
  daloFailure = null,
} = {}) {
  const calls = [];
  let statusCalls = 0;
  const run = (command, args, options = {}) => {
    calls.push({ command, args: [...args], options });
    const key = commandKey(command, args);

    if (key === 'git remote get-url origin')
      return success('https://github.com/sebastian-software/skills.sebastian-software.com.git\n');
    if (key === 'git branch --show-current') return success('main\n');
    if (key === 'git status --porcelain=v1 --untracked-files=all') {
      statusCalls += 1;
      return success(statusCalls === 1 ? '' : changedStatus);
    }
    if (key === 'git fetch --no-tags origin main') return success();
    if (key === 'git rev-parse HEAD') return success(`${MAIN_COMMIT}\n`);
    if (key === 'git rev-parse origin/main') return success(`${MAIN_COMMIT}\n`);
    if (key === 'dalo --dry-run --json team catalog update effective-flow --from main') {
      if (daloFailure) return failure(daloFailure);
      return success(JSON.stringify(dryRun));
    }
    if (key === 'dalo --json team catalog update effective-flow --from main') {
      return success(JSON.stringify(update));
    }
    if (key === `git ls-remote --heads origin refs/heads/${BRANCH}`) {
      return success(remoteBranch ? `${remoteBranch}\trefs/heads/${BRANCH}\n` : '');
    }
    if (key.startsWith('gh pr list ')) return success(JSON.stringify(pulls));
    if (key === `git fetch --no-tags origin refs/heads/${BRANCH}`) return success();
    if (key === 'git show FETCH_HEAD:dalo.toml') return success(MANIFEST);
    if (key === 'git diff --name-only origin/main...FETCH_HEAD') return success('dalo.toml\n');
    if (key.startsWith('git switch --create ')) return success();
    if (key.startsWith('git config user.')) return success();
    if (key === 'git add -- dalo.toml') return success();
    if (key.startsWith('git commit -m ')) return success();
    if (key.startsWith('git push origin ')) return success();
    if (key.startsWith('gh pr create '))
      return success(
        'https://github.com/sebastian-software/skills.sebastian-software.com/pull/43\n',
      );
    throw new Error(`unexpected command: ${key}`);
  };
  return { run, calls };
}

function success(stdout = '') {
  return { status: 0, stdout, stderr: '' };
}

function failure(stderr) {
  return { status: 1, stdout: '', stderr };
}

function withRepository(callback) {
  const repo = mkdtempSync(join(tmpdir(), 'effective-flow-catalog-test-'));
  writeFileSync(join(repo, 'dalo.toml'), MANIFEST);
  try {
    return callback(repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

function execute(repo, harness) {
  return updateTeamCatalog({
    repo,
    deliveryCommit: DELIVERY_COMMIT,
    releaseTag: RELEASE_TAG,
    ghToken: GH_TOKEN,
    daloSourceToken: SOURCE_TOKEN,
    run: harness.run,
    env: {
      PATH: '/usr/bin',
      GH_TOKEN: 'inherited-target-token',
      DALO_SOURCE_TOKEN: 'inherited-source-token',
    },
  });
}

test('reviews with Dalo before updating, then creates one deterministic pull request', () =>
  withRepository((repo) => {
    const harness = createRunner();

    assert.deepEqual(execute(repo, harness), {
      status: 'created-pull-request',
      branch: BRANCH,
      pullRequestUrl: 'https://github.com/sebastian-software/skills.sebastian-software.com/pull/43',
    });

    const keys = harness.calls.map(({ command, args }) => commandKey(command, args));
    const dryRun = keys.indexOf(
      'dalo --dry-run --json team catalog update effective-flow --from main',
    );
    const update = keys.indexOf('dalo --json team catalog update effective-flow --from main');
    assert.ok(dryRun >= 0 && update > dryRun);
    assert.equal(keys.filter((key) => key.startsWith('git push origin ')).length, 1);
    assert.equal(keys.filter((key) => key.startsWith('gh pr create ')).length, 1);

    const pullRequestCall = harness.calls.find(({ command, args }) =>
      commandKey(command, args).startsWith('gh pr create '),
    );
    const titleIndex = pullRequestCall.args.indexOf('--title');
    const bodyIndex = pullRequestCall.args.indexOf('--body');
    assert.equal(
      pullRequestCall.args[titleIndex + 1],
      `chore(catalog): update effective-flow to ${RELEASE_TAG}`,
    );
    assert.match(pullRequestCall.args[bodyIndex + 1], /^Aktualisiert den Dalo-Katalogeintrag/);

    const allArguments = harness.calls.flatMap(({ args }) => args).join(' ');
    assert.doesNotMatch(allArguments, new RegExp(`${GH_TOKEN}|${SOURCE_TOKEN}`));
    const daloCall = harness.calls[dryRun];
    const pushCall = harness.calls.find(({ command, args }) =>
      commandKey(command, args).startsWith('git push origin '),
    );
    assert.equal(daloCall.options.env.GIT_CONFIG_VALUE_0, SOURCE_AUTHORIZATION);
    assert.equal(daloCall.options.env.GH_TOKEN, undefined);
    assert.equal(pushCall.options.env.GIT_CONFIG_VALUE_0, GH_AUTHORIZATION);
    assert.equal(pushCall.options.env.GH_TOKEN, GH_TOKEN);
    assert.equal(pushCall.options.env.DALO_SOURCE_TOKEN, undefined);
  }));

test('returns without updating when the reviewed catalog is already pinned', () =>
  withRepository((repo) => {
    const harness = createRunner({
      dryRun: report({
        dryRun: true,
        oldCommit: DELIVERY_COMMIT,
        oldVersion: DELIVERY_COMMIT,
      }),
    });

    assert.deepEqual(execute(repo, harness), {
      status: 'already-current',
      branch: null,
      pullRequestUrl: null,
    });
    assert.equal(
      harness.calls.some(
        ({ command, args }) =>
          commandKey(command, args) ===
          'dalo --json team catalog update effective-flow --from main',
      ),
      false,
    );
  }));

test('replaces a floating version even when it resolves to the delivery commit', () =>
  withRepository((repo) => {
    const harness = createRunner({
      dryRun: report({
        dryRun: true,
        oldCommit: DELIVERY_COMMIT,
        oldVersion: 'main',
      }),
    });

    assert.equal(execute(repo, harness).status, 'created-pull-request');
    assert.equal(
      harness.calls.some(
        ({ command, args }) =>
          commandKey(command, args) ===
          'dalo --json team catalog update effective-flow --from main',
      ),
      true,
    );
  }));

test('accepts an existing open pull request only when its branch contains the reviewed manifest', () =>
  withRepository((repo) => {
    const harness = createRunner({ remoteBranch: REMOTE_COMMIT, pulls: [pullRequest()] });

    assert.deepEqual(execute(repo, harness), {
      status: 'existing-pull-request',
      branch: BRANCH,
      pullRequestUrl: 'https://github.com/sebastian-software/skills.sebastian-software.com/pull/42',
    });
    assert.equal(
      harness.calls.some(({ command, args }) => commandKey(command, args).startsWith('git push ')),
      false,
    );
  }));

test('fails closed for contradictory remote branch and pull-request states', () =>
  withRepository((repo) => {
    for (const state of [
      { remoteBranch: REMOTE_COMMIT, pulls: [] },
      { remoteBranch: null, pulls: [pullRequest()] },
      {
        remoteBranch: REMOTE_COMMIT,
        pulls: [pullRequest({ headRefOid: OLD_COMMIT })],
      },
    ]) {
      assert.throws(() => execute(repo, createRunner(state)), /contradictory|does not match/);
    }
  }));

test('propagates Dalo command failures and rejects blocking findings', () =>
  withRepository((repo) => {
    assert.throws(
      () => execute(repo, createRunner({ daloFailure: 'clone failed' })),
      /clone failed/,
    );
    assert.throws(
      () =>
        execute(
          repo,
          createRunner({
            dryRun: report({
              dryRun: true,
              outcomes: [{ skill: 'effective-flow', code: 'changed' }],
              audits: [{ source_ref: 'effective-flow:effective-flow', status: 'blocked' }],
              blocking: ['selected skill failed audit'],
            }),
          }),
        ),
      (error) => {
        assert.match(error.message, /selected skill failed audit/);
        assert.match(error.message, /"outcomes":\[\{"skill":"effective-flow","code":"changed"\}\]/);
        assert.match(
          error.message,
          /"audits":\[\{"source_ref":"effective-flow:effective-flow","status":"blocked"\}\]/,
        );
        return true;
      },
    );
  }));

test('rejects a Dalo candidate that differs from the verified delivery commit', () =>
  withRepository((repo) => {
    const harness = createRunner({
      dryRun: report({ dryRun: true, candidateCommit: OLD_COMMIT }),
    });

    assert.throws(() => execute(repo, harness), /does not match verified delivery commit/);
    assert.equal(
      harness.calls.some(
        ({ command, args }) =>
          commandKey(command, args) ===
          'dalo --json team catalog update effective-flow --from main',
      ),
      false,
    );
  }));

test('rejects every update that changes a path other than dalo.toml', () =>
  withRepository((repo) => {
    const harness = createRunner({ changedStatus: ' M dalo.toml\n?? unexpected.txt' });
    assert.throws(() => execute(repo, harness), /unexpected paths: dalo\.toml, unexpected\.txt/);
    assert.equal(
      harness.calls.some(({ command, args }) => commandKey(command, args).startsWith('git push ')),
      false,
    );
  }));
