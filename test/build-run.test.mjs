import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  contentDigest,
  encodeControl,
  executeOperation,
  MAX_CONTROL_BYTES,
  MAX_DISPATCH_BYTES,
  REQUIRED_GATES,
} from '../src/scripts/build-run-core.mjs';
import { executeOperation as executeTrackerOperation } from '../src/scripts/remote-tracker-core.mjs';

const env = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Flow Test',
  GIT_AUTHOR_EMAIL: 'flow@example.invalid',
  GIT_COMMITTER_NAME: 'Flow Test',
  GIT_COMMITTER_EMAIL: 'flow@example.invalid',
};
function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture(t, separate = false) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'effective-flow-build-run-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '--initial-branch=develop');
  writeFileSync(path.join(root, '.gitignore'), '.effective-flow/\n');
  writeFileSync(
    path.join(root, 'plan.md'),
    '# Approved Feature plan\n\n**Plan status:** Not implemented\n',
  );
  writeFileSync(path.join(root, 'source.txt'), 'initial\n');
  git(root, 'add', '.gitignore', 'plan.md', 'source.txt');
  git(root, 'commit', '-m', 'fixture');
  mkdirSync(path.join(root, '.effective-flow'));
  writeFileSync(
    path.join(root, '.effective-flow', 'memory.json'),
    JSON.stringify({ runtimeMigration: { directory: { version: 1 } } }),
  );
  const repositoryIdentity = realpathSync(path.join(root, '.git'));
  const executionRoot = root;
  const targetExecutionRoot = separate ? path.join(root, '.effective-flow', 'checkout') : root;
  const deps = {
    runner: (call) => {
      const result = spawnSync(call.executable, call.args, {
        cwd: call.cwd,
        env,
        ...(call.stdoutBuffer ? {} : { encoding: 'utf8' }),
      });
      return {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
      };
    },
  };
  const ref = (owningRoot, relative) => ({
    root: owningRoot,
    path: relative,
    digest: contentDigest(readFileSync(path.join(owningRoot, relative))),
  });
  const input = {
    runtimeStateRoot: root,
    repositoryIdentity,
    runId: 'fixture-run',
    execution: {
      executionRoot,
      branch: 'develop',
      head: git(root, 'rev-parse', 'HEAD'),
      origin: 'current-checkout',
      owner: 'build',
    },
    plan: ref(executionRoot, 'plan.md'),
    source: {
      instruction: 'Implement the approved Feature plan and retain a delivery branch.',
      restrictions: ['No publication without user consent.'],
    },
    runMode: 'interactive',
    languages: Object.fromEntries(
      ['source', 'documentation.user', 'documentation.technical', 'workflow', 'forge', 'git'].map(
        (key) => [key, 'en'],
      ),
    ),
    completionCondition: 'All required phases and gates pass.',
    deliveryRestrictions: ['Do not merge.'],
    sourceAssociation: 'approved-feature-plan',
    allowedRoots: [...new Set([root, executionRoot])],
  };
  const call = async (operation, payload) =>
    (await executeOperation(operation, payload, deps)).result;
  return { root, executionRoot, targetExecutionRoot, repositoryIdentity, deps, input, ref, call };
}
async function start(fx) {
  const created = await fx.call('create', fx.input);
  const common = {
    runtimeStateRoot: fx.root,
    repositoryIdentity: fx.repositoryIdentity,
    runId: fx.input.runId,
    requestDigest: created.requestDigest,
  };
  await fx.call('bind-agent', { ...common, agentHandle: 'original-child-handle' });
  return { ...fx, common, created };
}
async function pause(fx, extra = {}) {
  const checkpoint = await fx.call('checkpoint', {
    ...fx.common,
    checkpointId: 'delivery',
    agentHandle: 'original-child-handle',
    completed: [],
    pending: REQUIRED_GATES,
    evidence: [],
  });
  const question = await fx.call('question', {
    ...fx.common,
    questionId: 'delivery',
    revision: 1,
    origin: 'delivery-choice',
    agentHandle: 'original-child-handle',
    checkpoint,
    question: 'Publish the draft?',
    options: ['Publish draft', 'Retain locally'],
    responseType: 'option',
    ...extra,
  });
  return { checkpoint, question };
}
function error(code) {
  return (failure) => failure.code === code;
}
function trusted(question, answer = 'Retain locally') {
  return {
    channel: 'current-user',
    messageId: 'message-1',
    questionDigest: question.digest,
    answer,
  };
}
function gitRef(fx, relative, head = git(fx.executionRoot, 'rev-parse', 'HEAD')) {
  const bytes = spawnSync('git', ['-C', fx.root, 'show', `${head}:${relative}`], { env }).stdout;
  return {
    repositoryIdentity: fx.repositoryIdentity,
    commit: head,
    blob: git(fx.root, 'rev-parse', `${head}:${relative}`),
    path: relative,
    digest: contentDigest(bytes),
  };
}

test('control and dispatch limits count exact UTF-8 bytes including multibyte text and newline', () => {
  for (const maximum of [MAX_CONTROL_BYTES, MAX_DISPATCH_BYTES]) {
    const overhead = Buffer.byteLength(`${JSON.stringify({ text: '' })}\n`);
    const available = maximum - overhead;
    const value = { text: '€'.repeat(Math.floor(available / 3)) + 'a'.repeat(available % 3) };
    assert.equal(encodeControl(value, maximum).length, maximum);
    assert.throws(() => encodeControl({ text: value.text + 'a' }, maximum), error('TOO_LARGE'));
  }
});

test('create preserves a long original instruction/restrictions outside bounded request and dispatch', async (t) => {
  const fx = fixture(t);
  fx.input.source.instruction = 'Größe € '.repeat(5000);
  const created = await fx.call('create', fx.input);
  assert.ok(encodeControl(created.dispatch, MAX_DISPATCH_BYTES).length <= MAX_DISPATCH_BYTES);
  const request = JSON.parse(readFileSync(path.join(created.request.root, created.request.path)));
  assert.ok(
    readFileSync(path.join(request.source.root, request.source.path)).length > MAX_CONTROL_BYTES,
  );
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(request.source.root, request.source.path))),
    fx.input.source,
  );
  assert.equal(created.requestDigest, created.request.digest);
  const common = {
    runtimeStateRoot: fx.root,
    repositoryIdentity: fx.repositoryIdentity,
    runId: fx.input.runId,
    requestDigest: created.requestDigest,
  };
  await fx.call('validate', common);
  await assert.rejects(fx.call('create', fx.input), error('COLLISION'));
  assert.deepEqual(
    readdirSync(path.join(fx.root, '.effective-flow', 'build-runs', fx.input.runId)).sort(),
    ['configuration-basis.txt', 'request.json', 'source.json'],
  );
});

test('closed schemas reject missing fields, unknown controls, invalid language and oversized dispatch before reserving run', async (t) => {
  for (const mutate of [
    (input) => {
      delete input.deliveryRestrictions;
    },
    (input) => {
      input.fastCapability = 'never-persist';
    },
    (input) => {
      input.languages.workflow = 'fr';
    },
    (input) => {
      input.completionCondition = '€'.repeat(3000);
    },
  ]) {
    const fx = fixture(t);
    mutate(fx.input);
    await assert.rejects(fx.call('create', fx.input), (failure) =>
      ['INVALID_PAYLOAD', 'TOO_LARGE'].includes(failure.code),
    );
    assert.equal(readdirSync(path.join(fx.root, '.effective-flow')).includes('build-runs'), false);
  }
});

