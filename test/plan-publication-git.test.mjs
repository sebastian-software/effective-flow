import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import nodeFs from 'node:fs';

import { buildPlanPrMarkerLine, executeOperation } from '../src/scripts/plan-publication-core.mjs';
import { createProcessRunner } from '../src/scripts/process-runner.mjs';
import { UPSTREAM_FETCH_TIMEOUT_MS } from '../src/scripts/delivery-selection-core.mjs';
import {
  executeOperation as trackerOperation,
  inspectPlanPrMarker,
} from '../src/scripts/remote-tracker-core.mjs';

// ---------------------------------------------------------------------------------------------
// Fixture: a bare remote, three clones, a fake GitHub behind the process runner

const ACME_URL = 'https://github.com/acme/widgets.git';
const OTHER_URL = 'https://github.com/other/thing.git';
const ISSUE = 12;
const PLAN_DIR = 'docs/plan';
const PLAN_FILE = 'docs/plan/2026-10-17-issue-12-demo.md';
const BRANCH_PREFIX = 'effective-flow';
const BRANCH = 'effective-flow/plan/issue-12';
const PLAN_TEXT = [
  '# Demo plan',
  '',
  '**Plan status:** Not implemented',
  `**Issue:** #${ISSUE}`,
  '',
  '## Requirement',
  '',
  'Ship the demo behind `src/shared/demo.md`.',
  '',
].join('\n');
const TIMEOUT_RESULT = Object.freeze({ status: null, signal: 'SIGTERM', stdout: '', stderr: '' });

// Fixtures that look like secrets are assembled at runtime.
function cat(...parts) {
  return parts.join('');
}
function tokenValue(seed = 0) {
  const alphabet = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
  let out = '';
  for (let index = 0; index < 36; index += 1) {
    out += alphabet[(index * 7 + seed * 3 + index * index) % alphabet.length];
  }
  return cat('gh', 'p_', out);
}

