import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  renameSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  contentDigest,
  MAX_CONTROL_BYTES,
  REQUIRED_GATES,
} from '../src/scripts/build-run-core.mjs';
import {
  completed,
  durable,
  env,
  error,
  fixture,
  git,
  gitRef,
  issue,
  observedRefusal,
  pause,
  preparedForRetainedPlan,
  preparedForTransform,
  retainedSeal,
  retainRefusal,
  sealing,
  setupDelivery,
  start,
  terminalInput,
  trusted,
} from './support/build-run-fixtures.mjs';

test('CLI emits exactly one machine envelope, diagnostic stderr and usage exit status', () => {
  const cli = fileURLToPath(new URL('../src/scripts/build-run.mjs', import.meta.url));
  const invalid = spawnSync(process.execPath, [cli, 'create'], {
    input: '{broken',
    encoding: 'utf8',
  });
  assert.equal(invalid.status, 2);
  assert.equal(invalid.stdout.trim().split('\n').length, 1);
  assert.equal(JSON.parse(invalid.stdout).error.code, 'INVALID_PAYLOAD');
  assert.match(invalid.stderr, /INVALID_PAYLOAD/);
  const unknown = spawnSync(process.execPath, [cli, 'unknown'], { input: '{}', encoding: 'utf8' });
  assert.equal(unknown.status, 2);
  assert.equal(JSON.parse(unknown.stdout).error.code, 'INVALID_OPERATION');
  const oversizedOperation = spawnSync(process.execPath, [cli, 'x'.repeat(MAX_CONTROL_BYTES)], {
    input: '{}',
    encoding: 'utf8',
  });
  assert.equal(oversizedOperation.status, 2);
  assert.ok(Buffer.byteLength(oversizedOperation.stdout) <= MAX_CONTROL_BYTES);
  assert.equal(JSON.parse(oversizedOperation.stdout).operation, null);
});

test('CLI takes exactly one positional operation and reads only the JSON payload from stdin', async (t) => {
  const cli = fileURLToPath(new URL('../src/scripts/build-run.mjs', import.meta.url));
  const fx = fixture(t);
  const missingArg = spawnSync(process.execPath, [cli], {
    input: JSON.stringify({ operation: 'validate' }),
    cwd: fx.root,
    encoding: 'utf8',
  });
  assert.equal(missingArg.status, 2);
  assert.equal(JSON.parse(missingArg.stdout).error.code, 'INVALID_OPERATION');
  assert.equal(existsSync(path.join(fx.root, '.effective-flow', 'build-runs')), false);

  const live = await start(fx);
  const valid = spawnSync(process.execPath, [cli, 'validate'], {
    input: JSON.stringify(live.common),
    encoding: 'utf8',
  });
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(JSON.parse(valid.stdout).ok, true);

  const extraPayloadOperation = spawnSync(process.execPath, [cli, 'validate'], {
    input: JSON.stringify({ ...live.common, operation: 'validate' }),
    encoding: 'utf8',
  });
  assert.equal(extraPayloadOperation.status, 2);
  assert.equal(JSON.parse(extraPayloadOperation.stdout).error.code, 'INVALID_PAYLOAD');

  const extraArg = spawnSync(process.execPath, [cli, 'validate', 'extra'], {
    input: JSON.stringify(live.common),
    encoding: 'utf8',
  });
  assert.equal(extraArg.status, 2);
  assert.equal(JSON.parse(extraArg.stdout).error.code, 'INVALID_OPERATION');
});

function retentionPayload(live, extra = {}) {
  return {
    ...live.common,
    evidenceId: 'retained-content',
    content: 'Retained evidence: Größe €\n',
    ...extra,
  };
}

test('retain-evidence retains valid UTF-8 caller content as a runtime-owned standard reference', async (t) => {
  const live = await start(fixture(t));
  const retained = await live.call('retain-evidence', retentionPayload(live));
  assert.equal(retained.root, live.root);
  assert.equal(
    retained.path,
    `.effective-flow/build-runs/${live.input.runId}/evidence-retained-content.txt`,
  );
  assert.equal(
    readFileSync(path.join(retained.root, retained.path), 'utf8'),
    'Retained evidence: Größe €\n',
  );
  assert.equal(retained.digest, contentDigest('Retained evidence: Größe €\n'));
});

test('retain-evidence accepts exact one-megabyte UTF-8 content by byte length', async (t) => {
  const live = await start(fixture(t));
  const content = '€'.repeat(Math.floor((1024 * 1024) / 3)) + 'a';
  assert.equal(Buffer.byteLength(content), 1024 * 1024);
  const retained = await live.call(
    'retain-evidence',
    retentionPayload(live, {
      evidenceId: 'utf8-limit',
      content,
    }),
  );
  assert.equal(retained.digest, contentDigest(content));
});

test('retain-evidence accepts one existing artifact source and preserves its exact bytes and digest', async (t) => {
  const live = await start(fixture(t));
  const sourcePath = `.effective-flow/build-runs/${live.input.runId}/existing-evidence.bin`;
  const bytes = Buffer.from('source evidence €\n', 'utf8');
  writeFileSync(path.join(live.root, sourcePath), bytes);
  const retained = await live.call('retain-evidence', {
    ...live.common,
    evidenceId: 'retained-source',
    source: { root: live.root, path: sourcePath, digest: contentDigest(bytes) },
  });
  assert.equal(
    retained.path,
    `.effective-flow/build-runs/${live.input.runId}/evidence-retained-source.txt`,
  );
  assert.deepEqual(readFileSync(path.join(retained.root, retained.path)), bytes);
  assert.equal(retained.digest, contentDigest(bytes));
});