test('root receipts, migration, tracked runtime and ignore guards are required before writes', async (t) => {
  const fx = fixture(t);
  writeFileSync(path.join(fx.root, '.effective-flow', 'memory.json'), '{}');
  await assert.rejects(fx.call('create', fx.input), error('MIGRATION_REQUIRED'));
  writeFileSync(
    path.join(fx.root, '.effective-flow', 'memory.json'),
    JSON.stringify({ runtimeMigration: { directory: { version: 1 } } }),
  );
  fx.input.execution.branch = 'foreign';
  await assert.rejects(fx.call('create', fx.input), error('REPOSITORY_MISMATCH'));
  fx.input.execution.branch = 'develop';
  git(fx.root, 'add', '-f', '.effective-flow/memory.json');
  await assert.rejects(fx.call('create', fx.input), error('UNSAFE_RUNTIME_ROOT'));
});

test('symlink plan, namespace, control and owning-root escapes are refused', async (t) => {
  const fx = fixture(t);
  symlinkSync('source.txt', path.join(fx.root, 'link.md'));
  fx.input.plan = { root: fx.root, path: 'link.md', digest: contentDigest('initial\n') };
  await assert.rejects(fx.call('create', fx.input), error('UNSAFE_PATH'));
  fx.input.plan = fx.ref(fx.root, 'plan.md');
  const outside = path.join(fx.root, '.effective-flow', 'outside');
  mkdirSync(outside);
  symlinkSync(outside, path.join(fx.root, '.effective-flow', 'build-runs'));
  await assert.rejects(fx.call('create', fx.input), error('UNSAFE_PATH'));
  rmSync(path.join(fx.root, '.effective-flow', 'build-runs'));
  const live = await start(fx);
  const requestPath = path.join(live.created.request.root, live.created.request.path);
  const saved = readFileSync(requestPath);
  rmSync(requestPath);
  writeFileSync(path.join(outside, 'request.json'), saved);
  symlinkSync(path.join(outside, 'request.json'), requestPath);
  await assert.rejects(live.call('validate', live.common), error('UNSAFE_PATH'));
});

test('changed source bytes and changed plan digest reject validation', async (t) => {
  const live = await start(fixture(t));
  const source = path.join(
    live.root,
    '.effective-flow',
    'build-runs',
    live.input.runId,
    'source.json',
  );
  const original = readFileSync(source);
  writeFileSync(source, '{}');
  await assert.rejects(live.call('validate', live.common), error('DIGEST_MISMATCH'));
  writeFileSync(source, original);
  writeFileSync(path.join(live.executionRoot, 'plan.md'), 'changed');
  await assert.rejects(live.call('validate', live.common), error('DIGEST_MISMATCH'));
});

test('a trusted reply resumes the original child exactly once and carries completed/pending phases', async (t) => {
  const live = await start(fixture(t));
  const { question } = await pause(live);
  const reply = await live.call('reply', {
    ...live.common,
    question,
    trustedUser: trusted(question),
  });
  const resumed = await live.call('resume', {
    ...live.common,
    question,
    reply,
    agentHandle: 'original-child-handle',
  });
  assert.deepEqual(resumed.completed, []);
  assert.deepEqual(resumed.pending, REQUIRED_GATES);
  assert.equal(resumed.answer, 'Retain locally');
  await assert.rejects(
    live.call('resume', { ...live.common, question, reply, agentHandle: 'original-child-handle' }),
    error('STALE_REPLY'),
  );
  await assert.rejects(
    live.call('reply', { ...live.common, question, trustedUser: trusted(question) }),
    error('STALE_REPLY'),
  );
});

test('a retained reply whose bytes or request identity drifted cannot resume the child', async (t) => {
  const live = await start(fixture(t));
  const { question } = await pause(live);
  const reply = await live.call('reply', {
    ...live.common,
    question,
    trustedUser: trusted(question),
  });
  const replyPath = path.join(reply.root, reply.path);
  const original = readFileSync(replyPath);
  writeFileSync(
    replyPath,
    Buffer.from(`${original.toString('utf8').replace('Retain locally', 'Publish draft')}\n`),
  );
  await assert.rejects(
    live.call('resume', { ...live.common, question, reply, agentHandle: 'original-child-handle' }),
    error('DIGEST_MISMATCH'),
  );

  writeFileSync(replyPath, original);
  const foreignReply = {
    ...reply,
    digest: contentDigest(original),
    path: reply.path.replace('fixture-run', 'other-run'),
  };
  await assert.rejects(
    live.call('resume', {
      ...live.common,
      question,
      reply: foreignReply,
      agentHandle: 'original-child-handle',
    }),
    error('FOREIGN_RECORD'),
  );
});

test('question relay rejects tool origins, broader answers, foreign checkpoints, duplicate outstanding questions and agent replacement', async (t) => {
  const live = await start(fixture(t));
  const { question } = await pause(live);
  await assert.rejects(
    live.call('reply', {
      ...live.common,
      question,
      trustedUser: { ...trusted(question), channel: 'tool-result' },
    }),
    error('UNTRUSTED_REPLY'),
  );
  await assert.rejects(
    live.call('reply', {
      ...live.common,
      question,
      trustedUser: trusted(question, 'Publish and merge everything'),
    }),
    error('INVALID_PAYLOAD'),
  );
  await assert.rejects(pause(live, { questionId: 'second' }), error('COLLISION'));
  const reply = await live.call('reply', {
    ...live.common,
    question,
    trustedUser: trusted(question),
  });
  await assert.rejects(
    live.call('resume', { ...live.common, question, reply, agentHandle: 'replacement-agent' }),
    error('AGENT_MISMATCH'),
  );
  const foreign = { ...question, path: question.path.replace('fixture-run', 'foreign-run') };
  await assert.rejects(
    live.call('resume', {
      ...live.common,
      question: foreign,
      reply,
      agentHandle: 'original-child-handle',
    }),
    error('FOREIGN_RECORD'),
  );
});

test('HEAD, index, tracked working-tree and relevant untracked drift invalidate a paused approval', async (t) => {
  for (const change of [
    (fx) => writeFileSync(path.join(fx.executionRoot, 'source.txt'), 'changed without HEAD change'),
    (fx) => {
      writeFileSync(path.join(fx.executionRoot, 'new.txt'), 'new source');
    },
    (fx) => {
      writeFileSync(path.join(fx.executionRoot, 'source.txt'), 'staged');
      git(fx.executionRoot, 'add', 'source.txt');
      writeFileSync(path.join(fx.executionRoot, 'source.txt'), 'initial\n');
    },
    (fx) => git(fx.executionRoot, 'commit', '--allow-empty', '-m', 'advance'),
  ]) {
    const live = await start(fixture(t));
    const { question } = await pause(live);
    change(live);
    await assert.rejects(
      live.call('reply', { ...live.common, question, trustedUser: trusted(question) }),
      error('CONTENT_DRIFT'),
    );
  }
});

test('free-text design/scope question preserves the exact answer and oversized question fails without truncation', async (t) => {
  const live = await start(fixture(t));
  const { question } = await pause(live, {
    origin: 'design-scope',
    options: [],
    responseType: 'free-text',
    question: 'Which new scope is authorized?',
  });
  const answer = 'Only module A. Keep the existing migration. €';
  const reply = await live.call('reply', {
    ...live.common,
    question,
    trustedUser: trusted(question, answer),
  });
  const result = await live.call('resume', {
    ...live.common,
    question,
    reply,
    agentHandle: 'original-child-handle',
  });
  assert.equal(result.answer, answer);
  const checkpoint = result.checkpoint;
  await assert.rejects(
    live.call('question', {
      ...live.common,
      checkpoint,
      questionId: 'oversized',
      revision: 1,
      origin: 'design-scope',
      agentHandle: 'original-child-handle',
      question: '€'.repeat(6000),
      options: [],
      responseType: 'free-text',
    }),
    error('TOO_LARGE'),
  );
});