function isolatedEnvironment(home) {
  return {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
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
}

const SEED_IDENTITY = {
  GIT_AUTHOR_NAME: 'Seed Author',
  GIT_AUTHOR_EMAIL: 'seed@example.invalid',
  GIT_COMMITTER_NAME: 'Seed Author',
  GIT_COMMITTER_EMAIL: 'seed@example.invalid',
};

function runGit(cwd, args, env, input) {
  const result = spawnSync('git', args, {
    cwd,
    env: { ...process.env, ...env },
    input,
    encoding: null,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

function write(root, relativePath, content) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

// ---- the fake GitHub -------------------------------------------------------------------------

const BASE_REPOSITORY = Object.freeze({
  id: 1,
  name: 'widgets',
  full_name: 'acme/widgets',
  owner: { login: 'acme' },
});
const FORK_REPOSITORY = Object.freeze({
  id: 2,
  name: 'widgets',
  full_name: 'mallory/widgets',
  owner: { login: 'mallory' },
});

function apiPull({ number, title = 't', body = '', head, base = 'main', draft = true, fork }) {
  const headRepository = fork ? FORK_REPOSITORY : BASE_REPOSITORY;
  return {
    number,
    title,
    body,
    state: 'open',
    draft,
    html_url: `https://github.com/acme/widgets/pull/${number}`,
    head: { ref: head, label: `${headRepository.owner.login}:${head}`, repo: headRepository },
    base: { ref: base, label: `acme:${base}`, repo: BASE_REPOSITORY },
  };
}

function createForge() {
  const forge = {
    slug: 'acme/widgets',
    pulls: [],
    creates: [],
    lists: [],
    unknown: [],
    slugs: new Set(),
    events: [],
    nextNumber: 100,
    // 'ok' | 'fail-before' | 'fail-after' | 'garbled' | 'draft-unsupported'
    createMode: 'ok',
    // Shapes the stored pull request, to give the read-back something to refuse.
    store: {},
    listFailureAfterCreate: false,
    seedPull(options) {
      const pull = apiPull({ number: forge.nextNumber, ...options });
      forge.nextNumber += 1;
      forge.pulls.push(pull);
      return pull;
    },
    handle(call) {
      const { args } = call;
      const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
      if (args[0] === '--version') return ok('gh version 2.50.0 (2026-01-01)\n');
      if (args[0] === 'auth') return ok('Logged in to github.com\n');
      if (args.includes('--help')) return ok('Usage: gh issue create\n  --parent  parent issue\n');
      if (args[0] !== 'api') {
        forge.unknown.push(call);
        return { status: 1, stdout: '', stderr: `unexpected gh ${args[0]}` };
      }
      const endpoint = args.find((arg) => arg.startsWith('repos/'));
      const [path, query = ''] = (endpoint ?? '').split('?');
      const slug = path.split('/').slice(1, 3).join('/');
      forge.slugs.add(slug);
      if (slug !== forge.slug) return { status: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' };
      if (args.includes('-X')) {
        return forge.create(call, args[args.indexOf('-X') + 1], path);
      }
      if (args.includes('--paginate')) {
        const record = { args, endpoint, query: new URLSearchParams(query) };
        forge.lists.push(record);
        forge.events.push({ type: 'list', index: forge.lists.length - 1 });
        if (forge.listFailureAfterCreate && forge.creates.length > 0) {
          return { status: 1, stdout: '', stderr: 'gh: Server Error (HTTP 500)' };
        }
        return ok(JSON.stringify([forge.pulls.map((pull) => structuredClone(pull))]));
      }
      forge.unknown.push(call);
      return { status: 1, stdout: '', stderr: 'unexpected gh api call' };
    },
    create(call, method, path) {
      const payload = JSON.parse(call.stdin);
      forge.creates.push({ method, path, payload, args: call.args });
      forge.events.push({ type: 'create', index: forge.creates.length - 1 });
      if (forge.createMode === 'fail-before') {
        return { status: 1, stdout: '', stderr: 'gh: Server Error (HTTP 502)' };
      }
      if (forge.createMode === 'draft-unsupported') {
        return {
          status: 1,
          stdout: JSON.stringify({
            message: 'Validation Failed',
            errors: [{ message: 'Draft pull requests are not supported in this repository.' }],
          }),
          stderr: 'gh: Validation Failed (HTTP 422)',
        };
      }
      const pull = apiPull({
        number: forge.nextNumber,
        title: payload.title,
        body: forge.store.body ?? payload.body,
        head: payload.head,
        base: forge.store.base ?? payload.base,
        draft: forge.store.draft ?? payload.draft,
        fork: forge.store.fork === true,
      });
      forge.nextNumber += 1;
      if (forge.store.hidden !== true) forge.pulls.push(pull);
      if (forge.createMode === 'fail-after') {
        return { status: 1, stdout: '', stderr: 'gh: connection reset by peer' };
      }
      if (forge.createMode === 'garbled') return { status: 0, stdout: 'not json {', stderr: '' };
      return { status: 0, stdout: JSON.stringify(pull), stderr: '' };
    },
    listsAfterFirstCreate() {
      const createAt = forge.events.findIndex((event) => event.type === 'create');
      return createAt === -1
        ? 0
        : forge.events.slice(createAt).filter((e) => e.type === 'list').length;
    },
  };
  return forge;
}

// ---- the world -------------------------------------------------------------------------------

let templateRemotePath = null;

// One bare remote with a seed commit, built once per process and cloned for every world.
function templateRemote() {
  if (templateRemotePath) return templateRemotePath;
  const container = realpathSync(
    mkdtempSync(join(tmpdir(), 'effective-flow-plan-publication-template-')),
  );
  process.on('exit', () => rmSync(container, { recursive: true, force: true }));
  const home = join(container, 'home');
  mkdirSync(home);
  const environment = { ...isolatedEnvironment(home), ...SEED_IDENTITY };
  const git = (cwd, ...args) => {
    const result = runGit(cwd, args, environment);
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  };
  const remote = join(container, 'remote.git');
  const seed = join(container, 'seed');
  mkdirSync(remote);
  mkdirSync(seed);
  git(remote, 'init', '--bare', '--initial-branch=main');
  git(seed, 'init', '--initial-branch=main');
  git(seed, 'remote', 'add', 'origin', remote);
  write(seed, 'README.md', 'readme\n');
  write(seed, 'docs/plan/2026-09-01-issue-9-existing.md', '# Existing\n\n**Issue:** #9\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', 'seed');
  git(seed, 'push', '--quiet', 'origin', 'main');
  templateRemotePath = remote;
  return remote;
}

function createWorld(t, { identity = 'config', remoteUrls = {} } = {}) {
  const container = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-plan-publication-')));
  t.after(() => rmSync(container, { recursive: true, force: true }));
  const home = join(container, 'home');
  mkdirSync(home);
  const baseEnvironment = isolatedEnvironment(home);
  const environment = {
    ...baseEnvironment,
    ...(identity === 'env'
      ? {
          GIT_AUTHOR_NAME: 'Env Author',
          GIT_AUTHOR_EMAIL: 'env-author@example.invalid',
          GIT_COMMITTER_NAME: 'Env Committer',
          GIT_COMMITTER_EMAIL: 'env-committer@example.invalid',
        }
      : {}),
  };

  const remote = join(container, 'remote.git');
  const local = join(container, 'local');
  const second = join(container, 'second');
  const seed = join(container, 'seed');
  // The seed clone and the bare remote carry no configuration of their own, so they commit with
  // the seed identity; the local and the second clone use their configured identity.
  const git = (cwd, ...args) => {
    const identityEnvironment = [seed, remote, container].includes(cwd) ? SEED_IDENTITY : {};
    const result = runGit(cwd, args, { ...baseEnvironment, ...identityEnvironment });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.toString('utf8').trim();
  };
  const configureIdentity = (root, name, email) => {
    git(root, 'config', 'user.name', name);
    git(root, 'config', 'user.email', email);
  };

  git(container, 'clone', '--quiet', '--bare', templateRemote(), remote);
  const identityFlags = (name, email) => ['-c', `user.name=${name}`, '-c', `user.email=${email}`];
  git(
    container,
    'clone',
    '--quiet',
    ...(identity === 'config' ? identityFlags('Plan Publisher', 'publisher@example.invalid') : []),
    remote,
    local,
  );
  git(
    container,
    'clone',
    '--quiet',
    ...identityFlags('Second Clone', 'second@example.invalid'),
    remote,
    second,
  );

  const planAbsolute = write(local, PLAN_FILE, PLAN_TEXT);
  const forge = createForge();
  const real = createProcessRunner();
  const calls = [];
  const world = {
    container,
    remote,
    local,
    second,
    planAbsolute,
    forge,
    calls,
    environment,
    remoteUrls: { origin: ACME_URL, upstream: ACME_URL, ...remoteUrls },
    pushUrls: {},
    realRemoteUrls: false,
    intercept: null,
    git: (...args) => git(local, ...args),
    gitIn: git,
    configureIdentity,
  };
  // The seed clone is only built by the tests that move the remote base.
  Object.defineProperty(world, 'seed', {
    get() {
      if (!existsSync(seed)) {
        git(container, 'clone', '--quiet', remote, seed);
        git(seed, 'config', 'user.name', 'Seed Author');
        git(seed, 'config', 'user.email', 'seed@example.invalid');
      }
      return seed;
    },
  });

  // `git remote get-url [--push --all] <name>` answers from `remoteUrls`, and with `--push` from
  // `pushUrls` (default: the fetch URL alone), unless `realRemoteUrls` asks the real repository.
  async function execute(call) {
    if (
      !world.realRemoteUrls &&
      call.executable === 'git' &&
      call.args[0] === 'remote' &&
      call.args[1] === 'get-url'
    ) {
      const name = call.args.at(-1);
      const url = world.remoteUrls[name];
      if (url === undefined) return { status: 2, stdout: '', stderr: 'error: No such remote' };
      const urls = call.args.includes('--push') ? (world.pushUrls[name] ?? [url]) : [url];
      return { status: 0, stdout: urls.map((entry) => `${entry}\n`).join(''), stderr: '' };
    }
    if (call.executable === 'gh') return forge.handle(call);
    return real({ ...call, env: { ...environment, ...(call.env ?? {}) } });
  }
  world.runner = async (call) => {
    calls.push({ ...call, args: [...(call.args ?? [])] });
    if (world.intercept) {
      const intercepted = await world.intercept(call, () => execute(call), world);
      if (intercepted !== undefined) return intercepted;
    }
    return execute(call);
  };
  return world;
}

function publishInput(world, overrides = {}) {
  return {
    cwd: world.local,
    runState: 'unattended',
    visibility: 'standard',
    issue: ISSUE,
    planDir: PLAN_DIR,
    planFile: PLAN_FILE,
    branchPrefix: BRANCH_PREFIX,
    remote: 'origin',
    baseBranch: 'main',
    title: 'docs: plan demo',
    body: 'Adds the plan for the demo.\n\nRequirement: ship the demo.',
    commitMessage: 'docs: plan demo\n\nThe plan for the demo.',
    ...overrides,
  };
}

function completeInput(world, overrides = {}) {
  const { planFile: _planFile, commitMessage: _commitMessage, ...rest } = publishInput(world);
  return { ...rest, branch: BRANCH, ...overrides };
}

function publish(world, overrides = {}, { apply = true, ...options } = {}) {
  return executeOperation('publish', publishInput(world, overrides), {
    apply,
    runner: world.runner,
    environment: {},
    ...options,
  });
}

function completeBranch(world, overrides = {}, { apply = true, ...options } = {}) {
  return executeOperation('complete-branch', completeInput(world, overrides), {
    apply,
    runner: world.runner,
    environment: {},
    ...options,
  });
}

function assertChangeset(world, head, overrides = {}) {
  return executeOperation(
    'assert-changeset',
    {
      cwd: world.local,
      remote: 'origin',
      baseBranch: 'main',
      head,
      planDir: PLAN_DIR,
      issue: ISSUE,
      ...overrides,
    },
    { runner: world.runner, environment: {} },
  );
}

// ---- observations ----------------------------------------------------------------------------

function remoteRef(world, branch) {
  const result = runGit(
    world.remote,
    ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
    {
      ...isolatedEnvironment(join(world.container, 'home')),
    },
  );
  return result.status === 0 ? result.stdout.toString('utf8').trim() : null;
}

function refs(world) {
  return world.git('for-each-ref', '--format=%(refname) %(objectname)').split('\n').filter(Boolean);
}

function objectCount(world) {
  const fields = Object.fromEntries(
    world
      .git('count-objects', '-v')
      .split('\n')
      .map((line) => line.split(': ')),
  );
  return Number(fields.count) + Number(fields['in-pack']);
}

function captureLocal(world) {
  const index = readFileSync(join(world.local, '.git', 'index'));
  return {
    index,
    head: world.git('rev-parse', 'HEAD'),
    headRef: world.git('symbolic-ref', 'HEAD'),
    status: world.git('status', '--porcelain'),
    plan: readFileSync(world.planAbsolute),
    readme: readFileSync(join(world.local, 'README.md')),
    branches: world.git('for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads'),
  };
}

function gitCalls(world, ...commands) {
  return world.calls.filter(
    (call) =>
      call.executable === 'git' && (commands.length === 0 || commands.includes(call.args[0])),
  );
}

const WRITE_COMMANDS = [
  'fetch',
  'push',
  'commit-tree',
  'write-tree',
  'read-tree',
  'update-index',
  'update-ref',
  'hook',
];

function gitWrites(world) {
  return world.calls.filter(
    (call) =>
      call.executable === 'git' &&
      (WRITE_COMMANDS.includes(call.args[0]) ||
        (call.args[0] === 'hash-object' && call.args.includes('-w'))),
  );
}

// No Git write beyond the fetch of the base, and no forge mutation.
function assertNothingWritten(world, { allowFetch = false } = {}) {
  const writes = gitWrites(world).filter((call) => !(allowFetch && call.args[0] === 'fetch'));
  assert.deepEqual(
    writes.map((call) => call.args.join(' ')),
    [],
    'no Git write',
  );
  assert.equal(world.forge.creates.length, 0, 'no forge mutation');
}

function assertArgvAudit(world) {
  for (const call of gitCalls(world)) {
    for (const arg of call.args) {
      assert.ok(
        !/^-[A-Za-z]*f[A-Za-z]*$/.test(arg) &&
          !arg.startsWith('--force') &&
          arg !== '--no-verify' &&
          !arg.startsWith('+') &&
          !arg.includes(':+'),
        `git ${call.args.join(' ')} carries a forbidden argument: ${arg}`,
      );
    }
    assert.ok(
      ![
        'checkout',
        'switch',
        'reset',
        'stash',
        'worktree',
        'clean',
        'merge',
        'rebase',
        'add',
        'rm',
        'commit',
      ].includes(call.args[0]),
      `the core never changes the checkout: git ${call.args.join(' ')}`,
    );
  }
  for (const push of gitCalls(world, 'push')) {
    const refspecs = push.args.filter((arg) => arg.includes(':refs/heads/'));
    assert.equal(refspecs.length, 1);
    assert.match(refspecs[0], /^[0-9a-f]{40,64}:refs\/heads\/[^+]+$/);
    assert.ok(push.args.includes('--no-follow-tags'), 'a push never carries tags along');
  }
  // A fetch transfers objects only: no tags, no submodules, no maintenance behind the bound.
  for (const fetch of gitCalls(world, 'fetch')) {
    for (const flag of ['--no-tags', '--no-recurse-submodules', '--no-auto-maintenance']) {
      assert.ok(fetch.args.includes(flag), `git ${fetch.args.join(' ')} lacks ${flag}`);
    }
  }
}

function assertNetworkBounded(world, timeoutMs = UPSTREAM_FETCH_TIMEOUT_MS) {
  const network = gitCalls(world, 'ls-remote', 'fetch', 'push');
  assert.ok(network.length > 0);
  for (const call of network) {
    const label = `git ${call.args.join(' ')}`;
    assert.equal(call.env?.GIT_TERMINAL_PROMPT, '0', label);
    assert.equal(call.env?.GCM_INTERACTIVE, 'never', label);
    assert.equal(call.timeoutMs, timeoutMs, label);
  }
}

function installHook(world, name, script) {
  const hooks = join(world.local, '.git', 'hooks');
  mkdirSync(hooks, { recursive: true });
  const target = join(hooks, name);
  writeFileSync(target, `#!/bin/sh\n${script}\n`);
  chmodSync(target, 0o755);
  return target;
}

function isGit(call, command) {
  return call.executable === 'git' && call.args[0] === command;
}

function advanceBase(world, name = 'base-move.txt') {
  write(world.seed, name, `${name}\n`);
  world.gitIn(world.seed, 'add', '.');
  world.gitIn(world.seed, 'commit', '-m', `move ${name}`);
  world.gitIn(world.seed, 'push', '--quiet', 'origin', 'main');
  return world.gitIn(world.seed, 'rev-parse', 'HEAD');
}

// ---- building commits for the changeset assertion and for complete-branch --------------------

let caseCounter = 0;

// Builds commits in the second clone on top of `origin/main`, publishes the branch and returns its
// tip. `build` runs in the clone and may commit by itself; whatever is left uncommitted is
// committed as one commit afterwards.
function buildBranch(world, build, { branch, message = 'docs: plan demo' } = {}) {
  const name = branch ?? `case-${(caseCounter += 1)}`;
  const second = world.second;
  world.gitIn(second, 'fetch', '--quiet', 'origin');
  world.gitIn(second, 'reset', '--quiet', '--hard');
  world.gitIn(second, 'clean', '-fdq');
  world.gitIn(second, 'checkout', '--quiet', '-B', name, 'origin/main');
  build(second);
  world.gitIn(second, 'add', '-A');
  if (world.gitIn(second, 'status', '--porcelain') !== '')
    world.gitIn(second, 'commit', '-m', message);
  world.gitIn(second, 'push', '--quiet', 'origin', `HEAD:refs/heads/${name}`);
  const tip = world.gitIn(second, 'rev-parse', 'HEAD');
  return { name, tip };
}

function fetchCase(world, name) {
  world.gitIn(world.local, 'fetch', '--quiet', 'origin', `refs/heads/${name}`);
  return world.gitIn(world.local, 'rev-parse', 'FETCH_HEAD');
}

function addPlan(second, text = PLAN_TEXT, file = PLAN_FILE) {
  write(second, file, text);
}

// ---------------------------------------------------------------------------------------------
// Happy path

test('publish --apply pushes one commit that adds only the plan and opens a draft pull request', async (t) => {
  const world = createWorld(t);
  world.git('status', '--porcelain');
  const before = captureLocal(world);
  const baseTip = world.git('rev-parse', 'refs/remotes/origin/main');

  const envelope = await publish(world);

  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(envelope.operation, 'publish');
  assert.equal(envelope.dryRun, false);
  const data = envelope.data;
  assert.equal(data.state, 'pull-request-opened');
  assert.equal(data.branch, BRANCH);
  assert.equal(data.baseOid, baseTip);
  assert.equal(data.planFile, PLAN_FILE);
  assert.equal(data.repository, 'acme/widgets');

  // The remote branch points at one commit whose parent is the base tip and whose diff is the plan.
  assert.equal(remoteRef(world, BRANCH), data.commitOid);
  const remoteGit = (...args) => world.gitIn(world.remote, ...args);
  assert.equal(remoteGit('rev-list', '--count', `main..${BRANCH}`), '1');
  assert.equal(remoteGit('rev-parse', `${BRANCH}^`), baseTip);
  assert.equal(
    remoteGit(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '-r',
      '--no-renames',
      baseTip,
      BRANCH,
    ),
    `A\t${PLAN_FILE}`,
  );
  assert.equal(
    remoteGit('ls-tree', BRANCH, PLAN_FILE).split('\t')[0],
    `100644 blob ${data.blobOid}`,
  );
  assert.equal(remoteGit('cat-file', 'blob', `${BRANCH}:${PLAN_FILE}`), PLAN_TEXT.trim());
  assert.equal(
    remoteGit('log', '-1', '--format=%B', BRANCH),
    'docs: plan demo\n\nThe plan for the demo.',
  );
  assert.equal(
    remoteGit('log', '-1', '--format=%an <%ae>|%cn <%ce>', BRANCH),
    'Plan Publisher <publisher@example.invalid>|Plan Publisher <publisher@example.invalid>',
  );
  assert.equal(remoteGit('rev-parse', 'main'), baseTip, 'the base branch is untouched');

  // The working tree, the index bytes and HEAD are identical before and after.
  const after = captureLocal(world);
  assert.deepEqual(after.index, before.index);
  assert.equal(after.head, before.head);
  assert.equal(after.headRef, before.headRef);
  assert.equal(after.status, before.status);
  assert.deepEqual(after.plan, before.plan);
  assert.deepEqual(after.readme, before.readme);
  assert.equal(after.branches, before.branches, 'no local branch is created or moved');

  // Exactly one pr-create, a draft on the plan branch against the base name, with the shipped body.
  assert.equal(world.forge.creates.length, 1);
  const [create] = world.forge.creates;
  assert.equal(create.method, 'POST');
  assert.equal(create.path, 'repos/acme/widgets/pulls');
  assert.deepEqual(Object.keys(create.payload).sort(), ['base', 'body', 'draft', 'head', 'title']);
  assert.equal(create.payload.draft, true);
  assert.equal(create.payload.base, 'main');
  assert.equal(create.payload.head, BRANCH);
  assert.equal(create.payload.title, 'docs: plan demo');
  const lines = create.payload.body.split('\n');
  assert.equal(
    lines.at(-2),
    `<!-- effective-flow-plan-pr:v1 ${JSON.stringify({ plan: PLAN_FILE })} -->`,
  );
  assert.equal(lines.at(-1), `Refs #${ISSUE}`);
  assert.deepEqual(inspectPlanPrMarker(create.payload.body), { status: 'valid', plan: PLAN_FILE });
  assert.deepEqual(data.pullRequest, {
    number: 100,
    url: 'https://github.com/acme/widgets/pull/100',
  });

  assertArgvAudit(world);
  assertNetworkBounded(world);
});

test('the created pull request comes back from pr-list with the plan marker and draft state', async (t) => {
  const world = createWorld(t);
  const envelope = await publish(world);
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));

  const listed = await trackerOperation(
    'pr-list',
    { cwd: world.local, remote: ACME_URL, planPath: PLAN_FILE, state: 'open' },
    { runner: world.runner },
  );
  assert.equal(listed.ok, true, JSON.stringify(listed.error));
  assert.equal(listed.data.result.length, 1);
  const [pull] = listed.data.result;
  assert.equal(pull.number, envelope.data.pullRequest.number);
  assert.equal(pull.planPrMarker, PLAN_FILE);
  assert.equal(pull.draft, true);
  assert.equal(pull.head, BRANCH);
  assert.equal(pull.base, 'main');
  assert.equal(pull.sameRepository, true);
  assert.equal('body' in pull, false, 'a plan discovery never returns a body');
});

test('a repository without hooks publishes', async (t) => {
  const world = createWorld(t);
  rmSync(join(world.local, '.git', 'hooks'), { recursive: true, force: true });
  const envelope = await publish(world);
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(remoteRef(world, BRANCH), envelope.data.commitOid);
});

test('a configured identity from the environment counts, and the repository needs no user config', async (t) => {
  const world = createWorld(t, { identity: 'env' });
  const envelope = await publish(world);
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(
    world.gitIn(world.remote, 'log', '-1', '--format=%an|%cn', BRANCH),
    'Env Author|Env Committer',
  );
});

test('a plan branch that exists only locally is neither read nor moved', async (t) => {
  const world = createWorld(t);
  const stray = world.git('rev-parse', 'HEAD');
  world.git('branch', BRANCH, stray);
  const envelope = await publish(world);
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(world.git('rev-parse', `refs/heads/${BRANCH}`), stray);
  assert.notEqual(remoteRef(world, BRANCH), stray);
});

test('an empty branch prefix publishes on plan/issue-<N>', async (t) => {
  const world = createWorld(t);
  const envelope = await publish(world, { branchPrefix: '' });
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(envelope.data.branch, 'plan/issue-12');
  assert.ok(remoteRef(world, 'plan/issue-12'));
  assert.equal(world.forge.creates[0].payload.head, 'plan/issue-12');
});

// ---------------------------------------------------------------------------------------------
// Dry run

test('a dry run changes no object, no ref and no forge state, and reports the plan', async (t) => {
  const world = createWorld(t);
  world.git('status', '--porcelain');
  const before = {
    objects: objectCount(world),
    refs: refs(world),
    local: captureLocal(world),
    remoteRefs: world.gitIn(world.remote, 'for-each-ref'),
    remoteObjects: world.gitIn(world.remote, 'count-objects', '-v'),
  };

  const envelope = await publish(world, {}, { apply: false });

  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(envelope.dryRun, true);
  const data = envelope.data;
  assert.equal(data.state, 'dry-run');
  assert.equal(data.branch, BRANCH);
  assert.equal(data.baseBranch, 'main');
  assert.equal(data.baseOid, world.git('rev-parse', 'refs/remotes/origin/main'));
  assert.equal(data.planFile, PLAN_FILE);
  assert.deepEqual(data.findings, []);
  assert.equal(data.blobId, world.git('hash-object', '--no-filters', PLAN_FILE));
  assert.equal(data.title, 'docs: plan demo');
  const lines = data.body.split('\n');
  assert.equal(lines.at(-1), `Refs #${ISSUE}`);
  assert.equal(lines.at(-2), buildPlanPrMarkerLine(PLAN_FILE));
  assert.ok(Array.isArray(data.plannedCommands) && data.plannedCommands.length > 0);

  assert.equal(objectCount(world), before.objects);
  assert.deepEqual(refs(world), before.refs);
  assert.equal(world.gitIn(world.remote, 'for-each-ref'), before.remoteRefs);
  assert.equal(world.gitIn(world.remote, 'count-objects', '-v'), before.remoteObjects);
  const after = captureLocal(world);
  assert.deepEqual(after.index, before.local.index);
  assert.equal(after.status, before.local.status);
  assert.equal(world.forge.creates.length, 0, 'the forge mutation log is unchanged');
  assert.equal(gitCalls(world, 'hook').length, 0, 'no hook runs in a dry run');
  assert.deepEqual(
    gitWrites(world).map((call) => call.args[0]),
    ['fetch'],
    'the fetch of the base is the only write',
  );
  assert.equal(remoteRef(world, BRANCH), null);
  assertArgvAudit(world);
  assertNetworkBounded(world);
});

test('a dry run updates only the base remote-tracking ref when the remote base moved', async (t) => {
  const world = createWorld(t);
  const before = refs(world);
  const moved = advanceBase(world);

  const envelope = await publish(world, {}, { apply: false });

  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(envelope.data.baseOid, moved);
  const after = refs(world);
  // `origin/HEAD` is the symbolic name of the same remote-tracking ref.
  const isBaseTracking = (line) => /^refs\/remotes\/origin\/(?:main|HEAD) /.test(line);
  assert.deepEqual(
    after.filter((line) => !before.includes(line)).filter((line) => !isBaseTracking(line)),
    [],
  );
  assert.ok(after.includes(`refs/remotes/origin/main ${moved}`));
  assert.deepEqual(
    before.filter((line) => !isBaseTracking(line)),
    after.filter((line) => !isBaseTracking(line)),
  );
  assert.equal(world.forge.creates.length, 0);
});

// ---------------------------------------------------------------------------------------------
// Branch lock

test('a second publish for the same issue returns BRANCH_EXISTS and creates nothing', async (t) => {
  const world = createWorld(t);
  const first = await publish(world);
  assert.equal(first.ok, true, JSON.stringify(first.error));
  const remoteBefore = remoteRef(world, BRANCH);
  assert.equal(world.forge.creates.length, 1);

  world.calls.length = 0;
  const second = await publish(world);

  assert.equal(second.ok, false);
  assert.equal(second.error.code, 'BRANCH_EXISTS');
  assert.equal(second.error.details.remoteOid, remoteBefore);
  assert.equal(remoteRef(world, BRANCH), remoteBefore, 'the remote ref is unchanged');
  assert.equal(world.forge.creates.length, 1, 'no second pr-create');
  assert.equal(gitCalls(world, 'push').length, 0);
  assert.equal(gitCalls(world, 'commit-tree').length, 0);
});

test('a branch created from a second clone between the pre-check and the push gives PUSH_REJECTED', async (t) => {
  const world = createWorld(t);
  let raced = false;
  let rival = null;
  world.intercept = async (call, next) => {
    if (!raced && isGit(call, 'ls-remote')) {
      const result = await next();
      raced = true;
      rival = buildBranch(world, (second) => write(second, 'rival.txt', 'rival\n'), {
        branch: BRANCH,
        message: 'docs: rival plan',
      }).tip;
      return result;
    }
    return undefined;
  };

  const envelope = await publish(world);

  assert.equal(raced, true);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'PUSH_REJECTED');
  assert.equal(
    remoteRef(world, BRANCH),
    rival,
    'the remote ref stays as the other publisher wrote it',
  );
  assert.equal(world.forge.creates.length, 0, 'no pr-create');
  assertArgvAudit(world);
});

test('a remote OID that differs after the push gives LOCK_LOST and no pr-create', async (t) => {
  const world = createWorld(t);
  let foreign = null;
  world.intercept = async (call, next) => {
    if (isGit(call, 'push')) {
      const result = await next();
      // Another publisher replaces the branch right after our push.
      foreign = world.gitIn(world.remote, 'commit-tree', 'main^{tree}', '-m', 'foreign');
      world.gitIn(world.remote, 'update-ref', `refs/heads/${BRANCH}`, foreign);
      return result;
    }
    return undefined;
  };

  const envelope = await publish(world);

  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'LOCK_LOST');
  assert.equal(envelope.error.details.remoteOid, foreign);
  assert.equal(envelope.error.details.state, 'unknown');
  assert.equal(world.forge.creates.length, 0);
});

// A follow-up commit on top of the verified one, written straight into the bare remote: a
// fast-forward, so the verified commit stays an ancestor and only the exact tip comparison sees it.
function advanceRemoteBranch(world, branch = BRANCH) {
  const tip = remoteRef(world, branch);
  const followUp = world.gitIn(
    world.remote,
    'commit-tree',
    `${tip}^{tree}`,
    '-p',
    tip,
    '-m',
    'docs: follow-up',
  );
  world.gitIn(world.remote, 'update-ref', `refs/heads/${branch}`, followUp, tip);
  return { tip, followUp };
}

test('publish: a branch fast-forwarded after the push and before pr-create gives LOCK_LOST and no pr-create', async (t) => {
  const world = createWorld(t);
  let moved = null;
  world.intercept = async (call, next) => {
    if (isGit(call, 'push')) {
      const result = await next();
      moved = advanceRemoteBranch(world);
      return result;
    }
    return undefined;
  };

  const envelope = await publish(world);

  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'LOCK_LOST');
  assert.equal(envelope.error.details.state, 'unknown');
  assert.equal(envelope.error.details.commitOid, moved.tip, 'our commit was the verified one');
  assert.equal(envelope.error.details.remoteOid, moved.followUp);
  assert.equal(world.forge.creates.length, 0, 'zero pr-create');
  const lockQueries = gitCalls(world, 'ls-remote');
  assert.deepEqual(lockQueries.at(-1).args, [
    'ls-remote',
    '--exit-code',
    'origin',
    `refs/heads/${BRANCH}`,
  ]);
});

