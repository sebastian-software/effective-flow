import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import {
  PROTECTED_VALIDATION_PROTOCOL,
  REQUIRED_BACKEND_STEPS,
  REQUIRED_NATIVE_CASES,
  VALIDATION_COMMANDS,
  VALIDATION_ENVIRONMENT,
  canonicalJSON,
  validationDigest,
} from '../src/scripts/protected-validation-protocol.mjs';
import { projectManifest } from '../src/scripts/protected-validation-core.mjs';
import { CLOSURE_PATHS } from '../scripts/protected-validation-backend.mjs';
import {
  createTransport,
  sourceBasis,
  MATERIALIZATION_PATH,
} from '../scripts/protected-validation-projection.mjs';
import {
  verifyCandidate,
  verifyHostedCandidate,
} from '../evals/build-context/_scaffold/provisional-release.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const digest = validationDigest;
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const reference = (path, bytes = path) => ({
  root: '/protected-test',
  path,
  digest: digest(bytes),
});
const stamp = '2026-10-23T10:00:20.000Z';

// GitHub is the unavailable outer boundary. This fixture supplies raw responses only: production
// ZIP parsing, original-run verification, Git membership and source comparisons remain real.
function fixture(t) {
  const workspace = mkdtempSync(resolve(tmpdir(), 'build-context-provisional-host-'));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const root = resolve(workspace, 'source'),
    transport = resolve(workspace, 'transport');
  mkdirSync(root);
  for (const path of Object.values(CLOSURE_PATHS)) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), readFileSync(resolve(repositoryRoot, path)));
  }
  writeFileSync(resolve(root, 'README.md'), 'Complete candidate source fixture.\n');
  writeFileSync(resolve(root, 'scripts/executable.sh'), '#!/bin/sh\nexit 0\n');
  chmodSync(resolve(root, 'scripts/executable.sh'), 0o755);
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Provisional host fixture');
  git(root, 'config', 'user.email', 'provisional-host@invalid.local');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'complete source fixture');
  const basis = sourceBasis(root);
  const manifest = projectManifest(basis.files, {
    trackedPaths: basis.trackedPaths,
    snapshot: basis.snapshot,
  });
  const mapping = createTransport({ source: root, destination: transport, manifest });
  const workflow = readFileSync(resolve(root, CLOSURE_PATHS.workflowDigest), 'utf8');
  const actionNames = {
    'actions/checkout': 'checkout',
    'pnpm/action-setup': 'pnpm',
    'actions/setup-node': 'node',
  };
  const actions = Object.fromEntries(
    [...workflow.matchAll(/uses: ([^@\s]+)@([a-f0-9]{40})/g)].map(([, name, pin]) => [
      actionNames[name],
      pin,
    ]),
  );
  const policy = {
    protocol: PROTECTED_VALIDATION_PROTOCOL,
    repository: 'sebastian-software/effective-flow',
    workflowPath: '.github/workflows/protected-macos-validation.yml',
    commands: [...VALIDATION_COMMANDS],
    nativeCases: [...REQUIRED_NATIVE_CASES],
    environment: VALIDATION_ENVIRONMENT,
    executionClosure: {
      ...Object.fromEntries(
        Object.entries(CLOSURE_PATHS).map(([key, path]) => [
          key,
          digest(readFileSync(resolve(root, path))),
        ]),
      ),
      materializationAlgorithm: 'git-tree-v1',
      actions,
    },
  };
  const preparation = {
    protocol: PROTECTED_VALIDATION_PROTOCOL,
    requestRef: reference('request.json'),
    bootstrapRef: reference('bootstrap.json'),
    localSnapshot: basis.snapshot,
    exportManifestRef: reference('export.json'),
    transportManifestRef: reference('transport.json'),
    materializationManifestRef: reference(
      'materialization.json',
      readFileSync(resolve(transport, MATERIALIZATION_PATH)),
    ),
    executionTree: mapping.executionTree,
    executionClosureDigest: digest(policy.executionClosure),
    repository: policy.repository,
    snapshotBranch: 'effective-flow/validation/provisional-test',
    snapshotCommit: mapping.snapshotCommit,
    snapshotTree: mapping.snapshotTree,
  };
  const value = {
    repository: policy.repository,
    sourceCommit: basis.snapshot.head,
    sourceTree: mapping.executionTree,
    host: {
      request: { policyDigest: digest(policy) },
      preparation,
      policy,
      runId: 42,
      runAttempt: 1,
    },
  };
  const metadata = {
    repository: { full_name: policy.repository },
    id: 42,
    run_attempt: 1,
    event: 'push',
    head_branch: preparation.snapshotBranch,
    head_sha: preparation.snapshotCommit,
    path: policy.workflowPath,
    status: 'completed',
    conclusion: 'success',
    created_at: '2026-10-23T09:59:00.000Z',
    run_started_at: '2026-10-23T10:00:00.000Z',
    updated_at: '2026-10-23T10:01:00.000Z',
  };
  const jobs = {
    total_count: 1,
    jobs: [
      {
        run_id: 42,
        run_attempt: 1,
        id: 43,
        name: 'protected-validation',
        status: 'completed',
        conclusion: 'success',
        started_at: metadata.run_started_at,
        completed_at: metadata.updated_at,
        runner_name: 'GitHub Actions hosted fixture',
        runner_group_name: null,
        labels: ['macos-15'],
        steps: REQUIRED_BACKEND_STEPS.map((name, index) => ({
          name,
          number: index + 1,
          status: 'completed',
          conclusion: 'success',
          started_at: '2026-10-23T10:00:10.000Z',
          completed_at: '2026-10-23T10:00:50.000Z',
        })),
      },
    ],
  };
  const state = { root, transport, value, metadata, jobs, alterLog: (text) => text, reads: [] };
  state.read = (endpoint) => {
    state.reads.push(endpoint);
    const base = `repos/${value.repository}`;
    const attempt = `${base}/actions/runs/42/attempts/1`;
    if (endpoint === attempt) return json(metadata);
    if (endpoint === attempt + '/jobs?per_page=100') return json(jobs);
    if (endpoint === attempt + '/logs')
      return storedZip('0_protected-validation.txt', state.alterLog(executionLog(state)));
    if (endpoint === `${base}/git/commits/${preparation.snapshotCommit}`)
      return json({
        sha: preparation.snapshotCommit,
        tree: { sha: git(transport, 'rev-parse', preparation.snapshotCommit + '^{tree}') },
        parents: git(transport, 'rev-list', '--parents', '-n', '1', preparation.snapshotCommit)
          .split(' ')
          .slice(1)
          .map((sha) => ({ sha })),
      });
    if (endpoint === `${base}/git/trees/${preparation.snapshotCommit}?recursive=1`)
      return json({
        truncated: false,
        tree: git(transport, 'ls-tree', '-r', preparation.snapshotCommit)
          .split('\n')
          .map((entry) => {
            const [, mode, type, sha, path] = /^(\d+) (\S+) ([a-f0-9]+)\t(.+)$/.exec(entry);
            return { mode, type, sha, path };
          }),
      });
    const blob = endpoint.match(new RegExp(`^${base}/git/blobs/([a-f0-9]{40})$`));
    if (blob) {
      const bytes = execFileSync('git', ['cat-file', 'blob', blob[1]], { cwd: transport });
      return json({
        sha: blob[1],
        encoding: 'base64',
        size: bytes.length,
        content: bytes.toString('base64'),
      });
    }
    throw new Error('Unexpected raw backend endpoint: ' + endpoint);
  };
  return state;
}
const json = (value) => Buffer.from(JSON.stringify(value));

