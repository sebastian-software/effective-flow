// Fixtures shared by the tests of the runtime-state helper's worktree-lifecycle and cleanup
// operations: a real main checkout with an ignored `.effective-flow/`, linked worktrees at the
// paths the purpose table requires, version 1 records, and envelope helpers.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import {
  contentDigest,
  executeOperation as executeBuildRun,
} from '../../src/scripts/build-run-core.mjs';
import { executeOperation } from '../../src/scripts/effective-flow-state-core.mjs';
import { createProcessRunner } from '../../src/scripts/process-runner.mjs';

// A hermetic Git environment: no system config, no optional locks, fixed author and committer.
export const GIT_ENV = Object.freeze({
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
});

export const SESSION = 'build-0123456789abcdef';

// Runs Git in `cwd` and returns trimmed stdout; a nonzero exit fails the test with Git's stderr.
export function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { env: GIT_ENV });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${String(result.stderr)}`);
  return String(result.stdout).trim();
}

// A main checkout with `.effective-flow/` ignored and one commit on `main`.
export function repository(t, prefix = 'effective-flow-worktree-') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q', '--initial-branch=main');
  git(root, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(root, '.gitignore'), '.effective-flow/\n');
  writeFileSync(join(root, 'base.txt'), 'base\n');
  git(root, 'add', '.gitignore', 'base.txt');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}

// The canonical common Git directory: the repository identity the helper derives itself.
export function commonDir(root) {
  return realpathSync(join(root, '.git'));
}

// The default worktree base below the runtime-state root: `.effective-flow/.worktrees/<repo>`.
export function baseDir(root) {
  return join(root, '.effective-flow', '.worktrees', basename(root));
}

// The worktree path the purpose table requires for `session` (and `component` for apply-review).
export function requiredPath(root, { purpose = 'delivery', session = SESSION, component } = {}) {
  if (purpose === 'apply-review') return join(baseDir(root), session, component ?? 'component-1');
  if (purpose === 'plan-publication') return join(baseDir(root), `${session}-plan-publication`);
  if (purpose === 'merge-gate') return join(baseDir(root), `${session}-merge-gate`);
  return join(baseDir(root), session);
}

// The branch name the purpose table pairs with `requiredPath`.
export function branchFor({ purpose = 'delivery', session = SESSION, component } = {}) {
  if (purpose === 'apply-review') return `apply-review/${session}/${component ?? 'component-1'}`;
  return `effective-flow/${purpose}/${session}`;
}

// Adds a linked worktree on a new branch at `base` (default HEAD of main) and returns its facts.
export function addWorktree(root, options = {}) {
  const worktreePath = options.path ?? requiredPath(root, options);
  const branch = options.branch ?? branchFor(options);
  git(root, 'worktree', 'add', '-q', '-b', branch, worktreePath, options.base ?? 'HEAD');
  const canonical = realpathSync(worktreePath);
  return { worktreePath: canonical, branch, head: git(canonical, 'rev-parse', 'HEAD') };
}

// A complete version 1 record for a worktree from `addWorktree`.
export function makeRecord(root, worktree, options = {}) {
  const purpose = options.purpose ?? 'delivery';
  const workflow = options.workflow ?? (purpose === 'apply-review' ? 'apply-review' : 'build');
  const common = commonDir(root);
  const record = {
    schemaVersion: 1,
    recordId: options.recordId ?? 'record-1',
    sessionId: options.session ?? SESSION,
    componentId: purpose === 'apply-review' ? (options.component ?? 'component-1') : null,
    workflow,
    purpose,
    repositoryIdentity: common,
    runtimeStateRoot: root,
    worktreePath: worktree.worktreePath,
    branch: worktree.branch,
    creationOid: worktree.head,
    ownership: 'effective-flow-created',
    receipt: {
      repositoryIdentity: common,
      executionRoot: worktree.worktreePath,
      runtimeStateRoot: root,
      checkout: { kind: 'branch', branch: worktree.branch },
      origin: 'effective-flow-created',
      setupOwner: 'Effective Flow build',
      setupStatus: 'pending',
      workflow,
      purpose,
    },
    branchPolicy: purpose === 'apply-review' ? 'delete-after-integration' : 'retain',
    createdAt: '2026-11-03T10:00:00Z',
    updatedAt: '2026-11-03T10:00:00Z',
    status: 'active',
    reason: null,
  };
  return { ...record, ...options.overrides };
}

// A schema-invalid record of the shapes runs improvised before the helper owned the lifecycle: a
// legacy purpose (`pr-conflict-resolution`, `base-into-head-merge`) the schema never allowed, with
// Python `isoformat` timestamps (which the schema accepts) and a free-text `reason`.
export function legacyRecord(root, worktree, options = {}) {
  const purpose = options.purpose ?? 'pr-conflict-resolution';
  const record = makeRecord(root, worktree, {
    recordId: options.recordId ?? 'legacy-1',
    purpose: 'merge-gate',
    workflow: 'merge-gate',
  });
  return {
    ...record,
    purpose,
    receipt: { ...record.receipt, purpose },
    createdAt: '2026-10-21T08:15:30.123456+00:00',
    updatedAt: '2026-10-21T09:02:11.654321+00:00',
    status: options.status ?? 'failed',
    reason: 'merge conflict needs a human decision',
    ...options.overrides,
  };
}

// Writes a record file as a prose-era run did, bypassing the helper: `value` as JSON, or a string
// verbatim.
export function writeRecordFile(root, recordId, value) {
  mkdirSync(join(root, '.effective-flow', 'worktree-runs'), { recursive: true });
  writeFileSync(
    recordFile(root, recordId),
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`,
  );
}