test('an ls-remote line for x/plan/issue-1 does not count as the lock for plan/issue-1', async (t) => {
  const world = createWorld(t);
  const base = world.git('rev-parse', 'HEAD');
  // The fake remote answers the lock query with a longer refname and exit code 0.
  world.intercept = async (call) => {
    if (isGit(call, 'ls-remote') && call.args.includes('refs/heads/plan/issue-12')) {
      return { status: 0, stdout: `${base}\trefs/heads/x/plan/issue-12\n`, stderr: '' };
    }
    return undefined;
  };
  const dry = await publish(world, { branchPrefix: '' }, { apply: false });
  assert.equal(dry.ok, true, JSON.stringify(dry.error));
  assert.equal(dry.data.branch, 'plan/issue-12');

  // Only the exact refname counts, whatever else the output lists.
  world.intercept = async (call) => {
    if (isGit(call, 'ls-remote') && call.args.includes('refs/heads/plan/issue-12')) {
      return {
        status: 0,
        stdout: `${base}\trefs/heads/x/plan/issue-12\n${'b'.repeat(40)}\trefs/heads/plan/issue-12\n`,
        stderr: '',
      };
    }
    return undefined;
  };
  const exact = await publish(world, { branchPrefix: '' }, { apply: false });
  assert.equal(exact.error.code, 'BRANCH_EXISTS');
  assert.equal(exact.error.details.remoteOid, 'b'.repeat(40));
});

test('a real remote branch x/plan/issue-12 does not block plan/issue-12', async (t) => {
  const world = createWorld(t);
  buildBranch(world, (second) => write(second, 'x.txt', 'x\n'), { branch: 'x/plan/issue-12' });
  const envelope = await publish(world, { branchPrefix: '' });
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(envelope.data.branch, 'plan/issue-12');
  assert.equal(remoteRef(world, 'plan/issue-12'), envelope.data.commitOid);
});

test('the lock query asks for exactly refs/heads/<branch> with --exit-code', async (t) => {
  const world = createWorld(t);
  await publish(world, {}, { apply: false });
  const [lock] = gitCalls(world, 'ls-remote');
  assert.deepEqual(lock.args, ['ls-remote', '--exit-code', 'origin', `refs/heads/${BRANCH}`]);
});

// ---------------------------------------------------------------------------------------------
// Named results

test('ISSUE_MISMATCH: the input issue differs from the plan header, before any write', async (t) => {
  const world = createWorld(t);
  write(world.local, PLAN_FILE, PLAN_TEXT.replace(`#${ISSUE}`, '#13'));
  const envelope = await publish(world);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'ISSUE_MISMATCH');
  assert.deepEqual(
    { issue: envelope.error.details.issue, header: envelope.error.details.header },
    { issue: ISSUE, header: 13 },
  );
  assertNothingWritten(world);
  assert.equal(remoteRef(world, BRANCH), null);
});

test('ISSUE_HEADER_INVALID: a malformed or repeated header is refused before any write', async (t) => {
  const world = createWorld(t);
  write(world.local, PLAN_FILE, PLAN_TEXT.replace(`#${ISSUE}`, 'twelve'));
  const malformed = await publish(world);
  assert.equal(malformed.error.code, 'ISSUE_HEADER_INVALID');
  write(
    world.local,
    PLAN_FILE,
    PLAN_TEXT.replace('\n## Requirement', `**Issue:** #${ISSUE}\n\n## Requirement`),
  );
  const repeated = await publish(world);
  assert.equal(repeated.error.code, 'ISSUE_HEADER_INVALID');
  assertNothingWritten(world);
});

test('IDENTITY_MISSING: no configured identity writes nothing', async (t) => {
  const world = createWorld(t, { identity: 'none' });
  const objectsBefore = objectCount(world);
  const envelope = await publish(world);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'IDENTITY_MISSING');
  assert.equal(objectCount(world), objectsBefore);
  assertNothingWritten(world);
  assert.equal(gitCalls(world, 'fetch').length, 0, 'checked before the fetch');
  assert.equal(remoteRef(world, BRANCH), null);
});

test('IDENTITY_MISSING: only the author identity configured is not enough', async (t) => {
  const world = createWorld(t, { identity: 'none' });
  world.environment.GIT_AUTHOR_NAME = 'Only Author';
  world.environment.GIT_AUTHOR_EMAIL = 'only-author@example.invalid';
  const envelope = await publish(world);
  assert.equal(envelope.error.code, 'IDENTITY_MISSING');
  assertNothingWritten(world);
});

test('PR_EXISTS: an open same-repository pull request on the head and the base', async (t) => {
  const world = createWorld(t);
  world.forge.seedPull({ head: BRANCH, base: 'main' });
  const envelope = await publish(world);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'PR_EXISTS');
  assert.deepEqual(envelope.error.details.pullRequests, [
    { number: 100, url: 'https://github.com/acme/widgets/pull/100' },
  ]);
  assert.equal(remoteRef(world, BRANCH), null, 'nothing was pushed');
  assertNothingWritten(world, { allowFetch: true });
});

test('GIT_UNSUPPORTED: Git 2.35 is refused, also on a dry run, before any object is written', async (t) => {
  for (const apply of [false, true]) {
    const world = createWorld(t);
    world.intercept = async (call) =>
      call.executable === 'git' && call.args[0] === '--version'
        ? { status: 0, stdout: 'git version 2.35.1\n', stderr: '' }
        : undefined;
    const objectsBefore = objectCount(world);
    const envelope = await publish(world, {}, { apply });
    assert.equal(envelope.ok, false, `apply: ${apply}`);
    assert.equal(envelope.dryRun, !apply);
    assert.equal(envelope.error.code, 'GIT_UNSUPPORTED');
    assert.equal(envelope.error.details.version, '2.35');
    assert.equal(objectCount(world), objectsBefore);
    assertNothingWritten(world);
  }
});

