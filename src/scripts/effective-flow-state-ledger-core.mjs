// Runtime-state helper: the private delivery-progress ledger of a `partial-diff` delivery, its
// schema, its file under the runtime-state guard, and the comparisons the ledger operations, the
// release transition and the resume adoption of `effective-flow-state-recovery-core.mjs` run
// against Git (`commitGroupProblems`, `branchHistory`, `stagedGroupState`). It imports neither that
// module nor `effective-flow-state-worktree-core.mjs`, which both import it.
//
// Location: `<cwd>/.effective-flow/worktree-runs/ledgers/<RECORD_ID>.ledger`, addressed only by the
// record ID. The subdirectory and the `.ledger` suffix keep it out of everything that scans
// `worktree-runs/` for `*.json` records or `*.lock` locks (`listRecordIds`, the orphan-lock
// listing, `cleanup`, and the lifecycle-record scan of `build-run-core.mjs`). Only the state helper
// reads or writes it, through the runtime-state guard; no operation takes ledger content as input.
//
// Schema version 1, exact keys at every level, compact JSON of at most LEDGER_MAX_BYTES. `ledger
// init` checks that bound against the worst case (`worstCaseLedgerBytes`: every group committed
// with a 64-hex OID), so no `ledger append` can grow a ledger past what `readLedger` reads:
//
//   schemaVersion  1
//   recordId, creationOid, worktreePath, branch   copied from the lifecycle record
//   receiptDigest  SHA-256 of the record's canonical receipt (`itemDigest`)
//   base           {branch, oid}: the resolved delivery base; `oid` is the record's `creationOid`
//   visibility     `visible` | `hidden`
//   language       {git, forge}: each `de` | `en`
//   manifest       the bound selection manifest of `delivery-selection-core.mjs`
//   groups         [{index, endpoints: [{path, kind, mode, digest, oid}]}]: the ordered group plan,
//                  an exact non-overlapping partition of the manifest endpoints (rename sources
//                  included, both endpoints of a rename in one group), each endpoint with the
//                  descriptor the helper computed from the delivery worktree: `kind` `blob` with
//                  `mode`, the SHA-256 `digest` of the bytes applied in the worktree and the
//                  `oid` Git stores for them at that path (`hash-object --path`, no `-w`), or
//                  `kind` `tombstone` with `mode`, `digest` and `oid` null
//   commits        [{group, oid}]: one entry per committed group, in group order
//
// Everything but `commits` is immutable after `ledger init`; `ledger append` only adds one entry
// to `commits`. The ledger holds no file content, credential or session token.

import { createHash, randomBytes } from 'node:crypto';
import {
  link as fsLink,
  lstat as fsLstat,
  mkdir as fsMkdir,
  open as fsOpen,
  readFile as fsReadFile,
  readdir as fsReaddir,
  readlink as fsReadlink,
  rename as fsRename,
  rmdir as fsRmdir,
  symlink as fsSymlink,
  unlink as fsUnlink,
  utimes as fsUtimes,
  writeFile as fsWriteFile,
} from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { validateLiteralPath, validateSelectionManifest } from './delivery-selection-core.mjs';
import {
  RUNTIME_STATE_DIR,
  RuntimeStateError,
  asBuffer,
  assertDirectoryChain,
  atomicWrite,
  createNoClobber,
  ensureGuardedDirectory,
  errorDetail,
  guardedUnlink,
} from './runtime-state-guard.mjs';
import { LEDGER_MAX_BYTES, StateError, fail } from './effective-flow-state-core.mjs';
import { isObject, readBoundedFile } from './runtime-file-primitives.mjs';

export { LEDGER_MAX_BYTES };
export const LEDGER_SCHEMA_VERSION = 1;
export const LEDGERS_DIR = 'ledgers';
export const LEDGER_SUFFIX = '.ledger';
// The exact key sets, in the order the helper writes them.
export const LEDGER_KEYS = Object.freeze([
  'schemaVersion',
  'recordId',
  'creationOid',
  'worktreePath',
  'branch',
  'receiptDigest',
  'base',
  'visibility',
  'language',
  'manifest',
  'groups',
  'commits',
]);
// The keys `ledger append` never changes: everything but `commits`. The resume adoption compares
// them (`sameImmutablePart`) to prove the ledger's immutable part unchanged since its proof before
// it appends a recovered commit.
export const LEDGER_IMMUTABLE_KEYS = Object.freeze(LEDGER_KEYS.filter((key) => key !== 'commits'));
export const LEDGER_BASE_KEYS = Object.freeze(['branch', 'oid']);
export const LEDGER_LANGUAGE_KEYS = Object.freeze(['git', 'forge']);
export const LEDGER_GROUP_KEYS = Object.freeze(['index', 'endpoints']);
export const LEDGER_ENDPOINT_KEYS = Object.freeze(['path', 'kind', 'mode', 'digest', 'oid']);
export const LEDGER_COMMIT_KEYS = Object.freeze(['group', 'oid']);
export const LEDGER_VISIBILITIES = Object.freeze(['visible', 'hidden']);
export const LEDGER_LANGUAGES = Object.freeze(['de', 'en']);
// At most this many paths are listed in a refusal; the count is always reported.
export const MAX_REPORTED_PATHS = 256;

const OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FILE_MODES = Object.freeze(['100644', '100755', '120000']);
const ABSENT_MODE = '000000';
// The `diff-index --raw` statuses of a plain staged change; `U` (unmerged) and the rest never match.
const STAGED_CHANGE_STATUSES = Object.freeze(['A', 'M', 'D', 'T']);

// ---------------------------------------------------------------------------------------------
// Paths

// The directory of every ledger: `<cwd>/.effective-flow/worktree-runs/ledgers`.
export function ledgersDir(cwd) {
  return path.join(cwd, RUNTIME_STATE_DIR, 'worktree-runs', LEDGERS_DIR);
}

export function ledgerPaths(cwd, recordId) {
  const dir = ledgersDir(cwd);
  return { dir, ledger: path.join(dir, `${recordId}${LEDGER_SUFFIX}`) };
}

// ---------------------------------------------------------------------------------------------
// Group plan