// Real Git through the shared process runner; `extra` injects test seams (`deadlineMs`, `onPhase`).
export function deps(extra = {}) {
  return { runner: createProcessRunner(), env: GIT_ENV, ...extra };
}

// Runs one helper operation through the same envelope the CLI prints.
export function call(operation, input, extra) {
  return executeOperation(operation, input, deps(extra));
}

// Asserts a successful envelope and returns its `result`.
export function expectOk(envelope) {
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  return envelope.result;
}

// Asserts a typed refusal (`outcome.code`) and returns the outcome.
export function expectOutcome(envelope, code) {
  assert.equal(envelope.ok, false, JSON.stringify(envelope));
  assert.equal(envelope.outcome?.code, code, JSON.stringify(envelope));
  return envelope.outcome;
}

// Asserts a guard or input error (`error.code`) and returns the error.
export function expectError(envelope, code) {
  assert.equal(envelope.ok, false, JSON.stringify(envelope));
  assert.equal(envelope.error?.code, code, JSON.stringify(envelope));
  return envelope.error;
}

export function recordFile(root, recordId = 'record-1') {
  return join(root, '.effective-flow', 'worktree-runs', `${recordId}.json`);
}

export function lockFile(root, recordId = 'record-1') {
  return join(root, '.effective-flow', 'worktree-runs', `${recordId}.lock`);
}

export function readRecord(root, recordId = 'record-1') {
  return JSON.parse(readFileSync(recordFile(root, recordId), 'utf8'));
}

// Creates a worktree and its record through `worktree record-init`; returns both.
export async function initialized(root, options = {}) {
  const worktree = addWorktree(root, options);
  const record = makeRecord(root, worktree, options);
  expectOk(await call('worktree record-init', { cwd: root, executionRoot: root, record }));
  return { worktree, record };
}

// Commits `files` (path → content) on `branch`, created from `base` when it does not exist yet,
// through the main checkout, which is back on `main` afterwards. Returns the new tip.
export function commitOnBranch(root, branch, files, { base = 'main', message = 'change' } = {}) {
  const exists = git(root, 'branch', '--list', branch) !== '';
  git(root, 'checkout', '-q', ...(exists ? [branch] : ['-b', branch, base]));
  for (const [file, content] of Object.entries(files)) writeFileSync(join(root, file), content);
  git(root, 'add', '--', ...Object.keys(files));
  git(root, 'commit', '-q', '-m', message);
  const tip = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', 'main');
  return tip;
}

// Squash-merges `branch` into `main` as a single commit and returns that commit.
export function squashIntoMain(root, branch) {
  git(root, 'checkout', '-q', 'main');
  git(root, 'merge', '-q', '--squash', branch);
  git(root, 'commit', '-q', '-m', `squash ${branch}`);
  return git(root, 'rev-parse', 'HEAD');
}

// Points `refs/remotes/origin/main` at `main` (no remote is configured: the branch proofs read the
// remote-tracking ref only, and cleanup never fetches).
export function publishMain(root) {
  git(root, 'update-ref', 'refs/remotes/origin/main', git(root, 'rev-parse', 'main'));
  return git(root, 'rev-parse', 'refs/remotes/origin/main');
}