test('Git 2.36 and newer pass the version floor; an unreadable version does not', async (t) => {
  for (const [output, supported] of [
    ['git version 2.36.0', true],
    ['git version 2.39.2 (Apple Git-143)', true],
    ['git version 3.0.0', true],
    ['git version 1.9.9', false],
    ['not a version', false],
  ]) {
    const world = createWorld(t);
    world.intercept = async (call) =>
      call.executable === 'git' && call.args[0] === '--version'
        ? { status: 0, stdout: `${output}\n`, stderr: '' }
        : undefined;
    const envelope = await publish(world, {}, { apply: false });
    assert.equal(envelope.ok, supported, output);
    if (!supported) assert.equal(envelope.error.code, 'GIT_UNSUPPORTED');
  }
});

// ---------------------------------------------------------------------------------------------
// Lookups

test('the lookups list without head and ignore fork pull requests on the same branch name', async (t) => {
  const world = createWorld(t);
  const fork = world.forge.seedPull({ head: BRANCH, base: 'main', fork: true });
  const otherBase = world.forge.seedPull({ head: BRANCH, base: 'develop' });
  const elsewhere = world.forge.seedPull({ head: 'unrelated', base: 'main' });
  assert.deepEqual(
    [fork.head.label, otherBase.head.label, elsewhere.head.label],
    [`mallory:${BRANCH}`, `acme:${BRANCH}`, 'acme:unrelated'],
    'a GitHub-shaped payload with head.ref, head.label and head.repo',
  );

  const envelope = await publish(world);

  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.deepEqual(envelope.data.ignoredPullRequests, [
    { number: fork.number, url: fork.html_url },
    { number: otherBase.number, url: otherBase.html_url },
  ]);
  assert.ok(world.forge.lists.length >= 2);
  for (const list of world.forge.lists) {
    assert.equal(list.query.has('head'), false, `pr-list without head: ${list.endpoint}`);
    assert.equal(list.query.get('state'), 'open');
  }
  // The pre-check lists without planPath; the read-back lists with it (the marker filter is the
  // tracker's, so the forge only ever sees the plain listing).
  assert.equal(envelope.data.pullRequest.number, 103);
});

test('the pr-create payload carries base equal to baseBranch', async (t) => {
  const world = createWorld(t);
  world.gitIn(world.seed, 'checkout', '--quiet', '-b', 'release');
  write(world.seed, 'release.txt', 'release\n');
  world.gitIn(world.seed, 'add', '.');
  world.gitIn(world.seed, 'commit', '-m', 'release');
  world.gitIn(world.seed, 'push', '--quiet', 'origin', 'release');
  const envelope = await publish(world, { baseBranch: 'release' });
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(world.forge.creates[0].payload.base, 'release');
  assert.equal(envelope.data.baseBranch, 'release');
  assert.equal(
    world.gitIn(world.remote, 'rev-parse', `${BRANCH}^`),
    world.gitIn(world.remote, 'rev-parse', 'release'),
    'the parent is the base branch tip, not the checked-out branch',
  );
});

test('a read-back with sameRepository false or another base gives DRAFT_UNCONFIRMED', async (t) => {
  for (const [label, store] of [
    ['fork', { fork: true }],
    ['other base', { base: 'develop' }],
  ]) {
    const world = createWorld(t);
    world.forge.store = store;
    const envelope = await publish(world);
    assert.equal(envelope.ok, false, label);
    assert.equal(envelope.error.code, 'DRAFT_UNCONFIRMED', label);
    assert.equal(envelope.error.details.pullRequest.number, 100);
    assert.equal(
      envelope.error.details.pullRequest.url,
      'https://github.com/acme/widgets/pull/100',
    );
    assert.equal(world.forge.creates.length, 1);
    assert.equal(
      remoteRef(world, BRANCH),
      envelope.error.details.commitOid,
      'the branch stays pushed',
    );
  }
});

test('a read-back without the number, with draft false or without the marker gives DRAFT_UNCONFIRMED', async (t) => {
  const cases = [
    ['hidden from the listing', { hidden: true }],
    ['draft false', { draft: false }],
    ['marker stripped from the stored body', { body: 'no marker here\n' }],
  ];
  for (const [label, store] of cases) {
    const world = createWorld(t);
    world.forge.store = store;
    const envelope = await publish(world);
    assert.equal(envelope.error?.code, 'DRAFT_UNCONFIRMED', label);
    assert.equal(envelope.error.details.pullRequest.number, 100, label);
    assert.equal(world.forge.creates.length, 1, label);
  }
  const world = createWorld(t);
  world.forge.listFailureAfterCreate = true;
  const failed = await publish(world);
  assert.equal(failed.error.code, 'DRAFT_UNCONFIRMED', 'a failing read-back');
});

test('a fork pull request is not adopted by the read-back', async (t) => {
  const world = createWorld(t);
  world.forge.store = { hidden: true };
  // The only listed pull request on the branch is a fork's, whose number is not the created one.
  world.forge.seedPull({
    head: BRANCH,
    base: 'main',
    fork: true,
    body: `x\n\n${buildPlanPrMarkerLine(PLAN_FILE)}\nRefs #${ISSUE}`,
  });
  const envelope = await publish(world);
  assert.equal(envelope.error.code, 'DRAFT_UNCONFIRMED');
  assert.equal(envelope.error.details.pullRequest.number, 101);
});

// ---------------------------------------------------------------------------------------------
// Remote name versus URL

test('every tracker call carries the URL of the named remote', async (t) => {
  const world = createWorld(t, { remoteUrls: { origin: OTHER_URL, upstream: ACME_URL } });
  world.git('remote', 'add', 'upstream', world.remote);
  const envelope = await publish(world, { remote: 'upstream' });
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.deepEqual(
    [...world.forge.slugs],
    ['acme/widgets'],
    "the forge is addressed by upstream's URL only",
  );
  assert.ok(world.forge.lists.length >= 2);
  const urlLookups = gitCalls(world, 'remote');
  assert.deepEqual(
    urlLookups.map((call) => call.args.join(' ')),
    ['remote get-url upstream', 'remote get-url --push --all upstream'],
    'the fetch URL is resolved once and checked against the push URLs once',
  );
  for (const command of ['fetch', 'ls-remote', 'push']) {
    for (const call of gitCalls(world, command)) {
      assert.ok(
        call.args.includes('upstream'),
        `git ${call.args.join(' ')} targets the named remote`,
      );
      assert.ok(!call.args.includes('origin'));
    }
  }
  assert.equal(
    world.gitIn(world.remote, 'rev-parse', `${BRANCH}^`),
    world.git('rev-parse', 'refs/remotes/upstream/main'),
  );
  assert.equal(world.forge.creates.length, 1);
});

test('an unconfigured remote name is INVALID_INPUT before any write', async (t) => {
  const world = createWorld(t);
  const envelope = await publish(world, { remote: 'nowhere' });
  assert.equal(envelope.error.code, 'INVALID_INPUT');
  assertNothingWritten(world);
});

// ---------------------------------------------------------------------------------------------
// Byte rules and plan file rules

test('a plan file with NUL is refused before any mutation', async (t) => {
  const world = createWorld(t);
  writeFileSync(world.planAbsolute, Buffer.from(`${PLAN_TEXT}\0trailing\n`));
  const objectsBefore = objectCount(world);
  for (const apply of [false, true]) {
    const envelope = await publish(world, {}, { apply });
    assert.equal(envelope.error.code, 'INVALID_CONTENT');
    assert.equal(envelope.error.details.reason, 'nul');
  }
  assert.equal(objectCount(world), objectsBefore);
  assertNothingWritten(world);
});

test('a plan file with invalid UTF-8 is refused before any mutation', async (t) => {
  const world = createWorld(t);
  writeFileSync(
    world.planAbsolute,
    Buffer.concat([Buffer.from(PLAN_TEXT), Buffer.from([0xc3, 0x28, 0xff, 0x0a])]),
  );
  const objectsBefore = objectCount(world);
  for (const apply of [false, true]) {
    const envelope = await publish(world, {}, { apply });
    assert.equal(envelope.error.code, 'INVALID_CONTENT');
    assert.equal(envelope.error.details.reason, 'invalid-utf8');
  }
  assert.equal(objectCount(world), objectsBefore);
  assertNothingWritten(world);
});

test('an oversized plan file is refused before any mutation', async (t) => {
  const world = createWorld(t);
  writeFileSync(world.planAbsolute, `${PLAN_TEXT}${'a'.repeat(512 * 1024)}\n`);
  const envelope = await publish(world);
  assert.equal(envelope.error.code, 'INVALID_CONTENT');
  assert.equal(envelope.error.details.reason, 'oversized');
  assertNothingWritten(world);
});

test('a symlinked, nested, outside, missing or misnamed plan file is refused before any write', async (t) => {
  const world = createWorld(t);
  const outside = join(world.container, 'outside.md');
  writeFileSync(outside, PLAN_TEXT);
  const linkName = 'docs/plan/2026-10-17-issue-12-link.md';
  symlinkSync(outside, join(world.local, linkName));
  write(world.local, 'docs/plan/sub/2026-10-17-issue-12-nested.md', PLAN_TEXT);
  write(world.local, 'docs/other/2026-10-17-issue-12-other.md', PLAN_TEXT);
  write(world.local, 'docs/plan/notes.md', PLAN_TEXT);
  write(
    world.local,
    'docs/plan/2026-10-17-issue-13-demo.md',
    PLAN_TEXT.replace(`#${ISSUE}`, '#13'),
  );
  write(world.local, 'docs/plan/2026-10-17-issue-12-Demo.md', PLAN_TEXT);
  write(world.local, 'docs/plan/2026-10-17-issue-12-demo.txt', PLAN_TEXT);
  symlinkSync(world.container, join(world.local, 'docs/linked'));

  const cases = [
    [linkName, 'UNSAFE_PATH'],
    ['docs/plan/sub/2026-10-17-issue-12-nested.md', 'UNSAFE_PATH'],
    ['docs/other/2026-10-17-issue-12-other.md', 'UNSAFE_PATH'],
    ['docs/plan/2026-10-17-issue-12-missing.md', 'NOT_FOUND'],
    ['docs/plan/notes.md', 'CHANGESET_INVALID'],
    ['docs/plan/2026-10-17-issue-13-demo.md', 'ISSUE_MISMATCH'],
    ['docs/plan/2026-10-17-issue-12-Demo.md', 'CHANGESET_INVALID'],
    ['docs/plan/2026-10-17-issue-12-demo.txt', 'UNSAFE_PATH'],
    ['../outside.md', 'UNSAFE_PATH'],
    ['docs/linked/outside.md', 'UNSAFE_PATH'],
  ];
  for (const [planFile, code] of cases) {
    const envelope = await publish(world, { planFile });
    assert.equal(envelope.ok, false, planFile);
    assert.equal(envelope.error.code, code, `${planFile}: ${envelope.error.message}`);
  }
  assertNothingWritten(world);
  assert.equal(gitCalls(world, 'fetch').length, 0, 'every file rule is checked before the fetch');
});

test('a plan path the base already tracks is refused after the fetch and before any write', async (t) => {
  const world = createWorld(t);
  write(world.seed, PLAN_FILE, '# Already there\n');
  world.gitIn(world.seed, 'add', '.');
  world.gitIn(world.seed, 'commit', '-m', 'track the plan');
  world.gitIn(world.seed, 'push', '--quiet', 'origin', 'main');
  const envelope = await publish(world);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'CHANGESET_INVALID');
  assert.deepEqual(envelope.error.details.violations, [
    { violation: 'modification', path: PLAN_FILE },
  ]);
  assertNothingWritten(world, { allowFetch: true });
});

test('a base branch that does not exist on the remote is REMOTE_UNREACHABLE', async (t) => {
  const world = createWorld(t);
  const envelope = await publish(world, { baseBranch: 'nonexistent' });
  assert.equal(envelope.error.code, 'REMOTE_UNREACHABLE');
  assert.equal(envelope.error.details.reason, 'failed');
  assertNothingWritten(world, { allowFetch: true });
});

// ---------------------------------------------------------------------------------------------
// Scan

test('a high-confidence finding in the plan, title or body blocks the publication without echoing it', async (t) => {
  const token = tokenValue(3);
  const cases = [
    [
      'plan',
      (world) => write(world.local, PLAN_FILE, `${PLAN_TEXT}\nThe value ${token} leaked.\n`),
      {},
    ],
    ['title', () => {}, { title: `docs: plan ${token}` }],
    ['body', () => {}, { body: `Prose with ${token} inside.` }],
    ['commitMessage', () => {}, { commitMessage: `docs: plan demo\n\n${token}` }],
  ];
  for (const [field, prepare, overrides] of cases) {
    const world = createWorld(t);
    prepare(world);
    const objectsBefore = objectCount(world);
    const envelope = await publish(world, overrides);
    assert.equal(envelope.ok, false, field);
    assert.equal(envelope.error.code, 'SCAN_BLOCKED', field);
    assert.ok(
      envelope.error.details.blocking.some((id) => id.startsWith(`provider-token:${field}:`)),
      field,
    );
    assert.ok(!JSON.stringify(envelope).includes(token), `${field}: the value is never echoed`);
    assert.equal(objectCount(world), objectsBefore);
    assertNothingWritten(world, { allowFetch: true });
  }
});

