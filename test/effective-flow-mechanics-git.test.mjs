// Real-Git suite for the mechanics computation helper, against a local bare remote.
//
// Every expectation names its source: `shared/base-branch-resolution.md`,
// `shared/worktree-integration.md` step 4, or the pinned decision of
// `docs/plan/2026-10-29-mechanics-computation-helper.md` ("plan: <section>").

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { executeOperation } from '../src/scripts/effective-flow-mechanics-core.mjs';
import { createProcessRunner } from '../src/scripts/process-runner.mjs';

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  XDG_CONFIG_HOME: join(tmpdir(), 'effective-flow-mechanics-no-xdg-config'),
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
  GIT_ASKPASS: undefined,
  SSH_ASKPASS: undefined,
};

// The shipped runner with the isolated Git environment underneath the call's own environment.
const shippedRunner = createProcessRunner();
const runner = (call) => shippedRunner({ ...call, env: { ...GIT_ENV, ...(call.env ?? {}) } });

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { env: GIT_ENV, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function commit(root, file, content) {
  writeFileSync(join(root, file), content);
  git(root, 'add', file);
  git(root, 'commit', '-q', '-m', file);
  return git(root, 'rev-parse', 'HEAD');
}

// A bare remote with `main` and `develop`, a `seed` that publishes, and a full clone `local`.
function fixture(t) {
  const container = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-mechanics-git-')));
  t.after(() => rmSync(container, { recursive: true, force: true }));
  const remote = join(container, 'remote.git');
  const seed = join(container, 'seed');
  const local = join(container, 'local');
  mkdirSync(remote);
  git(remote, 'init', '-q', '--bare', '--initial-branch=main');
  mkdirSync(seed);
  git(seed, 'init', '-q', '--initial-branch=main');
  git(seed, 'remote', 'add', 'origin', remote);
  commit(seed, 'a.txt', 'a\n');
  git(seed, 'push', '-q', 'origin', 'main');
  git(seed, 'switch', '-q', '-c', 'develop');
  commit(seed, 'b.txt', 'b\n');
  git(seed, 'push', '-q', 'origin', 'develop');
  git(container, 'clone', '-q', remote, local);
  return { container, remote, seed, local };
}

async function data(operation, input) {
  const envelope = await executeOperation(operation, input, { runner, env: {} });
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  return envelope.data;
}

async function fetchBase(cwd, input = {}) {
  return await data('base-branch-fetch', {
    cwd,
    remote: 'origin',
    branch: 'develop',
    deliberateDivergence: false,
    ...input,
  });
}

test('base-branch-resolve: remote ref is fetch-required, derived default from origin/HEAD', async (t) => {
  // base-branch-resolution.md: classification against `git remote`; default from origin/HEAD.
  const { local } = fixture(t);
  const explicit = await data('base-branch-resolve', { cwd: local, configured: 'origin/develop' });
  assert.equal(explicit.outcome, 'fetch-required');
  assert.deepEqual([explicit.remote, explicit.branch], ['origin', 'develop']);
  const derived = await data('base-branch-resolve', { cwd: local, configured: null });
  assert.equal(derived.outcome, 'fetch-required');
  assert.deepEqual([derived.remote, derived.branch], ['origin', 'main']);
  git(local, 'remote', 'set-head', 'origin', '--delete');
  const fallback = await data('base-branch-resolve', { cwd: local, configured: null });
  assert.deepEqual([fallback.remote, fallback.branch], ['origin', 'main']);
});

test('base-branch-resolve: local arm without a remote', async (t) => {
  // base-branch-resolution.md "Remote not configured".
  const { seed } = fixture(t);
  git(seed, 'remote', 'remove', 'origin');
  git(seed, 'branch', 'feature/foo');
  const plain = await data('base-branch-resolve', { cwd: seed, configured: 'main' });
  assert.equal(plain.outcome, 'resolved');
  assert.equal(plain.baseRef, 'main');
  // `feature/foo` with no remote named `feature` is the local branch.
  const slashed = await data('base-branch-resolve', { cwd: seed, configured: 'feature/foo' });
  assert.equal(slashed.outcome, 'resolved');
  assert.equal(slashed.localBranch, 'feature/foo');
  const substituted = await data('base-branch-resolve', {
    cwd: seed,
    configured: 'origin/develop',
  });
  assert.equal(substituted.outcome, 'resolved-substituted');
  assert.deepEqual([substituted.baseRef, substituted.localBranch], ['develop', 'develop']);
  for (const configured of ['origin/nope', 'nope', '-x', '--all']) {
    const result = await data('base-branch-resolve', { cwd: seed, configured });
    assert.equal(result.outcome, 'unresolvable', configured);
  }
  assert.equal(git(seed, 'branch', '--list', 'nope'), '', 'no base branch is ever created');
});

test('base-branch-fetch resolves the fetched ref and names an origin/HEAD divergence', async (t) => {
  // base-branch-resolution.md "Remote configured" and its origin/HEAD comparison.
  const { seed, local } = fixture(t);
  const tip = commit(seed, 'c.txt', 'c\n');
  git(seed, 'push', '-q', 'origin', 'develop');
  const result = await fetchBase(local);
  assert.equal(result.outcome, 'resolved');
  assert.equal(result.baseRef, 'origin/develop');
  assert.equal(result.localBranch, 'develop');
  assert.equal(result.oid, tip);
  assert.deepEqual(result.divergence, { originHead: 'origin/main' });
  assert.equal((await fetchBase(local, { deliberateDivergence: true })).divergence, null);
  assert.equal((await fetchBase(local, { branch: 'main' })).divergence, null);
  git(local, 'remote', 'add', 'upstream', git(local, 'remote', 'get-url', 'origin'));
  git(local, 'fetch', '-q', 'upstream');
  const upstream = await fetchBase(local, { remote: 'upstream' });
  assert.equal(upstream.outcome, 'resolved');
  assert.equal(upstream.divergence, null, 'a non-origin remote is not compared');
});

test('a failed fetch with a remote configured never falls back to a local branch', async (t) => {
  // base-branch-resolution.md: "never fall back here".
  const { local } = fixture(t);
  git(local, 'branch', 'gone');
  const absent = await fetchBase(local, { branch: 'gone' });
  assert.ok(['fetch-failed', 'unresolvable'].includes(absent.outcome), absent.outcome);
  assert.equal(absent.baseRef, undefined);
  git(local, 'remote', 'add', 'broken', join(local, 'does-not-exist.git'));
  const broken = await fetchBase(local, { remote: 'broken', branch: 'gone' });
  assert.equal(broken.outcome, 'fetch-failed');
  assert.equal(typeof broken.error, 'string');
  assert.equal(broken.baseRef, undefined);
});

test('a single-branch clone or narrowed refspec leaves the tracking ref stale', async (t) => {
  // plan: "base-branch-fetch" — FETCH_HEAD against refs/remotes/<remote>/<branch>.
  const { container, remote, local } = fixture(t);
  const single = join(container, 'single');
  git(container, 'clone', '-q', '--single-branch', '--branch', 'main', remote, single);
  assert.equal((await fetchBase(single)).outcome, 'tracking-stale');
  git(local, 'update-ref', '-d', 'refs/remotes/origin/develop');
  git(local, 'config', 'remote.origin.fetch', '+refs/heads/main:refs/remotes/origin/main');
  assert.equal((await fetchBase(local)).outcome, 'tracking-stale');
});

test('option and refspec injection is refused before any fetch', async (t) => {
  // plan: "Edge cases" — "Injection attempts".
  const { local } = fixture(t);
  for (const branch of ['--upload-pack=touch x', '-x', 'x:refs/heads/main', '+x']) {
    const envelope = await executeOperation(
      'base-branch-fetch',
      { cwd: local, remote: 'origin', branch, deliberateDivergence: false },
      { runner, env: {} },
    );
    assert.equal(envelope.ok, false, branch);
    assert.equal(envelope.error.code, 'INVALID_INPUT', branch);
  }
  const unlisted = await executeOperation(
    'base-branch-fetch',
    { cwd: local, remote: 'elsewhere', branch: 'main', deliberateDivergence: false },
    { runner, env: {} },
  );
  assert.equal(unlisted.error.code, 'INVALID_INPUT');
});

test('a fetch that would prompt for credentials fails instead of hanging', async (t) => {
  // plan: "Edge cases" — "Hang": the non-interactive environment fails the prompt.
  const { local } = fixture(t);
  const server = createServer((request, response) => {
    response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="x"' });
    response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const { port } = server.address();
  git(local, 'remote', 'add', 'locked', `http://127.0.0.1:${port}/r.git`);
  const started = Date.now();
  const result = await fetchBase(local, { remote: 'locked', branch: 'main' });
  assert.equal(result.outcome, 'fetch-failed');
  assert.ok(Date.now() - started < 30_000, 'ended well within the fetch bound');
});

test('delivery-branch-name counts local and remote-tracking branches as taken', async (t) => {
  // worktree-integration.md step 4; plan: "Delivery branch naming".
  const { seed, local } = fixture(t);
  const name = async () =>
    (
      await data('delivery-branch-name', {
        cwd: local,
        branchPrefix: 'team',
        skill: 'build',
        text: 'User login',
        visibility: 'visible',
      })
    ).branch;
  assert.equal(await name(), 'team/build/user-login');
  git(local, 'branch', 'team/build/user-login');
  assert.equal(await name(), 'team/build/user-login-2');
  git(seed, 'push', '-q', 'origin', 'HEAD:refs/heads/team/build/user-login-2');
  git(local, 'fetch', '-q', 'origin');
  const chosen = await name();
  assert.equal(chosen, 'team/build/user-login-3');
  const check = spawnSync('git', ['check-ref-format', '--branch', chosen], { encoding: 'utf8' });
  assert.equal(check.status, 0);
});
