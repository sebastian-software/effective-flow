// Maintenance-only source projection. Never writes the source checkout or its index.
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  realpathSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  chmodSync,
  rmSync,
} from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import {
  PROTECTED_VALIDATION_PROTOCOL,
  WORKFLOW_PATH,
  TRANSPORT_ROOT,
  VALIDATION_HISTORY_DEPTH,
  validateMaterializationManifest,
  canonicalJSON,
  validationDigest,
} from '../src/scripts/protected-validation-protocol.mjs';

export const MATERIALIZATION_PATH = TRANSPORT_ROOT + '/materialization.json';
export const TRANSPORT_PATH = TRANSPORT_ROOT + '/transport.json';
const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};
export function safeRelative(path) {
  ensure(
    typeof path === 'string' &&
      path.length > 0 &&
      path.length <= 512 &&
      !path.includes('\\') &&
      !/[\0\r\n]/.test(path),
    'unsafe projection path',
  );
  ensure(
    !path.startsWith('/') && path.split('/').every((p) => p && p !== '.' && p !== '..'),
    'unsafe projection path',
  );
  ensure(
    !path
      .split('/')
      .some((p) =>
        ['.git', '.effective-flow', 'node_modules', '.protected-validation'].includes(p),
      ),
    'private or transport path in source',
  );
  return path;
}
export function physicalFile(root, path) {
  safeRelative(path);
  let current = realpathSync(root);
  for (const component of path.split('/')) {
    current = resolve(current, component);
    ensure(!lstatSync(current).isSymbolicLink(), 'symlink in projection');
  }
  const stat = lstatSync(current);
  ensure(
    stat.isFile() && stat.nlink === 1 && (stat.mode & 0o7000) === 0,
    'unsupported projected file identity',
  );
  ensure(realpathSync(current).startsWith(realpathSync(root) + sep), 'escaped projected file');
  return {
    path: current,
    mode: stat.mode & 0o111 ? '100755' : '100644',
    bytes: readFileSync(current),
  };
}
const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
// Copy objects only: no refs, config, credentials, index or unrelated object-store contents.
const historyGit = (cwd, args, options = {}) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
    ...options,
  });
