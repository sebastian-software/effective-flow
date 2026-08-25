import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  rmdir,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const DELIVERY_SELECTION_VERSION = 1;

export const DELIVERY_SELECTION_OPERATIONS = Object.freeze([
  'inventory',
  'bind-manifest',
  'verify-source',
  'transfer',
  'reconcile',
]);

export const DELIVERY_SELECTION_ERROR_CODES = Object.freeze([
  'INVALID_PAYLOAD',
  'INVALID_PATH',
  'IGNORED_PATH',
  'UNSUPPORTED_PATH',
  'SOURCE_DRIFT',
  'UNSAFE_DELIVERY_CHECKOUT',
  'TRANSFER_CONFLICT',
  'RECONCILIATION_FAILED',
  'COMMAND_FAILED',
]);

const EXIT_CODES = Object.freeze({
  INVALID_PAYLOAD: 2,
  INVALID_PATH: 2,
  IGNORED_PATH: 2,
  UNSUPPORTED_PATH: 2,
  SOURCE_DRIFT: 3,
  TRANSFER_CONFLICT: 4,
  RECONCILIATION_FAILED: 5,
  COMMAND_FAILED: 6,
  UNSAFE_DELIVERY_CHECKOUT: 7,
});

const FILE_MODES = new Set(['100644', '100755', '120000']);
const ZERO_OID = /^0+$/;

export class DeliverySelectionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DeliverySelectionError';
    this.code = code;
    this.details = details;
    this.exitCode = EXIT_CODES[code] ?? 1;
  }
}

function fail(code, message, details = {}) {
  throw new DeliverySelectionError(code, message, details);
}

function requireObject(value, label = 'input') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_PAYLOAD', `${label} must be a JSON object`, { field: label });
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('INVALID_PAYLOAD', `${label} must be a non-empty string`, { field: label });
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    fail('INVALID_PAYLOAD', `${label} must be an array`, { field: label });
  }
  return value;
}

function exactKeys(value, expected, label) {
  requireObject(value, label);
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
    fail('INVALID_PAYLOAD', `${label} must contain exactly ${expected.join(', ')}`, {
      field: label,
      keys,
    });
  }
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(value ?? '', 'utf8');
}

function asText(value) {
  return asBuffer(value).toString('utf8');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function manifestDigest(manifest) {
  return sha256(Buffer.from(JSON.stringify(manifest), 'utf8'));
}

function normalizeAbsolute(value, label) {
  const declared = requireString(value, label);
  if (!path.isAbsolute(declared)) {
    fail('INVALID_PAYLOAD', `${label} must be an absolute path`, { field: label });
  }
  return path.resolve(declared);
}

async function canonicalDirectory(value, label) {
  const absolute = normalizeAbsolute(value, label);
  try {
    return await realpath(absolute);
  } catch (error) {
    fail('INVALID_PAYLOAD', `${label} must be an existing directory`, {
      field: label,
      code: error?.code,
    });
  }
}

export function validateLiteralPath(value, label = 'path') {
  const candidate = requireString(value, label);
  if (
    candidate.includes('\0') ||
    candidate.includes('\\') ||
    candidate.startsWith('/') ||
    /^[A-Za-z]:/.test(candidate) ||
    candidate.startsWith(':') ||
    /[*?[]/.test(candidate) ||
    candidate.endsWith('/') ||
    path.posix.normalize(candidate) !== candidate ||
    candidate.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    fail('INVALID_PATH', `${label} must be a lexical repository-relative literal path`, {
      field: label,
      path: candidate,
    });
  }
  return candidate;
}

function literalPathspec(repoPath) {
  return `:(literal)${validateLiteralPath(repoPath)}`;
}

function splitFixedFields(record, count) {
  const fields = [];
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    const separator = record.indexOf(' ', offset);
    if (separator === -1) return null;
    fields.push(record.slice(offset, separator));
    offset = separator + 1;
  }
  fields.push(record.slice(offset));
  return fields;
}

export function parsePorcelainV2Z(value) {
  const records = asText(value).split('\0');
  if (records.at(-1) === '') records.pop();
  const entries = [];
  const ignored = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.startsWith('# ')) continue;
    if (record.startsWith('? ')) {
      entries.push({
        path: validateLiteralPath(record.slice(2), 'status path'),
        kind: 'untracked',
        indexStatus: '?',
        worktreeStatus: '?',
        staged: false,
        unstaged: true,
        untracked: true,
        deleted: false,
        renamed: false,
        partiallyStaged: false,
      });
      continue;
    }
    if (record.startsWith('! ')) {
      const ignoredPath = record.slice(2);
      validateLiteralPath(
        ignoredPath.endsWith('/') ? ignoredPath.slice(0, -1) : ignoredPath,
        'ignored path',
      );
      ignored.push(ignoredPath);
      continue;
    }
    if (record.startsWith('u ')) {
      const fields = splitFixedFields(record, 10);
      fail('UNSUPPORTED_PATH', 'unmerged paths cannot be selected for delivery', {
        path: fields?.at(-1),
      });
    }
    if (record.startsWith('1 ')) {
      const fields = splitFixedFields(record, 8);
      if (!fields || fields.length !== 9) {
        fail('COMMAND_FAILED', 'git returned an invalid ordinary status record');
      }
      const [, xy, sub, headMode, indexMode, worktreeMode, headOid, indexOid, repoPath] = fields;
      const indexStatus = xy[0];
      const worktreeStatus = xy[1];
      entries.push({
        path: validateLiteralPath(repoPath, 'status path'),
        kind: 'ordinary',
        indexStatus,
        worktreeStatus,
        staged: indexStatus !== '.',
        unstaged: worktreeStatus !== '.',
        untracked: false,
        deleted: indexStatus === 'D' || worktreeStatus === 'D',
        renamed: false,
        partiallyStaged: indexStatus !== '.' && worktreeStatus !== '.',
        submodule: sub,
        head: { mode: headMode, oid: ZERO_OID.test(headOid) ? null : headOid },
        index: { mode: indexMode, oid: ZERO_OID.test(indexOid) ? null : indexOid },
        worktreeMode,
      });
      continue;
    }
    if (record.startsWith('2 ')) {
      const fields = splitFixedFields(record, 9);
      const oldPath = records[index + 1];
      if (!fields || fields.length !== 10 || oldPath === undefined) {
        fail('COMMAND_FAILED', 'git returned an invalid rename status record');
      }
      index += 1;
      const [, xy, sub, headMode, indexMode, worktreeMode, headOid, indexOid, score, repoPath] =
        fields;
      const indexStatus = xy[0];
      const worktreeStatus = xy[1];
      entries.push({
        path: validateLiteralPath(repoPath, 'rename destination'),
        renameFrom: validateLiteralPath(oldPath, 'rename source'),
        kind: 'rename',
        indexStatus,
        worktreeStatus,
        staged: indexStatus !== '.',
        unstaged: worktreeStatus !== '.',
        untracked: false,
        deleted: false,
        renamed: true,
        partiallyStaged: indexStatus !== '.' && worktreeStatus !== '.',
        score,
        submodule: sub,
        head: { mode: headMode, oid: ZERO_OID.test(headOid) ? null : headOid },
        index: { mode: indexMode, oid: ZERO_OID.test(indexOid) ? null : indexOid },
        worktreeMode,
      });
      continue;
    }
    fail('COMMAND_FAILED', 'git returned an unknown porcelain-v2 status record', {
      recordType: record[0] ?? null,
    });
  }
  return { entries, ignored };
}