// Every endpoint of `manifest` (a validated selection manifest), rename sources included, mapped to
// the index of its manifest entry, in manifest order.
export function manifestEndpoints(manifest) {
  const endpoints = new Map();
  manifest.entries.forEach((entry, index) => {
    endpoints.set(entry.path, index);
    if (entry.renameFrom !== null) endpoints.set(entry.renameFrom, index);
  });
  return endpoints;
}

// Why `groups` (an ordered array of endpoint arrays) is not an exact, non-overlapping partition of
// the endpoints of `manifest` that keeps both endpoints of a rename in one group; null when it is.
// The message names only validated endpoints, never a refused input value.
export function groupPlanProblem(manifest, groups) {
  if (!Array.isArray(groups) || groups.length === 0) return 'must be a non-empty array';
  const endpoints = manifestEndpoints(manifest);
  if (groups.length > endpoints.size) return 'must not have more groups than endpoints';
  const owner = new Map();
  for (const [index, group] of groups.entries()) {
    if (!Array.isArray(group) || group.length === 0) {
      return `[${index}] must be a non-empty array of manifest endpoints`;
    }
    for (const value of group) {
      if (typeof value !== 'string' || !endpoints.has(value)) {
        return `[${index}] names a path that is no manifest endpoint`;
      }
      if (owner.has(value)) return `name ${value} more than once`;
      owner.set(value, index);
    }
  }
  for (const endpoint of endpoints.keys()) {
    if (!owner.has(endpoint)) return `leave the manifest endpoint ${endpoint} out`;
  }
  for (const entry of manifest.entries) {
    if (entry.renameFrom !== null && owner.get(entry.renameFrom) !== owner.get(entry.path)) {
      return `split the rename ${entry.renameFrom} -> ${entry.path} across groups`;
    }
  }
  return null;
}

// The ledger's `groups` from an exact group plan and the descriptors of every manifest endpoint
// (`describeDeliveryEndpoints`): each group's endpoints sorted, each with its descriptor.
export function ledgerGroups(groups, endpoints) {
  const byPath = new Map(endpoints.map((endpoint) => [endpoint.path, endpoint]));
  return groups.map((group, index) => ({
    index,
    endpoints: [...group].sort().map((repoPath) => {
      const descriptor = byPath.get(repoPath);
      if (!descriptor) fail('INTERNAL_ERROR', `no descriptor was computed for ${repoPath}`);
      return {
        path: repoPath,
        kind: descriptor.kind,
        mode: descriptor.mode,
        digest: descriptor.digest,
        oid: descriptor.oid,
      };
    }),
  }));
}

// ---------------------------------------------------------------------------------------------
// Schema

