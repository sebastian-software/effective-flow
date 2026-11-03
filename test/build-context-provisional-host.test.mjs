import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import path from 'node:path';
import test from 'node:test';
import {
  PROTECTED_VALIDATION_PROTOCOL,
  PUBLISHED_SOURCE_PROTOCOL,
  PUBLISHED_SOURCE_KIND,
  PUBLISHED_CLOSURE_PATHS,
  REQUIRED_BACKEND_STEPS,
  REQUIRED_NATIVE_CASES,
  VALIDATION_COMMANDS,
  VALIDATION_ENVIRONMENT,
  canonicalJSON,
  validationDigest,
} from '../src/scripts/protected-validation-protocol.mjs';
import { projectManifest } from '../src/scripts/protected-validation-core.mjs';
import { CLOSURE_PATHS } from '../scripts/protected-validation-backend.mjs';
import { observePublishedBackend } from '../scripts/protected-validation-backend.mjs';
import {
  inspectPublishedSource,
  observePublishedSource,
} from '../scripts/protected-validation-operator.mjs';
import {
  createTransport,
  sourceBasis,
  MATERIALIZATION_PATH,
} from '../scripts/protected-validation-projection.mjs';
import {
  ABSENT_POPULATIONS,
  PROVISIONAL_SCHEMA,
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

function publishedRemoteFixture(t, { candidateWorkflow, defaultWorkflow } = {}) {
  const root = mkdtempSync(resolve(tmpdir(), 'published-host-source-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(root, { recursive: true });
  for (const relative of new Set([
    ...Object.values(PUBLISHED_CLOSURE_PATHS),
    ...readdirSync(path.resolve('.github/workflows')).map((name) => `.github/workflows/${name}`),
  ])) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), readFileSync(path.resolve(relative)));
  }
  writeFileSync(path.join(root, '.release-please-manifest.json'), '{".":"1.70.0"}\n');
  writeFileSync(path.join(root, 'README.md'), 'Synthetic published source.\n');
  const ci = path.join(root, '.github/workflows/ci.yml');
  if (candidateWorkflow) writeFileSync(ci, candidateWorkflow(readFileSync(ci, 'utf8')));
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Published source test');
  git(root, 'config', 'user.email', 'published-source@invalid.local');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'config', 'core.hooksPath', '/dev/null');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'synthetic final release');
  git(root, 'commit', '--quiet', '--allow-empty', '-m', 'synthetic final stamped release');
  const sourceCommit = git(root, 'rev-parse', 'HEAD');
  let defaultCommit = sourceCommit;
  if (defaultWorkflow) {
    writeFileSync(ci, defaultWorkflow(readFileSync(ci, 'utf8')));
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'synthetic default branch');
    defaultCommit = git(root, 'rev-parse', 'HEAD');
    git(root, 'checkout', '--quiet', '--detach', sourceCommit);
  }
  const repository = 'sebastian-software/effective-flow';
  const input = {
    repository,
    releasePullRequest: 595,
    releaseHeadRef: 'release-please--branches--develop--components--effective-flow',
    releaseVersion: '1.70.0',
    sourceCommit,
    sourceTree: git(root, 'rev-parse', sourceCommit + '^{tree}'),
  };
  const state = {
    root,
    input,
    reads: [],
    writes: [],
    overrides: new Map(),
    repository: {
      full_name: repository,
      private: false,
      default_branch: 'main',
      permissions: { push: true },
    },
    pr: {
      number: 595,
      state: 'open',
      merged: false,
      base: { ref: 'develop', repo: { full_name: repository } },
      head: { ref: input.releaseHeadRef, sha: sourceCommit, repo: { full_name: repository } },
    },
    createdRef: null,
  };
  state.read = (endpoint) => {
    state.reads.push(endpoint);
    if (state.overrides.has(endpoint)) {
      const value = state.overrides.get(endpoint);
      if (value instanceof Error) throw value;
      return Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
    }
    const base = `repos/${repository}`;
    const json = (value) => Buffer.from(JSON.stringify(value));
    if (endpoint === 'user') return json({ id: 7, login: 'synthetic-operator', type: 'User' });
    if (endpoint === base) return json(state.repository);
    if (
      endpoint ===
      `${base}/git/matching-refs/heads/effective-flow/qualification/published-source-${sourceCommit}`
    )
      return json(state.createdRef ? [state.createdRef] : []);
    if (endpoint === `${base}/pulls/595`) return json(state.pr);
    if (endpoint === `${base}/git/ref/heads/main`)
      return json({ ref: 'refs/heads/main', object: { type: 'commit', sha: defaultCommit } });
    if (
      endpoint ===
      `${base}/git/ref/heads/effective-flow/qualification/published-source-${sourceCommit}`
    ) {
      if (state.createdRef) return json(state.createdRef);
      const error = new Error('HTTP 404: Not Found');
      error.status = 404;
      throw error;
    }
    let match = endpoint.match(
      new RegExp(`^${base}/commits\\?sha=([a-f0-9]{40})&per_page=100&page=(\\d+)$`),
    );
    if (match) {
      const commits = git(root, 'rev-list', match[1]).split('\n').filter(Boolean);
      const start = (Number(match[2]) - 1) * 100;
      return json(
        commits.slice(start, start + 100).map((sha) => ({
          sha,
          commit: { tree: { sha: git(root, 'rev-parse', sha + '^{tree}') } },
          parents: git(root, 'rev-list', '--parents', '-n', '1', sha)
            .split(' ')
            .slice(1)
            .map((sha) => ({ sha })),
        })),
      );
    }
    match = endpoint.match(new RegExp(`^${base}/zipball/([a-f0-9]{40})$`));
    if (match)
      return execFileSync(
        'git',
        [
          'archive',
          '--format=zip',
          '--prefix=sebastian-software-effective-flow-' + match[1].slice(0, 7) + '/',
          match[1],
        ],
        { cwd: root, maxBuffer: 16 * 1024 * 1024 },
      );
    match = endpoint.match(new RegExp(`^${base}/git/trees/([a-f0-9]{40})\\?recursive=1$`));
    if (match)
      return json({
        sha: git(root, 'rev-parse', match[1] + '^{tree}'),
        truncated: false,
        tree: git(root, 'ls-tree', '-r', '-t', match[1])
          .split('\n')
          .map((line) => {
            const [, mode, type, sha, path] = /^(\d+) (\S+) ([a-f0-9]{40})\t(.+)$/.exec(line);
            return { mode, type, sha, path };
          }),
      });
    throw new Error('Unexpected synthetic read: ' + endpoint);
  };
  state.write = (endpoint, body) => {
    state.writes.push({ endpoint, body });
    assert.equal(endpoint, `repos/${repository}/git/refs`);
    assert.deepEqual(body, {
      ref: `refs/heads/effective-flow/qualification/published-source-${sourceCommit}`,
      sha: sourceCommit,
    });
    state.createdRef = { ref: body.ref, object: { type: 'commit', sha: body.sha } };
    return Buffer.from(JSON.stringify(state.createdRef));
  };
  return state;
}

