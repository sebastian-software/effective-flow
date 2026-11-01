import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  PROTECTED_VALIDATION_PROTOCOL,
  REQUIRED_NATIVE_CASES,
  VALIDATION_COMMANDS,
  VALIDATION_ENVIRONMENT,
  VALIDATION_HISTORY_DEPTH,
  validateBootstrap,
  validationDigest,
} from '../src/scripts/protected-validation-protocol.mjs';
import {
  createTransport,
  materializeTransport,
  sourceBasis,
  importValidationHistory,
  validationCommitParent,
  verifyValidationHistory,
} from '../scripts/protected-validation-projection.mjs';
import { boundedExecFileSync } from '../scripts/protected-validation-runner.mjs';
import { projectManifest } from '../src/scripts/protected-validation-core.mjs';
import { parseExecutionLogs, unzipLogs } from '../scripts/protected-validation-backend.mjs';
import { submitValidation } from '../scripts/protected-validation-operator.mjs';

const digest = (value) => validationDigest(value);
const oid = 'a'.repeat(40);
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const policy = {
  protocol: PROTECTED_VALIDATION_PROTOCOL,
  repository: 'sebastian-software/effective-flow',
  workflowPath: '.github/workflows/protected-macos-validation.yml',
  commands: [...VALIDATION_COMMANDS],
  nativeCases: [...REQUIRED_NATIVE_CASES],
  environment: VALIDATION_ENVIRONMENT,
  executionClosure: {
    workflowDigest: digest('workflow'),
    runnerDigest: digest('runner'),
    protocolDigest: digest('protocol'),
    coreDigest: digest('core'),
    operatorDigest: digest('operator'),
    projectionDigest: digest('projection'),
    backendDigest: digest('backend'),
    runnerHelperDigest: digest('runner helper'),
    watchdogDigest: digest('watchdog'),
    materializationAlgorithm: 'git-tree-v1',
    actions: { checkout: 'a'.repeat(40), pnpm: 'b'.repeat(40), node: 'c'.repeat(40) },
  },
};
const preparation = {
  protocol: PROTECTED_VALIDATION_PROTOCOL,
  requestRef: {
    root: '/private/tmp/protected-validation',
    path: 'validation-request-v004.json',
    digest: digest('request'),
  },
  bootstrapRef: {
    root: '/private/tmp/protected-validation',
    path: 'bootstraps/boot-v004.json',
    digest: digest('bootstrap'),
  },
  localSnapshot: {
    head: oid,
    index: digest('index'),
    workingTree: digest('tree'),
    untracked: digest('untracked'),
  },
  exportManifestRef: {
    root: '/private/tmp/protected-validation',
    path: 'exports/v004.json',
    digest: digest('export'),
  },
  transportManifestRef: {
    root: '/private/tmp/protected-validation',
    path: 'manifests/transport.json',
    digest: digest('transport'),
  },
  materializationManifestRef: {
    root: '/private/tmp/protected-validation',
    path: 'manifests/materialization.json',
    digest: digest('materialization'),
  },
  executionTree: oid,
  executionClosureDigest: digest(policy.executionClosure),
  repository: policy.repository,
  snapshotBranch: 'effective-flow/validation/v004',
  snapshotCommit: oid,
  snapshotTree: oid,
};

function sourceFixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'protected-validation-operator-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  mkdirSync(path.join(root, 'scripts'), { recursive: true });
  mkdirSync(path.join(root, 'src'), { recursive: true });
  mkdirSync(path.join(root, 'docs/plan'), { recursive: true });
  writeFileSync(
    path.join(root, '.github/workflows/protected-macos-validation.yml'),
    'name: protected\n',
  );
  writeFileSync(path.join(root, '.github/workflows/ci.yml'), 'name: inert\n');
  writeFileSync(
    path.join(root, 'scripts/protected-macos-validation.mjs'),
    'export const runner = true;\n',
  );
  writeFileSync(path.join(root, 'src/main.mjs'), 'export const main = true;\n');
  writeFileSync(path.join(root, 'README.md'), 'initial\n');
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Protected validation test');
  git(root, 'config', 'user.email', 'protected-validation-test@invalid.local');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'config', 'core.hooksPath', '/dev/null');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'fixture');
  writeFileSync(path.join(root, 'src/main.mjs'), 'export const main = "staged";\n');
  git(root, 'add', 'src/main.mjs');
  rmSync(path.join(root, 'README.md'));
  writeFileSync(path.join(root, 'scripts/new-tool.sh'), '#!/bin/sh\nexit 0\n');
  chmodSync(path.join(root, 'scripts/new-tool.sh'), 0o755);
  writeFileSync(path.join(root, 'docs/plan/2026-10-22-unrelated.md'), 'unrelated\n');
  return root;
}

test('operator projection round-trips dirty tracked, deleted, executable and inert workflow files without mutating source Git state', (t) => {
  const source = sourceFixture(t),
    before = sourceBasis(source),
    indexBefore = git(source, 'write-tree');
  const manifest = projectManifest(before.files, {
    trackedPaths: before.trackedPaths,
    snapshot: before.snapshot,
  });
  const transportRoot = path.join(
    mkdtempSync(path.join(tmpdir(), 'protected-validation-transport-')),
    'transport',
  );
  const execution = path.join(
    mkdtempSync(path.join(tmpdir(), 'protected-validation-materialized-')),
    'execution',
  );
  t.after(() => {
    rmSync(transportRoot, { recursive: true, force: true });
    rmSync(execution, { recursive: true, force: true });
  });
  const mapping = createTransport({ source, destination: transportRoot, manifest });
  const result = materializeTransport({
    checkout: transportRoot,
    destination: execution,
    expectedCommit: mapping.snapshotCommit,
  });
  assert.equal(result.executionTree, mapping.executionTree);
  assert.equal(
    readFileSync(path.join(execution, '.github/workflows/ci.yml'), 'utf8'),
    'name: inert\n',
  );
  assert.equal(
    readFileSync(path.join(execution, '.github/workflows/protected-macos-validation.yml'), 'utf8'),
    'name: protected\n',
  );
  assert.equal(statSync(path.join(execution, 'scripts/new-tool.sh')).mode & 0o111, 0o111);
  assert.equal(git(source, 'write-tree'), indexBefore);
  assert.deepEqual(sourceBasis(source), before);
  assert.equal(git(execution, 'archive', '--format=tar', 'HEAD').length > 0, true);
});

