import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const { captureValidationInputs, nativeOutcomes, verifyValidationInputs } =
  await import('../scripts/protected-macos-validation.mjs');
const { CLOSURE_PATHS, validationDigest } =
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