test('retain-evidence rejects invalid schemas, encoding, size, identity and source safety constraints', async (t) => {
  const live = await start(fixture(t));
  const existingPath = `.effective-flow/build-runs/${live.input.runId}/existing.txt`;
  const existing = Buffer.from('existing\n');
  writeFileSync(path.join(live.root, existingPath), existing);
  const oversizedSourcePath = `.effective-flow/build-runs/${live.input.runId}/oversized-source.bin`;
  const oversizedSource = Buffer.alloc(1024 * 1024 + 1, 0x61);
  writeFileSync(path.join(live.root, oversizedSourcePath), oversizedSource);
  const hardlinkOriginPath = path.join(live.root, 'hardlink-origin.txt');
  const hardlinkPath = path.join(live.root, 'hardlink.txt');
  const hardlinkBytes = Buffer.from('hardlink source\n');
  writeFileSync(hardlinkOriginPath, hardlinkBytes);
  assert.equal(spawnSync('ln', [hardlinkOriginPath, hardlinkPath], { env }).status, 0);
  const validSource = { root: live.root, path: existingPath, digest: contentDigest(existing) };
  const cases = [
    { name: 'missing evidence id', code: 'INVALID_PAYLOAD', payload: { content: 'x' } },
    {
      name: 'path-like evidence id',
      code: 'INVALID_PAYLOAD',
      payload: { evidenceId: '../escape', content: 'x' },
    },
    {
      name: 'unknown key',
      code: 'INVALID_PAYLOAD',
      payload: { evidenceId: 'unknown', content: 'x', extra: true },
    },
    {
      name: 'neither content nor source',
      code: 'INVALID_PAYLOAD',
      payload: { evidenceId: 'none' },
    },
    {
      name: 'both content and source',
      code: 'INVALID_PAYLOAD',
      payload: { evidenceId: 'both', content: 'x', source: validSource },
    },
    {
      name: 'empty content',
      code: 'INVALID_PAYLOAD',
      payload: { evidenceId: 'empty', content: '' },
    },
    {
      name: 'NUL content',
      code: 'INVALID_PAYLOAD',
      payload: { evidenceId: 'nul', content: 'x\0y' },
    },
    {
      name: 'ill-formed UTF-8 content',
      code: 'INVALID_PAYLOAD',
      payload: { evidenceId: 'ill-formed', content: Buffer.from([0xc3, 0x28]) },
    },
    {
      name: 'unpaired surrogate content',
      code: 'INVALID_PAYLOAD',
      payload: { evidenceId: 'surrogate', content: '\ud800' },
    },
    {
      name: 'oversized content',
      code: 'TOO_LARGE',
      payload: { evidenceId: 'oversized', content: 'x'.repeat(1024 * 1024 + 1) },
    },
    {
      name: 'oversized source',
      code: 'TOO_LARGE',
      payload: {
        evidenceId: 'oversized-source',
        source: {
          root: live.root,
          path: oversizedSourcePath,
          digest: contentDigest(oversizedSource),
        },
      },
    },
    {
      name: 'source digest drift',
      code: 'DIGEST_MISMATCH',
      payload: { evidenceId: 'drift', source: { ...validSource, digest: contentDigest('wrong') } },
    },
    {
      name: 'source outside allowed roots',
      code: 'UNSAFE_PATH',
      payload: { evidenceId: 'outside', source: { ...validSource, root: path.dirname(live.root) } },
    },
    {
      name: 'source symlink',
      code: 'UNSAFE_PATH',
      payload: { evidenceId: 'symlink', source: { ...validSource, path: 'link.txt' } },
    },
    {
      name: 'source hardlink',
      code: 'UNSAFE_PATH',
      payload: {
        evidenceId: 'hardlink',
        source: { root: live.root, path: 'hardlink.txt', digest: contentDigest(hardlinkBytes) },
      },
    },
  ];
  symlinkSync(existingPath, path.join(live.root, 'link.txt'));
  for (const item of cases)
    await assert.rejects(
      live.call('retain-evidence', { ...live.common, ...item.payload }),
      error(item.code),
      item.name,
    );
});

test('retain-evidence rejects target collisions and held runtime locks before writing', async (t) => {
  const live = await start(fixture(t));
  const target = path.join(
    live.root,
    '.effective-flow',
    'build-runs',
    live.input.runId,
    'evidence-collision.txt',
  );
  writeFileSync(target, 'existing target\n');
  await assert.rejects(
    live.call('retain-evidence', retentionPayload(live, { evidenceId: 'collision' })),
    error('COLLISION'),
  );
  writeFileSync(
    path.join(live.root, '.effective-flow', 'build-runs', live.input.runId, '.operation.lock'),
    'held',
  );
  await assert.rejects(
    live.call('retain-evidence', retentionPayload(live, { evidenceId: 'locked' })),
    error('LOCKED'),
  );
});

test('retain-evidence accepts tracked product sources while protecting tracked runtime state', async (t) => {
  const live = await start(fixture(t));
  const retained = await live.call('retain-evidence', {
    ...live.common,
    evidenceId: 'tracked-product-source',
    source: { root: live.root, path: 'source.txt', digest: contentDigest('initial\n') },
  });
  assert.equal(retained.digest, contentDigest('initial\n'));
  const trackedRuntimePath = `.effective-flow/build-runs/${live.input.runId}/tracked-runtime.txt`;
  writeFileSync(path.join(live.root, trackedRuntimePath), 'tracked runtime\n');
  git(live.root, 'add', '-f', trackedRuntimePath);
  await assert.rejects(
    live.call('retain-evidence', {
      ...live.common,
      evidenceId: 'tracked-runtime-source',
      source: {
        root: live.root,
        path: trackedRuntimePath,
        digest: contentDigest('tracked runtime\n'),
      },
    }),
    error('UNSAFE_RUNTIME_ROOT'),
  );
});

test('retain-evidence keeps runtime and migration guards before writing', async (t) => {
  const live = await start(fixture(t));
  writeFileSync(path.join(live.root, '.gitignore'), '');
  await assert.rejects(
    live.call('retain-evidence', retentionPayload(live, { evidenceId: 'runtime-not-ignored' })),
    error('REPOSITORY_MISMATCH'),
  );
  const migrated = await start(fixture(t));
  writeFileSync(path.join(migrated.root, '.gitignore'), '.effective-flow/\n');
  writeFileSync(path.join(migrated.root, '.effective-flow', 'memory.json'), '{}');
  await assert.rejects(
    migrated.call(
      'retain-evidence',
      retentionPayload(migrated, { evidenceId: 'migration-missing' }),
    ),
    error('MIGRATION_REQUIRED'),
  );
  const foreign = await start(fixture(t));
  const other = fixture(t);
  const mismatch = { ...foreign.common, repositoryIdentity: path.join(other.root, '.git') };
  await assert.rejects(
    foreign.call(
      'retain-evidence',
      retentionPayload(foreign, { evidenceId: 'main-mismatch', ...mismatch }),
    ),
    error('REPOSITORY_MISMATCH'),
  );
});