async function run(runner, call, allowedStatus = [0]) {
  if (typeof runner !== 'function') {
    fail('INVALID_PAYLOAD', 'operation requires an injected process runner');
  }
  const result = await runner(call);
  if (result?.error) {
    fail('COMMAND_FAILED', 'command could not be started', {
      executable: call.executable,
      args: call.args,
      code: result.error.code,
    });
  }
  if (!allowedStatus.includes(result?.status)) {
    fail('COMMAND_FAILED', 'command failed', {
      executable: call.executable,
      args: call.args,
      status: result?.status ?? null,
    });
  }
  return result;
}

async function git(runner, cwd, args, options = {}) {
  return await run(
    runner,
    {
      executable: 'git',
      args: ['-C', cwd, ...args],
      ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
    },
    options.allowedStatus ?? [0],
  );
}

async function gitText(runner, cwd, args, options = {}) {
  return asText(await git(runner, cwd, args, options).then((result) => result.stdout)).trim();
}

async function repositoryContext(root, runner) {
  const requestedRoot = await canonicalDirectory(root, 'root');
  const repositoryRoot = await canonicalDirectory(
    await gitText(runner, requestedRoot, ['rev-parse', '--show-toplevel']),
    'repository root',
  );
  if (repositoryRoot !== requestedRoot) {
    fail('INVALID_PAYLOAD', 'root must be the repository top level', {
      root: requestedRoot,
      repositoryRoot,
    });
  }
  const common = await gitText(runner, repositoryRoot, ['rev-parse', '--git-common-dir']);
  const repositoryIdentity = await realpath(path.resolve(repositoryRoot, common));
  const headOid = await gitText(runner, repositoryRoot, ['rev-parse', 'HEAD']);
  return { root: repositoryRoot, repositoryIdentity, headOid };
}

async function statusInventory(root, runner, includeIgnored = true) {
  const args = [
    'status',
    '--porcelain=v2',
    '-z',
    '--untracked-files=all',
    ...(includeIgnored ? ['--ignored=matching'] : []),
  ];
  const result = await git(runner, root, args);
  return parsePorcelainV2Z(result.stdout);
}

export async function inventoryRepository(input, options = {}) {
  requireObject(input);
  const context = await repositoryContext(input.root, options.runner);
  const inventory = await statusInventory(context.root, options.runner, true);
  return {
    version: DELIVERY_SELECTION_VERSION,
    repository: context,
    entries: inventory.entries,
    ignored: inventory.ignored,
  };
}

async function checkIgnored(root, repoPath, runner) {
  const result = await git(runner, root, ['check-ignore', '--no-index', '-q', '--', repoPath], {
    allowedStatus: [0, 1],
  });
  if (result.status === 0) {
    fail('IGNORED_PATH', 'ignored paths cannot be selected for delivery', { path: repoPath });
  }
}

function parseTreeEntry(value, expectedPath) {
  const records = asText(value).split('\0').filter(Boolean);
  if (records.length === 0) return { path: expectedPath, oid: null, mode: null };
  if (records.length !== 1) {
    fail('COMMAND_FAILED', 'git returned multiple entries for an exact tree path', {
      path: expectedPath,
    });
  }
  const record = records[0];
  const tab = record.indexOf('\t');
  const metadata = tab === -1 ? [] : record.slice(0, tab).split(' ');
  const repoPath = tab === -1 ? '' : record.slice(tab + 1);
  if (
    metadata.length === 3 &&
    (metadata[1] === 'tree' || repoPath !== expectedPath) &&
    (repoPath === expectedPath || expectedPath.startsWith(`${repoPath}/`))
  ) {
    return { path: expectedPath, oid: null, mode: null };
  }
  if (metadata.length !== 3 || metadata[1] !== 'blob' || repoPath !== expectedPath) {
    fail('COMMAND_FAILED', 'git returned an invalid tree entry', { path: expectedPath });
  }
  return { path: expectedPath, mode: metadata[0], oid: metadata[2] };
}

async function treeState(root, treeish, repoPath, runner) {
  const result = await git(runner, root, [
    'ls-tree',
    '-z',
    treeish,
    '--',
    literalPathspec(repoPath),
  ]);
  return parseTreeEntry(result.stdout, repoPath);
}