test('noninteractive mode never gains question authority through the relay', async (t) => {
  const fx = fixture(t);
  fx.input.runMode = 'non-interactive';
  const live = await start(fx);
  await assert.rejects(pause(live), error('NON_INTERACTIVE'));
});

async function setupDelivery(
  live,
  mode = live.targetExecutionRoot === live.root ? 'in-place-delivery' : 'owned-worktree',
) {
  const branch = mode === 'in-place-no-delivery' ? live.input.execution.branch : 'feature';
  const authorization = await live.call('authorize-execution', {
    ...live.common,
    agentHandle: 'original-child-handle',
    mode,
    executionRoot: live.targetExecutionRoot,
    branch,
    baseHead: live.input.execution.head,
    authority:
      mode === 'in-place-no-delivery'
        ? { kind: 'configuration' }
        : {
            kind: 'source',
            source: 'instruction',
            index: null,
            quote: live.input.source.instruction,
          },
  });
  let ownership = null;
  if (mode === 'owned-worktree') {
    git(live.root, 'worktree', 'add', '-b', branch, live.targetExecutionRoot);
    mkdirSync(path.join(live.root, '.effective-flow', 'worktree-runs'), { recursive: true });
    const value = {
      schemaVersion: 1,
      recordId: 'owned-delivery',
      sessionId: live.input.runId,
      componentId: null,
      workflow: 'build',
      purpose: 'delivery',
      repositoryIdentity: live.repositoryIdentity,
      runtimeStateRoot: live.root,
      worktreePath: live.targetExecutionRoot,
      branch,
      creationOid: live.input.execution.head,
      ownership: 'effective-flow-created',
      receipt: {
        repositoryIdentity: live.repositoryIdentity,
        executionRoot: live.targetExecutionRoot,
        runtimeStateRoot: live.root,
        checkout: { kind: 'branch', branch },
        origin: 'effective-flow-created',
        setupOwner: 'Effective Flow build',
        setupStatus: 'pending',
        workflow: 'build',
        purpose: 'delivery',
      },
      branchPolicy: 'retain',
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
      status: 'active',
      reason: null,
    };
    writeFileSync(
      path.join(live.root, '.effective-flow', 'worktree-runs', 'owned-delivery.json'),
      JSON.stringify(value),
    );
    ownership = live.ref(live.root, '.effective-flow/worktree-runs/owned-delivery.json');
  } else if (mode === 'in-place-delivery') git(live.root, 'switch', '-c', branch);
  const execution = {
    executionRoot: live.targetExecutionRoot,
    branch,
    head: live.input.execution.head,
    origin: mode === 'owned-worktree' ? 'effective-flow-created' : 'in-place',
    owner: 'build',
  };
  const transition = await live.call('transition-execution', {
    ...live.common,
    agentHandle: 'original-child-handle',
    authorization,
    execution,
    ownership,
  });
  return { ...live, executionRoot: execution.executionRoot, execution, transition, mode };
}
function durable(
  live,
  name = 'acceptance.txt',
  contents = 'Existing gates were judged by the workflow.\n',
) {
  const relative = `.effective-flow/build-runs/${live.input.runId}/${name}`;
  writeFileSync(path.join(live.root, relative), contents);
  return live.ref(live.root, relative);
}
async function issue(live, gate, evidence = live.evidence, extra = {}) {
  return live.call('receipt', {
    ...live.common,
    gate,
    outcome: gate === 'pilot-finalization' ? 'not-applicable' : 'passed',
    reason: 'Existing workflow gate passed.',
    evidence,
    agentHandle: 'original-child-handle',
    ...extra,
  });
}
async function completed(fx) {
  let live = await setupDelivery(await start(fx));
  const evidence = [durable(live)];
  const gates = [];
  live = { ...live, evidence, gates };
  // Preserve actual order: implementation through final validation precede completion metadata.
  for (const gate of REQUIRED_GATES.filter(
    (gate) =>
      !['delivery', 'plan-archival', 'pilot-finalization', 'cleanup', 'completion'].includes(gate),
  ))
    gates.push(await issue(live, gate));
  const acceptance = gates.filter((ref) =>
    /gate-(independent-review|final-validation)-/.test(path.basename(ref.path)),
  );
  const prepared = await live.call('prepare-completion', {
    ...live.common,
    agentHandle: 'original-child-handle',
    preparationId: 'delivery',
    gates: acceptance,
  });
  const original = readFileSync(path.join(live.executionRoot, 'plan.md'), 'utf8');
  writeFileSync(
    path.join(live.executionRoot, 'plan.md'),
    original.replace('Not implemented', 'Implemented') +
      '\n## Build completion\n\nImplemented, tested and independently reviewed.\n',
  );
  mkdirSync(path.join(live.executionRoot, 'archive'));
  git(live.executionRoot, 'mv', 'plan.md', 'archive/plan.md');
  git(live.executionRoot, 'add', 'archive/plan.md');
  const seal = await live.call('seal-delivery', {
    ...live.common,
    agentHandle: 'original-child-handle',
    sealId: 'delivery',
    basis: prepared,
    finalPlan: live.ref(live.executionRoot, 'archive/plan.md'),
    expectedTree: git(live.executionRoot, 'write-tree'),
    judgments: [],
  });
  git(live.executionRoot, 'commit', '-m', 'archive plan');
  const finalPlan = gitRef(live, 'archive/plan.md');
  const handoffRef = await live.call('handoff', {
    ...live.common,
    agentHandle: 'original-child-handle',
    seal,
    head: finalPlan.commit,
    finalPlan,
  });
  const handoff = JSON.parse(readFileSync(path.join(handoffRef.root, handoffRef.path)));
  gates.push(await issue(live, 'plan-archival'));
  if (live.executionRoot === live.root)
    for (const gate of ['delivery', 'cleanup', 'pilot-finalization', 'completion'])
      gates.push(await issue(live, gate));
  return {
    ...live,
    finalPlan: handoff.finalPlan,
    handoffRef,
    handoff,
    prepared,
    seal,
    finalValidation: acceptance.find((ref) =>
      path.basename(ref.path).startsWith('gate-final-validation-'),
    ),
    finalCheckout: {
      repositoryIdentity: live.repositoryIdentity,
      executionRoot: live.executionRoot,
      branch: live.execution.branch,
      head: handoff.head,
      snapshot: handoff.snapshot,
      worktreeRemoved: false,
    },
  };
}
function terminalInput(live, extra = {}) {
  return {
    ...live.common,
    status: 'DONE',
    finalPlan: live.finalPlan,
    finalCheckout: live.finalCheckout,
    gates: live.gates,
    retainedWorktree: null,
    pilotStatus: 'not-applicable',
    conclusion: 'Feature delivered with required evidence.',
    nextWorkflow: 'Review the delivery.',
    ...extra,
  };
}

test('terminal and continuation remain verifiable after source archival, temporary evidence cleanup and execution-worktree removal', async (t) => {
  const live = await completed(fixture(t, true));
  git(live.root, 'worktree', 'remove', live.executionRoot);
  live.finalCheckout.worktreeRemoved = true;
  rmSync(path.join(live.root, '.effective-flow', 'worktree-runs', 'owned-delivery.json'));
  for (const gate of ['delivery', 'cleanup', 'pilot-finalization', 'completion'])
    live.gates.push(await issue(live, gate));
  const terminal = await live.call('terminal', terminalInput(live));
  const accepted = await live.call('verify-terminal', { ...live.common, terminal });
  assert.equal(accepted.status, 'DONE');
  const continuation = await live.call('continuation', { ...live.common, terminal });
  const result = await live.call('verify-continuation', { ...live.common, continuation });
  assert.equal(result.head, live.finalPlan.commit);
  assert.deepEqual(result.restrictions, live.input.deliveryRestrictions);
  await assert.rejects(
    live.call('bind-agent', { ...live.common, agentHandle: 'another' }),
    error('TERMINAL_RUN'),
  );
});