function executionLog({ value }) {
  const { preparation, policy } = value.host;
  const lines = ['Image: macos-15-arm64'];
  const actionRepos = {
    checkout: 'actions/checkout',
    pnpm: 'pnpm/action-setup',
    node: 'actions/setup-node',
  };
  for (const [name, pin] of Object.entries(policy.executionClosure.actions))
    lines.push(`Download action repository '${actionRepos[name]}@${pin}' (SHA:${pin})`);
  lines.push('##[group]Run node scripts/protected-macos-validation.mjs run');
  const emit = (event) => lines.push('EF_PROTECTED_VALIDATION ' + JSON.stringify(event));
  emit({
    type: 'materialization',
    sourceCommit: preparation.snapshotCommit,
    sourceHead: preparation.localSnapshot.head,
    executionTree: preparation.executionTree,
    materializationDigest: preparation.materializationManifestRef.digest,
    executionCommit: 'd'.repeat(40),
  });
  emit({
    type: 'environment',
    environment: VALIDATION_ENVIRONMENT,
    platform: 'darwin',
    arch: 'arm64',
    machine: 'arm64',
    osVersion: '15.7',
    runnerImage: 'macos-15-arm64:test',
    closure: policy.executionClosure,
    codex: {
      path: '/opt/homebrew/bin/codex',
      version: VALIDATION_ENVIRONMENT.codexVersion,
      digest: digest('test binary bytes'),
    },
  });
  for (const [index, command] of VALIDATION_COMMANDS.entries()) {
    emit({ type: 'command-start', command, index });
    if (command === 'pnpm test')
      lines.push(...REQUIRED_NATIVE_CASES.map((name, i) => `ok ${i + 1} - ${name}`));
    emit({ type: 'command-end', command, index, exitCode: 0 });
    if (command === 'pnpm test')
      emit({
        type: 'native-cases',
        nativeCases: REQUIRED_NATIVE_CASES.map((name) => ({ name, outcome: 'passed' })),
      });
  }
  emit({ type: 'completed', executionTree: preparation.executionTree });
  lines.push('##[endgroup]');
  return lines.map((line) => stamp + ' ' + line).join('\n');
}