test('materialization runGit forwards the existing Git command arguments and timeout with default-runner parity', (t) => {
  const source = sourceFixture(t);
  const manifest = fixtureManifest(source);
  const transport = temporaryCheckout(t, 'protected-validation-runner-', 'transport');
  const baseline = temporaryCheckout(t, 'protected-validation-runner-', 'baseline');
  const execution = temporaryCheckout(t, 'protected-validation-runner-', 'execution');
  const mapping = createTransport({ source, destination: transport, manifest });
  const expected = materializeTransport({
    checkout: transport,
    destination: baseline,
    expectedCommit: mapping.snapshotCommit,
  });
  const calls = [];
  const actual = materializeTransport({
    checkout: transport,
    destination: execution,
    expectedCommit: mapping.snapshotCommit,
    timeoutMs: 45000,
    runGit(cwd, args, timeoutMs) {
      calls.push({ cwd, args: [...args], timeoutMs });
      return boundedExecFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        timeoutMs,
        operation: args.find((arg) => !arg.startsWith('-')) ?? 'git',
        diagnosticKind: 'MATERIALIZATION',
      }).trim();
    },
  });
  // Synthetic forwarding observations; both materializations still use real Git.
  assert.ok(calls.length > 0, 'the supplied direct-call runner must execute');
  assert.ok(calls.every((call) => call.timeoutMs === 45000));
  assert.deepEqual(calls.slice(0, 3), [
    { cwd: realpathSync(transport), args: ['rev-parse', 'HEAD'], timeoutMs: 45000 },
    {
      cwd: realpathSync(transport),
      args: ['status', '--porcelain', '--untracked-files=all'],
      timeoutMs: 45000,
    },
    { cwd: realpathSync(transport), args: ['rev-parse', 'HEAD'], timeoutMs: 45000 },
  ]);
  assert.deepEqual(calls.slice(-4), [
    {
      cwd: execution,
      args: [
        'commit-tree',
        mapping.executionTree,
        '-p',
        actual.sourceHead,
        '-m',
        'Materialized protected validation source',
      ],
      timeoutMs: 45000,
    },
    {
      cwd: execution,
      args: ['update-ref', 'refs/heads/execution', actual.executionCommit],
      timeoutMs: 45000,
    },
    { cwd: execution, args: ['symbolic-ref', 'HEAD', 'refs/heads/execution'], timeoutMs: 45000 },
    { cwd: execution, args: ['status', '--porcelain'], timeoutMs: 45000 },
  ]);
  for (const key of ['executionTree', 'sourceCommit', 'sourceHead', 'materializationDigest'])
    assert.equal(actual[key], expected[key]);
  assert.equal(
    git(execution, 'rev-parse', 'HEAD^{tree}'),
    git(baseline, 'rev-parse', 'HEAD^{tree}'),
  );
  const sentinel = new Error('synthetic runner refusal');
  const refused = temporaryCheckout(t, 'protected-validation-runner-', 'refused');
  assert.throws(
    () =>
      materializeTransport({
        checkout: transport,
        destination: refused,
        runGit(cwd, args, timeoutMs) {
          assert.equal(cwd, realpathSync(transport));
          assert.deepEqual(args, ['status', '--porcelain', '--untracked-files=all']);
          assert.equal(timeoutMs, 120000);
          throw sentinel;
        },
      }),
    (error) => error === sentinel,
  );
  assert.equal(existsSync(refused), false);
});

test('materialization rejects a non-callable runGit before filesystem access or mutation', (t) => {
  const checkout = temporaryCheckout(t, 'protected-validation-runner-invalid-', 'missing');
  const destination = temporaryCheckout(t, 'protected-validation-runner-invalid-', 'execution');
  for (const runGit of [null, false, 1, 'git', {}, []]) {
    assert.throws(
      () => materializeTransport({ checkout, destination, runGit }),
      /materialization Git runner must be callable/,
    );
    assert.equal(existsSync(checkout), false);
    assert.equal(existsSync(destination), false);
  }
});

test('production backend log parser rejects missing, duplicate, skipped and forged runner events', () => {
  assert.throws(() => unzipLogs(Buffer.from('truncated')), /complete raw log ZIP/);
  const materialization = {
    type: 'materialization',
    sourceCommit: preparation.snapshotCommit,
    sourceHead: preparation.localSnapshot.head,
    executionTree: preparation.executionTree,
    materializationDigest: preparation.materializationManifestRef.digest,
    executionCommit: oid,
  };
  const environment = {
    type: 'environment',
    environment: VALIDATION_ENVIRONMENT,
    platform: 'darwin',
    arch: 'arm64',
    machine: 'arm64',
    osVersion: '15.7',
    runnerImage: 'macos-15-arm64',
    closure: policy.executionClosure,
    codex: { path: '/opt/homebrew/bin/codex', version: '0.163.0', digest: digest('codex') },
  };
  const events = [materialization, environment];
  const tap = [];
  for (const [index, command] of VALIDATION_COMMANDS.entries()) {
    events.push(
      { type: 'command-start', command, index },
      { type: 'command-end', command, index, exitCode: 0 },
    );
    if (command === 'pnpm test') {
      tap.push(...REQUIRED_NATIVE_CASES.map((name, caseIndex) => `ok ${caseIndex + 1} - ${name}`));
      events.push({
        type: 'native-cases',
        nativeCases: REQUIRED_NATIVE_CASES.map((name) => ({ name, outcome: 'passed' })),
      });
    }
  }
  events.push({ type: 'completed', executionTree: preparation.executionTree });
  const lines = [];
  let eventIndex = 0;
  for (const event of events) {
    lines.push(`EF_PROTECTED_VALIDATION ${JSON.stringify(event)}`);
    if (event.type === 'command-start' && event.command === 'pnpm test') lines.push(...tap);
    eventIndex += 1;
  }
  const text = lines.join('\n');
  const parsed = parseExecutionLogs(text, preparation, policy, 42, 1, digest('raw'));
  assert.equal(parsed.runId, 42);
  assert.equal(parsed.runAttempt, 1);
  const duplicate = text.replace('"type":"completed"', '"type":"command-start"');
  assert.throws(
    () => parseExecutionLogs(duplicate, preparation, policy, 42, 1, digest('raw')),
    /missing, duplicate, reordered or forged/,
  );
  const skipped = text.replace('"outcome":"passed"', '"outcome":"skipped"');
  assert.throws(
    () => parseExecutionLogs(skipped, preparation, policy, 42, 1, digest('raw')),
    /skipped\/forged native case outcomes/,
  );
  assert.throws(
    () =>
      parseExecutionLogs(
        text.replace('/opt/homebrew/bin/codex', '/tmp/codex'),
        preparation,
        policy,
        42,
        1,
        digest('raw'),
      ),
    /actual runner environment identity/,
  );
});

function temporaryCheckout(t, prefix, leaf, base = tmpdir()) {
  const root = realpathSync(mkdtempSync(path.join(base, prefix)));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return path.join(root, leaf);
}

test('temporary checkout fixture canonicalizes its allocated root through a controlled symlink parent', (t) => {
  const fixture = realpathSync(mkdtempSync(path.join(tmpdir(), 'protected-validation-temp-root-')));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const physicalParent = path.join(fixture, 'physical');
  const aliasParent = path.join(fixture, 'alias');
  mkdirSync(physicalParent);
  symlinkSync(physicalParent, aliasParent, 'dir');
  const checkout = temporaryCheckout(t, 'checkout-', 'source', aliasParent);
  assert.equal(existsSync(checkout), false, 'only the allocated private root exists');
  assert.equal(checkout, path.join(realpathSync(path.dirname(checkout)), 'source'));
});