function exactKeys(value, keys) {
  return (
    isObject(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isPlainText(value, max) {
  return (
    typeof value === 'string' &&
    value !== '' &&
    value.length <= max &&
    !/[\u0000- \u007f]/.test(value)
  );
}

function endpointProblem(endpoint) {
  if (!exactKeys(endpoint, LEDGER_ENDPOINT_KEYS)) return 'endpoint-keys';
  try {
    validateLiteralPath(endpoint.path);
  } catch {
    return 'endpoint-path';
  }
  if (endpoint.kind === 'tombstone') {
    return endpoint.mode === null && endpoint.digest === null && endpoint.oid === null
      ? null
      : 'endpoint-tombstone';
  }
  if (endpoint.kind !== 'blob') return 'endpoint-kind';
  if (!FILE_MODES.includes(endpoint.mode)) return 'endpoint-mode';
  if (typeof endpoint.digest !== 'string' || !SHA256_PATTERN.test(endpoint.digest)) {
    return 'endpoint-digest';
  }
  if (typeof endpoint.oid !== 'string' || !OID_PATTERN.test(endpoint.oid)) return 'endpoint-oid';
  return null;
}

// Why `value` is not a version 1 ledger bound to `binding` ({recordId, creationOid, worktreePath,
// branch, receiptDigest} of the lifecycle record); null when it is. A ledger is never repaired.
export function ledgerProblem(value, binding) {
  if (!exactKeys(value, LEDGER_KEYS)) return 'keys';
  if (value.schemaVersion !== LEDGER_SCHEMA_VERSION) return 'schema-version';
  for (const key of ['recordId', 'creationOid', 'worktreePath', 'branch', 'receiptDigest']) {
    if (value[key] !== binding[key]) return `binding-${key}`;
  }
  if (!exactKeys(value.base, LEDGER_BASE_KEYS)) return 'base';
  if (!isPlainText(value.base.branch, 255) || value.base.oid !== value.creationOid) return 'base';
  if (!LEDGER_VISIBILITIES.includes(value.visibility)) return 'visibility';
  if (
    !exactKeys(value.language, LEDGER_LANGUAGE_KEYS) ||
    !LEDGER_LANGUAGE_KEYS.every((key) => LEDGER_LANGUAGES.includes(value.language[key]))
  ) {
    return 'language';
  }
  try {
    validateSelectionManifest(value.manifest);
  } catch {
    return 'manifest';
  }
  if (!Array.isArray(value.groups)) return 'groups';
  const plan = [];
  for (const [index, group] of value.groups.entries()) {
    if (!exactKeys(group, LEDGER_GROUP_KEYS) || group.index !== index) return 'groups';
    if (!Array.isArray(group.endpoints)) return 'groups';
    for (const endpoint of group.endpoints) {
      const problem = endpointProblem(endpoint);
      if (problem) return problem;
    }
    const paths = group.endpoints.map((endpoint) => endpoint.path);
    if (paths.some((repoPath, position) => position > 0 && paths[position - 1] >= repoPath)) {
      return 'groups-order';
    }
    plan.push(paths);
  }
  if (groupPlanProblem(value.manifest, plan)) return 'groups-partition';
  const descriptors = new Map(
    value.groups.flatMap((group) => group.endpoints).map((e) => [e.path, e]),
  );
  for (const entry of value.manifest.entries) {
    if (descriptors.get(entry.path).kind !== entry.selected.kind) return 'endpoint-kind';
    if (entry.renameFrom !== null && descriptors.get(entry.renameFrom).kind !== 'tombstone') {
      return 'endpoint-kind';
    }
  }
  if (!Array.isArray(value.commits) || value.commits.length > value.groups.length) {
    return 'commits';
  }
  const seen = new Set();
  for (const [index, commit] of value.commits.entries()) {
    if (!exactKeys(commit, LEDGER_COMMIT_KEYS) || commit.group !== index) return 'commits';
    if (typeof commit.oid !== 'string' || !OID_PATTERN.test(commit.oid) || seen.has(commit.oid)) {
      return 'commits';
    }
    seen.add(commit.oid);
  }
  return null;
}

// The ledger with its keys in the written order, from its parts.
export function makeLedger({
  binding,
  base,
  visibility,
  language,
  manifest,
  groups,
  commits = [],
}) {
  return {
    schemaVersion: LEDGER_SCHEMA_VERSION,
    recordId: binding.recordId,
    creationOid: binding.creationOid,
    worktreePath: binding.worktreePath,
    branch: binding.branch,
    receiptDigest: binding.receiptDigest,
    base: { branch: base.branch, oid: base.oid },
    visibility,
    language: { git: language.git, forge: language.forge },
    manifest,
    groups,
    commits: commits.map((commit) => ({ group: commit.group, oid: commit.oid })),
  };
}

export function serializeLedger(ledger) {
  const ordered = {};
  for (const key of LEDGER_KEYS) ordered[key] = ledger[key];
  return `${JSON.stringify(ordered)}\n`;
}

// The longest commit OID Git writes (SHA-256): the worst case of every `commits` entry.
const WORST_CASE_OID = 'f'.repeat(64);

// The serialized size of `ledger` once every group is committed with a 64-hex OID: the largest
// size `ledger append` can grow it to. `ledger init` writes a ledger only when this worst case
// stays within LEDGER_MAX_BYTES, the bound `readLedger` reads with.
export function worstCaseLedgerBytes(ledger) {
  const commits = ledger.groups.map((group) => ({ group: group.index, oid: WORST_CASE_OID }));
  return Buffer.byteLength(serializeLedger({ ...ledger, commits }));
}

// The index of the next group to commit, the groups still uncommitted, and the expected parent of
// the next commit (the last recorded commit, or the record's `creationOid` before the first).
export function ledgerProgress(ledger) {
  const next = ledger.commits.length;
  return {
    next,
    complete: next >= ledger.groups.length,
    parent: ledger.commits.at(-1)?.oid ?? ledger.creationOid,
    residualGroups: ledger.groups.slice(next),
  };
}

// Every endpoint descriptor of the uncommitted groups, in group order.
export function residualEndpoints(ledger) {
  return ledgerProgress(ledger).residualGroups.flatMap((group) => group.endpoints);
}

// Whether `left` and `right` hold the same immutable part (every key of LEDGER_IMMUTABLE_KEYS):
// the identity a resume adoption proves before it appends a recovered commit.
export function sameImmutablePart(left, right) {
  return LEDGER_IMMUTABLE_KEYS.every((key) => isDeepStrictEqual(left?.[key], right?.[key]));
}

// ---------------------------------------------------------------------------------------------
// File access (all through the runtime-state guard)

// Reads the ledger of `binding.recordId`: `{state: 'missing'}`, `{state: 'invalid', reason}` or
// `{state: 'ok', ledger}`. `context.fs` provides `lstat` and `open`. The read bound is
// LEDGER_MAX_BYTES, which `ledger init` proved for the fully appended worst case.
export async function readLedger(context, cwd, binding) {
  const paths = ledgerPaths(cwd, binding.recordId);
  if (!(await assertDirectoryChain(cwd, paths.dir, { allowMissing: true }))) {
    return { state: 'missing' };
  }
  const read = await readBoundedFile(context.fs, paths.ledger, LEDGER_MAX_BYTES);
  if (read.state === 'missing') return { state: 'missing' };
  if (read.state !== 'ok') return { state: 'invalid', reason: read.state };
  let value;
  try {
    value = JSON.parse(read.content.toString('utf8'));
  } catch {
    return { state: 'invalid', reason: 'invalid-json' };
  }
  const problem = ledgerProblem(value, binding);
  return problem ? { state: 'invalid', reason: problem } : { state: 'ok', ledger: value };
}

// Whether any entry holds the ledger name of `recordId` (a valid ledger or not).
export async function ledgerExists(context, cwd, recordId) {
  const paths = ledgerPaths(cwd, recordId);
  if (!(await assertDirectoryChain(cwd, paths.dir, { allowMissing: true }))) return false;
  try {
    await context.fs.lstat(paths.ledger);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    fail('UNSAFE_TARGET', `cannot inspect ${paths.ledger}: ${error?.code ?? error?.message}`);
  }
}

// Creates the ledger no-clobber: `{created: true}` or `{created: false}` when the name is taken.
export async function createLedger(context, cwd, recordId, serialized) {
  const paths = ledgerPaths(cwd, recordId);
  await ensureGuardedDirectory(context, paths.dir);
  const created = await createNoClobber(context, paths.ledger, serialized, {
    tempPrefix: '.ledger-init-',
  });
  return { created: created.created, path: paths.ledger };
}

// Replaces the ledger atomically; `beforeRename` aborts the write with a truthy value.
export async function replaceLedger(context, cwd, ledger, { beforeRename } = {}) {
  const paths = ledgerPaths(cwd, ledger.recordId);
  return atomicWrite(context, paths.ledger, serializeLedger(ledger), { beforeRename });
}

// Deletes the ledger of `recordId` when one exists: `{deleted: true | false}`.
export async function deleteLedger(context, cwd, recordId) {
  if (!(await ledgerExists(context, cwd, recordId))) return { deleted: false };
  await guardedUnlink(context, ledgerPaths(cwd, recordId).ledger);
  return { deleted: true };
}

// The record ID of every `<RECORD_ID>.ledger` below `ledgers/` (sorted, unvalidated); none when the
// directory is missing.
export async function listLedgerIds(context, cwd) {
  const dir = ledgersDir(cwd);
  if (!(await assertDirectoryChain(cwd, dir, { allowMissing: true }))) return [];
  let names;
  try {
    names = await (context.fs.readdir ?? fsReaddir)(dir);
  } catch (error) {
    fail('UNSAFE_TARGET', `cannot list ${dir}: ${error?.code ?? error?.message}`);
  }
  return names
    .filter((name) => name.endsWith(LEDGER_SUFFIX) && !name.startsWith('.'))
    .map((name) => name.slice(0, -LEDGER_SUFFIX.length))
    .sort();
}

// ---------------------------------------------------------------------------------------------
// Git comparisons. `git(args, options)` runs one Git call in a proven root and returns the raw
// result; the caller supplies it with `core.fsmonitor=false`.

function gitOk(result) {
  return !result?.error && result?.status === 0;
}

function parseRawDiff(buffer) {
  const fields = asBuffer(buffer).toString('utf8').split('\0');
  if (fields.at(-1) === '') fields.pop();
  const changes = new Map();
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const meta = fields[index].replace(/^:/, '').split(' ');
    if (meta.length !== 5) return null;
    changes.set(fields[index + 1], { dstMode: meta[1], dstOid: meta[3], status: meta[4] });
  }
  return fields.length % 2 === 0 ? changes : null;
}

// The failed proofs of `commitOid` as the commit of `group`: `parent` unless its only parent is
// `parentOid`; `paths` unless the paths it changes against `parentOid` are exactly the group's
// endpoints; `blobs` unless every endpoint holds the descriptor's blob OID and mode in it (or is
// absent for a tombstone). Renames are never detected, so a rename is its two endpoints. Returns
// the failed proof identifiers in that order (empty when the commit is the group's).
export async function commitGroupProblems(git, { commitOid, parentOid, group }) {
  const problems = [];
  const parents = await git(['rev-list', '--parents', '-n', '1', commitOid, '--']);
  const line = gitOk(parents) ? asBuffer(parents.stdout).toString('utf8').trim().split(' ') : [];
  if (line.length !== 2 || line[0] !== commitOid || line[1] !== parentOid) problems.push('parent');
  const diff = await git([
    'diff-tree',
    '-r',
    '-z',
    '--raw',
    '--no-renames',
    '--no-ext-diff',
    '--ignore-submodules=none',
    parentOid,
    commitOid,
    '--',
  ]);
  const changes = gitOk(diff) ? parseRawDiff(diff.stdout) : null;
  if (changes === null) return [...problems, 'paths', 'blobs'];
  const endpoints = group.endpoints.map((endpoint) => endpoint.path);
  if (changes.size !== endpoints.length || endpoints.some((repoPath) => !changes.has(repoPath))) {
    problems.push('paths');
  }
  const matches = group.endpoints.every((endpoint) => {
    const change = changes.get(endpoint.path);
    if (!change) return false;
    if (endpoint.kind === 'tombstone') return change.dstMode === ABSENT_MODE;
    return change.dstMode === endpoint.mode && change.dstOid === endpoint.oid;
  });
  if (!matches) problems.push('blobs');
  return problems;
}

// The commits from `creationOid` (exclusive) to `tip` (inclusive), oldest first, as `rev-list`
// lists them, or null when Git cannot list them. At most `limit` of the newest are read, so a
// history longer than `limit` comes back with exactly `limit` entries and never equals a shorter
// expected list.
export async function branchHistory(git, { creationOid, tip, limit }) {
  const listed = await git(['rev-list', `--max-count=${limit}`, `${creationOid}..${tip}`, '--']);
  if (!gitOk(listed)) return null;
  const oids = asBuffer(listed.stdout)
    .toString('utf8')
    .split('\n')
    .filter((line) => line !== '');
  if (!oids.every((oid) => OID_PATTERN.test(oid))) return null;
  return oids.reverse();
}

// The staged state of the worktree `git` runs in against its HEAD: `{clean: true}` when the index
// holds HEAD's tree, else `{clean: false, paths, matches}` with the staged paths (sorted) and
// whether they are exactly the endpoints of `group` (when given), each holding its descriptor's
// blob OID and mode or, for a tombstone, absent: the staged tree is then exactly HEAD's tree with
// that group applied. Renames are never detected. Only a plain staged change (status A, M, D or T)
// can match: an unmerged entry (status U, listed with the absent mode `000000`, which would
// otherwise pass for a staged tombstone) or any other status is never the group's. Null when Git
// cannot compare.
export async function stagedGroupState(git, group) {
  const diff = await git([
    'diff-index',
    '--cached',
    '-r',
    '-z',
    '--raw',
    '--no-renames',
    '--ignore-submodules=none',
    'HEAD',
    '--',
  ]);
  const changes = gitOk(diff) ? parseRawDiff(diff.stdout) : null;
  if (changes === null) return null;
  if (changes.size === 0) return { clean: true, paths: [], matches: false };
  const paths = [...changes.keys()].sort();
  const matches =
    group !== null &&
    group !== undefined &&
    changes.size === group.endpoints.length &&
    [...changes.values()].every((change) => STAGED_CHANGE_STATUSES.includes(change.status)) &&
    group.endpoints.every((endpoint) => {
      const change = changes.get(endpoint.path);
      if (!change) return false;
      if (endpoint.kind === 'tombstone') return change.dstMode === ABSENT_MODE;
      return change.dstMode === endpoint.mode && change.dstOid === endpoint.oid;
    });
  return { clean: false, paths, matches };
}

// `paths` as the NUL-terminated stdin of `--pathspec-from-file=- --pathspec-file-nul`.
function pathspecInput(paths) {
  return Buffer.from(paths.map((repoPath) => `${repoPath}\0`).join(''), 'utf8');
}

// Runs one Git call through `git(args, {stdin, indexFile})` and fails with GIT_FAILED unless it
// succeeds. `indexFile` names a private index the call reads and writes instead of the worktree's.
async function runOrFail(git, args, options = {}) {
  const result = await git(args, options);
  if (!gitOk(result)) {
    const command = args.find((arg) => !arg.startsWith('-'));
    fail(
      'GIT_FAILED',
      `git ${command} failed: ${result?.error?.message ?? errorDetail(result?.stderr)}`,
    );
  }
  return result;
}

function outputText(result) {
  return asBuffer(result.stdout).toString('utf8').replace(/\n$/, '');
}

// The filesystem calls of the restore and the unstage; a caller's `fs` overrides any of them.
const NODE_FS = Object.freeze({
  link: fsLink,
  lstat: fsLstat,
  mkdir: fsMkdir,
  open: fsOpen,
  readFile: fsReadFile,
  readdir: fsReaddir,
  readlink: fsReadlink,
  rename: fsRename,
  rmdir: fsRmdir,
  symlink: fsSymlink,
  unlink: fsUnlink,
  utimes: fsUtimes,
  writeFile: fsWriteFile,
});

const RESTORE_STAGED = Object.freeze([
  '--literal-pathspecs',
  'restore',
  '--source=HEAD',
  '--staged',
  '--pathspec-from-file=-',
  '--pathspec-file-nul',
]);
const RM_CACHED = Object.freeze([
  '--literal-pathspecs',
  'rm',
  '--cached',
  '-q',
  '--ignore-unmatch',
  '--pathspec-from-file=-',
  '--pathspec-file-nul',
]);

// The prefix of the refs that keep what a release discarded: one tree per restore, at
// `<prefix>/<RECORD_ID>/<tree OID>`.
export const RELEASE_PRESERVE_REF_PREFIX = 'refs/effective-flow/released';

// Runs `fn` while the index of the worktree `git` runs in is locked by Git's own protocol: its
// `index.lock`, created exclusively, makes every Git process that would write this index fail
// until it is gone, so the snapshot `fn` works on cannot change underneath it. `fn({indexFile,
// scratch, commit})` reads and writes only `indexFile`, a private copy of the index taken after the
// lock; `scratch(name)` names a further private file beside it; `commit()` replaces the index with
// the copy through the lock, once the index still holds the snapshot's bytes (a writer that
// bypasses the lock fails it, with the index left as it is). Without `commit()` the index stays as
// it was. The copy starts with the index's own times and the index ends with the copy's, as if Git
// had written the index in place: Git trusts an entry's stat data only when it is older than the
// index file, so a later time would hide a same-second edit from the clean check. A lock another
// process holds is WRITE_FAILED before anything is read. The lock and every private file are
// removed when `fn` ends.
async function withLockedIndex(git, io, fn) {
  const gitDir = outputText(await runOrFail(git, ['rev-parse', '--absolute-git-dir']));
  if (!path.isAbsolute(gitDir))
    fail('GIT_FAILED', 'git rev-parse returned no absolute Git directory');
  const index = path.join(gitDir, 'index');
  const lock = `${index}.lock`;
  let handle = null;
  try {
    handle = await io.open(lock, 'wx', 0o644);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      fail(
        'WRITE_FAILED',
        `the index of the delivery worktree is locked by another Git process (${lock} exists); nothing was changed`,
      );
    }
    throw error;
  }
  const token = randomBytes(8).toString('hex');
  const scratchFiles = [];
  const scratch = (name) => {
    const file = `${index}.effective-flow-${token}-${name}`;
    scratchFiles.push(file);
    return file;
  };
  const indexFile = scratch('index');
  let committed = false;
  try {
    const snapshot = await io.readFile(index);
    const times = await io.lstat(index);
    await io.writeFile(indexFile, snapshot, { flag: 'wx', mode: 0o600 });
    await io.utimes(indexFile, times.atime, times.mtime);
    const commit = async () => {
      if (!(await io.readFile(index)).equals(snapshot)) {
        fail(
          'WRITE_FAILED',
          'the index of the delivery worktree changed while it was locked; it was left as it is',
        );
      }
      const written = await io.lstat(indexFile);
      await handle.writeFile(await io.readFile(indexFile));
      await handle.utimes(written.atime, written.mtime);
      await handle.sync();
      await handle.close();
      handle = null;
      await io.rename(lock, index);
      committed = true;
    };
    return await fn({ indexFile, scratch, commit });
  } finally {
    if (handle !== null) await handle.close().catch(() => {});
    if (!committed) await io.unlink(lock).catch(() => {});
    for (const file of scratchFiles) await io.unlink(file).catch(() => {});
  }
}

// `git` bound to the private index `indexFile`.
function onIndex(git, indexFile) {
  return (args, options = {}) => git(args, { ...options, indexFile });
}

// The paths at which the index `git` reads differs from HEAD other than as the dirty residual
// endpoint at that path allows: an entry outside `dirty`, one that is not its descriptor's blob
// and mode (or present for a tombstone), and any entry that is no plain staged change (unmerged
// included). One `diff-index` over the whole index proves the endpoints and every path that
// collides with them (an entry at a parent of a path or below it) from the same snapshot. Null
// when Git cannot compare.
async function indexSnapshotProblems(git, byPath, dirty) {
  const diff = await git([
    'diff-index',
    '--cached',
    '-r',
    '-z',
    '--raw',
    '--no-renames',
    '--ignore-submodules=none',
    'HEAD',
    '--',
  ]);
  const changes = gitOk(diff) ? parseRawDiff(diff.stdout) : null;
  if (changes === null) return null;
  return [...changes]
    .filter(([repoPath, change]) => {
      const descriptor = dirty.has(repoPath) ? byPath.get(repoPath) : undefined;
      if (descriptor === undefined || !STAGED_CHANGE_STATUSES.includes(change.status)) return true;
      if (descriptor.kind === 'tombstone') return change.dstMode !== ABSENT_MODE;
      return change.dstMode !== descriptor.mode || change.dstOid !== descriptor.oid;
    })
    .map(([repoPath]) => repoPath)
    .sort();
}

// Whether every parent of `repoPath` below `root` is a real directory: false once one is missing
// (the path is then absent); a symbolic link or a non-directory parent is UNSAFE_TARGET.
async function realParents(io, root, repoPath) {
  const parts = repoPath.split('/');
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    const info = await lstatOrNull(io, current);
    if (info === null) return false;
    if (info.isSymbolicLink() || !info.isDirectory()) {
      fail('UNSAFE_TARGET', `${repoPath} has a parent that is not a real directory`);
    }
  }
  return true;
}