// A complete stored ZIP entry, including CRC and both headers, crosses the real archive parser.
function storedZip(name, text) {
  const filename = Buffer.from(name),
    body = Buffer.from(text);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30),
    central = Buffer.alloc(46),
    end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(body.length, 22);
  local.writeUInt16LE(filename.length, 26);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(body.length, 24);
  central.writeUInt16LE(filename.length, 28);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12);
  end.writeUInt32LE(local.length + filename.length + body.length, 16);
  return Buffer.concat([local, filename, body, central, filename, end]);
}

function changeMaterialization(state, mutate) {
  const path = resolve(state.transport, MATERIALIZATION_PATH);
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  mutate(manifest);
  writeFileSync(path, canonicalJSON(manifest) + '\n');
  git(state.transport, 'add', MATERIALIZATION_PATH);
  git(state.transport, 'commit', '--amend', '--quiet', '--no-edit');
  const preparation = state.value.host.preparation;
  preparation.snapshotCommit = git(state.transport, 'rev-parse', 'HEAD');
  preparation.snapshotTree = git(state.transport, 'rev-parse', 'HEAD^{tree}');
  state.metadata.head_sha = preparation.snapshotCommit;
  preparation.materializationManifestRef.digest = digest(readFileSync(path));
}

test('provisional admission verifies original raw hosted metadata, ZIP logs and complete real source Git materialization', (t) => {
  const state = fixture(t);
  assert.deepEqual(verifyHostedCandidate(state.value, state), {
    state: 'verified',
    runId: 42,
    runAttempt: 1,
    sourceTree: state.value.sourceTree,
  });
  assert.ok(state.reads.some((endpoint) => endpoint.endsWith('/logs')));
  assert.ok(state.reads.some((endpoint) => endpoint.includes('/git/commits/')));
  assert.ok(state.reads.some((endpoint) => endpoint.includes('/git/trees/')));
  assert.ok(state.reads.some((endpoint) => endpoint.includes('/git/blobs/')));
});