test('an unattended run blocks lower-confidence findings too', async (t) => {
  const world = createWorld(t);
  write(world.local, PLAN_FILE, `${PLAN_TEXT}\nBuilt under /Users/someone/work.\n`);
  const envelope = await publish(world);
  assert.equal(envelope.error.code, 'SCAN_BLOCKED');
  assert.deepEqual(envelope.error.details.blocking, ['absolute-local-path:plan:10']);
  assertNothingWritten(world, { allowFetch: true });
});

// ---------------------------------------------------------------------------------------------
// Hooks

test('a commit-msg hook that exits nonzero refuses the publication after writing only the blob', async (t) => {
  const world = createWorld(t);
  installHook(world, 'commit-msg', 'echo "message refused by policy" >&2\nexit 1');
  const objectsBefore = objectCount(world);

  const envelope = await publish(world);

  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'COMMIT_MSG_HOOK_REJECTED');
  assert.equal(envelope.error.details.reason, 'rejected');
  assert.match(envelope.error.details.stderr, /message refused by policy/);
  assert.equal(objectCount(world), objectsBefore + 1, 'only the blob was written');
  assert.equal(gitCalls(world, 'commit-tree').length, 0);
  assert.equal(gitCalls(world, 'push').length, 0);
  assert.equal(remoteRef(world, BRANCH), null);
  assert.equal(world.forge.creates.length, 0);
  const hookCall = gitCalls(world, 'hook')[0];
  assert.deepEqual(hookCall.args.slice(0, 5), [
    'hook',
    'run',
    '--ignore-missing',
    'commit-msg',
    '--',
  ]);
  assert.equal(hookCall.timeoutMs, UPSTREAM_FETCH_TIMEOUT_MS, 'bounded by the same timeout');
});

// A hook that sleeps without redirecting its output keeps Git's pipes open after Git itself is
// stopped. The bound must still end the call: the runner stops the whole process group, so the
// sleep dies with Git instead of holding the run for its full duration. `trap '' TERM` survives
// `exec`, so that variant ignores SIGTERM and is only ended by the SIGKILL after the grace period.
const HOOK_SLEEP_SECONDS = 30;
const SMALL_TIMEOUT_MS = 1500;
const HOOK_BOUND_MS = 8000;

function installSleepingHook(world, name, { ignoreTerm = false } = {}) {
  const pidFile = join(world.container, `${name}.pid`);
  installHook(
    world,
    name,
    `${ignoreTerm ? "trap '' TERM\n" : ''}echo $$ > "${pidFile}"\nexec sleep ${HOOK_SLEEP_SECONDS}`,
  );
  return pidFile;
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Waits until the hook process is gone (a dead child may linger briefly until it is reaped), and
// kills it in any case after the test, so no sleep outlives the suite.
async function assertHookProcessGone(t, pidFile) {
  assert.ok(existsSync(pidFile), 'the hook ran');
  const pid = Number(readFileSync(pidFile, 'utf8').trim());
  t.after(() => {
    if (processAlive(pid)) process.kill(pid, 'SIGKILL');
  });
  const deadline = Date.now() + 3000;
  while (processAlive(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(processAlive(pid), false, 'the hook process did not outlive the bound');
}

function timeCalls(world, command) {
  const durations = [];
  world.intercept = async (call, next) => {
    if (!isGit(call, command)) return undefined;
    const started = Date.now();
    const result = await next();
    durations.push(Date.now() - started);
    return result;
  };
  return durations;
}

for (const ignoreTerm of [false, true]) {
  const variant = ignoreTerm ? ' and ignores SIGTERM' : '';
  test(`a commit-msg hook that sleeps past the timeout${variant} gives COMMIT_MSG_HOOK_REJECTED within the bound`, async (t) => {
    const world = createWorld(t);
    const pidFile = installSleepingHook(world, 'commit-msg', { ignoreTerm });
    const durations = timeCalls(world, 'hook');

    const envelope = await publish(world, {}, { timeoutMs: SMALL_TIMEOUT_MS });

    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'COMMIT_MSG_HOOK_REJECTED');
    assert.equal(envelope.error.details.reason, 'timeout');
    assert.equal(durations.length, 1);
    assert.ok(
      durations[0] < HOOK_BOUND_MS,
      `the hook call took ${durations[0]} ms; the bound must end it far below the ${HOOK_SLEEP_SECONDS} s sleep`,
    );
    assert.equal(gitCalls(world, 'hook')[0].timeoutMs, SMALL_TIMEOUT_MS);
    assert.equal(gitCalls(world, 'hook')[0].processGroup, true);
    assert.equal(gitCalls(world, 'push').length, 0);
    assert.equal(remoteRef(world, BRANCH), null);
    await assertHookProcessGone(t, pidFile);
  });
}

test('a commit-msg hook that appends a token is caught by the rescan of the final message', async (t) => {
  const world = createWorld(t);
  const token = tokenValue(5);
  installHook(world, 'commit-msg', `printf '\\nNote: %s\\n' '${token}' >> "$1"`);
  const envelope = await publish(world);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'SCAN_BLOCKED');
  assert.equal(envelope.error.details.stage, 'commit-msg');
  assert.deepEqual(envelope.error.details.blocking, ['provider-token:commitMessage:5']);
  assert.ok(!JSON.stringify(envelope).includes(token));
  assert.equal(gitCalls(world, 'commit-tree').length, 0);
  assert.equal(gitCalls(world, 'push').length, 0);
  assert.equal(remoteRef(world, BRANCH), null);
});

test('a commit-msg hook that appends a closing keyword is caught by the rescan of the final message', async (t) => {
  for (const line of [
    'Fixes #12',
    'closes: acme/widgets#12',
    'Resolved https://github.com/acme/widgets/issues/12',
  ]) {
    const world = createWorld(t);
    installHook(world, 'commit-msg', `printf '\\n%s\\n' '${line}' >> "$1"`);
    const envelope = await publish(world);
    assert.equal(envelope.ok, false, line);
    assert.equal(envelope.error.code, 'CLOSING_KEYWORD', line);
    assert.equal(gitCalls(world, 'commit-tree').length, 0);
    assert.equal(remoteRef(world, BRANCH), null);
  }
});

// The rewritten message file is judged by its size before it is read, and read with a bound, so a
// hook can neither make the run read a huge file nor a device behind a symlink.
test('a commit-msg hook that leaves an oversized message is INPUT_TOO_LARGE before the file is read', async (t) => {
  const world = createWorld(t);
  installHook(
    world,
    'commit-msg',
    `dd if=/dev/zero bs=1024 count=200 2>/dev/null | tr '\\000' 'x' >> "$1"`,
  );
  const wholeReads = [];
  const fs = {
    ...nodeFs,
    readFileSync: (target, ...rest) => {
      wholeReads.push(String(target));
      return nodeFs.readFileSync(target, ...rest);
    },
  };

  const envelope = await publish(world, {}, { fs });

  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'INPUT_TOO_LARGE');
  assert.equal(envelope.error.details.field, 'commitMessage');
  assert.equal(envelope.error.details.limit, 65_536);
  assert.deepEqual(
    wholeReads.filter((target) => target.endsWith('COMMIT_EDITMSG')),
    [],
    'the message file is never read whole',
  );
  assert.equal(gitCalls(world, 'commit-tree').length, 0);
  assert.equal(gitCalls(world, 'push').length, 0);
  assert.equal(remoteRef(world, BRANCH), null);
});

test('a commit-msg hook that swaps the message file for a symlink to a device is refused unread', async (t) => {
  const world = createWorld(t);
  installHook(world, 'commit-msg', 'rm -f "$1"\nln -s /dev/zero "$1"');
  const envelope = await publish(world);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'UNSAFE_PATH');
  assert.equal(envelope.error.details.field, 'commitMessage');
  assert.equal(gitCalls(world, 'commit-tree').length, 0);
  assert.equal(gitCalls(world, 'push').length, 0);
});

test('a commit-msg hook that breaks the subject is refused as INVALID_COMMIT_MESSAGE', async (t) => {
  const world = createWorld(t);
  installHook(world, 'commit-msg', `printf 'feat: rewritten\\n' > "$1"`);
  const envelope = await publish(world);
  assert.equal(envelope.error.code, 'INVALID_COMMIT_MESSAGE');
  assert.equal(remoteRef(world, BRANCH), null);
});

test('the commit uses the message after a legitimate commit-msg hook edited it', async (t) => {
  const world = createWorld(t);
  installHook(
    world,
    'commit-msg',
    `printf '\\nSigned-off-by: Hook <hook@example.invalid>\\n' >> "$1"`,
  );
  const envelope = await publish(world);
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(
    world.gitIn(world.remote, 'log', '-1', '--format=%B', BRANCH),
    'docs: plan demo\n\nThe plan for the demo.\n\nSigned-off-by: Hook <hook@example.invalid>',
  );
});

test('a pre-commit hook that would modify the working tree is never run, a pre-push hook still is', async (t) => {
  const world = createWorld(t);
  installHook(
    world,
    'pre-commit',
    `echo ran > "${world.local}/.pre-commit-ran"\necho changed >> "${world.local}/README.md"\nexit 1`,
  );
  installHook(world, 'pre-push', `echo ran > "${world.container}/pre-push-ran"`);
  const readme = readFileSync(join(world.local, 'README.md'));

  const envelope = await publish(world);

  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(existsSync(join(world.local, '.pre-commit-ran')), false);
  assert.deepEqual(readFileSync(join(world.local, 'README.md')), readme);
  assert.equal(
    existsSync(join(world.container, 'pre-push-ran')),
    true,
    'pre-push runs on the push',
  );
  assert.equal(
    gitCalls(world).filter((call) => call.args[0] === 'commit').length,
    0,
    'the commit is plumbing, never `git commit`',
  );
});

test('a failing pre-push hook is reported as PUSH_REJECTED and leaves the remote unchanged', async (t) => {
  const world = createWorld(t);
  installHook(world, 'pre-push', 'echo "push policy" >&2\nexit 1');
  const envelope = await publish(world);
  assert.equal(envelope.error.code, 'PUSH_REJECTED');
  assert.match(envelope.error.details.stderr, /push policy/);
  assert.equal(remoteRef(world, BRANCH), null);
  assert.equal(world.forge.creates.length, 0);
});

for (const ignoreTerm of [false, true]) {
  const variant = ignoreTerm ? ' and ignores SIGTERM' : '';
  test(`a pre-push hook that sleeps past the timeout${variant} is cut off: REMOTE_UNREACHABLE, nothing pushed`, async (t) => {
    const world = createWorld(t);
    const pidFile = installSleepingHook(world, 'pre-push', { ignoreTerm });
    const durations = timeCalls(world, 'push');

    const envelope = await publish(world, {}, { timeoutMs: SMALL_TIMEOUT_MS });

    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'REMOTE_UNREACHABLE');
    assert.equal(envelope.error.details.state, 'nothing-pushed');
    assert.equal(durations.length, 1);
    assert.ok(
      durations[0] < HOOK_BOUND_MS,
      `the push took ${durations[0]} ms; the bound must end it far below the ${HOOK_SLEEP_SECONDS} s sleep`,
    );
    const push = gitCalls(world, 'push')[0];
    assert.equal(push.timeoutMs, SMALL_TIMEOUT_MS);
    assert.equal(push.processGroup, true);
    assert.equal(gitCalls(world, 'ls-remote').length, 2, 'one more ls-remote decided the state');
    assert.equal(remoteRef(world, BRANCH), null);
    assert.equal(world.forge.creates.length, 0);
    await assertHookProcessGone(t, pidFile);
  });
}

test('a server-side refusal (an unsigned-commit rule) is reported as PUSH_REJECTED', async (t) => {
  const world = createWorld(t);
  const hook = join(world.remote, 'hooks', 'pre-receive');
  mkdirSync(dirname(hook), { recursive: true });
  writeFileSync(hook, '#!/bin/sh\necho "commits must be signed" >&2\nexit 1\n');
  chmodSync(hook, 0o755);
  const envelope = await publish(world);
  assert.equal(envelope.error.code, 'PUSH_REJECTED');
  assert.equal(remoteRef(world, BRANCH), null);
  assert.equal(world.forge.creates.length, 0);
});

// ---------------------------------------------------------------------------------------------
// Draft rules and pr-create failures

test('the probe states the draft capability the core requires', async (t) => {
  const world = createWorld(t);
  const probe = await trackerOperation(
    'probe',
    { cwd: world.local, remote: ACME_URL },
    { runner: world.runner },
  );
  // Note: the GitHub probe states `pullRequestDraftCreate: true` unconditionally, so the core's
  // UNSUPPORTED_CAPABILITY gate on a false probe cannot be reached through an injected runner. A
  // repository that refuses drafts is reported by `pr-create` instead (see the next test).
  assert.equal(probe.data.capabilities.pullRequestDraftCreate, true);
});

