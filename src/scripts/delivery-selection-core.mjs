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
import process from 'node:process';

export const DELIVERY_SELECTION_VERSION = 1;

export const DELIVERY_SELECTION_OPERATIONS = Object.freeze([
  'inventory',
  'bind-manifest',
  'verify-source',
  'transfer',
  'reconcile',
  'upstream-status',
  'fast-forward',
]);

// Operations that only preview their write unless the caller passes `apply: true`.
export const DELIVERY_SELECTION_DRY_RUN_OPERATIONS = Object.freeze(['transfer', 'fast-forward']);

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
      ...(options.env === undefined ? {} : { env: options.env }),
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
  const endpoints = {
    staged: new Map(),
    working: new Map(),
  };
  for (const entry of inventory.entries) {
    if (entry.staged) {
      if (entry.kind === 'rename' && !['R', 'C'].includes(entry.indexStatus)) {
        endpoints.staged.set(entry.renameFrom, {
          ...entry,
          path: entry.renameFrom,
          renameFrom: undefined,
          kind: 'ordinary',
          worktreeStatus: '.',
          unstaged: false,
          renamed: false,
          partiallyStaged: false,
        });
      } else {
        endpoints.staged.set(entry.path, entry);
      }
    }
    if (entry.unstaged || entry.untracked) endpoints.working.set(entry.path, entry);
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
    const status = byEndpoint[selected.state].get(selected.path);
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

// Non-interactive environment for the upstream fetch: a credential or host-key prompt must fail
// instead of hanging the delivery run. The SSH part is added by `nonInteractiveFetchEnv`, because
// it has to extend the user's own SSH command rather than replace it.
export const NON_INTERACTIVE_FETCH_ENV = Object.freeze({
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
});

// The fetch is the only upstream command that talks to the network; it is bounded so an
// unresponsive remote cannot hang the delivery run.
export const UPSTREAM_FETCH_TIMEOUT_MS = 60_000;

// Diagnostics copied from Git's stderr are trimmed and capped so a noisy remote cannot flood the
// machine envelope.
export const DIAGNOSTIC_MAX_LENGTH = 2000;

const SSH_BATCH_MODE = '-o BatchMode=yes';

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

// Mirrors Git's own SSH command precedence (`GIT_SSH_COMMAND`, then `core.sshCommand`, then
// `GIT_SSH`, then `ssh`) and appends `BatchMode=yes` to whichever command Git would run. A bare
// `GIT_SSH` program cannot take extra options, so it is left alone and only the prompt variables
// keep the fetch non-interactive.
export function nonInteractiveFetchEnv({ environment = {}, configuredSshCommand = null } = {}) {
  const env = { ...NON_INTERACTIVE_FETCH_ENV };
  const sshCommand =
    nonEmpty(environment.GIT_SSH_COMMAND) ??
    nonEmpty(configuredSshCommand) ??
    (nonEmpty(environment.GIT_SSH) === null ? 'ssh' : null);
  if (sshCommand !== null) env.GIT_SSH_COMMAND = `${sshCommand} ${SSH_BATCH_MODE}`;
  return env;
}

// Credentials embedded in a remote URL never reach the envelope.
export function diagnosticText(value) {
  const text = asText(value)
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, '$1***@')
    .trim();
  return text.length > DIAGNOSTIC_MAX_LENGTH ? text.slice(0, DIAGNOSTIC_MAX_LENGTH) : text;
}

// Hooks are repository code that could write into the source checkout; the upstream step runs
// every mutating Git command with them disabled.
const HOOKS_DISABLED = ['-c', 'core.hooksPath=/dev/null'];

const GITLINK_MODE = '160000';
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function requireObjectId(value, label) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    fail('INVALID_PAYLOAD', `${label} must be a lowercase Git object id`, { field: label });
  }
  return value;
}

// An object id Git printed itself; a malformed one is a command failure, not a payload error.
function gitObjectId(value, label) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    fail('COMMAND_FAILED', `git returned an invalid ${label}`, { field: label });
  }
  return value;
}

async function currentBranch(root, runner) {
  const result = await git(runner, root, ['symbolic-ref', '-q', 'HEAD'], {
    allowedStatus: [0, 1],
  });
  if (result.status !== 0) return null;
  const ref = asText(result.stdout).trim();
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : null;
}