function parseIndexEntry(value, expectedPath) {
  const records = asText(value).split('\0').filter(Boolean);
  if (records.length === 0) return { path: expectedPath, oid: null, mode: null };
  const parsed = records.map((record) => {
    const tab = record.indexOf('\t');
    return {
      metadata: tab === -1 ? [] : record.slice(0, tab).split(' '),
      repoPath: tab === -1 ? '' : record.slice(tab + 1),
    };
  });
  const exact = parsed.filter(({ repoPath }) => repoPath === expectedPath);
  if (
    exact.length === 0 &&
    parsed.every(
      ({ repoPath }) =>
        repoPath.startsWith(`${expectedPath}/`) || expectedPath.startsWith(`${repoPath}/`),
    )
  ) {
    return { path: expectedPath, oid: null, mode: null };
  }
  if (exact.length !== 1) {
    fail('UNSUPPORTED_PATH', 'unmerged index entries cannot be selected for delivery', {
      path: expectedPath,
    });
  }
  const [{ metadata, repoPath }] = exact;
  if (metadata.length !== 3 || metadata[2] !== '0' || repoPath !== expectedPath) {
    fail('COMMAND_FAILED', 'git returned an invalid index entry', { path: expectedPath });
  }
  return { path: expectedPath, mode: metadata[0], oid: metadata[1] };
}

async function indexState(root, repoPath, runner) {
  const result = await git(runner, root, [
    'ls-files',
    '--stage',
    '-z',
    '--',
    literalPathspec(repoPath),
  ]);
  return parseIndexEntry(result.stdout, repoPath);
}

async function blobBytes(root, oid, runner) {
  if (oid === null) return null;
  return asBuffer((await git(runner, root, ['cat-file', 'blob', oid])).stdout);
}

async function safeLstat(absolutePath) {
  try {
    return await lstat(absolutePath);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw error;
  }
}

async function rejectSymlinkParents(root, repoPath) {
  const parts = repoPath.split('/');
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    const stats = await safeLstat(current);
    if (stats?.isSymbolicLink()) {
      fail('UNSUPPORTED_PATH', 'selected paths cannot traverse a symbolic-link directory', {
        path: repoPath,
      });
    }
  }
}

async function workingState(root, repoPath, trackedState, { directoryMeansAbsent = false } = {}) {
  await rejectSymlinkParents(root, repoPath);
  const absolutePath = path.join(root, ...repoPath.split('/'));
  const stats = await safeLstat(absolutePath);
  if (stats === null) return { path: repoPath, mode: null, bytes: null };
  if (stats.isDirectory()) {
    if (directoryMeansAbsent || (trackedState.oid !== null && FILE_MODES.has(trackedState.mode))) {
      return { path: repoPath, mode: null, bytes: null };
    }
    fail('UNSUPPORTED_PATH', 'directories cannot be selected for delivery', { path: repoPath });
  }
  if (stats.isSymbolicLink()) {
    if (trackedState.oid === null || trackedState.mode !== '120000') {
      fail('UNSUPPORTED_PATH', 'untracked symbolic links cannot be selected for delivery', {
        path: repoPath,
      });
    }
    return {
      path: repoPath,
      mode: '120000',
      bytes: Buffer.from(await readlink(absolutePath), 'utf8'),
    };
  }
  if (!stats.isFile()) {
    fail('UNSUPPORTED_PATH', 'only regular files and tracked symbolic links can be selected', {
      path: repoPath,
    });
  }
  return {
    path: repoPath,
    mode: stats.mode & 0o111 ? '100755' : '100644',
    bytes: await readFile(absolutePath),
  };
}

function selectedDescriptor(state) {
  if (state.mode === null) return { kind: 'tombstone', mode: null };
  if (!FILE_MODES.has(state.mode)) {
    fail('UNSUPPORTED_PATH', 'selected path has an unsupported Git mode', {
      path: state.path,
      mode: state.mode,
    });
  }
  return {
    kind: 'blob',
    mode: state.mode,
    digest: sha256(state.bytes),
    ...(state.oid === undefined || state.oid === null ? {} : { oid: state.oid }),
  };
}

function sameDescriptor(left, right) {
  if (left.kind !== right.kind || left.mode !== right.mode) return false;
  if (left.kind === 'tombstone') return true;
  return left.digest === right.digest;
}

async function selectedState(root, repoPath, origin, runner) {
  const index = await indexState(root, repoPath, runner);
  if (origin === 'staged') {
    return {
      ...index,
      bytes: await blobBytes(root, index.oid, runner),
    };
  }
  const head = await treeState(root, 'HEAD', repoPath, runner);
  return await workingState(root, repoPath, index.oid === null ? head : index);
}

function normalizeSelection(value) {
  const selection = requireArray(value, 'selection');
  if (selection.length === 0) {
    fail('INVALID_PAYLOAD', 'selection must contain at least one path');
  }
  const paths = new Set();
  return selection.map((candidate, index) => {
    exactKeys(candidate, ['path', 'state'], `selection[${index}]`);
    const repoPath = validateLiteralPath(candidate.path, `selection[${index}].path`);
    const state = candidate.state;
    if (!['staged', 'working'].includes(state)) {
      fail('INVALID_PAYLOAD', `selection[${index}].state must be staged or working`, {
        field: `selection[${index}].state`,
      });
    }
    if (paths.has(repoPath)) {
      fail('INVALID_PAYLOAD', 'selection contains a duplicate path', { path: repoPath });
    }
    paths.add(repoPath);
    return { path: repoPath, state };
  });
}

function inventoryByEndpoint(inventory) {
  const endpoints = new Map();
  for (const entry of inventory.entries) {
    endpoints.set(entry.path, entry);
    if (entry.renameFrom) endpoints.set(entry.renameFrom, entry);
  }
  return endpoints;
}