test('a repository that refuses drafts gives UNSUPPORTED_CAPABILITY with the branch pushed and one create', async (t) => {
  const world = createWorld(t);
  world.forge.createMode = 'draft-unsupported';
  const envelope = await publish(world);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'UNSUPPORTED_CAPABILITY');
  assert.equal(envelope.error.details.state, 'branch-pushed');
  assert.equal(envelope.error.details.branch, BRANCH);
  assert.equal(remoteRef(world, BRANCH), envelope.error.details.commitOid);
  assert.equal(world.forge.creates.length, 1);
  assert.equal(world.forge.creates[0].payload.draft, true);
});

// ---------------------------------------------------------------------------------------------
// pr-create may have succeeded

test('a pr-create that fails after the forge created it leads to one lookup and no second create', async (t) => {
  const world = createWorld(t);
  world.forge.createMode = 'fail-after';
  const envelope = await publish(world);
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(world.forge.creates.length, 1, 'no second create');
  assert.equal(
    envelope.data.pullRequest.number,
    100,
    'the lookup adopted the created pull request',
  );
  // The lookup after the failure plus the read-back; the pre-check came before the create.
  assert.equal(world.forge.listsAfterFirstCreate(), 2);
  assertArgvAudit(world);
});

test('a pr-create with an unreadable answer is adopted through the lookup, still with one create', async (t) => {
  const world = createWorld(t);
  world.forge.createMode = 'garbled';
  const envelope = await publish(world);
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(world.forge.creates.length, 1);
  assert.equal(envelope.data.pullRequest.number, 100);
});

test('a pr-create that failed before the forge acted leaves the branch pushed with the tracker code', async (t) => {
  const world = createWorld(t);
  world.forge.createMode = 'fail-before';
  const envelope = await publish(world);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'COMMAND_FAILED');
  assert.equal(envelope.error.details.state, 'branch-pushed');
  assert.equal(world.forge.creates.length, 1, 'never a second create');
  assert.equal(world.forge.listsAfterFirstCreate(), 1, 'exactly one lookup');
  assert.equal(remoteRef(world, BRANCH), envelope.error.details.commitOid);
});

test('a pr-create that failed with an unreadable lookup is PR_UNCONFIRMED', async (t) => {
  const world = createWorld(t);
  world.forge.createMode = 'fail-after';
  world.forge.listFailureAfterCreate = true;
  const envelope = await publish(world);
  assert.equal(envelope.error.code, 'PR_UNCONFIRMED');
  assert.equal(envelope.error.details.state, 'branch-pushed');
  assert.equal(world.forge.creates.length, 1);
  assert.equal(world.forge.listsAfterFirstCreate(), 1);
});

test('a fork pull request is not adopted by the lookup after a pr-create failure', async (t) => {
  const world = createWorld(t);
  world.forge.createMode = 'fail-before';
  world.forge.seedPull({
    head: BRANCH,
    base: 'main',
    fork: true,
    body: `x\n\n${buildPlanPrMarkerLine(PLAN_FILE)}\nRefs #${ISSUE}`,
  });
  const envelope = await publish(world);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.details.state, 'branch-pushed');
  assert.equal(envelope.error.details.pullRequest, undefined);
  assert.equal(world.forge.creates.length, 1);
});

// ---------------------------------------------------------------------------------------------
// Bounded network calls

test('every network Git call runs with the non-interactive environment and the timeout', async (t) => {
  const world = createWorld(t);
  const envelope = await publish(world, {}, { timeoutMs: 45_000 });
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assertNetworkBounded(world, 45_000);
  const kinds = new Set(gitCalls(world, 'ls-remote', 'fetch', 'push').map((call) => call.args[0]));
  assert.deepEqual([...kinds].sort(), ['fetch', 'ls-remote', 'push']);

  const defaults = createWorld(t);
  await publish(defaults, {}, { apply: false });
  assertNetworkBounded(defaults, 60_000);
});

test('a hanging lock query or fetch is REMOTE_UNREACHABLE and writes nothing', async (t) => {
  for (const command of ['ls-remote', 'fetch']) {
    for (const result of [
      TIMEOUT_RESULT,
      { status: null, forcedKill: true, stdout: '', stderr: '' },
    ]) {
      const world = createWorld(t);
      world.intercept = async (call) => (isGit(call, command) ? result : undefined);
      const objectsBefore = objectCount(world);
      const envelope = await publish(world);
      assert.equal(envelope.error.code, 'REMOTE_UNREACHABLE', command);
      assert.equal(envelope.error.details.reason, 'timeout');
      assert.equal(objectCount(world), objectsBefore);
      assert.equal(world.forge.creates.length, 0);
      assert.equal(remoteRef(world, BRANCH), null);
    }
  }
});

test('a real push hang gives REMOTE_UNREACHABLE when nothing reached the remote', async (t) => {
  const world = createWorld(t);
  // The remote end of the push hangs. The helper runs in the push's process group, so the bound
  // stops it together with Git.
  const hang = join(world.container, 'hang-receive-pack.sh');
  writeFileSync(hang, '#!/bin/sh\nexec sleep 20\n');
  chmodSync(hang, 0o755);
  world.git('config', 'remote.origin.receivepack', hang);
  const started = Date.now();
  const envelope = await publish(world, {}, { timeoutMs: 3000 });
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'REMOTE_UNREACHABLE');
  assert.equal(envelope.error.details.state, 'nothing-pushed');
  assert.ok(Date.now() - started < 15_000, 'the injected timeout bounds the wait');
  assert.equal(remoteRef(world, BRANCH), null);
  assert.equal(world.forge.creates.length, 0);
  assert.equal(gitCalls(world, 'ls-remote').length, 2, 'one more ls-remote decided the state');
});

test('a push that timed out after it landed is PUSH_UNCONFIRMED, decided by one ls-remote', async (t) => {
  const world = createWorld(t);
  world.intercept = async (call, next) => {
    if (isGit(call, 'push')) {
      await next();
      return TIMEOUT_RESULT;
    }
    return undefined;
  };
  const envelope = await publish(world);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'PUSH_UNCONFIRMED');
  assert.equal(envelope.error.details.state, 'branch-pushed');
  assert.equal(remoteRef(world, BRANCH), envelope.error.details.commitOid);
  assert.equal(gitCalls(world, 'ls-remote').length, 2);
  assert.equal(world.forge.creates.length, 0);
});

test('a push that timed out while another publisher holds the branch is LOCK_LOST', async (t) => {
  const world = createWorld(t);
  let rival = null;
  world.intercept = async (call) => {
    if (isGit(call, 'push')) {
      rival = buildBranch(world, (second) => write(second, 'rival.txt', 'rival\n'), {
        branch: BRANCH,
        message: 'docs: rival plan',
      }).tip;
      return TIMEOUT_RESULT;
    }
    return undefined;
  };
  const envelope = await publish(world);
  assert.equal(envelope.error.code, 'LOCK_LOST');
  assert.equal(envelope.error.details.remoteOid, rival);
  assert.equal(envelope.error.details.state, 'unknown');
});

test('a push timeout followed by an unreachable remote is REMOTE_UNREACHABLE with an unknown state', async (t) => {
  const world = createWorld(t);
  let lockQueries = 0;
  world.intercept = async (call) => {
    if (isGit(call, 'push')) return TIMEOUT_RESULT;
    if (isGit(call, 'ls-remote')) {
      lockQueries += 1;
      if (lockQueries === 2) return TIMEOUT_RESULT;
    }
    return undefined;
  };
  const envelope = await publish(world);
  assert.equal(envelope.error.code, 'REMOTE_UNREACHABLE');
  assert.equal(envelope.error.details.state, 'unknown');
});

// ---------------------------------------------------------------------------------------------
// Single-file assertion

test('assert-changeset accepts the plain add of one plan file', async (t) => {
  const world = createWorld(t);
  const { name } = buildBranch(world, (second) => addPlan(second));
  const head = fetchCase(world, name);
  const envelope = await assertChangeset(world, head);
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(envelope.operation, 'assert-changeset');
  assert.equal(envelope.dryRun, false);
  assert.equal(envelope.data.accepted, true);
  assert.equal(envelope.data.head, head);
  assert.equal(envelope.data.planFile, PLAN_FILE);
  assert.equal(envelope.data.mergeBase, world.git('rev-parse', 'refs/remotes/origin/main'));
  assert.equal(envelope.data.blobOid, world.git('rev-parse', `${head}:${PLAN_FILE}`));
  assertNothingWritten(world);
});

const BIG_PLAN = 'a'.repeat(512 * 1024 + 1);
const CHANGESET_REFUSALS = [
  {
    label: 'a second file',
    violation: 'multiple-paths',
    build: (second) => {
      addPlan(second);
      write(second, 'docs/plan/2026-10-17-issue-12-second.md', PLAN_TEXT);
    },
  },
  {
    label: 'a second file outside planDir',
    violation: 'multiple-paths',
    build: (second) => {
      addPlan(second);
      write(second, 'README2.md', 'x\n');
    },
  },
  {
    label: 'a path outside planDir',
    violation: 'outside-plan-dir',
    build: (second) => addPlan(second, PLAN_TEXT, 'docs/other/2026-10-17-issue-12-demo.md'),
  },
  {
    label: 'a nested path',
    violation: 'nested-path',
    build: (second) => addPlan(second, PLAN_TEXT, 'docs/plan/sub/2026-10-17-issue-12-demo.md'),
  },
  {
    label: 'a deletion',
    violation: 'deletion',
    build: (second) => rmSync(join(second, 'docs/plan/2026-09-01-issue-9-existing.md')),
  },
  {
    label: 'a modification',
    violation: 'modification',
    build: (second) =>
      write(second, 'docs/plan/2026-09-01-issue-9-existing.md', '# Changed\n\n**Issue:** #9\n'),
  },
  {
    label: 'a rename',
    violation: 'deletion',
    build: (second) => {
      rmSync(join(second, 'docs/plan/2026-09-01-issue-9-existing.md'));
      addPlan(second, '# Existing\n\n**Issue:** #9\n');
    },
  },
  {
    label: 'mode 100755',
    violation: 'mode',
    build: (second) => {
      addPlan(second);
      chmodSync(join(second, PLAN_FILE), 0o755);
    },
  },
  {
    label: 'a symlink',
    violation: 'mode',
    build: (second) => symlinkSync('../../README.md', join(second, PLAN_FILE)),
  },
  {
    label: 'a file replaced by a symlink',
    violation: 'type-change',
    build: (second) => {
      rmSync(join(second, 'docs/plan/2026-09-01-issue-9-existing.md'));
      symlinkSync('../../README.md', join(second, 'docs/plan/2026-09-01-issue-9-existing.md'));
    },
  },
  {
    label: 'an oversized blob',
    violation: 'oversized',
    build: (second) => addPlan(second, BIG_PLAN),
  },
  {
    label: 'a blob with NUL',
    violation: 'nul',
    build: (second) => writeFileSync(join(second, PLAN_FILE), Buffer.from('# Plan\0\n')),
  },
  {
    label: 'a blob with invalid UTF-8',
    violation: 'invalid-utf8',
    build: (second) =>
      writeFileSync(join(second, PLAN_FILE), Buffer.from([0x23, 0xc3, 0x28, 0x0a])),
  },
  {
    label: 'a header that names another issue',
    violation: 'issue-mismatch',
    build: (second) => addPlan(second, PLAN_TEXT.replace(`#${ISSUE}`, '#13')),
  },
  {
    label: 'a malformed header',
    violation: 'issue-header-invalid',
    build: (second) => addPlan(second, PLAN_TEXT.replace(`#${ISSUE}`, 'twelve')),
  },
  {
    label: 'a file name for another issue',
    violation: 'issue-mismatch',
    build: (second) => addPlan(second, PLAN_TEXT, 'docs/plan/2026-10-17-issue-13-demo.md'),
  },
  ...[
    'docs/plan/notes.md',
    'docs/plan/2026-10-17-demo.md',
    'docs/plan/2026-10-17-issue-12-Demo.md',
    'docs/plan/2026-10-17-issue-12-.md',
    'docs/plan/2026-10-17-issue-012-demo.md',
    'docs/plan/10-17-issue-12-demo.md',
    'docs/plan/2026-10-17-issue-12-demo.txt',
  ].map((file) => ({
    label: `the name ${file}`,
    violation: 'name-mismatch',
    build: (second) => addPlan(second, PLAN_TEXT, file),
  })),
];

for (const refusal of CHANGESET_REFUSALS) {
  test(`assert-changeset refuses ${refusal.label} with the violation ${refusal.violation}`, async (t) => {
    const world = createWorld(t);
    const { name } = buildBranch(world, (second) => refusal.build(second, world));
    const head = fetchCase(world, name);
    const envelope = await assertChangeset(world, head);
    assert.equal(envelope.ok, false, JSON.stringify(envelope.data));
    assert.equal(envelope.error.code, 'CHANGESET_INVALID');
    assert.ok(
      envelope.error.details.violations.some((entry) => entry.violation === refusal.violation),
      `${refusal.violation} in ${JSON.stringify(envelope.error.details.violations)}`,
    );
  });
}