test('terminal refuses missing gates/evidence, foreign Git identity, stale gate basis, dirty retention and unproven pilot', async (t) => {
  const live = await completed(fixture(t));
  await assert.rejects(
    live.call('terminal', terminalInput(live, { gates: live.gates.slice(1) })),
    error('INCOMPLETE_GATES'),
  );
  await assert.rejects(
    live.call(
      'terminal',
      terminalInput(live, { finalPlan: { ...live.finalPlan, repositoryIdentity: '/tmp' } }),
    ),
    error('REPOSITORY_MISMATCH'),
  );
  await assert.rejects(
    live.call(
      'terminal',
      terminalInput(live, {
        finalCheckout: {
          ...live.finalCheckout,
          snapshot: { ...live.finalCheckout.snapshot, untracked: contentDigest('foreign') },
        },
      }),
    ),
    error('CONTENT_DRIFT'),
  );
  await assert.rejects(
    live.call(
      'terminal',
      terminalInput(live, {
        retainedWorktree: { root: live.executionRoot, dirty: true, reason: 'Unfinished' },
      }),
    ),
    error('INCOMPLETE_GATES'),
  );
  await assert.rejects(
    live.call('terminal', terminalInput(live, { pilotStatus: 'pending-unproven' })),
    error('INCOMPLETE_GATES'),
  );
  rmSync(path.join(live.evidence[0].root, live.evidence[0].path));
  await assert.rejects(
    live.call('terminal', terminalInput(live)),
    (failure) => failure.code === 'ENOENT' || failure.code === 'MISSING_EVIDENCE',
  );
});

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

async function preparedForTransform(t) {
  const live = await setupDelivery(await start(fixture(t)));
  const evidence = [durable(live)];
  const gates = [];
  for (const gate of ['independent-review', 'final-validation'])
    gates.push(await issue(live, gate, evidence));
  const prepared = await live.call('prepare-completion', {
    ...live.common,
    preparationId: 'transform',
    agentHandle: 'original-child-handle',
    gates,
  });
  const original = readFileSync(path.join(live.executionRoot, 'plan.md'), 'utf8');
  mkdirSync(path.join(live.executionRoot, 'archive'));
  writeFileSync(
    path.join(live.executionRoot, 'archive/plan.md'),
    original.replace('Not implemented', 'Implemented') + '\n## Build completion\n\nComplete.\n',
  );
  rmSync(path.join(live.executionRoot, 'plan.md'));
  return { ...live, prepared, evidence };
}
function sealing(live, judgments = []) {
  git(live.executionRoot, 'add', '-A');
  return {
    ...live.common,
    agentHandle: 'original-child-handle',
    sealId: 'transform',
    basis: live.prepared,
    finalPlan: live.ref(live.executionRoot, 'archive/plan.md'),
    expectedTree: git(live.executionRoot, 'write-tree'),
    judgments,
  };
}

test('unproved product changes and original-plan rewrites invalidate gates rather than receiving a blanket completion exception', async (t) => {
  const live = await preparedForTransform(t);
  writeFileSync(path.join(live.executionRoot, 'source.txt'), 'changed implementation');
  await assert.rejects(live.call('seal-delivery', sealing(live)), error('RECHECK_REQUIRED'));
  writeFileSync(path.join(live.executionRoot, 'source.txt'), 'initial\n');
  writeFileSync(
    path.join(live.executionRoot, 'archive/plan.md'),
    '# Rewritten requirements\n\n**Plan status:** Implemented\n',
  );
  await assert.rejects(live.call('seal-delivery', sealing(live)), error('RECHECK_REQUIRED'));
});

test('targeted formatting proof is independent and bound to every exact before/after path digest', async (t) => {
  const live = await preparedForTransform(t);
  const before = contentDigest(readFileSync(path.join(live.executionRoot, 'source.txt')));
  writeFileSync(path.join(live.executionRoot, 'source.txt'), 'initial  \n');
  const after = contentDigest(readFileSync(path.join(live.executionRoot, 'source.txt')));
  const judgment = {
    protocol: 1,
    runId: live.input.runId,
    requestDigest: live.common.requestDigest,
    role: 'code-validator',
    agentHandle: 'independent-validator',
    outcome: 'formatting-only',
    changes: [{ path: 'source.txt', before, after }],
  };
  const bad = durable(
    live,
    'bad-format.json',
    JSON.stringify({
      ...judgment,
      changes: [{ path: 'source.txt', before, after: contentDigest('different bytes') }],
    }),
  );
  await assert.rejects(live.call('seal-delivery', sealing(live, [bad])), error('RECHECK_REQUIRED'));
  const self = durable(
    live,
    'self-format.json',
    JSON.stringify({ ...judgment, agentHandle: 'original-child-handle' }),
  );
  await assert.rejects(
    live.call('seal-delivery', sealing(live, [self])),
    error('RECHECK_REQUIRED'),
  );
  const good = durable(live, 'format.json', JSON.stringify(judgment));
  await live.call('seal-delivery', sealing(live, [good]));
});

test('post-cleanup publication question resumes once with runtime-only authority and detects a moved delivery head', async (t) => {
  const live = await completed(fixture(t, true));
  git(live.root, 'worktree', 'remove', live.executionRoot);
  rmSync(path.join(live.root, '.effective-flow/worktree-runs/owned-delivery.json'));
  const completedGates = live.gates.map(
    (ref) => JSON.parse(readFileSync(path.join(ref.root, ref.path))).gate,
  );
  const cp = await live.call('checkpoint', {
    ...live.common,
    checkpointId: 'post-handoff',
    agentHandle: 'original-child-handle',
    completed: completedGates,
    pending: REQUIRED_GATES.filter((gate) => !completedGates.includes(gate)),
    evidence: live.gates,
  });
  const question = await live.call('question', {
    ...live.common,
    questionId: 'publish-review',
    revision: 1,
    origin: 'pr-review-publication',
    agentHandle: 'original-child-handle',
    checkpoint: cp,
    question: 'Publish the admitted review?',
    options: ['Publish', 'Do not publish'],
    responseType: 'option',
  });
  const reply = await live.call('reply', {
    ...live.common,
    question,
    trustedUser: trusted(question, 'Do not publish'),
  });
  const resumed = await live.call('resume', {
    ...live.common,
    question,
    reply,
    agentHandle: 'original-child-handle',
  });
  assert.equal(resumed.authority, 'runtime-only');
  await assert.rejects(
    live.call('resume', { ...live.common, question, reply, agentHandle: 'original-child-handle' }),
    error('STALE_REPLY'),
  );
  await assert.rejects(
    live.call('prepare-completion', {
      ...live.common,
      agentHandle: 'original-child-handle',
      preparationId: 'forbidden',
      gates: [],
    }),
    error('PRODUCT_AUTHORITY_ENDED'),
  );
  const cp2 = await live.call('checkpoint', {
    ...live.common,
    checkpointId: 'post-handoff-second',
    agentHandle: 'original-child-handle',
    completed: completedGates,
    pending: REQUIRED_GATES.filter((gate) => !completedGates.includes(gate)),
    evidence: live.gates,
  });
  const q2 = await live.call('question', {
    ...live.common,
    questionId: 'publish-review-second',
    revision: 1,
    origin: 'completion-recovery',
    agentHandle: 'original-child-handle',
    checkpoint: cp2,
    question: 'Continue the completion action?',
    options: ['Continue', 'Stop'],
    responseType: 'option',
  });
  const advanced = git(
    live.root,
    'commit-tree',
    git(live.root, 'rev-parse', `${live.finalCheckout.head}^{tree}`),
    '-p',
    live.finalCheckout.head,
    '-m',
    'unexpected branch change',
  );
  git(live.root, 'update-ref', `refs/heads/${live.execution.branch}`, advanced);
  await assert.rejects(
    live.call('reply', {
      ...live.common,
      question: q2,
      trustedUser: { ...trusted(q2, 'Continue'), messageId: 'message-2' },
    }),
    error('CONTENT_DRIFT'),
  );
});