export async function bindSelectionManifest(input, options = {}) {
  requireObject(input);
  const source = await repositoryContext(input.sourceRoot, options.runner);
  const selection = normalizeSelection(input.selection);
  const inventory = await statusInventory(source.root, options.runner, true);
  const byEndpoint = inventoryByEndpoint(inventory);
  const claimedEndpoints = new Set();
  const entries = [];

  for (const selected of selection) {
    await checkIgnored(source.root, selected.path, options.runner);
    const status = byEndpoint.get(selected.path);
    if (!status) {
      fail('INVALID_PATH', 'selected path has no staged or working-tree change', {
        path: selected.path,
      });
    }
    if (selected.state === 'staged' && !status.staged) {
      fail('INVALID_PATH', 'selected path has no staged state', { path: selected.path });
    }
    if (selected.state === 'working' && !status.unstaged && !status.untracked) {
      fail('INVALID_PATH', 'selected path has no working-tree state', { path: selected.path });
    }
    const renameFrom = status.renameFrom ?? null;
    if (renameFrom !== null) await checkIgnored(source.root, renameFrom, options.runner);
    for (const endpoint of [selected.path, renameFrom].filter(Boolean)) {
      if (claimedEndpoints.has(endpoint)) {
        fail('INVALID_PAYLOAD', 'selection overlaps a previously selected rename endpoint', {
          path: endpoint,
        });
      }
      claimedEndpoints.add(endpoint);
    }
    const sourceFrom =
      renameFrom === null
        ? null
        : await treeState(source.root, source.headOid, renameFrom, options.runner);
    const sourceTo = await treeState(source.root, source.headOid, selected.path, options.runner);
    const selectedSnapshot = await selectedState(
      source.root,
      selected.path,
      selected.state,
      options.runner,
    );
    const descriptor = selectedDescriptor(selectedSnapshot);
    if (
      renameFrom === null &&
      sourceTo.mode === descriptor.mode &&
      sourceTo.oid !== null &&
      descriptor.kind === 'blob' &&
      sha256(await blobBytes(source.root, sourceTo.oid, options.runner)) === descriptor.digest
    ) {
      fail('INVALID_PATH', 'selected path has no meaningful diff from source HEAD', {
        path: selected.path,
      });
    }
    entries.push({
      path: selected.path,
      renameFrom,
      selectionOrigin: selected.state,
      inventory: {
        kind: status.kind,
        indexStatus: status.indexStatus,
        worktreeStatus: status.worktreeStatus,
        partiallyStaged: status.partiallyStaged,
      },
      sourceHead: { from: sourceFrom, to: sourceTo },
      selected: descriptor,
    });
  }

  return {
    version: DELIVERY_SELECTION_VERSION,
    source,
    entries,
  };
}

function validateTreeState(value, label, expectedPath) {
  exactKeys(value, ['path', 'oid', 'mode'], label);
  if (value.path !== expectedPath) {
    fail('INVALID_PAYLOAD', `${label}.path does not match its endpoint`, {
      field: `${label}.path`,
    });
  }
  if (value.oid === null || value.mode === null) {
    if (value.oid !== null || value.mode !== null) {
      fail('INVALID_PAYLOAD', `${label} must bind both oid and mode or neither`, { field: label });
    }
    return value;
  }
  if (typeof value.oid !== 'string' || !/^[0-9a-f]{40,64}$/.test(value.oid)) {
    fail('INVALID_PAYLOAD', `${label}.oid must be a lowercase Git object id`, {
      field: `${label}.oid`,
    });
  }
  if (!FILE_MODES.has(value.mode)) {
    fail('INVALID_PAYLOAD', `${label}.mode is unsupported`, { field: `${label}.mode` });
  }
  return value;
}

export function validateSelectionManifest(value) {
  exactKeys(value, ['version', 'source', 'entries'], 'manifest');
  if (value.version !== DELIVERY_SELECTION_VERSION) {
    fail('INVALID_PAYLOAD', `manifest.version must be ${DELIVERY_SELECTION_VERSION}`);
  }
  exactKeys(value.source, ['root', 'repositoryIdentity', 'headOid'], 'manifest.source');
  normalizeAbsolute(value.source.root, 'manifest.source.root');
  normalizeAbsolute(value.source.repositoryIdentity, 'manifest.source.repositoryIdentity');
  if (!/^[0-9a-f]{40,64}$/.test(value.source.headOid)) {
    fail('INVALID_PAYLOAD', 'manifest.source.headOid must be a lowercase Git object id');
  }
  const entries = requireArray(value.entries, 'manifest.entries');
  if (entries.length === 0) fail('INVALID_PAYLOAD', 'manifest.entries must not be empty');
  const endpoints = new Set();
  entries.forEach((entry, index) => {
    const label = `manifest.entries[${index}]`;
    exactKeys(
      entry,
      ['path', 'renameFrom', 'selectionOrigin', 'inventory', 'sourceHead', 'selected'],
      label,
    );
    const repoPath = validateLiteralPath(entry.path, `${label}.path`);
    const renameFrom =
      entry.renameFrom === null
        ? null
        : validateLiteralPath(entry.renameFrom, `${label}.renameFrom`);
    if (renameFrom === repoPath) {
      fail('INVALID_PAYLOAD', `${label}.renameFrom must differ from path`);
    }
    if (!['staged', 'working'].includes(entry.selectionOrigin)) {
      fail('INVALID_PAYLOAD', `${label}.selectionOrigin must be staged or working`);
    }
    exactKeys(
      entry.inventory,
      ['kind', 'indexStatus', 'worktreeStatus', 'partiallyStaged'],
      `${label}.inventory`,
    );
    if (typeof entry.inventory.partiallyStaged !== 'boolean') {
      fail('INVALID_PAYLOAD', `${label}.inventory.partiallyStaged must be boolean`);
    }
    exactKeys(entry.sourceHead, ['from', 'to'], `${label}.sourceHead`);
    if (renameFrom === null) {
      if (entry.sourceHead.from !== null) {
        fail('INVALID_PAYLOAD', `${label}.sourceHead.from must be null without a rename`);
      }
    } else {
      validateTreeState(entry.sourceHead.from, `${label}.sourceHead.from`, renameFrom);
    }
    validateTreeState(entry.sourceHead.to, `${label}.sourceHead.to`, repoPath);
    requireObject(entry.selected, `${label}.selected`);
    if (entry.selected.kind === 'tombstone') {
      exactKeys(entry.selected, ['kind', 'mode'], `${label}.selected`);
      if (entry.selected.mode !== null) {
        fail('INVALID_PAYLOAD', `${label}.selected.mode must be null for a tombstone`);
      }
    } else if (entry.selected.kind === 'blob') {
      const keys = Object.keys(entry.selected);
      if (
        !['kind', 'mode', 'digest', 'oid'].every((key) =>
          key === 'oid' ? true : keys.includes(key),
        ) ||
        keys.some((key) => !['kind', 'mode', 'digest', 'oid'].includes(key))
      ) {
        fail('INVALID_PAYLOAD', `${label}.selected has invalid fields`);
      }
      if (!FILE_MODES.has(entry.selected.mode)) {
        fail('INVALID_PAYLOAD', `${label}.selected.mode is unsupported`);
      }
      if (!/^[0-9a-f]{64}$/.test(entry.selected.digest)) {
        fail('INVALID_PAYLOAD', `${label}.selected.digest must be a SHA-256 digest`);
      }
      if (entry.selected.oid !== undefined && !/^[0-9a-f]{40,64}$/.test(entry.selected.oid)) {
        fail('INVALID_PAYLOAD', `${label}.selected.oid must be a lowercase Git object id`);
      }
    } else {
      fail('INVALID_PAYLOAD', `${label}.selected.kind must be blob or tombstone`);
    }
    for (const endpoint of [repoPath, renameFrom].filter(Boolean)) {
      if (endpoints.has(endpoint)) {
        fail('INVALID_PAYLOAD', 'manifest endpoints must be non-overlapping', { path: endpoint });
      }
      endpoints.add(endpoint);
    }
  });
  return value;
}

