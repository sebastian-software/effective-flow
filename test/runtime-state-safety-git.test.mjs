import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
};

function runGit(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    env: GIT_ENV,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

function git(root, ...args) {
  const result = runGit(root, args);
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function createRepository(t, { gitignore, trackedRuntimeFiles = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'effective-flow-runtime-safety-'));
  git(root, 'init', '--initial-branch=main');
  writeFileSync(join(root, 'source.txt'), 'source sentinel\n');
  if (gitignore !== undefined) writeFileSync(join(root, '.gitignore'), gitignore);

  for (const [path, content] of Object.entries(trackedRuntimeFiles)) {
    const absolutePath = join(root, path);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }

  git(root, 'add', 'source.txt');
  if (gitignore !== undefined) git(root, 'add', '.gitignore');
  for (const path of Object.keys(trackedRuntimeFiles)) git(root, 'add', '-f', path);
  git(root, 'commit', '-m', 'fixture');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function listFiles(root, current = root) {
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const absolutePath = join(current, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(root, absolutePath));
    else files.push(relative(root, absolutePath));
  }
  return files.sort();
}

function snapshot(root) {
  const files = Object.fromEntries(
    listFiles(root).map((path) => [path, readFileSync(join(root, path), 'utf8')]),
  );
  const index = runGit(root, ['ls-files', '--stage']);
  const status = runGit(root, ['status', '--porcelain', '--untracked-files=all']);
  return {
    files,
    index: index.status === 0 ? index.stdout : null,
    status: status.status === 0 ? status.stdout : null,
  };
}

class RuntimeStateSafetyError extends Error {
  constructor(message, diagnostics = []) {
    super(`${message}; run $effective-flow setup`);
    this.diagnostics = diagnostics;
  }
}

function checkIgnored(root, path, runner, calls) {
  const args = ['check-ignore', '--no-index', '--', path];
  calls.push(args);
  const decision = runner(root, args);
  if (decision.error || decision.status === null || ![0, 1].includes(decision.status)) {
    throw new RuntimeStateSafetyError(`cannot determine whether ${path} is ignored`);
  }
  if (decision.status === 0) return;

  const diagnosticArgs = ['check-ignore', '-v', '--no-index', '--', path];
  calls.push(diagnosticArgs);
  const diagnostic = runner(root, diagnosticArgs);
  throw new RuntimeStateSafetyError(`${path} is not ignored`, [
    diagnostic.stdout.trim(),
    diagnostic.stderr.trim(),
  ]);
}

function checkRuntimeStateSafety(
  root,
  target,
  { runner = runGit, calls = [], expectedRoot, expectedRepositoryIdentity } = {},
) {
  const repositoryArgs = ['rev-parse', '--show-toplevel'];
  calls.push(repositoryArgs);
  const repository = runner(root, repositoryArgs);
  if (repository.error || repository.status !== 0) {
    throw new RuntimeStateSafetyError('cannot verify the owning Git worktree');
  }
  let actualRoot;
  try {
    actualRoot = realpathSync(resolve(root, repository.stdout.trim()));
  } catch {
    throw new RuntimeStateSafetyError('cannot canonicalize the runtime-state root');
  }
  if (expectedRoot !== undefined && actualRoot !== realpathSync(expectedRoot)) {
    throw new RuntimeStateSafetyError('runtime-state root mismatch');
  }

  if (expectedRepositoryIdentity !== undefined) {
    const common = runner(root, ['rev-parse', '--git-common-dir']);
    if (common.error || common.status !== 0) {
      throw new RuntimeStateSafetyError('cannot verify the runtime-state repository identity');
    }
    const actualCommon = realpathSync(resolve(root, common.stdout.trim()));
    if (actualCommon !== expectedRepositoryIdentity) {
      throw new RuntimeStateSafetyError('runtime-state repository identity mismatch');
    }
  }

  checkIgnored(root, '.effective-flow/config.json', runner, calls);
  checkIgnored(root, target, runner, calls);

  const trackedArgs = ['ls-files', '--', '.effective-flow/'];
  calls.push(trackedArgs);
  const tracked = runner(root, trackedArgs);
  if (tracked.error || tracked.status !== 0) {
    throw new RuntimeStateSafetyError('cannot determine tracked runtime paths');
  }
  if (tracked.stdout.trim() !== '') {
    throw new RuntimeStateSafetyError(`tracked runtime paths: ${tracked.stdout.trim()}`);
  }
}

function missingDirectoryTargets(root, target) {
  const targets = [];
  let current = dirname(join(root, target));
  while (current !== root && !existsSync(current)) {
    targets.unshift(`${relative(root, current)}/`);
    current = dirname(current);
  }
  return targets;
}

function guardedWrite(root, target, content, options) {
  const directoryTargets = missingDirectoryTargets(root, target);

  // Preflight the complete mutation set before changing anything, so a later
  // target failure cannot leave an earlier directory behind.
  for (const directoryTarget of directoryTargets) {
    checkRuntimeStateSafety(root, directoryTarget, options);
  }
  checkRuntimeStateSafety(root, target, options);

  // Re-run the exact guard immediately before each concrete mutation.
  for (const directoryTarget of directoryTargets) {
    checkRuntimeStateSafety(root, directoryTarget, options);
    mkdirSync(join(root, directoryTarget));
  }
  const absolutePath = join(root, target);
  checkRuntimeStateSafety(root, target, options);
  writeFileSync(absolutePath, content);
}

function assertBlockedWithoutMutation(root, target, options, message) {
  const before = snapshot(root);
  assert.throws(
    () => guardedWrite(root, target, 'must not be written\n', options),
    (error) => {
      assert.match(error.message, message);
      assert.match(error.message, /\$effective-flow setup/);
      return true;
    },
  );
  assert.deepEqual(snapshot(root), before);
}

test('no setup fails closed before creating the runtime directory', (t) => {
  const root = createRepository(t);

  assertBlockedWithoutMutation(
    root,
    '.effective-flow/memory.json',
    undefined,
    /config\.json is not ignored/,
  );
  assert.equal(existsSync(join(root, '.effective-flow')), false);
});

test('the legacy config negation blocks even when the concrete target is ignored', (t) => {
  const root = createRepository(t, {
    gitignore: '.effective-flow/*\n!.effective-flow/config.json\n',
  });
  assert.equal(
    runGit(root, ['check-ignore', '--no-index', '--', '.effective-flow/memory.json']).status,
    0,
  );

  assertBlockedWithoutMutation(
    root,
    '.effective-flow/memory.json',
    undefined,
    /config\.json is not ignored/,
  );
});

test('the canonical blanket ignore permits a guarded write without editing .gitignore', (t) => {
  const root = createRepository(t, { gitignore: '.effective-flow/\n' });
  const ignoreBefore = readFileSync(join(root, '.gitignore'), 'utf8');

  guardedWrite(root, '.effective-flow/review/report.md', 'report\n');

  assert.equal(readFileSync(join(root, '.effective-flow/review/report.md'), 'utf8'), 'report\n');
  assert.equal(readFileSync(join(root, '.gitignore'), 'utf8'), ignoreBefore);
  assert.equal(git(root, 'status', '--porcelain'), '');
});

test('a guarded write checks every exact directory target before mkdir and the file before write', (t) => {
  const root = createRepository(t, { gitignore: '.effective-flow/\n' });
  const calls = [];

  guardedWrite(root, '.effective-flow/review/report.md', 'report\n', { calls });

  const decisionTargets = calls
    .filter(
      (args) =>
        args[0] === 'check-ignore' &&
        !args.includes('-v') &&
        args.at(-1) !== '.effective-flow/config.json',
    )
    .map((args) => args.at(-1));
  assert.deepEqual(decisionTargets, [
    '.effective-flow/',
    '.effective-flow/review/',
    '.effective-flow/review/report.md',
    '.effective-flow/',
    '.effective-flow/review/',
    '.effective-flow/review/report.md',
  ]);
});

test('linked-worktree runtime writes use the verified main checkout and survive cleanup', (t) => {
  const root = createRepository(t, { gitignore: '.effective-flow/\n' });
  const linkedRoot = join(dirname(root), `${root.split('/').at(-1)}-linked`);
  git(root, 'worktree', 'add', linkedRoot, '-b', 'runtime/linked', 'HEAD');
  const repositoryIdentity = realpathSync(
    resolve(root, git(root, 'rev-parse', '--git-common-dir')),
  );

  guardedWrite(root, '.effective-flow/review/report.md', 'persistent\n', {
    expectedRoot: root,
    expectedRepositoryIdentity: repositoryIdentity,
  });
  guardedWrite(root, '.effective-flow/memory.json', '{"lastFindingNumber":1}\n', {
    expectedRoot: root,
    expectedRepositoryIdentity: repositoryIdentity,
  });

  assert.equal(existsSync(join(linkedRoot, '.effective-flow/review/report.md')), false);
  git(root, 'worktree', 'remove', linkedRoot);
  assert.equal(
    readFileSync(join(root, '.effective-flow/review/report.md'), 'utf8'),
    'persistent\n',
  );
  assert.equal(
    readFileSync(join(root, '.effective-flow/memory.json'), 'utf8'),
    '{"lastFindingNumber":1}\n',
  );
});

test('a mismatched or unsafe main root blocks without falling back to a linked worktree', (t) => {
  const root = createRepository(t, { gitignore: '.effective-flow/\n' });
  const linkedRoot = join(dirname(root), `${root.split('/').at(-1)}-fallback`);
  git(root, 'worktree', 'add', linkedRoot, '-b', 'runtime/fallback', 'HEAD');
  const other = createRepository(t, { gitignore: '.effective-flow/\n' });
  const repositoryIdentity = realpathSync(
    resolve(root, git(root, 'rev-parse', '--git-common-dir')),
  );

  assertBlockedWithoutMutation(
    other,
    '.effective-flow/review/report.md',
    { expectedRoot: root, expectedRepositoryIdentity: repositoryIdentity },
    /runtime-state root mismatch/,
  );

  writeFileSync(join(root, '.gitignore'), '.effective-flow/*\n!.effective-flow/config.json\n');
  assertBlockedWithoutMutation(
    root,
    '.effective-flow/review/report.md',
    { expectedRoot: root, expectedRepositoryIdentity: repositoryIdentity },
    /config\.json is not ignored/,
  );
  assert.equal(existsSync(join(root, '.effective-flow/review/report.md')), false);
  assert.equal(existsSync(join(linkedRoot, '.effective-flow/review/report.md')), false);
  git(root, 'worktree', 'remove', linkedRoot);
});

test('tracked runtime state blocks even when both ignore predicates pass', (t) => {
  const root = createRepository(t, {
    gitignore: '.effective-flow/\n',
    trackedRuntimeFiles: { '.effective-flow/memory.json': '{"tracked":true}\n' },
  });
  assert.equal(
    runGit(root, ['check-ignore', '--no-index', '--', '.effective-flow/config.json']).status,
    0,
  );

  assertBlockedWithoutMutation(
    root,
    '.effective-flow/review/report.md',
    undefined,
    /tracked runtime paths: \.effective-flow\/memory\.json/,
  );
});

test('a target-specific negation blocks the pending target', (t) => {
  const root = createRepository(t, {
    gitignore:
      '.effective-flow/*\n!.effective-flow/review/\n.effective-flow/review/*\n!.effective-flow/review/report.md\n',
  });
  mkdirSync(join(root, '.effective-flow/review'), { recursive: true });
  assert.equal(
    runGit(root, ['check-ignore', '--no-index', '--', '.effective-flow/config.json']).status,
    0,
  );

  assertBlockedWithoutMutation(
    root,
    '.effective-flow/review/report.md',
    undefined,
    /review\/report\.md is not ignored/,
  );
});

test('non-repositories and Git launch failures preserve all state', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'effective-flow-runtime-nonrepo-'));
  writeFileSync(join(root, 'source.txt'), 'source sentinel\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assertBlockedWithoutMutation(
    root,
    '.effective-flow/memory.json',
    undefined,
    /cannot verify the owning Git worktree/,
  );

  const repository = createRepository(t, { gitignore: '.effective-flow/\n' });
  const launchErrorRunner = () => ({
    status: null,
    stdout: '',
    stderr: '',
    error: new Error('git unavailable'),
  });
  assertBlockedWithoutMutation(
    repository,
    '.effective-flow/memory.json',
    { runner: launchErrorRunner },
    /cannot verify the owning Git worktree/,
  );
});

test('non-verbose check-ignore is the predicate and verbose mode is diagnostics only', (t) => {
  const root = createRepository(t, { gitignore: '.effective-flow/\n' });
  const calls = [];
  const runner = (executionRoot, args) => {
    if (args[0] === 'check-ignore' && !args.includes('-v')) {
      return { status: 1, stdout: '', stderr: '', error: undefined };
    }
    if (args[0] === 'check-ignore' && args.includes('-v')) {
      return {
        status: 0,
        stdout: '.gitignore:2:!.effective-flow/config.json\t.effective-flow/config.json\n',
        stderr: '',
        error: undefined,
      };
    }
    return runGit(executionRoot, args);
  };

  assertBlockedWithoutMutation(
    root,
    '.effective-flow/memory.json',
    { runner, calls },
    /config\.json is not ignored/,
  );
  assert.deepEqual(calls.slice(1), [
    ['check-ignore', '--no-index', '--', '.effective-flow/config.json'],
    ['check-ignore', '-v', '--no-index', '--', '.effective-flow/config.json'],
  ]);
  assert.equal(statSync(join(root, 'source.txt')).isFile(), true);
});
