import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
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