async function refreshSelectedSnapshot(manifestEntry, sourceRoot, runner) {
  const snapshot = await selectedState(
    sourceRoot,
    manifestEntry.path,
    manifestEntry.selectionOrigin,
    runner,
  );
  return { descriptor: selectedDescriptor(snapshot), bytes: snapshot.bytes };
}

export async function verifySourceManifest(input, options = {}) {
  requireObject(input);
  const manifest = validateSelectionManifest(input.manifest);
  const sourceRoot = normalizeAbsolute(input.sourceRoot ?? manifest.source.root, 'sourceRoot');
  const current = await repositoryContext(sourceRoot, options.runner);
  const drift = [];
  if (current.repositoryIdentity !== manifest.source.repositoryIdentity) {
    drift.push({ kind: 'repository', expected: manifest.source.repositoryIdentity });
  }
  if (current.root !== manifest.source.root) {
    drift.push({ kind: 'root', expected: manifest.source.root, actual: current.root });
  }
  if (current.headOid !== manifest.source.headOid) {
    drift.push({ kind: 'head', expected: manifest.source.headOid, actual: current.headOid });
  }
  for (const entry of manifest.entries) {
    await checkIgnored(sourceRoot, entry.path, options.runner);
    const refreshed = await refreshSelectedSnapshot(entry, sourceRoot, options.runner);
    if (!sameDescriptor(refreshed.descriptor, entry.selected)) {
      drift.push({
        kind: 'selected-state',
        path: entry.path,
        expected: entry.selected,
        actual: refreshed.descriptor,
      });
    }
    if (entry.renameFrom !== null) {
      const prior = await selectedState(
        sourceRoot,
        entry.renameFrom,
        entry.selectionOrigin,
        options.runner,
      );
      if (prior.mode !== null) {
        drift.push({ kind: 'rename-source', path: entry.renameFrom, expected: 'tombstone' });
      }
    }
  }
  return { exact: drift.length === 0, drift };
}

function statesEqual(left, right) {
  return left.oid === right.oid && left.mode === right.mode;
}

async function descriptorForTree(root, state, runner) {
  if (state.oid === null) return { kind: 'tombstone', mode: null };
  return {
    kind: 'blob',
    mode: state.mode,
    digest: sha256(await blobBytes(root, state.oid, runner)),
    oid: state.oid,
  };
}

function resolveMode(source, selected, refreshed, repoPath) {
  if (selected === source) return refreshed;
  if (refreshed === source || refreshed === selected) return selected;
  fail('TRANSFER_CONFLICT', 'selected and refreshed base modes changed differently', {
    path: repoPath,
    sourceMode: source,
    selectedMode: selected,
    refreshedMode: refreshed,
  });
}

function hasNul(buffer) {
  return buffer.includes(0);
}