function historyFixture(t) {
  const source = temporaryCheckout(t, 'protected-validation-history-', 'source');
  mkdirSync(path.join(source, '.github/workflows'), { recursive: true });
  mkdirSync(path.join(source, 'scripts'), { recursive: true });
  writeFileSync(
    path.join(source, '.github/workflows/protected-macos-validation.yml'),
    'name: protected\n',
  );
  writeFileSync(path.join(source, '.github/workflows/ci.yml'), 'name: inert\n');
  writeFileSync(
    path.join(source, 'scripts/protected-macos-validation.mjs'),
    'export const runner = true;\n',
  );
  writeFileSync(path.join(source, 'README.md'), 'historical baseline\n');
  writeFileSync(path.join(source, 'scripts/historical-only.txt'), 'deleted from the candidate\n');
  git(source, 'init', '--quiet');
  git(source, 'config', 'user.name', 'Protected validation history');
  git(source, 'config', 'user.email', 'protected-validation-history@invalid.local');
  git(source, 'config', 'commit.gpgsign', 'false');
  git(source, 'config', 'core.hooksPath', '/dev/null');
  git(source, 'add', '.');
  git(source, 'commit', '--quiet', '-m', 'historical baseline');
  const baseline = git(source, 'rev-parse', 'HEAD');
  git(source, 'checkout', '--quiet', '-b', 'side');
  writeFileSync(path.join(source, 'scripts/side.txt'), 'merged side history\n');
  git(source, 'add', '.');
  git(source, 'commit', '--quiet', '-m', 'side history');
  const side = git(source, 'rev-parse', 'HEAD');
  git(source, 'checkout', '--quiet', '-');
  writeFileSync(path.join(source, 'README.md'), 'source HEAD\n');
  writeFileSync(path.join(source, 'scripts/executable.sh'), '#!/bin/sh\nexit 0\n');
  chmodSync(path.join(source, 'scripts/executable.sh'), 0o755);
  git(source, 'add', '.');
  git(source, 'commit', '--quiet', '-m', 'main history');
  const main = git(source, 'rev-parse', 'HEAD');
  git(source, 'merge', '--no-ff', '--quiet', 'side', '-m', 'legitimate source merge');
  const sourceHead = git(source, 'rev-parse', 'HEAD');
  assert.deepEqual(git(source, 'rev-list', '--parents', '-n', '1', sourceHead).split(/\s+/), [
    sourceHead,
    main,
    side,
  ]);
  return { source, sourceHead, baseline };
}

function fixtureManifest(source) {
  const before = sourceBasis(source);
  return projectManifest(before.files, {
    trackedPaths: before.trackedPaths,
    snapshot: before.snapshot,
  });
}

function commitHistoricalPath(source, name, bytes = 'artificial historical fixture bytes\n') {
  mkdirSync(path.dirname(path.join(source, name)), { recursive: true });
  writeFileSync(path.join(source, name), bytes);
  git(source, 'add', '--', name);
  git(source, 'commit', '--quiet', '-m', 'synthetic historical path');
  return git(source, 'rev-parse', 'HEAD');
}

function deleteHistoricalPath(source, name) {
  git(source, 'rm', '--quiet', '--', name);
  git(source, 'commit', '--quiet', '-m', 'synthetic historical deletion');
  return git(source, 'rev-parse', 'HEAD');
}

function assertPrivateHistoryRefusal(operation, forbiddenName) {
  assert.throws(operation, (error) => {
    assert.match(error.message, /history|historical/i);
    assert.equal(error.message.includes(forbiddenName), false, 'refusal must not disclose paths');
    assert.equal(error.message.includes('artificial historical fixture bytes'), false);
    return true;
  });
}

test('history privacy permits tracked plans and evidence across complete safe history', (t) => {
  const { source } = historyFixture(t);
  for (const name of [
    'docs/plan/2026-10-22-tracked.md',
    'evals/artificial/results/tracked.json',
    '.claude/settings.json',
  ])
    commitHistoricalPath(source, name, 'artificial tracked project evidence\n');
  writeFileSync(path.join(source, 'README.md'), 'dirty tracked candidate\n');
  writeFileSync(path.join(source, '.env'), 'artificial untracked exclusion\n');
  const before = sourceBasis(source);
  const indexBefore = readFileSync(path.join(source, '.git/index'));
  const manifest = fixtureManifest(source);
  assert.equal(
    manifest.excluded.some((entry) => entry.path === '.env'),
    true,
  );
  assert.equal(
    verifyValidationHistory(source, before.snapshot.head),
    Number(git(source, 'rev-list', '--count', before.snapshot.head)),
  );
  assert.deepEqual(sourceBasis(source), before);
  assert.deepEqual(readFileSync(path.join(source, '.git/index')), indexBefore);
});

for (const state of [
  'at HEAD',
  'removed only from the working tree',
  'deleted by a later commit',
]) {
  test(`history privacy rejects .env ${state}`, (t) => {
    const { source } = historyFixture(t);
    const privateHead = commitHistoricalPath(source, '.env');
    if (state === 'removed only from the working tree') rmSync(path.join(source, '.env'));
    if (state === 'deleted by a later commit') deleteHistoricalPath(source, '.env');
    const before = sourceBasis(source);
    const indexBefore = readFileSync(path.join(source, '.git/index'));
    const manifest = fixtureManifest(source);
    assert.equal(
      manifest.files.some((entry) => entry.path === '.env'),
      false,
    );
    assertPrivateHistoryRefusal(
      () => verifyValidationHistory(source, before.snapshot.head),
      '.env',
    );
    assert.deepEqual(sourceBasis(source), before);
    assert.deepEqual(readFileSync(path.join(source, '.git/index')), indexBefore);
    assert.equal(git(source, 'merge-base', '--is-ancestor', privateHead, 'HEAD'), '');
  });
}

test('history privacy rejects a prohibited path reachable only through a merge second parent', (t) => {
  const { source } = historyFixture(t);
  const firstParent = git(source, 'rev-parse', 'HEAD');
  git(source, 'checkout', '--quiet', '-b', 'private-side');
  const privateCommit = commitHistoricalPath(source, 'src/.env.production');
  const secondParent = deleteHistoricalPath(source, 'src/.env.production');
  git(source, 'checkout', '--quiet', '-');
  git(source, 'merge', '--no-ff', '--quiet', 'private-side', '-m', 'synthetic private side merge');
  const head = git(source, 'rev-parse', 'HEAD');
  assert.deepEqual(git(source, 'rev-list', '--parents', '-n', '1', head).split(/\s+/), [
    head,
    firstParent,
    secondParent,
  ]);
  assert.notEqual(
    spawnSync('git', ['merge-base', '--is-ancestor', privateCommit, firstParent], { cwd: source })
      .status,
    0,
  );
  assertPrivateHistoryRefusal(() => verifyValidationHistory(source, head), 'src/.env.production');
});