async function gitConfigValue(root, key, runner) {
  const result = await git(runner, root, ['config', '--get', key], { allowedStatus: [0, 1] });
  if (result.status !== 0) return null;
  const value = asText(result.stdout).trim();
  return value === '' ? null : value;
}

async function resolveCommit(root, revision, runner) {
  const result = await git(runner, root, ['rev-parse', '--verify', '-q', `${revision}^{commit}`], {
    allowedStatus: [0, 1, 128],
  });
  if (result.status !== 0) return null;
  const oid = asText(result.stdout).trim();
  return OBJECT_ID.test(oid) ? oid : null;
}

async function trackingRef(root, branch, runner) {
  const result = await git(runner, root, [
    'for-each-ref',
    '--format=%(refname)%00%(upstream)%00%(upstream:short)',
    `refs/heads/${branch}`,
  ]);
  for (const line of asText(result.stdout).split('\n')) {
    const [refname, upstream, upstreamShort] = line.split('\0');
    if (refname === `refs/heads/${branch}`) {
      return upstream ? { ref: upstream, short: upstreamShort || upstream } : null;
    }
  }
  return null;
}

// A remote name or URL and a merge ref taken from Git configuration are only passed to `git fetch`
// when neither can be read as an option or as anything but one full ref name.
async function fetchableUpstream(root, remote, mergeRef, runner) {
  if (remote.startsWith('-') || /[\0-\x1f\x7f]/.test(remote)) return false;
  if (!mergeRef.startsWith('refs/') || /[:+*^\s\0-\x1f\x7f]/.test(mergeRef)) return false;
  const result = await git(runner, root, ['check-ref-format', mergeRef], {
    allowedStatus: [0, 1],
  });
  return result.status === 0;
}

function timedOut(result) {
  return result?.timedOut === true || result?.error?.code === 'ETIMEDOUT';
}

// Returns `{ok, error}`: a failed fetch never fails the status, it is reported with a short reason.
async function fetchUpstream(root, remote, mergeRef, runner, environment) {
  if (typeof runner !== 'function') {
    fail('INVALID_PAYLOAD', 'operation requires an injected process runner');
  }
  const env = nonInteractiveFetchEnv({
    environment,
    configuredSshCommand:
      nonEmpty(environment.GIT_SSH_COMMAND) === null
        ? await gitConfigValue(root, 'core.sshCommand', runner)
        : null,
  });
  const result = await runner({
    executable: 'git',
    args: ['-C', root, ...HOOKS_DISABLED, 'fetch', '--no-tags', '--quiet', '--', remote, mergeRef],
    env,
    timeout: UPSTREAM_FETCH_TIMEOUT_MS,
  });
  if (timedOut(result)) return { ok: false, error: 'timeout' };
  if (result?.error) {
    return {
      ok: false,
      error: diagnosticText(result.error.code ?? 'command could not be started'),
    };
  }
  if (result?.status !== 0) {
    return {
      ok: false,
      error: diagnosticText(result?.stderr) || `exit status ${result?.status ?? 'unknown'}`,
    };
  }
  return { ok: true, error: null };
}

function parseDiffTreeRaw(value) {
  const records = asText(value).split('\0');
  if (records.at(-1) === '') records.pop();
  const changes = [];
  for (let index = 0; index < records.length; index += 2) {
    const metadata = records[index];
    const repoPath = records[index + 1];
    if (!metadata?.startsWith(':') || repoPath === undefined) {
      fail('COMMAND_FAILED', 'git returned an invalid raw diff record');
    }
    const [oldMode, newMode] = metadata.slice(1).split(' ');
    changes.push({ path: repoPath, oldMode, newMode });
  }
  return changes;
}

// Every path that differs between the two commits, without rename detection so that both
// endpoints of an upstream rename count, plus the subset that is a gitlink on either side.
async function incomingChanges(root, fromOid, toOid, runner) {
  const result = await git(runner, root, [
    'diff-tree',
    '-r',
    '-z',
    '--no-renames',
    '--no-commit-id',
    '--ignore-submodules=none',
    fromOid,
    toOid,
  ]);
  const changes = parseDiffTreeRaw(result.stdout);
  return {
    paths: [...new Set(changes.map((change) => change.path))].sort(),
    gitlinks: [
      ...new Set(
        changes
          .filter((change) => change.oldMode === GITLINK_MODE || change.newMode === GITLINK_MODE)
          .map((change) => change.path),
      ),
    ].sort(),
  };
}

