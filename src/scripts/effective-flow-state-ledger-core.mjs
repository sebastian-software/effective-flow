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

import { readdir as fsReaddir } from 'node:fs/promises';
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

async function runOrFail(git, args, stdin) {
  const result = await git(args, stdin === undefined ? {} : { stdin });
  if (!gitOk(result)) {
    const command = args.find((arg) => !arg.startsWith('-'));
    fail(
      'GIT_FAILED',
      `git ${command} failed: ${result?.error?.message ?? errorDetail(result?.stderr)}`,
    );
  }
  return result;
}

// Removes one residual file absent from HEAD below `root` through `fs` (`lstat`, `unlink`), never
// through a symbolic-link parent and never a directory; an already missing path is left alone.
// Returns whether it was removed.
async function removeResidualFile(fs, root, repoPath) {
  const parts = repoPath.split('/');
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    let info;
    try {
      info = await fs.lstat(current);
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
    if (info.isSymbolicLink() || !info.isDirectory()) {
      fail('UNSAFE_TARGET', `${repoPath} has a parent that is not a real directory`);
    }
  }
  const target = path.join(root, ...parts);
  let info;
  try {
    info = await fs.lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  if (info.isDirectory()) fail('UNSAFE_TARGET', `${repoPath} is a directory`);
  await fs.unlink(target);
  return true;
}

async function lstatOrNull(fs, target) {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

// Fails with UNSAFE_TARGET when restoring the tracked residual path `repoPath` below `root` would
// delete content no proof covers. `git restore` replaces a directory standing at the path and a
// non-directory standing at one of its parents together with everything below them, while the
// residual proofs count such a directory as the path's tombstone and never see its ignored
// descendants. A parent or descendant that is not a directory passes only when `proven` holds its
// repository path; a directory tree holding nothing but directories passes. `fs` provides `lstat`
// and optionally `readdir`.
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
  const readdir = fs.readdir ?? fsReaddir;
  const pending = [repoPath];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const name of await readdir(path.join(root, ...directory.split('/')))) {
      const entry = `${directory}/${name}`;
      const entryInfo = await lstatOrNull(fs, path.join(root, ...entry.split('/')));
      if (entryInfo === null) continue;
      if (entryInfo.isDirectory()) pending.push(entry);
      else if (!proven.has(entry)) refuse(entry);
    }
  }
}

// Removes the directories below `root` that the removal of `repoPath` left empty, deepest first,
// through `fs.rmdir`; stops at the first directory that is not empty.
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

// The error of a restore that stopped part-way: the code of `error` (WRITE_FAILED for one that is
// not the helper's), its message, the residual paths this call had already restored and the
// index entries it had already removed (`git rm --cached`, which precedes the removal of their
// files), in the message and as `envelopeDetails.restored` and `envelopeDetails.unstaged`. An
// unstaged path whose file removal had not yet run keeps its file, untracked. The record is still
// unchanged; a retry of the release counts the restored paths as released (they hold HEAD's state
// again) and restores the rest.
function partialRestoreError(error, restored, unstaged) {
  const code = error instanceof RuntimeStateError ? error.code : 'WRITE_FAILED';
  const list = (paths) => (paths.length > 0 ? [...paths].sort().join(', ') : 'none');
  const wrapped = new StateError(
    code,
    `${error?.message ?? String(error)}; already restored: ${list(restored)}; already unstaged: ${list(unstaged)}; the record is unchanged`,
    { cause: error },
  );
  wrapped.envelopeDetails = { restored: [...restored].sort(), unstaged: [...unstaged].sort() };
  return wrapped;
}