test('history privacy checks every path when allowed and prohibited paths share the same blob', (t) => {
  const { source } = historyFixture(t);
  const bytes = 'export const artificialSharedBlob = true;\n';
  commitHistoricalPath(source, 'scripts/shared.mjs', bytes);
  const prohibited = commitHistoricalPath(source, '.env', bytes);
  const blob = git(source, 'rev-parse', prohibited + ':.env');
  assert.equal(git(source, 'rev-parse', prohibited + ':scripts/shared.mjs'), blob);
  const head = deleteHistoricalPath(source, '.env');
  // Object display names are not a complete path inventory: this blob is displayed
  // under its allowed current name even though a prohibited historical name exists.
  assert.equal(
    git(source, 'rev-list', '--objects', head)
      .split('\n')
      .find((line) => line.startsWith(blob + ' ')),
    blob + ' scripts/shared.mjs',
  );
  assertPrivateHistoryRefusal(() => verifyValidationHistory(source, head), '.env');
});

const historicalRefusals = [
  ['nested environment', 'src/nested/.env.production'],
  ['credentials', 'scripts/credentials-local.json'],
  ['credentials directory', 'src/credentials-local/ordinary.txt'],
  ['authentication', 'src/auth.json'],
  ['runtime state', '.effective-flow/private.json'],
  ['legacy tracked configuration', '.effective-flow/config.json', '{"artificial":true}\n'],
  ['distribution output', 'dist/generated.mjs'],
  ['dependency output', 'node_modules/artificial/index.mjs'],
  ['Codex state', '.codex/session.json'],
  ['agent state', '.agents/session.json'],
  ['cloud credentials', '.aws/config'],
  ['SSH state', '.ssh/config'],
  ['unsafe backslash', 'scripts/unsafe\\name.mjs'],
  ['unsafe newline', 'scripts/unsafe\nname.mjs'],
  ['ambiguous root', 'unclassified-artificial.txt'],
  ['transport root', '.protected-validation/transport.json'],
  ['nested transport root', 'src/.protected-validation/transport.json'],
];
for (const [label, name, bytes] of historicalRefusals) {
  test(`history privacy rejects historical ${label}`, (t) => {
    const { source } = historyFixture(t);
    commitHistoricalPath(source, name, bytes);
    const head = deleteHistoricalPath(source, name);
    assertPrivateHistoryRefusal(() => verifyValidationHistory(source, head), name);
  });
}

test('history privacy refuses before pack creation or index import', (t) => {
  const { source } = historyFixture(t);
  commitHistoricalPath(source, '.env');
  const head = deleteHistoricalPath(source, '.env');
  const destination = temporaryCheckout(t, 'protected-validation-history-import-', 'destination');
  mkdirSync(destination);
  git(destination, 'init', '--quiet');
  const harness = temporaryCheckout(t, 'protected-validation-history-import-', 'bin');
  mkdirSync(harness);
  const callsPath = path.join(harness, 'calls.jsonl');
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const wrapper = path.join(harness, 'git');
  writeFileSync(
    wrapper,
    `#!${process.execPath}\nconst fs = require('node:fs');\nconst { spawnSync } = require('node:child_process');\nconst args = process.argv.slice(2);\nfs.appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify(args) + '\\n');\nif (args.some(arg => ['pack-objects', 'index-pack', 'push'].includes(arg))) process.exit(97);\nconst result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: 'inherit' });\nprocess.exit(result.status ?? 98);\n`,
  );
  chmodSync(wrapper, 0o755);
  const originalPath = process.env.PATH;
  let refusal;
  try {
    process.env.PATH = harness + path.delimiter + originalPath;
    try {
      importValidationHistory({ source, destination, sourceHead: head });
    } catch (error) {
      refusal = error;
    }
  } finally {
    process.env.PATH = originalPath;
  }
  const calls = readFileSync(callsPath, 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(calls.length > 0, 'the history boundary must execute real Git metadata commands');
  assert.equal(
    calls.some((args) => args.some((arg) => ['pack-objects', 'index-pack', 'push'].includes(arg))),
    false,
    'private history must be refused before any pack, import or push command',
  );
  assert.ok(refusal, 'private history must refuse');
  assert.match(refusal.message, /history|historical/i);
  assert.equal(refusal.message.includes('.env'), false);
  assert.deepEqual(readdirSync(path.join(destination, '.git/objects/pack')), []);
  assert.equal(existsSync(path.join(destination, '.git/index')), false);
  assertObjectUnavailable(destination, head);
});

test('history privacy pre-submission parent check refuses an already prepared legacy snapshot', (t) => {
  const { source } = historyFixture(t);
  commitHistoricalPath(source, '.env');
  const sourceHead = deleteHistoricalPath(source, '.env');
  const sourceTree = git(source, 'rev-parse', sourceHead + '^{tree}');
  // Reproduce the legacy transport parentage without invoking preparation, submission,
  // a provider, or any push. This is the exact check used by preparedContext.
  const legacySnapshot = git(
    source,
    'commit-tree',
    sourceTree,
    '-p',
    sourceHead,
    '-m',
    'synthetic legacy snapshot',
  );
  assert.equal(git(source, 'rev-parse', legacySnapshot + '^'), sourceHead);
  assertPrivateHistoryRefusal(() => validationCommitParent(source, legacySnapshot), '.env');
  assert.equal(git(source, 'rev-parse', 'HEAD'), sourceHead);
});

function metadataGitHarness(t, rules = []) {
  const bin = temporaryCheckout(t, 'protected-validation-history-controls-', 'bin');
  mkdirSync(bin);
  const calls = path.join(bin, 'calls.jsonl');
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const wrapper = path.join(bin, 'git');
  writeFileSync(
    wrapper,
    `#!${process.execPath}
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + '\\n');
if (args.includes('push')) process.exit(97);
const rule = ${JSON.stringify(rules)}.find(rule => rule.match.every(arg => args.includes(arg)));
if (rule?.delayMs) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, rule.delayMs);
if (rule && Object.hasOwn(rule, 'stdout')) {
  process.stdout.write(Buffer.from(rule.stdout, 'base64'));
  if (rule.stderr) process.stderr.write(Buffer.from(rule.stderr, 'base64'));
  process.exit(rule.status ?? 0);
}
const result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: 'inherit' });
process.exit(result.status ?? 98);
`,
  );
  chmodSync(wrapper, 0o755);
  return { bin, calls };
}

function withMetadataGit(harness, operation) {
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = harness.bin + path.delimiter + originalPath;
    return operation();
  } finally {
    process.env.PATH = originalPath;
  }
}

const metadataRule = (match, bytes, extras = {}) => ({
  match,
  stdout: Buffer.from(bytes).toString('base64'),
  ...extras,
});