test('retain-evidence is allowed after handoff as runtime-only retention and terminal runs remain immutable', async (t) => {
  const live = await completed(fixture(t));
  const handoffRetention = await live.call(
    'retain-evidence',
    retentionPayload(live, { evidenceId: 'post-handoff' }),
  );
  assert.equal(handoffRetention.root, live.root);
  const terminal = await live.call('terminal', terminalInput(live));
  await assert.rejects(
    live.call('retain-evidence', retentionPayload(live, { evidenceId: 'post-terminal' })),
    error('TERMINAL_RUN'),
  );
  assert.equal((await live.call('verify-terminal', { ...live.common, terminal })).status, 'DONE');
});

test('untracked workload plan needs runtime retention before an ABORT terminal can be verified', async (t) => {
  const live = await start(fixture(t));
  const workloadPath = 'workload-plan.md';
  const workload = '# Untracked workload plan\n';
  writeFileSync(path.join(live.executionRoot, workloadPath), workload);
  const checkpoint = await live.call('checkpoint', {
    ...live.common,
    checkpointId: 'abort-evidence',
    agentHandle: 'original-child-handle',
    completed: [],
    pending: REQUIRED_GATES,
    evidence: [],
  });
  const checkpointValue = JSON.parse(
    readFileSync(path.join(checkpoint.root, checkpoint.path), 'utf8'),
  );
  const finalCheckout = {
    repositoryIdentity: live.repositoryIdentity,
    executionRoot: live.executionRoot,
    branch: live.input.execution.branch,
    head: checkpointValue.snapshot.head,
    snapshot: checkpointValue.snapshot,
    worktreeRemoved: false,
  };
  const abort = (finalPlan) => ({
    ...live.common,
    status: 'ABORT',
    finalPlan,
    finalCheckout,
    gates: [],
    retainedWorktree: null,
    pilotStatus: 'not-applicable',
    conclusion: 'Workload stopped before delivery.',
    nextWorkflow: 'Resume the workload later.',
  });
  const workloadRef = live.ref(live.executionRoot, workloadPath);
  await assert.rejects(live.call('terminal', abort(workloadRef)), error('MISSING_EVIDENCE'));
  const retained = await live.call('retain-evidence', {
    ...live.common,
    evidenceId: 'workload-plan',
    source: workloadRef,
  });
  const terminal = await live.call('terminal', abort(retained));
  assert.equal((await live.call('verify-terminal', { ...live.common, terminal })).status, 'ABORT');
});

test('retains the actual archived final plan before handoff and permits a durable ABORT terminal', async (t) => {
  const live = await preparedForTransform(t);
  const source = live.ref(live.executionRoot, 'archive/plan.md');
  const sealRef = await live.call('seal-delivery', sealing(live));
  const seal = JSON.parse(readFileSync(path.join(sealRef.root, sealRef.path), 'utf8'));
  assert.equal(seal.finalPlan.digest, source.digest);
  assert.equal(existsSync(path.join(live.executionRoot, 'plan.md')), false);
  assert.equal(git(live.executionRoot, 'rev-parse', 'HEAD'), live.input.execution.head);
  assert.equal(
    existsSync(
      path.join(live.root, '.effective-flow/build-runs', live.input.runId, 'handoff.json'),
    ),
    false,
  );
  const retained = await live.call('retain-evidence', {
    ...live.common,
    evidenceId: 'archived-final-plan',
    source,
  });
  assert.deepEqual(
    readFileSync(path.join(retained.root, retained.path)),
    readFileSync(path.join(source.root, source.path)),
  );
  const terminal = await live.call('terminal', {
    ...live.common,
    status: 'ABORT',
    finalPlan: retained,
    finalCheckout: {
      repositoryIdentity: live.repositoryIdentity,
      executionRoot: live.executionRoot,
      branch: live.execution.branch,
      head: seal.snapshot.head,
      snapshot: seal.snapshot,
      worktreeRemoved: false,
    },
    gates: [],
    retainedWorktree: {
      root: live.executionRoot,
      dirty: true,
      reason: 'Archived completion output retained before commit and handoff.',
    },
    pilotStatus: 'not-applicable',
    conclusion: 'Delivery was intentionally aborted before commit and handoff.',
    nextWorkflow: 'Review the retained plan before resuming.',
  });
  assert.equal((await live.call('verify-terminal', { ...live.common, terminal })).status, 'ABORT');
});