async function mergeTextBuffers(base, current, selected, repoPath, runner) {
  if ([base, current, selected].some(hasNul)) {
    fail('TRANSFER_CONFLICT', 'binary changes cannot be merged automatically', { path: repoPath });
  }
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'effective-flow-delivery-selection-'));
  try {
    const currentPath = path.join(tempRoot, 'current');
    const basePath = path.join(tempRoot, 'base');
    const selectedPath = path.join(tempRoot, 'selected');
    await Promise.all([
      writeFile(currentPath, current),
      writeFile(basePath, base),
      writeFile(selectedPath, selected),
    ]);
    const result = await run(
      runner,
      {
        executable: 'git',
        args: ['merge-file', '-p', '--diff3', currentPath, basePath, selectedPath],
      },
      [0, 1],
    );
    if (result.status !== 0) {
      fail('TRANSFER_CONFLICT', 'text changes could not be merged without conflicts', {
        path: repoPath,
      });
    }
    return asBuffer(result.stdout);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function planOrdinaryEntry(entry, sourceRoot, deliveryRoot, runner) {
  const refreshed = await treeState(deliveryRoot, 'HEAD', entry.path, runner);
  const selectedSnapshot = await refreshSelectedSnapshot(entry, sourceRoot, runner);
  if (!sameDescriptor(selectedSnapshot.descriptor, entry.selected)) {
    fail('SOURCE_DRIFT', 'selected source state changed after manifest confirmation', {
      path: entry.path,
      expected: entry.selected,
      actual: selectedSnapshot.descriptor,
    });
  }
  const source = entry.sourceHead.to;
  const selected = entry.selected;
  const refreshedDescriptor = await descriptorForTree(deliveryRoot, refreshed, runner);
  if (statesEqual(source, refreshed)) {
    return {
      path: entry.path,
      renameFrom: null,
      action: selected.kind === 'tombstone' ? 'delete' : 'write',
      strategy: 'direct',
      mode: selected.mode,
      bytes: selectedSnapshot.bytes,
    };
  }
  if (sameDescriptor(selected, refreshedDescriptor)) {
    return {
      path: entry.path,
      renameFrom: null,
      action: 'unchanged',
      strategy: 'already-applied',
      mode: selected.mode,
      bytes: selectedSnapshot.bytes,
    };
  }
  if (source.oid === null) {
    fail('TRANSFER_CONFLICT', 'selected addition conflicts with a refreshed-base addition', {
      path: entry.path,
    });
  }
  if (selected.kind === 'tombstone') {
    if (refreshed.oid === null) {
      return {
        path: entry.path,
        renameFrom: null,
        action: 'unchanged',
        strategy: 'already-applied',
        mode: null,
        bytes: null,
      };
    }
    fail('TRANSFER_CONFLICT', 'selected deletion conflicts with a refreshed-base modification', {
      path: entry.path,
    });
  }
  if (refreshed.oid === null) {
    fail('TRANSFER_CONFLICT', 'selected modification conflicts with a refreshed-base deletion', {
      path: entry.path,
    });
  }
  if ([source.mode, selected.mode, refreshed.mode].includes('120000')) {
    fail(
      'TRANSFER_CONFLICT',
      'symbolic-link changes cannot be merged across refreshed-base drift',
      {
        path: entry.path,
      },
    );
  }
  const sourceBytes = await blobBytes(sourceRoot, source.oid, runner);
  const refreshedBytes = await blobBytes(deliveryRoot, refreshed.oid, runner);
  const merged = await mergeTextBuffers(
    sourceBytes,
    refreshedBytes,
    selectedSnapshot.bytes,
    entry.path,
    runner,
  );
  return {
    path: entry.path,
    renameFrom: null,
    action: 'write',
    strategy: 'three-way',
    mode: resolveMode(source.mode, selected.mode, refreshed.mode, entry.path),
    bytes: merged,
  };
}

async function planRenameEntry(entry, sourceRoot, deliveryRoot, runner) {
  const sourceFrom = entry.sourceHead.from;
  const sourceTo = entry.sourceHead.to;
  const refreshedFrom = await treeState(deliveryRoot, 'HEAD', entry.renameFrom, runner);
  const refreshedTo = await treeState(deliveryRoot, 'HEAD', entry.path, runner);
  const selectedSnapshot = await refreshSelectedSnapshot(entry, sourceRoot, runner);
  if (!sameDescriptor(selectedSnapshot.descriptor, entry.selected)) {
    fail('SOURCE_DRIFT', 'selected source rename changed after manifest confirmation', {
      path: entry.path,
      renameFrom: entry.renameFrom,
    });
  }
  if (!statesEqual(sourceFrom, refreshedFrom) || !statesEqual(sourceTo, refreshedTo)) {
    fail('TRANSFER_CONFLICT', 'rename endpoints changed on the refreshed base', {
      path: entry.path,
      renameFrom: entry.renameFrom,
    });
  }
  return {
    path: entry.path,
    renameFrom: entry.renameFrom,
    action: entry.selected.kind === 'tombstone' ? 'delete' : 'rename',
    strategy: 'direct',
    mode: entry.selected.mode,
    bytes: selectedSnapshot.bytes,
  };
}

function redactedAction(action) {
  return {
    path: action.path,
    renameFrom: action.renameFrom,
    action: action.action,
    strategy: action.strategy,
    mode: action.mode,
  };
}

async function normalizeReceipt(value, deliveryRoot) {
  exactKeys(value, ['repositoryIdentity', 'executionRoot', 'headOid'], 'deliveryReceipt');
  const receipt = {
    repositoryIdentity: await canonicalDirectory(
      value.repositoryIdentity,
      'deliveryReceipt.repositoryIdentity',
    ),
    executionRoot: await canonicalDirectory(value.executionRoot, 'deliveryReceipt.executionRoot'),
    headOid: requireString(value.headOid, 'deliveryReceipt.headOid'),
  };
  if (!/^[0-9a-f]{40,64}$/.test(receipt.headOid)) {
    fail('INVALID_PAYLOAD', 'deliveryReceipt.headOid must be a lowercase Git object id');
  }
  if (receipt.executionRoot !== deliveryRoot) {
    fail('UNSAFE_DELIVERY_CHECKOUT', 'delivery receipt does not name the requested delivery root', {
      expected: deliveryRoot,
      actual: receipt.executionRoot,
    });
  }
  return receipt;
}

async function verifyDeliveryCheckout(input, manifest, runner) {
  const deliveryRoot = await canonicalDirectory(input.deliveryRoot, 'deliveryRoot');
  const receipt = await normalizeReceipt(input.deliveryReceipt, deliveryRoot);
  const context = await repositoryContext(deliveryRoot, runner);
  if (
    context.repositoryIdentity !== receipt.repositoryIdentity ||
    context.repositoryIdentity !== manifest.source.repositoryIdentity
  ) {
    fail('UNSAFE_DELIVERY_CHECKOUT', 'delivery checkout belongs to a different repository', {
      expected: manifest.source.repositoryIdentity,
      actual: context.repositoryIdentity,
    });
  }
  if (context.headOid !== receipt.headOid) {
    fail('UNSAFE_DELIVERY_CHECKOUT', 'delivery checkout HEAD moved after receipt creation', {
      expected: receipt.headOid,
      actual: context.headOid,
    });
  }
  const inventory = await statusInventory(deliveryRoot, runner, false);
  if (inventory.entries.length !== 0) {
    fail('UNSAFE_DELIVERY_CHECKOUT', 'delivery checkout must be clean before transfer', {
      changedPaths: inventory.entries.flatMap((entry) =>
        entry.renameFrom ? [entry.renameFrom, entry.path] : [entry.path],
      ),
    });
  }
  return context;
}

async function buildTransferPlan(input, options = {}) {
  const manifest = validateSelectionManifest(input.manifest);
  const sourceRoot = normalizeAbsolute(input.sourceRoot ?? manifest.source.root, 'sourceRoot');
  const delivery = await verifyDeliveryCheckout(input, manifest, options.runner);
  const sourceVerification = await verifySourceManifest(
    { manifest, sourceRoot },
    { runner: options.runner },
  );
  if (!sourceVerification.exact) {
    fail('SOURCE_DRIFT', 'source checkout changed after manifest confirmation', {
      drift: sourceVerification.drift,
    });
  }
  const actions = [];
  for (const entry of manifest.entries) {
    actions.push(
      entry.renameFrom === null
        ? await planOrdinaryEntry(entry, sourceRoot, delivery.root, options.runner)
        : await planRenameEntry(entry, sourceRoot, delivery.root, options.runner),
    );
  }
  const topology = await validateTransferTopology(delivery.root, actions, options.runner);
  return { manifest, sourceRoot, delivery, actions, topology };
}

function pathDepth(repoPath) {
  return repoPath.split('/').length;
}

function deletionEndpoints(actions) {
  return new Set(
    actions.flatMap((action) =>
      action.action === 'unchanged'
        ? []
        : [
            ...(action.renameFrom === null ? [] : [action.renameFrom]),
            ...(action.action === 'delete' ? [action.path] : []),
          ],
    ),
  );
}

function writeActions(actions) {
  return actions.filter((action) => action.mode !== null && action.action !== 'unchanged');
}

async function treeDescendantPaths(root, repoPath, runner) {
  const result = await git(runner, root, [
    'ls-tree',
    '-r',
    '-z',
    'HEAD',
    '--',
    literalPathspec(repoPath),
  ]);
  return asText(result.stdout)
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const tab = record.indexOf('\t');
      const metadata = tab === -1 ? [] : record.slice(0, tab).split(' ');
      const candidate = tab === -1 ? '' : record.slice(tab + 1);
      if (metadata.length !== 3 || !['blob', 'commit'].includes(metadata[1])) {
        fail('COMMAND_FAILED', 'git returned an invalid recursive tree entry', {
          path: repoPath,
        });
      }
      return candidate;
    })
    .filter((candidate) => candidate.startsWith(`${repoPath}/`));
}