function assertSanitizedHistoryError(error) {
  assert.ok(error instanceof Error);
  assert.match(error.message, /validation history/);
  for (const property of ['cause', 'stdout', 'stderr'])
    assert.equal(Object.hasOwn(error, property), false, `must omit ${property}`);
  assert.doesNotMatch(String(error), /artificial-private|artificial-stderr|artificial-stdout/);
}

const malformedHistoryMetadata = [
  ['invalid UTF-8 paths', ['ls-tree'], Buffer.from([0xff, 0])],
  ['truncated NUL path framing', ['ls-tree'], 'scripts/ordinary.mjs'],
  ['empty NUL path row', ['ls-tree'], '\0'],
  ['interior empty path row', ['ls-tree'], 'scripts\0\0'],
  ['duplicate path row', ['ls-tree'], 'README.md\0README.md\0'],
  ['ambiguous path metadata', ['ls-tree'], 'artificial-private-root.txt\0'],
  ['empty count', ['rev-list', '--count'], '\n'],
  ['truncated count', ['rev-list', '--count'], '4'],
  ['duplicate count rows', ['rev-list', '--count'], '4\n4\n'],
  ['noncanonical count', ['rev-list', '--count'], '04\n'],
  ['empty object inventory', ['rev-list', '--objects'], ''],
  ['object display names', ['rev-list', '--objects'], oid + ' artificial-private.txt\n'],
  ['missing object marker', ['rev-list', '--objects'], '?' + oid + '\n'],
  ['empty ancestry row', ['rev-list', '--parents'], '\n'],
  ['malformed ancestry row', ['rev-list', '--parents'], oid + ' \n'],
  ['duplicate ancestry row', ['rev-list', '--parents'], oid + '\n' + oid + '\n'],
  ['truncated graft metadata', ['rev-parse', '--git-path'], '.git/info/grafts'],
  ['multiple graft metadata rows', ['rev-parse', '--git-path'], '.git/info/grafts\nextra\n'],
];
for (const [label, match, bytes] of malformedHistoryMetadata) {
  test(`history control refuses ${label} without exposing captured metadata`, (t) => {
    const { source, sourceHead } = historyFixture(t);
    const harness = metadataGitHarness(t, [metadataRule(match, bytes)]);
    withMetadataGit(harness, () => {
      assert.throws(
        () => verifyValidationHistory(source, sourceHead),
        (error) => {
          assertSanitizedHistoryError(error);
          return true;
        },
      );
    });
  });
}

test('history control preserves a leading Unicode BOM in an actual historical path', (t) => {
  const source = temporaryCheckout(t, 'protected-validation-history-bom-', 'source');
  mkdirSync(source);
  git(source, 'init', '--quiet');
  git(source, 'config', 'user.name', 'Artificial history BOM');
  git(source, 'config', 'user.email', 'artificial-history-bom@invalid.local');
  git(source, 'config', 'commit.gpgsign', 'false');
  git(source, 'config', 'core.hooksPath', '/dev/null');
  const name = '\uFEFFREADME.md';
  const head = commitHistoricalPath(source, name);
  // Only this root file exists, so its UTF-8 BOM bytes begin ls-tree stdout.
  // Do not use sourceBasis/fixtureManifest: their separate trimming is not this guard.
  assert.equal(
    execFileSync('git', ['ls-tree', '-r', '-z', '--name-only', head], { cwd: source }).toString(),
    name + '\0',
  );
  assertPrivateHistoryRefusal(() => verifyValidationHistory(source, head), name);
});

test('history control permits a genuinely empty source tree', (t) => {
  const source = temporaryCheckout(t, 'protected-validation-history-empty-', 'source');
  mkdirSync(source);
  git(source, 'init', '--quiet');
  git(source, 'config', 'user.name', 'Artificial empty history');
  git(source, 'config', 'user.email', 'artificial-empty@invalid.local');
  git(source, 'config', 'commit.gpgsign', 'false');
  git(source, 'config', 'core.hooksPath', '/dev/null');
  git(source, 'commit', '--quiet', '--allow-empty', '-m', 'artificial empty tree');
  assert.equal(verifyValidationHistory(source, git(source, 'rev-parse', 'HEAD')), 1);
});