test('actual post-cleanup pilot finalization is recorded once by the original agent without persisting capabilities', async (t) => {
  const live = await completed(fixture(t, true));
  git(live.root, 'worktree', 'remove', live.executionRoot);
  rmSync(path.join(live.root, '.effective-flow/worktree-runs/owned-delivery.json'));
  let actualFinalizations = 0;
  actualFinalizations += 1;
  const evidence = [
    durable(live, 'pilot-outcome.txt', `Finalization calls observed: ${actualFinalizations}\n`),
  ];
  await assert.rejects(
    live.call('receipt', {
      ...live.common,
      gate: 'pilot-finalization',
      outcome: 'passed',
      reason: 'Actual owning pilot finalized.',
      evidence,
      agentHandle: 'replacement',
    }),
    error('AGENT_MISMATCH'),
  );
  const first = await issue(live, 'pilot-finalization', evidence, { outcome: 'passed' });
  await assert.rejects(
    issue(live, 'pilot-finalization', evidence, { outcome: 'passed' }),
    error('COLLISION'),
  );
  assert.equal(actualFinalizations, 1);
  assert.equal(JSON.parse(readFileSync(path.join(first.root, first.path))).outcome, 'passed');
  await assert.rejects(
    live.call('receipt', {
      ...live.common,
      gate: 'pilot-finalization',
      outcome: 'passed',
      reason: 'Forbidden secret field.',
      evidence,
      agentHandle: 'original-child-handle',
      capability: 'never-retain',
    }),
    error('INVALID_PAYLOAD'),
  );
});

test('hidden committed delivery keeps the private archived plan outside Git and verifies it after worktree cleanup', async (t) => {
  const fx = fixture(t, true);
  writeFileSync(
    path.join(fx.root, '.effective-flow/project-setup.md'),
    '# Setup\n\n## Configuration\n\n| Key | Value |\n| --- | --- |\n| visibility | hidden |\n',
  );
  mkdirSync(path.join(fx.root, '.effective-flow/plan'));
  writeFileSync(
    path.join(fx.root, '.effective-flow/plan/private.md'),
    '# Private Feature plan\n\n**Plan status:** Not implemented\n',
  );
  fx.input.plan = fx.ref(fx.root, '.effective-flow/plan/private.md');
  let live = await setupDelivery(await start(fx));
  writeFileSync(path.join(live.executionRoot, 'source.txt'), 'implemented privately\n');
  const evidence = [durable(live)];
  const gates = [];
  live = { ...live, evidence, gates };
  for (const gate of REQUIRED_GATES.filter(
    (gate) =>
      !['delivery', 'plan-archival', 'pilot-finalization', 'cleanup', 'completion'].includes(gate),
  ))
    gates.push(await issue(live, gate));
  const prepared = await live.call('prepare-completion', {
    ...live.common,
    agentHandle: 'original-child-handle',
    preparationId: 'private',
    gates: gates.filter((ref) =>
      /gate-(independent-review|final-validation)-/.test(path.basename(ref.path)),
    ),
  });
  const privatePath = '.effective-flow/plan/private.md';
  const archive = '.effective-flow/plan/archive/private.md';
  writeFileSync(
    path.join(live.root, privatePath),
    readFileSync(path.join(live.root, privatePath), 'utf8').replace(
      'Not implemented',
      'Implemented',
    ) + '\n## Build completion\n\nPrivate completion.\n',
  );
  mkdirSync(path.dirname(path.join(live.root, archive)));
  renameSync(path.join(live.root, privatePath), path.join(live.root, archive));
  git(live.executionRoot, 'add', 'source.txt');
  const seal = await live.call('seal-delivery', {
    ...live.common,
    agentHandle: 'original-child-handle',
    sealId: 'private',
    basis: prepared,
    finalPlan: live.ref(live.root, archive),
    expectedTree: git(live.executionRoot, 'write-tree'),
    judgments: [],
  });
  git(live.executionRoot, 'commit', '-m', 'private implementation');
  const head = git(live.executionRoot, 'rev-parse', 'HEAD');
  const handoffRef = await live.call('handoff', {
    ...live.common,
    agentHandle: 'original-child-handle',
    seal,
    head,
    finalPlan: live.ref(live.root, archive),
  });
  const handoff = JSON.parse(readFileSync(path.join(handoffRef.root, handoffRef.path)));
  assert.equal(
    git(live.root, 'ls-tree', '-r', '--name-only', head).includes('.effective-flow/'),
    false,
  );
  git(live.root, 'worktree', 'remove', live.executionRoot);
  rmSync(path.join(live.root, '.effective-flow/worktree-runs/owned-delivery.json'));
  for (const gate of ['plan-archival', 'delivery', 'cleanup', 'pilot-finalization', 'completion'])
    gates.push(await issue(live, gate));
  const terminal = await live.call(
    'terminal',
    terminalInput({
      ...live,
      finalPlan: handoff.finalPlan,
      finalCheckout: {
        repositoryIdentity: live.repositoryIdentity,
        executionRoot: live.executionRoot,
        branch: live.execution.branch,
        head,
        snapshot: handoff.snapshot,
        worktreeRemoved: true,
      },
    }),
  );
  assert.equal((await live.call('verify-terminal', { ...live.common, terminal })).status, 'DONE');
});

test('configuration-authorized in-place output may remain uncommitted only when its exact dirty state is visible', async (t) => {
  const fx = fixture(t);
  writeFileSync(
    path.join(fx.root, '.effective-flow/config.json'),
    JSON.stringify({ worktree: { enabled: false } }),
  );
  let live = await setupDelivery(await start(fx), 'in-place-no-delivery');
  writeFileSync(path.join(live.root, 'source.txt'), 'uncommitted implementation\n');
  const evidence = [durable(live)];
  const gates = [];
  live = { ...live, evidence, gates };
  for (const gate of REQUIRED_GATES.filter(
    (gate) =>
      !['delivery', 'plan-archival', 'pilot-finalization', 'cleanup', 'completion'].includes(gate),
  ))
    gates.push(await issue(live, gate));
  const prepared = await live.call('prepare-completion', {
    ...live.common,
    agentHandle: 'original-child-handle',
    preparationId: 'inplace',
    gates: gates.filter((ref) =>
      /gate-(independent-review|final-validation)-/.test(path.basename(ref.path)),
    ),
  });
  const plan = readFileSync(path.join(live.root, 'plan.md'), 'utf8');
  mkdirSync(path.join(live.root, 'archive'));
  writeFileSync(
    path.join(live.root, 'archive/plan.md'),
    plan.replace('Not implemented', 'Implemented') +
      '\n## Build completion\n\nAuthorized uncommitted output.\n',
  );
  rmSync(path.join(live.root, 'plan.md'));
  const seal = await live.call('seal-delivery', {
    ...live.common,
    agentHandle: 'original-child-handle',
    sealId: 'inplace',
    basis: prepared,
    finalPlan: live.ref(live.root, 'archive/plan.md'),
    expectedTree: null,
    judgments: [],
  });
  const head = git(live.root, 'rev-parse', 'HEAD');
  assert.equal(head, live.input.execution.head);
  const handoffRef = await live.call('handoff', {
    ...live.common,
    agentHandle: 'original-child-handle',
    seal,
    head,
    finalPlan: live.ref(live.root, 'archive/plan.md'),
  });
  const handoff = JSON.parse(readFileSync(path.join(handoffRef.root, handoffRef.path)));
  for (const gate of ['plan-archival', 'delivery', 'cleanup', 'pilot-finalization', 'completion'])
    gates.push(
      await issue(live, gate, evidence, gate === 'delivery' ? { outcome: 'not-applicable' } : {}),
    );
  const final = {
    ...live,
    finalPlan: handoff.finalPlan,
    finalCheckout: {
      repositoryIdentity: live.repositoryIdentity,
      executionRoot: live.root,
      branch: live.execution.branch,
      head,
      snapshot: handoff.snapshot,
      worktreeRemoved: false,
    },
  };
  await assert.rejects(live.call('terminal', terminalInput(final)), error('INCOMPLETE_GATES'));
  const terminal = await live.call(
    'terminal',
    terminalInput(final, {
      retainedWorktree: {
        root: live.root,
        dirty: true,
        reason: 'Configuration-authorized in-place output remains uncommitted.',
      },
    }),
  );
  assert.equal(
    (await live.call('verify-terminal', { ...live.common, terminal })).retainedWorktree.dirty,
    true,
  );
  assert.equal(git(live.root, 'rev-parse', 'HEAD'), live.input.execution.head);
});

