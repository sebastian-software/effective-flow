import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
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
  validationDigest,
} from '../src/scripts/protected-validation-protocol.mjs';
import {
  createTransport,
  materializeTransport,
  sourceBasis,
} from '../scripts/protected-validation-projection.mjs';
import { projectManifest } from '../src/scripts/protected-validation-core.mjs';
import { parseExecutionLogs, unzipLogs } from '../scripts/protected-validation-backend.mjs';

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

function temporaryCheckout(t, prefix, leaf) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return path.join(root, leaf);
}

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

function assertObjectUnavailable(checkout, object) {
  assert.notEqual(
    spawnSync('git', ['cat-file', '-e', object], { cwd: checkout }).status,
    0,
    `unrelated private object ${object} leaked into ${checkout}`,
  );
}

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
    new RegExp(`Could not read ${baseline}`),
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
