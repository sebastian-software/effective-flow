// Real primary checkout and bare Git transport; only the unavailable GitHub HTTP boundary is fake.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProcessRunner } from '../../../src/scripts/process-runner.mjs';
import { executeOperation as buddy } from '../../../src/scripts/issue-buddy-core.mjs';
import { executeOperation as publication } from '../../../src/scripts/plan-publication-core.mjs';
import { executeOperation as tracker } from '../../../src/scripts/remote-tracker-core.mjs';
import { executeOperation as lint } from '../../../src/scripts/plan-lint-core.mjs';

export const NOW = '2026-10-19T12:00:00.000Z';
export const PLAN = 'docs/plan/2026-10-19-issue-1-fixture.md';
export const BRANCH = 'effective-flow/plan/issue-1';
const REPOSITORY = { id: 1, full_name: 'acme/fixture', name: 'fixture', owner: { login: 'acme' } };
export const issue = (number = 1) => ({
  number,
  title: `Fixture issue ${number}`,
  body: 'Implement the fixture plan.',
  state: 'open',
  user: { login: 'owner', type: 'User' },
  labels: [],
  created_at: NOW,
  updated_at: NOW,
});
export const planText = (number = 1) => `# Fixture plan

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (\`effective-flow build\`)
**Issue:** #${number}

## Requirement

Ship the fixture.

## Acceptance criteria

- [ ] The fixture works.

## Assumptions and open points

- The fixture stays small.

## Plan review

**Result:** Approved

### Summary

The plan is bounded.

### Findings

- No findings.

## Open points

- No open points.
`;