// Restores exactly the dirty residual paths of `residual` (an `inspectResidual` result whose dirt
// is proven to be the ledger's residual) in the worktree at `root`: a path HEAD tracks is restored
// in index and working tree from HEAD; a path absent from HEAD is unstaged when the index holds it
// and its file removed, with the directories this left empty. Nothing else is touched. `git` runs
// in that worktree. Before each discard, `sourceRecheck(descriptor)` must confirm that the source
// still holds the selection covering the path, so the bytes about to be discarded are still there,
// and then, as the last read before the discard, `recheck(descriptor)` that the path still holds
// its descriptor (`descriptors`, the residual endpoints of the ledger) in working tree and index
// and, for a tracked path, that the index holds no entry at a parent of it or below it (by then the
// residual's own are unstaged, so `git restore` would drop a newer one): the source re-check reads
// Git in another checkout, so a working-tree edit or a newly staged entry made during those reads
// is seen by the delivery re-check after them, never discarded unseen. A path changed since its
// proof, or whose source changed or cannot be read, stops the restore with WRITE_FAILED before it
// is touched. A tracked path whose restore would delete content outside the residual (a directory
// standing at the path with any file below it, a non-directory parent; see
// `assertRestoreDeletesNothingUnproven`) stops it with UNSAFE_TARGET: once before the first
// discard, where the dirty residual paths absent from HEAD count as proven, and again for that
// path's own restore, between its source re-check and its delivery re-check, where nothing does.
// A restore that stops part-way names the paths it already restored and the index entries it
// already removed (`partialRestoreError`). `fs` provides `lstat`, `unlink`, `rmdir` and optionally
// `readdir`. Returns the restored paths (sorted).
export async function restoreResidual({
  git,
  fs,
  root,
  residual,
  descriptors,
  recheck,
  sourceRecheck,
}) {
  const byPath = new Map(descriptors.map((descriptor) => [descriptor.path, descriptor]));
  const tracked = new Set(residual.tracked);
  const staged = new Set(residual.staged);
  const absent = residual.dirty
    .filter((repoPath) => !tracked.has(repoPath))
    .sort()
    .reverse();
  const unstage = absent.filter((repoPath) => staged.has(repoPath));
  const restored = [];
  const unstaged = [];
  // The source first and the delivery checkout last: the delivery re-check is the last read before
  // the discard, and `beforeRecheck` (a read of the delivery working tree alone) runs before it.
  const confirm = async (repoPath, beforeRecheck = async () => {}) => {
    const changed = () =>
      fail(
        'WRITE_FAILED',
        `the residual path ${repoPath} changed after its proof (working tree or index); the release stopped before discarding it`,
      );
    const descriptor = byPath.get(repoPath);
    if (!descriptor) changed();
    if (!(await sourceRecheck(descriptor))) {
      fail(
        'WRITE_FAILED',
        `the source of the residual path ${repoPath} changed after its proof or cannot be read; the release stopped before discarding it`,
      );
    }
    await beforeRecheck();
    if (!(await recheck(descriptor))) changed();
  };
  const trackedOrder = [...tracked].sort();
  const proven = new Set(absent);
  const nothingProven = new Set();
  // Each discard is its own call right after its own re-check, never batched after later ones: a
  // change to an already re-checked path made while a later path is re-checked is never discarded.
  try {
    for (const repoPath of trackedOrder) {
      await assertRestoreDeletesNothingUnproven(fs, root, repoPath, proven);
    }
    for (const repoPath of unstage) {
      await confirm(repoPath);
      await runOrFail(
        git,
        [
          '--literal-pathspecs',
          'rm',
          '--cached',
          '-q',
          '--ignore-unmatch',
          '--pathspec-from-file=-',
          '--pathspec-file-nul',
        ],
        pathspecInput([repoPath]),
      );
      unstaged.push(repoPath);
    }
    for (const repoPath of absent) {
      await confirm(repoPath);
      if (await removeResidualFile(fs, root, repoPath)) {
        await removeEmptiedParents(fs, root, repoPath);
      }
      restored.push(repoPath);
    }
    for (const repoPath of trackedOrder) {
      await confirm(repoPath, () =>
        assertRestoreDeletesNothingUnproven(fs, root, repoPath, nothingProven),
      );
      await runOrFail(
        git,
        [
          '--literal-pathspecs',
          'restore',
          '--source=HEAD',
          '--staged',
          '--worktree',
          '--pathspec-from-file=-',
          '--pathspec-file-nul',
        ],
        pathspecInput([repoPath]),
      );
      restored.push(repoPath);
    }
  } catch (error) {
    throw partialRestoreError(error, restored, unstaged);
  }
  return [...residual.dirty].sort();
}

// The first MAX_REPORTED_PATHS of `paths` with their count, for a refusal.
export function reportedPaths(paths) {
  return { paths: paths.slice(0, MAX_REPORTED_PATHS), count: paths.length };
}