async function lstatOrNull(fs, target) {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw error;
  }
}

// Fails with UNSAFE_TARGET when restoring the tracked residual path `repoPath` below `root` would
// delete content no proof covers. Checking out HEAD's entry needs a directory standing at the path
// and a non-directory standing at one of its parents gone, while the residual proofs count such a
// directory as the path's tombstone and never see its ignored descendants. A parent or descendant
// that is not a directory passes only when `proven` holds its repository path; a directory tree
// holding nothing but directories passes. `fs` provides `lstat` and `readdir`.
async function assertRestoreDeletesNothingUnproven(fs, root, repoPath, proven) {
  const refuse = (occupant) =>
    fail(
      'UNSAFE_TARGET',
      `restoring the tracked residual path ${repoPath} would delete ${occupant}, which the residual does not cover; the release stopped before discarding it`,
    );
  const parts = repoPath.split('/');
  for (let depth = 1; depth < parts.length; depth += 1) {
    const info = await lstatOrNull(fs, path.join(root, ...parts.slice(0, depth)));
    if (info === null) return;
    if (info.isDirectory()) continue;
    const parent = parts.slice(0, depth).join('/');
    if (proven.has(parent)) return;
    refuse(parent);
  }
  const info = await lstatOrNull(fs, path.join(root, ...parts));
  if (info === null || !info.isDirectory()) return;
  const pending = [repoPath];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const name of await fs.readdir(path.join(root, ...directory.split('/')))) {
      const entry = `${directory}/${name}`;
      const entryInfo = await lstatOrNull(fs, path.join(root, ...entry.split('/')));
      if (entryInfo === null) continue;
      if (entryInfo.isDirectory()) pending.push(entry);
      else if (!proven.has(entry)) refuse(entry);
    }
  }
}