for (const [label, mutate, diagnostic] of [
  [
    'foreign run identity',
    (s) => {
      s.metadata.id = 99;
    },
    /foreign requested backend attempt/,
  ],
  [
    'stale run source',
    (s) => {
      s.metadata.head_sha = 'e'.repeat(40);
    },
    /foreign requested backend attempt/,
  ],
  [
    'foreign original source parent',
    (s) => {
      s.value.host.preparation.localSnapshot.head = 'e'.repeat(40);
    },
    /immutable snapshot tree or source history parent differs/,
  ],
  [
    'failed run despite success-shaped stdout',
    (s) => {
      s.metadata.conclusion = 'failure';
    },
    /failed job belongs to another attempt or contradicts run/,
  ],
  [
    'stdout-only markers without original runner invocation',
    (s) => {
      s.alterLog = (text) =>
        text.replace(
          '##[group]Run node scripts/protected-macos-validation.mjs run',
          'product stdout',
        );
    },
    /backend runner command boundary missing/,
  ],
  [
    'missing mandatory command',
    (s) => {
      s.alterLog = (text) =>
        text
          .split('\n')
          .filter((line) => !line.includes('pnpm test:distribution'))
          .join('\n');
    },
    /missing, duplicate, reordered or forged runner events/,
  ],
  [
    'failed mandatory command',
    (s) => {
      s.alterLog = (text) => text.replace('"exitCode":0', '"exitCode":1');
    },
    /actual command failed or differs/,
  ],
  [
    'missing actual native TAP case',
    (s) => {
      s.alterLog = (text) =>
        text
          .split('\n')
          .filter((line) => !line.includes(`ok 1 - ${REQUIRED_NATIVE_CASES[0]}`))
          .join('\n');
    },
    /required native case absent or duplicated/,
  ],
  [
    'missing native observation',
    (s) => {
      s.alterLog = (text) =>
        text.replace(
          '"nativeCases":[{',
          '"nativeCases":[{"name":"unobserved","outcome":"passed"},{',
        );
    },
    /skipped\/forged native case outcomes/,
  ],
]) {
  test(`provisional original-host admission refuses ${label}`, (t) => {
    const state = fixture(t);
    mutate(state);
    assert.throws(() => verifyHostedCandidate(state.value, state), diagnostic);
  });
}

for (const [label, mutate] of [
  [
    'missing source member',
    (m) => {
      m.executionFiles = m.executionFiles.filter((f) => f.path !== 'README.md');
    },
  ],
  [
    'extra source member',
    (m) => {
      m.executionFiles.push({ path: 'invented.txt', mode: '100644', digest: digest('invented') });
    },
  ],
  [
    'source file mode drift',
    (m) => {
      m.executionFiles.find((f) => f.path === 'scripts/executable.sh').mode = '100644';
    },
  ],
  [
    'source file digest drift',
    (m) => {
      m.executionFiles.find((f) => f.path === 'README.md').digest = digest('other bytes');
    },
  ],
]) {
  test(`provisional admission rejects authenticated materialization with ${label}`, (t) => {
    const state = fixture(t);
    changeMaterialization(state, mutate);
    assert.throws(
      () => verifyHostedCandidate(state.value, state),
      /protected materialization does not cover the complete exact candidate tree/,
    );
    assert.ok(
      state.reads.some((endpoint) => endpoint.endsWith('/logs')),
      'negative case must pass original backend verification before membership comparison',
    );
  });
}

test('provisional admission refuses original materialization bytes changed behind its declared digest', (t) => {
  const state = fixture(t);
  const expected = state.value.host.preparation.materializationManifestRef.digest;
  changeMaterialization(state, (m) => {
    m.executionFiles.find((f) => f.path === 'README.md').digest = digest('changed');
  });
  state.value.host.preparation.materializationManifestRef.digest = expected;
  assert.throws(
    () => verifyHostedCandidate(state.value, state),
    /original materialization bytes differ/,
  );
});

test('provisional admission refuses a changed local execution closure before requesting backend proof', (t) => {
  const state = fixture(t);
  writeFileSync(resolve(state.root, CLOSURE_PATHS.runnerDigest), 'changed runner');
  assert.throws(
    () => verifyHostedCandidate(state.value, state),
    /protected execution closure differs/,
  );
  assert.equal(state.reads.length, 0);
});