function publishedHostFixture(t) {
  const state = publishedRemoteFixture(t);
  const { preparation } = inspectPublishedSource(state.input, state);
  const sourceRead = state.read;
  state.createdRef = {
    ref: 'refs/heads/' + preparation.qualificationRef,
    object: { type: 'commit', sha: preparation.sourceCommit },
  };
  state.value = {
    schema: PROVISIONAL_SCHEMA,
    ...state.input,
    featurePullRequest: 581,
    instrumentDigest: digest('synthetic frozen instrument'),
    policyDigest: digest('synthetic frozen release policy'),
    issuedAt: new Date(Date.now() - 60000).toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    absentPopulations: [...ABSENT_POPULATIONS],
    host: {
      kind: PUBLISHED_SOURCE_KIND,
      preparation,
      policy: preparation.policy,
      runId: 42,
      runAttempt: 1,
    },
  };
  const decision =
    'Synthetic maintainer decision authorizes only the bound provisional release after independent review, retains all absent populations as unproven, and leaves full strict acceptance unchanged.';
  const report =
    'Synthetic independent policy review covers exact source, frozen instrument and policy, raw original host proof, complete source membership, unchanged strict requirements, and closure of every material finding.';
  state.value.authority = {
    kind: 'trusted-user-bounded-provisional-release',
    decision,
    decisionDigest: digest(decision),
  };
  state.value.review = {
    kind: 'independent-policy-review',
    reviewer: 'synthetic-independent-reviewer',
    sourceCommit: state.input.sourceCommit,
    sourceTree: state.input.sourceTree,
    instrumentDigest: state.value.instrumentDigest,
    policyDigest: state.value.policyDigest,
    report,
    reportDigest: digest(report),
    materialFindings: [],
  };
  state.metadata = {
    repository: { full_name: state.input.repository },
    head_repository: { full_name: state.input.repository },
    id: 42,
    workflow_id: 41,
    run_attempt: 1,
    event: 'create',
    head_branch: preparation.qualificationRef,
    head_sha: preparation.sourceCommit,
    path: preparation.policy.workflowPath,
    status: 'completed',
    conclusion: 'success',
    actor: { id: 7, type: 'User' },
    triggering_actor: { id: 7, type: 'User' },
    created_at: '2026-10-23T09:59:00.000Z',
    run_started_at: '2026-10-23T10:00:00.000Z',
    updated_at: '2026-10-23T10:01:00.000Z',
  };
  state.workflow = { id: 41, path: preparation.policy.workflowPath, state: 'active' };
  state.jobs = {
    total_count: 1,
    jobs: [
      {
        run_id: 42,
        run_attempt: 1,
        id: 43,
        name: 'protected-validation',
        status: 'completed',
        conclusion: 'success',
        runner_name: 'GitHub Actions hosted synthetic source test',
        runner_group_name: null,
        labels: ['macos-15'],
        started_at: state.metadata.run_started_at,
        completed_at: state.metadata.updated_at,
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
  state.alterLog = (text) => text;
  state.alterZip = (bytes) => bytes;
  state.read = (endpoint) => {
    const base = `repos/${state.input.repository}/actions`;
    if (endpoint === `${base}/runs/42/attempts/1`) {
      state.reads.push(endpoint);
      return json(state.metadata);
    }
    if (endpoint === `${base}/runs/42/attempts/1/jobs?per_page=100`) {
      state.reads.push(endpoint);
      return json(state.jobs);
    }
    if (endpoint === `${base}/runs/42/attempts/1/logs`) {
      state.reads.push(endpoint);
      return state.alterZip(
        storedZip('0_protected-validation.txt', state.alterLog(publishedExecutionLog(state))),
      );
    }
    if (endpoint === `${base}/workflows/41`) {
      state.reads.push(endpoint);
      return json(state.workflow);
    }
    return sourceRead(endpoint);
  };
  state.reads.length = 0;
  return state;
}

function publishedExecutionLog({ value }) {
  const { preparation, policy } = value.host;
  const lines = ['Image: macos-15-arm64'];
  for (const [name, pin] of Object.entries(policy.executionClosure.actions)) {
    const repo = {
      checkout: 'actions/checkout',
      pnpm: 'pnpm/action-setup',
      node: 'actions/setup-node',
    }[name];
    lines.push(`Download action repository '${repo}@${pin}' (SHA:${pin})`);
  }
  lines.push('##[group]Run node scripts/protected-macos-validation.mjs run');
  const emit = (event) => lines.push('EF_PROTECTED_VALIDATION ' + JSON.stringify(event));
  const identity = {
    protocol: PUBLISHED_SOURCE_PROTOCOL,
    kind: PUBLISHED_SOURCE_KIND,
    sourceCommit: preparation.sourceCommit,
    sourceTree: preparation.sourceTree,
    sourceFilesDigest: preparation.sourceFilesDigest,
    ancestryDigest: preparation.ancestryDigest,
    indexDigest: digest('immutable original execution index'),
    candidateWorkflowsDigest: digest(preparation.isolation.candidate.workflows),
  };
  emit({ type: 'source-acquisition', ...identity });
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
      lines.push(...REQUIRED_NATIVE_CASES.map((name, index) => `ok ${index + 1} - ${name}`));
    emit({ type: 'command-end', command, index, exitCode: 0 });
    if (command === 'pnpm test')
      emit({
        type: 'native-cases',
        nativeCases: REQUIRED_NATIVE_CASES.map((name) => ({ name, outcome: 'passed' })),
      });
  }
  emit({ type: 'completed', ...identity });
  lines.push('##[endgroup]');
  return lines.map((line) => stamp + ' ' + line).join('\n');
}

test('published-source provisional host admission independently verifies real source objects and original create-attempt ZIP proof', (t) => {
  const state = publishedHostFixture(t);
  assert.deepEqual(verifyHostedCandidate(state.value, state), {
    state: 'verified',
    kind: PUBLISHED_SOURCE_KIND,
    runId: 42,
    runAttempt: 1,
    sourceTree: state.value.sourceTree,
  });
  assert.ok(state.reads.some((endpoint) => endpoint.endsWith('/logs')));
  assert.ok(state.reads.some((endpoint) => endpoint.includes('/zipball/')));
  const firstProof = state.reads.findIndex((endpoint) =>
    endpoint.includes('/actions/runs/42/attempts/1'),
  );
  const lastRawLogs = state.reads.findLastIndex((endpoint) => endpoint.endsWith('/logs'));
  assert.ok(firstProof >= 0 && lastRawLogs >= firstProof);
  for (const endpoint of [
    `repos/${state.value.repository}`,
    `repos/${state.value.repository}/pulls/595`,
    `repos/${state.value.repository}/git/ref/heads/main`,
  ]) {
    assert.ok(
      state.reads.slice(0, firstProof).includes(endpoint),
      'current repository, release and default ref must bind before hosted proof: ' + endpoint,
    );
    assert.ok(
      state.reads.slice(lastRawLogs + 1).includes(endpoint),
      'current repository, release and default ref must bind again after raw proof: ' + endpoint,
    );
  }
  assert.equal(state.writes.length, 0);
  const observed = observePublishedSource(
    { preparation: state.value.host.preparation, runId: 42, runAttempt: 1 },
    state,
  );
  assert.equal(observed.state, 'verified');
  assert.equal(observed.result.event, 'create');
  assert.equal(observed.result.kind, PUBLISHED_SOURCE_KIND);
  assert.equal(Object.hasOwn(observed.result, 'materialized'), false);
});

for (const [label, mutate] of [
  [
    'push replay',
    (s) => {
      s.metadata.event = 'push';
    },
  ],
  [
    'rerun attempt 2',
    (s) => {
      s.metadata.run_attempt = 2;
    },
  ],
  [
    'wrong source SHA',
    (s) => {
      s.metadata.head_sha = 'e'.repeat(40);
    },
  ],
  [
    'foreign head repository',
    (s) => {
      s.metadata.head_repository.full_name = 'foreign/repository';
    },
  ],
  [
    'wrong reserved ref',
    (s) => {
      s.metadata.head_branch = 'effective-flow/validation/old-push';
    },
  ],
  [
    'bot identity',
    (s) => {
      s.metadata.actor.type = 'Bot';
    },
  ],
  [
    'changed triggering actor',
    (s) => {
      s.metadata.triggering_actor.id = 8;
    },
  ],
  [
    'inactive workflow',
    (s) => {
      s.workflow.state = 'disabled_manually';
    },
  ],
  [
    'another workflow path',
    (s) => {
      s.workflow.path = '.github/workflows/ci.yml';
    },
  ],
  [
    'tag-shaped ref',
    (s) => {
      s.createdRef.ref = s.createdRef.ref.replace('refs/heads/', 'refs/tags/');
    },
  ],
  [
    'ref moved after original run',
    (s) => {
      s.createdRef.object.sha = 'f'.repeat(40);
    },
  ],
  [
    'incomplete paginated jobs',
    (s) => {
      s.jobs.total_count = 2;
    },
  ],
  [
    'extra job',
    (s) => {
      s.jobs.total_count = 2;
      s.jobs.jobs.push(structuredClone(s.jobs.jobs[0]));
    },
  ],
  [
    'skipped mandatory step',
    (s) => {
      s.jobs.jobs[0].steps.at(-1).conclusion = 'skipped';
    },
  ],
  [
    'reordered steps',
    (s) => {
      s.jobs.jobs[0].steps.reverse();
    },
  ],
  [
    'injected execution step',
    (s) => {
      s.jobs.jobs[0].steps[0].name = 'untrusted source export';
    },
  ],
  [
    'failed run',
    (s) => {
      s.metadata.conclusion = 'failure';
    },
  ],
  [
    'wrong runner labels',
    (s) => {
      s.jobs.jobs[0].labels = ['ubuntu-latest'];
    },
  ],
  [
    'truncated raw ZIP',
    (s) => {
      s.alterZip = (bytes) => bytes.subarray(0, bytes.length - 10);
    },
  ],
  [
    'missing literal native TAP',
    (s) => {
      s.alterLog = (text) =>
        text
          .split('\n')
          .filter((line) => !line.includes(`ok 1 - ${REQUIRED_NATIVE_CASES[0]}`))
          .join('\n');
    },
  ],
  [
    'skipped literal native TAP',
    (s) => {
      s.alterLog = (text) =>
        text.replace(
          `ok 1 - ${REQUIRED_NATIVE_CASES[0]}`,
          `ok 1 - ${REQUIRED_NATIVE_CASES[0]} # SKIP`,
        );
    },
  ],
  [
    'forged success event',
    (s) => {
      s.alterLog = (text) => text.replace('"exitCode":0', '"exitCode":1');
    },
  ],
  [
    'duplicate completion',
    (s) => {
      s.alterLog = (text) =>
        text + '\n' + text.split('\n').find((line) => line.includes('"type":"completed"'));
    },
  ],
  [
    'source digest drift at completion',
    (s) => {
      s.alterLog = (text) =>
        text.replace(
          /("type":"completed"[^\n]*"sourceFilesDigest":")[^"]+/,
          '$1' + digest('other source'),
        );
    },
  ],
  [
    'index drift at completion',
    (s) => {
      s.alterLog = (text) =>
        text.replace(
          /("type":"completed"[^\n]*"indexDigest":")[^"]+/,
          '$1' + digest('other index'),
        );
    },
  ],
  [
    'synthetic materialization replay',
    (s) => {
      s.alterLog = (text) =>
        text.replace('"type":"source-acquisition"', '"type":"materialization"');
    },
  ],
  [
    'events outside authenticated step',
    (s) => {
      s.jobs.jobs[0].steps.at(-1).started_at = '2026-10-23T10:00:30.000Z';
    },
  ],
  [
    'native TAP outside command interval',
    (s) => {
      s.alterLog = (text) => {
        const lines = text.split('\n');
        const taps = lines.filter((line) => /ok \d+ - /.test(line));
        return [...lines.filter((line) => !/ok \d+ - /.test(line)), ...taps].join('\n');
      };
    },
  ],
  [
    'current release head drift',
    (s) => {
      s.pr.head.sha = 'e'.repeat(40);
    },
  ],
  [
    'caller host pass flag',
    (s) => {
      s.value.host.kind = 'transport';
    },
  ],
]) {
  test(`published-source host proof refuses ${label}`, (t) => {
    const state = publishedHostFixture(t);
    mutate(state);
    assert.throws(() => verifyHostedCandidate(state.value, state));
    assert.equal(state.writes.length, 0);
  });
}

test('published-source host admission rejects local closure changes before any backend request', (t) => {
  const state = publishedHostFixture(t);
  writeFileSync(
    resolve(state.root, PUBLISHED_CLOSURE_PATHS.admissionDigest),
    'changed admission bytes',
  );
  assert.throws(() => verifyHostedCandidate(state.value, state));
  assert.equal(state.reads.length, 0);
});

test('published-source host admission treats queued backend data as unproven and refuses attempt-2 substitution', (t) => {
  const state = publishedHostFixture(t);
  state.metadata.status = 'queued';
  state.metadata.conclusion = null;
  state.jobs = { total_count: 0, jobs: [] };
  assert.equal(observePublishedBackend({ ...state.value.host, read: state.read }).state, 'pending');
  assert.throws(() => verifyHostedCandidate(state.value, state));
  assert.throws(() =>
    observePublishedSource(
      { preparation: state.value.host.preparation, runId: 42, runAttempt: 2 },
      state,
    ),
  );
  assert.equal(state.writes.length, 0);
});

for (const changed of ['release PR', 'default branch']) {
  test(`published host refuses an initially changed ${changed} before requesting raw hosted proof`, (t) => {
    const state = publishedHostFixture(t);
    const defaultEndpoint = `repos/${state.value.repository}/git/ref/heads/main`;
    if (changed === 'release PR') state.pr.head.sha = 'e'.repeat(40);
    else
      state.overrides.set(defaultEndpoint, {
        ref: 'refs/heads/main',
        object: {
          type: 'commit',
          sha: git(state.root, 'rev-parse', state.value.sourceCommit + '^'),
        },
      });
    assert.throws(() => verifyHostedCandidate(state.value, state));
    assert.ok(
      state.reads.includes(
        changed === 'release PR' ? `repos/${state.value.repository}/pulls/595` : defaultEndpoint,
      ),
    );
    assert.equal(
      state.reads.some((endpoint) => endpoint.includes('/actions/runs/42/attempts/1')),
      false,
      'an invalid current context must not proceed to attempt metadata, jobs or raw logs',
    );
    assert.equal(state.writes.length, 0);
  });
}

for (const changed of ['release state', 'default branch']) {
  test(`published host refuses ${changed} drift during authenticated raw-log observation`, (t) => {
    const state = publishedHostFixture(t);
    const originalRead = state.read;
    const defaultEndpoint = `repos/${state.value.repository}/git/ref/heads/main`;
    const differentPublishedCommit = git(state.root, 'rev-parse', state.value.sourceCommit + '^');
    assert.notEqual(
      differentPublishedCommit,
      state.value.host.preparation.isolation.defaultBranch.commit,
    );
    let rawProofObserved = false;
    state.read = (endpoint) => {
      const bytes = originalRead(endpoint);
      if (endpoint.endsWith('/logs')) {
        rawProofObserved = true;
        if (changed === 'release state') state.pr.state = 'closed';
        else
          state.overrides.set(defaultEndpoint, {
            ref: 'refs/heads/main',
            object: { type: 'commit', sha: differentPublishedCommit },
          });
      }
      return bytes;
    };
    assert.throws(() => verifyHostedCandidate(state.value, state));
    assert.equal(
      rawProofObserved,
      true,
      'the initial binding must qualify and reach genuine raw ZIP observation',
    );
    const logs = state.reads.findIndex((endpoint) => endpoint.endsWith('/logs'));
    const rechecked =
      changed === 'release state' ? `repos/${state.value.repository}/pulls/595` : defaultEndpoint;
    assert.ok(
      state.reads.slice(logs + 1).includes(rechecked),
      'changed mutable context must be re-observed after raw proof',
    );
    assert.equal(state.writes.length, 0);
  });
}