// Removes the directory tree standing at the tracked residual path `repoPath` below `root`,
// deepest first, through `rmdir` alone, which never removes a directory that still holds
// anything: a file added below it meanwhile stops the restore with UNSAFE_TARGET (naming it, see
// `assertRestoreDeletesNothingUnproven`) instead of being deleted.
async function removeEmptyTree(io, root, repoPath) {
  const remove = async (relative) => {
    const absolute = path.join(root, ...relative.split('/'));
    for (const name of await io.readdir(absolute)) {
      const child = `${relative}/${name}`;
      if ((await lstatOrNull(io, path.join(absolute, name)))?.isDirectory()) await remove(child);
    }
    await io.rmdir(absolute);
  };
  try {
    await remove(repoPath);
  } catch (error) {
    if (error?.code !== 'ENOTEMPTY' && error?.code !== 'EEXIST') throw error;
    await assertRestoreDeletesNothingUnproven(io, root, repoPath, new Set());
    fail(
      'UNSAFE_TARGET',
      `restoring the tracked residual path ${repoPath} would delete content below it; the release stopped before discarding it`,
    );
  }
}

// Removes the directories below `root` that the removal of `repoPath` left empty, deepest first,
// through `rmdir`; stops at the first directory that is not empty.
async function removeEmptiedParents(fs, root, repoPath) {
  const parts = repoPath.split('/').slice(0, -1);
  while (parts.length > 0) {
    try {
      await fs.rmdir(path.join(root, ...parts));
    } catch {
      return;
    }
    parts.pop();
  }
}