export function verifyValidationHistory(root, sourceHead) {
  ensure(/^[a-f0-9]{40}$/.test(sourceHead), 'exact source history commit required');
  ensure(
    historyGit(root, ['rev-parse', '--is-shallow-repository']).trim() === 'false',
    'shallow validation history is not permitted',
  );
  const grafts = historyGit(root, ['rev-parse', '--git-path', 'info/grafts']).trim();
  ensure(!existsSync(resolve(root, grafts)), 'grafted validation history is not permitted');
  ensure(
    historyGit(root, ['rev-parse', sourceHead + '^{commit}']).trim() === sourceHead,
    'source history commit differs',
  );
  const count = Number(historyGit(root, ['rev-list', '--count', sourceHead]).trim());
  ensure(
    Number.isSafeInteger(count) && count > 0 && count + 1 <= VALIDATION_HISTORY_DEPTH,
    'validation history exceeds fixed checkout depth',
  );
  const objects = historyGit(root, ['rev-list', '--objects', '--missing=print', sourceHead]);
  ensure(
    !objects.split('\n').some((line) => line.startsWith('?')),
    'incomplete validation history',
  );
  return count;
}
export function importValidationHistory({ source, destination, sourceHead }) {
  const count = verifyValidationHistory(source, sourceHead);
  const pack = historyGit(source, ['pack-objects', '--revs', '--stdout'], {
    input: sourceHead + '\n',
    encoding: null,
  });
  historyGit(destination, ['index-pack', '--stdin', '--strict'], { input: pack });
  ensure(
    verifyValidationHistory(destination, sourceHead) === count,
    'imported source history differs',
  );
  return { sourceHead, commitCount: count, packDigest: validationDigest(pack) };
}
export function validationCommitParent(root, commit) {
  ensure(/^[a-f0-9]{40}$/.test(commit), 'exact synthetic commit required');
  const parents = historyGit(root, ['rev-list', '--parents', '-n', '1', commit]).trim().split(' ');
  ensure(
    parents.length === 2 && parents[0] === commit,
    'synthetic validation commit must have one parent',
  );
  verifyValidationHistory(root, parents[1]);
  return parents[1];
}
export function sourceBasis(root) {
  root = realpathSync(root);
  ensure(
    realpathSync(git(root, 'rev-parse', '--show-toplevel')) === root,
    'projection root must be physical checkout',
  );
  const trackedPaths = git(root, 'ls-files', '-z', '--cached').split('\0').filter(Boolean);
  const untrackedPaths = git(root, 'ls-files', '-z', '--others', '--exclude-standard')
    .split('\0')
    .filter(Boolean);
  const entries = (names) =>
    [...new Set(names)].sort().map((path) => {
      safeRelative(path);
      if (!existsSync(resolve(root, path))) return [path, 'missing'];
      const file = physicalFile(root, path);
      return [path, file.mode, validationDigest(file.bytes)];
    });
  const tracked = entries(trackedPaths),
    untracked = entries(untrackedPaths);
  const staged = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: root });
  return {
    snapshot: {
      head: git(root, 'rev-parse', 'HEAD'),
      index: validationDigest(staged),
      workingTree: validationDigest(JSON.stringify(tracked)),
      untracked: validationDigest(JSON.stringify(untracked)),
    },
    branch: git(root, 'symbolic-ref', '--short', 'HEAD'),
    files: [...new Map([...tracked, ...untracked].map((e) => [e[0], e])).values()].sort((a, b) =>
      a[0].localeCompare(b[0], 'en'),
    ),
    trackedPaths,
  };
}
export function writeExclusive(path, bytes, mode = '100644') {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, { flag: 'wx', mode: mode === '100755' ? 0o755 : 0o644 });
  chmodSync(path, mode === '100755' ? 0o755 : 0o644);
}
export function verifyExecutionFile(root, entry) {
  ensure(['100644', '100755'].includes(entry.mode), 'unsupported projection mode');
  const file = physicalFile(root, entry.path);
  ensure(
    file.mode === entry.mode && validationDigest(file.bytes) === entry.digest,
    'source projection drift: ' + entry.path,
  );
  return file.bytes;
}
export function initializeRepository(root) {
  ensure(!existsSync(resolve(root, '.git')), 'exclusive temporary repository required');
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Protected validation');
  git(root, 'config', 'user.email', 'protected-validation@invalid.local');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'config', 'core.filemode', 'true');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'config', 'core.hooksPath', '/dev/null');
}
export function treeForFiles(root, entries, { transport = false } = {}) {
  const lines = entries
    .map((entry) => {
      const bytes =
        transport && entry.path.startsWith(TRANSPORT_ROOT + '/')
          ? transportFile(root, entry.path)
          : verifyExecutionFile(root, entry);
      ensure(validationDigest(bytes) === entry.digest, 'staged entry digest differs');
      const oid = execFileSync('git', ['hash-object', '-w', '--stdin'], {
        cwd: root,
        input: bytes,
        encoding: 'utf8',
      }).trim();
      return `${entry.mode} ${oid}\t${entry.path}\0`;
    })
    .join('');
  execFileSync('git', ['read-tree', '--empty'], { cwd: root });
  execFileSync('git', ['update-index', '-z', '--index-info'], { cwd: root, input: lines });
  return git(root, 'write-tree');
}
export function createTransport({ source, destination, manifest }) {
  ensure(!existsSync(destination), 'transport destination must be new');
  mkdirSync(destination, { recursive: true });
  initializeRepository(destination);
  const sourceHead = manifest.sourceSnapshot.head;
  ensure(
    git(source, 'rev-parse', 'HEAD') === sourceHead,
    'source history HEAD differs from manifest',
  );
  importValidationHistory({ source, destination, sourceHead });
  const files = manifest.files;
  ensure(
    files.some((e) => e.path === WORKFLOW_PATH),
    'approved workflow missing',
  );
  const relocations = [];
  const executionFiles = [];
  for (const entry of files) {
    safeRelative(entry.path);
    const bytes = verifyExecutionFile(source, entry);
    executionFiles.push(entry);
    writeExclusive(resolve(destination, entry.path), bytes, entry.mode);
  }
  const executionTree = treeForFiles(destination, executionFiles);
  // The transport index is reset independently. Original workflow bytes are inert payloads.
  execFileSync('git', ['read-tree', '--empty'], { cwd: destination });
  for (const entry of executionFiles) {
    if (!entry.path.startsWith('.github/workflows/') || entry.path === WORKFLOW_PATH) continue;
    ensure(/^\.github\/workflows\/[^/]+\.ya?ml$/.test(entry.path), 'unsupported workflow path');
    const payloadPath = TRANSPORT_ROOT + '/workflows/' + entry.digest.slice(7) + '.yml';
    if (!existsSync(resolve(destination, payloadPath)))
      writeExclusive(
        resolve(destination, payloadPath),
        readFileSync(resolve(destination, entry.path)),
        entry.mode,
      );
    rmSync(resolve(destination, entry.path));
    relocations.push({ ...entry, payloadPath });
  }
  const transportOnly = [
    ...new Map(
      relocations.map((e) => [
        e.payloadPath,
        { path: e.payloadPath, mode: e.mode, digest: e.digest },
      ]),
    ).values(),
  ];
  const materialization = {
    protocol: PROTECTED_VALIDATION_PROTOCOL,
    executionFiles,
    relocations,
    transportOnly,
    executionTree,
  };
  writeExclusive(resolve(destination, MATERIALIZATION_PATH), canonicalJSON(materialization) + '\n');
  const transport = { ...materialization };
  writeExclusive(resolve(destination, TRANSPORT_PATH), canonicalJSON(transport) + '\n');
  const transportFiles = [
    ...executionFiles.filter((entry) => !relocations.some((moved) => moved.path === entry.path)),
    ...transportOnly,
    ...[MATERIALIZATION_PATH, TRANSPORT_PATH].map((path) => ({
      path,
      mode: '100644',
      digest: validationDigest(readFileSync(resolve(destination, path))),
    })),
  ];
  const snapshotTree = treeForFiles(destination, transportFiles, { transport: true });
  const snapshotCommit = execFileSync(
    'git',
    ['commit-tree', snapshotTree, '-p', sourceHead, '-m', 'Protected macOS validation snapshot'],
    {
      cwd: destination,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
      },
    },
  ).trim();
  git(destination, 'update-ref', 'refs/heads/snapshot', snapshotCommit);
  git(destination, 'symbolic-ref', 'HEAD', 'refs/heads/snapshot');
  return { materialization, transport, executionTree, snapshotTree, snapshotCommit, sourceHead };
}