test('CLI recognizes retain-evidence from a linked checkout while retaining into the verified runtime root', async (t) => {
  const fx = fixture(t);
  const linked = path.join(fx.root, '.effective-flow', 'linked-cli');
  git(fx.root, 'worktree', 'add', '-b', 'linked-cli', linked);
  const created = await fx.call('create', fx.input);
  const common = {
    runtimeStateRoot: fx.root,
    repositoryIdentity: fx.repositoryIdentity,
    runId: fx.input.runId,
    requestDigest: created.requestDigest,
  };
  await fx.call('bind-agent', { ...common, agentHandle: 'original-child-handle' });
  const cli = fileURLToPath(new URL('../src/scripts/build-run.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'retain-evidence'], {
    cwd: linked,
    input: JSON.stringify({
      ...common,
      evidenceId: 'cli-retained',
      content: 'CLI evidence\n',
    }),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.operation, 'retain-evidence');
  assert.equal(envelope.result.root, fx.root);
  assert.equal(
    envelope.result.path,
    `.effective-flow/build-runs/${fx.input.runId}/evidence-cli-retained.txt`,
  );
});

test('checkpoint cannot promote an unfinished phase and DONE cannot claim cleanup before removal', async (t) => {
  const live = await start(fixture(t));
  await assert.rejects(
    live.call('checkpoint', {
      ...live.common,
      checkpointId: 'invented',
      agentHandle: 'original-child-handle',
      completed: ['implementation'],
      pending: REQUIRED_GATES.filter((gate) => gate !== 'implementation'),
      evidence: [],
    }),
    error('INCOMPLETE_GATES'),
  );
  const complete = await completed(fixture(t));
  await assert.rejects(
    complete.call(
      'terminal',
      terminalInput(complete, {
        finalCheckout: { ...complete.finalCheckout, worktreeRemoved: true },
      }),
    ),
    error('CONTENT_DRIFT'),
  );
  writeFileSync(path.join(complete.executionRoot, 'source.txt'), 'dirty after verification');
  await assert.rejects(complete.call('terminal', terminalInput(complete)), error('CONTENT_DRIFT'));
});

test('an interrupted operation lock blocks replay without repairing or overwriting state', async (t) => {
  const live = await start(fixture(t));
  const lock = path.join(
    live.root,
    '.effective-flow',
    'build-runs',
    live.input.runId,
    '.operation.lock',
  );
  writeFileSync(lock, 'retained interrupted operation');
  await assert.rejects(
    live.call('bind-agent', { ...live.common, agentHandle: 'replacement' }),
    error('LOCKED'),
  );
  assert.equal(readFileSync(lock, 'utf8'), 'retained interrupted operation');
});

test('setup transition binds the new owned execution root and detects content drift there with unchanged HEAD', async (t) => {
  const initial = await start(fixture(t, true));
  assert.equal(
    JSON.parse(readFileSync(path.join(initial.created.request.root, initial.created.request.path)))
      .execution.executionRoot,
    initial.root,
  );
  const live = await setupDelivery(initial);
  const cp = await live.call('checkpoint', {
    ...live.common,
    checkpointId: 'actual-root',
    agentHandle: 'original-child-handle',
    completed: [],
    pending: REQUIRED_GATES,
    evidence: [],
  });
  const before = JSON.parse(readFileSync(path.join(cp.root, cp.path)));
  const { question } = await pause(live);
  const expected = git(live.executionRoot, 'rev-parse', 'HEAD');
  writeFileSync(path.join(live.executionRoot, 'source.txt'), 'delivery-only edit');
  assert.equal(git(live.executionRoot, 'rev-parse', 'HEAD'), expected);
  assert.equal(readFileSync(path.join(live.root, 'source.txt'), 'utf8'), 'initial\n');
  await assert.rejects(
    live.call('reply', { ...live.common, question, trustedUser: trusted(question) }),
    error('CONTENT_DRIFT'),
  );
  assert.equal(before.snapshot.head, expected);
  await assert.rejects(
    live.call('transition-execution', {
      ...live.common,
      agentHandle: 'original-child-handle',
      authorization: live.transition,
      execution: live.execution,
      ownership: null,
    }),
    error('INVALID_STATE'),
  );
});

test('runtime root must be the first usable main worktree rather than a linked checkout in the same repository', async (t) => {
  const fx = fixture(t);
  const linked = path.join(fx.root, '.effective-flow', 'linked');
  git(fx.root, 'worktree', 'add', '-b', 'linked', linked);
  mkdirSync(path.join(linked, '.effective-flow'));
  writeFileSync(
    path.join(linked, '.effective-flow', 'memory.json'),
    JSON.stringify({ runtimeMigration: { directory: { version: 1 } } }),
  );
  const input = {
    ...fx.input,
    runtimeStateRoot: linked,
    execution: {
      ...fx.input.execution,
      executionRoot: linked,
      branch: 'linked',
      origin: 'harness-managed',
    },
    plan: fx.ref(linked, 'plan.md'),
    allowedRoots: [linked],
  };
  await assert.rejects(fx.call('create', input), error('UNSAFE_RUNTIME_ROOT'));
  assert.equal(readdirSync(path.join(linked, '.effective-flow')).includes('build-runs'), false);
});

test('a foreign lifecycle session or held lifecycle lock cannot prove new worktree ownership', async (t) => {
  const live = await start(fixture(t, true));
  const authorization = await live.call('authorize-execution', {
    ...live.common,
    agentHandle: 'original-child-handle',
    mode: 'owned-worktree',
    executionRoot: live.targetExecutionRoot,
    branch: 'feature',
    baseHead: live.input.execution.head,
    authority: { kind: 'configuration' },
  });
  git(live.root, 'worktree', 'add', '-b', 'feature', live.targetExecutionRoot);
  const fakePath = '.effective-flow/worktree-runs/foreign.json';
  mkdirSync(path.dirname(path.join(live.root, fakePath)), { recursive: true });
  writeFileSync(
    path.join(live.root, fakePath),
    JSON.stringify({
      schemaVersion: 1,
      recordId: 'foreign',
      sessionId: 'foreign-run',
      componentId: null,
      workflow: 'build',
      purpose: 'delivery',
      repositoryIdentity: live.repositoryIdentity,
      runtimeStateRoot: live.root,
      worktreePath: live.targetExecutionRoot,
      branch: 'feature',
      creationOid: live.input.execution.head,
      ownership: 'effective-flow-created',
      receipt: {},
      branchPolicy: 'retain',
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
      status: 'active',
      reason: null,
    }),
  );
  await assert.rejects(
    live.call('transition-execution', {
      ...live.common,
      agentHandle: 'original-child-handle',
      authorization,
      execution: {
        executionRoot: live.targetExecutionRoot,
        branch: 'feature',
        head: live.input.execution.head,
        origin: 'effective-flow-created',
        owner: 'build',
      },
      ownership: live.ref(live.root, fakePath),
    }),
    error('AUTHORITY_MISMATCH'),
  );
});

test('detached external checkout can adopt only the pre-authorized harness branch without worktree ownership', async (t) => {
  const fx = fixture(t);
  const linked = path.join(fx.root, '.effective-flow', 'harness');
  git(fx.root, 'worktree', 'add', '--detach', linked);
  fx.input.execution = {
    ...fx.input.execution,
    executionRoot: linked,
    branch: null,
    origin: 'harness-managed',
  };
  fx.input.allowedRoots.push(linked);
  fx.input.plan = fx.ref(linked, 'plan.md');
  const live = await start(fx);
  const authorization = await live.call('authorize-execution', {
    ...live.common,
    agentHandle: 'original-child-handle',
    mode: 'reuse-worktree',
    executionRoot: linked,
    branch: 'harness-feature',
    baseHead: fx.input.execution.head,
    authority: { kind: 'configuration' },
  });
  git(linked, 'switch', '-c', 'harness-feature');
  await live.call('transition-execution', {
    ...live.common,
    agentHandle: 'original-child-handle',
    authorization,
    execution: { ...fx.input.execution, branch: 'harness-feature' },
    ownership: null,
  });
  const checkpoint = await live.call('checkpoint', {
    ...live.common,
    checkpointId: 'harness',
    agentHandle: 'original-child-handle',
    completed: [],
    pending: REQUIRED_GATES,
    evidence: [],
  });
  assert.equal(
    JSON.parse(readFileSync(path.join(checkpoint.root, checkpoint.path))).snapshot.head,
    fx.input.execution.head,
  );
});

test('ordinary completion preserves earlier review evidence through proven plan append/archive/stage/commit transformations', async (t) => {
  const live = await completed(fixture(t));
  const originalReview = JSON.parse(
    readFileSync(path.join(live.finalValidation.root, live.finalValidation.path)),
  );
  assert.notEqual(originalReview.snapshot.head, live.finalCheckout.head);
  assert.equal(
    live.gates.filter((ref) => path.basename(ref.path).startsWith('gate-final-validation-')).length,
    1,
  );
  const terminal = await live.call('terminal', terminalInput(live));
  assert.equal((await live.call('verify-terminal', { ...live.common, terminal })).status, 'DONE');
});

for (const operation of ['delete', 'rename'])
  test(`checkpoint snapshots an unstaged ${operation} of a tracked directory as missing content`, async (t) => {
    const fx = fixture(t);
    mkdirSync(path.join(fx.root, 'nested/old'), { recursive: true });
    writeFileSync(path.join(fx.root, 'nested/old/source.txt'), 'tracked nested source\n');
    git(fx.root, 'add', 'nested');
    git(fx.root, 'commit', '-m', 'tracked nested source');
    fx.input.execution.head = git(fx.root, 'rev-parse', 'HEAD');
    const live = await start(fx);
    const checkpoint = (checkpointId) =>
      live.call('checkpoint', {
        ...live.common,
        agentHandle: 'original-child-handle',
        checkpointId,
        completed: [],
        pending: REQUIRED_GATES,
        evidence: [],
      });
    const beforeRef = await checkpoint('before');
    const before = JSON.parse(readFileSync(path.join(beforeRef.root, beforeRef.path)));
    if (operation === 'rename')
      renameSync(path.join(fx.root, 'nested'), path.join(fx.root, 'renamed'));
    else rmSync(path.join(fx.root, 'nested'), { recursive: true });
    const afterRef = await checkpoint('after');
    const after = JSON.parse(readFileSync(path.join(afterRef.root, afterRef.path)));
    assert.equal(after.snapshot.index, before.snapshot.index);
    assert.notEqual(after.snapshot.workingTree, before.snapshot.workingTree);
    assert.equal(after.snapshot.head, before.snapshot.head);
    if (operation === 'rename')
      assert.notEqual(after.snapshot.untracked, before.snapshot.untracked);
    assert.equal((await checkpoint('stable')).digest.startsWith('sha256:'), true);
  });

test('checkpoint snapshots an unstaged tracked-directory replacement by a regular file', async (t) => {
  const fx = fixture(t);
  mkdirSync(path.join(fx.root, 'nested/old'), { recursive: true });
  writeFileSync(path.join(fx.root, 'nested/old/source.txt'), 'tracked nested source\n');
  git(fx.root, 'add', 'nested');
  git(fx.root, 'commit', '-m', 'tracked nested source');
  fx.input.execution.head = git(fx.root, 'rev-parse', 'HEAD');
  const live = await start(fx);
  const checkpoint = async (checkpointId) => {
    const ref = await live.call('checkpoint', {
      ...live.common,
      agentHandle: 'original-child-handle',
      checkpointId,
      completed: [],
      pending: REQUIRED_GATES,
      evidence: [],
    });
    return JSON.parse(readFileSync(path.join(ref.root, ref.path)));
  };
  const before = await checkpoint('before-replacement');
  rmSync(path.join(fx.root, 'nested'), { recursive: true });
  const replacement = 'regular file replacing the tracked directory\n';
  writeFileSync(path.join(fx.root, 'nested'), replacement);
  const after = await checkpoint('after-replacement');
  const tracked = git(fx.root, 'ls-files')
    .split('\n')
    .sort()
    .map((name) =>
      name === 'nested/old/source.txt'
        ? [name, 'missing']
        : [
            name,
            statSync(path.join(fx.root, name)).mode & 0o111 ? '100755' : '100644',
            contentDigest(readFileSync(path.join(fx.root, name))),
          ],
    );
  assert.equal(after.snapshot.workingTree, contentDigest(JSON.stringify(tracked)));
  assert.equal(
    after.snapshot.untracked,
    contentDigest(JSON.stringify([['nested', '100644', contentDigest(replacement)]])),
  );
  assert.equal(after.snapshot.head, before.snapshot.head);
  assert.equal(after.snapshot.index, before.snapshot.index);
  assert.notEqual(after.snapshot.workingTree, before.snapshot.workingTree);
  assert.deepEqual((await checkpoint('stable-replacement')).snapshot, after.snapshot);
  writeFileSync(path.join(fx.root, 'nested'), 'changed replacement file\n');
  const changed = await checkpoint('changed-replacement');
  assert.equal(changed.snapshot.head, before.snapshot.head);
  assert.equal(changed.snapshot.index, before.snapshot.index);
  assert.equal(changed.snapshot.workingTree, after.snapshot.workingTree);
  assert.notEqual(changed.snapshot.untracked, after.snapshot.untracked);
});

test('checkpoint snapshots an unstaged tracked-file replacement by a directory with a new leaf', async (t) => {
  const fx = fixture(t);
  mkdirSync(path.join(fx.root, 'src'));
  writeFileSync(path.join(fx.root, 'src/item'), 'tracked leaf\n');
  git(fx.root, 'add', 'src/item');
  git(fx.root, 'commit', '-m', 'tracked source leaf');
  fx.input.execution.head = git(fx.root, 'rev-parse', 'HEAD');
  const live = await start(fx);
  const checkpoint = async (checkpointId) => {
    const ref = await live.call('checkpoint', {
      ...live.common,
      agentHandle: 'original-child-handle',
      checkpointId,
      completed: [],
      pending: REQUIRED_GATES,
      evidence: [],
    });
    return JSON.parse(readFileSync(path.join(ref.root, ref.path)));
  };
  const before = await checkpoint('before-file-replacement');
  rmSync(path.join(fx.root, 'src/item'));
  mkdirSync(path.join(fx.root, 'src/item'));
  const child = 'new child content\n';
  writeFileSync(path.join(fx.root, 'src/item/child'), child);
  const after = await checkpoint('after-file-replacement');
  const tracked = git(fx.root, 'ls-files')
    .split('\n')
    .sort()
    .map((name) =>
      name === 'src/item'
        ? [name, 'missing']
        : [
            name,
            statSync(path.join(fx.root, name)).mode & 0o111 ? '100755' : '100644',
            contentDigest(readFileSync(path.join(fx.root, name))),
          ],
    );
  assert.equal(after.snapshot.workingTree, contentDigest(JSON.stringify(tracked)));
  assert.equal(
    after.snapshot.untracked,
    contentDigest(JSON.stringify([['src/item/child', '100644', contentDigest(child)]])),
  );
  assert.equal(after.snapshot.head, before.snapshot.head);
  assert.equal(after.snapshot.index, before.snapshot.index);
  assert.notEqual(after.snapshot.workingTree, before.snapshot.workingTree);
  assert.notEqual(after.snapshot.untracked, before.snapshot.untracked);
  assert.deepEqual((await checkpoint('stable-file-replacement')).snapshot, after.snapshot);
  writeFileSync(path.join(fx.root, 'src/item/child'), 'changed child content\n');
  const changed = await checkpoint('changed-new-leaf');
  assert.equal(changed.snapshot.head, before.snapshot.head);
  assert.equal(changed.snapshot.index, before.snapshot.index);
  assert.equal(changed.snapshot.workingTree, after.snapshot.workingTree);
  assert.notEqual(changed.snapshot.untracked, after.snapshot.untracked);
});

for (const kind of ['symlink', 'dangling-symlink', 'special-ancestor', 'special-leaf'])
  test(`snapshot refuses an existing ${kind} obstruction instead of classifying it as deleted`, async (t) => {
    const fx = fixture(t);
    mkdirSync(path.join(fx.root, 'nested/old'), { recursive: true });
    writeFileSync(path.join(fx.root, 'nested/old/source.txt'), 'tracked nested source\n');
    git(fx.root, 'add', 'nested');
    git(fx.root, 'commit', '-m', 'tracked nested source');
    fx.input.execution.head = git(fx.root, 'rev-parse', 'HEAD');
    const live = await start(fx);
    if (kind === 'special-leaf') {
      rmSync(path.join(fx.root, 'nested/old/source.txt'));
      const result = spawnSync('mkfifo', [path.join(fx.root, 'nested/old/source.txt')]);
      assert.equal(result.status, 0, result.stderr?.toString());
    } else {
      const original = path.join(fx.root, '.effective-flow/original');
      renameSync(path.join(fx.root, 'nested'), original);
      if (kind === 'special-ancestor') {
        const result = spawnSync('mkfifo', [path.join(fx.root, 'nested')]);
        assert.equal(result.status, 0, result.stderr?.toString());
      } else
        symlinkSync(
          kind === 'dangling-symlink' ? original + '-absent' : original,
          path.join(fx.root, 'nested'),
        );
    }
    await assert.rejects(
      live.call('checkpoint', {
        ...live.common,
        agentHandle: 'original-child-handle',
        checkpointId: 'unsafe',
        completed: [],
        pending: REQUIRED_GATES,
        evidence: [],
      }),
      error(kind === 'special-leaf' ? 'RECONCILIATION_REQUIRED' : 'UNSAFE_PATH'),
    );
  });

test('checkpoint refuses a present real indexed gitlink directory', async (t) => {
  const fx = fixture(t);
  const live = await start(fx);
  const head = git(fx.root, 'rev-parse', 'HEAD');
  mkdirSync(path.join(fx.root, 'module'));
  git(fx.root, 'update-index', '--add', '--cacheinfo', `160000,${head},module`);
  assert.ok(git(fx.root, 'ls-files', '--stage').split('\n').includes(`160000 ${head} 0\tmodule`));
  await assert.rejects(
    live.call('checkpoint', {
      ...live.common,
      agentHandle: 'original-child-handle',
      checkpointId: 'actual-gitlink',
      completed: [],
      pending: REQUIRED_GATES,
      evidence: [],
    }),
    error('RECONCILIATION_REQUIRED'),
  );
});

test('pre-handoff question relay accepts a verified completion append and archive without ending product authority', async (t) => {
  const live = await preparedForTransform(t);
  const completion = {
    completionBasis: live.prepared,
    currentPlan: live.ref(live.root, 'archive/plan.md'),
  };
  const gates = JSON.parse(readFileSync(path.join(live.prepared.root, live.prepared.path))).gates;
  const completed = ['independent-review', 'final-validation'];
  const cp = await live.call('checkpoint', {
    ...live.common,
    checkpointId: 'completion-pause',
    agentHandle: 'original-child-handle',
    ...completion,
    completed,
    pending: REQUIRED_GATES.filter((gate) => !completed.includes(gate)),
    evidence: gates,
  });
  const question = await live.call('question', {
    ...live.common,
    checkpoint: cp,
    questionId: 'completion-pause',
    revision: 1,
    origin: 'completion-recovery',
    agentHandle: 'original-child-handle',
    question: 'Continue with the verified completion output?',
    options: ['Continue', 'Stop'],
    responseType: 'option',
    ...completion,
  });
  const reply = await live.call('reply', {
    ...live.common,
    question,
    trustedUser: trusted(question, 'Continue'),
    ...completion,
  });
  const resumed = await live.call('resume', {
    ...live.common,
    question,
    reply,
    agentHandle: 'original-child-handle',
    ...completion,
  });
  assert.equal(resumed.authority, 'product');
  await assert.rejects(
    live.call('resume', {
      ...live.common,
      question,
      reply,
      agentHandle: 'original-child-handle',
      ...completion,
    }),
    error('STALE_REPLY'),
  );
  assert.ok((await live.call('seal-delivery', sealing(live))).digest);
});

test('completion relay rejects rewritten requirements, product drift and a foreign preparation receipt', async (t) => {
  const live = await preparedForTransform(t);
  const planPath = path.join(live.root, 'archive/plan.md');
  const original = readFileSync(planPath);
  const gates = JSON.parse(readFileSync(path.join(live.prepared.root, live.prepared.path))).gates;
  const completed = ['independent-review', 'final-validation'];
  const input = () => ({
    ...live.common,
    checkpointId: 'tampered-completion',
    agentHandle: 'original-child-handle',
    completionBasis: live.prepared,
    currentPlan: live.ref(live.root, 'archive/plan.md'),
    completed,
    pending: REQUIRED_GATES.filter((gate) => !completed.includes(gate)),
    evidence: gates,
  });
  writeFileSync(planPath, '# Rewritten requirements\n\n**Plan status:** Implemented\n');
  await assert.rejects(live.call('checkpoint', input()), error('RECHECK_REQUIRED'));
  writeFileSync(planPath, original);
  writeFileSync(path.join(live.root, 'source.txt'), 'unauthorized product drift\n');
  await assert.rejects(live.call('checkpoint', input()), error('CONTENT_DRIFT'));
  writeFileSync(path.join(live.root, 'source.txt'), 'initial\n');
  await assert.rejects(
    live.call('checkpoint', {
      ...input(),
      completionBasis: { ...live.prepared, digest: contentDigest('foreign receipt') },
    }),
    (failure) => ['DIGEST_MISMATCH', 'FOREIGN_RECORD'].includes(failure.code),
  );
});

test('protected admission can remain pending after verified completion archival without waiving its original remote requirement', async (t) => {
  const fx = fixture(t);
  fx.input.remoteValidation = {
    protocol: 'effective-flow.protected-validation/1',
    requiredGates: ['validation'],
    policyDigest: contentDigest('original protected policy'),
  };
  const live = await preparedForTransform(t, fx);
  const completion = {
    completionBasis: live.prepared,
    currentPlan: live.ref(live.root, 'archive/plan.md'),
  };
  const input = { ...live.common, validatorHandle: 'independent-validator', gate: 'validation' };
  // Without explicit verified completion context the immutable original-plan guard still applies.
  await assert.rejects(live.call('validation-await-admission', input), error('MISSING_EVIDENCE'));
  const pending = await live.call('validation-await-admission', { ...input, ...completion });
  assert.equal(pending.state, 'pending');
  assert.equal(pending.bootstrapRef, null);
  assert.equal(
    readdirSync(path.join(live.root, '.effective-flow/build-runs/fixture-run')).some((name) =>
      name.startsWith('gate-validation-'),
    ),
    false,
  );
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(live.created.request.root, live.created.request.path)))
      .remoteValidation,
    fx.input.remoteValidation,
  );
});