// The quarantine of one restore: a private directory directly below the worktree `root` (so a
// rename into it never crosses a file system) that holds every file the restore took from a
// residual path until its bytes are preserved. `take` moves one file or symbolic link in and
// returns where it is held; `putBack` returns a held entry to its path without replacing anything
// that stands there now and reports whether it did (it never throws; an entry it cannot return
// keeps the whole quarantine, so the error can name where it is); `clear(anchored)` removes
// only the held entries listed in `anchored` (those whose own bytes are anchored under the
// preserve ref) and then the directory, unless an entry is still held that was neither put back
// nor anchored: that entry and the directory are kept. `keep` leaves the directory and every entry.
function makeQuarantine(io, root) {
  const directory = path.join(root, `.effective-flow-release-${randomBytes(8).toString('hex')}`);
  let created = false;
  let kept = false;
  let count = 0;
  const held = new Set();
  return {
    directory,
    async take(target) {
      if (!created) {
        await io.mkdir(directory, { mode: 0o700 });
        created = true;
      }
      const entry = path.join(directory, String(count));
      count += 1;
      await io.rename(target, entry);
      held.add(entry);
      return entry;
    },
    async putBack(entry, target) {
      try {
        const info = await io.lstat(entry);
        if (info.isSymbolicLink()) await io.symlink(await io.readlink(entry), target);
        else if (info.isDirectory()) {
          if ((await lstatOrNull(io, target)) !== null) throw new Error('occupied');
          await io.rename(entry, target);
          held.delete(entry);
          return true;
        } else await io.link(entry, target);
        await io.unlink(entry);
      } catch {
        kept = true;
        return false;
      }
      held.delete(entry);
      return true;
    },
    keep() {
      kept = true;
    },
    get kept() {
      return kept;
    },
    async clear(anchored) {
      if (kept || !created) return;
      for (const entry of anchored) {
        if (!held.has(entry)) continue;
        await io.unlink(entry).catch((error) => {
          if (error?.code !== 'ENOENT') throw error;
        });
        held.delete(entry);
      }
      if (held.size > 0) kept = true;
      else await io.rmdir(directory);
    },
  };
}

// Anchors the preserved blobs (`entries`, each `{path, mode, oid}`) as one tree, built in the
// private index `scratchIndex`, at `<refPrefix>/<tree OID>`. Returns the ref.
async function preserveTree(git, scratchIndex, entries, refPrefix) {
  const inScratch = onIndex(git, scratchIndex);
  const info = entries.map((entry) => `${entry.mode} ${entry.oid}\t${entry.path}\0`).join('');
  await runOrFail(inScratch, ['update-index', '--add', '-z', '--index-info'], {
    stdin: Buffer.from(info, 'utf8'),
  });
  const tree = outputText(await runOrFail(inScratch, ['write-tree']));
  if (!OID_PATTERN.test(tree)) fail('GIT_FAILED', 'git write-tree returned an invalid object id');
  const ref = `${refPrefix}/${tree}`;
  await runOrFail(git, ['update-ref', ref, tree]);
  return ref;
}

