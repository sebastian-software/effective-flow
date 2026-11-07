// Fixtures shared by the git-backed tests of the delivery-progress ledger, the release transition
// and the resume operations: a real main checkout as the delivery source, a `partial-diff`
// worktree with its `active` record that received the bound selection through
// `transferSelection`, and the helper calls and snapshots those tests repeat.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

import {
  bindSelectionManifest,
  transferSelection,
} from '../../src/scripts/delivery-selection-core.mjs';
import { ledgerPaths } from '../../src/scripts/effective-flow-state-ledger-core.mjs';
import { createProcessRunner } from '../../src/scripts/process-runner.mjs';
import {
  GIT_ENV,
  SESSION,
  addWorktree,
  call,
  commonDir,
  expectOk,
  git,
  makeRecord,
  recordFile,
  repository,
} from './worktree-fixtures.mjs';

// A second session ID, for the actor that releases or resumes another session's record.
export const OTHER_SESSION = 'deliver-fedcba9876543210';

export const processRunner = createProcessRunner();
export const selectionRunner = (request) =>
  processRunner({ ...request, env: GIT_ENV, stdoutBuffer: true });

export function write(root, relative, content) {
  writeFileSync(join(root, relative), content);
}

// A main checkout with `a.txt` and `b.txt` committed, both changed in the working tree (plus the
// untracked `added` files), bound as one manifest, and a `partial-diff` worktree with its `active`
// record that received the selection. Returns everything the ledger calls need.
//   attributes  the content of a committed `.gitattributes` (a path with a filter or eol attribute)
//   rename      `{from, to, base, content}`: `from` (holding `base`) is committed and renamed to
//               `to` (holding `content`, similar enough for rename detection) in the source
//   deleted     paths committed beside `files` and deleted in the source, selected as tombstones
export async function delivery(
  t,
  {
    files = { 'a.txt': 'a changed\n', 'b.txt': 'b changed\n' },
    added = {},
    attributes = null,
    rename = null,
    deleted = [],
  } = {},
) {
  const root = repository(t, 'effective-flow-ledger-');
  for (const name of [...Object.keys(files), ...deleted]) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    write(root, name, `${name} base\n`);
  }
  if (attributes !== null) write(root, '.gitattributes', attributes);
  if (rename) write(root, rename.from, rename.base);
  git(root, 'add', ...Object.keys(files), ...deleted);
  if (attributes !== null) git(root, 'add', '.gitattributes');
  if (rename) git(root, 'add', rename.from);
  git(root, 'commit', '-q', '-m', 'files');
  const worktree = addWorktree(root, { purpose: 'partial-diff' });
  for (const [name, content] of Object.entries(files)) write(root, name, content);
  for (const name of deleted) rmSync(join(root, name));
  if (rename) {
    git(root, 'config', 'status.renames', 'true');
    renameSync(join(root, rename.from), join(root, rename.to));
    write(root, rename.to, rename.content);
    git(root, 'add', '--intent-to-add', '--', rename.to);
    added = { ...added, [rename.to]: null };
  }
  for (const [name, content] of Object.entries(added)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    if (content !== null) write(root, name, content);
  }
  files = { ...files, ...added };
  const manifest = await bindSelectionManifest(
    {
      sourceRoot: root,
      selection: [...Object.keys(files), ...deleted].map((path) => ({ path, state: 'working' })),
    },
    { runner: selectionRunner },
  );
  const record = makeRecord(root, worktree, { purpose: 'partial-diff', workflow: 'deliver' });
  expectOk(await call('worktree record-init', { cwd: root, executionRoot: root, record }));
  await transferSelection(
    {
      manifest,
      sourceRoot: root,
      deliveryRoot: worktree.worktreePath,
      deliveryReceipt: {
        repositoryIdentity: commonDir(root),
        executionRoot: worktree.worktreePath,
        headOid: worktree.head,
      },
    },
    { runner: selectionRunner, apply: true },
  );
  return { root, worktree, record, manifest };
}

export function initInput(fixture, overrides = {}) {
  return {
    cwd: fixture.root,
    executionRoot: fixture.root,
    recordId: fixture.record.recordId,
    sessionId: SESSION,
    manifest: fixture.manifest,
    groups: [['a.txt'], ['b.txt']],
    base: { branch: 'main', oid: fixture.worktree.head },
    visibility: 'visible',
    language: { git: 'en', forge: 'de' },
    ...overrides,
  };
}

export function ledgerFile(fixture) {
  return ledgerPaths(fixture.root, fixture.record.recordId).ledger;
}

export function readLedgerFile(fixture) {
  return JSON.parse(readFileSync(ledgerFile(fixture), 'utf8'));
}

// Commits exactly `paths` in the delivery worktree and returns the new commit OID.
export function commitGroup(fixture, paths, message = 'group') {
  const cwd = fixture.worktree.worktreePath;
  git(cwd, 'add', '--', ...paths);
  git(cwd, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

export function append(fixture, commitOid, sessionId = SESSION) {
  return call('ledger append', {
    cwd: fixture.root,
    executionRoot: fixture.root,
    recordId: fixture.record.recordId,
    sessionId,
    commitOid,
  });
}

export async function failRecord(fixture) {
  expectOk(
    await call('worktree transition', {
      cwd: fixture.root,
      executionRoot: fixture.root,
      recordId: fixture.record.recordId,
      from: 'active',
      to: 'failed',
      reason: 'group 2 failed',
      sessionId: SESSION,
    }),
  );
}

export function releaseInput(fixture, overrides = {}) {
  return {
    cwd: fixture.root,
    executionRoot: fixture.root,
    recordId: fixture.record.recordId,
    from: 'failed',
    to: 'cleanup-ready',
    reason: null,
    sessionId: OTHER_SESSION,
    release: 'partial-diff',
    ...overrides,
  };
}

export function release(fixture, overrides = {}) {
  return call('worktree transition', releaseInput(fixture, overrides));
}

export function status(cwd) {
  return git(cwd, 'status', '--porcelain', '--untracked-files=all');
}

// The SHA-256 of the worktree's own index file (`git rev-parse --git-path index`, below the
// common directory's `worktrees/` entry for a linked worktree), or null when there is none.
export function indexDigest(cwd) {
  const relative = git(cwd, 'rev-parse', '--git-path', 'index');
  const file = isAbsolute(relative) ? relative : join(cwd, relative);
  return existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null;
}

// A snapshot of everything a refused operation must leave alone: the record file, the ledger file
// (`null` when there is none), the worktree's dirty set, its staged entries (`ls-files --stage
// -z`) and the bytes of its index file. The test's own Git calls run with `GIT_OPTIONAL_LOCKS=0`
// (GIT_ENV), so taking the snapshot never refreshes the index it hashes.
export function snapshot(fixture) {
  const worktree = fixture.worktree.worktreePath;
  return {
    record: readFileSync(recordFile(fixture.root), 'utf8'),
    ledger: existsSync(ledgerFile(fixture)) ? readFileSync(ledgerFile(fixture), 'utf8') : null,
    status: status(worktree),
    stage: git(worktree, 'ls-files', '--stage', '-z'),
    index: indexDigest(worktree),
  };
}

export function assertUnchanged(fixture, before, label = '') {
  assert.deepEqual(snapshot(fixture), before, `record, ledger and worktree unchanged ${label}`);
}