test('history control applies one overall deadline across cumulative Git metadata reads', (t) => {
  const { source, sourceHead } = historyFixture(t);
  const harness = metadataGitHarness(t, [{ match: [], delayMs: 100 }]);
  const started = performance.now();
  withMetadataGit(harness, () => {
    assert.throws(
      () => verifyValidationHistory(source, sourceHead, { timeoutMs: 650 }),
      (error) => {
        assertSanitizedHistoryError(error);
        return true;
      },
    );
  });
  assert.ok(performance.now() - started < 1500, 'the overall bound must not restart per Git read');
  const calls = readFileSync(harness.calls, 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(calls.length >= 3, 'the fixture must consume the deadline across several reads');
});

test('history control removes Git stdout stderr and causes from command failures', (t) => {
  const { source, sourceHead } = historyFixture(t);
  const harness = metadataGitHarness(t, [
    metadataRule(['rev-list', '--objects'], 'artificial-stdout .env /artificial-private\n', {
      stderr: Buffer.from('artificial-stderr .env /artificial-private\n').toString('base64'),
      status: 1,
    }),
  ]);
  withMetadataGit(harness, () => {
    assert.throws(
      () => verifyValidationHistory(source, sourceHead),
      (error) => {
        assert.equal(error.message, 'validation history operation failed');
        assertSanitizedHistoryError(error);
        assert.equal(error.message.includes('.env'), false);
        return true;
      },
    );
  });
});

test('history control rejects graft files and ignores replacements that would hide private ancestry', (t) => {
  const { source, baseline } = historyFixture(t);
  const graft = path.join(source, '.git/info/grafts');
  writeFileSync(graft, '');
  assert.throws(() => verifyValidationHistory(source, git(source, 'rev-parse', 'HEAD')), /grafted/);
  rmSync(graft);
  const privateHead = commitHistoricalPath(source, '.env');
  const head = deleteHistoricalPath(source, '.env');
  git(source, 'replace', privateHead, baseline);
  assertPrivateHistoryRefusal(() => verifyValidationHistory(source, head), '.env');
});

test('history control submitValidation rejects legacy private history before intent or push', async (t) => {
  const { source } = historyFixture(t);
  commitHistoricalPath(source, '.env');
  const sourceHead = deleteHistoricalPath(source, '.env');
  const basis = sourceBasis(source);
  const fixture = temporaryCheckout(t, 'protected-validation-history-submit-', 'runtime');
  const mailbox = path.join(fixture, '.effective-flow/protected-validation');
  const validationId = 'artificial-history-submit';
  const bootstrapId = 'artificial-bootstrap';
  const seed = (relative, value) => {
    const bytes = Buffer.from(JSON.stringify(value) + '\n');
    const destination = path.join(mailbox, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes, { flag: 'wx' });
    return { root: mailbox, path: relative, digest: digest(bytes) };
  };
  // This is artificial operator input, not native guard qualification or admission proof.
  const bootstrapRef = seed(
    `bootstraps/${bootstrapId}.json`,
    validateBootstrap({
      protocol: PROTECTED_VALIDATION_PROTOCOL,
      bootstrapId,
      physicalMailboxRoot: mailbox,
      policyDigest: digest(policy),
      initialInputDigest: digest('artificial input'),
      nativePolicyDigest: digest('artificial native policy'),
      guardEvidence: {
        kind: 'native-macos-seatbelt',
        workerDenied: true,
        descendantDenied: true,
        privateReadDenied: true,
        anchorDigest: digest('artificial anchor'),
        canaryRef: seed(`canaries/${bootstrapId}.txt`, 'artificial canary'),
      },
      admission: {
        runtimeStateRoot: fixture,
        repositoryIdentity: path.join(source, '.git'),
        runId: 'artificial-run',
        requestDigest: digest('artificial request association'),
        validatorHandle: 'artificial-validator',
        gate: 'validation',
      },
      policy,
    }),
  );
  const requestRef = seed('requests/artificial.json', {
    bootstrapRef,
    runId: 'artificial-run',
    requestDigest: digest('artificial request association'),
    validatorHandle: 'artificial-validator',
    gate: 'validation',
    policyDigest: digest(policy),
    validationId,
    execution: {
      executionRoot: source,
      branch: basis.branch,
      head: sourceHead,
      origin: 'in-place',
      owner: 'artificial history regression',
    },
    commands: [...VALIDATION_COMMANDS],
    nativeCases: [...REQUIRED_NATIVE_CASES],
  });
  const transport = temporaryCheckout(t, 'protected-validation-history-submit-', 'transport');
  git(path.dirname(transport), 'clone', '--quiet', '--no-local', source, transport);
  git(transport, 'config', 'user.name', 'Artificial legacy transport');
  git(transport, 'config', 'user.email', 'artificial-legacy@invalid.local');
  git(transport, 'config', 'commit.gpgsign', 'false');
  git(transport, 'config', 'core.hooksPath', '/dev/null');
  const tree = git(transport, 'rev-parse', sourceHead + '^{tree}');
  const legacySnapshot = git(
    transport,
    'commit-tree',
    tree,
    '-p',
    sourceHead,
    '-m',
    'artificial snapshot',
  );
  git(transport, 'update-ref', 'refs/heads/snapshot', legacySnapshot);
  git(transport, 'symbolic-ref', 'HEAD', 'refs/heads/snapshot');
  const preparationRef = seed(`preparations/${validationId}.json`, {
    ...preparation,
    requestRef,
    bootstrapRef,
    localSnapshot: basis.snapshot,
    exportManifestRef: seed('exports/artificial.json', fixtureManifest(source)),
    transportManifestRef: seed('manifests/artificial-transport.json', { artificial: true }),
    materializationManifestRef: seed('manifests/artificial-materialization.json', {
      artificial: true,
    }),
    snapshotBranch: `effective-flow/validation/${validationId}`,
    snapshotCommit: legacySnapshot,
    snapshotTree: tree,
    executionTree: tree,
  });
  seed(`private/preparations/${validationId}/context.json`, {
    sourceRoot: source,
    basis,
    transportRoot: transport,
  });
  const harness = metadataGitHarness(t);
  const originalPath = process.env.PATH;
  let refusal;
  try {
    process.env.PATH = harness.bin + path.delimiter + originalPath;
    await submitValidation({ preparationRef });
  } catch (error) {
    refusal = error;
  } finally {
    process.env.PATH = originalPath;
  }
  assertSanitizedHistoryError(refusal);
  assert.equal(refusal.message, 'private, ambiguous or unsafe validation history path');
  const calls = readFileSync(harness.calls, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(
    calls.some((args) => args.includes('push')),
    false,
  );
  for (const suffix of ['intent', 'create-only-command', 'outcome'])
    assert.equal(
      existsSync(path.join(mailbox, `private/submissions/${validationId}-${suffix}.json`)),
      false,
    );
  assert.equal(existsSync(path.join(mailbox, `submissions/${validationId}.json`)), false);
  assert.deepEqual(sourceBasis(source), basis);
});

function assertObjectUnavailable(checkout, object) {
  assert.notEqual(
    spawnSync('git', ['cat-file', '-e', object], { cwd: checkout }).status,
    0,
    `unrelated private object ${object} leaked into ${checkout}`,
  );
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('materialization bounds a hanging commit-tree and leaves no proof or partial execution repository', (t) => {
  const source = sourceFixture(t);
  const manifest = fixtureManifest(source);
  const transport = temporaryCheckout(t, 'protected-validation-timeout-', 'transport');
  const execution = temporaryCheckout(t, 'protected-validation-timeout-', 'execution');
  const mapping = createTransport({ source, destination: transport, manifest });
  const harnessRoot = mkdtempSync(path.join(tmpdir(), 'protected-validation-timeout-harness-'));
  t.after(() => rmSync(harnessRoot, { recursive: true, force: true }));
  const fakeBin = path.join(harnessRoot, 'bin');
  mkdirSync(fakeBin);
  const descendantPid = path.join(harnessRoot, 'descendant.pid');
  const fakeGitPid = path.join(harnessRoot, 'fake-git.pid');
  const descendant = path.join(harnessRoot, 'ignore-term.cjs');
  writeFileSync(
    descendant,
    `const fs = require('node:fs');\nfs.writeFileSync(${JSON.stringify(descendantPid)}, String(process.pid));\nprocess.on('SIGTERM', () => {});\nsetInterval(() => {}, 1000);\n`,
  );
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const fakeGit = path.join(fakeBin, 'git');
  writeFileSync(
    fakeGit,
    `#!/bin/sh\nif [ "$1" = "commit-tree" ]; then\n  echo $$ > ${JSON.stringify(fakeGitPid)}\n  ${JSON.stringify(process.execPath)} ${JSON.stringify(descendant)} >/dev/null 2>&1 &\n  while [ ! -f ${JSON.stringify(descendantPid)} ]; do sleep 0.01; done\n  trap ':' TERM INT\n  while :; do sleep 1; done\nfi\nexec ${JSON.stringify(realGit)} "$@"\n`,
  );
  chmodSync(fakeGit, 0o755);
  const harness = path.join(harnessRoot, 'run.mjs');
  const projection = path.resolve('scripts/protected-validation-projection.mjs');
  const runner = path.resolve('scripts/protected-validation-runner.mjs');
  writeFileSync(
    harness,
    `const { materializeTransport } = await import(${JSON.stringify(projection)});\nconst { boundedExecFileSync } = await import(${JSON.stringify(runner)});\ntry {\n  await materializeTransport({ checkout: ${JSON.stringify(transport)}, destination: ${JSON.stringify(execution)}, expectedCommit: ${JSON.stringify(mapping.snapshotCommit)}, runGit(cwd, args, timeoutMs) { return boundedExecFileSync('git', args, { cwd, encoding: 'utf8', timeoutMs: args[0] === 'commit-tree' ? 250 : timeoutMs, operation: args.find((arg) => !arg.startsWith('-')) ?? 'git', diagnosticKind: 'MATERIALIZATION' }).trim(); } });\n  process.stdout.write('UNEXPECTED_SUCCESS\\n');\n  process.exitCode = 2;\n} catch (error) {\n  process.stderr.write(String(error?.message ?? error) + '\\n');\n  if (!String(error?.message ?? error).includes('commit-tree')) process.exitCode = 3;\n}\n`,
  );
  const started = Date.now();
  const result = spawnSync(process.execPath, [harness], {
    cwd: harnessRoot,
    env: { ...process.env, PATH: `${fakeBin}:${path.dirname(realGit)}:/usr/bin:/bin` },
    encoding: 'utf8',
    timeout: 4000,
    killSignal: 'SIGKILL',
  });
  const elapsed = Date.now() - started;
  t.after(() => {
    for (const pidPath of [descendantPid, fakeGitPid]) {
      if (!existsSync(pidPath)) continue;
      const pid = Number(readFileSync(pidPath, 'utf8'));
      if (Number.isInteger(pid) && pid > 1) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {}
      }
    }
  });
  assert.equal(
    result.error,
    undefined,
    `outer watchdog fired: ${result.error?.code ?? result.error}`,
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(elapsed < 3500, `bounded materialization took ${elapsed} ms`);
  assert.match(
    result.stderr,
    /^EF_PROTECTED_VALIDATION_MATERIALIZATION_TIMEOUT .*operation=commit-tree .*timeoutMs=250/m,
  );
  const processEvents = result.stderr
    .split('\n')
    .filter((line) => line.startsWith('EF_PROTECTED_VALIDATION_PROCESS '))
    .map((line) => JSON.parse(line.slice('EF_PROTECTED_VALIDATION_PROCESS '.length)));
  const healthy = processEvents.filter((event) => event.operation !== 'commit-tree');
  assert.ok(healthy.length > 0);
  assert.equal(healthy.length % 2, 0);
  // Shared history reads consume the default budget; allow only elapsed time and
  // the single millisecond floor used to calculate each remaining deadline.
  const minimumHealthyTimeout = 120000 - elapsed - 1;
  for (let index = 0; index < healthy.length; index += 2) {
    const start = healthy[index],
      end = healthy[index + 1];
    assert.equal(start.phase, 'start');
    assert.equal(end.phase, 'end');
    assert.equal(end.operationId, start.operationId);
    assert.equal(end.operation, start.operation);
    assert.ok(Number.isSafeInteger(start.timeoutMs) && start.timeoutMs > 0);
    assert.ok(start.timeoutMs >= minimumHealthyTimeout && start.timeoutMs <= 120000);
    assert.equal(end.timeoutMs, start.timeoutMs);
    assert.notEqual(start.timedOut, true);
    assert.equal(end.timedOut, false);
  }
  const hanging = processEvents.filter((event) => event.operation === 'commit-tree');
  assert.equal(hanging.length, 2);
  assert.equal(hanging[0].phase, 'start');
  assert.equal(hanging[0].timeoutMs, 250);
  assert.equal(hanging[1].phase, 'end');
  assert.equal(hanging[1].timeoutMs, 250);
  assert.equal(hanging[1].timedOut, true);
  assert.equal(hanging[1].errorCode, 'ETIMEDOUT');
  assert.equal(hanging[1].signal, 'SIGKILL');
  t.diagnostic(
    result.stderr
      .split('\n')
      .filter((line) => line.includes('commit-tree'))
      .join('\n'),
  );
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /^EF_PROTECTED_VALIDATION \{/m);
  assert.equal(existsSync(descendantPid), true, 'the SIGTERM-ignoring descendant was created');
  assert.equal(existsSync(fakeGitPid), true, 'the hanging fake git process was created');
  const descendantProcess = Number(readFileSync(descendantPid, 'utf8')),
    fakeGitProcess = Number(readFileSync(fakeGitPid, 'utf8'));
  assert.equal(
    processAlive(descendantProcess),
    false,
    'descendant must be gone before fallback cleanup',
  );
  assert.equal(
    processAlive(fakeGitProcess),
    false,
    'fake git must be gone before fallback cleanup',
  );
  assert.equal(
    existsSync(execution),
    false,
    'timed-out materialization must remove partial execution checkout',
  );
});

test('transport preserves complete merged source history for a baseline clone without importing unrelated private objects or mutating the source', (t) => {
  const { source, sourceHead, baseline } = historyFixture(t);
  const privateBlob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
    cwd: source,
    input: 'private bytes outside the source ancestry\n',
    encoding: 'utf8',
  }).trim();
  const privateTree = execFileSync('git', ['mktree'], {
    cwd: source,
    input: `100644 blob ${privateBlob}\tprivate.txt\n`,
    encoding: 'utf8',
  }).trim();
  const privateCommit = git(source, 'commit-tree', privateTree, '-m', 'unrelated private root');
  git(source, 'update-ref', 'refs/private/unrelated', privateCommit);
  const reachable = new Set(
    git(source, 'rev-list', '--objects', sourceHead)
      .split('\n')
      .map((line) => line.split(' ')[0]),
  );
  assert.equal(reachable.has(privateCommit), false);
  assert.equal(reachable.has(privateBlob), false);

  writeFileSync(path.join(source, 'README.md'), 'staged candidate\n');
  git(source, 'add', 'README.md');
  writeFileSync(path.join(source, 'README.md'), 'working candidate\n');
  rmSync(path.join(source, 'scripts/historical-only.txt'));
  const before = sourceBasis(source);
  const indexPath = path.resolve(source, git(source, 'rev-parse', '--git-path', 'index'));
  const indexBefore = readFileSync(indexPath);
  const manifest = fixtureManifest(source);
  const transport = temporaryCheckout(t, 'protected-validation-history-', 'transport');
  const execution = temporaryCheckout(t, 'protected-validation-history-', 'execution');
  const mapping = createTransport({ source, destination: transport, manifest });
  assert.deepEqual(
    git(transport, 'rev-list', '--parents', '-n', '1', mapping.snapshotCommit).split(/\s+/),
    [mapping.snapshotCommit, sourceHead],
  );
  assert.equal(git(transport, 'rev-parse', '--is-shallow-repository'), 'false');
  assert.equal(
    git(transport, 'ls-tree', '-r', '--name-only', 'HEAD').includes('.github/workflows/ci.yml'),
    false,
  );
  const materialized = materializeTransport({
    checkout: transport,
    destination: execution,
    expectedCommit: mapping.snapshotCommit,
  });
  assert.equal(materialized.sourceHead, sourceHead);
  assert.equal(materialized.executionTree, mapping.executionTree);
  assert.deepEqual(git(execution, 'rev-list', '--parents', '-n', '1', 'HEAD').split(/\s+/), [
    git(execution, 'rev-parse', 'HEAD'),
    sourceHead,
  ]);
  assert.equal(readFileSync(path.join(execution, 'README.md'), 'utf8'), 'working candidate\n');
  assert.equal(existsSync(path.join(execution, 'scripts/historical-only.txt')), false);
  assert.equal(
    readFileSync(path.join(execution, '.github/workflows/ci.yml'), 'utf8'),
    'name: inert\n',
  );
  assert.equal(statSync(path.join(execution, 'scripts/executable.sh')).mode & 0o111, 0o111);
  for (const checkout of [transport, execution]) {
    assert.notEqual(
      spawnSync('git', ['show-ref', '--verify', 'refs/private/unrelated'], { cwd: checkout })
        .status,
      0,
    );
    for (const object of [privateCommit, privateTree, privateBlob])
      assertObjectUnavailable(checkout, object);
    assert.equal(git(checkout, 'merge-base', '--is-ancestor', baseline, 'HEAD'), '');
    assert.equal(
      git(checkout, 'rev-parse', `${sourceHead}^1`),
      git(source, 'rev-parse', `${sourceHead}^1`),
    );
    assert.equal(
      git(checkout, 'rev-parse', `${sourceHead}^2`),
      git(source, 'rev-parse', `${sourceHead}^2`),
    );
  }

  // The real regression clones the materialized execution repository, then checks out
  // an older baseline. Cloning the original source or checking only HEAD misses it.
  const baselineClone = temporaryCheckout(t, 'protected-validation-baseline-', 'checkout');
  git(path.dirname(baselineClone), 'clone', '--quiet', '--no-local', execution, baselineClone);
  assert.equal(git(baselineClone, 'merge-base', '--is-ancestor', baseline, 'HEAD'), '');
  git(baselineClone, 'checkout', '--quiet', '--detach', baseline);
  assert.equal(git(baselineClone, 'rev-parse', 'HEAD'), baseline);
  assert.equal(
    readFileSync(path.join(baselineClone, 'README.md'), 'utf8'),
    'historical baseline\n',
  );
  assert.equal(
    readFileSync(path.join(baselineClone, 'scripts/historical-only.txt'), 'utf8'),
    'deleted from the candidate\n',
  );
  assert.equal(
    readFileSync(path.join(baselineClone, '.github/workflows/ci.yml'), 'utf8'),
    'name: inert\n',
  );
  assert.deepEqual(readFileSync(indexPath), indexBefore);
  assert.deepEqual(sourceBasis(source), before);
});

test('transport rejects shallow source history and materialization rejects shallow transport history', (t) => {
  const { source } = historyFixture(t);
  const shallowSource = temporaryCheckout(t, 'protected-validation-shallow-', 'source');
  git(
    path.dirname(shallowSource),
    'clone',
    '--quiet',
    '--depth=1',
    `file://${source}`,
    shallowSource,
  );
  assert.equal(git(shallowSource, 'rev-parse', '--is-shallow-repository'), 'true');
  assert.throws(
    () =>
      createTransport({
        source: shallowSource,
        destination: temporaryCheckout(t, 'protected-validation-shallow-', 'rejected-transport'),
        manifest: fixtureManifest(shallowSource),
      }),
    /shallow/,
  );

  const transport = temporaryCheckout(t, 'protected-validation-history-', 'transport');
  const mapping = createTransport({
    source,
    destination: transport,
    manifest: fixtureManifest(source),
  });
  const shallowTransport = temporaryCheckout(t, 'protected-validation-shallow-', 'transport');
  git(
    path.dirname(shallowTransport),
    'clone',
    '--quiet',
    '--depth=1',
    `file://${transport}`,
    shallowTransport,
  );
  assert.equal(git(shallowTransport, 'rev-parse', '--is-shallow-repository'), 'true');
  assert.throws(
    () =>
      materializeTransport({
        checkout: shallowTransport,
        destination: temporaryCheckout(t, 'protected-validation-shallow-', 'execution'),
        expectedCommit: mapping.snapshotCommit,
      }),
    /shallow|history|parent/,
  );
});

test('transport rejects incomplete source ancestry instead of substituting a root snapshot', (t) => {
  const { source, baseline } = historyFixture(t);
  const manifest = fixtureManifest(source);
  rmSync(path.join(source, '.git/objects', baseline.slice(0, 2), baseline.slice(2)));
  assert.throws(
    () =>
      createTransport({
        source,
        destination: temporaryCheckout(t, 'protected-validation-incomplete-', 'transport'),
        manifest,
      }),
    (error) => {
      assert.equal(error.message, 'validation history operation failed');
      assertSanitizedHistoryError(error);
      assert.equal(error.message.includes(baseline), false);
      assert.equal(error.message.includes(source), false);
      return true;
    },
  );
});

test('materialization binds the approved snapshot SHA and rejects multiple synthetic parents', (t) => {
  const { source, sourceHead, baseline } = historyFixture(t);
  const transport = temporaryCheckout(t, 'protected-validation-history-', 'transport');
  const mapping = createTransport({
    source,
    destination: transport,
    manifest: fixtureManifest(source),
  });
  for (const parents of [[baseline], [sourceHead, baseline]]) {
    const forged = git(
      transport,
      'commit-tree',
      mapping.snapshotTree,
      ...parents.flatMap((parent) => ['-p', parent]),
      '-m',
      'forged snapshot topology',
    );
    git(transport, 'update-ref', 'refs/heads/snapshot', forged);
    assert.throws(
      () =>
        materializeTransport({
          checkout: transport,
          destination: temporaryCheckout(t, 'protected-validation-forged-', 'execution'),
          expectedCommit: parents.length === 1 ? mapping.snapshotCommit : forged,
        }),
      /commit mismatch|parent|source head|source HEAD|history/,
    );
  }
});

test('transport rejects source ancestry that would exceed the fixed Actions checkout depth', (t) => {
  const { source, sourceHead } = historyFixture(t);
  const count = Number(git(source, 'rev-list', '--count', sourceHead));
  const branch = git(source, 'symbolic-ref', 'HEAD');
  const commits = [];
  for (let index = count; index < VALIDATION_HISTORY_DEPTH; index += 1) {
    commits.push(
      `commit ${branch}\nmark :${index + 1}\ncommitter Protected validation history <protected-validation-history@invalid.local> 946684800 +0000\ndata 0\nfrom ${index === count ? sourceHead : ':' + index}\n\n`,
    );
  }
  execFileSync('git', ['fast-import', '--quiet'], {
    cwd: source,
    input: commits.join('') + 'done\n',
  });
  assert.equal(Number(git(source, 'rev-list', '--count', 'HEAD')), VALIDATION_HISTORY_DEPTH);
  assert.throws(
    () =>
      createTransport({
        source,
        destination: temporaryCheckout(t, 'protected-validation-excess-history-', 'transport'),
        manifest: fixtureManifest(source),
      }),
    /history|depth|bound|4096/,
  );
});