// The `items` value `cleanup apply` takes for a planned item: the bare digest, or for a `branch:`
// item `{itemDigest, proof, proofCommit}`.
export function applyValue(item) {
  return item.kind === 'branch'
    ? { itemDigest: item.itemDigest, proof: item.proof, proofCommit: item.proofCommit }
    : item.itemDigest;
}

// Writes a non-terminal build run below `.effective-flow/build-runs/<runId>/` whose request names
// `branch` as `execution.branch` (only the fields the read-only branch reader checks).
export function writeBuildRun(root, runId, { branch, head, terminal = false }) {
  const dir = join(root, '.effective-flow', 'build-runs', runId);
  mkdirSync(dir, { recursive: true });
  const execution = { executionRoot: root, branch, head, origin: 'in-place', owner: 'build' };
  writeFileSync(join(dir, 'request.json'), `${JSON.stringify({ execution })}\n`);
  if (terminal) writeFileSync(join(dir, 'terminal.json'), '{}\n');
}

// A non-terminal build run made by `build-run-core.mjs` itself, not a hand-written shape: `create`
// with the main checkout's `main` as `execution.branch`, then, with `branch`, `authorize-execution`
// and `transition-execution` into an in-place delivery on `branch`, which writes `execution.json`;
// the main checkout is back on `main` afterwards. Returns the run directory.
export async function createBuildRun(root, runId, { branch = null } = {}) {
  const runtime = join(root, '.effective-flow');
  mkdirSync(runtime, { recursive: true });
  writeFileSync(
    join(runtime, 'memory.json'),
    JSON.stringify({ runtimeMigration: { directory: { version: 1 } } }),
  );
  if (git(root, 'ls-files', '--', 'plan.md') === '') {
    writeFileSync(join(root, 'plan.md'), '# Approved Feature plan\n');
    git(root, 'add', 'plan.md');
    git(root, 'commit', '-q', '-m', 'plan');
  }
  const head = git(root, 'rev-parse', 'HEAD');
  const deps = {
    runner: (request) => {
      const result = spawnSync(request.executable, request.args, {
        cwd: request.cwd,
        env: GIT_ENV,
        ...(request.stdoutBuffer ? {} : { encoding: 'utf8' }),
      });
      return {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
      };
    },
  };
  const run = async (operation, payload) =>
    (await executeBuildRun(operation, payload, deps)).result;
  const instruction = 'Implement the approved Feature plan and retain a delivery branch.';
  const created = await run('create', {
    runtimeStateRoot: root,
    repositoryIdentity: commonDir(root),
    runId,
    execution: {
      executionRoot: root,
      branch: 'main',
      head,
      origin: 'current-checkout',
      owner: 'build',
    },
    plan: { root, path: 'plan.md', digest: contentDigest(readFileSync(join(root, 'plan.md'))) },
    source: { instruction, restrictions: [] },
    runMode: 'interactive',
    languages: Object.fromEntries(
      ['source', 'documentation.user', 'documentation.technical', 'workflow', 'forge', 'git'].map(
        (key) => [key, 'en'],
      ),
    ),
    completionCondition: 'All required phases and gates pass.',
    deliveryRestrictions: [],
    sourceAssociation: 'approved-feature-plan',
    allowedRoots: [root],
  });
  const common = {
    runtimeStateRoot: root,
    repositoryIdentity: commonDir(root),
    runId,
    requestDigest: created.requestDigest,
  };
  const agentHandle = 'original-child-handle';
  await run('bind-agent', { ...common, agentHandle });
  if (branch !== null) {
    const authorization = await run('authorize-execution', {
      ...common,
      agentHandle,
      mode: 'in-place-delivery',
      executionRoot: root,
      branch,
      baseHead: head,
      authority: { kind: 'source', source: 'instruction', index: null, quote: instruction },
    });
    git(root, 'switch', '-q', '-c', branch);
    await run('transition-execution', {
      ...common,
      agentHandle,
      authorization,
      execution: { executionRoot: root, branch, head, origin: 'in-place', owner: 'build' },
      ownership: null,
    });
    git(root, 'switch', '-q', 'main');
  }
  return join(runtime, 'build-runs', runId);
}

// Moves a record from `active` to `to` through `worktree transition`.
export async function moveTo(root, record, to, reason = null) {
  expectOk(
    await call('worktree transition', {
      cwd: root,
      executionRoot: root,
      recordId: record.recordId,
      from: 'active',
      to,
      reason,
      sessionId: record.sessionId,
    }),
  );
}