export function checked(envelope) {
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  return envelope.data;
}
export function createWorld(t, { issues = [issue()], visibility = 'public' } = {}) {
  const container = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'issue-buddy-pass-')));
  t.after(() => fs.rmSync(container, { recursive: true, force: true }));
  const root = path.join(container, 'primary');
  const bare = path.join(container, 'remote.git');
  fs.mkdirSync(root);
  fs.mkdirSync(path.join(container, 'home'));
  const world = loadWorld(container);
  world.git(container, 'init', '--bare', '--initial-branch=main', bare);
  world.git(root, 'init', '--initial-branch=main');
  world.git(root, 'config', 'user.name', 'Fixture Publisher');
  world.git(root, 'config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(root, '.gitignore'), '.effective-flow/\n');
  fs.writeFileSync(path.join(root, 'README.md'), '# Fixture\n');
  world.git(root, 'add', '.');
  world.git(root, 'commit', '-m', 'seed');
  world.git(root, 'remote', 'add', 'origin', bare);
  world.git(root, 'push', '--quiet', 'origin', 'main');
  world.state({ issues, visibility, pulls: [], creates: [], failCreate: false });
  return world;
}
export function loadWorld(container, { checkpoint = async () => {}, observedFs } = {}) {
  const root = path.join(container, 'primary');
  const bare = path.join(container, 'remote.git');
  const forgeFile = path.join(container, 'forge.json');
  const callsFile = path.join(container, 'calls.jsonl');
  const environment = {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    HOME: path.join(container, 'home'),
    XDG_CONFIG_HOME: path.join(container, 'home', '.config'),
    GIT_TERMINAL_PROMPT: '0',
    GIT_DIR: undefined,
    GIT_WORK_TREE: undefined,
    GIT_INDEX_FILE: undefined,
    GIT_AUTHOR_NAME: undefined,
    GIT_AUTHOR_EMAIL: undefined,
    GIT_COMMITTER_NAME: undefined,
    GIT_COMMITTER_EMAIL: undefined,
    EMAIL: undefined,
  };
  const world = {
    container,
    root,
    bare,
    environment,
    runtime: path.join(root, '.effective-flow/issue-buddy'),
    state(next) {
      if (next !== undefined) fs.writeFileSync(forgeFile, JSON.stringify(next));
      return JSON.parse(fs.readFileSync(forgeFile, 'utf8'));
    },
    calls() {
      return fs.existsSync(callsFile)
        ? fs.readFileSync(callsFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
        : [];
    },
    git(cwd, ...args) {
      const result = spawnSync('git', args, {
        cwd,
        env: { ...process.env, ...environment },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
      return result.stdout.trim();
    },
  };
  const real = createProcessRunner();
  const ok = (value = '') => ({
    status: 0,
    stdout: typeof value === 'string' ? value : JSON.stringify(value),
    stderr: '',
  });
  const fail = () => ({ status: 1, stdout: '', stderr: 'gh: Server Error (HTTP 502)' });
  async function forge(call) {
    const args = call.args;
    if (args[0] === '--version') return ok('gh version 2.90.0\n');
    if (args[0] === 'auth') return ok('Logged in to github.com\n');
    if (args.includes('--help')) return ok('Usage: gh issue create\n --parent parent issue\n');
    assert.equal(args[0], 'api');
    const endpoint = args.find((arg) => arg.startsWith('repos/'));
    assert.ok(endpoint, `Unexpected gh command ${args.join(' ')}`);
    const url = new URL(endpoint, 'https://api.github.com/');
    assert.ok(url.pathname.startsWith('/repos/acme/fixture'), endpoint);
    const state = world.state();
    const method = args.includes('-X')
      ? args[args.indexOf('-X') + 1]
      : args.includes('--method')
        ? args[args.indexOf('--method') + 1]
        : 'GET';
    if (method !== 'GET') {
      assert.equal(method, 'POST');
      assert.equal(url.pathname, '/repos/acme/fixture/pulls');
      const payload = JSON.parse(call.stdin);
      assert.equal(payload.draft, true);
      await checkpoint('before-create');
      state.creates.push(payload);
      if (state.failCreate) {
        world.state(state);
        return fail();
      }
      const number = state.pulls.length + 100;
      const pull = {
        number,
        title: payload.title,
        body: payload.body,
        state: 'open',
        draft: payload.draft,
        html_url: `https://github.com/acme/fixture/pull/${number}`,
        head: { ref: payload.head, label: `acme:${payload.head}`, repo: REPOSITORY },
        base: { ref: payload.base, label: `acme:${payload.base}`, repo: REPOSITORY },
      };
      state.pulls.push(pull);
      world.state(state);
      await checkpoint('after-create');
      return ok(pull);
    }
    let value;
    if (url.pathname === '/repos/acme/fixture')
      value = {
        ...REPOSITORY,
        visibility: state.visibility,
        private: state.visibility === 'private',
        permissions: { push: true },
      };
    else if (url.pathname === '/repos/acme/fixture/issues') value = state.issues;
    else if (url.pathname === '/repos/acme/fixture/pulls') {
      value = state.pulls.filter(
        (pull) =>
          !url.searchParams.has('head') ||
          url.searchParams.get('head').split(':').slice(1).join(':') === pull.head.ref,
      );
    } else if (/\/issues\/[1-9][0-9]*\/comments$/.test(url.pathname)) value = [];
    else if (url.pathname === '/repos/acme/fixture/collaborators/owner/permission')
      value = { permission: 'write' };
    else assert.fail(`Unexpected forge endpoint ${endpoint}`);
    return ok(args.includes('--slurp') ? [value] : value);
  }
  world.runner = async (call) => {
    fs.appendFileSync(
      callsFile,
      `${JSON.stringify({ executable: call.executable, args: call.args })}\n`,
    );
    if (call.executable === 'git' && call.args[0] === 'remote' && call.args[1] === 'get-url') {
      assert.equal(call.args.at(-1), 'origin');
      return ok('https://github.com/acme/fixture.git\n');
    }
    if (call.executable === 'gh') return forge(call);
    assert.equal(call.executable, 'git');
    const push = call.args[0] === 'push';
    if (push) await checkpoint('before-push');
    const result = await real({ ...call, env: { ...environment, ...(call.env ?? {}) } });
    if (push && result.status === 0) await checkpoint('after-push');
    return result;
  };
  world.options = {
    runner: world.runner,
    clock: () => NOW,
    ...(observedFs ? { fs: observedFs } : {}),
  };
  world.buddy = (operation, input = {}) => buddy(operation, { cwd: root, ...input }, world.options);
  world.tracker = (operation, input = {}) =>
    tracker(operation, { cwd: root, ...input }, { runner: world.runner });
  world.publication = (operation, input) =>
    publication(
      operation,
      { cwd: root, ...input },
      { apply: operation !== 'inspect-branch', runner: world.runner, environment: {} },
    );
  world.lint = (operation, input) =>
    lint(
      operation,
      { cwd: root, planDir: 'docs/plan', files: [PLAN], ...input },
      { runner: world.runner },
    );
  return world;
}
export const collectInput = (passId, extra = {}) => ({
  passId,
  mode: 'publish',
  baseBranch: 'main',
  planDir: 'docs/plan',
  branchPrefix: 'effective-flow',
  visibility: 'standard',
  repositoryVisibility: 'public',
  leftoverPlanFiles: [],
  limits: { judgments: 3, plans: 1 },
  ...extra,
});
export async function acquire(world) {
  return checked(await world.buddy('pass-lock-acquire')).passId;
}
export async function collect(world, passId, extra) {
  return checked(await world.buddy('pass-collect', collectInput(passId, extra)));
}
export function publicationInput(baseOid, extra = {}) {
  return {
    runState: 'unattended',
    visibility: 'standard',
    issue: 1,
    planDir: 'docs/plan',
    planFile: PLAN,
    branchPrefix: 'effective-flow',
    remote: 'origin',
    baseBranch: 'main',
    title: 'docs: plan issue #1',
    body: 'Plan for issue #1; review result: approved; open points: 0.',
    commitMessage: 'docs: plan issue #1',
    expectedBaseOid: baseOid,
    ...extra,
  };
}
export function recoveryInput(baseOid, extra = {}) {
  const { planFile, commitMessage, ...input } = publicationInput(baseOid);
  return { ...input, branch: BRANCH, ...extra };
}
export async function writePlan(world, text = planText()) {
  fs.mkdirSync(path.dirname(path.join(world.root, PLAN)), { recursive: true });
  fs.writeFileSync(path.join(world.root, PLAN), text, { flag: 'wx' });
}
export async function publish(world, collected) {
  checked(await world.lint('lint'));
  const metadata = checked(await world.lint('publication-metadata'));
  return checked(
    await world.publication(
      'publish',
      publicationInput(collected.baseOid, { expectedBlobOid: metadata.blobOid }),
    ),
  );
}
export async function record(
  world,
  passId,
  collected,
  {
    candidate = collected.eligible[0],
    verdict = 'published',
    reason = 'Fixture outcome',
    pullRequest,
  } = {},
) {
  const input = {
    passId,
    issue: candidate.issue,
    fingerprint: candidate.fingerprint,
    verdict,
    mode: collected.mode,
    reason,
    ...(pullRequest ? { pullRequest: { number: pullRequest.number, url: pullRequest.url } } : {}),
    ...(candidate.kind ? { headRef: candidate.headRef } : {}),
  };
  checked(await world.buddy('verdict-record', input));
  return { issue: candidate.issue, verdict, reason };
}
export const prIdentity = (published, issueNumber = 1) => ({
  issue: issueNumber,
  number: published.pullRequest.number,
  headRef: published.branch,
  url: published.pullRequest.url,
});
export async function report(world, passId, collected, extra = {}) {
  return checked(
    await world.buddy('pass-report', {
      passId,
      reportVersion: 2,
      ...(collected
        ? { collect: collected }
        : { mode: 'publish', limits: { judgments: 3, plans: 1 } }),
      outcome: 'completed',
      cutOff: 'none',
      verdicts: [],
      pullRequestsOpened: [],
      pullRequestsRecovered: [],
      failures: [],
      repositoryVisibility: collected?.repositoryVisibility ?? 'public',
      leftoverPlanFiles: collected?.leftoverPlanFiles ?? [],
      ...extra,
    }),
  );
}
export async function release(world, passId) {
  checked(await world.buddy('pass-lock-release', { passId }));
}
