import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const workflow = readFileSync(
  path.join(root, '.github/workflows/protected-macos-validation.yml'),
  'utf8',
);
const protocol = readFileSync(
  path.join(root, 'src/scripts/protected-validation-protocol.mjs'),
  'utf8',
);
const {
  acquirePublishedSource,
  capturePublishedInputs,
  verifyPublishedInputs,
  productEnvironment,
  captureValidationInputs,
  nativeOutcomes,
  verifyValidationInputs,
} = await import('../scripts/protected-macos-validation.mjs');
const { CLOSURE_PATHS, PUBLISHED_CLOSURE_PATHS, VALIDATION_HISTORY_DEPTH, validationDigest } =
  await import('../src/scripts/protected-validation-protocol.mjs');
const { projectManifest } = await import('../src/scripts/protected-validation-core.mjs');
const { createTransport, materializeTransport, sourceBasis, verifyExecutionFile } =
  await import('../scripts/protected-validation-projection.mjs');

test('protected workflow is bounded to the validation snapshot push and read-only hosted macOS ARM lane', () => {
  assert.match(workflow, /push:\s*\n\s+branches: \['effective-flow\/validation\/\*'\]/);
  assert.match(workflow, /runs-on: macos-15/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(workflow, /contents:\s*write|actions:\s*write|secrets\.|GITHUB_TOKEN/);
  for (const action of ['actions/checkout', 'pnpm/action-setup', 'actions/setup-node'])
    assert.match(workflow, new RegExp(`uses:\\s+${action.replace('/', '\\/')}@`));
});

test('workflow checkout imports one fixed positive history depth matching the bounded transport limit', () => {
  const depths = [...workflow.matchAll(/^\s+fetch-depth:\s*(\d+)\s*$/gm)];
  assert.equal(depths.length, 1);
  assert.equal(Number(depths[0][1]), VALIDATION_HISTORY_DEPTH);
  assert.equal(VALIDATION_HISTORY_DEPTH, 4096);
  assert.ok(VALIDATION_HISTORY_DEPTH > 0);
  assert.doesNotMatch(
    workflow,
    /git\s+fetch|fetch-depth:\s*0(?:\s|$)|refs\/heads\/\*|fetch-tags:\s*true/,
  );
});

test('workflow runner preserves the approved command order and requires every native case by literal name', () => {
  const commands = [
    'pnpm test:preflight',
    'pnpm agent:check',
    'pnpm test',
    'node build.mjs',
    'pnpm test:distribution',
  ];
  let previous = -1;
  for (const command of commands) {
    const literal = protocol.indexOf(`'${command}'`);
    assert.ok(literal >= 0, `missing command literal: ${command}`);
    assert.ok(literal > previous, `command order changed: ${command}`);
    previous = literal;
  }
  const nativeCases = [
    'actual Codex native guard permits fixture Git push and missing stub ledger while denying host writes in descendants',
    'production coordinator initializes native trust before capture and preserves raw outcomes before postcheck failure',
    'E2 actual launch wrapper checks a realpath write denial inherited by its child process',
    'production probeHelper captures actual subprocess start/completion and oversized rejection without a model',
    'macOS sandbox probe observes an outer seatbelt denial',
  ];
  for (const name of nativeCases)
    assert.ok(protocol.includes(name), `missing native case: ${name}`);
  const tap = nativeCases.map((name, index) => `ok ${index + 1} - ${name}`).join('\n');
  assert.deepEqual(
    nativeOutcomes(tap).map(({ outcome }) => outcome),
    nativeCases.map(() => 'passed'),
  );
  assert.deepEqual(
    nativeOutcomes(tap.replace(`ok 1 - ${nativeCases[0]}`, `ok 1 - ${nativeCases[0]} # SKIP`))[0]
      .outcome,
    'skipped',
  );
  assert.throws(() => nativeOutcomes(tap.split('\n').slice(1).join('\n')), /absent or duplicated/);
  assert.throws(() => nativeOutcomes(`${tap}\n${tap.split('\n')[0]}`), /absent or duplicated/);
});

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function immutableFixture(t) {
  const source = mkdtempSync(path.join(tmpdir(), 'protected-validation-workflow-'));
  t.after(() => rmSync(source, { recursive: true, force: true }));
  mkdirSync(path.join(source, '.github/workflows'), { recursive: true });
  mkdirSync(path.join(source, 'scripts'), { recursive: true });
  mkdirSync(path.join(source, 'src'), { recursive: true });
  for (const relative of Object.values(CLOSURE_PATHS)) {
    mkdirSync(path.dirname(path.join(source, relative)), { recursive: true });
    writeFileSync(path.join(source, relative), readFileSync(path.join(root, relative)));
  }
  writeFileSync(path.join(source, '.github/workflows/ci.yml'), 'name: inert\n');
  writeFileSync(path.join(source, 'src/main.mjs'), 'export const main = true;\n');
  git(source, 'init', '--quiet');
  git(source, 'config', 'user.name', 'Protected validation test');
  git(source, 'config', 'user.email', 'protected-validation-test@invalid.local');
  git(source, 'add', '.');
  git(source, 'commit', '--quiet', '-m', 'fixture');
  const before = sourceBasis(source);
  const manifest = projectManifest(before.files, {
    trackedPaths: before.trackedPaths,
    snapshot: before.snapshot,
  });
  const transport = path.join(
    mkdtempSync(path.join(tmpdir(), 'protected-validation-transport-')),
    'transport',
  );
  const execution = path.join(
    mkdtempSync(path.join(tmpdir(), 'protected-validation-execution-')),
    'execution',
  );
  t.after(() => {
    rmSync(path.dirname(transport), { recursive: true, force: true });
    rmSync(path.dirname(execution), { recursive: true, force: true });
  });
  const mapping = createTransport({ source, destination: transport, manifest });
  const materialized = materializeTransport({
    checkout: transport,
    destination: execution,
    expectedCommit: mapping.snapshotCommit,
  });
  return { source, transport, execution, materialized };
}

test('validation input snapshot is immutable across manifest, execution-file and closure drift', (t) => {
  const fixture = immutableFixture(t);
  const expected = captureValidationInputs({
    checkout: fixture.transport,
    executionRoot: fixture.execution,
    materialized: fixture.materialized,
  });
  assert.doesNotThrow(() =>
    verifyValidationInputs({
      checkout: fixture.transport,
      executionRoot: fixture.execution,
      expected,
    }),
  );

  writeFileSync(path.join(fixture.execution, 'src/main.mjs'), 'export const main = false;\n');
  assert.throws(
    () =>
      verifyValidationInputs({
        checkout: fixture.transport,
        executionRoot: fixture.execution,
        expected,
      }),
    /source projection drift|materialized content mismatch|initial execution file/,
  );
  writeFileSync(path.join(fixture.execution, 'src/main.mjs'), 'export const main = true;\n');

  const manifestPath = path.join(fixture.transport, '.protected-validation/materialization.json');
  const originalManifestBytes = readFileSync(manifestPath),
    originalManifest = JSON.parse(originalManifestBytes);
  const executionFile = path.join(fixture.execution, 'src/main.mjs'),
    originalExecutionBytes = readFileSync(executionFile);
  const originalTree = git(fixture.execution, 'write-tree');
  const indexPath = path.resolve(
    fixture.execution,
    git(fixture.execution, 'rev-parse', '--git-path', 'index'),
  );
  const originalIndex = readFileSync(indexPath);
  // Exact previous vulnerability: mutable metadata erases the expected set while working
  // bytes change. The Git index stays intact, so the previous two checks both succeeded.
  writeFileSync(manifestPath, JSON.stringify({ ...originalManifest, executionFiles: [] }) + '\n');
  writeFileSync(executionFile, 'export const main = "mutated after checks";\n');
  assert.doesNotThrow(() => {
    for (const entry of JSON.parse(readFileSync(manifestPath, 'utf8')).executionFiles)
      verifyExecutionFile(fixture.execution, entry);
    assert.equal(git(fixture.execution, 'write-tree'), fixture.materialized.executionTree);
  });
  assert.equal(git(fixture.execution, 'write-tree'), originalTree);
  assert.deepEqual(
    readFileSync(indexPath),
    originalIndex,
    'the exploit leaves the actual Git index bytes unchanged',
  );
  assert.throws(
    () =>
      verifyValidationInputs({
        checkout: fixture.transport,
        executionRoot: fixture.execution,
        expected,
      }),
    /materialization metadata changed/,
  );
  writeFileSync(manifestPath, originalManifestBytes);
  // The in-memory list still detects changed working bytes once original metadata returns.
  assert.throws(
    () =>
      verifyValidationInputs({
        checkout: fixture.transport,
        executionRoot: fixture.execution,
        expected,
      }),
    /source projection drift/,
  );
  writeFileSync(executionFile, originalExecutionBytes);
  assert.ok(
    Object.isFrozen(expected) &&
      Object.isFrozen(expected.executionFiles) &&
      expected.executionFiles.every(Object.isFrozen) &&
      Object.isFrozen(expected.closure.actions),
  );
  assert.throws(
    () =>
      captureValidationInputs({
        checkout: fixture.transport,
        executionRoot: fixture.execution,
        materialized: {
          ...fixture.materialized,
          materializationDigest: validationDigest('foreign manifest'),
        },
      }),
    /initial materialization digest differs/,
  );
  const transportPath = path.join(fixture.transport, '.protected-validation/transport.json'),
    originalTransportBytes = readFileSync(transportPath);
  writeFileSync(transportPath, Buffer.concat([originalTransportBytes, Buffer.from(' ')]));
  assert.throws(
    () =>
      verifyValidationInputs({
        checkout: fixture.transport,
        executionRoot: fixture.execution,
        expected,
      }),
    /transport metadata changed/,
  );
  writeFileSync(transportPath, originalTransportBytes);
  chmodSync(executionFile, 0o755);
  assert.throws(
    () =>
      verifyValidationInputs({
        checkout: fixture.transport,
        executionRoot: fixture.execution,
        expected,
      }),
    /source projection drift/,
  );
  chmodSync(executionFile, 0o644);
  const closurePath = path.join(
      fixture.transport,
      '.github/workflows/protected-macos-validation.yml',
    ),
    originalClosureBytes = readFileSync(closurePath);
  writeFileSync(
    path.join(fixture.transport, '.github/workflows/protected-macos-validation.yml'),
    'name: mutated\n',
  );
  assert.throws(
    () =>
      verifyValidationInputs({
        checkout: fixture.transport,
        executionRoot: fixture.execution,
        expected,
      }),
    /closure|digest|drift|workflow/,
  );
  writeFileSync(closurePath, originalClosureBytes);
  assert.doesNotThrow(() =>
    verifyValidationInputs({
      checkout: fixture.transport,
      executionRoot: fixture.execution,
      expected,
    }),
  );
});

test('validation rejects execution HEAD replacement, parent substitution and shallow history while file bytes and index stay unchanged', (t) => {
  const fixture = immutableFixture(t);
  const expected = captureValidationInputs({
    checkout: fixture.transport,
    executionRoot: fixture.execution,
    materialized: fixture.materialized,
  });
  const indexPath = path.resolve(
    fixture.execution,
    git(fixture.execution, 'rev-parse', '--git-path', 'index'),
  );
  const indexBefore = readFileSync(indexPath);
  const workingBefore = sourceBasis(fixture.execution);
  const metadata = ['materialization.json', 'transport.json'].map((name) => ({
    path: path.join(fixture.transport, '.protected-validation', name),
    bytes: readFileSync(path.join(fixture.transport, '.protected-validation', name)),
  }));
  const verify = () =>
    verifyValidationInputs({
      checkout: fixture.transport,
      executionRoot: fixture.execution,
      expected,
    });
  const unchangedFiles = () => {
    assert.deepEqual(readFileSync(indexPath), indexBefore);
    const actual = sourceBasis(fixture.execution);
    assert.deepEqual(actual.files, workingBefore.files);
    assert.equal(actual.snapshot.index, workingBefore.snapshot.index);
    assert.equal(actual.snapshot.workingTree, workingBefore.snapshot.workingTree);
    assert.equal(actual.snapshot.untracked, workingBefore.snapshot.untracked);
    for (const entry of metadata) assert.deepEqual(readFileSync(entry.path), entry.bytes);
  };
  const replacement = git(
    fixture.execution,
    'commit-tree',
    expected.executionTree,
    '-p',
    expected.sourceHead,
    '-m',
    'same tree and parent, foreign execution identity',
  );
  assert.notEqual(replacement, expected.executionCommit);
  git(fixture.execution, 'update-ref', 'refs/heads/execution', replacement);
  unchangedFiles();
  assert.throws(verify, /execution Git history changed/);
  git(fixture.execution, 'update-ref', 'refs/heads/execution', expected.executionCommit);
  assert.doesNotThrow(verify);

  const foreignParent = git(
    fixture.execution,
    'commit-tree',
    expected.executionTree,
    '-m',
    'foreign root parent',
  );
  const wrongParent = git(
    fixture.execution,
    'commit-tree',
    expected.executionTree,
    '-p',
    foreignParent,
    '-m',
    'same tree with a foreign parent',
  );
  git(fixture.execution, 'update-ref', 'refs/heads/execution', wrongParent);
  unchangedFiles();
  assert.throws(verify, /execution Git history changed/);
  git(fixture.execution, 'update-ref', 'refs/heads/execution', expected.executionCommit);

  const shallowPath = path.resolve(
    fixture.execution,
    git(fixture.execution, 'rev-parse', '--git-path', 'shallow'),
  );
  writeFileSync(shallowPath, expected.executionCommit + '\n');
  assert.equal(git(fixture.execution, 'rev-parse', '--is-shallow-repository'), 'true');
  unchangedFiles();
  assert.throws(verify, /shallow|history|one parent/);
  rmSync(shallowPath);
  assert.doesNotThrow(verify);
  unchangedFiles();
});

test('both subprocess helpers are original closure bytes preserved through transport and rejected on omission or tamper', (t) => {
  const fixture = immutableFixture(t);
  const expected = captureValidationInputs({
    checkout: fixture.transport,
    executionRoot: fixture.execution,
    materialized: fixture.materialized,
  });
  const helpers = {
    runnerHelperDigest: 'scripts/protected-validation-runner.mjs',
    watchdogDigest: 'scripts/protected-validation-watchdog.mjs',
  };
  for (const [key, relative] of Object.entries(helpers)) {
    assert.equal(CLOSURE_PATHS[key], relative);
    const original = readFileSync(path.join(fixture.source, relative));
    assert.deepEqual(readFileSync(path.join(fixture.execution, relative)), original);
    assert.equal(expected.closure[key], validationDigest(original));
    const transported = path.join(fixture.transport, relative);
    assert.deepEqual(readFileSync(transported), original);
    rmSync(transported);
    assert.throws(() =>
      captureValidationInputs({
        checkout: fixture.transport,
        executionRoot: fixture.execution,
        materialized: fixture.materialized,
      }),
    );
    writeFileSync(transported, Buffer.concat([original, Buffer.from('\n// tampered\n')]));
    assert.throws(
      () =>
        verifyValidationInputs({
          checkout: fixture.transport,
          executionRoot: fixture.execution,
          expected,
        }),
      /closure|digest|drift/,
    );
    writeFileSync(transported, original);
    assert.doesNotThrow(() =>
      verifyValidationInputs({
        checkout: fixture.transport,
        executionRoot: fixture.execution,
        expected,
      }),
    );
  }
});

function publishedInputFixture(t) {
  const workspace = mkdtempSync(path.join(tmpdir(), 'published-validation-inputs-'));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const checkout = path.join(workspace, 'trusted'),
    executionRoot = path.join(workspace, 'execution');
  mkdirSync(checkout);
  for (const relative of new Set([
    ...Object.values(PUBLISHED_CLOSURE_PATHS),
    ...readdirSync(path.join(root, '.github/workflows')).map((name) => `.github/workflows/${name}`),
  ])) {
    mkdirSync(path.dirname(path.join(checkout, relative)), { recursive: true });
    writeFileSync(path.join(checkout, relative), readFileSync(path.join(root, relative)));
  }
  writeFileSync(path.join(checkout, 'README.md'), 'Synthetic original source.\n');
  writeFileSync(path.join(checkout, 'src/binary.bin'), Buffer.from([0, 255, 128, 13, 10]));
  writeFileSync(path.join(checkout, 'scripts/executable.sh'), '#!/bin/sh\nexit 0\n');
  chmodSync(path.join(checkout, 'scripts/executable.sh'), 0o755);
  git(checkout, 'init', '--quiet');
  git(checkout, 'config', 'user.name', 'Published inputs test');
  git(checkout, 'config', 'user.email', 'published-inputs@invalid.local');
  git(checkout, 'config', 'commit.gpgsign', 'false');
  git(checkout, 'config', 'core.hooksPath', '/dev/null');
  writeFileSync(path.join(checkout, '.env'), 'ARTIFICIAL_HISTORY=not-a-real-secret\n');
  git(checkout, 'add', '.');
  git(checkout, 'commit', '--quiet', '-m', 'synthetic original ancestry');
  const historicalCommit = git(checkout, 'rev-parse', 'HEAD');
  git(checkout, 'rm', '--quiet', '.env');
  git(checkout, 'commit', '--quiet', '-m', 'synthetic final source');
  const sourceCommit = git(checkout, 'rev-parse', 'HEAD');
  git(workspace, 'clone', '--quiet', '--no-local', checkout, executionRoot);
  git(executionRoot, 'config', 'commit.gpgsign', 'false');
  git(executionRoot, 'config', 'core.hooksPath', '/dev/null');
  const input = { checkout, executionRoot, sourceCommit };
  return { ...input, historicalCommit, workspace, expected: capturePublishedInputs(input) };
}

test('published snapshot retains actual complete original ancestry and raw binary/executable member identity without synthetic parents', (t) => {
  const state = publishedInputFixture(t);
  assert.equal(state.expected.sourceCommit, git(state.executionRoot, 'rev-parse', 'HEAD'));
  assert.equal(state.expected.sourceTree, git(state.executionRoot, 'rev-parse', 'HEAD^{tree}'));
  assert.equal(git(state.executionRoot, 'rev-list', '--count', 'HEAD'), '2');
  assert.equal(git(state.executionRoot, 'rev-parse', 'HEAD^'), state.historicalCommit);
  assert.equal(git(state.executionRoot, 'rev-parse', '--is-shallow-repository'), 'false');
  assert.equal(
    state.expected.files.find((entry) => entry.path === 'src/binary.bin').digest,
    validationDigest(Buffer.from([0, 255, 128, 13, 10])),
  );
  assert.equal(
    state.expected.files.find((entry) => entry.path === 'scripts/executable.sh').mode,
    '100755',
  );
  assert.equal(
    state.expected.files.some((entry) => entry.path === '.env'),
    false,
  );
  assert.equal(
    git(state.executionRoot, 'show', state.historicalCommit + ':.env'),
    'ARTIFICIAL_HISTORY=not-a-real-secret',
  );
  assert.ok(
    Object.isFrozen(state.expected) &&
      Object.isFrozen(state.expected.files) &&
      state.expected.files.every(Object.isFrozen) &&
      Object.isFrozen(state.expected.closure.actions),
  );
  assert.doesNotThrow(() => verifyPublishedInputs(state));
});

for (const [label, mutate] of [
  [
    'modified source bytes',
    (s) => {
      writeFileSync(path.join(s.executionRoot, 'README.md'), 'changed source');
    },
  ],
  [
    'missing source member',
    (s) => {
      rmSync(path.join(s.executionRoot, 'README.md'));
    },
  ],
  [
    'executable mode drift',
    (s) => {
      chmodSync(path.join(s.executionRoot, 'scripts/executable.sh'), 0o644);
    },
  ],
  [
    'additional indexed source member',
    (s) => {
      writeFileSync(path.join(s.executionRoot, 'injected.mjs'), 'export const injected = true;');
      git(s.executionRoot, 'add', 'injected.mjs');
    },
  ],
  [
    'index-only source substitution',
    (s) => {
      git(s.executionRoot, 'update-index', '--force-remove', 'README.md');
    },
  ],
  [
    'index assume-unchanged bit drift',
    (s) => {
      git(s.executionRoot, 'update-index', '--assume-unchanged', 'README.md');
    },
  ],
  [
    'unchanged-tree HEAD replacement',
    (s) => {
      const next = git(
        s.executionRoot,
        'commit-tree',
        s.expected.sourceTree,
        '-p',
        s.historicalCommit,
        '-m',
        'foreign same-tree identity',
      );
      git(s.executionRoot, 'update-ref', 'HEAD', next);
    },
  ],
  [
    'shallow marker',
    (s) => {
      writeFileSync(path.join(s.executionRoot, '.git/shallow'), s.sourceCommit + '\n');
    },
  ],
  [
    'grafted original parents',
    (s) => {
      mkdirSync(path.join(s.executionRoot, '.git/info'), { recursive: true });
      writeFileSync(path.join(s.executionRoot, '.git/info/grafts'), s.sourceCommit + '\n');
    },
  ],
  [
    'replacement object',
    (s) => {
      git(s.executionRoot, 'replace', s.sourceCommit, s.historicalCommit);
    },
  ],
  [
    'alternate object store',
    (s) => {
      writeFileSync(
        path.join(s.executionRoot, '.git/objects/info/alternates'),
        path.join(s.checkout, '.git/objects') + '\n',
      );
    },
  ],
  [
    'missing original parent',
    (s) => {
      rmSync(path.join(s.executionRoot, '.git/objects'), { recursive: true });
      mkdirSync(path.join(s.executionRoot, '.git/objects'));
    },
  ],
  [
    'trusted runner helper tamper',
    (s) => {
      writeFileSync(
        path.join(s.checkout, PUBLISHED_CLOSURE_PATHS.runnerHelperDigest),
        'changed helper',
      );
    },
  ],
  [
    'trusted watchdog omission',
    (s) => {
      rmSync(path.join(s.checkout, PUBLISHED_CLOSURE_PATHS.watchdogDigest));
    },
  ],
  [
    'trusted admission tamper',
    (s) => {
      writeFileSync(
        path.join(s.checkout, PUBLISHED_CLOSURE_PATHS.admissionDigest),
        'changed admission',
      );
    },
  ],
  [
    'credential-bearing repository config',
    (s) => {
      git(s.executionRoot, 'config', '--local', 'http.extraheader', 'artificial-header');
    },
  ],
]) {
  test(`published source revalidation refuses ${label}`, (t) => {
    const state = publishedInputFixture(t);
    mutate(state);
    assert.throws(() => verifyPublishedInputs(state));
  });
}

test('published source capture rejects unsafe current members and never exposes historical bytes in diagnostics', (t) => {
  const state = publishedInputFixture(t);
  symlinkSync('README.md', path.join(state.executionRoot, 'unsafe-link'));
  git(state.executionRoot, 'add', 'unsafe-link');
  const tree = git(state.executionRoot, 'write-tree');
  const commit = git(
    state.executionRoot,
    'commit-tree',
    tree,
    '-p',
    state.sourceCommit,
    '-m',
    'synthetic unsafe current mode',
  );
  git(state.executionRoot, 'update-ref', 'HEAD', commit);
  assert.throws(
    () => capturePublishedInputs({ ...state, sourceCommit: commit }),
    (error) => {
      assert.doesNotMatch(
        error.message,
        /ARTIFICIAL_HISTORY|unsafe-link|\.env|published-validation-inputs-/,
      );
      return true;
    },
  );
});

test('published acquisition pins the existing public repository and strips credentials before its single fetch', (t) => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'published-acquisition-command-'));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const bin = path.join(workspace, 'bin'),
    log = path.join(workspace, 'calls.jsonl');
  mkdirSync(bin);
  const fakeGit = path.join(bin, 'git');
  writeFileSync(
    fakeGit,
    `#!${process.execPath}\nconst fs = require('node:fs');\nfs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args: process.argv.slice(2), env: process.env }) + '\\n');\nif(process.argv.includes('rev-parse')) process.stdout.write('${'b'.repeat(40)}\\n');\n`,
  );
  chmodSync(fakeGit, 0o755);
  const environment = {
    PATH: `${bin}:/usr/bin:/bin`,
    GH_TOKEN: 'artificial-gh-token',
    GITHUB_TOKEN: 'artificial-workflow-token',
    GIT_SSH_COMMAND: 'artificial-ssh-command',
    NODE_OPTIONS: 'artificial-node-option',
    HOME: '/artificial/private-home',
  };
  const destination = path.join(workspace, 'execution'),
    sourceCommit = 'a'.repeat(40);
  assert.deepEqual(acquirePublishedSource({ destination, sourceCommit, environment }), {
    sourceCommit,
    sourceTree: 'b'.repeat(40),
  });
  const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
  const fetches = calls.filter(({ args }) => args.includes('fetch'));
  assert.equal(fetches.length, 1);
  assert.deepEqual(fetches[0].args, [
    '--no-replace-objects',
    '-c',
    'credential.helper=',
    'fetch',
    '--quiet',
    '--no-tags',
    '--no-recurse-submodules',
    '--depth=4096',
    'https://github.com/sebastian-software/effective-flow.git',
    sourceCommit,
  ]);
  assert.ok(
    calls.every(
      ({ args }) =>
        !args.some((arg) =>
          ['push', 'pack-objects', 'bundle', 'archive', 'update-ref'].includes(arg),
        ),
    ),
  );
  for (const { env } of calls) {
    for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'GIT_SSH_COMMAND'])
      assert.equal(Object.hasOwn(env, key), false);
    assert.equal(env.HOME, destination);
    assert.equal(env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(env.GIT_CONFIG_GLOBAL, '/dev/null');
  }
  assert.equal(productEnvironment(environment, destination).NODE_OPTIONS, '--test-reporter=tap');
  const before = calls.length;
  assert.throws(() => acquirePublishedSource({ destination, sourceCommit, environment }));
  assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, before);
});

test('published source refuses original ancestry beyond the unchanged 4096-commit bound', (t) => {
  const state = publishedInputFixture(t);
  const branch = git(state.executionRoot, 'symbolic-ref', 'HEAD');
  const commits = [];
  for (let count = 2; count <= VALIDATION_HISTORY_DEPTH; count++) {
    commits.push(
      `commit ${branch}\nmark :${count + 1}\ncommitter Published bound <published-bound@invalid.local> 946684800 +0000\ndata 0\nfrom ${count === 2 ? state.sourceCommit : ':' + count}\n\n`,
    );
  }
  execFileSync('git', ['fast-import', '--quiet'], {
    cwd: state.executionRoot,
    input: commits.join('') + 'done\n',
  });
  const sourceCommit = git(state.executionRoot, 'rev-parse', 'HEAD');
  assert.equal(
    Number(git(state.executionRoot, 'rev-list', '--count', 'HEAD')),
    VALIDATION_HISTORY_DEPTH + 1,
  );
  assert.throws(() => capturePublishedInputs({ ...state, sourceCommit }), /ancestry|bound/);
});