for (const refusal of ['collision', 'probe-failure', 'write-failure'])
  test(`completion retains the verified original plan when archival reports ${refusal}`, async (t) => {
    const fx = fixture(t);
    // These are pre-existing repository conditions, not unreviewed completion output.
    if (refusal === 'collision') {
      mkdirSync(path.join(fx.root, 'archive'));
      writeFileSync(path.join(fx.root, 'archive/plan.md'), '# A different archived plan\n');
      git(fx.root, 'add', 'archive/plan.md');
    } else if (refusal === 'write-failure') {
      writeFileSync(path.join(fx.root, 'archive'), 'archive parent is a file\n');
      git(fx.root, 'add', 'archive');
    }
    if (refusal !== 'probe-failure') {
      git(fx.root, 'commit', '-m', 'existing archival obstacle');
      fx.input.execution.head = git(fx.root, 'rev-parse', 'HEAD');
    }
    const live = await setupDelivery(await start(fx));
    const original = readFileSync(path.join(live.root, 'plan.md'));
    const obstacle =
      refusal === 'probe-failure'
        ? null
        : readFileSync(
            path.join(live.root, refusal === 'collision' ? 'archive/plan.md' : 'archive'),
          );
    const evidence = [
      durable(
        live,
        'archival-refusal.txt',
        `Archival stopped: ${refusal}; retained plan.md unchanged.\n`,
      ),
    ];
    const gates = [];
    for (const gate of REQUIRED_GATES.filter(
      (name) =>
        !['delivery', 'plan-archival', 'pilot-finalization', 'cleanup', 'completion'].includes(
          name,
        ),
    ))
      gates.push(await issue(live, gate, evidence));
    const prepared = await live.call('prepare-completion', {
      ...live.common,
      preparationId: 'retained',
      agentHandle: 'original-child-handle',
      gates: gates.filter((item) =>
        /gate-(independent-review|final-validation)-/.test(path.basename(item.path)),
      ),
    });
    // The authoritative runner probe must observe the refusal itself.
    const originalRunner = live.deps.runner;
    let failedProbes = 0;
    if (refusal === 'probe-failure') {
      live.deps.runner = (call) => {
        if (
          call.executable === 'git' &&
          call.args.includes('ls-files') &&
          call.args.includes(':(literal)plan.md') &&
          call.args.includes(':(literal)archive/plan.md')
        ) {
          failedProbes += 1;
          return {
            status: 128,
            stdout: '',
            stderr: 'fixture: archival tracking probe unavailable\n',
          };
        }
        return originalRunner(call);
      };
    } else if (refusal === 'write-failure') {
      assert.throws(() => mkdirSync(path.join(live.root, 'archive'), { recursive: true }), {
        code: 'EEXIST',
      });
    } else {
      assert.deepEqual(
        git(live.root, 'ls-files', 'plan.md', 'archive/plan.md').split('\n').sort(),
        ['archive/plan.md', 'plan.md'],
      );
    }
    const seal = await live.call('seal-delivery', {
      ...live.common,
      agentHandle: 'original-child-handle',
      sealId: 'retained',
      basis: prepared,
      finalPlan: live.ref(live.root, 'plan.md'),
      expectedTree: git(live.root, 'write-tree'),
      judgments: [],
      archivalRefusal: { reason: refusal },
    });
    const finalPlan = gitRef(live, 'plan.md');
    const handoffRef = await live.call('handoff', {
      ...live.common,
      agentHandle: 'original-child-handle',
      seal,
      head: finalPlan.commit,
      finalPlan,
    });
    const handoff = JSON.parse(readFileSync(path.join(handoffRef.root, handoffRef.path)));
    for (const gate of ['plan-archival', 'delivery', 'cleanup', 'pilot-finalization', 'completion'])
      gates.push(
        await issue(
          live,
          gate,
          evidence,
          gate === 'plan-archival'
            ? { reason: `Archival refused: ${refusal}; original plan retained.` }
            : {},
        ),
      );
    const terminal = await live.call(
      'terminal',
      terminalInput({
        ...live,
        gates,
        finalPlan: handoff.finalPlan,
        finalCheckout: {
          repositoryIdentity: live.repositoryIdentity,
          executionRoot: live.root,
          branch: live.execution.branch,
          head: handoff.head,
          snapshot: handoff.snapshot,
          worktreeRemoved: false,
        },
      }),
    );
    assert.equal((await live.call('verify-terminal', { ...live.common, terminal })).status, 'DONE');
    if (refusal === 'probe-failure')
      assert.ok(failedProbes > 0, 'the helper must run its own authoritative tracking probe');
    assert.deepEqual(readFileSync(path.join(live.root, 'plan.md')), original);
    if (obstacle)
      assert.deepEqual(
        readFileSync(path.join(live.root, refusal === 'collision' ? 'archive/plan.md' : 'archive')),
        obstacle,
      );
  });