test('genuine completion code changes require fresh affected review/validation receipts rather than formatting claims', async (t) => {
  const live = await preparedForTransform(t);
  writeFileSync(path.join(live.executionRoot, 'source.txt'), 'corrected implementation\n');
  const currentPlan = live.ref(live.executionRoot, 'archive/plan.md');
  const renewed = [];
  for (const gate of ['independent-review', 'final-validation'])
    renewed.push(
      await issue(live, gate, live.evidence, { completionBasis: live.prepared, currentPlan }),
    );
  const seal = await live.call('seal-delivery', { ...sealing(live), renewedGates: renewed });
  const value = JSON.parse(readFileSync(path.join(seal.root, seal.path)));
  assert.deepEqual(value.acceptedGates, renewed);
});

test('existing in-place handback may restore its verified original checkout without reopening product authority', async (t) => {
  const live = await completed(fixture(t));
  const delivery = live.gates.find((ref) => path.basename(ref.path).startsWith('gate-delivery-'));
  git(live.root, 'switch', 'develop');
  await assert.rejects(
    live.call('checkpoint', {
      ...live.common,
      checkpointId: 'unproved-return',
      agentHandle: 'original-child-handle',
      completed: [],
      pending: REQUIRED_GATES,
      evidence: [],
    }),
    error('REPOSITORY_MISMATCH'),
  );
  const returned = await live.call('record-return', {
    ...live.common,
    agentHandle: 'original-child-handle',
    delivery,
  });
  const actual = JSON.parse(readFileSync(path.join(returned.root, returned.path)));
  assert.equal(actual.execution.branch, 'develop');
  assert.equal(actual.snapshot.head, live.input.execution.head);
  const terminal = await live.call('terminal', terminalInput(live));
  const accepted = await live.call('verify-terminal', { ...live.common, terminal });
  assert.deepEqual(accepted.checkoutReturn, returned);
  assert.equal(accepted.finalCheckout.head, live.finalPlan.commit);
});

test('owned user pauses require released lifecycle locks and valid runtime ignore state', async (t) => {
  const live = await setupDelivery(await start(fixture(t, true)));
  const lock = path.join(live.root, '.effective-flow/worktree-runs/owned-delivery.lock');
  mkdirSync(lock);
  await assert.rejects(
    live.call('checkpoint', {
      ...live.common,
      checkpointId: 'locked-pause',
      agentHandle: 'original-child-handle',
      completed: [],
      pending: REQUIRED_GATES,
      evidence: [],
    }),
    error('LOCKED'),
  );
  rmSync(lock, { recursive: true });
  const ignore =
    '.effective-flow/*\n!.effective-flow/build-runs/\n.effective-flow/build-runs/*\n!.effective-flow/build-runs/fixture-run/\n.effective-flow/build-runs/fixture-run/*\n!.effective-flow/build-runs/fixture-run/checkpoint-unignored.json\n';
  writeFileSync(path.join(live.root, '.gitignore'), ignore);
  await assert.rejects(
    live.call('checkpoint', {
      ...live.common,
      checkpointId: 'unignored',
      agentHandle: 'original-child-handle',
      completed: [],
      pending: REQUIRED_GATES,
      evidence: [],
    }),
    (failure) => ['REPOSITORY_MISMATCH', 'CONTENT_DRIFT'].includes(failure.code),
  );
});

async function publishedPlanFixture(t, adoption = false) {
  const fx = fixture(t);
  const publication = path.join(fx.root, '.effective-flow/publication');
  git(fx.root, 'worktree', 'add', '-b', 'published-plan', publication);
  const plan = '# Published Feature plan\n\n**Plan status:** Not implemented\n';
  writeFileSync(path.join(publication, 'published-plan.md'), plan);
  git(publication, 'add', 'published-plan.md');
  git(publication, 'commit', '-m', 'publish plan');
  const fetchedHead = git(publication, 'rev-parse', 'HEAD');
  git(fx.root, 'update-ref', 'refs/remotes/origin/published-plan', fetchedHead);
  git(fx.root, 'worktree', 'remove', publication);
  const harness = path.join(fx.root, '.effective-flow/harness-source');
  git(fx.root, 'worktree', 'add', '--detach', harness);
  writeFileSync(path.join(harness, 'published-plan.md'), plan);
  fx.input.execution = {
    ...fx.input.execution,
    executionRoot: harness,
    branch: null,
    origin: 'harness-managed',
  };
  fx.input.plan = fx.ref(harness, 'published-plan.md');
  fx.input.allowedRoots.push(harness);
  const live = await start(fx);
  const normalized = await executeTrackerOperation(
    'pr-list',
    {
      repository: { host: 'github.com', owner: 'example', repository: 'flow', provider: 'github' },
      planPath: 'published-plan.md',
    },
    {
      skipProbe: true,
      runner: async (command) => {
        assert.equal(command.executable, 'gh');
        return {
          status: 0,
          stderr: '',
          stdout: JSON.stringify([
            {
              number: 7,
              title: 'docs: published plan',
              body: '<!-- effective-flow-plan-pr:v1 {"plan":"published-plan.md"} -->',
              state: 'open',
              draft: true,
              html_url: 'https://github.com/example/flow/pull/7',
              labels: [],
              head: { ref: 'published-plan', repo: { full_name: 'example/flow' } },
              base: { ref: 'develop', repo: { full_name: 'example/flow' } },
              created_at: '2026-10-19T10:00:00Z',
              updated_at: '2026-10-20T10:00:00Z',
              merged_at: null,
              closed_at: null,
            },
          ]),
        };
      },
    },
  );
  assert.equal(normalized.ok, true, JSON.stringify(normalized));
  assert.equal(normalized.data.result[0].createdAt, '2026-10-19T10:00:00.000Z');
  assert.equal(normalized.data.result[0].updatedAt, '2026-10-20T10:00:00.000Z');
  assert.equal(Object.hasOwn(normalized.data.result[0], 'body'), false);
  const discovery = durable(live, 'owner-pr-list.json', JSON.stringify(normalized));
  const target = path.join(fx.root, '.effective-flow/plan-delivery');
  let head = fetchedHead;
  let ownership = null;
  if (adoption) {
    git(fx.root, 'worktree', 'add', target, 'published-plan');
    writeFileSync(path.join(target, 'source.txt'), 'retained prior implementation\n');
    git(target, 'add', 'source.txt');
    git(target, 'commit', '-m', 'retained implementation');
    head = git(target, 'rev-parse', 'HEAD');
    ownership = lifecycleFixture(
      live,
      target,
      'published-plan',
      fetchedHead,
      'previous-run',
      'failed',
    );
  }
  return {
    ...live,
    harness,
    target,
    head,
    fetchedHead,
    planContinuation: {
      discovery,
      number: 7,
      resolvedBaseRef: 'refs/heads/develop',
      resolvedLocalBaseBranch: 'develop',
      fetchedHead,
      provisioning: adoption ? 'adopt' : 'dedicated',
      ownership,
    },
  };
}
function lifecycleFixture(
  live,
  target,
  branch,
  creationOid,
  sessionId = live.input.runId,
  status = 'active',
) {
  const relative = '.effective-flow/worktree-runs/plan-delivery.json';
  mkdirSync(path.dirname(path.join(live.root, relative)), { recursive: true });
  const value = {
    schemaVersion: 1,
    recordId: 'plan-delivery',
    sessionId,
    componentId: null,
    workflow: 'build',
    purpose: 'delivery',
    repositoryIdentity: live.repositoryIdentity,
    runtimeStateRoot: live.root,
    worktreePath: target,
    branch,
    creationOid,
    ownership: 'effective-flow-created',
    receipt: {
      repositoryIdentity: live.repositoryIdentity,
      executionRoot: target,
      runtimeStateRoot: live.root,
      checkout: { kind: 'branch', branch },
      origin: 'effective-flow-created',
      setupOwner: 'Effective Flow build',
      setupStatus: 'complete',
      workflow: 'build',
      purpose: 'delivery',
    },
    branchPolicy: 'retain',
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
    status,
    reason: status === 'active' ? null : 'Previous run failed.',
  };
  writeFileSync(path.join(live.root, relative), JSON.stringify(value));
  return live.ref(live.root, relative);
}
async function authorizePlan(live, proof = live.planContinuation) {
  return live.call('authorize-execution', {
    ...live.common,
    agentHandle: 'original-child-handle',
    mode: 'owned-worktree',
    executionRoot: live.target,
    branch: 'published-plan',
    baseHead: live.head,
    authority: { kind: 'configuration' },
    planContinuation: proof,
  });
}