function stripDirectorySlash(repoPath) {
  return repoPath.endsWith('/') ? repoPath.slice(0, -1) : repoPath;
}

// Every staged, unstaged, untracked and ignored local path, rename sources included.
function localDirtyPaths(inventory) {
  return {
    dirty: [
      ...new Set(
        inventory.entries.flatMap((entry) =>
          entry.renameFrom ? [entry.renameFrom, entry.path] : [entry.path],
        ),
      ),
    ].sort(),
    ignored: [...new Set(inventory.ignored)].sort(),
  };
}

function pathsOverlap(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

export function computeOverlap(localPaths, incoming, { ignoreCase = false } = {}) {
  const fold = ignoreCase ? (value) => value.toLowerCase() : (value) => value;
  const incomingFolded = incoming.paths.map(fold);
  const overlapping = new Set(incoming.gitlinks);
  for (const localPath of localPaths) {
    const candidate = fold(stripDirectorySlash(localPath));
    if (incomingFolded.some((incomingPath) => pathsOverlap(candidate, incomingPath))) {
      overlapping.add(localPath);
    }
  }
  return [...overlapping].sort();
}

async function repositoryIgnoresCase(root, runner) {
  const result = await git(runner, root, ['config', '--bool', '--get', 'core.ignorecase'], {
    allowedStatus: [0, 1],
  });
  return result.status === 0 && asText(result.stdout).trim() === 'true';
}

async function overlapFor(root, fromOid, toOid, runner) {
  const incoming = await incomingChanges(root, fromOid, toOid, runner);
  const inventory = await statusInventory(root, runner, true);
  const local = localDirtyPaths(inventory);
  const ignoreCase = await repositoryIgnoresCase(root, runner);
  const overlappingPaths = computeOverlap([...local.dirty, ...local.ignored], incoming, {
    ignoreCase,
  });
  return { incoming, inventory, local, overlappingPaths, ignoreCase };
}

function idleFetch() {
  return { attempted: false, ok: null, stale: null, error: null, skipped: null };
}

function emptyUpstreamStatus(state, fields = {}) {
  return {
    state,
    branch: null,
    upstream: null,
    headOid: null,
    upstreamOid: null,
    mergeBaseOid: null,
    ahead: null,
    behind: null,
    incomingPaths: [],
    overlappingPaths: [],
    fetch: idleFetch(),
    ...fields,
  };
}

export async function upstreamStatus(input, options = {}) {
  requireObject(input);
  if (input.fetch !== undefined && typeof input.fetch !== 'boolean') {
    fail('INVALID_PAYLOAD', 'fetch must be a boolean', { field: 'fetch' });
  }
  const runner = options.runner;
  const context = await repositoryContext(input.root, runner);
  const root = context.root;
  const headOid = gitObjectId(context.headOid, 'HEAD');
  const branch = await currentBranch(root, runner);
  if (branch === null) return emptyUpstreamStatus('detached', { headOid });

  const remote = await gitConfigValue(root, `branch.${branch}.remote`, runner);
  const mergeRef = await gitConfigValue(root, `branch.${branch}.merge`, runner);
  if (remote === null || mergeRef === null) {
    return emptyUpstreamStatus('no-upstream', { branch, headOid });
  }

  const fetch = idleFetch();
  let fetchHeadOid = null;
  if (input.fetch === true && remote !== '.') {
    if (await fetchableUpstream(root, remote, mergeRef, runner)) {
      fetch.attempted = true;
      const outcome = await fetchUpstream(
        root,
        remote,
        mergeRef,
        runner,
        options.env ?? process.env,
      );
      fetch.ok = outcome.ok;
      fetch.error = outcome.error;
      if (fetch.ok) fetchHeadOid = await resolveCommit(root, 'FETCH_HEAD', runner);
    } else {
      // An option-like or malformed remote or merge ref is never fetched; the status still
      // classifies against whatever tracking ref Git already resolves.
      fetch.skipped = 'invalid-config';
    }
  }

  const tracking = await trackingRef(root, branch, runner);
  const upstreamOid = tracking === null ? null : await resolveCommit(root, tracking.ref, runner);
  if (fetch.ok) fetch.stale = fetchHeadOid === null || fetchHeadOid !== upstreamOid;
  if (upstreamOid === null) {
    return emptyUpstreamStatus('upstream-gone', {
      branch,
      upstream: tracking?.short ?? null,
      headOid,
      fetch,
    });
  }

  const counts = (
    await gitText(runner, root, [
      'rev-list',
      '--left-right',
      '--count',
      `${headOid}...${upstreamOid}`,
    ])
  ).split(/\s+/);
  const ahead = Number.parseInt(counts[0], 10);
  const behind = Number.parseInt(counts[1], 10);
  if (!Number.isInteger(ahead) || !Number.isInteger(behind)) {
    fail('COMMAND_FAILED', 'git returned invalid ahead/behind counts');
  }
  const mergeBaseResult = await git(runner, root, ['merge-base', headOid, upstreamOid], {
    allowedStatus: [0, 1],
  });
  const mergeBaseOid =
    mergeBaseResult.status === 0
      ? gitObjectId(asText(mergeBaseResult.stdout).trim(), 'merge base')
      : null;

  let incomingPaths = [];
  let overlappingPaths = [];
  if (behind > 0 && mergeBaseOid !== null) {
    const overlap = await overlapFor(root, mergeBaseOid, upstreamOid, runner);
    incomingPaths = overlap.incoming.paths;
    overlappingPaths = overlap.overlappingPaths;
  }

  let state;
  if (ahead === 0 && behind === 0) state = 'up-to-date';
  else if (behind === 0) state = 'ahead';
  else if (ahead > 0 || mergeBaseOid === null) state = 'diverged';
  else state = overlappingPaths.length === 0 ? 'behind' : 'behind-overlap';

  return {
    state,
    branch,
    upstream: tracking.short,
    headOid,
    upstreamOid,
    mergeBaseOid,
    ahead,
    behind,
    incomingPaths,
    overlappingPaths,
    fetch,
  };
}

function parentDirectory(repoPath) {
  const slash = repoPath.lastIndexOf('/');
  return slash === -1 ? '' : repoPath.slice(0, slash);
}

// Every directory a fast-forward can write into: the parent of each incoming path and all of its
// ancestors, the repository root (`''`) included.
function incomingDirectories(incomingPaths, fold) {
  const directories = new Set();
  for (const incomingPath of incomingPaths) {
    let current = parentDirectory(fold(incomingPath));
    while (!directories.has(current)) {
      directories.add(current);
      if (current === '') break;
      current = parentDirectory(current);
    }
  }
  return directories;
}

// A fast-forward only writes incoming paths and creates or removes their parent directories, so
// only local entries that live directly in one of those directories can be touched by it. Every
// other dirty, untracked or ignored entry (for example a dependency tree elsewhere) is out of scope
// and never read.
export function snapshotScope(local, incomingPaths, { ignoreCase = false } = {}) {
  const fold = ignoreCase ? (value) => value.toLowerCase() : (value) => value;
  const directories = incomingDirectories(incomingPaths, fold);
  const inScope = (repoPath) => directories.has(parentDirectory(fold(repoPath)));
  return {
    dirty: local.dirty.filter(inScope),
    ignored: [...new Set(local.ignored.map(stripDirectorySlash))].filter(inScope).sort(),
  };
}

function entryType(stats) {
  if (stats.isSymbolicLink()) return 'symlink';
  if (stats.isFile()) return 'file';
  if (stats.isDirectory()) return 'directory';
  return 'other';
}

// Dirty and untracked entries are compared by content and mode. Ignored entries are compared by
// the lstat metadata of the listed entry only, without descending into an ignored directory.
async function snapshotFilesystemEntry(root, repoPath, { metadataOnly }) {
  const absolutePath = path.join(root, ...repoPath.split('/'));
  const stats = await safeLstat(absolutePath);
  if (stats === null) return 'absent';
  if (metadataOnly) {
    return `stat:${entryType(stats)}:${stats.mode}:${stats.size}:${stats.mtimeMs}:${stats.ino}`;
  }
  if (stats.isSymbolicLink()) {
    return `symlink:${sha256(Buffer.from(await readlink(absolutePath), 'utf8'))}`;
  }
  if (stats.isFile()) {
    const mode = stats.mode & 0o111 ? '100755' : '100644';
    return `file:${mode}:${sha256(await readFile(absolutePath))}`;
  }
  if (stats.isDirectory()) return 'directory';
  return `other:${stats.mode}`;
}

async function indexSnapshot(root, repoPaths, runner) {
  const wanted = new Set(repoPaths);
  const result = await git(runner, root, ['ls-files', '--stage', '-z']);
  const entries = new Map(repoPaths.map((repoPath) => [repoPath, []]));
  for (const record of asText(result.stdout).split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t');
    if (tab === -1) fail('COMMAND_FAILED', 'git returned an invalid index entry');
    const repoPath = record.slice(tab + 1);
    if (wanted.has(repoPath)) entries.get(repoPath).push(record.slice(0, tab));
  }
  return new Map([...entries].map(([repoPath, stages]) => [repoPath, stages.sort().join('|')]));
}

// Index and working-tree state of every in-scope dirty and ignored path, captured before the merge
// and compared after it to prove the fast-forward left that local state untouched.
async function localStateSnapshot(root, scope, runner) {
  const worktree = new Map();
  for (const repoPath of scope.dirty) {
    await rejectSymlinkParents(root, repoPath);
    worktree.set(repoPath, await snapshotFilesystemEntry(root, repoPath, { metadataOnly: false }));
  }
  for (const repoPath of scope.ignored) {
    await rejectSymlinkParents(root, repoPath);
    worktree.set(repoPath, await snapshotFilesystemEntry(root, repoPath, { metadataOnly: true }));
  }
  const index = await indexSnapshot(root, [...scope.dirty, ...scope.ignored], runner);
  return { worktree, index };
}

function snapshotDifferences(before, after) {
  const differing = new Set();
  for (const kind of ['worktree', 'index']) {
    for (const [repoPath, state] of before[kind]) {
      if (after[kind].get(repoPath) !== state) differing.add(repoPath);
    }
    for (const repoPath of after[kind].keys()) {
      if (!before[kind].has(repoPath)) differing.add(repoPath);
    }
  }
  return [...differing].sort();
}

// Anything that fails before the merge runs cannot have changed the checkout. An unexpected
// exception (for example from the process runner) becomes a COMMAND_FAILED that says so.
function withNoMutation(error) {
  if (!(error instanceof DeliverySelectionError)) {
    return new DeliverySelectionError('COMMAND_FAILED', 'fast-forward precheck failed', {
      mutationMayHaveSucceeded: false,
      cause: error?.code ?? null,
    });
  }
  if (error.details?.mutationMayHaveSucceeded !== true) {
    error.details = { ...error.details, mutationMayHaveSucceeded: false };
  }
  return error;
}

async function fastForwardPrecheck(input, runner) {
  requireObject(input);
  const expectedBranch = requireString(input.expectedBranch, 'expectedBranch');
  const expectedHeadOid = requireObjectId(input.expectedHeadOid, 'expectedHeadOid');
  const expectedUpstreamOid = requireObjectId(input.expectedUpstreamOid, 'expectedUpstreamOid');
  const context = await repositoryContext(input.root, runner);
  const root = context.root;
  const branch = await currentBranch(root, runner);
  if (branch !== expectedBranch) {
    fail('SOURCE_DRIFT', 'source branch changed after the upstream status was read', {
      expected: expectedBranch,
      actual: branch,
    });
  }
  if (context.headOid !== expectedHeadOid) {
    fail('SOURCE_DRIFT', 'source HEAD changed after the upstream status was read', {
      expected: expectedHeadOid,
      actual: context.headOid,
    });
  }
  const upstreamOid = await resolveCommit(root, expectedUpstreamOid, runner);
  if (upstreamOid !== expectedUpstreamOid) {
    fail('SOURCE_DRIFT', 'expected upstream commit does not resolve to a commit', {
      expected: expectedUpstreamOid,
      actual: upstreamOid,
    });
  }
  const ancestor = await git(
    runner,
    root,
    ['merge-base', '--is-ancestor', context.headOid, expectedUpstreamOid],
    { allowedStatus: [0, 1] },
  );
  if (ancestor.status !== 0) {
    fail('SOURCE_DRIFT', 'source HEAD is not an ancestor of the expected upstream commit', {
      headOid: context.headOid,
      upstreamOid: expectedUpstreamOid,
    });
  }
  const overlap = await overlapFor(root, context.headOid, expectedUpstreamOid, runner);
  if (overlap.overlappingPaths.length !== 0) {
    fail('SOURCE_DRIFT', 'local paths overlap the incoming upstream change', {
      overlappingPaths: overlap.overlappingPaths,
    });
  }
  return { root, branch, headOid: context.headOid, upstreamOid: expectedUpstreamOid, overlap };
}

export async function fastForwardUpstream(input, options = {}) {
  const runner = options.runner;
  let precheck;
  let scope;
  let before;
  try {
    precheck = await fastForwardPrecheck(input, runner);
    if (options.apply === true) {
      scope = snapshotScope(precheck.overlap.local, precheck.overlap.incoming.paths, {
        ignoreCase: precheck.overlap.ignoreCase,
      });
      before = await localStateSnapshot(precheck.root, scope, runner);
    }
  } catch (error) {
    throw withNoMutation(error);
  }
  const preview = {
    branch: precheck.branch,
    fromOid: precheck.headOid,
    toOid: precheck.upstreamOid,
    incomingPaths: precheck.overlap.incoming.paths,
    hooksSkipped: true,
  };
  if (options.apply !== true) return { ...preview, applied: false };

  const { root } = precheck;
  const mergeResult = await Promise.resolve()
    .then(() =>
      runner({
        executable: 'git',
        args: [
          '-C',
          root,
          ...HOOKS_DISABLED,
          'merge',
          '--ff-only',
          '--no-overwrite-ignore',
          '--no-autostash',
          '--quiet',
          precheck.upstreamOid,
        ],
      }),
    )
    .catch((error) => ({ status: null, error }));

  let newHeadOid = null;
  let differingPaths = null;
  try {
    newHeadOid = gitObjectId(await gitText(runner, root, ['rev-parse', 'HEAD']), 'HEAD');
    const after = await localStateSnapshot(root, scope, runner);
    differingPaths = snapshotDifferences(before, after);
    const mergeSucceeded = !mergeResult?.error && mergeResult?.status === 0;
    if (!mergeSucceeded) {
      const inventoryAfter = await statusInventory(root, runner, true);
      const dirtyAfter = localDirtyPaths(inventoryAfter).dirty;
      const dirtyBefore = precheck.overlap.local.dirty;
      const untouched =
        newHeadOid === precheck.headOid &&
        differingPaths.length === 0 &&
        dirtyAfter.length === dirtyBefore.length &&
        dirtyAfter.every((repoPath, index) => repoPath === dirtyBefore[index]);
      fail('COMMAND_FAILED', 'git refused the fast-forward', {
        status: mergeResult?.status ?? null,
        code: mergeResult?.error?.code,
        stderr: diagnosticText(mergeResult?.stderr),
        mutationMayHaveSucceeded: !untouched,
        oldHeadOid: precheck.headOid,
        newHeadOid,
        differingPaths,
      });
    }
    const branchAfter = await currentBranch(root, runner);
    if (
      newHeadOid !== precheck.upstreamOid ||
      branchAfter !== precheck.branch ||
      differingPaths.length !== 0
    ) {
      fail('COMMAND_FAILED', 'fast-forward result does not match the expected source state', {
        mutationMayHaveSucceeded: true,
        oldHeadOid: precheck.headOid,
        newHeadOid,
        expectedHeadOid: precheck.upstreamOid,
        branch: branchAfter,
        differingPaths,
      });
    }
  } catch (error) {
    if (error instanceof DeliverySelectionError && 'mutationMayHaveSucceeded' in error.details) {
      throw error;
    }
    fail('COMMAND_FAILED', 'fast-forward outcome could not be verified', {
      mutationMayHaveSucceeded: true,
      oldHeadOid: precheck.headOid,
      newHeadOid,
      differingPaths,
      cause: error instanceof DeliverySelectionError ? error.code : (error?.code ?? null),
    });
  }
  return {
    ...preview,
    applied: true,
    newHeadOid,
    verifiedPathCount: before.worktree.size,
  };
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
    else if (operation === 'upstream-status') data = await upstreamStatus(input, options);
    else if (operation === 'fast-forward') data = await fastForwardUpstream(input, options);
    else data = await reconcileDelivery(input, options);
    return { ok: true, operation, data, dryRun: isDryRun(operation, options.apply) };
  } catch (error) {
    return errorEnvelope(operation, error, isDryRun(operation, options.apply));
  }
}

export function isDryRun(operation, apply) {
  return DELIVERY_SELECTION_DRY_RUN_OPERATIONS.includes(operation) && apply !== true;
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