test('assert-changeset refuses two commits, an empty commit and an unrelated history', async (t) => {
  const world = createWorld(t);
  const two = buildBranch(world, (second) => {
    addPlan(second);
    world.gitIn(second, 'add', '-A');
    world.gitIn(second, 'commit', '-m', 'docs: first');
    write(second, 'docs/plan/2026-10-17-issue-12-more.md', PLAN_TEXT);
  });
  const twoHead = fetchCase(world, two.name);
  const twoCommits = await assertChangeset(world, twoHead);
  assert.ok(
    twoCommits.error.details.violations.some((entry) => entry.violation === 'not-single-commit'),
  );

  const empty = buildBranch(world, (second) =>
    world.gitIn(second, 'commit', '--allow-empty', '-m', 'docs: nothing'),
  );
  const emptyResult = await assertChangeset(world, fetchCase(world, empty.name));
  assert.ok(emptyResult.error.details.violations.some((entry) => entry.violation === 'empty'));

  const orphan = buildBranch(
    world,
    (second) => {
      world.gitIn(second, 'checkout', '--quiet', '--orphan', 'orphan-scratch');
      world.gitIn(second, 'rm', '-rf', '--quiet', '.');
      addPlan(second);
    },
    { branch: 'orphan-history' },
  );
  const orphanResult = await assertChangeset(world, fetchCase(world, orphan.name));
  assert.deepEqual(orphanResult.error.details.violations, [{ violation: 'no-merge-base' }]);
});

test('assert-changeset checks its inputs before it reads any object', async (t) => {
  const world = createWorld(t);
  const head = world.git('rev-parse', 'HEAD');
  const cases = [
    [{ head: 'main' }, 'INVALID_INPUT'],
    [{ head: head.toUpperCase() }, 'INVALID_INPUT'],
    [{ issue: 0 }, 'INVALID_INPUT'],
    [{ planDir: '../x' }, 'UNSAFE_PATH'],
    [{ remote: 'https://x.test/r.git' }, 'INVALID_INPUT'],
    [{ baseBranch: 'a..b' }, 'INVALID_INPUT'],
    [{ cwd: join(world.local, 'docs') }, 'INVALID_INPUT'],
    [{ cwd: world.container }, 'NOT_GIT_REPOSITORY'],
    [{ baseBranch: 'missing' }, 'BASE_UNRESOLVED'],
  ];
  for (const [overrides, code] of cases) {
    const envelope = await assertChangeset(world, head, overrides);
    assert.equal(envelope.ok, false, JSON.stringify(overrides));
    assert.equal(
      envelope.error.code,
      code,
      `${JSON.stringify(overrides)}: ${envelope.error.message}`,
    );
  }
  const extra = await executeOperation(
    'assert-changeset',
    {
      cwd: world.local,
      remote: 'origin',
      baseBranch: 'main',
      head,
      planDir: PLAN_DIR,
      issue: ISSUE,
      force: true,
    },
    { runner: world.runner },
  );
  assert.equal(extra.error.code, 'INVALID_INPUT');
});

// ---------------------------------------------------------------------------------------------
// complete-branch

function createOrphanBranch(world, build = (second) => addPlan(second), options = {}) {
  return buildBranch(world, build, { branch: BRANCH, ...options });
}

test('complete-branch opens a draft pull request for a single-file orphan branch whose base has moved', async (t) => {
  const world = createWorld(t);
  const oldBase = world.git('rev-parse', 'refs/remotes/origin/main');
  const orphan = createOrphanBranch(world);
  // The orphan's committer differs from the configured identity, and the base moved on.
  assert.equal(world.gitIn(world.remote, 'log', '-1', '--format=%cn', BRANCH), 'Second Clone');
  const movedBase = advanceBase(world);
  const before = { remote: remoteRef(world, BRANCH), index: captureLocal(world).index };

  const envelope = await completeBranch(world);

  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(envelope.operation, 'complete-branch');
  assert.equal(envelope.dryRun, false);
  const data = envelope.data;
  assert.equal(data.state, 'pull-request-opened');
  assert.equal(data.branch, BRANCH);
  assert.equal(data.commitOid, orphan.tip);
  assert.equal(data.baseOid, movedBase);
  assert.equal(data.mergeBase, oldBase);
  assert.equal(data.planFile, PLAN_FILE);
  assert.equal(remoteRef(world, BRANCH), before.remote, 'the branch is not rewritten');
  assert.equal(gitCalls(world, 'push').length, 0, 'complete-branch never pushes');
  assert.deepEqual(captureLocal(world).index, before.index);

  assert.equal(world.forge.creates.length, 1);
  const { payload } = world.forge.creates[0];
  assert.equal(payload.draft, true);
  assert.equal(payload.head, BRANCH);
  assert.equal(payload.base, 'main');
  assert.equal(payload.title, 'docs: plan demo');
  const lines = payload.body.split('\n');
  assert.equal(lines.at(-2), buildPlanPrMarkerLine(PLAN_FILE));
  assert.equal(lines.at(-1), `Refs #${ISSUE}`);
  assert.equal(inspectPlanPrMarker(payload.body).plan, PLAN_FILE);
  assertArgvAudit(world);
  assertNetworkBounded(world);
});

test('complete-branch needs no configured identity and no local plan file', async (t) => {
  const world = createWorld(t, { identity: 'none' });
  createOrphanBranch(world);
  rmSync(world.planAbsolute);
  const envelope = await completeBranch(world);
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
});

test('complete-branch is a dry run without apply', async (t) => {
  const world = createWorld(t);
  createOrphanBranch(world);
  const refsBefore = refs(world).filter((line) => !line.startsWith('refs/remotes/origin/'));
  const envelope = await completeBranch(world, {}, { apply: false });
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(envelope.dryRun, true);
  assert.equal(envelope.data.state, 'dry-run');
  assert.equal(envelope.data.branch, BRANCH);
  assert.equal(envelope.data.planFile, PLAN_FILE);
  assert.deepEqual(envelope.data.findings, []);
  assert.equal(world.forge.creates.length, 0);
  assert.equal(gitCalls(world, 'push').length, 0);
  assert.deepEqual(
    refs(world).filter((line) => !line.startsWith('refs/remotes/origin/')),
    refsBefore,
  );
});

test('complete-branch refuses a branch with a second file or a second commit', async (t) => {
  const secondFile = createWorld(t);
  createOrphanBranch(secondFile, (second) => {
    addPlan(second);
    write(second, 'docs/plan/2026-10-17-issue-12-extra.md', PLAN_TEXT);
  });
  const fileResult = await completeBranch(secondFile);
  assert.equal(fileResult.error.code, 'CHANGESET_INVALID');
  assert.ok(
    fileResult.error.details.violations.some((entry) => entry.violation === 'multiple-paths'),
  );
  assert.equal(secondFile.forge.creates.length, 0);

  const secondCommit = createWorld(t);
  createOrphanBranch(secondCommit, (second) => {
    addPlan(second);
    secondCommit.gitIn(second, 'add', '-A');
    secondCommit.gitIn(second, 'commit', '-m', 'docs: plan demo');
    write(second, 'docs/plan/2026-10-17-issue-12-late.md', PLAN_TEXT);
  });
  const commitResult = await completeBranch(secondCommit);
  assert.equal(commitResult.error.code, 'CHANGESET_INVALID');
  assert.ok(
    commitResult.error.details.violations.some((entry) => entry.violation === 'not-single-commit'),
  );
  assert.equal(secondCommit.forge.creates.length, 0);

  const onlyCommit = createWorld(t);
  createOrphanBranch(onlyCommit, (second) => {
    addPlan(second);
    onlyCommit.gitIn(second, 'add', '-A');
    onlyCommit.gitIn(second, 'commit', '-m', 'docs: plan demo');
    onlyCommit.gitIn(second, 'commit', '--allow-empty', '-m', 'docs: empty follow-up');
  });
  const emptyFollowUp = await completeBranch(onlyCommit);
  assert.equal(emptyFollowUp.error.code, 'CHANGESET_INVALID');
  assert.ok(
    emptyFollowUp.error.details.violations.some((entry) => entry.violation === 'not-single-commit'),
  );
});

test('complete-branch refuses a branch blob with invalid UTF-8 or NUL before any mutation', async (t) => {
  for (const [label, bytes, violation] of [
    ['invalid UTF-8', Buffer.from([0x23, 0x20, 0xc3, 0x28, 0xff, 0x0a]), 'invalid-utf8'],
    ['NUL', Buffer.from('# Plan\0 hidden\n'), 'nul'],
  ]) {
    const world = createWorld(t);
    createOrphanBranch(world, (second) => writeFileSync(join(second, PLAN_FILE), bytes));
    const envelope = await completeBranch(world);
    assert.equal(envelope.ok, false, label);
    assert.equal(envelope.error.code, 'CHANGESET_INVALID', label);
    assert.ok(
      envelope.error.details.violations.some((entry) => entry.violation === violation),
      label,
    );
    assert.equal(world.forge.creates.length, 0, label);
    assert.equal(gitCalls(world, 'push').length, 0, label);
  }
});

test('complete-branch scans the branch blob, the existing commit message, the title and the body', async (t) => {
  const token = tokenValue(7);
  const blob = createWorld(t);
  createOrphanBranch(blob, (second) =>
    addPlan(second, `${PLAN_TEXT}\nThe value ${token} leaked.\n`),
  );
  const blobResult = await completeBranch(blob);
  assert.equal(blobResult.error.code, 'SCAN_BLOCKED');
  assert.equal(blobResult.error.details.stage, 'complete-branch');
  assert.deepEqual(blobResult.error.details.blocking, ['provider-token:plan:10']);
  assert.ok(!JSON.stringify(blobResult).includes(token));
  assert.equal(blob.forge.creates.length, 0);

  const message = createWorld(t);
  createOrphanBranch(message, (second) => addPlan(second), {
    message: `docs: plan demo\n\n${token}`,
  });
  const messageResult = await completeBranch(message);
  assert.equal(messageResult.error.code, 'SCAN_BLOCKED');
  assert.ok(
    messageResult.error.details.blocking.some((id) =>
      id.startsWith('provider-token:commitMessage:'),
    ),
  );

  const closing = createWorld(t);
  createOrphanBranch(closing, (second) => addPlan(second), {
    message: 'docs: plan demo\n\nFixes #12',
  });
  const closingResult = await completeBranch(closing);
  assert.equal(closingResult.error.code, 'CLOSING_KEYWORD');
  assert.equal(closing.forge.creates.length, 0);

  const body = createWorld(t);
  createOrphanBranch(body);
  const titleResult = await completeBranch(body, { title: `docs: plan ${token}` });
  assert.equal(titleResult.error.code, 'SCAN_BLOCKED');
  const bodyResult = await completeBranch(body, { body: `Prose ${token}` });
  assert.equal(bodyResult.error.code, 'SCAN_BLOCKED');
  assert.equal(body.forge.creates.length, 0);
});

test('complete-branch refuses a missing branch, an existing pull request and a mismatching issue', async (t) => {
  const missing = createWorld(t);
  const missingResult = await completeBranch(missing);
  assert.equal(missingResult.error.code, 'BRANCH_MISSING');

  const existing = createWorld(t);
  createOrphanBranch(existing);
  existing.forge.seedPull({ head: BRANCH, base: 'main' });
  const existingResult = await completeBranch(existing);
  assert.equal(existingResult.error.code, 'PR_EXISTS');
  assert.equal(existing.forge.creates.length, 0);

  const fork = createWorld(t);
  createOrphanBranch(fork);
  fork.forge.seedPull({ head: BRANCH, base: 'main', fork: true });
  const forkResult = await completeBranch(fork);
  assert.equal(forkResult.ok, true, 'a fork pull request on the same branch name is ignored');
  assert.equal(forkResult.data.ignoredPullRequests.length, 1);

  const mismatch = createWorld(t);
  createOrphanBranch(mismatch, (second) =>
    addPlan(second, PLAN_TEXT, 'docs/plan/2026-10-17-issue-13-demo.md'),
  );
  const mismatchResult = await completeBranch(mismatch);
  assert.equal(mismatchResult.error.code, 'CHANGESET_INVALID');
  assert.ok(
    mismatchResult.error.details.violations.some((entry) => entry.violation === 'issue-mismatch'),
  );
});

test('complete-branch shares the draft read-back and the pr-create failure lookup', async (t) => {
  const readBack = createWorld(t);
  createOrphanBranch(readBack);
  readBack.forge.store = { draft: false };
  const unconfirmed = await completeBranch(readBack);
  assert.equal(unconfirmed.error.code, 'DRAFT_UNCONFIRMED');
  assert.equal(unconfirmed.error.details.pullRequest.number, 100);

  const failed = createWorld(t);
  createOrphanBranch(failed);
  failed.forge.createMode = 'fail-after';
  const adopted = await completeBranch(failed);
  assert.equal(adopted.ok, true, JSON.stringify(adopted.error));
  assert.equal(failed.forge.creates.length, 1);

  const refused = createWorld(t);
  createOrphanBranch(refused);
  refused.forge.createMode = 'draft-unsupported';
  const unsupported = await completeBranch(refused);
  assert.equal(unsupported.error.code, 'UNSUPPORTED_CAPABILITY');
  assert.equal(unsupported.error.details.state, 'branch-pushed');
});