test('the existing normalized plan-PR owner can provision a sibling from a harness checkout on an existing clean plan branch', async (t) => {
  const live = await publishedPlanFixture(t);
  const authorization = await authorizePlan(live);
  git(live.root, 'worktree', 'add', live.target, 'published-plan');
  const ownership = lifecycleFixture(live, live.target, 'published-plan', live.fetchedHead);
  const execution = {
    executionRoot: live.target,
    branch: 'published-plan',
    head: live.head,
    origin: 'effective-flow-created',
    owner: 'build',
  };
  await live.call('transition-execution', {
    ...live.common,
    agentHandle: 'original-child-handle',
    authorization,
    execution,
    ownership,
  });
  const cp = await live.call('checkpoint', {
    ...live.common,
    agentHandle: 'original-child-handle',
    checkpointId: 'continued-plan',
    completed: [],
    pending: REQUIRED_GATES,
    evidence: [],
  });
  const value = JSON.parse(readFileSync(path.join(cp.root, cp.path)));
  assert.equal(value.execution.executionRoot, live.target);
  assert.equal(value.snapshot.head, live.fetchedHead);
  assert.equal(git(live.harness, 'branch', '--show-current'), '');
});

test('only the existing owner failed-run adoption may rebind a pre-existing owned plan worktree', async (t) => {
  const live = await publishedPlanFixture(t, true);
  const authorization = await authorizePlan(live);
  const ownerFile = path.join(
    live.planContinuation.ownership.root,
    live.planContinuation.ownership.path,
  );
  const before = JSON.parse(readFileSync(ownerFile));
  writeFileSync(
    ownerFile,
    JSON.stringify({
      ...before,
      sessionId: live.input.runId,
      status: 'active',
      reason: null,
      updatedAt: '2026-10-20T11:00:00Z',
    }),
  );
  const execution = {
    executionRoot: live.target,
    branch: 'published-plan',
    head: live.head,
    origin: 'effective-flow-created',
    owner: 'build',
  };
  await live.call('transition-execution', {
    ...live.common,
    agentHandle: 'original-child-handle',
    authorization,
    execution,
    ownership: live.ref(live.root, live.planContinuation.ownership.path),
  });
  const cp = await live.call('checkpoint', {
    ...live.common,
    agentHandle: 'original-child-handle',
    checkpointId: 'adopted-plan',
    completed: [],
    pending: REQUIRED_GATES,
    evidence: [],
  });
  assert.equal(JSON.parse(readFileSync(path.join(cp.root, cp.path))).snapshot.head, live.head);
  assert.notEqual(live.head, live.fetchedHead);
});

test('plan continuation refuses foreign/ready candidates and independently rejects non-plan fetched changes', async (t) => {
  const live = await publishedPlanFixture(t);
  const envelopePath = path.join(
    live.planContinuation.discovery.root,
    live.planContinuation.discovery.path,
  );
  const good = JSON.parse(readFileSync(envelopePath));
  const ready = durable(
    live,
    'ready-pr-list.json',
    JSON.stringify({ ...good, data: { result: [{ ...good.data.result[0], draft: false }] } }),
  );
  await assert.rejects(
    authorizePlan(live, { ...live.planContinuation, discovery: ready }),
    error('AUTHORITY_MISMATCH'),
  );
  const foreign = durable(
    live,
    'foreign-pr-list.json',
    JSON.stringify({
      ...good,
      data: { result: [{ ...good.data.result[0], sameRepository: false }] },
    }),
  );
  await assert.rejects(
    authorizePlan(live, { ...live.planContinuation, discovery: foreign }),
    error('AUTHORITY_MISMATCH'),
  );
  const publication = path.join(live.root, '.effective-flow/unsafe-publication');
  git(live.root, 'worktree', 'add', publication, 'published-plan');
  writeFileSync(path.join(publication, 'source.txt'), 'not a plan-only change\n');
  git(publication, 'add', 'source.txt');
  git(publication, 'commit', '-m', 'unsafe plan head');
  const unsafeHead = git(publication, 'rev-parse', 'HEAD');
  git(live.root, 'update-ref', 'refs/remotes/origin/published-plan', unsafeHead);
  git(live.root, 'worktree', 'remove', publication);
  await assert.rejects(
    live.call('authorize-execution', {
      ...live.common,
      agentHandle: 'original-child-handle',
      mode: 'owned-worktree',
      executionRoot: live.target,
      branch: 'published-plan',
      baseHead: unsafeHead,
      authority: { kind: 'configuration' },
      planContinuation: { ...live.planContinuation, fetchedHead: unsafeHead },
    }),
    error('AUTHORITY_MISMATCH'),
  );
});

function setupTable(rows) {
  return (
    '# Setup\n\n## Configuration\n\n| Key | Value |\n| --- | --- |\n' +
    rows.map(([key, value]) => `| ${key} | ${value} |\n`).join('')
  );
}
function hiddenSetup(fx) {
  writeFileSync(
    path.join(fx.root, '.effective-flow/project-setup.md'),
    setupTable([['visibility', 'hidden']]),
  );
}
async function acceptQuestion(live, question) {
  const reply = await live.call('reply', {
    ...live.common,
    question,
    trustedUser: trusted(question),
  });
  return live.call('resume', {
    ...live.common,
    question,
    reply,
    agentHandle: 'original-child-handle',
  });
}