test('retained-plan completion refuses an invented archival collision and altered original bytes', async (t) => {
  const live = await setupDelivery(await start(fixture(t)));
  const evidence = [durable(live)];
  const gates = [];
  for (const gate of ['independent-review', 'final-validation'])
    gates.push(await issue(live, gate, evidence));
  const prepared = await live.call('prepare-completion', {
    ...live.common,
    preparationId: 'refusal-integrity',
    agentHandle: 'original-child-handle',
    gates,
  });
  const seal = () =>
    live.call('seal-delivery', {
      ...live.common,
      agentHandle: 'original-child-handle',
      sealId: 'refusal-integrity',
      basis: prepared,
      finalPlan: live.ref(live.root, 'plan.md'),
      expectedTree: git(live.root, 'write-tree'),
      judgments: [],
      archivalRefusal: { reason: 'collision' },
    });
  await assert.rejects(seal(), error('MISSING_EVIDENCE'));
  mkdirSync(path.join(live.root, 'archive'));
  writeFileSync(path.join(live.root, 'archive/plan.md'), '# Foreign archive target\n');
  writeFileSync(
    path.join(live.root, 'plan.md'),
    '# Changed approved requirements\n\n**Plan status:** Not implemented\n',
  );
  await assert.rejects(seal(), error('RECHECK_REQUIRED'));
  assert.equal(
    readFileSync(path.join(live.root, 'archive/plan.md'), 'utf8'),
    '# Foreign archive target\n',
  );
});

