// Fixtures shared by the tests of the runtime-state helper's worktree-lifecycle and cleanup
// operations: a real main checkout with an ignored `.effective-flow/`, linked worktrees at the
// paths the purpose table requires, version 1 records, and envelope helpers.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

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