test('fresh owning resolution rejects a new hidden priority source at both reply and resume', async (t) => {
  for (const selectedAdr of [false, true]) {
    for (const stage of ['reply', 'resume']) {
      const fx = fixture(t);
      if (selectedAdr) {
        mkdirSync(path.join(fx.root, 'docs/adr'), { recursive: true });
        writeFileSync(
          path.join(fx.root, 'docs/adr/effective-flow-project-setup.md'),
          setupTable([['worktree.enabled', 'true']]),
        );
      }
      const live = await start(fx);
      const { question } = await pause(live);
      const reply =
        stage === 'resume'
          ? await live.call('reply', {
              ...live.common,
              question,
              trustedUser: trusted(question),
            })
          : null;
      hiddenSetup(fx);
      await assert.rejects(
        stage === 'reply'
          ? live.call('reply', {
              ...live.common,
              question,
              trustedUser: trusted(question),
            })
          : live.call('resume', {
              ...live.common,
              question,
              reply,
              agentHandle: 'original-child-handle',
            }),
        error('CONTENT_DRIFT'),
      );
    }
  }
});

test('fresh owning resolution binds selected source and effective values without binding irrelevant source prose', async (t) => {
  for (const change of ['value', 'source']) {
    const fx = fixture(t);
    const file = path.join(fx.root, '.effective-flow/config.json');
    writeFileSync(file, JSON.stringify({ worktree: { enabled: true }, prReview: 'ask' }));
    const live = await start(fx);
    const { question } = await pause(live);
    if (change === 'value')
      writeFileSync(file, JSON.stringify({ worktree: { enabled: true }, prReview: 'always' }));
    else {
      mkdirSync(path.join(fx.root, 'docs/adr'), { recursive: true });
      writeFileSync(
        path.join(fx.root, 'docs/adr/effective-flow-project-setup.md'),
        setupTable([
          ['worktree.enabled', 'true'],
          ['prReview', 'ask'],
        ]),
      );
    }
    await assert.rejects(acceptQuestion(live, question), error('CONTENT_DRIFT'));
  }
  const fx = fixture(t);
  hiddenSetup(fx);
  mkdirSync(path.join(fx.root, '.effective-flow/plan'));
  writeFileSync(
    path.join(fx.root, '.effective-flow/plan/private.md'),
    '# Private plan\n\n**Plan status:** Not implemented\n',
  );
  fx.input.plan = fx.ref(fx.root, '.effective-flow/plan/private.md');
  const live = await start(fx);
  const { question } = await pause(live);
  writeFileSync(
    path.join(fx.root, '.effective-flow/project-setup.md'),
    setupTable([['visibility', 'hidden']]) + '\nUnrelated explanatory prose.\n',
  );
  assert.equal((await acceptQuestion(live, question)).authority, 'product');
});

test('an unrelated main checkout ADR never becomes the invocation checkout product policy', async (t) => {
  const live = await publishedPlanFixture(t);
  const { question } = await pause(live);
  mkdirSync(path.join(live.root, 'docs/adr'), { recursive: true });
  writeFileSync(
    path.join(live.root, 'docs/adr/effective-flow-project-setup.md'),
    setupTable([['worktree.enabled', 'false']]),
  );
  assert.equal((await acceptQuestion(live, question)).authority, 'product');
});

test('real normalized provider timestamps are accepted while candidate bodies and unknown metadata stay rejected', async (t) => {
  const live = await publishedPlanFixture(t);
  const original = JSON.parse(
    readFileSync(
      path.join(live.planContinuation.discovery.root, live.planContinuation.discovery.path),
    ),
  );
  for (const extra of [{ body: 'Untrusted PR body' }, { approval: true }]) {
    const discovery = durable(
      live,
      Object.hasOwn(extra, 'body') ? 'body.json' : 'unknown.json',
      JSON.stringify({
        ...original,
        data: { ...original.data, result: [{ ...original.data.result[0], ...extra }] },
      }),
    );
    await assert.rejects(
      authorizePlan(live, { ...live.planContinuation, discovery }),
      error('INVALID_PAYLOAD'),
    );
  }
  await authorizePlan(live);
});

test('removed invocation and delivery worktrees retain runtime-only policy while fresh global hidden selection invalidates it', async (t) => {
  const base = await publishedPlanFixture(t);
  const authorization = await authorizePlan(base);
  git(base.root, 'worktree', 'add', base.target, 'published-plan');
  const execution = {
    executionRoot: base.target,
    branch: 'published-plan',
    head: base.head,
    origin: 'effective-flow-created',
    owner: 'build',
  };
  const ownership = lifecycleFixture(base, base.target, 'published-plan', base.fetchedHead);
  await base.call('transition-execution', {
    ...base.common,
    agentHandle: 'original-child-handle',
    authorization,
    execution,
    ownership,
  });
  const live = { ...base, executionRoot: base.target };
  const evidence = [durable(live)];
  const gates = [];
  for (const gate of ['independent-review', 'final-validation'])
    gates.push(await issue(live, gate, evidence));
  const prepared = await live.call('prepare-completion', {
    ...live.common,
    preparationId: 'removed-origin',
    agentHandle: 'original-child-handle',
    gates,
  });
  mkdirSync(path.join(live.target, 'archive'));
  writeFileSync(
    path.join(live.target, 'published-plan.md'),
    readFileSync(path.join(live.target, 'published-plan.md'), 'utf8').replace(
      'Not implemented',
      'Implemented',
    ) + '\n## Build completion\n\nComplete.\n',
  );
  git(live.target, 'mv', 'published-plan.md', 'archive/published-plan.md');
  git(live.target, 'add', '-A');
  const seal = await live.call('seal-delivery', {
    ...live.common,
    agentHandle: 'original-child-handle',
    sealId: 'removed-origin',
    basis: prepared,
    finalPlan: live.ref(live.target, 'archive/published-plan.md'),
    expectedTree: git(live.target, 'write-tree'),
    judgments: [],
  });
  git(live.target, 'commit', '-m', 'archive published plan');
  const finalPlan = gitRef(live, 'archive/published-plan.md');
  await live.call('handoff', {
    ...live.common,
    agentHandle: 'original-child-handle',
    seal,
    head: finalPlan.commit,
    finalPlan,
  });
  git(live.root, 'worktree', 'remove', live.target);
  rmSync(path.join(ownership.root, ownership.path));
  rmSync(path.join(live.harness, 'published-plan.md'));
  git(live.root, 'worktree', 'remove', live.harness);
  mkdirSync(path.join(live.root, 'docs/adr'), { recursive: true });
  writeFileSync(
    path.join(live.root, 'docs/adr/effective-flow-project-setup.md'),
    setupTable([['worktree.enabled', 'false']]),
  );
  const checkpoint = await live.call('checkpoint', {
    ...live.common,
    checkpointId: 'removed-origin',
    agentHandle: 'original-child-handle',
    completed: ['independent-review', 'final-validation'],
    pending: REQUIRED_GATES.filter(
      (gate) => !['independent-review', 'final-validation'].includes(gate),
    ),
    evidence: gates,
  });
  const question = await live.call('question', {
    ...live.common,
    checkpoint,
    agentHandle: 'original-child-handle',
    questionId: 'removed-origin',
    revision: 1,
    origin: 'completion-recovery',
    question: 'Retain the result?',
    options: ['Retain locally', 'Stop'],
    responseType: 'option',
  });
  assert.equal((await acceptQuestion(live, question)).authority, 'runtime-only');
  hiddenSetup(live);
  await assert.rejects(
    live.call('checkpoint', {
      ...live.common,
      checkpointId: 'changed-runtime-policy',
      agentHandle: 'original-child-handle',
      completed: ['independent-review', 'final-validation'],
      pending: REQUIRED_GATES.filter(
        (gate) => !['independent-review', 'final-validation'].includes(gate),
      ),
      evidence: gates,
    }),
    error('CONTENT_DRIFT'),
  );
});