for (const failedOperation of ['mkdir', 'rename'])
  test(`caller-observed transient ${failedOperation} refusal permits handback with the verified original plan and visible report`, async (t) => {
    const live = await preparedForRetainedPlan(t);
    const original = readFileSync(path.join(live.root, 'plan.md'));
    const observed = observedRefusal(live, failedOperation);
    const evidence = await retainRefusal(live, observed, 'observed-refusal');
    const seal = await retainedSeal(live, evidence);
    const finalPlan = gitRef(live, 'plan.md');
    const handoffRef = await live.call('handoff', {
      ...live.common,
      agentHandle: 'original-child-handle',
      seal,
      head: finalPlan.commit,
      finalPlan,
    });
    const handoff = JSON.parse(readFileSync(path.join(handoffRef.root, handoffRef.path)));
    for (const gate of ['plan-archival', 'delivery', 'cleanup', 'pilot-finalization', 'completion'])
      live.gates.push(
        await issue(
          live,
          gate,
          [evidence],
          gate === 'plan-archival' ? { reason: observed.visibleReport } : {},
        ),
      );
    const input = terminalInput({
      ...live,
      finalPlan: handoff.finalPlan,
      finalCheckout: {
        repositoryIdentity: live.repositoryIdentity,
        executionRoot: live.root,
        branch: live.execution.branch,
        head: handoff.head,
        snapshot: handoff.snapshot,
        worktreeRemoved: false,
      },
    });
    await assert.rejects(live.call('terminal', input), error('MISSING_EVIDENCE'));
    const terminal = await live.call('terminal', {
      ...input,
      conclusion: `Feature delivered. ${observed.visibleReport}`,
    });
    assert.equal((await live.call('verify-terminal', { ...live.common, terminal })).status, 'DONE');
    assert.deepEqual(readFileSync(path.join(live.root, 'plan.md')), original);
    assert.equal(existsSync(path.join(live.root, 'archive/plan.md')), false);
    assert.equal(
      JSON.parse(readFileSync(path.join(evidence.root, evidence.path))).provenance,
      'caller-observed',
    );
  });