test('complete-branch bounds its network calls and reports a hang as REMOTE_UNREACHABLE', async (t) => {
  const world = createWorld(t);
  createOrphanBranch(world);
  const ok = await completeBranch(world, {}, { timeoutMs: 30_000 });
  assert.equal(ok.ok, true, JSON.stringify(ok.error));
  assertNetworkBounded(world, 30_000);

  const hung = createWorld(t);
  createOrphanBranch(hung);
  hung.intercept = async (call) => (isGit(call, 'ls-remote') ? TIMEOUT_RESULT : undefined);
  const envelope = await completeBranch(hung);
  assert.equal(envelope.error.code, 'REMOTE_UNREACHABLE');
  assert.equal(hung.forge.creates.length, 0);
});

// ---------------------------------------------------------------------------------------------
// Review incorporation: push URLs, post-push state, rewritten base, file-system errors, forge
// bounds, FETCH_HEAD and commit size

test('REMOTE_URL_MISMATCH: several push URLs or one that differs from the fetch URL, before any write', async (t) => {
  for (const pushUrls of [[ACME_URL, OTHER_URL], [OTHER_URL], []]) {
    const world = createWorld(t);
    world.pushUrls = { origin: pushUrls };
    const envelope = await publish(world);
    assert.equal(envelope.ok, false, JSON.stringify(pushUrls));
    assert.equal(envelope.error.code, 'REMOTE_URL_MISMATCH');
    assert.equal(envelope.error.details.pushUrlCount, pushUrls.length);
    assertNothingWritten(world);
    assert.equal(world.forge.lists.length, 0, 'no forge call');
    assert.equal(
      world.calls.filter((call) => call.executable === 'gh').length,
      0,
      'the mismatch is found before the tracker',
    );
    const completed = await completeBranch(world);
    assert.equal(completed.error.code, 'REMOTE_URL_MISMATCH');
  }
});

test('REMOTE_URL_MISMATCH: a configured remote.<name>.pushurl or pushInsteadOf is read from Git itself', async (t) => {
  const pushurl = createWorld(t);
  pushurl.realRemoteUrls = true;
  pushurl.git('config', 'remote.origin.pushurl', join(pushurl.container, 'elsewhere.git'));
  const viaPushurl = await publish(pushurl);
  assert.equal(viaPushurl.error.code, 'REMOTE_URL_MISMATCH');
  assert.equal(viaPushurl.error.details.pushUrlCount, 1);
  assertNothingWritten(pushurl);

  const two = createWorld(t);
  two.realRemoteUrls = true;
  two.git('config', '--add', 'remote.origin.pushurl', two.remote);
  two.git('config', '--add', 'remote.origin.pushurl', join(two.container, 'mirror.git'));
  const viaTwo = await publish(two);
  assert.equal(viaTwo.error.code, 'REMOTE_URL_MISMATCH');
  assert.equal(viaTwo.error.details.pushUrlCount, 2);

  const rewritten = createWorld(t);
  rewritten.realRemoteUrls = true;
  rewritten.git(
    'config',
    `url.${join(rewritten.container, 'pushed')}.pushInsteadOf`,
    rewritten.remote,
  );
  const viaInsteadOf = await publish(rewritten);
  assert.equal(viaInsteadOf.error.code, 'REMOTE_URL_MISMATCH');
  assertNothingWritten(rewritten);
  assert.deepEqual(
    gitCalls(rewritten, 'remote').map((call) => call.args.join(' ')),
    ['remote get-url origin', 'remote get-url --push --all origin'],
  );
});

test('a failing confirmation after a successful push keeps the run state: unknown, with branch and commit', async (t) => {
  const world = createWorld(t);
  let lockQueries = 0;
  world.intercept = async (call) => {
    if (isGit(call, 'ls-remote')) {
      lockQueries += 1;
      if (lockQueries === 2) return TIMEOUT_RESULT;
    }
    return undefined;
  };
  const envelope = await publish(world);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'REMOTE_UNREACHABLE');
  assert.equal(envelope.error.details.reason, 'timeout');
  assert.equal(envelope.error.details.state, 'unknown');
  assert.equal(envelope.error.details.branch, BRANCH);
  assert.equal(remoteRef(world, BRANCH), envelope.error.details.commitOid, 'the push landed');
  assert.equal(world.forge.creates.length, 0);
});

test('BASE_REWRITTEN: a force-rewritten remote base is named, not reported as unreachable', async (t) => {
  const world = createWorld(t);
  world.gitIn(world.seed, 'commit', '--amend', '--quiet', '-m', 'seed, rewritten');
  world.gitIn(world.seed, 'push', '--quiet', '--force', 'origin', 'main');
  const envelope = await publish(world);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'BASE_REWRITTEN', envelope.error.message);
  // The refusal is read from stderr, so the base fetch runs in the C locale, whatever the user's.
  assert.equal(gitCalls(world, 'fetch')[0].env.LC_ALL, 'C');
  assertNothingWritten(world, { allowFetch: true });
  createOrphanBranch(world);
  const completed = await completeBranch(world);
  assert.equal(completed.error.code, 'BASE_REWRITTEN');
});

test('a planDir that cannot be resolved is NOT_FOUND without an absolute path, before any write', async (t) => {
  const world = createWorld(t);
  const planDirectory = join(world.local, PLAN_DIR);
  let resolutions = 0;
  const fs = {
    ...nodeFs,
    realpathSync(target) {
      if (target === planDirectory && (resolutions += 1) === 2) {
        throw Object.assign(new Error(`ENOENT: no such file, '${target}'`), { code: 'ENOENT' });
      }
      return nodeFs.realpathSync(target);
    },
  };
  const envelope = await publish(world, {}, { fs });
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'NOT_FOUND');
  assert.equal(envelope.error.details.field, 'planDir');
  assert.ok(!JSON.stringify(envelope.error).includes(world.container));
  assertNothingWritten(world);
});

test('every tracker call carries the run bound and its own process group', async (t) => {
  const world = createWorld(t);
  const envelope = await publish(world, {}, { timeoutMs: 45_000 });
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  const forgeCalls = world.calls.filter((call) => call.executable === 'gh');
  assert.ok(forgeCalls.length > 0);
  for (const call of forgeCalls) {
    assert.equal(call.timeoutMs, 45_000, `gh ${call.args.join(' ')}`);
    assert.equal(call.processGroup, true, `gh ${call.args.join(' ')}`);
  }
});

test('a hanging gh is cut off by the run bound, writes nothing and leaves no process behind', async (t) => {
  const world = createWorld(t);
  const pidFile = join(world.container, 'gh.pid');
  const hang = join(world.container, 'hanging-gh.sh');
  writeFileSync(hang, `#!/bin/sh\necho $$ > "${pidFile}"\nexec sleep ${HOOK_SLEEP_SECONDS}\n`);
  chmodSync(hang, 0o755);
  const real = createProcessRunner();
  world.intercept = async (call) =>
    call.executable === 'gh' ? real({ ...call, executable: hang, args: [] }) : undefined;
  const started = Date.now();
  const envelope = await publish(world, {}, { timeoutMs: SMALL_TIMEOUT_MS });
  assert.equal(envelope.ok, false);
  assert.ok(Date.now() - started < HOOK_BOUND_MS, 'the bound ended the forge call');
  const [first] = world.calls.filter((call) => call.executable === 'gh');
  assert.equal(first.timeoutMs, SMALL_TIMEOUT_MS);
  assert.equal(first.processGroup, true);
  assertNothingWritten(world);
  await assertHookProcessGone(t, pidFile);
});

test('a pr-create cut off by the bound may have reached the forge: PR_UNCONFIRMED, one create', async (t) => {
  const world = createWorld(t);
  world.forge.store = { hidden: true };
  world.intercept = async (call, next) => {
    if (call.executable === 'gh' && call.args.includes('-X')) {
      await next();
      return { status: null, signal: 'SIGTERM', timedOut: true, stdout: '', stderr: '' };
    }
    return undefined;
  };
  const envelope = await publish(world);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'PR_UNCONFIRMED');
  assert.equal(envelope.error.details.state, 'branch-pushed');
  assert.equal(world.forge.creates.length, 1, 'never a second create');
});

test('complete-branch never reads the shared FETCH_HEAD and works on the OID of the lock query', async (t) => {
  const world = createWorld(t);
  const orphan = createOrphanBranch(world);
  const baseOid = world.git('rev-parse', 'refs/remotes/origin/main');
  world.intercept = async (call, next) => {
    if (isGit(call, 'fetch') && call.args.includes('--refmap=')) {
      const result = await next();
      // Another fetch in the same repository overwrites FETCH_HEAD in between.
      writeFileSync(join(world.local, '.git', 'FETCH_HEAD'), `${baseOid}\t\tbranch 'main'\n`);
      return result;
    }
    return undefined;
  };
  const envelope = await completeBranch(world);
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(envelope.data.commitOid, orphan.tip);
  assert.ok(
    !gitCalls(world).some((call) => call.args.some((arg) => arg.includes('FETCH_HEAD'))),
    'no Git call names FETCH_HEAD',
  );

  // A fetch that did not bring the commit the lock query named is LOCK_LOST.
  const missing = createWorld(t);
  createOrphanBranch(missing);
  missing.intercept = async (call) =>
    isGit(call, 'fetch') && call.args.includes('--refmap=')
      ? { status: 0, stdout: '', stderr: '' }
      : undefined;
  const lost = await completeBranch(missing);
  assert.equal(lost.error.code, 'LOCK_LOST');
  assert.equal(missing.forge.creates.length, 0);
});

// The fetch check (`cat-file -e <tip>`) cannot see a branch that only moved forward: the old tip
// is still present as an ancestor. The lock query right before pr-create compares the exact tip.
test('complete-branch: a branch that moved between the lock query and the fetch gives LOCK_LOST and no pr-create', async (t) => {
  const world = createWorld(t);
  const orphan = createOrphanBranch(world);
  let moved = null;
  world.intercept = async (call, next) => {
    if (moved === null && isGit(call, 'ls-remote')) {
      const result = await next();
      moved = advanceRemoteBranch(world);
      return result;
    }
    return undefined;
  };

  const envelope = await completeBranch(world);

  assert.equal(moved.tip, orphan.tip);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'LOCK_LOST');
  assert.equal(envelope.error.details.state, 'unknown');
  assert.equal(envelope.error.details.commitOid, orphan.tip);
  assert.equal(envelope.error.details.remoteOid, moved.followUp);
  assert.equal(world.forge.creates.length, 0, 'zero pr-create');
  assert.equal(remoteRef(world, BRANCH), moved.followUp, 'the branch is not touched');
});

test('complete-branch: a branch advanced after verification and before pr-create gives LOCK_LOST and no pr-create', async (t) => {
  const world = createWorld(t);
  const orphan = createOrphanBranch(world);
  let moved = null;
  world.intercept = async (call, next) => {
    // The pull-request lookup is the last call before the lock is read again.
    if (moved === null && call.executable === 'gh' && call.args.includes('--paginate')) {
      const result = await next();
      moved = advanceRemoteBranch(world);
      return result;
    }
    return undefined;
  };

  const envelope = await completeBranch(world);

  assert.ok(moved !== null);
  assert.equal(envelope.error.code, 'LOCK_LOST');
  assert.equal(envelope.error.details.commitOid, orphan.tip);
  assert.equal(envelope.error.details.remoteOid, moved.followUp);
  assert.equal(envelope.error.details.state, 'unknown');
  assert.equal(world.forge.creates.length, 0, 'zero pr-create');

  // An unreadable remote at that point is no permission to create the pull request either.
  const unreachable = createWorld(t);
  createOrphanBranch(unreachable);
  let lookups = 0;
  unreachable.intercept = async (call) => {
    if (call.executable === 'gh' && call.args.includes('--paginate')) lookups += 1;
    return lookups > 0 && isGit(call, 'ls-remote') ? TIMEOUT_RESULT : undefined;
  };
  const unknown = await completeBranch(unreachable);
  assert.equal(unknown.error.code, 'REMOTE_UNREACHABLE');
  assert.equal(unknown.error.details.state, 'unknown');
  assert.equal(unreachable.forge.creates.length, 0, 'zero pr-create');
});

test('complete-branch refuses a branch commit message over the size limit as INPUT_TOO_LARGE', async (t) => {
  for (const length of [70_000, 90_000]) {
    const world = createWorld(t);
    createOrphanBranch(world, (second) => addPlan(second), {
      message: `docs: plan demo\n\n${'x'.repeat(length)}`,
    });
    const envelope = await completeBranch(world);
    assert.equal(envelope.ok, false, String(length));
    assert.equal(envelope.error.code, 'INPUT_TOO_LARGE', String(length));
    assert.equal(envelope.error.details.field, 'commitMessage');
    assert.equal(world.forge.creates.length, 0);
  }
});