function transportFile(root, path) {
  ensure(
    typeof path === 'string' &&
      /^\.protected-validation\/(?:materialization\.json|transport\.json|workflows\/[a-f0-9]{64}\.yml)$/.test(
        path,
      ),
    'unsafe transport metadata path',
  );
  root = realpathSync(root);
  let actual = root;
  for (const component of path.split('/')) {
    actual = resolve(actual, component);
    ensure(!lstatSync(actual).isSymbolicLink(), 'symlink in transport path');
  }
  const stat = lstatSync(actual);
  ensure(
    realpathSync(actual) === actual && stat.isFile() && stat.nlink === 1,
    'unsafe transport file',
  );
  return readFileSync(actual);
}
export function materializeTransport({ checkout, destination, expectedCommit = null }) {
  checkout = realpathSync(checkout);
  if (expectedCommit !== null)
    ensure(
      git(checkout, 'rev-parse', 'HEAD') === expectedCommit,
      'transport checkout commit mismatch',
    );
  ensure(
    git(checkout, 'status', '--porcelain', '--untracked-files=all') === '',
    'dirty transport checkout',
  );
  const sourceCommit = git(checkout, 'rev-parse', 'HEAD');
  const sourceHead = validationCommitParent(checkout, sourceCommit);
  const materialization = validateMaterializationManifest(
    JSON.parse(transportFile(checkout, MATERIALIZATION_PATH)),
  );
  const transport = JSON.parse(transportFile(checkout, TRANSPORT_PATH));
  ensure(
    canonicalJSON(materialization) === canonicalJSON(transport),
    'transport/materialization mapping differs',
  );
  ensure(
    materialization.protocol === PROTECTED_VALIDATION_PROTOCOL &&
      Array.isArray(materialization.executionFiles),
    'foreign materialization manifest',
  );
  const relocated = new Map();
  for (const entry of materialization.relocations) {
    safeRelative(entry.path);
    ensure(
      entry.path.startsWith('.github/workflows/') &&
        entry.path !== WORKFLOW_PATH &&
        entry.payloadPath === TRANSPORT_ROOT + '/workflows/' + entry.digest.slice(7) + '.yml' &&
        !relocated.has(entry.path),
      'unsafe or duplicate workflow relocation',
    );
    relocated.set(entry.path, entry);
  }
  const expected = new Map(
    materialization.executionFiles
      .filter((e) => !relocated.has(e.path))
      .map((e) => [safeRelative(e.path), e]),
  );
  for (const entry of materialization.transportOnly) {
    ensure(
      entry.path.startsWith(TRANSPORT_ROOT + '/workflows/') &&
        materialization.relocations.some(
          (e) => e.payloadPath === entry.path && e.mode === entry.mode && e.digest === entry.digest,
        ),
      'foreign transport-only payload',
    );
    ensure(!expected.has(entry.path), 'duplicate transport path');
    expected.set(entry.path, entry);
  }
  for (const path of [MATERIALIZATION_PATH, TRANSPORT_PATH]) expected.set(path, null);
  const actual = git(checkout, 'ls-files', '-z').split('\0').filter(Boolean);
  ensure(
    canonicalJSON(actual.sort()) === canonicalJSON([...expected.keys()].sort()),
    'transport path membership mismatch',
  );
  for (const [path, entry] of expected) {
    if (!entry) continue;
    const bytes = path.startsWith(TRANSPORT_ROOT + '/')
      ? transportFile(checkout, path)
      : verifyExecutionFile(checkout, entry);
    ensure(validationDigest(bytes) === entry.digest, 'transport payload drift');
    const mode = git(checkout, 'ls-files', '--stage', '--', path).split(' ')[0];
    ensure(mode === entry.mode, 'transport mode mismatch');
  }
  ensure(!existsSync(destination), 'execution repository must be exclusive');
  mkdirSync(destination, { recursive: true });
  initializeRepository(destination);
  importValidationHistory({ source: checkout, destination, sourceHead });
  const seen = new Set();
  for (const entry of materialization.executionFiles) {
    safeRelative(entry.path);
    ensure(!seen.has(entry.path), 'duplicate execution path');
    seen.add(entry.path);
    const relocation = relocated.get(entry.path);
    if (relocation)
      ensure(
        canonicalJSON({
          path: relocation.path,
          mode: relocation.mode,
          digest: relocation.digest,
        }) === canonicalJSON(entry),
        'workflow relocation identity mismatch',
      );
    const bytes = relocation
      ? transportFile(checkout, relocation.payloadPath)
      : verifyExecutionFile(checkout, entry);
    ensure(validationDigest(bytes) === entry.digest, 'materialized content mismatch');
    writeExclusive(resolve(destination, entry.path), bytes, entry.mode);
  }
  ensure(
    [...relocated.keys()].every((path) => seen.has(path)),
    'orphan workflow relocation',
  );
  const executionTree = treeForFiles(destination, materialization.executionFiles);
  ensure(executionTree === materialization.executionTree, 'execution Git tree mismatch');
  const executionCommit = git(
    destination,
    'commit-tree',
    executionTree,
    '-p',
    sourceHead,
    '-m',
    'Materialized protected validation source',
  );
  git(destination, 'update-ref', 'refs/heads/execution', executionCommit);
  git(destination, 'symbolic-ref', 'HEAD', 'refs/heads/execution');
  ensure(
    git(destination, 'status', '--porcelain') === '',
    'materialized repository differs from execution tree',
  );
  return {
    executionTree,
    executionCommit,
    sourceCommit,
    sourceHead,
    materializationDigest: validationDigest(transportFile(checkout, MATERIALIZATION_PATH)),
  };
}