// The error of a restore that stopped part-way: the code of `error` (WRITE_FAILED for one that is
// not the helper's), its message, the residual paths this call had already restored and the
// index entries it had already removed, in the message and as `envelopeDetails.restored` and
// `envelopeDetails.unstaged`, and where the discarded bytes are kept (`preserved`, the ref, and a
// quarantine directory that could not be cleared). The record is still unchanged; a retry of the
// release counts the restored paths as released (they hold HEAD's state again) and restores the
// rest.
function partialRestoreError(error, restored, unstaged, notes = []) {
  const code = error instanceof RuntimeStateError ? error.code : 'WRITE_FAILED';
  const list = (paths) => (paths.length > 0 ? [...paths].sort().join(', ') : 'none');
  const wrapped = new StateError(
    code,
    `${error?.message ?? String(error)}; already restored: ${list(restored)}; already unstaged: ${list(unstaged)}${notes.map((note) => `; ${note}`).join('')}; the record is unchanged`,
    { cause: error },
  );
  wrapped.envelopeDetails = { restored: [...restored].sort(), unstaged: [...unstaged].sort() };
  return wrapped;
}

// Restores exactly the dirty residual paths of `residual` (an `inspectResidual` result whose dirt
// is proven to be the ledger's residual) in the worktree at `root`: a path HEAD tracks gets HEAD's
// entry in index and working tree; a path absent from HEAD loses its index entry and its file, and
// the directories this left empty go too. Nothing else is touched. `git(args, {stdin,
// indexFile})` runs in that worktree.
//
// The index is locked for the whole restore (`withLockedIndex`), so no Git process changes it in
// between, and every index read and write goes to one private snapshot of it, which replaces the
// index at the end. Before the first discard that snapshot must differ from HEAD only at dirty
// residual paths, each with its descriptor's entry (`indexSnapshotProblems`): a newer staged entry
// at any path, a parent of a residual path or below it included, stops the restore with
// WRITE_FAILED before anything is discarded.
//
// Per path, in order (paths absent from HEAD deepest first, then tracked paths): `sourceRecheck`
// must confirm that the source still holds the selection covering the path; the file or symbolic
// link at the path is then moved into a private quarantine directory below `root` and proven
// there to be its descriptor's kind, mode and bytes, so what is proven is exactly what left the
// worktree. A path changed since its proof is put back and stops the restore with WRITE_FAILED.
// The proven bytes are written to the object database (`hash-object -w`) before anything else
// happens to them, and once the loop ends they are anchored as one tree at
// `<preserveRef>/<tree OID>` before the quarantine is cleared, so every discarded byte stays
// recoverable whatever happened to the source meanwhile. A taken file whose proof or blob write
// fails is put back to its path, or else kept in the quarantine (named in the error); the
// quarantine drops only entries whose own bytes are anchored, so a file neither put back nor
// anchored keeps the quarantine and itself. A tracked path then gets HEAD's index
// entry and HEAD's file through `checkout-index` without `--force`, which never replaces anything
// that stands at the path.
//
// A tracked path whose restore would delete content outside the residual (a directory standing
// at the path with any file below it, a non-directory parent; see
// `assertRestoreDeletesNothingUnproven`) stops it with UNSAFE_TARGET: once before the first
// discard, where the dirty residual paths absent from HEAD count as proven, and again right before
// that path's own discard, where nothing does; the directory itself goes only through `rmdir`,
// which never deletes a file added below it meanwhile. A restore that stops part-way still
// preserves what it took and writes the index of what it did, and names the paths it already
// restored and the index entries it already removed (`partialRestoreError`). `fs` overrides any of
// NODE_FS. Returns the restored paths (sorted).
export async function restoreResidual({
  git,
  fs,
  root,
  residual,
  descriptors,
  sourceRecheck,
  preserveRef,
}) {
  const io = { ...NODE_FS, ...fs };
  const byPath = new Map(descriptors.map((descriptor) => [descriptor.path, descriptor]));
  const dirty = new Set(residual.dirty);
  const tracked = new Set(residual.tracked);
  const staged = new Set(residual.staged);
  const absent = residual.dirty
    .filter((repoPath) => !tracked.has(repoPath))
    .sort()
    .reverse();
  const trackedOrder = [...tracked].sort();
  const restored = [];
  const unstaged = [];
  const preserved = [];
  const notes = [];
  const quarantine = makeQuarantine(io, root);
  let indexWritten = false;
  const changed = (repoPath) =>
    fail(
      'WRITE_FAILED',
      `the residual path ${repoPath} changed after its proof (working tree or index); the release stopped before discarding it`,
    );
  const confirmSource = async (repoPath) => {
    const descriptor = byPath.get(repoPath);
    if (!descriptor) changed(repoPath);
    if (!(await sourceRecheck(descriptor))) {
      fail(
        'WRITE_FAILED',
        `the source of the residual path ${repoPath} changed after its proof or cannot be read; the release stopped before discarding it`,
      );
    }
    return descriptor;
  };
  // What stands at `repoPath` against `descriptor`: 'absent' or 'directory' (which only a
  // tombstone allows; a directory counts as one), else the quarantine path of the file or symbolic
  // link taken from it, proven and written as a blob.
  const capture = async (repoPath, descriptor) => {
    const target = path.join(root, ...repoPath.split('/'));
    const info = (await realParents(io, root, repoPath)) ? await lstatOrNull(io, target) : null;
    if (info === null || info.isDirectory()) {
      if (descriptor.kind !== 'tombstone') changed(repoPath);
      return info === null ? 'absent' : 'directory';
    }
    if (descriptor.kind !== 'blob') changed(repoPath);
    const held = await quarantine.take(target);
    let mismatch = false;
    try {
      const heldInfo = await io.lstat(held);
      const link = heldInfo.isSymbolicLink();
      let bytes = null;
      if (link) bytes = Buffer.from(await io.readlink(held), 'utf8');
      else if (heldInfo.isFile()) bytes = await io.readFile(held);
      const mode = link ? '120000' : heldInfo.mode & 0o111 ? '100755' : '100644';
      if (
        bytes === null ||
        mode !== descriptor.mode ||
        createHash('sha256').update(bytes).digest('hex') !== descriptor.digest
      ) {
        mismatch = true;
        changed(repoPath);
      }
      const oid = outputText(
        await runOrFail(git, ['hash-object', '-w', '--no-filters', '--stdin'], { stdin: bytes }),
      );
      if (!OID_PATTERN.test(oid)) {
        fail('GIT_FAILED', 'git hash-object returned an invalid object id');
      }
      preserved.push({ path: repoPath, mode, oid, held });
      return held;
    } catch (error) {
      if (!(await quarantine.putBack(held, target))) {
        notes.push(`the ${mismatch ? 'changed ' : ''}content of ${repoPath} is kept at ${held}`);
      }
      throw error;
    }
  };
  // Runs the discard `step` of a path whose content `held` (a capture result) took; a failing step
  // puts the taken content back.
  const discard = async (repoPath, held, step) => {
    try {
      await step();
    } catch (error) {
      if (held !== 'absent' && held !== 'directory') {
        if (!(await quarantine.putBack(held, path.join(root, ...repoPath.split('/'))))) {
          notes.push(`the content of ${repoPath} is kept at ${held}`);
        }
      }
      throw error;
    }
  };
  const proven = new Set(absent);
  const nothingProven = new Set();
  try {
    for (const repoPath of trackedOrder) {
      await assertRestoreDeletesNothingUnproven(io, root, repoPath, proven);
    }
    await withLockedIndex(git, io, async ({ indexFile, scratch, commit }) => {
      const inIndex = onIndex(git, indexFile);
      const problems = await indexSnapshotProblems(inIndex, byPath, dirty);
      if (problems === null) fail('GIT_FAILED', 'git diff-index failed on the locked index');
      if (problems.length > 0) {
        fail(
          'WRITE_FAILED',
          `the index of the delivery worktree changed after the residual proof at ${reportedPaths(problems).paths.join(', ')}; the release stopped before discarding anything`,
        );
      }
      let failure = null;
      try {
        for (const repoPath of absent) {
          const descriptor = await confirmSource(repoPath);
          const held = await capture(repoPath, descriptor);
          await discard(repoPath, held, async () => {
            if (staged.has(repoPath)) {
              await runOrFail(inIndex, RM_CACHED, { stdin: pathspecInput([repoPath]) });
              unstaged.push(repoPath);
            }
          });
          if (held !== 'absent' && held !== 'directory') {
            await removeEmptiedParents(io, root, repoPath);
          }
          restored.push(repoPath);
        }
        for (const repoPath of trackedOrder) {
          const descriptor = await confirmSource(repoPath);
          await assertRestoreDeletesNothingUnproven(io, root, repoPath, nothingProven);
          const held = await capture(repoPath, descriptor);
          await discard(repoPath, held, async () => {
            await runOrFail(inIndex, RESTORE_STAGED, { stdin: pathspecInput([repoPath]) });
            if (held === 'directory') await removeEmptyTree(io, root, repoPath);
            await runOrFail(inIndex, ['checkout-index', '-u', '-z', '--stdin'], {
              stdin: pathspecInput([repoPath]),
            });
          });
          restored.push(repoPath);
        }
      } catch (error) {
        failure = error;
      }
      // What was taken is preserved and the index written, also after a failure, so the index
      // matches what the worktree holds and every taken byte stays recoverable; the quarantine
      // drops only the entries anchored here.
      let anchored = preserved.length === 0;
      try {
        if (!anchored) {
          await preserveTree(git, scratch('preserved'), preserved, preserveRef);
          anchored = true;
        }
      } catch (error) {
        failure ??= error;
      }
      try {
        await commit();
        indexWritten = true;
      } catch (error) {
        failure ??= error;
      }
      if (anchored) {
        try {
          await quarantine.clear(preserved.map((entry) => entry.held));
        } catch (error) {
          quarantine.keep();
          failure ??= error;
        }
      } else quarantine.keep();
      if (quarantine.kept) notes.push(`the quarantine ${quarantine.directory} is kept`);
      if (failure) throw failure;
    });
  } catch (error) {
    throw partialRestoreError(error, restored, indexWritten ? unstaged : [], notes);
  }
  return [...residual.dirty].sort();
}