async function filesystemTree(root, repoPath) {
  const absolutePath = path.join(root, ...repoPath.split('/'));
  const stats = await safeLstat(absolutePath);
  if (!stats?.isDirectory()) return { leaves: [], directories: [] };
  const leaves = [];
  const directories = [repoPath];
  const visit = async (directoryPath) => {
    const entries = await readdir(path.join(root, ...directoryPath.split('/')), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const childPath = `${directoryPath}/${entry.name}`;
      if (entry.isDirectory()) {
        directories.push(childPath);
        await visit(childPath);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        leaves.push(childPath);
      } else {
        fail('TRANSFER_CONFLICT', 'delivery directory contains an unsupported filesystem entry', {
          path: childPath,
        });
      }
    }
  };
  await visit(repoPath);
  return { leaves, directories };
}

async function validateTransferTopology(root, actions, runner) {
  const deletions = deletionEndpoints(actions);
  const directoryRemovals = new Set();
  for (const action of actions) {
    if (action.action !== 'unchanged' || action.mode !== null) continue;
    const stats = await safeLstat(path.join(root, ...action.path.split('/')));
    if (stats !== null && !stats.isDirectory()) {
      fail(
        'TRANSFER_CONFLICT',
        'already-applied tombstone is occupied by an unselected filesystem path',
        { path: action.path },
      );
    }
  }
  for (const action of writeActions(actions)) {
    await checkIgnored(root, action.path, runner);
    const parts = action.path.split('/');
    for (let index = 1; index < parts.length; index += 1) {
      const ancestor = parts.slice(0, index).join('/');
      const state = await treeState(root, 'HEAD', ancestor, runner);
      if (state.oid !== null && !deletions.has(ancestor)) {
        fail('TRANSFER_CONFLICT', 'selected write is blocked by an undeleted file ancestor', {
          path: action.path,
          ancestor,
        });
      }
    }
    const descendants = await treeDescendantPaths(root, action.path, runner);
    const undeleted = descendants.filter((candidate) => !deletions.has(candidate));
    if (undeleted.length !== 0) {
      fail('TRANSFER_CONFLICT', 'selected write would replace undeleted refreshed-base paths', {
        path: action.path,
        undeleted,
      });
    }
    const filesystem = await filesystemTree(root, action.path);
    const unselectedLeaves = filesystem.leaves.filter((candidate) => !deletions.has(candidate));
    if (unselectedLeaves.length !== 0) {
      fail('TRANSFER_CONFLICT', 'selected write would replace unselected filesystem paths', {
        path: action.path,
        unselected: unselectedLeaves,
      });
    }
    if (filesystem.directories.length !== 0 && descendants.length === 0) {
      fail('TRANSFER_CONFLICT', 'selected write would replace an unowned empty directory', {
        path: action.path,
      });
    }
    for (const directory of filesystem.directories) directoryRemovals.add(directory);
  }
  return {
    deletions: [...deletions].sort((left, right) => pathDepth(right) - pathDepth(left)),
    directoryRemovals: [...directoryRemovals].sort(
      (left, right) => pathDepth(right) - pathDepth(left),
    ),
  };
}

async function removePath(root, repoPath) {
  await rejectSymlinkParents(root, repoPath);
  const absolutePath = path.join(root, ...repoPath.split('/'));
  const stats = await safeLstat(absolutePath);
  if (stats === null || stats.isDirectory()) return;
  await rm(absolutePath, { force: true });
}

async function writeSelectedPath(root, action) {
  await rejectSymlinkParents(root, action.path);
  const absolutePath = path.join(root, ...action.path.split('/'));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await rm(absolutePath, { force: true });
  if (action.mode === '120000') {
    await symlink(action.bytes.toString('utf8'), absolutePath);
    return;
  }
  await writeFile(absolutePath, action.bytes);
  await chmod(absolutePath, action.mode === '100755' ? 0o755 : 0o644);
}

async function applyActions(root, actions, topology) {
  for (const repoPath of topology.deletions) await removePath(root, repoPath);
  for (const repoPath of topology.directoryRemovals) {
    await rmdir(path.join(root, ...repoPath.split('/')));
  }
  for (const action of writeActions(actions).sort(
    (left, right) => pathDepth(left.path) - pathDepth(right.path),
  )) {
    await writeSelectedPath(root, action);
  }
}