// Unstages exactly the hook-staged `group` (a ledger group the resume proved staged by path, blob
// and mode: `stagedGroupState` matches) in the worktree `git(args, {stdin, indexFile})` runs in,
// on one locked index snapshot (`withLockedIndex`). The snapshot must still stage exactly that
// group and nothing else, so an entry staged since the proof (at another path, or at a parent of
// an endpoint or below it, which restoring the endpoint would drop) refuses with WRITE_FAILED and
// the index unchanged. Every endpoint then gets HEAD's entry in the copy, which must then hold
// HEAD's tree, and the copy replaces the index. The working tree is never touched. `fs` overrides
// any of NODE_FS. Returns the unstaged paths (sorted).
export async function unstageGroup({ git, fs, group }) {
  const io = { ...NODE_FS, ...fs };
  const repoPaths = group.endpoints.map((endpoint) => endpoint.path).sort();
  await withLockedIndex(git, io, async ({ indexFile, commit }) => {
    const inIndex = onIndex(git, indexFile);
    const staged = await stagedGroupState(inIndex, group);
    if (staged === null) fail('GIT_FAILED', 'git diff-index failed on the locked index');
    if (staged.clean || !staged.matches) {
      fail(
        'WRITE_FAILED',
        `the index of the delivery worktree no longer stages exactly the next group (staged: ${reportedPaths(staged.paths).paths.join(', ') || 'none'}); nothing was unstaged`,
      );
    }
    await runOrFail(inIndex, RESTORE_STAGED, { stdin: pathspecInput(repoPaths) });
    const after = await stagedGroupState(inIndex, null);
    if (after === null || !after.clean) {
      fail(
        'GIT_FAILED',
        'unstaging the hook-staged group left staged entries; nothing was unstaged',
      );
    }
    await commit();
  });
  return repoPaths;
}

// The first MAX_REPORTED_PATHS of `paths` with their count, for a refusal.
export function reportedPaths(paths) {
  return { paths: paths.slice(0, MAX_REPORTED_PATHS), count: paths.length };
}