function expectedEndpoints(manifest, actions) {
  const endpoints = new Map();
  for (let index = 0; index < manifest.entries.length; index += 1) {
    const entry = manifest.entries[index];
    const action = actions?.[index];
    const selected =
      action === undefined
        ? entry.selected
        : action.mode === null
          ? { kind: 'tombstone', mode: null }
          : { kind: 'blob', mode: action.mode, digest: sha256(action.bytes) };
    endpoints.set(entry.path, selected);
    if (entry.renameFrom !== null)
      endpoints.set(entry.renameFrom, { kind: 'tombstone', mode: null });
  }
  return endpoints;
}

async function actualWorkingDescriptor(root, repoPath, runner) {
  const tracked = await treeState(root, 'HEAD', repoPath, runner);
  const actual = await workingState(root, repoPath, tracked, { directoryMeansAbsent: true });
  return selectedDescriptor(actual);
}

export async function reconcileDelivery(input, options = {}) {
  requireObject(input);
  const manifest = validateSelectionManifest(input.manifest);
  const deliveryRoot = await canonicalDirectory(input.deliveryRoot, 'deliveryRoot');
  const context = await repositoryContext(deliveryRoot, options.runner);
  if (context.repositoryIdentity !== manifest.source.repositoryIdentity) {
    fail('UNSAFE_DELIVERY_CHECKOUT', 'delivery checkout belongs to a different repository');
  }
  const sourceRoot = normalizeAbsolute(input.sourceRoot ?? manifest.source.root, 'sourceRoot');
  const source = await verifySourceManifest({ manifest, sourceRoot }, { runner: options.runner });
  const actions =
    options.actions ??
    (await Promise.all(
      manifest.entries.map((entry) =>
        entry.renameFrom === null
          ? planOrdinaryEntry(entry, sourceRoot, deliveryRoot, options.runner)
          : planRenameEntry(entry, sourceRoot, deliveryRoot, options.runner),
      ),
    ));
  const inventory = await statusInventory(deliveryRoot, options.runner, false);
  const actualPaths = new Set(
    inventory.entries.flatMap((entry) =>
      entry.renameFrom ? [entry.renameFrom, entry.path] : [entry.path],
    ),
  );
  const expected = expectedEndpoints(manifest, actions);
  const missing = [];
  const extra = [...actualPaths].filter((repoPath) => !expected.has(repoPath)).sort();
  const content = [];
  const mode = [];
  for (const [repoPath, descriptor] of expected) {
    const actual = await actualWorkingDescriptor(deliveryRoot, repoPath, options.runner);
    if (actual.kind !== descriptor.kind || actual.digest !== descriptor.digest) {
      if (!actualPaths.has(repoPath)) missing.push(repoPath);
      content.push({ path: repoPath, expected: descriptor.kind, actual: actual.kind });
    } else if (actual.mode !== descriptor.mode) {
      mode.push({ path: repoPath, expected: descriptor.mode, actual: actual.mode });
    }
  }
  return {
    exact:
      missing.length === 0 &&
      extra.length === 0 &&
      content.length === 0 &&
      mode.length === 0 &&
      source.exact,
    mismatches: { missing: missing.sort(), extra, content, mode, sourceDrift: source.drift },
  };
}

export async function transferSelection(input, options = {}) {
  requireObject(input);
  const plan = await buildTransferPlan(input, options);
  const preview = {
    manifestDigest: manifestDigest(plan.manifest),
    sourceHeadOid: plan.manifest.source.headOid,
    deliveryHeadOid: plan.delivery.headOid,
    entryCount: plan.manifest.entries.length,
    actions: plan.actions.map(redactedAction),
  };
  if (options.apply !== true) return { ...preview, applied: false };
  await applyActions(plan.delivery.root, plan.actions, plan.topology);
  const reconciliation = await reconcileDelivery(
    {
      manifest: plan.manifest,
      sourceRoot: plan.sourceRoot,
      deliveryRoot: plan.delivery.root,
    },
    { runner: options.runner, actions: plan.actions },
  );
  if (!reconciliation.exact) {
    fail('RECONCILIATION_FAILED', 'delivery checkout does not exactly match the manifest', {
      mismatches: reconciliation.mismatches,
      mutationMayHaveSucceeded: true,
    });
  }
  return { ...preview, applied: true, reconciliation };
}

export async function executeOperation(operation, input = {}, options = {}) {
  try {
    if (!DELIVERY_SELECTION_OPERATIONS.includes(operation)) {
      fail('INVALID_PAYLOAD', `unknown operation: ${operation}`, { operation });
    }
    let data;
    if (operation === 'inventory') data = await inventoryRepository(input, options);
    else if (operation === 'bind-manifest') data = await bindSelectionManifest(input, options);
    else if (operation === 'verify-source') data = await verifySourceManifest(input, options);
    else if (operation === 'transfer') data = await transferSelection(input, options);
    else data = await reconcileDelivery(input, options);
    const dryRun = operation === 'transfer' && options.apply !== true;
    return { ok: true, operation, data, dryRun };
  } catch (error) {
    return errorEnvelope(operation, error, operation === 'transfer' && options.apply !== true);
  }
}

function redactDetails(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return '[redacted bytes]';
  if (Array.isArray(value)) return value.map(redactDetails);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        /content|bytes|secret|token|password/i.test(key) ? '[redacted]' : redactDetails(nested),
      ]),
    );
  }
  return value;
}

export function errorEnvelope(operation, error, dryRun = false) {
  const normalized =
    error instanceof DeliverySelectionError
      ? error
      : new DeliverySelectionError(
          'COMMAND_FAILED',
          error?.message ?? 'unexpected delivery-selection failure',
        );
  return {
    ok: false,
    operation: operation ?? null,
    data: null,
    dryRun,
    error: {
      code: normalized.code,
      message: normalized.message,
      details: redactDetails(normalized.details),
      exitCode: normalized.exitCode,
    },
  };
}
